// XFA formunun düz PDF'i (0.3.1; yazdırma ve Sayfalar panelinin küçük resimleri). Saf XFA formunun sayfaları MuPDF'te yok (yalnızca belgenin
// "lütfen bekleyin" sayfası): Çekirdek onları çizemez. Arayüz formun güncel değerli baytlarını (PDF.js saveDocument) verir; gizli bir pencere
// formu PDF.js'in XFA katmanıyla, ekrandakiyle aynı kurallarla (renderer/xfaHtml.js: sayfa numaraları, basılmayan düğmeler) sayfa sayfa
// çizer, webContents.printToPDF onu PDF'e çevirir (sayfa boyutları formunki, @page). Dosya anlık klasörüne yazılır (yapısal kayıttaki anlık
// kopyalar gibi <32 onaltılık>.pdf; arayüz anlik_sil ile siler, açılışta klasör temizlenir). Yazdırma ve küçük resimler o dosyadan olağan
// PDF gibi (çekirdek sayfa_goruntu, kucuk_resim).
//
// Gizli pencere udfYaklasik.js'teki gibi yalıtılmıştır: show: false, sandbox, Node yok, ön yükleme betiği yok, iletişim kutusu açamaz, ayrı
// bellek içi oturum (BOLUM). pdefe://xfa-duz/ yalnızca çizim sayfasını, PDF.js'i (yapı ve işçi, standart yazı tipleri, cmap'ler) ve paylaşılan
// iki dosyayı (xfaHtml.js, xfa.css) verir; başka adrese istek çıkmaz. Baytlar base64 dilimleriyle executeJavaScript üzerinden verilir. Çizimler
// sırayla yapılır (tek gizli pencere); pencere iş bitince, hatada ya da zaman aşımında yok edilir.
//
// Kanal: 'xfa:duzPdf' { veri: Uint8Array (PDF), bilgi: çekirdeğin xfa_bilgi sonucu } → { yol, sayfa, boyut }
import { app, BrowserWindow, session } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BOLUM = 'pdefe-xfa-duz';                 // bellek içi oturum ("persist:" ön eki yok: diske hiçbir şey yazılmaz)
const KAYNAK = 'pdefe://xfa-duz/';
const CSP = "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:; font-src data: blob:; "
  + "connect-src 'self'; object-src 'none'; frame-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'";
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const DILIM = 3 * 1024 * 1024;                   // base64 dilimi (3'ün katı: dilimler ayrı ayrı çözülür)
const EN_BUYUK = 300 * 1024 * 1024;
const EN_BUYUK_BILGI = 4 * 1024 * 1024;          // xfa_bilgi'nin JSON'u
const YUKLEME_MS = 20_000, CIZIM_MS = 90_000, PDF_MS = 120_000;

const hataMetni = (e) => (e && (e.message || String(e))) || 'Bilinmeyen hata';

let KOK = '';
let oturum = null;
const onbellek = new Map();

/** İstenen dosyanın diskteki yeri (yalnızca izin verilenler); yoksa null. */
function dosyaYeri(ad) {
  const sabit = {
    'sayfa.html': ['src', 'xfa-duz', 'sayfa.html'], 'cizim.js': ['src', 'xfa-duz', 'cizim.js'],
    'xfaHtml.js': ['src', 'renderer', 'xfaHtml.js'], 'xfa.css': ['src', 'renderer', 'xfa.css'],
    'pdfjs/pdf.min.mjs': ['node_modules', 'pdfjs-dist', 'build', 'pdf.min.mjs'],
    'pdfjs/pdf.worker.min.mjs': ['node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'],
  };
  if (Object.prototype.hasOwnProperty.call(sabit, ad)) return path.join(KOK, ...sabit[ad]);
  const m = /^pdfjs\/(standard_fonts|cmaps)\/([A-Za-z0-9._-]+)$/.exec(ad);
  if (m && !m[2].startsWith('.')) return path.join(KOK, 'node_modules', 'pdfjs-dist', m[1], m[2]);
  return null;
}

