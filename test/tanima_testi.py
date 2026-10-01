# -*- coding: utf-8 -*-
"""Çekirdeğin görsellerdeki yazıyı tanıması ve tanınan yazıyla kopyalama (0.1.24): rakam kuralı, yalnızca PDF metni seçilince kenardaki
kaşenin etkisi, döndürülmüş sayfada kopya sırası (yazısı ekranda düz ve yan duran), çok görselli ve büyük sayfada süre ve bellek sınırları,
çıkışta bekleyen yanıt. Belgeler test/cikti/tanima_testi altında üretilir. Tanıma Windows'un yazı tanıyıcısını (Türkçe dil paketi) ister.
Kullanım: .venv\\Scripts\\python.exe test\\tanima_testi.py"""
import json
import os
import subprocess
import sys
import time

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
import pdefe_core  # noqa: E402
from islemler import yazi_tanima as yt  # noqa: E402

CIKTI = os.path.join(KOK, "test", "cikti", "tanima_testi")
os.makedirs(CIKTI, exist_ok=True)
YAZI = r"C:\Windows\Fonts\arial.ttf"
hata = toplam = 0


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if ok else " — " + repr(ayrinti)[:600]))


def kase_png(satirlar):
    d = pymupdf.open()
    s = d.new_page(width=120, height=60)
    s.insert_font(fontname="F0", fontfile=YAZI)
    for i, t in enumerate(satirlar):
        s.insert_text((8, 25 + i * 20), t, fontsize=13, fontname="F0")
    png = s.get_pixmap(dpi=200, colorspace=pymupdf.csGRAY).tobytes("png")
    d.close()
    return png


# ---------------------------------------------------------------- 1. rakam kuralı
for g, b in {"01.ıo.2026": "01.10.2026", "2099/ı23": "2099/123", "1990'lı": "1990'lı", "2000'li": "2000'li", "15'i": "15'i",
             "40'ı": "40'ı", "80li": "80li", "2O26": "2026", "l5.03.2026": "15.03.2026", "Esas": "Esas", "Madde": "Madde",
             "1.250,00": "1.250,00"}.items():
    sonuc("rakam: %s → %s" % (g, b), yt._rakamlari_duzelt(g) == b, yt._rakamlari_duzelt(g))

# ---------------------------------------------------------------- 2. kenarda kaşe + PDF paragrafı
yol = os.path.join(CIKTI, "karisik.pdf")
doc = pymupdf.open()
pg = doc.new_page(width=595, height=842)
pg.insert_font(fontname="F0", fontfile=YAZI)
satirlar = ["Birinci satır uzun bir paragrafın başlangıcıdır ve sağa kadar sürer gider",
            "ikinci satır aynı paragrafın devamıdır ve o da sağa kadar sürer",
            "üçüncü satır aynı paragrafın devamıdır ve o da sağa kadar sürer", "dördüncü satır paragrafı bitirir."]
for i, t in enumerate(satirlar):
    pg.insert_text((110, 200 + i * 16), t, fontsize=11, fontname="F0")
pg.insert_image(pymupdf.Rect(20, 300, 100, 340), stream=kase_png(["ASLI", "GİBİDİR"]))
doc.save(yol)
doc.close()
r = pdefe_core.y_metin_sec({"yol": yol, "sayfa": 1, "kutular": [[105, 185, 560, 260]]})
sonuc("kenarda kaşe: yalnızca paragraf seçilince satırlar girintisiz", r["metin"] == "\n".join(satirlar), r["metin"])
r = pdefe_core.y_metin_sec({"yol": yol, "sayfa": 1, "kutular": [[15, 295, 105, 345]]})
sonuc("kenarda kaşe: kaşe seçilince tanınan yazı gelir", "GİBİDİR" in r["metin"], r["metin"])

# ---------------------------------------------------------------- 3. döndürülmüş sayfalar
yol = os.path.join(CIKTI, "yan.pdf")
doc = pymupdf.open()
pg = doc.new_page(width=595, height=842)
pg.insert_font(fontname="F0", fontfile=YAZI)
for i, t in enumerate(["Birinci satır", "İkinci satır", "Üçüncü satır", "Dördüncü satır"]):
    pg.insert_text((72, 100 + i * 20), t, fontsize=12, fontname="F0")
