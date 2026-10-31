# -*- coding: utf-8 -*-
"""Arayüz metinlerinin kuralı (0.3.1): Noktalı virgül yok, iki noktadan sonra büyük harf, çift boşluk yok.

Kapsam: src ve core altında kullanıcıya gidebilecek dizgiler (JavaScript dizgileri ve şablonları, Python dizgileri, HTML metni ve görünen
öznitelikler), kurucu betiğinin dizgileri. Çalışırken birleştirilen metni göremez ("…: " + ileti). Yorumlar, Python'un belge dizgileri, günlük çağrıları, CSS ve betik metni kapsam dışı: Yalnız dizgiler taranır, kod gibi görünen
dizgiler ve BILINEN listesindekiler atlanır. Dış kaynaklı klasörler (pdfjs, ucuncu) taranmaz.

Çıkış kodu 0: Temiz. 1: Kurala uymayan dizgi var (dosya, satır, kural, metin yazılır).
Kullanım: python test/arayuz_metin_denetimi.py
"""
import ast
import html.parser
import os
import re
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TARANAN = ["src", "core"]
ATLANAN_KLASOR = {"pdfjs", "ucuncu", "node_modules", "dist", "__pycache__", "vendor", "ude_kopru"}

KUCUK = "a-zçğıöşü"
HARF = "A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû"
YER = "￼"  # şablondaki ${…} yerine

# Metin mi: En az iki sözcük ya da Türkçe harf taşımalı. Kod gibi görünenler atlanır.
KOD_GIBI = re.compile(
    r"(\d(px|em|rem|pt|ms|s|%)\b|rgba?\(|var\(--|calc\(|url\(|=>|\bfunction\b|\bconst\b|\blet\b|\breturn\b|\btypeof\b|\bawait\b|\bwindow\.|\bdocument\."
    r"|\b(display|color|margin(-\w+)?|padding(-\w+)?|position|width|height|font(-\w+)?|border(-\w+)?|background(-\w+)?|opacity|cursor|overflow|transform|"
    r"inset|top|left|right|bottom|flex(-\w+)?|gap|white-space|text-\w+|line-height|z-index|pointer-events|transition|outline|box-\w+|grid(-\w+)?|"
    r"align-\w+|justify-\w+|user-select|visibility|content|object-\w+|min-\w+|max-\w+|fill|stroke(-\w+)?|mix-blend-mode|forced-color-adjust):\s*[^ ]"
    r"|base64|data:|https?:|file:|pdefe:|&[a-z]+;|&#\d+;|\bcharset=|\bdefault-src\b|\bvar \w+ =|\$\.NS|\bapplication/|xmlns|\{\s*\}|\bSELECT\b|\\\\[A-Za-z]{2,}|%[A-Z]+%)")
TURKCE_METIN = re.compile(rf"[çğıöşüÇĞİÖŞÜ]|[{KUCUK}]{{3,}} [{KUCUK}]{{2,}}")

# Kurallar: Ad, düzenli ifade
KURALLAR = [
    # Başta da sayılır: HTML dizgisinde etiketten sonra gelen parça ("</span>; diğer…") böyle başlar
    ("noktalı virgül", re.compile(rf"(^|[{HARF}0-9)'\"’”…{YER}]);(\s|$|[{HARF}])")),
    ("iki noktadan sonra küçük harf", re.compile(rf"(^|[{HARF}0-9)'\"’”{YER}]): [{KUCUK}]")),
    ("çift boşluk", re.compile(r"\S  +\S")),
]

# İki noktadan sonra küçük harfle başlaması doğru olan sözler (kod, dosya adı, biçim adı).
KUCUK_KALIR = re.compile(r": (https?:|chrome:|pdefe:|\.[a-z]+|[a-z_]+\.[a-z]+\b|[a-z_]+\(|--[a-z]|xref\b|macOS\b)")

# Bilinçli istisna: Dosya yolunun sonu ile metin, "dosya:satır" gibi. (dosya sonu parçası, parça)
BILINEN = []

# Günlük ve geliştirici çıktısı: Bu çağrılardaki dizgi kullanıcıya gitmez.
GUNLUK_JS = re.compile(r"(console\.\w+|gunluk\w*|logla\w*|log\.\w+|surec\.stderr\.write|process\.std(err|out)\.write|hataLog\w*)\s*\(\s*$")
GUNLUK_PY = {"print", "log", "gunluk", "_gunluk", "_log", "yaz_gunluk", "debug", "info", "warning", "exception", "critical"}


def metin_mi(s):
    return bool(TURKCE_METIN.search(s)) and not KOD_GIBI.search(s)


STIL_BETIK = re.compile(r"<(style|script)\b.*?</\1>", re.S | re.I)
ETIKET = re.compile(r"<[^<>]*>")
GORUNEN_OZNITELIK = re.compile(r"""\b(?:title|aria-label|placeholder|alt|data-ipucu)=(?:"([^"]*)"|'([^']*)')""")


