# -*- coding: utf-8 -*-
"""Çekirdeğin güvenlik ve kişisel veri davranışları (0.1.23, güvenlik denetimi). Belgeler test/cikti/guvenlik altında üretilir.
Kullanım: .venv\\Scripts\\python.exe test\\guvenlik_testi.py"""
import os
import sys
import shutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))

import pymupdf  # noqa: E402
import pdefe_core  # noqa: E402
from islemler import notlar, yapisal  # noqa: E402

CIKTI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cikti", "guvenlik")
os.makedirs(CIKTI, exist_ok=True)
GIZLI = "GIZLI-NOT-METNI-4711"
hata = toplam = 0


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if ok or not ayrinti else " — " + str(ayrinti)))


def bos_belge(ad, sifre=None):
    yol = os.path.join(CIKTI, ad)
    doc = pymupdf.open()
    sayfa = doc.new_page(width=595, height=842)
    sayfa.insert_text((72, 100), "Deneme belgesi", fontsize=14)
    if sifre:
        doc.save(yol, encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw=sifre, permissions=pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_ANNOTATE)
    else:
        doc.save(yol)
    doc.close()
    return yol


def not_ekle_kaydet(yol, icerik):
    """PDEfe'nin Kaydet'i gibi: notu ekler, artımlı kaydeder. Döner: notun xref'i."""
    r = notlar.y_notlar_kaydet({"yol": yol, "artimli": True, "islemler": [{"islem": "ekle", "id": "n1", "not": {
        "tur": "Text", "sayfa": 1, "rect": [100, 100, 120, 120], "icerik": icerik, "yazar": "Deneme Yazar", "renk": "#ffd100", "opaklik": 1,
        "simge": "Comment", "konu": "Not"}}]})
    pdefe_core.onbellek.hepsini_birak()
    return r["xrefler"]["n1"]


def ham(yol):
    with open(yol, "rb") as f:
        return f.read()


# ---------------------------------------------------------------- 1. silinen not dosyada iz bırakmaz
print("— Silinen ve değiştirilen not")
for temiz in (False, True):
    yol = bos_belge("not-%s.pdf" % ("temiz" if temiz else "artimli"))
    xref = not_ekle_kaydet(yol, GIZLI)
    sonuc("not kaydedildi (metin dosyada)", GIZLI.encode() in ham(yol))
    r = notlar.y_notlar_kaydet({"yol": yol, "artimli": True, "temiz": temiz,
                                "islemler": [{"islem": "sil", "id": "n1", "xref": xref, "not": {"xref": xref, "sayfa": 1}}]})
    pdefe_core.onbellek.hepsini_birak()
    d = pymupdf.open(yol)
    gorunen = len(list(d[0].annots()))
    d.close()
    if temiz:
        sonuc("temiz: silinen not okuyucuda görünmez", gorunen == 0, gorunen)
        sonuc("temiz: silinen notun metni dosyada kalmaz", GIZLI.encode() not in ham(yol))
        sonuc("temiz: kayıt artımlı değil", r["artimli"] is False, r)
        sonuc("temiz: geçici dosya kalmadı", not os.path.exists(yol + ".pdefe-tmp"))
    else:
        sonuc("artımlı (eski davranış): not görünmez ama metni dosyada kalır", gorunen == 0 and GIZLI.encode() in ham(yol))

# Değiştirilen not: eski metin temiz kayıttan sonra kalmaz
yol = bos_belge("not-degisen.pdf")
xref = not_ekle_kaydet(yol, GIZLI)
notlar.y_notlar_kaydet({"yol": yol, "artimli": True, "temiz": True, "islemler": [{"islem": "guncelle", "id": "n1", "xref": xref, "not": {
    "xref": xref, "tur": "Text", "sayfa": 1, "rect": [100, 100, 120, 120], "icerik": "Yeni metin", "yazar": "Deneme Yazar",
    "renk": "#ffd100", "opaklik": 1, "simge": "Comment", "konu": "Not"}}]})
pdefe_core.onbellek.hepsini_birak()
d = pymupdf.open(yol)
icerikler = [a.info.get("content") for a in d[0].annots()]
d.close()
sonuc("temiz: değiştirilen notun yeni metni kaydedildi", icerikler == ["Yeni metin"], icerikler)
sonuc("temiz: değiştirilen notun eski metni dosyada kalmaz", GIZLI.encode() not in ham(yol))

