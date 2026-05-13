using System.Diagnostics;
using System.IO;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using MicuPainter.Models;
using MicuPainter.Services;

namespace MicuPainter.Bridge;

public class BridgeRouter
{
    private readonly DatabaseService _db;
    private readonly ImageService _imageService;
    private readonly ConfigService _configService;
    private readonly CoreWebView2 _webView;
    private readonly bool _isDebug;
    private readonly Dictionary<string, Func<JsonElement?, Task<object?>>> _handlers;

    private static readonly JsonSerializerOptions _jsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private const string AppVersion = "2.9.2";

    public BridgeRouter(DatabaseService db, ImageService imageService, ConfigService configService,
        CoreWebView2 webView, bool isDebug = false)
    {
        _db = db;
        _imageService = imageService;
        _configService = configService;
        _webView = webView;
        _isDebug = isDebug;

        _handlers = new()
        {
            ["app.ping"] = HandlePing,
            ["history.save"] = HandleHistorySave,
            ["history.query"] = HandleHistoryQuery,
            ["history.getById"] = HandleHistoryGetById,
            ["history.delete"] = HandleHistoryDelete,
            ["history.deleteMany"] = HandleHistoryDeleteMany,
            ["history.favorite"] = HandleHistoryFavorite,
            ["image.export"] = HandleImageExport,
            ["settings.get"] = HandleSettingsGet,
            ["settings.set"] = HandleSettingsSet,
            ["dialog.pickFolder"] = HandlePickFolder,
            ["file.showInExplorer"] = HandleShowInExplorer,
            ["clipboard.writeText"] = HandleClipboardWriteText,
        };
    }

    public async Task HandleMessageAsync(string rawJson)
    {
        BridgeRequest? req = null;
        try
        {
            req = JsonSerializer.Deserialize<BridgeRequest>(rawJson, _jsonOpts);
        }
        catch (Exception ex)
        {
            await PostErrorAsync("", BridgeErrorCode.ValidationError, "消息解析失败: " + ex.Message);
            return;
        }

        if (req == null || string.IsNullOrEmpty(req.Id))
        {
            await PostErrorAsync(req?.Id ?? "", BridgeErrorCode.ValidationError, "请求 ID 不能为空");
            return;
        }

        try
        {
            if (!_handlers.TryGetValue(req.Method, out var handler))
            {
                await PostErrorAsync(req.Id, BridgeErrorCode.MethodNotFound,
                    $"未知方法: {req.Method}");
                return;
            }

            var result = await handler(req.Params);
            await PostResponseAsync(req.Id, result);
        }
        catch (Exception ex)
        {
            var (code, msg) = MapException(ex);
            var err = new BridgeErrorDetail
            {
                Code = code,
                Message = msg,
                Stack = _isDebug ? ex.StackTrace : null
            };
            await PostErrorAsync(req.Id, code, msg, _isDebug ? ex.StackTrace : null);
        }
    }

    private Task PostResponseAsync(string id, object? result)
    {
        var resp = new BridgeResponse { Id = id, Ok = true, Result = result };
        var json = JsonSerializer.Serialize(resp, _jsonOpts);
        _webView.PostWebMessageAsString(json);
        return Task.CompletedTask;
    }

    private Task PostErrorAsync(string id, string code, string message, string? stack = null)
    {
        var resp = new BridgeErrorResponse
        {
            Id = id,
            Ok = false,
            Error = new BridgeErrorDetail { Code = code, Message = message, Stack = stack }
        };
        var json = JsonSerializer.Serialize(resp, _jsonOpts);
        _webView.PostWebMessageAsString(json);
        return Task.CompletedTask;
    }

    private Task PostEventAsync(string name, object? payload)
    {
        var evt = new BridgeEvent { Name = name, Payload = payload };
        var json = JsonSerializer.Serialize(evt, _jsonOpts);
        _webView.PostWebMessageAsString(json);
        return Task.CompletedTask;
    }

    private static (string code, string msg) MapException(Exception ex)
    {
        return ex switch
        {
            ArgumentException or FormatException => (BridgeErrorCode.ValidationError, ex.Message),
            InvalidOperationException when ex.Message.Contains("数据库") => (BridgeErrorCode.DbError, ex.Message),
            InvalidOperationException when ex.Message.Contains("文件") || ex.Message.Contains("路径") => (BridgeErrorCode.IoError, ex.Message),
            IOException => (BridgeErrorCode.IoError, ex.Message),
            UnauthorizedAccessException => (BridgeErrorCode.IoError, "文件访问被拒绝: " + ex.Message),
            OperationCanceledException => (BridgeErrorCode.Timeout, "操作已取消"),
            _ => (BridgeErrorCode.UnknownError, ex.Message)
        };
    }

