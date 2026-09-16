# -*- coding: utf-8 -*-
"""FreeText görünüm akışı: sayfa /Rotate değerine göre /Matrix ile telafi (metin ekranda dik görünsün);
yapışkan notlara NoRotate+Print bayrağı."""

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:80])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

yama("core/islemler/notlar.py", [
("""    r = annot.rect
    w, h = max(r.width, 1), max(r.height, 1)
    pad = 2.0""",
 """    r = annot.rect
    # Sayfa döndürülmüşse (/Rotate), görünüm akışını ters yönde döndürerek metni ekranda dik tut
    rot = int(getattr(page, "rotation", 0) or 0) % 360
    if rot in (90, 270):
        w, h = max(r.height, 1), max(r.width, 1)
    else:
        w, h = max(r.width, 1), max(r.height, 1)
    matris = {0: "[1 0 0 1 0 0]", 90: "[0 1 -1 0 0 0]", 180: "[-1 0 0 -1 0 0]", 270: "[0 -1 1 0 0 0]"}[rot]
    pad = 2.0"""),
("""    doc.update_object(ap_xref, "<</Type/XObject/Subtype/Form/FormType 1/BBox[0 0 %.2f %.2f]/Resources<</Font<</F1 %d 0 R>>/ProcSet[/PDF/Text]>>>>" % (w, h, fxref))""",
 """    doc.update_object(ap_xref, "<</Type/XObject/Subtype/Form/FormType 1/BBox[0 0 %.2f %.2f]/Matrix %s/Resources<</Font<</F1 %d 0 R>>/ProcSet[/PDF/Text]>>>>" % (w, h, matris, fxref))"""),
("""        a.set_colors(stroke=renk or (1, 0.82, 0))
        _ortak_bilgi(a, dict(n, konu=n.get("konu") or "Yapışkan Not"))
        a.update()""",
 """        a.set_colors(stroke=renk or (1, 0.82, 0))
        _ortak_bilgi(a, dict(n, konu=n.get("konu") or "Yapışkan Not"))
        a.set_flags(pymupdf.PDF_ANNOT_IS_PRINT | pymupdf.PDF_ANNOT_IS_NO_ZOOM | pymupdf.PDF_ANNOT_IS_NO_ROTATE)
        a.update()"""),
])