# Şifreli (sahip parolalı) belgede temiz kayıt şifrelemeyi korur
yol = bos_belge("not-sifreli.pdf", sifre="sahip-parolasi")
xref = not_ekle_kaydet(yol, GIZLI)
notlar.y_notlar_kaydet({"yol": yol, "artimli": True, "temiz": True,
                        "islemler": [{"islem": "sil", "id": "n1", "xref": xref, "not": {"xref": xref, "sayfa": 1}}]})
pdefe_core.onbellek.hepsini_birak()
d = pymupdf.open(yol)
sifre_var = bool(d.metadata.get("encryption"))
d.close()
sonuc("temiz: şifreli belgenin şifrelemesi korunur", sifre_var, d.metadata if not sifre_var else "")

# Temiz kayıt dosyanın "internetten indirildi" işaretini (Zone.Identifier yan akışı) korur
yol = bos_belge("not-isaretli.pdf")
xref = not_ekle_kaydet(yol, GIZLI)
ISARET = "[ZoneTransfer]\r\nZoneId=3\r\n"
with open(yol + ":Zone.Identifier", "w", newline="") as f:
    f.write(ISARET)
notlar.y_notlar_kaydet({"yol": yol, "artimli": True, "temiz": True,
                        "islemler": [{"islem": "sil", "id": "n1", "xref": xref, "not": {"xref": xref, "sayfa": 1}}]})
pdefe_core.onbellek.hepsini_birak()
try:
    with open(yol + ":Zone.Identifier", newline="") as f:
        isaret = f.read()
except OSError as e:
    isaret = "yok (%s)" % e
sonuc("temiz: 'internetten indirildi' işareti korunur", isaret == ISARET, isaret)
sonuc("temiz: işaretli dosyada da metin kalmaz", GIZLI.encode() not in ham(yol))

# Onarılmış (bozuk çapraz başvuru tablolu) dosyaya not eklenebilir: artımlı yazılamaz, tam yazıma geçilir
yol = bos_belge("onarilmis.pdf")
with open(yol, "rb") as f:
    veri = f.read()
with open(yol, "wb") as f:
    f.write(veri.replace(b"startxref", b"startxxxx"))
try:
    xref = not_ekle_kaydet(yol, "Onarılmış belgeye not")
    d = pymupdf.open(yol)
    sonuc("onarılmış dosyaya not kaydedilir", len(list(d[0].annots())) == 1)
    d.close()
except Exception as e:
    sonuc("onarılmış dosyaya not kaydedilir", False, e)

# Etiketli PDF: yapı ağacı (OBJR) notu gösterse de silinen notun metni tam yazımda kalmaz
yol = bos_belge("etiketli.pdf")
xref = not_ekle_kaydet(yol, GIZLI)
d = pymupdf.open(yol)
objr = d.get_new_xref()
d.update_object(objr, "<< /Type /OBJR /Obj %d 0 R /Pg %d 0 R >>" % (xref, d[0].xref))
yapi = d.get_new_xref()
d.update_object(yapi, "<< /Type /StructElem /S /Annot /K [%d 0 R] >>" % objr)
kok = d.get_new_xref()
d.update_object(kok, "<< /Type /StructTreeRoot /K [%d 0 R] >>" % yapi)
d.xref_set_key(d.pdf_catalog(), "StructTreeRoot", "%d 0 R" % kok)
d.saveIncr()
d.close()
notlar.y_notlar_kaydet({"yol": yol, "artimli": True, "temiz": True,
                        "islemler": [{"islem": "sil", "id": "n1", "xref": xref, "not": {"xref": xref, "sayfa": 1}}]})
pdefe_core.onbellek.hepsini_birak()
sonuc("etiketli PDF: silinen notun metni dosyada kalmaz", GIZLI.encode() not in ham(yol))

# ---------------------------------------------------------------- 2. e-imza algılama
print("— E-imza algılama")
yol = bos_belge("imzasiz.pdf")
sonuc("imzasız belge imzalı sayılmaz", notlar.y_imza_durumu({"yol": yol})["imzali"] is False)
pdefe_core.onbellek.hepsini_birak()
yol = bos_belge("imza-bayrakli.pdf")
d = pymupdf.open(yol)
af = d.get_new_xref()
d.update_object(af, "<< /Fields [] /SigFlags 3 >>")
d.xref_set_key(d.pdf_catalog(), "AcroForm", "%d 0 R" % af)
d.saveIncr()
d.close()
sonuc("/SigFlags 3 olan belge imzalı sayılır", notlar.y_imza_durumu({"yol": yol})["imzali"] is True)
pdefe_core.onbellek.hepsini_birak()
yol = bos_belge("imza-byterange.pdf")
d = pymupdf.open(yol)
s = d.get_new_xref()
d.update_object(s, "<< /Type /Sig /Filter /Deneme.Imza /ByteRange [0 0 0 0] /Contents <00> >>")
d.saveIncr()
d.close()
sonuc("imza sözlüğü (/ByteRange) olan belge imzalı sayılır", notlar.y_imza_durumu({"yol": yol})["imzali"] is True)
pdefe_core.onbellek.hepsini_birak()

