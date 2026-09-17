// Kalıcı ayarlar (electron-store). Bütün varsayılanlar burada.
import Store from 'electron-store';
import os from 'node:os';

export const VARSAYILANLAR = {
  // Görünüm
  tema: 'sistem',                 // 'acik' | 'koyu' | 'sistem'
  sayfayiKoyulastir: false,       // koyu modda sayfayı da koyulaştır (görselleri koru)
  dondurmeKapsami: 'sor',         // 'sor' | 'sayfa' | 'tum'; araç çubuğundaki Döndür düğmesinin kapsamı
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
  otomatikKaydet: false,
  // Kopyalama
  temizMetin: true,
  // Güncelleme
  otoGuncelle: true,
  // Dosya
  ciktiKlasoru: '',
  // Durum
  sonDosyalar: [],
  sayfaKonumlari: {},
  solPanelGenislik: 240,
  solPanelAcik: false,
  solPanelSekme: 'sayfalar',
  pencere: {},
};

/** Kaldırılmış ayarlar: eski sürümlerin yapılandırma dosyalarından silinir. */
const KALDIRILAN_ANAHTARLAR = ['sekmeleriHatirla', 'acikSekmeler', 'sekmeDegisimindeSor'];

export const ayarlar = new Store({ name: 'ayarlar', defaults: VARSAYILANLAR, clearInvalidConfig: true });
for (const anahtar of KALDIRILAN_ANAHTARLAR) { try { if (ayarlar.has(anahtar)) ayarlar.delete(anahtar); } catch (e) { console.warn('Eski ayar silinemedi', anahtar, e); } }
// Eski varsayılan vurgu rengi (#ffeb3b) referans okuyucunun varsayılanına taşınır; kullanıcının seçtiği başka renk korunur
try { if (String(ayarlar.get('vurguRengi') ?? '').toLowerCase() === '#ffeb3b') ayarlar.set('vurguRengi', VARSAYILANLAR.vurguRengi); } catch (e) { console.warn('Vurgu rengi taşınamadı', e); }

export function ayarAl(anahtar) { return ayarlar.get(anahtar); }
export function ayarKoy(anahtar, deger) { ayarlar.set(anahtar, deger); }
