# -*- coding: utf-8 -*-
"""Dosya biçimi dönüştürme (0.2.6, "Dosya Formatını Değiştir" aracı): TIFF ↔ PDF bu modülde; UDF ↔ PDF ve Word ↔ PDF bu çatıya ayrı
modüllerde eklenir (donusturucu_kaydet, yetenek_kaydet, bilgi_kaydet; islemler/__init__.py onları bu modülden sonra yükler).

Yöntemler (kaydol):
  donusum_yetenekleri {} → {tiff: bool (iki yön de var), udf: {...}, word: {...} (o modüllerin yetenek_kaydet'le verdiği; yoksa
      {var: false, neden}), donusumler: {"<kaynak>><hedef>": {var, neden?}} (ör. "tiff>pdf"), uzantilar: {hedefBicim: [uzantılar]},
      girdiUzantilari: {tür: [uzantılar]} (yalnızca dönüştürülebilen türler; dosya seçme süzgeci için)}
  donusum_bilgi {yol, genislik?=220} → {tur, alt, boyut, sayfa, hedefler: [{bicim, uzantilar, var, neden?}], uyari?, png?,
      pngGenislik?, pngYukseklik?, genislik?, yukseklik? (ilk sayfanın pt ölçüsü), dpi? / dpiKaynagi? (TIFF: 'etiket' | 'a4' |
      'varsayilan')}. Tür UZANTIDAN DEĞİL DOSYANIN İÇERİĞİNDEN (tur_bul): 'pdf' | 'udf' | 'tiff' | 'word' | 'bilinmeyen'; alt: udf 'zip' |
      'xml', word 'docx' | 'docm' | 'doc' | 'rtf' | 'odt' | 'sifreli', tiff 'tiff' | 'bigtiff'. Ön izleme yalnızca PDF (MuPDF) ve TIFF
      (Pillow) için; öteki türlerin baytı ne MuPDF'e ne arayüze gider.
  bicim_donustur {ogeler: [{yol, hedef, hedefBicim, secenekler?}]} → (Ertelenmis; dönüştürme iş parçacığında)
      {sonuclar: [{yol, hedef, hedefBicim, kaynakTur, boyut, sayfa?, ...} | {yol, hedef, hedefBicim, hata, kod}], basarili, hatali}.
      hedefBicim: 'pdf' | 'udf' | 'tiff' | 'word' (Word hedefi .docx); hedefin uzantısı biçimle eşleşmeli (HEDEF_UZANTILARI). Parametre
      hatası (öğe biçimi, uzantı, aynı hedef iki kez, hedef bir kaynağın kendisi) bütün isteği reddeder; içerikle ilgili hata (biçim
      tanınmadı, dönüştürme yok, dosya bozuk / parolalı / kilitli / salt okunur, güvensiz zip) yalnızca o öğenin sonucuna yazılır, öteki
      öğeler sürer. kod: 'bulunamadi' | 'kilitli' | 'salt_okunur' | 'parolali' | 'bozuk' | 'taninmadi' | 'ayni_bicim' |
      'desteklenmiyor' | 'guvensiz' | 'buyuk' | 'gecersiz' | 'zaman_asimi' | 'bellek' | 'hata'. İleti kilitli dosyada
      araclar.KILITLI_METNI'ni, salt okunurda SALT_OKUNUR_METNI'ni içerir (arayüzün hataSor'u bunlarla tanır).
      TIFF hedefinin secenekler'i: {dpi: 200 | 300 (varsayılan 200), renk: 'sb' (siyah-beyaz, G4; varsayılan) | 'gri' | 'renkli' (LZW)}.

Yazım düzeni: her öğe önce hedefin klasöründe geçici dosyaya ("<hedef>.<pid>-<sıra>.pdefe-tmp<uzantı>": uzantı doğru, Word gibi dış
programlar ad değiştirmez) dönüştürülür; BÜTÜN öğeler bitince geçici dosyalar sırayla hedeflerin yerine konur (os.replace; macOS'ta
öznitelikler korunur, araclar._yerine_koy). İptal yerine koymadan önce gelirse hiçbir hedef değişmez, geçici dosyalar silinir; yerine koyma
başladıktan sonra ilerleme bildirilmez, iptale bakılmaz (geç gelen iptal yazılmış dosyayı yazılmamış göstermesin). Hata veren öğenin
geçici dosyası silinir, var olan hedefi değişmez. Var olan hedef salt okunur ya da kilitliyse dönüştürmeden önce o öğe hata alır.
PDF olmayan → PDF olmayan dönüşüm (ör. Word → UDF) geçici PDF üzerinden iki adımda yapılır (geçici klasör iş bitince silinir).

İş parçacıkları: dönüştürmeler tek bir dönüştürme iş parçacığında sırayla çalışır (sıradaki iş "önceki bitince başlayacak" ilerlemesi
alır). MuPDF'e dokunan her adım pdefe_core.mupdf_kilidi içinde yapılır (Baglam.mupdf; PyMuPDF iş parçacığı güvenli değil, işçi de her
isteği bu kilitle işler); Pillow ve dış süreç işi kilitsiz sürer, işçi bu arada küçük resim ve kopyalama isteklerini yanıtlar. Çekirdek
kapanırken (girdi kapanınca, pdefe_core.main) süren iş kısa süre beklenir, bitmezse iptal edilir (kapanirken).

Güvenlik (0.1.23 kuralının devamı): MuPDF'e yalnızca içeriği PDF olan dosya ve yalnızca filetype="pdf" ile verilir; TIFF Pillow ile
okunur (araclar._pillow piksel sınırı, kare başına EN_FAZLA_KARE_PIKSEL); zip tabanlı girdiler (UDF, docx, odt) önce zip_denetle'den
geçer (açılmış boyut, öğe sayısı, sıkıştırma oranı) ve içerikleri zip_oku ile sınırlı okunur. Hedefin uzantısı istenen biçimle
eşleşmeyen istek reddedilir (ana süreç de denetler).

Dönüştürücü yazmak (UDF, Word modülleri): donusturucu_kaydet(kaynak, hedef, islev, hazir=None).
  islev(kaynak_yol, cikti_yol, secenekler, ilerleme, baglam) → dict ({sayfa?, uyari?, ...}; sonuca eklenir). cikti_yol'a yazar (geçici
  dosya; yerine koymayı çatı yapar). ilerleme(oran 0–1, mesaj) iptalde IptalEdildi fırlatır; uzun döngüde sık çağrılmalı (çatı seyreltir).
  baglam: alt (kaynağın alt türü), mupdf() (kilit), denetle() (yalnızca iptal denetimi), gecici_klasor() (iş bitince silinir),
  dis_surec(komut, sure=None, ortam=None, klasor=None, girdi=None) (penceresiz dış süreç; iptal ve süre dolunca süreç ağacıyla öldürülür).
  hazir() → (bool, neden | None): dönüştürmenin bu bilgisayarda yapılıp yapılamayacağı (ör. "Word kurulu değil"); sonucu ön belleğe almak
  hazir'in işidir (her donusum_bilgi ve donusum_yetenekleri çağrısında sorulur).
  yetenek_kaydet(ad, islev): islev() → dict, donusum_yetenekleri'nde ad anahtarıyla (udf, word).
  bilgi_kaydet(tur, islev): islev(yol, alt, genislik[, p]) → dict (sayfa, png, uyari…), donusum_bilgi'nin yanıtına eklenir (p: isteğin
  parametreleri; dört parametreli işleve verilir). Sözlükte ERTELE anahtarı varsa değeri baslat(tamamla) işlevidir: yanıt beklemeden
  dönmez, baslat işi kendi iş parçacığında yapar ve tamamla(ek) ile bitirir (ek sözlüğü yanıta eklenir; işçi beklemez, Ertelenmis).
  ayar_kaydet(islev): islev(p) üç yöntemin her isteğinde parametrelerle çağrılır (ör. UDF modülü ayarlardaki UDE yolunu, udeYolu, alır).
  kapanis_kaydet(islev): çekirdek kapanırken (kapanirken) çağrılır (ör. boştaki dış süreçlerin kapatılması).
  Dönüştürme iş parçacığı yalnızca bu işler içindir: Windows'ta COM gerekirse (Word) CoInitialize(STA) bu iş parçacığında bir kez yapılabilir.

TIFF → PDF: kayıpsız; sayfa ölçüsü taramanın gerçek ölçüsü (tiff_dpi_coz: etiket geçerliyse, 50–1200 dpi, onu; yoksa uzun kenarı A4'ün
uzun kenarına oturtan dpi, standart değere %3 yakınsa ona yuvarlanır; etiketsiz karelerde dosya başına tek değer, ortanca: elle beslenen
taramada ölçü sayfadan sayfaya değişir, sayfalar gerçeğini yansıtır). 1 bit karede sayfa başına CCITT G4 (tek şerit yeniden kodlanmış:
UYAP taramaları 8 satırlık şeritli, PDF'e olduğu gibi kopyalanamaz) ya da Flate'ten küçüğü; gri / renkli kare PNG (MuPDF Flate yazar).
Kareler sırayla okunur, yalnızca biri bellekte durur (150 sayfada tepe ~70 MB; Görüntü / PDF birleştir'in eski yolu 147 sayfada 1,16 GB).
PDF → TIFF: tek dosyada çok sayfa (AppendingTiffWriter, sayfa sayfa); siyah-beyazda sabit eşik (ESIK, titreşimsiz: yazı tanıma ölçümü),
G4; gri / renkli LZW; dpi etiketli. Tek tam sayfa görselden oluşan (taranmış) sayfa görselin kendi çözünürlüğünde çizilir (50–600 dpi):
pikseller yeniden örneklenmez. Ölçümler PLAN.md "Revizyon 0.2.6".
"""
import base64
import io
import math
import os
import queue
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
import time
import zipfile
import zlib

