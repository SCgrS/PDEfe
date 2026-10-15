# -*- coding: utf-8 -*-
"""core/islemler/donustur.py testi (0.2.6, dosya biçimi dönüştürme: çatı + TIFF ↔ PDF). Girdilerin hepsi burada üretilir (gerçek belge
kullanılmaz); çıktılar test/cikti/donustur altında.

Çalıştırma:  .venv\\Scripts\\python.exe test\\donustur_testi.py [--exe core\\dist\\pdefe-core\\pdefe-core.exe] [--hizli]
--exe: yöntemler paketlenmiş çekirdek üzerinden JSON-RPC ile çağrılır (modülün içine bakan denetimler atlanır).
--hizli: 150 sayfalık akış ve bellek ölçümü atlanır.
Denetlenenler: imzadan tür tespiti; MuPDF'e yalnızca PDF; TIFF → PDF sayfa ölçüsü (±1 pt), filtre (G4 / Flate), kendi dpi'ında piksel
eşitliği, siyah piksel sayısı (polarite; pdf.js de aynı çözer); PDF → TIFF kare sayısı, G4, dpi etiketi, taranmış sayfada gidiş-dönüş,
yazı tanıma F1 ≥ 0,97 (Windows'un tanıyıcısı varsa); 150 sayfada süre ve tepe bellek; iptal (iş başlamadan, ortasında, toplu işte, çekirdek
kapanırken), iptal bayrağının ertelenmiş işte korunması; kilitli / salt okunur hedef; parametre denetimi; zip bombası; dış süreç.
"""
import contextlib
import hashlib
import io
import json
import math
import os
import queue
import random
import shutil
import stat
import struct
import subprocess
import sys
import threading
import time
import zipfile

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORE = os.environ.get("PDEFE_TEST_CEKIRDEK") or os.path.join(KOK, "core")   # sürümleri karşılaştırmak için başka bir core/ klasörü
sys.path.insert(0, CORE)
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
from PIL import Image, ImageChops, ImageDraw, ImageFont, TiffImagePlugin  # noqa: E402

CIKTI = os.path.join(KOK, "test", "cikti", "donustur")
GIRDI = os.path.join(CIKTI, "girdi")
WINDOWS = sys.platform == "win32"
A4 = (595.276, 841.890)
hata = toplam = 0


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if not ayrinti else " — " + str(ayrinti)))


def atlandi(ad, neden):
    print("ATLANDI " + ad + " — " + neden)


# ---------------------------------------------------------------- çağrı köprüsü
class CagriHatasi(Exception):
    def __init__(self, mesaj, kod=None):
        super().__init__(mesaj)
        self.kod = kod


class Cagirici:
    """Doğrudan (modül) ya da exe üzerinden JSON-RPC. Ertelenmiş yanıtı (bicim_donustur) bekler. iptal_sonra=N: N. ilerleme
    bildiriminden sonra iptal (modülde params['_iptal_mi'], exe'de 'iptal' isteği)."""

    def __init__(self, exe=None):
        self.exe = exe
        self.sayac = 0
        if exe:
            self.surec = subprocess.Popen([exe], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                                          encoding="utf-8", bufsize=1)
        else:
            import pdefe_core
            self.cekirdek = pdefe_core

    def cagir(self, yontem, params, iptal_sonra=None, sure=300):
        ilerlemeler = []
        if self.exe:
            self.sayac += 1
            kimlik = self.sayac
            self.surec.stdin.write(json.dumps({"id": kimlik, "method": yontem, "params": params}, ensure_ascii=False) + "\n")
            self.surec.stdin.flush()
            while True:
                satir = self.surec.stdout.readline()
                if not satir:
                    raise RuntimeError("exe kapandı")
                m = json.loads(satir)
                if m.get("id") != kimlik:
                    continue
                if "progress" in m:
                    ilerlemeler.append(m["progress"])
                    if iptal_sonra is not None and len(ilerlemeler) == iptal_sonra:
                        self.sayac += 1
                        self.surec.stdin.write(json.dumps({"id": self.sayac, "method": "iptal", "params": {"id": kimlik}}) + "\n")
                        self.surec.stdin.flush()
                    continue
                if "error" in m:
                    raise CagriHatasi(m["error"]["message"], m["error"].get("code"))
                return m["result"], ilerlemeler
        p = dict(params)
        p["_ilerleme"] = lambda y, m="": ilerlemeler.append({"yuzde": y, "mesaj": m})
        p["_iptal_mi"] = lambda: iptal_sonra is not None and len(ilerlemeler) >= iptal_sonra
        try:
            r = self.cekirdek.YONTEMLER[yontem](p)
        except self.cekirdek.IptalEdildi:
            raise CagriHatasi("İşlem iptal edildi.", -32800)
        except Exception as e:
            raise CagriHatasi(str(e), -32000)
        if isinstance(r, self.cekirdek.Ertelenmis):
            olay, kutu = threading.Event(), {}
            r.baslat(lambda s, h: (kutu.update(s=s, h=h), olay.set()))
            if not olay.wait(sure):
                raise RuntimeError("ertelenmiş yanıt gelmedi")
            if kutu["h"] is not None:
                h = kutu["h"]
                raise CagriHatasi(str(h) or "İşlem iptal edildi.", -32800 if isinstance(h, (self.cekirdek.IptalEdildi, InterruptedError)) else -32000)
            r = kutu["s"]
        return r, ilerlemeler

    def kapat(self):
        if self.exe:
            self.surec.stdin.close()
            self.surec.wait(timeout=15)


class Surec:
    """Ayrı çekirdek süreci (betik ya da exe) ve satır okuyucusu: zaman aşımlı okuma, istek sırasının gözlenmesi."""

    def __init__(self, exe=None):
        komut = [exe] if exe else [sys.executable, "-X", "utf8", os.path.join(CORE, "pdefe_core.py")]
        self.p = subprocess.Popen(komut, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  env=dict(os.environ, PYTHONIOENCODING="utf-8"))
        self.satirlar = queue.Queue()
        threading.Thread(target=self._oku, daemon=True).start()

    def _oku(self):
        for satir in self.p.stdout:
            try:
                self.satirlar.put(json.loads(satir.decode("utf-8")))
            except ValueError:
                pass
        self.satirlar.put(None)

    def yaz(self, *istekler):
        self.p.stdin.write(b"".join(json.dumps(i, ensure_ascii=False).encode("utf-8") + b"\n" for i in istekler))
        self.p.stdin.flush()

    def bekle(self, kosul, sure=120):
        """kosul(mesaj) doğru olan ilk mesaja dek okur; okunanları da döner."""
        okunan, son = [], time.time() + sure
        while time.time() < son:
            try:
                m = self.satirlar.get(timeout=max(0.05, son - time.time()))
            except queue.Empty:
                break
            if m is None:
                break
            okunan.append(m)
            if kosul(m):
                return m, okunan
        return None, okunan

    def kapat(self, sure=15):
        try:
            self.p.stdin.close()
        except OSError:
            pass
        try:
            self.p.wait(timeout=sure)
        except subprocess.TimeoutExpired:
            self.p.kill()


# ---------------------------------------------------------------- girdi üretimi
YAZI_TIPI = r"C:\Windows\Fonts\times.ttf" if WINDOWS else "/System/Library/Fonts/Supplemental/Times New Roman.ttf"
HARFLER = "abcçdefgğhıijklmnoöprsştuüvyzABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ0123456789.,"


def metin_karesi(g, h, tohum, kip="1"):
    """Taranmış yazıya benzeyen kare: beyaz zeminde rastgele sözcük satırları (1 bitte yumuşatmasız). Yazı tipi yoksa sözcük kadar
    dikdörtgenler (o zaman Flate G4'ten küçük çıkabilir; filtre denetimi ikisinin küçüğüne bakar)."""
    im = Image.new(kip, (g, h), 1 if kip == "1" else 255)
    d = ImageDraw.Draw(im)
    r = random.Random(tohum)
    boyut = max(8, int(h / 69))   # 200 dpi A4'te 34 px ≈ 12 pt
    try:
        yazi = ImageFont.truetype(YAZI_TIPI, boyut)
        if kip == "1":
            d.fontmode = "1"
    except OSError:
        yazi = None
    y = int(h * 0.06)
    while y < h * 0.92:
        if yazi is not None:
            d.text((int(g * 0.09), y), " ".join("".join(r.choice(HARFLER) for _ in range(r.randint(2, 10))) for _ in range(14)), fill=0, font=yazi)
        else:
            x = int(g * 0.09)
            while x < g * 0.88:
                w = r.randint(max(2, int(g * 0.02)), max(3, int(g * 0.09)))
                d.rectangle((x, y, x + w, y + max(1, int(boyut * 0.6))), fill=0)
                x += w + max(1, int(g * 0.012))
        y += int(boyut * 1.5)
    return im


