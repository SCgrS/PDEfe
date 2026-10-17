# Açılış hızı ölçümünün (test/acilis_hizi.mjs, 0.2.10) başlatıcısı: PDEfe'yi görünmeyen ayrı bir Windows masaüstünde başlatır (pencere
# bilgisayarı kullanan kişinin ekranına çıkmaz, odağını çalmaz; baslat_gizli.ps1'deki GizliBaslat'ın eşi) ve başlatma anını yazar.
# Komutları standart girdiden satır satır okur (her başlatmada PowerShell ve Add-Type yeniden kurulmasın; ölçümü süre bozmaz, zaman
# CreateProcess'ten hemen önce alınır):
#   girdi:  {"exe": "...\\PDEfe.exe", "arguman": "--user-data-dir=\"...\" \"...\\kucuk.pdf\"", "klasor": "...", "masaustu": "PDEfeAcilis9450"}
#   çıktı:  {"pid": 1234, "t0": <CreateProcess'ten hemen önce, duvar saati ms>, "olusma": <sürecin oluşma zamanı, ms>}  ya da  {"hata": "..."}
#   girdi:  {"cikis": 1234, "sure": 15000}   (başlatılan sürecin çıkmasını en çok sure ms bekler)
#   çıktı:  {"cikis": <sürecin çıkış zamanı, ms> | null (süresinde çıkmadı), "kod": <çıkış kodu>}
# Boş satır ya da girdinin sonu: çıkar.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class AcilisBaslat {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateDesktop(string ad, IntPtr aygit, IntPtr kip, int bayrak, uint erisim, IntPtr sa);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool miras, uint bayrak, IntPtr ortam, string klasor, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr h, out long olusma, out long cikis, out long cekirdek, out long kullanici);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern void GetSystemTimePreciseAsFileTime(out long ft);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h, out uint kod);
  static System.Collections.Generic.Dictionary<int, IntPtr> tanitici = new System.Collections.Generic.Dictionary<int, IntPtr>();
  static double Ms(long ft) { return (ft - 116444736000000000L) / 10000.0; }   // FILETIME (1601'den 100 ns) -> 1970'ten ms
  /** Döner: "pid|t0|olusma" ya da "-<Win32 hata>". Masaüstü tanıtıcısı kapatılmaz: süreç çıkana dek yaşasın. */
  public static string Baslat(string masaustu, string exe, string arguman, string klasor) {
    IntPtr masa = CreateDesktop(masaustu, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000, IntPtr.Zero);
    if (masa == IntPtr.Zero) return "-" + Marshal.GetLastWin32Error();
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.lpDesktop = "WinSta0\\" + masaustu;
    PROCESS_INFORMATION pi;
    long t0; GetSystemTimePreciseAsFileTime(out t0);
    if (!CreateProcess(null, "\"" + exe + "\" " + arguman, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, klasor, ref si, out pi)) return "-" + Marshal.GetLastWin32Error();
    long olusma, c, k, u; GetProcessTimes(pi.hProcess, out olusma, out c, out k, out u);
    CloseHandle(pi.hThread); tanitici[pi.dwProcessId] = pi.hProcess;   // çıkış zamanı için açık kalır (Cikis)
    return pi.dwProcessId + "|" + Ms(t0).ToString("R", System.Globalization.CultureInfo.InvariantCulture) + "|" + Ms(olusma).ToString("R", System.Globalization.CultureInfo.InvariantCulture);
  }
  /** "çıkış zamanı (ms)|çıkış kodu" ya da süresinde çıkmadıysa ""; çıktıysa tanıtıcı kapatılır. */
  public static string Cikis(int pid, uint sure) {
    IntPtr h;
    if (!tanitici.TryGetValue(pid, out h)) return "";
    if (WaitForSingleObject(h, sure) != 0) return "";
    long o, c, k, u; GetProcessTimes(h, out o, out c, out k, out u);
    uint kod; GetExitCodeProcess(h, out kod);
    CloseHandle(h); tanitici.Remove(pid);
    return Ms(c).ToString("R", System.Globalization.CultureInfo.InvariantCulture) + "|" + kod;
  }
}
"@
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::Out.WriteLine('{"hazir": true}'); [Console]::Out.Flush()
while ($true) {
  $satir = [Console]::In.ReadLine()
  if ([string]::IsNullOrWhiteSpace($satir)) { break }
  try {
    $k = $satir | ConvertFrom-Json
    if ($k.cikis) {
      $c = [AcilisBaslat]::Cikis([int]$k.cikis, [uint32]$(if ($k.sure) { $k.sure } else { 15000 }))
      if ($c) { $p = $c.Split('|'); $cikti = @{ cikis = [double]::Parse($p[0], [Globalization.CultureInfo]::InvariantCulture); kod = [uint32]$p[1] } }
      else { $cikti = @{ cikis = $null } }
      [Console]::Out.WriteLine(($cikti | ConvertTo-Json -Compress)); [Console]::Out.Flush()
      continue
    }
    $r = [AcilisBaslat]::Baslat($k.masaustu, $k.exe, $k.arguman, $k.klasor)
    if ($r.StartsWith('-')) { $cikti = @{ hata = "Win32 hata $($r.Substring(1))" } }
    else { $p = $r.Split('|'); $cikti = @{ pid = [int]$p[0]; t0 = [double]::Parse($p[1], [Globalization.CultureInfo]::InvariantCulture); olusma = [double]::Parse($p[2], [Globalization.CultureInfo]::InvariantCulture) } }
  } catch { $cikti = @{ hata = "$_" } }
  [Console]::Out.WriteLine(($cikti | ConvertTo-Json -Compress)); [Console]::Out.Flush()
}
