// Araç pencereleri giriş noktası. uygulama.js'deki komut tablosuna eklenir:
//   import { aracKomutlari } from './araclar/index.js';
//   Object.assign(komutlar, aracKomutlari(baglam));
//
// baglam = {
//   aktif: () => belge|null,                       // {id, yol, ad, boyut, degisti, kaydediliyor, diskDondurme, gorunum:{sayfaSayisi, gecerli, sayfalar, anlik, tarif(), yapisalKirli()}, notlar, yigin}
//   cekirdek(yontem, params, ilerlemeCb),           // Promise (iptal() ve istekId taşır); ilerlemeCb({yuzde, mesaj})
//   iptal?: (istekId) => void,                     // isteğe bağlı; çağrının kendi iptal()'i yoksa kullanılır
//   dosyaAc(yol, {arkaPlanda, sayfa}) → Promise<belge>,
//   kaydet(belge) → Promise<bool>,
//   mesajKutusu({tur, mesaj, ayrinti, dugmeler, varsayilan, iptal}) → {secim, onay},
//   bildir(metin, sure?),
//   pdefe,                                         // IPC köprüsü (cagir, dinle, dosyaYolu)
//   ayar: () => ayarlar, ayarKoy(anahtar, deger),
//   sayfaTarifiUygula(belge, tarif, komutAdi) → Promise<void>,   // proje sahibi sağlar
//   belgeKapat?: (id, {zorla}) → Promise<bool>,     // isteğe bağlı; "üzerine yaz" sonrası sekmeyi yenilemek için
//   belgeler?: () => belge[],                      // isteğe bağlı; yeni belge çıktısı açık bir sekmenin dosyasına yazılınca o sekme yenilenir
// }
// PDF birleştir aracı kaldırıldı: Görüntü / PDF birleştir aynı işi (PDF'leri de) yapar.
import { kucultAc } from './kucult.js';
import { sayfalarAc } from './sayfalar.js';
import { ayirAc } from './ayir.js';
import { gorselBirlestirAc } from './gorselBirlestir.js';
import { dondurAc } from './dondur.js';

export { KucultPenceresi } from './kucult.js';
export { SayfalarPenceresi } from './sayfalar.js';
export { AyirPenceresi } from './ayir.js';
export { BirlestirmePenceresi } from './gorselBirlestir.js';
export { DondurPenceresi } from './dondur.js';
export { boyutMetni, pencereAc, IslemIlerleme, aracPencereleriniKapat } from './ortak.js';

const GEREKLI = ['aktif', 'cekirdek', 'dosyaAc', 'kaydet', 'mesajKutusu', 'bildir', 'pdefe', 'ayar'];

/**
 * Menü komut kimliklerini araç açan işlevlere bağlar.
 * @returns {{ 'arac.kucult': Function, 'arac.sayfalar': Function, 'arac.ayir': Function, 'arac.gorselBirlestir': Function, 'arac.dondurKaydet': Function }}
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
    'arac.gorselBirlestir': sar((b, veri) => gorselBirlestirAc(b, Array.isArray(veri) ? veri : [])),
    'arac.dondurKaydet': sar(dondurAc),
  };
}
