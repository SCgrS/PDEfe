# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec: pdefe-core (tek klasör: pdefe-core.exe + _internal; konsollu — stdio üzerinden JSON-RPC gerekli).

Çıktı: core/dist/pdefe-core/pdefe-core.exe. Tek dosya (onefile) kullanılmaz: her açılışta ~70 MB'ı %TEMP%\\_MEI* altına açıyordu
(~0,9 sn) ve süreç öldürülünce (kapanış, çökme, Windows kapanışı) açılan klasör silinmeden kalıyordu (0.1.17'de 151 klasör, 10 GB).

Derleme: build/cekirdek-derle.mjs (npm run cekirdek:derle) ya da doğrudan
  .venv\\Scripts\\pyinstaller.exe --noconfirm --distpath core/dist --workpath build/pyinstaller-work core/pdefe-core.spec
"""
import os
from PyInstaller.utils.hooks import collect_dynamic_libs, collect_submodules

KOK = os.path.abspath(SPECPATH)            # core/

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
try:
    import pillow_heif  # noqa: F401
    gizli.append("pillow_heif")
    ikili += collect_dynamic_libs("pillow_heif")
except ImportError:
    pass

# Windows yazı tanıyıcısının Python bağları (0.1.24, islemler/yazi_tanima.py; pywinrt): modüller işlev içinde yüklendiği için açıkça
# toplanır; winrt klasöründeki msvcp140.dll de .pyd'lerin yanına gelir. Kurulu değilse çekirdek tanımasız derlenir ("desteklenmiyor")
try:
    import winrt  # noqa: F401
    gizli += collect_submodules("winrt")
    ikili += collect_dynamic_libs("winrt")
except ImportError:
    print("UYARI: winrt paketleri yok; çekirdek görsellerdeki yazıyı tanıyamayacak")

# Gereksiz büyük paketler dışarıda
haric = ["tkinter", "_tkinter", "matplotlib", "numpy", "scipy", "pandas", "IPython", "jupyter",
         "unittest", "pydoc_data", "test", "distutils", "setuptools", "pip", "pymupdf.mupdf-devel"]

a = Analysis(
    [os.path.join(KOK, "pdefe_core.py")],
    pathex=[KOK],
    binaries=ikili,
    datas=[],
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
    icon=os.path.join(KOK, "..", "build", "icon.ico") if os.path.exists(os.path.join(KOK, "..", "build", "icon.ico")) else None,
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
