# -*- coding: utf-8 -*-
"""Word → PDF (0.2.6, "Dosya Formatını Değiştir" aracı; 0.3.1'de "ofis motorları"): Bilgisayarda bulunan programla, görünmez ve kullanıcının
açık belgelerine dokunmadan. Sıra: Gerçek Word, WPS Office, LibreOffice (macOS ve Linux'ta yalnız LibreOffice). donustur.py'nin çatısına
kaydolur (islemler/__init__.py onu donustur'dan sonra yükler). Word → UDF, Word → TIFF, Word → JPG, Birleştir'e Word eklemek çatının PDF
üzerinden iki adımlı planıyla ya da donustur.pdf_e_cevir ile bu dönüştürücüden geçer. PDF → Word (pdf_word.py) bu motorları kullanmaz.

Motor seçimi (0.3.1, kullanıcı bildirimi: WPS'li bilgisayarda "Word başlatılamadı. (Word süreci bulunamadı)"):
  - word_bul Word.Application kaydının gerçekten WINWORD.EXE'yi gösterdiğine bakar. Neden: WPS Office uyumluluk için Word.Application'ı
    kendine (wps.exe) kaydedebiliyor (Word'süz bilgisayarda 32 bit görünümde ölçüldü). Eski kod bunu "Word var" sayıyor, COM WPS'i başlatıyor,
    WINWORD.EXE bulunamayınca hata veriyor, LibreOffice'e de düşmüyordu: WPS'li kullanıcı LibreOffice kursa da çözülmezdi.
  - Bir motor belgeyi işleyemeden başarısız olursa (_MotorHatasi: başlamıyor, COM kaydı kırık, açılışta bir pencerede asılı, belge açılırken
    donuyor) sıradakine düşülür, kullanıcı hata görmez, sonuçta hangi programın kullanıldığı söylenir. Başlamayan motor SAGLIK_SURESI sn sona
    alınır (toplu işte her belgede yeniden beklenmesin). Belgenin kendi sorunu (OgeHatasi 'bozuk', 'parolali') ya da dışa aktarma sırasındaki süre
    aşımı motor değiştirmez. Hepsi başarısızsa ya da hiçbiri yoksa ileti hangi programın gerektiğini söyler, ham COM hatası günlükte kalır.

Neden önce Word: Word belgesinin "gerçeği" Word'ün kendi dizgisidir (satır ve sayfa kırılımı, yazı tipi ölçüleri); en yakın PDF Word'ün
kendi dışa aktarmasıdır (ExportAsFixedFormat). Açık kaynak PyMuPDF .docx açmıyor; Office desteği ücretli sürümünde. Ölçümler PLAN.md
"Revizyon 0.2.6" ve keşif raporu: fontlar gömülü (alt küme), PDF etiketli, başlıklardan yer imleri; bilinen tek sapma Word'ün raster
resimleri ~200 ppi'ye indirmesi (basım ve UYAP için yeterli).

Word'e nasıl dokunulur (Windows):
  - Word kayıt defterinden algılanır, başlatılmaz (word_bul: HKCR\\Word.Application\\CLSID → CLSID\\{…}\\LocalServer32, önce 64 bit, sonra
    32 bit görünüm; kayıttaki exe yoksa ya da winword.exe değilse o görünüm yok sayılır; iki görünümde de sunucu kaydı yoksa ProgID'ye güvenilir,
    gerçek süreç _baslat'ta denetlenir).
  - Ayrı bir STA iş parçacığında (_WordOturumu) comtypes ile CoCreateInstance(CLSCTX_LOCAL_SERVER): her zaman YENİ bir Word süreci.
    GetActiveObject hiç kullanılmaz (kullanıcının açık Word'ünü döndürür). comtypes.client içe aktarılmaz (paketli uygulamada program
    klasörüne ya da %TEMP%'e önbellek klasörü yazıyor); geç bağlama kendi IDispatch.Invoke sarmalayıcımızla (_Disp).
  - Süreç, Caption'a verilen benzersiz etiketle FindWindowW("OpusApp", etiket) ile bulunur (bulunamazsa oluşturma öncesi / sonrası
    WINWORD.EXE süreç farkı, tek yeni süreç varsa); tutamacı açılır ve "kapanınca sonlandır" (KILL_ON_JOB_CLOSE) iş nesnesine bağlanır:
    PDEfe ya da çekirdek çökerse Word de kapanır. Süreç bulunamaz ya da bağlanamazsa belge Word'e hiç verilmez (_MotorHatasi, sıradaki motor).
    Application.Path WPS'i gösteriyorsa (kayıt yanıltıcıysa) o örnek kapatılmaz: Kullanıcının açık WPS'i olabilir, yalnız başvuru bırakılır.
  - Belge açılmadan önce: AutomationSecurity = 3 (makrolar kapalı; otomasyonla başlayan Word'de "düşük" ölçüldü, .docm makrosu
    çalışabilirdi), DisplayAlerts = 0, Visible = False, ScreenUpdating = False. Application.Options.* DEĞİŞTİRİLMEZ (kalıcıdır).
  - Girdi önce geçici klasöre doğru uzantıyla kopyalanır (yalnız içerik: "İnternetten indirildi" işareti taşınmaz, Korumalı Görünüm
    açılmaz). 0.2.9 denetimi: kopyadan dış şablon bağlantısı kaldırılır (_dis_sablonu_kaldir: .docx / .docm'da attachedTemplate ilişkisi ve
    ayarlardaki öğesi, RTF'te \\*\\template grubu): Word belgeyi açarken uzak şablonu (\\\\sunucu\\… ya da http) aramasın; aramak hem
    açılışı bekletir hem de karşı tarafa belgenin açıldığını ve UNC yolunda Windows oturumunun parola özetini gönderebilir. Bağlı resim (INCLUDEPICTURE),
    OLE bağlantısı ve .doc / .odt'nin dış başvuruları kopyada kalır (bilinçli kabul: PLAN "Revizyon 0.2.9"). Documents.Open(ConfirmConversions=False, ReadOnly=True, AddToRecentFiles=False, uydurma parola, Revert=False, Visible=False,
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
  - Hata iletileri Word'ün kendi (Word'ün diline göre değişen) açıklamasından değil koddan üretilir (_BELGE_HATALARI; Word'le
    ölçülmüş kodlar).

WPS Office (0.3.1, yalnız Windows; _WpsOturumu, _wps_ile). Word'le aynı nesne modelini sunar (Documents.Open, ExportAsFixedFormat çağrıları aynı,
WPS 12.2'de ölçüldü: Türkçe doğru, filigran yok, başlıktan yer imi var), ama:
  - Kayıt KWPS.Application (wps_bul); Application.Name "Microsoft Word" döndürür, ayırt etmek için Application.Path.
  - IncludeDocProps yok sayılır: Yazar adı PDF'e geçer. Bu yüzden WPS'in ve LibreOffice'in PDF'inde üst veri ardından silinir (_ust_veri_temizle).
  - WPS kurulum ya da güncelleme sürerken başlamaz, ekrana "aynı anda çalıştırılamaz" penceresi açar, COM 120 sn sonra hata döner (0x80080005,
    WPS'in kendi güncellemesinden sonra bu bilgisayarda ölçüldü). Önden denetim: WPS'in kendi kurulum mutex'leri (_wps_kurulum_suruyor, adlar
    ksolite.dll'den). Mutex'ler var olduğu sürece WPS hiç başlatılmaz, pencere çıkmaz.
  - Her belge için ayrı örnek: Son belge kapanınca süreç kendiliğinden kapanıyor, sonraki çağrılar düşüyor (ölçüldü).
  - Kullanıcının açık WPS'ine dokunmamak: WPS tek süreçte çalışabilir, CoCreateInstance açık örneğe bağlanabilir, /Automation ile başlayan süreç de işi açık
    örneğe devredip kapanabilir ya da ona aracılık edebilir (gerçek WPS'le bu dallar sınanamadı: Kurulum kilidi). Bu yüzden örnek ancak dördü birden doğruysa bizimdir:
    Çağrıdan önce hiçbir WPS programı açık değildi (WPS_AILESI), yeni süreç (komut satırında /Automation) bulundu, o süreç hâlâ yaşıyor, örnekte açık belge yok.
    Değilse örnek kullanıcınındır ("paylaşımlı"): Quit çağrılmaz (Quit kullanıcının belgelerini kaydetmeden kapatırdı), Visible ve ScreenUpdating değişmez, yalnız kendi
    belgemiz kapatılır, iki ayar geri alınır. Asılı kalırsa çağrı terk edilir, sıradaki motora geçilir. Bu arada bulunan yeni süreç yalnız asılı kalmada sonlandırılır (kullanıcının açık
    programı o değildir, yukarıdaki listede önceden vardı), iş bitince iş nesnesinden serbest bırakılır.
  - Örnek bizimse süreç iş nesnesine bağlanır (çekirdek çökerse kapanır). İşin sonunda Quit, süre dolunca yalnız o süreç sonlandırılır, iş nesnesi
    gevşetilir: WPS'in başlattığı yardımcılar (bulut hizmeti gibi) öldürülmez. Bu arada kullanıcının belgesi bizim örneğe düştüyse Word'deki gibi bırakılır.
  - Başlarken ya da belge açılırken ekranda küçük bir pencere BILDIRIM_SURESI sn durursa (lisans, oturum açma, güncelleme, ilk çalıştırma, onarım
    sorusu) pencereye WM_CLOSE gönderilir, motor başarısız sayılır. Ana pencere bu boyut süzgecine girmez.
  - Makro: AutomationSecurity yazılabiliyorsa 3. .docm kopyası motora makrosuz verilir (_makrosuz_kopya, LibreOffice'e de). Makro kapatılamıyorsa
    içinde Macros kabı olan .doc WPS'e verilmez.

LibreOffice (Word ve WPS yoksa ya da başlamazsa; macOS'ta ve Linux'ta tek motor): soffice --headless --convert-to pdf, resimleri küçültmeyen ve
kayıpsız sıkıştıran süzgeç seçenekleriyle (7.4 ve sonrası; çıktı yoksa seçeneksiz yeniden). 0.3.1, Windows'ta ilk gerçek sınama (LibreOffice
26.8.2): Her dönüştürmeye TAZE profil (-env:UserInstallation, işin geçici klasöründe, Türkçe harfli yol URL kodlamasıyla doğru, kullanıcının
açık LibreOffice'i etkilenmez). Aynı profil ikinci kez kullanılınca soffice.bin çıktı üretmeden sonsuza dek bekliyor (iki masaüstünde de ölçüldü),
önceki tek profil düzeni ikinci belgede süre aşımıyla düşüyordu. Taze profille her belge ~4 sn. Bozuk .docx ve .odt'de çıkış kodu 1, stderr "source file
could not be loaded": Motor sorunu değil, belge sorunu. Yollar: UNO\\InstallPath (HKLM, HKCU, 32 bit görünüm), App Paths, Program Files, PATH;
macOS'ta /Applications ve ~/Applications; Linux'ta (0.3.1) /usr/bin, /usr/lib/libreoffice, /opt/libreoffice*, PATH (Snap ve Flatpak paketi alınmaz:
/tmp'deki belgeyi göremiyor). macOS'ta sınanmadı; Linux'ta CI sınar (test/linux_cekirdek_testi.py). Hiçbiri yoksa dönüştürme kapalıdır (NEDEN_YOK).

Girdi: .docx, .docm (makro çalıştırılmaz), .doc, .rtf, .odt; tür içerikten (donustur.tur_bul). Parolalı .docx (OLE kabında EncryptedPackage), .doc
(FIB'de fEncrypted) ve .odt (manifest'te encryption-data) motor başlatılmadan reddedilir. Sınama ortam değişkenleri (paketli sürümde de okunur,
yalnız sınama içindir): PDEFE_OFIS_MOTORU=word|wps|libreoffice|yok (virgülle birden çok): Yalnız bunlar kurulu sayılır. PDEFE_WORD_YOK=1:
"yok" ile aynı (sahte ev klasöründe Word başlamasın diye, test/ev_denetimi.py). PDEFE_SINAMA_WORD_KOMUTU: word_bul'un LocalServer32 değeri yerine
okuduğu değer. PDEFE_SINAMA_WORD_PROGID: Word motorunun başlattığı ProgID (Word.Application'ın WPS'e kayıtlı olduğu hâlin gerçek benzetimi).

donusum_yetenekleri'ne word: {var, motor: 'word' | 'wps' | 'libreoffice' | null, motorAdi, not?, neden?, word: {var, yol}, wps: {var, yol},
libreoffice: {var, yol}}. bicim_donustur sonucuna Word → PDF'te sayfa (PDF'in sayfa sayısı), motor ve Word dışındaki motorda uyari.
"""
import os
import queue
import re
import shutil
import sys
import tempfile
import threading
import time
import uuid
import zipfile
import xml.etree.ElementTree as ET

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
LO_SURE = 180.0             # sn: LibreOffice'in bir belgesi (taze profil oluşturması dâhil, ~4 sn)
SAGLIK_SURESI = 300.0       # sn: başlamayan motor bu süre boyunca sona alınır
BILDIRIM_SURESI = 4.0       # sn: WPS başlarken ya da belge açılırken ekranda bu kadar duran küçük pencere bildirim sayılır
BILDIRIM_KAPANMA = 5.0      # sn: bildirim penceresine WM_CLOSE'tan sonra sürecin kapanması beklenir, sonra yalnız o süreç sonlandırılır
BILDIRIM_EN_GENIS, BILDIRIM_EN_YUKSEK = 1000, 800   # px: bundan büyük pencere bildirim sayılmaz (ana pencere)
UYDURMA_PAROLA = "pdefe-parola-yok-7f3a"

