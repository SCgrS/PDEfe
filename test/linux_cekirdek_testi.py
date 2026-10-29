# -*- coding: utf-8 -*-
"""Çekirdeğin Linux'a özgü parçaları (0.3.1, Linux sürümü). İki bölüm:
  A) Her sistemde koşan birim denetimleri (sahte girdilerle): dış programların ortamı (LD_LIBRARY_PATH'ten PyInstaller'ın ve AppImage'ın
     klasörleri çıkar), fc-match yanıtının okunması ve yazı notu fontunun seçimi (aynı aile ya da ölçüleri aynı eşi, yoksa Arial, son çare
     herhangi bir TrueType), UYAP Doküman Editörü'nün uygulama menüsü kaydından (.desktop) bulunması, Snap / Flatpak LibreOffice'in elenmesi.
  B) Yalnız Linux'ta (CI: ubuntu-22.04, kaynaktan): fontconfig'le yazı notu fontu ve Türkçe harfli FreeText notunun kaydı, baştan yazılan
     kayıtta izinler, salt okunur dosyaya yazılmaması, yazı tanıyıcı yokken ocr_sayfa'nın "desteklenmiyor" demesi, LibreOffice varsa Word → PDF
     (Türkçe metin PDF'te), yoksa anlaşılır neden, UYAP Doküman Editörü yokken UDF yeteneğinin kapalı olması.
Belgeler test/cikti/linux_cekirdek altında üretilir. Kullanım: python test/linux_cekirdek_testi.py  (Linux'ta: .venv/bin/python ya da CI'da python)"""
import os
import shutil
import stat
import sys
import tempfile
import unicodedata

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))
sys.path.insert(0, os.path.join(KOK, "test"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
import pdefe_core  # noqa: E402,F401  (yöntemler ve önbellek kurulur)
from islemler import linux, notlar, udf, word  # noqa: E402
import ornek_pdf_uret  # noqa: E402

LINUX = sys.platform.startswith("linux")
CIKTI = os.path.join(KOK, "test", "cikti", "linux_cekirdek")
shutil.rmtree(CIKTI, ignore_errors=True)
os.makedirs(CIKTI, exist_ok=True)
hata = toplam = 0


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if ok and not ayrinti else " — " + str(ayrinti)[:700]))


def bilgi(ad, ayrinti):
    print("BİLGİ " + ad + " — " + str(ayrinti)[:1500])


def cagir(yontem, params, sure=300):
    """Çekirdek yöntemi (modülden); ertelenmiş yanıt beklenir."""
    import threading
    p = dict(params, _ilerleme=lambda *_a, **_k: None, _iptal_mi=lambda: False)
    r = pdefe_core.YONTEMLER[yontem](p)
    if isinstance(r, pdefe_core.Ertelenmis):
        olay, kutu = threading.Event(), {}
        r.baslat(lambda s, h: (kutu.update(s=s, h=h), olay.set()))
        if not olay.wait(sure):
            raise RuntimeError("ertelenmiş yanıt gelmedi")
        if kutu["h"] is not None:
            raise kutu["h"]
        r = kutu["s"]
    return r


# ================================================================ A) birim denetimleri (her sistemde)
# ---- dış programların ortamı
o = {"LD_LIBRARY_PATH": "/tmp/_MEIabc:/tmp/.mount_PDEfeX/usr/lib:/usr/lib/ozel", "APPDIR": "/tmp/.mount_PDEfeX"}
linux.ortami_temizle(o, paket_klasoru="/tmp/_MEIabc")
sonuc("ortam: PyInstaller ve AppImage klasörleri çıkar, kullanıcınınki kalır", o.get("LD_LIBRARY_PATH") == "/usr/lib/ozel", o)
o = {"LD_LIBRARY_PATH": "/opt/pdefe/_internal", "LD_LIBRARY_PATH_ORIG": "/usr/lib/ozel:/tmp/.mount_X/usr/lib", "APPDIR": "/tmp/.mount_X"}
linux.ortami_temizle(o, paket_klasoru="/opt/pdefe/_internal")
sonuc("ortam: PyInstaller'ın sakladığı özgün değer temel alınır (AppImage klasörü yine çıkar)", o.get("LD_LIBRARY_PATH") == "/usr/lib/ozel", o)
o = {"LD_LIBRARY_PATH": "/tmp/.mount_X/usr/lib", "APPDIR": "/tmp/.mount_X"}
linux.ortami_temizle(o, paket_klasoru="")
sonuc("ortam: yalnız AppImage'ınki varsa değişken silinir", "LD_LIBRARY_PATH" not in o, o)
o = {"PATH": "/usr/bin"}
linux.ortami_temizle(o, paket_klasoru="/x")
sonuc("ortam: değişken yoksa eklenmez", o == {"PATH": "/usr/bin"}, o)
o = {"LD_LIBRARY_PATH": "/tmp/.mount_Xb/usr/lib:/opt/a", "APPDIR": "/tmp/.mount_X"}
linux.ortami_temizle(o, paket_klasoru="")
sonuc("ortam: adı aynı başlayan başka klasör (/tmp/.mount_Xb) çıkmaz", o.get("LD_LIBRARY_PATH") == "/tmp/.mount_Xb/usr/lib:/opt/a", o)


