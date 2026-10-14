# -*- coding: utf-8 -*-
"""PDF → UDF, düzenlenebilir belge (0.2.6, "Dosya Formatını Değiştir"; udf.py dönüştürücü olarak kaydeder). UYAP Doküman Editörü (UDE)
gerekmez: yalnızca PyMuPDF. Kullanıcı yalnızca düzenlenebilir UDF'yi seçti (resim tabanlı UDF seçeneği yok).

PDF'in yazı katmanı (get_text "dict") satırlara, satırlar paragraflara çevrilir (sayfa sınırında süren paragraf tek paragraf kalır):
yazı ailesi (PDF yazı tipi adından UDE'nin ailesine), boyut (UDE yalnızca tam punto okuyor: 10,5 yazılırsa 12 sayıyor), kalın / italik /
altı çizili (çizimlerden) / renk, hizalama (sola, ortala, sağa, iki yana), sol girinti ve ilk satır girintisi, satır aralığı, paragraf
öncesi boşluk, sekmeler (satır içinde büyük boşluk; TabSet sol girintiye göreli), sayfaların çoğunda aynı yerde tekrar eden üst ve alt
bilgi (sayfa numarası UDE'nin kendi numarası olur: pageNumber-spec), kenar boşlukları, sayfa yönü ve boyu. Sayfadaki resimler (logo,
imza) resim öğesi, sayfanın tamamını kaplayan antet resmi UDE'nin zemin resmi (bgImage) olur.
Taranmış (yazısız) sayfa yazı tanımayla (yazi_tanima.py: Windows / Apple tanıyıcısı) düzenlenebilir paragraflara çevrilir; tanıyıcı
yoksa sayfanın görüntüsü resim öğesi olarak konur ve sonuç uyarısında söylenir.

UDE'nin yerleşim modeli (köprüyle ölçüldü, 391 yazı tipi × boyut çizimi; PLAN.md "Revizyon 0.2.6"): satır kutusu K = ⌊(üst + alt uzantı +
satır arası boşluğu) / em × punto⌋ + 1 (hhea; YAZI_TIPLERI); taban çizgisi kutunun tepesinden C punto (TABAN_TABLOSU, 6–28 punto);
LineSpacing satıra E = 2 × ⌊LS × K / 2⌋ ekler, yarısı üstte; SpaceAbove / SpaceBelow tam puntoya aşağı yuvarlanıp eklenir (sayfa başında
da); yazının x'i ⌊leftMargin⌋ + 1 + ⌊LeftIndent (+ FirstLineIndent)⌋; gövdenin ilk taban çizgisi ⌊topMargin⌋ + E/2 + C (üst bilgi
taşarsa onun altından); satır kutusunun altı sayfa yüksekliği − ⌊bottomMargin⌋'i geçmiyorsa satır sayfaya sığar; üst bilginin ilk taban
çizgisi ⌊headerFOffset⌋ + C, alt bilginin son satırının altı ⌊sayfa yüksekliği − footerFOffset⌋. Bu modelle kaynağın satır konumları
UDE'de yeniden kurulur; alt kenar, kaynağın dolu sayfalarının UDE'de aynı satırda bitmesini sağlayacak biçimde seçilir (_sayfala).

UDF kuralları (drive-udf-okuyucu belgeler/UDF-SARTNAMESI.md, UDF Antetcisi crates/udf-cekirdek): ön söz ve format_id 1.8 (yoksa UDE
açmıyor), metin havuzu tek CDATA (metinde "]]>" olursa UDE açamıyor: araya sıfır genişlikli boşluk konur), havuz ofsetleri UTF-16
birimi ve belge sırasıyla (üst bilgi, gövde, alt bilgi), BMP dışı karakter (emoji) UDE'de yok: yerine U+FFFD; XML'de geçersiz denetim
karakterleri atılır; paperOrientation 0 = yatay; bgImage payları tam sayı (UDE ondalığı okuyamıyor); paragraf satır sonuyla biter; resim
yer tutucusu U+FFFC.
"""
import base64
import collections
import math
import os
import re
import statistics
import threading
import zipfile

import pymupdf

from . import araclar
from .donustur import OgeHatasi

ONSOZ = '<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >\n'
STILLER = ('<styles><style name="default" description="Geçerli" family="Dialog" size="12" bold="false" italic="false" '
           'foreground="-13421773" FONT_ATTRIBUTE_KEY="javax.swing.plaf.FontUIResource[family=Dialog,name=Dialog,style=plain,size=12]" />'
           '<style name="hvl-default" family="Times New Roman" size="12" description="Gövde" /></styles>')
VARSAYILAN_AILE = "Times New Roman"
RESIM_KARAKTERI = chr(0xFFFC)
SIFIR_BOSLUK = chr(0x200B)
YERINE_KARAKTER = chr(0xFFFD)

# PDF yazı tipi adı (alt küme ön eki ve boşluklar atılmış, küçük harf) → UDE'nin ailesi. Sıra önemli (arialnarrow, arial'dan önce)
AILELER = (
    (r"timesnewroman|timesroman|times-roman|^times|liberationserif|nimbusrom|tinos", "Times New Roman"),
    (r"calibri", "Calibri"), (r"cambria", "Cambria"), (r"arialnarrow", "Arial Narrow"),
    (r"arial|helvetica|liberationsans|nimbussans|arimo", "Arial"), (r"couriernew|courier|liberationmono|cousine", "Courier New"),
    (r"tahoma", "Tahoma"), (r"verdana", "Verdana"), (r"georgia", "Georgia"), (r"segoeui", "Segoe UI"), (r"garamond", "Garamond"),
    (r"bookantiqua", "Book Antiqua"), (r"palatinolinotype|palatino", "Palatino Linotype"), (r"trebuchet", "Trebuchet MS"),
    (r"centurygothic", "Century Gothic"), (r"bookmanoldstyle|bookman", "Bookman Old Style"), (r"consolas", "Consolas"),
    (r"constantia", "Constantia"), (r"corbel", "Corbel"), (r"candara", "Candara"), (r"dejavusans", "DejaVu Sans"),
)
# Yazı tiplerinin dikey ölçüleri (hhea; em 2048 birim: üst uzantı, alt uzantı, satır arası boşluğu; Windows'un yazı tipi dosyalarından)
YAZI_TIPLERI = {
    "Times New Roman": (1825, 443, 87), "Arial": (1854, 434, 67), "Calibri": (1536, 512, 452), "Cambria": (1946, 455, 0),
    "Courier New": (1705, 615, 0), "Tahoma": (2049, 423, 0), "Verdana": (2059, 430, 0), "Georgia": (1878, 449, 0),
    "Segoe UI": (2210, 514, 0), "Garamond": (1765, 539, 0), "Book Antiqua": (1891, 578, 0), "Trebuchet MS": (1923, 455, 0),
    "Arial Narrow": (1916, 434, 0), "Consolas": (1521, 527, 350), "Palatino Linotype": (1499, 582, 682),
    "Century Gothic": (2060, 451, 0), "Bookman Old Style": (1929, 475, 0),
}
VARSAYILAN_OLCU = (1825, 443, 87)
# UDE'de satır kutusunun tepesinden taban çizgisine (pt), 6–28 punto: karakter kodu − 48 (köprüyle ölçüldü; kalın / metinle değişmiyor)
TABAN_TABLOSU = {
    "Times New Roman": "5679:9:<=>>?ABCCEEFGHIJ", "Arial": "5679::;;=>>?ABCCDFGGGIJ", "Calibri": "7779:;=>>?@BCDFGFHIJLMO",
    "Cambria": "56789:;<=>?@ABBCDEFGHIJ", "Tahoma": "56789:;<=>?@ABCDEFGHIJK", "Verdana": "5678:;<=>?@ABCDEFGHIJKL",
    "Courier New": "4567899:;<=>>?@ABCCDEFG", "Georgia": "56789::;<=>?@ABCDEEFGHI", "Segoe UI": "6789:;<=?@ABCDEFGHIJLMN",
    "Garamond": "556789:;<<=>?@ABBCDEFGH", "Book Antiqua": "56789:;;<=>?@ABCDEFGGHI", "Trebuchet MS": "56789:;<=>>?@ABCDEFGHIJ",
    "Arial Narrow": "56789:;<==>?@ABCDEFGHIJ", "Century Gothic": "5679:;<=>?@ABCDEFGHIJKL",
    "Bookman Old Style": "56789:;<=>??@ABCDEFGHIJ", "Palatino Linotype": "79:;;<>?ABDEFGGIJLMOOQR",
    "Consolas": "6679:;;<=?@AABCEFFGHIKL",
}
# Bozuk ToUnicode eşlemeleri (Word 2010'un "Times New Roman TUR" hatası vb.; renderer metin.js BOZUK_GLIFLER ile aynı)
BOZUK_GLIFLER = {chr(0x120): chr(0x130), chr(0x121): chr(0x15E), chr(0x122): chr(0x15F), chr(0x123): chr(0x15F), chr(0x201F): '"',
                 chr(0xFB01): "fi", chr(0xFB02): "fl", chr(0xAD): "", chr(0xA0): " "}
# UDE'nin kâğıt kodları (mediaSizeName; UDF-SARTNAMESI §4): A4, A5, Letter, B5, Legal, Executive
KAGITLAR = (("1", 595.28, 841.89), ("2", 419.53, 595.28), ("3", 612.0, 792.0), ("4", 515.91, 728.5), ("5", 612.0, 1008.0),
            ("6", 522.0, 756.0))
GUZEL_KENARLAR = tuple(round(c * 72 / 2.54, 3) for c in (0.5, 0.75, 1.0, 1.25, 1.27, 1.5, 1.75, 2.0, 2.25, 2.5, 2.54, 3.0, 3.5, 4.0)) + \
    (36.0, 54.0, 90.0)
