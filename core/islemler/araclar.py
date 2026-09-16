# -*- coding: utf-8 -*-
"""PDF araçları: küçültme, sayfa düzenleme, ayırma, birleştirme (PDF + görsel), döndürme.

Her yöntem `params` sözlüğü alır; `params["_ilerleme"](yuzde, mesaj)` ile ilerleme bildirir ve
hata durumunda exception fırlatır (ana döngü bunu JSON-RPC error'a çevirir). Belgeler
`pdefe_core.onbellek` üzerinden açılır; bir dosyaya YAZMADAN önce `onbellek.birak(yol)` çağrılır
(aksi halde Windows'ta os.replace açık tanıtıcı yüzünden başarısız olur).

Kayıt: kaydol(yontemler) → kucult_tahmin, kucult, sayfalar_uygula, ayir, birlestir, gorsel_bilgi,
boyut_tahmini, dondur_kaydet, pano_gorsel_kaydet, sayfa_boyutlari.
"""
import io
import os
import re
import sys
import time
import base64
import tempfile

import pymupdf

# ---------------------------------------------------------------- sabitler
A4_GENISLIK = 595.276     # pt (210 mm)
A4_YUKSEKLIK = 841.890    # pt (297 mm)
PDF_EN_BUYUK_KENAR = 14400.0   # PDF sayfa sınırı (200 inç)

# Küçültme seviyeleri: (dpi, JPEG kalitesi)
SEVIYELER = {
    "asiri": (96, 45),
    "onerilen": (150, 72),
    "dusuk": (220, 88),
}
# Görsel birleştirme kalite seviyeleri: (dpi, JPEG kalitesi); orijinal = dokunma
GORSEL_KALITE = {
    "yuksek": (300, 90),
    "orta": (200, 75),
    "dusuk": (120, 55),
}
# Tahminde örnekleme eşiği
TAHMIN_ORNEK_BAYT = 40 * 1024 * 1024
TAHMIN_ORNEK_SAYFA = 250
TAHMIN_ORNEK_ADET = 20

GORSEL_UZANTILAR = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tif", ".tiff", ".webp", ".heic", ".heif"}

# Not: use_objstms=1 nesne akışlarını korur (Word/referans okuyucu çıktıları buna dayanır; kapalıyken dosya %25 büyüyebilir).
# clean=True ölçümlerde boyutu %3 artırıp süreyi uzattığı için kullanılmıyor.
KAYIT_SECENEKLERI = dict(garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, use_objstms=1)
YAPISAL_KAYIT = dict(garbage=3, deflate=True, use_objstms=1)


# ---------------------------------------------------------------- yardımcılar
def _cekirdek():
    """pdefe_core modülünü döndürür (onbellek, png_base64). Betik doğrudan çalışırken modül
    `__main__` adıyla yüklüdür; PyInstaller ile paketlenmişken de öyle. İkinci bir kopya
    yüklemekten kaçınmak için önce __main__'e bakılır."""
    ana = sys.modules.get("__main__")
    if ana is not None and hasattr(ana, "onbellek"):
        return ana
    import pdefe_core  # çalışma zamanında; döngüsel içe aktarma yok
    return pdefe_core


def _onbellek():
    return _cekirdek().onbellek


def _ilerleme(p):
    f = p.get("_ilerleme")
    if callable(f):
        return f
    return lambda yuzde, mesaj="": None


def _mutlak(yol, ad="yol"):
    if not yol or not isinstance(yol, str):
        raise ValueError("%s verilmedi." % ad)
    return os.path.abspath(yol)


def _dosya_var(yol):
    if not os.path.isfile(yol):
        raise FileNotFoundError("Dosya bulunamadı: %s" % yol)
    return yol


def _ayni_dosya(a, b):
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def _pdf_ac(yol):
    """Belgeyi diskten TAZE açar (önbellekteki nesneyi değiştirmemek için)."""
    _dosya_var(yol)
    try:
        doc = pymupdf.open(yol)
    except Exception as e:
        raise ValueError("PDF açılamadı (%s): %s" % (os.path.basename(yol), e))
    if not doc.is_pdf:
        doc.close()
        raise ValueError("Dosya PDF değil: %s" % os.path.basename(yol))
    if doc.needs_pass:
        doc.close()
        raise PermissionError("Belge parolayla korunuyor; işlem yapılamıyor: %s" % os.path.basename(yol))
    return doc


def _kapat(doc):
    try:
        if doc is not None and not doc.is_closed:
            doc.close()
    except Exception:
        pass


def _kaydet(doc, hedef, **secenekler):
    """Belgeyi önce geçici dosyaya yazar, belgeyi KAPATIR, sonra os.replace ile hedefe taşır
    (hedef kaynağın kendisi olabilir; MuPDF dosya tanıtıcısını açık tuttuğundan kapatmadan
    üzerine yazılamaz; yarım dosya bırakmaz). Çağıran, bu işlevden sonra doc'u kullanmamalı."""
    hedef = _mutlak(hedef, "hedef")
    klasor = os.path.dirname(hedef)
    if klasor and not os.path.isdir(klasor):
        try:
            os.makedirs(klasor, exist_ok=True)
        except OSError as e:
            raise OSError("Hedef klasör oluşturulamadı: %s (%s)" % (klasor, e))
    gecici = "%s.%d.pdefe-tmp" % (hedef, os.getpid())
    try:
        doc.save(gecici, **secenekler)
        _kapat(doc)
        try:
            os.replace(gecici, hedef)
        except PermissionError as e:
            raise PermissionError("Dosya yazılamadı; başka bir programda açık olabilir: %s (%s)"
                                  % (os.path.basename(hedef), e))
    finally:
        if os.path.exists(gecici):
            try:
                os.remove(gecici)
            except OSError:
                pass
    return os.path.getsize(hedef)


def _benzersiz_yol(klasor, ad, uzanti=".pdf"):
    """Var olan dosyanın üzerine yazmaz; sonuna (2), (3)... ekler."""
    ad = _guvenli_ad(ad)
    aday = os.path.join(klasor, ad + uzanti)
    n = 2
    while os.path.exists(aday):
        aday = os.path.join(klasor, "%s (%d)%s" % (ad, n, uzanti))
        n += 1
    return aday


