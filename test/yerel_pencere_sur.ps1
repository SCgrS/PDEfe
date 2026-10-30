# Görünmeyen masaüstündeki PDEfe'nin GERÇEK Windows kaydetme penceresini sürer (0.3.1, test/senaryo50.mjs): Test kancası (test:diyalogYanitlari) o
# pencereyi atlıyordu, "Formu Kaydet"ten sonra kullanıcının gördüğü akış hiç sınanmıyordu. Pencereler UI Automation'la bulunur, denetimler pencere
# iletisiyle sürülür (WM_CHAR, WM_COMMAND: Kaydetme penceresinin Win32 denetimlerinde UI Automation deseni yok, ölçüldü). İkisi de yalnızca aynı
# masaüstünde çalışır: Betik PDEfe'nin masaüstünde başlatılmalıdır (test/masaustunde_baslat.ps1).
# Kullanım (görünmeyen masaüstünde): powershell -STA -File yerel_pencere_sur.ps1 -SurecNo <PDEfe ana süreci> -Cikti <dosya> -Adimlar "ad=<yol>|evet"
#   Adımlar sırayla, "|" ile ayrılır:
#     bak         Kaydetme penceresini bekler, başlığını ve dosya adı kutusunun değerini yazar, düğmeye basmaz.
#     ad=<yol>    Kaydetme penceresini bekler, dosya adı kutusuna yolu yazar, Kaydet'e basar. <yol> boşsa ad değişmez (pencerenin önerdiği ad kalır).
#     evet        "Değiştirilsin mi" sorusunu bekler, Evet'e basar. hayir: Hayır'a basar.
#     iptal       Kaydetme penceresini bekler, İptal'e basar.
#   Çıktı dosyası satır satır: "OK <adım> <bilgi>" ya da "HATA <adım> <bilgi>", en sonda "BITTI". Süre sınırı: Adım başına -SureSn (30).
param([int]$SurecNo, [string]$Cikti, [string]$Adimlar, [int]$SureSn = 30)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class YerelPencere {
  [DllImport("user32.dll", SetLastError = true)] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "SendMessageTimeoutW", SetLastError = true)] static extern IntPtr SendMessageTimeoutOku(IntPtr h, uint m, IntPtr w, StringBuilder l, uint bayrak, uint ms, out IntPtr sonuc);
  const uint WM_GETTEXT = 0x000D, WM_COMMAND = 0x0111;
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SendMessageTimeoutW(IntPtr h, uint m, IntPtr w, IntPtr l, uint bayrak, uint ms, out IntPtr sonuc);
  const uint EM_SETSEL = 0x00B1, WM_CHAR = 0x0102, WM_CLEAR = 0x0303;
  // WM_SETTEXT kutuda görünür ama pencere adı almaz (önerilen adı kaydeder, ölçüldü): Harf harf yazılır (WM_CHAR)
  public static void Yaz(IntPtr h, string metin) {
    IntPtr r;
    SendMessageTimeoutW(h, EM_SETSEL, IntPtr.Zero, new IntPtr(-1), 2, 3000, out r);
    SendMessageTimeoutW(h, WM_CLEAR, IntPtr.Zero, IntPtr.Zero, 2, 3000, out r);
    foreach (char c in metin) SendMessageTimeoutW(h, WM_CHAR, new IntPtr(c), new IntPtr(1), 2, 3000, out r);
  }
  public static string Oku(IntPtr h) { var s = new StringBuilder(2048); IntPtr r; SendMessageTimeoutOku(h, WM_GETTEXT, new IntPtr(2048), s, 2, 3000, out r); return s.ToString(); }
  // BM_CLICK etkin olmayan pencerede çalışmaz (görünmeyen masaüstündeki pencere etkin olmayabilir): Düğmenin bildirimi doğrudan pencereye gönderilir
  public static bool Bas(IntPtr pencere, IntPtr dugme, int kimlik) { return PostMessage(pencere, WM_COMMAND, new IntPtr(kimlik), dugme); }
  /** Görev penceresinin (TaskDialog) düğmesi: TDM_CLICK_BUTTON */
  public static bool SoruyaBas(IntPtr pencere, int kimlik) { return PostMessage(pencere, 0x0466, new IntPtr(kimlik), IntPtr.Zero); }
}
"@
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$PC = [System.Windows.Automation.PropertyCondition]
$AC = [System.Windows.Automation.AndCondition]

function Satir([string]$metin) { [System.IO.File]::AppendAllText($Cikti, $metin + "`r`n", [System.Text.Encoding]::UTF8) }
function Hwnd($el) { [IntPtr]$el.Current.NativeWindowHandle }