import pymupdf

from . import araclar
from .araclar import KAYIT_SECENEKLERI, KILITLI_METNI, PDF_EN_BUYUK_KENAR, SALT_OKUNUR_METNI

# ---------------------------------------------------------------- biçimler
TURLER = ("pdf", "udf", "tiff", "word")
HEDEF_SIRASI = ("pdf", "udf", "word", "tiff")   # donusum_bilgi'nin hedefler listesinin sırası (aracın biçim seçimi)
HEDEF_UZANTILARI = {"pdf": (".pdf",), "udf": (".udf",), "tiff": (".tif", ".tiff"), "word": (".docx",)}
GIRDI_UZANTILARI = {"pdf": (".pdf",), "udf": (".udf",), "tiff": (".tif", ".tiff"), "word": (".docx", ".docm", ".doc", ".rtf", ".odt")}
EN_FAZLA_OGE = 500

# ---------------------------------------------------------------- güvenlik sınırları
EN_FAZLA_ACIK_BOYUT = 300 * 1024 * 1024   # zip'in açılmış toplam boyutu (bildirilen); UDF ve docx'ler birkaç MB
EN_FAZLA_ZIP_OGESI = 10_000
EN_FAZLA_ZIP_ORANI = 200                  # 1 MB'tan büyük öğede açılmış / sıkıştırılmış (XML ~5–20 kat sıkışır)
OLE2_TARAMA = 64 * 1024 * 1024            # eski Word (.doc) imzası için taranan en çok bayt

# ---------------------------------------------------------------- TIFF ölçüleri
DPI_EN_AZ, DPI_EN_COK = 50.0, 1200.0     # geçerli çözünürlük etiketi
A4_UZUN_KENAR_INC = araclar.A4_YUKSEKLIK / 72.0   # 11,69 inç
STANDART_DPI = (100, 150, 200, 240, 250, 300, 400, 600)
STANDART_YAKINLIK = 0.03
VARSAYILAN_DPI = 72.0                     # etiketsiz ve A4 kuralı 50 dpi'den az veriyorsa (küçük görsel): piksel = pt
EN_FAZLA_KARE_PIKSEL = 400_000_000        # araclar._pillow'un Image.MAX_IMAGE_PIXELS'ı; kare başına ayrıca denetlenir
FLATE_DUZEYI = 6                          # 9 ölçümde ~%6 küçük, 10 kat yavaş

# ---------------------------------------------------------------- PDF → TIFF
TIFF_DPILERI = (200, 300)
VARSAYILAN_TIFF_DPI = 200
TIFF_RENKLERI = ("sb", "gri", "renkli")
ESIK = 160                                # siyah-beyaz: gri değer bundan büyükse beyaz (128 ve titreşim 150 dpi'de okunurluğu düşürüyordu)
ESIK_TABLOSU = [0] * (ESIK + 1) + [255] * (255 - ESIK)
TARAMA_KAPLAMA = 0.95                     # en büyük görsel sayfanın bu kadarını kaplıyorsa sayfa taranmış sayılır
TARAMA_DPI_EN_AZ, TARAMA_DPI_EN_COK = 50.0, 600.0
ONBELLEK_BOSALTMA = 8                     # PDF → TIFF: bu kadar sayfada bir MuPDF'in ön belleği boşaltılır. Çözülen sayfa görselleri
                                          # orada kalıyor (sınırı 256 MB): 150 sayfalık taramada tepe 321 → 95 MB; her görsel bir kez çizilir

YAZIM_PAYI = 95                           # yüzde: dönüştürme 0–95; yerine koyma bildirilmez


class OgeHatasi(Exception):
    """Bir öğenin dönüştürülemeyişi (yalnızca o öğenin sonucuna yazılır): kod + Türkçe ileti."""

    def __init__(self, kod, mesaj):
        super().__init__(mesaj)
        self.kod = kod


def _cekirdek():
    return araclar._cekirdek()


def _iptal_siniflari():
    return (_cekirdek().IptalEdildi, InterruptedError)


def _mupdf_kilidi():
    kilit = getattr(_cekirdek(), "mupdf_kilidi", None)
    return kilit if kilit is not None else _yedek_kilit


_yedek_kilit = threading.RLock()


def _sil(yol):
    if yol and os.path.exists(yol):
        try:
            os.remove(yol)
        except OSError:
            pass


# ---------------------------------------------------------------- tür tespiti (imza)
def _zip_turu(yol):
    """Zip girdisinin türü: (tur, alt) ya da None. Yalnızca ad listesi ve iki öğenin ilk baytları okunur (zip bombası açılmaz; güvenlik
    denetimi dönüştürmeden ve ön izlemeden önce zip_denetle)."""
    with zipfile.ZipFile(yol) as zf:
        adlar = set(zf.namelist())
        if "mimetype" in adlar:
            mime = zip_oku(zf, "mimetype", 256, kes=True).strip()
            if mime.startswith(b"application/vnd.oasis.opendocument.text"):
                return "word", "odt"
        if "word/document.xml" in adlar:
            return "word", ("docm" if "word/vbaProject.bin" in adlar else "docx")
        if "content.xml" in adlar and b"<template" in zip_oku(zf, "content.xml", 64 * 1024, kes=True):
            return "udf", "zip"
    return None


def _ole2_turu(yol):
    """Eski Office dosyası (OLE2): dizin girdilerinin UTF-16 adları aranır ("WordDocument" akışı .doc'ta; "EncryptedPackage" parolalı
    docx'te). Tam dizin çözümlemesi gerekmez: adlar dosyada düz durur."""
    aranan = {"WordDocument".encode("utf-16-le"): ("word", "doc"), "EncryptedPackage".encode("utf-16-le"): ("word", "sifreli")}
    pay = max(len(a) for a in aranan)
    onceki = b""
    okunan = 0
    with open(yol, "rb") as f:
        while okunan < OLE2_TARAMA:
            parca = f.read(1 << 20)
            if not parca:
                break
            okunan += len(parca)
            pencere = onceki + parca
            for imza, tur in aranan.items():
                if imza in pencere:
                    return tur
            onceki = pencere[-pay:]
    return None