def _guvenli_ad(ad):
    ad = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", ad).strip().rstrip(".")
    return ad or "belge"


def _sayfa_no(deger, sayfa_sayisi, ad="sayfa"):
    try:
        n = int(deger)
    except (TypeError, ValueError):
        raise ValueError("Geçersiz %s numarası: %r" % (ad, deger))
    if n < 1 or n > sayfa_sayisi:
        raise ValueError("%s numarası sınır dışı: %d (belge %d sayfa)" % (ad.capitalize(), n, sayfa_sayisi))
    return n


def _dondurme(deger):
    try:
        d = int(deger or 0)
    except (TypeError, ValueError):
        raise ValueError("Geçersiz döndürme: %r" % (deger,))
    d %= 360
    if d % 90:
        raise ValueError("Döndürme 90'ın katı olmalı: %d" % d)
    return d


def _yerimi_esle(toc, esleme, taban=0):
    """get_toc(simple=False) listesini yeni sayfa numaralarına eşler.
    esleme: eski 1-tabanlı sayfa → yeni 1-tabanlı sayfa (yoksa eleman atılır).
    Atılan öğelerin çocukları bir üst seviyeye çekilir (set_toc seviye sıçraması kabul etmez)."""
    sonuc = []
    onceki_seviye = 0
    for oge in toc:
        seviye, baslik, sayfa = oge[0], oge[1], oge[2]
        ek = oge[3] if len(oge) > 3 and isinstance(oge[3], dict) else None
        yeni = esleme.get(sayfa) if sayfa and sayfa > 0 else None
        if yeni is None:
            continue
        yeni += taban
        seviye = max(1, min(int(seviye), onceki_seviye + 1))
        girdi = [seviye, baslik or "", yeni]
        if ek and ek.get("to") is not None:
            try:
                girdi.append({"kind": pymupdf.LINK_GOTO, "page": yeni - 1,
                              "to": pymupdf.Point(ek["to"]), "zoom": float(ek.get("zoom") or 0)})
            except Exception:
                pass
        sonuc.append(girdi)
        onceki_seviye = seviye
    return sonuc


def _yerimi_yaz(doc, toc):
    """set_toc'u önce konumlu, olmazsa sade girdilerle dener."""
    if not toc:
        return
    try:
        doc.set_toc(toc)
    except Exception:
        try:
            doc.set_toc([g[:3] for g in toc])
        except Exception:
            pass


def _meta_kopyala(kaynak, hedef):
    try:
        md = dict(kaynak.metadata or {})
        md.pop("format", None)
        md.pop("encryption", None)
        md["producer"] = "PDEfe"
        hedef.set_metadata(md)
    except Exception:
        pass


def _ardisik_gruplar(tarif_indeksleri):
    """[(kaynak, sayfa)] → aynı kaynaktan ardışık sayfa dilimleri: [(kaynak, bas, son, [idx...])]."""
    gruplar = []
    for idx, (kaynak, sayfa) in enumerate(tarif_indeksleri):
        if gruplar:
            k, bas, son, idxler = gruplar[-1]
            if kaynak is not None and k == kaynak and sayfa == son + 1:
                gruplar[-1] = (k, bas, sayfa, idxler + [idx])
                continue
        gruplar.append((kaynak, sayfa, sayfa, [idx]))
    return gruplar


# ---------------------------------------------------------------- görsel yeniden yazma
def _gorsel_secenekleri(dpi, kalite):
    """PdfImageRewriterOptions kurar: renkli/gri görseller JPEG'e (verilen dpi/kalite),
    bitonal (siyah-beyaz tarama) görseller CCITT'e ve en az 200 dpi'da kalır (metin okunurluğu)."""
    m = pymupdf.mupdf
    opts = m.PdfImageRewriterOptions()
    k = str(int(kalite))
    esik = int(dpi) + 1
    for on_ek in ("color_lossy", "color_lossless", "gray_lossy", "gray_lossless"):
        setattr(opts, on_ek + "_image_recompress_method", m.FZ_RECOMPRESS_JPEG)
        setattr(opts, on_ek + "_image_subsample_method", m.FZ_SUBSAMPLE_AVERAGE)
        setattr(opts, on_ek + "_image_subsample_to", int(dpi))
        setattr(opts, on_ek + "_image_subsample_threshold", esik)
        setattr(opts, on_ek + "_image_recompress_quality", k)
    bit_dpi = max(int(dpi), 200)
    opts.bitonal_image_recompress_method = m.FZ_RECOMPRESS_FAX
    opts.bitonal_image_subsample_method = m.FZ_SUBSAMPLE_AVERAGE
    opts.bitonal_image_subsample_to = bit_dpi
    opts.bitonal_image_subsample_threshold = bit_dpi + 1
    opts.bitonal_image_recompress_quality = k
    return opts


def _gorselleri_yeniden_yaz(doc, dpi, kalite):
    """Belgedeki görselleri yerinde yeniden örnekler/kodlar."""
    dpi = int(dpi)
    kalite = int(kalite)
    try:
        doc.rewrite_images(options=_gorsel_secenekleri(dpi, kalite))
    except Exception:
        # Yedek yol: kütüphanenin kendi kurulumu
        doc.rewrite_images(dpi_threshold=dpi + 1, dpi_target=dpi, quality=kalite)


def _fontlari_altkumele(doc):
    try:
        doc.subset_fonts()
    except Exception:
        pass   # bazı bozuk fontlarda başarısız olabilir; belge yine kaydedilir


def _kucult_uygula(doc, dpi, kalite, ilerleme=None, taban=0, aralik=100):
    """Bellekteki belgeye küçültme adımlarını uygular (kaydetmez)."""
    if ilerleme:
        ilerleme(taban + int(aralik * 0.05), "Görseller yeniden örnekleniyor…")
    _gorselleri_yeniden_yaz(doc, dpi, kalite)
    if ilerleme:
        ilerleme(taban + int(aralik * 0.6), "Fontlar alt kümeleniyor…")
    _fontlari_altkumele(doc)


