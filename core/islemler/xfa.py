# -*- coding: utf-8 -*-
"""Dinamik XFA formları (0.3.1, kullanıcı isteği: "Bireysel başvuru formunda açabilir hale getireceğiz. bb formunda sayfa ekleme tuşunun
çalışabilir, tüm fonksiyonların çalışabilir haline gelmesi lazım").

Saf XFA belgede (katalogda /NeedsRendering, AcroForm'da /XFA paketleri, alan yok) sayfalar PDF'in kendi içeriği değil XFA şablonudur
(template) ve verisidir (datasets). MuPDF şablonu dizemez, yalnızca belgenin "lütfen bekleyin" sayfasını görür. Sayfaları arayüz PDF.js'in
XFA katmanıyla dizer ve çizer (renderer/xfa.js). Çekirdeğin işi şablonu okumak ve paketleri yazmaktır:

- xfa_bilgi: Şablondan arayüzün bilmesi gerekenler. Düğmeler ve tıklama betiklerinin tanınan eylemleri, tekrarlanabilir alt formlar (occur),
  sayfa numarası alanları ("Sayfa n / N"), ekranda görünüp basılmayan öğeler (relevant="-print"), kullanım hakları imzası (/Perms /UR3),
  alanların PDF.js'in HTML'ine taşımadığı biçimleri (_alan_bicimi: Hizalama, satır aralığı, hücreli alan, tam yazı boyu, zemin).
  Betikler çalıştırılmaz (JavaScript yorumlayıcısı yok): Yalnızca form tasarım programının ürettiği eylem kalıpları tanınır (örnek ekle /
  sil, görünürlük, kaydet, yazdır). Tanınmayan betikli düğme "desteklenmiyor" döner.
- xfa_degistir: Alt form örneği ekler ya da siler (datasets'te o alt formun veri grubu eklenir ya da silinir; PDF.js örnek sayısını
  veriden bağlar) ve düğümün görünürlüğünü değiştirir (şablonda presence özniteliği; kaydedilince de kalır). Girdi PDF.js'in kaydettiği
  baytlardır (girilen değerler datasets'te): Değerler korunur. Değişiklik artımlı yazılır, yalnızca eklenen bölüm döner.
- xfa_kaydet: PDF.js'in kaydettiği güncel datasets'i dosyaya yazar. Kullanım hakları imzası (/Perms /UR3) geçerli formda açılan dosyanın üstüne tek artımlı bölüm eklenir: İmza
  özgün baytları kapsar, onlar değişmez, referans okuyucu form verisinin artımlı eklenmesine izin verir (ölçüldü: Uyarı yok, form orada kaydedilebilir kalır). İmzası olmayan
  ya da baytlarla tutmayan formda baştan yazılır (girilen değerlerin eski hâlleri dosyada kalmaz). Yazım atomiktir (notlar.atomik_yaz) ve doğrulanır: Başarısızlıkta özgün
  dosya bayt bayt aynı kalır (kullanıcı formlara çok uzun yazılar yazıyor).
"""
import base64
import binascii
import copy
import hashlib
import os
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
import xml.parsers.expat

import pymupdf

from . import notlar

VERI_NS = "http://www.xfa.org/schema/xfa-data/1.0/"
XHTML_NS = "http://www.w3.org/1999/xhtml"       # zengin metinli alan değerinin içeriği
EN_BUYUK_PAKET = 64 * 1024 * 1024       # şablon ve veri paketinin en büyük boyu (bayt)
EN_BUYUK_VERI = 400 * 1024 * 1024       # base64 baytların en büyük boyu (karakter)
EN_COK_ISLEM = 16
EN_COK_ORNEK = 1000                     # occur max sınırsızken (-1) eklenebilecek en çok örnek (çekirdeği ve dizimi tutmasın)
EN_COK_IMZA_ALANI = 5000                # e-imza ararken yürünen en çok AcroForm alanı (bozuk ya da kötü niyetli belge çekirdeği tutmasın)
GORUNURLUKLER = ("visible", "hidden", "invisible", "inactive")
ISLEM_TURLERI = ("ekle", "sil", "gorunurluk")

# PDF.js'in HTML'inde xfaName taşıyan düğümler (arayüz düğmeyi ve alanı bu adların yoluyla tanır)
ADLI = {"subform", "field", "draw", "exclGroup", "area", "pageArea"}
# Yapısında yürünen kapsayıcılar (öbürleri: biçim, değer, olay öğeleri)
KAPSAYICI = {"subform", "subformSet", "area", "exclGroup", "pageSet", "pageArea", "field", "draw"}
SAYDAM = {"subform", "subformSet", "area"}    # adsızsa SOM aramasında içinden geçilir
METIN_UI = ("textEdit", "numericEdit", "dateTimeEdit", "passwordEdit")   # değeri yazı olan denetimler (PDF.js input ya da textarea çizer)
OLCU = re.compile(r"^\s*(-?\d*\.?\d+)\s*(pt|mm|cm|in|px)?\s*$")
OLCU_CARPAN = {None: 1.0, "pt": 1.0, "px": 1.0, "mm": 72 / 25.4, "cm": 72 / 2.54, "in": 72.0}   # birimsiz ölçü PDF.js'teki gibi pt
YATAY_HIZALAR = ("left", "center", "right", "justify", "justifyAll", "radix")
DIKEY_HIZALAR = ("top", "middle", "bottom")

ET.register_namespace("xfa", VERI_NS)
ET.register_namespace("xhtml", XHTML_NS)     # _xhtml_varsayilan


class _Dugum:
    """Şablonun bir öğesi. sirali: metin parçaları ve çocuk öğeler belgedeki sırayla (zengin metnin paragrafları için)."""
    __slots__ = ("ad", "oz", "cocuklar", "sirali", "ust", "bas", "no")

    def __init__(self, ad, oz, ust, bas, no):
        self.ad, self.oz, self.ust, self.bas, self.no = ad, oz, ust, bas, no
        self.cocuklar, self.sirali = [], []

    def cocuk(self, ad):
        for c in self.cocuklar:
            if c.ad == ad:
                return c
        return None

    def yazi(self):
        return "".join(p for p in self.sirali if isinstance(p, str))


def _guvenli_mi(veri):
    """XML'de DTD ve varlık tanımı reddedilir (varlık genişletmesiyle çekirdeği tutan belge)."""
    if len(veri) > EN_BUYUK_PAKET:
        raise ValueError("XFA paketi çok büyük.")
    if b"<!DOCTYPE" in veri[:4096].upper() or b"<!ENTITY" in veri.upper():
        raise ValueError("XFA paketi güvenlik nedeniyle okunmadı (izin verilmeyen XML tanımı).")


def _agac(veri):
    """Şablonu düğüm ağacına çevirir; her öğenin başlangıç etiketinin bayt konumu (bas) ve belge sırası (no) tutulur."""
    _guvenli_mi(veri)
    p = xml.parsers.expat.ParserCreate()
    p.buffer_text = True
    kok = _Dugum("#belge", {}, None, -1, -1)
    yigin, liste = [kok], []

    def bas(ad, oz):
        d = _Dugum(ad.split(":")[-1], oz, yigin[-1], p.CurrentByteIndex, len(liste))
        yigin[-1].cocuklar.append(d)
        yigin[-1].sirali.append(d)
        yigin.append(d)
        liste.append(d)

    def son(_ad):
        yigin.pop()

    def metin(m):
        yigin[-1].sirali.append(m)

    def yasak(*_a):
        raise ValueError("XFA paketi güvenlik nedeniyle okunmadı (izin verilmeyen XML tanımı).")

    p.StartElementHandler, p.EndElementHandler, p.CharacterDataHandler = bas, son, metin
    p.StartDoctypeDeclHandler = yasak
    p.EntityDeclHandler = yasak
    p.Parse(veri, True)
    return kok, liste


def _alt_dugumler(d):
    for c in d.cocuklar:
        yield c
        yield from _alt_dugumler(c)


