# -*- coding: utf-8 -*-
"""PyInstaller çalışma zamanı kancası (yalnızca paketli exe'de, ana betikten ÖNCE çalışır).

Paketli exe'de giriş betiği `__main__` adıyla yüklenir. islemler/notlar.py ve islemler/araclar.py
çalışma zamanında `from pdefe_core import onbellek` yapar; bu ad sys.modules'ta yoksa Python
pdefe_core.py'yi İKİNCİ kez yükler ve ayrı bir `onbellek` nesnesi oluşur (dosya tanıtıcıları
kapanmaz, os.replace başarısız olur). Burada `pdefe_core` adı __main__ modülüne bağlanır; böylece
iki kopya yerine tek çekirdek olur. (.venv'den doğrudan çalıştırmada bu kanca devreye girmez.)
"""
import sys

_ana = sys.modules.get("__main__")
if _ana is not None and "pdefe_core" not in sys.modules:
    sys.modules["pdefe_core"] = _ana