def _seviye_cozumle(seviye, dpi=None, kalite=None):
    if seviye in SEVIYELER:
        return SEVIYELER[seviye]
    if seviye == "ozel":
        try:
            d, k = int(dpi), int(kalite)
        except (TypeError, ValueError):
            raise ValueError("Özel seviye için dpi ve kalite verilmeli.")
        if not (30 <= d <= 600):
            raise ValueError("dpi 30-600 arasında olmalı: %d" % d)
        if not (10 <= k <= 100):
            raise ValueError("Kalite 10-100 arasında olmalı: %d" % k)
        return d, k
    raise ValueError("Bilinmeyen seviye: %r" % (seviye,))


# ---------------------------------------------------------------- 1) kucult_tahmin
def y_kucult_tahmin(p):
    """{yol} → {mevcut, seviyeler:{asiri|onerilen|dusuk:{boyut, yuzde}}, tahmin, sure}
    Büyük belgelerde (>40 MB ya da >250 sayfa) ilk 20 sayfa örneklenir, oran ölçeklenir."""
    ilerleme = _ilerleme(p)
    yol = _mutlak(p.get("yol"))
    _dosya_var(yol)
    baslangic = time.time()
    mevcut = os.path.getsize(yol)
    doc = _pdf_ac(yol)
    try:
        ornekle = mevcut > TAHMIN_ORNEK_BAYT or doc.page_count > TAHMIN_ORNEK_SAYFA
        if ornekle:
            ornek = pymupdf.open()
            ornek.insert_pdf(doc, from_page=0, to_page=min(TAHMIN_ORNEK_ADET, doc.page_count) - 1)
            taban = max(len(ornek.tobytes(**KAYIT_SECENEKLERI)), 1)
            doc.close()
            doc = ornek
        else:
            taban = mevcut
        # Font alt kümeleme seviyeden bağımsız: bir kez yapılıp ara sonuç bayt olarak tutulur
        _fontlari_altkumele(doc)
        kaynak_bayt = doc.tobytes(**KAYIT_SECENEKLERI)
    finally:
        _kapat(doc)
    ilerleme(25, "Örnek hazırlandı")
    seviyeler = {}
    adlar = list(SEVIYELER)
    for i, ad in enumerate(adlar):
        dpi, kalite = SEVIYELER[ad]
        d = pymupdf.open("pdf", kaynak_bayt)
        try:
            _gorselleri_yeniden_yaz(d, dpi, kalite)
            sonuc = len(d.tobytes(**KAYIT_SECENEKLERI))
        finally:
            d.close()
        if ornekle:
            boyut = int(mevcut * sonuc / taban)
        else:
            boyut = sonuc
        seviyeler[ad] = {"boyut": boyut, "yuzde": round(100.0 * boyut / max(mevcut, 1), 1),
                         "dpi": dpi, "kalite": kalite}
        ilerleme(25 + int(75 * (i + 1) / len(adlar)), "%s seviyesi ölçüldü" % ad)
    return {"mevcut": mevcut, "seviyeler": seviyeler, "tahmin": bool(ornekle),
            "sure": round(time.time() - baslangic, 2)}


# ---------------------------------------------------------------- 2) kucult
def y_kucult(p):
    """{yol, hedef, seviye, dpi?, kalite?} → {boyut, oncekiBoyut, yuzde, uyari}"""
    ilerleme = _ilerleme(p)
    yol = _mutlak(p.get("yol"))
    hedef = _mutlak(p.get("hedef") or yol, "hedef")
    dpi, kalite = _seviye_cozumle(p.get("seviye", "onerilen"), p.get("dpi"), p.get("kalite"))
    _dosya_var(yol)
    onceki = os.path.getsize(yol)
    onb = _onbellek()
    onb.birak(yol)
    onb.birak(hedef)
    ilerleme(2, "Belge açılıyor…")
    doc = _pdf_ac(yol)
    try:
        _kucult_uygula(doc, dpi, kalite, ilerleme, taban=5, aralik=80)
        ilerleme(88, "Kaydediliyor…")
        boyut = _kaydet(doc, hedef, **KAYIT_SECENEKLERI)
    finally:
        _kapat(doc)
    ilerleme(100, "Tamamlandı")
    return {"boyut": boyut, "oncekiBoyut": onceki, "yuzde": round(100.0 * boyut / max(onceki, 1), 1),
            "uyari": boyut >= onceki, "dpi": dpi, "kalite": kalite}


