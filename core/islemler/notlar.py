# -*- coding: utf-8 -*-
"""Not (annotation) yazma/düzenleme: standart PDF notları; referans PDF okuyucusunda birebir görünür.

- Highlight: PDF okuyucularının yazdığı yapı: /C, /CA, /QuadPoints, görünüm akışı /BM /Multiply + /CA (PyMuPDF üretir), gizli Popup (/F 28 /Open false);
  notlu vurgu ("Metinle ilgili yorum yap") /Contents + /IT /HighlightNote taşır
- Text (not): /Comment simgesi, Popup; dosyadaki yanıtları (IRT) geri yazabilir (yeni yanıt arayüzden eklenmez)
- FreeText: /DA + /DS + /RC (XHTML zengin metin) + kendi ürettiğimiz görünüm akışı; bilgisayardaki gerçek font
  (Windows'ta Segoe UI, Arial, Times New Roman, Calibri; macOS'ta Arial, Times New Roman; düz, kalın, italik, kalın italik) alt kümesi
  gömülür, böylece ş ğ İ ı ç ö ü her yerde doğru çıkar. Kalın / italik / altı çizili / üstü çizili ve renk karakter düzeyindedir (parçalar).
"""
import hashlib
import io
import json
import math
import os
import re
import stat
import sys
import time
import shutil
import tempfile
from html.parser import HTMLParser
import uuid

import pymupdf

# /RC'deki xfa:APIVersion "program:sürüm" biçimindedir; ana süreç uygulama sürümünü PDEFE_SURUM ortam değişkeninde verir
URETICI_SURUMU = "PDEfe:" + (os.environ.get("PDEFE_SURUM") or "0")
MAC = sys.platform == "darwin"
if MAC:
    # macOS (0.2.0): Arial ve Times New Roman sistemle gelir (Supplemental). Segoe UI ve Calibri yoktur; o ailelerle yazılmış not
    # düzenlenince Arial gömülür (_font_dosyasi). Kullanıcının kurduğu fontlar da aranır.
    FONT_KLASORLERI = ["/System/Library/Fonts/Supplemental", "/Library/Fonts", os.path.expanduser("~/Library/Fonts")]
    # (aile, kalın, italik) -> macOS font dosyası
    FONT_DOSYALARI = {
        ("Arial", False, False): "Arial.ttf", ("Arial", True, False): "Arial Bold.ttf",
        ("Arial", False, True): "Arial Italic.ttf", ("Arial", True, True): "Arial Bold Italic.ttf",
        ("Times New Roman", False, False): "Times New Roman.ttf", ("Times New Roman", True, False): "Times New Roman Bold.ttf",
        ("Times New Roman", False, True): "Times New Roman Italic.ttf", ("Times New Roman", True, True): "Times New Roman Bold Italic.ttf",
        # 0.3.1: Courier yazı tipli form alanlarının görünümü (islemler/formlar.py); yazı notunun yazı tipleri arasında yok
        ("Courier New", False, False): "Courier New.ttf", ("Courier New", True, False): "Courier New Bold.ttf",
        ("Courier New", False, True): "Courier New Italic.ttf", ("Courier New", True, True): "Courier New Bold Italic.ttf",
    }
elif sys.platform.startswith("linux"):
    # Linux (0.3.1): dosyayı fontconfig seçer (_font_dosyasi → islemler/linux.py); klasörler yalnızca bilgi için
    FONT_KLASORLERI = ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.local/share/fonts")]
    FONT_DOSYALARI = {}
else:
    FONT_KLASORLERI = [os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")]
    # (aile, kalın, italik) -> Windows font dosyası
    FONT_DOSYALARI = {
        ("Segoe UI", False, False): "segoeui.ttf", ("Segoe UI", True, False): "segoeuib.ttf",
        ("Segoe UI", False, True): "segoeuii.ttf", ("Segoe UI", True, True): "segoeuiz.ttf",
        ("Arial", False, False): "arial.ttf", ("Arial", True, False): "arialbd.ttf",
        ("Arial", False, True): "ariali.ttf", ("Arial", True, True): "arialbi.ttf",
        ("Times New Roman", False, False): "times.ttf", ("Times New Roman", True, False): "timesbd.ttf",
        ("Times New Roman", False, True): "timesi.ttf", ("Times New Roman", True, True): "timesbi.ttf",
        ("Calibri", False, False): "calibri.ttf", ("Calibri", True, False): "calibrib.ttf",
        ("Calibri", False, True): "calibrii.ttf", ("Calibri", True, True): "calibriz.ttf",
        # 0.3.1: Courier yazı tipli form alanlarının görünümü (islemler/formlar.py); yazı notunun yazı tipleri arasında yok
        ("Courier New", False, False): "cour.ttf", ("Courier New", True, False): "courbd.ttf",
        ("Courier New", False, True): "couri.ttf", ("Courier New", True, True): "courbi.ttf",
    }
# Gömülecek glif dağarcığı: ASCII, Latin-1, Latin Genişletilmiş-A (Türkçe dahil), ƒ ˆ ˜, genel noktalama (satır / paragraf ayırıcıları
# ve yön denetimleri hariç), € ₺ № ™, kesirler, oklar, matematik işaretleri. 0.2.1'de Latin Genişletilmiş-A tamamlandı, noktalama, oklar ve
# matematik işaretleri eklendi (önceden yalnızca Türkçe harfler, Œ œ Ÿ ve U+2010-2026): alt küme değiştiği için var olan belgelerde font
# bir sonraki yazı notunda bir kez yeniden gömülür (_pdefe_fontu_mu; eski notlar kendi fontlarıyla kalır). Dağarcıkta olmayan karakter
# notun görünümünde '?' çizilir (_cizilen)
DAGARCIK = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [0x192, 0x2C6, 0x2DC]
            + list(range(0x2010, 0x2028)) + list(range(0x2030, 0x205F)) + [0x20AC, 0x20BA, 0x2116, 0x2122]
            + list(range(0x2150, 0x2160)) + list(range(0x2190, 0x2300)))
DAGARCIK_KUME = frozenset(DAGARCIK)
BICIMLER = ("kalin", "italik", "alti", "ustu")          # parça (run) düzeyindeki biçimler; renk ayrıca
HIZA_Q = {"sol": 0, "orta": 1, "sag": 2}
HIZA_CSS = {"sol": "left", "orta": "center", "sag": "right"}
SAHTE_ITALIK_EGIM = 0.2126                               # italik yüz bulunamazsa düz yüz ~12° eğilir
SATIR_ARALIGI = 1.2                                      # renderer'daki line-height ile aynı

_font_onbellek = {}      # (aile, kalin, italik) -> (Font, altkume_bytes, yol, ölçüler)


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
def _font_dosyasi(aile, kalin, italik):
    """Var olan en uygun font dosyası ve sahte italik gerekip gerekmediği: önce istenen aile, sonra Arial; italik yüz
    bulunamazsa düz yüz eğilerek çizilir. Linux'ta (0.3.1) dosyayı fontconfig seçer (islemler/linux.py)."""
    if sys.platform.startswith("linux"):
        from .linux import yazi_tipi_dosyasi
        return yazi_tipi_dosyasi(aile, kalin, italik)
    for a, i, sahte in ((aile, italik, False), ("Arial", italik, False), (aile, False, italik), ("Arial", False, italik)):
        dosya = FONT_DOSYALARI.get((a, bool(kalin), bool(i)))
        for klasor in FONT_KLASORLERI if dosya else ():
            if os.path.exists(os.path.join(klasor, dosya)):
                return os.path.join(klasor, dosya), bool(sahte)
    return os.path.join(FONT_KLASORLERI[0], FONT_DOSYALARI[("Arial", False, False)]), bool(italik)


def _font_yukle(aile, kalin, italik=False):
    """Windows fontunu yükler ve Türkçe dağarcıklı, GID koruyan bir alt küme üretir.
    Döner: (Font, alt küme baytları, dosya yolu, ölçüler). Ölçüler em cinsindendir: tarayıcının (DirectWrite) satır
    yerleşiminde kullandığı win yükseklikleri, alt çizgi / üstü çizili konum ve kalınlığı, sahte italik bayrağı."""
    anahtar = (aile, bool(kalin), bool(italik))
    if anahtar in _font_onbellek:
        return _font_onbellek[anahtar]
    yol, sahte = _font_dosyasi(aile, kalin, italik)
    font = pymupdf.Font(fontfile=yol)
    olcu = {"yukari": font.ascender, "asagi": -font.descender, "altiKonum": -0.1, "altiKalinlik": 0.06,
            "ustuKonum": 0.26, "ustuKalinlik": 0.05, "sahteItalik": sahte, "altKume": False}
    altkume = None
    try:
        import logging
        logging.getLogger("fontTools").setLevel(logging.ERROR)
        from fontTools import subset
        from fontTools.ttLib import TTFont
        # recalcTimestamp=False (0.1.23): alt küme her üretimde aynı baytlar olsun (head.modified kaydedilen anın saati olmasın);
        # _pdefe_fontu_mu belgede gömülü fontu bununla karşılaştırır
        tt = TTFont(yol, recalcTimestamp=False)
        try:
            em = float(tt["head"].unitsPerEm)
            os2, post = tt["OS/2"], tt["post"]
            olcu.update(yukari=os2.usWinAscent / em, asagi=os2.usWinDescent / em,
                        altiKonum=post.underlinePosition / em, altiKalinlik=post.underlineThickness / em,
                        ustuKonum=os2.yStrikeoutPosition / em, ustuKalinlik=os2.yStrikeoutSize / em)
        except Exception:
            pass
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
        olcu["altKume"] = True              # gömülen fontta yalnızca DAGARCIK'ın glifleri var (_cizilen)
    except Exception:
        with open(yol, "rb") as f:
            altkume = f.read()
    _font_onbellek[anahtar] = (font, altkume, yol, olcu)
    return _font_onbellek[anahtar]


def _pdefe_fontu_mu(doc, xref, altkume):
    """/PDEfeFonts kaydının gösterdiği font PDEfe'nin gömdüğü font mu (0.1.23, güvenlik denetimi): Type0 / Identity-H, CIDFontType2
    (CIDToGIDMap yok ya da /Identity) ve font programı (FontFile2) şimdiki alt kümeyle bayt bayt aynı. Kayıt belgeden okunur: hazırlanmış
    bir PDF buraya kendi fontunu koyabilir, yeni yazı notu PDEfe'de doğru, başka okuyucularda başka harflerle görünürdü (ör. 1.000 yerine
    9.000). Tutmazsa font yeniden gömülür; başka bilgisayarın (Windows fontu farklı sürüm) gömdüğü fontta da öyle olur (bir kez ~50 KB)."""
    try:
        if doc.xref_get_key(xref, "Subtype")[1] != "/Type0" or doc.xref_get_key(xref, "Encoding")[1] != "/Identity-H":
            return False
        tur, alt = doc.xref_get_key(xref, "DescendantFonts")
        m = re.fullmatch(r"\[\s*(\d+)\s+0\s+R\s*\]", alt or "")
        if tur != "array" or not m:
            return False
        alt = int(m.group(1))
        if doc.xref_get_key(alt, "Subtype")[1] != "/CIDFontType2":
            return False
        tur, harita = doc.xref_get_key(alt, "CIDToGIDMap")
        if tur != "null" and harita != "/Identity":
            return False
        tur, fd = doc.xref_get_key(alt, "FontDescriptor")
        if tur != "xref":
            return False
        tur, ff = doc.xref_get_key(int(fd.split()[0]), "FontFile2")
        return tur == "xref" and doc.xref_stream(int(ff.split()[0])) == altkume
    except Exception:
        return False


