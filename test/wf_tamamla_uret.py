# -*- coding: utf-8 -*-
"""Önceki iş akışı betiğinden 'tamamla ve doğrula' sürümünü üretir."""
import sys, json
kaynak = sys.argv[1]
hedef = sys.argv[2]
s = open(kaynak, encoding="utf-8").read()
rapor = open("test/cikti/rapor-ayarlar-yazdirma.md", encoding="utf-8").read()

s = s.replace("name: 'pdefe-moduller',", "name: 'pdefe-moduller-tamamla',", 1)
s = s.replace("description: 'PDEfe için araç modülleri, ayarlar/yazdırma ve paketleme/belgelemeyi paralel yaz, gözden geçir, düzelt',",
              "description: 'Yarım kalan PDEfe modüllerini tamamla, doğrula, düşmanca gözden geçir ve düzelt',", 1)
s = s.replace("{ title: 'Yaz', detail: 'her modülü kendi dosyalarına yazan bir ajan' },",
              "{ title: 'Tamamla', detail: 'yarım kalan dosyaları spesifikasyona göre tamamlayıp sınayan ajan' },", 1)

# Ayarlar/yazdırma raporunu ISLER içine JSON dize sabiti olarak göm
s = s.replace("  ad: 'ayarlar-yazdirma',", "  ad: 'ayarlar-yazdirma',\n  rapor: " + json.dumps(rapor, ensure_ascii=False) + ",", 1)

TAMAMLA = "\n".join([
    "",
    "const TAMAMLA_ONEKI = `",
    "# DURUM: ÖNCEKİ DENEME YARIDA KESİLDİ",
    "Bu görev için bir önceki ajan dosyaların çoğunu yazdı ama oturum sınırına takılıp raporunu veremedi. Dosyalar diskte duruyor (görevde listelenen yollar). Yeniden yazma; ÖNCE var olan dosyaların TAMAMINI oku, spesifikasyonla (aşağıdaki görev metni) satır satır karşılaştır, eksik/yarım/yanlış kısımları tamamla ve düzelt, sonra GERÇEKTEN sına (Python: .venv ile gerçek dosyalarla çalıştır; JS: node --check + mantığı gözden geçir; PyInstaller exe'si varsa core/dist/pdefe-core.exe'yi çalıştırıp ping doğrula). Sonunda görevde istenen RAPORU tam olarak yaz (Bütünleştirme adımları dahil).",
    "`;",
    "",
])
s = s.replace("const BULGU_SEMASI = {", TAMAMLA + "\nconst BULGU_SEMASI = {", 1)

eski_asama = "  (is) => agent(ORTAK + is.gorev, { label: 'yaz:' + is.ad, phase: 'Yaz', effort: 'high' }),"
yeni_asama = "  (is) => (is.rapor ? Promise.resolve(is.rapor) : agent(ORTAK + TAMAMLA_ONEKI + is.gorev, { label: 'tamamla:' + is.ad, phase: 'Tamamla', effort: 'high' })),"
assert eski_asama in s, "aşama kalıbı bulunamadı"
s = s.replace(eski_asama, yeni_asama, 1)
s = s.replace("\r", "")
open(hedef, "w", encoding="utf-8", newline="\n").write(s)
print("yazıldı:", hedef, len(s))