EN_AZ_KENAR = 14.17
UST_BOLGE, ALT_BOLGE = 0.16, 0.84      # üst / alt bilgi aranan sayfa bölgeleri (sayfa yüksekliğinin oranı)
TEKRAR_ORANI = 0.6                     # üst / alt bilgi sayılmak için satırın göründüğü sayfa oranı
EN_FAZLA_BILGI_SATIRI = 6              # sayfa başına bundan çok tekrar eden satır üst / alt bilgi sayılmaz
TARAMA_GORSEL = 0.5                    # yazısız sayfayı bu kadarını görsel kaplıyorsa taranmış sayılır
ZEMIN_GORSEL = 0.85                    # sayfanın bu kadarını kaplayan görsel (yazı üstünde) zemin resmi (bgImage)
EN_KUCUK_GORSEL = 12.0                 # pt: daha küçük görseller (çizgi, madde imi) atlanır
GORSEL_DPI = 200                       # sayfadan kırpılan görsellerin (logo, imza) çözünürlüğü
TARAMA_DPI = 150                       # tanınamayan taranmış sayfanın resmi
EN_FAZLA_CIZIM = 20000                 # sayfada bundan çok çizim varsa altı çizili aranmaz (süre)
TANIMA_BEKLEME = 120                   # sn: bir sayfanın yazı tanıması


def hazir():
    return True, None


# ---------------------------------------------------------------- UDE'nin satır modeli
def _olcu(aile):
    o = YAZI_TIPLERI.get(aile)
    if o is None:
        o = _sistem_olcusu(aile) or VARSAYILAN_OLCU
    return o


_sistem_kilidi = threading.Lock()
_sistem_tipleri = None      # küçük harfli aile adı → dosya yolu (Windows'ta kayıt defterinden)
_sistem_olculeri = {}


def _sistem_yazi_tipleri():
    """Windows'ta kurulu yazı tiplerinin aileleri (HKLM / HKCU ... CurrentVersion\\Fonts): {küçük harfli ad: dosya}."""
    global _sistem_tipleri
    with _sistem_kilidi:
        if _sistem_tipleri is not None:
            return _sistem_tipleri
        tipler = {}
        if os.name == "nt":
            try:
                import winreg
                klasor = os.path.join(os.environ.get("WINDIR") or "C:\\Windows", "Fonts")
                for kok in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                    try:
                        anahtar = winreg.OpenKey(kok, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts")
                    except OSError:
                        continue
                    with anahtar:
                        i = 0
                        while True:
                            try:
                                ad, deger, _ = winreg.EnumValue(anahtar, i)
                            except OSError:
                                break
                            i += 1
                            ad = re.sub(r"\s*\((TrueType|OpenType)\)\s*$", "", ad or "", flags=re.I)
                            for parca in ad.split("&"):
                                aile = re.sub(r"\s+(Bold|Italic|Regular|Oblique|Light|Semibold|Black)(\s|$).*", "", parca.strip(), flags=re.I)
                                if aile and isinstance(deger, str):
                                    tipler.setdefault(aile.lower(), deger if os.path.isabs(deger) else os.path.join(klasor, deger))
            except Exception:
                pass
        _sistem_tipleri = tipler
        return tipler


def _sistem_olcusu(aile):
    """Kurulu yazı tipinin hhea ölçüleri (em 2048'e çevrilmiş) ya da None."""
    with _sistem_kilidi:
        if aile in _sistem_olculeri:
            return _sistem_olculeri[aile]
    yol = _sistem_yazi_tipleri().get((aile or "").lower())
    olcu = None
    if yol and os.path.isfile(yol):
        try:
            from fontTools.ttLib import TTFont
            f = TTFont(yol, fontNumber=0, lazy=True)
            h, em = f["hhea"], float(f["head"].unitsPerEm)
            olcu = (h.ascent * 2048 / em, -h.descent * 2048 / em, h.lineGap * 2048 / em)
            f.close()
        except Exception:
            olcu = None
    with _sistem_kilidi:
        _sistem_olculeri[aile] = olcu
    return olcu


def _kutu(aile, boy):
    """Satır kutusu (pt): ⌊(üst + alt + boşluk) / em × punto⌋ + 1."""
    ust, alt, ara = _olcu(aile)
    return int(math.floor((ust + alt + ara) * boy / 2048.0 + 1e-9)) + 1


def _taban(aile, boy):
    """Kutunun tepesinden taban çizgisine (pt)."""
    t = TABAN_TABLOSU.get(aile)
    if t and 6 <= boy <= 28:
        return ord(t[boy - 6]) - 48
    return int(round(_olcu(aile)[0] * boy / 2048.0))


def _ls_ek(ls, k):
    """LineSpacing'in satıra eklediği (pt): 2 × ⌊LS × K / 2⌋ (yarısı üstte, yarısı altta)."""
    return 2 * int(math.floor(ls * k / 2.0 + 1e-9)) if ls > 0 else 0


def _ls_bul(ek, k):
    """Satıra ek (pt, çift sayıya yuvarlanır) → LineSpacing (UDE'de tam bu eki verecek değer)."""
    m = int(round(ek / 2.0))
    if m <= 0:
        return 0.0
    return round((2 * m + 0.5) / k, 4)


def _boy(v):
    """UDE yalnızca tam punto okuyor (10,5 → 12 sayıyor): en yakın tam sayı."""
    return max(1, int(math.floor(float(v) + 0.5)))


# ---------------------------------------------------------------- metin ve sayı yardımcıları
_GECERSIZ_XML = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f" + chr(0xFFFE) + chr(0xFFFF) + "]")


def _metin_temizle(s):
    if not s:
        return ""
    s = "".join(BOZUK_GLIFLER.get(c, c) for c in s).replace("\r", "")
    s = _GECERSIZ_XML.sub("", s)
    # BMP dışı karakter (emoji): UDE açamıyor; tek kalmış vekil karakterler de
    return "".join(c if ord(c) < 0x10000 and not 0xD800 <= ord(c) <= 0xDFFF else YERINE_KARAKTER for c in s)


def _aile(ad, bayrak=0):
    a = re.sub(r"^[A-Z]{6}\+", "", ad or "").lower()
    a = re.sub(r"[\s_,]", "", a)
    for desen, aile in AILELER:
        if re.search(desen, a):
            return aile
    # Bilinmeyen yazı tipi: bu bilgisayarda kuruluysa adıyla (UDE'yi açan bilgisayarda da kurulu olabilir; değilse UDE yedeğini kullanır)
    ham = re.sub(r"^[A-Z]{6}\+", "", ad or "")
    temel = re.split(r"[-,]", ham)[0]
    temel = re.sub(r"(PS)?(MT|PSMT)?$", "", temel)
    aday = re.sub(r"(?<=[a-zçğıöşü])(?=[A-ZÇĞİÖŞÜ])", " ", temel).strip()
    if aday and aday.lower() in _sistem_yazi_tipleri():
        return aday
    if bayrak & 8:
        return "Courier New"
    if bayrak & 4:
        return "Times New Roman"
    if re.search(r"sans|gothic|grotesk|helv|univers|frutiger|myriad|roboto|opensans|notosans|lato|inter", a):
        return "Arial"
    return VARSAYILAN_AILE


def _sayi(v):
    v = round(float(v), 2)
    if v == int(v):
        return "%d.0" % v
    return ("%.2f" % v).rstrip("0").rstrip(".")


def _argb(renk):
    """PyMuPDF'in sRGB tam sayısı → Java'nın işaretli ARGB'si (-16777216 siyah)."""
    v = (0xFF << 24) | (int(renk) & 0xFFFFFF)
    return v - (1 << 32)


def _guzel(v, alt=None, ust=None, tolerans=0.0):
    """Kenar değeri: [alt, ust) aralığına (UDE'nin tam puntoya yuvarladığı aralık) ya da ± tolerans aralığına düşen yuvarlak değer (cm, inç)
    varsa o, yoksa v."""
    for g in GUZEL_KENARLAR:
        if alt is not None and alt <= g < ust:
            return g
        if tolerans and abs(g - v) <= tolerans:
            return g
    return round(v, 2)


def _xml_kacis(v):
    return str(v).replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def _xml_ozn(d):
    return " ".join('%s="%s"' % (k, _xml_kacis(v)) for k, v in d.items())


# ---------------------------------------------------------------- sayfa verisi
class _Parca:
    """Yazı parçası (PyMuPDF span'i) ya da satır içindeki resim (resim: (bayt, genişlik, yükseklik); metin RESIM_KARAKTERI)."""
    __slots__ = ("x0", "x1", "y", "ust", "alt", "metin", "aile", "boy", "kalin", "italik", "renk", "alti", "resim")

    def __init__(self):
        self.resim = None


class _Satir:
    __slots__ = ("parcalar", "y", "x0", "x1", "ust", "alt", "boy", "aile", "sayfa", "tur", "metin", "K", "C")

    def __init__(self, parcalar, sayfa):
        self.parcalar = sorted(parcalar, key=lambda p: p.x0)
        self.sayfa = sayfa
        self.y = statistics.median(p.y for p in parcalar)
        self.x0 = min(p.x0 for p in parcalar)
        self.x1 = max(p.x1 for p in parcalar)
        self.ust = min(p.ust for p in parcalar)
        self.alt = max(p.alt for p in parcalar)
        agirlik = collections.Counter()
        for p in parcalar:
            if p.resim is None:
                agirlik[(p.aile, p.boy)] += max(1, len(p.metin.strip()))
        self.aile, self.boy = agirlik.most_common(1)[0][0] if agirlik else (VARSAYILAN_AILE, 1)
        self.metin = "".join(p.metin for p in self.parcalar).strip()
        self.tur = "govde"
        self.olc()

    def olc(self):
        """UDE'de satırın kutusu: en büyük taban ve taban altı (karışık boyutlu satır); satır içi resmin altı taban çizgisinde."""
        ust = max(_taban(p.aile, p.boy) if p.resim is None else int(math.floor(p.resim[2] + 1e-9)) for p in self.parcalar)
        alt = max([_kutu(p.aile, p.boy) - _taban(p.aile, p.boy) for p in self.parcalar if p.resim is None] or [0])
        self.C, self.K = ust, ust + alt

    @property
    def yalniz_resim(self):
        return all(p.resim is not None for p in self.parcalar)


class _Gorsel:
    __slots__ = ("x0", "y0", "x1", "y1", "y", "veri", "sayfa", "zemin", "tam_sayfa", "sa")


class _Sayfa:
    __slots__ = ("no", "g", "y", "satirlar", "gorseller", "taranmis", "tanindi", "dusen", "tablolar")

    def __init__(self, no, g, y):
        self.no, self.g, self.y = no, g, y
        self.satirlar, self.gorseller, self.tablolar = [], [], []
        self.taranmis, self.tanindi = False, False
        self.dusen = 0


