# -*- coding: utf-8 -*-
"""PDF → Word (0.2.6, "Dosya Formatını Değiştir" aracı): düzenlenebilir .docx, Word gerektirmeden (pdf2docx; macOS'ta da aynı).
donustur.py'nin çatısına kaydolur (islemler/__init__.py onu donustur'dan sonra yükler). UDF → Word çatının PDF üzerinden iki adımlı
planıyla kendiliğinden yapılır.

Neden pdf2docx (keşif raporu, PLAN.md "Revizyon 0.2.6"): Word'ün kendi PDF açması (PDF Reflow) UYAP'ın PDF'lerinde her sayfayı resme
çeviriyor (metin düzenlenemez) ya da konumlu metinde sözcüklerin %19'unu sessizce kaybediyordu; pdf2docx aynı girdilerde sözcüklerin
%99–100'ünü, sayfa sayısını ve satır yerlerini koruyor, Word gerektirmiyor. pdf2docx 0.5.13 (MIT) değiştirilerek core/ucuncu/pdf2docx
altına alındı: opencv kaldırıldı (kurucuya +41 MB yerine ~+11 MB), stdout'a yazan ve SystemExit fırlatan yerler düzeltildi (ayrıntı
core/ucuncu/__init__.py).

Dönüştürme pdf2docx'in Converter.convert akışıyla aynıdır (yazı tipleri, sayfa sayfa ham çıkarım ve temizlik, kenar boşlukları ve bölümler,
sayfa çözümleme, docx'in sayfa sayfa yazılması), ama burada adım adım sürülür: her sayfa adımı MuPDF kilidi içinde (pdefe_core.mupdf_kilidi;
PyMuPDF iş parçacığı güvenli değil, işçi de her isteği bu kilitle işler), adımlar arasında kilit bırakılır (dönüştürme sürerken küçük resim
ve kopyalama istekleri yanıtlanır); her sayfada ilerleme bildirilir ve iptale bakılır. PDF yalnızca filetype="pdf" ile, diskten taze
açılır (araclar._pdf_ac; parolalı belge reddedilir). pdf2docx'in iletileri modülün günlükçüsüne (stderr) gider, stdout'a (çekirdeğin JSON
kanalı) hiçbir şey yazılmaz.

Bir sayfa çözümlenemez ya da yazılamazsa pdf2docx'teki gibi o sayfa atlanır, öteki sayfalar sürer; sonuçta uyarı. Taranmış sayfa (metni
yok, görseli var) resim olarak aktarılır: sonuçta "metni düzenlenemez" uyarısı.

bicim_donustur sonucuna sayfa (PDF'in sayfa sayısı), taranmisSayfa, atlananSayfalar ve gerekirse uyari. donusum_yetenekleri'ne
pdf_word: {var: true, motor: 'pdf2docx'} (kitaplık yüklenemezse var: false, neden).
"""
import glob
import os
import sys
import threading

from . import araclar
from . import donustur
from .donustur import OgeHatasi