def _font_xref_al(doc, page, aile, kalin, italik=False):
    """Belgede bu aile/stil için gömülü PDEfe fontunun xref'ini döndürür; yoksa (ya da kayıttaki font PDEfe'ninki değilse) gömer.
    Kayıt, katalogdaki /PDEfeFonts sözlüğünde tutulur (anahtar: aile + R | B | I | BI; 0.1.1'in R/B anahtarları aynen geçerli)."""
    _, altkume, _, olcu = _font_yukle(aile, kalin, italik)
    yuz = ("B" if kalin else "") + ("I" if italik and not olcu["sahteItalik"] else "")
    anahtar = re.sub(r"[^A-Za-z0-9]", "", aile) + (yuz or "R")
    katalog = doc.pdf_catalog()
    tur, deger = doc.xref_get_key(katalog, "PDEfeFonts/" + anahtar)
    if tur == "xref":
        xref = int(deger.split()[0])
        if 0 < xref < doc.xref_length() and doc.xref_get_key(xref, "Type")[1] == "/Font" and _pdefe_fontu_mu(doc, xref, altkume):
            return xref
    xref = page.insert_font(fontname="PDEfe" + anahtar, fontbuffer=altkume)
    if not _pdefe_fontu_mu(doc, xref, altkume):
        # insert_font sayfa kaynaklarında aynı adlı font varsa onu döndürür (belge sayfaya o adla başka font koymuş olabilir): benzersiz
        # adla yeniden gömülür (0.1.23). Bu da denetimden geçmezse (font yapısı beklenenden farklı: alt küme üretilemeyip bütün dosya
        # gömüldüyse) gömülen font kullanılır, önceki sürümlerdeki gibi
        yeni = page.insert_font(fontname="PDEfe" + anahtar + uuid.uuid4().hex[:8], fontbuffer=altkume)
        if _pdefe_fontu_mu(doc, yeni, altkume):
            xref = yeni
    tur, mevcut = doc.xref_get_key(katalog, "PDEfeFonts")
    girdiler = dict(re.findall(r"/(\w+)\s+(\d+)\s+0\s+R", mevcut)) if tur == "dict" else {}
    girdiler[anahtar] = str(xref)
    doc.xref_set_key(katalog, "PDEfeFonts", "<<" + " ".join("/%s %s 0 R" % kv for kv in girdiler.items()) + ">>")
    return xref


# ---------------------------------------------------------------- yazı parçaları (zengin metin)
def _duz(metin):
    """Satır sonlarını \\n'e indirger (bazı PDF okuyucuları /Contents'te \\r kullanır)."""
    return str(metin or "").replace("\r\n", "\n").replace("\r", "\n")


def _parca_stili(p, varsayilan_renk=None):
    """Parçanın biçimi: yalnızca etkin bayraklar; renk kutu renginden farklıysa (renderer'daki stilAl ile aynı sıra)."""
    if not isinstance(p, dict):
        return {}
    s = {k: True for k in BICIMLER if p.get(k)}
    renk = _hex(_renk(p.get("renk")))
    if renk and renk != varsayilan_renk:
        s["renk"] = renk
    return s


def _parcalari_ac(parcalar, varsayilan_renk=None):
    """Parçaları karakter listesine açar: [(karakter, stil)]."""
    kar = []
    for p in parcalar or []:
        st = _parca_stili(p, varsayilan_renk)
        for ch in str(p.get("metin") or "") if isinstance(p, dict) else "":
            kar.append((ch, st))
    return kar


def _parcalari_topla(kar):
    """Karakter listesini bitişik aynı stilleri birleştirerek parçalara toplar."""
    gruplar = []
    for ch, st in kar:
        if gruplar and gruplar[-1][1] == st:
            gruplar[-1][0].append(ch)
        else:
            gruplar.append(([ch], st))
    return [dict({"metin": "".join(m)}, **st) for m, st in gruplar]


def _parcalari_uydur(parcalar, metin, varsayilan_renk=None):
    """Parçaları düz metne uydurur (renderer'daki uzlastir ile aynı): ortak baş ve son korunur; eski orta bölüm yenisinin
    içinde duruyorsa o da biçimiyle korunur (eklenenler komşu karakterin biçimini alır), yoksa değişen bölüm önündeki
    karakterin biçimini alır."""
    kar = _parcalari_ac(parcalar, varsayilan_renk)
    eski = "".join(c for c, _ in kar)
    if eski != metin:
        n = min(len(eski), len(metin))
        bas = 0
        while bas < n and eski[bas] == metin[bas]:
            bas += 1
        son = 0
        while son < n - bas and eski[-1 - son] == metin[-1 - son]:
            son += 1
        eski_orta, yeni_orta = eski[bas:len(eski) - son], metin[bas:len(metin) - son]
        k = yeni_orta.find(eski_orta) if eski_orta else -1
        if k >= 0:
            onceki = kar[bas - 1][1] if bas > 0 else kar[bas][1]
            sonraki = kar[len(eski) - son - 1][1]
            orta = ([(ch, onceki) for ch in yeni_orta[:k]] + kar[bas:len(eski) - son]
                    + [(ch, sonraki) for ch in yeni_orta[k + len(eski_orta):]])
        else:
            st = kar[bas - 1][1] if bas > 0 else (kar[0][1] if kar else {})
            orta = [(ch, st) for ch in yeni_orta]
        kar = kar[:bas] + orta + kar[len(eski) - son:]
    return _parcalari_topla(kar)


def freetext_stil_kanonik(stil, metin):
    """Yazı biçiminin kanonik biçimi (renderer'daki yaziKanonik ile aynı anahtarlar ve sıra):
    {tip, boyut, renk, arka, kenarlik, [kenarlikRengi], [hiza], [donus], parcalar}. donus: metin yönü (0 değilse; bkz.
    freetext_donus). Parçası olmayan eski (0.1.1) kayıtta kutu
    düzeyindeki kalin / italik / altiCizili bayrakları tek parçaya çevrilir; parçalar metinle uyuşmuyorsa uydurulur."""
    s = stil if isinstance(stil, dict) else {}
    metin = _duz(metin)
    renk = _hex(_renk(s.get("renk"))) or "#000000"
    if isinstance(s.get("parcalar"), list):
        parcalar = _parcalari_uydur(s["parcalar"], metin, renk)
    else:
        parcalar = _parcalari_uydur([{"metin": metin, "kalin": s.get("kalin"), "italik": s.get("italik"), "alti": s.get("altiCizili")}], metin, renk)
    k = {"tip": s.get("tip") or "Segoe UI", "boyut": float(s.get("boyut") or 12), "renk": renk,
         "arka": _hex(_renk(s.get("arka"))), "kenarlik": bool(s.get("kenarlik"))}
    if _renk(s.get("kenarlikRengi")):
        k["kenarlikRengi"] = _hex(_renk(s.get("kenarlikRengi")))
    if s.get("hiza") in ("orta", "sag"):
        k["hiza"] = s["hiza"]
    donus = _donus_kanonik(s.get("donus"))
    if donus:
        k["donus"] = donus
    k["parcalar"] = parcalar
    return k


def _donus_kanonik(aci):
    """Açıyı 0 / 90 / 180 / 270'e yuvarlar (geçersizse 0)."""
    try:
        return int(round(float(aci or 0) / 90.0)) * 90 % 360
    except (TypeError, ValueError):
        return 0


def freetext_donus(doc, xref):
    """Yazının dosyadaki metin yönü (kullanıcı uzayında, saat yönünün tersine derece): görünüm akışının /Matrix dönüşü; görünüm
    yoksa /Rotate. Referans okuyucu görünümü dosyadaki gibi çizip sayfanın /Rotate'ini üstüne uygular: 0.1.1'in döndürülmüş sayfaya
    /Matrix'siz yazdığı yazı sayfayla birlikte yan döner, sonradan döndürülen sayfadaki yazı da sayfayla döner."""
    try:
        if doc.xref_get_key(xref, "AP/N")[0] in ("xref", "dict", "stream"):
            t, v = doc.xref_get_key(xref, "AP/N/Matrix")
            if t != "array":
                return 0
            a, b = (float(x) for x in v.strip("[] ").split()[:2])
            return _donus_kanonik(math.degrees(math.atan2(b, a))) if abs(a) + abs(b) > 1e-9 else 0
        t, v = doc.xref_get_key(xref, "Rotate")
        return _donus_kanonik(v) if t in ("int", "float") else 0
    except Exception:
        return 0


# Sözcük içinde satır kırılabilen yerler; renderer'daki Chromium dizilimiyle yoklanarak belirlendi (tireler, soru işareti,
# üç nokta: arkasından; uzun tire: önünden de)
KIRILMA_SONRA = "-\u2010\u2012\u2013\u2014?\u2026"
KIRILMA_ONCE = "\u2014"


def _stilli_satirlar(kar, genislik, olc):
    """Biçimli karakterleri satırlara böler (renderer'daki tarayıcı dizilimiyle aynı yerden): boşlukta ve sözcük içindeki
    kırılma yerlerinde (tire vb.) kırar, satıra sığmayan parçayı karakterden böler. Boşluklar korunur ve satırı kırmaz:
    sığmasalar da satır sonunda asılı kalır (tarayıcıda white-space: pre-wrap), sonraki sözcük yeni satırdan başlar.
    Karışık yüzlerde her karakter kendi fontuyla ölçülür.
    kar: [(karakter, stil)], olc(karakter, stil) -> pt. Döner: [[(karakter, stil), ...], ...]"""
    satirlar = []
    paragraflar = [[]]
    for c in kar:
        if c[0] == "\n":
            paragraflar.append([])
        else:
            paragraflar[-1].append(c)

    def bol(sozcuk):
        # sığmayan sözcük: tam satırlar eklenir, kalan parça ve genişliği döner
        parca, pg = [], 0.0
        for c in sozcuk:
            cw = olc(*c)
            if parca and pg + cw > genislik + 1e-6:
                satirlar.append(parca)
                parca, pg = [], 0.0
            parca.append(c)
            pg += cw
        return parca, pg

    def parcala(sozcuk):
        # sözcüğü kırılma yerlerinden parçalara ayırır (işaret sözcüğün başında / sonunda ya da ardışıksa kırılmaz)
        parcalar, p = [], []
        for i, c in enumerate(sozcuk):
            if c[0] in KIRILMA_ONCE and p and sozcuk[i - 1][0] not in KIRILMA_ONCE:
                parcalar.append(p)
                p = []
            p.append(c)
            if c[0] in KIRILMA_SONRA and i > 0 and i + 1 < len(sozcuk) and sozcuk[i + 1][0] not in KIRILMA_SONRA:
                parcalar.append(p)
                p = []
        parcalar.append(p)
        return parcalar

    for par in paragraflar:
        sozcukler, ayiricilar, sozcuk = [], [], []
        for c in par:
            if c[0] == " ":
                sozcukler.append(sozcuk)
                ayiricilar.append(c)
                sozcuk = []
            else:
                sozcuk.append(c)
        sozcukler.append(sozcuk)
        cur, cur_gen = [], 0.0
        for i, sz in enumerate(sozcukler):
            if i:
                # Boşluk satırı kırmaz, sığmasa da satırda asılı kalır: ardışık boşluklar sonraki satırın başına taşınmaz,
                # metni bitiren taşan boşluklar yeni (boş) satır açmaz
                cur.append(ayiricilar[i - 1])
                cur_gen += olc(*ayiricilar[i - 1])
            for pr in parcala(sz):
                if not pr:
                    continue
                pg = sum(olc(*c) for c in pr)
                if cur_gen + pg <= genislik + 1e-6:
                    cur.extend(pr)
                    cur_gen += pg
                    continue
                if cur:
                    satirlar.append(cur)
                cur, cur_gen = bol(pr) if pg > genislik + 1e-6 else (list(pr), pg)
        satirlar.append(cur)
    return satirlar


def _cizilen(font, olcu, ch):
    """Karakterin notun görünüm akışında çizilen ve ölçülen hâli: gömülen fontta glifi olmayan karakter '?' (0.2.1). Önceden glif tam
    fontta aranıyordu: tam fontta olup alt kümede boşaltılan karakter (→ ≤ ł α…) kaydedilen PDF'te, yazdırmada ve başka okuyucularda boş
    çıkıyordu, '?' yedeği hiç devreye girmiyordu."""
    if ch == " ":
        return ch
    kod = ord(ch)
    if (kod in DAGARCIK_KUME or not olcu.get("altKume")) and font.has_glyph(kod):
        return ch
    return "?"


def _gid_hex(font, metin, olcu):
    return "".join("%04X" % (font.has_glyph(ord(_cizilen(font, olcu, ch))) or 0) for ch in metin)


# ---------------------------------------------------------------- /RC (XHTML zengin metin) ve CSS
def _xml_kacis(s):
    """XHTML metni: özel karakterler varlık, ASCII dışı karakterler sayısal başvuru (referans okuyucunun yazdığı gibi)."""
    return "".join({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}.get(c) or (c if 32 <= ord(c) < 127 else "&#%d;" % ord(c)) for c in s)


def _css_aile(aile):
    return "'%s'" % aile if " " in aile else aile


def _css_renk(deger):
    """'#rgb' | '#rrggbb' | 'rgb(r, g, b)' | birkaç adlı renk -> '#rrggbb' ya da None"""
    d = (deger or "").strip().lower()
    adli = {"black": "#000000", "white": "#ffffff", "red": "#ff0000", "green": "#008000", "blue": "#0000ff", "yellow": "#ffff00"}
    if d in adli:
        return adli[d]
    m = re.fullmatch(r"#([0-9a-f]{3})", d)
    if m:
        return "#" + "".join(c * 2 for c in m.group(1))
    if re.fullmatch(r"#[0-9a-f]{6}", d):
        return d
    m = re.fullmatch(r"rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)", d)
    if m:
        return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(float(v))))) for v in m.groups())
    return None


