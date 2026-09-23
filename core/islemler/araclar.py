# -*- coding: utf-8 -*-
"""PDF araçları: küçültme, sayfa düzenleme, ayırma, birleştirme (PDF + görsel), döndürme.

Her yöntem `params` sözlüğü alır; `params["_ilerleme"](yuzde, mesaj)` ile ilerleme bildirir ve
hata durumunda exception fırlatır (ana döngü bunu JSON-RPC error'a çevirir). Belgeler
`pdefe_core.onbellek` üzerinden açılır; bir dosyaya YAZMADAN önce `onbellek.birak(yol)` çağrılır
(aksi halde Windows'ta os.replace açık tanıtıcı yüzünden başarısız olur).

Kayıt: kaydol(yontemler) → kucult_tahmin, kucult, sayfalar_uygula, ayir, birlestir, gorsel_bilgi,
boyut_tahmini, dondur_kaydet, sayfa_boyutlari, dosya_erisim.

Üzerine yazma: yedek alınmaz; sonuç hedefin klasöründe geçici dosyaya yazılır ve os.replace ile atomik olarak yerine konur.
Hedef başka bir programda kilitliyse özgün dosya değişmez ve hata iletisi KILITLI_METNI'ni, salt okunursa SALT_OKUNUR_METNI'ni içerir.
"""
import hashlib
import io
import os
import re
import shutil
import stat
import sys
import time
import base64

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
# Birleştirme tahmini: aynı içerik (aynı dosya birden çok kez ya da kopyası) çıktıda bir kez saklanır (garbage=4 eş
# nesneleri birleştirir); her yinelenen sayfa yalnızca kendi sayfa nesnesi kadar yer tutar (ölçüm: 10-30 bayt).
TEKRAR_SAYFA_BAYT = 20
# Görsel sayfası başına sayfa nesnesi, içerik akışı ve görsel sözlüğü payı
GORSEL_SAYFA_PAYI = 600

GORSEL_UZANTILAR = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tif", ".tiff", ".webp", ".heic", ".heif"}

# Not: use_objstms=1 nesne akışlarını korur (Word ve PDF yazıcılarının çıktıları buna dayanır; kapalıyken dosya %25 büyüyebilir).
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


def _onbellekten_birak(yol):
    """Aynı dosyaya işaret eden BÜTÜN önbellek girdilerini kapatır. Önbellek anahtarı, renderer'ın
    gönderdiği ham yoldur; aynı dosya 'c:\\PROJELER\\a.pdf' ve 'C:\\projeler\\a.pdf' gibi farklı
    yazımlarla anahtarlanmış olabilir. Windows'ta açık tanıtıcı varken os.replace başarısız olduğundan
    yazmadan önce hepsi bırakılmalı."""
    onb = _onbellek()
    hedef = os.path.normcase(os.path.abspath(yol))
    for anahtar in list(onb.belgeler):
        ayni = os.path.normcase(os.path.abspath(anahtar)) == hedef
        if not ayni:
            try:
                ayni = os.path.samefile(anahtar, yol)
            except OSError:
                ayni = False
        if ayni:
            onb.birak(anahtar)


def _ilerleme(p):
    """İlerleme bildirimi; ayrıca params["_iptal"] (çağrılabilir, True dönerse iptal) verilmişse her
    ilerleme adımında denetlenir ve InterruptedError fırlatılır. Çekirdek döngüsü şimdilik tek
    iş parçacıklı olduğundan _iptal'i ancak döngü okuyucu iş parçacığı kazanınca sağlayabilir;
    yoksa yalnızca ilerleme bildirilir."""
    f = p.get("_ilerleme")
    iptal = p.get("_iptal")
    if not callable(f):
        f = lambda yuzde, mesaj="": None   # noqa: E731
    if not callable(iptal):
        return f

    def bildir(yuzde, mesaj=""):
        if iptal():
            raise InterruptedError("İşlem iptal edildi.")
        f(yuzde, mesaj)
    return bildir


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


KILITLI_METNI = "başka bir programda açık olabilir"   # renderer bu ifadeyle kilitli dosya hatasını tanır
SALT_OKUNUR_METNI = "salt okunur"                       # renderer bu ifadeyle salt okunur dosya hatasını tanır (kilitten ayrı ileti)


def _salt_okunur_mu(yol):
    """Dosyanın salt okunur özniteliği (Windows FILE_ATTRIBUTE_READONLY; başka sistemlerde yazma izni yok) açık mı?"""
    try:
        st = os.stat(yol)
    except OSError:
        return False
    oznitelik = getattr(st, "st_file_attributes", None)
    if oznitelik is not None:
        return bool(oznitelik & stat.FILE_ATTRIBUTE_READONLY)
    return not (st.st_mode & stat.S_IWUSR)


def _kilitli_mi(yol):
    """Dosya okunmak üzere açılamıyorsa (başka program özel kilitle tutuyorsa) True."""
    try:
        with open(yol, "rb"):
            return False
    except PermissionError:
        return True
    except OSError:
        return False


def _onbellekten_al(yol):
    """Önbellekteki belgeyi verir; dosya başka bir programda özel kilitle açık olduğu için açılamıyorsa MuPDF'in İngilizce
    iletisi yerine Türkçe PermissionError (KILITLI_METNI; renderer "okunamadı" sorusunu gösterir)."""
    try:
        return _onbellek().al(yol)
    except Exception:
        if _kilitli_mi(yol):
            raise PermissionError("Dosya okunamadı; %s: %s" % (KILITLI_METNI, os.path.basename(yol)))
        raise


def _pdf_ac(yol):
    """Belgeyi diskten TAZE açar (önbellekteki nesneyi değiştirmemek için)."""
    _dosya_var(yol)
    try:
        doc = pymupdf.open(yol)
    except Exception as e:
        if _kilitli_mi(yol):
            raise PermissionError("Dosya okunamadı; %s: %s" % (KILITLI_METNI, os.path.basename(yol)))
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


def _gecici_yol(hedef):
    """Hedefle AYNI klasörde geçici dosya yolu (os.replace aynı birimde atomik olsun)."""
    return "%s.%d.pdefe-tmp" % (hedef, os.getpid())


def _hedef_klasoru_hazirla(hedef):
    klasor = os.path.dirname(hedef)
    if klasor and not os.path.isdir(klasor):
        try:
            os.makedirs(klasor, exist_ok=True)
        except OSError as e:
            raise OSError("Hedef klasör oluşturulamadı: %s (%s)" % (klasor, e))


