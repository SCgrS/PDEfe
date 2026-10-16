# -*- coding: utf-8 -*-
"""Word ↔ PDF testi (0.2.6; core/islemler/word.py, core/islemler/pdf_word.py, core/ucuncu/pdf2docx). Girdilerin hepsi burada üretilir
(gerçek belge kullanılmaz; .docx / .rtf / .odt elle zip XML ile); çıktılar test/cikti/word_donusum altında.

Çalıştırma:  .venv\\Scripts\\python.exe test\\word_donusum_testi.py [--exe core\\dist\\pdefe-core\\pdefe-core.exe]
--exe: yöntemler paketlenmiş çekirdek üzerinden JSON-RPC ile çağrılır (modülün içine bakan denetimler atlanır).
Word kurulu değilse Word → PDF denetimleri "ATLANDI" yazar (LibreOffice yolu bu bilgisayarda sınanmadı).

Word → PDF: sayfa sayısı, gömülü yazı tipleri, başlıklardan yer imleri, etiketli PDF, yazar / başlık PDF'e geçmiyor, sözcük geri çağırma;
WINWORD süreç sayısı önce = sonra (kullanıcının Word'lerine dokunulmuyor), Normal.dotm değişmiyor, Word örneğinde makrolar kapalı
(AutomationSecurity = 3) ve görünmez, toplu işte tek Word örneği, parolalı belgede (sahte EncryptedPackage ve Word'ün kendi parolasıyla)
anlaşılır hata ve beklemeden dönüş, iptal ve süre aşımı (yalnız bizim Word'ümüz sonlanır, geçici dosya kalmaz), çekirdek öldürülünce Word'ün
de kapanması (iş nesnesi), "Word yok" benzetimi (PDEFE_WORD_YOK). PDF → Word: sözcük geri çağırma ≥ 0,97 (docx metni ve Word'le yeniden
PDF'e çevrilince), sayfa sayısı eşit, taranmış sayfa uyarısı, iptal, stdout'un yalnızca JSON olması; zincir Word → UDF ve UDF → Word;
pdf2docx kopyasında opencv'siz kontur ağacının OpenCV'nin sonucuyla aynı olması ve döndürmenin kayıpsızlığı.
"""
import collections
import hashlib
import io
import json
import os
import queue
import random
import re
import shutil
import subprocess
import sys
import threading
import time
import zipfile

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORE = os.path.join(KOK, "core")
sys.path.insert(0, CORE)
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
from ev_denetimi import word_icin_denetle  # noqa: E402

CIKTI = os.path.join(KOK, "test", "cikti", "word_donusum")
GIRDI = os.path.join(CIKTI, "girdi")
WINDOWS = sys.platform == "win32"
hata = toplam = 0
# Paketli çekirdek UDE köprüsünü resources/ude-kopru'da, derleme düzeninde (core/dist/pdefe-core) core/ude_kopru'da bulur; 0.2.9 denetiminden
# beri PDEFE_UDE_KOPRU'yu okumaz (udf.kopru_jari)
BASTA = set()   # testten önce çalışan Word süreçleri (kullanıcının); bizim örneğimiz kapanınca bu kümeye dönülmeli


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    if not ok:
        hata += 1
    print(("OK   " if ok else "HATA ") + ad + ("" if not ayrinti else " — " + str(ayrinti)))


def atlandi(ad, neden):
    print("ATLANDI " + ad + " — " + neden)


# ---------------------------------------------------------------- çağrı köprüsü
class CagriHatasi(Exception):
    def __init__(self, mesaj, kod=None):
        super().__init__(mesaj)
        self.kod = kod


class Cagirici:
    """Doğrudan (modül) ya da exe üzerinden JSON-RPC; ertelenmiş yanıtı bekler. iptal_et(ilerlemeler) doğru dönünce iptal edilir."""

    def __init__(self, exe=None):
        self.exe = exe
        self.sayac = 0
        if exe:
            self.surec = subprocess.Popen([exe], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                                          encoding="utf-8", bufsize=1)
        else:
            import pdefe_core
            self.cekirdek = pdefe_core

    def cagir(self, yontem, params, iptal_et=None, sure=600):
        ilerlemeler = []
        if self.exe:
            self.sayac += 1
            kimlik = self.sayac
            self.surec.stdin.write(json.dumps({"id": kimlik, "method": yontem, "params": params}, ensure_ascii=False) + "\n")
            self.surec.stdin.flush()
            iptal_edildi = False
            while True:
                satir = self.surec.stdout.readline()
                if not satir:
                    raise RuntimeError("exe kapandı")
                m = json.loads(satir)
                if m.get("id") != kimlik:
                    continue
                if "progress" in m:
                    ilerlemeler.append(m["progress"])
                    if iptal_et is not None and not iptal_edildi and iptal_et(ilerlemeler):
                        iptal_edildi = True
                        self.sayac += 1
                        self.surec.stdin.write(json.dumps({"id": self.sayac, "method": "iptal", "params": {"id": kimlik}}) + "\n")
                        self.surec.stdin.flush()
                    continue
                if "error" in m:
                    raise CagriHatasi(m["error"]["message"], m["error"].get("code"))
                return m["result"], ilerlemeler
        p = dict(params)
        bayrak = {"iptal": False}

        def ilerle(y, m=""):
            ilerlemeler.append({"yuzde": y, "mesaj": m})
            if iptal_et is not None and iptal_et(ilerlemeler):
                bayrak["iptal"] = True
        p["_ilerleme"] = ilerle
        p["_iptal_mi"] = lambda: bayrak["iptal"]
        try:
            r = self.cekirdek.YONTEMLER[yontem](p)
        except self.cekirdek.IptalEdildi:
            raise CagriHatasi("İşlem iptal edildi.", -32800)
        except Exception as e:
            raise CagriHatasi(str(e), -32000)
        if isinstance(r, self.cekirdek.Ertelenmis):
            olay, kutu = threading.Event(), {}
            r.baslat(lambda s, h: (kutu.update(s=s, h=h), olay.set()))
            if not olay.wait(sure):
                raise RuntimeError("ertelenmiş yanıt gelmedi")
            if kutu["h"] is not None:
                h = kutu["h"]
                raise CagriHatasi(str(h) or "İşlem iptal edildi.",
                                  -32800 if isinstance(h, (self.cekirdek.IptalEdildi, InterruptedError)) else -32000)
            r = kutu["s"]
        return r, ilerlemeler

    def kapat(self):
        if self.exe:
            self.surec.stdin.close()
            self.surec.wait(timeout=20)


