# -*- coding: utf-8 -*-
"""Kilitli/açılamayan dosya için anlaşılır hata: çekirdekte PermissionError, arayüzde 'Farklı kaydet' önerisi."""

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:80])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

yama("core/islemler/notlar.py", [
("""    onbellek.birak(yol)
    doc = pymupdf.open(yol)
    if doc.is_encrypted:
        raise PermissionError("Belge şifreli; kaydedilemiyor.")""",
 """    onbellek.birak(yol)
    doc = belge_ac_yazmak_icin(yol)
    if doc.is_encrypted:
        raise PermissionError("Belge şifreli; kaydedilemiyor.")"""),
("""def y_notlar_kaydet(p):""",
 """def belge_ac_yazmak_icin(yol):
    \"\"\"Dosyayı açar; açılamıyorsa (başka programda kilitli vb.) Türkçe PermissionError verir.\"\"\"
    try:
        return pymupdf.open(yol)
    except Exception as e:
        if os.path.exists(yol):
            raise PermissionError("Dosya açılamadı; başka bir programda (örneğin bir PDF okuyucu) açık olabilir. (%s)" % e)
        raise FileNotFoundError("Dosya bulunamadı: %s" % yol)


def y_notlar_kaydet(p):"""),
])

yama("core/islemler/yapisal.py", [
("""        os.makedirs(anlik_klasor, exist_ok=True)
        anlik = os.path.join(anlik_klasor, uuid.uuid4().hex + ".pdf")
        shutil.copy2(yol, anlik)""",
 """        os.makedirs(anlik_klasor, exist_ok=True)
        anlik = os.path.join(anlik_klasor, uuid.uuid4().hex + ".pdf")
        try:
            shutil.copy2(yol, anlik)
        except OSError as e:
            raise PermissionError("Dosya okunamadı; başka bir programda (örneğin bir PDF okuyucu) açık olabilir. (%s)" % e)"""),
("""    acik = {}
    def belge_al(y):
        k = os.path.normcase(os.path.abspath(y))
        if k not in acik:
            acik[k] = pymupdf.open(y)
        return acik[k]""",
 """    acik = {}
    def belge_al(y):
        k = os.path.normcase(os.path.abspath(y))
        if k not in acik:
            acik[k] = notlar.belge_ac_yazmak_icin(y)
        return acik[k]"""),
])

yama("src/renderer/uygulama.js", [
("""function hataMetni(e) { return (e && (e.message || String(e))) || 'Bilinmeyen hata'; }""",
 """function hataMetni(e) { return ((e && (e.message || String(e))) || 'Bilinmeyen hata').replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }"""),
("""    const kilitli = /açık olabilir|yazılamadı|Permission/i.test(e.message || '');""",
 """    const kilitli = /açık olabilir|yazılamadı|okunamadı|Failed to open|Permission|EBUSY|EPERM/i.test(e.message || '');"""),
])
