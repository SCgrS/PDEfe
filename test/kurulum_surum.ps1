# Kurucunun kurulu sürüm sayfası (0.2.3, build\installer.nsh customWelcomePage), yalnızca sayfa düzeyinde: hiçbir şey kurulmaz.
# build\installer.nsh'i içeri alan küçük bir koşum derlenir (electron-builder'ın önbelleğindeki makensis -WX, Unicode, Türkçe, lisans ve klasör
# sayfaları electron-builder'daki gibi skipPageIfUpdated ile, Ek görevler sayfası, boş kurulum bölümü). Kurulu sürüm, koşumun kendi kayıt
# anahtarından okunur (HKCU\Software\PDEfeSayfaSinama; .onInit /SURUM= ve /KLASOR= ile yazar, kapanışta silinir). Koşum görünmeyen ayrı bir
# Windows masaüstünde çalıştırılır (test\kurucu_surucu.cs): ekrana pencere açılmaz, odak çalınmaz. Durumlar: kurulu değil, eski, aynı,
# bozuk (kayıt var, program dosyası yok), daha yeni, PDEfe açık; her birinde sayfanın görüntüsü (PNG), başlıklar, İleri düğmesinin yazısı,
# metinlerin sığdığı ve seçimden sonraki akış (hangi sayfaya gidildiği, kip / masaüstü kısayolu kararı, kaldırıcının açılması, kapanış).
# Kullanım: powershell -File test\kurulum_surum.ps1 -Cikti <klasör> [-Nsh <installer.nsh>] [-Bekle 1500]
param(
  [Parameter(Mandatory = $true)][string]$Cikti,
  [string]$Nsh = "",
  [int]$Bekle = 1500
)
$ErrorActionPreference = 'Stop'
$kok = Split-Path -Parent $PSScriptRoot
if (-not $Nsh) { $Nsh = Join-Path $kok 'build\installer.nsh' }
$Nsh = [System.IO.Path]::GetFullPath($Nsh)
$Cikti = [System.IO.Path]::GetFullPath($Cikti)
New-Item -ItemType Directory -Force $Cikti | Out-Null
$onbellek = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache'
$makensis = Get-ChildItem $onbellek -Recurse -Filter makensis.exe -ErrorAction SilentlyContinue | Where-Object { $_.Directory.Name -eq 'Bin' } | Select-Object -First 1
if (-not $makensis) { throw 'makensis.exe bulunamadı (önce bir kez electron-builder ile Windows derlemesi yapın).' }
$eklentiler = Get-ChildItem $onbellek -Recurse -Directory -Filter 'x86-unicode' -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName 'nsProcess.dll') } | Select-Object -First 1
if (-not $eklentiler) { throw 'NSIS eklentileri (nsis-resources, x86-unicode) bulunamadı.' }
$sablon = Join-Path $kok 'node_modules\app-builder-lib\templates\nsis'

