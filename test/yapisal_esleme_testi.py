# -*- coding: utf-8 -*-
"""Yapısal kayıtta (yapisal_kaydet: sayfa düzeni değişmiş belge) not işlemlerinin doğru nota uygulanması (0.2.1).
Önceden hedef not, kaynak sayfadaki sırasıyla yeni belgedeki notların O ANKİ listesinde aranıyordu: aynı sayfada önce bir not
silinince sonraki silme / güncelleme bir sağdaki nota uygulanıyordu; yanıt (IRT) notu olan sayfada da (insert_pdf yanıtları
kopyalamaz) sıra bir kayıyordu. Belgeler test/cikti/yapisal_esleme altında (ya da ilk bağımsız değişkendeki klasörde) üretilir.
Kullanım: .venv\\Scripts\\python.exe test\\yapisal_esleme_testi.py [çıktı klasörü]"""
import os
import shutil
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
import pdefe_core  # noqa: E402,F401  (önbellek kurulur)
from islemler import yapisal  # noqa: E402

CIKTI = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(KOK, "test", "cikti", "yapisal_esleme")
shutil.rmtree(CIKTI, ignore_errors=True)
os.makedirs(CIKTI, exist_ok=True)
hata = toplam = 0


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if ok or not ayrinti else " — " + str(ayrinti)))


def vurgu(sayfa, y, icerik):
    a = sayfa.add_highlight_annot(pymupdf.Rect(72, y, 300, y + 14))
    a.set_info(content=icerik)
    a.set_colors(stroke=(1, 1, 0))
    a.update()
    return a.xref


def belge_kur(ad, yanitli=False):
    """İki sayfalık belge; 1. sayfada notlar. yanitli: [Text 'Ust not A', Text 'Yanit B' (A'ya yanıt), Vurgu C, Vurgu D];
    değilse [Vurgu A, Vurgu C, Vurgu D, Vurgu E]. Döner: (yol, {içerik: xref})."""
    yol = os.path.join(CIKTI, ad)
    doc = pymupdf.open()
    doc.new_page(width=595, height=842)
    doc.new_page(width=595, height=842)
    s1 = doc[0]
    for i in range(6):
        s1.insert_text((72, 100 + 40 * i), "Satir %d deneme metni" % (i + 1), fontsize=12)
    xrefler = {}
    if yanitli:
        a = s1.add_text_annot((400, 100), "Ust not A")
        a.update()
        xrefler["Ust not A"] = a.xref
        b = s1.add_text_annot((400, 100), "Yanit B")
        b.set_irt_xref(a.xref)
        b.update()
        xrefler["Yanit B"] = b.xref
        xrefler["Vurgu C"] = vurgu(s1, 128, "Vurgu C")
        xrefler["Vurgu D"] = vurgu(s1, 168, "Vurgu D")
    else:
        for i, ad_ in enumerate(("Vurgu A", "Vurgu C", "Vurgu D", "Vurgu E")):
            xrefler[ad_] = vurgu(s1, 88 + 40 * i, ad_)
    doc.save(yol)
    doc.close()
    return yol, xrefler


def kaydet(yol, islemler):
    """Renderer'ın yapısal kaydı gibi: 2. sayfa silinmiş (tarif yalnızca 1. sayfa), işlemler kaynak sayfa + kaynak xref ile.
    Döner: (1. sayfadaki notlar [(içerik, renk)], sonuç)."""
    r = yapisal.y_yapisal_kaydet({"yol": yol, "hedef": yol, "tarif": [{"kaynak": {"yol": yol, "sayfa": 1}}], "islemler": islemler,
                                  "anlikKlasor": os.path.join(CIKTI, "anlik")})
    pdefe_core.onbellek.hepsini_birak()
    doc = pymupdf.open(yol)
    notlar = [(a.info.get("content"), tuple(round(c, 2) for c in (a.colors.get("stroke") or ())), a.irt_xref) for a in doc[0].annots()]
    doc.close()
    return notlar, r


def sil(yol, xref):
    return {"islem": "sil", "id": "s%d" % xref, "xref": xref, "kaynak": {"yol": yol, "sayfa": 1}, "not": {"xref": xref, "sayfa": 1}}


