# -*- coding: utf-8 -*-
"""Görsellerdeki yazının tanınması (0.1.24): taranmış sayfalardaki ve sayfaya görsel olarak konmuş yazılar seçilip kopyalanabilsin.

Tanıyıcı Windows'un yerleşik yazı tanıyıcısıdır (Windows.Media.Ocr, Türkçe dil paketinin tanıma bileşeni): çevrim dışı çalışır, ek
model dosyası gerekmez, bir A4 sayfa ~0,15 sn. Türkçe tanıyıcı yoksa kullanıcının dil listesindeki ilk tanıyıcı, o da yoksa tanıma
yapılmaz ("desteklenmiyor"). macOS'ta (0.2.0) Apple'ın yerleşik tanıyıcısı (Vision, VNRecognizeTextRequest; pyobjc) kullanılır: Türkçe
destekliyse Türkçe, desteklemiyorsa dil düzeltmesi kapalı Latin tanıma (_AppleTaniyici). Tanınan sözcükler belgeye yazılmaz; yalnızca
PDEfe'nin metin katmanında (seçim) ve kopyalamada (metin_sec) kullanılır.

Tanınan bölgeler sayfadaki görsellerin kutularıdır (birleşik; EN_KUCUK_ALAN'dan küçükler sayılmaz). Görselin üstünde zaten metin varsa
(tarayıcının tanıyıp görünmez yazıyla eklediği metin, antet görselinin üstüne yazılmış belge) o görsel tanınmaz: kutusunun en az
METIN_ORANI'nı sayfadaki sözcükler kaplıyorsa. Tanınan sözcüklerden sayfadaki bir sözcükle örtüşenler atılır (görselin üstüne yazılmış
metin, örneğin taranmış evraka eklenmiş e-imza satırı, iki kez seçilmesin).

Bölgeler 300 dpi'da ekrandaki (/Rotate uygulanmış) düzlemde çizilir: tanıyıcı yazıyı okuyucunun gördüğü gibi dik görür. Görsel kendi
çözünürlüğünün iki katı ve üstüne büyütülecekse (düşük çözünürlüklü tarama) MuPDF onu en yakın komşuyla büyütüp harfleri basamaklı
yaptığından görsel kendi çözünürlüğünde çizilir, büyütmeyi Pillow (Lanczos) yapar (0.1.25; ölçüm PLAN.md "Revizyon 0.1.25").
Sonuç PyMuPDF sözcüklerinin düzlemine (döndürülmemiş, görünür kutunun üst-sol kökenli koordinatı) çevrilir. Çizim (PyMuPDF) işçi iş
parçacığında, tanıma kendi iş parçacığında yapılır: tanıma sürerken işçi öteki isteklere (küçük resimler, kopyalama) geçer. Sonuçlar
dosyanın değişme zamanı ve boyutuyla önbellekte tutulur.

Yan ya da ters duran yazı (0.2.4): tanıyıcılar yalnızca aşağı yukarı yatay yazıyı okur; yatay tablo dik sayfaya yan yatırılıp taranınca
ya da sayfa ters taranınca hiç satır bulmuyor ya da anlamsız sözcükler veriyordu. Yazı dik okunmazsa (makul sözcük az) çizim 90, 270 ve
180 derece çevrilip yeniden tanınır, en çok makul sözcük veren yön seçilir (_yonlu_tani). Ekranda ve dosyada bir şey değişmez: sözcükler
sayfadaki yerlerine geri çevrilir, metin katmanında yazıyla birlikte dikey ya da ters durur; kopyanın sırası için satırların yazı yönü
önbellekte tutulur (satir_yonleri, pdefe_core._metin_duzlemi).
"""
import asyncio
import collections
import math
import os
import queue
import re
import sys
import threading

import pymupdf

OLCEK = 300 / 72               # 300 dpi: 10 pt yazı ~42 piksel; A4 ~8,7 milyon piksel (0.1.25'e dek 216 dpi)
BLOKLU_BUYUTME = 1.95          # görsel kendi çözünürlüğünün bu katından çok büyütülecekse büyütmeyi MuPDF değil Pillow yapar (MuPDF 2 kat
                               # ve üstünde en yakın komşuyla büyütüyor: 1,99 kat yumuşak, 2,00 kat basamaklı ölçüldü)