$gecici = Join-Path $env:TEMP ("pdefe-surum-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $gecici | Out-Null
$utf8Bom = New-Object System.Text.UTF8Encoding $true

function Derle([string]$ad, [string]$metin) {
  $nsi = Join-Path $gecici "$ad.nsi"
  [System.IO.File]::WriteAllText($nsi, $metin, $utf8Bom)
  $cikis = & $makensis.FullName -WX -V2 -INPUTCHARSET UTF8 $nsi 2>&1
  if ($LASTEXITCODE -ne 0) { throw "makensis başarısız ($ad, çıkış $LASTEXITCODE):`n$($cikis -join "`n")" }
}

# İşaretçi: penceresiz küçük exe. /ISARET=<dosya> komut satırını dosyaya yazar, /BEKLE=<ms> bekler. Kurulu klasördeki program ve kaldırıcı
# (KurucuSinama.exe, "Uninstall KurucuSinama.exe") ve "PDEfe açık" durumundaki süreç bundan kopyalanır.
$isaretci = Join-Path $gecici 'isaretci.exe'
Derle 'isaretci' @"
Unicode true
SilentInstall silent
RequestExecutionLevel user
OutFile "$isaretci"
Name "Isaretci"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
Section
  `${GetParameters} `$0
  ClearErrors
  `${GetOptions} `$0 "/ISARET=" `$1
  `${IfNot} `${Errors}
    FileOpen `$2 `$1 w
    FileWrite `$2 "`$0"
    FileClose `$2
  `${EndIf}
  ClearErrors
  `${GetOptions} `$0 "/BEKLE=" `$1
  `${IfNot} `${Errors}
    Sleep `$1
  `${EndIf}
SectionEnd
"@

function KosumDerle([string]$surum) {
  $exe = Join-Path $gecici "kosum-$surum.exe"
  Derle "kosum-$surum" @"
Unicode true
!addincludedir "$sablon\include"
!addplugindir /x86-unicode "$($eklentiler.FullName)"
!include "StdUtils.nsh"
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsProcess.nsh"
Name "PDEfe"
OutFile "$exe"
RequestExecutionLevel user
InstallDir "`$LOCALAPPDATA\PDEfeSayfaSinama"
!define MUI_WELCOMEFINISHPAGE_BITMAP "`${NSISDIR}\Contrib\Graphics\Wizard\nsis3-metro.bmp"
!define MUI_ICON "$(Join-Path $kok 'build\icon.ico')"

; electron-builder'ın betik başına koyduğu tanımlardan koşumun gerektirdikleri (nsisScriptGenerator.js, common.nsh, multiUser.nsh)
!macro _isUpdated _a _b _t _f
  `${StdUtils.TestParameter} `$R9 "updated"
  StrCmp "`$R9" "true" "`${_t}" "`${_f}"
!macroend
!define isUpdated ``"" isUpdated ""``
!define VERSION "$surum"
!define APP_ID "com.cgrshn.kurucusinama"
!define PRODUCT_NAME "PDEfe"
!define PRODUCT_FILENAME "KurucuSinama"
!define APP_EXECUTABLE_FILENAME "KurucuSinama.exe"
!define UNINSTALL_FILENAME "Uninstall KurucuSinama.exe"
!define INSTALL_REGISTRY_KEY "Software\PDEfeSayfaSinama"
!define UNINSTALL_REGISTRY_KEY "Software\PDEfeSayfaSinama\Uninstall"
!define PDEFE_KAYIT_ADI "PDEfeSayfaSinama"
!define PDEFE_PROGID "PDEfeSayfaSinama.pdf"
!define HIDE_RUN_AFTER_FINISH
Var installMode

; common.nsh'teki skipPageIfUpdated'ın kopyası: lisans ve klasör sayfalarının atlanması electron-builder'daki gibi
!macro skipPageIfUpdated
  !define UniqueID `${__LINE__}
  Function skipPageIfUpdated_`${UniqueID}
    `${if} `${isUpdated}
      Abort
    `${endif}
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_PRE skipPageIfUpdated_`${UniqueID}
  !undef UniqueID
!macroend

; electron-builder'ın lisans sayfası makrosu (nsisLicense.js); installer.nsh lisans sayfasının gösterim işlevini buna göre tanımlar
!macro licensePage
  !insertmacro MUI_PAGE_LICENSE "$(Join-Path $kok 'LICENSE')"
!macroend

!include "$Nsh"

!insertmacro customWelcomePage
!insertmacro skipPageIfUpdated
!insertmacro licensePage
!insertmacro skipPageIfUpdated
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro customPageAfterChangeDir
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Turkish"

Function .onInit
  SetShellVarContext current
  StrCpy `$installMode "CurrentUser"
  `${GetParameters} `$R0
  ClearErrors
  `${GetOptions} `$R0 "/SURUM=" `$R1
  `${IfNot} `${Errors}
    WriteRegStr HKCU "`${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "`$R1"
  `${EndIf}
  ClearErrors
  `${GetOptions} `$R0 "/KLASOR=" `$R1
  `${IfNot} `${Errors}
    WriteRegStr HKCU "`${INSTALL_REGISTRY_KEY}" "InstallLocation" "`$R1"
    WriteRegStr HKCU "`${INSTALL_REGISTRY_KEY}" "ShortcutName" "PDEfeSayfaSinama-yok"
    WriteRegStr HKCU "`${UNINSTALL_REGISTRY_KEY}" "UninstallString" '"`$R1\`${UNINSTALL_FILENAME}" /currentuser /ISARET=`$R1\kaldirici-calisti.txt'
  `${EndIf}
  !insertmacro customInit
FunctionEnd

Function .onGUIEnd
  DeleteRegKey HKCU "`${INSTALL_REGISTRY_KEY}"
FunctionEnd

Section
  ; Kurulum yok: yalnızca sayfaların verdiği kararlar dosyaya yazılır
  `${GetParameters} `$R0
  ClearErrors
  `${GetOptions} `$R0 "/SONUC=" `$R1
  `${IfNot} `${Errors}
    FileOpen `$0 `$R1 w
    FileWrite `$0 "kip=`$pdefeKip masaustu=`$pdefeMasaustuKisayolu eskipdf=`$pdefeEskiPdfSinifi"
    FileClose `$0
  `${EndIf}
SectionEnd
"@
  return $exe
}

$kosum = KosumDerle '0.2.3'
$kosumSayisal = KosumDerle '0.2.10'

# Kurulu klasörler: tam (program ve kaldırıcı var) ve boş (bozuk kurulum)
$klasorTam = Join-Path $gecici 'kurulu'
$klasorBos = Join-Path $gecici 'bozuk'
New-Item -ItemType Directory -Force $klasorTam, $klasorBos | Out-Null
Copy-Item $isaretci (Join-Path $klasorTam 'KurucuSinama.exe')
Copy-Item $isaretci (Join-Path $klasorTam 'Uninstall KurucuSinama.exe')
$acikKlasor = Join-Path $gecici 'acik'
New-Item -ItemType Directory -Force $acikKlasor | Out-Null
Copy-Item $isaretci (Join-Path $acikKlasor 'KurucuSinama.exe')

$kaynak = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'kurucu_surucu.cs'), [System.Text.Encoding]::UTF8)
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $kaynak