def _yerine_koy(gecici, hedef):
    """Geçici dosyayı hedefin yerine atomik olarak koyar. Hedef kilitliyse özgün dosya olduğu gibi kalır."""
    try:
        os.replace(gecici, hedef)
    except PermissionError as e:
        # Salt okunur hedefe os.replace de erişim hatası verir; ileti kilitten ayrılır (dosyayı açık tutan program yok)
        if _salt_okunur_mu(hedef):
            raise PermissionError("Dosya yazılamadı; %s: %s" % (SALT_OKUNUR_METNI, os.path.basename(hedef)))
        raise PermissionError("Dosya yazılamadı; %s: %s (%s)" % (KILITLI_METNI, os.path.basename(hedef), e))


def _kaydet_sinirli(doc, hedef, en_fazla=None, once_kapat=(), **secenekler):
    """Belgeyi önce hedefin klasöründe geçici dosyaya yazar, belgeyi KAPATIR, sonra os.replace ile hedefe
    taşır (hedef kaynağın kendisi olabilir; MuPDF dosya tanıtıcısını açık tuttuğundan kapatmadan üzerine
    yazılamaz; yarım dosya bırakmaz, yedek almaz). once_kapat: geçici dosya yazıldıktan sonra, hedefin yerine
    konmasından önce kapatılacak başka belgeler (ör. hedefin kendisinden açılmış kaynak belge). en_fazla verilir
    ve geçici dosya bu bayttan küçük değilse hedefe dokunulmaz. Döner: (boyut, yazildi). Çağıran, bu işlevden
    sonra doc'u ve once_kapat belgelerini kullanmamalı."""
    hedef = _mutlak(hedef, "hedef")
    _hedef_klasoru_hazirla(hedef)
    gecici = _gecici_yol(hedef)
    try:
        doc.save(gecici, **secenekler)
        _kapat(doc)
        for d in once_kapat:
            _kapat(d)
        boyut = os.path.getsize(gecici)
        if en_fazla is not None and boyut >= en_fazla:
            return boyut, False
        _yerine_koy(gecici, hedef)
    finally:
        if os.path.exists(gecici):
            try:
                os.remove(gecici)
            except OSError:
                pass
    return os.path.getsize(hedef), True


def _kaydet(doc, hedef, once_kapat=(), **secenekler):
    """_kaydet_sinirli'nin sınırsız hali: geçici dosya + os.replace; yeni boyutu döner."""
    return _kaydet_sinirli(doc, hedef, once_kapat=once_kapat, **secenekler)[0]


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
def _tahmin_seviyeleri(p):
    """Ölçülecek seviyeler: varsayılan üçlü ya da çağıranın verdiği {ad: {dpi, kalite}} sözlüğü
    (renderer 'ozel' için yalnızca kendi dpi/kalitesini gönderir). dpi+kalite verilip seviyeler
    verilmemişse üçlüye 'ozel' eklenir."""
    verilen = p.get("seviyeler")
    if isinstance(verilen, dict) and verilen:
        sonuc = {}
        for ad, deger in verilen.items():
            if ad in SEVIYELER and not isinstance(deger, dict):
                sonuc[ad] = SEVIYELER[ad]
                continue
            if not isinstance(deger, dict):
                raise ValueError("Seviye tanımı geçersiz: %r" % (ad,))
            sonuc[str(ad)] = _seviye_cozumle("ozel", deger.get("dpi"), deger.get("kalite"))
        return sonuc
    sonuc = dict(SEVIYELER)
    if p.get("dpi") is not None and p.get("kalite") is not None:
        sonuc["ozel"] = _seviye_cozumle("ozel", p.get("dpi"), p.get("kalite"))
    return sonuc


def y_kucult_tahmin(p):
    """{yol, seviyeler?: {ad: {dpi, kalite}}, dpi?, kalite?}
    → {mevcut, seviyeler:{asiri|onerilen|dusuk|...:{boyut, yuzde, dpi, kalite}}, tahmin, sure}
    Büyük belgelerde (>40 MB ya da >250 sayfa) ilk 20 sayfa örneklenir, oran ölçeklenir."""
    ilerleme = _ilerleme(p)
    yol = _mutlak(p.get("yol"))
    _dosya_var(yol)
    seviyeler_tanim = _tahmin_seviyeleri(p)
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
    adlar = list(seviyeler_tanim)
    for i, ad in enumerate(adlar):
        dpi, kalite = seviyeler_tanim[ad]
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
    """{yol, hedef, seviye, dpi?, kalite?, kuculmezseYazma?} → {boyut, oncekiBoyut, yuzde, uyari, yol, dpi, kalite, yazilmadi}
    Hedefin klasöründe geçici dosyaya yazılır, os.replace ile hedefe konur (hedef == yol: üzerine yazma, yedek
    alınmaz). kuculmezseYazma: sonuç özgünden küçük değilse hedefe dokunulmaz (yazilmadi=True; boyut, ulaşılan
    boyuttur)."""
    ilerleme = _ilerleme(p)
    yol = _mutlak(p.get("yol"))
    hedef = _mutlak(p.get("hedef") or yol, "hedef")
    dpi, kalite = _seviye_cozumle(p.get("seviye", "onerilen"), p.get("dpi"), p.get("kalite"))
    _dosya_var(yol)
    onceki = os.path.getsize(yol)
    _onbellekten_birak(yol)
    if os.path.exists(hedef):
        _onbellekten_birak(hedef)
    ilerleme(2, "Belge açılıyor…")
    doc = _pdf_ac(yol)
    try:
        _kucult_uygula(doc, dpi, kalite, ilerleme, taban=5, aralik=80)
        ilerleme(88, "Kaydediliyor…")
        # Küçülmediyse (üzerine yazmada) özgün dosyaya hiç dokunulmaz: yedek olmadığından büyüyen sonuç geri alınamazdı
        boyut, yazildi = _kaydet_sinirli(doc, hedef, en_fazla=onceki if p.get("kuculmezseYazma") else None,
                                         **KAYIT_SECENEKLERI)
        yazilmadi = not yazildi
    finally:
        _kapat(doc)
    ilerleme(100, "Tamamlandı")
    return {"boyut": boyut, "oncekiBoyut": onceki, "yuzde": round(100.0 * boyut / max(onceki, 1), 1),
            "uyari": boyut >= onceki, "dpi": dpi, "kalite": kalite, "yol": hedef, "yazilmadi": yazilmadi}


