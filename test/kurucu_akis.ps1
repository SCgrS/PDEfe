# Kurucunun tam akış sınaması (0.2.3): deneme kimliğiyle ("Kurucu Sinama", test\kurucu_sinama.yml) derlenmiş iki kurucu (eski 90.0.1, yeni
# 90.0.2) gerçekten kurulur, güncellenir, onarılır, kaldırılır. Gerçek PDEfe ile hiçbir kayıt, klasör, kısayol ve süreç adı paylaşılmaz;
# deneme uygulaması hiç açılmaz (runAfterFinish kapalı, --force-run yok, bitiş sayfasındaki "varsayılan PDF" kutusu boş bırakılır).
# Kurucular görünmeyen ayrı bir Windows masaüstünde başlatılır ve Win32 iletileriyle sürülür (test\kurucu_surucu.cs): ekrana pencere açılmaz.
# Bu PowerShell'den (Claude masaüstü MSIX paketinin içinden) başlatılan süreçler paketin görünümünü kullanır: HKCU yazımları paketin sanal
# kovanına gider (Windows'un Yüklü uygulamalar listesinde görünmez); 2026-10-07'de kurulum klasörü (%LOCALAPPDATA%\Programs\KurucuSinama) ve
# Başlat menüsü kısayolu ise gerçek klasörlere yazıldı. Kurulumun sonucu bu görünümden okunur (Get-ItemProperty, Test-Path), sızıntı iki
# görünümde de aranır. Masaüstü gerçektir: 0.2.9 denetiminden beri masaüstü kısayolunu oluşturan iki adım (E1 /S, C1 Onar) yalnızca
# -MasaustuSina ile (o zaman "Kurucu Sinama.lnk" kullanıcının masaüstüne kısa süreliğine düşer, temizlikte silinir); varsayılan koşuda E1
# "/S --no-desktop-shortcut", C1 kısayolsuz kurulumu onarır. Önceki, yarıda kalmış bir koşunun (PowerShell dışarıdan öldürülünce finally
# çalışmaz) izleri başta temizlenir. Gerçek PDEfe'nin kayıtları ve dosyası sınamadan önce ve sonra salt okunur WMI ile (StdRegProv, CIM_DataFile;
# paket dışından gerçek kovan) ve paket görünümünden okunur, aynı olmalı; deneme kopyasının izleri temizlikte iki görünümde de kalmamalı.
# WMI Win32_Process Create burada kullanılmaz: WinstationDesktop'u uygulamıyor (2026-10-07 yoklaması: süreç Default masaüstünde açıldı),
# arayüzlü kurucu kullanıcının ekranında açılırdı.
# 0.3.1: Sağ tık menüsü (build\installer.nsh madde 11): Deneme kurucusu fiilleri (KurucuSinama.Birlestir / .Donustur) ve sınama CLSID'lerini
# HKCU'ya, DLL'i %LOCALAPPDATA%\KurucuSinama\SagTik\<sürüm>\'e yazar. Kayıt yazımı paketin sanal kovanına gitmiyorsa (Gezgin görürdü) sınama
# başlamaz: Başta HKCU\Software\Classes'a işaret yazılıp gerçek kovanda (WMI) olmadığı kanıtlanır. Kayıtların değerleri test\sagtik_kayitlari.json'la
# karşılaştırılır. Gezgin'in DLL'i yüklü tuttuğu durum, DLL bu PowerShell'e yüklenerek (LoadLibrary) benzetilir: güncelleme, onarma, aynı sürüm üstüne --updated /S ve kaldırma.
# Kullanım: powershell -File test\kurucu_akis.ps1 -Cikti <klasör> [-Eski <90.0.1 kurucusu> -Yeni <90.0.2 kurucusu>] [-MasaustuSina]
#   -Eski / -Yeni verilmezse node test\kurucu_derle.mjs ile <Cikti>\derleme altına derlenir (proje dışı bir klasör verin).
#   -MasaustuSina: /S'nin ve Onar'ın masaüstü kısayolu davranışı da sınanır (kısayol gerçek Masaüstü'ne kısa süreliğine düşer).
param(
  [Parameter(Mandatory = $true)][string]$Cikti,
  [string]$Eski = "",
  [string]$Yeni = "",
  [switch]$MasaustuSina
)
$ErrorActionPreference = 'Stop'
$kok = Split-Path -Parent $PSScriptRoot
$Cikti = [System.IO.Path]::GetFullPath($Cikti)
New-Item -ItemType Directory -Force $Cikti | Out-Null
$utf8Bom = New-Object System.Text.UTF8Encoding $true

