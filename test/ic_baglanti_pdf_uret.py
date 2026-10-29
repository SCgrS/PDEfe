# İç bağlantı sınamasının (test/senaryo45.mjs) örnek PDF'ini üretir (0.3.1; gerçek belge yok, metinler yer tutucu).
# Kullanım: .venv\Scripts\python.exe test\ic_baglanti_pdf_uret.py <çıktı.pdf>
# Çıktı: son satırda JSON özet {"sayfa": N, "satirlar": [...], "hedefler": {...}} (betik bağlantıları ve beklenen hedefleri buradan okur).
#
# 1. sayfa içindekiler: her satır bir Link notu, her biri başka bir hedef biçimi (bağlantılar ham nesne olarak yazılır, PyMuPDF'in
# insert_link'i biçimleri sınırlar):
#   GoTo eylemi + açık XYZ, /Dest dizisi XYZ (sol null), Fit, FitH, FitV, FitR, FitB, FitBH, FitBV, adlandırılmış hedef (Names ağacı,
#   dizge; ağaç Kids / Limits ile iki yapraklı), adlandırılmış hedef (PDF 1.1 /Dests sözlüğü, ad; değer << /D [...] >>), GoTo eylemi +
#   adlandırılmış hedef, "/" ile başlayan ad (bazı programlar böyle yazar), döndürülmüş (/Rotate 90) sayfaya XYZ, kaydırılmış MediaBox'lı sayfaya XYZ, adlandırılmış eylem NextPage,
#   GoToR (başka dosya), Launch (program), olmayan hedef adı.
# 2. sayfa: adlandırılmış eylemler PrevPage, FirstPage, LastPage, NextPage.
# Hedef sayfalarda beklenen noktada yatay bir çizgi ve "HEDEF-<anahtar>" yazısı. Döndürülmüş sayfada "İçindekilere dön" bağlantısı.
# Yer imleri (Outlines): adlandırılmış hedef, kaydırılmış kutu, döndürülmüş sayfa, GoTo eylemiyle FitH.
import json
import os
import sys

import pymupdf

