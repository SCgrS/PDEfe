// Geliştirme/test kancaları. main.js'te ayarlar.js'ten ÖNCE içe aktarılır: electron-store veri klasörünü kurulurken okur.
//   PDEFE_VERI_KLASORU  userData (ayarlar, tek örnek kilidi, önbellekler) bu klasöre alınır; kurulu PDEfe ile test
//                       örnekleri birbirinin ayarını ve kilidini paylaşmaz, aynı anda birden çok test örneği çalışabilir. 0.2.9: Masaüstü,
//                       Belgeler ve İndirilenler de bu klasörün test-klasorleri\ alt klasörlerine (araçlar gerçek Masaüstü'ne yazamaz).
//   PDEFE_TEST_KONUM    "x,y": pencere bu konumda açılır (ör. "-3000,0" ekran dışı). Windows pencere örtülme hesabı
//                       kapatılır; ekran dışındaki pencere çizmeye ve CDP ekran görüntüsü vermeye devam eder.
//   PDEFE_TEST_BOYUT    "genişlik,yükseklik": pencere boyutu (kayıtlı boyut yerine).
//   PDEFE_TEST_GIZLI_MASAUSTU  "1": örnek görünmeyen ayrı bir masaüstünde (test/baslat_gizli.ps1); test:odakla pencereyi etkinleştirir
//                       (menü kısayolları yalnızca etkin pencerede çalışır; kişinin ekranındaki odak etkilenmez).
//   PDEFE_TEST_GUNCELLEME  "x.y.z": güncelleme akışı sahte güncelleyiciyle denenir (sunucuda x.y.z var sayılır; bkz. sahteGuncelleyiciKur).
//   PDEFE_TEST_GUNCELLEME_HATA  sahte güncelleyicinin başlangıç senaryosu: denetim | indirme | kurulum (açılıştaki otomatik denetimi
//                       denemek için; sonradan test:guncellemeSenaryosu ile değiştirilir).
//   PDEFE_TEST_YAZICILAR  yazdırma penceresinin yazıcıları sahte (0.2.6; main/yazdir.js): "1" yerleşik liste (çift taraflı basan varsayılan
//                       "Lazer Yazıcı", dosyaya yazan, çevrim dışı), ya da JSON dizi [{ ad, varsayilan, ciftTarafli, cevrimDisi, dosyayaYazar }].
//   PDEFE_TEST_GERCEK_YAZDIR  "1": test örneğinde de gerçekten yazdırılır (0.2.6, test/yazdir_gercek.mjs). Yalnızca görünmeyen masaüstündeki
//                       örnekte (PDEFE_TEST_GIZLI_MASAUSTU=1): "Çıktıyı Farklı Kaydet" kutusu orada açılır, kişinin ekranına çıkmaz.
// Paketli uygulamada hiçbiri okunmaz.
import { app, BrowserWindow, Menu, nativeTheme } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

export const TEST = !app.isPackaged ? {
  veri: process.env.PDEFE_VERI_KLASORU || '',
  konum: (process.env.PDEFE_TEST_KONUM || '').split(',').map(Number).filter(Number.isFinite),
  boyut: (process.env.PDEFE_TEST_BOYUT || '').split(',').map(Number).filter((n) => n > 0),
  guncelleme: process.env.PDEFE_TEST_GUNCELLEME || '',
  guncellemeHata: process.env.PDEFE_TEST_GUNCELLEME_HATA || '',
  yazicilar: process.env.PDEFE_TEST_YAZICILAR || '',
  gercekYazdir: process.env.PDEFE_TEST_GERCEK_YAZDIR === '1' && process.env.PDEFE_TEST_GIZLI_MASAUSTU === '1',
} : { veri: '', konum: [], boyut: [], guncelleme: '', guncellemeHata: '', yazicilar: '', gercekYazdir: false };

/** "1.2.3" karşılaştırması (yalnızca sayısal parçalar): a > b → 1, eşit → 0, küçük → -1. */
function surumKarsilastir(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0), pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const f = (pa[i] || 0) - (pb[i] || 0); if (f) return f > 0 ? 1 : -1; }
  return 0;
}

/**
 * Geliştirme örneğinde güncelleme şeridini ve otomatik denetimi denemek için electron-updater yerine geçen sahte güncelleyici
 * (PDEFE_TEST_GUNCELLEME verilmişse; paketli uygulamada ve değişken yokken null). Ağa çıkmaz, hiçbir şey kurmaz, uygulamayı kapatmaz.
 * Senaryo 'test:guncellemeSenaryosu' ile değiştirilir: { surum, hata: null|'denetim'|'indirme'|'kurulum'|'donma', hataMesaji?, sureMs }
 * (hataMesaji: electron-updater'ın vereceği ileti; verilmezse ağ ya da spawn hatası; donma (0.2.5): indirme %30'da veri gelmeden durur,
 * ana sürecin bekçisi g.indirmeBeklemeMs sonra jetonla keser).
 * 'test:guncellemeKaydi' → { denetimler, indirmeler, iptaller, kurulumlar: [{ isSilent, isForceRunAfter }] }.
 */
