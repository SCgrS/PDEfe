# -*- coding: utf-8 -*-
"""Etkileşimli form alanları (AcroForm, 0.3.1).

- form_alanlari: sayfanın widget'larının bilgisi (alan adı, tür, dosyadaki değer, seçenekler, biçim), Tab sırasıyla.
- form_gorunum: form katmanı widget widget çizilir: her widget'ın şimdiki görünümü (saydam PNG) ve onay kutusu / seçenek düğmesinde öbür
  durumunun görünümü (renderer tıklamada çekirdeği beklemeden değiştirir). Kaydedilmemiş değerler (degerler) dosyanın bellekteki ayrı bir
  kopyasına (çalışma belgesi) yazılıp oradan çizilir: ekranda görülen, kaydedilecek ve yazdırılacak görünümün aynısıdır.
- degerleri_uygula: değerleri alanlara yazar (/V, /AS, /I) ve yazı ile liste alanlarının görünüm akışını (/AP) PDEfe üretir. MuPDF'in
  ürettiği görünüm kullanılmaz: 1.28'de tek satırlı yazının taban çizgisi alanın altına düşüyor (yazının üst yarısı görünüyor), ortaya ve
  sağa hizalı ya da yazı boyu otomatik (0) alanda hiçbir şey çizilmiyor, her alan için bütün yazı tipini (~55 KB) gömüyor (ölçüm PLAN.md
  "Revizyon 0.3.1"). Yazı, FreeText'teki gibi Windows yazı tipinin GID koruyan alt kümesiyle (notlar._font_yukle) yazılır: Türkçe harfler
  (İ Ğ Ş ı ğ ş) her okuyucuda doğru çıkar. Dosyayı notlar._font_dosyasi seçer: Windows'ta ve macOS'ta yazı tipi klasöründen, Linux'ta
  fontconfig'in seçtiği aynı aile ya da ölçüleri aynı eşi (islemler/linux.py yazi_tipi_dosyasi: Arial → Liberation Sans / Arimo, Times New
  Roman → Liberation Serif / Tinos, Courier New → Liberation Mono / Cousine, eşi yoksa Arial'in eşi, o da yoksa fontconfig'in seçtiği
  TrueType). Türkçe harfler gömülen alt kümede (notlar.DAGARCIK). Yazı tipi sayfaya ve kataloğa yazılmaz (e-imzalı belgede artımlı kayıt yalnızca alanlara ve
  görünümlere dokunsun), daha önce gömülmüşse (/PDEfeFonts ya da önceki form görünümleri) yeniden kullanılır.
- Kaydetme notlar.y_notlar_kaydet (artımlı) ve yapisal.y_yapisal_kaydet (kaynak belgeye uygulanıp sayfayla kopyalanır) içinde, yazdırma
  pdefe_core.y_sayfa_goruntu içinde aynı degerleri_uygula ile.
"""
import base64
import hashlib
import json
import os
import re
import threading

import pymupdf
from pymupdf import mupdf

from . import notlar

# Alan bayrakları (/Ff)
FF_SALT_OKUNUR = 1 << 0
FF_GEREKLI = 1 << 1
FF_COK_SATIR = 1 << 12
FF_PAROLA = 1 << 13
FF_KAPANMAZ = 1 << 14        # seçenek düğmesi: seçili olana tıklayınca kalkmaz (NoToggleToOff)
FF_SECENEK = 1 << 15         # seçenek düğmesi (radio)
FF_ITME = 1 << 16            # itme düğmesi
FF_ACILIR = 1 << 17          # açılır liste (combo)
FF_DUZENLENEBILIR = 1 << 18  # açılır listeye yazılabilir
FF_COKLU_SECIM = 1 << 21
FF_KAYDIRMA_YOK = 1 << 23
FF_TARAK = 1 << 24           # comb: en çok uzunluk kadar eşit hücre
FF_BIRLIKTE = 1 << 25        # seçenek düğmesi: aynı durum adlı düğmeler birlikte açılır (RadiosInUnison)
# Not bayrakları (/F)
F_GIZLI = 1 << 1
F_YAZDIR = 1 << 2
F_GORUNMEZ = 1 << 5          # NoView
F_SALT_OKUNUR = 1 << 6
F_ICERIK_KILITLI = 1 << 9    # LockedContents

EN_COK_DEGER = 2000          # bir istekte en çok alan değeri
EN_UZUN_METIN = 20000        # bir değerin en çok karakteri
EN_COK_SECIM = 1000          # çok seçimli listede en çok seçili öğe
EN_COK_WIDGET = 5000         # bir sayfada çizilen en çok widget (bozuk ya da kötü niyetli belge çekirdeği uzun süre tutmasın)
SECILI_RENK = (0.6, 0.75, 0.85)      # liste kutusunda seçili satırın zemini (PDF okuyucularının yaygın rengi)
LISTE_SATIRI = 1.15                  # liste kutusunun satır yüksekliği (yazı boyunun katı); renderer'daki örtü aynı ölçüyü kullanır
OTOMATIK_BOY_KATI = 1.35             # yazı boyu otomatik (0) tek satırlı alanda yazı boyu = iç yükseklik / bu kat
OTOMATIK_BOY_EN_AZ = 4.0
COK_SATIR_OTOMATIK = 12.0            # yazı boyu otomatik çok satırlı alan ve liste kutusu bu boydan başlar
IC_PAY = 2.0                         # yazının kenarlıktan uzaklığı (pt)

TURLER = ("metin", "onay", "secenek", "acilir", "liste", "imza", "dugme")


# ---------------------------------------------------------------- PDF nesnesi yardımcıları (MuPDF)
def _pdf(doc):
    return pymupdf._as_pdf_document(doc)


def _var(o):
    return o is not None and o.m_internal is not None and not mupdf.pdf_is_null(o)


def _al(o, ad):
    if not _var(o):
        return None
    v = mupdf.pdf_dict_gets(o, ad)
    return v if _var(v) else None


def _dolayli(doc, xref):
    return mupdf.pdf_new_indirect(_pdf(doc), int(xref), 0)


def _zincir(o):
    """Widget'tan köke /Parent zinciri (widget dahil). Döngüye ve aşırı derinliğe karşı en çok 32 halka."""
    sonuc, gorulen = [], set()
    while _var(o) and len(sonuc) < 32:
        n = mupdf.pdf_to_num(o)
        if n:
            if n in gorulen:
                break
            gorulen.add(n)
        sonuc.append(o)
        o = mupdf.pdf_dict_gets(o, "Parent")
    return sonuc


def _miras(zincir, ad):
    for o in zincir:
        v = _al(o, ad)
        if v is not None:
            return v
    return None


def _metin(v):
    if not _var(v):
        return ""
    if mupdf.pdf_is_string(v):
        return mupdf.pdf_to_text_string(v)
    if mupdf.pdf_is_name(v):
        return mupdf.pdf_to_name(v)
    if mupdf.pdf_is_stream(v):
        try:
            buf = mupdf.pdf_load_stream(v)
            return bytes(buf.fz_buffer_extract()).decode("utf-8", "replace")
        except Exception:
            return ""
    if mupdf.pdf_is_number(v):
        x = mupdf.pdf_to_real(v)
        return str(int(x)) if x == int(x) else str(x)
    return ""


