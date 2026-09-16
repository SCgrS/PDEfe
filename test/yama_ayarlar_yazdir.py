# -*- coding: utf-8 -*-
"""Ayarlar penceresi ve yazdırma modüllerini main.js ve uygulama.js'e bağlar (ajan raporundaki adımlar)."""

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:80])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

yama("src/main/main.js", [
("""import { ayarlar, ayarKoy, ayarAl } from './ayarlar.js';""", """import { ayarlar, ayarKoy, ayarAl, VARSAYILANLAR } from './ayarlar.js';"""),
("""import { panoyaDosyaKopyala } from './pano.js';""", """import { panoyaDosyaKopyala } from './pano.js';
import { yazdirmaKur } from './yazdir.js';"""),
("""  ipcMain.handle('cekirdek:iptal', (_e, istekId) => cekirdek.iptal(istekId));""",
 """  ipcMain.handle('cekirdek:iptal', (_e, istekId) => cekirdek.iptal(istekId));
  ipcMain.handle('ayar:varsayilanlar', () => VARSAYILANLAR);
  yazdirmaKur({ ipcMain, BrowserWindow, pencereAl: () => pencere });"""),
])

yama("src/renderer/uygulama.js", [
("""import { KomutYigini, Komut } from './komutlar.js';""",
 """import { KomutYigini, Komut } from './komutlar.js';
import { ayarlarPenceresiAc } from './ayarlarPenceresi.js';
import { yazdir } from './yazdir.js';"""),
("""let ayar = {};""", """let ayar = {};
let varsayilanlar = {};"""),
("""  ayar = await pdefe.cagir('ayar:al');
  sistemKoyu = await pdefe.cagir('tema:sistemKoyu');""",
 """  ayar = await pdefe.cagir('ayar:al');
  varsayilanlar = await pdefe.cagir('ayar:varsayilanlar').catch(() => ({}));
  sistemKoyu = await pdefe.cagir('tema:sistemKoyu');"""),
("""pdefe.dinle('tema:sistem', (koyu) => { sistemKoyu = koyu; temaUygula(); });""",
 """pdefe.dinle('tema:sistem', (koyu) => { sistemKoyu = koyu; temaUygula(); });

/** Ayarlar penceresinden gelen değişiklikleri canlı uygular. */
function ayarUygula(anahtar, deger) {
  switch (anahtar) {
    case 'tema': case 'sayfayiKoyulastir': temaUygula(); break;
    case 'vurguRengi': secimCubuguYenile(); break;
    case 'otomatikKaydet': if (deger) for (const b of belgeler.values()) if (b.degisti) kirliGuncelle(b); break;
    case 'varsayilanDuzen': { const b = aktif(); if (b && deger) b.gorunum.duzenAyarla(deger); break; }
    default: break;   // yazarAdi, yazı tipi, temizMetin vb. ayar nesnesinden okunur; anında etkili
  }
}"""),
("""  'dosya.yazdir': () => bildir('Yazdırma bir sonraki aşamada eklenecek.'),""",
 """  'dosya.yazdir': () => { const b = aktif(); if (!b) { bildir('Yazdırılacak belge yok.'); return; } return yazdir({ cekirdek, pdefe, mesajKutusu, bildir, kaydet: (belge) => belgeKaydet(belge) }, b); },"""),
("""  'duzen.ayarlar': () => bildir('Ayarlar penceresi bir sonraki aşamada eklenecek.'),""",
 """  'duzen.ayarlar': () => ayarlarPenceresiAc({ ayar: () => ayar, ayarKoy, uygula: ayarUygula, pdefe, varsayilanlar, cekirdek }),"""),
("""  'yardim.hakkinda': () => hakkindaGoster(),""",
 """  'yardim.hakkinda': () => ayarlarPenceresiAc({ ayar: () => ayar, ayarKoy, uygula: ayarUygula, pdefe, varsayilanlar, cekirdek }, { bolum: 'hakkinda' }),"""),
])
