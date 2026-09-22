# Güncelleme kurulumunu izler (yalnızca okur): deneme uygulamasının kapanışı, kurucu ve kaldırıcı süreçleri, bunların görünür
# pencereleri (sessiz kurulumda hiç olmamalı) ve uygulamanın yeniden açılışı (komut satırı, sürüm). Olay listesini JSON yazar.
# Kullanım: powershell -File test\guncelleme-e2e\kurulum-izle.ps1 -Cikti <izlem.json> [-Sure 150]
param([Parameter(Mandatory = $true)][string]$Cikti, [int]$Sure = 150)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class PencereIzle {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public static List<string> Gorunenler(HashSet<uint> pidler) {
    var l = new List<string>();
    EnumWindows((h, x) => { uint p; GetWindowThreadProcessId(h, out p);
      if (pidler.Contains(p) && IsWindowVisible(h)) { var s = new StringBuilder(256); GetWindowText(h, s, 256); l.Add(p + ":" + s.ToString()); }
      return true; }, IntPtr.Zero);
    return l;
  }
}
'@
$kurulum = Join-Path $env:LOCALAPPDATA 'Programs\PDEfe Guncelleme Testi'
$onbellek = Join-Path $env:LOCALAPPDATA 'pdefe-guncelleme-testi-updater'
$olaylar = New-Object System.Collections.ArrayList
$bilinen = @{}
$bas = Get-Date
$uygulamaKapandi = $null; $yeniden = $null
function Olay($tur, $ayrinti) { [void]$olaylar.Add([ordered]@{ sn = [math]::Round(((Get-Date) - $bas).TotalSeconds, 1); tur = $tur; ayrinti = $ayrinti }) }
while (((Get-Date) - $bas).TotalSeconds -lt $Sure) {
  $surecler = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.ExecutablePath -and ($_.ExecutablePath.StartsWith($kurulum + '\', 'OrdinalIgnoreCase') -or $_.ExecutablePath.StartsWith($onbellek + '\', 'OrdinalIgnoreCase') -or
        $_.Name -match '^(Un_\w+|old-uninstaller|Uninstall PDEfe Guncelleme Testi)\.exe$') })
  $pidler = New-Object 'System.Collections.Generic.HashSet[uint32]'
  foreach ($s in $surecler) {
    [void]$pidler.Add([uint32]$s.ProcessId)
    if (-not $bilinen.ContainsKey([int]$s.ProcessId)) {
      $bilinen[[int]$s.ProcessId] = $s.Name
      $surum = try { (Get-Item -LiteralPath $s.ExecutablePath).VersionInfo.FileVersion } catch { '' }
      Olay 'süreç başladı' ("{0} [{1}] {2} | {3}" -f $s.Name, $s.ProcessId, $surum, $s.CommandLine)
      if ($uygulamaKapandi -and $s.Name -eq 'PDEfe Guncelleme Testi.exe' -and -not $yeniden -and $s.CommandLine -notmatch '--type=') { $yeniden = Get-Date; Olay 'uygulama yeniden açıldı' $s.CommandLine }
    }
  }
  foreach ($pid_ in @($bilinen.Keys)) { if (-not $pidler.Contains([uint32]$pid_)) { Olay 'süreç bitti' ("{0} [{1}]" -f $bilinen[$pid_], $pid_); $bilinen.Remove($pid_) } }
  $anaUygulama = @($surecler | Where-Object { $_.Name -eq 'PDEfe Guncelleme Testi.exe' -and $_.CommandLine -notmatch '--type=' })
  if (-not $uygulamaKapandi -and -not $anaUygulama.Count) { $uygulamaKapandi = Get-Date; Olay 'uygulama kapandı' '' }
  foreach ($p in [PencereIzle]::Gorunenler($pidler)) {
    $ad = $bilinen[[int]($p.Split(':')[0])]
    if ($ad -ne 'PDEfe Guncelleme Testi.exe') { Olay 'GÖRÜNÜR PENCERE' ("{0} {1}" -f $ad, $p) }
  }
  if ($yeniden -and ((Get-Date) - $yeniden).TotalSeconds -gt 4) { break }
  Start-Sleep -Milliseconds 200
}
$sonuc = [ordered]@{ olaylar = $olaylar; gorunurPencere = @($olaylar | Where-Object { $_.tur -eq 'GÖRÜNÜR PENCERE' }).Count; yenidenAcildi = [bool]$yeniden
  kurulumSuresiSn = if ($yeniden -and $uygulamaKapandi) { [math]::Round(($yeniden - $uygulamaKapandi).TotalSeconds, 1) } else { $null }
  exeSurumu = (Get-Item -LiteralPath (Join-Path $kurulum 'PDEfe Guncelleme Testi.exe')).VersionInfo.FileVersion }
[IO.File]::WriteAllText($Cikti, ($sonuc | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding $false))
Write-Output "izlem yazıldı: $Cikti"