def _css_oku(stil):
    """PDF okuyucularının yazdığı /DS ve /RC style değerlerini okur. Döner (yalnızca bulunanlar): {aile, boyut, renk, hiza, kalin, italik,
    alti, ustu, bosluk}; kalin / italik açıkça normal verildiyse False, text-decoration: none alti / ustu'yu kapatır."""
    sonuc = {}
    for bildirim in (stil or "").split(";"):
        if ":" not in bildirim:
            continue
        ad, deger = bildirim.split(":", 1)
        ad, deger = ad.strip().lower(), deger.strip()
        dk = deger.lower()
        if ad == "font":
            m = re.search(r"([\d.]+)\s*pt", deger)
            if m:
                sonuc["boyut"] = float(m.group(1))
            on = deger[:m.start()] if m else deger
            if re.search(r"\bbold\b", on, re.I):
                sonuc["kalin"] = True
            if re.search(r"\b(italic|oblique)\b", on, re.I):
                sonuc["italik"] = True
            aile = re.sub(r"\b(bold|bolder|lighter|italic|oblique|normal|[1-9]00)\b", "", on, flags=re.I).strip()
            if aile:
                sonuc["aile"] = aile.split(",")[0].strip().strip("'\"")
        elif ad == "font-family":
            sonuc["aile"] = deger.split(",")[0].strip().strip("'\"")
        elif ad == "font-size":
            m = re.match(r"([\d.]+)", deger)
            if m:
                sonuc["boyut"] = float(m.group(1))
        elif ad == "color":
            if _css_renk(deger):
                sonuc["renk"] = _css_renk(deger)
        elif ad == "text-align":
            sonuc["hiza"] = {"center": "orta", "right": "sag"}.get(dk, "sol")
        elif ad == "font-weight":
            sonuc["kalin"] = dk in ("bold", "bolder") or (dk.isdigit() and int(dk) >= 600)
        elif ad == "font-style":
            sonuc["italik"] = dk in ("italic", "oblique")
        elif ad == "text-decoration":
            if "none" in dk:
                sonuc["alti"] = sonuc["ustu"] = False
            if "underline" in dk:
                sonuc["alti"] = True
            if "line-through" in dk:
                sonuc["ustu"] = True
        elif ad == "xfa-spacerun":
            sonuc["bosluk"] = dk == "yes"
    return sonuc


def _aile_eslestir(ad):
    """/DS ya da /RC'deki font adını PDEfe'nin gömebildiği aileye eşler (Helvetica → Arial); tanınmayan için None."""
    a = (ad or "").lower()
    if "segoe" in a:
        return "Segoe UI"
    if "calibri" in a:
        return "Calibri"
    if "times" in a:
        return "Times New Roman"
    if "arial" in a or "helv" in a:
        return "Arial"
    return None


def freetext_rc_uret(parcalar, aile, boyut, renk_hex, hiza="sol"):
    """Referans okuyucunun yazdığı biçimde /RC: body varsayılan stili, paragraf (satır) başına <p dir="ltr">, parça başına biçimli <span>.
    XHTML ardışık boşlukları birleştirdiğinden birden çok boşluk ile paragraf başı / sonu boşlukları xfa-spacerun ile korunur;
    boş satır tek boşluklu paragraf olur (boş <p> satır yüksekliği almaz)."""
    govde = "font-size:%.1fpt;text-align:%s;color:%s;font-weight:normal;font-style:normal;font-family:%s;font-stretch:normal" % (
        boyut, HIZA_CSS.get(hiza, "left"), renk_hex, _css_aile(aile))
    out = ['<?xml version="1.0"?><body xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/" '
           'xfa:APIVersion="%s" xfa:spec="2.0.2" style="%s">' % (URETICI_SURUMU, govde)]
    paragraflar = [[]]
    for ch, st in _parcalari_ac(parcalar, renk_hex):
        if ch == "\n":
            paragraflar.append([])
        else:
            paragraflar[-1].append((ch, st))
    for par in paragraflar:
        out.append('<p dir="ltr">')
        if not par:
            out.append('<span style="xfa-spacerun:yes"> </span>')
        n = len(par)
        korunan = [c == " " and (i == 0 or i == n - 1 or par[i - 1][0] == " " or par[i + 1][0] == " ") for i, (c, _) in enumerate(par)]
        i = 0
        while i < n:
            st, j = par[i][1], i
            while j < n and par[j][1] == st:
                j += 1
            ic, k = [], i
            while k < j:
                m = k
                while m < j and korunan[m] == korunan[k]:
                    m += 1
                parca = _xml_kacis("".join(c for c, _ in par[k:m]))
                ic.append('<span style="xfa-spacerun:yes">%s</span>' % parca if korunan[k] else parca)
                k = m
            icerik = "".join(ic)
            if st.get("alti") and st.get("ustu"):
                icerik = '<span style="text-decoration:line-through">%s</span>' % icerik
            out.append('<span style="font-weight:%s;font-style:%s;color:%s;text-decoration:%s">%s</span>' % (
                "bold" if st.get("kalin") else "normal", "italic" if st.get("italik") else "normal", st.get("renk") or renk_hex,
                "underline" if st.get("alti") else ("line-through" if st.get("ustu") else "none"), icerik))
            i = j
        out.append("</p>")
    out.append("</body>")
    return "".join(out)


class _RCOkuyucu(HTMLParser):
    """/RC XHTML'ini biçimli karakterlere çevirir (PDF okuyucularının ve PDEfe'nin yazdığı biçim; b/i/u/s etiketleri de)."""
    BLOK = ("p", "div", "li")

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.yigin = [("", {})]     # (etiket, stil)
        self.kar = []               # (karakter, stil, daraltılabilir)
        self.govde = {}
        self.paragraf = 0

    def _satir(self):
        self.kar.append(("\n", dict(self.yigin[-1][1]), False))

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "br":
            self._satir()
            return
        stil = dict(self.yigin[-1][1])
        stil.update({"b": {"kalin": True}, "strong": {"kalin": True}, "i": {"italik": True}, "em": {"italik": True},
                     "u": {"alti": True}, "s": {"ustu": True}, "strike": {"ustu": True}, "del": {"ustu": True}}.get(tag, {}))
        css = _css_oku(dict(attrs).get("style") or "")
        if tag == "body":
            self.govde = css
        for k, v in css.items():
            # çizgiler üst öğeninkine eklenir (CSS'teki gibi); yalnızca text-decoration: none kaldırır
            stil[k] = True if k in ("alti", "ustu") and v else v
        if tag in self.BLOK:
            if self.paragraf or self.kar:
                self._satir()
            self.paragraf += 1
        self.yigin.append((tag, stil))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag.lower() != "br":
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        tag = tag.lower()
        for i in range(len(self.yigin) - 1, 0, -1):
            if self.yigin[i][0] == tag:
                del self.yigin[i:]
                break

    def handle_data(self, data):
        etiket, stil = self.yigin[-1]
        if etiket in ("", "html", "body") and not data.strip():
            return                   # etiketler arasındaki biçimlendirme boşluğu
        bosluk = bool(stil.get("bosluk"))
        for ch in data:
            if not bosluk and ch in " \t\r\n\f":
                self.kar.append((" ", stil, True))
            else:
                self.kar.append((ch, stil, False))

    def sonuc(self, varsayilan_renk):
        """HTML boşluk kuralı: daraltılabilir boşluklar birleşir, satır başı ve sonunda düşer."""
        kar, satir = [], []
        for ch, st, dar in self.kar + [("\n", {}, False)]:
            if ch == "\n":
                while satir and satir[-1][2]:
                    satir.pop()
                if len(satir) == 1 and satir[0][0] == " ":
                    satir = []           # yalnızca korunan tek boşluk: boş satır (paragraf işareti) yazımı
                kar.extend(satir)
                kar.append(("\n", st))
                satir = []
            elif dar and (not satir or satir[-1][0] == " "):
                continue
            else:
                satir.append((ch, st, dar))
        kar = [(c[0], c[1]) for c in kar[:-1]]
        temiz = [(ch, _parca_stili(st, varsayilan_renk)) for ch, st in kar]
        return _parcalari_topla(temiz)


def freetext_rc_oku(rc, varsayilan_renk="#000000"):
    """/RC'yi okur. Döner: (parçalar, body stili {aile, boyut, renk, hiza, ...})."""
    o = _RCOkuyucu()
    o.feed(re.sub(r"<\?xml[^>]*\?>", "", rc or ""))
    o.close()
    renk = o.govde.get("renk") or varsayilan_renk
    return o.sonuc(renk), o.govde


def _anahtar_metin(doc, xref, anahtar):
    """Metin değerli anahtar (dize ya da akış, ör. PDF okuyucularının bazen akış olarak yazdığı /RC); yoksa None."""
    tur, deger = doc.xref_get_key(xref, anahtar)
    if tur == "string":
        return deger
    if tur == "xref":
        try:
            b = doc.xref_stream(int(deger.split()[0])) or b""
            return b[2:].decode("utf-16-be", "replace") if b[:2] == b"\xfe\xff" else b.decode("utf-8", "replace")
        except Exception:
            return None
    return None


