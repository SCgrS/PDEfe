// PDEfe ana süreç: pencere, tek örnek, pdefe:// protokolü, menü, IPC köprüsü.
import { app, BrowserWindow, protocol, net, ipcMain, dialog, Menu, shell, nativeTheme, clipboard, screen } from 'electron';
import { TEST, testDiyalogKur, sahteGuncelleyiciKur } from './gelistirme.js';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ayarlar, ayarKoy, ayarAl, VARSAYILANLAR } from './ayarlar.js';
import { menuKur } from './menu.js';
import { Cekirdek } from './cekirdek.js';
import { panoyaDosyaKopyala } from './pano.js';
import { yazdirmaKur } from './yazdir.js';
import { guncellemeKur } from './guncelleme.js';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KOK = app.getAppPath();                   // package.json'un bulunduğu kök
const PAKETLI = app.isPackaged;

// ---------- Tek örnek ----------
const kilit = app.requestSingleInstanceLock();
if (!kilit) {
  app.quit();
}

/** @type {BrowserWindow|null} */
let pencere = null;
let rendererHazir = false;
let kapatOnayli = false;
let bekleyenDosyalar = [];
/** @type {ReturnType<typeof guncellemeKur>|null} */
let guncelleme = null;
const cekirdek = new Cekirdek({ kok: KOK, paketli: PAKETLI, kaynaklar: process.resourcesPath });

// ---------- Yardımcılar ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.icc': 'application/octet-stream',
  '.map': 'application/json',
};

function argvdenPdfler(argv, cwd) {
  const sonuc = [];
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('-') || a === '.') continue;
    if (!/\.pdf$/i.test(a)) continue;
    const tam = path.isAbsolute(a) ? a : path.resolve(cwd || process.cwd(), a);
    if (fs.existsSync(tam)) sonuc.push(tam);
  }
  return sonuc;
}

function pencereyeGonder(kanal, ...args) {
  if (pencere && !pencere.isDestroyed()) pencere.webContents.send(kanal, ...args);
}

function dosyalariAc(dosyalar) {
  if (!dosyalar.length) return;
  if (rendererHazir) pencereyeGonder('dosya:ac', dosyalar);
  else bekleyenDosyalar.push(...dosyalar);
}

app.on('second-instance', (_e, argv, cwd) => {
  dosyalariAc(argvdenPdfler(argv, cwd));
  if (pencere) {
    if (pencere.isMinimized()) pencere.restore();
    pencere.focus();
  }
});

// ---------- Protokol ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'pdefe', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function protokolKur() {
  protocol.handle('pdefe', async (istek) => {
    const url = new URL(istek.url);
    if (url.hostname !== 'app') return new Response('Bulunamadı', { status: 404 });
    const goreli = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const tam = path.normalize(path.join(KOK, goreli));
    if (!tam.startsWith(path.normalize(KOK))) return new Response('Yasak', { status: 403 });
    try {
      const yanit = await net.fetch(pathToFileURL(tam).toString());
      const mime = MIME[path.extname(tam).toLowerCase()] || 'application/octet-stream';
      return new Response(yanit.body, { status: yanit.status, headers: { 'content-type': mime, 'cache-control': 'no-cache' } });
    } catch (e) {
      return new Response('Bulunamadı: ' + goreli, { status: 404 });
    }
  });
}

