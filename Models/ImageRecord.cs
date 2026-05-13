namespace MicuPainter.Models;

public class ImageRecord
{
    public long Id { get; set; }
    public long HistoryId { get; set; }
    public string? RemoteUrl { get; set; }
    public string? LocalPath { get; set; }
    public string? ThumbnailPath { get; set; }
    public string? Sha256Hash { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public string? Format { get; set; }
    public long FileSize { get; set; }
    public int SortOrder { get; set; }
    public bool IsFavorite { get; set; }
    public bool IsDownloaded { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
