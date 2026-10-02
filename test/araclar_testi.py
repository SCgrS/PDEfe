# -*- coding: utf-8 -*-
"""core/islemler/araclar.py uçtan uca testi: her yöntemi gerçek dosyalarla çağırır, çıktıları
test/cikti/araclar/ altına yazar, boyutları (MB), sayfa sayılarını, notların/yer imlerinin ve
Türkçe metnin korunduğunu doğrular; sonunda sonuç tablosunu yazdırır.

Çalıştırma:  .venv\\Scripts\\python.exe test\\araclar_testi.py [--exe core\\dist\\pdefe-core\\pdefe-core.exe]
--exe verilirse yöntemler doğrudan değil, paketlenmiş exe üzerinden JSON-RPC ile çağrılır.
"""
import os
import sys
import json
import time
import stat
import shutil
import hashlib
import contextlib
import subprocess
import traceback

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402

MASAUSTU = os.path.join(os.path.expanduser("~"), "Desktop", "PDF DENEME")
TEST_PDF = os.path.join(KOK, "test", "pdf")
CIKTI = os.path.join(KOK, "test", "cikti", "araclar")

TBK = os.path.join(MASAUSTU, "1.5.6098.pdf")               # 135 sayfa, metin
NOTLU = os.path.join(MASAUSTU, "DENEME PDF (2).pdf")       # 2 not
GORSELLI = os.path.join(MASAUSTU, "fdsafsd.pdf")           # 10 görsel
YATAY = os.path.join(MASAUSTU, "2099_83_EK-1_pdf.pdf")     # yatay sayfa
YERIMLI = os.path.join(TEST_PDF, "dergipark_3972595_ttk_tbk.pdf")   # 231 yer imi
BUYUK = os.path.join(TEST_PDF, "PDF32000_2008_yerimli.pdf")         # 756 sayfa 22 MB
TTK = os.path.join(TEST_PDF, "mevzuat_6102_TTK.pdf")

TURKCE_HARFLER = "şŞğĞıİöÖüÜçÇ"

sonuclar = []     # (yöntem, dosya, ok, ayrıntı)


def mb(b):
    return "%.2f MB" % (b / 1048576.0)


def kaydet_sonuc(yontem, dosya, ok, ayrinti=""):
    sonuclar.append((yontem, dosya, ok, ayrinti))
    print("  [%s] %-16s %-34s %s" % ("OK " if ok else "HATA", yontem, dosya[:34], ayrinti))


def turkce_var(doc, sayfa_sayisi=3):
    metin = "".join(doc[i].get_text() for i in range(min(sayfa_sayisi, doc.page_count)))
    return any(h in metin for h in TURKCE_HARFLER), metin


def belge_ozet(yol):
    d = pymupdf.open(yol)
    try:
        toc = d.get_toc()
        notlar = sum(1 for pg in d for a in pg.annots() if a.type[1] != "Popup")
        tr, metin = turkce_var(d)
        return {"sayfa": d.page_count, "toc": len(toc), "not": notlar, "turkce": tr,
                "metin": metin, "boyut": os.path.getsize(yol), "rot": [pg.rotation for pg in d],
                "rect": [(round(pg.rect.width), round(pg.rect.height)) for pg in d]}
    finally:
        d.close()


