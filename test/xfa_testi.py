# -*- coding: utf-8 -*-
"""Çekirdeğin dinamik XFA formları (0.3.1, core/islemler/xfa.py): şablon bilgisi (düğmelerin tanınan eylemleri, tanınmayan betik, sayfa
numarası alanları, basılmayan öğeler, tekrarlanabilir alt formlar), SOM çözümü, örnek ekleme / silme (yeni örnek var olanın yapısıyla,
değerleri boş; occur sınırları), görünürlük (şablonda presence, öbür baytlar aynı), artımlı yazım (girdi + ek), kaydetme (baştan yazım,
kullanım hakları imzasının kaldırılması, DocMDP'nin kalması, MuPDF onarmadan açar), parametre denetimleri ve DTD / varlık reddi, atomik kayıt ve hata benzetimi
(disk dolu, kilit, yerine koyma, doğrulama, salt okunur, klasör yok, uzun yol; özgün dosya bayt bayt aynı kalır). Örnek test/xfa_pdf_uret.py ile
test/cikti/xfa_testi altında üretilir (gerçek belge yok).
Kullanım: .venv\\Scripts\\python.exe test\\xfa_testi.py"""
import base64
import html
import json
import os
import re
import shutil
import subprocess
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
import pdefe_core  # noqa: E402
from islemler import xfa  # noqa: E402

CIKTI = os.path.join(KOK, "test", "cikti", "xfa_testi")
shutil.rmtree(CIKTI, ignore_errors=True)
os.makedirs(CIKTI, exist_ok=True)
hata = toplam = 0


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if ok else " — " + repr(ayrinti)[:700]))


def hata_verir(f, turler=(ValueError, KeyError, TypeError)):
    try:
        f()
    except turler:
        return True
    return False


ozet = json.loads(subprocess.check_output([sys.executable, os.path.join(KOK, "test", "xfa_pdf_uret.py"), CIKTI]).decode("utf-8").strip().splitlines()[-1])
XFA = ozet["xfa"]
GIRDI = open(XFA, "rb").read()
B64 = base64.b64encode(GIRDI).decode("ascii")


def paket(veri, ad):
    d = pymupdf.open(stream=veri, filetype="pdf")
    try:
        return d.xref_stream(xfa._paketler(d)[ad]).decode("utf-8")
    finally:
        d.close()


# ------------------------------------------------------------ 1) şablon bilgisi
b = xfa.y_xfa_bilgi({"yol": XFA})
sonuc("bilgi: XFA paketli, saf, kullanım hakları imzası var", b["xfa"] and b["saf"] and b["kullanimHakki"], {k: b[k] for k in ("xfa", "saf", "kullanimHakki")})
dug = {"/".join(d["yol"]): d for d in b["dugmeler"]}
satir = next(k for k, v in b["ornekler"].items() if v["yol"] == ["form1", "Satir"])
sonuc("bilgi: Satir tekrarlanabilir (min 1, max 3), veri yolu var", b["ornekler"][satir]["min"] == 1 and b["ornekler"][satir]["max"] == 3 and b["ornekler"][satir]["veri"], b["ornekler"])
sonuc("bilgi: Satır Ekle → ekle (Satir)", dug["form1/Satir/SatirEkle"]["eylemler"] == [{"tur": "ekle", "dugum": int(satir)}] and not dug["form1/Satir/SatirEkle"]["desteklenmiyor"], dug.get("form1/Satir/SatirEkle"))
sonuc("bilgi: Son Satırı Sil → sil (count - 1)", dug["form1/Satir/SatirSil"]["eylemler"] == [{"tur": "sil", "dugum": int(satir)}], dug.get("form1/Satir/SatirSil"))
sonuc("bilgi: Formu Kaydet → farkliKaydet", dug["form1/Son/Kaydet"]["eylemler"] == [{"tur": "farkliKaydet"}], dug.get("form1/Son/Kaydet"))
sonuc("bilgi: tanınmayan betik (messageBox) desteklenmiyor", dug["form1/Son/Mesaj"]["desteklenmiyor"] and not dug["form1/Son/Mesaj"]["eylemler"], dug.get("form1/Son/Mesaj"))
gizle = dug["form1/Son/Gizle"]["eylemler"]
sonuc("bilgi: Mesajı Gizle → görünürlük (kardeş Mesaj, hidden)", len(gizle) == 1 and gizle[0]["tur"] == "gorunurluk" and gizle[0]["deger"] == "hidden", gizle)
no = b["sayfaNumaralari"]
sonuc("bilgi: sayfa numarası çizimi (sayfa alanında, gömülü iki alan)", len(no) == 1 and no[0]["tur"] == "cizim" and no[0]["yol"] == ["Sayfa1", "Numara"] and no[0]["sayfaAlani"]
      and no[0]["paragraflar"] == [{"sira": 0, "metin": "Sayfa {sayfa} / {toplam}"}], no)
sonuc("bilgi: düğmeler basılmaz (relevant -print)", sorted("/".join(e["yol"]) for e in b["ekranda"]) == sorted(["form1/Satir/SatirEkle", "form1/Satir/SatirSil", "form1/Son/Kaydet", "form1/Son/Mesaj", "form1/Son/Gizle"]), b["ekranda"])

