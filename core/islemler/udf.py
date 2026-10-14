# -*- coding: utf-8 -*-
"""UDF → PDF (0.2.6, "Dosya Formatını Değiştir" aracı): bilgisayardaki UYAP Doküman Editörü'nün (UDE) kendi sayfa düzeniyle.
donustur.py'nin çatısına kaydolur (islemler/__init__.py onu donustur'dan sonra yükler).

UDF → PDF: UDE'nin "PDF olarak kaydet"i bazı belgeleri bozuk kaydediyor (kök nedenler PLAN.md "Revizyon 0.2.6"): sayfa genişliğini
"2 × sol kenar + yazı alanı" alıyor (sol ve sağ kenarı farklı belgede sayfa A4 olmuyor, yazı kayıyor), yazı tiplerini gömmüyor (başka
okuyucular Calibri'nin yerine başka yazı tipi koyuyor, iki yana yaslı satırlar bozuluyor), saydam antetin çevresinde gri çerçeve bırakıyor.
"Yazdır → PDF" düzgün çünkü yazdırma aynı sayfalayıcıyı (Printable) yazıcının çizim yüzeyine çiziyor. PDEfe aynı sayfalayıcıyı küçük bir Java
köprüsüyle (core/ude_kopru, ude-kopru.jar) UDE'nin kendi PDF kitaplığına (iText 2.1.7, UDE'nin jai_hvl.jar'ı) doğru ayarlarla çizdirir:
sayfa boyu PageFormat'tan, yazı tipleri gömülü (Identity-H), saydam resimler önce beyaza düzleştirilmiş. Satır kırılımı UDE'de ve yazdırmada
olduğu gibidir. Köprü UDE ve iText sınıflarına yalnızca yansımayla erişir; UDE'nin ve iText'in jar'ları PDEfe'ye girmez.
  Yedek (yalnızca Windows; UDE'nin PDF kitaplığı bulunamaz ya da çizemezse): aynı sayfalayıcı Java'nın yazdırma işiyle "Microsoft Print to
  PDF"e (dosyaya, pencere açmadan). Java bazı belgeleri bu yolda resme çeviriyor (yazı seçilemez): sonuçta uyarı.
  Gerekenler: UDE (klasöründe editor_lib.jar) ve UDE'nin çalıştığı Java (8 önce; 16 ve sonrası UDE'yi çalıştırmıyor, kullanılmaz).

Köprünün süreci (_Oturum): bir JVM birden çok belgeyi çizer (ilk belge ~3 sn: yazı tipi klasörleri taranır, UDE sınıfları yüklenir; sonrakiler
0,2–1,5 sn). Dönüştürme iş parçacığının ve ön izleme iş parçacığının ayrı oturumu var; oturum BOSTA_KAPAT sn boş kalınca, OTURUM_BELGE belgeden
sonra ya da ölümcül hatada (bellek) kapanır, çekirdek kapanınca da (girdisi kapanınca JVM kendisi çıkar). JVM penceresiz (CREATE_NO_WINDOW,
java.awt.headless), geçici bir ev klasörüyle (user.home, java.io.tmpdir) çalışır: UDE'nin ayar ve günlük yazımları (.uki, .sertifikadeposu)
oraya gider, kullanıcının UDE ayarlarına dokunulmaz; klasör oturum kapanınca silinir. İptalde ve süre dolunca süreç öldürülür, yarım çıktı
kalmaz (çatı geçici dosyayı siler). Belge yolları komut satırında değil köprünün girdisinde (UTF-8) gider: Java 8'in komut satırı Windows'un
ANSI kod sayfasıyla okunur; Java, jar ve geçici klasör yolları da bu kod sayfasına sığmazsa kısa (8.3) adlarıyla verilir.

UDE'yi bulmak (ude_bul): kullanıcının ayarlarda gösterdiği yol (istek parametresi udeYolu: UDE klasörü, exe ya da .ini dosyası, macOS'ta .app),
.udf'nin ProgID kayıtlarının açma komutu (Windows'ta kullanıcının seçtiği program, HKCR / HKLM / HKCU \\.udf, bilinen ProgID'ler), kurulu
programlar listesi (Uninstall, "Uyap Kelime İşlemci"), varsayılan klasör (C:\\Uyap\\Uyap Kelime Islemci); macOS'ta /Applications ve
~/Applications altındaki UYAP uygulaması. Sınıf yolu UDE'nin .ini dosyasındaki "Class Path" (yoksa klasördeki bütün jar'lar). Java'yı bulmak
(java_bul): UDE klasöründeki jre, Program Files[ (x86)]\\Java\\jre1.8* / jdk1.8*, Common Files\\Oracle\\Java\\javapath, JAVA_HOME,
kayıt defterindeki JavaSoft, bilinen dağıtımlar (Adoptium, Zulu, Corretto, Microsoft, Liberica), PATH; macOS'ta Java eklentisinin JRE'si ve
/Library/Java/JavaVirtualMachines. Sürümü 15'ten büyük olanlar elenir; 8 önce, sonra UDE'nin .ini dosyasındaki "Preferred versions" sırası.

Yöntemler (donustur'un çatısı üzerinden): donusum_yetenekleri'ne udf: {var (UDF → PDF yapılabilir mi), neden?, ude: {var, yol, surum},
java: {var, yol, surum}, kip ('pdf' | 'yazici' | null), pdfdenUdf}; donusum_bilgi yanıtına UDF için alt ('zip' | 'xml'), genislik /
yukseklik (pageFormat'tan, pt), imzali, ve onizleme (varsayılan açık) ise UDE ile sayfa sayısı ve ilk sayfanın küçük resmi (png; yanıt ön
izleme iş parçacığından gelir, sonuç dosyanın değişme zamanı ve boyutuyla ön bellekte). bicim_donustur'da UDF → PDF seçenekleri: {kip:
'otomatik' (varsayılan) | 'pdf' | 'yazici'}. Üç yöntem de istek parametresi udeYolu'nu (ya da null) alır: ayarlardaki yol.
"""
import base64
import collections
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import zipfile

import pymupdf

from . import araclar
from . import donustur
from .donustur import OgeHatasi

WINDOWS = os.name == "nt"
MAC = sys.platform == "darwin"

