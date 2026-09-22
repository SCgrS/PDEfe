// Ana süreç güncelleme mantığının (src/main/guncelleme.js) birim denemesi: sahte electron-updater, sahte ayar deposu, Electron'suz.
// Kullanım (depo kökünden): node test/guncelleme-e2e/birim.mjs      çıkış kodu: hata varsa 1
// Kapsam: açılış sayacı (1, 11, 21, …), başarısız otomatik denetimin sırayı tüketmemesi, bekleyen (indirilip kurulmamış) sürümün
// sonraki açılışta bir kez denetlenmesi, elle denetimin indirme/hazır aşamasını bildirmesi, Türkçe hata metinleri, tek quitAndInstall.
import { EventEmitter } from 'node:events';
import { guncellemeKur, acilisiSay, hataMetni } from '../../src/main/guncelleme.js';

const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
let hata = 0;
function kontrol(ad, kosul, ek = '') {
  if (!kosul) hata++;
  console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ek ? ' | ' + ek : ''}`);
}

// ---- açılış sayacı (yalnızca acilisiSay)
function dizi({ adet, surum = () => '1.0.0', basarili = () => true, depo = new Map() }) {
  const denetlenen = [];
  for (let i = 1; i <= adet; i++) {
    const a = acilisiSay({ ayarAl: (k) => depo.get(k), ayarKoy: (k, v) => depo.set(k, v), surum: surum(i) });
    if (a.denetlenecek && basarili(i)) { a.denetimYapildi(); denetlenen.push(i); }
  }
  return denetlenen.join(',');
}
kontrol('sayaç: 1, 11, 21, 31', dizi({ adet: 35 }) === '1,11,21,31', dizi({ adet: 35 }));
kontrol('ilk açılış denetlemeden kapandı: 2, 12, 22', dizi({ adet: 25, basarili: (i) => i !== 1 }) === '2,12,22');
kontrol('11. ve 12. açılışta ağ yok: 13, 23', dizi({ adet: 25, basarili: (i) => i !== 11 && i !== 12 }) === '1,13,23');
kontrol('güncellemeden sonraki ilk açılış (15): 1, 11, 15, 25', dizi({ adet: 25, surum: (i) => (i < 15 ? '1.0.0' : '1.0.1') }) === '1,11,15,25');

// ---- guncellemeKur
function kurulum({ surum = '0.9.0', ayar = {}, ilkOrnek = true } = {}) {
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
  const g = guncellemeKur({
    app, ipcMain: { handle: (k, f) => ipc.set(k, f) }, autoUpdater: au, etkin: true, ilkOrnek, acilisGecikmesiMs: 20,
    pencereyeGonder: (k, v) => giden.push([k, v]), ayarAl: (k) => depo.get(k), ayarKoy: (k, v) => depo.set(k, v),
    kapatmayaHazirla: () => sayac.kapatmayaHazirla++, kapatmaIptal: () => sayac.kapatmaIptal++,
  });
  return { g, au, depo, giden, sayac, cagir: (k, ...a) => ipc.get(k)({}, ...a) };
}
/** Otomatik denetim zamanlayıcısını çalıştırır ve denetimin bitmesini bekler. */
async function otomatik(k) { k.g.pencereGosterildi(); await bekle(120); }
const ayar = (k) => JSON.stringify({ acilisSayaci: k.depo.get('acilisSayaci'), sonDenetimAcilisi: k.depo.get('sonDenetimAcilisi'), bekleyen: k.depo.get('bekleyenGuncelleme') });

// Bulgu 1: başarısız otomatik denetim sırayı tüketmez
{
  const once = { acilisSayaci: 10, sonDenetimAcilisi: 1, sonDenetimSurumu: '0.9.0' };   // bu açılış 11.
  const k = kurulum({ ayar: once });
  k.au.s.denetimHatasi = () => new Error('net::ERR_INTERNET_DISCONNECTED');
  await otomatik(k);
  kontrol('11. açılış: ağ yok, denetim denendi', k.au.kayit.denetim === 1);
  kontrol('ağ hatasında şerit olayı yok', !k.giden.some(([x]) => x === 'guncelleme:hata' || x === 'guncelleme:var'));
  kontrol('ağ hatası sırayı tüketmedi (sonDenetimAcilisi 1)', k.depo.get('sonDenetimAcilisi') === 1, ayar(k));
  const k2 = kurulum({ ayar: Object.fromEntries(k.depo) });   // 12. açılış
  await otomatik(k2);
  kontrol('12. açılış yeniden denetler ve işaretler', k2.au.kayit.denetim === 1 && k2.depo.get('sonDenetimAcilisi') === 12, ayar(k2));
  kontrol('12. açılışta şerit olayı (guncelleme:var)', k2.giden.some(([x]) => x === 'guncelleme:var'));
  const k3 = kurulum({ ayar: Object.fromEntries(k2.depo) });   // 13. açılış
  await otomatik(k3);
  kontrol('13. açılış denetlemez', k3.au.kayit.denetim === 0, ayar(k3));
  // sunucu 404 (yayımlanmış sürüm yok) da hatadır: sıra kalır
  const k4 = kurulum({ ayar: once });
  k4.au.s.denetimHatasi = () => Object.assign(new Error('Cannot find channel "latest.yml" update info: HttpError: 404'), { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' });
  await otomatik(k4);
  kontrol('sunucu 404: sıra kalır', k4.depo.get('sonDenetimAcilisi') === 1);
  // güncel: işaretlenir
  const k5 = kurulum({ ayar: once }); k5.au.s.sunucuda = '0.9.0';
  await otomatik(k5);
  kontrol('güncel sonucu (yok) işaretlenir', k5.depo.get('sonDenetimAcilisi') === 11);
  // otoGuncelle kapalı: denetim yok, sıra kalır
  const k6 = kurulum({ ayar: { ...once, otoGuncelle: false } });
  await otomatik(k6);
  kontrol('otoGuncelle kapalı: denetim yok', k6.au.kayit.denetim === 0 && k6.depo.get('sonDenetimAcilisi') === 1);
  // ikinci örnek sayılmaz
  const k7 = kurulum({ ayar: once, ilkOrnek: false });
  kontrol('ikinci örnek sayacı artırmaz', k7.depo.get('acilisSayaci') === 10);
}

// Bulgu 5: indirilip kurulmamış sürüm sonraki açılışta bir kez denetlenir
{
  const k = kurulum({ ayar: { acilisSayaci: 12, sonDenetimAcilisi: 11, sonDenetimSurumu: '0.9.0' } });   // 13. açılış: sıra değil
  await otomatik(k);
  kontrol('13. açılış denetlemez', k.au.kayit.denetim === 0);
  await k.cagir('guncelleme:denetle');
  await k.cagir('guncelleme:indir');   // kullanıcı Güncelle'ye bastı, sonra Vazgeç (kur çağrılmadı), PDEfe kapatıldı
  kontrol('indirilince bekleyenGuncelleme yazıldı', k.depo.get('bekleyenGuncelleme') === '0.9.1', ayar(k));
  const k2 = kurulum({ ayar: Object.fromEntries(k.depo) });   // 14. açılış
  await otomatik(k2);
  kontrol('14. açılış bekleyen sürüm için denetler, şerit olayı', k2.au.kayit.denetim === 1 && k2.giden.some(([x]) => x === 'guncelleme:var'), ayar(k2));
  kontrol('hatırlatmadan sonra bekleyen silindi', k2.depo.get('bekleyenGuncelleme') === '', ayar(k2));
  const k3 = kurulum({ ayar: Object.fromEntries(k2.depo) });   // 15. açılış
  await otomatik(k3);
  kontrol('15. açılış denetlemez (tek hatırlatma)', k3.au.kayit.denetim === 0, ayar(k3));
  // bekleyen varken ağ yoksa bekleyen kalır, sonraki açılış yine dener
  const k4 = kurulum({ ayar: { ...Object.fromEntries(k.depo) } });
  k4.au.s.denetimHatasi = () => new Error('getaddrinfo ENOTFOUND github.com');
  await otomatik(k4);
  kontrol('bekleyen + ağ yok: bekleyen kalır', k4.depo.get('bekleyenGuncelleme') === '0.9.1', ayar(k4));
  // bekleyen sürüm kuruldu: bekleyen silinir, güncelleme sonrası ilk açılış olarak denetlenir
  const k5 = kurulum({ surum: '0.9.1', ayar: Object.fromEntries(k.depo) });
  kontrol('bekleyen sürüm kurulunca kayıt silinir', k5.depo.get('bekleyenGuncelleme') === '', ayar(k5));
  // hatırlatma anında bu oturumda yeniden indirildiyse kayıt kalır
  const k6 = kurulum({ ayar: Object.fromEntries(k.depo) });
  k6.g.pencereGosterildi();
  await k6.cagir('guncelleme:denetle'); await k6.cagir('guncelleme:indir');
  await bekle(120);
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
