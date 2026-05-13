using System.IO;
using Microsoft.Data.Sqlite;
using Dapper;
using MicuPainter.Models;

namespace MicuPainter.Services;

public class DatabaseService
{
    private readonly string _dbPath;
    private readonly string _connectionString;

    public DatabaseService(string? appDataDir = null)
    {
        appDataDir ??= Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MicuPainter");

        Directory.CreateDirectory(appDataDir);
        Directory.CreateDirectory(Path.Combine(appDataDir, "images"));
        Directory.CreateDirectory(Path.Combine(appDataDir, "thumbnails"));
        Directory.CreateDirectory(Path.Combine(appDataDir, "exports"));
        Directory.CreateDirectory(Path.Combine(appDataDir, "backup"));

        _dbPath = Path.Combine(appDataDir, "micu-painter.db");
        _connectionString = $"Data Source={_dbPath}";
    }

    public string AppDataDir => Path.GetDirectoryName(_dbPath)!;

    public async Task InitializeAsync()
    {
        using var db = new SqliteConnection(_connectionString);
        await db.OpenAsync();

        using var walCmd = db.CreateCommand();
        walCmd.CommandText = "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;";
        await walCmd.ExecuteNonQueryAsync();

        var sql = @"
CREATE TABLE IF NOT EXISTS api_profiles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    base_url    TEXT,
    api_key     TEXT,
    model       TEXT,
    reasoning   TEXT,
    mode        TEXT NOT NULL DEFAULT 'images',
    size        TEXT DEFAULT '1024x1024',
    n           INTEGER DEFAULT 1,
    quality     TEXT,
    style       TEXT,
    aspect      TEXT,
    negative    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       INTEGER NOT NULL,
    mode            TEXT NOT NULL DEFAULT 'images',
    model           TEXT,
    prompt          TEXT,
    negative_prompt TEXT,
    size            TEXT,
    quality         TEXT,
    style           TEXT,
    n               INTEGER DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'done',
    error_message   TEXT,
    request_json    TEXT,
    response_json   TEXT,
    duration_ms     INTEGER,
    text_out        TEXT,
    reasoning       TEXT,
    aspect          TEXT,
    is_favorite     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS images (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id      INTEGER NOT NULL,
    remote_url      TEXT,
    local_path      TEXT,
    thumbnail_path  TEXT,
    sha256_hash     TEXT,
    width           INTEGER DEFAULT 0,
    height          INTEGER DEFAULT 0,
    format          TEXT,
    file_size       INTEGER DEFAULT 0,
    sort_order      INTEGER DEFAULT 0,
    is_favorite     INTEGER NOT NULL DEFAULT 0,
    is_downloaded   INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (history_id) REFERENCES history(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
CREATE INDEX IF NOT EXISTS idx_history_mode ON history(mode);
CREATE INDEX IF NOT EXISTS idx_history_status ON history(status);
CREATE INDEX IF NOT EXISTS idx_history_model ON history(model);
CREATE INDEX IF NOT EXISTS idx_history_favorite ON history(is_favorite);
CREATE INDEX IF NOT EXISTS idx_images_history_id ON images(history_id);
CREATE INDEX IF NOT EXISTS idx_images_hash ON images(sha256_hash);

CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
    prompt,
    negative_prompt,
    content='history',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS history_ai AFTER INSERT ON history BEGIN
    INSERT INTO history_fts(rowid, prompt, negative_prompt)
    VALUES (new.id, new.prompt, new.negative_prompt);
END;

CREATE TRIGGER IF NOT EXISTS history_ad AFTER DELETE ON history BEGIN
    INSERT INTO history_fts(history_fts, rowid, prompt, negative_prompt)
    VALUES ('delete', old.id, old.prompt, old.negative_prompt);
END;

CREATE TRIGGER IF NOT EXISTS history_au AFTER UPDATE ON history BEGIN
    INSERT INTO history_fts(history_fts, rowid, prompt, negative_prompt)
    VALUES ('delete', old.id, old.prompt, old.negative_prompt);
    INSERT INTO history_fts(rowid, prompt, negative_prompt)
    VALUES (new.id, new.prompt, new.negative_prompt);
END;

CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT
);
";
        using var cmd = db.CreateCommand();
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<long> SaveHistoryAsync(HistoryRecord record, List<string>? imageUrls = null)
    {
        using var db = new SqliteConnection(_connectionString);

        var sql = @"
INSERT INTO history (timestamp, mode, model, prompt, negative_prompt, size, quality, style,
    n, status, error_message, request_json, response_json, duration_ms, text_out, reasoning, aspect)
VALUES (@Timestamp, @Mode, @Model, @Prompt, @NegativePrompt, @Size, @Quality, @Style,
    @N, @Status, @ErrorMessage, @RequestJson, @ResponseJson, @DurationMs, @TextOut, @Reasoning, @Aspect);
SELECT last_insert_rowid();";

        var historyId = await db.ExecuteScalarAsync<long>(sql, record);

        if (imageUrls is { Count: > 0 })
        {
            var imgSql = @"
INSERT INTO images (history_id, remote_url, sort_order)
VALUES (@HistoryId, @RemoteUrl, @SortOrder)";

            for (int i = 0; i < imageUrls.Count; i++)
            {
                await db.ExecuteAsync(imgSql, new
                {
                    HistoryId = historyId,
                    RemoteUrl = imageUrls[i],
                    SortOrder = i
                });
            }
        }

        return historyId;
    }

    public async Task<List<HistoryRecord>> QueryHistoryAsync(HistoryFilter filter)
    {
        using var db = new SqliteConnection(_connectionString);

        var conditions = new List<string>();
        var parameters = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(filter.Keyword))
        {
            conditions.Add("(h.prompt LIKE @Keyword OR h.model LIKE @Keyword OR h.error_message LIKE @Keyword OR h.text_out LIKE @Keyword)");
            parameters.Add("Keyword", $"%{filter.Keyword}%");
        }
        if (!string.IsNullOrWhiteSpace(filter.Mode))
        {
            conditions.Add("h.mode = @Mode");
            parameters.Add("Mode", filter.Mode);
        }
        if (!string.IsNullOrWhiteSpace(filter.Status))
        {
            conditions.Add("h.status = @Status");
            parameters.Add("Status", filter.Status);
        }
        if (!string.IsNullOrWhiteSpace(filter.Model))
        {
            conditions.Add("h.model = @Model");
            parameters.Add("Model", filter.Model);
        }
        if (filter.DateFrom.HasValue)
        {
            conditions.Add("h.timestamp >= @DateFrom");
            parameters.Add("DateFrom", new DateTimeOffset(filter.DateFrom.Value).ToUnixTimeMilliseconds());
        }
        if (filter.DateTo.HasValue)
        {
            conditions.Add("h.timestamp <= @DateTo");
            parameters.Add("DateTo", new DateTimeOffset(filter.DateTo.Value).ToUnixTimeMilliseconds());
        }

        var where = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions) : "";
        var orderBy = filter.SortDesc ? "DESC" : "ASC";
        var offset = (filter.Page - 1) * filter.PageSize;

        var sql = $@"
SELECT h.* FROM history h
{where}
ORDER BY h.{filter.SortBy ?? "timestamp"} {orderBy}
LIMIT @PageSize OFFSET @Offset";

        parameters.Add("PageSize", filter.PageSize);
        parameters.Add("Offset", offset);

        var records = await db.QueryAsync<HistoryRecord>(sql, parameters);
        return records.AsList();
    }

