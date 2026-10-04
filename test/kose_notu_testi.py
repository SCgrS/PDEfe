# -*- coding: utf-8 -*-
"""Köşe noktalı notların (çizim / Ink, çizgi / Line, çokgen / Polygon, çoklu çizgi / PolyLine) taşınması kayda yansır (0.2.1).
MuPDF bu türlere /Rect yazdırmaz (set_rect False döner); 0.2.1'e dek arayüz taşınan notu yeni yerinde gösterip "Kaydedildi" diyordu,
dosyada not eski yerinde kalıyordu. Artık /Rect ve köşe noktaları (/InkList, /L, /Vertices) aynı miktarda kaydırılır; görünüm akışı
(/AP) korunur (başka programın çizdiği görünüm yeniden üretilmez). Denenen: döndürülmüş sayfa (90°), başlangıcı kaymış MediaBox,
/UserUnit 2, dolaylı başvurulu /InkList; artımlı, baştan (temiz) ve yapısal (sayfa düzeni değişmiş) kayıt; taşınamayan not hata verir,
dosya değişmez. Belgeler test/cikti/kose_notu altında (ya da ilk bağımsız değişkendeki klasörde) üretilir.
Kullanım: .venv\\Scripts\\python.exe test\\kose_notu_testi.py [çıktı klasörü]"""
import os
import shutil
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
import pdefe_core  # noqa: E402  (yöntemler ve önbellek kurulur)
from islemler import notlar, yapisal  # noqa: E402

CIKTI = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(KOK, "test", "cikti", "kose_notu")
shutil.rmtree(CIKTI, ignore_errors=True)
os.makedirs(CIKTI, exist_ok=True)
hata = toplam = 0
KOSELI = ("Ink", "Line", "Polygon", "PolyLine")


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if ok or not ayrinti else " — " + str(ayrinti)[:600]))


def belge_kur(yol):
    """Dört sayfa: (döndürme, MediaBox, UserUnit). Her sayfada kırmızı dolgulu özel görünümlü çizim (başka program gibi), oklu çizgi,
    çokgen, çoklu çizgi, kare ve altı çizili; ilk sayfada /InkList'i dolaylı başvurulu ikinci bir çizim."""
    doc = pymupdf.open()
    for rot, mb, birim in [(0, (0, 0, 600, 800), None), (90, (0, 0, 600, 800), None), (0, (50, 70, 650, 870), None), (0, (0, 0, 600, 800), 2)]:
        p = doc.new_page(width=600, height=800)
        doc.xref_set_key(p.xref, "MediaBox", "[%g %g %g %g]" % mb)
        if birim:
            doc.xref_set_key(p.xref, "UserUnit", str(birim))
        p.set_rotation(rot)
        p = doc[p.number]
        p.insert_text((60, 60), "Kose notu denemesi", fontsize=11)
        a = p.add_ink_annot([[(100, 100), (150, 120), (200, 160)]])
        a.set_border(width=2)
        a.set_colors(stroke=(0, 0, 1))
        a.update()
        ap = int(doc.xref_get_key(a.xref, "AP/N")[1].split()[0])
        x0, y0, x1, y1 = map(float, doc.xref_get_key(ap, "BBox")[1].strip("[]").split())
        doc.update_stream(ap, ("1 0 0 rg %g %g %g %g re f" % (x0, y0, x1 - x0, y1 - y0)).encode())
        cizgi = p.add_line_annot((100, 300), (200, 350))
        cizgi.set_line_ends(pymupdf.PDF_ANNOT_LE_OPEN_ARROW, pymupdf.PDF_ANNOT_LE_CLOSED_ARROW)
        cizgi.update()
        p.add_polygon_annot([(100, 400), (150, 450), (200, 400)]).update()
        p.add_polyline_annot([(300, 400), (350, 450), (400, 400)]).update()
        p.add_rect_annot((300, 100, 350, 150)).update()
        p.add_underline_annot(pymupdf.Rect(60, 50, 160, 62)).update()
        if p.number == 0:
            i2 = p.add_ink_annot([[(300, 200), (350, 250)], [(320, 200), (370, 250)]])
            i2.update()
            yeni = doc.get_new_xref()
            doc.update_object(yeni, doc.xref_get_key(i2.xref, "InkList")[1])
            doc.xref_set_key(i2.xref, "InkList", "%d 0 R" % yeni)
    doc.save(yol)
    doc.close()


def model(yol):
    """Çekirdeğin renderer'a verdiği notlar (y_notlar), sayfa ve sıra anahtarıyla."""
    pdefe_core.onbellek.hepsini_birak()
    m = {}
    for n in pdefe_core.y_notlar({"yol": yol})["notlar"]:
        m.setdefault(n["sayfa"], []).append(n)
    pdefe_core.onbellek.hepsini_birak()
    return m


