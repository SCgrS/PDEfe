# -*- coding: utf-8 -*-
# Görsellerdeki yazının tanınması testlerinin (test/senaryo25.mjs, test/senaryo31.mjs, test/tanima_testi.py) örnek PDF'lerini üretir
# (0.1.24; yan.pdf 0.2.4).
# Kullanım: .venv\Scripts\python.exe test\tanima_pdf_uret.py <çıktı klasörü>
#   taranmis.pdf  1) taranmış sayfa (tam sayfa görsel) + üstte görselde de yazan bir satır PDF metni olarak (e-imza satırı gibi)
#                 2) aynı içerik yan çevrilmiş taranmış sayfa (/Rotate 90; ekranda düz görünür)
#                 3) görselsiz, yalnızca PDF metni
#                 4) daha önce tanınmış taranmış sayfa (görselin üstünde görünmez yazı): yeniden tanınmamalı
#                 5) karışık: PDF metni, ortada yazılı bir görsel şeridi (kaşe), küçük bir simge görseli (tanınmamalı)
#   yan.pdf       yazısı ekranda yan ya da ters duran taranmış sayfalar, /Rotate yok (yatay belge dik sayfaya yatırılıp taranmış gibi);
#                 tanıyıcı yazıyı çevirerek okumalı (0.2.4):
#                 1) saat yönünün tersine 90° (yazı aşağıdan yukarı okunur)  2) 180° (ters)  3) saat yönünde 90° (yukarıdan aşağı)
#                 4) yazısız görsel (yumuşak geçişli gri): hiçbir yönde yazı bulunmamalı
#                 5) dik taranmış kaşe (az sözcük): dik okunmalı, yön değişmemeli
#   arama.pdf     Bul'un taranmış sayfalarda araması (0.3.1, test/senaryo46.mjs): 12 sayfa, aranan sözcük ARANAN (ARAMA_BEKLENEN'deki
#                 sayfalarda, toplam 10 kez): 1) PDF metni (1)  2) taranmış (1)  3) taranmış, yok  4) taranmış (2)  5) taranmış, /Rotate 90 (1)
#                 6) yan taranmış, /Rotate yok (1)  7) PDF metni, yok  8) karışık: PDF metni (1) + kaşe görseli (1)  9) taranmış, yok
#                 10) taranmış (1)  11) ters taranmış (1)  12) taranmış, yok
import io
import os
import sys

import pymupdf
from PIL import Image

YAZI = "/System/Library/Fonts/Supplemental/Arial.ttf" if sys.platform == "darwin" else r"C:\Windows\Fonts\arial.ttf"   # macOS: 0.2.0
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


def kaynak_sayfa(gorunmez=False, hedef=None, ek=()):
    """Taranacak içeriğin PDF metniyle yazıldığı sayfa (hedef verilirse ona, verilmezse geçici belgeye). ek: imzanın altına eklenen satırlar."""
    doc = None
    if hedef is None:
        doc = pymupdf.open()
        hedef = doc.new_page(width=595, height=842)
    yazi_ekle(hedef, [IMZA_SATIRI], 72, 40, boy=8, gorunmez=gorunmez)
    yazi_ekle(hedef, [BASLIK], 180, 110, boy=16, gorunmez=gorunmez)
    yazi_ekle(hedef, GOVDE, 72, 170, gorunmez=gorunmez)
    yazi_ekle(hedef, ["İstanbul, 01.10.2026", "Müdür Yardımcısı"], 330, 300, gorunmez=gorunmez)
    if ek:
        yazi_ekle(hedef, list(ek), 72, 380, gorunmez=gorunmez)
    return doc, hedef


def taranmis_png(dondur=0, ek=()):
    doc, sayfa = kaynak_sayfa(ek=ek)
    pix = sayfa.get_pixmap(dpi=200, colorspace=pymupdf.csGRAY)
    png = pix.tobytes("png")
    doc.close()
    if dondur:
        g = Image.open(io.BytesIO(png)).rotate(dondur, expand=True)
        b = io.BytesIO()
        g.save(b, "PNG")
        png = b.getvalue()
    return png