# ---------------------------------------------------------------- FreeText yazma / okuma
def freetext_gorunum_yaz(doc, page, annot, metin, stil):
    """FreeText notunu yazar: karakter düzeyinde biçimli görünüm akışı (/AP /N; her parça kendi gömülü yüzüyle, altı / üstü
    çizgiler), başka PDF okuyucuları için /RC, /DS, /DA, /C (dolgu; dolgusuzsa silinir), /BS, /Q; PDEfe için /PDEfe stil kaydı (parçalar dahil).
    /Contents önceden yazılmış olmalı: PyMuPDF içerik yazarken /RC'yi siler.
    stil: {tip, boyut, renk, arka, kenarlik, kenarlikRengi, hiza, parcalar: [{metin, kalin, italik, alti, ustu, renk}]};
    parçasız eski kayıtta kutu düzeyinde kalin / altiCizili."""
    metin = _duz(metin)
    k = freetext_stil_kanonik(stil, metin)
    aile, boyut, hiza, parcalar = k["tip"], k["boyut"], k.get("hiza", "sol"), k["parcalar"]
    renk = _renk(k["renk"]) or (0, 0, 0)
    arka = _renk(k["arka"])
    kenarlik = k["kenarlik"]
    kenar_renk = _renk(k.get("kenarlikRengi")) or renk
    kar = _parcalari_ac(parcalar, k["renk"])
    # Kullanılan yüzler (düz yüz her zaman: satır ölçüleri ondan)
    yuzler = sorted({(False, False)} | {(bool(st.get("kalin")), bool(st.get("italik"))) for _, st in kar})
    kaynak = {}
    for i, yuz in enumerate(yuzler):
        font, _, _, olcu = _font_yukle(aile, *yuz)
        kaynak[yuz] = ("F%d" % (i + 1), font, olcu, _font_xref_al(doc, page, aile, *yuz))
    duz_olcu = kaynak[(False, False)][2]
    r = annot.rect
    # Metin yönü (stil donus): görünüm akışı bu açıyla döndürülür. Yeni yazıda renderer ekrandaki sayfa açısını verir (metin dik
    # durur); var olan yazıda dosyadaki yön korunur (freetext_donus): düzenleyip kaydetmek yazının başka okuyuculardaki yönünü değiştirmez
    rot = k.get("donus", 0)
    if rot in (90, 270):
        w, h = max(r.height, 1), max(r.width, 1)
    else:
        w, h = max(r.width, 1), max(r.height, 1)
    matris = {0: "[1 0 0 1 0 0]", 90: "[0 1 -1 0 0 0]", 180: "[-1 0 0 -1 0 0]", 270: "[0 -1 1 0 0 0]"}[rot]
    pad = 2.0
    ic = 1.0 if kenarlik else 0.0              # kenarlık içeriği daraltır (renderer: box-sizing border-box)
    genislik = max(1.0, w - 2 * (pad + ic))
    olculer = {}

    def olc(ch, st):
        a = (ch, bool(st.get("kalin")), bool(st.get("italik")))
        if a not in olculer:
            _, font, olcu, _ = kaynak[a[1:]]
            olculer[a] = font.text_length(_cizilen(font, olcu, ch), fontsize=boyut)   # çizilen karakterle (gömülü değilse '?')
        return olculer[a]

    satirlar = _stilli_satirlar(kar, genislik, olc)
    satir_yuk = boyut * SATIR_ARALIGI
    # CSS satır kutusu: taban çizgisi = yarım satır aralığı + font yüksekliği (win ölçüleri; tarayıcıyla aynı yer)
    y = h - pad - ic - boyut * (SATIR_ARALIGI / 2 + (duz_olcu["yukari"] - duz_olcu["asagi"]) / 2)
    ops = ["q"]
    if arka:
        ops.append("%.3f %.3f %.3f rg 0 0 %.2f %.2f re f" % (arka[0], arka[1], arka[2], w, h))
    if kenarlik:
        ops.append("%.3f %.3f %.3f RG 1 w 0.5 0.5 %.2f %.2f re S" % (kenar_renk[0], kenar_renk[1], kenar_renk[2], w - 1, h - 1))
    metin_ops, cizgiler = ["BT"], []
    for satir in satirlar:
        son = len(satir)
        while son and satir[son - 1][0] == " ":
            son -= 1                           # satır sonu boşlukları hizada ve çizgide sayılmaz (tarayıcıda asılı kalır)
        gorunur = sum(olc(*c) for c in satir[:son])
        x = pad + ic + {"orta": (genislik - gorunur) / 2, "sag": genislik - gorunur}.get(hiza, 0.0)
        bitis = x + gorunur
        i = 0
        while i < len(satir):
            st, j = satir[i][1], i
            while j < len(satir) and satir[j][1] == st:
                j += 1
            parca = "".join(c for c, _ in satir[i:j])
            pg = sum(olc(*c) for c in satir[i:j])
            ad, font, olcu, _ = kaynak[(bool(st.get("kalin")), bool(st.get("italik")))]
            rr = _renk(st.get("renk")) or renk
            if parca.strip():
                egim = SAHTE_ITALIK_EGIM if st.get("italik") and olcu["sahteItalik"] else 0
                metin_ops.append("/%s %.2f Tf %.3f %.3f %.3f rg 1 0 %.4f 1 %.2f %.2f Tm <%s> Tj" % (
                    ad, boyut, rr[0], rr[1], rr[2], egim, x, y, _gid_hex(font, parca, olcu)))
            x1 = min(x + pg, bitis)
            for acik, konum, kalinlik in ((st.get("alti"), duz_olcu["altiKonum"], duz_olcu["altiKalinlik"]),
                                          (st.get("ustu"), duz_olcu["ustuKonum"], duz_olcu["ustuKalinlik"])):
                if not acik or x1 <= x:
                    continue
                kal = max(0.5, kalinlik * boyut)
                yy = y + (konum - kalinlik / 2) * boyut           # ölçü çizginin üstünü verir; çizgi ortasından çizilir
                onceki = cizgiler[-1] if cizgiler else None
                if onceki and onceki[0] == rr and abs(onceki[1] - yy) < 1e-3 and abs(onceki[3] - x) < 1e-3:
                    onceki[3] = x1                                  # bitişik parçaların çizgisi tek çizgi
                else:
                    cizgiler.append([rr, yy, x, x1, kal])
            x += pg
            i = j
        y -= satir_yuk
    metin_ops.append("ET")
    ops.extend(metin_ops if len(metin_ops) > 2 else [])
    for rr, yy, x0, x1, kal in cizgiler:
        ops.append("%.3f %.3f %.3f RG %.2f w %.2f %.2f m %.2f %.2f l S" % (rr[0], rr[1], rr[2], kal, x0, yy, x1, yy))
    ops.append("Q")
    icerik = "\n".join(ops).encode("latin-1")
    # Form XObject
    fontlar = " ".join("/%s %d 0 R" % (v[0], v[3]) for v in kaynak.values())
    ap_xref = doc.get_new_xref()
    doc.update_object(ap_xref, "<</Type/XObject/Subtype/Form/FormType 1/BBox[0 0 %.2f %.2f]/Matrix %s/Resources<</Font<<%s>>/ProcSet[/PDF/Text]>>>>" % (w, h, matris, fontlar))
    doc.update_stream(ap_xref, icerik)
    doc.xref_set_key(annot.xref, "AP", "<</N %d 0 R>>" % ap_xref)
    # Başka PDF okuyucuları için varsayılan görünüm bilgileri: /DA rengi referans okuyucuda kenarlık rengidir, /C dolgudur (dolgusuzda anahtar kalkar)
    renk_hex = _hex(renk)
    gorunen = [st for ch, st in kar if ch.strip()]
    hepsi = {b: bool(gorunen) and all(st.get(b) for st in gorunen) for b in BICIMLER}
    doc.xref_set_key(annot.xref, "DA", _pdf_metin("/Helv %.1f Tf %.3f %.3f %.3f rg" % (boyut, kenar_renk[0], kenar_renk[1], kenar_renk[2])))
    ds = "font: %s%s%s %.1fpt; text-align:%s; color:%s" % ("italic " if hepsi["italik"] else "", "bold " if hepsi["kalin"] else "",
                                                         _css_aile(aile), boyut, HIZA_CSS.get(hiza, "left"), renk_hex)
    doc.xref_set_key(annot.xref, "DS", _pdf_metin(ds))
    rc = freetext_rc_uret(parcalar, aile, boyut, renk_hex, hiza)
    doc.xref_set_key(annot.xref, "RC", _pdf_metin(rc))
    doc.xref_set_key(annot.xref, "C", "[%.4f %.4f %.4f]" % arka if arka else "null")
    if doc.xref_get_key(annot.xref, "IC")[0] != "null":
        doc.xref_set_key(annot.xref, "IC", "null")
    doc.xref_set_key(annot.xref, "BS", "<</Type/Border/W %d/S/S>>" % (1 if kenarlik else 0))
    doc.xref_set_key(annot.xref, "Q", str(HIZA_Q.get(hiza, 0)))
    # Okuyucu görünümü yeniden üretirse metin aynı yönde dursun (referans okuyucu da döndürülmüş sayfadaki yazının açısını
    # /Rotate'e yazar)
    if rot or doc.xref_get_key(annot.xref, "Rotate")[0] != "null":
        doc.xref_set_key(annot.xref, "Rotate", str(rot) if rot else "null")
    # PyMuPDF her yazıya anlamsız bir çağrı çizgisi (/CL) ekliyor; çağrı çizgili (callout) olmayan yazıda kaldırılır
    if doc.xref_get_key(annot.xref, "IT")[1] != "/FreeTextCallout" and doc.xref_get_key(annot.xref, "CL")[0] != "null":
        doc.xref_set_key(annot.xref, "CL", "null")
    # PDEfe stil kaydı (yeniden düzenlerken aynı biçimi kullanmak için). Kalin / Alti / Italik: bütün metin o biçimdeyse
    # (0.1.1 kutu düzeyinde okur). RCOzet: /RC başka programda değişirse parçalar /RC'den okunur. KenarRengi: yazı renginden
    # farklı kenarlık rengi (başka programda yazılmış yazının /DA'sından gelir; yoksa anahtar yazılmaz).
    doc.xref_set_key(annot.xref, "PDEfe", "<</Tip %s /Boyut %.1f /Renk %s /Arka %s /Kalin %s /Alti %s /Kenar %s /Italik %s /Hiza %s /Parcalar %s /RCOzet %s%s>>" % (
        _pdf_metin(aile), boyut, _pdf_metin(renk_hex), _pdf_metin(_hex(arka) if arka else ""), "true" if hepsi["kalin"] else "false",
        "true" if hepsi["alti"] else "false", "true" if kenarlik else "false", "true" if hepsi["italik"] else "false", _pdf_metin(hiza),
        _pdf_metin(json.dumps(parcalar, ensure_ascii=False, separators=(",", ":"))), _pdf_metin(hashlib.md5(rc.encode("utf-8")).hexdigest()),
        " /KenarRengi %s" % _pdf_metin(_hex(kenar_renk)) if k.get("kenarlikRengi") and _hex(kenar_renk) != renk_hex else ""))


def pdefe_stil_oku(doc, xref):
    """Notun /PDEfe stil kaydını kanonik biçimde okur. Parçalar kayıttan; parçasız eski (0.1.1) kayıtta kutu düzeyindeki
    Kalin / Alti bayraklarından. Kayıt yoksa ya da /RC başka programda değiştirilmişse (özet tutmuyor; 0.1.1 /RC
    yazmazdı) None: kayıt bayattır, yazı yabancı sayılır (görünüm dosyadaki AP'den, düzenleme /RC ve /DS'den)."""
    tur, _ = doc.xref_get_key(xref, "PDEfe")
    if tur != "dict":
        return None
    rc = _anahtar_metin(doc, xref, "RC")
    if rc and doc.xref_get_key(xref, "PDEfe/RCOzet")[1] != hashlib.md5(rc.encode("utf-8")).hexdigest():
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
    stil = {"tip": s("Tip"), "boyut": s("Boyut"), "renk": s("Renk"), "arka": s("Arka") or None, "kalin": bool(s("Kalin")),
            "altiCizili": bool(s("Alti")), "italik": bool(s("Italik")), "kenarlik": bool(s("Kenar")), "hiza": s("Hiza"),
            "kenarlikRengi": s("KenarRengi") or None}
    metin = _duz(_anahtar_metin(doc, xref, "Contents"))
    try:
        parcalar = json.loads(s("Parcalar")) if s("Parcalar") is not None else None
    except ValueError:
        parcalar = None
    if parcalar is None and rc:
        try:
            parcalar = freetext_rc_oku(rc, _hex(_renk(stil["renk"])) or "#000000")[0]   # kayıt bozuk: /RC (bizim yazdığımız)
        except Exception:
            pass
    if isinstance(parcalar, list):
        stil["parcalar"] = parcalar
    stil["donus"] = freetext_donus(doc, xref)
    return freetext_stil_kanonik(stil, metin)


def freetext_stil_al(doc, annot):
    """FreeText'in düzenlenebilir biçimi ve düz metni. PDEfe kaydı varsa ondan; yoksa (başka programın yazısı) /RC, /DS, /DA, /C, /BS, /Q'dan.
    Döner: (kanonik stil, düz metin)"""
    a = annot
    icerik = _duz(a.info.get("content") or "")
    stil = pdefe_stil_oku(doc, a.xref)
    if stil:
        return stil, icerik
    # DA: "/Helv 12 Tf 0 0 1 rg"
    _, da = doc.xref_get_key(a.xref, "DA")
    boyut, renk, da_renk = 12.0, "#000000", None
    m = re.search(r"([\d.]+)\s+Tf", da or "")
    if m:
        boyut = float(m.group(1)) or 12.0
    m = re.search(r"([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg", da or "")
    if m:
        renk = da_renk = _hex((float(m.group(1)), float(m.group(2)), float(m.group(3))))
    else:
        m = re.search(r"([\d.]+)\s+g\b", da or "")
        if m:
            g = float(m.group(1)); renk = da_renk = _hex((g, g, g))
    ds = _css_oku(_anahtar_metin(doc, a.xref, "DS") or "")
    q = doc.xref_get_key(a.xref, "Q")[1]
    stil = {"tip": _aile_eslestir(ds.get("aile")) or ("Arial" if ds.get("aile") else "Segoe UI"), "boyut": ds.get("boyut") or boyut,
            "renk": ds.get("renk") or renk, "hiza": ds.get("hiza") or {"1": "orta", "2": "sag"}.get(q, "sol"),
            "kalin": ds.get("kalin"), "italik": ds.get("italik"), "altiCizili": ds.get("alti")}
    rc = _anahtar_metin(doc, a.xref, "RC")
    if rc:
        try:
            parcalar, govde = freetext_rc_oku(rc, stil["renk"])
            if govde.get("aile"):
                stil["tip"] = _aile_eslestir(govde["aile"]) or stil["tip"]
            for anahtar in ("boyut", "renk", "hiza"):
                if govde.get(anahtar):
                    stil[anahtar] = govde[anahtar]
            rc_metin = "".join(p["metin"] for p in parcalar)
            if rc_metin.strip() or not icerik.strip():
                stil["parcalar"] = parcalar
                icerik = rc_metin
        except Exception:
            pass
    # Referans okuyucuda FreeText dolgusu /C'dir (PyMuPDF bunu "stroke" olarak verir); PDF 2.0 yazıcıları /IC kullanabilir
    dolgu = a.colors.get("stroke") or a.colors.get("fill")
    stil["arka"] = _hex(dolgu) if dolgu else None
    stil["kenarlik"] = (a.border.get("width") or 0) > 0
    # /DA rengi referans okuyucuda kenarlık rengidir (yazı rengi /DS ve /RC'de); yazı renginden farklıysa kenarlık rengi olarak korunur.
    # /DS, /RC yoksa (başka yazıcılar) /DA rengi yazı rengidir, kenarlık da o renkte kalır.
    if da_renk and da_renk != _hex(_renk(stil["renk"])):
        stil["kenarlikRengi"] = da_renk
    stil["donus"] = freetext_donus(doc, a.xref)
    return freetext_stil_kanonik(stil, icerik), icerik