def md5(yol):
    with open(yol, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def notlu_pdf_uret(yol):
    """Masaüstündeki notlu deneme dosyası yoksa yerine: 6 sayfa, 1. sayfada notlu vurgu (+Popup) ve not (2 not)."""
    d = pymupdf.open()
    for i in range(6):
        d.new_page(width=595, height=842).insert_text((72, 100), "Deneme sayfası %d" % (i + 1), fontsize=18)
    pg = d[0]
    v = pg.add_highlight_annot(pymupdf.Rect(70, 82, 260, 106))
    v.set_info(content="Vurgu notu", title="Test")
    v.set_popup(pymupdf.Rect(300, 80, 500, 180))
    v.update()
    pg.add_text_annot(pymupdf.Point(400, 300), "Not").update()
    d.save(yol)
    d.close()
    return yol


def zengin_pdf_uret(yol, sayfa_sayisi=8):
    """Her sayfada "Sayfa N" metni, notlu vurgu (+Popup) ve not; 1. sayfada 3. sayfaya iç bağlantı, 2. sayfada dış bağlantı,
    5. sayfada 2. sayfaya iç bağlantı; iki düzeyli yer imleri (her sayfaya bir tane)."""
    d = pymupdf.open()
    for i in range(sayfa_sayisi):
        pg = d.new_page(width=595, height=842)
        pg.insert_text((72, 100), "Sayfa %d" % (i + 1), fontsize=24)
        v = pg.add_highlight_annot(pymupdf.Rect(70, 78, 190, 106))
        v.set_info(content="Vurgu notu %d" % (i + 1), title="Test")
        v.set_popup(pymupdf.Rect(300, 80, 500, 180))
        v.update()
        pg.add_text_annot(pymupdf.Point(400, 300), "Not %d" % (i + 1)).update()
    d[0].insert_link({"kind": pymupdf.LINK_GOTO, "from": pymupdf.Rect(72, 200, 250, 220), "page": 2, "to": pymupdf.Point(72, 100)})
    d[1].insert_link({"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(72, 200, 250, 220), "uri": "https://example.com/pdefe"})
    d[4].insert_link({"kind": pymupdf.LINK_GOTO, "from": pymupdf.Rect(72, 200, 250, 220), "page": 1, "to": pymupdf.Point(72, 100)})
    d.set_toc([[1, "Bölüm A", 1], [2, "A.1", 2], [2, "A.2", 3], [1, "Bölüm B", 4], [2, "B.1", 5], [2, "B.2", 6],
               [1, "Bölüm C", 7], [2, "C.1", 8]])
    d.save(yol)
    d.close()
    return yol


# Kopyalanan sayfada beklenen notlar (page.annots() Popup'ları vermez). insert_pdf Popup, yanıt (IRT) ve form alanı notlarını kopyalamaz;
# yapısal kayıt (yapisal.py tarif_belgesi), ayırma ve yeni belge aynı yolu kullanır (sayfa_ozeti popup sayısını ayrıca verir).
NOT_TURLERI = ["Highlight", "Text"]


def sayfa_ozeti(yol):
    """Sayfa başına: ilk metin satırı, not türleri (sıralı; Popup'sız), Popup sayısı, döndürme, bağlantılar; ayrıca yer imleri
    [(başlık, sayfa)]."""
    d = pymupdf.open(yol)
    try:
        sayfalar = []
        for pg in d:
            metin = pg.get_text().strip()
            sayfalar.append({"metin": metin.split("\n")[0] if metin else "", "not": sorted(a.type[1] for a in pg.annots()),
                             "popup": sum(1 for x in pg.annot_xrefs() if x[1] == pymupdf.PDF_ANNOT_POPUP),
                             "rot": pg.rotation, "rect": (round(pg.rect.width), round(pg.rect.height)),
                             "baglanti": [(l.get("page") if l["kind"] == pymupdf.LINK_GOTO else l.get("uri")) for l in pg.get_links()]})
        return sayfalar, [(t[1], t[2]) for t in d.get_toc()]
    finally:
        d.close()


@contextlib.contextmanager
def kilitli(yol, paylasim=0):
    """Dosyayı Windows'ta başka bir program gibi açık tutar (test/kilitle.py): paylasim=0 okumayı da engeller (özel kilit),
    1 (FILE_SHARE_READ) bir PDF okuyucu gibi yalnızca okumaya izin verir (yazma / yer değiştirme olmaz)."""
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


# ---------------------------------------------------------------- çağrı köprüsü
class Cagirici:
    """Doğrudan (modül) ya da exe üzerinden JSON-RPC."""

    def __init__(self, exe=None):
        self.exe = exe
        self.surec = None
        self.sayac = 0
        if exe:
            self.surec = subprocess.Popen([exe], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                          stderr=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1)
        else:
            import pdefe_core
            self.yontemler = pdefe_core.YONTEMLER

    def cagir(self, yontem, params):
        ilerlemeler = []
        if self.surec:
            self.sayac += 1
            self.surec.stdin.write(json.dumps({"id": self.sayac, "method": yontem, "params": params}, ensure_ascii=False) + "\n")
            self.surec.stdin.flush()
            while True:
                satir = self.surec.stdout.readline()
                if not satir:
                    raise RuntimeError("exe kapandı: " + self.surec.stderr.read())
                msg = json.loads(satir)
                if "progress" in msg:
                    ilerlemeler.append(msg["progress"])
                    continue
                if "error" in msg:
                    raise RuntimeError(msg["error"]["message"] + "\n" + (msg["error"].get("data") or ""))
                return msg["result"], ilerlemeler
        p = dict(params)
        p["_ilerleme"] = lambda y, m="": ilerlemeler.append({"yuzde": y, "mesaj": m})
        return self.yontemler[yontem](p), ilerlemeler

    def kapat(self):
        if self.surec:
            self.surec.stdin.close()
            self.surec.wait(timeout=10)


# ---------------------------------------------------------------- test görselleri
def test_gorselleri_uret():
    from PIL import Image, ImageDraw
    klasor = os.path.join(CIKTI, "gorseller")
    os.makedirs(klasor, exist_ok=True)
    yollar = {}
    # 1) Büyük JPEG (4000x3000) + EXIF yön 6 (90° saat yönü döndürülmeli)
    im = Image.new("RGB", (4000, 3000), (240, 200, 120))
    cz = ImageDraw.Draw(im)
    cz.rectangle((100, 100, 1900, 1400), fill=(40, 80, 200))
    cz.ellipse((2200, 1600, 3800, 2800), fill=(200, 40, 60))
    cz.text((150, 150), "PDEfe test JPEG şğıİ", fill=(255, 255, 255))
    exif = Image.Exif()
    exif[0x0112] = 6
    yollar["jpeg_exif"] = os.path.join(klasor, "buyuk_exif6.jpg")
    im.save(yollar["jpeg_exif"], quality=92, exif=exif.tobytes())
    # 2) Saydam PNG
    im = Image.new("RGBA", (800, 600), (0, 0, 0, 0))
    cz = ImageDraw.Draw(im)
    cz.ellipse((100, 100, 700, 500), fill=(30, 160, 90, 255))
    yollar["png_saydam"] = os.path.join(klasor, "saydam.png")
    im.save(yollar["png_saydam"])
    # 3) Çok sayfalı TIFF (3 kare)
    kareler = []
    for i, renk in enumerate([(255, 220, 220), (220, 255, 220), (220, 220, 255)]):
        k = Image.new("RGB", (1200, 1600), renk)
        ImageDraw.Draw(k).text((50, 50), "TIFF kare %d" % (i + 1), fill=(0, 0, 0))
        kareler.append(k)
    yollar["tiff_coklu"] = os.path.join(klasor, "coklu.tif")
    kareler[0].save(yollar["tiff_coklu"], save_all=True, append_images=kareler[1:], compression="tiff_lzw")
    # 4) WebP
    yollar["webp"] = os.path.join(klasor, "resim.webp")
    Image.new("RGB", (640, 480), (90, 90, 200)).save(yollar["webp"], quality=80)
    # 5) BMP yatay
    yollar["bmp"] = os.path.join(klasor, "yatay.bmp")
    Image.new("RGB", (1000, 400), (120, 200, 120)).save(yollar["bmp"])
    # 6) GIF paletli
    yollar["gif"] = os.path.join(klasor, "paletli.gif")
    Image.new("RGB", (300, 300), (250, 250, 100)).convert("P").save(yollar["gif"])
    # 7) 1-bit tarama benzeri PNG
    im = Image.new("1", (2480, 3508), 1)
    cz = ImageDraw.Draw(im)
    for y in range(200, 3300, 60):
        cz.line((200, y, 2280, y), fill=0, width=6)
    yollar["bitonal"] = os.path.join(klasor, "tarama_1bit.png")
    im.save(yollar["bitonal"])
    return yollar


# ---------------------------------------------------------------- testler
def test_sayfa_boyutlari(c):
    r, _ = c.cagir("sayfa_boyutlari", {"yol": YATAY})
    ok = r["sayfa"] == 3 and r["sayfalar"][0]["genislik"] > r["sayfalar"][0]["yukseklik"]
    kaydet_sonuc("sayfa_boyutlari", "2099_83_EK-1_pdf.pdf", ok, "%s dondurme=%s" % (r["sayfalar"][0], r["sayfalar"][0]["dondurme"]))


def test_kucult_tahmin(c):
    for yol in (GORSELLI, TBK, NOTLU, BUYUK):
        t = time.time()
        r, il = c.cagir("kucult_tahmin", {"yol": yol})
        sure = time.time() - t
        sv = r["seviyeler"]
        ok = all(sv[k]["boyut"] > 0 for k in ("asiri", "onerilen", "dusuk")) and sv["asiri"]["boyut"] <= sv["dusuk"]["boyut"] * 1.02
        if yol != BUYUK:
            ok = ok and sure < 3.0
        else:
            ok = ok and r["tahmin"] is True
        kaydet_sonuc("kucult_tahmin", os.path.basename(yol), ok,
                     "mevcut %s → asiri %s (%%%s) onerilen %s (%%%s) dusuk %s (%%%s) tahmin=%s %.2fs ilerleme=%d"
                     % (mb(r["mevcut"]), mb(sv["asiri"]["boyut"]), sv["asiri"]["yuzde"], mb(sv["onerilen"]["boyut"]),
                        sv["onerilen"]["yuzde"], mb(sv["dusuk"]["boyut"]), sv["dusuk"]["yuzde"], r["tahmin"], sure, len(il)))


def test_kucult_tahmin_seviyeler(c):
    # Renderer biçimi: yalnızca 'ozel' seviyesi, kendi dpi/kalitesiyle
    r, _ = c.cagir("kucult_tahmin", {"yol": GORSELLI, "dpi": 120, "kalite": 60, "seviyeler": {"ozel": {"dpi": 120, "kalite": 60}}})
    sv = r["seviyeler"]
    kaydet_sonuc("kucult_tahmin/ozel", "fdsafsd.pdf dpi=120 q=60", list(sv) == ["ozel"] and 0 < sv["ozel"]["boyut"] < r["mevcut"],
                 "ozel %s (%%%s) anahtarlar=%s" % (mb(sv["ozel"]["boyut"]), sv["ozel"]["yuzde"], list(sv)))
    # dpi+kalite verilip seviyeler verilmezse üçlüye 'ozel' eklenir
    r, _ = c.cagir("kucult_tahmin", {"yol": NOTLU, "dpi": 72, "kalite": 40})
    kaydet_sonuc("kucult_tahmin/+ozel", "DENEME PDF (2) dpi=72", set(r["seviyeler"]) == {"asiri", "onerilen", "dusuk", "ozel"}, sorted(r["seviyeler"]))
    try:
        c.cagir("kucult_tahmin", {"yol": NOTLU, "seviyeler": {"ozel": {"dpi": 5000, "kalite": 60}}})
        kaydet_sonuc("kucult_tahmin/hata", "dpi=5000", False, "hata beklenirdi")
    except Exception as e:
        kaydet_sonuc("kucult_tahmin/hata", "dpi=5000", "30-600" in str(e), str(e).splitlines()[0])


def test_kucult(c):
    for yol, seviye in ((GORSELLI, "asiri"), (GORSELLI, "onerilen"), (GORSELLI, "dusuk"), (NOTLU, "onerilen"),
                        (TBK, "onerilen"), (YERIMLI, "onerilen"), (TTK, "asiri")):
        once = belge_ozet(yol)
        hedef = os.path.join(CIKTI, "kucult_%s_%s" % (seviye, os.path.basename(yol)))
        t = time.time()
        r, il = c.cagir("kucult", {"yol": yol, "hedef": hedef, "seviye": seviye})
        sonra = belge_ozet(hedef)
        ok = (sonra["sayfa"] == once["sayfa"] and sonra["toc"] == once["toc"] and sonra["not"] == once["not"]
              and sonra["metin"] == once["metin"] and sonra["turkce"] == once["turkce"] and r["boyut"] == sonra["boyut"])
        kaydet_sonuc("kucult/" + seviye, os.path.basename(yol), ok,
                     "%s → %s (%%%s) uyari=%s sayfa=%d toc=%d not=%d metin_ayni=%s tr=%s %.2fs"
                     % (mb(r["oncekiBoyut"]), mb(r["boyut"]), r["yuzde"], r["uyari"], sonra["sayfa"], sonra["toc"],
                        sonra["not"], sonra["metin"] == once["metin"], sonra["turkce"], time.time() - t))
    # ozel seviye + hedef == yol (kopya üzerinde)
    kopya = os.path.join(CIKTI, "kucult_yerinde_fdsafsd.pdf")
    shutil.copy(GORSELLI, kopya)
    once = belge_ozet(kopya)
    r, _ = c.cagir("kucult", {"yol": kopya, "hedef": kopya, "seviye": "ozel", "dpi": 120, "kalite": 60})
    sonra = belge_ozet(kopya)
    ok = sonra["metin"] == once["metin"] and sonra["sayfa"] == once["sayfa"] and r["boyut"] == sonra["boyut"] and not os.path.exists(kopya + ".pdefe-tmp")
    kaydet_sonuc("kucult/ozel yerinde", "fdsafsd.pdf", ok, "%s → %s dpi=120 q=60" % (mb(r["oncekiBoyut"]), mb(r["boyut"])))
    # Önbellekte FARKLI harf düzeniyle açıkken yerinde yazma (renderer ham yolu gönderir;
    # 'c:\PROJELER\..' ile 'C:\projeler\..' aynı dosyadır; bırakılmazsa os.replace WinError 5 verir)
    kopya2 = os.path.join(CIKTI, "kucult_onbellek_fdsafsd.pdf")
    shutil.copy(GORSELLI, kopya2)
    farkli = kopya2[0].swapcase() + kopya2[1:].replace("projeler", "PROJELER")
    c.cagir("sayfa_boyutlari", {"yol": farkli})      # önbelleğe farklı anahtarla al
    try:
        r, _ = c.cagir("kucult", {"yol": kopya2, "hedef": kopya2, "seviye": "asiri"})
        r2, _ = c.cagir("sayfalar_uygula", {"yol": kopya2, "hedef": kopya2,
                                            "tarif": [{"kaynak": farkli, "sayfa": 1, "dondurme": 0}]})
        kaydet_sonuc("kucult/onbellek", "farklı harf düzeniyle açıkken", r2["sayfa"] == 1 and r["boyut"] > 0,
                     "kucult %s → %s, sonra sayfalar_uygula sayfa=%d" % (mb(r["oncekiBoyut"]), mb(r["boyut"]), r2["sayfa"]))
    except Exception as e:
        kaydet_sonuc("kucult/onbellek", "farklı harf düzeniyle açıkken", False, str(e).splitlines()[0])
    # hatalı seviye
    try:
        c.cagir("kucult", {"yol": GORSELLI, "hedef": kopya, "seviye": "yok"})
        kaydet_sonuc("kucult/hata", "seviye=yok", False, "hata beklenirdi")
    except Exception as e:
        kaydet_sonuc("kucult/hata", "seviye=yok", "Bilinmeyen seviye" in str(e), str(e).splitlines()[0])


def test_sayfalar_uygula(c):
    once = belge_ozet(YERIMLI)
    hedef = os.path.join(CIKTI, "sayfalar_yerimli.pdf")
    # 1-3 (3. sayfa 90°), boş sayfa, 10, boş (özel boyut), 5-6, NOTLU 1 (ek belge)
    tarif = ([{"kaynak": YERIMLI, "sayfa": s, "dondurme": 90 if s == 3 else 0} for s in (1, 2, 3)]
             + [{"kaynak": None, "sayfa": None, "dondurme": 0},
                {"kaynak": YERIMLI, "sayfa": 10, "dondurme": 0},
                {"kaynak": None, "sayfa": None, "dondurme": 0, "genislik": 400, "yukseklik": 300},
                {"kaynak": YERIMLI, "sayfa": 5, "dondurme": 180},
                {"kaynak": YERIMLI, "sayfa": 6, "dondurme": 0},
                {"kaynak": NOTLU, "sayfa": 1, "dondurme": 0}])
    t = time.time()
    r, il = c.cagir("sayfalar_uygula", {"yol": YERIMLI, "hedef": hedef, "tarif": tarif})
    sonra = belge_ozet(hedef)
    d = pymupdf.open(hedef)
    toc = d.get_toc()
    toc_sayfalar = sorted(set(s for _, _, s in toc))
    notlar_son = sum(1 for a in d[-1].annots() if a.type[1] != "Popup")
    d.close()
    ok = (sonra["sayfa"] == 9 and sonra["rot"][2] == 90 and sonra["rot"][6] == 180 and sonra["rect"][5] == (400, 300)
          and sonra["rect"][3] == sonra["rect"][2] and all(s in (1, 2, 3, 5, 7, 8) for s in toc_sayfalar) and len(toc) > 0
          and len(toc) < once["toc"] and notlar_son == 2)
    kaydet_sonuc("sayfalar_uygula", "dergipark_3972595 + notlu", ok,
                 "sayfa=%d rot=%s rect[5]=%s toc %d→%d (sayfalar %s) son sayfa not=%d %s %.2fs"
                 % (sonra["sayfa"], sonra["rot"], sonra["rect"][5], once["toc"], len(toc), toc_sayfalar, notlar_son, mb(sonra["boyut"]), time.time() - t))
    # Yerinde: kopya, ters sıra + sayfa silme; metin/toc korunuyor mu
    kopya = os.path.join(CIKTI, "sayfalar_yerinde_tbk.pdf")
    shutil.copy(TBK, kopya)
    once = belge_ozet(kopya)
    tarif = [{"kaynak": kopya, "sayfa": s, "dondurme": 0} for s in range(1, 21)]
    r, _ = c.cagir("sayfalar_uygula", {"yol": kopya, "hedef": kopya, "tarif": tarif})
    sonra = belge_ozet(kopya)
    ok = sonra["sayfa"] == 20 and sonra["metin"] == once["metin"] and sonra["turkce"]
    kaydet_sonuc("sayfalar_uygula", "yerinde (ilk 20 sayfa)", ok, "sayfa=%d metin_ayni=%s tr=%s %s"
                 % (sonra["sayfa"], sonra["metin"] == once["metin"], sonra["turkce"], mb(sonra["boyut"])))
    # Hata: sınır dışı
    try:
        c.cagir("sayfalar_uygula", {"yol": TBK, "hedef": kopya, "tarif": [{"kaynak": TBK, "sayfa": 999}]})
        kaydet_sonuc("sayfalar_uygula/hata", "sayfa=999", False, "hata beklenirdi")
    except Exception as e:
        kaydet_sonuc("sayfalar_uygula/hata", "sayfa=999", "sınır dışı" in str(e), str(e).splitlines()[0])


def test_ayir(c):
    """Ayır (0.1.25): dosya adlarını renderer verir (parcalar). Birden çok dosya "Ayrılmış - Sayfa 1-3.pdf"…, tek dosya "Ayrılmış.pdf"
    (sırasız ve yinelenen sayfalar sıralı, tekrarsız yazılır); uzerineYaz=False'ta var olan ada "(2)" eklenir, varsayılanda aynı ad
    yeniden yazılır; yer imleri, notlar ve Türkçe metin korunur; hatalı parça ve özgün dosyanın kendisi reddedilir."""
    klasor = os.path.join(CIKTI, "ayir")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)
    parcalar = [{"ad": "Ayrılmış - Sayfa 1-3.pdf", "sayfalar": [1, 2, 3]}, {"ad": "Ayrılmış - Sayfa 5.pdf", "sayfalar": [5]},
                {"ad": "Ayrılmış - Sayfa 8-10.pdf", "sayfalar": [8, 9, 10]}]
    r, il = c.cagir("ayir", {"yol": YERIMLI, "klasor": klasor, "parcalar": parcalar, "uzerineYaz": False})
    adlar = [os.path.basename(x) for x in r["dosyalar"]]
    d = pymupdf.open(r["dosyalar"][0])
    toc1 = d.get_toc()
    tr1, _ = turkce_var(d)
    d.close()
    ok = (adlar == ["Ayrılmış - Sayfa 1-3.pdf", "Ayrılmış - Sayfa 5.pdf", "Ayrılmış - Sayfa 8-10.pdf"]
          and belge_ozet(r["dosyalar"][2])["sayfa"] == 3 and all(1 <= s <= 3 for _, _, s in toc1)
          and [a["sayfa"] for a in r["ayrintilar"]] == [3, 1, 3] and r["ayrintilar"][0]["boyut"] == os.path.getsize(r["dosyalar"][0])
          and (not il or il[-1]["yuzde"] < 100))   # son dosyadan sonra ilerleme (iptal denetimi) yok
    kaydet_sonuc("ayir/ayrı ayrı", "dergipark_3972595", ok, "%s toc(1-3)=%d tr=%s boyutlar=%s son ilerleme=%s"
                 % (adlar, len(toc1), tr1, [mb(os.path.getsize(x)) for x in r["dosyalar"]], il[-1] if il else None))
    # Yeniden, var olanın üzerine yazmadan: "(2)" eki
    r2, _ = c.cagir("ayir", {"yol": YERIMLI, "klasor": klasor, "parcalar": parcalar[:1], "uzerineYaz": False})
    kaydet_sonuc("ayir/benzersiz", "1-3 yeniden", os.path.basename(r2["dosyalar"][0]) == "Ayrılmış - Sayfa 1-3 (2).pdf", os.path.basename(r2["dosyalar"][0]))
    # Tek dosya: sırasız ve yinelenen sayfalar sıralı, tekrarsız; notlar korunur
    r, _ = c.cagir("ayir", {"yol": NOTLU, "klasor": klasor, "parcalar": [{"ad": "Ayrılmış.pdf", "sayfalar": [5, 1, 2, 2]}]})
    oz = belge_ozet(r["dosyalar"][0])
    kaydet_sonuc("ayir/tek dosya", "DENEME PDF (2) [5,1,2,2]", os.path.basename(r["dosyalar"][0]) == "Ayrılmış.pdf" and oz["sayfa"] == 3
                 and oz["not"] == belge_ozet(NOTLU)["not"], "%s sayfa=%d not=%d" % (os.path.basename(r["dosyalar"][0]), oz["sayfa"], oz["not"]))
    # Tek dosya, aynı ad (uzerineYaz varsayılan: renderer kullanıcıya sordu): aynı dosya yeniden yazılır
    r3, _ = c.cagir("ayir", {"yol": NOTLU, "klasor": klasor, "parcalar": [{"ad": "Ayrılmış.pdf", "sayfalar": [1]}]})
    kaydet_sonuc("ayir/aynı ada yazar", "Ayrılmış.pdf", r3["dosyalar"] == r["dosyalar"] and belge_ozet(r3["dosyalar"][0])["sayfa"] == 1
                 and not [a for a in os.listdir(klasor) if "Ayrılmış (2)" in a or a.endswith(".pdefe-tmp")], os.listdir(klasor))
    # Her sayfa ayrı dosya
    parcalar = [{"ad": "Ayrılmış - Sayfa %d.pdf" % s, "sayfalar": [s]} for s in range(1, 4)]
    r, _ = c.cagir("ayir", {"yol": YATAY, "klasor": klasor, "parcalar": parcalar, "uzerineYaz": False})
    kaydet_sonuc("ayir/her sayfa", "2099_83_EK-1", [os.path.basename(x) for x in r["dosyalar"]] == [p["ad"] for p in parcalar]
                 and all(belge_ozet(x)["sayfa"] == 1 for x in r["dosyalar"]), [os.path.basename(x) for x in r["dosyalar"]])
    # Hatalı istekler: sınır dışı sayfa, ad yok, parça yok, özgün dosyanın kendisi (kopyası üzerinde: değişmemeli)
    kopya = os.path.join(klasor, "kopya.pdf")
    shutil.copy(YATAY, kopya)
    once = md5(kopya)
    for ad, params in (("sayfa 0", {"parcalar": [{"ad": "x.pdf", "sayfalar": [0]}]}), ("sayfa 99", {"parcalar": [{"ad": "x.pdf", "sayfalar": [99]}]}),
                       ("ad yok", {"parcalar": [{"sayfalar": [1]}]}), ("parça yok", {"parcalar": []}),
                       ("özgün dosya", {"parcalar": [{"ad": "kopya.pdf", "sayfalar": [1]}]})):
        try:
            c.cagir("ayir", dict({"yol": kopya, "klasor": klasor}, **params))
            kaydet_sonuc("ayir/hata", ad, False, "hata beklenirdi")
        except Exception as e:
            kaydet_sonuc("ayir/hata", ad, md5(kopya) == once and not os.path.exists(os.path.join(klasor, "x.pdf")), str(e).splitlines()[0])


def test_gorsel_bilgi(c, g):
    r, _ = c.cagir("gorsel_bilgi", {"yol": g["jpeg_exif"]})
    ok = r["tur"] == "gorsel" and r["genislik"] == 3000 and r["yukseklik"] == 4000 and r["pngGenislik"] == 220 and len(r["png"]) > 100
    kaydet_sonuc("gorsel_bilgi", "buyuk_exif6.jpg", ok, "EXIF sonrası %dx%d, png %dx%d, %s" % (r["genislik"], r["yukseklik"], r["pngGenislik"], r["pngYukseklik"], mb(r["boyut"])))
    r, _ = c.cagir("gorsel_bilgi", {"yol": g["tiff_coklu"]})
    kaydet_sonuc("gorsel_bilgi", "coklu.tif", r["sayfa"] == 3, "kare=%d %dx%d" % (r["sayfa"], r["genislik"], r["yukseklik"]))
    r, _ = c.cagir("gorsel_bilgi", {"yol": YATAY})
    kaydet_sonuc("gorsel_bilgi", "2099_83_EK-1_pdf.pdf", r["tur"] == "pdf" and r["sayfa"] == 3 and r["pngGenislik"] == 220, "sayfa=%d %dx%d pt" % (r["sayfa"], r["genislik"], r["yukseklik"]))
    r, _ = c.cagir("gorsel_bilgi", {"yol": YATAY, "genislik": 144})
    r2, _ = c.cagir("gorsel_bilgi", {"yol": g["bmp"], "genislik": 144})
    kaydet_sonuc("gorsel_bilgi/genislik", "144 px (pdf + bmp)", r["pngGenislik"] == 144 and r2["pngGenislik"] == 144, "pdf %dx%d, bmp %dx%d" % (r["pngGenislik"], r["pngYukseklik"], r2["pngGenislik"], r2["pngYukseklik"]))


def test_boyut_tahmini(c, g):
    for kalite in ("orijinal", "yuksek", "orta", "dusuk"):
        r, _ = c.cagir("boyut_tahmini", {"oge": {"yol": g["jpeg_exif"], "tur": "gorsel", "kalite": kalite, "sayfaBoyutu": "a4"}})
        kaydet_sonuc("boyut_tahmini", "jpeg %s" % kalite, r["boyut"] > 0, mb(r["boyut"]))
    r, _ = c.cagir("boyut_tahmini", {"oge": {"yol": GORSELLI, "tur": "pdf", "kalite": "dusuk"}})
    kaydet_sonuc("boyut_tahmini", "fdsafsd.pdf dusuk", 0 < r["boyut"] < os.path.getsize(GORSELLI), mb(r["boyut"]))
    # Renderer biçimi: çoğul ogeler + genel 'kalite'; bozuk öğe yalnızca kendi hatasını alır
    ogeler = [{"yol": g["jpeg_exif"], "tur": "gorsel", "sayfaBoyutu": "a4"}, {"yol": GORSELLI, "tur": "pdf"},
              {"yol": g["webp"], "tur": "gorsel", "kalite": "orijinal"}, {"yol": os.path.join(CIKTI, "yok.png"), "tur": "gorsel"}]
    r, il = c.cagir("boyut_tahmini", {"ogeler": ogeler, "kalite": "dusuk", "istek": 7})
    L = r["ogeler"]
    ok = (len(L) == 4 and 0 < L[0]["boyut"] < 100000 and 0 < L[1]["boyut"] < os.path.getsize(GORSELLI)
          and L[2]["boyut"] > 0 and L[3]["boyut"] is None and "bulunamadı" in L[3]["hata"]
          and r["toplam"] == sum(x["boyut"] for x in L[:3]))
    kaydet_sonuc("boyut_tahmini/ogeler", "4 öğe (biri yok)", ok, "boyutlar=%s toplam=%s ilerleme=%d" % ([mb(x["boyut"]) if x["boyut"] else x.get("hata", "")[:30] for x in L], mb(r["toplam"]), len(il)))


def test_birlestir(c, g):
    hedef = os.path.join(CIKTI, "birlestir_karisik.pdf")
    ogeler = [
        {"yol": NOTLU, "tur": "pdf", "kalite": "orijinal"},
        {"yol": g["jpeg_exif"], "tur": "gorsel", "kalite": "orta", "sayfaBoyutu": "a4", "kenar": 28},
        {"yol": g["png_saydam"], "tur": "gorsel", "kalite": "orijinal", "sayfaBoyutu": "orijinal", "kenar": 0},
        {"yol": g["tiff_coklu"], "tur": "gorsel", "kalite": "dusuk", "sayfaBoyutu": "a4"},
        {"yol": g["webp"], "tur": "gorsel", "sayfaBoyutu": "a4", "dondurme": 90},
        {"yol": g["bmp"], "tur": "gorsel", "kalite": "yuksek", "sayfaBoyutu": "a4"},
        {"yol": g["gif"], "tur": "gorsel", "kalite": "orijinal", "sayfaBoyutu": "orijinal", "kenar": 20},
        {"yol": g["bitonal"], "tur": "gorsel", "kalite": "orta", "sayfaBoyutu": "a4"},
        {"yol": YERIMLI, "tur": "pdf", "kalite": "dusuk", "dondurme": 90},
        {"yol": YATAY, "tur": "pdf"},
    ]
    t = time.time()
    r, il = c.cagir("birlestir", {"ogeler": ogeler, "hedef": hedef, "genelKalite": "orta"})
    oz = belge_ozet(hedef)
    d = pymupdf.open(hedef)
    n_notlu = belge_ozet(NOTLU)
    n_yer = belge_ozet(YERIMLI)
    beklenen_sayfa = n_notlu["sayfa"] + 1 + 1 + 3 + 1 + 1 + 1 + 1 + n_yer["sayfa"] + 3
    # 2. görsel sayfası (jpeg exif, dikey 3000x4000 → dikey A4)
    s_jpeg = d[n_notlu["sayfa"]].rect
    s_png = d[n_notlu["sayfa"] + 1].rect
    s_webp = d[n_notlu["sayfa"] + 5].rect
    s_bmp = d[n_notlu["sayfa"] + 6].rect
    jpeg_img = d[n_notlu["sayfa"]].get_images()[0]
    jpeg_px = (jpeg_img[2], jpeg_img[3])
    toc = d.get_toc()
    toc_min = min((s for _, _, s in toc), default=0)
    yer_rot = d[n_notlu["sayfa"] + 9].rotation
    d.close()
    ok = (oz["sayfa"] == beklenen_sayfa and oz["not"] == n_notlu["not"] and round(s_jpeg.width) == 595
          and round(s_png.width) == 800 and round(s_png.height) == 600 and s_bmp.width > s_bmp.height
          and s_webp.width < s_webp.height and jpeg_px[1] <= 2200 and len(toc) == n_yer["toc"]
          and toc_min == n_notlu["sayfa"] + 10 and yer_rot == 90)
    kaydet_sonuc("birlestir", "10 öğe (pdf+7 görsel)", ok,
                 "sayfa=%d/%d not=%d jpeg→%dx%d px png sayfası=%dx%d webp(90°) sayfası=%dx%d toc=%d (ilk sayfa %d) yerimli rot=%d %s %.2fs"
                 % (oz["sayfa"], beklenen_sayfa, oz["not"], jpeg_px[0], jpeg_px[1], round(s_png.width), round(s_png.height),
                    round(s_webp.width), round(s_webp.height), len(toc), toc_min, yer_rot, mb(oz["boyut"]), time.time() - t))
    # Yalnızca PDF'ler orijinal: metin + notlar + Türkçe korunuyor mu
    hedef2 = os.path.join(CIKTI, "birlestir_pdf.pdf")
    r, _ = c.cagir("birlestir", {"ogeler": [{"yol": TBK, "tur": "pdf"}, {"yol": NOTLU, "tur": "pdf"}], "hedef": hedef2, "kalite": "orijinal"})
    oz = belge_ozet(hedef2)
    tbk = belge_ozet(TBK)
    ok = (oz["sayfa"] == tbk["sayfa"] + n_notlu["sayfa"] and oz["not"] == n_notlu["not"] and oz["metin"] == tbk["metin"]
          and oz["turkce"] and r["yol"] == hedef2)
    kaydet_sonuc("birlestir", "TBK + notlu (orijinal)", ok, "sayfa=%d not=%d metin_ayni=%s tr=%s %s"
                 % (oz["sayfa"], oz["not"], oz["metin"] == tbk["metin"], oz["turkce"], mb(oz["boyut"])))
    # HEIC hatası anlaşılır mı
    heic = os.path.join(CIKTI, "gorseller", "yok.heic")
    open(heic, "wb").write(b"\x00" * 10)
    try:
        c.cagir("birlestir", {"ogeler": [{"yol": heic, "tur": "gorsel"}], "hedef": hedef2})
        kaydet_sonuc("birlestir/heic", "yok.heic", False, "hata beklenirdi")
    except Exception as e:
        kaydet_sonuc("birlestir/heic", "yok.heic", "pillow_heif" in str(e) or "açılamadı" in str(e), str(e).splitlines()[0])


def test_birlestir_uzerine(c):
    """Görüntü / PDF birleştir "Üzerine yaz" (0.1.25): hedef listedeki PDF'in (açık belgenin) kendisidir; sonuç geçici dosya + os.replace
    ile yerine yazılır, sayfalar ve notlar korunur, geçici dosya kalmaz; yazdıktan sonra ilerleme bildirilmez (geç gelen iptal yazılmış
    dosyayı yazılmamış göstermesin)."""
    klasor = os.path.join(CIKTI, "birlestir_uzerine")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)
    a = zengin_pdf_uret(os.path.join(klasor, "a.pdf"))
    b = zengin_pdf_uret(os.path.join(klasor, "b.pdf"))
    r, il = c.cagir("birlestir", {"ogeler": [{"yol": a, "tur": "pdf"}, {"yol": b, "tur": "pdf"}], "hedef": a})
    sayfalar, _ = sayfa_ozeti(a)
    ok = (r["sayfa"] == 16 and len(sayfalar) == 16 and [s["metin"] for s in sayfalar[7:9]] == ["Sayfa 8", "Sayfa 1"]
          and all(s["not"] == NOT_TURLERI for s in sayfalar) and sorted(os.listdir(klasor)) == ["a.pdf", "b.pdf"]
          and (not il or il[-1]["yuzde"] < 100))
    kaydet_sonuc("birlestir/üzerine", "a + b → a", ok, "sayfa=%d klasör=%s son ilerleme=%s" % (len(sayfalar), sorted(os.listdir(klasor)), il[-1] if il else None))


def test_dondur_kaydet(c):
    kopya = os.path.join(CIKTI, "dondur_yerinde_yatay.pdf")
    shutil.copy(YATAY, kopya)
    once = belge_ozet(kopya)
    r, _ = c.cagir("dondur_kaydet", {"yol": kopya, "hedef": kopya, "sayfalar": [1, 3], "derece": 90})
    sonra = belge_ozet(kopya)
    ok = sonra["rot"] == [(once["rot"][0] + 90) % 360, once["rot"][1], (once["rot"][2] + 90) % 360] and sonra["metin"] == once["metin"]
    kaydet_sonuc("dondur_kaydet", "yerinde [1,3] +90", ok, "rot %s → %s artimli=%s %s" % (once["rot"], sonra["rot"], r.get("artimli"), mb(r["boyut"])))
    hedef = os.path.join(CIKTI, "dondur_hepsi_notlu.pdf")
    once = belge_ozet(NOTLU)
    r, _ = c.cagir("dondur_kaydet", {"yol": NOTLU, "hedef": hedef, "sayfalar": None, "derece": -90})
    sonra = belge_ozet(hedef)
    ok = all(x == 270 for x in sonra["rot"]) and sonra["not"] == once["not"] and sonra["metin"] == once["metin"]
    kaydet_sonuc("dondur_kaydet", "hepsi -90 → yeni dosya", ok, "rot=%s not=%d %s" % (sonra["rot"], sonra["not"], mb(r["boyut"])))
    # Büyük dosyada artımlı hız
    kopya = os.path.join(CIKTI, "dondur_buyuk.pdf")
    shutil.copy(BUYUK, kopya)
    t = time.time()
    r, _ = c.cagir("dondur_kaydet", {"yol": kopya, "hedef": kopya, "sayfalar": [1], "derece": 180})
    kaydet_sonuc("dondur_kaydet", "PDF32000 (22 MB) yerinde", r.get("artimli") is True and time.time() - t < 5, "artimli=%s %.2fs %s" % (r.get("artimli"), time.time() - t, mb(r["boyut"])))
    os.remove(kopya)


def test_ayir_uzerine(c):
    """Ayır "Üzerine yaz": özgün dosyada yalnızca ayrılan sayfalar kalır; notlar ve kalan sayfaların yer imleri korunur,
    "(2)" adı ve geçici dosya kalmaz; geçersiz sayfa listesinde, salt okunur ya da kilitli dosyada özgün dosya değişmez (0.1.25: istek
    {yol, sayfalar, uzerine})."""
    klasor = os.path.join(CIKTI, "ayir_uzerine")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)
    kaynak = zengin_pdf_uret(os.path.join(klasor, "_kaynak.pdf"))
    # 1) Seçili sayfalar (sırasız verilir, sıralı kalır)
    yol = os.path.join(klasor, "secili.pdf")
    shutil.copy(kaynak, yol)
    r, il = c.cagir("ayir", {"yol": yol, "sayfalar": [7, 2, 5], "uzerine": True})
    sayfalar, toc = sayfa_ozeti(yol)
    ok = (r["dosyalar"] == [yol] and r.get("uzerine") is True and r["ayrintilar"][0]["sayfa"] == 3
          and [s["metin"] for s in sayfalar] == ["Sayfa 2", "Sayfa 5", "Sayfa 7"]
          and all(s["not"] == NOT_TURLERI for s in sayfalar)
          and sayfalar[0]["baglanti"] == ["https://example.com/pdefe"]
          and toc == [("A.1", 1), ("B.1", 2), ("Bölüm C", 3)]
          and sorted(os.listdir(klasor)) == ["_kaynak.pdf", "secili.pdf"]
          and (not il or il[-1]["yuzde"] < 100))
    kaydet_sonuc("ayir/uzerine", "secili [7,2,5]", ok, "sayfalar=%s notlar=%s toc=%s klasör=%s son ilerleme=%s"
                 % ([s["metin"] for s in sayfalar], ["%d+%d popup" % (len(s["not"]), s["popup"]) for s in sayfalar], toc,
                    sorted(os.listdir(klasor)), il[-1] if il else None))
    # 2) Tek aralık
    yol = os.path.join(klasor, "aralik.pdf")
    shutil.copy(kaynak, yol)
    r, _ = c.cagir("ayir", {"yol": yol, "sayfalar": [3, 4, 5, 6], "uzerine": True})
    sayfalar, toc = sayfa_ozeti(yol)
    ok = ([s["metin"] for s in sayfalar] == ["Sayfa 3", "Sayfa 4", "Sayfa 5", "Sayfa 6"]
          and all(s["not"] == NOT_TURLERI for s in sayfalar)
          and toc == [("A.2", 1), ("Bölüm B", 2), ("B.1", 3), ("B.2", 4)] and r["dosyalar"] == [yol]
          and not [a for a in os.listdir(klasor) if a.endswith(".pdefe-tmp") or "(2)" in a])
    kaydet_sonuc("ayir/uzerine", "aralik 3-6", ok, "sayfalar=%s toc=%s" % ([s["metin"] for s in sayfalar], toc))
    # 3) Geçersiz sayfa listesi (boş, sınır dışı): dosya değişmez
    yol = os.path.join(klasor, "gecersiz.pdf")
    shutil.copy(kaynak, yol)
    once = md5(yol)
    for ad, sayfalar in (("boş", []), ("sınır dışı", [1, 99])):
        try:
            c.cagir("ayir", {"yol": yol, "sayfalar": sayfalar, "uzerine": True})
            kaydet_sonuc("ayir/uzerine/geçersiz", ad, False, "hata beklenirdi")
        except Exception as e:
            kaydet_sonuc("ayir/uzerine/geçersiz", ad, md5(yol) == once
                         and sorted(os.listdir(klasor)) == ["_kaynak.pdf", "aralik.pdf", "gecersiz.pdf", "secili.pdf"], str(e).splitlines()[0])
    # 4) Salt okunur: özgün dosya değişmez, ileti salt okunur der
    yol = os.path.join(klasor, "salt.pdf")
    shutil.copy(kaynak, yol)
    once = md5(yol)
    os.chmod(yol, stat.S_IREAD)
    try:
        c.cagir("ayir", {"yol": yol, "sayfalar": [1], "uzerine": True})
        kaydet_sonuc("ayir/uzerine/salt okunur", "salt.pdf", False, "hata beklenirdi")
    except Exception as e:
        kaydet_sonuc("ayir/uzerine/salt okunur", "salt.pdf", "salt okunur" in str(e) and md5(yol) == once
                     and not [a for a in os.listdir(klasor) if a.endswith(".pdefe-tmp")], str(e).splitlines()[0])
    finally:
        os.chmod(yol, stat.S_IREAD | stat.S_IWRITE)
    # 5) Başka programda açık: yalnızca okumaya izin veren (bir PDF okuyucununki gibi) ve okumayı da engelleyen kilit
    for paylasim, ad in ((1, "okumaya açık kilit"), (0, "özel kilit")):
        yol = os.path.join(klasor, "kilitli_%d.pdf" % paylasim)
        shutil.copy(kaynak, yol)
        once = md5(yol)
        try:
            with kilitli(yol, paylasim):
                c.cagir("ayir", {"yol": yol, "sayfalar": [1, 2], "uzerine": True})
            kaydet_sonuc("ayir/uzerine/kilitli", ad, False, "hata beklenirdi")
        except Exception as e:
            kaydet_sonuc("ayir/uzerine/kilitli", ad, "başka bir programda açık" in str(e) and md5(yol) == once
                         and not [a for a in os.listdir(klasor) if a.endswith(".pdefe-tmp")], str(e).splitlines()[0])
    # 6) Yazmadan önce iptal: özgün dosya değişmez (yalnızca doğrudan modülde; iptal ilerleme bildiriminde denetlenir)
    if not c.surec:
        yol = os.path.join(klasor, "iptal.pdf")
        shutil.copy(kaynak, yol)
        once = md5(yol)

        def iptal_eden(yuzde, mesaj=""):
            if yuzde >= 30:
                raise InterruptedError("İşlem iptal edildi.")
        try:
            c.yontemler["ayir"]({"yol": yol, "sayfalar": [1], "uzerine": True, "_ilerleme": iptal_eden})
            kaydet_sonuc("ayir/uzerine/iptal", "iptal.pdf", False, "iptal beklenirdi")
        except InterruptedError:
            kaydet_sonuc("ayir/uzerine/iptal", "iptal.pdf", md5(yol) == once and not [a for a in os.listdir(klasor) if a.endswith(".pdefe-tmp")],
                         "özgün dosya değişmedi")


