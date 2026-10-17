# -*- coding: utf-8 -*-
"""Açılış hızı ölçümünün (test/acilis_hizi.mjs, 0.2.10) örnek PDF'lerini üretir (gerçek belge yok; metinler yer tutucudur).

Kullanım:
  .venv\\Scripts\\python.exe test/acilis_ornek_uret.py [çıktı klasörü = test/cikti/acilis/pdf]
Üretilenler (her biri iki kopya: <ad>.pdf soğuk açılışta, <ad>-2.pdf açık PDEfe'ye ikinci örnekle gönderilir; aynı dosya ikinci kez açılsa
yalnızca sekmesine geçilirdi):
  kucuk     : 2 sayfa A4, gömülü yazı tipli metin (üst yazı, dilekçe benzeri)
  taranmis  : 3 sayfa, sayfa başına 200 dpi gri JPEG (1654x2339, gürültülü, yazılı): taranmış evrak benzeri
  buyuk     : test/pdf/mevzuat_6102_TTK.pdf'in kopyası (410 sayfa, yalnızca metin); dosya yoksa 410 sayfalık yer tutucu metin
"""
import io
import os
import random
import shutil
import sys

import pymupdf
from PIL import Image, ImageDraw, ImageFont

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARIAL = ("/System/Library/Fonts/Supplemental/Arial.ttf" if sys.platform == "darwin"
         else os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arial.ttf"))
cikti = sys.argv[1] if len(sys.argv) > 1 else os.path.join(KOK, "test", "cikti", "acilis", "pdf")
os.makedirs(cikti, exist_ok=True)
random.seed(11)
yazi = {"fontname": "arial", "fontfile": ARIAL}


def kaydet(doc, ad):
    yol = os.path.join(cikti, ad + ".pdf")
    try:
        doc.subset_fonts()   # gerçek belgelerdeki gibi yazı tipinin yalnızca kullanılan harfleri
    except Exception:
        pass
    doc.save(yol, garbage=3, deflate=True)
    doc.close()
    shutil.copyfile(yol, os.path.join(cikti, ad + "-2.pdf"))


def tarama(no):
    w, h = 1654, 2339
    img = Image.new("L", (w, h), 245)
    d = ImageDraw.Draw(img)
    f_b = ImageFont.truetype(ARIAL, 46)
    f = ImageFont.truetype(ARIAL, 30)
    d.text((180, 160), f"T.C. DENEME DAİRESİ — sayfa {no}", font=f_b, fill=20)
    y = 300
    for s in range(48):
        d.text((180, y), f"Satır {s + 1}: örnek taranmış metin, deneme paragrafı şçğıöü ŞÇĞİÖÜ {no * 100 + s}.", font=f, fill=30)
        y += 40
    px = img.load()   # kâğıt dokusu: JPEG'in çözme süresi gerçek taramaya yaklaşsın
    for _ in range(120000):
        x, yy = random.randrange(w), random.randrange(h)
        px[x, yy] = random.randrange(150, 256)
    b = io.BytesIO()
    img.save(b, "JPEG", quality=75)
    return b.getvalue()


doc = pymupdf.open()
for i in range(2):
    pg = doc.new_page(width=595, height=842)
    pg.insert_text((72, 80), "T.C. DENEME DAİRESİ", fontsize=14, **yazi)
    pg.insert_text((72, 104), f"Sayı: 2099/{i + 1} — Konu: örnek üst yazı", fontsize=10.5, **yazi)
    y = 150
    for s in range(48):
        pg.insert_text((72, y), f"{s + 1}. Örnek paragraf metni, deneme cümlesi şçğıöü ŞÇĞİÖÜ; tarih 01.01.2099, sayfa {i + 1}.", fontsize=10.5, **yazi)
        y += 13.5
kaydet(doc, "kucuk")

doc = pymupdf.open()
for i in range(3):
    pg = doc.new_page(width=595, height=842)
    pg.insert_image(pg.rect, stream=tarama(i + 1))
kaydet(doc, "taranmis")

kaynak = os.path.join(KOK, "test", "pdf", "mevzuat_6102_TTK.pdf")
if os.path.exists(kaynak):
    shutil.copyfile(kaynak, os.path.join(cikti, "buyuk.pdf"))
    shutil.copyfile(kaynak, os.path.join(cikti, "buyuk-2.pdf"))
else:
    doc = pymupdf.open()
    for i in range(410):
        pg = doc.new_page(width=595, height=842)
        pg.insert_text((72, 80), f"Örnek kanun metni — sayfa {i + 1}", fontsize=14, **yazi)
        y = 110
        for s in range(60):
            pg.insert_text((72, y), f"Madde {i * 60 + s + 1} - Örnek hüküm metni, deneme paragrafı şçğıöü ŞÇĞİÖÜ; bent ve fıkra yer tutucusu.", fontsize=9.5, **yazi)
            y += 11.6
    kaydet(doc, "buyuk")
print(cikti)