# ---------------------------------------------------------------- not işlemleri
def _annot_bul(page, xref):
    for a in page.annots():
        if a.xref == xref:
            return a
    raise KeyError("not bulunamadı: xref %s" % xref)


def _popup_rect(page, annot):
    r = annot.rect
    pw = page.rect.width
    y0 = max(0, min(r.y0, page.rect.height - 114))   # sayfanın alt kenarından taşmasın
    return pymupdf.Rect(pw, y0, pw + 204, y0 + 114)


# PDF okuyucularında yaygın varsayılan not rengi (vurgu ve not): /C [1 .819611 0]
VARSAYILAN_SARI = (1, 0.819611, 0)


def _popup_ekle(doc, page, annot):
    """Referans okuyucudaki gibi gizli açılır pencere: yazdırılır, yakınlaştırılmaz/döndürülmez (/F 28), kapalı (/Open false)."""
    annot.set_popup(_popup_rect(page, annot))
    px = annot.popup_xref
    if px:
        doc.xref_set_key(px, "F", "28")
        doc.xref_set_key(px, "Open", "false")


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
    """n: {tur, rect, quads, icerik, yazar, renk, opaklik, simge, yazi, yanitXref, konu, it}"""
    tur = n["tur"]
    renk = _renk(n.get("renk"))
    if tur == "Highlight":
        quads = [pymupdf.Rect(*q) for q in n["quads"]]
        a = page.add_highlight_annot(quads)
        a.set_colors(stroke=renk or VARSAYILAN_SARI)
        a.set_opacity(float(n.get("opaklik", 0.4)))
        _ortak_bilgi(a, dict(n, konu=n.get("konu") or "Vurgu"))
        a.update()                                   # görünüm: /ExtGState << /CA /ca /BM /Multiply >>
        if n.get("it") == "HighlightNote":
            doc.xref_set_key(a.xref, "IT", "/HighlightNote")
        _popup_ekle(doc, page, a)
    elif tur == "Text":
        r = n["rect"]
        a = page.add_text_annot((r[0], r[1]), n.get("icerik") or "", icon=n.get("simge") or "Comment")
        a.set_colors(stroke=renk or VARSAYILAN_SARI)
        _ortak_bilgi(a, dict(n, konu=n.get("konu") or "Not"))
        a.set_flags(pymupdf.PDF_ANNOT_IS_PRINT | pymupdf.PDF_ANNOT_IS_NO_ZOOM | pymupdf.PDF_ANNOT_IS_NO_ROTATE)
        a.update()
        if n.get("yanitXref"):
            a.set_irt_xref(int(n["yanitXref"]))
            doc.xref_set_key(a.xref, "RT", "/R")
        else:
            _popup_ekle(doc, page, a)
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
    # Oluşturma tarihi modelden (silmesi geri alınıp yeniden yazılan not ilk tarihini korur)
    olusturma = n.get("olusturma")
    doc.xref_set_key(a.xref, "CreationDate", _pdf_metin(olusturma if isinstance(olusturma, str) and olusturma.startswith("D:") else _pdf_tarih()))
    # Benzersiz ad (referans okuyucudaki gibi UUID); PyMuPDF'in "fitz-A0" adı her belgede yinelenir. n["ad"] kullanılmaz: çekirdeğin notlar
    # yanıtındaki "ad" /NM değil /Name'dir (not simgesi, ör. "Comment")
    doc.xref_set_key(a.xref, "NM", _pdf_metin(str(uuid.uuid4())))
    return a.xref


# Köşe noktalarıyla çizilen notlar (çizim, çizgi, çokgen, çoklu çizgi): MuPDF bunlara /Rect yazdırmaz ("… annotations have no Rect
# property"; set_rect False döner). 0.2.1'e dek taşıma kayıtta sessizce kayboluyordu: arayüz notu yeni yerinde gösterip "Kaydedildi"
# diyordu, dosyada not eski yerindeydi. Taşıma /Rect ve köşe noktaları (PDF 2.0'ın /Path'i dahil) aynı miktarda kaydırılarak yazılır
# (_koseli_notu_tasi); görünüm akışı (/AP) /Rect'e eşlendiğinden çizim de taşınır, başka programın çizdiği görünüm (eğriler, uç
# biçimleri) olduğu gibi kalır. MuPDF görünümü yeniden üretirse (not_guncelle'nin renk / saydamlık / bilgi yazımı notu kirletir; önceden
# de böyleydi) kaydırılmış köşe noktalarından üretir: yer yine doğru.
KOSELI_NOTLAR = {"Ink": ("InkList", "Path"), "Line": ("L",), "Polygon": ("Vertices", "Path"), "PolyLine": ("Vertices", "Path")}
_PDF_SOZCUK = re.compile(r"\[|\]|[^\s\[\]]+")


def _pdf_sayi_dizisi(doc, metin, derinlik=0):
    """PDF dizisi metnini ("[1 2 [3 4]]", tek sayı da olur) iç içe float listesine çevirir; dolaylı başvurular ("12 0 R") çözülür. Sayı ve dizi
    dışında bir öğe ValueError (taşınamayan not sessizce kaydedilmiş sayılmasın)."""
    if derinlik > 4:
        raise ValueError("çok derin dolaylı başvuru")
    sozcukler = _PDF_SOZCUK.findall(metin or "")
    i = 0

    def oge():
        nonlocal i
        s = sozcukler[i]
        i += 1
        if s == "[":
            liste = []
            while sozcukler[i] != "]":
                liste.append(oge())
            i += 1
            return liste
        if s.isdigit() and i + 1 < len(sozcukler) and sozcukler[i].isdigit() and sozcukler[i + 1] == "R":
            i += 2
            return _pdf_sayi_dizisi(doc, doc.xref_object(int(s), compressed=True), derinlik + 1)
        return float(s)

    try:
        sonuc = oge()
    except (IndexError, ValueError):
        raise ValueError("beklenmeyen PDF dizisi: %s" % (metin or "")[:80])
    if i != len(sozcukler):
        raise ValueError("beklenmeyen PDF dizisi: %s" % (metin or "")[:80])
    return sonuc


def _pdf_dizi_yaz(liste):
    def sayi(v):
        s = ("%.4f" % v).rstrip("0").rstrip(".")
        return "0" if s in ("", "-0") else s
    return "[" + " ".join(_pdf_dizi_yaz(x) if isinstance(x, list) else sayi(x) for x in liste) + "]"


def _noktalari_kaydir(liste, dx, dy):
    """Düz [x y x y …] ya da iç içe ([[x y …] …]) dizideki noktaları kaydırır."""
    if liste and isinstance(liste[0], list):
        return [_noktalari_kaydir(x, dx, dy) for x in liste]
    return [v + (dx if k % 2 == 0 else dy) for k, v in enumerate(liste)]


def _koseli_notu_tasi(doc, page, a, rect):
    """Köşe noktalı notu (KOSELI_NOTLAR) rect'in sol üst köşesine taşır. rect ve a.rect PyMuPDF'in döndürülmemiş sayfa koordinatlarında
    (y aşağı); dosyadaki değerler PDF koordinatlarında (y yukarı, /UserUnit ölçekli): kaydırma x'te dx / birim, y'de −dy / birim."""
    eski = a.rect
    dx, dy = float(rect[0]) - eski.x0, float(rect[1]) - eski.y0
    if abs(dx) < 1e-3 and abs(dy) < 1e-3:
        return
    birim = 1.0
    tur_b, deger = doc.xref_get_key(page.xref, "UserUnit")
    if tur_b in ("int", "float", "xref"):
        try:
            birim = float(_pdf_sayi_dizisi(doc, deger)) or 1.0
        except (TypeError, ValueError):
            birim = 1.0
    ux, uy = dx / birim, -dy / birim
    for anahtar in ("Rect",) + KOSELI_NOTLAR[a.type[1]]:
        tur_d, metin = doc.xref_get_key(a.xref, anahtar)
        if tur_d == "null":
            continue
        dizi = _pdf_sayi_dizisi(doc, metin)
        if not isinstance(dizi, list):
            raise ValueError("beklenmeyen /%s" % anahtar)
        doc.xref_set_key(a.xref, anahtar, _pdf_dizi_yaz(_noktalari_kaydir(dizi, ux, uy)))
    yeni = a.rect
    if abs(yeni.x0 - float(rect[0])) > 0.01 or abs(yeni.y0 - float(rect[1])) > 0.01:
        raise ValueError("Not taşınamadı (%s); belge kaydedilmedi." % a.type[1])


def not_guncelle(doc, page, n):
    a = _annot_bul(page, int(n["xref"]))
    tur = a.type[1]
    if tur == "FreeText":
        # Biçim, /Contents yazılmadan önce okunur (PyMuPDF içerik yazarken /RC'yi siler). Renderer biçimi göndermediyse
        # (ör. başka programda yazılmış, düzenlenmeden taşınan yazı) dosyadaki biçim korunur.
        ft_stil, ft_metin = (n["yazi"], None) if n.get("yazi") else freetext_stil_al(doc, a)
        if n.get("icerik") is not None:
            ft_metin = n["icerik"]
        elif ft_metin is None:
            ft_metin = a.info.get("content") or ""
    if n.get("rect") and tur != "Highlight":
        if tur in KOSELI_NOTLAR:
            _koseli_notu_tasi(doc, page, a, n["rect"])
        elif a.set_rect(pymupdf.Rect(*n["rect"])) is False:
            # MuPDF yazmadı (ör. vurgu ailesi: /Rect yazdırmaz). Not taşınmak istendiyse sessizce kaydedilmiş sayılmasın; değişmeyen
            # rect (arayüz her güncellemede gönderir) yok sayılır
            r = a.rect
            if max(abs(r.x0 - n["rect"][0]), abs(r.y0 - n["rect"][1])) > 0.01:
                raise ValueError("Not taşınamadı (%s); belge kaydedilmedi." % tur)
    if n.get("renk") and tur in ("Highlight", "Text", "Underline", "StrikeOut", "Squiggly", "Square", "Circle", "Line", "Ink"):
        a.set_colors(stroke=_renk(n["renk"]))
    if n.get("opaklik") is not None:
        a.set_opacity(float(n["opaklik"]))
    _ortak_bilgi(a, n)
    if tur == "FreeText":
        a.update()
        freetext_gorunum_yaz(doc, page, a, ft_metin, ft_stil)
    elif tur in ("Highlight", "Text", "Underline", "StrikeOut", "Squiggly"):
        a.update()
    doc.xref_set_key(a.xref, "M", _pdf_metin(_pdf_tarih()))
    return a.xref


def not_sil(doc, page, xref):
    """Notu yanıtlarıyla siler. Silinen nesneler (not, yanıtlar, açılır pencereleri) boşaltılır (0.1.23, güvenlik denetimi): etiketli
    PDF'te yapı ağacı (StructTreeRoot → OBJR) notu göstermeye devam ettiği için tam yazımda (garbage) nesne atılmıyor, metni dosyada
    kalıyordu."""
    a = _annot_bul(page, int(xref))
    # Yanıtları da sil
    yanitlar = [b for b in page.annots() if getattr(b, "irt_xref", 0) == a.xref]
    silinen = []
    for b in yanitlar + [a]:
        silinen.append(b.xref)
        if getattr(b, "popup_xref", 0):
            silinen.append(b.popup_xref)
    for b in yanitlar:
        page.delete_annot(b)
    page.delete_annot(a)
    for x in silinen:
        try:
            doc.update_object(x, "<<>>")
        except Exception:
            pass


def _replace_file(hedef, gecici):
    """Windows ReplaceFileW: gecici, hedefin yerine geçer; hedefin yan akışları (ör. "internetten indirildi" işareti Zone.Identifier),
    izinleri, öznitelikleri ve oluşturma tarihi korunur. Kilitte PermissionError; desteklenmeyen durumda os.replace."""
    import ctypes
    from ctypes import wintypes
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    f = k32.ReplaceFileW
    f.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPVOID, wintypes.LPVOID]
    f.restype = wintypes.BOOL
    if f(hedef, gecici, None, 0x2 | 0x4, None, None):       # REPLACEFILE_IGNORE_MERGE_ERRORS | REPLACEFILE_IGNORE_ACL_ERRORS
        return
    kod = ctypes.get_last_error()
    if kod in (1176, 1177) and os.path.exists(gecici) and not os.path.exists(hedef):
        os.replace(gecici, hedef)                              # hedef kalktı, yenisi taşınamadı: düz taşıma (veri kaybolmasın)
        return
    if kod in (5, 32, 33, 1175):                               # erişim engellendi, paylaşım / kilit ihlali, hedef silinemedi
        raise PermissionError(kod, ctypes.FormatError(kod).strip(), hedef)
    os.replace(gecici, hedef)