def parcalar(s):
    """HTML taşıyan dizgide yalnız görünen metin ve görünen öznitelikler denetlenir: Etiketlerin içindeki stil ve kod metin değildir."""
    if not re.search(r"<[a-zA-Z!/][^<>]*>", s):
        return [s]
    s = STIL_BETIK.sub(" ", s)
    cikti = [a or b for a, b in GORUNEN_OZNITELIK.findall(s)]
    cikti.extend(p.strip() for p in ETIKET.split(s) if p.strip())
    return cikti


def denetle(s):
    """Kurala uymayan her (kural, metin parçası) için bir satır."""
    bulunan = []
    for parca in parcalar(s):
        if not metin_mi(parca):
            continue
        for ad, re_ in KURALLAR:
            for m in re_.finditer(parca):
                if ad.startswith("iki nokta") and KUCUK_KALIR.match(parca, m.start() + 1):
                    continue
                bulunan.append((ad, parca[max(0, m.start() - 70):m.end() + 70]))
                break
    return bulunan


# --- JavaScript: Yorumları ve düzenli ifadeleri atlayan küçük dizgi tarayıcı ---
ONCE_REGEX = set("(,=:[!&|?{};\n")


def js_dizgileri(src):
    """(satır, metin, öncesi) üretir. Şablondaki ${…} YER olur, içi ayrıca taranır."""
    cikti = []

    def tara(i, son, satir_bas, derin):
        n = son
        onceki = "\n"
        while i < n:
            c = src[i]
            if c in " \t\r":
                i += 1
                continue
            if c == "\n":
                i += 1
                continue
            if src.startswith("//", i):
                j = src.find("\n", i)
                i = n if j < 0 else j
                continue
            if src.startswith("/*", i):
                j = src.find("*/", i + 2)
                i = n if j < 0 else j + 2
                continue
            if c in "'\"":
                bas = i
                i += 1
                parca = []
                while i < n and src[i] != c and src[i] != "\n":
                    if src[i] == "\\" and i + 1 < n:
                        e = src[i + 1]
                        parca.append({"n": "\n", "t": "\t"}.get(e, e))
                        i += 2
                    else:
                        parca.append(src[i])
                        i += 1
                i += 1
                cikti.append((src.count("\n", 0, bas) + 1, "".join(parca), src[max(0, bas - 80):bas]))
                onceki = "x"
                continue
            if c == "`":
                bas = i
                i += 1
                parca = []
                while i < n and src[i] != "`":
                    if src[i] == "\\" and i + 1 < n:
                        e = src[i + 1]
                        parca.append({"n": "\n", "t": "\t"}.get(e, e))
                        i += 2
                    elif src.startswith("${", i):
                        j = i + 2
                        d = 1
                        # iç ifadenin sonunu, içindeki dizgilere bakarak bul
                        while j < n and d:
                            k = src[j]
                            if k in "'\"":
                                q = k
                                j += 1
                                while j < n and src[j] != q and src[j] != "\n":
                                    j += 2 if src[j] == "\\" else 1
                                j += 1
                                continue
                            if k == "`":
                                j = sablon_sonu(j)
                                continue
                            if k == "{":
                                d += 1
                            elif k == "}":
                                d -= 1
                            j += 1
                        tara(i + 2, j - 1, satir_bas, derin + 1)
                        parca.append(YER)
                        i = j
                    else:
                        parca.append(src[i])
                        i += 1
                i += 1
                cikti.append((src.count("\n", 0, bas) + 1, "".join(parca), src[max(0, bas - 80):bas]))
                onceki = "x"
                continue
            if c == "/" and onceki in ONCE_REGEX:
                j = i + 1
                sinif = False
                while j < n and src[j] != "\n":
                    if src[j] == "\\":
                        j += 2
                        continue
                    if src[j] == "[":
                        sinif = True
                    elif src[j] == "]":
                        sinif = False
                    elif src[j] == "/" and not sinif:
                        break
                    j += 1
                i = j + 1
                onceki = "x"
                continue
            onceki = c
            i += 1

    def sablon_sonu(j):
        j += 1
        while j < len(src) and src[j] != "`":
            if src[j] == "\\":
                j += 2
            elif src.startswith("${", j):
                j += 2
                d = 1
                while j < len(src) and d:
                    k = src[j]
                    if k in "'\"":
                        q = k
                        j += 1
                        while j < len(src) and src[j] != q and src[j] != "\n":
                            j += 2 if src[j] == "\\" else 1
                        j += 1
                        continue
                    if k == "`":
                        j = sablon_sonu(j)
                        continue
                    if k == "{":
                        d += 1
                    elif k == "}":
                        d -= 1
                    j += 1
            else:
                j += 1
        return j + 1

    tara(0, len(src), 0, 0)
    return cikti


