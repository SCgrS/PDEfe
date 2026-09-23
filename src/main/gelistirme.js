// Geliştirme/test kancaları. main.js'te ayarlar.js'ten ÖNCE içe aktarılır: electron-store veri klasörünü kurulurken okur.
//   PDEFE_VERI_KLASORU  userData (ayarlar, tek örnek kilidi, önbellekler) bu klasöre alınır; kurulu PDEfe ile test
//                       örnekleri birbirinin ayarını ve kilidini paylaşmaz, aynı anda birden çok test örneği çalışabilir.
//   PDEFE_TEST_KONUM    "x,y": pencere bu konumda açılır (ör. "-3000,0" ekran dışı). Windows pencere örtülme hesabı
//                       kapatılır; ekran dışındaki pencere çizmeye ve CDP ekran görüntüsü vermeye devam eder.
//   PDEFE_TEST_BOYUT    "genişlik,yükseklik": pencere boyutu (kayıtlı boyut yerine).
//   PDEFE_TEST_GUNCELLEME  "x.y.z": güncelleme akışı sahte güncelleyiciyle denenir (sunucuda x.y.z var sayılır; bkz. sahteGuncelleyiciKur).
//   PDEFE_TEST_GUNCELLEME_HATA  sahte güncelleyicinin başlangıç senaryosu: denetim | indirme | kurulum (açılıştaki otomatik denetimi
//                       denemek için; sonradan test:guncellemeSenaryosu ile değiştirilir).
// Paketli uygulamada hiçbiri okunmaz.
import { app } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';

export const TEST = !app.isPackaged ? {
  veri: process.env.PDEFE_VERI_KLASORU || '',
  konum: (process.env.PDEFE_TEST_KONUM || '').split(',').map(Number).filter(Number.isFinite),
  boyut: (process.env.PDEFE_TEST_BOYUT || '').split(',').map(Number).filter((n) => n > 0),
  guncelleme: process.env.PDEFE_TEST_GUNCELLEME || '',
  guncellemeHata: process.env.PDEFE_TEST_GUNCELLEME_HATA || '',
} : { veri: '', konum: [], boyut: [], guncelleme: '', guncellemeHata: '' };

/** "1.2.3" karşılaştırması (yalnızca sayısal parçalar): a > b → 1, eşit → 0, küçük → -1. */
function surumKarsilastir(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0), pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const f = (pa[i] || 0) - (pb[i] || 0); if (f) return f > 0 ? 1 : -1; }
  return 0;
}

/**
 * Geliştirme örneğinde güncelleme şeridini ve haftalık denetimi denemek için electron-updater yerine geçen sahte güncelleyici
 * (PDEFE_TEST_GUNCELLEME verilmişse; paketli uygulamada ve değişken yokken null). Ağa çıkmaz, hiçbir şey kurmaz, uygulamayı kapatmaz.
 * Senaryo 'test:guncellemeSenaryosu' ile değiştirilir: { surum, hata: null|'denetim'|'indirme'|'kurulum', hataMesaji?, sureMs }
 * (hataMesaji: electron-updater'ın vereceği ileti; verilmezse ağ ya da spawn hatası).
 * 'test:guncellemeKaydi' → { denetimler, indirmeler, kurulumlar: [{ isSilent, isForceRunAfter }] }.
 */
