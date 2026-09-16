# -*- coding: utf-8 -*-
"""Not (annotation) yazma/düzenleme: standart PDF notları; referans okuyucuda birebir görünür.

- Highlight: QuadPoints + görünüm akışı (PyMuPDF üretir)
- Text (yapışkan not): /Comment simgesi, Popup, yanıtlar (IRT)
- FreeText: /DA + /DS + kendi ürettiğimiz görünüm akışı; Windows'taki gerçek font (Segoe UI,
  Arial, Times New Roman, Calibri) alt kümesi gömülür, böylece ş ğ İ ı ç ö ü her yerde doğru çıkar.
"""
import io
import os
import re
import time
import shutil
import tempfile

import pymupdf

FONT_KLASORU = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
FONT_DOSYALARI = {
    ("Segoe UI", False): "segoeui.ttf", ("Segoe UI", True): "segoeuib.ttf",
    ("Arial", False): "arial.ttf", ("Arial", True): "arialbd.ttf",
    ("Times New Roman", False): "times.ttf", ("Times New Roman", True): "timesbd.ttf",
    ("Calibri", False): "calibri.ttf", ("Calibri", True): "calibrib.ttf",
}
# Gömülecek glif dağarcığı: ASCII, Latin-1, Latin Genişletilmiş-A (Türkçe dahil), genel noktalama, TL işareti
DAGARCIK = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x11E, 0x11F, 0x130, 0x131, 0x15E, 0x15F, 0x152, 0x153, 0x178]
            + list(range(0x2010, 0x2027)) + [0x20AC, 0x20BA, 0x2122, 0x2030, 0x2032, 0x2033])

_font_onbellek = {}      # (aile, kalin) -> (Font, altkume_bytes)


def _renk(hex_):
    """'#rrggbb' -> (r, g, b) 0..1"""
    if not hex_:
        return None
    h = hex_.lstrip("#")
    if len(h) != 6:
        return None
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _hex(rgb):
    if not rgb:
        return None
    return "#%02x%02x%02x" % tuple(int(round(c * 255)) for c in rgb[:3])


def _pdf_metin(s):
    """PDF dize sabiti için kaçış (parantezli); Latin dışı karakterler için UTF-16BE hex."""
    if all(ord(c) < 128 for c in s):
        return "(" + s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ")"
    return "<FEFF" + s.encode("utf-16-be").hex().upper() + ">"


