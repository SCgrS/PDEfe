# -*- coding: utf-8 -*-
"""Word → PDF (0.2.6, "Dosya Formatını Değiştir" aracı): Windows'ta bilgisayardaki Word'ün kendisiyle, görünmez ve kullanıcının açık
Word'üne dokunmadan; Word yoksa (ve macOS'ta) LibreOffice ile. donustur.py'nin çatısına kaydolur (islemler/__init__.py onu donustur'dan
sonra yükler). Word → UDF ve UDF → Word çatının PDF üzerinden iki adımlı planıyla kendiliğinden yapılır.

Neden Word'ün kendisi: Word belgesinin "gerçeği" Word'ün kendi dizgisidir (satır ve sayfa kırılımı, yazı tipi ölçüleri); en yakın PDF Word'ün
kendi dışa aktarmasıdır (ExportAsFixedFormat). Açık kaynak PyMuPDF .docx açmıyor; Office desteği ücretli sürümünde. Ölçümler PLAN.md
"Revizyon 0.2.6" ve keşif raporu: fontlar gömülü (alt küme), PDF etiketli, başlıklardan yer imleri; bilinen tek sapma Word'ün raster
resimleri ~200 ppi'ye indirmesi (basım ve UYAP için yeterli).

Word'e nasıl dokunulur (Windows):
  - Word kayıt defterinden algılanır, başlatılmaz (word_bul: HKCR\\Word.Application\\CLSID → CLSID\\{…}\\LocalServer32, önce 64 bit, sonra
    32 bit görünüm; kayıttaki exe yoksa o görünüm bayat sayılır; iki görünümde de sunucu kaydı yoksa ProgID'ye güvenilir).
  - Ayrı bir STA iş parçacığında (_WordOturumu) comtypes ile CoCreateInstance(CLSCTX_LOCAL_SERVER): her zaman YENİ bir Word süreci.
    GetActiveObject hiç kullanılmaz (kullanıcının açık Word'ünü döndürür). comtypes.client içe aktarılmaz (paketli uygulamada program
    klasörüne ya da %TEMP%'e önbellek klasörü yazıyor); geç bağlama kendi IDispatch.Invoke sarmalayıcımızla (_Disp).
  - Süreç, Caption'a verilen benzersiz etiketle FindWindowW("OpusApp", etiket) ile bulunur (bulunamazsa oluşturma öncesi / sonrası
    WINWORD.EXE süreç farkı, tek yeni süreç varsa); tutamacı açılır ve "kapanınca sonlandır" (KILL_ON_JOB_CLOSE) iş nesnesine bağlanır:
    PDEfe ya da çekirdek çökerse Word de kapanır. Süreç bulunamaz ya da bağlanamazsa belge Word'e hiç verilmez ("Word başlatılamadı;
    yeniden deneyin.").
  - Belge açılmadan önce: AutomationSecurity = 3 (makrolar kapalı; otomasyonla başlayan Word'de "düşük" ölçüldü, .docm makrosu
    çalışabilirdi), DisplayAlerts = 0, Visible = False, ScreenUpdating = False. Application.Options.* DEĞİŞTİRİLMEZ (kalıcıdır).
  - Girdi önce geçici klasöre doğru uzantıyla kopyalanır (yalnız içerik: "İnternetten indirildi" işareti taşınmaz, Korumalı Görünüm
    açılmaz); Documents.Open(ConfirmConversions=False, ReadOnly=True, AddToRecentFiles=False, uydurma parola, Revert=False, Visible=False,
    NoEncodingDialog=True). Uydurma parola: parolalı belgede görünmez parola penceresinde sonsuza dek beklenmesin, 5408 dönsün.
  - ExportAsFixedFormat(PDF, OptimizeFor = baskı, bütün belge, belge içeriği, IncludeDocProps = False, KeepIRM, CreateBookmarks =
    başlıklardan, DocStructureTags = True, BitmapMissingFonts = True, PDF/A değil). IncludeDocProps kapalı: belgenin yazar adı, şirketi
    ve başlığı PDF'e geçmesin (PDF'i UYAP'a ya da karşı tarafa gönderen kullanıcı bunu beklemez); Word'ün kendi "PDF olarak kaydet"inde
    de bu seçenek kullanıcıya bırakılır.
  - Belge Close(SaveChanges=0) ile kapanır. Word örneği toplu işte bütün belgeler için kullanılır, BOSTA_KAPAT sn boş kalınca kapanır.
    Kapatmadan önce ve her belgeden sonra Documents.Count'a bakılır: kullanıcı bu sırada Gezgin'den bir belge açtıysa ve belge bizim
    görünmez örneğimize düştüyse örnek kapatılmaz, ayarları geri alınıp (DisplayAlerts = -1, AutomationSecurity başlangıçtaki değerine,
    Caption = "", ScreenUpdating, Visible = True) iş nesnesinden serbest bırakılır (KILL_ON_JOB_CLOSE kaldırılır): kullanıcının kendi
    açtığı Word gibi kalır. Boşta beklerken de YOKLAMA sn'de bir bakılır.
  - Süre sınırları: başlatma BASLATMA_SURESI sn; belge CEVIRME_SURESI sn + sayfa başına SAYFA_SURESI sn (sayfa sayısı açılınca
    ComputeStatistics ile). İptal ya da süre aşımında YALNIZ bizim Word sürecimiz sonlandırılır (bekleyen COM çağrısı hemen hata döner).
    Word "meşgul" derse çağrı MESGUL_SURESI sn boyunca yeniden denenir.
  - Hata iletileri Word'ün kendi (Word'ün diline göre değişen) açıklamasından değil koddan üretilir (_COM_HATALARI; UDF Antetcisi'nin
    ölçtüğü kodlar).

LibreOffice (Windows'ta Word yoksa; macOS'ta Word otomasyonu yok): soffice --headless --convert-to pdf, PDEfe'nin kendi geçici
profiliyle (-env:UserInstallation; kullanıcının profiliyle aynı olsaydı istek açık LibreOffice'e devredilir, çıktı oluşmadan "başarılı"
dönerdi), resimleri küçültmeyen ve kayıpsız sıkıştıran süzgeç seçenekleriyle (7.4 ve sonrası; çıktı yoksa seçeneksiz yeniden). Yollar:
UNO\\InstallPath (HKLM, HKCU, 32 bit görünüm), App Paths, Program Files, PATH; macOS'ta /Applications ve ~/Applications. Bu bilgisayarda
LibreOffice yok: yol sınanmadı. İkisi de yoksa dönüştürme kapalıdır ("Word ya da LibreOffice gerekir").

Girdi: .docx, .docm (makro çalıştırılmaz), .doc, .rtf, .odt; tür içerikten (donustur.tur_bul). Parolalı .docx (OLE kabında
EncryptedPackage) Word başlatılmadan reddedilir. Sınama ortam değişkeni: PDEFE_WORD_YOK=1 → Word ve LibreOffice bulunamamış sayılır
(arayüzün "Word yok" görünüşünü sınamak için).

donusum_yetenekleri'ne word: {var, motor: 'word' | 'libreoffice' | null, neden?, word: {var, yol}, libreoffice: {var, yol}}.
bicim_donustur sonucuna Word → PDF'te sayfa (PDF'in sayfa sayısı), motor ve LibreOffice'te uyari.
"""
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid

import pymupdf

from . import araclar
from . import donustur
from .donustur import OgeHatasi

WINDOWS = os.name == "nt"
MAC = sys.platform == "darwin"

BASLATMA_SURESI = 45.0      # sn: Word'ün başlaması (CoCreateInstance + süreç bulma)
CEVIRME_SURESI = 60.0       # sn: belgenin açılması ve dışa aktarma (sayfa başına SAYFA_SURESI eklenir)
SAYFA_SURESI = 2.0
BOSTA_KAPAT = 5.0           # sn: boştaki Word kapanır (toplu işte tek örnek; kullanıcının belgesi bizim örneğe düşmesin diye kısa)
YOKLAMA = 0.5               # sn: boştaki örnekte Documents.Count'a bakma aralığı
KAPANMA_BEKLE = 15.0        # sn: Quit'ten sonra sürecin kendiliğinden kapanması beklenir, sonra sonlandırılır
KAPANIS_BEKLE = 3.0         # sn: çekirdek kapanırken Word'ün kapanması beklenir (ana süreç çekirdeği 8 sn sonra zorla kapatır)
IS_PARCACIGI_BOSTA = 30.0   # sn: Word yokken iş parçacığı bu kadar boş kalınca biter
MESGUL_SURESI = 30.0        # sn: "Word meşgul" (RPC_E_CALL_REJECTED) yeniden deneme süresi
ALGILAMA_ONBELLEK = 60.0    # sn: Word / LibreOffice algılamasının ön bellekte kaldığı süre
LO_ILK_SURE = 120.0         # sn: LibreOffice'in ilk çalışması (profil oluşturulur)
LO_SURE = 90.0
UYDURMA_PAROLA = "pdefe-parola-yok-7f3a"

GIRDI_UZANTISI = {"docx": ".docx", "docm": ".docm", "doc": ".doc", "rtf": ".rtf", "odt": ".odt"}

# Word sabitleri
WD_EXPORT_PDF = 17
WD_EXPORT_OPTIMIZE_PRINT = 0
WD_EXPORT_ALL = 0
WD_EXPORT_CONTENT = 0
WD_EXPORT_HEADING_BOOKMARKS = 1
WD_STATISTIC_PAGES = 2
WD_DO_NOT_SAVE = 0
WD_ALERTS_NONE, WD_ALERTS_ALL = 0, -1
MSO_AUTOMATION_FORCE_DISABLE = 3
MSO_AUTOMATION_LOW = 1

# COM hata kodları (işaretsiz)
DISP_E_EXCEPTION = 0x80020009
RPC_E_CALL_REJECTED = 0x80010001
RPC_E_SERVERCALL_RETRYLATER = 0x8001010A
_KAPANDI = (0x800706BA, 0x800706BE, 0x80010108, 0x80010012, 0x800706BF)
_COM_HATALARI = {
    0x800A1520: ("parolali", "Belge parolayla korunuyor; dönüştürülemez"),
    0x800A16A0: ("bozuk", "Dosya bozuk görünüyor; Word açamadı"),
    0x800A1401: ("bozuk", "Dosya bozuk görünüyor; Word açamadı"),
    0x800A1898: ("bozuk", "Dosyanın içeriği uzantısıyla uyuşmuyor; Word açamadı"),
    0x800A1436: ("hata", "Geçici kopya bulunamadı (virüs koruması silmiş olabilir)"),
    0x80010001: ("hata", "Word meşgul; biraz sonra yeniden deneyin"),
    0x80040154: ("desteklenmiyor", "Word bulunamadı"),
    0x800401F3: ("desteklenmiyor", "Word bulunamadı"),
    0x80080005: ("hata", "Word başlatılamadı"),
}
for _k in _KAPANDI:
    _COM_HATALARI[_k] = ("hata", "Word beklenmedik biçimde kapandı")


def _cekirdek():
    return araclar._cekirdek()


def _yok_benzetimi():
    return os.environ.get("PDEFE_WORD_YOK") == "1"