def kucuk_filtre(kare):
    """1 bit karenin PDF'te beklenen filtresi: tek şerit G4 ile Flate'ten (düzey 6) küçüğü (donustur._tiff_pdf'in kuralı)."""
    import zlib
    buf = io.BytesIO()
    kare.save(buf, "TIFF", compression="group4", strip_size=((kare.width + 7) // 8) * kare.height)
    buf.seek(0)
    with Image.open(buf) as t:
        g4 = t.tag_v2[279][0]
    return "/CCITTFaxDecode" if g4 < len(zlib.compress(kare.tobytes(), 6)) else "/FlateDecode"


def tiff_yaz(yol, kareler):
    """kareler: [(Image, save seçenekleri)]: çok sayfalı TIFF, kare kare (karışık sıkıştırma)."""
    with TiffImagePlugin.AppendingTiffWriter(yol, new=True) as tf:
        for im, secenek in kareler:
            im.save(tf, format="TIFF", **secenek)
            tf.newFrame()
    return yol


def beyaz_sifir_tiff(yol, im):
    """Sıkıştırmasız, fotometrik 0 (WhiteIsZero: bit 1 = siyah) tek sayfalık TIFF: Pillow 1 bit kareyi bu fotometrikle yazmıyor."""
    g, h = im.size
    veri = im.tobytes().translate(bytes(range(255, -1, -1)))   # Pillow "1": bit 1 = beyaz; ters çevrilir
    n = 9
    ofs = 8 + 2 + 12 * n + 4

    def uzun(etiket, deger):
        return struct.pack("<HHII", etiket, 4, 1, deger)

    def kisa(etiket, deger):
        return struct.pack("<HHIHH", etiket, 3, 1, deger, 0)
    ifd = [uzun(256, g), uzun(257, h), kisa(258, 1), kisa(259, 1), kisa(262, 0), uzun(273, ofs), kisa(277, 1), uzun(278, h),
           uzun(279, len(veri))]
    with open(yol, "wb") as f:
        f.write(b"II*\x00" + struct.pack("<I", 8) + struct.pack("<H", n) + b"".join(ifd) + struct.pack("<I", 0) + veri)
    return yol


def siyah(im):
    """Siyah piksel sayısı (1 bit ya da gri: 128'den koyu)."""
    gri = im.convert("L") if im.mode != "L" else im
    return sum(gri.histogram()[:128])


def ayni(a, b):
    """İki görüntü piksel piksel aynı mı (ölçü ve değer)."""
    if a.size != b.size:
        return False
    kip = "RGB" if "RGB" in (a.mode, b.mode) else "L"
    return ImageChops.difference(a.convert(kip), b.convert(kip)).getbbox() is None


def pdf_sayfa_goruntusu(yol, no, g_px, y_px, renkli=False):
    """PDF sayfasını tam g_px × y_px çizer (kendi çözünürlüğünde: ölçek = piksel / pt)."""
    d = pymupdf.open(yol, filetype="pdf")
    try:
        pg = d[no]
        pix = pg.get_pixmap(matrix=pymupdf.Matrix(g_px / pg.rect.width, y_px / pg.rect.height),
                            colorspace=pymupdf.csRGB if renkli else pymupdf.csGRAY, alpha=False)
        return Image.frombytes("RGB" if renkli else "L", (pix.width, pix.height), pix.samples)
    finally:
        d.close()


def pdf_ozeti(yol):
    d = pymupdf.open(yol, filetype="pdf")
    try:
        sayfalar = []
        for pg in d:
            filtreler = [d.xref_get_key(x[0], "Filter")[1] for x in pg.get_images(full=True)]
            sayfalar.append({"g": pg.rect.width, "y": pg.rect.height, "filtre": filtreler})
        return sayfalar
    finally:
        d.close()


def kare_listesi(yol):
    """TIFF'in kareleri: [(Image kopyası, info)]."""
    im = Image.open(yol)
    try:
        kareler = []
        for i in range(im.n_frames):
            im.seek(i)
            kareler.append((im.copy(), dict(im.info), dict(im.tag_v2)))
        return kareler
    finally:
        im.close()


def sentetik_pdf(yol, sayfa=3, tohum=7):
    """Dilekçeye benzeyen metinli PDF (12 / 10 / 8 pt, renkli antet şeridi)."""
    yazilar = {"tm": r"C:\Windows\Fonts\times.ttf", "tb": r"C:\Windows\Fonts\timesbd.ttf", "ar": r"C:\Windows\Fonts\arial.ttf"}
    soz = ("dava dilekçe mahkeme karar taraf talep süre hüküm gerekçe itiraz tebliğ duruşma esas vekil müvekkil tazminat alacak faiz "
           "bilirkişi rapor delil tanık ihtiyati tedbir haciz icra takip borçlu alacaklı şirket sözleşme fesih ihbar kıdem ücret "
           "ölçü yüzde günlük işçi işveren şubat ağustos çarşamba perşembe güneş özgür ığdır ilişkin işbu").split()
    r = random.Random(tohum)
    paragraf = lambda n: " ".join(r.choice(soz) for _ in range(n)).capitalize() + "."   # noqa: E731
    doc = pymupdf.open()
    for _ in range(sayfa):
        pg = doc.new_page(width=A4[0], height=A4[1])
        adlar = {}
        for ad, dosya in yazilar.items():
            if os.path.isfile(dosya):
                pg.insert_font(fontname=ad, fontfile=dosya)
                adlar[ad] = ad
            else:
                adlar[ad] = "tiro" if ad != "ar" else "helv"
        pg.draw_rect(pymupdf.Rect(56, 40, 539, 70), color=(0.1, 0.2, 0.6), fill=(0.85, 0.9, 1.0))
        pg.insert_text((64, 60), "ÖRNEK BÜRO · ANTET SATIRI", fontname=adlar["tb"], fontsize=12, color=(0.1, 0.2, 0.6))
        y = 90
        pg.insert_text((200, y), "SAYIN MAHKEMESİ'NE", fontname=adlar["tb"], fontsize=12)
        y += 24
        for _ in range(5):
            kalan = pg.insert_textbox(pymupdf.Rect(56, y, 539, y + 120), paragraf(70), fontname=adlar["tm"], fontsize=12, align=3)
            y += 120 - kalan + 8
        for i in range(6):
            pg.insert_text((60, y + 12), "%d) %s" % (i + 1, paragraf(6)), fontname=adlar["ar"], fontsize=10)
            pg.insert_text((400, y + 12), "%d.%03d,%02d TL" % (r.randint(1, 99), r.randint(0, 999), r.randint(0, 99)), fontname=adlar["ar"], fontsize=10)
            y += 16
        pg.insert_textbox(pymupdf.Rect(56, 790, 539, 830), paragraf(30), fontname=adlar["ar"], fontsize=8, align=3)
    doc.save(yol)
    doc.close()
    return yol


def girdileri_uret():
    os.makedirs(GIRDI, exist_ok=True)
    g = {}
    # Etiketsiz 200 dpi A4 (UYAP taramalarının çoğu gibi), G4 MinIsBlack, 3 sayfa
    kareler = [metin_karesi(1654, 2339, t) for t in (1, 2, 3)]
    g["kareler_g4"] = kareler
    g["etiketsiz_g4"] = tiff_yaz(os.path.join(GIRDI, "etiketsiz_g4.tif"), [(k, {"compression": "group4"}) for k in kareler])
    # WhiteIsZero, sıkıştırmasız
    g["beyaz_kare"] = metin_karesi(1654, 2339, 11)
    g["beyaz_sifir"] = beyaz_sifir_tiff(os.path.join(GIRDI, "beyaz_sifir.tif"), g["beyaz_kare"])
    # 8 satırlık şeritli G4 (UYAP taraması gibi)
    g["serit_kare"] = metin_karesi(1654, 2339, 21)
    g["serit8"] = tiff_yaz(os.path.join(GIRDI, "serit8_g4.tif"), [(g["serit_kare"], {"compression": "group4", "strip_size": ((1654 + 7) // 8) * 8})])
    # Etiketli Letter, RGBA LZW, 150 dpi (yarı saydam bölgeli)
    rgba = Image.new("RGBA", (1275, 1650), (230, 240, 255, 255))
    d = ImageDraw.Draw(rgba)
    d.ellipse((100, 100, 900, 900), fill=(200, 30, 30, 255))
    d.rectangle((300, 1000, 1100, 1500), fill=(20, 120, 40, 128))
    g["rgba"] = rgba
    g["letter_rgba"] = tiff_yaz(os.path.join(GIRDI, "letter_rgba_lzw.tif"), [(rgba, {"compression": "tiff_lzw", "dpi": (150, 150)})])
    # cm birimli etiket (78,74 nokta / cm = 200 dpi)
    g["cm_kare"] = metin_karesi(1654, 2339, 31)
    g["cm_etiketli"] = tiff_yaz(os.path.join(GIRDI, "cm_etiketli.tif"), [(g["cm_kare"], {"compression": "group4", "resolution_unit": 3,
                                                                                          "x_resolution": 78.74, "y_resolution": 78.74})])
    # Değişken ölçülü elle tarama (~250 dpi), etiketsiz
    g["degisken_olculer"] = [(2065, 2925), (2060, 2931), (2071, 2919)]
    g["degisken"] = tiff_yaz(os.path.join(GIRDI, "degisken_250.tif"), [(metin_karesi(w, h, 40 + i), {"compression": "group4"})
                                                                      for i, (w, h) in enumerate(g["degisken_olculer"])])
    # Yön etiketi 6 (yatay saklanmış, dik görünür)
    g["yon_kare"] = metin_karesi(2339, 1654, 51)
    g["yon6"] = tiff_yaz(os.path.join(GIRDI, "yon6.tif"), [(g["yon_kare"], {"compression": "group4", "tiffinfo": {274: 6}})])
    # Küçük görsel (A4 kuralı 50 dpi'den az verir → 72 dpi)
    g["kucuk"] = tiff_yaz(os.path.join(GIRDI, "kucuk.tif"), [(Image.new("RGB", (300, 200), (90, 160, 220)), {"compression": "tiff_lzw"})])
    # Karışık sayfalı: 1 bit G4 + renkli LZW (150 dpi etiketli) + gri LZW (etiketsiz) + gürültülü 1 bit (Flate küçük)
    g["karisik_kareler"] = [metin_karesi(1654, 2339, 61), Image.new("RGB", (1275, 1650), (250, 220, 180)),
                            metin_karesi(1654, 2339, 62, kip="L")]
    ImageDraw.Draw(g["karisik_kareler"][1]).rectangle((200, 200, 1000, 700), fill=(30, 60, 160))
    r = random.Random(5)
    g["gurultu"] = Image.frombytes("1", (1654, 2339), r.randbytes(((1654 + 7) // 8) * 2339))
    g["karisik"] = tiff_yaz(os.path.join(GIRDI, "karisik.tif"), [
        (g["karisik_kareler"][0], {"compression": "group4"}),
        (g["karisik_kareler"][1], {"compression": "tiff_lzw", "dpi": (150, 150)}),
        (g["karisik_kareler"][2], {"compression": "tiff_lzw"}),
        (g["gurultu"], {"compression": "group4"})])
    # Metinli PDF (PDF → TIFF)
    g["metin_pdf"] = sentetik_pdf(os.path.join(GIRDI, "metinli.pdf"))
    return g


def akis_dosyasi(sayfa=150):
    """150 sayfalık etiketsiz 200 dpi G4 TIFF (akış ve bellek ölçümü); bir kez üretilir."""
    yol = os.path.join(GIRDI, "akis_%d.tif" % sayfa)
    if os.path.isfile(yol):
        with Image.open(yol) as im:
            if im.n_frames == sayfa:
                return yol
    with TiffImagePlugin.AppendingTiffWriter(yol, new=True) as tf:
        for i in range(sayfa):
            metin_karesi(1654, 2339, 1000 + i).save(tf, format="TIFF", compression="group4")
            tf.newFrame()
    return yol


@contextlib.contextmanager
def kilitli(yol, paylasim=0):
    """Dosyayı başka bir program gibi açık tutar (Windows): paylasim=0 özel kilit, 1 yalnızca okumaya izin (PDF okuyucu gibi)."""
    import ctypes
    from ctypes import wintypes
    k32 = ctypes.windll.kernel32
    k32.CreateFileW.restype = wintypes.HANDLE
    h = k32.CreateFileW(yol, 0x80000000, paylasim, None, 3, 0, None)
    if h == wintypes.HANDLE(-1).value:
        raise OSError("kilitlenemedi: %d" % ctypes.GetLastError())
    try:
        yield
    finally:
        k32.CloseHandle(h)


def md5(yol):
    with open(yol, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def gecici_kalintilar(klasor):
    return [a for a in os.listdir(klasor) if ".pdefe-tmp" in a]


def temiz_klasor(ad):
    k = os.path.join(CIKTI, ad)
    shutil.rmtree(k, ignore_errors=True)
    os.makedirs(k)
    return k


def donustur(c, ogeler, **k):
    r, il = c.cagir("bicim_donustur", {"ogeler": ogeler}, **k)
    return r, il


# ---------------------------------------------------------------- testler
def test_yetenekler(c):
    print("— Yetenekler")
    r, _ = c.cagir("donusum_yetenekleri", {})
    sonuc("TIFF ↔ PDF var", r["tiff"] is True and r["donusumler"]["tiff>pdf"]["var"] and r["donusumler"]["pdf>tiff"]["var"], r["donusumler"])
    sonuc("uzantılar ve girdi süzgeci", r["uzantilar"]["tiff"] == [".tif", ".tiff"] and r["uzantilar"]["word"] == [".docx"]
          and ".tif" in r["girdiUzantilari"].get("tiff", []) and ".pdf" in r["girdiUzantilari"].get("pdf", []), r["girdiUzantilari"])
    sonuc("UDF ve Word alanları var", isinstance(r.get("udf"), dict) and isinstance(r.get("word"), dict), (r.get("udf"), r.get("word")))
    gv = r.get("gorsel") or {}
    sonuc("0.2.7: görüntü → PDF ve PDF → JPG var, JPG uzantıları, görüntü süzgeci", gv.get("var") is True and r["uzantilar"].get("gorsel") == [".jpg", ".jpeg"]
          and r["donusumler"].get("gorsel>pdf", {}).get("var") and r["donusumler"].get("pdf>gorsel", {}).get("var")
          and {".jpg", ".png", ".bmp", ".gif", ".webp"} <= set(r["girdiUzantilari"].get("gorsel", [])) and gv.get("varsayilanDpi") == 300,
          (gv, r["girdiUzantilari"].get("gorsel")))
    sonuc("HEIC açıcısı yoksa süzgeçte .heic yok", gv.get("heic") or ".heic" not in r["girdiUzantilari"].get("gorsel", []), gv.get("heic"))


def test_kalite_notlari(c, g):
    """0.2.7 (madde 10): sonucu kaynağından belirgin biçimde farklı olabilecek dönüştürmelerde kısa not (donusumler ve satırın hedefleri)."""
    print("— Kalite notları")
    r, _ = c.cagir("donusum_yetenekleri", {})
    d = r["donusumler"]
    notlu = ["udf>word", "pdf>word", "tiff>word", "gorsel>word", "pdf>udf", "word>udf", "tiff>udf", "gorsel>udf"]
    notsuz = ["udf>pdf", "tiff>pdf", "gorsel>pdf", "pdf>tiff", "pdf>gorsel", "udf>tiff"]
    sonuc("notlu dönüştürmelerde kalite notu var", all(d.get(k, {}).get("kalite") for k in notlu), {k: d.get(k, {}).get("kalite") for k in notlu})
    sonuc("UDE / Word'ün kendi çizdiği ve kayıpsız dönüştürmelerde not yok", not any(d.get(k, {}).get("kalite") for k in notsuz),
          {k: d.get(k, {}).get("kalite") for k in notsuz if d.get(k, {}).get("kalite")})
    sonuc("TIFF → Word notu: taranmış sayfa resim olarak (yazı tanıma yok)", "resim" in d["tiff>word"]["kalite"], d["tiff>word"]["kalite"])
    sonuc("görüntü → UDF notu: yazı tanıma, harf yanlışı", "tanın" in d["gorsel>udf"]["kalite"] and "harf" in d["gorsel>udf"]["kalite"],
          d["gorsel>udf"]["kalite"])
    b, _ = c.cagir("donusum_bilgi", {"yol": g["etiketsiz_g4"], "genislik": 120})
    h = {x["bicim"]: x for x in b["hedefler"]}
    sonuc("satırın hedeflerinde de not (TIFF: Word ve UDF notlu, PDF notsuz)", h["word"].get("kalite") == d["tiff>word"]["kalite"]
          and h["udf"].get("kalite") == d["tiff>udf"]["kalite"] and "kalite" not in h["pdf"], {k: v.get("kalite") for k, v in h.items()})


def imza_ornekleri():
    k = temiz_klasor("imza")
    o = {}

    def yaz(ad, veri):
        yol = os.path.join(k, ad)
        with open(yol, "wb") as f:
            f.write(veri)
        return yol
    with open(os.path.join(GIRDI, "etiketsiz_g4.tif"), "rb") as f:
        tif = f.read()
    with open(os.path.join(GIRDI, "metinli.pdf"), "rb") as f:
        pdf = f.read()
    o["tiff_adi_pdf"] = (yaz("aslinda_tiff.pdf", tif), "tiff", "tiff")
    o["pdf_adi_tif"] = (yaz("aslinda_pdf.tif", pdf), "pdf", None)
    o["bigtiff"] = (yaz("buyuk.tif", b"II+\x00\x08\x00\x00\x00" + b"\x00" * 64), "tiff", "bigtiff")

    def zip_yaz(ad, ogeler, ilk=None):
        yol = os.path.join(k, ad)
        with zipfile.ZipFile(yol, "w", zipfile.ZIP_DEFLATED) as z:
            if ilk:
                z.writestr(zipfile.ZipInfo(ilk[0]), ilk[1])
            for a, v in ogeler.items():
                z.writestr(a, v)
        return yol
    udf_icerik = '<?xml version="1.0" encoding="UTF-8" ?>\n<template format_id="1.8"><content><![CDATA[Deneme]]></content></template>'
    o["udf_zip_adi_docx"] = (zip_yaz("aslinda_udf.docx", {"content.xml": udf_icerik}), "udf", "zip")
    o["docx_adi_udf"] = (zip_yaz("aslinda_docx.udf", {"[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document/>"}), "word", "docx")
    o["docm"] = (zip_yaz("makrolu.docm", {"word/document.xml": "<w:document/>", "word/vbaProject.bin": "x"}), "word", "docm")
    o["odt"] = (zip_yaz("metin.odt", {"content.xml": "<office:document-content/>"}, ilk=("mimetype", "application/vnd.oasis.opendocument.text")),
                "word", "odt")
    o["ods"] = (zip_yaz("tablo.ods", {"content.xml": "<office:document-content/>"}, ilk=("mimetype", "application/vnd.oasis.opendocument.spreadsheet")),
                "bilinmeyen", "zip")
    o["duz_xml_udf"] = (yaz("duz.udf", b"\xef\xbb\xbf" + udf_icerik.encode("utf-8")), "udf", "xml")
    o["rtf"] = (yaz("metin.rtf", b"{\\rtf1\\ansi Deneme}"), "word", "rtf")
    ole = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 1000 + "WordDocument".encode("utf-16-le") + b"\x00" * 500
    o["doc"] = (yaz("eski.doc", ole), "word", "doc")
    o["ole_baska"] = (yaz("tablo.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 2000), "bilinmeyen", "ole2")
    o["html_adi_pdf"] = (yaz("sayfa.pdf", b"<html><body>PDF degil</body></html>"), "bilinmeyen", None)
    o["rastgele"] = (yaz("rastgele.tif", random.Random(9).randbytes(4096)), "bilinmeyen", None)
    return o


def test_imza(c):
    print("— Türün imzadan bulunması (uzantıdan değil)")
    for ad, (yol, tur, alt) in imza_ornekleri().items():
        r, _ = c.cagir("donusum_bilgi", {"yol": yol})
        sonuc("imza: %s → %s/%s" % (ad, tur, alt), r["tur"] == tur and r["alt"] == alt, (r["tur"], r["alt"], r.get("uyari")))
    r, _ = c.cagir("donusum_bilgi", {"yol": os.path.join(CIKTI, "imza", "sayfa.pdf")})
    sonuc("tanınmayan dosyada hedef yok, uyarı var", r["hedefler"] == [] and "tanınmadı" in (r.get("uyari") or ""), r)


def test_mupdf_yalnizca_pdf(c):
    """Modülde pymupdf.open çağrıları kaydedilir: yol verilen her çağrı filetype='pdf' ve içeriği PDF olan dosyayla olmalı."""
    if c.exe:
        atlandi("MuPDF'e yalnızca PDF", "exe kipinde modülün içi görülmüyor")
        return
    print("— MuPDF'e yalnızca PDF verilir")
    import pdefe_core
    pdefe_core.onbellek.hepsini_birak()
    kayit = []
    asil = pymupdf.open

    def izleyen(*a, **k):
        if a and isinstance(a[0], str):
            kayit.append((a[0], k.get("filetype")))
        return asil(*a, **k)
    ornekler = imza_ornekleri()
    k = temiz_klasor("mupdf")
    pymupdf.open = izleyen
    try:
        for ad, (yol, _, _) in ornekler.items():
            c.cagir("donusum_bilgi", {"yol": yol})
        # PDF adlı TIFF'i ve docx'i dönüştürmeyi de dene
        r, _ = donustur(c, [{"yol": ornekler["tiff_adi_pdf"][0], "hedef": os.path.join(k, "a.pdf"), "hedefBicim": "pdf"},
                            {"yol": ornekler["docx_adi_udf"][0], "hedef": os.path.join(k, "b.tif"), "hedefBicim": "tiff"},
                            {"yol": ornekler["html_adi_pdf"][0], "hedef": os.path.join(k, "c.tif"), "hedefBicim": "tiff"}])
    finally:
        pymupdf.open = asil
    pdefe_core.onbellek.hepsini_birak()
    yanlis = []
    for yol, ft in kayit:
        with open(yol, "rb") as f:
            pdf_mi = b"%PDF-" in f.read(1024)
        if ft != "pdf" or not pdf_mi:
            yanlis.append((os.path.basename(yol), ft))
    sonuc("MuPDF yalnızca PDF içerikli dosyaları filetype='pdf' ile açtı", not yanlis and kayit, yanlis or "%d açılış" % len(kayit))
    s = r["sonuclar"]
    sonuc("PDF adlı TIFF TIFF olarak dönüştürüldü", "hata" not in s[0] and s[0]["kaynakTur"] == "tiff", s[0])
    y, _ = c.cagir("donusum_yetenekleri", {})
    if (y.get("donusumler") or {}).get("word>tiff", {}).get("var"):   # Word → PDF (0.2.6, islemler/word.py) varsa zincirle yapılır
        sonuc("bozuk docx → TIFF: Word açamadı (kod bozuk), MuPDF'e gitmedi", s[1].get("kod") == "bozuk", s[1])
    else:
        sonuc("docx → TIFF yapılamıyor (Word dönüştürücüsü yok)", s[1].get("kod") == "desteklenmiyor", s[1])
    sonuc("tanınmayan dosya dönüştürülmez", s[2].get("kod") == "taninmadi", s[2])


def test_tiff_pdf(c, g):
    print("— TIFF → PDF")
    k = temiz_klasor("tiff_pdf")
    a4_200 = (1654 * 72 / 200, 2339 * 72 / 200)   # 595,44 × 842,04 pt
    vakalar = [
        ("etiketsiz G4 MinIsBlack", g["etiketsiz_g4"], g["kareler_g4"], [a4_200] * 3, None),
        ("WhiteIsZero sıkıştırmasız", g["beyaz_sifir"], [g["beyaz_kare"]], [a4_200], None),
        ("8 satırlık şeritli G4", g["serit8"], [g["serit_kare"]], [a4_200], None),
        ("cm birimli etiket (200 dpi)", g["cm_etiketli"], [g["cm_kare"]], [a4_200], None),
        ("etiketli Letter RGBA LZW 150 dpi", g["letter_rgba"], None, [(612, 792)], ["/FlateDecode"]),
        ("küçük görsel (72 dpi)", g["kucuk"], None, [(300, 200)], ["/FlateDecode"]),
    ]
    g4_sayfa = 0
    for ad, tif, kareler, olculer, filtreler in vakalar:
        hedef = os.path.join(k, os.path.splitext(os.path.basename(tif))[0] + ".pdf")
        r, il = donustur(c, [{"yol": tif, "hedef": hedef, "hedefBicim": "pdf"}])
        s = r["sonuclar"][0]
        if "hata" in s:
            sonuc("TIFF → PDF %s" % ad, False, s)
            continue
        oz = pdf_ozeti(hedef)
        olcu_ok = len(oz) == len(olculer) and all(abs(p["g"] - o[0]) <= 1 and abs(p["y"] - o[1]) <= 1 for p, o in zip(oz, olculer))
        sonuc("TIFF → PDF %s: sayfa ölçüsü ±1 pt" % ad, olcu_ok, [(round(p["g"], 2), round(p["y"], 2)) for p in oz])
        filtreler = filtreler or [kucuk_filtre(kr) for kr in kareler]   # 1 bit: G4 ile Flate'ten küçüğü
        g4_sayfa += sum(1 for p in oz if p["filtre"] == ["/CCITTFaxDecode"])
        sonuc("TIFF → PDF %s: filtre (%s)" % (ad, ", ".join(f.strip("/") for f in filtreler)), [p["filtre"] for p in oz] == [[f] for f in filtreler],
              [p["filtre"] for p in oz])
        if kareler:
            esit = [ayni(pdf_sayfa_goruntusu(hedef, i, kr.width, kr.height), kr) for i, kr in enumerate(kareler)]
            sonuc("TIFF → PDF %s: kendi dpi'ında piksel piksel aynı" % ad, all(esit), esit)
            sy = [(siyah(pdf_sayfa_goruntusu(hedef, i, kr.width, kr.height)), siyah(kr)) for i, kr in enumerate(kareler)]
            sonuc("TIFF → PDF %s: siyah piksel sayısı (polarite)" % ad, all(a == b for a, b in sy), sy)
    sonuc("yazılı 200 dpi taramada G4 seçildi (G4 yolu sınandı)", g4_sayfa >= 3, "%d sayfa G4" % g4_sayfa)
    # Letter RGBA: beyaza bindirilmiş hâliyle aynı
    hedef = os.path.join(k, "letter_rgba_lzw.pdf")
    beklenen = Image.alpha_composite(Image.new("RGBA", g["rgba"].size, (255, 255, 255, 255)), g["rgba"]).convert("RGB")
    sonuc("TIFF → PDF RGBA: saydamlık beyaza bindirilmiş, pikseller aynı", ayni(pdf_sayfa_goruntusu(hedef, 0, 1275, 1650, renkli=True), beklenen))
    # Değişken ölçülü tarama: dosya başına tek dpi (ortanca, 250), her sayfa kendi pikselinin ölçüsünde
    hedef = os.path.join(k, "degisken_250.pdf")
    donustur(c, [{"yol": g["degisken"], "hedef": hedef, "hedefBicim": "pdf"}])
    oz = pdf_ozeti(hedef)
    beklenen = [(w * 72 / 250, h * 72 / 250) for w, h in g["degisken_olculer"]]
    sonuc("değişken ölçülü tarama: 250 dpi, sayfalar gerçek ölçüde", all(abs(p["g"] - b[0]) < 0.05 and abs(p["y"] - b[1]) < 0.05
                                                                         for p, b in zip(oz, beklenen)), [(round(p["g"], 1), round(p["y"], 1)) for p in oz])
    # Yön 6: dik sayfa, görsel çevrilmiş
    hedef = os.path.join(k, "yon6.pdf")
    donustur(c, [{"yol": g["yon6"], "hedef": hedef, "hedefBicim": "pdf"}])
    oz = pdf_ozeti(hedef)
    gorunen = g["yon_kare"].transpose(Image.Transpose.ROTATE_270)
    sonuc("yön etiketi 6: dik A4 sayfa, görüntü çevrilmiş", abs(oz[0]["g"] - a4_200[0]) <= 1 and abs(oz[0]["y"] - a4_200[1]) <= 1
          and ayni(pdf_sayfa_goruntusu(hedef, 0, gorunen.width, gorunen.height), gorunen), (round(oz[0]["g"], 1), round(oz[0]["y"], 1)))
    # Karışık sayfalı
    hedef = os.path.join(k, "karisik.pdf")
    r, _ = donustur(c, [{"yol": g["karisik"], "hedef": hedef, "hedefBicim": "pdf"}])
    oz = pdf_ozeti(hedef)
    filtreler = [p["filtre"] for p in oz]
    sonuc("karışık sayfalı TIFF: 1 bit (küçüğü), renkli, gri, gürültülü (Flate küçük)",
          filtreler == [[kucuk_filtre(g["karisik_kareler"][0])], ["/FlateDecode"], ["/FlateDecode"], ["/FlateDecode"]]
          and abs(oz[1]["g"] - 612) <= 1 and abs(oz[2]["g"] - a4_200[0]) <= 1, (filtreler, [(round(p["g"]), round(p["y"])) for p in oz]))
    kontrol = [ayni(pdf_sayfa_goruntusu(hedef, 0, 1654, 2339), g["karisik_kareler"][0]),
               ayni(pdf_sayfa_goruntusu(hedef, 1, 1275, 1650, renkli=True), g["karisik_kareler"][1]),
               ayni(pdf_sayfa_goruntusu(hedef, 2, 1654, 2339), g["karisik_kareler"][2]),
               ayni(pdf_sayfa_goruntusu(hedef, 3, 1654, 2339), g["gurultu"])]
    sonuc("karışık sayfalı TIFF: dört sayfa da kayıpsız", all(kontrol), kontrol)
    sonuc("sonuçta sayfa, dpi ve G4 sayfa sayısı", r["sonuclar"][0].get("sayfa") == 4 and r["sonuclar"][0].get("dpi") == 200
          and r["sonuclar"][0].get("g4Sayfa") == sum(1 for f in filtreler if f == ["/CCITTFaxDecode"]), r["sonuclar"][0])
    sonuc("geçici dosya kalmadı", not gecici_kalintilar(k), gecici_kalintilar(k))
    # pdf.js de aynı polariteyle çözer (PDEfe sayfayı pdf.js ile çizer)
    pdfjs_denetle([(os.path.join(k, "etiketsiz_g4.pdf"), 1, siyah(g["kareler_g4"][0])),
                   (os.path.join(k, "beyaz_sifir.pdf"), 1, siyah(g["beyaz_kare"])),
                   (os.path.join(k, "karisik.pdf"), 4, siyah(g["gurultu"]))])
    # donusum_bilgi: sayfa sayısı, dpi, ön izleme
    r, _ = c.cagir("donusum_bilgi", {"yol": g["etiketsiz_g4"], "genislik": 180})
    sonuc("donusum_bilgi TIFF: 3 sayfa, 200 dpi (A4 kuralı), ön izleme, ilk sayfanın ölçüsü",
          r["tur"] == "tiff" and r["sayfa"] == 3 and r["dpi"] == 200 and r["dpiKaynagi"] == "a4" and r["pngGenislik"] == 180
          and abs(r["genislik"] - a4_200[0]) < 0.1 and [h["bicim"] for h in r["hedefler"]][:1] == ["pdf"]
          and "tiff" not in [h["bicim"] for h in r["hedefler"]], {a: r[a] for a in r if a != "png"})
    r, _ = c.cagir("donusum_bilgi", {"yol": g["metin_pdf"]})
    sonuc("donusum_bilgi PDF: sayfa, ön izleme, hedefler TIFF", r["tur"] == "pdf" and r["sayfa"] == 3 and r["pngGenislik"] == 220
          and "tiff" in [h["bicim"] for h in r["hedefler"]], {a: r[a] for a in r if a != "png"})


PDFJS_BETIGI = r"""
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [kok, pdfYolu, sayfaNo] = process.argv.slice(2);
const pdfjs = await import(pathToFileURL(path.join(kok, 'legacy', 'build', 'pdf.mjs')).href);
const belge = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfYolu)), isOffscreenCanvasSupported: false,
  isImageDecoderSupported: false, wasmUrl: path.join(kok, 'wasm') + '/', useWorkerFetch: false, disableFontFace: true }).promise;
const sayfa = await belge.getPage(Number(sayfaNo));
const ops = await sayfa.getOperatorList();
let siyah = 0, gorsel = 0;
for (let i = 0; i < ops.fnArray.length; i++) {
  if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
  const g = await new Promise((coz) => sayfa.objs.get(ops.argsArray[i][0], coz));
  if (!g) continue;
  gorsel++;
  const { width, height, kind, data } = g;
  if (kind === pdfjs.ImageKind.GRAYSCALE_1BPP) {
    const satir = (width + 7) >> 3;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!((data[y * satir + (x >> 3)] >> (7 - (x & 7))) & 1)) siyah++;
  } else {
    const adim = kind === pdfjs.ImageKind.RGBA_32BPP ? 4 : 3;
    for (let j = 0; j < data.length; j += adim) if (data[j] < 128) siyah++;
  }
}
console.log(JSON.stringify({ gorsel, siyah }));
"""


def pdfjs_denetle(vakalar):
    kok = os.path.join(KOK, "node_modules", "pdfjs-dist")
    if not os.path.isdir(kok) or shutil.which("node") is None:
        atlandi("pdf.js polaritesi", "node ya da pdfjs-dist yok")
        return
    betik = os.path.join(CIKTI, "pdfjs_gorsel.mjs")
    with open(betik, "w", encoding="utf-8") as f:
        f.write(PDFJS_BETIGI)
    for yol, sayfa, beklenen in vakalar:
        try:
            p = subprocess.run(["node", betik, kok, yol, str(sayfa)], capture_output=True, timeout=120)
            r = json.loads(p.stdout.decode("utf-8").strip().splitlines()[-1])
            sonuc("pdf.js %s s.%d: siyah piksel sayısı aynı" % (os.path.basename(yol), sayfa), r["gorsel"] == 1 and r["siyah"] == beklenen,
                  "%s / beklenen %d" % (r, beklenen))
        except Exception as e:  # noqa: BLE001
            sonuc("pdf.js %s s.%d" % (os.path.basename(yol), sayfa), False, repr(e))


def test_pdf_tiff(c, g):
    print("— PDF → TIFF")
    k = temiz_klasor("pdf_tiff")
    kaynak = g["metin_pdf"]
    bekl_200 = (math.ceil(A4[0] * 200 / 72 - 0.001), math.ceil(A4[1] * 200 / 72 - 0.001))
    bekl_300 = (math.ceil(A4[0] * 300 / 72 - 0.001), math.ceil(A4[1] * 300 / 72 - 0.001))
    for ad, secenek, kip, sikistirma, dpi, olcu in (
            ("varsayılan (0.2.7: 300 dpi siyah-beyaz)", {}, "1", "group4", 300, bekl_300),
            ("200 dpi (Düşük)", {"dpi": 200}, "1", "group4", 200, bekl_200),
            ("gri", {"renk": "gri"}, "L", "tiff_lzw", 300, bekl_300),
            ("renkli", {"renk": "renkli"}, "RGB", "tiff_lzw", 300, bekl_300)):
        hedef = os.path.join(k, "metinli_%s.tif" % (secenek.get("renk") or secenek.get("dpi") or "varsayilan"))
        r, _ = donustur(c, [{"yol": kaynak, "hedef": hedef, "hedefBicim": "tiff", "secenekler": secenek}])
        s = r["sonuclar"][0]
        if "hata" in s:
            sonuc("PDF → TIFF %s" % ad, False, s)
            continue
        kareler = kare_listesi(hedef)
        ozet = [(kr.mode, inf.get("compression"), tuple(round(float(v)) for v in inf.get("dpi", (0, 0))), kr.size) for kr, inf, _ in kareler]
        sonuc("PDF → TIFF %s: 3 kare, %s, %s, %d dpi, %s" % (ad, kip, sikistirma, dpi, olcu),
              len(kareler) == 3 and all(o == (kip, sikistirma, (dpi, dpi), olcu) for o in ozet) and s["sayfa"] == 3, ozet)
    # Siyah-beyaz eşiği: titreşim yok (gri değerler 0/255'e eşikle ayrılır; aynı sayfanın gri çizimiyle karşılaştırılır)
    gri = kare_listesi(os.path.join(k, "metinli_gri.tif"))[0][0]
    sb = kare_listesi(os.path.join(k, "metinli_varsayilan.tif"))[0][0]
    sonuc("siyah-beyaz: sabit eşik 160 (titreşimsiz)", ayni(sb, gri.point(lambda v: 255 if v > 160 else 0, "1")))
    # Taranmış sayfada gidiş-dönüş: TIFF → PDF → TIFF pikseller aynı, kendi dpi'ı (300 seçilse de)
    ara = os.path.join(k, "gidis.pdf")
    donustur(c, [{"yol": g["etiketsiz_g4"], "hedef": ara, "hedefBicim": "pdf"}])
    for secenek in ({}, {"dpi": 200}):
        donus = os.path.join(k, "donus_%s.tif" % (secenek.get("dpi") or "varsayilan"))
        donustur(c, [{"yol": ara, "hedef": donus, "hedefBicim": "tiff", "secenekler": secenek}])
        kareler = kare_listesi(donus)
        esit = [ayni(kr, kaynak_kare) for (kr, _, _), kaynak_kare in zip(kareler, g["kareler_g4"])]
        dpiler = [tuple(round(float(v)) for v in inf.get("dpi", (0, 0))) for _, inf, _ in kareler]
        sonuc("gidiş-dönüş (TIFF → PDF → TIFF, seçenek %s): pikseller aynı, 200 dpi" % (secenek or "varsayılan"),
              len(kareler) == 3 and all(esit) and dpiler == [(200, 200)] * 3, (esit, dpiler))
    # Karışık sayfalı TIFF'in renkli sayfası (150 dpi etiketli) renkli TIFF'e kendi dpi'ında döner
    ara = os.path.join(k, "karisik.pdf")
    donustur(c, [{"yol": g["karisik"], "hedef": ara, "hedefBicim": "pdf"}])
    donus = os.path.join(k, "karisik_renkli.tif")
    donustur(c, [{"yol": ara, "hedef": donus, "hedefBicim": "tiff", "secenekler": {"renk": "renkli"}}])
    kareler = kare_listesi(donus)
    sonuc("renkli gidiş-dönüş: 150 dpi sayfa 150 dpi, pikseller aynı", ayni(kareler[1][0], g["karisik_kareler"][1])
          and tuple(round(float(v)) for v in kareler[1][1]["dpi"]) == (150, 150), [kr.size for kr, _, _ in kareler])
    # Yazı tanıma (Windows'un tanıyıcısı): 200 dpi ("Düşük") siyah-beyaz TIFF'te sözcük F1 ≥ 0,97
    f1 = tanima_f1(kaynak, os.path.join(k, "metinli_200.tif"))
    if f1 is None:
        atlandi("yazı tanıma F1", "Windows yazı tanıyıcısı (Türkçe) yok")
    else:
        sonuc("yazı tanıma: 200 dpi siyah-beyaz TIFF'te sözcük F1 (ortalama) ≥ 0,97", sum(f1) / len(f1) >= 0.97,
              "ortalama %.3f, sayfalar %s" % (sum(f1) / len(f1), [round(x, 3) for x in f1]))
    # Seçenek denetimi
    r, _ = donustur(c, [{"yol": kaynak, "hedef": os.path.join(k, "x.tif"), "hedefBicim": "tiff", "secenekler": {"dpi": 150}}])
    sonuc("geçersiz dpi seçeneği öğe hatası", r["sonuclar"][0].get("kod") == "gecersiz", r["sonuclar"][0])
    sonuc("geçici dosya kalmadı", not gecici_kalintilar(k), gecici_kalintilar(k))


def tanima_f1(pdf, tif):
    if not WINDOWS:
        return None
    try:
        import asyncio
        import collections
        import re
        from winrt.windows.globalization import Language
        from winrt.windows.graphics.imaging import BitmapPixelFormat, SoftwareBitmap
        from winrt.windows.media.ocr import OcrEngine
        from winrt.windows.storage.streams import DataWriter
    except ImportError:
        return None
    motor = OcrEngine.try_create_from_language(Language("tr"))
    if motor is None:
        return None

    async def tani(gri):
        w = DataWriter()
        w.write_bytes(gri.tobytes())
        bmp = SoftwareBitmap.create_copy_from_buffer(w.detach_buffer(), BitmapPixelFormat.GRAY8, gri.width, gri.height)
        return await motor.recognize_async(bmp)
    nokta = re.compile(r"^[\W_]+|[\W_]+$")

    def sayac(sozler):
        return collections.Counter(nokta.sub("", s) for s in sozler if nokta.sub("", s))
    d = pymupdf.open(pdf, filetype="pdf")
    sonuclar = []
    dongu = asyncio.new_event_loop()
    try:
        for i, (kare, _, _) in enumerate(kare_listesi(tif)):
            gercek = sayac(w[4] for w in d[i].get_text("words"))
            r = dongu.run_until_complete(tani(kare.convert("L")))
            taninan = sayac(w.text for ln in r.lines for w in ln.words)
            ortak = sum((gercek & taninan).values())
            p, q = ortak / max(1, sum(taninan.values())), ortak / max(1, sum(gercek.values()))
            sonuclar.append(2 * p * q / max(1e-9, p + q))
    finally:
        dongu.close()
        d.close()
    return sonuclar


TEPE_BETIGI = r"""
import json, os, sys, threading, time
sys.path.insert(0, sys.argv[1])
import pdefe_core
from islemler import araclar

def tepe():
    if sys.platform == "win32":
        import ctypes
        class PMC(ctypes.Structure):
            _fields_ = [("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong), ("PeakWorkingSetSize", ctypes.c_size_t),
                        ("WorkingSetSize", ctypes.c_size_t)] + [("x%d" % i, ctypes.c_size_t) for i in range(7)]
        p = PMC(); p.cb = ctypes.sizeof(PMC)
        k = ctypes.windll.kernel32
        k.GetCurrentProcess.restype = ctypes.c_void_p
        k.K32GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
        k.K32GetProcessMemoryInfo(k.GetCurrentProcess(), ctypes.byref(p), p.cb)
        return p.PeakWorkingSetSize / 2**20
    import resource
    r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return r / 2**20 if sys.platform == "darwin" else r / 1024

once = tepe()
yontem, params = sys.argv[2], json.loads(sys.argv[3])
t = time.perf_counter()
r = pdefe_core.YONTEMLER[yontem](params)
if isinstance(r, pdefe_core.Ertelenmis):
    olay, kutu = threading.Event(), {}
    r.baslat(lambda s, h: (kutu.update(s=s, h=h), olay.set()))
    olay.wait(600)
    if kutu["h"]:
        raise kutu["h"]
    r = kutu["s"]
print(json.dumps({"once": once, "tepe": tepe(), "sure": time.perf_counter() - t, "sonuc": r}, ensure_ascii=False))
"""


def tepe_olc(yontem, params):
    betik = os.path.join(CIKTI, "tepe_olc.py")
    with open(betik, "w", encoding="utf-8") as f:
        f.write(TEPE_BETIGI)
    p = subprocess.run([sys.executable, "-X", "utf8", betik, CORE, yontem, json.dumps(params, ensure_ascii=False)], capture_output=True,
                       timeout=900, env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    if p.returncode:
        raise RuntimeError(p.stderr.decode("utf-8", "replace")[-800:])
    return json.loads(p.stdout.decode("utf-8").strip().splitlines()[-1])


def test_akis(c):
    print("— 150 sayfa: akışlı okuma, süre, tepe bellek")
    tif = akis_dosyasi(150)
    k = temiz_klasor("akis")
    hedef = os.path.join(k, "akis_150.pdf")
    olcu = tepe_olc("bicim_donustur", {"ogeler": [{"yol": tif, "hedef": hedef, "hedefBicim": "pdf"}]})
    s = olcu["sonuc"]["sonuclar"][0]
    oz = pdf_ozeti(hedef) if os.path.isfile(hedef) else []
    sonuc("TIFF → PDF 150 sayfa: tepe bellek < 200 MB", olcu["tepe"] < 200 and len(oz) == 150,
          "tepe %.0f MB (başta %.0f), %.1f sn, %d sayfa, %.1f MB (TIFF %.1f MB)" % (olcu["tepe"], olcu["once"], olcu["sure"], len(oz),
                                                                                 s.get("boyut", 0) / 2**20, os.path.getsize(tif) / 2**20))
    sonuc("TIFF → PDF 150 sayfa: bütün sayfalar G4, A4", all(p["filtre"] == ["/CCITTFaxDecode"] and abs(p["g"] - 595.44) < 0.1 for p in oz))
    hedef2 = os.path.join(k, "akis_150.tif")
    olcu = tepe_olc("bicim_donustur", {"ogeler": [{"yol": hedef, "hedef": hedef2, "hedefBicim": "tiff"}]})
    with Image.open(hedef2) as im:
        n = im.n_frames
    sonuc("PDF → TIFF 150 sayfa: tepe bellek < 200 MB", olcu["tepe"] < 200 and n == 150,
          "tepe %.0f MB (başta %.0f), %.1f sn, %d kare, %.1f MB" % (olcu["tepe"], olcu["once"], olcu["sure"], n, os.path.getsize(hedef2) / 2**20))


def test_iptal(c, g):
    print("— İptal")
    k = temiz_klasor("iptal")
    tif = akis_dosyasi(150) if os.path.isfile(os.path.join(GIRDI, "akis_150.tif")) else g["etiketsiz_g4"]
    hedef = os.path.join(k, "iptal.pdf")
    try:
        donustur(c, [{"yol": tif, "hedef": hedef, "hedefBicim": "pdf"}], iptal_sonra=2)
        sonuc("ortasında iptal: iş iptal edildi", False, "iş bitti")
    except CagriHatasi as e:
        sonuc("ortasında iptal: iptal yanıtı (-32800)", e.kod == -32800, (e.kod, str(e)))
    sonuc("ortasında iptal: hedef ve geçici dosya yok", not os.path.exists(hedef) and not gecici_kalintilar(k), os.listdir(k))
    # Toplu işte iptal: ilk öğe bitmiş olsa da hiçbir hedef yazılmaz
    h1, h2 = os.path.join(k, "bir.pdf"), os.path.join(k, "iki.pdf")
    with open(h1, "wb") as f:
        f.write(b"%PDF-1.4 eski icerik")
    once = md5(h1)
    try:
        donustur(c, [{"yol": g["serit8"], "hedef": h1, "hedefBicim": "pdf"}, {"yol": tif, "hedef": h2, "hedefBicim": "pdf"}], iptal_sonra=4)
        sonuc("toplu iptal", False, "iş bitti")
    except CagriHatasi as e:
        sonuc("toplu iptal: ilk öğe bitmişken iptal, var olan hedef değişmedi, yenisi yok",
              e.kod == -32800 and md5(h1) == once and not os.path.exists(h2) and not gecici_kalintilar(k), (e.kod, os.listdir(k)))


def test_iptal_bayragi():
    """pdefe_core: iptal bayrağı ertelenmiş iş bitene dek durur (iş başlamadan gelen iptal kaybolmaz), iş bitince silinir."""
    print("— İptal bayrağı (pdefe_core, ertelenmiş iş)")
    import pdefe_core
    k = temiz_klasor("bayrak")
    yazilan = []
    asil = pdefe_core.yaz
    pdefe_core.yaz = lambda obj: yazilan.append(obj)
    try:
        hedef = os.path.join(k, "erken.pdf")
        with pdefe_core._iptal_kilidi:
            pdefe_core._iptal_bayraklari.add(90001)   # istek işlenmeden iptal geldi (ana iş parçacığı kuyruğu beklemez)
        pdefe_core._istek_isle({"id": 90001, "method": "bicim_donustur", "params": {"ogeler": [
            {"yol": os.path.join(GIRDI, "etiketsiz_g4.tif"), "hedef": hedef, "hedefBicim": "pdf"}]}})
        son = time.time() + 60
        yanit = None
        while time.time() < son and yanit is None:
            yanit = next((m for m in yazilan if m.get("id") == 90001 and "progress" not in m), None)
            time.sleep(0.05)
        sonuc("iş başlamadan gelen iptal: iş iptal edildi (-32800)", yanit is not None and (yanit.get("error") or {}).get("code") == -32800, yanit)
        sonuc("iptal edilen iş hedef yazmadı", not os.path.exists(hedef) and not gecici_kalintilar(k), os.listdir(k))
        sonuc("iş bitince bayrak silindi", 90001 not in pdefe_core._iptal_bayraklari, sorted(pdefe_core._iptal_bayraklari))
        # Olağan iş: bayrak hiç konmadı, iş bitti
        hedef = os.path.join(k, "olagan.pdf")
        pdefe_core._istek_isle({"id": 90002, "method": "bicim_donustur", "params": {"ogeler": [
            {"yol": os.path.join(GIRDI, "etiketsiz_g4.tif"), "hedef": hedef, "hedefBicim": "pdf"}]}})
        son = time.time() + 60
        yanit = None
        while time.time() < son and yanit is None:
            yanit = next((m for m in yazilan if m.get("id") == 90002 and "progress" not in m), None)
            time.sleep(0.05)
        sonuc("iptalsiz ertelenmiş iş bitti", yanit is not None and "result" in yanit and os.path.isfile(hedef), yanit and list(yanit))
    finally:
        pdefe_core.yaz = asil


def test_surec(exe, g):
    """Gerçek çekirdek süreci (betik ya da exe) üzerinden: iş başlamadan iptal, dönüştürme sürerken öteki isteklerin yanıtlanması, çekirdek
    kapanırken süren dönüştürmenin iptali."""
    print("— Çekirdek süreci (JSON-RPC)")
    tif = akis_dosyasi(150) if os.path.isfile(os.path.join(GIRDI, "akis_150.tif")) else g["etiketsiz_g4"]
    k = temiz_klasor("surec")
    # 1) İstek ve iptal aynı yazımda
    s = Surec(exe)
    hedef = os.path.join(k, "ayni_yazim.pdf")
    s.yaz({"id": 1, "method": "bicim_donustur", "params": {"ogeler": [{"yol": tif, "hedef": hedef, "hedefBicim": "pdf"}]}},
          {"id": 2, "method": "iptal", "params": {"id": 1}})
    m, _ = s.bekle(lambda m: m.get("id") == 1 and "progress" not in m)
    sonuc("istekle aynı anda gelen iptal: -32800, hedef yok", m is not None and (m.get("error") or {}).get("code") == -32800
          and not os.path.exists(hedef) and not gecici_kalintilar(k), m)
    # 2) Dönüştürme sürerken işçi öteki istekleri yanıtlar
    hedef = os.path.join(k, "surerken.pdf")
    s.yaz({"id": 3, "method": "bicim_donustur", "params": {"ogeler": [{"yol": tif, "hedef": hedef, "hedefBicim": "pdf"}]}})
    m, _ = s.bekle(lambda m: m.get("id") == 3 and "progress" in m)
    s.yaz({"id": 4, "method": "ping", "params": {}}, {"id": 5, "method": "donusum_bilgi", "params": {"yol": g["serit8"]}},
          {"id": 6, "method": "kucuk_resim", "params": {"yol": g["metin_pdf"], "sayfa": 1, "genislik": 120}})
    _, okunan = s.bekle(lambda m: m.get("id") == 3 and "progress" not in m, sure=300)
    sira = [m["id"] for m in okunan if "progress" not in m]
    yanit3 = next((m for m in okunan if m.get("id") == 3 and "progress" not in m), {})
    sonuc("dönüştürme sürerken ping / donusum_bilgi / kucuk_resim önce yanıtlandı", sira[-1:] == [3] and {4, 5, 6} <= set(sira)
          and "result" in yanit3 and os.path.isfile(hedef), sira)
    # 3) Ortasında iptal (ilk ilerlemeden sonra)
    hedef = os.path.join(k, "ortada.pdf")
    s.yaz({"id": 7, "method": "bicim_donustur", "params": {"ogeler": [{"yol": tif, "hedef": hedef, "hedefBicim": "pdf"}]}})
    s.bekle(lambda m: m.get("id") == 7 and "progress" in m and m["progress"]["yuzde"] >= 5)
    s.yaz({"id": 8, "method": "iptal", "params": {"id": 7}})
    m, _ = s.bekle(lambda m: m.get("id") == 7 and "progress" not in m)
    sonuc("ilerlemeden sonra iptal: -32800, hedef ve geçici dosya yok", m is not None and (m.get("error") or {}).get("code") == -32800
          and not os.path.exists(hedef) and not gecici_kalintilar(k), m)
    s.yaz({"id": 9, "method": "ping", "params": {}})
    m, _ = s.bekle(lambda m: m.get("id") == 9)
    sonuc("iptalden sonra çekirdek yanıt veriyor", m is not None and m.get("result", {}).get("ok") is True, m)
    s.kapat()
    # 4) Çekirdek kapanırken (girdi kapanınca) süren dönüştürme iptal edilir, yarım dosya kalmaz
    s = Surec(exe)
    hedef = os.path.join(k, "kapanis.pdf")
    s.yaz({"id": 1, "method": "bicim_donustur", "params": {"ogeler": [{"yol": tif, "hedef": hedef, "hedefBicim": "pdf"}]}})
    s.bekle(lambda m: m.get("id") == 1 and "progress" in m)
    t = time.time()
    s.p.stdin.close()
    try:
        s.p.wait(timeout=15)
        sure = time.time() - t
    except subprocess.TimeoutExpired:
        s.p.kill()
        sure = None
    if sure is not None and sure < 2.5 and os.path.isfile(hedef):
        atlandi("kapanışta iptal", "dönüştürme kapanış beklemesinden önce bitti (%.1f sn); daha büyük girdi gerekir" % sure)
    else:
        sonuc("kapanırken süren dönüştürme iptal edildi: süreç 8 sn'den önce çıktı, hedef ve geçici dosya yok",
              sure is not None and sure < 8 and not os.path.exists(hedef) and not gecici_kalintilar(k),
              "%s sn, %s" % (sure and round(sure, 1), os.listdir(k)))


def test_hedef_erisim(c, g):
    print("— Kilitli ve salt okunur hedef")
    if not WINDOWS:
        atlandi("kilitli hedef", "Windows'a özgü kilit")
        return
    k = temiz_klasor("erisim")
    kilitli_hedef = os.path.join(k, "kilitli.pdf")
    okuyucu_hedef = os.path.join(k, "okuyucuda.pdf")
    salt = os.path.join(k, "salt.pdf")
    serbest = os.path.join(k, "serbest.pdf")
    for yol in (kilitli_hedef, okuyucu_hedef, salt):
        with open(yol, "wb") as f:
            f.write(b"%PDF-1.4 eski icerik " + os.path.basename(yol).encode())
    os.chmod(salt, stat.S_IREAD)
    onceki = {y: md5(y) for y in (kilitli_hedef, okuyucu_hedef, salt)}
    try:
        with kilitli(kilitli_hedef, 0), kilitli(okuyucu_hedef, 1):
            r, _ = donustur(c, [{"yol": g["serit8"], "hedef": kilitli_hedef, "hedefBicim": "pdf"},
                                {"yol": g["serit8"], "hedef": okuyucu_hedef, "hedefBicim": "pdf"},
                                {"yol": g["serit8"], "hedef": salt, "hedefBicim": "pdf"},
                                {"yol": g["serit8"], "hedef": serbest, "hedefBicim": "pdf"}])
        s = r["sonuclar"]
        sonuc("özel kilitli hedef: 'kilitli', ileti tanınır, dosya değişmedi", s[0].get("kod") == "kilitli"
              and "başka bir programda açık olabilir" in s[0]["hata"] and md5(kilitli_hedef) == onceki[kilitli_hedef], s[0])
        sonuc("okuyucuda açık hedef: 'kilitli', dosya değişmedi", s[1].get("kod") == "kilitli" and md5(okuyucu_hedef) == onceki[okuyucu_hedef], s[1])
        sonuc("salt okunur hedef: 'salt_okunur', dosya değişmedi", s[2].get("kod") == "salt_okunur" and "salt okunur" in s[2]["hata"]
              and md5(salt) == onceki[salt], s[2])
        sonuc("öteki öğe yazıldı (hatalı öğeler işi durdurmaz)", "hata" not in s[3] and os.path.isfile(serbest) and r["basarili"] == 1
              and r["hatali"] == 3, s[3])
        sonuc("geçici dosya kalmadı", not gecici_kalintilar(k), gecici_kalintilar(k))
    finally:
        os.chmod(salt, stat.S_IWRITE | stat.S_IREAD)


def test_parametreler(c, g):
    print("— Parametre denetimi (bütün istek reddedilir)")
    k = temiz_klasor("parametre")
    tif = g["serit8"]
    for ad, ogeler in (
            (".bat hedef", [{"yol": tif, "hedef": os.path.join(k, "zararli.bat"), "hedefBicim": "pdf"}]),
            ("biçimle uyuşmayan uzantı", [{"yol": tif, "hedef": os.path.join(k, "a.tif"), "hedefBicim": "pdf"}]),
            ("Word hedefi .doc", [{"yol": g["metin_pdf"], "hedef": os.path.join(k, "a.doc"), "hedefBicim": "word"}]),
            ("bilinmeyen biçim", [{"yol": tif, "hedef": os.path.join(k, "a.exe"), "hedefBicim": "exe"}]),
            ("aynı hedef iki kez", [{"yol": tif, "hedef": os.path.join(k, "a.pdf"), "hedefBicim": "pdf"},
                                    {"yol": g["etiketsiz_g4"], "hedef": os.path.join(k, "A.PDF"), "hedefBicim": "pdf"}]),
            ("hedef kaynağın kendisi", [{"yol": g["metin_pdf"], "hedef": os.path.join(k, "a.tif"), "hedefBicim": "tiff"},
                                        {"yol": os.path.join(k, "a.tif"), "hedef": os.path.join(k, "b.pdf"), "hedefBicim": "pdf"}]),
            ("boş liste", [])):
        try:
            donustur(c, ogeler)
            sonuc("reddedilir: %s" % ad, False, "kabul edildi")
        except CagriHatasi as e:
            sonuc("reddedilir: %s" % ad, e.kod == -32000 and not [a for a in os.listdir(k)], str(e).splitlines()[0])
    r, _ = donustur(c, [{"yol": tif, "hedef": os.path.join(k, "ayni.tif"), "hedefBicim": "tiff"},
                        {"yol": os.path.join(k, "yok.tif"), "hedef": os.path.join(k, "yok.pdf"), "hedefBicim": "pdf"},
                        {"yol": tif, "hedef": os.path.join(k, "alt", "klasor", "yeni.pdf"), "hedefBicim": "pdf"}])
    s = r["sonuclar"]
    sonuc("aynı biçim: öğe hatası 'ayni_bicim'", s[0].get("kod") == "ayni_bicim", s[0])
    sonuc("olmayan kaynak: öğe hatası 'bulunamadi'", s[1].get("kod") == "bulunamadi", s[1])
    sonuc("hedef klasörü yoksa oluşturulur", "hata" not in s[2] and os.path.isfile(os.path.join(k, "alt", "klasor", "yeni.pdf")), s[2])


def test_zip_bombasi(c):
    print("— Zip bombası")
    k = temiz_klasor("zip")
    bomba = os.path.join(k, "bomba.udf")
    with zipfile.ZipFile(bomba, "w", zipfile.ZIP_DEFLATED) as z:
        with z.open("content.xml", "w") as f:
            f.write(b'<?xml version="1.0"?><template format_id="1.8"><content><![CDATA[')
            bos = b" " * (1 << 20)
            for _ in range(60):
                f.write(bos)
            f.write(b"]]></content></template>")
    sonuc("bomba üretildi (küçük dosya)", os.path.getsize(bomba) < 1 << 20, os.path.getsize(bomba))
    r, _ = c.cagir("donusum_bilgi", {"yol": bomba})
    sonuc("donusum_bilgi: UDF olarak tanınır, 'güvenli açılamaz' uyarısı", r["tur"] == "udf" and "güvenli açılamaz" in (r.get("uyari") or ""), r)
    r, _ = donustur(c, [{"yol": bomba, "hedef": os.path.join(k, "bomba.pdf"), "hedefBicim": "pdf"}])
    sonuc("bicim_donustur: öğe hatası 'guvensiz'", r["sonuclar"][0].get("kod") == "guvensiz", r["sonuclar"][0])
    if not c.exe:
        from islemler import donustur as d
        with zipfile.ZipFile(bomba) as z:
            try:
                d.zip_oku(z, "content.xml", en_fazla=1 << 20)
                sonuc("zip_oku: sınırı aşan öğe okunmaz", False, "okundu")
            except d.OgeHatasi as e:
                sonuc("zip_oku: sınırı aşan öğe okunmaz (açma sınırda durur)", e.kod == "guvensiz", str(e))
            bas = d.zip_oku(z, "content.xml", en_fazla=4096, kes=True)
            sonuc("zip_oku kes=True: yalnızca ilk baytlar", len(bas) == 4096 and bas.startswith(b"<?xml"), len(bas))


def test_dis_surec(c):
    if c.exe:
        atlandi("dış süreç", "exe kipinde modülün içi görülmüyor")
        return
    print("— Dış süreç (UDF / Word dönüştürücüleri için)")
    from islemler import donustur as d
    sayac = [0]
    il = d._Ilerleme({"_iptal_mi": lambda: sayac[0] >= 1})
    b = d.Baglam(None, d._Ilerleme({}))
    kod, cikti, _ = b.dis_surec([sys.executable, "-c", "import sys; print(sys.stdin.read().upper())"], sure=30, girdi=b"deneme")
    sonuc("dış süreç: girdi, çıktı, çıkış kodu", kod == 0 and cikti.strip() == b"DENEME", (kod, cikti))
    t = time.time()
    try:
        b.dis_surec([sys.executable, "-c", "import time; time.sleep(30)"], sure=1)
        sonuc("dış süreç: süre dolunca", False, "bitti")
    except TimeoutError as e:
        sonuc("dış süreç: süre dolunca öldürülür (TimeoutError)", time.time() - t < 5, "%.1f sn: %s" % (time.time() - t, e))
    b = d.Baglam(None, il)
    t = time.time()
    threading.Timer(0.6, lambda: sayac.__setitem__(0, 1)).start()
    try:
        b.dis_surec([sys.executable, "-c", "import time; time.sleep(30)"])
        sonuc("dış süreç: iptal", False, "bitti")
    except Exception as e:  # noqa: BLE001
        import pdefe_core
        sonuc("dış süreç: iptalde öldürülür (IptalEdildi)", isinstance(e, pdefe_core.IptalEdildi) and time.time() - t < 5,
              "%.1f sn %s" % (time.time() - t, type(e).__name__))


def test_zincir(c, g):
    """PDF olmayan → PDF olmayan dönüşüm geçici PDF üzerinden (deneme dönüştürücüsüyle: TIFF → UDF yerine sahte 'udf' hedefi)."""
    if c.exe:
        atlandi("zincir", "exe kipinde deneme dönüştürücüsü kaydedilemez")
        return
    print("— Zincir (PDF olmayan → PDF olmayan, geçici PDF üzerinden)")
    from islemler import donustur as d
    gorulen = []

    def sahte_udf(kaynak, cikti, secenekler, ilerleme, baglam):
        with open(kaynak, "rb") as f:
            gorulen.append((os.path.basename(kaynak), f.read(5), os.path.dirname(kaynak)))
        ilerleme(0.5, "yazılıyor")
        with open(cikti, "wb") as f:
            f.write(b"<template/>")
        return {"uyari": "deneme"}
    eski = d._DONUSTURUCULER.pop(("pdf", "udf"), None)
    d.donusturucu_kaydet("pdf", "udf", sahte_udf)
    try:
        k = temiz_klasor("zincir")
        r, _ = c.cagir("donusum_bilgi", {"yol": g["serit8"]})
        beklenen = (["pdf", "udf"] + (["word"] if ("pdf", "word") in d._DONUSTURUCULER else [])   # PDF → Word (0.2.6) de zincirlenir
                    + (["gorsel"] if ("pdf", "gorsel") in d._DONUSTURUCULER else []))                # PDF → JPG (0.2.7) de
        sonuc("TIFF'in hedeflerinde zincirle UDF görünür", [h["bicim"] for h in r["hedefler"]] == beklenen, r["hedefler"])
        r, _ = donustur(c, [{"yol": g["serit8"], "hedef": os.path.join(k, "zincir.udf"), "hedefBicim": "udf"}])
        s = r["sonuclar"][0]
        ara_silindi = gorulen and not os.path.exists(gorulen[0][2])
        sonuc("TIFF → (geçici PDF) → UDF: ikinci adım PDF aldı, geçici klasör silindi, sonuç yazıldı",
              "hata" not in s and gorulen and gorulen[0][1] == b"%PDF-" and ara_silindi and s.get("uyari") == "deneme"
              and os.path.isfile(os.path.join(k, "zincir.udf")) and not gecici_kalintilar(k), (s, gorulen))
        d.donusturucu_kaydet("pdf", "udf", sahte_udf, hazir=lambda: (False, "Deneme: kurulu değil."))
        r, _ = c.cagir("donusum_bilgi", {"yol": g["serit8"]})
        udf = next((h for h in r["hedefler"] if h["bicim"] == "udf"), {})
        sonuc("hazır olmayan dönüştürücü: hedef soluk, nedeniyle", udf.get("var") is False and udf.get("neden") == "Deneme: kurulu değil.", udf)
        r, _ = donustur(c, [{"yol": g["serit8"], "hedef": os.path.join(k, "yok.udf"), "hedefBicim": "udf"}])
        sonuc("hazır olmayan dönüştürücü: öğe hatası 'desteklenmiyor'", r["sonuclar"][0].get("kod") == "desteklenmiyor", r["sonuclar"][0])
    finally:
        d._DONUSTURUCULER.pop(("pdf", "udf"), None)
        if eski:
            d._DONUSTURUCULER[("pdf", "udf")] = eski


# ---------------------------------------------------------------- görüntü ↔ PDF (0.2.7)
def renkli_evrak(g, h, tohum):
    """Renkli antetli, yazılı evrak görüntüsü (fotoğraf ya da tarama gibi; kayıpsız karşılaştırma için keskin kenarlı)."""
    im = Image.new("RGB", (g, h), (252, 251, 248))
    d = ImageDraw.Draw(im)
    d.rectangle((int(g * 0.08), int(h * 0.04), int(g * 0.92), int(h * 0.08)), fill=(160, 20, 30))
    gri = metin_karesi(g, h, tohum, kip="L")
    im.paste((30, 30, 60), mask=gri.point(lambda v: 255 if v < 128 else 0))
    return im


def gorsel_girdileri():
    k = os.path.join(GIRDI, "gorsel")
    shutil.rmtree(k, ignore_errors=True)
    os.makedirs(k)
    gg = {}

    def yol(ad):
        return os.path.join(k, ad)
    # PNG: 300 dpi etiketli A4 (2480 × 3508), etiketsiz A4 150 dpi kadar (1240 × 1754), 96 dpi ekran görüntüsü
    gg["png300_im"] = renkli_evrak(2480, 3508, 101)
    gg["png300_im"].save(yol("a4_300.png"), dpi=(300, 300))
    gg["png300"] = yol("a4_300.png")
    gg["png_etiketsiz_im"] = renkli_evrak(1240, 1754, 102)
    gg["png_etiketsiz_im"].save(yol("a4_etiketsiz.png"))
    gg["png_etiketsiz"] = yol("a4_etiketsiz.png")
    gg["ekran_im"] = renkli_evrak(1920, 1080, 103)
    gg["ekran_im"].save(yol("ekran_96.png"), dpi=(96, 96))
    gg["ekran"] = yol("ekran_96.png")
    # JPEG: JFIF 200 dpi A4; EXIF yönü 6 (yatay saklanmış, dik görünür) 200 dpi; 72 dpi telefon fotoğrafı (4:3)
    renkli_evrak(1654, 2339, 104).save(yol("a4_200.jpg"), quality=85, dpi=(200, 200))
    gg["jpg200"] = yol("a4_200.jpg")
    dik = renkli_evrak(1654, 2339, 105)
    gg["jpg_yon6_gorunen"] = dik
    exif = Image.Exif()
    exif[0x0112] = 6
    dik.transpose(Image.Transpose.ROTATE_90).save(yol("yon6.jpg"), quality=85, dpi=(200, 200), exif=exif.tobytes())
    gg["jpg_yon6"] = yol("yon6.jpg")
    renkli_evrak(2016, 1512, 106).save(yol("telefon_72.jpg"), quality=85, dpi=(72, 72))
    gg["jpg72"] = yol("telefon_72.jpg")
    # Küçük görüntü (A4 kuralı 50 dpi'den az verir → 72 dpi), BMP, GIF (hareketli), WEBP (kayıplı / kayıpsız), AVIF, HEIC taklidi
    Image.new("RGB", (300, 200), (90, 160, 220)).save(yol("kucuk.png"))
    gg["kucuk"] = yol("kucuk.png")
    renkli_evrak(827, 1169, 107).save(yol("evrak.bmp"))
    gg["bmp"] = yol("evrak.bmp")
    kareler = [renkli_evrak(600, 848, 108).convert("P", palette=Image.Palette.ADAPTIVE), Image.new("P", (600, 848), 3)]
    kareler[0].save(yol("hareketli.gif"), save_all=True, append_images=kareler[1:], duration=200, loop=0)
    gg["gif"] = yol("hareketli.gif")
    renkli_evrak(827, 1169, 109).save(yol("kayipli.webp"), "WEBP", quality=80)
    gg["webp"] = yol("kayipli.webp")
    renkli_evrak(827, 1169, 110).save(yol("kayipsiz.webp"), "WEBP", lossless=True)
    gg["webp_kayipsiz"] = yol("kayipsiz.webp")
    from PIL import features
    if features.check("avif"):
        renkli_evrak(827, 1169, 111).save(yol("foto.avif"), "AVIF", quality=70)
        gg["avif"] = yol("foto.avif")
    with open(yol("foto.heic"), "wb") as f:   # HEIC'in kutu yapısının başı (açıcı yoksa yalnızca türü tanınır)
        f.write(b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic" + b"\x00" * 200)
    gg["heic"] = yol("foto.heic")
    with open(yol("metin_bm.txt"), "wb") as f:
        f.write(b"BM ile baslayan duz metin, goruntu degil.\n" * 3)
    gg["bm_metin"] = yol("metin_bm.txt")
    return gg


def test_gorsel_imza(c, gg):
    print("— Görüntünün türü imzasından")
    beklenen = [("png300", "png"), ("jpg200", "jpeg"), ("jpg_yon6", "jpeg"), ("bmp", "bmp"), ("gif", "gif"), ("webp", "webp"),
                ("avif", "avif"), ("heic", "heif")]
    for ad, alt in beklenen:
        if ad not in gg:
            atlandi("imza: %s" % ad, "Pillow'da AVIF yok")
            continue
        r, _ = c.cagir("donusum_bilgi", {"yol": gg[ad], "genislik": 160})
        sonuc("imza: %s → gorsel/%s" % (ad, alt), r["tur"] == "gorsel" and r["alt"] == alt, (r["tur"], r["alt"], r.get("uyari")))
    r, _ = c.cagir("donusum_bilgi", {"yol": gg["bm_metin"]})
    sonuc("\"BM\" ile başlayan düz metin görüntü sayılmaz", r["tur"] == "bilinmeyen", (r["tur"], r["alt"]))
    r, _ = c.cagir("donusum_bilgi", {"yol": gg["png300"], "genislik": 160})
    hedefler = [h["bicim"] for h in r["hedefler"]]
    sonuc("görüntünün hedefleri PDF, UDF, Word, TIFF (görüntü değil)", hedefler == ["pdf", "udf", "word", "tiff"]
          and next(h for h in r["hedefler"] if h["bicim"] == "pdf")["var"], r["hedefler"])
    sonuc("donusum_bilgi görüntü: sayfa 1, ölçü (300 dpi etiket → A4), küçük resim", r["sayfa"] == 1 and abs(r["genislik"] - A4[0]) < 1
          and abs(r["yukseklik"] - A4[1]) < 1 and r["dpi"] == 300 and r["dpiKaynagi"] == "etiket" and r["pngGenislik"] == 160
          and r["pikselGenislik"] == 2480, {x: r.get(x) for x in ("sayfa", "genislik", "yukseklik", "dpi", "dpiKaynagi", "pngGenislik")})
    r, _ = c.cagir("donusum_bilgi", {"yol": gg["jpg_yon6"], "genislik": 120})
    sonuc("donusum_bilgi EXIF yönlü JPEG: görünen yönde dik ölçü ve küçük resim", r["pikselGenislik"] == 1654 and r["pikselYukseklik"] == 2339
          and r["pngYukseklik"] > r["pngGenislik"] and r["yukseklik"] > r["genislik"], {x: r.get(x) for x in ("pikselGenislik", "genislik", "pngGenislik", "pngYukseklik")})
    r, _ = c.cagir("donusum_bilgi", {"yol": gg["gif"]})
    sonuc("hareketli GIF: ilk karenin dönüştürüleceği söylenir", "ilk kare" in (r.get("uyari") or ""), r.get("uyari"))
    r, _ = c.cagir("donusum_bilgi", {"yol": gg["heic"]})
    heic_var = bool((c.cagir("donusum_yetenekleri", {})[0].get("gorsel") or {}).get("heic"))
    if heic_var:
        atlandi("HEIC açıcısı yokken", "bu ortamda pillow-heif kurulu")
    else:
        pdf = next((h for h in r["hedefler"] if h["bicim"] == "pdf"), {})
        sonuc("HEIC (açıcı yok): hedefler yapılamaz, nedeni söylenir", pdf.get("var") is False and "HEIC" in (pdf.get("neden") or ""), pdf)
        k = temiz_klasor("heic")
        r2, _ = donustur(c, [{"yol": gg["heic"], "hedef": os.path.join(k, "foto.pdf"), "hedefBicim": "pdf"}])
        sonuc("HEIC (açıcı yok): dönüştürmede öğe hatası 'desteklenmiyor'", r2["sonuclar"][0].get("kod") == "desteklenmiyor", r2["sonuclar"][0])


def _gomulu_gorsel(yol):
    """PDF'in ilk sayfasındaki görselin (filtre, ham akış)."""
    d = pymupdf.open(yol, filetype="pdf")
    try:
        x = d[0].get_images(full=True)[0][0]
        return d.xref_get_key(x, "Filter")[1], d.xref_stream_raw(x)
    finally:
        d.close()


def test_gorsel_pdf(c, gg):
    print("— Görüntü → PDF")
    k = temiz_klasor("gorsel_pdf")
    vakalar = [
        # ad, girdi, (genişlik pt, yükseklik pt), dpi kaynağı, gömme
        ("300 dpi etiketli PNG (A4)", "png300", A4, "etiket", "kayipsiz"),
        ("etiketsiz PNG: uzun kenar A4 (150 dpi)", "png_etiketsiz", (1240 * 72 / 150.0, 1754 * 72 / 150.0), "a4", "kayipsiz"),
        ("96 dpi ekran görüntüsü: etiket sayılmaz, A4 kuralı", "ekran", (A4[1], 1080 * A4[1] / 1920), "a4", "kayipsiz"),
        ("200 dpi JPEG: olduğu gibi gömülü", "jpg200", (1654 * 72 / 200.0, 2339 * 72 / 200.0), "etiket", "ozgun"),
        ("EXIF yönü 6 JPEG: dik sayfa, olduğu gibi gömülü", "jpg_yon6", (1654 * 72 / 200.0, 2339 * 72 / 200.0), "etiket", "ozgun"),
        ("72 dpi telefon fotoğrafı: A4 kuralı (yatay)", "jpg72", (A4[1], 1512 * A4[1] / 2016), "a4", "ozgun"),
        ("küçük görüntü: 72 dpi", "kucuk", (300.0, 200.0), "varsayilan", "kayipsiz"),
        ("BMP: kayıpsız", "bmp", (827 * A4[1] / 1169, A4[1]), "a4", "kayipsiz"),
        ("kayıplı WEBP: JPEG 92", "webp", (827 * A4[1] / 1169, A4[1]), "a4", "jpeg"),
        ("kayıpsız WEBP: kayıpsız", "webp_kayipsiz", (827 * A4[1] / 1169, A4[1]), "a4", "kayipsiz"),
        ("hareketli GIF: ilk kare", "gif", (600 * A4[1] / 848, A4[1]), "a4", "kayipsiz"),
    ]
    if "avif" in gg:
        vakalar.append(("AVIF: JPEG 92", "avif", (827 * A4[1] / 1169, A4[1]), "a4", "jpeg"))
    ogeler = [{"yol": gg[v[1]], "hedef": os.path.join(k, v[1] + ".pdf"), "hedefBicim": "pdf"} for v in vakalar]
    r, il = donustur(c, ogeler)
    sonuc("%d görüntü tek istekte PDF'e: hepsi başarılı" % len(ogeler), r["basarili"] == len(ogeler),
          [(o["yol"], o.get("hata")) for o in r["sonuclar"] if "hata" in o])
    for v, o in zip(vakalar, r["sonuclar"]):
        if "hata" in o:
            continue
        ad, anahtar, olcu, kaynak, gomme = v
        oz = pdf_ozeti(o["hedef"])
        sonuc("%s: 1 sayfa %.1f × %.1f pt, dpi kaynağı %s, gömme %s" % (ad, olcu[0], olcu[1], kaynak, gomme),
              len(oz) == 1 and abs(oz[0]["g"] - olcu[0]) < 1 and abs(oz[0]["y"] - olcu[1]) < 1 and o.get("dpiKaynagi") == kaynak
              and o.get("gomme") == gomme and o.get("sayfa") == 1 and o.get("kaynakTur") == "gorsel",
              (round(oz[0]["g"], 1), round(oz[0]["y"], 1), o.get("dpiKaynagi"), o.get("gomme")))
    # Kayıpsız: PNG kendi çözünürlüğünde piksel piksel aynı
    yol = os.path.join(k, "png_etiketsiz.pdf")
    if os.path.exists(yol):
        sonuc("kayıpsız PNG: kendi çözünürlüğünde pikseller aynı", ayni(pdf_sayfa_goruntusu(yol, 0, 1240, 1754, renkli=True), gg["png_etiketsiz_im"]))
    # Özgün JPEG yeniden kodlanmadan: gömülü akış dosyanın baytları
    for anahtar in ("jpg200", "jpg_yon6"):
        yol = os.path.join(k, anahtar + ".pdf")
        if os.path.exists(yol):
            filtre, ham = _gomulu_gorsel(yol)
            with open(gg[anahtar], "rb") as f:
                ozgun = f.read()
            sonuc("%s: JPEG olduğu gibi gömülü (DCT, baytlar aynı)" % anahtar, filtre == "/DCTDecode" and ham == ozgun, (filtre, len(ham), len(ozgun)))
    # EXIF yönü: sayfa görünen görüntüyü gösterir (JPEG çözücü farkı küçük)
    yol = os.path.join(k, "jpg_yon6.pdf")
    if os.path.exists(yol):
        cizim = pdf_sayfa_goruntusu(yol, 0, 1654, 2339, renkli=True)
        fark = sum(ImageChops.difference(cizim, gg["jpg_yon6_gorunen"]).convert("L").getdata()) / (1654.0 * 2339)
        sonuc("EXIF yönü 6: sayfa görünen yönde (ortalama fark < 6)", fark < 6, round(fark, 2))
    o = r["sonuclar"][[v[1] for v in vakalar].index("gif")]
    sonuc("hareketli GIF: sonuçta ilk kare uyarısı", "ilk kare" in (o.get("uyari") or ""), o.get("uyari"))
    # Zincirler: görüntü → TIFF, → UDF, → Word (PDF üzerinden)
    r, _ = donustur(c, [{"yol": gg["png_etiketsiz"], "hedef": os.path.join(k, "zincir.tif"), "hedefBicim": "tiff", "secenekler": {"renk": "gri"}},
                        {"yol": gg["jpg200"], "hedef": os.path.join(k, "zincir.udf"), "hedefBicim": "udf"},
                        {"yol": gg["jpg200"], "hedef": os.path.join(k, "zincir.docx"), "hedefBicim": "word"}])
    durum = [(os.path.basename(o["hedef"]), o.get("hata") or "tamam") for o in r["sonuclar"]]
    sonuc("görüntü → TIFF / UDF / Word zinciri (PDF üzerinden)", r["sonuclar"][0].get("sayfa") == 1 and "hata" not in r["sonuclar"][0]
          and all("hata" not in o or o.get("kod") == "desteklenmiyor" for o in r["sonuclar"][1:]), durum)
    if "hata" not in r["sonuclar"][0]:
        kr = kare_listesi(os.path.join(k, "zincir.tif"))
        sonuc("görüntü → TIFF: 1 kare, gri, 150 dpi kalır (taranmış sayfa kendi çözünürlüğünde)", len(kr) == 1 and kr[0][0].mode == "L"
              and tuple(round(float(v)) for v in kr[0][1].get("dpi", (0, 0))) == (150, 150), [(x[0].mode, x[0].size, x[1].get("dpi")) for x in kr])
    sonuc("geçici dosya kalmadı", not gecici_kalintilar(k), gecici_kalintilar(k))


def test_gri16(c):
    """0.2.7 inceleme: 16 bitlik gri görüntü (tarayıcının "16 bit gri" ayarı; PNG ve TIFF, kip I;16). Pillow 12'de I kipinin point()'i işleve
    sayı değil ImagePointTransform verir (karşılaştırma yapılamaz): araclar._duzlestir değer aralığını önceden ölçer. Format Değiştir'de bilgi
    ve dönüştürme, Birleştir'de birleştirme; 8 bite indirgeme 256'ya bölmek (yalnızca 255'i aşan görüntüde)."""
    print("— 16 bitlik gri görüntü (0.2.7 inceleme)")
    k = temiz_klasor("gri16")
    im = Image.new("I;16", (400, 500), 40000)
    ImageDraw.Draw(im).rectangle((0, 0, 199, 499), fill=10000)   # sol yarı koyu (10000 / 256 ≈ 39), sağ yarı açık (40000 / 256 ≈ 156)
    png, tif = os.path.join(k, "gri16.png"), os.path.join(k, "gri16.tif")
    im.save(png)
    im.save(tif)
    dusuk = os.path.join(k, "gri16_dusuk.png")   # 16 bitlik kipte ama değerler 0–255 arası: bölünmez
    Image.new("I;16", (300, 200), 200).save(dusuk)
    with Image.open(png) as a, Image.open(tif) as b, Image.open(dusuk) as d:
        kipler = (a.mode, b.mode, d.mode)
    sonuc("girdiler 16 bitlik gri (I;16)", kipler == ("I;16", "I;16", "I;16"), kipler)
    for ad, yol in (("PNG", png), ("TIFF", tif)):
        try:
            r, _ = c.cagir("donusum_bilgi", {"yol": yol, "genislik": 120})
            pdf = next((h for h in r["hedefler"] if h["bicim"] == "pdf"), {})
            sonuc("16 bit %s: donusum_bilgi'de PDF hedefi yapılabilir, uyarı yok" % ad, pdf.get("var") is True and not r.get("hata") and not r.get("uyari"), (pdf, r.get("hata"), r.get("uyari")))
        except CagriHatasi as e:
            sonuc("16 bit %s: donusum_bilgi" % ad, False, str(e))
    r, _ = donustur(c, [{"yol": png, "hedef": os.path.join(k, "png.pdf"), "hedefBicim": "pdf"},
                        {"yol": tif, "hedef": os.path.join(k, "tif.pdf"), "hedefBicim": "pdf"},
                        {"yol": dusuk, "hedef": os.path.join(k, "dusuk.pdf"), "hedefBicim": "pdf"}])
    sonuc("16 bit PNG, TIFF ve 0–255 değerli 16 bit PNG → PDF: üçü de dönüştürüldü", r["basarili"] == 3, [(os.path.basename(o["yol"]), o.get("hata")) for o in r["sonuclar"]])

    def grilik(pdf, g_px, y_px, noktalar):
        if not os.path.exists(pdf):
            return None
        sayfa = pdf_sayfa_goruntusu(pdf, 0, g_px, y_px).convert("L")
        return [sayfa.getpixel(n) for n in noktalar]
    noktalar = [(100, 250), (300, 250)]
    for ad, pdf in (("PNG", "png.pdf"), ("TIFF", "tif.pdf")):
        v = grilik(os.path.join(k, pdf), 400, 500, noktalar)
        sonuc("16 bit %s → PDF: gri düzeyler 256'ya bölünmüş (koyu ≈ 39, açık ≈ 156)" % ad, v is not None and abs(v[0] - 39) <= 3 and abs(v[1] - 156) <= 3, v)
    v = grilik(os.path.join(k, "dusuk.pdf"), 300, 200, [(150, 100)])
    sonuc("0–255 değerli 16 bit PNG → PDF: değer olduğu gibi (200; bölünmez)", v is not None and abs(v[0] - 200) <= 3, v)
    r, _ = donustur(c, [{"yol": png, "hedef": os.path.join(k, "png.tif"), "hedefBicim": "tiff", "secenekler": {"renk": "gri"}}])
    sonuc("16 bit PNG → TIFF zinciri (PDF üzerinden)", "hata" not in r["sonuclar"][0], r["sonuclar"][0].get("hata"))
    try:
        r, _ = c.cagir("birlestir", {"ogeler": [{"yol": png, "tur": "gorsel"}, {"yol": tif, "tur": "gorsel"}], "hedef": os.path.join(k, "birlesik.pdf")})
        oz = pdf_ozeti(os.path.join(k, "birlesik.pdf"))
        sonuc("Birleştir: 16 bit PNG ve TIFF tek PDF'te (2 sayfa)", len(oz) == 2, oz)
    except CagriHatasi as e:
        sonuc("Birleştir: 16 bit PNG ve TIFF tek PDF'te", False, str(e))
    sonuc("geçici dosya kalmadı", not gecici_kalintilar(k), gecici_kalintilar(k))


def test_pdf_jpg(c, g):
    print("— PDF → JPG")
    k = temiz_klasor("pdf_jpg")
    bekl_300 = (math.ceil(A4[0] * 300 / 72 - 0.001), math.ceil(A4[1] * 300 / 72 - 0.001))
    bekl_200 = (math.ceil(A4[0] * 200 / 72 - 0.001), math.ceil(A4[1] * 200 / 72 - 0.001))
    for ad, secenek, dpi, olcu in (("varsayılan (300 dpi)", {}, 300, bekl_300), ("200 dpi (Düşük)", {"dpi": 200}, 200, bekl_200)):
        alt = os.path.join(k, str(dpi))
        os.makedirs(alt)
        hedef = os.path.join(alt, "metinli.jpg")
        r, _ = donustur(c, [{"yol": g["metin_pdf"], "hedef": hedef, "hedefBicim": "gorsel", "secenekler": secenek}])
        o = r["sonuclar"][0]
        beklenen = [os.path.join(alt, "metinli - Sayfa %d.jpg" % i) for i in (1, 2, 3)]
        sonuc("PDF → JPG %s: 3 sayfa üç dosya \"<ad> - Sayfa n.jpg\", sonuçta hedefler" % ad,
              "hata" not in o and o.get("hedefler") == beklenen and o.get("hedef") == beklenen[0] and sorted(os.listdir(alt)) == sorted(map(os.path.basename, beklenen)),
              (o.get("hata"), o.get("hedefler") and [os.path.basename(x) for x in o["hedefler"]], os.listdir(alt)))
        if "hata" in o:
            continue
        bilgi = []
        for y in beklenen:
            with Image.open(y) as im:
                bilgi.append((im.format, im.mode, im.size, tuple(round(float(v)) for v in im.info.get("dpi", (0, 0)))))
        sonuc("PDF → JPG %s: JPEG, RGB, %s, %d dpi etiketli" % (ad, olcu, dpi), all(b == ("JPEG", "RGB", olcu, (dpi, dpi)) for b in bilgi), bilgi)
        sonuc("PDF → JPG %s: sonuçta boyut ve sayfa" % ad, o.get("boyut") == sum(os.path.getsize(y) for y in beklenen) and o.get("sayfa") == 3,
              (o.get("boyut"), o.get("sayfa")))
    # Tek sayfa: hedefin kendisi
    tek = os.path.join(k, "tek.pdf")
    d = pymupdf.open(g["metin_pdf"])
    d.select([0])
    d.save(tek)
    d.close()
    r, _ = donustur(c, [{"yol": tek, "hedef": os.path.join(k, "tek.jpg"), "hedefBicim": "gorsel"}])
    o = r["sonuclar"][0]
    sonuc("tek sayfalı PDF → JPG: \"<ad>.jpg\"", o.get("hedefler") == [os.path.join(k, "tek.jpg")] and os.path.isfile(os.path.join(k, "tek.jpg")), o)
    # Taranmış sayfa (200 dpi tarama): 300 seçilse de büyütülmez
    ara = os.path.join(k, "tarama.pdf")
    donustur(c, [{"yol": g["etiketsiz_g4"], "hedef": ara, "hedefBicim": "pdf"}])
    r, _ = donustur(c, [{"yol": ara, "hedef": os.path.join(k, "tarama.jpg"), "hedefBicim": "gorsel", "secenekler": {"dpi": 300}}])
    o = r["sonuclar"][0]
    if "hata" in o:
        sonuc("taranmış PDF → JPG", False, o)
    else:
        with Image.open(o["hedefler"][0]) as im:
            sonuc("taranmış 200 dpi sayfa 300 seçilince 200 dpi kalır (büyütülmez)", im.size == (1654, 2339)
                  and tuple(round(float(v)) for v in im.info.get("dpi", (0, 0))) == (200, 200), (im.size, im.info.get("dpi")))
    # Zincir: TIFF → JPG
    r, _ = donustur(c, [{"yol": g["etiketsiz_g4"], "hedef": os.path.join(k, "tiff_zincir.jpg"), "hedefBicim": "gorsel"}])
    o = r["sonuclar"][0]
    sonuc("TIFF → JPG zinciri (PDF üzerinden): 3 dosya", len(o.get("hedefler") or []) == 3, o.get("hata") or [os.path.basename(x) for x in o.get("hedefler") or []])
    # Seçenek ve uzantı denetimi
    r, _ = donustur(c, [{"yol": g["metin_pdf"], "hedef": os.path.join(k, "x.jpg"), "hedefBicim": "gorsel", "secenekler": {"dpi": 150}}])
    sonuc("geçersiz JPG çözünürlüğü öğe hatası", r["sonuclar"][0].get("kod") == "gecersiz", r["sonuclar"][0])
    try:
        donustur(c, [{"yol": g["metin_pdf"], "hedef": os.path.join(k, "x.png"), "hedefBicim": "gorsel"}])
        sonuc("JPG hedefinin uzantısı .jpg / .jpeg olmalı", False, "kabul edildi")
    except CagriHatasi as e:
        sonuc("JPG hedefinin uzantısı .jpg / .jpeg olmalı", "JPG" in str(e) and ".jpg" in str(e), str(e))
    # İptal: hiçbir dosya ve geçici klasör kalmaz
    alt = os.path.join(k, "iptal")
    os.makedirs(alt)
    try:
        donustur(c, [{"yol": g["metin_pdf"], "hedef": os.path.join(alt, "i.jpg"), "hedefBicim": "gorsel"}], iptal_sonra=2)
        sonuc("PDF → JPG iptal", False, "iptal edilmedi")
    except CagriHatasi as e:
        sonuc("PDF → JPG iptal: -32800, dosya ve geçici klasör yok", e.kod == -32800 and not os.listdir(alt), (e.kod, os.listdir(alt)))
    sonuc("geçici dosya kalmadı", not gecici_kalintilar(k), gecici_kalintilar(k))


def test_cakisma(c, g):
    print("— Var olan hedef: üzerine yaz / yeni ad (0.2.7)")
    k = temiz_klasor("cakisma")
    var_olan = os.path.join(k, "metinli - Sayfa 2.jpg")
    with open(var_olan, "wb") as f:
        f.write(b"eski")
    r, _ = donustur(c, [{"yol": g["metin_pdf"], "hedef": os.path.join(k, "metinli.jpg"), "hedefBicim": "gorsel", "cakisma": "yeniAd"}])
    o = r["sonuclar"][0]
    beklenen = [os.path.join(k, "metinli (1) - Sayfa %d.jpg" % i) for i in (1, 2, 3)]
    sonuc("JPG, yeni ad: bir sayfa dosyası varsa bütün dosyalar \"(1)\" kökünde, var olana dokunulmaz",
          o.get("hedefler") == beklenen and md5(var_olan) == hashlib.md5(b"eski").hexdigest() and o.get("istenenHedef") == os.path.join(k, "metinli.jpg"),
          (o.get("hata"), [os.path.basename(x) for x in o.get("hedefler") or []]))
    r, _ = donustur(c, [{"yol": g["metin_pdf"], "hedef": os.path.join(k, "metinli.jpg"), "hedefBicim": "gorsel", "cakisma": "yeniAd"}])
    o = r["sonuclar"][0]
    sonuc("JPG, yeni ad ikinci kez: \"(2)\"", [os.path.basename(x) for x in o.get("hedefler") or []] == ["metinli (2) - Sayfa %d.jpg" % i for i in (1, 2, 3)],
          [os.path.basename(x) for x in o.get("hedefler") or []])
    r, _ = donustur(c, [{"yol": g["metin_pdf"], "hedef": os.path.join(k, "metinli.jpg"), "hedefBicim": "gorsel"}])
    o = r["sonuclar"][0]
    sonuc("JPG, üzerine yaz (varsayılan): var olan sayfa dosyası yenisiyle değişir", "hata" not in o and md5(var_olan) != hashlib.md5(b"eski").hexdigest()
          and "istenenHedef" not in o, o.get("hata"))
    tif = os.path.join(k, "belge.tif")
    with open(tif, "wb") as f:
        f.write(b"eski")
    r, _ = donustur(c, [{"yol": g["metin_pdf"], "hedef": tif, "hedefBicim": "tiff", "cakisma": "yeniAd"}])
    o = r["sonuclar"][0]
    sonuc("tek dosya, yeni ad: \"belge (1).tif\", var olana dokunulmaz", o.get("hedef") == os.path.join(k, "belge (1).tif") and md5(tif) == hashlib.md5(b"eski").hexdigest()
          and o.get("istenenHedef") == tif, (o.get("hata"), o.get("hedef")))
    r, _ = donustur(c, [{"yol": g["metin_pdf"], "hedef": os.path.join(k, "belge (1).tif"), "hedefBicim": "tiff", "cakisma": "yeniAd"}])
    sonuc("\"(1)\" ile biten ad varsa \"(2)\"", r["sonuclar"][0].get("hedef") == os.path.join(k, "belge (2).tif"), r["sonuclar"][0].get("hedef"))
    yil = os.path.join(k, "Rapor (2023).tif")
    with open(yil, "wb") as f:
        f.write(b"eski")
    r, _ = donustur(c, [{"yol": g["metin_pdf"], "hedef": yil, "hedefBicim": "tiff", "cakisma": "yeniAd"}])
    sonuc("\"(2023)\" gibi yıl sayı sayılmaz: \"Rapor (2023) (1).tif\" (arayüzün kuralı)", r["sonuclar"][0].get("hedef") == os.path.join(k, "Rapor (2023) (1).tif"),
          r["sonuclar"][0].get("hedef"))
    if WINDOWS:
        once = md5(os.path.join(k, "metinli - Sayfa 1.jpg"))
        with kilitli(var_olan):
            r, _ = donustur(c, [{"yol": g["metin_pdf"], "hedef": os.path.join(k, "metinli.jpg"), "hedefBicim": "gorsel"}])
        o = r["sonuclar"][0]
        sonuc("JPG, üzerine yaz, bir sayfa dosyası başka programda açık: öğe hatası, hiçbir dosya değişmedi",
              o.get("kod") == "kilitli" and md5(os.path.join(k, "metinli - Sayfa 1.jpg")) == once, (o.get("kod"), o.get("hata")))
    try:
        donustur(c, [{"yol": g["metin_pdf"], "hedef": os.path.join(k, "z.jpg"), "hedefBicim": "gorsel", "cakisma": "sor"}])
        sonuc("bilinmeyen çakışma seçeneği isteği reddeder", False, "kabul edildi")
    except CagriHatasi as e:
        sonuc("bilinmeyen çakışma seçeneği isteği reddeder", "çakışma" in str(e), str(e))
    # Çökmeden kalan çok dosyalı geçici klasör (pid'i çalışmayan çekirdek) sonraki açılışta silinir
    if not c.exe:
        from islemler import donustur as D
        olu_pid = 4000000 + random.Random().randint(1, 99999)
        kalan = os.path.join(k, "x.jpg.%d-0.pdefe-tmp" % olu_pid)
        os.makedirs(kalan)
        with open(os.path.join(kalan, "1.jpg"), "wb") as f:
            f.write(b"yarim")
        os.makedirs(os.path.dirname(D._kayit_dosyasi(olu_pid)), exist_ok=True)
        with open(D._kayit_dosyasi(olu_pid), "w", encoding="utf-8") as f:
            f.write(kalan + "\n")
        D.kalintilari_temizle()
        sonuc("çökmeden kalan çok dosyalı geçici klasör silindi", not os.path.exists(kalan) and not os.path.exists(D._kayit_dosyasi(olu_pid)))
    sonuc("geçici dosya kalmadı", not gecici_kalintilar(k), gecici_kalintilar(k))


def test_kalan_sayfalar(c, g):
    """0.2.7 inceleme: JPG'de önceki daha uzun dönüştürmenin fazla sayfaları. "Üzerine yaz"da yazılmaz ve silinmez, sonucun kalanlar alanında
    söylenir; "yeni ad"da ad dizisi önceki dönüştürmenin sonraki sayfasıyla sürüyorsa o ad dolu sayılır (sayfalar karışmaz)."""
    print("— JPG: önceki dönüştürmeden kalan sayfalar (0.2.7 inceleme)")
    k = temiz_klasor("kalan_sayfalar")
    uc = sentetik_pdf(os.path.join(k, "uc.pdf"), sayfa=3, tohum=21)
    iki = sentetik_pdf(os.path.join(k, "iki.pdf"), sayfa=2, tohum=22)
    alt = os.path.join(k, "cikti")
    os.makedirs(alt)
    hedef = os.path.join(alt, "Dilekce.jpg")
    donustur(c, [{"yol": uc, "hedef": hedef, "hedefBicim": "gorsel"}])
    ucuncu = os.path.join(alt, "Dilekce - Sayfa 3.jpg")
    once = md5(ucuncu)
    r, _ = donustur(c, [{"yol": iki, "hedef": hedef, "hedefBicim": "gorsel", "cakisma": "uzerineYaz"}])
    o = r["sonuclar"][0]
    sonuc("üzerine yaz, belge 3 → 2 sayfa: Sayfa 1 ve 2 yazıldı, önceki Sayfa 3 silinmedi ve sonuçta kalanlar'da",
          "hata" not in o and [os.path.basename(x) for x in o.get("hedefler") or []] == ["Dilekce - Sayfa 1.jpg", "Dilekce - Sayfa 2.jpg"]
          and md5(ucuncu) == once and o.get("kalanlar") == [ucuncu], (o.get("hata"), o.get("hedefler"), o.get("kalanlar")))
    r, _ = donustur(c, [{"yol": uc, "hedef": hedef, "hedefBicim": "gorsel", "cakisma": "uzerineYaz"}])
    sonuc("üzerine yaz, sayfa sayısı aynı: kalanlar yok", "hata" not in r["sonuclar"][0] and "kalanlar" not in r["sonuclar"][0], r["sonuclar"][0].get("kalanlar"))
    # Yeni ad: Sayfa 1 ve 2 yok ama önceki dönüştürmenin Sayfa 3'ü var → ad dizisi sürüyor, "(1)"
    alt2 = os.path.join(k, "cikti2")
    os.makedirs(alt2)
    with open(os.path.join(alt2, "Dilekce - Sayfa 3.jpg"), "wb") as f:
        f.write(b"eski")
    r, _ = donustur(c, [{"yol": iki, "hedef": os.path.join(alt2, "Dilekce.jpg"), "hedefBicim": "gorsel", "cakisma": "yeniAd"}])
    o = r["sonuclar"][0]
    sonuc("yeni ad: ad dizisinin sonraki sayfası (Sayfa 3) varsa \"(1)\" adları; var olana dokunulmaz",
          [os.path.basename(x) for x in o.get("hedefler") or []] == ["Dilekce (1) - Sayfa 1.jpg", "Dilekce (1) - Sayfa 2.jpg"]
          and o.get("istenenHedef") == os.path.join(alt2, "Dilekce.jpg") and md5(os.path.join(alt2, "Dilekce - Sayfa 3.jpg")) == hashlib.md5(b"eski").hexdigest(),
          (o.get("hata"), [os.path.basename(x) for x in o.get("hedefler") or []]))
    # Tek sayfada (hedefin kendisi) sonraki sayfa sayılmaz: "Dilekce.jpg" adı boş
    r, _ = donustur(c, [{"yol": _tek_sayfa(k, uc), "hedef": os.path.join(alt2, "Tek.jpg"), "hedefBicim": "gorsel", "cakisma": "yeniAd"}])
    sonuc("yeni ad, tek sayfa: \"<ad>.jpg\" boşsa o ad", [os.path.basename(x) for x in r["sonuclar"][0].get("hedefler") or []] == ["Tek.jpg"], r["sonuclar"][0].get("hedefler"))
    sonuc("geçici dosya kalmadı", not gecici_kalintilar(alt) and not gecici_kalintilar(alt2), (gecici_kalintilar(alt), gecici_kalintilar(alt2)))


def _tek_sayfa(k, kaynak):
    tek = os.path.join(k, "tek.pdf")
    d = pymupdf.open(kaynak)
    d.select([0])
    d.save(tek)
    d.close()
    return tek


def test_tahmin(c, g, gg):
    """0.2.7 (madde 8): donusum_tahmini, "İdeal" (300 dpi) ve "Düşük" (200 dpi) boyutları. Az sayfalı belgede kesin (dönüştürücünün kendi
    çizim ve kodlama yolu), çok sayfalıda örneklenmiş."""
    print("— Boyut tahmini (İdeal / Düşük)")
    k = temiz_klasor("tahmin")

    def gercek(yol, hedef, secenek):
        uz = ".tif" if hedef == "tiff" else ".jpg"
        alt = os.path.join(k, "g%d" % random.Random().randint(0, 10 ** 9))
        os.makedirs(alt)
        r, _ = donustur(c, [{"yol": yol, "hedef": os.path.join(alt, "c" + uz), "hedefBicim": hedef, "secenekler": secenek}])
        o = r["sonuclar"][0]
        return o.get("boyut")

    def yakin(a, b, pay):
        return a is not None and b is not None and abs(a - b) <= pay * max(b, 1)
    vakalar = [("3 sayfalı PDF → TIFF siyah-beyaz", g["metin_pdf"], "tiff", "sb", 0.03),
               ("3 sayfalı PDF → TIFF gri", g["metin_pdf"], "tiff", "gri", 0.03),
               ("3 sayfalı PDF → JPG", g["metin_pdf"], "gorsel", None, 0.01),
               ("TIFF (3 kare) → JPG", g["etiketsiz_g4"], "gorsel", None, 0.03),
               ("görüntü → TIFF renkli", gg["png_etiketsiz"], "tiff", "renkli", 0.03)]
    for ad, yol, hedef, renk, pay in vakalar:
        t0 = time.time()
        r, _ = c.cagir("donusum_tahmini", dict({"yollar": [yol], "hedefBicim": hedef}, **({"renk": renk} if renk else {})))
        sure = time.time() - t0
        secenek = {"renk": renk} if renk else {}
        ideal, dusuk = gercek(yol, hedef, dict(secenek, dpi=300)), gercek(yol, hedef, dict(secenek, dpi=200))
        sonuc("%s: kesin (örneklenmedi), İdeal ve Düşük gerçeğe %%%d yakın" % (ad, round(pay * 100)), r.get("tahmin") is False
              and yakin(r.get("ideal"), ideal, pay) and yakin(r.get("dusuk"), dusuk, pay) and r.get("eksik") == [],
              {"tahmin": (r.get("ideal"), r.get("dusuk")), "gerçek": (ideal, dusuk), "sn": round(sure, 2)})
    # Çok sayfalı belge: örneklenir
    uzun = sentetik_pdf(os.path.join(k, "uzun.pdf"), sayfa=24, tohum=17)
    t0 = time.time()
    r, il = c.cagir("donusum_tahmini", {"yollar": [uzun], "hedefBicim": "tiff"})
    sure = time.time() - t0
    ideal, dusuk = gercek(uzun, "tiff", {"dpi": 300}), gercek(uzun, "tiff", {"dpi": 200})
    o = r["ogeler"][0]
    sonuc("24 sayfalı PDF → TIFF: 5 sayfa örneklendi, gerçeğe %25 yakın, ilerleme bildirildi", r.get("tahmin") is True and o.get("ornek") == 5
          and o.get("sayfa") == 24 and yakin(r.get("ideal"), ideal, 0.25) and yakin(r.get("dusuk"), dusuk, 0.25) and il,
          {"tahmin": (r.get("ideal"), r.get("dusuk")), "gerçek": (ideal, dusuk), "sn": round(sure, 2), "ilerleme": len(il)})
    sonuc("24 sayfalı tahmin hızlı (< 6 sn)", sure < 6, round(sure, 2))
    t0 = time.time()
    r2, _ = c.cagir("donusum_tahmini", {"yollar": [uzun], "hedefBicim": "tiff"})
    sonuc("aynı tahmin ön bellekten (aynı sonuç, < 0,5 sn)", r2.get("ideal") == r.get("ideal") and time.time() - t0 < 0.5, round(time.time() - t0, 3))
    # Taranmış PDF: iki çözünürlükte aynı (sayfa kendi çözünürlüğünde kalır)
    ara = os.path.join(k, "tarama.pdf")
    donustur(c, [{"yol": g["etiketsiz_g4"], "hedef": ara, "hedefBicim": "pdf"}])
    r, _ = c.cagir("donusum_tahmini", {"yollar": [ara], "hedefBicim": "tiff"})
    sonuc("taranmış PDF → TIFF: İdeal = Düşük (tarama kendi çözünürlüğünde)", r.get("ideal") == r.get("dusuk") and r.get("ideal"),
          (r.get("ideal"), r.get("dusuk")))
    # Birden çok dosya, tahmin edilemeyenler
    udf = os.path.join(k, "belge.udf")
    with zipfile.ZipFile(udf, "w") as z:
        z.writestr("content.xml", '<?xml version="1.0" encoding="UTF-8" ?><template format_id="1.8"><content><![CDATA[x]]></content></template>')
    bos = os.path.join(k, "bilinmeyen.dat")
    with open(bos, "wb") as f:
        f.write(b"\x00" * 64)
    r, _ = c.cagir("donusum_tahmini", {"yollar": [g["metin_pdf"], udf, bos, g["metin_pdf"]], "hedefBicim": "gorsel"})
    tek, _ = c.cagir("donusum_tahmini", {"yollar": [g["metin_pdf"]], "hedefBicim": "gorsel"})
    sonuc("birden çok dosya: toplam tahmin edilenlerin toplamı, UDF ve tanınmayan dosya eksik'te nedeniyle",
          r.get("ideal") == 2 * tek.get("ideal") and r.get("sayfa") == 6 and r.get("eksik") == [os.path.abspath(udf), os.path.abspath(bos)]
          and all(o.get("neden") for o in r["ogeler"][1:3]), {"eksik": r.get("eksik"), "nedenler": [o.get("neden") for o in r["ogeler"]]})
    # Parametre denetimi ve iptal
    for ad, p in (("hedef PDF olamaz", {"yollar": [g["metin_pdf"]], "hedefBicim": "pdf"}),
                  ("bilinmeyen renk", {"yollar": [g["metin_pdf"]], "hedefBicim": "tiff", "renk": "mavi"}),
                  ("dosya yok", {"yollar": [], "hedefBicim": "tiff"})):
        try:
            c.cagir("donusum_tahmini", p)
            sonuc("tahmin parametresi reddedilir: %s" % ad, False, "kabul edildi")
        except CagriHatasi as e:
            sonuc("tahmin parametresi reddedilir: %s" % ad, e.kod == -32000, str(e))
    uzun2 = sentetik_pdf(os.path.join(k, "uzun2.pdf"), sayfa=30, tohum=19)
    try:
        c.cagir("donusum_tahmini", {"yollar": [uzun2], "hedefBicim": "tiff", "renk": "renkli"}, iptal_sonra=1)
        sonuc("tahmin iptal edilir", False, "iptal edilmedi")
    except CagriHatasi as e:
        sonuc("tahmin iptal edilir (-32800)", e.kod == -32800, (e.kod, str(e)))


def main():
    exe = None
    if "--exe" in sys.argv:
        exe = os.path.abspath(sys.argv[sys.argv.index("--exe") + 1])
        if not os.path.isfile(exe):
            print("exe bulunamadı:", exe)
            return 2
    hizli = "--hizli" in sys.argv
    os.makedirs(CIKTI, exist_ok=True)
    print("Girdiler üretiliyor…")
    g = girdileri_uret()
    gg = gorsel_girdileri()
    if not hizli:
        akis_dosyasi(150)
    c = Cagirici(exe)
    print("Çağrı yolu:", exe or "doğrudan modül")
    testler = [("yetenekler", lambda: test_yetenekler(c)), ("imza", lambda: test_imza(c)), ("mupdf_yalnizca_pdf", lambda: test_mupdf_yalnizca_pdf(c)),
               ("tiff_pdf", lambda: test_tiff_pdf(c, g)), ("pdf_tiff", lambda: test_pdf_tiff(c, g)), ("iptal", lambda: test_iptal(c, g)),
               ("hedef_erisim", lambda: test_hedef_erisim(c, g)), ("parametreler", lambda: test_parametreler(c, g)), ("zip_bombasi", lambda: test_zip_bombasi(c)),
               ("dis_surec", lambda: test_dis_surec(c)), ("zincir", lambda: test_zincir(c, g)), ("surec", lambda: test_surec(exe, g)),
               ("gorsel_imza", lambda: test_gorsel_imza(c, gg)), ("gorsel_pdf", lambda: test_gorsel_pdf(c, gg)), ("gri16", lambda: test_gri16(c)),
               ("pdf_jpg", lambda: test_pdf_jpg(c, g)), ("cakisma", lambda: test_cakisma(c, g)), ("kalan_sayfalar", lambda: test_kalan_sayfalar(c, g)), ("kalite_notlari", lambda: test_kalite_notlari(c, g)),
               ("tahmin", lambda: test_tahmin(c, g, gg))]
    if not exe:
        testler.insert(6, ("iptal_bayragi", test_iptal_bayragi))
    if not hizli:
        testler.append(("akis", lambda: test_akis(c)))
    # --yalniz ad1,ad2: yalnızca bu testler (adlar test_ önekisiz işlev adları: gri16, cakisma…)
    if "--yalniz" in sys.argv:
        secilen = set(sys.argv[sys.argv.index("--yalniz") + 1].split(","))
        testler = [x for x in testler if x[0] in secilen]
    for _, t in testler:
        try:
            t()
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            sonuc("İSTİSNA", False, repr(e))
    c.kapat()
    print("\nSonuç: %d/%d geçti%s." % (toplam - hata, toplam, ", %d HATA" % hata if hata else ""))
    return 1 if hata else 0


if __name__ == "__main__":
    sys.exit(main())
