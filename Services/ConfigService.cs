using System.Text.Json;
using MicuPainter.Models;

namespace MicuPainter.Services;

public class ConfigService
{
    private readonly DatabaseService _db;
    private List<ApiProfile> _profiles = new();
    private AppConfig _config = new();
    private readonly JsonSerializerOptions _jsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public ConfigService(DatabaseService db) => _db = db;

    public async Task LoadAsync()
    {
        _profiles = await _db.GetApiProfilesAsync();

        var theme = await _db.GetAppConfigAsync("theme");
        if (theme != null) _config.Theme = theme;

        var lastProfile = await _db.GetAppConfigAsync("last_profile_id");
        if (lastProfile != null) _config.LastProfileId = lastProfile;

        var sidebarCollapsed = await _db.GetAppConfigAsync("sidebar_collapsed");
        if (sidebarCollapsed != null) _config.SidebarCollapsed = sidebarCollapsed == "1";

        var autoDownload = await _db.GetAppConfigAsync("auto_download_images");
        if (autoDownload != null) _config.AutoDownloadImages = autoDownload == "1";

        var maxHistory = await _db.GetAppConfigAsync("max_history_entries");
        if (maxHistory != null && int.TryParse(maxHistory, out var mh))
            _config.MaxHistoryEntries = mh;

        var exportDir = await _db.GetAppConfigAsync("export_directory");
        if (exportDir != null) _config.ExportDirectory = exportDir;
    }

    public List<ApiProfile> Profiles => _profiles;

    public ApiProfile? GetActiveProfile()
    {
        if (_config.LastProfileId != null)
            return _profiles.FirstOrDefault(p => p.Id == _config.LastProfileId);
        return _profiles.FirstOrDefault();
    }

    public async Task SaveProfileAsync(ApiProfile profile)
    {
        await _db.SaveApiProfileAsync(profile);
        var idx = _profiles.FindIndex(p => p.Id == profile.Id);
        if (idx >= 0) _profiles[idx] = profile;
        else _profiles.Add(profile);
    }

    public async Task DeleteProfileAsync(string id)
    {
        await _db.DeleteApiProfileAsync(id);
        _profiles.RemoveAll(p => p.Id == id);
    }

    public async Task SetActiveProfileAsync(string id)
    {
        _config.LastProfileId = id;
        await _db.SetAppConfigAsync("last_profile_id", id);
    }

    public async Task SetThemeAsync(string theme)
    {
        _config.Theme = theme;
        await _db.SetAppConfigAsync("theme", theme);
    }

    public string Theme => _config.Theme;

    public async Task SetSidebarCollapsedAsync(bool collapsed)
    {
        _config.SidebarCollapsed = collapsed;
        await _db.SetAppConfigAsync("sidebar_collapsed", collapsed ? "1" : "0");
    }

    public bool SidebarCollapsed => _config.SidebarCollapsed;

    public async Task SetAutoDownloadImagesAsync(bool enabled)
    {
        _config.AutoDownloadImages = enabled;
        await _db.SetAppConfigAsync("auto_download_images", enabled ? "1" : "0");
    }

    public bool AutoDownloadImages => _config.AutoDownloadImages;

    public int MaxHistoryEntries => _config.MaxHistoryEntries;

    public string? ExportDirectory => _config.ExportDirectory;

    public async Task SetExportDirectoryAsync(string? dir)
    {
        _config.ExportDirectory = dir;
        if (dir != null)
            await _db.SetAppConfigAsync("export_directory", dir);
    }

    public string GetProfilesJson()
    {
        return JsonSerializer.Serialize(
            _profiles.Select(p => new
            {
                id = p.Id,
                name = p.Name,
                baseurl = p.BaseUrl ?? "",
                key = p.ApiKey ?? "",
                model = p.Model ?? "",
                reasoning = p.Reasoning ?? "",
                mode = p.Mode,
                size = p.Size ?? "1024x1024",
                n = p.N,
                quality = p.Quality ?? "",
                style = p.Style ?? "",
                aspect = p.Aspect ?? "",
                negative = p.Negative ?? ""
            }),
            _jsonOptions);
    }
}
