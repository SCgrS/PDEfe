// Ana süreç güncelleme mantığının (src/main/guncelleme.js) birim denemesi: sahte electron-updater, sahte ayar deposu, sahte saat, Electron'suz.
// Kullanım (depo kökünden): node test/guncelleme-e2e/birim.mjs      çıkış kodu: hata varsa 1
// Kapsam: haftalık denetim (ilk açılış, 7 gün, saat geri alınması), başarısız otomatik denetimin süreyi başlatmaması, elle denetimin süreyi
// başlatması, açık kalan uygulamada saatlik bakış, bekleyen (indirilip kurulmamış) sürümün sonraki açılışta bir kez denetlenmesi, elle
// denetimin indirme/hazır aşamasını bildirmesi, Türkçe hata metinleri, tek quitAndInstall.
import { EventEmitter } from 'node:events';
import { guncellemeKur, acilisDenetimi, sirasiGeldiMi, hataMetni, AYAR_SON_DENETIM, DENETIM_ARALIGI_MS } from '../../src/main/guncelleme.js';

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
function kurulum({ surum = '0.9.0', ayar = {}, ilkOrnek = true, simdi = T0, bakisAraligiMs = 1e9, kurulumBeklemeMs = 30000 } = {}) {
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
  const sayac = { kapatmayaHazirla: 0, kapatmaIptal: 0 };
  const saat = { simdi };
  const g = guncellemeKur({
    app, ipcMain: { handle: (k, f) => ipc.set(k, f) }, autoUpdater: au, etkin: true, ilkOrnek, acilisGecikmesiMs: 20, bakisAraligiMs, kurulumBeklemeMs,
    saat: () => saat.simdi,
    pencereyeGonder: (k, v) => giden.push([k, v]), ayarAl: (k) => depo.get(k), ayarKoy: (k, v) => depo.set(k, v),
    kapatmayaHazirla: () => sayac.kapatmayaHazirla++, kapatmaIptal: () => sayac.kapatmaIptal++,
  });
  return { g, au, depo, giden, sayac, saat, cagir: (k, ...a) => ipc.get(k)({}, ...a), ayar: () => Object.fromEntries(depo) };
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

console.log(hata ? `${hata} denetim başarısız.` : 'Bütün denetimler geçti.');
process.exit(hata ? 1 : 0);
