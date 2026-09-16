# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec: pdefe-core.exe (tek dosya, konsollu — stdio üzerinden JSON-RPC gerekli).

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
    a.binaries,
    a.datas,
    [],
    name="pdefe-core",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,            # stdin/stdout gerekli; Electron windowsHide ile pencereyi gizler
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=os.path.join(KOK, "..", "build", "icon.ico") if os.path.exists(os.path.join(KOK, "..", "build", "icon.ico")) else None,
    version=None,
)