def tur_bul(yol):
    """Dosyanın türü içeriğinden (uzantıya bakılmaz): (tur, alt). tur 'pdf' | 'udf' | 'tiff' | 'word' | 'bilinmeyen'.
    PDF: ilk 1024 baytta '%PDF-' (MuPDF başta çöp kabul eder). TIFF: 'II*\\0' / 'MM\\0*' (BigTIFF '+'). Zip: mimetype ODF metni → odt,
    word/document.xml → docx (vbaProject.bin varsa docm), content.xml'de <template → UDF. OLE2 → doc. '{\\rtf' → rtf. Düz XML'de
    <template → UDF (format 1.7'nin zip'siz biçimi). Kilitli dosyada PermissionError (KILITLI_METNI)."""
    araclar._dosya_var(yol)
    try:
        with open(yol, "rb") as f:
            bas = f.read(8192)
    except PermissionError:
        raise PermissionError("Dosya okunamadı; %s: %s" % (KILITLI_METNI, os.path.basename(yol)))
    if bas[:4] in (b"II*\x00", b"MM\x00*"):
        return "tiff", "tiff"
    if bas[:4] in (b"II+\x00", b"MM\x00+"):
        return "tiff", "bigtiff"
    if b"%PDF-" in bas[:1024]:
        return "pdf", None
    if bas[:4] in (b"PK\x03\x04", b"PK\x05\x06"):
        try:
            tur = _zip_turu(yol)
        except (zipfile.BadZipFile, OSError, OgeHatasi, KeyError, RuntimeError, NotImplementedError):
            tur = None
        return tur or ("bilinmeyen", "zip")
    if bas[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return _ole2_turu(yol) or ("bilinmeyen", "ole2")
    metin = bas
    if metin[:3] == b"\xef\xbb\xbf":
        metin = metin[3:]
    elif metin[:2] in (b"\xff\xfe", b"\xfe\xff"):
        try:
            metin = metin.decode("utf-16", "ignore").encode("utf-8", "replace")
        except UnicodeError:
            metin = b""
    metin = metin.lstrip()
    if metin.startswith(b"{\\rtf"):
        return "word", "rtf"
    if metin.startswith(b"<") and b"<template" in metin:
        return "udf", "xml"
    return "bilinmeyen", None


# ---------------------------------------------------------------- zip güvenliği
def zip_denetle(yol):
    """Zip'i açmadan önce güvenlik denetimi: öğe sayısı, bildirilen açılmış toplam boyut, büyük öğede sıkıştırma oranı (zip bombası).
    Geçmezse OgeHatasi('guvensiz'). Bildirilen boyut yalan olabilir: içerik zip_oku ile sınırlı okunur."""
    try:
        with zipfile.ZipFile(yol) as zf:
            bilgiler = zf.infolist()
    except zipfile.BadZipFile as e:
        raise OgeHatasi("bozuk", "Dosya bozuk; açılamadı (%s): %s" % (os.path.basename(yol), e))
    ad = os.path.basename(yol)
    if len(bilgiler) > EN_FAZLA_ZIP_OGESI:
        raise OgeHatasi("guvensiz", "Dosyada çok fazla parça var (%d); güvenli açılamaz: %s" % (len(bilgiler), ad))
    toplam = 0
    for b in bilgiler:
        toplam += b.file_size
        if b.file_size > 1024 * 1024 and b.file_size > EN_FAZLA_ZIP_ORANI * max(b.compress_size, 1):
            raise OgeHatasi("guvensiz", "Dosyanın bir parçası açılınca olağan dışı büyüyor; güvenli açılamaz: %s" % ad)
    if toplam > EN_FAZLA_ACIK_BOYUT:
        raise OgeHatasi("guvensiz", "Dosya açılınca %s geçiyor; güvenli açılamaz: %s" % (_boyut_metni(EN_FAZLA_ACIK_BOYUT), ad))


def _boyut_metni(bayt):
    return "%d MB'ı" % (bayt // (1024 * 1024)) if bayt >= 1024 * 1024 else "%d KB'ı" % max(1, bayt // 1024)


def zip_oku(zf, ad, en_fazla=EN_FAZLA_ACIK_BOYUT, kes=False):
    """Zip öğesini en çok en_fazla bayt açarak okur. kes=True ise ilk en_fazla baytı döner; değilse sınır aşılınca OgeHatasi('guvensiz')
    (bildirilen boyutu küçük gösteren zip bombasına karşı: açma parça parça, sınırda durur)."""
    parcalar, okunan = [], 0
    with zf.open(ad) as f:
        while True:
            parca = f.read(min(1 << 20, en_fazla + 1 - okunan))
            if not parca:
                break
            okunan += len(parca)
            if okunan > en_fazla:
                if kes:
                    parcalar.append(parca[:len(parca) - (okunan - en_fazla)])
                    break
                raise OgeHatasi("guvensiz", "Dosyanın bir parçası açılınca %s geçiyor; güvenli açılamaz." % _boyut_metni(en_fazla))
            parcalar.append(parca)
    return b"".join(parcalar)


def _girdi_denetle(yol, tur, alt):
    """Dönüştürmeden ve ön izlemeden önce girdinin güvenlik denetimi (zip tabanlı türler)."""
    if alt in ("zip", "docx", "docm", "odt"):
        zip_denetle(yol)


# ---------------------------------------------------------------- dönüştürücü kaydı
class _Donusturucu:
    def __init__(self, kaynak, hedef, islev, hazir):
        self.kaynak, self.hedef, self.islev, self._hazir = kaynak, hedef, islev, hazir

    def hazir(self):
        if self._hazir is None:
            return True, None
        try:
            sonuc = self._hazir()
        except Exception as e:   # hazırlık denetimi bozuksa dönüştürme kapalı görünür, çekirdek düşmez
            return False, "Denetlenemedi: %s" % e
        if isinstance(sonuc, tuple):
            return bool(sonuc[0]), (sonuc[1] if len(sonuc) > 1 else None)
        return bool(sonuc), None


_DONUSTURUCULER = {}   # (kaynak, hedef) → _Donusturucu
_YETENEKLER = {}       # ad → islev() → dict
_BILGILER = {}         # tür → islev(yol, alt, genislik[, p]) → dict
_AYARLAR = []          # islev(p): isteğin parametrelerindeki ayarlar
_KAPANISLAR = []       # islev(): çekirdek kapanırken
ERTELE = "_ertele"     # bilgi işlevinin sözlüğünde: baslat(tamamla) (bkz. modül belgesi)


def donusturucu_kaydet(kaynak, hedef, islev, hazir=None):
    """(kaynak türü, hedef biçimi) için dönüştürücü kaydeder (bkz. modül belgesi). Aynı çifte yeniden kayıt öncekini değiştirir."""
    if kaynak not in TURLER or hedef not in HEDEF_UZANTILARI or kaynak == hedef:
        raise ValueError("Geçersiz dönüştürme: %r → %r" % (kaynak, hedef))
    _DONUSTURUCULER[(kaynak, hedef)] = _Donusturucu(kaynak, hedef, islev, hazir)


def yetenek_kaydet(ad, islev):
    _YETENEKLER[ad] = islev


def bilgi_kaydet(tur, islev):
    _BILGILER[tur] = islev


def ayar_kaydet(islev):
    if islev not in _AYARLAR:
        _AYARLAR.append(islev)


def kapanis_kaydet(islev):
    if islev not in _KAPANISLAR:
        _KAPANISLAR.append(islev)


def _ayarlari_uygula(p):
    for islev in _AYARLAR:
        try:
            islev(p)
        except Exception as e:   # bozuk ayar isteği düşürmesin
            print("[donustur] ayar uygulanamadı: %s" % e, file=sys.stderr)


def _parametre_sayisi(islev):
    try:
        import inspect
        return len(inspect.signature(islev).parameters)
    except (TypeError, ValueError):
        return 3


def _plan(kaynak, hedef):
    """Dönüştürmenin adımları [_Donusturucu]: doğrudan ya da PDF olmayan → PDF olmayan için geçici PDF üzerinden iki adım."""
    if kaynak == hedef:
        raise OgeHatasi("ayni_bicim", "Dosya zaten bu biçimde.")
    d = _DONUSTURUCULER.get((kaynak, hedef))
    if d:
        return [d]
    if kaynak not in ("pdf", "bilinmeyen") and hedef != "pdf":
        a, b = _DONUSTURUCULER.get((kaynak, "pdf")), _DONUSTURUCULER.get(("pdf", hedef))
        if a and b:
            return [a, b]
    raise OgeHatasi("desteklenmiyor", "Bu dönüştürme yapılamıyor: %s → %s." % (_TUR_ADLARI.get(kaynak, kaynak), _TUR_ADLARI.get(hedef, hedef)))


_TUR_ADLARI = {"pdf": "PDF", "udf": "UDF", "tiff": "TIFF", "word": "Word", "bilinmeyen": "tanınmayan biçim"}


def _plan_hazir(plan):
    for d in plan:
        ok, neden = d.hazir()
        if not ok:
            return False, neden
    return True, None


def _hedefler(tur):
    """Bu türden yapılabilen dönüştürmeler: [{bicim, uzantilar, var, neden?}] (HEDEF_SIRASI sırasıyla)."""
    sonuc = []
    for h in HEDEF_SIRASI:
        if h == tur:
            continue
        try:
            plan = _plan(tur, h)
        except OgeHatasi:
            continue
        ok, neden = _plan_hazir(plan)
        oge = {"bicim": h, "uzantilar": list(HEDEF_UZANTILARI[h]), "var": ok}
        if neden:
            oge["neden"] = neden
        sonuc.append(oge)
    return sonuc


# ---------------------------------------------------------------- dönüştürme iş parçacığı
_kuyruk = queue.Queue()
_is_parcacigi = None
_durum = threading.Condition()
_bekleyen = 0                      # sıradaki + süren iş sayısı
_kapaniyor = threading.Event()     # çekirdek kapanıyor: süren ve sıradaki işler iptal edilir


def _calistir(is_, bitir):
    """is_() dönüştürme iş parçacığında çalışır; bitince bitir(sonuc, hata). Döner: işten önce sırada bekleyen iş sayısı."""
    global _is_parcacigi, _bekleyen
    with _durum:
        onceki = _bekleyen
        _bekleyen += 1
        if _is_parcacigi is None:
            _is_parcacigi = threading.Thread(target=_dongu, name="donusturme", daemon=True)
            _is_parcacigi.start()
    _kuyruk.put((is_, bitir))
    return onceki


def _dongu():
    global _bekleyen
    while True:
        is_, bitir = _kuyruk.get()
        try:
            sonuc, hata = is_(), None
        except Exception as e:
            sonuc, hata = None, e
        try:   # bitir yanıt yazar; yazamasa da iş parçacığı ölmemeli
            bitir(sonuc, hata)
        except Exception as e:
            print("[donustur] yanıt yazılamadı: %s" % e, file=sys.stderr)
        finally:
            with _durum:
                _bekleyen -= 1
                _durum.notify_all()


def _bosta_bekle(sure):
    with _durum:
        return _durum.wait_for(lambda: _bekleyen == 0, timeout=sure)


def kapanirken(bekle=2.0, temizlik=3.0):
    """Çekirdek kapanırken (pdefe_core.main): süren dönüştürme en çok `bekle` sn beklenir; bitmezse iptal edilir ve geçici dosyaların
    silinmesi için en çok `temizlik` sn daha beklenir."""
    if _is_parcacigi is not None and not _bosta_bekle(bekle):
        _kapaniyor.set()
        _bosta_bekle(temizlik)
    for islev in _KAPANISLAR:
        try:
            islev()
        except Exception as e:
            print("[donustur] kapanış işi: %s" % e, file=sys.stderr)


# ---------------------------------------------------------------- ilerleme ve bağlam
class _Ilerleme:
    """İşin ilerlemesi: öğe ve adım payları yüzdeye çevrilir, bildirim seyreltilir (yüzde değişince ya da 0,25 sn'de bir); her çağrıda
    iptale bakılır (kapanış dâhil)."""

    def __init__(self, p):
        self._yaz = p.get("_ilerleme") if callable(p.get("_ilerleme")) else None
        self._iptal_mi = p.get("_iptal_mi") if callable(p.get("_iptal_mi")) else None
        self.n, self.i, self.ad = 1, 0, ""
        self.adim, self.adim_sayisi = 0, 1
        self._son_yuzde, self._son_zaman = -1, 0.0

    def denetle(self):
        if _kapaniyor.is_set() or (self._iptal_mi is not None and self._iptal_mi()):
            raise _cekirdek().IptalEdildi()

    def oge(self, i, n, ad):
        self.i, self.n, self.ad, self.adim, self.adim_sayisi = i, n, ad, 0, 1

    def bildir(self, oran, mesaj=""):
        self.denetle()
        oran = min(max(float(oran or 0), 0.0), 1.0)
        yuzde = int(YAZIM_PAYI * (self.i + (self.adim + oran) / self.adim_sayisi) / max(self.n, 1))
        simdi = time.monotonic()
        if self._yaz is None or (yuzde == self._son_yuzde and simdi - self._son_zaman < 0.25):
            return
        self._son_yuzde, self._son_zaman = yuzde, simdi
        on = ("(%d/%d) " % (self.i + 1, self.n)) if self.n > 1 else ""
        self._yaz(yuzde, on + self.ad + (": " + mesaj if mesaj else ""))


class Baglam:
    """Dönüştürücüye verilen bağlam (bkz. modül belgesi)."""

    def __init__(self, alt, ilerleme):
        self.alt = alt
        self._ilerleme = ilerleme
        self._gecici = None

    def mupdf(self):
        return _mupdf_kilidi()

    def denetle(self):
        self._ilerleme.denetle()

    def gecici_klasor(self):
        if self._gecici is None:
            self._gecici = tempfile.mkdtemp(prefix="pdefe-donustur-")
        return self._gecici

    def temizle(self):
        if self._gecici:
            shutil.rmtree(self._gecici, ignore_errors=True)
            self._gecici = None

    def dis_surec(self, komut, sure=None, ortam=None, klasor=None, girdi=None):
        """Dış programı penceresiz çalıştırır, iptale bakarak (0,25 sn'de bir) bitmesini bekler. Döner: (çıkış kodu, stdout, stderr)
        bayt. İptalde IptalEdildi, sure (sn) dolunca TimeoutError; ikisinde de süreç (Windows'ta alt süreçleriyle) öldürülür."""
        bayrak = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        p = subprocess.Popen(komut, stdin=subprocess.PIPE if girdi is not None else subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, env=ortam, cwd=klasor, creationflags=bayrak)
        bas = time.monotonic()
        veri = girdi
        try:
            while True:
                try:
                    cikti, hata = p.communicate(input=veri, timeout=0.25)
                    return p.returncode, cikti, hata
                except subprocess.TimeoutExpired:
                    veri = None   # girdi yalnızca ilk çağrıda verilir
                    self.denetle()
                    if sure is not None and time.monotonic() - bas > sure:
                        raise TimeoutError("%s %d saniyede bitmedi." % (os.path.basename(str(komut[0])), sure))
        except BaseException:
            _surec_oldur(p)
            raise


def _surec_oldur(p):
    if p.poll() is not None:
        return
    if os.name == "nt":
        try:
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(p.pid)], capture_output=True, timeout=10,
                           creationflags=subprocess.CREATE_NO_WINDOW)
        except Exception:
            pass
    try:
        p.kill()
    except OSError:
        pass
    try:
        p.communicate(timeout=5)
    except Exception:
        pass


