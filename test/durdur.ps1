# baslat.ps1 ile açılan test örneğini süreç ağacıyla (renderer, GPU, pdefe-core) kapatır. Başka PDEfe/Electron süreçlerine dokunmaz.
# Kullanım: powershell -File test\durdur.ps1 -SurecId <baslat.ps1'in yazdığı PID>
param([Parameter(Mandatory = $true)][int]$SurecId)
& taskkill.exe /PID $SurecId /T /F 2>$null | Out-Null
Write-Output "durduruldu: $SurecId"
