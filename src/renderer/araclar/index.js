// Araç pencereleri giriş noktası. uygulama.js'deki komut tablosuna eklenir:
//   import { aracKomutlari } from './araclar/index.js';
//   Object.assign(komutlar, aracKomutlari(baglam));
//
// baglam = {
//   aktif: () => belge|null,                       // {id, yol, ad, boyut, degisti, gorunum:{sayfaSayisi, gecerli, sayfalar}, notlar, yigin}
//   cekirdek(yontem, params, ilerlemeCb),           // Promise; ilerlemeCb({yuzde, mesaj})
//   iptal?: () => void,                            // isteğe bağlı; yoksa cekirdek('iptal') çağrılır
//   dosyaAc(yol, {arkaPlanda}) → Promise<belge>,
//   kaydet(belge) → Promise<bool>,
//   mesajKutusu({tur, mesaj, ayrinti, dugmeler, varsayilan, iptal}) → {secim, onay},
//   bildir(metin, sure?),
//   pdefe,                                         // IPC köprüsü (cagir, dinle, dosyaYolu)
//   ayar: () => ayarlar, ayarKoy(anahtar, deger),
//   sayfaTarifiUygula(belge, tarif, komutAdi) → Promise<void>,   // proje sahibi sağlar
//   belgeKapat?: (id, {zorla}) → Promise<bool>,     // isteğe bağlı; "üzerine yaz" sonrası sekmeyi yenilemek için
// }
import { kucultAc } from './kucult.js';
import { sayfalarAc } from './sayfalar.js';
import { ayirAc } from './ayir.js';
import { birlestirAc } from './birlestir.js';
import { gorselBirlestirAc } from './gorselBirlestir.js';
import { dondurAc } from './dondur.js';

export { KucultPenceresi } from './kucult.js';
export { SayfalarPenceresi } from './sayfalar.js';
export { AyirPenceresi } from './ayir.js';
export { BirlestirPenceresi } from './birlestir.js';
export { BirlestirmePenceresi } from './gorselBirlestir.js';
export { DondurPenceresi } from './dondur.js';
export { boyutMetni, pencereAc, IslemIlerleme } from './ortak.js';

const GEREKLI = ['aktif', 'cekirdek', 'dosyaAc', 'kaydet', 'mesajKutusu', 'bildir', 'pdefe', 'ayar'];

/**
 * Menü komut kimliklerini araç açan işlevlere bağlar.
 * @returns {{ 'arac.kucult': Function, 'arac.sayfalar': Function, 'arac.ayir': Function, 'arac.birlestir': Function, 'arac.gorselBirlestir': Function, 'arac.dondurKaydet': Function }}
 */
export function aracKomutlari(baglam) {
  for (const k of GEREKLI) if (baglam?.[k] == null) throw new Error(`aracKomutlari: baglam.${k} eksik`);
  const sar = (f) => (veri) => {
    try { return f(baglam, veri); }
    catch (e) { console.error('[araçlar]', e); baglam.bildir('Araç açılamadı: ' + (e?.message || e)); return null; }
  };
  return {
    'arac.kucult': sar(kucultAc),
    'arac.sayfalar': sar(sayfalarAc),
    'arac.ayir': sar(ayirAc),
    'arac.birlestir': sar((b, veri) => birlestirAc(b, Array.isArray(veri) ? veri : undefined)),
    'arac.gorselBirlestir': sar((b, veri) => gorselBirlestirAc(b, Array.isArray(veri) ? veri : [])),
    'arac.dondurKaydet': sar(dondurAc),
  };
}