    public async Task<HistoryRecord?> GetHistoryByIdAsync(long id)
    {
        using var db = new SqliteConnection(_connectionString);
        return await db.QueryFirstOrDefaultAsync<HistoryRecord>(
            "SELECT * FROM history WHERE id = @Id", new { Id = id });
    }

    public async Task DeleteHistoryAsync(long id)
    {
        using var db = new SqliteConnection(_connectionString);
        await db.ExecuteAsync("DELETE FROM history WHERE id = @Id", new { Id = id });
    }

    public async Task<List<ImageRecord>> GetImagesByHistoryIdAsync(long historyId)
    {
        using var db = new SqliteConnection(_connectionString);
        var images = await db.QueryAsync<ImageRecord>(
            "SELECT * FROM images WHERE history_id = @HistoryId ORDER BY sort_order",
            new { HistoryId = historyId });
        return images.AsList();
    }

    public async Task UpdateImageDownloadAsync(long imageId, string localPath, string thumbnailPath,
        string sha256Hash, int width, int height, string format, long fileSize)
    {
        using var db = new SqliteConnection(_connectionString);
        await db.ExecuteAsync(@"
UPDATE images SET local_path = @LocalPath, thumbnail_path = @ThumbnailPath,
    sha256_hash = @Sha256Hash, width = @Width, height = @Height,
    format = @Format, file_size = @FileSize, is_downloaded = 1
WHERE id = @Id",
            new { Id = imageId, LocalPath = localPath, ThumbnailPath = thumbnailPath,
                Sha256Hash = sha256Hash, Width = width, Height = height,
                Format = format, FileSize = fileSize });
    }

    public async Task UpdateImageFavoriteAsync(long imageId, bool isFavorite)
    {
        using var db = new SqliteConnection(_connectionString);
        await db.ExecuteAsync(
            "UPDATE images SET is_favorite = @IsFavorite WHERE id = @Id",
            new { Id = imageId, IsFavorite = isFavorite ? 1 : 0 });
    }

    public async Task SetHistoryFavoriteAsync(long id, bool isFavorite)
    {
        using var db = new SqliteConnection(_connectionString);
        await db.ExecuteAsync(
            "UPDATE history SET is_favorite = @IsFavorite WHERE id = @Id",
            new { Id = id, IsFavorite = isFavorite ? 1 : 0 });
    }

