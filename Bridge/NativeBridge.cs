using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using MicuPainter.Models;
using MicuPainter.Services;

namespace MicuPainter.Bridge;

[ComVisible(true)]
public class NativeBridge
{
    private readonly DatabaseService _db;
    private readonly ImageService _imageService;
    private readonly ConfigService _configService;
    private readonly HttpClient _httpClient;
    private CancellationTokenSource? _downloadCts;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public NativeBridge(DatabaseService db, ImageService imageService, ConfigService configService)
    {
        _db = db;
        _imageService = imageService;
        _configService = configService;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    }

    public string SaveHistory(string jsonPayload)
    {
        try
        {
            var payload = JsonSerializer.Deserialize<JsonElement>(jsonPayload);
            var record = new HistoryRecord
            {
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Mode = payload.TryGetProperty("mode", out var modeEl) ? modeEl.GetString() ?? "images" : "images",
                Model = payload.TryGetProperty("model", out var modelEl) ? modelEl.GetString() : null,
                Prompt = payload.TryGetProperty("prompt", out var promptEl) ? promptEl.GetString() : null,
                NegativePrompt = payload.TryGetProperty("negative", out var negEl) ? negEl.GetString() : null,
                Size = payload.TryGetProperty("size", out var sizeEl) ? sizeEl.GetString() : null,
                Quality = payload.TryGetProperty("quality", out var qEl) ? qEl.GetString() : null,
                Style = payload.TryGetProperty("style", out var styleEl) ? styleEl.GetString() : null,
                N = payload.TryGetProperty("n", out var nEl) && nEl.TryGetInt32(out var n) ? n : 1,
                Status = payload.TryGetProperty("status", out var statusEl) ? statusEl.GetString() ?? "done" : "done",
                ErrorMessage = payload.TryGetProperty("errorMsg", out var errEl) ? errEl.GetString() : null,
                RequestJson = payload.TryGetProperty("request", out var reqEl) ? reqEl.GetRawText() : null,
                ResponseJson = payload.TryGetProperty("response", out var respEl) ? respEl.GetRawText() : null,
                DurationMs = payload.TryGetProperty("durationMs", out var durEl) && durEl.TryGetInt32(out var d) ? d : null,
                TextOut = payload.TryGetProperty("textOut", out var textEl) ? textEl.GetString() : null,
                Reasoning = payload.TryGetProperty("reasoning", out var reEl) ? reEl.GetString() : null,
                Aspect = payload.TryGetProperty("aspect", out var aspEl) ? aspEl.GetString() : null
            };

            List<string>? imageUrls = null;
            if (payload.TryGetProperty("imageUrls", out var urlsEl) && urlsEl.ValueKind == JsonValueKind.Array)
            {
                imageUrls = new List<string>();
                foreach (var url in urlsEl.EnumerateArray())
                {
                    var s = url.GetString();
                    if (!string.IsNullOrWhiteSpace(s)) imageUrls.Add(s);
                }
            }

            var id = _db.SaveHistoryAsync(record, imageUrls).GetAwaiter().GetResult();
            return JsonSerializer.Serialize(new { success = true, id }, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { success = false, error = ex.Message }, _jsonOptions);
        }
    }

    public string QueryHistory(string filterJson)
    {
        try
        {
            var filter = string.IsNullOrWhiteSpace(filterJson)
                ? new HistoryFilter()
                : JsonSerializer.Deserialize<HistoryFilter>(filterJson, _jsonOptions) ?? new HistoryFilter();

            var entries = _db.QueryHistoryAsync(filter).GetAwaiter().GetResult();

            var result = new List<object>();
            foreach (var e in entries)
            {
                var images = _db.GetImagesByHistoryIdAsync(e.Id).GetAwaiter().GetResult();
                result.Add(new
                {
                    e.Id,
                    e.Timestamp,
                    e.Mode,
                    e.Model,
                    e.Prompt,
                    negative = e.NegativePrompt,
                    e.Size,
                    e.Quality,
                    e.Style,
                    n = e.N,
                    e.Status,
                    errorMsg = e.ErrorMessage,
                    e.TextOut,
                    e.Reasoning,
                    e.Aspect,
                    e.DurationMs,
                    hits = images.Select(img => new
                    {
                        url = img.RemoteUrl,
                        dataUrl = string.IsNullOrEmpty(img.ThumbnailPath)
                            ? img.RemoteUrl
                            : img.ThumbnailPath,
                        localPath = img.LocalPath,
                        thumbnailPath = img.ThumbnailPath
                    }).ToList()
                });
            }

            return JsonSerializer.Serialize(result, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { error = ex.Message }, _jsonOptions);
        }
    }