# ---------------------------------------------------------------- 3) sayfalar_uygula
def y_sayfalar_uygula(p):
    """{yol, hedef, tarif:[{kaynak, sayfa, dondurme, genislik?, yukseklik?}]} → {boyut, sayfa}
    kaynak null → boş sayfa; dondurme kaynak sayfanın /Rotate'ine EK; notlar, form alanları ve aynı parçada kalan sayfalar arası
    bağlantılar sayfalarla birlikte kopyalanır (insert_pdf; Popup ve yanıt notlarını kopyalamaz, yapısal kayıttaki gibi), yol
    belgesinin yer imleri korunan sayfalara yeniden eşlenir; meta veri kopyalanır.
    hedef == yol olabilir. Sayfaları düzenle "Yeni belge olarak kaydet" bu yöntemle yazar: sonuç hedefin klasöründe geçici
    dosyaya yazılıp os.replace ile yerine konur (kilitli / salt okunur hedefte hedef değişmez: KILITLI_METNI /
    SALT_OKUNUR_METNI). İptal yalnızca yazmadan önce denetlenir: yazdıktan sonra ilerleme bildirilmez (yoksa geç gelen
    iptal yazılmış dosyayı yazılmamış gösterirdi)."""
    ilerleme = _ilerleme(p)
    yol = _mutlak(p.get("yol"))
    hedef = _mutlak(p.get("hedef") or yol, "hedef")
    tarif = p.get("tarif")
    if not isinstance(tarif, list) or not tarif:
        raise ValueError("Sayfa tarifi boş; en az bir sayfa gerekli.")
    kaynaklar = {}     # normalize yol → doc
    sayfa_sayilari = {}

    def kaynak_al(k):
        anahtar = os.path.normcase(os.path.abspath(k))
        if anahtar not in kaynaklar:
            kaynaklar[anahtar] = _onbellekten_al(_dosya_var(os.path.abspath(k)))
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
        # Hedef, kaynaklardan biri olabilir: yazmadan önce aynı dosyaya işaret eden her girdiyi bırak
        # (insert_pdf nesneleri kopyaladığından kaynak belgelerin kapanması sonucu etkilemez)
        if os.path.exists(hedef):
            _onbellekten_birak(hedef)
        sayfa = yeni.page_count
        boyut = _kaydet(yeni, hedef, **YAPISAL_KAYIT)
    finally:
        _kapat(yeni)
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


def _parca_yaz(kaynak, gruplar, hedef_yol, toc, once_kapat=()):
    """Kaynaktan verilen aralıkları yeni belgeye kopyalar (notlar, form alanları, bağlantılar; insert_pdf Popup ve yanıt notlarını
    kopyalamaz) ve kaydeder; kalan sayfalara düşen yer imleri yeniden eşlenir. once_kapat: hedef yerine konmadan önce kapatılacak
    belgeler (hedef kaynağın kendisiyse kaynak)."""
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
        _kaydet(yeni, hedef_yol, once_kapat=once_kapat, **YAPISAL_KAYIT)
    finally:
        _kapat(yeni)
    return hedef_yol


def _ayir_uzerine(yol, gruplar, ilerleme):
    """PDF ayır "Üzerine yaz": özgün dosyada yalnızca verilen sayfa aralıkları kalır (sırasıyla). Yedek alınmaz; sonuç aynı
    klasörde geçici dosyaya yazılır, özgün dosyanın tanıtıcıları (önbellek ve bu işin açtığı belge) kapatılıp os.replace ile
    yerine konur: dosya kilitli ya da salt okunursa özgün dosya değişmez (KILITLI_METNI / SALT_OKUNUR_METNI). Ada "(2)" eklenmez.
    İptal yalnızca yazmadan önce denetlenir: yer değiştirmeden sonra ilerleme bildirilmez (geç gelen iptal yazılmış dosyayı
    yazılmamış göstermesin). Döner: {dosyalar, ayrintilar, uzerine}."""
    _onbellekten_birak(yol)
    ilerleme(5, "Belge açılıyor…")
    kaynak = _pdf_ac(yol)
    try:
        toc = kaynak.get_toc(simple=False)
        ilerleme(30, "Sayfalar kopyalanıyor…")
        _parca_yaz(kaynak, gruplar, yol, toc, once_kapat=(kaynak,))
    finally:
        _kapat(kaynak)
    sayfa = sum(s - b + 1 for b, s in gruplar)
    return {"dosyalar": [yol], "ayrintilar": [{"yol": yol, "boyut": os.path.getsize(yol), "sayfa": sayfa}], "uzerine": True}