# ---- fc-match yanıtı ve font seçimi (sahte fontconfig)
def sahte_fc(tablo):
    """tablo: {(aile küçük harf, kalın, italik): (dosya, aile, ağırlık, eğim)}; bilinmeyen aile için tablodaki (None, …) satırı."""
    def calistir(komut):
        desen = komut[-1]
        aile, *ozellik = desen.split(":")
        kalin = "weight=bold" in ozellik
        italik = "slant=italic" in ozellik
        k = tablo.get((aile.lower(), kalin, italik)) or tablo.get((None, kalin, italik)) or tablo.get((None, False, False))
        if not k:
            return None
        return "%s\n%s\n%s\n%s\n" % k
    return calistir


LIB = "/usr/share/fonts/truetype/liberation/"
DEJA = "/usr/share/fonts/truetype/dejavu/"
TABLO = {
    ("arial", False, False): (LIB + "LiberationSans-Regular.ttf", "Liberation Sans", "80", "0"),
    ("arial", True, False): (LIB + "LiberationSans-Bold.ttf", "Liberation Sans", "200", "0"),
    ("arial", False, True): (LIB + "LiberationSans-Italic.ttf", "Liberation Sans", "80", "100"),
    ("times new roman", True, False): (LIB + "LiberationSerif-Bold.ttf", "Liberation Serif", "200", "0"),
    ("calibri", False, False): ("/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf", "Carlito", "80", "0"),
    ("calibri", False, True): ("/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf", "Carlito", "80", "0"),
    (None, False, False): (DEJA + "DejaVuSans.ttf", "DejaVu Sans", "80", "0"),
    (None, True, False): (DEJA + "DejaVuSans-Bold.ttf", "DejaVu Sans", "200", "0"),
}
var = lambda y: True   # noqa: E731
f = linux.fc_match("Arial", True, False, sahte_fc(TABLO))
sonuc("fc-match yanıtı okunur (dosya, aile, kalın, italik)", f == {"dosya": LIB + "LiberationSans-Bold.ttf", "aileler": ["liberation sans"], "kalin": True,
                                                                 "italik": False}, f)
f = linux.fc_match("X", False, False, lambda k: "/a/b.ttf\nA,A Bold\n[100 900]\n0\n")
sonuc("fc-match: değişken yazı tipinin ağırlık aralığı ve çok adlı aile", f and f["aileler"] == ["a", "a bold"] and f["kalin"] is False, f)
sonuc("fc-match: fontconfig yoksa None", linux.fc_match("Arial", calistir=lambda k: None) is None)
DENEMELER = [
    (("Arial", False, False), (LIB + "LiberationSans-Regular.ttf", False), "Arial → Liberation Sans"),
    (("Arial", False, True), (LIB + "LiberationSans-Italic.ttf", False), "Arial italik → italik yüz"),
    (("Times New Roman", True, False), (LIB + "LiberationSerif-Bold.ttf", False), "kalın Times → Liberation Serif Bold"),
    (("Segoe UI", False, False), (LIB + "LiberationSans-Regular.ttf", False), "Segoe UI (fontconfig DejaVu verir) → Arial'in eşi"),
    (("Calibri", False, False), ("/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf", False), "Calibri → Carlito (ölçüleri aynı)"),
    (("Calibri", False, True), ("/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf", True), "italik yüzü olmayan Carlito → sahte italik"),
]
for (aile, kalin, italik), beklenen, ad in DENEMELER:
    r = linux.yazi_tipi_dosyasi(aile, kalin, italik, sahte_fc(TABLO), var)
    sonuc("font seçimi: " + ad, r == beklenen, r)