class _Hucre:
    __slots__ = ("x0", "y0", "x1", "y1", "bas", "span", "satirlar", "paragraflar", "icerik")

    def __init__(self, kutu, bas, span):
        self.x0, self.y0, self.x1, self.y1 = kutu
        self.bas, self.span = bas, span
        self.satirlar, self.paragraflar, self.icerik = [], [], 0


class _TabloSatiri:
    __slots__ = ("y0", "y1", "hucreler", "yuk")

    def __init__(self, y0, y1):
        self.y0, self.y1, self.hucreler, self.yuk = y0, y1, [], 0


class _Tablo:
    """Çizgili tablo (PyMuPDF find_tables): sütun sınırları (x), satırlar ve hücreleri (birleşik hücre birden çok sütun kaplar)."""
    __slots__ = ("x0", "y0", "x1", "y1", "sinirlar", "satirlar", "sayfa", "sa", "yukseklik", "tam_sayfa", "kenarlik")

    def __init__(self, kutu, sinirlar, sayfa):
        self.x0, self.y0, self.x1, self.y1 = kutu
        self.sinirlar, self.satirlar, self.sayfa = sinirlar, [], sayfa
        self.sa, self.yukseklik, self.tam_sayfa, self.kenarlik = 0, 0, False, "borderCell"


def _yatay_cizgiler(pg, mat):
    """Sayfadaki ince yatay çizgiler (altı çizili için): [(x0, x1, y)]."""
    cizgiler = []
    try:
        cizimler = pg.get_drawings()
    except Exception:
        return cizgiler
    if len(cizimler) > EN_FAZLA_CIZIM:
        return cizgiler
    for dr in cizimler:
        for it in dr.get("items") or ():
            if it[0] == "re":
                r = pymupdf.Rect(it[1]) * mat
                if r.height < 1.6 and r.width > 3:
                    cizgiler.append((r.x0, r.x1, (r.y0 + r.y1) / 2))
            elif it[0] == "l":
                p, q = pymupdf.Point(it[1]) * mat, pymupdf.Point(it[2]) * mat
                if abs(p.y - q.y) < 0.5 and abs(p.x - q.x) > 3:
                    cizgiler.append((min(p.x, q.x), max(p.x, q.x), (p.y + q.y) / 2))
    return cizgiler


def _parcalar(pg, mat):
    """Sayfanın yatay yazı parçaları (döndürülmüş sayfada görünen düzlemde)."""
    sozluk = pg.get_text("dict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE | pymupdf.TEXT_MEDIABOX_CLIP)
    yon_mat = pymupdf.Matrix(mat.a, mat.b, mat.c, mat.d, 0, 0)
    cizgiler = None
    out = []
    for b in sozluk.get("blocks", ()):
        if b.get("type") != 0:
            continue
        for l in b.get("lines", ()):
            dx, dy = l.get("dir", (1, 0))
            yon = pymupdf.Point(dx, dy) * yon_mat
            if yon.x < 0.9 or abs(yon.y) > 0.1:   # döndürülmüş yazı (filigran, kenar notu): atlanır
                continue
            for s in l.get("spans", ()):
                metin = _metin_temizle(s.get("text"))
                if not metin:
                    continue
                kutu = pymupdf.Rect(s["bbox"]) * mat
                koken = pymupdf.Point(s["origin"]) * mat
                p = _Parca()
                p.x0, p.x1 = kutu.x0, kutu.x1
                p.y, p.ust, p.alt = koken.y, kutu.y0, kutu.y1
                p.metin = metin
                bayrak = int(s.get("flags") or 0)
                ad = (s.get("font") or "").lower()
                p.aile = _aile(s.get("font"), bayrak)
                p.boy = _boy(s.get("size") or 12)
                p.kalin = bool(bayrak & 16) or bool(re.search(r"bold|black|heavy|semibold|demi", ad))
                p.italik = bool(bayrak & 2) or "italic" in ad or "oblique" in ad
                p.renk = int(s.get("color") or 0) & 0xFFFFFF
                p.alti = False
                if metin.strip():
                    if cizgiler is None:
                        cizgiler = _yatay_cizgiler(pg, mat)
                    p.alti = any(c[0] <= p.x0 + 2 and c[1] >= p.x1 - 2 and -0.5 <= c[2] - p.y <= 3.5 for c in cizgiler)
                out.append(p)
    return out


def _satirlara(parcalar, sayfa):
    """Aynı taban çizgisindeki (±1,5 pt) parçalar bir satır."""
    parcalar = sorted(parcalar, key=lambda p: (round(p.y, 0), p.x0))
    gruplar = []
    for p in parcalar:
        if gruplar and abs(gruplar[-1][-1].y - p.y) < 1.5:
            gruplar[-1].append(p)
        else:
            gruplar.append([p])
    return [s for s in (_Satir(g, sayfa) for g in gruplar) if s.metin]


def _gorseller(doc, pg, mat, sayfa):
    """Sayfadaki görseller: kutuları ve PNG / JPEG baytları (görselin kendi verisi; saydam ya da başka biçimse sayfadan kırpılır)."""
    out = []
    try:
        bilgiler = pg.get_image_info(xrefs=True)
    except Exception:
        return out
    alan = max(pg.rect.width * pg.rect.height, 1.0)
    for b in bilgiler:
        r = (pymupdf.Rect(b["bbox"]) * mat) & pg.rect
        if r.is_empty or r.width < EN_KUCUK_GORSEL or r.height < EN_KUCUK_GORSEL:
            continue
        g = _Gorsel()
        g.x0, g.y0, g.x1, g.y1 = r.x0, r.y0, r.x1, r.y1
        g.y = r.y0
        g.sayfa = sayfa
        g.zemin = r.width * r.height / alan >= ZEMIN_GORSEL
        g.tam_sayfa = False
        g.veri = None
        g.sa = 0
        xref = b.get("xref") or 0
        if xref and not pg.rotation:
            try:
                d = doc.extract_image(xref)
                if d and d.get("ext") in ("png", "jpeg", "jpg") and not d.get("smask") and len(d.get("image") or b"") < 20 * 1024 * 1024:
                    g.veri = d["image"]
            except Exception:
                pass
        if g.veri is None:
            try:
                olcek = araclar._cekirdek().olcek_sinirla(r.width, r.height, GORSEL_DPI / 72.0)
                pix = pg.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), clip=pymupdf.Rect(b["bbox"]) & pg.cropbox, alpha=False, annots=False)
                g.veri = pix.tobytes("png")
            except Exception:
                continue
        out.append(g)
    return out


def sayfa_oku(doc, pg, no):
    """Bir sayfanın verisi (MuPDF kilidinin içinde çağrılır)."""
    mat = pg.rotation_matrix
    r = pg.rect
    s = _Sayfa(no, r.width, r.height)
    parcalar = _parcalar(pg, mat)
    s.gorseller = _gorseller(doc, pg, mat, no)
    yazi = sum(len(p.metin.strip()) for p in parcalar)
    kaplama = sum((g.x1 - g.x0) * (g.y1 - g.y0) for g in s.gorseller) / max(r.width * r.height, 1.0)
    s.taranmis = yazi < 3 and kaplama >= TARAMA_GORSEL
    if not s.taranmis:
        parcalar += _resim_parcalari(s, parcalar)
        s.tablolar, parcalar = _tablolar(pg, parcalar, no)
    s.satirlar = _satirlara(parcalar, no)
    return s


def _cizgi_var(pg):
    """Sayfada tablo çizgisi olabilecek en az üç yatay ve üç dikey ince çizgi var mı (find_tables pahalı: sayfa başına ~0,3 sn)."""
    try:
        cizimler = pg.get_drawings()
    except Exception:
        return False
    if len(cizimler) > EN_FAZLA_CIZIM:
        return False
    yatay = dikey = 0
    for dr in cizimler:
        for it in dr.get("items") or ():
            if it[0] == "re":
                r = pymupdf.Rect(it[1])
                if r.height < 1.6 and r.width > 15:
                    yatay += 1
                elif r.width < 1.6 and r.height > 6:
                    dikey += 1
                elif r.width > 15 and r.height > 6 and dr.get("type") in ("s", "fs"):
                    yatay, dikey = yatay + 2, dikey + 2   # çerçeveli dikdörtgen (hücre)
            elif it[0] == "l":
                p, q = it[1], it[2]
                if abs(p.y - q.y) < 0.5 and abs(p.x - q.x) > 15:
                    yatay += 1
                elif abs(p.x - q.x) < 0.5 and abs(p.y - q.y) > 6:
                    dikey += 1
        if yatay >= 3 and dikey >= 3:
            return True
    return False


def _kumele(degerler, tolerans=1.5):
    out = []
    for v in sorted(degerler):
        if out and v - out[-1][-1] <= tolerans:
            out[-1].append(v)
        else:
            out.append([v])
    return [sum(k) / len(k) for k in out]


def _tablolar(pg, parcalar, no):
    """Sayfanın çizgili tabloları (en az 2 × 2) ve tabloların dışında kalan parçalar. Parça (yazı ya da satır içi resim) ortası hangi
    hücredeyse oraya gider. Döndürülmüş sayfada aranmaz."""
    if pg.rotation or not _cizgi_var(pg):
        return [], parcalar
    try:
        bulunan = pg.find_tables().tables
    except Exception:
        return [], parcalar
    tablolar, kalan = [], list(parcalar)
    for t in bulunan:
        if t.row_count < 2 or t.col_count < 2:
            continue
        kutular = [c for r in t.rows for c in r.cells if c]
        sinirlar = _kumele([x for c in kutular for x in (c[0], c[2])])
        if len(sinirlar) < 3:
            continue
        tablo = _Tablo(tuple(t.bbox), sinirlar, no)
        atanan = set()
        for r in t.rows:
            hucreler = [c for c in r.cells if c]
            if not hucreler:
                continue
            satir = _TabloSatiri(min(c[1] for c in hucreler), max(c[3] for c in hucreler))
            for c in hucreler:
                bas = min(range(len(sinirlar)), key=lambda i: abs(sinirlar[i] - c[0]))
                son = min(range(len(sinirlar)), key=lambda i: abs(sinirlar[i] - c[2]))
                h = _Hucre(c, bas, max(1, son - bas))
                for i, p in enumerate(kalan):
                    if i in atanan:
                        continue
                    ox, oy = (p.x0 + p.x1) / 2, (p.ust + p.alt) / 2
                    if c[0] - 0.5 <= ox <= c[2] + 0.5 and c[1] - 0.5 <= oy <= c[3] + 0.5:
                        h.satirlar.append(p)
                        atanan.add(i)
                satir.hucreler.append(h)
            satir.hucreler.sort(key=lambda h: h.bas)
            tablo.satirlar.append(satir)
        if not atanan:
            continue   # yazısız çizgi ızgarası (form çizgileri): tablo değil
        for h in (h for st in tablo.satirlar for h in st.hucreler):
            h.satirlar = _satirlara(h.satirlar, no)
        kalan = [p for i, p in enumerate(kalan) if i not in atanan]
        tablolar.append(tablo)
    return tablolar, kalan