# ---------------------------------------------------------------- 3. anlik_sil yalnızca anlık kopyayı siler
print("— Anlık kopya silme")
baska = os.path.join(CIKTI, "silinmemeli.pdf")
shutil.copy(yol, baska)
r = yapisal.y_anlik_sil({"yol": baska})
sonuc("anlik_sil anlık kopya olmayan dosyayı silmez", r["ok"] is False and os.path.exists(baska), r)
anlik_klasor = os.path.join(CIKTI, "anlik")
os.makedirs(anlik_klasor, exist_ok=True)
yanlis_ad = os.path.join(anlik_klasor, "dava.pdf")
shutil.copy(yol, yanlis_ad)
r = yapisal.y_anlik_sil({"yol": yanlis_ad})
sonuc("anlik_sil anlık klasöründe adı uymayan dosyayı silmez", r["ok"] is False and os.path.exists(yanlis_ad), r)
dogru = os.path.join(anlik_klasor, "0123456789abcdef0123456789abcdef.pdf")
shutil.copy(yol, dogru)
r = yapisal.y_anlik_sil({"yol": dogru})
sonuc("anlik_sil anlık kopyayı siler", r["ok"] is True and not os.path.exists(dogru), r)
shutil.rmtree(anlik_klasor, ignore_errors=True)

# ---------------------------------------------------------------- 4. Kötü niyetli PDF: piksel sınırı
print("— Piksel sınırı")
import base64  # noqa: E402
import json  # noqa: E402
import subprocess  # noqa: E402
import time  # noqa: E402

sonuc("olcek_sinirla küçük alanı değiştirmez", pdefe_core.olcek_sinirla(595, 842, 2.0) == 2.0)
o = pdefe_core.olcek_sinirla(14400, 14400, 8.0)
sonuc("olcek_sinirla dev alanı sınıra indirir", abs((14400 * o) ** 2 - pdefe_core.EN_FAZLA_PIKSEL) < 1e4, o)
dev = os.path.join(CIKTI, "dev-sayfa.pdf")
d = pymupdf.open()
pg = d.new_page(width=14400, height=14400)
pg.insert_text((100, 100), "Dev sayfa", fontsize=40)
pg.add_rect_annot(pymupdf.Rect(0, 0, 14400, 14400)).update()
w = pymupdf.Widget()
w.field_type, w.field_name, w.rect, w.field_value = pymupdf.PDF_WIDGET_TYPE_TEXT, "alan", pymupdf.Rect(50, 50, 400, 90), "x"
pg.add_widget(w)
uzun = d.new_page(width=1, height=14400)
d.save(dev)
d.close()
pdefe_core.onbellek.hepsini_birak()
t0 = time.time()
r = pdefe_core.y_not_gorunum({"yol": dev, "sayfa": 1, "xref": [a.xref for a in pymupdf.open(dev)[0].annots()][0], "olcek": 8})
sonuc("not görünümü: dev not kutusu sınırı aşmaz", r["genislik"] * r["yukseklik"] <= pdefe_core.EN_FAZLA_PIKSEL * 1.01, (r["genislik"], r["yukseklik"]))
r = pdefe_core.y_sayfa_goruntu({"yol": dev, "sayfa": 1, "dpi": 600, "bicim": "jpeg", "kalite": 30})
sonuc("yazdırma görüntüsü: dev sayfa sınırı aşmaz", r["genislik"] * r["yukseklik"] <= pdefe_core.EN_FAZLA_PIKSEL * 1.01, (r["genislik"], r["yukseklik"]))
r = pdefe_core.y_kucuk_resim({"yol": dev, "sayfa": 2, "genislik": 160})
sonuc("küçük resim: 1 pt genişliğindeki uzun sayfa sınırı aşmaz", r["genislik"] * r["yukseklik"] <= pdefe_core.EN_FAZLA_PIKSEL * 1.01, (r["genislik"], r["yukseklik"]))
r = notlar.y_form_gorunum({"yol": dev, "sayfa": 1, "olcek": 6})
sonuc("form görünümü: dev sayfa sınırı aşmaz", r.get("png") and r["genislik"] * r["yukseklik"] <= pdefe_core.EN_FAZLA_PIKSEL * 1.01, (r.get("genislik"), r.get("yukseklik")))
sonuc("dev sayfa çizimleri makul sürede biter", time.time() - t0 < 60, round(time.time() - t0, 1))
pdefe_core.onbellek.hepsini_birak()
# /UserUnit: sayfa ölçüsü katlanır (MuPDF rect'e yansıtır); yazdırmada dpi 1'e inse bile sınır aşılmamalı
uu = os.path.join(CIKTI, "userunit.pdf")
d = pymupdf.open()
pg = d.new_page(width=14400, height=14400)
d.xref_set_key(pg.xref, "UserUnit", "200")
d.save(uu)
d.close()
r = pdefe_core.y_sayfa_goruntu({"yol": uu, "sayfa": 1, "dpi": 200, "bicim": "jpeg", "kalite": 30})
sonuc("yazdırma görüntüsü: /UserUnit'li dev sayfa sınırı aşmaz", r["genislik"] * r["yukseklik"] <= pdefe_core.EN_FAZLA_PIKSEL * 1.01, (r["genislik"], r["yukseklik"]))
pdefe_core.onbellek.hepsini_birak()