def y_ayir(p):
    """{yol, hedefKlasor|klasor, mod:'aralik'|'herN'|'secili'|'tek', araliklar, n, sayfalar, uzerine?}
    → {dosyalar: [yol...], ayrintilar: [{yol, boyut, sayfa}], uzerine?}
    Dosya adları: <ad>_1-3.pdf, <ad>_sayfa_5.pdf, <ad>_bolum_1.pdf; var olanın üzerine yazılmaz, (2) eklenir.
    uzerine: tek dosya üreten ayırmada ('secili' ya da tek aralıklı 'aralik') sonuç özgün dosyanın yerine yazılır, özgün dosyada
    yalnızca o sayfalar kalır (bkz. _ayir_uzerine; hedefKlasor kullanılmaz). Birden çok dosya üreten ayırmada hata verir.
    Alternatif (renderer): {yol, klasor, parcalar: [{ad: 'dosya.pdf', sayfalar: [1,2,3]}], uzerineYaz?}
    → adlar çağırandan gelir; uzerineYaz varsayılan True (renderer kullanıcıya önceden sorar)."""
    ilerleme = _ilerleme(p)
    yol = _mutlak(p.get("yol"))
    _dosya_var(yol)
    uzerine = bool(p.get("uzerine"))
    klasor = _mutlak(p.get("hedefKlasor") or p.get("klasor") or os.path.dirname(yol), "hedefKlasor")
    if not uzerine and not os.path.isdir(klasor):
        os.makedirs(klasor, exist_ok=True)
    mod = p.get("mod") or "aralik"
    doc = _onbellekten_al(yol)
    if doc.needs_pass:
        raise PermissionError("Belge parolayla korunuyor.")
    n_sayfa = doc.page_count
    ad = os.path.splitext(os.path.basename(yol))[0]
    toc = doc.get_toc(simple=False)

    # Yazılacak parçalar: [(etiket, [(bas,son)...])]
    parcalar = []
    verilen_parcalar = p.get("parcalar")
    if isinstance(verilen_parcalar, list) and verilen_parcalar:
        uzerine_yaz = p.get("uzerineYaz", True)
        for i, parca in enumerate(verilen_parcalar):
            if not isinstance(parca, dict) or not isinstance(parca.get("sayfalar"), list) or not parca["sayfalar"]:
                raise ValueError("Parça %d geçersiz: sayfa listesi gerekli." % (i + 1))
            sayfalar = [_sayfa_no(s, n_sayfa) for s in parca["sayfalar"]]
            dosya_adi = _guvenli_ad(os.path.splitext(str(parca.get("ad") or "").strip())[0]) if parca.get("ad") else None
            if not dosya_adi or dosya_adi == "belge":
                dosya_adi = "%s_%s" % (ad, _aralik_etiketi(_sayfa_listesini_gruplara(sayfalar)))
            parcalar.append((dosya_adi, _sayfa_listesini_gruplara(sayfalar)))
        dosyalar, ayrintilar = [], []
        toplam = len(parcalar)
        for i, (dosya_adi, gruplar) in enumerate(parcalar):
            hedef = os.path.join(klasor, dosya_adi + ".pdf") if uzerine_yaz else _benzersiz_yol(klasor, dosya_adi)
            if uzerine_yaz and os.path.exists(hedef):
                _onbellekten_birak(hedef)
            _parca_yaz(doc, gruplar, hedef, toc)
            dosyalar.append(hedef)
            ayrintilar.append({"yol": hedef, "boyut": os.path.getsize(hedef),
                               "sayfa": sum(s - b + 1 for b, s in gruplar)})
            ilerleme(int(100 * (i + 1) / toplam), "%d/%d dosya yazıldı" % (i + 1, toplam))
        return {"dosyalar": dosyalar, "ayrintilar": ayrintilar}
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

    if uzerine:
        if len(parcalar) != 1:
            raise ValueError("Üzerine yazma yalnızca tek dosya üreten ayırmada yapılabilir.")
        return _ayir_uzerine(yol, parcalar[0][1], ilerleme)

    dosyalar, ayrintilar = [], []
    toplam = len(parcalar)
    for i, (etiket, gruplar) in enumerate(parcalar):
        hedef = _benzersiz_yol(klasor, "%s_%s" % (ad, etiket))
        _parca_yaz(doc, gruplar, hedef, toc)
        dosyalar.append(hedef)
        ayrintilar.append({"yol": hedef, "boyut": os.path.getsize(hedef),
                           "sayfa": sum(s - b + 1 for b, s in gruplar)})
        ilerleme(int(100 * (i + 1) / toplam), "%d/%d dosya yazıldı" % (i + 1, toplam))
    return {"dosyalar": dosyalar, "ayrintilar": ayrintilar}


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
                             "görseli önce JPG ya da PNG'ye çevirin: %s" % os.path.basename(yol))


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


def _gorsel_kodla(im, kalite_adi, hedef_px=None, orijinal_bayt=None, kaynak_alt_ornekleme=-1):
    """Görseli PDF'e gömülecek bayta çevirir. Döner: (bayt, uzanti, genislik, yukseklik).
    kalite 'orijinal': JPEG dosyası dokunulmadan (EXIF yönü gerekmiyorsa), diğerleri PNG (kayıpsız).
    Diğer kaliteler: hedef_px'e (g, y) sığacak biçimde küçült ve JPEG'e kodla (1-bit → PNG). kaynak_alt_ornekleme: kaynak
    JPEG'in renk alt örneklemesi (Pillow get_sampling: 0 = 4:4:4, 1 = 4:2:2, 2 = 4:2:0, -1 = bilinmiyor); seviyeninkinden kabaysa
    o kullanılır: kaynakta zaten yarım çözünürlüklü renk 4:4:4 kodlanınca yalnızca bayt harcanır (telefon fotoğrafı "Yüksek"te
    A4'e sığdırılınca 810 → 585 KB)."""
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
    alt_ornekleme = max(2 if jpeg_kalite < 85 else 0, kaynak_alt_ornekleme if kaynak_alt_ornekleme in (0, 1, 2) else 0)
    im.save(buf, format="JPEG", quality=jpeg_kalite, optimize=True, progressive=False, subsampling=alt_ornekleme)
    return buf.getvalue(), "jpeg", im.width, im.height


def _gorsel_sayfa_olcusu(gen_px, yuk_px, sayfa_boyutu, kenar, dondurme, dpi_bilgisi=None):
    """Görselin yerleşeceği sayfa (pt) ve görsel dikdörtgeni (pt). dondurme 90/270 ise görselin
    görünen en/boyu yer değiştirir. Döner: (sayfa_g, sayfa_y, Rect).
    'orijinal': sayfa görselin kendisidir; kenar boşluğu yoktur (kenar yalnızca A4'te kullanılır). Ölçü tam pt'ye yuvarlanır ve
    görsel dikdörtgeni sayfa kutusunun aynısıdır: kesirli ölçüde sayfa ile görsel arasında kıl payı beyaz çizgi kalmaz (yuvarlama
    görseli en çok yarım pt gerer; bkz. _gorsel_sayfasi_ekle)."""
    kenar = max(0.0, float(kenar or 0))
    gorunen_g, gorunen_y = (yuk_px, gen_px) if dondurme in (90, 270) else (gen_px, yuk_px)
    if sayfa_boyutu == "orijinal":
        # Piksel → pt: 72 dpi varsay; çok büyükse 300 dpi
        dpi = 72.0
        if max(gorunen_g, gorunen_y) > 2500:
            dpi = 300.0
        g_pt, y_pt = gorunen_g * 72.0 / dpi, gorunen_y * 72.0 / dpi
        if max(g_pt, y_pt) > PDF_EN_BUYUK_KENAR:
            oran = PDF_EN_BUYUK_KENAR / max(g_pt, y_pt)
            g_pt, y_pt = g_pt * oran, y_pt * oran
        g_pt, y_pt = float(max(1, round(g_pt))), float(max(1, round(y_pt)))
        return g_pt, y_pt, pymupdf.Rect(0, 0, g_pt, y_pt)
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


