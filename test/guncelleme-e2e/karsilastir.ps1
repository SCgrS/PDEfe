# kayit-goruntusu.ps1 çıktısı iki JSON'u başlık başlık karşılaştırır. Fark yoksa "AYNI", varsa farklı başlıkları yazar (çıkış kodu 1).
param([Parameter(Mandatory = $true)][string]$Once, [Parameter(Mandatory = $true)][string]$Sonra)
$a = Get-Content $Once -Raw -Encoding UTF8 | ConvertFrom-Json
$b = Get-Content $Sonra -Raw -Encoding UTF8 | ConvertFrom-Json
$adlar = @($a.PSObject.Properties.Name) + @($b.PSObject.Properties.Name) | Select-Object -Unique
$fark = 0
foreach ($ad in $adlar) {
  $x = $a.$ad | ConvertTo-Json -Depth 12 -Compress
  $y = $b.$ad | ConvertTo-Json -Depth 12 -Compress
  if ($x -ceq $y) { Write-Output "AYNI   $ad" } else { $fark++; Write-Output "FARKLI $ad`n  önce:  $x`n  sonra: $y" }
}
if ($fark) { Write-Output "$fark başlıkta fark var."; exit 1 } else { Write-Output 'Bütün başlıklar aynı.' }
