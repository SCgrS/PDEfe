# -*- coding: utf-8 -*-
"""README ekran görüntüleri için örnek belgeleri üretir (test/readme_goruntuleri.mjs kullanır). Gerçek kişi ya da dosya bilgisi yoktur:
kanun metinleri kamuya açıktır (mevzuat.gov.tr; yerelde test/pdf altında durur, depoda yoktur), dilekçe ve makbuz kurgusaldır.

Kullanım:
  .venv\\Scripts\\python.exe test\\readme_ornek_uret.py <çıktı klasörü>
Üretilenler:
  Türk Medeni Kanunu.pdf, Türk Ticaret Kanunu.pdf  test/pdf/mevzuat_4721_TMK.pdf ve mevzuat_6102_TTK.pdf'in kopyaları; kitap, kısım, bölüm
                                                   ve ayırım başlıklarından yer imi (İçindekiler) eklenir. Asılları yoksa atlanır.
  Dava dilekçesi.pdf                               kurgusal, iki sayfa (Times New Roman; Windows'ta gömülü)
  Taranmış dilekçe.pdf                             dilekçenin iki sayfası görüntü olarak (taranmış belge gibi; metin katmanı yok)
  Makbuz.png, Dilekçe sayfa 2.jpg                  Görüntü / PDF birleştir için görseller
"""
import io
import os
import re
import shutil
import sys

import pymupdf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_KLASORU = "/System/Library/Fonts/Supplemental" if sys.platform == "darwin" else os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
TIMES = os.path.join(FONT_KLASORU, "Times New Roman.ttf" if sys.platform == "darwin" else "times.ttf")
TIMES_KALIN = os.path.join(FONT_KLASORU, "Times New Roman Bold.ttf" if sys.platform == "darwin" else "timesbd.ttf")
ARIAL = os.path.join(FONT_KLASORU, "Arial.ttf" if sys.platform == "darwin" else "arial.ttf")
ARIAL_KALIN = os.path.join(FONT_KLASORU, "Arial Bold.ttf" if sys.platform == "darwin" else "arialbd.ttf")

SIRA = r"(BİRİNCİ|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ|ALTINCI|YEDİNCİ|SEKİZİNCİ|DOKUZUNCU|ONUNCU)"
DUZEY = {"KİTAP": 1, "KISIM": 2, "BÖLÜM": 3, "AYIRIM": 4}


def tr_kucuk(s):
    return s.replace("I", "ı").replace("İ", "i").lower()


def tr_baslik(s):
    """"BİRİNCİ KİTAP" → "Birinci Kitap" (Python'un title()'ı İ'yi i + birleşik nokta yapar)."""
    return " ".join(w[:1] + tr_kucuk(w[1:]) for w in s.split())


def yer_imli_kopya(kaynak, hedef):
    """Kanun metninin kopyası: "BİRİNCİ KİTAP / KİŞİLER HUKUKU" gibi başlık satırlarından yer imi ağacı."""
    doc = pymupdf.open(kaynak)
    toc, son = [], 0
    for i, pg in enumerate(doc):
        satirlar = [s.strip() for s in pg.get_text().splitlines() if s.strip()]
        for j, s in enumerate(satirlar):
            if s == "BAŞLANGIÇ" and not toc:
                toc.append([1, "Başlangıç", i + 1]); son = 1
                continue
            m = re.fullmatch(SIRA + r"\s+(KİTAP|KISIM|BÖLÜM|AYIRIM)", s)
            if not m:
                continue
            duzey = DUZEY[m.group(2)]
            sonraki = satirlar[j + 1] if j + 1 < len(satirlar) else ""
            ad = tr_baslik(s)
            if sonraki and sonraki.isupper() and not re.fullmatch(SIRA + r"\s+\w+", sonraki) and len(sonraki) < 60:
                ad += " — " + sonraki[:1] + tr_kucuk(sonraki[1:])
            duzey = min(duzey, son + 1)   # PyMuPDF yer imi düzeyleri birer birer artmalı
            toc.append([duzey, ad, i + 1]); son = duzey
    if toc:
        doc.set_toc(toc)
    doc.save(hedef, garbage=3, deflate=True)
    doc.close()
    return len(toc)


