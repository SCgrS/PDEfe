// Kalıcı ayarlar (electron-store). Bütün varsayılanlar burada.
// 0.2.10 (açılış hızı): electron-store'un yüklenmesi (conf, ajv…; ~50 ms, bazen daha uzun) açılışta pencereyi bekletiyordu; pencereden
// sonra yüklenince de arayüzün açılışıyla ana süreç için yarışıyordu: ana süreç o arada bloke olunca pencerenin gösterilmesi (ready-to-show)
// ve onunla PDF.js'in ekran karesi bekleyen sayfa çizimi gecikiyordu (ölçüldü). Depo artık açılış bittikten sonra arka planda yüklenir
// (anaSurec.js, ayarDeposu). O ana dek ayarlar ayarlar.json'un kopyasından okunur (varsayılanlar ve taşımalar uygulanmış: deponun yüklenince
// yazacağıyla aynı); yazılanlar kopyaya yazılır ve sıraya girer, depo yüklenince sırasıyla dosyaya geçer. Çıkışta (anaSurec.js) depo
// yüklenmemişse yüklenip sıradakiler yazılır. Değeri değişmeyen yazım (açılışta arayüzün aynı değeri yazması) sıraya girmez. Dosya
// açılışta okunamıyorsa (başka bir program kilitlemiş) kopya alınmaz, depo hemen yüklenir (0.2.10 inceleme; kopyaAl).
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { app } from 'electron';

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
  varsayilanZoom: 'genislik',     // 'genislik' | 'sayfa' | 'gercek' | sayı (yüzde); 0.2.4'te 'son' ve 'gorunur' kalktı (aşağıda taşınır)
  varsayilanDuzen: 'surekli',     // 'tek' | 'surekli' | 'iki' | 'ikiSurekli'
  kapakAyri: false,
  // Birden çok sekmeli pencerenin kapatma düğmesi (×, Alt+F4, Mac'te kırmızı düğme; 0.2.2, kullanıcı isteği): 'sor' ("Geçerli sekme /
  // Tüm sekmeler" sorulur; sorudaki "Bir daha sorma" öteki ikisinden birini yazar) | 'sekme' (yalnızca geçerli sekme kapanır) | 'pencere'
  // (pencere bütün sekmeleriyle kapanır). Bilinmeyen değer 'sor' sayılır (renderer/uygulama.js kapatmaKapsami)
  pencereKapatma: 'sor',
  // Not ve vurgu
  yazarAdi: os.userInfo().username || 'Kullanıcı',
  vurguRengi: '#ffd100',          // PDF okuyucularında yaygın varsayılan vurgu rengi: /C [1 .819611 0]
  vurguOpaklik: 0.4,              // aynı yaygın varsayılan: /CA .4
  yaziTipi: process.platform === 'darwin' ? 'Arial' : 'Segoe UI',   // macOS'ta Segoe UI yok (0.2.0)
  yaziBoyutu: 12,
  yaziRengi: '#000000',
  yaziArka: null,
  // Kaydetme
  otomatikKaydet: false,          // 0.1.4–0.1.11 varsayılan açıktı; 0.1.12'de kullanıcı isteğiyle kapalı (aşağıdaki taşıma)
  ciktiKlasoru: '',               // araçların yeni belge çıktıları; boşsa Masaüstü (app.getPath('desktop'))
  // Dosya Formatını Değiştir (0.2.6): UYAP Doküman Editörü'nün klasörü (null: kendiliğinden bulunur; Ayarlar › Kaydetme). Yalnızca ana
  // sürecin klasör seçme penceresinden (ayar:udeKlasoruSec) yazılır, arayüz yalnızca null yapabilir: çekirdek bu klasördeki Java'yı çalıştırır
  udeYolu: null,
  // Kopyalama ayarı (temizMetin) 0.1.12'de kalktı: kopyalama her zaman temiz metin
  // Güncelleme: iki günde bir otomatik denetle (0.2.8; önceden haftada bir). Son denetimin zamanı (sonDenetimZamani) main/guncelleme.js'te;
  // varsayılanı yoktur, "Varsayılanlara dön" ona dokunmaz.
  otoGuncelle: true,
  // Durum
  sonDosyalar: [],
  sayfaKonumlari: {},
  solPanelGenislik: 240,
  solPanelAcik: false,
  solPanelSekme: 'sayfalar',
  menuCubugu: false,              // pencerenin menü çubuğu (Dosya, Düzen…) görünür mü; 0.1.24'ten beri varsayılan gizli, araç çubuğundaki düğmeyle açılır
  // Yazdırma penceresinin son seçimleri (0.2.6, renderer/yazdir.js): { yazici, harmanla, kagit, olcek, renk, ciftTarafli }. Kopya sayısı,
  // sayfa aralığı ve "Notları yazdır" kalıcı değil (bir sonraki yazdırmada kendiliğinden 5 kopya ya da notlar basılmasın)
  yazdirma: {},
  // Dosya Formatını Değiştir'in son seçimleri (0.2.6, renderer/araclar/donustur.js): { hedefler: { <girdinin türü>: <hedef biçim> } }; yeni
  // eklenen dosyada o türün son seçilen hedefi önerilir (ilk kez: PDF'te UDF, ötekilerde PDF)
  donusturme: {},
  pencere: {},
};

