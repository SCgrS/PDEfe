# Bir PowerShell betiğini GERÇEK kullanıcı oturumunda çalıştırır: geçici zamanlanmış görev (etkileşimli, pencere açmadan wscript
# üzerinden gizli PowerShell), bitene dek bekler, görevi siler. Claude masaüstü uygulaması (MSIX) içinde çalışan kabuğun %APPDATA%,
# %LOCALAPPDATA% ve HKCU yazmaları sanallaşır; gerçek sistemi okumak/yazmak ya da uygulamayı gerçek oturumda başlatmak için gerekir.
# Kullanım: powershell -File test\guncelleme-e2e\gercek-oturum.ps1 -Betik <betik.ps1> [-Arguman '-Islem goruntu -Cikti x.json'] [-ZamanAsimi 180]
param([Parameter(Mandatory = $true)][string]$Betik, [string]$Arguman = '', [int]$ZamanAsimi = 180)
$ErrorActionPreference = 'Stop'
$Betik = (Resolve-Path $Betik).Path
$ad = 'PDEfe-GuncellemeTesti-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$klasor = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'test\cikti\gercek-oturum'
New-Item -ItemType Directory -Force $klasor | Out-Null
$vbs = Join-Path $klasor "$ad.vbs"
$komut = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$Betik"" $Arguman".Replace('"', '""')
[IO.File]::WriteAllText($vbs, "CreateObject(""WScript.Shell"").Run ""$komut"", 0, True`r`n", [Text.Encoding]::Unicode)
$eylem = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //Nologo ""$vbs"""
$kim = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$ayar = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $ad -Action $eylem -Principal $kim -Settings $ayar | Out-Null
try {
  Start-ScheduledTask -TaskName $ad
  $bas = Get-Date
  Start-Sleep -Milliseconds 700
  while (((Get-Date) - $bas).TotalSeconds -lt $ZamanAsimi) {
    if ((Get-ScheduledTask -TaskName $ad).State -ne 'Running') { break }
    Start-Sleep -Milliseconds 500
  }
  $bilgi = Get-ScheduledTaskInfo -TaskName $ad
  Write-Output ("görev bitti: sonuç {0}, süre {1:N1} sn" -f $bilgi.LastTaskResult, ((Get-Date) - $bas).TotalSeconds)
} finally {
  Unregister-ScheduledTask -TaskName $ad -Confirm:$false
  Remove-Item $vbs -ErrorAction SilentlyContinue
}