def _gorsel_sayfasi_ekle(doc, bayt, sayfa_g, sayfa_y, rect, dondurme):
    """Görsel sayfasını belgenin sonuna ekler (birleştirme ve boyut tahmini aynı yolu kullanır). Orijinal boyutta görsel dikdörtgeni
    sayfanın kendisidir: oran korunmaz, görsel sayfayı kenardan kenara doldurur (tam pt'ye yuvarlanmış sayfada oran korunsaydı
    görsel bir yönde kıl payı küçülür, kenarda beyaz çizgi kalırdı). A4'te görsel oranı korunarak kutusuna yerleşir.
    dondurme saat yönündedir (arayüzün "Sağa döndür"ü +90, önizleme ve PDF /Rotate gibi); PyMuPDF'in rotate'i saat yönünün tersine
    döndürür (0.1.6'ya dek görseller önizlemenin tersine dönüyordu)."""
    pg = doc.new_page(width=sayfa_g, height=sayfa_y)
    tam_sayfa = rect == pymupdf.Rect(0, 0, sayfa_g, sayfa_y)
    pg.insert_image(rect, stream=bayt, rotate=(360 - dondurme) % 360, keep_proportion=not tam_sayfa)
    return pg


_cozulmus_gorseller = {}   # (yol, mtime, boyut) → (bicim, exif_yon, alt_ornekleme, [(kare_kipi, duz)]); yalnızca tahminde, en çok 2 görsel


def _gorsel_kareleri(yol, onbellekli=False):
    """Görseli açıp düzleştirilmiş karelerini verir: (bicim, exif_yon, alt_ornekleme, [(kare_kipi, duz)]); alt_ornekleme JPEG'in
    renk alt örneklemesi (bkz. _gorsel_kodla), JPEG değilse -1.
    onbellekli: aynı görselin her kalite seviyesi için yeniden çözülmemesi için son iki görsel bellekte tutulur."""
    anahtar = None
    if onbellekli:
        st = os.stat(yol)
        anahtar = (os.path.normcase(yol), st.st_mtime, st.st_size)
        if anahtar in _cozulmus_gorseller:
            return _cozulmus_gorseller[anahtar]
    im = _gorsel_ac(yol)
    bicim = (im.format or "").upper()
    exif_yon = 1
    try:
        exif_yon = int(im.getexif().get(0x0112, 1) or 1)
    except Exception:
        pass
    alt_ornekleme = -1
    if bicim in ("JPEG", "MPO"):
        try:
            from PIL import JpegImagePlugin
            alt_ornekleme = JpegImagePlugin.get_sampling(im)
        except Exception:
            pass
    kareler = [(kare.mode, _duzlestir(kare)) for kare in _kareler(im)]
    sonuc = (bicim, exif_yon, alt_ornekleme, kareler)
    if anahtar is not None:
        while len(_cozulmus_gorseller) >= 2:
            _cozulmus_gorseller.pop(next(iter(_cozulmus_gorseller)))
        _cozulmus_gorseller[anahtar] = sonuc
    return sonuc


def _gorsel_hazirla(oge, genel_kalite=None, onbellekli=False):
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
    bicim, exif_yon, alt_ornekleme, kareler = _gorsel_kareleri(yol, onbellekli)
    sonuc = []
    for kare_kipi, duz in kareler:
        # Dokunulmadan gömülebilen JPEG (ilk kare, kip değişmedi; EXIF yönü yok ya da yalnızca döndürme): "Orijinal"in kendisi, öteki
        # seviyelerin ölçüsü. Yön bilgili telefon fotoğrafı da olduğu gibi gömülür, dönüş PDF'te yapılır: önceden çözülüp PNG'ye
        # çevriliyordu (WhatsApp fotoğrafı 364 KB → 3,1 MB). Aynalı yönler (2, 4, 5, 7) çözülür.
        ozgun_jpeg = None
        if bicim == "JPEG" and exif_yon in EXIF_DONUSU and len(sonuc) == 0 and duz.mode == kare_kipi:
            with open(yol, "rb") as f:
                ozgun_jpeg = f.read()
        # duz EXIF'e göre çevrilmiş (görünen) karedir: sayfa ölçüsü ve yeniden kodlama onunla, özgün JPEG'e EXIF dönüşü de eklenir
        sayfa_g, sayfa_y, rect = _gorsel_sayfa_olcusu(duz.width, duz.height, sayfa_boyutu, kenar, dondurme)
        if kalite == "orijinal":
            bayt = ozgun_jpeg if ozgun_jpeg is not None else _ozgun_png(duz)[0]
        else:
            dpi, _ = GORSEL_KALITE[kalite]
            # Görselin sayfadaki fiziksel boyutu (döndürme öncesi eksenlere göre)
            yer_g, yer_y = (rect.height, rect.width) if dondurme in (90, 270) else (rect.width, rect.height)
            hedef_px = (int(yer_g / 72.0 * dpi), int(yer_y / 72.0 * dpi))
            bayt, _, _, _ = _gorsel_kodla(duz, kalite, hedef_px, kaynak_alt_ornekleme=alt_ornekleme)
            bayt = _buyutmeyen(bayt, duz, bicim, ozgun_jpeg, sayfa_g, sayfa_y, rect, dondurme)
        kare_donusu = (EXIF_DONUSU[exif_yon] + dondurme) % 360 if ozgun_jpeg is not None and bayt is ozgun_jpeg else dondurme
        sonuc.append((bayt, sayfa_g, sayfa_y, rect, kare_donusu))
    return sonuc


# EXIF yönü → görünen görsele ulaşmak için saklanan pikselleri saat yönünde döndürme (Pillow exif_transpose ile denetlendi)
EXIF_DONUSU = {1: 0, 3: 180, 6: 90, 8: 270}


KAYIPLI_BICIMLER = ("JPEG", "MPO", "HEIF", "HEIC", "AVIF")


def _ozgun_png(duz):
    """Karenin kayıpsız PNG kodu ("Orijinal" seviyesinde JPEG olmayan görsel), [bayt]. Karenin kendisinde saklanır (Pillow görseli
    sözlük anahtarı olamaz): tahminde kare önbellekte kaldıkça dört seviye aynı kodu paylaşır."""
    k = getattr(duz, "_pdefe_png", None)
    if k is None:
        k = [_gorsel_kodla(duz, "orijinal")[0]]
        duz._pdefe_png = k
    return k


