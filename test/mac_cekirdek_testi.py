# -*- coding: utf-8 -*-
"""Çekirdeğin işletim sistemine bağlı parçaları (0.2.0, macOS desteği); Windows'ta da koşar:
  1) yazı notu fontu: Segoe UI (macOS'ta yok → Arial) ve kalın Times New Roman gömülür, Türkçe harfler notun görünümünde doğru okunur
  2) baştan yazılan kayıt (temiz) dosyanın izinlerini ve macOS'ta genişletilmiş özniteliklerini (Finder etiketi, internetten indirildi işareti)
     korur; Windows'ta ReplaceFileW yolu
  3) görsellerdeki yazının tanınması: taranmış örnek sayfada (test/tanima_pdf_uret.py) beklenen sözcüklerin kaçı, Türkçe harfli olanların kaçı
     doğru okundu; tanıyıcı yoksa ya da hiçbir şey tanınmazsa hata. Tanıyıcının dilleri (macOS: Apple Vision) yazılır.
Belgeler test/cikti/mac_cekirdek altında üretilir. Kullanım: python test/mac_cekirdek_testi.py  (macOS: .venv/bin/python)"""
import os
import shutil
import stat
import subprocess
import sys
import time
import unicodedata

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))
sys.path.insert(0, os.path.join(KOK, "test"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
import pdefe_core  # noqa: E402,F401  (yöntemler ve önbellek kurulur)
from islemler import notlar, yazi_tanima as yt  # noqa: E402
import tanima_pdf_uret  # noqa: E402
import ornek_pdf_uret  # noqa: E402

MAC = sys.platform == "darwin"
CIKTI = os.path.join(KOK, "test", "cikti", "mac_cekirdek")
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


# ---------------------------------------------------------------- 1) yazı notu fontu
print("Font klasörleri:", notlar.FONT_KLASORLERI)
for aile, kalin in (("Segoe UI", False), ("Arial", False), ("Times New Roman", True)):
    yol, sahte = notlar._font_dosyasi(aile, kalin, False)
    sonuc(f"font dosyası var: {aile}{' kalın' if kalin else ''} → {os.path.basename(yol)}", os.path.exists(yol), yol)

pdf = os.path.join(CIKTI, "not.pdf")
ornek_pdf_uret.uret(pdf, 1, "Not denemesi")
METIN1 = "Şişli'de İğneada'ya çığ düştü: ÇĞİÖŞÜ çğıöşü"
METIN2 = "Kalın Times: Türkçe İĞŞ ığş"
islemler = [
    {"islem": "ekle", "id": "f1", "not": {"tur": "FreeText", "sayfa": 1, "rect": [70, 700, 380, 740], "yazar": "Deneme Yazar", "icerik": METIN1,
                                          "yazi": {"tip": "Segoe UI", "boyut": 11, "renk": "#1a237e", "arka": "#fff9c4", "kenarlik": True}}},
    {"islem": "ekle", "id": "f2", "not": {"tur": "FreeText", "sayfa": 1, "rect": [70, 750, 380, 790], "yazar": "Deneme Yazar", "icerik": METIN2,
                                          "yazi": {"tip": "Times New Roman", "boyut": 13, "renk": "#b71c1c", "kalin": True, "kenarlik": False}}},
]
try:
    r = notlar.y_notlar_kaydet({"yol": pdf, "hedef": pdf, "islemler": islemler, "artimli": True})
    doc = pymupdf.open(pdf)
    pg = doc[0]
    metinler = {a.info.get("content"): pg.get_textbox(a.rect).replace("\n", " ").strip() for a in pg.annots() if a.type[1] == "FreeText"}
    for beklenen in (METIN1, METIN2):
        okunan = metinler.get(beklenen, "")
        sonuc(f"notun görünümünde Türkçe metin: {beklenen[:24]}…", unicodedata.normalize("NFC", beklenen) in unicodedata.normalize("NFC", okunan), okunan)
    tur, kayit = doc.xref_get_key(doc.pdf_catalog(), "PDEfeFonts")
    sonuc("PDEfe fontları gömüldü (/PDEfeFonts)", tur == "dict" and "TimesNewRomanB" in kayit, kayit)
    fontlar = sorted({f[3] for f in pg.get_fonts(full=True)})
    bilgi("sayfadaki fontlar", fontlar)
    doc.close()
except Exception as e:  # noqa: BLE001
    sonuc("yazı notu kaydı", False, repr(e))

# ---------------------------------------------------------------- 1b) gömülen alt kümenin dağarcığı (0.2.1)
# Ok, matematik işareti ve Latin Genişletilmiş-A harfi notun görünümünde çizilir; dağarcıkta olmayan karakter boş değil '?' çıkar (önceden
# glif tam fontta aranıyordu, alt kümede boş olan glif yazılıyordu: ikisi de boş çıkıyordu)
pdf_d = os.path.join(CIKTI, "dagarcik.pdf")
d = pymupdf.open()
d.new_page(width=595, height=842)
d.save(pdf_d)
d.close()
DENEMELER = [("aaaa", "aaaa"), ("→→→→", "→→→→"), ("≤≤≤≤", "≤≤≤≤"), ("łłłł", "łłłł"), ("αααα", "????")]
try:
    notlar.y_notlar_kaydet({"yol": pdf_d, "hedef": pdf_d, "artimli": True, "islemler": [
        {"islem": "ekle", "id": "d%d" % i, "not": {"tur": "FreeText", "sayfa": 1, "rect": [70, 80 + 70 * i, 330, 140 + 70 * i], "icerik": m,
                                                 "yazi": {"tip": "Arial", "boyut": 36, "renk": "#000000", "kenarlik": False}}}
        for i, (m, _) in enumerate(DENEMELER)]})
    doc = pymupdf.open(pdf_d)
    pg = doc[0]
    for a in pg.annots():
        beklenen = dict(DENEMELER).get(a.info.get("content"))
        pix = pg.get_pixmap(clip=a.rect, dpi=72, colorspace=pymupdf.csGRAY)
        murekkep = sum(1 for v in pix.samples if v < 128)
        okunan = pg.get_textbox(a.rect).strip()
        sonuc(f"yazı notunda {a.info.get('content')} → {beklenen} çizilir", murekkep > 50 and okunan == beklenen, f"koyu piksel {murekkep}, metin {okunan!r}")
    doc.close()
except Exception as e:  # noqa: BLE001
    sonuc("dağarcık denemesi", False, repr(e))

# ---------------------------------------------------------------- 2) baştan yazılan kayıtta izinler ve öznitelikler
pdf2 = os.path.join(CIKTI, "izin.pdf")
ornek_pdf_uret.uret(pdf2, 1, "İzin denemesi")
if os.name != "nt":
    os.chmod(pdf2, 0o640)
    if MAC:
        subprocess.run(["xattr", "-w", "com.apple.metadata:_kMDItemUserTags", "Kırmızı\n6", pdf2], check=False)
        subprocess.run(["xattr", "-w", "com.apple.quarantine", "0083;00000000;Safari;", pdf2], check=False)
try:
    notlar.y_notlar_kaydet({"yol": pdf2, "hedef": pdf2, "temiz": True, "islemler": [
        {"islem": "ekle", "id": "n1", "not": {"tur": "Text", "sayfa": 1, "rect": [100, 100, 0, 0], "yazar": "Deneme Yazar", "icerik": "Not: ığşİ"}}]})
    doc = pymupdf.open(pdf2)
    sonuc("baştan yazılan kayıt açılıyor, not yerinde", any(a.type[1] == "Text" for a in doc[0].annots()))
    doc.close()
    if os.name != "nt":
        kip = stat.S_IMODE(os.stat(pdf2).st_mode)
        sonuc("izinler korundu (0640)", kip == 0o640, oct(kip))
        if MAC:
            ozn = subprocess.run(["xattr", pdf2], capture_output=True, text=True).stdout
            sonuc("Finder etiketi korundu", "_kMDItemUserTags" in ozn, ozn)
            sonuc("internetten indirildi işareti korundu", "com.apple.quarantine" in ozn, ozn)
except Exception as e:  # noqa: BLE001
    sonuc("baştan yazılan kayıt", False, repr(e))

# ---------------------------------------------------------------- 2b) yazma izni olmayan dosyaya kayıt (0.2.1)
# os.replace (rename) klasörün iznine baktığından macOS'ta salt okunur PDF sorusuz baştan yazılıyordu: kayıt "salt okunur" hatası vermeli,
# dosya değişmemeli. Windows'ta salt okunur dosyayı ReplaceFileW reddeder (yol değişmedi).
if os.name != "nt":
    from islemler import yapisal  # noqa: E402
    durumlar = [("izin 0444", lambda y: os.chmod(y, 0o444), lambda y: os.chmod(y, 0o644))]
    if MAC:
        durumlar.append(("Finder'da Kilitli (uchg)", lambda y: os.chflags(y, stat.UF_IMMUTABLE), lambda y: os.chflags(y, 0)))
    NOT = {"islem": "ekle", "id": "n1", "not": {"tur": "Text", "sayfa": 1, "rect": [100, 100, 0, 0], "yazar": "Deneme Yazar", "icerik": "Not"}}
    for i, (durum, kilitle, ac) in enumerate(durumlar):
        for yontem, cagri in (
                ("notlar_kaydet", lambda y: notlar.y_notlar_kaydet({"yol": y, "hedef": y, "artimli": True, "islemler": [NOT]})),
                ("notlar_kaydet temiz", lambda y: notlar.y_notlar_kaydet({"yol": y, "hedef": y, "temiz": True, "islemler": [NOT]})),
                ("yapisal_kaydet", lambda y: yapisal.y_yapisal_kaydet({"yol": y, "hedef": y, "tarif": [{"kaynak": {"yol": y, "sayfa": 1}}],
                                                                       "anlikKlasor": os.path.join(CIKTI, "anlik")}))):
            y = os.path.join(CIKTI, "salt-okunur-%d-%s.pdf" % (i, yontem.replace(" ", "-")))
            ornek_pdf_uret.uret(y, 2, "Salt okunur denemesi")
            with open(y, "rb") as f:
                once = f.read()
            kilitle(y)
            try:
                cagri(y)
                sonuc(f"{durum}: {yontem} yazmaz", False, "hata beklenirdi")
            except Exception as e:  # noqa: BLE001
                with open(y, "rb") as f:
                    ayni = f.read() == once
                sonuc(f"{durum}: {yontem} yazmaz, 'salt okunur' der", isinstance(e, PermissionError) and "salt okunur" in str(e) and ayni,
                      f"{type(e).__name__}: {e}; dosya aynı: {ayni}")
            finally:
                ac(y)
            pdefe_core.onbellek.hepsini_birak()
        # Araçların ön denetimi (dosya_erisim): Kilitli dosya da salt okunur sayılır, "başka bir programda açık" denmez (0.2.1)
        from islemler import araclar  # noqa: E402
        y = os.path.join(CIKTI, "salt-okunur-%d-erisim.pdf" % i)
        ornek_pdf_uret.uret(y, 1, "Salt okunur denemesi")
        kilitle(y)
        try:
            erisim = araclar.y_dosya_erisim({"yol": y})
            sonuc(f"{durum}: dosya_erisim saltOkunur", erisim.get("saltOkunur") is True and erisim.get("yazilir") is False, erisim)
        finally:
            ac(y)
    artik = [a for a in os.listdir(CIKTI) if a.endswith(".pdefe-tmp")]
    artik += os.listdir(os.path.join(CIKTI, "anlik")) if os.path.isdir(os.path.join(CIKTI, "anlik")) else []
    sonuc("salt okunur kayıtta geçici dosya ya da anlık kopya kalmaz", not artik, artik)

# ---------------------------------------------------------------- 3) görsellerdeki yazının tanınması
klasor = os.path.join(CIKTI, "tanima")
tanima_pdf_uret.uret(klasor)
taranmis = os.path.join(klasor, "taranmis.pdf")
doc = pymupdf.open(taranmis)
t0 = time.time()
sozcukler = yt.sozcukler(doc, taranmis, 1)
sure = time.time() - t0
motor = yt._motor
if MAC:
    bilgi("tanıyıcı", "Apple Vision; Türkçe: " + ("var (" + ", ".join(getattr(motor, "diller", []) or []) + ")" if getattr(motor, "diller", None) else "yok") if motor else "yok")
sonuc("tanıyıcı açıldı", bool(motor), motor)
okunan = [unicodedata.normalize("NFC", w[4]) for w in sozcukler]
bilgi(f"tanınan metin ({len(okunan)} sözcük, {sure:.2f} sn)", " ".join(okunan))
beklenen = []
for satir in [tanima_pdf_uret.BASLIK] + tanima_pdf_uret.GOVDE + ["İstanbul, 01.10.2026", "Müdür Yardımcısı"]:
    beklenen += [unicodedata.normalize("NFC", s.strip(".,:;")) for s in satir.split()]
temiz = [s.strip(".,:;") for s in okunan]
bulunan = [s for s in beklenen if s in temiz]
turkce = [s for s in beklenen if any(c in s for c in "şŞğĞıİçÇöÖüÜ")]
turkce_bulunan = [s for s in turkce if s in temiz]
oran, t_oran = len(bulunan) / max(1, len(beklenen)), len(turkce_bulunan) / max(1, len(turkce))
bilgi("doğru okunan sözcük", f"{len(bulunan)}/{len(beklenen)} (%{round(100 * oran)}); Türkçe harfli: {len(turkce_bulunan)}/{len(turkce)} (%{round(100 * t_oran)})")
bilgi("okunamayan Türkçe sözcükler", [s for s in turkce if s not in temiz])
sonuc("yazı tanındı (beklenen sözcüklerin en az yarısı)", oran >= 0.5, f"%{round(100 * oran)}")
doc.close()
yt.bitmesini_bekle(5)

print(f"\nSonuç: {toplam - hata}/{toplam} geçti.")
sys.exit(1 if hata else 0)
