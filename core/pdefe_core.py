# -*- coding: utf-8 -*-
"""PDEfe çekirdeği: PyMuPDF tabanlı yardımcı süreç.

Electron ana süreciyle stdin/stdout üzerinden satır başına bir JSON mesajıyla konuşur:
  İstek : {"id": 1, "method": "belge_bilgi", "params": {...}}
  Yanıt : {"id": 1, "result": ...}  ya da  {"id": 1, "error": {"code": .., "message": ..}}
  İlerleme: {"id": 1, "progress": {"yuzde": 40, "mesaj": "..."}}
"""
import sys
import os
import io
import json
import base64
import time
import traceback
import threading
import queue
import re
import statistics

import pymupdf

# Betik doğrudan çalıştırıldığında modül adı __main__ olur; alt modüller "from pdefe_core import onbellek"
# dediğinde ikinci bir kopya yüklenmesin diye kendimizi pdefe_core adıyla da kaydediyoruz.
if __name__ == "__main__":
    sys.modules["pdefe_core"] = sys.modules[__name__]

SURUM = "0.1.1"

# Çizilen görüntünün en büyük piksel sayısı (0.1.23, güvenlik denetimi): notun kutusu ve sayfa ölçüsü PDF'ten gelir; dev bir kutu ya da
# sayfa birkaç GB'lık görüntü isteyip bütün pencerelerin ortak çekirdeğini dondurabilirdi. 64 milyon piksel ≈ 8000×8000; 200 dpi'de A0
# sayfa (6622×9362) bile sığar.
EN_FAZLA_PIKSEL = 64_000_000


def olcek_sinirla(genislik, yukseklik, olcek):
    """genislik × yukseklik (pt) alanın olcek ile çizimi EN_FAZLA_PIKSEL'i geçecekse ölçeği küçültür; geçmiyorsa olduğu gibi döner."""
    alan = max(float(genislik), 1.0) * max(float(yukseklik), 1.0) * olcek * olcek
    return olcek if alan <= EN_FAZLA_PIKSEL else olcek * (EN_FAZLA_PIKSEL / alan) ** 0.5

# ---------------------------------------------------------------- belge önbelleği
class BelgeOnbellek:
    """Yola göre açık PyMuPDF belgelerini tutar; dosya değişmişse yeniden açar."""

    def __init__(self, en_fazla=8):
        self.en_fazla = en_fazla
        self.belgeler = {}   # yol -> (doc, mtime, boyut, son_kullanim)

    def al(self, yol):
        st = os.stat(yol)
        kayit = self.belgeler.get(yol)
        if kayit and kayit[1] == st.st_mtime and kayit[2] == st.st_size:
            kayit[0]  # dokun
            self.belgeler[yol] = (kayit[0], kayit[1], kayit[2], time.time())
            return kayit[0]
        if kayit:
            try:
                kayit[0].close()
            except Exception:
                pass
        # Yalnızca PDF olarak açılır (0.1.23, güvenlik denetimi): uzantıya bakılsaydı metin, HTML, SVG, EPUB, görsel dosyaları da açılır,
        # sayfa_metni gibi çağrılarla okunabilirdi (ana sürecin dosya:oku kısıtı aşılırdı)
        doc = pymupdf.open(yol, filetype="pdf")
        self.belgeler[yol] = (doc, st.st_mtime, st.st_size, time.time())
        if len(self.belgeler) > self.en_fazla:
            en_eski = min(self.belgeler.items(), key=lambda kv: kv[1][3])[0]
            try:
                self.belgeler[en_eski][0].close()
            except Exception:
                pass
            del self.belgeler[en_eski]
        return doc

    def birak(self, yol):
        kayit = self.belgeler.pop(yol, None)
        if kayit:
            try:
                kayit[0].close()
            except Exception:
                pass

    def hepsini_birak(self):
        for yol in list(self.belgeler):
            self.birak(yol)


onbellek = BelgeOnbellek()

# ---------------------------------------------------------------- yardımcılar
def png_base64(pix):
    return base64.b64encode(pix.tobytes("png")).decode("ascii")


def renk_hex(r):
    if not r:
        return None
    if len(r) == 1:
        r = (r[0], r[0], r[0])
    return "#%02x%02x%02x" % tuple(int(round(max(0, min(1, c)) * 255)) for c in r[:3])


def _yerimi_agaci(toc):
    """get_toc() düz listesini iç içe ağaca çevirir."""
    kok = []
    yigin = [(0, kok)]
    for seviye, baslik, sayfa, *ek in toc:
        dugum = {"baslik": baslik, "sayfa": sayfa, "cocuklar": []}
        if ek and isinstance(ek[0], dict):
            to = ek[0].get("to")
            if to is not None:
                try:
                    dugum["y"] = float(to.y)
                    dugum["x"] = float(to.x)
                except Exception:
                    pass
        while yigin and yigin[-1][0] >= seviye:
            yigin.pop()
        (yigin[-1][1] if yigin else kok).append(dugum)
        yigin.append((seviye, dugum["cocuklar"]))
    return kok


