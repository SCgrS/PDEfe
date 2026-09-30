# Görünmeyen masaüstünde çalışan yardımcı (test/gercek_fare.ps1 başlatır): PDEfe penceresine Windows fare iletileri gönderir
# (PostMessage: WM_LBUTTONDOWN, WM_MOUSEMOVE, WM_LBUTTONUP) ve tarayıcı sürecinin fare yakalamasını (GetGUIThreadInfo.hwndCapture), etkin
# penceresini ve üst düzey pencerelerini dosyaya yazar. CDP fare olayları tarayıcı sürecinin girdi yolunu ve fare yakalamasını atlar;
# sekmeyi çubuğun dışına sürüklemenin gerçek girdiyle çalıştığı (önizleme penceresi gösterilince yakalamanın kaynak pencerede kaldığı)
# böyle sınanır. Pencere iletileri yalnızca aynı masaüstündeki süreçler arasında gider: betik o masaüstünde başlatılmalıdır.
# Kullanım (görünmeyen masaüstünde): powershell -File fare_gonder.ps1 -SurecNo <electron ana süreç> -WebX <px> -WebY <px>
#   -OlcekYuzde <devicePixelRatio*100> -IcYukseklik <innerHeight> -Cikti <dosya> [-AdimSayisi 10] [-AdimY 15] [-TutmaMs 3000]
param([int]$SurecNo, [int]$WebX, [int]$WebY, [int]$OlcekYuzde = 100, [int]$IcYukseklik = 0, [string]$Cikti, [int]$AdimSayisi = 10, [int]$AdimY = 15, [int]$TutmaMs = 3000)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class FareGonder {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct GUITHREADINFO { public int cbSize, flags; public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret; public RECT rcCaret; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll", SetLastError = true)] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll", SetLastError = true)] static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO g);

  /** Sürecin üst düzey pencereleri (satır satır) ve ilk görünür uygulama penceresi (fare olaylarını geçiren önizleme penceresi değil). */
  public static List<string> Pencereler(uint pid, out IntPtr ana, out uint tid) {
    var sonuc = new List<string>(); IntPtr bulunan = IntPtr.Zero; uint bulunanTid = 0;
    EnumWindows((h, l) => {
      uint p; uint t = GetWindowThreadProcessId(h, out p);
      if (p != pid) return true;
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      var b = new StringBuilder(256); GetWindowText(h, b, 256);
      RECT r; GetWindowRect(h, out r);
      long ex = GetWindowLongPtr(h, -20).ToInt64();
      bool gorunur = IsWindowVisible(h);
      if (c.ToString() != "Chrome_WidgetWin_1") return true;
      bool onizleme = (ex & 0x20) != 0;   // WS_EX_TRANSPARENT: fare olaylarini geciren onizleme penceresi
      sonuc.Add(String.Format("hwnd=0x{0:X} tur={1} gorunur={2} baslik='{3}' dikdortgen=({4},{5},{6},{7})", h.ToInt64(), onizleme ? "onizleme" : "pencere", gorunur, b, r.L, r.T, r.R - r.L, r.B - r.T));
      if (bulunan == IntPtr.Zero && gorunur && !onizleme && b.ToString().EndsWith("PDEfe")) { bulunan = h; bulunanTid = t; }
      return true;
    }, IntPtr.Zero);
    ana = bulunan; tid = bulunanTid;
    return sonuc;
  }
  public static string Durum(uint tid) {
    var g = new GUITHREADINFO(); g.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    if (!GetGUIThreadInfo(tid, ref g)) return "GetGUIThreadInfo hata " + Marshal.GetLastWin32Error();
    return String.Format("yakalama=0x{0:X} etkin=0x{1:X} odak=0x{2:X}", g.hwndCapture.ToInt64(), g.hwndActive.ToInt64(), g.hwndFocus.ToInt64());
  }
  public static int IstemciYuksekligi(IntPtr h) { RECT r; GetClientRect(h, out r); return r.B; }
  public static bool Gonder(IntPtr h, uint ileti, int tuslar, int x, int y) { return PostMessage(h, ileti, (IntPtr)tuslar, (IntPtr)(((y & 0xFFFF) << 16) | (x & 0xFFFF))); }
}
"@
$satirlar = New-Object System.Collections.Generic.List[string]
function Yaz-Satir([string]$m) { $satirlar.Add(("{0:HH:mm:ss.fff} {1}" -f (Get-Date), $m)); [IO.File]::WriteAllLines($Cikti, $satirlar) }
function Pencereleri-Yaz([string]$etiket) {
  $bos = [IntPtr]::Zero; $bosTid = [uint32]0
  foreach ($p in [FareGonder]::Pencereler([uint32]$SurecNo, [ref]$bos, [ref]$bosTid)) { Yaz-Satir "[$etiket] $p" }
}
try {
  $ana = [IntPtr]::Zero; $tid = [uint32]0
  [void][FareGonder]::Pencereler([uint32]$SurecNo, [ref]$ana, [ref]$tid)
  Yaz-Satir ("ana pencere hwnd=0x{0:X}" -f $ana.ToInt64())
  if ($ana -eq [IntPtr]::Zero) { Yaz-Satir 'HATA: ana pencere bulunamadi'; exit 2 }
  Pencereleri-Yaz 'basta'
  Yaz-Satir ("basta: " + [FareGonder]::Durum($tid))
  # Web icerigi istemci alaninin altindadir (ustte menu cubugu): web noktasi -> istemci pikseli
  $menu = if ($IcYukseklik -gt 0) { [FareGonder]::IstemciYuksekligi($ana) - [int][Math]::Round($IcYukseklik * $OlcekYuzde / 100.0) } else { 0 }
  $X = [int][Math]::Round($WebX * $OlcekYuzde / 100.0); $Y = [int][Math]::Round($WebY * $OlcekYuzde / 100.0) + $menu
  $WM_MOUSEMOVE = 0x200; $WM_LBUTTONDOWN = 0x201; $WM_LBUTTONUP = 0x202; $MK_LBUTTON = 1
  [void][FareGonder]::Gonder($ana, $WM_MOUSEMOVE, 0, $X, $Y); Start-Sleep -Milliseconds 80
  [void][FareGonder]::Gonder($ana, $WM_LBUTTONDOWN, $MK_LBUTTON, $X, $Y); Start-Sleep -Milliseconds 150
  Yaz-Satir ("basildi: " + [FareGonder]::Durum($tid))
  $cx = $X; $cy = $Y
  for ($i = 1; $i -le $AdimSayisi; $i++) {
    $cx = $X + $i * 2; $cy = $Y + $i * $AdimY
    [void][FareGonder]::Gonder($ana, $WM_MOUSEMOVE, $MK_LBUTTON, $cx, $cy); Start-Sleep -Milliseconds 40
  }
  Start-Sleep -Milliseconds 300
  Yaz-Satir ("suruklendi: " + [FareGonder]::Durum($tid))
  Pencereleri-Yaz 'suruklenirken'
  # Tutarken ara ara kucuk hareket (elde tutulan fare gibi)
  $bitis = (Get-Date).AddMilliseconds($TutmaMs); $k = 0
  while ((Get-Date) -lt $bitis) { $k++; [void][FareGonder]::Gonder($ana, $WM_MOUSEMOVE, $MK_LBUTTON, $cx + ($k % 3), $cy + ($k % 2)); Start-Sleep -Milliseconds 100 }
  Yaz-Satir ("tutuldu: " + [FareGonder]::Durum($tid))
  [void][FareGonder]::Gonder($ana, $WM_LBUTTONUP, 0, $cx, $cy); Start-Sleep -Milliseconds 2500
  Yaz-Satir ("birakildi: " + [FareGonder]::Durum($tid))
  Pencereleri-Yaz 'birakildiktan sonra'
  Yaz-Satir 'BITTI'
} catch { Yaz-Satir ("HATA: " + $_.Exception.Message); exit 1 }