    public string GetHistoryById(long id)
    {
        try
        {
            var entry = _db.GetHistoryByIdAsync(id).GetAwaiter().GetResult();
            if (entry == null)
                return JsonSerializer.Serialize(new { error = "记录不存在" }, _jsonOptions);

            var images = _db.GetImagesByHistoryIdAsync(id).GetAwaiter().GetResult();
            return JsonSerializer.Serialize(new
            {
                entry.Id,
                entry.Timestamp,
                entry.Mode,
                entry.Model,
                entry.Prompt,
                negative = entry.NegativePrompt,
                entry.Size,
                entry.Quality,
                entry.Style,
                n = entry.N,
                entry.Status,
                errorMsg = entry.ErrorMessage,
                entry.TextOut,
                entry.Reasoning,
                entry.Aspect,
                entry.DurationMs,
                hits = images.Select(img => new
                {
                    url = img.RemoteUrl,
                    localPath = img.LocalPath,
                    thumbnailPath = img.ThumbnailPath
                }).ToList()
            }, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { error = ex.Message }, _jsonOptions);
        }
    }

    public string DeleteHistory(long id)
    {
        try
        {
            var images = _db.GetImagesByHistoryIdAsync(id).GetAwaiter().GetResult();
            foreach (var img in images)
                _imageService.DeleteImageFiles(img.LocalPath, img.ThumbnailPath);

            _db.DeleteHistoryAsync(id).GetAwaiter().GetResult();
            return JsonSerializer.Serialize(new { success = true }, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { success = false, error = ex.Message }, _jsonOptions);
        }
    }

    public string DeleteAllHistory()
    {
        try
        {
            var entries = _db.QueryHistoryAsync(new HistoryFilter { PageSize = int.MaxValue }).GetAwaiter().GetResult();
            foreach (var e in entries)
            {
                var images = _db.GetImagesByHistoryIdAsync(e.Id).GetAwaiter().GetResult();
                foreach (var img in images)
                    _imageService.DeleteImageFiles(img.LocalPath, img.ThumbnailPath);
                _db.DeleteHistoryAsync(e.Id).GetAwaiter().GetResult();
            }
            return JsonSerializer.Serialize(new { success = true }, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { success = false, error = ex.Message }, _jsonOptions);
        }
    }

    public string GetApiProfiles()
    {
        return _configService.GetProfilesJson();
    }

    public string SaveApiProfile(string profileJson)
    {
        try
        {
            var p = JsonSerializer.Deserialize<ApiProfile>(profileJson, _jsonOptions);
            if (p == null) return JsonSerializer.Serialize(new { error = "无效的配置数据" }, _jsonOptions);
            _configService.SaveProfileAsync(p).GetAwaiter().GetResult();
            return JsonSerializer.Serialize(new { success = true, id = p.Id }, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { success = false, error = ex.Message }, _jsonOptions);
        }
    }

    public string DeleteApiProfile(string id)
    {
        try
        {
            _configService.DeleteProfileAsync(id).GetAwaiter().GetResult();
            return JsonSerializer.Serialize(new { success = true }, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { success = false, error = ex.Message }, _jsonOptions);
        }
    }

    public string SetActiveProfile(string id)
    {
        try
        {
            _configService.SetActiveProfileAsync(id).GetAwaiter().GetResult();
            return JsonSerializer.Serialize(new { success = true }, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { success = false, error = ex.Message }, _jsonOptions);
        }
    }

    public string GetTheme() => _configService.Theme;

    public string SetTheme(string theme)
    {
        _configService.SetThemeAsync(theme).GetAwaiter().GetResult();
        return "ok";
    }

    public string GetStatistics()
    {
        try
        {
            var stats = _db.GetStatisticsAsync().GetAwaiter().GetResult();
            return JsonSerializer.Serialize(new
            {
                stats.TotalEntries,
                stats.SuccessCount,
                stats.FailedCount,
                successRate = stats.SuccessRate.ToString("P1"),
                stats.ModeDistribution,
                stats.ModelDistribution,
                totalStorageBytes = stats.TotalStorageBytes,
                stats.TotalImageCount
            }, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { error = ex.Message }, _jsonOptions);
        }
    }

    public string DownloadImage(string url)
    {
        try
        {
            _downloadCts ??= new CancellationTokenSource();
            var localPath = _imageService.DownloadImageAsync(url, _downloadCts.Token)
                .GetAwaiter().GetResult();

            var (thumbPath, width, height, format, fileSize) =
                _imageService.GenerateThumbnailAsync(localPath, _downloadCts.Token)
                .GetAwaiter().GetResult();

            return JsonSerializer.Serialize(new
            {
                success = true,
                localPath,
                thumbnailPath = thumbPath,
                width,
                height,
                format,
                fileSize
            }, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new
            {
                success = false,
                error = $"下载失败: {ex.Message}"
            }, _jsonOptions);
        }
    }

    public string ExportImages(string idsJson, string targetDir)
    {
        try
        {
            var ids = JsonSerializer.Deserialize<long[]>(idsJson) ?? Array.Empty<long>();
            var msg = _imageService.ExportImagesAsync(ids, targetDir, _db).GetAwaiter().GetResult();
            return JsonSerializer.Serialize(new { success = true, message = msg }, _jsonOptions);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { success = false, error = ex.Message }, _jsonOptions);
        }
    }

    public string GetAppDataDir()
    {
        return _db.AppDataDir;
    }

    public void CancelDownload()
    {
        _downloadCts?.Cancel();
        _downloadCts = null;
    }
}
