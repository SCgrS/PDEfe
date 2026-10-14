# Görünmeyen masaüstündeki test örneğinde (test/baslat_gizli.ps1) gerçek yazdırmanın açtığı "Çıktıyı Farklı Kaydet" kutusunu bekler,
# dosya adını yazıp Kaydet'e basar (ya da -Vazgec ile Vazgeç'e). Microsoft Print to PDF / XPS gibi dosyaya yazan yazıcılar sessiz yazdırmada
# da bu kutuyu açar (0.2.6, test/yazdir_gercek.mjs). Kutu kişinin ekranına çıkmaz: o masaüstündeki pencerelere bakılır.
# Kutunun alt pencereleri ancak o masaüstüne bağlı bir iş parçacığından görülür (EnumChildWindows): iş ayrı bir iş parçacığında, SetThreadDesktop ile.
# Kullanım: powershell -ExecutionPolicy Bypass -File test\yazdir_kaydet.ps1 -Masaustu PDEfeTest9471 -Yol <çıktı.pdf> [-Bekle 60] [-Vazgec]
# Çıktı (tek satır JSON): { bulundu, baslik, sahipsiz, kutuSirasi, pdefeSirasi, ustte, sonuc }
#   kutuSirasi / pdefeSirasi: masaüstündeki görünür üst düzey pencerelerin önden arkaya sırasında kutunun ve PDEfe penceresinin yeri;
#   ustte: kutu PDEfe'nin önünde mi (kişinin ekranında arkada kalıp kalmayacağının göstergesi).
param(
  [Parameter(Mandatory = $true)][string]$Masaustu,
  [string]$Yol = '',
  [int]$Bekle = 60,
  [switch]$Vazgec
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class YazdirKutusu {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenDesktop(string ad, int bayrak, bool miras, uint erisim);
  [DllImport("user32.dll", SetLastError = true)] static extern bool SetThreadDesktop(IntPtr masa);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr masa);
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumDesktopWindows(IntPtr masa, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder sb, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint k);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, string l);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  static string Sinif(IntPtr h) { var sb = new StringBuilder(256); GetClassName(h, sb, 256); return sb.ToString(); }
  static string Baslik(IntPtr h) { var sb = new StringBuilder(512); GetWindowText(h, sb, 512); return sb.ToString(); }
  static string Kacis(string s) { return s == null ? "null" : "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }
  static IntPtr DosyaAdiKutusu(IntPtr dlg) {
    IntPtr edit = IntPtr.Zero;
    EnumChildWindows(dlg, (h, x) => { if (Sinif(h) == "Edit" && IsWindowVisible(h)) { edit = h; return false; } return true; }, IntPtr.Zero);
    return edit;
  }
  public static string Calistir(string ad, string yol, bool vazgec, int bekleMs) {
    string sonuc = "{\"bulundu\":false}";
    var is_ = new Thread(() => {
      IntPtr masa = OpenDesktop(ad, 0, false, 0x10000000);
      if (masa == IntPtr.Zero || !SetThreadDesktop(masa)) { sonuc = "{\"bulundu\":false,\"hata\":\"masaustu " + Marshal.GetLastWin32Error() + "\"}"; return; }
      var bitis = DateTime.Now.AddMilliseconds(bekleMs);
      while (DateTime.Now < bitis) {
        Thread.Sleep(250);
        var pencereler = new List<IntPtr>();
        EnumDesktopWindows(masa, (h, x) => { if (IsWindowVisible(h)) pencereler.Add(h); return true; }, IntPtr.Zero);
        int kutu = -1, pdefe = -1;
        for (int i = 0; i < pencereler.Count; i++) {
          string s = Sinif(pencereler[i]);
          if (kutu < 0 && s == "#32770" && DosyaAdiKutusu(pencereler[i]) != IntPtr.Zero) kutu = i;
          if (pdefe < 0 && s == "Chrome_WidgetWin_1" && Baslik(pencereler[i]).Contains("PDEfe")) pdefe = i;
        }
        if (kutu < 0) continue;
        IntPtr dlg = pencereler[kutu];
        Thread.Sleep(400);   // kutu kendini kursun
        string ne;
        if (vazgec) { PostMessage(dlg, 0x0111, new IntPtr(2), IntPtr.Zero); ne = "vazgecildi"; }   // WM_COMMAND IDCANCEL
        else {
          IntPtr edit = DosyaAdiKutusu(dlg);
          SendMessage(edit, 0x000C, IntPtr.Zero, yol);                                               // WM_SETTEXT
          PostMessage(dlg, 0x0111, new IntPtr(1), IntPtr.Zero);                                     // WM_COMMAND IDOK
          ne = "kaydedildi";
        }
        sonuc = "{\"bulundu\":true,\"baslik\":" + Kacis(Baslik(dlg)) + ",\"sahipsiz\":" + (GetWindow(dlg, 4) == IntPtr.Zero ? "true" : "false")
          + ",\"kutuSirasi\":" + kutu + ",\"pdefeSirasi\":" + pdefe + ",\"ustte\":" + (pdefe < 0 || kutu < pdefe ? "true" : "false") + ",\"sonuc\":\"" + ne + "\"}";
        break;
      }
      CloseDesktop(masa);
    });
    is_.Start(); is_.Join();
    return sonuc;
  }
}
"@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[YazdirKutusu]::Calistir($Masaustu, $Yol, [bool]$Vazgec, $Bekle * 1000)