def _resim_parcalari(sf, parcalar):
    """Sayfanın resimleri (zemin resmi hariç) satır içi parça olur: altı bir satırın taban çizgisine 3 pt yakınsa o satırda, yoksa kendi
    satırında. UDE'de resim yalnızca satırın içinde durur (yazının üstünde ya da yanında duramaz): yazıyla üst üste binen ya da yazı
    satırlarının yanında duran resim (imza, kaşe, doğrulama kodu) alınmaz, sf.dusen'de sayılır."""
    yazilar = [p for p in parcalar if p.metin.strip()]
    tabanlar = sorted({round(p.y, 2) for p in yazilar})
    out, kalan = [], []
    for g in sf.gorseller:
        if g.zemin:
            kalan.append(g)
            continue
        ortusen = any(p.x0 < g.x1 - 1 and p.x1 > g.x0 + 1 and p.alt > g.y0 + 1 and p.ust < g.y1 - 1 for p in yazilar)
        taban = min(tabanlar, key=lambda t: abs(t - g.y1), default=None)
        yan = taban is None or abs(taban - g.y1) > 3
        yanyana = yan and any(p.alt > g.y0 + 1 and p.ust < g.y1 - 1 for p in yazilar)
        if ortusen or yanyana:
            sf.dusen += 1
            continue
        p = _Parca()
        p.x0, p.x1, p.ust, p.alt = g.x0, g.x1, g.y0, g.y1
        p.y = g.y1 if yan else taban
        p.metin, p.aile, p.boy = RESIM_KARAKTERI, VARSAYILAN_AILE, 1
        p.kalin = p.italik = p.alti = False
        p.renk = 0
        p.resim = (g.veri, g.x1 - g.x0, g.y1 - g.y0)
        out.append(p)
    sf.gorseller = kalan
    return out


# ---------------------------------------------------------------- yazı tanıma (taranmış sayfa)
def _tani(yol, pg, no, kilit):
    """Taranmış sayfadaki satırlar (yazi_tanima'nın tanıyıcısıyla): [(x0, y0, x1, y1, metin)] (görünen düzlemde); tanıyıcı yoksa None."""
    from . import yazi_tanima as yt
    try:
        anahtar = yt._anahtar(yol, no)
    except OSError:
        return None
    k = yt._onbellekten(anahtar)
    if k is None:
        if yt._motor is False:
            return None
        with kilit:
            sozcukler = pg.get_text("words")
            gorseller = pg.get_image_info()
            bolgeler = yt._bolgeler(pg, sozcukler, gorseller)
            if not bolgeler:
                return []
            hazirlik = yt._hazirla(pg, sozcukler, bolgeler, gorseller)
        if not hazirlik["cizimler"]:
            return []
        bitti, sonuc = threading.Event(), {}
        yt._calistir(lambda dongu: yt._tamamla(anahtar, hazirlik, dongu), lambda r, h: (sonuc.update(r=r, h=h), bitti.set()))
        if not bitti.wait(TANIMA_BEKLEME):
            return None
        if sonuc.get("h") is not None or (sonuc.get("r") or {}).get("desteklenmiyor"):
            return None
        k = yt._onbellekten(anahtar)
        if k is None:
            return None
    with kilit:
        mat = pg.rotation_matrix
    bloklar = collections.OrderedDict()
    for w in k.get("sozcukler") or ():
        bloklar.setdefault(w[5], []).append(w)
    satirlar = []
    for ws in bloklar.values():
        ws.sort(key=lambda w: w[7])
        kutu = pymupdf.Rect(min(w[0] for w in ws), min(w[1] for w in ws), max(w[2] for w in ws), max(w[3] for w in ws)) * mat
        metin = _metin_temizle(" ".join(w[4] for w in ws))
        if metin.strip():
            satirlar.append((kutu.x0, kutu.y0, kutu.x1, kutu.y1, metin))
    return satirlar


def _tanima_satirlari(satirlar, no):
    """Tanınan satırlar → _Satir (Times New Roman; boyut satırın yüksekliğinden: tanıyıcının kutusu büyük harf tepesinden alt uzantıya)."""
    out = []
    for x0, y0, x1, y1, metin in satirlar:
        p = _Parca()
        p.boy = min(28, max(7, _boy((y1 - y0) / 0.95)))
        p.x0, p.x1, p.ust, p.alt = x0, x1, y0, y1
        p.y = y1 - 0.2 * p.boy
        p.metin, p.aile = metin, VARSAYILAN_AILE
        p.kalin = p.italik = p.alti = False
        p.renk = 0
        out.append(_Satir([p], no))
    out.sort(key=lambda s: (s.y, s.x0))
    return out


# ---------------------------------------------------------------- üst / alt bilgi ve sayfa numarası
_SAYFA_NO = re.compile(r"^(?P<on>\D{0,24}?)(?P<no>\d{1,4})(?:(?P<ayrac>\s*(?:/|-|of)\s*)(?P<toplam>\d{1,4}))?(?P<son>\D{0,16})$")


def _satir_anahtari(s):
    return (round(s.y), re.sub(r"\d+", "#", s.metin))


def _tekrarlayanlar(sayfalar):
    """Sayfaların çoğunda aynı yerde (±2 pt) aynı metinle (rakamlar eşit sayılır) duran üst / alt bölge satırları: anahtar kümesi."""
    n = len(sayfalar)
    if n < 2:
        return set()
    say = collections.Counter()
    ham = collections.defaultdict(collections.Counter)   # anahtar → kaynak metinlerin sayısı (rakamlar dâhil)
    for sf in sayfalar:
        gor = set()
        for s in sf.satirlar:
            if s.y < sf.y * UST_BOLGE or s.y > sf.y * ALT_BOLGE:
                k = _satir_anahtari(s)
                if k not in gor:
                    ham[k[1]][s.metin] += 1
                gor.add(k)
        say.update(gor)
    esik = max(2, math.ceil(n * TEKRAR_ORANI))
    tekrar = set()
    for k in list(say):
        if sum(say.get((k[0] + d, k[1]), 0) for d in (-2, -1, 0, 1, 2)) < esik:
            continue
        # Metin sayfadan sayfaya aynı olmalı; yalnızca sayfa numarası satırı (rakamı her sayfada değişen) ayrık
        ayni = max(ham[k[1]].values()) >= esik
        numara = all(_SAYFA_NO.match(m.strip()) for m in ham[k[1]])
        if ayni or numara:
            tekrar.add(k)
    return tekrar


def _sayfa_numarasi(liste, W):
    """Tekrar eden satır her sayfada o sayfanın numarasıysa {hiza, on, son, toplam, ayrac, satir}; değilse None. liste: [(sayfa no, satır)]."""
    if len(liste) < 2:
        return None
    for no, s in liste:
        m = _SAYFA_NO.match(s.metin.strip())
        if not m or int(m.group("no")) != no:
            return None
    no, s = liste[0]
    m = _SAYFA_NO.match(s.metin.strip())
    yazili = [p for p in s.parcalar if p.metin.strip()] or s.parcalar
    orta = (min(p.x0 for p in yazili) + max(p.x1 for p in yazili)) / 2
    hiza = "orta" if abs(orta - W / 2) < 0.08 * W else ("sag" if orta > W / 2 else "sol")
    rakamli = next((p for p in yazili if re.search(r"\d", p.metin)), yazili[0])
    return {"hiza": hiza, "on": m.group("on") or "", "son": m.group("son") or "", "toplam": m.group("toplam") is not None,
            "ayrac": (m.group("ayrac") or "/").strip() or "/", "satir": s, "parca": rakamli}


# ---------------------------------------------------------------- paragraflar
class _Paragraf:
    """Gövdede bir paragraf (satırları bir ya da birkaç sayfada) ve UDE'deki öznitelikleri."""
    __slots__ = ("satirlar", "hiza", "li", "fi", "ri", "ls", "E", "sa", "sb", "K", "C", "aile", "boy", "sekmeler")

    def __init__(self, satirlar):
        self.satirlar = satirlar
        self.hiza, self.li, self.fi, self.ri, self.ls, self.E, self.sa, self.sb = 0, 0.0, 0.0, 0.0, 0.0, 0, 0, 0
        agirlik = collections.Counter()
        for s in satirlar:
            agirlik[(s.aile, s.boy)] += len(s.metin)
        self.aile, self.boy = agirlik.most_common(1)[0][0]
        self.K = statistics.median_low([s.K for s in satirlar])
        self.C = statistics.median_low([s.C for s in satirlar])
        self.sekmeler = []

    @property
    def ilk(self):
        return self.satirlar[0]

    @property
    def son(self):
        return self.satirlar[-1]


class _Yerlesim:
    """Kenarlar ve yazı alanı (kaynağın düzleminde): sol (yazının başladığı x), sag (iki yana yaslı satırların bittiği x)."""

    def __init__(self, sol, sag):
        self.sol, self.sag = sol, sag


def _yerlesim(govde, W):
    sol_adaylar = sorted(s.x0 for s in govde)
    sol = sol_adaylar[0]
    for v in sol_adaylar:   # tek bir taşan satır (kenara yazılmış not) kenarı belirlemesin: en az iki satırın başladığı en soldaki x
        if v - sol_adaylar[0] > 30:
            break
        if sum(1 for w in sol_adaylar if abs(w - v) <= 1.0) >= 2:
            sol = v
            break
    # Sağ: iki yana yaslı satırlar UDE'de yazı alanının kenarına ±1 pt yakın biter (sözcük konumları tam puntoya yuvarlanıyor); en sağdaki
    # satırlardan biraz içerisi (kenar sonra yuvarlak değere oturtulur)
    en_sag = max(s.x1 for s in govde)
    yakin = [s.x1 for s in govde if s.x1 >= en_sag - 3.0]
    if len(yakin) >= max(2, 0.12 * len(govde)):
        sag = en_sag - 0.3
    else:
        # Sağ kenara dayanan satır az (kısa satırlı belge, sola yaslı liste): yazı alanı en uzun satırla değil, sol kenarın simetriğiyle
        sag = max(en_sag, W - sol)
    return _Yerlesim(sol, sag)


