# -*- coding: utf-8 -*-
# Bir dosyayı başka bir program gibi kilitli tutar (0.3.1, test/senaryo50.mjs): Dosya okuma için açılır, paylaşım kipi verilen. Satır satır stdout:
# "kilitlendi" ya da "acilamadi <kod>". Standart girdi kapanınca (ya da süre dolunca) kilit bırakılıp çıkılır.
# Kullanım: python kilit_tut.py <dosya> <paylasim: 0 hiç | 1 yalnız okuma> [saniye]
import ctypes
import sys
import threading
import time
from ctypes import wintypes

k = ctypes.WinDLL("kernel32", use_last_error=True)
k.CreateFileW.restype = wintypes.HANDLE
k.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
GENERIC_READ = 0x80000000
OPEN_EXISTING = 3
h = k.CreateFileW(sys.argv[1], GENERIC_READ, int(sys.argv[2]), None, OPEN_EXISTING, 0, None)
if h == wintypes.HANDLE(-1).value:
    print("acilamadi %d" % ctypes.get_last_error(), flush=True)
    sys.exit(1)
print("kilitlendi", flush=True)
bitti = threading.Event()


def bekle():
    try:
        sys.stdin.read()
    except Exception:
        pass
    bitti.set()


threading.Thread(target=bekle, daemon=True).start()
bitti.wait(float(sys.argv[3]) if len(sys.argv) > 3 else 600)
k.CloseHandle(h)
time.sleep(0.02)
print("birakildi", flush=True)