# ---------------------------------------------------------------- 5. /PDEfeFonts kaydına körü körüne güvenilmez
print("— Yazı tipi kaydı")
_, altkume, _, _ = notlar._font_yukle("Segoe UI", False, False)
d = pymupdf.open()
pg = d.new_page()
ilk = notlar._font_xref_al(d, pg, "Segoe UI", False)
sonuc("PDEfe'nin gömdüğü font yeniden kullanılır", notlar._font_xref_al(d, pg, "Segoe UI", False) == ilk)
# Başka bir fontu (Arial alt kümesi) kayda koy: PDEfe onu kullanmamalı, kendi fontunu yeniden gömmeli
_, baska_font, _, _ = notlar._font_yukle("Arial", False, False)
sahte = pg.insert_font(fontname="Sahte", fontbuffer=baska_font)
d.xref_set_key(d.pdf_catalog(), "PDEfeFonts/SegoeUIR", "%d 0 R" % sahte)
yeni = notlar._font_xref_al(d, pg, "Segoe UI", False)
sonuc("kayıttaki yabancı font kullanılmaz, PDEfe fontu yeniden gömülür", yeni not in (sahte, 0), (sahte, yeni))
sonuc("yeniden gömülen font kayda yazılır", d.xref_get_key(d.pdf_catalog(), "PDEfeFonts/SegoeUIR")[1] == "%d 0 R" % yeni)
d.close()
# Kurcalanmış belge (gerçek saldırı biçimi: kaydedilip yeniden açılan belge): font programı PDEfe'ninkiyle aynı, ama CIDToGIDMap ile harfler
# yer değiştirmiş; sayfa kaynaklarında da aynı ad (PDEfeSegoeUIR) bu fonta gidiyor
kurcali = os.path.join(CIKTI, "font-kurcali.pdf")
d = pymupdf.open()
pg = d.new_page()
x = notlar._font_xref_al(d, pg, "Segoe UI", False)
alt = int(d.xref_get_key(x, "DescendantFonts")[1].strip("[] ").split()[0])
harita = d.get_new_xref()
d.update_object(harita, "<<>>")
d.update_stream(harita, bytes(range(256)) * 4)
d.xref_set_key(alt, "CIDToGIDMap", "%d 0 R" % harita)
d.save(kurcali)
d.close()
d = pymupdf.open(kurcali)
yeni = notlar._font_xref_al(d, d[0], "Segoe UI", False)
sonuc("CIDToGIDMap eklenmiş font kullanılmaz (aynı adlı sayfa kaynağına rağmen)", yeni != x and notlar._pdefe_fontu_mu(d, yeni, altkume), (x, yeni))
d.close()
# PDEfe'nin kaydettiği belge yeniden açılınca gömülü font yeniden kullanılır (her oturumda yeniden gömülmez: alt küme kararlı)
temiz_font = os.path.join(CIKTI, "font-temiz.pdf")
d = pymupdf.open()
pg = d.new_page()
x = notlar._font_xref_al(d, pg, "Segoe UI", False)
d.save(temiz_font)
d.close()
d = pymupdf.open(temiz_font)
sonuc("kaydedilip yeniden açılan belgede font yeniden kullanılır", notlar._font_xref_al(d, d[0], "Segoe UI", False) == x)
d.close()
# Sunulan bütün yazı tipleri ilk gömmede denetimden geçer (yazı notu kaydında gerileme olmasın)
gecmeyen = []
for (aile, kalin, italik) in sorted(notlar.FONT_DOSYALARI):
    d = pymupdf.open()
    pg = d.new_page()
    _, ak, _, _ = notlar._font_yukle(aile, kalin, italik)
    x = notlar._font_xref_al(d, pg, aile, kalin, italik)
    if not notlar._pdefe_fontu_mu(d, x, ak) or notlar._font_xref_al(d, pg, aile, kalin, italik) != x:
        gecmeyen.append((aile, kalin, italik))
    d.close()
