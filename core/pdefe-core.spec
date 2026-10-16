# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec: pdefe-core (tek klasör: pdefe-core.exe + _internal; konsollu — stdio üzerinden JSON-RPC gerekli).
macOS'ta (0.2.0) aynı spec pdefe-core + _internal üretir (o bilgisayarın mimarisi için); yazı tanıma için Vision bağları (pyobjc) toplanır.

Çıktı: core/dist/pdefe-core/pdefe-core.exe. Tek dosya (onefile) kullanılmaz: her açılışta ~70 MB'ı %TEMP%\\_MEI* altına açıyordu
(~0,9 sn) ve süreç öldürülünce (kapanış, çökme, Windows kapanışı) açılan klasör silinmeden kalıyordu (0.1.17'de 151 klasör, 10 GB).

Derleme: build/cekirdek-derle.mjs (npm run cekirdek:derle) ya da doğrudan
  .venv\\Scripts\\pyinstaller.exe --noconfirm --distpath core/dist --workpath build/pyinstaller-work core/pdefe-core.spec
"""
import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

WINDOWS = sys.platform == "win32"

KOK = os.path.abspath(SPECPATH)            # core/
if KOK not in sys.path:                    # collect_submodules("ucuncu") core/ altındaki paketi bulsun
    sys.path.insert(0, KOK)

# PyMuPDF'nin yerel kütüphaneleri (mupdfcpp64.dll, _mupdf.pyd, _extra.pyd) — hooks-contrib'de pymupdf
# kancası olmadığından açıkça toplanır; pyd'ler analizle gelir, dll burada garantiye alınır.
ikili = collect_dynamic_libs("pymupdf")

gizli = [
    "pdefe_core",
    "islemler",
    "islemler.notlar",
    "islemler.araclar",
    "islemler.yapisal",
    "islemler.yazi_tanima",
    "islemler.donustur",
    "islemler.udf",
    "islemler.udf_yaz",
    "islemler.word",
    "islemler.pdf_word",
    "fontTools.subset",
    "fontTools.ttLib",
    "PIL",
    "PIL.Image",
    "PIL.ImageOps",
    "PIL.ImageSequence",
    "PIL.ImageDraw",
    "PIL.JpegImagePlugin",
    "PIL.PngImagePlugin",
    "PIL.TiffImagePlugin",
    "PIL.WebPImagePlugin",
    "PIL.BmpImagePlugin",
    "PIL.GifImagePlugin",
    "PIL.ImageFile",
]
# Pillow'un bütün eklentileri (HEIC hariç; pillow_heif kuruluysa o da paketlenir)
gizli += collect_submodules("PIL")

# PDF → Word (0.2.6, islemler/pdf_word.py): PDEfe'ye alınan pdf2docx (core/ucuncu/pdf2docx; işlev içinde yüklenir) ve bağımlılıkları
# python-docx (boş belge şablonu docx/templates veri dosyası olarak), lxml, numpy (opencv kaldırıldı; THIRD_PARTY.md)
gizli += collect_submodules("ucuncu") + collect_submodules("docx") + ["lxml", "lxml.etree", "numpy"]
veriler = collect_data_files("docx")
try:
    import pillow_heif  # noqa: F401
    gizli.append("pillow_heif")
    ikili += collect_dynamic_libs("pillow_heif")
except ImportError:
    pass

# Windows yazı tanıyıcısının Python bağları (0.1.24, islemler/yazi_tanima.py; pywinrt): modüller işlev içinde yüklendiği için açıkça
# toplanır; winrt klasöründeki msvcp140.dll de .pyd'lerin yanına gelir. Kurulu değilse çekirdek tanımasız derlenir ("desteklenmiyor")
if WINDOWS:
    try:
        import winrt  # noqa: F401
        gizli += collect_submodules("winrt")
        ikili += collect_dynamic_libs("winrt")
    except ImportError:
        print("UYARI: winrt paketleri yok; çekirdek görsellerdeki yazıyı tanıyamayacak")
    # Word → PDF (0.2.6, islemler/word.py): Word'e COM ile (comtypes; işlev içinde yüklenir). comtypes.client kullanılmaz
    try:
        import comtypes  # noqa: F401
        gizli += ["comtypes", "comtypes.automation"]
    except ImportError:
        print("UYARI: comtypes yok; Word → PDF Word'le yapılamayacak (LibreOffice varsa onunla)")
else:
    # macOS: Apple yazı tanıyıcısının Python bağları (0.2.0; pyobjc-framework-Vision, -Quartz, -Cocoa). Modüller işlev içinde yüklenir
    try:
        import objc, Vision, Quartz, Foundation  # noqa: F401,E401
        for paket in ("objc", "Foundation", "CoreFoundation", "Quartz", "Vision", "CoreML"):
            try:
                gizli += collect_submodules(paket)
                ikili += collect_dynamic_libs(paket)
            except Exception:
                pass
    except ImportError:
        print("UYARI: pyobjc Vision paketleri yok; çekirdek görsellerdeki yazıyı tanıyamayacak")

# Lisans metinleri (0.2.9 denetimi): paketlenen her Python dağıtımının lisans dosyaları (dist-info'daki LICENSE / COPYING / NOTICE /
# AUTHORS ve licenses/ altı; lisans dosyası olmayan dağıtımda METADATA), Python'un kendi LICENSE.txt'si ve PDEfe'ye alınan pdf2docx kopyasının
# lisansı _internal/lisanslar/<dağıtım>/ altına (kurulu uygulamada resources/pdefe-core/_internal/lisanslar). MIT ve BSD bildirimin kopyayla
# birlikte verilmesini istiyor; önceden pakette yalnızca numpy'ninkiler vardı (THIRD_PARTY.md "Lisans metinleri").
import importlib.metadata as _metadata

LISANS_DAGITIMLARI = ["pymupdf", "pillow", "fonttools", "python-docx", "lxml", "numpy", "typing_extensions", "comtypes",
                      "winrt-runtime", "winrt-Windows.Foundation", "winrt-Windows.Foundation.Collections", "winrt-Windows.Globalization",
                      "winrt-Windows.Graphics.Imaging", "winrt-Windows.Media.Ocr", "winrt-Windows.Storage.Streams",
                      "pyobjc-core", "pyobjc-framework-Vision", "pyobjc-framework-Quartz", "pyobjc-framework-Cocoa", "pyobjc-framework-CoreML",
                      "pillow_heif"]


def _lisans_dosyalari(dagitim):
    try:
        d = _metadata.distribution(dagitim)
    except _metadata.PackageNotFoundError:
        return []
    sonuc, metadata = [], None
    for f in d.files or ():
        parcalar = str(f).replace("\\", "/").split("/")
        if not parcalar[0].endswith((".dist-info", ".egg-info")):
            continue
        ad = parcalar[-1].upper()
        if parcalar[-1] == "METADATA":
            metadata = f
        if "licenses" in parcalar[1:-1] or any(k in ad for k in ("LICENSE", "LICENCE", "COPYING", "NOTICE", "AUTHORS")):
            kaynak = str(f.locate())
            if os.path.isfile(kaynak):
                sonuc.append((kaynak, "/".join(["lisanslar", d.metadata["Name"]] + parcalar[1:-1])))
    if not sonuc and metadata is not None and os.path.isfile(str(metadata.locate())):   # lisans metni yok (winrt-*): lisansı METADATA'da yazar
        sonuc.append((str(metadata.locate()), "lisanslar/" + d.metadata["Name"]))
    return sonuc


lisanslar = [(os.path.join(KOK, "ucuncu", "pdf2docx", "LICENSE"), "lisanslar/pdf2docx")]
if os.path.isfile(os.path.join(sys.base_prefix, "LICENSE.txt")):
    lisanslar.append((os.path.join(sys.base_prefix, "LICENSE.txt"), "lisanslar/python"))
for _d in LISANS_DAGITIMLARI:
    lisanslar += _lisans_dosyalari(_d)
veriler += lisanslar

# Gereksiz büyük paketler dışarıda (numpy 0.2.6'dan beri gerekli: PDF → Word)
haric = ["tkinter", "_tkinter", "matplotlib", "cv2", "scipy", "pandas", "IPython", "jupyter",
         "unittest", "pydoc_data", "test", "distutils", "setuptools", "pip", "pymupdf.mupdf-devel"]

a = Analysis(
    [os.path.join(KOK, "pdefe_core.py")],
    pathex=[KOK],
    binaries=ikili,
    datas=veriler,
    hiddenimports=gizli,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[os.path.join(KOK, "pyinstaller_kanca.py")],
    excludes=haric,
    noarchive=False,
    optimize=0,
)

# mupdf-devel (başlık/lib dosyaları) exe'de gereksiz
a.datas = [d for d in a.datas if "mupdf-devel" not in d[0].replace("\\", "/")]
a.binaries = [b for b in a.binaries if "mupdf-devel" not in b[0].replace("\\", "/")]

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,   # ikililer ve veriler COLLECT ile klasöre (tek klasör paketi)
    name="pdefe-core",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    console=True,            # stdin/stdout gerekli; Electron windowsHide ile pencereyi gizler
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=os.path.join(KOK, "..", "build", "icon.ico") if WINDOWS and os.path.exists(os.path.join(KOK, "..", "build", "icon.ico")) else None,
    version=None,
)

# Tek klasör: core/dist/pdefe-core/pdefe-core.exe ve yanındaki _internal (python312.dll, pymupdf, PIL, fontTools...)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="pdefe-core",
)
