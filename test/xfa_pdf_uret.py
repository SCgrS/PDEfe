# -*- coding: utf-8 -*-
# Dinamik (saf) XFA formunun sınama örneğini üretir (0.3.1; test/senaryo48.mjs, test/xfa_testi.py; gerçek belge yok, adlar ve metinler yer
# tutucu). Form tasarım programının ürettiği formların yapısında: katalogda /NeedsRendering, AcroForm'da alan yok, /XFA paketleri (xdp
# başı, config, template, datasets, xdp sonu), PDF'in kendi sayfası "lütfen bekleyin" yazısı.
# Kullanım: .venv\Scripts\python.exe test\xfa_pdf_uret.py <klasör>
# Çıktı (klasöre): xfa.pdf, xfa-imzali.pdf (aynı form, görünmez sahte e-imzayla: imzali_xfa), xfa-uzun.pdf (uzun yazı: test/senaryo50.mjs), xfa-bicim.pdf (alan biçimleri: BICIM_SABLON, test/senaryo51.mjs),
#   xfa-hakli.pdf (xfa-uzun, biçimce doğru sahte kullanım hakları imzasıyla: hakli_xfa, test/senaryo52.mjs)
#   Şablon: form1 (yukarıdan aşağı akış). Sayfa alanı "Sayfa1": alt bilgide "Sayfa n / N" (zengin metne gömülü, değeri xfa.layout.page /
#   pageCount betikli iki gizli alan). Alt formlar:
#     Baslik: başlık (Türkçe harfler), yazı alanı AdSoyad (araç ipucu "Adı ve soyadı"), onay kutusu Onay, açılır liste Sehir (Ankara,
#             İstanbul, İzmir).
#     Satir:  tekrarlanabilir (occur min 1, max 3), 150 mm: her örnek ayrı sayfaya düşer (sayfa sayısı = örnek sayısı). Çok satırlı yazı
#             alanı Aciklama, "Satır Ekle" (addInstance) ve "Son Satırı Sil" (removeInstance(count - 1)) düğmeleri, form tasarım
#             programının ürettiği eylem kalıbında (yorum satırları, sürüm koşulu). Düğmeler basılmaz (relevant="-print").
#     Son:    "Formu Kaydet" (app.execMenuItem("SaveAs")), "Mesaj" (tanınmayan betik: xfa.host.messageBox), "Mesajı Gizle" (Mesaj
#             düğmesinin presence'ı hidden).
#   Veri (datasets): boş değerler, bir Satir grubu. Katalogda sahte kullanım hakları imzası (/Perms /UR3; gerçek imza değil, kaydedilince
#   kaldırıldığını sınamak için). AcroForm /DR'de gömülü olmayan Arial (PDF.js XFA yazı tiplerini buradan tanır).
#   Ayrıca (0.3.1, kayıt sınaması: test/senaryo50.mjs): xfa-uzun.pdf. Başlık (AdSoyad, Sehir), tekrarlanabilir Basvurucu (min 1, max 20; BAd, çok satırlı BAdres,
#   Ekle / Sil düğmeleri), tekrarlanabilir Bolum (min 1, max 20, her örnek bir sayfaya yakın; çok satırlı Metin, Ekle / Sil düğmeleri), Son (Formu Kaydet).
# Son satırda JSON özet.
import json
import os
import sys

import pymupdf

sys.stdout.reconfigure(encoding="utf-8")

# XDP paketinin ad alanı (XFA belirtimindeki adres; PDF.js formu bu adresle tanır). Adres bir şirket adı taşıdığı için depoda düz yazılmaz
# (PLAN.md "Marka adı yok"): baytlarından kurulur.
XDP_NS = bytes.fromhex("687474703a2f2f6e732e61646f62652e636f6d2f7864702f").decode("ascii")
SABLON_NS = "http://www.xfa.org/schema/xfa-template/3.3/"
VERI_NS = "http://www.xfa.org/schema/xfa-data/1.0/"
ESKI_SURUM = "if (xfa.host.version &lt; 8) {\n\txfa.form.recalculate(1);\n}"


def dugme(ad, x, y, w, yazi, betik, ek=""):
    return (f'<field name="{ad}" x="{x}" y="{y}" w="{w}" h="8mm" relevant="-print"{ek}><ui><button highlight="inverted"/></ui>'
            f'<font typeface="Arial" size="9pt"/><caption><value><text>{yazi}</text></value><para hAlign="center" vAlign="middle"/></caption>'
            f'<border><edge stroke="raised"/><fill><color value="212,208,200"/></fill></border>'
            f'<event activity="click" name="event__click"><script contentType="application/x-javascript">{betik}</script></event></field>')


