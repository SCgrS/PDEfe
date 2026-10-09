# -*- coding: utf-8 -*-
"""Çekirdeğin görsellerdeki yazıyı tanıması ve tanınan yazıyla kopyalama (0.1.24): rakam kuralı, yalnızca PDF metni seçilince kenardaki
kaşenin etkisi, döndürülmüş sayfada kopya sırası (yazısı ekranda düz ve yan duran), çok görselli ve büyük sayfada süre ve bellek sınırları,
çıkışta bekleyen yanıt. 0.2.4: yan ve ters taranmış sayfa (yazı çevrilip tanınır; sözcüklerin yeri, satırların yönü, kopya sırası),
yazısız görsel, az sözcüklü dik kaşe, makul sözcük kuralı, çevirme ve geri çevirme. Belgeler test/cikti/tanima_testi altında üretilir.
Tanıma Windows'un yazı tanıyıcısını (Türkçe dil paketi) ister.
Kullanım: .venv\\Scripts\\python.exe test\\tanima_testi.py"""
import json
import os
import re
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
YAZI = "/System/Library/Fonts/Supplemental/Arial.ttf" if sys.platform == "darwin" else r"C:\Windows\Fonts\arial.ttf"   # macOS: 0.2.0
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

# ---------------------------------------------------------------- 6. yan ve ters taranmış sayfa (0.2.4)
sys.path.insert(0, os.path.join(KOK, "test"))
import tanima_pdf_uret  # noqa: E402

for metin, beklenen in {"Borçlu": True, "müzekkere": True, "T.C.": True, "DAİRESİ": True, "2099/123": True, "01.10.2026": True,
                        "İstanbul,": True, "Ankara'da": True, "TBK'nın": True, "(Esas)": True, "NISYA": True,
                        "EJeIsnp": False, "1UWlSB8": False, "au!yau": False, "u¿e": False, "3A": False, "x": False}.items():
    s = yt._Sonuc([yt._Satir([yt._Sozcuk(metin, yt._Kutu(0, 0, 10, 10))])], 0.0)
    sonuc("makul sözcük: %s → %s" % (metin, beklenen), yt._makul(s) == ((1, 1) if beklenen else (0, 1)), yt._makul(s))

# Çevirme ve geri çevirme: 7×4'lük görüntüde (5, 1) pikseli her açıda yerine döner
gri = bytearray(28)
gri[1 * 7 + 5] = 255
for aci in (90, 180, 270):
    d = yt._cevir({"gri": bytes(gri), "genislik": 7, "yukseklik": 4}, aci)
    i = d["gri"].index(255)
    px, py = i % d["genislik"] + 0.5, i // d["genislik"] + 0.5
    sonuc("çevir %d°: boyut ve geri çevrilen piksel" % aci, (d["genislik"], d["yukseklik"]) == ((7, 4) if aci == 180 else (4, 7))
          and yt._geri_cevir(aci, 7, 4)(px, py) == (5.5, 1.5), (d["genislik"], d["yukseklik"], yt._geri_cevir(aci, 7, 4)(px, py)))

yan = os.path.join(KOK, "test", "cikti", "tanima", "yan.pdf")
if not os.path.exists(yan):
    subprocess.run([sys.executable, uret, os.path.dirname(yan)], check=True)
SIRA = r"^Bu belge elektronik[\s\S]*T\.C\. DENEME[\s\S]*Dosya No[\s\S]*Borçlu[\s\S]*malların[\s\S]*ödeme[\s\S]*İstanbul"
for n, (donme, yon) in enumerate(zip(tanima_pdf_uret.YAN_DONMELER, ((0.0, -1.0), (-1.0, 0.0), (0.0, 1.0))), start=1):
    ad = {90: "saat yönünün tersine 90°", 180: "ters (180°)", -90: "saat yönünde 90°"}[donme]
    t = time.time()
    m = pdefe_core.y_metin_sec({"yol": yan, "sayfa": n, "kutular": [[0, 0, 900, 900]]})["metin"]
    sure = time.time() - t
    sonuc("%s: kopya okuma sırasıyla (%.1f sn)" % (ad, sure), re.search(SIRA, m) is not None and sure < 10, m[:300])
    k = yt._onbellekten(yt._anahtar(yan, n))
    sonuc("%s: satırların yazı yönü %s" % (ad, yon), k and k["yonler"] and all(y == yon for y in k["yonler"]), k and k["yonler"][:5])
    tc = [w for w in (k["sozcukler"] if k else []) if w[4] == "T.C."]
    bx, by = tanima_pdf_uret.yan_nokta(donme, 192, 105)   # dik içerikte "T.C."nin ortası (başlık x 180, taban çizgisi 110, 16 pt)
    sonuc("%s: \"T.C.\" görseldeki yerinde (beklenen ~%d, %d)" % (ad, bx, by), len(tc) == 1 and abs((tc[0][0] + tc[0][2]) / 2 - bx) < 20
          and abs((tc[0][1] + tc[0][3]) / 2 - by) < 20, tc)
    sonuc("%s: sözcük sayısı dik sayfadakine yakın" % ad, k and len(k["sozcukler"]) >= 35, k and len(k["sozcukler"]))
