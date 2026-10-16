# -*- coding: utf-8 -*-
"""Dosya biçimi dönüştürme (0.2.6, "Dosya Formatını Değiştir" aracı; 0.2.7'de adı "Format Değiştir"): TIFF ↔ PDF ve (0.2.7) görüntü →
PDF, PDF → JPG bu modülde; UDF ↔ PDF ve Word ↔ PDF bu çatıya ayrı modüllerde eklenir (donusturucu_kaydet, yetenek_kaydet, bilgi_kaydet;
islemler/__init__.py onları bu modülden sonra yükler).

Yöntemler (kaydol):
  donusum_yetenekleri {} → {tiff: bool (iki yön de var), udf: {...}, word: {...} (Word → PDF), pdf_word: {...} (PDF → Word) (o modüllerin
      yetenek_kaydet'le verdiği; yoksa {var: false, neden}), donusumler: {"<kaynak>><hedef>": {var, neden?, kalite?}} (ör. "tiff>pdf";
      kalite: 0.2.7, sonucu kaynağından belirgin biçimde farklı olabilecek dönüştürmenin kısa notu, KALITE_NOTLARI),
      uzantilar: {hedefBicim: [uzantılar]}, girdiUzantilari: {tür: [uzantılar]} (yalnızca dönüştürülebilen türler ve açılabilen görüntü
      alt türleri; dosya seçme süzgeci için), gorsel: {var (görüntü → PDF ve PDF → JPG), heic (HEIC / HEIF açılabiliyor mu), dpiler:
      [200, 300], varsayilanDpi: 300} (0.2.7)}
  donusum_bilgi {yol, genislik?=220} → {tur, alt, boyut, sayfa, hedefler: [{bicim, uzantilar, var, neden?, kalite?}], uyari?, png?,
      pngGenislik?, pngYukseklik?, genislik?, yukseklik? (ilk sayfanın pt ölçüsü; TIFF ve görüntüde PDF'teki sayfanın: A4'e sığan ölçü), dpi?
      (TIFF ve görüntü: o sayfadaki çözünürlüğü, piksel / inç), pikselGenislik? / pikselYukseklik? / gorselBicimi? (görüntü, görünen yönde)}. Tür UZANTIDAN
      DEĞİL DOSYANIN İÇERİĞİNDEN (tur_bul): 'pdf' | 'udf' | 'tiff' | 'word' | 'gorsel' | 'bilinmeyen'; alt: udf 'zip' | 'xml', word 'docx' |
      'docm' | 'doc' | 'rtf' | 'odt' | 'sifreli', tiff 'tiff' | 'bigtiff', gorsel 'jpeg' | 'png' | 'gif' | 'bmp' | 'webp' | 'avif' | 'heif'
      (HEIC / HEIF açıcısı yoksa hedefler yapılamaz, neden HEIF_YOK). Ön izleme yalnızca PDF (MuPDF), TIFF ve görüntü (Pillow) için; öteki
      türlerin baytı ne MuPDF'e ne arayüze gider. Hareketli GIF / WEBP'de uyari (yalnızca ilk kare).
  bicim_donustur {ogeler: [{yol, hedef, hedefBicim, secenekler?, cakisma?}]} → (Ertelenmis; dönüştürme iş parçacığında)
      {sonuclar: [{yol, hedef, hedefBicim, kaynakTur, boyut, sayfa?, hedefler?, istenenHedef?, ...} | {yol, hedef, hedefBicim, hata, kod,
      hedefler?}], basarili, hatali}.
      hedefBicim: 'pdf' | 'udf' | 'tiff' | 'word' (Word hedefi .docx) | 'gorsel' (JPG, 0.2.7); hedefin uzantısı biçimle eşleşmeli
      (HEDEF_UZANTILARI; gorsel .jpg ya da .jpeg).
      JPG hedefi (çok dosyalı, COKLU_HEDEFLER): hedef "<klasör>/<ad>.jpg" ad köküdür; tek sayfalı belge "<ad>.jpg", çok sayfalı belge
      "<ad> - Sayfa 1.jpg", "<ad> - Sayfa 2.jpg"… (sayfa_adlari) olarak yazılır; sonucun hedefler'i yazılan dosyaların listesi, hedef ilki,
      boyut toplamı. secenekler: {dpi: 300 | 200 (varsayılan 300)}; JPEG kalitesi 90, dpi etiketli; taranmış sayfa seçilenden düşük
      çözünürlükteyse kendi çözünürlüğünde (büyütülmez).
      cakisma (0.2.7, bütün hedeflerde): 'uzerineYaz' (varsayılan; var olan hedef yenisiyle değişir) | 'yeniAd' (hedef ya da JPG'nin sayfa
      dosyalarından biri varsa ilk boş "(1)", "(2)"… adına yazılır, var olana dokunulmaz: "Belge.tif" → "Belge (1).tif", JPG'de bütün sayfalar
      aynı kökte: "<ad> (1) - Sayfa n.jpg"; bos_ad). Ad değiştiyse sonuçta istenenHedef (istenen ad) ve hedef (yazılan ad). JPG'de bir sayfa
      dosyası salt okunur ya da başka programda açıksa öğe hata alır, hiçbir sayfa dosyası değişmez; yarıda kalırsa (çok seyrek) yazılanlar
      hatanın hedefler'inde.
      Parametre
      hatası (öğe biçimi, uzantı, aynı hedef iki kez, hedef bir kaynağın kendisi) bütün isteği reddeder; içerikle ilgili hata (biçim
      tanınmadı, dönüştürme yok, dosya bozuk / parolalı / kilitli / salt okunur, güvensiz zip) yalnızca o öğenin sonucuna yazılır, öteki
      öğeler sürer. kod: 'bulunamadi' | 'kilitli' | 'salt_okunur' | 'parolali' | 'bozuk' | 'taninmadi' | 'ayni_bicim' |
      'desteklenmiyor' | 'guvensiz' | 'buyuk' | 'gecersiz' | 'zaman_asimi' | 'bellek' | 'hata'. İleti kilitli dosyada
      araclar.KILITLI_METNI'ni, salt okunurda SALT_OKUNUR_METNI'ni içerir (arayüzün hataSor'u bunlarla tanır).
      TIFF hedefinin secenekler'i: {dpi: 300 | 200 (varsayılan 300; 0.2.7'den beri, arayüzde "İdeal" 300, "Düşük" 200), renk: 'sb'
      (siyah-beyaz, G4; varsayılan) | 'gri' | 'renkli' (LZW)}.
  donusum_tahmini {yollar: [yol] | yol, hedefBicim: 'tiff' | 'gorsel', renk?: 'sb' | 'gri' | 'renkli'} → (Ertelenmis) {ideal (300 dpi),
      dusuk (200 dpi): bayt, sayfa, tahmin, eksik: [yol], ogeler, sure} (0.2.7; ayrıntı "boyut tahmini" bölümünde).

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

TIFF → PDF: kayıpsız; her sayfa karenin kendisi, oranı korunarak A4'e sığan en büyük ölçüde (0.2.9, araclar.a4_sayfa_olcusu: dikey ya da
eni boyuna eşit kare 210 × 297 mm'lik, yatay kare 297 × 210 mm'lik kutuya; çözünürlük etiketi yalnızca yatay ve dikey çözünürlük farklıysa oranı
belirler; 0.2.6–0.2.8'de sayfa taramanın gerçek ölçüsündeydi: etiket ya da uzun kenarı A4'e oturtan dpi). 1 bit karede sayfa başına CCITT G4 (tek şerit yeniden kodlanmış:
UYAP taramaları 8 satırlık şeritli, PDF'e olduğu gibi kopyalanamaz) ya da Flate'ten küçüğü; gri / renkli kare PNG (MuPDF Flate yazar).
Kareler sırayla okunur, yalnızca biri bellekte durur (150 sayfada tepe ~70 MB; Görüntü / PDF birleştir'in eski yolu 147 sayfada 1,16 GB).
PDF → TIFF: tek dosyada çok sayfa (AppendingTiffWriter, sayfa sayfa); siyah-beyazda sabit eşik (ESIK, titreşimsiz: yazı tanıma ölçümü),
G4; gri / renkli LZW; dpi etiketli. Tek tam sayfa görselden oluşan (taranmış) sayfa görselin kendi çözünürlüğünde çizilir (50–600 dpi):
pikseller yeniden örneklenmez. Ölçümler PLAN.md "Revizyon 0.2.6".
Görüntü → PDF (0.2.7): tek sayfa, görüntü sayfayı kaplar; sayfa ölçüsü gorsel_sayfa_olcusu (0.2.9: A4'e sığan ölçü, TIFF'le aynı kural;
0.2.7–0.2.8'de dpi etiketi ya da A4 kuralı), EXIF yönü uygulanır. Dokunulmadan gömülebilen JPEG olduğu gibi (yön PDF'te döndürülür), öteki kayıplı kaynak JPEG 92, kayıpsız
kaynak PNG (_gorsel_gomulecek). Görüntü → UDF / Word / TIFF PDF üzerinden (UDF'de taranmış sayfa yazı tanımayla; Word'de resim olarak).
PDF → JPG: sayfa başına JPEG; çatı geçici klasördeki 1.jpg, 2.jpg… dosyalarını sayfa_adlari'yla yerine koyar.
"""
import base64
import io
import math
import os
import queue
import re
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
from .araclar import DPI_EN_AZ, DPI_EN_COK, KAYIT_SECENEKLERI, KILITLI_METNI, SALT_OKUNUR_METNI

