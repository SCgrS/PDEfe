# -*- coding: utf-8 -*-
"""core/islemler/araclar.py uçtan uca testi: her yöntemi gerçek dosyalarla çağırır, çıktıları
test/cikti/araclar/ altına yazar, boyutları (MB), sayfa sayılarını, notların/yer imlerinin ve
Türkçe metnin korunduğunu doğrular; sonunda sonuç tablosunu yazdırır.

Çalıştırma:  .venv\\Scripts\\python.exe test\\araclar_testi.py [--exe core\\dist\\pdefe-core.exe]
--exe verilirse yöntemler doğrudan değil, paketlenmiş exe üzerinden JSON-RPC ile çağrılır.
"""
import os
import sys
import json
import time
import shutil
import subprocess
import traceback

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))

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
    klasor = os.path.join(CIKTI, "ayir")
    shutil.rmtree(klasor, ignore_errors=True)
    os.makedirs(klasor)
    once = belge_ozet(YERIMLI)
    r, _ = c.cagir("ayir", {"yol": YERIMLI, "hedefKlasor": klasor, "mod": "aralik", "araliklar": " 1-3 , 5, 10 - 8 "})
    adlar = [os.path.basename(x) for x in r["dosyalar"]]
    d = pymupdf.open(r["dosyalar"][0])
    toc1 = d.get_toc()
    tr1, _ = turkce_var(d)
    d.close()
    ok = (adlar == ["dergipark_3972595_ttk_tbk_1-3.pdf", "dergipark_3972595_ttk_tbk_sayfa_5.pdf", "dergipark_3972595_ttk_tbk_8-10.pdf"]
          and belge_ozet(r["dosyalar"][2])["sayfa"] == 3 and all(1 <= s <= 3 for _, _, s in toc1))
    kaydet_sonuc("ayir/aralik", "dergipark_3972595", ok, "%s toc(1-3)=%d tr=%s boyutlar=%s"
                 % (adlar, len(toc1), tr1, [mb(os.path.getsize(x)) for x in r["dosyalar"]]))
    # tekrar: (2) eki
    r2, _ = c.cagir("ayir", {"yol": YERIMLI, "hedefKlasor": klasor, "mod": "aralik", "araliklar": "1-3"})
    kaydet_sonuc("ayir/benzersiz", "1-3 yeniden", os.path.basename(r2["dosyalar"][0]) == "dergipark_3972595_ttk_tbk_1-3 (2).pdf", os.path.basename(r2["dosyalar"][0]))
    # herN
    r, _ = c.cagir("ayir", {"yol": YATAY, "hedefKlasor": klasor, "mod": "herN", "n": 2})
    ok = len(r["dosyalar"]) == 2 and belge_ozet(r["dosyalar"][1])["sayfa"] == 1 and os.path.basename(r["dosyalar"][0]).endswith("_bolum_1.pdf")
    kaydet_sonuc("ayir/herN", "2099_83_EK-1 n=2", ok, [os.path.basename(x) for x in r["dosyalar"]])
    # secili
    r, _ = c.cagir("ayir", {"yol": NOTLU, "hedefKlasor": klasor, "mod": "secili", "sayfalar": [1, 2, 5]})
    oz = belge_ozet(r["dosyalar"][0])
    kaydet_sonuc("ayir/secili", "DENEME PDF (2) [1,2,5]", oz["sayfa"] == 3 and oz["not"] == belge_ozet(NOTLU)["not"],
                 "%s sayfa=%d not=%d" % (os.path.basename(r["dosyalar"][0]), oz["sayfa"], oz["not"]))
    # tek
    r, _ = c.cagir("ayir", {"yol": YATAY, "hedefKlasor": klasor, "mod": "tek"})
    kaydet_sonuc("ayir/tek", "2099_83_EK-1", len(r["dosyalar"]) == 3, [os.path.basename(x) for x in r["dosyalar"]])
    # Renderer biçimi: parcalar [{ad, sayfalar}] + klasor; adlar çağırandan, üzerine yazma varsayılan
    parcalar = [{"ad": "tbk_s1-3.pdf", "sayfalar": [1, 2, 3]}, {"ad": "tbk_secili.pdf", "sayfalar": [5, 2, 9]}]
    r, _ = c.cagir("ayir", {"yol": YERIMLI, "klasor": klasor, "parcalar": parcalar, "mod": "aralik"})
    r2, _ = c.cagir("ayir", {"yol": YERIMLI, "klasor": klasor, "parcalar": parcalar, "mod": "aralik"})   # üzerine yazar
    r3, _ = c.cagir("ayir", {"yol": YERIMLI, "klasor": klasor, "parcalar": parcalar[:1], "uzerineYaz": False})
    adlar = [os.path.basename(x) for x in r["dosyalar"]]
    oz = belge_ozet(r["dosyalar"][1])
    ok = (adlar == ["tbk_s1-3.pdf", "tbk_secili.pdf"] and oz["sayfa"] == 3 and r["ayrintilar"][1]["sayfa"] == 3
          and r2["dosyalar"] == r["dosyalar"] and os.path.basename(r3["dosyalar"][0]) == "tbk_s1-3 (2).pdf"
          and r["ayrintilar"][0]["boyut"] == os.path.getsize(r["dosyalar"][0]))
    kaydet_sonuc("ayir/parcalar", "renderer biçimi", ok, "%s, secili sayfa=%d, yeniden=%s, uzerineYaz=False → %s"
                 % (adlar, oz["sayfa"], [os.path.basename(x) for x in r2["dosyalar"]] == adlar, os.path.basename(r3["dosyalar"][0])))
    # hatalı aralıklar
    for ifade in ("0-3", "1-99", "abc", "", "3-x"):
        try:
            c.cagir("ayir", {"yol": YATAY, "hedefKlasor": klasor, "mod": "aralik", "araliklar": ifade})
            kaydet_sonuc("ayir/hata", repr(ifade), False, "hata beklenirdi")
        except Exception as e:
            kaydet_sonuc("ayir/hata", repr(ifade), True, str(e).splitlines()[0])


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


def main():
    exe = None
    if "--exe" in sys.argv:
        exe = os.path.abspath(sys.argv[sys.argv.index("--exe") + 1])
        if not os.path.isfile(exe):
            print("exe bulunamadı:", exe)
            return 2
    os.makedirs(CIKTI, exist_ok=True)
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
        ("ayir", lambda: test_ayir(c)),
        ("gorsel_bilgi", lambda: test_gorsel_bilgi(c, g)),
        ("boyut_tahmini", lambda: test_boyut_tahmini(c, g)),
        ("birlestir", lambda: test_birlestir(c, g)),
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
