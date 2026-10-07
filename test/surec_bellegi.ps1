# Bir sürecin ve bütün alt süreçlerinin özel çalışma kümesi (Görev Yöneticisi'ndeki "Bellek"; Win32_PerfRawData_PerfProc_Process.WorkingSetPrivate).
# Kullanım:  powershell -File test\surec_bellegi.ps1 -SurecId <test örneğinin PID'i (baslat.ps1 yazar)>
# Çıktı (JSON): { toplamMB, adet, surecler: [{ id, ad, mb }] }. Salt okunur (WMI); kaydirma_olcum.mjs'in "bellek" senaryosu çağırır.
param([Parameter(Mandatory = $true)][int]$SurecId)
$ErrorActionPreference = 'Stop'
$hepsi = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
$agac = New-Object System.Collections.Generic.List[int]
$agac.Add($SurecId)
for ($i = 0; $i -lt $agac.Count; $i++) {
  foreach ($p in $hepsi) { if ($p.ParentProcessId -eq $agac[$i] -and -not $agac.Contains([int]$p.ProcessId)) { $agac.Add([int]$p.ProcessId) } }
}
$sayac = @(Get-CimInstance Win32_PerfRawData_PerfProc_Process | Where-Object { $agac.Contains([int]$_.IDProcess) })
$liste = @($sayac | ForEach-Object { [pscustomobject]@{ id = [int]$_.IDProcess; ad = $_.Name; mb = [math]::Round($_.WorkingSetPrivate / 1MB, 1) } })
$toplam = [math]::Round((($sayac | Measure-Object -Property WorkingSetPrivate -Sum).Sum) / 1MB, 1)
[pscustomobject]@{ toplamMB = $toplam; adet = $liste.Count; surecler = $liste } | ConvertTo-Json -Depth 4 -Compress