# ------------------------------------------------------------ 2) SOM ve betik kalıpları (birim)
SABLON = """<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="kok"><subform name="Dis"><subform><field name="A"/>
<subform name="Ic"><occur min="0" max="-1"/><field name="B"/></subform></subform><field name="Dugme"><ui><button/></ui>
<event activity="click"><script>xfa.host.setFocus(this); _Ic.addInstance(true); Ic.instanceManager.removeInstance(0); this.parent.A.presence = 'invisible'</script></event></field>
</subform><proto><subform name="Ic"/></proto></subform></template>"""
kok, liste = xfa._agac(SABLON.encode("utf-8"))
dugme = next(d for d in liste if d.oz.get("name") == "Dugme")
ic = next(d for d in liste if d.oz.get("name") == "Ic" and d.cocuk("occur") is not None)
a = next(d for d in liste if d.oz.get("name") == "A")
sonuc("SOM: mutlak (xfa.form.kok.Dis._Ic) örnek yöneticisi", xfa._som_coz("xfa.form.kok.Dis._Ic", dugme, kok) == (ic, True))
sonuc("SOM: kapsam araması (_Ic, adsız alt formun içinden)", xfa._som_coz("_Ic", dugme, kok) == (ic, True))
sonuc("SOM: Ic.instanceManager", xfa._som_coz("Ic.instanceManager", dugme, kok) == (ic, True))
sonuc("SOM: this.parent.A", xfa._som_coz("this.parent.A", dugme, kok) == (a, False))
sonuc("SOM: olmayan ad", xfa._som_coz("kok.Yok", dugme, kok) == (None, False))
e, des = xfa._dugme_eylemleri(dugme, kok)
sonuc("betik: setFocus yok sayılır, addInstance(true), removeInstance(0), presence", not des and e == [{"tur": "ekle", "dugum": ic.no}, {"tur": "sil", "dugum": ic.no, "sira": 0},
      {"tur": "gorunurluk", "dugum": a.no, "deger": "invisible"}], e)
sonuc("veri yolu: adsız alt form saydam", xfa._veri_yolu(ic) == ["kok", "Dis", "Ic"], xfa._veri_yolu(ic))
sonuc("DTD'li şablon reddedilir", hata_verir(lambda: xfa._agac(b'<!DOCTYPE x [<!ENTITY a "b">]><template/>')))
sonuc("varlık tanımı reddedilir", hata_verir(lambda: xfa._agac(b'<template><!ENTITY a "b"></template>')))

# ------------------------------------------------------------ 3) örnek ekleme / silme
r = xfa.y_xfa_degistir({"veri": B64, "islemler": [{"tur": "ekle", "dugum": int(satir)}]})
sonuc("ekle: artımlı ek döner, örnek sayısı 2", "ek" in r and r["ek"] and r["ornekler"] == {satir: 2}, {k: (len(v) if isinstance(v, str) else v) for k, v in r.items()})
iki = GIRDI + base64.b64decode(r["ek"])
d = pymupdf.open(stream=iki, filetype="pdf")
sonuc("ekle: MuPDF onarmadan açar, sayfa 1 (belgenin kendi sayfası)", not d.is_repaired and d.page_count == 1)
d.close()
veri2 = paket(iki, "datasets")
gruplar = re.findall(r"<Satir[ >/].*?(?:</Satir>|/>)", veri2, re.S)
sonuc("ekle: iki Satir grubu, yenisi var olanın yapısında (Aciklama düğümü), boş", len(gruplar) == 2 and "<Aciklama" in gruplar[1] and not re.search(r"<Aciklama>[^<]", gruplar[1]), gruplar)
sonuc("ekle: şablon değişmedi", paket(iki, "template") == paket(GIRDI, "template"))
# Değerli ilk grup: yeni grup değeri taşımaz
dolu = veri2.replace("<Aciklama />", "<Aciklama>Dolu değer</Aciklama>", 1).replace("<Aciklama/>", "<Aciklama>Dolu değer</Aciklama>", 1)
yol_dolu = os.path.join(CIKTI, "dolu.pdf")
dd = pymupdf.open(XFA)
dd.update_stream(xfa._paketler(dd)["datasets"], dolu.encode("utf-8"))
dd.save(yol_dolu)
dd.close()
r3 = xfa.y_xfa_degistir({"veri": base64.b64encode(open(yol_dolu, "rb").read()).decode(), "islemler": [{"tur": "ekle", "dugum": int(satir)}]})
v3 = html.unescape(paket(open(yol_dolu, "rb").read() + base64.b64decode(r3["ek"]), "datasets"))
sonuc("ekle: yeni örnek ilk örneğin değerini taşımaz", v3.count("Dolu değer") == 1 and r3["ornekler"] == {satir: 3}, v3)
r4 = xfa.y_xfa_degistir({"veri": base64.b64encode(open(yol_dolu, "rb").read() + base64.b64decode(r3["ek"])).decode(), "islemler": [{"tur": "ekle", "dugum": int(satir)}]})
sonuc("ekle: en çok 3 (sınır, değişiklik yok)", r4 == {"sinir": {"tur": "en_fazla", "sayi": 3, "dugum": int(satir)}}, r4)
r5 = xfa.y_xfa_degistir({"veri": base64.b64encode(iki).decode(), "islemler": [{"tur": "sil", "dugum": int(satir)}]})
sonuc("sil: son örnek silindi, sayı 1", r5["ornekler"] == {satir: 1} and len(re.findall(r"<Satir[ >/]", paket(iki + base64.b64decode(r5["ek"]), "datasets"))) == 1, r5.get("ornekler"))
r6 = xfa.y_xfa_degistir({"veri": B64, "islemler": [{"tur": "sil", "dugum": int(satir)}]})
sonuc("sil: en az 1 (sınır)", r6 == {"sinir": {"tur": "en_az", "sayi": 1, "dugum": int(satir)}}, r6)

# ------------------------------------------------------------ 4) görünürlük
mesaj = next(e for e in dug["form1/Son/Gizle"]["eylemler"])
r7 = xfa.y_xfa_degistir({"veri": B64, "islemler": [dict(mesaj)]})
s7 = paket(GIRDI + base64.b64decode(r7["ek"]), "template")
sonuc("görünürlük: şablonda Mesaj presence=\"hidden\"", re.search(r'<field name="Mesaj"[^>]*presence="hidden"', s7) is not None)
sonuc("görünürlük: şablonun öbür baytları aynı", re.sub(r'(<field name="Mesaj"[^>]*?) presence="hidden"', r"\1", s7, count=1) == paket(GIRDI, "template"))
r8 = xfa.y_xfa_degistir({"veri": base64.b64encode(GIRDI + base64.b64decode(r7["ek"])).decode(), "islemler": [dict(mesaj, deger="visible")]})
s8 = paket(GIRDI + base64.b64decode(r7["ek"]) + base64.b64decode(r8["ek"]), "template")
sonuc("görünürlük: visible'a dönüş (öznitelik değişir, yenisi eklenmez)", re.search(r'<field name="Mesaj"[^>]*presence="visible"', s8) is not None and s8.count("presence=") == s7.count("presence="))
r9 = xfa.y_xfa_degistir({"veri": B64, "islemler": [dict(mesaj, deger="visible")]})
sonuc("görünürlük: zaten öyleyse değişiklik yok (boş ek)", r9 == {"ek": "", "ornekler": {}}, r9)

