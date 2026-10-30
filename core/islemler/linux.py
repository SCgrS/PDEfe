# -*- coding: utf-8 -*-
"""Linux'a özgü çekirdek yardımcıları (0.3.1, Linux sürümü: AppImage).

1) Dış programların ortamı (ortami_temizle): Paketli çekirdekte PyInstaller kendi kitaplık klasörünü (_internal), AppImage'ın başlatıcısı
   (AppRun) kendi klasörünü (APPDIR/usr/lib) LD_LIBRARY_PATH'in başına koyar. Çekirdeğin başlattığı sistem programları (LibreOffice, UYAP
   Doküman Editörü'nün Java'sı, fc-match) bu değişkenle PDEfe'nin paketlediği kitaplıkları yükleyebilir, sürümü tutmayınca açılmaz. Çekirdek
   açılırken bu klasörler değişkenden çıkarılır (PyInstaller özgün değeri LD_LIBRARY_PATH_ORIG'de saklıyorsa o temel alınır); bundan sonra
   başlatılan her program sistemin kitaplıklarıyla açılır. Çekirdeğin kendisi etkilenmez: Bağlayıcı (ld.so) değişkeni yalnızca süreç
   başlarken okur.
2) Yazı notu fontu (yazi_tipi_dosyasi): Windows'taki Arial, Times New Roman, Calibri ve Segoe UI dosyalarının yerine fontconfig'in (fc-match)
   seçtiği dosya. Yalnız istenen aile ya da ölçüleri onunla aynı tutulan eşi alınır (Liberation, Arimo / Tinos / Cousine, Carlito: Chromium'un
   da Linux'ta yerine koyduğu yazı tipleri). Arayüz notu CSS'teki aileyle gösterir (renderer/notlar.js yaziTipiCss: Segoe UI ve Calibri
   Linux'ta da Arial'e düşer, macOS'taki gibi): Ekrandaki yazıyla kaydedilen not aynı yazı tipiyle çizilsin. Eşi de yoksa fontconfig'in
   Arial için seçtiği TrueType dosyası (DejaVu Sans gibi) gömülür, Türkçe harfleri olsun yeter.
"""
import os
import posixpath
import re
import subprocess
import sys

LINUX = sys.platform.startswith("linux")

# Aile → ölçüleri aynı tutulan eşleri (küçük harf). Chromium'un Linux'ta CSS ailesinin yerine kabul ettikleriyle aynı (fontconfig'in
# 30-metric-aliases.conf'u da bunları birbirine bağlar)
ESLER = {
    "arial": ("arial", "liberation sans", "arimo", "albany amt"),
    "times new roman": ("times new roman", "liberation serif", "tinos", "thorndale amt"),
    "courier new": ("courier new", "liberation mono", "cousine", "cumberland amt"),
    "calibri": ("calibri", "carlito"),
    "segoe ui": ("segoe ui",),
}
KALIN_AGIRLIK = 180          # fontconfig: FC_WEIGHT_DEMIBOLD; 200 BOLD, 80 REGULAR
FC_SURESI = 5                # sn

_onbellek = {}


def ortami_temizle(ortam=None, paket_klasoru=None):
    """LD_LIBRARY_PATH'ten PyInstaller'ın ve AppImage'ın kitaplık klasörlerini çıkarır (bkz. başlık). ortam: os.environ (varsayılan) ya da
    sözlük (birim denemesi); paket_klasoru: PyInstaller'ın açtığı klasör (varsayılan sys._MEIPASS, paketli değilse yok). Döner: yeni değer
    (boşsa değişken silinir, None)."""
    ortam = os.environ if ortam is None else ortam
    if paket_klasoru is None:
        paket_klasoru = getattr(sys, "_MEIPASS", None)
    cikarilacak = [posixpath.normpath(k) for k in (paket_klasoru, ortam.get("APPDIR")) if k]
    taban = ortam.get("LD_LIBRARY_PATH_ORIG", ortam.get("LD_LIBRARY_PATH"))
    if taban is None:
        return None

    def disarida(k):
        y = posixpath.normpath(k)
        return not any(y == c or y.startswith(c.rstrip("/") + "/") for c in cikarilacak)
    kalan = [k for k in taban.split(":") if k and disarida(k)]
    if kalan:
        ortam["LD_LIBRARY_PATH"] = ":".join(kalan)
        return ortam["LD_LIBRARY_PATH"]
    ortam.pop("LD_LIBRARY_PATH", None)
    return None