async function sayfaYaniti(istek) {
  const yok = () => new Response('Bulunamadı', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  let url;
  try { url = new URL(istek.url); } catch { return yok(); }
  if (url.host !== 'xfa-duz' || (istek.method && istek.method !== 'GET')) return yok();
  const ad = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const yer = dosyaYeri(ad);
  if (!yer) return yok();
  try {
    let veri = onbellek.get(ad);
    if (!veri) { veri = await fs.promises.readFile(yer); if (!ad.startsWith('pdfjs/') || veri.length < 4 * 1024 * 1024) onbellek.set(ad, veri); }
    const mime = MIME[path.extname(yer).toLowerCase()] || 'application/octet-stream';
    return new Response(veri, { status: 200, headers: { 'content-type': mime, 'cache-control': 'no-store', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff' } });
  } catch { return yok(); }
}

/** Çizim penceresinin oturumu (ilk istekte kurulur): pdefe://xfa-duz/ yalnızca izinli dosyaları verir; izin, indirme, başka adres yok. */
function oturumuKur() {
  if (oturum) return oturum;
  const s = session.fromPartition(BOLUM, { cache: false });
  s.protocol.handle('pdefe', (istek) => sayfaYaniti(istek));
  s.setPermissionRequestHandler((_wc, _izin, geri) => geri(false));
  s.setPermissionCheckHandler(() => false);
  s.webRequest.onBeforeRequest((ayrinti, geri) => geri({ cancel: !/^(pdefe:\/\/xfa-duz\/|blob:|data:)/i.test(String(ayrinti.url || '')) }));
  s.on('will-download', (olay) => olay.preventDefault());
  try { s.setSpellCheckerEnabled(false); } catch { /* yok say */ }
  oturum = s;
  return s;
}

function sureli(soz, kesinti, ms, ileti) {
  let zaman = null;
  const sure = new Promise((_coz, reddet) => { zaman = setTimeout(() => reddet(new Error(ileti)), ms); });
  return Promise.race([soz, kesinti, sure]).finally(() => clearTimeout(zaman));
}

/** Formu gizli pencerede çizip PDF'e çevirir. Döner: { pdf: Buffer, sayfa }. */
async function ciz(veri, bilgi) {
  const ses = oturumuKur();
  const pencere = new BrowserWindow({
    show: false, width: 900, height: 1200, skipTaskbar: true, focusable: false,
    webPreferences: {
      session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, webSecurity: true,
      javascript: true, images: true, webgl: false, plugins: false, spellcheck: false, backgroundThrottling: false, disableDialogs: true,
      navigateOnDragDrop: false, enableWebSQL: false, devTools: !app.isPackaged,
    },
  });
  const wc = pencere.webContents;
  let kes = null;
  const kesinti = new Promise((_coz, reddet) => { kes = reddet; });
  kesinti.catch(() => { /* yarışlardan biri */ });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (olay) => olay.preventDefault());
  wc.on('render-process-gone', (_olay, ayrinti) => kes(new Error('Çizim sayfası kapandı' + (ayrinti?.reason ? ` (${ayrinti.reason})` : '') + '.')));
  pencere.on('unresponsive', () => kes(new Error('Çizim sayfası yanıt vermiyor.')));
  try {
    await sureli(pencere.loadURL(KAYNAK + 'sayfa.html'), kesinti, YUKLEME_MS, 'Çizim sayfası zamanında yüklenemedi.');
    const hazir = await sureli(wc.executeJavaScript('(async () => { for (let i = 0; i < 200 && typeof window.xfaDuz !== "object"; i++) await new Promise((r) => setTimeout(r, 25)); return typeof window.xfaDuz === "object"; })()', true),
      kesinti, YUKLEME_MS, 'Çizim sayfası hazır olmadı.');
    if (hazir !== true) throw new Error('Çizim sayfası yüklenemedi.');
    for (let o = 0; o < veri.length; o += DILIM) {
      const b64 = veri.subarray(o, Math.min(veri.length, o + DILIM)).toString('base64');
      await sureli(wc.executeJavaScript(`window.xfaDuz.parca(${JSON.stringify(b64)})`, true), kesinti, YUKLEME_MS, 'Form çizim sayfasına aktarılamadı.');
    }
    const r = await sureli(wc.executeJavaScript(`window.xfaDuz.ciz(${JSON.stringify(bilgi || null)})`, true), kesinti, CIZIM_MS, 'Form zamanında çizilemedi.');
    if (!r || r.tamam !== true) throw new Error(r?.hata || 'Form çizilemedi.');
    const pdf = await sureli(wc.printToPDF({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, generateTaggedPDF: false,
      generateDocumentOutline: false, margins: { top: 0, bottom: 0, left: 0, right: 0 } }), kesinti, PDF_MS, 'PDF zamanında üretilemedi.');
    if (!pdf?.length) throw new Error('PDF üretilemedi.');
    return { pdf: Buffer.from(pdf), sayfa: r.sayfa, tasan: r.tasan || 0 };
  } finally {
    try { if (!pencere.isDestroyed()) pencere.destroy(); } catch { /* yok say */ }
  }
}

let sira = Promise.resolve();

export function xfaDuzKur({ ipcMain, KOK: kok, anlikKlasoru }) {
  KOK = kok;
  ipcMain.handle('xfa:duzPdf', async (_e, p) => {
    const veri = p?.veri;
    if (!(veri instanceof Uint8Array) || veri.length < 8 || veri.length > EN_BUYUK) throw new Error('Formun baytları geçersiz.');
    let bilgi = null;
    if (p.bilgi != null) {
      if (typeof p.bilgi !== 'object' || Array.isArray(p.bilgi) || JSON.stringify(p.bilgi).length > EN_BUYUK_BILGI) throw new Error('Form bilgisi geçersiz.');
      bilgi = { sayfaNumaralari: Array.isArray(p.bilgi.sayfaNumaralari) ? p.bilgi.sayfaNumaralari : [], ekranda: Array.isArray(p.bilgi.ekranda) ? p.bilgi.ekranda : [], alanlar: Array.isArray(p.bilgi.alanlar) ? p.bilgi.alanlar : [] };
    }
    const tampon = Buffer.from(veri.buffer, veri.byteOffset, veri.byteLength);
    const is = sira.then(() => ciz(tampon, bilgi));
    sira = is.catch(() => {});
    let sonuc;
    try { sonuc = await is; } catch (e) { throw new Error('Formun yazdırılacak hâli hazırlanamadı: ' + hataMetni(e)); }
    const klasor = anlikKlasoru();
    await fs.promises.mkdir(klasor, { recursive: true });
    const yol = path.join(klasor, crypto.randomBytes(16).toString('hex') + '.pdf');
    await fs.promises.writeFile(yol, sonuc.pdf, { flag: 'wx' });
    return { yol, sayfa: sonuc.sayfa, boyut: sonuc.pdf.length, tasan: sonuc.tasan };
  });
}