/** Kaldırılmış ayarlar: eski sürümlerin yapılandırma dosyalarından silinir (0.1.8: 10 açılışta bir denetimin sayacı → haftalık denetim;
 *  0.1.12: Kopyalama ayarı ve 0.1.4'ün otomatik kaydetme taşımasının bayrağı; 0.1.27: Döndür düğmesinin kapsamı, düğme artık yalnızca
 *  geçerli sayfayı döndürür; 0.2.4: "Son kullanılan" yakınlaştırmanın kaydı). */
const KALDIRILAN_ANAHTARLAR = ['sekmeleriHatirla', 'acikSekmeler', 'sekmeDegisimindeSor', 'sonGuncellemeDenetimi', 'acilisSayaci', 'sonDenetimAcilisi', 'sonDenetimSurumu', 'temizMetin', 'otomatikKaydetTasindi', 'dondurmeKapsami', 'sonZoom'];

/** @type {import('electron-store').default|null} */
let ayarlar = null;
let kopya = null;              // depo yüklenene dek: ayarlar.json'un kopyası (varsayılanlar ve taşımalar uygulanmış)
const bekleyenYazimlar = [];   // depo yüklenmeden yazılanlar: [anahtar, değer] (depo yüklenince sırasıyla yazılır)

/** Kopya üzerinde depo gibi işlem (taşımalar için): get / set / has / delete. */
const kopyaErisimi = (o) => ({ get: (k) => o[k], set: (k, v) => { o[k] = v; }, has: (k) => k in o, delete: (k) => { delete o[k]; } });

// Ayar dosyası o an okunamıyorsa (yedekleme, eşitleme ya da virüs tarayıcısı paylaşımsız açmış) depo bu kadar kez, bu aralıkla denenir (~0,35 sn)
const OKUMA_DENEMESI = 8, DENEME_ARALIGI_MS = 50;

/** Eş zamanlı kısa bekleme (yalnızca ayar dosyası okunamazken; ana süreç zaten okumayı bekliyor). */
function bekleEsZamanli(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  catch { const son = Date.now() + ms; while (Date.now() < son) { /* bekle */ } }
}

/** electron-store'un dosyası (name: 'ayarlar'): veri klasöründe ayarlar.json. Dosya yoksa ya da bozuksa (clearInvalidConfig gibi) yalnızca
 *  varsayılanlar. Taşımalar kopyada da yapılır (yalnızca bellekte; dosyaya depo yüklenince yazılır). Dosya var ama okunamıyorsa kopya
 *  alınmaz, depo hemen yüklenir (aşağıda): null döner, ayarlar depodan okunur. */