export function sahteGuncelleyiciKur(ipcMain) {
  if (!TEST.guncelleme) return null;
  const senaryo = { surum: TEST.guncelleme, hata: TEST.guncellemeHata || null, hataMesaji: '', sureMs: 1500 };
  const kayit = { denetimler: 0, indirmeler: 0, kurulumlar: [] };
  let indirilen = null;
  const g = new EventEmitter();
  const bilgi = () => ({ version: senaryo.surum, releaseNotes: 'Sahte sürüm notu', releaseDate: new Date().toISOString(), files: [] });
  const hataVer = (mesaj) => { const e = new Error(mesaj); g.emit('error', e); return e; };
  g.checkForUpdates = async () => {
    kayit.denetimler++;
    g.emit('checking-for-update');
    await new Promise((c) => setTimeout(c, 300));
    if (senaryo.hata === 'denetim') throw hataVer(senaryo.hataMesaji || 'net::ERR_CONNECTION_REFUSED');
    const var_ = surumKarsilastir(senaryo.surum, app.getVersion()) > 0;
    g.emit(var_ ? 'update-available' : 'update-not-available', bilgi());
    return { isUpdateAvailable: var_, updateInfo: bilgi(), versionInfo: bilgi() };
  };
  g.downloadUpdate = async () => {
    kayit.indirmeler++;
    if (indirilen === senaryo.surum) { g.emit('update-downloaded', bilgi()); return []; }
    const toplam = 80 * 1024 * 1024, adim = 10;
    for (let i = 1; i <= adim; i++) {
      await new Promise((c) => setTimeout(c, senaryo.sureMs / adim));
      if (senaryo.hata === 'indirme' && i === 4) throw hataVer(senaryo.hataMesaji || 'net::ERR_CONNECTION_RESET');
      g.emit('download-progress', { percent: (i * 100) / adim, transferred: (toplam * i) / adim, total: toplam, bytesPerSecond: toplam / (senaryo.sureMs / 1000) });
    }
    indirilen = senaryo.surum;
    g.emit('update-downloaded', bilgi());
    return ['sahte-kurulum.exe'];
  };
  g.quitAndInstall = (isSilent, isForceRunAfter) => {
    kayit.kurulumlar.push({ isSilent, isForceRunAfter });
    console.log('[test güncelleme] quitAndInstall', isSilent, isForceRunAfter);
    if (senaryo.hata === 'kurulum') setImmediate(() => g.emit('error', new Error(senaryo.hataMesaji || 'spawn EACCES')));
  };
  ipcMain.handle('test:guncellemeSenaryosu', (_e, yeni) => { Object.assign(senaryo, yeni || {}); return { ...senaryo }; });
  ipcMain.handle('test:guncellemeKaydi', () => JSON.parse(JSON.stringify(kayit)));
  return g;
}

/**
 * Test örneğinde (PDEFE_TEST_KONUM verilmiş) yerel diyaloglar (mesaj kutusu, aç/kaydet/klasör, açılır menü) gösterilmez: pencere ekran
 * dışında olsa da Windows bunları görünen ekrana açar ve bilgisayarı kullanan kişiyi rahatsız eder. Yanıt, testin önceden kuyruğa
 * koyduğu değerden (test:diyalogYanitlari) ya da varsayılandan gelir; her diyalog test:diyalogKaydi ile okunur.
 * Döner: test örneği değilse null, yoksa (kanal, secenek, varsayilanYanit) => yanıt.
 */
export function testDiyalogKur(ipcMain) {
  if (TEST.konum.length !== 2) return null;
  const kuyruk = new Map();   // kanal → [yanıt, …]
  let kayit = [];
  ipcMain.handle('test:diyalogYanitlari', (_e, kanal, yanitlar) => { kuyruk.set(kanal, [...(kuyruk.get(kanal) || []), ...yanitlar]); return true; });
  ipcMain.handle('test:diyalogKaydi', () => { const k = kayit; kayit = []; return k; });
  // Ana süreçten gelen olayı taklit eder (fareyle seçilen menü komutu 'menu:komut', pencere kapatma isteği 'pencere:kapatIstegi'):
  // aynı kanaldan renderer'a geri gönderilir. CDP tuş olayı menü hızlandırıcısını tetiklemediğinden bu yolla sınanır.
  ipcMain.handle('test:olayGonder', (e, kanal, ...args) => { e.sender.send(kanal, ...args); return true; });
  return (kanal, secenek, varsayilanYanit) => {
    const bekleyen = kuyruk.get(kanal);
    const yanit = bekleyen?.length ? bekleyen.shift() : varsayilanYanit;
    kayit.push({ kanal, secenek, yanit });
    console.log('[test diyaloğu]', kanal, JSON.stringify(secenek)?.slice(0, 300), '→', JSON.stringify(yanit));
    return yanit;
  };
}

if (TEST.veri) {
  fs.mkdirSync(TEST.veri, { recursive: true });
  app.setPath('userData', TEST.veri);
}
if (TEST.konum.length === 2) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