KOPRU_JAR = "ude-kopru.jar"
JAVA_EN_YUKSEK = 15            # UDE Java 16 ve sonrasıyla çalışmıyor (UDE klasöründeki not); Java 25'te de satırlar 1 pt kayıyordu
BULMA_YENILE = 30.0            # sn: bulunamayan UDE / Java bu kadar sonra yeniden aranır (kullanıcı arada kurmuş olabilir)
BASLAMA_SURESI = 60.0          # sn: köprünün "hazır" satırı
BELGE_SURESI = 180.0           # sn: bir belgenin çizimi (büyük belgede dosya boyutuyla uzar)
BELGE_SURESI_MB = 20.0         # sn / MB
BOSTA_KAPAT = 45.0             # sn: boştaki oturum kapanır (JVM ~150–250 MB tutar)
OTURUM_BELGE = 60              # bu kadar belgeden sonra oturum yenilenir (UDE'nin durumu birikmesin)
ONIZLEME_ONBELLEK = 64
VARSAYILAN_YAZICI = "Microsoft Print to PDF"
BILINEN_PROGIDLER = ("Adalet Bakanlığı.Uyap Kelime İşlemci", "Adalet Bakanligi.Uyap Kelime Islemci")
DOSYA_ILISKISI = r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.udf"
KALDIRMA = r"Software\Microsoft\Windows\CurrentVersion\Uninstall"
UDE_EXE_ADLARI = ("Uyap Doküman Editörü.exe", "Uyap Doküman Editörü x86.exe")
TEMIZLENEN_ORTAM = ("JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "CLASSPATH")

EV_ONEKI = "pdefe-ude-"         # köprünün geçici ev klasörü: <%TEMP%>/pdefe-ude-<çekirdeğin pid'i>-<rastgele>
UDE_YOK = "Bu bilgisayarda UYAP Doküman Editörü bulunamadı."
JAVA_YOK = "UYAP Doküman Editörü'nün çalıştığı Java (8) bulunamadı."


# ---------------------------------------------------------------- yardımcılar
def _cekirdek():
    return araclar._cekirdek()


def _sil_klasor(yol):
    for _ in range(5):
        shutil.rmtree(yol, ignore_errors=True)
        if not os.path.exists(yol):
            return
        time.sleep(0.2)


def _reg_oku(kok, alt, ad="", gorunum=0):
    if not WINDOWS:
        return None
    import winreg
    try:
        with winreg.OpenKey(kok, alt, 0, winreg.KEY_READ | gorunum) as k:
            deger, tur = winreg.QueryValueEx(k, ad)
    except OSError:
        return None
    if not isinstance(deger, str):
        return None
    return os.path.expandvars(deger) if tur == winreg.REG_EXPAND_SZ else deger


def _reg_alt_anahtarlar(kok, alt, gorunum=0):
    import winreg
    adlar = []
    try:
        with winreg.OpenKey(kok, alt, 0, winreg.KEY_READ | gorunum) as k:
            i = 0
            while True:
                try:
                    adlar.append(winreg.EnumKey(k, i))
                except OSError:
                    break
                i += 1
    except OSError:
        pass
    return adlar


def _reg_deger_adlari(kok, alt):
    import winreg
    adlar = []
    try:
        with winreg.OpenKey(kok, alt, 0, winreg.KEY_READ) as k:
            i = 0
            while True:
                try:
                    adlar.append(winreg.EnumValue(k, i)[0])
                except OSError:
                    break
                i += 1
    except OSError:
        pass
    return adlar


def _dosya_surumu(yol):
    """Windows exe'sinin dosya sürümü ("5.4.20"); okunamazsa None."""
    if not WINDOWS:
        return None
    try:
        import ctypes
        from ctypes import wintypes
        ver = ctypes.WinDLL("version")
        ver.GetFileVersionInfoSizeW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(wintypes.DWORD)]
        ver.GetFileVersionInfoSizeW.restype = wintypes.DWORD
        ver.GetFileVersionInfoW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p]
        ver.GetFileVersionInfoW.restype = wintypes.BOOL
        ver.VerQueryValueW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.UINT)]
        ver.VerQueryValueW.restype = wintypes.BOOL
        n = ver.GetFileVersionInfoSizeW(yol, None)
        if not n:
            return None
        tampon = ctypes.create_string_buffer(n)
        if not ver.GetFileVersionInfoW(yol, 0, n, tampon):
            return None
        p, uzunluk = ctypes.c_void_p(), wintypes.UINT()
        if not ver.VerQueryValueW(tampon, "\\", ctypes.byref(p), ctypes.byref(uzunluk)) or not p.value:
            return None
        d = ctypes.cast(p, ctypes.POINTER(ctypes.c_uint32 * 13)).contents   # VS_FIXEDFILEINFO
        ms, ls = d[2], d[3]
        parcalar = [ms >> 16, ms & 0xFFFF, ls >> 16] + ([ls & 0xFFFF] if ls & 0xFFFF else [])
        return ".".join(str(x) for x in parcalar)
    except Exception:
        return None


def _surec_yasiyor(pid):
    """pid'li süreç çalışıyor mu (Windows: OpenProcess + GetExitCodeProcess; öteki sistemler: os.kill(pid, 0))."""
    if pid == os.getpid():
        return True
    if WINDOWS:
        import ctypes
        k32 = ctypes.windll.kernel32
        h = k32.OpenProcess(0x1000, False, pid)   # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        try:
            kod = ctypes.c_ulong()
            return bool(k32.GetExitCodeProcess(h, ctypes.byref(kod))) and kod.value == 259   # STILL_ACTIVE
        finally:
            k32.CloseHandle(h)
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


_eski_evler_silindi = False


def _eski_evleri_sil():
    """Çöken ya da zorla kapatılan çekirdeğin bıraktığı geçici ev klasörleri (pid'i artık çalışmayan) silinir; süreç başına bir kez."""
    global _eski_evler_silindi
    if _eski_evler_silindi:
        return
    _eski_evler_silindi = True
    try:
        kok = tempfile.gettempdir()
        for ad in os.listdir(kok):
            m = re.match(re.escape(EV_ONEKI) + r"(\d+)-", ad)
            if m and not _surec_yasiyor(int(m.group(1))):
                shutil.rmtree(os.path.join(kok, ad), ignore_errors=True)
    except OSError:
        pass


def _kisa_yol(yol):
    """Java 8'in komut satırına giden yol: Windows'un ANSI kod sayfasına sığmıyorsa kısa (8.3) adı (yoksa olduğu gibi)."""
    if not WINDOWS or not yol:
        return yol
    try:
        yol.encode("mbcs", "strict")
        return yol
    except UnicodeError:
        pass
    try:
        import ctypes
        f = ctypes.windll.kernel32.GetShortPathNameW
        tampon = ctypes.create_unicode_buffer(32768)
        n = f(yol, tampon, len(tampon))
        if 0 < n < len(tampon):
            return tampon.value
    except Exception:
        pass
    return yol


