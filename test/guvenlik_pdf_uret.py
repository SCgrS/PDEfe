# Güvenlik testlerinin (test/senaryo24.mjs, test/guvenlik_testi.py) örnek PDF'lerini üretir (0.1.23).
# Kullanım: .venv\Scripts\python.exe test\guvenlik_pdf_uret.py <çıktı klasörü>
#   baglantili.pdf  dört dış bağlantı: https, mailto, büyük harfli FILE: (PyMuPDF bunu Launch değil URI sayar) ve search-ms:
#   notlu.pdf, notlu-imzali-koru.pdf, notlu-imzali-sil.pdf  içeriği GIZLI olan bir not; son ikisi e-imzalı görünür (/SigFlags 3)
import os
import sys

import pymupdf

BAGLANTILAR = [
    ("https://ornek.invalid/belge", "Web bağlantısı"),
    ("mailto:kisi@ornek.invalid", "E-posta bağlantısı"),
    ("FILE:///C:/Windows/System32/calc.exe", "Program bağlantısı"),
    ("search-ms:query=x&crumb=location:\\\\sunucu.invalid\\pay", "Ağ klasörü bağlantısı"),
]


def baglantili(yol):
    doc = pymupdf.open()
    sayfa = doc.new_page(width=595, height=842)
    for i, (uri, yazi) in enumerate(BAGLANTILAR):
        r = pymupdf.Rect(72, 100 + i * 60, 400, 130 + i * 60)
        sayfa.insert_text((r.x0, r.y1 - 8), yazi, fontsize=14)
        sayfa.insert_link({"kind": pymupdf.LINK_URI, "from": r, "uri": uri})
    doc.save(yol)
    doc.close()


GIZLI = "GIZLI-NOT-METNI-4711"


def notlu(yol, imzali=False):
    """Bir not (içeriği GIZLI) taşıyan belge. imzali: katalogda /AcroForm /SigFlags 3 (PDF'e gömülü e-imzası olan belge gibi görünür;
    gerçek imza yok, PDEfe'nin imza algılaması için yeter)."""
    doc = pymupdf.open()
    sayfa = doc.new_page(width=595, height=842)
    sayfa.insert_text((72, 100), "Notlu deneme belgesi", fontsize=14)
    a = sayfa.add_text_annot((100, 150), GIZLI)
    a.set_info(title="Deneme Yazar")
    a.update()
    if imzali:
        af = doc.get_new_xref()
        doc.update_object(af, "<< /Fields [] /SigFlags 3 >>")
        doc.xref_set_key(doc.pdf_catalog(), "AcroForm", "%d 0 R" % af)
    doc.save(yol)
    doc.close()


if __name__ == "__main__":
    klasor = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "cikti", "guvenlik")
    os.makedirs(klasor, exist_ok=True)
    baglantili(os.path.join(klasor, "baglantili.pdf"))
    notlu(os.path.join(klasor, "notlu.pdf"))
    notlu(os.path.join(klasor, "notlu-imzali-koru.pdf"), imzali=True)
    notlu(os.path.join(klasor, "notlu-imzali-sil.pdf"), imzali=True)
    d = pymupdf.open(os.path.join(klasor, "baglantili.pdf"))
    print("baglantili.pdf:", [(l["kind"], l.get("uri")) for l in d[0].get_links()])
