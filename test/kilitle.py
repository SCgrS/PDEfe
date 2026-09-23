# -*- coding: utf-8 -*-
"""Bir dosyayı Windows'ta paylaşımsız (share mode 0) açık tutar: bir PDF okuyucunun dosyayı kilitlemesini taklit eder.
Kullanım: python test/kilitle.py <dosya> <saniye>"""
import sys, time, ctypes
from ctypes import wintypes
GENERIC_READ = 0x80000000
OPEN_EXISTING = 3
k32 = ctypes.windll.kernel32
k32.CreateFileW.restype = wintypes.HANDLE
h = k32.CreateFileW(sys.argv[1], GENERIC_READ, 0, None, OPEN_EXISTING, 0, None)
if h == wintypes.HANDLE(-1).value:
    print("açılamadı", ctypes.GetLastError()); sys.exit(1)
print("kilitlendi", flush=True)
time.sleep(float(sys.argv[2]))
k32.CloseHandle(h)
print("bırakıldı")