def _calistir(komut):
    """Komutun çıktısı (metin) ya da None (program yok, hata, süre doldu)."""
    try:
        r = subprocess.run(komut, capture_output=True, timeout=FC_SURESI, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0:
        return None
    return (r.stdout or b"").decode("utf-8", "replace")


def fc_match(aile, kalin=False, italik=False, calistir=None):
    """fontconfig'in aile için seçtiği yazı tipi: {dosya, aileler (küçük harf), kalin, italik} ya da None (fontconfig yok, yanıt okunamadı).
    calistir: komutu çalıştıran işlev (birim denemesi)."""
    desen = "%s:weight=%s:slant=%s" % (aile, "bold" if kalin else "regular", "italic" if italik else "roman")
    cikti = (calistir or _calistir)(["fc-match", "-f", "%{file}\\n%{family}\\n%{weight}\\n%{slant}\\n", desen])
    if not cikti:
        return None
    satirlar = cikti.split("\n")
    if len(satirlar) < 4 or not satirlar[0].strip():
        return None
    # Değişken yazı tipinde aralık gelir ("[100 900]"): ilk sayı
    sayi = lambda s: float((re.search(r"-?\d+(?:\.\d+)?", s) or [0])[0])
    agirlik, egim = sayi(satirlar[2]), sayi(satirlar[3])
    return {"dosya": satirlar[0].strip(), "aileler": [a.strip().lower() for a in satirlar[1].split(",") if a.strip()],
            "kalin": agirlik >= KALIN_AGIRLIK, "italik": egim > 0}


def _uygun(f, var_mi=os.path.isfile):
    """Gömülebilir mi: Var olan bir TrueType dosyası (.ttf; çekirdek CIDFontType2 olarak gömer, CFF'li .otf ve .ttc alınmaz)."""
    return bool(f) and f["dosya"].lower().endswith(".ttf") and var_mi(f["dosya"])


def yazi_tipi_dosyasi(aile, kalin, italik, calistir=None, var_mi=os.path.isfile):
    """notlar._font_dosyasi'nın Linux karşılığı: (dosya yolu, sahte italik). Önce istenen aile, sonra Arial (ikisinde de yalnız aynı aile ya
    da ölçüleri aynı eşi), sonra fontconfig'in Arial için seçtiği herhangi bir TrueType. İtalik yüz bulunamazsa düz yüz eğilerek çizilir
    (sahte italik). Hiçbiri yoksa FileNotFoundError (Türkçe ileti)."""
    anahtar = (aile, bool(kalin), bool(italik))
    if calistir is None and anahtar in _onbellek:
        return _onbellek[anahtar]
    secim = None
    for a in dict.fromkeys((aile or "Arial", "Arial")):
        f = fc_match(a, kalin, italik, calistir)
        esler = ESLER.get(a.lower(), (a.lower(),))
        if _uygun(f, var_mi) and any(x in esler for x in f["aileler"]):
            secim = (f["dosya"], bool(italik) and not f["italik"])
            break
    if secim is None:
        for a in ("Arial", "sans-serif"):
            f = fc_match(a, kalin, italik, calistir)
            if _uygun(f, var_mi):
                secim = (f["dosya"], bool(italik) and not f["italik"])
                break
    if secim is None:
        raise FileNotFoundError("Yazı notu için yazı tipi bulunamadı. Liberation ya da DejaVu yazı tiplerini kurup yeniden deneyin.")
    if calistir is None:
        _onbellek[anahtar] = secim
    return secim