def guncelle_op(n, dx, dy, kaynak=None):
    """Renderer'ın taşıma kaydı gibi (notlar.js disaAktar): bütün alanlar, rect kaydırılmış."""
    r = n["rect"]
    d = {k: n.get(k) for k in ("xref", "tur", "sayfa", "icerik", "yazar", "renk", "opaklik", "konu", "olusturma")}
    d["rect"] = [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]
    op = {"islem": "guncelle", "id": "n%d" % n["xref"], "xref": n["xref"], "not": d}
    if kaynak:
        op["kaynak"] = kaynak
    return op


def durum(yol):
    """Sayfa → [(tür, rect, düz köşe noktaları)] ve çizimin kırmızı görünümü yerinde mi."""
    doc = pymupdf.open(yol)
    s = {}
    for p in doc:
        liste = []
        for a in p.annots():
            v = a.vertices or []
            if v and isinstance(v[0], list):
                v = [pt for alt in v for pt in alt]
            liste.append((a.type[1], tuple(round(c, 2) for c in a.rect), [tuple(round(c, 2) for c in pt) for pt in v]))
        s[p.number + 1] = liste
    doc.close()
    return s


def renk(yol, sayfa, nokta):
    """Sayfanın (döndürülmemiş koordinattaki) noktasının çizilmiş görüntüdeki rengi (r, g, b)."""
    doc = pymupdf.open(yol)
    p = doc[sayfa - 1]
    pix = p.get_pixmap(annots=True)
    pt = pymupdf.Point(nokta) * p.rotation_matrix
    r = pix.pixel(int(pt.x * pix.width / p.rect.width), int(pt.y * pix.height / p.rect.height))
    doc.close()
    return r


def kirmizi(r):
    return r[0] > 200 and r[1] < 80 and r[2] < 80


def beyaz(r):
    return min(r) > 240


def tasima_denetle(baslik, once, sonra, dx, dy, tasinanlar):
    for sayfa, liste in once.items():
        for i, (tur, rect, noktalar) in enumerate(liste):
            yeni = sonra[sayfa][i]
            beklenen = (rect[0] + dx, rect[1] + dy, rect[2] + dx, rect[3] + dy) if (sayfa, i) in tasinanlar else rect
            rect_ok = all(abs(a - b) < 0.02 for a, b in zip(yeni[1], beklenen))
            nokta_ok = len(yeni[2]) == len(noktalar) and all(abs(y[0] - n[0] - (dx if (sayfa, i) in tasinanlar else 0)) < 0.02
                                                             and abs(y[1] - n[1] - (dy if (sayfa, i) in tasinanlar else 0)) < 0.02
                                                             for y, n in zip(yeni[2], noktalar))
            if tur in KOSELI:
                sonuc("%s: %d. sayfa %s %s" % (baslik, sayfa, tur, "taşındı (rect ve köşe noktaları)" if (sayfa, i) in tasinanlar else "yerinde"),
                      rect_ok and nokta_ok, (yeni, beklenen, noktalar))


# ---------------------------------------------------------------- artımlı kayıt
print("— Artımlı kayıt")
yol = os.path.join(CIKTI, "kose.pdf")
belge_kur(yol)
m = model(yol)
once = durum(yol)
DX, DY = 180, 140
islemler, tasinanlar = [], set()
for sayfa, liste in m.items():
    for i, n in enumerate(liste):
        if n["tur"] in KOSELI:
            islemler.append(guncelle_op(n, DX, DY))
            tasinanlar.add((sayfa, i))
        elif n["tur"] == "Underline":
            op = guncelle_op(n, 0, 0)
            op["not"]["icerik"] = "altı çizili değişti"
            islemler.append(op)
r = notlar.y_notlar_kaydet({"yol": yol, "hedef": yol, "islemler": islemler, "artimli": True})
sonuc("kayıt artımlı yapıldı", r.get("artimli") is True, r)
sonra = durum(yol)
tasima_denetle("artımlı", once, sonra, DX, DY, tasinanlar)
# Çizimin son köşe noktası yeni yerinde çizili, eski yeri boş (görünüm, aynı sayfada başka not güncellendiği için MuPDF'çe yeniden
# üretilmiş olabilir: kaydırılmış köşe noktalarından)
for sayfa in once:
    x, y = once[sayfa][0][2][2]
    yeni_r, eski_r = renk(yol, sayfa, (x + DX, y + DY)), renk(yol, sayfa, (x, y))
    sonuc("artımlı: %d. sayfa çizim yeni yerinde görünür, eski yeri boş" % sayfa, not beyaz(yeni_r) and beyaz(eski_r), (yeni_r, eski_r))