def _buyutmeyen(aday, duz, bicim, ozgun_jpeg, sayfa_g, sayfa_y, rect, dondurme):
    """Kayıplı seviyenin sonucu özgün gösteriminden ("Orijinal"in gömeceğinden) küçük değilse özgün kullanılır: kalite hiç düşmez,
    dosya büyümez. Yeniden kodlama kaynaktan daha yüksek JPEG kalitesiyle bayt harcar (UYAP taraması q≈75 kaydedilmiş, "Yüksek"
    q90: 487 → 611 KB), ekran görüntüsü gibi az renkli görselde JPEG PNG'den büyüktür (0,09 → 0,33 MB). Karşılaştırma PDF'e gömülü
    boyutla: JPEG olduğu gibi, PNG MuPDF'in yeniden sıkıştırdığı hâliyle (_gomulu_gorsel_boyutu). Kayıplı biçimlerden (JPEG, HEIC)
    gelen ama dokunulmadan gömülemeyen görselde (aynalı EXIF yönü, CMYK) kayıpsız PNG hep çok büyüktür: karşılaştırılmaz."""
    def gomulu(b):
        return len(b) if b[:2] == b"\xff\xd8" else _gomulu_gorsel_boyutu(b, sayfa_g, sayfa_y, rect, dondurme)
    if ozgun_jpeg is not None:
        return ozgun_jpeg if len(ozgun_jpeg) <= gomulu(aday) else aday
    if bicim in KAYIPLI_BICIMLER:
        return aday
    # PNG'nin baytı ölçü değil: MuPDF çözüp yeniden sıkıştırır, gömülü hâli büyük de küçük de olabilir (ekran görüntüsü 0,12 → 0,09 MB)
    png = _ozgun_png(duz)[0]
    return png if _gomulu_gorsel_boyutu(png, sayfa_g, sayfa_y, rect, dondurme) <= gomulu(aday) else aday


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
    """{ogeler:[{yol, tur, kalite, sayfaBoyutu, kenar, dondurme}], hedef, genelKalite?|kalite?}
    → {boyut, sayfa, yol}"""
    ilerleme = _ilerleme(p)
    ogeler = p.get("ogeler")
    if not isinstance(ogeler, list) or not ogeler:
        raise ValueError("Birleştirilecek öğe yok.")
    hedef = _mutlak(p.get("hedef"), "hedef")
    genel = p.get("genelKalite") or p.get("kalite") or None
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
                    _gorsel_sayfasi_ekle(yeni, bayt, sg, sy, rect, dondurme)
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
        if os.path.exists(hedef):
            _onbellekten_birak(hedef)
        sayfa = yeni.page_count
        boyut = _kaydet(yeni, hedef, **KAYIT_SECENEKLERI)
    finally:
        _kapat(yeni)
    ilerleme(100, "Tamamlandı")
    return {"boyut": boyut, "sayfa": sayfa, "yol": hedef}


# ---------------------------------------------------------------- 6) gorsel_bilgi
def y_gorsel_bilgi(p):
    """{yol, genislik?=220} → {tur, genislik, yukseklik, boyut, sayfa?, png (küçük resim, base64),
    pngGenislik, pngYukseklik}"""
    yol = _mutlak(p.get("yol"))
    _dosya_var(yol)
    boyut = os.path.getsize(yol)
    tur = _oge_turu({"yol": yol, "tur": p.get("tur")})
    try:
        kucuk_g = int(p.get("genislik") or 220)
    except (TypeError, ValueError):
        kucuk_g = 220
    kucuk_g = max(16, min(kucuk_g, 1024))
    if tur == "pdf":
        doc = _onbellek().al(yol)
        if doc.needs_pass:
            raise PermissionError("Belge parolayla korunuyor: %s" % os.path.basename(yol))
        pg = doc[0]
        r = pg.rect
        olcek = float(kucuk_g) / max(r.width, 1)
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
    oran = float(kucuk_g) / max(kucuk.width, 1)
    if oran < 1:
        kucuk = kucuk.resize((kucuk_g, max(1, int(round(kucuk.height * oran)))), Image.LANCZOS)
    buf = io.BytesIO()
    kucuk.save(buf, format="PNG", optimize=True)
    return {"tur": "gorsel", "genislik": genislik, "yukseklik": yukseklik, "boyut": boyut, "sayfa": sayfa,
            "bicim": (im.format or "").lower(), "png": base64.b64encode(buf.getvalue()).decode("ascii"),
            "pngGenislik": kucuk.width, "pngYukseklik": kucuk.height}


# ---------------------------------------------------------------- 7) boyut_tahmini
def y_boyut_tahmini(p):
    """{oge, genelKalite?} → {boyut, tahmin, ozet, tekrar}: öğenin verilen kaliteyle çıktı boyutunun hızlı tahmini.
    ozet: çıktıya girecek içeriğin özeti (aynı özetli öğeler çıktıda bir kez saklanır); tekrar: aynı içerik yeniden
    eklenince toplama eklenecek bayt. Toplam: ilk öğe boyut, aynı özetli sonrakiler yalnızca tekrar kadar.
    Çoğul biçim: {ogeler: [oge...], genelKalite?|kalite?} → {ogeler: [{boyut, tahmin, ozet, tekrar}|{hata}], toplam}
    (bir öğe açılamazsa yalnızca o öğe hata alır, diğerleri hesaplanır)."""
    ilerleme = _ilerleme(p)
    genel = p.get("genelKalite") or p.get("kalite") or None
    ogeler = p.get("ogeler")
    if isinstance(ogeler, list):
        sonuclar = []
        toplam = 0
        gorulen = set()
        for i, oge in enumerate(ogeler):
            try:
                if not isinstance(oge, dict):
                    raise ValueError("Öğe %d geçersiz." % (i + 1))
                r = _oge_boyut_tahmini(oge, genel)
                toplam += r["tekrar"] if r["ozet"] in gorulen else r["boyut"]
                gorulen.add(r["ozet"])
                sonuclar.append(r)
            except Exception as e:
                sonuclar.append({"boyut": None, "tahmin": False, "hata": str(e)})
            ilerleme(int(100 * (i + 1) / max(len(ogeler), 1)), "%d/%d öğe ölçüldü" % (i + 1, len(ogeler)))
        return {"ogeler": sonuclar, "toplam": toplam}
    oge = p.get("oge")
    if not isinstance(oge, dict):
        raise ValueError("Öğe verilmedi.")
    return _oge_boyut_tahmini(oge, genel)


