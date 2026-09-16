// PDEfe ana süreç: pencere, tek örnek, pdefe:// protokolü, menü, IPC köprüsü.
import { app, BrowserWindow, protocol, net, ipcMain, dialog, Menu, shell, nativeTheme, clipboard, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
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

  // secenek: {baslik, filtreler:[{name, extensions}], coklu, varsayilan}
  ipcMain.handle('dosya:acDiyalog', async (_e, secenek) => {
    const s = await dialog.showOpenDialog(pencere, {
      title: secenek?.baslik || 'PDF aç',
      defaultPath: secenek?.varsayilan,
      filters: secenek?.filtreler || [{ name: 'PDF belgeleri', extensions: ['pdf'] }, { name: 'Tüm dosyalar', extensions: ['*'] }],
      properties: ['openFile', ...(secenek?.coklu === false ? [] : ['multiSelections'])],
    });
    return s.canceled ? [] : s.filePaths;
  });

  ipcMain.handle('dosya:klasorSec', async (_e, secenek) => {
    const s = await dialog.showOpenDialog(pencere, { title: secenek?.baslik || 'Klasör seç', defaultPath: secenek?.varsayilan, properties: ['openDirectory', 'createDirectory'] });
    return s.canceled ? null : s.filePaths[0];
  });

  ipcMain.handle('dosya:kaydetDiyalog', async (_e, secenek) => {
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
  ipcMain.handle('uygulama:ucuncuTaraf', async () => { try { return await fs.promises.readFile(path.join(KOK, 'THIRD_PARTY.md'), 'utf8'); } catch { return ''; } });
  ipcMain.handle('kabuk:varsayilanUygulamalar', () => shell.openExternal('ms-settings:defaultapps?registeredAppUser=PDEfe'));
  // Panodaki dosyalar (Gezgin'den kopyalanan) ve görsel
  ipcMain.handle('pano:dosyalar', () => new Promise((coz) => {
    const { spawn } = require('node:child_process');
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { $_ }'], { windowsHide: true });
    let out = '';
    p.stdout.setEncoding('utf8'); p.stdout.on('data', (d) => { out += d; });
    p.on('exit', () => coz(out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)));
    p.on('error', () => coz([]));
  }));
  ipcMain.handle('pano:gorsel', () => new Promise((coz) => {
    // Electron 44'te clipboard.readImage yok; panodaki görseli .NET ile geçici PNG'ye yazıp base64 döndür
    const { spawn } = require('node:child_process');
    const hedef = path.join(app.getPath('temp'), 'PDEfe', `pano-${Date.now()}.png`);
    fs.mkdirSync(path.dirname(hedef), { recursive: true });
    const betik = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) { exit 3 }
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img -eq $null) { exit 3 }
$img.Save($env:PDEFE_HEDEF, [System.Drawing.Imaging.ImageFormat]::Png)
exit 0`;
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-Command', betik], { windowsHide: true, env: { ...process.env, PDEFE_HEDEF: hedef } });
    p.on('exit', (kod) => {
      if (kod !== 0) { coz(null); return; }
      fs.promises.readFile(hedef).then((b) => { fs.promises.unlink(hedef).catch(() => {}); coz(b.toString('base64')); }).catch(() => coz(null));
    });
    p.on('error', () => coz(null));
  }));

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
    cekirdek.cagir(yontem, params, (ilerleme) => pencereyeGonder('cekirdek:ilerleme', istekId, ilerleme), istekId));
  ipcMain.handle('cekirdek:iptal', (_e, istekId) => cekirdek.iptal(istekId));
  ipcMain.handle('ayar:varsayilanlar', () => VARSAYILANLAR);
  yazdirmaKur({ ipcMain, BrowserWindow, pencereAl: () => pencere });
}

// ---------- Yaşam döngüsü ----------
app.whenReady().then(() => {
  protokolKur();
  ipcKur();
  try {
    guncellemeKur({ app, ipcMain, autoUpdater, pencereyeGonder, ayarAl, ayarKoy, kapatmayaHazirla: () => { kapatOnayli = true; } });
  } catch (e) { console.error('[güncelleme] kurulamadı:', e); }
  bekleyenDosyalar.push(...argvdenPdfler(process.argv, process.cwd()));
  pencereOlustur();
  cekirdek.baslat().catch((e) => console.error('[çekirdek] başlatılamadı:', e));
});

app.on('window-all-closed', () => {
  cekirdek.durdur();
  app.quit();
});
