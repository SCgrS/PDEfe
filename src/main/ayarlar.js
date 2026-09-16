// Kalıcı ayarlar (electron-store). Bütün varsayılanlar burada.
import Store from 'electron-store';
import os from 'node:os';

export const VARSAYILANLAR = {
  // Görünüm
  tema: 'sistem',                 // 'acik' | 'koyu' | 'sistem'
  sayfayiKoyulastir: false,       // koyu modda sayfayı da koyulaştır (görselleri koru)
  // Başlangıç
  varsayilanZoom: 'genislik',     // 'son' | 'genislik' | 'sayfa' | 'gercek' | sayı (yüzde)
  sonZoom: 100,
  varsayilanDuzen: 'surekli',     // 'tek' | 'surekli' | 'iki' | 'ikiSurekli'
  kapakAyri: false,
  sekmeleriHatirla: true,
  kaldigimSayfadanAc: true,
  // Notlar
  yazarAdi: os.userInfo().username || 'Kullanıcı',
  vurguRengi: '#ffeb3b',
  vurguOpaklik: 0.4,
  yaziTipi: 'Segoe UI',
  yaziBoyutu: 12,
  yaziRengi: '#000000',
  yaziArka: null,
  otomatikKaydet: false,
  sekmeDegisimindeSor: true,
  // Kopyalama
  temizMetin: true,
  // Güncelleme
  otoGuncelle: true,
  // Dosya
  ciktiKlasoru: '',
  // Durum
  sonDosyalar: [],
  acikSekmeler: [],
  sayfaKonumlari: {},
  solPanelGenislik: 240,
  solPanelAcik: false,
  solPanelSekme: 'sayfalar',
  pencere: {},
};

export const ayarlar = new Store({ name: 'ayarlar', defaults: VARSAYILANLAR, clearInvalidConfig: true });

export function ayarAl(anahtar) { return ayarlar.get(anahtar); }
export function ayarKoy(anahtar, deger) { ayarlar.set(anahtar, deger); }
