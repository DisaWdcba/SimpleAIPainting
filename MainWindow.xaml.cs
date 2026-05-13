using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using MicuPainter.Bridge;
using MicuPainter.Services;

namespace MicuPainter;

public partial class MainWindow : Window
{
    private WebView2 _webView = null!;
    private BridgeRouter _router = null!;

    public MainWindow()
    {
        InitializeComponent();

        var tb = new TextBlock
        {
            Text = "米醋画图 启动中...",
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            FontSize = 20,
            Foreground = new SolidColorBrush(Color.FromRgb(30, 41, 59))
        };
        RootGrid.Children.Add(tb);

        this.ContentRendered += async (s, e) =>
        {
            try
            {
                await InitAll();
            }
            catch (Exception ex)
            {
                RootGrid.Children.Clear();
                var err = new TextBlock
                {
                    Text = $"启动失败\n{ex.GetType().Name}: {ex.Message}\n\n{ex.StackTrace}",
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    FontSize = 14,
                    Foreground = new SolidColorBrush(Colors.Red),
                    TextWrapping = TextWrapping.Wrap,
                    Margin = new Thickness(20)
                };
                RootGrid.Children.Add(err);
            }
        };
    }

    private async Task InitAll()
    {
        var appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MicuPainter");

        var db = new DatabaseService(appDataDir);
        await db.InitializeAsync();
        var imageService = new ImageService(appDataDir);
        var configService = new ConfigService(db);
        await configService.LoadAsync();

        AddStatusText("数据库就绪, 加载 WebView2...");

        var webView = new WebView2();
        _webView = webView;
        RootGrid.Children.Clear();
        RootGrid.Children.Add(webView);

        var userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MicuPainter", "WebView2");
        Directory.CreateDirectory(userDataFolder);

        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
        await webView.EnsureCoreWebView2Async(env);

        var core = webView.CoreWebView2;
        core.Settings.IsScriptEnabled = true;
        core.Settings.IsWebMessageEnabled = true;
        core.Settings.AreDefaultScriptDialogsEnabled = true;

        try { core.Settings.AreBrowserAcceleratorKeysEnabled = false; } catch { }
        try { core.Settings.AreDevToolsEnabled = false; } catch { }

#if DEBUG
        var isDebug = true;
#else
        var isDebug = false;
#endif

        _router = new BridgeRouter(db, imageService, configService, core, isDebug);

        core.WebMessageReceived += async (sender, e) =>
        {
            try
            {
                var msg = e.TryGetWebMessageAsString();
                if (!string.IsNullOrEmpty(msg))
                    await _router.HandleMessageAsync(msg);
            }
            catch (Exception ex)
            {
                Debug.WriteLine("[Bridge] WebMessageReceived error: " + ex.Message);
            }
        };

        core.NavigationCompleted += (sender, e) =>
        {
            if (e.IsSuccess)
            {
                SendBridgeReady(core);
            }
        };

        var wwwDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "www");
        var htmlFile = FindIndexFile(wwwDir);
        if (htmlFile != null)
            core.Navigate(new Uri(htmlFile).AbsoluteUri);
        else
            core.NavigateToString("<h2>找不到前端文件</h2>");
    }

    private void SendBridgeReady(CoreWebView2 core)
    {
        var msg = new
        {
            id = "bridge.ready",
            ok = true,
            result = new
            {
                version = "2.9.2",
                capabilities = new
                {
                    sqlite = true,
                    fileSystem = true,
                    dialog = true,
                    clipboard = true,
                    imageProcessing = true
                }
            }
        };

        var json = JsonSerializer.Serialize(msg,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        core.PostWebMessageAsString(json);
    }

    private void AddStatusText(string msg)
    {
        if (RootGrid.Children.Count == 1 && RootGrid.Children[0] is TextBlock tb)
            tb.Text = msg;
    }

    private static string? FindIndexFile(string wwwDir)
    {
        if (!Directory.Exists(wwwDir)) return null;
        foreach (var f in Directory.GetFiles(wwwDir, "*.html"))
            if (Path.GetFileName(f).StartsWith("viewer", StringComparison.OrdinalIgnoreCase))
                return f;
        return null;
    }
}