$adKosulu = New-Object $AC((New-Object $PC($AE::AutomationIdProperty, '1001')), (New-Object $PC($AE::ClassNameProperty, 'Edit')))
function AdKutusu($p) { $p.FindFirst($TS::Descendants, $adKosulu) }

# Sürecin pencereleri ve (sahipli pencere sahibinin altında görünür: Soru, kaydetme penceresinin; kaydetme penceresi ana pencerenin) onların #32770 alt öğeleri
function PencereBul([scriptblock]$uyar) {
  $bitis = (Get-Date).AddSeconds($SureSn)
  while ((Get-Date) -lt $bitis) {
    foreach ($p in $AE::RootElement.FindAll($TS::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
      try {
        if ($SurecNo -and $p.Current.ProcessId -ne $SurecNo) { continue }
        if ($p.Current.ClassName -eq '#32770' -and (& $uyar $p)) { return $p }
        foreach ($c in $p.FindAll($TS::Descendants, (New-Object $PC($AE::ClassNameProperty, '#32770')))) { if (& $uyar $c) { return $c } }
      } catch { }
    }
    Start-Sleep -Milliseconds 150
  }
  return $null
}
function KaydetmePenceresi() { PencereBul { param($p) [bool](AdKutusu $p) } }
function SoruPenceresi() { PencereBul { param($p) [bool]$p.FindFirst($TS::Children, (New-Object $PC($AE::AutomationIdProperty, 'CommandButton_6'))) } }

function DugmeBul($pencere, [string[]]$adlar, [string[]]$kimlikler) {
  $hepsi = $pencere.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($d in $hepsi) { if ($kimlikler -contains $d.Current.AutomationId -and $d.Current.NativeWindowHandle) { return $d } }
  foreach ($d in $hepsi) { if ($adlar -contains $d.Current.Name -and $d.Current.NativeWindowHandle) { return $d } }
  return $null
}

try {
  foreach ($adim in ($Adimlar -split '\|')) {
    $ad = $adim; $deger = ''
    $e = $adim.IndexOf('=')
    if ($e -ge 0) { $ad = $adim.Substring(0, $e); $deger = $adim.Substring($e + 1) }
    switch ($ad) {
      'bak' {
        $p = KaydetmePenceresi
        if (-not $p) { Satir 'HATA bak pencere yok'; break }
        Satir ("OK bak baslik='" + $p.Current.Name + "' ad='" + [YerelPencere]::Oku((Hwnd (AdKutusu $p))) + "'")
      }
      'ad' {
        $p = KaydetmePenceresi
        if (-not $p) { Satir 'HATA ad pencere yok'; break }
        $k = Hwnd (AdKutusu $p)
        $once = [YerelPencere]::Oku($k)
        if ($deger) { [YerelPencere]::Yaz($k, $deger); Start-Sleep -Milliseconds 300 }
        Satir ("OK ad baslik='" + $p.Current.Name + "' onerilen='" + $once + "' yazilan='" + [YerelPencere]::Oku($k) + "'")
        $d = DugmeBul $p @('Kaydet', 'Save', '&Kaydet', '&Save') @('1')
        if (-not $d) { Satir 'HATA ad Kaydet düğmesi yok'; break }
        [void][YerelPencere]::Bas((Hwnd $p), (Hwnd $d), 1)
      }
      'iptal' {
        $p = KaydetmePenceresi
        if (-not $p) { Satir 'HATA iptal pencere yok'; break }
        $d = DugmeBul $p @('İptal', 'Cancel') @('2')
        [void][YerelPencere]::Bas((Hwnd $p), (Hwnd $d), 2)
        Satir 'OK iptal'
      }
      { $_ -in 'evet', 'hayir' } {
        $p = SoruPenceresi
        if (-not $p) { Satir "HATA $ad soru yok"; break }
        $metin = ($p.FindAll($TS::Descendants, (New-Object $PC($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Text))) | ForEach-Object { $_.Current.Name }) -join ' / '
                [void][YerelPencere]::SoruyaBas((Hwnd $p), $(if ($ad -eq 'evet') { 6 } else { 7 }))
        Satir ("OK $ad baslik='" + $p.Current.Name + "' metin='" + $metin + "'")
      }
      default { Satir "HATA bilinmeyen adım $ad" }
    }
    Start-Sleep -Milliseconds 300
  }
} catch {
  Satir ('HATA ' + $_.Exception.Message)
}
Satir 'BITTI'