d = pymupdf.open(yan)
sonuc("yan.pdf'te sayfalar döndürülmemiş", all(p.rotation == 0 for p in d), [p.rotation for p in d])
d.close()
m = pdefe_core.y_metin_sec({"yol": yan, "sayfa": 4, "kutular": [[0, 0, 900, 900]]})["metin"]
k = yt._onbellekten(yt._anahtar(yan, 4))
sonuc("yazısız görsel: hiçbir yönde yazı bulunmaz", m == "" and k is not None and not k["satirlar"], (m, k and k["satirlar"][:3]))
m = pdefe_core.y_metin_sec({"yol": yan, "sayfa": 5, "kutular": [[0, 0, 900, 900]]})["metin"]
k = yt._onbellekten(yt._anahtar(yan, 5))
sonuc("az sözcüklü dik kaşe: dik okunur, yön değişmez", "GİBİDİR" in m and "Kâtibi" in m and k and all(y == (1.0, 0.0) for y in k["yonler"]),
      (m, k and k["yonler"]))
# Dik taranmış sayfa: yön değişmez, satırlar soldan sağa
ornek = os.path.join(KOK, "test", "cikti", "tanima", "taranmis.pdf")
m = pdefe_core.y_metin_sec({"yol": ornek, "sayfa": 1, "kutular": [[0, 0, 900, 900]]})["metin"]
k = yt._onbellekten(yt._anahtar(ornek, 1))
sonuc("dik taranmış sayfa: satırlar soldan sağa, sıra aynı", k and all(y == (1.0, 0.0) for y in k["yonler"]) and "Borçlu hakkında" in m
      and m.index("DENEME") < m.index("Borçlu") < m.index("ödeme"), (k and k["yonler"][:3], m[:200]))
# Seçim tanınan yazıya değmiyorsa PDF metninin düzlemi eskisi gibi (döndürülmemiş sayfada None)
d = pymupdf.open(yan)
sonuc("tanınan yazı yokken döndürülmemiş sayfanın düzlemi değişmez", pdefe_core._metin_duzlemi(d[0]) is None
      and pdefe_core._metin_duzlemi(d[0], []) is None, None)
sonuc("tanınan yazı aşağıdan yukarı okununca düzlem 90°", pdefe_core._metin_duzlemi(d[0], [(0.0, -1.0)] * 3)
      == pymupdf.Matrix(0, 1, -1, 0, d[0].cropbox.height, 0), pdefe_core._metin_duzlemi(d[0], [(0.0, -1.0)] * 3))
ref = pymupdf.open(yan)
for aci in (0, 90, 180, 270):
    d[0].set_rotation(aci)
    farkli = []
    for b in (0, 90, 180, 270):   # sayfa aci kadar döndürülmüşken her açının matrisi, o açıyla döndürülmüş sayfanınkiyle aynı
        rp = ref[0]
        rp.set_rotation(b)
        if pdefe_core._dondurme_matrisi(d[0], b) != pymupdf.Matrix(rp.rotation_matrix):
            farkli.append((b, tuple(pdefe_core._dondurme_matrisi(d[0], b)), tuple(rp.rotation_matrix)))
    sonuc("döndürme matrisleri PyMuPDF'inkiyle aynı (sayfa %d°)" % aci, not farkli, farkli)
ref.close()
d.close()

print("\nSonuç: %d/%d geçti%s." % (toplam - hata, toplam, ", %d HATA" % hata if hata else ""))
sys.exit(1 if hata else 0)