doc = pymupdf.open(yol)
alti = [a.info.get("content") for a in doc[0].annots() if a.type[1] == "Underline"]
doc.close()
sonuc("artımlı: altı çizili (rect değişmeden güncellenen, MuPDF rect yazdırmaz) hatasız kaydedildi", alti == ["altı çizili değişti"], alti)

# ---------------------------------------------------------------- baştan (temiz) kayıt, ikinci taşıma
print("— Baştan (temiz) kayıt")
m = model(yol)
once = sonra
islemler = [guncelle_op(n, -40, 25) for liste in m.values() for n in liste if n["tur"] in KOSELI]
r = notlar.y_notlar_kaydet({"yol": yol, "hedef": yol, "islemler": islemler, "temiz": True})
sonuc("kayıt baştan yapıldı", r.get("artimli") is False, r)
tasima_denetle("temiz", once, durum(yol), -40, 25, tasinanlar)

# ---------------------------------------------------------------- başka programın görünümü korunur
print("— Özel görünüm")
yol4 = os.path.join(CIKTI, "kose-gorunum.pdf")
belge_kur(yol4)
m = model(yol4)
once = durum(yol4)
for sayfa in (1, 2):
    # Kayıtta tek işlem: aynı kayıtta başka sayfaya geçilince MuPDF, nitelikleri yeniden yazılan (renk, saydamlık) notun görünümünü
    # yeniden üretebilir (0.2.1 öncesinden; yer yine doğru, köşe noktalarından)
    notlar.y_notlar_kaydet({"yol": yol4, "hedef": yol4, "islemler": [guncelle_op(m[sayfa][0], DX, DY)], "artimli": True})
    r = once[sayfa][0][1]
    orta = ((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)
    yeni_r, eski_r = renk(yol4, sayfa, (orta[0] + DX, orta[1] + DY)), renk(yol4, sayfa, orta)
    sonuc("yalnızca çizim taşınınca %d. sayfada başka programın görünümü (kırmızı dolgu) korunur, yeni yerinde; eski yeri boş" % sayfa,
          kirmizi(yeni_r) and beyaz(eski_r), (yeni_r, eski_r))

# ---------------------------------------------------------------- yapısal kayıt (sayfa düzeni değişmiş: 1. ve 2. sayfa yer değiştirdi)
print("— Yapısal kayıt")
yol2 = os.path.join(CIKTI, "kose-yapisal.pdf")
belge_kur(yol2)
m = model(yol2)
once = durum(yol2)
islemler = [guncelle_op(n, 30, -20, {"yol": yol2, "sayfa": 1}) for n in m[1] if n["tur"] in KOSELI]
tarif = [{"kaynak": {"yol": yol2, "sayfa": 2}}, {"kaynak": {"yol": yol2, "sayfa": 1}}, {"kaynak": {"yol": yol2, "sayfa": 3}}, {"kaynak": {"yol": yol2, "sayfa": 4}}]
yapisal.y_yapisal_kaydet({"yol": yol2, "hedef": yol2, "tarif": tarif, "islemler": islemler, "anlikKlasor": os.path.join(CIKTI, "anlik")})
pdefe_core.onbellek.hepsini_birak()
sonra = durum(yol2)
# Yeni belgede eski 1. sayfa 2. sırada; dolaylı /InkList'li çizim (insert_pdf kopyalar) de taşınır
eslenik = {2: once[1]}
tasima_denetle("yapısal", eslenik, {2: sonra[2]}, 30, -20, {(2, i) for i, x in enumerate(once[1]) if x[0] in KOSELI})

# ---------------------------------------------------------------- taşınamayan not: hata, dosya değişmez
print("— Taşınamayan not")
yol3 = os.path.join(CIKTI, "kose-hata.pdf")
belge_kur(yol3)
m = model(yol3)
alti = next(n for n in m[1] if n["tur"] == "Underline")
boyut, zaman = os.path.getsize(yol3), os.path.getmtime(yol3)
try:
    notlar.y_notlar_kaydet({"yol": yol3, "hedef": yol3, "islemler": [guncelle_op(alti, 50, 50)], "artimli": True})
    ileti = None
except ValueError as e:
    ileti = str(e)
pdefe_core.onbellek.hepsini_birak()
sonuc("MuPDF'in yazmadığı taşıma (altı çizili) kayıtta hata verir, dosya değişmez",
      ileti is not None and "taşınamadı" in ileti and os.path.getsize(yol3) == boyut and os.path.getmtime(yol3) == zaman, ileti)

print("\n%d denetim, %d hata" % (toplam, hata))
sys.exit(1 if hata else 0)