# ---------------------------------------------------------------- paketler
def _paketler(doc):
    """AcroForm /XFA dizisinin paketleri: {ad: xref}. /XFA tek akışsa (bütün XDP) ya da yoksa {}."""
    kat = doc.pdf_catalog()
    tur, deger = doc.xref_get_key(kat, "AcroForm/XFA")
    if tur != "array":
        return {}
    sonuc = {}
    for ad, x in re.findall(r"\(((?:[^()\\]|\\.)*)\)\s*(\d+)\s+0\s+R", deger):
        sonuc.setdefault(ad, int(x))
    return sonuc


def _paket(doc, paketler, ad):
    x = paketler.get(ad)
    if not x:
        return None
    try:
        return doc.xref_stream(x)
    except Exception:
        return None


def _saf_mi(doc, paketler):
    """Saf (dinamik) XFA mı: /NeedsRendering true, şablon var, AcroForm'da alan yok (PDF.js'in ölçütü)."""
    kat = doc.pdf_catalog()
    if doc.xref_get_key(kat, "NeedsRendering")[1] != "true" or "template" not in paketler:
        return False
    tur, deger = doc.xref_get_key(kat, "AcroForm/Fields")
    return not (tur == "array" and re.search(r"\d+\s+0\s+R", deger))


# Format Değiştir, Birleştir ve Sayfaları düzenle'nin dosya ekleme yolu XFA formu aldığında (0.3.1 kabul sınaması): MuPDF yalnızca belgenin
# "lütfen bekleyin" sayfasını görür, araç o sayfayı işleyip "tamamlandı" diyordu (sağ tıktan gelen istekte görüldü).
ARAC_ILETISI = "Bu dosya dinamik XFA formu, bu araçta kullanılamaz. Formu PDEfe'de açıp Yazdır ile PDF olarak kaydedebilirsiniz."


def saf_xfa_mi(doc):
    """Belge saf (dinamik) XFA formu mu. Okunamazsa (parolalı belge gibi) değil."""
    try:
        return _saf_mi(doc, _paketler(doc))
    except Exception:
        return False


def _e_imza_araliklari(doc):
    """Belgedeki e-imzaların imzalanan bayt aralıkları ([a, b, c, d] /ByteRange'ler): değeri dolu imza alanları (AcroForm /Fields ağacı.
    Saf XFA formunda yalnızca görünmez imza alanı olabilir: PDF.js Rect'i [0 0 0 0] olan imza alanlarını alan saymaz) ve onay imzası
    (/Perms /DocMDP). Kullanım hakları imzası (/Perms /UR3, /UR) e-imza değildir, sayılmaz (kaydı kendi yoluyla korunur: y_xfa_kaydet). 0.3.1 inceleme:
    XFA kaydı imzaya bakmadan baştan yazıyordu."""
    araliklar = []

    def aralik(tur, deger):
        if tur != "array":
            return
        sayilar = [int(x) for x in re.findall(r"-?\d+", deger)]
        if len(sayilar) == 4 and all(x >= 0 for x in sayilar):
            araliklar.append(sayilar)

    kat = doc.pdf_catalog()
    aralik(*doc.xref_get_key(kat, "Perms/DocMDP/ByteRange"))
    gorulen = set()

    def gez(dizi, derinlik):
        for x in [int(x) for x in re.findall(r"(\d+)\s+0\s+R", dizi or "")][:EN_COK_IMZA_ALANI]:
            if x in gorulen or not 0 < x < doc.xref_length() or len(gorulen) >= EN_COK_IMZA_ALANI:
                continue
            gorulen.add(x)
            tur, kids = doc.xref_get_key(x, "Kids")
            if tur == "array" and derinlik < 10:
                gez(kids, derinlik + 1)
            aralik(*doc.xref_get_key(x, "V/ByteRange"))

    tur, alanlar = doc.xref_get_key(kat, "AcroForm/Fields")
    if tur == "array":
        gez(alanlar, 0)
    return araliklar


# ---------------------------------------------------------------- şablon
def _ad(d):
    return d.oz.get("name") or ""


def _html_yolu(d):
    """Düğümün PDF.js HTML'indeki ad yolu: adlı ADLI ataların ve kendisinin adları. Sayfa alanının (pageArea) içindeyse yol sayfa alanının
    adıyla başlar (HTML'de sayfanın kökü sayfa alanıdır), değilse kök alt formla (HTML'de sayfa kökünün içinde). Döner: (yol, sayfa_alani)."""
    yol, x = [], d
    while x is not None and x.ad != "#belge":
        if x.ad in ADLI and _ad(x):
            yol.append(_ad(x))
        if x.ad == "pageArea":
            return list(reversed(yol)), True
        x = x.ust
    return list(reversed(yol)), False


def _kok_alt_form(kok):
    sablon = kok.cocuk("template")
    return sablon.cocuk("subform") if sablon else None


def _gezilecekler(d):
    """Kapsayıcının yapı çocukları (proto, değişkenler ve biçim öğeleri dışında)."""
    return [c for c in d.cocuklar if c.ad in KAPSAYICI]


def _cocuk_bul(d, ad):
    """d'nin ad adlı çocuk kapsayıcısı; adsız alt formların içinden geçilir (SOM'un örtük araması)."""
    for c in _gezilecekler(d):
        if _ad(c) == ad:
            return c
    for c in _gezilecekler(d):
        if c.ad in SAYDAM and not _ad(c):
            b = _cocuk_bul(c, ad)
            if b is not None:
                return b
    return None


def _kapsam_ara(buradan, ad):
    """SOM'un kapsam araması: buradan başlayıp atalara doğru, her ata kendisi ve çocukları (içinden geçilerek) aranır."""
    x = buradan
    while x is not None and x.ad != "#belge":
        if x.ad in KAPSAYICI:
            if _ad(x) == ad:
                return x
            b = _cocuk_bul(x, ad)
            if b is not None:
                return b
        x = x.ust
    return None


def _ust_kapsayici(d):
    x = d.ust
    while x is not None and x.ad not in KAPSAYICI:
        x = x.ust
    return x


SOM_PARCA = re.compile(r"^([#$A-Za-z_][\w$#]*)(?:\[(?:\d+|\*)\])?$")


def _som_coz(som, buradan, kok):
    """Basit SOM ifadesi ("form1._Alt", "Alt.instanceManager", "this.parent.Alan", "xfa.form.form1.Alt"). Döner: (düğüm, örnek_yönetici_mi)
    ya da (None, False)."""
    parcalar = [x.strip() for x in som.split(".")]
    if not parcalar or any(not SOM_PARCA.match(x) for x in parcalar):
        return None, False
    adlar = [SOM_PARCA.match(x).group(1) for x in parcalar]
    i, d, mutlak = 0, None, False
    if adlar[0] in ("this", "$"):
        d, i = buradan, 1
    elif adlar[0] == "xfa" and len(adlar) > 1 and adlar[1] in ("form", "template"):
        i, mutlak = 2, True
    elif adlar[0] in ("$form", "$template"):
        i, mutlak = 1, True
    im = False
    if d is None:
        if i >= len(adlar):
            return None, False
        ad = adlar[i]
        hedef_ad = ad[1:] if ad.startswith("_") else ad
        if mutlak:
            kok_alt = _kok_alt_form(kok)
            d = kok_alt if kok_alt is not None and _ad(kok_alt) == hedef_ad else None
        else:
            d = _kapsam_ara(buradan, hedef_ad)
        im = ad.startswith("_")
        i += 1
    for ad in adlar[i:]:
        if d is None or im:
            return None, False
        if ad == "parent":
            d = _ust_kapsayici(d)
        elif ad == "instanceManager":
            im = True
        elif ad.startswith("_"):
            d, im = _cocuk_bul(d, ad[1:]), True
        else:
            d = _cocuk_bul(d, ad)
    return (d, im) if d is not None else (None, False)