# ---------------------------------------------------------------- biçimler
TURLER = ("pdf", "udf", "tiff", "word", "gorsel")
HEDEF_SIRASI = ("pdf", "udf", "word", "tiff", "gorsel")   # donusum_bilgi'nin hedefler listesinin sırası (aracın biçim seçimi)
HEDEF_UZANTILARI = {"pdf": (".pdf",), "udf": (".udf",), "tiff": (".tif", ".tiff"), "word": (".docx",), "gorsel": (".jpg", ".jpeg")}
GIRDI_UZANTILARI = {"pdf": (".pdf",), "udf": (".udf",), "tiff": (".tif", ".tiff"), "word": (".docx", ".docm", ".doc", ".rtf", ".odt"),
                    "gorsel": (".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".avif", ".heic", ".heif")}
GORSEL_ALT_UZANTILARI = {"webp": (".webp",), "avif": (".avif",), "heif": (".heic", ".heif")}   # açılabilmesi kitaplığa bağlı alt türler
COKLU_HEDEFLER = ("gorsel",)   # bir girdiden birden çok dosya (sayfa başına bir JPG; bkz. modül belgesi)
CAKISMALAR = ("uzerineYaz", "yeniAd")
EN_FAZLA_OGE = 500

# ---------------------------------------------------------------- güvenlik sınırları
EN_FAZLA_ACIK_BOYUT = 300 * 1024 * 1024   # zip'in açılmış toplam boyutu (bildirilen); UDF ve docx'ler birkaç MB
EN_FAZLA_ZIP_OGESI = 10_000
EN_FAZLA_ZIP_ORANI = 200                  # 1 MB'tan büyük öğede açılmış / sıkıştırılmış (XML ~5–20 kat sıkışır)
OLE2_TARAMA = 64 * 1024 * 1024            # eski Word (.doc) imzası için taranan en çok bayt

# ---------------------------------------------------------------- TIFF
# Geçerli çözünürlük etiketi: araclar.DPI_EN_AZ – DPI_EN_COK (50–1200). 0.2.9'dan beri sayfa ölçüsü A4'e sığan ölçü (araclar.a4_sayfa_olcusu);
# 0.2.6'nın dpi kuralı (etiketsiz karede uzun kenarı A4'e oturtan, standart değere yuvarlanan dpi; çok küçük görselde 72) kalktı
EN_FAZLA_KARE_PIKSEL = 400_000_000        # araclar._pillow'un Image.MAX_IMAGE_PIXELS'ı; kare başına ayrıca denetlenir
FLATE_DUZEYI = 6                          # 9 ölçümde ~%6 küçük, 10 kat yavaş

# ---------------------------------------------------------------- PDF → TIFF
TIFF_DPILERI = (200, 300)
VARSAYILAN_TIFF_DPI = 300                 # 0.2.7 (kullanıcının isteği): "İdeal" 300 standart, "Düşük" 200 (UYAP'ın kendi TIFF'leri gibi)
TIFF_RENKLERI = ("sb", "gri", "renkli")
ESIK = 160                                # siyah-beyaz: gri değer bundan büyükse beyaz (128 ve titreşim 150 dpi'de okunurluğu düşürüyordu)
ESIK_TABLOSU = [0] * (ESIK + 1) + [255] * (255 - ESIK)
TARAMA_KAPLAMA = 0.95                     # en büyük görsel sayfanın bu kadarını kaplıyorsa sayfa taranmış sayılır
TARAMA_DPI_EN_AZ, TARAMA_DPI_EN_COK = 50.0, 600.0
ONBELLEK_BOSALTMA = 8                     # PDF → TIFF: bu kadar sayfada bir MuPDF'in ön belleği boşaltılır. Çözülen sayfa görselleri
                                          # orada kalıyor (sınırı 256 MB): 150 sayfalık taramada tepe 321 → 95 MB; her görsel bir kez çizilir

# ---------------------------------------------------------------- görüntü (0.2.7)
JPG_DPILERI = TIFF_DPILERI                # PDF → JPG: "İdeal" 300, "Düşük" 200
VARSAYILAN_JPG_DPI = 300
JPG_KALITESI = 90                         # PDF → JPG
YENIDEN_KODLAMA_KALITESI = 92             # görüntü → PDF: olduğu gibi gömülemeyen kayıplı kaynak (HEIC, AVIF, kayıplı WEBP, CMYK JPEG)
KAYIPLI_GORSELLER = ("JPEG", "MPO", "HEIF", "HEIC", "AVIF")
HEIF_YOK = "HEIC / HEIF görüntüleri bu bilgisayarda açılamıyor; görüntüyü önce JPG ya da PNG olarak kaydedin."

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


def _sessiz(islev):
    try:
        islev()
    except Exception as e:   # bakım işi: hata çekirdeği düşürmesin
        print("[donustur] bakım: %r" % e, file=sys.stderr)


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


HEIF_MARKALARI = (b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"hevm", b"hevs", b"mif1", b"msf1")


def _gorsel_imzasi(bas):
    """Görüntünün alt türü dosyanın ilk baytlarından (0.2.7): 'jpeg' | 'png' | 'gif' | 'bmp' | 'webp' | 'avif' | 'heif' ya da None.
    BMP'de "BM"den sonra bilgi başlığının boyutu da denetlenir (düz metin "BM" ile başlayabilir); HEIF / AVIF ISO BMFF 'ftyp' kutusunun
    markalarından (AVIF markası varsa AVIF: 'mif1' iki türde de geçer)."""
    if bas[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if bas[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if bas[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if bas[:2] == b"BM" and len(bas) >= 18 and int.from_bytes(bas[14:18], "little") in (12, 16, 40, 52, 56, 64, 108, 124):
        return "bmp"
    if bas[:4] == b"RIFF" and bas[8:12] == b"WEBP":
        return "webp"
    if bas[4:8] == b"ftyp" and len(bas) >= 16:
        uzunluk = max(16, min(int.from_bytes(bas[:4], "big"), len(bas)))
        markalar = [bas[8:12]] + [bas[i:i + 4] for i in range(16, uzunluk - 3, 4)]
        if b"avif" in markalar or b"avis" in markalar:
            return "avif"
        if any(m in HEIF_MARKALARI for m in markalar):
            return "heif"
    return None


def tur_bul(yol):
    """Dosyanın türü içeriğinden (uzantıya bakılmaz): (tur, alt). tur 'pdf' | 'udf' | 'tiff' | 'word' | 'gorsel' | 'bilinmeyen'.
    Görüntü (0.2.7, _gorsel_imzasi): JPEG, PNG, GIF, BMP, WEBP, AVIF, HEIC / HEIF; TIFF ayrı tür (çok sayfalı tarama).
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
    gorsel = _gorsel_imzasi(bas)
    if gorsel:
        return "gorsel", gorsel
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

    def hazir(self, alt=None):
        """(bool, neden). alt: kaynağın alt türü (0.2.7; ör. görüntüde 'heif'): hazırlık işlevinin 'alt' adlı parametresi varsa verilir."""
        if self._hazir is None:
            return True, None
        try:
            sonuc = self._hazir(alt=alt) if _parametre_adi_var(self._hazir, "alt") else self._hazir()
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


def _parametre_adi_var(islev, ad):
    try:
        import inspect
        return ad in inspect.signature(islev).parameters
    except (TypeError, ValueError):
        return False


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
    raise OgeHatasi("desteklenmiyor", "Bu dönüştürme yapılamıyor: %s → %s." % (_TUR_ADLARI.get(kaynak, kaynak), _HEDEF_ADLARI.get(hedef, hedef)))


_TUR_ADLARI = {"pdf": "PDF", "udf": "UDF", "tiff": "TIFF", "word": "Word", "gorsel": "görüntü", "bilinmeyen": "tanınmayan biçim"}
_HEDEF_ADLARI = dict(_TUR_ADLARI, gorsel="JPG")   # hedef olarak görüntü JPG'dir


# 0.2.7 (madde 10): sonucu kaynağından belirgin biçimde farklı olabilecek dönüştürmelerin kısa notu ("kaynak>hedef"; arayüz hedef seçilince
# satırın altında gösterir). Zincirlerde (ör. udf>word = udf>pdf + pdf>word) not bütün yolu anlatır. UDF → PDF / TIFF / JPG ve Word → PDF
# kaynağın kendi programıyla (UDE, Word) çizildiği için notsuz; TIFF / görüntü → PDF kayıpsız. Word → … LibreOffice'le yapılıyorsa ek not.
# 0.2.8 (kullanıcı isteği: "Kaşe diye bir şey kalmadı bu arada, kaşe kelimesini uyarılardan çıkartalım. Tablo kelimesini ekleyelim bi yerlere o da
# kayıyor sanırım"): UDF ve Word notlarında "kaşe" yok, tablolar anılıyor. Sonuç listesinde (renderer, araclar/donustur.js) uyarılı satırın ⚠
# simgesinin ipucu bu notu dönüşümün adıyla yineler.
KALITE_NOTLARI = {
    "pdf>word": "Sayfa düzeni ve tablolar Word'de birebir korunmayabilir.",
    "udf>word": "Sayfa düzeni ve tablolar Word'de birebir korunmayabilir.",
    "tiff>word": "Taranmış sayfalar Word'e resim olarak geçer; yazıları düzenlenemez.",
    "gorsel>word": "Görüntü Word'e resim olarak geçer; yazısı düzenlenemez.",
    "pdf>udf": "Satır, sayfa düzeni ve tablolar UDF'de kayabilir; imza gibi resimler alınmayabilir.",
    "word>udf": "Satır, sayfa düzeni ve tablolar UDF'de kayabilir; imza gibi resimler alınmayabilir.",
    "tiff>udf": "Yazılar görüntüden tanınarak çıkarılır; harf yanlışları olabilir, düzen ve tablolar kayabilir.",
    "gorsel>udf": "Yazılar görüntüden tanınarak çıkarılır; harf yanlışları olabilir, düzen ve tablolar kayabilir.",
}
LIBREOFFICE_NOTU = "Bu bilgisayarda Word yok: belge LibreOffice'le çevrilir, düzeni Word'dekinden biraz farklı olabilir."


def _kalite_notu(kaynak, hedef):
    """Dönüştürmenin kalite notu ya da None (KALITE_NOTLARI; Word kaynağı LibreOffice'le çevriliyorsa LIBREOFFICE_NOTU eklenir)."""
    notlar = [KALITE_NOTLARI[k] for k in ["%s>%s" % (kaynak, hedef)] if k in KALITE_NOTLARI]
    if kaynak == "word":
        islev = _YETENEKLER.get("word")
        try:
            if islev is not None and (islev() or {}).get("motor") == "libreoffice":
                notlar.append(LIBREOFFICE_NOTU)
        except Exception:
            pass
    return " ".join(notlar) or None


def _plan_hazir(plan, alt=None):
    """Planın adımları bu bilgisayarda yapılabiliyor mu; alt (kaynağın alt türü) yalnızca ilk adıma verilir."""
    for k, d in enumerate(plan):
        ok, neden = d.hazir(alt if k == 0 else None)
        if not ok:
            return False, neden
    return True, None


def _hedefler(tur, alt=None):
    """Bu türden yapılabilen dönüştürmeler: [{bicim, uzantilar, var, neden?}] (HEDEF_SIRASI sırasıyla)."""
    sonuc = []
    for h in HEDEF_SIRASI:
        if h == tur:
            continue
        try:
            plan = _plan(tur, h)
        except OgeHatasi:
            continue
        ok, neden = _plan_hazir(plan, alt)
        oge = {"bicim": h, "uzantilar": list(HEDEF_UZANTILARI[h]), "var": ok}
        if neden:
            oge["neden"] = neden
        kalite = _kalite_notu(tur, h)
        if kalite:
            oge["kalite"] = kalite
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


def kapanirken(bekle=2.0, temizlik=3.0, tahmin=1.0):
    """Çekirdek kapanırken (pdefe_core.main): süren dönüştürme en çok `bekle` sn beklenir; bitmezse iptal edilir ve geçici dosyaların
    silinmesi için en çok `temizlik` sn daha beklenir. Süren ve sıradaki boyut tahminleri (0.2.7 inceleme) durur (ilerleme bildiriminde
    kapanışa bakar), yanıtları yazılmaz; bitmeleri en çok `tahmin` sn beklenir. Önceden tahmin iş parçacığı (daemon) durdurulmuyordu:
    yorumlayıcı kapanırken stdout'a yazarsa Python ölümcül hatayla çıkabilirdi (yazi_tanima'nın os._exit yolunun nedeni)."""
    if _is_parcacigi is not None and not _bosta_bekle(bekle):
        _kapaniyor.set()
        _bosta_bekle(temizlik)
    _kapaniyor.set()
    with _tahmin_durum:
        _tahmin_durum.wait_for(lambda: _tahmin_bekleyen == 0, timeout=tahmin)
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
            self._gecici = tempfile.mkdtemp(prefix="%s%d-" % (GECICI_ONEKI, os.getpid()))   # çökmede kalırsa: kalintilari_temizle
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
        is_ = ise_bagla(p)   # Windows: alt süreçleriyle birlikte iş nesnesinde (öldürme anında; çekirdek çökerse de sonlanır)
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
            _surec_oldur(p, is_)
            raise
        finally:
            is_kapat(is_)   # KILL_ON_JOB_CLOSE: program bittiyse ondan kalan alt süreçler de sonlanır


def ise_bagla(p):
    """Windows'ta süreci "kapanınca sonlandır" (KILL_ON_JOB_CLOSE) iş nesnesine bağlar; başlattığı alt süreçler de iş nesnesine girer
    (udf.py'nin JVM'i, dış süreçler: LibreOffice). Döner: iş nesnesi tutamacı ya da None (Windows değil ya da bağlanamadı)."""
    if os.name != "nt":
        return None
    try:
        from . import word
        return word._is_nesnesi_kur(int(p._handle))
    except Exception as e:
        print("[donustur] süreç iş nesnesine bağlanamadı: %r" % e, file=sys.stderr)
        return None


def is_kapat(j):
    if j:
        try:
            from . import word
            word._w32().k32.CloseHandle(j)
        except Exception:
            pass


def _surec_oldur(p, is_=None):
    """Süreci alt süreçleriyle birlikte öldürür. 0.2.9 denetimi: önce iş nesnesi (TerminateJobObject, anında); taskkill /T yalnızca iş
    nesnesi yoksa (bu bilgisayarda tek süreçte bile 5–7 sn sürüyordu: iptal ve süre aşımı o kadar gecikiyor, kapanış bütçesini yiyordu)."""
    if p.poll() is not None and not is_:
        return
    sonlandi = False
    if is_:
        try:
            from . import word
            sonlandi = bool(word._w32().k32.TerminateJobObject(is_, 1))
        except Exception:
            sonlandi = False
    if not sonlandi and os.name == "nt" and p.poll() is None:
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
            kalite = _kalite_notu(k, h)
            donusumler["%s>%s" % (k, h)] = dict({"var": ok}, **({"neden": neden} if neden else {}), **({"kalite": kalite} if kalite else {}))
    girdiler = {t: list(GIRDI_UZANTILARI[t]) for t in TURLER if any(a.startswith(t + ">") and v["var"] for a, v in donusumler.items())}
    if "gorsel" in girdiler:   # açılamayan alt türlerin uzantıları dosya seçme süzgecine girmez (ör. HEIC, kitaplığı yoksa)
        acilamayan = {u for alt, uz in GORSEL_ALT_UZANTILARI.items() if not _gorsel_alt_hazir(alt)[0] for u in uz}
        girdiler["gorsel"] = [u for u in girdiler["gorsel"] if u not in acilamayan]
    sonuc = {
        "turler": list(TURLER),
        "uzantilar": {b: list(u) for b, u in HEDEF_UZANTILARI.items()},
        "girdiUzantilari": girdiler,
        "donusumler": donusumler,
        "tiff": bool(donusumler.get("tiff>pdf", {}).get("var") and donusumler.get("pdf>tiff", {}).get("var")),
        # 0.2.7: görüntü → PDF ve PDF → JPG; heic: HEIC / HEIF açılabiliyor mu (pillow-heif)
        "gorsel": {"var": bool(donusumler.get("gorsel>pdf", {}).get("var") and donusumler.get("pdf>gorsel", {}).get("var")),
                   "heic": _gorsel_alt_hazir("heif")[0], "dpiler": list(JPG_DPILERI), "varsayilanDpi": VARSAYILAN_JPG_DPI},
    }
    for ad in ("udf", "word", "pdf_word"):
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
        im.seek(0)
        _kare_sinirla(im, 1)
        kare = _yon_uygula(im)
        sg, sy = _kare_sayfasi(kare.width, kare.height, olculer[0])
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
        return {"sayfa": len(olculer), "genislik": round(sg, 2), "yukseklik": round(sy, 2), "dpi": _sayfa_dpi(kare.width, sg),
                "png": base64.b64encode(buf.getvalue()).decode("ascii"), "pngGenislik": kucuk.width, "pngYukseklik": kucuk.height}
    finally:
        im.close()


def y_donusum_bilgi(p):
    _ayarlari_uygula(p)
    yol = araclar._mutlak(p.get("yol"))
    genislik = _genislik(p)
    tur, alt = tur_bul(yol)
    sonuc = {"tur": tur, "alt": alt, "boyut": os.path.getsize(yol), "sayfa": None, "hedefler": _hedefler(tur, alt)}
    if tur == "bilinmeyen":
        sonuc["uyari"] = "Dosyanın biçimi tanınmadı. PDF, UDF, TIFF, Word ve görüntü (JPG, PNG…) dosyaları dönüştürülebilir."
        return sonuc
    ertele = None
    try:
        _girdi_denetle(yol, tur, alt)
        if tur == "pdf":
            sonuc.update(_pdf_bilgi(yol, genislik))
        elif tur == "tiff":
            sonuc.update(_tiff_bilgi(yol, genislik))
        elif tur == "gorsel":
            sonuc.update(_gorsel_bilgi(yol, alt, genislik))
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
    """bicim_donustur'un parametre denetimi (eş zamanlı; hata bütün isteği reddeder). Döner: [{yol, hedef, hedefBicim, secenekler,
    cakisma}]."""
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
            raise ValueError("%s dosyasının uzantısı %s olmalı: %s" % (_HEDEF_ADLARI[bicim], " ya da ".join(uzantilar), os.path.basename(hedef)))
        secenekler = oge.get("secenekler") or {}
        if not isinstance(secenekler, dict):
            raise ValueError("Öğe %d: seçenekler geçersiz." % (i + 1))
        cakisma = oge.get("cakisma") or "uzerineYaz"
        if cakisma not in CAKISMALAR:
            raise ValueError("Öğe %d: bilinmeyen çakışma seçeneği: %r" % (i + 1, cakisma))
        anahtar = _yol_anahtari(hedef)
        if anahtar in hedefler:
            raise ValueError("Aynı hedef dosya iki kez verildi: %s" % os.path.basename(hedef))
        hedefler.add(anahtar)
        kaynaklar.add(_yol_anahtari(yol))
        hazir.append({"yol": yol, "hedef": hedef, "hedefBicim": bicim, "secenekler": dict(secenekler), "cakisma": cakisma})
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


def _gecici_cikti(hedef, sira, klasor=False):
    """Hedefin klasöründe geçici çıktı: dosya "<hedef>.<pid>-<sıra>.pdefe-tmp<uzantı>" ya da (çok dosyalı hedefte, 0.2.7) klasör
    "<hedef>.<pid>-<sıra>.pdefe-tmp" (dönüştürücü içine 1.jpg, 2.jpg… yazar). İkisi de çökme kaydına yazılır (kalintilari_temizle)."""
    if klasor:
        yol = "%s.%d-%d.pdefe-tmp" % (hedef, os.getpid(), sira)
        _geciciyi_kaydet(yol)
        # Aynı adla kalmış klasör (çöken çekirdeğin pid'i yeniden kullanıldı ya da önceki iş bir dosyayı silemedi; 0.2.7 inceleme) önce
        # boşaltılır: eski "k.jpg" dosyaları sayfa sayılıp kullanıcının klasörüne yazılırdı. Silinemeyen kalırsa yerine koyma yalnızca
        # dönüştürücünün bildirdiği sayfaları alır (_yerine_koy_oge)
        if os.path.exists(yol):
            _sil_hepsi(yol)
        os.makedirs(yol, exist_ok=True)
        return yol
    yol = "%s.%d-%d.pdefe-tmp%s" % (hedef, os.getpid(), sira, os.path.splitext(hedef)[1])
    _geciciyi_kaydet(yol)
    return yol


def _sil_hepsi(yol):
    """Geçici çıktıyı siler: dosya ya da (çok dosyalı hedefin) klasörü."""
    if yol and os.path.isdir(yol):
        shutil.rmtree(yol, ignore_errors=True)
    else:
        _sil(yol)


# ---------------------------------------------------------------- çökmeden kalanlar (0.2.6)
# Çekirdek dönüştürürken çöker ya da zorla kapatılırsa hedef klasörlerde "<hedef>.<pid>-<sıra>.pdefe-tmp<uzantı>" ve %TEMP%'te
# pdefe-donustur-<pid>-* kalırdı. Hedef klasörlere açılan geçici dosyalar <TEMP>/pdefe-donustur-kayit/<pid>.txt'ye yazılır (iş bitince kayıt
# silinir); sonraki çekirdek açılışta pid'i artık çalışmayanların kayıttaki dosyalarını (yalnızca o pid'in geçici adı kalıbındakileri) ve
# geçici klasörlerini siler (kalintilari_temizle).
KAYIT_KLASORU = "pdefe-donustur-kayit"
GECICI_ONEKI = "pdefe-donustur-"
ESKI_LO_ONEKI = "pdefe-libreoffice-"   # 0.2.9'dan önceki LibreOffice profili (word._lo_profil_klasoru; pid'siz)
_kayit_kilidi = threading.Lock()


def _kayit_dosyasi(pid=None):
    return os.path.join(tempfile.gettempdir(), KAYIT_KLASORU, "%d.txt" % (pid if pid is not None else os.getpid()))


def _geciciyi_kaydet(yol):
    try:
        with _kayit_kilidi:
            os.makedirs(os.path.dirname(_kayit_dosyasi()), exist_ok=True)
            with open(_kayit_dosyasi(), "a", encoding="utf-8") as f:
                f.write(os.path.abspath(yol) + "\n")
    except OSError:
        pass   # kayıt yalnızca bakım içindir


def _kaydi_sil():
    with _kayit_kilidi:
        _sil(_kayit_dosyasi())


def kalintilari_temizle(gun=1.0):
    """Çöken / zorla kapatılan çekirdeklerin (pid'i artık çalışmayan) kalıntıları: kayıttaki geçici dosyalar (adı o pid'in geçici adı
    kalıbına uyuyorsa), pdefe-donustur-<pid>-* klasörleri (0.2.9'dan beri LibreOffice'in profili de: pdefe-donustur-<pid>-libreoffice-*) ve
    pid'siz eski adlı geçici klasörlerden (0.2.9'dan önceki pdefe-libreoffice-* dâhil) gun'den eskiler. Döner: silinen sayısı."""
    from .udf import _surec_yasiyor
    kok = tempfile.gettempdir()
    silinen = 0
    kayitlar = os.path.join(kok, KAYIT_KLASORU)
    try:
        adlar = os.listdir(kayitlar)
    except OSError:
        adlar = []
    for ad in adlar:
        m = re.fullmatch(r"(\d+)\.txt", ad)
        if not m:
            continue
        pid = int(m.group(1))
        if pid == os.getpid() or _surec_yasiyor(pid):
            continue
        kayit = os.path.join(kayitlar, ad)
        desen = re.compile(r"\.%d-\d+\.pdefe-tmp(\.[A-Za-z0-9]{1,8})?$" % pid)
        try:
            with open(kayit, encoding="utf-8", errors="replace") as f:
                yollar = [s.strip() for s in f if s.strip()]
        except OSError:
            continue
        for y in yollar:
            if not desen.search(y):
                continue
            if os.path.isfile(y):
                try:
                    os.remove(y)
                    silinen += 1
                except OSError:
                    pass
            elif os.path.isdir(y):   # çok dosyalı hedefin geçici klasörü (0.2.7, PDF → JPG)
                shutil.rmtree(y, ignore_errors=True)
                silinen += 1
        _sil(kayit)
    try:
        adlar = os.listdir(kok)
    except OSError:
        adlar = []
    simdi = time.time()
    for ad in adlar:
        # 0.2.9'dan önceki LibreOffice profili "pdefe-libreoffice-…" (pid'siz; şimdi "pdefe-donustur-<pid>-libreoffice-…"): gun'den eskisi
        if (not ad.startswith(GECICI_ONEKI) and not ad.startswith(ESKI_LO_ONEKI)) or ad == KAYIT_KLASORU:
            continue
        yol = os.path.join(kok, ad)
        m = re.match(re.escape(GECICI_ONEKI) + r"(\d+)-", ad)
        try:
            eski = (not _surec_yasiyor(int(m.group(1)))) if m else (simdi - os.path.getmtime(yol) > gun * 86400)
        except OSError:
            continue
        if eski and os.path.isdir(yol):
            shutil.rmtree(yol, ignore_errors=True)
            silinen += 1
    return silinen


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
    """Bir öğeyi geçici çıktıya dönüştürür. Döner: (geçici yol, bilgi dict); çok dosyalı hedefte geçici yol bir klasördür. Hata ya da
    iptalde geçici dosyalar silinir."""
    tur, alt = tur_bul(oge["yol"])
    if tur == "bilinmeyen":
        raise OgeHatasi("taninmadi", "Dosyanın biçimi tanınmadı: %s" % os.path.basename(oge["yol"]))
    _girdi_denetle(oge["yol"], tur, alt)
    plan = _plan(tur, oge["hedefBicim"])
    ok, neden = _plan_hazir(plan, alt)
    if not ok:
        raise OgeHatasi("desteklenmiyor", neden or "Bu dönüştürme bu bilgisayarda yapılamıyor.")
    coklu = oge["hedefBicim"] in COKLU_HEDEFLER
    # Var olan hedef yazılabilir mi: yeni adla kaydedilecekse (yeniAd) ona yazılmaz; çok dosyalı hedefin dosyaları yerine koymadan önce
    if not coklu and not (oge.get("cakisma") == "yeniAd" and os.path.exists(oge["hedef"])):
        _hedef_denetle(oge["hedef"])
    elif os.path.isdir(oge["hedef"]):
        raise OgeHatasi("gecersiz", "Hedef bir klasör: %s" % os.path.basename(oge["hedef"]))
    araclar._hedef_klasoru_hazirla(oge["hedef"])
    gecici = _gecici_cikti(oge["hedef"], sira, klasor=coklu)
    baglam = Baglam(alt, il)
    bilgi = {"kaynakTur": tur}
    try:
        kaynak = oge["yol"]
        il.adim_sayisi = len(plan)
        for k, d in enumerate(plan):
            il.adim = k
            son = k == len(plan) - 1
            if not son:
                cikti = os.path.join(baglam.gecici_klasor(), "ara-%d%s" % (k, HEDEF_UZANTILARI[d.hedef][0]))
            else:
                cikti = gecici
            baglam.alt = alt if k == 0 else None
            r = d.islev(kaynak, cikti, oge["secenekler"], il.bildir, baglam)
            if isinstance(r, dict):
                bilgi.update(r)
            uretti = (os.path.isdir(cikti) and bool(os.listdir(cikti))) if (son and coklu) else os.path.isfile(cikti)
            if not uretti:
                raise OgeHatasi("hata", "Dönüştürme çıktı üretmedi: %s" % os.path.basename(oge["yol"]))
            kaynak = cikti
        il.bildir(1.0)
        return gecici, bilgi
    except BaseException:
        _sil_hepsi(gecici)
        raise
    finally:
        baglam.temizle()


def sayfa_adlari(hedef, n):
    """Çok dosyalı hedefin (PDF → JPG, 0.2.7) dosya adları: tek sayfada hedefin kendisi; çok sayfada "<ad> - Sayfa 1.jpg", "<ad> - Sayfa 2.jpg"…
    (hedefin klasöründe, hedefin uzantısıyla; Ayır'ın "Ayrılmış - Sayfa 1-3.pdf" deyişi)."""
    if n <= 1:
        return [hedef]
    kok, uz = os.path.splitext(hedef)
    return ["%s - Sayfa %d%s" % (kok, i, uz) for i in range(1, n + 1)]


def sonraki_sayfalar(hedef, n, en_cok=10000):
    """Çok sayfalı hedefin (n > 1) ad dizisinde n'den sonra var olan "<ad> - Sayfa k.jpg" dosyaları (k = n + 1, n + 2… ilk eksiğe dek; 0.2.7
    inceleme): önceki, daha uzun bir dönüştürmeden kalanlar. Tek sayfada (hedefin kendisi) dizi yok: boş liste."""
    if n <= 1:
        return []
    kok, uz = os.path.splitext(hedef)
    kalan = []
    for k in range(n + 1, n + 1 + en_cok):
        a = "%s - Sayfa %d%s" % (kok, k, uz)
        if not os.path.exists(a):
            break
        kalan.append(a)
    return kalan


def bos_ad(hedef, n=1, dolu=os.path.exists):
    """Hedefin dosyalarından (sayfa_adlari) hiçbiri doluysa (var olan dosya; dolu işlevi) aynı adların ilk boş "(1)", "(2)"… biçimi (0.2.7,
    "yeni belge olarak kaydet": "Sigorta Başvuru (1).tif"; ad zaten "(n)" ile bitiyorsa, n 1–3 basamaklıysa, n + 1'den sürer). Döner: dosya
    adları listesi. Çok sayfalı hedefte ad dizisi sonraki sayfayla ("<ad> - Sayfa n+1.jpg") sürüyorsa da dolu sayılır (0.2.7 inceleme): önceki,
    daha uzun bir dönüştürmenin sayfası yeni sayfalarla aynı dizide kalmasın."""
    def bos(h):   # çok sayfada dizinin sonraki sayfası da sınanır (sayfa_adlari(h, n + 1)'in sonuncusu)
        return not any(dolu(a) for a in sayfa_adlari(h, n + 1 if n > 1 else n))
    if bos(hedef):
        return sayfa_adlari(hedef, n)
    kok, uz = os.path.splitext(hedef)
    m = re.fullmatch(r"(.*) \((\d{1,3})\)", kok)   # 1–3 basamak: "Rapor (2023)" gibi yıllar sayı sayılmaz (arayüzün numaraliAdBul'u gibi)
    taban, ilk = (m.group(1), int(m.group(2)) + 1) if m else (kok, 1)
    for k in range(ilk, ilk + 10000):
        h = "%s (%d)%s" % (taban, k, uz)
        if bos(h):
            return sayfa_adlari(h, n)
    raise OgeHatasi("gecersiz", "Boş bir dosya adı bulunamadı: %s" % os.path.basename(hedef))


def _yerine_koy_oge(oge, gecici, yazilan, kaynaklar, sayfa=None):
    """Bir öğenin geçici çıktısını (dosya ya da çok dosyalı hedefin klasörü) hedefine koyar. yazilan: bu istekte yazılmış dosyaların anahtarları
    (güncellenir), kaynaklar: istekteki kaynakların anahtarları. Döner: (yazılan dosyaların yolları, sonuca eklenecek alanlar). "Üzerine yaz"da
    önceki, daha uzun dönüştürmeden kalan sayfalar (sonraki_sayfalar) yazılmaz, silinmez: sonucun kalanlar alanında söylenir (0.2.7 inceleme;
    arayüz soruda ve sonuçta gösterir). sayfa: dönüştürücünün yazdığı sayfa sayısı (bilgi); çok dosyalı geçici klasörden yalnızca 1…sayfa alınır
    (klasörde kalmış başka dosyalar sonuca girmez; 0.2.7 inceleme)."""
    def dolu(a):
        return os.path.exists(a) or _yol_anahtari(a) in yazilan or _yol_anahtari(a) in kaynaklar
    if os.path.isdir(gecici):
        parcalar = sorted((int(m.group(1)), a) for a in os.listdir(gecici) for m in [re.fullmatch(r"(\d+)\.[A-Za-z]+", a)] if m)
        if isinstance(sayfa, int) and sayfa > 0:
            parcalar = [p for p in parcalar if p[0] <= sayfa]
            if [p[0] for p in parcalar] != list(range(1, sayfa + 1)):
                raise OgeHatasi("hata", "Dönüştürme çıktısı eksik: %s" % os.path.basename(oge["yol"]))
        n = len(parcalar)
        if oge.get("cakisma") == "yeniAd":
            adlar = bos_ad(oge["hedef"], n, dolu)
        else:
            adlar = sayfa_adlari(oge["hedef"], n)
            for a in adlar:
                if _yol_anahtari(a) in yazilan or _yol_anahtari(a) in kaynaklar:
                    raise OgeHatasi("gecersiz", "Dosya, bu dönüştürmedeki başka bir dosyanın yerine yazılamaz: %s" % os.path.basename(a))
        for a in adlar:   # hepsi yazılabilir mi (hiçbiri değişmeden önce)
            _hedef_denetle(a)
        konan = []
        try:
            for (_, parca), a in zip(parcalar, adlar):
                araclar._yerine_koy(os.path.join(gecici, parca), a)
                yazilan.add(_yol_anahtari(a))
                konan.append(a)
        except Exception as e:   # yarıda kaldı (ör. dosya bu arada kilitlendi): yazılmış olanlar sonuçta söylenir
            e.yazilanlar = konan
            raise
        kalan = sonraki_sayfalar(oge["hedef"], n) if oge.get("cakisma") != "yeniAd" else []
        return adlar, ({"kalanlar": kalan} if kalan else {})
    hedef = oge["hedef"]
    if oge.get("cakisma") == "yeniAd":
        hedef = bos_ad(hedef, 1, dolu)[0]
    elif _yol_anahtari(hedef) in yazilan:
        # Aynı istekte önce yazılan bir öğenin dosyası (ör. onun "yeni ad"ı "X (1).tif" seçti): üzerine yazılmaz (0.2.7 inceleme; çok dosyalı
        # yoldaki gibi). Önceden o öğenin çıktısı sessizce kayboluyordu, iki sonuç da aynı dosyayı gösteriyordu
        raise OgeHatasi("gecersiz", "Dosya, bu dönüştürmedeki başka bir dosyanın yerine yazılamaz: %s" % os.path.basename(hedef))
    # Hedef açık bir sekmenin PDF'i olabilir (Windows'ta açık tanıtıcı yer değiştirmeyi engeller): ön bellekten bırakma ve yerine koyma aynı
    # kilidin içinde (0.2.9 denetimi). Arada arayüzün o PDF için istediği küçük resim / sayfa görüntüsü işçide dosyayı yeniden açıyor, yerine
    # koyma "başka bir programda açık" hatasıyla düşüyordu (Birleştir de üçünü işçinin kilidi içinde yapar); os.replace kısa sürer
    with _mupdf_kilidi():
        araclar._onbellekten_birak(hedef)
        araclar._yerine_koy(gecici, hedef)
    yazilan.add(_yol_anahtari(hedef))
    return [hedef], {}


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
            _sil_hepsi(gecici)
        _kaydi_sil()
        raise
    # Yerine koyma: bundan sonra iptale bakılmaz, ilerleme bildirilmez
    yazilan = set()
    kaynaklar = {_yol_anahtari(o["yol"]) for o in ogeler}
    for i, gecici, bilgi in hazirlar:
        oge = ogeler[i]
        try:
            yollar, ek = _yerine_koy_oge(oge, gecici, yazilan, kaynaklar, bilgi.get("sayfa"))
            s = dict({"yol": oge["yol"], "hedef": yollar[0], "hedefBicim": oge["hedefBicim"],
                      "boyut": sum(os.path.getsize(y) for y in yollar)}, **bilgi)
            s.update(ek)
            coklu = oge["hedefBicim"] in COKLU_HEDEFLER
            if coklu:
                s["hedefler"] = yollar
            if _yol_anahtari(yollar[0]) != _yol_anahtari(sayfa_adlari(oge["hedef"], len(yollar))[0] if coklu else oge["hedef"]):
                s["istenenHedef"] = oge["hedef"]   # yeni adla kaydedildi (cakisma: yeniAd)
            sonuclar[i] = s
        except Exception as e:
            sonuclar[i] = {"yol": oge["yol"], "hedef": oge["hedef"], "hedefBicim": oge["hedefBicim"],
                           "hata": _hata_metni(e, os.path.basename(oge["yol"])), "kod": _hata_kodu(e)}
            if getattr(e, "yazilanlar", None):
                sonuclar[i]["hedefler"] = e.yazilanlar
        finally:
            _sil_hepsi(gecici)
    _kaydi_sil()   # geçici dosyaların hepsi yerine kondu ya da silindi
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


def _kare_sayfasi(g_px, y_px, olcu):
    """TIFF karesinin sayfası (pt): araclar.a4_sayfa_olcusu (0.2.9). g_px, y_px: görünen yöndeki (yön etiketi uygulanmış) ölçü; olcu:
    _tiff_olculeri'nin satırı (genişlik, yükseklik, etiket dpi, yön)."""
    return araclar.a4_sayfa_olcusu(g_px, y_px, araclar.gorunen_dpi(olcu[2], olcu[3]))


def _sayfa_dpi(g_px, sayfa_g):
    """Görüntünün sayfadaki çözünürlüğü (piksel / inç; bilgi için, sonuçta ve donusum_bilgi'de)."""
    return round(g_px * 72.0 / sayfa_g, 1) if sayfa_g else None


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


def _tiff_karesi_ekle(doc, im, i, olculer, kilit):
    """TIFF'in i. karesini belgenin sonuna sayfa olarak ekler (TIFF → PDF'in ve tahminin ortak yolu; sayfa A4'e sığan ölçüde, _kare_sayfasi).
    kilit: MuPDF kilidi (bağlam). Döner: (kare G4 olarak gömüldüyse True, sayfadaki çözünürlüğü)."""
    im.seek(i)
    _kare_sinirla(im, i + 1)
    kare = _yon_uygula(im)
    sg, sy = _kare_sayfasi(kare.width, kare.height, olculer[i])
    dpi = _sayfa_dpi(kare.width, sg)
    if kare.mode == "1":
        g4 = _g4_kodla(kare)
        flate = zlib.compress(kare.tobytes(), FLATE_DUZEYI)
        ccitt = g4 is not None and len(g4[0]) < len(flate)
        veri = g4[0] if ccitt else flate
        with kilit():
            _bit_sayfasi_ekle(doc, kare.width, kare.height, sg, sy, veri, ccitt, g4[1] if ccitt else True)
        return ccitt, dpi
    duz = araclar._duzlestir(kare, exif=False)
    png = araclar._gorsel_kodla(duz, "orijinal")[0]
    del duz, kare
    with kilit():
        pg = doc.new_page(width=sg, height=sy)
        pg.insert_image(pg.rect, stream=png, keep_proportion=False)
    return False, dpi


def _tiff_pdf(kaynak, cikti, secenekler, ilerleme, baglam):
    im = _tiff_ac(kaynak)
    doc = None
    try:
        olculer = _tiff_olculeri(im)
        n = len(olculer)
        with baglam.mupdf():
            doc = pymupdf.open()
        g4_sayisi, ilk_dpi = 0, None
        for i in range(n):
            ilerleme(i / n, "Sayfa %d/%d" % (i + 1, n))
            g4, dpi = _tiff_karesi_ekle(doc, im, i, olculer, baglam.mupdf)
            g4_sayisi += 1 if g4 else 0
            ilk_dpi = dpi if i == 0 else ilk_dpi
        ilerleme(1.0, "Kaydediliyor…")
        with baglam.mupdf():
            try:
                doc.set_metadata({"producer": "PDEfe", "creator": "PDEfe"})
            except Exception:
                pass
            doc.save(cikti, **KAYIT_SECENEKLERI)
        return {"sayfa": n, "dpi": ilk_dpi, "g4Sayfa": g4_sayisi}
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
    None. Kare olmayan pikselde (yatay ve dikey çözünürlük farklı) None: seçilen dpi'de çizilir. MuPDF'e girer (get_image_info sayfanın
    içerik akışını çalıştırır; rect, derotation_matrix): MuPDF kilidinin içinde çağrılır (0.2.7 inceleme; _sayfa_ciz, _oge_tahmini)."""
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


def _tiff_secenekleri(secenekler):
    try:
        dpi = int(secenekler.get("dpi") or VARSAYILAN_TIFF_DPI)
    except (TypeError, ValueError):
        dpi = 0
    if dpi not in TIFF_DPILERI:
        raise OgeHatasi("gecersiz", "TIFF çözünürlüğü %s dpi olmalı." % " ya da ".join(str(d) for d in TIFF_DPILERI))
    renk = secenekler.get("renk") or "sb"
    if renk not in TIFF_RENKLERI:
        raise OgeHatasi("gecersiz", "Bilinmeyen renk seçeneği: %r" % (renk,))
    return dpi, renk


def _tiff_olcegi(pg, dpi):
    """PDF → TIFF'te sayfanın çizim ölçeği: seçilen dpi; taranmış sayfada görselin kendi çözünürlüğü (yeniden örneklenmez)."""
    return (_tarama_dpi(pg) or dpi) / 72.0


def _sayfa_ciz(pg, olcek, kip, kilit):
    """Sayfayı (notlarıyla) Pillow görüntüsüne çizer; MuPDF adımları kilitle. olcek: sayı ya da sayfadan ölçeği hesaplayan işlev (taranmış
    görselin çözünürlüğü MuPDF'e girer: kilidin içinde hesaplanır; 0.2.7 inceleme). olcek piksel sınırına göre küçültülür. Döner: (görüntü, dpi)."""
    Image = araclar._pillow()[0]
    with kilit():
        if callable(olcek):
            olcek = olcek(pg)
        olcek = _cekirdek().olcek_sinirla(pg.rect.width, pg.rect.height, olcek)
        pix = pg.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), colorspace=pymupdf.csRGB if kip == "RGB" else pymupdf.csGRAY,
                            alpha=False, annots=True)
        sayfa = Image.frombytes(kip, (pix.width, pix.height), pix.samples)
        del pix
    return sayfa, round(72.0 * olcek, 2)


def _tiff_sayfasi(pg, dpi, renk, kilit):
    """PDF → TIFF'in bir sayfası: (görüntü (sb'de 1 bit, eşikli), dpi, save seçenekleri)."""
    sayfa, d = _sayfa_ciz(pg, lambda p: _tiff_olcegi(p, dpi), "RGB" if renk == "renkli" else "L", kilit)
    if renk == "sb":
        sayfa = sayfa.point(ESIK_TABLOSU, "1")
    return sayfa, d, {"format": "TIFF", "compression": "group4" if renk == "sb" else "tiff_lzw", "dpi": (d, d)}


def _pdf_tiff(kaynak, cikti, secenekler, ilerleme, baglam):
    dpi, renk = _tiff_secenekleri(secenekler)
    from PIL import TiffImagePlugin
    with baglam.mupdf():
        doc = araclar._pdf_ac(kaynak)   # yalnızca PDF (filetype="pdf"), parolalıysa PermissionError
    dpiler = []
    try:
        n = doc.page_count
        if n == 0:
            raise OgeHatasi("bozuk", "Belgede sayfa yok: %s" % os.path.basename(kaynak))
        with TiffImagePlugin.AppendingTiffWriter(cikti, new=True) as tf:
            for i in range(n):
                ilerleme(i / n, "Sayfa %d/%d" % (i + 1, n))
                with baglam.mupdf():
                    pg = doc[i]
                sayfa, d, kayit = _tiff_sayfasi(pg, dpi, renk, baglam.mupdf)
                sayfa.save(tf, **kayit)
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


# ---------------------------------------------------------------- görüntü → PDF, PDF → JPG (0.2.7)
def _heif_destegi():
    """HEIC / HEIF açıcısı (pillow-heif) kurulu mu; kuruluysa Pillow'a kaydeder."""
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
        return True
    except Exception:   # ImportError ya da kitaplığın kendi hatası: HEIC açılamaz
        return False


def _gorsel_alt_hazir(alt=None):
    """Görüntünün alt türü bu bilgisayarda açılabiliyor mu: (bool, neden). HEIC / HEIF pillow-heif ister (pakette yok: 0.2.1'den beri
    Birleştir de almıyor); WEBP ve AVIF Pillow'un kendi kitaplıklarıyla."""
    try:
        araclar._pillow()
        from PIL import features
    except (RuntimeError, ImportError) as e:
        return False, str(e)
    if alt == "heif" and not _heif_destegi():
        return False, HEIF_YOK
    if alt in ("webp", "avif"):
        try:
            var = features.check(alt)
        except Exception:
            var = True
        if not var:
            return False, "%s görüntüleri bu bilgisayarda açılamıyor; görüntüyü önce JPG ya da PNG olarak kaydedin." % alt.upper()
    return True, None


def _gorsel_hazir(alt=None):
    return _gorsel_alt_hazir(alt)


def _gorsel_ac(yol, alt=None):
    """Görüntüyü açar (pikseller henüz çözülmez). Açılamazsa OgeHatasi: 'desteklenmiyor' (kitaplık yok) ya da 'bozuk'."""
    ok, neden = _gorsel_alt_hazir(alt)
    if not ok:
        raise OgeHatasi("desteklenmiyor", neden)
    Image = araclar._pillow()[0]
    try:
        return Image.open(yol)
    except Exception as e:
        raise OgeHatasi("bozuk", "Görüntü okunamadı (%s): %s" % (os.path.basename(yol), e))


def _exif_yonu(im):
    try:
        return int(im.getexif().get(0x0112, 1) or 1)
    except Exception:
        return 1


def gorsel_sayfa_olcusu(g_px, y_px, dpi_bilgisi, yon=1):
    """Görüntünün PDF'teki sayfa ölçüsü ve o sayfadaki çözünürlüğü (0.2.7; 0.2.9'dan beri araclar.a4_sayfa_olcusu: oranı korunarak A4'e sığan
    en büyük ölçü, dikeyse dikey, yataysa yatay A4; çözünürlük etiketi yalnızca yatay ve dikey çözünürlük farklıysa oranı belirler. 0.2.7–
    0.2.8'de geçerli dpi etiketi (100–1200) ya da uzun kenarı A4'ün uzun kenarına oturtan dpi). g_px, y_px: görünen yöndeki (EXIF yönü
    uygulanmış) piksel ölçüsü; dpi_bilgisi: Pillow'un info['dpi']'ı (dosyanın eksenlerinde; yön 5–8'de eksenler yer değiştirir). Döner:
    (sayfa_g pt, sayfa_y pt, x dpi, y dpi)."""
    sg, sy = araclar.a4_sayfa_olcusu(g_px, y_px, araclar.gorunen_dpi(dpi_bilgisi, yon))
    return sg, sy, _sayfa_dpi(g_px, sg), _sayfa_dpi(y_px, sy)


def _webp_kayipli(yol):
    """WEBP'nin kayıplı mı olduğu: kayıpsız WEBP'de görüntü parçası 'VP8L', kayıplıda 'VP8 '."""
    try:
        with open(yol, "rb") as f:
            bas = f.read(64 * 1024)
    except OSError:
        return True
    return b"VP8L" not in bas[12:]


def _gorsel_gomulecek(yol, im, duz, kare_kipi, yon, bicim):
    """PDF'e gömülecek bayt: (bayt, dondurme (saat yönünde), gomme). Dokunulmadan gömülebilen JPEG (EXIF yönü yok ya da yalnızca döndürme,
    kip değişmedi): dosyanın kendisi, yön PDF'te döndürülür ('ozgun'; Birleştir'in kuralı, yeniden kodlanmaz). Öteki kayıplı kaynak (HEIC,
    AVIF, kayıplı WEBP, CMYK ya da aynalı yönlü JPEG) JPEG kalite 92 ('jpeg'): kayıpsız PNG bir telefon fotoğrafında 15–25 MB olurdu. Kayıpsız
    kaynak (PNG, BMP, GIF, kayıpsız WEBP) kayıpsız PNG ('kayipsiz'; MuPDF Flate yazar)."""
    if bicim == "JPEG" and yon in araclar.EXIF_DONUSU and duz.mode == kare_kipi:
        with open(yol, "rb") as f:
            return f.read(), araclar.EXIF_DONUSU[yon], "ozgun"
    if (bicim in KAYIPLI_GORSELLER or (bicim == "WEBP" and _webp_kayipli(yol))) and duz.mode in ("RGB", "L"):
        alt = 2   # HEIC, AVIF, WEBP neredeyse hep 4:2:0
        if bicim in ("JPEG", "MPO"):
            try:
                from PIL import JpegImagePlugin
                alt = JpegImagePlugin.get_sampling(im)
            except Exception:
                alt = 0
        buf = io.BytesIO()
        duz.save(buf, format="JPEG", quality=YENIDEN_KODLAMA_KALITESI, optimize=True, subsampling=alt if alt in (0, 1, 2) else 0)
        return buf.getvalue(), 0, "jpeg"
    return araclar._gorsel_kodla(duz, "orijinal")[0], 0, "kayipsiz"


def _gorsel_pdf(kaynak, cikti, secenekler, ilerleme, baglam):
    """Görüntü → PDF (tek sayfa): sayfa ölçüsü gorsel_sayfa_olcusu (A4'e sığan ölçü), görüntü sayfayı kenardan kenara kaplar, EXIF yönü uygulanır. Hareketli
    GIF / WEBP'de ilk kare (uyarıyla)."""
    ilerleme(0, "Görüntü okunuyor…")
    bayt, sg, sy, dondurme, r = _gorsel_sayfasi_hazirla(kaynak, baglam.alt, lambda: ilerleme(0.4, "PDF'e yazılıyor…"))
    with baglam.mupdf():
        doc = pymupdf.open()
        try:
            araclar._gorsel_sayfasi_ekle(doc, bayt, sg, sy, dondurme)
            try:
                doc.set_metadata({"producer": "PDEfe", "creator": "PDEfe"})
            except Exception:
                pass
            doc.save(cikti, **KAYIT_SECENEKLERI)
        finally:
            araclar._kapat(doc)
    return r


def _gorsel_sayfasi_hazirla(kaynak, alt, okundu=None):
    """Görüntünün PDF sayfası (görüntü → PDF'in ve tahminin ortak yolu): (gömülecek bayt, sayfa_g, sayfa_y, dondurme, sonuç bilgisi)."""
    im = _gorsel_ac(kaynak, alt)
    try:
        bicim = (im.format or "").upper()
        kareler = getattr(im, "n_frames", 1) or 1
        _kare_sinirla(im, 1)
        yon = _exif_yonu(im)
        kare_kipi = im.mode
        try:
            im.load()
            duz = araclar._duzlestir(im)
        except (MemoryError, OgeHatasi):
            raise
        except Exception as e:
            raise OgeHatasi("bozuk", "Görüntü okunamadı (%s): %s" % (os.path.basename(kaynak), e))
        sg, sy, xd, _ = gorsel_sayfa_olcusu(duz.width, duz.height, im.info.get("dpi"), yon)
        if okundu is not None:
            okundu()
        bayt, dondurme, gomme = _gorsel_gomulecek(kaynak, im, duz, kare_kipi, yon, bicim)
        del duz
    finally:
        im.close()
    r = {"sayfa": 1, "dpi": xd, "gomme": gomme}
    if kareler > 1:
        r["uyari"] = "Hareketli görüntünün yalnızca ilk karesi alındı."
    return bayt, sg, sy, dondurme, r


def _gorsel_bilgi(yol, alt, genislik):
    """donusum_bilgi'nin görüntü bölümü: sayfa 1, PDF'teki sayfa ölçüsü (pt; A4'e sığan ölçü), dpi (o sayfadaki), pikselGenislik / pikselYukseklik (görünen
    yönde), gorselBicimi, küçük resim (JPEG'de taslak çözümle: 12 MP fotoğrafta onda biri sürede)."""
    im = _gorsel_ac(yol, alt)
    try:
        Image = araclar._pillow()[0]
        bicim = (im.format or "").upper()
        yon = _exif_yonu(im)
        g, y = im.size
        if yon in (5, 6, 7, 8):
            g, y = y, g
        sg, sy, xd, _ = gorsel_sayfa_olcusu(g, y, im.info.get("dpi"), yon)
        _kare_sinirla(im, 1)
        kareler = getattr(im, "n_frames", 1) or 1
        if bicim == "JPEG":
            try:
                im.draft("RGB", (2 * genislik, 2 * genislik))
            except Exception:
                pass
        im.load()
        kucuk = araclar._duzlestir(im)
        if kucuk.mode not in ("RGB", "L"):
            kucuk = kucuk.convert("RGB" if kucuk.mode != "1" else "L")
        if kucuk.width > genislik:
            kat = kucuk.width // (2 * genislik)
            if kat >= 2:
                kucuk = kucuk.reduce(kat)
            kucuk = kucuk.resize((genislik, max(1, int(round(kucuk.height * genislik / kucuk.width)))), Image.LANCZOS)
        buf = io.BytesIO()
        kucuk.save(buf, format="PNG", optimize=True)
        s = {"sayfa": 1, "genislik": round(sg, 2), "yukseklik": round(sy, 2), "dpi": xd,
             "pikselGenislik": g, "pikselYukseklik": y, "gorselBicimi": bicim.lower(),
             "png": base64.b64encode(buf.getvalue()).decode("ascii"), "pngGenislik": kucuk.width, "pngYukseklik": kucuk.height}
        if kareler > 1:
            s["uyari"] = "Hareketli görüntü: yalnızca ilk karesi dönüştürülür."
        return s
    except (OgeHatasi, MemoryError):
        raise
    except Exception as e:
        raise OgeHatasi("bozuk", "Görüntü okunamadı (%s): %s" % (os.path.basename(yol), e))
    finally:
        im.close()


def _jpg_yazici_hazir():
    try:
        araclar._pillow()
        from PIL import features
        if not features.check("jpg"):
            return False, "JPEG yazıcısı yok."
    except (RuntimeError, ImportError) as e:
        return False, str(e)
    return True, None


def _jpg_dpi(secenekler):
    try:
        dpi = int(secenekler.get("dpi") or VARSAYILAN_JPG_DPI)
    except (TypeError, ValueError):
        dpi = 0
    if dpi not in JPG_DPILERI:
        raise OgeHatasi("gecersiz", "JPG çözünürlüğü %s dpi olmalı." % " ya da ".join(str(d) for d in JPG_DPILERI))
    return dpi


def _jpg_olcegi(pg, dpi):
    """PDF → JPG'de sayfanın çizim ölçeği: seçilen dpi; tek görselden oluşan (taranmış) sayfada görselin kendi çözünürlüğü seçilenden
    küçükse o (büyütmek yalnızca dosyayı büyütür; TIFF'ten farkı: seçilenden büyük tarama seçilene küçültülür, kullanıcı boyutu seçti)."""
    t = _tarama_dpi(pg)
    return (min(t, dpi) if t else dpi) / 72.0


def _jpg_sayfasi(pg, dpi, kilit):
    """PDF → JPG'nin bir sayfası: (görüntü, dpi, save seçenekleri)."""
    sayfa, d = _sayfa_ciz(pg, lambda p: _jpg_olcegi(p, dpi), "RGB", kilit)
    return sayfa, d, {"format": "JPEG", "quality": JPG_KALITESI, "optimize": True, "dpi": (d, d)}


def _pdf_gorsel(kaynak, cikti, secenekler, ilerleme, baglam):
    """PDF → JPG: her sayfa ayrı JPEG (kalite JPG_KALITESI, dpi etiketli, notlar dâhil), çıktı klasörüne 1.jpg, 2.jpg…; adları çatı koyar
    (sayfa_adlari). secenekler: {dpi: 300 | 200 (varsayılan 300)}."""
    dpi = _jpg_dpi(secenekler)
    with baglam.mupdf():
        doc = araclar._pdf_ac(kaynak)   # yalnızca PDF (filetype="pdf"), parolalıysa PermissionError
    dpiler = []
    try:
        n = doc.page_count
        if n == 0:
            raise OgeHatasi("bozuk", "Belgede sayfa yok: %s" % os.path.basename(kaynak))
        os.makedirs(cikti, exist_ok=True)
        for i in range(n):
            ilerleme(i / n, "Sayfa %d/%d" % (i + 1, n))
            with baglam.mupdf():
                pg = doc[i]
            sayfa, d, kayit = _jpg_sayfasi(pg, dpi, baglam.mupdf)
            sayfa.save(os.path.join(cikti, "%d.jpg" % (i + 1)), **kayit)
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
donusturucu_kaydet("gorsel", "pdf", _gorsel_pdf, _gorsel_hazir)
donusturucu_kaydet("pdf", "gorsel", _pdf_gorsel, _jpg_yazici_hazir)


# ---------------------------------------------------------------- başka araçlar için: belgeyi PDF'e (0.2.7, Birleştir)
class AsamaIlerlemesi:
    """Başka bir aracın işindeki dönüştürme adımının ilerlemesi (Baglam'a verilir): oran (0–1) yüzdeye çevrilir (taban + aralık × oran),
    bildirim seyreltilir (yüzde değişince ya da 0,25 sn'de bir); her çağrıda iptale (iptal_mi) ve çekirdeğin kapanışına bakılır."""

    def __init__(self, yaz, iptal_mi, taban, aralik, on=""):
        self._yaz, self._iptal_mi = yaz, iptal_mi
        self.taban, self.aralik, self.on = float(taban), float(aralik), on
        self._son_yuzde, self._son_zaman = -1, 0.0

    def denetle(self):
        if _kapaniyor.is_set() or (callable(self._iptal_mi) and self._iptal_mi()):
            raise _cekirdek().IptalEdildi()

    def bildir(self, oran, mesaj=""):
        self.denetle()
        yuzde = int(self.taban + self.aralik * min(max(float(oran or 0), 0.0), 1.0))
        simdi = time.monotonic()
        if not callable(self._yaz) or (yuzde == self._son_yuzde and simdi - self._son_zaman < 0.25):
            return
        self._son_yuzde, self._son_zaman = yuzde, simdi
        self._yaz(yuzde, self.on + (": " + mesaj if mesaj and self.on else mesaj))


def pdf_e_cevir(yol, cikti, il):
    """PDF olmayan belgeyi (UDF, Word, TIFF, görüntü) cikti'ye PDF olarak yazar (0.2.7, Birleştir'de belgeler önce PDF'e). il: bildir(oran,
    mesaj) ve denetle() taşıyan nesne (AsamaIlerlemesi). DÖNÜŞTÜRME İŞ PARÇACIĞINDA çağrılır (arka_planda): Word'ün COM'u ve UDE köprüsünün
    oturumu oraya bağlı. Döner: dönüştürücünün sonucu ({sayfa?, uyari?, ...}). Yapılamazsa OgeHatasi ('desteklenmiyor': UDE / Java / Word
    yok, nedeniyle; 'taninmadi', 'bozuk', …)."""
    tur, alt = tur_bul(yol)
    ad = os.path.basename(yol)
    if tur == "bilinmeyen":
        raise OgeHatasi("taninmadi", "Dosyanın biçimi tanınmadı: %s" % ad)
    if tur == "pdf":
        raise OgeHatasi("ayni_bicim", "Dosya zaten PDF: %s" % ad)
    _girdi_denetle(yol, tur, alt)
    plan = _plan(tur, "pdf")
    ok, neden = _plan_hazir(plan, alt)
    if not ok:
        raise OgeHatasi("desteklenmiyor", neden or "Bu dönüştürme bu bilgisayarda yapılamıyor.")
    baglam = Baglam(alt, il)
    try:
        r = plan[0].islev(yol, cikti, {}, il.bildir, baglam)
    finally:
        baglam.temizle()
    if not os.path.isfile(cikti):
        raise OgeHatasi("hata", "Dönüştürme çıktı üretmedi: %s" % ad)
    return r if isinstance(r, dict) else {}


def pdf_e_cevrilebilir(tur, alt=None):
    """Bu türden PDF'e çevirme bu bilgisayarda yapılabiliyor mu: (bool, neden)."""
    try:
        return _plan_hazir(_plan(tur, "pdf"), alt)
    except OgeHatasi as e:
        return False, str(e)


def arka_planda(is_, bitir):
    """is_() dönüştürme iş parçacığında, sıradaki dönüştürmelerden sonra çalışır; bitince bitir(sonuc, hata). Döner: önünde bekleyen iş
    sayısı (0.2.7, Birleştir'in belgeli işi)."""
    return _calistir(is_, bitir)


def gecici_klasor_ac():
    """Çekirdeğin pid'iyle adlanan geçici klasör (çökme olursa sonraki çekirdek kalintilari_temizle ile siler); işi biten siler."""
    return tempfile.mkdtemp(prefix="%s%d-" % (GECICI_ONEKI, os.getpid()))


# ---------------------------------------------------------------- boyut tahmini (0.2.7, madde 8)
# donusum_tahmini {yollar: [yol] (ya da yol), hedefBicim: 'tiff' | 'gorsel', renk?: 'sb' | 'gri' | 'renkli' (TIFF; varsayılan 'sb')}
#   → (Ertelenmis; tahmin iş parçacığında) {ideal: bayt (300 dpi), dusuk: bayt (200 dpi), sayfa, tahmin (örneklendi mi), eksik: [yol],
#      ogeler: [{yol, tur, sayfa, ideal, dusuk, ornek, tahmin} | {yol, tur?, tahminYok: true, neden}], sure}
#   Aracın "İdeal ≈ x MB / Düşük ≈ y MB" yazısı için (Birleştir'in kucult_tahmin / boyut_tahmini deseni). Belgeden en çok TAHMIN_ORNEK
#   sayfa (gri / renkli TIFF'te TAHMIN_ORNEK_RENKLI; baştan sona eşit aralıklı) dönüştürücünün kendi çizim ve kodlama yoluyla (_tiff_sayfasi,
#   _jpg_sayfasi) bellekte kodlanır, toplam sayfa sayısına oranlanır; az sayfalı belgede bütün sayfalar (tahmin false: kesin). TIFF kaynağı
#   (TIFF → JPG) ve görüntü kaynağı önce yalnızca örnek kareleri bellekte PDF sayfasına çevrilir (_tiff_karesi_ekle, _gorsel_sayfasi_hazirla).
#   UDF ve Word kaynağı tahmin edilmez (önce dönüştürülmeleri gerekir: UDE / Word; tahminYok, eksik'e yazılır). Açılamayan dosya yalnızca kendi
#   öğesinde hata (neden). Sonuç dosyanın değişme zamanı ve boyutuyla ön bellekte; iptal sayfa aralarında (-32800). Tahmin iş parçacığı
#   dönüştürmeden ayrıdır (süren dönüştürme tahmini bekletmez); MuPDF adımları mupdf_kilidi içinde.
TAHMIN_ORNEK = 5
TAHMIN_ORNEK_RENKLI = 3
TAHMIN_DPILERI = (("ideal", 300), ("dusuk", 200))
_tahmin_onbellegi = {}
_tahmin_kuyrugu = queue.Queue()
_tahmin_is_parcacigi = None
_tahmin_kilidi = threading.Lock()
_tahmin_durum = threading.Condition()
_tahmin_bekleyen = 0               # sıradaki + süren tahmin sayısı (kapanirken bitmelerini bekler)


def _ornek_sayfalar(n, k):
    if n <= k:
        return list(range(n))
    return sorted({int(round(j * (n - 1) / float(k - 1))) for j in range(k)})


def _tahmin_dongu():
    global _tahmin_bekleyen
    while True:
        is_, bitir = _tahmin_kuyrugu.get()
        try:
            sonuc, hata = is_(), None
        except Exception as e:
            sonuc, hata = None, e
        try:
            if not _kapaniyor.is_set():   # çekirdek kapanıyor: yanıt yazılmaz (ana iş parçacığı yorumlayıcıyı kapatırken stdout'a yazılmasın)
                bitir(sonuc, hata)
        except Exception as e:
            print("[donustur] tahmin yanıtı yazılamadı: %s" % e, file=sys.stderr)
        finally:
            with _tahmin_durum:
                _tahmin_bekleyen -= 1
                _tahmin_durum.notify_all()


def _tahmin_calistir(is_, bitir):
    global _tahmin_is_parcacigi, _tahmin_bekleyen
    with _tahmin_kilidi:
        if _tahmin_is_parcacigi is None:
            _tahmin_is_parcacigi = threading.Thread(target=_tahmin_dongu, name="donusum-tahmini", daemon=True)
            _tahmin_is_parcacigi.start()
    with _tahmin_durum:
        _tahmin_bekleyen += 1
    _tahmin_kuyrugu.put((is_, bitir))


def _ornek_belgesi(yol, tur, alt, k, kilit):
    """Örneklenecek PDF ve sayfaları: (doc, örnek sayfa numaraları, toplam sayfa). PDF'te belgenin kendisi; TIFF'te yalnızca örnek kareler,
    görüntüde tek sayfa bellekteki yeni belgeye. doc çağıranca kapatılır."""
    if tur == "pdf":
        with kilit():
            doc = araclar._pdf_ac(yol)
        n = doc.page_count
        return doc, _ornek_sayfalar(n, k), n
    with kilit():
        doc = pymupdf.open()
    try:
        if tur == "tiff":
            im = _tiff_ac(yol)
            try:
                olculer = _tiff_olculeri(im)
                n = len(olculer)
                for i in _ornek_sayfalar(n, k):
                    _tiff_karesi_ekle(doc, im, i, olculer, kilit)
            finally:
                im.close()
            return doc, list(range(doc.page_count)), n
        bayt, sg, sy, dondurme, _ = _gorsel_sayfasi_hazirla(yol, alt)
        with kilit():
            araclar._gorsel_sayfasi_ekle(doc, bayt, sg, sy, dondurme)
        return doc, [0], 1
    except BaseException:
        with kilit():
            araclar._kapat(doc)
        raise


def _oge_tahmini(yol, hedef, renk, il):
    """Bir dosyanın iki çözünürlükteki çıktı boyutu: {tur, sayfa, ideal, dusuk, ornek, tahmin}."""
    st = os.stat(yol)
    tur, alt = tur_bul(yol)
    anahtar = (_yol_anahtari(yol), st.st_mtime_ns, st.st_size, hedef, renk if hedef == "tiff" else None)
    with _tahmin_kilidi:
        k = _tahmin_onbellegi.get(anahtar)
    if k is not None:
        return dict(k)
    if tur in ("udf", "word") or tur == "bilinmeyen" or tur == hedef:
        neden = {"udf": "UDF'nin boyutu dönüştürülmeden kestirilemiyor.", "word": "Word belgesinin boyutu dönüştürülmeden kestirilemiyor.",
                 "bilinmeyen": "Dosyanın biçimi tanınmadı."}.get(tur, "Dosya zaten bu biçimde.")
        return {"tur": tur, "tahminYok": True, "neden": neden}
    _girdi_denetle(yol, tur, alt)
    if tur == "gorsel":
        ok, neden = _gorsel_alt_hazir(alt)
        if not ok:
            return {"tur": tur, "tahminYok": True, "neden": neden}
    kilit = _mupdf_kilidi
    sayi = TAHMIN_ORNEK_RENKLI if (hedef == "tiff" and renk != "sb") else TAHMIN_ORNEK
    doc, ornekler, n = _ornek_belgesi(yol, tur, alt, sayi, kilit)
    try:
        toplam = {ad: 0 for ad, _ in TAHMIN_DPILERI}
        for j, no in enumerate(ornekler):
            il(j / max(len(ornekler), 1))
            with kilit():
                pg = doc[no]
            onceki = None
            for ad, dpi in TAHMIN_DPILERI:
                with kilit():   # taranmış görselin çözünürlüğü MuPDF'e girer (0.2.7 inceleme)
                    olcek = (_tiff_olcegi(pg, dpi) if hedef == "tiff" else _jpg_olcegi(pg, dpi))
                if onceki is not None and abs(olcek - onceki[0]) < 1e-9:
                    toplam[ad] += onceki[1]   # taranmış sayfa: iki çözünürlükte aynı çizim
                    continue
                sayfa, d, kayit = _tiff_sayfasi(pg, dpi, renk, kilit) if hedef == "tiff" else _jpg_sayfasi(pg, dpi, kilit)
                buf = io.BytesIO()
                sayfa.save(buf, **kayit)
                del sayfa
                toplam[ad] += buf.tell()
                onceki = (olcek, buf.tell())
                il(j / max(len(ornekler), 1))
    finally:
        with kilit():
            araclar._kapat(doc)
    m = len(ornekler)
    s = {"tur": tur, "sayfa": n, "ornek": m, "tahmin": m < n}
    for ad, _ in TAHMIN_DPILERI:
        s[ad] = int(round(toplam[ad] * n / float(max(m, 1)))) if m else 0
    with _tahmin_kilidi:
        while len(_tahmin_onbellegi) >= 128:
            _tahmin_onbellegi.pop(next(iter(_tahmin_onbellegi)))
        _tahmin_onbellegi[anahtar] = dict(s)
    return s


def y_donusum_tahmini(p):
    yollar = p.get("yollar")
    if yollar is None and p.get("yol") is not None:
        yollar = [p.get("yol")]
    if not isinstance(yollar, list) or not yollar:
        raise ValueError("Tahmin edilecek dosya yok.")
    if len(yollar) > EN_FAZLA_OGE:
        raise ValueError("Bir seferde en çok %d dosya." % EN_FAZLA_OGE)
    yollar = [araclar._mutlak(y, "yol") for y in yollar]
    hedef = p.get("hedefBicim")
    if hedef not in ("tiff", "gorsel"):
        raise ValueError("Boyut tahmini yalnızca TIFF ve JPG için: %r" % (hedef,))
    renk = p.get("renk") or "sb"
    if hedef == "tiff" and renk not in TIFF_RENKLERI:
        raise ValueError("Bilinmeyen renk seçeneği: %r" % (renk,))
    il = _Ilerleme(p)

    def is_():
        bas = time.monotonic()
        ogeler, eksik = [], []
        toplam = {"ideal": 0, "dusuk": 0, "sayfa": 0}
        tahmin = False
        n = len(yollar)
        for i, yol in enumerate(yollar):
            il.oge(i, n, os.path.basename(yol))
            il.bildir(0)
            try:
                s = _oge_tahmini(yol, hedef, renk, il.bildir)
            except _iptal_siniflari():
                raise
            except Exception as e:
                s = {"tahminYok": True, "neden": _hata_metni(e, os.path.basename(yol)), "kod": _hata_kodu(e)}
            s["yol"] = yol
            ogeler.append(s)
            if s.get("tahminYok"):
                eksik.append(yol)
                continue
            for a in toplam:
                toplam[a] += s[a]
            tahmin = tahmin or s["tahmin"]
        return dict(toplam, tahmin=tahmin, eksik=eksik, ogeler=ogeler, sure=round(time.monotonic() - bas, 2))
    return _cekirdek().Ertelenmis(lambda bitir: _tahmin_calistir(is_, bitir))


def kaydol(yontemler):
    # Önceki çekirdeklerin çökmede bıraktıkları (kalintilari_temizle) açılışı geciktirmeden silinir
    threading.Thread(target=lambda: _sessiz(kalintilari_temizle), name="donustur-bakim", daemon=True).start()
    yontemler["donusum_yetenekleri"] = y_donusum_yetenekleri
    yontemler["donusum_bilgi"] = y_donusum_bilgi
    yontemler["bicim_donustur"] = y_bicim_donustur
    yontemler["donusum_tahmini"] = y_donusum_tahmini
