# -*- coding: utf-8 -*-
"""Sınamaların ev klasörü denetimi (0.2.9 denetimi). Word, değiştirilmiş bir USERPROFILE ile (sahte ev klasörü) başlarsa kullanıcının "Son
kullanılanlar" listesindeki Masaüstü ve Belgeler yollarını o klasöre çevirip yeniden yazıyor: belgeler listeden açılamaz. Word'ü çalıştıran
sınamalar (araclar_testi, word_donusum_testi) ev klasörü gerçek profil klasörü değilse Word'ü kullanmaz (PDEFE_WORD_YOK=1). Örnek PDF klasörü
için USERPROFILE değiştirilmez: PDEFE_TEST_PDF_KLASORU verilir (ornek_klasoru)."""
import os
import sys


def gercek_profil():
    """Oturumun gerçek profil klasörü (Windows'un kaydından; ortam değişkeninden değil) ya da None (Windows değil / okunamadı)."""
    if sys.platform != "win32":
        return None
    import ctypes
    from ctypes import wintypes
    k32 = ctypes.WinDLL("kernel32")
    adv = ctypes.WinDLL("advapi32")
    ue = ctypes.WinDLL("userenv")
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    adv.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
    ue.GetUserProfileDirectoryW.argtypes = [wintypes.HANDLE, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    k32.GetLongPathNameW.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, wintypes.DWORD]
    k32.CloseHandle.argtypes = [wintypes.HANDLE]
    belirtec = wintypes.HANDLE()
    if not adv.OpenProcessToken(k32.GetCurrentProcess(), 0x0008, ctypes.byref(belirtec)):   # TOKEN_QUERY
        return None
    try:
        n = wintypes.DWORD(1024)
        tampon = ctypes.create_unicode_buffer(1024)
        if not ue.GetUserProfileDirectoryW(belirtec, tampon, ctypes.byref(n)):
            return None
    finally:
        k32.CloseHandle(belirtec)
    return tampon.value


def _uzun(yol):
    import ctypes
    tampon = ctypes.create_unicode_buffer(1024)
    n = ctypes.WinDLL("kernel32").GetLongPathNameW(yol, tampon, 1024)
    return os.path.normcase(os.path.abspath(tampon.value if n else yol))


def ev_degistirilmis():
    """USERPROFILE (ve ~) gerçek profil klasöründen başka bir yeri mi gösteriyor (sahte ev)?"""
    gercek = gercek_profil()
    if not gercek:
        return False
    return any(_uzun(y) != _uzun(gercek) for y in (os.environ.get("USERPROFILE") or gercek, os.path.expanduser("~")))


def word_icin_denetle():
    """Ev klasörü değiştirilmişse bu süreçte ve başlattığı çekirdeklerde Word kullanılmaz (PDEFE_WORD_YOK=1). Döner: True (Word kapatıldı)."""
    if os.environ.get("PDEFE_WORD_YOK") == "1" or not ev_degistirilmis():
        return False
    os.environ["PDEFE_WORD_YOK"] = "1"
    print("UYARI: USERPROFILE gerçek profil klasörü değil (sahte ev); Word bu sınamada kullanılmıyor (PDEFE_WORD_YOK=1). Örnek PDF klasörü "
          "için PDEFE_TEST_PDF_KLASORU verin.", file=sys.stderr)
    return True


def ornek_klasoru():
    """Eski sınamaların örnek PDF klasörü: PDEFE_TEST_PDF_KLASORU ya da çalıştıranın Masaüstü\\PDF DENEME klasörü (kişisel yol koda yazılmaz)."""
    return os.environ.get("PDEFE_TEST_PDF_KLASORU") or os.path.join(os.path.expanduser("~"), "Desktop", "PDF DENEME")