# ---------------------------------------------------------------- UDE'yi bulmak
def _ude_klasoru(yol, derinlik=0):
    """Verilen yoldan (klasör, exe, .ini, .app ya da içinde bir dosya) UDE'nin jar klasörü: editor_lib.jar'ın durduğu klasör; yoksa None.
    Alt klasörlere en çok 6 düzey (macOS .app'in içi, "C:\\Uyap" gibi üst klasör) bakılır."""
    if not yol:
        return None
    yol = os.path.abspath(os.path.expanduser(str(yol)))
    if os.path.isfile(yol):
        yol = os.path.dirname(yol)
    if not os.path.isdir(yol):
        return None
    if os.path.isfile(os.path.join(yol, "editor_lib.jar")):
        return yol
    if derinlik >= 6:
        return None
    try:
        altlar = sorted(os.listdir(yol))
    except OSError:
        return None
    # Önce adı UYAP / Java'ya benzeyen alt klasörler (büyük klasörlerde gezinme kısa sürsün)
    altlar.sort(key=lambda a: 0 if re.search(r"uyap|kelime|edit|java|contents|resources|app", a, re.I) else 1)
    for a in altlar[:40]:
        k = os.path.join(yol, a)
        if os.path.isdir(k) and not os.path.islink(k):
            bulunan = _ude_klasoru(k, derinlik + 1)
            if bulunan:
                return bulunan
    return None


def _komuttan_exe(komut):
    s = (komut or "").strip()
    if s.startswith('"'):
        exe = s[1:].split('"', 1)[0]
    else:
        exe = s.split()[0] if s.split() else ""
    return exe or None


def _kayitlardan():
    """Windows: .udf'nin ProgID kayıtlarındaki açma komutlarının exe klasörleri (en güvenilirden başlayarak)."""
    import winreg
    HKCR, HKLM, HKCU = winreg.HKEY_CLASSES_ROOT, winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER
    adlar = [_reg_oku(HKCU, DOSYA_ILISKISI + r"\UserChoiceLatest\ProgId", "ProgId"), _reg_oku(HKCU, DOSYA_ILISKISI + r"\UserChoice", "ProgId")]
    for kok, alt in ((HKCR, ".udf"), (HKLM, r"Software\Classes\.udf"), (HKCU, r"Software\Classes\.udf")):
        adlar.append(_reg_oku(kok, alt))
        adlar.extend(_reg_deger_adlari(kok, alt + r"\OpenWithProgids"))
    adlar.extend(BILINEN_PROGIDLER)
    gorulen, klasorler = set(), []
    for ad in adlar:
        if not ad or not ad.strip() or ad.lower() in gorulen:
            continue
        gorulen.add(ad.lower())
        for kok, on in ((HKCR, ""), (HKLM, "Software\\Classes\\"), (HKCU, "Software\\Classes\\")):
            exe = _komuttan_exe(_reg_oku(kok, on + ad + r"\shell\open\command"))
            if exe:
                klasorler.append(os.path.dirname(exe))
    return klasorler


def _kurulumdan():
    import winreg
    klasorler = []
    for kok, gorunum in ((winreg.HKEY_LOCAL_MACHINE, winreg.KEY_WOW64_64KEY), (winreg.HKEY_LOCAL_MACHINE, winreg.KEY_WOW64_32KEY),
                         (winreg.HKEY_CURRENT_USER, 0)):
        for alt in _reg_alt_anahtarlar(kok, KALDIRMA, gorunum):
            ad = (_reg_oku(kok, KALDIRMA + "\\" + alt, "DisplayName", gorunum) or "").lower()
            if ad.startswith("uyap") and ("kelime" in ad or "doküman" in ad or "dokuman" in ad):
                k = (_reg_oku(kok, KALDIRMA + "\\" + alt, "InstallLocation", gorunum) or "").strip().strip('"')
                if k:
                    klasorler.append(k)
    return klasorler


def _mac_adaylari():
    adaylar = []
    for kok in ("/Applications", os.path.expanduser("~/Applications")):
        try:
            for ad in sorted(os.listdir(kok)):
                if re.search(r"uyap|doküman|dokuman|kelime", ad, re.I):
                    adaylar.append(os.path.join(kok, ad))
        except OSError:
            pass
    return adaylar


def _ini_oku(klasor):
    """UDE'nin .ini dosyası (JSmooth / exe4j benzeri başlatıcı): {"Class Path": ..., "Preferred versions": ...}. 64 bitlik exe'ninki önce."""
    adaylar = []
    try:
        for ad in os.listdir(klasor):
            if ad.lower().endswith(".ini") and re.search(r"dok[uü]man", ad, re.I):
                adaylar.append(ad)
    except OSError:
        return {}
    adaylar.sort(key=lambda a: ("x86" in a.lower(), a))
    for ad in adaylar:
        try:
            with open(os.path.join(klasor, ad), "rb") as f:
                metin = f.read(64 * 1024).decode("cp1254", "replace")
        except OSError:
            continue
        d = {}
        for satir in metin.splitlines():
            if "=" in satir and not satir.startswith(("[", ";", "#")):
                k, v = satir.split("=", 1)
                d.setdefault(k.strip(), v.strip())
        if d:
            return d
    return {}


def _ude_bilgisi(klasor, kaynak):
    ini = _ini_oku(klasor)
    jarlar = []
    for parca in (ini.get("Class Path") or "").split(";"):
        parca = parca.strip().strip('"')
        if parca and parca.lower().endswith(".jar"):
            yol = parca if os.path.isabs(parca) else os.path.join(klasor, parca)
            if os.path.isfile(yol):
                jarlar.append(yol)
    if not jarlar or not any(os.path.basename(j).lower() == "editor_lib.jar" for j in jarlar):
        jarlar = [os.path.join(klasor, a) for a in sorted(os.listdir(klasor)) if a.lower().endswith(".jar")]
    exe, surum = None, None
    if WINDOWS:
        for ad in UDE_EXE_ADLARI:
            if os.path.isfile(os.path.join(klasor, ad)):
                exe = os.path.join(klasor, ad)
                break
        if exe is None:
            for ad in sorted(os.listdir(klasor)):
                a = ad.lower()
                if a.endswith(".exe") and "uyap" in a and ("doküman" in a or "dokuman" in a):
                    exe = os.path.join(klasor, ad)
                    break
        surum = _dosya_surumu(exe) if exe else None
    elif MAC:
        m = re.match(r"(.*?\.app)(/|$)", klasor)
        if m:
            try:
                import plistlib
                with open(os.path.join(m.group(1), "Contents", "Info.plist"), "rb") as f:
                    pl = plistlib.load(f)
                surum = pl.get("CFBundleShortVersionString") or pl.get("CFBundleVersion")
                exe = m.group(1)
            except Exception:
                pass
    tercih = []
    for v in (ini.get("Preferred versions") or "").split(";"):
        v = v.strip()
        if re.match(r"^\d+(\.\d+)?$", v):
            tercih.append(_ana_surum(v))
    return {"klasor": klasor, "jarlar": jarlar, "exe": exe, "surum": surum, "kaynak": kaynak, "javaTercihi": tercih,
            "itext": _itext_var(jarlar)}


def _itext_var(jarlar):
    """UDE'nin sınıf yolunda iText 2.1.7'nin PdfWriter'ı var mı (jar'ın içindekiler listesinden; JVM açılmaz)."""
    for j in jarlar:
        try:
            with zipfile.ZipFile(j) as z:
                z.getinfo("com/lowagie/text/pdf/PdfWriter.class")
                return True
        except (KeyError, OSError, zipfile.BadZipFile):
            continue
    return False