def js_tara(yol, ekle):
    src = open(yol, encoding="utf-8").read()
    for satir, metin, once in js_dizgileri(src):
        if GUNLUK_JS.search(once):
            continue
        for k, parca in denetle(metin):
            ekle(yol, satir, k, parca)


# --- Python ---
def py_tara(yol, ekle):
    src = open(yol, encoding="utf-8").read()
    agac = ast.parse(src)
    atla = set()
    for n in ast.walk(agac):
        if isinstance(n, (ast.Module, ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef)):
            if n.body and isinstance(n.body[0], ast.Expr) and isinstance(n.body[0].value, ast.Constant):
                atla.add(id(n.body[0].value))
        if isinstance(n, ast.Call):
            f = n.func
            ad = getattr(f, "id", None) or getattr(f, "attr", None)
            if ad in GUNLUK_PY:
                for k in ast.walk(n):
                    atla.add(id(k))
    for n in ast.walk(agac):
        if id(n) in atla:
            continue
        if isinstance(n, ast.JoinedStr):
            metin = "".join(p.value if isinstance(p, ast.Constant) else YER for p in n.values)
            for p in n.values:
                atla.add(id(p))
            for k, parca in denetle(metin):
                ekle(yol, n.lineno, k, parca)
        elif isinstance(n, ast.Constant) and isinstance(n.value, str):
            for k, parca in denetle(n.value):
                ekle(yol, n.lineno, k, parca)


# --- HTML ---
class Html(html.parser.HTMLParser):
    GORUNEN = {"title", "aria-label", "placeholder", "alt", "value"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.yigin = []
        self.bulunan = []

    def handle_starttag(self, tag, attrs):
        if tag not in ("meta", "link", "input", "img", "br", "hr"):
            self.yigin.append(tag)
        for a, d in attrs:
            if a in self.GORUNEN and d:
                self.bulunan.append((self.getpos()[0], d))

    def handle_endtag(self, tag):
        while self.yigin and self.yigin.pop() != tag:
            pass

    def handle_data(self, data):
        if not any(t in ("style", "script") for t in self.yigin) and data.strip():
            self.bulunan.append((self.getpos()[0], re.sub(r"\s*\n\s*", " ", data).strip()))


def html_tara(yol, ekle):
    h = Html()
    h.feed(open(yol, encoding="utf-8").read())
    for satir, metin in h.bulunan:
        for k, parca in denetle(metin):
            ekle(yol, satir, k, parca)


def nsh_tara(yol, ekle):
    """Kurucu betiği: Çift tırnaklı dizgiler (NSIS'te noktalı virgülle başlayan yorumlar tırnağın dışında kalır)."""
    for satir, s in enumerate(open(yol, encoding="utf-8-sig").read().split("\n"), 1):
        if s.lstrip().startswith((";", "#", "!error")):
            continue
        for metin in re.findall(r'"([^"]*)"', s):
            for k, parca in denetle(metin.replace("$\\r$\\n", "\n")):
                ekle(yol, satir, k, parca)


def ana():
    bulunan = []

    def ekle(yol, satir, kural, metin):
        goreli = os.path.relpath(yol, KOK).replace(os.sep, "/")
        if any(goreli.endswith(d) and p in metin for d, p in BILINEN):
            return
        bulunan.append((goreli, satir, kural, metin))

    dosya = 0
    for kok in TARANAN:
        for klasor, alt, adlar in os.walk(os.path.join(KOK, kok)):
            alt[:] = [a for a in alt if a not in ATLANAN_KLASOR]
            for ad in adlar:
                yol = os.path.join(klasor, ad)
                if ad.endswith((".js", ".mjs", ".cjs")):
                    js_tara(yol, ekle)
                elif ad.endswith(".py"):
                    py_tara(yol, ekle)
                elif ad.endswith(".html"):
                    html_tara(yol, ekle)
                else:
                    continue
                dosya += 1
    for ad in sorted(os.listdir(os.path.join(KOK, "build"))):
        if ad.endswith(".nsh"):
            nsh_tara(os.path.join(KOK, "build", ad), ekle)
            dosya += 1
    for goreli, satir, kural, metin in bulunan:
        print(f"{goreli}:{satir}: [{kural}] {metin[:200]!r}")
    say = {}
    for b in bulunan:
        say[b[2]] = say.get(b[2], 0) + 1
    print(f"Taranan dosya: {dosya}. Kurala uymayan: {len(bulunan)} {say if say else ''}".rstrip())
    if bulunan:
        print("HATA Arayüz metinleri: Kurala uymayan dizgi var")
        return 1
    print("OK   Arayüz metinleri: Noktalı virgül, iki noktadan sonra küçük harf ve çift boşluk yok")
    return 0


if __name__ == "__main__":
    sys.exit(ana())