def _ad(v):
    return mupdf.pdf_to_name(v) if _var(v) and mupdf.pdf_is_name(v) else ""


def _sayi(v, varsayilan=0.0):
    return mupdf.pdf_to_real(v) if _var(v) and mupdf.pdf_is_number(v) else varsayilan


def _dizi(v):
    if not _var(v) or not mupdf.pdf_is_array(v):
        return []
    return [mupdf.pdf_array_get(v, i) for i in range(mupdf.pdf_array_len(v))]


def _renk(v):
    """/MK /BG, /BC: 0 öğe (renk yok), 1 gri, 3 RGB, 4 CMYK → (r, g, b) ya da None."""
    d = [_sayi(x) for x in _dizi(v)]
    if len(d) == 1:
        return (d[0], d[0], d[0])
    if len(d) == 3:
        return tuple(d)
    if len(d) == 4:
        c, m, y, k = d
        return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))
    return None


def _hex(r):
    return notlar._hex(r) if r else None


def _durumlar(wobj, anahtar="N"):
    """Widget'ın görünüm durumlarının adları (/AP /N sözlüğünün anahtarları; tek akışsa boş)."""
    ap = _al(_al(wobj, "AP"), anahtar)
    if not ap or not mupdf.pdf_is_dict(ap):
        return []
    return [mupdf.pdf_to_name(mupdf.pdf_dict_get_key(ap, i)) for i in range(mupdf.pdf_dict_len(ap))]


def _acik_durum(wobj):
    """Onay kutusu / seçenek düğmesinin açık durumunun adı: /AP /N'deki Off olmayan ilk ad (yoksa /D'deki, o da yoksa /AS)."""
    for anahtar in ("N", "D"):
        for d in _durumlar(wobj, anahtar):
            if d != "Off":
                return d
    as_ = _ad(_al(wobj, "AS"))
    return as_ if as_ and as_ != "Off" else "Yes"


def _katalog(doc):
    return _al(mupdf.pdf_trailer(_pdf(doc)), "Root")


def _acroform(doc):
    return _al(_katalog(doc), "AcroForm")


# ---------------------------------------------------------------- /DA (varsayılan görünüm)
_DA_TF = re.compile(r"/([^\s/\[\]()<>]+)\s+([-+\d.]+)\s+Tf")
_DA_RENK = re.compile(r"(?:([-+\d.]+)\s+g|([-+\d.]+)\s+([-+\d.]+)\s+([-+\d.]+)\s+rg|([-+\d.]+)\s+([-+\d.]+)\s+([-+\d.]+)\s+([-+\d.]+)\s+k)(?![\w])")


def _da_coz(da):
    """/DA dizgesinden (yazı tipi kaynak adı, boyu, rengi)."""
    ad, boy, renk = "Helv", 0.0, (0.0, 0.0, 0.0)
    m = None
    for m in _DA_TF.finditer(da or ""):
        pass
    if m:
        ad = m.group(1)
        try:
            boy = max(0.0, float(m.group(2)))
        except ValueError:
            boy = 0.0
    for r in _DA_RENK.finditer(da or ""):
        try:
            if r.group(1) is not None:
                g = float(r.group(1))
                renk = (g, g, g)
            elif r.group(2) is not None:
                renk = (float(r.group(2)), float(r.group(3)), float(r.group(4)))
            else:
                c, mm, y, k = (float(r.group(i)) for i in range(5, 9))
                renk = ((1 - c) * (1 - k), (1 - mm) * (1 - k), (1 - y) * (1 - k))
        except ValueError:
            pass
    renk = tuple(min(1.0, max(0.0, c)) for c in renk)
    return ad, boy, renk


def _yazi_ailesi(kaynak_adi, temel_ad):
    """/DA'daki kaynak adı ve /DR'deki /BaseFont'tan PDEfe'nin gömdüğü aile ve kalınlık. Helvetica / Arial / bilinmeyen → Arial,
    Times → Times New Roman, Courier → Courier New."""
    ad = (temel_ad or kaynak_adi or "").replace("#20", " ")
    k = ad.lower()
    if "cour" in k or kaynak_adi in ("Cour", "CoBo", "CoOb", "CoBO"):
        aile = "Courier New"
    elif "times" in k or "roman" in k or kaynak_adi in ("TiRo", "TiBo", "TiIt", "TiBI"):
        aile = "Times New Roman"
    else:
        aile = "Arial"
    kalin = bool(re.search(r"bold|black|heavy|,bd|-bd", k)) or kaynak_adi in ("HeBo", "TiBo", "CoBo", "HeBO", "TiBI", "CoBO")
    return aile, kalin


# ---------------------------------------------------------------- alan bilgisi
def _tur(ft, ff):
    if ft == "Tx":
        return "metin"
    if ft == "Btn":
        return "dugme" if ff & FF_ITME else "secenek" if ff & FF_SECENEK else "onay"
    if ft == "Ch":
        return "acilir" if ff & FF_ACILIR else "liste"
    if ft == "Sig":
        return "imza"
    return None


def _secenekler(zincir):
    sonuc = []
    for o in _dizi(_miras(zincir, "Opt")):
        if mupdf.pdf_is_array(o):
            d = _dizi(o)
            if len(d) >= 2:
                sonuc.append([_metin(d[0]), _metin(d[1])])
            elif d:
                sonuc.append([_metin(d[0]), _metin(d[0])])
        else:
            t = _metin(o)
            sonuc.append([t, t])
    return sonuc


