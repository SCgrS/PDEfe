# -*- coding: utf-8 -*-
"""Çekirdeğin dinamik XFA formları (0.3.1, core/islemler/xfa.py): şablon bilgisi (düğmelerin tanınan eylemleri, tanınmayan betik, sayfa
numarası alanları, basılmayan öğeler, tekrarlanabilir alt formlar), SOM çözümü, örnek ekleme / silme (yeni örnek var olanın yapısıyla,
değerleri boş; occur sınırları), görünürlük (şablonda presence, öbür baytlar aynı), artımlı yazım (girdi + ek), kaydetme (baştan yazım,
kullanım hakları imzasının kaldırılması, DocMDP'nin kalması, MuPDF onarmadan açar), parametre denetimleri ve DTD / varlık reddi. Örnek
test/xfa_pdf_uret.py ile test/cikti/xfa_testi altında üretilir (gerçek belge yok).
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
sonuc("çekirdekte kayıtlı yöntemler", all(y in pdefe_core.YONTEMLER for y in ("xfa_bilgi", "xfa_degistir", "xfa_kaydet")))
pdefe_core.onbellek.hepsini_birak()

print("\n%d denetim, %d hata" % (toplam, hata))
sys.exit(1 if hata else 0)