def eylem(ad, govde, kimlik):
    return (f"//+ GENERATED - DO NOT EDIT (ID:{kimlik} CRC:1)\n//+ Type: Action\n//+ ActionName: {ad}.click\n{govde}\n{ESKI_SURUM}\n//-\n")


SABLON = f"""<template xmlns="{SABLON_NS}"><subform name="form1" layout="tb" locale="tr_TR" restoreState="auto">
<pageSet><pageArea name="Sayfa1" id="Sayfa1"><contentArea x="15mm" y="15mm" w="180mm" h="255mm"/><medium stock="a4" short="210mm" long="297mm"/>
<draw name="Numara" x="160mm" y="280mm" w="30mm" h="6mm"><ui><textEdit/></ui><value><exData contentType="text/html"><body xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="{VERI_NS}"><p>Sayfa <span xfa:embedType="uri" xfa:embedMode="raw" xfa:embed="#alanSayfa"/> / <span xfa:embedType="uri" xfa:embedMode="raw" xfa:embed="#alanToplam"/></p></body></exData></value><font typeface="Arial" size="9pt"/></draw>
<field name="SayfaNo" id="alanSayfa" presence="hidden" w="20mm" h="6mm" access="readOnly"><ui><numericEdit/></ui><event activity="ready" ref="$layout"><script contentType="application/x-javascript">this.rawValue = xfa.layout.page(this);</script></event><bind match="none"/></field>
<field name="SayfaSayisi" id="alanToplam" presence="hidden" w="20mm" h="6mm" access="readOnly"><ui><numericEdit/></ui><event activity="ready" ref="$layout"><script contentType="application/x-javascript">this.rawValue = xfa.layout.pageCount();</script></event><bind match="none"/></field>
</pageArea></pageSet>
<subform name="Baslik" w="180mm" h="40mm">
<draw name="BaslikYazi" x="0mm" y="0mm" w="180mm" h="10mm"><ui><textEdit/></ui><value><text>DENEME XFA FORMU İĞŞÇÖÜ ığşçöü</text></value><font typeface="Arial" size="14pt" weight="bold"/></draw>
<field name="AdSoyad" x="0mm" y="12mm" w="120mm" h="9mm"><ui><textEdit/></ui><font typeface="Arial" size="10pt"/><caption reserve="35mm"><value><text>Adı Soyadı</text></value></caption><assist><toolTip>Adı ve soyadı</toolTip></assist></field>
<field name="Onay" x="0mm" y="23mm" w="100mm" h="7mm"><ui><checkButton shape="square" size="4mm"/></ui><items><integer>1</integer><integer>0</integer></items><font typeface="Arial" size="10pt"/><caption placement="right" reserve="90mm"><value><text>Bilgilerin doğruluğunu onaylıyorum</text></value></caption></field>
<field name="Sehir" x="0mm" y="31mm" w="90mm" h="8mm"><ui><choiceList/></ui><items><text>Ankara</text><text>İstanbul</text><text>İzmir</text></items><font typeface="Arial" size="10pt"/><caption reserve="35mm"><value><text>Şehir</text></value></caption></field>
</subform>
<subform name="Satir" w="180mm" h="150mm"><occur min="1" max="3"/>
<field name="Aciklama" x="0mm" y="0mm" w="180mm" h="120mm"><ui><textEdit multiLine="1"/></ui><font typeface="Arial" size="10pt"/><caption placement="top" reserve="7mm"><value><text>Açıklama</text></value></caption></field>
{dugme("SatirEkle", "140mm", "130mm", "40mm", "Satır Ekle", eylem("SatirEkle", "this.resolveNode('form1._Satir').addInstance(1);", "11111111-0000-0000-0000-000000000001"))}
{dugme("SatirSil", "95mm", "130mm", "40mm", "Son Satırı Sil", eylem("SatirSil", "this.resolveNode('form1._Satir').removeInstance(this.resolveNode('form1._Satir').count - 1);", "11111111-0000-0000-0000-000000000002"))}
</subform>
<subform name="Son" w="180mm" h="25mm">
{dugme("Kaydet", "140mm", "5mm", "40mm", "Formu Kaydet", eylem("Kaydet", 'app.execMenuItem("SaveAs");', "11111111-0000-0000-0000-000000000003"))}
{dugme("Mesaj", "95mm", "5mm", "40mm", "Mesaj", 'xfa.host.messageBox("Merhaba");')}
{dugme("Gizle", "50mm", "5mm", "40mm", "Mesajı Gizle", eylem("Gizle", 'this.resolveNode("Mesaj").presence = "hidden";', "11111111-0000-0000-0000-000000000004"))}
</subform>
</subform></template>"""

