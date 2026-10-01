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

print("\nSonuç: %d/%d geçti%s." % (toplam - hata, toplam, ", %d HATA" % hata if hata else ""))
sys.exit(1 if hata else 0)