def _occur(d):
    """Alt formun örnek sınırları (min, max; max -1 sınırsız). occur yoksa 1, 1."""
    o = d.cocuk("occur")

    def sayi(ad, varsayilan):
        try:
            return int(o.oz.get(ad, varsayilan)) if o is not None else varsayilan
        except ValueError:
            return varsayilan
    return max(0, sayi("min", 1)), sayi("max", 1)


def _veri_yolu(d):
    """Alt formun veri grubunun yolu (kök alt formdan): Adlı ve bağı olağan (once) alt formların adları; adsız ve bağı "none" olanlar
    saydam. dataRef / global bağlı ya da sayfa alanındaki alt formda None (desteklenmez)."""
    yol, x = [], d
    while x is not None and x.ad != "#belge":
        if x.ad in ("pageArea", "pageSet"):
            return None
        if x.ad == "subform" and _ad(x):
            bag = x.cocuk("bind")
            esles = (bag.oz.get("match") if bag is not None else None) or "once"
            if esles in ("dataRef", "global"):
                return None
            if esles == "once":
                yol.append(_ad(x))
        x = x.ust
    return list(reversed(yol)) or None


def _betik_satirlari(metin):
    metin = re.sub(r"/\*.*?\*/", " ", metin, flags=re.S)
    metin = re.sub(r"//[^\n]*", " ", metin)
    # Form tasarım programının eski sürümler için eklediği yeniden hesaplama koşulu
    metin = re.sub(r"if\s*\(\s*xfa\.host\.version\s*<\s*\d+\s*\)\s*\{[^{}]*\}", " ", metin, flags=re.S)
    return [s.strip() for s in re.split(r"[;\n]", metin) if s.strip()]


def _ref_desen(n):
    """Düğüm başvurusu: this.resolveNode('…') / xfa.resolveNode("…") ya da yalın SOM (form1._Alt, this.parent.Alan). n: grup ekinin sırası."""
    return (r"(?:(?:this|xfa)\.resolveNode\(\s*(?P<q%d>['\"])(?P<som%d>[^'\"]+)(?P=q%d)\s*\)" % (n, n, n)
            + r"|(?P<yalin%d>[#$A-Za-z_][\w$#]*(?:\[(?:\d+|\*)\])?(?:\.[#$A-Za-z_][\w$#]*(?:\[(?:\d+|\*)\])?)*))" % n)


EKLE = re.compile(r"^" + _ref_desen(1) + r"\.addInstance\(\s*(?:1|0|true|false)?\s*\)$")
SIL_SON = re.compile(r"^" + _ref_desen(1) + r"\.removeInstance\(\s*" + _ref_desen(2) + r"\.count\s*-\s*1\s*\)$")
SIL_SIRA = re.compile(r"^" + _ref_desen(1) + r"\.removeInstance\(\s*(?P<sira>\d+)\s*\)$")
GORUNURLUK = re.compile(r"^" + _ref_desen(1) + r"\.presence\s*=\s*(?P<q9>['\"])(?P<deger>visible|hidden|invisible|inactive)(?P=q9)$")
MENU = re.compile(r"^app\.execMenuItem\(\s*(['\"])(?P<oge>SaveAs|Save|Print)\1\s*\)$")
YAZDIR = re.compile(r"^xfa\.host\.print\(.*\)$", re.S)
YOK_SAY = re.compile(r"^(?:xfa\.form\.recalculate\(.*\)|xfa\.layout\.relayout\(\s*\)|xfa\.host\.setFocus\(.*\))$", re.S)
SAYFA_BETIGI = re.compile(r"^(?:this\.rawValue|\$)\s*=\s*(?:xfa\.layout|\$layout)\.(?P<tur>page|absPage)\(\s*(?:this|ref\(\s*\$\s*\))\s*\)(?P<bir>\s*\+\s*1)?$")
TOPLAM_BETIGI = re.compile(r"^(?:this\.rawValue|\$)\s*=\s*(?:xfa\.layout|\$layout)\.(?:pageCount|absPageCount)\(\s*\)$")


def _ref_coz(m, n, buradan, kok):
    return _som_coz(m.group("som%d" % n) or m.group("yalin%d" % n), buradan, kok)


def _dugme_eylemleri(alan, kok):
    """Düğmenin tıklama betiklerinin tanınan eylemleri. Döner: (eylemler, desteklenmiyor). Betiğin bir satırı bile tanınmazsa düğme
    desteklenmez (yarım çalıştırılmaz)."""
    eylemler, desteklenmiyor, betik_var = [], False, False
    for olay in alan.cocuklar:
        if olay.ad != "event" or olay.oz.get("activity") not in ("click", "mouseUp"):
            continue
        betik = olay.cocuk("script")
        if betik is None:
            continue
        betik_var = True
        for s in _betik_satirlari(betik.yazi()):
            m = EKLE.match(s)
            if m:
                d, im = _ref_coz(m, 1, alan, kok)
                if d is not None and im and d.ad == "subform":
                    eylemler.append({"tur": "ekle", "dugum": d.no})
                else:
                    desteklenmiyor = True
                continue
            m = SIL_SON.match(s) or SIL_SIRA.match(s)
            if m:
                d, im = _ref_coz(m, 1, alan, kok)
                if d is not None and im and d.ad == "subform":
                    e = {"tur": "sil", "dugum": d.no}
                    if m.groupdict().get("sira") is not None:
                        e["sira"] = int(m.group("sira"))
                    eylemler.append(e)
                else:
                    desteklenmiyor = True
                continue
            m = GORUNURLUK.match(s)
            if m:
                d, im = _ref_coz(m, 1, alan, kok)
                if d is not None and not im and d.ad in ("field", "draw", "subform", "exclGroup", "area"):
                    eylemler.append({"tur": "gorunurluk", "dugum": d.no, "deger": m.group("deger")})
                else:
                    desteklenmiyor = True
                continue
            m = MENU.match(s)
            if m:
                eylemler.append({"tur": {"SaveAs": "farkliKaydet", "Save": "kaydet", "Print": "yazdir"}[m.group("oge")]})
                continue
            if YAZDIR.match(s):
                eylemler.append({"tur": "yazdir"})
                continue
            if YOK_SAY.match(s):
                continue
            desteklenmiyor = True
    return eylemler, desteklenmiyor or not betik_var


def _sayfa_betigi(alan):
    """Alanın değerini sayfa numarası ya da sayfa sayısı yapan betik: 'sayfa' | 'sayfa0' (absPage, 0'dan) | 'toplam' | None."""
    for olay in alan.cocuklar:
        if olay.ad != "event":
            continue
        betik = olay.cocuk("script")
        if betik is None:
            continue
        for s in _betik_satirlari(betik.yazi()):
            m = SAYFA_BETIGI.match(s)
            if m:
                return "sayfa" if m.group("tur") == "page" or m.group("bir") else "sayfa0"
            if TOPLAM_BETIGI.match(s):
                return "toplam"
    return None


def _gomulu_paragraflar(cizim, alan_turleri):
    """Çizimin zengin metnindeki (exData, XHTML) paragraflardan içine sayfa numarası alanı gömülü olanlar. Gömülen alanın yerine {sayfa},
    {sayfa0} ya da {toplam} yazılır, başka gömülü alan boş kalır. sira: paragrafın çizimdeki p öğeleri arasındaki sırası (PDF.js da p'leri
    aynı sırayla çizer). Döner: [{sira, metin}]."""
    deger = cizim.cocuk("value")
    ex = deger.cocuk("exData") if deger is not None else None
    if ex is None:
        return []

    def yaz(d, parca, durum):
        for k, v in d.oz.items():
            if k.split(":")[-1] == "embed":
                tur = alan_turleri.get(v.lstrip("#"))
                if tur:
                    durum["var"] = True
                    parca.append("{%s}" % tur)
                return
        for p in d.sirali:
            if isinstance(p, str):
                parca.append(p)
            else:
                yaz(p, parca, durum)

    sonuc, sira = [], 0
    for d in _alt_dugumler(ex):
        if d.ad != "p":
            continue
        parca, durum = [], {"var": False}
        yaz(d, parca, durum)
        if durum["var"]:
            sonuc.append({"sira": sira, "metin": "".join(parca)})
        sira += 1
    return sonuc