# ------------------------------------------------------------ 5) kaydetme
hedef = os.path.join(CIKTI, "kayit.pdf")
shutil.copyfile(XFA, hedef)
k = xfa.y_xfa_kaydet({"veri": base64.b64encode(iki).decode(), "hedef": hedef, "yol": hedef})
d = pymupdf.open(hedef)
kat = d.pdf_catalog()
sonuc("kaydet: kullanım hakları imzası kaldırıldı, /Perms yok", k["kullanimHakkiKaldirildi"] and d.xref_get_key(kat, "Perms")[0] == "null")
sonuc("kaydet: onarmadan açılır, saf XFA, iki Satir", not d.is_repaired and xfa._saf_mi(d, xfa._paketler(d)) and len(re.findall(r"<Satir[ >/]", d.xref_stream(xfa._paketler(d)["datasets"]).decode())) == 2)
sonuc("kaydet: boyut doğru", k["boyut"] == os.path.getsize(hedef))
d.close()
# DocMDP'li /Perms: yalnızca UR3 kalkar
dm = pymupdf.open(XFA)
dm.xref_set_key(dm.pdf_catalog(), "Perms", "<</UR3<</Type/Sig>>/DocMDP<</Type/Sig/Filter/PDEfe.Deneme>>>>")
mdp = dm.tobytes()
dm.close()
hedef2 = os.path.join(CIKTI, "docmdp.pdf")
xfa.y_xfa_kaydet({"veri": base64.b64encode(mdp).decode(), "hedef": hedef2})
d = pymupdf.open(hedef2)
sonuc("kaydet: DocMDP kalır, yalnızca UR3 kalkar", d.xref_get_key(d.pdf_catalog(), "Perms/DocMDP")[0] != "null" and d.xref_get_key(d.pdf_catalog(), "Perms/UR3")[0] == "null")
d.close()
# 0.3.1 inceleme: Görünmez e-imzalı saf XFA formu. Kullanım hakları imzası e-imza sayılmaz
IMZALI = ozet["xfaImzali"]
IMZALI_B = open(IMZALI, "rb").read()
sonuc("bilgi: kullanım hakları imzası e-imza sayılmaz, görünmez imza alanı sayılır",
      not xfa.y_xfa_bilgi({"yol": XFA})["eImzali"] and xfa.y_xfa_bilgi({"yol": IMZALI})["eImzali"])
br = next(v for v in ([int(x) for x in m] for m in re.findall(rb"/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]", IMZALI_B)) if v[1])   # UR3'ün [0 0 0 0]'ı değil


def imza_tutuyor(veri):
    """Sahte imzanın /Contents'i imzalanan baytların SHA-256'sı mı (form_testi'ndeki gibi)."""
    import hashlib
    a, b, c = br[1], br[2], br[3]
    return len(veri) >= b + c and veri[a + 1:a + 65] == hashlib.sha256(veri[0:a] + veri[b:b + c]).hexdigest().encode()


pdefe_core.onbellek.hepsini_birak()
re_ek = xfa.y_xfa_degistir({"veri": base64.b64encode(IMZALI_B).decode(), "islemler": [{"tur": "ekle", "dugum": int(satir)}]})
artimli = IMZALI_B + base64.b64decode(re_ek["ek"])                 # PDF.js'in kaydı gibi: özgün baytlar + ek
sonuc("imzalı form: ekle artımlı (imzalanan bölüm aynen)", "ek" in re_ek and imza_tutuyor(artimli))
hedef3 = os.path.join(CIKTI, "imzali-koru.pdf")
shutil.copyfile(IMZALI, hedef3)
k3 = xfa.y_xfa_kaydet({"veri": base64.b64encode(artimli).decode(), "hedef": hedef3, "yol": hedef3, "imzayiKoru": True})
yazilan = open(hedef3, "rb").read()
d = pymupdf.open(hedef3)
sonuc("kaydet (imzayı koru): baytlar olduğu gibi, imza tutuyor, kullanım hakları imzası yerinde, iki Satir",
      k3.get("imzaKorundu") is True and not k3["kullanimHakkiKaldirildi"] and yazilan == artimli and imza_tutuyor(yazilan)
      and d.xref_get_key(d.pdf_catalog(), "Perms/UR3")[0] != "null" and not d.is_repaired
      and len(re.findall(r"<Satir[ >/]", d.xref_stream(xfa._paketler(d)["datasets"]).decode())) == 2, k3)
d.close()
hedef4 = os.path.join(CIKTI, "imzali-temiz.pdf")
shutil.copyfile(IMZALI, hedef4)
k4 = xfa.y_xfa_kaydet({"veri": base64.b64encode(artimli).decode(), "hedef": hedef4, "yol": hedef4})
sonuc("kaydet (tamamen sil): baştan yazılır, kullanım hakları imzası kalkar (imza artık tutmaz)",
      "imzaKorundu" not in k4 and k4["kullanimHakkiKaldirildi"] and not imza_tutuyor(open(hedef4, "rb").read()), k4)
