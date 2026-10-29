# -*- coding: utf-8 -*-
# Etkileşimli form alanlarının (AcroForm) sınama örneklerini üretir (0.3.1; test/senaryo47.mjs, test/form_testi.py; gerçek belge yok,
# alan adları ve değerler yer tutucu).
# Kullanım: .venv\Scripts\python.exe test\form_alanlari_pdf_uret.py <klasör>
# Çıktılar (klasöre):
#   alanlar.pdf  5 sayfa. 1. sayfa: yazı alanları (tek satır, sağa ve ortaya hizalı, çok satır, tarak (comb) 11 hane, en çok 5 harf,
#                uzun değerli (kaydırmalı), yazı boyu otomatik, salt okunur), iki onay kutusu (açık durumları "Yes" ve "Evet"), üç seçenekli
#                seçenek düğmesi grubu (A / B / C, ebeveyn alan ve çocuk widget'lar), açılır liste (dışa aktarma değerli), düzenlenebilir
#                açılır liste, liste kutusu, çok seçimli liste kutusu, imza alanı, itme düğmesi, iki widget'lı "ad" alanının ilki.
#                2. sayfa /Rotate 90: yazı alanı ve onay kutusu. 3. sayfa: "ad"ın ikinci widget'ı, /MK /R 90 döndürülmüş yazı alanı.
#                4. sayfa: alansız. 5. sayfa: "son" yazı alanı.
#   imzali.pdf   1 sayfa: yazı alanı, onay kutusu ve değerli imza alanı (/ByteRange'li imza sözlüğü; /Contents imzalanan baytların
#                SHA-256'sı: Gerçek bir imza değil, artımlı kayıttan sonra imzalanan baytların değişmediğini sınamak için).
#   karma.pdf    1 sayfa: AcroForm alanları + /XFA paketi (XFA'lı karma belge).
# Son satırda JSON özet: alanların adları, xref'leri, sayfaları, türleri ve dosyalardaki ilk değerleri.
import hashlib
import json
import os
import re
import sys

import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
A4 = (595, 842)


def pdf_metin(s):
    """PDF metin dizgesi: ASCII parantezli, değilse UTF-16BE (FEFF)."""
    if all(32 <= ord(c) < 127 for c in s):
        return "(" + s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ")"
    return "<FEFF" + s.encode("utf-16-be").hex().upper() + ">"


def winansi(s):
    """Görünüm akışındaki Helvetica (WinAnsi) dizgesi: yalnızca ASCII (sınama değerleri ASCII seçildi)."""
    return "(" + s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ")"


