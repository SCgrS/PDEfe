// Kurucu sınamalarının ortak sürücüsü (0.2.3; test\kurulum_surum.ps1 ve test\kurucu_akis.ps1 Add-Type ile derler, C# 5).
// Görünmeyen ayrı bir Windows masaüstü kurar, süreçleri orada başlatır (CreateProcess lpDesktop) ve NSIS sihirbazını yalnızca Win32
// iletileriyle sürer: ekrana pencere açılmaz, odak çalınmaz, fare / klavye kullanılmaz. Pencere işlemlerinin hepsi o masaüstüne geçmiş
// (SetThreadDesktop) tek bir iş parçacığında yapılır. Sihirbazın düğmeleri: İleri 1, İptal 2, Geri 3; MUI başlıkları 1037 / 1038.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class KurucuSurucu {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left, top, right, bottom; }
  delegate bool EnumProc(IntPtr h, IntPtr l);

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateDesktop(string ad, IntPtr aygit, IntPtr kip, int bayrak, uint erisim, IntPtr sa);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
  [DllImport("user32.dll", SetLastError = true)] static extern bool SetThreadDesktop(IntPtr h);
  [DllImport("user32.dll")] static extern bool EnumDesktopWindows(IntPtr h, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint kip);
  [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, StringBuilder l, uint bayrak, uint ms, out IntPtr sonuc);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint bayrak, uint ms, out IntPtr sonuc);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint bayrak);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int DrawText(IntPtr dc, string s, int n, ref RECT r, uint bicim);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr o);
  [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateFont(int h, int w, int esc, int yon, int agirlik, uint italik, uint alt, uint ustu, uint karakter, uint cikis, uint kirp, uint kalite, uint aile, string ad);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool miras, uint bayrak, IntPtr ortam, string klasor, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr h, uint kod);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h, out uint kod);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint erisim, bool miras, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

  const uint WM_GETTEXT = 0x0D, WM_COMMAND = 0x111, BM_GETCHECK = 0xF0, BM_SETCHECK = 0xF1, BM_CLICK = 0xF5, WM_CHANGEUISTATE = 0x127;
  const uint SMTO_ABORTIFHUNG = 2;

  static IntPtr masa = IntPtr.Zero;
  public static string MasaAdi = "";
  static Thread isci;
  static BlockingCollection<Action> kuyruk;
  static readonly Dictionary<int, IntPtr> surecler = new Dictionary<int, IntPtr>();

  /** Görünmeyen masaüstünü ve ona bağlı iş parçacığını kurar. */
  public static string MasaKur(string ad) {
    masa = CreateDesktop(ad, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000, IntPtr.Zero);   // GENERIC_ALL
    if (masa == IntPtr.Zero) return "masaüstü kurulamadı: " + Marshal.GetLastWin32Error();
    MasaAdi = ad;
    kuyruk = new BlockingCollection<Action>();
    string hata = null;
    var hazir = new ManualResetEvent(false);
    isci = new Thread(() => {
      if (!SetThreadDesktop(masa)) { hata = "iş parçacığı masaüstüne geçemedi: " + Marshal.GetLastWin32Error(); hazir.Set(); return; }
      hazir.Set();
      foreach (var is1 in kuyruk.GetConsumingEnumerable()) is1();
    });
    isci.IsBackground = true;
    isci.Start();
    hazir.WaitOne();
    return hata ?? "tamam";
  }

  public static void MasaKapat() {
    lock (surecler) {
      foreach (var h in surecler.Values) { TerminateProcess(h, 1); CloseHandle(h); }
      surecler.Clear();
    }
    if (kuyruk != null) { kuyruk.CompleteAdding(); isci.Join(5000); kuyruk = null; }
    if (masa != IntPtr.Zero) { CloseDesktop(masa); masa = IntPtr.Zero; }
  }

  static T Yap<T>(Func<T> f) {
    T sonuc = default(T); Exception hata = null;
    var bitti = new ManualResetEvent(false);
    kuyruk.Add(() => { try { sonuc = f(); } catch (Exception h) { hata = h; } bitti.Set(); });
    if (!bitti.WaitOne(60000)) throw new TimeoutException("masaüstü iş parçacığı yanıt vermedi");
    if (hata != null) throw new Exception(hata.Message, hata);
    return sonuc;
  }

  // ------------------------------------------------------------------ süreçler
  /** Komutu görünmeyen masaüstünde başlatır; pid döner (hata: eksi Win32 hata kodu). Alt süreçler masaüstünü devralır. */
  public static int Baslat(string komut, string klasor) {
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.lpDesktop = "WinSta0\\" + MasaAdi;
    PROCESS_INFORMATION pi;
    if (!CreateProcess(null, komut, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, string.IsNullOrEmpty(klasor) ? null : klasor, ref si, out pi)) return -Marshal.GetLastWin32Error();
    CloseHandle(pi.hThread);
    lock (surecler) surecler[pi.dwProcessId] = pi.hProcess;
    return pi.dwProcessId;
  }

  static IntPtr Tutamac(int pid, out bool kapat) {
    lock (surecler) { IntPtr h; if (surecler.TryGetValue(pid, out h)) { kapat = false; return h; } }
    kapat = true;
    return OpenProcess(0x00100000 | 0x1000, false, pid);   // SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION
  }

  /** Süreç ms içinde biterse çıkış kodu, bitmezse -1; tutamaç alınamazsa (süreç yok) -2. */
  public static long Bekle(int pid, int ms) {
    bool kapat; IntPtr h = Tutamac(pid, out kapat);
    if (h == IntPtr.Zero) return -2;
    try {
      if (WaitForSingleObject(h, (uint)ms) != 0) return -1;
      uint kod; GetExitCodeProcess(h, out kod); return kod;
    } finally { if (kapat) CloseHandle(h); }
  }

  public static void Sonlandir(int pid) {
    bool kapat; IntPtr h = Tutamac(pid, out kapat);
    if (h == IntPtr.Zero) return;
    IntPtr h2 = OpenProcess(0x0001 | 0x00100000, false, pid);   // PROCESS_TERMINATE
    if (h2 != IntPtr.Zero) { TerminateProcess(h2, 1); WaitForSingleObject(h2, 5000); CloseHandle(h2); }
    if (kapat) CloseHandle(h);
  }

  // ------------------------------------------------------------------ pencereler
  static string Sinif(IntPtr h) { var s = new StringBuilder(128); GetClassName(h, s, 128); return s.ToString(); }
  static string Yazi(IntPtr h) {
    var s = new StringBuilder(4096); IntPtr r;
    if (SendMessageTimeout(h, WM_GETTEXT, (IntPtr)4096, s, SMTO_ABORTIFHUNG, 3000, out r) == IntPtr.Zero) return "";
    return s.ToString();
  }
  static string Temiz(string s) { return s.Replace("\t", " ").Replace("\r\n", " / ").Replace("\n", " / ").Replace("\r", " "); }

  /** Masaüstündeki üst düzey pencereler: hwnd, pid, sınıf, görünür, sahip, başlık (sekmeyle ayrılmış satırlar). */
  public static string Pencereler() {
    return Yap(() => {
      var sb = new StringBuilder();
      EnumDesktopWindows(masa, (h, l) => {
        int p; GetWindowThreadProcessId(h, out p);
        sb.Append((long)h).Append('\t').Append(p).Append('\t').Append(Sinif(h)).Append('\t').Append(IsWindowVisible(h) ? 1 : 0).Append('\t')
          .Append((long)GetWindow(h, 4)).Append('\t').Append(Temiz(Yazi(h))).Append('\n');   // GW_OWNER
        return true;
      }, IntPtr.Zero);
      return sb.ToString();
    });
  }

  /** Penceredeki bütün denetimler: hwnd, üst, sınıf, kimlik, biçem, görünür, etkin, işaret, x, y, en, boy, yazı (konum pencereye göre). */
  public static string Denetimler(long pencere) {
    return Yap(() => {
      IntPtr p = (IntPtr)pencere; RECT dr; GetWindowRect(p, out dr);
      var sb = new StringBuilder();
      EnumChildWindows(p, (h, l) => {
        RECT r; GetWindowRect(h, out r);
        string k = Sinif(h); int stil = GetWindowLong(h, -16);
        long isaret = -1;
        if (k == "Button") { IntPtr s; SendMessageTimeout(h, BM_GETCHECK, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 2000, out s); isaret = (long)s; }
        sb.Append((long)h).Append('\t').Append((long)GetParent(h)).Append('\t').Append(k).Append('\t').Append(GetDlgCtrlID(h)).Append('\t')
          .Append(stil).Append('\t').Append(IsWindowVisible(h) ? 1 : 0).Append('\t').Append(IsWindowEnabled(h) ? 1 : 0).Append('\t').Append(isaret).Append('\t')
          .Append(r.left - dr.left).Append('\t').Append(r.top - dr.top).Append('\t').Append(r.right - r.left).Append('\t').Append(r.bottom - r.top).Append('\t')
          .Append(Temiz(Yazi(h))).Append('\n');
        return true;
      }, IntPtr.Zero);
      return sb.ToString();
    });
  }

  /** Sihirbazın düğmesine basar (İleri 1, İptal 2, Geri 3): WM_COMMAND gönderilir, beklenmez (sayfanın işlevi ileti kutusu açabilir). */
  public static bool Dugme(long pencere, int kimlik) {
    return Yap(() => {
      IntPtr p = (IntPtr)pencere; IntPtr d = GetDlgItem(p, kimlik);
      if (d == IntPtr.Zero || !IsWindowEnabled(d) || !IsWindowVisible(d)) return false;
      return PostMessage(p, WM_COMMAND, (IntPtr)(kimlik & 0xFFFF), d);   // BN_CLICKED = 0
    });
  }

  /** Seçenek / onay kutusu tıklaması (BM_CLICK); denetimin durumu değişmezse BM_SETCHECK + üst pencereye BN_CLICKED. Yeni işaret döner. */
  public static long Tikla(long denetim) {
    return Yap(() => {
      IntPtr h = (IntPtr)denetim; IntPtr r;
      SendMessageTimeout(h, BM_GETCHECK, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 2000, out r); long once = (long)r;
      SendMessageTimeout(h, BM_CLICK, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 3000, out r);
      Thread.Sleep(100);
      SendMessageTimeout(h, BM_GETCHECK, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 2000, out r); long sonra = (long)r;
      int stil = GetWindowLong(h, -16) & 0xF;
      bool radyo = stil == 4 || stil == 9;
      if (sonra == once && !(radyo && once == 1)) {
        SendMessageTimeout(h, BM_SETCHECK, (IntPtr)(once == 1 ? 0 : 1), IntPtr.Zero, SMTO_ABORTIFHUNG, 2000, out r);
        SendMessageTimeout(GetParent(h), WM_COMMAND, (IntPtr)(GetDlgCtrlID(h) & 0xFFFF), h, SMTO_ABORTIFHUNG, 3000, out r);
        Thread.Sleep(100);
        SendMessageTimeout(h, BM_GETCHECK, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 2000, out r); sonra = (long)r;
      }
      return sonra;
    });
  }

  /** İleti kutusunun düğmesine basar (IDOK 1, IDCANCEL 2 …). Yalnızca Tamam'lı (MB_OK) kutuda Tamam düğmesinin kimliği 2'dir (Esc ile kapansın diye). */
  public static bool IletiYanitla(long kutu, int kimlik) {
    return Yap(() => {
      IntPtr p = (IntPtr)kutu; IntPtr d = GetDlgItem(p, kimlik);
      if (d == IntPtr.Zero && kimlik == 1) { kimlik = 2; d = GetDlgItem(p, 2); }
      if (d == IntPtr.Zero) return false;
      return PostMessage(p, WM_COMMAND, (IntPtr)(kimlik & 0xFFFF), d);
    });
  }

  // ------------------------------------------------------------------ görüntü ve metin sığma ölçüsü
  static int Olc(IntPtr h, string s, int genislik, string yaziTipi, int punto, bool tekSatir) {
    IntPtr dc = GetDC(h);
    IntPtr yt = CreateFont(-(punto * 96 / 72), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0, yaziTipi);
    IntPtr eski = SelectObject(dc, yt);
    var olcu = new RECT { left = 0, top = 0, right = genislik, bottom = 0 };
    DrawText(dc, s, -1, ref olcu, tekSatir ? 0x400u | 0x20u : 0x400u | 0x10u);   // DT_CALCRECT | DT_SINGLELINE / DT_WORDBREAK
    SelectObject(dc, eski); DeleteObject(yt); ReleaseDC(h, dc);
    return tekSatir ? olcu.right : olcu.bottom;
  }

  static int SatirYuksekligi(IntPtr h) {
    IntPtr dc = GetDC(h);
    IntPtr yt = CreateFont(-(8 * 96 / 72), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0, "MS Shell Dlg");
    IntPtr eski = SelectObject(dc, yt);
    var olcu = new RECT();
    DrawText(dc, "Ağ", -1, ref olcu, 0x400u | 0x20u);
    SelectObject(dc, eski); DeleteObject(yt); ReleaseDC(h, dc);
    return olcu.bottom;
  }

  /** Seçeneğin / onay kutusunun yazı alanı (kutu simgesinin sağı), görüntü koordinatlarında. */
  static RECT SecimAlani(IntPtr h, int ox, int oy) {
    RECT r; GetWindowRect(h, out r);
    return new RECT { left = r.left - ox + GetSystemMetrics(71) + 4, top = r.top - oy, right = r.right - ox, bottom = r.bottom - oy };
  }

  static bool SecimMi(IntPtr h) {
    if (!IsWindowVisible(h) || Sinif(h) != "Button" || Yazi(h).Replace("&", "").Length == 0) return false;
    int tur = GetWindowLong(h, -16) & 0xF;
    return tur == 2 || tur == 3 || tur == 4 || tur == 9;
  }

  static bool KoyuVar(Bitmap bmp, RECT a) {
    for (int y = Math.Max(0, a.top); y < Math.Min(bmp.Height, a.bottom); y++)
      for (int x = Math.Max(0, a.left); x < Math.Min(bmp.Width, a.right); x++) { var c = bmp.GetPixel(x, y); if ((c.R + c.G + c.B) / 3 < 140) return true; }
    return false;
  }

  /**
   * Görüntü sayfa çizilmeden mi alındı (0.2.3, bağımsız incelemenin bulgusu): MUI başlığının (1037) ya da görünür, etkin bir seçeneğin / onay
   * kutusunun yazı alanında hiç koyu piksel yoksa o yazı görüntüde yoktur; seçeneğin "kenarlara değmiyor" kararı da anlamsızdır (görünmeyen
   * masaüstünde ilk yakalamada 16 görüntünün 7'si böyleydi, hepsi SIĞIYOR çıkmıştı). Döner: yazısı görünmeyen ilk denetimin metni ya da null.
   */
  static string BosAlan(IntPtr pencere, Bitmap bmp, int ox, int oy) {
    IntPtr baslik = GetDlgItem(pencere, 1037);
    if (baslik != IntPtr.Zero && IsWindowVisible(baslik) && Yazi(baslik).Length > 0) {
      RECT r; GetWindowRect(baslik, out r);
      if (!KoyuVar(bmp, new RECT { left = r.left - ox, top = r.top - oy, right = r.right - ox, bottom = r.bottom - oy })) return "başlık: " + Yazi(baslik);
    }
    string bos = null;
    EnumChildWindows(pencere, (h, l) => {
      if (!SecimMi(h) || !IsWindowEnabled(h)) return true;   // solgun yazı açık gri çizilebilir: boşluk ölçüsüne girmez
      if (KoyuVar(bmp, SecimAlani(h, ox, oy))) return true;
      bos = Yazi(h).Replace("&", "");
      return false;
    }, IntPtr.Zero);
    return bos;
  }

  /**
   * Görünür yazılı denetimlerin metni kutusuna sığıyor mu (test\kurulum_bitis.ps1'in ölçüsü, seçenekler ve düğmeler eklendi). Etiketler
   * PrintWindow'da her zaman çizilmediğinden ölçüyle: iletişim kutusu yazı tipi (MS Shell Dlg 8) ve daha büyük Segoe UI 9, büyük olanı.
   * Onay kutusu / seçenek: görüntüde kutu simgesinin sağındaki alanın üst ya da alt satırında koyu piksel varsa metin kesiliyordur; tek
   * satırlık kutuda metnin tek satır genişliği yazı alanından büyükse de taşıyordur (0.2.3: önceden yalnızca rapora yazılıyordu).
   * Düğme: tek satır genişliği iç alana (kenarlar 6'şar px) sığmalı.
   */
  static string Sigma(IntPtr pencere, Bitmap bmp, int ox, int oy) {
    var sb = new StringBuilder();
    EnumChildWindows(pencere, (h, l) => {
      if (!IsWindowVisible(h)) return true;
      string k = Sinif(h); string s = Yazi(h).Replace("&", "");
      if (s.Length == 0 || (k != "Static" && k != "Button")) return true;
      // Dış pencerede yalnızca MUI başlıkları (1037 / 1038) ve düğmeler; marka yazısı (1028, 1256) sayfanın metni değil
      int kimlik = GetDlgCtrlID(h);
      if (GetParent(h) == pencere && k == "Static" && kimlik != 1037 && kimlik != 1038) return true;
      int stil = GetWindowLong(h, -16), tur = stil & 0xF;
      RECT r; GetWindowRect(h, out r);
      int w = r.right - r.left, hgt = r.bottom - r.top;
      bool secim = k == "Button" && (tur == 2 || tur == 3 || tur == 4 || tur == 9);
      bool dugme = k == "Button" && (tur == 0 || tur == 1);
      if (k == "Button" && !secim && !dugme) return true;
      string satir;
      if (secim) {
        int x0 = r.left - ox + GetSystemMetrics(71) + 4, x1 = r.left - ox + w, ust = r.top - oy, alt = r.bottom - oy - 1;
        Func<int, bool> koyu = (y) => {
          if (y < 0 || y >= bmp.Height) return false;
          for (int x = Math.Max(0, x0); x < Math.Min(bmp.Width, x1); x++) { var c = bmp.GetPixel(x, y); if ((c.R + c.G + c.B) / 3 < 140) return true; }
          return false;
        };
        bool kesik = koyu(ust) || koyu(alt);
        int gerekli = Olc(h, s, 10000, "MS Shell Dlg", 8, true), alan = w - GetSystemMetrics(71) - 4;
        bool tekSatir = hgt < 2 * SatirYuksekligi(h), genis = tekSatir && gerekli > alan;
        satir = (kesik || genis ? "TAŞIYOR  " : "SIĞIYOR  ") + (tur >= 4 ? "seçenek " : "onay kutusu ") + w + "x" + hgt + " px (görüntüden: metin " +
          (kesik ? "üst/alt kenarda kesiliyor" : "kenarlara değmiyor") + "; tek satır " + gerekli + " / " + alan + " px" +
          (genis ? ", tek satırlık kutuya sığmıyor" : "") + "): " + s;
      } else if (dugme) {
        int gerekli = Math.Max(Olc(h, s, 10000, "MS Shell Dlg", 8, true), Olc(h, s, 10000, "Segoe UI", 9, true));
        satir = (gerekli <= w - 12 ? "SIĞIYOR  " : "TAŞIYOR  ") + "düğme " + w + "x" + hgt + " px, gereken genişlik " + gerekli + " px: " + s;
      } else {
        int gereken = Math.Max(Olc(h, s, w, "MS Shell Dlg", 8, false), Olc(h, s, w, "Segoe UI", 9, false));
        satir = (gereken <= hgt ? "SIĞIYOR  " : "TAŞIYOR  ") + "etiket " + w + "x" + hgt + " px, gereken yükseklik " + gereken + " px: " + Temiz(s);
      }
      sb.AppendLine(satir);
      return true;
    }, IntPtr.Zero);
    return sb.ToString();
  }

  /**
   * Pencerenin PrintWindow görüntüsünü PNG'ye yazar; metin sığma raporunu döner. Sayfa çizilmeden yakalandıysa (BosAlan) artan beklemeyle
   * 10 kez dek yeniden yakalar (ölçüldü: 2.–6. denemede doluyor); yine boşsa raporun başında "HATA" satırı olur (sınama betikleri HATA ve
   * TAŞIYOR satırlarını hata sayar).
   */
  public static string Goruntu(long pencere, string png) {
    return Yap(() => {
      IntPtr h = (IntPtr)pencere; IntPtr r;
      // Klavye odak çerçevesi (noktalı dikdörtgen) metnin çevresinde kenara değip kesilme sanılmasın
      SendMessageTimeout(h, WM_CHANGEUISTATE, (IntPtr)0x10001, IntPtr.Zero, SMTO_ABORTIFHUNG, 2000, out r);
      Thread.Sleep(150);
      for (int deneme = 1; ; deneme++) {
        RECT dr; GetWindowRect(h, out dr);
        int w = dr.right - dr.left, hgt = dr.bottom - dr.top;
        if (w <= 0 || hgt <= 0) return "HATA pencere boyutu yok";
        using (var bmp = new Bitmap(w, hgt, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(bmp)) {
          IntPtr hdc = g.GetHdc();
          bool tamam = PrintWindow(h, hdc, 2);   // PW_RENDERFULLCONTENT
          g.ReleaseHdc(hdc);
          if (!tamam) return "HATA PrintWindow başarısız";
          string bos = BosAlan(h, bmp, dr.left, dr.top);
          if (bos != null && deneme < 10) { Thread.Sleep(Math.Min(250 * deneme, 1000)); continue; }
          bmp.Save(png, ImageFormat.Png);
          string on = bos == null ? "" : "HATA görüntü boş: sayfa " + deneme + " denemede de çizilmedi («" + Temiz(bos) + "» yazısı görüntüde yok); seçeneklerin sığma kararı verilemez\r\n";
          return on + (deneme > 1 && bos == null ? "(görüntü " + deneme + ". denemede dolu)\r\n" : "") + Sigma(h, bmp, dr.left, dr.top);
        }
      }
    });
  }
}