# ---------------------------------------------------------------- Windows API (ctypes)
_api = None


def _w32():
    """kernel32 / user32 işlevleri (yalnız Windows; ilk kullanımda)."""
    global _api
    if _api is not None:
        return _api
    import ctypes
    from ctypes import wintypes

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    u32 = ctypes.WinDLL("user32", use_last_error=True)

    class BASIC(ctypes.Structure):
        _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64), ("LimitFlags", wintypes.DWORD),
                    ("MinimumWorkingSetSize", ctypes.c_size_t), ("MaximumWorkingSetSize", ctypes.c_size_t),
                    ("ActiveProcessLimit", wintypes.DWORD), ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD),
                    ("SchedulingClass", wintypes.DWORD)]

    class GENIS(ctypes.Structure):   # JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        _fields_ = [("BasicLimitInformation", BASIC), ("IoInfo", ctypes.c_uint64 * 6), ("ProcessMemoryLimit", ctypes.c_size_t),
                    ("JobMemoryLimit", ctypes.c_size_t), ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

    class SUREC_GIRDISI(ctypes.Structure):   # PROCESSENTRY32W
        _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD), ("th32ProcessID", wintypes.DWORD),
                    ("th32DefaultHeapID", ctypes.c_size_t), ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                    ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long), ("dwFlags", wintypes.DWORD),
                    ("szExeFile", ctypes.c_wchar * 260)]

    k32.CreateJobObjectW.restype = wintypes.HANDLE
    k32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    k32.SetInformationJobObject.restype = wintypes.BOOL
    k32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    k32.AssignProcessToJobObject.restype = wintypes.BOOL
    k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    k32.TerminateJobObject.restype = wintypes.BOOL
    k32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
    k32.OpenProcess.restype = wintypes.HANDLE
    k32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    k32.TerminateProcess.restype = wintypes.BOOL
    k32.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    k32.WaitForSingleObject.restype = wintypes.DWORD
    k32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    k32.CloseHandle.restype = wintypes.BOOL
    k32.CloseHandle.argtypes = [wintypes.HANDLE]
    k32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    k32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    k32.Process32FirstW.restype = wintypes.BOOL
    k32.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(SUREC_GIRDISI)]
    k32.Process32NextW.restype = wintypes.BOOL
    k32.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(SUREC_GIRDISI)]
    u32.FindWindowW.restype = wintypes.HWND
    u32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
    u32.GetWindowThreadProcessId.restype = wintypes.DWORD
    u32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]

    class Api:
        pass
    a = Api()
    a.ctypes, a.wintypes, a.k32, a.u32, a.GENIS, a.SUREC_GIRDISI = ctypes, wintypes, k32, u32, GENIS, SUREC_GIRDISI
    _api = a
    return a


PROCESS_TERMINATE, PROCESS_SET_QUOTA, PROCESS_QUERY_LIMITED_INFORMATION, SYNCHRONIZE = 0x0001, 0x0100, 0x1000, 0x00100000
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
WAIT_TIMEOUT = 0x102
TH32CS_SNAPPROCESS = 0x2
GECERSIZ_TUTAMAC = -1


def word_pidleri():
    """Çalışan WINWORD.EXE süreçlerinin kimlikleri (Toolhelp; sınamalar da kullanır)."""
    a = _w32()
    anlik = a.k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if not anlik or anlik == a.wintypes.HANDLE(GECERSIZ_TUTAMAC).value:
        return set()
    sonuc = set()
    try:
        g = a.SUREC_GIRDISI()
        g.dwSize = a.ctypes.sizeof(g)
        ok = a.k32.Process32FirstW(anlik, a.ctypes.byref(g))
        while ok:
            if g.szExeFile.lower() == "winword.exe":
                sonuc.add(int(g.th32ProcessID))
            ok = a.k32.Process32NextW(anlik, a.ctypes.byref(g))
    finally:
        a.k32.CloseHandle(anlik)
    return sonuc


def _is_nesnesi_kur(surec):
    """KILL_ON_JOB_CLOSE iş nesnesi kurar ve süreci ona bağlar. Döner: iş nesnesi tutamacı ya da None."""
    a = _w32()
    j = a.k32.CreateJobObjectW(None, None)
    if not j:
        return None
    bilgi = a.GENIS()
    bilgi.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not a.k32.SetInformationJobObject(j, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, a.ctypes.byref(bilgi), a.ctypes.sizeof(bilgi)) or \
            not a.k32.AssignProcessToJobObject(j, surec):
        a.k32.CloseHandle(j)
        return None
    return j


def _is_nesnesini_gevset(j):
    """İş nesnesinden KILL_ON_JOB_CLOSE kaldırılır: tutamaç kapanınca süreç sonlandırılmaz (kullanıcıya bırakılan Word)."""
    a = _w32()
    bilgi = a.GENIS()
    bilgi.BasicLimitInformation.LimitFlags = 0
    return bool(a.k32.SetInformationJobObject(j, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, a.ctypes.byref(bilgi), a.ctypes.sizeof(bilgi)))


def _canli_mi(surec):
    return bool(surec) and _w32().k32.WaitForSingleObject(surec, 0) == WAIT_TIMEOUT


# ---------------------------------------------------------------- algılama (başlatmadan)
def _kayit_oku(kok, yol, ad="", gorunum=0):
    import winreg
    try:
        with winreg.OpenKey(kok, yol, 0, winreg.KEY_READ | gorunum) as k:
            return winreg.QueryValueEx(k, ad)[0]
    except OSError:
        return None