def onden_yukle():
    """Windows: numpy'nin OpenBLAS kitaplığı (numpy.libs/libscipy_openblas*.dll) çekirdek açılırken, ana iş parçacığı girdiyi (stdin)
    okumaya başlamadan yüklenir. Neden: bu DLL ilk yüklenişinde süreç başlarken verilen girdi tutamacını sorguluyor; ana iş parçacığı o
    borudan eş zamanlı okurken (pdefe_core.main) sorgu okuma bitene, yani ana süreçten yeni bir satır gelene dek bekliyor. numpy dönüştürme
    iş parçacığında ilk kez yüklenince PDF → Word ana süreç başka bir istek gönderene dek donuyordu (ayrı çekirdek sürecinde ölçüldü;
    girdiye yazan olmadığında sonsuza dek). Önden yalnız bu DLL yüklenir; numpy'nin kendisi yine ilk PDF → Word'de yüklenir.
    OPENBLAS_NUM_THREADS=1: pdf2docx'in numpy kullanımı küçük dizi işlemleri; OpenBLAS'ın açılışta işlemci sayısınca iş parçacığı
    açmasına gerek yok. Döner: yüklenen DLL sayısı."""
    if os.name != "nt":
        return 0
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    import ctypes
    import importlib.util
    klasorler = []
    if getattr(sys, "_MEIPASS", None):
        klasorler.append(os.path.join(sys._MEIPASS, "numpy.libs"))
    try:
        spec = importlib.util.find_spec("numpy")   # paketi yüklemez
        if spec is not None and spec.submodule_search_locations:
            for k in spec.submodule_search_locations:
                klasorler.append(os.path.join(os.path.dirname(os.path.abspath(k)), "numpy.libs"))
    except (ImportError, ValueError):
        pass
    sayi = 0
    for klasor in klasorler:
        for dll in sorted(glob.glob(os.path.join(klasor, "libscipy_openblas*.dll")) + glob.glob(os.path.join(klasor, "libopenblas*.dll"))):
            try:
                ctypes.WinDLL(dll)
                sayi += 1
            except OSError as e:
                print("[pdf_word] %s yüklenemedi: %s" % (os.path.basename(dll), e), file=sys.stderr)
        if sayi:
            break
    return sayi


_kitaplik = {"modul": None, "hata": None}
_kitaplik_kilidi = threading.Lock()


def _pdf2docx():
    """pdf2docx'in kullanılan sınıfları (ilk kullanımda yüklenir: python-docx, lxml ve numpy çekirdeğin açılışını yavaşlatmasın)."""
    with _kitaplik_kilidi:
        if _kitaplik["modul"] is None:
            from ucuncu.pdf2docx.converter import Converter
            from ucuncu.pdf2docx.font.Fonts import Fonts
            from ucuncu.pdf2docx.page.Page import Page
            from ucuncu.pdf2docx.page.Pages import Pages
            from ucuncu.pdf2docx.page.RawPageFactory import RawPageFactory
            from docx import Document

            class K:
                pass
            k = K()
            k.Converter, k.Fonts, k.Page, k.Pages, k.RawPageFactory, k.Document = Converter, Fonts, Page, Pages, RawPageFactory, Document
            _kitaplik["modul"] = k
        return _kitaplik["modul"]


def hazir():
    try:
        import importlib.util
        if importlib.util.find_spec("ucuncu.pdf2docx") is None or importlib.util.find_spec("docx") is None:
            return False, "PDF → Word dönüştürücüsü bu sürümde eksik."
    except (ImportError, ValueError) as e:
        return False, "PDF → Word dönüştürücüsü yüklenemedi: %s" % e
    return True, None


def yetenek():
    ok, neden = hazir()
    s = {"var": ok, "motor": "pdf2docx" if ok else None}
    if neden:
        s["neden"] = neden
    return s


def _ayarlar(k):
    """pdf2docx'in varsayılan ayarları (Converter.default_settings); hatalı sayfa atlanır, çoklu süreç yok, hata ayıklama çizimi yok."""
    ayar = k.Converter.default_settings.fget(None)
    ayar.update(debug=False, ignore_page_error=True, raw_exceptions=False, multi_processing=False)
    return ayar


def _sayfa_listesi(sayilar):
    return ", ".join(str(s) for s in sayilar[:10]) + (" …" if len(sayilar) > 10 else "")


