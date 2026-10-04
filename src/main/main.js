// PDEfe ana süreç: tek örnek, pdefe:// protokolü, menü, IPC köprüsü. Pencereler (birden çok olabilir) pencereler.js'te.
import { app, BrowserWindow, protocol, net, ipcMain, dialog, Menu, shell, nativeTheme, clipboard } from 'electron';
import { TEST, testDiyalogKur, sahteGuncelleyiciKur } from './gelistirme.js';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ayarlar, ayarKoy, ayarAl, VARSAYILANLAR } from './ayarlar.js';
import { menuKur } from './menu.js';
import { Cekirdek } from './cekirdek.js';
import { panoyaDosyaKopyala, panoyaMetinYaz } from './pano.js';
import { yazdirmaKur } from './yazdir.js';
import { guncellemeKur } from './guncelleme.js';
import { pencereleriKur, pencereOlustur, pencereAl, kayitAl, etkinKayit, etkinPencere, herkese, digerlerine, odakla, dosyalariAc, cik, kapatmaOnayiAyarla, menuCubugunuUygula, pencereSayisi } from './pencereler.js';
import { disAdresMi, guvenliIpc, gezinmeKorumasiKur, cekirdekParametreleri, YOLA_YAZANLAR, paketKlasoruMu, pdfDosyasiMi, yaziTipiDosyasiMi, yaziTipiKlasorleri, standartYaziTipleri, anlikDosyasiMi } from './guvenlik.js';
import electronUpdater from 'electron-updater';
import { MacGuncelleyici, tarayicidaIndir } from './macGuncelleme.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KOK = app.getAppPath();                   // package.json'un bulunduğu kök
const PAKETLI = app.isPackaged;
const MAC = process.platform === 'darwin';

// ---------- Tek örnek ----------
const kilit = app.requestSingleInstanceLock();
if (!kilit) {
  app.quit();
}

/** @type {ReturnType<typeof guncellemeKur>|null} */
let guncelleme = null;
const cekirdek = new Cekirdek({ kok: KOK, paketli: PAKETLI, kaynaklar: process.resourcesPath, surum: app.getVersion() });
// Uygulama dışına gezinme ve gömülü sayfa engellenir; IPC yalnızca uygulamanın kendi sayfalarından kabul edilir (0.1.23, guvenlik.js)
gezinmeKorumasiKur(app);
const ipc = guvenliIpc(ipcMain);

/** Yapısal kayıttaki anlık kopyaların klasörü (çekirdeğe ana süreç verir; açılışta temizlenir). */
function anlikKlasoru() { return path.join(app.getPath('userData'), 'anlik'); }

/**
 * %TEMP%\PDEfe'deki pano görüntülerini ("Pano görüntüsü …png", ekran görüntüleri) ve yazdırma iş klasörlerini (yazdir-*, belge
 * sayfalarının görüntüleri) siler (0.1.23, güvenlik denetimi): önceden bir günden eskileri yalnızca yeni bir yapıştırmada / yazdırmada
 * siliniyordu, yapıştırma olmazsa süresiz kalıyordu. Açılışta (yazdırma klasörleri dahil) ve kapanışta (pano görüntüleri) çağrılır.
 * Yalnızca kurulu PDEfe'nin kendi veri klasörüyle çalışan örneğinde: %TEMP%\PDEfe bütün örneklerin ortağıdır; ayrı veri klasörüyle
 * çalışan test örneği, kullanıcının açık PDEfe'sinin kullandığı görüntüyü ya da süren yazdırma işini silmesin.
 */
function geciciKopyalariSil({ yazdirma = true } = {}) {
  if (!PAKETLI || !kilit || path.resolve(app.getPath('userData')).toLowerCase() !== path.resolve(app.getPath('appData'), 'PDEfe').toLowerCase()) return;
  const klasor = path.join(app.getPath('temp'), 'PDEfe');
  let adlar = [];
  try { adlar = fs.readdirSync(klasor); } catch { return; }
  for (const ad of adlar) {
    if (!/^Pano görüntüsü .*\.png$/i.test(ad) && !(yazdirma && /^yazdir-/.test(ad))) continue;
    try { fs.rmSync(path.join(klasor, ad), { recursive: true, force: true }); } catch { /* kullanımda: sonraki açılışta */ }
  }
}

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