# ---------------------------------------------------------------- 3) sayfalar_uygula
def y_sayfalar_uygula(p):
    """{yol, hedef, tarif:[{kaynak, sayfa, dondurme, genislik?, yukseklik?}]} → {boyut, sayfa}
    kaynak null → boş sayfa; dondurme kaynak sayfanın /Rotate'ine EK; yer imleri korunan sayfalara
    yeniden eşlenir; meta veri kopyalanır. hedef == yol olabilir."""
    ilerleme = _ilerleme(p)
    yol = _mutlak(p.get("yol"))
    hedef = _mutlak(p.get("hedef") or yol, "hedef")
    tarif = p.get("tarif")
    if not isinstance(tarif, list) or not tarif:
        raise ValueError("Sayfa tarifi boş; en az bir sayfa gerekli.")
    onb = _onbellek()
    kaynaklar = {}     # normalize yol → doc
    sayfa_sayilari = {}

    def kaynak_al(k):
        anahtar = os.path.normcase(os.path.abspath(k))
        if anahtar not in kaynaklar:
            kaynaklar[anahtar] = onb.al(_dosya_var(os.path.abspath(k)))
            if kaynaklar[anahtar].needs_pass:
                raise PermissionError("Belge parolayla korunuyor: %s" % os.path.basename(k))
            sayfa_sayilari[anahtar] = kaynaklar[anahtar].page_count
        return anahtar, kaynaklar[anahtar]

    # Tarifi doğrula ve normalize et
    ogeler = []
    for i, t in enumerate(tarif):
        if not isinstance(t, dict):
            raise ValueError("Tarif öğesi %d geçersiz." % (i + 1))
        kaynak = t.get("kaynak")
        dondurme = _dondurme(t.get("dondurme"))
        if kaynak:
            anahtar, d = kaynak_al(kaynak)
            sayfa = _sayfa_no(t.get("sayfa"), d.page_count)
            ogeler.append({"kaynak": anahtar, "sayfa": sayfa, "dondurme": dondurme})
        else:
            ogeler.append({"kaynak": None, "sayfa": None, "dondurme": dondurme,
                           "genislik": t.get("genislik"), "yukseklik": t.get("yukseklik")})

    ana_anahtar = os.path.normcase(yol)
    if ana_anahtar not in kaynaklar and os.path.isfile(yol):
        kaynak_al(yol)
    ana = kaynaklar.get(ana_anahtar)
    ana_toc = ana.get_toc(simple=False) if ana else []

    yeni = pymupdf.open()
    esleme = {}     # ana belgenin eski sayfa no → yeni sayfa no (ilk eşleşen)
    try:
        gruplar = _ardisik_gruplar([(o["kaynak"], o["sayfa"]) for o in ogeler])
        toplam = len(gruplar)
        for gi, (kaynak, bas, son, idxler) in enumerate(gruplar):
            ilk_yeni = yeni.page_count
            if kaynak is None:
                o = ogeler[idxler[0]]
                g, y = o.get("genislik"), o.get("yukseklik")
                if not (g and y):
                    if yeni.page_count:
                        r = yeni[-1].rect
                        g, y = r.width, r.height
                    else:
                        g, y = A4_GENISLIK, A4_YUKSEKLIK
                g = max(1.0, min(float(g), PDF_EN_BUYUK_KENAR))
                y = max(1.0, min(float(y), PDF_EN_BUYUK_KENAR))
                pg = yeni.new_page(width=g, height=y)
                if o["dondurme"]:
                    pg.set_rotation(o["dondurme"])
            else:
                d = kaynaklar[kaynak]
                yeni.insert_pdf(d, from_page=bas - 1, to_page=son - 1)
                for k, idx in enumerate(idxler):
                    pg = yeni[ilk_yeni + k]
                    ek = ogeler[idx]["dondurme"]
                    if ek:
                        pg.set_rotation((pg.rotation + ek) % 360)
                    if kaynak == ana_anahtar:
                        esleme.setdefault(ogeler[idx]["sayfa"], ilk_yeni + k + 1)
            ilerleme(5 + int(75 * (gi + 1) / toplam), "Sayfa %d/%d" % (yeni.page_count, len(ogeler)))
        if ana is not None:
            _meta_kopyala(ana, yeni)
            _yerimi_yaz(yeni, _yerimi_esle(ana_toc, esleme))
        ilerleme(85, "Kaydediliyor…")
        # Hedef, kaynaklardan biri olabilir: yazmadan önce bırak
        onb.birak(hedef)
        for anahtar in kaynaklar:
            if _ayni_dosya(anahtar, hedef):
                onb.birak(anahtar)
        sayfa = yeni.page_count
        boyut = _kaydet(yeni, hedef, **YAPISAL_KAYIT)
    finally:
        _kapat(yeni)
    ilerleme(100, "Tamamlandı")
    return {"boyut": boyut, "sayfa": sayfa}


# ---------------------------------------------------------------- 4) ayir
def araliklari_ayristir(metin, sayfa_sayisi):
    """'1-3, 5, 8-10' → [(1,3), (5,5), (8,10)]. Boşluklara dayanıklı; ters aralık (7-4) düzeltilir;
    '-3' = 1-3, '5-' = 5-son; sınır dışı ya da anlaşılmayan parça → ValueError."""
    if metin is None or not str(metin).strip():
        raise ValueError("Sayfa aralığı boş.")
    sonuc = []
    for parca in re.split(r"[,;]", str(metin)):
        parca = parca.strip().replace(" ", "")
        if not parca:
            continue
        m = re.fullmatch(r"(\d*)\s*[-–—]\s*(\d*)", parca)
        if m:
            a, b = m.group(1), m.group(2)
            if not a and not b:
                raise ValueError("Anlaşılmayan aralık: '%s'" % parca)
            bas = int(a) if a else 1
            son = int(b) if b else sayfa_sayisi
        elif re.fullmatch(r"\d+", parca):
            bas = son = int(parca)
        else:
            raise ValueError("Anlaşılmayan sayfa ifadesi: '%s' (örnek: 1-3, 5, 8-10)" % parca)
        if bas > son:
            bas, son = son, bas
        if bas < 1 or son > sayfa_sayisi:
            raise ValueError("Sayfa aralığı sınır dışı: %d-%d (belge %d sayfa)" % (bas, son, sayfa_sayisi))
        sonuc.append((bas, son))
    if not sonuc:
        raise ValueError("Sayfa aralığı boş.")
    return sonuc


def _sayfa_listesini_gruplara(sayfalar):
    """[1,2,3,5] → [(1,3),(5,5)] (sıralı, tekrarsız)."""
    gruplar = []
    for s in sorted(set(sayfalar)):
        if gruplar and s == gruplar[-1][1] + 1:
            gruplar[-1] = (gruplar[-1][0], s)
        else:
            gruplar.append((s, s))
    return gruplar


def _aralik_etiketi(gruplar):
    parcalar = ["%d-%d" % g if g[0] != g[1] else "%d" % g[0] for g in gruplar]
    if len(parcalar) > 4:
        return "secili_%dsayfa" % sum(g[1] - g[0] + 1 for g in gruplar)
    return "_".join(parcalar)


def _parca_yaz(kaynak, gruplar, hedef_yol, toc):
    """Kaynaktan verilen aralıkları yeni belgeye kopyalar ve kaydeder."""
    yeni = pymupdf.open()
    try:
        esleme = {}
        for bas, son in gruplar:
            ilk = yeni.page_count
            yeni.insert_pdf(kaynak, from_page=bas - 1, to_page=son - 1)
            for k, s in enumerate(range(bas, son + 1)):
                esleme[s] = ilk + k + 1
        _meta_kopyala(kaynak, yeni)
        _yerimi_yaz(yeni, _yerimi_esle(toc, esleme))
        _kaydet(yeni, hedef_yol, **YAPISAL_KAYIT)
    finally:
        _kapat(yeni)
    return hedef_yol


