# -*- coding: utf-8 -*-
# Linux ve macOS paket sınamasının (test/duman_ortak.mjs) dosya ölçümü (0.3.1): Uygulamanın yazdığı PDF, uygulamadan bağımsız olarak PyMuPDF'le okunur. Çekirdeğin kodu kullanılmaz.
# Kullanım: python -X utf8 -I test/duman_olc.py <komut> <pdf> [<png ön eki>]     Çıktı: JSON.
#   not    Yazı notları: İçerik, görünümden okunan yazı, görünümün yazı tipleri. İlk sayfanın görüntüsü.
#   form   Form alanları: Ad, tür, değer, /AS, görünümün yazı tipleri. Görünümler sayfaya işlenince (bake) okunan yazı. Sayfaların görüntüsü.
#   xfa    XFA verisinin (datasets) yaprak değerleri: Ad → değerler.
#   duz    Düz PDF: Sayfa boyutları, satırlar ve kutuları, yazı tipleri. Sayfaların görüntüsü.
#   murekkep <png>            Görüntüdeki koyu piksellerin dikey yayılımı (yazının üstü kesilmiş mi).
#   duz-murekkep <pdf> <metin>  Metni içeren satırların mürekkep yüksekliği.
import json
import re
import sys
import xml.etree.ElementTree as ET

import pymupdf

sys.stdout.reconfigure(encoding="utf-8")


def ap_fontlari(d, xref):
    """Notun ya da alanın görünümündeki yazı tiplerinin adları (bütün durumlar)."""
    tur, ap = d.xref_get_key(xref, "AP/N")
    gorunumler = [int(x) for x in re.findall(r"(\d+) 0 R", ap)] if tur in ("xref", "dict") else []
    adlar = set()
    for x in gorunumler:
        tur_f, f = d.xref_get_key(x, "Resources/Font")
        if tur_f == "xref":
            f = d.xref_object(int(f.split()[0]), compressed=True)
        for y in re.findall(r"(\d+) 0 R", f or ""):
            t, ad = d.xref_get_key(int(y), "BaseFont")
            if t == "name":
                adlar.add(ad.lstrip("/"))
    return sorted(adlar)


def goruntuler(d, on_ek):
    if on_ek:
        for p in d:
            p.get_pixmap(dpi=110, annots=True).save("%s-%d.png" % (on_ek, p.number + 1))


def not_olc(d, on_ek):
    sonuc = []
    for p in d:
        for a in p.annots() or []:
            if a.type[1] == "FreeText":
                sonuc.append({"icerik": a.info.get("content"), "gorunum": p.get_textbox(a.rect).replace("\n", " ").strip(), "fontlar": ap_fontlari(d, a.xref), "sayfa": p.number + 1})
    goruntuler(d, on_ek)
    return {"notlar": sonuc}


def form_olc(d, on_ek):
    alanlar = []
    for p in d:
        for w in p.widgets() or []:
            alanlar.append({"ad": w.field_name, "tur": w.field_type_string, "deger": w.field_value, "durum": d.xref_get_key(w.xref, "AS")[1], "sayfa": p.number + 1,
                            "fontlar": ap_fontlari(d, w.xref)})
    goruntuler(d, on_ek)
    onarildi = d.is_repaired
    sayfa = d.page_count
    d.bake(annots=False, widgets=True)
    return {"alanlar": alanlar, "onarildi": onarildi, "sayfa": sayfa, "metin": "\n".join(p.get_text() for p in d)}


def xfa_olc(d, _on_ek):
    tur, dizi = d.xref_get_key(d.pdf_catalog(), "AcroForm/XFA")
    paketler = dict(re.findall(r"\(((?:[^()\\]|\\.)*)\)\s*(\d+)\s+0\s+R", dizi)) if tur == "array" else {}
    kok = ET.fromstring(d.xref_stream(int(paketler["datasets"])))
    veri = next(e for e in kok if e.tag.endswith("}data") or e.tag == "data")
    degerler = {}

    def yuru(e):
        k = list(e)
        if k:
            for x in k:
                yuru(x)
        else:
            degerler.setdefault(e.tag.rsplit("}", 1)[-1], []).append(e.text or "")

    for x in veri:
        yuru(x)
    return {"degerler": degerler, "onarildi": d.is_repaired, "sayfa": d.page_count}


def duz_olc(d, on_ek):
    sayfalar = []
    fontlar = set()
    for p in d:
        satirlar = []
        for b in p.get_text("rawdict")["blocks"]:
            for l in b.get("lines", []):
                harfler = [h for x in l["spans"] for h in x["chars"]]
                t = "".join(h["c"] for h in harfler)
                dolu = [h for h in harfler if h["c"].strip()]   # satır sonundaki boşluk kutuya sayılmaz: İki yana hizalı satırda kenarı aşar, çizilmez
                if dolu:
                    satirlar.append({"t": t, "x0": min(h["bbox"][0] for h in dolu), "x1": max(h["bbox"][2] for h in dolu), "y0": l["bbox"][1], "y1": l["bbox"][3]})
        for f in p.get_fonts(full=True):
            fontlar.add(f[3].split("+")[-1])
        sayfalar.append({"g": p.rect.width, "b": p.rect.height, "satir": satirlar})
    goruntuler(d, on_ek)
    return {"sayfalar": sayfalar, "fontlar": sorted(fontlar)}


def murekkep(pix):
    """Görüntüdeki koyu piksellerin dikey yayılımı (satır): Yazının üstü ya da altı kesilmiş mi."""
    s, n, g, b = pix.samples, pix.n, pix.width, pix.height
    satirlar = [y for y in range(b) if any(s[y * pix.stride + x * n] < 140 for x in range(g))]
    return {"ust": satirlar[0], "alt": satirlar[-1], "yuk": satirlar[-1] - satirlar[0] + 1, "g": g, "b": b} if satirlar else {"yuk": 0, "g": g, "b": b}


def duz_murekkep(d, metin):
    """Düz PDF'te metni içeren satırların mürekkep yüksekliği (pt, 400 dpi'de ölçülür)."""
    sonuc = []
    for p in d:
        for b in p.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                t = "".join(x["text"] for x in l["spans"])
                if metin in t:
                    r = pymupdf.Rect(l["bbox"]) + (0, -1.5, 0, 1.5)
                    m = murekkep(p.get_pixmap(dpi=400, clip=r, colorspace=pymupdf.csGRAY))
                    sonuc.append({"t": t, "font": l["spans"][-1]["font"], "yuk": round(m["yuk"] * 72 / 400, 2)})
    return {"satirlar": sonuc}


komut = sys.argv[1]
if komut == "murekkep":   # <png>
    print(json.dumps(murekkep(pymupdf.Pixmap(pymupdf.csGRAY, pymupdf.Pixmap(sys.argv[2])))))
elif komut == "duz-murekkep":   # <pdf> <metin>
    print(json.dumps(duz_murekkep(pymupdf.open(sys.argv[2], filetype="pdf"), sys.argv[3]), ensure_ascii=False))
else:
    KOMUTLAR = {"not": not_olc, "form": form_olc, "xfa": xfa_olc, "duz": duz_olc}
    print(json.dumps(KOMUTLAR[komut](pymupdf.open(sys.argv[2], filetype="pdf"), sys.argv[3] if len(sys.argv) > 3 else ""), ensure_ascii=False))