def ude_bul(elle=None):
    """UDE: {klasor, jarlar, exe, surum, kaynak ('ayar' | 'kayit' | 'kurulum' | 'varsayilan' | 'uygulamalar'), javaTercihi, itext} ya
    da None. elle: kullanıcının ayarlarda gösterdiği yol (önce o)."""
    adaylar = []
    if elle:
        adaylar.append((elle, "ayar"))
    if WINDOWS:
        adaylar += [(k, "kayit") for k in _kayitlardan()]
        adaylar += [(k, "kurulum") for k in _kurulumdan()]
        surucu = os.environ.get("SystemDrive") or "C:"
        adaylar.append((surucu + "\\Uyap\\Uyap Kelime Islemci", "varsayilan"))
    elif MAC:
        adaylar += [(k, "uygulamalar") for k in _mac_adaylari()]
    gorulen = set()
    for yol, kaynak in adaylar:
        anahtar = os.path.normcase(os.path.abspath(os.path.expanduser(yol)))
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        klasor = _ude_klasoru(yol)
        if klasor:
            return _ude_bilgisi(klasor, kaynak)
    return None


# ---------------------------------------------------------------- Java'yı bulmak
def _ana_surum(metin):
    """'1.8.0_361' → 8, '11.0.2' → 11, '1.8' → 8; okunamazsa None."""
    m = re.match(r"^\s*(\d+)(?:\.(\d+))?", metin or "")
    if not m:
        return None
    a = int(m.group(1))
    return int(m.group(2) or 0) if a == 1 else a


def _java_ev(java):
    """java(.exe)'nin JAVA_HOME'u (bin klasörünün üstü; bağlantı çözülerek)."""
    gercek = os.path.realpath(java)
    return os.path.dirname(os.path.dirname(gercek))


def _java_surumu(java):
    """(sürüm metni, 64 bit mi) — önce JAVA_HOME/release, yoksa klasör adı, yoksa `java -version` (penceresiz, 15 sn)."""
    ev = _java_ev(java)
    try:
        with open(os.path.join(ev, "release"), "r", encoding="utf-8", errors="replace") as f:
            metin = f.read(8192)
        m = re.search(r'JAVA_VERSION="([^"]+)"', metin)
        if m:
            mim = re.search(r'OS_ARCH="([^"]+)"', metin)
            bit64 = (mim.group(1) if mim else "") in ("amd64", "x86_64", "aarch64", "arm64") or ("(x86)" not in ev and not mim)
            return m.group(1), bit64
    except OSError:
        pass
    m = re.search(r"(?:jre|jdk)-?(1\.\d+\.\d+(?:_\d+)?|\d+(?:\.\d+)*)", os.path.basename(ev), re.I)
    if m and "javapath" not in java.lower():
        return m.group(1), "(x86)" not in ev
    try:
        r = subprocess.run([java, "-version"], capture_output=True, timeout=15, stdin=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW if WINDOWS else 0)
        metin = (r.stderr or b"").decode("utf-8", "replace") + (r.stdout or b"").decode("utf-8", "replace")
    except (OSError, subprocess.SubprocessError):
        return None, False
    m = re.search(r'version "([^"]+)"', metin)
    return (m.group(1) if m else None), "64-Bit" in metin


def _java_adaylari(ude):
    exe = "java.exe" if WINDOWS else "java"
    adaylar = []
    if ude:
        for alt in ("jre", "java", os.path.join("..", "jre")):
            adaylar.append(os.path.join(ude["klasor"], alt, "bin", exe))
    if WINDOWS:
        pfler = [p for p in (os.environ.get("ProgramFiles"), os.environ.get("ProgramW6432"), os.environ.get("ProgramFiles(x86)")) if p]
        for pf in dict.fromkeys(pfler):
            kl = os.path.join(pf, "Java")
            try:
                adlar = sorted(os.listdir(kl), key=_surum_sirasi, reverse=True)
            except OSError:
                adlar = []
            adaylar += [os.path.join(kl, a, "bin", exe) for a in adlar if re.match(r"^(jre|jdk)1\.8", a, re.I)]
        for pf in dict.fromkeys(pfler):
            adaylar.append(os.path.join(pf, "Common Files", "Oracle", "Java", "javapath", exe))
        if os.environ.get("JAVA_HOME"):
            adaylar.append(os.path.join(os.environ["JAVA_HOME"], "bin", exe))
        import winreg
        for gorunum in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
            for alt in (r"SOFTWARE\JavaSoft\Java Runtime Environment", r"SOFTWARE\JavaSoft\Java Development Kit", r"SOFTWARE\JavaSoft\JRE",
                        r"SOFTWARE\JavaSoft\JDK"):
                for s in sorted(_reg_alt_anahtarlar(winreg.HKEY_LOCAL_MACHINE, alt, gorunum), key=_surum_sirasi, reverse=True):
                    ev = _reg_oku(winreg.HKEY_LOCAL_MACHINE, alt + "\\" + s, "JavaHome", gorunum)
                    if ev:
                        adaylar.append(os.path.join(ev, "bin", exe))
        for pf in dict.fromkeys(pfler):
            for dag in ("Java", "Eclipse Adoptium", "Eclipse Foundation", "AdoptOpenJDK", "Zulu", "Amazon Corretto", "Microsoft", "BellSoft",
                        "Semeru", "OpenJDK"):
                kl = os.path.join(pf, dag)
                try:
                    adlar = sorted(os.listdir(kl), key=_surum_sirasi, reverse=True)
                except OSError:
                    continue
                for a in adlar:
                    adaylar.append(os.path.join(kl, a, "bin", exe))
                    adaylar.append(os.path.join(kl, a, "jre", "bin", exe))
        for kl in (os.environ.get("PATH") or "").split(os.pathsep):
            if kl.strip():
                adaylar.append(os.path.join(kl.strip().strip('"'), exe))
    elif MAC:
        # /usr/bin/java çağrılmaz: Java yoksa macOS kurulum penceresi açar
        adaylar.append("/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java")
        for kok in ("/Library/Java/JavaVirtualMachines", os.path.expanduser("~/Library/Java/JavaVirtualMachines")):
            try:
                adlar = sorted(os.listdir(kok), key=_surum_sirasi, reverse=True)
            except OSError:
                continue
            for a in adlar:
                adaylar.append(os.path.join(kok, a, "Contents", "Home", "bin", "java"))
                adaylar.append(os.path.join(kok, a, "Contents", "Home", "jre", "bin", "java"))
        if os.environ.get("JAVA_HOME"):
            adaylar.append(os.path.join(os.environ["JAVA_HOME"], "bin", "java"))
    else:
        if os.environ.get("JAVA_HOME"):
            adaylar.append(os.path.join(os.environ["JAVA_HOME"], "bin", "java"))
        adaylar += [os.path.join(k, "java") for k in (os.environ.get("PATH") or "").split(os.pathsep) if k]
    return adaylar


