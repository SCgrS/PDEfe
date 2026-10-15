# -*- coding: utf-8 -*-
"""macOS çekirdeğinin en düşük macOS sürümü denetimi (0.2.6). PDEfe'nin en düşük macOS'u 13.0 (electron-builder.yml minimumSystemVersion):
çekirdekteki her Mach-O dosyası (çalıştırılabilir, .so, .dylib; ince ya da çok mimarili) daha yeni bir macOS için derlenmişse macOS 13'te
yüklenemeyebilir. Örnek: numpy 2.5.4'ün Accelerate'li macosx_14_0 tekerleği; macos-15 koşucusunda pip onu seçer, PDF → Word macOS 13'te
düşerdi. Sürüm Mach-O'nun yükleme komutlarından okunur: LC_BUILD_VERSION (minos) ya da eski LC_VERSION_MIN_MACOSX. otool gerekmez (Windows'ta
da sınanır: test/mac_minos_testi.py).

Kullanım:  python build/mac_minos_denetle.py <klasör> [--en-cok 13.0]
Çıkış kodu: 0 hepsi uygun; 1 en az bir dosya daha yeni macOS istiyor (dosyalar ve sürümleri yazılır); 2 kullanım hatası.
"""
import os
import struct
import sys

LC_VERSION_MIN_MACOSX = 0x24
LC_BUILD_VERSION = 0x32
PLATFORM_MACOS = 1
INCE = {b"\xcf\xfa\xed\xfe": ("<", 32), b"\xce\xfa\xed\xfe": ("<", 28), b"\xfe\xed\xfa\xcf": (">", 32), b"\xfe\xed\xfa\xce": (">", 28)}
COK = {b"\xca\xfe\xba\xbe": False, b"\xca\xfe\xba\xbf": True}   # FAT_MAGIC, FAT_MAGIC_64 (büyük sonlu)


def surum_metni(v):
    """xxxx.yy.zz biçimindeki sürüm (LC_BUILD_VERSION minos) → "13.0" / "10.15.4"."""
    a, b, c = v >> 16, (v >> 8) & 0xFF, v & 0xFF
    return "%d.%d" % (a, b) + (".%d" % c if c else "")


def _ince(veri, bas):
    """İnce Mach-O'nun (bas: dosyadaki başlangıç) en düşük macOS sürümü (sayı; xxxx.yy.zz) ya da None (komut yok / macOS değil)."""
    sihir = veri[bas:bas + 4]
    if sihir not in INCE:
        return None
    s, baslik = INCE[sihir]
    if len(veri) < bas + baslik:
        return None
    ncmds, sizeofcmds = struct.unpack_from(s + "II", veri, bas + 16)
    p, son = bas + baslik, min(len(veri), bas + baslik + sizeofcmds)
    for _ in range(ncmds):
        if p + 8 > son:
            break
        cmd, boy = struct.unpack_from(s + "II", veri, p)
        if boy < 8:
            break
        if cmd == LC_BUILD_VERSION and p + 12 <= son:
            platform, minos = struct.unpack_from(s + "II", veri, p + 8)
            if platform == PLATFORM_MACOS:
                return minos
        elif cmd == LC_VERSION_MIN_MACOSX and p + 12 <= son:
            return struct.unpack_from(s + "I", veri, p + 8)[0]
        p += boy
    return None


def macho_surumleri(veri):
    """Dosyanın baytları Mach-O ise her mimarinin en düşük macOS sürümü [(mimari sırası, sürüm ya da None)]; Mach-O değilse None.
    Çok mimarili (fat) başlık Java .class dosyasıyla aynı sihirle başlar: mimari sayısı 20'den küçükse Mach-O sayılır (file(1) gibi)."""
    sihir = veri[:4]
    if sihir in INCE:
        return [(0, _ince(veri, 0))]
    if sihir in COK and len(veri) >= 8:
        n = struct.unpack_from(">I", veri, 4)[0]
        if not 0 < n < 20:
            return None
        boy = 32 if COK[sihir] else 20
        sonuc = []
        for i in range(n):
            p = 8 + i * boy
            if p + boy > len(veri):
                break
            ofset = struct.unpack_from(">Q", veri, p + 8)[0] if COK[sihir] else struct.unpack_from(">I", veri, p + 8)[0]
            sonuc.append((i, _ince(veri, ofset) if ofset < len(veri) else None))
        return sonuc
    return None


def _surum_sayisi(metin):
    p = [int(x) for x in metin.split(".")] + [0, 0]
    return (p[0] << 16) | (p[1] << 8) | p[2]


def denetle(klasor, en_cok="13.0"):
    """Döner: (Mach-O dosya sayısı, en yüksek sürüm, [(göreli yol, sürüm metni)] sınırı aşanlar)."""
    sinir = _surum_sayisi(en_cok)
    say, en_yuksek, asanlar = 0, 0, []
    for kok, _, adlar in os.walk(klasor):
        for ad in adlar:
            yol = os.path.join(kok, ad)
            if os.path.islink(yol) or not os.path.isfile(yol):
                continue
            try:
                with open(yol, "rb") as f:
                    if f.read(4) not in set(INCE) | set(COK):
                        continue
                    f.seek(0)
                    veri = f.read()
            except OSError:
                continue
            surumler = macho_surumleri(veri)
            if surumler is None:
                continue
            say += 1
            for _, v in surumler:
                if v is None:
                    continue
                en_yuksek = max(en_yuksek, v)
                if v > sinir:
                    asanlar.append((os.path.relpath(yol, klasor), surum_metni(v)))
                    break
    return say, en_yuksek, asanlar


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return 2
    klasor = argv[0]
    en_cok = argv[argv.index("--en-cok") + 1] if "--en-cok" in argv else "13.0"
    if not os.path.isdir(klasor):
        print("Klasör yok: %s" % klasor)
        return 2
    say, en_yuksek, asanlar = denetle(klasor, en_cok)
    print("%d Mach-O dosyası; istenen en yeni macOS: %s (sınır %s)" % (say, surum_metni(en_yuksek) if en_yuksek else "-", en_cok))
    for yol, s in asanlar:
        print("HATA macOS %s istiyor: %s" % (s, yol))
    if asanlar:
        print("%d dosya macOS %s'ten yeni bir sürüm istiyor; PDEfe macOS %s'te çalışmayabilir (tekerleğin platform etiketine bakın)."
              % (len(asanlar), en_cok, en_cok))
        return 1
    if not say:
        print("HATA Mach-O dosyası bulunamadı (yanlış klasör?)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