def _not_sozlugu(annot, sayfa_no):
    """Bir notun renderer'ın ihtiyaç duyduğu özet bilgisi."""
    bilgi = annot.info
    tur = annot.type[1]
    r = annot.rect
    d = {
        "xref": annot.xref,
        "sayfa": sayfa_no,
        "tur": tur,
        "rect": [r.x0, r.y0, r.x1, r.y1],
        "yazar": bilgi.get("title") or "",
        "icerik": bilgi.get("content") or "",
        "konu": bilgi.get("subject") or "",
        "olusturma": bilgi.get("creationDate") or "",
        "degisim": bilgi.get("modDate") or "",
        "ad": bilgi.get("name") or "",
        "opaklik": annot.opacity if annot.opacity is not None and annot.opacity >= 0 else 1,
        "renk": renk_hex(annot.colors.get("stroke")),
        "dolgu": renk_hex(annot.colors.get("fill")),
        "ap": annot.parent.parent.xref_get_key(annot.xref, "AP/N")[0] in ("xref", "dict", "stream"),
        "gizli": bool(annot.flags & pymupdf.PDF_ANNOT_IS_HIDDEN),
        "kilitli": bool(annot.flags & pymupdf.PDF_ANNOT_IS_LOCKED),
    }
    # Amaç (/IT, ör. PDF okuyucularının notlu vurgusu /HighlightNote): silinip yeniden eklenen notta korunsun
    try:
        it = annot.parent.parent.xref_get_key(annot.xref, "IT")
        if it[0] == "name":
            d["it"] = it[1].lstrip("/")
    except Exception:
        pass
    if tur in ("Highlight", "Underline", "StrikeOut", "Squiggly"):
        v = annot.vertices or []
        d["quads"] = [[p[0], p[1]] for p in v]
    if tur == "Text":
        d["simge"] = bilgi.get("name") or "Note"
    if tur == "FreeText":
        try:
            from islemler.notlar import pdefe_stil_oku
            st = pdefe_stil_oku(annot.parent.parent, annot.xref)
            if st:
                d["yazi"] = st
        except Exception:
            pass
    # Yanıt zinciri (IRT)
    try:
        irt = annot.irt_xref
        if irt:
            d["yanitXref"] = irt
    except Exception:
        pass
    return d

# ---------------------------------------------------------------- yöntemler
def y_ping(p):
    return {"ok": True, "surum": SURUM, "pymupdf": pymupdf.__version__}


def y_belge_bilgi(p):
    yol = p["yol"]
    doc = onbellek.al(yol)
    md = doc.metadata or {}
    return {
        "sayfa": doc.page_count,
        "boyut": os.path.getsize(yol),
        "sifreli": doc.is_encrypted,
        "biçim": md.get("format"),
        "baslik": md.get("title") or "",
        "yazar": md.get("author") or "",
        "uretici": md.get("producer") or "",
        "yerimi": _yerimi_agaci(doc.get_toc(simple=False)),
        "yerimiSayisi": len(doc.get_toc()),
        "notSayisi": sum(1 for pg in doc for _ in pg.annots()),
    }


# Küçük resmin biçimi (0.2.3, kullanıcı isteği: "sayfaları kaydırırken daha hızlı yüklensin. hafif geç yükleniyor gibi oluyor"). 0.2.2'ye
# dek her küçük resim PNG'ydi: taranmış sayfanın (gürültülü kâğıt dokusu) PNG'si büyük ve yavaştı (576 px'te 412 KB / 73 ms kodlama, JPEG
# 125 KB / 24 ms), Sayfalar panelinin 48 MB'lık önbelleği de çabuk doluyordu. Görsel ağırlıklı sayfa (taranmış evrak, büyük fotoğraf)
# artık JPEG; metin, çizim, küçük logo / kaşe / karekodlu sayfa PNG kalır: orada JPEG yazının çevresinde kusur bırakır ve çoğu zaman daha
# büyüktür (logolu ve karekodlu üretilmiş evrakta 576 px'te 1,9–3,4 kat). Ölçüt ölçülerek seçildi (PLAN.md "Revizyon 0.2.3"): sayfanın
# görselleri birlikte KUCUK_RESIM_GORSEL_PIKSEL'e ulaşmıyorsa (kaynak listesinden, içerik okunmadan) PNG; ulaşıyorsa çizilen görsellerin
# kapladığı alan sayfanın KUCUK_RESIM_KAPLAMA'sına ulaşırsa JPEG. Kaynak listesi sayfanın çizmediği görselleri de içerebilir (kaynak
# sözlüğünü sayfalarla paylaşan üreticiler): karar çizilenlerin alanıyla verilir. Satır içi (inline) görseller kaynak listesinde yok: öyle
# taranmış sayfa PNG kalır (doğru, yalnızca büyük).
KUCUK_RESIM_GORSEL_PIKSEL = 500_000   # sayfadaki görsellerin toplam piksel sayısı (ör. 72 dpi'lik A4 taraması 0,5 MP; 600×600 logo 0,36 MP)
KUCUK_RESIM_KAPLAMA = 0.25            # çizilen görsellerin sayfaya oranı (sayfanın dörtte biri: fotoğraflı bilirkişi raporu sayfası ~0,3)
KUCUK_RESIM_JPEG_KALITE = 85


def kucuk_resim_bicimi(sayfa):
    """Sayfanın küçük resminin biçimi: görsel ağırlıklıysa 'jpeg', değilse 'png' (KUCUK_RESIM_* ölçütü)."""
    try:
        if sum(g[2] * g[3] for g in sayfa.get_images(full=True)) < KUCUK_RESIM_GORSEL_PIKSEL:
            return "png"
        # Görsellerin kutuları sayfanın döndürülmemiş koordinatlarında: alan da döndürülmemiş sayfanınki (/Rotate'li sayfada sayfa.rect yan)
        r = (sayfa.rect * sayfa.derotation_matrix).normalize()
        kaplama = 0.0
        for g in sayfa.get_image_info():
            k = pymupdf.Rect(g["bbox"]) & r
            if not k.is_empty:
                kaplama += k.width * k.height
        return "jpeg" if kaplama >= KUCUK_RESIM_KAPLAMA * max(r.width * r.height, 1) else "png"
    except Exception:
        return "png"


