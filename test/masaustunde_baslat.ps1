# Bir komutu var olan görünmeyen masaüstünde başlatır (0.3.1; test/yerel_pencere_sur.ps1 için. test/gercek_fare.ps1'deki yöntem). Süreç kimliğini yazar.
# Kullanım: powershell -File masaustunde_baslat.ps1 -Masaustu PDEfeTest9500 -Komut "<tam komut satırı>" [-Klasor <klasör>]
param([Parameter(Mandatory = $true)][string]$Masaustu, [Parameter(Mandatory = $true)][string]$Komut, [string]$Klasor = "")
$ErrorActionPreference = 'Stop'
if (-not $Klasor) { $Klasor = Split-Path -Parent $PSScriptRoot }
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class MasaustundeBaslat {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateDesktop(string ad, IntPtr aygit, IntPtr kip, int bayrak, uint erisim, IntPtr sa);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool miras, uint bayrak, IntPtr ortam, string klasor, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static int Baslat(string masaustu, string komut, string klasor) {
    IntPtr masa = CreateDesktop(masaustu, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000, IntPtr.Zero);   // var olan masaüstünü açar
    if (masa == IntPtr.Zero) return -Marshal.GetLastWin32Error();
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.lpDesktop = "WinSta0\\" + masaustu;
    PROCESS_INFORMATION pi;
    if (!CreateProcess(null, komut, IntPtr.Zero, IntPtr.Zero, false, 0x08000000, IntPtr.Zero, klasor, ref si, out pi)) return -Marshal.GetLastWin32Error();
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    return pi.dwProcessId;
  }
}
"@
$surecNo = [MasaustundeBaslat]::Baslat($Masaustu, $Komut, $Klasor)
if ($surecNo -le 0) { throw "Başlatılamadı (Win32 hata $(-$surecNo))." }
Write-Output $surecNo
