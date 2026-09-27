# -*- coding: utf-8 -*-
"""Not yazma testi: vurgu, not (+yanıt), Türkçe serbest metin ekle; geri oku; PNG'ye çiz.
Kullanım: .venv\\Scripts\\python.exe test\\not_testi.py"""
import os, sys, shutil, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
sys.stdout.reconfigure(encoding="utf-8")
import pymupdf
import pdefe_core
from islemler import notlar

KAYNAK = r"C:\Users\Kullanici\Desktop\PDF DENEME\1.5.6098.pdf"
CIKTI = os.path.join(os.path.dirname(__file__), "cikti")
os.makedirs(CIKTI, exist_ok=True)
hedef = os.path.join(CIKTI, "not-testi.pdf")
shutil.copy(KAYNAK, hedef)

# Sayfa 1'deki "TÜRK BORÇLAR KANUNU" başlığının kutusunu bul (vurgu için)
doc = pymupdf.open(hedef)
pg = doc[0]
kutu = pg.search_for("TÜRK BORÇLAR KANUNU")[0]
kutu2 = pg.search_for("Kanun Numarası")[0]
doc.close()

islemler = [
    {"islem": "ekle", "id": "v1", "not": {"tur": "Highlight", "sayfa": 1, "quads": [[kutu.x0, kutu.y0, kutu.x1, kutu.y1]],
                                          "renk": "#ffeb3b", "opaklik": 0.4, "yazar": "Deneme Yazar", "icerik": "Vurgu notu: şğİıçöü"}},
    {"islem": "ekle", "id": "n1", "not": {"tur": "Text", "sayfa": 1, "rect": [kutu2.x1 + 20, kutu2.y0 - 4, 0, 0],
                                          "renk": "#ffd000", "yazar": "Deneme Yazar", "icerik": "Not içeriği — İĞŞÇÖÜ ığşçöü"}},
    {"islem": "ekle", "id": "y1", "not": {"tur": "Text", "sayfa": 1, "rect": [kutu2.x1 + 20, kutu2.y0 - 4, 0, 0], "yanitId": "n1",
                                          "yazar": "Deneme Yanıtçı", "icerik": "Bu bir yanıt: şışman İğne"}},
    {"islem": "ekle", "id": "f1", "not": {"tur": "FreeText", "sayfa": 1, "rect": [70, 700, 330, 760],
                                          "yazar": "Deneme Yazar", "icerik": "Serbest metin: Şişli'de İğneada'ya çığ düştü. ÇĞİÖŞÜ çğıöşü\nİkinci satır, uzun bir cümleyle satır kırmayı dener.",
                                          "yazi": {"tip": "Segoe UI", "boyut": 11, "renk": "#1a237e", "arka": "#fff9c4", "kalin": False, "altiCizili": False, "kenarlik": True}}},
    {"islem": "ekle", "id": "f2", "not": {"tur": "FreeText", "sayfa": 1, "rect": [340, 700, 525, 745],
                                          "yazar": "Deneme Yazar", "icerik": "Kalın Times: Türkçe İĞŞ ığş",
                                          "yazi": {"tip": "Times New Roman", "boyut": 13, "renk": "#b71c1c", "arka": None, "kalin": True, "altiCizili": True, "kenarlik": False}}},
]
r = notlar.y_notlar_kaydet({"yol": hedef, "hedef": hedef, "islemler": islemler, "artimli": True})
print("kaydedildi:", r)

# Güncelleme: vurgunun rengini değiştir, serbest metni taşı ve metni değiştir; sonra tekrar artımlı kaydet
xr = r["xrefler"]
r2 = notlar.y_notlar_kaydet({"yol": hedef, "hedef": hedef, "artimli": True, "islemler": [
    {"islem": "guncelle", "id": "v1", "not": {"xref": xr["v1"], "sayfa": 1, "renk": "#4caf50", "opaklik": 0.5, "icerik": "Renk yeşile döndü"}},
    {"islem": "guncelle", "id": "f1", "not": {"xref": xr["f1"], "sayfa": 1, "rect": [70, 640, 330, 690], "icerik": "Güncellenmiş metin: ğüşiöç ĞÜŞİÖÇ"}},
]})
print("güncellendi:", r2)

# Geri oku
doc = pymupdf.open(hedef)
pg = doc[0]
print("--- notlar ---")
for a in pg.annots():
    print(a.type[1], a.xref, a.info.get("title"), "|", a.info.get("content"), "| irt:", a.irt_xref, "| ap:", a.has_ap if hasattr(a, 'has_ap') else '?', "| renk:", a.colors, "| op:", a.opacity)
    if a.type[1] == "FreeText":
        print("   DA:", doc.xref_get_key(a.xref, "DA"), "DS:", doc.xref_get_key(a.xref, "DS"))
        print("   PDEfe:", notlar.pdefe_stil_oku(doc, a.xref))
        print("   AP metni:", repr(pg.get_textbox(a.rect)[:80]))
# Dosya boyutu artışı
print("boyut:", os.path.getsize(KAYNAK), "->", os.path.getsize(hedef), "fark KB:", (os.path.getsize(hedef) - os.path.getsize(KAYNAK)) // 1024)
# Çiz
pix = pg.get_pixmap(dpi=110, clip=pymupdf.Rect(40, 30, 560, 200), annots=True)
pix.save(os.path.join(CIKTI, "not-testi-ust.png"))
pix = pg.get_pixmap(dpi=110, clip=pymupdf.Rect(40, 620, 560, 780), annots=True)
pix.save(os.path.join(CIKTI, "not-testi-alt.png"))
print("png yazıldı")
# Metin çıkarma ToUnicode kontrolü: AP'deki metin PyMuPDF ile okunuyor mu?
for a in pg.annots():
    if a.type[1] == "FreeText":
        xref_ap = doc.xref_get_key(a.xref, "AP/N")
        print("AP N:", xref_ap)
doc.close()
