"""Kaydırma ölçümü (test/kaydirma_olcum.mjs) için örnek PDF'ler üretir (gerçek belge yok; metinler yer tutucudur).

Kullanım:
  .venv\\Scripts\\python.exe test/kaydirma_ornek_uret.py [çıktı klasörü = test/cikti/kaydirma/pdf]
Üretilenler:
  taranmis.pdf : 40 sayfa, sayfa başına 200 dpi gri JPEG (1654x2339, gürültülü, yazılı): taranmış evrak benzeri. Bu boyutta görsel
                 genişliğe sığdırınca büyütülür (Chromium yumuşatmasıyla çizilir).
  karisik.pdf  : 60 sayfa, gömülü yazı tipli metin + sayfa başına 600x600 renkli JPEG logo (kaydırırken işçide örneklenir, hızlı çizilir)
                 ve küçük karekod benzeri PNG: logolu, kaşeli, karekodlu üretilmiş belge benzeri.
  metin.pdf    : test/pdf/mevzuat_6102_TTK.pdf'in kopyası (410 sayfa, yalnızca metin); dosya yoksa 410 sayfalık yer tutucu metin üretilir.
  formlu.pdf   : 20 sayfa, metin + sayfa başına 4 yazı alanı (form alanlı belge: form katmanı çekirdekten ayrıca istenir; 0.2.3).
  karma.pdf    : 40 sayfa, tek sayfalar tam sayfa renkli fotoğraf (JPEG, kaydırırken işçide örneklenir), çift sayfalar yalnızca metin
                 (ertelenecek görseli yok): eşzamanlı çizimde sayaçların sayfaya göre tutulduğunu sınamak için (0.2.3).
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
cikti = sys.argv[1] if len(sys.argv) > 1 else os.path.join(KOK, "test", "cikti", "kaydirma", "pdf")
os.makedirs(cikti, exist_ok=True)
random.seed(7)


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
    # Gürültü (taranmış kâğıt dokusu): JPEG'in sıkışmasını zorlaştırır, çözme süresi gerçek taramaya yaklaşır
    px = img.load()
    for _ in range(120000):
        x, yy = random.randrange(w), random.randrange(h)
        px[x, yy] = random.randrange(150, 256)
    b = io.BytesIO()
    img.save(b, "JPEG", quality=75)
    return b.getvalue()


def karekod(no):
    n = 33
    img = Image.new("L", (n * 6, n * 6), 255)
    d = ImageDraw.Draw(img)
    r = random.Random(no)
    for yy in range(n):
        for x in range(n):
            if r.random() < 0.5:
                d.rectangle([x * 6, yy * 6, x * 6 + 5, yy * 6 + 5], fill=0)
    b = io.BytesIO()
    img.save(b, "PNG")
    return b.getvalue()


def logo():
    img = Image.new("RGB", (600, 600), (255, 255, 255))
    d = ImageDraw.Draw(img)
    for k in range(0, 300, 6):
        d.ellipse([k, k, 600 - k, 600 - k], outline=(180 - k // 2, 40 + k // 3, 60 + k // 2), width=4)
    b = io.BytesIO()
    img.save(b, "JPEG", quality=85)
    return b.getvalue()


yazi = {"fontname": "arial", "fontfile": ARIAL}

doc = pymupdf.open()
for i in range(40):
    pg = doc.new_page(width=595, height=842)
    pg.insert_image(pg.rect, stream=tarama(i + 1))
doc.save(os.path.join(cikti, "taranmis.pdf"), garbage=3, deflate=True)
doc.close()

LOGO = logo()
doc = pymupdf.open()
for i in range(60):
    pg = doc.new_page(width=595, height=842)
    pg.insert_image(pymupdf.Rect(260, 30, 335, 105), stream=LOGO)
    pg.insert_text((72, 140), f"Örnek üretilmiş belge — sayfa {i + 1}", fontsize=16, **yazi)
    y = 175
    for s in range(52):
        pg.insert_text((72, y), f"{s + 1}. Örnek madde metni, sayfa {i + 1}: deneme paragrafı şçğıöü ŞÇĞİÖÜ, tarih 01.01.2099.", fontsize=9.5, **yazi)
        y += 11.6
    pg.insert_image(pymupdf.Rect(470, 740, 540, 810), stream=karekod(i))
doc.save(os.path.join(cikti, "karisik.pdf"), garbage=3, deflate=True)
doc.close()

kaynak = os.path.join(KOK, "test", "pdf", "mevzuat_6102_TTK.pdf")
hedef = os.path.join(cikti, "metin.pdf")
if os.path.exists(kaynak):
    shutil.copyfile(kaynak, hedef)
else:
    doc = pymupdf.open()
    for i in range(410):
        pg = doc.new_page(width=595, height=842)
        pg.insert_text((72, 80), f"Örnek kanun metni — sayfa {i + 1}", fontsize=14, **yazi)
        y = 110
        for s in range(60):
            pg.insert_text((72, y), f"Madde {i * 60 + s + 1} - Örnek hüküm metni, deneme paragrafı şçğıöü ŞÇĞİÖÜ; bent ve fıkra yer tutucusu.", fontsize=9.5, **yazi)
            y += 11.6
    doc.save(hedef, garbage=3, deflate=True)
    doc.close()

doc = pymupdf.open()
for i in range(20):
    pg = doc.new_page(width=595, height=842)
    y = 60
    for s in range(40):
        pg.insert_text((50, y), f"Sayfa {i + 1}, satır {s + 1}: örnek form metni, deneme paragrafı şçğıöü.", fontsize=10, **yazi)
        y += 18
    for k in range(4):
        w = pymupdf.Widget()
        w.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
        w.field_name = f"alan_{i}_{k}"
        w.rect = pymupdf.Rect(60, 100 + k * 170, 400, 130 + k * 170)
        w.field_value = f"Değer {i + 1}-{k + 1}"
        pg.add_widget(w)
doc.save(os.path.join(cikti, "formlu.pdf"), garbage=3, deflate=True)
doc.close()


def foto(no):
    w, h = 1400, 1980
    img = Image.new("RGB", (w, h), (230, 220, 200))
    d = ImageDraw.Draw(img)
    r = random.Random(no)
    for _ in range(400):
        x, yy = r.randrange(w), r.randrange(h)
        d.ellipse([x, yy, x + r.randrange(20, 200), yy + r.randrange(20, 200)], fill=(r.randrange(256), r.randrange(256), r.randrange(256)))
    px = img.load()
    for _ in range(60000):
        px[r.randrange(w), r.randrange(h)] = (r.randrange(256), r.randrange(256), r.randrange(256))
    b = io.BytesIO()
    img.save(b, "JPEG", quality=80)
    return b.getvalue()


doc = pymupdf.open()
for i in range(40):
    pg = doc.new_page(width=595, height=842)
    if i % 2 == 0:
        pg.insert_image(pg.rect, stream=foto(i + 1))
    else:
        y = 80
        for s in range(60):
            pg.insert_text((72, y), f"Madde {s + 1} - örnek metin, sayfa {i + 1}, deneme paragrafı şçğıöü.", fontsize=10, **yazi)
            y += 12
doc.save(os.path.join(cikti, "karma.pdf"), garbage=3, deflate=True)
doc.close()
print("tamam", cikti)