def _pdf_tarih(ts=None):
    t = time.localtime(ts)
    ofs = -time.altzone if t.tm_isdst else -time.timezone
    isaret = "+" if ofs >= 0 else "-"
    ofs = abs(ofs)
    return time.strftime("D:%Y%m%d%H%M%S", t) + "%s%02d'%02d'" % (isaret, ofs // 3600, (ofs % 3600) // 60)


# ---------------------------------------------------------------- font gömme
def _font_yukle(aile, kalin):
    """Windows fontunu yükler ve Türkçe dağarcıklı, GID koruyan bir alt küme üretir."""
    anahtar = (aile, bool(kalin))
    if anahtar in _font_onbellek:
        return _font_onbellek[anahtar]
    dosya = FONT_DOSYALARI.get(anahtar) or FONT_DOSYALARI.get(("Arial", bool(kalin)))
    yol = os.path.join(FONT_KLASORU, dosya)
    if not os.path.exists(yol):
        yol = os.path.join(FONT_KLASORU, "arial.ttf")
    font = pymupdf.Font(fontfile=yol)
    altkume = None
    try:
        import logging
        logging.getLogger("fontTools").setLevel(logging.ERROR)
        from fontTools import subset
        from fontTools.ttLib import TTFont
        tt = TTFont(yol)
        secenek = subset.Options()
        secenek.retain_gids = True          # GID'ler değişmesin (Font.has_glyph ile aynı numaralar)
        secenek.name_IDs = ["*"]
        secenek.notdef_outline = True
        secenek.layout_features = []
        secenek.hinting = False
        alt = subset.Subsetter(secenek)
        alt.populate(unicodes=DAGARCIK)
        alt.subset(tt)
        buf = io.BytesIO()
        tt.save(buf)
        altkume = buf.getvalue()
    except Exception:
        altkume = open(yol, "rb").read()
    _font_onbellek[anahtar] = (font, altkume, yol)
    return _font_onbellek[anahtar]


def _font_xref_al(doc, page, aile, kalin):
    """Belgede bu aile/stil için gömülü PDEfe fontunun xref'ini döndürür; yoksa gömer.
    Kayıt, katalogdaki /PDEfeFonts sözlüğünde tutulur."""
    anahtar = re.sub(r"[^A-Za-z0-9]", "", aile) + ("B" if kalin else "R")
    katalog = doc.pdf_catalog()
    tur, deger = doc.xref_get_key(katalog, "PDEfeFonts/" + anahtar)
    if tur == "xref":
        xref = int(deger.split()[0])
        if 0 < xref < doc.xref_length() and doc.xref_get_key(xref, "Type")[1] == "/Font":
            return xref
    font, altkume, _ = _font_yukle(aile, kalin)
    xref = page.insert_font(fontname="PDEfe" + anahtar, fontbuffer=altkume)
    tur, mevcut = doc.xref_get_key(katalog, "PDEfeFonts")
    girdiler = dict(re.findall(r"/(\w+)\s+(\d+)\s+0\s+R", mevcut)) if tur == "dict" else {}
    girdiler[anahtar] = str(xref)
    doc.xref_set_key(katalog, "PDEfeFonts", "<<" + " ".join("/%s %s 0 R" % kv for kv in girdiler.items()) + ">>")
    return xref


def _satirlara_bol(metin, font, boyut, genislik):
    """Kelime sınırından satır kırma; sığmayan kelimeleri karakterden böler."""
    satirlar = []
    for paragraf in metin.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        kelimeler = paragraf.split(" ")
        cur = ""
        for k in kelimeler:
            aday = (cur + " " + k) if cur else k
            if font.text_length(aday, fontsize=boyut) <= genislik or not cur:
                if font.text_length(aday, fontsize=boyut) > genislik and not cur:
                    # tek kelime sığmıyor: karakterden böl
                    parca = ""
                    for ch in k:
                        if font.text_length(parca + ch, fontsize=boyut) > genislik and parca:
                            satirlar.append(parca)
                            parca = ""
                        parca += ch
                    cur = parca
                else:
                    cur = aday
            else:
                satirlar.append(cur)
                cur = k
        satirlar.append(cur)
    return satirlar


def _gid_hex(font, metin):
    out = []
    for ch in metin:
        gid = font.has_glyph(ord(ch))
        if not gid and ch != " ":
            gid = font.has_glyph(ord("?"))
        out.append("%04X" % (gid or 0))
    return "".join(out)


def freetext_gorunum_yaz(doc, page, annot, metin, stil):
    """FreeText notu için görünüm akışı üretir ve /AP /N olarak bağlar.
    stil: {tip, boyut, renk, arka, kalin, altiCizili, kenarlik, kenarlikRengi}"""
    aile = stil.get("tip") or "Segoe UI"
    kalin = bool(stil.get("kalin"))
    boyut = float(stil.get("boyut") or 12)
    renk = _renk(stil.get("renk")) or (0, 0, 0)
    arka = _renk(stil.get("arka"))
    kenarlik = bool(stil.get("kenarlik"))
    kenar_renk = _renk(stil.get("kenarlikRengi")) or renk
    font, _, _ = _font_yukle(aile, kalin)
    fxref = _font_xref_al(doc, page, aile, kalin)
    r = annot.rect
    w, h = max(r.width, 1), max(r.height, 1)
    pad = 2.0
    satirlar = _satirlara_bol(metin, font, boyut, w - 2 * pad)
    satir_yuk = boyut * 1.2
    ops = ["q"]
    if arka:
        ops.append("%.3f %.3f %.3f rg 0 0 %.2f %.2f re f" % (arka[0], arka[1], arka[2], w, h))
    if kenarlik:
        ops.append("%.3f %.3f %.3f RG 1 w 0.5 0.5 %.2f %.2f re S" % (kenar_renk[0], kenar_renk[1], kenar_renk[2], w - 1, h - 1))
    ops.append("BT /F1 %.2f Tf %.3f %.3f %.3f rg" % (boyut, renk[0], renk[1], renk[2]))
    y = h - pad - boyut * font.ascender
    alti = []
    for s in satirlar:
        ops.append("1 0 0 1 %.2f %.2f Tm <%s> Tj" % (pad, y, _gid_hex(font, s)))
        if stil.get("altiCizili") and s.strip():
            alti.append((pad, y - boyut * 0.12, pad + font.text_length(s, fontsize=boyut)))
        y -= satir_yuk
    ops.append("ET")
    if alti:
        ops.append("%.3f %.3f %.3f RG %.2f w" % (renk[0], renk[1], renk[2], max(0.5, boyut * 0.06)))
        for x0, yy, x1 in alti:
            ops.append("%.2f %.2f m %.2f %.2f l S" % (x0, yy, x1, yy))
    ops.append("Q")
    icerik = "\n".join(ops).encode("latin-1")
    # Form XObject
    ap_xref = doc.get_new_xref()
    doc.update_object(ap_xref, "<</Type/XObject/Subtype/Form/FormType 1/BBox[0 0 %.2f %.2f]/Resources<</Font<</F1 %d 0 R>>/ProcSet[/PDF/Text]>>>>" % (w, h, fxref))
    doc.update_stream(ap_xref, icerik)
    doc.xref_set_key(annot.xref, "AP", "<</N %d 0 R>>" % ap_xref)
    # Referans okuyucu için varsayılan görünüm bilgileri
    doc.xref_set_key(annot.xref, "DA", _pdf_metin("/Helv %.1f Tf %.3f %.3f %.3f rg" % (boyut, renk[0], renk[1], renk[2])))
    ds = "font: %s'%s' %.1fpt; color: %s; text-align: left" % ("bold " if kalin else "", aile, boyut, _hex(renk))
    doc.xref_set_key(annot.xref, "DS", _pdf_metin(ds))
    # PDEfe stil kaydı (yeniden düzenlerken aynı biçimi kullanmak için)
    doc.xref_set_key(annot.xref, "PDEfe", "<</Tip %s /Boyut %.1f /Renk %s /Arka %s /Kalin %s /Alti %s /Kenar %s>>" % (
        _pdf_metin(aile), boyut, _pdf_metin(_hex(renk)), _pdf_metin(_hex(arka) if arka else ""), "true" if kalin else "false",
        "true" if stil.get("altiCizili") else "false", "true" if kenarlik else "false"))


def pdefe_stil_oku(doc, xref):
    """Notun /PDEfe stil sözlüğünü okur (yoksa None)."""
    tur, _ = doc.xref_get_key(xref, "PDEfe")
    if tur != "dict":
        return None
    def s(k):
        t, v = doc.xref_get_key(xref, "PDEfe/" + k)
        if t == "string":
            return v
        if t == "float" or t == "int":
            return float(v)
        if t == "bool":
            return v == "true"
        return None
    return {"tip": s("Tip"), "boyut": s("Boyut"), "renk": s("Renk"), "arka": s("Arka") or None,
            "kalin": bool(s("Kalin")), "altiCizili": bool(s("Alti")), "kenarlik": bool(s("Kenar"))}


# ---------------------------------------------------------------- not işlemleri
def _annot_bul(page, xref):
    for a in page.annots():
        if a.xref == xref:
            return a
    raise KeyError("not bulunamadı: xref %s" % xref)


def _popup_rect(page, annot):
    r = annot.rect
    pw = page.rect.width
    return pymupdf.Rect(pw, r.y0, pw + 204, r.y0 + 114)


def _ortak_bilgi(annot, n):
    bilgi = {}
    if n.get("yazar") is not None:
        bilgi["title"] = n["yazar"]
    if n.get("icerik") is not None:
        bilgi["content"] = n["icerik"]
    if n.get("konu"):
        bilgi["subject"] = n["konu"]
    if bilgi:
        annot.set_info(**bilgi)


def not_ekle(doc, page, n):
    """n: {tur, rect, quads, icerik, yazar, renk, opaklik, simge, yazi, yanitXref, konu}"""
    tur = n["tur"]
    renk = _renk(n.get("renk"))
    if tur == "Highlight":
        quads = [pymupdf.Rect(*q) for q in n["quads"]]
        a = page.add_highlight_annot(quads)
        a.set_colors(stroke=renk or (1, 0.92, 0.23))
        a.set_opacity(float(n.get("opaklik", 0.4)))
        _ortak_bilgi(a, dict(n, konu=n.get("konu") or "Vurgu"))
        a.update()
        a.set_popup(_popup_rect(page, a))
    elif tur == "Text":
        r = n["rect"]
        a = page.add_text_annot((r[0], r[1]), n.get("icerik") or "", icon=n.get("simge") or "Comment")
        a.set_colors(stroke=renk or (1, 0.82, 0))
        _ortak_bilgi(a, dict(n, konu=n.get("konu") or "Yapışkan Not"))
        a.update()
        if n.get("yanitXref"):
            a.set_irt_xref(int(n["yanitXref"]))
            doc.xref_set_key(a.xref, "RT", "/R")
        else:
            a.set_popup(_popup_rect(page, a))
    elif tur == "FreeText":
        r = pymupdf.Rect(*n["rect"])
        stil = n.get("yazi") or {}
        a = page.add_freetext_annot(r, n.get("icerik") or "", fontsize=float(stil.get("boyut") or 12), fontname="helv",
                                    text_color=_renk(stil.get("renk")) or (0, 0, 0), fill_color=_renk(stil.get("arka")))
        _ortak_bilgi(a, dict(n, konu=n.get("konu") or "Yazı"))
        a.update()
        freetext_gorunum_yaz(doc, page, a, n.get("icerik") or "", stil)
    else:
        raise ValueError("desteklenmeyen not türü: %s" % tur)
    # Tarihler
    doc.xref_set_key(a.xref, "M", _pdf_metin(_pdf_tarih()))
    doc.xref_set_key(a.xref, "CreationDate", _pdf_metin(_pdf_tarih()))
    if n.get("ad"):
        doc.xref_set_key(a.xref, "NM", _pdf_metin(n["ad"]))
    return a.xref


def not_guncelle(doc, page, n):
    a = _annot_bul(page, int(n["xref"]))
    tur = a.type[1]
    if n.get("rect") and tur != "Highlight":
        a.set_rect(pymupdf.Rect(*n["rect"]))
    if n.get("renk") and tur in ("Highlight", "Text", "Underline", "StrikeOut", "Squiggly", "Square", "Circle", "Line", "Ink"):
        a.set_colors(stroke=_renk(n["renk"]))
    if n.get("opaklik") is not None:
        a.set_opacity(float(n["opaklik"]))
    _ortak_bilgi(a, n)
    if tur == "FreeText":
        stil = n.get("yazi") or pdefe_stil_oku(doc, a.xref) or {}
        a.update()
        freetext_gorunum_yaz(doc, page, a, n.get("icerik") if n.get("icerik") is not None else (a.info.get("content") or ""), stil)
    elif tur in ("Highlight", "Text", "Underline", "StrikeOut", "Squiggly"):
        a.update()
    doc.xref_set_key(a.xref, "M", _pdf_metin(_pdf_tarih()))
    return a.xref


def not_sil(doc, page, xref):
    a = _annot_bul(page, int(xref))
    # Yanıtları da sil
    yanitlar = [b for b in page.annots() if getattr(b, "irt_xref", 0) == a.xref]
    for b in yanitlar:
        page.delete_annot(b)
    page.delete_annot(a)


def y_notlar_kaydet(p):
    """Değişiklik listesini uygular ve kaydeder.
    p: {yol, hedef, islemler: [{islem:'ekle'|'guncelle'|'sil', id, not:{...}}], artimli}
    Döner: {xrefler: {id: xref}, boyut}"""
    from pdefe_core import onbellek  # döngüsel içe aktarma yerine çalışma zamanında
    yol, hedef = p["yol"], p.get("hedef") or p["yol"]
    islemler = p.get("islemler") or []
    artimli = bool(p.get("artimli", True)) and os.path.abspath(hedef) == os.path.abspath(yol)
    onbellek.birak(yol)
    doc = pymupdf.open(yol)
    if doc.is_encrypted:
        raise PermissionError("Belge şifreli; kaydedilemiyor.")
    xrefler = {}
    for op in islemler:
        n = op.get("not") or {}
        page = doc[int(n.get("sayfa", op.get("sayfa", 1))) - 1]
        if op["islem"] == "ekle":
            if n.get("yanitId") and n["yanitId"] in xrefler:
                n["yanitXref"] = xrefler[n["yanitId"]]
            xrefler[op["id"]] = not_ekle(doc, page, n)
        elif op["islem"] == "guncelle":
            not_guncelle(doc, page, n)
            xrefler[op["id"]] = int(n["xref"])
        elif op["islem"] == "sil":
            not_sil(doc, page, n.get("xref") or op.get("xref"))
    try:
        if artimli:
            try:
                doc.save(yol, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP, deflate=True)
            except (ValueError, RuntimeError):
                artimli = False
        if not artimli:
            gecici = hedef + ".pdefe-tmp"
            doc.save(gecici, garbage=1, deflate=True)
            doc.close()
            doc = None
            os.replace(gecici, hedef)
    except PermissionError as e:
        raise PermissionError("Dosya yazılamadı; başka bir programda açık olabilir. (%s)" % e)
    finally:
        if doc is not None:
            doc.close()
    return {"xrefler": xrefler, "boyut": os.path.getsize(hedef), "artimli": artimli}


def y_freetext_stil(p):
    """Bir FreeText notunun düzenlenebilir stil bilgisini döndürür (PDEfe kaydı ya da DA'dan)."""
    from pdefe_core import onbellek
    doc = onbellek.al(p["yol"])
    page = doc[int(p["sayfa"]) - 1]
    a = _annot_bul(page, int(p["xref"]))
    stil = pdefe_stil_oku(doc, a.xref)
    if stil:
        return {"stil": stil, "icerik": a.info.get("content") or ""}
    # DA: "/Helv 12 Tf 0 0 1 rg"
    _, da = doc.xref_get_key(a.xref, "DA")
    boyut, renk = 12.0, "#000000"
    m = re.search(r"([\d.]+)\s+Tf", da or "")
    if m:
        boyut = float(m.group(1)) or 12.0
    m = re.search(r"([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg", da or "")
    if m:
        renk = _hex((float(m.group(1)), float(m.group(2)), float(m.group(3))))
    else:
        m = re.search(r"([\d.]+)\s+g\b", da or "")
        if m:
            g = float(m.group(1)); renk = _hex((g, g, g))
    arka = _hex(a.colors.get("fill")) if a.colors.get("fill") else None
    return {"stil": {"tip": "Segoe UI", "boyut": boyut, "renk": renk, "arka": arka, "kalin": False, "altiCizili": False, "kenarlik": bool(a.border.get("width"))},
            "icerik": a.info.get("content") or ""}


def y_baglantilar(p):
    from pdefe_core import onbellek
    doc = onbellek.al(p["yol"])
    page = doc[int(p["sayfa"]) - 1]
    sonuc = []
    for l in page.get_links():
        r = l.get("from")
        d = {"rect": [r.x0, r.y0, r.x1, r.y1], "tur": l.get("kind")}
        if l.get("kind") == pymupdf.LINK_GOTO:
            d["sayfa"] = l.get("page", -1) + 1
            to = l.get("to")
            if to is not None:
                d["y"] = float(to.y)
        elif l.get("kind") == pymupdf.LINK_URI:
            d["uri"] = l.get("uri")
        elif l.get("kind") == pymupdf.LINK_NAMED:
            d["ad"] = l.get("name")
        sonuc.append(d)
    return {"baglantilar": sonuc}


def y_form_gorunum(p):
    """Sayfadaki form alanlarını (Widget) saydam PNG olarak çizer; alan yoksa None."""
    from pdefe_core import onbellek, png_base64
    doc = onbellek.al(p["yol"])
    page = doc[int(p["sayfa"]) - 1]
    if not any(True for _ in page.widgets()):
        return {"png": None}
    olcek = float(p.get("olcek", 1.0))
    from pymupdf import mupdf
    mat = pymupdf.Matrix(olcek, olcek)
    irect = (page.rect * mat).irect
    pix = pymupdf.Pixmap(pymupdf.csRGB, irect, True)
    mupdf.fz_clear_pixmap(pix.this)          # saydam siyah (clear_with alfayı 255 yapıyor)
    dev = mupdf.fz_new_draw_device(mupdf.FzMatrix(), pix.this)
    try:
        mupdf.fz_run_page_widgets(page.this, dev, mupdf.FzMatrix(olcek, 0, 0, olcek, 0, 0), mupdf.FzCookie())
        mupdf.fz_close_device(dev)
    finally:
        pass
    return {"png": png_base64(pix), "genislik": pix.width, "yukseklik": pix.height}


def kaydol(yontemler):
    yontemler["notlar_kaydet"] = y_notlar_kaydet
    yontemler["freetext_stil"] = y_freetext_stil
    yontemler["baglantilar"] = y_baglantilar
    yontemler["form_gorunum"] = y_form_gorunum