# Çekirdek yapı değişikliğini artımlı yazamamış (imzalanan bölüm değişmiş): imza korunamaz, baştan yazılır
bas = pymupdf.open(stream=artimli, filetype="pdf")
yeniden = bas.tobytes(garbage=1, deflate=True)
bas.close()
hedef5 = os.path.join(CIKTI, "imzali-bozuk.pdf")
shutil.copyfile(IMZALI, hedef5)
k5 = xfa.y_xfa_kaydet({"veri": base64.b64encode(yeniden).decode(), "hedef": hedef5, "yol": hedef5, "imzayiKoru": True})
sonuc("kaydet (imzayı koru, imzalanan bölüm değişmiş): imzaKorundu false, baştan yazıldı", k5.get("imzaKorundu") is False and k5["kullanimHakkiKaldirildi"], k5)
k6 = xfa.y_xfa_kaydet({"veri": B64, "hedef": os.path.join(CIKTI, "imzasiz-koru.pdf"), "imzayiKoru": True})
sonuc("kaydet (imzayı koru, imzasız form): imzaKorundu false, olağan kayıt", k6.get("imzaKorundu") is False and k6["kullanimHakkiKaldirildi"], k6)
pdefe_core.onbellek.hepsini_birak()

# 0.3.1 inceleme: Yeni örnek ilk örneğin zengin metninden ve öznitelik değerlerinden hiçbir şey taşımaz
ilk = xfa.ET.fromstring('<Satir xmlns:xfa="%s"><Aciklama xfa:contentType="text/html"><body xmlns="http://www.w3.org/1999/xhtml"><p>Merhaba '
                        '<span>dünya</span> sonu</p></body></Aciklama><Resim href="a.png" xfa:contentType="image/png">QUJD</Resim><Ic xfa:dataNode="dataGroup">'
                        '<Not>x</Not> kuyruk </Ic></Satir>' % xfa.VERI_NS)
bos = xfa.ET.tostring(xfa._bos_grup(ilk, "Satir"), encoding="unicode")
sonuc("yeni örnek: zengin metin, öznitelik değeri ve iç öğe ardı metin geçmez, yapı (öğeler, contentType, dataNode) kalır",
      not any(s in bos for s in ("Merhaba", "dünya", "sonu", "a.png", "QUJD", "kuyruk", ">x<"))
      and all(s in bos for s in ("<Aciklama", "<Resim", 'href=""', "contentType=\"image/png\"", "<Not", 'dataNode="dataGroup"')), bos)

duz = pymupdf.open()
duz.new_page()
duz_b = duz.tobytes()
duz.close()
sonuc("kaydet: XFA'sız belge reddedilir, hedef yazılmaz", hata_verir(lambda: xfa.y_xfa_kaydet({"veri": base64.b64encode(duz_b).decode(), "hedef": os.path.join(CIKTI, "yok.pdf")}))
      and not os.path.exists(os.path.join(CIKTI, "yok.pdf")))

# ------------------------------------------------------------ 6) parametre denetimleri
sonuc("islemler: boş liste reddedilir", hata_verir(lambda: xfa.islemleri_dogrula([])))
sonuc("islemler: 17 öğe reddedilir", hata_verir(lambda: xfa.islemleri_dogrula([{"tur": "ekle", "dugum": 1}] * 17)))
sonuc("islemler: bilinmeyen tür reddedilir", hata_verir(lambda: xfa.islemleri_dogrula([{"tur": "calistir", "dugum": 1}])))
sonuc("islemler: düğüm tamsayı ve pozitif olmalı", hata_verir(lambda: xfa.islemleri_dogrula([{"tur": "ekle", "dugum": -1}])) and hata_verir(lambda: xfa.islemleri_dogrula([{"tur": "ekle", "dugum": True}]))
      and hata_verir(lambda: xfa.islemleri_dogrula([{"tur": "ekle", "dugum": "3"}])))
sonuc("islemler: görünürlük değeri denetlenir", hata_verir(lambda: xfa.islemleri_dogrula([{"tur": "gorunurluk", "dugum": 1, "deger": "x"}])))
sonuc("veri: base64 olmayan reddedilir", hata_verir(lambda: xfa.y_xfa_degistir({"veri": "%%%", "islemler": [{"tur": "ekle", "dugum": int(satir)}]})))
sonuc("veri: PDF olmayan reddedilir", hata_verir(lambda: xfa.y_xfa_degistir({"veri": base64.b64encode(b"merhaba").decode(), "islemler": [{"tur": "ekle", "dugum": int(satir)}]})))
sonuc("veri: eksik reddedilir", hata_verir(lambda: xfa.y_xfa_kaydet({"hedef": hedef})))
sonuc("düğüm: şablonda olmayan reddedilir", hata_verir(lambda: xfa.y_xfa_degistir({"veri": B64, "islemler": [{"tur": "ekle", "dugum": 999999}]})))
sonuc("düğüm: alt form olmayan ekle reddedilir", hata_verir(lambda: xfa.y_xfa_degistir({"veri": B64, "islemler": [{"tur": "ekle", "dugum": mesaj["dugum"]}]})))
# Araçların dosya ekleme yolu (0.3.1 kabul sınaması): XFA formu "lütfen bekleyin" sayfası olarak işlenmez, açıkça söylenir
bilgi = pdefe_core.YONTEMLER["donusum_bilgi"]({"yol": XFA, "genislik": 64})
sonuc("araç: Format Değiştir XFA formunu almaz (bütün hedefler kapalı, ileti)", bilgi.get("xfa") is True and bilgi["uyari"] == xfa.ARAC_ILETISI and not any(h["var"] for h in bilgi["hedefler"]), bilgi)
try:
    pdefe_core.YONTEMLER["gorsel_bilgi"]({"yol": XFA, "genislik": 64})
    sonuc("araç: Birleştir XFA formunu almaz", False)
except ValueError as e:
    sonuc("araç: Birleştir XFA formunu almaz", str(e) == xfa.ARAC_ILETISI, str(e))
