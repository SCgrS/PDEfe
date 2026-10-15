# Sürüklenen sekmenin ön izleme penceresini dışarıdan izler (0.2.7, test/hayalet_akicilik.mjs): PDEfe ana sürecinin fare olaylarını geçiren
# (WS_EX_TRANSPARENT) üst düzey penceresinin yerini (GetWindowRect) -SureMs boyunca yarım milisaniyeden sık okur, yeri her değiştiğinde
# "<ms> <x> <y>" satırını yazar. Pencerenin ekrandaki hareketinin ne sıklıkla ve ne düzende güncellendiği böyle ölçülür (ana sürecin kendi
# ölçümünden bağımsız). Yalnızca okur; pencereye, fareye ve odağa dokunmaz. Aynı masaüstündeki pencereleri görür (test/baslat.ps1'in ekran
# dışındaki örneği olağan masaüstündedir; görünmeyen masaüstündeki örnek için betik o masaüstünde başlatılmalıdır).
# Kullanım: powershell -File test\hayalet_izle.ps1 -SurecNo <electron ana süreç> -SureMs 6000 -Cikti <dosya>
param([int]$SurecNo, [int]$SureMs = 6000, [string]$Cikti)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
public static class HayaletIzle {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  static IntPtr Bul(uint pid) {
    IntPtr bulunan = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      long ex = GetWindowLongPtr(h, -20).ToInt64();
      if ((ex & 0x20) != 0) { bulunan = h; return false; }   // WS_EX_TRANSPARENT: ön izleme penceresi
      return true;
    }, IntPtr.Zero);
    return bulunan;
  }
  public static string Izle(uint pid, int sureMs) {
    var sb = new StringBuilder();
    var sw = Stopwatch.StartNew();
    IntPtr h = IntPtr.Zero; int sonX = int.MinValue, sonY = int.MinValue; double sonArama = -1000;
    while (sw.ElapsedMilliseconds < sureMs) {
      double t = sw.Elapsed.TotalMilliseconds;
      if (h == IntPtr.Zero && t - sonArama > 20) { h = Bul(pid); sonArama = t; }
      RECT r;
      if (h != IntPtr.Zero && GetWindowRect(h, out r) && (r.L != sonX || r.T != sonY)) {
        sb.AppendLine(t.ToString("F3", System.Globalization.CultureInfo.InvariantCulture) + " " + r.L + " " + r.T);
        sonX = r.L; sonY = r.T;
      }
      Thread.SpinWait(400);
    }
    return sb.ToString();
  }
}
"@
Set-Content -LiteralPath $Cikti -Value 'HAZIR' -Encoding ASCII
$sonuc = [HayaletIzle]::Izle([uint32]$SurecNo, $SureMs)
[IO.File]::WriteAllText($Cikti, "BITTI`n" + $sonuc)