MOTORLAR = ("word", "wps", "libreoffice")   # öncelik sırası
MOTOR_ADI = {"word": "Word", "wps": "WPS Office", "libreoffice": "LibreOffice"}
WPS_PROGIDLER = ("KWPS.Application", "WPS.Application")
WPS_SURECLER = ("wps.exe", "wpsoffice.exe")
WPS_AILESI = WPS_SURECLER + ("et.exe", "wpp.exe", "wpspdf.exe")   # kullanıcının açık WPS programı sayılanlar (wpscenter gibi arka plan hizmetleri sayılmaz)
# WPS'in kurulum ve güncelleme kilitleri (ksolite.dll, wpsupdate.exe): Biri varsa WPS başlamaz, "aynı anda çalıştırılamaz" penceresi açar
WPS_KURULUM_MUTEXLERI = ("Global\\wpssetup_C42D7A0A-2868-45FF-92EE-9B7AE7124588", "Global\\wpspatch_C42D7A0A-2868-45FF-92EE-9B7AE7124588",
                         "Global\\wps_diff_patch_C42D7A0A-2868-45FF-92EE-9B7AE7124588")

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
# Word'le ölçülmüş kodlar. Yalnız belgenin kendi sorunu olanlar burada: Öbürleri motor sorunudur (_com_hatasi), sıradaki motora geçilir
_BELGE_HATALARI = {
    0x800A1520: ("parolali", "Belge parolayla korunuyor. Dönüştürülemez"),
    0x800A16A0: ("bozuk", "Dosya bozuk görünüyor. %s açamadı"),
    0x800A1401: ("bozuk", "Dosya bozuk görünüyor. %s açamadı"),
    0x800A1898: ("bozuk", "Dosyanın içeriği uzantısıyla uyuşmuyor. %s açamadı"),
}


class _MotorHatasi(Exception):
    """Motor belgeyi işleyemeden başarısız oldu, sıradaki motora geçilir. neden: 'baslamadi' | 'kurulum' | 'bildirim' | 'acilmadi' | 'makro' |
    'cevirmedi'. ayrinti: yalnız günlük için (ham COM kodu). kok: Tek motor varsa ona yükseltilecek özgün hata (TimeoutError: 'zaman_asimi' kodu)."""

    def __init__(self, motor, neden, ayrinti="", kok=None):
        super().__init__("%s: %s %s" % (motor, neden, ayrinti))
        self.motor, self.neden, self.ayrinti, self.kok = motor, neden, ayrinti, kok


