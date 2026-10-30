# Senaryo 53'ü koşar (0.3.1): Bütün bölümler test kancalı örnekte görünmeyen masaüstünde, ekran ölçeği %100, %125 ve %150'de sınır ve kâğıt ekran dışı örnekte (aynı yazı karşılaştırılır), gerçek sağ tık
# menüsü kancasız örnekte görünmeyen masaüstünde. Açtığı örnekleri kapatır. Kullanım: powershell -File test\senaryo53_kos.ps1 [-Port 9530] [-Kip hepsi|kancali|olcek|menu]
param([int]$Port = 9530, [string]$Kip = 'hepsi')
$ErrorActionPreference = 'Stop'
$kok = Split-Path -Parent $PSScriptRoot
Set-Location $kok
$hata = 0
$dizin = Join-Path $kok "test\cikti\s53\olcek-$([DateTime]::Now.ToString('yyyyMMddHHmmss'))"
function Kapat([int]$surec) { & cmd.exe /c "taskkill /PID $surec /T /F >nul 2>&1" }
function Temiz([string]$veri) { if (Test-Path -LiteralPath $veri) { Remove-Item -Recurse -Force -LiteralPath $veri -ErrorAction SilentlyContinue } }
function Kos([int]$p, [string]$bolum, [hashtable]$ortam, [string[]]$baslat) {
  $veri = Join-Path $env:TEMP "pdefe-s53-$p"
  Temiz $veri
  $r = & powershell -NoProfile -ExecutionPolicy Bypass -File @baslat -Port $p -Veri $veri
  if ("$r" -notmatch 'PID=(\d+)') { throw "PDEfe başlatılamadı: $r" }
  $surec = [int]$Matches[1]
  try {
    $env:PDEFE_CDP_PORT = "$p"; $env:BOLUM = $bolum; $env:S53_SUREC = "$surec"; $env:S53_MASA = "PDEfeTest$p"
    foreach ($a in 'S53_OLCEK_DIZIN', 'S53_KANCASIZ') { Remove-Item "Env:$a" -ErrorAction SilentlyContinue }
    foreach ($k in $ortam.Keys) { Set-Item "Env:$k" $ortam[$k] }
    & node test\surucu.mjs betik test\senaryo53.mjs
    if ($LASTEXITCODE) { $script:hata++ }
  } finally { Kapat $surec; Start-Sleep -Milliseconds 400; Temiz $veri }
}
if ($Kip -in 'kancali', 'hepsi') { Kos $Port '' @{} @('test\baslat_gizli.ps1', '-Boyut', '1280,1000') }
if ($Kip -in 'olcek', 'hepsi') {
  $i = 1
  foreach ($o in '1', '1.25', '1.5') {
    Write-Output "== Ekran ölçeği $o"
    Kos ($Port + $i) '3,5,9' @{ S53_OLCEK_DIZIN = $dizin } @('test\baslat.ps1', '-Boyut', '1280,900', '-Olcek', $o)
    $i++
  }
}
if ($Kip -in 'menu', 'hepsi') {
  Write-Output '== Gerçek sağ tık menüsü'
  Kos ($Port + 4) '11' @{ S53_KANCASIZ = '1' } @('test\baslat_gizli.ps1', '-Boyut', '1280,1000', '-GercekEkran')
}
if ($hata) { Write-Output "$hata koşumda hata var"; exit 1 }
Write-Output 'Hepsi geçti'
