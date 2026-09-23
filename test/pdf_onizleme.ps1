# Windows'ta .pdf için kayıtlı önizleme işleyicisiyle (Gezgin önizleme bölmesinin kullandığı COM nesnesi) bir PDF'i o işleyicinin
# çizim motoruyla çizip PNG'ye kaydeder: PDEfe'nin yazdığı notların başka bir PDF okuyucusunda görünüp görünmediği ekrana pencere
# açmadan denetlenir. İşleyicinin CLSID'i kayıt defterinden bulunur (OnizleyiciClsid); -Clsid verilirse kayıt defterine bakılmaz.
# Pencere ekranda ama DWM ile gizlidir (cloak), odak almaz, görev çubuğunda görünmez. -Asagi N: N kez PageDown (sonraki sayfalar).
# Önizleme işleyicisi süreç başlatabilir (prevhost.exe, işleyicinin kendi programı); iş bitince kapanmayanları çağıran kapatmalıdır.
# Kullanım: powershell -STA -File test\pdf_onizleme.ps1 -Pdf <yol> -Cikti <png> [-Genislik 900] [-Yukseklik 1200] [-Bekle 12] [-Asagi 0]
#           [-Clsid <GUID>]
# Not: önizleme işleyicisi metni gri tonlamalı çizebilir; aynı programın kendi penceresi (LCD yumuşatma ayarıyla) ClearType benzeri
# çizebilir.
param(
  [Parameter(Mandatory = $true)][string]$Pdf,
  [Parameter(Mandatory = $true)][string]$Cikti,
  [int]$Genislik = 900,
  [int]$Yukseklik = 1200,
  [int]$Bekle = 12,
  [int]$Asagi = 0,
  [string]$Clsid = ''
)
$ErrorActionPreference = 'Stop'

# IPreviewHandler arayüzünün GUID'i: önizleme işleyicisi dosya türünün (ya da ProgID'sinin) ShellEx\<bu GUID> anahtarında kayıtlıdır
$ONIZLEME_ANAHTARI = '{8895b1c6-b41f-4c1c-a562-0d564250836f}'

function GuidMi([string]$Metin) {
  $g = [Guid]::Empty
  return [Guid]::TryParse($Metin, [ref]$g)
}

# Kayıt defteri anahtarının varsayılan değeri; anahtar ya da değer yoksa $null
function VarsayilanDeger([string]$Yol) {
  $anahtar = Get-Item -LiteralPath $Yol -ErrorAction SilentlyContinue
  if (-not $anahtar) { return $null }
  $deger = $anahtar.GetValue('')
  if ($deger -is [string] -and $deger.Trim()) { return $deger.Trim() }
  return $null
}

# .pdf için kayıtlı önizleme işleyicisinin CLSID'i; sırayla: kullanıcının kaydı (HKCU\Software\Classes\.pdf), HKCR\.pdf
# (kullanıcı ve makine kayıtlarının birleşik görünümü), .pdf'nin ProgID'si (HKCR\.pdf varsayılan değeri) altındaki kayıt.
# Her birinde ShellEx\$ONIZLEME_ANAHTARI anahtarının varsayılan değerine bakılır. Bulunamazsa $null.
function OnizleyiciClsid {
  $adaylar = @("HKCU:\Software\Classes\.pdf\ShellEx\$ONIZLEME_ANAHTARI",
               "Registry::HKEY_CLASSES_ROOT\.pdf\ShellEx\$ONIZLEME_ANAHTARI")
  $progId = VarsayilanDeger 'Registry::HKEY_CLASSES_ROOT\.pdf'
  if ($progId) { $adaylar += "Registry::HKEY_CLASSES_ROOT\$progId\ShellEx\$ONIZLEME_ANAHTARI" }
  foreach ($yol in $adaylar) {
    $deger = VarsayilanDeger $yol
    if ($deger -and (GuidMi $deger)) { return $deger }
  }
  return $null
}

