# Kurulu (gerçek) PDEfe'nin kayıt defteri ve dosya izlerinin salt okunur görüntüsü: güncelleme uçtan uca testinden önce ve sonra
# alınır, iki JSON karşılaştırılır (Compare: aynı olmalı). Hiçbir şey yazmaz; yalnızca okur.
# Kullanım: powershell -File test\guncelleme-e2e\kayit-goruntusu.ps1 -Cikti <dosya.json>
param([Parameter(Mandatory = $true)][string]$Cikti)
$ErrorActionPreference = 'Stop'

function Anahtar-Dok([string]$yol) {
  # Anahtarın ve alt anahtarlarının bütün değerleri: { "alt\yol": { "ad": "Tür:veri" } }; yoksa null
  if (-not (Test-Path -LiteralPath $yol)) { return $null }
  $sonuc = [ordered]@{}
  $kok = Get-Item -LiteralPath $yol
  $liste = @($kok) + @(Get-ChildItem -LiteralPath $yol -Recurse -ErrorAction SilentlyContinue)
  foreach ($k in $liste) {
    $degerler = [ordered]@{}
    foreach ($ad in ($k.GetValueNames() | Sort-Object)) {
      $tur = $k.GetValueKind($ad)
      $veri = $k.GetValue($ad, $null, 'DoNotExpandEnvironmentNames')
      if ($veri -is [byte[]]) { $veri = [BitConverter]::ToString($veri) }
      elseif ($veri -is [array]) { $veri = ($veri -join '|') }
      $degerler[$(if ($ad -eq '') { '(Varsayılan)' } else { $ad })] = "${tur}:$veri"
    }
    $goreli = $k.Name.Substring($kok.Name.Length).TrimStart('\')
    $sonuc[$(if ($goreli -eq '') { '.' } else { $goreli })] = $degerler
  }
  return $sonuc
}

function Dosya-Iz([string]$yol) {
  if (-not (Test-Path -LiteralPath $yol)) { return $null }
  $o = Get-Item -LiteralPath $yol -Force
  $iz = [ordered]@{ Degisim = $o.LastWriteTimeUtc.ToString('o'); Olusum = $o.CreationTimeUtc.ToString('o') }
  if ($o.PSIsContainer) {
    $dosyalar = @(Get-ChildItem -LiteralPath $yol -Recurse -File -Force -ErrorAction SilentlyContinue)
    $iz.DosyaSayisi = $dosyalar.Count
    $iz.ToplamBayt = ($dosyalar | Measure-Object Length -Sum).Sum
    $iz.EnSonDegisim = if ($dosyalar.Count) { ($dosyalar | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc.ToString('o') } else { '' }
  } else {
    $iz.Bayt = $o.Length
    if ($o.Extension -eq '.exe') { $iz.DosyaSurumu = $o.VersionInfo.FileVersion; $iz.UrunSurumu = $o.VersionInfo.ProductVersion }
    if ($o.Extension -eq '.lnk') { $k = (New-Object -ComObject WScript.Shell).CreateShortcut($o.FullName); $iz.Hedef = $k.TargetPath; $iz.Bagimsiz = $k.Arguments }
  }
  return $iz
}

$u = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$kaldirma = [ordered]@{}
foreach ($k in (Get-ChildItem $u -ErrorAction SilentlyContinue)) {
  $dn = $k.GetValue('DisplayName')
  if ("$dn" -like '*PDEfe*') { $kaldirma[$k.PSChildName] = Anahtar-Dok $k.PSPath }
}
# Gerçek PDEfe'nin kurulum anahtarı (Software\<GUID>, InstallLocation) kaldırma kaydındaki GUID'den
$kurulumAnahtarlari = [ordered]@{}
foreach ($guid in $kaldirma.Keys) { $kurulumAnahtarlari[$guid] = Anahtar-Dok "HKCU:\Software\$guid" }

$masaustu = [Environment]::GetFolderPath('Desktop')
$ortakMasaustu = [Environment]::GetFolderPath('CommonDesktopDirectory')
$baslat = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$kurulu = Join-Path $env:LOCALAPPDATA 'Programs\PDEfe'

$g = [ordered]@{
  'HKCU\Software\Classes\.pdf' = Anahtar-Dok 'HKCU:\Software\Classes\.pdf'
  'HKCU\Software\Classes\PDEfe.pdf' = Anahtar-Dok 'HKCU:\Software\Classes\PDEfe.pdf'
  'HKCU\Software\Classes\Applications\PDEfe.exe' = Anahtar-Dok 'HKCU:\Software\Classes\Applications\PDEfe.exe'
  'HKCU\Software\RegisteredApplications' = Anahtar-Dok 'HKCU:\Software\RegisteredApplications'
  'HKCU\Software\PDEfe' = Anahtar-Dok 'HKCU:\Software\PDEfe'
  'HKCU\...\Explorer\FileExts\.pdf' = Anahtar-Dok 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf'
  'Uninstall (PDEfe)' = $kaldirma
  'HKCU\Software\<GUID> (PDEfe)' = $kurulumAnahtarlari
  'Kısayol Başlat\PDEfe.lnk' = Dosya-Iz (Join-Path $baslat 'PDEfe.lnk')
  'Kısayol Masaüstü\PDEfe.lnk' = Dosya-Iz (Join-Path $masaustu 'PDEfe.lnk')
  'Kısayol Ortak masaüstü\PDEfe.lnk' = Dosya-Iz (Join-Path $ortakMasaustu 'PDEfe.lnk')
  'Kurulu PDEfe klasörü' = Dosya-Iz $kurulu
  'Kurulu PDEfe.exe' = Dosya-Iz (Join-Path $kurulu 'PDEfe.exe')
  'Kurulu pdefe-core.exe' = Dosya-Iz (Join-Path $kurulu 'resources\pdefe-core.exe')
  'Güncelleme önbelleği pdefe-updater' = Dosya-Iz (Join-Path $env:LOCALAPPDATA 'pdefe-updater')
  'pdefe-updater\installer.exe' = Dosya-Iz (Join-Path $env:LOCALAPPDATA 'pdefe-updater\installer.exe')
  'Ayarlar %APPDATA%\PDEfe\ayarlar.json' = Dosya-Iz (Join-Path $env:APPDATA 'PDEfe\ayarlar.json')
}
$json = $g | ConvertTo-Json -Depth 12
[IO.File]::WriteAllText($Cikti, $json, (New-Object Text.UTF8Encoding $false))
Write-Output "görüntü yazıldı: $Cikti"
