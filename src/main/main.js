// PDEfe ana süreç: pencere, tek örnek, pdefe:// protokolü, menü, IPC köprüsü.
import { app, BrowserWindow, protocol, net, ipcMain, dialog, Menu, shell, nativeTheme, clipboard, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ayarlar, ayarKoy, ayarAl } from './ayarlar.js';
import { menuKur } from './menu.js';
import { Cekirdek } from './cekirdek.js';
import { panoyaDosyaKopyala } from './pano.js';

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
  const genislik = Math.min(kayitli.genislik || 1280, ekran.width);
  const yukseklik = Math.min(kayitli.yukseklik || 860, ekran.height);

  pencere = new BrowserWindow({
    width: genislik, height: yukseklik,
    x: kayitli.x, y: kayitli.y,
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
    if (kayitli.buyutulmus) pencere.maximize();
    pencere.show();
  });
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

  Menu.setApplicationMenu(menuKur({
    komut: (id, veri) => pencereyeGonder('menu:komut', id, veri),
    sonDosyalar: () => ayarAl('sonDosyalar') || [],
  }));
}

function temaKoyuMu() {
  const tema = ayarAl('tema') || 'sistem';
  if (tema === 'sistem') return nativeTheme.shouldUseDarkColors;
  return tema === 'koyu';
}

nativeTheme.on('updated', () => pencereyeGonder('tema:sistem', nativeTheme.shouldUseDarkColors));

// ---------- IPC ----------
function ipcKur() {
  ipcMain.on('uygulama:hazir', () => {
    rendererHazir = true;
    if (bekleyenDosyalar.length) { pencereyeGonder('dosya:ac', bekleyenDosyalar); bekleyenDosyalar = []; }
  });

  ipcMain.handle('ayar:al', (_e, anahtar) => (anahtar ? ayarAl(anahtar) : ayarlar.store));
  ipcMain.handle('ayar:koy', (_e, anahtar, deger) => { ayarKoy(anahtar, deger); return true; });
  ipcMain.handle('tema:sistemKoyu', () => nativeTheme.shouldUseDarkColors);

  ipcMain.handle('dosya:acDiyalog', async () => {
    const s = await dialog.showOpenDialog(pencere, {
      title: 'PDF aç', filters: [{ name: 'PDF belgeleri', extensions: ['pdf'] }, { name: 'Tüm dosyalar', extensions: ['*'] }],
      properties: ['openFile', 'multiSelections'],
    });
    return s.canceled ? [] : s.filePaths;
  });

  ipcMain.handle('dosya:kaydetDiyalog', async (_e, secenek) => {
    const s = await dialog.showSaveDialog(pencere, {
      title: secenek?.baslik || 'Farklı kaydet',
      defaultPath: secenek?.varsayilan,
      filters: [{ name: 'PDF belgesi', extensions: ['pdf'] }],
    });
    return s.canceled ? null : s.filePath;
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

  ipcMain.handle('mesaj:kutu', async (_e, secenek) => {
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
  ipcMain.handle('pano:metin', (_e, metin) => { clipboard.writeText(metin); return true; });
  ipcMain.handle('pano:oku', () => clipboard.readText());
  ipcMain.handle('pano:dosya', async (_e, yol) => panoyaDosyaKopyala(yol));

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
    Menu.setApplicationMenu(menuKur({ komut: (id, veri) => pencereyeGonder('menu:komut', id, veri), sonDosyalar: () => liste }));
    return true;
  });

  // Çekirdek (PyMuPDF) çağrıları
  ipcMain.handle('cekirdek:cagir', (_e, yontem, params, istekId) =>
    cekirdek.cagir(yontem, params, (ilerleme) => pencereyeGonder('cekirdek:ilerleme', istekId, ilerleme)));
  ipcMain.handle('cekirdek:iptal', (_e, istekId) => cekirdek.iptal(istekId));
}

// ---------- Yaşam döngüsü ----------
app.whenReady().then(() => {
  protokolKur();
  ipcKur();
  bekleyenDosyalar.push(...argvdenPdfler(process.argv, process.cwd()));
  pencereOlustur();
  cekirdek.baslat().catch((e) => console.error('[çekirdek] başlatılamadı:', e));
});

app.on('window-all-closed', () => {
  cekirdek.durdur();
  app.quit();
});