sb = pdefe_core.YONTEMLER["sayfa_boyutlari"]({"yol": XFA})
sonuc("araç: Sayfaları düzenle'de eklenecek belgede XFA işareti", sb.get("xfa") == xfa.ARAC_ILETISI and sb["sayfa"] == 1, sb)
OLAGAN = os.path.join(CIKTI, "olagan.pdf")
_d = pymupdf.open()
_d.new_page()
_d.save(OLAGAN)
_d.close()
sonuc("araç: Olağan PDF'te XFA işareti yok", "xfa" not in pdefe_core.YONTEMLER["donusum_bilgi"]({"yol": OLAGAN, "genislik": 64}) and "xfa" not in pdefe_core.YONTEMLER["sayfa_boyutlari"]({"yol": OLAGAN})
      and pdefe_core.YONTEMLER["gorsel_bilgi"]({"yol": OLAGAN, "genislik": 64})["sayfa"] == 1)
sonuc("araç: Bozuk paketli belge XFA sayılmaz", xfa.saf_xfa_mi(pymupdf.open(OLAGAN)) is False)

# ------------------------------------------------------------ alan biçimleri (kullanıcı: "ad soyad kısmı ... ortalı duruyor bizimkinde sola yatık")
bi = xfa.y_xfa_bilgi({"yol": ozet["xfaBicim"]})
ab = {}
for a in bi["alanlar"]:
    ab.setdefault(a["yol"][-1], []).append(a)
tek = lambda ad: ab[ad][0]
met = lambda ad: tek(ad).get("metin", {})
sonuc("biçim: Ortalı, sağa hizalı, hizasız", met("Ortali").get("hiza") == "center" and met("Sagda").get("hiza") == "right" and "hiza" not in met("Solda"), [met(a) for a in ("Ortali", "Sagda", "Solda")])
sonuc("biçim: Dikey hiza: Şablondaki, yoksa üst", met("Ortali")["dikey"] == "middle" and met("Ustte")["dikey"] == "top" and met("Altta")["dikey"] == "bottom", [met(a)["dikey"] for a in ("Ortali", "Ustte", "Altta")])
sonuc("biçim: Çok satırlı alanda hiza ve satır aralığı", met("CokOrtali").get("hiza") == "center" and met("CokIki").get("hiza") == "justify" and met("CokSatir").get("satir") == 15 and met("CokIki").get("satir") == 15, [met(a) for a in ("CokOrtali", "CokIki", "CokSatir")])
sonuc("biçim: Kaydırmasız alan", met("CokSatir").get("kaydirmasiz") is True and "kaydirmasiz" not in met("Solda"))
sonuc("biçim: Hücreli alan", met("Hucreli").get("comb") == 11 and met("HucreliHarf").get("comb") == 8 and "comb" not in met("Solda"), met("Hucreli"))
sonuc("biçim: Yazı boyu tam, size yoksa 10pt, harf aralığı", tek("Solda")["boyut"] == 10 and tek("CokDikey")["boyut"] == 10 and tek("Harfli")["boyut"] == 9 and tek("Harfli").get("harfAraligi") == 1, [tek(a).get("boyut") for a in ("Solda", "CokDikey", "Harfli")])
sonuc("biçim: Paragraf boşlukları (pt)", met("Bosluklu").get("sol") == 10 and met("Bosluklu").get("sag") == 5 and met("Bosluklu").get("ust") == 4, met("Bosluklu"))
sonuc("biçim: Renksiz dolgu işaretli, renkli ve dolgusuz değil", tek("Solda").get("dolgu") is True and "dolgu" not in tek("Renkli") and "dolgu" not in tek("Zeminsiz"), [tek(a).get("dolgu") for a in ("Solda", "Renkli", "Zeminsiz")])
sonuc("biçim: Yer ve boyut pt", abs(tek("Solda")["g"] - 80 * 72 / 25.4) < 0.01 and abs(tek("Solda")["b"] - 8 * 72 / 25.4) < 0.01, tek("Solda"))
sonuc("biçim: Aynı adlı iki alan ayrı kayıt, kendi hizası, kendi yeri", [a["metin"].get("hiza") for a in ab["Cift"]] == ["center", "right"] and ab["Cift"][0]["x"] != ab["Cift"][1]["x"], ab.get("Cift"))
sonuc("biçim: Onay kutusu kayıtlı, yazı biçimi yok", "metin" not in tek("Onay") and tek("Onay")["boyut"] == 10, tek("Onay"))
sonuc("biçim: Düğmeler alan biçimine girmez", "BicimEkle" not in ab)
sonuc("biçim: Gizli alanlar (HTML'de yok) girmez", not any(a["yol"][-1] in ("SayfaNo", "SayfaSayisi") for a in b["alanlar"]) and any(a["yol"][-1] == "AdSoyad" for a in b["alanlar"]), [a["yol"][-1] for a in b["alanlar"]])
kp, lp = xfa._agac(b'''<template><subform name="k"><proto><field id="o" w="10mm" h="5mm"><ui><textEdit/></ui><font size="8pt"/><para hAlign="right"/></field></proto>
<field name="A" use="#o"/><field name="B" usehref="#o" h="6mm"><para hAlign="center" vAlign="bogus" lineHeight="x"/></field><field name="C"><ui><textEdit><comb numberOfCells="9999"/></textEdit></ui><para hAlign="&lt;script&gt;"/></field></subform></template>''')
tp = {a["yol"][-1]: a for a in xfa._sablon_bilgisi(kp, lp)["alanlar"]}
sonuc("biçim: Prototip (use, usehref): Eksik özellik başvurulan alandan", tp["A"]["metin"].get("hiza") == "right" and tp["A"]["boyut"] == 8 and tp["B"]["metin"].get("hiza") == "center" and tp["B"]["b"] == round(6 * 72 / 25.4, 3), tp)
sonuc("biçim: Geçersiz değerler alınmaz (dikey üst, hiza ve satır yok, 200'den çok hücre yok)", tp["B"]["metin"]["dikey"] == "top" and "satir" not in tp["B"]["metin"] and "comb" not in tp["C"]["metin"] and "hiza" not in tp["C"]["metin"], tp)
sonuc("biçim: Ölçüler", xfa._olcu_pt("1mm") == round(72 / 25.4, 3) and xfa._olcu_pt("15pt") == 15 and xfa._olcu_pt("1in") == 72 and xfa._olcu_pt("1cm") == round(72 / 2.54, 3) and xfa._olcu_pt("x") is None and xfa._olcu_pt(None) is None)

