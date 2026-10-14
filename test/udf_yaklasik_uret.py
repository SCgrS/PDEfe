# -*- coding: utf-8 -*-
"""UYAP Doküman Editörü yokken UDF'nin yaklaşık çizimi (0.2.6; src/main/udfYaklasik.js) için girdiler: test/udf_yaklasik.mjs. Hepsi burada
üretilir, gerçek belge kullanılmaz (üreticiler test/udf_donusum_testi.py'den).

Olağan belgeler: sol ve sağ kenarı farklı A4 (alt bilgide sayfa numarası), yatay sayfa, tablolu, düz XML (zip'siz), uzun (üst bilgide resim,
birkaç sayfa), yorumlu, metninde "]]>" ve HTML / betik benzeri yazı geçen belge.
Kötü niyetli ya da bozuk: 40 MB'tan büyük dosya, açılmış boyutunu küçük beyan eden zip bombası (gerçekte 300 MB), açılmış boyutu büyük beyan
eden paket, 1500 öğeli paket, iki content.xml'li paket, dış varlıklı (SYSTEM) ve iç içe varlıklı (milyar gülüş) XML, parolalı (şifreli
bayraklı) öğe, UDF olmayan dosya, boş dosya, 100 kat iç içe tablo.

Kullanım:  .venv\\Scripts\\python.exe test\\udf_yaklasik_uret.py <klasör>     → son satırda {ad: yol} JSON'u
"""
import json
import os
import struct
import sys
import zipfile
import zlib

BURA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BURA)

import udf_donusum_testi as ut  # noqa: E402

YAZI_HTML = '<script>document.title="betik çalıştı"</script><img src=x onerror="alert(1)"> &amp; <b>kalın değil</b>'


def icerik_xml(govde, havuz, pf=None):
    pf = pf or ('<pageFormat mediaSizeName="1" leftMargin="70.87" rightMargin="70.87" topMargin="56.69" bottomMargin="56.69" '
                'paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" />')
    return (ut.ONSOZ + "<content>" + havuz + "</content><properties>" + pf + "</properties>\n<elements resolver=\"hvl-default\" >\n"
            + govde + "\n</elements>" + ut.STILLER + "\n</template>\n")


def zip_yaz(yol, ogeler):
    with zipfile.ZipFile(yol, "w", zipfile.ZIP_DEFLATED) as z:
        for ad, veri in ogeler:
            z.writestr(ad, veri)
    return yol


def cdata(metin):
    """Metni CDATA'ya koyar; içindeki "]]>" UYAP Doküman Editörü'nün yaptığı gibi iki CDATA'ya bölünür."""
    return "<![CDATA[" + metin.replace("]]>", "]]]]><![CDATA[>") + "]]>"


def ozel_metinli(yol):
    """Metninde "]]>" ve HTML / betik benzeri yazı geçen belge (motor bunları yazı olarak çizmeli, işlememeli)."""
    satirlar = ["Metinde CDATA sonu ]]> geçiyor; sonrası da okunmalı.", YAZI_HTML, "Son satır: ğüşıöç İĞÜŞÖÇ."]
    havuz, govde, uz = "", [], 0
    for s in satirlar:
        govde.append('<paragraph Alignment="0"><content startOffset="%d" length="%d" family="Times New Roman" size="12" />'
                     '<content startOffset="%d" length="1" family="Times New Roman" size="12" /></paragraph>' % (uz, len(s), uz + len(s)))
        havuz += s + "\n"
        uz += len(s) + 1
    return zip_yaz(yol, [("content.xml", icerik_xml("\n".join(govde), cdata(havuz)).encode("utf-8"))])


def zip_bombasi(yol, gercek=300 * 1024 * 1024, beyan=4096):
    """content.xml'in açılmış boyutunu küçük beyan eden paket: gerçekte gercek bayt boşluk (deflate ~300 KB). Merkezî dizin ve yerel üst bilgi
    beyanı yalan söyler; ana süreç yalnızca beyana bakar, motor açılan baytı sayıp durdurmalı."""
    bas = icerik_xml("", "<![CDATA[x\n]]>").encode("utf-8")
    bas = bas.replace(b"<content>", b"<content>" + b" ", 1)
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    parcalar = [c.compress(bas)]
    blok = b" " * (1024 * 1024)
    for _ in range(gercek // len(blok)):
        parcalar.append(c.compress(blok))
    parcalar.append(c.flush())
    veri = b"".join(parcalar)
    ad = b"content.xml"
    crc = 0
    yerel = struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, 0, 8, 0, 0, crc, len(veri), beyan, len(ad), 0) + ad
    merkez = struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, 0, 8, 0, 0, crc, len(veri), beyan, len(ad), 0, 0, 0, 0, 0, 0) + ad
    son = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, 1, 1, len(merkez), len(yerel) + len(veri), 0)
    with open(yol, "wb") as f:
        f.write(yerel + veri + merkez + son)
    return yol


