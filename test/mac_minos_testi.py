# -*- coding: utf-8 -*-
"""build/mac_minos_denetle.py'nin denemesi (Windows'ta da koşar; Mach-O dosyaları burada üretilir). Çalıştırma: python test/mac_minos_testi.py
Denetlenenler: LC_BUILD_VERSION (macOS) ve LC_VERSION_MIN_MACOSX okunur; çok mimarili dosyada her mimari; iOS'un LC_BUILD_VERSION'ı ve Java
.class dosyası (aynı sihir) sayılmaz; sınırı aşan dosya çıkış kodu 1 ile yazılır; Mach-O'suz klasör hata."""
import os
import shutil
import struct
import subprocess
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "build"))
sys.stdout.reconfigure(encoding="utf-8")
import mac_minos_denetle as M  # noqa: E402

K = os.path.join(KOK, "test", "cikti", "mac_minos")
hata = toplam = 0


def sonuc(ad, ok, ayrinti=""):
    global hata, toplam
    toplam += 1
    hata += 0 if ok else 1
    print(("OK   " if ok else "HATA ") + ad + ("" if ok or not ayrinti else " — " + str(ayrinti)))


def surum(a, b=0, c=0):
    return (a << 16) | (b << 8) | c


def yapi(minos, platform=1):
    return struct.pack("<IIIIII", 0x32, 24, platform, minos, surum(15), 0)


def eski_yapi(v):
    return struct.pack("<IIII", 0x24, 16, v, surum(14))


def ince(*komutlar):
    lc = b"".join(komutlar)
    return struct.pack("<IiiIIIII", 0xFEEDFACF, 0x0100000C, 0, 6, len(komutlar), len(lc), 0, 0) + lc + b"\0" * 64


def cok(*dilimler):
    bas = 8 + 20 * len(dilimler)
    ofsetler, govde = [], b""
    for d in dilimler:
        ofsetler.append(bas + len(govde))
        govde += d
    basliklar = b"".join(struct.pack(">iiIII", 0x0100000C, 0, o, len(d), 0) for o, d in zip(ofsetler, dilimler))
    return struct.pack(">II", 0xCAFEBABE, len(dilimler)) + basliklar + govde


def yaz(ad, veri):
    y = os.path.join(K, ad)
    os.makedirs(os.path.dirname(y), exist_ok=True)
    with open(y, "wb") as f:
        f.write(veri)
    return y


def main():
    shutil.rmtree(K, ignore_errors=True)
    sonuc("sürüm metni (13.0, 10.15.4)", M.surum_metni(surum(13)) == "13.0" and M.surum_metni(surum(10, 15, 4)) == "10.15.4")
    sonuc("ince Mach-O: LC_BUILD_VERSION 11.0", M.macho_surumleri(ince(yapi(surum(11)))) == [(0, surum(11))])
    sonuc("ince Mach-O: LC_VERSION_MIN_MACOSX 10.13", M.macho_surumleri(ince(eski_yapi(surum(10, 13)))) == [(0, surum(10, 13))])
    sonuc("iOS'un LC_BUILD_VERSION'ı macOS sürümü sayılmaz", M.macho_surumleri(ince(yapi(surum(17), platform=2))) == [(0, None)])
    sonuc("çok mimarili: her mimari (11.0 ve 14.0)", M.macho_surumleri(cok(ince(yapi(surum(11))), ince(yapi(surum(14))))) == [(0, surum(11)), (1, surum(14))])
    sonuc("Java .class (aynı sihir, 52 'mimari') Mach-O sayılmaz", M.macho_surumleri(b"\xca\xfe\xba\xbe\x00\x00\x00\x34" + b"\0" * 32) is None)
    sonuc("düz metin Mach-O sayılmaz", M.macho_surumleri(b"#!/bin/sh\n") is None)
    # Klasör: uygun dosyalar
    yaz("uygun/pdefe-core", ince(yapi(surum(11))))
    yaz("uygun/_internal/numpy/_core/_multiarray_umath.cpython-312-darwin.so", ince(yapi(surum(11))))
    yaz("uygun/_internal/libz.dylib", cok(ince(eski_yapi(surum(10, 13))), ince(yapi(surum(11)))))
    yaz("uygun/_internal/base_library.zip", b"PK\x03\x04" + b"\0" * 40)
    yaz("uygun/_internal/Ornek.class", b"\xca\xfe\xba\xbe\x00\x00\x00\x34" + b"\0" * 32)
    say, en, asan = M.denetle(os.path.join(K, "uygun"), "13.0")
    sonuc("uygun klasör: 3 Mach-O, en yeni 11.0, aşan yok", say == 3 and en == surum(11) and not asan, (say, M.surum_metni(en), asan))
    # Sınırı aşan: numpy'nin macosx_14_0 tekerleği gibi
    yaz("asan/pdefe-core", ince(yapi(surum(11))))
    yaz("asan/_internal/numpy/_core/_multiarray_umath.cpython-312-darwin.so", ince(yapi(surum(14))))
    yaz("asan/_internal/evrensel.dylib", cok(ince(yapi(surum(11))), ince(yapi(surum(13, 3)))))
    say, en, asan = M.denetle(os.path.join(K, "asan"), "13.0")
    sonuc("aşan klasör: 14.0 ve 13.3 isteyen iki dosya yazılır", say == 3 and sorted(s for _, s in asan) == ["13.3", "14.0"], asan)
    betik = os.path.join(KOK, "build", "mac_minos_denetle.py")
    r = subprocess.run([sys.executable, betik, os.path.join(K, "asan"), "--en-cok", "13.0"], capture_output=True, text=True, encoding="utf-8")
    sonuc("komut satırı: aşan klasörde çıkış kodu 1, dosyalar HATA satırında", r.returncode == 1 and "HATA macOS 14.0 istiyor" in r.stdout, r.stdout[-300:])
    r = subprocess.run([sys.executable, betik, os.path.join(K, "uygun")], capture_output=True, text=True, encoding="utf-8")
    sonuc("komut satırı: uygun klasörde çıkış kodu 0", r.returncode == 0, r.stdout[-300:])
    os.makedirs(os.path.join(K, "bos"), exist_ok=True)
    r = subprocess.run([sys.executable, betik, os.path.join(K, "bos")], capture_output=True, text=True, encoding="utf-8")
    sonuc("komut satırı: Mach-O'suz klasörde çıkış kodu 1 (yanlış klasör)", r.returncode == 1, r.stdout[-300:])
    shutil.rmtree(K, ignore_errors=True)
    print("\nSonuç: %d/%d geçti%s." % (toplam - hata, toplam, ", %d HATA" % hata if hata else ""))
    return 1 if hata else 0


if __name__ == "__main__":
    sys.exit(main())