VERI = (f'<xfa:datasets xmlns:xfa="{VERI_NS}"><xfa:data><form1><Baslik><AdSoyad/><Onay/><Sehir/></Baslik>'
        '<Satir><Aciklama/></Satir><Son/></form1></xfa:data></xfa:datasets>')
CONFIG = '<config xmlns="http://www.xfa.org/schema/xci/3.1/"><present><pdf><version>1.7</version><interactive>1</interactive></pdf></present></config>'

SABLON_UZUN = f"""<template xmlns="{SABLON_NS}"><subform name="form1" layout="tb" locale="tr_TR" restoreState="auto">
<pageSet><pageArea name="Sayfa1" id="Sayfa1"><contentArea x="15mm" y="15mm" w="180mm" h="255mm"/><medium stock="a4" short="210mm" long="297mm"/></pageArea></pageSet>
<subform name="Baslik" w="180mm" h="24mm">
<field name="AdSoyad" x="0mm" y="2mm" w="120mm" h="9mm"><ui><textEdit/></ui><font typeface="Arial" size="10pt"/><caption reserve="35mm"><value><text>Adı Soyadı</text></value></caption></field>
<field name="Sehir" x="0mm" y="13mm" w="120mm" h="9mm"><ui><textEdit/></ui><font typeface="Arial" size="10pt"/><caption reserve="35mm"><value><text>Şehir</text></value></caption></field>
</subform>
<subform name="Basvurucu" w="180mm" h="48mm"><occur min="1" max="20"/>
<field name="BAd" x="0mm" y="0mm" w="180mm" h="9mm"><ui><textEdit/></ui><font typeface="Arial" size="10pt"/><caption reserve="35mm"><value><text>Başvurucu</text></value></caption></field>
<field name="BAdres" x="0mm" y="10mm" w="180mm" h="26mm"><ui><textEdit multiLine="1"/></ui><font typeface="Arial" size="9pt"/><caption placement="top" reserve="6mm"><value><text>Adres</text></value></caption></field>
{dugme("BEkle", "140mm", "38mm", "40mm", "Başvurucu Ekle", eylem("BEkle", "this.resolveNode('form1._Basvurucu').addInstance(1);", "22222222-0000-0000-0000-000000000001"))}
{dugme("BSil", "95mm", "38mm", "40mm", "Başvurucu Sil", eylem("BSil", "this.resolveNode('form1._Basvurucu').removeInstance(this.resolveNode('form1._Basvurucu').count - 1);", "22222222-0000-0000-0000-000000000002"))}
</subform>
<subform name="Bolum" w="180mm" h="200mm"><occur min="1" max="20"/>
<field name="Metin" x="0mm" y="0mm" w="180mm" h="185mm"><ui><textEdit multiLine="1"/></ui><font typeface="Arial" size="10pt"/><caption placement="top" reserve="7mm"><value><text>Açıklama</text></value></caption></field>
{dugme("MEkle", "140mm", "188mm", "40mm", "Bölüm Ekle", eylem("MEkle", "this.resolveNode('form1._Bolum').addInstance(1);", "22222222-0000-0000-0000-000000000003"))}
{dugme("MSil", "95mm", "188mm", "40mm", "Bölüm Sil", eylem("MSil", "this.resolveNode('form1._Bolum').removeInstance(this.resolveNode('form1._Bolum').count - 1);", "22222222-0000-0000-0000-000000000004"))}
</subform>
<subform name="Son" w="180mm" h="14mm">
{dugme("Kaydet", "140mm", "3mm", "40mm", "Formu Kaydet", eylem("Kaydet", 'app.execMenuItem("SaveAs");', "22222222-0000-0000-0000-000000000005"))}
</subform>
</subform></template>"""

