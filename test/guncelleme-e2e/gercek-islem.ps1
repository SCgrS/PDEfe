# gercek-oturum.ps1 ile GERÇEK oturumda çalıştırılan işlemler (deneme uygulaması "PDEfe Guncelleme Testi" için). Çıktı -Cikti dosyasına.
#   goruntu        kayit-goruntusu.ps1 (gerçek kayıt defteri ve dosyalar)
#   durum          deneme uygulamasının gerçek izleri: ayarlar.json, kurulu exe sürümü, kaldırma kaydı, güncelleme önbelleği
#   pencereAyarla  ayarlar.json'daki pencereyi ekran dışına alır (-2600, 0), öbür ayarlara dokunmaz
#   ac             deneme uygulamasını -Port CDP portuyla başlatır
#   kaldir         deneme uygulamasını kendi kaldırıcısıyla sessizce kaldırır, userData ve güncelleme önbelleğini siler
param([Parameter(Mandatory = $true)][string]$Islem, [Parameter(Mandatory = $true)][string]$Cikti, [int]$Port = 9912)
$ErrorActionPreference = 'Stop'
$URUN = 'PDEfe Guncelleme Testi'
$kurulum = Join-Path $env:LOCALAPPDATA "Programs\$URUN"
$exe = Join-Path $kurulum "$URUN.exe"
$veri = Join-Path $env:APPDATA $URUN
$onbellek = Join-Path $env:LOCALAPPDATA 'pdefe-guncelleme-testi-updater'
$ayar = Join-Path $veri 'ayarlar.json'
$satirlar = New-Object System.Collections.ArrayList
function Yaz($s) { [void]$satirlar.Add([string]$s) }
function TestKayitlari {
  foreach ($k in (Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue)) {
    if ("$($k.GetValue('DisplayName'))" -eq $URUN) {
      Yaz "kaldırma kaydı: $($k.PSChildName) $($k.GetValue('DisplayVersion')) | $($k.GetValue('QuietUninstallString'))"
      if (Test-Path "HKCU:\Software\$($k.PSChildName)") { Yaz "kurulum anahtarı: HKCU\Software\$($k.PSChildName) = $((Get-ItemProperty "HKCU:\Software\$($k.PSChildName)").InstallLocation)" }
    }
  }
}
try {
  Yaz "oturum: $([Environment]::UserName), LOCALAPPDATA Target: '$((Get-Item $env:LOCALAPPDATA -Force).Target)'"
  switch ($Islem) {
    'goruntu' { & (Join-Path $PSScriptRoot 'kayit-goruntusu.ps1') -Cikti $Cikti; exit 0 }
    'durum' {
      Yaz "ayarlar.json var: $(Test-Path $ayar)"
      if (Test-Path $ayar) { Yaz (Get-Content $ayar -Raw -Encoding UTF8) }
      Yaz "exe: $(if (Test-Path $exe) { (Get-Item $exe).VersionInfo.FileVersion } else { 'yok' })"
      Yaz "önbellek: $(if (Test-Path $onbellek) { (Get-ChildItem $onbellek -Recurse -Force | ForEach-Object { "$($_.FullName.Substring($onbellek.Length)) $($_.Length)" }) -join '; ' } else { 'yok' })"
      Yaz "userData var: $(Test-Path $veri)"
      TestKayitlari
    }
    'pencereAyarla' {
      New-Item -ItemType Directory -Force $veri | Out-Null
      $js = "const fs=require('fs');const y=process.argv[1];let a={};try{a=JSON.parse(fs.readFileSync(y,'utf8'))}catch{};a.pencere={x:-2600,y:0,genislik:1100,yukseklik:800,buyutulmus:false};fs.writeFileSync(y,JSON.stringify(a,null,'\t'));console.log(JSON.stringify(a))"
      Yaz (& node -e $js $ayar)
    }
    'anahtarZamanlari' {
      # Gerçek PDEfe'nin kayıt anahtarlarının son yazılma zamanı (RegQueryInfoKey): testten önceyse test onlara dokunmamıştır
      Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using Microsoft.Win32.SafeHandles;
public static class AnahtarZamani {
  [DllImport("advapi32.dll")] static extern int RegQueryInfoKey(SafeRegistryHandle h, IntPtr c, IntPtr cl, IntPtr r, IntPtr sk, IntPtr msk, IntPtr mc, IntPtr v, IntPtr mvn, IntPtr mvl, IntPtr sd, out long ft);
  public static DateTime Al(Microsoft.Win32.RegistryKey k) { long ft; RegQueryInfoKey(k.Handle, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, out ft); return DateTime.FromFileTime(ft); }
}
'@
      $guid = (Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Where-Object { $_.GetValue('DisplayName') -eq 'PDEfe' } | Select-Object -First 1).PSChildName
      foreach ($y in @('Software\Classes\.pdf', 'Software\Classes\.pdf\OpenWithProgids', 'Software\Classes\PDEfe.pdf', 'Software\Classes\PDEfe.pdf\shell\open\command',
          'Software\Classes\Applications\PDEfe.exe', 'Software\RegisteredApplications', 'Software\PDEfe\Capabilities', 'Software\PDEfe\Capabilities\FileAssociations',
          "Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid", "Software\$guid")) {
        $k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($y)
        if ($k) { Yaz ("{0:yyyy-MM-dd HH:mm:ss}  HKCU\{1}" -f [AnahtarZamani]::Al($k), $y); $k.Close() } else { Yaz "yok  HKCU\$y" }
      }
    }
    'ac' {
      $p = Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$Port" -PassThru
      Yaz "başlatıldı: PID $($p.Id)"
    }
    'kaldir' {
      $kaldirici = Join-Path $kurulum "Uninstall $URUN.exe"
      if (Test-Path $kaldirici) {
        $p = Start-Process -FilePath $kaldirici -ArgumentList '/S', '/currentuser' -PassThru
        $bas = Get-Date
        while (-not $p.HasExited -and ((Get-Date) - $bas).TotalSeconds -lt 120) { Start-Sleep -Milliseconds 500 }
        Yaz "kaldırıcı çıkış kodu: $($p.ExitCode)"
        # NSIS kaldırıcısı kendini geçici klasöre kopyalayıp oradan sürdürür; kurulum klasörü silinene dek bekle
        for ($i = 0; $i -lt 60 -and (Test-Path $exe); $i++) { Start-Sleep -Milliseconds 500 }
      } else { Yaz 'kaldırıcı yok' }
      Yaz "kurulum klasörü kaldı mı: $(Test-Path $kurulum)"
      foreach ($k in @($veri, $onbellek)) { if (Test-Path $k) { Remove-Item -LiteralPath $k -Recurse -Force; Yaz "silindi: $k" } }
      TestKayitlari
      Yaz "userData kaldı mı: $(Test-Path $veri); önbellek kaldı mı: $(Test-Path $onbellek)"
    }
    default { throw "bilinmeyen işlem: $Islem" }
  }
} catch { Yaz "HATA: $($_.Exception.Message)" }
[IO.File]::WriteAllText($Cikti, ($satirlar -join "`r`n"), (New-Object Text.UTF8Encoding $false))
