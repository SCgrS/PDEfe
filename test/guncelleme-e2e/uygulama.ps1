# Kurulu deneme uygulamasını ("PDEfe Guncelleme Testi") CDP portuyla başlatır, CDP üzerinden kapatır ya da süreçlerini listeler.
# Yalnızca kurulum klasöründen çalışan süreçlere bakar; gerçek PDEfe'ye ve başka süreçlere dokunmaz.
# Kullanım: powershell -File test\guncelleme-e2e\uygulama.ps1 -Islem ac|kapat|surecler [-Port 9911]
param(
  [Parameter(Mandatory = $true)][ValidateSet('ac', 'kapat', 'surecler')][string]$Islem,
  [int]$Port = 9911,
  [int]$ZamanAsimi = 45
)
$ErrorActionPreference = 'Stop'
$kok = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$klasor = Join-Path $env:LOCALAPPDATA 'Programs\PDEfe Guncelleme Testi'
$exe = Join-Path $klasor 'PDEfe Guncelleme Testi.exe'
function Surecler { @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($klasor + '\', [StringComparison]::OrdinalIgnoreCase) }) }

switch ($Islem) {
  'ac' {
    if ((Surecler).Count) { throw "Deneme uygulamasi zaten calisiyor." }
    $p = Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$Port" -PassThru
    for ($i = 0; $i -lt $ZamanAsimi * 2; $i++) {
      Start-Sleep -Milliseconds 500
      try {
        $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json" -TimeoutSec 2
        if ($h | Where-Object { $_.type -eq 'page' -and $_.url -like 'pdefe://*' }) { Write-Output "PID=$($p.Id) PORT=$Port"; exit 0 }
      } catch { }
      if ($p.HasExited) { throw "Uygulama kapandi (cikis kodu $($p.ExitCode))." }
    }
    throw "CDP hazir olmadi (PID $($p.Id))."
  }
  'kapat' {
    $env:PDEFE_CDP_PORT = $Port
    & node (Join-Path $kok 'test\surucu.mjs') eval "pdefe.cagir('pencere:kapat')" | Out-Null
    for ($i = 0; $i -lt $ZamanAsimi * 4; $i++) {
      if (-not (Surecler).Count) { Write-Output "kapandi"; exit 0 }
      Start-Sleep -Milliseconds 250
    }
    throw "Uygulama $ZamanAsimi sn icinde kapanmadi."
  }
  'surecler' { Surecler | Select-Object Id, ProcessName, StartTime, @{ n = 'Surum'; e = { $_.MainModule.FileVersionInfo.FileVersion } } | Format-Table -AutoSize | Out-String -Width 200 }
}