def _alan_bilgisi(doc, wobj):
    """Widget'ın alan bilgisi (alanın ortak özellikleri ve widget'ın kendi biçimi). Alanı belirlenemeyen widget için None."""
    zincir = _zincir(wobj)
    alan_obj = next((o for o in zincir if _al(o, "T") is not None), wobj)
    alan_xref = mupdf.pdf_to_num(alan_obj)
    wxref = mupdf.pdf_to_num(wobj)
    if not alan_xref or not wxref:
        return None
    ft = _ad(_miras(zincir, "FT"))
    ff = int(_sayi(_miras(zincir, "Ff")))
    tur = _tur(ft, ff)
    if not tur:
        return None
    adlar = [_metin(_al(o, "T")) for o in reversed(zincir) if _al(o, "T") is not None]
    af = _acroform(doc)
    da = _metin(_miras(zincir, "DA")) or _metin(_al(af, "DA"))
    yazi_kaynagi, boy, renk = _da_coz(da)
    temel = ""
    for dr in (_al(wobj, "DR"), _al(af, "DR")):
        f = _al(_al(_al(dr, "Font"), yazi_kaynagi), "BaseFont")
        if f is not None:
            temel = _ad(f)
            break
    aile, kalin = _yazi_ailesi(yazi_kaynagi, temel)
    q = _miras(zincir, "Q")
    q = int(_sayi(q)) if q is not None else int(_sayi(_al(af, "Q")))
    mk = _al(wobj, "MK")
    bs = _al(wobj, "BS")
    if bs is not None:
        kenar_k = _sayi(_al(bs, "W"), 1.0)
        kenar_s = _ad(_al(bs, "S")) or "S"
        tire = [_sayi(x) for x in _dizi(_al(bs, "D"))] or [3.0]
    else:
        b = [_sayi(x) for x in _dizi(_al(wobj, "Border"))]
        kenar_k = b[2] if len(b) >= 3 else 1.0
        kenar_s, tire = "S", [3.0]
    f = int(_sayi(_al(wobj, "F")))
    d = {
        "xref": wxref, "alan": alan_xref, "ad": ".".join(a for a in adlar if a) or ("alan %d" % alan_xref), "tur": tur, "ff": ff,
        "etiket": _metin(_miras(zincir, "TU")),
        "salt": bool(ff & FF_SALT_OKUNUR) or bool(f & (F_SALT_OKUNUR | F_ICERIK_KILITLI)),
        "gerekli": bool(ff & FF_GEREKLI), "gizli": bool(f & (F_GIZLI | F_GORUNMEZ)), "yazdir": bool(f & F_YAZDIR),
        "hiza": q if q in (0, 1, 2) else 0, "yaziBoyu": boy, "yaziTipi": aile, "kalin": kalin, "yaziRengi": _hex(renk) or "#000000",
        "arka": _hex(_renk(_al(mk, "BG"))), "kenar": _hex(_renk(_al(mk, "BC"))),
        "kenarKalinlik": max(0.0, kenar_k), "kenarStil": kenar_s if kenar_s in ("S", "D", "B", "I", "U") else "S", "tire": tire,
        "donme": int(_sayi(_al(mk, "R"))) % 360 if int(_sayi(_al(mk, "R"))) % 90 == 0 else 0,
    }
    v = _miras(zincir, "V")
    if tur == "metin":
        d.update(deger=_metin(v), cokSatir=bool(ff & FF_COK_SATIR), parola=bool(ff & FF_PAROLA), kaydirmaYok=bool(ff & FF_KAYDIRMA_YOK),
                 enCok=int(_sayi(_miras(zincir, "MaxLen"))))
        d["tarak"] = bool(ff & FF_TARAK) and d["enCok"] > 0 and not d["cokSatir"] and not d["parola"]
    elif tur in ("onay", "secenek"):
        ad = (_ad(v) or _metin(v)) if v is not None else ""
        if not ad:
            as_ = _ad(_al(wobj, "AS"))
            ad = as_ if as_ and tur == "onay" else "Off"
        d.update(deger=ad, acik=_acik_durum(wobj), kapanmaz=bool(ff & FF_KAPANMAZ), birlikte=bool(ff & FF_BIRLIKTE),
                 durum=_ad(_al(wobj, "AS")) or "Off")
        d["isaret"] = _metin(_al(mk, "CA")) or ("l" if tur == "secenek" else "4")
    elif tur in ("acilir", "liste"):
        secenekler = _secenekler(zincir)
        if v is not None and mupdf.pdf_is_array(v):
            degerler = [_metin(x) for x in _dizi(v)]
        elif v is not None:
            degerler = [_metin(v)]
        else:
            # /V yoksa /I'daki dizinlerden
            degerler = [secenekler[int(_sayi(i))][0] for i in _dizi(_miras(zincir, "I")) if 0 <= int(_sayi(i)) < len(secenekler)]
        d.update(secenekler=secenekler, duzenlenebilir=tur == "acilir" and bool(ff & FF_DUZENLENEBILIR),
                 cokluSecim=tur == "liste" and bool(ff & FF_COKLU_SECIM), ust=int(_sayi(_miras(zincir, "TI"))))
        d["deger"] = degerler if tur == "liste" else (degerler[0] if degerler else "")
        if tur == "liste":
            d["satir"] = (boy or COK_SATIR_OTOMATIK) * LISTE_SATIRI
    else:
        d["deger"] = None
        d["imzali"] = tur == "imza" and v is not None
    return d


def _sayfa_widgetlari(page):
    """Sayfanın widget'ları /Annots sırasıyla: [(Widget, pdf_annot)]. page referansı çağıranda tutulmalı (pdf_annot sayfaya bağlıdır)."""
    sonuc = []
    for w in page.widgets():
        sonuc.append(w)
        if len(sonuc) >= EN_COK_WIDGET:
            break
    return sonuc


def _sirala(page, alanlar):
    """Tab sırası: sayfanın /Tabs'ı /R (satır: yukarıdan aşağıya, soldan sağa) ya da /C (sütun) ise konuma göre, değilse (/S, yok)
    /Annots sırası. Konum döndürülmemiş sayfa düzleminde."""
    tabs = page.parent.xref_get_key(page.xref, "Tabs")
    if tabs[0] == "name" and tabs[1] == "/R":
        return sorted(alanlar, key=lambda a: (round(a["rect"][1], 1), a["rect"][0]))
    if tabs[0] == "name" and tabs[1] == "/C":
        return sorted(alanlar, key=lambda a: (round(a["rect"][0], 1), a["rect"][1]))
    return alanlar


def sayfa_alanlari(doc, page):
    """Sayfanın widget bilgileri, Tab sırasıyla. rect: PyMuPDF'in döndürülmemiş sayfa koordinatı (not ve bağlantılarla aynı)."""
    mat = page.transformation_matrix
    alanlar = []
    for w in _sayfa_widgetlari(page):
        wobj = _dolayli(doc, w.xref)
        d = _alan_bilgisi(doc, wobj)
        if not d:
            continue
        r = [_sayi(x) for x in _dizi(_al(wobj, "Rect"))]
        if len(r) != 4:
            continue
        kutu = (pymupdf.Rect(r) * mat).normalize()
        d["rect"] = [kutu.x0, kutu.y0, kutu.x1, kutu.y1]
        alanlar.append(d)
    return _sirala(page, alanlar)


# ---------------------------------------------------------------- değerlerin denetimi ve yazılması
def degerleri_dogrula(degerler):
    """Renderer'dan gelen değer listesi: [{xref: alan xref'i (pozitif tamsayı), deger: metin | metin listesi | None}] (en çok EN_COK_DEGER,
    metin en çok EN_UZUN_METIN karakter, liste en çok EN_COK_SECIM öğe). Fazla anahtarlar atılır. Uymazsa ValueError. Döner: temiz liste."""
    if degerler is None:
        return []
    if not isinstance(degerler, list) or len(degerler) > EN_COK_DEGER:
        raise ValueError("Form değerleri geçersiz.")
    sonuc = []
    for d in degerler:
        if not isinstance(d, dict):
            raise ValueError("Form değeri geçersiz.")
        x, v = d.get("xref"), d.get("deger")
        if type(x) is not int or x <= 0:
            raise ValueError("Form alanı geçersiz.")
        if isinstance(v, str):
            if len(v) > EN_UZUN_METIN:
                raise ValueError("Form değeri çok uzun.")
        elif isinstance(v, list):
            if len(v) > EN_COK_SECIM or not all(isinstance(s, str) and len(s) <= EN_UZUN_METIN for s in v):
                raise ValueError("Form değeri geçersiz.")
        elif v is not None:
            raise ValueError("Form değeri geçersiz.")
        sonuc.append({"xref": x, "deger": v})
    return sonuc