def y_ayir(p):
    """{yol, hedefKlasor, mod:'aralik'|'herN'|'secili'|'tek', araliklar, n, sayfalar} → {dosyalar}"""
    ilerleme = _ilerleme(p)
    yol = _mutlak(p.get("yol"))
    _dosya_var(yol)
    klasor = _mutlak(p.get("hedefKlasor") or os.path.dirname(yol), "hedefKlasor")
    if not os.path.isdir(klasor):
        os.makedirs(klasor, exist_ok=True)
    mod = p.get("mod") or "aralik"
    doc = _onbellek().al(yol)
    if doc.needs_pass:
        raise PermissionError("Belge parolayla korunuyor.")
    n_sayfa = doc.page_count
    ad = os.path.splitext(os.path.basename(yol))[0]
    toc = doc.get_toc(simple=False)

    # Yazılacak parçalar: [(etiket, [(bas,son)...])]
    parcalar = []
    if mod == "aralik":
        for bas, son in araliklari_ayristir(p.get("araliklar"), n_sayfa):
            etiket = "sayfa_%d" % bas if bas == son else "%d-%d" % (bas, son)
            parcalar.append((etiket, [(bas, son)]))
    elif mod == "herN":
        try:
            n = int(p.get("n") or 0)
        except (TypeError, ValueError):
            raise ValueError("Geçersiz bölüm uzunluğu.")
        if n < 1:
            raise ValueError("Bölüm uzunluğu en az 1 olmalı.")
        if n >= n_sayfa:
            raise ValueError("Bölüm uzunluğu (%d) belge sayfa sayısından (%d) küçük olmalı." % (n, n_sayfa))
        for i, bas in enumerate(range(1, n_sayfa + 1, n)):
            parcalar.append(("bolum_%d" % (i + 1), [(bas, min(bas + n - 1, n_sayfa))]))
    elif mod == "secili":
        sayfalar = p.get("sayfalar")
        if not isinstance(sayfalar, list) or not sayfalar:
            raise ValueError("Seçili sayfa yok.")
        sayfalar = [_sayfa_no(s, n_sayfa) for s in sayfalar]
        gruplar = _sayfa_listesini_gruplara(sayfalar)
        etiket = "sayfa_%d" % gruplar[0][0] if len(gruplar) == 1 and gruplar[0][0] == gruplar[0][1] \
            else _aralik_etiketi(gruplar)
        parcalar.append((etiket, gruplar))
    elif mod == "tek":
        sayfalar = p.get("sayfalar")
        if isinstance(sayfalar, list) and sayfalar:
            sayfalar = sorted(set(_sayfa_no(s, n_sayfa) for s in sayfalar))
        else:
            sayfalar = list(range(1, n_sayfa + 1))
        for s in sayfalar:
            parcalar.append(("sayfa_%d" % s, [(s, s)]))
    else:
        raise ValueError("Bilinmeyen ayırma modu: %r" % (mod,))

    dosyalar = []
    toplam = len(parcalar)
    for i, (etiket, gruplar) in enumerate(parcalar):
        hedef = _benzersiz_yol(klasor, "%s_%s" % (ad, etiket))
        _parca_yaz(doc, gruplar, hedef, toc)
        dosyalar.append(hedef)
        ilerleme(int(100 * (i + 1) / toplam), "%d/%d dosya yazıldı" % (i + 1, toplam))
    return {"dosyalar": dosyalar}


# ---------------------------------------------------------------- görsel yardımcıları (Pillow)
def _pillow():
    try:
        from PIL import Image, ImageOps, ImageSequence
    except ImportError:
        raise RuntimeError("Görsel işlemek için Pillow kütüphanesi gerekli.")
    Image.MAX_IMAGE_PIXELS = 400_000_000
    return Image, ImageOps, ImageSequence


def _heic_hazirla(yol):
    if os.path.splitext(yol)[1].lower() in (".heic", ".heif"):
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
        except ImportError:
            raise ValueError("HEIC/HEIF görselleri için 'pillow_heif' kütüphanesi kurulu değil; "
                             "görseli önce JPEG ya da PNG'ye çevirin: %s" % os.path.basename(yol))


def _gorsel_ac(yol):
    """Pillow görselini açar; hata mesajı Türkçe."""
    Image, _, _ = _pillow()
    _dosya_var(yol)
    _heic_hazirla(yol)
    try:
        im = Image.open(yol)
        im.load()
        return im
    except Exception as e:
        raise ValueError("Görsel açılamadı (%s): %s" % (os.path.basename(yol), e))


def _kareler(im):
    """Çok sayfalı TIFF'te bütün kareler; GIF ve diğerlerinde yalnızca ilk kare."""
    _, _, ImageSequence = _pillow()
    if (im.format or "").upper() == "TIFF" and getattr(im, "n_frames", 1) > 1:
        return [k.copy() for k in ImageSequence.Iterator(im)]
    return [im]


def _duzlestir(im):
    """EXIF yönünü uygular, saydamlığı beyaz zemine bindirir, kipi RGB/L/1'e indirger."""
    Image, ImageOps, _ = _pillow()
    try:
        im = ImageOps.exif_transpose(im) or im
    except Exception:
        pass
    kip = im.mode
    if kip == "P":
        im = im.convert("RGBA" if "transparency" in im.info else "RGB")
        kip = im.mode
    if kip in ("RGBA", "LA") or (kip == "RGB" and "transparency" in im.info):
        if kip == "RGB":
            im = im.convert("RGBA")
        zemin = Image.new("RGBA", im.size, (255, 255, 255, 255))
        zemin.alpha_composite(im.convert("RGBA"))
        im = zemin.convert("RGB")
    elif kip in ("CMYK", "YCbCr", "HSV", "LAB"):
        im = im.convert("RGB")
    elif kip in ("I;16", "I;16B", "I;16L", "I", "F"):
        im = im.convert("I").point(lambda v: v / 256 if v > 255 else v).convert("L")
    elif kip not in ("RGB", "L", "1"):
        im = im.convert("RGB")
    return im