EN_FAZLA_PIKSEL = 20_000_000   # sayfa başına (bütün bölgeler; gri, bayt başına piksel): büyük sayfada ölçek küçülür
EN_BUYUK_KENAR = 9_600         # tanıyıcının sınırı OcrEngine.MaxImageDimension = 10 000 piksel
EN_KUCUK_ALAN = 1_000          # pt²: daha küçük görseller (simge, madde imi, küçük logo) tanınmaz
EN_KUCUK_KENAR = 8             # pt
METIN_ORANI = 0.15             # görselin bu kadarını sayfadaki sözcükler kaplıyorsa görselde metin zaten var
TAM_SAYFA = 0.6                # görseller sayfanın bu kadarını kaplıyorsa sayfa tek bölge olarak tanınır
EN_FAZLA_BOLGE = 30            # birleştirmeden sonra bundan çok ayrı bölge varsa da sayfa tek bölge
EN_FAZLA_GORSEL = 60           # bundan çok görsel kutusu birleştirilmez, sayfa tek bölge (birleştirme kutu sayısının küpüyle uzar)
ORTUSME = 0.3                  # tanınan sözcük sayfadaki bir sözcükle (küçüğünün alanının) bu oranda örtüşüyorsa atılır
EGIK = 1.0                     # derece; tanıyıcının ölçtüğü eğim bundan büyükse sözcük kutuları satıra eşitlenmez
BLOK_TABANI = 1_000_000        # tanınan satırların PyMuPDF blok numarası: satır başına bir blok, sayfanın bloklarından ayrı
ONBELLEK_SAYFA = 400
BEKLEME = 30                   # sn; metin_sec tanımayı en çok bu kadar bekler
# Yazının yönü (0.2.4, _yonlu_tani; ölçüm PLAN.md "Revizyon 0.2.4"): sonuçta en az YON_YETERLI makul sözcük varsa ve sözcüklerin en az
# YON_ORAN'ı makulse yazı o yönde okunmuş sayılır. Dik okunuş yetmezse öteki yönler denenir; net puanı (makul eksi makul olmayan
# sözcük) dik okunuşunkinden en az YON_FARK fazla, makul sözcüğü en az YON_EN_AZ olan en yüksek puanlı yön seçilir. Ters okunan yazı
# çok sözcük verir ama yarısından çoğu anlamsızdır: makul sözcük sayısıyla seçmek 180°'de yanılıyordu, net puanla yanılmıyor.
YON_YETERLI = 8
YON_ORAN = 0.7
YON_FARK = 3
YON_EN_AZ = 3
YON_DENEME = (90, 270, 180)    # saat yönünde derece; yan taranmış sayfa ters taranmıştan çok daha sık

_BOS = {"satirlar": [], "sozcukler": [], "yonler": []}

# ---------------------------------------------------------------- önbellek
_onbellek = collections.OrderedDict()   # (yol, değişme zamanı, boyut, sayfa) → {"satirlar", "sozcukler"}
_onbellek_kilidi = threading.Lock()


def _anahtar(yol, sayfa):
    st = os.stat(yol)
    return (os.path.normcase(os.path.abspath(yol)), st.st_mtime_ns, st.st_size, int(sayfa))


def _onbellekten(anahtar):
    with _onbellek_kilidi:
        k = _onbellek.get(anahtar)
        if k is not None:
            _onbellek.move_to_end(anahtar)
        return k


def _onbellege(anahtar, kayit):
    with _onbellek_kilidi:
        _onbellek[anahtar] = kayit
        _onbellek.move_to_end(anahtar)
        while len(_onbellek) > ONBELLEK_SAYFA:
            _onbellek.popitem(last=False)


# ---------------------------------------------------------------- tanıma iş parçacığı
_motor = None        # None: henüz denenmedi; False: tanıyıcı yok; yoksa OcrEngine (Windows) ya da _AppleTaniyici (macOS)
MAC = sys.platform == "darwin"
_kuyruk = queue.Queue()
_is_parcacigi = None
_baslatma_kilidi = threading.Lock()


def _calistir(is_, bitir):
    """is_(dongu) tanıma iş parçacığında çalışır; bitince bitir(sonuc, hata) çağrılır."""
    global _is_parcacigi
    with _baslatma_kilidi:
        if _is_parcacigi is None:
            _is_parcacigi = threading.Thread(target=_dongu, name="yazi-tanima", daemon=True)
            _is_parcacigi.start()
    _kuyruk.put((is_, bitir))


def _dongu():
    dongu = asyncio.new_event_loop()
    while True:
        is_, bitir = _kuyruk.get()
        try:
            sonuc, hata = is_(dongu), None
        except Exception as e:
            sonuc, hata = None, e
        try:   # bitir yanıt yazar; yazamasa da iş parçacığı ölmemeli (ölürse bütün tanıma istekleri yanıtsız kalırdı)
            bitir(sonuc, hata)
        except Exception as e:
            print("[yazi_tanima] yanıt yazılamadı: %s" % e, file=sys.stderr)