def _cekirdek():
    return araclar._cekirdek()


def _kurulu_sayilanlar():
    """Sınama ortam değişkenlerine göre kurulu sayılabilecek motorlar (bkz. modül belgesi). Değişken yoksa hepsi."""
    if os.environ.get("PDEFE_WORD_YOK") == "1":
        return ()
    secim = os.environ.get("PDEFE_OFIS_MOTORU")
    if secim is None:
        return MOTORLAR
    secim = {p.strip().lower() for p in secim.split(",")}
    return tuple(m for m in MOTORLAR if m in secim)


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
    u32.IsWindowVisible.restype = wintypes.BOOL
    u32.IsWindowVisible.argtypes = [wintypes.HWND]
    u32.GetWindowRect.restype = wintypes.BOOL
    u32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    u32.PostMessageW.restype = wintypes.BOOL
    u32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    pencere_islevi = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    u32.EnumWindows.restype = wintypes.BOOL
    u32.EnumWindows.argtypes = [pencere_islevi, wintypes.LPARAM]
    k32.OpenMutexW.restype = wintypes.HANDLE
    k32.OpenMutexW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
    nt = ctypes.WinDLL("ntdll")
    nt.NtQueryInformationProcess.restype = ctypes.c_long
    nt.NtQueryInformationProcess.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.ULONG, ctypes.POINTER(wintypes.ULONG)]

    class Api:
        pass
    a = Api()
    a.ctypes, a.wintypes, a.k32, a.u32, a.GENIS, a.SUREC_GIRDISI = ctypes, wintypes, k32, u32, GENIS, SUREC_GIRDISI
    a.nt, a.pencere_islevi = nt, pencere_islevi
    _api = a
    return a


PROCESS_TERMINATE, PROCESS_SET_QUOTA, PROCESS_QUERY_LIMITED_INFORMATION, SYNCHRONIZE = 0x0001, 0x0100, 0x1000, 0x00100000
WM_CLOSE = 0x0010
ERROR_ACCESS_DENIED = 5
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
WAIT_TIMEOUT = 0x102
TH32CS_SNAPPROCESS = 0x2
GECERSIZ_TUTAMAC = -1


def _surecler(adlar):
    """Adı verilenlerden (küçük harf) biri olan çalışan süreçler: {kimlik: ebeveyn kimliği} (Toolhelp)."""
    a = _w32()
    anlik = a.k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if not anlik or anlik == a.wintypes.HANDLE(GECERSIZ_TUTAMAC).value:
        return {}
    sonuc = {}
    try:
        g = a.SUREC_GIRDISI()
        g.dwSize = a.ctypes.sizeof(g)
        ok = a.k32.Process32FirstW(anlik, a.ctypes.byref(g))
        while ok:
            if g.szExeFile.lower() in adlar:
                sonuc[int(g.th32ProcessID)] = int(g.th32ParentProcessID)
            ok = a.k32.Process32NextW(anlik, a.ctypes.byref(g))
    finally:
        a.k32.CloseHandle(anlik)
    return sonuc


def word_pidleri():
    """Çalışan WINWORD.EXE süreçlerinin kimlikleri (sınamalar da kullanır)."""
    return set(_surecler(("winword.exe",)))


def wps_pidleri():
    """Çalışan WPS Office süreçleri (wpscenter gibi yardımcılar sayılmaz; sınamalar da kullanır): {kimlik: ebeveyn kimliği}."""
    return _surecler(WPS_SURECLER)


def wps_ailesi():
    """Çalışan WPS programları: Yazı, tablo, sunu, PDF. Biri açıksa COM örneği kullanıcınınki olabilir (_WpsOturumu._baslat)."""
    return _surecler(WPS_AILESI)