def _ozellikleri_aktar(hedef, gecici):
    """macOS / Linux (0.2.0): hedefin izinleri ve (macOS'ta) genişletilmiş öznitelikleri (Finder etiketleri, "internetten indirildi"
    işareti com.apple.quarantine) ve erişim listesi yeni dosyaya aktarılır; os.replace yalnızca yeni dosyanınkini bırakırdı. Değişme
    zamanı aktarılmaz (COPYFILE_STAT yok). Elden geldiğince: aktarılamazsa kayıt yine yapılır."""
    try:
        shutil.copymode(hedef, gecici)
    except OSError:
        pass
    if MAC:
        try:
            import ctypes
            f = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True).copyfile
            f.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_void_p, ctypes.c_uint32]
            f.restype = ctypes.c_int
            f(os.fsencode(hedef), os.fsencode(gecici), None, 0x1 | 0x4)   # COPYFILE_ACL | COPYFILE_XATTR
        except Exception:
            pass


def pdf_hedefi_denetle(hedef):
    """Çekirdek yalnızca .pdf uzantılı dosyaya ya da var olan bir PDF'in (başının ilk 64 KB'ında %PDF- imzası) üzerine yazar (0.2.1; ana
    süreçteki denetimin ikinci savunması, main/guvenlik.js cekirdekParametreleri). PDF baytları .cmd / .bat gibi bir dosyaya yazılıp
    çalıştırılmasın, var olan başka bir dosya PDF'le ezilmesin: yapisal_kaydet ve sayfalar_uygula hedef verilmeyince var olması gerekmeyen
    yol'a yazıyordu. Değilse ValueError."""
    if str(hedef).lower().endswith(".pdf"):
        return
    try:
        with open(hedef, "rb") as f:
            if b"%PDF-" in f.read(64 * 1024):
                return
    except OSError:
        pass
    raise ValueError("Yalnızca .pdf uzantılı dosyaya yazılabilir.")


SALT_OKUNUR_METNI = "salt okunur"     # araclar.SALT_OKUNUR_METNI ile aynı: renderer bu ifadeyle salt okunur dosya hatasını tanır


class SaltOkunurHatasi(PermissionError):
    """Hedefe yazma izni yok (macOS / Linux; salt_okunursa_dur). İletisi program kilidi iletisiyle sarılmaz."""


def yazma_izni_yok(yol):
    """macOS / Linux (0.2.1): dosyaya yazma izni yok mu: izin bitleri ve erişim listesi (os.access; macOS'ta Finder'ın "Kilitli" işareti
    de: değiştirilemez dosyada access EPERM verir) ya da değiştirilemez işareti (st_flags UF_IMMUTABLE / SF_IMMUTABLE). Dosya yoksa False."""
    try:
        st = os.stat(yol)
    except OSError:
        return False
    if getattr(st, "st_flags", 0) & (stat.UF_IMMUTABLE | stat.SF_IMMUTABLE):
        return True
    return not os.access(yol, os.W_OK)


def salt_okunursa_dur(gecici, hedef):
    """macOS / Linux (0.2.1): hedefe yazma izni yoksa geçici dosya (verildiyse) silinir, SaltOkunurHatasi ("Dosya yazılamadı, salt okunur:
    <ad>"). os.replace (rename) üzerine yazılan dosyanın değil klasörün iznine bakar: salt okunur PDF sorusuz baştan yazılırdı, içindeki
    e-imza da sorulmadan bozulurdu. Windows'ta ReplaceFileW / os.replace salt okunur hedefi zaten reddeder; o yol değişmez."""
    if os.name == "nt" or not os.path.exists(hedef) or not yazma_izni_yok(hedef):
        return
    if gecici:
        try:
            os.remove(gecici)
        except OSError:
            pass
    raise SaltOkunurHatasi("Dosya yazılamadı, %s: %s" % (SALT_OKUNUR_METNI, os.path.basename(hedef)))


def uzun_yol(yol):
    """Windows: Yol MAX_PATH sınırına yakınsa uzun yol ön ekli tam yol (0.3.1): Ağ klasöründe ya da iç içe klasörlerde 260 karakteri aşan yol ön ekle
    açılır. Hedefin yanındaki geçici dosya da aynı ön ekle: Yol uzun diye kayıt yarıda kalmasın. Öbür platformlarda ve kısa yolda değişmez."""
    if os.name != "nt":
        return yol
    tam = os.path.abspath(yol)
    if len(tam) < 240 or tam.startswith("\\\\?\\"):
        return tam
    return "\\\\?\\UNC\\" + tam[2:] if tam.startswith("\\\\") else "\\\\?\\" + tam


def kilit_sahipleri(yol):
    """Dosyayı açık tutan süreçler (Windows Restart Manager; 0.3.1): [{pid, ad, tur}]. tur: 0 bilinmiyor, 1 ana penceresi var, 2 başka penceresi var, 3 hizmet,
    4 Gezgin, 5 konsol, 1000 kritik. Başka platformda ya da sorgu başarısızsa []. Yalnızca okur, hiçbir sürece dokunmaz."""
    if os.name != "nt":
        return []
    import ctypes
    from ctypes import wintypes

    class Zaman(ctypes.Structure):
        _fields_ = [("alt", wintypes.DWORD), ("ust", wintypes.DWORD)]

    class Surec(ctypes.Structure):
        _fields_ = [("pid", wintypes.DWORD), ("baslama", Zaman)]

    class Bilgi(ctypes.Structure):
        _fields_ = [("Process", Surec), ("strAppName", ctypes.c_wchar * 256), ("strServiceShortName", ctypes.c_wchar * 64), ("ApplicationType", ctypes.c_int),
                    ("AppStatus", wintypes.ULONG), ("TSSessionId", wintypes.DWORD), ("bRestartable", wintypes.BOOL)]

    try:
        rm = ctypes.WinDLL("rstrtmgr")
        rm.RmStartSession.argtypes = [ctypes.POINTER(wintypes.DWORD), wintypes.DWORD, wintypes.LPWSTR]
        rm.RmRegisterResources.argtypes = [wintypes.DWORD, wintypes.UINT, ctypes.POINTER(wintypes.LPCWSTR), wintypes.UINT, ctypes.c_void_p, wintypes.UINT, ctypes.c_void_p]
        rm.RmGetList.argtypes = [wintypes.DWORD, ctypes.POINTER(wintypes.UINT), ctypes.POINTER(wintypes.UINT), ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD)]
        rm.RmEndSession.argtypes = [wintypes.DWORD]
        oturum, anahtar = wintypes.DWORD(), ctypes.create_unicode_buffer(64)
        if rm.RmStartSession(ctypes.byref(oturum), 0, anahtar):
            return []
        try:
            dosyalar = (wintypes.LPCWSTR * 1)(os.path.abspath(yol))
            if rm.RmRegisterResources(oturum, 1, dosyalar, 0, None, 0, None):
                return []
            sonuc = []
            for boy in (16, 256):
                gerekli, sayi, neden, dizi = wintypes.UINT(0), wintypes.UINT(boy), wintypes.DWORD(0), (Bilgi * boy)()
                kod = rm.RmGetList(oturum, ctypes.byref(gerekli), ctypes.byref(sayi), dizi, ctypes.byref(neden))
                if kod == 234:      # ERROR_MORE_DATA
                    continue
                if kod == 0:
                    sonuc = [{"pid": dizi[i].Process.pid, "ad": dizi[i].strAppName or dizi[i].strServiceShortName, "tur": dizi[i].ApplicationType} for i in range(sayi.value)]
                break
            return sonuc
        finally:
            rm.RmEndSession(oturum)
    except (OSError, AttributeError, ValueError):
        return []


def _baska_sahipler(yol):
    """Dosyayı açık tutan öbür programlar (çekirdeğin ve PDEfe ana sürecinin kendisi sayılmaz)."""
    return [s for s in kilit_sahipleri(yol) if s["pid"] not in (os.getpid(), os.getppid())]


def y_kilit_sahipleri(p):
    """Kilitli dosya sorusunun kilit sahipleri (0.3.1). p: {yol}. Döner: {programlar: [adlar]}."""
    adlar = []
    for s in _baska_sahipler(p["yol"]):
        if s["ad"] and s["ad"] not in adlar:
            adlar.append(s["ad"])
    return {"programlar": adlar}


def _salt_okunur_mu(yol):
    """Windows: Dosyanın Salt okunur özniteliği açık mı."""
    try:
        return os.name == "nt" and bool(os.stat(yol).st_file_attributes & stat.FILE_ATTRIBUTE_READONLY)
    except OSError:
        return False


def _beklemek_bosuna(yol):
    """Kilit kısa sürmeyecek mi: Dosya salt okunur ya da bir programın penceresi onu açık tutuyor (kullanıcı formu iki programda açıp karşılaştırıyor). Virüs
    tarayıcı, dizin oluşturucu ve eşitleme programı penceresizdir: Onlar için beklenir."""
    return _salt_okunur_mu(yol) or any(s["tur"] in (1, 2, 4) for s in _baska_sahipler(yol))


def dosyayi_yerine_koy(gecici, hedef, deneme=6):
    """Geçici dosyayı hedefin yerine koyar (0.1.23). Hedef varsa Windows'ta ReplaceFileW (yukarıda): os.replace yeni dosyanın yan
    akışlarını ve izinlerini bırakırdı; internetten indirilmiş PDF'in işareti kalkar, başka okuyucular onu korumalı görünümde açmazdı.
    macOS'ta aynı iş için önce öznitelikler aktarılır (_ozellikleri_aktar), sonra os.replace; yazma izni olmayan hedefe yazılmaz
    (salt_okunursa_dur). Kısa süreli kilitlere (virüs tarayıcı, dizin oluşturucu, eşitleme) karşı birkaç kez dener, kilit kısa sürmeyecekse
    (0.3.1, _beklemek_bosuna) beklemez; olmazsa geçici dosyayı siler, PermissionError."""
    import gc
    son = None
    salt_okunursa_dur(gecici, hedef)
    if os.name != "nt" and os.path.exists(hedef):
        _ozellikleri_aktar(hedef, gecici)
    g, h = uzun_yol(gecici), uzun_yol(hedef)
    for i in range(deneme):
        try:
            if os.name == "nt" and os.path.exists(h):
                _replace_file(h, g)
            else:
                os.replace(g, h)
            return
        except PermissionError as e:
            son = e
            gc.collect()
            if i + 1 == deneme or _beklemek_bosuna(h):
                break
            time.sleep(0.25 * (i + 1))
    try:
        os.remove(g)
    except OSError:
        pass
    raise son


class YazmaHatasi(PermissionError):
    """Dosya yazılamadı (0.3.1). İleti kullanıcıya gösterilir: Ham hata metni ve dosya yolu içermez (stderr'e yazılır). Arayüz türü iletiden tanır (uygulama.js
    kayitHatasiTuru). tur: kilitli | salt_okunur | klasor_yok | disk_dolu | izin_yok | yol_uzun | dogrulama | bilinmeyen."""

    def __init__(self, tur, ileti):
        super().__init__(ileti)
        self.tur = tur


YAZMA_ILETILERI = {
    "kilitli": "Dosya yazılamadı, başka bir programda açık olabilir.",      # araclar.KILITLI_METNI ifadesi: renderer kilitli dosyayı bununla tanır
    "klasor_yok": "Dosya yazılamadı, klasör bulunamadı.",
    "disk_dolu": "Dosya yazılamadı, diskte yer kalmadı.",
    "izin_yok": "Dosya yazılamadı, bu konuma yazma izni yok.",
    "yol_uzun": "Dosya yazılamadı, dosyanın yolu çok uzun.",
    "dogrulama": "Dosya yazılamadı, yazılan kopya doğrulanamadı.",
    "degismis": "Dosya yazılmadı, dosya başka bir programda değişmiş.",     # renderer kayitHatasiTuru
    "bilinmeyen": "Dosya yazılamadı.",
}