def _paragraflara(satirlar, yer):
    """Bitişik satırları paragraflara böler; sayfa sınırında süren paragraf (önceki satır tam, sonraki aynı girintide) bölünmez."""
    sonuc, paragraf, onceki = [], [], None
    genislik = max(yer.sag - yer.sol, 50.0)
    for s in satirlar:
        if onceki is not None and (s.yalniz_resim or onceki.yalniz_resim):
            sonuc.append(_Paragraf(paragraf))
            paragraf = []
        elif onceki is not None:
            tam = onceki.x1 >= yer.sag - max(2.5 * s.boy, 0.1 * genislik)
            if s.sayfa != onceki.sayfa:
                devam_x = paragraf[1].x0 if len(paragraf) >= 2 else yer.sol
                yeni = not (tam and abs(s.x0 - devam_x) <= 3 and abs(onceki.boy - s.boy) <= 1 and onceki.tur == s.tur == "govde")
            else:
                ara = s.y - onceki.y
                kutu = max(s.K, onceki.K)
                yeni = (ara > 1.6 * kutu or ara < 0.5 * kutu
                        or not tam
                        or (len(paragraf) >= 2 and abs(s.x0 - paragraf[1].x0) > 3)
                        or (len(paragraf) == 1 and s.x0 - yer.sol > 3 and abs(s.x0 - onceki.x0) > 3 and s.x0 > onceki.x0)
                        or abs(onceki.boy - s.boy) > 1
                        or (len(paragraf) >= 2 and paragraf[-1].sayfa == s.sayfa == paragraf[-2].sayfa
                            and abs(ara - (paragraf[-1].y - paragraf[-2].y)) > 0.3 * kutu))
            if yeni:
                sonuc.append(_Paragraf(paragraf))
                paragraf = []
        paragraf.append(s)
        onceki = s
    if paragraf:
        sonuc.append(_Paragraf(paragraf))
    return sonuc


def _paragraf_ozellikleri(p, yer, sol_kenar_x, sag_kenar_x=None):
    """Hizalama, girintiler, satır aralığı (UDE'nin modeliyle). sol_kenar_x: UDE'de yazının başlayacağı x (⌊leftMargin⌋ + 1); sag_kenar_x:
    UDE'de yazı alanının sağ kenarı. Yazı alanından taşan satır (kenara yazılmış alt bilgi, imza notu) eksi girintiyle yerinde kalır."""
    satirlar = p.satirlar
    x0s = [s.x0 for s in satirlar]
    x1s = [s.x1 for s in satirlar]
    sag = yer.sag
    genislik = sag - yer.sol
    n = len(satirlar)
    if n > 1 and all(abs(x - sag) < 3 for x in x1s[:-1]):
        hiza = 3
    elif n <= 3 and all(abs((a - yer.sol) - (sag - b)) < 6 for a, b in zip(x0s, x1s)) and x0s[0] - yer.sol > 12:
        hiza = 1
    elif all(abs(b - sag) < 3 for b in x1s) and min(x0s) - yer.sol > 0.25 * genislik:
        hiza = 2
    else:
        hiza = 0
    p.hiza = hiza
    if hiza in (1, 2):
        p.li = p.fi = 0.0
    else:
        devam = min(x0s[1:]) if n > 1 else x0s[0]
        d_devam = devam - sol_kenar_x
        d_ilk = x0s[0] - sol_kenar_x
        # UDE'de x = ⌊leftMargin⌋ + 1 + ⌊LeftIndent (+ FirstLineIndent)⌋: yarım punto eklenince taban doğru tam sayıya düşer
        p.li = round(d_devam + 0.5, 2) if abs(d_devam) > 0.4 else 0.0
        hedef_ilk = round(d_ilk + 0.5, 2) if abs(d_ilk) > 0.4 else 0.0
        p.fi = round(hedef_ilk - p.li, 2) if abs(hedef_ilk - p.li) >= 1.0 else 0.0
    if sag_kenar_x is not None and max(x1s) > sag_kenar_x + 0.5 and hiza != 3:
        p.ri = -round(max(x1s) - sag_kenar_x + 2.0, 1)
        if hiza == 2:
            p.ri = -round(max(x1s) - sag_kenar_x + 0.5, 1)
    # Satır aralığı: aynı sayfadaki ardışık satırların adımı − K → E (çift), LineSpacing
    adimlar = [satirlar[i + 1].y - satirlar[i].y for i in range(n - 1) if satirlar[i + 1].sayfa == satirlar[i].sayfa
               and not satirlar[i].yalniz_resim]
    if adimlar:
        ek = statistics.median(adimlar) - p.K
        p.ls = _ls_bul(ek, p.K) if ek >= 1.0 else 0.0
    p.E = _ls_ek(p.ls, p.K)


def _bosluk_hesapla(onceki, p):
    """İki paragraf arasındaki SpaceAbove (tam punto): taban çizgileri arası eksi UDE'de olağan adım."""
    a, b = onceki.son, p.ilk
    olagan = (onceki.K - onceki.C) + onceki.E // 2 + p.E // 2 + p.C
    return int(round((b.y - a.y) - olagan))


# ---------------------------------------------------------------- XML yazıcı
class _Yazici:
    def __init__(self):
        self.havuz = []
        self.uzunluk = 0
        self.xml = []

    def metin(self, s):
        s = s.replace("]]>", "]]" + SIFIR_BOSLUK + ">")
        bas = self.uzunluk
        self.havuz.append(s)
        self.uzunluk += len(s.encode("utf-16-le")) // 2
        return bas, self.uzunluk - bas

    @staticmethod
    def _icerik(bas, n, oz):
        aile, boy, kalin, italik, renk, alti = oz
        a = ['startOffset="%d"' % bas, 'length="%d"' % n, 'family="%s"' % _xml_kacis(aile), 'size="%d"' % boy]
        if kalin:
            a.append('bold="true"')
        if italik:
            a.append('italic="true"')
        if alti:
            a.append('underline="true"')
        if renk:
            a.append('foreground="%d"' % _argb(renk))
        return "<content %s />" % " ".join(a)

    def satir_ici(self, s, taban_x):
        """Satırın parçaları [(metin, parça)] ve sekme durakları (taban_x'e göre)."""
        out, sekmeler = [], []
        parcalar = s.parcalar
        bosluklar = [parcalar[i].x0 - parcalar[i - 1].x1 for i in range(1, len(parcalar))]
        orta_bosluk = statistics.median(bosluklar) if bosluklar else 0
        for i, p in enumerate(parcalar):
            m = p.metin
            if i:
                onceki = parcalar[i - 1]
                bosluk = p.x0 - onceki.x1
                bw = 0.25 * p.boy
                sekme = bosluk > max(3.2 * bw, 8.0) and (len(bosluklar) < 3 or bosluk > 2.2 * max(orta_bosluk, bw))
                if sekme:
                    if out and out[-1][0].endswith(" "):
                        out[-1] = (out[-1][0].rstrip(" "), out[-1][1])
                    out.append(("\t", p))
                    sekmeler.append(p.x0 - taban_x)
                    m = m.lstrip(" ")
                elif bosluk > p.boy * 0.12 and not onceki.metin.endswith(" ") and not m.startswith(" "):
                    out.append((" ", p))
            else:
                m = m.lstrip(" ")
            out.append((m, p))
        return out, sekmeler

    def paragraf(self, p, sol_kenar_x, hedef=None):
        """Paragraf öğesi ve metni havuza."""
        oz = collections.OrderedDict()
        oz["Alignment"] = str(p.hiza)
        if p.li:
            oz["LeftIndent"] = _sayi(p.li)
        if p.fi:
            oz["FirstLineIndent"] = _sayi(p.fi)
        if p.ri:
            oz["RightIndent"] = _sayi(p.ri)
        if p.ls > 0:
            oz["LineSpacing"] = repr(p.ls)
        if p.sa > 0:
            oz["SpaceAbove"] = "%d.0" % p.sa
        if p.sb > 0:
            oz["SpaceBelow"] = "%d.0" % p.sb
        taban = sol_kenar_x + int(math.floor(p.li + 1e-9))
        satir_icleri = [self.satir_ici(s, taban) for s in p.satirlar]
        sekmeler = sorted({round(x, 1) for _, sek in satir_icleri for x in sek if x > 1})
        if sekmeler:
            oz["TabSet"] = ",".join("%s:0:0" % _sayi(t) for t in sekmeler)
        ici = []
        for i, (parcalar, _) in enumerate(satir_icleri):
            ici.extend(parcalar)
            if i < len(satir_icleri) - 1 and ici:
                son = ici[-1][0]
                if son and not son.endswith((" ", "-", "\t")):
                    ici.append((" ", parcalar[-1][1] if parcalar else p.satirlar[i].parcalar[-1]))
        birlesik = []
        for m, parca in ici:
            if not m:
                continue
            if parca.resim is not None and m == RESIM_KARAKTERI:
                birlesik.append([m, ("resim", parca.resim)])
                continue
            ozellik = (parca.aile, parca.boy, parca.kalin, parca.italik, parca.renk, parca.alti and bool(m.strip()))
            if birlesik and birlesik[-1][1][0] != "resim" and (birlesik[-1][1] == ozellik or (not m.strip() and birlesik[-1][1][:5] == ozellik[:5])):
                birlesik[-1][0] += m
            else:
                birlesik.append([m, ozellik])
        if birlesik and birlesik[-1][1][0] != "resim":
            birlesik[-1][0] = birlesik[-1][0].rstrip(" ")
        xml = ["<paragraph %s>" % _xml_ozn(oz)]
        for m, ozellik in birlesik:
            if not m:
                continue
            bas, n = self.metin(m)
            if ozellik[0] == "resim":
                veri, gen, yuk = ozellik[1]
                xml.append('<image imageData="%s" width="%s" height="%s" startOffset="%d" length="1" />'
                           % (base64.b64encode(veri).decode("ascii"), _sayi(gen), _sayi(yuk), bas))
            else:
                xml.append(self._icerik(bas, n, ozellik))
        bas, n = self.metin("\n")
        metinler = [o for _, o in birlesik if o[0] != "resim"]
        son = metinler[-1] if metinler else (VARSAYILAN_AILE, 1, False, False, 0, False)
        xml.append(self._icerik(bas, n, son[:5] + (False,)))
        xml.append("</paragraph>")
        (hedef if hedef is not None else self.xml).append("".join(xml))

    def bos_paragraf(self, aile=VARSAYILAN_AILE, boy=12, hedef=None):
        bas, n = self.metin("\n")
        (hedef if hedef is not None else self.xml).append(
            '<paragraph Alignment="0"><content startOffset="%d" length="%d" family="%s" size="%d" /></paragraph>'
            % (bas, n, _xml_kacis(aile), boy))

    def resim(self, veri, genislik, yukseklik, hiza=0, sol=0.0, sa=0):
        oz = collections.OrderedDict(Alignment=str(hiza))
        if sol > 0.5 and hiza == 0:
            oz["LeftIndent"] = _sayi(sol)
        if sa > 0:
            oz["SpaceAbove"] = "%d.0" % sa
        oz["LineSpacing"] = "0.0"
        bas, _ = self.metin(RESIM_KARAKTERI)
        bas2, n2 = self.metin("\n")
        self.xml.append('<paragraph %s><image imageData="%s" width="%s" height="%s" startOffset="%d" length="1" />'
                        '<content startOffset="%d" length="%d" family="Times New Roman" size="1" /></paragraph>'
                        % (_xml_ozn(oz), base64.b64encode(veri).decode("ascii"), _sayi(genislik), _sayi(yukseklik), bas, bas2, n2))

    def tablo(self, t, no):
        """Tablo öğesi: sütun genişlikleri (columnSpans, göreli; UDE tabloyu yazı alanının genişliğine yayar), birleşik hücreli satırın
        kendi columnSpans'ı; hücre paragrafları satır satır, soldan sağa (havuz sırası)."""
        n = len(t.sinirlar) - 1
        genislikler = [max(1, int(round(t.sinirlar[i + 1] - t.sinirlar[i]))) for i in range(n)]
        xml = ['<table tableName="Tablo%d" columnCount="%d" columnSpans="%s" border="%s">'
               % (no, n, ",".join(str(g) for g in genislikler), t.kenarlik)]
        for ri, satir in enumerate(t.satirlar):
            oz = 'rowName="row%d" rowType="dataRow"' % (ri + 1)
            if len(satir.hucreler) != n or any(h.span > 1 for h in satir.hucreler):
                oz += ' columnSpans="%s"' % ",".join(str(sum(genislikler[h.bas:h.bas + h.span])) for h in satir.hucreler)
            xml.append("<row %s>" % oz)
            for h in satir.hucreler:
                parca = []
                if h.paragraflar:
                    for p in h.paragraflar:
                        self.paragraf(p, h.x0, hedef=parca)
                else:
                    self.bos_paragraf(hedef=parca)
                xml.append("<cell>" + "".join(parca) + "</cell>")
            xml.append("</row>")
        xml.append("</table>")
        self.xml.append("".join(xml))

    def sayfa_sonu(self):
        bas, n = self.metin(SIFIR_BOSLUK + "\n")
        self.xml.append('<page-break><paragraph Alignment="0"><content startOffset="%d" length="%d" family="Times New Roman" size="1" />'
                        '</paragraph></page-break>' % (bas, n))