# ---------------------------------------------------------------- yöntemler
def _genislik(p):
    try:
        g = int(p.get("genislik") or 220)
    except (TypeError, ValueError):
        g = 220
    return max(16, min(g, 1024))


def y_donusum_yetenekleri(p):
    _ayarlari_uygula(p)
    donusumler = {}
    for k in TURLER:
        for h in HEDEF_SIRASI:
            if k == h:
                continue
            try:
                plan = _plan(k, h)
            except OgeHatasi:
                continue
            ok, neden = _plan_hazir(plan)
            donusumler["%s>%s" % (k, h)] = dict({"var": ok}, **({"neden": neden} if neden else {}))
    girdiler = {t: list(GIRDI_UZANTILARI[t]) for t in TURLER if any(a.startswith(t + ">") and v["var"] for a, v in donusumler.items())}
    sonuc = {
        "turler": list(TURLER),
        "uzantilar": {b: list(u) for b, u in HEDEF_UZANTILARI.items()},
        "girdiUzantilari": girdiler,
        "donusumler": donusumler,
        "tiff": bool(donusumler.get("tiff>pdf", {}).get("var") and donusumler.get("pdf>tiff", {}).get("var")),
    }
    for ad in ("udf", "word"):
        islev = _YETENEKLER.get(ad)
        if islev is None:
            sonuc[ad] = {"var": False, "neden": "Bu sürümde yok."}
            continue
        try:
            sonuc[ad] = islev()
        except Exception as e:
            sonuc[ad] = {"var": False, "neden": "Denetlenemedi: %s" % e}
    return sonuc


