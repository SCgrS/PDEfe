// Ana süreç güncelleme mantığının (src/main/guncelleme.js) birim denemesi: sahte electron-updater, sahte ayar deposu, sahte saat, Electron'suz.
// Kullanım (depo kökünden): node test/guncelleme-e2e/birim.mjs      çıkış kodu: hata varsa 1
// Kapsam: haftalık denetim (ilk açılış, 7 gün, saat geri alınması), başarısız otomatik denetimin süreyi başlatmaması, elle denetimin süreyi
// başlatması, açık kalan uygulamada saatlik bakış, bekleyen (indirilip kurulmamış) sürümün sonraki açılışta bir kez denetlenmesi, elle
// denetimin indirme/hazır aşamasını bildirmesi, Türkçe hata metinleri, tek quitAndInstall. 0.2.5: indirme başlayınca bekleyen kaydı (yarım
// kalan indirme sonraki açılışta yeniden önerilir), bağlantı kopunca bekleyen kalır ve Yeniden dene, donmuş indirmenin bekçisi (jetonla
// kesilir; ilerleyen yavaş indirme kesilmez; jeton sınıfı yoksa eskisi gibi), önbellek temizliği (yarım dosyalar, kurulmuş sürümün kurucusu).
import { EventEmitter } from 'node:events';
import { guncellemeKur, acilisDenetimi, sirasiGeldiMi, hataMetni, onbellekTemizle, AYAR_SON_DENETIM, DENETIM_ARALIGI_MS, DONMUS_INDIRME } from '../../src/main/guncelleme.js';

