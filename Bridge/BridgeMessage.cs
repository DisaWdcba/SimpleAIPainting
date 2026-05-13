using System.Text.Json;

namespace MicuPainter.Bridge;

public class BridgeRequest
{
    public string Id { get; set; } = string.Empty;
    public string Method { get; set; } = string.Empty;
    public JsonElement? Params { get; set; }
    public int Version { get; set; } = 1;
}

public class BridgeResponse
{
    public string Id { get; set; } = string.Empty;
    public bool Ok { get; set; } = true;
    public object? Result { get; set; }
}

public class BridgeErrorResponse
{
    public string Id { get; set; } = string.Empty;
    public bool Ok { get; set; } = false;
    public BridgeErrorDetail Error { get; set; } = null!;
}

public class BridgeErrorDetail
{
    public string Code { get; set; } = "UNKNOWN_ERROR";
    public string Message { get; set; } = string.Empty;
    public string? Stack { get; set; }
}

public class BridgeEvent
{
    public string Type { get; set; } = "event";
    public string Name { get; set; } = string.Empty;
    public object? Payload { get; set; }
}

public static class BridgeErrorCode
{
    public const string BridgeUnavailable = "BRIDGE_UNAVAILABLE";
    public const string MethodNotFound = "METHOD_NOT_FOUND";
    public const string ValidationError = "VALIDATION_ERROR";
    public const string DbError = "DB_ERROR";
    public const string IoError = "IO_ERROR";
    public const string UnknownError = "UNKNOWN_ERROR";
    public const string Timeout = "TIMEOUT";
}