sonuc("çekirdekte kayıtlı yöntemler", all(y in pdefe_core.YONTEMLER for y in ("xfa_bilgi", "xfa_degistir", "xfa_kaydet")))

# ------------------------------------------------------------ 7) kayıt: Atomik yazım, kilit, hata benzetimi (0.3.1, kullanıcı: "bu kayıt mekanizmasında hiç sıkıntı olmamalı")
from islemler import notlar  # noqa: E402

KAYIT = os.path.join(CIKTI, "kayit sınaması (1) ğüş")
os.makedirs(KAYIT, exist_ok=True)
KAYNAK = base64.b64encode(iki).decode()


def yeni_hedef(ad):
    h = os.path.join(KAYIT, ad)
    shutil.copyfile(XFA, h)
    return h


def gecici_yok(k=KAYIT):
    return [a for a in os.listdir(k) if a.endswith(".tmp") or "pdefe-tmp" in a]


def hata_ile(f):
    """f() fırlatan hata: (tür adı, ileti) ya da (None, None)."""
    try:
        f()
    except Exception as e:
        return type(e).__name__, str(e)
    return None, None


HAM = re.compile(r"\[(Errno|WinError) |code=\d+|\\\\|Traceback")


class Yama:
    """Bir modül özniteliğini (hata benzetimi) geçici değiştirir."""

    def __init__(self, nesne, ad, deger):
        self.nesne, self.ad, self.deger, self.vardi = nesne, ad, deger, hasattr(nesne, ad)

    def __enter__(self):
        self.eski = getattr(self.nesne, self.ad, None)
        setattr(self.nesne, self.ad, self.deger)

    def __exit__(self, *_):
        if self.vardi:
            setattr(self.nesne, self.ad, self.eski)
        else:
            delattr(self.nesne, self.ad)


def kaydet_hatasi(h, yamalar=(), **ek):
    """xfa_kaydet'i yamalarla çağırır: (hata iletisi, hedef aynı mı, geçici dosya yok mu)."""
    once = open(h, "rb").read()
    def calistir(kalan):
        if not kalan:
            xfa.y_xfa_kaydet(dict({"veri": KAYNAK, "hedef": h, "yol": h}, **ek))
            return
        with kalan[0]:
            calistir(kalan[1:])
    tur, ileti = hata_ile(lambda: calistir(list(yamalar)))
    return tur, ileti, open(h, "rb").read() == once, not gecici_yok(os.path.dirname(h))


def fsync_hatasi(kod):
    def f(_fd):
        raise OSError(kod, "benzetim")
    return f


# Başarılı kayıt: Doğrulama ve beklenen değerler
h = yeni_hedef("basarili.pdf")
d0 = pymupdf.open(stream=iki, filetype="pdf")
veri_ = d0.xref_stream(xfa._paketler(d0)["datasets"]).decode("utf-8")
d0.close()
k7 = xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h, "yol": h, "beklenen": []})
sonuc("kayıt: Başarılı, geçici dosya yok, eksik yok", k7["eksik"] == [] and not gecici_yok() and k7["boyut"] == os.path.getsize(h), k7)
k7b = xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h, "yol": h, "beklenen": ["Veride olmayan yazı"]})
sonuc("kayıt: Veride olmayan değer bildirilir, dosya yine yazılır", k7b["eksik"] == [0], k7b)
sonuc("kayıt: Beklenen liste değilse yok sayılır", xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h, "yol": h, "beklenen": "x"})["eksik"] == [])
ET_DENEME = ('<xfa:datasets xmlns:xfa="%s"><xfa:data><a><b>Yazı &#xC;sayfa&#x1;sonu &lt;x&gt; &#x1F600;</b><c k="öznitelik"/></a></xfa:data></xfa:datasets>' % xfa.VERI_NS).encode("utf-8")
sonuc("kayıt: Geçersiz karakter başvurulu veri okunur", xfa._veri_kok(ET_DENEME)[1].find("a/b").text == "Yazı  sayfa sonu <x> \U0001F600")
sonuc("kayıt: Değer öznitelikte de bulunur, parçası da", xfa._eksik_degerler(ET_DENEME, ["öznitelik", "sonu <x>", "yok bu"]) == [2], xfa._eksik_degerler(ET_DENEME, ["öznitelik", "sonu <x>", "yok bu"]))

# Dosya başka programda değişti (0.3.1 kayıp avı): Damga farklıysa yazılmaz
h = yeni_hedef("damga.pdf")
k_ = xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h, "yol": h})
sonuc("damga: Kayıt yazılanın özetini döner, dosyanın özetiyle aynı", k_["damga"] == notlar.dosya_damgasi(h) and len(k_["damga"]) == 64, k_)
sonuc("damga: Aynıysa yazılır", xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h, "yol": h, "damga": k_["damga"]})["damga"] == notlar.dosya_damgasi(h))
with open(h, "ab") as f_:
    f_.write(b"\n% baska programin kaydi\n")
disaridan = open(h, "rb").read()
try:
    xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h, "yol": h, "damga": k_["damga"]})
    sonuc("damga: Farklıysa yazılmaz", False)
except notlar.YazmaHatasi as e:
    sonuc("damga: Farklıysa yazılmaz, dosya aynı, geçici dosya yok, iletisi anlaşılır", e.tur == "degismis" and "başka bir programda değişmiş" in str(e) and open(h, "rb").read() == disaridan and not gecici_yok() and not HAM.search(str(e)), str(e))