def _pdf_bilgi(yol, genislik):
    doc = araclar._onbellekten_al(yol)   # yalnızca PDF (filetype="pdf"); işçi iş parçacığında (MuPDF kilidi işçide)
    if doc.needs_pass:
        return {"sayfa": None, "uyari": "Belge parolayla korunuyor; dönüştürülemez."}
    if doc.page_count == 0:
        return {"sayfa": 0, "uyari": "Belgede sayfa yok."}
    pg = doc[0]
    r = pg.rect
    olcek = _cekirdek().olcek_sinirla(r.width, r.height, float(genislik) / max(r.width, 1))
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), annots=True, alpha=False)
    return {"sayfa": doc.page_count, "genislik": round(r.width, 2), "yukseklik": round(r.height, 2),
            "png": base64.b64encode(pix.tobytes("png")).decode("ascii"), "pngGenislik": pix.width, "pngYukseklik": pix.height}


def _tiff_bilgi(yol, genislik):
    Image = araclar._pillow()[0]
    im = _tiff_ac(yol)
    try:
        olculer = _tiff_olculeri(im)
        dpiler = tiff_dpi_coz([(g, y, e) for g, y, e, _ in olculer])
        im.seek(0)
        _kare_sinirla(im, 1)
        kare = _yon_uygula(im)
        xd, yd, kaynak = _yona_gore_dpi(dpiler[0], olculer[0][3])
        sg, sy = _tiff_sayfa_olcusu(kare.width, kare.height, xd, yd)
        kucuk = kare.convert("L") if kare.mode == "1" else araclar._duzlestir(kare, exif=False)
        if kucuk.mode not in ("RGB", "L"):
            kucuk = kucuk.convert("RGB")
        if kucuk.width > genislik:
            kat = kucuk.width // (2 * genislik)
            if kat >= 2:
                kucuk = kucuk.reduce(kat)
            kucuk = kucuk.resize((genislik, max(1, int(round(kucuk.height * genislik / kucuk.width)))), Image.LANCZOS)
        buf = io.BytesIO()
        kucuk.save(buf, format="PNG", optimize=True)
        return {"sayfa": len(olculer), "genislik": round(sg, 2), "yukseklik": round(sy, 2), "dpi": round(xd, 1), "dpiKaynagi": kaynak,
                "png": base64.b64encode(buf.getvalue()).decode("ascii"), "pngGenislik": kucuk.width, "pngYukseklik": kucuk.height}
    finally:
        im.close()


def y_donusum_bilgi(p):
    _ayarlari_uygula(p)
    yol = araclar._mutlak(p.get("yol"))
    genislik = _genislik(p)
    tur, alt = tur_bul(yol)
    sonuc = {"tur": tur, "alt": alt, "boyut": os.path.getsize(yol), "sayfa": None, "hedefler": _hedefler(tur)}
    if tur == "bilinmeyen":
        sonuc["uyari"] = "Dosyanın biçimi tanınmadı. PDF, UDF, TIFF ve Word dosyaları dönüştürülebilir."
        return sonuc
    ertele = None
    try:
        _girdi_denetle(yol, tur, alt)
        if tur == "pdf":
            sonuc.update(_pdf_bilgi(yol, genislik))
        elif tur == "tiff":
            sonuc.update(_tiff_bilgi(yol, genislik))
        islev = _BILGILER.get(tur)
        if islev is not None:
            ek = (islev(yol, alt, genislik, p) if _parametre_sayisi(islev) >= 4 else islev(yol, alt, genislik)) or {}
            ertele = ek.pop(ERTELE, None)
            sonuc.update(ek)
    except PermissionError:
        raise
    except OgeHatasi as e:
        sonuc["uyari"] = str(e)
        if e.kod in ("guvensiz", "bozuk"):
            for h in sonuc["hedefler"]:
                h["var"], h["neden"] = False, str(e)
    except Exception as e:
        sonuc["uyari"] = "Dosya okunamadı: %s" % e
    if ertele is None:
        return sonuc

    def baslat(bitir):
        def tamamla(ek):
            bitir(dict(sonuc, **(ek or {})), None)
        try:
            ertele(tamamla)
        except Exception as e:   # ertelenen iş başlatılamazsa bilgi yine döner
            print("[donustur] ertelenen bilgi başlatılamadı: %s" % e, file=sys.stderr)
            bitir(sonuc, None)
    return _cekirdek().Ertelenmis(baslat)


def _yol_anahtari(yol):
    """Aynı dosyanın yazımları için karşılaştırma anahtarı: Windows'ta ve macOS'ta (varsayılan dosya sistemi) büyük / küçük harf ayrılmaz."""
    yol = os.path.normcase(os.path.abspath(yol))
    return yol.lower() if sys.platform == "darwin" else yol


def _ogeleri_hazirla(ogeler):
    """bicim_donustur'un parametre denetimi (eş zamanlı; hata bütün isteği reddeder). Döner: [{yol, hedef, hedefBicim, secenekler}]."""
    if not isinstance(ogeler, list) or not ogeler:
        raise ValueError("Dönüştürülecek dosya yok.")
    if len(ogeler) > EN_FAZLA_OGE:
        raise ValueError("Bir seferde en çok %d dosya dönüştürülebilir." % EN_FAZLA_OGE)
    hazir, hedefler, kaynaklar = [], set(), set()
    for i, oge in enumerate(ogeler):
        if not isinstance(oge, dict):
            raise ValueError("Öğe %d geçersiz." % (i + 1))
        yol = araclar._mutlak(oge.get("yol"), "yol")
        hedef = araclar._mutlak(oge.get("hedef"), "hedef")
        bicim = oge.get("hedefBicim")
        if bicim not in HEDEF_UZANTILARI:
            raise ValueError("Bilinmeyen hedef biçimi: %r" % (bicim,))
        uzantilar = HEDEF_UZANTILARI[bicim]
        if os.path.splitext(hedef)[1].lower() not in uzantilar:
            raise ValueError("%s dosyasının uzantısı %s olmalı: %s" % (_TUR_ADLARI[bicim], " ya da ".join(uzantilar), os.path.basename(hedef)))
        secenekler = oge.get("secenekler") or {}
        if not isinstance(secenekler, dict):
            raise ValueError("Öğe %d: seçenekler geçersiz." % (i + 1))
        anahtar = _yol_anahtari(hedef)
        if anahtar in hedefler:
            raise ValueError("Aynı hedef dosya iki kez verildi: %s" % os.path.basename(hedef))
        hedefler.add(anahtar)
        kaynaklar.add(_yol_anahtari(yol))
        hazir.append({"yol": yol, "hedef": hedef, "hedefBicim": bicim, "secenekler": dict(secenekler)})
    # Hedef hiçbir kaynağın yerine yazılamaz (aynı dosyanın başka yazımı ya da bağlantısı dâhil): kaynak dönüştürülmeden ezilirdi
    kimlikler = set()
    for oge in hazir:
        try:
            st = os.stat(oge["yol"])
            kimlikler.add((st.st_dev, st.st_ino))
        except OSError:
            pass
    for oge in hazir:
        ayni = _yol_anahtari(oge["hedef"]) in kaynaklar
        if not ayni and os.path.exists(oge["hedef"]):
            st = os.stat(oge["hedef"])
            ayni = st.st_ino != 0 and (st.st_dev, st.st_ino) in kimlikler
        if ayni:
            raise ValueError("Dönüştürülen dosya kaynak dosyalardan birinin yerine yazılamaz: %s" % os.path.basename(oge["hedef"]))
    return hazir


