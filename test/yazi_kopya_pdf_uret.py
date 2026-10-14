"""Yazı kutusu kopyala-yapıştır sınaması (test/senaryo36.mjs, 0.2.6) için örnek PDF üretir ve kaydedilen yazıları ölçer (gerçek belge
kullanılmaz; metinler yer tutucudur).

Kullanım:
  .venv\\Scripts\\python.exe test/yazi_kopya_pdf_uret.py uret <çıktı.pdf>
      Altı sayfa: A4 dik, A4 yatay, /Rotate 90 (A4), /Rotate 270 ve kaydırılmış MediaBox [50 50 645 892] (A4), A5, A3. Her sayfada başlık ve
      satırlar (Windows'un Arial'iyle; Türkçe harfler metin katmanında doğru çıksın). 1. sayfada başka bir programda yazılmış gibi bir yazı
      kutusu (PyMuPDF add_freetext_annot: /DA, dolgu, /PDEfe kaydı yok).
  .venv\\Scripts\\python.exe test/yazi_kopya_pdf_uret.py olc <dosya.pdf>
      Dosyadaki yazı kutuları (JSON listesi): sayfa (1 tabanlı), sayfanın /Rotate'i, kutu (döndürülmemiş sayfada, üst-sol kökenli pt) ve
      sayfanın ekrandaki yönündeki kutusu (kutu × rotation_matrix), metin yönü (görünüm akışının /Matrix dönüşü; çekirdekteki freetext_donus
      ile aynı kural, ondan bağımsız hesaplanır), metin, PDEfe kaydındaki yazı tipi / boyut / renk / dolgu.
"""
import json
import math
import os
import sys

import pymupdf

ARIAL = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arial.ttf")
SAYFALAR = [
    ("A4 dik", 595, 842, 0, None),
    ("A4 yatay", 842, 595, 0, None),
    ("A4, /Rotate 90", 595, 842, 90, None),
    ("A4, /Rotate 270, MediaBox [50 50 645 892]", 595, 842, 270, (50, 50, 645, 892)),
    ("A5", 420, 595, 0, None),
    ("A3", 842, 1191, 0, None),
]


def uret(yol):
    doc = pymupdf.open()
    yazi = {"fontname": "arial", "fontfile": ARIAL} if os.path.exists(ARIAL) else {"fontname": "helv"}
    for i, (ad, w, h, aci, mb) in enumerate(SAYFALAR):
        pg = doc.new_page(width=w, height=h)
        if mb:
            pg.set_mediabox(pymupdf.Rect(*mb))
        pg.insert_text((60, 70), f"Sayfa {i + 1}: {ad}", fontsize=16, **yazi)
        y = 110
        while y < pg.rect.height - 60 and y < 110 + 24 * 8:
            pg.insert_text((60, y), f"Satır {(y - 110) // 24 + 1}: yazı kutusu yapıştırma örneği; şçğıöü ŞÇĞİÖÜ.", fontsize=11, **yazi)
            y += 24
        if aci:
            pg.set_rotation(aci)
    # Başka programın yazısı: 1. sayfanın sağ üstünde (PDEfe'nin kaydı yok; biçimi /DA ve dolgudan okunur)
    a = doc[0].add_freetext_annot(pymupdf.Rect(330, 320, 540, 360), "Dosyadaki yazi kutusu", fontsize=14, fontname="helv",
                                  text_color=(0, 0, 0.8), fill_color=(1, 1, 0.75))
    a.set_info(title="Baska Program")
    a.update()
    try:
        doc.subset_fonts()
    except Exception:
        pass
    os.makedirs(os.path.dirname(os.path.abspath(yol)), exist_ok=True)
    doc.save(yol, garbage=3, deflate=True)
    doc.close()


def _donus(doc, xref):
    """Metin yönü: görünüm akışının /Matrix dönüşü (saat yönünün tersine, 0/90/180/270); /Matrix yoksa 0."""
    t, v = doc.xref_get_key(xref, "AP/N/Matrix")
    if t != "array":
        return 0
    a, b = (float(x) for x in v.strip("[] ").split()[:2])
    return int(round(math.degrees(math.atan2(b, a)) / 90.0)) * 90 % 360


def _pdefe(doc, xref, anahtar):
    t, v = doc.xref_get_key(xref, "PDEfe/" + anahtar)
    if t in ("int", "float"):
        return float(v)
    return v if t == "string" else None


def olc(yol):
    doc = pymupdf.open(yol)
    liste = []
    for i, pg in enumerate(doc):
        for a in pg.annots():
            if a.type[1] != "FreeText":
                continue
            r, e = a.rect, a.rect * pg.rotation_matrix
            liste.append({
                "sayfa": i + 1, "aci": pg.rotation, "kutu": [round(r.x0, 2), round(r.y0, 2), round(r.x1, 2), round(r.y1, 2)],
                "ekran": [round(e.x0, 2), round(e.y0, 2), round(e.x1, 2), round(e.y1, 2)], "donus": _donus(doc, a.xref),
                "metin": a.info.get("content") or "", "pdefe": doc.xref_get_key(a.xref, "PDEfe")[0] == "dict",
                "tip": _pdefe(doc, a.xref, "Tip"), "boyut": _pdefe(doc, a.xref, "Boyut"), "renk": _pdefe(doc, a.xref, "Renk"),
                "arka": _pdefe(doc, a.xref, "Arka"), "yazar": a.info.get("title") or "",
            })
    doc.close()
    return liste


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "uret":
        uret(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "olc":
        print(json.dumps(olc(sys.argv[2]), ensure_ascii=False))
    else:
        print(__doc__)
        sys.exit(2)