TABLO2 = {k: v for k, v in TABLO.items() if k[0] is None}   # Liberation kurulu değil: yalnız DejaVu
r = linux.yazi_tipi_dosyasi("Arial", False, False, sahte_fc(TABLO2), var)
sonuc("font seçimi: eşi kurulu değilse fontconfig'in Arial için seçtiği TrueType (DejaVu Sans)", r == (DEJA + "DejaVuSans.ttf", False), r)
for ad, tablo, var_mi in (
        ("hiç yazı tipi yoksa", {}, var),
        ("yalnız CFF'li .otf varsa (gömülemez)", {(None, False, False): ("/x/Nimbus.otf", "Nimbus Sans", "80", "0")}, var),
        ("fontconfig'in verdiği dosya diskte yoksa", TABLO, lambda y: False)):
    try:
        r = linux.yazi_tipi_dosyasi("Arial", False, False, sahte_fc(tablo), var_mi)
        sonuc("font seçimi: %s Türkçe hata" % ad, False, "hata beklenirdi, seçilen: %r" % (r,))
    except FileNotFoundError as e:
        sonuc("font seçimi: %s Türkçe hata" % ad, "yazı tipi bulunamadı" in str(e), e)

# ---- UYAP Doküman Editörü: uygulama menüsü kaydı (.desktop) ve klasör
gecici = tempfile.mkdtemp(prefix="pdefe-linux-testi-")
try:
    ude = os.path.join(gecici, "opt", "UYAP Doküman Editörü", "lib")
    os.makedirs(ude)
    open(os.path.join(ude, "editor_lib.jar"), "wb").close()
    betik = os.path.join(gecici, "opt", "UYAP Doküman Editörü", "uyap-editor.sh")
    open(betik, "w").close()
    kayit = os.path.join(gecici, "uyap-dokuman-editoru.desktop")
    with open(kayit, "w", encoding="utf-8") as f:
        f.write('[Desktop Entry]\nName=UYAP Doküman Editörü\nExec="%s" %%F\nType=Application\n\n[Desktop Action yeni]\nExec=/yanlis\n' % betik)
    yollar = udf._masaustu_komutlari(kayit)
    sonuc(".desktop: Exec'teki programın klasörü", yollar == [os.path.dirname(os.path.realpath(betik))], yollar)
    bulunan = udf._ude_klasoru(yollar[0]) if yollar else None
    sonuc(".desktop'tan UDE'nin jar klasörü bulunur", bulunan and os.path.samefile(bulunan, ude), bulunan)
    baska = os.path.join(gecici, "gedit.desktop")
    with open(baska, "w", encoding="utf-8") as f:
        f.write("[Desktop Entry]\nName=Metin Düzenleyici\nExec=gedit %U\n")
    sonuc(".desktop: UYAP'a benzemeyen kayıt alınmaz", udf._masaustu_komutlari(baska) == [])
    jar = os.path.join(gecici, "java.desktop")
    with open(jar, "w", encoding="utf-8") as f:
        f.write("[Desktop Entry]\nName=Uyap Kelime İşlemci\nExec=java -jar /opt/uyap/editor.jar\nPath=/opt/uyap\n")
    yollar = udf._masaustu_komutlari(jar)
    sonuc(".desktop: java -jar komutunda jar yolu ve Path", "/opt/uyap" in yollar and "/opt/uyap/editor.jar" in yollar, yollar)
finally:
    shutil.rmtree(gecici, ignore_errors=True)

# ---- LibreOffice: kapalı alan paketleri
for yol, beklenen in (("/snap/bin/libreoffice", True), ("/var/lib/flatpak/exports/bin/org.libreoffice.LibreOffice", True), ("/usr/bin/soffice", False)):
    if beklenen or not LINUX or os.path.exists(yol):
        sonuc("LibreOffice %s: kapalı alanda = %s" % (yol, beklenen), word._kapali_alanda(yol) is beklenen)