/** Kayıt defterinden bir ProgId değeri (reg.exe; Electron'da kayıt defteri API'si yok). Anahtar ya da değer yoksa null.
 *  reg.exe tam yoluyla çalıştırılır: çıplak ad sürecin çalışma klasöründe (çift tıklanan PDF'in klasörü) aranabilirdi. */
function progIdOku(anahtar) {
  const reg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  return new Promise((coz) => {
    execFile(reg, ['query', anahtar, '/v', 'ProgId'], { windowsHide: true, timeout: 5000 }, (hata, cikti) => {
      const m = !hata && /^\s*ProgId\s+REG_\w+\s+(.+?)\s*$/im.exec(String(cikti || ''));
      coz(m ? m[1] : null);
    });
  });
}

/** .pdf'yi Windows'ta PDEfe mi açıyor: kullanıcının seçimi Windows 11'in yeni kaydında (FileExts\.pdf\UserChoiceLatest\ProgId; varsa
 *  geçerli olan o), yoksa eski kayıtta (UserChoice). Kurulumun yazdığı ProgId PDEfe.pdf (electron-builder.yml fileAssociations.name).
 *  Seçim hiç yapılmamışsa ya da okunamadıysa { varsayilan: null }. */
async function pdfVarsayilaniOku() {
  const kok = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf';
  const progId = (await progIdOku(kok + '\\UserChoiceLatest\\ProgId')) || (await progIdOku(kok + '\\UserChoice'));
  return { varsayilan: progId ? progId.toLowerCase() === 'pdefe.pdf' : null, progId };
}

// Gezgin'de çift tıklanan PDF (ikinci örnek): bir pencerede zaten açıksa o pencerede, değilse en son etkin pencerede açılır
app.on('second-instance', (_e, argv, cwd) => {
  const k = dosyalariAc(argvdenPdfler(argv, cwd)) || etkinKayit();
  if (k) odakla(k);
});