def _dugme_mu(d):
    ui = d.cocuk("ui")
    return d.ad == "field" and ui is not None and ui.cocuk("button") is not None


def _olcu_pt(metin):
    """XFA ölçüsü ("1mm", "15pt") → pt. Okunamazsa ya da yoksa None."""
    m = OLCU.match(metin) if isinstance(metin, str) else None
    return round(float(m.group(1)) * OLCU_CARPAN[m.group(2)], 3) if m else None


def _proto(d, kimlikler):
    """Düğümün use / usehref ile başvurduğu düğüm (yalnızca aynı şablondaki "#kimlik" biçimi). Yoksa None."""
    hedef = d.oz.get("use") or d.oz.get("usehref") or ""
    return kimlikler.get(hedef[1:]) if hedef.startswith("#") else None


def _ozellik(d, ad, kimlikler):
    """Düğümün ad adlı çocuğu. Yoksa başvurduğu düğümünki (protolar zinciri)."""
    for _ in range(8):
        if d is None:
            return None
        c = d.cocuk(ad)
        if c is not None:
            return c
        d = _proto(d, kimlikler)
    return None


def _oznitelik(d, ad, kimlikler):
    """Düğümün ad özniteliği. Yoksa başvurduğu düğümünki."""
    for _ in range(8):
        if d is None:
            return None
        if ad in d.oz:
            return d.oz[ad]
        d = _proto(d, kimlikler)
    return None


def _alan_bicimi(d, kimlikler):
    """Alanın PDF.js'in HTML'ine taşımadığı biçimleri (0.3.1, kullanıcı: "ad soyad kısmı ... ortalı duruyor bizimkinde sola yatık"). PDF.js
    paragraf biçimini (para) yalnızca zengin metne uygular, input ve textarea'ya uygulamaz, hücreli alanı (comb) çizmez, alanın yazı boyunu 0,99
    ile çarpar, alan zeminindeki renksiz dolguyu (beyaz) atlar. Arayüz bunları HTML'e kendisi koyar (renderer/xfaHtml.js alanBicimle). Değerler
    yalnızca sayı ya da sabit listeden: Şablonun yazısı arayüze geçmez. Döner: {yol, sayfaAlani, x, y, g, b (yerinden ayırt etmek için, pt),
    boyut, harfAraligi, dolgu, metin (yazı alanıysa: hiza, dikey, satir, sol, sag, ust, alt, girinti, comb, kaydirmasiz)} ya da None (çizilmeyen alan)."""
    if _oznitelik(d, "presence", kimlikler) in ("hidden", "inactive"):
        return None
    yol, sa = _html_yolu(d)
    sonuc = {"yol": yol, "sayfaAlani": sa}
    for anahtar, ad in (("x", "x"), ("y", "y"), ("g", "w"), ("b", "h")):
        v = _olcu_pt(_oznitelik(d, ad, kimlikler))
        if v is not None:
            sonuc[anahtar] = v
    yazi = _ozellik(d, "font", kimlikler)
    if yazi is not None:
        boyut = _olcu_pt(_oznitelik(yazi, "size", kimlikler) or "10pt")   # size yoksa 10pt (belirtim, PDF.js de öyle)
        if boyut and boyut > 0:
            sonuc["boyut"] = boyut
        aralik = _olcu_pt(_oznitelik(yazi, "letterSpacing", kimlikler))
        if aralik:
            sonuc["harfAraligi"] = aralik
    # Renksiz dolgu beyazdır (belirtim. Form tasarım programı beyazı yazmaz: <fill/>)
    kenar = _ozellik(d, "border", kimlikler)
    dolgu = _ozellik(kenar, "fill", kimlikler) if kenar is not None else None
    if dolgu is not None and not dolgu.cocuklar and dolgu.oz.get("presence", "visible") == "visible" and kenar.oz.get("presence", "visible") == "visible":
        sonuc["dolgu"] = True
    ui = _ozellik(d, "ui", kimlikler)
    denetim = next((c for c in (ui.cocuklar if ui is not None else []) if c.ad in METIN_UI), None)
    if denetim is not None:
        para = _ozellik(d, "para", kimlikler)
        oku = lambda ad: _oznitelik(para, ad, kimlikler) if para is not None else None
        metin = {"dikey": oku("vAlign") if oku("vAlign") in DIKEY_HIZALAR else "top"}    # belirtimde varsayılan üst
        if oku("hAlign") in YATAY_HIZALAR:
            metin["hiza"] = oku("hAlign")
        for anahtar, ad in (("satir", "lineHeight"), ("sol", "marginLeft"), ("sag", "marginRight"), ("ust", "spaceAbove"), ("alt", "spaceBelow"), ("girinti", "textIndent")):
            v = _olcu_pt(oku(ad))
            if v:
                metin[anahtar] = v
        comb = _ozellik(denetim, "comb", kimlikler)
        if comb is not None:
            try:
                hucre = int(_oznitelik(comb, "numberOfCells", kimlikler) or 0)
            except ValueError:
                hucre = 0
            if 0 < hucre <= 200:
                metin["comb"] = hucre
        if _oznitelik(denetim, "vScrollPolicy", kimlikler) == "off":
            metin["kaydirmasiz"] = True
        sonuc["metin"] = metin
    return sonuc


def _sablon_bilgisi(kok, liste):
    """xfa_bilgi'nin şablondan çıkan bölümü."""
    dugmeler, sayfa_alanlari, ekranda, alanlar = [], [], [], []
    alan_turleri = {}        # id → sayfa betiği türü (gömülü alanlar için)
    kimlikler = {d.oz["id"]: d for d in liste if d.oz.get("id")}
    proto_ici = set()
    for d in liste:
        if d.ad in ("proto", "variables"):
            proto_ici.update(x.no for x in _alt_dugumler(d))
    for d in liste:
        if d.no in proto_ici or d.ad not in KAPSAYICI:
            continue
        if d.ad == "field":
            bicim = None if _dugme_mu(d) else _alan_bicimi(d, kimlikler)
            if bicim:
                alanlar.append(bicim)
            tur = _sayfa_betigi(d)
            if tur:
                if d.oz.get("id"):
                    alan_turleri[d.oz["id"]] = tur
                if d.oz.get("presence") not in ("hidden", "invisible", "inactive"):
                    yol, sa = _html_yolu(d)
                    sayfa_alanlari.append({"tur": "alan", "yol": yol, "sayfaAlani": sa, "deger": tur})
            if _dugme_mu(d):
                yol, sa = _html_yolu(d)
                eylemler, desteklenmiyor = _dugme_eylemleri(d, kok)
                dugmeler.append({"yol": yol, "sayfaAlani": sa, "eylemler": eylemler, "desteklenmiyor": desteklenmiyor})
        relevant = (d.oz.get("relevant") or "").split()
        if "-print" in relevant and d.ad in ADLI:
            yol, sa = _html_yolu(d)
            ekranda.append({"yol": yol, "sayfaAlani": sa})
    for d in liste:
        if d.ad == "draw" and d.no not in proto_ici and alan_turleri:
            paragraflar = _gomulu_paragraflar(d, alan_turleri)
            if paragraflar:
                yol, sa = _html_yolu(d)
                sayfa_alanlari.append({"tur": "cizim", "yol": yol, "sayfaAlani": sa, "paragraflar": paragraflar})
    ornekler = {}
    for d in liste:
        if d.ad == "subform" and d.no not in proto_ici and d.cocuk("occur") is not None:
            en_az, en_cok = _occur(d)
            yol, sa = _html_yolu(d)
            ornekler[str(d.no)] = {"yol": yol, "min": en_az, "max": en_cok, "veri": _veri_yolu(d) is not None}
    return {"dugmeler": dugmeler, "sayfaNumaralari": sayfa_alanlari, "ekranda": ekranda, "ornekler": ornekler, "alanlar": alanlar}