class Uretici:
    def __init__(self, doc):
        self.doc = doc
        self.alanlar = []          # AcroForm /Fields kökleri
        self.ozet = []
        self.helv = doc.get_new_xref()
        doc.update_object(self.helv, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>")
        self.zadb = doc.get_new_xref()
        doc.update_object(self.zadb, "<</Type/Font/Subtype/Type1/BaseFont/ZapfDingbats>>")

    def nesne(self, sozluk, akis=None):
        x = self.doc.get_new_xref()
        self.doc.update_object(x, sozluk)
        if akis is not None:
            self.doc.update_stream(x, akis.encode("latin-1"))
        return x

    def pdf_rect(self, page, r):
        """PyMuPDF (sol üst) kutusu → PDF kullanıcı uzayı [x0 y0 x1 y1] (döndürülmemiş sayfanın MediaBox'ında)."""
        h = page.mediabox.height
        return "[%.2f %.2f %.2f %.2f]" % (r[0], h - r[3], r[2], h - r[1])

    def annot_ekle(self, page, xref):
        tur, deger = self.doc.xref_get_key(page.xref, "Annots")
        mevcut = re.findall(r"\d+ 0 R", deger) if tur == "array" else []
        self.doc.xref_set_key(page.xref, "Annots", "[" + " ".join(mevcut + ["%d 0 R" % xref]) + "]")

    def kutu_ap(self, w, h, bg=(1, 1, 1), bc=(0, 0, 0), metin=None, boyut=12, hiza=0, ek=""):
        ops = ["/Tx BMC", "q"]
        if bg:
            ops.append("%g %g %g rg 0 0 %.2f %.2f re f" % (*bg, w, h))
        if bc:
            ops.append("%g %g %g RG 1 w 0.5 0.5 %.2f %.2f re S" % (*bc, w - 1, h - 1))
        if metin:
            gen = pymupdf.get_text_length(metin, fontname="helv", fontsize=boyut)
            x = 2 if hiza == 0 else (w - gen) / 2 if hiza == 1 else w - 2 - gen
            y = (h - boyut * 0.78) / 2 + 0.5
            ops.append("1 1 %.2f %.2f re W n BT /Helv %g Tf 0 g %.2f %.2f Td %s Tj ET" % (w - 2, h - 2, boyut, x, y, winansi(metin)))
        ops.append(ek)
        ops += ["Q", "EMC"]
        return self.nesne("<</Type/XObject/Subtype/Form/BBox[0 0 %.2f %.2f]/Resources<</Font<</Helv %d 0 R>>>>>>" % (w, h, self.helv), "\n".join(ops))

    def isaret_ap(self, w, h, karakter, acik, bc=(0, 0, 0), bg=(1, 1, 1)):
        ops = ["q"]
        if bg:
            ops.append("%g %g %g rg 0 0 %.2f %.2f re f" % (*bg, w, h))
        if bc:
            ops.append("%g %g %g RG 1 w 0.5 0.5 %.2f %.2f re S" % (*bc, w - 1, h - 1))
        if acik:
            boy = min(w, h) * 0.8
            ops.append("BT /ZaDb %.2f Tf 0 g %.2f %.2f Td (%s) Tj ET" % (boy, (w - boy * 0.75) / 2, (h - boy * 0.7) / 2, karakter))
        ops.append("Q")
        return self.nesne("<</Type/XObject/Subtype/Form/BBox[0 0 %.2f %.2f]/Resources<</Font<</ZaDb %d 0 R>>>>>>" % (w, h, self.zadb), "\n".join(ops))

    def kayit(self, ad, xref, sayfa, tur, deger, **ek):
        self.ozet.append(dict(ad=ad, xref=xref, sayfa=sayfa, tur=tur, deger=deger, **ek))

    # ---- alan türleri
    def yazi(self, page, ad, r, deger="", ff=0, q=0, boyut=12, maxlen=None, ap_metni=None, mk_r=0, ebeveyn=None, ek=""):
        """Yazı alanı. ebeveyn verilirse alanın çocuk widget'ı (/T, /FT, /DA ebeveynde; widget /Fields'e girmez)."""
        w, h = r[2] - r[0], r[3] - r[1]
        if mk_r in (90, 270):
            aw, ah = h, w
            matris = "/Matrix[0 1 -1 0 0 0]" if mk_r == 90 else "/Matrix[0 -1 1 0 0 0]"
        else:
            aw, ah, matris = w, h, ""
        ap = self.kutu_ap(aw, ah, metin=ap_metni if ap_metni is not None else (deger if ff & 4096 == 0 and not ff & (1 << 24) else None), boyut=boyut or 10, hiza=q)
        if matris:
            self.doc.xref_set_key(ap, "Matrix", matris[len("/Matrix"):])
        alan = "/Parent %d 0 R" % ebeveyn if ebeveyn else "/FT/Tx/T%s/DA(/Helv %g Tf 0 g)" % (pdf_metin(ad), boyut)
        sozluk = ("<</Type/Annot/Subtype/Widget%s/Rect%s/F 4/P %d 0 R/Q %d/Ff %d%s%s/MK<</BC[0 0 0]/BG[1 1 1]%s>>/AP<</N %d 0 R>>%s>>"
                  % (alan, self.pdf_rect(page, r), page.xref, q, ff, "/V" + pdf_metin(deger) if deger else "",
                     "/MaxLen %d" % maxlen if maxlen else "", "/R %d" % mk_r if mk_r else "", ap, ek))
        x = self.nesne(sozluk)
        self.annot_ekle(page, x)
        if not ebeveyn:
            self.alanlar.append(x)
        self.kayit(ad, x, page.number + 1, "metin", deger, ff=ff)
        return x

    def onay(self, page, ad, r, acik_ad="Yes", karakter="4", deger=False):
        w, h = r[2] - r[0], r[3] - r[1]
        on, off = self.isaret_ap(w, h, karakter, True), self.isaret_ap(w, h, karakter, False)
        durum = "/" + acik_ad if deger else "/Off"
        x = self.nesne("<</Type/Annot/Subtype/Widget/FT/Btn/T%s/Rect%s/F 4/P %d 0 R/DA(/ZaDb 0 Tf 0 g)/MK<</BC[0 0 0]/BG[1 1 1]/CA(%s)>>/AP<</N<</%s %d 0 R/Off %d 0 R>>>>/AS%s/V%s>>"
                       % (pdf_metin(ad), self.pdf_rect(page, r), page.xref, karakter, acik_ad, on, off, durum, durum))
        self.annot_ekle(page, x)
        self.alanlar.append(x)
        self.kayit(ad, x, page.number + 1, "onay", acik_ad if deger else "Off", acik=acik_ad)
        return x

    def secenek_grubu(self, page, ad, kutular, durumlar, deger="Off"):
        ebeveyn = self.doc.get_new_xref()
        cocuklar = []
        for r, durum in zip(kutular, durumlar):
            w, h = r[2] - r[0], r[3] - r[1]
            on, off = self.isaret_ap(w, h, "l", True), self.isaret_ap(w, h, "l", False)
            as_ = "/" + durum if deger == durum else "/Off"
            x = self.nesne("<</Type/Annot/Subtype/Widget/Parent %d 0 R/Rect%s/F 4/P %d 0 R/MK<</BC[0 0 0]/BG[1 1 1]/CA(l)>>/AP<</N<</%s %d 0 R/Off %d 0 R>>>>/AS%s>>"
                           % (ebeveyn, self.pdf_rect(page, r), page.xref, durum, on, off, as_))
            self.annot_ekle(page, x)
            cocuklar.append(x)
        self.doc.update_object(ebeveyn, "<</FT/Btn/Ff 49152/T%s/V/%s/DA(/ZaDb 0 Tf 0 g)/Kids[%s]>>" % (pdf_metin(ad), deger, " ".join("%d 0 R" % c for c in cocuklar)))
        self.alanlar.append(ebeveyn)
        self.kayit(ad, ebeveyn, page.number + 1, "secenek", deger, widgetlar=cocuklar, durumlar=durumlar)
        return ebeveyn, cocuklar

    def liste(self, page, ad, r, secenekler, ff=0, deger=None, secili=None, boyut=11):
        w, h = r[2] - r[0], r[3] - r[1]
        opt = " ".join("[%s %s]" % (pdf_metin(o[0]), pdf_metin(o[1])) if isinstance(o, tuple) else pdf_metin(o) for o in secenekler)
        if isinstance(deger, list):
            v = "/V[" + " ".join(pdf_metin(d) for d in deger) + "]"
        else:
            v = "/V" + pdf_metin(deger) if deger else ""
        i = "/I[%s]" % " ".join(str(s) for s in secili) if secili else ""
        gorunen = None
        if ff & (1 << 17) and deger:
            gorunen = next((o[1] if isinstance(o, tuple) else o for o in secenekler if (o[0] if isinstance(o, tuple) else o) == deger), deger)
            if not all(ord(c) < 128 for c in gorunen):
                gorunen = None                         # dosyanın görünümünde ASCII dışı yazı yok (Helvetica WinAnsi)
        ap = self.kutu_ap(w, h, metin=gorunen, boyut=boyut)
        x = self.nesne("<</Type/Annot/Subtype/Widget/FT/Ch/T%s/Rect%s/F 4/P %d 0 R/DA(/Helv %g Tf 0 g)/Ff %d/Opt[%s]%s%s/MK<</BC[0 0 0]/BG[1 1 1]>>/AP<</N %d 0 R>>>>"
                       % (pdf_metin(ad), self.pdf_rect(page, r), page.xref, boyut, ff, opt, v, i, ap))
        self.annot_ekle(page, x)
        self.alanlar.append(x)
        self.kayit(ad, x, page.number + 1, "acilir" if ff & (1 << 17) else "liste", deger, ff=ff)
        return x

    def imza(self, page, ad, r, v=None):
        w, h = r[2] - r[0], r[3] - r[1]
        ap = self.kutu_ap(w, h, bg=(0.95, 0.95, 0.95), metin="Imza")
        x = self.nesne("<</Type/Annot/Subtype/Widget/FT/Sig/T%s/Rect%s/F 132/P %d 0 R/MK<</BC[0 0 0]>>/AP<</N %d 0 R>>%s>>"
                       % (pdf_metin(ad), self.pdf_rect(page, r), page.xref, ap, "/V %d 0 R" % v if v else ""))
        self.annot_ekle(page, x)
        self.alanlar.append(x)
        self.kayit(ad, x, page.number + 1, "imza", None)
        return x

    def dugme(self, page, ad, r, yazi):
        w, h = r[2] - r[0], r[3] - r[1]
        ap = self.kutu_ap(w, h, bg=(0.85, 0.85, 0.85), metin=yazi, hiza=1)
        x = self.nesne("<</Type/Annot/Subtype/Widget/FT/Btn/Ff 65536/T%s/Rect%s/F 4/P %d 0 R/DA(/Helv 12 Tf 0 g)/MK<</BC[0 0 0]/BG[0.85 0.85 0.85]/CA%s>>/AP<</N %d 0 R>>>>"
                       % (pdf_metin(ad), self.pdf_rect(page, r), page.xref, pdf_metin(yazi), ap))
        self.annot_ekle(page, x)
        self.alanlar.append(x)
        self.kayit(ad, x, page.number + 1, "dugme", None)
        return x

    def acroform(self, ek=""):
        kat = self.doc.pdf_catalog()
        self.doc.xref_set_key(kat, "AcroForm", "<</Fields[%s]/DR<</Font<</Helv %d 0 R/ZaDb %d 0 R>>>>/DA(/Helv 0 Tf 0 g)%s>>"
                              % (" ".join("%d 0 R" % x for x in self.alanlar), self.helv, self.zadb, ek))


def etiket(page, x, y, metin, boyut=10):
    page.insert_text((x, y), metin, fontsize=boyut, fontname="helv")


def alanlar_pdf(yol):
    doc = pymupdf.open()
    for _ in range(5):
        doc.new_page(width=A4[0], height=A4[1])
    u = Uretici(doc)
    p1, p2, p3, p4, p5 = (doc[i] for i in range(5))
    p2.set_rotation(90)
    etiket(p1, 72, 50, "Form alanlari sinamasi (yer tutucu)", 14)
    satir = lambda i: 70 + i * 34                                   # noqa: E731
    sol, sag = 170, 470
    # Yazı alanları
    adlar = [("ad", "Ad"), ("unvan", "Unvan (saga)"), ("baslik", "Baslik (orta)"), ("tc", "Kimlik (tarak)"), ("kisa", "En cok 5"),
             ("uzun", "Uzun deger"), ("oto", "Otomatik boy"), ("salt", "Salt okunur")]
    for i, (_, e) in enumerate(adlar):
        etiket(p1, 72, satir(i) + 15, e)
    ad_ebeveyn = doc.get_new_xref()
    w1 = u.yazi(p1, "ad", (sol, satir(0), sag, satir(0) + 22), ebeveyn=ad_ebeveyn)
    u.yazi(p1, "unvan", (sol, satir(1), sag, satir(1) + 22), deger="Avukat", q=2)
    u.yazi(p1, "baslik", (sol, satir(2), sag, satir(2) + 22), q=1)
    u.yazi(p1, "tc", (sol, satir(3), sol + 242, satir(3) + 22), ff=1 << 24, maxlen=11)
    u.yazi(p1, "kisa", (sol, satir(4), sag, satir(4) + 22), maxlen=5)
    u.yazi(p1, "uzun", (sol, satir(5), sag, satir(5) + 22), deger="Bu deger alanin genisliginden cok daha uzun bir yazidir ve sona dogru kayar")
    u.yazi(p1, "oto", (sol, satir(6), sag, satir(6) + 22), boyut=0)
    u.yazi(p1, "salt", (sol, satir(7), sag, satir(7) + 22), deger="Sabit", ff=1)
    etiket(p1, 72, satir(8) + 15, "Aciklama (cok satir)")
    u.yazi(p1, "aciklama", (sol, satir(8), sag, satir(8) + 60), ff=4096, boyut=10)
    # Onay kutuları ve seçenek düğmeleri
    y = satir(10) + 4
    etiket(p1, 72, y + 12, "Onay")
    u.onay(p1, "onay1", (sol, y, sol + 16, y + 16))
    u.onay(p1, "onay2", (sol + 60, y, sol + 76, y + 16), acik_ad="Evet", karakter="8")
    y += 30
    etiket(p1, 72, y + 12, "Secim A / B / C")
    u.secenek_grubu(p1, "secim", [(sol + 70 * k, y, sol + 70 * k + 16, y + 16) for k in range(3)], ["A", "B", "C"])
    # Listeler
    y += 32
    etiket(p1, 72, y + 15, "Il (acilir)")
    u.liste(p1, "il", (sol, y, sol + 160, y + 22), [("06", "Ankara"), ("34", "İstanbul"), ("35", "İzmir")], ff=1 << 17, deger="06")
    y += 32
    etiket(p1, 72, y + 15, "Ilce (yazilabilir)")
    u.liste(p1, "ilce", (sol, y, sol + 160, y + 22), ["Çankaya", "Keçiören", "Yenimahalle"], ff=(1 << 17) | (1 << 18))
    y += 32
    etiket(p1, 72, y + 15, "Liste")
    u.liste(p1, "liste", (sol, y, sol + 120, y + 64), ["Bir", "İki", "Üç", "Dört", "Beş", "Altı"])
    etiket(p1, sol + 140, y + 15, "Coklu")
    u.liste(p1, "coklu", (sol + 180, y, sol + 300, y + 64), ["Kırmızı", "Yeşil", "Mavi", "Sarı"], ff=1 << 21)
    y += 76
    etiket(p1, 72, y + 15, "Imza / dugme")
    u.imza(p1, "imza", (sol, y, sol + 160, y + 40))
    u.dugme(p1, "gonder", (sol + 180, y + 8, sol + 260, y + 30), "Gonder")
    # 2. sayfa (/Rotate 90): kutular döndürülmemiş sayfa düzleminde
    etiket(p2, 72, 80, "Dondurulmus sayfa (Rotate 90)")
    u.yazi(p2, "donuk_metin", (72, 100, 300, 122))
    u.onay(p2, "donuk_onay", (72, 140, 88, 156))
    # 3. sayfa: "ad"ın ikinci widget'ı ve /MK /R 90 yazı alanı
    etiket(p3, 72, 80, "Ad (ikinci widget)")
    w2 = u.yazi(p3, "ad", (170, 66, 470, 88), ebeveyn=ad_ebeveyn)
    etiket(p3, 72, 140, "Yan alan (MK R 90)")
    u.yazi(p3, "yan", (170, 120, 200, 320), mk_r=90)
    # "ad": ebeveyn alan, iki çocuk widget (çocuklarda /T yok, değer ebeveynde)
    doc.update_object(ad_ebeveyn, "<</FT/Tx/T(ad)/DA(/Helv 12 Tf 0 g)/Kids[%d 0 R %d 0 R]>>" % (w1, w2))
    u.alanlar.insert(0, ad_ebeveyn)
    u.ozet = [o for o in u.ozet if o["ad"] != "ad"]
    u.kayit("ad", ad_ebeveyn, 1, "metin", "", widgetlar=[w1, w2])
    etiket(p4, 72, 80, "Alansiz sayfa")
    etiket(p5, 72, 80, "Son sayfa")
    u.yazi(p5, "son", (170, 66, 470, 88))
    u.acroform()
    doc.save(yol, garbage=0, deflate=True)
    return u.ozet


def imzali_pdf(yol):
    doc = pymupdf.open()
    page = doc.new_page(width=A4[0], height=A4[1])
    u = Uretici(doc)
    etiket(page, 72, 50, "Imzali form (sahte imza, yer tutucu)", 14)
    u.yazi(page, "not", (170, 70, 470, 92))
    u.onay(page, "kabul", (170, 110, 186, 126))
    icerik_uzunluk = 2 * 64                                            # /Contents: SHA-256 hex (64 bayt) yer
    # Yer tutucu sayılar on haneli: PyMuPDF sayıları yeniden yazar (baştaki sıfırları atar), sonradan aynı uzunlukta doldurulabilsinler
    sig = u.nesne("<</Type/Sig/Filter/Deneme.Imza/SubFilter/ETSI.CAdES.detached/ByteRange[0 1111111111 1111111111 1111111111]/Contents<%s>/M(D:20261029000000+03'00')>>"
                  % ("0" * icerik_uzunluk))
    u.imza(page, "imza", (170, 150, 400, 200), v=sig)
    u.acroform("/SigFlags 3")
    doc.save(yol, garbage=0, deflate=False, no_new_id=True)
    doc.close()
    # ByteRange ve Contents: kaydedilmiş dosyada yerinde, uzunluk değişmeden doldurulur
    veri = bytearray(open(yol, "rb").read())
    m_br = re.search(rb"/ByteRange\s*\[\s*0\s+1111111111\s+1111111111\s+1111111111\s*\]", veri)
    m_ci = re.search(rb"/Contents\s*<0{%d}>" % icerik_uzunluk, veri)
    if not m_br or not m_ci:
        raise RuntimeError("İmza sözlüğünün yer tutucuları bulunamadı.")
    a = m_ci.end() - icerik_uzunluk - 2                                  # '<' dahil hariç tutulan bölümün başı
    b = a + icerik_uzunluk + 2
    yeni = b"/ByteRange[0 %010d %010d %010d]" % (a, b, len(veri) - b)
    yeni += b" " * (m_br.end() - m_br.start() - len(yeni))
    veri[m_br.start():m_br.end()] = yeni
    ozet = hashlib.sha256(bytes(veri[0:a]) + bytes(veri[b:])).hexdigest().encode()
    veri[a + 1:a + 1 + icerik_uzunluk] = ozet + b"0" * (icerik_uzunluk - len(ozet))
    open(yol, "wb").write(bytes(veri))
    return u.ozet


def karma_pdf(yol):
    doc = pymupdf.open()
    page = doc.new_page(width=A4[0], height=A4[1])
    u = Uretici(doc)
    etiket(page, 72, 50, "XFA paketli karma form (yer tutucu)", 14)
    u.yazi(page, "kisi", (170, 70, 470, 92), deger="Eski")
    u.onay(page, "uygun", (170, 110, 186, 126))
    sablon = u.nesne("<<>>", '<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1"/></template>')
    veri = u.nesne("<<>>", '<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data><form1><kisi>Eski</kisi></form1></xfa:data></xfa:datasets>')
    u.acroform("/XFA[(template) %d 0 R (datasets) %d 0 R]" % (sablon, veri))
    doc.save(yol, garbage=0, deflate=True)
    return u.ozet


if __name__ == "__main__":
    klasor = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "cikti", "form")
    os.makedirs(klasor, exist_ok=True)
    ozet = {"alanlar": alanlar_pdf(os.path.join(klasor, "alanlar.pdf")),
            "imzali": imzali_pdf(os.path.join(klasor, "imzali.pdf")),
            "karma": karma_pdf(os.path.join(klasor, "karma.pdf"))}
    print(json.dumps(ozet, ensure_ascii=False))