export function sahteGuncelleyiciKur(ipcMain) {
  if (!TEST.guncelleme) return null;
  const senaryo = { surum: TEST.guncelleme, hata: TEST.guncellemeHata || null, hataMesaji: '', sureMs: 1500 };
  const kayit = { denetimler: 0, indirmeler: 0, iptaller: 0, kurulumlar: [] };
  let indirilen = null;
  const g = new EventEmitter();
  // electron-updater'ın CancellationToken'ının kullanılan kısmı (guncelleme.js yalnızca oluşturup cancel() çağırır)
  g.IptalJetonu = class { constructor() { this.cancelled = false; } cancel() { this.cancelled = true; } };
  g.indirmeBeklemeMs = 3000;
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
  g.downloadUpdate = async (jeton) => {
    kayit.indirmeler++;
    if (indirilen === senaryo.surum) { g.emit('update-downloaded', bilgi()); return []; }
    const toplam = 80 * 1024 * 1024, adim = 10;
    for (let i = 1; i <= adim; i++) {
      await new Promise((c) => setTimeout(c, senaryo.sureMs / adim));
      if (senaryo.hata === 'indirme' && i === 4) throw hataVer(senaryo.hataMesaji || 'net::ERR_CONNECTION_RESET');
      if (senaryo.hata === 'donma' && i === 4) {   // veri gelmiyor: jeton kesene dek bekler (electron-updater gibi CancellationError)
        while (!jeton?.cancelled) await new Promise((c) => setTimeout(c, 100));
        kayit.iptaller++;
        throw Object.assign(new Error('cancelled'), { name: 'CancellationError' });
      }
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
  // Komut satırından gelen dosya (0.2.7): ikinci örneğin ('second-instance': Gezgin'de çift tıklama, "Birlikte aç") ve macOS'un 'open-file'
  // olayının ana süreç yolu, ikinci bir Electron başlatmadan. olay: 'second-instance' (argv, cwd) | 'open-file' (yol)
  ipcMain.handle('test:uygulamaOlayi', (_e, olay, ...args) => {
    if (olay === 'second-instance') app.emit('second-instance', {}, ['pdefe', ...(Array.isArray(args[0]) ? args[0] : [])], args[1] || process.cwd());
    else if (olay === 'open-file') app.emit('open-file', { preventDefault() {} }, String(args[0] || ''));
    else return false;
    return true;
  });
  // Tuş olayını tarayıcı sürecinin girdi yolundan gönderir (webContents.sendInputEvent): sayfa işlemediği tuş menü hızlandırıcısına
  // da ulaşır (CDP tuş olayı ulaşmaz). olaylar: [{ type: 'keyDown'|'char'|'keyUp', keyCode, modifiers }]; aralarında 30 ms
  ipcMain.handle('test:tusGonder', async (e, olaylar) => {
    for (const o of olaylar || []) { e.sender.sendInputEvent(o); await new Promise((c) => setTimeout(c, 30)); }
    return true;
  });
  // Menü hızlandırıcıları yalnızca etkin pencerede çalışır. Pencereyi etkinleştirmek yalnızca görünmeyen masaüstündeki örnekte
  // (test/baslat_gizli.ps1) yapılır: orada etkin pencere olmak kişinin ekranındaki odağı etkilemez.
  ipcMain.handle('test:odakla', (e) => {
    const pencere = BrowserWindow.fromWebContents(e.sender);
    if (process.env.PDEFE_TEST_GIZLI_MASAUSTU !== '1' || !pencere) return { odak: pencere?.isFocused() ?? false, gizliMasaustu: false };
    pencere.focus(); e.sender.focus();
    return { odak: pencere.isFocused(), gizliMasaustu: true };
  });
  // İşletim sisteminin teması (0.2.10, test/tema_acilis.mjs): "Sistemi izle" ayarı Windows / macOS koyu ya da açıkken nasıl açılır ve sistem
  // teması değişince ne olur, bilgisayarın ayarına dokunmadan. kaynak: 'dark' | 'light' | 'system' (nativeTheme.themeSource; yalnızca bu test
  // örneğinde, 'updated' olayı anaSurec.js'teki gibi pencerelere 'tema:sistem' gönderir). Döner: shouldUseDarkColors
  ipcMain.handle('test:sistemTemasi', (_e, kaynak) => {
    if (['dark', 'light', 'system'].includes(kaynak)) nativeTheme.themeSource = kaynak;
    return nativeTheme.shouldUseDarkColors;
  });
  // Uygulama menüsünün etiketleri (alt menüler iç içe): ayara bağlı öğeler (Dosya › Son açılanlar) sınanır
  const menuYapisi = (m) => (m ? m.items.map((o) => (o.submenu ? { etiket: o.label, alt: menuYapisi(o.submenu) } : o.label)) : null);
  ipcMain.handle('test:menu', () => menuYapisi(Menu.getApplicationMenu()));
  // Pencerenin menü çubuğu (0.1.24): görünür mü, gizliyken Alt'la geçici gösterilir mi; içerik alanının yüksekliği
  ipcMain.handle('test:menuCubugu', (e) => {
    const p = BrowserWindow.fromWebContents(e.sender);
    return p ? { gorunur: p.isMenuBarVisible(), otoGizle: p.isMenuBarAutoHide(), icerikYuksekligi: p.getContentBounds().height, disYukseklik: p.getBounds().height } : null;
  });
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
  // 0.2.9 denetimi: test örneğinde Masaüstü, Belgeler ve İndirilenler de veri klasörünün altında (test-klasorleri\). Çıktı klasörü ayarı boşken
  // araçlar Masaüstü'ne yazar (ortak.js varsayilanCiktiKlasoru, uygulama:klasorler): bir betik ayarı boşaltıp sonraki betik araç penceresini
  // "Kaydet"le kapatınca çıktı kullanıcının gerçek Masaüstü'ne düşebiliyordu (0.2.8 sınamasında bir test dosyası düştü)
  for (const [ad, klasor] of [['desktop', 'Masaustu'], ['documents', 'Belgeler'], ['downloads', 'Indirilenler']]) {
    const yol = path.join(TEST.veri, 'test-klasorleri', klasor);
    fs.mkdirSync(yol, { recursive: true });
    app.setPath(ad, yol);
  }
}
if (TEST.konum.length === 2) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