def _gorsel_kodla(im, kalite_adi, hedef_px=None, orijinal_bayt=None):
    """Görseli PDF'e gömülecek bayta çevirir. Döner: (bayt, uzanti, genislik, yukseklik).
    kalite 'orijinal': JPEG dosyası dokunulmadan (EXIF yönü gerekmiyorsa), diğerleri PNG (kayıpsız).
    Diğer kaliteler: hedef_px'e (g, y) sığacak biçimde küçült ve JPEG'e kodla (1-bit → PNG)."""
    Image, _, _ = _pillow()
    if kalite_adi == "orijinal":
        if orijinal_bayt is not None:
            return orijinal_bayt, "jpeg", im.width, im.height
        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=False, compress_level=6)
        return buf.getvalue(), "png", im.width, im.height
    if kalite_adi not in GORSEL_KALITE:
        raise ValueError("Bilinmeyen görsel kalitesi: %r" % (kalite_adi,))
    _, jpeg_kalite = GORSEL_KALITE[kalite_adi]
    if hedef_px and (im.width > hedef_px[0] * 1.05 or im.height > hedef_px[1] * 1.05):
        oran = min(hedef_px[0] / im.width, hedef_px[1] / im.height)
        yeni = (max(1, int(round(im.width * oran))), max(1, int(round(im.height * oran))))
        if im.mode == "1":
            im = im.convert("L").resize(yeni, Image.LANCZOS).point(lambda v: 255 if v > 127 else 0).convert("1")
        else:
            im = im.resize(yeni, Image.LANCZOS)
    buf = io.BytesIO()
    if im.mode == "1":
        im.save(buf, format="PNG", optimize=True)
        return buf.getvalue(), "png", im.width, im.height
    im.save(buf, format="JPEG", quality=jpeg_kalite, optimize=True, progressive=False, subsampling="4:2:0" if jpeg_kalite < 85 else "4:4:4")
    return buf.getvalue(), "jpeg", im.width, im.height


def _gorsel_sayfa_olcusu(gen_px, yuk_px, sayfa_boyutu, kenar, dondurme, dpi_bilgisi=None):
    """Görselin yerleşeceği sayfa (pt) ve görsel dikdörtgeni (pt). dondurme 90/270 ise görselin
    görünen en/boyu yer değiştirir. Döner: (sayfa_g, sayfa_y, Rect)."""
    kenar = max(0.0, float(kenar or 0))
    gorunen_g, gorunen_y = (yuk_px, gen_px) if dondurme in (90, 270) else (gen_px, yuk_px)
    if sayfa_boyutu == "orijinal":
        # Piksel → pt: 72 dpi varsay; çok büyükse 300 dpi
        dpi = 72.0
        if max(gorunen_g, gorunen_y) > 2500:
            dpi = 300.0
        g_pt, y_pt = gorunen_g * 72.0 / dpi, gorunen_y * 72.0 / dpi
        ust_sinir = PDF_EN_BUYUK_KENAR - 2 * kenar
        if max(g_pt, y_pt) > ust_sinir:
            oran = ust_sinir / max(g_pt, y_pt)
            g_pt, y_pt = g_pt * oran, y_pt * oran
        sayfa_g, sayfa_y = g_pt + 2 * kenar, y_pt + 2 * kenar
        rect = pymupdf.Rect(kenar, kenar, kenar + g_pt, kenar + y_pt)
        return sayfa_g, sayfa_y, rect
    # A4: görsel yatay ise sayfa da yatay
    if gorunen_g > gorunen_y:
        sayfa_g, sayfa_y = A4_YUKSEKLIK, A4_GENISLIK
    else:
        sayfa_g, sayfa_y = A4_GENISLIK, A4_YUKSEKLIK
    kenar = min(kenar, min(sayfa_g, sayfa_y) / 2 - 10)
    ic_g, ic_y = sayfa_g - 2 * kenar, sayfa_y - 2 * kenar
    oran = min(ic_g / gorunen_g, ic_y / gorunen_y)
    g_pt, y_pt = gorunen_g * oran, gorunen_y * oran
    x0 = (sayfa_g - g_pt) / 2
    y0 = (sayfa_y - y_pt) / 2
    return sayfa_g, sayfa_y, pymupdf.Rect(x0, y0, x0 + g_pt, y0 + y_pt)


def _gorsel_hazirla(oge, genel_kalite=None):
    """Bir görsel öğesini PDF'e gömülecek karelere çevirir.
    Döner: [(bayt, sayfa_g, sayfa_y, rect, dondurme)]"""
    yol = _mutlak(oge.get("yol"))
    kalite = oge.get("kalite") or genel_kalite or "orijinal"
    if kalite not in GORSEL_KALITE and kalite != "orijinal":
        raise ValueError("Bilinmeyen kalite: %r" % (kalite,))
    sayfa_boyutu = oge.get("sayfaBoyutu") or "a4"
    if sayfa_boyutu not in ("a4", "orijinal"):
        raise ValueError("Bilinmeyen sayfa boyutu: %r" % (sayfa_boyutu,))
    kenar = float(oge.get("kenar") or 0)
    dondurme = _dondurme(oge.get("dondurme"))
    im = _gorsel_ac(yol)
    bicim = (im.format or "").upper()
    exif_yon = 1
    try:
        exif_yon = int(im.getexif().get(0x0112, 1) or 1)
    except Exception:
        pass
    sonuc = []
    for kare in _kareler(im):
        duz = _duzlestir(kare)
        orijinal_bayt = None
        if kalite == "orijinal" and bicim == "JPEG" and exif_yon == 1 and len(sonuc) == 0 and duz.mode == kare.mode:
            with open(yol, "rb") as f:
                orijinal_bayt = f.read()
        sayfa_g, sayfa_y, rect = _gorsel_sayfa_olcusu(duz.width, duz.height, sayfa_boyutu, kenar, dondurme)
        hedef_px = None
        if kalite != "orijinal":
            dpi, _ = GORSEL_KALITE[kalite]
            # Görselin sayfadaki fiziksel boyutu (döndürme öncesi eksenlere göre)
            yer_g, yer_y = (rect.height, rect.width) if dondurme in (90, 270) else (rect.width, rect.height)
            hedef_px = (int(yer_g / 72.0 * dpi), int(yer_y / 72.0 * dpi))
        bayt, _, _, _ = _gorsel_kodla(duz, kalite, hedef_px, orijinal_bayt)
        sonuc.append((bayt, sayfa_g, sayfa_y, rect, dondurme))
    return sonuc