// macOS (0.2.0): Finder'da çift tıklanan, "Birlikte aç"la ya da Dock simgesine bırakılarak açılan PDF komut satırında gelmez, bu olayla gelir
// (uygulama kapalıyken de: hazır olmadan önce). Açık uygulamada Windows'taki ikinci örnek gibi işlenir; pencere yoksa yenisi açılır.
const acilisDosyalari = [];
let pencerelerKuruldu = false;
app.on('open-file', (e, yol) => {
  e.preventDefault();
  if (!/\.pdf$/i.test(String(yol || ''))) return;
  if (!pencerelerKuruldu) { acilisDosyalari.push(yol); return; }
  const k = dosyalariAc([yol]);
  if (k) odakla(k); else pencereOlustur({ dosyalar: [yol] });
});
// macOS: Dock simgesine tıklanınca açık pencere yoksa yeni pencere (son pencere kapanınca uygulama da kapandığından çoğunlukla gelmez)
app.on('activate', () => { if (pencerelerKuruldu && !pencereSayisi()) pencereOlustur(); });
// macOS: Dock'tan "Çık", oturum kapatma ve yeniden başlatma uygulamaya çıkış isteği olarak gelir: ⌘Q gibi pencereler sırayla kapatılır,
// her biri kaydedilmemiş belgelerini sorar (Electron'un kendi çıkışı ilk kapatma sorusunda dururdu). Son pencere kapanınca çıkılır.
let cikisSerbest = false;
app.on('before-quit', (e) => {
  if (!MAC || cikisSerbest || !pencereSayisi()) return;
  e.preventDefault();
  cik();
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

// ---------- Menü ----------
/** Uygulama menüsünü (yeniden) kurar: son dosyalar ve Görünüm menüsündeki düzen işaretleri ayardan okunur. "Son açılanları
 *  hatırla" kapalıyken Dosya menüsünde Son açılanlar yoktur (sonDosyalar null). Menü bütün pencerelerde aynıdır; komut, menünün
 *  açıldığı (etkin) pencereye gider. */
function uygulamaMenusuKur() {
  Menu.setApplicationMenu(menuKur({
    komut: (id, veri, pencere) => { const p = kayitAl(pencere?.webContents)?.pencere || etkinPencere(); if (p && !p.isDestroyed()) p.webContents.send('menu:komut', id, veri); },
    cik: () => cik(),
    sonDosyalar: () => (ayarAl('sonAcilanlariHatirla') === false ? null : ayarAl('sonDosyalar') || []),
    duzen: () => ({ duzen: ayarAl('varsayilanDuzen'), kapakAyri: !!ayarAl('kapakAyri') }),
  }));
}

function temaKoyuMu() {
  const tema = ayarAl('tema') || 'sistem';
  if (tema === 'sistem') return nativeTheme.shouldUseDarkColors;
  return tema === 'koyu';
}

nativeTheme.on('updated', () => herkese('tema:sistem', nativeTheme.shouldUseDarkColors));

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
    if (s.length > 1024 || !path.isAbsolute(s)) return [];
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
/** ipcMain: guvenliIpc sarmalayıcısı (uygulamanın sayfası dışından gelen istek işlenmez); modüllere de o verilir. */
function ipcKur(ipcMain) {
  ipcMain.handle('ayar:al', (_e, anahtar) => (anahtar ? ayarAl(anahtar) : ayarlar.store));
  const MENU_AYARLARI = new Set(['varsayilanDuzen', 'kapakAyri', 'sonAcilanlariHatirla']);   // menüde görünen ayarlar
  // Ayarlar bütün pencerelerde ortaktır: değişiklik öteki pencerelere bildirilir ('ayar:degisti'; kendi kopyalarını güncelleyip uygularlar)
  ipcMain.handle('ayar:koy', (e, anahtar, deger) => {
    ayarKoy(anahtar, deger);
    if (MENU_AYARLARI.has(anahtar)) uygulamaMenusuKur();
    if (anahtar === 'menuCubugu') menuCubugunuUygula(!!deger);
    digerlerine(e, 'ayar:degisti', anahtar, deger);
    return true;
  });
  ipcMain.handle('tema:sistemKoyu', () => nativeTheme.shouldUseDarkColors);

  // secenek: {baslik, filtreler:[{name, extensions}], coklu, varsayilan}
  const testDiyalog = testDiyalogKur(ipcMain);   // test örneğinde yerel diyaloglar ekrana çıkmaz (gelistirme.js)
  // "Son açılanları hatırla" kapalıyken Aç / Kaydet pencereleri seçilen dosyayı Windows'un son kullanılanlar listesine de eklemez
  const sonKullanilanlar = () => (ayarAl('sonAcilanlariHatirla') === false ? ['dontAddToRecent'] : []);
  ipcMain.handle('dosya:acDiyalog', async (e, secenek) => {
    if (testDiyalog) return testDiyalog('dosya:acDiyalog', { ...secenek, windowsSonKullanilanlar: !sonKullanilanlar().length }, []);
    const s = await dialog.showOpenDialog(pencereAl(e), {
      title: secenek?.baslik || 'PDF aç',
      defaultPath: secenek?.varsayilan,
      filters: secenek?.filtreler || [{ name: 'PDF belgeleri', extensions: ['pdf'] }, { name: 'Tüm dosyalar', extensions: ['*'] }],
      properties: ['openFile', ...(secenek?.coklu === false ? [] : ['multiSelections']), ...sonKullanilanlar()],
    });
    return s.canceled ? [] : s.filePaths;
  });

  ipcMain.handle('dosya:klasorSec', async (e, secenek) => {
    if (testDiyalog) return testDiyalog('dosya:klasorSec', secenek, null);
    const s = await dialog.showOpenDialog(pencereAl(e), { title: secenek?.baslik || 'Klasör seç', defaultPath: secenek?.varsayilan, properties: ['openDirectory', 'createDirectory'] });
    return s.canceled ? null : s.filePaths[0];
  });

  ipcMain.handle('dosya:kaydetDiyalog', async (e, secenek) => {
    if (testDiyalog) return testDiyalog('dosya:kaydetDiyalog', secenek, null);
    const filtreler = secenek?.filtreler || [{ name: 'PDF belgesi', extensions: ['pdf'] }];
    const s = await dialog.showSaveDialog(pencereAl(e), {
      title: secenek?.baslik || 'Farklı kaydet',
      defaultPath: secenek?.varsayilan,
      filters: filtreler,
      properties: sonKullanilanlar(),
    });
    if (s.canceled || !s.filePath) return null;
    // Yalnızca PDF süzgeci varken başka uzantılı ad yazılırsa (ör. "rapor.txt") .pdf eklenir: çekirdek yalnızca .pdf'e yazar (guvenlik.js).
    // Windows'un "değiştirilsin mi" sorusu diyalogdaki ada göre sorulduğundan, eklenmiş adla dosya varsa burada sorulur
    const yalnizPdf = filtreler.every((f) => (f.extensions || []).every((x) => String(x).toLowerCase() === 'pdf'));
    if (!yalnizPdf || /\.pdf$/i.test(s.filePath)) return s.filePath;
    const yol = s.filePath + '.pdf';
    if (fs.existsSync(yol)) {
      const r = await dialog.showMessageBox(pencereAl(e), {
        type: 'warning', title: secenek?.baslik || 'Farklı kaydet', message: `${path.basename(yol)} zaten var.`, detail: 'Değiştirmek istiyor musunuz?',
        buttons: ['Evet', 'Hayır'], defaultId: 1, cancelId: 1, noLink: true,
      });
      if (r.response !== 0) return null;
    }
    return yol;
  });

  // Araçların yarım kalan / istenmeyen çıktısı: yalnızca .pdf dosyası ve yalnızca Geri Dönüşüm Kutusu'na (0.1.23: kalıcı silme yok)
  ipcMain.handle('dosya:sil', async (_e, yol) => {
    if (!/\.pdf$/i.test(String(yol || ''))) return false;
    try { await shell.trashItem(String(yol)); return true; } catch { return false; }
  });
  ipcMain.handle('uygulama:veriKlasoru', () => app.getPath('userData'));
  ipcMain.handle('uygulama:geciciKlasor', () => { const k = path.join(app.getPath('temp'), 'PDEfe'); fs.mkdirSync(k, { recursive: true }); return k; });
  // macOS'ta varsayılan uygulama Finder'ın Bilgi Al penceresinden seçilir (Ayarlar yalnızca yolu anlatır): bu iki kanal orada iş yapmaz
  ipcMain.handle('kabuk:varsayilanUygulamalar', () => (MAC ? false : shell.openExternal('ms-settings:defaultapps?registeredAppUser=PDEfe')));
  // .pdf'nin varsayılan uygulaması PDEfe mi (Ayarlar › Açılış ve düzen): { varsayilan: true | false | null (okunamadı), progId }.
  // Test örneğinde gerçek kayıt okunmaz; yanıt test:diyalogYanitlari kuyruğundan (varsayılan: okunamadı)
  ipcMain.handle('kabuk:varsayilanMi', async () => (testDiyalog ? testDiyalog('kabuk:varsayilanMi', {}, { varsayilan: null, progId: null })
    : MAC ? { varsayilan: null, progId: null } : pdfVarsayilaniOku()));
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
    // yaziTipleri: sistemin yazı tipi klasörü; yaziTipiDosyalari: gömülü olmayan standart fontların (Times, Helvetica, Courier) yerine
    // okunan sistem fontlarının yolları (Windows'ta times.ttf…, macOS'ta Times New Roman.ttf…; renderer/yaziTipleri.js)
    return { masaustu: al('desktop'), belgeler: al('documents'), indirilenler: al('downloads'), ev: al('home'), yaziTipleri: yaziTipiKlasorleri()[0],
      yaziTipiDosyalari: standartYaziTipleri() };
  });

  // Yalnızca PDF belgeleri (başında %PDF- imzası) ve sistemin yazı tipi klasörlerindeki yazı tipleri okunur (0.1.23, guvenlik.js)
  ipcMain.handle('dosya:oku', async (_e, yol) => {
    // Dosya yoksa ya da kilitliyse okuma hatası olduğu gibi döner (pdfDosyasiMi fırlatır); okunup imzası yoksa "PDF değil"
    if (!yaziTipiDosyasiMi(yol) && !(await pdfDosyasiMi(yol))) throw new Error('Bu dosya bir PDF belgesi değil.');
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
  // bu kanalı yalnızca test kancası (window.__pdefeYerelKutu; test kuyruğuyla yanıtlanan senaryolar) kullanır.
  ipcMain.handle('mesaj:kutu', async (e, secenek) => {
    if (testDiyalog) return testDiyalog('mesaj:kutu', secenek, { secim: secenek.varsayilan ?? 0, onay: false });
    const s = await dialog.showMessageBox(pencereAl(e), {
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
  ipcMain.handle('menu:popup', (e, ogeler) => new Promise((coz) => {
    if (testDiyalog) { coz(testDiyalog('menu:popup', ogeler, null)); return; }
    let secilen = null;
    const sablon = ogeler.map((o) => (o.ayirici ? { type: 'separator' } : {
      label: o.etiket, enabled: o.devre !== true, type: o.isaretli != null ? 'checkbox' : 'normal',
      checked: !!o.isaretli, click: () => { secilen = o.id; },
    }));
    const m = Menu.buildFromTemplate(sablon);
    m.popup({ window: pencereAl(e) || undefined, callback: () => coz(secilen) });
  }));

  ipcMain.handle('kabuk:klasordeGoster', (_e, yol) => { shell.showItemInFolder(yol); return true; });
  // Klasörü Gezgin'de açar (araç pencerelerindeki klasör çipi). Test örneğinde Gezgin açılmaz (bilgisayarı kullanan kişinin ekranı)
  // Yalnızca klasör: shell.openPath dosyayı varsayılan programıyla açar, exe'yi çalıştırır (0.1.23). macOS'ta uygulama paketi (.app) de
  // klasördür ve açılınca uygulama başlar: paket klasörü açılmaz (0.2.1, guvenlik.js paketKlasoruMu)
  ipcMain.handle('kabuk:klasorAc', async (_e, klasor) => {
    const st = await fs.promises.stat(String(klasor || '')).catch(() => null);
    if (!st?.isDirectory()) return false;
    if (MAC && await paketKlasoruMu(String(klasor))) return false;
    if (testDiyalog) return testDiyalog('kabuk:klasorAc', { klasor }, true);
    const hata = await shell.openPath(String(klasor));
    return !hata;
  });
  // Yalnızca web ve e-posta adresleri (0.1.23; guvenlik.js disAdresMi): PDF'teki bağlantı buraya gelir, başka türler açılmaz
  ipcMain.handle('kabuk:disAc', async (_e, url) => {
    if (!disAdresMi(url)) return false;
    try { await shell.openExternal(String(url)); return true; } catch { return false; }
  });
  // Test örneğinde sistem panosuna yazılmaz (bilgisayarı kullanan kişinin panosu bozulmasın): yazılan test:diyalogKaydi'na düşer
  // secenek.yalnizcaPanodaysa: pano hâlâ bu metni taşıyorsa yazılır (kopyalamadan sonra gelen temiz metin; bu arada başka bir şey
  // kopyalandıysa onun yerine geçmez, 0.1.23; pano.js panoyaMetinYaz)
  ipcMain.handle('pano:metin', (_e, metin, secenek) => {
    if (testDiyalog) return testDiyalog('pano:metin', { uzunluk: metin?.length, bas: String(metin ?? '').slice(0, 200), kosullu: secenek?.yalnizcaPanodaysa != null }, true);
    return panoyaMetinYaz(clipboard, metin, secenek?.yalnizcaPanodaysa);
  });
  ipcMain.handle('pano:oku', () => clipboard.readText());
  ipcMain.handle('pano:dosya', async (_e, yol) => {
    try { if (!(await pdfDosyasiMi(yol))) return { tamam: false, hata: 'Bu dosya bir PDF belgesi değil.' }; }   // yalnızca PDF panoya konur (0.1.23)
    catch (e) { return { tamam: false, hata: e?.message || String(e) }; }
    return testDiyalog ? testDiyalog('pano:dosya', { yol }, { tamam: true, hata: '' }) : panoyaDosyaKopyala(yol);
  });

  // Pencere kanalları (tam ekran, başlık, kapatma, sekme taşıma) pencereler.js'te
  ipcMain.handle('uygulama:bilgi', () => ({ surum: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, paketli: PAKETLI, kok: KOK }));
  ipcMain.handle('uygulama:sonDosyalar', (e, liste) => {
    ayarKoy('sonDosyalar', liste);
    uygulamaMenusuKur();
    digerlerine(e, 'ayar:degisti', 'sonDosyalar', liste);
    return true;
  });

  // Çekirdek (PyMuPDF) çağrıları. Çekirdek bütün pencerelerce paylaşılır: istek kimliği pencereye göre ayrılır (her pencere kendi
  // sayacından verir), ilerleme yalnızca isteği yapan pencereye gider
  // Parametreler denetlenir (guvenlik.js cekirdekParametreleri): çekirdek yalnızca .pdf'e yazar, anlık kopya klasörünü ana süreç verir.
  // Hedef verilmeyince yol'a yazan yöntemler de (YOLA_YAZANLAR; 0.2.1)
  ipcMain.handle('cekirdek:cagir', (e, yontem, params, istekId) => {
    const gonderen = e.sender;
    const p = (yontem === 'anlik_sil' || params?.hedef != null || YOLA_YAZANLAR.has(yontem)) ? cekirdekParametreleri(yontem, params, anlikKlasoru()) : params;
    return Promise.resolve(p).then((guvenli) => cekirdek.cagir(yontem, guvenli, (ilerleme) => { if (!gonderen.isDestroyed()) gonderen.send('cekirdek:ilerleme', istekId, ilerleme); },
      istekId == null ? null : `${gonderen.id}:${istekId}`));
  });
  ipcMain.handle('cekirdek:iptal', (e, istekId) => cekirdek.iptal(`${e.sender.id}:${istekId}`));
  ipcMain.handle('ayar:varsayilanlar', () => VARSAYILANLAR);
  yazdirmaKur({ ipcMain, BrowserWindow, pencereAl });
}

// ---------- Yaşam döngüsü ----------
app.whenReady().then(() => {
  // Önceki oturumlardan kalan anlık kopyalar (yapısal kayıtta özgün dosyanın kopyası; sekme kapanınca silinir, pencere kapatma ya da
  // çökmede kalır). Tek örnek kilidi bizdeyse başka örnek bunları kullanmıyordur: çekirdek başlamadan ve pencere açılmadan sil.
  if (kilit) { try { fs.rmSync(anlikKlasoru(), { recursive: true, force: true }); } catch { /* yok say */ } }
  geciciKopyalariSil();
  protokolKur();
  ipcKur(ipc);
  pencereleriKur({
    ipcMain: ipc, KOK, onYukleme: path.join(__dirname, 'preload.cjs'), TEST, ayarAl, ayarKoy, temaKoyuMu,
    // Haftalık güncelleme denetimi: sırası geldiyse ilk pencere göründükten birkaç saniye sonra; uygulama açık kaldıkça saatte bir bakılır
    pencereGosterildi: () => guncelleme?.pencereGosterildi(),
    // Kapanan pencerenin dosyaları: çekirdek önbelleğinden bırakılır (dosya tanıtıcısı kapanır), anlık kopyalar silinir. İstekler
    // çekirdekte sırayla işlenir; son pencere kapanıyorsa çekirdek bunları bitirip durur (window-all-closed)
    dosyalariBirak: ({ yollar = [], anliklar = [] } = {}) => {
      for (const yol of [...yollar, ...anliklar]) if (typeof yol === 'string' && yol) cekirdek.cagir('belge_birak', { yol }).catch(() => {});
      for (const yol of anliklar) if (anlikDosyasiMi(yol, anlikKlasoru())) cekirdek.cagir('anlik_sil', { yol }).catch(() => {});
    },
  });
  try {
    const sahte = sahteGuncelleyiciKur(ipc);   // yalnızca geliştirme örneğinde, PDEFE_TEST_GUNCELLEME ile
    guncelleme = guncellemeKur({
      // macOS (0.2.0): imzasız uygulama kendini güncelleyemez; yeni sürüm GitHub'ın sürüm akışından denetlenir, paket tarayıcıda indirilir
      // (macGuncelleme.js). electron-updater yalnızca Windows'ta yüklenir (autoUpdater erişimi platformun güncelleyicisini kurar)
      app, ipcMain: ipc, autoUpdater: sahte || (MAC ? new MacGuncelleyici(app.getVersion()) : electronUpdater.autoUpdater), etkin: PAKETLI || !!sahte,
      tarayiciIndir: MAC && !sahte ? tarayicidaIndir : null, ilkOrnek: kilit, pencereyeGonder: herkese, ayarAl, ayarKoy,
      // Kurulum uygulamayı kapatır: pencereler kaydedilmemiş değişiklikleri önceden sorduğu için (isteyen pencere kendininkini,
      // öteki pencereler 'pencere:digerlerindenIzinAl' ile) pencere kapatma yeniden sormasın
      kapatmayaHazirla: () => kapatmaOnayiAyarla(true),
      kapatmaIptal: () => kapatmaOnayiAyarla(false),
    });
  } catch (e) { console.error('[güncelleme] kurulamadı:', e); }
  uygulamaMenusuKur();
  pencereOlustur({ dosyalar: [...argvdenPdfler(process.argv, process.cwd()), ...acilisDosyalari.splice(0)] });
  pencerelerKuruldu = true;
  cekirdek.baslat().catch((e) => console.error('[çekirdek] başlatılamadı:', e));
});

// Son pencere kapanınca uygulama kapanır; macOS'ta da (0.2.0: belge uygulaması, Dock'ta boş kalmasın; Dock'tan yeniden açılır)
app.on('window-all-closed', () => {
  cikisSerbest = true;
  cekirdek.durdur();
  app.quit();
});
app.on('will-quit', () => geciciKopyalariSil({ yazdirma: false }));