# ---------------------------------------------------------------- parametreler
def _baytlar(veri):
    if not isinstance(veri, str) or not veri:
        raise ValueError("XFA belgesinin baytları eksik.")
    if len(veri) > EN_BUYUK_VERI:
        raise ValueError("Belge çok büyük.")
    try:
        b = base64.b64decode(veri, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("XFA belgesinin baytları okunamadı.")
    if not b.startswith(b"%PDF-") and b"%PDF-" not in b[:1024]:
        raise ValueError("XFA belgesi PDF değil.")
    return b


def islemleri_dogrula(islemler):
    """xfa_degistir'in islemler parametresi: 1–EN_COK_ISLEM öğe, {tur: ekle|sil|gorunurluk, dugum: şablon düğümünün sırası, sira?: silinecek
    örnek (0'dan), deger?: görünürlük}. Geçersizse Türkçe ValueError."""
    if not isinstance(islemler, list) or not islemler or len(islemler) > EN_COK_ISLEM:
        raise ValueError("XFA işlemleri geçersiz.")
    sonuc = []
    for op in islemler:
        if not isinstance(op, dict) or op.get("tur") not in ISLEM_TURLERI:
            raise ValueError("XFA işlemi geçersiz.")
        dugum = op.get("dugum")
        if isinstance(dugum, bool) or not isinstance(dugum, int) or dugum < 0:
            raise ValueError("XFA işleminin düğümü geçersiz.")
        temiz = {"tur": op["tur"], "dugum": dugum}
        if op["tur"] == "gorunurluk":
            if op.get("deger") not in GORUNURLUKLER:
                raise ValueError("XFA görünürlüğü geçersiz.")
            temiz["deger"] = op["deger"]
        if op["tur"] == "sil" and op.get("sira") is not None:
            sira = op["sira"]
            if isinstance(sira, bool) or not isinstance(sira, int) or sira < 0:
                raise ValueError("Silinecek örnek geçersiz.")
            temiz["sira"] = sira
        sonuc.append(temiz)
    return sonuc


# ---------------------------------------------------------------- veri (datasets)
def _yerel(etiket):
    return etiket.rsplit("}", 1)[-1] if isinstance(etiket, str) else ""


# XML 1.0'da geçersiz karakter başvuruları (denetim karakterleri, vekil çiftler). Word'den ya da PDF'ten yapıştırılan yazıda sayfa sonu (\f) gelebilir: Başka bir
# programın kaydettiği formda böyle bir başvuru varsa paket okunamıyor, Ekle düğmesi çalışmıyordu (arayüz kendi yazdıklarını zaten temizler, xfa.js veriDegeri)
_GECERSIZ_BASVURU = re.compile(rb"&#(?:x0*(?:[0-8bBcCeEfF]|1[0-9a-fA-F]|[dD][89a-fA-F][0-9a-fA-F]{2}|[fF]{3}[eEfF])|0*(?:[0-8]|1[124-9]|2[0-9]|3[01]|5[5-6][0-9]{3}|6553[45]));")
# Zengin metinli değer: Veri düğümünün başlangıç etiketi ve hemen içindeki <body>, ardından paragraf (_zengin_onar)
_ZENGIN_DEGER = re.compile(rb"<([^\s<>/!?]+)((?:\s[^<>]*?)?)>(\s*)<body((?:\s[^<>]*?)?)>(?=\s*<(?:[\w.-]+:)?p[\s>/])")


def _veri_kok(datasets):
    _guvenli_mi(datasets)
    kok = ET.fromstring(_GECERSIZ_BASVURU.sub(b" ", datasets))
    veri = kok.find("{%s}data" % VERI_NS)
    if veri is None:
        veri = ET.SubElement(kok, "{%s}data" % VERI_NS)
    return kok, veri


def _bos_grup(ornek, ad):
    """Yeni örneğin veri grubu: var olan ilk örneğin yapısı, değerleri boş. PDF.js alanlara veri düğümü kurmaz: Düğümü olmayan alan
    kendi kimliğine bağlanır, yazılan değer veriye yazılmaz, kayıtta ve formun yeniden dizilişinde kaybolurdu (ölçüldü). Örnek yoksa boş
    veri grubu. İlk örneğin hiçbir değeri yeni örneğe geçmez (0.3.1 inceleme): Zengin metinli değerin XHTML içeriği silinir (yalnızca
    öğelerin metni silinince iç öğelerin ardındaki metin, ör. <p>Merhaba <span>dünya</span> sonu</p>'daki " sonu", yeni örneğe geçiyordu).
    Değer taşıyan öznitelikler (ad alanı olmayanlar, ör. bağlı görselin href'i) boşaltılır, öğe kalır (alan yine veri düğümüne bağlanır).
    Ad alanlı öznitelikler (XFA verisinin dataNode, contentType'ı) yapıdır, kalır."""
    if ornek is None:
        return ET.Element(ad, {"{%s}dataNode" % VERI_NS: "dataGroup"})
    yeni = copy.deepcopy(ornek)
    for e in list(yeni.iter()):
        for c in [c for c in e if isinstance(c.tag, str) and c.tag.startswith("{%s}" % XHTML_NS)]:
            e.remove(c)
    for e in yeni.iter():
        e.text = None
        e.tail = None
        for k in e.attrib:
            if not k.startswith("{"):
                e.attrib[k] = ""
    return yeni


def _ornek_degistir(veri, yol, en_az, en_cok, tur, sira=None):
    """Veri gruplarıyla örnek ekler ya da siler. Örnek sayısı max(min, grup sayısı) (PDF.js en az min örneği veri olmadan da dizer).
    Döner: (yeni sayı, sınır) — sınır: None ya da {'tur': 'en_fazla'|'en_az', 'sayi'}."""
    ebeveyn = veri
    for ad in yol[:-1]:
        b = next((c for c in ebeveyn if _yerel(c.tag) == ad), None)
        if b is None:
            b = ET.SubElement(ebeveyn, ad)
        ebeveyn = b
    gruplar = [c for c in ebeveyn if _yerel(c.tag) == yol[-1]]
    sayi = max(en_az, len(gruplar))
    if tur == "ekle":
        sinir = en_cok if en_cok >= 0 else EN_COK_ORNEK
        if sayi >= sinir:
            return sayi, {"tur": "en_fazla", "sayi": sinir}
        yer = list(ebeveyn).index(gruplar[-1]) + 1 if gruplar else len(ebeveyn)
        for _ in range(sayi + 1 - len(gruplar)):
            ebeveyn.insert(yer, _bos_grup(gruplar[0] if gruplar else None, yol[-1]))
            yer += 1
        return sayi + 1, None
    if sayi <= en_az:
        return sayi, {"tur": "en_az", "sayi": en_az}
    if sira is not None:
        if sira >= len(gruplar):
            return sayi, None
        ebeveyn.remove(gruplar[sira])
    else:
        for g in gruplar[sayi - 1:]:
            ebeveyn.remove(g)
    return sayi - 1, None


def _oznitelik_koy(veri, bas, ad, deger):
    """Şablon baytlarında bas konumundaki başlangıç etiketinin ad özniteliğini deger yapar (yoksa ekler). veri: bytearray."""
    if bas < 0 or bas >= len(veri) or veri[bas] != ord("<"):
        raise ValueError("Şablonda düğüm bulunamadı.")
    i, tirnak = bas + 1, None
    while i < len(veri):
        c = veri[i]
        if tirnak:
            if c == tirnak:
                tirnak = None
        elif c in (ord('"'), ord("'")):
            tirnak = c
        elif c == ord(">"):
            break
        i += 1
    else:
        raise ValueError("Şablonda düğüm bulunamadı.")
    etiket = bytes(veri[bas:i + 1])
    yeni_oz = ('%s="%s"' % (ad, deger)).encode("ascii")
    m = re.search(rb"(\s)" + ad.encode("ascii") + rb"\s*=\s*(\"[^\"]*\"|'[^']*')", etiket)
    if m:
        yeni = etiket[:m.start()] + m.group(1) + yeni_oz + etiket[m.end():]
    else:
        son = len(etiket) - (2 if etiket.endswith(b"/>") else 1)
        yeni = etiket[:son].rstrip() + b" " + yeni_oz + etiket[son:]
    veri[bas:i + 1] = yeni


# ---------------------------------------------------------------- yöntemler
def y_xfa_bilgi(p):
    """Belgenin XFA bilgisi. p: {yol}. Döner: {xfa: XFA paketi var mı, saf, kullanimHakki, eImzali (e-imza ya da onay imzası var mı:
    _e_imza_araliklari), dugmeler: [{yol, sayfaAlani, eylemler,
    desteklenmiyor}], sayfaNumaralari: [{tur: 'alan'|'cizim', yol, sayfaAlani, deger | paragraflar}], ekranda: [{yol, sayfaAlani}],
    ornekler: {dugum: {yol, min, max, veri}}, alanlar: [_alan_bicimi], damga: saf formda dosyanın içerik özeti (xfa_kaydet), zenginMetin: veride zengin metinli değer var mı
    (_zengin_onar)}. Yollar PDF.js HTML'inin ad yollarıdır (_html_yolu)."""
    from pdefe_core import onbellek
    doc = onbellek.al(p["yol"])
    paketler = _paketler(doc)
    sablon = _paket(doc, paketler, "template")
    sonuc = {"xfa": bool(paketler), "saf": _saf_mi(doc, paketler), "kullanimHakki": notlar.kullanim_hakki_var(doc),
             "eImzali": bool(_e_imza_araliklari(doc)), "zenginMetin": bool(_ZENGIN_DEGER.search(_paket(doc, paketler, "datasets") or b"")),
             "dugmeler": [], "sayfaNumaralari": [], "ekranda": [], "ornekler": {}, "alanlar": []}
    if sablon:
        kok, liste = _agac(sablon)
        sonuc.update(_sablon_bilgisi(kok, liste))
    onbellek.tutma(p["yol"], sonuc["saf"])
    if sonuc["saf"]:
        onbellek.birak(p["yol"])
        sonuc["damga"] = notlar.dosya_damgasi(p["yol"])
    return sonuc


def y_xfa_degistir(p):
    """Alt form örneği ekler / siler, düğüm görünürlüğünü değiştirir. p: {veri: PDF.js'in kaydettiği baytlar (base64), islemler}.
    Döner: {ek: girdinin sonuna eklenecek baytlar (base64)} ya da (artımlı yazılamayan belgede) {veri: bütün baytlar}, ornekler: {dugum:
    yeni örnek sayısı}; bir işlem sınıra takılırsa hiçbir şey değişmez, {sinir: {tur, sayi, dugum}} döner."""
    islemler = islemleri_dogrula(p.get("islemler"))
    girdi = _baytlar(p.get("veri"))
    fd, gecici = tempfile.mkstemp(prefix="pdefe-xfa-", suffix=".pdf")
    doc = None
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(girdi)
        doc = pymupdf.open(gecici, filetype="pdf")
        if doc.needs_pass:
            raise PermissionError("Belge şifreli, form değiştirilemiyor.")
        paketler = _paketler(doc)
        sablon_b, datasets_b = _paket(doc, paketler, "template"), _paket(doc, paketler, "datasets")
        if not sablon_b or not datasets_b:
            raise ValueError("Belgenin XFA şablonu ya da verisi okunamadı.")
        kok, liste = _agac(sablon_b)
        vkok, veri = _veri_kok(datasets_b)
        sablon = bytearray(sablon_b)
        duzeltmeler, ornekler = [], {}
        veri_degisti = False
        for op in islemler:
            if op["dugum"] >= len(liste):
                raise ValueError("Şablonda düğüm bulunamadı.")
            d = liste[op["dugum"]]
            if op["tur"] in ("ekle", "sil"):
                yol = _veri_yolu(d) if d.ad == "subform" else None
                if not yol:
                    raise ValueError("Bu alt formun örneği PDEfe'de eklenip silinemiyor.")
                en_az, en_cok = _occur(d)
                sayi, sinir = _ornek_degistir(veri, yol, en_az, en_cok, op["tur"], op.get("sira"))
                if sinir:
                    return {"sinir": dict(sinir, dugum=op["dugum"])}
                ornekler[str(op["dugum"])] = sayi
                veri_degisti = True
            else:
                if d.oz.get("presence", "visible") != op["deger"]:
                    duzeltmeler.append((d.bas, op["deger"]))
        for bas, deger in sorted(duzeltmeler, reverse=True):
            _oznitelik_koy(sablon, bas, "presence", deger)
        if veri_degisti:
            doc.update_stream(paketler["datasets"], _xhtml_varsayilan(ET.tostring(vkok, encoding="utf-8")))
        if duzeltmeler:
            doc.update_stream(paketler["template"], bytes(sablon))
        if not veri_degisti and not duzeltmeler:
            return {"ek": "", "ornekler": ornekler}
        return dict(_artimli_yaz(doc, gecici, girdi), ornekler=ornekler)
    finally:
        if doc is not None and not doc.is_closed:
            doc.close()
        try:
            os.remove(gecici)
        except OSError:
            pass


def _xhtml_varsayilan(veri):
    """ElementTree'nin yazdığı veride XHTML'i kökteki önekten <body>'nin varsayılan ad alanına çevirir (0.3.1 kayıp avı): PDF.js veri bölümünde öneki yok sayar, önekli zengin metin
    değer sayılmıyor, bölüm ekleyince alan boş görünüyordu."""
    if b"<xhtml:" not in veri:
        return veri
    veri = veri.replace(b' xmlns:xhtml="%s"' % XHTML_NS.encode("ascii"), b"", 1).replace(b"<xhtml:", b"<").replace(b"</xhtml:", b"</")
    return re.sub(rb"<body(?=[\s>/])", b'<body xmlns="%s"' % XHTML_NS.encode("ascii"), veri)


def _artimli_yaz(doc, gecici, girdi):
    """Belgenin değişikliklerini geçici dosyaya (girdinin kopyası) artımlı yazar. Döner: {ek: girdinin sonuna eklenecek baytlar} ya da (artımlı yazılamayan belgede) {veri: bütün baytlar}."""
    if doc.can_save_incrementally():
        doc.save(gecici, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
        doc.close()
        with open(gecici, "rb") as f:
            yeni = f.read()
        if yeni[:len(girdi)] == girdi:
            return {"ek": base64.b64encode(yeni[len(girdi):]).decode("ascii")}
        return {"veri": base64.b64encode(yeni).decode("ascii")}
    return {"veri": base64.b64encode(doc.tobytes(garbage=1, deflate=True)).decode("ascii")}


def _zengin_onar(datasets):
    """PDF.js'in yazdığı veri paketinde zengin metinli değerleri onarır (0.3.1 kayıp avı). PDF.js veriyi yazarken XHTML ad alanını ve xfa:contentType'ı atıyor: Başka bir programın
    kaydettiği zengin metinli değer, o alana hiç dokunulmasa da ad alansız <body> olur, PDF.js (ölçüldü) ve büyük olasılıkla öbür okuyucular değeri okuyamaz, alan boş görünür. Yazı
    dosyadadır ama kullanıcı kayboldu sanır. Bir de boş değerde (alan boşaltıldı) eski <body>'yi yazıyor: Arayüz boş yerine tek boşluk verir (xfa.js _veri), burada değer gerçekten boşalır."""
    def duzelt(m):
        ad, oz, bosluk, govde = m.groups()
        if b"xmlns=" in govde:
            return m.group(0)
        if b"contentType=" not in oz:
            oz += b' xfa:contentType="text/html"'
        return b'<%s%s>%s<body xmlns="%s"%s>' % (ad, oz, bosluk, XHTML_NS.encode("ascii"), govde)
    return _ZENGIN_DEGER.sub(duzelt, datasets).replace(b"> </", b"></")


def y_xfa_zengin_onar(p):
    """Zengin metinli değeri olan formda PDF.js'in baytlarını onarır (_zengin_onar). p: {veri (base64)}. Döner: {ek: girdinin sonuna eklenecek baytlar, onarılacak bir şey yoksa boş} ya da
    (artımlı yazılamayan belgede) {veri: bütün baytlar}. E-imzalı formda imzalanan bölüm değişmez."""
    girdi = _baytlar(p.get("veri"))
    fd, gecici = tempfile.mkstemp(prefix="pdefe-xfa-", suffix=".pdf")
    doc = None
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(girdi)
        doc = pymupdf.open(gecici, filetype="pdf")
        if doc.needs_pass:
            raise PermissionError("Belge şifreli, form okunamıyor.")
        paketler = _paketler(doc)
        eski = _paket(doc, paketler, "datasets")
        yeni = _zengin_onar(eski) if eski else eski
        if yeni == eski:
            return {"ek": ""}
        doc.update_stream(paketler["datasets"], yeni)
        return _artimli_yaz(doc, gecici, girdi)
    finally:
        if doc is not None and not doc.is_closed:
            doc.close()
        try:
            os.remove(gecici)
        except OSError:
            pass


def _imzali_bolum_ayni(girdi, araliklar, yol):
    """Girdide e-imzaların kapsadığı baytlar (dosyanın başından son ByteRange'in sonuna dek) diskteki dosyanınkiyle aynı mı: PDF.js formu
    artımlı kaydeder (değişen veri sona eklenir), imzalanan bölüm olduğu gibi kalır. Çekirdek bir yapı değişikliğini artımlı yazamadıysa
    (xfa_degistir'in 'veri' yanıtı) bölüm değişmiştir, imza korunamaz."""
    son = max(a[2] + a[3] for a in araliklar)
    if son <= 0 or son > len(girdi) or not yol:
        return False
    try:
        with open(notlar.uzun_yol(yol), "rb") as f:
            return f.read(son) == girdi[:son]
    except OSError:
        return False


def _eksik_degerler(datasets, beklenen):
    """Arayüzün yazdığı değerlerden veri paketinde olmayanların sırası: PDF.js veri düğümü olmayan alanın değerini saklamaz (bilinen sınır), böyle bir alan varsa
    kullanıcı kaydın yazdığını sanmasın."""
    if not beklenen:
        return []
    try:
        _, veri = _veri_kok(datasets)
    except (ET.ParseError, ValueError) as e:
        print("[kayıt] veri paketi denetlenemedi: %s" % e, file=sys.stderr)     # denetim kaydı engellemez (paketi PDF.js yazdı, kendisi okuyor)
        return []
    metinler = {e.text for e in veri.iter() if e.text}
    for e in veri.iter():
        metinler.update(e.attrib.values())
    butun = None
    eksik = []
    for i, d in enumerate(beklenen):
        if d in metinler:
            continue
        if butun is None:
            butun = "\n".join(metinler)
        if d not in butun:      # başka bir değerin parçası olarak yazılmışsa (zengin metin) eksik sayılmaz: Yanlış uyarı kullanıcıyı kayıttan alıkoyardı
            eksik.append(i)
    return eksik


def _hak_bolumu_sonu(doc, girdi):
    """Kullanım hakları imzasının (/Perms /UR3, /UR) kapsadığı bölümün sonu. İmza yoksa ya da baytlarla tutmuyorsa None: Belge baştan yazılmış (MuPDF artımlı yazamadıysa) imza artık
    geçersizdir, ya da imza gerçek değildir."""
    kat = doc.pdf_catalog()
    if kat <= 0:
        return None
    for anahtar in ("Perms/UR3/ByteRange", "Perms/UR/ByteRange"):
        tur, deger = doc.xref_get_key(kat, anahtar)
        if tur != "array":
            continue
        s = [int(x) for x in re.findall(r"-?\d+", deger)]
        if len(s) != 4 or s[0] != 0 or s[1] <= 0 or s[2] <= s[1] or s[3] < 0:
            continue
        son = s[2] + s[3]
        if son <= len(girdi) and girdi[s[1]:s[1] + 1] == b"<" and girdi[s[2] - 1:s[2]] == b">":
            return son
    return None


def _form_bolumlerini_at(taban, izinli, alt_sinir):
    """Dosyanın sonundaki, yalnız form verisini ve şablonu değiştiren artımlı bölümleri (PDEfe'nin önceki oturumlarının kayıtları) atar, kalan baytları döner: Kullanım hakları imzalı
    formda eski yazıların dosyada kalmaması için (0.3.1 kayıp avı: Baştan yazımın "girilen değerlerin eski hâlleri dosyada kalmaz" güvencesi imza varken de sürsün). Yeni kayıt bu değerlerin
    güncelini yazar, atılan bölümlerde başka bir şey yoktur. Bölümde başka nesne varsa (başka programın kaydı: Örneğin yorum, belge bilgisi) orada durulur, ona dokunulmaz. İzinli sayılan
    tek öbür nesne bölümün kendi çapraz başvuru akışıdır. alt_sinir: İmzanın kapsadığı bölümün sonu, altına inilmez."""
    sonlar = [m.end() for m in re.finditer(rb"%%EOF(?:\r\n|\r|\n)?", taban)]
    kes = len(taban)
    for i in range(len(sonlar) - 1, 0, -1):
        if sonlar[i] != kes or sonlar[i - 1] < alt_sinir:
            break
        bolum = taban[sonlar[i - 1]:sonlar[i]]
        nesneler = list(re.finditer(rb"(?:^|[\r\n ])(\d+) \d+ obj\b", bolum))
        if not nesneler:
            break
        baska = [m for m in nesneler if int(m.group(1)) not in izinli]
        if len(baska) > 1 or (baska and not re.match(rb"\s*<<[^>]*?/Type\s*/XRef\b", bolum[baska[0].end():])):
            break
        kes = sonlar[i - 1]
    return taban[:kes]


def _hakla_yaz(taban, veri_paketi, sablon):
    """Açılan dosyanın baytlarına (taban) güncel veriyi ve şablonu tek artımlı bölümle ekler. Kullanım hakları imzası geçerli kalır, oturumdaki önceki kayıtların ve bölüm eklemelerin
    ara hâlleri dosyaya girmez, dosya kayıt sayısıyla büyümez. PDF.js'in kaydettiği zincir her bölüm eklemede bütün veriyi yeniden taşıyor. Yapılamazsa None (arayan zinciri yazar).
    Geçici klasörde yer olmaması da kaydı düşürmez: Dosyanın diski başka olabilir."""
    doc = gecici = None
    try:
        fd, gecici = tempfile.mkstemp(prefix="pdefe-xfa-", suffix=".pdf")
        with os.fdopen(fd, "wb") as f:
            f.write(taban)
        doc = pymupdf.open(gecici, filetype="pdf")
        paketler = _paketler(doc)
        if doc.needs_pass or doc.is_repaired or "datasets" not in paketler or not doc.can_save_incrementally():
            return None
        if _paket(doc, paketler, "datasets") != veri_paketi:
            doc.update_stream(paketler["datasets"], veri_paketi)
        if sablon and "template" in paketler and _paket(doc, paketler, "template") != sablon:
            doc.update_stream(paketler["template"], sablon)
        doc.save(gecici, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
        doc.close()
        with open(gecici, "rb") as f:
            yeni = f.read()
        return yeni if yeni[:len(taban)] == taban else None
    except Exception as e:      # doğrudan zincir yazılır: Bu adım yalnızca dosyayı küçültür
        print("[kayıt] artımlı yazılamadı: %s" % e, file=sys.stderr)
        return None
    finally:
        if doc is not None and not doc.is_closed:
            doc.close()
        if gecici:
            try:
                os.remove(gecici)
            except OSError:
                pass


def _kayit_dogrulayici(paketler_veri, saf):
    """atomik_yaz'ın doğrulayıcısı: Yazılan kopya onarılmadan açılıyor, form yine saf XFA, veri paketi kaydedilmek istenenle bayt bayt aynı, XML'i geçerli."""
    def dogrula(okunan):
        try:
            d = pymupdf.open(stream=okunan, filetype="pdf")
        except Exception as e:
            print("[kayıt] yazılan kopya açılamadı: %s" % e, file=sys.stderr)
            raise notlar.YazmaHatasi("dogrulama", notlar.YAZMA_ILETILERI["dogrulama"])
        try:
            pk = _paketler(d)
            sorun = ("onarıldı" if d.is_repaired else "şifre" if d.needs_pass else "paket yok" if not pk else "saf değil" if _saf_mi(d, pk) != saf
                     else "veri farklı" if _paket(d, pk, "datasets") != paketler_veri else "")
        finally:
            d.close()
        if sorun:
            print("[kayıt] yazılan kopya: %s" % sorun, file=sys.stderr)
            raise notlar.YazmaHatasi("dogrulama", notlar.YAZMA_ILETILERI["dogrulama"])
    return dogrula


def _dogrulanir_mi(aday, dogrula):
    """Aday baytlar kaydın doğrulamasından geçiyor mu (kaydı düşürmeden seçmek için)."""
    try:
        dogrula(aday)
        return True
    except notlar.YazmaHatasi:
        return False


def y_xfa_kaydet(p):
    """PDF.js'in kaydettiği baytlardaki güncel XFA verisini hedefe yazar: Kullanım hakları imzası geçerliyse artımlı (imza kalır), değilse baştan. p: {veri (base64), hedef,
    taban?: açılan dosyanın bayt sayısı (veri onunla başlar; artımlı bölüm onun üstüne), yol?: belgenin önceki dosyası (önbellekten bırakılır), imzayiKoru?: e-imzalı formda baytlar olduğu gibi yazılır (PDF.js'in artımlı
    kaydı: imzalanan bölüm ve /Perms değişmez, alanların önceki değerleri dosyada kalır), beklenen?: arayüzün yazdığı metin değerleri (veri paketinde aranır),
    hizli?: kilitte uzun beklenmez (otomatik kayıt), damga?: hedefin beklenen içerik özeti (farklıysa dosya başka programda değişmiştir, yazılmaz: YazmaHatasi "degismis")}.
    Döner: {boyut, kullanimHakkiKaldirildi, eksik: veri paketinde bulunmayan beklenen değerlerin sıraları, damga: yazılanın içerik özeti,
    imzaKorundu (imzayiKoru verildiyse: imzalanan bölüm diskteki dosyanınkiyle aynı çıktı mı; değilse belge baştan yazıldı)}. Yazılamazsa notlar.YazmaHatasi: Hedef
    bayt bayt aynı kalır."""
    from pdefe_core import onbellek, y_belge_birak
    hedef = p["hedef"]
    girdi = _baytlar(p.get("veri"))
    beklenen = [d for d in (p.get("beklenen") or []) if isinstance(d, str)] if isinstance(p.get("beklenen"), list) else []
    doc = pymupdf.open(stream=girdi, filetype="pdf")
    sonuc = {}
    try:
        if doc.needs_pass:
            raise PermissionError("Belge şifreli, kaydedilemiyor.")
        if not _paketler(doc):
            raise ValueError("Belgede XFA formu yok.")
        koru = False
        if p.get("imzayiKoru") is True:
            araliklar = _e_imza_araliklari(doc)
            koru = bool(araliklar) and _imzali_bolum_ayni(girdi, araliklar, p.get("yol") or hedef)
            sonuc["imzaKorundu"] = koru
        paketler = _paketler(doc)
        veri_paketi = _paket(doc, paketler, "datasets")
        saf = _saf_mi(doc, paketler)
        eksik = _eksik_degerler(veri_paketi, beklenen)
        dogrula = _kayit_dogrulayici(veri_paketi, saf)
        kaldirildi = False
        cikti = None
        if koru:
            # E-imzayı korumak için (0.3.1 inceleme): Baytlar olduğu gibi. Kullanım hakları imzasına da dokunulmaz (onu kaldırmak kataloğu
            # değiştirirdi: Onaylı (DocMDP) belgede izin verilmeyen değişiklik sayılır)
            cikti = girdi
        else:
            hak_sonu = _hak_bolumu_sonu(doc, girdi)
            if hak_sonu:
                # Kullanım hakları imzası korunur (0.3.1 kayıp avı, referans okuyucuda ölçüldü): İmza kaldırılınca okuyucu "bu forma yazılan verileri kaydedemezsiniz" diyordu, form iki
                # programda kullanılırken orada yazılanlar kaydedilemiyordu. Açılan dosyanın üstüne tek artımlı bölüm, olmazsa PDF.js'in zinciri. İkisi de doğrulanamazsa (bozuk dosya) aşağıda
                # baştan yazılır: İmzayı korumak hiçbir zaman kaydı düşürmez
                taban = p.get("taban")
                uygun = isinstance(taban, int) and not isinstance(taban, bool) and hak_sonu <= taban <= len(girdi) and girdi[:taban].rstrip().endswith(b"%%EOF")
                sablon = _paket(doc, paketler, "template")
                tabanlar = []
                if uygun:
                    kisa = _form_bolumlerini_at(girdi[:taban], {paketler.get("datasets"), paketler.get("template")}, hak_sonu)
                    tabanlar = [kisa] if len(kisa) == taban else [kisa, girdi[:taban]]
                for aday in [lambda t=t: _hakla_yaz(t, veri_paketi, sablon) for t in tabanlar] + [lambda: girdi]:
                    c = aday()
                    if c and _dogrulanir_mi(c, dogrula):
                        cikti = c
                        sonuc["kullanimHakkiKorundu"] = True
                        break
        if cikti is None:
            kaldirildi = notlar.kullanim_hakki_kaldir(doc)
            sifreli = bool(doc.is_encrypted or doc.metadata.get("encryption"))
            cikti = doc.tobytes(garbage=1, deflate=True, encryption=pymupdf.PDF_ENCRYPT_KEEP if sifreli else pymupdf.PDF_ENCRYPT_NONE)
    finally:
        doc.close()
    # Çekirdek dosyayı açık tutmasın: Kendi kilidi kayıt hatası olurdu (Windows'ta açık dosyanın yerine yenisi konamaz)
    for y in {hedef, p.get("yol") or hedef}:
        y_belge_birak({"yol": y})
    onbellek.tutma(hedef, saf)
    # Dosya bu form açıldıktan sonra başka bir programda kaydedildiyse (0.3.1 kayıp avı: Kullanıcı formu iki programda birden açık tutuyor) üzerine sessizce yazılmaz, orada
    # yazılanlar kaybolurdu. Kullanıcı seçince arayüz damgasız yeniden çağırır
    damga = p.get("damga")
    if isinstance(damga, str) and notlar.dosya_damgasi(hedef) not in (None, damga):
        raise notlar.YazmaHatasi("degismis", notlar.YAZMA_ILETILERI["degismis"])
    notlar.atomik_yaz(cikti, hedef, dogrula, deneme=2 if p.get("hizli") else 6)
    return dict(sonuc, boyut=os.path.getsize(notlar.uzun_yol(hedef)), kullanimHakkiKaldirildi=kaldirildi, eksik=eksik, damga=hashlib.sha256(cikti).hexdigest())


def kaydol(yontemler):
    yontemler["xfa_bilgi"] = y_xfa_bilgi
    yontemler["xfa_degistir"] = y_xfa_degistir
    yontemler["xfa_kaydet"] = y_xfa_kaydet
    yontemler["xfa_zengin_onar"] = y_xfa_zengin_onar