def _oge_turu(oge):
    tur = oge.get("tur")
    if tur in ("pdf", "gorsel"):
        return tur
    uz = os.path.splitext(oge.get("yol") or "")[1].lower()
    if uz == ".pdf":
        return "pdf"
    if uz in GORSEL_UZANTILAR:
        return "gorsel"
    raise ValueError("Öğenin türü belirlenemedi: %s" % os.path.basename(oge.get("yol") or "?"))


def _pdf_ogesi_hazirla(oge, genel_kalite=None):
    """PDF öğesini (isteğe bağlı görsel yeniden kodlama ve döndürmeyle) bellekte hazırlar.
    Döner: (doc, toc). doc, çağıranca kapatılmalı."""
    yol = _mutlak(oge.get("yol"))
    kalite = oge.get("kalite") or genel_kalite or "orijinal"
    dondurme = _dondurme(oge.get("dondurme"))
    kaynak = _pdf_ac(yol)
    try:
        toc = kaynak.get_toc(simple=False)
        if kalite == "orijinal" and not dondurme:
            return kaynak, toc
        if kalite != "orijinal":
            if kalite not in GORSEL_KALITE:
                raise ValueError("Bilinmeyen kalite: %r" % (kalite,))
            dpi, q = GORSEL_KALITE[kalite]
            _gorselleri_yeniden_yaz(kaynak, dpi, q)
        if dondurme:
            for pg in kaynak:
                pg.set_rotation((pg.rotation + dondurme) % 360)
        return kaynak, toc
    except Exception:
        kaynak.close()
        raise


# ---------------------------------------------------------------- 5) birlestir
def y_birlestir(p):
    """{ogeler:[{yol, tur, kalite, sayfaBoyutu, kenar, dondurme}], hedef, genelKalite?} → {boyut, sayfa}"""
    ilerleme = _ilerleme(p)
    ogeler = p.get("ogeler")
    if not isinstance(ogeler, list) or not ogeler:
        raise ValueError("Birleştirilecek öğe yok.")
    hedef = _mutlak(p.get("hedef"), "hedef")
    genel = p.get("genelKalite") or None
    onb = _onbellek()
    yeni = pymupdf.open()
    toc_toplam = []
    ilk_pdf = None
    try:
        toplam = len(ogeler)
        for i, oge in enumerate(ogeler):
            if not isinstance(oge, dict):
                raise ValueError("Öğe %d geçersiz." % (i + 1))
            ad = os.path.basename(oge.get("yol") or "?")
            ilerleme(int(90 * i / toplam), "%s ekleniyor (%d/%d)" % (ad, i + 1, toplam))
            tur = _oge_turu(oge)
            if tur == "pdf":
                kaynak, toc = _pdf_ogesi_hazirla(oge, genel)
                try:
                    taban = yeni.page_count
                    yeni.insert_pdf(kaynak)
                    esleme = {s: s for s in range(1, kaynak.page_count + 1)}
                    toc_toplam.extend(_yerimi_esle(toc, esleme, taban=taban))
                    if ilk_pdf is None:
                        ilk_pdf = dict(kaynak.metadata or {})
                finally:
                    kaynak.close()
            else:
                for bayt, sg, sy, rect, dondurme in _gorsel_hazirla(oge, genel):
                    pg = yeni.new_page(width=sg, height=sy)
                    pg.insert_image(rect, stream=bayt, rotate=dondurme, keep_proportion=True)
        if yeni.page_count == 0:
            raise ValueError("Sonuç belgede sayfa yok.")
        md = ilk_pdf or {}
        md.pop("format", None)
        md.pop("encryption", None)
        md["producer"] = "PDEfe"
        try:
            yeni.set_metadata(md)
        except Exception:
            pass
        _yerimi_yaz(yeni, toc_toplam)
        ilerleme(92, "Kaydediliyor…")
        onb.birak(hedef)
        sayfa = yeni.page_count
        boyut = _kaydet(yeni, hedef, **KAYIT_SECENEKLERI)
    finally:
        _kapat(yeni)
    ilerleme(100, "Tamamlandı")
    return {"boyut": boyut, "sayfa": sayfa}


# ---------------------------------------------------------------- 6) gorsel_bilgi
def y_gorsel_bilgi(p):
    """{yol} → {tur, genislik, yukseklik, boyut, sayfa?, png (220 px küçük resim, base64)}"""
    yol = _mutlak(p.get("yol"))
    _dosya_var(yol)
    boyut = os.path.getsize(yol)
    tur = _oge_turu({"yol": yol, "tur": p.get("tur")})
    if tur == "pdf":
        doc = _onbellek().al(yol)
        if doc.needs_pass:
            raise PermissionError("Belge parolayla korunuyor: %s" % os.path.basename(yol))
        pg = doc[0]
        r = pg.rect
        olcek = 220.0 / max(r.width, 1)
        pix = pg.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), annots=True, alpha=False)
        return {"tur": "pdf", "genislik": r.width, "yukseklik": r.height, "boyut": boyut,
                "sayfa": doc.page_count, "png": base64.b64encode(pix.tobytes("png")).decode("ascii"),
                "pngGenislik": pix.width, "pngYukseklik": pix.height}
    Image, _, _ = _pillow()
    im = _gorsel_ac(yol)
    sayfa = getattr(im, "n_frames", 1) if (im.format or "").upper() == "TIFF" else 1
    duz = _duzlestir(im)
    genislik, yukseklik = duz.width, duz.height
    kucuk = duz.convert("RGB") if duz.mode != "RGB" else duz.copy()
    oran = 220.0 / max(kucuk.width, 1)
    if oran < 1:
        kucuk = kucuk.resize((220, max(1, int(round(kucuk.height * oran)))), Image.LANCZOS)
    buf = io.BytesIO()
    kucuk.save(buf, format="PNG", optimize=True)
    return {"tur": "gorsel", "genislik": genislik, "yukseklik": yukseklik, "boyut": boyut, "sayfa": sayfa,
            "bicim": (im.format or "").lower(), "png": base64.b64encode(buf.getvalue()).decode("ascii"),
            "pngGenislik": kucuk.width, "pngYukseklik": kucuk.height}