def y_kucuk_resim(p):
    """Bir sayfanın küçük resmi (base64): {veri, bicim ('png' | 'jpeg'), genislik, yukseklik}. 0.2.3'e dek yalnızca PNG ve alanı 'png'."""
    doc = onbellek.al(p["yol"])
    no = int(p.get("sayfa", 1)) - 1
    genislik = float(p.get("genislik", 160))
    sayfa = doc[no]
    r = sayfa.rect
    olcek = olcek_sinirla(r.width, r.height, genislik / max(r.width, 1))
    pix = sayfa.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), annots=True, alpha=False)
    bicim = kucuk_resim_bicimi(sayfa)
    veri = pix.tobytes("jpeg", jpg_quality=KUCUK_RESIM_JPEG_KALITE) if bicim == "jpeg" else pix.tobytes("png")
    return {"veri": base64.b64encode(veri).decode("ascii"), "bicim": bicim, "genislik": pix.width, "yukseklik": pix.height}


def y_sayfa_goruntu(p):
    """Bir sayfanın tam çözünürlüklü görüntüsü (yazdırma için). notlar=False ise notsuz."""
    doc = onbellek.al(p["yol"])
    pg = doc[int(p["sayfa"]) - 1]
    dpi = int(p.get("dpi", 200))
    # Ölçek tamsayı dpi'ye yuvarlanmaz: çok büyük sayfada (ör. /UserUnit) dpi 1'e inince bile sınır aşılırdı (0.1.23)
    olcek = olcek_sinirla(pg.rect.width, pg.rect.height, dpi / 72)
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), annots=bool(p.get("notlar", True)), alpha=False)
    pix.set_dpi(max(1, round(72 * olcek)), max(1, round(72 * olcek)))   # görüntünün çözünürlük bilgisi önceki gibi (dpi ile çizimdeki)
    bicim = p.get("bicim", "png")
    veri = pix.tobytes("jpeg", jpg_quality=int(p.get("kalite", 90))) if bicim == "jpeg" else pix.tobytes("png")
    return {"veri": base64.b64encode(veri).decode("ascii"), "bicim": bicim, "genislik": pix.width, "yukseklik": pix.height,
            "genislikPt": pg.rect.width, "yukseklikPt": pg.rect.height}


def y_notlar(p):
    """Belgedeki bütün notlar (isteğe bağlı tek sayfa)."""
    doc = onbellek.al(p["yol"])
    sayfa_no = p.get("sayfa")
    sonuc = []
    sayfalar = [doc[int(sayfa_no) - 1]] if sayfa_no else doc
    for pg in sayfalar:
        for a in pg.annots():
            if a.type[1] == "Popup":
                continue
            sonuc.append(_not_sozlugu(a, pg.number + 1))
    return {"notlar": sonuc}


def y_not_gorunum(p):
    """Bir notun görünüm akışını (AP) saydam PNG olarak çizer (damga, çizim vb. için)."""
    doc = onbellek.al(p["yol"])
    pg = doc[int(p["sayfa"]) - 1]
    xref = int(p["xref"])
    olcek = float(p.get("olcek", 1.0))
    for a in pg.annots():
        if a.xref == xref:
            r = a.rect
            olcek = olcek_sinirla(r.width, r.height, olcek)
            pix = a.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), alpha=True)
            return {"png": png_base64(pix), "rect": [r.x0, r.y0, r.x1, r.y1], "genislik": pix.width, "yukseklik": pix.height}
    raise KeyError("not bulunamadı: %d" % xref)


def y_gorsel_kutulari(p):
    """Sayfadaki görsellerin kutuları (koyu sayfa modunda görselleri korumak için)."""
    doc = onbellek.al(p["yol"])
    pg = doc[int(p["sayfa"]) - 1]
    kutular = []
    for bilgi in pg.get_image_info():
        b = bilgi.get("bbox")
        if b:
            kutular.append([b[0], b[1], b[2], b[3]])
    return {"kutular": kutular}


# Madde imi: bununla başlayan satır yeni paragraftır (■ • ● ◦ ▪ ➢ ✓ …, Symbol / Wingdings imlerinin özel kullanım alanı karşılıkları,
# ardından boşluk gelen tire). Numaralı maddeler ("1.", "a)", "(2)") temizMetin'de önceki satırın noktalamasıyla ayrılır: "Kanunun /
# 49. maddesi" gibi satır başındaki sayı paragraf başı değildir
MADDE_IMI = re.compile(r"^([■-◿•‣⁃∙➢➤✓✔❖-]|[-–—](\s|$))")
# Numaralı madde ("2.", "(3)", "a)", "IV.", "1-"): sayı ya da noktalamayla biten satırdan sonra geliyorsa yeni paragraftır
NUMARALI_MADDE = re.compile(r"^\(?(\d{1,3}|[a-zçğıöşü]|[IVX]{1,6}|[A-ZÇĞİÖŞÜ])[.)-]$")
MADDE_ONCESI = re.compile(r"[\d.:;!?…)\"”’]$")
NOKTALI_DOLGU = re.compile(r"(\.\s?){5,}|…{2,}")   # içindekiler satırı: başlık …… sayfa
# Boş satır: alt alta iki satırın üstten üste uzaklığı çevredeki satır aralığının (_yerel_aralik) BOS_SATIR katı ya da fazlasıysa
# araya bir satır sığar. Arada boş paragraf varsa (yalnızca boşluktan oluşan satır: Word ve UYAP boş paragrafı bir boşluk karakteriyle
# yazar) BOS_SATIR_IZLI katı yeter: tek aralıklı boş paragraf 1,2 aralıklı metinde 1,83 kat tutar (TMK s.113, s.120). Paragraf aralığı
# boş satır sayılmaz: UYAP'ta 0,4 ≈ 1,65 kat, bir Word dilekçesinde 1,78–1,82 kat ve orada boş paragraf yok. Ölçüm (0.1.11): TBK'de
# 627 boş satırın 620'si 1,9–2,1 kat, en küçüğü 1,94; TMK'de 1023 boş satırın 8'i yalnızca boş paragrafla bulunur
BOS_SATIR = 1.9
BOS_SATIR_IZLI = 1.7