def test_sayfalar_yeni_belge(c):
    """Sayfaları düzenle "Yeni belge olarak kaydet" (sayfalar_uygula, renderer'ın gönderdiği biçimde): sıra, döndürme, boş sayfa, başka
    PDF'ten sayfa; notlar, bağlantılar ve kalan sayfaların yer imleri korunur; özgün dosya değişmez; yazdıktan sonra ilerleme yok.
    Aynı tarif yapısal kayıtla (yapisal_kaydet) da yazılıp notlar/bağlantılar karşılaştırılır."""
    klasor = os.path.join(CIKTI, "sayfalar_yeni")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)
    kaynak = zengin_pdf_uret(os.path.join(klasor, "zengin.pdf"))
    once = md5(kaynak)
    hedef = os.path.join(klasor, "zengin (düzenlenmiş).pdf")
    tarif = [{"kaynak": kaynak, "sayfa": 1, "dondurme": 0}, {"kaynak": kaynak, "sayfa": 2, "dondurme": 0},
             {"kaynak": kaynak, "sayfa": 3, "dondurme": 90},
             {"kaynak": None, "sayfa": None, "genislik": 400, "yukseklik": 300, "dondurme": 0},
             {"kaynak": YATAY, "sayfa": 1, "dondurme": 0}, {"kaynak": kaynak, "sayfa": 6, "dondurme": 180}]
    r, il = c.cagir("sayfalar_uygula", {"yol": kaynak, "hedef": hedef, "tarif": tarif})
    sayfalar, toc = sayfa_ozeti(hedef)
    ok = (r["sayfa"] == 6 and r["boyut"] == os.path.getsize(hedef) and md5(kaynak) == once
          and [s["metin"] for s in sayfalar][:4] == ["Sayfa 1", "Sayfa 2", "Sayfa 3", ""] and sayfalar[5]["metin"] == "Sayfa 6"
          and [s["rot"] for s in sayfalar][:4] == [0, 0, 90, 0] and sayfalar[5]["rot"] == 180 and sayfalar[3]["rect"] == (400, 300)
          and all(sayfalar[i]["not"] == NOT_TURLERI for i in (0, 1, 2, 5))
          and sayfalar[0]["baglanti"] == [2] and sayfalar[1]["baglanti"] == ["https://example.com/pdefe"]
          and toc == [("Bölüm A", 1), ("A.1", 2), ("A.2", 3), ("B.2", 6)]
          and (not il or il[-1]["yuzde"] <= 85) and not [a for a in os.listdir(klasor) if a.endswith(".pdefe-tmp")])
    kaydet_sonuc("sayfalar_uygula/yeni", "zengin + boş + YATAY", ok, "metin=%s rot=%s notlar=%s bağlantı=%s toc=%s son ilerleme=%s"
                 % ([s["metin"][:10] for s in sayfalar], [s["rot"] for s in sayfalar], ["%d+%d popup" % (len(s["not"]), s["popup"]) for s in sayfalar],
                    [s["baglanti"] for s in sayfalar], toc, il[-1] if il else None))
    # Aynı tarifin yapısal kayıttaki sonucu (sekmenin Ctrl+S yolu): notlar ve bağlantılar aynı mı
    if not c.surec:
        kopya = os.path.join(klasor, "yapisal.pdf")
        shutil.copy(kaynak, kopya)
        yapisal_tarif = [{"kaynak": {"yol": kopya if t["kaynak"] == kaynak else t["kaynak"], "sayfa": t["sayfa"]} if t["kaynak"] else None,
                          "dondurme": t["dondurme"], "genislik": t.get("genislik"), "yukseklik": t.get("yukseklik")} for t in tarif]
        r2, _ = c.cagir("yapisal_kaydet", {"yol": kopya, "hedef": kopya, "tarif": yapisal_tarif, "anlikKlasor": os.path.join(klasor, "anlik")})
        y_sayfalar, y_toc = sayfa_ozeti(kopya)
        ayni = [s["not"] for s in y_sayfalar] == [s["not"] for s in sayfalar] and [s["baglanti"] for s in y_sayfalar] == [s["baglanti"] for s in sayfalar]
        kaydet_sonuc("sayfalar_uygula/yeni", "yapısal kayıtla karşılaştırma", ayni,
                     "yapısal notlar=%s bağlantı=%s toc=%s" % ([len(s["not"]) for s in y_sayfalar], [s["baglanti"] for s in y_sayfalar], y_toc))
    # Hedef başka programda açık (yalnızca okumaya izin veren kilit): var olan hedef değişmez, ileti kilidi söyler
    kilitli_hedef = os.path.join(klasor, "kilitli hedef.pdf")
    shutil.copy(YATAY, kilitli_hedef)
    once_hedef = md5(kilitli_hedef)
    try:
        with kilitli(kilitli_hedef, 1):
            c.cagir("sayfalar_uygula", {"yol": kaynak, "hedef": kilitli_hedef, "tarif": tarif[:2]})
        kaydet_sonuc("sayfalar_uygula/kilitli hedef", "okumaya açık kilit", False, "hata beklenirdi")
    except Exception as e:
        kaydet_sonuc("sayfalar_uygula/kilitli hedef", "okumaya açık kilit", "başka bir programda açık" in str(e) and md5(kilitli_hedef) == once_hedef,
                     str(e).splitlines()[0])