def _surum_sirasi(ad):
    return [int(x) for x in re.findall(r"\d+", ad)[:4]] or [0]


def java_bul(ude=None):
    """UDE'yi çalıştıracak Java: {yol, surum, ana, bit64} ya da None. Sürümü JAVA_EN_YUKSEK'ten büyük olanlar elenir; 8 önce, sonra UDE
    .ini dosyasındaki tercih sırası, sonra bulunma sırası."""
    gorulen, adaylar = set(), []
    for sira, yol in enumerate(_java_adaylari(ude)):
        if not yol or not os.path.isfile(yol):
            continue
        anahtar = os.path.normcase(os.path.realpath(yol))
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        surum, bit64 = _java_surumu(yol)
        ana = _ana_surum(surum)
        if ana is None or ana < 8 or ana > JAVA_EN_YUKSEK:
            continue
        adaylar.append((sira, yol, surum, ana, bit64))
        if ana == 8:
            break   # 8 bulundu: öteki adayların sürümü sorulmaz (`java -version` her biri ~0,2 sn)
    if not adaylar:
        return None
    tercih = (ude or {}).get("javaTercihi") or []

    def anahtar(a):
        sira, _, _, ana, _ = a
        return (ana != 8, tercih.index(ana) if ana in tercih else len(tercih), sira)
    _, yol, surum, ana, bit64 = min(adaylar, key=anahtar)
    return {"yol": yol, "surum": surum, "ana": ana, "bit64": bool(bit64)}


# ---------------------------------------------------------------- bulunanların ön belleği ve ayar
_bulma_kilidi = threading.RLock()
_ayar = {"udeYolu": None}
_bulunan = {"anahtar": object(), "zaman": 0.0, "ude": None, "java": None}


def ayar_uygula(p):
    """İstek parametrelerindeki ayarlar (donustur.ayar_kaydet): udeYolu (kullanıcının gösterdiği UDE yolu ya da null)."""
    if not isinstance(p, dict) or "udeYolu" not in p:
        return
    yol = p.get("udeYolu")
    yol = yol.strip() if isinstance(yol, str) and yol.strip() else None
    with _bulma_kilidi:
        _ayar["udeYolu"] = yol


def _hazirlik(yenile=False):
    """(ude, java) — ön bellekten; ayar değişince ya da bulunamayan BULMA_YENILE sn sonra yeniden aranır."""
    with _bulma_kilidi:
        anahtar = _ayar["udeYolu"]
        b = _bulunan
        eski = b["anahtar"] != anahtar
        bulunamadi = (b["ude"] is None or b["java"] is None) and time.monotonic() - b["zaman"] > BULMA_YENILE
        if yenile or eski or bulunamadi:
            ude = ude_bul(anahtar)
            java = java_bul(ude) if ude else None
            if ude and not os.path.isdir(ude["klasor"]):
                ude = None
            b.update(anahtar=anahtar, zaman=time.monotonic(), ude=ude, java=java)
        return b["ude"], b["java"]


def kopru_jari():
    """ude-kopru.jar: PDEFE_UDE_KOPRU, paketli uygulamada resources/ude-kopru/ (çekirdeğin klasörünün yanı), geliştirmede core/ude_kopru/."""
    adaylar = []
    if os.environ.get("PDEFE_UDE_KOPRU"):
        adaylar.append(os.environ["PDEFE_UDE_KOPRU"])
    if getattr(sys, "frozen", False):
        kaynaklar = os.path.dirname(os.path.dirname(os.path.abspath(sys.executable)))   # resources/pdefe-core/pdefe-core.exe → resources
        adaylar.append(os.path.join(kaynaklar, "ude-kopru", KOPRU_JAR))
    adaylar.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ude_kopru", KOPRU_JAR))
    for a in adaylar:
        if a and os.path.isfile(a):
            return a
    return None


def _durum():
    """(ude, java, jar, neden | None): UDF → PDF'in bu bilgisayarda yapılıp yapılamayacağı."""
    ude, java = _hazirlik()
    jar = kopru_jari()
    if ude is None:
        return ude, java, jar, UDE_YOK
    if java is None:
        return ude, java, jar, JAVA_YOK
    if jar is None:
        return ude, java, jar, "PDEfe'nin UYAP Doküman Editörü köprüsü (ude-kopru.jar) bulunamadı."
    if not ude["itext"] and not WINDOWS:
        return ude, java, jar, "UYAP Doküman Editörü'nün PDF kitaplığı bulunamadı."
    return ude, java, jar, None


def _udf_hazir():
    _, _, _, neden = _durum()
    return (neden is None), neden


def yetenek():
    ude, java, jar, neden = _durum()
    kip = None
    if neden is None:
        kip = "pdf" if ude["itext"] else ("yazici" if WINDOWS else None)
    s = {"var": neden is None, "ude": {"var": ude is not None, "yol": ude["klasor"] if ude else None, "surum": ude["surum"] if ude else None,
                                       "kaynak": ude["kaynak"] if ude else None},
         "java": {"var": java is not None, "yol": java["yol"] if java else None, "surum": java["surum"] if java else None},
         "kip": kip, "pdfdenUdf": ("pdf", "udf") in donustur._DONUSTURUCULER, "udeYolu": _ayar["udeYolu"]}
    if neden:
        s["neden"] = neden
    return s


# ---------------------------------------------------------------- köprü süreci
class KopruHatasi(Exception):
    def __init__(self, tur, mesaj):
        super().__init__(mesaj)
        self.tur = tur


def _yazi_tipi_klasorleri():
    k = []
    if WINDOWS:
        k.append(os.path.join(os.environ.get("WINDIR") or os.environ.get("SystemRoot") or "C:\\Windows", "Fonts"))
        if os.environ.get("LOCALAPPDATA"):
            k.append(os.path.join(os.environ["LOCALAPPDATA"], "Microsoft", "Windows", "Fonts"))   # kullanıcının kurduğu yazı tipleri
    elif MAC:
        k += ["/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts", os.path.expanduser("~/Library/Fonts"),
              "/Applications/Microsoft Word.app/Contents/Resources/DFonts"]
    else:
        k += ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts")]
    return [x for x in k if os.path.isdir(x)]


