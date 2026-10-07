# -*- coding: utf-8 -*-
"""Çekirdeğin küçük resim biçimi (0.2.3, kullanıcı isteği: "sayfaları kaydırırken daha hızlı yüklensin"): görsel ağırlıklı sayfanın
(taranmış evrak, büyük fotoğraf) küçük resmi JPEG, ötekiler (metin, çizim, küçük logo / karekod) PNG. Denetlenenler: sayfa türlerine göre
biçim; yanıtın alanları (veri, bicim, genislik, yukseklik) ve verinin gerçekten o biçimde olması; metin sayfasında ve yalnızca küçük
görselli sayfada sayfa içeriği okunmaz (get_image_info çağrılmaz); kaynaklarında büyük görsel olup onu çizmeyen sayfa PNG; döndürülmüş
taranmış sayfa JPEG ve boyutu doğru; JPEG'in bozulması küçük (PSNR); JPEG taranmış sayfada PNG'den küçük; çekirdek süreci üzerinden de
aynı yanıt. Belgeler test/cikti/kucuk_resim_testi altında üretilir (gerçek belge yok), iş bitince silinir.
Kullanım: .venv\\Scripts\\python.exe test\\kucuk_resim_testi.py"""
import base64
import io
import json
import math
import os
import random
import shutil
import subprocess
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageStat  # noqa: E402
import pdefe_core  # noqa: E402

CIKTI = os.path.join(KOK, "test", "cikti", "kucuk_resim_testi")
shutil.rmtree(CIKTI, ignore_errors=True)
os.makedirs(CIKTI, exist_ok=True)
YAZI = "/System/Library/Fonts/Supplemental/Arial.ttf" if sys.platform == "darwin" else os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arial.ttf")
YAZI_ARG = {"fontname": "arial", "fontfile": YAZI} if os.path.exists(YAZI) else {"fontname": "helv"}
random.seed(5)
hata = toplam = 0


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if ok else " — " + repr(ayrinti)[:600]))


def bayt(img, bicim, **k):
    b = io.BytesIO()
    img.save(b, bicim, **k)
    return b.getvalue()


def tarama(w=1654, h=2339, gurultu=60000, ikili=False):
    """Taranmış evrak benzeri sayfa görseli (yer tutucu metin; gri, gürültülü ya da siyah-beyaz)."""
    img = Image.new("L", (w, h), 255 if ikili else 245)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(YAZI, int(w / 55)) if os.path.exists(YAZI) else ImageFont.load_default()
    y = int(h * 0.08)
    for s in range(44):
        d.text((int(w * 0.11), y), f"Satır {s + 1}: örnek taranmış metin, deneme paragrafı {s * 7}.", font=f, fill=0 if ikili else 25)
        y += int(h / 50)
    if ikili:
        return bayt(img.point(lambda v: 255 if v > 128 else 0).convert("1"), "PNG")
    px = img.load()
    for _ in range(gurultu):
        px[random.randrange(w), random.randrange(h)] = random.randrange(150, 256)
    return bayt(img, "JPEG", quality=75)


def foto(w, h):
    """Fotoğrafa benzer görsel: yumuşak renk geçişleri ve doku."""
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (int(128 + 100 * math.sin(x / 37.0) * math.cos(y / 53.0)), int(110 + 90 * math.sin((x + y) / 71.0)), int(90 + 80 * math.cos(x / 23.0 - y / 41.0)))
    return bayt(Image.blend(img.filter(ImageFilter.GaussianBlur(2)), Image.effect_noise((w, h), 30).convert("RGB"), 0.15), "JPEG", quality=85)


def metin_yaz(pg, y=100, satir=50):
    for s in range(satir):
        pg.insert_text((72, y + s * 13), f"{s + 1}. Örnek metin satırı, deneme paragrafı şçğıöü ŞÇĞİÖÜ.", fontsize=10, **YAZI_ARG)


# ---------------------------------------------------------------- örnek belge: her sayfa bir tür
yol = os.path.join(CIKTI, "turler.pdf")
d = pymupdf.open()
TURLER = []   # (ad, beklenen biçim)
pg = d.new_page(width=595, height=842); metin_yaz(pg); TURLER.append(("metin", "png"))
pg = d.new_page(width=595, height=842)
for k in range(40):
    pg.draw_rect(pymupdf.Rect(50 + k * 3, 50 + k * 18, 545 - k * 3, 62 + k * 18), color=(0, 0, 0.5), fill=(0.9, 0.95 - k / 100, 1), width=0.5)
TURLER.append(("çizim", "png"))
pg = d.new_page(width=595, height=842)   # üretilmiş evrak: küçük logo ve karekod
logo = Image.new("RGB", (600, 600), (255, 255, 255))
ImageDraw.Draw(logo).ellipse([20, 20, 580, 580], outline=(160, 40, 60), width=30)
pg.insert_image(pymupdf.Rect(260, 30, 335, 105), stream=bayt(logo, "JPEG", quality=85))
kare = Image.new("L", (198, 198), 255)
for yy in range(33):
    for x in range(33):
        if random.random() < 0.5:
            ImageDraw.Draw(kare).rectangle([x * 6, yy * 6, x * 6 + 5, yy * 6 + 5], fill=0)