def calisti():
    """Tanıma iş parçacığı başlatıldı mı (pdefe_core çıkışta WinRT işi sürerken yorumlayıcıyı kapatmasın diye bakar)."""
    return _is_parcacigi is not None


def bitmesini_bekle(sure=10):
    """Kuyruktaki tanıma işleri bitip yanıtları yazılana dek bekler (en çok sure saniye; çekirdeğin girdisi kapanınca)."""
    if _is_parcacigi is None:
        return
    bitti = threading.Event()
    _kuyruk.put((lambda _dongu: None, lambda _r, _h: bitti.set()))
    bitti.wait(sure)


def _motor_al():
    """Tanıyıcı (yalnızca tanıma iş parçacığında): Türkçe, yoksa kullanıcının dil listesinden; hiçbiri yoksa None."""
    global _motor
    if _motor is None and MAC:
        try:
            _motor = _AppleTaniyici()
        except Exception as e:
            print("[yazi_tanima] Apple yazı tanıyıcısı açılamadı: %s" % e, file=sys.stderr)
            _motor = False
    if _motor is None:
        try:
            from winrt.windows.media.ocr import OcrEngine
            from winrt.windows.globalization import Language
            m = OcrEngine.try_create_from_language(Language("tr")) or OcrEngine.try_create_from_user_profile_languages()
            _motor = m or False
            if not m:
                print("[yazi_tanima] Windows yazı tanıyıcısı yok (dil paketi)", file=sys.stderr)
        except Exception as e:
            print("[yazi_tanima] Windows yazı tanıyıcısı açılamadı: %s" % e, file=sys.stderr)
            _motor = False
    return _motor or None


async def _tani(motor, gri, genislik, yukseklik):
    from winrt.windows.graphics.imaging import SoftwareBitmap, BitmapPixelFormat
    from winrt.windows.storage.streams import DataWriter
    yazici = DataWriter()
    yazici.write_bytes(gri)
    bmp = SoftwareBitmap.create_copy_from_buffer(yazici.detach_buffer(), BitmapPixelFormat.GRAY8, genislik, yukseklik)
    try:
        return await motor.recognize_async(bmp)
    finally:
        try:
            bmp.close()
        except Exception:
            pass


# ---------------------------------------------------------------- macOS: Apple'ın yazı tanıyıcısı (0.2.0)
# Windows.Media.Ocr'ın sonucuyla aynı biçim (_tamamla ikisini aynı okur): satırlar → sözcükler → piksel kutusu (üst-sol kökenli)
_Kutu = collections.namedtuple("_Kutu", "x y width height")
_Sozcuk = collections.namedtuple("_Sozcuk", "text bounding_rect")
_Satir = collections.namedtuple("_Satir", "words")
_Sonuc = collections.namedtuple("_Sonuc", "lines text_angle")
_SOZCUK = re.compile(r"\S+")