def _gecici_cikti(hedef, sira):
    return "%s.%d-%d.pdefe-tmp%s" % (hedef, os.getpid(), sira, os.path.splitext(hedef)[1])


def _hedef_denetle(hedef):
    """Var olan hedef yazılabilir mi (uzun dönüştürmeden ÖNCE): klasörse, salt okunursa ya da başka programda açıksa hata."""
    ad = os.path.basename(hedef)
    if os.path.isdir(hedef):
        raise OgeHatasi("gecersiz", "Hedef bir klasör: %s" % ad)
    if not os.path.exists(hedef):
        return
    if araclar._salt_okunur_mu(hedef):
        raise PermissionError("Dosya yazılamadı; %s: %s" % (SALT_OKUNUR_METNI, ad))
    try:
        with open(hedef, "r+b"):
            pass
    except PermissionError:
        raise PermissionError("Dosya yazılamadı; %s: %s" % (KILITLI_METNI, ad))


def _hata_kodu(e):
    if isinstance(e, OgeHatasi):
        return e.kod
    m = str(e)
    if isinstance(e, PermissionError):
        if "parola" in m.lower():
            return "parolali"
        return "salt_okunur" if SALT_OKUNUR_METNI in m else "kilitli"
    if isinstance(e, FileNotFoundError):
        return "bulunamadi"
    if isinstance(e, MemoryError):
        return "bellek"
    if isinstance(e, TimeoutError):
        return "zaman_asimi"
    return "hata"


def _hata_metni(e, ad):
    if isinstance(e, (OgeHatasi, PermissionError, FileNotFoundError, TimeoutError, ValueError)) and str(e):
        return str(e)
    if isinstance(e, MemoryError):
        return "Bellek yetmedi: %s" % ad
    return "%s dönüştürülemedi: %s" % (ad, e or type(e).__name__)


def _ogeyi_donustur(oge, sira, il):
    """Bir öğeyi geçici çıktıya dönüştürür. Döner: (geçici yol, bilgi dict). Hata ya da iptalde geçici dosyalar silinir."""
    tur, alt = tur_bul(oge["yol"])
    if tur == "bilinmeyen":
        raise OgeHatasi("taninmadi", "Dosyanın biçimi tanınmadı: %s" % os.path.basename(oge["yol"]))
    _girdi_denetle(oge["yol"], tur, alt)
    plan = _plan(tur, oge["hedefBicim"])
    ok, neden = _plan_hazir(plan)
    if not ok:
        raise OgeHatasi("desteklenmiyor", neden or "Bu dönüştürme bu bilgisayarda yapılamıyor.")
    _hedef_denetle(oge["hedef"])
    araclar._hedef_klasoru_hazirla(oge["hedef"])
    gecici = _gecici_cikti(oge["hedef"], sira)
    baglam = Baglam(alt, il)
    bilgi = {"kaynakTur": tur}
    try:
        kaynak = oge["yol"]
        il.adim_sayisi = len(plan)
        for k, d in enumerate(plan):
            il.adim = k
            if k < len(plan) - 1:
                cikti = os.path.join(baglam.gecici_klasor(), "ara-%d%s" % (k, HEDEF_UZANTILARI[d.hedef][0]))
            else:
                cikti = gecici
            baglam.alt = alt if k == 0 else None
            r = d.islev(kaynak, cikti, oge["secenekler"], il.bildir, baglam)
            if isinstance(r, dict):
                bilgi.update(r)
            if not os.path.isfile(cikti):
                raise OgeHatasi("hata", "Dönüştürme çıktı üretmedi: %s" % os.path.basename(oge["yol"]))
            kaynak = cikti
        il.bildir(1.0)
        return gecici, bilgi
    except BaseException:
        _sil(gecici)
        raise
    finally:
        baglam.temizle()


def _isi_yap(ogeler, il):
    n = len(ogeler)
    sonuclar = [None] * n
    hazirlar = []   # (sıra, geçici yol, bilgi)
    iptaller = _iptal_siniflari()
    try:
        for i, oge in enumerate(ogeler):
            il.oge(i, n, os.path.basename(oge["yol"]))
            il.bildir(0)
            try:
                gecici, bilgi = _ogeyi_donustur(oge, i, il)
                hazirlar.append((i, gecici, bilgi))
            except iptaller:
                raise
            except Exception as e:
                if not isinstance(e, (OgeHatasi, PermissionError, FileNotFoundError)):
                    print("[donustur] %s: %r" % (os.path.basename(oge["yol"]), e), file=sys.stderr)
                sonuclar[i] = {"yol": oge["yol"], "hedef": oge["hedef"], "hedefBicim": oge["hedefBicim"],
                               "hata": _hata_metni(e, os.path.basename(oge["yol"])), "kod": _hata_kodu(e)}
    except BaseException:
        for _, gecici, _ in hazirlar:
            _sil(gecici)
        raise
    # Yerine koyma: bundan sonra iptale bakılmaz, ilerleme bildirilmez
    for i, gecici, bilgi in hazirlar:
        oge = ogeler[i]
        try:
            with _mupdf_kilidi():
                araclar._onbellekten_birak(oge["hedef"])   # hedef açık bir sekmenin PDF'i olabilir (Windows'ta açık tanıtıcı yer değiştirmeyi engeller)
            araclar._yerine_koy(gecici, oge["hedef"])
            sonuclar[i] = dict({"yol": oge["yol"], "hedef": oge["hedef"], "hedefBicim": oge["hedefBicim"],
                                "boyut": os.path.getsize(oge["hedef"])}, **bilgi)
        except Exception as e:
            sonuclar[i] = {"yol": oge["yol"], "hedef": oge["hedef"], "hedefBicim": oge["hedefBicim"],
                           "hata": _hata_metni(e, os.path.basename(oge["yol"])), "kod": _hata_kodu(e)}
        finally:
            _sil(gecici)
    basarili = sum(1 for s in sonuclar if "hata" not in s)
    return {"sonuclar": sonuclar, "basarili": basarili, "hatali": n - basarili}


def y_bicim_donustur(p):
    _ayarlari_uygula(p)
    ogeler = _ogeleri_hazirla(p.get("ogeler"))
    il = _Ilerleme(p)
    Ertelenmis = _cekirdek().Ertelenmis

    def baslat(bitir):
        onceki = _calistir(lambda: _isi_yap(ogeler, il), bitir)
        if onceki and il._yaz is not None:
            try:
                il._yaz(0, "Önceki dönüştürme bitince başlayacak…")
            except _iptal_siniflari():
                pass   # iş başlayınca iptali görür
    return Ertelenmis(baslat)