sonuc("damga: Damgasız çağrı (Üzerine kaydet) yazar", xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h, "yol": h})["damga"] == notlar.dosya_damgasi(h))
h2_ = yeni_hedef("damga-yok.pdf")
os.remove(h2_)
sonuc("damga: Dosya yoksa karşılaştırılamaz, yazılır", xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h2_, "yol": h2_, "damga": "0" * 64})["boyut"] > 0 and notlar.dosya_damgasi(os.path.join(os.path.dirname(h2_), "olmayan.pdf")) is None)
bilgi_ = xfa.y_xfa_bilgi({"yol": h})
sonuc("damga: xfa_bilgi saf formda dosyanın özetini verir", bilgi_["damga"] == notlar.dosya_damgasi(h), bilgi_.get("damga"))

# Disk dolu: Geçici dosya yazılırken
h = yeni_hedef("disk-dolu.pdf")
t, i, ayni, temiz = kaydet_hatasi(h, [Yama(os, "fsync", fsync_hatasi(28))])
sonuc("hata: Disk dolu (ENOSPC): Anlaşılır ileti, özgün dosya aynı, geçici dosya yok", t == "YazmaHatasi" and "yer kalmadı" in i and not HAM.search(i) and ayni and temiz, (t, i, ayni, temiz))
# Yerine koyma başarısız: Kalıcı kilit
h = yeni_hedef("yerine-koyma.pdf")


def kilitli_degistir(_h, _g):
    raise PermissionError(32, "Dosya başka bir işlem tarafından kullanıldığından", _h)


bekleme = []
t, i, ayni, temiz = kaydet_hatasi(h, [Yama(notlar, "_replace_file", kilitli_degistir), Yama(notlar.time, "sleep", bekleme.append)])
sonuc("hata: Yerine koyma başarısız: Kilit iletisi, ham hata yok, dosya aynı, geçici dosya yok", t == "YazmaHatasi" and "başka bir programda açık" in i and not HAM.search(i) and ayni and temiz, (t, i, ayni, temiz))
sonuc("hata: Penceresiz kilitte yeniden denendi (6 deneme)", len(bekleme) == 5, bekleme)
# Pencereli programın kilidinde beklenmez
bekleme.clear()
h = yeni_hedef("pencereli-kilit.pdf")
t, i, ayni, temiz = kaydet_hatasi(h, [Yama(notlar, "_replace_file", kilitli_degistir), Yama(notlar.time, "sleep", bekleme.append),
                                      Yama(notlar, "kilit_sahipleri", lambda _y: [{"pid": 1, "ad": "Okuyucu", "tur": 1}])])
sonuc("hata: Pencereli programın kilidinde beklenmez", t == "YazmaHatasi" and not bekleme and ayni and temiz, (bekleme, t))
with Yama(notlar, "kilit_sahipleri", lambda _y: [{"pid": 1, "ad": "Okuyucu", "tur": 1}, {"pid": os.getpid(), "ad": "Çekirdek", "tur": 5}]):
    sonuc("kilit: y_kilit_sahipleri adları verir, çekirdeği saymaz", notlar.y_kilit_sahipleri({"yol": h}) == {"programlar": ["Okuyucu"]})

# Yeniden okunan farklı: Disk yazdığını yazmadı
h = yeni_hedef("okuma-farki.pdf")
gercek_open = open


def bozuk_open(y, kip="r", *a, **b):
    f = gercek_open(y, kip, *a, **b)
    if "rb" in kip and str(y).endswith(".tmp"):
        import io
        return io.BytesIO(f.read()[:-5])
    return f