class _Oturum:
    """Köprünün bir JVM'i (sunucu kipi). Tek iş parçacığından kullanılır (dönüştürme ya da ön izleme)."""

    def __init__(self, ude, java, jar, iptal_mi=None):
        self.ude, self.java = ude, java
        self.belge = 0
        self.son = time.monotonic()
        _eski_evleri_sil()
        self.ev = tempfile.mkdtemp(prefix="%s%d-" % (EV_ONEKI, os.getpid()))
        os.makedirs(os.path.join(self.ev, "tmp"), exist_ok=True)
        self._satirlar = queue.Queue()
        self._hata_dosyasi = os.path.join(self.ev, "java-hata.txt")
        ev = _kisa_yol(self.ev)
        ayrac = ";" if WINDOWS else ":"
        sinif_yolu = ayrac.join([_kisa_yol(jar)] + [_kisa_yol(j) for j in ude["jarlar"]])
        komut = [_kisa_yol(java["yol"]), "-Djava.awt.headless=true", "-Xmx%dm" % (2048 if java.get("bit64") else 1024),
                 "-Dsun.java2d.uiScale=1", "-Duser.home=" + ev, "-Djava.io.tmpdir=" + os.path.join(ev, "tmp"), "-Dpdefe.ev=" + ev,
                 "-Dpdefe.gunluk=" + os.path.join(ev, "ude-gunluk.txt"),
                 "-Dpdefe.yazitipleri=" + os.pathsep.join(_kisa_yol(k) for k in _yazi_tipi_klasorleri())]
        if MAC:
            komut.append("-Dapple.awt.UIElement=true")   # Dock'ta simge çıkmasın
        komut += ["-cp", sinif_yolu, "pdefe.UdeKopru", "sunucu"]
        ortam = {k: v for k, v in os.environ.items() if k.upper() not in TEMIZLENEN_ORTAM}
        self._hata_akisi = open(self._hata_dosyasi, "wb")
        try:
            self.p = subprocess.Popen(komut, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self._hata_akisi, cwd=self.ev, env=ortam,
                                      creationflags=subprocess.CREATE_NO_WINDOW if WINDOWS else 0)
        except OSError as e:
            self._hata_akisi.close()
            _sil_klasor(self.ev)
            raise KopruHatasi("baslatma", "Java başlatılamadı (%s): %s" % (java["yol"], e))
        threading.Thread(target=self._oku, name="ude-kopru-okuyucu", daemon=True).start()
        try:
            bas = self._bekle(lambda m: "hazir" in m, BASLAMA_SURESI, iptal_mi)
        except BaseException:
            self.kapat()
            raise
        if not bas.get("hazir"):
            self.kapat()
            raise KopruHatasi(bas.get("tur") or "surum", bas.get("hata") or "UYAP Doküman Editörü köprüsü başlamadı.")
        self.itext = bool(bas.get("itext"))
        self.itext_hatasi = bas.get("itextHatasi")
        self.java_surumu = bas.get("java")

    def _oku(self):
        try:
            for satir in self.p.stdout:
                try:
                    self._satirlar.put(json.loads(satir.decode("utf-8", "replace")))
                except ValueError:
                    pass
        except (OSError, ValueError):
            pass
        self._satirlar.put(None)

    def calisiyor(self):
        return self.p.poll() is None

    def _hata_kuyrugu(self):
        try:
            self._hata_akisi.flush()
            with open(self._hata_dosyasi, "rb") as f:
                f.seek(0, 2)
                f.seek(max(0, f.tell() - 1500))
                return f.read().decode("utf-8", "replace").strip()
        except OSError:
            return ""

    def _bekle(self, kosul, sure, iptal_mi=None, ilerleme=None):
        """kosul(mesaj) doğru olan ilk satıra dek okur; ilerleme satırlarını ilerleme(i, n)'ye verir. Süre dolunca TimeoutError, iptalde
        IptalEdildi (iptal_mi fırlatır), süreç ölünce KopruHatasi."""
        son = time.monotonic() + sure
        while True:
            if iptal_mi is not None:
                iptal_mi()
            kalan = son - time.monotonic()
            if kalan <= 0:
                raise TimeoutError("UYAP Doküman Editörü %d saniyede yanıt vermedi." % sure)
            try:
                m = self._satirlar.get(timeout=min(0.25, kalan))
            except queue.Empty:
                continue
            if m is None:
                kuyruk = self._hata_kuyrugu()
                raise KopruHatasi("olumcul", "UYAP Doküman Editörü köprüsü beklenmedik biçimde kapandı" + (": " + kuyruk[-400:] if kuyruk else "."))
            if "ilerleme" in m and ilerleme is not None:
                try:
                    ilerleme(int(m["ilerleme"]), int(m.get("toplam") or 1))
                except (TypeError, ValueError):
                    pass
                continue
            if kosul(m):
                return m

    def is_(self, komut, alanlar, sure, iptal_mi=None, ilerleme=None):
        """Bir iş gönderir, sonucunu bekler. Döner: sonuç satırı ({tamam: true, ...}); köprü hatası KopruHatasi(tur)."""
        for a in alanlar:
            if any(c in str(a) for c in "\t\r\n"):
                raise OgeHatasi("gecersiz", "Dosya yolunda sekme ya da satır sonu var; dönüştürülemez.")
        self.belge += 1
        no = str(self.belge)
        try:
            self.p.stdin.write(("\t".join([no, komut] + [str(a) for a in alanlar]) + "\n").encode("utf-8"))
            self.p.stdin.flush()
        except (OSError, ValueError):
            raise KopruHatasi("olumcul", "UYAP Doküman Editörü köprüsüne yazılamadı: " + self._hata_kuyrugu()[-400:])
        try:
            m = self._bekle(lambda m: m.get("no") == no and ("tamam" in m or "hata" in m), sure, iptal_mi, ilerleme)
        finally:
            self.son = time.monotonic()
        if m.get("tamam"):
            return m
        raise KopruHatasi(m.get("tur") or "hata", m.get("hata") or "UYAP Doküman Editörü belgeyi çizemedi.")

    def kapat(self):
        p = getattr(self, "p", None)
        if p is not None and p.poll() is None:
            try:
                p.stdin.write(b"cikis\n")
                p.stdin.flush()
                p.stdin.close()
            except (OSError, ValueError):
                pass
            try:
                p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                donustur._surec_oldur(p)
        elif p is not None:
            try:
                p.stdin.close()
            except (OSError, ValueError):
                pass
        try:
            self._hata_akisi.close()
        except (OSError, AttributeError):
            pass
        _sil_klasor(self.ev)

    def oldur(self):
        p = getattr(self, "p", None)
        if p is not None:
            donustur._surec_oldur(p)
        self.kapat()