# ================================================================ B) yalnız Linux
if not LINUX:
    print("\nBİLGİ B bölümü (fontconfig, kayıt, LibreOffice) yalnız Linux'ta koşar.")
    print(f"\nSonuç: {toplam - hata}/{toplam} geçti.")
    sys.exit(1 if hata else 0)

# ---- yazı notu fontu (gerçek fontconfig)
for aile, kalin in (("Segoe UI", False), ("Arial", False), ("Times New Roman", True), ("Calibri", False)):
    try:
        yol, sahte = notlar._font_dosyasi(aile, kalin, False)
        f = linux.fc_match(aile, kalin)
        sonuc(f"font dosyası: {aile}{' kalın' if kalin else ''} → {os.path.basename(yol)}", os.path.isfile(yol) and yol.endswith(".ttf"), f)
    except Exception as e:  # noqa: BLE001
        sonuc(f"font dosyası: {aile}", False, repr(e))

pdf = os.path.join(CIKTI, "not.pdf")
ornek_pdf_uret.uret(pdf, 1, "Not denemesi")
METIN1 = "Şişli'de İğneada'ya çığ düştü: ÇĞİÖŞÜ çğıöşü"
METIN2 = "Kalın Times: Türkçe İĞŞ ığş"
try:
    notlar.y_notlar_kaydet({"yol": pdf, "hedef": pdf, "artimli": True, "islemler": [
        {"islem": "ekle", "id": "f1", "not": {"tur": "FreeText", "sayfa": 1, "rect": [70, 700, 380, 740], "yazar": "Deneme Yazar", "icerik": METIN1,
                                              "yazi": {"tip": "Segoe UI", "boyut": 11, "renk": "#1a237e", "arka": "#fff9c4", "kenarlik": True}}},
        {"islem": "ekle", "id": "f2", "not": {"tur": "FreeText", "sayfa": 1, "rect": [70, 750, 380, 790], "yazar": "Deneme Yazar", "icerik": METIN2,
                                              "yazi": {"tip": "Times New Roman", "boyut": 13, "renk": "#b71c1c", "kalin": True, "kenarlik": False}}}]})
    doc = pymupdf.open(pdf)
    pg = doc[0]
    metinler = {a.info.get("content"): pg.get_textbox(a.rect).replace("\n", " ").strip() for a in pg.annots() if a.type[1] == "FreeText"}
    for beklenen in (METIN1, METIN2):
        okunan = metinler.get(beklenen, "")
        sonuc(f"notun görünümünde Türkçe metin: {beklenen[:24]}…", unicodedata.normalize("NFC", beklenen) in unicodedata.normalize("NFC", okunan), okunan)
    bilgi("sayfadaki fontlar", sorted({f[3] for f in pg.get_fonts(full=True)}))
    doc.close()
except Exception as e:  # noqa: BLE001
    sonuc("yazı notu kaydı", False, repr(e))

# ---- baştan yazılan kayıtta izinler, salt okunur dosya
pdf2 = os.path.join(CIKTI, "izin.pdf")
ornek_pdf_uret.uret(pdf2, 1, "İzin denemesi")
os.chmod(pdf2, 0o640)
NOT = {"islem": "ekle", "id": "n1", "not": {"tur": "Text", "sayfa": 1, "rect": [100, 100, 0, 0], "yazar": "Deneme Yazar", "icerik": "Not: ığşİ"}}
try:
    notlar.y_notlar_kaydet({"yol": pdf2, "hedef": pdf2, "temiz": True, "islemler": [NOT]})
    kip = stat.S_IMODE(os.stat(pdf2).st_mode)
    sonuc("baştan yazılan kayıtta izinler korundu (0640)", kip == 0o640, oct(kip))
except Exception as e:  # noqa: BLE001
    sonuc("baştan yazılan kayıt", False, repr(e))
pdefe_core.onbellek.hepsini_birak()
pdf3 = os.path.join(CIKTI, "salt-okunur.pdf")
ornek_pdf_uret.uret(pdf3, 1, "Salt okunur denemesi")
with open(pdf3, "rb") as f:
    once = f.read()