def _alan_widgetlari(doc, alan_xref):
    """Alanın widget'ları: /Kids'teki widget'lar (iç içe çocuk alanlar değil), kids yoksa alanın kendisi (birleşik alan-widget)."""
    o = _dolayli(doc, alan_xref)
    if not _var(o) or not mupdf.pdf_is_dict(o):
        return []
    kids = _dizi(_al(o, "Kids"))
    if not kids:
        return [o] if _ad(_al(o, "Subtype")) == "Widget" else []
    return [k for k in kids if _var(k) and mupdf.pdf_to_num(k) and (_ad(_al(k, "Subtype")) == "Widget" or _al(k, "T") is None)][:EN_COK_WIDGET]


def _alan_xrefi_mi(doc, alan_xref, wobj):
    """Widget gerçekten bu alana mı ait (renderer'ın verdiği xref başka bir nesneyi göstermesin)."""
    zincir = _zincir(wobj)
    alan = next((o for o in zincir if _al(o, "T") is not None), wobj)
    return mupdf.pdf_to_num(alan) == alan_xref


def degerleri_uygula(doc, degerler, ortak=None):
    """Değerleri alanlara yazar: /V (ve liste kutusunda /I), onay kutusu / seçenek düğmesinde widget'ların /AS'si, yazı ve liste
    alanlarında PDEfe'nin ürettiği görünüm (/AP /N). Salt okunur alan, imza ve itme düğmesi değişmez; bilinmeyen alan atlanır. XFA paketli
    karma belgede değer değişince /XFA kaldırılır: başka okuyucular değeri XFA verisinden okuyup AcroForm'a yazılanı göstermezdi.
    ortak: aynı belgeye art arda uygulamada yazı tipi önbelleği. Döner: değeri yazılan alan sayısı."""
    fontlar = ortak if ortak is not None else {}
    yazilan = 0
    for d in degerler:
        alan_xref, deger = d["xref"], d["deger"]
        if not 0 < alan_xref < doc.xref_length():
            continue
        widgetlar = _alan_widgetlari(doc, alan_xref)
        if not widgetlar or not _alan_xrefi_mi(doc, alan_xref, widgetlar[0]):
            continue
        bilgi = _alan_bilgisi(doc, widgetlar[0])
        if not bilgi or bilgi["salt"] or bilgi["tur"] in ("imza", "dugme"):
            continue
        tur = bilgi["tur"]
        alan = _dolayli(doc, alan_xref)
        if tur == "metin":
            metin = deger if isinstance(deger, str) else ""
            metin = metin.replace("\r\n", "\n").replace("\r", "\n")
            if not bilgi["cokSatir"]:
                metin = metin.replace("\n", " ")
            if bilgi["enCok"] > 0:
                metin = metin[:bilgi["enCok"]]
            doc.xref_set_key(alan_xref, "V", notlar._pdf_metin(metin))
            for w in widgetlar:
                _metin_gorunumu(doc, w, _alan_bilgisi(doc, w), metin, fontlar)
        elif tur in ("onay", "secenek"):
            ad = deger if isinstance(deger, str) and deger else "Off"
            durumlar = {mupdf.pdf_to_num(w): [s for s in _durumlar(w) if s != "Off"] for w in widgetlar}
            if ad != "Off" and not any(ad in s for s in durumlar.values()):
                # Durumu hiçbir widget'ta yok: görünümü olmayan tek onay kutusunda üretilir, değilse değer geçersiz
                if not (len(widgetlar) == 1 and not durumlar[mupdf.pdf_to_num(widgetlar[0])]):
                    continue
            mupdf.pdf_dict_puts(alan, "V", mupdf.pdf_new_name(ad))
            for w in widgetlar:
                wx = mupdf.pdf_to_num(w)
                acik = durumlar[wx][0] if durumlar[wx] else (ad if ad != "Off" else "Yes")
                if not durumlar[wx] or "Off" not in _durumlar(w):
                    _dugme_gorunumu(doc, w, _alan_bilgisi(doc, w), acik)
                mupdf.pdf_dict_puts(w, "AS", mupdf.pdf_new_name(acik if ad != "Off" and acik == ad else "Off"))
        elif tur in ("acilir", "liste"):
            secenekler = bilgi["secenekler"]
            if tur == "liste":
                secili = [s for s in (deger if isinstance(deger, list) else [deger] if isinstance(deger, str) else []) if s is not None]
                if not bilgi["cokluSecim"]:
                    secili = secili[:1]
                disari = [o[0] for o in secenekler]
                secili = [s for s in secili if s in disari]          # liste kutusunda yalnızca seçeneklerden
                dizinler = sorted({disari.index(s) for s in secili})
                if len(secili) > 1:
                    doc.xref_set_key(alan_xref, "V", "[" + " ".join(notlar._pdf_metin(s) for s in secili) + "]")
                elif secili:
                    doc.xref_set_key(alan_xref, "V", notlar._pdf_metin(secili[0]))
                else:
                    doc.xref_set_key(alan_xref, "V", "null")
                doc.xref_set_key(alan_xref, "I", "[%s]" % " ".join(str(i) for i in dizinler) if dizinler else "null")
                gorunum_degeri = secili
            else:
                metin = deger if isinstance(deger, str) else ""
                disari = [o[0] for o in secenekler]
                if not bilgi["duzenlenebilir"] and metin and metin not in disari:
                    continue
                doc.xref_set_key(alan_xref, "V", notlar._pdf_metin(metin) if metin else "null")
                if doc.xref_get_key(alan_xref, "I")[0] != "null":
                    doc.xref_set_key(alan_xref, "I", "[%d]" % disari.index(metin) if metin in disari else "null")
                gorunum_degeri = metin
            for w in widgetlar:
                _metin_gorunumu(doc, w, _alan_bilgisi(doc, w), gorunum_degeri, fontlar)
        else:
            continue
        yazilan += 1
    if yazilan:
        af = _acroform(doc)
        if af is not None and _al(af, "XFA") is not None:
            mupdf.pdf_dict_dels(af, "XFA")
    return yazilan