def _komuttan_exe(komut):
    """LocalServer32 / App Paths değerinden exe yolu ('"C:\\…\\WINWORD.EXE" /Automation' ya da tırnaksız)."""
    komut = os.path.expandvars(str(komut or "").strip())
    if not komut:
        return None
    if komut.startswith('"'):
        son = komut.find('"', 1)
        return komut[1:son] if son > 0 else komut[1:]
    i = komut.lower().find(".exe")
    return komut[:i + 4] if i >= 0 else komut.split(" ")[0]


def word_bul():
    """Kurulu Word: {yol, clsid} ya da None. Word başlatılmaz (bkz. modül belgesi)."""
    if not WINDOWS:
        return None
    import winreg
    kok = winreg.HKEY_CLASSES_ROOT
    clsid = _kayit_oku(kok, r"Word.Application\CLSID")
    if not clsid:
        surum = _kayit_oku(kok, r"Word.Application\CurVer")
        if surum:
            clsid = _kayit_oku(kok, surum + r"\CLSID")
    if not clsid:
        return None
    kayit_var = False
    for gorunum in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
        komut = _kayit_oku(kok, r"CLSID\%s\LocalServer32" % clsid, "", gorunum)
        if komut:
            kayit_var = True
            exe = _komuttan_exe(komut)
            if exe and os.path.isfile(exe):
                return {"yol": exe, "clsid": clsid}
    if kayit_var:   # sunucu kaydı var ama exe yok: Word kaldırılmış, kayıt bayat
        return None
    return {"yol": None, "clsid": clsid}


