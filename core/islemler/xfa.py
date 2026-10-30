# -*- coding: utf-8 -*-
"""Dinamik XFA formları (0.3.1, kullanıcı isteği: "Bireysel başvuru formunda açabilir hale getireceğiz. bb formunda sayfa ekleme tuşunun
çalışabilir, tüm fonksiyonların çalışabilir haline gelmesi lazım").

Saf XFA belgede (katalogda /NeedsRendering, AcroForm'da /XFA paketleri, alan yok) sayfalar PDF'in kendi içeriği değil XFA şablonudur
(template) ve verisidir (datasets). MuPDF şablonu dizemez, yalnızca belgenin "lütfen bekleyin" sayfasını görür. Sayfaları arayüz PDF.js'in
XFA katmanıyla dizer ve çizer (renderer/xfa.js). Çekirdeğin işi şablonu okumak ve paketleri yazmaktır:

- xfa_bilgi: Şablondan arayüzün bilmesi gerekenler. Düğmeler ve tıklama betiklerinin tanınan eylemleri, tekrarlanabilir alt formlar (occur),
  sayfa numarası alanları ("Sayfa n / N"), ekranda görünüp basılmayan öğeler (relevant="-print"), kullanım hakları imzası (/Perms /UR3).
  Betikler çalıştırılmaz (JavaScript yorumlayıcısı yok): Yalnızca form tasarım programının ürettiği eylem kalıpları tanınır (örnek ekle /
  sil, görünürlük, kaydet, yazdır). Tanınmayan betikli düğme "desteklenmiyor" döner.
- xfa_degistir: Alt form örneği ekler ya da siler (datasets'te o alt formun veri grubu eklenir ya da silinir; PDF.js örnek sayısını
  veriden bağlar) ve düğümün görünürlüğünü değiştirir (şablonda presence özniteliği; kaydedilince de kalır). Girdi PDF.js'in kaydettiği
  baytlardır (girilen değerler datasets'te): Değerler korunur. Değişiklik artımlı yazılır, yalnızca eklenen bölüm döner.
- xfa_kaydet: PDF.js'in kaydettiği baytları (güncel datasets) dosyaya baştan yazar (girilen değerlerin eski hâlleri dosyada kalmaz).
  Kullanım hakları imzası (/Perms /UR3) kaldırılır: İmza belgenin özgün baytlarını kapsar, değişen belgede geçersizdir. Geçersiz imzalı
  belgeyi referans okuyucu "genişletilmiş özellikler artık kullanılamaz" uyarısıyla açar, imzasız belgeyi olağan form olarak açar.
"""
import base64
import binascii
import copy
import os
import re
import tempfile
import xml.etree.ElementTree as ET
import xml.parsers.expat

import pymupdf

from . import notlar

VERI_NS = "http://www.xfa.org/schema/xfa-data/1.0/"
EN_BUYUK_PAKET = 64 * 1024 * 1024       # şablon ve veri paketinin en büyük boyu (bayt)
EN_BUYUK_VERI = 400 * 1024 * 1024       # base64 baytların en büyük boyu (karakter)
EN_COK_ISLEM = 16
EN_COK_ORNEK = 1000                     # occur max sınırsızken (-1) eklenebilecek en çok örnek (çekirdeği ve dizimi tutmasın)
GORUNURLUKLER = ("visible", "hidden", "invisible", "inactive")
ISLEM_TURLERI = ("ekle", "sil", "gorunurluk")

# PDF.js'in HTML'inde xfaName taşıyan düğümler (arayüz düğmeyi ve alanı bu adların yoluyla tanır)
ADLI = {"subform", "field", "draw", "exclGroup", "area", "pageArea"}
# Yapısında yürünen kapsayıcılar (öbürleri: biçim, değer, olay öğeleri)
KAPSAYICI = {"subform", "subformSet", "area", "exclGroup", "pageSet", "pageArea", "field", "draw"}
SAYDAM = {"subform", "subformSet", "area"}    # adsızsa SOM aramasında içinden geçilir

ET.register_namespace("xfa", VERI_NS)


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


def _kullanim_hakki_var(doc):
    kat = doc.pdf_catalog()
    return doc.xref_get_key(kat, "Perms/UR3")[0] != "null" or doc.xref_get_key(kat, "Perms/UR")[0] != "null"


def _kullanim_hakki_kaldir(doc):
    """/Perms'teki kullanım hakları imzalarını (UR3, eski UR) kaldırır; /Perms'te başka bir şey kalmazsa (DocMDP yoksa) anahtar da gider.
    Döner: kaldırıldı mı."""
    if not _kullanim_hakki_var(doc):
        return False
    kat = doc.pdf_catalog()
    if doc.xref_get_key(kat, "Perms/DocMDP")[0] != "null":
        doc.xref_set_key(kat, "Perms/UR3", "null")
        doc.xref_set_key(kat, "Perms/UR", "null")
    else:
        doc.xref_set_key(kat, "Perms", "null")
    return True


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


def _sablon_bilgisi(kok, liste):
    """xfa_bilgi'nin şablondan çıkan bölümü."""
    dugmeler, sayfa_alanlari, ekranda = [], [], []
    alan_turleri = {}        # id → sayfa betiği türü (gömülü alanlar için)
    proto_ici = set()
    for d in liste:
        if d.ad in ("proto", "variables"):
            proto_ici.update(x.no for x in _alt_dugumler(d))
    for d in liste:
        if d.no in proto_ici or d.ad not in KAPSAYICI:
            continue
        if d.ad == "field":
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
    return {"dugmeler": dugmeler, "sayfaNumaralari": sayfa_alanlari, "ekranda": ekranda, "ornekler": ornekler}


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


