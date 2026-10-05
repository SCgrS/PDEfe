# Test örneğinin penceresine Windows'un kapatma iletisini gönderir (0.2.2, pencere kapatma sorusu): kapatma düğmesinin (×) ve Alt+F4'ün
# yolu WM_SYSCOMMAND SC_CLOSE → WM_CLOSE → Electron 'close' olayı → renderer'a 'pencere:kapatIstegi' (cikis: false). CDP'den gelen
# test:olayGonder bu yolu atlar; ana sürecin Çıkış'ı (cikis: true) kullanıcının kapatmasından ayırdığı böyle sınanır.
# Pencere iletileri yalnızca aynı masaüstündeki süreçler arasında gider: örnek görünmeyen masaüstünde (baslat_gizli.ps1, masaüstü
# PDEfeTest<port>) çalışıyorsa betik kendini o masaüstünde yeniden başlatır, iletiyi oradan gönderir ve sonucu yazar.
# Kullanım:  powershell -File test\pencere_kapat.ps1 -Port <port> -SurecNo <electron ana süreç (baslat_gizli.ps1'in PID'si)>
#              [-Ileti sistem|kapat] [-Baslik <pencere başlığında geçen metin>]
#   -Ileti sistem: WM_SYSCOMMAND SC_CLOSE (× düğmesi, Alt+F4); kapat: doğrudan WM_CLOSE (görev çubuğunun "Pencereyi kapat"ı gibi)
#   Çıktı: "TAMAM hwnd=… baslik='…'" ya da "HATA …"
param([int]$Port, [int]$SurecNo, [string]$Ileti = 'sistem', [string]$Baslik = '', [string]$Cikti = '', [switch]$Icerde)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class PencereKapat {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll", SetLastError = true)] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenDesktop(string ad, int bayrak, bool miras, uint erisim);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool miras, uint bayrak, IntPtr ortam, string klasor, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

  /** Sürecin görünür uygulama penceresi (başlığı "PDEfe" ile biten, fare olaylarını geçiren önizleme penceresi değil); baslik verilmişse
   *  başlığında o metin geçen. */
  public static IntPtr Bul(uint pid, string baslik, out string bulunanBaslik) {
    IntPtr bulunan = IntPtr.Zero; string ad = "";
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      if (c.ToString() != "Chrome_WidgetWin_1") return true;
      if ((GetWindowLongPtr(h, -20).ToInt64() & 0x20) != 0) return true;   // WS_EX_TRANSPARENT: sekme önizlemesi
      var b = new StringBuilder(512); GetWindowText(h, b, 512);
      string t = b.ToString();
      if (!t.EndsWith("PDEfe") || (baslik.Length > 0 && t.IndexOf(baslik, StringComparison.OrdinalIgnoreCase) < 0)) return true;
      bulunan = h; ad = t; return false;
    }, IntPtr.Zero);
    bulunanBaslik = ad;
    return bulunan;
  }
  public static bool Gonder(IntPtr h, bool sistem) {
    // WM_SYSCOMMAND (0x0112) SC_CLOSE (0xF060): × düğmesi ve Alt+F4; WM_CLOSE (0x0010)
    return sistem ? PostMessage(h, 0x0112, (IntPtr)0xF060, IntPtr.Zero) : PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero);
  }
  /** Komutu masaüstünde başlatır; PID ya da -Win32 hata kodu. Masaüstü yoksa -2. */
  public static int Baslat(string masaustu, string komut, string klasor) {
    IntPtr masa = OpenDesktop(masaustu, 0, false, 0x10000000);
    if (masa == IntPtr.Zero) return -2;
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.lpDesktop = "WinSta0\\" + masaustu;
    PROCESS_INFORMATION pi;
    bool ok = CreateProcess(null, komut, IntPtr.Zero, IntPtr.Zero, false, 0x08000000, IntPtr.Zero, klasor, ref si, out pi);   // CREATE_NO_WINDOW
    if (!ok) return -Marshal.GetLastWin32Error();
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    return pi.dwProcessId;
  }
}
"@

if ($Icerde) {
  $ad = ''
  $h = [PencereKapat]::Bul([uint32]$SurecNo, $Baslik, [ref]$ad)
  $sonuc = if ($h -eq [IntPtr]::Zero) { "HATA pencere bulunamadi (surec $SurecNo, baslik '$Baslik')" }
    elseif ([PencereKapat]::Gonder($h, $Ileti -ne 'kapat')) { "TAMAM hwnd=0x{0:X} baslik='{1}'" -f $h.ToInt64(), $ad }
    else { "HATA PostMessage basarisiz" }
  [IO.File]::WriteAllText($Cikti, $sonuc, (New-Object System.Text.UTF8Encoding $false))
  exit 0
}

$kok = Split-Path -Parent $PSScriptRoot
$cikti = Join-Path $env:TEMP ("pdefe-pencere-kapat-{0}-{1}.txt" -f $Port, [guid]::NewGuid().ToString('N').Substring(0, 8))
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$komut = "`"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Icerde -SurecNo $SurecNo -Ileti $Ileti -Baslik `"$Baslik`" -Cikti `"$cikti`""
$yardimci = [PencereKapat]::Baslat("PDEfeTest$Port", $komut, $kok)
if ($yardimci -eq -2) {
  # Görünmeyen masaüstü yok: örnek bu masaüstünde (ekran dışı pencere); ileti buradan gider
  & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Icerde -SurecNo $SurecNo -Ileti $Ileti -Baslik $Baslik -Cikti $cikti
} elseif ($yardimci -le 0) { Write-Output "HATA yardimci baslatilamadi (Win32 $(-$yardimci))"; exit 1 }
for ($i = 0; $i -lt 100 -and -not (Test-Path $cikti); $i++) { Start-Sleep -Milliseconds 100 }
if (Test-Path $cikti) { Write-Output (Get-Content $cikti -Raw -Encoding UTF8); Remove-Item -LiteralPath $cikti -Force } else { Write-Output 'HATA yardimci yanit vermedi' }
