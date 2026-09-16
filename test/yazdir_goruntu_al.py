# -*- coding: utf-8 -*-
"""Yazdırma testi: çekirdeğin sayfa_goruntu yöntemini doğrudan çağırır, JSON'a yazar.
Kullanım: .venv\\Scripts\\python.exe test\\yazdir_goruntu_al.py <pdf> <sayfalar: 1,2,5> <cikti.json> [notlar=1]
"""
import sys
import os
import json
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "core"))
import pdefe_core  # noqa: E402

def main():
    yol, sayfalar, cikti = sys.argv[1], [int(x) for x in sys.argv[2].split(",")], sys.argv[3]
    notlar = (sys.argv[4] if len(sys.argv) > 4 else "1") == "1"
    sonuc = []
    for no in sayfalar:
        t = time.time()
        r = pdefe_core.YONTEMLER["sayfa_goruntu"]({"yol": yol, "sayfa": no, "dpi": 200, "notlar": notlar, "bicim": "jpeg", "kalite": 92})
        r["no"] = no
        sonuc.append(r)
        print("sayfa %d: %dx%d px, %.1fx%.1f pt, %d KB, %.2f sn" % (no, r["genislik"], r["yukseklik"], r["genislikPt"], r["yukseklikPt"], len(r["veri"]) * 3 // 4 // 1024, time.time() - t))
    with open(cikti, "w", encoding="utf-8") as f:
        json.dump(sonuc, f)
    print("yazıldı:", cikti)

if __name__ == "__main__":
    main()
