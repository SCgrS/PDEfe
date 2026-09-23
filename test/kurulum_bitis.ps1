# Kurulum sihirbazının bitiş sayfasının görüntüsü: build\installer.nsh'teki customFinishPage tanımlarıyla (MUI_FINISHPAGE_*) yalnızca bitiş
# sayfası olan küçük bir kurucu derlenir (electron-builder'ın önbelleğindeki makensis, Unicode, Türkçe, nsis3-metro kenar görseli) ve
# görünmeyen ayrı bir Windows masaüstünde çalıştırılıp PrintWindow ile PNG'ye alınır: ekrana pencere açılmaz, odak çalınmaz.
# 0.1.7'de "PDEfe'yi varsayılan PDF görüntüleyici yap (Windows Ayarlar açılır)" kutusu tek satırlık alana sığmayıp yarım görünüyordu.
# Kullanım: powershell -File test\kurulum_bitis.ps1 -Cikti <png> [-Nsh <installer.nsh>] [-Bekle 1500]
param(
  [Parameter(Mandatory = $true)][string]$Cikti,
  [string]$Nsh = "",
  [int]$Bekle = 1500
)
$ErrorActionPreference = 'Stop'
$kok = Split-Path -Parent $PSScriptRoot
if (-not $Nsh) { $Nsh = Join-Path $kok 'build\installer.nsh' }
$makensis = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'electron-builder\Cache') -Recurse -Filter makensis.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.Directory.Name -eq 'Bin' } | Select-Object -First 1
if (-not $makensis) { throw 'makensis.exe bulunamadı (önce bir kez npm run dist ile electron-builder önbelleğini kurun).' }

# customFinishPage makrosundaki MUI_FINISHPAGE_* tanımları; işlev adları boş işleve çevrilir
$metin = Get-Content -LiteralPath $Nsh -Raw -Encoding UTF8
$m = [regex]::Match($metin, '(?s)!macro customFinishPage(.*?)!macroend')
if (-not $m.Success) { throw "customFinishPage makrosu yok: $Nsh" }
$tanimlar = ($m.Groups[1].Value -split "`r?`n") | Where-Object { $_ -match '^\s*!define\s+MUI_FINISHPAGE_' } |
  ForEach-Object { $_.Trim() -replace '^(!define\s+MUI_FINISHPAGE_\w*FUNCTION)\s+\S+$', '$1 pdefeBos' }

