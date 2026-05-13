using System;
using System.Windows;

namespace MicuPainter;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            var window = new MainWindow();
            window.Show();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"启动崩溃: {ex.GetType().Name}\n{ex.Message}\n\n{ex.StackTrace}",
                "错误",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown(-1);
        }
    }
}