# ---------------------------------------------------------------- yazı tipi (PDEfe'nin gömdüğü alt küme)
def _form_fontu(doc, aile, kalin, fontlar):
    """(kaynak adı, Font, ölçüler, xref): Belgede PDEfe'nin gömdüğü alt küme varsa (katalogdaki /PDEfeFonts ya da önceki form görünümlerinin
    kaynakları) o, yoksa gömülür. Gömme sayfaya ve kataloğa dokunmaz: yazı tipi geçici bir belgede kurulup (insert_font: Type0 / Identity-H,
    ToUnicode, genişlikler) bu belgeye kopyalanır (pdf_graft_object)."""
    anahtar = (aile, bool(kalin))
    if anahtar in fontlar:
        return fontlar[anahtar]
    font, altkume, _, olcu = notlar._font_yukle(aile, kalin, False)
    ad = "PDEfeF" + re.sub(r"[^A-Za-z0-9]", "", aile) + ("B" if kalin else "R")
    xref = 0
    adaylar = []
    tur, deger = doc.xref_get_key(doc.pdf_catalog(), "PDEfeFonts")
    if tur == "dict":
        adaylar += [int(x) for x in re.findall(r"(\d+)\s+0\s+R", deger)]
    if "_gorunum_fontlari" not in fontlar:
        fontlar["_gorunum_fontlari"] = _gorunum_fontlari(doc)
    adaylar += fontlar["_gorunum_fontlari"]
    for x in adaylar:
        if 0 < x < doc.xref_length() and notlar._pdefe_fontu_mu(doc, x, altkume):
            xref = x
            break
    if not xref:
        gecici = pymupdf.open()
        try:
            gp = gecici.new_page()
            fx = gp.insert_font(fontname=ad, fontbuffer=altkume)
            _tounicode_duzelt(gecici, fx, font)
            yeni = mupdf.pdf_graft_object(_pdf(doc), _dolayli(gecici, fx))
            xref = mupdf.pdf_to_num(yeni)
        finally:
            gecici.close()
        fontlar["_gorunum_fontlari"].append(xref)
    fontlar[anahtar] = (ad, font, olcu, xref)
    return fontlar[anahtar]


def _tounicode_duzelt(doc, fx, font):
    """insert_font'un ToUnicode'u boşluk glifini (Arial'da U+0020 ile U+00A0 aynı glif) bölünmez boşluğa, kısa çizgiyi yumuşak tireye
    eşliyor: görünümden kopyalanan ya da aranan yazıda boşluklar U+00A0 çıkıyordu. Tek glifli eşlemeler düzeltilir (bfchar)."""
    tur, deger = doc.xref_get_key(fx, "ToUnicode")
    if tur != "xref":
        return
    tu = int(deger.split()[0])
    cmap = doc.xref_stream(tu).decode("latin-1")
    yeni = cmap
    for kod, yanlis in ((0x20, "00a0"), (0x2D, "00ad")):
        gid = font.has_glyph(kod)
        if gid:
            yeni = re.sub(r"<%04x>\s*<%s>" % (gid, yanlis), "<%04x> <%04x>" % (gid, kod), yeni, flags=re.IGNORECASE)
    if yeni != cmap:
        doc.update_stream(tu, yeni.encode("latin-1"))


def _gorunum_fontlari(doc):
    """Formun widget görünümlerinin kaynaklarındaki "PDEfeF" adlı yazı tiplerinin xref'leri (önceki kayıtların gömdüğü)."""
    sonuc = []
    af = _acroform(doc)
    yigin = _dizi(_al(af, "Fields"))
    gorulen = set()
    while yigin and len(gorulen) < 20000:
        o = yigin.pop()
        n = mupdf.pdf_to_num(o)
        if not _var(o) or n in gorulen:
            continue
        gorulen.add(n)
        yigin.extend(_dizi(_al(o, "Kids")))
        ap = _al(_al(o, "AP"), "N")
        if ap is None:
            continue
        akislar = [ap] if mupdf.pdf_is_stream(ap) else [mupdf.pdf_dict_get_val(ap, i) for i in range(mupdf.pdf_dict_len(ap))] if mupdf.pdf_is_dict(ap) else []
        for a in akislar:
            fd = _al(_al(a, "Resources"), "Font")
            if fd is None or not mupdf.pdf_is_dict(fd):
                continue
            for i in range(mupdf.pdf_dict_len(fd)):
                if mupdf.pdf_to_name(mupdf.pdf_dict_get_key(fd, i)).startswith("PDEfeF"):
                    x = mupdf.pdf_to_num(mupdf.pdf_dict_get_val(fd, i))
                    if x and x not in sonuc:
                        sonuc.append(x)
    return sonuc


# ---------------------------------------------------------------- görünüm akışları
def _widget_kutusu(wobj, bilgi):
    """(genişlik, yükseklik, matris): görünümün kendi düzlemindeki boyutu (/MK /R 90 / 270'te yükseklik ve genişlik yer değiştirir) ve
    /Matrix (döndürme; okuyucu dönmüş BBox'ı /Rect'e oturtur)."""
    r = [_sayi(x) for x in _dizi(_al(wobj, "Rect"))]
    w = abs(r[2] - r[0]) if len(r) == 4 else 0
    h = abs(r[3] - r[1]) if len(r) == 4 else 0
    rot = bilgi.get("donme", 0)
    if rot in (90, 270):
        w, h = h, w
    matris = {0: "[1 0 0 1 0 0]", 90: "[0 1 -1 0 0 0]", 180: "[-1 0 0 -1 0 0]", 270: "[0 -1 1 0 0 0]"}.get(rot, "[1 0 0 1 0 0]")
    return max(w, 1.0), max(h, 1.0), matris


def _kenar_ops(w, h, bilgi):
    """Zemin ve kenarlık (/MK /BG, /BC, /BS: düz, kesik, kabartma, gömme, alt çizgi) ve içeriğin payı."""
    ops = []
    bg = notlar._renk(bilgi.get("arka"))
    bc = notlar._renk(bilgi.get("kenar"))
    bw = bilgi.get("kenarKalinlik", 1.0) if bc else 0.0
    stil = bilgi.get("kenarStil", "S")
    if bg:
        ops.append("%.3f %.3f %.3f rg 0 0 %.2f %.2f re f" % (*bg, w, h))
    if bc and bw > 0:
        if stil == "U":
            ops.append("%.3f %.3f %.3f RG %.2f w 0 %.2f m %.2f %.2f l S" % (*bc, bw, bw / 2, w, bw / 2))
        else:
            tire = "[%s] 0 d " % " ".join("%g" % t for t in bilgi.get("tire") or [3]) if stil == "D" else ""
            ops.append("%s%.3f %.3f %.3f RG %.2f w %.2f %.2f %.2f %.2f re S [] 0 d" % (tire, *bc, bw, bw / 2, bw / 2, w - bw, h - bw))
            if stil in ("B", "I"):
                acik = (1, 1, 1) if stil == "B" else (0.5, 0.5, 0.5)
                koyu = tuple(c * 0.5 for c in bg) if stil == "B" and bg else (0.75, 0.75, 0.75)
                ic = 2 * bw
                ops.append("%.3f %.3f %.3f rg %.2f %.2f m %.2f %.2f l %.2f %.2f l %.2f %.2f l %.2f %.2f l %.2f %.2f l f"
                           % (*acik, bw, bw, bw, h - bw, w - bw, h - bw, w - ic, h - ic, ic, h - ic, ic, ic))
                ops.append("%.3f %.3f %.3f rg %.2f %.2f m %.2f %.2f l %.2f %.2f l %.2f %.2f l %.2f %.2f l %.2f %.2f l f"
                           % (*koyu, w - bw, h - bw, w - bw, bw, bw, bw, ic, ic, w - ic, ic, w - ic, h - ic))
    pay = bw * (2 if stil in ("B", "I") else 1) if stil != "U" else 0.0
    return ops, pay, bc, bw


