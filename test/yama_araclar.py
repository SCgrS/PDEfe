# -*- coding: utf-8 -*-
"""uygulama.js: araç komutlarını (araclar/index.js) bağlar; Escape açık ayarlar/araç pencerelerini kapatır."""

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:80])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

yama("src/renderer/uygulama.js", [
("""import { ayarlarPenceresiAc } from './ayarlarPenceresi.js';""",
 """import { ayarlarPenceresiAc, ayarlarPenceresiKapat } from './ayarlarPenceresi.js';
import { aracKomutlari } from './araclar/index.js';"""),
# Araç komutları: yer tutucuları gerçek pencerelerle değiştir
("""function komutCalistir(id, veri) {""",
 """// Araç pencereleri (küçült, sayfaları düzenle, ayır, birleştir, görüntü/PDF birleştir, döndür ve kaydet)
try {
  Object.assign(komutlar, aracKomutlari({
    aktif, cekirdek,
    iptal: (istekId) => pdefe.cagir('cekirdek:iptal', istekId),
    dosyaAc, kaydet: (b) => belgeKaydet(b), mesajKutusu, bildir, pdefe,
    ayar: () => ayar, ayarKoy,
    sayfaTarifiUygula: (b, tarif, ad) => sayfaTarifiUygula(b, tarif, ad),
    dosyaYolu: (f) => pdefe.dosyaYolu(f),
  }));
} catch (e) { console.error('Araç komutları bağlanamadı', e); }

function komutCalistir(id, veri) {"""),
# Escape: açık ayarlar penceresi ya da araç penceresi varsa onu kapat
("""  if (e.key === 'Escape') {
    if (!$('#belge-listesi').hidden) { sekmeler.belgeListesiKapat(); return; }""",
 """  if (e.key === 'Escape') {
    if (!$('#belge-listesi').hidden) { sekmeler.belgeListesiKapat(); return; }
    if (document.querySelector('.ayarlar-ortusu')) { ayarlarPenceresiKapat(); return; }
    if (document.querySelector('.arac-pencere, .diyalog-ortusu')) return;   // pencere kendi Esc'ini işler"""),
])