def libreoffice_bul():
    """LibreOffice'in soffice yolu ya da None."""
    adaylar = []
    if WINDOWS:
        import winreg
        for kok in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            for gorunum in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
                yol = _kayit_oku(kok, r"SOFTWARE\LibreOffice\UNO\InstallPath", "", gorunum)
                if yol:
                    adaylar.append(os.path.join(yol, "soffice.exe"))
        uygulama = _kayit_oku(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\soffice.exe")
        if uygulama:
            adaylar.append(_komuttan_exe(uygulama))
        for ortam in ("ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"):
            if os.environ.get(ortam):
                adaylar.append(os.path.join(os.environ[ortam], "LibreOffice", "program", "soffice.exe"))
        adaylar.append(shutil.which("soffice.exe") or shutil.which("soffice"))
    elif MAC:
        adaylar += ["/Applications/LibreOffice.app/Contents/MacOS/soffice",
                    os.path.expanduser("~/Applications/LibreOffice.app/Contents/MacOS/soffice")]
        adaylar.append(shutil.which("soffice"))
    else:
        adaylar += [shutil.which("soffice"), shutil.which("libreoffice")]
    for yol in adaylar:
        if yol and os.path.isfile(yol):
            return os.path.abspath(yol)
    return None


_algilama = {"zaman": None, "word": None, "libreoffice": None}
_algilama_kilidi = threading.Lock()


def motorlar(tazele=False):
    """(word, libreoffice): word_bul ve libreoffice_bul sonuçları, ALGILAMA_ONBELLEK sn ön bellekte."""
    with _algilama_kilidi:
        simdi = time.monotonic()
        if tazele or _algilama["zaman"] is None or simdi - _algilama["zaman"] > ALGILAMA_ONBELLEK:
            if _yok_benzetimi():
                w = lo = None
            else:
                try:
                    w = word_bul()
                except Exception as e:   # kayıt defteri okunamazsa Word yok sayılır, çekirdek düşmez
                    print("[word] Word algılanamadı: %s" % e, file=sys.stderr)
                    w = None
                try:
                    lo = libreoffice_bul()
                except Exception as e:
                    print("[word] LibreOffice algılanamadı: %s" % e, file=sys.stderr)
                    lo = None
            _algilama.update(zaman=simdi, word=w, libreoffice=lo)
        return _algilama["word"], _algilama["libreoffice"]


def motor():
    """Kullanılacak motor: 'word' | 'libreoffice' | None."""
    w, lo = motorlar()
    if w is not None:
        return "word"
    if lo is not None:
        return "libreoffice"
    return None


NEDEN_YOK = "Word belgesini PDF'e çevirmek için bu bilgisayarda Word ya da LibreOffice gerekir; ikisi de bulunamadı."


def hazir():
    return (True, None) if motor() else (False, NEDEN_YOK)


def yetenek():
    w, lo = motorlar()
    m = motor()
    s = {"var": m is not None, "motor": m, "word": {"var": w is not None, "yol": w["yol"] if w else None},
         "libreoffice": {"var": lo is not None, "yol": lo}}
    if m is None:
        s["neden"] = NEDEN_YOK
    return s


# ---------------------------------------------------------------- COM: geç bağlama (comtypes.client olmadan)
def _com():
    import comtypes
    from comtypes import automation
    return comtypes, automation


def _hresult(e):
    """COMError'ın işaretsiz kodu; DISP_E_EXCEPTION'da Word'ün kendi kodu (EXCEPINFO.scode)."""
    hr = (e.args[0] if e.args else 0) or 0
    return int(hr) & 0xFFFFFFFF


class _Disp:
    """IDispatch üzerinden adla çağrı (comtypes.automation; dönen nesneler yine _Disp). Yalnız Word iş parçacığında kullanılır."""
    __slots__ = ("_p", "_kimlikler")

    def __init__(self, p):
        self._p = p
        self._kimlikler = {}

    def _kimlik(self, ad):
        k = self._kimlikler.get(ad)
        if k is None:
            k = self._kimlikler[ad] = self._p.GetIDsOfNames(ad)[0]
        return k

    def _cagir(self, ad, tur, args):
        import ctypes
        comtypes, a = _com()
        dp = a.DISPPARAMS()
        dizi = None
        adli = None
        if args:
            dizi = (a.VARIANT * len(args))()
            for i, d in enumerate(reversed(args)):
                dizi[i].value = d
            dp.cArgs = len(args)
            dp.rgvarg = dizi
        if tur == 4:   # DISPATCH_PROPERTYPUT
            adli = ctypes.pointer(a.DISPID(a.DISPID_PROPERTYPUT))
            dp.cNamedArgs = 1
            dp.rgdispidNamedArgs = adli
        sonuc, ei, hatali = a.VARIANT(), a.EXCEPINFO(), ctypes.c_uint()
        try:
            self._p._IDispatch__com_Invoke(self._kimlik(ad), a.riid_null, 0, tur, ctypes.byref(dp), ctypes.byref(sonuc),
                                           ctypes.byref(ei), ctypes.byref(hatali))
        except comtypes.COMError as e:
            if _hresult(e) == DISP_E_EXCEPTION and ei.scode:
                raise comtypes.COMError(ei.scode, e.args[1] if len(e.args) > 1 else None, None) from None
            raise
        deger = sonuc._get_value(dynamic=False)
        if hasattr(deger, "GetIDsOfNames") and hasattr(deger, "QueryInterface"):   # POINTER(IDispatch)
            return _Disp(deger)
        return deger

    def al(self, ad, *args):
        return self._cagir(ad, 3, args)       # DISPATCH_METHOD | DISPATCH_PROPERTYGET

    def cagir(self, ad, *args):
        return self._cagir(ad, 1 | 2, args)

    def ver(self, ad, deger):
        self._cagir(ad, 4, (deger,))


def _yinele(islev):
    """Word "meşgulüm" derse (RPC_E_CALL_REJECTED / RETRYLATER) MESGUL_SURESI boyunca 0,25 sn arayla yeniden dener."""
    comtypes, _ = _com()
    bitis = time.monotonic() + MESGUL_SURESI
    while True:
        try:
            return islev()
        except comtypes.COMError as e:
            if _hresult(e) not in (RPC_E_CALL_REJECTED, RPC_E_SERVERCALL_RETRYLATER) or time.monotonic() > bitis:
                raise
            time.sleep(0.25)


class _BaslatmaHatasi(Exception):
    pass


# ---------------------------------------------------------------- Word oturumu (STA iş parçacığı)
class _Istek:
    def __init__(self, kaynak, pdf):
        self.kaynak, self.pdf = kaynak, pdf
        self.bitti = threading.Event()
        self.sonuc = None
        self.hata = None
        self.vazgecildi = False
        self.asama = "bekliyor"   # bekliyor | basliyor | aciliyor | ceviriyor
        self.sayfa = None
        self.sinir = time.monotonic() + 2 * BASLATMA_SURESI   # sıradayken (önceki vazgeçilen başlatma bitmeden) de sınırlı
        self.islev = None         # verilirse belge yerine Word iş parçacığında islev(oturum) çalışır (word_ayarlari)


class _WordOturumu:
    """Görünmez Word örneği ve onun STA iş parçacığı (bkz. modül belgesi). gonder / oldur / kapat öteki iş parçacıklarından çağrılır;
    Word'e (COM) yalnız bu iş parçacığı dokunur."""

    def __init__(self):
        self._kuyruk = queue.Queue()
        self._kilit = threading.Lock()   # _ip, _surec, _is, pid
        self._ip = None
        self._word = None
        self._surec = None
        self._is = None
        self.pid = None
        self._ozgun_guvenlik = None
        self._son_is = 0.0

    # -- öteki iş parçacıklarından
    def gonder(self, istek):
        with self._kilit:
            self._kuyruk.put(istek)
            if self._ip is None:
                self._ip = threading.Thread(target=self._dongu, name="word", daemon=True)
                self._ip.start()

    def oldur(self):
        """Bizim Word sürecimizi sonlandırır (iptal, süre aşımı). Bekleyen COM çağrısı hemen hata döner."""
        with self._kilit:
            if self._surec:
                _w32().k32.TerminateProcess(self._surec, 1)

    def kapat(self, bekle=KAPANIS_BEKLE):
        """Çekirdek kapanırken: Word kapatılır (ya da kullanıcının belgesi varsa bırakılır), en çok `bekle` sn beklenir."""
        with self._kilit:
            ip = self._ip
            if ip is None:
                return
            self._kuyruk.put(None)
        ip.join(bekle + 1.0)

    # -- Word iş parçacığı
    def _dongu(self):
        comtypes = None
        try:
            comtypes, _ = _com()
            comtypes.CoInitializeEx(comtypes.COINIT_APARTMENTTHREADED)
            while True:
                try:
                    istek = self._kuyruk.get(timeout=YOKLAMA if self._word is not None else IS_PARCACIGI_BOSTA)
                except queue.Empty:
                    if self._word is not None:
                        self._bosta()
                        continue
                    with self._kilit:
                        if self._kuyruk.empty():
                            self._ip = None
                            return
                    continue
                if istek is None:
                    self._kapat(bekle=KAPANIS_BEKLE)
                    with self._kilit:
                        self._ip = None
                    return
                if istek.islev is not None:
                    try:
                        istek.sonuc = istek.islev(self)
                    except BaseException as e:
                        istek.hata = e
                    finally:
                        istek.bitti.set()
                    continue
                self._isle(istek)
        except BaseException as e:   # iş parçacığı beklenmedik biçimde biterse bekleyen istekler yanıtsız kalmasın
            print("[word] Word iş parçacığı: %r" % e, file=sys.stderr)
            self._sifirla()
            with self._kilit:
                self._ip = None
                bekleyenler = []
                while not self._kuyruk.empty():
                    bekleyenler.append(self._kuyruk.get_nowait())
            for istek in bekleyenler:
                if istek is not None:
                    istek.hata = e
                    istek.bitti.set()
        finally:
            self._word = None
            if comtypes is not None:
                try:
                    comtypes.CoUninitialize()
                except Exception:
                    pass

    def _bosta(self):
        comtypes, _ = _com()
        if not _canli_mi(self._surec):
            self._sifirla()
            return
        try:
            if self._belge_sayisi() > 0:
                self._birak()
            elif time.monotonic() - self._son_is > BOSTA_KAPAT:
                self._kapat()
        except comtypes.COMError:
            self._sifirla()

    def _belge_sayisi(self):
        return int(_yinele(lambda: self._word.al("Documents").al("Count")))

    def _baslat(self):
        comtypes, a = _com()
        api = _w32()
        onceki = word_pidleri()
        w = _Disp(comtypes.CoCreateInstance(comtypes.GUID.from_progid("Word.Application"), interface=a.IDispatch,
                                            clsctx=comtypes.CLSCTX_LOCAL_SERVER))
        surec = j = None
        try:
            etiket = "pdefe-" + uuid.uuid4().hex
            _yinele(lambda: w.ver("Caption", etiket))
            pid = api.wintypes.DWORD(0)
            bitis = time.monotonic() + 2.0
            while not pid.value and time.monotonic() < bitis:
                pencere = api.u32.FindWindowW("OpusApp", etiket)
                if pencere:
                    api.u32.GetWindowThreadProcessId(pencere, api.ctypes.byref(pid))
                    break
                time.sleep(0.05)
            kimlik = int(pid.value)
            if not kimlik:
                yeni = word_pidleri() - onceki
                if len(yeni) == 1:
                    kimlik = yeni.pop()
            if not kimlik:
                raise _BaslatmaHatasi("Word süreci bulunamadı")
            surec = api.k32.OpenProcess(PROCESS_TERMINATE | PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,
                                        False, kimlik)
            if not surec:
                raise _BaslatmaHatasi("Word sürecinin tutamacı açılamadı")
            j = _is_nesnesi_kur(surec)
            if not j:
                raise _BaslatmaHatasi("Word süreci iş nesnesine bağlanamadı")
            with self._kilit:
                self._surec, self._is, self.pid = surec, j, kimlik
            surec = j = None
            self._word = w
            try:
                self._ozgun_guvenlik = int(_yinele(lambda: w.al("AutomationSecurity")))
            except (comtypes.COMError, TypeError, ValueError):
                self._ozgun_guvenlik = None
            _yinele(lambda: w.ver("AutomationSecurity", MSO_AUTOMATION_FORCE_DISABLE))
            _yinele(lambda: w.ver("DisplayAlerts", WD_ALERTS_NONE))
            _yinele(lambda: w.ver("Visible", False))
            _yinele(lambda: w.ver("ScreenUpdating", False))
            if int(_yinele(lambda: w.al("AutomationSecurity"))) != MSO_AUTOMATION_FORCE_DISABLE:
                raise _BaslatmaHatasi("Word'de makrolar kapatılamadı")
        except BaseException as e:
            if surec:
                api.k32.CloseHandle(surec)
            if j:
                api.k32.CloseHandle(j)
            if self._word is None:   # belge verilemeyecek Word kapatılır
                try:
                    w.cagir("Quit", WD_DO_NOT_SAVE)
                except Exception:
                    pass
            else:
                self._sifirla()
            if isinstance(e, comtypes.COMError):
                raise
            raise OgeHatasi("hata", "Word başlatılamadı; yeniden deneyin. (%s)" % e) from None

    def _hazirla(self, istek):
        comtypes, _ = _com()
        if self._word is not None:
            if not _canli_mi(self._surec):
                self._sifirla()
            else:
                try:
                    if self._belge_sayisi() > 0:
                        self._birak()
                except comtypes.COMError:
                    self._sifirla()
        if self._word is None:
            istek.asama = "basliyor"
            istek.sinir = time.monotonic() + BASLATMA_SURESI
            self._baslat()

    def _isle(self, istek):
        comtypes, a = _com()
        try:
            if istek.vazgecildi:
                return
            self._hazirla(istek)
            if istek.vazgecildi:   # başlatma geç bitti: belge Word'e verilmez
                self._kapat()
                return
            istek.asama = "aciliyor"
            istek.sinir = time.monotonic() + CEVIRME_SURESI
            M = a.VARIANT.missing
            belgeler = _yinele(lambda: self._word.al("Documents"))
            belge = _yinele(lambda: belgeler.cagir("Open", istek.kaynak, False, True, False, UYDURMA_PAROLA, UYDURMA_PAROLA, False, M, M,
                                                    0, M, False, False, M, True))
            try:
                if istek.vazgecildi:
                    return
                sayfa = int(_yinele(lambda: belge.cagir("ComputeStatistics", WD_STATISTIC_PAGES)))
                istek.sayfa = sayfa
                istek.sinir = time.monotonic() + CEVIRME_SURESI + SAYFA_SURESI * max(sayfa, 1)
                istek.asama = "ceviriyor"
                _yinele(lambda: belge.cagir("ExportAsFixedFormat", istek.pdf, WD_EXPORT_PDF, False, WD_EXPORT_OPTIMIZE_PRINT, WD_EXPORT_ALL,
                                            1, 1, WD_EXPORT_CONTENT, False, True, WD_EXPORT_HEADING_BOOKMARKS, True, True, False))
            finally:
                try:
                    _yinele(lambda: belge.cagir("Close", WD_DO_NOT_SAVE))
                except comtypes.COMError:
                    pass
                belge = belgeler = None
            istek.sonuc = {"sayfa": sayfa}
        except BaseException as e:
            istek.hata = e
            if self._word is not None and not _canli_mi(self._surec):
                self._sifirla()
        finally:
            self._son_is = time.monotonic()
            istek.bitti.set()
        if self._word is not None:   # kullanıcının belgesi bu sırada bizim örneğe düştüyse bırakılır
            try:
                if self._belge_sayisi() > 0:
                    self._birak()
            except Exception:
                self._sifirla()

    def _tutamaclari_al(self):
        with self._kilit:
            s, j = self._surec, self._is
            self._surec = self._is = self.pid = None
        return s, j

    def _sifirla(self):
        """Bozuk ya da ölmüş örnek: COM başvuruları bırakılır, iş nesnesi kapatılır (süreç yaşıyorsa onunla sonlanır)."""
        self._word = None
        s, j = self._tutamaclari_al()
        api = _w32()
        if j:
            api.k32.CloseHandle(j)
        if s:
            api.k32.CloseHandle(s)

    def _birak(self):
        """Kullanıcının belgesi bizim örneğe düştü: ayarlar geri alınır, örnek görünür yapılır, iş nesnesinden serbest bırakılır."""
        comtypes, _ = _com()
        w = self._word
        for ad, deger in (("DisplayAlerts", WD_ALERTS_ALL), ("AutomationSecurity", self._ozgun_guvenlik or MSO_AUTOMATION_LOW),
                          ("Caption", ""), ("ScreenUpdating", True), ("Visible", True)):
            try:
                _yinele(lambda: w.ver(ad, deger))
            except comtypes.COMError:
                pass
        s, j = self._tutamaclari_al()
        api = _w32()
        if j:
            if not _is_nesnesini_gevset(j):
                print("[word] iş nesnesi gevşetilemedi; Word açık bırakıldı ama PDEfe kapanınca kapanabilir", file=sys.stderr)
            api.k32.CloseHandle(j)
        if s:
            api.k32.CloseHandle(s)
        self._word = None
        print("[word] kullanıcının açtığı belge bizim Word örneğimize düştü; örnek kullanıcıya bırakıldı", file=sys.stderr)

    def _kapat(self, bekle=None):
        """Quit; süreç arka planda KAPANMA_BEKLE sn (ya da `bekle` sn, ön planda) beklenir, sonra iş nesnesiyle sonlandırılır."""
        comtypes, _ = _com()
        if self._word is None:
            return
        try:
            if self._belge_sayisi() > 0:
                self._birak()
                return
            _yinele(lambda: self._word.cagir("Quit", WD_DO_NOT_SAVE))
        except comtypes.COMError:
            pass
        self._word = None
        s, j = self._tutamaclari_al()
        if bekle is None:
            threading.Thread(target=_kapanmasini_bekle, args=(s, j, KAPANMA_BEKLE), name="word-kapanis", daemon=True).start()
        else:
            _kapanmasini_bekle(s, j, bekle)


def _kapanmasini_bekle(surec, j, sure):
    api = _w32()
    try:
        if surec:
            api.k32.WaitForSingleObject(surec, int(sure * 1000))
    finally:
        if j:
            api.k32.CloseHandle(j)   # hâlâ yaşıyorsa KILL_ON_JOB_CLOSE ile sonlanır
        if surec:
            api.k32.CloseHandle(surec)


_oturum = None
_oturum_kilidi = threading.Lock()


def _word_oturumu():
    global _oturum
    with _oturum_kilidi:
        if _oturum is None:
            _oturum = _WordOturumu()
        return _oturum


def word_ayarlari(adlar=("AutomationSecurity", "DisplayAlerts", "Visible", "ScreenUpdating")):
    """Sınamalar için: bizim görünmez Word örneğimiz açıksa Application özellikleri {ad: değer} (Word iş parçacığında okunur), yoksa None."""
    o = _oturum
    if o is None:
        return None
    istek = _Istek(None, None)

    def oku(oturum):
        if oturum._word is None:
            return None
        return {ad: _yinele(lambda: oturum._word.al(ad)) for ad in adlar}
    istek.islev = oku
    o.gonder(istek)
    if not istek.bitti.wait(30):
        raise TimeoutError("Word iş parçacığı yanıt vermedi")
    if istek.hata is not None:
        raise istek.hata
    return istek.sonuc


def word_pid():
    """Bizim görünmez Word sürecimizin kimliği ya da None (sınamalar için)."""
    o = _oturum
    return o.pid if o is not None else None


_ASAMALAR = {"bekliyor": (0.02, "Word bekleniyor…"), "basliyor": (0.05, "Word başlatılıyor…"), "aciliyor": (0.15, "Belge açılıyor…"),
             "ceviriyor": (0.4, "PDF'e çevriliyor…")}


def _com_hatasi(e, ad):
    hr = _hresult(e)
    kod, metin = _COM_HATALARI.get(hr, ("hata", "Word belgeyi dönüştüremedi (hata 0x%08X)" % hr))
    return OgeHatasi(kod, "%s: %s" % (metin, ad))


def _word_ile(kaynak, pdf, ilerleme, ad):
    oturum = _word_oturumu()
    istek = _Istek(kaynak, pdf)
    oturum.gonder(istek)
    try:
        while not istek.bitti.wait(0.2):
            oran, mesaj = _ASAMALAR[istek.asama]
            ilerleme(oran, mesaj)   # iptalde IptalEdildi
            if time.monotonic() > istek.sinir:
                if istek.asama == "basliyor":
                    raise TimeoutError("Word %d saniyede başlamadı: %s" % (BASLATMA_SURESI, ad))
                raise TimeoutError("Word belgeyi zamanında dönüştüremedi%s: %s" % (" (%d sayfa)" % istek.sayfa if istek.sayfa else "", ad))
    except BaseException:
        istek.vazgecildi = True
        if istek.asama != "bekliyor":
            oturum.oldur()   # yalnız bizim Word sürecimiz
        istek.bitti.wait(10)
        raise
    if istek.hata is not None:
        comtypes, _ = _com()
        if isinstance(istek.hata, comtypes.COMError):
            raise _com_hatasi(istek.hata, ad)
        raise istek.hata
    if not os.path.isfile(pdf):
        raise OgeHatasi("hata", "Word PDF üretmedi: %s" % ad)
    return istek.sonuc or {}


# ---------------------------------------------------------------- LibreOffice
_lo_profil = {"klasor": None}
_lo_kilidi = threading.Lock()


def _lo_profil_klasoru():
    with _lo_kilidi:
        if _lo_profil["klasor"] is None or not os.path.isdir(_lo_profil["klasor"]):
            _lo_profil["klasor"] = tempfile.mkdtemp(prefix="pdefe-libreoffice-")
            return _lo_profil["klasor"], True
        return _lo_profil["klasor"], not os.listdir(_lo_profil["klasor"])


LO_SUZGEC = ('pdf:writer_pdf_Export:{"ReduceImageResolution":{"type":"boolean","value":"false"},'
             '"UseLosslessCompression":{"type":"boolean","value":"true"},"ExportNotes":{"type":"boolean","value":"false"}}')


def _libreoffice_ile(soffice, kaynak, pdf, ilerleme, baglam, ad):
    import pathlib
    profil, ilk = _lo_profil_klasoru()
    klasor = os.path.join(baglam.gecici_klasor(), "lo")
    os.makedirs(klasor, exist_ok=True)
    beklenen = os.path.join(klasor, os.path.splitext(os.path.basename(kaynak))[0] + ".pdf")
    ilerleme(0.1, "LibreOffice ile çevriliyor…")
    for suzgec in (LO_SUZGEC, "pdf"):
        komut = [soffice, "-env:UserInstallation=" + pathlib.Path(profil).as_uri(), "--headless", "--invisible", "--norestore",
                 "--nologo", "--nodefault", "--nolockcheck", "--nofirststartwizard", "--convert-to", suzgec, "--outdir", klasor, kaynak]
        try:
            baglam.dis_surec(komut, sure=LO_ILK_SURE if ilk else LO_SURE)
        except TimeoutError:
            raise TimeoutError("LibreOffice belgeyi zamanında dönüştüremedi: %s" % ad)
        ilk = False
        if os.path.isfile(beklenen) and os.path.getsize(beklenen) > 0:
            shutil.move(beklenen, pdf)
            return {}
    raise OgeHatasi("hata", "LibreOffice belgeyi dönüştüremedi: %s" % ad)


# ---------------------------------------------------------------- dönüştürücü
def _word_pdf(kaynak, cikti, secenekler, ilerleme, baglam):
    ad = os.path.basename(kaynak)
    alt = baglam.alt
    if alt == "sifreli":
        raise OgeHatasi("parolali", "Belge parolayla korunuyor; dönüştürülemez: %s" % ad)
    uzanti = GIRDI_UZANTISI.get(alt)
    if uzanti is None:
        raise OgeHatasi("desteklenmiyor", "Bu Word dosyası dönüştürülemiyor: %s" % ad)
    m = motor()
    if m is None:
        raise OgeHatasi("desteklenmiyor", NEDEN_YOK)
    klasor = baglam.gecici_klasor()
    kopya = os.path.join(klasor, "kaynak" + uzanti)
    try:
        shutil.copyfile(kaynak, kopya)   # yalnız içerik (İnternet işareti ve öznitelikler taşınmaz)
    except PermissionError:
        raise PermissionError("Dosya okunamadı; %s: %s" % (araclar.KILITLI_METNI, ad))
    pdf = os.path.join(klasor, "cikti.pdf")
    if m == "word":
        bilgi = _word_ile(kopya, pdf, ilerleme, ad)
    else:
        bilgi = _libreoffice_ile(motorlar()[1], kopya, pdf, ilerleme, baglam, ad)
        bilgi["uyari"] = "Word bulunamadığı için LibreOffice ile dönüştürüldü; sayfa düzeni Word'dekinden biraz farklı olabilir."
    ilerleme(0.95, "PDF denetleniyor…")
    with baglam.mupdf():
        try:
            d = pymupdf.open(pdf, filetype="pdf")
        except Exception as e:
            raise OgeHatasi("hata", "Üretilen PDF açılamadı (%s): %s" % (e, ad))
        try:
            sayfa = d.page_count
        finally:
            d.close()
    shutil.move(pdf, cikti)
    sonuc = {"sayfa": sayfa, "motor": m}
    if bilgi.get("uyari"):
        sonuc["uyari"] = bilgi["uyari"]
    return sonuc


def kapanirken():
    o = _oturum
    if o is not None:
        o.kapat(KAPANIS_BEKLE)
    with _lo_kilidi:
        if _lo_profil["klasor"]:
            shutil.rmtree(_lo_profil["klasor"], ignore_errors=True)
            _lo_profil["klasor"] = None


def kaydol(yontemler):
    """Dönüştürücü donustur'un çatısına modül yüklenirken kaydolur; burada yöntem eklenmez."""
    return None


donustur.donusturucu_kaydet("word", "pdf", _word_pdf, hazir)
donustur.yetenek_kaydet("word", yetenek)
donustur.kapanis_kaydet(kapanirken)
