using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats.Jpeg;

namespace MicuPainter.Services;

public class ImageService
{
    private readonly string _imageDir;
    private readonly string _thumbnailDir;
    private readonly HttpClient _httpClient;
    private const int MaxRetries = 3;
    private const int ThumbnailSize = 256;
    private const int JpegQuality = 85;

    public ImageService(string appDataDir)
    {
        _imageDir = Path.Combine(appDataDir, "images");
        _thumbnailDir = Path.Combine(appDataDir, "thumbnails");
        Directory.CreateDirectory(_imageDir);
        Directory.CreateDirectory(_thumbnailDir);
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    }

    public async Task<string> DownloadImageAsync(string url, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(url);

        var monthDir = DateTime.Now.ToString("yyyy-MM");
        var imageMonthDir = Path.Combine(_imageDir, monthDir);
        Directory.CreateDirectory(imageMonthDir);

        for (int attempt = 0; attempt < MaxRetries; attempt++)
        {
            try
            {
                if (ct.IsCancellationRequested) throw new OperationCanceledException(ct);

                var response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseContentRead, ct);
                response.EnsureSuccessStatusCode();

                var data = await response.Content.ReadAsByteArrayAsync(ct);
                if (data.Length == 0) throw new InvalidOperationException("下载内容为空");

                var format = DetectImageFormat(data);
                var extension = GetExtension(format);

                using var sha256 = SHA256.Create();
                var hash = Convert.ToHexStringLower(sha256.ComputeHash(data));

                var fileName = $"{hash}.{extension}";
                var filePath = Path.Combine(imageMonthDir, fileName);

                if (!File.Exists(filePath))
                    await File.WriteAllBytesAsync(filePath, data, ct);

                return filePath;
            }
            catch (OperationCanceledException) { throw; }
            catch when (attempt < MaxRetries - 1)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(Math.Pow(2, attempt) * 1000), ct);
            }
        }

        throw new InvalidOperationException($"图片下载失败（重试 {MaxRetries} 次）: {url}");
    }

    public async Task<(string thumbPath, int width, int height, string format, long fileSize)>
        GenerateThumbnailAsync(string imagePath, CancellationToken ct = default)
    {
        var monthDir = DateTime.Now.ToString("yyyy-MM");
        var thumbMonthDir = Path.Combine(_thumbnailDir, monthDir);
        Directory.CreateDirectory(thumbMonthDir);

        var sha256 = SHA256.Create();
        string hash;
        await using (var stream = File.OpenRead(imagePath))
        {
            hash = Convert.ToHexStringLower(sha256.ComputeHash(stream));
        }

        var thumbPath = Path.Combine(thumbMonthDir, $"{hash}_thumb.jpg");

        if (File.Exists(thumbPath))
        {
            using var img = await Image.LoadAsync(imagePath, ct);
            var fi = new FileInfo(imagePath);
            return (thumbPath, img.Width, img.Height, GetFormatName(img), fi.Length);
        }

        using (var image = await Image.LoadAsync(imagePath, ct))
        {
            var width = image.Width;
            var height = image.Height;
            var format = GetFormatName(image);
            var fileSize = new FileInfo(imagePath).Length;

            image.Mutate(x => x.Resize(new ResizeOptions
            {
                Size = new Size(ThumbnailSize, ThumbnailSize),
                Mode = ResizeMode.Max
            }));

            await image.SaveAsJpegAsync(thumbPath, new JpegEncoder { Quality = JpegQuality }, ct);

            return (thumbPath, width, height, format, fileSize);
        }
    }

    public async Task<(string localPath, string thumbPath, int width, int height, string format, long fileSize)>
        SaveDataUrlAsync(string dataUrl, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(dataUrl);

        var match = System.Text.RegularExpressions.Regex.Match(dataUrl,
            @"^data:image/([a-z0-9.+-]+);base64,");
        if (!match.Success)
            throw new ArgumentException("不是有效的 data:image URL");

        var mimeFormat = match.Groups[1].Value;
        var base64 = dataUrl[(match.Index + match.Length)..];
        var data = Convert.FromBase64String(base64);
        if (data.Length == 0) throw new InvalidOperationException("data URL 内容为空");

        var format = DetectImageFormat(data);
        var extension = GetExtension(format);

        using var sha256 = SHA256.Create();
        var hash = Convert.ToHexStringLower(sha256.ComputeHash(data));

        var monthDir = DateTime.Now.ToString("yyyy-MM");
        var imageMonthDir = Path.Combine(_imageDir, monthDir);
        Directory.CreateDirectory(imageMonthDir);

        var fileName = $"{hash}.{extension}";
        var filePath = Path.Combine(imageMonthDir, fileName);

        if (!File.Exists(filePath))
            await File.WriteAllBytesAsync(filePath, data, ct);

        var (thumbPath, width, height, detectedFormat, fileSize) =
            await GenerateThumbnailAsync(filePath, ct);

        return (filePath, thumbPath, width, height, detectedFormat, fileSize);
    }

    public async Task<string> ExportImagesAsync(long[] imageIds, string targetDir, DatabaseService db)
    {
        Directory.CreateDirectory(targetDir);

        var exported = new List<string>();
        foreach (var imageId in imageIds)
        {
            var images = await db.GetImagesByHistoryIdAsync(imageId);
            foreach (var img in images)
            {
                if (img.LocalPath == null || !File.Exists(img.LocalPath)) continue;
                var destName = Path.GetFileName(img.LocalPath);
                var destPath = Path.Combine(targetDir, destName);

                int counter = 1;
                while (File.Exists(destPath))
                {
                    var nameWithoutExt = Path.GetFileNameWithoutExtension(destName);
                    var ext = Path.GetExtension(destName);
                    destPath = Path.Combine(targetDir, $"{nameWithoutExt}_{counter}{ext}");
                    counter++;
                }

                File.Copy(img.LocalPath, destPath);
                exported.Add(destPath);
            }
        }

        return $"已导出 {exported.Count} 张图片到 {targetDir}";
    }

    public void DeleteImageFiles(string? localPath, string? thumbnailPath)
    {
        if (!string.IsNullOrEmpty(localPath) && File.Exists(localPath))
            File.Delete(localPath);
        if (!string.IsNullOrEmpty(thumbnailPath) && File.Exists(thumbnailPath))
            File.Delete(thumbnailPath);
    }

    public static string DetectImageFormat(byte[] data)
    {
        if (data.Length < 4) return "unknown";
        if (data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47) return "png";
        if (data[0] == 0xFF && data[1] == 0xD8) return "jpg";
        if (data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46) return "gif";
        if (data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 &&
            data[8] == 0x57 && data[9] == 0x45 && data[10] == 0x42 && data[11] == 0x50) return "webp";
        if (data[0] == 0x42 && data[1] == 0x4D) return "bmp";
        return "unknown";
    }

    private static string GetExtension(string format) => format switch
    {
        "png" => "png",
        "jpg" => "jpg",
        "gif" => "gif",
        "webp" => "webp",
        "bmp" => "bmp",
        _ => "png"
    };

    private static string GetFormatName(Image image)
    {
        if (image.Metadata.DecodedImageFormat != null)
            return image.Metadata.DecodedImageFormat.Name.ToLowerInvariant();
        return "png";
    }

    public async Task<(int width, int height, string format, long fileSize)>
        GetImageInfoAsync(string imagePath)
    {
        using var img = await Image.LoadAsync(imagePath);
        var fileSize = new FileInfo(imagePath).Length;
        return (img.Width, img.Height, GetFormatName(img), fileSize);
    }
}