# ---------------------------------------------------------------- dönüştürme
def _sayfa_bicimi(W, H):
    """(mediaSizeName, yön, kâğıt): kâğıt ölçüsü UDE'nin kodlarından en yakını; yatay 0, dikey 1."""
    yatay = W > H + 1
    g, y = (H, W) if yatay else (W, H)
    en = min(KAGITLAR, key=lambda k: abs(k[1] - g) + abs(k[2] - y))
    return en[0], (0 if yatay else 1), en


def pdf_udf(kaynak, cikti, secenekler, ilerleme, baglam):
    ad = os.path.basename(kaynak)
    kilit = baglam.mupdf()
    with kilit:
        doc = araclar._pdf_ac(kaynak)
    uyarilar = []
    try:
        n = doc.page_count
        if n == 0:
            raise OgeHatasi("bozuk", "Belgede sayfa yok: %s" % ad)
        sayfalar = []
        tanima_yok = 0
        for i in range(n):
            ilerleme(0.8 * i / n, "Sayfa %d/%d okunuyor" % (i + 1, n))
            with kilit:
                pg = doc[i]
                sf = sayfa_oku(doc, pg, i + 1)
            if sf.taranmis:
                satirlar = _tani(kaynak, pg, i + 1, kilit)
                if satirlar:
                    sf.satirlar = _tanima_satirlari(satirlar, i + 1)
                    sf.tanindi = True
                    sf.gorseller = []   # tarama ve üstündeki küçük görseller (kaşe) tanınan yazının yerine geçmez
                else:
                    tanima_yok += 1
                    with kilit:
                        olcek = araclar._cekirdek().olcek_sinirla(sf.g, sf.y, TARAMA_DPI / 72.0)
                        pix = pg.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), alpha=False, annots=True)
                        veri = pix.tobytes("jpeg", jpg_quality=85)
                    g = _Gorsel()
                    g.x0, g.y0, g.x1, g.y1, g.y = 0.0, 0.0, sf.g, sf.y, 0.0
                    g.veri, g.sayfa, g.zemin, g.tam_sayfa, g.sa = veri, i + 1, False, True, 0
                    sf.gorseller = [g]
            sayfalar.append(sf)
        ilerleme(0.85, "Paragraflar kuruluyor")
        sonuc = _udf_kur(sayfalar, uyarilar)
        if tanima_yok:
            uyarilar.append("%d taranmış sayfanın yazısı tanınamadı (bu bilgisayarda yazı tanıyıcı yok): o sayfalar resim olarak kondu."
                            % tanima_yok)
        elif any(s.tanindi for s in sayfalar):
            uyarilar.append("Taranmış sayfaların yazısı yazı tanıma ile çıkarıldı; yanlış okunan harfler olabilir.")
        ilerleme(0.95, "Kaydediliyor")
        with zipfile.ZipFile(cikti, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("content.xml", sonuc["xml"].encode("utf-8"))
    finally:
        with kilit:
            araclar._kapat(doc)
    r = {"sayfa": n, "paragraf": sonuc["paragraf"]}
    if uyarilar:
        r["uyari"] = " ".join(uyarilar)
    return r


def _ust_alt_ayir(sayfalar, W):
    """Tekrar eden üst / alt bilgi satırlarını işaretler; sayfa numarası. Döner: (üst bilgi satırları, alt bilgi satırları, numara)."""
    tekrar = _tekrarlayanlar(sayfalar)
    adaylar = []
    for sf in sayfalar:
        for s in sf.satirlar:
            k = _satir_anahtari(s)
            if any((k[0] + d, k[1]) in tekrar for d in (-2, -1, 0, 1, 2)):
                adaylar.append((sf.no, s, "ust" if s.y < sf.y / 2 else "alt"))
    # Bölgede sayfa başına çok satır tekrar ediyorsa (benzer biçimli liste, tablo satırları) üst / alt bilgi değildir
    for bolge in ("ust", "alt"):
        say = collections.Counter(no for no, _, b in adaylar if b == bolge)
        if say and sorted(say.values())[len(say) // 2] > EN_FAZLA_BILGI_SATIRI:
            adaylar = [a for a in adaylar if a[2] != bolge]
    ust, alt = [], []
    for no, s, bolge in adaylar:
        s.tur = bolge
        (ust if bolge == "ust" else alt).append((no, s))
    numara = None
    for grup in (alt, ust):
        adaylar = collections.defaultdict(list)
        for no, s in grup:
            if _SAYFA_NO.match(s.metin.strip()):
                adaylar[re.sub(r"\d+", "#", s.metin.strip())].append((no, s))
        for liste in adaylar.values():
            numara = _sayfa_numarasi(liste, W)
            if numara:
                for _, s in liste:
                    s.tur = "numara"
                break
        if numara:
            break

    def ilk_sayfadakiler(grup, tur):
        ilk_no = min((no for no, s in grup if s.tur == tur), default=None)
        return sorted((s for no, s in grup if no == ilk_no and s.tur == tur), key=lambda s: (s.y, s.x0))
    ust_ilk = ilk_sayfadakiler(ust, "ust")
    # Üst bilgi ilk sayfada yoksa (UDE'de startPage="2": ilk sayfada mahkeme başlığı, sonrakilerde esas numarası gibi)
    ikinciden = bool(ust_ilk) and len(sayfalar) > 1 and not any(no == 1 for no, s in ust if s.tur == "ust")
    return ust_ilk, ilk_sayfadakiler(alt, "alt"), numara, ikinciden


def _ayrik_alt_satirlar(sf):
    """Tek sayfalık belgede sayfanın dibinde, gövdeden büyük bir boşlukla ayrılmış satırlar (alt bilgi; tekrarından anlaşılamaz)."""
    satirlar = sorted((s for s in sf.satirlar if s.tur == "govde"), key=lambda s: s.y)
    alt = []
    for i in range(len(satirlar) - 1, 0, -1):
        s, onceki = satirlar[i], satirlar[i - 1]
        if s.y < sf.y * 0.88:
            break
        alt.insert(0, s)
        if s.y - onceki.y > 3 * max(s.K, onceki.K):
            for x in alt:
                x.tur = "alt"
            return alt
    return []


def _udf_kur(sayfalar, uyarilar):
    W, H = sayfalar[0].g, sayfalar[0].y
    medya, yon, kagit = _sayfa_bicimi(W, H)
    ust_satirlar, alt_satirlar, numara, ust_ikinciden = _ust_alt_ayir(sayfalar, W)
    if len(sayfalar) == 1 and not alt_satirlar:
        alt_satirlar = _ayrik_alt_satirlar(sayfalar[0])
    govde = [s for sf in sayfalar for s in sf.satirlar if s.tur == "govde"]
    if not govde and not any(sf.gorseller for sf in sayfalar):
        raise OgeHatasi("bozuk", "Belgede çevrilecek yazı bulunamadı.")
    yer = _yerlesim(govde or ust_satirlar + alt_satirlar or [], W) if (govde or ust_satirlar or alt_satirlar) else _Yerlesim(70.87, W - 70.87)

    # Sol kenar: UDE yazıyı ⌊leftMargin⌋ + 1'e koyar; kaynağın sol x'inden yarım punto aşağısı (aralıkta yuvarlak değer varsa o)
    lm_ham = yer.sol - 0.5
    lm = max(EN_AZ_KENAR, _guzel(lm_ham, alt=math.floor(lm_ham), ust=math.floor(lm_ham) + 1))
    sol_kenar_x = int(math.floor(lm)) + 1
    # Sağ kenar: yazı alanının genişliği = sağ x − UDE'deki sol x
    rm = W - lm - (yer.sag - sol_kenar_x)
    rm = max(EN_AZ_KENAR, _guzel(rm, tolerans=1.0))
    if W - lm - rm < 100:
        lm = rm = max(EN_AZ_KENAR, (W - 100) / 2)
        sol_kenar_x = int(math.floor(lm)) + 1
    sag_kenar_x = sol_kenar_x + (W - lm - rm)
    # Yazı alanından geniş satır içi resim alana sığdırılır (UDE resmi satırın içinde tutar)
    alan = W - lm - rm
    for sf in sayfalar:
        for s in sf.satirlar:
            degisti = False
            for p in s.parcalar:
                if p.resim is not None and p.resim[1] > alan:
                    kat = alan / p.resim[1]
                    p.resim = (p.resim[0], alan, p.resim[2] * kat)
                    p.x1 = p.x0 + alan
                    degisti = True
            if degisti:
                s.olc()
                s.x1 = max(p.x1 for p in s.parcalar)
    dusen = sum(sf.dusen for sf in sayfalar)
    if dusen:
        uyarilar.append("%d resim yazının üstünde ya da yanında duruyordu (imza, kaşe, doğrulama kodu gibi); UYAP Doküman Editörü'nde "
                        "resim yalnızca satırın içinde durabildiği için alınmadı." % dusen)

    # Gövde öğeleri: paragraflar (sayfalar arasında süren tek parça) ve resimler, kaynağın sırasıyla
    satirlar = sorted(govde, key=lambda s: (s.sayfa, s.y, s.x0))
    paragraflar = _paragraflara(satirlar, yer)
    for p in paragraflar:
        _paragraf_ozellikleri(p, yer, sol_kenar_x, sag_kenar_x)
    ogeler = [("p", p, p.ilk.sayfa, p.ilk.y) for p in paragraflar]
    for sf in sayfalar:
        for t in sf.tablolar:
            _tablo_hazirla(t, W)
            ogeler.append(("t", t, sf.no, t.y0))
    for sf in sayfalar:
        for g in sf.gorseller:
            if g.zemin and sf.satirlar and sf.no == 1:
                continue   # zemin resmi (antet): bgImage
            if g.zemin and sf.satirlar:
                continue
            ogeler.append(("g", g, sf.no, g.y0 + 0.5))
    ogeler.sort(key=lambda o: (o[2], o[3]))

    # Paragraflar arası boşluk (SpaceAbove): aynı sayfada ardışık iki paragraf arasından; sayfa başındaki paragraf için belgenin olağanı
    boslukla = collections.defaultdict(list)
    onceki = None
    for tur, oge, sayfa, _ in ogeler:
        if onceki is not None:
            o_tur, o_oge, o_sayfa = onceki
            ayni = o_sayfa == sayfa
            if tur == "p" and o_tur == "p" and ayni:
                oge.sa = max(0, _bosluk_hesapla(o_oge, oge))
                boslukla[(oge.aile, oge.boy, oge.hiza)].append(oge.sa)
            elif tur == "p" and o_tur in ("g", "t") and ayni:
                oge.sa = max(0, int(round(oge.ilk.y - oge.E // 2 - oge.C - o_oge.y1 - (1 if o_tur == "t" else 0))))
            elif tur in ("g", "t") and o_tur == "p" and ayni:
                oge.sa = max(0, int(round(oge.y0 + (1 if tur == "t" else 0) - (o_oge.son.y + (o_oge.K - o_oge.C) + o_oge.E // 2))))
            elif tur in ("g", "t") and o_tur in ("g", "t") and ayni:
                oge.sa = max(0, int(round(oge.y0 - o_oge.y1)))
        onceki = (tur, oge, oge.son.sayfa if tur == "p" else sayfa)
    tablo_say = 0
    onceki = None
    for tur, oge, sayfa, _ in ogeler:
        if tur == "p" and (onceki is None or onceki[0] != "p" or onceki[1].son.sayfa != oge.ilk.sayfa) and onceki is not None:
            liste = boslukla.get((oge.aile, oge.boy, oge.hiza)) or []
            oge.sa = int(statistics.median_low(liste)) if len(liste) >= 3 else 0
        onceki = (tur, oge)

    # Üst bilgi: ilk taban çizgisi ⌊headerFOffset⌋ + C
    ust_par = _paragraflara(ust_satirlar, yer) if ust_satirlar else []
    for p in ust_par:
        _paragraf_ozellikleri(p, yer, sol_kenar_x, sag_kenar_x)
    hf = 20.0
    ust_alt_kenar = 0
    if ust_par:
        p0 = ust_par[0]
        hf = float(max(1, int(round(p0.ilk.y - p0.C - p0.E // 2))))
        for i in range(1, len(ust_par)):
            ust_par[i].sa = max(0, _bosluk_hesapla(ust_par[i - 1], ust_par[i]))
        y = int(hf)
        for i, p in enumerate(ust_par):
            y += (p.sa if i else 0) + (len(p.satirlar)) * (p.K + p.E)
        ust_alt_kenar = y

    # Üst kenar: sayfa başındaki satırın taban çizgisi = ⌊topMargin⌋ + SpaceAbove + E/2 + C. Sayfaların ilk satırlarından en yukarıdaki
    # (sayfa sınırında süren paragrafın satırı boşluksuz başlar; ilk sayfanın ilk paragrafının önünde boşluk olabilir), ilk sayfanın
    # ilk paragrafı aradaki farkı SpaceAbove olarak alır
    tepeler = []
    for tur, oge, sayfa, _ in ogeler:
        if tur != "p":
            continue
        for i, s in enumerate(oge.satirlar):
            if i == 0 or oge.satirlar[i - 1].sayfa != s.sayfa:
                ilk_mi = not any(o[1] is not oge and o[0] == "p" and o[1].son.sayfa == s.sayfa and o[1].son.y < s.y for o in ogeler)
                if ilk_mi:
                    sa = 0 if i else (oge.sa if s.sayfa != 1 else 0)
                    tepeler.append((s.sayfa, int(round(s.y - oge.E // 2 - oge.C - sa)), oge, i))
    ilk_p = next((o[1] for o in ogeler if o[0] == "p"), None)
    if ust_ikinciden:
        tepeler = [t for t in tepeler if t[0] == 1] or tepeler
    if tepeler:
        tepe = min(t[1] for t in tepeler) if len(tepeler) > 1 else tepeler[0][1]
        if ilk_p is not None:
            birinci = next((t for t in tepeler if t[2] is ilk_p and t[3] == 0), None)
            ilk_p.sa = max(0, birinci[1] - tepe) if birinci else 0
    else:
        tepe = int(round(min((g.y0 for sf in sayfalar for g in sf.gorseller), default=56.69)))
    tepe = max(int(EN_AZ_KENAR), min(tepe, int(H * 0.45)))
    tm = _guzel(tepe + 0.5, alt=tepe, ust=tepe + 1)
    govde_tepe = max(tepe, ust_alt_kenar)
    tepeler_sayfa = {1: tepe if ust_ikinciden else govde_tepe}   # _sayfala: sayfanın gövdesinin başladığı y (UDE'de)

    # Alt bilgi ve sayfa numarası: son satırın kutusunun altı ⌊H − footerFOffset⌋
    alt_par = _paragraflara(alt_satirlar, yer) if alt_satirlar else []
    for p in alt_par:
        _paragraf_ozellikleri(p, yer, sol_kenar_x, sag_kenar_x)
    for i in range(1, len(alt_par)):
        alt_par[i].sa = max(0, _bosluk_hesapla(alt_par[i - 1], alt_par[i]))
    ff = 20.0
    alt_ust_kenar = None
    if alt_par or numara:
        diplar = []
        if numara:
            s = numara["satir"]
            diplar.append(s.y + (s.K - s.C))
        if alt_par:
            son = alt_par[-1]
            diplar.append(son.son.y + (son.K - son.C) + son.E // 2)
        dip = max(diplar)
        dip_int = int(round(dip))
        ff = max(1.0, round(H - dip_int - 0.5, 2))
        yuk = sum((p.sa if i else 0) + len(p.satirlar) * (p.K + p.E) for i, p in enumerate(alt_par))
        if numara:
            p0 = numara["parca"]
            yuk += _kutu(p0.aile, p0.boy)
        alt_ust_kenar = int(math.floor(H - ff)) - yuk

    # Alt kenar ve sayfa sonları: kaynağın her dolu sayfası UDE'de aynı satırda bitsin
    bm, sonlar = _sayfala(ogeler, sayfalar, H, lambda no: tepeler_sayfa.get(no, govde_tepe), alt_ust_kenar)

    # ---- XML
    yz = _Yazici()
    if ust_par:
        parca = []
        for p in ust_par:
            yz.paragraf(p, sol_kenar_x, hedef=parca)
        yz.xml.append(('<header startPage="2">' if ust_ikinciden else "<header>") + "".join(parca) + "</header>")
    paragraf_say = 0
    son_sayfa = None
    for tur, oge, sayfa, _ in ogeler:
        if son_sayfa is not None and sayfa != son_sayfa and (son_sayfa in sonlar):
            yz.sayfa_sonu()
        son_sayfa = oge.son.sayfa if tur == "p" else sayfa
        if tur == "t":
            tablo_say += 1
            yz.tablo(oge, tablo_say)
            continue
        if tur == "g":
            g = oge
            gen, yuk = g.x1 - g.x0, g.y1 - g.y0
            alan_g = W - lm - rm
            if g.tam_sayfa or gen > alan_g:   # sayfa resmi (tanınamayan tarama) ya da yazı alanından geniş resim: alana sığdır
                kat = min(alan_g / max(gen, 1e-6), (H - tm - bm - 4) / max(yuk, 1e-6), 1.0 if not g.tam_sayfa else 10.0)
                gen, yuk = gen * kat, yuk * kat
            orta = (g.x0 + g.x1) / 2
            if abs(orta - (yer.sol + yer.sag) / 2) < 15:
                hiza = 1
            elif g.x1 > yer.sag - 5 and g.x0 > yer.sol + 40:
                hiza = 2
            else:
                hiza = 0
            yz.resim(g.veri, gen, yuk, hiza=hiza, sol=max(0.0, g.x0 - sol_kenar_x + 0.5) if hiza == 0 else 0.0, sa=g.sa)
            continue
        yz.paragraf(oge, sol_kenar_x)
        paragraf_say += 1
    if not ogeler:
        yz.bos_paragraf()
    if alt_par or numara:
        parca = []
        for p in alt_par:
            yz.paragraf(p, sol_kenar_x, hedef=parca)
        oz = {}
        if numara:
            p0 = numara["parca"]
            spec = 8 | {"orta": 32, "sag": 64, "sol": 0}[numara["hiza"]] | (2048 if numara["toplam"] else 0)
            oz = collections.OrderedDict([
                ("pageNumber-spec", "BSP32_%d" % spec), ("pageNumber-seperator", numara["ayrac"] if numara["toplam"] else "/"),
                ("pageNumber-fontBold", "true" if p0.kalin else "false"), ("pageNumber-fontItalic", "true" if p0.italik else "false"),
                ("pageNumber-fontFace", p0.aile), ("pageNumber-fontSize", str(p0.boy)), ("pageNumber-color", str(_argb(p0.renk))),
                ("pageNumber-foreStr", numara["on"]), ("pageNumber-afterStr", numara["son"]), ("pageNumber-pageStartNumStr", "")])
            yz.bos_paragraf(p0.aile, p0.boy, hedef=parca)
        yz.xml.append(("<footer %s>" % _xml_ozn(oz) if oz else "<footer>") + "".join(parca) + "</footer>")

    zemin = ""
    for g in sayfalar[0].gorseller:
        if g.zemin and sayfalar[0].satirlar:
            zemin = ('<bgImage bgImageSource="" bgImageData="%s" bgImageLeftMargin="%d" bgImageUpMargin="%d" bgImageRigtMargin="%d" '
                     'bgImageBottomMargin="%d" />' % (base64.b64encode(g.veri).decode("ascii"), int(round(max(0, g.x0))),
                                                      int(round(max(0, g.y0))), int(round(max(0, W - g.x1))), int(round(max(0, H - g.y1)))))
            break
    pf = ('<pageFormat mediaSizeName="%s" leftMargin="%s" rightMargin="%s" topMargin="%s" bottomMargin="%s" paperOrientation="%d" '
          'headerFOffset="%s" footerFOffset="%s" />') % (medya, _sayi(lm), _sayi(rm), _sayi(tm), _sayi(bm), yon, _sayi(hf), _sayi(ff))
    xml = (ONSOZ + "<content><![CDATA[" + "".join(yz.havuz) + "]]></content><properties>" + pf + zemin +
           "</properties>\n<elements resolver=\"hvl-default\" >\n" + "\n".join(yz.xml) + "\n</elements>" + STILLER + "\n</template>\n")
    if abs(kagit[1] - min(W, H)) > 3 or abs(kagit[2] - max(W, H)) > 3:
        uyarilar.append("Sayfa ölçüsü (%d × %d pt) UYAP Doküman Editörü'nün kâğıtlarından en yakınına çevrildi." % (round(W), round(H)))
    return {"xml": xml, "paragraf": paragraf_say}


def _tablo_hazirla(t, W):
    """Hücrelerin paragrafları (girinti hücrenin soluna göre) ve UDE'deki satır yükseklikleri: hücrenin içeriği SpaceAbove (üst iç pay) +
    satırlar; satır kaynaktaki yüksekliğe SpaceBelow ile tamamlanır (UDE satır yüksekliği özniteliğini okumuyor; köprüyle ölçüldü).
    Tablo bloğunun yüksekliği satırların toplamı + 1 (çerçeve)."""
    for satir in t.satirlar:
        hedef = int(round(satir.y1 - satir.y0))
        for h in satir.hucreler:
            if not h.satirlar:
                h.paragraflar, h.icerik = [], _kutu(VARSAYILAN_AILE, 12)
                continue
            yer_h = _yerlesim(h.satirlar, W)
            yer_h.sag = min(yer_h.sag, h.x1)
            h.paragraflar = _paragraflara(h.satirlar, yer_h)
            for i, p in enumerate(h.paragraflar):
                _paragraf_ozellikleri(p, yer_h, h.x0, h.x1)
                if p.hiza == 3 or len(p.satirlar) > 1:
                    p.ri = max(p.ri, round(max(0.0, h.x1 - yer_h.sag - 0.5), 1))
                if i:
                    p.sa = max(0, _bosluk_hesapla(h.paragraflar[i - 1], p))
            ilk = h.paragraflar[0]
            ilk.sa = max(0, int(round(ilk.ilk.y - ilk.E // 2 - ilk.C - (satir.y0 + 1))))
            h.icerik = sum(p.sa + len(p.satirlar) * (p.K + p.E) for p in h.paragraflar)
        satir.yuk = max([hedef] + [h.icerik for h in satir.hucreler])
        for h in satir.hucreler:
            if h.paragraflar and satir.yuk > h.icerik:
                h.paragraflar[-1].sb = satir.yuk - h.icerik
    t.yukseklik = sum(st.yuk for st in t.satirlar) + 1


def _sayfala(ogeler, sayfalar, H, tepe_al, alt_ust_kenar):
    """Alt kenar (bottomMargin) ve sayfa sonu konacak sayfalar. Her kaynak sayfanın içeriği UDE'nin modeliyle yerleştirilir: son satırın
    kutusunun altı (B) ve sonraki sayfanın ilk öğesi bu sayfada kalsaydı onun altı (N). UDE'de satır, kutusunun altı H − ⌊bm⌋'i geçmiyorsa
    sığar: bütün sayfalarda B ≤ H − ⌊bm⌋ ve dolu sayfalarda H − ⌊bm⌋ < N olacak tam sayı ⌊bm⌋ aranır (en çok sayfayı tutan; eşitlerin
    ortası, modeldeki küçük sapmaya pay). Tutmayan dolu sayfa (kaynakta erken bitmiş: sayfa sonu, dul / öksüz satır denetimi) paragraf
    sonunda bitiyorsa oraya sayfa sonu konur; tanınamayan taranmış sayfa resmi her zaman ayrı sayfada. Döner: (bm, sayfa sonu konacak
    kaynak sayfa numaraları)."""
    sayfa_ogeleri = collections.defaultdict(list)   # sayfa → [(tür, öğe, satır, devam mı)]
    zorla = set()
    for tur, oge, sayfa, _ in ogeler:
        if tur in ("g", "t"):
            sayfa_ogeleri[sayfa].append(("g", oge, None, False))
            if oge.tam_sayfa:
                zorla.update((sayfa - 1, sayfa))
            continue
        for i, s in enumerate(oge.satirlar):
            sayfa_ogeleri[s.sayfa].append(("s", oge, s, i > 0))
    n = len(sayfalar)
    olculer = {}   # sayfa → (B, N | None, paragraf sonunda mı)
    for no in range(1, n + 1):
        ogeler_k = sayfa_ogeleri.get(no)
        if not ogeler_k:
            continue
        y = None          # son öğenin kutusunun altı
        taban = None
        onceki_p = None
        govde_tepe = tepe_al(no)
        for tur, p, s, devam in ogeler_k:
            if tur == "g":
                yuk = p.yukseklik if isinstance(p, _Tablo) else int(math.floor(p.y1 - p.y0))
                y = (y + p.sa if y is not None else govde_tepe) + yuk
                taban, onceki_p = None, None
                continue
            if y is None:
                taban = govde_tepe + (0 if devam else p.sa) + p.E // 2 + p.C
            elif devam and onceki_p is p:
                taban = taban + p.K + p.E
            else:
                taban = y + p.sa + p.E // 2 + p.C
            y = taban + (p.K - p.C) + p.E // 2
            onceki_p = p
        N, paragraf_sonu = None, True
        sonraki = sayfa_ogeleri.get(no + 1)
        if sonraki:
            tur, p, s, devam = sonraki[0]
            if tur == "g":
                N = y + p.sa + (p.yukseklik if isinstance(p, _Tablo) else int(math.floor(p.y1 - p.y0)))
            elif onceki_p is p:
                N, paragraf_sonu = y + p.K + p.E, False
            else:
                N = y + p.sa + p.K + p.E
        olculer[no] = (y, N, paragraf_sonu)
    sinir_ust = H - EN_AZ_KENAR
    if alt_ust_kenar is not None:
        sinir_ust = min(sinir_ust, alt_ust_kenar)
    if not olculer:
        return 56.69, {z for z in zorla if z >= 1}
    en_b = max(b for b, _, _ in olculer.values())
    dolu = {no: v for no, v in olculer.items() if v[1] is not None}
    if not dolu:
        # Tek sayfa ya da sonraki sayfası boş: içerik sığsın, olağan kenar (2 cm) ya da daha azı
        b_int = max(1, int(math.floor(min(56.69, H - en_b))))
        return float(_guzel(b_int + 0.5, alt=b_int, ust=b_int + 1)), {z for z in zorla if z >= 1}
    adaylar = []
    for b_int in range(1, int(H * 0.45) + 1):
        L = H - b_int
        if L < en_b - 1e-9 or L > sinir_ust + 1e-9:
            continue
        tutmayan = [no for no, (b, N, _) in dolu.items() if not (b <= L < N)]
        adaylar.append((len(tutmayan), b_int))
    if not adaylar:
        b_int = max(1, int(math.floor(H - en_b)))
    else:
        en_az = min(a[0] for a in adaylar)
        esit = sorted(a[1] for a in adaylar if a[0] == en_az)
        b_int = esit[len(esit) // 2]
    L = H - b_int
    tutmayan = [no for no, (b, N, _) in dolu.items() if not (b <= L < N)]
    sonlar = {no for no in tutmayan if dolu[no][2] and dolu[no][0] <= L} | {z for z in zorla if z >= 1}
    bm = _guzel(b_int + 0.5, alt=b_int, ust=b_int + 1)
    return max(1.0, bm), sonlar
