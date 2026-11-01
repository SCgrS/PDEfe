# -*- coding: utf-8 -*-
# Linux ve macOS paket sınamasının (test/duman_ortak.mjs) kurgusal örnekleri (0.3.1). Gerçek belge yok: İç bağlantılar, form alanları, XFA formları, A5 sayfalı belge.
# not.pdf, taranmis.pdf ve arama.pdf iş akışının önceki adımından (ornek_pdf_uret, tanima_pdf_uret).
# Kullanım: python test/duman_ornekleri_uret.py <klasör>     Çıktı: Klasöre PDF'ler ve ozet.json (bağlantıların kutuları ve beklenen hedefleri).
import json
import os
import sys

import pymupdf

import form_alanlari_pdf_uret
import ic_baglanti_pdf_uret
import xfa_pdf_uret

klasor = sys.argv[1]
os.makedirs(klasor, exist_ok=True)
ozet = {
    "baglanti": ic_baglanti_pdf_uret.uret(os.path.join(klasor, "ic_baglantilar.pdf")),
    "form": form_alanlari_pdf_uret.alanlar_pdf(os.path.join(klasor, "alanlar.pdf")),
    "xfa": xfa_pdf_uret.uret(klasor),
}
# İlk yazdırmada kâğıt A4: A5 sayfalı belge "Belgeye göre" basılsaydı kâğıt A5 olurdu
d = pymupdf.open()
s = d.new_page(width=420, height=595)
s.insert_text((60, 100), "A5 sayfa", fontsize=20)
d.save(os.path.join(klasor, "a5.pdf"))
d.close()
with open(os.path.join(klasor, "ozet.json"), "w", encoding="utf-8") as f:
    json.dump(ozet, f, ensure_ascii=False)
print("Üretildi:", klasor)