def _metin_gorunumu(doc, wobj, bilgi, deger, fontlar):
    """Yazı alanı, açılır liste ve liste kutusu widget'ının görünüm akışını (/AP /N) yazar."""
    if not bilgi:
        return
    w, h, matris = _widget_kutusu(wobj, bilgi)
    tur = bilgi["tur"]
    ad, font, olcu, fxref = _form_fontu(doc, bilgi.get("yaziTipi", "Arial"), bilgi.get("kalin"), fontlar)
    ust, alt = olcu["yukari"], olcu["asagi"]
    renk = notlar._renk(bilgi.get("yaziRengi")) or (0, 0, 0)
    ops, pay, bc, bw = _kenar_ops(w, h, bilgi)
    icw, ich = max(1.0, w - 2 * pay), max(1.0, h - 2 * pay)

    def cizilen(s):
        return "".join(notlar._cizilen(font, olcu, c) for c in s)

    def olc(s, boy):
        return font.text_length(cizilen(s), fontsize=boy)

    def yaz(s, x, y, boy):
        return "1 0 0 1 %.2f %.2f Tm <%s> Tj" % (x, y, notlar._gid_hex(font, s, olcu)) if s else ""

    metin_ops = []
    boy = bilgi.get("yaziBoyu") or 0.0
    hiza = bilgi.get("hiza", 0)
    if tur == "liste":
        secenekler = bilgi.get("secenekler") or []
        secili = set(deger if isinstance(deger, list) else [])
        boy = boy or COK_SATIR_OTOMATIK
        satir = boy * LISTE_SATIRI
        ilk = max(0, min(int(bilgi.get("ust", 0)), max(0, len(secenekler) - 1)))
        y = h - pay
        for disari, gorunen in secenekler[ilk:]:
            if y <= pay:
                break
            if disari in secili:
                ops.append("%.3f %.3f %.3f rg %.2f %.2f %.2f %.2f re f" % (*SECILI_RENK, pay, y - satir, icw, satir))
            taban = y - satir + (satir - (ust + alt) * boy) / 2 + alt * boy
            metin_ops.append(yaz(gorunen, pay + IC_PAY, taban, boy))
            y -= satir
    else:
        if tur == "acilir":
            metin = next((o[1] for o in bilgi.get("secenekler") or [] if o[0] == deger), deger or "")
        else:
            metin = deger or ""
            if bilgi.get("parola"):
                metin = "*" * len(metin)
        cok = tur == "metin" and bilgi.get("cokSatir")
        tarak = tur == "metin" and bilgi.get("tarak")
        if cok:
            genislik = max(1.0, icw - 2 * IC_PAY)
            if not boy:
                boy = COK_SATIR_OTOMATIK
                while boy > OTOMATIK_BOY_EN_AZ and len(_satirlar(metin, genislik, lambda s: olc(s, boy))) * boy * (ust + alt) > ich - 2:
                    boy -= 0.5
            satirlar = _satirlar(metin, genislik, lambda s: olc(s, boy))
            y = h - pay - IC_PAY / 2 - ust * boy
            for s in satirlar:
                if y < pay - alt * boy:
                    break
                gen = olc(s.rstrip(" "), boy)
                x = pay + IC_PAY + {1: (genislik - gen) / 2, 2: genislik - gen}.get(hiza, 0.0)
                metin_ops.append(yaz(s.rstrip(" "), x, y, boy))
                y -= boy * (ust + alt)
        elif tarak:
            n = max(1, bilgi.get("enCok", 1))
            hucre = w / n
            if bc and bw > 0:
                ops.append("%.3f %.3f %.3f RG %.2f w %s S" % (*bc, bw, " ".join("%.2f 0 m %.2f %.2f l" % (hucre * i, hucre * i, h) for i in range(1, n))))
            if not boy:
                boy = max(OTOMATIK_BOY_EN_AZ, min(ich / OTOMATIK_BOY_KATI, hucre / 0.75))
            taban = pay + (ich - (ust + alt) * boy) / 2 + alt * boy
            for i, c in enumerate(metin[:n]):
                metin_ops.append(yaz(c, hucre * i + (hucre - olc(c, boy)) / 2, taban, boy))
        else:
            genislik = max(1.0, icw - 2 * IC_PAY)
            if not boy:
                boy = max(OTOMATIK_BOY_EN_AZ, ich / OTOMATIK_BOY_KATI)
                gen = olc(metin, boy)
                if gen > genislik:
                    boy = max(OTOMATIK_BOY_EN_AZ, boy * genislik / gen)
            gen = olc(metin, boy)
            x = pay + IC_PAY + {1: (genislik - gen) / 2, 2: genislik - gen}.get(hiza, 0.0)
            if gen > genislik:
                x = pay + IC_PAY                     # sığmayan yazı başından görünür (kaydırmalı alanda okuyucular da böyle çizer)
            taban = pay + (ich - (ust + alt) * boy) / 2 + alt * boy
            metin_ops.append(yaz(metin, x, taban, boy))
    metin_ops = [m for m in metin_ops if m]
    akis = ["/Tx BMC", "q"] + ops
    if metin_ops:
        akis.append("%.2f %.2f %.2f %.2f re W n" % (pay, pay, icw, ich))
        akis.append("BT /%s %.2f Tf %.3f %.3f %.3f rg" % (ad, boy, *renk))
        akis += metin_ops
        akis.append("ET")
    akis += ["Q", "EMC"]
    ap = doc.get_new_xref()
    doc.update_object(ap, "<</Type/XObject/Subtype/Form/FormType 1/BBox[0 0 %.2f %.2f]/Matrix %s/Resources<</Font<</%s %d 0 R>>/ProcSet[/PDF/Text]>>>>"
                      % (w, h, matris, ad, fxref))
    doc.update_stream(ap, "\n".join(akis).encode("latin-1"))
    doc.xref_set_key(mupdf.pdf_to_num(wobj), "AP", "<</N %d 0 R>>" % ap)


def _satirlar(metin, genislik, olc):
    """Çok satırlı yazının satırları: paragraflar (\\n) sözcük sözcük sarılır, sığmayan sözcük harf harf bölünür. Satır sonundaki boşluk
    satırda kalır (hizada sayılmaz)."""
    sonuc = []
    for paragraf in metin.split("\n"):
        satir = ""
        for parca in re.findall(r"\S+|\s+", paragraf):
            if parca.isspace():
                satir += parca if satir else ""
                continue
            if olc(satir + parca) <= genislik or not satir.strip():
                if olc(satir + parca) <= genislik:
                    satir += parca
                    continue
            if satir.strip():
                sonuc.append(satir)
                satir = ""
            while olc(parca) > genislik and len(parca) > 1:     # tek başına sığmayan sözcük
                k = len(parca) - 1
                while k > 1 and olc(parca[:k]) > genislik:
                    k -= 1
                sonuc.append(parca[:k])
                parca = parca[k:]
            satir = parca
        sonuc.append(satir)
    return sonuc


