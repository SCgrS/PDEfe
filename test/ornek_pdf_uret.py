"""Testler için örnek PDF üretir ve PDF'in özetini verir (gerçek belge kullanılmaz; adlar ve metinler yer tutucudur).

Kullanım:
  .venv\\Scripts\\python.exe test/ornek_pdf_uret.py <çıktı.pdf> [sayfa sayısı=3] [başlık] [--notlu]
      Her sayfada bir başlık ve numaralı paragraf satırları (metin seçimi, vurgu ve arama sınamaları için); yazı Windows'un Arial yazı
      tipiyle gömülür (Türkçe harfler metin katmanında doğru çıksın). --notlu: 1. sayfaya bir vurgu ve bir not eklenir (dosyada hazır
      gelen, başka bir programda eklenmiş notların yerine).
  .venv\\Scripts\\python.exe test/ornek_pdf_uret.py --ozet <dosya.pdf>
      Dosyanın özeti (JSON): sayfa sayısı, sayfaların /Rotate açıları ve ilk satırları, notlar (sayfa, tür, metin, kutu).
"""
import json
import os
import sys

import pymupdf

ARIAL = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arial.ttf")


def uret(yol, sayfa=3, baslik="Örnek belge", notlu=False):
    doc = pymupdf.open()
    yazi = {"fontname": "arial", "fontfile": ARIAL} if os.path.exists(ARIAL) else {"fontname": "helv"}
    for i in range(sayfa):
        pg = doc.new_page(width=595, height=842)
        pg.insert_text((72, 90), f"{baslik} — sayfa {i + 1}", fontsize=18, **yazi)
        y = 140
        for s in range(14):
            pg.insert_text((72, y), f"Satır {s + 1}: örnek metin, sayfa {i + 1}; şçğıöü ŞÇĞİÖÜ deneme paragrafı.", fontsize=11, **yazi)
            y += 24
    if notlu:
        pg = doc[0]
        vurgu = pg.add_highlight_annot(pymupdf.Rect(72, 129, 300, 143))
        vurgu.set_info(title="Deneme Yazar", content="")
        vurgu.update()
        nt = pg.add_text_annot((400, 200), "dosyadaki not")
        nt.set_info(title="Deneme Yazar")
        nt.update()
    try:
        doc.subset_fonts()   # gömülü yazı tipinin yalnızca kullanılan harfleri (dosya ~1 MB yerine ~30 KB)
    except Exception:
        pass
    os.makedirs(os.path.dirname(os.path.abspath(yol)), exist_ok=True)
    doc.save(yol, garbage=3, deflate=True)
    doc.close()


def ozet(yol):
    doc = pymupdf.open(yol)
    r = {"sayfa": doc.page_count, "dondurme": [], "ilkSatir": [], "notlar": []}
    for i, pg in enumerate(doc):
        r["dondurme"].append(pg.rotation)
        satirlar = [" ".join(s.split()) for s in pg.get_text().splitlines() if s.strip()]   # bölünemez boşluklar da tek boşluk olur
        r["ilkSatir"].append(satirlar[0] if satirlar else "")
        for a in pg.annots():
            if a.type[1] == "Popup":
                continue
            k = a.rect
            r["notlar"].append({"sayfa": i + 1, "tur": a.type[1], "icerik": a.info.get("content") or "", "kutu": [round(k.x0), round(k.y0), round(k.x1), round(k.y1)]})
    doc.close()
    return r


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    if "--ozet" in sys.argv and a:
        sys.stdout.buffer.write(json.dumps(ozet(a[0]), ensure_ascii=False).encode("utf-8"))
    elif a:
        uret(a[0], int(a[1]) if len(a) > 1 else 3, a[2] if len(a) > 2 else "Örnek belge", "--notlu" in sys.argv)
        print("yazıldı:", a[0])
    else:
        print(__doc__)
        sys.exit(2)