    private string FilePathToUrl(string? path)
    {
        if (string.IsNullOrEmpty(path) || !File.Exists(path))
            return string.Empty;
        return new Uri(path).AbsoluteUri;
    }

    private void ValidatePath(string path)
    {
        var normalized = Path.GetFullPath(path);
        if (normalized.Contains(".."))
            throw new ArgumentException("路径穿越不被允许");
    }

    // ============ Handlers ============

    private Task<object?> HandlePing(JsonElement? _)
    {
        return Task.FromResult<object?>(new
        {
            version = AppVersion,
            capabilities = new
            {
                sqlite = true,
                fileSystem = true,
                dialog = true,
                clipboard = true,
                imageProcessing = true
            }
        });
    }

    private async Task<object?> HandleHistorySave(JsonElement? p)
    {
        if (p == null) throw new ArgumentException("缺少请求参数");

        var record = new HistoryRecord
        {
            Timestamp = GetLongProp(p.Value, "timestamp") ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Mode = GetStrProp(p.Value, "mode") ?? "images",
            Model = GetStrProp(p.Value, "model"),
            Prompt = GetStrProp(p.Value, "prompt"),
            NegativePrompt = GetStrProp(p.Value, "negative"),
            Size = GetStrProp(p.Value, "size"),
            Quality = GetStrProp(p.Value, "quality"),
            Style = GetStrProp(p.Value, "style"),
            N = GetIntProp(p.Value, "n") ?? 1,
            Status = GetStrProp(p.Value, "status") ?? "done",
            ErrorMessage = GetStrProp(p.Value, "errorMsg"),
            RequestJson = GetRawProp(p.Value, "request"),
            ResponseJson = GetRawProp(p.Value, "response"),
            DurationMs = GetIntProp(p.Value, "durationMs"),
            TextOut = GetStrProp(p.Value, "textOut"),
            Reasoning = GetStrProp(p.Value, "reasoning"),
            Aspect = GetStrProp(p.Value, "aspect"),
            IsFavorite = GetBoolProp(p.Value, "isFavorite") ?? false
        };

        var imageUrls = new List<string>();
        if (p.Value.TryGetProperty("imageUrls", out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var url in arr.EnumerateArray())
            {
                var s = url.GetString();
                if (!string.IsNullOrWhiteSpace(s)) imageUrls.Add(s);
            }
        }

        var historyId = await _db.SaveHistoryAsync(record, imageUrls);

        var savedCount = 0;
        var failedCount = 0;

        if (imageUrls.Count > 0)
        {
            var images = await _db.GetImagesByHistoryIdAsync(historyId);
            for (int i = 0; i < images.Count && i < imageUrls.Count; i++)
            {
                try
                {
                    var url = imageUrls[i];
                    string localPath, thumbPath;
                    int width, height;
                    string format;
                    long fileSize;

                    if (url.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                    {
                        (localPath, thumbPath, width, height, format, fileSize) =
                            await _imageService.SaveDataUrlAsync(url);
                    }
                    else
                    {
                        localPath = await _imageService.DownloadImageAsync(url);
                        (thumbPath, width, height, format, fileSize) =
                            await _imageService.GenerateThumbnailAsync(localPath);
                    }

                    var sha256Hash = Path.GetFileNameWithoutExtension(localPath);
                    await _db.UpdateImageDownloadAsync(images[i].Id, localPath, thumbPath,
                        sha256Hash, width, height, format, fileSize);
                    savedCount++;
                }
                catch
                {
                    failedCount++;
                }
            }
        }

        await PostEventAsync("history.saved", new { historyId, savedCount, failedCount });

        return new
        {
            historyId,
            savedCount,
            failedCount
        };
    }

    private async Task<object?> HandleHistoryQuery(JsonElement? p)
    {
        var filter = new HistoryFilter
        {
            Page = GetIntProp(p, "page") ?? 1,
            PageSize = GetIntProp(p, "pageSize") ?? 50,
            SortBy = GetStrProp(p, "sortBy") ?? "timestamp",
            SortDesc = GetBoolProp(p, "sortDesc") ?? true,
            Keyword = GetStrProp(p, "keyword"),
            Mode = GetStrProp(p, "mode"),
            Status = GetStrProp(p, "status"),
            Model = GetStrProp(p, "model"),
            DateFrom = GetDateTimeProp(p, "dateFrom"),
            DateTo = GetDateTimeProp(p, "dateTo"),
        };

        var entries = await _db.QueryHistoryAsync(filter);

        var items = new List<object>();
        foreach (var e in entries)
        {
            var images = await _db.GetImagesByHistoryIdAsync(e.Id);
            var firstImage = images.FirstOrDefault();
            items.Add(new
            {
                e.Id,
                e.Timestamp,
                e.Prompt,
                e.Model,
                e.Status,
                imageCount = images.Count,
                thumbUrl = FilePathToUrl(firstImage?.ThumbnailPath ?? firstImage?.LocalPath),
                fullUrl = FilePathToUrl(firstImage?.LocalPath),
                e.IsFavorite,
                e.Mode
            });
        }

        var total = await CountHistoryAsync(filter);
        var hasMore = (filter.Page * filter.PageSize) < total;

        return new { total, items, hasMore };
    }

    private async Task<int> CountHistoryAsync(HistoryFilter filter)
    {
        filter.PageSize = int.MaxValue;
        var all = await _db.QueryHistoryAsync(filter);
        return all.Count;
    }

    private async Task<object?> HandleHistoryGetById(JsonElement? p)
    {
        var id = GetLongProp(p, "id")
            ?? throw new ArgumentException("缺少 id 参数");

        var entry = await _db.GetHistoryByIdAsync(id);
        if (entry == null)
            throw new InvalidOperationException("记录不存在");

        var images = await _db.GetImagesByHistoryIdAsync(id);

        return new
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
            request = entry.RequestJson,
            response = entry.ResponseJson,
            entry.TextOut,
            entry.Reasoning,
            entry.Aspect,
            entry.DurationMs,
            entry.IsFavorite,
            hits = images.Select(img => new
            {
                url = img.RemoteUrl,
                localUrl = FilePathToUrl(img.LocalPath),
                thumbnailUrl = FilePathToUrl(img.ThumbnailPath),
                localPath = img.LocalPath,
                thumbnailPath = img.ThumbnailPath,
                img.Width,
                img.Height,
                img.Format,
                img.FileSize,
                img.IsFavorite
            }).ToList()
        };
    }