VERI_UZUN = (f'<xfa:datasets xmlns:xfa="{VERI_NS}"><xfa:data><form1><Baslik><AdSoyad/><Sehir/></Baslik>'
             '<Basvurucu><BAd/><BAdres/></Basvurucu><Bolum><Metin/></Bolum><Son/></form1></xfa:data></xfa:datasets>')


# ------------------------------------------------------------ Alan biçimleri (0.3.1; test/senaryo51.mjs, test/xfa_testi.py)
# Form tasarım programının ürettiği alanların yapısında (kenar boşluğu 1 mm, yuvarlak köşeli çerçeve, renksiz dolgu): Yatay ve dikey hiza, satır
# aralığı, hücreli alan (comb), aynı adlı iki alan, renkli ve dolgusuz zemin, yazı boyu ve harf aralığı, onay kutusu ve seçenek düğmesi.
def _bicim_alani(ad, x, y, w, h, ui, para="", dolgu="<fill/>", yazi='<font typeface="Arial" size="10pt"/>', kenar=1, ek="", deger=""):
    bosluk = f'<margin topInset="{kenar}mm" bottomInset="{kenar}mm" leftInset="1mm" rightInset="1mm"/>'
    return (f'<field name="{ad}" x="{x}mm" y="{y}mm" w="{w}mm" h="{h}mm"{ek}><ui>{ui}</ui>{yazi}{bosluk}{para}{deger}'
            f'<border><edge><color value="153,153,153"/></edge><corner thickness="0.176mm" join="round" radius="2mm"><color value="153,153,153"/></corner>{dolgu}</border>'
            f'<assist><toolTip>{ad}</toolTip></assist></field>')