def beyanli_buyuk(yol):
    """Açılmış boyutu 200 MB beyan eden paket (ana süreç beyana bakıp reddeder)."""
    bas = icerik_xml("", "<![CDATA[x\n]]>").encode("utf-8")
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    veri = c.compress(bas) + c.flush()
    ad = b"content.xml"
    beyan = 200 * 1024 * 1024
    yerel = struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, 0, 8, 0, 0, zlib.crc32(bas), len(veri), beyan, len(ad), 0) + ad
    merkez = struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, 0, 8, 0, 0, zlib.crc32(bas), len(veri), beyan, len(ad), 0, 0, 0, 0, 0, 0) + ad
    son = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, 1, 1, len(merkez), len(yerel) + len(veri), 0)
    with open(yol, "wb") as f:
        f.write(yerel + veri + merkez + son)
    return yol


def parolali(yol):
    """Öğesi şifreli bayraklı paket (genel amaçlı bayrak 0. bit)."""
    zip_yaz(yol, [("content.xml", icerik_xml("", "<![CDATA[x\n]]>").encode("utf-8"))])
    b = bytearray(open(yol, "rb").read())
    for imza, konum in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        i = b.find(imza)
        while i >= 0:
            b[i + konum] |= 1
            i = b.find(imza, i + 4)
    open(yol, "wb").write(bytes(b))
    return yol


def ic_ice_tablo(yol, derinlik=100):
    """100 kat iç içe tablo: motor derinlik sınırında (32) keser, belge yine çizilir ve kesildiği söylenir."""
    havuz, uz = "", 0
    ic = ""
    for d in range(derinlik):
        s = "Kat %d" % (d + 1)
        p = ('<paragraph Alignment="0"><content startOffset="%d" length="%d" family="Times New Roman" size="10" />'
             '<content startOffset="%d" length="1" family="Times New Roman" size="10" /></paragraph>' % (uz, len(s), uz + len(s)))
        havuz += s + "\n"
        uz += len(s) + 1
        ic = '<table tableName="T%d" columnCount="1" columnSpans="100" border="borderCell"><row rowName="r" rowType="dataRow"><cell>%s%s</cell></row></table>' % (d, p, ic)
    return zip_yaz(yol, [("content.xml", icerik_xml(ic, cdata(havuz)).encode("utf-8"))])


def main():
    k = os.path.abspath(sys.argv[1])
    os.makedirs(k, exist_ok=True)
    g = ut.udf_girdileri(k)   # kenar, bg, tablo, xml, yatay, uzun, buyuk, yorumlu, bozuk
    g.pop("buyuk", None)
    try:
        os.remove(os.path.join(k, "buyuk.udf"))
    except OSError:
        pass
    g["ozel"] = ozel_metinli(os.path.join(k, "ozel_metin.udf"))
    # Kötü niyetli ya da bozuk
    cok = os.path.join(k, "cok_buyuk.udf")
    if not os.path.isfile(cok) or os.path.getsize(cok) <= 40 * 1024 * 1024:
        with zipfile.ZipFile(cok, "w", zipfile.ZIP_STORED) as z:
            z.writestr("content.xml", icerik_xml("", "<![CDATA[x\n]]>").encode("utf-8"))
            z.writestr("dolgu.bin", os.urandom(41 * 1024 * 1024))
    g["cok_buyuk"] = cok
    bomba = os.path.join(k, "zip_bombasi.udf")
    if not os.path.isfile(bomba):
        zip_bombasi(bomba)
    g["bomba"] = bomba
    g["beyanli"] = beyanli_buyuk(os.path.join(k, "beyanli_buyuk.udf"))
    g["cok_ogeli"] = zip_yaz(os.path.join(k, "cok_ogeli.udf"), [("content.xml", icerik_xml("", "<![CDATA[x\n]]>").encode("utf-8"))]
                             + [("ek/%d.txt" % i, b"x") for i in range(1500)])
    g["iki_icerik"] = zip_yaz(os.path.join(k, "iki_icerik.udf"), [("content.xml", icerik_xml("", "<![CDATA[a\n]]>").encode("utf-8")),
                                                                    ("./Content.XML", icerik_xml("", "<![CDATA[b\n]]>").encode("utf-8"))])
    dis = icerik_xml("", "<![CDATA[&x;\n]]>").replace("<template", '<!DOCTYPE template [<!ENTITY x SYSTEM "file:///C:/Windows/win.ini">]>\n<template', 1)
    g["dis_varlik"] = zip_yaz(os.path.join(k, "dis_varlik.udf"), [("content.xml", dis.encode("utf-8"))])
    lol = '<!DOCTYPE template [<!ENTITY a "aaaaaaaaaa">' + "".join('<!ENTITY %s "%s">' % (chr(98 + i), ("&%s;" % chr(97 + i)) * 10) for i in range(9)) + ']>\n'
    gulus = icerik_xml("", "<![CDATA[x\n]]>").replace("<template", lol + "<template", 1).replace("<content>", "<content>&j;", 1)
    g["milyar"] = zip_yaz(os.path.join(k, "milyar_gulus.udf"), [("content.xml", gulus.encode("utf-8"))])
    g["parolali"] = parolali(os.path.join(k, "parolali.udf"))
    with open(os.path.join(k, "udf_degil.udf"), "wb") as f:
        f.write(bytes(range(256)) * 64)
    g["udf_degil"] = os.path.join(k, "udf_degil.udf")
    open(os.path.join(k, "bos.udf"), "wb").close()
    g["bos"] = os.path.join(k, "bos.udf")
    g["ic_ice"] = ic_ice_tablo(os.path.join(k, "ic_ice_tablo.udf"))
    print(json.dumps(g, ensure_ascii=False))


if __name__ == "__main__":
    main()