class _Oturumlar:
    """Amaç başına (dönüştürme, ön izleme) tek oturum; bekçi iş parçacığı boştakini kapatır."""

    def __init__(self):
        self._kilit = threading.Lock()
        self._oturumlar = {}
        self._kullanimda = set()
        self._bekci = None

    def al(self, amac, iptal_mi=None):
        ude, java, jar, neden = _durum()
        if neden:
            raise OgeHatasi("desteklenmiyor", neden)
        with self._kilit:
            o = self._oturumlar.pop(amac, None)
            self._kullanimda.add(amac)
        if o is not None and (not o.calisiyor() or o.belge >= OTURUM_BELGE or o.ude["klasor"] != ude["klasor"] or o.java["yol"] != java["yol"]):
            o.kapat()
            o = None
        if o is None:
            try:
                o = _Oturum(ude, java, jar, iptal_mi)
            except BaseException:
                with self._kilit:
                    self._kullanimda.discard(amac)
                raise
        return o

    def birak(self, amac, o, saglam=True):
        with self._kilit:
            self._kullanimda.discard(amac)
            if saglam and o.calisiyor():
                eski = self._oturumlar.pop(amac, None)
                self._oturumlar[amac] = o
            else:
                eski = o
            if self._bekci is None:
                self._bekci = threading.Thread(target=self._bekle, name="ude-kopru-bekci", daemon=True)
                self._bekci.start()
        if eski is not None and eski is not self._oturumlar.get(amac):
            eski.oldur() if not saglam else eski.kapat()

    def _bekle(self):
        while True:
            time.sleep(5)
            kapanacak = []
            with self._kilit:
                for amac, o in list(self._oturumlar.items()):
                    if amac not in self._kullanimda and time.monotonic() - o.son > BOSTA_KAPAT:
                        kapanacak.append(self._oturumlar.pop(amac))
            for o in kapanacak:
                o.kapat()

    def hepsini_kapat(self):
        with self._kilit:
            hepsi = list(self._oturumlar.values())
            self._oturumlar.clear()
        for o in hepsi:
            o.kapat()


_oturumlar = _Oturumlar()


def kapanirken():
    """Çekirdek kapanırken (donustur.kapanirken; yorumlayıcı çıkarken de): boştaki köprü süreçleri kapatılır, geçici klasörleri silinir."""
    _oturumlar.hepsini_kapat()


import atexit  # noqa: E402
atexit.register(kapanirken)


def _belge_suresi(yol):
    try:
        mb = os.path.getsize(yol) / (1024.0 * 1024.0)
    except OSError:
        mb = 0
    return BELGE_SURESI + BELGE_SURESI_MB * mb


def _kopru_isi(amac, komut, alanlar, sure, iptal_mi=None, ilerleme=None):
    """Köprüde bir iş: oturumu alır, işi yapar, oturumu bırakır (ölümcül hata, süre aşımı ya da iptalde süreç öldürülür)."""
    o = _oturumlar.al(amac, iptal_mi)
    saglam = False
    try:
        r = o.is_(komut, alanlar, sure, iptal_mi, ilerleme)
        saglam = True
        return r, o
    except KopruHatasi as e:
        saglam = e.tur not in ("olumcul",)
        raise
    finally:
        _oturumlar.birak(amac, o, saglam)


# ---------------------------------------------------------------- UDF içeriği (UDE'siz, hızlı)
MEDYA = {"1": (595.28, 841.89), "2": (419.53, 595.28), "3": (612.0, 792.0), "4": (515.91, 728.5), "5": (612.0, 1008.0), "6": (522.0, 756.0)}
_SAYFA_BICIMI = re.compile(rb"<pageFormat\b([^>]*)>")
_OZNITELIK = re.compile(rb'([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"')


def udf_ozeti(yol, alt):
    """UDF'nin hızlı özeti (UDE'siz): {genislik, yukseklik (pt), yatay, kenarlar?, imzali, formatId?}. content.xml'in yalnızca baş kısmı
    okunur (pageFormat ve format_id orada; resimler sonra gelir)."""
    imzali = False
    if alt == "zip":
        with zipfile.ZipFile(yol) as zf:
            adlar = set(zf.namelist())
            imzali = "sign.sgn" in adlar or any(a.lower().endswith(".p7s") for a in adlar)
            bas = donustur.zip_oku(zf, "content.xml", 256 * 1024, kes=True)
    else:
        with open(yol, "rb") as f:
            bas = f.read(256 * 1024)
    s = {"imzali": imzali}
    m = re.search(rb'format_id\s*=\s*"([^"]*)"', bas)
    if m:
        s["formatId"] = m.group(1).decode("ascii", "replace")
    m = _SAYFA_BICIMI.search(bas)
    oz = {k.decode("ascii"): v.decode("utf-8", "replace") for k, v in _OZNITELIK.findall(m.group(1))} if m else {}
    g, y = MEDYA.get(oz.get("mediaSizeName", "1"), MEDYA["1"])
    yatay = oz.get("paperOrientation") in ("0", "2")
    if yatay:
        g, y = y, g
    s.update(genislik=g, yukseklik=y, yatay=yatay)
    kenar = {}
    for ad, k in (("sol", "leftMargin"), ("sag", "rightMargin"), ("ust", "topMargin"), ("alt", "bottomMargin")):
        try:
            kenar[ad] = round(float(oz[k]), 2)
        except (KeyError, ValueError):
            pass
    if kenar:
        s["kenarlar"] = kenar
    return s


