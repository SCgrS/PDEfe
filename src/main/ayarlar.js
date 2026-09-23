// Kalıcı ayarlar (electron-store). Bütün varsayılanlar burada.
import Store from 'electron-store';
import os from 'node:os';

// Gruplar Ayarlar penceresinin sekmeleriyle aynı sırada (renderer/ayarlarPenceresi.js).
export const VARSAYILANLAR = {
  // Görünüm
  tema: 'sistem',                 // 'acik' | 'koyu' | 'sistem'
  sayfayiKoyulastir: false,       // koyu modda sayfayı da koyulaştır (görselleri koru)
  yaziCizimi: 'anaHat',           // 'anaHat' ("Dengeli": düz yazı ClearType'la, kalın yazının fazla koyuluğu giderilir, döndürülmüş yazı ana hatlarından) | 'sistem' (hepsi Chromium / ClearType); renderer/yaziTipleri.js
  // Sayfa düzeni
  varsayilanZoom: 'genislik',     // 'son' | 'genislik' | 'sayfa' | 'gercek' | sayı (yüzde)
  sonZoom: 100,
  varsayilanDuzen: 'surekli',     // 'tek' | 'surekli' | 'iki' | 'ikiSurekli'
  kapakAyri: false,
  dondurmeKapsami: 'sor',         // 'sor' | 'sayfa' | 'tum'; araç çubuğundaki Döndür düğmesinin kapsamı
  // Belge açılışı. Kapalıyken kaydı tutulmaz, kapatılınca silinir: kaldigimSayfadanAc → sayfaKonumlari, sonAcilanlariHatirla → sonDosyalar
  kaldigimSayfadanAc: true,
  sonAcilanlariHatirla: true,
  // Notlar
  yazarAdi: os.userInfo().username || 'Kullanıcı',
  vurguRengi: '#ffd100',          // PDF okuyucularında yaygın varsayılan vurgu rengi: /C [1 .819611 0]
  vurguOpaklik: 0.4,              // aynı yaygın varsayılan: /CA .4
  yaziTipi: 'Segoe UI',
  yaziBoyutu: 12,
  yaziRengi: '#000000',
  yaziArka: null,
  // Kaydetme
  otomatikKaydet: true,           // 0.1.4: kaydedilmeden başka bir programda açılan belgede notlar görünmüyordu
  ciktiKlasoru: '',               // araçların yeni belge çıktıları; boşsa Masaüstü (app.getPath('desktop'))
  // Kopyalama
  temizMetin: true,
  // Güncelleme: haftada bir otomatik denetle. Son denetimin zamanı (sonDenetimZamani) main/guncelleme.js'te; varsayılanı yoktur,
  // "Varsayılanlara dön" ona dokunmaz.
  otoGuncelle: true,
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
// Eski varsayılan vurgu rengi (#ffeb3b) bugünkü varsayılana (#ffd100) bir kez taşınır; kullanıcının seçtiği başka renk korunur. Taşıma
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
// 0.1.8'e dek "Kaldığım sayfadan aç" kapalıyken de sayfa konumları (dosya yollarıyla) yazılıyordu: kapalı ayarın kaydı silinir.
// Son açılanlar için de aynı (ayar dosyası elle değiştirilmişse)
try {
  if (ayarlar.get('kaldigimSayfadanAc') === false && Object.keys(ayarlar.get('sayfaKonumlari') || {}).length) ayarlar.set('sayfaKonumlari', {});
  if (ayarlar.get('sonAcilanlariHatirla') === false && (ayarlar.get('sonDosyalar') || []).length) ayarlar.set('sonDosyalar', []);
} catch (e) { console.warn('Kapalı ayarların kayıtları silinemedi', e); }

export function ayarAl(anahtar) { return ayarlar.get(anahtar); }
export function ayarKoy(anahtar, deger) { ayarlar.set(anahtar, deger); }