// ---------- Pencere ----------
function pencereOlustur() {
  const koyu = temaKoyuMu();
  const kayitli = ayarAl('pencere') || {};
  const ekran = screen.getPrimaryDisplay().workAreaSize;
  const genislik = TEST.boyut.length === 2 ? TEST.boyut[0] : Math.min(kayitli.genislik || 1280, ekran.width);
  const yukseklik = TEST.boyut.length === 2 ? TEST.boyut[1] : Math.min(kayitli.yukseklik || 860, ekran.height);

  pencere = new BrowserWindow({
    width: genislik, height: yukseklik,
    x: TEST.konum.length === 2 ? TEST.konum[0] : kayitli.x, y: TEST.konum.length === 2 ? TEST.konum[1] : kayitli.y,
    minWidth: 720, minHeight: 480,
    show: false,
    title: 'PDEfe',
    backgroundColor: koyu ? '#1c1c1c' : '#f3f3f3',
    autoHideMenuBar: false,
    icon: path.join(KOK, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  pencere.loadURL('pdefe://app/src/renderer/index.html');
  pencere.once('ready-to-show', () => {
    if (kayitli.buyutulmus && TEST.konum.length !== 2) pencere.maximize();
    if (TEST.konum.length === 2) pencere.showInactive(); else pencere.show();
  });
  // Sırası gelen açılışta (10 açılışta bir) güncelleme denetimi pencere göründükten birkaç saniye sonra yapılır
  pencere.once('show', () => guncelleme?.pencereGosterildi());
  pencere.on('close', (e) => {
    if (!pencere) return;
    if (!kapatOnayli && rendererHazir) {
      e.preventDefault();
      pencereyeGonder('pencere:kapatIstegi');
      return;
    }
    const b = pencere.getNormalBounds();
    ayarKoy('pencere', { x: b.x, y: b.y, genislik: b.width, yukseklik: b.height, buyutulmus: pencere.isMaximized() });
  });
  pencere.on('closed', () => { pencere = null; });
  pencere.on('enter-full-screen', () => pencereyeGonder('pencere:tamEkran', true));
  pencere.on('leave-full-screen', () => pencereyeGonder('pencere:tamEkran', false));

  // Dış bağlantılar tarayıcıda açılsın
  pencere.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  uygulamaMenusuKur();
}

/** Uygulama menüsünü (yeniden) kurar: son dosyalar ve Görünüm menüsündeki düzen işaretleri ayardan okunur. */
function uygulamaMenusuKur() {
  Menu.setApplicationMenu(menuKur({
    komut: (id, veri) => pencereyeGonder('menu:komut', id, veri),
    sonDosyalar: () => ayarAl('sonDosyalar') || [],
    duzen: () => ({ duzen: ayarAl('varsayilanDuzen'), kapakAyri: !!ayarAl('kapakAyri') }),
  }));
}

function temaKoyuMu() {
  const tema = ayarAl('tema') || 'sistem';
  if (tema === 'sistem') return nativeTheme.shouldUseDarkColors;
  return tema === 'koyu';
}

nativeTheme.on('updated', () => pencereyeGonder('tema:sistem', nativeTheme.shouldUseDarkColors));

// ---------- Pano okuma (araçlar) ----------
async function panoOgeleri() { try { return await clipboard.read(); } catch { return []; } }

/** Pano öğesinden verilen MIME türünün Blob'u (yoksa null). */
async function panoTuru(ogeler, tur) {
  for (const o of ogeler) if (o.types.includes(tur)) { try { return await o.getType(tur); } catch { /* sonrakine bak */ } }
  return null;
}

/** Gezgin'den kopyalanan dosyaların yolları (text/uri-list içindeki file:/// URI'leri; Türkçe ve boşluklu yollar dahil). */
async function panoDosyalari(ogeler) {
  const b = await panoTuru(ogeler, 'text/uri-list');
  if (!b) return [];
  const yollar = [];
  for (const satir of (await b.text()).split(/\r?\n/)) {
    const u = satir.trim();
    if (!/^file:/i.test(u)) continue;
    try { yollar.push(fileURLToPath(u)); } catch { /* geçersiz URI */ }
  }
  return yollar;
}

async function panoGorseli(ogeler) {
  const b = await panoTuru(ogeler, 'image/png');
  return b && b.size ? Buffer.from(await b.arrayBuffer()) : null;
}

async function panoMetni(ogeler) { const b = await panoTuru(ogeler, 'text/plain'); return b ? b.text() : ''; }

/** Metin olarak kopyalanmış dosya yolları (Gezgin "Yol olarak kopyala": tırnaklı). Yalnızca var olan dosyalar. */
function metindekiYollar(metin) {
  const satirlar = String(metin || '').split(/\r?\n/).map((s) => s.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
  if (!satirlar.length || satirlar.length > 200) return [];
  const yollar = [];
  for (const s of satirlar) {
    if (s.length > 1024 || !path.win32.isAbsolute(s)) return [];
    try { if (!fs.statSync(s).isFile()) return []; } catch { return []; }
    yollar.push(s);
  }
  return yollar;
}

/** Pano görselini %TEMP%\PDEfe altına "Pano görüntüsü <tarih saat>.png" olarak yazar; bir günden eski pano görüntülerini siler. */
async function panoGorseliniYaz(png) {
  const klasor = path.join(app.getPath('temp'), 'PDEfe');
  await fs.promises.mkdir(klasor, { recursive: true });
  const t = new Date(), p2 = (n) => String(n).padStart(2, '0');
  const govde = `Pano görüntüsü ${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())} ${p2(t.getHours())}.${p2(t.getMinutes())}.${p2(t.getSeconds())}`;
  let yol = path.join(klasor, govde + '.png');
  for (let i = 2; fs.existsSync(yol); i++) yol = path.join(klasor, `${govde} (${i}).png`);
  await fs.promises.writeFile(yol, png, { flag: 'wx' });
  fs.promises.readdir(klasor).then((adlar) => {
    for (const ad of adlar) {
      if (!/^Pano görüntüsü .*\.png$/i.test(ad)) continue;
      const y = path.join(klasor, ad);
      fs.promises.stat(y).then((st) => { if (Date.now() - st.mtimeMs > 24 * 3600 * 1000) fs.promises.unlink(y).catch(() => {}); }).catch(() => {});
    }
  }).catch(() => {});
  return { yol, boyut: png.length };
}

// ---------- IPC ----------
function ipcKur() {
  ipcMain.on('uygulama:hazir', () => {
    rendererHazir = true;
    if (bekleyenDosyalar.length) { pencereyeGonder('dosya:ac', bekleyenDosyalar); bekleyenDosyalar = []; }
  });

  ipcMain.handle('ayar:al', (_e, anahtar) => (anahtar ? ayarAl(anahtar) : ayarlar.store));
  ipcMain.handle('ayar:koy', (_e, anahtar, deger) => { ayarKoy(anahtar, deger); if (anahtar === 'varsayilanDuzen' || anahtar === 'kapakAyri') uygulamaMenusuKur(); return true; });
  ipcMain.handle('tema:sistemKoyu', () => nativeTheme.shouldUseDarkColors);

  // secenek: {baslik, filtreler:[{name, extensions}], coklu, varsayilan}
  const testDiyalog = testDiyalogKur(ipcMain);   // test örneğinde yerel diyaloglar ekrana çıkmaz (gelistirme.js)
  ipcMain.handle('dosya:acDiyalog', async (_e, secenek) => {
    if (testDiyalog) return testDiyalog('dosya:acDiyalog', secenek, []);
    const s = await dialog.showOpenDialog(pencere, {
      title: secenek?.baslik || 'PDF aç',
      defaultPath: secenek?.varsayilan,
      filters: secenek?.filtreler || [{ name: 'PDF belgeleri', extensions: ['pdf'] }, { name: 'Tüm dosyalar', extensions: ['*'] }],
      properties: ['openFile', ...(secenek?.coklu === false ? [] : ['multiSelections'])],
    });
    return s.canceled ? [] : s.filePaths;
  });

  ipcMain.handle('dosya:klasorSec', async (_e, secenek) => {
    if (testDiyalog) return testDiyalog('dosya:klasorSec', secenek, null);
    const s = await dialog.showOpenDialog(pencere, { title: secenek?.baslik || 'Klasör seç', defaultPath: secenek?.varsayilan, properties: ['openDirectory', 'createDirectory'] });
    return s.canceled ? null : s.filePaths[0];
  });

  ipcMain.handle('dosya:kaydetDiyalog', async (_e, secenek) => {
    if (testDiyalog) return testDiyalog('dosya:kaydetDiyalog', secenek, null);
    const s = await dialog.showSaveDialog(pencere, {
      title: secenek?.baslik || 'Farklı kaydet',
      defaultPath: secenek?.varsayilan,
      filters: secenek?.filtreler || [{ name: 'PDF belgesi', extensions: ['pdf'] }],
    });
    return s.canceled ? null : s.filePath;
  });

  ipcMain.handle('dosya:sil', async (_e, yol) => { try { await shell.trashItem(yol); return true; } catch { try { await fs.promises.unlink(yol); return true; } catch { return false; } } });
  ipcMain.handle('dosya:kopyala', async (_e, kaynak, hedef) => { await fs.promises.mkdir(path.dirname(hedef), { recursive: true }); await fs.promises.copyFile(kaynak, hedef); return true; });
  ipcMain.handle('uygulama:veriKlasoru', () => app.getPath('userData'));
  ipcMain.handle('uygulama:geciciKlasor', () => { const k = path.join(app.getPath('temp'), 'PDEfe'); fs.mkdirSync(k, { recursive: true }); return k; });
  ipcMain.handle('kabuk:varsayilanUygulamalar', () => shell.openExternal('ms-settings:defaultapps?registeredAppUser=PDEfe'));
  // Panodaki dosyalar (Gezgin'den kopyalanan) ve görsel. Electron'un pano API'siyle ana süreçte okunur: önceki PowerShell
  // yolu (pano:dosyalar / pano:gorsel, kaldırıldı) her çağrıda süreç başlattığı için saniyeler sürüyor, Türkçe karakterli yolları da bozuyordu.
  // Electron 44'te clipboard yalnızca has/read/readText/write/writeText/clear sunar (readImage/readBuffer yok):
  // Gezgin'in CF_HDROP listesi 'text/uri-list' (file:/// URI'leri), bit eşlem (ekran görüntüsü, tarayıcıdan kopyalanan görsel) 'image/png' gelir.
  // Görüntü / PDF birleştir'in Ctrl+V / Yapıştır'ı: tek çağrıda dosyalar, yoksa görsel (geçici PNG'ye yazılır), yoksa metindeki dosya yolları
  ipcMain.handle('pano:icerik', async () => {
    const ogeler = await panoOgeleri();
    const dosyalar = await panoDosyalari(ogeler);
    if (dosyalar.length) return { tur: 'dosyalar', dosyalar };
    const png = await panoGorseli(ogeler);
    if (png) return { tur: 'gorsel', ...(await panoGorseliniYaz(png)) };
    const metin = await panoMetni(ogeler);
    const yollar = metindekiYollar(metin);
    if (yollar.length) return { tur: 'dosyalar', dosyalar: yollar, metinden: true };
    return { tur: metin.trim() ? 'metin' : 'bos' };
  });
  ipcMain.handle('uygulama:klasorler', () => {
    const al = (ad) => { try { return app.getPath(ad); } catch { return ''; } };
    return { masaustu: al('desktop'), belgeler: al('documents'), indirilenler: al('downloads'), ev: al('home') };
  });

  ipcMain.handle('dosya:oku', async (_e, yol) => {
    const veri = await fs.promises.readFile(yol);
    const st = await fs.promises.stat(yol);
    return { veri, boyut: st.size, degisim: st.mtimeMs };
  });

  ipcMain.handle('dosya:bilgi', async (_e, yol) => {
    try { const st = await fs.promises.stat(yol); return { var: true, boyut: st.size, degisim: st.mtimeMs }; }
    catch { return { var: false }; }
  });

  ipcMain.handle('dosya:varMi', (_e, yol) => fs.existsSync(yol));

  // Yerel mesaj kutusu. Arayüz artık kendi mesaj kutusunu kullanır (renderer/mesajKutusu.js: aynı seçenekler, dışına tıklayınca kapanır);
  // bu kanal geri uyum için duruyor, arayüzden çağrılmıyor.
  ipcMain.handle('mesaj:kutu', async (_e, secenek) => {
    if (testDiyalog) return testDiyalog('mesaj:kutu', secenek, { secim: secenek.varsayilan ?? 0, onay: false });
    const s = await dialog.showMessageBox(pencere, {
      type: secenek.tur || 'question',
      title: secenek.baslik || 'PDEfe',
      message: secenek.mesaj,
      detail: secenek.ayrinti,
      buttons: secenek.dugmeler || ['Tamam'],
      defaultId: secenek.varsayilan ?? 0,
      cancelId: secenek.iptal ?? (secenek.dugmeler ? secenek.dugmeler.length - 1 : 0),
      checkboxLabel: secenek.onayKutusu,
      checkboxChecked: false,
      noLink: true,
    });
    return { secim: s.response, onay: s.checkboxChecked };
  });

  // Genel açılır menü: [{id, etiket, devre, ayirici, isaretli}] → tıklanan id
  ipcMain.handle('menu:popup', (_e, ogeler) => new Promise((coz) => {
    if (testDiyalog) { coz(testDiyalog('menu:popup', ogeler, null)); return; }
    let secilen = null;
    const sablon = ogeler.map((o) => (o.ayirici ? { type: 'separator' } : {
      label: o.etiket, enabled: o.devre !== true, type: o.isaretli != null ? 'checkbox' : 'normal',
      checked: !!o.isaretli, click: () => { secilen = o.id; },
    }));
    const m = Menu.buildFromTemplate(sablon);
    m.popup({ window: pencere, callback: () => coz(secilen) });
  }));

  ipcMain.handle('kabuk:klasordeGoster', (_e, yol) => { shell.showItemInFolder(yol); return true; });
  ipcMain.handle('kabuk:disAc', (_e, url) => shell.openExternal(url));
  // Test örneğinde sistem panosuna yazılmaz (bilgisayarı kullanan kişinin panosu bozulmasın): yazılan test:diyalogKaydi'na düşer
  ipcMain.handle('pano:metin', (_e, metin) => { if (testDiyalog) return testDiyalog('pano:metin', { uzunluk: metin?.length, bas: String(metin ?? '').slice(0, 200) }, true); clipboard.writeText(metin); return true; });
  ipcMain.handle('pano:oku', () => clipboard.readText());
  ipcMain.handle('pano:dosya', async (_e, yol) => (testDiyalog ? testDiyalog('pano:dosya', { yol }, { tamam: true, hata: '' }) : panoyaDosyaKopyala(yol)));

  ipcMain.handle('pencere:tamEkran', (_e, deger) => {
    const yeni = deger ?? !pencere.isFullScreen();
    pencere.setFullScreen(yeni);
    return yeni;
  });
  ipcMain.handle('pencere:baslik', (_e, baslik) => { pencere.setTitle(baslik ? `${baslik} — PDEfe` : 'PDEfe'); return true; });
  ipcMain.handle('pencere:kapat', () => { pencere?.close(); return true; });
  ipcMain.handle('pencere:kapatOnayla', () => { kapatOnayli = true; pencere?.close(); return true; });
  ipcMain.handle('uygulama:bilgi', () => ({ surum: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, paketli: PAKETLI, kok: KOK }));
  ipcMain.handle('uygulama:sonDosyalar', (_e, liste) => {
    ayarKoy('sonDosyalar', liste);
    uygulamaMenusuKur();
    return true;
  });

  // Çekirdek (PyMuPDF) çağrıları
  ipcMain.handle('cekirdek:cagir', (_e, yontem, params, istekId) =>
    cekirdek.cagir(yontem, params, (ilerleme) => pencereyeGonder('cekirdek:ilerleme', istekId, ilerleme), istekId));
  ipcMain.handle('cekirdek:iptal', (_e, istekId) => cekirdek.iptal(istekId));
  ipcMain.handle('ayar:varsayilanlar', () => VARSAYILANLAR);
  yazdirmaKur({ ipcMain, BrowserWindow, pencereAl: () => pencere });
}

// ---------- Yaşam döngüsü ----------
app.whenReady().then(() => {
  // Önceki oturumlardan kalan anlık kopyalar (yapısal kayıtta özgün dosyanın kopyası; sekme kapanınca silinir, pencere kapatma ya da
  // çökmede kalır). Tek örnek kilidi bizdeyse başka örnek bunları kullanmıyordur: çekirdek başlamadan ve pencere açılmadan sil.
  if (kilit) { try { fs.rmSync(path.join(app.getPath('userData'), 'anlik'), { recursive: true, force: true }); } catch { /* yok say */ } }
  protokolKur();
  ipcKur();
  try {
    const sahte = sahteGuncelleyiciKur(ipcMain);   // yalnızca geliştirme örneğinde, PDEFE_TEST_GUNCELLEME ile
    guncelleme = guncellemeKur({
      app, ipcMain, autoUpdater: sahte || autoUpdater, etkin: PAKETLI || !!sahte, ilkOrnek: kilit, pencereyeGonder, ayarAl, ayarKoy,
      // Kurulum uygulamayı kapatır: renderer kaydedilmemiş değişiklikleri önceden sorduğu için pencere kapatma yeniden sormasın
      kapatmayaHazirla: () => { kapatOnayli = true; },
      kapatmaIptal: () => { kapatOnayli = false; },
    });
  } catch (e) { console.error('[güncelleme] kurulamadı:', e); }
  bekleyenDosyalar.push(...argvdenPdfler(process.argv, process.cwd()));
  pencereOlustur();
  cekirdek.baslat().catch((e) => console.error('[çekirdek] başlatılamadı:', e));
});

app.on('window-all-closed', () => {
  cekirdek.durdur();
  app.quit();
});