DILEKCE_SAYFA1 = [
    ("baslik", "İSTANBUL (   ). ASLİYE TİCARET MAHKEMESİ'NE"),
    ("bosluk", ""),
    ("alan", ("DAVACI", "Örnek Ticaret A.Ş.")),
    ("alan", ("VEKİLİ", "Av. Örnek Yazar")),
    ("alan", ("DAVALI", "Deneme Lojistik Ltd. Şti.")),
    ("alan", ("DAVA DEĞERİ", "100.000,00 TL")),
    ("alan", ("KONU", "Taşıma sözleşmesinden doğan alacağın, fazlaya ilişkin haklarımız saklı kalmak kaydıyla, temerrüt tarihinden "
                       "itibaren işleyecek ticari faiziyle birlikte davalıdan tahsili istemidir.")),
    ("bosluk", ""),
    ("ara", "AÇIKLAMALAR"),
    ("paragraf", "1. Müvekkil şirket ile davalı arasında 01.02.2026 tarihli taşıma sözleşmesi imzalanmıştır. Sözleşmenin 4. maddesi "
                 "uyarınca davalı, müvekkile ait yükü teslim aldığı gibi ve sözleşmede belirlenen sürede alıcıya teslim etmeyi "
                 "üstlenmiştir."),
    ("paragraf", "2. Yük, kararlaştırılan teslim tarihinden on dört gün sonra ve hasarlı olarak teslim edilmiştir. Hasar, teslim "
                 "sırasında tutulan tutanakla ve bağımsız ekspertiz raporuyla tespit edilmiştir. Türk Ticaret Kanunu'nun 875. maddesi "
                 "uyarınca taşıyıcı, eşyanın taşınmak üzere teslim alınmasından teslim edilmesine kadar geçecek süre içinde ziyaa "
                 "uğraması veya hasara uğraması ya da teslimin gecikmesi sonucu doğan zararlardan sorumludur."),
    ("paragraf", "3. Müvekkil tarafından davalıya gönderilen 15.03.2026 tarihli ihtarnameye rağmen zarar karşılanmamıştır. Bu "
                 "nedenle işbu davayı açma zorunluluğu doğmuştur."),
    ("paragraf", "4. Davanın açılmasından önce 6325 sayılı Kanun ve Türk Ticaret Kanunu'nun 5/A maddesi uyarınca arabulucuya "
                 "başvurulmuş, taraflar anlaşamamıştır. Son tutanak dilekçemiz ekindedir."),
]
DILEKCE_SAYFA2 = [
    ("ara", "HUKUKİ SEBEPLER"),
    ("paragraf", "6098 sayılı Türk Borçlar Kanunu, 6102 sayılı Türk Ticaret Kanunu, 6100 sayılı Hukuk Muhakemeleri Kanunu ve ilgili "
                 "mevzuat."),
    ("ara", "DELİLLER"),
    ("paragraf", "Taşıma sözleşmesi, teslim tutanağı, ekspertiz raporu, faturalar, ihtarname, arabuluculuk son tutanağı, tarafların "
                 "ticari defterleri, bilirkişi incelemesi, tanık beyanları ve her türlü yasal delil."),
    ("ara", "SONUÇ VE İSTEM"),
    ("paragraf", "Yukarıda açıklanan ve re'sen gözetilecek nedenlerle; davamızın kabulü ile 100.000,00 TL alacağın temerrüt "
                 "tarihinden itibaren işleyecek ticari faiziyle birlikte davalıdan tahsiline, yargılama giderleri ile vekâlet "
                 "ücretinin davalıya yükletilmesine karar verilmesini saygıyla arz ve talep ederiz."),
    ("bosluk", ""),
    ("imza", "Davacı Vekili\nAv. Örnek Yazar"),
    ("bosluk", ""),
    ("ara", "EKLER"),
    ("paragraf", "1. Vekâletname örneği\n2. Taşıma sözleşmesi\n3. Ekspertiz raporu\n4. Arabuluculuk son tutanağı"),
]


def dilekce(hedef):
    doc = pymupdf.open()
    yazi = {"fontname": "times", "fontfile": TIMES} if os.path.exists(TIMES) else {"fontname": "tiro"}
    kalin = {"fontname": "timesbd", "fontfile": TIMES_KALIN} if os.path.exists(TIMES_KALIN) else {"fontname": "tibo"}
    for icerik in (DILEKCE_SAYFA1, DILEKCE_SAYFA2):
        pg = doc.new_page(width=595, height=842)
        y = 80
        for tur, deger in icerik:
            if tur == "bosluk":
                y += 10
            elif tur == "baslik":
                pg.insert_textbox(pymupdf.Rect(70, y, 525, y + 20), deger, fontsize=12.5, align=1, **kalin); y += 26
            elif tur == "ara":
                pg.insert_textbox(pymupdf.Rect(70, y, 525, y + 18), deger, fontsize=12, **kalin); y += 22
            elif tur == "alan":
                ad, metin = deger
                pg.insert_textbox(pymupdf.Rect(70, y, 175, y + 18), ad, fontsize=12, **kalin)
                pg.insert_textbox(pymupdf.Rect(175, y, 185, y + 18), ":", fontsize=12, **kalin)
                kutu = pymupdf.Rect(190, y, 525, y + 200)
                kalan = pg.insert_textbox(kutu, metin, fontsize=12, align=3, **yazi)
                y += max(20, 200 - kalan + 4)
            elif tur == "paragraf":
                kutu = pymupdf.Rect(70, y, 525, y + 300)
                kalan = pg.insert_textbox(kutu, deger, fontsize=12, align=3, lineheight=1.35, **yazi)
                y += 300 - kalan + 10
            elif tur == "imza":
                pg.insert_textbox(pymupdf.Rect(340, y, 525, y + 40), deger, fontsize=12, align=1, **kalin); y += 44
    try:
        doc.subset_fonts()
    except Exception:
        pass
    doc.save(hedef, garbage=3, deflate=True)
    doc.close()