# ------------------------------------------------------------------ yardımcılar
$script:hatalar = 0
$script:rapor = New-Object System.Collections.Generic.List[string]
function Yaz([string]$s) { $script:rapor.Add($s); Write-Output $s }
function Denetle([string]$ad, [bool]$kosul, [string]$ayrinti = '') {
  if ($kosul) { Yaz "  TAMAM  $ad" } else { $script:hatalar++; Yaz "  HATA   $ad $ayrinti" }
}
function Pencereleri-Oku {
  [KurucuSurucu]::Pencereler() -split "`n" | Where-Object { $_ } | ForEach-Object {
    $p = $_ -split "`t"
    [pscustomobject]@{ Hwnd = [long]$p[0]; Pid = [int]$p[1]; Sinif = $p[2]; Gorunur = $p[3] -eq '1'; Sahip = [long]$p[4]; Baslik = $p[5] }
  }
}
function Sihirbaz-Bekle([int]$surec, [int]$ms = 10000) {
  $son = [DateTime]::Now.AddMilliseconds($ms)
  while ([DateTime]::Now -lt $son) {
    $w = Pencereleri-Oku | Where-Object { $_.Pid -eq $surec -and $_.Gorunur -and $_.Sinif -eq '#32770' -and $_.Sahip -eq 0 } | Select-Object -First 1
    if ($w) { return $w.Hwnd }
    if ([KurucuSurucu]::Bekle($surec, 0) -ge 0) { return 0 }
    Start-Sleep -Milliseconds 150
  }
  return 0
}
function Ileti-Bekle([long]$sahip, [int]$ms = 5000) {
  $son = [DateTime]::Now.AddMilliseconds($ms)
  while ([DateTime]::Now -lt $son) {
    $w = Pencereleri-Oku | Where-Object { $_.Gorunur -and $_.Sinif -eq '#32770' -and $_.Sahip -eq $sahip } | Select-Object -First 1
    if ($w) {
      $d = Sayfa-Oku $w.Hwnd
      return [pscustomobject]@{ Hwnd = $w.Hwnd; Metin = (($d.Denetimler | Where-Object { $_.Kimlik -eq 65535 -or ($_.Sinif -eq 'Static' -and $_.Yazi) }) | ForEach-Object Yazi) -join ' '; Varsayilan = ($d.Denetimler | Where-Object { $_.Sinif -eq 'Button' -and (($_.Bicem -band 0xF) -eq 1) } | ForEach-Object Kimlik) }
    }
    Start-Sleep -Milliseconds 150
  }
  return $null
}
function Sayfa-Oku([long]$hwnd) {
  $denetimler = [KurucuSurucu]::Denetimler($hwnd) -split "`n" | Where-Object { $_ } | ForEach-Object {
    $p = $_ -split "`t"
    [pscustomobject]@{ Hwnd = [long]$p[0]; Ust = [long]$p[1]; Sinif = $p[2]; Kimlik = [int]$p[3]; Bicem = [int]$p[4]; Gorunur = $p[5] -eq '1'; Etkin = $p[6] -eq '1'; Isaret = [long]$p[7]; X = [int]$p[8]; Y = [int]$p[9]; En = [int]$p[10]; Boy = [int]$p[11]; Yazi = $p[12] }
  }
  $bul = { param($id) $denetimler | Where-Object { $_.Kimlik -eq $id -and $_.Ust -eq $hwnd } | Select-Object -First 1 }
  [pscustomobject]@{
    Hwnd = $hwnd
    Baslik = (& $bul 1037).Yazi
    AltBaslik = (& $bul 1038).Yazi
    Ileri = (& $bul 1)
    Iptal = (& $bul 2)
    Geri = (& $bul 3)
    Secenekler = @($denetimler | Where-Object { $_.Sinif -eq 'Button' -and $_.Gorunur -and (($_.Bicem -band 0xF) -in 4, 9) } | Sort-Object Y)
    OnayKutulari = @($denetimler | Where-Object { $_.Sinif -eq 'Button' -and $_.Gorunur -and (($_.Bicem -band 0xF) -in 2, 3) } | Sort-Object Y)
    Etiketler = @($denetimler | Where-Object { $_.Sinif -eq 'Static' -and $_.Gorunur -and $_.Yazi -and $_.Ust -ne $hwnd } | Sort-Object Y | ForEach-Object Yazi)
    Denetimler = $denetimler
  }
}
# Başlık değişene (yeni sayfa) ya da süreç bitene dek bekler
function Gecis-Bekle([int]$surec, [long]$hwnd, [string]$eskiBaslik, [int]$ms = 10000) {
  $son = [DateTime]::Now.AddMilliseconds($ms)
  while ([DateTime]::Now -lt $son) {
    if ([KurucuSurucu]::Bekle($surec, 0) -ge 0) { return $null }
    $s = Sayfa-Oku $hwnd
    if ($s.Baslik -ne $eskiBaslik) { Start-Sleep -Milliseconds 300; return (Sayfa-Oku $hwnd) }
    Start-Sleep -Milliseconds 150
  }
  return (Sayfa-Oku $hwnd)
}
function Goruntu-Al([long]$hwnd, [string]$ad) {
  $png = Join-Path $Cikti "$ad.png"
  $olcu = [KurucuSurucu]::Goruntu($hwnd, $png)
  foreach ($satir in ($olcu -split "`r?`n" | Where-Object { $_ })) {
    # NSIS'in kendi Türkçe lisans düğmesi (0.2.2'de de) bu ölçüye sığmıyor; bu iş kapsamında değil, bilgi olarak yazılır
    if ($satir -match '^TAŞIYOR  düğme .*: Kabul Ediyorum$') { Yaz "  BİLİNEN $satir (NSIS'in stok metni)" }
    elseif ($satir -match '^TAŞIYOR') { $script:hatalar++; Yaz "  HATA   $satir" }
    else { Yaz "         $satir" }
  }
  Yaz "         görüntü: $png"
}
function Kosum-Baslat([string]$exe, [string]$arg, [string]$sonuc) {
  if ($sonuc) { Remove-Item -LiteralPath $sonuc -ErrorAction SilentlyContinue; $arg = "$arg /SONUC=$sonuc" }
  $surec = [KurucuSurucu]::Baslat("`"$exe`" $arg", $gecici)
  if ($surec -le 0) { throw "koşum başlatılamadı: $surec" }
  Start-Sleep -Milliseconds $Bekle
  return $surec
}
function Sonuc-Oku([string]$f, [int]$ms = 8000) {
  $son = [DateTime]::Now.AddMilliseconds($ms)
  while ([DateTime]::Now -lt $son) { if (Test-Path -LiteralPath $f) { Start-Sleep -Milliseconds 200; return (Get-Content -LiteralPath $f -Raw) }; Start-Sleep -Milliseconds 150 }
  return ''
}
function Kapat([int]$surec) {
  if ([KurucuSurucu]::Bekle($surec, 0) -lt 0) { [KurucuSurucu]::Sonlandir($surec) }
  # TerminateProcess .onGUIEnd'i atlar: koşumun kayıt anahtarı burada silinir (aynı bağlamda: paket içinden çalışıyorsa sanal kovanda)
  Remove-Item -Path 'HKCU:\Software\PDEfeSayfaSinama' -Recurse -Force -ErrorAction SilentlyContinue
}
$ileriYazisi = 'İ&leri >'

$sonucDosyasi = Join-Path $gecici 'sonuc.txt'
$durum = [KurucuSurucu]::MasaKur('PDEfeSurum' + $PID)
if ($durum -ne 'tamam') { throw $durum }
try {
  # -------------------------------------------------------------- 1. kurulu değil: sihirbaz bugünkü gibi lisans sayfasıyla başlar
  Yaz '1. kurulu değil'
  $s1 = Kosum-Baslat $kosum '' $sonucDosyasi
  $w = Sihirbaz-Bekle $s1
  $s = Sayfa-Oku $w
  Denetle 'ilk sayfa lisans' ($s.Baslik -eq 'Lisans Sözleşmesi') "başlık «$($s.Baslik)»"
  # 0.2.2'deki gibi Geri gizli: görünseydi basılınca sihirbaz kapanıyordu (atlanan kurulu sürüm sayfasının da önüne gidiliyordu)
  Denetle 'lisans ilk sayfa: Geri düğmesi gizli' (-not $s.Geri.Gorunur) "görünür $($s.Geri.Gorunur), etkin $($s.Geri.Etkin)"
  Goruntu-Al $w 'surum-1-kurulu-degil-lisans'
  [KurucuSurucu]::Dugme($w, 3) | Out-Null
  Start-Sleep -Milliseconds 800
  $s2 = Sayfa-Oku $w
  Denetle 'gizli Geri''ye basılamaz: sihirbaz açık, lisans sayfasında' (([KurucuSurucu]::Bekle($s1, 0) -lt 0) -and $s2.Baslik -eq 'Lisans Sözleşmesi') "başlık «$($s2.Baslik)»"
  [KurucuSurucu]::Dugme($w, 1) | Out-Null   # Kabul Ediyorum
  $s = Gecis-Bekle $s1 $w 'Lisans Sözleşmesi'
  Denetle 'lisanstan sonra klasör sayfası' ($s.Baslik -eq 'Hedef dizini seçimi') "başlık «$($s.Baslik)»"
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $s = Gecis-Bekle $s1 $w $s.Baslik
  Denetle 'klasörden sonra Ek görevler' ($s.Baslik -eq 'Ek görevler') "başlık «$($s.Baslik)»"
  Denetle 'Ek görevler: masaüstü kutusu işaretli (yeni kurulum)' ($s.OnayKutulari.Count -eq 1 -and $s.OnayKutulari[0].Isaret -eq 1)
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $r = Sonuc-Oku $sonucDosyasi
  Denetle 'kurulum bölümü: kip boş, masaüstü 1' ($r -match '^kip= masaustu=1') "«$r»"
  Kapat $s1

  # -------------------------------------------------------------- 2. eski sürüm kurulu: Güncelle
  Yaz '2. eski sürüm (0.2.2) kurulu, Güncelle'
  $s2 = Kosum-Baslat $kosum "/SURUM=0.2.2 /KLASOR=$klasorTam" $sonucDosyasi
  $w = Sihirbaz-Bekle $s2
  $s = Sayfa-Oku $w
  Denetle 'başlık' ($s.Baslik -eq 'PDEfe zaten kurulu' -and $s.AltBaslik -eq 'Ne yapmak istediğinizi seçin.') "«$($s.Baslik)» / «$($s.AltBaslik)»"
  Denetle 'metin sürümleri söylüyor' ($s.Etiketler[0] -eq 'Bilgisayarınızda PDEfe 0.2.2 kurulu. Bu kurucu daha yeni olan 0.2.3 sürümünü kurar.') "«$($s.Etiketler[0])»"
  Denetle 'iki seçenek, Güncelle seçili' ($s.Secenekler.Count -eq 2 -and $s.Secenekler[0].Isaret -eq 1 -and $s.Secenekler[1].Isaret -eq 0 -and $s.Secenekler[0].Yazi -eq '&Güncelle (önerilen)')
  Denetle 'İleri düğmesi «Güncelle»' ($s.Ileri.Yazi -eq 'Güncelle') "«$($s.Ileri.Yazi)»"
  Denetle 'Geri düğmesi kapalı (ilk sayfa)' (-not ($s.Geri.Gorunur -and $s.Geri.Etkin))
  Denetle '"PDEfe açık" uyarısı yok' (-not ($s.Etiketler -match 'şu anda açık'))
  Goruntu-Al $w 'surum-2-eski'
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $s = Gecis-Bekle $s2 $w $s.Baslik
  Denetle 'lisans, klasör ve Ek görevler atlandı: kurulum sayfası' ($s.Baslik -match '^Kurul') "başlık «$($s.Baslik)»"
  $r = Sonuc-Oku $sonucDosyasi
  Denetle 'kip=guncelle, masaüstü kısayolu bugünkü gibi yok (0)' ($r -match '^kip=guncelle masaustu=0') "«$r»"
  Kapat $s2

  # -------------------------------------------------------------- 3. eski sürüm kurulu: Seçenekleri değiştirerek kur
  Yaz '3. eski sürüm kurulu, Seçenekleri değiştirerek kur'
  $s3 = Kosum-Baslat $kosum "/SURUM=0.2.2 /KLASOR=$klasorTam" $sonucDosyasi
  $w = Sihirbaz-Bekle $s3
  $s = Sayfa-Oku $w
  $isaret = [KurucuSurucu]::Tikla($s.Secenekler[1].Hwnd)
  $s = Sayfa-Oku $w
  Denetle 'ikinci seçenek seçildi, İleri düğmesi «İleri >»' ($isaret -eq 1 -and $s.Secenekler[0].Isaret -eq 0 -and $s.Ileri.Yazi -eq $ileriYazisi) "«$($s.Ileri.Yazi)»"
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $s = Gecis-Bekle $s3 $w $s.Baslik
  Denetle 'lisans sayfası' ($s.Baslik -eq 'Lisans Sözleşmesi') "başlık «$($s.Baslik)»"
  Denetle 'lisansta Geri etkin' ($s.Geri.Gorunur -and $s.Geri.Etkin)
  [KurucuSurucu]::Dugme($w, 3) | Out-Null
  $s = Gecis-Bekle $s3 $w $s.Baslik
  Denetle 'Geri: kurulu sürüm sayfası, son seçim korunmuş' ($s.Baslik -eq 'PDEfe zaten kurulu' -and $s.Secenekler[1].Isaret -eq 1 -and $s.Ileri.Yazi -eq $ileriYazisi) "«$($s.Baslik)» «$($s.Ileri.Yazi)»"
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $s = Gecis-Bekle $s3 $w $s.Baslik
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $s = Gecis-Bekle $s3 $w $s.Baslik
  Denetle 'klasör sayfası' ($s.Baslik -eq 'Hedef dizini seçimi') "başlık «$($s.Baslik)»"
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $s = Gecis-Bekle $s3 $w $s.Baslik
  Denetle 'Ek görevler, masaüstü kutusu bugünkü duruma göre boş' ($s.Baslik -eq 'Ek görevler' -and $s.OnayKutulari.Count -eq 1 -and $s.OnayKutulari[0].Isaret -eq 0) "başlık «$($s.Baslik)»"
  Goruntu-Al $w 'surum-3-ozel-ek-gorevler'
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $r = Sonuc-Oku $sonucDosyasi
  Denetle 'kip=ozel, masaüstü 0' ($r -match '^kip=ozel masaustu=0') "«$r»"
  Kapat $s3

  # -------------------------------------------------------------- 4. aynı sürüm: Onar / Kaldır
  Yaz '4. aynı sürüm (0.2.3) kurulu'
  $s4 = Kosum-Baslat $kosum "/SURUM=0.2.3 /KLASOR=$klasorTam" $sonucDosyasi
  $w = Sihirbaz-Bekle $s4
  $s = Sayfa-Oku $w
  Denetle 'başlık ve metin' ($s.Baslik -eq 'PDEfe zaten kurulu' -and $s.Etiketler[0] -eq 'PDEfe 0.2.3 bu bilgisayarda zaten kurulu.') "«$($s.Baslik)» «$($s.Etiketler[0])»"
  Denetle 'Onar seçili, İleri «Onar»' ($s.Secenekler[0].Isaret -eq 1 -and $s.Secenekler[0].Yazi -eq '&Onar (yeniden kur)' -and $s.Ileri.Yazi -eq 'Onar') "«$($s.Ileri.Yazi)»"
  Goruntu-Al $w 'surum-4-ayni'
  [KurucuSurucu]::Tikla($s.Secenekler[1].Hwnd) | Out-Null
  $s = Sayfa-Oku $w
  Denetle 'Kaldır seçilince İleri «Kaldır»' ($s.Ileri.Yazi -eq 'Kaldır') "«$($s.Ileri.Yazi)»"
  $isaretDosyasi = Join-Path $klasorTam 'kaldirici-calisti.txt'
  Remove-Item -LiteralPath $isaretDosyasi -ErrorAction SilentlyContinue
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $kod = [KurucuSurucu]::Bekle($s4, 8000)
  Denetle 'kurucu kapandı' ($kod -ge 0) "çıkış $kod"
  $k = Sonuc-Oku $isaretDosyasi
  Denetle 'kurulu PDEfe''nin kaldırıcısı UninstallString ile açıldı' ($k -match '/currentuser') "«$k»"
  Denetle 'kurulum bölümü çalışmadı' (-not (Test-Path -LiteralPath $sonucDosyasi))
  Kapat $s4

  # -------------------------------------------------------------- 5. bozuk kurulum: kaldırıcı yok, Onar
  Yaz '5. bozuk kurulum (kayıt 0.2.2, program dosyaları yok)'
  $s5 = Kosum-Baslat $kosum "/SURUM=0.2.2 /KLASOR=$klasorBos" $sonucDosyasi
  $w = Sihirbaz-Bekle $s5
  $s = Sayfa-Oku $w
  Denetle 'başlık ve metin' ($s.Baslik -eq 'PDEfe kurulumu eksik' -and $s.Etiketler[0] -eq 'PDEfe 0.2.2 kurulu görünüyor ama program dosyaları eksik.') "«$($s.Baslik)» «$($s.Etiketler[0])»"
  Denetle 'Onar açıklaması bu kurucunun sürümünü söylüyor' ($s.Etiketler[1] -match '^PDEfe 0\.2\.3 yeniden kurulur') "«$($s.Etiketler[1])»"
  Goruntu-Al $w 'surum-5-bozuk'
  [KurucuSurucu]::Tikla($s.Secenekler[1].Hwnd) | Out-Null
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $ileti = Ileti-Bekle $w
  Denetle 'kaldırıcı yoksa ileti' ($ileti -and $ileti.Metin -match 'kaldırıcısı bulunamadı') "«$($ileti.Metin)»"
  if ($ileti) { [KurucuSurucu]::IletiYanitla($ileti.Hwnd, 1) | Out-Null; Start-Sleep -Milliseconds 500 }
  $s = Sayfa-Oku $w
  Denetle 'ileti kapandı, sayfada kalındı' (-not (Ileti-Bekle $w 300) -and $s.Baslik -eq 'PDEfe kurulumu eksik' -and [KurucuSurucu]::Bekle($s5, 0) -lt 0)
  [KurucuSurucu]::Tikla($s.Secenekler[0].Hwnd) | Out-Null
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $s = Gecis-Bekle $s5 $w $s.Baslik
  $r = Sonuc-Oku $sonucDosyasi
  Denetle 'Onar: doğrudan kurulum, kip=onar' ($s.Baslik -match '^Kurul' -and $r -match '^kip=onar') "«$($s.Baslik)» «$r»"
  Kapat $s5

  # -------------------------------------------------------------- 6. daha yeni sürüm kurulu: Vazgeç
  Yaz '6. daha yeni sürüm (0.3.0) kurulu, Vazgeç'
  $s6 = Kosum-Baslat $kosum "/SURUM=0.3.0 /KLASOR=$klasorTam" $sonucDosyasi
  $w = Sihirbaz-Bekle $s6
  $s = Sayfa-Oku $w
  Denetle 'başlık' ($s.Baslik -eq 'Daha yeni bir sürüm kurulu') "«$($s.Baslik)»"
  Denetle 'metin' ($s.Etiketler[0] -eq 'Bilgisayarınızda daha yeni bir sürüm, PDEfe 0.3.0 kurulu. Bu kurucu daha eski olan 0.2.3 sürümünü kurar.') "«$($s.Etiketler[0])»"
  Denetle 'Vazgeç seçili, İleri «Kapat»' ($s.Secenekler[0].Isaret -eq 1 -and $s.Ileri.Yazi -eq 'Kapat') "«$($s.Ileri.Yazi)»"
  Goruntu-Al $w 'surum-6-yeni'
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $kod = [KurucuSurucu]::Bekle($s6, 8000)
  Denetle 'kurucu kapandı, kurulum bölümü çalışmadı' ($kod -ge 0 -and -not (Test-Path -LiteralPath $sonucDosyasi)) "çıkış $kod"
  Kapat $s6

  # -------------------------------------------------------------- 7. daha yeni sürüm kurulu: Eski sürüme dön
  Yaz '7. daha yeni sürüm kurulu, Eski sürüme dön'
  $s7 = Kosum-Baslat $kosum "/SURUM=0.3.0 /KLASOR=$klasorTam" $sonucDosyasi
  $w = Sihirbaz-Bekle $s7
  $s = Sayfa-Oku $w
  [KurucuSurucu]::Tikla($s.Secenekler[1].Hwnd) | Out-Null
  $s = Sayfa-Oku $w
  Denetle 'İleri «Kur»' ($s.Ileri.Yazi -eq 'Kur') "«$($s.Ileri.Yazi)»"
  Goruntu-Al $w 'surum-7-yeni-geri'
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $s = Gecis-Bekle $s7 $w $s.Baslik
  $r = Sonuc-Oku $sonucDosyasi
  Denetle 'doğrudan kurulum, kip=geri' ($s.Baslik -match '^Kurul' -and $r -match '^kip=geri') "«$($s.Baslik)» «$r»"
  Kapat $s7

  # -------------------------------------------------------------- 8. PDEfe açık: uyarı ve Tamam / İptal sorusu (varsayılan İptal)
  Yaz '8. eski sürüm kurulu, PDEfe açık'
  $acik = [KurucuSurucu]::Baslat("`"$(Join-Path $acikKlasor 'KurucuSinama.exe')`" /BEKLE=120000", $acikKlasor)
  Start-Sleep -Milliseconds 500
  $s8 = Kosum-Baslat $kosum "/SURUM=0.2.2 /KLASOR=$klasorTam" $sonucDosyasi
  $w = Sihirbaz-Bekle $s8
  $s = Sayfa-Oku $w
  Denetle 'sayfada "açık" uyarısı' (@($s.Etiketler | Where-Object { $_ -match '^Dikkat: PDEfe şu anda açık' }).Count -eq 1)
  Goruntu-Al $w 'surum-8-acik'
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $ileti = Ileti-Bekle $w
  Denetle 'Güncelle''de soru: Tamam / İptal, varsayılan İptal' ($ileti -and $ileti.Metin -match 'hâlâ açık' -and $ileti.Varsayilan -eq 2) "«$($ileti.Metin)» varsayılan $($ileti.Varsayilan)"
  if ($ileti) { Goruntu-Al $ileti.Hwnd 'surum-8-acik-soru'; [KurucuSurucu]::IletiYanitla($ileti.Hwnd, 2) | Out-Null; Start-Sleep -Milliseconds 600 }
  $s = Sayfa-Oku $w
  Denetle 'İptal: soru kapandı, sayfada kalındı, kurulum başlamadı' (-not (Ileti-Bekle $w 300) -and $s.Baslik -eq 'PDEfe zaten kurulu' -and -not (Test-Path -LiteralPath $sonucDosyasi))
  [KurucuSurucu]::Dugme($w, 1) | Out-Null
  $ileti = Ileti-Bekle $w
  if ($ileti) { [KurucuSurucu]::IletiYanitla($ileti.Hwnd, 1) | Out-Null }
  $s = Gecis-Bekle $s8 $w 'PDEfe zaten kurulu'
  $r = Sonuc-Oku $sonucDosyasi
  Denetle 'Tamam: kurulum başladı, kip=guncelle' ($s.Baslik -match '^Kurul' -and $r -match '^kip=guncelle') "«$($s.Baslik)» «$r»"
  Kapat $s8
  [KurucuSurucu]::Sonlandir($acik)

  # -------------------------------------------------------------- 9. sürüm karşılaştırması sayısal (0.2.10 > 0.2.9)
  Yaz '9. sürüm karşılaştırması: kurucu 0.2.10'
  foreach ($d in @(@('0.2.9', 'PDEfe zaten kurulu'), @('0.2.11', 'Daha yeni bir sürüm kurulu'), @('0.2.10', 'PDEfe zaten kurulu'))) {
    $s9 = Kosum-Baslat $kosumSayisal "/SURUM=$($d[0]) /KLASOR=$klasorTam" ''
    $w = Sihirbaz-Bekle $s9
    $s = Sayfa-Oku $w
    Denetle "kurulu $($d[0]) → «$($d[1])», İleri «$($s.Ileri.Yazi)»" ($s.Baslik -eq $d[1]) "«$($s.Baslik)»"
    Kapat $s9
  }
} finally {
  [KurucuSurucu]::MasaKapat()
  Remove-Item -Path 'HKCU:\Software\PDEfeSayfaSinama' -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $gecici -ErrorAction SilentlyContinue
}
$ozet = if ($script:hatalar) { "SONUÇ: $($script:hatalar) HATA" } else { 'SONUÇ: hepsi TAMAM' }
Yaz $ozet
[System.IO.File]::WriteAllLines((Join-Path $Cikti 'kurulum_surum.txt'), $script:rapor, $utf8Bom)
if ($script:hatalar) { exit 1 }