TEK = '<textEdit hScrollPolicy="off"><border presence="hidden"/><margin/></textEdit>'
COK = '<textEdit hScrollPolicy="off" multiLine="1" vScrollPolicy="off"><border presence="hidden"/><margin/></textEdit>'
COMB_KENAR = '<border hand="right"><edge><color value="192,192,192"/></edge><corner><color value="192,192,192"/></corner></border><margin/>'
ORTA = '<para vAlign="middle"/>'
BICIM_SABLON = f"""<template xmlns="{SABLON_NS}"><subform name="form1" layout="tb" locale="tr_TR" restoreState="auto">
<pageSet><pageArea name="Sayfa1" id="Sayfa1"><contentArea x="15mm" y="15mm" w="180mm" h="267mm"/><medium stock="a4" short="210mm" long="297mm"/></pageArea></pageSet>
<subform name="Bicim" w="180mm" h="222mm">
<draw name="Panel" x="0mm" y="0mm" w="180mm" h="222mm"><value><rectangle><edge presence="hidden"/><fill><color value="229,229,229"/></fill></rectangle></value></draw>
{_bicim_alani("Solda", 5, 3, 80, 8, TEK, ORTA)}
{_bicim_alani("Ortali", 90, 3, 80, 8, TEK, '<para hAlign="center" vAlign="middle"/>')}
{_bicim_alani("Sagda", 5, 13, 80, 8, TEK, '<para hAlign="right" vAlign="middle"/>')}
{_bicim_alani("Ustte", 90, 13, 40, 14, TEK)}
{_bicim_alani("Altta", 133, 13, 37, 14, TEK, '<para vAlign="bottom"/>')}
{_bicim_alani("Hucreli", 5, 23, 80, 8, f'<textEdit hScrollPolicy="off">{COMB_KENAR}<comb numberOfCells="11"/></textEdit>', ORTA)}
{_bicim_alani("HucreliHarf", 90, 29, 80, 8, f'<textEdit hScrollPolicy="off">{COMB_KENAR}<comb numberOfCells="8"/></textEdit>', ORTA)}
{_bicim_alani("CokSatir", 5, 39, 165, 31.75, COK, '<para lineHeight="15pt"/>')}
{_bicim_alani("CokOrtali", 5, 73, 80, 30, COK, '<para hAlign="center"/>', ek=' hAlign="center"', deger='<value><exData contentType="text/html"/></value>')}
{_bicim_alani("CokIki", 90, 73, 80, 30, COK, '<para hAlign="justify" lineHeight="15pt"/>')}
{_bicim_alani("CokDikey", 5, 105, 80, 8, COK, ORTA, yazi='<font typeface="Arial"/>', kenar=0, deger='<value><text maxChars="200"/></value>')}
{_bicim_alani("Renkli", 90, 105, 80, 8, TEK, ORTA, dolgu='<fill><color value="255,250,200"/></fill>')}
{_bicim_alani("Zeminsiz", 5, 115, 80, 8, TEK, ORTA, dolgu="")}
{_bicim_alani("Bosluklu", 90, 115, 80, 20, COK, '<para marginLeft="10pt" marginRight="5pt" spaceAbove="4pt"/>')}
{_bicim_alani("Harfli", 5, 125, 80, 8, TEK, ORTA, yazi='<font typeface="Arial" size="9pt" letterSpacing="1pt"/>')}
{_bicim_alani("Cift", 5, 137, 80, 8, TEK, '<para hAlign="center" vAlign="middle"/>')}
{_bicim_alani("Cift", 90, 137, 80, 8, TEK, '<para hAlign="right" vAlign="middle"/>')}
<field name="Onay" x="5mm" y="148mm" w="80mm" h="7mm"><ui><checkButton shape="square" size="4mm"/></ui><items><integer>1</integer><integer>0</integer></items><font typeface="Arial" size="10pt"/><caption placement="right" reserve="70mm"><value><text>Onay kutusu</text></value></caption></field>
<exclGroup name="Secim" x="90mm" y="148mm" w="80mm" h="7mm" layout="lr-tb">
<field name="SecimA" w="35mm" h="7mm"><ui><checkButton shape="round" size="4mm"/></ui><items><integer>1</integer></items><font typeface="Arial" size="10pt"/><caption placement="right" reserve="28mm"><value><text>Birinci</text></value></caption></field>
<field name="SecimB" w="35mm" h="7mm"><ui><checkButton shape="round" size="4mm"/></ui><items><integer>2</integer></items><font typeface="Arial" size="10pt"/><caption placement="right" reserve="28mm"><value><text>İkinci</text></value></caption></field>
</exclGroup>
<field name="Baslikli" x="5mm" y="158mm" w="120mm" h="9mm"><ui>{TEK}</ui><font typeface="Arial" size="10pt"/><margin leftInset="1mm" rightInset="1mm"/><para vAlign="middle"/><caption reserve="35mm"><value><text>Başlıklı alan</text></value></caption></field>
<field name="BaslikliHucre" x="5mm" y="170mm" w="120mm" h="9mm"><ui><textEdit hScrollPolicy="off">{COMB_KENAR}<comb numberOfCells="6"/></textEdit></ui><font typeface="Arial" size="10pt"/><margin leftInset="1mm" rightInset="1mm"/><para vAlign="middle"/><caption reserve="35mm"><value><text>Hücreli başlıklı</text></value></caption></field>
{dugme("BicimEkle", "130mm", "175mm", "40mm", "Bölüm Ekle", eylem("BicimEkle", "this.resolveNode('form1._Yinelenen').addInstance(1);", "22222222-0000-0000-0000-000000000001"))}
</subform>
<subform name="Yinelenen" w="180mm" h="30mm"><occur min="1" max="3"/>
{_bicim_alani("YOrtali", 5, 3, 80, 8, TEK, '<para hAlign="center" vAlign="middle"/>')}
{_bicim_alani("YHucreli", 90, 3, 80, 8, f'<textEdit hScrollPolicy="off">{COMB_KENAR}<comb numberOfCells="5"/></textEdit>', ORTA)}
{_bicim_alani("YCok", 5, 13, 165, 15, COK, '<para hAlign="center" lineHeight="15pt"/>')}
</subform>
</subform></template>"""
BICIM_VERI = (f'<xfa:datasets xmlns:xfa="{VERI_NS}"><xfa:data><form1><Bicim>'
              + "".join(f"<{a}/>" for a in ("Solda", "Ortali", "Sagda", "Ustte", "Altta", "Hucreli", "HucreliHarf", "CokSatir", "CokOrtali", "CokIki", "CokDikey", "Renkli", "Zeminsiz", "Bosluklu", "Harfli", "Cift", "Cift", "Onay", "Secim", "Baslikli", "BaslikliHucre"))
              + '</Bicim><Yinelenen><YOrtali/><YHucreli/><YCok/></Yinelenen></form1></xfa:data></xfa:datasets>')


def akis(doc, veri):
    x = doc.get_new_xref()
    doc.update_object(x, "<<>>")
    doc.update_stream(x, veri.encode("utf-8"))
    return x


