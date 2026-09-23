// Kalıcı ayarlar (electron-store). Bütün varsayılanlar burada.
import Store from 'electron-store';
import os from 'node:os';

export const VARSAYILANLAR = {
  // Görünüm
  tema: 'sistem',                 // 'acik' | 'koyu' | 'sistem'
  sayfayiKoyulastir: false,       // koyu modda sayfayı da koyulaştır (görselleri koru)
  dondurmeKapsami: 'sor',         // 'sor' | 'sayfa' | 'tum'; araç çubuğundaki Döndür düğmesinin kapsamı
  yaziCizimi: 'anaHat',           // 'anaHat' (referans okuyucu gibi: kalın ve döndürülmüş yazı ana hatlarından, düz yazı ClearType) | 'sistem' (hepsi Chromium / ClearType); renderer/yaziTipleri.js
  // Başlangıç
  varsayilanZoom: 'genislik',     // 'son' | 'genislik' | 'sayfa' | 'gercek' | sayı (yüzde)
  sonZoom: 100,
  varsayilanDuzen: 'surekli',     // 'tek' | 'surekli' | 'iki' | 'ikiSurekli'
  kapakAyri: false,
  kaldigimSayfadanAc: true,
  // Notlar
  yazarAdi: os.userInfo().username || 'Kullanıcı',
  vurguRengi: '#ffd100',          // referans okuyucu varsayılanı: /C [1 .819611 0]
  vurguOpaklik: 0.4,              // referans okuyucu varsayılanı: /CA .4
  yaziTipi: 'Segoe UI',
  yaziBoyutu: 12,
  yaziRengi: '#000000',
  yaziArka: null,
  otomatikKaydet: true,           // 0.1.4: kaydedilmeden başka programda (referans okuyucu) açılan belgede notlar görünmüyordu
  // Kopyalama
  temizMetin: true,
  // Güncelleme: haftada bir otomatik denetle. Son denetimin zamanı (sonDenetimZamani) main/guncelleme.js'te; varsayılanı yoktur,
  // "Varsayılanlara dön" ona dokunmaz.
  otoGuncelle: true,
  // Dosya
  ciktiKlasoru: '',               // araçların yeni belge çıktıları; boşsa Masaüstü (app.getPath('desktop'))
  // Durum
  sonDosyalar: [],
  sayfaKonumlari: {},
  solPanelGenislik: 240,
  solPanelAcik: false,
  solPanelSekme: 'sayfalar',
  pencere: {},
};

/** Kaldırılmış ayarlar: eski sürümlerin yapılandırma dosyalarından silinir (0.1.8: 10 açılışta bir denetimin sayacı → haftalık denetim). */
const KALDIRILAN_ANAHTARLAR = ['sekmeleriHatirla', 'acikSekmeler', 'sekmeDegisimindeSor', 'sonGuncellemeDenetimi', 'acilisSayaci', 'sonDenetimAcilisi', 'sonDenetimSurumu'];

export const ayarlar = new Store({ name: 'ayarlar', defaults: VARSAYILANLAR, clearInvalidConfig: true });
for (const anahtar of KALDIRILAN_ANAHTARLAR) { try { if (ayarlar.has(anahtar)) ayarlar.delete(anahtar); } catch (e) { console.warn('Eski ayar silinemedi', anahtar, e); } }
// Eski varsayılan vurgu rengi (#ffeb3b) referans okuyucunun varsayılanına bir kez taşınır; kullanıcının seçtiği başka renk korunur. Taşıma
// bayrakla bir kez yapılır: sonradan bilerek #ffeb3b seçen kullanıcının rengi her açılışta değişmesin
try {
  if (!ayarlar.get('vurguRengiTasindi')) {
    if (String(ayarlar.get('vurguRengi') ?? '').toLowerCase() === '#ffeb3b') ayarlar.set('vurguRengi', VARSAYILANLAR.vurguRengi);
    ayarlar.set('vurguRengiTasindi', true);
  }
} catch (e) { console.warn('Vurgu rengi taşınamadı', e); }
// 0.1.4'te otomatik kaydetme varsayılan olarak açıldı; eski sürümlerin dosyasında yazılı duran false (eski varsayılan) bir kez true olur.
// Sonradan kapatan kullanıcının seçimi korunur (bayrak)
try {
  if (!ayarlar.get('otomatikKaydetTasindi')) {
    ayarlar.set('otomatikKaydet', true);
    ayarlar.set('otomatikKaydetTasindi', true);
  }
} catch (e) { console.warn('Otomatik kaydetme ayarı taşınamadı', e); }

export function ayarAl(anahtar) { return ayarlar.get(anahtar); }
export function ayarKoy(anahtar, deger) { ayarlar.set(anahtar, deger); }