def _satir_gruplari(sozcukler):
    """Sözcükleri PyMuPDF (blok, satır) gruplarına toplar: anahtar → {blok, x0, y0, x1, y1, sozcukler}."""
    gruplar = {}
    for w in sozcukler:
        g = gruplar.get((w[5], w[6]))
        if g is None:
            gruplar[(w[5], w[6])] = g = {"blok": w[5], "x0": w[0], "y0": w[1], "x1": w[2], "y1": w[3], "sozcukler": []}
        else:
            g["x0"], g["y0"], g["x1"], g["y1"] = min(g["x0"], w[0]), min(g["y0"], w[1]), max(g["x1"], w[2]), max(g["y1"], w[3])
        g["sozcukler"].append(w)
    return gruplar


def _ayni_sutun(a, b):
    """İki satır aynı sütunda mı: yatayda kısa olanın genişliğinin %30'undan çok örtüşüyorlar."""
    ortusme = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
    return ortusme > 0.3 * max(1.0, min(a["x1"] - a["x0"], b["x1"] - b["x0"]))


def _sutun(satir, tum):
    """Satırın sütunu (sol, sağ): sol kenar, sütunda en az iki satırın başladığı en soldaki x (tek başına duran kenar notu ya da
    madde numarası kenar sayılmaz; böyle bir yer yoksa en soldaki başlangıç); sağ kenar, sütundaki satırların en sağdaki bitişi.
    Sütundaki satırlar: bu satırla yatayda örtüşenler (_ayni_sutun)."""
    ayni = [s for s in tum if _ayni_sutun(satir, s)] or [satir]
    xs = sorted(s["x0"] for s in ayni)
    sol = next((a for a, b in zip(xs, xs[1:]) if b - a <= 1.5), xs[0])
    return sol, max(s["x1"] for s in ayni)


def _satir_araligi(tum):
    """Sayfanın olağan satır aralığı (satır üstünden altındakinin üstüne, pt): her satırdan aynı sütunda hemen altındaki satıra
    olan uzaklıkların ortancası (satır yüksekliğinin üç katından uzak olanlar paragraf ya da bölüm arasıdır, sayılmaz)."""
    sirali = sorted(tum, key=lambda s: s["y0"])
    farklar = []
    for i, a in enumerate(sirali):
        h = a["y1"] - a["y0"]
        for b in sirali[i + 1:]:
            fark = b["y0"] - a["y0"]
            if fark > 3 * h:
                break
            if fark > 0.5 * h and _ayni_sutun(a, b):
                farklar.append(fark)
                break
    return statistics.median(farklar) if farklar else None


def _komsu_uzakligi(s, tum, yukari):
    """s satırından yatayda örtüşen, benzer boydaki (yüksekliği en az 0,7 katı: üst simge ya da dipnot imi değil) en yakın üstteki
    (yukari) ya da alttaki satıra üstten üste uzaklık (pt) ya da None. Aynı hizadakiler (yarım satırdan yakın) sayılmaz."""
    h = s["y1"] - s["y0"]
    en = None
    for t in tum:
        if t is s or min(s["x1"], t["x1"]) - max(s["x0"], t["x0"]) <= 0 or t["y1"] - t["y0"] < 0.7 * h:
            continue
        d = s["y0"] - t["y0"] if yukari else t["y0"] - s["y0"]
        if d > 0.5 * h and (en is None or d < en):
            en = d
    return en


def _yerel_aralik(ust, alt, tum):
    """Alt alta iki satırın arasındaki boşluğu ölçmeye yarayan satır aralığı: üsttekinin üstündeki ve alttakinin altındaki komşusuna
    uzaklıkların küçüğü; ikisi de yoksa None. Sayfanın ortancası yetmez: aynı sayfada aralık değişebilir (TTK s.55'te 17,64 ve 16,56;
    dipnotlar) ve çift aralıklı paragrafın satırları olağan aralıktadır."""
    adaylar = [d for d in (_komsu_uzakligi(ust, tum, True), _komsu_uzakligi(alt, tum, False)) if d]
    return min(adaylar) if adaylar else None


def _bos_paragraflar(pg, donusum=None):
    """Sayfadaki yalnızca boşluktan oluşan metin satırlarının kutuları [(x0, y0, x1, y1)]: boş paragraflar. get_text("words") bunları
    vermez; görseller okunmaz (TEXTFLAGS_TEXT). donusum: kutuların çevrileceği düzlem (y_metin_sec: döndürülmüş sayfada ekrandaki)."""
    kutular = []
    for b in pg.get_text("dict", flags=pymupdf.TEXTFLAGS_TEXT)["blocks"]:
        for ln in b.get("lines", ()):
            metin = "".join(s["text"] for s in ln["spans"])
            if metin and not metin.strip():
                kutular.append(tuple(pymupdf.Rect(ln["bbox"]) * donusum) if donusum else tuple(ln["bbox"]))
    return kutular