pg.insert_image(pymupdf.Rect(470, 740, 540, 810), stream=bayt(kare, "PNG"))
metin_yaz(pg, 140)
TURLER.append(("logolu, karekodlu metin", "png"))
pg = d.new_page(width=595, height=842); pg.insert_image(pg.rect, stream=tarama()); TURLER.append(("gri taranmış", "jpeg"))
pg = d.new_page(width=595, height=842); pg.insert_image(pg.rect, stream=tarama(ikili=True)); TURLER.append(("siyah-beyaz taranmış", "jpeg"))
pg = d.new_page(width=595, height=842); pg.insert_image(pg.rect, stream=tarama(827, 1169, 20000)); TURLER.append(("100 dpi taranmış", "jpeg"))
pg = d.new_page(width=595, height=842); pg.insert_image(pymupdf.Rect(72, 100, 523, 422), stream=foto(1400, 1000)); metin_yaz(pg, 450, 28)
TURLER.append(("metin + büyük fotoğraf (%29)", "jpeg"))
pg = d.new_page(width=595, height=842); pg.insert_image(pymupdf.Rect(72, 72, 300, 243), stream=foto(800, 600)); metin_yaz(pg, 270, 40)
TURLER.append(("metin + orta fotoğraf (%8)", "png"))
pg = d.new_page(width=595, height=842); pg.insert_image(pg.rect, stream=tarama()); pg.set_rotation(90); TURLER.append(("döndürülmüş taranmış", "jpeg"))
pg = d.new_page(width=595, height=842); pg.insert_image(pg.rect, stream=tarama())
for s in range(40):   # tanınmış tarama: görselin üstünde görünmez yazı katmanı
    pg.insert_text((60, 100 + s * 16), f"Satır {s + 1}: örnek taranmış metin", fontsize=9, render_mode=3, **YAZI_ARG)
TURLER.append(("yazı katmanlı taranmış", "jpeg"))
pg = d.new_page(width=595, height=842); pg.insert_image(pg.rect, stream=tarama())
pg.add_highlight_annot(pymupdf.Rect(100, 180, 400, 200)); TURLER.append(("vurgulu taranmış", "jpeg"))
# Kaynakları büyük bir taramayı listeleyip onu çizmeyen sayfa (kaynak sözlüğünü sayfalarla paylaşan üreticiler): içerik ölçütü belirler
pg = d.new_page(width=595, height=842); metin_yaz(pg); TURLER.append(("paylaşılan kaynaklı metin", "png"))
d.save(yol, garbage=3, deflate=True)
d.close()
d = pymupdf.open(yol)
tarama_no = [ad for ad, _ in TURLER].index("gri taranmış")
son = len(TURLER) - 1
def kaynak_kopyasi(sayfa_xref):
    """Sayfaya kaynak sözlüğünün kendine ait bir kopyasını verir (aynı yazı tipli sayfalar kayıtta aynı sözlüğü paylaşır), nesnesini döner."""
    t, v = d.xref_get_key(sayfa_xref, "Resources")
    x = d.get_new_xref()
    d.update_object(x, d.xref_object(int(v.split()[0])) if t == "xref" else v)
    d.xref_set_key(sayfa_xref, "Resources", f"{x} 0 R")
    return x


tx, mx = kaynak_kopyasi(d[tarama_no].xref), kaynak_kopyasi(d[son].xref)
gorseller = d.xref_get_key(tx, "XObject")   # taranmış sayfanın görsel sözlüğü, metin sayfasının kaynaklarına
d.xref_set_key(mx, "XObject", gorseller[1])
d.save(yol + ".tmp", garbage=0)
d.close()
os.replace(yol + ".tmp", yol)
pdefe_core.onbellek.hepsini_birak()
doc = pymupdf.open(yol)
sonuc("örnek: paylaşılan kaynaklı sayfa taramayı listeliyor ama çizmiyor",
      sum(g[2] * g[3] for g in doc[son].get_images(full=True)) >= 1_000_000 and not doc[son].get_image_info(), doc[son].get_images(full=True))

# ---------------------------------------------------------------- 1. sayfa türüne göre biçim
print("— Sayfa türüne göre biçim")
boylar = {}
for i, (ad, beklenen) in enumerate(TURLER):
    for genislik in (256, 576):
        r = pdefe_core.y_kucuk_resim({"yol": yol, "sayfa": i + 1, "genislik": genislik})
        veri = base64.b64decode(r["veri"])
        imza = "png" if veri[:8] == b"\x89PNG\r\n\x1a\n" else "jpeg" if veri[:3] == b"\xff\xd8\xff" else "?"
        sonuc(f"{ad} ({genislik} px): {beklenen.upper()}", r["bicim"] == beklenen and imza == beklenen, (r["bicim"], imza))
        boylar[(ad, genislik)] = len(veri)
        if genislik == 576:
            sonuc(f"{ad}: genişlik istenen ({r['genislik']} × {r['yukseklik']})", abs(r["genislik"] - genislik) <= 1, (r["genislik"], r["yukseklik"]))