# ------------------------------------------------------------------ kimlikler (test\kurucu_sinama.yml; GUID = UUID v5(appId), NsisTarget.js)
$DENEME_GUID = '2dd80e88-b6d6-5111-b871-3c7d5b5b1948'      # com.cgrshn.kurucusinama
$GERCEK_GUID = 'd1a5401f-8a99-5538-93c7-d6ac348837b2'      # com.cgrshn.pdefe
$KALDIR_ANAHTARI = "Software\Microsoft\Windows\CurrentVersion\Uninstall"
$denemeKlasoru = Join-Path $env:LOCALAPPDATA 'Programs\KurucuSinama'
$denemeExe = Join-Path $denemeKlasoru 'KurucuSinama.exe'
$masaustuKisayolu = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Kurucu Sinama.lnk'
$baslatKisayolu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Kurucu Sinama.lnk'
$guncelleyiciKlasoru = Join-Path $env:LOCALAPPDATA 'kurucu-sinama-updater'
# 0.3.1: sağ tık (test\kurucu_sinama.nsh, test\sagtik_kayitlari.json)
$sagTikDuzen = Get-Content -LiteralPath (Join-Path $kok 'test\sagtik_kayitlari.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$sagTikUst = Join-Path $env:LOCALAPPDATA 'KurucuSinama'
$sagTikKok = Join-Path $sagTikUst 'SagTik'
$sagTikRunOnce = 'KurucuSinama sağ tık temizliği'
$RUNONCE = 'Software\Microsoft\Windows\CurrentVersion\RunOnce'
function SagTik-Anahtarlari {
  foreach ($f in $sagTikDuzen.fiiller) {
    "Software\Classes\$($sagTikDuzen.fiilKoku)\$($sagTikDuzen.fiilOneki.kurucuSinamasi).$($f.ad)"
    "Software\Classes\CLSID\$($f.sinamaClsid)"
  }
}
# Gerçek PDEfe'nin sağ tık anahtarları (ön ve son görüntü)
function SagTik-Gercek-Anahtarlari {
  foreach ($f in $sagTikDuzen.fiiller) {
    "Software\Classes\$($sagTikDuzen.fiilKoku)\$($sagTikDuzen.fiilOneki.gercek).$($f.ad)"
    "Software\Classes\CLSID\$($f.clsid)\InprocServer32"
  }
}

if (-not $Eski -or -not $Yeni) {
  foreach ($s in @('90.0.1', '90.0.2')) {
    & node (Join-Path $kok 'test\kurucu_derle.mjs') --surum $s --cikti (Join-Path $Cikti "derleme\$s")
    if ($LASTEXITCODE -ne 0) { throw "deneme kurucusu derlenemedi: $s" }
  }
  $Eski = Join-Path $Cikti 'derleme\90.0.1\KurucuSinama-Setup-90.0.1.exe'
  $Yeni = Join-Path $Cikti 'derleme\90.0.2\KurucuSinama-Setup-90.0.2.exe'
}
foreach ($k in @($Eski, $Yeni)) {
  $bilgi = (Get-Item -LiteralPath $k).VersionInfo
  if ($bilgi.ProductName -ne 'KurucuSinama') { throw "yalnızca deneme kurucusu çalıştırılır (ProductName KurucuSinama olmalı): $k → $($bilgi.ProductName)" }
}
if ((Get-Item -LiteralPath $Eski).VersionInfo.ProductVersion -ne '90.0.1' -or (Get-Item -LiteralPath $Yeni).VersionInfo.ProductVersion -ne '90.0.2') {
  throw 'kurucuların sürümleri 90.0.1 ve 90.0.2 olmalı'
}

# ------------------------------------------------------------------ rapor
$script:hatalar = 0
$script:rapor = New-Object System.Collections.Generic.List[string]
function Yaz([string]$s) { $script:rapor.Add($s); Write-Output $s }
function Denetle([string]$ad, [bool]$kosul, [string]$ayrinti = '') {
  if ($kosul) { Yaz "  TAMAM  $ad" } else { $script:hatalar++; Yaz "  HATA   $ad $ayrinti" }
}

# ------------------------------------------------------------------ gerçek kovan ve dosyalar (salt okunur WMI, paket dışından)
$HKCU = [uint32]2147483649
function Gercek-Deger([string]$anahtar, [string]$ad) {
  $r = Invoke-CimMethod -Namespace root\default -ClassName StdRegProv -MethodName GetStringValue -Arguments @{ hDefKey = $HKCU; sSubKeyName = $anahtar; sValueName = $ad }
  if ($r.ReturnValue -ne 0) { return '<yok>' }
  return [string]$r.sValue
}
function Gercek-Anahtar-Var([string]$anahtar) {
  $r = Invoke-CimMethod -Namespace root\default -ClassName StdRegProv -MethodName EnumValues -Arguments @{ hDefKey = $HKCU; sSubKeyName = $anahtar }
  return $r.ReturnValue -eq 0
}
function Gercek-Degerler([string]$anahtar) {
  $r = Invoke-CimMethod -Namespace root\default -ClassName StdRegProv -MethodName EnumValues -Arguments @{ hDefKey = $HKCU; sSubKeyName = $anahtar }
  if ($r.ReturnValue -ne 0) { return '<yok>' }
  return (@($r.sNames) | Sort-Object) -join ','
}
function Gercek-Dosya([string]$yol) {
  $ad = $yol.Replace('\', '\\').Replace("'", "\'")
  $f = Get-CimInstance CIM_DataFile -Filter "Name='$ad'" -ErrorAction SilentlyContinue
  if (-not $f) { return '<yok>' }
  return "$($f.Version) $($f.FileSize) $($f.LastModified.ToString('s'))"
}
function Gercek-Klasor-Var([string]$yol) {
  $ad = $yol.Replace('\', '\\').Replace("'", "\'")
  return [bool](Get-CimInstance Win32_Directory -Filter "Name='$ad'" -ErrorAction SilentlyContinue)
}
# Paket görünümü (bu PowerShell'in ve başlattığı kurucuların gördüğü HKCU)
function Paket-Deger([string]$anahtar, [string]$ad) {
  $yol = "Registry::HKEY_CURRENT_USER\$anahtar"
  if (-not (Test-Path -LiteralPath $yol)) { return '<yok>' }
  $o = Get-Item -LiteralPath $yol
  $v = $o.GetValue($(if ($ad -eq '') { $null } else { $ad }), $null, 'DoNotExpandEnvironmentNames')
  if ($null -eq $v) { return '<yok>' }
  return [string]$v
}
function Paket-Anahtar-Var([string]$anahtar) { return (Test-Path -LiteralPath "Registry::HKEY_CURRENT_USER\$anahtar") }
function Paket-Degerler([string]$anahtar) {
  $yol = "Registry::HKEY_CURRENT_USER\$anahtar"
  if (-not (Test-Path -LiteralPath $yol)) { return '<yok>' }
  return (@((Get-Item -LiteralPath $yol).GetValueNames()) | Sort-Object) -join ','
}

# Gerçek PDEfe'nin izleri: ön ve son görüntü aynı olmalı
function Gercek-Pdefe-Goruntusu {
  $g = [ordered]@{}
  foreach ($gorunum in @('gercek', 'paket')) {
    $deger = if ($gorunum -eq 'gercek') { ${function:Gercek-Deger} } else { ${function:Paket-Deger} }
    $degerler = if ($gorunum -eq 'gercek') { ${function:Gercek-Degerler} } else { ${function:Paket-Degerler} }
    $g["$gorunum Uninstall DisplayVersion"] = & $deger "$KALDIR_ANAHTARI\$GERCEK_GUID" 'DisplayVersion'
    $g["$gorunum Uninstall UninstallString"] = & $deger "$KALDIR_ANAHTARI\$GERCEK_GUID" 'UninstallString'
    $g["$gorunum Software\GUID InstallLocation"] = & $deger "Software\$GERCEK_GUID" 'InstallLocation'
    $g["$gorunum Software\GUID KeepShortcuts"] = & $deger "Software\$GERCEK_GUID" 'KeepShortcuts'
    $g["$gorunum Software\GUID ShortcutName"] = & $deger "Software\$GERCEK_GUID" 'ShortcutName'
    $g["$gorunum Software\PDEfe\Capabilities"] = & $degerler 'Software\PDEfe\Capabilities'
    $g["$gorunum Software\PDEfe\Capabilities ApplicationName"] = & $deger 'Software\PDEfe\Capabilities' 'ApplicationName'
    $g["$gorunum RegisteredApplications PDEfe"] = & $deger 'Software\RegisteredApplications' 'PDEfe'
    $g["$gorunum Classes\PDEfe.pdf AppUserModelID"] = & $deger 'Software\Classes\PDEfe.pdf' 'AppUserModelID'
    $g["$gorunum Classes\PDEfe.pdf open"] = & $deger 'Software\Classes\PDEfe.pdf\shell\open\command' ''
    $g["$gorunum Classes\.pdf"] = & $deger 'Software\Classes\.pdf' ''
    $g["$gorunum Classes\.pdf\OpenWithProgids"] = & $degerler 'Software\Classes\.pdf\OpenWithProgids'
    foreach ($a in SagTik-Gercek-Anahtarlari) { $g["$gorunum $a"] = & $degerler $a; $g["$gorunum $a (varsayılan)"] = & $deger $a '' }
    $g["$gorunum RunOnce PDEfe sağ tık"] = & $deger $RUNONCE 'PDEfe sağ tık temizliği'
  }
  $g['gercek LocalAppData\PDEfe\SagTik'] = [string](Gercek-Klasor-Var (Join-Path $env:LOCALAPPDATA 'PDEfe\SagTik'))
  $g['gercek Programs\PDEfe\PDEfe.exe'] = Gercek-Dosya (Join-Path $env:LOCALAPPDATA 'Programs\PDEfe\PDEfe.exe')
  $g['gercek pdefe-updater\installer.exe'] = Gercek-Dosya (Join-Path $env:LOCALAPPDATA 'pdefe-updater\installer.exe')
  $g['gercek masaüstü PDEfe.lnk'] = [string](Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'PDEfe.lnk'))
  return $g
}
# Deneme kopyasının izleri (iki görünümde): temizlikten sonra hiçbiri kalmamalı
function Deneme-Izleri {
  $izler = New-Object System.Collections.Generic.List[string]
  foreach ($a in @("$KALDIR_ANAHTARI\$DENEME_GUID", "Software\$DENEME_GUID", 'Software\KurucuSinama', 'Software\Classes\KurucuSinama.pdf', 'Software\Classes\Applications\KurucuSinama.exe')) {
    if (Gercek-Anahtar-Var $a) { $izler.Add("gerçek kovan: HKCU\$a") }
    if (Paket-Anahtar-Var $a) { $izler.Add("paket görünümü: HKCU\$a") }
  }
  if ((Gercek-Deger 'Software\RegisteredApplications' 'KurucuSinama') -ne '<yok>') { $izler.Add('gerçek kovan: RegisteredApplications\KurucuSinama') }
  if ((Paket-Deger 'Software\RegisteredApplications' 'KurucuSinama') -ne '<yok>') { $izler.Add('paket görünümü: RegisteredApplications\KurucuSinama') }
  if ((Gercek-Degerler 'Software\Classes\.pdf\OpenWithProgids') -match 'KurucuSinama') { $izler.Add('gerçek kovan: .pdf\OpenWithProgids\KurucuSinama.pdf') }
  foreach ($a in SagTik-Anahtarlari) {
    if (Gercek-Anahtar-Var $a) { $izler.Add("gerçek kovan: HKCU\$a") }
    if (Paket-Anahtar-Var $a) { $izler.Add("paket görünümü: HKCU\$a") }
  }
  if ((Gercek-Deger $RUNONCE $sagTikRunOnce) -ne '<yok>') { $izler.Add("gerçek kovan: RunOnce\$sagTikRunOnce") }
  if ((Paket-Deger $RUNONCE $sagTikRunOnce) -ne '<yok>') { $izler.Add("paket görünümü: RunOnce\$sagTikRunOnce") }
  if (Gercek-Klasor-Var $sagTikUst) { $izler.Add("gerçek klasör: $sagTikUst") }
  if (Test-Path -LiteralPath $sagTikUst) { $izler.Add("paket görünümü klasör: $sagTikUst") }
  if ((Paket-Degerler 'Software\Classes\.pdf\OpenWithProgids') -match 'KurucuSinama') { $izler.Add('paket görünümü: .pdf\OpenWithProgids\KurucuSinama.pdf') }
  foreach ($k in @($denemeKlasoru, $guncelleyiciKlasoru, (Join-Path $env:APPDATA 'KurucuSinama'))) {
    if (Gercek-Klasor-Var $k) { $izler.Add("gerçek klasör: $k") }
    if (Test-Path -LiteralPath $k) { $izler.Add("paket görünümü klasör: $k") }
  }
  if (Test-Path -LiteralPath $masaustuKisayolu) { $izler.Add("masaüstü: $masaustuKisayolu") }
  if (Test-Path -LiteralPath $baslatKisayolu) { $izler.Add("Başlat menüsü (paket görünümü): $baslatKisayolu") }
  if ((Gercek-Dosya $baslatKisayolu) -ne '<yok>') { $izler.Add("Başlat menüsü (gerçek): $baslatKisayolu") }
  # Un_A.exe: NSIS kaldırıcısının %TEMP%'teki kopyası (WQL LIKE'ta _ tek karakterdir, [_] kendisi)
  $surecler = @(Get-CimInstance Win32_Process -Filter "Name='KurucuSinama.exe' OR Name LIKE 'KurucuSinama-Setup%' OR (Name LIKE 'Un[_]_.exe' AND ExecutablePath LIKE '%\\~nsu%')" -ErrorAction SilentlyContinue)
  foreach ($p in $surecler) { $izler.Add("süreç: $($p.Name) $($p.ProcessId)") }
  return $izler
}
# Deneme kurulumunun durumu (paket görünümü: kurucular bu PowerShell'in alt süreçleri)
function Deneme-Durumu {
  # Dosya sürümünün sayısal üç bölümü (electron-builder FileVersion dizgisine "90.0.1" yazar, CIM "90.0.1.0" okur)
  $exeSurum = '<yok>'
  if (Test-Path -LiteralPath $denemeExe) { $vi = (Get-Item -LiteralPath $denemeExe).VersionInfo; $exeSurum = "$($vi.FileMajorPart).$($vi.FileMinorPart).$($vi.FileBuildPart)" }
  [pscustomobject]@{
    Surum = Paket-Deger "$KALDIR_ANAHTARI\$DENEME_GUID" 'DisplayVersion'
    Klasor = Paket-Deger "Software\$DENEME_GUID" 'InstallLocation'
    KeepShortcuts = Paket-Deger "Software\$DENEME_GUID" 'KeepShortcuts'
    Exe = $exeSurum
    Masaustu = Test-Path -LiteralPath $masaustuKisayolu
    Baslat = Test-Path -LiteralPath $baslatKisayolu
    Kayit = Paket-Deger 'Software\RegisteredApplications' 'KurucuSinama'
    Pdf = Paket-Deger 'Software\Classes\.pdf' ''
  }
}
function Durum-Yaz($d) { Yaz "         durum: sürüm $($d.Surum), exe $($d.Exe), KeepShortcuts $($d.KeepShortcuts), masaüstü $($d.Masaustu), Başlat $($d.Baslat), .pdf «$($d.Pdf)»" }

# ------------------------------------------------------------------ ön görüntü
Yaz '0. ön görüntü'
$onGoruntu = Gercek-Pdefe-Goruntusu
foreach ($k in $onGoruntu.Keys) { Yaz "         $k = $($onGoruntu[$k])" }
$onIzler = Deneme-Izleri
if ($onIzler.Count -gt 0) { Yaz "         önceki bir sınamanın izleri var (yarıda kalmış koşu; sihirbaz masaüstü kurulunca temizlenir): $($onIzler -join '; ')" }

$kaynak = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'kurucu_surucu.cs'), [System.Text.Encoding]::UTF8)
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $kaynak