def guncelle(yol, xref, icerik, renk):
    return {"islem": "guncelle", "id": "g%d" % xref, "xref": xref, "kaynak": {"yol": yol, "sayfa": 1},
            "not": {"xref": xref, "tur": "Highlight", "sayfa": 1, "icerik": icerik, "renk": renk, "rectDegismedi": True}}


def icerikler(notlar):
    return [n[0] for n in notlar]


SARI, KIRMIZI = (1.0, 1.0, 0.0), (1.0, 0.0, 0.0)

print("— Aynı sayfada iki işlem")
yol, x = belge_kur("iki-silme.pdf")
n, _ = kaydet(yol, [sil(yol, x["Vurgu A"]), sil(yol, x["Vurgu D"])])
sonuc("A ve D silinir, C ve E kalır", icerikler(n) == ["Vurgu C", "Vurgu E"], n)

yol, x = belge_kur("silme-guncelleme.pdf")
n, _ = kaydet(yol, [sil(yol, x["Vurgu A"]), guncelle(yol, x["Vurgu D"], "D DEGISTI", "#ff0000")])
sonuc("A silinir, D değişir, E olduğu gibi kalır", [(c, r) for c, r, _ in n] == [("Vurgu C", SARI), ("D DEGISTI", KIRMIZI), ("Vurgu E", SARI)], n)

yol, x = belge_kur("guncelleme-silme.pdf")
n, _ = kaydet(yol, [guncelle(yol, x["Vurgu C"], "C DEGISTI", "#ff0000"), sil(yol, x["Vurgu A"]), sil(yol, x["Vurgu E"])])
sonuc("C değişir, A ve E silinir", [(c, r) for c, r, _ in n] == [("C DEGISTI", KIRMIZI), ("Vurgu D", SARI)], n)

yol, x = belge_kur("ekleme-silme.pdf")
ekle = {"islem": "ekle", "id": "yeni", "not": {"tur": "Highlight", "sayfa": 1, "quads": [[72, 300, 300, 314]], "renk": "#00ff00",
                                              "opaklik": 0.4, "icerik": "Yeni vurgu"}}
n, _ = kaydet(yol, [ekle, sil(yol, x["Vurgu A"]), sil(yol, x["Vurgu D"])])
sonuc("önce yeni not eklense de A ve D silinir", sorted(icerikler(n)) == ["Vurgu C", "Vurgu E", "Yeni vurgu"], n)

yol, x = belge_kur("yanit-ust.pdf")
yanit = {"islem": "ekle", "id": "yanit", "not": {"tur": "Text", "sayfa": 1, "rect": [400, 200, 420, 220], "icerik": "D'ye yanit",
                                                "yanitXref": x["Vurgu D"], "yanitKaynak": {"yol": yol, "sayfa": 1}}}
n, _ = kaydet(yol, [sil(yol, x["Vurgu A"]), yanit])
doc = pymupdf.open(yol)
irt = {a.info.get("content"): a.irt_xref for a in doc[0].annots()}
xref_d = next((a.xref for a in doc[0].annots() if a.info.get("content") == "Vurgu D"), None)
doc.close()
sonuc("A silindikten sonra eklenen yanıt D'ye bağlanır", irt.get("D'ye yanit") == xref_d and xref_d, irt)

print("— Yanıt (IRT) notu olan sayfa (insert_pdf yanıtları kopyalamaz)")
yol, x = belge_kur("yanitli-silme.pdf", yanitli=True)
n, _ = kaydet(yol, [sil(yol, x["Vurgu C"])])
sonuc("C silinir, D kalır", icerikler(n) == ["Ust not A", "Vurgu D"], n)

yol, x = belge_kur("yanitli-guncelleme.pdf", yanitli=True)
n, _ = kaydet(yol, [guncelle(yol, x["Vurgu C"], "DEGISTI", "#ff0000")])
sonuc("C değişir, D olduğu gibi kalır", [(c, r) for c, r, _ in n] == [("Ust not A", n[0][1]), ("DEGISTI", KIRMIZI), ("Vurgu D", SARI)], n)

yol, x = belge_kur("yanitli-yanit-silme.pdf", yanitli=True)
n, _ = kaydet(yol, [sil(yol, x["Yanit B"])])
sonuc("yalnızca yanıt silinince başka not silinmez", icerikler(n) == ["Ust not A", "Vurgu C", "Vurgu D"], n)

print("\n%d denetim, %d hata" % (toplam, hata))
sys.exit(1 if hata else 0)