def dosya_damgasi(yol):
    """Dosyanın içeriğinin özeti (SHA-256; 0.3.1 kayıp avı): Dosya başka bir programda değişti mi. Değişme zamanı değil içerik: Yedekleme ya da virüs tarayıcının dokunması sorulmasın.
    Okunamazsa (dosya yok, hiç paylaşımsız kilit) None: Karşılaştırılamaz, kayıt kendi hatasını verir."""
    try:
        h = hashlib.sha256()
        with open(uzun_yol(yol), "rb") as f:
            for parca in iter(lambda: f.read(1 << 20), b""):
                h.update(parca)
        return h.hexdigest()
    except OSError:
        return None


def _yazma_hatasi_turu(e, hedef):
    if isinstance(e, FileNotFoundError):
        return "klasor_yok"
    kod = (getattr(e, "winerror", None) or getattr(e, "errno", None)) if os.name == "nt" else getattr(e, "errno", None)
    if os.name == "nt":
        if kod in (28, 39, 112):        # ENOSPC, ERROR_HANDLE_DISK_FULL, ERROR_DISK_FULL
            return "disk_dolu"
        if kod in (206, 111):           # ERROR_FILENAME_EXCED_RANGE, ERROR_BUFFER_OVERFLOW
            return "yol_uzun"
        if kod in (2, 3):               # ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND
            return "klasor_yok"
        if kod in (32, 33, 1224, 1175, 1176, 1177):     # paylaşım ve kilit ihlali, eşlenmiş dosya, ReplaceFileW'nin hedefi kaldıramadığı durumlar
            return "kilitli"
        if kod in (5, 13) or isinstance(e, PermissionError):
            if _salt_okunur_mu(uzun_yol(hedef)):
                return "salt_okunur"
            return "kilitli" if _baska_sahipler(hedef) else "izin_yok"
        return "bilinmeyen"
    return {28: "disk_dolu", 36: "yol_uzun", 63: "yol_uzun", 2: "klasor_yok", 13: "izin_yok", 1: "izin_yok", 30: "izin_yok"}.get(kod, "bilinmeyen")


def yazma_hatasi(e, hedef):
    """OSError → kullanıcıya gösterilecek YazmaHatasi (ham ileti stderr'e). Zaten anlaşılır olan hata olduğu gibi döner."""
    if isinstance(e, (YazmaHatasi, SaltOkunurHatasi)):
        return e
    print("[kayıt] %s: %s" % (type(e).__name__, e), file=sys.stderr)
    tur = _yazma_hatasi_turu(e, hedef)
    if tur == "salt_okunur":
        return YazmaHatasi(tur, "Dosya yazılamadı, %s: %s" % (SALT_OKUNUR_METNI, os.path.basename(hedef)))
    return YazmaHatasi(tur, YAZMA_ILETILERI[tur])


def mupdf_yazma_hatasi(e, hedef):
    """MuPDF'in dosya yazarken verdiği hata (errno taşımaz, iletisinde sistemin metni): YazmaHatasi."""
    metin = str(e)
    print("[kayıt] MuPDF: %s" % metin, file=sys.stderr)
    if "No space" in metin:
        tur = "disk_dolu"
    elif "No such file" in metin:
        tur = "klasor_yok"
    elif "Permission denied" in metin or "Access is denied" in metin:
        return yazma_hatasi(PermissionError(13, "Permission denied"), hedef)
    else:
        tur = "bilinmeyen"
    return YazmaHatasi(tur, YAZMA_ILETILERI[tur])


_gecici_sayac = 0


def _gecici_olustur(klasor):
    """Hedefin klasöründe yeni geçici dosya (aynı birimde olsun: yerine koyma atomik): (yol, tanıtıcı). Ad kısa: Uzun dosya adının sonuna ek, ad sınırını aşardı."""
    global _gecici_sayac
    while True:
        _gecici_sayac += 1
        yol = os.path.join(klasor, ".pdefe-%d-%d.tmp" % (os.getpid(), _gecici_sayac))
        try:
            return yol, os.open(uzun_yol(yol), os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o666)
        except FileExistsError:
            continue


def atomik_yaz(veri, hedef, dogrula=None, deneme=6):
    """Baytları hedefe atomik yazar (0.3.1, kullanıcı: "bu kayıt mekanizmasında hiç sıkıntı olmamalı"): Hedefin klasöründe geçici dosya, diske boşaltılır (fsync),
    yeniden okunup karşılaştırılır, dogrula(okunan) varsa çağrılır (bozuksa YazmaHatasi fırlatmalı), sonra hedefin yerine konur. Her başarısızlıkta hedef bayt
    bayt aynı kalır, geçici dosya kalmaz. Hata: YazmaHatasi (anlaşılır ileti), yanlışlıkla hedef silinmez."""
    tam = os.path.abspath(hedef)
    gecici = None
    try:
        gecici, fd = _gecici_olustur(os.path.dirname(tam))
        with os.fdopen(fd, "wb") as f:
            f.write(veri)
            f.flush()
            os.fsync(f.fileno())
        with open(uzun_yol(gecici), "rb") as f:
            okunan = f.read()
        if okunan != veri:
            raise YazmaHatasi("dogrulama", YAZMA_ILETILERI["dogrulama"])
        if dogrula:
            dogrula(okunan)
        dosyayi_yerine_koy(gecici, tam, deneme)
        gecici = None
        if os.name != "nt":     # yeni adın da diske geçmesi (kayıt ardından elektrik kesilirse): Elden geldiğince
            try:
                d = os.open(os.path.dirname(tam), os.O_RDONLY)
                try:
                    os.fsync(d)
                finally:
                    os.close(d)
            except OSError:
                pass
    except OSError as e:
        raise yazma_hatasi(e, hedef)
    finally:
        if gecici:
            try:
                os.remove(uzun_yol(gecici))
            except OSError:
                pass


def belge_ac_yazmak_icin(yol):
    """Dosyayı açar; açılamıyorsa (başka programda kilitli vb.) Türkçe PermissionError verir."""
    try:
        return pymupdf.open(yol, filetype="pdf")   # yalnızca PDF (0.1.23; pdefe_core.BelgeOnbellek.al)
    except Exception as e:
        if os.path.exists(yol):
            print("[kayıt] %s" % e, file=sys.stderr)
            raise PermissionError("Dosya açılamadı; başka bir programda (örneğin bir PDF okuyucuda) açık olabilir.")
        raise FileNotFoundError("Dosya bulunamadı: %s" % yol)


def sayfa_dondurmeleri_dogrula(doc, dondurmeler):
    """{"<1-tabanlı sayfa no>": 0|90|180|270} sözlüğünü denetler (anahtar ve açı metin olabilir).
    Döner: [(sayfa_indeksi, aci)] sayfa sırasıyla. Geçersiz girdide Türkçe ValueError."""
    if dondurmeler is None:
        return []
    if not isinstance(dondurmeler, dict):
        raise ValueError("Sayfa döndürmeleri geçersiz: sayfa numarası → açı sözlüğü bekleniyor.")
    sonuc = {}
    for anahtar, deger in dondurmeler.items():
        try:
            if isinstance(anahtar, bool):
                raise ValueError
            no = int(str(anahtar).strip())
        except (TypeError, ValueError, OverflowError):
            raise ValueError("Sayfa döndürmesi geçersiz: \"%s\" bir sayfa numarası değil." % anahtar)
        if no < 1 or no > doc.page_count:
            raise ValueError("Sayfa döndürmesi geçersiz: %d. sayfa yok (belgede %d sayfa var)." % (no, doc.page_count))
        try:
            if isinstance(deger, bool):
                raise ValueError
            aci = float(str(deger).strip())
            if aci != int(aci):
                raise ValueError
            aci = int(aci)
        except (TypeError, ValueError, OverflowError):
            aci = None
        if aci not in (0, 90, 180, 270):
            raise ValueError("Sayfa döndürmesi geçersiz: %d. sayfa için açı %s; yalnızca 0, 90, 180 ya da 270 olabilir." % (no, deger))
        if no - 1 in sonuc and sonuc[no - 1] != aci:
            raise ValueError("Sayfa döndürmesi geçersiz: %d. sayfa için birden çok açı verildi." % no)
        sonuc[no - 1] = aci
    return sorted(sonuc.items())


def sayfa_dondurmeleri_uygula(doc, dondurmeler):
    """Mutlak /Rotate açılarını uygular (önce hepsini doğrular; hata varsa hiçbirine dokunmaz).
    Açısı zaten istenen değerde olan sayfa yazılmaz (artımlı kayıtta gereksiz nesne eklenmesin).
    Döner: açısı değiştirilen sayfa sayısı."""
    degisen = 0
    for idx, aci in sayfa_dondurmeleri_dogrula(doc, dondurmeler):
        page = doc[idx]
        if int(page.rotation or 0) % 360 != aci:
            page.set_rotation(aci)
            degisen += 1
    return degisen