# ---------------------------------------------------------------- TIFF yardımcıları
_YON_DONUSUMLERI = None


def _yon_uygula(kare):
    """Seçili TIFF karesini çözer ve Orientation etiketine (274) göre görünen yönüne çevirir (EXIF yönüyle aynı kural). Pillow 12 yönü
    karenin çözümünde kendisi uygulayıp etiketi siliyor (boyutu da çözmeden önce görünen yönle veriyor); eski sürümler uygulamıyordu:
    çözümden sonra etiket duruyorsa yön burada uygulanır, iki kez çevrilmez. Çözünürlük için asıl yön _tiff_olculeri'nden (çözümden önce)."""
    global _YON_DONUSUMLERI
    if _YON_DONUSUMLERI is None:
        Image = araclar._pillow()[0]
        T = Image.Transpose
        _YON_DONUSUMLERI = {2: T.FLIP_LEFT_RIGHT, 3: T.ROTATE_180, 4: T.FLIP_TOP_BOTTOM, 5: T.TRANSPOSE, 6: T.ROTATE_270,
                            7: T.TRANSVERSE, 8: T.ROTATE_90}
    kare.load()
    try:
        kalan = int(kare.tag_v2.get(274, 1) or 1)
    except (AttributeError, TypeError, ValueError):
        kalan = 1
    islem = _YON_DONUSUMLERI.get(kalan)
    return kare.transpose(islem) if islem is not None else kare


def _yona_gore_dpi(dpi, yon):
    """Kare 90 / 270 derece çevrilince (yön 5–8) yatay ve dikey çözünürlük yer değiştirir."""
    xd, yd, kaynak = dpi
    return (yd, xd, kaynak) if yon in (5, 6, 7, 8) else (xd, yd, kaynak)


def _etiket_dpi(kare):
    """Karenin çözünürlük etiketi (x, y dpi) ya da None: birim inç (yoksa TIFF'in varsayılanı inç) ya da cm, ikisi de 50–1200."""
    t = getattr(kare, "tag_v2", None)
    if t is None:
        return None
    xr, yr, birim = t.get(282), t.get(283), t.get(296, 2)
    if xr is None or yr is None or birim not in (2, 3):
        return None
    try:
        x, y = float(xr), float(yr)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    if not (math.isfinite(x) and math.isfinite(y)):
        return None
    if birim == 3:
        x, y = x * 2.54, y * 2.54
    if DPI_EN_AZ <= x <= DPI_EN_COK and DPI_EN_AZ <= y <= DPI_EN_COK:
        return x, y
    return None


def _standarda_yuvarla(d):
    for s in STANDART_DPI:
        if abs(d - s) <= STANDART_YAKINLIK * s:
            return float(s)
    return d


def tiff_dpi_coz(kareler):
    """Karelerin çözünürlüğü. kareler: [(genişlik px, yükseklik px, etiket (x, y) | None)] (etiket dosyadaki eksenlerle; ölçüden yalnızca uzun kenar).
    Döner: [(x dpi, y dpi, kaynak)]; kaynak 'etiket' (geçerli etiket), 'a4' (etiketsiz: uzun kenar A4'ün uzun kenarı; dosyanın etiketsiz
    karelerinin ortancası, standart değere %3 yakınsa o) ya da 'varsayilan' (A4 kuralı 50 dpi'den az veriyor: küçük görsel, 72 dpi).
    UYAP taramalarının çoğu etiketsiz (okuyucular 1 dpi görüyor); piksel ölçüleri A4'ün 100–300 dpi karşılığı."""
    tahminler = [max(g, y) / A4_UZUN_KENAR_INC for g, y, e in kareler if e is None and max(g, y) > 0]
    ortak = None
    if tahminler:
        d = _standarda_yuvarla(statistics.median(tahminler))
        ortak = (d, d, "a4") if d >= DPI_EN_AZ else (VARSAYILAN_DPI, VARSAYILAN_DPI, "varsayilan")
    return [(float(e[0]), float(e[1]), "etiket") if e else (ortak or (VARSAYILAN_DPI, VARSAYILAN_DPI, "varsayilan")) for g, y, e in kareler]


def _tiff_sayfa_olcusu(g_px, y_px, xd, yd):
    """Karenin sayfa ölçüsü (pt); PDF'in sayfa sınırını (200 inç) aşarsa oranı korunarak küçülür."""
    g, y = g_px * 72.0 / xd, y_px * 72.0 / yd
    if max(g, y) > PDF_EN_BUYUK_KENAR:
        oran = PDF_EN_BUYUK_KENAR / max(g, y)
        g, y = g * oran, y * oran
    return max(g, 1.0), max(y, 1.0)


def _tiff_ac(yol):
    Image = araclar._pillow()[0]
    try:
        im = Image.open(yol)
    except Exception as e:
        raise OgeHatasi("bozuk", "TIFF dosyası okunamadı (%s): %s" % (os.path.basename(yol), e))
    if (im.format or "").upper() != "TIFF":
        im.close()
        raise OgeHatasi("bozuk", "Dosya TIFF değil: %s" % os.path.basename(yol))
    return im


def _tiff_olculeri(im):
    """Bütün karelerin (genişlik, yükseklik, etiket dpi, yön): yalnızca kare başlıkları okunur, pikseller çözülmez."""
    olculer = []
    for i in range(getattr(im, "n_frames", 1)):
        im.seek(i)
        try:
            yon = int(im.tag_v2.get(274, 1) or 1)
        except (TypeError, ValueError):
            yon = 1
        olculer.append((im.width, im.height, _etiket_dpi(im), yon))
    return olculer


def _kare_sinirla(kare, no):
    if kare.width * kare.height > EN_FAZLA_KARE_PIKSEL:
        raise OgeHatasi("buyuk", "Sayfa %d çok büyük (%d × %d piksel)." % (no, kare.width, kare.height))