# ---------------------------------------------------------------- UDF → PDF
def _udf_pdf(kaynak, cikti, secenekler, ilerleme, baglam):
    kip = secenekler.get("kip") or "otomatik"
    if kip not in ("otomatik", "pdf", "yazici"):
        raise OgeHatasi("gecersiz", "Bilinmeyen çizim kipi: %r" % (kip,))
    ad = os.path.basename(kaynak)
    sure = _belge_suresi(kaynak)
    iptal_mi = baglam.denetle

    def il(i, n):
        ilerleme(i / max(n, 1), "Sayfa %d/%d" % (i, n))
    ilerleme(0, "UYAP Doküman Editörü hazırlanıyor…")
    uyarilar = []
    cizim = None
    sonuc = None
    try:
        if kip in ("otomatik", "pdf"):
            try:
                sonuc, _ = _kopru_isi("donustur", "pdf", [kaynak, cikti, "1"], sure, iptal_mi, il)
                cizim = "ude"
            except KopruHatasi as e:
                if kip == "pdf" or not WINDOWS or e.tur in ("yukleme", "bos", "surum", "baslatma"):
                    raise
                print("[udf] PDF kitaplığıyla çizilemedi, yazıcıya geçiliyor: %s" % e, file=sys.stderr)
                uyarilar.append("UYAP Doküman Editörü'nün PDF kitaplığı kullanılamadı; belge Windows'un PDF yazıcısıyla çizildi. Bazı sayfalar "
                                "resim olarak çıkabilir (yazısı seçilemez).")
        if cizim is None:
            if not WINDOWS:
                raise OgeHatasi("desteklenmiyor", "Yazıcı yolu yalnızca Windows'ta var.")
            araclar_sil(cikti)
            sonuc, _ = _kopru_isi("donustur", "yazici", [kaynak, cikti, VARSAYILAN_YAZICI, "1"], sure, iptal_mi, il)
            cizim = "yazici"
    except KopruHatasi as e:
        if e.tur == "yukleme":
            raise OgeHatasi("bozuk", "UYAP Doküman Editörü belgeyi açamadı: %s" % ad)
        if e.tur == "bos":
            raise OgeHatasi("bozuk", "Belgede sayfa yok: %s" % ad)
        if e.tur in ("surum", "itext_yok"):
            raise OgeHatasi("desteklenmiyor", "Bu bilgisayardaki UYAP Doküman Editörü'nün yapısı PDEfe'nin tanıdığından farklı (%s). "
                            "UYAP Doküman Editörü güncellenmiş olabilir." % e)
        if e.tur == "yazici_yok":
            raise OgeHatasi("desteklenmiyor", "Windows'un PDF yazıcısı (%s) bulunamadı." % VARSAYILAN_YAZICI)
        if e.tur == "olumcul" and "OutOfMemory" in str(e):
            raise MemoryError()
        raise OgeHatasi("hata", "%s dönüştürülemedi: %s" % (ad, e))
    # Çıktının denetimi: PDF açılıyor mu, sayfa sayısı köprününkiyle aynı mı
    with baglam.mupdf():
        try:
            doc = pymupdf.open(cikti, filetype="pdf")
        except Exception as e:
            raise OgeHatasi("hata", "Üretilen PDF açılamadı (%s): %s" % (ad, e))
        try:
            n = doc.page_count
            metinsiz = sum(1 for pg in doc if not pg.get_text("text").strip()) if cizim == "yazici" else 0
        finally:
            doc.close()
    if n != int(sonuc.get("sayfa") or n):
        raise OgeHatasi("hata", "Üretilen PDF'in sayfa sayısı UYAP Doküman Editörü'nünkinden farklı: %s" % ad)
    if cizim == "yazici" and metinsiz:
        uyarilar.append("%d sayfa resim olarak çizildi (yazısı seçilemez)." % metinsiz)
    try:
        if udf_ozeti(kaynak, baglam.alt or ("zip" if zipfile.is_zipfile(kaynak) else "xml")).get("imzali"):
            uyarilar.append("Belgedeki e-imza PDF'e taşınmaz.")
    except Exception:
        pass
    r = {"sayfa": n, "cizim": cizim}
    if uyarilar:
        r["uyari"] = " ".join(uyarilar)
    return r


def araclar_sil(yol):
    try:
        if yol and os.path.exists(yol):
            os.remove(yol)
    except OSError:
        pass


# ---------------------------------------------------------------- ön izleme (donusum_bilgi)
_onizleme_kuyrugu = queue.Queue()
_onizleme_is_parcacigi = None
_onizleme_kilidi = threading.Lock()
_onizleme_onbellek = collections.OrderedDict()


def _onizleme_anahtari(yol, genislik):
    st = os.stat(yol)
    return (os.path.normcase(os.path.abspath(yol)), st.st_mtime_ns, st.st_size, int(genislik), _ayar["udeYolu"])


def _onizleme_dongu():
    while True:
        yol, genislik, anahtar, iptal_mi, bitir = _onizleme_kuyrugu.get()
        try:
            ek = _onizleme_yap(yol, genislik, anahtar, iptal_mi)
        except _cekirdek().IptalEdildi:
            ek = None
        except Exception as e:   # ön izleme alınamazsa bilgi yine döner, uyarıyla
            print("[udf] ön izleme alınamadı: %r" % e, file=sys.stderr)
            ek = {"onizlemeUyarisi": "Ön izleme alınamadı: %s" % _kisa_ileti(e)}
        try:
            bitir(ek)
        except Exception as e:
            print("[udf] ön izleme yanıtı yazılamadı: %s" % e, file=sys.stderr)


def _kisa_ileti(e):
    m = str(e) or type(e).__name__
    return m if len(m) < 300 else m[:300] + "…"


def _onizleme_yap(yol, genislik, anahtar, iptal_mi):
    with _onizleme_kilidi:
        k = _onizleme_onbellek.get(anahtar)
        if k is not None:
            _onizleme_onbellek.move_to_end(anahtar)
            return dict(k)
    try:
        r, _ = _kopru_isi("onizleme", "bilgi", [yol, int(genislik)], _belge_suresi(yol), iptal_mi)
    except KopruHatasi as e:
        if e.tur == "yukleme":
            return {"onizlemeUyarisi": "UYAP Doküman Editörü belgeyi açamadı.", "acilmadi": True}
        raise
    ek = {"sayfa": r.get("sayfa")}
    boylar = r.get("boylar") or []
    if boylar:
        ek["genislik"], ek["yukseklik"] = boylar[0][0], boylar[0][1]
    if r.get("png"):
        ek.update(png=r["png"], pngGenislik=r.get("pngGenislik"), pngYukseklik=r.get("pngYukseklik"))
    with _onizleme_kilidi:
        _onizleme_onbellek[anahtar] = dict(ek)
        while len(_onizleme_onbellek) > ONIZLEME_ONBELLEK:
            _onizleme_onbellek.popitem(last=False)
    return ek


def _onizleme_baslat(yol, genislik, iptal_mi, bitir):
    global _onizleme_is_parcacigi
    anahtar = _onizleme_anahtari(yol, genislik)
    with _onizleme_kilidi:
        k = _onizleme_onbellek.get(anahtar)
        if _onizleme_is_parcacigi is None:
            _onizleme_is_parcacigi = threading.Thread(target=_onizleme_dongu, name="udf-onizleme", daemon=True)
            _onizleme_is_parcacigi.start()
    if k is not None:
        bitir(dict(k))
        return
    _onizleme_kuyrugu.put((yol, genislik, anahtar, iptal_mi, bitir))


def _udf_bilgi(yol, alt, genislik, p=None):
    s = {"udfAlt": alt}
    s.update(udf_ozeti(yol, alt))
    s["sayfa"] = None
    if s.get("imzali"):
        s["uyari"] = "Belge e-imzalı; imza dönüştürülen dosyaya taşınmaz."
    p = p or {}
    if p.get("onizleme") is False:
        return s
    ok, neden = _udf_hazir()
    if not ok:
        s["onizlemeUyarisi"] = neden
        return s
    iptal_mi = p.get("_iptal_mi") if callable(p.get("_iptal_mi")) else None

    def denetle():
        if iptal_mi is not None and iptal_mi():
            raise _cekirdek().IptalEdildi()
    s[donustur.ERTELE] = lambda bitir: _onizleme_baslat(yol, genislik, denetle, bitir)
    return s


def _yetenek():
    return yetenek()


def kaydol(yontemler):
    """Dönüştürücüler donustur'un çatısına modül yüklenirken kaydolur; burada yöntem eklenmez (donustur.kaydol ekler)."""
    return None


donustur.donusturucu_kaydet("udf", "pdf", _udf_pdf, _udf_hazir)
donustur.yetenek_kaydet("udf", _yetenek)
donustur.bilgi_kaydet("udf", _udf_bilgi)
donustur.ayar_kaydet(ayar_uygula)
donustur.kapanis_kaydet(kapanirken)