def test_gorsel_orijinal_kenarsiz(c):
    """Görüntü / PDF birleştir "Orijinal boyut": sayfa görselin kendisidir, kenar boşluğu (verilen kenar yok sayılır) ve yuvarlamadan
    kıl payı beyaz çizgi yoktur. Sayfa 72 dpi'de (%100) çizilir: dört kenarın bütün pikselleri görselin çerçeve rengindedir.
    JPEG (olduğu gibi gömülen ve yeniden kodlanan), PNG (saydamlıksız ve saydam), döndürülmüş öğe ve EXIF'le döndürülmüş fotoğraf.
    A4'e sığdır ise kenarı korur (kenarlar beyaz)."""
    from PIL import Image, ImageDraw
    klasor = os.path.join(CIKTI, "gorsel_orijinal")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)
    CERCEVE = (200, 30, 30)

    def cerceveli(boyut, kip="RGB", kalinlik=8):
        saydam = kip == "RGBA"
        im = Image.new(kip, boyut, CERCEVE + ((255,) if saydam else ()))
        ImageDraw.Draw(im).rectangle((kalinlik, kalinlik, boyut[0] - 1 - kalinlik, boyut[1] - 1 - kalinlik),
                                     fill=(40, 90, 200) + ((110,) if saydam else ()))
        return im

    yollar = {}
    yollar["jpeg"] = os.path.join(klasor, "cerceve.jpg")
    cerceveli((1200, 900)).save(yollar["jpeg"], quality=92)
    yollar["png"] = os.path.join(klasor, "cerceve.png")
    cerceveli((640, 480)).save(yollar["png"])
    yollar["png_saydam"] = os.path.join(klasor, "cerceve_saydam.png")
    cerceveli((500, 400), "RGBA").save(yollar["png_saydam"])
    yollar["png_dondur"] = os.path.join(klasor, "cerceve_dondur.png")
    cerceveli((300, 200)).save(yollar["png_dondur"])
    yollar["exif"] = os.path.join(klasor, "foto_exif6.jpg")
    exif = Image.Exif()
    exif[0x0112] = 6
    cerceveli((4032, 3024), kalinlik=24).save(yollar["exif"], quality=90, exif=exif.tobytes())
    # (öğe, beklenen sayfa ölçüsü pt; None: A4)
    vakalar = [
        ({"yol": yollar["jpeg"], "kalite": "orijinal"}, (1200, 900), "JPEG olduğu gibi"),
        ({"yol": yollar["jpeg"], "kalite": "orta"}, (1200, 900), "JPEG yeniden kodlanmış"),
        ({"yol": yollar["png"], "kalite": "orijinal"}, (640, 480), "PNG"),
        ({"yol": yollar["png_saydam"], "kalite": "orijinal"}, (500, 400), "PNG saydam"),
        ({"yol": yollar["png_dondur"], "kalite": "orijinal", "dondurme": 90}, (200, 300), "PNG 90° döndürülmüş"),
        ({"yol": yollar["exif"], "kalite": "orijinal"}, (726, 968), "EXIF 6 fotoğraf (300 dpi)"),
        ({"yol": yollar["png"], "kalite": "orijinal", "sayfaBoyutu": "a4"}, None, "A4'e sığdır (kenar 20)"),
    ]
    ogeler = [dict({"tur": "gorsel", "sayfaBoyutu": "orijinal", "kenar": 20}, **o) for o, _, _ in vakalar]
    hedef = os.path.join(klasor, "orijinal_boyut.pdf")
    c.cagir("birlestir", {"ogeler": ogeler, "hedef": hedef, "genelKalite": "orijinal"})
    d = pymupdf.open(hedef)
    try:
        for i, (_, beklenen, ad) in enumerate(vakalar):
            pg = d[i]
            pix = pg.get_pixmap(alpha=False)   # 72 dpi: 1 pt = 1 piksel
            w, h = pix.width, pix.height
            kenar = [pix.pixel(x, 0) for x in range(w)] + [pix.pixel(x, h - 1) for x in range(w)] \
                + [pix.pixel(0, y) for y in range(h)] + [pix.pixel(w - 1, y) for y in range(h)]
            fark = max(max(abs(p[k] - CERCEVE[k]) for k in range(3)) for p in kenar)
            beyaz = sum(1 for p in kenar if min(p) >= 235)
            bbox = pymupdf.Rect(pg.get_image_info()[0]["bbox"])
            olcu = (round(pg.rect.width, 3), round(pg.rect.height, 3))
            if beklenen is None:
                ok = beyaz == len(kenar) and bbox.x0 >= 20 and pg.rect.contains(bbox)
                ayrinti = "sayfa=%s görsel=%s kenar pikselleri beyaz=%d/%d" % (olcu, tuple(round(v, 1) for v in bbox), beyaz, len(kenar))
            else:
                ok = (olcu == beklenen and (w, h) == beklenen and max(abs(a - b) for a, b in zip(bbox, pg.rect)) < 1e-3
                      and beyaz == 0 and fark <= 60)
                ayrinti = "sayfa=%s px=%dx%d görsel kutusu=sayfa:%s kenar pikselleri beyaz=%d/%d çerçeveden en büyük fark=%d" % (
                    olcu, w, h, max(abs(a - b) for a, b in zip(bbox, pg.rect)) < 1e-3, beyaz, len(kenar), fark)
            kaydet_sonuc("birlestir/orijinal", ad, ok, ayrinti)
    finally:
        d.close()
    # Boyut tahmini orijinal boyutta kenara bakmaz (arayüz kenarı gizler; eski değer tahmini değiştirmemeli)
    t0, _ = c.cagir("boyut_tahmini", {"oge": {"yol": yollar["png"], "tur": "gorsel", "kalite": "orijinal", "sayfaBoyutu": "orijinal", "kenar": 0}})
    t1, _ = c.cagir("boyut_tahmini", {"oge": {"yol": yollar["png"], "tur": "gorsel", "kalite": "orijinal", "sayfaBoyutu": "orijinal", "kenar": 25}})
    kaydet_sonuc("boyut_tahmini/orijinal", "kenar 0 ve 25", t0["boyut"] == t1["boyut"] and t0["ozet"] == t1["ozet"], "%d / %d bayt" % (t0["boyut"], t1["boyut"]))