def y_notlar_kaydet(p):
    """Değişiklik listesini uygular ve kaydeder.
    p: {yol, hedef, islemler: [{islem:'ekle'|'guncelle'|'sil', id, not:{...}}], artimli,
        sayfaDondurmeleri: {"<1-tabanlı sayfa no>": 0|90|180|270} (isteğe bağlı, mutlak açı),
        formlar: [{xref: alan xref'i, deger}] (0.3.1, isteğe bağlı: form alanlarının yeni değerleri, islemler/formlar.py)}
    Döndürmeler not işlemlerinden önce uygulanır (FreeText görünümü yeni açıya göre üretilir). Form değerleri notlardan önce yazılır
    (artımlı kayıtta yalnızca alanlar, widget'lar ve yeni görünüm akışları eklenir: e-imza korunur).
    Döner: {xrefler: {id: xref}, boyut, artimli, dondurmeler (yalnızca sayfaDondurmeleri verildiyse:
    açısı değişen sayfa sayısı), formlar (değeri yazılan alan sayısı), kullanimHakkiKaldirildi (baştan yazımda /Perms /UR3 kalktı mı)}"""
    from pdefe_core import onbellek  # döngüsel içe aktarma yerine çalışma zamanında
    from . import formlar as form_alanlari
    yol, hedef = p["yol"], p.get("hedef") or p["yol"]
    islemler = p.get("islemler") or []
    form_degerleri = form_alanlari.degerleri_dogrula(p.get("formlar"))
    sayfa_dondurmeleri = p.get("sayfaDondurmeleri")
    # temiz (0.1.23, güvenlik denetimi): artımlı kayıt eklemeyi dosyanın sonuna yazar; silinen ya da değiştirilen notun eski hâli
    # dosyanın önceki bölümünde kalır (ekranda görünmez, uygun bir araçla okunur). temiz verilince belge baştan yazılır, eski hâller
    # gider; şifreleme korunur. E-imzalı belgede imzayı geçersiz kılar: arayüz sorar (renderer/uygulama.js temizKayitKarari). Dolu bir form alanı değişince de aynı.
    temiz = bool(p.get("temiz"))
    artimli = bool(p.get("artimli", True)) and not temiz and os.path.abspath(hedef) == os.path.abspath(yol)
    # Aynı dosyaya tam yazımda şifreleme (sahip parolası, izinler) korunur; 0.1.22'ye dek yedek tam yazım yolu onu düşürüyordu
    sifre_koru = os.path.abspath(hedef) == os.path.abspath(yol)
    onbellek.birak(yol)
    doc = belge_ac_yazmak_icin(yol)
    gecici = None
    kaldirildi = False
    try:
        if doc.is_encrypted:
            raise PermissionError("Belge şifreli; kaydedilemiyor.")
        if artimli and doc.is_repaired:
            artimli = False   # onarılmış (bozuk xref'li) dosyaya artımlı yazılamaz; MuPDF FzErrorArgument verir (0.1.23)
        dondurmeler = sayfa_dondurmeleri_uygula(doc, sayfa_dondurmeleri)
        form_sayisi = form_alanlari.degerleri_uygula(doc, form_degerleri) if form_degerleri else 0
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
                except (ValueError, RuntimeError, pymupdf.mupdf.FzErrorBase):
                    artimli = False
            if not artimli:
                # Kullanım hakları imzası baştan yazılan belgede geçersizdir (0.3.1)
                kaldirildi = kullanim_hakki_kaldir(doc)
                gecici = hedef + ".pdefe-tmp"
                if sifre_koru:
                    doc.save(gecici, garbage=1, deflate=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
                else:
                    doc.save(gecici, garbage=1, deflate=True)
                doc.close()
                doc = None
                dosyayi_yerine_koy(gecici, hedef)   # yan akışlar (internetten indirildi işareti), izinler korunur; kilitte yeniden dener
                gecici = None
        except OSError as e:
            raise yazma_hatasi(e, hedef)            # anlaşılır ileti, ham hata metni kullanıcıya gitmez (0.3.1). macOS'ta yazma izni: SaltOkunurHatasi olduğu gibi
        except (RuntimeError, pymupdf.mupdf.FzErrorBase) as e:
            raise mupdf_yazma_hatasi(e, hedef)
    finally:
        if doc is not None:
            doc.close()
        if gecici and os.path.exists(gecici):      # tam yazım yarıda kaldıysa geçici dosya kalmasın
            try:
                os.remove(gecici)
            except OSError:
                pass
    sonuc = {"xrefler": xrefler, "boyut": os.path.getsize(hedef), "artimli": artimli, "formlar": form_sayisi, "kullanimHakkiKaldirildi": kaldirildi}
    if sayfa_dondurmeleri is not None:
        sonuc["dondurmeler"] = dondurmeler
    return sonuc


def y_freetext_stil(p):
    """Bir FreeText notunun düzenlenebilir biçimini (kanonik, parçalar dahil) ve düz metnini döndürür (PDEfe kaydından ya da
    başka programların yazdığı /RC, /DS, /DA, /C bilgilerinden)."""
    from pdefe_core import onbellek
    doc = onbellek.al(p["yol"])
    page = doc[int(p["sayfa"]) - 1]
    a = _annot_bul(page, int(p["xref"]))
    stil, icerik = freetext_stil_al(doc, a)
    return {"stil": stil, "icerik": icerik}


# Açık hedef dizisinin sözcükleri: sayfa başvurusu ("12 0 R"), ad ("/XYZ"), sayı, null
_HEDEF_SOZCUGU = re.compile(r"\d+\s+\d+\s+R|/[^\s/\[\]()<>{}%]+|[-+]?(?:\d+\.?\d*|\.\d+)|null")
# PDEfe'nin dışında dosya ya da program açan eylemler: güvenlik nedeniyle açılmaz (renderer kısa bildirim gösterir)
_DIS_EYLEMLER = {"GoToR", "GoToE", "Launch"}
# Renderer'ın yürüttüğü adlandırılmış eylemler (PyMuPDF bunları kaynak dosyadaki sayfaya çevirir; renderer gösterilen sayfaya göre gider)
_ADLI_EYLEMLER = {"NextPage", "PrevPage", "FirstPage", "LastPage"}


def _acik_hedef(doc, deger):
    """xref_get_key'in döndürdüğü (tür, değer) açık hedef dizisiyse {"tur", "p", "ref"} döner; değilse None.
    p: türün parametreleri PDF kullanıcı uzayında (null → None); ref: sayfa başvurusu [num, gen] ya da sayfa dizini (0 tabanlı tam sayı).
    Dizi dolaylı da olabilir ("15 0 R")."""
    tur, metin = deger
    if tur == "xref":
        try:
            metin = doc.xref_object(int(metin.split()[0]), compressed=True)
        except Exception:
            return None
    elif tur != "array":
        return None
    metin = (metin or "").strip()
    if not metin.startswith("[") or not metin.endswith("]"):
        return None
    s = _HEDEF_SOZCUGU.findall(metin[1:-1])
    if len(s) < 2 or not s[1].startswith("/"):
        return None
    if s[0].endswith("R"):
        n, g = s[0].split()[:2]
        ref = [int(n), int(g)]
    elif re.fullmatch(r"\d+", s[0]):
        ref = int(s[0])
    else:
        return None
    p = []
    for v in s[2:]:
        try:
            f = None if v == "null" else float(v)
        except ValueError:
            continue
        p.append(f if f is None or math.isfinite(f) else None)
    return {"tur": s[1][1:], "p": p, "ref": ref}


def y_baglantilar(p):
    """Sayfanın bağlantıları (0.3.1'de genişledi). Her bağlantı: rect (döndürülmemiş sayfa koordinatı, sol üst köşe; renderer
    view[0] + x, view[3] - y ile PDF noktasına çevirir) ve tur (PyMuPDF'in LINK_* türü), ayrıca biri:
      uri    dış bağlantı (renderer süzer ve sorar)
      eylem  adlandırılmış eylem (NextPage, PrevPage, FirstPage, LastPage; ötekiler katmana girmez): renderer gösterilen sayfaya göre yürütür
      hedef  açık hedef {tur, p, ref} (PDF kullanıcı uzayı) ve sayfa (PyMuPDF'in çözdüğü kaynak sayfa, 1 tabanlı; çözemediyse yok)
      ad     adlandırılmış hedefin adı (Names ağacı ya da /Dests sözlüğü; renderer PDF.js ile çözer) ve PyMuPDF çözebildiyse sayfa
      dis    True: başka dosya ya da program (GoToR, GoToE, Launch); dosya: belirtilen dosya adı (bildirimde gösterilmez)
    PyMuPDF'in "to" noktası kullanılmaz: açık hedefte döndürülmüş ve kaydırılmış sayfa koordinatında, adlandırılmış hedefte kullanıcı
    uzayında gelir ve hedefin türünü (Fit, FitR) taşımaz; FitR'de (0, 0) olur. "from" kutusu da döndürülmüş sayfa koordinatındadır:
    derotation_matrix ile döndürülmemiş koordinata çevrilir. Sonuçta NaN olmaz (JSON satırını bozardı)."""
    from pdefe_core import onbellek
    doc = onbellek.al(p["yol"])
    page = doc[int(p["sayfa"]) - 1]
    geri = page.derotation_matrix
    sonuc = []
    for l in page.get_links():
        r = pymupdf.Rect(l.get("from")) * geri
        if not all(math.isfinite(v) for v in r):
            continue
        tur = l.get("kind")
        d = {"rect": [r.x0, r.y0, r.x1, r.y1], "tur": tur}
        x = l.get("xref") or 0
        eylem = ""
        if x:
            try:
                k = doc.xref_get_key(x, "A/S")
                eylem = k[1][1:] if k[0] == "name" else ""
            except Exception:
                eylem = ""
        sayfa = l.get("page", -1)
        if eylem == "Named":
            try:
                k = doc.xref_get_key(x, "A/N")
                ad = k[1][1:] if k[0] == "name" else ""
            except Exception:
                ad = ""
            if ad in _ADLI_EYLEMLER:   # ötekiler (Print, GoBack, FullScreen…) katmana girmez
                d["eylem"] = ad
        elif tur == pymupdf.LINK_URI:
            d["uri"] = l.get("uri")
        elif eylem in _DIS_EYLEMLER or tur in (pymupdf.LINK_GOTOR, pymupdf.LINK_LAUNCH):
            d["dis"] = True
            d["dosya"] = str(l.get("file") or "")
        elif tur == pymupdf.LINK_NAMED:
            if l.get("nameddest"):
                d["ad"] = str(l.get("nameddest"))
            if isinstance(sayfa, int) and sayfa >= 0:
                d["sayfa"] = sayfa + 1
        elif tur == pymupdf.LINK_GOTO:
            h = None
            if x:
                try:
                    h = _acik_hedef(doc, doc.xref_get_key(x, "Dest")) or _acik_hedef(doc, doc.xref_get_key(x, "A/D"))
                except Exception:
                    h = None
            if h:
                d["hedef"] = h
            if isinstance(sayfa, int) and sayfa >= 0:
                d["sayfa"] = sayfa + 1
        sonuc.append(d)
    return {"baglantilar": sonuc}


def _kullanim_hakki_xrefleri(doc):
    """/Perms'teki kullanım hakları imzalarının (UR3, eski UR) nesne numaraları. Doğrudan (nesnesiz) sözlük yazılmışsa boş."""
    kat = doc.pdf_catalog()
    sonuc = set()
    for anahtar in ("Perms/UR3", "Perms/UR"):
        tur, deger = doc.xref_get_key(kat, anahtar)
        if tur == "xref":
            sonuc.add(int(deger.split()[0]))
    return sonuc


def _kullanim_hakki_sozlugu_mu(doc, x):
    """Nesne kullanım hakları imzası mı: /Reference'taki /TransformMethod /UR3 ya da /UR. /Perms'ten düşmüş (başka programın artımlı kaydıyla
    sahipsiz kalmış) sözlüğü de tanır."""
    tur, deger = doc.xref_get_key(x, "Reference")
    return tur == "array" and re.search(r"/TransformMethod\s*/UR3?\b", deger) is not None


def kullanim_hakki_var(doc):
    """Belgede kullanım hakları imzası var mı (/Perms /UR3, /UR). E-imza değildir: Formun ücretsiz okuyucuda doldurulup kaydedilebilmesi için
    üreticinin koyduğu imzadır."""
    kat = doc.pdf_catalog()
    if kat <= 0:   # kataloğu okunamayan belge: Kayıt bu yüzden düşmesin
        return False
    return doc.xref_get_key(kat, "Perms/UR3")[0] != "null" or doc.xref_get_key(kat, "Perms/UR")[0] != "null"


def kullanim_hakki_kaldir(doc):
    """/Perms'teki kullanım hakları imzalarını kaldırır, /Perms'te başka bir şey kalmazsa (DocMDP yoksa) anahtar da gider. Baştan yazımdan
    hemen önce çağrılır: İmza belgenin özgün baytlarını kapsar, baştan yazılan belgede geçersizdir, geçersiz imzalı formda okuyucu
    "genişletilmiş özellikler kullanılamıyor" uyarısı verir. Döner: kaldırıldı mı."""
    if not kullanim_hakki_var(doc):
        return False
    kat = doc.pdf_catalog()
    if doc.xref_get_key(kat, "Perms/DocMDP")[0] != "null":
        doc.xref_set_key(kat, "Perms/UR3", "null")
        doc.xref_set_key(kat, "Perms/UR", "null")
    else:
        doc.xref_set_key(kat, "Perms", "null")
    return True


def _dosyada_geciyor(yol, aranan):
    """Baytlar dosyada geçiyor mu. Dosya parça parça (örtüşmeli) taranır: Büyük taranmış belgede bütün dosya belleğe okunmasın."""
    parca, onceki = 1 << 20, b""
    with open(yol, "rb") as f:
        while True:
            blok = f.read(parca)
            if not blok:
                return False
            if aranan in onceki + blok:
                return True
            onceki = blok[-(len(aranan) - 1):]


def y_imza_durumu(p):
    """Belgede PDF'e gömülü e-imza var mı (0.1.23): Onay imzası (/Perms /DocMDP), değeri dolu imza alanı ya da imza sözlüğünün /ByteRange'i.
    Temiz (baştan) kayıt imzayı geçersiz kılacağı için arayüz bu durumda sorar.
    Sayılmayanlar (0.3.1): /SigFlags (imzalanmamış imza alanı olan formda da dolu) ve kullanım hakları imzası (/Perms /UR3, /UR: /ByteRange
    taşır ama e-imza değildir). Bunlar e-imzalı sayılınca imzasız formda dolu bir alan değişince "Bu belge e-imzalı." sorusu çıkıyordu.
    Okunamazsa hata: Arayüz "bilinmiyor" sayar ve imzayı korur (artımlı kayıt)."""
    from pdefe_core import onbellek
    yol = p["yol"]
    doc = onbellek.al(yol)
    if doc.xref_get_key(doc.pdf_catalog(), "Perms/DocMDP")[0] != "null":
        return {"imzali": True}
    for page in doc:
        for w in page.widgets(types=[pymupdf.PDF_WIDGET_TYPE_SIGNATURE]):
            if doc.xref_get_key(w.xref, "V")[0] != "null":
                return {"imzali": True}
    # Yukarıdakiler sayfaya bağlı olmayan imza alanını ve değeri ebeveyninde duran alanı görmez. Dosyada /ByteRange hiç geçmiyorsa (imzasız
    # belgelerin çoğu) nesneler gezilmez
    if not _dosyada_geciyor(yol, b"/ByteRange"):
        return {"imzali": False}
    kullanim = _kullanim_hakki_xrefleri(doc)
    for x in range(1, doc.xref_length()):
        if x in kullanim:
            continue
        try:
            if doc.xref_get_key(x, "ByteRange")[0] != "null" and not _kullanim_hakki_sozlugu_mu(doc, x):
                return {"imzali": True}
            if doc.xref_get_key(x, "V/ByteRange")[0] != "null":
                return {"imzali": True}
        except Exception:   # bozuk nesne: İmza sayılmaz, öbür nesnelere bakılır
            continue
    return {"imzali": False}


def kaydol(yontemler):
    yontemler["notlar_kaydet"] = y_notlar_kaydet
    yontemler["kilit_sahipleri"] = y_kilit_sahipleri
    yontemler["imza_durumu"] = y_imza_durumu
    yontemler["freetext_stil"] = y_freetext_stil
    yontemler["baglantilar"] = y_baglantilar