def form_yaz(yol, sablon, veri, kullanim_hakki=True):
    """Şablonu ve veriyi saf XFA formu olarak yazar. Döner: {sablon, veri} akışlarının nesne numaraları."""
    doc = pymupdf.open()
    sayfa = doc.new_page(width=595, height=842)
    sayfa.insert_text((72, 100), "Please wait... (XFA form)", fontsize=14)
    bas = akis(doc, f'<xdp:xdp xmlns:xdp="{XDP_NS}" timeStamp="2026-10-30T00:00:00Z" uuid="00000000-0000-0000-0000-000000000000">')
    cfg, tpl, dat = akis(doc, CONFIG), akis(doc, sablon), akis(doc, veri)
    son = akis(doc, "</xdp:xdp>")
    tanim = doc.get_new_xref()
    doc.update_object(tanim, "<</Type/FontDescriptor/FontName/Arial/FontFamily(Arial)/Flags 32/FontBBox[-665 -325 2000 1006]/ItalicAngle 0"
                             "/Ascent 905/Descent -212/CapHeight 716/StemV 80/FontWeight 400>>")
    tanim_k = doc.get_new_xref()
    doc.update_object(tanim_k, "<</Type/FontDescriptor/FontName/Arial,Bold/FontFamily(Arial)/Flags 32/FontBBox[-628 -376 2000 1056]/ItalicAngle 0"
                               "/Ascent 905/Descent -212/CapHeight 716/StemV 120/FontWeight 700>>")
    yazi = doc.get_new_xref()
    doc.update_object(yazi, f"<</Type/Font/Subtype/TrueType/BaseFont/Arial/Encoding/WinAnsiEncoding/FontDescriptor {tanim} 0 R>>")
    yazi_k = doc.get_new_xref()
    doc.update_object(yazi_k, f"<</Type/Font/Subtype/TrueType/BaseFont/Arial,Bold/Encoding/WinAnsiEncoding/FontDescriptor {tanim_k} 0 R>>")
    af = doc.get_new_xref()
    doc.update_object(af, f"<</Fields[]/DR<</Font<</Arial {yazi} 0 R/Arial-Bold {yazi_k} 0 R>>>>"
                          f"/XFA[(xdp:xdp) {bas} 0 R (config) {cfg} 0 R (template) {tpl} 0 R (datasets) {dat} 0 R (</xdp:xdp>) {son} 0 R]>>")
    kat = doc.pdf_catalog()
    doc.xref_set_key(kat, "AcroForm", f"{af} 0 R")
    doc.xref_set_key(kat, "NeedsRendering", "true")
    if kullanim_hakki:
        doc.xref_set_key(kat, "Perms", "<</UR3<</Type/Sig/Filter/PDEfe.Deneme/SubFilter/ETSI.CAdES.detached/ByteRange[0 0 0 0]/Contents<00>>>>>")
    doc.save(yol, garbage=1, deflate=True)
    doc.close()
    return {"sablon": tpl, "veri": dat}


def uret(klasor):
    os.makedirs(klasor, exist_ok=True)
    yol = os.path.join(klasor, "xfa.pdf")
    paketler = form_yaz(yol, SABLON, VERI)
    imzali = os.path.join(klasor, "xfa-imzali.pdf")
    imzali_xfa(yol, imzali)
    uzun = os.path.join(klasor, "xfa-uzun.pdf")
    form_yaz(uzun, SABLON_UZUN, VERI_UZUN)
    bicim = os.path.join(klasor, "xfa-bicim.pdf")
    form_yaz(bicim, BICIM_SABLON, BICIM_VERI, kullanim_hakki=False)
    hakli = os.path.join(klasor, "xfa-hakli.pdf")
    gecici = os.path.join(klasor, "xfa-hakli-kaynak.pdf")
    form_yaz(gecici, SABLON_UZUN, VERI_UZUN, kullanim_hakki=False)
    hakli_xfa(gecici, hakli)
    os.remove(gecici)
    return {"xfa": yol, "xfaImzali": imzali, "xfaUzun": uzun, "xfaBicim": bicim, "xfaHakli": hakli, "paketler": paketler}