sonuc("bütün yazı tipleri (%d) ilk gömmede denetimden geçer ve yeniden kullanılır" % len(notlar.FONT_DOSYALARI), not gecmeyen, gecmeyen)

# ---------------------------------------------------------------- 6. MuPDF iletileri JSON kanalına karışmaz
print("— Çekirdeğin konuşma kanalı")
bozuk = os.path.join(CIKTI, "bozuk-akis.pdf")   # sayfa içeriği bozuk sıkıştırılmış akış: MuPDF "zlib error" iletisi verir
d = pymupdf.open()
d.new_page().insert_text((72, 72), "Deneme")
d.save(bozuk)
d.close()
d = pymupdf.open(bozuk)
icerik = d[0].get_contents()[0]
d.update_stream(icerik, b"bu flate verisi degil", compress=False)
d.xref_set_key(icerik, "Filter", "/FlateDecode")
d.save(bozuk + ".tmp")
d.close()
os.replace(bozuk + ".tmp", bozuk)
istekler = "".join(json.dumps({"id": i, "method": m, "params": {"yol": bozuk, "sayfa": 1, "genislik": 100}}) + "\n" for i, m in ((1, "belge_bilgi"), (2, "kucuk_resim"), (3, "sayfa_metni")))
p = subprocess.run([sys.executable, "-X", "utf8", os.path.join(os.path.dirname(__file__), "..", "core", "pdefe_core.py")], input=istekler.encode("utf-8"),
                   capture_output=True, timeout=60, env=dict(os.environ, PYTHONIOENCODING="utf-8"))
satirlar = [s for s in p.stdout.decode("utf-8", "replace").splitlines() if s.strip()]
json_olmayan = [s for s in satirlar if not s.startswith("{")]
sonuc("stdout'ta yalnızca JSON yanıt satırları var", not json_olmayan and len(satirlar) == 3, json_olmayan[:3] or satirlar)
sonuc("MuPDF iletileri stderr'e gider", len(p.stderr) > 0, p.stderr[:200])

