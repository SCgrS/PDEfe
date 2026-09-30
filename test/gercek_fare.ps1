# Gerçek girdiyle sekme ayırma sınaması (0.1.19). PDEfe görünmeyen bir Windows masaüstünde, test konumu verilmeden (gerçek ekran düzeni,
# gerçek imleç ve odak) başlatılır; aynı masaüstünde çalışan yardımcı (fare_gonder.ps1) etkin sekmeye Windows fare iletileriyle basar, sekmeyi
# çubuğun altına sürükler, 3 sn tutar ve bırakır. Bilgisayarı kullanan kişinin ekranına, faresine ve odağına dokunulmaz.
# Denetlenenler: önizleme penceresi gösterilince fare yakalaması ve etkin pencere kaynak pencerede kalır (kalmazsa sürükleme kesilir, sekme
# hiç ayrılamazdı), tutulan sekme ayrılmış kalır, bırakınca yakalama kalkar, belge yeni pencerede açılır ve o pencere etkinleşir.
# senaryo22.mjs aynı akışı CDP fare olaylarıyla sınar; onlar tarayıcı sürecinin girdi yolunu ve fare yakalamasını atlar.
# Kullanım:  powershell -File test\gercek_fare.ps1 [-Port 9480] [-TutmaMs 3000] [-Paketli <PDEfe.exe>]      (çıkış kodu: 0 hepsi geçti, 1 hata)
# -Paketli: geliştirme örneği yerine paketli sürüm sınanır (ör. release\win-unpacked\PDEfe.exe; yayımdan önce paketin açıldığını, sekmenin
# ayrıldığını görmek için).
param([int]$Port = 9480, [int]$TutmaMs = 3000, [string]$Paketli = "")
$ErrorActionPreference = 'Stop'
$kok = Split-Path -Parent $PSScriptRoot
Set-Location $kok
$klasor = Join-Path $kok 'test\cikti\gercek-fare'
New-Item -ItemType Directory -Force $klasor | Out-Null
$python = Join-Path $kok '.venv\Scripts\python.exe'
foreach ($ad in 'a', 'b', 'c') { & $python -X utf8 (Join-Path $kok 'test\ornek_pdf_uret.py') (Join-Path $klasor "$ad.pdf") 3 "Belge $ad" | Out-Null }
$veri = Join-Path $env:TEMP "pdefe-gercek-fare-$Port"
Remove-Item -Recurse -Force $veri -ErrorAction SilentlyContinue
$baslatArgumanlari = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $kok 'test\baslat_gizli.ps1'), '-Port', $Port, '-Veri', $veri, '-GercekEkran')
if ($Paketli) { $baslatArgumanlari += @('-Paketli', (Resolve-Path $Paketli).Path) }
$baslat = & powershell @baslatArgumanlari
Write-Output $baslat
if ("$baslat" -notmatch 'PID=(\d+)') { throw 'PDEfe başlatılamadı.' }
$surecNo = [int]$Matches[1]
$yardimci = 0; $hatalar = 0
function Denetle([string]$ad, [bool]$tamam, [string]$ayrinti = '') {
  if ($tamam) { Write-Output "OK   $ad" } else { $script:hatalar++; Write-Output "HATA $ad $ayrinti" }
}
try {
  $env:PDEFE_CDP_PORT = "$Port"; $env:PDEFE_GF_KLASOR = $klasor
  $env:PDEFE_GF_ADIM = 'hazirla'
  & node test\surucu.mjs betik test\gercek_fare.mjs
  $v = Get-Content (Join-Path $klasor 'nokta.json') -Raw | ConvertFrom-Json
  $cikti = Join-Path $klasor 'fare.txt'; $dom = Join-Path $klasor 'dom.txt'
  Remove-Item $cikti, $dom -ErrorAction SilentlyContinue
  # DOM örnekleyici arka planda
  $env:PDEFE_GF_ADIM = 'izle'; $env:PDEFE_GF_SURE = "$($TutmaMs + 7000)"
  $ornek = Start-Process -FilePath 'node' -ArgumentList @('test\surucu.mjs', 'betik', 'test\gercek_fare.mjs') -WorkingDirectory $kok -PassThru -WindowStyle Hidden -RedirectStandardOutput $dom -RedirectStandardError (Join-Path $klasor 'dom.hata.txt')
  Start-Sleep -Milliseconds 1200
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class GizliYardimci {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateDesktop(string ad, IntPtr aygit, IntPtr kip, int bayrak, uint erisim, IntPtr sa);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool miras, uint bayrak, IntPtr ortam, string klasor, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static int Baslat(string masaustu, string komut, string klasor) {
    IntPtr masa = CreateDesktop(masaustu, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000, IntPtr.Zero);   // var olan masaustunu acar
    if (masa == IntPtr.Zero) return -Marshal.GetLastWin32Error();
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.lpDesktop = "WinSta0\\" + masaustu;
    PROCESS_INFORMATION pi;
    if (!CreateProcess(null, komut, IntPtr.Zero, IntPtr.Zero, false, 0x08000000, IntPtr.Zero, klasor, ref si, out pi)) return -Marshal.GetLastWin32Error();
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    return pi.dwProcessId;
  }
}
"@
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $komut = "`"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $kok 'test\fare_gonder.ps1')`" -SurecNo $surecNo -WebX $($v.x) -WebY $($v.y) -OlcekYuzde $([int][Math]::Round($v.dpr * 100)) -IcYukseklik $($v.ic) -Cikti `"$cikti`" -TutmaMs $TutmaMs"
  $yardimci = [GizliYardimci]::Baslat("PDEfeTest$Port", $komut, $kok)
  if ($yardimci -le 0) { throw "Yardımcı başlatılamadı (Win32 hata $(-$yardimci))." }
  for ($i = 0; $i -lt 160; $i++) {
    Start-Sleep -Milliseconds 250
    if ((Test-Path $cikti) -and ((Get-Content $cikti -Raw) -match 'BITTI|HATA')) { break }
    if (-not (Get-Process -Id $yardimci -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 300; break }
  }
  [void]$ornek.WaitForExit(30000)
  $fare = if (Test-Path $cikti) { Get-Content $cikti } else { @() }
  $domSatirlari = if (Test-Path $dom) { Get-Content $dom -Encoding UTF8 } else { @() }
  Write-Output '--- fare iletileri ve yakalama'; Write-Output $fare
  Write-Output '--- DOM'; Write-Output $domSatirlari
  Write-Output '--- denetimler'
  $metin = $fare -join "`n"
  $ana = if ($metin -match 'ana pencere hwnd=(0x[0-9A-F]+)') { $Matches[1] } else { '' }
  function Satir([string]$etiket) { ($fare | Where-Object { $_ -match " $([regex]::Escape($etiket)): " } | Select-Object -First 1) }
  Denetle 'Yardımcı bitti, ana pencere bulundu' (($metin -match 'BITTI') -and $ana -ne '' -and $ana -ne '0x0') $metin
  Denetle 'Basınca fare yakalaması kaynak pencerede' ((Satir 'basildi') -match "yakalama=$ana ")
  Denetle 'Sürüklenince önizleme penceresi görünür' ([bool]($fare | Where-Object { $_ -match '\[suruklenirken\].*tur=onizleme gorunur=True' }))
  Denetle 'Önizleme gösterilince yakalama ve etkin pencere kaynak pencerede' ((Satir 'suruklendi') -match "yakalama=$ana etkin=$ana ")
  Denetle 'Tutulurken yakalama ve etkin pencere kaynak pencerede' ((Satir 'tutuldu') -match "yakalama=$ana etkin=$ana ")
  Denetle 'Bırakınca yakalama kalkar, başka pencere etkinleşir' (((Satir 'birakildi') -match 'yakalama=0x0 etkin=(0x[0-9A-F]+)') -and $Matches[1] -ne $ana -and $Matches[1] -ne '0x0')
  Denetle 'Bırakıldıktan sonra iki uygulama penceresi görünür, önizleme gizli' ((@($fare | Where-Object { $_ -match '\[birakildiktan sonra\].*tur=pencere gorunur=True' }).Count -eq 2) -and [bool]($fare | Where-Object { $_ -match '\[birakildiktan sonra\].*tur=onizleme gorunur=False' }))
  $domMetni = $domSatirlari -join "`n"
  Denetle 'Sekme çubuktan ayrıldı, pencere odağını korudu' ($domMetni -match '"ayrildi":true[^\n]*"odak":true')
  Denetle 'Belge yeni pencerede açıldı, kaynakta iki sekme kaldı' (($domMetni -match 'pencere \{"sekmeler":\["c\.pdf"\],"odak":true') -and ($domMetni -match 'pencere \{"sekmeler":\["a\.pdf","b\.pdf"\]'))
} finally {
  $ErrorActionPreference = 'SilentlyContinue'
  if ($yardimci -gt 0) { Stop-Process -Id $yardimci -Force -ErrorAction SilentlyContinue }
  & cmd.exe /c "taskkill /PID $surecNo /T /F >nul 2>&1"
}
if ($hatalar) { Write-Output "$hatalar HATA"; exit 1 }
Write-Output 'Hepsi geçti'
exit 0