def kase_png(satirlar=KASE):
    doc = pymupdf.open()
    s = doc.new_page(width=200, height=70)
    s.draw_rect(pymupdf.Rect(4, 4, 196, 66), color=(0, 0, 0), width=1.5)
    yazi_ekle(s, satirlar, 30, 30, boy=15, aralik=22)
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
    uret_yan(klasor)
    uret_arama(klasor)


# Yan / ters taranmış sayfalarda dik içeriğin (595×842 pt) bir noktasının sayfadaki yeri (yan.pdf'in sayfa boyutlarıyla); testler
# tanınan sözcüğün yerini bununla denetler
YAN_DONMELER = (90, 180, -90)   # PIL Image.rotate açısı (saat yönünün tersine)


def yan_nokta(donme, x, y):
    if donme == 90:
        return y, 595 - x
    if donme == 180:
        return 595 - x, 842 - y
    return 842 - y, x


def uret_yan(klasor):
    doc = pymupdf.open()
    for donme in YAN_DONMELER:
        yatay = donme % 180 != 0
        s = doc.new_page(width=842 if yatay else 595, height=595 if yatay else 842)
        s.insert_image(s.rect, stream=taranmis_png(donme))
    # 4) yazısız görsel
    gecis = Image.linear_gradient("L").resize((1000, 1400))
    b = io.BytesIO()
    gecis.save(b, "PNG")
    s = doc.new_page(width=595, height=842)
    s.insert_image(s.rect, stream=b.getvalue())
    # 5) dik kaşe tek başına
    s = doc.new_page(width=595, height=842)
    s.insert_image(pymupdf.Rect(72, 200, 272, 270), stream=kase_png())
    yol = os.path.join(klasor, "yan.pdf")
    doc.save(yol, garbage=3, deflate=True)
    doc.close()
    print("Üretildi:", yol)


ARANAN = "tutanak"
ARAMA_BEKLENEN = {1: 1, 2: 1, 4: 2, 5: 1, 6: 1, 8: 2, 10: 1, 11: 1}   # sayfa → eşleşme sayısı (senaryo46 da bunu okur)
ARAMA_TARANMIS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]                  # görselinde tanınacak yazı olan sayfalar


def uret_arama(klasor):
    doc = pymupdf.open()
    bir = ["Tutanak örneği dosyadadır."]
    iki = ["Tutanak örneği dosyadadır.", "Haciz tutanağının ikinci tutanak sayfası."]

    def taranmis(dondur=0, ek=(), rotate=0):
        yatay = dondur % 180 != 0
        s = doc.new_page(width=842 if yatay else 595, height=595 if yatay else 842)
        s.insert_image(s.rect, stream=taranmis_png(dondur, ek))
        if rotate:
            s.set_rotation(rotate)

    def metinli(satirlar):
        s = doc.new_page(width=595, height=842)
        yazi_ekle(s, satirlar, 72, 100)
        return s

    metinli(["Birinci sayfa yalnızca PDF metnidir.", "Aranan tutanak bu sayfada PDF metninde."])   # 1
    taranmis(ek=bir)                                                                            # 2
    taranmis()                                                                                  # 3
    taranmis(ek=iki)                                                                            # 4
    taranmis(dondur=90, ek=bir, rotate=90)                                                      # 5: ekranda düz
    taranmis(dondur=90, ek=bir)                                                                 # 6: yazı ekranda yan
    metinli(["Yedinci sayfa da yalnızca PDF metnidir."])                                       # 7
    s8 = metinli(["Karışık sayfa: PDF metninde tutanak var.", "Aşağıdaki kaşe bir görseldir."])  # 8
    s8.insert_image(pymupdf.Rect(72, 200, 272, 270), stream=kase_png(["TUTANAK ASLI", "Zabıt Kâtibi"]))
    taranmis()                                                                                  # 9
    taranmis(ek=bir)                                                                            # 10
    taranmis(dondur=180, ek=bir)                                                                # 11: ters
    taranmis()                                                                                  # 12
    yol = os.path.join(klasor, "arama.pdf")
    doc.save(yol, garbage=3, deflate=True)
    doc.close()
    print("Üretildi:", yol)


if __name__ == "__main__":
    uret(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "cikti", "tanima"))