# ---------------------------------------------------------------- 7. çekirdek yalnızca .pdf'e ya da var olan PDF'e yazar (0.2.1)
# yapisal_kaydet ve sayfalar_uygula hedef verilmeyince yol'a yazar; yol'un var olması gerekmiyordu: .cmd dosyası PDF baytlarıyla
# oluşturulabiliyor, var olan başka bir dosya PDF'le eziliyordu. Ana süreç (guvenlik.js) de hedefsiz yazan yöntemlerde yol'u denetler.
print("— Yalnızca .pdf'e yazma")
import pathlib  # noqa: E402
from islemler import araclar  # noqa: E402
kaynak_pdf = bos_belge("yazma-kaynak.pdf")
TARIF_Y = [{"kaynak": {"yol": kaynak_pdf, "sayfa": 1}}]
TARIF_A = [{"kaynak": kaynak_pdf, "sayfa": 1}]
metin_dosyasi = os.path.join(CIKTI, "var-olan.txt")
for ad, cagri in (("yapisal_kaydet", lambda y: yapisal.y_yapisal_kaydet({"yol": y, "tarif": TARIF_Y, "anlikKlasor": os.path.join(CIKTI, "anlik")})),
                  ("sayfalar_uygula", lambda y: araclar.y_sayfalar_uygula({"yol": y, "tarif": TARIF_A}))):
    cmd = os.path.join(CIKTI, "deneme-%s.cmd" % ad)
    if os.path.exists(cmd):
        os.remove(cmd)
    try:
        cagri(cmd)
        sonuc("%s: hedefsiz .cmd yol'u reddedilir" % ad, False, "yazıldı")
    except ValueError as e:
        sonuc("%s: hedefsiz .cmd yol'u reddedilir" % ad, ".pdf" in str(e) and not os.path.exists(cmd), e)
    with open(metin_dosyasi, "w", encoding="utf-8") as f:
        f.write("kullanıcının metni")
    try:
        cagri(metin_dosyasi)
        sonuc("%s: var olan PDF olmayan dosya ezilmez" % ad, False, "yazıldı")
    except Exception:  # noqa: BLE001
        with open(metin_dosyasi, encoding="utf-8") as f:
            sonuc("%s: var olan PDF olmayan dosya ezilmez" % ad, f.read() == "kullanıcının metni")
    uzantisiz = os.path.join(CIKTI, "uzantisiz-%s" % ad)
    shutil.copy(kaynak_pdf, uzantisiz)
    try:
        cagri(uzantisiz)
        d = pymupdf.open(uzantisiz, filetype="pdf")
        sonuc("%s: uzantısı .pdf olmayan var olan PDF'e yazılır" % ad, d.page_count == 1)
        d.close()
    except Exception as e:  # noqa: BLE001
        sonuc("%s: uzantısı .pdf olmayan var olan PDF'e yazılır" % ad, False, e)
    pdefe_core.onbellek.hepsini_birak()
# Ana süreç denetimi (src/main/guvenlik.js cekirdekParametreleri), Node ile
KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
betik = """
import { cekirdekParametreleri } from %s;
const [cmd, txt, pdf] = %s;
const sonuc = {};
for (const [ad, yontem, p] of [
  ['yapisal_kaydet hedefsiz .cmd', 'yapisal_kaydet', { yol: cmd, tarif: [] }],
  ['sayfalar_uygula hedefsiz .cmd', 'sayfalar_uygula', { yol: cmd, tarif: [] }],
  ['notlar_kaydet hedefsiz .txt', 'notlar_kaydet', { yol: txt, islemler: [] }],
  ['kucult hedefsiz .txt', 'kucult', { yol: txt }],
  ['ayir uzerine .txt', 'ayir', { yol: txt, sayfalar: [1], uzerine: true }],
  ['sayfalar_uygula hedef .cmd', 'sayfalar_uygula', { yol: pdf, hedef: cmd, tarif: [] }],
  ['sayfalar_uygula hedefsiz .pdf', 'sayfalar_uygula', { yol: pdf, tarif: [] }],
  ['ayir klasöre (yol okunur)', 'ayir', { yol: txt, parcalar: [] }],
]) {
  try { await cekirdekParametreleri(yontem, p, 'anlik'); sonuc[ad] = 'geçti'; } catch (e) { sonuc[ad] = 'reddedildi'; }
}
console.log(JSON.stringify(sonuc));
""" % (json.dumps(pathlib.Path(os.path.abspath(os.path.join(KOK, "src", "main", "guvenlik.js"))).as_uri()),
       json.dumps([os.path.join(CIKTI, "yok.cmd"), metin_dosyasi, kaynak_pdf]))
try:
    p = subprocess.run(["node", "--input-type=module", "-e", betik], capture_output=True, timeout=60)
    ana = json.loads(p.stdout.decode("utf-8").strip().splitlines()[-1])
    beklenen = {"yapisal_kaydet hedefsiz .cmd": "reddedildi", "sayfalar_uygula hedefsiz .cmd": "reddedildi", "notlar_kaydet hedefsiz .txt": "reddedildi",
                "kucult hedefsiz .txt": "reddedildi", "ayir uzerine .txt": "reddedildi", "sayfalar_uygula hedef .cmd": "reddedildi",
                "sayfalar_uygula hedefsiz .pdf": "geçti", "ayir klasöre (yol okunur)": "geçti"}
    sonuc("ana süreç hedefsiz yazan yöntemlerde yol'u denetler", ana == beklenen, ana)
except Exception as e:  # noqa: BLE001
    sonuc("ana süreç hedefsiz yazan yöntemlerde yol'u denetler", False, repr(e))

print("\nSonuç: %d/%d geçti%s." % (toplam - hata, toplam, ", %d HATA" % hata if hata else ""))
sys.exit(1 if hata else 0)
