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

import pymupdf

# Betik doğrudan çalıştırıldığında modül adı __main__ olur; alt modüller "from pdefe_core import onbellek"
# dediğinde ikinci bir kopya yüklenmesin diye kendimizi pdefe_core adıyla da kaydediyoruz.
if __name__ == "__main__":
    sys.modules["pdefe_core"] = sys.modules[__name__]

SURUM = "0.1.0"

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
        doc = pymupdf.open(yol)
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


def y_kucuk_resim(p):
    """Bir sayfanın küçük resmi (PNG, base64)."""
    doc = onbellek.al(p["yol"])
    no = int(p.get("sayfa", 1)) - 1
    genislik = float(p.get("genislik", 160))
    sayfa = doc[no]
    r = sayfa.rect
    olcek = genislik / max(r.width, 1)
    pix = sayfa.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), annots=True, alpha=False)
    return {"png": png_base64(pix), "genislik": pix.width, "yukseklik": pix.height}


def y_sayfa_goruntu(p):
    """Bir sayfanın tam çözünürlüklü görüntüsü (yazdırma için). notlar=False ise notsuz."""
    doc = onbellek.al(p["yol"])
    pg = doc[int(p["sayfa"]) - 1]
    dpi = int(p.get("dpi", 200))
    pix = pg.get_pixmap(dpi=dpi, annots=bool(p.get("notlar", True)), alpha=False)
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
            pix = a.get_pixmap(matrix=pymupdf.Matrix(olcek, olcek), alpha=True)
            r = a.rect
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


def y_metin_sec(p):
    """Verilen satır dikdörtgenlerindeki (PDF koordinatı, üst-sol köken) sözcükleri okuma
    sırasıyla döndürür. Sözcük, merkezi kutulardan birinin içindeyse seçilmiş sayılır (böylece
    komşu satırlardan yinelenen parça gelmez). Çıktıda paragraf girintisi baştaki boşluk
    sayısıyla, blok geçişi boş satırla belirtilir; temizMetin bunları kullanır."""
    doc = onbellek.al(p["yol"])
    pg = doc[int(p["sayfa"]) - 1]
    kutular = [pymupdf.Rect(*k) for k in p["kutular"]]
    secili = []
    for w in pg.get_text("words"):
        x0, y0, x1, y1, kelime, blok, satir, _ = w
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if any(k.x0 <= cx <= k.x1 and k.y0 <= cy <= k.y1 for k in kutular):
            secili.append(w)
    if not secili:
        return {"metin": ""}
    # (blok, satır) gruplarına ayır; satırları konuma göre sırala
    satirlar = {}
    for w in secili:
        satirlar.setdefault((w[5], w[6]), []).append(w)
    sirali = sorted(satirlar.items(), key=lambda kv: (min(x[1] for x in kv[1]), min(x[0] for x in kv[1])))
    # Sol kenar: bloktaki en küçük x0 (girinti için referans)
    blok_sol = {}
    for w in pg.get_text("words"):
        blok_sol[w[5]] = min(blok_sol.get(w[5], 1e9), w[0])
    sayfa_sol = min(blok_sol.values()) if blok_sol else 0
    cikti = []
    onceki_blok = None
    for (blok, _), ws in sirali:
        ws.sort(key=lambda x: x[0])
        if onceki_blok is not None and blok != onceki_blok:
            cikti.append("")
        girinti = ws[0][0] - min(blok_sol.get(blok, sayfa_sol), sayfa_sol + 40)
        bosluk = "    " if girinti > 8 else ""
        cikti.append(bosluk + " ".join(x[4] for x in ws))
        onceki_blok = blok
    return {"metin": "\n".join(cikti)}


def y_sayfa_metni(p):
    """Bir sayfanın düz metni (arama dizini için)."""
    doc = onbellek.al(p["yol"])
    pg = doc[int(p["sayfa"]) - 1]
    return {"metin": pg.get_text("text")}


def y_belge_birak(p):
    onbellek.birak(p["yol"])
    return {"ok": True}


class IptalEdildi(Exception):
    """Kullanıcı işlemi iptal etti (ilerleme noktasında fark edilir)."""


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
        yaz_guvenli({"id": istek_id, "result": sonuc})
    except IptalEdildi:
        yaz_guvenli({"id": istek_id, "error": {"code": -32800, "message": "İşlem iptal edildi."}})
    except Exception as e:
        yaz_guvenli({"id": istek_id, "error": {"code": -32000, "message": str(e), "data": traceback.format_exc()}})
    finally:
        with _iptal_kilidi:
            _iptal_bayraklari.discard(istek_id)


def _isci(kuyruk):
    while True:
        istek = kuyruk.get()
        if istek is None:
            return
        _istek_isle(istek)


def main():
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
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


if __name__ == "__main__":
    main()