pg.set_rotation(90)
doc.save(yol)
doc.close()
m = pdefe_core.y_metin_sec({"yol": yol, "sayfa": 1, "kutular": [[0, 0, 900, 900]]})["metin"]
sonuc("yazısı yan duran döndürülmüş sayfa: sıra korunur", m.startswith("Birinci") and m.index("İkinci") < m.index("Üçüncü") < m.index("Dördüncü"), m)
yol = os.path.join(CIKTI, "duz.pdf")
doc = pymupdf.open()
pg = doc.new_page(width=595, height=842)
pg.set_rotation(90)
pg.insert_font(fontname="F0", fontfile=YAZI)
for i, t in enumerate(["Birinci satır", "İkinci satır", "Üçüncü satır"]):
    pg.insert_text(pymupdf.Point(100, 100 + 20 * i) * pg.derotation_matrix, t, fontsize=12, rotate=90, fontname="F0")
doc.save(yol)
doc.close()
m = pdefe_core.y_metin_sec({"yol": yol, "sayfa": 1, "kutular": [[0, 0, 900, 900]]})["metin"]
sonuc("yazısı ekranda düz döndürülmüş sayfa: ekrandaki sıra", m.startswith("Birinci") and m.index("İkinci") < m.index("Üçüncü"), m)

# ---------------------------------------------------------------- 4. çok görsel, büyük sayfa
yol = os.path.join(CIKTI, "cok_gorsel.pdf")
doc = pymupdf.open()
pg = doc.new_page(width=595, height=842)
pix = pymupdf.Pixmap(pymupdf.csGRAY, pymupdf.IRect(0, 0, 4, 4), False)
pix.set_rect(pix.irect, (0,))
pg.insert_image(pymupdf.Rect(0, 0, 6, 8), pixmap=pix)
ad = pg.get_images(full=True)[0][7]
ops = ["q 6 0 0 8 %.2f %.2f cm /%s Do Q" % ((i % 60) * 9.5, 834 - (i // 60) * 12, ad) for i in range(1, 4000)]
cx = pg.get_contents()[-1]
doc.update_stream(cx, doc.xref_stream(cx) + ("\n" + "\n".join(ops) + "\n").encode())
doc.save(yol)
doc.close()
d = pymupdf.open(yol)
t = time.time()
b = yt._bolgeler(d[0], d[0].get_text("words"))
sure = time.time() - t
sonuc("4000 görselli sayfa: bölge hesabı 1 sn'den kısa, tek bölge (%.2f sn)" % sure, sure < 1 and len(b) == 1, (sure, len(b)))
d.close()

yol = os.path.join(CIKTI, "buyuk.pdf")
doc = pymupdf.open()
pg = doc.new_page(width=14400, height=14400)
pix = pymupdf.Pixmap(pymupdf.csGRAY, pymupdf.IRect(0, 0, 50, 50), False)
pix.set_rect(pix.irect, (200,))
for i in range(30):
    x, y = (i % 6) * 2350, (i // 6) * 2350
    pg.insert_image(pymupdf.Rect(x, y, x + 1500, y + 1500), pixmap=pix)
doc.save(yol)
doc.close()
d = pymupdf.open(yol)
sz = d[0].get_text("words")
h = yt._hazirla(d[0], sz, yt._bolgeler(d[0], sz))
piksel = sum(c["genislik"] * c["yukseklik"] for c in h["cizimler"])
sonuc("büyük sayfada 30 görsel: toplam %.1f milyon piksel (sınır 20)" % (piksel / 1e6), 0 < piksel <= 20_500_000, piksel)
d.close()

# ---------------------------------------------------------------- 5. çıkışta bekleyen yanıt yazılır
uret = os.path.join(KOK, "test", "tanima_pdf_uret.py")
ornek = os.path.join(KOK, "test", "cikti", "tanima", "taranmis.pdf")
if not os.path.exists(ornek):
    subprocess.run([sys.executable, uret, os.path.dirname(ornek)], check=True)
istek = json.dumps({"id": 1, "method": "ocr_sayfa", "params": {"yol": ornek, "sayfa": 1}}) + "\n"
p = subprocess.run([sys.executable, "-X", "utf8", os.path.join(KOK, "core", "pdefe_core.py")], input=istek, capture_output=True,
                   text=True, encoding="utf-8", timeout=60)
satir = (p.stdout.strip().splitlines() or [""])[0]
yanit = json.loads(satir) if satir.startswith("{") else {}
sonuc("girdi kapanınca sıradaki tanımanın yanıtı yazılır, çıkış kodu 0",
      p.returncode == 0 and len((yanit.get("result") or {}).get("satirlar", [])) >= 5, (p.returncode, satir[:200], p.stderr[-300:]))

print("\nSonuç: %d/%d geçti%s." % (toplam - hata, toplam, ", %d HATA" % hata if hata else ""))
sys.exit(1 if hata else 0)