class Surec:
    """Ayrı çekirdek süreci (betik ya da exe): ham stdout satırları da saklanır (JSON kanalının temizliği)."""

    def __init__(self, exe=None, ortam=None):
        komut = [exe] if exe else [sys.executable, "-X", "utf8", os.path.join(CORE, "pdefe_core.py")]
        self.p = subprocess.Popen(komut, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  env=dict(os.environ, PYTHONIOENCODING="utf-8", **(ortam or {})))
        self.satirlar = queue.Queue()
        self.ham = []
        self.bozuk = []
        threading.Thread(target=self._oku, daemon=True).start()
        self.sayac = 0

    def _oku(self):
        for satir in self.p.stdout:
            self.ham.append(satir)
            try:
                self.satirlar.put(json.loads(satir.decode("utf-8")))
            except ValueError:
                self.bozuk.append(satir)
        self.satirlar.put(None)

    def cagir(self, yontem, params, sure=300):
        self.sayac += 1
        kimlik = self.sayac
        self.p.stdin.write(json.dumps({"id": kimlik, "method": yontem, "params": params}, ensure_ascii=False).encode("utf-8") + b"\n")
        self.p.stdin.flush()
        son = time.time() + sure
        while time.time() < son:
            try:
                m = self.satirlar.get(timeout=max(0.05, son - time.time()))
            except queue.Empty:
                break
            if m is None:
                break
            if m.get("id") == kimlik and ("result" in m or "error" in m):
                if "error" in m:
                    raise CagriHatasi(m["error"]["message"], m["error"].get("code"))
                return m["result"]
        raise RuntimeError("yanıt gelmedi: %s" % yontem)

    def kapat(self, sure=20):
        try:
            self.p.stdin.close()
        except OSError:
            pass
        try:
            self.p.wait(timeout=sure)
        except subprocess.TimeoutExpired:
            self.p.kill()


# ---------------------------------------------------------------- girdi üretimi (zip XML)
SOZLER = ("dava dilekçe mahkeme karar taraf talep süre hüküm gerekçe itiraz tebliğ duruşma esas vekil tazminat alacak faiz bilirkişi "
          "rapor delil tanık tedbir haciz icra takip borçlu alacaklı şirket sözleşme fesih ihbar kıdem ücret ölçü yüzde günlük işçi "
          "işveren şubat ağustos çarşamba perşembe güneş özgür ilişkin işbu ödeme gün ay yıl").split()


def paragraflar(tohum, sayi, en_az=35, en_cok=60):
    r = random.Random(tohum)
    return [" ".join(r.choice(SOZLER) for _ in range(r.randint(en_az, en_cok))).capitalize() + "." for _ in range(sayi)]


def _xml(metin):
    return metin.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def docx_yaz(yol, sayfalar, yazar="PDEfe Sınama Yazarı", baslik="Sınama Başlığı", tablo=True):
    """sayfalar: [(başlık, [paragraf])]; her sayfa sayfa sonuyla ayrılır. Başlıklar Heading1 (yer imi), ilk sayfada 3×3 tablo."""
    govde = []
    for no, (bas, pler) in enumerate(sayfalar):
        if no:
            govde.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        govde.append('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>%s</w:t></w:r></w:p>' % _xml(bas))
        for p in pler:
            govde.append('<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>' % _xml(p))
        if tablo and no == 0:
            satirlar = []
            for i in range(3):
                hucre = "".join('<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>hücre %d %d</w:t></w:r></w:p></w:tc>'
                                % (i + 1, j + 1) for j in range(3))
                satirlar.append("<w:tr>%s</w:tr>" % hucre)
            kenar = "".join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="000000"/>' % k
                            for k in ("top", "left", "bottom", "right", "insideH", "insideV"))
            govde.append('<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>%s</w:tblBorders></w:tblPr>'
                         '<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>%s</w:tbl>'
                         '<w:p/>' % (kenar, "".join(satirlar)))
    belge = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document %s><w:body>%s'
             '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" '
             'w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>') % (W_NS, "".join(govde))
    stiller = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles %s>'
               '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
               '<w:sz w:val="24"/><w:lang w:val="tr-TR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr>'
               '</w:pPrDefault></w:docDefaults>'
               '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
               '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>'
               '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>'
               '<w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>') % W_NS
    tipler = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
              '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
              '<Default Extension="xml" ContentType="application/xml"/>'
              '<Override PartName="/word/document.xml" '
              'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
              '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
              '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>')
    iliski = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
              '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
              'Target="word/document.xml"/>'
              '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" '
              'Target="docProps/core.xml"/></Relationships>')
    belge_iliski = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
                    'Target="styles.xml"/></Relationships>')
    ozellik = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
               'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>%s</dc:title><dc:creator>%s</dc:creator></cp:coreProperties>'
               % (_xml(baslik), _xml(yazar)))
    with zipfile.ZipFile(yol, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", tipler)
        z.writestr("_rels/.rels", iliski)
        z.writestr("word/document.xml", belge)
        z.writestr("word/styles.xml", stiller)
        z.writestr("word/_rels/document.xml.rels", belge_iliski)
        z.writestr("docProps/core.xml", ozellik)


def temiz_klasor(ad):
    k = os.path.join(CIKTI, ad)
    shutil.rmtree(k, ignore_errors=True)
    os.makedirs(k)
    return k


SABLON_HEDEFI = "file:///\\\\sunucu.invalid\\paylasim\\Sablon.dotm"   # uzak şablon (ağa çıkılmaz: test Word'ü çalıştırmaz)


def sablonlu_docx(yol):
    """docx_yaz'ın belgesi + dış şablon (settings.xml'de w:attachedTemplate, ilişkisi TargetMode External) + dış köprü (korunmalı)."""
    docx_yaz(yol, [("Şablonlu belge", ["Bu belgenin şablonu uzak bir sunucuda."])], tablo=False)
    with zipfile.ZipFile(yol) as z:
        parcalar = [(b, z.read(b.filename)) for b in z.infolist()]
    ayar = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings %s '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:zoom w:percent="100"/>'
            '<w:attachedTemplate r:id="rId1"/><w:defaultTabStop w:val="708"/></w:settings>') % W_NS
    ayar_iliski = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" '
                   'Target="%s" TargetMode="External"/></Relationships>') % _xml(SABLON_HEDEFI)
    with zipfile.ZipFile(yol, "w", zipfile.ZIP_DEFLATED) as z:
        for b, veri in parcalar:
            if b.filename == "[Content_Types].xml":
                veri = veri.replace(b"</Types>", b'<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-'
                                    b'officedocument.wordprocessingml.settings+xml"/></Types>')
            if b.filename == "word/_rels/document.xml.rels":
                veri = veri.replace(b"</Relationships>", b'<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
                                    b'relationships/settings" Target="settings.xml"/><Relationship Id="rId10" Type="http://schemas.openxmlformats.org/'
                                    b'officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/" TargetMode="External"/>'
                                    b'</Relationships>')
            z.writestr(b.filename, veri)
        z.writestr("word/settings.xml", ayar)
        z.writestr("word/_rels/settings.xml.rels", ayar_iliski)
    return yol