A4 = (595, 842)
ARIAL = ("/System/Library/Fonts/Supplemental/Arial.ttf" if sys.platform == "darwin"
         else os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arial.ttf"))

# (anahtar, satır yazısı, hedef sayfa (1 tabanlı; None: sayfaya gitmez), hedef biçimi)
# Hedef biçimi: ("dizi", "XYZ", sol, ust) gibi PDF hedef dizisinin türü ve parametreleri (PDF kullanıcı uzayı, y yukarı);
# ("ad", ad, ...) adlandırılmış hedef; ("eylem", ...) diğer eylemler.
SATIRLAR = [
    ("xyz", "GoTo eylemi, açık XYZ hedefi", 3, ("eylem-dizi", "XYZ", 72, 500, None)),
    ("dest-xyz", "/Dest dizisi, XYZ (sol null)", 4, ("dizi", "XYZ", None, 300, 0)),
    ("fit", "Fit", 5, ("dizi", "Fit")),
    ("fith", "FitH", 6, ("dizi", "FitH", 600)),
    ("fitv", "FitV", 7, ("dizi", "FitV", 100)),
    ("fitr", "FitR", 8, ("dizi", "FitR", 50, 200, 300, 400)),
    ("fitb", "FitB", 9, ("dizi", "FitB")),
    ("fitbh", "FitBH", 10, ("dizi", "FitBH", 700)),
    ("fitbv", "FitBV", 11, ("dizi", "FitBV", 50)),
    ("ad-agac", "Adlandırılmış hedef, Names ağacı", 12, ("ad-dizge", "bolum-a")),
    ("ad-sozluk", "Adlandırılmış hedef, /Dests sözlüğü", 13, ("ad-ad", "bolumB")),
    ("ad-eylem", "GoTo eylemi, adlandırılmış hedef", 14, ("eylem-ad", "bolum-c")),
    ("ad-egik", "Adlandırılmış hedef, eğik çizgiyle başlayan ad", 9, ("ad-dizge", "/bolum-d")),
    ("donuk", "Döndürülmüş sayfa (90°)", 15, ("dizi", "XYZ", 100, 400, 0)),
    ("kayik", "Kaydırılmış MediaBox", 16, ("dizi", "XYZ", 0, 700, 0)),
    ("sonraki", "Sonraki sayfa", 2, ("adli-eylem", "NextPage")),
    ("gotor", "Başka dosya", None, ("gotor",)),
    ("launch", "Program", None, ("launch",)),
    ("yok", "Olmayan hedef", None, ("ad-dizge", "boyle-bir-ad-yok")),
]
# Adlandırılmış hedeflerin dizileri: ad → (sayfa, tür, parametreler)
AD_HEDEFLERI = {
    "bolum-a": (12, "XYZ", 0, 450, 0),
    "bolumB": (13, "XYZ", 0, 350, 0),
    "bolum-c": (14, "FitH", 250),
    "bolum-z": (16, "Fit"),            # yalnızca ağacın ikinci yaprağını dolduruyor
    "/bolum-d": (9, "XYZ", 0, 520, 0),  # bazı programların yazdığı biçim: ad dizgesi "/" ile başlar
}
# 2. sayfadaki adlandırılmış eylemler: (anahtar, yazı, eylem, hedef sayfa)
EYLEMLER_2 = [
    ("onceki", "Önceki sayfa", "PrevPage", 1),
    ("ilk", "İlk sayfa", "FirstPage", 1),
    ("son", "Son sayfa", "LastPage", 16),
    ("sonraki2", "Sonraki sayfa", "NextPage", 3),
]
SAYFA_SAYISI = 16
DONUK_SAYFA, KAYIK_SAYFA = 15, 16
KAYIK_MEDIABOX = (0, 100, 595, 942)   # kullanıcı uzayında y 100..942


def pdf_sayi(v):
    return "null" if v is None else ("%g" % v)


def hedef_dizisi(sayfa_xref, tur, *parametre):
    return "[%d 0 R /%s %s]" % (sayfa_xref, tur, " ".join(pdf_sayi(p) for p in parametre))


def pdf_dizge(s):
    return "(" + s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ")"


def pdf_metin(s):
    """Metin dizgesi UTF-16BE (BOM'lu), onaltılık: Türkçe harfli yer imi başlıkları için."""
    return "<FEFF%s>" % s.encode("utf-16-be").hex().upper()


def beklenen_nokta(sayfa, tur, *parametre):
    """Hedefte pencerenin üstüne gelmesi beklenen nokta, PDF kullanıcı uzayında (sol, üst; None: sayfanın başı / değişmez)."""
    if tur == "XYZ":
        return parametre[0], parametre[1]
    if tur in ("FitH", "FitBH"):
        return None, parametre[0]
    if tur == "FitR":
        return parametre[0], max(parametre[1], parametre[3])
    return None, None


def uret(yol):
    doc = pymupdf.open()
    yazi = {"fontname": "arial", "fontfile": ARIAL} if os.path.exists(ARIAL) else {"fontname": "helv"}
    for i in range(SAYFA_SAYISI):
        pg = doc.new_page(width=A4[0], height=A4[1])
        pg.insert_text((72, 60), "Deneme belgesi, sayfa %d" % (i + 1), fontsize=16, **yazi)
    xrefler = [doc[i].xref for i in range(SAYFA_SAYISI)]

    hedefler = {}
    # Hedef sayfalardaki işaretler: beklenen noktanın yüksekliğinde çizgi ve yazı
    def isaretle(anahtar, sayfa, tur, *parametre):
        sol, ust = beklenen_nokta(sayfa, tur, *parametre)
        hedefler[anahtar] = {"sayfa": sayfa, "tur": tur, "sol": sol, "ust": ust}
        if ust is None:
            return
        pg = doc[sayfa - 1]
        y = A4[1] - ust   # bütün sayfalar şimdilik A4 ve döndürülmemiş: çizim kullanıcı uzayında ust yüksekliğine düşer
        sh = pg.new_shape()
        sh.draw_line((40, y), (555, y))
        sh.finish(color=(0.8, 0, 0), width=1)
        sh.commit()
        pg.insert_text((60, y + 14), "HEDEF-%s" % anahtar, fontsize=10, **yazi)

    for anahtar, _, sayfa, h in SATIRLAR:
        if h[0] in ("dizi", "eylem-dizi"):
            isaretle(anahtar, sayfa, h[1], *h[2:])
        elif h[0] in ("ad-dizge", "ad-ad", "eylem-ad") and h[1] in AD_HEDEFLERI:
            a = AD_HEDEFLERI[h[1]]
            isaretle(anahtar, a[0], a[1], *a[2:])
        elif h[0] == "adli-eylem":
            hedefler[anahtar] = {"sayfa": sayfa, "tur": "Fit", "sol": None, "ust": None}
        else:
            hedefler[anahtar] = {"sayfa": None}
    for anahtar, _, _, sayfa in EYLEMLER_2:
        hedefler[anahtar] = {"sayfa": sayfa, "tur": "Fit", "sol": None, "ust": None}
    hedefler["geri"] = {"sayfa": 1, "tur": "Fit", "sol": None, "ust": None}

    # Adlandırılmış hedefler: Names ağacı (Kids / Limits, iki yaprak; anahtarlar sıralı) ve PDF 1.1 /Dests sözlüğü
    yaprak1 = doc.get_new_xref()
    a = AD_HEDEFLERI["bolum-a"]
    c = AD_HEDEFLERI["bolum-c"]
    e = AD_HEDEFLERI["/bolum-d"]
    doc.update_object(yaprak1, "<< /Limits [(/bolum-d) (bolum-c)] /Names [(/bolum-d) %s (bolum-a) %s (bolum-c) %s] >>" % (
        hedef_dizisi(xrefler[e[0] - 1], e[1], *e[2:]), hedef_dizisi(xrefler[a[0] - 1], a[1], *a[2:]),
        hedef_dizisi(xrefler[c[0] - 1], c[1], *c[2:])))
    yaprak2 = doc.get_new_xref()
    z = AD_HEDEFLERI["bolum-z"]
    doc.update_object(yaprak2, "<< /Limits [(bolum-z) (bolum-z)] /Names [(bolum-z) %s] >>" % hedef_dizisi(xrefler[z[0] - 1], z[1], *z[2:]))
    agac = doc.get_new_xref()
    doc.update_object(agac, "<< /Kids [%d 0 R %d 0 R] >>" % (yaprak1, yaprak2))
    adlar = doc.get_new_xref()
    doc.update_object(adlar, "<< /Dests %d 0 R >>" % agac)
    kat = doc.pdf_catalog()
    doc.xref_set_key(kat, "Names", "%d 0 R" % adlar)
    b = AD_HEDEFLERI["bolumB"]
    doc.xref_set_key(kat, "Dests", "<< /bolumB << /D %s >> >>" % hedef_dizisi(xrefler[b[0] - 1], b[1], *b[2:]))

    def link_ekle(sayfa_no, rect, govde):
        """rect: PyMuPDF koordinatı (sol üst köşe); PDF'e kullanıcı uzayında yazılır (sayfa standart A4)."""
        x0, y0, x1, y1 = rect
        r = "[%g %g %g %g]" % (x0, A4[1] - y1, x1, A4[1] - y0)
        x = doc.get_new_xref()
        doc.update_object(x, "<< /Type /Annot /Subtype /Link /Rect %s /Border [0 0 0] %s >>" % (r, govde))
        px = xrefler[sayfa_no - 1]
        t, v = doc.xref_get_key(px, "Annots")
        eski = v[1:-1].strip() if t == "array" else ""
        doc.xref_set_key(px, "Annots", "[%s %d 0 R]" % (eski, x))

    satirlar = []
    p1 = doc[0]
    p1.insert_text((72, 90), "İçindekiler", fontsize=14, **yazi)
    for i, (anahtar, metin, sayfa, h) in enumerate(SATIRLAR):
        y = 110 + i * 34
        rect = (72, y, 420, y + 26)
        p1.insert_text((80, y + 18), metin, fontsize=12, **yazi)
        tur = h[0]
        if tur == "dizi":
            govde = "/Dest %s" % hedef_dizisi(xrefler[sayfa - 1], h[1], *h[2:])
        elif tur == "eylem-dizi":
            govde = "/A << /S /GoTo /D %s >>" % hedef_dizisi(xrefler[sayfa - 1], h[1], *h[2:])
        elif tur == "ad-dizge":
            govde = "/Dest %s" % pdf_dizge(h[1])
        elif tur == "ad-ad":
            govde = "/Dest /%s" % h[1]
        elif tur == "eylem-ad":
            govde = "/A << /S /GoTo /D %s >>" % pdf_dizge(h[1])
        elif tur == "adli-eylem":
            govde = "/A << /S /Named /N /%s >>" % h[1]
        elif tur == "gotor":
            govde = "/A << /S /GoToR /F (baska-belge.pdf) /D [0 /Fit] >>"
        elif tur == "launch":
            govde = "/A << /S /Launch /F (deneme-programi.exe) >>"
        link_ekle(1, rect, govde)
        satirlar.append({"anahtar": anahtar, "sayfa": 1, "rect": list(rect)})
    p2 = doc[1]
    for i, (anahtar, metin, eylem, _) in enumerate(EYLEMLER_2):
        y = 110 + i * 40
        rect = (72, y, 420, y + 30)
        p2.insert_text((80, y + 20), metin, fontsize=12, **yazi)
        link_ekle(2, rect, "/A << /S /Named /N /%s >>" % eylem)
        satirlar.append({"anahtar": anahtar, "sayfa": 2, "rect": list(rect)})
    # Döndürülmüş sayfada geri bağlantısı (kaynak kutusunun döndürülmüş sayfada doğru yere konduğunu sınar). PyMuPDF koordinatı
    # döndürülmemiş sayfanındır (sol üst köşe); kutu sayfanın sol üst çeyreğinde
    pd = doc[DONUK_SAYFA - 1]
    rect = (72, 100, 300, 140)
    pd.insert_text((80, 125), "İçindekilere dön", fontsize=12, **yazi)
    link_ekle(DONUK_SAYFA, rect, "/Dest %s" % hedef_dizisi(xrefler[0], "Fit"))
    satirlar.append({"anahtar": "geri", "sayfa": DONUK_SAYFA, "rect": list(rect)})
    # Yer imleri (sayfalar paneli, İçindekiler): adlandırılmış hedef, kaydırılmış kutu, döndürülmüş sayfa, GoTo eylemiyle FitH
    yer_imleri = [
        ("Yer imi: adlandırılmış hedef", "/Dest %s" % pdf_dizge("bolum-a"), "ad-agac"),
        ("Yer imi: kaydırılmış kutu", "/Dest %s" % hedef_dizisi(xrefler[KAYIK_SAYFA - 1], "XYZ", 0, 700, 0), "kayik"),
        ("Yer imi: döndürülmüş sayfa", "/Dest %s" % hedef_dizisi(xrefler[DONUK_SAYFA - 1], "XYZ", 100, 400, 0), "donuk"),
        ("Yer imi: FitH", "/A << /S /GoTo /D %s >>" % hedef_dizisi(xrefler[5], "FitH", 600), "fith"),
    ]
    kok = doc.get_new_xref()
    ogeler = [doc.get_new_xref() for _ in yer_imleri]
    for i, (baslik, govde, _) in enumerate(yer_imleri):
        komsu = (" /Prev %d 0 R" % ogeler[i - 1] if i else "") + (" /Next %d 0 R" % ogeler[i + 1] if i + 1 < len(ogeler) else "")
        doc.update_object(ogeler[i], "<< /Title %s /Parent %d 0 R%s %s >>" % (pdf_metin(baslik), kok, komsu, govde))
    doc.update_object(kok, "<< /Type /Outlines /First %d 0 R /Last %d 0 R /Count %d >>" % (ogeler[0], ogeler[-1], len(ogeler)))
    doc.xref_set_key(kat, "Outlines", "%d 0 R" % kok)
    # Kaydırılmış MediaBox ve döndürme en sonda: yukarıdaki yazılar, çizgiler ve bağlantı kutuları A4 kullanıcı uzayına yazıldı, kutu
    # değişince yerlerinde kalırlar (kaydırılmış sayfada görünen bölge y 100..942)
    doc.xref_set_key(xrefler[KAYIK_SAYFA - 1], "MediaBox", "[%s]" % " ".join("%g" % v for v in KAYIK_MEDIABOX))
    doc.xref_set_key(xrefler[KAYIK_SAYFA - 1], "CropBox", "null")
    doc.xref_set_key(xrefler[DONUK_SAYFA - 1], "Rotate", "90")
    try:
        doc.subset_fonts()
    except Exception:
        pass
    doc.save(yol, garbage=0, deflate=True)
    doc.close()
    return {"sayfa": SAYFA_SAYISI, "satirlar": satirlar, "hedefler": hedefler, "donuk": DONUK_SAYFA, "kayik": KAYIK_SAYFA,
            "kayikMediaBox": list(KAYIK_MEDIABOX), "yerImleri": [{"baslik": b, "anahtar": a} for b, _, a in yer_imleri],
            "sayfaXrefleri": xrefler}


if __name__ == "__main__":
    yol = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "cikti", "ic_baglanti", "ic_baglantilar.pdf")
    os.makedirs(os.path.dirname(os.path.abspath(yol)), exist_ok=True)
    print(json.dumps(uret(yol), ensure_ascii=False))