def hakli_xfa(kaynak, yol):
    """0.3.1 kayıp avı: Kullanım hakları imzalı saf XFA formu (sahte imza, yer tutucu): /ByteRange dosyayı, /Contents dışında kapsar. Gerçek formlardaki gibi /Perms /UR3 ayrı nesne."""
    import re
    doc = pymupdf.open(kaynak)
    icerik = 2 * 64
    sig = doc.get_new_xref()
    doc.update_object(sig, "<</Type/Sig/Filter/PDEfe.Deneme/SubFilter/adbe.pkcs7.detached/ByteRange[0 1111111111 1111111111 1111111111]/Contents<%s>"
                           "/Reference[<</Type/SigRef/TransformMethod/UR3/TransformParams<</Type/TransformParams/V/2.2/Form[/FillIn]>>>>]>>" % ("0" * icerik))
    doc.xref_set_key(doc.pdf_catalog(), "Perms", "<</UR3 %d 0 R>>" % sig)
    doc.save(yol, garbage=0, deflate=False, no_new_id=True)
    doc.close()
    veri = bytearray(open(yol, "rb").read())
    m_br = re.search(rb"/ByteRange\s*\[\s*0\s+1111111111\s+1111111111\s+1111111111\s*\]", veri)
    m_ci = re.search(rb"/Contents\s*<0{%d}>" % icerik, veri)
    if not m_br or not m_ci:
        raise RuntimeError("İmza sözlüğünün yer tutucuları bulunamadı.")
    a = m_ci.end() - icerik - 2
    b = a + icerik + 2
    yeni = b"/ByteRange[0 %010d %010d %010d]" % (a, b, len(veri) - b)
    yeni += b" " * (m_br.end() - m_br.start() - len(yeni))
    veri[m_br.start():m_br.end()] = yeni
    open(yol, "wb").write(bytes(veri))


def imzali_xfa(kaynak, yol):
    """0.3.1 inceleme: Görünmez e-imzalı saf XFA formu (sahte imza, yer tutucu). İmza alanının Rect'i [0 0 0 0]: PDF.js böyle alanı alan
    saymaz, belge yine saf XFA'dır. /ByteRange dosyanın tamamını (/Contents dışında) kapsar, /Contents imzalanan baytların SHA-256'sı
    (test/form_alanlari_pdf_uret.py imzali_pdf'teki gibi)."""
    import hashlib
    import re
    doc = pymupdf.open(kaynak)
    icerik = 2 * 64
    sig = doc.get_new_xref()
    doc.update_object(sig, "<</Type/Sig/Filter/Deneme.Imza/SubFilter/ETSI.CAdES.detached/ByteRange[0 1111111111 1111111111 1111111111]"
                           "/Contents<%s>/M(D:20261030000000+03'00')>>" % ("0" * icerik))
    alan = doc.get_new_xref()
    doc.update_object(alan, "<</Type/Annot/Subtype/Widget/FT/Sig/T(Imza)/F 132/Rect[0 0 0 0]/P %d 0 R/V %d 0 R>>" % (doc[0].xref, sig))
    doc.xref_set_key(doc[0].xref, "Annots", "[%d 0 R]" % alan)
    af = int(doc.xref_get_key(doc.pdf_catalog(), "AcroForm")[1].split()[0])
    doc.xref_set_key(af, "Fields", "[%d 0 R]" % alan)
    doc.xref_set_key(af, "SigFlags", "3")
    doc.save(yol, garbage=0, deflate=False, no_new_id=True)
    doc.close()
    veri = bytearray(open(yol, "rb").read())
    m_br = re.search(rb"/ByteRange\s*\[\s*0\s+1111111111\s+1111111111\s+1111111111\s*\]", veri)
    m_ci = re.search(rb"/Contents\s*<0{%d}>" % icerik, veri)
    if not m_br or not m_ci:
        raise RuntimeError("İmza sözlüğünün yer tutucuları bulunamadı.")
    a = m_ci.end() - icerik - 2
    b = a + icerik + 2
    yeni = b"/ByteRange[0 %010d %010d %010d]" % (a, b, len(veri) - b)
    yeni += b" " * (m_br.end() - m_br.start() - len(yeni))
    veri[m_br.start():m_br.end()] = yeni
    ozet = hashlib.sha256(bytes(veri[0:a]) + bytes(veri[b:])).hexdigest().encode()
    veri[a + 1:a + 1 + icerik] = ozet + b"0" * (icerik - len(ozet))
    open(yol, "wb").write(bytes(veri))


if __name__ == "__main__":
    print(json.dumps(uret(sys.argv[1] if len(sys.argv) > 1 else "."), ensure_ascii=False))