def _isaret_ops(w, h, karakter, renk):
    """Onay kutusu / seçenek düğmesinin işareti (/MK /CA, ZapfDingbats harfi) vektörle: 4 ✓, 8 ✕, l ●, u ◆, n ■, H ★ (yıldız ✓ olarak)."""
    k = min(w, h)
    cx, cy = w / 2, h / 2
    r = "%.3f %.3f %.3f" % tuple(renk)
    if karakter == "l":
        rr = k * 0.25
        c = rr * 0.5523
        return ["%s rg %.2f %.2f m %.2f %.2f %.2f %.2f %.2f %.2f c %.2f %.2f %.2f %.2f %.2f %.2f c %.2f %.2f %.2f %.2f %.2f %.2f c %.2f %.2f %.2f %.2f %.2f %.2f c f"
                % (r, cx + rr, cy, cx + rr, cy + c, cx + c, cy + rr, cx, cy + rr, cx - c, cy + rr, cx - rr, cy + c, cx - rr, cy,
                   cx - rr, cy - c, cx - c, cy - rr, cx, cy - rr, cx + c, cy - rr, cx + rr, cy - c, cx + rr, cy)]
    if karakter == "8":
        d = k * 0.28
        return ["%s RG %.2f w 1 J %.2f %.2f m %.2f %.2f l %.2f %.2f m %.2f %.2f l S" % (r, k * 0.1, cx - d, cy - d, cx + d, cy + d, cx - d, cy + d, cx + d, cy - d)]
    if karakter == "u":
        d = k * 0.3
        return ["%s rg %.2f %.2f m %.2f %.2f l %.2f %.2f l %.2f %.2f l f" % (r, cx, cy + d, cx + d, cy, cx, cy - d, cx - d, cy)]
    if karakter == "n":
        d = k * 0.25
        return ["%s rg %.2f %.2f %.2f %.2f re f" % (r, cx - d, cy - d, 2 * d, 2 * d)]
    return ["%s RG %.2f w 1 J 1 j %.2f %.2f m %.2f %.2f l %.2f %.2f l S" % (r, k * 0.12, cx - k * 0.28, cy, cx - k * 0.08, cy - k * 0.22, cx + k * 0.3, cy + k * 0.26)]


def _dugme_gorunumu(doc, wobj, bilgi, acik):
    """Görünümü (ya da Off durumu) olmayan onay kutusu / seçenek düğmesine iki durumun görünümü: zemin ve kenarlık (/MK), açıkta işaret.
    Var olan durum görünümlerine dokunulmaz."""
    if not bilgi:
        return
    w, h, matris = _widget_kutusu(wobj, bilgi)
    ops, _, _, _ = _kenar_ops(w, h, bilgi)
    renk = notlar._renk(bilgi.get("yaziRengi")) or (0, 0, 0)
    var = set(_durumlar(wobj))
    ekle = {}
    for durum, acikmi in ((acik, True), ("Off", False)):
        if durum in var:
            continue
        akis = ["q"] + ops + (_isaret_ops(w, h, bilgi.get("isaret") or "4", renk) if acikmi else []) + ["Q"]
        x = doc.get_new_xref()
        doc.update_object(x, "<</Type/XObject/Subtype/Form/FormType 1/BBox[0 0 %.2f %.2f]/Matrix %s/Resources<<>>>>" % (w, h, matris))
        doc.update_stream(x, "\n".join(akis).encode("latin-1"))
        ekle[durum] = x
    if not ekle:
        return
    wx = mupdf.pdf_to_num(wobj)
    ap = _al(wobj, "AP")
    n = _al(ap, "N")
    if n is not None and mupdf.pdf_is_dict(n):
        for durum, x in ekle.items():
            mupdf.pdf_dict_puts(n, durum, _dolayli(doc, x))
    else:
        durumlar = mupdf.pdf_new_dict(_pdf(doc), 2)
        for durum, x in ekle.items():
            mupdf.pdf_dict_puts(durumlar, durum, _dolayli(doc, x))
        if ap is None or not mupdf.pdf_is_dict(ap):
            doc.xref_set_key(wx, "AP", "<<>>")
            ap = _al(_dolayli(doc, wx), "AP")
        mupdf.pdf_dict_puts(ap, "N", durumlar)


# ---------------------------------------------------------------- çalışma belgesi (kaydedilmemiş değerlerle çizim)
_calisma = {}                    # (yol, mtime, boyut, imza) → Document
_calisma_kilidi = threading.Lock()
CALISMA_EN_COK = 3


