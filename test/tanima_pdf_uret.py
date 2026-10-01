# -*- coding: utf-8 -*-
# Görsellerdeki yazının tanınması testinin (test/senaryo25.mjs) örnek PDF'ini üretir (0.1.24).
# Kullanım: .venv\Scripts\python.exe test\tanima_pdf_uret.py <çıktı klasörü>
#   taranmis.pdf  1) taranmış sayfa (tam sayfa görsel) + üstte görselde de yazan bir satır PDF metni olarak (e-imza satırı gibi)
#                 2) aynı içerik yan çevrilmiş taranmış sayfa (/Rotate 90; ekranda düz görünür)
#                 3) görselsiz, yalnızca PDF metni
#                 4) daha önce tanınmış taranmış sayfa (görselin üstünde görünmez yazı): yeniden tanınmamalı
#                 5) karışık: PDF metni, ortada yazılı bir görsel şeridi (kaşe), küçük bir simge görseli (tanınmamalı)
import io
import os
import sys

import pymupdf
from PIL import Image

YAZI = r"C:\Windows\Fonts\arial.ttf"
BASLIK = "T.C. DENEME İCRA DAİRESİ"
IMZA_SATIRI = "Bu belge elektronik ortamda imzalanmıştır."
GOVDE = [
    "Dosya No: 2099/123 Esas",
    "Borçlu hakkında yapılan takip kesinleşmiş olup haczi kabil",
    "malların bildirilmesi için işbu müzekkere yazılmıştır. Şirketin",
    "ödeme emrine itiraz etmediği görülmüştür. Gereği rica olunur.",
]
KASE = ["ASLI GİBİDİR", "Zabıt Kâtibi"]


def yazi_ekle(sayfa, satirlar, x, y, boy=13, aralik=22, gorunmez=False):
    sayfa.insert_font(fontname="F0", fontfile=YAZI)
    for i, s in enumerate(satirlar):
        sayfa.insert_text((x, y + i * aralik), s, fontsize=boy, fontname="F0", render_mode=3 if gorunmez else 0)


def kaynak_sayfa(gorunmez=False, hedef=None):
    """Taranacak içeriğin PDF metniyle yazıldığı sayfa (hedef verilirse ona, verilmezse geçici belgeye)."""
    doc = None
    if hedef is None:
        doc = pymupdf.open()
        hedef = doc.new_page(width=595, height=842)
    yazi_ekle(hedef, [IMZA_SATIRI], 72, 40, boy=8, gorunmez=gorunmez)
    yazi_ekle(hedef, [BASLIK], 180, 110, boy=16, gorunmez=gorunmez)
    yazi_ekle(hedef, GOVDE, 72, 170, gorunmez=gorunmez)
    yazi_ekle(hedef, ["İstanbul, 01.10.2026", "Müdür Yardımcısı"], 330, 300, gorunmez=gorunmez)
    return doc, hedef


def taranmis_png(dondur=0):
    doc, sayfa = kaynak_sayfa()
    pix = sayfa.get_pixmap(dpi=200, colorspace=pymupdf.csGRAY)
    png = pix.tobytes("png")
    doc.close()
    if dondur:
        g = Image.open(io.BytesIO(png)).rotate(dondur, expand=True)
        b = io.BytesIO()
        g.save(b, "PNG")
        png = b.getvalue()
    return png


def kase_png():
    doc = pymupdf.open()
    s = doc.new_page(width=200, height=70)
    s.draw_rect(pymupdf.Rect(4, 4, 196, 66), color=(0, 0, 0), width=1.5)
    yazi_ekle(s, KASE, 30, 30, boy=15, aralik=22)
    png = s.get_pixmap(dpi=200, colorspace=pymupdf.csGRAY).tobytes("png")
    doc.close()
    return png


def uret(klasor):
    os.makedirs(klasor, exist_ok=True)
    doc = pymupdf.open()
    png = taranmis_png()
    # 1) taranmış sayfa + görselde de yazan imza satırı PDF metni olarak
    s1 = doc.new_page(width=595, height=842)
    s1.insert_image(s1.rect, stream=png)
    yazi_ekle(s1, [IMZA_SATIRI], 72, 40, boy=8)
    # 2) yan çevrilmiş taranmış sayfa: görsel saat yönünün tersine döndürülüp yatay sayfaya konur, sayfa 90° döndürülür
    s2 = doc.new_page(width=842, height=595)
    s2.insert_image(s2.rect, stream=taranmis_png(90))
    s2.set_rotation(90)
    # 3) görselsiz
    s3 = doc.new_page(width=595, height=842)
    yazi_ekle(s3, ["Bu sayfada görsel yok.", "Yalnızca PDF metni var."], 72, 100)
    # 4) daha önce tanınmış: görsel + üstünde görünmez yazı
    s4 = doc.new_page(width=595, height=842)
    s4.insert_image(s4.rect, stream=png)
    kaynak_sayfa(gorunmez=True, hedef=s4)
    # 5) karışık: PDF metni, kaşe görseli, küçük simge
    s5 = doc.new_page(width=595, height=842)
    yazi_ekle(s5, ["Karışık sayfanın PDF metni.", "Aşağıdaki kaşe bir görseldir."], 72, 100)
    s5.insert_image(pymupdf.Rect(72, 200, 272, 270), stream=kase_png())
    simge = pymupdf.Pixmap(pymupdf.csGRAY, pymupdf.IRect(0, 0, 20, 20), False)
    simge.set_rect(simge.irect, (90,))
    s5.insert_image(pymupdf.Rect(500, 60, 520, 80), pixmap=simge)
    yol = os.path.join(klasor, "taranmis.pdf")
    doc.save(yol, garbage=3, deflate=True)
    doc.close()
    print("Üretildi:", yol)


if __name__ == "__main__":
    uret(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "cikti", "tanima"))