def test_kalite_buyutmez(c):
    """Görüntü / PDF birleştir: kayıplı seviyeler (Yüksek, Orta, Düşük) özgün gösterimden (Orijinal) büyük sonuç vermez. Daha düşük
    kaliteyle kaydedilmiş JPEG (UYAP taraması q≈75, telefon fotoğrafı) "Yüksek"te (q90) yeniden kodlanınca büyüyordu, az renkli ekran
    görüntüsünde JPEG PNG'den büyüktü; bu durumda görsel olduğu gibi gömülür (JPEG baytları aynen). Fotoğraf benzeri PNG'de kayıplı
    seviyeler yine küçültür. Tahmin çıktıyla uyuşur."""
    import io
    import random
    from PIL import Image, ImageDraw
    klasor = os.path.join(CIKTI, "kalite_buyutmez")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)
    rnd = random.Random(7)
    # İnce ayrıntılı gri görsel (belirlenimci Mandelbrot yakın çekimi), q60, 4:2:0: yapay düz çizimler yeniden kodlanınca büyümüyor,
    # gerçek taramalar ve fotoğraflar gibi ayrıntı gerekir
    tarama = Image.merge("RGB", [Image.effect_mandelbrot((1240, 1754), (-0.75, 0.05, -0.70, 0.12), 250)] * 3)
    yol_jpeg = os.path.join(klasor, "tarama_q60.jpg")
    tarama.save(yol_jpeg, quality=60, subsampling="4:2:0")
    tampon = io.BytesIO()
    Image.open(yol_jpeg).save(tampon, format="JPEG", quality=90, optimize=True, subsampling="4:2:0")   # çekirdeğin "Yüksek" kodlaması
    kaydet_sonuc("birlestir/kalite", "önkoşul: q90'a yeniden kodlama büyütür", len(tampon.getvalue()) > os.path.getsize(yol_jpeg),
                 "%d → %d bayt" % (os.path.getsize(yol_jpeg), len(tampon.getvalue())))
    # Ekran görüntüsü benzeri: düz renkler, çizgiler (PNG)
    ekran = Image.new("RGB", (1600, 900), (250, 250, 250))
    cz = ImageDraw.Draw(ekran)
    cz.rectangle((0, 0, 1600, 60), fill=(0, 103, 192))
    for i in range(24):
        cz.rectangle((40, 90 + i * 32, 40 + rnd.randint(300, 1400), 110 + i * 32), fill=(60, 60, 60))
    yol_ekran = os.path.join(klasor, "ekran.png")
    ekran.save(yol_ekran)
    # Fotoğraf benzeri PNG (gürültülü degrade): kayıplı seviyeler küçültmeli
    foto = Image.merge("RGB", [Image.linear_gradient("L").resize((900, 600)), Image.linear_gradient("L").rotate(90).resize((900, 600)),
                               Image.effect_noise((900, 600), 40)])
    yol_foto = os.path.join(klasor, "foto.png")
    foto.save(yol_foto)
    for yol, ad, kayipli_kucultmeli in ((yol_jpeg, "JPEG q60", False), (yol_ekran, "ekran PNG", False), (yol_foto, "fotoğraf PNG", True)):
        for sb in ("orijinal", "a4"):
            b = {}
            for kalite in ("orijinal", "yuksek", "orta", "dusuk"):
                r, _ = c.cagir("boyut_tahmini", {"oge": {"yol": yol, "tur": "gorsel", "kalite": kalite, "sayfaBoyutu": sb, "kenar": 10}})
                b[kalite] = r["boyut"]
            ok = all(b[k] <= b["orijinal"] for k in ("yuksek", "orta", "dusuk"))
            if kayipli_kucultmeli:
                ok = ok and b["yuksek"] < b["orijinal"] and b["dusuk"] <= b["orta"] <= b["yuksek"]
            kaydet_sonuc("birlestir/kalite", "%s, sayfa %s" % (ad, sb), ok, " ".join("%s=%d" % (k, v) for k, v in b.items()))
    # Yüksek: JPEG baytları aynen gömülür; tahmin çıktıyla uyuşur
    ogeler = [{"yol": y, "tur": "gorsel", "sayfaBoyutu": "orijinal"} for y in (yol_jpeg, yol_ekran, yol_foto)]
    t, _ = c.cagir("boyut_tahmini", {"ogeler": ogeler, "kalite": "yuksek"})
    hedef = os.path.join(klasor, "yuksek.pdf")
    r, _ = c.cagir("birlestir", {"ogeler": ogeler, "hedef": hedef, "genelKalite": "yuksek"})
    d = pymupdf.open(hedef)
    try:
        x = d[0].get_images(full=True)[0][0]
        with open(yol_jpeg, "rb") as f:
            aynen = d.xref_stream_raw(x) == f.read()
    finally:
        d.close()
    kaydet_sonuc("birlestir/kalite", "Yüksek: JPEG aynen, tahmin ≈ çıktı", aynen and abs(t["toplam"] - r["boyut"]) <= 2048,
                 "JPEG aynen=%s tahmin=%d çıktı=%d" % (aynen, t["toplam"], r["boyut"]))