os.chmod(pdf3, 0o444)
try:
    if os.geteuid() == 0:
        bilgi("salt okunur dosya", "root olarak koşuyor (izin bitleri bağlamaz), atlandı")
    else:
        try:
            notlar.y_notlar_kaydet({"yol": pdf3, "hedef": pdf3, "temiz": True, "islemler": [NOT]})
            sonuc("salt okunur dosyaya yazılmaz", False, "hata beklenirdi")
        except Exception as e:  # noqa: BLE001
            with open(pdf3, "rb") as f:
                ayni = f.read() == once
            sonuc("salt okunur dosyaya yazılmaz, 'salt okunur' der", "salt okunur" in str(e) and ayni, f"{type(e).__name__}: {e}")
finally:
    os.chmod(pdf3, 0o644)
pdefe_core.onbellek.hepsini_birak()

# ---- yazı tanıma: tanıyıcı yok
try:
    import tanima_pdf_uret
    klasor = os.path.join(CIKTI, "tanima")
    tanima_pdf_uret.uret(klasor)
    r = cagir("ocr_sayfa", {"yol": os.path.join(klasor, "taranmis.pdf"), "sayfa": 1})
    sonuc("ocr_sayfa: Linux'ta tanıyıcı yok, 'desteklenmiyor' döner (çökmez)", r.get("desteklenmiyor") is True and r.get("satirlar") == [], r)
except Exception as e:  # noqa: BLE001
    sonuc("ocr_sayfa", False, repr(e))

# ---- dönüştürme yetenekleri: UDF (UDE yok) ve Word (LibreOffice)
y = cagir("donusum_yetenekleri", {})
bilgi("UDF yeteneği", y.get("udf"))
bilgi("Word yeteneği", y.get("word"))
d = y.get("donusumler") or {}
sonuc("PDF → UDF, PDF → Word, TIFF ↔ PDF açık (bir şey gerekmez)", all(d.get(k, {}).get("var") for k in ("pdf>udf", "pdf>word", "tiff>pdf", "pdf>tiff")),
      {k: d.get(k) for k in ("pdf>udf", "pdf>word", "tiff>pdf", "pdf>tiff")})
lo = word.libreoffice_bul()
w = y.get("word") or {}
if lo:
    sonuc("LibreOffice bulundu, Word → PDF motoru libreoffice", w.get("var") is True and w.get("motor") == "libreoffice", w)
    try:
        import docx  # python-docx
        belge = docx.Document()
        belge.add_heading("Deneme dilekçesi", 1)
        belge.add_paragraph("Şişli İcra Dairesi'ne: Borçlunun ığşİÇÖÜ harfli adresine tebligat yapılmıştır.")
        kaynak = os.path.join(CIKTI, "deneme.docx")
        belge.save(kaynak)
        hedef = os.path.join(CIKTI, "deneme.pdf")
        r = cagir("bicim_donustur", {"ogeler": [{"yol": kaynak, "hedef": hedef, "hedefBicim": "pdf"}]}, sure=240)
        s0 = (r.get("sonuclar") or [{}])[0]
        metin = ""
        if os.path.isfile(hedef):
            with pymupdf.open(hedef) as doc:
                metin = unicodedata.normalize("NFC", "".join(p.get_text() for p in doc))
        sonuc("Word → PDF (LibreOffice): PDF yazıldı, Türkçe metin PDF'te", r.get("basarili") == 1 and "ığşİÇÖÜ" in metin, (s0, metin[:200]))
        sonuc("Word → PDF (LibreOffice): sonuçta LibreOffice uyarısı", "LibreOffice" in str(s0.get("uyari") or ""), s0)
        artik = [a for a in os.listdir(tempfile.gettempdir()) if a.startswith("pdefe-donustur-") and "libreoffice" not in a]
        bilgi("geçici klasörler", artik)
    except Exception as e:  # noqa: BLE001
        sonuc("Word → PDF (LibreOffice)", False, repr(e))
else:
    sonuc("LibreOffice yok: Word → PDF kapalı, neden LibreOffice'i söyler", w.get("var") is False and "LibreOffice gerekir" in (w.get("neden") or ""), w)
u = y.get("udf") or {}
if not (u.get("ude") or {}).get("var"):
    sonuc("UYAP Doküman Editörü yok: UDF → PDF kapalı ya da yaklaşık çizime kalır, çekirdek düşmez", d.get("udf>pdf", {}).get("var") is False, d.get("udf>pdf"))

print(f"\nSonuç: {toplam - hata}/{toplam} geçti.")
sys.exit(1 if hata else 0)
