"""Yazdırma sınamalarının örnek PDF'i (0.2.6; test/yazdir_pencere.mjs, test/yazdir_gercek.mjs). Gerçek belge kullanılmaz.

Kullanım: .venv\\Scripts\\python.exe test/yazdir_ornek_uret.py <çıktı.pdf>
Sayfalar (yazdırma yerleşiminin bütün durumları):
  Her sayfanın sağ alt köşesinde mor bir kare var (çıktıda yeri: sayfanın kâğıda hangi yönde konduğu).
  1) A4 dikey: başlık, kırmızı ve mavi dolu kutu (siyah beyaz denetimi), sarı vurgu ve yeşil dolgulu kare not (notları yazdır denetimi)
  2) A4 yatay (842 × 595): dikey kâğıda döndürülerek basılır
  3) A4 dikey, /Rotate 90: görünen ölçüsü yatay, o da döndürülerek basılır
  4) A5 dikey: A4 kâğıda sığdırılınca büyür, gerçek boyutta ortada küçük kalır
"""
import os
import sys

import pymupdf

ARIAL = ("/System/Library/Fonts/Supplemental/Arial.ttf" if sys.platform == "darwin"
         else os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arial.ttf"))


def uret(yol):
    doc = pymupdf.open()
    yazi = {"fontname": "arial", "fontfile": ARIAL} if os.path.exists(ARIAL) else {"fontname": "helv"}

    def sayfa(g, y, no, ad):
        pg = doc.new_page(width=g, height=y)
        pg.insert_text((50, 70), f"Yazdırma örneği — sayfa {no} ({ad})", fontsize=18, **yazi)
        for s in range(8):
            pg.insert_text((50, 110 + s * 22), f"Satır {s + 1}: şçğıöü ŞÇĞİÖÜ deneme metni.", fontsize=11, **yazi)
        # Sağ alt köşede numara ve mor kare: çıktıda morun yeri sayfanın kâğıda hangi yönde konduğunu gösterir (döndürme denetimi)
        pg.insert_text((g - 130, y - 40), f"[{no}]", fontsize=24, **yazi)
        pg.draw_rect(pymupdf.Rect(g - 70, y - 70, g - 30, y - 30), color=(0.8, 0, 0.8), fill=(0.8, 0, 0.8))
        return pg

    p1 = sayfa(595, 842, 1, "A4 dikey")
    p1.draw_rect(pymupdf.Rect(50, 320, 250, 420), color=(0.85, 0, 0.05), fill=(0.85, 0, 0.05))
    p1.draw_rect(pymupdf.Rect(300, 320, 500, 420), color=(0, 0.3, 0.9), fill=(0, 0.3, 0.9))
    vurgu = p1.add_highlight_annot(pymupdf.Rect(50, 100, 300, 114))
    vurgu.set_info(title="Deneme Yazar", content="")
    vurgu.update()
    kare = p1.add_rect_annot(pymupdf.Rect(50, 500, 545, 700))
    kare.set_colors(stroke=(0, 0.6, 0), fill=(0.6, 1, 0.6))
    kare.set_info(title="Deneme Yazar")
    kare.update()
    sayfa(842, 595, 2, "A4 yatay")
    p3 = sayfa(595, 842, 3, "A4 dikey, 90° döndürülmüş")
    p3.set_rotation(90)
    sayfa(420, 595, 4, "A5 dikey")
    try:
        doc.subset_fonts()
    except Exception:
        pass
    doc.save(yol, garbage=3, deflate=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    uret(sys.argv[1])
    print("yazıldı:", sys.argv[1])