    public async Task<List<ImageRecord>> FindDuplicateImagesAsync()
    {
        using var db = new SqliteConnection(_connectionString);
        var images = await db.QueryAsync<ImageRecord>(@"
SELECT * FROM images WHERE sha256_hash IN (
    SELECT sha256_hash FROM images
    WHERE sha256_hash IS NOT NULL
    GROUP BY sha256_hash HAVING COUNT(*) > 1
) ORDER BY sha256_hash, id");
        return images.AsList();
    }

    public async Task<HistoryStatistics> GetStatisticsAsync()
    {
        using var db = new SqliteConnection(_connectionString);
        var stats = new HistoryStatistics();

        stats.TotalEntries = await db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM history");
        stats.SuccessCount = await db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM history WHERE status = 'done'");
        stats.FailedCount = await db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM history WHERE status = 'error'");

        var modes = await db.QueryAsync<(string Mode, int Count)>(
            "SELECT mode, COUNT(*) AS Count FROM history GROUP BY mode");
        foreach (var (mode, count) in modes)
            stats.ModeDistribution[mode] = count;

        var models = await db.QueryAsync<(string Model, int Count)>(
            "SELECT model, COUNT(*) AS Count FROM history WHERE model IS NOT NULL GROUP BY model");
        foreach (var (model, count) in models)
            stats.ModelDistribution[model ?? ""] = count;

        stats.TotalImageCount = await db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM images");
        stats.TotalStorageBytes = await db.ExecuteScalarAsync<long>(
            "SELECT COALESCE(SUM(file_size), 0) FROM images WHERE is_downloaded = 1");

        return stats;
    }

    public async Task<long> GetStorageUsageAsync()
    {
        return await Task.Run(() =>
        {
            long total = 0;
            var dir = new DirectoryInfo(AppDataDir);
            if (dir.Exists)
            {
                foreach (var file in dir.EnumerateFiles("*.*", SearchOption.AllDirectories))
                    total += file.Length;
            }
            return total;
        });
    }

    public async Task<List<ApiProfile>> GetApiProfilesAsync()
    {
        using var db = new SqliteConnection(_connectionString);
        var rows = await db.QueryAsync(
            "SELECT * FROM api_profiles ORDER BY created_at");
        return rows.Select(r => new ApiProfile
        {
            Id = r.id,
            Name = r.name,
            BaseUrl = r.base_url,
            ApiKey = r.api_key,
            Model = r.model,
            Reasoning = r.reasoning,
            Mode = r.mode,
            Size = r.size,
            N = r.n,
            Quality = r.quality,
            Style = r.style,
            Aspect = r.aspect,
            Negative = r.negative
        }).ToList();
    }

    public async Task SaveApiProfileAsync(ApiProfile profile)
    {
        using var db = new SqliteConnection(_connectionString);
        await db.ExecuteAsync(@"
INSERT INTO api_profiles (id, name, base_url, api_key, model, reasoning, mode, size, n, quality, style, aspect, negative, updated_at)
VALUES (@Id, @Name, @BaseUrl, @ApiKey, @Model, @Reasoning, @Mode, @Size, @N, @Quality, @Style, @Aspect, @Negative, datetime('now'))
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, base_url=excluded.base_url, api_key=excluded.api_key,
    model=excluded.model, reasoning=excluded.reasoning, mode=excluded.mode,
    size=excluded.size, n=excluded.n, quality=excluded.quality, style=excluded.style,
    aspect=excluded.aspect, negative=excluded.negative, updated_at=datetime('now')",
            profile);
    }

    public async Task DeleteApiProfileAsync(string id)
    {
        using var db = new SqliteConnection(_connectionString);
        await db.ExecuteAsync("DELETE FROM api_profiles WHERE id = @Id", new { Id = id });
    }

    public async Task<string?> GetAppConfigAsync(string key)
    {
        using var db = new SqliteConnection(_connectionString);
        return await db.QueryFirstOrDefaultAsync<string>(
            "SELECT value FROM app_config WHERE key = @Key", new { Key = key });
    }

    public async Task SetAppConfigAsync(string key, string value)
    {
        using var db = new SqliteConnection(_connectionString);
        await db.ExecuteAsync(@"
INSERT INTO app_config (key, value) VALUES (@Key, @Value)
ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            new { Key = key, Value = value });
    }

    public async Task CleanupOrphanImagesAsync()
    {
        using var db = new SqliteConnection(_connectionString);
        await db.ExecuteAsync(@"
DELETE FROM images WHERE history_id NOT IN (SELECT id FROM history)");
    }

    public async Task CompactDatabaseAsync()
    {
        using var db = new SqliteConnection(_connectionString);
        await db.ExecuteAsync("PRAGMA optimize; VACUUM;");
    }
}