    private async Task<object?> HandleHistoryDelete(JsonElement? p)
    {
        var id = GetLongProp(p, "id")
            ?? throw new ArgumentException("缺少 id 参数");

        var images = await _db.GetImagesByHistoryIdAsync(id);
        foreach (var img in images)
            _imageService.DeleteImageFiles(img.LocalPath, img.ThumbnailPath);

        await _db.DeleteHistoryAsync(id);

        await PostEventAsync("history.deleted", new { id });
        return new { ok = true };
    }

    private async Task<object?> HandleHistoryDeleteMany(JsonElement? p)
    {
        if (p == null || !p.Value.TryGetProperty("ids", out var idsEl) || idsEl.ValueKind != JsonValueKind.Array)
            throw new ArgumentException("缺少 ids 参数");

        var deleted = 0;
        foreach (var idEl in idsEl.EnumerateArray())
        {
            if (!idEl.TryGetInt64(out var id)) continue;
            var images = await _db.GetImagesByHistoryIdAsync(id);
            foreach (var img in images)
                _imageService.DeleteImageFiles(img.LocalPath, img.ThumbnailPath);
            await _db.DeleteHistoryAsync(id);
            deleted++;
        }

        await PostEventAsync("history.deletedMany", new { count = deleted });
        return new { ok = true, deletedCount = deleted };
    }

    private async Task<object?> HandleHistoryFavorite(JsonElement? p)
    {
        var id = GetLongProp(p, "id")
            ?? throw new ArgumentException("缺少 id 参数");
        var isFav = GetBoolProp(p, "isFavorite") ?? false;

        await _db.SetHistoryFavoriteAsync(id, isFav);

        return new { ok = true };
    }

    private async Task<object?> HandleImageExport(JsonElement? p)
    {
        if (p == null || !p.Value.TryGetProperty("ids", out var idsEl) || idsEl.ValueKind != JsonValueKind.Array)
            throw new ArgumentException("缺少 ids 参数");

        var hasTargetDir = p.Value.TryGetProperty("targetDir", out var dirEl);
        var targetDir = hasTargetDir && dirEl.ValueKind == JsonValueKind.String
            ? dirEl.GetString()!
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "米醋画图-导出");

        ValidatePath(targetDir);
        Directory.CreateDirectory(targetDir);

        var ids = idsEl.EnumerateArray()
            .Where(x => x.TryGetInt64(out _))
            .Select(x => x.GetInt64())
            .ToArray();

        var msg = await _imageService.ExportImagesAsync(ids, targetDir, _db);
        var exported = ids.Length;