class _AppleTaniyici:
    """Vision çerçevesinin VNRecognizeTextRequest'i (doğru kip). Dil: tanıyıcı Türkçeyi destekliyorsa Türkçe (dil düzeltmesi açık);
    desteklemiyorsa varsayılan Latin tanıma, dil düzeltmesi kapalı (İngilizce sözlük Türkçe sözcükleri bozmasın; ş ğ ı s g i okunabilir).
    Sözcük kutuları satırın metnindeki aralıklardan (boundingBoxForRange) alınır; eğim satırların üst kenarının ortanca açısıdır."""

    def __init__(self):
        import objc
        import Vision
        with objc.autorelease_pool():
            istek = Vision.VNRecognizeTextRequest.alloc().init()
            istek.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
            try:
                destek, _ = istek.supportedRecognitionLanguagesAndReturnError_(None)
                destek = [str(d) for d in (destek or [])]
            except Exception:
                destek = []
        self.diller = [d for d in destek if d.lower().split("-")[0] == "tr"][:1]
        print("[yazi_tanima] Apple tanıyıcısı; Türkçe %s (diller: %s)" % ("var" if self.diller else "yok", ", ".join(destek)),
              file=sys.stderr)

    def tani(self, gri, genislik, yukseklik):
        import objc
        import Quartz
        import Vision
        from Foundation import NSData
        with objc.autorelease_pool():
            veri = NSData.dataWithBytes_length_(bytes(gri), len(gri))
            resim = Quartz.CGImageCreate(genislik, yukseklik, 8, 8, genislik, Quartz.CGColorSpaceCreateDeviceGray(),
                                         Quartz.kCGImageAlphaNone, Quartz.CGDataProviderCreateWithCFData(veri), None, False,
                                         Quartz.kCGRenderingIntentDefault)
            istek = Vision.VNRecognizeTextRequest.alloc().init()
            istek.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
            istek.setUsesLanguageCorrection_(bool(self.diller))
            if self.diller:
                istek.setRecognitionLanguages_(self.diller)
            isleyici = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(resim, {})
            tamam, hata = isleyici.performRequests_error_([istek], None)
            if not tamam:
                raise RuntimeError("Vision: %s" % hata)
            satirlar, acilar = [], []
            for gozlem in istek.results() or []:
                adaylar = gozlem.topCandidates_(1)
                if not adaylar:
                    continue
                aday = adaylar[0]
                metin = str(aday.string())
                sozcukler = []
                for m in _SOZCUK.finditer(metin):
                    # NSString aralığı UTF-16 birimiyle (Türkçe harfler tek birim; BMP dışı karakterde kayma olmasın)
                    bas = len(metin[:m.start()].encode("utf-16-le")) // 2
                    uzunluk = len(m.group(0).encode("utf-16-le")) // 2
                    kutu, _ = aday.boundingBoxForRange_error_((bas, uzunluk), None)
                    if kutu is None:
                        continue
                    b = kutu.boundingBox()   # 0–1, sol alt kökenli
                    sozcukler.append(_Sozcuk(m.group(0), _Kutu(b.origin.x * genislik, (1 - b.origin.y - b.size.height) * yukseklik,
                                                              b.size.width * genislik, b.size.height * yukseklik)))
                if sozcukler:
                    satirlar.append(_Satir(sozcukler))
                    sol, sag = gozlem.topLeft(), gozlem.topRight()
                    acilar.append(math.degrees(math.atan2((sol.y - sag.y) * yukseklik, (sag.x - sol.x) * genislik)))
            return _Sonuc(satirlar, sorted(acilar)[len(acilar) // 2] if acilar else 0.0)


def _tani_calistir(motor, c, dongu):
    """Bir çizimi tanır: Apple tanıyıcısı eşzamanlı, Windows'unki zaman uyumsuz (iş parçacığının olay döngüsünde)."""
    if isinstance(motor, _AppleTaniyici):
        return motor.tani(c["gri"], c["genislik"], c["yukseklik"])
    return dongu.run_until_complete(_tani(motor, c["gri"], c["genislik"], c["yukseklik"]))


# ---------------------------------------------------------------- yazının yönü (0.2.4)
_KUCUK, _BUYUK = "a-zçğıöşüâîû", "A-ZÇĞİÖŞÜÂÎÛ"
# Makul sözcük: küçük harfli, baş harfi büyük ya da büyük harfli sözcük (kesmeyle ekli de: "Ankara'da", "TBK'nın"), kısaltma ("T.C."),
# sayı ("2099/123", "01.10.2026", "1.250,00"). Ters okunan yazı ("NISYA EJeIsnp") çoğunlukla büyük-küçük harf karışık, harf ve rakam
# karışık ya da noktalama içinde çıkar; yan duran yazıdan tanıyıcı ya hiç satır ya da birkaç kısa parça bulur.
_MAKUL = re.compile(r"^(?:[{k}]{{2,}}|[{b}][{k}]+|[{b}]{{2,}}|[{b}]?[{k}]+['’][{k}]+|[{b}]{{2,}}['’][{k}]+|\d[\d.,/:-]*\d|[{b}](?:\.[{b}]){{1,3}}\.?)$"
                    .format(k=_KUCUK, b=_BUYUK))
_UC_ISARETLERI = re.compile(r"^[\"'“‘(\[«]+|[\"'”’)\].,;:!?»]+$")
_CEVIRME = {90: "ROTATE_270", 180: "ROTATE_180", 270: "ROTATE_90"}   # saat yönünde derece → Pillow'un adı (Pillow saat yönünün tersine sayar)


def _makul(sonuc):
    """Tanıyıcı sonucundaki makul sözcüklerin (bkz. _MAKUL; baştaki ve sondaki tırnak, ayraç, noktalama sayılmaz) ve bütün sözcüklerin
    sayısı."""
    makul = toplam = 0
    for satir in sonuc.lines:
        for w in satir.words:
            metin = (w.text or "").strip()
            if not metin:
                continue
            toplam += 1
            ozu = _UC_ISARETLERI.sub("", metin)
            if len(ozu) >= 2 and _MAKUL.match(ozu):
                makul += 1
    return makul, toplam


def _cevir(c, aci):
    """Çizimin saat yönünde aci derece çevrilmiş kopyası (gri, genislik, yukseklik)."""
    from PIL import Image
    im = Image.frombytes("L", (c["genislik"], c["yukseklik"]), c["gri"]).transpose(getattr(Image.Transpose, _CEVIRME[aci]))
    return {"gri": im.tobytes(), "genislik": im.width, "yukseklik": im.height}


def _geri_cevir(aci, genislik, yukseklik):
    """Saat yönünde aci derece çevrilmiş çizimdeki noktayı (piksel) çevrilmemiş çizimdeki noktaya götüren işlev."""
    if aci == 90:
        return lambda x, y: (y, yukseklik - x)
    if aci == 180:
        return lambda x, y: (genislik - x, yukseklik - y)
    if aci == 270:
        return lambda x, y: (genislik - y, x)
    return lambda x, y: (x, y)


def _yonlu_tani(motor, c, dongu):
    """Çizimi tanır; yazı dik okunmadıysa (bkz. YON_YETERLI) çizimi YON_DENEME sırasıyla çevirip yeniden tanır, net puanı en yüksek yönü
    seçer. Çeviri yalnızca dik okunuştan açıkça iyiyse seçilir (YON_FARK, YON_EN_AZ): yazısız görselde, az yazılı kaşede ve kötü
    taramada dik sonuç kalır; o zaman yalnızca süre uzar. Çevrilen okunuş yeterliyse öteki yönler denenmez.
    Döner: (sonuç, açı): açı, sonucun okunduğu çizimin saat yönünde çevrildiği derece (0 = çevrilmedi)."""
    yeterli = lambda makul, toplam: makul >= YON_YETERLI and makul >= YON_ORAN * toplam
    sonuc = _tani_calistir(motor, c, dongu)
    makul, toplam = _makul(sonuc)
    if yeterli(makul, toplam):
        return sonuc, 0
    en, en_aci, en_net = sonuc, 0, 2 * makul - toplam
    esik = en_net + YON_FARK
    for aci in YON_DENEME:
        s = _tani_calistir(motor, _cevir(c, aci), dongu)
        makul, toplam = _makul(s)
        net = 2 * makul - toplam
        if net >= esik and makul >= YON_EN_AZ and net > en_net:
            en, en_aci, en_net = s, aci, net
            if yeterli(makul, toplam):
                break
    return en, en_aci


# ---------------------------------------------------------------- bölgeler ve çizim (işçi iş parçacığı)
def _birlestir(kutular):
    """Değen ya da örtüşen kutuları birleştirir (şeritler hâlinde saklanmış taranmış sayfa tek bölge olur)."""
    kutular = [pymupdf.Rect(k) for k in kutular]
    degisti = True
    while degisti:
        degisti = False
        for i in range(len(kutular)):
            for j in range(i + 1, len(kutular)):
                a, b = kutular[i], kutular[j]
                if a.x0 <= b.x1 + 2 and b.x0 <= a.x1 + 2 and a.y0 <= b.y1 + 2 and b.y0 <= a.y1 + 2:
                    kutular[i] = a | b
                    del kutular[j]
                    degisti = True
                    break
            if degisti:
                break
    return kutular


def _bolgeler(pg, sozcukler, gorseller=None):
    """Tanınacak bölgeler (döndürülmemiş düzlemde Rect listesi); tanınacak görsel yoksa boş. gorseller: pg.get_image_info() (çağıran
    _hazirla'ya da verir; yoksa burada okunur)."""
    tam = pymupdf.Rect(0, 0, pg.cropbox.width, pg.cropbox.height)
    kutular = []
    for bilgi in (pg.get_image_info() if gorseller is None else gorseller):
        b = bilgi.get("bbox")
        if not b:
            continue
        r = pymupdf.Rect(b) & tam
        if not r.is_empty:
            kutular.append(r)
    # Çok sayıda görsel (şeritler hâlinde saklanmış tarama ya da kötü niyetle binlerce görsele bölünmüş sayfa) birleştirilmez ve tek tek
    # çizilip tanınmaz: bütün sayfa tek bölge (birleştirme kutu sayısının küpüyle uzar; 800 kutu 5,6 sn sürüyordu)
    if len(kutular) > EN_FAZLA_GORSEL:
        kutular = [tam]
    else:
        kutular = [r for r in _birlestir(kutular)
                   if r.width >= EN_KUCUK_KENAR and r.height >= EN_KUCUK_KENAR and r.width * r.height >= EN_KUCUK_ALAN]
        if not kutular:
            return []
        if len(kutular) > EN_FAZLA_BOLGE or sum(r.width * r.height for r in kutular) >= TAM_SAYFA * tam.width * tam.height:
            kutular = [tam]
    secilen = []
    for r in kutular:
        kaplanan = 0.0
        for w in sozcukler:
            if r.x0 <= (w[0] + w[2]) / 2 <= r.x1 and r.y0 <= (w[1] + w[3]) / 2 <= r.y1:
                kaplanan += max(0.0, w[2] - w[0]) * max(0.0, w[3] - w[1])
        if kaplanan < METIN_ORANI * r.width * r.height:
            secilen.append(r)
    return secilen


def _dogal_olcek(bolge, gorseller):
    """Bölgeye en çok alanıyla düşen görselin kendi çözünürlüğü, çizim ölçeği olarak (1 = 72 dpi; bu ölçekte görselin bir pikseli bir
    piksele düşer; iki ekseninden yoğun olanı). Görsel yoksa None."""
    en, en_alan = None, 0.0
    for g in gorseller:
        kutu, t = g.get("bbox"), g.get("transform")
        if not kutu or not t or not g.get("width") or not g.get("height"):
            continue
        kesisim = pymupdf.Rect(kutu) & bolge
        alan = 0.0 if kesisim.is_empty else kesisim.width * kesisim.height
        gx, gy = math.hypot(t[0], t[1]), math.hypot(t[2], t[3])
        if alan <= en_alan or gx <= 0 or gy <= 0:
            continue
        en, en_alan = max(g["width"] / gx, g["height"] / gy), alan
    return en


def _hazirla(pg, sozcukler, bolgeler, gorseller=None):
    """Sayfanın tanınacak bölgelerini çizer: {"cizimler": [...], "sozcukler": bölgelere değen sayfa sözcükleri (Rect), "derot": Matrix}.
    Bütün bölgelerin piksel toplamı EN_FAZLA_PIKSEL'i geçmez (ölçek ortak küçülür). Bölgedeki görsel kendi çözünürlüğünün
    BLOKLU_BUYUTME katından çok büyütülecekse kendi çözünürlüğünde çizilip Pillow'la (Lanczos) büyütülür; çizimin z / zy'si (yatay /
    dikey ölçek) ve x, y'si (kökeni) büyütülmüş görüntüye göredir. gorseller: pg.get_image_info() (yoksa burada okunur)."""
    if gorseller is None:
        gorseller = pg.get_image_info()
    cizimler = []
    # Örtüşme denetimine yalnızca bölgelere değen sözcükler girer (tanıma iş parçacığında sözcük × sözcük karşılaştırılır)
    gercekler = [pymupdf.Rect(w[:4]) for w in sozcukler]
    gercekler = [g for g in gercekler if any(g.intersects(b) for b in bolgeler)]
    kirpimlar = []
    for bolge in bolgeler:
        kirp = pymupdf.Rect(bolge * pg.rotation_matrix)
        kirp.normalize()
        kirpimlar.append(kirp)
    toplam = sum(max(k.width, 1.0) * max(k.height, 1.0) for k in kirpimlar) or 1.0
    for bolge, kirp in zip(bolgeler, kirpimlar):
        w, h = max(kirp.width, 1.0), max(kirp.height, 1.0)
        z = min(OLCEK, (EN_FAZLA_PIKSEL / toplam) ** 0.5, EN_BUYUK_KENAR / max(w, h))
        zn = _dogal_olcek(bolge, gorseller)
        if zn and z >= BLOKLU_BUYUTME * zn:
            from PIL import Image
            pix = pg.get_pixmap(matrix=pymupdf.Matrix(zn, zn), clip=kirp, colorspace=pymupdf.csGRAY, alpha=False, annots=False)
            # Hedef boyut doğrudan z'de çizimin vereceği boyut: kaba ölçekteki yuvarlama payı büyütmeyle katlanıp EN_FAZLA_PIKSEL'i aşmasın
            hedef = (kirp * pymupdf.Matrix(z, z)).irect
            g, y = max(1, hedef.width), max(1, hedef.height)
            if g >= 16 and y >= 16 and pix.width and pix.height:
                gri = Image.frombytes("L", (pix.width, pix.height), pix.samples).resize((g, y), Image.Resampling.LANCZOS).tobytes()
                fx, fy = g / pix.width, y / pix.height
                cizimler.append({"gri": gri, "genislik": g, "yukseklik": y, "x": pix.x * fx, "y": pix.y * fy, "z": zn * fx, "zy": zn * fy})
        else:
            pix = pg.get_pixmap(matrix=pymupdf.Matrix(z, z), clip=kirp, colorspace=pymupdf.csGRAY, alpha=False, annots=False)
            if pix.width >= 16 and pix.height >= 16:
                cizimler.append({"gri": pix.samples, "genislik": pix.width, "yukseklik": pix.height, "x": pix.x, "y": pix.y, "z": z})
        pix = None
    return {"cizimler": cizimler, "sozcukler": gercekler, "derot": pymupdf.Matrix(pg.derotation_matrix)}


# ---------------------------------------------------------------- tanıma ve koordinatlar (tanıma iş parçacığı)
_RAKAMLAR = str.maketrans({"o": "0", "O": "0", "ı": "1", "l": "1", "I": "1", "i": "1", "|": "1"})
# Rakama benzeyen harf dizisi: önünde rakam ya da . / - (veya sözcük başı), ardında rakam ya da . / - var. Ekler ("1990'lı", "15'i",
# "80li") çevrilmez: kesme işaretinden sonra ya da sözcük sonunda kalırlar
_RAKAM_ARASI = re.compile(r"(?:(?<=[\d./-])|^)[oOılIi|]+(?=[\d./-])")


def _rakamlari_duzelt(metin):
    """Türkçe tanıyıcı rakamların arasındaki 1 ve 0'ı harf okuyabiliyor ("01.ıo.2026"). En az iki rakamlı sözcükte (tarih, esas
    numarası, tutar) rakamların ya da . / - işaretlerinin arasına sıkışmış rakama benzeyen harfler rakama çevrilir."""
    if sum(c.isdigit() for c in metin) < 2:
        return metin
    return _RAKAM_ARASI.sub(lambda m: m.group(0).translate(_RAKAMLAR), metin)

def _ortusuyor(k, gercekler):
    alan = k.width * k.height
    for g in gercekler:
        if g.x1 <= k.x0 or g.x0 >= k.x1 or g.y1 <= k.y0 or g.y0 >= k.y1:
            continue
        kesisim = (min(g.x1, k.x1) - max(g.x0, k.x0)) * (min(g.y1, k.y1) - max(g.y0, k.y0))
        if kesisim >= ORTUSME * max(1e-6, min(alan, g.width * g.height)):
            return True
    return False


def _tamamla(anahtar, hazirlik, dongu):
    """Çizilen bölgeleri tanır, sonucu önbelleğe yazar. Döner: renderer yanıtı. Tanıma işleri tek iş parçacığında sırayla çalıştığından
    aynı sayfa için ikinci bir iş (ör. tanıma sürerken gelen kopyalama) önceki işin önbelleğe yazdığını bulur, yeniden tanımaz."""
    k = _onbellekten(anahtar)
    if k is not None:
        return {"satirlar": k["satirlar"]}
    motor = _motor_al()
    if motor is None:
        return {"satirlar": [], "desteklenmiyor": True}
    derot, gercekler = hazirlik["derot"], hazirlik["sozcukler"]
    satirlar, sozcukler, yonler = [], [], []
    yuvarla = lambda v: round(v, 2)
    for c in hazirlik["cizimler"]:
        sonuc, aci = _yonlu_tani(motor, c, dongu)
        zx, zy, ox, oy = c["z"], c.get("zy", c["z"]), c["x"], c["y"]
        # Çevrilmiş çizimde okunan noktalar önce çevrilmemiş çizime, oradan PyMuPDF düzlemine
        geri = _geri_cevir(aci, c["genislik"], c["yukseklik"])

        def nokta(px, py):
            gx, gy = geri(px, py)
            return pymupdf.Point((ox + gx) / zx, (oy + gy) / zy) * derot
        egik = abs(sonuc.text_angle or 0.0) >= EGIK
        for satir in sonuc.lines:
            kel = [(w.bounding_rect, _rakamlari_duzelt(w.text)) for w in satir.words if (w.text or "").strip()]
            if not kel:
                continue
            ust = min(r.y for r, _ in kel)
            alt = max(r.y + r.height for r, _ in kel)
            ogeler = []
            for r, metin in kel:
                u, a = (r.y, r.y + r.height) if egik else (ust, alt)
                sol_ust, sol_alt, sag_ust = nokta(r.x, u), nokta(r.x, a), nokta(r.x + r.width, u)
                sag_alt = sag_ust + (sol_alt - sol_ust)
                xs, ys = (sol_ust.x, sol_alt.x, sag_ust.x, sag_alt.x), (sol_ust.y, sol_alt.y, sag_ust.y, sag_alt.y)
                kutu = pymupdf.Rect(min(xs), min(ys), max(xs), max(ys))
                if _ortusuyor(kutu, gercekler):
                    continue
                ogeler.append((kutu, [metin, yuvarla(sol_ust.x), yuvarla(sol_ust.y), yuvarla(sol_alt.x), yuvarla(sol_alt.y),
                                      yuvarla(sag_ust.x), yuvarla(sag_ust.y)]))
            if not ogeler:
                continue
            blok = BLOK_TABANI + len(satirlar)
            satirlar.append([o for _, o in ogeler])
            for j, (kutu, o) in enumerate(ogeler):
                sozcukler.append((kutu.x0, kutu.y0, kutu.x1, kutu.y1, o[0], blok, 0, j))
            # Satırın yazı yönü (0.2.4; metin_sec'in düzlemi için): ilk sözcüğün sol üstünden sağ üstüne
            o = ogeler[0][1]
            dx, dy = o[5] - o[1], o[6] - o[2]
            if math.hypot(dx, dy) < 0.01:   # genişliksiz sözcük: yazı yönü satırın yukarısına dik
                dx, dy = o[4] - o[2], o[1] - o[3]
            u = math.hypot(dx, dy) or 1.0
            yonler.append((round(dx / u, 3), round(dy / u, 3)))
        c["gri"] = None
    _onbellege(anahtar, {"satirlar": satirlar, "sozcukler": sozcukler, "yonler": yonler})
    return {"satirlar": satirlar}


# ---------------------------------------------------------------- yöntemler
def y_ocr_sayfa(p):
    """Sayfanın görsellerindeki sözcükler (renderer'ın metin katmanı için): {"satirlar": [[[metin, solÜstX, solÜstY, solAltX, solAltY,
    sağÜstX, sağÜstY], ...], ...]} (PyMuPDF düzleminde; sol üst → sağ üst yazı yönü, sol üst → sol alt satırın yüksekliği). Tanıyıcı
    yoksa "desteklenmiyor": true. Tanıma gerekiyorsa yanıt tanıma iş parçacığından gelir (Ertelenmis)."""
    from pdefe_core import onbellek, Ertelenmis
    yol, sayfa = p["yol"], int(p["sayfa"])
    anahtar = _anahtar(yol, sayfa)
    k = _onbellekten(anahtar)
    if k is not None:
        return {"satirlar": k["satirlar"]}
    if _motor is False:
        return {"satirlar": [], "desteklenmiyor": True}
    pg = onbellek.al(yol)[sayfa - 1]
    sayfa_sozcukleri = pg.get_text("words")
    gorseller = pg.get_image_info()
    hazirlik = _hazirla(pg, sayfa_sozcukleri, _bolgeler(pg, sayfa_sozcukleri, gorseller), gorseller)
    if not hazirlik["cizimler"]:
        _onbellege(anahtar, _BOS)
        return {"satirlar": []}
    return Ertelenmis(lambda bitir: _calistir(lambda dongu: _tamamla(anahtar, hazirlik, dongu), bitir))


def sozcukler(doc, yol, sayfa, kutular=None):
    """metin_sec için sayfanın görsellerinde tanınan sözcükler (PyMuPDF get_text("words") biçiminde). Önbellekte yoksa tanınır ve
    beklenir (renderer metin katmanını kurarken istediği için çoğunlukla önbellektedir). kutular (seçim, döndürülmemiş düzlemde)
    verilirse ve hiçbiri tanınacak bir bölgeye değmiyorsa tanınmaz, beklenmez: yalnızca PDF metni seçilmiştir."""
    try:
        anahtar = _anahtar(yol, sayfa)
        k = _onbellekten(anahtar)
        if k is None:
            if _motor is False:
                return []
            pg = doc[int(sayfa) - 1]
            sayfa_sozcukleri = pg.get_text("words")
            gorseller = pg.get_image_info()
            bolgeler = _bolgeler(pg, sayfa_sozcukleri, gorseller)
            if not bolgeler:
                _onbellege(anahtar, _BOS)
                return []
            if kutular is not None and not any(secim.intersects(b) for secim in kutular for b in bolgeler):
                return []
            hazirlik = _hazirla(pg, sayfa_sozcukleri, bolgeler, gorseller)
            if not hazirlik["cizimler"]:
                _onbellege(anahtar, _BOS)
                return []
            bitti, sonuc = threading.Event(), {}
            _calistir(lambda dongu: _tamamla(anahtar, hazirlik, dongu), lambda r, hata: (sonuc.update(hata=hata), bitti.set()))
            if not bitti.wait(BEKLEME) or sonuc.get("hata"):
                return []
            k = _onbellekten(anahtar) or _BOS
        return list(k["sozcukler"])
    except Exception as e:
        print("[yazi_tanima] sözcükler alınamadı: %s" % e, file=sys.stderr)
        return []


def satir_yonleri(yol, sayfa):
    """Önbellekteki tanınan satırların yazı yönleri (0.2.4): döndürülmemiş düzlemde birim vektör, satır başına; tanınmamışsa boş.
    metin_sec, seçim tanınan yazıya değince kopyayı hangi düzlemde sıralayacağına bunlarla karar verir (yan taranmış sayfada satırlar
    döndürülmemiş düzlemde dikeydir)."""
    try:
        k = _onbellekten(_anahtar(yol, sayfa))
    except OSError:
        return []
    return list(k.get("yonler", ())) if k else []


def kaydol(yontemler):
    yontemler["ocr_sayfa"] = y_ocr_sayfa