def surec_komutu(pid):
    """Sürecin komut satırı ('' okunamadı): NtQueryInformationProcess, ProcessCommandLineInformation (Windows 8.1 ve sonrası)."""
    a = _w32()
    h = a.k32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not h:
        return ""
    try:
        kutu = a.ctypes.create_string_buffer(65536)

        class US(a.ctypes.Structure):
            _fields_ = [("Length", a.wintypes.USHORT), ("MaximumLength", a.wintypes.USHORT), ("Buffer", a.ctypes.c_void_p)]
        if a.nt.NtQueryInformationProcess(h, 60, kutu, 65536, None) != 0:
            return ""
        us = a.ctypes.cast(kutu, a.ctypes.POINTER(US))[0]
        return a.ctypes.wstring_at(us.Buffer, us.Length // 2) if us.Buffer else ""
    finally:
        a.k32.CloseHandle(h)


def _kucuk_pencereler(pid):
    """Sürecin ekrandaki küçük üst pencereleri (bildirim sayılanlar). Boyu sıfır işaretçi pencereler ve ana pencere süzülür."""
    a = _w32()
    bulunan = []

    def bak(h, _):
        kimlik = a.wintypes.DWORD(0)
        a.u32.GetWindowThreadProcessId(h, a.ctypes.byref(kimlik))
        if kimlik.value == pid and a.u32.IsWindowVisible(h):
            r = a.wintypes.RECT()
            if a.u32.GetWindowRect(h, a.ctypes.byref(r)):
                g, y = r.right - r.left, r.bottom - r.top
                if 100 <= g <= BILDIRIM_EN_GENIS and 60 <= y <= BILDIRIM_EN_YUKSEK:
                    bulunan.append(h)
        return True
    a.u32.EnumWindows(a.pencere_islevi(bak), 0)
    return bulunan


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


def _clsid_oku(progid):
    import winreg
    kok = winreg.HKEY_CLASSES_ROOT
    clsid = _kayit_oku(kok, progid + r"\CLSID")
    if not clsid:
        surum = _kayit_oku(kok, progid + r"\CurVer")
        if surum:
            clsid = _kayit_oku(kok, surum + r"\CLSID")
    return clsid


WORD_CLSID = "{000209FF-0000-0000-C000-000000000046}"


def _sunucu_komutlari(clsid):
    """CLSID'nin LocalServer32 değerleri: Önce 64 bit, sonra 32 bit görünüm (kayıt yoksa None atlanır)."""
    import winreg
    sinama = os.environ.get("PDEFE_SINAMA_WORD_KOMUTU")
    if sinama is not None and clsid.upper() == WORD_CLSID:
        return [sinama] if sinama else []
    bulunan = []
    for gorunum in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
        komut = _kayit_oku(winreg.HKEY_CLASSES_ROOT, r"CLSID\%s\LocalServer32" % clsid, "", gorunum)
        if komut:
            bulunan.append(komut)
    return bulunan


def word_karari(clsid, komutlar):
    """Word.Application kaydından kurulu Word: {yol, clsid} ya da None (kayıt defterine dokunmaz, sınamalar da çağırır). Yalnız var olan
    winword.exe sayılır. WPS uyumluluk için bu kaydı wps.exe'ye yazabiliyor: O görünüm Word değildir. Hiç sunucu kaydı yoksa ProgID'ye güvenilir."""
    for komut in komutlar:
        exe = _komuttan_exe(komut)
        if exe and os.path.basename(exe).lower() == "winword.exe" and os.path.isfile(exe):
            return {"yol": exe, "clsid": clsid}
    return None if komutlar else {"yol": None, "clsid": clsid}


def word_bul():
    """Kurulu Word: {yol, clsid} ya da None. Word başlatılmaz (bkz. modül belgesi)."""
    if not WINDOWS:
        return None
    clsid = _clsid_oku("Word.Application")
    if not clsid:
        return None
    return word_karari(clsid, _sunucu_komutlari(clsid))


def wps_bul():
    """Kurulu WPS Office: {yol, clsid, progid} ya da None. WPS başlatılmaz. Kayıttaki exe yoksa (WPS kendini güncellemiş, kayıt bayat) None:
    COM onu başlatamaz, sıradaki motora geçilir."""
    if not WINDOWS:
        return None
    for progid in WPS_PROGIDLER:
        clsid = _clsid_oku(progid)
        if not clsid:
            continue
        for komut in _sunucu_komutlari(clsid):
            exe = _komuttan_exe(komut)
            if exe and os.path.isfile(exe):
                return {"yol": exe, "clsid": clsid, "progid": progid}
    return None


def _wps_kurulum_suruyor():
    """WPS'in kurulum ya da güncelleme kilidi duruyor mu (bkz. modül belgesi). Salt okunur."""
    if not WINDOWS:
        return False
    a = _w32()
    for ad in WPS_KURULUM_MUTEXLERI:
        h = a.k32.OpenMutexW(SYNCHRONIZE, False, ad)
        if h:
            a.k32.CloseHandle(h)
            return True
        if a.ctypes.get_last_error() == ERROR_ACCESS_DENIED:
            return True
    return False


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
        # Linux (0.3.1): dağıtımın paketi, libreoffice.org'un paketi (/opt/libreofficeX.Y), PATH. Snap ve Flatpak paketleri alınmaz: kendi
        # kapalı alanlarında çalışıyor, PDEfe'nin geçici klasöründeki (/tmp) belgeyi ve profili göremiyorlar
        import glob
        adaylar += ["/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice", "/usr/lib64/libreoffice/program/soffice"]
        adaylar += sorted(glob.glob("/opt/libreoffice*/program/soffice"), reverse=True)
        adaylar += [shutil.which("soffice"), shutil.which("libreoffice")]
    for yol in adaylar:
        if yol and os.path.isfile(yol) and not (not WINDOWS and not MAC and _kapali_alanda(yol)):
            return os.path.abspath(yol)
    return None


def _kapali_alanda(yol):
    """Linux: program bir Snap ya da Flatpak paketi mi (/snap/bin/libreoffice, /usr/bin/snap'e bağlantı, flatpak'ın dışa aktardığı)."""
    gercek = os.path.realpath(yol)
    return (yol.startswith(("/snap/", "/var/lib/snapd/", "/var/lib/flatpak/")) or "/flatpak/exports/" in yol
            or os.path.basename(gercek) in ("snap", "flatpak") or gercek.startswith(("/snap/", "/var/lib/flatpak/")))


_algilama = {"zaman": None, "sonuc": None}
_algilama_kilidi = threading.Lock()
_saglik = {}   # motor → saniye sayacında sona alınmanın bittiği an (başlamayan motor)
BULAMAZSA_ONBELLEK = 5.0   # sn: Hiçbir motor bulunamadıysa: Program sonradan kurulunca hemen görülsün


def _kayit_al(ad, islev):
    """Kayıt defteri okunamazsa motor yok sayılır, çekirdek düşmez."""
    try:
        return islev()
    except Exception as e:
        print("[word] %s algılanamadı: %s" % (MOTOR_ADI[ad], e), file=sys.stderr)
        return None


def motorlar(tazele=False):
    """{word: word_bul(), wps: wps_bul(), libreoffice: libreoffice_bul()}: Kurulu olmayan ve sınama değişkeninin dışında bıraktığı None.
    ALGILAMA_ONBELLEK sn ön bellekte (hiçbiri yoksa BULAMAZSA_ONBELLEK sn). Dönüştürme başlarken tazelenir."""
    with _algilama_kilidi:
        simdi = time.monotonic()
        eski = _algilama["sonuc"]
        sure = ALGILAMA_ONBELLEK if eski and any(eski.values()) else BULAMAZSA_ONBELLEK
        if tazele or _algilama["zaman"] is None or simdi - _algilama["zaman"] > sure:
            izinli = _kurulu_sayilanlar()
            bulucu = {"word": word_bul, "wps": wps_bul, "libreoffice": libreoffice_bul}
            _algilama.update(zaman=simdi, sonuc={m: (_kayit_al(m, bulucu[m]) if m in izinli else None) for m in MOTORLAR})
        return dict(_algilama["sonuc"])


def _saglikli(m):
    if m == "wps" and _wps_kurulum_suruyor():
        return False
    bitis = _saglik.get(m)
    return bitis is None or time.monotonic() > bitis


def motor_sirasi(tazele=False):
    """Denenecek motorlar: Sağlıklı olanlar öncelik sırasıyla, sona alınanlar en sonda."""
    mm = motorlar(tazele)
    var = [m for m in MOTORLAR if mm[m] is not None]
    saglikli = [m for m in var if _saglikli(m)]
    return saglikli + [m for m in var if m not in saglikli]


def motor():
    """Kullanılacak motor: 'word' | 'wps' | 'libreoffice' | None."""
    sira = motor_sirasi()
    return sira[0] if sira else None


if WINDOWS:
    NEDEN_YOK = ("Word belgesini PDF'e çevirmek için bu bilgisayarda Microsoft Word, WPS Office ya da LibreOffice gerekir. "
                 "Bunlardan hiçbiri bulunamadı.")
elif MAC:
    NEDEN_YOK = "Word belgesini PDF'e çevirmek için bu bilgisayarda LibreOffice gerekir. LibreOffice bulunamadı."
else:   # Linux (0.3.1): Word yok
    NEDEN_YOK = "Word belgesini PDF'e çevirmek için bu bilgisayarda LibreOffice gerekir. LibreOffice bulunamadı (Snap ve Flatpak paketleri kullanılamıyor)."


def hazir():
    return (True, None) if motor() else (False, NEDEN_YOK)


def _motor_notu(m, mm):
    """Hedef seçilince görünen not: Word dışındaki motorla çevrileceğini söyler."""
    if m in (None, "word"):
        return None
    on = "Word şu anda başlatılamıyor." if mm.get("word") else "Bu bilgisayarda Word yok."
    return "%s Belge %s ile çevrilir, düzeni Word'dekinden biraz farklı olabilir." % (on, MOTOR_ADI[m])


def yetenek():
    mm = motorlar()
    m = motor()
    w, wp, lo = mm["word"], mm["wps"], mm["libreoffice"]
    s = {"var": m is not None, "motor": m, "motorAdi": MOTOR_ADI.get(m), "word": {"var": w is not None, "yol": w["yol"] if w else None},
         "wps": {"var": wp is not None, "yol": wp["yol"] if wp else None}, "libreoffice": {"var": lo is not None, "yol": lo}}
    if m is None:
        s["neden"] = NEDEN_YOK
    not_ = _motor_notu(m, mm)
    if not_:
        s["not"] = not_
    return s


# ---------------------------------------------------------------- COM: geç bağlama (comtypes.client olmadan)
def _com():
    import comtypes
    from comtypes import automation
    return comtypes, automation


def _hresult(e):
    """COMError'ın (ya da comtypes'ın CoCreateInstance'ta fırlattığı OSError'ın) işaretsiz kodu; DISP_E_EXCEPTION'da Word'ün kendi kodu
    (EXCEPINFO.scode)."""
    hr = getattr(e, "winerror", None) or (e.args[0] if e.args else 0) or 0
    try:
        return int(hr) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return 0


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
        self.makro_riski = False  # WPS: Belgede makro kabı var (makro kapatılamıyorsa belge verilmez)


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
        progid = os.environ.get("PDEFE_SINAMA_WORD_PROGID") or "Word.Application"
        w = _Disp(comtypes.CoCreateInstance(comtypes.GUID.from_progid(progid), interface=a.IDispatch, clsctx=comtypes.CLSCTX_LOCAL_SERVER))
        surec = j = None
        yabanci = False   # kayıt yanıltıcı: Word değil WPS yanıt verdi
        try:
            yol = str(_yinele(lambda: w.al("Path")) or "").lower()
            if "kingsoft" in yol or "wps" in yol or yol.rstrip("\\").endswith("office6"):
                yabanci = True
                raise _BaslatmaHatasi("Word.Application WPS Office'i başlattı")
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
            if yabanci:   # kullanıcının açık WPS'i olabilir: Kapatılmaz, yalnız başvuru bırakılır (son başvuru gidince kendi örneğimiz kapanır)
                w = None
            elif self._word is None:   # belge verilemeyecek Word kapatılır
                try:
                    w.cagir("Quit", WD_DO_NOT_SAVE)
                except Exception:
                    pass
            else:
                self._sifirla()
            if isinstance(e, comtypes.COMError):
                raise
            raise _MotorHatasi("word", "baslamadi", str(e)) from None

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

    def _belgeyi_cevir(self, istek):
        """Belgeyi açar, PDF'e aktarır, kapatır (Word ve WPS). Sonuç istek.sonuc'ta. Yalnız bu iş parçacığında."""
        comtypes, a = _com()
        istek.asama = "aciliyor"
        istek.sinir = time.monotonic() + CEVIRME_SURESI
        M = a.VARIANT.missing
        belgeler = _yinele(lambda: self._word.al("Documents"))
        belge = _yinele(lambda: belgeler.cagir("Open", istek.kaynak, False, True, False, UYDURMA_PAROLA, UYDURMA_PAROLA, False, M, M,
                                                0, M, False, False, M, True))
        try:
            if istek.vazgecildi:
                return
            sayfa = self._sayfa_sayisi(belge)
            istek.sayfa = sayfa
            istek.sinir = time.monotonic() + CEVIRME_SURESI + SAYFA_SURESI * max(sayfa or 1, 1)
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

    def _sayfa_sayisi(self, belge):
        return int(_yinele(lambda: belge.cagir("ComputeStatistics", WD_STATISTIC_PAGES)))

    def _isle(self, istek):
        comtypes, _ = _com()
        try:
            if istek.vazgecildi:
                return
            self._hazirla(istek)
            if istek.vazgecildi:   # başlatma geç bitti: belge Word'e verilmez
                self._kapat()
                return
            self._belgeyi_cevir(istek)
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


class _WpsOturumu(_WordOturumu):
    """WPS Office örneği (bkz. modül belgesi). Word oturumundan farkı: Her belgeye ayrı örnek, süreç oluşturma sürerken gözlenir, örnek kullanıcınınsa
    (paylaşımlı) kapatılmaz ve süreci sonlandırılmaz."""

    def __init__(self, progid):
        super().__init__()
        self._progid = progid
        self._onceki = None           # CoCreateInstance'tan önceki WPS süreçleri
        self._bulma_kilidi = threading.Lock()
        self._paylasimli = False
        self._makro_kapali = False
        self._ilk_sayi = 0            # bağlanınca açık belge sayısı
        self._ozgun_uyari = None
        self._pencere_ilk = None      # küçük pencerenin ilk görüldüğü an

    # -- öteki iş parçacıklarından
    def baslayan_bul(self):
        """COM'un başlattığı yeni WPS sürecini bulur, tutamacını açar, iş nesnesine bağlar (gözleyici de, STA iş parçacığı da çağırır). Yalnız
        çağrıdan sonra çıkan, en üstteki ve komut satırında /Automation olan süreç bizimdir: Kullanıcının açtığı WPS'te bu yok. Döner: kimlik ya da None."""
        with self._bulma_kilidi:
            if self.pid is not None or self._onceki is None:
                return self.pid
            yeni = {k: e for k, e in wps_pidleri().items() if k not in self._onceki}
            for kimlik, ebeveyn in yeni.items():
                if ebeveyn in yeni or "/automation" not in surec_komutu(kimlik).lower():
                    continue
                api = _w32()
                h = api.k32.OpenProcess(PROCESS_TERMINATE | PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, False, kimlik)
                if not h:
                    continue
                j = _is_nesnesi_kur(h)   # bağlanamazsa da sürer (Word'den farkı: Çekirdek çökerse WPS açık kalır, son belgeyle kendisi kapanır)
                with self._kilit:
                    self._surec, self._is, self.pid = h, j, kimlik
                return kimlik
            return None

    def gozle(self, istek):
        """0,2 sn'de bir, çağıran iş parçacığından: Başlarken ve belge açılırken bizim sürecimizin ekranda küçük bir penceresi BILDIRIM_SURESI sn durursa
        pencereye WM_CLOSE gönderir, True döner (motor başarısız). Paylaşımlı örnekte bakılmaz: Pencereler kullanıcınındır."""
        if istek.asama not in ("basliyor", "aciliyor"):
            return False
        kimlik = self.baslayan_bul()
        if kimlik is None:
            return False
        pencereler = _kucuk_pencereler(kimlik)
        simdi = time.monotonic()
        if not pencereler:
            self._pencere_ilk = None
            return False
        if self._pencere_ilk is None:
            self._pencere_ilk = simdi
        if simdi - self._pencere_ilk < BILDIRIM_SURESI:
            return False
        api = _w32()
        for h in pencereler:
            api.u32.PostMessageW(h, WM_CLOSE, 0, 0)
        return True

    def bizim_surec_bitti_mi(self, sure):
        """Bizim sürecimiz sure sn içinde kapandı mı (süreç yoksa True)."""
        with self._kilit:
            s = self._surec
        return not s or _w32().k32.WaitForSingleObject(s, int(sure * 1000)) != WAIT_TIMEOUT

    # -- STA iş parçacığı
    def _baslat(self):
        comtypes, a = _com()
        with self._kilit:
            self._onceki = set(wps_pidleri())
        acik_program = bool(wps_ailesi())   # çağrıdan önce: Sonrasında yeni süreç de bu listeye girer
        self._paylasimli = self._makro_kapali = False
        self._pencere_ilk = None
        w = _Disp(comtypes.CoCreateInstance(comtypes.GUID.from_progid(self._progid), interface=a.IDispatch, clsctx=comtypes.CLSCTX_LOCAL_SERVER))
        bitis = time.monotonic() + 1.0
        while self.baslayan_bul() is None and time.monotonic() < bitis:
            time.sleep(0.05)
        self._word = w
        self._ilk_sayi = self._belge_sayisi_ya_da_none() or 0
        with self._kilit:
            yeni_yasiyor = self.pid is not None and _canli_mi(self._surec)
        self._paylasimli = acik_program or not yeni_yasiyor or self._ilk_sayi > 0   # bkz. modül belgesi: Kuşkuda örnek kullanıcınındır
        for ad, oznitelik in (("AutomationSecurity", "_ozgun_guvenlik"), ("DisplayAlerts", "_ozgun_uyari")):
            try:
                setattr(self, oznitelik, int(_yinele(lambda: w.al(ad))))
            except (comtypes.COMError, TypeError, ValueError):
                setattr(self, oznitelik, None)
        ayarlar = [("AutomationSecurity", MSO_AUTOMATION_FORCE_DISABLE), ("DisplayAlerts", WD_ALERTS_NONE)]
        if not self._paylasimli:   # kullanıcının açık WPS'i gizlenmez
            ayarlar += [("Visible", False), ("ScreenUpdating", False)]
        for ad, deger in ayarlar:
            try:
                _yinele(lambda: w.ver(ad, deger))
            except comtypes.COMError as e:
                print("[word] WPS %s yazılamadı: 0x%08X" % (ad, _hresult(e)), file=sys.stderr)
        try:
            self._makro_kapali = int(_yinele(lambda: w.al("AutomationSecurity"))) == MSO_AUTOMATION_FORCE_DISABLE
        except (comtypes.COMError, TypeError, ValueError):
            self._makro_kapali = False

    def _sayfa_sayisi(self, belge):
        comtypes, _ = _com()
        try:
            return int(_yinele(lambda: belge.cagir("ComputeStatistics", WD_STATISTIC_PAGES)))
        except (comtypes.COMError, TypeError, ValueError):
            return None

    def _isle(self, istek):
        try:
            if istek.vazgecildi:
                return
            istek.asama = "basliyor"
            istek.sinir = time.monotonic() + BASLATMA_SURESI
            self._baslat()
            if istek.vazgecildi:
                return
            if istek.makro_riski and not self._makro_kapali:
                raise _MotorHatasi("wps", "makro")
            self._belgeyi_cevir(istek)
        except BaseException as e:
            istek.hata = e
        finally:
            istek.bitti.set()
            try:
                self._kapat()
            except Exception as e:
                print("[word] WPS kapatılırken: %r" % e, file=sys.stderr)

    def _belge_sayisi_ya_da_none(self):
        """Açık belge sayısı. Süreç son belgeyle kendiliğinden kapanmışsa None."""
        comtypes, _ = _com()
        try:
            return self._belge_sayisi()
        except (comtypes.COMError, OSError, TypeError, ValueError):
            return None

    def _kapat(self, bekle=None):
        comtypes, _ = _com()
        with self._kilit:
            self._onceki = None   # sonraki belgenin gözleyicisi bu süreci kendi başlattığı sanmasın
        if self._word is None:
            self._tutamaclari_birak()
            return
        w = self._word
        sayi = self._belge_sayisi_ya_da_none()
        if self._paylasimli:   # kullanıcının örneği: Yalnız değiştirdiğimiz iki ayar geri alınır
            for ad, deger in (("DisplayAlerts", self._ozgun_uyari), ("AutomationSecurity", self._ozgun_guvenlik)):
                if deger is not None:
                    try:
                        _yinele(lambda: w.ver(ad, deger))
                    except comtypes.COMError:
                        pass
            self._word = None
            self._tutamaclari_serbest()
            return
        if sayi is not None and sayi > self._ilk_sayi:   # kullanıcının belgesi bu sırada bizim örneğe düştü
            self._birak()
            return
        if sayi is not None:
            try:
                _yinele(lambda: w.cagir("Quit", WD_DO_NOT_SAVE))
            except comtypes.COMError:
                pass
        self._word = None
        self._tutamaclari_birak(bekle)

    def _tutamaclari_serbest(self):
        """Paylaşımlı örnekte bulunan yeni süreç: Sonlandırılmaz, iş nesnesinden serbest bırakılır (çekirdek kapanınca da yaşar)."""
        s, j = self._tutamaclari_al()
        api = _w32()
        if j:
            _is_nesnesini_gevset(j)
            api.k32.CloseHandle(j)
        if s:
            api.k32.CloseHandle(s)

    def _tutamaclari_birak(self, bekle=None):
        s, j = self._tutamaclari_al()
        if not s and not j:
            return
        if bekle is None:
            threading.Thread(target=_wps_kapanmasini_bekle, args=(s, j, KAPANMA_BEKLE), name="wps-kapanis", daemon=True).start()
        else:
            _wps_kapanmasini_bekle(s, j, bekle)


def _wps_kapanmasini_bekle(surec, j, sure):
    """Quit'ten sonra: Süre dolunca yalnız bizim süreç sonlandırılır. İş nesnesi gevşetilir: WPS'in başlattığı yardımcılar (bulut hizmeti gibi) öldürülmez."""
    api = _w32()
    try:
        if surec and api.k32.WaitForSingleObject(surec, int(sure * 1000)) == WAIT_TIMEOUT:
            print("[word] WPS %g sn'de kapanmadı, sonlandırılıyor" % sure, file=sys.stderr)
            api.k32.TerminateProcess(surec, 1)
    finally:
        if j:
            _is_nesnesini_gevset(j)
            api.k32.CloseHandle(j)
        if surec:
            api.k32.CloseHandle(surec)


_oturum = None
_wps_oturum = None
_oturum_kilidi = threading.Lock()


def _word_oturumu():
    global _oturum
    with _oturum_kilidi:
        if _oturum is None:
            _oturum = _WordOturumu()
        return _oturum


def _wps_oturumu(progid):
    global _wps_oturum
    with _oturum_kilidi:
        if _wps_oturum is None:
            _wps_oturum = _WpsOturumu(progid)
        return _wps_oturum


def _wps_oturumunu_unut(o):
    """Asılı kalan oturum terk edilir (STA iş parçacığı COM çağrısında bekliyor olabilir): Sonraki iş yeni oturumla başlar."""
    global _wps_oturum
    with _oturum_kilidi:
        if _wps_oturum is o:
            _wps_oturum = None


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


def _asama(asama, ad):
    return {"bekliyor": (0.02, "%s bekleniyor…" % ad), "basliyor": (0.05, "%s başlatılıyor…" % ad), "aciliyor": (0.15, "Belge açılıyor…"),
            "ceviriyor": (0.4, "PDF'e çevriliyor…")}[asama]


def _com_sonucu(m, hata, asama, ad):
    """İş parçacığından gelen hata: Belgenin kendi sorunuysa OgeHatasi (motor değiştirilmez), öbür COM hataları _MotorHatasi. Başka türler aynen."""
    comtypes, _ = _com()
    if not isinstance(hata, (comtypes.COMError, OSError)) or isinstance(hata, (TimeoutError, PermissionError, FileNotFoundError)):
        return hata
    hr = _hresult(hata)
    belge = _BELGE_HATALARI.get(hr)
    if belge:
        metin = belge[1] % MOTOR_ADI[m] if "%s" in belge[1] else belge[1]
        return OgeHatasi(belge[0], "%s: %s" % (metin, ad))
    neden = "baslamadi" if asama in ("bekliyor", "basliyor") else "acilmadi" if asama == "aciliyor" else "cevirmedi"
    return _MotorHatasi(m, neden, "0x%08X" % hr)


def _sure_doldu(m, istek, ad):
    """Süre sınırı aşıldı: Başlama ve açılma motor sorunu sayılır (sıradakine geçilir, başka motor yoksa zaman aşımı). Dışa aktarma sırasındaysa belge sorunu."""
    adi = MOTOR_ADI[m]
    if istek.asama in ("bekliyor", "basliyor"):
        return _MotorHatasi(m, "baslamadi", "süre doldu", kok=TimeoutError("%s %d saniyede başlamadı: %s" % (adi, BASLATMA_SURESI, ad)))
    if istek.asama == "aciliyor":
        return _MotorHatasi(m, "acilmadi", "süre doldu", kok=TimeoutError("%s belgeyi zamanında açamadı: %s" % (adi, ad)))
    return TimeoutError("%s belgeyi zamanında dönüştüremedi%s: %s" % (adi, " (%d sayfa)" % istek.sayfa if istek.sayfa else "", ad))


def _word_ile(kaynak, pdf, ilerleme, ad):
    oturum = _word_oturumu()
    istek = _Istek(kaynak, pdf)
    oturum.gonder(istek)
    try:
        while not istek.bitti.wait(0.2):
            oran, mesaj = _asama(istek.asama, "Word")
            ilerleme(oran, mesaj)   # iptalde IptalEdildi
            if time.monotonic() > istek.sinir:
                raise _sure_doldu("word", istek, ad)
    except BaseException:
        istek.vazgecildi = True
        if istek.asama != "bekliyor":
            oturum.oldur()   # yalnız bizim Word sürecimiz
        istek.bitti.wait(10)
        raise
    if istek.hata is not None:
        raise _com_sonucu("word", istek.hata, istek.asama, ad)
    if not os.path.isfile(pdf):
        raise _MotorHatasi("word", "cevirmedi", "PDF yok")
    return istek.sonuc or {}


def _wps_ile(kaynak, pdf, ilerleme, ad, makro_riski=False):
    if _wps_kurulum_suruyor():   # WPS bu durumda ekrana pencere açar: Hiç başlatılmaz
        raise _MotorHatasi("wps", "kurulum")
    oturum = _wps_oturumu(motorlar()["wps"]["progid"])
    istek = _Istek(kaynak, pdf)
    istek.makro_riski = makro_riski
    oturum.gonder(istek)
    try:
        while not istek.bitti.wait(0.2):
            oran, mesaj = _asama(istek.asama, "WPS Office")
            ilerleme(oran, mesaj)   # iptalde IptalEdildi
            if oturum.gozle(istek):
                raise _MotorHatasi("wps", "bildirim", "küçük pencere")
            if time.monotonic() > istek.sinir:
                raise _sure_doldu("wps", istek, ad)
    except BaseException as e:
        istek.vazgecildi = True
        if not (isinstance(e, _MotorHatasi) and e.neden == "bildirim" and oturum.bizim_surec_bitti_mi(BILDIRIM_KAPANMA)):
            oturum.oldur()   # yalnız bizim başlattığımız süreç; örnek kullanıcınınsa bir şey yapılmaz, çağrı terk edilir
        istek.bitti.wait(3)
        _wps_oturumunu_unut(oturum)
        raise
    if istek.hata is not None:
        raise _com_sonucu("wps", istek.hata, istek.asama, ad)
    if not os.path.isfile(pdf):
        raise _MotorHatasi("wps", "cevirmedi", "PDF yok")
    return istek.sonuc or {}


# ---------------------------------------------------------------- LibreOffice
LO_SUZGEC = ('pdf:writer_pdf_Export:{"ReduceImageResolution":{"type":"boolean","value":"false"},'
             '"UseLosslessCompression":{"type":"boolean","value":"true"},"ExportNotes":{"type":"boolean","value":"false"}}')
LO_YUKLENEMEDI = b"could not be loaded"


def _libreoffice_ile(soffice, kaynak, pdf, ilerleme, baglam, ad):
    """Bkz. modül belgesi. Profil işin geçici klasöründe (adı çekirdeğin pid'iyle: Çekirdek çökerse donustur.kalintilari_temizle siler)."""
    import pathlib
    klasor = os.path.join(baglam.gecici_klasor(), "lo")
    os.makedirs(klasor, exist_ok=True)
    beklenen = os.path.join(klasor, os.path.splitext(os.path.basename(kaynak))[0] + ".pdf")
    ilerleme(0.1, "LibreOffice ile çevriliyor…")
    # Geçici dosyaları da işin klasörüne: Sonlandırılınca (iptal, kapanış, süre) %TEMP%'te lu*.tmp klasörü kalıyordu (0.3.1, ölçüldü)
    gecici = os.path.join(klasor, "tmp")
    os.makedirs(gecici, exist_ok=True)
    ortam = dict(os.environ, TMP=gecici, TEMP=gecici, TMPDIR=gecici)
    for sira, suzgec in enumerate((LO_SUZGEC, "pdf")):
        profil = tempfile.mkdtemp(prefix="profil-%d-" % sira, dir=baglam.gecici_klasor())
        komut = [soffice, "-env:UserInstallation=" + pathlib.Path(profil).as_uri(), "--headless", "--invisible", "--norestore",
                 "--nologo", "--nodefault", "--nolockcheck", "--nofirststartwizard", "--convert-to", suzgec, "--outdir", klasor, kaynak]
        try:
            _, cikti, hata = baglam.dis_surec(komut, sure=LO_SURE, ortam=ortam)
        except TimeoutError:
            raise _MotorHatasi("libreoffice", "acilmadi", "süre doldu", kok=TimeoutError("LibreOffice belgeyi zamanında dönüştüremedi: %s" % ad)) from None
        except OSError as e:
            raise _MotorHatasi("libreoffice", "baslamadi", repr(e)) from None
        finally:
            shutil.rmtree(profil, ignore_errors=True)
        if os.path.isfile(beklenen) and os.path.getsize(beklenen) > 0:
            shutil.move(beklenen, pdf)
            return {}
        if LO_YUKLENEMEDI in (cikti or b"") + (hata or b""):
            raise OgeHatasi("bozuk", "Dosya bozuk görünüyor. LibreOffice açamadı: %s" % ad)
    raise _MotorHatasi("libreoffice", "cevirmedi", "PDF yok")


# ---------------------------------------------------------------- dış şablon (0.2.9 denetimi)
_SABLON_TURU = re.compile(rb'\bType="[^"]*/attachedTemplate"')
_ILISKI = re.compile(rb'<Relationship\b[^>]*?(?:/>|>\s*</Relationship>)')
_SABLON_OGESI = re.compile(rb'<(?:[A-Za-z_][\w.\-]*:)?attachedTemplate\b[^>]*?/>')
_RTF_SABLON = re.compile(rb'\{\\\*\\template\b[^{}]*\}')


def _dis_sablonu_kaldir(yol, alt):
    """Word'e verilecek kopyadan dış şablon bağlantısını kaldırır (bkz. modül belgesi). .docx / .docm: _rels altındaki attachedTemplate
    ilişkileri ve kaynak parçadaki (word/settings.xml) attachedTemplate öğeleri; öteki parçalar bayt bayt aynı yazılır. RTF: {\\*\\template …}
    grubu. Döner: kaldırılan bağlantı sayısı. Bir şey ters giderse kopya olduğu gibi kalır (dönüştürme yine yapılır)."""
    try:
        if alt == "rtf":
            with open(yol, "rb") as f:
                veri = f.read()
            yeni, n = _RTF_SABLON.subn(b"", veri)
            if n:
                with open(yol, "wb") as f:
                    f.write(yeni)
            return n
        if alt in ("docx", "docm"):
            return _docx_sablonu_kaldir(yol)
    except Exception as e:
        print("[word] dış şablon bağlantısı kaldırılamadı: %r" % e, file=sys.stderr)
    return 0


def _docx_sablonu_kaldir(yol):
    sinir = donustur.EN_FAZLA_ACIK_BOYUT
    with zipfile.ZipFile(yol) as z:
        bilgiler = z.infolist()
        adlar = {b.filename for b in bilgiler}
        degisen, sayi = {}, 0
        for b in bilgiler:
            if not b.filename.endswith(".rels") or "_rels/" not in b.filename:
                continue
            veri = donustur.zip_oku(z, b.filename, en_fazla=sinir)
            if not _SABLON_TURU.search(veri):
                continue
            kalan = []

            def ayikla(m):
                if _SABLON_TURU.search(m.group(0)):
                    kalan.append(1)
                    return b""
                return m.group(0)
            degisen[b.filename] = _ILISKI.sub(ayikla, veri)
            sayi += len(kalan)
            klasor, ad = b.filename.rsplit("_rels/", 1)   # "word/_rels/settings.xml.rels" → kaynak parça "word/settings.xml"
            kaynak = klasor + ad[:-len(".rels")]
            if kaynak in adlar:
                degisen[kaynak] = _SABLON_OGESI.sub(b"", degisen.get(kaynak) or donustur.zip_oku(z, kaynak, en_fazla=sinir))
        if not degisen:
            return 0
        for veri in degisen.values():
            ET.fromstring(veri)   # iyi biçimli kalmalı (değilse istisna: kopya değişmez)
        gecici = yol + ".sablonsuz"
        try:
            with zipfile.ZipFile(gecici, "w") as h:
                for b in bilgiler:
                    h.writestr(b, degisen[b.filename] if b.filename in degisen else donustur.zip_oku(z, b.filename, en_fazla=sinir))
        except BaseException:
            try:
                os.remove(gecici)
            except OSError:
                pass
            raise
    os.replace(gecici, yol)
    return sayi


# ---------------------------------------------------------------- makro (0.3.1)
_VBA_PARCALARI = ("word/vbaProject.bin", "word/vbaData.xml", "word/_rels/vbaProject.bin.rels")
_VBA_ILISKISI = re.compile(rb'\bType="[^"]*/(?:vbaProject|wordVbaData)"')
_VBA_TURU = re.compile(rb'<Override\b[^>]*PartName="/word/vba[^"]*"[^>]*/>', re.I)
_MAKROLU_TUR = re.compile(rb"application/vnd\.ms-word\.document\.macroEnabled\.main\+xml", re.I)
_DOCX_TURU = b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
_MACROS_ADI = "Macros".encode("utf-16-le")


def _makrosuz_kopya(kopya, alt, klasor):
    """Word dışındaki motora verilecek .docm kopyası makrosuz .docx olur (makro çalıştırma ayarına bağlı kalınmasın). Öbür türler olduğu gibi.
    Bir şey ters giderse kopyanın kendisi: Dönüştürme yine yapılır (LibreOffice makroyu zaten çalıştırmaz, WPS'te ayar yazılır)."""
    if alt != "docm":
        return kopya
    hedef = os.path.join(klasor, "kaynak-makrosuz.docx")
    sinir = donustur.EN_FAZLA_ACIK_BOYUT
    try:
        with zipfile.ZipFile(kopya) as z, zipfile.ZipFile(hedef, "w") as h:
            for b in z.infolist():
                if b.filename in _VBA_PARCALARI:
                    continue
                veri = donustur.zip_oku(z, b.filename, en_fazla=sinir)
                if b.filename == "[Content_Types].xml":
                    veri = _MAKROLU_TUR.sub(_DOCX_TURU, _VBA_TURU.sub(b"", veri))
                    ET.fromstring(veri)
                elif b.filename == "word/_rels/document.xml.rels":
                    veri = _ILISKI.sub(lambda m: b"" if _VBA_ILISKISI.search(m.group(0)) else m.group(0), veri)
                    ET.fromstring(veri)
                h.writestr(b, veri)
        return hedef
    except Exception as e:
        print("[word] makrolar kaldırılamadı: %r" % e, file=sys.stderr)
        return kopya


def _doc_makrolu(yol):
    """.doc'ta makro kabı var mı (OLE2 dizininde "Macros" adı düz durur; donustur._ole2_turu gibi)."""
    try:
        with open(yol, "rb") as f:
            onceki = b""
            okunan = 0
            while okunan < donustur.OLE2_TARAMA:
                parca = f.read(1 << 20)
                if not parca:
                    return False
                okunan += len(parca)
                if _MACROS_ADI in onceki + parca:
                    return True
                onceki = parca[-len(_MACROS_ADI):]
    except OSError:
        pass
    return False


def _ust_veri_temizle(pdf, baglam):
    """WPS ve LibreOffice belgenin yazar adını ve başlığını PDF'e yazar (Word'de IncludeDocProps kapalı): Bilgi sözlüğü ve XMP silinir, dosya baştan yazılır
    (artımlı kayıtta eski değerler dosyada kalırdı). Yapılamazsa PDF olduğu gibi kalır, günlüğe yazılır."""
    gecici = pdf + ".temiz"
    try:
        with baglam.mupdf():
            d = pymupdf.open(pdf, filetype="pdf")
            try:
                d.set_metadata({})
                d.del_xml_metadata()
                d.save(gecici, garbage=1, deflate=True)
            finally:
                d.close()
        os.replace(gecici, pdf)
    except Exception as e:
        print("[word] PDF üst verisi silinemedi: %r" % e, file=sys.stderr)
        try:
            os.remove(gecici)
        except OSError:
            pass


# ---------------------------------------------------------------- dönüştürücü
_ILETILER = {
    ("wps", "kurulum"): "WPS Office şu anda kuruluyor ya da güncelleniyor. Bitince yeniden deneyin.",
    ("wps", "bildirim"): "WPS Office açılırken bir uyarı gösterdi. WPS Office'i kendiniz açıp ekrandaki pencereyi kapatın, sonra yeniden deneyin.",
    ("wps", "baslamadi"): "WPS Office başlatılamadı. WPS Office'i kendiniz açıp ekrandaki pencereyi kapatın, sonra yeniden deneyin.",
    ("wps", "makro"): "Belgede makro var, WPS Office'te makrolar kapatılamadı.",
    ("word", "baslamadi"): "Word başlatılamadı. Word'ü kendiniz açıp ekrandaki pencereyi kapatın, sonra yeniden deneyin.",
    ("libreoffice", "baslamadi"): "LibreOffice başlatılamadı.",
}
_ON_EKLER = {"kurulum": "%s şu anda güncellendiği için", "bildirim": "%s açılırken uyarı gösterdiği için", "baslamadi": "%s başlatılamadığı için",
             "acilmadi": "%s belgeyi açamadığı için", "makro": "%s makroları kapatamadığı için", "cevirmedi": "%s belgeyi çeviremediği için"}


def _basarisizlik(hatalar):
    """Bütün motorlar başarısız: Tek motor süre aşımına uğradıysa özgün zaman aşımı hatası, değilse anlaşılır ileti (ham kod günlükte kaldı)."""
    if len(hatalar) == 1 and isinstance(hatalar[0].kok, TimeoutError):
        return hatalar[0].kok
    cumleler = [_ILETILER.get((h.motor, h.neden)) or "%s belgeyi dönüştüremedi." % MOTOR_ADI[h.motor] for h in hatalar]
    if WINDOWS and not any(h.motor == "libreoffice" for h in hatalar):
        cumleler.append("LibreOffice kurarsanız dönüştürme onunla da yapılabilir.")
    return OgeHatasi("hata", " ".join(cumleler))


def _motor_uyarisi(m, hatalar, mm):
    """Sonuçta söylenir: Hangi programla ve neden Word'le değil."""
    if m == "word":
        return None
    if hatalar:
        on = _ON_EKLER.get(hatalar[0].neden, "%s kullanılamadığı için") % MOTOR_ADI[hatalar[0].motor]
    elif mm.get("word"):
        on = "Word şu anda başlatılamadığı için"
    elif m != "wps" and mm.get("wps"):
        on = "WPS Office şu anda kullanılamadığı için"
    else:
        on = "Word bulunamadığı için"
    return "%s %s ile dönüştürüldü. Sayfa düzeni Word'dekinden biraz farklı olabilir." % (on, MOTOR_ADI[m])


def _motorla_cevir(m, kopya, alt, pdf, ilerleme, baglam, ad):
    if m == "word":
        return _word_ile(kopya, pdf, ilerleme, ad)
    girdi = _makrosuz_kopya(kopya, alt, baglam.gecici_klasor())
    if m == "wps":
        bilgi = _wps_ile(girdi, pdf, ilerleme, ad, makro_riski=alt == "doc" and _doc_makrolu(girdi))
    else:
        bilgi = _libreoffice_ile(motorlar()["libreoffice"], girdi, pdf, ilerleme, baglam, ad)
    _ust_veri_temizle(pdf, baglam)
    return bilgi


def _word_pdf(kaynak, cikti, secenekler, ilerleme, baglam):
    ad = os.path.basename(kaynak)
    alt = baglam.alt
    if alt == "sifreli":
        raise OgeHatasi("parolali", "Belge parolayla korunuyor. Dönüştürülemez: %s" % ad)
    uzanti = GIRDI_UZANTISI.get(alt)
    if uzanti is None:
        raise OgeHatasi("desteklenmiyor", "Bu Word dosyası dönüştürülemiyor: %s" % ad)
    sira = motor_sirasi(tazele=True)   # program sonradan kurulduysa görülsün
    if not sira:
        raise OgeHatasi("desteklenmiyor", NEDEN_YOK)
    klasor = baglam.gecici_klasor()
    kopya = os.path.join(klasor, "kaynak" + uzanti)
    try:
        shutil.copyfile(kaynak, kopya)   # yalnız içerik (İnternet işareti ve öznitelikler taşınmaz)
    except PermissionError:
        raise PermissionError("Dosya okunamadı, %s: %s" % (araclar.KILITLI_METNI, ad))
    _dis_sablonu_kaldir(kopya, alt)   # 0.2.9 denetimi: uzak şablon aranmasın (modül belgesi)
    pdf = os.path.join(klasor, "cikti.pdf")
    hatalar, kullanilan, bilgi = [], None, {}
    for m in sira:
        try:
            bilgi = _motorla_cevir(m, kopya, alt, pdf, ilerleme, baglam, ad)
            kullanilan = m
            break
        except _MotorHatasi as e:
            print("[word] %s kullanılamadı: %s %s" % (MOTOR_ADI[m], e.neden, e.ayrinti), file=sys.stderr)
            hatalar.append(e)
            if e.neden in ("baslamadi", "kurulum", "bildirim"):
                _saglik[m] = time.monotonic() + SAGLIK_SURESI
            try:
                os.remove(pdf)
            except OSError:
                pass
    if kullanilan is None:
        raise _basarisizlik(hatalar)
    _saglik.pop(kullanilan, None)
    ilerleme(0.95, "PDF denetleniyor…")
    with baglam.mupdf():
        try:
            d = pymupdf.open(pdf, filetype="pdf")
        except Exception as e:
            print("[word] üretilen PDF açılamadı: %r" % e, file=sys.stderr)
            raise OgeHatasi("hata", "Üretilen PDF açılamadı: %s" % ad)
        try:
            sayfa = d.page_count
        finally:
            d.close()
    shutil.move(pdf, cikti)
    sonuc = {"sayfa": sayfa, "motor": kullanilan}
    uyari = _motor_uyarisi(kullanilan, hatalar, motorlar())
    if uyari:
        sonuc["uyari"] = uyari
    return sonuc


def kapanirken():
    for o in (_oturum, _wps_oturum):
        if o is not None:
            o.kapat(KAPANIS_BEKLE)


donustur.donusturucu_kaydet("word", "pdf", _word_pdf, hazir)
donustur.yetenek_kaydet("word", yetenek)
donustur.kapanis_kaydet(kapanirken)
