# Görünmeyen masaüstünde çalışan yardımcı (test/senaryo53.mjs 11. bölüm, test/senaryo53_kos.ps1): PDEfe'nin sağ tık menüsü açılınca görüntüsünü alır, öğelerini (ad, etkin mi) UI Automation ile yazar,
# istenen öğeye basar ya da Esc ile kapatır. CDP menüyü göremez, test kancalı örnekte menü hiç açılmaz: Gerçek menü böyle sınanır. Pencere iletileri ve UI Automation yalnız aynı masaüstünde çalışır:
# Betik o masaüstünde başlatılmalıdır (test/masaustunde_baslat.ps1). Bilgisayarı kullanan kişinin ekranına ve faresine dokunulmaz.
# Kullanım: powershell -File menu_yakala.ps1 -SurecNo <electron ana süreç> -Cikti <json> [-Goruntu <png>] [-Sec "Tümünü seç"] [-BeklemeMs 8000]
param([Parameter(Mandatory = $true)][int]$SurecNo, [Parameter(Mandatory = $true)][string]$Cikti, [string]$Goruntu = "", [string]$Sec = "", [int]$BeklemeMs = 8000)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing, UIAutomationClient, UIAutomationTypes
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class MenuYakala {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint bayrak);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  /** Sürecin görünür, başlıksız açılır penceresi (menü): Ana pencerenin başlığı var, gizli yardımcı pencereler görünmez. */
  public static IntPtr MenuBul(uint pid, out string sinif) {
    IntPtr bulunan = IntPtr.Zero; string s = "";
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      var b = new StringBuilder(256); GetWindowText(h, b, 256);
      RECT r; GetWindowRect(h, out r);
      if (b.Length == 0 && r.R - r.L > 30 && r.B - r.T > 30 && r.R - r.L < 800 && r.B - r.T < 800 && (c.ToString().StartsWith("Chrome_WidgetWin") || c.ToString() == "#32768")) { bulunan = h; s = c.ToString(); return false; }
      return true;
    }, IntPtr.Zero);
    sinif = s;
    return bulunan;
  }
}
"@
$sonuc = [ordered]@{ bulundu = $false; sinif = ''; ogeler = @(); basildi = ''; hata = '' }
function Yaz-Sonuc { [IO.File]::WriteAllText($Cikti, ($sonuc | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding $false)) }
try {
  $h = [IntPtr]::Zero; $sinif = ''
  $son = (Get-Date).AddMilliseconds($BeklemeMs)
  while ((Get-Date) -lt $son) {
    $h = [MenuYakala]::MenuBul([uint32]$SurecNo, [ref]$sinif)
    if ($h -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 60
  }
  if ($h -eq [IntPtr]::Zero) { $sonuc.hata = 'menü penceresi bulunamadı'; Yaz-Sonuc; exit 2 }
  $sonuc.bulundu = $true; $sonuc.sinif = $sinif
  Start-Sleep -Milliseconds 350   # çizim
  if ($Goruntu) {
    $r = New-Object MenuYakala+RECT
    [void][MenuYakala]::GetWindowRect($h, [ref]$r)
    $bmp = New-Object System.Drawing.Bitmap ([Math]::Max(1, $r.R - $r.L)), ([Math]::Max(1, $r.B - $r.T))
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $dc = $g.GetHdc()
    [void][MenuYakala]::PrintWindow($h, $dc, 2)   # PW_RENDERFULLCONTENT
    $g.ReleaseHdc($dc); $g.Dispose()
    $bmp.Save($Goruntu, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  }
  $kok = [System.Windows.Automation.AutomationElement]::FromHandle($h)
  $kosul = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty), ([System.Windows.Automation.ControlType]::MenuItem)
  $ogeler = $kok.FindAll([System.Windows.Automation.TreeScope]::Descendants, $kosul)
  $liste = @()
  foreach ($o in $ogeler) { $liste += [ordered]@{ ad = $o.Current.Name; etkin = $o.Current.IsEnabled } }
  $sonuc.ogeler = $liste
  Yaz-Sonuc
  $basildi = $false
  if ($Sec) {
    foreach ($o in $ogeler) {
      if ($o.Current.Name -eq $Sec) {
        $o.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        $sonuc.basildi = $Sec; $basildi = $true
        break
      }
    }
  }
  if (-not $basildi) {
    [void][MenuYakala]::PostMessage($h, 0x100, [IntPtr]0x1B, [IntPtr]0x00010001)   # WM_KEYDOWN Esc
    [void][MenuYakala]::PostMessage($h, 0x101, [IntPtr]0x1B, [IntPtr]([long]0xC0010001 -band 0x7FFFFFFF))
  }
  Yaz-Sonuc
} catch { $sonuc.hata = $_.Exception.Message; Yaz-Sonuc; exit 1 }
