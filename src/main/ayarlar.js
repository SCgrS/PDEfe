// Kalıcı ayarlar (electron-store). Bütün varsayılanlar burada.
import Store from 'electron-store';
import os from 'node:os';

// Gruplar Ayarlar penceresinin sekmeleriyle aynı sırada (renderer/ayarlarPenceresi.js).
export const VARSAYILANLAR = {
  // Görünüm
  tema: 'sistem',                 // 'acik' | 'koyu' | 'sistem'
  sayfayiKoyulastir: false,       // koyu modda sayfayı da koyulaştır (görselleri koru)
  yaziCizimi: 'anaHat',           // 'anaHat' ("Dengeli": düz yazı ClearType'la, kalın yazının fazla koyuluğu giderilir, döndürülmüş yazı ana hatlarından) | 'sistem' (hepsi Chromium / ClearType); renderer/yaziTipleri.js
  // Açılış ve düzen (0.1.12'de Belge açılışı ve Sayfa düzeni birleşti). Kapalıyken kaydı tutulmaz, kapatılınca silinir:
  // kaldigimSayfadanAc → sayfaKonumlari, sonAcilanlariHatirla → sonDosyalar
  kaldigimSayfadanAc: true,
  sonAcilanlariHatirla: true,
  varsayilanZoom: 'genislik',     // 'son' | 'genislik' | 'sayfa' | 'gercek' | sayı (yüzde)
  sonZoom: 100,
  varsayilanDuzen: 'surekli',     // 'tek' | 'surekli' | 'iki' | 'ikiSurekli'
  kapakAyri: false,
  // Not ve vurgu
  yazarAdi: os.userInfo().username || 'Kullanıcı',
  vurguRengi: '#ffd100',          // PDF okuyucularında yaygın varsayılan vurgu rengi: /C [1 .819611 0]
  vurguOpaklik: 0.4,              // aynı yaygın varsayılan: /CA .4
  yaziTipi: 'Segoe UI',
  yaziBoyutu: 12,
  yaziRengi: '#000000',
  yaziArka: null,
  // Kaydetme
  otomatikKaydet: false,          // 0.1.4–0.1.11 varsayılan açıktı; 0.1.12'de kullanıcı isteğiyle kapalı (aşağıdaki taşıma)
  ciktiKlasoru: '',               // araçların yeni belge çıktıları; boşsa Masaüstü (app.getPath('desktop'))
  // Kopyalama ayarı (temizMetin) 0.1.12'de kalktı: kopyalama her zaman temiz metin
  // Güncelleme: haftada bir otomatik denetle. Son denetimin zamanı (sonDenetimZamani) main/guncelleme.js'te; varsayılanı yoktur,
  // "Varsayılanlara dön" ona dokunmaz.
  otoGuncelle: true,
  // Durum
  sonDosyalar: [],
  sayfaKonumlari: {},
  solPanelGenislik: 240,
  solPanelAcik: false,
  solPanelSekme: 'sayfalar',
  menuCubugu: false,              // pencerenin menü çubuğu (Dosya, Düzen…) görünür mü; 0.1.24'ten beri varsayılan gizli, araç çubuğundaki düğmeyle açılır
  pencere: {},
};

/** Kaldırılmış ayarlar: eski sürümlerin yapılandırma dosyalarından silinir (0.1.8: 10 açılışta bir denetimin sayacı → haftalık denetim;
 *  0.1.12: Kopyalama ayarı ve 0.1.4'ün otomatik kaydetme taşımasının bayrağı; 0.1.27: Döndür düğmesinin kapsamı, düğme artık yalnızca
 *  geçerli sayfayı döndürür). */
const KALDIRILAN_ANAHTARLAR = ['sekmeleriHatirla', 'acikSekmeler', 'sekmeDegisimindeSor', 'sonGuncellemeDenetimi', 'acilisSayaci', 'sonDenetimAcilisi', 'sonDenetimSurumu', 'temizMetin', 'otomatikKaydetTasindi', 'dondurmeKapsami'];

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
// 0.1.12'de otomatik kaydetme varsayılan olarak kapandı (kullanıcı isteği: ilk kurulumda kapalı, kullanıcının kendi kurulumunda da
// kapansın). Eski sürümlerin dosyasında yazılı duran true (0.1.4–0.1.11 varsayılanı) bir kez false olur; sonradan açan kullanıcının
// seçimi korunur (bayrak). 0.1.4'ün tersi yöndeki taşımasının bayrağı (otomatikKaydetTasindi) yukarıda silinir
try {
  if (!ayarlar.get('otomatikKaydetKapatildi')) {
    ayarlar.set('otomatikKaydet', false);
    ayarlar.set('otomatikKaydetKapatildi', true);
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