        await PostEventAsync("image.exported", new { count = exported, targetDir });
        return new { exportedCount = exported, message = msg, targetDir };
    }

    private async Task<object?> HandleSettingsGet(JsonElement? p)
    {
        var key = GetStrProp(p, "key") ?? "all";

        if (key == "all")
        {
            var theme = await _db.GetAppConfigAsync("theme");
            var lastProfile = await _db.GetAppConfigAsync("last_profile_id");
            var autoDownload = await _db.GetAppConfigAsync("auto_download_images");
            var maxHistory = await _db.GetAppConfigAsync("max_history_entries");
            var exportDir = await _db.GetAppConfigAsync("export_directory");

            return new
            {
                theme = theme ?? "light",
                lastProfileId = lastProfile,
                autoDownloadImages = autoDownload == "1",
                maxHistoryEntries = maxHistory != null ? int.Parse(maxHistory) : 50,
                exportDirectory = exportDir
            };
        }

        var value = await _db.GetAppConfigAsync(key);
        return new { key, value };
    }

    private async Task<object?> HandleSettingsSet(JsonElement? p)
    {
        if (p == null) throw new ArgumentException("缺少参数");

        if (p.Value.TryGetProperty("key", out var keyEl) && p.Value.TryGetProperty("value", out var valEl))
        {
            await _db.SetAppConfigAsync(keyEl.GetString()!, valEl.GetString()!);
            return new { ok = true };
        }

        if (p.Value.TryGetProperty("theme", out var themeEl))
        {
            await _configService.SetThemeAsync(themeEl.GetString()!);
        }
        if (p.Value.TryGetProperty("autoDownloadImages", out var adEl))
        {
            await _configService.SetAutoDownloadImagesAsync(adEl.GetBoolean());
        }
        if (p.Value.TryGetProperty("exportDirectory", out var edEl))
        {
            await _configService.SetExportDirectoryAsync(edEl.GetString());
        }

        return new { ok = true };
    }

    private Task<object?> HandlePickFolder(JsonElement? _)
    {
        var folder = PickFolderDialog();
        return Task.FromResult<object?>(new { path = folder });
    }

    private Task<object?> HandleShowInExplorer(JsonElement? p)
    {
        var path = GetStrProp(p, "path");
        if (string.IsNullOrEmpty(path))
            throw new ArgumentException("缺少 path 参数");

        ValidatePath(path);

        if (File.Exists(path))
        {
            Process.Start("explorer.exe", $"/select,\"{path}\"");
        }
        else if (Directory.Exists(path))
        {
            Process.Start("explorer.exe", path);
        }
        else
        {
            throw new InvalidOperationException("路径不存在");
        }

        return Task.FromResult<object?>(new { ok = true });
    }

    private Task<object?> HandleClipboardWriteText(JsonElement? p)
    {
        var text = GetStrProp(p, "text");
        if (string.IsNullOrEmpty(text))
            throw new ArgumentException("缺少 text 参数");

        System.Windows.Clipboard.SetText(text);
        return Task.FromResult<object?>(new { ok = true });
    }

    private string? PickFolderDialog()
    {
        var dialog = new Microsoft.Win32.OpenFolderDialog
        {
            Title = "选择导出目录",
            Multiselect = false
        };

        var result = dialog.ShowDialog();
        return result == true ? dialog.FolderName : null;
    }

    // ============ JSON helpers ============

    private static string? GetStrProp(JsonElement? el, string name)
    {
        if (el == null) return null;
        return el.Value.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    }

    private static long? GetLongProp(JsonElement? el, string name)
    {
        if (el == null) return null;
        if (el.Value.TryGetProperty(name, out var p))
        {
            if (p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var v64)) return v64;
            if (p.ValueKind == JsonValueKind.String && long.TryParse(p.GetString(), out var vs)) return vs;
        }
        return null;
    }

    private static int? GetIntProp(JsonElement? el, string name)
    {
        if (el == null) return null;
        if (el.Value.TryGetProperty(name, out var p))
        {
            if (p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var v32)) return v32;
            if (p.ValueKind == JsonValueKind.String && int.TryParse(p.GetString(), out var vs)) return vs;
        }
        return null;
    }

    private static bool? GetBoolProp(JsonElement? el, string name)
    {
        if (el == null) return null;
        if (el.Value.TryGetProperty(name, out var p))
        {
            if (p.ValueKind == JsonValueKind.True) return true;
            if (p.ValueKind == JsonValueKind.False) return false;
        }
        return null;
    }

    private static DateTime? GetDateTimeProp(JsonElement? el, string name)
    {
        if (el == null) return null;
        if (el.Value.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var ms))
        {
            return DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime;
        }
        return null;
    }

    private static string? GetRawProp(JsonElement? el, string name)
    {
        if (el == null) return null;
        return el.Value.TryGetProperty(name, out var p) ? p.GetRawText() : null;
    }
}

internal static class JsonElementExtensions
{
    public static JsonElement? GetPropertySafe(this JsonElement el, string name)
    {
        return el.TryGetProperty(name, out var p) ? p : null;
    }
}