t, i, ayni, temiz = kaydet_hatasi(h, [Yama(notlar, "open", bozuk_open)])
sonuc("hata: Yeniden okunan kopya farklı: Doğrulanamadı, dosya aynı", t == "YazmaHatasi" and "doğrulanamadı" in i and ayni and temiz, (t, i, ayni, temiz))
# Doğrulayıcı: Bozuk çıktı, başka veri, saf olmayan
h = yeni_hedef("dogrulayici.pdf")
once = open(h, "rb").read()
t, i = hata_ile(lambda: notlar.atomik_yaz(b"bozuk pdf", h, xfa._kayit_dogrulayici(b"x", True)))
sonuc("hata: Doğrulayıcı açılamayan kopyayı reddeder", t == "YazmaHatasi" and "doğrulanamadı" in i and open(h, "rb").read() == once and not gecici_yok(), (t, i))
t, i = hata_ile(lambda: notlar.atomik_yaz(iki, h, xfa._kayit_dogrulayici(b"baska veri", True)))
sonuc("hata: Doğrulayıcı başka veri paketini reddeder", t == "YazmaHatasi" and open(h, "rb").read() == once and not gecici_yok(), (t, i))
t, i = hata_ile(lambda: notlar.atomik_yaz(iki, h, xfa._kayit_dogrulayici(paket(iki, "datasets").encode("utf-8"), False)))
sonuc("hata: Doğrulayıcı saf XFA ölçütünü denetler", t == "YazmaHatasi" and open(h, "rb").read() == once, (t, i))
t, i = hata_ile(lambda: notlar.atomik_yaz(iki, h, xfa._kayit_dogrulayici(paket(iki, "datasets").encode("utf-8"), True)))
sonuc("kayıt: Doğrulayıcı sağlam kopyayı geçirir", t is None and open(h, "rb").read() == iki, (t, i))
# Gerçek kilit (başka süreç)
if os.name == "nt":
    import time as zaman
    for paylasim, ad in ((1, "yalnız okuma paylaşımlı"), (0, "paylaşımsız")):
        h = yeni_hedef("kilit-%d.pdf" % paylasim)
        once = open(h, "rb").read()
        p = subprocess.Popen([sys.executable, "-I", os.path.join(KOK, "test", "kilit_tut.py"), h, str(paylasim)], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        p.stdout.readline()
        sahip = notlar.y_kilit_sahipleri({"yol": h})
        t0 = zaman.time()
        t, i = hata_ile(lambda: xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h, "yol": h, "hizli": True}))
        sure = zaman.time() - t0
        p.stdin.close()
        p.wait(10)
        sonuc("kilit (%s): Kilit iletisi, hızlı kayıt 2 sn altında, sahibi bulunur" % ad, t == "YazmaHatasi" and "başka bir programda açık" in i and not HAM.search(i) and sure < 2 and sahip["programlar"], (t, i, sure, sahip))
        sonuc("kilit (%s): Dosya aynı, geçici dosya yok" % ad, open(h, "rb").read() == once and not gecici_yok(), gecici_yok())
        k = xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h, "yol": h})
        sonuc("kilit (%s): Kilit kalkınca yazılır" % ad, k["boyut"] == os.path.getsize(h) and open(h, "rb").read() != once)
    # Çekirdeğin kendi kilidi: Bilgi alındıktan sonra dosya açık kalmaz
    h = yeni_hedef("kendi-kilit.pdf")
    xfa.y_xfa_bilgi({"yol": h})
    sonuc("kendi kilidi: xfa_bilgi'den sonra dosya açık değil", h not in pdefe_core.onbellek.belgeler and not notlar.kilit_sahipleri(h), notlar.kilit_sahipleri(h))
    pdefe_core.YONTEMLER["belge_bilgi"]({"yol": h})
    pdefe_core.onbellek.tutulmayanlari_birak()
    sonuc("kendi kilidi: Sonraki istekten sonra da açık değil", not notlar.kilit_sahipleri(h), notlar.kilit_sahipleri(h))
    pdefe_core.onbellek.al(h)
    t, i = hata_ile(lambda: xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h, "yol": h}))
    sonuc("kendi kilidi: Önbellekte açık olsa da kayıt başarılı", t is None, (t, i))
    # Salt okunur
    h = yeni_hedef("salt.pdf")
    os.chmod(h, 0o444)
    bekleme = []
    t, i, ayni, temiz = kaydet_hatasi(h, [Yama(notlar.time, "sleep", bekleme.append)])
    os.chmod(h, 0o644)
    sonuc("salt okunur: Anlaşılır ileti, beklenmez, dosya aynı", t == "YazmaHatasi" and notlar.SALT_OKUNUR_METNI in i and not bekleme and ayni and temiz and not HAM.search(i), (t, i, bekleme))
    # Uzun yol (260 karakterden uzun)
    uzun = KAYIT
    while len(uzun) < 280:
        uzun = os.path.join(uzun, "uzun klasör adı ğüş")
    onek = "\\\\?\\" + os.path.abspath(uzun)
    os.makedirs(onek, exist_ok=True)
    h = os.path.join(uzun, "uzun (1).pdf")
    k = xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": h})
    sonuc("uzun yol: Yeni dosya yazıldı", os.path.exists(os.path.join(onek, "uzun (1).pdf")) and k["boyut"] > 0, k)
    k = xfa.y_xfa_kaydet({"veri": base64.b64encode(GIRDI).decode(), "hedef": h, "yol": h})
    sonuc("uzun yol: Üzerine yazıldı, geçici dosya yok", [a for a in os.listdir(onek)] == ["uzun (1).pdf"] and k["boyut"] > 0, os.listdir(onek))
    shutil.rmtree("\\\\?\\" + os.path.abspath(os.path.join(KAYIT, "uzun klasör adı ğüş")), ignore_errors=True)   # Gezgin'in silemediği uzun yol kalmasın
# Klasör yok
t, i = hata_ile(lambda: xfa.y_xfa_kaydet({"veri": KAYNAK, "hedef": os.path.join(KAYIT, "olmayan klasör", "x.pdf")}))
sonuc("klasör yok: Anlaşılır ileti", t == "YazmaHatasi" and "klasör bulunamadı" in i and not HAM.search(i), (t, i))
# Hata türleri
TURLER = [(OSError(28, "x"), "disk_dolu"), (PermissionError(32, "x", "y"), "kilitli"), (PermissionError(33, "x", "y"), "kilitli"), (FileNotFoundError(2, "x"), "klasor_yok")] if os.name == "nt" else [(OSError(28, "x"), "disk_dolu"), (FileNotFoundError(2, "x"), "klasor_yok"), (PermissionError(13, "x"), "izin_yok")]
for e_, tur_ in TURLER:
    sonuc("hata türü: %s → %s" % (e_, tur_), notlar.yazma_hatasi(e_, os.path.join(KAYIT, "yok.pdf")).tur == tur_ and not HAM.search(str(notlar.yazma_hatasi(e_, os.path.join(KAYIT, "yok.pdf")))))
sonuc("hata türü: MuPDF iletisi", notlar.mupdf_yazma_hatasi(RuntimeError("code=2: cannot open file: No space left on device"), "x.pdf").tur == "disk_dolu" and notlar.mupdf_yazma_hatasi(RuntimeError("code=2: No such file or directory"), "x.pdf").tur == "klasor_yok" and notlar.mupdf_yazma_hatasi(RuntimeError("code=1: başka"), "x.pdf").tur == "bilinmeyen")
# Öbür kayıt yolu: Notlar (ham hata yok)
if os.name == "nt":
    h = yeni_hedef("not-kilit.pdf")
    p = subprocess.Popen([sys.executable, "-I", os.path.join(KOK, "test", "kilit_tut.py"), h, "1"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    p.stdout.readline()
    bekleme = []
    with Yama(notlar.time, "sleep", bekleme.append):
        t, i = hata_ile(lambda: notlar.y_notlar_kaydet({"yol": h, "hedef": h, "islemler": [], "temiz": True}))
    p.stdin.close()
    p.wait(10)
    sonuc("notlar: Kilitli dosyada ham hata yok", t == "YazmaHatasi" and "başka bir programda açık" in i and not HAM.search(i), (t, i))
    sonuc("çekirdekte kayıtlı: kilit_sahipleri", "kilit_sahipleri" in pdefe_core.YONTEMLER)

pdefe_core.onbellek.hepsini_birak()

print("\n%d denetim, %d hata" % (toplam, hata))
sys.exit(1 if hata else 0)
