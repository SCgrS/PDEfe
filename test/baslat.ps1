# Test örneği başlatır: ayrı veri klasörü, ekran dışı pencere, CDP portu. PID'yi yazar; CDP hazır olunca döner.
# Kullanım:  powershell -File test\baslat.ps1 -Port 9311 [-Veri <klasör>] [-Konum "-2600,0"] [-Boyut "1280,900"] [-Tema koyu|acik|sistem] [-Olcek 1.25]
# -Olcek: ekran ölçeği (cihaz piksel oranı; 1.25 = Windows'ta %125). Verilmezse ekranınki. -Boyut ölçekten bağımsızdır (CSS pikseli);
# pencere ekranın çalışma alanından büyük olamadığı için ölçek büyüdükçe en büyük pencere küçülür (1920×1080 ekranda %150: 1280×688).
# Durdurma:  powershell -File test\durdur.ps1 -SurecId <pid>    (yalnızca bu örneğin süreç ağacını kapatır)
# Sürme:     $env:PDEFE_CDP_PORT = 9311; node test\surucu.mjs betik <dosya.mjs>
param(
  [Parameter(Mandatory = $true)][int]$Port,
  [string]$Veri = "",
  [string]$Konum = "-2600,0",
  [string]$Boyut = "1280,900",
  [string]$Tema = "",
  [string]$Olcek = ""
)
$ErrorActionPreference = 'Stop'
$kok = Split-Path -Parent $PSScriptRoot
if (-not $Veri) { $Veri = Join-Path $env:TEMP "pdefe-test-$Port" }
New-Item -ItemType Directory -Force $Veri | Out-Null
if ($Tema) {
  $ayar = Join-Path $Veri 'ayarlar.json'
  $j = if (Test-Path $ayar) { Get-Content $ayar -Raw -Encoding UTF8 | ConvertFrom-Json } else { [pscustomobject]@{} }
  $j | Add-Member -NotePropertyName tema -NotePropertyValue $Tema -Force
  [System.IO.File]::WriteAllText($ayar, ($j | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding $false))
}
$exe = Join-Path $kok 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $exe)) { throw "electron.exe yok: $exe (node_modules bağlantısını kurun)" }
$env:PDEFE_VERI_KLASORU = $Veri
# 0.2.9 denetimi: USERPROFILE gerçek profil klasörü değilse (sahte ev: içinde NTUSER.DAT yok) örnekte Word kullanılmaz. Word bu ortamla başlayınca
# "Son kullanılanlar" listesindeki Masaüstü / Belgeler yollarını sahte eve çevirip yazıyordu. Örnek PDF klasörü için PDEFE_TEST_PDF_KLASORU verin
if ($env:USERPROFILE -and -not (Test-Path -LiteralPath (Join-Path $env:USERPROFILE 'NTUSER.DAT'))) {
  $env:PDEFE_WORD_YOK = '1'
  Write-Warning 'USERPROFILE gerçek profil klasörü değil (sahte ev): bu örnekte Word kullanılmıyor (PDEFE_WORD_YOK=1).'
}
$env:PDEFE_TEST_KONUM = $Konum
$env:PDEFE_TEST_BOYUT = $Boyut
$arguman = @('.', "--remote-debugging-port=$Port")
if ($Olcek) { $arguman += "--force-device-scale-factor=$Olcek" }
$p = Start-Process -FilePath $exe -ArgumentList $arguman -WorkingDirectory $kok -PassThru -WindowStyle Hidden
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json" -TimeoutSec 2
    if ($h | Where-Object { $_.type -eq 'page' -and $_.url -like 'pdefe://*' }) {
      Start-Sleep -Milliseconds 1500
      Write-Output "PID=$($p.Id) PORT=$Port VERI=$Veri"
      exit 0
    }
  } catch { }
  if ($p.HasExited) { throw "PDEfe başlatılamadı (çıkış kodu $($p.ExitCode))." }
}
throw "PDEfe 30 sn içinde CDP üzerinden hazır olmadı (PID $($p.Id))."