def _dondurme_matrisi(pg, aci):
    """Döndürülmemiş düzlemden, sayfa saat yönünde aci derece döndürülmüş olsaydı ekranda görünecek düzleme matris (0.2.4): sayfanın kendi
    döndürmesi için rotation_matrix, ötekiler için PyMuPDF'in aynı kuralıyla (görünür kutunun boyutundan)."""
    aci %= 360
    if aci == pg.rotation % 360:
        return pymupdf.Matrix(pg.rotation_matrix)
    w, h = pg.cropbox.width, pg.cropbox.height
    return {0: pymupdf.Matrix(1, 0, 0, 1, 0, 0), 90: pymupdf.Matrix(0, 1, -1, 0, h, 0), 180: pymupdf.Matrix(-1, 0, 0, -1, w, h),
            270: pymupdf.Matrix(0, -1, 1, 0, 0, w)}[aci]


def _metin_duzlemi(pg, taninan=None):
    """metin_sec'in döndürülmüş sayfada çalışacağı düzlem (0.1.24): PDF metninin satırlarının çoğu ekranda soldan sağa okunuyorsa (sayfanın
    yazısı ekranda düz) sayfanın döndürme matrisi, döndürülmemiş düzlemde soldan sağa okunuyorsa (sayfa ekranda yan duruyor; 0.1.23'teki
    gibi) None. Sayfada PDF metni yoksa (yalnızca tanınan yazı: tanıyıcı ekrandaki düz yazıyı okur) döndürme matrisi.
    taninan (0.2.4): seçime katılan tanınan satırların yazı yönleri (yazi_tanima.satir_yonleri; döndürülmemiş düzlemde birim vektör).
    Verilince dört düzlem de adaydır: PDF metninin ve tanınan yazının satırlarından en çoğunun soldan sağa okunduğu düzlem (eşitlikte
    sayfanın kendi döndürmesi, sonra döndürülmemiş düzlem). Yan ya da ters taranmış sayfada tanıyıcı yazıyı çevirip okur; satırlar
    ekranda dikey ya da ters durur, y'ye göre sıralanınca karışıyordu. Verilmezse eskisi gibi yalnızca iki aday."""
    donme = pg.rotation % 360
    if not donme and not taninan:
        return None
    yonler = [ln["dir"] for b in pg.get_text("dict", flags=pymupdf.TEXTFLAGS_TEXT)["blocks"] for ln in b.get("lines", ())]
    adaylar = (donme, 0)
    if taninan:
        yonler += list(taninan)
        adaylar = (donme,) + tuple(a for a in (0, 90, 180, 270) if a != donme)
    en, en_oy = donme, -1
    for aci in adaylar:
        m = _dondurme_matrisi(pg, aci)
        oy = sum(1 for dx, dy in yonler if dx * m.a + dy * m.c > 0.9)
        if oy > en_oy:
            en, en_oy = aci, oy
    return _dondurme_matrisi(pg, en) if en else None


