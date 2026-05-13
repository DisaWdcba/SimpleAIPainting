namespace MicuPainter.Models;

public class PromptTemplate
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string? Category { get; set; }
    public int SortOrder { get; set; }
}

public class ApiProfile
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = "OpenAI";
    public string? BaseUrl { get; set; }
    public string? ApiKey { get; set; }
    public string? Model { get; set; }
    public string? Reasoning { get; set; }
    public string Mode { get; set; } = "images";
    public string? Size { get; set; } = "1024x1024";
    public int N { get; set; } = 1;
    public string? Quality { get; set; }
    public string? Style { get; set; }
    public string? Aspect { get; set; }
    public string? Negative { get; set; }
}

public class AppConfig
{
    public string Theme { get; set; } = "light";
    public string? LastProfileId { get; set; }
    public bool SidebarCollapsed { get; set; }
    public bool AutoDownloadImages { get; set; } = true;
    public int MaxHistoryEntries { get; set; } = 50;
    public string? ExportDirectory { get; set; }
}
