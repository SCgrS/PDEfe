# -*- coding: utf-8 -*-
# Form alanlı PDF'in ölçümü (0.3.1; test/senaryo47.mjs ve test/yazdir_gercek.mjs okur): alan değerleri (çekirdeğin okuduğu gibi: seçenek
# düğmesinde grubun /V'si, liste kutusunda liste), widget'ların görünümü sayfaya işlenince (bake, MuPDF) okunan yazı, XFA paketi var mı.
# --murekkep <sayfa> <x0,y0,x1,y1>: sayfanın 144 dpi çiziminde kutudaki (pt, PyMuPDF koordinatı) koyu piksel sayısı.
# Kullanım: .venv\Scripts\python.exe -X utf8 test\form_olc.py <pdf> [--murekkep <sayfa> <kutu>]
import json
import os
import sys

import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core"))
from islemler import formlar  # noqa: E402

yol = sys.argv[1]
d = pymupdf.open(yol)
if len(sys.argv) > 2 and sys.argv[2] == "--murekkep":
    sayfa = int(sys.argv[3])
    x0, y0, x1, y1 = (float(v) for v in sys.argv[4].split(","))
    pix = d[sayfa - 1].get_pixmap(dpi=144, clip=pymupdf.Rect(x0, y0, x1, y1))
    s, n = pix.samples, pix.n
    koyu = sum(1 for i in range(0, len(s), n) if s[i] + s[i + 1] + s[i + 2] < 3 * 160)
    print(json.dumps({"murekkep": koyu}))
    sys.exit(0)
alanlar = {}
for p in d:
    for a in formlar.sayfa_alanlari(d, p):
        alanlar.setdefault(a["ad"], a["deger"])
xfa = d.xref_get_key(d.pdf_catalog(), "AcroForm/XFA")[0] != "null"
sayfa = d.page_count
d.bake(annots=False, widgets=True)
metin = "\n".join(p.get_text() for p in d)
print(json.dumps({"alanlar": alanlar, "xfa": xfa, "sayfa": sayfa, "metin": metin}, ensure_ascii=False))