def test_dis_sablon(k):
    """0.2.9 denetimi: Word → PDF'te Word'e verilen kopyada dış şablon bağlantısı yok (Word belgeyi açarken uzak şablonu aramasın: bekleme,
    açıldığının izi, UNC'de parola özeti). docx: attachedTemplate ilişkisi ve öğesi kalkar, dış köprü ve öteki parçalar aynı kalır, python-docx
    belgeyi açar; RTF: {\\*\\template …} grubu kalkar. Word çalıştırılmaz: dönüştürücünün Word adımı yerine kopyayı yakalayan bir sahte kullanılır."""
    print("— Dış şablon bağlantısı (0.2.9 denetimi)")
    from islemler import donustur as D
    from islemler import word as Wd
    yol = sablonlu_docx(os.path.join(k, "sablonlu.docx"))
    rtf = os.path.join(k, "sablonlu.rtf")
    rtf_yaz(rtf, [("Şablonlu RTF", ["Bu RTF belgesinin şablonu uzak bir sunucuda."])])
    with open(rtf, "rb") as f:
        rtf_veri = f.read()
    rtf_sablonlu = rtf_veri.replace(b"\\deff0", b"\\deff0{\\*\\template \\\\\\\\sunucu.invalid\\\\paylasim\\\\Sablon.dot}", 1)
    with open(rtf, "wb") as f:
        f.write(rtf_sablonlu)
    gorulen = {}

    def sahte_word_ile(kopya, pdf, ilerleme, ad):
        with open(kopya, "rb") as f:
            gorulen[os.path.splitext(kopya)[1]] = f.read()
        d = pymupdf.open()
        d.new_page()
        d.save(pdf)
        d.close()
        return {}
    eski_motor, eski_ile = Wd.motor, Wd._word_ile
    Wd.motor, Wd._word_ile = (lambda: "word"), sahte_word_ile
    try:
        for kaynak, alt in ((yol, "docx"), (rtf, "rtf")):
            b = D.Baglam(alt, D._Ilerleme({}))
            try:
                Wd._word_pdf(kaynak, os.path.join(k, "cikti_%s.pdf" % alt), {}, lambda *a: None, b)
            finally:
                b.temizle()
    finally:
        Wd.motor, Wd._word_ile = eski_motor, eski_ile
    kopya = gorulen.get(".docx")
    if kopya is None:
        sonuc("docx: Word'e verilen kopya yakalandı", False, sorted(gorulen))
        return
    with zipfile.ZipFile(io.BytesIO(kopya)) as z, zipfile.ZipFile(yol) as asil:
        ayar = z.read("word/settings.xml").decode("utf-8")
        ayar_iliski = z.read("word/_rels/settings.xml.rels").decode("utf-8")
        belge_iliski = z.read("word/_rels/document.xml.rels").decode("utf-8")
        ayni = [a for a in asil.namelist() if a not in ("word/settings.xml", "word/_rels/settings.xml.rels") and asil.read(a) != z.read(a)]
        adlar_ayni = z.namelist() == asil.namelist()
    sonuc("docx: kopyada attachedTemplate öğesi ve ilişkisi yok, uzak yol geçmiyor", "attachedTemplate" not in ayar and "attachedTemplate" not in ayar_iliski
          and "sunucu.invalid" not in ayar_iliski and "<w:zoom" in ayar and "defaultTabStop" in ayar, (ayar[-160:], ayar_iliski[-120:]))
    sonuc("docx: dış köprü ilişkisi ve öteki parçalar bayt bayt aynı, parça listesi aynı", "example.invalid" in belge_iliski and not ayni and adlar_ayni, ayni)
    try:
        import docx as python_docx
        python_docx.Document(io.BytesIO(kopya))
        sonuc("docx: temizlenen kopya geçerli bir Word belgesi (python-docx açıyor)", True)
    except Exception as e:  # noqa: BLE001
        sonuc("docx: temizlenen kopya geçerli bir Word belgesi (python-docx açıyor)", False, repr(e))
    with open(yol, "rb") as f:
        sonuc("docx: kullanıcının dosyası değişmedi (yalnızca kopya)", b"attachedTemplate" in zipfile.ZipFile(f).read("word/settings.xml"))
    r = gorulen.get(".rtf")
    sonuc("RTF: kopyada \\*\\template grubu yok, belgenin geri kalanı aynı", r is not None and b"\\template" not in r and r == rtf_veri, (r or b"")[:120])


def _rtf_kac(metin):
    return "".join(c if ord(c) < 128 and c not in "\\{}" else ("\\" + c if c in "\\{}" else "\\u%d?" % (ord(c) if ord(c) < 32768 else ord(c) - 65536))
                   for c in metin)


def rtf_yaz(yol, sayfalar):
    govde = []
    for no, (bas, pler) in enumerate(sayfalar):
        if no:
            govde.append("\\page ")
        govde.append("{\\b\\fs28 %s}\\par " % _rtf_kac(bas))
        for p in pler:
            govde.append("\\qj %s\\par " % _rtf_kac(p))
    with open(yol, "w", encoding="ascii") as f:
        f.write("{\\rtf1\\ansi\\ansicpg1254\\deff0{\\fonttbl{\\f0\\froman Times New Roman;}}\\paperw11906\\paperh16838"
                "\\margl1417\\margr1417\\margt1417\\margb1417\\f0\\fs24 %s}" % "".join(govde))


