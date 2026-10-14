"""Yazdırma çıktısının (Microsoft Print to PDF'in yazdığı PDF) ölçüsü (0.2.6, test/yazdir_gercek.mjs). Yalnızca sayılar yazar.

Kullanım: .venv\\Scripts\\python.exe test/yazdir_pdf_olc.py <çıktı.pdf>
Çıktı (JSON): { sayfa, sayfalar: [{ g, y (pt), renkli, yesil, mavi, mor (piksel sayısı, 36 dpi), morYer ([x, y], 0–1), gorseller: [{ g, y (piksel), kutu: [x0, y0, x1, y1] (pt) }],
               ozet (sayfanın küçük görüntüsünün özeti: sıra denetimi) }] }
  renkli: doygun (renkli) piksel; yesil: notun yeşil dolgusu (notları yazdır denetimi); mavi: örnekteki mavi kutu.
"""
import hashlib
import json
import sys

import pymupdf


def olc(yol):
    d = pymupdf.open(yol)
    sayfalar = []
    for p in d:
        pix = p.get_pixmap(dpi=36, alpha=False)
        n, s = pix.n, pix.samples
        renkli = yesil = mavi = mor = 0
        mx = my = 0.0
        for i in range(0, len(s), n):
            r, g, b = s[i], s[i + 1], s[i + 2]
            if max(r, g, b) - min(r, g, b) > 40:
                renkli += 1
                if g > r + 40 and g > b + 40:
                    yesil += 1
                if b > r + 60 and b > g + 30:
                    mavi += 1
                if r > 120 and b > 120 and g < 90:
                    mor += 1
                    k = i // n
                    mx += k % pix.width
                    my += k // pix.width
        gorseller = []
        for gi in p.get_image_info():
            k = gi.get("bbox")
            gorseller.append({"g": gi.get("width"), "y": gi.get("height"), "kutu": [round(v, 1) for v in k] if k else None})
        # Mor karenin yeri (sayfaya göre 0–1): yazdir_ornek_uret.py'deki sayfaların sağ alt köşesindeki kare
        mor_yer = [round(mx / mor / pix.width, 2), round(my / mor / pix.height, 2)] if mor else None
        sayfalar.append({"g": round(p.rect.width, 1), "y": round(p.rect.height, 1), "renkli": renkli, "yesil": yesil, "mavi": mavi, "mor": mor, "morYer": mor_yer,
                         "gorseller": gorseller, "ozet": hashlib.md5(p.get_pixmap(dpi=20, alpha=False).samples).hexdigest()[:10]})
    return {"sayfa": d.page_count, "sayfalar": sayfalar}


if __name__ == "__main__":
    print(json.dumps(olc(sys.argv[1]), ensure_ascii=False))