function kopyaAl() {
  if (kopya) return kopya;
  const yol = path.join(app.getPath('userData'), 'ayarlar.json');
  let metin = null;
  try { metin = fs.readFileSync(yol, 'utf8'); }
  catch (e) {
    if (e?.code !== 'ENOENT') {
      // 0.2.10 inceleme: önceden her okuma hatası varsayılanlara düşüyordu. Arayüz son açılanları ve sayfa konumlarını bu kopyadan alıp
      // bütünüyle yazdığı için kayıtlı listeler sonradan boşuyla üzerine yazılıyordu. Depo hemen yüklenir (0.2.9'daki gibi; kısa aralıklarla
      // yeniden denenir); o da okuyamazsa açılış hatası ("PDEfe açılamadı", anaSurec.js), dosya değişmez
      depoyuHemenYukle(yol);
      return null;
    }
  }
  let dosya = {};
  if (metin != null) {
    try {
      const j = JSON.parse(metin);
      if (j && typeof j === 'object' && !Array.isArray(j)) dosya = j;
    } catch { /* bozuk: depo da (clearInvalidConfig) varsayılanlarla başlar */ }
  }
  kopya = structuredClone({ ...VARSAYILANLAR, ...dosya });
  tasimalariYap(kopyaErisimi(kopya));
  return kopya;
}

/** Ayar dosyası açılışta okunamadı: depo hemen yüklenir; yüklenemezse kullanıcıya dönük iletili hata (anaSurec.js acilisHatasi). */
function depoyuHemenYukle(yol) {
  try { ayarDeposu({ deneme: OKUMA_DENEMESI }); }
  catch (e) {
    const hata = new Error(`Ayar dosyası okunamadı: ${yol} (${e?.code || e?.message || e})`, { cause: e });
    hata.kullaniciIletisi = 'Ayar dosyası okunamadı: başka bir program (yedekleme, eşitleme ya da virüs tarayıcısı) dosyayı kullanıyor olabilir. Biraz sonra PDEfe\'yi yeniden açın.';
    throw hata;
  }
}

/** Depoyu yükler (bir kez; eş zamanlı): taşımalar dosyaya yazılır, bekleyen yazımlar sırasıyla depoya geçer. electron-store yalnız ES
 *  modülüdür; require ile eş zamanlı yüklenir (Node'un require(esm) desteği): çıkışta beklemeden yüklenip yazılabilsin. deneme: dosya
 *  okunamazsa kaç kez denenir (DENEME_ARALIGI_MS arayla); son denemenin hatası fırlatılır. Yazılamayan bekleyen yazım sırada kalır. */
export function ayarDeposu({ deneme = 1 } = {}) {
  if (ayarlar) return ayarlar;
  const { default: Store } = createRequire(import.meta.url)('electron-store');
  let depo = null;
  for (let i = 1; !depo; i++) {
    try { depo = new Store({ name: 'ayarlar', defaults: VARSAYILANLAR, clearInvalidConfig: true }); }
    catch (e) { if (i >= deneme) throw e; bekleEsZamanli(DENEME_ARALIGI_MS); }
  }
  tasimalariYap(depo);
  while (bekleyenYazimlar.length) { const [anahtar, deger] = bekleyenYazimlar[0]; depo.set(anahtar, deger); bekleyenYazimlar.shift(); }
  ayarlar = depo;
  kopya = null;
  return depo;
}

/** Eski sürümlerin kayıtlarını taşır (depo yüklenince ve kopyada; ayarlar: get / set / has / delete). Her taşıma bir kez (bayrak) ya da
 *  yalnızca eski değer varken çalışır: kopyada yapılıp depoda yinelenmesi aynı sonucu verir. */
