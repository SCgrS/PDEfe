# PDEfe'nin (geliştirme örneğinde electron.exe, paketlide PDEfe.exe) açtığı iletişim kutularını sayar (0.2.6, test/udf_yaklasik.mjs): ana
# süreçte yakalanmamış bir hata Electron'un "A JavaScript error occurred in the main process" kutusunu açar; yerel mesaj kutuları da aynı
# pencere sınıfındadır (#32770). Salt okunur: pencerelere dokunmaz. Görünmeyen masaüstündeki test örneği için -Masaustu PDEfeTest<port>
# (test/baslat_gizli.ps1'in yazdığı MASAUSTU), verilmezse bu masaüstü.
# Çıktı: tek satır JSON { sayi, basliklar: [...] }
# Kullanım:  powershell -NoProfile -ExecutionPolicy Bypass -File test\hata_kutusu_say.ps1 [-Masaustu PDEfeTest9481]
param([string]$Masaustu = "")
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class KutuSayaci {
  delegate bool PencereIslev(IntPtr h, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenDesktop(string ad, int bayrak, bool miras, uint erisim);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
  [DllImport("user32.dll")] static extern bool EnumDesktopWindows(IntPtr masa, PencereIslev f, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(PencereIslev f, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  /** Masaüstündeki üst düzey pencereler: [sınıf, başlık, pid]. masaustu boşsa bu masaüstü. */
  public static List<string[]> Listele(string masaustu) {
    var sonuc = new List<string[]>();
    PencereIslev f = (h, p) => {
      var s = new StringBuilder(256); GetClassName(h, s, 256);
      var b = new StringBuilder(512); GetWindowText(h, b, 512);
      uint pid; GetWindowThreadProcessId(h, out pid);
      sonuc.Add(new[] { s.ToString(), b.ToString(), pid.ToString() });
      return true;
    };
    if (string.IsNullOrEmpty(masaustu)) { EnumWindows(f, IntPtr.Zero); return sonuc; }
    IntPtr m = OpenDesktop(masaustu, 0, false, 0x0001 | 0x0040);   // DESKTOP_READOBJECTS | DESKTOP_ENUMERATE
    if (m == IntPtr.Zero) throw new Exception("Masaüstü açılamadı: " + masaustu + " (" + Marshal.GetLastWin32Error() + ")");
    try { EnumDesktopWindows(m, f, IntPtr.Zero); } finally { CloseDesktop(m); }
    return sonuc;
  }
}
"@
$surecler = @{}
Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='PDEfe.exe'" | ForEach-Object { $surecler[[string]$_.ProcessId] = $true }
$basliklar = @()
foreach ($p in [KutuSayaci]::Listele($Masaustu)) {
  if ($p[0] -eq '#32770' -and $surecler.ContainsKey($p[2])) { $basliklar += $p[1] }
}
Write-Output (@{ sayi = $basliklar.Count; basliklar = @($basliklar) } | ConvertTo-Json -Compress)