_tahmin_onbellegi = {}       # (yol, mtime, boyut, tür, kalite, sayfaBoyutu, kenar, dondurme) → sonuç
_gorselsiz_pdf_boyutu = {}   # (yol, mtime, boyut) → (yeniden yazılmış boyut, sayfa): görsel içermeyen PDF (seviyeden bağımsız)
_dosya_ozetleri = {}         # (yol, mtime, boyut) → dosya içeriğinin MD5 özeti
_bos_sayfa_boyutlari = {}    # (genişlik, yükseklik) → boş tek sayfalık belgenin kayıtlı boyutu
_gomulu_boyutlar = {}        # (görsel özeti, sayfa, kutu, döndürme) → JPEG dışı görselin PDF'teki boyutu (_gomulu_gorsel_boyutu)


def _dosya_ozeti(yol, dosya):
    """Dosya içeriğinin özeti (aynı dosyanın farklı adla kopyası da aynı özeti verir); dosya başına bir kez okunur."""
    if dosya not in _dosya_ozetleri:
        h = hashlib.md5()
        with open(yol, "rb") as f:
            for parca in iter(lambda: f.read(1 << 20), b""):
                h.update(parca)
        if len(_dosya_ozetleri) > 400:
            _dosya_ozetleri.clear()
        _dosya_ozetleri[dosya] = h.hexdigest()
    return _dosya_ozetleri[dosya]


def _gomulu_gorsel_boyutu(bayt, sayfa_g, sayfa_y, rect, dondurme):
    """JPEG dışı (PNG) görselin PDF'teki gerçek boyutu. MuPDF PNG'yi çözüp kendi sıkıştırmasıyla yazar; boyutu dosyanın
    ya da Pillow PNG'sinin boyutundan belirgin biçimde farklı olabilir (ölçüm: %25 küçükten %60 büyüğe). Birleştirmedeki gibi tek
    sayfalık belgeye eklenip kayıt boyutundan boş sayfanın boyutu çıkarılır. Aynı görsel (kayıplı seviyenin özgünle karşılaştırması
    ve tahmindeki ölçüm) bir kez ölçülür."""
    anahtar = (hashlib.md5(bayt).digest(), len(bayt), round(sayfa_g, 1), round(sayfa_y, 1), tuple(round(v, 1) for v in rect), dondurme)
    if anahtar in _gomulu_boyutlar:
        return _gomulu_boyutlar[anahtar]
    olcu = (round(sayfa_g, 1), round(sayfa_y, 1))
    if olcu not in _bos_sayfa_boyutlari:
        bos = pymupdf.open()
        try:
            bos.new_page(width=sayfa_g, height=sayfa_y)
            _bos_sayfa_boyutlari[olcu] = len(bos.tobytes(**KAYIT_SECENEKLERI))
        finally:
            bos.close()
    d = pymupdf.open()
    try:
        _gorsel_sayfasi_ekle(d, bayt, sayfa_g, sayfa_y, rect, dondurme)
        boyut = max(0, len(d.tobytes(**KAYIT_SECENEKLERI)) - _bos_sayfa_boyutlari[olcu])
    finally:
        d.close()
    if len(_gomulu_boyutlar) > 64:
        _gomulu_boyutlar.clear()
    _gomulu_boyutlar[anahtar] = boyut
    return boyut


def _oge_boyut_tahmini(oge, genel):
    """Öğenin verilen kaliteyle çıktı boyutu {boyut, tahmin, ozet, tekrar} (bkz. y_boyut_tahmini). Renderer her öğe için
    dört seviyeyi ayrı ayrı sorar; aynı öğe/seviye yeniden hesaplanmaz, görsel her seviye için yeniden çözülmez,
    görselsiz PDF bir kez yazılır."""
    tur = _oge_turu(oge)
    kalite = oge.get("kalite") or genel or "orijinal"
    if kalite != "orijinal" and kalite not in GORSEL_KALITE:
        raise ValueError("Bilinmeyen kalite: %r" % (kalite,))
    yol = _mutlak(oge.get("yol"))
    _dosya_var(yol)
    st = os.stat(yol)
    dosya = (os.path.normcase(yol), st.st_mtime, st.st_size)
    sayfa_boyutu = oge.get("sayfaBoyutu") or "a4"
    kenar = float(oge.get("kenar") or 0) if sayfa_boyutu != "orijinal" else 0.0   # orijinal boyutta kenar yok
    anahtar = dosya + (tur, kalite) + ((sayfa_boyutu, kenar, _dondurme(oge.get("dondurme"))) if tur == "gorsel" else ())
    if anahtar in _tahmin_onbellegi:
        return dict(_tahmin_onbellegi[anahtar])
    if tur == "pdf":
        if dosya in _gorselsiz_pdf_boyutu:
            (boyut, sayfa), gorselsiz = _gorselsiz_pdf_boyutu[dosya], True
        else:
            kaynak = _pdf_ac(yol)
            try:
                sayfa = kaynak.page_count
                if kalite == "orijinal" and st.st_size > TAHMIN_ORNEK_BAYT:
                    # Çok büyük belgeyi yalnızca "Orijinal" tahmini için bellekte yeniden yazmaya değmez: dosya boyutu yeterli yaklaşım
                    boyut, gorselsiz = st.st_size, False
                else:
                    # Orijinal de yeniden yazılarak ölçülür: birleştirme kaydı (nesne akışları, sıkıştırma) çoğu dosyayı küçültür
                    gorselsiz = not any(pg.get_images(full=False) for pg in kaynak)
                    if not gorselsiz and kalite != "orijinal":
                        dpi, q = GORSEL_KALITE[kalite]
                        _gorselleri_yeniden_yaz(kaynak, dpi, q)
                    boyut = len(kaynak.tobytes(**KAYIT_SECENEKLERI))
            finally:
                kaynak.close()
            if gorselsiz:
                # Görsel yoksa bütün seviyeler aynı sonucu verir: diğer seviyeler yeniden yazılmaz
                if len(_gorselsiz_pdf_boyutu) > 200:
                    _gorselsiz_pdf_boyutu.clear()
                _gorselsiz_pdf_boyutu[dosya] = (boyut, sayfa)
        # Görselsiz PDF her seviyede aynı çıktıyı verir: özet seviyeden bağımsızdır (öğelere farklı kalite seçilse de bir kez saklanır)
        sonuc = {"boyut": boyut, "tahmin": True, "ozet": "pdf:%s:%s" % (_dosya_ozeti(yol, dosya), "*" if gorselsiz else kalite),
                 "tekrar": TEKRAR_SAYFA_BAYT * sayfa}
    else:
        toplam, sayfa = 0, 0
        h = hashlib.md5()
        for bayt, sayfa_g, sayfa_y, rect, dondurme in _gorsel_hazirla(oge, genel, onbellekli=True):
            h.update(bayt)
            sayfa += 1
            if bayt[:2] == b"\xff\xd8":
                toplam += len(bayt) + GORSEL_SAYFA_PAYI   # JPEG olduğu gibi gömülür
            else:
                toplam += _gomulu_gorsel_boyutu(bayt, sayfa_g, sayfa_y, rect, dondurme) + GORSEL_SAYFA_PAYI
        # Özet gömülecek baytlardan: aynı görsel aynı kaliteyle (aynı dosya ya da kopyası) çıktıda bir kez saklanır
        sonuc = {"boyut": toplam, "tahmin": True, "ozet": "gorsel:" + h.hexdigest(), "tekrar": TEKRAR_SAYFA_BAYT * sayfa}
    if len(_tahmin_onbellegi) > 400:
        _tahmin_onbellegi.clear()
    _tahmin_onbellegi[anahtar] = dict(sonuc)
    return sonuc


