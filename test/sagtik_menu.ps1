# Sağ tık menüsünün Gezgin'in menü koduyla sınaması (0.3.1). Kayıt defterine sınama fiilleri (HKCU\Software\Classes\*\shell\PDEfeSinama.Birlestir,
# PDEfeSinama.Donustur) ve sınama CLSID'leri (DLL'in tanıdığı ayrı kimlikler, gerçek PDEfe'ninkiler değil) yazılır, sagtik\tests\menu.rs menüyü
# shell32'nin kurduğu gibi kurar (IShellFolder::GetUIObjectOf → IContextMenu::QueryContextMenu: Gezgin'in klasik menüsü) ve tıklar. Düzen
# test\sagtik_kayitlari.json'dan (kurucunun yazdığıyla aynı değerler).
# Gerçek Gezgin'e dokunmamak için: Bu PowerShell Claude masaüstü paketinin içinde çalışır, HKCU yazımları paketin sanal kovanına gider. Betik bunu
# önce kanıtlar: Her anahtar yazıldıktan hemen sonra gerçek kovanda (WMI StdRegProv, paket dışından) OLMADIĞINA bakar, varsa siler ve durur.
# Kanıt tutmazsa sınama yapılmaz. Sonda bütün sınama anahtarları silinir, iki görünümde de kalmadıkları denetlenir. GitHub Actions'ta (GITHUB_ACTIONS)
# kanıt aranmaz: Sanal makine her işte yeniden kurulur, kayıtlar orada gerçek HKCU'ya yazılır.
# Kullanım:  powershell -ExecutionPolicy Bypass -File test\sagtik_menu.ps1 [-Klasor <deneme klasörü>]
param([string]$Klasor = "")
$ErrorActionPreference = 'Stop'
$kok = Split-Path -Parent $PSScriptRoot
$sagtik = Join-Path $kok 'sagtik'
if (-not $Klasor) { $Klasor = Join-Path $env:TEMP "pdefe-sagtik-menu-$PID" }
$CI = $env:GITHUB_ACTIONS -eq 'true'
# Yükseltilmiş süreçte COM kullanıcı kovanındaki sınıfları yok sayar, GitHub'ın Windows makinesi yükseltilmiş çalışır: Kayıtlar orada HKLM'ye yazılır
# (makine her işte yeniden kurulur). Gerçek kullanımda Gezgin yükseltilmemiş çalışır, kurucu HKCU'ya yazar.
$yukseltilmis = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$kayitKoku = if ($CI -and $yukseltilmis) { [Microsoft.Win32.Registry]::LocalMachine } else { [Microsoft.Win32.Registry]::CurrentUser }
Write-Output "Kayıt kökü: $($kayitKoku.Name) (CI: $CI, yükseltilmiş: $yukseltilmis)"
$HKCU = [uint32]2147483649
$duzen = Get-Content -LiteralPath (Join-Path $kok 'test\sagtik_kayitlari.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$onek = $duzen.fiilOneki.menuSinamasi
$siniflar = 'Software\Classes'

function Gercekte-Var([string]$anahtar) {
  $r = Invoke-CimMethod -Namespace root\default -ClassName StdRegProv -MethodName EnumValues -Arguments @{ hDefKey = $HKCU; sSubKeyName = $anahtar }
  return $r.ReturnValue -eq 0
}
function Paket-Var([string]$anahtar) {
  $a = $kayitKoku.OpenSubKey($anahtar)
  if ($a) { $a.Close(); return $true }
  return $false
}

$anahtarlar = New-Object System.Collections.Generic.List[string]
foreach ($f in $duzen.fiiller) {
  $anahtarlar.Add("$siniflar\$($duzen.fiilKoku)\$onek.$($f.ad)")
  $anahtarlar.Add("$siniflar\CLSID\$($f.sinamaClsid)")
}
function Temizle {
  foreach ($a in $anahtarlar) {
    try { $kayitKoku.DeleteSubKeyTree($a, $false) } catch { }
  }
}

# Gerçek kovanda bu adlar hiç olmamalı (başka bir yarım koşudan da)
foreach ($a in $anahtarlar) {
  if (-not $CI -and (Gercekte-Var $a)) { throw "Sınama anahtarı gerçek kovanda var (beklenmez, elle bakın): HKCU\$a" }
}

# ------------------------------------------------------------------ 1. kanıt: yazım sanal kovana gidiyor
if (-not $CI) {
  $isaret = "$siniflar\$($duzen.fiilKoku)\$onek.SanalKovanKaniti"
  $a = $kayitKoku.CreateSubKey($isaret)
  $a.SetValue('isaret', '1'); $a.Close()
  $paket = Paket-Var $isaret
  $gercek = Gercekte-Var $isaret
  $kayitKoku.DeleteSubKeyTree($isaret, $false)
  if ($gercek) { throw "HKCU yazımı gerçek kovana gitti (HKCU\$isaret, silindi): Menü sınaması yapılmadı." }
  if (-not $paket) { throw "Yazılan işaret paket görünümünde de yok: Ölçüm yapılamadı, menü sınaması yapılmadı." }
  Write-Output "Kanıt: HKCU\$isaret paket görünümünde vardı, gerçek kovanda (WMI) yoktu. Silindi."
}

$cargo = (Get-Command cargo -ErrorAction SilentlyContinue).Source
if (-not $cargo) { $cargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe' }
function Menu-Calistir([string[]]$a) {
  # Menü kurulurken yüklenen başka programların kabuk eklentileri hata akışına yazabilir (ör. "Logging before InitGoogle()"): Windows
  # PowerShell 5.1 bunu Stop'ta hata sayardı
  $onceki = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    $cikti = & $cargo test --release --quiet --manifest-path (Join-Path $sagtik 'Cargo.toml') --test menu -- @a 2>&1 | ForEach-Object { "$_" }
    $script:menuKodu = $LASTEXITCODE
  } finally { $ErrorActionPreference = $onceki }
  return $cikti
}

$hatalar = 0
try {
  # ------------------------------------------------------------------ 2. DLL kopyası, sahte PDEfe, kurgusal dosyalar
  $hazir = Menu-Calistir @('hazirla', $Klasor)
  $dll = ($hazir | Where-Object { $_ -like 'DLL=*' } | Select-Object -First 1) -replace '^DLL=', ''
  $sahte = ($hazir | Where-Object { $_ -like 'SAHTE=*' } | Select-Object -First 1) -replace '^SAHTE=', ''
  if (-not $dll -or -not (Test-Path -LiteralPath $dll)) { throw "Hazırlık olmadı: $($hazir -join "`n")" }

  # ------------------------------------------------------------------ 3. kayıtlar (her yazımdan sonra gerçek kovana bakılır)
  function Yaz([string]$anahtar, [hashtable]$degerler) {
    $a = $kayitKoku.CreateSubKey($anahtar)
    foreach ($k in $degerler.Keys) { $a.SetValue($(if ($k -eq '@') { '' } else { $k }), [string]$degerler[$k], [Microsoft.Win32.RegistryValueKind]::String) }
    $a.Close()
    if (-not $CI -and (Gercekte-Var $anahtar)) {
      Temizle
      throw "Yazım gerçek kovana gitti (HKCU\$anahtar): Sınama durdu, sınama anahtarları silindi."
    }
  }
  function Dok([string]$s, $f) {
    return $s.Replace('{BASLIK}', $f.baslik).Replace('{CLSID}', $f.sinamaClsid).Replace('{EXE}', $sahte).Replace('{DLL}', $dll)
  }
  foreach ($f in $duzen.fiiller) {
    $cd = @{}; foreach ($p in $duzen.clsidDegerleri.PSObject.Properties) { $cd[$p.Name] = Dok $p.Value $f }
    Yaz "$siniflar\CLSID\$($f.sinamaClsid)" $cd
    $id = @{}; foreach ($p in $duzen.inprocDegerleri.PSObject.Properties) { $id[$p.Name] = Dok $p.Value $f }
    Yaz "$siniflar\CLSID\$($f.sinamaClsid)\InprocServer32" $id
    $fd = @{}; foreach ($p in $duzen.fiilDegerleri.PSObject.Properties) { $fd[$p.Name] = Dok $p.Value $f }
    Yaz "$siniflar\$($duzen.fiilKoku)\$onek.$($f.ad)" $fd
  }
  $anahtarlar.Insert(0, "$siniflar\CLSID\$($duzen.fiiller[0].sinamaClsid)\InprocServer32")
  Write-Output "Sınama kayıtları yazıldı ($($anahtarlar.Count) anahtar), gerçek kovanda yoklar."

  # ------------------------------------------------------------------ 4. menü
  $sonuc = Menu-Calistir @('sina', $Klasor)
  $sonuc | ForEach-Object { Write-Output $_ }
  if ($script:menuKodu -ne 0) { $hatalar++ }
} finally {
  # ------------------------------------------------------------------ 5. temizlik
  Temizle
  foreach ($a in $anahtarlar) {
    if (Paket-Var $a) { Write-Output "HATA   Sınama anahtarı silinemedi (paket görünümü): HKCU\$a"; $hatalar++ }
    if (-not $CI -and (Gercekte-Var $a)) { Write-Output "HATA   Sınama anahtarı gerçek kovanda: HKCU\$a"; $hatalar++ }
  }
  Write-Output "Sınama anahtarları silindi; iki görünümde de yoklar."
  try { Remove-Item -LiteralPath $Klasor -Recurse -Force -ErrorAction Stop } catch { Write-Output "(deneme klasörü kaldı, DLL bir süre yüklü kalabilir: $Klasor)" }
}
if ($hatalar) { Write-Output "MENÜ SINAMASI: $hatalar hata"; exit 1 }
Write-Output 'MENÜ SINAMASI: TAMAM'