# ---------------------------------------------------------------- 7) boyut_tahmini
def y_boyut_tahmini(p):
    """{oge, genelKalite?} → {boyut}: öğenin verilen kaliteyle çıktı boyutunun hızlı tahmini."""
    oge = p.get("oge")
    if not isinstance(oge, dict):
        raise ValueError("Öğe verilmedi.")
    genel = p.get("genelKalite") or None
    tur = _oge_turu(oge)
    kalite = oge.get("kalite") or genel or "orijinal"
    yol = _mutlak(oge.get("yol"))
    _dosya_var(yol)
    if tur == "pdf":
        if kalite == "orijinal":
            return {"boyut": os.path.getsize(yol), "tahmin": False}
        kaynak, _ = _pdf_ogesi_hazirla(dict(oge, dondurme=0), genel)
        try:
            return {"boyut": len(kaynak.tobytes(**KAYIT_SECENEKLERI)), "tahmin": True}
        finally:
            kaynak.close()
    toplam = 0
    for bayt, *_ in _gorsel_hazirla(oge, genel):
        toplam += len(bayt) + 600      # sayfa nesnesi + görsel sözlüğü yaklaşık payı
    return {"boyut": toplam, "tahmin": True}


# ---------------------------------------------------------------- 8) dondur_kaydet
def y_dondur_kaydet(p):
    """{yol, hedef, sayfalar:[1-tabanlı]|null, derece} → {boyut}. hedef == yol ise artımlı
    kaydetmeyi dener (büyük dosyada hızlı), olmazsa tam yazım."""
    ilerleme = _ilerleme(p)
    yol = _mutlak(p.get("yol"))
    hedef = _mutlak(p.get("hedef") or yol, "hedef")
    derece = _dondurme(p.get("derece"))
    if derece == 0:
        raise ValueError("Döndürme derecesi 0; yapılacak bir şey yok.")
    _dosya_var(yol)
    onb = _onbellek()
    onb.birak(yol)
    onb.birak(hedef)
    doc = _pdf_ac(yol)
    try:
        sayfalar = p.get("sayfalar")
        if isinstance(sayfalar, list) and sayfalar:
            indeksler = sorted(set(_sayfa_no(s, doc.page_count) - 1 for s in sayfalar))
        else:
            indeksler = list(range(doc.page_count))
        for k, i in enumerate(indeksler):
            pg = doc[i]
            pg.set_rotation((pg.rotation + derece) % 360)
            if k % 50 == 0:
                ilerleme(int(80 * (k + 1) / len(indeksler)), "Sayfa %d döndürüldü" % (i + 1))
        ilerleme(85, "Kaydediliyor…")
        artimli = _ayni_dosya(yol, hedef) and not doc.is_encrypted
        if artimli:
            try:
                doc.save(yol, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
                boyut = os.path.getsize(yol)
            except (ValueError, RuntimeError):
                artimli = False
        if not artimli:
            boyut = _kaydet(doc, hedef, **YAPISAL_KAYIT)
    finally:
        _kapat(doc)
    ilerleme(100, "Tamamlandı")
    return {"boyut": boyut, "artimli": artimli}


# ---------------------------------------------------------------- 9) pano_gorsel_kaydet
def y_pano_gorsel_kaydet(p):
    """{png: base64} → {yol}: panodaki görseli geçici klasöre (Temp/PDEfe) benzersiz PNG olarak yazar."""
    veri = p.get("png")
    if not veri or not isinstance(veri, str):
        raise ValueError("Pano görseli boş.")
    if veri.startswith("data:"):
        veri = veri.split(",", 1)[1] if "," in veri else ""
    try:
        bayt = base64.b64decode(veri, validate=False)
    except Exception as e:
        raise ValueError("Pano görseli çözülemedi: %s" % e)
    if not bayt.startswith(b"\x89PNG\r\n\x1a\n"):
        # PNG değilse Pillow ile PNG'ye çevir
        Image, _, _ = _pillow()
        try:
            im = Image.open(io.BytesIO(bayt))
            im.load()
            buf = io.BytesIO()
            _duzlestir(im).save(buf, format="PNG")
            bayt = buf.getvalue()
        except Exception as e:
            raise ValueError("Pano görseli tanınmadı: %s" % e)
    klasor = os.path.join(tempfile.gettempdir(), "PDEfe")
    os.makedirs(klasor, exist_ok=True)
    fd, yol = tempfile.mkstemp(prefix="pano_%s_" % time.strftime("%Y%m%d_%H%M%S"), suffix=".png", dir=klasor)
    with os.fdopen(fd, "wb") as f:
        f.write(bayt)
    return {"yol": yol, "boyut": len(bayt)}


# ---------------------------------------------------------------- 10) sayfa_boyutlari
def y_sayfa_boyutlari(p):
    """{yol} → {sayfalar:[{genislik, yukseklik, dondurme}]} (genişlik/yükseklik görünen, yani
    döndürme uygulanmış ölçü; pt)."""
    yol = _mutlak(p.get("yol"))
    doc = _onbellek().al(_dosya_var(yol))
    sayfalar = []
    for pg in doc:
        r = pg.rect
        sayfalar.append({"genislik": round(r.width, 2), "yukseklik": round(r.height, 2), "dondurme": pg.rotation})
    return {"sayfalar": sayfalar, "sayfa": doc.page_count}


# ---------------------------------------------------------------- kayıt
def kaydol(yontemler):
    yontemler["kucult_tahmin"] = y_kucult_tahmin
    yontemler["kucult"] = y_kucult
    yontemler["sayfalar_uygula"] = y_sayfalar_uygula
    yontemler["ayir"] = y_ayir
    yontemler["birlestir"] = y_birlestir
    yontemler["gorsel_bilgi"] = y_gorsel_bilgi
    yontemler["boyut_tahmini"] = y_boyut_tahmini
    yontemler["dondur_kaydet"] = y_dondur_kaydet
    yontemler["pano_gorsel_kaydet"] = y_pano_gorsel_kaydet
    yontemler["sayfa_boyutlari"] = y_sayfa_boyutlari