def _pdf_word(kaynak, cikti, secenekler, ilerleme, baglam):
    ad = os.path.basename(kaynak)
    ilerleme(0.0, "PDF okunuyor…")
    k = _pdf2docx()
    ayar = _ayarlar(k)
    with baglam.mupdf():
        try:
            doc = araclar._pdf_ac(kaynak)
        except ValueError as e:
            raise OgeHatasi("bozuk", str(e))
    try:
        n = doc.page_count
        if n == 0:
            raise OgeHatasi("bozuk", "Belgede sayfa yok: %s" % ad)
        sayfalar = k.Pages()
        sayfalar.reset([k.Page(id=i, skip_parsing=False) for i in range(n)])
        with baglam.mupdf():
            yazi_tipleri = k.Fonts.extract(doc)

        # 1) sayfa sayfa ham çıkarım ve temizlik (Pages.parse'ın 1. adımı)
        hamlar, taranmis = [], []
        for i, sayfa in enumerate(sayfalar):
            ilerleme(0.02 + 0.38 * i / n, "Sayfa %d/%d okunuyor" % (i + 1, n))
            with baglam.mupdf():
                ham = k.RawPageFactory.create(page_engine=doc[sayfa.id], backend="PyMuPDF")
                ham.restore(**ayar)
                if not ham.raw_text.strip() and doc[sayfa.id].get_images():
                    taranmis.append(i + 1)
                ham.clean_up(**ayar)
                ham.process_font(yazi_tipleri)
                sayfa.width = ham.width
                sayfa.height = ham.height
                sayfa.float_images.reset().extend(ham.blocks.floating_image_blocks)
            hamlar.append(ham)

        # 2) belge ve sayfa düzeyi: üst / alt bilgi (pdf2docx'te boş), kenar boşlukları, bölümler
        ilerleme(0.4, "Sayfa düzeni çözümleniyor")
        with baglam.mupdf():
            k.Pages._parse_document(hamlar)
            for sayfa, ham in zip(sayfalar, hamlar):
                kenar = ham.calculate_margin(**ayar)
                ham.margin = sayfa.margin = kenar
                sayfa.sections.extend(ham.parse_section(**ayar))

        # 3) sayfa çözümleme (paragraflar, tablolar, görseller); hatalı sayfa atlanır
        atlanan = []
        for i, sayfa in enumerate(sayfalar):
            ilerleme(0.45 + 0.35 * i / n, "Sayfa %d/%d çözümleniyor" % (i + 1, n))
            try:
                with baglam.mupdf():
                    sayfa.parse(**ayar)
            except _iptaller():
                raise
            except Exception as e:
                print("[pdf_word] %s: %d. sayfa çözümlenemedi: %r" % (ad, i + 1, e), file=sys.stderr)
                atlanan.append(i + 1)
        hamlar = None

        # 4) docx sayfa sayfa
        belge = k.Document()
        for i, sayfa in enumerate(sayfalar):
            ilerleme(0.8 + 0.15 * i / n, "Sayfa %d/%d yazılıyor" % (i + 1, n))
            if not sayfa.finalized:
                continue
            try:
                with baglam.mupdf():
                    sayfa.make_docx(belge)
            except _iptaller():
                raise
            except Exception as e:
                print("[pdf_word] %s: %d. sayfa yazılamadı: %r" % (ad, i + 1, e), file=sys.stderr)
                if i + 1 not in atlanan:
                    atlanan.append(i + 1)
        if len(atlanan) == n:
            raise OgeHatasi("hata", "Belgenin hiçbir sayfası dönüştürülemedi: %s" % ad)
        ilerleme(0.96, "Kaydediliyor…")
        belge.save(cikti)
    finally:
        with baglam.mupdf():
            araclar._kapat(doc)

    sonuc = {"sayfa": n, "taranmisSayfa": len(taranmis), "atlananSayfalar": sorted(atlanan)}
    uyarilar = []
    if taranmis:
        if len(taranmis) == n:
            uyarilar.append("Belge taranmış: sayfalar resim olarak aktarıldı, metni Word'de düzenlenemez.")
        else:
            uyarilar.append("Taranmış sayfalar (%s) resim olarak aktarıldı, metinleri Word'de düzenlenemez." % _sayfa_listesi(taranmis))
    if atlanan:
        uyarilar.append("Şu sayfalar dönüştürülemedi, Word belgesinde yok: %s." % _sayfa_listesi(sorted(atlanan)))
    if uyarilar:
        sonuc["uyari"] = " ".join(uyarilar)
    return sonuc


def _iptaller():
    return (araclar._cekirdek().IptalEdildi, InterruptedError)



donustur.donusturucu_kaydet("pdf", "word", _pdf_word, hazir)
donustur.yetenek_kaydet("pdf_word", yetenek)
