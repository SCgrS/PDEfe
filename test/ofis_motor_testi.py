# -*- coding: utf-8 -*-
"""Ofis motorları testi (0.3.1; core/islemler/word.py): Word belgesini PDF'e çeviren programın seçimi ve WPS Office ile LibreOffice yolları. Girdiler kurgusal,
burada üretilir; çıktılar test/cikti/ofis_motor altında.

Çalıştırma (görünmeyen masaüstünde: WPS ekrana pencere açabilir):
  .venv\\Scripts\\python.exe -X utf8 test\\ofis_motor_testi.py [--exe core\\dist\\pdefe-core\\pdefe-core.exe] [--wps-bildirim]
--exe: Paketli çekirdekle (modülün içine bakan bölümler atlanır). --wps-bildirim: WPS'in kurulum kilidi duruyorsa ön denetimi kapatıp gerçek WPS'in penceresini
yakalar (yalnız görünmeyen masaüstünde çalıştırın). Word burada BAŞLATILMAZ (Word'ün yolu test/word_donusum_testi.py'de). Kurulu olmayan motorun bölümü ATLANDI der.

Bölümler:
  A) Karar: Word.Application kaydı wps.exe'yi gösteriyorsa Word yok sayılır, sınama değişkenleri, ön bellek.
  B) Sıra: Motor başarısızsa sıradakine düşülür, belge sorununda düşülmez, hepsi başarısızsa anlaşılır ileti (sahte motorlarla).
  C) WPS oturumu sahte nesne modeliyle: Kendi süreci, kullanıcının açık örneği (Quit yok, süreç yaşıyor, Visible değişmez), asılı kalma (yalnız bizimki sonlanır), küçük
     pencere, makro, kurulum kilidi. "Süreçler" bu testin başlattığı zararsız Python süreçleridir.
  D) LibreOffice süre aşımı ve iptal: Yerine geçen .cmd ile (gerçek LibreOffice sonlandırılmaz).
  E) Her gerçek motor için (PDEFE_OFIS_MOTORU, ayrı çekirdek süreci): DOCX, DOCM, DOC, RTF, ODT → PDF (Türkçe ve boşluklu adlar), sayfa, sözcük geri çağırma, üst veri yok, zincirler (UDF, TIFF, JPG),
     Birleştir, bozuk belge, kalıntı yok, açık LibreOffice süreçleri yerinde.
  F) WPS: Kurulum kilidi duruyorsa hiç başlatılmaz, LibreOffice'e düşülür. Kilit yoksa gerçek dönüştürme ve açık belgeli WPS.
  G) Motor yokken: Anlaşılır neden, Word'süz çalışan öbür türler (TIFF, JPG, PNG, BMP, GIF, WEBP, PDF), bozuk dosyalarda ham metin yok.
"""
import ctypes
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import zipfile

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORE = os.path.join(KOK, "core")
sys.path.insert(0, CORE)
sys.path.insert(0, os.path.join(KOK, "test"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
import word_donusum_testi as W  # noqa: E402  (girdi üreticileri ve ölçüler)
from ev_denetimi import ev_degistirilmis  # noqa: E402

CIKTI = os.path.join(KOK, "test", "cikti", "ofis_motor")
GIRDI = os.path.join(CIKTI, "girdi")
WINDOWS = sys.platform == "win32"
YAZAR = "PDEfe Sınama Yazarı"
hata = toplam = 0


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if ok or ayrinti == "" else " — " + str(ayrinti)))


def atlandi(ad, neden):
    print("ATLANDI " + ad + " — " + neden)


def temiz_metin(m):
    """Kullanıcıya gidecek ileti: Noktalı virgül, ham COM kodu, İngilizce kitaplık metni yok."""
    m = str(m or "")
    return ";" not in m and "0x" not in m and "Error" not in m and "Traceback" not in m and "not a " not in m and "cannot " not in m


# ---------------------------------------------------------------- girdiler
SAYFALAR = [("Başlık %d Çığöşü" % (i + 1), W.paragraflar(40 + i, 5)) for i in range(3)]
OZGUN = W.metin_sozcukleri([b for b, pler in SAYFALAR for b in [b] + pler])
AD_KOKU = "İş Bankası dilekçe ÇĞİÖŞÜ"


