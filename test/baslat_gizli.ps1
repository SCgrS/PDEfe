# Test örneğini görünmeyen ayrı bir Windows masaüstünde başlatır (baslat.ps1'in eşi): pencere bilgisayarı kullanan kişinin ekranına
# çıkmaz, odağını çalmaz; o masaüstünde etkin pencere olabildiği için menü kısayolları (hızlandırıcılar) da sınanabilir (ekran dışındaki
# test örneğinde pencere etkin olmadığından hızlandırıcı hiç çalışmaz; test:odakla yalnızca burada, PDEFE_TEST_GIZLI_MASAUSTU=1'de etkin).
# Kullanım:  powershell -File test\baslat_gizli.ps1 -Port 9411 [-Veri <klasör>] [-Boyut "1280,860"] [-Tema koyu|acik|sistem]
# Durdurma:  powershell -File test\durdur.ps1 -SurecId <pid>
param(
  [Parameter(Mandatory = $true)][int]$Port,
  [string]$Veri = "",
  [string]$Boyut = "1280,860",
  [string]$Tema = ""
)
$ErrorActionPreference = 'Stop'
$kok = Split-Path -Parent $PSScriptRoot
if (-not $Veri) { $Veri = Join-Path $env:TEMP "pdefe-gizli-$Port" }
New-Item -ItemType Directory -Force $Veri | Out-Null
if ($Tema) {
  $ayar = Join-Path $Veri 'ayarlar.json'
  $j = if (Test-Path $ayar) { Get-Content $ayar -Raw -Encoding UTF8 | ConvertFrom-Json } else { [pscustomobject]@{} }
  $j | Add-Member -NotePropertyName tema -NotePropertyValue $Tema -Force
  [System.IO.File]::WriteAllText($ayar, ($j | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding $false))
}
$exe = Join-Path $kok 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $exe)) { throw "electron.exe yok: $exe (node_modules bağlantısını kurun)" }
# Ortam değişkenleri alt sürece geçer (CreateProcess ortamı devralır). Konum verilir: test diyalogları (gelistirme.js testDiyalogKur) açık olsun
$env:PDEFE_VERI_KLASORU = $Veri
$env:PDEFE_TEST_KONUM = "0,0"
$env:PDEFE_TEST_BOYUT = $Boyut
$env:PDEFE_TEST_GIZLI_MASAUSTU = "1"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class GizliBaslat {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateDesktop(string ad, IntPtr aygit, IntPtr kip, int bayrak, uint erisim, IntPtr sa);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool miras, uint bayrak, IntPtr ortam, string klasor, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  /** Masaüstünü kurar (varsa açar), süreci orada başlatır; PID ya da hata için -Win32 kodu döner. Masaüstü tanıtıcısı kapatılmaz: süreç çıkana dek yaşasın. */
  public static int Baslat(string masaustu, string exe, string arguman, string klasor) {
    IntPtr masa = CreateDesktop(masaustu, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000, IntPtr.Zero);
    if (masa == IntPtr.Zero) return -Marshal.GetLastWin32Error();
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.lpDesktop = "WinSta0\\" + masaustu;
    PROCESS_INFORMATION pi;
    if (!CreateProcess(null, "\"" + exe + "\" " + arguman, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, klasor, ref si, out pi)) return -Marshal.GetLastWin32Error();
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    return pi.dwProcessId;
  }
}
"@
$surecId = [GizliBaslat]::Baslat("PDEfeTest$Port", $exe, ". --remote-debugging-port=$Port", $kok)
if ($surecId -le 0) { throw "Görünmeyen masaüstünde başlatılamadı (Win32 hata $(-$surecId))." }
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json" -TimeoutSec 2
    if ($h | Where-Object { $_.type -eq 'page' -and $_.url -like 'pdefe://*' }) {
      Start-Sleep -Milliseconds 1500
      Write-Output "PID=$surecId PORT=$Port VERI=$Veri MASAUSTU=PDEfeTest$Port"
      exit 0
    }
  } catch { }
  if (-not (Get-Process -Id $surecId -ErrorAction SilentlyContinue)) { throw "PDEfe başlatılamadı (süreç $surecId çıktı)." }
}
throw "PDEfe 30 sn içinde CDP üzerinden hazır olmadı (PID $surecId)."