def test_gorsel_yonu(c):
    """Görüntü / PDF birleştir: EXIF yönlü telefon fotoğrafı (3, 6, 8) "Orijinal"de JPEG baytları aynen gömülür, dönüş PDF'te yapılır
    (önceden PNG'ye çevrilip kat kat büyüyordu); aynalı yön (2) çözülüp çevrilir. Arayüzün "Sağa döndür"ü (dondurme +90, önizlemede saat
    yönünde) çıktıda da saat yönünde (0.1.6'ya dek görseller tersine dönüyordu). Köşe işaretleri Pillow'un exif_transpose'u + saat
    yönünde döndürmeyle karşılaştırılır; orijinal sayfa ve A4, Orijinal ve Orta kalite."""
    from PIL import Image, ImageDraw, ImageOps
    klasor = os.path.join(CIKTI, "gorsel_yonu")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)
    taban = Image.new("RGB", (400, 300), (255, 255, 255))
    cz = ImageDraw.Draw(taban)
    cz.rectangle((0, 0, 60, 60), fill=(255, 0, 0))        # sol üst kırmızı
    cz.rectangle((340, 0, 399, 60), fill=(0, 0, 255))     # sağ üst mavi
    cz.rectangle((0, 240, 60, 299), fill=(0, 160, 0))     # sol alt yeşil

    def renk(p):
        r, g, b = p[:3]
        return "K" if r > 180 and g < 90 and b < 90 else "M" if b > 180 and r < 90 and g < 90 else "Y" if g > 120 and r < 90 and b < 90 else "."

    def koseler(al, x0, y0, x1, y1, pay):
        return "".join(renk(al(x, y)) for x, y in ((x0 + pay, y0 + pay), (x1 - 1 - pay, y0 + pay), (x0 + pay, y1 - 1 - pay), (x1 - 1 - pay, y1 - 1 - pay)))

    yollar = {}
    for yon in (1, 2, 3, 6, 8):
        exif = Image.Exif()
        if yon != 1:
            exif[0x0112] = yon
        yollar[yon] = os.path.join(klasor, "exif%d.jpg" % yon)
        taban.save(yollar[yon], quality=95, exif=exif.tobytes())
    yollar["png"] = os.path.join(klasor, "isaretli.png")
    taban.save(yollar["png"])
    for anahtar, yol in yollar.items():
        gorunen = ImageOps.exif_transpose(Image.open(yol)).convert("RGB")
        for dondurme in (0, 90, 270):
            beklenen = gorunen.rotate(-dondurme, expand=True)   # saat yönünde
            bw, bh = beklenen.size
            bk = koseler(lambda x, y: beklenen.getpixel((x, y)), 0, 0, bw, bh, 6)
            for sayfa, kalite in (("orijinal", "orijinal"), ("orijinal", "orta"), ("a4", "orijinal")):
                hedef = os.path.join(klasor, "c_%s_%d_%s_%s.pdf" % (anahtar, dondurme, sayfa, kalite))
                c.cagir("birlestir", {"ogeler": [{"yol": yol, "tur": "gorsel", "kalite": kalite, "sayfaBoyutu": sayfa, "kenar": 20,
                                                   "dondurme": dondurme}], "hedef": hedef})
                d = pymupdf.open(hedef)
                try:
                    pg = d[0]
                    kutu = pymupdf.Rect(pg.get_image_info()[0]["bbox"])
                    pix = pg.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
                    k = koseler(pix.pixel, *[int(round(v * 2)) for v in kutu], 12)
                    with open(yol, "rb") as f:
                        aynen = d.xref_stream_raw(pg.get_images(full=True)[0][0]) == f.read()
                finally:
                    d.close()
                beklenen_aynen = kalite == "orijinal" and anahtar in (1, 3, 6, 8)
                ok = k == bk and abs(kutu.width / kutu.height - bw / bh) < 0.01 and (aynen == beklenen_aynen)
                kaydet_sonuc("birlestir/yön", "%s %s°, %s sayfa, %s" % ("EXIF %s" % anahtar if anahtar != "png" else "PNG", dondurme, sayfa, kalite), ok,
                             "köşeler %s beklenen %s, JPEG aynen=%s" % (k, bk, aynen))
    # Boyut: yön bilgili fotoğrafın "Orijinal" tahmini dosya boyutuna yakın (önceden PNG: kat kat büyük)
    t, _ = c.cagir("boyut_tahmini", {"oge": {"yol": yollar[6], "tur": "gorsel", "kalite": "orijinal", "sayfaBoyutu": "orijinal"}})
    kaydet_sonuc("boyut_tahmini/yön", "EXIF 6 Orijinal ≈ dosya", t["boyut"] <= os.path.getsize(yollar[6]) + 2048,
                 "tahmin %d, dosya %d bayt" % (t["boyut"], os.path.getsize(yollar[6])))