def _veri_kok(datasets):
    _guvenli_mi(datasets)
    kok = ET.fromstring(datasets)
    veri = kok.find("{%s}data" % VERI_NS)
    if veri is None:
        veri = ET.SubElement(kok, "{%s}data" % VERI_NS)
    return kok, veri


def _bos_grup(ornek, ad):
    """Yeni örneğin veri grubu: var olan ilk örneğin yapısı, değerleri boş. PDF.js alanlara veri düğümü kurmaz: Düğümü olmayan alan
    kendi kimliğine bağlanır, yazılan değer veriye yazılmaz, kayıtta ve formun yeniden dizilişinde kaybolurdu (ölçüldü). Örnek yoksa boş
    veri grubu."""
    if ornek is None:
        return ET.Element(ad, {"{%s}dataNode" % VERI_NS: "dataGroup"})
    yeni = copy.deepcopy(ornek)
    for e in yeni.iter():
        e.text = None
    yeni.tail = None
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
    """Belgenin XFA bilgisi. p: {yol}. Döner: {xfa: XFA paketi var mı, saf, kullanimHakki, dugmeler: [{yol, sayfaAlani, eylemler,
    desteklenmiyor}], sayfaNumaralari: [{tur: 'alan'|'cizim', yol, sayfaAlani, deger | paragraflar}], ekranda: [{yol, sayfaAlani}],
    ornekler: {dugum: {yol, min, max, veri}}}. Yollar PDF.js HTML'inin ad yollarıdır (_html_yolu)."""
    from pdefe_core import onbellek
    doc = onbellek.al(p["yol"])
    paketler = _paketler(doc)
    sablon = _paket(doc, paketler, "template")
    sonuc = {"xfa": bool(paketler), "saf": _saf_mi(doc, paketler), "kullanimHakki": _kullanim_hakki_var(doc),
             "dugmeler": [], "sayfaNumaralari": [], "ekranda": [], "ornekler": {}}
    if sablon:
        kok, liste = _agac(sablon)
        sonuc.update(_sablon_bilgisi(kok, liste))
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
            doc.update_stream(paketler["datasets"], ET.tostring(vkok, encoding="utf-8"))
        if duzeltmeler:
            doc.update_stream(paketler["template"], bytes(sablon))
        if not veri_degisti and not duzeltmeler:
            return {"ek": "", "ornekler": ornekler}
        if doc.can_save_incrementally():
            doc.save(gecici, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
            doc.close()
            doc = None
            with open(gecici, "rb") as f:
                yeni = f.read()
            if yeni[:len(girdi)] == girdi:
                return {"ek": base64.b64encode(yeni[len(girdi):]).decode("ascii"), "ornekler": ornekler}
            return {"veri": base64.b64encode(yeni).decode("ascii"), "ornekler": ornekler}
        return {"veri": base64.b64encode(doc.tobytes(garbage=1, deflate=True)).decode("ascii"), "ornekler": ornekler}
    finally:
        if doc is not None:
            doc.close()
        try:
            os.remove(gecici)
        except OSError:
            pass


def y_xfa_kaydet(p):
    """PDF.js'in kaydettiği baytları (güncel XFA verisi) hedefe baştan yazar, kullanım hakları imzasını kaldırır. p: {veri (base64), hedef,
    yol?: belgenin önceki dosyası (önbellekten bırakılır)}. Döner: {boyut, kullanimHakkiKaldirildi}."""
    from pdefe_core import onbellek
    hedef = p["hedef"]
    girdi = _baytlar(p.get("veri"))
    doc = pymupdf.open(stream=girdi, filetype="pdf")
    gecici = None
    try:
        if doc.needs_pass:
            raise PermissionError("Belge şifreli, kaydedilemiyor.")
        if not _paketler(doc):
            raise ValueError("Belgede XFA formu yok.")
        kaldirildi = _kullanim_hakki_kaldir(doc)
        for y in {hedef, p.get("yol") or hedef}:
            onbellek.birak(y)
        gecici = hedef + ".pdefe-tmp"
        sifreli = bool(doc.is_encrypted or doc.metadata.get("encryption"))
        try:
            if sifreli:
                doc.save(gecici, garbage=1, deflate=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
            else:
                doc.save(gecici, garbage=1, deflate=True)
        except PermissionError as e:
            raise PermissionError("Dosya yazılamadı, başka bir programda açık olabilir. (%s)" % e)
        doc.close()
        doc = None
        try:
            notlar.dosyayi_yerine_koy(gecici, hedef)
        except notlar.SaltOkunurHatasi:
            raise
        except PermissionError as e:
            raise PermissionError("Dosya yazılamadı, başka bir programda açık olabilir. (%s)" % e)
        gecici = None
    finally:
        if doc is not None:
            doc.close()
        if gecici and os.path.exists(gecici):
            try:
                os.remove(gecici)
            except OSError:
                pass
    return {"boyut": os.path.getsize(hedef), "kullanimHakkiKaldirildi": kaldirildi}


def kaydol(yontemler):
    yontemler["xfa_bilgi"] = y_xfa_bilgi
    yontemler["xfa_degistir"] = y_xfa_degistir
    yontemler["xfa_kaydet"] = y_xfa_kaydet