def girdileri_uret():
    shutil.rmtree(CIKTI, ignore_errors=True)
    os.makedirs(GIRDI)
    g = {}
    g["docx"] = os.path.join(GIRDI, AD_KOKU + ".docx")
    W.docx_yaz(g["docx"], SAYFALAR, yazar=YAZAR)
    g["rtf"] = os.path.join(GIRDI, AD_KOKU + ".rtf")
    W.rtf_yaz(g["rtf"], SAYFALAR)
    g["odt"] = os.path.join(GIRDI, AD_KOKU + ".odt")
    W.odt_yaz(g["odt"], SAYFALAR)
    g["docm"] = W.makrosuz_docm(g["docx"], os.path.join(GIRDI, AD_KOKU + ".docm"))
    # Bozuk girdiler
    g["bozuk_docx"] = os.path.join(GIRDI, "bozuk.docx")
    with zipfile.ZipFile(g["docx"]) as a, zipfile.ZipFile(g["bozuk_docx"], "w") as b:
        for i in a.infolist():
            v = a.read(i.filename)
            b.writestr(i, v[:len(v) // 2] if i.filename == "word/document.xml" else v)
    g["bozuk_zip"] = os.path.join(GIRDI, "bozuk_zip.docx")
    with open(g["docx"], "rb") as f:
        v = f.read()
    with open(g["bozuk_zip"], "wb") as f:
        f.write(v[:len(v) // 3])
    # Parolalılar (motorlar başlatılmadan reddedilir): Gerçek biçimin imzası
    g["sifreli_doc"] = os.path.join(GIRDI, "parolali.doc")
    sifreli_doc_yaz(g["sifreli_doc"])
    g["sifreli_odt"] = os.path.join(GIRDI, "parolali.odt")
    with zipfile.ZipFile(g["sifreli_odt"], "w") as z:
        z.writestr("mimetype", "application/vnd.oasis.opendocument.text")
        z.writestr("content.xml", b"\x00\x01sifreli")
        z.writestr("META-INF/manifest.xml", '<m:manifest xmlns:m="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><m:file-entry m:full-path="content.xml"><m:encryption-data/></m:file-entry></m:manifest>')
    # Görüntüler
    from PIL import Image
    im = Image.new("RGB", (800, 1100), "white")
    for ad, biçim in (("jpg", "JPEG"), ("png", "PNG"), ("bmp", "BMP"), ("gif", "GIF"), ("webp", "WEBP"), ("tif", "TIFF")):
        g[ad] = os.path.join(GIRDI, "goruntu." + ad)
        im.save(g[ad], format=biçim)
    g["bozuk_jpg"] = os.path.join(GIRDI, "bozuk.jpg")
    with open(g["bozuk_jpg"], "wb") as f:
        f.write(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x13" * 64)
    g["bozuk_tif"] = os.path.join(GIRDI, "bozuk.tif")
    with open(g["bozuk_tif"], "wb") as f:
        f.write(b"II*\x00" + b"\xff" * 32)
    g["bozuk_webp"] = os.path.join(GIRDI, "bozuk.webp")
    with open(g["bozuk_webp"], "wb") as f:
        f.write(b"RIFF\x20\x00\x00\x00WEBPVP8 " + b"\x00" * 16)
    g["bilinmeyen"] = os.path.join(GIRDI, "metin.docx")
    with open(g["bilinmeyen"], "wb") as f:
        f.write(b"bu bir word belgesi degil")
    g["pdf"] = os.path.join(GIRDI, "belge.pdf")
    W.sentetik_pdf(g["pdf"])
    return g


def sifreli_doc_yaz(yol):
    """Parolalı .doc'un OLE kabı: Dizinde WordDocument girdisi, akışın başında FIB'de fEncrypted ([MS-DOC]). Motor bu dosyayı görmemeli."""
    ad = "WordDocument".encode("utf-16-le")
    giris = bytearray(128)
    giris[:len(ad)] = ad
    giris[116:120] = (1).to_bytes(4, "little")      # ilk kesim 1 (dosyada 2. kesim, 1024. bayt)
    giris[120:128] = (8192).to_bytes(8, "little")
    fib = bytearray(8192)
    fib[0:2] = b"\xec\xa5"
    fib[10:12] = (0x0100).to_bytes(2, "little")     # fEncrypted
    bas = bytearray(512)
    bas[:8] = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    bas[0x1E:0x20] = (9).to_bytes(2, "little")      # kesim 512 bayt
    with open(yol, "wb") as f:
        f.write(bytes(bas) + bytes(giris) + bytes(384) + bytes(fib))


def soffice_yolu():
    from islemler import word
    return word.libreoffice_bul()


def doc_uret(g):
    """.doc yalnız bir ofis programıyla üretilir: LibreOffice varsa (taze profil). Yoksa .doc denemesi atlanır."""
    so = soffice_yolu()
    if not so:
        return
    import pathlib
    profil = tempfile.mkdtemp(prefix="pdefe-sinama-doc-")
    klasor = os.path.join(CIKTI, "doc_uretim")
    os.makedirs(klasor, exist_ok=True)
    kaynak = os.path.join(klasor, "kaynak.docx")
    shutil.copyfile(g["docx"], kaynak)
    try:
        subprocess.run([so, "-env:UserInstallation=" + pathlib.Path(profil).as_uri(), "--headless", "--norestore", "--nologo", "--nolockcheck",
                        "--convert-to", "doc:MS Word 97", "--outdir", klasor, kaynak], capture_output=True, timeout=90,
                       creationflags=subprocess.CREATE_NO_WINDOW if WINDOWS else 0)
    except subprocess.TimeoutExpired:
        print("UYARI .doc üretilemedi (süre doldu)")
    finally:
        shutil.rmtree(profil, ignore_errors=True)
    uretilen = os.path.join(klasor, "kaynak.doc")
    if os.path.isfile(uretilen):
        g["doc"] = os.path.join(GIRDI, AD_KOKU + ".doc")
        shutil.copyfile(uretilen, g["doc"])


# ---------------------------------------------------------------- A) karar
def test_karar():
    print("— A) Motor kararı")
    from islemler import word, donustur
    gecici = tempfile.mkdtemp(prefix="pdefe-sinama-kayit-")
    gercek = os.path.join(gecici, "WINWORD.EXE")
    wps = os.path.join(gecici, "wps.exe")
    for y in (gercek, wps):
        open(y, "wb").close()
    try:
        sonuc("kayıt wps.exe'yi gösteriyor: Word yok", word.word_karari("{X}", ['"%s" /Automation' % wps]) is None)
        sonuc("iki görünümden biri gerçek Word: Word var", (word.word_karari("{X}", ['"%s" /Automation' % wps, '"%s" /Automation' % gercek]) or {}).get("yol") == gercek)
        sonuc("kayıttaki Word dosyası yok: Word yok (bayat kayıt)", word.word_karari("{X}", ['"%s" /Automation' % os.path.join(gecici, "yok", "WINWORD.EXE")]) is None)
        sonuc("hiç sunucu kaydı yok: ProgID'ye güvenilir", word.word_karari("{X}", []) == {"yol": None, "clsid": "{X}"})
        sonuc("tırnaksız yol", (word.word_karari("{X}", ["%s /Automation" % gercek]) or {}).get("yol") == gercek)
    finally:
        shutil.rmtree(gecici, ignore_errors=True)
    es = {k: os.environ.get(k) for k in ("PDEFE_OFIS_MOTORU", "PDEFE_WORD_YOK", "PDEFE_SINAMA_WORD_KOMUTU")}
    try:
        for k in es:
            os.environ.pop(k, None)
        sonuc("değişken yokken hepsi", word._kurulu_sayilanlar() == word.MOTORLAR)
        os.environ["PDEFE_OFIS_MOTORU"] = "wps, LibreOffice"
        sonuc("PDEFE_OFIS_MOTORU virgüllü", word._kurulu_sayilanlar() == ("wps", "libreoffice"))
        os.environ["PDEFE_OFIS_MOTORU"] = "yok"
        sonuc("PDEFE_OFIS_MOTORU=yok", word._kurulu_sayilanlar() == ())
        del os.environ["PDEFE_OFIS_MOTORU"]
        os.environ["PDEFE_WORD_YOK"] = "1"
        sonuc("PDEFE_WORD_YOK=1 hepsini kapatır (sahte ev)", word._kurulu_sayilanlar() == ())
        del os.environ["PDEFE_WORD_YOK"]
        if WINDOWS:
            os.environ["PDEFE_SINAMA_WORD_KOMUTU"] = r'"C:\Kingsoft\WPS Office\office6\wps.exe" /Automation'
            os.environ["PDEFE_OFIS_MOTORU"] = "word"
            onceki = word._clsid_oku
            word._clsid_oku = lambda progid: word.WORD_CLSID
            try:
                sonuc("Word.Application WPS'e kayıtlı (kanca): word_bul None, motor yok", word.word_bul() is None and word.motorlar(True)["word"] is None)
                d = word.yetenek()
                sonuc("Word.Application WPS'e kayıtlı: Eski hata yerine anlaşılır neden", d["var"] is False and "WPS Office" in (d.get("neden") or ""), d)
            finally:
                word._clsid_oku = onceki
    finally:
        for k, v in es.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        word.motorlar(True)
    # Ön bellek: Program sonradan kurulunca
    eski = (word.word_bul, word.wps_bul, word.libreoffice_bul, word.BULAMAZSA_ONBELLEK, os.environ.get("PDEFE_OFIS_MOTORU"))
    os.environ.pop("PDEFE_OFIS_MOTORU", None)
    try:
        word.word_bul = word.wps_bul = word.libreoffice_bul = lambda: None
        word.BULAMAZSA_ONBELLEK = 0.2
        sonuc("hiçbiri yok", word.motorlar(True) == {"word": None, "wps": None, "libreoffice": None})
        word.libreoffice_bul = lambda: "soffice"
        sonuc("sonradan kurulan hemen görülmez (ön bellek)", word.motorlar()["libreoffice"] is None)
        time.sleep(0.3)
        sonuc("sonradan kurulan kısa sürede görülür", word.motorlar()["libreoffice"] == "soffice")
    finally:
        word.word_bul, word.wps_bul, word.libreoffice_bul, word.BULAMAZSA_ONBELLEK = eski[:4]
        if eski[4] is not None:
            os.environ["PDEFE_OFIS_MOTORU"] = eski[4]
        word.motorlar(True)
    sonuc("donustur'da eski LibreOffice notu kalmadı", not hasattr(donustur, "LIBREOFFICE_NOTU"))


# ---------------------------------------------------------------- B) sıra (sahte motorlar)
class Sahte:
    """_word_pdf'in çağırdığı motor işlevlerinin yerine geçer."""

    def __init__(self, word, davranislar, kurulu):
        self.word, self.d, self.kurulu = word, davranislar, kurulu
        self.cagrilan = []
        self.eski = (word._word_ile, word._wps_ile, word._libreoffice_ile, word.motorlar, word._ust_veri_temizle)
        word._word_ile = lambda k, pdf, il, ad: self._calis("word", pdf)
        word._wps_ile = lambda k, pdf, il, ad, makro_riski=False: self._calis("wps", pdf)
        word._libreoffice_ile = lambda so, k, pdf, il, b, ad: self._calis("libreoffice", pdf)
        word.motorlar = lambda tazele=False: {m: ("x" if m == "libreoffice" else {"yol": "x", "progid": "x"}) if m in kurulu else None for m in word.MOTORLAR}
        word._ust_veri_temizle = lambda pdf, baglam: None

    def _calis(self, m, pdf):
        self.cagrilan.append(m)
        d = self.d.get(m)
        if isinstance(d, BaseException):
            raise d
        doc = pymupdf.open()
        doc.new_page()
        doc.save(pdf)
        doc.close()
        return {}

    def kapat(self):
        w = self.word
        w._word_ile, w._wps_ile, w._libreoffice_ile, w.motorlar, w._ust_veri_temizle = self.eski
        w._saglik.clear()


def sira_cevir(word, g, klasor):
    from islemler import donustur
    il = donustur._Ilerleme({})
    b = donustur.Baglam("docx", il)
    hedef = os.path.join(klasor, "sonuc.pdf")
    try:
        return word._word_pdf(g["docx"], hedef, {}, il.bildir, b)
    finally:
        b.temizle()


def test_sira(g):
    print("— B) Sıra ve düşme (sahte motorlar)")
    from islemler import word, donustur
    k = os.path.join(CIKTI, "sira")
    os.makedirs(k, exist_ok=True)
    H = word._MotorHatasi
    O = donustur.OgeHatasi
    w0 = word._wps_kurulum_suruyor
    word._wps_kurulum_suruyor = lambda: False
    try:
        s = Sahte(word, {}, ("word", "wps", "libreoffice"))
        r = sira_cevir(word, g, k)
        sonuc("hepsi var: Word kullanılır, uyarı yok", s.cagrilan == ["word"] and r["motor"] == "word" and "uyari" not in r, (s.cagrilan, r))
        s.kapat()

        s = Sahte(word, {}, ("wps", "libreoffice"))
        r = sira_cevir(word, g, k)
        sonuc("Word yok: WPS, uyarıda WPS Office", s.cagrilan == ["wps"] and r["motor"] == "wps" and "Word bulunamadığı için WPS Office" in r.get("uyari", ""), (s.cagrilan, r))
        s.kapat()

        s = Sahte(word, {}, ("libreoffice",))
        r = sira_cevir(word, g, k)
        sonuc("yalnız LibreOffice", s.cagrilan == ["libreoffice"] and "LibreOffice" in r.get("uyari", ""), r)
        s.kapat()

        s = Sahte(word, {"word": H("word", "baslamadi", "0x80080005")}, ("word", "wps"))
        r = sira_cevir(word, g, k)
        sonuc("Word başlamıyor: WPS'e düşer, ham kod yok", s.cagrilan == ["word", "wps"] and "Word başlatılamadığı için WPS Office" in r.get("uyari", "") and temiz_metin(r["uyari"]), (s.cagrilan, r))
        sonuc("başlamayan motor sona alınır", word.motor_sirasi() == ["wps", "word"], word.motor_sirasi())
        r = sira_cevir(word, g, k)
        sonuc("ikinci belgede Word yeniden beklenmez", s.cagrilan == ["word", "wps", "wps"], s.cagrilan)
        sonuc("uyarı: Word şu anda başlatılamadığı için", "Word şu anda başlatılamadığı için" in r.get("uyari", ""), r)
        s.kapat()

        s = Sahte(word, {"wps": H("wps", "kurulum")}, ("wps", "libreoffice"))
        r = sira_cevir(word, g, k)
        sonuc("WPS güncelleniyor: LibreOffice'e düşer", s.cagrilan == ["wps", "libreoffice"] and "WPS Office şu anda güncellendiği için LibreOffice" in r.get("uyari", ""), (s.cagrilan, r))
        s.kapat()

        s = Sahte(word, {"word": O("bozuk", "Dosya bozuk görünüyor. Word açamadı: x")}, ("word", "wps", "libreoffice"))
        try:
            sira_cevir(word, g, k)
            sonuc("bozuk belge: Motor değişmez", False)
        except O as e:
            sonuc("bozuk belge: Motor değişmez", s.cagrilan == ["word"] and e.kod == "bozuk", s.cagrilan)
        s.kapat()

        s = Sahte(word, {"word": O("parolali", "Belge parolayla korunuyor. Dönüştürülemez: x")}, ("word", "libreoffice"))
        try:
            sira_cevir(word, g, k)
            sonuc("parolalı belge: Motor değişmez", False)
        except O as e:
            sonuc("parolalı belge: Motor değişmez", s.cagrilan == ["word"] and e.kod == "parolali", s.cagrilan)
        s.kapat()

        s = Sahte(word, {"word": TimeoutError("Word belgeyi zamanında dönüştüremedi: x")}, ("word", "libreoffice"))
        try:
            sira_cevir(word, g, k)
            sonuc("dışa aktarma süre aşımı: Motor değişmez", False)
        except TimeoutError:
            sonuc("dışa aktarma süre aşımı: Motor değişmez", s.cagrilan == ["word"], s.cagrilan)
        s.kapat()

        kok = TimeoutError("Word 45 saniyede başlamadı: x")
        s = Sahte(word, {"word": H("word", "baslamadi", "süre doldu", kok=kok)}, ("word",))
        try:
            sira_cevir(word, g, k)
            sonuc("tek motor süre aşımı: Zaman aşımı kodu korunur", False)
        except TimeoutError as e:
            sonuc("tek motor süre aşımı: Zaman aşımı kodu korunur", e is kok)
        s.kapat()

        s = Sahte(word, {"wps": H("wps", "bildirim"), "libreoffice": H("libreoffice", "cevirmedi")}, ("wps", "libreoffice"))
        try:
            sira_cevir(word, g, k)
            sonuc("hepsi başarısız: Anlaşılır ileti", False)
        except O as e:
            sonuc("hepsi başarısız: Anlaşılır ileti", s.cagrilan == ["wps", "libreoffice"] and "WPS Office" in str(e) and "LibreOffice" in str(e) and temiz_metin(e) and e.kod == "hata", str(e))
        s.kapat()

        s = Sahte(word, {"wps": H("wps", "kurulum")}, ("wps",))
        try:
            sira_cevir(word, g, k)
            sonuc("yalnız WPS, güncelleniyor: Ne yapılacağını söyler", False)
        except O as e:
            m = str(e)
            sonuc("yalnız WPS, güncelleniyor: Ne yapılacağını söyler", "güncelleniyor" in m and "LibreOffice kurarsanız" in m and temiz_metin(m), m)
        s.kapat()

        s = Sahte(word, {"word": H("word", "baslamadi", "Word süreci bulunamadı")}, ("word",))
        try:
            sira_cevir(word, g, k)
            sonuc("kullanıcının gördüğü eski ileti gitti", False)
        except O as e:
            m = str(e)
            sonuc("kullanıcının gördüğü eski ileti gitti", "süreci bulunamadı" not in m and "Word başlatılamadı." in m and temiz_metin(m), m)
        s.kapat()

        s = Sahte(word, {}, ())
        try:
            sira_cevir(word, g, k)
            sonuc("hiçbiri yok: Gerekenleri söyler", False)
        except O as e:
            m = str(e)
            sonuc("hiçbiri yok: Gerekenleri söyler", e.kod == "desteklenmiyor" and all(a in m for a in ("Word", "WPS Office", "LibreOffice")) and temiz_metin(m), m)
        s.kapat()
    finally:
        word._wps_kurulum_suruyor = w0


# ---------------------------------------------------------------- C) WPS oturumu (sahte nesne modeli)
class SahteBelge:
    def __init__(self, uygulama):
        self.u = uygulama

    def cagir(self, ad, *a):
        if ad == "ComputeStatistics":
            return 2
        if ad == "ExportAsFixedFormat":
            self.u.aktarim += 1
            d = pymupdf.open()
            d.new_page()
            d.save(a[0])
            d.close()
            return None
        if ad == "Close":
            self.u.belge_sayisi -= 1
            return None
        raise AssertionError(ad)


class SahteBelgeler:
    def __init__(self, uygulama):
        self.u = uygulama

    def al(self, ad):
        assert ad == "Count"
        return self.u.belge_sayisi

    def cagir(self, ad, *a):
        assert ad == "Open"
        if self.u.asili:
            self.u.asili.wait(60)     # asılı Documents.Open
            import comtypes
            raise comtypes.COMError(0x800706BE, "sunucu kapandı", None)
        self.u.belge_sayisi += 1
        if self.u.kullanici_belgesi_duser:
            self.u.belge_sayisi += 1
        return SahteBelge(self.u)


class SahteWps:
    """Application nesnesi: _Disp'in yerine."""

    def __init__(self, ilk_belge=0, makro_yazilir=True, asili=None, kullanici_belgesi_duser=False):
        self.belge_sayisi = ilk_belge
        self.makro_yazilir = makro_yazilir
        self.asili = asili
        self.kullanici_belgesi_duser = kullanici_belgesi_duser
        self.yazilan = {}
        self.kayit = {"AutomationSecurity": 1, "DisplayAlerts": -1, "Visible": True, "ScreenUpdating": True, "Path": r"C:\Kingsoft\WPS Office\office6"}
        self.quit = 0
        self.aktarim = 0

    def al(self, ad):
        if ad == "Documents":
            return SahteBelgeler(self)
        return self.kayit.get(ad)

    def ver(self, ad, deger):
        self.yazilan.setdefault(ad, []).append(deger)
        if ad == "AutomationSecurity" and not self.makro_yazilir:
            return
        self.kayit[ad] = deger

    def cagir(self, ad, *a):
        assert ad == "Quit"
        self.quit += 1


class SahteOrtam:
    """_WpsOturumu'nun dış dünyası: Süreç listesi ve COM oluşturma. Süreçler zararsız Python süreçleridir, komut satırında /Automation."""

    def __init__(self, word, uygulama, yeni_surec=True, kullanici_sureci=None, pencere=False):
        self.word, self.u, self.pencere = word, uygulama, pencere
        self.kullanici = kullanici_sureci
        self.bizim = None
        self.yeni_surec = yeni_surec
        self.olusturuldu = False
        import comtypes
        self.comtypes = comtypes
        self.eski = (word.wps_pidleri, word._Disp, comtypes.CoCreateInstance, word._kucuk_pencereler, word._wps_kurulum_suruyor, word.motorlar)
        word.wps_pidleri = self.pidler
        word._Disp = lambda p: p
        comtypes.CoCreateInstance = self.olustur
        word._kucuk_pencereler = lambda pid: [0] if self.pencere and self.bizim and pid == self.bizim.pid else []
        word._wps_kurulum_suruyor = lambda: False
        word.motorlar = lambda tazele=False: {"word": None, "wps": {"yol": "x", "progid": "Scripting.Dictionary"}, "libreoffice": None}

    def pidler(self):
        s = {}
        if self.kullanici:
            s[self.kullanici.pid] = 0
        if self.bizim and self.bizim.poll() is None:
            s[self.bizim.pid] = 0
        return s

    def olustur(self, clsid, interface=None, clsctx=None):
        self.olusturuldu = True
        if self.yeni_surec:
            self.bizim = kukla_surec()
        return self.u

    def kapat(self):
        w = self.word
        w.wps_pidleri, w._Disp, self.comtypes.CoCreateInstance, w._kucuk_pencereler, w._wps_kurulum_suruyor, w.motorlar = self.eski
        with w._oturum_kilidi:
            w._wps_oturum = None
        for p in (self.bizim,):
            if p and p.poll() is None:
                p.kill()


def kukla_surec():
    return subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)", "/Automation", "-Embedding"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            creationflags=subprocess.CREATE_NO_WINDOW)


def _bitmesini_bekle(p, sure=8):
    try:
        p.wait(sure)
        return True
    except subprocess.TimeoutExpired:
        return False


def test_wps_oturumu(g):
    if not WINDOWS:
        return atlandi("WPS oturumu", "yalnız Windows")
    print("— C) WPS oturumu (sahte nesne modeli, kukla süreçler)")
    from islemler import word
    k = os.path.join(CIKTI, "wps_oturumu")
    os.makedirs(k, exist_ok=True)
    def il(*a):
        return None
    pdf = os.path.join(k, "c.pdf")

    def temizle():
        if os.path.exists(pdf):
            os.remove(pdf)

    # 1) Kendi sürecimiz
    temizle()
    u = SahteWps()
    o = SahteOrtam(word, u)
    try:
        r = word._wps_ile(g["docx"], pdf, il, "x.docx")
        sonuc("kendi örnek: PDF, sayfa sayısı", os.path.isfile(pdf) and r.get("sayfa") == 2, r)
        sonuc("kendi örnek: Görünmez yapıldı, makrolar kapalı", u.yazilan.get("Visible") == [False] and u.yazilan.get("AutomationSecurity") == [3] and u.yazilan.get("DisplayAlerts") == [0], u.yazilan)
        time.sleep(0.3)
        sonuc("kendi örnek: Quit bir kez", u.quit == 1, u.quit)
        sonuc("kendi örnek: Quit'e uymayan süreç yalnız kendisi sonlandırılır", _bitmesini_bekle(o.bizim, word.KAPANMA_BEKLE + 5), o.bizim.poll())
    finally:
        o.kapat()

    # 2) Kullanıcının açık örneği: Yeni süreç yok
    temizle()
    kullanici = kukla_surec()
    u = SahteWps(ilk_belge=2)
    o = SahteOrtam(word, u, yeni_surec=False, kullanici_sureci=kullanici)
    try:
        word._wps_ile(g["docx"], pdf, il, "x.docx")
        time.sleep(0.3)
        sonuc("açık WPS: PDF üretildi", os.path.isfile(pdf))
        sonuc("açık WPS: Quit çağrılmadı", u.quit == 0, u.quit)
        sonuc("açık WPS: Kullanıcının iki belgesi açık", u.belge_sayisi == 2, u.belge_sayisi)
        sonuc("açık WPS: Görünürlük değişmedi", "Visible" not in u.yazilan and "ScreenUpdating" not in u.yazilan, u.yazilan)
        sonuc("açık WPS: Ayarlar geri alındı", u.kayit["DisplayAlerts"] == -1 and u.kayit["AutomationSecurity"] == 1, u.kayit)
        sonuc("açık WPS: Süreç yaşıyor", kullanici.poll() is None)
    finally:
        o.kapat()

    # 3) Asılı: Kendi sürecimiz sonlandırılır, kullanıcınınki yaşar
    temizle()
    asili = threading.Event()
    u = SahteWps(asili=asili)
    o = SahteOrtam(word, u, kullanici_sureci=kullanici)
    eski = word.CEVIRME_SURESI
    word.CEVIRME_SURESI = 1.0
    try:
        try:
            word._wps_ile(g["docx"], pdf, il, "x.docx")
            sonuc("asılı (kendi süreç): Motor hatası", False)
        except word._MotorHatasi as e:
            sonuc("asılı (kendi süreç): Motor hatası", e.neden == "acilmadi" and isinstance(e.kok, TimeoutError), (e.neden, e.kok))
        sonuc("asılı (kendi süreç): Yalnız bizim süreç sonlandı", _bitmesini_bekle(o.bizim) and kullanici.poll() is None, (o.bizim.poll(), kullanici.poll()))
    finally:
        word.CEVIRME_SURESI = eski
        asili.set()
        o.kapat()

    # 4) Asılı, örnek kullanıcının: Hiçbir süreç sonlandırılmaz
    temizle()
    asili = threading.Event()
    u = SahteWps(asili=asili, ilk_belge=1)
    o = SahteOrtam(word, u, yeni_surec=False, kullanici_sureci=kullanici)
    word.CEVIRME_SURESI = 1.0
    try:
        t0 = time.time()
        try:
            word._wps_ile(g["docx"], pdf, il, "x.docx")
            sonuc("asılı (açık WPS): Motor hatası", False)
        except word._MotorHatasi as e:
            sonuc("asılı (açık WPS): Motor hatası", e.neden == "acilmadi", e.neden)
        sonuc("asılı (açık WPS): Kullanıcının süreci yaşıyor, Quit yok", kullanici.poll() is None and u.quit == 0 and time.time() - t0 < 10, (kullanici.poll(), u.quit))
        sonuc("asılı oturum terk edildi", word._wps_oturum is None)
    finally:
        word.CEVIRME_SURESI = eski
        asili.set()
        o.kapat()

    # 5) Küçük pencere (lisans, oturum açma): Motor başarısız, süreç kapanmazsa yalnız o sonlandırılır
    temizle()
    asili = threading.Event()
    u = SahteWps(asili=asili)
    o = SahteOrtam(word, u, kullanici_sureci=kullanici, pencere=True)
    es = (word.BILDIRIM_SURESI, word.BILDIRIM_KAPANMA)
    word.BILDIRIM_SURESI, word.BILDIRIM_KAPANMA = 0.5, 0.5
    try:
        try:
            word._wps_ile(g["docx"], pdf, il, "x.docx")
            sonuc("küçük pencere: Motor hatası", False)
        except word._MotorHatasi as e:
            sonuc("küçük pencere: Motor hatası", e.neden == "bildirim", e.neden)
        sonuc("küçük pencere: Yalnız bizim süreç sonlandı", _bitmesini_bekle(o.bizim) and kullanici.poll() is None)
    finally:
        word.BILDIRIM_SURESI, word.BILDIRIM_KAPANMA = es
        asili.set()
        o.kapat()

    # 6) Kullanıcının belgesi bu sırada bizim örneğe düştü: Bırakılır
    temizle()
    u = SahteWps(kullanici_belgesi_duser=True)
    o = SahteOrtam(word, u)
    try:
        word._wps_ile(g["docx"], pdf, il, "x.docx")
        time.sleep(0.3)
        sonuc("belge düştü: Quit yok, görünür yapıldı", u.quit == 0 and u.kayit["Visible"] is True, (u.quit, u.kayit["Visible"]))
        sonuc("belge düştü: Süreç yaşıyor (iş nesnesi gevşedi)", o.bizim.poll() is None)
    finally:
        o.kapat()

    # 7) Makro kapatılamıyor
    temizle()
    u = SahteWps(makro_yazilir=False)
    o = SahteOrtam(word, u)
    try:
        try:
            word._wps_ile(g["docx"], pdf, il, "x.doc", makro_riski=True)
            sonuc("makro kapatılamıyor: .doc WPS'e verilmez", False)
        except word._MotorHatasi as e:
            sonuc("makro kapatılamıyor: .doc WPS'e verilmez", e.neden == "makro" and u.aktarim == 0, (e.neden, u.aktarim))
    finally:
        o.kapat()
    temizle()
    u = SahteWps(makro_yazilir=False)
    o = SahteOrtam(word, u)
    try:
        word._wps_ile(g["docx"], pdf, il, "x.docx", makro_riski=False)
        sonuc("makro kapatılamıyor: Makrosuz belge yine çevrilir", os.path.isfile(pdf))
    finally:
        o.kapat()
    kullanici.kill()

    # 8) Kurulum kilidi: Mutex'in varlığı ölçülür, WPS hiç başlatılmaz (adı WPS'inki değil)
    ad = "Local\\pdefe-sinama-wps-kilidi-%d" % os.getpid()
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateMutexW.restype = ctypes.c_void_p
    eski_adlar = word.WPS_KURULUM_MUTEXLERI
    word.WPS_KURULUM_MUTEXLERI = (ad,)
    try:
        sonuc("kilit yokken: Kurulum sürmüyor", word._wps_kurulum_suruyor() is False)
        h = k32.CreateMutexW(None, False, ad)
        sonuc("kilit varken: Kurulum sürüyor", word._wps_kurulum_suruyor() is True)
        u = SahteWps()
        o = SahteOrtam(word, u)
        word._wps_kurulum_suruyor = o.eski[4]
        try:
            try:
                word._wps_ile(g["docx"], pdf, il, "x.docx")
                sonuc("kilit varken: WPS başlatılmaz", False)
            except word._MotorHatasi as e:
                sonuc("kilit varken: WPS başlatılmaz", e.neden == "kurulum" and not o.olusturuldu, (e.neden, o.olusturuldu))
        finally:
            o.kapat()
        k32.CloseHandle(ctypes.c_void_p(h))
    finally:
        word.WPS_KURULUM_MUTEXLERI = eski_adlar

    # 9) .docm makrosuz kopya
    kl = tempfile.mkdtemp(prefix="pdefe-sinama-docm-")
    try:
        kaynak = os.path.join(kl, "m.docm")
        with zipfile.ZipFile(g["docx"]) as a, zipfile.ZipFile(kaynak, "w") as b:
            for i in a.infolist():
                v = a.read(i.filename)
                if i.filename == "[Content_Types].xml":
                    v = v.replace(b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml", b"application/vnd.ms-word.document.macroEnabled.main+xml")
                    v = v.replace(b"</Types>", b'<Override PartName="/word/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>')
                if i.filename == "word/_rels/document.xml.rels":
                    v = v.replace(b"</Relationships>", b'<Relationship Id="rIdVba" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>')
                b.writestr(i, v)
            b.writestr("word/vbaProject.bin", b"VBA kodu")
        t = word._makrosuz_kopya(kaynak, "docm", kl)
        with zipfile.ZipFile(t) as z:
            adlar = z.namelist()
            turler = z.read("[Content_Types].xml")
            iliski = z.read("word/_rels/document.xml.rels")
        sonuc(".docm: Kopyada makro yok, tür .docx", t.endswith(".docx") and "word/vbaProject.bin" not in adlar and b"macroEnabled" not in turler and b"vbaProject" not in turler and b"vbaProject" not in iliski, adlar)
        from islemler import donustur
        sonuc(".docm: Makrosuz kopya docx olarak tanınır", donustur.tur_bul(t) == ("word", "docx"), donustur.tur_bul(t))
        sonuc(".docx kopyası olduğu gibi", word._makrosuz_kopya(g["docx"], "docx", kl) == g["docx"])
    finally:
        shutil.rmtree(kl, ignore_errors=True)


# ---------------------------------------------------------------- D) LibreOffice'in süresi ve iptali (yerine geçen .cmd)
def test_lo_sure_iptal():
    if not WINDOWS:
        return atlandi("LibreOffice süre aşımı", "yalnız Windows")
    print("— D) LibreOffice süre aşımı ve iptal (yerine geçen program)")
    from islemler import word, donustur
    kl = tempfile.mkdtemp(prefix="pdefe-sinama-lo-")
    stub = os.path.join(kl, "soffice.cmd")
    with open(stub, "w", encoding="ascii") as f:
        f.write("@echo off\r\nping -n 120 127.0.0.1 >nul\r\n")
    kaynak = os.path.join(kl, "k.docx")
    shutil.copyfile(os.path.join(GIRDI, AD_KOKU + ".docx"), kaynak)
    pdf = os.path.join(kl, "c.pdf")
    eski = word.LO_SURE
    word.LO_SURE = 1.0
    il = donustur._Ilerleme({})
    b = donustur.Baglam("docx", il)
    try:
        t0 = time.time()
        try:
            word._libreoffice_ile(stub, kaynak, pdf, il.bildir, b, "k.docx")
            sonuc("süre doldu: Motor hatası", False)
        except word._MotorHatasi as e:
            sonuc("süre doldu: Motor hatası, zaman aşımı kökü", isinstance(e.kok, TimeoutError) and time.time() - t0 < 10, (e.neden, e.kok))
        word.LO_SURE = 60.0
        ipt = donustur._Ilerleme({"_iptal_mi": lambda: time.time() - t1 > 0.5})
        b2 = donustur.Baglam("docx", ipt)
        t1 = time.time()
        from pdefe_core import IptalEdildi
        try:
            word._libreoffice_ile(stub, kaynak, pdf, lambda *a: None, b2, "k.docx")
            sonuc("iptal", False)
        except IptalEdildi:
            sonuc("iptal: Hemen döner", time.time() - t1 < 10, time.time() - t1)
        finally:
            b2.temizle()
    finally:
        word.LO_SURE = eski
        b.temizle()
        shutil.rmtree(kl, ignore_errors=True)
    # Geçerli olmayan çıktı: Program hiç PDF üretmedi
    kl = tempfile.mkdtemp(prefix="pdefe-sinama-lo-")
    stub = os.path.join(kl, "soffice.cmd")
    with open(stub, "w", encoding="ascii") as f:
        f.write("@echo off\r\necho Error: source file could not be loaded 1>&2\r\nexit /b 1\r\n")
    il = donustur._Ilerleme({})
    b = donustur.Baglam("docx", il)
    try:
        try:
            word._libreoffice_ile(stub, os.path.join(GIRDI, "bozuk.docx"), os.path.join(kl, "c.pdf"), il.bildir, b, "bozuk.docx")
            sonuc("LibreOffice 'yüklenemedi': Belge sorunu", False)
        except donustur.OgeHatasi as e:
            sonuc("LibreOffice 'yüklenemedi': Belge sorunu (motor değişmez)", e.kod == "bozuk" and temiz_metin(e), (e.kod, str(e)))
    finally:
        b.temizle()
        shutil.rmtree(kl, ignore_errors=True)


# ---------------------------------------------------------------- yardımcılar
def donustur_(s, ogeler, sure=300):
    return s.cagir("bicim_donustur", {"ogeler": ogeler}, sure=sure)


def kalinti_klasorler(pid):
    kok = tempfile.gettempdir()
    return [a for a in os.listdir(kok) if a.startswith("pdefe-donustur-%d-" % pid)]


def surec_say(ad):
    from islemler import word
    return set(word._surecler((ad,)))


def pdf_denetle(ad, yol, s0, m, ayrinti=None):
    """Motorun ürettiği PDF: Sayfa, metin, üst veri."""
    doc = pymupdf.open(yol, filetype="pdf")
    sayfa = doc.page_count
    md = doc.metadata or {}
    xmp = doc.get_xml_metadata() or ""
    doc.close()
    with open(yol, "rb") as f:
        ham = f.read()
    gc = W.geri_cagirma(OZGUN, W.pdf_sozcukleri(yol))
    sonuc("%s: PDF, %d sayfa, sözcük geri çağırma %.3f" % (ad, sayfa, gc), sayfa >= 2 and gc >= 0.97, gc)
    sonuc("%s: Sonuçta motor ve program adı" % ad, s0.get("motor") == m and W_MOTOR_ADI[m] in (s0.get("uyari") or ""), s0)
    sonuc("%s: Yazar ve başlık PDF'te yok" % ad, not md.get("author") and not md.get("title") and YAZAR not in xmp and YAZAR.encode("utf-8") not in ham and "Sınama Başlığı".encode("utf-16-be") not in ham, md)


W_MOTOR_ADI = {"word": "Word", "wps": "WPS Office", "libreoffice": "LibreOffice"}


# ---------------------------------------------------------------- E) gerçek motor
def motor_bolumu(m, g, exe):
    print("— E) Gerçek motor: %s" % W_MOTOR_ADI[m])
    from islemler import word
    k = os.path.join(CIKTI, "motor_" + m)
    os.makedirs(k, exist_ok=True)
    onceki = surec_say("soffice.bin") if m == "libreoffice" else set()
    s = W.Surec(exe, {"PDEFE_OFIS_MOTORU": m})
    try:
        y = s.cagir("donusum_yetenekleri", {})
        w = y["word"]
        sonuc("yetenek: Yalnız %s, motor adı ve not" % m, w["var"] and w["motor"] == m and w["motorAdi"] == W_MOTOR_ADI[m] and W_MOTOR_ADI[m] in (w.get("not") or ""), w)
        sonuc("hedef notunda program adı", W_MOTOR_ADI[m] in (y["donusumler"]["word>pdf"].get("kalite") or ""), y["donusumler"]["word>pdf"])
        b = s.cagir("donusum_bilgi", {"yol": g["docx"]})
        sonuc("satır bilgisi: DOCX, PDF hedefi var", b["tur"] == "word" and any(h["bicim"] == "pdf" and h["var"] for h in b["hedefler"]), b.get("hedefler"))
        # Bütün kaynak türleri: Ad Türkçe ve boşluklu. Art arda: LibreOffice'in profil sorunu ikinci belgede çıkıyordu
        turler = [t for t in ("docx", "docm", "doc", "rtf", "odt") if t in g]
        if "doc" not in g:
            atlandi("DOC", "üretilemedi")
        t0 = time.time()
        ogeler = [{"yol": g[t], "hedef": os.path.join(k, "%s %s.pdf" % (AD_KOKU, t)), "hedefBicim": "pdf"} for t in turler]
        r = donustur_(s, ogeler)
        print("     %d belge %.1f sn" % (len(ogeler), time.time() - t0))
        for oge, s0, t in zip(ogeler, r["sonuclar"], turler):
            if "hata" in s0:
                sonuc("%s → PDF" % t.upper(), False, s0)
            else:
                pdf_denetle("%s → PDF" % t.upper(), oge["hedef"], s0, m)
        # Türkçe harfler: Görüntüsü bakılmak üzere yazılır
        if ogeler and os.path.isfile(ogeler[0]["hedef"]):
            d = pymupdf.open(ogeler[0]["hedef"], filetype="pdf")
            d[0].get_pixmap(dpi=90).save(os.path.join(k, "sayfa1.png"))
            d.close()
        # Zincirler
        for bicim, uz in (("udf", "udf"), ("tiff", "tif"), ("gorsel", "jpg")):
            h = os.path.join(k, "zincir." + uz)
            r = donustur_(s, [{"yol": g["docx"], "hedef": h, "hedefBicim": bicim}])
            s0 = r["sonuclar"][0]
            ok = "hata" not in s0 and (os.path.isfile(h) or bool(s0.get("hedefler")))
            sonuc("Word → %s: Dosya yazıldı, uyarıda %s" % (bicim, W_MOTOR_ADI[m]), ok and W_MOTOR_ADI[m] in (s0.get("uyari") or ""), s0)
        # Birleştir
        h = os.path.join(k, "birlesik.pdf")
        b = s.cagir("birlestir", {"ogeler": [{"yol": g["docx"], "tur": "word"}, {"yol": g["pdf"], "tur": "pdf"}, {"yol": g["jpg"], "tur": "gorsel"}], "hedef": h})
        d = pymupdf.open(h, filetype="pdf")
        n = d.page_count
        d.close()
        sonuc("Birleştir: Word + PDF + JPG, uyarıda program adı", n >= 5 and W_MOTOR_ADI[m] in (b.get("uyari") or ""), (n, b.get("uyari")))
        # Bozuk ve parolalı
        for ad, yol, kod in (("bozuk DOCX", g["bozuk_docx"], "bozuk"), ("parolalı DOC", g["sifreli_doc"], "parolali"), ("parolalı ODT", g["sifreli_odt"], "parolali")):
            t0 = time.time()
            r = donustur_(s, [{"yol": yol, "hedef": os.path.join(k, "x.pdf"), "hedefBicim": "pdf"}])
            s0 = r["sonuclar"][0]
            sonuc("%s: Kod %s, temiz ileti, %.1f sn" % (ad, kod, time.time() - t0), s0.get("kod") == kod and temiz_metin(s0.get("hata")), s0)
        sonuc("geçici dosya kalmadı", not [a for a in os.listdir(k) if "pdefe-tmp" in a])
        cekirdek = s.p.pid
        sonuc("geçici klasör kalmadı", not kalinti_klasorler(cekirdek), kalinti_klasorler(cekirdek))
    finally:
        s.kapat()
    if m == "libreoffice":
        sonra = surec_say("soffice.bin")
        sonuc("daha önce açık LibreOffice süreçleri yerinde, yenisi kalmadı", onceki == sonra, (onceki, sonra))


# ---------------------------------------------------------------- F) WPS
def wps_kilitli_bolumu(g, exe):
    print("— F) WPS: Kurulum kilidi duruyor")
    from islemler import word
    k = os.path.join(CIKTI, "wps_kilitli")
    os.makedirs(k, exist_ok=True)
    once = set(word.wps_pidleri())
    s = W.Surec(exe, {"PDEFE_OFIS_MOTORU": "wps"})
    try:
        y = s.cagir("donusum_yetenekleri", {})
        sonuc("yalnız WPS: Yetenek var (kurulu)", y["word"]["var"] is True and y["word"]["motor"] == "wps", y["word"])
        t0 = time.time()
        r = donustur_(s, [{"yol": g["docx"], "hedef": os.path.join(k, "a.pdf"), "hedefBicim": "pdf"}])
        s0 = r["sonuclar"][0]
        sonuc("yalnız WPS: Beklemeden anlaşılır ileti (%.1f sn)" % (time.time() - t0), time.time() - t0 < 5 and "güncelleniyor" in (s0.get("hata") or "") and temiz_metin(s0.get("hata")), s0)
        sonuc("yalnız WPS: WPS başlatılmadı", set(word.wps_pidleri()) == once, word.wps_pidleri())
    finally:
        s.kapat()
    if word.libreoffice_bul():
        s = W.Surec(exe, {"PDEFE_OFIS_MOTORU": "wps,libreoffice"})
        try:
            y = s.cagir("donusum_yetenekleri", {})
            sonuc("WPS + LibreOffice: Motor LibreOffice", y["word"]["motor"] == "libreoffice" and "LibreOffice" in (y["word"].get("not") or ""), y["word"])
            h = os.path.join(k, "b.pdf")
            r = donustur_(s, [{"yol": g["docx"], "hedef": h, "hedefBicim": "pdf"}])
            s0 = r["sonuclar"][0]
            sonuc("WPS + LibreOffice: Hatasız, LibreOffice ile", s0.get("motor") == "libreoffice" and os.path.isfile(h) and "WPS Office" in (s0.get("uyari") or ""), s0)
            sonuc("WPS + LibreOffice: WPS başlatılmadı", set(word.wps_pidleri()) == once)
        finally:
            s.kapat()


def wps_bildirim_bolumu(g):
    """WPS'in gerçek "aynı anda çalıştırılamaz" penceresi: Ön denetim kapatılır, pencere yakalanıp kapatılır. Görünmeyen masaüstünde çalıştırın."""
    print("— F) WPS: Gerçek bildirim penceresi (ön denetimsiz)")
    from islemler import word, donustur
    if not word._wps_kurulum_suruyor():
        return atlandi("WPS bildirim penceresi", "kurulum kilidi yok, WPS pencere açmaz")
    k = os.path.join(CIKTI, "wps_bildirim")
    os.makedirs(k, exist_ok=True)
    pdf = os.path.join(k, "c.pdf")
    once = set(word.wps_pidleri())
    eski = (word._wps_kurulum_suruyor, os.environ.get("PDEFE_OFIS_MOTORU"))
    word._wps_kurulum_suruyor = lambda: False
    os.environ["PDEFE_OFIS_MOTORU"] = "wps"
    word.motorlar(True)
    try:
        t0 = time.time()
        try:
            word._wps_ile(g["docx"], pdf, lambda *a: None, "a.docx")
            sonuc("gerçek pencere: Motor hatası", False)
        except word._MotorHatasi as e:
            sonuc("gerçek pencere: Motor hatası 'bildirim' (%.1f sn)" % (time.time() - t0), e.neden == "bildirim" and time.time() - t0 < 25, (e.neden, e.ayrinti))
        for _ in range(40):
            if set(word.wps_pidleri()) == once:
                break
            time.sleep(0.25)
        sonuc("gerçek pencere: Bizim WPS süreci kapandı", set(word.wps_pidleri()) == once, word.wps_pidleri())
    finally:
        word._wps_kurulum_suruyor = eski[0]
        if eski[1] is None:
            os.environ.pop("PDEFE_OFIS_MOTORU", None)
        else:
            os.environ["PDEFE_OFIS_MOTORU"] = eski[1]
        word.motorlar(True)
        word._saglik.clear()


def wps_acik_belge_bolumu(g):
    """Gerçek WPS: Başka belge açıkken dönüştürme, o belge açık kalır. Açık belge bu testin kendi WPS örneğinde (görünmez)."""
    print("— F) WPS: Başka belge açıkken")
    from islemler import word
    k = os.path.join(CIKTI, "wps_acik")
    os.makedirs(k, exist_ok=True)
    kopya = os.path.join(k, "acik_belge.docx")
    shutil.copyfile(g["docx"], kopya)
    kutu = {}
    bitir = threading.Event()
    hazir = threading.Event()

    def sahip():
        comtypes, a = word._com()
        comtypes.CoInitializeEx(comtypes.COINIT_APARTMENTTHREADED)
        w = None
        try:
            w = word._Disp(comtypes.CoCreateInstance(comtypes.GUID.from_progid("KWPS.Application"), interface=a.IDispatch, clsctx=comtypes.CLSCTX_LOCAL_SERVER))
            w.ver("DisplayAlerts", 0)
            d = w.al("Documents").cagir("Open", kopya)
            kutu["ilk"] = int(w.al("Documents").al("Count"))
            kutu["pid"] = set(word.wps_pidleri())
            hazir.set()
            bitir.wait(180)
            kutu["son"] = int(w.al("Documents").al("Count"))
            kutu["ad"] = str(d.al("Name"))
            d.cagir("Close", 0)
            if int(w.al("Documents").al("Count")) == 0:
                w.cagir("Quit", 0)
        except Exception as e:
            kutu["hata"] = repr(e)
            hazir.set()
        finally:
            d = w = None
            comtypes.CoUninitialize()
    t = threading.Thread(target=sahip, daemon=True)
    t.start()
    hazir.wait(90)
    if "hata" in kutu or "ilk" not in kutu:
        return atlandi("açık belgeli WPS", "açık belge kurulamadı: %s" % kutu.get("hata"))
    s = W.Surec(None, {"PDEFE_OFIS_MOTORU": "wps"})
    try:
        h = os.path.join(k, "sonuc.pdf")
        r = donustur_(s, [{"yol": g["docx"], "hedef": h, "hedefBicim": "pdf"}])
        s0 = r["sonuclar"][0]
        sonuc("açık belge varken: Dönüştürme başarılı", "hata" not in s0 and os.path.isfile(h), s0)
    finally:
        s.kapat()
    time.sleep(1)
    bitir.set()
    t.join(30)
    sonuc("açık belge açık kaldı (belge sayısı aynı, adı aynı)", kutu.get("son") == kutu.get("ilk") and kutu.get("ad") == "acik_belge.docx", kutu)


# ---------------------------------------------------------------- G) motor yok ve öbür türler
def yoksuz_bolumu(g, exe):
    print("— G) Hiçbir motor yokken ve öbür dosya türleri")
    k = os.path.join(CIKTI, "yok")
    os.makedirs(k, exist_ok=True)
    s = W.Surec(exe, {"PDEFE_OFIS_MOTORU": "yok"})
    try:
        y = s.cagir("donusum_yetenekleri", {})
        w = y["word"]
        sonuc("yetenek: Yok, neden üç programı anıyor", w["var"] is False and all(a in w["neden"] for a in ("Word", "WPS Office", "LibreOffice")) and temiz_metin(w["neden"]), w)
        for ad in ("word>pdf", "word>udf", "word>tiff", "word>gorsel"):
            sonuc("%s kapalı, neden söyleniyor" % ad, y["donusumler"][ad]["var"] is False and "LibreOffice" in y["donusumler"][ad].get("neden", ""), y["donusumler"][ad])
        sonuc("Word olmadan çalışanlar açık (PDF → Word, TIFF, JPG)", all(y["donusumler"][a]["var"] for a in ("pdf>word", "pdf>tiff", "pdf>gorsel", "tiff>pdf", "gorsel>pdf", "pdf>udf")), y["donusumler"])
        r = donustur_(s, [{"yol": g["docx"], "hedef": os.path.join(k, "a.pdf"), "hedefBicim": "pdf"}])
        s0 = r["sonuclar"][0]
        sonuc("Word → PDF: Kod desteklenmiyor, anlaşılır ileti", s0.get("kod") == "desteklenmiyor" and "LibreOffice" in s0.get("hata", "") and temiz_metin(s0["hata"]), s0)
        # Görüntüler ve TIFF → PDF
        for t in ("jpg", "png", "bmp", "gif", "webp", "tif"):
            h = os.path.join(k, "g_%s.pdf" % t)
            r = donustur_(s, [{"yol": g[t], "hedef": h, "hedefBicim": "pdf"}])
            s0 = r["sonuclar"][0]
            sonuc("%s → PDF" % t.upper(), "hata" not in s0 and os.path.isfile(h), s0)
        # PDF → öbürleri (Word gerekmez)
        for bicim, uz in (("word", "docx"), ("udf", "udf"), ("tiff", "tif"), ("gorsel", "jpg")):
            h = os.path.join(k, "p." + uz)
            r = donustur_(s, [{"yol": g["pdf"], "hedef": h, "hedefBicim": bicim}])
            s0 = r["sonuclar"][0]
            sonuc("PDF → %s" % bicim, "hata" not in s0, s0)
        # Görüntü → UDF ve Word (PDF üzerinden, motor gerekmez)
        h = os.path.join(k, "g.docx")
        r = donustur_(s, [{"yol": g["jpg"], "hedef": h, "hedefBicim": "word"}])
        sonuc("JPG → Word", "hata" not in r["sonuclar"][0], r["sonuclar"][0])
        # Bozuk dosyalar: Ham kitaplık metni kullanıcıya gitmez
        for ad, yol in (("bozuk JPG", g["bozuk_jpg"]), ("bozuk TIFF", g["bozuk_tif"]), ("bozuk WEBP", g["bozuk_webp"]), ("kırık zip", g["bozuk_zip"]), ("bilinmeyen", g["bilinmeyen"])):
            r = donustur_(s, [{"yol": yol, "hedef": os.path.join(k, "x.pdf"), "hedefBicim": "pdf"}])
            s0 = r["sonuclar"][0]
            sonuc("%s: Hata, temiz ileti" % ad, "hata" in s0 and temiz_metin(s0["hata"]) and s0.get("kod") in ("bozuk", "taninmadi", "desteklenmiyor"), s0)
            b = s.cagir("donusum_bilgi", {"yol": yol})
            sonuc("%s: Satır uyarısı temiz" % ad, temiz_metin(b.get("uyari")), b.get("uyari"))
        # Birleştir'de Word satırı
        b = s.cagir("gorsel_bilgi", {"yol": g["docx"], "onizleme": False})
        sonuc("Birleştir: Word satırı çevrilemez, neden söylenir", b.get("pdfeCevrilebilir") is False and "LibreOffice" in (b.get("neden") or ""), b)
        try:
            s.cagir("birlestir", {"ogeler": [{"yol": g["docx"], "tur": "word"}, {"yol": g["pdf"], "tur": "pdf"}], "hedef": os.path.join(k, "b.pdf")})
            sonuc("Birleştir: Word'süz istek reddedilir", False)
        except W.CagriHatasi as e:
            sonuc("Birleştir: Word'süz istek anlaşılır iletiyle reddedilir", "LibreOffice" in str(e) and temiz_metin(e), str(e))
    finally:
        s.kapat()


def test_tur():
    print("— Parolalı tür tespiti")
    from islemler import donustur
    gg = {"sifreli_doc": os.path.join(GIRDI, "parolali.doc"), "sifreli_odt": os.path.join(GIRDI, "parolali.odt")}
    sonuc("parolalı .doc: FIB'den", donustur.tur_bul(gg["sifreli_doc"]) == ("word", "sifreli"), donustur.tur_bul(gg["sifreli_doc"]))
    sonuc("parolalı .odt: Manifest'ten", donustur.tur_bul(gg["sifreli_odt"]) == ("word", "sifreli"), donustur.tur_bul(gg["sifreli_odt"]))
    doc = os.path.join(GIRDI, AD_KOKU + ".doc")
    if os.path.isfile(doc):
        sonuc("gerçek parolasız .doc: doc", donustur.tur_bul(doc) == ("word", "doc"), donustur.tur_bul(doc))
    sonuc("gerçek .odt: odt", donustur.tur_bul(os.path.join(GIRDI, AD_KOKU + ".odt")) == ("word", "odt"))


def main():
    exe = None
    if "--exe" in sys.argv:
        exe = os.path.abspath(sys.argv[sys.argv.index("--exe") + 1])
    if ev_degistirilmis():
        print("USERPROFILE gerçek profil klasörü değil: Motor bölümleri atlanır")
    print("Girdiler üretiliyor…")
    g = girdileri_uret()
    doc_uret(g)
    from islemler import word
    es = os.environ.pop("PDEFE_OFIS_MOTORU", None)
    testler = []
    if not exe:
        testler += [test_tur, test_karar, lambda: test_sira(g), lambda: test_wps_oturumu(g), test_lo_sure_iptal]
    testler.append(lambda: yoksuz_bolumu(g, exe))
    if not ev_degistirilmis():
        lo = word.libreoffice_bul()
        testler.append((lambda: motor_bolumu("libreoffice", g, exe)) if lo else (lambda: atlandi("LibreOffice", "kurulu değil")))
        wp = word.wps_bul() if WINDOWS else None
        if not wp:
            testler.append(lambda: atlandi("WPS Office", "kurulu değil"))
        elif word._wps_kurulum_suruyor():
            testler.append(lambda: wps_kilitli_bolumu(g, exe))
            testler.append(lambda: atlandi("gerçek WPS ile dönüştürme", "WPS'in kurulum kilidi duruyor: WPS bu durumda hiç başlamıyor. Kilit kalkınca bu testi yeniden çalıştırın"))
            if "--wps-bildirim" in sys.argv and not exe:
                testler.append(lambda: wps_bildirim_bolumu(g))
        else:
            testler.append(lambda: motor_bolumu("wps", g, exe))
            if not exe:
                testler.append(lambda: wps_acik_belge_bolumu(g))
    for t in testler:
        try:
            t()
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            sonuc("İSTİSNA", False, repr(e))
    if es is not None:
        os.environ["PDEFE_OFIS_MOTORU"] = es
    print("\nSonuç: %d/%d geçti%s." % (toplam - hata, toplam, ", %d HATA" % hata if hata else ""))
    sys.stdout.flush()
    return 1 if hata else 0


if __name__ == "__main__":
    k = main()
    os._exit(k)   # terk edilen sahte iş parçacıkları beklenmez