# ---------------------------------------------------------------- 8) dondur_kaydet
def y_dondur_kaydet(p):
    """{yol, hedef, sayfalar:[1-tabanlı]|null, derece} → {boyut, artimli, sayfa, yol}.
    Özgün dosya hedefin klasöründe geçici bir kopyaya alınır, döndürme o kopyaya ARTIMLI yazılır (e-imzalı
    baytlar, ekler, belge bilgileri korunur; büyük dosyada hızlı), olmazsa tam yazım; ardından geçici dosya
    os.replace ile hedefe konur. hedef == yol (üzerine yazma) dahil hiçbir durumda yarım dosya ya da yedek
    kalmaz; hedef başka programda kilitliyse özgün dosya değişmez."""
    ilerleme = _ilerleme(p)
    yol = _mutlak(p.get("yol"))
    hedef = _mutlak(p.get("hedef") or yol, "hedef")
    derece = _dondurme(p.get("derece"))
    if derece == 0:
        raise ValueError("Döndürme derecesi 0; yapılacak bir şey yok.")
    _dosya_var(yol)
    if _kilitli_mi(yol):
        raise PermissionError("Dosya okunamadı; %s: %s" % (KILITLI_METNI, os.path.basename(yol)))
    _onbellekten_birak(yol)
    if os.path.exists(hedef):
        _onbellekten_birak(hedef)
    _hedef_klasoru_hazirla(hedef)
    gecici = _gecici_yol(hedef)
    gecici_tam = gecici + ".tam"
    doc = None
    try:
        ilerleme(2, "Belge hazırlanıyor…")
        shutil.copyfile(yol, gecici)
        try:
            doc = _pdf_ac(gecici)
        except (ValueError, PermissionError) as e:
            raise type(e)(str(e).replace(os.path.basename(gecici), os.path.basename(yol)))
        sayfalar = p.get("sayfalar")
        if isinstance(sayfalar, list) and sayfalar:
            indeksler = sorted(set(_sayfa_no(s, doc.page_count) - 1 for s in sayfalar))
        else:
            indeksler = list(range(doc.page_count))
        sayfa = doc.page_count
        for k, i in enumerate(indeksler):
            pg = doc[i]
            pg.set_rotation((pg.rotation + derece) % 360)
            if k % 50 == 0:
                ilerleme(5 + int(75 * (k + 1) / len(indeksler)), "Sayfa %d döndürüldü" % (i + 1))
        ilerleme(85, "Kaydediliyor…")
        artimli = True
        try:
            doc.save(gecici, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
            _kapat(doc)
            hazir = gecici
        except Exception:   # ValueError / RuntimeError / mupdf FzError*
            # Onarılmış/bozuk xref'li belgelerde artımlı yazım yapılamaz: tam yazım (ayrı geçici dosyaya)
            artimli = False
            doc.save(gecici_tam, **YAPISAL_KAYIT)
            _kapat(doc)
            hazir = gecici_tam
        _yerine_koy(hazir, hedef)
        boyut = os.path.getsize(hedef)
    finally:
        _kapat(doc)
        for g in (gecici, gecici_tam):
            if os.path.exists(g):
                try:
                    os.remove(g)
                except OSError:
                    pass
    ilerleme(100, "Tamamlandı")
    return {"boyut": boyut, "artimli": artimli, "sayfa": sayfa, "yol": hedef}


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


# ---------------------------------------------------------------- 11) dosya_erisim
def y_dosya_erisim(p):
    """{yol} → {var, okunur, yazilir, saltOkunur}: üzerine yazmadan ÖNCE dosyanın başka bir programda kilitli ya da
    salt okunur olup olmadığına bakılır (uzun işlem bittikten sonra hata vermemek için). Dosyaya yazılmaz; 'r+b' açılıp
    kapatılır. Çekirdeğin kendi önbelleğindeki tanıtıcı paylaşımlı açıldığından sonucu etkilemez. saltOkunur: yazılamamanın
    nedeni dosyanın salt okunur özniteliği (renderer kilit yerine bunu söyler)."""
    yol = _mutlak(p.get("yol"))
    if not os.path.isfile(yol):
        return {"var": False, "okunur": False, "yazilir": False, "saltOkunur": False}
    okunur = not _kilitli_mi(yol)
    try:
        with open(yol, "r+b"):
            yazilir = True
    except OSError:
        yazilir = False
    salt_okunur = not yazilir and _salt_okunur_mu(yol)
    return {"var": True, "okunur": okunur, "yazilir": yazilir, "saltOkunur": salt_okunur}


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
    yontemler["sayfa_boyutlari"] = y_sayfa_boyutlari
    yontemler["dosya_erisim"] = y_dosya_erisim