def _imza(degerler):
    return hashlib.sha1(json.dumps(sorted((d["xref"], d["deger"]) for d in degerler), ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def calisma_belgesi(yol, degerler):
    """Kaydedilmemiş değerler yazılmış belge: değer yoksa önbellekteki belge, varsa dosyanın ayrı bir kopyası (bellekte; dosyaya yazılmaz).
    Aynı değerlerle yeniden istenirse kopya yeniden kullanılır. Dosya değişince (mtime / boyut) ya da önbellek bırakılınca kapanır."""
    from pdefe_core import onbellek
    if not degerler:
        return onbellek.al(yol)
    st = os.stat(yol)
    anahtar = (yol, st.st_mtime, st.st_size, _imza(degerler))
    with _calisma_kilidi:
        doc = _calisma.pop(anahtar, None)
        if doc is not None:
            _calisma[anahtar] = doc              # en son kullanılan sona
            return doc
    doc = pymupdf.open(yol, filetype="pdf")
    degerleri_uygula(doc, degerler)
    with _calisma_kilidi:
        for k in [k for k in _calisma if k[0] == yol]:
            _kapat(_calisma.pop(k))              # aynı dosyanın eski değerli kopyası
        _calisma[anahtar] = doc
        while len(_calisma) > CALISMA_EN_COK:
            _kapat(_calisma.pop(next(iter(_calisma))))
    return doc


def _kapat(doc):
    try:
        doc.close()
    except Exception:
        pass


def birak(yol=None):
    """Çalışma belgelerini kapatır (yol verilirse yalnızca o dosyanınkini): kayıt dosyayı yerine koymadan önce (Windows'ta açık dosya
    değiştirilemez) pdefe_core.BelgeOnbellek.birak çağırır."""
    hedef = os.path.normcase(os.path.abspath(yol)) if yol else None
    with _calisma_kilidi:
        for k in [k for k in _calisma if hedef is None or os.path.normcase(os.path.abspath(k[0])) == hedef]:
            _kapat(_calisma.pop(k))


# ---------------------------------------------------------------- çizim
def _widget_ciz(pdf_annot, mat, cerceve):
    """Widget'ı mat ile çizer; (png, [x, y, genişlik, yükseklik] sayfa çerçevesinin oranı olarak) ya da çizilecek alan yoksa None."""
    kutu = (pymupdf.Rect(mupdf.pdf_bound_annot(pdf_annot)) * mat).irect
    kutu &= cerceve
    if kutu.is_empty or kutu.width < 1 or kutu.height < 1:
        return None
    pix = pymupdf.Pixmap(pymupdf.csRGB, kutu, True)
    mupdf.fz_clear_pixmap(pix.this)
    dev = mupdf.fz_new_draw_device(mupdf.FzMatrix(), pix.this)
    try:
        mupdf.pdf_run_annot(pdf_annot, dev, mupdf.FzMatrix(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f), mupdf.FzCookie())
    finally:
        mupdf.fz_close_device(dev)
    W, H = max(cerceve.width, 1), max(cerceve.height, 1)
    oran = [(kutu.x0 - cerceve.x0) / W, (kutu.y0 - cerceve.y0) / H, kutu.width / W, kutu.height / H]
    return base64.b64encode(pix.tobytes("png")).decode("ascii"), oran


def y_form_alanlari(p):
    """{yol, sayfa} → {alanlar: [...]}: sayfanın widget'larının bilgisi, Tab sırasıyla (değerler dosyadaki)."""
    from pdefe_core import onbellek
    doc = onbellek.al(p["yol"])
    sayfa = _sayfa_no(p, doc)
    page = doc[sayfa - 1]
    return {"alanlar": sayfa_alanlari(doc, page)}


def _sayfa_no(p, doc):
    s = p.get("sayfa")
    if type(s) is not int or not 1 <= s <= doc.page_count:
        raise ValueError("Geçersiz sayfa.")
    return s


def y_form_gorunum(p):
    """Form katmanı (0.3.1; 0.3.0'a dek bütün widget'lar tek saydam PNG'ydi): {yol, sayfa, olcek, dondurme, degerler?, xrefler?, alanlar?}.
    Döner: {widgetlar: [{xref, png, kutu, diger?: {png, kutu}}], alanlar?}. kutu: sayfanın (ekrandaki açısıyla) çerçevesinin oranı olarak
    [x, y, genişlik, yükseklik]. diger: onay kutusu ve seçenek düğmesinde öbür durumun (açıksa kapalı, kapalıysa açık) görünümü. degerler:
    kaydedilmemiş değerler (çalışma belgesinden çizilir). xrefler: yalnızca bu widget'lar (değer değişince). alanlar: true ise sayfanın alan
    bilgisi de (form_alanlari; dosyadaki değerlerle). Widget'sız sayfada widgetlar boş. dondurme: ekrandaki mutlak açı (dosyadaki /Rotate'ten
    farkı uygulanır)."""
    from pdefe_core import onbellek, olcek_sinirla
    yol = p["yol"]
    dosya = onbellek.al(yol)
    sayfa = _sayfa_no(p, dosya)
    degerler = degerleri_dogrula(p.get("degerler"))
    xrefler = p.get("xrefler")
    if xrefler is not None and (not isinstance(xrefler, list) or len(xrefler) > EN_COK_WIDGET or not all(type(x) is int for x in xrefler)):
        raise ValueError("Geçersiz widget listesi.")
    sonuc = {"widgetlar": []}
    dpage = dosya[sayfa - 1]
    if p.get("alanlar"):
        sonuc["alanlar"] = sayfa_alanlari(dosya, dpage)
    if dpage.first_widget is None:
        return sonuc
    doc = calisma_belgesi(yol, degerler)
    page = doc[sayfa - 1]
    olcek = olcek_sinirla(page.rect.width, page.rect.height, float(p.get("olcek", 1.0)))
    fark = (int(p.get("dondurme", page.rotation)) - page.rotation) % 360
    mat = pymupdf.Matrix(olcek, olcek) * pymupdf.Matrix(fark)
    cerceve = (page.rect * mat).irect
    secili = set(xrefler) if xrefler is not None else None
    for w in _sayfa_widgetlari(page):
        if secili is not None and w.xref not in secili:
            continue
        wobj = _dolayli(doc, w.xref)
        f = int(_sayi(_al(wobj, "F")))
        if f & (F_GIZLI | F_GORUNMEZ):
            continue
        annot = w._annot.this
        cizim = _widget_ciz(annot, mat, cerceve)
        if not cizim:
            continue
        oge = {"xref": w.xref, "png": cizim[0], "kutu": cizim[1]}
        bilgi = _alan_bilgisi(doc, wobj)
        if bilgi and bilgi["tur"] in ("onay", "secenek"):
            # Öbür durum: /AS bellekte geçici olarak değiştirilip çizilir (MuPDF görünümü çizim anında /AS'den seçer), sonra geri konur
            simdi = _ad(_al(wobj, "AS")) or "Off"
            acik = _acik_durum(wobj)
            if acik not in _durumlar(wobj) or "Off" not in _durumlar(wobj):
                _dugme_gorunumu(doc, wobj, bilgi, acik)          # görünümü olmayan durum (yalnızca bu bellekteki belgede)
            obur = "Off" if simdi != "Off" else acik
            try:
                mupdf.pdf_dict_puts(wobj, "AS", mupdf.pdf_new_name(obur))
                diger = _widget_ciz(annot, mat, cerceve)
            finally:
                mupdf.pdf_dict_puts(wobj, "AS", mupdf.pdf_new_name(simdi))
            if diger:
                oge["diger"] = {"png": diger[0], "kutu": diger[1], "durum": obur}
            oge["durum"] = simdi
        sonuc["widgetlar"].append(oge)
    return sonuc


def yazdirma_pixmap(doc, page, olcek, notlar_dahil):
    """Yazdırma görüntüsü (pdefe_core.y_sayfa_goruntu): sayfa içeriği, notlar (notlar_dahil; ekrandaki gibi) ve form alanları (her zaman,
    "Notları yazdır"dan bağımsız; yazdırma kullanımıyla: /F Print bayrağı olmayan alan basılmaz). get_pixmap'teki gibi önce görüntü listesi
    kurulup ölçekle çizilir: formsuz sayfada çıktı 0.3.0'ınkiyle piksel piksel aynı (doğrudan ölçekli çizimde yazı kenarları ayrı yumuşar)."""
    liste = mupdf.FzDisplayList(mupdf.fz_bound_page(page.this))
    dev = mupdf.fz_new_list_device(liste)
    birim = mupdf.FzMatrix()
    try:
        mupdf.fz_run_page_contents(page.this, dev, birim, mupdf.FzCookie())
        if notlar_dahil:
            mupdf.fz_run_page_annots(page.this, dev, birim, mupdf.FzCookie())
        mupdf.pdf_run_page_widgets_with_usage(pymupdf._as_pdf_page(page), dev, birim, "Print", mupdf.FzCookie())
    finally:
        mupdf.fz_close_device(dev)
    return pymupdf.DisplayList(liste).get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), colorspace=pymupdf.csRGB, alpha=False)


def kaydol(yontemler):
    yontemler["form_alanlari"] = y_form_alanlari
    yontemler["form_gorunum"] = y_form_gorunum
