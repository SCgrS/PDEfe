# Senaryo 50'yi koşar (0.3.1): Gerçek kaydetme penceresi bölümleri görünmeyen masaüstünde test kancasız örnekte (her biri taze örnek), öbürleri ekran dışı örnekte. Açtığı
# örnekleri kapatır. Kullanım: powershell -File test\senaryo50_kos.ps1 [-Kip yerel|kancali|hepsi] [-Bolum "y1,1,3"] [-Port 9520] [-Paketli <PDEfe.exe>]
# -Paketli: Gerçek kaydetme penceresi bölümleri paketli sürümde (ör. release\win-unpacked\PDEfe.exe: Paketlenmiş çekirdek). Kancalı bölümler paketli sürümde koşulmaz.
param([string]$Kip = 'hepsi', [string]$Bolum = '', [int]$Port = 9520, [string]$Paketli = '')
$ErrorActionPreference = 'Stop'
$kok = Split-Path -Parent $PSScriptRoot
Set-Location $kok
$hata = 0
function Kapat([int]$surec) { & cmd.exe /c "taskkill /PID $surec /T /F >nul 2>&1" }
if ($Kip -in 'yerel', 'hepsi') {
  $yerelBolumler = if ($Bolum) { @($Bolum -split ',' | Where-Object { $_ -like 'y*' }) } else { 'y1', 'y2', 'y3', 'y4', 'y5' }
  foreach ($b in $yerelBolumler) {
    $veri = Join-Path $env:TEMP "pdefe-s50-yerel-$Port"
    Remove-Item -Recurse -Force $veri -ErrorAction SilentlyContinue
    $baslatArg = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'test\baslat_gizli.ps1', '-Port', $Port, '-Veri', $veri, '-GercekEkran')
    if ($Paketli) { $baslatArg += @('-Paketli', $Paketli) }
    $r = & powershell @baslatArg
    if ("$r" -notmatch 'PID=(\d+)') { throw 'PDEfe başlatılamadı.' }
    $surec = [int]$Matches[1]
    try {
      $env:PDEFE_CDP_PORT = "$Port"; $env:S50_KIP = 'yerel'; $env:S50_SUREC = "$surec"; $env:S50_MASA = "PDEfeTest$Port"; $env:BOLUM = $b
      & node test\surucu.mjs betik test\senaryo50.mjs
      if ($LASTEXITCODE) { $hata++ }
    } finally { Kapat $surec }
    Start-Sleep -Milliseconds 500
  }
}
if ($Kip -in 'kancali', 'hepsi' -and -not $Paketli) {
  $kancaliBolumler = if ($Bolum) { ($Bolum -split ',' | Where-Object { $_ -notlike 'y*' }) -join ',' } else { '' }
  if (-not $Bolum -or $kancaliBolumler) {
    $veri = Join-Path $env:TEMP "pdefe-s50-$($Port + 1)"
    Remove-Item -Recurse -Force $veri -ErrorAction SilentlyContinue
    $r = & powershell -NoProfile -ExecutionPolicy Bypass -File test\baslat.ps1 -Port ($Port + 1) -Veri $veri -Boyut "1280,900"
    if ("$r" -notmatch 'PID=(\d+)') { throw 'PDEfe başlatılamadı.' }
    $surec = [int]$Matches[1]
    try {
      $env:PDEFE_CDP_PORT = "$($Port + 1)"; $env:S50_KIP = 'kancali'; $env:BOLUM = $kancaliBolumler
      & node test\surucu.mjs betik test\senaryo50.mjs
      if ($LASTEXITCODE) { $hata++ }
    } finally { Kapat $surec }
  }
}
if ($hata) { Write-Output "$hata koşumda hata var"; exit 1 }
Write-Output 'Hepsi geçti'
exit 0