def _g4_kodla(kare):
    """1 bit kareyi tek şeritli CCITT G4'e kodlar (Pillow'un libtiff'i). Döner: (veri, BlackIs1) ya da None (libtiff yok, beklenmeyen
    çıktı). Pillow 1 bit kareyi MinIsBlack (fotometrik 1) yazar: PDF'te BlackIs1 true (ters verilince sayfa negatif çıkar)."""
    Image = araclar._pillow()[0]
    buf = io.BytesIO()
    try:
        kare.save(buf, "TIFF", compression="group4", strip_size=max(1, (kare.width + 7) // 8) * kare.height)
        buf.seek(0)
        with Image.open(buf) as t:
            ofs, say, foto = t.tag_v2.get(273), t.tag_v2.get(279), t.tag_v2.get(262)
    except Exception:
        return None
    if not ofs or not say or len(ofs) != 1 or len(say) != 1 or foto not in (0, 1):
        return None
    return bytes(buf.getbuffer()[ofs[0]:ofs[0] + say[0]]), foto == 1


def _bit_sayfasi_ekle(doc, g_px, y_px, sg, sy, veri, ccitt, black_is_1=True):
    """1 bit görseli sayfayı kaplayan bir XObject olarak yeni sayfaya koyar (veri G4 ya da Flate, olduğu gibi)."""
    pg = doc.new_page(width=sg, height=sy)
    xref = doc.get_new_xref()
    doc.update_object(xref, "<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray /BitsPerComponent 1 >>"
                      % (g_px, y_px))
    doc.update_stream(xref, veri, compress=False)
    if ccitt:
        doc.xref_set_key(xref, "Filter", "/CCITTFaxDecode")
        doc.xref_set_key(xref, "DecodeParms", "<< /K -1 /Columns %d /Rows %d /BlackIs1 %s >>"
                         % (g_px, y_px, "true" if black_is_1 else "false"))
    else:
        doc.xref_set_key(xref, "Filter", "/FlateDecode")
    doc.xref_set_key(pg.xref, "Resources", "<< /XObject << /Im0 %d 0 R >> >>" % xref)
    icerik = doc.get_new_xref()
    doc.update_object(icerik, "<< >>")
    doc.update_stream(icerik, ("q %.4f 0 0 %.4f 0 0 cm /Im0 Do Q" % (sg, sy)).encode("ascii"))
    doc.xref_set_key(pg.xref, "Contents", "%d 0 R" % icerik)


# ---------------------------------------------------------------- TIFF → PDF
def _tiff_hazir():
    try:
        araclar._pillow()
    except RuntimeError as e:
        return False, str(e)
    return True, None


def _tiff_pdf(kaynak, cikti, secenekler, ilerleme, baglam):
    im = _tiff_ac(kaynak)
    doc = None
    try:
        olculer = _tiff_olculeri(im)
        n = len(olculer)
        dpiler = tiff_dpi_coz([(g, y, e) for g, y, e, _ in olculer])
        with baglam.mupdf():
            doc = pymupdf.open()
        g4_sayisi = 0
        for i in range(n):
            ilerleme(i / n, "Sayfa %d/%d" % (i + 1, n))
            im.seek(i)
            _kare_sinirla(im, i + 1)
            yon = olculer[i][3]
            kare = _yon_uygula(im)
            xd, yd, _ = _yona_gore_dpi(dpiler[i], yon)
            sg, sy = _tiff_sayfa_olcusu(kare.width, kare.height, xd, yd)
            if kare.mode == "1":
                g4 = _g4_kodla(kare)
                flate = zlib.compress(kare.tobytes(), FLATE_DUZEYI)
                ccitt = g4 is not None and len(g4[0]) < len(flate)
                veri = g4[0] if ccitt else flate
                g4_sayisi += 1 if ccitt else 0
                with baglam.mupdf():
                    _bit_sayfasi_ekle(doc, kare.width, kare.height, sg, sy, veri, ccitt, g4[1] if ccitt else True)
                del g4, flate, veri
            else:
                duz = araclar._duzlestir(kare, exif=False)
                png = araclar._gorsel_kodla(duz, "orijinal")[0]
                del duz
                with baglam.mupdf():
                    pg = doc.new_page(width=sg, height=sy)
                    pg.insert_image(pg.rect, stream=png, keep_proportion=False)
                del png
            del kare
        ilerleme(1.0, "Kaydediliyor…")
        with baglam.mupdf():
            try:
                doc.set_metadata({"producer": "PDEfe", "creator": "PDEfe"})
            except Exception:
                pass
            doc.save(cikti, **KAYIT_SECENEKLERI)
        return {"sayfa": n, "dpi": round(dpiler[0][0], 1) if dpiler else None, "dpiKaynagi": dpiler[0][2] if dpiler else None,
                "g4Sayfa": g4_sayisi}
    finally:
        if doc is not None:
            with baglam.mupdf():
                araclar._kapat(doc)
        im.close()


# ---------------------------------------------------------------- PDF → TIFF
def _tiff_yazici_hazir():
    try:
        araclar._pillow()
        from PIL import features
    except (RuntimeError, ImportError) as e:
        return False, str(e)
    if not features.check("libtiff"):
        return False, "TIFF yazıcısı (libtiff) yok."
    return True, None


def _tarama_dpi(pg):
    """Sayfanın tamamını tek bir görsel kaplıyorsa (taranmış evrak) o görselin çözünürlüğü (dpi; TARAMA_DPI_EN_AZ–EN_COK), değilse
    None. Kare olmayan pikselde (yatay ve dikey çözünürlük farklı) None: seçilen dpi'de çizilir."""
    try:
        bilgiler = pg.get_image_info()
    except Exception:
        return None
    r = (pg.rect * pg.derotation_matrix).normalize()   # görsel kutuları döndürülmemiş düzlemde
    alan = max(r.width * r.height, 1e-6)
    en, en_kaplama = None, 0.0
    for b in bilgiler:
        k = pymupdf.Rect(b["bbox"]) & r
        if k.is_empty:
            continue
        kaplama = k.width * k.height / alan
        if kaplama > en_kaplama:
            en, en_kaplama = b, kaplama
    if en is None or en_kaplama < TARAMA_KAPLAMA:
        return None
    t = en.get("transform") or (0, 0, 0, 0, 0, 0)
    gx, gy = math.hypot(t[0], t[1]), math.hypot(t[2], t[3])   # görselin birim karesi → sayfadaki kutusu (pt)
    if gx <= 0 or gy <= 0 or not en.get("width") or not en.get("height"):
        return None
    dx, dy = en["width"] * 72.0 / gx, en["height"] * 72.0 / gy
    if abs(dx - dy) > 0.01 * max(dx, dy):
        return None
    d = (dx + dy) / 2
    return d if TARAMA_DPI_EN_AZ <= d <= TARAMA_DPI_EN_COK else None


def _pdf_tiff(kaynak, cikti, secenekler, ilerleme, baglam):
    try:
        dpi = int(secenekler.get("dpi") or VARSAYILAN_TIFF_DPI)
    except (TypeError, ValueError):
        dpi = 0
    if dpi not in TIFF_DPILERI:
        raise OgeHatasi("gecersiz", "TIFF çözünürlüğü %s dpi olmalı." % " ya da ".join(str(d) for d in TIFF_DPILERI))
    renk = secenekler.get("renk") or "sb"
    if renk not in TIFF_RENKLERI:
        raise OgeHatasi("gecersiz", "Bilinmeyen renk seçeneği: %r" % (renk,))
    Image = araclar._pillow()[0]
    from PIL import TiffImagePlugin
    olcek_sinirla = _cekirdek().olcek_sinirla
    with baglam.mupdf():
        doc = araclar._pdf_ac(kaynak)   # yalnızca PDF (filetype="pdf"), parolalıysa PermissionError
    dpiler = []
    try:
        n = doc.page_count
        if n == 0:
            raise OgeHatasi("bozuk", "Belgede sayfa yok: %s" % os.path.basename(kaynak))
        kip = "RGB" if renk == "renkli" else "L"
        with TiffImagePlugin.AppendingTiffWriter(cikti, new=True) as tf:
            for i in range(n):
                ilerleme(i / n, "Sayfa %d/%d" % (i + 1, n))
                with baglam.mupdf():
                    pg = doc[i]
                    olcek = (_tarama_dpi(pg) or dpi) / 72.0
                    olcek = olcek_sinirla(pg.rect.width, pg.rect.height, olcek)
                    pix = pg.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), colorspace=pymupdf.csRGB if kip == "RGB" else pymupdf.csGRAY,
                                        alpha=False, annots=True)
                    sayfa = Image.frombytes(kip, (pix.width, pix.height), pix.samples)
                    del pix
                if renk == "sb":
                    sayfa = sayfa.point(ESIK_TABLOSU, "1")
                d = round(72.0 * olcek, 2)
                sayfa.save(tf, format="TIFF", compression="group4" if renk == "sb" else "tiff_lzw", dpi=(d, d))
                tf.newFrame()
                dpiler.append(d)
                del sayfa
                if (i + 1) % ONBELLEK_BOSALTMA == 0:
                    with baglam.mupdf():
                        pymupdf.TOOLS.store_shrink(100)
        ilerleme(1.0, "Kaydediliyor…")
    finally:
        with baglam.mupdf():
            araclar._kapat(doc)
    return {"sayfa": len(dpiler), "dpi": statistics.mode(dpiler) if dpiler else None}


donusturucu_kaydet("tiff", "pdf", _tiff_pdf, _tiff_hazir)
donusturucu_kaydet("pdf", "tiff", _pdf_tiff, _tiff_yazici_hazir)


def kaydol(yontemler):
    yontemler["donusum_yetenekleri"] = y_donusum_yetenekleri
    yontemler["donusum_bilgi"] = y_donusum_bilgi
    yontemler["bicim_donustur"] = y_bicim_donustur