def taranmis(kaynak, hedef_pdf, hedef_jpg):
    """Dilekçe taranmış gibi (gri, hafif bulanık ve eğik görüntü sayfaları); ikinci sayfası ayrıca JPEG."""
    doc = pymupdf.open(kaynak)
    yeni = pymupdf.open()
    for i, aci in ((0, 0.35), (1, -0.25)):
        pix = doc[i].get_pixmap(dpi=200, colorspace=pymupdf.csGRAY)
        im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("L")
        im = im.rotate(aci, resample=Image.BICUBIC, fillcolor=255).filter(ImageFilter.GaussianBlur(0.6))
        im = im.point(lambda v: min(255, int(v * 0.93 + 10)))
        tampon = io.BytesIO(); im.save(tampon, "JPEG", quality=90)
        pg = yeni.new_page(width=595, height=842)
        pg.insert_image(pg.rect, stream=tampon.getvalue())
    yeni.save(hedef_pdf, garbage=3, deflate=True)
    yeni.close()
    pix2 = doc[1].get_pixmap(dpi=110)
    Image.open(io.BytesIO(pix2.tobytes("png"))).convert("RGB").save(hedef_jpg, "JPEG", quality=85)
    doc.close()


def makbuz(hedef):
    im = Image.new("RGB", (900, 560), (252, 250, 243))
    d = ImageDraw.Draw(im)
    def yt(yol, boy):
        return ImageFont.truetype(yol, boy) if os.path.exists(yol) else ImageFont.load_default()
    d.rectangle([20, 20, 880, 540], outline=(60, 60, 60), width=3)
    d.text((450, 70), "TAHSİLAT MAKBUZU", font=yt(ARIAL_KALIN, 40), fill=(30, 30, 30), anchor="mm")
    satirlar = [("Makbuz No", "2026/0412"), ("Tarih", "02.10.2026"), ("Ödeyen", "Örnek Ticaret A.Ş."),
                ("Açıklama", "Başvurma harcı ve gider avansı"), ("Tutar", "1.250,00 TL")]
    y = 150
    for ad, deger in satirlar:
        d.text((70, y), ad, font=yt(ARIAL_KALIN, 28), fill=(40, 40, 40))
        d.text((300, y), ": " + deger, font=yt(ARIAL, 28), fill=(40, 40, 40))
        y += 62
    d.ellipse([640, 380, 830, 510], outline=(40, 70, 160), width=4)
    d.text((735, 445), "ÖDENDİ", font=yt(ARIAL_KALIN, 30), fill=(40, 70, 160), anchor="mm")
    im.save(hedef, "PNG", optimize=True)


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    cikti = sys.argv[1]
    os.makedirs(cikti, exist_ok=True)
    pdf = os.path.join(KOK, "test", "pdf")
    for kaynak, ad in (("mevzuat_4721_TMK.pdf", "Türk Medeni Kanunu.pdf"), ("mevzuat_6102_TTK.pdf", "Türk Ticaret Kanunu.pdf")):
        k = os.path.join(pdf, kaynak)
        if os.path.exists(k):
            print(ad, "yer imi:", yer_imli_kopya(k, os.path.join(cikti, ad)))
        else:
            print("yok, atlandı:", k)
    d = os.path.join(cikti, "Dava dilekçesi.pdf")
    dilekce(d)
    taranmis(d, os.path.join(cikti, "Taranmış dilekçe.pdf"), os.path.join(cikti, "Dilekçe sayfa 2.jpg"))
    makbuz(os.path.join(cikti, "Makbuz.png"))
    print("yazıldı:", cikti)


if __name__ == "__main__":
    main()