$gecici = Join-Path $env:TEMP ("pdefe-bitis-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $gecici | Out-Null
$exe = Join-Path $gecici 'bitis.exe'
$nsi = @"
Unicode true
!include "MUI2.nsh"
Name "PDEfe"
OutFile "$exe"
RequestExecutionLevel user
!define MUI_WELCOMEFINISHPAGE_BITMAP "`${NSISDIR}\Contrib\Graphics\Wizard\nsis3-metro.bmp"
!define MUI_ICON "$(Join-Path $kok 'build\icon.ico')"
Function pdefeBos
FunctionEnd
$($tanimlar -join "`r`n")
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Turkish"
Section
SectionEnd
"@
$nsiYolu = Join-Path $gecici 'bitis.nsi'
[System.IO.File]::WriteAllText($nsiYolu, $nsi, (New-Object System.Text.UTF8Encoding $true))
& $makensis.FullName -V2 -INPUTCHARSET UTF8 $nsiYolu | Out-Null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exe)) { throw "makensis başarısız (çıkış $LASTEXITCODE): $nsiYolu" }

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;
public static class GizliMasaustu {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int DrawText(IntPtr dc, string s, int n, ref RECT r, uint bicim);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr o);
  public static string Denetim = "";

  [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateFont(int h, int w, int esc, int yon, int agirlik, uint italik, uint alt, uint ustu, uint karakter, uint cikis, uint kirp, uint kalite, uint aile, string ad);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref POINT p);

  /** Metnin verilen genişlikte kaç piksel yükseklik istediği (DrawText DT_CALCRECT | DT_WORDBREAK), verilen yazı tipiyle. */
  static int Yukseklik(IntPtr h, string s, int genislik, string yaziTipi, int punto) {
    IntPtr dc = GetDC(h);
    IntPtr yt = CreateFont(-(punto * 96 / 72), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0, yaziTipi);
    IntPtr eski = SelectObject(dc, yt);
    var olcu = new RECT { left = 0, top = 0, right = genislik, bottom = 0 };
    DrawText(dc, s, -1, ref olcu, 0x400 | 0x10);   // DT_CALCRECT | DT_WORDBREAK
    SelectObject(dc, eski); DeleteObject(yt); ReleaseDC(h, dc);
    return olcu.bottom;
  }

  /**
   * Görünür yazılı denetimlerin (etiket, onay kutusu) metni kutusuna sığıyor mu. Onay kutusu yakalanan görüntüden: kutu simgesinin
   * sağındaki alanda denetimin en üst ya da en alt piksel satırında koyu piksel varsa metin kesiliyordur (tek satırlık kutuya iki satır
   * sığmayınca satırlar kenarlardan taşar). Etiketler PrintWindow'da çizilmediğinden ölçüyle: denetimin yazı tipi başka süreçte
   * seçilemez; iletişim kutusu yazı tipiyle (MS Shell Dlg 8 pt) ve daha büyük Segoe UI 9 pt ile, büyük olanı.
   */
  static string Sigma(IntPtr pencere, Bitmap bmp, int ox, int oy) {
    var sb = new System.Text.StringBuilder();
    EnumChildWindows(pencere, (h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sinif = new System.Text.StringBuilder(64); GetClassName(h, sinif, 64);
      var yazi = new System.Text.StringBuilder(1024); GetWindowText(h, yazi, 1024);
      string s = yazi.ToString().Replace("&", "");
      string k = sinif.ToString();
      if (s.Length == 0 || (k != "Static" && k != "Button")) return true;
      int stil = GetWindowLong(h, -16);
      bool onay = k == "Button" && ((stil & 0xF) == 2 || (stil & 0xF) == 3);   // BS_CHECKBOX / BS_AUTOCHECKBOX
      if (k == "Button" && !onay) return true;
      RECT r; GetWindowRect(h, out r);
      int w = r.right - r.left, hgt = r.bottom - r.top;
      string satir;
      if (onay) {
        int x0 = r.left - ox + GetSystemMetrics(71) + 4, x1 = r.left - ox + w, ust = r.top - oy, alt = r.bottom - oy - 1;
        Func<int, bool> koyu = (y) => { for (int x = Math.Max(0, x0); x < Math.Min(bmp.Width, x1); x++) { var c = bmp.GetPixel(x, y); if ((c.R + c.G + c.B) / 3 < 140) return true; } return false; };
        bool kesik = koyu(ust) || koyu(alt);
        satir = (kesik ? "TAŞIYOR  " : "SIĞIYOR  ") + "onay kutusu " + w + "x" + hgt + " px (görüntüden: metin " + (kesik ? "üst/alt kenarda kesiliyor" : "kenarlara değmiyor") + "): " + s;
      } else {
        int gereken = Math.Max(Yukseklik(h, s, w, "MS Shell Dlg", 8), Yukseklik(h, s, w, "Segoe UI", 9));
        satir = (gereken <= hgt ? "SIĞIYOR  " : "TAŞIYOR  ") + "etiket " + w + "x" + hgt + " px, gereken yükseklik " + gereken + " px: " + s.Replace("\r\n", " / ");
      }
      sb.AppendLine(satir);
      return true;
    }, IntPtr.Zero);
    return sb.ToString();
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateDesktop(string ad, IntPtr aygit, IntPtr kip, int bayrak, uint erisim, IntPtr sa);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetThreadDesktop(IntPtr h);
  [DllImport("user32.dll")] static extern bool EnumDesktopWindows(IntPtr h, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint bayrak);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool miras, uint bayrak, IntPtr ortam, string klasor, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr h, uint kod);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

  public static string Yakala(string exe, string png, int bekleMs) {
    string ad = "PDEfeSinama" + System.Diagnostics.Process.GetCurrentProcess().Id;
    IntPtr masa = CreateDesktop(ad, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000, IntPtr.Zero);
    if (masa == IntPtr.Zero) return "masaüstü kurulamadı: " + Marshal.GetLastWin32Error();
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.lpDesktop = "WinSta0\\" + ad;
    PROCESS_INFORMATION pi;
    if (!CreateProcess(null, "\"" + exe + "\"", IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, null, ref si, out pi)) { CloseDesktop(masa); return "süreç başlatılamadı: " + Marshal.GetLastWin32Error(); }
    string sonuc = "pencere bulunamadı";
    var is1 = new Thread(() => {
      if (!SetThreadDesktop(masa)) { sonuc = "iş parçacığı masaüstüne geçemedi"; return; }
      for (int deneme = 0; deneme < 20; deneme++) {
        Thread.Sleep(deneme == 0 ? bekleMs : 250);
        IntPtr hedef = IntPtr.Zero;
        EnumDesktopWindows(masa, (h, l) => { int p; GetWindowThreadProcessId(h, out p); if (p == pi.dwProcessId && IsWindowVisible(h)) { hedef = h; return false; } return true; }, IntPtr.Zero);
        if (hedef == IntPtr.Zero) continue;
        // Klavye odak çerçevesi (noktalı dikdörtgen) onay kutusu metninin çevresinde kenara değip kesilme sanılmasın: odak göstergeleri gizlenir
        SendMessage(hedef, 0x127, (IntPtr)0x10001, IntPtr.Zero);   // WM_CHANGEUISTATE (UIS_SET, UISF_HIDEFOCUS)
        Thread.Sleep(150);
        RECT r; GetWindowRect(hedef, out r);
        int w = r.right - r.left, hgt = r.bottom - r.top;
        if (w <= 0 || hgt <= 0) continue;
        using (var bmp = new Bitmap(w, hgt, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(bmp)) {
          IntPtr hdc = g.GetHdc();
          bool tamam = PrintWindow(hedef, hdc, 0);
          g.ReleaseHdc(hdc);
          if (!tamam) { sonuc = "PrintWindow başarısız"; continue; }
          bmp.Save(png, ImageFormat.Png);
          Denetim = Sigma(hedef, bmp, r.left, r.top);
        }
        sonuc = "tamam " + w + "x" + hgt;
        break;
      }
    });
    is1.Start(); is1.Join();
    TerminateProcess(pi.hProcess, 0); WaitForSingleObject(pi.hProcess, 5000);
    CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
    CloseDesktop(masa);
    return sonuc;
  }
}
"@
$tamYol = [System.IO.Path]::GetFullPath($Cikti)
New-Item -ItemType Directory -Force (Split-Path -Parent $tamYol) | Out-Null
$sonuc = [GizliMasaustu]::Yakala($exe, $tamYol, $Bekle)
Remove-Item -Recurse -Force $gecici -ErrorAction SilentlyContinue
if (-not $sonuc.StartsWith('tamam')) { throw "Bitiş sayfası yakalanamadı: $sonuc" }
Write-Output "$sonuc → $tamYol"
Write-Output ([GizliMasaustu]::Denetim.TrimEnd())
if ([GizliMasaustu]::Denetim -match 'TAŞIYOR') { exit 1 }