def main():
    global NOTLU
    exe = None
    if "--exe" in sys.argv:
        exe = os.path.abspath(sys.argv[sys.argv.index("--exe") + 1])
        if not os.path.isfile(exe):
            print("exe bulunamadı:", exe)
            return 2
    os.makedirs(CIKTI, exist_ok=True)
    if not os.path.isfile(NOTLU):
        NOTLU = notlu_pdf_uret(os.path.join(CIKTI, "notlu_uretilen.pdf"))
        print("Notlu deneme dosyası yok; yerine üretildi:", NOTLU)
    for yol in (TBK, NOTLU, GORSELLI, YATAY, YERIMLI, BUYUK, TTK):
        if not os.path.isfile(yol):
            print("Test dosyası yok:", yol)
            return 2
    print("Test görselleri üretiliyor…")
    g = test_gorselleri_uret()
    c = Cagirici(exe)
    print("Çağrı yolu:", exe or "doğrudan modül")
    if exe:
        r, _ = c.cagir("ping", {})
        kaydet_sonuc("ping", "exe", r.get("ok") is True, json.dumps(r))
    testler = [
        ("sayfa_boyutlari", lambda: test_sayfa_boyutlari(c)),
        ("kucult_tahmin", lambda: test_kucult_tahmin(c)),
        ("kucult_tahmin/seviyeler", lambda: test_kucult_tahmin_seviyeler(c)),
        ("kucult", lambda: test_kucult(c)),
        ("sayfalar_uygula", lambda: test_sayfalar_uygula(c)),
        ("sayfalar_uygula/yeni belge", lambda: test_sayfalar_yeni_belge(c)),
        ("ayir", lambda: test_ayir(c)),
        ("ayir/uzerine", lambda: test_ayir_uzerine(c)),
        ("gorsel_bilgi", lambda: test_gorsel_bilgi(c, g)),
        ("boyut_tahmini", lambda: test_boyut_tahmini(c, g)),
        ("birlestir", lambda: test_birlestir(c, g)),
        ("birlestir/orijinal boyut", lambda: test_gorsel_orijinal_kenarsiz(c)),
        ("birlestir/kalite büyütmez", lambda: test_kalite_buyutmez(c)),
        ("birlestir/yön", lambda: test_gorsel_yonu(c)),
        ("birlestir/üzerine", lambda: test_birlestir_uzerine(c)),
        ("dondur_kaydet", lambda: test_dondur_kaydet(c)),
    ]
    for ad, f in testler:
        print("\n== %s" % ad)
        try:
            f()
        except Exception as e:
            kaydet_sonuc(ad, "İSTİSNA", False, str(e).splitlines()[0] if str(e) else repr(e))
            traceback.print_exc()
    c.kapat()
    print("\n" + "=" * 100)
    print("%-26s %-36s %-5s %s" % ("YÖNTEM", "DOSYA", "SONUÇ", "AYRINTI"))
    print("-" * 100)
    for y, d, ok, a in sonuclar:
        print("%-26s %-36s %-5s %s" % (y, d[:36], "OK" if ok else "HATA", a))
    basarili = sum(1 for s in sonuclar if s[2])
    print("-" * 100)
    print("%d/%d başarılı. Çıktılar: %s" % (basarili, len(sonuclar), CIKTI))
    return 0 if basarili == len(sonuclar) else 1


if __name__ == "__main__":
    sys.exit(main())
