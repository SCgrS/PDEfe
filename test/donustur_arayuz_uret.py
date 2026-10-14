# -*- coding: utf-8 -*-
"""Dosya Formatını Değiştir aracının arayüz sınaması (test/senaryo37.mjs) için girdiler (0.2.6). Hepsi burada üretilir, gerçek belge
kullanılmaz: core testlerinin üreticileri (test/donustur_testi.py, test/udf_donusum_testi.py) kullanılır.

Kullanım:  .venv\\Scripts\\python.exe test\\donustur_arayuz_uret.py <klasör>     → son satırda üretilen dosyaların JSON listesi
"""
import json
import os
import sys
import zipfile

BURA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BURA)

import donustur_testi as dt  # noqa: E402
import udf_donusum_testi as ut  # noqa: E402


def docx_yaz(yol, paragraflar):
    """En küçük geçerli .docx (Word açar; çekirdek word/document.xml'den Word sayar)."""
    govde = "".join('<w:p><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>' % p for p in paragraflar)
    belge = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>%s'
             '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>'
             '</w:body></w:document>' % govde)
    turler = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
              '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
              '<Default Extension="xml" ContentType="application/xml"/>'
              '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
              '</Types>')
    iliski = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
              '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
              '</Relationships>')
    with zipfile.ZipFile(yol, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", turler)
        z.writestr("_rels/.rels", iliski)
        z.writestr("word/document.xml", belge)
    return yol


def main():
    k = os.path.abspath(sys.argv[1])
    os.makedirs(k, exist_ok=True)
    g = {}
    g["pdf"] = dt.sentetik_pdf(os.path.join(k, "Dilekçe örneği.pdf"), sayfa=2)
    kareler = [(dt.metin_karesi(1654, 2339, t), {"compression": "group4"}) for t in (1, 2, 3)]
    g["tiff"] = dt.tiff_yaz(os.path.join(k, "Tarama örneği.tif"), kareler)
    u = ut.UdfYaz()
    u.paragraf("DENEME DİLEKÇESİ", hiza=1, kalin=True)
    for i in range(8):
        u.paragraf(ut.cumleler(i, 4), oz='FirstLineIndent="35.4"')
    g["udf"] = u.yaz(os.path.join(k, "Karar örneği.udf"))
    u = ut.UdfYaz()
    for i in range(3):
        u.paragraf(ut.METIN, aile="Arial", boy=11)
    g["udf_xml"] = u.yaz(os.path.join(k, "Düz biçim.udf"), duz_xml=True)
    g["docx"] = docx_yaz(os.path.join(k, "Word örneği.docx"), ["Deneme paragrafı; ğüşıöç İ.", "İkinci paragraf."])
    with open(os.path.join(k, "notlar.txt"), "w", encoding="utf-8") as f:
        f.write("PDF, UDF, TIFF ya da Word değil.\n")
    g["txt"] = os.path.join(k, "notlar.txt")
    # İçeriği PDF, uzantısı .udf (tür uzantıdan değil içerikten)
    with open(g["pdf"], "rb") as f:
        veri = f.read()
    g["pdf_udf"] = os.path.join(k, "Yanlış uzantı.udf")
    with open(g["pdf_udf"], "wb") as f:
        f.write(veri)
    # İptal sınaması için uzun TIFF (150 sayfa, 200 dpi G4; dönüştürmesi birkaç saniye): beş farklı kare sırayla
    buyuk = os.path.join(k, "Uzun tarama.tif")
    if not os.path.isfile(buyuk):
        kareler = [dt.metin_karesi(1654, 2339, 100 + t) for t in range(5)]
        dt.tiff_yaz(buyuk, [(kareler[i % 5], {"compression": "group4"}) for i in range(150)])
    g["buyuk_tiff"] = buyuk
    print(json.dumps(g, ensure_ascii=False))


if __name__ == "__main__":
    main()