def y_metin_sec(p):
    """Verilen satır dikdörtgenlerindeki (PDF koordinatı, üst-sol köken) sözcükleri okuma sırasıyla döndürür. Sözcük, merkezi
    kutulardan birinin içindeyse seçilmiş sayılır (böylece komşu satırlardan yinelenen parça gelmez). Çıktıda paragraf girintisi
    baştaki boşlukla, paragraf arası boş satırla belirtilir; renderer'ın temizMetin'i satırları bunlara göre birleştirir.
    Paragraf arası PyMuPDF bloğunun değişmesidir. Ancak her satırı ayrı blok olan belgelerde (mevzuat PDF'leri gibi) blok değişimi
    paragraf demek değildir: orada satır, aynı sütunda (sol kenarları aynı), olağan satır aralığıyla (en çok 1,3 katı) ve içerik
    sırasında da hemen ardından (blok numarası 1–3 artarak) alta geçen, sütunun sağına yakın biten (genişliğin en az %80'i)
    satırın devamı sayılır. Kısa ya da ortalanmış satırdan (başlık, adres, paragrafın son satırı), büyük boşluktan, madde iminden,
    içindekiler satırından ve noktalamadan sonraki numaralı maddeden önce paragraf arası konur; sayfa başlığı ve altlığı (içerikte
    başka yerde yazılmış) ayrı kalır. Girinti de sütunun sol kenarına göre ölçülür. 0.1.9'a dek bu belgelerde her satır
    ayrı paragraf çıkıyor, girintiler görünmüyordu (tek satırlık blok kendi kenarına göre ölçülüyordu); UDF'ye yapıştırınca her
    satır ayrı paragraf oluyordu.
    Boş satır (bkz. BOS_SATIR): alt alta iki satırın arasına bir satır sığıyorsa ya da arada boş paragraf varsa paragraf arası iki boş
    satırla belirtilir; temizMetin oraya boş paragraf koyar. Seçimin bu sayfadaki ilk satırının hemen üstünde ya da son satırının
    hemen altında boş paragraf varsa bas_bosluk / son_bosluk true döner: renderer sayfaların metnini birleştirirken sayfa geçişine
    boş satır koyar. 0.1.10'a dek boş satırlar kayboluyordu: kanunda bölüm başlığından önceki boşluk UDF'ye yapıştırınca yoktu.
    ilk_dolu: seçimin bu sayfadaki ilk satırı, sayfadaki tam hâliyle sütunun sağına yakın bitiyor (satır başına blok kuralındaki %80).
    Seçim satırın ortasından başlayınca temizMetin seçilen parçayı kısa satır sayıp noktalamadan sonra paragrafı bölüyordu (0.2.1)."""
    doc = onbellek.al(p["yol"])
    pg = doc[int(p["sayfa"]) - 1]
    kutular = [pymupdf.Rect(*k) for k in p["kutular"]]
    tum = pg.get_text("words")
    secimde = lambda w: any(k.x0 <= (w[0] + w[2]) / 2 <= k.x1 and k.y0 <= (w[1] + w[3]) / 2 <= k.y1 for k in kutular)
    # Görsellerde tanınan sözcükler (0.1.24, islemler/yazi_tanima.py): metin katmanında seçilebildikleri için kopyaya da girerler.
    # Her satır ayrı bloktur; alt alta tam satırlar aşağıdaki "satır başına blok" kuralıyla paragrafta birleşir. Yalnızca seçim tanınan
    # bir sözcüğe değiyorsa katılırlar: yalnızca PDF metni seçilmişken sayfanın sol kenarı, sütunlar ve satır aralığı tanınan yazıdan
    # (ör. kenardaki bir kaşe) etkilenmesin; her satır girintili çıkıp ayrı paragraf oluyordu (bağımsız incelemede bulundu)
    taninan_yonleri = None
    try:
        from islemler import yazi_tanima
        taninan = yazi_tanima.sozcukler(doc, p["yol"], int(p["sayfa"]), kutular)
        if any(secimde(w) for w in taninan):
            tum = tum + taninan
            taninan_yonleri = yazi_tanima.satir_yonleri(p["yol"], int(p["sayfa"]))
    except ImportError:
        pass
    # Döndürülmüş sayfada (/Rotate) satırlar ekranda okundukları düzlemde sıralanır (0.1.24): sözcükler ve kutular döndürülmemiş
    # düzlemdedir; ekranda düz okunan yazı orada dikeydir ve satırlar karışık sırayla çıkıyordu (yan çevrilmiş taranmış sayfa, yatay sayfa).
    # Tanınan yazı yan ya da ters duruyorsa (0.2.4) o yazının okunduğu düzlemde
    donusum = _metin_duzlemi(pg, taninan_yonleri)
    if donusum:
        tum = [(*tuple(pymupdf.Rect(w[:4]) * donusum), *w[4:]) for w in tum]
        kutular = [k * donusum for k in kutular]
    secili = [w for w in tum if secimde(w)]
    if not secili:
        return {"metin": "", "bas_bosluk": False, "son_bosluk": False, "ilk_dolu": False}
    sayfa_satirlari = _satir_gruplari(tum)
    tum_satirlar = list(sayfa_satirlari.values())
    blok_satir_sayisi, blok_sol = {}, {}
    for s in tum_satirlar:
        blok_satir_sayisi[s["blok"]] = blok_satir_sayisi.get(s["blok"], 0) + 1
        blok_sol[s["blok"]] = min(blok_sol.get(s["blok"], 1e9), s["x0"])
    sayfa_sol = min(blok_sol.values()) if blok_sol else 0
    tek_satirli = lambda blok: blok_satir_sayisi.get(blok, 0) <= 1
    sutunlar = {}   # satır anahtarı → (sol, sağ)
    sutun = lambda anahtar: sutunlar.get(anahtar) or sutunlar.setdefault(anahtar, _sutun(sayfa_satirlari[anahtar], tum_satirlar))
    olcu = {}   # gerekince bir kez hesaplananlar: sayfanın olağan satır aralığı, boş paragrafları

    def sayfa_araligi():
        if "aralik" not in olcu:
            olcu["aralik"] = _satir_araligi(tum_satirlar) or 0
        return olcu["aralik"]

    def bos_paragraf(y0, y1, sol, sag):
        """Ortası [y0, y1] yüksekliğinde olan ve [sol, sag] sütununa değen boş paragraf var mı."""
        if "bos" not in olcu:
            olcu["bos"] = _bos_paragraflar(pg, donusum)
        return any(y0 <= (b[1] + b[3]) / 2 <= y1 and b[0] < sag + 2 and b[2] > sol - 2 for b in olcu["bos"])

    def bos_satir(ust_anahtar, alt_anahtar):
        """Alt alta iki satırın arasında boş satır var mı (bkz. BOS_SATIR)."""
        ust, alt = sayfa_satirlari[ust_anahtar], sayfa_satirlari[alt_anahtar]
        fark = alt["y0"] - ust["y0"]
        # Satır aralığı satır boyundan pek kısa olmaz: bundan yakın satırlar ölçülmeden geçilir (olağan aralık)
        if fark < 1.3 * min(ust["y1"] - ust["y0"], alt["y1"] - alt["y0"]):
            return False
        olagan = _yerel_aralik(ust, alt, tum_satirlar) or sayfa_araligi()
        if not olagan:
            return False
        if fark >= BOS_SATIR * olagan:
            return True
        # Boş paragraf varsa daha küçük boşluk yeter. İki komşu da boş satırla ayrıksa (alt alta tek satırlık başlıklar) yerel aralık
        # boş satırı da içerir: sayfanın ortancası daha küçükse o
        (sol, sag), (sol2, sag2) = sutun(ust_anahtar), sutun(alt_anahtar)
        return fark >= BOS_SATIR_IZLI * min(olagan, sayfa_araligi() or olagan) and bos_paragraf(ust["y1"] - 1, alt["y0"] + 1, min(sol, sol2), max(sag, sag2))

    def bitisik_bos_paragraf(anahtar, alta):
        """Satırın hemen altında (alta) ya da üstünde, sütununda boş paragraf var mı: ortası satırın dışında ve satırın ortasından en çok
        1,3 satır aralığı uzakta (kanunlarda sayfa sonundaki boş paragraf 0,97–1,09). UYAP (iText) sayfanın sonuna, paragraf sonraki sayfada
        sürerken de son satırın 1,56–2,25 satır aralığı altına bir boşluk satırı yazar: o boş satır değildir. Satır aralığı, komşu satıra
        uzaklık ile sayfanın ortancasının küçüğü (komşu boş satırla ayrık olabilir)."""
        s = sayfa_satirlari[anahtar]
        adaylar = [x for x in (_komsu_uzakligi(s, tum_satirlar, alta), sayfa_araligi()) if x]
        olagan = min(adaylar) if adaylar else s["y1"] - s["y0"]
        orta, (sol, sag) = (s["y0"] + s["y1"]) / 2, sutun(anahtar)
        return bos_paragraf(s["y1"] - 1, orta + 1.3 * olagan, sol, sag) if alta else bos_paragraf(orta - 1.3 * olagan, s["y0"] + 1, sol, sag)

    sirali = sorted(_satir_gruplari(secili).items(), key=lambda kv: (kv[1]["y0"], kv[1]["x0"]))
    cikti = []
    onceki = None   # önceki satırın anahtarı; satırlar sayfadaki tam hâliyle (seçilmeyen sözcükleri dahil) ölçülür
    for anahtar, s in sirali:
        tam = sayfa_satirlari[anahtar]
        blok = s["blok"]
        if onceki is not None and bos_satir(onceki, anahtar):
            cikti += ["", ""]   # paragraf arası ve boş satır
        elif onceki is not None and blok != onceki[0]:
            ayir = True
            # Satır başına blok: aynı sütunda, olağan aralıkla alta geçen satır, üstteki dolu satırın devamı olabilir
            if tek_satirli(blok) and tek_satirli(onceki[0]):
                ust = sayfa_satirlari[onceki]
                (sol, sag), (sol2, _) = sutun(onceki), sutun(anahtar)
                aralik = sayfa_araligi()
                fark = tam["y0"] - ust["y0"]
                ilk = min(tam["sozcukler"], key=lambda x: x[0])[4]
                ust_metin = " ".join(x[4] for x in sorted(ust["sozcukler"], key=lambda x: x[0]))
                alt_metin = " ".join(x[4] for x in sorted(tam["sozcukler"], key=lambda x: x[0]))
                ayir = not (abs(sol - sol2) <= 2 and aralik and 0.5 * (ust["y1"] - ust["y0"]) < fark <= 1.3 * aralik
                            and 0 < blok - onceki[0] <= 3   # içerik sırası da aşağı akıyor (sayfa başlığı / altlığı ayrı katmandır)
                            and ust["x1"] >= sol + 0.8 * (sag - sol) and not MADDE_IMI.match(ilk)
                            and ust_metin != ust_metin.upper()   # büyük harfli satır başlıktır (kapak, mahkeme adı)
                            and not NOKTALI_DOLGU.search(ust_metin) and not NOKTALI_DOLGU.search(alt_metin)
                            and not (NUMARALI_MADDE.match(ilk) and MADDE_ONCESI.search(ust_metin)))
            if ayir:
                cikti.append("")
        ws = sorted(s["sozcukler"], key=lambda x: x[0])
        kenar = sutun(anahtar)[0] if tek_satirli(blok) else min(blok_sol.get(blok, sayfa_sol), sayfa_sol + 40)
        cikti.append(("    " if ws[0][0] - kenar > 8 else "") + " ".join(x[4] for x in ws))
        onceki = anahtar
    ilk = sirali[0][0]
    sol, sag = sutun(ilk)
    return {"metin": "\n".join(cikti), "bas_bosluk": bitisik_bos_paragraf(ilk, False),
            "son_bosluk": bitisik_bos_paragraf(sirali[-1][0], True), "ilk_dolu": sayfa_satirlari[ilk]["x1"] >= sol + 0.8 * (sag - sol)}


