# PDEfe'nin bir sürecinin açtığı iletişim kutularını (#32770: Electron'un hata kutusu, dialog.showErrorBox, yerel mesaj kutuları) okur ve
# isteğe bağlı olarak Tamam'a basar (0.2.10 inceleme, test/acilis_saglamlik.mjs: "PDEfe açılamadı" kutusu kapatılınca süreç çıkmalı).
# Kutunun metinleri (başlık, ana ileti, ayrıntı) UI Automation ile okunur. Pencere iletileri ve UI Automation yalnızca aynı masaüstünde
# çalışır: örnek görünmeyen masaüstündeyse (test/acilis_baslat.ps1, baslat_gizli.ps1) betik kendini o masaüstünde yeniden başlatır, işi
# oradan yapar ve sonucu yazar (pencere_kapat.ps1 gibi). Yalnızca verilen sürecin kutularına dokunur.
# Kullanım:  powershell -NoProfile -ExecutionPolicy Bypass -File test\hata_kutusu.ps1 -Masaustu <ad> -SurecNo <pid> [-Tikla]
# Çıktı: tek satır JSON { sayi, kutular: [{ baslik, metinler: [...] }], tiklandi, pencereler: [uygulama penceresi başlıkları] }  ya da
# { hata: "..." }
param([string]$Masaustu = '', [int]$SurecNo, [switch]$Tikla, [switch]$Icerde, [string]$Cikti = '')
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public static class HataKutusu {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", SetLastError = true)] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenDesktop(string ad, int bayrak, bool miras, uint erisim);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool miras, uint bayrak, IntPtr ortam, string klasor, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

  /** Bu masaüstünde sürecin görünür pencereleri, sınıfına göre: "#32770" iletişim kutuları, "Chrome_WidgetWin_1" uygulama pencereleri. */
  public static List<IntPtr> Pencereler(uint pid, string sinif) {
    var sonuc = new List<IntPtr>();
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      if (c.ToString() == sinif) sonuc.Add(h);
      return true;
    }, IntPtr.Zero);
    return sonuc;
  }
  public static string Baslik(IntPtr h) { var b = new StringBuilder(512); GetWindowText(h, b, 512); return b.ToString(); }
  /** Tamam: görev iletişim kutusunda TDM_CLICK_BUTTON (IDOK), mesaj kutusunda WM_COMMAND (IDOK). */
  public static bool Tamam(IntPtr h) {
    bool a = PostMessage(h, 0x0466, (IntPtr)1, IntPtr.Zero);
    bool b = PostMessage(h, 0x0111, (IntPtr)1, IntPtr.Zero);
    return a || b;
  }
  /** Komutu masaüstünde başlatır; PID ya da -Win32 hata kodu. Masaüstü yoksa -2. */
  public static int Baslat(string masaustu, string komut, string klasor) {
    IntPtr masa = OpenDesktop(masaustu, 0, false, 0x10000000);
    if (masa == IntPtr.Zero) return -2;
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.lpDesktop = "WinSta0\\" + masaustu;
    PROCESS_INFORMATION pi;
    bool ok = CreateProcess(null, komut, IntPtr.Zero, IntPtr.Zero, false, 0x08000000, IntPtr.Zero, klasor, ref si, out pi);   // CREATE_NO_WINDOW
    CloseDesktop(masa);
    if (!ok) return -Marshal.GetLastWin32Error();
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    return pi.dwProcessId;
  }
}
"@

if ($Icerde) {
  try {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $kutular = @()
    $tiklandi = $false
    foreach ($h in [HataKutusu]::Pencereler([uint32]$SurecNo, '#32770')) {
      $metinler = @()
      try {
        $oge = [System.Windows.Automation.AutomationElement]::FromHandle($h)
        foreach ($a in $oge.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
          $ad = $a.Current.Name
          if ($ad) { $metinler += $ad }
        }
      } catch { $metinler += "(okunamadi: $($_.Exception.Message))" }
      $kutular += @{ baslik = [HataKutusu]::Baslik($h); metinler = @($metinler) }
      if ($Tikla) { $tiklandi = [HataKutusu]::Tamam($h) -or $tiklandi }
    }
    # Uygulama penceresi açıldı mı (başlıkları): hata kutusu açıkken hata ayıklama kapısı yanıt vermediği için pencereden bakılır
    $pencereler = @([HataKutusu]::Pencereler([uint32]$SurecNo, 'Chrome_WidgetWin_1') | ForEach-Object { [HataKutusu]::Baslik($_) })
    $sonuc = @{ sayi = $kutular.Count; kutular = @($kutular); tiklandi = $tiklandi; pencereler = $pencereler }
  } catch { $sonuc = @{ hata = "$_" } }
  [IO.File]::WriteAllText($Cikti, ($sonuc | ConvertTo-Json -Compress -Depth 5), (New-Object System.Text.UTF8Encoding $false))
  exit 0
}

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false   # Türkçe metinler bozulmasın
$kok = Split-Path -Parent $PSScriptRoot
$cikti = Join-Path $env:TEMP ("pdefe-hata-kutusu-{0}-{1}.json" -f $SurecNo, [guid]::NewGuid().ToString('N').Substring(0, 8))
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$tik = if ($Tikla) { ' -Tikla' } else { '' }
$komut = "`"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Icerde -SurecNo $SurecNo$tik -Cikti `"$cikti`""
$yardimci = if ($Masaustu) { [HataKutusu]::Baslat($Masaustu, $komut, $kok) } else { -2 }
if ($yardimci -eq -2) {
  # Masaüstü verilmedi ya da yok: süreç bu masaüstünde
  if ($Tikla) { & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Icerde -SurecNo $SurecNo -Tikla -Cikti $cikti }
  else { & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Icerde -SurecNo $SurecNo -Cikti $cikti }
} elseif ($yardimci -le 0) { Write-Output (@{ hata = "yardimci baslatilamadi (Win32 $(-$yardimci))" } | ConvertTo-Json -Compress); exit 1 }
for ($i = 0; $i -lt 150 -and -not (Test-Path $cikti); $i++) { Start-Sleep -Milliseconds 100 }
if (Test-Path $cikti) { [Console]::Out.WriteLine((Get-Content $cikti -Raw -Encoding UTF8)); Remove-Item -LiteralPath $cikti -Force }
else { [Console]::Out.WriteLine((@{ hata = 'yardimci yanit vermedi' } | ConvertTo-Json -Compress)) }
