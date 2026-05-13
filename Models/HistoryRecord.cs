namespace MicuPainter.Models;

public class HistoryRecord
{
    public long Id { get; set; }
    public long Timestamp { get; set; }
    public string Mode { get; set; } = string.Empty;
    public string? Model { get; set; }
    public string? Prompt { get; set; }
    public string? NegativePrompt { get; set; }
    public string? Size { get; set; }
    public string? Quality { get; set; }
    public string? Style { get; set; }
    public int N { get; set; } = 1;
    public string Status { get; set; } = string.Empty;
    public string? ErrorMessage { get; set; }
    public string? RequestJson { get; set; }
    public string? ResponseJson { get; set; }
    public int? DurationMs { get; set; }
    public string? TextOut { get; set; }
    public string? Reasoning { get; set; }
    public string? Aspect { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsFavorite { get; set; }
}

public class HistoryFilter
{
    public string? Keyword { get; set; }
    public string? Mode { get; set; }
    public string? Status { get; set; }
    public string? Model { get; set; }
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;
    public string? SortBy { get; set; } = "timestamp";
    public bool SortDesc { get; set; } = true;
}

public class HistoryStatistics
{
    public int TotalEntries { get; set; }
    public int SuccessCount { get; set; }
    public int FailedCount { get; set; }
    public double SuccessRate => TotalEntries > 0 ? (double)SuccessCount / TotalEntries : 0;
    public Dictionary<string, int> ModeDistribution { get; set; } = new();
    public Dictionary<string, int> ModelDistribution { get; set; } = new();
    public long TotalStorageBytes { get; set; }
    public int TotalImageCount { get; set; }
}