def y_sayfa_metni(p):
    """Bir sayfanın düz metni (arama dizini için)."""
    doc = onbellek.al(p["yol"])
    pg = doc[int(p["sayfa"]) - 1]
    return {"metin": pg.get_text("text")}


def y_belge_birak(p):
    """Belgeyi önbellekten bırakır (dosya tanıtıcısı kapanır; Windows'ta dosya yeniden silinip adlandırılabilir). Aynı dosyanın
    başka yazımla anahtarlanmış girdileri de bırakılır: sekmeler ham yolla, araç yöntemleri os.path.abspath ile açar (0.1.12)."""
    yol = p["yol"]
    hedef = os.path.normcase(os.path.abspath(yol))
    for anahtar in list(onbellek.belgeler):
        if anahtar == yol or os.path.normcase(os.path.abspath(anahtar)) == hedef:
            onbellek.birak(anahtar)
    return {"ok": True}


class IptalEdildi(Exception):
    """Kullanıcı işlemi iptal etti (ilerleme noktasında fark edilir)."""


class Ertelenmis:
    """Yanıtı başka bir iş parçacığında hazırlanan isteğin dönüş değeri (0.1.24, yazı tanıma): işçi beklemeden sıradaki isteğe geçer.
    baslat(bitir) işi başlatır; iş bitince bitir(sonuc, hata) bir kez çağrılır ve yanıt oradan yazılır."""

    def __init__(self, baslat):
        self.baslat = baslat


