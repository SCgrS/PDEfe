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

    def cagir(self, yontem, params, iptal_sonra=None, sure=600):
        """iptal_sonra=N: N. ilerleme bildiriminden sonra iptal (exe'de 'iptal' isteği, modülde _iptal_mi). Ertelenmiş yanıt (0.2.7:
        UDF / Word öğeli birlestir, UDF'nin gorsel_bilgi'si) beklenir."""
        ilerlemeler = []
        if self.surec:
            self.sayac += 1
            kimlik = self.sayac
            self.surec.stdin.write(json.dumps({"id": kimlik, "method": yontem, "params": params}, ensure_ascii=False) + "\n")
            self.surec.stdin.flush()
            while True:
                satir = self.surec.stdout.readline()
                if not satir:
                    raise RuntimeError("exe kapandı: " + self.surec.stderr.read())
                msg = json.loads(satir)
                if msg.get("id") != kimlik:
                    continue
                if "progress" in msg:
                    ilerlemeler.append(msg["progress"])
                    if iptal_sonra is not None and len(ilerlemeler) == iptal_sonra:
                        self.sayac += 1
                        self.surec.stdin.write(json.dumps({"id": self.sayac, "method": "iptal", "params": {"id": kimlik}}) + "\n")
                        self.surec.stdin.flush()
                    continue
                if "error" in msg:
                    raise RuntimeError(msg["error"]["message"] + "\n" + (msg["error"].get("data") or ""))
                return msg["result"], ilerlemeler
        import pdefe_core
        iptal_mi = lambda: iptal_sonra is not None and len(ilerlemeler) >= iptal_sonra   # noqa: E731

        def ilerleme(y, m=""):
            if iptal_mi():
                raise pdefe_core.IptalEdildi()
            ilerlemeler.append({"yuzde": y, "mesaj": m})
        p = dict(params)
        p["_ilerleme"] = ilerleme
        p["_iptal_mi"] = iptal_mi
        try:
            r = self.yontemler[yontem](p)
        except pdefe_core.IptalEdildi:
            raise RuntimeError("İşlem iptal edildi.")
        if isinstance(r, pdefe_core.Ertelenmis):
            import threading
            olay, kutu = threading.Event(), {}
            r.baslat(lambda s, h: (kutu.update(s=s, h=h), olay.set()))
            if not olay.wait(sure):
                raise RuntimeError("ertelenmiş yanıt gelmedi")
            if kutu["h"] is not None:
                if isinstance(kutu["h"], (pdefe_core.IptalEdildi, InterruptedError)):
                    raise RuntimeError("İşlem iptal edildi.")
                raise kutu["h"]
            r = kutu["s"]
        return r, ilerlemeler

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
        r, _ = c.cagir("boyut_tahmini", {"oge": {"yol": g["jpeg_exif"], "tur": "gorsel", "kalite": kalite}})
        kaydet_sonuc("boyut_tahmini", "jpeg %s" % kalite, r["boyut"] > 0, mb(r["boyut"]))
    r, _ = c.cagir("boyut_tahmini", {"oge": {"yol": GORSELLI, "tur": "pdf", "kalite": "dusuk"}})
    kaydet_sonuc("boyut_tahmini", "fdsafsd.pdf dusuk", 0 < r["boyut"] < os.path.getsize(GORSELLI), mb(r["boyut"]))
    # Renderer biçimi: çoğul ogeler + genel 'kalite'; bozuk öğe yalnızca kendi hatasını alır
    ogeler = [{"yol": g["jpeg_exif"], "tur": "gorsel"}, {"yol": GORSELLI, "tur": "pdf"},
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
        {"yol": g["jpeg_exif"], "tur": "gorsel", "kalite": "orta"},
        {"yol": g["png_saydam"], "tur": "gorsel", "kalite": "orijinal"},
        {"yol": g["tiff_coklu"], "tur": "gorsel", "kalite": "dusuk"},
        {"yol": g["webp"], "tur": "gorsel", "dondurme": 90},
        {"yol": g["bmp"], "tur": "gorsel", "kalite": "yuksek"},
        {"yol": g["gif"], "tur": "gorsel", "kalite": "orijinal"},
        {"yol": g["bitonal"], "tur": "gorsel", "kalite": "orta"},
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
    # 2. görsel sayfası (jpeg exif, dikey 3000x4000 → dikey, A4'e sığan 210 × 280 mm; 0.2.9)
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
    # 0.2.9: görüntü sayfaları A4'e sığan ölçüde (800 × 600 saydam PNG → 280 × 210 mm, 794 × 595 pt); "Orta" 200 dpi: 280 mm → 2204 piksel
    ok = (oz["sayfa"] == beklenen_sayfa and oz["not"] == n_notlu["not"] and round(s_jpeg.width) == 595 and round(s_jpeg.height) == 794
          and round(s_png.width) == 794 and round(s_png.height) == 595 and s_bmp.width > s_bmp.height
          and s_webp.width < s_webp.height and jpeg_px[1] <= 2205 and len(toc) == n_yer["toc"]
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


def test_birlestir_tiff(c):
    """Birleştir'de TIFF sayfası (0.2.9): karenin oranıyla A4'e sığan ölçüde (araclar.a4_sayfa_olcusu; 0.2.6–0.2.8'de "Orijinal"de
    taramanın gerçek ölçüsü: etiket ya da A4 kuralı; 0.2.5'e dek 72 dpi: etiketsiz 200 dpi A4 tarama 58 × 82 cm'lik sayfa oluyordu). Öteki
    görseller de aynı kuralla (72 dpi etiketli fotoğraf). Çok sayfalı TIFF kare kare çözülür: 150 sayfada birleştirmenin ve dört düzeyli
    boyut tahmininin tepe belleği düşük (0.2.5'te 1,17 GB)."""
    from PIL import Image, ImageDraw, TiffImagePlugin
    klasor = os.path.join(CIKTI, "birlestir_tiff")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)

    def tarama(g, h, tohum):
        im = Image.new("1", (g, h), 1)
        d = ImageDraw.Draw(im)
        for i in range(40):
            y = 120 + i * (h - 240) // 40
            d.rectangle((150, y, 150 + (tohum * 37 + i * 53) % (g - 300), y + 12), fill=0)
        return im

    def tiff(ad, kareler):
        yol = os.path.join(klasor, ad)
        with TiffImagePlugin.AppendingTiffWriter(yol, new=True) as tf:
            for im, secenek in kareler:
                im.save(tf, format="TIFF", **secenek)
                tf.newFrame()
        return yol
    etiketsiz = tiff("etiketsiz_200.tif", [(tarama(1654, 2339, 1), {"compression": "group4"}), (tarama(1654, 2339, 2), {"compression": "group4"})])
    letter = tiff("letter_150.tif", [(Image.new("RGB", (1275, 1650), (200, 220, 240)), {"compression": "tiff_lzw", "dpi": (150, 150)})])
    kucuk = tiff("kucuk.tif", [(Image.new("RGB", (300, 200), (90, 160, 220)), {"compression": "tiff_lzw"})])
    foto = os.path.join(klasor, "foto_72dpi.jpg")
    Image.new("RGB", (3000, 4000), (180, 120, 60)).save(foto, quality=85, dpi=(72, 72))
    vakalar = [({"yol": etiketsiz}, [(595, 842), (595, 842)], "etiketsiz 200 dpi G4 → A4"),
               ({"yol": letter}, [(595, 770)], "150 dpi etiketli Letter → 210 × 271,8 mm"),
               ({"yol": letter, "dondurme": 90}, [(770, 595)], "150 dpi Letter 90° döndürülmüş → yatay"),
               ({"yol": kucuk}, [(842, 561)], "küçük TIFF (300 × 200 piksel) → yatay A4'e büyür"),
               ({"yol": foto}, [(595, 794)], "72 dpi etiketli fotoğraf → 210 × 280 mm")]
    ogeler = [dict({"tur": "gorsel", "kalite": "orijinal"}, **o) for o, _, _ in vakalar]
    hedef = os.path.join(klasor, "tiff_orijinal.pdf")
    c.cagir("birlestir", {"ogeler": ogeler, "hedef": hedef, "genelKalite": "orijinal"})
    d = pymupdf.open(hedef)
    olculer = [(round(pg.rect.width), round(pg.rect.height)) for pg in d]
    d.close()
    i = 0
    for _, beklenen, ad in vakalar:
        gercek = olculer[i:i + len(beklenen)]
        i += len(beklenen)
        kaydet_sonuc("birlestir/tiff ölçü", ad, gercek == beklenen, "sayfa %s, beklenen %s" % (gercek, beklenen))
    # 0.2.8'in "A4'e sığdır"ı (beyaz A4 sayfa) kalktı: eski alan yok sayılır, sayfa yine A4'e sığan ölçüde
    hedef = os.path.join(klasor, "tiff_a4.pdf")
    c.cagir("birlestir", {"ogeler": [{"yol": letter, "tur": "gorsel", "sayfaBoyutu": "a4", "kenar": 0}], "hedef": hedef, "genelKalite": "orijinal"})
    d = pymupdf.open(hedef)
    a4 = (round(d[0].rect.width), round(d[0].rect.height))
    d.close()
    kaydet_sonuc("birlestir/tiff ölçü", "eski sayfaBoyutu a4 yok sayılır", a4 == (595, 770), "sayfa %s" % (a4,))
    # 150 sayfa: kare kare çözülür, tepe bellek
    akis = os.path.join(klasor, "akis_150.tif")
    with TiffImagePlugin.AppendingTiffWriter(akis, new=True) as tf:
        for k in range(150):
            tarama(1654, 2339, k).save(tf, format="TIFF", compression="group4")
            tf.newFrame()
    betik = os.path.join(klasor, "tepe.py")
    with open(betik, "w", encoding="utf-8") as f:
        f.write(TEPE_BETIGI)
    hedef = os.path.join(klasor, "akis_150.pdf")
    oge = {"yol": akis, "tur": "gorsel", "kalite": "orijinal"}
    for ad, yontem, params in (("150 sayfa birleştirme (orijinal)", "birlestir", {"ogeler": [oge], "hedef": hedef}),
                               ("150 sayfa boyut tahmini (dört düzey)", "tahmin", {"oge": oge})):
        p = subprocess.run([sys.executable, "-X", "utf8", betik, os.path.join(KOK, "core"), yontem, json.dumps(params)], capture_output=True,
                           timeout=900)
        try:
            olcu = json.loads(p.stdout.decode("utf-8").strip().splitlines()[-1])
            ok, ek = olcu["tepe"] < 300, ""
            if yontem == "birlestir":
                d = pymupdf.open(hedef)
                sayfa, ilk = d.page_count, (round(d[0].rect.width), round(d[0].rect.height))
                d.close()
                ok, ek = ok and sayfa == 150 and ilk == (595, 842), ", %d sayfa, ilk %s" % (sayfa, ilk)
            kaydet_sonuc("birlestir/tiff bellek", ad, ok, "tepe %.0f MB (başta %.0f), %.1f sn%s" % (olcu["tepe"], olcu["once"], olcu["sure"], ek))
        except Exception as e:  # noqa: BLE001
            kaydet_sonuc("birlestir/tiff bellek", ad, False, "%r %s" % (e, p.stderr.decode("utf-8", "replace")[-300:]))


# Ayrı süreçte birleştirme ya da boyut tahmini ve tepe çalışma kümesi (Windows; macOS'ta en büyük yerleşik bellek)
TEPE_BETIGI = r"""
import json, sys, time
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
t = time.perf_counter()
params = json.loads(sys.argv[3])
if sys.argv[2] == "birlestir":
    araclar.y_birlestir(params)
else:   # Birleştir'in her öğe için sorduğu dört düzeyin tahmini
    for kalite in ("orijinal", "yuksek", "orta", "dusuk"):
        araclar.y_boyut_tahmini({"oge": dict(params["oge"], kalite=kalite)})
print(json.dumps({"once": once, "tepe": tepe(), "sure": time.perf_counter() - t}))
"""


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
    # 0.2.1: 9 ve daha çok ayrı kaynak PDF (önbellek 8 belge tutar; 9. kaynak bu işin ilk kaynağını kapatıyor, "document closed")
    kaynaklar = []
    for i in range(10):
        y = os.path.join(klasor, "kaynak %d.pdf" % (i + 1))
        d = pymupdf.open()
        d.new_page(width=595, height=842).insert_text((72, 72), "Kaynak %d" % (i + 1), fontsize=14)
        d.save(y)
        d.close()
        kaynaklar.append(y)
    dokuz = os.path.join(klasor, "on kaynak.pdf")
    try:
        r, _ = c.cagir("sayfalar_uygula", {"yol": kaynaklar[0], "hedef": dokuz, "tarif": [{"kaynak": y, "sayfa": 1} for y in kaynaklar]})
        d = pymupdf.open(dokuz)
        metin = [d[i].get_text().strip() for i in range(d.page_count)]
        d.close()
        kaydet_sonuc("sayfalar_uygula/10 kaynak", "10 ayrı PDF", r["sayfa"] == 10 and metin == ["Kaynak %d" % (i + 1) for i in range(10)], metin)
    except Exception as e:
        kaydet_sonuc("sayfalar_uygula/10 kaynak", "10 ayrı PDF", False, str(e).splitlines()[0])


def test_gorsel_orijinal_kenarsiz(c):
    """Birleştir'in görüntü sayfası kenarsızdır (0.1.x'te "Orijinal boyut" için; 0.2.9'dan beri her görüntüde): sayfa görselin kendisidir,
    oranı korunarak A4'e sığan ölçüde; kenar boşluğu (eski kenar alanı yok sayılır) ve kıl payı beyaz çizgi yoktur. Sayfa 72 dpi'de (%100)
    çizilir: dört kenarın bütün pikselleri görselin çerçeve rengindedir (kesirli ölçüde son kısmi piksel de). JPEG (olduğu gibi gömülen ve
    yeniden kodlanan), PNG (saydamlıksız ve saydam), döndürülmüş öğe ve EXIF'le döndürülmüş fotoğraf. 0.2.8'in "A4'e sığdır"ı (beyaz A4
    sayfa, kenar boşluklu) kalktı: eski sayfaBoyutu a4 + kenar 20 de kenarsız."""
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
    # (öğe, görünen en ve boy (beklenen sayfa: A4'e sığan ölçü), ad)
    vakalar = [
        ({"yol": yollar["jpeg"], "kalite": "orijinal"}, (1200, 900), "JPEG olduğu gibi"),
        ({"yol": yollar["jpeg"], "kalite": "orta"}, (1200, 900), "JPEG yeniden kodlanmış"),
        ({"yol": yollar["png"], "kalite": "orijinal"}, (640, 480), "PNG"),
        ({"yol": yollar["png_saydam"], "kalite": "orijinal"}, (500, 400), "PNG saydam"),
        ({"yol": yollar["png_dondur"], "kalite": "orijinal", "dondurme": 90}, (200, 300), "PNG 90° döndürülmüş"),
        ({"yol": yollar["exif"], "kalite": "orijinal"}, (3024, 4032), "EXIF 6 fotoğraf"),
        ({"yol": yollar["png"], "kalite": "orijinal", "sayfaBoyutu": "a4", "kenar": 20}, (640, 480), "eski A4'e sığdır (kenar 20) de kenarsız"),
    ]
    ogeler = [dict({"tur": "gorsel"}, **o) for o, _, _ in vakalar]
    hedef = os.path.join(klasor, "orijinal_boyut.pdf")
    c.cagir("birlestir", {"ogeler": ogeler, "hedef": hedef, "genelKalite": "orijinal"})
    d = pymupdf.open(hedef)
    try:
        for i, (_, gorunen, ad) in enumerate(vakalar):
            beklenen = a4_beklenen(*gorunen)
            pg = d[i]
            pix = pg.get_pixmap(alpha=False)   # 72 dpi: 1 pt = 1 piksel
            w, h = pix.width, pix.height
            kenar = [pix.pixel(x, 0) for x in range(w)] + [pix.pixel(x, h - 1) for x in range(w)] \
                + [pix.pixel(0, y) for y in range(h)] + [pix.pixel(w - 1, y) for y in range(h)]
            fark = max(max(abs(p[k] - CERCEVE[k]) for k in range(3)) for p in kenar)
            beyaz = sum(1 for p in kenar if min(p) >= 235)
            bbox = pymupdf.Rect(pg.get_image_info()[0]["bbox"])
            olcu = (round(pg.rect.width, 3), round(pg.rect.height, 3))
            ok = (abs(pg.rect.width - beklenen[0]) < 0.01 and abs(pg.rect.height - beklenen[1]) < 0.01
                  and max(abs(a - b) for a, b in zip(bbox, pg.rect)) < 1e-3 and beyaz == 0 and fark <= 60)
            ayrinti = "sayfa=%s beklenen=%s px=%dx%d görsel kutusu=sayfa:%s kenar pikselleri beyaz=%d/%d çerçeveden en büyük fark=%d" % (
                olcu, tuple(round(v, 3) for v in beklenen), w, h, max(abs(a - b) for a, b in zip(bbox, pg.rect)) < 1e-3, beyaz, len(kenar), fark)
            kaydet_sonuc("birlestir/orijinal", ad, ok, ayrinti)
    finally:
        d.close()
    # Boyut tahmini kenara bakmaz (0.2.9: kenar alanı kalktı; eski değer tahmini değiştirmemeli)
    t0, _ = c.cagir("boyut_tahmini", {"oge": {"yol": yollar["png"], "tur": "gorsel", "kalite": "orijinal", "kenar": 0}})
    t1, _ = c.cagir("boyut_tahmini", {"oge": {"yol": yollar["png"], "tur": "gorsel", "kalite": "orijinal", "kenar": 25}})
    kaydet_sonuc("boyut_tahmini/orijinal", "kenar 0 ve 25", t0["boyut"] == t1["boyut"] and t0["ozet"] == t1["ozet"], "%d / %d bayt" % (t0["boyut"], t1["boyut"]))


def a4_beklenen(g, y):
    """0.2.9'un kuralı (testin kendi hesabı): görünen en / boy oranı korunarak A4'e sığan en büyük sayfa (pt). Dikey ya da kare görüntü
    595,276 × 841,89'luk kutuya, yatay görüntü 841,89 × 595,276'lık kutuya."""
    kg, ky = (841.890, 595.276) if g > y else (595.276, 841.890)
    k = min(kg / float(g), ky / float(y))
    return g * k, y * k


def test_birlestir_a4(c):
    """0.2.9 (kullanıcı isteği: "Görüntü dosya formatlarını birleştirirken… görüntülerin A4 boyutunda kalmasını sağlayalım… görüntü
    birleştirirken sayfa seçeneğini kaldıralım"): Birleştir'de her görüntü sayfası görüntünün kendisidir, oranı korunarak A4'e sığan en büyük
    ölçüde (dikey ya da kare 210 × 297 mm'lik kutuya, yatay 297 × 210 mm'lik kutuya); beyaz kenar yok. Satırın döndürmesinden sonraki yönle.
    Eski sayfaBoyutu / kenar alanları yok sayılır. "Orijinal"de JPEG baytları aynen; kalite seviyeleri A4'e sığan sayfanın ölçüsüne göre
    küçültür. PDF öğesinin sayfası değişmez. Boyut tahmini aynı ölçüyle (sayfaBoyutu / kenar tahmini değiştirmez) ve çıktıya yakın."""
    from PIL import Image, ImageDraw, TiffImagePlugin
    klasor = os.path.join(CIKTI, "birlestir_a4")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)
    CERCEVE = (200, 30, 30)

    def cerceveli(boyut, kip="RGB", kalinlik=8):
        im = Image.new(kip, boyut, CERCEVE)
        ImageDraw.Draw(im).rectangle((kalinlik, kalinlik, boyut[0] - 1 - kalinlik, boyut[1] - 1 - kalinlik), fill=(40, 90, 200))
        return im

    y = {}
    y["dikey"] = os.path.join(klasor, "dikey_3x4.jpg")
    cerceveli((1500, 2000)).save(y["dikey"], quality=90, dpi=(72, 72))
    y["yatay"] = os.path.join(klasor, "yatay_4x3.png")
    cerceveli((1200, 900)).save(y["yatay"])
    y["kare"] = os.path.join(klasor, "kare.png")
    cerceveli((300, 300)).save(y["kare"])
    y["kucuk"] = os.path.join(klasor, "kucuk.png")
    cerceveli((40, 20), kalinlik=2).save(y["kucuk"])
    y["exif"] = os.path.join(klasor, "exif6.jpg")
    exif = Image.Exif()
    exif[0x0112] = 6
    cerceveli((2000, 1500), kalinlik=24).save(y["exif"], quality=90, exif=exif.tobytes())
    y["tiff"] = os.path.join(klasor, "a4_200.tif")
    tarama = Image.new("1", (1654, 2339), 1)
    ImageDraw.Draw(tarama).rectangle((0, 0, 1653, 2338), outline=0, width=6)
    letter = Image.new("RGB", (1275, 1650), CERCEVE)
    with TiffImagePlugin.AppendingTiffWriter(y["tiff"], new=True) as tf:
        tarama.save(tf, format="TIFF", compression="group4")
        tf.newFrame()
        letter.save(tf, format="TIFF", compression="tiff_lzw", dpi=(150, 150))
        tf.newFrame()
    pdf = os.path.join(klasor, "yatay_belge.pdf")
    d = pymupdf.open()
    d.new_page(width=700, height=400).insert_text((72, 72), "Deneme", fontsize=14)
    d.save(pdf)
    d.close()
    # (öğe, beklenen sayfalar (görünen en, boy), ad)
    vakalar = [
        ({"yol": y["dikey"]}, [(1500, 2000)], "dikey 3:4 JPEG → 210 × 280 mm"),
        ({"yol": y["yatay"]}, [(1200, 900)], "yatay 4:3 PNG → 280 × 210 mm"),
        ({"yol": y["dikey"], "dondurme": 90}, [(2000, 1500)], "dikey JPEG sağa döndürülmüş → yatay 280 × 210 mm"),
        ({"yol": y["kare"]}, [(300, 300)], "kare → 210 × 210 mm"),
        ({"yol": y["kucuk"]}, [(40, 20)], "çok küçük görüntü büyür → 297 × 148,5 mm"),
        ({"yol": y["exif"]}, [(1500, 2000)], "EXIF 6 fotoğraf (dik görünür) → 210 × 280 mm"),
        ({"yol": y["tiff"]}, [(1654, 2339), (1275, 1650)], "TIFF: A4 tarama + Letter 150 dpi"),
        ({"yol": y["yatay"], "sayfaBoyutu": "a4", "kenar": 20}, [(1200, 900)], "eski sayfaBoyutu a4 + kenar 20 yok sayılır"),
        ({"yol": y["kare"], "sayfaBoyutu": "orijinal"}, [(300, 300)], "eski sayfaBoyutu orijinal yok sayılır"),
    ]
    ogeler = [dict({"tur": "gorsel", "kalite": "orijinal"}, **o) for o, _, _ in vakalar] + [{"yol": pdf, "tur": "pdf"}]
    hedef = os.path.join(klasor, "birlesik.pdf")
    r, _ = c.cagir("birlestir", {"ogeler": ogeler, "hedef": hedef, "genelKalite": "orijinal"})
    d = pymupdf.open(hedef)
    try:
        i = 0
        for oge, sayfalar, ad in vakalar:
            for gorunen in sayfalar:
                pg = d[i]
                i += 1
                bg, by = a4_beklenen(*gorunen)
                bbox = pymupdf.Rect(pg.get_image_info()[0]["bbox"])
                # 72 dpi'de (1 pt = 1 piksel) sayfanın tamamen içindeki dört kenar satırı / sütunu: beyaz yok (kesirli ölçüde son kısmi piksel
                # sayfanın dışına taşar, sayılmaz)
                pix = pg.get_pixmap(alpha=False)
                w, h = int(pg.rect.width), int(pg.rect.height)
                kenar = [pix.pixel(x, 0) for x in range(w)] + [pix.pixel(x, h - 1) for x in range(w)] \
                    + [pix.pixel(0, yy) for yy in range(h)] + [pix.pixel(w - 1, yy) for yy in range(h)]
                beyaz = sum(1 for p in kenar if min(p) >= 235)
                ok = (abs(pg.rect.width - bg) < 0.01 and abs(pg.rect.height - by) < 0.01 and max(abs(a - b) for a, b in zip(bbox, pg.rect)) < 1e-3
                      and beyaz == 0)
                kaydet_sonuc("birlestir/A4", ad, ok, "sayfa=%.2f × %.2f pt (%.1f × %.1f mm), beklenen %.2f × %.2f, kutu=sayfa:%s, kenarda beyaz=%d"
                             % (pg.rect.width, pg.rect.height, pg.rect.width * 25.4 / 72, pg.rect.height * 25.4 / 72, bg, by,
                                max(abs(a - b) for a, b in zip(bbox, pg.rect)) < 1e-3, beyaz))
        son = d[i]
        kaydet_sonuc("birlestir/A4", "PDF öğesi kendi ölçüsünde", (round(son.rect.width), round(son.rect.height)) == (700, 400) and d.page_count == i + 1,
                     "sayfa=%s, toplam %d" % ((round(son.rect.width), round(son.rect.height)), d.page_count))
        # Orijinal: JPEG baytları aynen (dikey ve EXIF 6)
        for no, anahtar in ((0, "dikey"), (5, "exif")):
            with open(y[anahtar], "rb") as f:
                aynen = d.xref_stream_raw(d[no].get_images(full=True)[0][0]) == f.read()
            kaydet_sonuc("birlestir/A4", "%s: JPEG aynen gömülü" % anahtar, aynen, "aynen=%s" % aynen)
    finally:
        d.close()
    # Kalite seviyesi A4'e sığan sayfanın ölçüsüne göre küçültür: 4000 × 3000 fotoğraf "Orta"da (200 dpi) 280 × 210 mm → 2205 × 1654 piksel
    buyuk = os.path.join(klasor, "buyuk.jpg")
    Image.merge("RGB", [Image.effect_noise((4000, 3000), 40)] * 3).save(buyuk, quality=95)   # gürültülü: "Orta"da yeniden kodlanınca küçülür
    hedef2 = os.path.join(klasor, "orta.pdf")
    c.cagir("birlestir", {"ogeler": [{"yol": buyuk, "tur": "gorsel", "kalite": "orta"}], "hedef": hedef2})
    d = pymupdf.open(hedef2)
    try:
        x = d[0].get_images(full=True)[0]
        olcu, px = (round(d[0].rect.width, 2), round(d[0].rect.height, 2)), (x[2], x[3])
    finally:
        d.close()
    bg, by = a4_beklenen(4000, 3000)
    kaydet_sonuc("birlestir/A4", "Orta: A4'e sığan sayfada 200 dpi", abs(olcu[0] - bg) < 0.01 and abs(px[0] - bg / 72 * 200) <= 2 and abs(px[1] - by / 72 * 200) <= 2,
                 "sayfa=%s piksel=%s" % (olcu, px))
    # Boyut tahmini: aynı kural, sayfaBoyutu / kenar sonucu değiştirmez, tahmin ≈ çıktı
    t0, _ = c.cagir("boyut_tahmini", {"oge": {"yol": y["yatay"], "tur": "gorsel", "kalite": "orijinal"}})
    t1, _ = c.cagir("boyut_tahmini", {"oge": {"yol": y["yatay"], "tur": "gorsel", "kalite": "orijinal", "sayfaBoyutu": "a4", "kenar": 25}})
    t2, _ = c.cagir("boyut_tahmini", {"oge": {"yol": y["yatay"], "tur": "gorsel", "kalite": "orijinal", "sayfaBoyutu": "orijinal", "kenar": 0}})
    kaydet_sonuc("boyut_tahmini/A4", "sayfaBoyutu / kenar yok sayılır", t0["boyut"] == t1["boyut"] == t2["boyut"] and t0["ozet"] == t1["ozet"] == t2["ozet"],
                 "%d / %d / %d bayt" % (t0["boyut"], t1["boyut"], t2["boyut"]))
    ogeler = [{"yol": y[k], "tur": "gorsel"} for k in ("dikey", "yatay", "kare", "tiff")]
    t, _ = c.cagir("boyut_tahmini", {"ogeler": ogeler, "kalite": "orijinal"})
    hedef3 = os.path.join(klasor, "tahmin.pdf")
    r3, _ = c.cagir("birlestir", {"ogeler": ogeler, "hedef": hedef3, "genelKalite": "orijinal"})
    # Düz renkli küçük PNG'ler birlikte kaydedilince tek tek ölçüldüklerinden küçük çıkıyor (tahmin %8 büyük; 0.2.8'de de aynı): pay %10
    kaydet_sonuc("boyut_tahmini/A4", "tahmin ≈ çıktı (4 öğe, %10)", abs(t["toplam"] - r3["boyut"]) <= max(4096, 0.1 * r3["boyut"]),
                 "tahmin %d, çıktı %d bayt" % (t["toplam"], r3["boyut"]))


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
        b = {}
        for kalite in ("orijinal", "yuksek", "orta", "dusuk"):
            r, _ = c.cagir("boyut_tahmini", {"oge": {"yol": yol, "tur": "gorsel", "kalite": kalite}})
            b[kalite] = r["boyut"]
        ok = all(b[k] <= b["orijinal"] for k in ("yuksek", "orta", "dusuk"))
        if kayipli_kucultmeli:
            ok = ok and b["yuksek"] < b["orijinal"] and b["dusuk"] <= b["orta"] <= b["yuksek"]
        kaydet_sonuc("birlestir/kalite", "%s (A4'e sığan sayfa)" % ad, ok, " ".join("%s=%d" % (k, v) for k, v in b.items()))
    # Yüksek: JPEG baytları aynen gömülür; tahmin çıktıyla uyuşur
    ogeler = [{"yol": y, "tur": "gorsel"} for y in (yol_jpeg, yol_ekran, yol_foto)]
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
    yönünde döndürmeyle karşılaştırılır; Orijinal ve Orta kalite (0.2.9'dan beri sayfa seçimi yok: sayfa A4'e sığan ölçüde)."""
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
            for kalite in ("orijinal", "orta"):
                hedef = os.path.join(klasor, "c_%s_%d_%s.pdf" % (anahtar, dondurme, kalite))
                c.cagir("birlestir", {"ogeler": [{"yol": yol, "tur": "gorsel", "kalite": kalite, "dondurme": dondurme}], "hedef": hedef})
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
                kaydet_sonuc("birlestir/yön", "%s %s°, %s" % ("EXIF %s" % anahtar if anahtar != "png" else "PNG", dondurme, kalite), ok,
                             "köşeler %s beklenen %s, JPEG aynen=%s" % (k, bk, aynen))
    # Boyut: yön bilgili fotoğrafın "Orijinal" tahmini dosya boyutuna yakın (önceden PNG: kat kat büyük)
    t, _ = c.cagir("boyut_tahmini", {"oge": {"yol": yollar[6], "tur": "gorsel", "kalite": "orijinal"}})
    kaydet_sonuc("boyut_tahmini/yön", "EXIF 6 Orijinal ≈ dosya", t["boyut"] <= os.path.getsize(yollar[6]) + 2048,
                 "tahmin %d, dosya %d bayt" % (t["boyut"], os.path.getsize(yollar[6])))


# ---------------------------------------------------------------- Birleştir: UDF ve Word belgeleri (0.2.7)
def kurgusal_udf(yol, paragraflar, baslik="DENEME BELGESİ"):
    """Kişisel veri içermeyen sentetik UDF (udf_donusum_testi.UdfYaz'ın kısa hâli): başlık + paragraflar, A4, kenarlar 2,5 cm."""
    import zipfile
    havuz, xml = [], []
    uz = 0
    for i, metin in enumerate([baslik] + paragraflar):
        havuz.append(metin + "\n")
        hiza = 1 if i == 0 else 3
        xml.append('<paragraph Alignment="%d"><content startOffset="%d" length="%d" family="Times New Roman" size="12"%s /><content '
                   'startOffset="%d" length="1" family="Times New Roman" size="12" /></paragraph>'
                   % (hiza, uz, len(metin), ' bold="true"' if i == 0 else "", uz + len(metin)))
        uz += len(metin) + 1
    x = ('<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >\n<content><![CDATA[' + "".join(havuz) + ']]></content>'
         '<properties><pageFormat mediaSizeName="1" leftMargin="70.87" rightMargin="70.87" topMargin="70.87" bottomMargin="70.87" '
         'paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" /></properties>\n<elements resolver="hvl-default" >\n'
         + "\n".join(xml) + '\n</elements><styles><style name="default" description="Geçerli" family="Dialog" size="12" bold="false" '
         'italic="false" foreground="-13421773" /><style name="hvl-default" family="Times New Roman" size="12" description="Gövde" />'
         '</styles>\n</template>\n')
    with zipfile.ZipFile(yol, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("content.xml", x.encode("utf-8"))
    return yol


def kurgusal_docx(yol, paragraflar):
    import docx
    belge = docx.Document()
    belge.add_heading("Deneme Word belgesi", level=1)
    for p in paragraflar:
        belge.add_paragraph(p)
    belge.save(yol)
    return yol


PARAGRAF = ("Birleştirme deneme paragrafı: dilekçe ekleri tek PDF olarak gönderilir; Türkçe harfler ğüşıöç İĞÜŞÖÇ ve sayılar 2099/123 "
            "yerinde kalmalı. ")


def gecici_donustur_klasorleri():
    import tempfile
    on = "pdefe-donustur-%d-" % os.getpid()
    return sorted(a for a in os.listdir(tempfile.gettempdir()) if a.startswith(on))


def test_birlestir_belgeler(c, g):
    """0.2.7 (madde 2): Birleştir UDF ve Word belgelerini de alır; önce PDF'e çevirir, sonra sırasıyla birleştirir. UDE / Word bu bilgisayarda
    yoksa istek belgenin adıyla reddedilir."""
    klasor = os.path.join(CIKTI, "birlestir_belgeler")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)
    udf = kurgusal_udf(os.path.join(klasor, "ek-udf.udf"), [PARAGRAF * 3, PARAGRAF * 2])
    docx_yol = kurgusal_docx(os.path.join(klasor, "ek-word.docx"), [PARAGRAF * 2])
    yetenek, _ = c.cagir("donusum_yetenekleri", {})
    ude_var = bool((yetenek.get("udf") or {}).get("var"))
    word_var = bool((yetenek.get("word") or {}).get("var"))
    # Tür içerikten: uzantısı yanıltıcı dosyalar
    png_adi_pdf = os.path.join(klasor, "aslinda_png.pdf")
    shutil.copyfile(g["webp"], png_adi_pdf)
    r, _ = c.cagir("gorsel_bilgi", {"yol": png_adi_pdf})
    kaydet_sonuc("birlestir/belge tür", "görüntü .pdf adıyla", r.get("tur") == "gorsel", r.get("tur"))
    r, _ = c.cagir("gorsel_bilgi", {"yol": udf, "onizleme": False})
    kaydet_sonuc("gorsel_bilgi/udf", "ek-udf.udf (ön izlemesiz)", r.get("tur") == "udf" and r.get("alt") == "zip" and r.get("pdfeCevrilebilir") is ude_var
                 and abs((r.get("genislik") or 0) - 595.28) < 1 and "png" not in r, {k: r.get(k) for k in ("tur", "alt", "pdfeCevrilebilir", "genislik", "neden")})
    if ude_var:
        r, _ = c.cagir("gorsel_bilgi", {"yol": udf, "genislik": 160})
        kaydet_sonuc("gorsel_bilgi/udf", "ek-udf.udf (UDE ön izlemesi)", r.get("sayfa") == 1 and r.get("pngGenislik") == 160 and r.get("png"),
                     {k: r.get(k) for k in ("sayfa", "pngGenislik", "onizlemeUyarisi")})
    r, _ = c.cagir("gorsel_bilgi", {"yol": docx_yol})
    kaydet_sonuc("gorsel_bilgi/word", "ek-word.docx", r.get("tur") == "word" and r.get("alt") == "docx" and r.get("pdfeCevrilebilir") is word_var,
                 {k: r.get(k) for k in ("tur", "alt", "pdfeCevrilebilir", "neden")})
    t, _ = c.cagir("boyut_tahmini", {"ogeler": [{"yol": udf}, {"yol": YATAY, "tur": "pdf"}], "kalite": "orijinal"})
    kaydet_sonuc("boyut_tahmini/belge", "UDF tahmin edilmez, toplama girmez", t["ogeler"][0].get("tahminYok") is True and t["ogeler"][0].get("neden")
                 and t["toplam"] == t["ogeler"][1]["boyut"], {"udf": t["ogeler"][0], "toplam": t["toplam"]})
    # Karışık birleştirme: PDF + UDF + görüntü + Word (öğede tür verilmeden: içerikten)
    hedef = os.path.join(klasor, "birlesik.pdf")
    ogeler = [{"yol": YATAY}, {"yol": udf}, {"yol": g["bmp"]}] + ([{"yol": docx_yol}] if word_var else [])
    once = gecici_donustur_klasorleri()
    if not ude_var:
        try:
            c.cagir("birlestir", {"ogeler": ogeler, "hedef": hedef})
            kaydet_sonuc("birlestir/belge", "UDE yok", False, "hata beklenirdi")
        except Exception as e:
            kaydet_sonuc("birlestir/belge", "UDE yok: belgenin adıyla reddedilir", "ek-udf.udf" in str(e) and not os.path.exists(hedef), str(e).splitlines()[0])
        return
    t0 = time.time()
    r, il = c.cagir("birlestir", {"ogeler": ogeler, "hedef": hedef, "genelKalite": "orijinal"})
    sure = time.time() - t0
    d = pymupdf.open(hedef)
    try:
        n = d.page_count
        yatay_n = belge_ozet(YATAY)["sayfa"]
        udf_metni = d[yatay_n].get_text()
        word_metni = d[yatay_n + 2].get_text() if word_var and n > yatay_n + 2 else ""
        yazi_tipleri = [f for pg in d for f in pg.get_fonts(full=True)]
    finally:
        d.close()
    beklenen = yatay_n + 1 + 1 + (1 if word_var else 0)
    yuzdeler = [x["yuzde"] for x in il]
    kaydet_sonuc("birlestir/belge", "PDF + UDF + BMP%s: sırayla, sayfa %d" % (" + Word" if word_var else "", beklenen),
                 n == beklenen and r.get("sayfa") == beklenen and "ğüşıöç" in udf_metni and "DENEME BELGESİ" in udf_metni
                 and (not word_var or "Deneme Word belgesi" in word_metni),
                 "sayfa %d/%d, UDF metni %s, Word metni %s, %.1f sn" % (n, beklenen, "ğüşıöç" in udf_metni, "Deneme Word" in word_metni, sure))
    kaydet_sonuc("birlestir/belge", "ilerleme: dönüştürme %0–60, birleştirme %60–100, artan",
                 yuzdeler == sorted(yuzdeler) and any(y < 60 for y in yuzdeler) and any(y >= 60 for y in yuzdeler)
                 and any("PDF'e çevriliyor" in x["mesaj"] for x in il), "%d bildirim, %s…%s" % (len(il), yuzdeler[:3], yuzdeler[-3:]))
    kaydet_sonuc("birlestir/belge", "UDF'nin yazı tipleri gömülü", yazi_tipleri and all(f[1] not in ("n/a", "") for f in yazi_tipleri
                 if "Times" in f[3] or "Arial" in f[3]), len(yazi_tipleri))
    kaydet_sonuc("birlestir/belge", "geçici PDF'ler silindi", gecici_donustur_klasorleri() == once, gecici_donustur_klasorleri())
    # İptal: belge dönüştürülürken
    hedef2 = os.path.join(klasor, "iptal.pdf")
    buyuk = kurgusal_udf(os.path.join(klasor, "buyuk.udf"), [PARAGRAF * 6] * 300)
    try:
        c.cagir("birlestir", {"ogeler": [{"yol": YATAY}, {"yol": buyuk}], "hedef": hedef2}, iptal_sonra=2)
        kaydet_sonuc("birlestir/belge iptal", "buyuk.udf", False, "iptal edilmedi")
    except Exception as e:
        kaydet_sonuc("birlestir/belge iptal", "dönüştürürken iptal: hedef yok, geçici PDF yok", "iptal" in str(e).lower() and not os.path.exists(hedef2)
                     and gecici_donustur_klasorleri() == once, str(e).splitlines()[0])
    # UDE yokken (benzetim): istek belgenin adıyla ve nedeniyle reddedilir
    if not c.surec:
        from islemler import donustur as D
        donusturucu = D._DONUSTURUCULER[("udf", "pdf")]
        eski = donusturucu._hazir
        donusturucu._hazir = lambda: (False, "Bu bilgisayarda UYAP Doküman Editörü bulunamadı.")
        try:
            r, _ = c.cagir("gorsel_bilgi", {"yol": udf, "onizleme": False})
            kaydet_sonuc("gorsel_bilgi/udf", "UDE yok: PDF'e çevrilemez, nedeni", r.get("pdfeCevrilebilir") is False and "UYAP" in (r.get("neden") or ""), r.get("neden"))
            try:
                c.cagir("birlestir", {"ogeler": [{"yol": YATAY}, {"yol": udf}], "hedef": hedef2})
                kaydet_sonuc("birlestir/belge", "UDE yok", False, "hata beklenirdi")
            except Exception as e:
                kaydet_sonuc("birlestir/belge", "UDE yok: \"ek-udf.udf: … bulunamadı\", hedef yazılmadı", "ek-udf.udf" in str(e) and "bulunamadı" in str(e)
                             and not os.path.exists(hedef2), str(e).splitlines()[0])
        finally:
            donusturucu._hazir = eski


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
        ("birlestir/A4", lambda: test_birlestir_a4(c)),
        ("birlestir/kalite büyütmez", lambda: test_kalite_buyutmez(c)),
        ("birlestir/yön", lambda: test_gorsel_yonu(c)),
        ("birlestir/üzerine", lambda: test_birlestir_uzerine(c)),
        ("birlestir/tiff", lambda: test_birlestir_tiff(c)),
        ("birlestir/belgeler", lambda: test_birlestir_belgeler(c, g)),
        ("dondur_kaydet", lambda: test_dondur_kaydet(c)),
    ]
    # --yalniz ad1,ad2: yalnızca bu testler (yukarıdaki adlar: "birlestir/A4", "birlestir/tiff"…)
    if "--yalniz" in sys.argv:
        secilen = set(sys.argv[sys.argv.index("--yalniz") + 1].split(","))
        testler = [x for x in testler if x[0] in secilen]
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
