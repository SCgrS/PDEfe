# -*- coding: utf-8 -*-
"""Form alanlı (Widget) ve bağlantılı bir test PDF'i üretir: test/cikti/form-test.pdf"""
import os, sys
import pymupdf
sys.stdout.reconfigure(encoding="utf-8")
out = os.path.join(os.path.dirname(__file__), "cikti", "form-test.pdf")
doc = pymupdf.open()
p1 = doc.new_page()
p1.insert_text((72, 72), "Form ve bağlantı testi — Türkçe: şğıİçöü", fontsize=16, fontname="helv")
# Metin alanı
w = pymupdf.Widget()
w.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
w.field_name = "adsoyad"
w.field_value = "Deneme Adı Soyadı"
w.rect = pymupdf.Rect(72, 110, 320, 136)
w.text_fontsize = 12
w.fill_color = (0.95, 0.97, 1)
w.border_color = (0.2, 0.4, 0.8)
p1.add_widget(w)
# Onay kutusu
c = pymupdf.Widget()
c.field_type = pymupdf.PDF_WIDGET_TYPE_CHECKBOX
c.field_name = "onay"
c.field_value = True
c.rect = pymupdf.Rect(72, 150, 90, 168)
c.border_color = (0, 0, 0)
p1.add_widget(c)
p1.insert_text((98, 164), "Onaylıyorum", fontsize=12, fontname="helv")
# İkinci sayfa ve bağlantılar
p2 = doc.new_page()
p1 = doc[0]
p2.insert_text((72, 72), "İkinci sayfa (bağlantı hedefi)", fontsize=16, fontname="helv")
p1.insert_text((72, 220), "2. sayfaya git", fontsize=12, fontname="helv", color=(0, 0, 1))
p1.insert_link({"kind": pymupdf.LINK_GOTO, "from": pymupdf.Rect(70, 206, 170, 224), "page": 1, "to": pymupdf.Point(0, 0)})
p1.insert_text((72, 250), "https://example.org", fontsize=12, fontname="helv", color=(0, 0, 1))
p1.insert_link({"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(70, 236, 200, 254), "uri": "https://example.org"})
doc.save(out, garbage=3, deflate=True)
print("yazıldı:", out, "widgets:", sum(1 for _ in doc[0].widgets()), "links:", len(doc[0].get_links()))
