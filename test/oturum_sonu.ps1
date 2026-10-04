# Windows'un oturum sonu iletilerini (WM_QUERYENDSESSION / WM_ENDSESSION) bir test örneğinin uygulama pencerelerine gönderir (0.2.1,
# test/oturum_sonu.mjs). Oturum gerçekten kapanmaz: iletiler yalnızca verilen sürecin "… — PDEfe" başlıklı pencerelerine gider; kişinin
# ekranına, odağına ve öteki programlara dokunmaz.
# Kullanım:  powershell -File test\oturum_sonu.ps1 -SurecId <baslat.ps1'in PID'i> [-Ileti sorgu|bitis] [-Neden kapat|oturum|kritik|uygulama]
#            [-Bitti 1|0] [-Baslik <başlığın içerdiği metin>]
#   sorgu: WM_QUERYENDSESSION (yanıt 1: oturum bitebilir, 0: uygulama engelledi). bitis: WM_ENDSESSION (-Bitti 1: oturum bitiyor, 0: vazgeçildi).
#   -Neden: lParam (kapat = kapatma / yeniden başlatma, oturum = oturumu kapatma, kritik, uygulama = Yeniden Başlatma Yöneticisi).
# Çıktı: her pencere için bir JSON satırı { hwnd, baslik, sonuc } (UTF-8). Pencereler Windows'un sırasıyla (öndeki önce) gezilir.
param(
  [Parameter(Mandatory = $true)][int]$SurecId,
  [ValidateSet('sorgu', 'bitis')][string]$Ileti = 'sorgu',
  [ValidateSet('kapat', 'oturum', 'kritik', 'uygulama')][string]$Neden = 'kapat',
  [int]$Bitti = 1,
  [string]$Baslik = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class OturumSonu {
  delegate bool PencereGez(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(PencereGez f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint surec);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint ileti, IntPtr w, IntPtr l, uint bayrak, uint ms, out IntPtr sonuc);
  /** Sürecin uygulama pencereleri (Chromium sınıfı, başlığı "PDEfe" ile biten): [hwnd, başlık] */
  public static List<KeyValuePair<IntPtr, string>> Pencereler(uint surecId) {
    var liste = new List<KeyValuePair<IntPtr, string>>();
    EnumWindows((h, l) => {
      uint s; GetWindowThreadProcessId(h, out s);
      if (s != surecId) return true;
      var sinif = new StringBuilder(256); GetClassName(h, sinif, 256);
      var baslik = new StringBuilder(512); GetWindowText(h, baslik, 512);
      if (sinif.ToString() == "Chrome_WidgetWin_1" && baslik.ToString().EndsWith("PDEfe")) liste.Add(new KeyValuePair<IntPtr, string>(h, baslik.ToString()));
      return true;
    }, IntPtr.Zero);
    return liste;
  }
  public static long Gonder(IntPtr h, uint ileti, long w, long l) {
    IntPtr sonuc;
    if (SendMessageTimeout(h, ileti, new IntPtr(w), new IntPtr(l), 0, 10000, out sonuc) == IntPtr.Zero) return -1;   // zaman aşımı
    return sonuc.ToInt64();
  }
}
"@
$lParam = @{ kapat = 0; oturum = 0x80000000L; kritik = 0x40000000L; uygulama = 0x1 }[$Neden]
$kod = if ($Ileti -eq 'sorgu') { 0x11 } else { 0x16 }
$w = if ($Ileti -eq 'sorgu') { 0 } else { $Bitti }
foreach ($p in [OturumSonu]::Pencereler([uint32]$SurecId)) {
  if ($Baslik -and -not $p.Value.Contains($Baslik)) { continue }
  $sonuc = [OturumSonu]::Gonder($p.Key, $kod, $w, $lParam)
  [Console]::Out.WriteLine((@{ hwnd = $p.Key.ToInt64(); baslik = $p.Value; sonuc = $sonuc } | ConvertTo-Json -Compress))
}