const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
let hata = 0;
function kontrol(ad, kosul, ek = '') {
  if (!kosul) hata++;
  console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ek ? ' | ' + ek : ''}`);
}
const GUN = 24 * 3600 * 1000, T0 = Date.UTC(2026, 8, 23, 9, 0, 0);

// ---- haftalık sıra (yalnızca sirasiGeldiMi / acilisDenetimi)
{
  const al = (o) => (k) => o[k];
  kontrol('7 gün = DENETIM_ARALIGI_MS', DENETIM_ARALIGI_MS === 7 * GUN);
  kontrol('hiç denetlenmemiş: sıra geldi', sirasiGeldiMi(al({}), T0));
  kontrol('6 gün 23 saat: sıra gelmedi', !sirasiGeldiMi(al({ [AYAR_SON_DENETIM]: T0 }), T0 + 7 * GUN - 3600e3));
  kontrol('7 gün: sıra geldi', sirasiGeldiMi(al({ [AYAR_SON_DENETIM]: T0 }), T0 + 7 * GUN));
  kontrol('saat geri alınmış (son denetim gelecekte): sıra geldi', sirasiGeldiMi(al({ [AYAR_SON_DENETIM]: T0 + GUN }), T0));
  kontrol('bozuk zaman: sıra geldi', sirasiGeldiMi(al({ [AYAR_SON_DENETIM]: 'dün' }), T0));
  const depo = new Map([[AYAR_SON_DENETIM, T0], ['bekleyenGuncelleme', '0.9.1']]);
  const a = acilisDenetimi({ ayarAl: (k) => depo.get(k), ayarKoy: (k, v) => depo.set(k, v), surum: '0.9.0', simdi: T0 + GUN });
  kontrol('bekleyen sürüm: süreye bakılmadan denetlenir', a.denetlenecek && a.bekleyen === '0.9.1');
  const b = acilisDenetimi({ ayarAl: (k) => depo.get(k), ayarKoy: (k, v) => depo.set(k, v), surum: '0.9.1', simdi: T0 + GUN });
  kontrol('bekleyen sürüm kurulmuş: kayıt silinir, denetim yok', !b.denetlenecek && depo.get('bekleyenGuncelleme') === '');
}

// ---- guncellemeKur
function kurulum({ surum = '0.9.0', ayar = {}, ilkOrnek = true, simdi = T0, bakisAraligiMs = 1e9, kurulumBeklemeMs = 30000, IptalJetonu = null, indirmeBeklemeMs, yardimci = null, temizlikYeniden = [20, 40], temizlikFs = null } = {}) {
  const depo = new Map(Object.entries(ayar));
  const ipc = new Map();
  const giden = [];
  const app = new EventEmitter(); app.getVersion = () => surum; app.isPackaged = true;
  const au = new EventEmitter();
  au.kayit = { denetim: 0, indirme: 0, kurulum: [] };
  au.s = { sunucuda: '0.9.1', denetimHatasi: null, indirmeMs: 30, indirmeHatasi: null, kurulumHatasi: null };
  au.checkForUpdates = async () => {
    au.kayit.denetim++; au.emit('checking-for-update'); await bekle(5);
    if (au.s.denetimHatasi) { const e = au.s.denetimHatasi(); au.emit('error', e); throw e; }
    const info = { version: au.s.sunucuda, releaseNotes: '<p>not</p>' };
    return { isUpdateAvailable: au.s.sunucuda !== surum, updateInfo: info };
  };
  au.downloadUpdate = async () => {
    au.kayit.indirme++; await bekle(au.s.indirmeMs);
    if (au.s.indirmeHatasi) { const e = au.s.indirmeHatasi(); au.emit('error', e); throw e; }
    au.emit('update-downloaded', { version: au.s.sunucuda }); return ['x'];
  };
  au.quitAndInstall = (sessiz, calistir) => {
    au.kayit.kurulum.push([sessiz, calistir]);
    if (au.s.kurulumHatasi) au.emit('error', au.s.kurulumHatasi());   // BaseUpdater.install → dispatchError (senkron)
  };
  if (yardimci) au.getOrCreateDownloadHelper = async () => yardimci;   // electron-updater'ın önbellek yardımcısı (0.2.5, onbellekTemizle)
  const sayac = { kapatmayaHazirla: 0, kapatmaIptal: 0 };
  const saat = { simdi };
  const g = guncellemeKur({
    app, ipcMain: { handle: (k, f) => ipc.set(k, f) }, autoUpdater: au, etkin: true, ilkOrnek, acilisGecikmesiMs: 20, bakisAraligiMs, kurulumBeklemeMs,
    IptalJetonu, ...(indirmeBeklemeMs != null ? { indirmeBeklemeMs } : {}), temizlikYeniden, temizlikFs,
    saat: () => saat.simdi,
    pencereyeGonder: (k, v) => giden.push([k, v]), ayarAl: (k) => depo.get(k), ayarKoy: (k, v) => depo.set(k, v),
    kapatmayaHazirla: () => sayac.kapatmayaHazirla++, kapatmaIptal: () => sayac.kapatmaIptal++,
  });
  return { g, au, app, depo, giden, sayac, saat, cagir: (k, ...a) => ipc.get(k)({}, ...a), ayar: () => Object.fromEntries(depo) };
}
/** Otomatik denetim zamanlayıcısını çalıştırır ve denetimin bitmesini bekler. */
async function otomatik(k) { k.g.pencereGosterildi(); await bekle(120); k.g.durdur(); }
const ayar = (k) => JSON.stringify({ son: k.depo.get(AYAR_SON_DENETIM), bekleyen: k.depo.get('bekleyenGuncelleme') });

// Haftalık otomatik denetim: ilk açılış, hafta dolmadan / dolunca, başarısız denetim süreyi başlatmaz
{
  const k1 = kurulum({ ayar: {} });
  await otomatik(k1);
  kontrol('ilk açılış (hiç denetlenmemiş) denetler, zamanı yazar', k1.au.kayit.denetim === 1 && k1.depo.get(AYAR_SON_DENETIM) === T0, ayar(k1));
  kontrol('ilk açılışta şerit olayı (guncelleme:var)', k1.giden.some(([x]) => x === 'guncelleme:var'));
  const k2 = kurulum({ ayar: k1.ayar(), simdi: T0 + 3 * GUN });
  await otomatik(k2);
  kontrol('3 gün sonra açılış denetlemez', k2.au.kayit.denetim === 0 && k2.depo.get(AYAR_SON_DENETIM) === T0, ayar(k2));
  const k3 = kurulum({ ayar: k1.ayar(), simdi: T0 + 7 * GUN + 60e3 });
  await otomatik(k3);
  kontrol('7 gün sonra açılış denetler, süre yeniden başlar', k3.au.kayit.denetim === 1 && k3.depo.get(AYAR_SON_DENETIM) === T0 + 7 * GUN + 60e3, ayar(k3));
  // ağ yok: süre başlamaz, sonraki açılış yeniden dener
  const k4 = kurulum({ ayar: k1.ayar(), simdi: T0 + 8 * GUN });
  k4.au.s.denetimHatasi = () => new Error('net::ERR_INTERNET_DISCONNECTED');
  await otomatik(k4);
  kontrol('8. gün: ağ yok, denetim denendi', k4.au.kayit.denetim === 1);
  kontrol('ağ hatasında şerit olayı yok', !k4.giden.some(([x]) => x === 'guncelleme:hata' || x === 'guncelleme:var'));
  kontrol('ağ hatası süreyi başlatmadı', k4.depo.get(AYAR_SON_DENETIM) === T0, ayar(k4));
  const k5 = kurulum({ ayar: k4.ayar(), simdi: T0 + 8 * GUN + 3600e3 });
  await otomatik(k5);
  kontrol('sonraki açılış yeniden denetler ve zamanı yazar', k5.au.kayit.denetim === 1 && k5.depo.get(AYAR_SON_DENETIM) === T0 + 8 * GUN + 3600e3, ayar(k5));
  // sunucu 404 (yayımlanmış sürüm yok) da hatadır: süre başlamaz
  const k6 = kurulum({ ayar: k1.ayar(), simdi: T0 + 9 * GUN });
  k6.au.s.denetimHatasi = () => Object.assign(new Error('Cannot find channel "latest.yml" update info: HttpError: 404'), { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' });
  await otomatik(k6);
  kontrol('sunucu 404: süre başlamaz', k6.depo.get(AYAR_SON_DENETIM) === T0);
  // güncel sonucu da süreyi başlatır
  const k7 = kurulum({ ayar: k1.ayar(), simdi: T0 + 9 * GUN }); k7.au.s.sunucuda = '0.9.0';
  await otomatik(k7);
  kontrol('güncel sonucu (yok) zamanı yazar', k7.depo.get(AYAR_SON_DENETIM) === T0 + 9 * GUN && !k7.giden.some(([x]) => x === 'guncelleme:var'));
  // otoGuncelle kapalı: denetim yok, süre değişmez
  const k8 = kurulum({ ayar: { ...k1.ayar(), otoGuncelle: false }, simdi: T0 + 9 * GUN });
  await otomatik(k8);
  kontrol('otoGuncelle kapalı: denetim yok', k8.au.kayit.denetim === 0 && k8.depo.get(AYAR_SON_DENETIM) === T0);
  // ikinci örnek otomatik denetlemez, zaman yazmaz
  const k9 = kurulum({ ayar: {}, ilkOrnek: false });
  await otomatik(k9);
  kontrol('ikinci örnek denetlemez', k9.au.kayit.denetim === 0 && k9.depo.get(AYAR_SON_DENETIM) === undefined);
  // saat geri alınmış: denetlenir
  const k10 = kurulum({ ayar: { [AYAR_SON_DENETIM]: T0 + 30 * GUN }, simdi: T0 });
  await otomatik(k10);
  kontrol('saat geri alınmış: denetler, zamanı düzeltir', k10.au.kayit.denetim === 1 && k10.depo.get(AYAR_SON_DENETIM) === T0);
}

// Elle denetim süreyi başlatır; durum IPC'si son denetimi bildirir
{
  const k = kurulum({ ayar: { [AYAR_SON_DENETIM]: T0 }, simdi: T0 + 5 * GUN });
  const r = await k.cagir('guncelleme:denetle');
  kontrol('elle denetim sonucu var', r.durum === 'var' && r.sunucu === true, JSON.stringify(r));
  kontrol('elle denetim zamanı yazar', k.depo.get(AYAR_SON_DENETIM) === T0 + 5 * GUN, ayar(k));
  const d = await k.cagir('guncelleme:durum');
  kontrol('durum.sonDenetim', d.sonDenetim === T0 + 5 * GUN, JSON.stringify(d));
  const k2 = kurulum({ ayar: k.ayar(), simdi: T0 + 8 * GUN });
  await otomatik(k2);
  kontrol('elle denetimden 3 gün sonra açılış denetlemez', k2.au.kayit.denetim === 0);
  k2.au.s.denetimHatasi = () => new Error('getaddrinfo ENOTFOUND github.com');
  const r2 = await k2.cagir('guncelleme:denetle');
  kontrol('başarısız elle denetim zamanı değiştirmez', r2.durum === 'hata' && k2.depo.get(AYAR_SON_DENETIM) === T0 + 5 * GUN);
}

// Açık kalan uygulama: saatlik bakış hafta dolunca denetler; indirilmiş sürüm beklerken denetlemez
{
  const k = kurulum({ ayar: { [AYAR_SON_DENETIM]: T0 }, simdi: T0 + GUN, bakisAraligiMs: 25 });
  k.g.pencereGosterildi();
  await bekle(120);
  kontrol('bakış: hafta dolmadan denetim yok', k.au.kayit.denetim === 0);
  k.saat.simdi = T0 + 7 * GUN + 1;
  await bekle(120);
  kontrol('bakış: hafta dolunca bir kez denetler', k.au.kayit.denetim === 1 && k.depo.get(AYAR_SON_DENETIM) === T0 + 7 * GUN + 1, ayar(k));
  await bekle(120);
  kontrol('bakış: aynı hafta içinde yeniden denetlemez', k.au.kayit.denetim === 1);
  await k.cagir('guncelleme:indir');   // kullanıcı indirdi, kurmadı
  k.saat.simdi = T0 + 15 * GUN;
  await bekle(120);
  kontrol('bakış: indirilmiş sürüm kurulmayı beklerken denetlemez', k.au.kayit.denetim === 1, JSON.stringify(k.au.kayit));
  k.g.durdur();
}

// 0.2.1: macOS'ta Dock › Çık ya da oturum kapatma before-quit olarak gelir, main.js onu engelleyip pencereleri sorar; kullanıcı Vazgeç
// derse uygulama açık kalır. Vazgeçilen çıkış zamanlayıcıları durdurmamalı; yalnızca gerçekten sürdüren çıkış (will-quit) durdurur
{
  const k = kurulum({ ayar: { [AYAR_SON_DENETIM]: T0 }, simdi: T0 + GUN, bakisAraligiMs: 25 });
  k.g.pencereGosterildi();
  k.app.emit('before-quit', { preventDefault() {} });   // main.js çıkışı engelledi, kullanıcı Vazgeç dedi
  k.saat.simdi = T0 + 7 * GUN + 1;
  await bekle(120);
  kontrol('vazgeçilen çıkıştan sonra saatlik bakış sürer, hafta dolunca denetler', k.au.kayit.denetim === 1, JSON.stringify(k.au.kayit));
  k.app.emit('will-quit', { preventDefault() {} });
  k.saat.simdi = T0 + 15 * GUN;
  await bekle(120);
  kontrol('çıkış sürünce (will-quit) bakış durur', k.au.kayit.denetim === 1, JSON.stringify(k.au.kayit));
  k.g.durdur();
}

// Bekleyen (indirilip kurulmamış) sürüm sonraki açılışta bir kez denetlenir
{
  const k = kurulum({ ayar: { [AYAR_SON_DENETIM]: T0 }, simdi: T0 + GUN });   // hafta dolmadı
  await otomatik(k);
  kontrol('hafta dolmadan açılış denetlemez', k.au.kayit.denetim === 0);
  await k.cagir('guncelleme:denetle');
  await k.cagir('guncelleme:indir');   // kullanıcı Güncelle'ye bastı, sonra Vazgeç (kur çağrılmadı), PDEfe kapatıldı
  kontrol('indirilince bekleyenGuncelleme yazıldı', k.depo.get('bekleyenGuncelleme') === '0.9.1', ayar(k));
  const k2 = kurulum({ ayar: k.ayar(), simdi: T0 + 2 * GUN });
  await otomatik(k2);
  kontrol('sonraki açılış bekleyen sürüm için denetler, şerit olayı', k2.au.kayit.denetim === 1 && k2.giden.some(([x]) => x === 'guncelleme:var'), ayar(k2));
  kontrol('hatırlatmadan sonra bekleyen silindi', k2.depo.get('bekleyenGuncelleme') === '', ayar(k2));
  const k3 = kurulum({ ayar: k2.ayar(), simdi: T0 + 3 * GUN });
  await otomatik(k3);
  kontrol('ondan sonraki açılış denetlemez (tek hatırlatma)', k3.au.kayit.denetim === 0, ayar(k3));
  // bekleyen varken ağ yoksa bekleyen kalır, sonraki açılış yine dener
  const k4 = kurulum({ ayar: k.ayar(), simdi: T0 + 2 * GUN });
  k4.au.s.denetimHatasi = () => new Error('getaddrinfo ENOTFOUND github.com');
  await otomatik(k4);
  kontrol('bekleyen + ağ yok: bekleyen kalır', k4.depo.get('bekleyenGuncelleme') === '0.9.1', ayar(k4));
  // bekleyen sürüm kuruldu: bekleyen silinir, hafta dolmadığı için denetlenmez
  const k5 = kurulum({ surum: '0.9.1', ayar: k.ayar(), simdi: T0 + 2 * GUN });
  await otomatik(k5);
  kontrol('bekleyen sürüm kurulunca kayıt silinir, denetim yok', k5.depo.get('bekleyenGuncelleme') === '' && k5.au.kayit.denetim === 0, ayar(k5));
  // hatırlatma anında bu oturumda yeniden indirildiyse kayıt kalır
  const k6 = kurulum({ ayar: k.ayar(), simdi: T0 + 2 * GUN });
  k6.g.pencereGosterildi();
  await k6.cagir('guncelleme:denetle'); await k6.cagir('guncelleme:indir');
  await bekle(120);
  k6.g.durdur();
  kontrol('oturumda yeniden indirildiyse bekleyen kalır', k6.depo.get('bekleyenGuncelleme') === '0.9.1', ayar(k6));
}

// Bulgu 2: elle denetim indirme sürerken ve paket hazırken aşamayı bildirir
{
  const k = kurulum(); k.au.s.indirmeMs = 150;
  const ilk = await k.cagir('guncelleme:denetle');
  kontrol('yeni sürüm: asama var', ilk.durum === 'var' && ilk.asama === 'var' && ilk.mesaj === 'PDEfe 0.9.1 hazır (kullandığınız: 0.9.0).', JSON.stringify(ilk));
  const indirme = k.cagir('guncelleme:indir'); await bekle(20);
  const suren = await k.cagir('guncelleme:denetle');
  kontrol('indirme sürerken: asama indiriliyor, ağa çıkmaz', suren.asama === 'indiriliyor' && suren.mesaj === 'PDEfe 0.9.1 indiriliyor.' && k.au.kayit.denetim === 1, JSON.stringify(suren));
  await indirme;
  const hazir = await k.cagir('guncelleme:denetle');
  kontrol('indirildi: asama hazir', hazir.asama === 'hazir' && hazir.mesaj === 'PDEfe 0.9.1 indirildi, kurulmayı bekliyor.', JSON.stringify(hazir));
  // çift kur → tek quitAndInstall(true, true)
  k.cagir('guncelleme:kur'); k.cagir('guncelleme:kur'); await bekle(10);
  kontrol('çift kur → tek quitAndInstall(true, true)', JSON.stringify(k.au.kayit.kurulum) === '[[true,true]]', JSON.stringify(k.au.kayit.kurulum));
}

// 0.1.19: kurulum uygulamayı kapatmazsa (hata da gelmezse) başlatılamamış sayılır: kapatma onayı geri alınır (kapatmaIptal; izin verirken
// girdiye kilitlenen pencereler açılır), hata bildirilir, yeniden kurulabilir
{
  const k = kurulum({ kurulumBeklemeMs: 40 });
  await k.cagir('guncelleme:denetle'); await k.cagir('guncelleme:indir');
  k.cagir('guncelleme:kur'); await bekle(15);
  kontrol('kurulum başladı: kapatmayaHazirla, henüz iptal yok', k.sayac.kapatmayaHazirla === 1 && k.sayac.kapatmaIptal === 0 && (await k.cagir('guncelleme:durum')).kuruluyor === true);
  await bekle(80);
  const olay = k.giden.find(([x]) => x === 'guncelleme:hata')?.[1];
  kontrol('uygulama kapanmadı → kapatmaIptal, Türkçe ileti, kuruluyor değil', k.sayac.kapatmaIptal === 1 && olay?.mesaj === 'Güncelleme kurulamadı. Kurulum başlamadı; yeniden deneyin.' && (await k.cagir('guncelleme:durum')).kuruluyor === false, JSON.stringify(olay));
  k.cagir('guncelleme:kur'); await bekle(15);
  kontrol('yeniden kur → ikinci quitAndInstall', k.au.kayit.kurulum.length === 2, JSON.stringify(k.au.kayit.kurulum));
  // kurulum hatası bekçiden önce geldiyse bekçi ikinci kez bildirmez
  const k2 = kurulum({ kurulumBeklemeMs: 40 });
  await k2.cagir('guncelleme:denetle'); await k2.cagir('guncelleme:indir');
  k2.au.s.kurulumHatasi = () => new Error('spawn EACCES');
  k2.cagir('guncelleme:kur'); await bekle(100);
  kontrol('kurulum hatası geldiyse bekçi yinelemez', k2.sayac.kapatmaIptal === 1 && k2.giden.filter(([x]) => x === 'guncelleme:hata').length === 1, JSON.stringify(k2.giden.filter(([x]) => x === 'guncelleme:hata')));
}

// Bulgu 3: Türkçe hata metinleri
{
  const k = kurulum();
  await k.cagir('guncelleme:denetle'); await k.cagir('guncelleme:indir');
  k.au.s.kurulumHatasi = () => new Error("No update filepath provided, can't quit and install");
  k.cagir('guncelleme:kur'); await bekle(10);
  const olay = k.giden.find(([x]) => x === 'guncelleme:hata')?.[1];
  kontrol('kurulum dosyası yok → Türkçe ileti, kapatmaIptal', olay?.mesaj === 'Güncelleme kurulamadı. İndirilen kurulum dosyası bulunamadı.' && k.sayac.kapatmaIptal === 1, JSON.stringify(olay));
  const ornekler = [
    [Object.assign(new Error('New version 0.9.1 is not signed by the application owner: x'), { code: 'ERR_UPDATER_INVALID_SIGNATURE' }), 'Kurulum dosyasının imzası doğrulanamadı.'],
    [Object.assign(new Error('sha512 checksum mismatch, expected a, got b'), { code: 'ERR_CHECKSUM_MISMATCH' }), 'İndirilen dosyanın bütünlüğü doğrulanamadı.'],
    [Object.assign(new Error('503 Service Unavailable\nHeaders: {}'), { statusCode: 503, code: 'HTTP_ERROR_503' }), 'Sunucu şu an yanıt vermiyor; biraz sonra yeniden deneyin.'],
    [Object.assign(new Error('403 Forbidden\nHeaders: {}'), { statusCode: 403 }), 'Sunucu isteği şu an kabul etmiyor; biraz sonra yeniden deneyin.'],
    [Object.assign(new Error('No published versions on GitHub'), { code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' }), 'Sürüm bilgisi bulunamadı (henüz yayımlanmış sürüm yok).'],
    [Object.assign(new Error('Cannot parse update info from latest.yml ... sha512: x, rawData: y'), { code: 'ERR_UPDATER_INVALID_UPDATE_INFO' }), 'Sürüm bilgisi okunamadı.'],
    [new Error('net::ERR_CONNECTION_RESET'), 'Sunucuya ulaşılamadı; internet bağlantısını denetleyin.'],
    [new Error('spawn EACCES'), 'Kurulum dosyası başlatılamadı.'],
    [new Error('ENOSPC: no space left on device, write'), 'Diskte yeterli boş yer yok.'],
    [new Error('Something completely unexpected happened'), 'Beklenmeyen bir hata oluştu; biraz sonra yeniden deneyin.'],
    ['düz dize', 'Beklenmeyen bir hata oluştu; biraz sonra yeniden deneyin.'],
  ];
  for (const [e, beklenen] of ornekler) kontrol(`hataMetni: ${String(e.message || e).slice(0, 40)}`, hataMetni(e) === beklenen, hataMetni(e));
  kontrol('hataMetni: indirme 404', hataMetni(Object.assign(new Error('404 Not Found'), { statusCode: 404 }), true) === 'Kurulum dosyası sunucuda bulunamadı.');
  // indirme hatası (tanınmayan) → genel Türkçe ileti
  const k2 = kurulum();
  await k2.cagir('guncelleme:denetle');
  k2.au.s.indirmeHatasi = () => new Error('Unexpected end of JSON input');
  const r = await k2.cagir('guncelleme:indir');
  kontrol('tanınmayan indirme hatası → Türkçe', r.tamam === false && r.mesaj === 'Beklenmeyen bir hata oluştu; biraz sonra yeniden deneyin.', JSON.stringify(r));
}

// ---- 0.2.5: yarım kalan indirme, donmuş indirme, önbellek temizliği
{
  // İndirme başlayınca bekleyen yazılır: PDEfe indirme sürerken kapatılırsa sonraki açılış (hafta dolmadan) denetler, şerit yeniden görünür
  const k = kurulum({ ayar: { [AYAR_SON_DENETIM]: T0 } });
  k.au.s.indirmeMs = 400;
  await k.cagir('guncelleme:denetle');
  const indirme = k.cagir('guncelleme:indir');
  await bekle(60);
  kontrol('indirme başlayınca bekleyenGuncelleme yazıldı (indirme sürerken)', k.depo.get('bekleyenGuncelleme') === '0.9.1', ayar(k));
  const yarim = k.ayar();   // bu anda "PDEfe kapatıldı"
  await indirme;
  const k2 = kurulum({ ayar: yarim, simdi: T0 + GUN });
  await otomatik(k2);
  kontrol('yarım kalan indirmeden sonraki açılış (1 gün sonra) denetler, şerit olayı', k2.au.kayit.denetim === 1 && k2.giden.some(([x]) => x === 'guncelleme:var'), ayar(k2));
  kontrol('yarım indirmenin hatırlatmasından sonra bekleyen silinir (bir kez)', k2.depo.get('bekleyenGuncelleme') === '', ayar(k2));
  // İndirme hatası (bağlantı koptu) da bekleyeni bırakır: kapatılıp açılınca yeniden önerilir
  const k3 = kurulum({ ayar: { [AYAR_SON_DENETIM]: T0 } });
  await k3.cagir('guncelleme:denetle');
  k3.au.s.indirmeHatasi = () => new Error('net::ERR_CONNECTION_RESET');
  const r3 = await k3.cagir('guncelleme:indir');
  kontrol('bağlantı koptu: Türkçe ileti, bekleyen kalır', r3.tamam === false && r3.mesaj === 'Sunucuya ulaşılamadı; internet bağlantısını denetleyin.' && k3.depo.get('bekleyenGuncelleme') === '0.9.1', JSON.stringify(r3) + ' ' + ayar(k3));
  k3.au.s.indirmeHatasi = null;
  const r3b = await k3.cagir('guncelleme:indir');
  kontrol('Yeniden dene: indirme tamamlanır', r3b.tamam === true && k3.au.kayit.indirme === 2, JSON.stringify(r3b));
}
{
  // Donmuş indirme: veri gelmezse bekçi indirmeyi jetonla keser, Türkçe ileti; ilerleyen indirme kesilmez
  class Jeton { constructor() { this.cancelled = false; } cancel() { this.cancelled = true; } }
  const donan = (k, { ilerlemeAdim = 0, ilerlemeMs = 0 } = {}) => {
    k.au.downloadUpdate = async (jeton) => {
      k.au.kayit.indirme++; k.au.jeton = jeton;
      for (let i = 0; i < ilerlemeAdim; i++) { await bekle(ilerlemeMs); k.saat.simdi += ilerlemeMs; k.au.emit('download-progress', { percent: i * 10, transferred: i, total: 10 }); }
      // ilerleme bitti; veri gelmiyor: saat ilerler, jeton kesene dek bekle
      for (let n = 0; n < 200 && !jeton?.cancelled; n++) { await bekle(10); k.saat.simdi += 50; }
      if (jeton?.cancelled) throw Object.assign(new Error('cancelled'), { name: 'CancellationError' });
      k.au.emit('update-downloaded', { version: '0.9.1' }); return ['x'];
    };
  };
  const k = kurulum({ IptalJetonu: Jeton, indirmeBeklemeMs: 1000 });
  donan(k);
  await k.cagir('guncelleme:denetle');
  const r = await k.cagir('guncelleme:indir');
  kontrol('donmuş indirme kesilir, Türkçe ileti', r.tamam === false && r.mesaj === DONMUS_INDIRME && k.au.jeton?.cancelled === true, JSON.stringify(r));
  kontrol('indirme jetonla başlatıldı (CancellationToken)', k.au.jeton instanceof Jeton);
  const d = await k.cagir('guncelleme:durum');
  kontrol('kesildikten sonra indirme sürmüyor (Yeniden dene yeni indirme başlatır)', d.indiriliyor === false);
  // Yavaş ama ilerleyen indirme: her adım bekleme süresinden kısa → kesilmez (bitince update-downloaded)
  const k2 = kurulum({ IptalJetonu: Jeton, indirmeBeklemeMs: 1000 });
  k2.au.downloadUpdate = async (jeton) => {
    k2.au.kayit.indirme++;
    for (let i = 1; i <= 8; i++) { await bekle(15); k2.saat.simdi += 600; k2.au.emit('download-progress', { percent: i * 12, transferred: i, total: 8 }); if (jeton?.cancelled) throw new Error('cancelled'); }
    k2.au.emit('update-downloaded', { version: '0.9.1' }); return ['x'];
  };
  await k2.cagir('guncelleme:denetle');
  const r2 = await k2.cagir('guncelleme:indir');
  kontrol('yavaş ama ilerleyen indirme kesilmez (8 × 0,6 sn > 1 sn bekleme)', r2.tamam === true, JSON.stringify(r2));
  // Jeton sınıfı yoksa (sahte / macOS) indirme eskisi gibi jetonsuz başlar
  const k3 = kurulum();
  let arguman = 'yok';
  const asil = k3.au.downloadUpdate;
  k3.au.downloadUpdate = (...a) => { arguman = a.length; return asil(...a); };
  await k3.cagir('guncelleme:denetle');
  await k3.cagir('guncelleme:indir');
  kontrol('jeton sınıfı yokken downloadUpdate argümansız çağrılır', arguman === 0, String(arguman));
}
{
  // Önbellek temizliği: yarım indirmenin geçici dosyaları her açılışta, kurulmuş sürümün kurucusu (kuruldu) bütün bekleyen klasörüyle
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'pdefe-onbellek-'));
  const bekleyenKlasor = path.join(kok, 'pending');
  const doldur = (adlar) => { fs.mkdirSync(bekleyenKlasor, { recursive: true }); for (const a of adlar) fs.writeFileSync(path.join(bekleyenKlasor, a), 'x'); };
  const yardimci = { cacheDirForPendingUpdate: bekleyenKlasor };
  fs.writeFileSync(path.join(kok, 'installer.exe'), 'eski'); fs.writeFileSync(path.join(kok, 'current.blockmap'), 'b');
  doldur(['temp-PDEfe-Setup.exe', '0-temp-PDEfe-Setup.exe', 'PDEfe-Setup.exe', 'update-info.json']);
  const k = kurulum({ ayar: { [AYAR_SON_DENETIM]: T0, bekleyenGuncelleme: '0.9.1' }, yardimci });
  const silinen = await k.g.temizlik;   // silinen dosyaların adları
  kontrol('bekleyen sürüm kurulmamış: yalnızca yarım indirmenin geçici dosyaları silinir', JSON.stringify(silinen.sort()) === JSON.stringify(['0-temp-PDEfe-Setup.exe', 'temp-PDEfe-Setup.exe'])
    && JSON.stringify(fs.readdirSync(bekleyenKlasor).sort()) === JSON.stringify(['PDEfe-Setup.exe', 'update-info.json']), JSON.stringify(silinen));
  const k2 = kurulum({ surum: '0.9.1', ayar: { [AYAR_SON_DENETIM]: T0, bekleyenGuncelleme: '0.9.1' }, yardimci });
  await k2.g.temizlik;
  kontrol('bekleyen sürüm kurulmuş: bekleyen klasörü boşalır, önbellek kökü (installer.exe, current.blockmap) kalır',
    fs.readdirSync(bekleyenKlasor).length === 0 && fs.existsSync(path.join(kok, 'installer.exe')) && fs.existsSync(path.join(kok, 'current.blockmap')), fs.readdirSync(bekleyenKlasor).join(','));
  doldur(['temp-PDEfe-Setup.exe']);
  const k3 = kurulum({ ilkOrnek: false, yardimci });
  kontrol('ikinci örnek temizlemez', (await k3.g.temizlik).length === 0 && fs.existsSync(path.join(bekleyenKlasor, 'temp-PDEfe-Setup.exe')));
  const bos = await onbellekTemizle({}, { kuruldu: true });
  kontrol('önbellek yardımcısı yoksa (sahte, macOS) bir şey yapılmaz', bos.silinen.length === 0 && bos.kalan.length === 0);
  fs.rmSync(path.join(kok, 'yok'), { recursive: true, force: true });
  kontrol('bekleyen klasörü yoksa hata vermez', (await onbellekTemizle({ getOrCreateDownloadHelper: async () => ({ cacheDirForPendingUpdate: path.join(kok, 'yok') }) })).silinen.length === 0);
  // Güncellemeden sonraki ilk açılışta kurucu bir an daha çalışıyor: dosyası kilitli → yeniden denenir, sonra silinir
  fs.rmSync(path.join(bekleyenKlasor, 'temp-PDEfe-Setup.exe'), { force: true });   // ikinci örnek denemesinden kaldı
  doldur(['PDEfe-Setup.exe', 'update-info.json']);
  const asilFs = await import('node:fs/promises');
  let kilitli = 2;
  const kilitFs = { readdir: asilFs.readdir, rm: async (y, o) => { if (path.basename(y) === 'PDEfe-Setup.exe' && kilitli-- > 0) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); return asilFs.rm(y, o); } };
  const kilit = await onbellekTemizle({ getOrCreateDownloadHelper: async () => yardimci }, { kuruldu: true, fsp: kilitFs });
  kontrol('kilitli dosya: öteki dosyalar silinir, kilitli olan "kalan"da', JSON.stringify(kilit) === JSON.stringify({ silinen: ['update-info.json'], kalan: ['PDEfe-Setup.exe'] }), JSON.stringify(kilit));
  // guncellemeKur: kurulmuş sürümün ilk açılışında kurucu iki deneme boyunca kilitli → üçüncüde silinir, bekleyen klasörü boşalır
  kilitli = 2;
  const k5 = kurulum({ surum: '0.9.1', ayar: { [AYAR_SON_DENETIM]: T0, bekleyenGuncelleme: '0.9.1' }, yardimci, temizlikYeniden: [20, 40, 80], temizlikFs: kilitFs });
  const silinen5 = await k5.g.temizlik;
  kontrol('kurucu kilitliyken açılış: yeniden denemeyle bekleyen klasörü boşalır', fs.readdirSync(bekleyenKlasor).length === 0 && silinen5.includes('PDEfe-Setup.exe') && kilitli < 0, JSON.stringify(silinen5) + ' kilitli=' + kilitli);
  // Hep kilitli: deneme sayısı kadar denenir, sonra bırakılır (açılış sürer, hata yok)
  doldur(['PDEfe-Setup.exe']);
  kilitli = 99;
  const k5b = kurulum({ surum: '0.9.1', ayar: { [AYAR_SON_DENETIM]: T0, bekleyenGuncelleme: '0.9.1' }, yardimci, temizlikYeniden: [10, 10], temizlikFs: kilitFs });
  await k5b.g.temizlik;
  kontrol('hep kilitli: üç geçişten sonra bırakılır, dosya kalır', kilitli === 96 && fs.existsSync(path.join(bekleyenKlasor, 'PDEfe-Setup.exe')), 'kilitli=' + kilitli);
  fs.rmSync(path.join(bekleyenKlasor, 'PDEfe-Setup.exe'), { force: true });
  // Yeniden deneme beklerken indirme başladıysa dokunulmaz (yarım dosyası yeni indirmenin dosyası olabilir)
  doldur(['temp-PDEfe-Setup.exe']);
  let tempKilit = 1, tempSilme = 0;
  const tempFs = { readdir: asilFs.readdir, rm: async (y, o) => { if (y.endsWith('temp-PDEfe-Setup.exe')) { tempSilme++; if (tempKilit-- > 0) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); } return asilFs.rm(y, o); } };
  const k6 = kurulum({ ayar: { [AYAR_SON_DENETIM]: T0 }, yardimci, temizlikYeniden: [150, 150], temizlikFs: tempFs });
  k6.au.s.indirmeMs = 500;
  await k6.cagir('guncelleme:denetle');
  const ind6 = k6.cagir('guncelleme:indir');
  await k6.g.temizlik;
  kontrol('indirme sürerken yeniden deneme yapılmaz (yeni indirmenin dosyasına dokunulmaz)', tempSilme === 1 && fs.existsSync(path.join(bekleyenKlasor, 'temp-PDEfe-Setup.exe')), 'silme denemesi=' + tempSilme);
  await ind6;
  fs.rmSync(path.join(bekleyenKlasor, 'temp-PDEfe-Setup.exe'), { force: true });
  // İndirme, açılıştaki temizliği bekler (geçici dosyası silinmesin)
  doldur(['temp-PDEfe-Setup.exe']);
  let sira = [];
  const yavasYardimci = { get cacheDirForPendingUpdate() { return bekleyenKlasor; } };
  const k4 = kurulum({ ayar: { [AYAR_SON_DENETIM]: T0 }, yardimci: yavasYardimci });
  k4.g.temizlik.then(() => sira.push('temizlik'));
  const asil = k4.au.downloadUpdate;
  k4.au.downloadUpdate = (...a) => { sira.push('indirme'); return asil(...a); };
  await k4.cagir('guncelleme:denetle');
  await k4.cagir('guncelleme:indir');
  kontrol('indirme açılış temizliğinden sonra başlar', JSON.stringify(sira) === JSON.stringify(['temizlik', 'indirme']), JSON.stringify(sira));
  kontrol('acilisDenetimi kurulmuş sürümü bildirir', acilisDenetimi({ ayarAl: () => '0.9.1', ayarKoy: () => {}, surum: '0.9.1', simdi: T0 }).kuruldu === true
    && acilisDenetimi({ ayarAl: (x) => (x === 'bekleyenGuncelleme' ? '0.9.2' : T0), ayarKoy: () => {}, surum: '0.9.1', simdi: T0 }).kuruldu === false);
  fs.rmSync(kok, { recursive: true, force: true });
}

console.log(hata ? `${hata} denetim başarısız.` : 'Bütün denetimler geçti.');
process.exit(hata ? 1 : 0);