if ($Clsid) {
  if (-not (GuidMi $Clsid)) { throw "-Clsid geçersiz: '$Clsid' bir GUID değil." }
} else {
  $Clsid = OnizleyiciClsid
  if (-not $Clsid) {
    throw ("Windows'ta .pdf için kayıtlı bir önizleme işleyicisi bulunamadı: HKCU\Software\Classes\.pdf, HKCR\.pdf ve .pdf'nin " +
           "ProgID'si altında ShellEx\$ONIZLEME_ANAHTARI anahtarı yok. İşleyicinin CLSID'ini -Clsid ile verin.")
  }
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Windows.Forms;
public class GizliForm : Form {
  // Odağı kullanıcının penceresinden almaz, görev çubuğunda ve Alt+Tab'da görünmez
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000080; return cp; } }
}
public static class Onizleme {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left, top, right, bottom; }
  [ComImport, Guid("8895b1c6-b41f-4c1c-a562-0d564250836f"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPreviewHandler {
    void SetWindow(IntPtr hwnd, ref RECT rect);
    void SetRect(ref RECT rect);
    void DoPreview();
    void Unload();
    void SetFocus();
    void QueryFocus(out IntPtr phwnd);
    [PreserveSig] uint TranslateAccelerator(IntPtr pmsg);
  }
  [ComImport, Guid("b7d14566-0509-4cce-a71f-0a554233bd9b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IInitializeWithFile { void Initialize([MarshalAs(UnmanagedType.LPWStr)] string pszFilePath, uint grfMode); }
  [ComImport, Guid("b824b49d-22ac-4161-ac8a-9916e8fa3f7f"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IInitializeWithStream { void Initialize(IStream pstm, uint grfMode); }
  [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)] static extern int SHCreateStreamOnFileEx(string pszFile, uint grfMode, uint dwAttributes, bool fCreate, IStream pstmTemplate, out IStream ppstm);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, System.Text.StringBuilder sb, int n);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int val, int size);
  [DllImport("ole32.dll")] static extern int CoCreateInstance(ref Guid clsid, IntPtr outer, uint ctx, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);

  // clsidMetni: önizleme işleyicisinin CLSID'i (betik kayıt defterinden bulur ya da -Clsid ile verilir)
  public static string Calistir(string pdf, string cikti, int w, int h, int bekleSn, int asagi, string clsidMetni) {
    var log = new System.Text.StringBuilder();
    var form = new GizliForm();
    form.StartPosition = FormStartPosition.Manual;
    form.Location = new Point(0, 0);
    form.Size = new Size(w, h);
    form.ShowInTaskbar = false;
    form.FormBorderStyle = FormBorderStyle.None;
    // Pencere ekranda ama DWM ile gizli (cloak): kullanıcı görmez, içerik yine çizilir
    int gizle = 1; int hrc = DwmSetWindowAttribute(form.Handle, 13, ref gizle, 4);
    log.AppendLine("cloak hr=0x" + hrc.ToString("X"));
    form.Show();
    Application.DoEvents();
    Guid clsid = new Guid(clsidMetni);
    log.AppendLine("clsid=" + clsid.ToString("B"));
    Guid iunk = new Guid("00000000-0000-0000-C000-000000000046");
    object o = null;
    foreach (uint ctx in new uint[] { 4, 1 }) {
      int hr = CoCreateInstance(ref clsid, IntPtr.Zero, ctx, ref iunk, out o);
      log.AppendLine("CoCreateInstance ctx=" + ctx + " hr=0x" + hr.ToString("X"));
      if (hr == 0) break;
    }
    if (o == null) return log.ToString() + "olusturulamadi";
    bool tamam = false;
    var f = o as IInitializeWithFile;
    if (f != null) { try { f.Initialize(pdf, 0); tamam = true; log.AppendLine("IInitializeWithFile"); } catch (Exception e) { log.AppendLine("dosya: " + e.Message); } }
    if (!tamam) {
      var s = o as IInitializeWithStream;
      if (s == null) return log.ToString() + "akis arayuzu yok";
      IStream akis; int hr2 = SHCreateStreamOnFileEx(pdf, 0x20, 0, false, null, out akis);
      log.AppendLine("SHCreateStreamOnFileEx hr=0x" + hr2.ToString("X"));
      s.Initialize(akis, 0); log.AppendLine("IInitializeWithStream");
    }
    var ph = (IPreviewHandler)o;
    var r = new RECT { left = 0, top = 0, right = w, bottom = h };
    ph.SetWindow(form.Handle, ref r);
    ph.DoPreview();
    var son = DateTime.Now.AddSeconds(bekleSn);
    while (DateTime.Now < son) { Application.DoEvents(); System.Threading.Thread.Sleep(100); }
    if (asagi > 0) {
      // Önizleyicinin sayfa görünümü penceresine (sınıf adında AVView geçen en büyük alt pencere) PageDown gönderilir; odak ve ön
      // plan gerekmez. Böyle bir pencere yoksa (sayfa görünümü başka sınıf adlı işleyici) sayfa çevrilmez.
      IntPtr hedef = IntPtr.Zero; long enBuyuk = 0;
      EnumChildWindows(form.Handle, (c, l) => {
        var sb = new System.Text.StringBuilder(128); GetClassName(c, sb, 128); RECT rr; GetWindowRect(c, out rr);
        long alan = (long)(rr.right - rr.left) * (rr.bottom - rr.top);
        log.AppendLine("  alt: " + sb + " " + (rr.right - rr.left) + "x" + (rr.bottom - rr.top));
        if (sb.ToString().Contains("AVView") && alan >= enBuyuk) { enBuyuk = alan; hedef = c; }
        return true; }, IntPtr.Zero);
      log.AppendLine("hedef=" + hedef);
      for (int i = 0; i < asagi && hedef != IntPtr.Zero; i++) {
        PostMessage(hedef, 0x0100, (IntPtr)0x22, (IntPtr)0x01510001); PostMessage(hedef, 0x0101, (IntPtr)0x22, unchecked((IntPtr)0xC1510001));
        var t = DateTime.Now.AddSeconds(1.5); while (DateTime.Now < t) { Application.DoEvents(); System.Threading.Thread.Sleep(50); }
      }
      var t2 = DateTime.Now.AddSeconds(4); while (DateTime.Now < t2) { Application.DoEvents(); System.Threading.Thread.Sleep(100); }
    }
    using (var bmp = new Bitmap(w, h)) {
      using (var g = Graphics.FromImage(bmp)) { IntPtr hdc = g.GetHdc(); bool ok = PrintWindow(form.Handle, hdc, 2); g.ReleaseHdc(hdc); log.AppendLine("PrintWindow=" + ok); }
      bmp.Save(cikti, System.Drawing.Imaging.ImageFormat.Png);
    }
    try { ph.Unload(); } catch { }
    Marshal.ReleaseComObject(o);
    form.Close();
    return log.ToString();
  }
}
"@
[Onizleme]::Calistir($Pdf, $Cikti, $Genislik, $Yukseklik, $Bekle, $Asagi, $Clsid)