_iptal_bayraklari = set()
_iptal_kilidi = threading.Lock()


def y_iptal(p):
    """Verilen istek kimliği için iptal bayrağı koyar (ana iş parçacığında, kuyruğu beklemeden işlenir)."""
    try:
        hedef = int(p.get("id"))
    except (TypeError, ValueError):
        return {"ok": False}
    with _iptal_kilidi:
        _iptal_bayraklari.add(hedef)
    return {"ok": True}


YONTEMLER = {
    "ping": y_ping,
    "belge_bilgi": y_belge_bilgi,
    "kucuk_resim": y_kucuk_resim,
    "notlar": y_notlar,
    "sayfa_goruntu": y_sayfa_goruntu,
    "not_gorunum": y_not_gorunum,
    "gorsel_kutulari": y_gorsel_kutulari,
    "metin_sec": y_metin_sec,
    "sayfa_metni": y_sayfa_metni,
    "belge_birak": y_belge_birak,
    "iptal": y_iptal,
}

# Araç modülleri (küçült, sayfalar, ayır, birleştir, notlar) ayrı dosyalarda kaydolur.
try:
    from islemler import kaydol  # noqa: E402
    kaydol(YONTEMLER)
except ImportError:
    pass

# ---------------------------------------------------------------- ana döngü
def yaz(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


_yaz_kilidi = threading.Lock()


def yaz_guvenli(obj):
    with _yaz_kilidi:
        yaz(obj)


def ilerleme_yap(istek_id):
    def f(yuzde, mesaj=""):
        with _iptal_kilidi:
            iptal = istek_id in _iptal_bayraklari
        if iptal:
            raise IptalEdildi()
        yaz_guvenli({"id": istek_id, "progress": {"yuzde": yuzde, "mesaj": mesaj}})
    return f


def _istek_isle(istek):
    istek_id = istek.get("id")
    yontem = istek.get("method")
    params = istek.get("params") or {}
    f = YONTEMLER.get(yontem)
    if not f:
        yaz_guvenli({"id": istek_id, "error": {"code": -32601, "message": "Bilinmeyen yöntem: %s" % yontem}})
        return
    try:
        params["_ilerleme"] = ilerleme_yap(istek_id)
        sonuc = f(params)
        if isinstance(sonuc, Ertelenmis):
            sonuc.baslat(lambda r, hata: _ertelenmis_yanit(istek_id, r, hata))
            return
        yaz_guvenli({"id": istek_id, "result": sonuc})
    except IptalEdildi:
        yaz_guvenli({"id": istek_id, "error": {"code": -32800, "message": "İşlem iptal edildi."}})
    except Exception as e:
        yaz_guvenli({"id": istek_id, "error": {"code": -32000, "message": str(e), "data": traceback.format_exc()}})
    finally:
        with _iptal_kilidi:
            _iptal_bayraklari.discard(istek_id)


def _ertelenmis_yanit(istek_id, sonuc, hata):
    if hata is None:
        yaz_guvenli({"id": istek_id, "result": sonuc})
    else:
        yaz_guvenli({"id": istek_id, "error": {"code": -32000, "message": str(hata),
                                               "data": "".join(traceback.format_exception(hata))}})


def _isci(kuyruk):
    while True:
        istek = kuyruk.get()
        if istek is None:
            return
        _istek_isle(istek)


def main():
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    # PyMuPDF / MuPDF iletileri (bozuk PDF uyarıları) varsayılan olarak stdout'a, yani ana süreçle konuşulan JSON kanalına yazılıyordu
    # (0.1.23, güvenlik denetimi): yanıt satırlarına karışmasınlar diye stderr'e
    try:
        pymupdf.set_messages(stream=sys.stderr)
    except Exception:
        pass
    kuyruk = queue.Queue()
    isci = threading.Thread(target=_isci, args=(kuyruk,), daemon=True)
    isci.start()
    for satir in sys.stdin:
        satir = satir.strip()
        if not satir:
            continue
        try:
            istek = json.loads(satir)
        except Exception as e:
            yaz_guvenli({"id": None, "error": {"code": -32700, "message": "Bozuk JSON: %s" % e}})
            continue
        if istek.get("method") == "iptal":
            # Kuyruğu beklemeden, çalışan işe bayrak koy
            yaz_guvenli({"id": istek.get("id"), "result": y_iptal(istek.get("params") or {})})
            continue
        kuyruk.put(istek)
    kuyruk.put(None)
    isci.join(timeout=5)
    # Tanıma iş parçacığı çalıştıysa yorumlayıcı olağan yoldan kapatılmaz (0.1.24): süren bir WinRT işinin geri çağrısı kapanmakta olan
    # yorumlayıcıya girip çıkışta çökme penceresi açabilirdi. Yazılanlar boşaltılıp süreç hemen sonlandırılır
    try:
        from islemler import yazi_tanima
        tanima = yazi_tanima.calisti()
    except ImportError:
        tanima = False
    if tanima:
        try:
            yazi_tanima.bitmesini_bekle()   # sıradaki tanımaların yanıtları yazılsın
            sys.stdout.flush()
            sys.stderr.flush()
        finally:
            os._exit(0)


if __name__ == "__main__":
    main()
