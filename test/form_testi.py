# -*- coding: utf-8 -*-
"""Çekirdeğin etkileşimli form alanları (0.3.1, core/islemler/formlar.py): alan bilgisi ve Tab sırası, değerlerin denetimi, değerlerin
yazılması ve PDEfe'nin ürettiği görünümler (Türkçe harfler, hiza, tarak, çok satır, otomatik boy, döndürülmüş sayfa ve /MK /R 90 alan),
onay kutusu ve seçenek düğmesi durumları, listeler, salt okunur / imza / düğme alanlarının değişmemesi, yazı tipinin bir kez gömülüp
yeniden kullanılması, form katmanının widget widget çizimi (kaydedilmemiş değerler, öbür durum, döndürme), yazdırma görüntüsü (form
alanları "Notları yazdır"dan bağımsız, Print bayrağı), e-imzalı belgede artımlı kayıt (imzalanan baytlar değişmez), XFA'lı karma belge,
yapısal kayıt. Örnekler test/form_alanlari_pdf_uret.py ile test/cikti/form_testi altında üretilir (gerçek belge yok).
Kullanım: .venv\\Scripts\\python.exe test\\form_testi.py"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
import pdefe_core  # noqa: E402
from islemler import formlar, notlar, yapisal  # noqa: E402

CIKTI = os.path.join(KOK, "test", "cikti", "form_testi")
shutil.rmtree(CIKTI, ignore_errors=True)
os.makedirs(CIKTI, exist_ok=True)
hata = toplam = 0
TURKCE = "İĞŞÇÖÜ ığşçöü"


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if ok else " — " + repr(ayrinti)[:700]))


def hata_verir(f):
    try:
        f()
    except (ValueError, KeyError, TypeError):
        return True
    return False


ozet = json.loads(subprocess.check_output([sys.executable, os.path.join(KOK, "test", "form_alanlari_pdf_uret.py"), CIKTI]).decode("utf-8").strip().splitlines()[-1])
ALANLAR = os.path.join(CIKTI, "alanlar.pdf")
ad_xref = {o["ad"]: o["xref"] for o in ozet["alanlar"]}


def kopya(ad, kaynak=ALANLAR):
    y = os.path.join(CIKTI, ad)
    shutil.copy(kaynak, y)
    return y


def murekkep(pix, kutu):
    """Kutudaki (piksel) koyu piksel sayısı (RGB, ortalaması 160'tan koyu)."""
    x0, y0, x1, y1 = (int(round(v)) for v in kutu)
    n, s, w = pix.n, pix.samples, pix.width
    say = 0
    for y in range(max(0, y0), min(pix.height, y1)):
        for x in range(max(0, x0), min(w, x1)):
            i = (y * w + x) * n
            if sum(s[i:i + 3]) < 3 * 160:
                say += 1
    return say


def widget(doc, ad, sayfa=None):
    for p in doc if sayfa is None else [doc[sayfa - 1]]:
        for w in p.widgets():
            if w.field_name == ad:
                return w, p
    return None, None


# ---------------------------------------------------------------- 1. alan bilgisi
pdefe_core.onbellek.hepsini_birak()
a1 = pdefe_core.YONTEMLER["form_alanlari"]({"yol": ALANLAR, "sayfa": 1})["alanlar"]
adlar = [a["ad"] for a in a1]
sonuc("1. sayfanın alanları /Annots sırasıyla", adlar == ["ad", "unvan", "baslik", "tc", "kisa", "uzun", "oto", "salt", "aciklama", "onay1", "onay2",
                                                      "secim", "secim", "secim", "il", "ilce", "liste", "coklu", "imza", "gonder"], adlar)
A = {a["ad"] + (":" + a["acik"] if a["tur"] == "secenek" else ""): a for a in a1}
sonuc("türler", [A[k]["tur"] for k in ("ad", "onay1", "secim:A", "il", "liste", "imza", "gonder")] == ["metin", "onay", "secenek", "acilir", "liste", "imza", "dugme"])
sonuc("iki widget'lı alan: alan xref'i ebeveyn", A["ad"]["alan"] == ad_xref["ad"] and A["ad"]["xref"] != A["ad"]["alan"], A["ad"])
sonuc("seçenek düğmeleri aynı alanda, açık durumları A / B / C", {A["secim:" + d]["alan"] for d in "ABC"} == {ad_xref["secim"]}
      and all(A["secim:" + d]["acik"] == d for d in "ABC"))
sonuc("onay kutusu açık durumları", A["onay1"]["acik"] == "Yes" and A["onay2"]["acik"] == "Evet" and A["onay1"]["deger"] == "Off")
sonuc("hiza, tarak, en çok, otomatik boy, çok satır, salt okunur", (A["unvan"]["hiza"], A["baslik"]["hiza"], A["tc"]["tarak"], A["tc"]["enCok"],
      A["kisa"]["enCok"], A["kisa"]["tarak"], A["oto"]["yaziBoyu"], A["aciklama"]["cokSatir"], A["salt"]["salt"], A["ad"]["salt"])
      == (2, 1, True, 11, 5, False, 0.0, True, True, False))
sonuc("açılır liste: seçenekler (dışa aktarma, görünen) ve değer", A["il"]["secenekler"][1] == ["34", "İstanbul"] and A["il"]["deger"] == "06"
      and A["ilce"]["duzenlenebilir"] and not A["il"]["duzenlenebilir"])
sonuc("liste kutusu: değer liste, çok seçim, satır yüksekliği", A["liste"]["deger"] == [] and A["coklu"]["cokluSecim"] and not A["liste"]["cokluSecim"]
      and abs(A["liste"]["satir"] - 11 * formlar.LISTE_SATIRI) < 1e-6)
sonuc("biçim: yazı tipi, renk, zemin, kenar", (A["ad"]["yaziTipi"], A["ad"]["yaziRengi"], A["ad"]["arka"], A["ad"]["kenar"], A["ad"]["kenarKalinlik"])
      == ("Arial", "#000000", "#ffffff", "#000000", 1.0), A["ad"])
d0 = pymupdf.open(ALANLAR)
sonuc("kutular PyMuPDF'in widget kutusuyla aynı", all(abs(a["rect"][i] - w.rect[i]) < 0.01 for a, w in zip(a1, d0[0].widgets()) for i in range(4)))
a2 = pdefe_core.YONTEMLER["form_alanlari"]({"yol": ALANLAR, "sayfa": 2})["alanlar"]
sonuc("döndürülmüş sayfa (/Rotate 90): kutu döndürülmemiş düzlemde", [a["rect"] for a in a2][0] == [72.0, 100.0, 300.0, 122.0], a2)
a3 = pdefe_core.YONTEMLER["form_alanlari"]({"yol": ALANLAR, "sayfa": 3})["alanlar"]
sonuc("/MK /R 90 alan", next(a for a in a3 if a["ad"] == "yan")["donme"] == 90)
sonuc("alansız sayfa", pdefe_core.YONTEMLER["form_alanlari"]({"yol": ALANLAR, "sayfa": 4})["alanlar"] == [])
sonuc("geçersiz sayfa reddedilir", hata_verir(lambda: pdefe_core.YONTEMLER["form_alanlari"]({"yol": ALANLAR, "sayfa": 9}))
      and hata_verir(lambda: pdefe_core.YONTEMLER["form_alanlari"]({"yol": ALANLAR, "sayfa": "1"})))
# Tab sırası: /Tabs /R
y = kopya("tabs.pdf")
d = pymupdf.open(y)
d.xref_set_key(d[0].xref, "Tabs", "/C")
d.saveIncr()
d.close()
pdefe_core.onbellek.hepsini_birak()
ac = [a["ad"] for a in pdefe_core.YONTEMLER["form_alanlari"]({"yol": y, "sayfa": 1})["alanlar"]]
sonuc("/Tabs /C: sütun sırası (soldan sağa, yukarıdan aşağıya)", ac.index("onay2") > ac.index("imza") and ac[0] == "ad", ac)

# ---------------------------------------------------------------- 2. değerlerin denetimi
dg = formlar.degerleri_dogrula
sonuc("denetim: geçerli liste", dg([{"xref": 5, "deger": "a"}, {"xref": 6, "deger": ["a", "b"]}, {"xref": 7, "deger": None, "fazla": 1}])
      == [{"xref": 5, "deger": "a"}, {"xref": 6, "deger": ["a", "b"]}, {"xref": 7, "deger": None}])
for ad, deger in [("liste değil", {"xref": 1}), ("öğe sözlük değil", [1]), ("xref metin", [{"xref": "1", "deger": ""}]), ("xref 0", [{"xref": 0, "deger": ""}]),
                  ("xref mantıksal", [{"xref": True, "deger": ""}]), ("sayı değer", [{"xref": 1, "deger": 5}]), ("uzun metin", [{"xref": 1, "deger": "x" * 20001}]),
                  ("listede sayı", [{"xref": 1, "deger": ["a", 1]}]), ("çok öğe", [{"xref": 1, "deger": ""}] * 2001), ("uzun liste", [{"xref": 1, "deger": ["a"] * 1001}])]:
    sonuc("denetim reddeder: " + ad, hata_verir(lambda: dg(deger)))

# ---------------------------------------------------------------- 3. değerlerin yazılması ve görünümler
DEGERLER = {
    "ad": TURKCE, "unvan": "Avukat Şükrü", "baslik": "Orta", "tc": "12345678901", "kisa": "abcdefgh", "uzun": "Uzun değer " * 12,
    "oto": "Otomatik boy ığş", "salt": "Değişmemeli", "aciklama": "Birinci satır çok satırlı alanda sarılır " * 4 + "\nİkinci paragraf",
    "onay1": "Yes", "onay2": "Evet", "secim": "B", "il": "34", "ilce": "Ümraniye", "liste": ["Üç"], "coklu": ["Kırmızı", "Mavi"],
    "imza": "olmaz", "gonder": "olmaz", "donuk_metin": "Döndürülmüş sayfa", "donuk_onay": "Yes", "yan": "Yan yazı ığü", "son": "Son alan",
}
liste = [{"xref": ad_xref[k], "deger": v} for k, v in DEGERLER.items()]
y = kopya("degerli.pdf")
doc = pymupdf.open(y)
t = time.time()
n = formlar.degerleri_uygula(doc, formlar.degerleri_dogrula(liste))
sure = time.time() - t
sonuc("değeri yazılan alan sayısı (salt okunur, imza, düğme hariç)", n == len(DEGERLER) - 3, n)
sonuc("22 alan 1 sn'den kısa", sure < 1, round(sure, 3))
doc.save(os.path.join(CIKTI, "degerli-kayit.pdf"), garbage=1, deflate=True)
doc.close()
k = pymupdf.open(os.path.join(CIKTI, "degerli-kayit.pdf"))
deg = {}
for p in k:
    for w in p.widgets():
        deg.setdefault(w.field_name, w.field_value)
sonuc("yazı değerleri (Türkçe)", deg["ad"] == TURKCE and deg["unvan"] == "Avukat Şükrü" and deg["donuk_metin"] == "Döndürülmüş sayfa", deg)
sonuc("en çok 5 harf: kesildi", deg["kisa"] == "abcde", deg["kisa"])
sonuc("salt okunur değişmedi", deg["salt"] == "Sabit", deg["salt"])
sonuc("onay kutuları", deg["onay1"] == "Yes" and deg["onay2"] == "Evet" and deg["donuk_onay"] == "Yes", (deg["onay1"], deg["onay2"]))
w_secim = [w for w in k[0].widgets() if w.field_name == "secim"]
sonuc("seçenek grubu: /V ve çocukların /AS'si", k.xref_get_key(ad_xref["secim"], "V")[1] == "/B"
      and [k.xref_get_key(w.xref, "AS")[1] for w in w_secim] == ["/Off", "/B", "/Off"])
sonuc("açılır liste /V dışa aktarma değeri, yazılabilir listede serbest değer", deg["il"] == "34" and deg["ilce"] == "Ümraniye", (deg["il"], deg["ilce"]))
sonuc("liste kutusu /V ve /I", k.xref_get_key(ad_xref["liste"], "V")[1] == "<FEFF00DC00E7>" or deg["liste"] in ("Üç", ["Üç"]), (k.xref_get_key(ad_xref["liste"], "V"), deg["liste"]))
sonuc("liste kutusu /I", k.xref_get_key(ad_xref["liste"], "I")[1] == "[2]" and k.xref_get_key(ad_xref["coklu"], "I")[1] == "[0 2]",
      (k.xref_get_key(ad_xref["liste"], "I"), k.xref_get_key(ad_xref["coklu"], "I")))
sonuc("çok seçimli liste /V dizi", k.xref_get_key(ad_xref["coklu"], "V")[0] == "array")
sonuc("imza ve düğme değişmedi", k.xref_get_key(ad_xref["imza"], "V")[0] == "null" and k.xref_get_key(ad_xref["gonder"], "V")[0] == "null")
sonuc("iki widget'lı alanın iki widget'ı da yeni görünümlü", all(k.xref_get_key(x, "AP/N")[0] == "xref" for x in next(o for o in ozet["alanlar"] if o["ad"] == "ad")["widgetlar"]))
# Gömülen yazı tipi: bir aile için tek nesne, sayfaya ve kataloğa yazılmadı
fontlar = [x for x in range(1, k.xref_length()) if k.xref_get_key(x, "Subtype")[1] == "/Type0"]
sonuc("yazı tipi bir kez gömüldü (Arial, düz)", len(fontlar) == 1, fontlar)
sonuc("sayfa kaynaklarına ve kataloğa yazı tipi eklenmedi", k.xref_get_key(k.pdf_catalog(), "PDEfeFonts")[0] == "null"
      and "PDEfe" not in k.xref_object(k[0].xref) and "PDEfe" not in (k.xref_get_key(k[0].xref, "Resources")[1] or ""))
# Görünümdeki yazı: widget'lar sayfaya işlenip (bake) metin okunur
k.bake(annots=False, widgets=True)
metin = "\n".join(p.get_text() for p in k)
for ad in ("ad", "unvan", "donuk_metin", "yan", "oto"):
    sonuc("görünümde yazı doğru: " + ad, DEGERLER[ad] in metin, DEGERLER[ad])
sonuc("açılır listenin görünümünde görünen ad (İstanbul)", "İstanbul" in metin)
sonuc("liste kutusunun görünümünde seçenekler", all(s in metin for s in ("Bir", "İki", "Üç", "Kırmızı", "Yeşil")))
sonuc("çok satır: iki paragraf da görünümde", "Birinci satır" in metin and "İkinci paragraf" in metin)
k.close()

# Konumlar: görünüm sayfaya işlenmiş belgede sözcüklerin yeri
k = pymupdf.open(os.path.join(CIKTI, "degerli-kayit.pdf"))
k.bake(annots=False, widgets=True)
p1 = k[0]
sozcukler = p1.get_text("words")


def kutu_ici(ad):
    r = next(a["rect"] for a in a1 if a["ad"] == ad)
    return [s for s in sozcukler if s[0] >= r[0] - 0.5 and s[2] <= r[2] + 0.5 and s[1] >= r[1] - 0.5 and s[3] <= r[3] + 0.5], r


s_unvan, r = kutu_ici("unvan")
sonuc("sağa hizalı: yazı sağ kenara yakın", s_unvan and r[2] - max(s[2] for s in s_unvan) < 6, (s_unvan, r))
s_baslik, r = kutu_ici("baslik")
orta = (min(s[0] for s in s_baslik) + max(s[2] for s in s_baslik)) / 2 if s_baslik else 0
sonuc("ortaya hizalı", abs(orta - (r[0] + r[2]) / 2) < 3, (orta, r))
s_ad, r = kutu_ici("ad")
sonuc("tek satır: yazı alanın içinde, dikeyde ortada", s_ad and abs((min(s[1] for s in s_ad) + max(s[3] for s in s_ad)) / 2 - (r[1] + r[3]) / 2) < 3, (s_ad, r))
s_tc, r = kutu_ici("tc")
harfler = [c for b in p1.get_text("rawdict")["blocks"] for l in b.get("lines", []) for sp in l["spans"] for c in sp["chars"]
           if r[0] <= c["bbox"][0] and c["bbox"][2] <= r[2] and r[1] <= c["bbox"][1] and c["bbox"][3] <= r[3]]
hucre = (r[2] - r[0]) / 11
sonuc("tarak: 11 hane, her biri kendi hücresinin ortasında", len(harfler) == 11 and all(
    abs((c["bbox"][0] + c["bbox"][2]) / 2 - (r[0] + hucre * (i + 0.5))) < 1.5 for i, c in enumerate(harfler)), [(c["c"], c["bbox"][0]) for c in harfler])
s_uzun, r = kutu_ici("uzun")
sonuc("uzun yazı alanın başından başlar, alan dışına taşmaz", s_uzun and abs(min(s[0] for s in s_uzun) - (r[0] + 3)) < 1.5, s_uzun[:2])
s_ac, r = kutu_ici("aciklama")
satirlar = sorted({round(s[3]) for s in s_ac})
sonuc("çok satır: birden çok satır, hepsi alanın içinde", len(satirlar) >= 3, satirlar)
k.close()

# Görüntü: değerli alanlarda mürekkep, salt okunurda dosyadaki görünüm
k = pymupdf.open(os.path.join(CIKTI, "degerli-kayit.pdf"))
pix = k[0].get_pixmap(dpi=144)
o = 2
dolu = {ad: murekkep(pix, [v * o for v in next(a["rect"] for a in a1 if a["ad"] == ad)]) for ad in ("ad", "oto", "il", "coklu", "onay1")}
bos = murekkep(pymupdf.open(ALANLAR)[0].get_pixmap(dpi=144), [v * o for v in A["onay1"]["rect"]])
sonuc("görüntüde değerler çizili (yazı, otomatik boy, açılır liste, liste, onay)", all(v > 60 for v in dolu.values()) and dolu["onay1"] > bos + 20, (dolu, bos))
pix.save(os.path.join(CIKTI, "degerli-1.png"))
k[1].get_pixmap(dpi=96).save(os.path.join(CIKTI, "degerli-2.png"))
k[2].get_pixmap(dpi=96).save(os.path.join(CIKTI, "degerli-3.png"))
k.close()

# Otomatik boylu tek satırda boy alana sığar; kapalı onay kutusunda işaret yok
doc = pymupdf.open(ALANLAR)
formlar.degerleri_uygula(doc, [{"xref": ad_xref["onay1"], "deger": "Yes"}])
formlar.degerleri_uygula(doc, [{"xref": ad_xref["onay1"], "deger": "Off"}, {"xref": ad_xref["secim"], "deger": "Off"}])
sonuc("onay kutusu kapatıldı", doc.xref_get_key(ad_xref["onay1"], "V")[1] == "/Off" and doc.xref_get_key(ad_xref["onay1"], "AS")[1] == "/Off")
sonuc("seçenek grubu Off", doc.xref_get_key(ad_xref["secim"], "V")[1] == "/Off")
sonuc("geçersiz durum adı yazılmaz", formlar.degerleri_uygula(doc, [{"xref": ad_xref["secim"], "deger": "Z"}]) == 0)
sonuc("listede olmayan değer açılır listeye (yazılamayan) yazılmaz", formlar.degerleri_uygula(doc, [{"xref": ad_xref["il"], "deger": "99"}]) == 0)
sonuc("başka nesnenin xref'i alan sayılmaz", formlar.degerleri_uygula(doc, [{"xref": doc[0].xref, "deger": "x"}, {"xref": 99999, "deger": "x"}]) == 0)
doc.close()

# Görünümü olmayan onay kutusu: iki durumun görünümü üretilir
y = kopya("apsiz.pdf")
d = pymupdf.open(y)
d.xref_set_key(ad_xref["onay1"], "AP", "null")
d.saveIncr()
d.close()
d = pymupdf.open(y)
formlar.degerleri_uygula(d, [{"xref": ad_xref["onay1"], "deger": "Yes"}])
sonuc("görünümsüz onay kutusuna Yes ve Off görünümü", sorted(re.findall(r"/(\w+) \d+ 0 R", d.xref_get_key(ad_xref["onay1"], "AP/N")[1])) == ["Off", "Yes"],
      d.xref_get_key(ad_xref["onay1"], "AP/N"))
w, p = widget(d, "onay1")
pix = p.get_pixmap(dpi=144, clip=w.rect)
sonuc("üretilen açık görünümde işaret var", murekkep(pix, [0, 0, pix.width, pix.height]) > 30)
d.close()

# ---------------------------------------------------------------- 4. form katmanı (form_gorunum)
pdefe_core.onbellek.hepsini_birak()
fg = pdefe_core.YONTEMLER["form_gorunum"]
g = fg({"yol": ALANLAR, "sayfa": 1, "olcek": 2, "dondurme": 0, "alanlar": True})
sonuc("widget görüntüleri: gizli olmayan 20 widget, alan bilgisi de", len(g["widgetlar"]) == 20 and len(g["alanlar"]) == 20)
W = {w["xref"]: w for w in g["widgetlar"]}
r = A["ad"]["rect"]
kutu = W[A["ad"]["xref"]]["kutu"]
sonuc("kutu sayfanın oranı olarak widget'ın yerinde", abs(kutu[0] - (r[0] - 1) / 595) < 0.01 and abs(kutu[1] - (r[1] - 1) / 842) < 0.01, (kutu, r))
sonuc("onay kutusunda öbür durumun görüntüsü (açık)", W[A["onay1"]["xref"]].get("diger", {}).get("durum") == "Yes" and W[A["onay1"]["xref"]]["durum"] == "Off")
sonuc("seçenek düğmesinde öbür durum (kendi açık adı)", W[A["secim:C"]["xref"]]["diger"]["durum"] == "C")
sonuc("yazı alanında öbür durum yok", "diger" not in W[A["ad"]["xref"]])
g2 = fg({"yol": ALANLAR, "sayfa": 1, "olcek": 2, "dondurme": 0, "degerler": [{"xref": ad_xref["ad"], "deger": TURKCE}, {"xref": ad_xref["onay1"], "deger": "Yes"}],
         "xrefler": [A["ad"]["xref"], A["onay1"]["xref"]]})
W2 = {w["xref"]: w for w in g2["widgetlar"]}
sonuc("xrefler: yalnızca istenen widget'lar", sorted(W2) == sorted([A["ad"]["xref"], A["onay1"]["xref"]]))
sonuc("kaydedilmemiş değer: görüntü değişti", W2[A["ad"]["xref"]]["png"] != W[A["ad"]["xref"]]["png"])
sonuc("kaydedilmemiş açık onay: şimdiki görüntü öncekinin öbür durumu", W2[A["onay1"]["xref"]]["png"] == W[A["onay1"]["xref"]]["diger"]["png"]
      and W2[A["onay1"]["xref"]]["diger"]["durum"] == "Off")
sonuc("dosyanın kendisi değişmedi", pymupdf.open(ALANLAR).xref_get_key(ad_xref["onay1"], "V")[1] == "/Off")
# Döndürülmüş sayfa: dosyadaki /Rotate 90 ve ekranda ek 90
r2 = a2[0]["rect"]
# Saat yönünde 90°: (x, y) → (842 - y, x) (döndürülmüş sayfa 842 × 595); 180°: (595 - x, 842 - y)
for ac, beklenen in ((90, (842 - r2[3], r2[0])), (180, (595 - r2[2], 842 - r2[3]))):
    gg = fg({"yol": ALANLAR, "sayfa": 2, "olcek": 1, "dondurme": ac})
    kk = next(w for w in gg["widgetlar"] if w["xref"] == a2[0]["xref"])["kutu"]
    Wp, Hp = (842, 595) if ac == 90 else (595, 842)
    sonuc("döndürülmüş sayfa, ekranda %d°: kutu doğru yerde" % ac, abs(kk[0] * Wp - beklenen[0]) < 2 and abs(kk[1] * Hp - beklenen[1]) < 2, (kk, beklenen))
sonuc("form_gorunum geçersiz parametreler reddedilir", hata_verir(lambda: fg({"yol": ALANLAR, "sayfa": 0}))
      and hata_verir(lambda: fg({"yol": ALANLAR, "sayfa": 1, "xrefler": "1"})) and hata_verir(lambda: fg({"yol": ALANLAR, "sayfa": 1, "degerler": [{"xref": "a"}]})))
sonuc("alansız sayfada boş liste", fg({"yol": ALANLAR, "sayfa": 4, "olcek": 1})["widgetlar"] == [])
# Çalışma belgesi bırakılınca dosya yeniden adlandırılabilir (Windows: açık dosya değiştirilemez)
y = kopya("calisma.pdf")
fg({"yol": y, "sayfa": 1, "olcek": 1, "degerler": [{"xref": ad_xref["ad"], "deger": "x"}]})
sonuc("çalışma belgesi önbellekte", any(k[0] == y for k in formlar._calisma))
pdefe_core.YONTEMLER["belge_birak"]({"yol": y})
try:
    os.replace(y, y + ".tasindi.pdf")
    tasindi = True
except OSError:
    tasindi = False
sonuc("belge_birak çalışma belgesini de kapatır (dosya taşınabildi)", tasindi and not any(k[0] == y for k in formlar._calisma))
# 0.3.1 inceleme: Önbellek kaydı en_fazla sınırıyla atılmış dosyanın çalışma belgesi de bırakılır (belge_birak ve araçların bırakması)
from islemler import araclar  # noqa: E402
for ad, birak in (("calisma-lru.pdf", lambda y: pdefe_core.YONTEMLER["belge_birak"]({"yol": y})), ("calisma-lru2.pdf", araclar._onbellekten_birak)):
    pdefe_core.onbellek.hepsini_birak()
    y = kopya(ad)
    fg({"yol": y, "sayfa": 1, "olcek": 1, "degerler": [{"xref": ad_xref["ad"], "deger": "lru"}]})
    for i in range(pdefe_core.onbellek.en_fazla + 1):
        pdefe_core.onbellek.al(kopya("lru-%d.pdf" % i))
    kayitsiz = y not in pdefe_core.onbellek.belgeler and any(k[0] == y for k in formlar._calisma)
    birak(y)
    try:
        os.replace(y, y + ".tasindi.pdf")
        tasindi = True
    except OSError:
        tasindi = False
    sonuc("önbellekten atılan dosyanın çalışma belgesi de bırakılır (%s)" % ad, kayitsiz and tasindi and not any(k[0] == y for k in formlar._calisma),
          (kayitsiz, tasindi))
pdefe_core.onbellek.hepsini_birak()

# 0.3.1 inceleme: Uzun yazı (boşluksuz ve sözcüklü, otomatik boy) çekirdeği tutmaz. Önceden sarma her adımda satırı ve parçayı yeniden
# ölçüyordu: Boşluksuz 1.200 karakter 38 sn, otomatik boylu 8.000 karakter 12 sn sürüyordu
d = pymupdf.open(ALANLAR)
t = time.time()
formlar.degerleri_uygula(d, [{"xref": ad_xref["aciklama"], "deger": "x" * formlar.EN_UZUN_METIN}])
sure = time.time() - t
d.bake(annots=False, widgets=True)
sonuc("boşluksuz %d karakter 2 sn'den kısa, görünümde başı var" % formlar.EN_UZUN_METIN, sure < 2 and "x" * 20 in d[0].get_text(), round(sure, 3))
d.close()
d = pymupdf.open(ALANLAR)
da = d.xref_get_key(ad_xref["aciklama"], "DA")[1]
d.xref_set_key(ad_xref["aciklama"], "DA", notlar._pdf_metin(re.sub(r"[\d.]+\s+Tf", "0 Tf", da.strip("()"))))
uzun = ("deneme sözcük " * 2000)[:formlar.EN_UZUN_METIN]
t = time.time()
formlar.degerleri_uygula(d, [{"xref": ad_xref["aciklama"], "deger": uzun}])
sure = time.time() - t
akis = d.xref_stream(int(d.xref_get_key(ad_xref["aciklama"], "AP/N")[1].split()[0])).decode("latin-1")
boy = float(re.search(r"BT /\S+ ([\d.]+) Tf", akis).group(1))
d.bake(annots=False, widgets=True)
sonuc("otomatik boylu çok satır, %d karakter: 2 sn'den kısa, en küçük boy, görünümde başı var" % len(uzun),
      sure < 2 and boy == formlar.OTOMATIK_BOY_EN_AZ and "deneme sözcük deneme" in d[0].get_text(), (round(sure, 3), boy))
d.close()
# Kısa yazı otomatik boyda yine büyük yazılır (sınırlı sayım boyu değiştirmez)
d = pymupdf.open(ALANLAR)
d.xref_set_key(ad_xref["aciklama"], "DA", notlar._pdf_metin(re.sub(r"[\d.]+\s+Tf", "0 Tf", da.strip("()"))))
formlar.degerleri_uygula(d, [{"xref": ad_xref["aciklama"], "deger": "Kısa"}])
akis = d.xref_stream(int(d.xref_get_key(ad_xref["aciklama"], "AP/N")[1].split()[0])).decode("latin-1")
sonuc("otomatik boylu çok satır, kısa yazı: 12 punto", float(re.search(r"BT /\S+ ([\d.]+) Tf", akis).group(1)) == formlar.COK_SATIR_OTOMATIK, akis[:200])
d.close()
# Sarma: sözcük sarma, sığmayan sözcük harf harf, satır sonundaki boşluk satırda, paragraflar
genislik_1 = {c: 1.0 for c in "abcdefgh xy"}
sonuc("sarma: sözcükler, bölünen sözcük, paragraf", formlar._satirlar("ab cd abcdefgh\nxy", 5.0, genislik_1.get, 1.0) == ["ab cd ", "abcde", "fgh", "xy"],
      formlar._satirlar("ab cd abcdefgh\nxy", 5.0, genislik_1.get, 1.0))
sonuc("sarma: en_cok satırda durur", formlar._satirlar("a b c d e f", 1.0, genislik_1.get, 1.0, 2) == ["a ", "b "])

# 0.3.1 inceleme: Yazı notunun /PDEfeFonts'taki fontu (insert_font'un ToUnicode'u: boşluk → U+00A0) form görünümünde kullanılmaz
y = kopya("notlu-font.pdf")
d = pymupdf.open(y)
_, altkume, _, _ = notlar._font_yukle("Arial", False, False)
fx = d[0].insert_font(fontname="PDEfeDeneme", fontbuffer=altkume)
d.xref_set_key(d.pdf_catalog(), "PDEfeFonts", "<</ArialR %d 0 R>>" % fx)
d.saveIncr()
d.close()
d = pymupdf.open(y)
formlar.degerleri_uygula(d, [{"xref": ad_xref["ad"], "deger": "bir iki üç"}])
kullanilan = re.search(r"/PDEfeF\w+ (\d+) 0 R", d.xref_object(int(d.xref_get_key(next(o for o in ozet["alanlar"] if o["ad"] == "ad")["widgetlar"][0], "AP/N")[1].split()[0])))
d.bake(annots=False, widgets=True)
satir = next((s for s in d[0].get_text().splitlines() if "iki" in s), "")
sonuc("notun ToUnicode'u bozuk fontu kullanılmadı, görünümde boşluklar olağan", kullanilan and int(kullanilan.group(1)) != fx and satir == "bir iki üç",
      (kullanilan and kullanilan.group(1), fx, repr(satir)))
d.close()

# ---------------------------------------------------------------- 5. yazdırma görüntüsü
sg = pdefe_core.y_sayfa_goruntu
pdefe_core.onbellek.hepsini_birak()
y = kopya("yazdir.pdf")
d = pymupdf.open(y)
d.xref_set_key(ad_xref["gonder"], "F", "0")                          # yazdırılmayan düğme
d.saveIncr()
d.close()
pdefe_core.onbellek.hepsini_birak()


def goruntu(p):
    r = sg(p)
    return pymupdf.Pixmap(__import__("base64").b64decode(r["veri"]))


notsuz = goruntu({"yol": y, "sayfa": 1, "dpi": 144, "notlar": False, "bicim": "png"})
degerli = goruntu({"yol": y, "sayfa": 1, "dpi": 144, "notlar": False, "bicim": "png", "formlar": [{"xref": ad_xref["ad"], "deger": TURKCE}]})
oran = 2
sonuc("Notları yazdır kapalı: form alanları basılır (kenarlıklar)", murekkep(notsuz, [v * oran for v in A["onay1"]["rect"]]) > 20)
sonuc("kaydedilmemiş değer basılır", murekkep(degerli, [v * oran for v in A["ad"]["rect"]]) > murekkep(notsuz, [v * oran for v in A["ad"]["rect"]]) + 60)
sonuc("Print bayrağı olmayan düğme basılmaz", murekkep(notsuz, [v * oran for v in A["gonder"]["rect"]]) < 10, murekkep(notsuz, [v * oran for v in A["gonder"]["rect"]]))
notlu = goruntu({"yol": y, "sayfa": 1, "dpi": 144, "notlar": True, "bicim": "png"})
sonuc("Notları yazdır açık: aynı form çizimi", murekkep(notlu, [v * oran for v in A["onay1"]["rect"]]) == murekkep(notsuz, [v * oran for v in A["onay1"]["rect"]]))
# Formsuz belgede eski çizimle aynı (get_pixmap)
duz = os.path.join(CIKTI, "duz.pdf")
d = pymupdf.open()
pg = d.new_page()
pg.insert_text((72, 100), "Duz sayfa", fontsize=20)
pg.add_highlight_annot(pymupdf.Rect(70, 80, 200, 105))
d.save(duz)
d.close()
for notlu_mu in (False, True):
    yeni = goruntu({"yol": duz, "sayfa": 1, "dpi": 100, "notlar": notlu_mu, "bicim": "png"})
    eski = pymupdf.open(duz)[0].get_pixmap(matrix=pymupdf.Matrix(100 / 72, 100 / 72), annots=notlu_mu, alpha=False)
    sonuc("formsuz sayfa eski yazdırma çizimiyle piksel piksel aynı (notlar %s)" % notlu_mu, yeni.samples == eski.samples)

# ---------------------------------------------------------------- 6. e-imzalı belgede artımlı kayıt
IMZALI = os.path.join(CIKTI, "imzali.pdf")
y = kopya("imzali-kayit.pdf", IMZALI)
ilk = open(y, "rb").read()
ix = {o["ad"]: o["xref"] for o in ozet["imzali"]}
pdefe_core.onbellek.hepsini_birak()
sonuc("imza_durumu: imzalı", notlar.y_imza_durumu({"yol": y})["imzali"])
r = notlar.y_notlar_kaydet({"yol": y, "islemler": [], "formlar": [{"xref": ix["not"], "deger": TURKCE}, {"xref": ix["kabul"], "deger": "Yes"}]})
son = open(y, "rb").read()
sonuc("artımlı kayıt", r["artimli"] and r["formlar"] == 2, r)
sonuc("imzalanan baytlar değişmedi (dosyanın başı aynen)", son[:len(ilk)] == ilk)
m = re.search(rb"/ByteRange\s*\[\s*0\s+(\d+)\s+(\d+)\s+(\d+)\s*\]", ilk)
a, b, c = (int(v) for v in m.groups())
ozet_hex = hashlib.sha256(ilk[0:a] + ilk[b:b + c]).hexdigest().encode()
sonuc("ByteRange'in özeti tutuyor", son[a + 1:a + 65] == ozet_hex)
ek = son[len(ilk):]
sonuc("artımlı bölümde sayfa ve katalog nesnesi yok", not re.search(rb"/Type\s*/Page\b", ek) and not re.search(rb"/Type\s*/Catalog", ek), ek[:300])
d = pymupdf.open(y)
sonuc("değerler okunuyor", widget(d, "not")[0].field_value == TURKCE and widget(d, "kabul")[0].field_value == "Yes")
d.close()
# İkinci kayıt: yazı tipi yeniden kullanılır
boy1 = len(son)
pdefe_core.onbellek.hepsini_birak()
notlar.y_notlar_kaydet({"yol": y, "islemler": [], "formlar": [{"xref": ix["not"], "deger": TURKCE + " 2"}]})
boy2 = os.path.getsize(y)
sonuc("ikinci kayıtta yazı tipi yeniden gömülmedi (artış < 5 KB)", boy2 - boy1 < 5000, boy2 - boy1)
d = pymupdf.open(y)
sonuc("tek Type0 yazı tipi", len([x for x in range(1, d.xref_length()) if d.xref_get_key(x, "Subtype")[1] == "/Type0"]) == 1)
d.close()

# ---------------------------------------------------------------- 7. XFA'lı karma belge
y = kopya("karma-kayit.pdf", os.path.join(CIKTI, "karma.pdf"))
kx = {o["ad"]: o["xref"] for o in ozet["karma"]}
pdefe_core.onbellek.hepsini_birak()
ka = pdefe_core.YONTEMLER["form_alanlari"]({"yol": y, "sayfa": 1})["alanlar"]
sonuc("karma belge: AcroForm alanları okunur", [a["ad"] for a in ka] == ["kisi", "uygun"] and ka[0]["deger"] == "Eski")
notlar.y_notlar_kaydet({"yol": y, "islemler": [], "formlar": [{"xref": kx["kisi"], "deger": "Yeni değer"}]})
d = pymupdf.open(y)
sonuc("karma belge: değer yazıldı, /XFA kaldırıldı", widget(d, "kisi")[0].field_value == "Yeni değer" and d.xref_get_key(d.pdf_catalog(), "AcroForm/XFA")[0] == "null")
d.close()
d = pymupdf.open(os.path.join(CIKTI, "karma.pdf"))
sonuc("değer değişmeyince /XFA kalır", formlar.degerleri_uygula(d, []) == 0 and d.xref_get_key(d.pdf_catalog(), "AcroForm/XFA")[0] == "array")
d.close()

# ---------------------------------------------------------------- 8. yapısal kayıt
y = kopya("yapisal.pdf")
hedef = os.path.join(CIKTI, "yapisal-hedef.pdf")
pdefe_core.onbellek.hepsini_birak()
tarif = [{"kaynak": {"yol": y, "sayfa": s}, "dondurme": 0} for s in (3, 1, 5)]
r = yapisal.y_yapisal_kaydet({"yol": y, "hedef": hedef, "tarif": tarif, "anlikKlasor": os.path.join(CIKTI, "anlik"), "islemler": [],
                               "formlar": [{"yol": y, "degerler": [{"xref": ad_xref["unvan"], "deger": "Yapısal ığş"}, {"xref": ad_xref["onay2"], "deger": "Evet"},
                                                                   {"xref": ad_xref["son"], "deger": "Son"}, {"xref": ad_xref["secim"], "deger": "C"}]}]})
d = pymupdf.open(hedef)
dv = {}
for p in d:
    for w in p.widgets():
        dv.setdefault(w.field_name, w.field_value)
sonuc("yapısal kayıt: değerler sayfayla kopyalandı", dv.get("unvan") == "Yapısal ığş" and dv.get("onay2") == "Evet" and dv.get("son") == "Son", dv)
sonuc("yapısal kayıt: seçenek grubu", [d.xref_get_key(w.xref, "AS")[1] for w in d[1].widgets() if w.field_name == "secim"] == ["/Off", "/Off", "/C"])
d.bake(annots=False, widgets=True)
sonuc("yapısal kayıt: görünümde Türkçe yazı", "Yapısal ığş" in d[1].get_text())
d.close()
sonuc("kaynak dosya değişmedi", pymupdf.open(y).xref_get_key(ad_xref["unvan"], "V")[1] == "Avukat", pymupdf.open(y).xref_get_key(ad_xref["unvan"], "V"))
sonuc("yapısal kayıt: geçersiz formlar reddedilir", hata_verir(lambda: yapisal.y_yapisal_kaydet({"yol": y, "hedef": hedef, "tarif": tarif, "formlar": [{"yol": 5}]}))
      and hata_verir(lambda: yapisal.y_yapisal_kaydet({"yol": y, "hedef": hedef, "tarif": tarif, "formlar": "x"})))
sonuc("notlar_kaydet: geçersiz formlar reddedilir", hata_verir(lambda: notlar.y_notlar_kaydet({"yol": y, "islemler": [], "formlar": [{"xref": -1, "deger": ""}]})))
pdefe_core.onbellek.hepsini_birak()

# ---------------------------------------------------------------- 6b. e-imza sayılmayanlar, kullanım hakları imzası (/Perms /UR3)
print("— Kullanım hakları imzası")
HAKLAR = os.path.join(CIKTI, "haklar.pdf")
hx = {o["ad"]: o["xref"] for o in ozet["haklar"]}


def imzali_mi(yol):
    pdefe_core.onbellek.hepsini_birak()
    r = notlar.y_imza_durumu({"yol": yol})["imzali"]
    pdefe_core.onbellek.hepsini_birak()
    return r


def perms(yol, anahtar="Perms/UR3"):
    d = pymupdf.open(yol)
    t = d.xref_get_key(d.pdf_catalog(), anahtar)[0]
    d.close()
    return t


sonuc("imza_durumu: Yalnız kullanım hakları imzalı form (dolaylı /UR3, imzalanmamış imza alanı, /SigFlags 1) imzalı değil", imzali_mi(HAKLAR) is False)
y = kopya("haklar-dogrudan.pdf", HAKLAR)
d = pymupdf.open(y)
d.xref_set_key(d.pdf_catalog(), "Perms", "<</UR3<</Type/Sig/ByteRange[0 10 20 30]/Contents<00>>>>>")
d.saveIncr()
d.close()
sonuc("imza_durumu: Doğrudan yazılmış /UR3 de imza sayılmaz", imzali_mi(y) is False)
y = kopya("haklar-sigflags3.pdf", HAKLAR)
d = pymupdf.open(y)
d.xref_set_key(d.pdf_catalog(), "AcroForm/SigFlags", "3")
d.saveIncr()
d.close()
sonuc("imza_durumu: /SigFlags 3 tek başına imza sayılmaz", imzali_mi(y) is False)
# Gerçek imza kaçmamalı
y = kopya("haklar-imzali.pdf", HAKLAR)
d = pymupdf.open(y)
s = d.get_new_xref()
d.update_object(s, "<</Type/Sig/Filter/Deneme.Imza/ByteRange[0 1 2 3]/Contents<00>>>")
d.xref_set_key(hx["imza"], "V", "%d 0 R" % s)
d.saveIncr()
d.close()
sonuc("imza_durumu: Kullanım hakkının yanında dolu imza alanı: imzalı", imzali_mi(y) is True)
y = kopya("haklar-docmdp.pdf", HAKLAR)
d = pymupdf.open(y)
d.xref_set_key(d.pdf_catalog(), "Perms", "<</DocMDP<</Type/Sig/Filter/Deneme.Imza/ByteRange[0 1 2 3]/Contents<00>>>>>")
d.saveIncr()
d.close()
sonuc("imza_durumu: Onay imzası (/Perms /DocMDP): imzalı", imzali_mi(y) is True)
y = kopya("haklar-sayfasiz.pdf", HAKLAR)
d = pymupdf.open(y)
s = d.get_new_xref()
d.update_object(s, "<</Type/Sig/Filter/Deneme.Imza/ByteRange[0 1 2 3]/Contents<00>>>")
a = d.get_new_xref()
d.update_object(a, "<</FT/Sig/T(gizli)/V %d 0 R>>" % s)
d.saveIncr()
d.close()
sonuc("imza_durumu: Sayfaya bağlı olmayan imza alanı: imzalı", imzali_mi(y) is True)
y = kopya("haklar-dogrudan-v.pdf", HAKLAR)
d = pymupdf.open(y)
a = d.get_new_xref()
d.update_object(a, "<</FT/Sig/T(ebeveyn)/V<</Type/Sig/ByteRange[0 1 2 3]/Contents<00>>>>>")
d.saveIncr()
d.close()
sonuc("imza_durumu: Değeri doğrudan sözlük olan, sayfasız imza alanı: imzalı", imzali_mi(y) is True)

# Kayıt yolları
y = kopya("haklar-artimli.pdf", HAKLAR)
pdefe_core.onbellek.hepsini_birak()
r = notlar.y_notlar_kaydet({"yol": y, "islemler": [], "formlar": [{"xref": hx["kisi"], "deger": "Yeni"}]})
sonuc("artımlı kayıt: Kullanım hakları imzası kalır (imzalanan baytlar değişmedi)", r["artimli"] and not r["kullanimHakkiKaldirildi"] and perms(y) != "null", r)
y = kopya("haklar-temiz.pdf", HAKLAR)
pdefe_core.onbellek.hepsini_birak()
r = notlar.y_notlar_kaydet({"yol": y, "islemler": [], "temiz": True, "formlar": [{"xref": hx["kisi"], "deger": "Yeni"}]})
d = pymupdf.open(y)
sonuc("baştan yazım: Kullanım hakları imzası kalkar, /Perms yok, değer yazıldı", not r["artimli"] and r["kullanimHakkiKaldirildi"] and perms(y, "Perms") == "null"
      and widget(d, "kisi")[0].field_value == "Yeni" and not d.is_repaired, r)
d.close()
sonuc("baştan yazım: Eski UR3 sözlüğü dosyada kalmaz", b"/ByteRange" not in open(y, "rb").read())
y = kopya("haklar-farkli.pdf", HAKLAR)
hedef = os.path.join(CIKTI, "haklar-farkli-hedef.pdf")
pdefe_core.onbellek.hepsini_birak()
r = notlar.y_notlar_kaydet({"yol": y, "hedef": hedef, "islemler": []})
sonuc("başka dosyaya kayıt: Kullanım hakları imzası kalkar, kaynak aynen kalır", r["kullanimHakkiKaldirildi"] and perms(hedef, "Perms") == "null" and perms(y) != "null", r)
y = kopya("haklar-docmdp-ur3.pdf", HAKLAR)
d = pymupdf.open(y)
d.xref_set_key(d.pdf_catalog(), "Perms", "<</UR3<</Type/Sig>>/DocMDP<</Type/Sig/Filter/Deneme.Imza/ByteRange[0 1 2 3]/Contents<00>>>>>")
d.saveIncr()
d.close()
pdefe_core.onbellek.hepsini_birak()
r = notlar.y_notlar_kaydet({"yol": y, "islemler": [], "temiz": True})
sonuc("baştan yazım: DocMDP kalır, yalnız UR3 kalkar", r["kullanimHakkiKaldirildi"] and perms(y) == "null" and perms(y, "Perms/DocMDP") != "null", r)
# Sıkıştır baştan yazar (aynı kök neden)
from islemler import araclar  # noqa: E402
y = kopya("haklar-sikistir.pdf", HAKLAR)
hedef = os.path.join(CIKTI, "haklar-sikistir-hedef.pdf")
pdefe_core.onbellek.hepsini_birak()
r = araclar.y_kucult({"yol": y, "hedef": hedef, "seviye": "onerilen"})
sonuc("Sıkıştır: Çıktıda kullanım hakları imzası yok, kaynak aynen kalır", perms(hedef, "Perms") == "null" and perms(y) != "null", r)
pdefe_core.onbellek.hepsini_birak()

print("\n%d denetim, %d hata" % (toplam, hata))
sys.exit(1 if hata else 0)
