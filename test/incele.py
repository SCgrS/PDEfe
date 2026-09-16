# -*- coding: utf-8 -*-
"""Test PDF'lerini inceler: sayfa, font, not, yer imi, görsel, metin örneği.
Kullanım: python test/incele.py <klasör veya dosya>... [--png <çıktı klasörü>]
"""
import sys, os, json, re
import pymupdf

TR = set("çğıöşüÇĞİÖŞÜ")

def incele(yol, png_dir=None):
    r = {"dosya": os.path.basename(yol), "boyut_kb": round(os.path.getsize(yol) / 1024, 1)}
    try:
        doc = pymupdf.open(yol)
    except Exception as e:
        r["hata"] = str(e)
        return r
    r["sayfa"] = doc.page_count
    r["sifreli"] = doc.is_encrypted
    r["pdf"] = doc.metadata.get("format")
    r["uretici"] = (doc.metadata.get("producer") or "")[:60]
    r["olusturan"] = (doc.metadata.get("creator") or "")[:60]
    r["yerimi"] = len(doc.get_toc())
    fontlar = {}
    notlar = []
    gorsel = 0
    tr_var = False
    metin_uzunluk = 0
    ornek = ""
    for i, sayfa in enumerate(doc):
        if i < 50:
            for f in sayfa.get_fonts(full=True):
                xref, ext, ftype, ad, ref, enc = f[:6]
                gomulu = ext not in ("n/a", "")
                fontlar[ad] = (ftype, "gömülü" if gomulu else "GÖMÜLÜ DEĞİL", enc)
            gorsel += len(sayfa.get_images())
        for a in sayfa.annots():
            notlar.append({"sayfa": i + 1, "tur": a.type[1], "yazar": a.info.get("title"),
                           "icerik": (a.info.get("content") or "")[:60], "ap": a.has_ap if hasattr(a, "has_ap") else None})
        if i < 5:
            t = sayfa.get_text()
            metin_uzunluk += len(t)
            if not tr_var and any(c in TR for c in t):
                tr_var = True
            if i == 0:
                ornek = re.sub(r"\s+", " ", t)[:220]
    r["sayfa_boyutu"] = f"{doc[0].rect.width:.0f}x{doc[0].rect.height:.0f}" if doc.page_count else None
    r["dondurme"] = doc[0].rotation if doc.page_count else None
    r["fontlar"] = fontlar
    r["gorsel_ilk50"] = gorsel
    r["turkce_karakter"] = tr_var
    r["metin_var"] = metin_uzunluk > 20
    r["ornek"] = ornek
    r["not_sayisi"] = len(notlar)
    r["notlar"] = notlar[:40]
    if png_dir and doc.page_count:
        os.makedirs(png_dir, exist_ok=True)
        pix = doc[0].get_pixmap(dpi=60)
        pix.save(os.path.join(png_dir, os.path.splitext(os.path.basename(yol))[0][:40] + ".png"))
    doc.close()
    return r

def main():
    args = sys.argv[1:]
    png_dir = None
    if "--png" in args:
        k = args.index("--png"); png_dir = args[k + 1]; del args[k:k + 2]
    dosyalar = []
    for a in args:
        if os.path.isdir(a):
            dosyalar += [os.path.join(a, f) for f in sorted(os.listdir(a)) if f.lower().endswith(".pdf")]
        else:
            dosyalar.append(a)
    for d in dosyalar:
        r = incele(d, png_dir)
        print(json.dumps(r, ensure_ascii=False, indent=1))
        print("-" * 70)

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