# ------------------------------------------------------------------ sihirbaz yardımcıları
function Pencereleri-Oku {
  [KurucuSurucu]::Pencereler() -split "`n" | Where-Object { $_ } | ForEach-Object {
    $p = $_ -split "`t"
    [pscustomobject]@{ Hwnd = [long]$p[0]; Pid = [int]$p[1]; Sinif = $p[2]; Gorunur = $p[3] -eq '1'; Sahip = [long]$p[4]; Baslik = $p[5] }
  }
}
function Sayfa-Oku([long]$hwnd) {
  $denetimler = [KurucuSurucu]::Denetimler($hwnd) -split "`n" | Where-Object { $_ } | ForEach-Object {
    $p = $_ -split "`t"
    [pscustomobject]@{ Hwnd = [long]$p[0]; Ust = [long]$p[1]; Sinif = $p[2]; Kimlik = [int]$p[3]; Bicem = [int]$p[4]; Gorunur = $p[5] -eq '1'; Etkin = $p[6] -eq '1'; Isaret = [long]$p[7]; X = [int]$p[8]; Y = [int]$p[9]; En = [int]$p[10]; Boy = [int]$p[11]; Yazi = $p[12] }
  }
  $bul = { param($id) $denetimler | Where-Object { $_.Kimlik -eq $id -and $_.Ust -eq $hwnd } | Select-Object -First 1 }
  $baslik = & $bul 1037
  [pscustomobject]@{
    Hwnd = $hwnd
    Baslik = $(if ($baslik -and $baslik.Gorunur) { $baslik.Yazi } else { '' })
    Ileri = (& $bul 1)
    Geri = (& $bul 3)
    Secenekler = @($denetimler | Where-Object { $_.Sinif -eq 'Button' -and $_.Gorunur -and (($_.Bicem -band 0xF) -in 4, 9) } | Sort-Object Y)
    OnayKutulari = @($denetimler | Where-Object { $_.Sinif -eq 'Button' -and $_.Gorunur -and (($_.Bicem -band 0xF) -in 2, 3) } | Sort-Object Y)
    Etiketler = @($denetimler | Where-Object { $_.Sinif -eq 'Static' -and $_.Gorunur -and $_.Yazi -and $_.Ust -ne $hwnd } | Sort-Object Y | ForEach-Object Yazi)
  }
}
function Sayfa-Adi($s) {
  if (-not $s) { return '(kapandı)' }
  if ($s.Ileri.Yazi -eq '&Bitir') { return 'bitiş' }
  if ($s.Baslik) { return $s.Baslik }
  return "(başlıksız; İleri «$($s.Ileri.Yazi)»)"
}
# Masaüstündeki sihirbaz penceresi (sahibi olmayan görünür #32770); $haric pid'ler dışında
function Sihirbaz-Bekle([int[]]$haric = @(), [int]$surec = 0, [int]$ms = 20000) {
  $son = [DateTime]::Now.AddMilliseconds($ms)
  while ([DateTime]::Now -lt $son) {
    $w = Pencereleri-Oku | Where-Object { $_.Gorunur -and $_.Sinif -eq '#32770' -and $_.Sahip -eq 0 -and ($surec -eq 0 -or $_.Pid -eq $surec) -and $haric -notcontains $_.Pid } | Select-Object -First 1
    if ($w) { Start-Sleep -Milliseconds 400; return $w }
    if ($surec -and [KurucuSurucu]::Bekle($surec, 0) -ge 0) { return $null }
    Start-Sleep -Milliseconds 150
  }
  return $null
}
function Ileti-Bekle([long]$sahip, [int]$ms = 3000) {
  $son = [DateTime]::Now.AddMilliseconds($ms)
  while ([DateTime]::Now -lt $son) {
    $w = Pencereleri-Oku | Where-Object { $_.Gorunur -and $_.Sinif -eq '#32770' -and $_.Sahip -eq $sahip } | Select-Object -First 1
    if ($w) { return $w }
    Start-Sleep -Milliseconds 150
  }
  return $null
}
# Bir düğmeden sonra sayfaları izler: görülen her sayfanın adı sırayla; bitiş sayfasına, $dur adına ya da kapanışa dek
function Akisi-Izle([int]$surec, [long]$hwnd, [string]$dur = '', [int]$ms = 240000) {
  $gorulen = New-Object System.Collections.Generic.List[string]
  $son = [DateTime]::Now.AddMilliseconds($ms)
  $onceki = $null
  while ([DateTime]::Now -lt $son) {
    if ([KurucuSurucu]::Bekle($surec, 0) -ge 0) { $gorulen.Add('(kapandı)'); break }
    $ileti = Ileti-Bekle $hwnd 10
    if ($ileti) { $gorulen.Add("(ileti: $($ileti.Baslik))"); break }
    $s = Sayfa-Oku $hwnd
    $ad = Sayfa-Adi $s
    if ($ad -ne $onceki -and $ad -notmatch '^\(başlıksız') { $gorulen.Add($ad); $onceki = $ad }
    if ($ad -eq 'bitiş' -or ($dur -and $ad -eq $dur)) { break }
    Start-Sleep -Milliseconds 120
  }
  return $gorulen
}
function Goruntu-Al([long]$hwnd, [string]$ad) {
  $png = Join-Path $Cikti "$ad.png"
  $olcu = [KurucuSurucu]::Goruntu($hwnd, $png)
  # 0.2.3'e dek NSIS'in Türkçe lisans düğmesi "Kabul Ediyorum" burada bilinen istisnaydı; artık "Kabul et" (build\installer.nsh), istisna yok
  foreach ($satir in ($olcu -split "`r?`n" | Where-Object { $_ })) {
    if ($satir -match '^(TAŞIYOR|HATA)') { $script:hatalar++; Yaz "  HATA   $satir" }   # HATA: görüntü boş ya da alınamadı (kurucu_surucu.cs)
  }
  Yaz "         görüntü: $png"
}
# Bitiş sayfası: "varsayılan PDF" kutusu boş (Windows Ayarlar açılmasın), başlat kutusu yok (runAfterFinish kapalı); Bitir
function Bitir([int]$surec, [long]$hwnd, [string]$goruntu = '') {
  $s = Sayfa-Oku $hwnd
  if ($goruntu) { Goruntu-Al $hwnd $goruntu }
  $kutular = @($s.OnayKutulari)
  Denetle 'bitiş: "başlat" kutusu yok, "varsayılan PDF" kutusu boş' ($kutular.Count -eq 1 -and $kutular[0].Isaret -eq 0 -and $kutular[0].Yazi -match 'varsayılan') (($kutular | ForEach-Object { "$($_.Yazi)=$($_.Isaret)" }) -join ', ')
  foreach ($k in $kutular) { if ($k.Isaret -ne 0) { [KurucuSurucu]::Tikla($k.Hwnd) | Out-Null } }
  if (@((Sayfa-Oku $hwnd).OnayKutulari | Where-Object { $_.Isaret -ne 0 }).Count -gt 0) { throw 'bitiş sayfasındaki kutu boşaltılamadı; Bitir''e basılmadı' }
  [KurucuSurucu]::Dugme($hwnd, 1) | Out-Null
  $kod = [KurucuSurucu]::Bekle($surec, 20000)
  Denetle 'Bitir: kurucu kapandı (çıkış 0)' ($kod -eq 0) "çıkış $kod"
}
function Kurucu-Baslat([string]$exe, [string]$arg = '') {
  $surec = [KurucuSurucu]::Baslat("`"$exe`" $arg".Trim(), (Split-Path -Parent $exe))
  if ($surec -le 0) { throw "kurucu başlatılamadı: $surec" }
  return $surec
}
# Sessiz kurulum: hiçbir pencere görünmemeli; biter bitmez çıkış kodu
function Sessiz-Kur([string]$exe, [string]$arg) {
  $bas = [DateTime]::Now
  $surec = Kurucu-Baslat $exe $arg
  $gorunen = New-Object System.Collections.Generic.HashSet[string]
  while ($true) {
    foreach ($w in (Pencereleri-Oku | Where-Object { $_.Gorunur })) { [void]$gorunen.Add("$($w.Sinif) «$($w.Baslik)»") }
    $kod = [KurucuSurucu]::Bekle($surec, 100)
    if ($kod -ge 0) { break }
    if (([DateTime]::Now - $bas).TotalSeconds -gt 300) { [KurucuSurucu]::Sonlandir($surec); $kod = -1; break }
  }
  [pscustomobject]@{ Kod = $kod; Sure = [math]::Round(([DateTime]::Now - $bas).TotalSeconds, 1); Pencereler = @($gorunen) }
}
function Gecici-Kisayol-Sil {
  if (Test-Path -LiteralPath $masaustuKisayolu) { Remove-Item -LiteralPath $masaustuKisayolu -Force }
}
# 0.3.1: Güncelleme önbelleği (build\installer.nsh madde 10: Gerçek kaldırmada silinir, --updated ile çalışan eski kaldırıcıda kalır). Kurucu
# kendini her kurulumda <önbellek>\installer.exe'ye kopyalar: Güncellemeden sonra o dosyanın var olması eski kaldırıcının önbelleği silmediğini
# göstermez. Bu yüzden önbelleğe electron-updater'ın bıraktığı türden iki işaret dosyası konur (current.blockmap, pending\ altında bir dosya):
# Güncelleme, onarma ve eski sürüme dönmeden sonra yerinde olmalı, kaldırmadan sonra klasörün kendisi kalmamalı.
function Onbellek-Isaretle {
  New-Item -ItemType Directory -Force (Join-Path $guncelleyiciKlasoru 'pending') | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $guncelleyiciKlasoru 'current.blockmap'), 'kurucu sinamasi')
  [System.IO.File]::WriteAllText((Join-Path $guncelleyiciKlasoru 'pending\isaret.txt'), 'kurucu sinamasi')
}
function Onbellek-Kaldi([string]$an) {
  $isaret = (Test-Path -LiteralPath (Join-Path $guncelleyiciKlasoru 'current.blockmap')) -and (Test-Path -LiteralPath (Join-Path $guncelleyiciKlasoru 'pending\isaret.txt'))
  $kurucu = Test-Path -LiteralPath (Join-Path $guncelleyiciKlasoru 'installer.exe')
  Denetle "$($an): güncelleme önbelleği kaldı (işaret dosyaları yerinde, installer.exe var)" ($isaret -and $kurucu) "işaretler $isaret, installer.exe $kurucu"
}
function Onbellek-Silindi([string]$an) {
  Denetle "$($an): güncelleme önbelleği (kurucu-sinama-updater) silindi" (-not (Test-Path -LiteralPath $guncelleyiciKlasoru)) $guncelleyiciKlasoru
}
# 0.3.1: Sağ tık. Anahtarlar .NET ile okunur (adda * var: PowerShell'in kayıt sürücüsü onu joker sayabilir)
function Paket-Kayit([string]$anahtar, [string]$ad) {
  $a = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($anahtar)
  if (-not $a) { return '<yok>' }
  try { $v = $a.GetValue($ad, $null, 'DoNotExpandEnvironmentNames'); if ($null -eq $v) { return '<yok>' }; return [string]$v } finally { $a.Close() }
}
function SagTik-Dll([string]$surum) { return (Join-Path $sagTikKok "$surum\$($sagTikDuzen.dllAdi)") }
# Kurulu sürümün sağ tık kaydı: değerler düzendeki gibi, DLL ve PDEfe-yolu.txt sürüm klasöründe, gerçek kovanda hiçbiri yok. $kalan: silinemeyen
# (yüklü) eski sürüm klasörleri; başka sürüm klasörü olmamalı
function SagTik-Kurulu([string]$an, [string]$surum, [string[]]$kalan = @()) {
  $dll = SagTik-Dll $surum
  $hatalar = New-Object System.Collections.Generic.List[string]
  $dok = { param($v, $f) $v.Replace('{BASLIK}', $f.baslik).Replace('{CLSID}', $f.sinamaClsid).Replace('{EXE}', $denemeExe).Replace('{DLL}', $dll) }
  foreach ($f in $sagTikDuzen.fiiller) {
    $fiil = "Software\Classes\$($sagTikDuzen.fiilKoku)\$($sagTikDuzen.fiilOneki.kurucuSinamasi).$($f.ad)"
    $clsid = "Software\Classes\CLSID\$($f.sinamaClsid)"
    foreach ($p in $sagTikDuzen.fiilDegerleri.PSObject.Properties) { $b = & $dok $p.Value $f; $v = Paket-Kayit $fiil $p.Name; if ($v -ne $b) { $hatalar.Add("$fiil\$($p.Name) «$v» ≠ «$b»") } }
    foreach ($p in $sagTikDuzen.clsidDegerleri.PSObject.Properties) { $n = if ($p.Name -eq '@') { '' } else { $p.Name }; $b = & $dok $p.Value $f; $v = Paket-Kayit $clsid $n; if ($v -ne $b) { $hatalar.Add("$clsid\$n «$v» ≠ «$b»") } }
    foreach ($p in $sagTikDuzen.inprocDegerleri.PSObject.Properties) { $n = if ($p.Name -eq '@') { '' } else { $p.Name }; $b = & $dok $p.Value $f; $v = Paket-Kayit "$clsid\InprocServer32" $n; if ($v -ne $b) { $hatalar.Add("$clsid\InprocServer32\$n «$v» ≠ «$b»") } }
    if (Gercek-Anahtar-Var $fiil) { $hatalar.Add("gerçek kovanda: $fiil") }
    if (Gercek-Anahtar-Var $clsid) { $hatalar.Add("gerçek kovanda: $clsid") }
  }
  if (-not (Test-Path -LiteralPath $dll)) { $hatalar.Add("DLL yok: $dll") }
  elseif ((Get-FileHash -LiteralPath $dll).Hash -ne (Get-FileHash -LiteralPath (Join-Path $denemeKlasoru "resources\sagtik\$($sagTikDuzen.dllAdi)")).Hash) { $hatalar.Add('DLL kurulum klasöründekinin aynısı değil') }
  $yolDosyasi = Join-Path (Split-Path -Parent $dll) $sagTikDuzen.yolDosyasi
  $bayt = if (Test-Path -LiteralPath $yolDosyasi) { [System.IO.File]::ReadAllBytes($yolDosyasi) } else { @() }
  $yol = if ($bayt.Count -ge 2 -and $bayt[0] -eq 0xFF -and $bayt[1] -eq 0xFE) { [System.Text.Encoding]::Unicode.GetString($bayt, 2, $bayt.Count - 2) } else { '<BOM yok>' }
  if ($yol -ne $denemeExe) { $hatalar.Add("PDEfe-yolu.txt «$yol» ≠ «$denemeExe»") }
  $klasorler = @(if (Test-Path -LiteralPath $sagTikKok) { Get-ChildItem -LiteralPath $sagTikKok -Directory | ForEach-Object Name | Sort-Object })
  $beklenen = @(@($surum) + $kalan | Sort-Object -Unique)
  if (($klasorler -join ',') -ne ($beklenen -join ',')) { $hatalar.Add("sürüm klasörleri: $($klasorler -join ', ') (beklenen $($beklenen -join ', '))") }
  Denetle "$($an): sağ tık kaydı $surum (fiiller, CLSID'ler, DLL, PDEfe-yolu.txt; gerçek kovanda yok)" ($hatalar.Count -eq 0) ($hatalar -join '; ')
}
function SagTik-Silindi([string]$an) {
  $kalan = @(SagTik-Anahtarlari | Where-Object { Paket-Anahtar-Var $_ })
  Denetle "$($an): sağ tık kayıtları, klasörü ve RunOnce yok" ($kalan.Count -eq 0 -and -not (Test-Path -LiteralPath $sagTikUst) -and (Paket-Deger $RUNONCE $sagTikRunOnce) -eq '<yok>') "kayıtlar: $($kalan -join ', '); klasör $(Test-Path -LiteralPath $sagTikUst); RunOnce «$(Paket-Deger $RUNONCE $sagTikRunOnce)»"
}
# Gezgin'in DLL'i yüklü tutması: DLL bu PowerShell'e yüklenir (silinemez, üzerine yazılamaz), sonra bırakılır
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class SagTikKilit {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr LoadLibraryExW(string ad, IntPtr h, uint bayrak);
  [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr h);
  public static long Yukle(string yol) { return (long)LoadLibraryExW(yol, IntPtr.Zero, 0); }
  public static bool Birak(long h) { return FreeLibrary((IntPtr)h); }
}
"@
# Deneme kopyasının kalıntıları: kayıtlıysa kendi sessiz kaldırıcısı (görünmeyen masaüstünde), sonra kısayollar ve klasörler. Sınamanın sonunda
# (finally) ve 0.2.9 denetiminden beri başında (önceki koşu yarıda kaldıysa) çalışır. .pdf varsayılanını geri yazmak finally'nin işi (ön görüntü)
function Kalintilari-Temizle {
  $sessiz = Paket-Deger "$KALDIR_ANAHTARI\$DENEME_GUID" 'QuietUninstallString'
  if ($sessiz -ne '<yok>') {
    $kaldirici = [KurucuSurucu]::Baslat($sessiz, $env:TEMP)
    # Kaldırıcı kendini %TEMP%'e kopyalayıp yeniden başlatır, ilk süreç hemen döner: kayıt kalkana dek beklenir
    $son = [DateTime]::Now.AddSeconds(120)
    while ((Paket-Anahtar-Var "$KALDIR_ANAHTARI\$DENEME_GUID") -and [DateTime]::Now -lt $son) { Start-Sleep -Milliseconds 500 }
    Start-Sleep -Seconds 2
    Yaz "         sessiz kaldırma: $sessiz"
  }
  if (Test-Path -LiteralPath $guncelleyiciKlasoru) { Remove-Item -LiteralPath $guncelleyiciKlasoru -Recurse -Force }
  Gecici-Kisayol-Sil
  if (Test-Path -LiteralPath $baslatKisayolu) { Remove-Item -LiteralPath $baslatKisayolu -Force }
  if (Test-Path -LiteralPath $denemeKlasoru) { Remove-Item -LiteralPath $denemeKlasoru -Recurse -Force }
  # 0.3.1: sağ tık (kayıtlar yalnızca paket görünümünde; gerçek kovanda görülürse Deneme-Izleri bildirir, buradan silinmez)
  foreach ($a in SagTik-Anahtarlari) { try { [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($a, $false) } catch { } }
  $r = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($RUNONCE, $true)
  if ($r) { try { $r.DeleteValue($sagTikRunOnce, $false) } finally { $r.Close() } }
  if (Test-Path -LiteralPath $sagTikUst) { Remove-Item -LiteralPath $sagTikUst -Recurse -Force }
}
# Kurulu sürüm sayfasında Kaldır seçildi ve kurucu kapandı: deneme kopyasının kendi kaldırıcısı aynı (görünmeyen) masaüstünde açılır;
# hoş geldiniz → Kaldırılıyor → bitiş. Sonunda kayıt, klasör ve kısayollar kalmamalı.
function Kaldiriciyi-Sur([int]$kurucu, [string]$goruntu) {
  $k = Sihirbaz-Bekle -haric @($kurucu) -ms 20000
  Denetle 'kaldırıcı aynı (görünmeyen) masaüstünde açıldı' ([bool]$k)
  if ($k) {
    $sira = New-Object System.Collections.Generic.List[string]
    $s = Sayfa-Oku $k.Hwnd
    Goruntu-Al $k.Hwnd $goruntu
    # 0.2.3: NSIS'in Türkçe dil dosyasındaki "kadırılımı", "Kaldırım işlemeni", "programlari" (build\installer.nsh customHeader)
    $metin = $s.Etiketler -join ' / '
    Denetle 'kaldırıcının hoş geldiniz metni yazım hatasız' ($metin -match 'programının kaldırılması boyunca' -and $metin -match 'Kaldırma işlemini' -and $metin -notmatch 'kadırılımı|Kaldırım|işlemeni|programlari') $metin
    $sira.Add("hoş geldiniz (İleri «$($s.Ileri.Yazi)»)")
    [KurucuSurucu]::Dugme($k.Hwnd, 1) | Out-Null
    $g = Akisi-Izle $k.Pid $k.Hwnd
    $g | ForEach-Object { $sira.Add($_) }
    Yaz "         kaldırıcı sayfaları: $($sira -join ' → ')"
    Denetle 'kaldırıcı: hoş geldiniz → kaldırma → bitiş' ($sira[-1] -eq 'bitiş')
    if ($sira[-1] -eq 'bitiş') {
      $s = Sayfa-Oku $k.Hwnd
      Denetle 'kaldırıcının bitişinde onay kutusu yok' ($s.OnayKutulari.Count -eq 0)
      [KurucuSurucu]::Dugme($k.Hwnd, 1) | Out-Null
      [KurucuSurucu]::Bekle($k.Pid, 20000) | Out-Null
    }
  }
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle 'kaldırıldı: kayıt, klasör, kısayollar ve Varsayılan Programlar kaydı yok' ($d.Surum -eq '<yok>' -and $d.Exe -eq '<yok>' -and -not $d.Masaustu -and -not $d.Baslat -and $d.Kayit -eq '<yok>' -and -not (Paket-Anahtar-Var 'Software\KurucuSinama'))
  Onbellek-Silindi 'kaldırıldı'
  Gecici-Kisayol-Sil
}

# 0.3.1: Deneme kurucusu sağ tık fiillerini HKCU\Software\Classes\*\shell'e yazar. Bu PowerShell'in kayıt yazımları paketin sanal kovanına
# gitmiyorsa (Gezgin görürdü, deneme fiilleri kullanıcının menüsünde çıkardı) sınama başlamaz
$isaret = "Software\Classes\$($sagTikDuzen.fiilKoku)\KurucuSinama.SanalKovanKaniti"
$ia = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($isaret); $ia.SetValue('isaret', '1'); $ia.Close()
$sanalPaket = Paket-Anahtar-Var $isaret
$sanalGercek = Gercek-Anahtar-Var $isaret
[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($isaret, $false)
Denetle "kayıt yazımı paketin sanal kovanına gidiyor (HKCU\$isaret paket görünümünde var, gerçek kovanda yok)" ($sanalPaket -and -not $sanalGercek) "paket $sanalPaket, gerçek $sanalGercek"
if ($sanalGercek -or -not $sanalPaket) { throw 'HKCU yazımı gerçek kovana gidiyor ya da ölçülemedi: Deneme kurucusu Gezgin''in menüsüne yazardı, sınama başlamadı.' }

$durum = [KurucuSurucu]::MasaKur('PDEfeKurucu' + $PID)
if ($durum -ne 'tamam') { throw $durum }
if ($onIzler.Count -gt 0) {
  Kalintilari-Temizle
  $onIzler = Deneme-Izleri
}
Denetle 'deneme kopyasının izi yok (başlamadan; önceki koşudan kalanlar temizlendikten sonra)' ($onIzler.Count -eq 0) ($onIzler -join '; ')
if ($onIzler.Count -gt 0) { [KurucuSurucu]::MasaKapat(); throw 'Önceki bir sınamanın izleri temizlenemedi; temizlenmeden başlanmaz.' }
try {
  # -------------------------------------------------------------- A1. kurulu değil: ilk sayfa lisans, İptal
  Yaz 'A1. kurulu değil (90.0.2): ilk sayfa lisans, İptal'
  $p = Kurucu-Baslat $Yeni
  $w = Sihirbaz-Bekle -surec $p
  $s = Sayfa-Oku $w.Hwnd
  Denetle 'ilk sayfa lisans, Geri gizli' ($s.Baslik -eq 'Lisans Sözleşmesi' -and -not $s.Geri.Gorunur) "«$($s.Baslik)»"
  Denetle 'lisans düğmesi «Kabul et» (0.2.3; "Kabul Ediyorum" sığmıyordu)' ($s.Ileri.Yazi -eq '&Kabul et') "«$($s.Ileri.Yazi)»"
  Goruntu-Al $w.Hwnd 'akis-A1-lisans'
  [KurucuSurucu]::Dugme($w.Hwnd, 2) | Out-Null
  $kod = [KurucuSurucu]::Bekle($p, 10000)
  Denetle 'İptal: kurucu kapandı, hiçbir şey kurulmadı' ($kod -ge 0 -and (Deneme-Durumu).Surum -eq '<yok>' -and -not (Test-Path -LiteralPath $denemeKlasoru)) "çıkış $kod"

  # -------------------------------------------------------------- A2. kurulu değil: tam sihirbaz (masaüstü kutusu boşaltılır)
  Yaz 'A2. kurulu değil (90.0.1): lisans → klasör → Ek görevler → kurulum → bitiş'
  $p = Kurucu-Baslat $Eski
  $w = Sihirbaz-Bekle -surec $p
  $sira = New-Object System.Collections.Generic.List[string]
  $s = Sayfa-Oku $w.Hwnd; $sira.Add((Sayfa-Adi $s))
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $g = Akisi-Izle $p $w.Hwnd 'Hedef dizini seçimi' 15000; $g | ForEach-Object { if ($sira[-1] -ne $_) { $sira.Add($_) } }
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $g = Akisi-Izle $p $w.Hwnd 'Ek görevler' 15000; $g | ForEach-Object { if ($sira[-1] -ne $_) { $sira.Add($_) } }
  $s = Sayfa-Oku $w.Hwnd
  Denetle 'Ek görevler: masaüstü kutusu işaretli (yeni kurulum)' ($s.OnayKutulari.Count -eq 1 -and $s.OnayKutulari[0].Isaret -eq 1)
  if ($s.OnayKutulari.Count -eq 1) { [KurucuSurucu]::Tikla($s.OnayKutulari[0].Hwnd) | Out-Null }
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $g = Akisi-Izle $p $w.Hwnd; $g | ForEach-Object { if ($sira[-1] -ne $_) { $sira.Add($_) } }
  Yaz "         sayfalar: $($sira -join ' → ')"
  Denetle '"Kimler için kurulsun?" sayfası yok, sıra bugünkü gibi' (($sira -join '|') -match '^Lisans Sözleşmesi\|Hedef dizini seçimi\|Ek görevler\|Kurul.*bitiş$' -and ($sira -notcontains 'Yükleme Ayarlarını Seçin'))
  Bitir $p $w.Hwnd 'akis-A2-bitis'
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle '90.0.1 kuruldu, masaüstü kısayolu yok, Başlat kısayolu var' ($d.Surum -eq '90.0.1' -and $d.Exe -eq '90.0.1' -and -not $d.Masaustu -and $d.Baslat)
  Denetle 'kurucu kendini güncelleme önbelleğine kopyaladı (kurucu-sinama-updater\installer.exe)' (Test-Path -LiteralPath (Join-Path $guncelleyiciKlasoru 'installer.exe'))
  SagTik-Kurulu 'kuruldu' '90.0.1'
  # Bilgi: paketin içinden kurulan deneme kopyası gerçek kovana / klasörlere yazdı mı (sanallaştırma bu oturumda açık mı)
  Yaz "         gerçek görünüm: Uninstall kaydı $(Gercek-Anahtar-Var "$KALDIR_ANAHTARI\$DENEME_GUID"), Programs\KurucuSinama $(Gercek-Klasor-Var $denemeKlasoru), Başlat kısayolu $((Gercek-Dosya $baslatKisayolu) -ne '<yok>')"

  # -------------------------------------------------------------- B1. eski kurulu: Seçenekleri değiştirerek kur (İptal)
  Yaz 'B1. 90.0.1 kurulu, 90.0.2: Seçenekleri değiştirerek kur → … → Ek görevler, İptal'
  $p = Kurucu-Baslat $Yeni
  $w = Sihirbaz-Bekle -surec $p
  $s = Sayfa-Oku $w.Hwnd
  Denetle 'kurulu sürüm sayfası: eski sürüm, Güncelle seçili, İleri «Güncelle»' ($s.Baslik -eq 'KurucuSinama zaten kurulu' -and $s.Etiketler[0] -match '90\.0\.1 kurulu.*90\.0\.2 sürümünü' -and $s.Secenekler[0].Isaret -eq 1 -and $s.Ileri.Yazi -eq 'Güncelle') "«$($s.Baslik)» «$($s.Etiketler[0])» «$($s.Ileri.Yazi)»"
  Goruntu-Al $w.Hwnd 'akis-B1-surum-sayfasi'
  [KurucuSurucu]::Tikla($s.Secenekler[1].Hwnd) | Out-Null
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $sira = New-Object System.Collections.Generic.List[string]; $sira.Add($s.Baslik)
  foreach ($hedef in @('Lisans Sözleşmesi', 'Hedef dizini seçimi', 'Ek görevler')) {
    $g = Akisi-Izle $p $w.Hwnd $hedef 15000; $g | ForEach-Object { if ($sira[-1] -ne $_) { $sira.Add($_) } }
    if ($hedef -ne 'Ek görevler') { [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null }
  }
  Yaz "         sayfalar: $($sira -join ' → ')"
  $s = Sayfa-Oku $w.Hwnd
  Denetle 'lisans → klasör → Ek görevler; masaüstü kutusu kısayolun bugünkü durumuyla (boş)' (($sira -join '|') -eq 'KurucuSinama zaten kurulu|Lisans Sözleşmesi|Hedef dizini seçimi|Ek görevler' -and $s.OnayKutulari.Count -eq 1 -and $s.OnayKutulari[0].Isaret -eq 0)
  Goruntu-Al $w.Hwnd 'akis-B1-ek-gorevler'
  [KurucuSurucu]::Dugme($w.Hwnd, 2) | Out-Null
  $kod = [KurucuSurucu]::Bekle($p, 10000)
  $d = Deneme-Durumu
  Denetle 'İptal: kurucu kapandı, 90.0.1 yerinde' ($kod -ge 0 -and $d.Surum -eq '90.0.1' -and $d.Exe -eq '90.0.1') "çıkış $kod, sürüm $($d.Surum)"

  # -------------------------------------------------------------- B2. eski kurulu: Güncelle
  Yaz 'B2. 90.0.1 kurulu, 90.0.2: Güncelle (sağ tık DLL''i 90.0.1 yüklü, Gezgin gibi)'
  Onbellek-Isaretle
  $kilit = [SagTikKilit]::Yukle((SagTik-Dll '90.0.1'))
  Denetle 'sağ tık DLL''i (90.0.1) yüklendi' ($kilit -ne 0)
  $p = Kurucu-Baslat $Yeni
  $w = Sihirbaz-Bekle -surec $p
  $s = Sayfa-Oku $w.Hwnd
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $g = Akisi-Izle $p $w.Hwnd
  Yaz "         sayfalar: kurulu sürüm → $($g -join ' → ')"
  Denetle 'lisans, kip, klasör ve Ek görevler atlandı: doğrudan kurulum ve bitiş' (($g -join '|') -match '^Kurul[^|]*(\|Kurul[^|]*)*\|bitiş$') ($g -join ' → ')
  Bitir $p $w.Hwnd
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle '90.0.2 kuruldu; masaüstü kısayolu yine yok; Başlat kısayolu var' ($d.Surum -eq '90.0.2' -and $d.Exe -eq '90.0.2' -and -not $d.Masaustu -and $d.Baslat)
  Onbellek-Kaldi 'Güncelle'
  SagTik-Kurulu 'Güncelle (eski DLL yüklü)' '90.0.2' @('90.0.1')
  Denetle 'yüklü eski DLL''in PDEfe-yolu.txt''si de kaldı (eski DLL tıklanınca okur)' (Test-Path -LiteralPath (Join-Path $sagTikKok "90.0.1\$($sagTikDuzen.yolDosyasi)"))
  [SagTikKilit]::Birak($kilit) | Out-Null
  Denetle '.pdf varsayılanı değişmedi, Varsayılan Programlar kaydı deneme adıyla' ($d.Pdf -eq $onGoruntu['paket Classes\.pdf'] -and $d.Kayit -eq 'Software\KurucuSinama\Capabilities') "«$($d.Pdf)» «$($d.Kayit)»"

  # -------------------------------------------------------------- E1. /S (elle sessiz kurulum): pencere yok, masaüstü kısayolu oluşur (bugünkü gibi)
  # 0.2.9 denetimi: masaüstü kısayolu gerçek Masaüstü'ne düştüğü için yalnızca -MasaustuSina ile; varsayılan koşu --no-desktop-shortcut verir
  if ($MasaustuSina) {
    Yaz 'E1. 90.0.2 kurulu, 90.0.2 /S'
    $r = Sessiz-Kur $Yeni '/S'
  } else {
    Yaz 'E1. 90.0.2 kurulu, 90.0.2 /S --no-desktop-shortcut (masaüstü kısayolu yalnızca -MasaustuSina ile sınanır)'
    $r = Sessiz-Kur $Yeni '/S --no-desktop-shortcut'
  }
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle "pencere açılmadı, çıkış 0 ($($r.Sure) sn)" ($r.Kod -eq 0 -and $r.Pencereler.Count -eq 0) "çıkış $($r.Kod); pencereler: $($r.Pencereler -join ', ')"
  if ($MasaustuSina) { Denetle '/S bugünkü gibi: sürüm aynı, masaüstü kısayolu oluşturuldu' ($d.Surum -eq '90.0.2' -and $d.Masaustu -and $d.Baslat) }
  else { Denetle '/S --no-desktop-shortcut: sürüm aynı, masaüstü kısayolu yok, Başlat kısayolu var' ($d.Surum -eq '90.0.2' -and -not $d.Masaustu -and $d.Baslat) }
  SagTik-Kurulu '/S (eski DLL bırakıldıktan sonra: 90.0.1 klasörü silindi)' '90.0.2'

  # -------------------------------------------------------------- C1. aynı sürüm: Onar (masaüstü kısayolunun durumu korunur)
  Yaz "C1. 90.0.2 kurulu (masaüstü kısayolu $(if ($MasaustuSina) { 'var' } else { 'yok' })), 90.0.2: Onar (aynı sürümün sağ tık DLL'i yüklü)"
  Onbellek-Isaretle
  $kilit = [SagTikKilit]::Yukle((SagTik-Dll '90.0.2'))
  $p = Kurucu-Baslat $Yeni
  $w = Sihirbaz-Bekle -surec $p
  $s = Sayfa-Oku $w.Hwnd
  Denetle 'aynı sürüm: Onar seçili, İleri «Onar»' ($s.Baslik -eq 'KurucuSinama zaten kurulu' -and $s.Etiketler[0] -eq 'KurucuSinama 90.0.2 bu bilgisayarda zaten kurulu.' -and $s.Ileri.Yazi -eq 'Onar') "«$($s.Etiketler[0])» «$($s.Ileri.Yazi)»"
  Goruntu-Al $w.Hwnd 'akis-C1-ayni'
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $g = Akisi-Izle $p $w.Hwnd
  Yaz "         sayfalar: kurulu sürüm → $($g -join ' → ')"
  Denetle 'doğrudan kurulum ve bitiş' (($g -join '|') -match '^Kurul[^|]*(\|Kurul[^|]*)*\|bitiş$') ($g -join ' → ')
  Bitir $p $w.Hwnd
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle "onarıldı: sürüm aynı, masaüstü kısayolunun durumu ($(if ($MasaustuSina) { 'var' } else { 'yok' })) ve Başlat kısayolu korundu" ($d.Surum -eq '90.0.2' -and $d.Exe -eq '90.0.2' -and $d.Masaustu -eq [bool]$MasaustuSina -and $d.Baslat)
  Onbellek-Kaldi 'Onar'
  SagTik-Kurulu 'Onar (DLL yüklü: kopyalanamadı, var olan kaldı)' '90.0.2'
  [SagTikKilit]::Birak($kilit) | Out-Null

  # -------------------------------------------------------------- C2. aynı sürüm: Kaldır (PDEfe'nin kendi kaldırıcısı)
  Yaz 'C2. 90.0.2 kurulu, 90.0.2: Kaldır (sağ tık DLL''i yüklü)'
  Onbellek-Isaretle
  $kilit = [SagTikKilit]::Yukle((SagTik-Dll '90.0.2'))
  $p = Kurucu-Baslat $Yeni
  $w = Sihirbaz-Bekle -surec $p
  $s = Sayfa-Oku $w.Hwnd
  [KurucuSurucu]::Tikla($s.Secenekler[1].Hwnd) | Out-Null
  Denetle 'İleri «Kaldır»' ((Sayfa-Oku $w.Hwnd).Ileri.Yazi -eq 'Kaldır')
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $kod = [KurucuSurucu]::Bekle($p, 10000)
  Denetle 'kurucu kapandı' ($kod -ge 0) "çıkış $kod"
  Kaldiriciyi-Sur $p 'akis-C2-kaldirici'
  $kalanKayit = @(SagTik-Anahtarlari | Where-Object { Paket-Anahtar-Var $_ })
  # Değişkenin adı $RUNONCE sabitinden ayrı: PowerShell'de değişken adları büyük / küçük harf ayırmaz (önceden sabitin üzerine yazılıyor, sonraki
  # bütün RunOnce denetimleri ve temizlik boşa gidiyordu)
  $runOnceDegeri = Paket-Deger $RUNONCE $sagTikRunOnce
  $beklenenRunOnce = "`"$([Environment]::SystemDirectory)\cmd.exe`" /d /c rd /s /q `"$sagTikKok`" & rd `"$sagTikUst`""
  Denetle 'Kaldır (DLL yüklü): sağ tık kayıtları silindi, yüklü DLL''in klasörü kaldı' ($kalanKayit.Count -eq 0 -and (Test-Path -LiteralPath (SagTik-Dll '90.0.2'))) ($kalanKayit -join ', ')
  Denetle 'Kaldır (DLL yüklü): klasör bir sonraki oturum açılışında silinecek (HKCU RunOnce)' ($runOnceDegeri -ieq $beklenenRunOnce) "«$runOnceDegeri» ≠ «$beklenenRunOnce»"
  # 0.3.1 inceleme: Oturum kapanmadan yeniden kurulursa RunOnce silinmeli (yoksa oturum açılışında yeni kurulumun DLL klasörünü de silerdi)
  Yaz 'C2b. aynı oturumda (DLL hâlâ yüklü) 90.0.2 /S --no-desktop-shortcut: RunOnce silinir'
  $r = Sessiz-Kur $Yeni '/S --no-desktop-shortcut'
  Denetle "yeniden kuruldu ($($r.Sure) sn), RunOnce yok" ($r.Kod -eq 0 -and (Paket-Deger $RUNONCE $sagTikRunOnce) -eq '<yok>') "çıkış $($r.Kod); RunOnce «$(Paket-Deger $RUNONCE $sagTikRunOnce)»"
  SagTik-Kurulu 'Kaldır sonra aynı oturumda yeniden kur' '90.0.2'
  # Yeniden kaldır (DLL yine yüklü): RunOnce yeniden yazılır, aşağıda oturum açılışı benzetilir
  $p = Kurucu-Baslat $Yeni
  $w = Sihirbaz-Bekle -surec $p
  $s = Sayfa-Oku $w.Hwnd
  [KurucuSurucu]::Tikla($s.Secenekler[1].Hwnd) | Out-Null
  Denetle 'İleri «Kaldır»' ((Sayfa-Oku $w.Hwnd).Ileri.Yazi -eq 'Kaldır') "«$((Sayfa-Oku $w.Hwnd).Ileri.Yazi)»"
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $kod = [KurucuSurucu]::Bekle($p, 10000)
  Denetle 'kurucu kapandı' ($kod -ge 0) "çıkış $kod"
  Kaldiriciyi-Sur $p 'akis-C2b-kaldirici'
  $runOnceDegeri = Paket-Deger $RUNONCE $sagTikRunOnce
  Denetle 'Yeniden kaldır (DLL yüklü): RunOnce yeniden yazıldı' ($runOnceDegeri -ieq $beklenenRunOnce) "«$runOnceDegeri»"
  [SagTikKilit]::Birak($kilit) | Out-Null
  # Oturum açılışının yaptığı: RunOnce komutu çalışır, değer silinir
  if ($runOnceDegeri -match '^"([^"]+)" (.*)$') {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Matches[1]; $psi.Arguments = $Matches[2]; $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    [System.Diagnostics.Process]::Start($psi).WaitForExit(15000) | Out-Null
    $r = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($RUNONCE, $true); if ($r) { $r.DeleteValue($sagTikRunOnce, $false); $r.Close() }
  }
  SagTik-Silindi 'Kaldır, sonra oturum açılışı (RunOnce komutu)'

  # -------------------------------------------------------------- D. daha yeni kurulu: Vazgeç / Eski sürüme dön
  Yaz 'D0. tohum: 90.0.2 /S --no-desktop-shortcut'
  $r = Sessiz-Kur $Yeni '/S --no-desktop-shortcut'
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle "pencere açılmadı, 90.0.2 kuruldu, masaüstü kısayolu yok ($($r.Sure) sn)" ($r.Kod -eq 0 -and $r.Pencereler.Count -eq 0 -and $d.Surum -eq '90.0.2' -and -not $d.Masaustu)
  Yaz 'D1. 90.0.2 kurulu, 90.0.1: Vazgeç'
  $p = Kurucu-Baslat $Eski
  $w = Sihirbaz-Bekle -surec $p
  $s = Sayfa-Oku $w.Hwnd
  Denetle 'daha yeni sürüm: Vazgeç seçili, İleri «Kapat»' ($s.Baslik -eq 'Daha yeni bir sürüm kurulu' -and $s.Secenekler[0].Isaret -eq 1 -and $s.Ileri.Yazi -eq 'Kapat') "«$($s.Baslik)» «$($s.Ileri.Yazi)»"
  Goruntu-Al $w.Hwnd 'akis-D1-yeni'
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $kod = [KurucuSurucu]::Bekle($p, 10000)
  $d = Deneme-Durumu
  Denetle 'Vazgeç: kurucu kapandı, 90.0.2 yerinde' ($kod -ge 0 -and $d.Surum -eq '90.0.2' -and $d.Exe -eq '90.0.2') "çıkış $kod"
  Yaz 'D2. 90.0.2 kurulu, 90.0.1: Eski sürüme dön'
  Onbellek-Isaretle
  $p = Kurucu-Baslat $Eski
  $w = Sihirbaz-Bekle -surec $p
  $s = Sayfa-Oku $w.Hwnd
  [KurucuSurucu]::Tikla($s.Secenekler[1].Hwnd) | Out-Null
  Denetle 'İleri «Kur»' ((Sayfa-Oku $w.Hwnd).Ileri.Yazi -eq 'Kur')
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $g = Akisi-Izle $p $w.Hwnd
  Yaz "         sayfalar: kurulu sürüm → $($g -join ' → ')"
  Denetle 'doğrudan kurulum ve bitiş' (($g -join '|') -match '^Kurul[^|]*(\|Kurul[^|]*)*\|bitiş$') ($g -join ' → ')
  Bitir $p $w.Hwnd
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle 'eski sürüme dönüldü: 90.0.1, masaüstü kısayolu yine yok' ($d.Surum -eq '90.0.1' -and $d.Exe -eq '90.0.1' -and -not $d.Masaustu -and $d.Baslat)
  Onbellek-Kaldi 'Eski sürüme dön'
  SagTik-Kurulu 'Eski sürüme dön' '90.0.1'

  # -------------------------------------------------------------- D3. eski kurulu: Kaldır (0.2.3, onaylanan plandaki üçüncü seçenek)
  Yaz 'D3. 90.0.1 kurulu, 90.0.2: Kaldır'
  Onbellek-Isaretle
  $p = Kurucu-Baslat $Yeni
  $w = Sihirbaz-Bekle -surec $p
  $s = Sayfa-Oku $w.Hwnd
  Denetle 'eski sürüm: üç seçenek, sonuncusu Kaldır' ($s.Baslik -eq 'KurucuSinama zaten kurulu' -and $s.Secenekler.Count -eq 3 -and $s.Secenekler[0].Isaret -eq 1 -and $s.Secenekler[2].Yazi -eq '&Kaldır') "«$($s.Baslik)» $(($s.Secenekler | ForEach-Object Yazi) -join ', ')"
  [KurucuSurucu]::Tikla($s.Secenekler[2].Hwnd) | Out-Null
  Denetle 'İleri «Kaldır»' ((Sayfa-Oku $w.Hwnd).Ileri.Yazi -eq 'Kaldır')
  Goruntu-Al $w.Hwnd 'akis-D3-eski-kaldir'
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $kod = [KurucuSurucu]::Bekle($p, 10000)
  Denetle 'kurucu kapandı, kurmadı' ($kod -ge 0 -and (Deneme-Durumu).Exe -ne '90.0.2') "çıkış $kod"
  Kaldiriciyi-Sur $p 'akis-D3-kaldirici'
  SagTik-Silindi 'Kaldır (DLL yüklü değil)'
  # E2 için 90.0.1 yeniden (masaüstü kısayolu yok, D2'den sonraki gibi)
  Yaz 'D4. tohum: 90.0.1 /S --no-desktop-shortcut'
  $r = Sessiz-Kur $Eski '/S --no-desktop-shortcut'
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle "pencere açılmadı, 90.0.1 kuruldu, masaüstü kısayolu yok ($($r.Sure) sn)" ($r.Kod -eq 0 -and $r.Pencereler.Count -eq 0 -and $d.Surum -eq '90.0.1' -and $d.Exe -eq '90.0.1' -and -not $d.Masaustu -and $d.Baslat)

  # -------------------------------------------------------------- E2. uygulama içi güncelleme yolu: --updated /S
  Yaz 'E2. 90.0.1 kurulu, 90.0.2 --updated /S (uygulama içi güncellemenin komutu, --force-run olmadan)'
  Onbellek-Isaretle
  $r = Sessiz-Kur $Yeni '--updated /S'
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle "pencere açılmadı, çıkış 0 ($($r.Sure) sn)" ($r.Kod -eq 0 -and $r.Pencereler.Count -eq 0) "çıkış $($r.Kod); pencereler: $($r.Pencereler -join ', ')"
  Denetle '90.0.2 kuruldu, KeepShortcuts true, masaüstü kısayolu yine yok, uygulama açılmadı' ($d.Surum -eq '90.0.2' -and $d.Exe -eq '90.0.2' -and $d.KeepShortcuts -eq 'true' -and -not $d.Masaustu -and $d.Baslat -and @(Get-Process -Name KurucuSinama -ErrorAction SilentlyContinue).Count -eq 0)
  Onbellek-Kaldi '--updated /S'
  SagTik-Kurulu '--updated /S' '90.0.2'

  # -------------------------------------------------------------- E3. aynı sürüm üstüne --updated /S, Gezgin aynı sürüm klasöründeki DLL'i yüklü tutarken
  # (yayımlanmamış ara derleme sürüm numarasını artırmadan kurulur: DLL kopyalanamaz, kurulum takılmamalı, hata vermemeli, var olan DLL ve kayıtlar yerinde kalmalı)
  Yaz 'E3. 90.0.2 kurulu, 90.0.2 --updated /S (aynı sürümün sağ tık DLL''i yüklü)'
  Onbellek-Isaretle
  $kilit = [SagTikKilit]::Yukle((SagTik-Dll '90.0.2'))
  Denetle 'sağ tık DLL''i (90.0.2) yüklendi' ($kilit -ne 0)
  $dllOzetOnce = (Get-FileHash -LiteralPath (SagTik-Dll '90.0.2')).Hash
  $dllSilinmez = $false
  try { Remove-Item -LiteralPath (SagTik-Dll '90.0.2') -Force -ErrorAction Stop } catch { $dllSilinmez = $true }
  Denetle 'yüklü DLL silinemiyor (kilit gerçek)' ($dllSilinmez -and (Test-Path -LiteralPath (SagTik-Dll '90.0.2')))
  $r = Sessiz-Kur $Yeni '--updated /S'
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle "pencere açılmadı, takılmadı, çıkış 0 ($($r.Sure) sn)" ($r.Kod -eq 0 -and $r.Pencereler.Count -eq 0 -and $r.Sure -lt 120) "çıkış $($r.Kod); $($r.Sure) sn; pencereler: $($r.Pencereler -join ', ')"
  Denetle '90.0.2 yerinde, KeepShortcuts true, masaüstü kısayolu yine yok, uygulama açılmadı' ($d.Surum -eq '90.0.2' -and $d.Exe -eq '90.0.2' -and $d.KeepShortcuts -eq 'true' -and -not $d.Masaustu -and $d.Baslat -and @(Get-Process -Name KurucuSinama -ErrorAction SilentlyContinue).Count -eq 0)
  Denetle 'yüklü DLL aynen yerinde (hâlâ yüklenebiliyor), RunOnce yok' ((Get-FileHash -LiteralPath (SagTik-Dll '90.0.2')).Hash -eq $dllOzetOnce -and (Paket-Deger $RUNONCE $sagTikRunOnce) -eq '<yok>') "RunOnce «$(Paket-Deger $RUNONCE $sagTikRunOnce)»"
  Onbellek-Kaldi '--updated /S (aynı sürüm)'
  SagTik-Kurulu '--updated /S aynı sürüm (DLL yüklü: kopyalanamadı, var olan kaldı)' '90.0.2'
  [SagTikKilit]::Birak($kilit) | Out-Null

  # -------------------------------------------------------------- F. bozuk kurulum: program dosyası silinmiş, Onar
  Yaz 'F. 90.0.2 kurulu ama KurucuSinama.exe yok, 90.0.2: Onar'
  Remove-Item -LiteralPath $denemeExe -Force
  $p = Kurucu-Baslat $Yeni
  $w = Sihirbaz-Bekle -surec $p
  $s = Sayfa-Oku $w.Hwnd
  Denetle 'bozuk: başlık ve metin' ($s.Baslik -eq 'KurucuSinama kurulumu eksik' -and $s.Etiketler[0] -eq 'KurucuSinama 90.0.2 kurulu görünüyor ama program dosyaları eksik.' -and $s.Ileri.Yazi -eq 'Onar') "«$($s.Baslik)» «$($s.Etiketler[0])»"
  Goruntu-Al $w.Hwnd 'akis-F-bozuk'
  [KurucuSurucu]::Dugme($w.Hwnd, 1) | Out-Null
  $g = Akisi-Izle $p $w.Hwnd
  Yaz "         sayfalar: kurulu sürüm → $($g -join ' → ')"
  Bitir $p $w.Hwnd
  $d = Deneme-Durumu; Durum-Yaz $d
  Denetle 'onarıldı: program dosyası geri geldi' ($d.Surum -eq '90.0.2' -and $d.Exe -eq '90.0.2')
} finally {
  # -------------------------------------------------------------- temizlik
  Yaz 'T. temizlik'
  foreach ($w in (Pencereleri-Oku | Where-Object { $_.Gorunur })) { Yaz "         kalan pencere kapatılıyor: $($w.Sinif) «$($w.Baslik)» ($($w.Pid))"; [KurucuSurucu]::Sonlandir($w.Pid) }
  # .pdf varsayılanı (0.2.3, bağımsız incelemenin bulgusu): deneme kurucusu onu önce KurucuSinama.pdf yapar (APP_ASSOCIATE), sonra eski değeri
  # geri koyar (customInstall). Kurucu ikisinin arasında sonlandırıldıysa (Sessiz-Kur 300 sn sınırı, kalan pencere) değer deneme ProgId'sinde
  # kalır; deneme kaldırıcısı da onu siler (customUnInstall) ve önceki değer (örneğin PDEfe.pdf) kaybolurdu. Kaldırıcıdan önce ön görüntüdeki
  # değer geri yazılır. Kurucular bu PowerShell'in görünümünde çalışır: yalnızca paket görünümüne yazılır; gerçek kovanda deneme ProgId'si
  # görülürse (olmamalı) yazılmaz, son görüntünün karşılaştırması HATA verir.
  function Pdf-Varsayilani-Geri([string]$an) {
    if ((Paket-Deger 'Software\Classes\.pdf' '') -ne 'KurucuSinama.pdf') { return }
    $once = $onGoruntu['paket Classes\.pdf']
    if ($once -eq '<yok>') { Remove-ItemProperty -LiteralPath 'Registry::HKEY_CURRENT_USER\Software\Classes\.pdf' -Name '(default)' -ErrorAction SilentlyContinue }
    else { Set-ItemProperty -LiteralPath 'Registry::HKEY_CURRENT_USER\Software\Classes\.pdf' -Name '(default)' -Value $once }
    Yaz "         .pdf varsayılanı deneme ProgId'sinde kalmıştı ($an): ön görüntüdeki «$once» geri yazıldı (paket görünümü)"
  }
  Pdf-Varsayilani-Geri 'kaldırmadan önce'
  Kalintilari-Temizle
  [KurucuSurucu]::MasaKapat()
  Pdf-Varsayilani-Geri 'kaldırmadan sonra'
}

# ------------------------------------------------------------------ son görüntü
Yaz 'S. son görüntü'
$izler = Deneme-Izleri
Denetle 'deneme kopyasının hiçbir izi kalmadı (gerçek kovan, paket görünümü, klasörler, kısayollar, süreçler)' ($izler.Count -eq 0) ($izler -join '; ')
$sonGoruntu = Gercek-Pdefe-Goruntusu
$farklar = @($onGoruntu.Keys | Where-Object { $onGoruntu[$_] -ne $sonGoruntu[$_] } | ForEach-Object { "$_ : «$($onGoruntu[$_])» → «$($sonGoruntu[$_])»" })
Denetle "gerçek PDEfe'nin kayıtları ve dosyası aynı ($($onGoruntu.Count) değer)" ($farklar.Count -eq 0) ($farklar -join '; ')
$ozet = if ($script:hatalar) { "SONUÇ: $($script:hatalar) HATA" } else { 'SONUÇ: hepsi TAMAM' }
Yaz $ozet
[System.IO.File]::WriteAllLines((Join-Path $Cikti 'kurucu_akis.txt'), $script:rapor, $utf8Bom)
if ($script:hatalar) { exit 1 }