def odt_yaz(yol, sayfalar):
    ns = ('xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
          'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"')
    govde = []
    for no, (bas, pler) in enumerate(sayfalar):
        govde.append('<text:h text:outline-level="1" text:style-name="%s">%s</text:h>' % ("Kirik" if no else "Bas", _xml(bas)))
        govde += ['<text:p>%s</text:p>' % _xml(p) for p in pler]
    icerik = ('<?xml version="1.0" encoding="UTF-8"?><office:document-content %s office:version="1.2"><office:automatic-styles>'
              '<style:style style:name="Kirik" style:family="paragraph"><style:paragraph-properties fo:break-before="page"/>'
              '<style:text-properties fo:font-weight="bold"/></style:style>'
              '<style:style style:name="Bas" style:family="paragraph"><style:text-properties fo:font-weight="bold"/></style:style>'
              '</office:automatic-styles><office:body><office:text>%s</office:text></office:body></office:document-content>') % (ns, "".join(govde))
    liste = ('<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" '
             'manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>'
             '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>')
    with zipfile.ZipFile(yol, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/vnd.oasis.opendocument.text", compress_type=zipfile.ZIP_STORED)
        z.writestr("content.xml", icerik, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("META-INF/manifest.xml", liste, compress_type=zipfile.ZIP_DEFLATED)


def sahte_sifreli(yol):
    """Parolalı docx'in kabı: OLE2 imzası ve EncryptedPackage akışının adı (tür tespiti bunu arar; Word'e hiç gitmemeli)."""
    with open(yol, "wb") as f:
        f.write(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 504 + "EncryptedPackage".encode("utf-16-le") + b"\0" * 4096)


YAZI_TIPI = r"C:\Windows\Fonts\times.ttf" if WINDOWS else "/System/Library/Fonts/Supplemental/Times New Roman.ttf"


def sentetik_pdf(yol, sayfa=3, tohum=3):
    """Konumlu Türkçe metinli PDF (PyMuPDF): her sayfada başlık ve iki yana yaslı paragraflar."""
    doc = pymupdf.open()
    ad, dosya = ("tnr", YAZI_TIPI) if os.path.isfile(YAZI_TIPI) else ("helv", None)
    for s in range(sayfa):
        pg = doc.new_page(width=595.28, height=841.89)
        if dosya:
            pg.insert_font(fontname=ad, fontfile=dosya)
        pg.insert_text((72, 80), "Bölüm %d — sınama belgesi" % (s + 1), fontname=ad, fontsize=14)
        y = 110
        for p in paragraflar(tohum * 100 + s, 6, 30, 45):
            kutu = pymupdf.Rect(72, y, 523, y + 120)
            kalan = pg.insert_textbox(kutu, p, fontname=ad, fontsize=11, align=pymupdf.TEXT_ALIGN_JUSTIFY)
            y += 120 - max(kalan, 0) + 12
            if y > 760:
                break
    doc.save(yol)
    doc.close()


def taranmis_pdf(yol, sayfa=2):
    from PIL import Image, ImageDraw
    doc = pymupdf.open()
    for s in range(sayfa):
        im = Image.new("L", (1240, 1754), 255)
        d = ImageDraw.Draw(im)
        for i in range(30):
            d.rectangle((120, 150 + i * 48, 1100 - (i * 37) % 300, 170 + i * 48), fill=20)
        b = io.BytesIO()
        im.save(b, "PNG")
        pg = doc.new_page(width=595.28, height=841.89)
        pg.insert_image(pg.rect, stream=b.getvalue())
    doc.save(yol)
    doc.close()


def girdileri_uret():
    if os.path.isdir(CIKTI):
        shutil.rmtree(CIKTI, ignore_errors=True)
    os.makedirs(GIRDI, exist_ok=True)
    g = {}
    sayfalar = [("Bölüm %d" % (i + 1), paragraflar(10 + i, 5)) for i in range(3)]
    g["sayfalar"] = sayfalar
    g["docx"] = os.path.join(GIRDI, "dilekce.docx")
    docx_yaz(g["docx"], sayfalar)
    g["rtf"] = os.path.join(GIRDI, "dilekce.rtf")
    rtf_yaz(g["rtf"], sayfalar)
    g["odt"] = os.path.join(GIRDI, "dilekce.odt")
    odt_yaz(g["odt"], sayfalar)
    g["dilekce_sayfalar"] = [(b, paragraflar(20 + i, 5)) for i, b in enumerate(("AÇIKLAMALAR", "HUKUKİ SEBEPLER", "SONUÇ VE İSTEM"))]
    g["dilekce"] = os.path.join(GIRDI, "dilekce_basliklari.docx")
    docx_yaz(g["dilekce"], g["dilekce_sayfalar"])
    g["uzantisiz"] = os.path.join(GIRDI, "uzantisi_yanlis.pdf")   # içerik docx, uzantı .pdf: tür içerikten
    shutil.copyfile(g["docx"], g["uzantisiz"])
    g["buyuk"] = os.path.join(GIRDI, "buyuk.docx")
    docx_yaz(g["buyuk"], [("Bölüm %d" % (i + 1), paragraflar(1000 + i % 7, 6)) for i in range(400)], tablo=False)
    g["sifreli"] = os.path.join(GIRDI, "sifreli.docx")
    sahte_sifreli(g["sifreli"])
    g["pdf"] = os.path.join(GIRDI, "sentetik.pdf")
    sentetik_pdf(g["pdf"])
    g["pdf_uzun"] = os.path.join(GIRDI, "sentetik_uzun.pdf")
    sentetik_pdf(g["pdf_uzun"], sayfa=40, tohum=9)
    g["taranmis"] = os.path.join(GIRDI, "taranmis.pdf")
    taranmis_pdf(g["taranmis"])
    return g


# ---------------------------------------------------------------- ölçüler
NOKTA = re.compile(r"^[\W_]+|[\W_]+$")


def _kelime(t):
    return NOKTA.sub("", t).lower()


def pdf_sozcukleri(yol):
    d = pymupdf.open(yol, filetype="pdf")
    try:
        return [k for pg in d for k in (_kelime(w[4]) for w in pg.get_text("words", sort=True)) if k]
    finally:
        d.close()


def metin_sozcukleri(metinler):
    return [k for m in metinler for k in (_kelime(t) for t in m.split()) if k]


def docx_metni(yol):
    with zipfile.ZipFile(yol) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    parcalar = re.split(r"</w:p>", xml)
    return [re.sub(r"<[^>]+>", "", re.sub(r"<w:tab/>", " ", p)).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            for p in parcalar]


def geri_cagirma(ozgun, aday):
    a, b = collections.Counter(ozgun), collections.Counter(aday)
    return sum((a & b).values()) / max(1, sum(a.values()))


def pdf_ozeti(yol):
    d = pymupdf.open(yol, filetype="pdf")
    try:
        fontlar = {}
        for pg in d:
            for f in pg.get_fonts(full=True):
                fontlar[f[0]] = f[1]
        md = d.metadata or {}
        return {"sayfa": d.page_count, "font": len(fontlar), "gomulu": sum(1 for v in fontlar.values() if v not in ("n/a", "")),
                "yer_imi": len(d.get_toc()), "etiketli": "StructTreeRoot" in d.xref_object(d.pdf_catalog()),
                "yazar": md.get("author") or "", "baslik": md.get("title") or ""}
    finally:
        d.close()


def gecici_kalintilar(klasor):
    return [a for a in os.listdir(klasor) if "pdefe-tmp" in a]


def word_surecleri():
    if not WINDOWS:
        return set()
    from islemler import word
    return word.word_pidleri()


def word_kapanmasini_bekle(onceki, sure=25):
    """Word süreçleri `onceki` kümesine dönene dek bekler (boştaki örnek BOSTA_KAPAT sn sonra kapanır, Quit'ten sonra 2–3 sn)."""
    son = time.time() + sure
    while time.time() < son:
        simdi = word_surecleri()
        if simdi == onceki:
            return True, simdi
        time.sleep(0.5)
    return False, word_surecleri()


def normal_dotm():
    yol = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Templates", "Normal.dotm")
    if not os.path.isfile(yol):
        return None
    with open(yol, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest(), os.path.getmtime(yol)


def donustur(c, ogeler, **k):
    r, il = c.cagir("bicim_donustur", {"ogeler": ogeler}, **k)
    return r, il


# ---------------------------------------------------------------- testler
def test_yetenekler(c):
    y, _ = c.cagir("donusum_yetenekleri", {})
    w, pw = y.get("word") or {}, y.get("pdf_word") or {}
    print("     word: %s" % json.dumps({k: w.get(k) for k in ("var", "motor", "neden")}, ensure_ascii=False))
    sonuc("yetenek: pdf_word var, motor pdf2docx", pw.get("var") is True and pw.get("motor") == "pdf2docx", pw)
    sonuc("yetenek: word anahtarları (var, motor, word, libreoffice)", all(k in w for k in ("var", "motor", "word", "libreoffice")), w)
    d = y.get("donusumler") or {}
    sonuc("dönüşümler: pdf>word var", d.get("pdf>word", {}).get("var") is True, d.get("pdf>word"))
    sonuc("dönüşümler: word>pdf, word>udf, udf>word listede", all(k in d for k in ("word>pdf", "word>udf", "udf>word")), sorted(d))
    sonuc("girdi uzantıları: Word", (y.get("girdiUzantilari") or {}).get("word") == [".docx", ".docm", ".doc", ".rtf", ".odt"]
          if w.get("var") else True, (y.get("girdiUzantilari") or {}).get("word"))
    return w


def test_word_pdf(c, g, exe):
    klasor = os.path.join(CIKTI, "word_pdf")
    os.makedirs(klasor, exist_ok=True)
    onceki = BASTA
    dotm = normal_dotm()
    ozgun = metin_sozcukleri([b for b, pler in g["sayfalar"] for b in [b] + pler])
    ogeler = [{"yol": g[t], "hedef": os.path.join(klasor, t + ".pdf"), "hedefBicim": "pdf"} for t in ("docx", "rtf", "odt", "uzantisiz")]
    t0 = time.time()
    r, il = donustur(c, ogeler)
    sure = time.time() - t0
    for oge, s in zip(ogeler, r["sonuclar"]):
        ad = os.path.basename(oge["yol"])
        if "hata" in s:
            sonuc("Word → PDF %s" % ad, False, s)
            continue
        o = pdf_ozeti(oge["hedef"])
        gc = geri_cagirma(ozgun, pdf_sozcukleri(oge["hedef"]))
        sonuc("Word → PDF %s: 3 sayfa (sonuç ve PDF), motor word" % ad, s.get("sayfa") == 3 and o["sayfa"] == 3 and s.get("motor") == "word",
              (s.get("sayfa"), o["sayfa"], s.get("motor")))
        sonuc("Word → PDF %s: yazı tiplerinin hepsi gömülü" % ad, o["font"] > 0 and o["gomulu"] == o["font"], o)
        sonuc("Word → PDF %s: sözcük geri çağırma ≥ 0,99" % ad, gc >= 0.99, round(gc, 4))
        sonuc("Word → PDF %s: yazar ve başlık PDF'e geçmedi" % ad, not o["yazar"] and not o["baslik"], (o["yazar"], o["baslik"]))
        if oge["yol"].endswith((".docx", ".pdf")):
            sonuc("Word → PDF %s: başlıklardan yer imi, etiketli PDF" % ad, o["yer_imi"] >= 3 and o["etiketli"], o)
    sonuc("Word → PDF: 4 belge tek seferde (tek Word örneği) %.1f sn" % sure, sure < 40, "%.1f sn" % sure)
    baslatan = {m.split(":")[0] for m in (x["mesaj"] for x in il) if "Word başlatılıyor" in m}
    sonuc("ilerleme: Word yalnız ilk belgede başlatıldı (toplu işte tek örnek)", baslatan <= {"(1/4) dilekce.docx"}, sorted(baslatan))
    sonuc("geçici dosya kalmadı", not gecici_kalintilar(klasor), gecici_kalintilar(klasor))
    if not exe:
        from islemler import word
        ayar = word.word_ayarlari()
        if ayar is None:
            atlandi("Word örneğinin ayarları", "örnek çoktan kapanmış")
        else:
            sonuc("Word örneği: makrolar kapalı (AutomationSecurity 3), uyarılar kapalı, görünmez",
                  ayar.get("AutomationSecurity") == 3 and ayar.get("DisplayAlerts") == 0 and ayar.get("Visible") is False, ayar)
    ok, simdi = word_kapanmasini_bekle(onceki)
    sonuc("WINWORD süreçleri önce = sonra (boştaki örnek kendiliğinden kapandı)", ok, (sorted(onceki), sorted(simdi)))
    if dotm is None:
        atlandi("Normal.dotm değişmedi", "Normal.dotm bu kullanıcıda yok")
    else:
        sonuc("Normal.dotm değişmedi", normal_dotm() == dotm)


def parolali_docx_uret(kaynak, hedef):
    """Word'ün kendisiyle (ayrı, görünmez örnek) parola koruması: SaveAs2(Password). Yalnız modül kipinde."""
    from islemler import word
    kutu = {}

    def is_():
        comtypes, a = word._com()
        comtypes.CoInitializeEx(comtypes.COINIT_APARTMENTTHREADED)
        w = word._Disp(comtypes.CoCreateInstance(comtypes.GUID.from_progid("Word.Application"), interface=a.IDispatch,
                                                 clsctx=comtypes.CLSCTX_LOCAL_SERVER))
        try:
            w.ver("DisplayAlerts", 0)
            w.ver("AutomationSecurity", 3)
            d = w.al("Documents").cagir("Open", kaynak, False, False, False)
            d.cagir("SaveAs2", hedef, 12, False, "sinama-parolasi")
            d.cagir("Close", 0)
            kutu["ok"] = True
        except Exception as e:
            kutu["hata"] = e
        finally:
            try:
                w.cagir("Quit", 0)
            except Exception:
                pass
            w = d = None
    t = threading.Thread(target=is_)
    t.start()
    t.join(120)
    return kutu.get("ok", False)


def test_parolali(c, g, exe):
    klasor = os.path.join(CIKTI, "parolali")
    os.makedirs(klasor, exist_ok=True)
    t0 = time.time()
    r, _ = donustur(c, [{"yol": g["sifreli"], "hedef": os.path.join(klasor, "sifreli.pdf"), "hedefBicim": "pdf"}])
    s = r["sonuclar"][0]
    sonuc("parolalı (EncryptedPackage): kod parolali, Word'e gitmeden", s.get("kod") == "parolali" and time.time() - t0 < 5,
          (s.get("kod"), s.get("hata"), round(time.time() - t0, 2)))
    if exe:
        return
    yol = os.path.join(GIRDI, "parolali_word.docx")
    word_kapanmasini_bekle(BASTA)
    if not parolali_docx_uret(g["docx"], yol):
        atlandi("Word'ün parolasıyla korunan belge", "üretilemedi")
        return
    word_kapanmasini_bekle(BASTA)
    t0 = time.time()
    r, _ = donustur(c, [{"yol": yol, "hedef": os.path.join(klasor, "parolali_word.pdf"), "hedefBicim": "pdf"}])
    s = r["sonuclar"][0]
    sonuc("Word parolası: kod parolali, anlaşılır ileti, beklemeden", s.get("kod") == "parolali" and "parola" in (s.get("hata") or "")
          and time.time() - t0 < 30, (s.get("kod"), s.get("hata"), round(time.time() - t0, 1)))
    sonuc("Word parolası: hedef oluşmadı", not os.path.exists(os.path.join(klasor, "parolali_word.pdf")))


def test_iptal(c, g):
    klasor = os.path.join(CIKTI, "iptal")
    os.makedirs(klasor, exist_ok=True)
    onceki = BASTA
    hedef = os.path.join(klasor, "buyuk.pdf")
    t0 = time.time()
    try:
        donustur(c, [{"yol": g["buyuk"], "hedef": hedef, "hedefBicim": "pdf"}],
                 iptal_et=lambda il: any("PDF'e çevriliyor" in x["mesaj"] for x in il))
        sonuc("Word → PDF iptal (çevirme sırasında)", False, "iptal edilmeden bitti")
    except CagriHatasi as e:
        sonuc("Word → PDF iptal (çevirme sırasında): -32800", e.kod == -32800, (e.kod, str(e), round(time.time() - t0, 1)))
    ok, simdi = word_kapanmasini_bekle(onceki, 10)
    sonuc("iptal: bizim Word sürecimiz sonlandı, öteki Word'ler yerinde", ok, (sorted(onceki), sorted(simdi)))
    sonuc("iptal: hedef ve geçici dosya yok", not os.path.exists(hedef) and not gecici_kalintilar(klasor), os.listdir(klasor))
    # iptalden sonra yeni dönüştürme olağan yoldan çalışır
    r, _ = donustur(c, [{"yol": g["docx"], "hedef": os.path.join(klasor, "sonra.pdf"), "hedefBicim": "pdf"}])
    sonuc("iptalden sonra yeni dönüştürme", r["basarili"] == 1, r["sonuclar"][0].get("hata"))


def test_zaman_asimi(c, g):
    from islemler import word
    klasor = os.path.join(CIKTI, "zaman_asimi")
    os.makedirs(klasor, exist_ok=True)
    onceki_word = BASTA
    eski = word.CEVIRME_SURESI, word.SAYFA_SURESI
    word.CEVIRME_SURESI, word.SAYFA_SURESI = 1.0, 0.0
    try:
        r, _ = donustur(c, [{"yol": g["buyuk"], "hedef": os.path.join(klasor, "buyuk.pdf"), "hedefBicim": "pdf"}])
    finally:
        word.CEVIRME_SURESI, word.SAYFA_SURESI = eski
    s = r["sonuclar"][0]
    sonuc("süre aşımı: kod zaman_asimi", s.get("kod") == "zaman_asimi", (s.get("kod"), s.get("hata")))
    ok, simdi = word_kapanmasini_bekle(onceki_word, 10)
    sonuc("süre aşımı: bizim Word sürecimiz sonlandı", ok, (sorted(onceki_word), sorted(simdi)))
    sonuc("süre aşımı: geçici dosya yok", not gecici_kalintilar(klasor), os.listdir(klasor))


def test_cokme(exe, g):
    """Çekirdek öldürülünce (PDEfe çökmesi) boştaki Word örneği iş nesnesiyle kapanır."""
    klasor = os.path.join(CIKTI, "cokme")
    os.makedirs(klasor, exist_ok=True)
    word_kapanmasini_bekle(BASTA)
    onceki = BASTA
    s = Surec(exe)
    try:
        r = s.cagir("bicim_donustur", {"ogeler": [{"yol": g["docx"], "hedef": os.path.join(klasor, "a.pdf"), "hedefBicim": "pdf"}]})
        yeni = word_surecleri() - onceki
        sonuc("çökme benzetimi: dönüştürmeden sonra Word örneği boşta açık", r["basarili"] == 1 and len(yeni) == 1, sorted(yeni))
        t0 = time.time()
        s.p.kill()
        s.p.wait(10)
        ok, simdi = word_kapanmasini_bekle(onceki, 5)
        sonuc("çökme benzetimi: çekirdek öldürülünce Word de kapandı (%.1f sn)" % (time.time() - t0), ok, (sorted(onceki), sorted(simdi)))
    finally:
        if s.p.poll() is None:
            s.p.kill()


def test_word_yok(exe, g):
    s = Surec(exe, {"PDEFE_WORD_YOK": "1"})
    try:
        y = s.cagir("donusum_yetenekleri", {})
        w = y.get("word") or {}
        sonuc("Word yok benzetimi: word.var false, açıklama", w.get("var") is False and "Word ya da LibreOffice" in (w.get("neden") or ""), w)
        d = y.get("donusumler") or {}
        sonuc("Word yok benzetimi: word>pdf kapalı, pdf>word açık", d.get("word>pdf", {}).get("var") is False and
              d.get("pdf>word", {}).get("var") is True, (d.get("word>pdf"), d.get("pdf>word")))
        b = s.cagir("donusum_bilgi", {"yol": g["docx"]})
        h = {x["bicim"]: x for x in b.get("hedefler", [])}
        sonuc("Word yok benzetimi: donusum_bilgi yanıtında PDF hedefi soluk ve açıklamalı", h.get("pdf", {}).get("var") is False and h["pdf"].get("neden"), h.get("pdf"))
        r = s.cagir("bicim_donustur", {"ogeler": [{"yol": g["docx"], "hedef": os.path.join(CIKTI, "yok.pdf"), "hedefBicim": "pdf"}]})
        sonuc("Word yok benzetimi: dönüştürme kod desteklenmiyor", r["sonuclar"][0].get("kod") == "desteklenmiyor", r["sonuclar"][0])
    finally:
        s.kapat()


def test_pdf_word(c, g, word_var):
    klasor = os.path.join(CIKTI, "pdf_word")
    os.makedirs(klasor, exist_ok=True)
    hedef = os.path.join(klasor, "sentetik.docx")
    r, il = donustur(c, [{"yol": g["pdf"], "hedef": hedef, "hedefBicim": "word"}])
    s = r["sonuclar"][0]
    if "hata" in s:
        sonuc("PDF → Word", False, s)
        return
    ozgun = pdf_sozcukleri(g["pdf"])
    gc = geri_cagirma(ozgun, metin_sozcukleri(docx_metni(hedef)))
    sonuc("PDF → Word: sonuç (sayfa 3, taranmış 0, atlanan yok, uyarı yok)", s.get("sayfa") == 3 and s.get("taranmisSayfa") == 0 and
          s.get("atlananSayfalar") == [] and not s.get("uyari"), s)
    sonuc("PDF → Word: docx metninde sözcük geri çağırma ≥ 0,97", gc >= 0.97, round(gc, 4))
    sonuc("PDF → Word: sayfa sayfa ilerleme", sum(1 for x in il if "çözümleniyor" in x["mesaj"]) >= 3, len(il))
    with zipfile.ZipFile(hedef) as z:
        sonuc("PDF → Word: geçerli docx (document.xml, styles.xml)", {"word/document.xml", "word/styles.xml"} <= set(z.namelist()))
    if word_var:
        geri = os.path.join(klasor, "sentetik_geri.pdf")
        r2, _ = donustur(c, [{"yol": hedef, "hedef": geri, "hedefBicim": "pdf"}])
        if "hata" in r2["sonuclar"][0]:
            sonuc("PDF → Word → PDF (Word'le)", False, r2["sonuclar"][0])
        else:
            gc2 = geri_cagirma(ozgun, pdf_sozcukleri(geri))
            sonuc("PDF → Word → PDF: sayfa sayısı eşit (3)", pdf_ozeti(geri)["sayfa"] == 3, pdf_ozeti(geri)["sayfa"])
            sonuc("PDF → Word → PDF: sözcük geri çağırma ≥ 0,97", gc2 >= 0.97, round(gc2, 4))
    else:
        atlandi("PDF → Word → PDF (Word'le)", "Word yok")
    # taranmış
    hedef = os.path.join(klasor, "taranmis.docx")
    r, _ = donustur(c, [{"yol": g["taranmis"], "hedef": hedef, "hedefBicim": "word"}])
    s = r["sonuclar"][0]
    with zipfile.ZipFile(hedef) as z:
        resim = sum(1 for n in z.namelist() if n.startswith("word/media/"))
    sonuc("PDF → Word taranmış: 2 sayfa taranmış, uyarı, sayfalar resim", s.get("taranmisSayfa") == 2 and "taranmış" in (s.get("uyari") or "")
          and resim >= 1, (s.get("taranmisSayfa"), s.get("uyari"), resim))
    sonuc("geçici dosya kalmadı", not gecici_kalintilar(klasor), gecici_kalintilar(klasor))


def test_pdf_word_iptal(c, g):
    klasor = os.path.join(CIKTI, "pdf_word_iptal")
    os.makedirs(klasor, exist_ok=True)
    hedef = os.path.join(klasor, "uzun.docx")
    try:
        donustur(c, [{"yol": g["pdf_uzun"], "hedef": hedef, "hedefBicim": "word"}],
                 iptal_et=lambda il: any("10/40" in x["mesaj"] for x in il))
        sonuc("PDF → Word iptal", False, "iptal edilmeden bitti")
    except CagriHatasi as e:
        sonuc("PDF → Word iptal: -32800", e.kod == -32800, (e.kod, str(e)))
    sonuc("PDF → Word iptal: hedef ve geçici dosya yok", not os.path.exists(hedef) and not gecici_kalintilar(klasor), os.listdir(klasor))


def test_kanal(exe, g, word_var):
    """Çekirdeğin stdout'u yalnızca JSON (pdf2docx'in iletileri, fitz uyarısı, Word iletileri stdout'a girmez)."""
    klasor = os.path.join(CIKTI, "kanal")
    os.makedirs(klasor, exist_ok=True)
    s = Surec(exe)
    try:
        ogeler = [{"yol": g["pdf"], "hedef": os.path.join(klasor, "a.docx"), "hedefBicim": "word"},
                  {"yol": g["taranmis"], "hedef": os.path.join(klasor, "b.docx"), "hedefBicim": "word"}]
        if word_var:
            ogeler.append({"yol": g["docx"], "hedef": os.path.join(klasor, "c.pdf"), "hedefBicim": "pdf"})
        r = s.cagir("bicim_donustur", {"ogeler": ogeler})
        sonuc("kanal: dönüştürmeler bitti", r["basarili"] == len(ogeler), [x.get("hata") for x in r["sonuclar"]])
    finally:
        s.kapat()
    sonuc("kanal: stdout'ta JSON olmayan satır yok", not s.bozuk and s.ham, [x[:120] for x in s.bozuk[:3]])


def _zincir(c, docx, sayfalar, klasor, ad, etiket):
    """Word → UDF → Word (ikisi de PDF üzerinden); döner: (UDF ok, Word ok)."""
    udf = os.path.join(klasor, ad + ".udf")
    r, _ = donustur(c, [{"yol": docx, "hedef": udf, "hedefBicim": "udf"}])
    s = r["sonuclar"][0]
    sonuc("zincir%s Word → UDF (PDF üzerinden)" % etiket, "hata" not in s and zipfile.is_zipfile(udf), s.get("hata"))
    if "hata" in s:
        return
    with zipfile.ZipFile(udf) as z:
        icerik = z.read("content.xml").decode("utf-8", "replace")
    ozgun = metin_sozcukleri([b for b, pler in sayfalar for b in [b] + pler])
    gc = geri_cagirma(ozgun, metin_sozcukleri([icerik]))
    sonuc("zincir%s Word → UDF: metin UDF'te (geri çağırma ≥ 0,97)" % etiket, gc >= 0.97, round(gc, 4))
    docx_geri = os.path.join(klasor, ad + "_geri.docx")
    r, _ = donustur(c, [{"yol": udf, "hedef": docx_geri, "hedefBicim": "word"}])
    s = r["sonuclar"][0]
    sonuc("zincir%s UDF → Word (PDF üzerinden)" % etiket, "hata" not in s and zipfile.is_zipfile(docx_geri), s.get("hata"))
    if "hata" not in s:
        gc = geri_cagirma(ozgun, metin_sozcukleri(docx_metni(docx_geri)))
        sonuc("zincir%s UDF → Word: metin docx'te (geri çağırma ≥ 0,97)" % etiket, gc >= 0.97, round(gc, 4))


def test_zincir(c, g, exe):
    klasor = os.path.join(CIKTI, "zincir")
    os.makedirs(klasor, exist_ok=True)
    y, _ = c.cagir("donusum_yetenekleri", {})
    d = y.get("donusumler") or {}
    for yon in ("word>udf", "udf>word"):
        if not d.get(yon, {}).get("var"):
            atlandi("zincir " + yon, (d.get(yon) or {}).get("neden") or "yok")
            return
    _zincir(c, g["dilekce"], g["dilekce_sayfalar"], klasor, "dilekce", "")
    if not exe:
        # Başlıkları "Bölüm 1", "Bölüm 2"… olan belge: PDF → UDF bunları sayfa numarası sanıp alt bilgiyi sayfanın tepesine koyuyordu, UDE o
        # UDF'te yanıt vermiyordu (0.2.6'da düzeldi: sayfa numarası yalnızca alt bölgede aranır). Gerilerse 180 sn beklenmesin: 30 sn sınır
        from islemler import udf as udf_modulu
        eski = udf_modulu.BELGE_SURESI
        udf_modulu.BELGE_SURESI = 30.0
        try:
            _zincir(c, g["docx"], g["sayfalar"], klasor, "bolumlu", " (başlıkları 'Bölüm N' olan belge)")
        finally:
            udf_modulu.BELGE_SURESI = eski
    sonuc("zincir: geçici dosya kalmadı", not gecici_kalintilar(klasor), gecici_kalintilar(klasor))


def test_kontur():
    """opencv'siz kontur ağacı: OpenCV 5.0 findContours(RETR_TREE)'in bu görüntüdeki sonucuyla (düzey, boundingRect, sıra) aynı."""
    import numpy as np
    from ucuncu.pdf2docx.common.algorithm import contour_tree, inner_contours
    a = np.zeros((40, 60), np.uint8)
    a[2:20, 2:25] = 255
    a[3:19, 3:24] = 0
    a[5:8, 5:8] = 255
    a[5:8, 15:18] = 255
    a[12:15, 5:8] = 255
    a[1:30, 30:50] = 255
    a[4:10, 33:40] = 0
    a[15:25, 33:47] = 0
    a[20:22, 40:42] = 255
    a[32:36, 1:5] = 255
    beklenen = [(0, (1, 32, 4, 4)), (0, (2, 2, 23, 18)), (1, (2, 2, 23, 18)), (2, (5, 12, 3, 3)), (2, (15, 5, 3, 3)), (2, (5, 5, 3, 3)),
                (0, (30, 1, 20, 29)), (1, (32, 14, 16, 12)), (2, (40, 20, 2, 2)), (1, (32, 3, 9, 8))]   # cv2 5.0.0 çıktısı
    sonuc("kontur ağacı OpenCV ile aynı (düzey, kutu, sıra)", contour_tree(a) == beklenen, contour_tree(a))
    sonuc("inner_contours", inner_contours(a, (0, 0, 60, 40), 2, 2) == [(5, 12, 8, 15), (15, 5, 18, 8), (5, 5, 8, 8), (40, 20, 42, 22)],
          inner_contours(a, (0, 0, 60, 40), 2, 2))
    # boş ve tek piksel
    sonuc("kontur ağacı: boş görüntü", contour_tree(np.zeros((5, 5), np.uint8)) == [])
    b = np.zeros((5, 5), np.uint8)
    b[2, 2] = 1
    sonuc("kontur ağacı: tek piksel", contour_tree(b) == [(0, (2, 2, 1, 1))], contour_tree(b))


def test_bolge_agaci():
    """inner_contours'un bölge ağacı (0.2.6): yalnızca bölgenin kırpığında kurulan ağaç, bölge dışı sıfırlanmış bütün görüntüdekiyle aynı
    (rastgele görüntüler ve kenara değen / boş / taşan bölgeler); çok sayıda küçük bölgede süre bölge boyuyla orantılı."""
    import numpy as np
    from ucuncu.pdf2docx.common.algorithm import bolge_agaci, contour_tree

    def eski(img, bbox):   # 0.2.5'e dek: sayfa boyunda maske
        x0, y0, x1, y1 = bbox
        arr = np.zeros(img.shape, dtype=np.uint8)
        arr[y0:y1, x0:x1] = img[y0:y1, x0:x1]
        return contour_tree(arr)
    rnd = np.random.RandomState(26)
    farkli = []
    for n in range(60):
        h, w = rnd.randint(8, 70), rnd.randint(8, 90)
        img = ((rnd.rand(h, w) > rnd.uniform(0.3, 0.8)) * 255).astype(np.uint8)
        for _ in range(6):
            x0, y0 = rnd.randint(0, w), rnd.randint(0, h)
            bbox = (x0, y0, rnd.randint(x0, w + 3), rnd.randint(y0, h + 3))
            if bolge_agaci(img, bbox) != eski(img, bbox):
                farkli.append((n, bbox))
        if bolge_agaci(img, (0, 0, w, h)) != contour_tree(img):
            farkli.append((n, "tam"))
    sonuc("bölge ağacı: 360 rastgele bölgede ve tam görüntüde eski yolla aynı", not farkli, farkli[:5])
    sonuc("bölge ağacı: boş ve ters bölge", bolge_agaci(np.ones((5, 5), np.uint8), (3, 3, 3, 3)) == [] and bolge_agaci(np.ones((5, 5), np.uint8), (4, 4, 2, 2)) == [])
    # Süre: 1700 × 2200 piksellik sayfada 60 küçük bölge (vektör çizimli sayfanın dış bölgeleri gibi)
    sayfa = np.zeros((2200, 1700), np.uint8)
    bolgeler = []
    for i in range(60):
        x, y = 40 + (i % 10) * 160, 60 + (i // 10) * 340
        sayfa[y:y + 20, x:x + 20] = 255
        sayfa[y + 6:y + 14, x + 6:x + 14] = 0
        bolgeler.append((x, y, x + 20, y + 20))
    t = time.monotonic()
    yeni = [bolge_agaci(sayfa, b) for b in bolgeler]
    t_yeni = time.monotonic() - t
    t = time.monotonic()
    esk = [eski(sayfa, b) for b in bolgeler[:6]]
    t_eski = (time.monotonic() - t) * 10
    sonuc("bölge ağacı: 60 küçük bölgede %.3f sn (eski yol ~%.1f sn)" % (t_yeni, t_eski), yeni[:6] == esk and t_yeni * 5 < t_eski, (t_yeni, t_eski))


def test_dondurme():
    """pdf2docx'in görsel döndürmesi (Pillow): 90'ın katlarında yeniden örneklemeden, piksel piksel eşit."""
    from PIL import Image
    from ucuncu.pdf2docx.image.ImagesExtractor import ImagesExtractor
    im = Image.new("RGB", (30, 20))
    im.putdata([((x * 7) % 256, (y * 11) % 256, (x * y) % 256) for y in range(20) for x in range(30)])
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 30, 20), False)
    pix.set_rect(pix.irect, (0, 0, 0))
    for y in range(20):
        for x in range(30):
            pix.set_pixel(x, y, im.getpixel((x, y)))
    for aci, tr in ((90, Image.Transpose.ROTATE_90), (180, Image.Transpose.ROTATE_180), (270, Image.Transpose.ROTATE_270),
                    (-90, Image.Transpose.ROTATE_270)):
        cikti = Image.open(io.BytesIO(ImagesExtractor._rotate_image(pix, aci))).convert("RGB")
        sonuc("döndürme %d°: kayıpsız" % aci, cikti.tobytes() == im.transpose(tr).tobytes(), cikti.size)
    cikti = Image.open(io.BytesIO(ImagesExtractor._rotate_image(pix, 30)))
    sonuc("döndürme 30°: görüntü kırpılmadan büyür", cikti.width > 30 and cikti.height > 20, cikti.size)
    import numpy as np
    gri = ImagesExtractor._gray(np.array([[[255, 0, 0], [0, 255, 0], [0, 0, 255], [254, 254, 254]]], dtype=np.uint8))
    sonuc("gri ton: OpenCV BGR2GRAY katsayıları", gri.tolist() == [[76, 150, 29, 254]], gri.tolist())


def main():
    exe = None
    if "--exe" in sys.argv:
        exe = os.path.abspath(sys.argv[sys.argv.index("--exe") + 1])
        if not os.path.isfile(exe):
            print("exe bulunamadı:", exe)
            return 2
    word_icin_denetle()   # 0.2.9 denetimi: USERPROFILE değiştirilmişse Word başlatılmaz (Word'ün "Son kullanılanlar" listesi bozulurdu)
    BASTA.update(word_surecleri())
    print("Girdiler üretiliyor…")
    g = girdileri_uret()
    c = Cagirici(exe)
    print("Çağrı yolu:", exe or "doğrudan modül")
    w = test_yetenekler(c)
    word_var = w.get("var") is True and w.get("motor") == "word"
    testler = []
    if word_var:
        testler += [lambda: test_word_pdf(c, g, exe), lambda: test_parolali(c, g, exe), lambda: test_iptal(c, g)]
        if not exe:
            testler.append(lambda: test_zaman_asimi(c, g))
        testler.append(lambda: test_cokme(exe, g))
    else:
        atlandi("Word → PDF denetimleri", w.get("neden") or "Word yok (motor: %s)" % w.get("motor"))
    testler += [lambda: test_word_yok(exe, g), lambda: test_pdf_word(c, g, word_var), lambda: test_pdf_word_iptal(c, g),
                lambda: test_kanal(exe, g, word_var), lambda: test_zincir(c, g, exe)]
    if not exe:
        testler += [test_kontur, test_bolge_agaci, test_dondurme, lambda: test_dis_sablon(temiz_klasor("dis_sablon"))]
    for t in testler:
        try:
            t()
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            sonuc("İSTİSNA", False, repr(e))
    c.kapat()
    if word_var:
        ok, simdi = word_kapanmasini_bekle(BASTA, 25)
        sonuc("sonda WINWORD süreçleri baştakiyle aynı", ok, sorted(simdi))
    print("\nSonuç: %d/%d geçti%s." % (toplam - hata, toplam, ", %d HATA" % hata if hata else ""))
    return 1 if hata else 0


if __name__ == "__main__":
    sys.exit(main())
