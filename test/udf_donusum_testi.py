# -*- coding: utf-8 -*-
"""UDF ↔ PDF dönüştürme testi (0.2.6; core/islemler/udf.py, udf_yaz.py, core/ude_kopru). Girdilerin hepsi burada üretilir (gerçek belge
kullanılmaz); çıktılar test/cikti/udf_donusum altında.

Çalıştırma:  .venv\\Scripts\\python.exe test\\udf_donusum_testi.py [--exe core\\dist\\pdefe-core\\pdefe-core.exe]
UYAP Doküman Editörü (UDE) ya da Java (8) bu bilgisayarda yoksa UDE gerektiren denetimler "ATLANDI" yazar (CI). Gerçek belgelerle ölçüm
(yalnızca sayılar yazılır): PDEFE_UDF_DERLEM=<.udf'lerin klasörü> ile UDF → PDF → UDF → PDF turu; PDEFE_UDF_ORNEK=<udf>;<iyi pdf> ile
kullanıcının "Yazdır → PDF" çıktısıyla satır satır karşılaştırma.
Denetlenenler: köprü jar'ının kaynakla tutarlılığı ve Java 8 bayt kodu; UDE / Java bulma; UDF → PDF: sayfa boyu = pageFormat (sol ve sağ
kenarı farklı belgede de A4), yazı tiplerinin hepsi gömülü, SMask yok, saydam antetin çevresinde gri çerçeve yok, sayfa sayısı UDE'ninkiyle
aynı, düz XML (zip'siz) UDF, yatay sayfa, tablo, satır konumları yazıcı yoluyla ≤ 0,5 pt; donusum_bilgi yanıtının ön izlemesi; iptal (süreç
öldürülür, çıktı kalmaz), zaman aşımı, açılamayan belge, UDE bulunamayınca anlaşılır neden; kullanıcının .uki / .sertifikadeposu
klasörlerinin değişmemesi, geçici ev klasörlerinin silinmesi. PDF → UDF: content.xml'in yapısı (format_id 1.8, ofsetler, tam punto, "]]>",
BMP dışı karakter, yatay sayfa), UDE'nin açması, sözcük benzerliği, sayfa sayısı, üst / alt bilgi ve sayfa numarası, taranmış sayfa.
"""
import base64
import difflib
import hashlib
import io
import json
import os
import queue
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import time
import zipfile
import xml.etree.ElementTree as ET

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORE = os.path.join(KOK, "core")
sys.path.insert(0, CORE)
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

CIKTI = os.path.join(KOK, "test", "cikti", "udf_donusum")
WINDOWS = sys.platform == "win32"
A4 = (595.28, 841.89)
hata = toplam = 0


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if not ayrinti else " — " + str(ayrinti)))


def atlandi(ad, neden):
    print("ATLANDI " + ad + " — " + neden)


# ---------------------------------------------------------------- çağrı köprüsü (donustur_testi ile aynı düzen)
class CagriHatasi(Exception):
    def __init__(self, mesaj, kod=None):
        super().__init__(mesaj)
        self.kod = kod


class Cagirici:
    def __init__(self, exe=None):
        self.exe = exe
        self.sayac = 0
        if exe:
            ortam = dict(os.environ, PDEFE_UDE_KOPRU=os.path.join(CORE, "ude_kopru", "ude-kopru.jar"))
            self.surec = subprocess.Popen([exe], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                                          encoding="utf-8", bufsize=1, env=ortam)
        else:
            import pdefe_core
            self.cekirdek = pdefe_core

    def cagir(self, yontem, params, iptal_sonra=None, sure=600):
        ilerlemeler = []
        if self.exe:
            self.sayac += 1
            kimlik = self.sayac
            self.surec.stdin.write(json.dumps({"id": kimlik, "method": yontem, "params": params}, ensure_ascii=False) + "\n")
            self.surec.stdin.flush()
            while True:
                satir = self.surec.stdout.readline()
                if not satir:
                    raise RuntimeError("exe kapandı")
                m = json.loads(satir)
                if m.get("id") != kimlik:
                    continue
                if "progress" in m:
                    ilerlemeler.append(m["progress"])
                    if iptal_sonra is not None and len(ilerlemeler) == iptal_sonra:
                        self.sayac += 1
                        self.surec.stdin.write(json.dumps({"id": self.sayac, "method": "iptal", "params": {"id": kimlik}}) + "\n")
                        self.surec.stdin.flush()
                    continue
                if "error" in m:
                    raise CagriHatasi(m["error"]["message"], m["error"].get("code"))
                return m["result"], ilerlemeler
        p = dict(params)
        p["_ilerleme"] = lambda y, m="": ilerlemeler.append({"yuzde": y, "mesaj": m})
        p["_iptal_mi"] = lambda: iptal_sonra is not None and len(ilerlemeler) >= iptal_sonra
        try:
            r = self.cekirdek.YONTEMLER[yontem](p)
        except self.cekirdek.IptalEdildi:
            raise CagriHatasi("İşlem iptal edildi.", -32800)
        if isinstance(r, self.cekirdek.Ertelenmis):
            olay, kutu = threading.Event(), {}
            r.baslat(lambda s, h: (kutu.update(s=s, h=h), olay.set()))
            if not olay.wait(sure):
                raise RuntimeError("ertelenmiş yanıt gelmedi")
            if kutu["h"] is not None:
                h = kutu["h"]
                raise CagriHatasi(str(h) or "İşlem iptal edildi.", -32800 if isinstance(h, (self.cekirdek.IptalEdildi, InterruptedError)) else -32000)
            r = kutu["s"]
        return r, ilerlemeler

    def kapat(self):
        if self.exe:
            self.surec.stdin.close()
            self.surec.wait(timeout=20)


def donustur(c, ogeler, **k):
    return c.cagir("bicim_donustur", {"ogeler": ogeler}, **k)


def temiz_klasor(ad):
    k = os.path.join(CIKTI, ad)
    shutil.rmtree(k, ignore_errors=True)
    os.makedirs(k)
    return k


# ---------------------------------------------------------------- sentetik UDF
ONSOZ = '<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >\n'
STILLER = ('<styles><style name="default" description="Geçerli" family="Dialog" size="12" bold="false" italic="false" foreground="-13421773" '
           'FONT_ATTRIBUTE_KEY="javax.swing.plaf.FontUIResource[family=Dialog,name=Dialog,style=plain,size=12]" />'
           '<style name="hvl-default" family="Times New Roman" size="12" description="Gövde" /></styles>')
METIN = ("Deneme belgesinin paragrafı burada sürüyor; satırlar yazı alanının sağ kenarında kırılıyor ve iki yana yaslanıyor. Türkçe "
         "harfler ğüşıöç ve İĞÜŞÖÇ de yer alıyor; paragraf birkaç satır boyunca devam ediyor, sayılar 2099/123 ve 01.10.2026 gibi. ")
SOZCUKLER = ("dava dilekçe mahkeme karar taraf vekil süre itiraz delil tanık bilirkişi rapor tutanak duruşma gider harç faiz alacak borç "
             "sözleşme fesih tazminat ihtar tebligat icra takip ödeme emri haciz istinaf temyiz ilam gerekçe hüküm kanun madde fıkra bent "
             "hak yükümlülük usul esas görev yetki dosya örnek belge sayfa şerh beyan talep sonuç nedenle saygılarımızla arz ederiz "
             "ğüşıöç İstanbul Ankara İzmir Çorum Şırnak Ağrı Üsküdar Ödemiş").split()


def cumleler(tohum, n):
    """Tekrarsız sentetik metin (benzerlik ölçümü tekrar eden metinde yanlış hizalanıyor)."""
    import random
    r = random.Random(tohum)
    out = []
    for _ in range(n):
        s = " ".join(r.choice(SOZCUKLER) for _ in range(r.randint(8, 16)))
        out.append(s[0].upper() + s[1:] + r.choice((".", ".", ";", ",")) + (" %d/%d" % (r.randint(2000, 2099), r.randint(1, 999)) if r.random() < 0.2 else ""))
    return " ".join(out) + " "