sonuc("yanıtın alanları: veri, bicim, genislik, yukseklik (eski 'png' alanı yok)",
      set(pdefe_core.y_kucuk_resim({"yol": yol, "sayfa": 1, "genislik": 160})) == {"veri", "bicim", "genislik", "yukseklik"})
r = pdefe_core.y_kucuk_resim({"yol": yol, "sayfa": TURLER.index(("döndürülmüş taranmış", "jpeg")) + 1, "genislik": 400})
sonuc("döndürülmüş taranmış sayfa: resim yatay (döndürülmüş yönde)", r["genislik"] == 400 and r["yukseklik"] < r["genislik"], (r["genislik"], r["yukseklik"]))

# ---------------------------------------------------------------- 2. kazanç ve bozulma
print("— Boy ve bozulma")
for ad, oran in (("gri taranmış", 0.5), ("siyah-beyaz taranmış", 0.85), ("metin + büyük fotoğraf (%29)", 0.5)):
    i = [a for a, _ in TURLER].index(ad)
    pix = doc[i].get_pixmap(matrix=pymupdf.Matrix(576 / 595, 576 / 595), annots=True, alpha=False)
    png = len(pix.tobytes("png"))
    sonuc(f"{ad}: JPEG PNG'nin %{round(oran * 100)}'inden küçük ({boylar[(ad, 576)] // 1024} KB / {png // 1024} KB)", boylar[(ad, 576)] < oran * png, (boylar[(ad, 576)], png))
    jpg = base64.b64decode(pdefe_core.y_kucuk_resim({"yol": yol, "sayfa": i + 1, "genislik": 576})["veri"])
    a = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    b = Image.open(io.BytesIO(jpg)).convert("RGB")
    rms = sum(ImageStat.Stat(ImageChops.difference(a, b)).rms) / 3
    psnr = 99 if rms == 0 else 20 * math.log10(255 / rms)
    sonuc(f"{ad}: JPEG bozulması küçük (PSNR {psnr:.1f} dB ≥ 32)", a.size == b.size and psnr >= 32, (a.size, b.size, psnr))

# ---------------------------------------------------------------- 3. metin sayfasında sayfa içeriği okunmaz
print("— Ölçütün maliyeti")
ozgun = pymupdf.Page.get_image_info
cagri = []
pymupdf.Page.get_image_info = lambda self, *a, **k: (cagri.append(self.number), ozgun(self, *a, **k))[1]
try:
    for ad in ("metin", "çizim", "logolu, karekodlu metin"):
        cagri.clear()
        i = [a for a, _ in TURLER].index(ad)
        b = pdefe_core.kucuk_resim_bicimi(doc[i])
        sonuc(f"{ad}: büyük görsel yok, içerik okunmadı (get_image_info çağrılmadı)", b == "png" and not cagri, (b, cagri))
    cagri.clear()
    b = pdefe_core.kucuk_resim_bicimi(doc[tarama_no])
    sonuc("gri taranmış: içerik okundu, JPEG", b == "jpeg" and cagri == [tarama_no], (b, cagri))
finally:
    pymupdf.Page.get_image_info = ozgun
doc.close()

# ---------------------------------------------------------------- 4. çekirdek süreci üzerinden
print("— Çekirdek süreci")
pdefe_core.onbellek.hepsini_birak()
istekler = "".join(json.dumps({"id": n, "method": "kucuk_resim", "params": {"yol": yol, "sayfa": s, "genislik": 300}}) + "\n" for n, s in ((1, 1), (2, tarama_no + 1)))
p = subprocess.run([sys.executable, "-X", "utf8", os.path.join(KOK, "core", "pdefe_core.py")], input=istekler.encode("utf-8"), capture_output=True, timeout=60,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
yanitlar = {j["id"]: j for j in (json.loads(s) for s in p.stdout.decode("utf-8", "replace").splitlines() if s.startswith("{"))}
sonuc("çekirdek süreci: metin sayfası PNG, taranmış sayfa JPEG",
      yanitlar.get(1, {}).get("result", {}).get("bicim") == "png" and yanitlar.get(2, {}).get("result", {}).get("bicim") == "jpeg",
      {k: (v.get("result") or {}).get("bicim") or v.get("error") for k, v in yanitlar.items()})

shutil.rmtree(CIKTI, ignore_errors=True)
print(f"\n{toplam - hata} tamam, {hata} hata")
sys.exit(1 if hata else 0)