function tasimalariYap(ayarlar) {
  for (const anahtar of KALDIRILAN_ANAHTARLAR) { try { if (ayarlar.has(anahtar)) ayarlar.delete(anahtar); } catch (e) { console.warn('Eski ayar silinemedi', anahtar, e); } }
  // 0.2.4 (kullanıcı isteği): varsayılan yakınlaştırmanın "Son kullanılan" ve "Görünür alana sığdır" seçenekleri kalktı; onları seçmiş olan
  // kullanıcıda varsayılana (genişliğe sığdır) döner
  try {
    if (['son', 'gorunur'].includes(ayarlar.get('varsayilanZoom'))) ayarlar.set('varsayilanZoom', VARSAYILANLAR.varsayilanZoom);
  } catch (e) { console.warn('Yakınlaştırma ayarı taşınamadı', e); }
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
  // 0.2.3, kullanıcı isteği ("ilk yükleme başlangıcında sayfalar kısmı açık olmasın. ilk yüklemede varsayılan olarak gizli açılsın. daha sonra
  // nasıl bırakıldıysa ayarı korunsun"): varsayılan zaten kapalıydı (solPanelAcik: false), F4 / düğme durumu yazıyordu; kullanıcının kendi
  // kurulumunda eskiden açık bırakılan panel kayıtlı kaldığı için açık geliyordu. Bu sürümle panel bir kez kapanır (bayrak:
  // solPanelKapatildi); sonra açılırsa açık kalır. Bayrak VARSAYILANLAR'da değil, "Varsayılanlara dön" ona dokunmaz (öteki taşıma bayrakları
  // gibi; solPanelAcik da DURUM_ANAHTARLARI'nda, o da sıfırlanmaz). Taşıma ana süreçte, arayüz ayarları okumadan önce bir kez: sonradan
  // açılan pencereler (Pencereye ayır, yeni pencere) aynı kaydı okur
  try {
    if (!ayarlar.get('solPanelKapatildi')) {
      ayarlar.set('solPanelAcik', false);
      ayarlar.set('solPanelKapatildi', true);
    }
  } catch (e) { console.warn('Sol panel ayarı taşınamadı', e); }
  // 0.1.8'e dek "Kaldığım sayfadan aç" kapalıyken de sayfa konumları (dosya yollarıyla) yazılıyordu: kapalı ayarın kaydı silinir.
  // Son açılanlar için de aynı (ayar dosyası elle değiştirilmişse)
  try {
    if (ayarlar.get('kaldigimSayfadanAc') === false && Object.keys(ayarlar.get('sayfaKonumlari') || {}).length) ayarlar.set('sayfaKonumlari', {});
    if (ayarlar.get('sonAcilanlariHatirla') === false && (ayarlar.get('sonDosyalar') || []).length) ayarlar.set('sonDosyalar', []);
  } catch (e) { console.warn('Kapalı ayarların kayıtları silinemedi', e); }
}

export function ayarAl(anahtar) {
  const k = ayarlar ? null : kopyaAl();
  if (!k) return ayarlar.get(anahtar);   // depo yüklü (ya da dosya okunamadığı için şimdi yüklendi)
  const v = k[anahtar];
  return v && typeof v === 'object' ? structuredClone(v) : v;   // depo gibi her okumada ayrı nesne
}
/** Yazar. Depo henüz yüklenmediyse kopyaya yazılır ve sıraya girer (değeri değişmiyorsa girmez); depo yüklenince dosyaya geçer. */
export function ayarKoy(anahtar, deger) {
  const k = ayarlar ? null : kopyaAl();
  if (!k) { ayarlar.set(anahtar, deger); return; }
  if (deger === undefined) throw new TypeError('Use `delete()` to clear values');   // electron-store gibi
  if (anahtar in k && JSON.stringify(k[anahtar]) === JSON.stringify(deger)) return;
  k[anahtar] = structuredClone(deger);
  bekleyenYazimlar.push([anahtar, structuredClone(deger)]);
}
/** Depo yüklenmeden yazılıp dosyaya geçmemiş değer var mı. */
export function bekleyenYazimVar() { return bekleyenYazimlar.length > 0; }
/** Bütün ayarlar (arayüzün 'ayar:al'ı). */
export function tumAyarlar() {
  const k = ayarlar ? null : kopyaAl();
  return k ? structuredClone(k) : ayarlar.store;
}