class UdfYaz:
    """Kişisel veri içermeyen sentetik UDF (UDF Antetcisi tools/ude-cizici/deneme_belgeleri.py'nin bilgisiyle)."""

    def __init__(self):
        self.havuz, self.uz, self.xml = [], 0, []

    def _m(self, s):
        b = self.uz
        self.havuz.append(s)
        self.uz += len(s)
        return b

    def paragraf(self, metin, aile="Times New Roman", boy=12, hiza=3, oz="", hedef=None, kalin=False):
        b = self._m(metin)
        n = self._m("\n")
        k = ' bold="true"' if kalin else ""
        x = ('<paragraph Alignment="%d" %s><content startOffset="%d" length="%d" family="%s" size="%d"%s /><content startOffset="%d" '
             'length="1" family="%s" size="%d" /></paragraph>' % (hiza, oz, b, len(metin), aile, boy, k, n, aile, boy))
        (hedef if hedef is not None else self.xml).append(x)
        return x

    def resim(self, png, gen, yuk, hiza=0, hedef=None):
        b = self._m(chr(0xFFFC))
        n = self._m("\n")
        x = ('<paragraph Alignment="%d"><image imageData="%s" width="%s" height="%s" startOffset="%d" length="1" />'
             '<content startOffset="%d" length="1" family="Times New Roman" size="1" /></paragraph>'
             % (hiza, base64.b64encode(png).decode("ascii"), gen, yuk, b, n))
        (hedef if hedef is not None else self.xml).append(x)

    def tablo(self, satir, sutun, kenarlik="borderCell", spans=None):
        satirlar = []
        for r in range(satir):
            hucreler = []
            for c in range(sutun):
                parca = []
                self.paragraf("Hücre %d-%d deneme" % (r + 1, c + 1), hiza=0, oz='LeftIndent="3.0" RightIndent="1.0"', hedef=parca)
                hucreler.append("<cell>" + "".join(parca) + "</cell>")
            satirlar.append('<row rowName="row%d" rowType="dataRow">%s</row>' % (r + 1, "".join(hucreler)))
        oz = 'columnCount="%d" columnSpans="%s" ' % (sutun, spans or ",".join(["100"] * sutun))
        self.xml.append('<table tableName="Tablo1" %sborder="%s">%s</table>' % (oz, kenarlik, "".join(satirlar)))

    def yaz(self, yol, lm=70.87, rm=70.87, tm=56.69, bm=56.69, yon=1, ust=None, alt=None, alt_oz="", bg=None, duz_xml=False):
        pf = ('<pageFormat mediaSizeName="1" leftMargin="%s" rightMargin="%s" topMargin="%s" bottomMargin="%s" paperOrientation="%d" '
              'headerFOffset="20.0" footerFOffset="20.0" />' % (lm, rm, tm, bm, yon))
        if bg:
            pf += ('<bgImage bgImageSource="" bgImageData="%s" bgImageLeftMargin="0" bgImageUpMargin="0" bgImageRigtMargin="0" '
                   'bgImageBottomMargin="0" />' % base64.b64encode(bg).decode("ascii"))
        govde = list(self.xml)
        if ust is not None:
            govde.insert(0, "<header>" + "".join(ust) + "</header>")
        if alt is not None:
            govde.append("<footer %s>" % alt_oz + "".join(alt) + "</footer>")
        x = (ONSOZ + "<content><![CDATA[" + "".join(self.havuz) + "]]></content><properties>" + pf + "</properties>\n"
             '<elements resolver="hvl-default" >\n' + "\n".join(govde) + "\n</elements>" + STILLER + "\n</template>\n")
        if duz_xml:
            with open(yol, "wb") as f:
                f.write(x.encode("utf-8"))
        else:
            with zipfile.ZipFile(yol, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr("content.xml", x.encode("utf-8"))
        return yol


def saydam_logo():
    """Saydam zeminli (piksellerin çoğu RGB 0,0,0 alfa 0: UDE'de gri çerçeveyi doğuran durum) antet resmi."""
    im = Image.new("RGBA", (1200, 1700), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((450, 60, 750, 360), fill=(160, 20, 30, 255))
    d.rectangle((100, 1600, 1100, 1615), fill=(160, 20, 30, 255))
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def png(gen, yuk, renk=(40, 40, 40)):
    b = io.BytesIO()
    Image.new("RGB", (gen, yuk), renk).save(b, "PNG")
    return b.getvalue()


SAYFA_NO = ('pageNumber-spec="BSP32_2120" pageNumber-seperator="/" pageNumber-fontBold="false" pageNumber-fontItalic="false" '
            'pageNumber-fontFace="Times New Roman" pageNumber-fontSize="10" pageNumber-color="-16777216" pageNumber-foreStr="" '
            'pageNumber-pageStartNumStr=""')


def udf_girdileri(k):
    g = {}
    u = UdfYaz()
    u.paragraf("SOL VE SAĞ KENARI FARKLI BELGE", hiza=1, kalin=True)
    for i in range(14):
        u.paragraf(cumleler(i, 4), oz='FirstLineIndent="35.4"')
    alt = []
    u.paragraf("", hiza=0, hedef=alt)
    g["kenar"] = u.yaz(os.path.join(k, "kenar_farkli.udf"), lm=85.04, rm=42.52, alt=alt, alt_oz=SAYFA_NO)
    u = UdfYaz()
    u.paragraf("Saydam antetli deneme belgesi", hiza=1, kalin=True)
    for i in range(3):
        u.paragraf(METIN)
    g["bg"] = u.yaz(os.path.join(k, "saydam_antet.udf"), tm=200, bg=saydam_logo())
    u = UdfYaz()
    u.paragraf("Tablolu belge", hiza=1, kalin=True)
    u.tablo(3, 3)
    u.paragraf(METIN)
    g["tablo"] = u.yaz(os.path.join(k, "tablolu.udf"))
    u = UdfYaz()
    for i in range(3):
        u.paragraf(METIN, aile="Arial", boy=11)
    g["xml"] = u.yaz(os.path.join(k, "duz_xml.udf"), duz_xml=True)
    u = UdfYaz()
    for i in range(4):
        u.paragraf(METIN)
    g["yatay"] = u.yaz(os.path.join(k, "yatay.udf"), yon=0)
    u = UdfYaz()
    ust = []
    u.resim(png(600, 80, (200, 40, 40)), 450, 60, hiza=1, hedef=ust)
    for i in range(110):
        u.paragraf("Paragraf %d: kısa deneme satırı, ğüşıöç." % (i + 1), aile="Calibri" if i % 3 else "Times New Roman", boy=11, hiza=0)
    g["uzun"] = u.yaz(os.path.join(k, "uzun.udf"), ust=ust)
    u = UdfYaz()
    for i in range(500):
        u.paragraf(METIN * 3)
    g["buyuk"] = u.yaz(os.path.join(k, "buyuk.udf"))
    # Yorumlu belge (comments.xml; UDE yorumları kendi vurgulayıcısıyla işaretliyor, belge paneli tek başına yüklenince açmıyordu)
    u = UdfYaz()
    for i in range(3):
        u.paragraf(METIN)
    yorumlu = u.yaz(os.path.join(k, "yorumlu.udf"))
    yorum = (ONSOZ + "<content><![CDATA[Deneme yorumu\n]]></content>\n<elements resolver=\"hvl-default\" >\n"
             '<comment type="1" strtOffs="10" endOffs="40" indx="0" time="1791402367083" usr="Deneme Kullanıcı"><paragraph>'
             '<content startOffset="0" length="14" /></paragraph></comment>\n</elements>' + STILLER + "\n</template>\n")
    with zipfile.ZipFile(yorumlu, "a", zipfile.ZIP_DEFLATED) as z:
        z.writestr("comments.xml", yorum.encode("utf-8"))
    g["yorumlu"] = yorumlu
    with zipfile.ZipFile(os.path.join(k, "bozuk.udf"), "w") as z:
        z.writestr("content.xml", ONSOZ + "<content><![CDATA[abc]]></content><elements><paragraph><content startOffset=\"0\" "
                   "length=\"999\" /></paragraph></elements></template>")
    g["bozuk"] = os.path.join(k, "bozuk.udf")
    return g


# ---------------------------------------------------------------- PDF ölçüleri
def pdf_satirlari(yol):
    d = pymupdf.open(yol, filetype="pdf")
    out = []
    for i, s in enumerate(d):
        for b in s.get_text("dict")["blocks"]:
            if b["type"]:
                continue
            for l in b["lines"]:
                if abs(l["dir"][1]) > 0.1:
                    continue
                t = "".join(sp["text"] for sp in l["spans"]).strip()
                if t:
                    out.append((i, l["bbox"], t))
    d.close()
    return out


def satir_karsilastir(a, b):
    """İki PDF'in satırları: (eşleşen, en büyük konum sapması (medyandan), sözcük benzerliği)."""
    la, lb = pdf_satirlari(a), pdf_satirlari(b)
    sm = difflib.SequenceMatcher(None, [x[2] for x in la], [x[2] for x in lb], autojunk=False)
    dx, dy = [], []
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            x, y = la[blk.a + k], lb[blk.b + k]
            if x[0] == y[0]:
                dx.append(y[1][0] - x[1][0])
                dy.append(y[1][1] - x[1][1])
    wa, wb = " ".join(x[2] for x in la).split(), " ".join(x[2] for x in lb).split()
    kel = difflib.SequenceMatcher(None, wa, wb, autojunk=False).ratio() if (wa or wb) else 1.0
    if not dx:
        return 0, None, kel, len(la), len(lb)
    mx, my = sorted(dx)[len(dx) // 2], sorted(dy)[len(dy) // 2]
    sap = max(max(abs(v - mx) for v in dx), max(abs(v - my) for v in dy))
    return len(dx), sap, kel, len(la), len(lb)


def pdf_ozeti(yol):
    d = pymupdf.open(yol, filetype="pdf")
    boylar = [(round(s.rect.width, 2), round(s.rect.height, 2)) for s in d]
    yazi_tipleri = [f for s in d for f in s.get_fonts(full=True)]
    gomulu = sum(1 for f in yazi_tipleri if f[1] not in ("n/a", ""))
    smask = sum(1 for x in range(1, d.xref_length()) if d.xref_get_key(x, "SMask")[0] != "null")
    n = d.page_count
    d.close()
    return {"sayfa": n, "boylar": boylar, "yazi_tipi": len(yazi_tipleri), "gomulu": gomulu, "smask": smask}


def kullanici_ude_klasorleri():
    ev = os.path.expanduser("~")
    durum = {}
    for ad in (".uki", ".sertifikadeposu"):
        k = os.path.join(ev, ad)
        if not os.path.isdir(k):
            durum[ad] = None
            continue
        dosyalar = {}
        for kok, _, adlar in os.walk(k):
            for a in adlar:
                y = os.path.join(kok, a)
                try:
                    with open(y, "rb") as f:
                        dosyalar[os.path.relpath(y, k)] = hashlib.sha256(f.read()).hexdigest()
                except OSError:
                    dosyalar[os.path.relpath(y, k)] = "okunamadı"
        durum[ad] = dosyalar
    return durum


def gecici_evler():
    return sorted(a for a in os.listdir(tempfile.gettempdir()) if a.startswith("pdefe-ude-"))


# ---------------------------------------------------------------- testler
def test_kopru_jari():
    jar = os.path.join(CORE, "ude_kopru", "ude-kopru.jar")
    kaynak = os.path.join(CORE, "ude_kopru", "src", "pdefe", "UdeKopru.java")
    with open(kaynak, "rb") as f:
        ozet = hashlib.sha256(f.read().replace(b"\r\n", b"\n")).hexdigest()
    with zipfile.ZipFile(jar) as z:
        jar_ozeti = z.read("pdefe/kaynak.sha256").decode().strip()
        siniflar = [a for a in z.namelist() if a.endswith(".class")]
        surumler = {struct.unpack(">H", z.read(a)[6:8])[0] for a in siniflar}
        ana = z.read("META-INF/MANIFEST.MF").decode()
        disari = [a for a in z.namelist() if a.startswith(("com/", "tr/"))]
    sonuc("köprü jar'ı kaynakla tutarlı (npm run ude-kopru:derle)", jar_ozeti == ozet, (jar_ozeti[:12], ozet[:12]))
    sonuc("köprü Java 8 bayt kodu (sınıf sürümü 52)", surumler == {52}, surumler)
    sonuc("köprünün ana sınıfı pdefe.UdeKopru, içinde UDE / iText sınıfı yok", "Main-Class: pdefe.UdeKopru" in ana and not disari)
    with open(kaynak, encoding="utf-8") as f:
        metin = f.read()
    sonuc("köprü UDE ve iText'i yalnızca yansımayla kullanıyor (içe aktarım yok)",
          not re.search(r"^import\s+(com\.lowagie|tr\.com\.havelsan)", metin, re.M))


def test_yetenekler(c):
    r, _ = c.cagir("donusum_yetenekleri", {})
    u = r.get("udf") or {}
    print("     UDE: %s (%s), Java: %s, kip: %s" % (u.get("ude", {}).get("var"), u.get("ude", {}).get("surum"), u.get("java", {}).get("surum"),
                                                     u.get("kip")))
    sonuc("donusum_yetenekleri.udf alanları", all(k in u for k in ("var", "ude", "java", "kip", "pdfdenUdf")), sorted(u))
    if "pdf>udf" in r["donusumler"]:
        sonuc("PDF → UDF her zaman var (UDE gerekmez)", (r["donusumler"].get("pdf>udf") or {}).get("var") is True and u.get("pdfdenUdf") is True,
              r["donusumler"].get("pdf>udf"))
    return bool(u.get("var"))


def test_udf_pdf(c, g, k):
    """UDF → PDF: sayfa boyu, yazı tipleri, SMask, sayfa sayısı (köprü = ön izleme), düz XML, yatay, tablo."""
    ogeler = [{"yol": g[a], "hedef": os.path.join(k, a + ".pdf"), "hedefBicim": "pdf"} for a in ("kenar", "bg", "tablo", "xml", "yatay", "uzun")]
    t0 = time.time()
    r, il = donustur(c, ogeler)
    sure = time.time() - t0
    sonuc("6 UDF tek istekte PDF'e: hepsi başarılı", r["basarili"] == 6, [o.get("hata") for o in r["sonuclar"] if "hata" in o])
    print("     süre %.1f sn, ilerleme %d" % (sure, len(il)))
    for o in r["sonuclar"]:
        if "hata" in o:
            continue
        ad = os.path.basename(o["hedef"])
        oz = pdf_ozeti(o["hedef"])
        beklenen = (A4[1], A4[0]) if ad.startswith("yatay") else A4
        sonuc("%s: sayfa boyu pageFormat'la aynı %s" % (ad, beklenen),
              all(abs(b[0] - beklenen[0]) < 0.6 and abs(b[1] - beklenen[1]) < 0.6 for b in oz["boylar"]), oz["boylar"][:2])
        sonuc("%s: yazı tiplerinin hepsi gömülü" % ad, oz["yazi_tipi"] > 0 and oz["gomulu"] == oz["yazi_tipi"], (oz["gomulu"], oz["yazi_tipi"]))
        sonuc("%s: SMask (yumuşak maske) yok" % ad, oz["smask"] == 0, oz["smask"])
        sonuc("%s: sonuçta sayfa sayısı ve çizim yolu" % ad, o.get("sayfa") == oz["sayfa"] and o.get("cizim") == "ude", (o.get("sayfa"), o.get("cizim")))
    yol = os.path.join(k, "kenar.pdf")
    if os.path.exists(yol):
        sat = pdf_satirlari(yol)
        sollar = sorted({round(b[0], 1) for _, b, _ in sat})
        saglar = sorted(round(b[2], 1) for _, b, _ in sat)
        sonuc("sol ve sağ kenarı farklı belgede yazı sol kenardan başlıyor (⌊85,04⌋ + 1 = 86)", 86.0 in sollar, sollar[:3])
        sonuc("…ve sağ kenarı aşmıyor (595,28 − 42,52 + 1,5)", saglar[-1] <= A4[0] - 42.52 + 1.5, saglar[-1])
        d = pymupdf.open(yol)
        n = d.page_count
        numaralar = [[t for i, b, t in sat if i == k and b[1] > 780] for k in range(n)]
        d.close()
        # UDE sayfa numarasını glif dizisiyle çiziyor; köprü onu yazıya çevirir (iText şekil yazıyordu: görünür ama seçilemezdi)
        sonuc("sayfa numarası her sayfada yazı olarak (seçilebilir, \"n/N\")", n >= 2 and all("%d/%d" % (k + 1, n) in numaralar[k] for k in range(n)),
              numaralar)
    yol = os.path.join(k, "bg.pdf")
    if os.path.exists(yol):
        d = pymupdf.open(yol)
        pix = d[0].get_pixmap(dpi=72, colorspace=pymupdf.csGRAY)
        im = Image.frombytes("L", (pix.w, pix.h), pix.samples)
        d.close()
        # Logonun (dairenin) çevresi saydamdı: düzleştirilmeden UDE küçültünce koyu yarı saydam pikseller kalıyordu (gri çerçeve)
        kutu = im.crop((int(450 / 1200 * 595) - 12, int(60 / 1700 * 842) - 12, int(750 / 1200 * 595) + 12, int(360 / 1700 * 842) + 12))
        w, h = kutu.size
        kenar = [kutu.getpixel((x, y)) for x in range(w) for y in (0, 1, h - 2, h - 1)] + [kutu.getpixel((x, y)) for y in range(h) for x in (0, 1, w - 2, w - 1)]
        sonuc("saydam antetin çevresinde gri çerçeve yok (kenar pikselleri beyaz)", min(kenar) >= 250, min(kenar))
    # Ön izleme ile aynı sayfa sayısı
    for a in ("kenar", "uzun", "xml"):
        r, _ = c.cagir("donusum_bilgi", {"yol": g[a], "genislik": 200})
        pdf = os.path.join(k, a + ".pdf")
        n = pdf_ozeti(pdf)["sayfa"] if os.path.exists(pdf) else None
        sonuc("donusum_bilgi (%s): ön izleme, UDE'nin sayfa sayısı (%s)" % (a, n), r.get("tur") == "udf" and r.get("sayfa") == n and
              bool(r.get("png")) and r.get("pngGenislik") == 200, {x: r.get(x) for x in ("tur", "alt", "sayfa", "pngGenislik", "onizlemeUyarisi")})
    r, _ = c.cagir("donusum_bilgi", {"yol": g["xml"], "onizleme": False})
    sonuc("donusum_bilgi onizleme=false: UDE açılmadan hızlı özet (düz XML: alt 'xml')", r.get("alt") == "xml" and r.get("sayfa") is None
          and "png" not in r and abs((r.get("genislik") or 0) - A4[0]) < 0.6, {x: r.get(x) for x in ("alt", "sayfa", "genislik", "yukseklik")})
    r, _ = c.cagir("donusum_bilgi", {"yol": g["yatay"], "onizleme": False})
    sonuc("donusum_bilgi: yatay sayfa (paperOrientation 0) genişlik > yükseklik", r.get("yatay") is True and r.get("genislik", 0) > r.get("yukseklik", 0),
          (r.get("genislik"), r.get("yukseklik")))


def test_yazici_konum(c, g, k):
    """UDE'nin PDF kitaplığıyla ve Windows'un PDF yazıcısıyla çizilen PDF'lerin satır konumları aynı (≤ 0,5 pt)."""
    if not WINDOWS:
        atlandi("yazıcı yolu", "yalnızca Windows")
        return
    ogeler = [{"yol": g["kenar"], "hedef": os.path.join(k, "kenar_yazici.pdf"), "hedefBicim": "pdf", "secenekler": {"kip": "yazici"}}]
    r, _ = donustur(c, ogeler)
    o = r["sonuclar"][0]
    if "hata" in o:
        if o.get("kod") == "desteklenmiyor":
            atlandi("yazıcı yolu", o["hata"])
            return
        sonuc("yazıcı yolu (Microsoft Print to PDF)", False, o["hata"])
        return
    sonuc("yazıcı yolu çizdi (cizim 'yazici')", o.get("cizim") == "yazici", o.get("cizim"))
    es, sap, kel, na, nb = satir_karsilastir(os.path.join(k, "kenar.pdf"), o["hedef"])
    if nb == 0:
        atlandi("satır konumları yazıcı yoluyla", "yazıcı belgeyi resme çevirdi (Java'nın raster yedeği)")
        return
    sonuc("satır konumları yazıcı yoluyla aynı (≤ 0,5 pt), sözcükler aynı", sap is not None and sap <= 0.5 and kel >= 0.99 and es >= na - 1,
          {"eşleşen": es, "satır": (na, nb), "sapma": sap and round(sap, 2), "sözcük": round(kel, 3)})


def test_yorumlu(c, g, k):
    r, _ = donustur(c, [{"yol": g["yorumlu"], "hedef": os.path.join(k, "yorumlu.pdf"), "hedefBicim": "pdf"}])
    o = r["sonuclar"][0]
    sonuc("yorumlu UDF dönüşüyor, yorumların alınmadığı söyleniyor", "hata" not in o and "yorumlar" in (o.get("uyari") or ""),
          o.get("hata") or o.get("uyari"))


def test_hatalar(c, g, k):
    r, _ = donustur(c, [{"yol": g["bozuk"], "hedef": os.path.join(k, "bozuk.pdf"), "hedefBicim": "pdf"},
                        {"yol": g["tablo"], "hedef": os.path.join(k, "tablo2.pdf"), "hedefBicim": "pdf"}])
    o = r["sonuclar"][0]
    sonuc("açılamayan UDF: yalnızca o öğe hata alır (kod bozuk), öteki dönüşür", o.get("kod") == "bozuk" and "hata" not in r["sonuclar"][1]
          and not os.path.exists(os.path.join(k, "bozuk.pdf")), (o.get("kod"), o.get("hata")))
    kalan = [a for a in os.listdir(k) if ".pdefe-tmp" in a]
    sonuc("hata ve başarıdan sonra geçici dosya kalmadı", not kalan, kalan)


def test_iptal(c, g, k):
    from islemler import udf as U
    hedef = os.path.join(k, "buyuk.pdf")
    t0 = time.time()
    try:
        donustur(c, [{"yol": g["buyuk"], "hedef": hedef, "hedefBicim": "pdf"}], iptal_sonra=3)
        sonuc("iptal: -32800", False, "iptal edilmedi")
    except CagriHatasi as e:
        sonuc("iptal: -32800 (İşlem iptal edildi)", e.kod == -32800, (e.kod, str(e)))
    print("     iptal %.1f sn sürdü" % (time.time() - t0))
    sonuc("iptal: hedef ve geçici dosya yok", not os.path.exists(hedef) and not [a for a in os.listdir(k) if ".pdefe-tmp" in a], os.listdir(k))
    if c.exe:
        return
    oturum = U._oturumlar._oturumlar.get("donustur")
    sonuc("iptal: köprünün süreci öldürüldü (dönüştürme oturumu kalmadı)", oturum is None, oturum)
    # Zaman aşımı: belge süresi çok kısa
    eski, eski_mb = U.BELGE_SURESI, U.BELGE_SURESI_MB
    U.BELGE_SURESI, U.BELGE_SURESI_MB = 0.3, 0.0
    try:
        r, _ = donustur(c, [{"yol": g["buyuk"], "hedef": hedef, "hedefBicim": "pdf"}])
        o = r["sonuclar"][0]
        sonuc("zaman aşımı: öğe hatası (kod zaman_asimi), hedef yok", o.get("kod") == "zaman_asimi" and not os.path.exists(hedef), (o.get("kod"), o.get("hata")))
    finally:
        U.BELGE_SURESI, U.BELGE_SURESI_MB = eski, eski_mb
    r, _ = donustur(c, [{"yol": g["tablo"], "hedef": os.path.join(k, "sonra.pdf"), "hedefBicim": "pdf"}])
    sonuc("zaman aşımından sonra yeni oturum çalışıyor", r["basarili"] == 1, r["sonuclar"][0].get("hata"))


def test_ude_yok(c, g, k):
    """UDE bulunamayınca: yetenek 'var: false' + neden, dönüştürme 'desteklenmiyor'; PDF → UDF yine var."""
    if c.exe:
        atlandi("UDE bulunamayınca", "yalnızca doğrudan modülle (bulma işlevleri değiştirilir)")
        return
    from islemler import udf as U
    bos = temiz_klasor("ude_yok")
    eski = U.ude_bul
    U.ude_bul = lambda elle=None: U._ude_bilgisi(U._ude_klasoru(elle), "ayar") if U._ude_klasoru(elle) else None
    try:
        r, _ = c.cagir("donusum_yetenekleri", {"udeYolu": bos})
        u = r["udf"]
        sonuc("UDE yok: udf.var false, anlaşılır neden", u["var"] is False and "bulunamadı" in (u.get("neden") or ""), u.get("neden"))
        if "pdf>udf" in r["donusumler"]:
            sonuc("UDE yok: PDF → UDF yine var", r["donusumler"]["pdf>udf"]["var"] is True and r["donusumler"]["udf>pdf"]["var"] is False,
                  (r["donusumler"]["pdf>udf"], r["donusumler"]["udf>pdf"]))
        r, _ = donustur(c, [{"yol": g["tablo"], "hedef": os.path.join(bos, "x.pdf"), "hedefBicim": "pdf"}], )
        o = r["sonuclar"][0]
        sonuc("UDE yok: dönüştürme öğesi 'desteklenmiyor'", o.get("kod") == "desteklenmiyor", (o.get("kod"), o.get("hata")))
        r, _ = c.cagir("donusum_bilgi", {"yol": g["tablo"]})
        sonuc("UDE yok: donusum_bilgi ön izlemesiz döner, nedeni söyler", r.get("tur") == "udf" and "png" not in r and r.get("onizlemeUyarisi"),
              r.get("onizlemeUyarisi"))
    finally:
        U.ude_bul = eski
        c.cagir("donusum_yetenekleri", {"udeYolu": None})
    # Kullanıcının gösterdiği yol (UDE klasörü ya da exe'si) bulunuyor
    ude, _ = U._hazirlik(yenile=True)
    if ude:
        r, _ = c.cagir("donusum_yetenekleri", {"udeYolu": ude.get("exe") or ude["klasor"]})
        sonuc("ayarlarda gösterilen UDE yolu kullanılıyor (kaynak 'ayar')", r["udf"]["ude"].get("kaynak") == "ayar" and r["udf"]["var"], r["udf"]["ude"])
        c.cagir("donusum_yetenekleri", {"udeYolu": None})


def bomba_udf(yol, gercek, bildirilen=900):
    """content.xml'i bildirilen bayt diye beyan eden (CRC de o kadarına göre), gerçekte gercek bayt açılan UDF (zip bombası)."""
    import zlib
    bas = b'<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >\n<content><![CDATA['
    co = zlib.compressobj(9, zlib.DEFLATED, -15)
    blok = b" " * (1 << 20)
    parca = [co.compress(bas)] + [co.compress(blok) for _ in range(gercek // len(blok))] + [co.flush()]
    veri = b"".join(parca)
    crc = zlib.crc32((bas + blok)[:bildirilen]) & 0xFFFFFFFF
    ad = b"content.xml"
    yerel = struct.pack("<4sHHHHHIIIHH", b"PK\x03\x04", 20, 0, 8, 0, 0, crc, len(veri), bildirilen, len(ad), 0) + ad
    merkez = struct.pack("<4sHHHHHHIIIHHHHHII", b"PK\x01\x02", 20, 20, 0, 8, 0, 0, crc, len(veri), bildirilen, len(ad), 0, 0, 0, 0, 0, 0) + ad
    son = struct.pack("<4sHHHHIIH", b"PK\x05\x06", 0, 0, 1, 1, len(merkez), len(yerel) + len(veri), 0)
    with open(yol, "wb") as f:
        f.write(yerel + veri + merkez + son)
    return yol


def sinirsiz_acilan(yol):
    """Java'nın ZipInputStream'i gibi: yerel başlıkları sırayla okur, deflate öğesini akış bitene dek açar (bildirilen boyuta bakmadan).
    Döner: {ad: açılan bayt}."""
    import zlib
    with open(yol, "rb") as f:
        b = f.read()
    p, boylar = 0, {}
    while b[p:p + 4] == b"PK\x03\x04":
        bayrak, yontem = struct.unpack("<HH", b[p + 6:p + 10])
        sik, acik, adu, eku = struct.unpack("<IIHH", b[p + 18:p + 30])
        ad = b[p + 30:p + 30 + adu].decode("utf-8", "replace")
        v = p + 30 + adu + eku
        if yontem == 8:
            d, n, girdi = zlib.decompressobj(-15), 0, b[v:]
            while girdi and not d.eof:
                n += len(d.decompress(girdi, 1 << 20))
                girdi = d.unconsumed_tail
            boylar[ad] = n
            # akışın sonundan sonraki baytlar unused_data'da ya da (açma sınırı yüzünden) unconsumed_tail'de kalır
            p = len(b) - len(d.unused_data) - len(d.unconsumed_tail) if d.eof else len(b)
        else:
            boylar[ad] = acik
            p = v + sik
        if bayrak & 8:   # veri tanımlayıcısı (imzalı ya da imzasız)
            p += 16 if b[p:p + 4] == b"PK\x07\x08" else 12
    return boylar


def test_zip_bombasi(c, k, ude_var):
    """Boyutu küçük bildirilen content.xml (zip bombası): köprüye (ve UDE'nin kendi okuyucusuna) özgün zip değil, merkezî dizindeki boyutlarla
    yeniden paketlenmiş kopya verilir; Java'nın akış okuyucusu da bildirilenden fazlasını açamaz. UDE varsa (doğrudan modülle): JVM
    -Xmx128m ile başlatılır, bomba bellek hatası değil 'bozuk' verir ve yazıcı yoluna geçilmez."""
    from islemler import udf as U
    yol = bomba_udf(os.path.join(k, "bomba.udf"), 64 * 1024 * 1024)
    sonuc("bomba: özgün dosyada akış okuyucusu 64 MB açıyor (deneme girdisi doğru)", sinirsiz_acilan(yol).get("content.xml", 0) >= 64 * 1024 * 1024)
    kopru_girdisi = getattr(U, "_kopru_girdisi", None)
    if kopru_girdisi is None:
        sonuc("bomba: köprü girdisi yeniden paketleniyor (_kopru_girdisi)", False, "yok")
        return
    with kopru_girdisi(yol) as girdi:
        boylar = sinirsiz_acilan(girdi)
        klasor = os.path.dirname(girdi)
        sonuc("bomba: köprüye verilen kopyada content.xml bildirilen boyutta (900 bayt), adı aynı", girdi != yol and boylar.get("content.xml") == 900
              and os.path.basename(girdi) == "bomba.udf", (girdi, boylar))
    sonuc("bomba: geçici kopya iş bitince silindi", not os.path.exists(klasor), klasor)
    olagan = UdfYaz()
    olagan.paragraf("Olağan belge")
    oyol = olagan.yaz(os.path.join(k, "olagan.udf"))
    with zipfile.ZipFile(oyol) as z:
        once = {a: z.read(a) for a in z.namelist()}
    with kopru_girdisi(oyol) as girdi:
        with zipfile.ZipFile(girdi) as z:
            sonra = {a: z.read(a) for a in z.namelist()}
    sonuc("olağan UDF: kopyada bütün öğeler bayt bayt aynı", once == sonra and len(once) >= 1, (sorted(once), sorted(sonra)))
    duz = os.path.join(k, "duz.udf")
    with open(duz, "wb") as f:
        f.write(b'<?xml version="1.0" encoding="UTF-8" ?>\n<template format_id="1.7"></template>')
    with kopru_girdisi(duz) as girdi:
        sonuc("düz XML UDF olduğu gibi verilir", girdi == duz, girdi)
    if not ude_var or c.exe:
        atlandi("bomba: uçtan uca (UDE, -Xmx128m)", "UDE yok" if not ude_var else "yalnızca doğrudan modülle (JVM'in belleği değiştirilir)")
        return
    asil = U.subprocess.Popen

    def kucuk_yigin(komut, *a, **kw):
        if isinstance(komut, list) and any(str(x) == "pdefe.UdeKopru" for x in komut):
            komut = [("-Xmx128m" if str(x).startswith("-Xmx") else x) for x in komut]
        return asil(komut, *a, **kw)
    buyuk = bomba_udf(os.path.join(k, "buyuk_bomba.udf"), 256 * 1024 * 1024)
    U._oturumlar.hepsini_kapat()
    U.subprocess.Popen = kucuk_yigin
    eski_hata = sys.stderr
    yakala = io.StringIO()
    try:
        sys.stderr = yakala
        t0 = time.monotonic()
        r, _ = donustur(c, [{"yol": buyuk, "hedef": os.path.join(k, "bomba.pdf"), "hedefBicim": "pdf"}])
        sure = time.monotonic() - t0
    finally:
        sys.stderr = eski_hata
        U.subprocess.Popen = asil
        U._oturumlar.hepsini_kapat()
    o = r["sonuclar"][0]
    gunluk = yakala.getvalue()
    sonuc("bomba (uçtan uca, -Xmx128m): öğe 'bozuk' ile biter, bellek hatası yok, yazıcı yoluna geçilmez (%.1f sn)" % sure,
          o.get("kod") == "bozuk" and "OutOfMemory" not in gunluk and "yazıcıya geçiliyor" not in gunluk and not os.path.exists(os.path.join(k, "bomba.pdf")),
          (o.get("kod"), o.get("hata"), gunluk[-300:]))


# ---------------------------------------------------------------- PDF → UDF
def word_benzeri_pdf(yol, sayfa_no=True, yatay=False, ek_metin="", sayfa=3):
    """Word'ün dilekçe çıktısına benzeyen PDF (PyMuPDF'in yerleşimiyle; Times New Roman, iki yana yaslı, 2,5 cm kenar, sayfa numarası)."""
    arsiv = pymupdf.Archive(r"C:\Windows\Fonts") if WINDOWS else None
    css = ('@font-face {font-family: tnr; src: url(times.ttf);} @font-face {font-family: tnr; src: url(timesbd.ttf); font-weight: bold;} '
           'body {font-family: tnr; font-size: 12pt; line-height: 1.15; margin: 0;} p {text-align: justify; margin: 0 0 6pt 0; text-indent: 35pt;} '
           'h1 {text-align: center; font-size: 14pt; font-weight: bold; margin: 0 0 12pt 0;}') if WINDOWS else ""
    paragraflar = "".join("<p>%s</p>" % cumleler(100 + i + (1000 if yatay else 0), 2 + i % 3) for i in range(sayfa * 5))
    html = "<h1>DENEME MAHKEMESİ HÂKİMLİĞİNE</h1>" + ("<p>%s</p>" % ek_metin if ek_metin else "") + paragraflar
    story = pymupdf.Story(html=html, user_css=css, archive=arsiv)
    W, H = (841.89, 595.28) if yatay else (595.28, 841.89)
    yazici = pymupdf.DocumentWriter(yol)
    alan = pymupdf.Rect(70.87, 70.87, W - 70.87, H - 70.87)
    devam = True
    while devam:
        aygit = yazici.begin_page(pymupdf.Rect(0, 0, W, H))
        devam, _ = story.place(alan)
        story.draw(aygit)
        yazici.end_page()
    yazici.close()
    if sayfa_no:
        d = pymupdf.open(yol)
        n = d.page_count
        for i, pg in enumerate(d):
            metin = "%d/%d" % (i + 1, n)
            pg.insert_text((W - 70.87 - 20, H - 35), metin, fontname="tiro", fontsize=10)
        d.saveIncr()
        d.close()
    return yol


def tablolu_pdf(yol):
    """Çizgili tablolu belge (Word'ün tablosu gibi: başlık satırı, 8 satır, 3 sütun, ince çerçeve)."""
    arsiv = pymupdf.Archive(r"C:\Windows\Fonts") if WINDOWS else None
    css = ('@font-face {font-family: tnr; src: url(times.ttf);} @font-face {font-family: tnr; src: url(timesbd.ttf); font-weight: bold;} '
           'body {font-family: tnr; font-size: 12pt; margin: 0;} p {text-align: justify; margin: 0 0 6pt 0;} '
           'table {border-collapse: collapse; width: 100%;} td, th {border: 0.75pt solid black; padding: 2pt 4pt; font-size: 11pt; '
           'vertical-align: top;}') if WINDOWS else ""
    satirlar = "".join("<tr><td>%d</td><td>%s</td><td>%s</td></tr>" % (i + 1, cumleler(500 + i, 1)[:40 + 7 * i], "2099/%d" % (100 + i))
                       for i in range(8))
    html = ("<p>%s</p>" % cumleler(1, 3) + "<table><tr><th>Sıra</th><th>Delil</th><th>Dosya</th></tr>%s</table>" % satirlar +
            "<p>%s</p>" % cumleler(2, 4))
    story = pymupdf.Story(html=html, user_css=css, archive=arsiv)
    yazici = pymupdf.DocumentWriter(yol)
    devam = True
    while devam:
        aygit = yazici.begin_page(pymupdf.Rect(0, 0, 595.28, 841.89))
        devam, _ = story.place(pymupdf.Rect(70.87, 70.87, 524.41, 770.87))
        story.draw(aygit)
        yazici.end_page()
    yazici.close()
    return yol


def bolumlu_pdf(yol, bolum=3):
    """Her bölümü yeni sayfada başlayan, sayfa başlığı "Bölüm N" olan belge (Word'de bölüm başına sayfa sonu): başlıktaki sayı sayfa
    numarasıyla aynı, ama sayfa numarası değil (gövdenin başlığı)."""
    arsiv = pymupdf.Archive(r"C:\Windows\Fonts") if WINDOWS else None
    css = ('@font-face {font-family: tnr; src: url(times.ttf);} @font-face {font-family: tnr; src: url(timesbd.ttf); font-weight: bold;} '
           'body {font-family: tnr; font-size: 12pt; line-height: 1.15; margin: 0;} p {text-align: justify; margin: 0 0 6pt 0; text-indent: 35pt;} '
           'h1 {text-align: left; font-size: 14pt; font-weight: bold; margin: 0 0 12pt 0;}') if WINDOWS else ""
    yazici = pymupdf.DocumentWriter(yol)
    for i in range(bolum):
        html = "<h1>Bölüm %d</h1>" % (i + 1) + "".join("<p>%s</p>" % cumleler(300 + i * 5 + j, 3) for j in range(5))
        story = pymupdf.Story(html=html, user_css=css, archive=arsiv)
        devam = True
        while devam:
            aygit = yazici.begin_page(pymupdf.Rect(0, 0, 595.28, 841.89))
            devam, _ = story.place(pymupdf.Rect(70.87, 70.87, 524.41, 770.87))
            story.draw(aygit)
            yazici.end_page()
    yazici.close()
    return yol


def yalniz_tablo_pdf(yol):
    """Yazısının hepsi çizgili 3 × 3 tablonun hücrelerinde olan tek sayfa."""
    d = pymupdf.open()
    pg = d.new_page(width=595.28, height=841.89)
    xs, ys = (72, 222, 372, 522), (100, 130, 160, 190)
    for y in ys:
        pg.draw_line((xs[0], y), (xs[-1], y))
    for x in xs:
        pg.draw_line((x, ys[0]), (x, ys[-1]))
    for i in range(3):
        for j in range(3):
            pg.insert_text((xs[j] + 6, ys[i] + 20), "Hücre %d-%d" % (i + 1, j + 1), fontname="tiro", fontsize=11)
    d.save(yol)
    d.close()
    return yol


def bolunmus_cdata_pdf(yol):
    """"]]>" iki ayrı biçimli parçaya bölünmüş: "a]]" düz, ardından "> sonu" kalın."""
    d = pymupdf.open()
    pg = d.new_page(width=595.28, height=841.89)
    pg.insert_text((72, 100), "Dizi a]]", fontname="helv", fontsize=12)
    w = pymupdf.get_text_length("Dizi a]]", fontname="helv", fontsize=12)
    pg.insert_text((72 + w, 100), "> sonu", fontname="hebo", fontsize=12)
    pg.insert_text((72, 130), "İkinci satır olağan metin.", fontname="helv", fontsize=12)
    d.save(yol)
    d.close()
    return yol


def taranmis_pdf(yol):
    """Tek sayfalık taranmış (yazısız, 200 dpi) belge: yazı görüntü olarak."""
    kaynak = word_benzeri_pdf(yol + ".kaynak.pdf", sayfa_no=False, sayfa=1)
    d = pymupdf.open(kaynak)
    pix = d[0].get_pixmap(dpi=200, colorspace=pymupdf.csGRAY)
    d.close()
    yeni = pymupdf.open()
    pg = yeni.new_page(width=595.28, height=841.89)
    pg.insert_image(pg.rect, stream=pix.tobytes("png"))
    yeni.save(yol)
    yeni.close()
    return yol, kaynak


def udf_xml(yol):
    with zipfile.ZipFile(yol) as z:
        return z.read("content.xml").decode("utf-8")


def xml_denetle(ad, x):
    """content.xml'in yapısı: ön söz, format_id, CDATA'da ]]> yok, ofsetler havuzu kaplıyor ve geri gitmiyor, punto tam sayı."""
    sonuc("%s: ön söz ve format_id 1.8" % ad, x.startswith('<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >'))
    try:
        kok = ET.fromstring(x.encode("utf-8"))
    except ET.ParseError as e:
        sonuc("%s: XML iyi biçimli" % ad, False, e)
        return None
    havuz = kok.find("content").text or ""
    sonuc("%s: XML geçerli, tek havuz, ]]> yok" % ad, x.count("<![CDATA[") == 1 and "]]>" not in havuz)
    ofsetler = []
    for e in kok.find("elements").iter():
        if "startOffset" in e.attrib:
            ofsetler.append((int(e.attrib["startOffset"]), int(e.attrib["length"])))
    bitisik = all(ofsetler[i][0] + ofsetler[i][1] == ofsetler[i + 1][0] for i in range(len(ofsetler) - 1))
    utf16 = len(havuz.encode("utf-16-le")) // 2
    sonuc("%s: yapraklar havuzu boşluksuz, sırayla kaplıyor (UTF-16)" % ad, bitisik and ofsetler and ofsetler[0][0] == 0
          and ofsetler[-1][0] + ofsetler[-1][1] == utf16, (len(ofsetler), utf16))
    boylar = {e.attrib["size"] for e in kok.iter() if "size" in e.attrib}
    sonuc("%s: punto değerleri tam sayı (UDE 10,5'i 12 sayıyor)" % ad, all(re.fullmatch(r"\d+", b) for b in boylar), sorted(boylar))
    sonuc("%s: BMP dışı karakter yok" % ad, all(ord(ch) < 0x10000 for ch in havuz))
    return kok


def test_pdf_udf(c, k, ude_var):
    r, _ = c.cagir("donusum_yetenekleri", {})
    if not (r["donusumler"].get("pdf>udf") or {}).get("var"):
        atlandi("PDF → UDF", "bu sürümde yok")
        return
    girdiler = {
        "dilekce": word_benzeri_pdf(os.path.join(k, "dilekce.pdf")),
        "ozel": word_benzeri_pdf(os.path.join(k, "ozel.pdf"), sayfa_no=False, sayfa=1,
                                 ek_metin="Köşeli ]]> ayraç ve emoji %s %s yazısı." % (chr(0x1F600), chr(0x1F44D))),
        "yatay": word_benzeri_pdf(os.path.join(k, "yatay.pdf"), sayfa_no=False, yatay=True, sayfa=1),
        "tablolu": tablolu_pdf(os.path.join(k, "tablolu.pdf")),
        "bolumlu": bolumlu_pdf(os.path.join(k, "bolumlu.pdf")),
        "yalniz_tablo": yalniz_tablo_pdf(os.path.join(k, "yalniz_tablo.pdf")),
        "cdata": bolunmus_cdata_pdf(os.path.join(k, "cdata.pdf")),
    }
    ogeler = [{"yol": y, "hedef": os.path.join(k, a + ".udf"), "hedefBicim": "udf"} for a, y in girdiler.items()]
    r, _ = donustur(c, ogeler)
    sonuc("PDF → UDF: hepsi başarılı", r["basarili"] == len(ogeler), [o.get("hata") for o in r["sonuclar"] if "hata" in o])
    for a in girdiler:
        yol = os.path.join(k, a + ".udf")
        if not os.path.exists(yol):
            continue
        kok = xml_denetle(a, udf_xml(yol))
        if kok is None:
            continue
        pf = kok.find("properties/pageFormat").attrib
        if a == "yatay":
            sonuc("yatay PDF → paperOrientation 0", pf.get("paperOrientation") == "0", pf.get("paperOrientation"))
        if a == "dilekce":
            alt = kok.find("elements/footer")
            sonuc("tekrar eden sayfa numarası UDE'nin numarası oldu (footer pageNumber-spec, n/N)", alt is not None and
                  alt.attrib.get("pageNumber-spec") == "BSP32_2120", alt.attrib if alt is not None else None)
            sonuc("kenarlar 2,5 cm (70,87)", abs(float(pf["leftMargin"]) - 70.866) < 0.6 and abs(float(pf["rightMargin"]) - 70.866) < 1.1,
                  (pf["leftMargin"], pf["rightMargin"]))
        if a == "tablolu":
            tablo = kok.find("elements/table")
            sonuc("çizgili tablo UDF tablosu oldu (3 sütun, 9 satır, kenarlıklı)", tablo is not None and tablo.attrib.get("columnCount") == "3"
                  and len(tablo.findall("row")) == 9 and tablo.attrib.get("border") == "borderCell" and len(tablo.findall("row/cell")) == 27,
                  tablo.attrib if tablo is not None else None)
        if a == "ozel":
            havuz = kok.find("content").text
            sonuc("]]> metinde kaldı (araya sıfır genişlikli boşluk)", "]]" + chr(0x200B) + ">" in havuz)
        if a == "cdata":
            havuz = kok.find("content").text
            sonuc("iki biçimli parçaya bölünmüş ]]> CDATA'yı kapatmıyor (araya sıfır genişlikli boşluk)", "]]" + chr(0x200B) + ">" in havuz
                  and "sonu" in havuz, havuz[:60])
        if a == "bolumlu":
            havuz = kok.find("content").text or ""
            alt = kok.find("elements/footer")
            sonuc("'Bölüm N' başlıkları sayfa numarası sayılmıyor: gövdede kalır, alt bilgide sayfa numarası alanı yok",
                  all("Bölüm %d" % n in havuz for n in (1, 2, 3)) and (alt is None or "pageNumber-spec" not in alt.attrib),
                  alt.attrib if alt is not None else None)
            sonuc("'Bölüm N': alt bilgi uzaklığı sayfanın alt bölgesinde (footerFOffset ≤ %16 sayfa)", float(pf["footerFOffset"]) <= 0.16 * 841.89,
                  pf["footerFOffset"])
        if a == "yalniz_tablo":
            havuz = kok.find("content").text or ""
            tablo = kok.find("elements/table")
            sonuc("yalnızca tablodan oluşan belge çevrilir: 3 × 3 tablo, hücre yazıları", tablo is not None and tablo.attrib.get("columnCount") == "3"
                  and len(tablo.findall("row")) == 3 and all("Hücre %d-%d" % (i, j) in havuz for i in (1, 2, 3) for j in (1, 2, 3)),
                  tablo.attrib if tablo is not None else havuz[:80])
    if not c.exe:
        from islemler import udf_yaz as Y
        sonuc("BMP dışı karakter (emoji) U+FFFD olur, XML'de geçersiz denetim karakteri atılır",
              Y._metin_temizle("a" + chr(0x1F600) + "b" + chr(1) + "c") == "a" + chr(0xFFFD) + "bc")
    if not ude_var:
        atlandi("PDF → UDF → UDE", "UDE ya da Java yok")
        return
    geri = [{"yol": os.path.join(k, a + ".udf"), "hedef": os.path.join(k, a + "_ude.pdf"), "hedefBicim": "pdf"} for a in girdiler]
    if not c.exe:   # UDE'yi kilitleyen bir UDF (sayfanın tepesindeki alt bilgi) 180 sn beklemesin
        from islemler import udf as U
        eski_sure, U.BELGE_SURESI = U.BELGE_SURESI, 60.0
    try:
        r, _ = donustur(c, geri)
    finally:
        if not c.exe:
            U.BELGE_SURESI = eski_sure
    sonuc("üretilen UDF'lerin hepsini UDE açtı", r["basarili"] == len(geri), [o.get("hata") for o in r["sonuclar"] if "hata" in o])
    for a, kaynak in girdiler.items():
        cizim = os.path.join(k, a + "_ude.pdf")
        if not os.path.exists(cizim) or a == "cdata":   # cdata: sözcüğün içinde sıfır genişlikli boşluk (sözcük benzerliği ölçülmez)
            continue
        es, sap, kel, na, nb = satir_karsilastir(kaynak, cizim)
        ka, kb = pdf_ozeti(kaynak)["sayfa"], pdf_ozeti(cizim)["sayfa"]
        sonuc("%s: UDE'de sayfa sayısı aynı, sözcük benzerliği ≥ 0,98" % a, ka == kb and kel >= 0.98, {"sayfa": (ka, kb), "sözcük": round(kel, 3),
                                                                                                      "satır": (na, nb, es)})
        if a == "yatay":
            boy = pdf_ozeti(cizim)["boylar"][0]
            sonuc("yatay UDF UDE'de yatay çizildi", boy[0] > boy[1], boy)
        if a == "tablolu":
            d = pymupdf.open(cizim)
            tablolar = [(t.row_count, t.col_count) for t in d[0].find_tables().tables]
            d.close()
            sonuc("UDE tabloyu çizgili tablo olarak çizdi (9 × 3)", (9, 3) in tablolar, tablolar)


def test_json_kanali(exe, k):
    """Çekirdek süreci (betik ya da exe) PDF → UDF'te standart çıktıya yalnızca JSON yazar (PyMuPDF'in find_tables'ı ilk çağrıda bir
    öneri yazdırıyordu: ana süreçle konuşulan kanalı bozardı)."""
    pdf = tablolu_pdf(os.path.join(k, "kanal.pdf"))
    komut = [exe] if exe else [sys.executable, "-X", "utf8", os.path.join(CORE, "pdefe_core.py")]
    p = subprocess.Popen(komut, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    istek = {"id": 1, "method": "bicim_donustur", "params": {"ogeler": [{"yol": pdf, "hedef": os.path.join(k, "kanal.udf"), "hedefBicim": "udf"}]}}
    cikti, _ = p.communicate((json.dumps(istek, ensure_ascii=False) + "\n").encode("utf-8"), timeout=300)
    satirlar = [x for x in cikti.decode("utf-8", "replace").splitlines() if x.strip()]
    bozuk = []
    yanit = None
    for x in satirlar:
        try:
            m = json.loads(x)
            if m.get("id") == 1 and "result" in m:
                yanit = m["result"]
        except ValueError:
            bozuk.append(x[:80])
    sonuc("çekirdeğin standart çıktısı PDF → UDF (tablolu) sırasında yalnızca JSON", not bozuk and yanit is not None and yanit.get("basarili") == 1,
          bozuk or (yanit or {}).get("sonuclar"))


def test_taranmis(c, k, ude_var):
    r, _ = c.cagir("donusum_yetenekleri", {})
    if not (r["donusumler"].get("pdf>udf") or {}).get("var"):
        atlandi("taranmış PDF → UDF", "bu sürümde yok")
        return
    yol, kaynak = taranmis_pdf(os.path.join(k, "taranmis.pdf"))
    hedef = os.path.join(k, "taranmis.udf")
    r, _ = donustur(c, [{"yol": yol, "hedef": hedef, "hedefBicim": "udf"}])
    o = r["sonuclar"][0]
    if "hata" in o:
        sonuc("taranmış PDF → UDF", False, o["hata"])
        return
    x = udf_xml(hedef)
    kok = ET.fromstring(x.encode("utf-8"))
    havuz = kok.find("content").text or ""
    resim = kok.find(".//image") is not None
    if "tanınamadı" in (o.get("uyari") or ""):
        sonuc("tanıyıcı yok: sayfa resim öğesi, sonuçta uyarı", resim, o.get("uyari"))
        return
    d = pymupdf.open(kaynak)
    asil = d[0].get_text().split()
    d.close()
    kel = difflib.SequenceMatcher(None, asil, havuz.split(), autojunk=False).ratio()
    sonuc("taranmış sayfa yazı tanımayla düzenlenebilir paragraflar (sözcük benzerliği ≥ 0,9), uyarı var",
          not resim and kel >= 0.9 and "tanıma" in (o.get("uyari") or ""), {"sözcük": round(kel, 3), "uyarı": o.get("uyari")})


def test_derlem(c):
    """Gerçek belgelerle tur (PDEFE_UDF_DERLEM): UDF → PDF (UDE) → UDF → PDF (UDE); yalnızca sayılar."""
    kl = os.environ.get("PDEFE_UDF_DERLEM")
    if not kl:
        return
    k = temiz_klasor("derlem")
    udfler = [os.path.join(kl, a) for a in sorted(os.listdir(kl)) if a.lower().endswith(".udf")]
    t0 = time.time()
    r, _ = donustur(c, [{"yol": y, "hedef": os.path.join(k, "%03d.pdf" % i), "hedefBicim": "pdf"} for i, y in enumerate(udfler)])
    print("     derlem UDF → PDF: %d/%d başarılı, %.1f sn, sayfa toplamı %d" % (r["basarili"], len(udfler), time.time() - t0,
                                                                            sum(o.get("sayfa") or 0 for o in r["sonuclar"])))
    pdfler = [o["hedef"] for o in r["sonuclar"] if "hata" not in o]
    r, _ = donustur(c, [{"yol": y, "hedef": y[:-4] + ".udf", "hedefBicim": "udf"} for y in pdfler])
    r2, _ = donustur(c, [{"yol": y[:-4] + ".udf", "hedef": y[:-4] + "_tur.pdf", "hedefBicim": "pdf"} for y in pdfler])
    ayni = es99 = es95 = 0
    for y in pdfler:
        t = y[:-4] + "_tur.pdf"
        if not os.path.exists(t):
            continue
        _, _, kel, _, _ = satir_karsilastir(y, t)
        ayni += pdf_ozeti(y)["sayfa"] == pdf_ozeti(t)["sayfa"]
        es99 += kel >= 0.99
        es95 += kel >= 0.95
    print("     derlem PDF → UDF → PDF: UDE açtı %d/%d, sayfa sayısı aynı %d, sözcük ≥0,99 %d, ≥0,95 %d" % (r2["basarili"], len(pdfler), ayni,
                                                                                                    es99, es95))
    shutil.rmtree(k, ignore_errors=True)


def test_ornek():
    """PDEFE_UDF_ORNEK=<udf>;<kullanıcının Yazdır → PDF çıktısı>: satır satır karşılaştırma (yalnızca sayılar)."""
    deger = os.environ.get("PDEFE_UDF_ORNEK")
    if not deger or ";" not in deger:
        return
    udf_yol, iyi = deger.split(";", 1)
    k = temiz_klasor("ornek")
    c = Cagirici()
    r, _ = donustur(c, [{"yol": udf_yol, "hedef": os.path.join(k, "ornek.pdf"), "hedefBicim": "pdf"}])
    o = r["sonuclar"][0]
    if "hata" in o:
        sonuc("kullanıcının örneği", False, o["hata"])
        return
    es, sap, kel, na, nb = satir_karsilastir(iyi, o["hedef"])
    oz = pdf_ozeti(o["hedef"])
    print("     örnek: satır %d / %d, eşleşen %d, sapma %.2f pt, sözcük %.3f, sayfa %s, gömülü %d/%d, SMask %d"
          % (na, nb, es, sap or -1, kel, oz["boylar"][:1], oz["gomulu"], oz["yazi_tipi"], oz["smask"]))
    sonuc("kullanıcının örneği: satır konumları ≤ 0,5 pt, A4, gömülü, SMask yok", sap is not None and sap <= 0.5 and
          all(abs(b[0] - A4[0]) < 0.6 for b in oz["boylar"]) and oz["gomulu"] == oz["yazi_tipi"] and oz["smask"] == 0)
    shutil.rmtree(k, ignore_errors=True)


def main():
    exe = None
    if "--exe" in sys.argv:
        exe = os.path.abspath(sys.argv[sys.argv.index("--exe") + 1])
        if not os.path.isfile(exe):
            print("exe bulunamadı:", exe)
            return 2
    os.makedirs(CIKTI, exist_ok=True)
    test_kopru_jari()
    c = Cagirici(exe)
    print("Çağrı yolu:", exe or "doğrudan modül")
    ude_var = test_yetenekler(c)
    once = kullanici_ude_klasorleri()
    evler_once = gecici_evler()
    k = temiz_klasor("udf_pdf")
    g = udf_girdileri(temiz_klasor("girdi"))
    testler = []
    if ude_var:
        testler += [lambda: test_udf_pdf(c, g, k), lambda: test_yazici_konum(c, g, k), lambda: test_yorumlu(c, g, k),
                    lambda: test_hatalar(c, g, k),
                    lambda: test_iptal(c, g, temiz_klasor("iptal"))]
    else:
        atlandi("UDF → PDF", "UDE ya da Java bu bilgisayarda yok")
    testler += [lambda: test_pdf_udf(c, temiz_klasor("pdf_udf"), ude_var), lambda: test_taranmis(c, temiz_klasor("taranmis"), ude_var),
                lambda: test_ude_yok(c, g, k), lambda: test_json_kanali(exe, temiz_klasor("kanal")),
                lambda: test_zip_bombasi(c, temiz_klasor("bomba"), ude_var)]
    if ude_var:
        testler += [lambda: test_derlem(c)]
    for t in testler:
        try:
            t()
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            sonuc("İSTİSNA", False, repr(e))
    if ude_var:
        test_ornek()
    if not exe:
        from islemler import udf as U
        U.kapanirken()
    c.kapat()
    time.sleep(0.5)
    sonuc("kullanıcının .uki ve .sertifikadeposu klasörleri değişmedi", kullanici_ude_klasorleri() == once)
    kalan = [e for e in gecici_evler() if e not in evler_once]
    sonuc("köprünün geçici ev klasörleri silindi", not kalan, kalan)
    print("\nSonuç: %d/%d geçti%s." % (toplam - hata, toplam, ", %d HATA" % hata if hata else ""))
    return 1 if hata else 0


if __name__ == "__main__":
    sys.exit(main())
