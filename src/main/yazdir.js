// Yazdırma (ana süreç): renderer'ın kurduğu HTML'i gizli bir pencerede yükler ve
// Windows yazdırma diyaloğuyla (silent:false) yazdırır.
//
// Kanal: 'yazdir:baslat' { html, secenekler: { ciftTarafli: 'tek'|'uzun'|'kisa',
//        sayfaBoyutu: { genislikMikron, yukseklikMikron } | 'A4'|'A3'|'Letter'|'Legal'|'Tabloid' } }
//   → { basarili: true } | { basarili: false, iptal: true } | { basarili: false, hata: 'metin' }
//
// HTML, data: URL sınırına takılmamak için geçici bir dosyaya yazılır
// (app.getPath('temp')/PDEfe/yazdir-<zaman>.html) ve iş bitince silinir.
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

const YUKLEME_ZAMAN_ASIMI_MS = 120_000;   // büyük belgelerde görsellerin çözülmesi uzun sürebilir
const EN_BUYUK_HTML_BAYT = 1024 * 1024 * 1024; // 1 GB üstü mantıksız; hata ver

const CIFT_TARAFLI = { tek: 'simplex', uzun: 'longEdge', kisa: 'shortEdge' };
const STANDART_BOYUTLAR = new Set(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid']);

let suruyor = false;   // aynı anda tek yazdırma işi

/**
 * 'yazdir:baslat' IPC işleyicisini kurar.
 * @param {{ ipcMain: Electron.IpcMain, BrowserWindow: typeof Electron.BrowserWindow, pencereAl: () => Electron.BrowserWindow|null }} p
 */
export function yazdirmaKur({ ipcMain, BrowserWindow, pencereAl }) {
  ipcMain.handle('yazdir:baslat', async (_e, istek) => {
    if (suruyor) return { basarili: false, hata: 'Bir yazdırma işlemi zaten sürüyor. Önce onu bitirin ya da iptal edin.' };
    suruyor = true;
    try {
      return await yazdir({ BrowserWindow, pencereAl }, istek || {});
    } catch (e) {
      return { basarili: false, hata: hataMetni(e) };
    } finally {
      suruyor = false;
    }
  });
}

async function yazdir({ BrowserWindow, pencereAl }, { html, secenekler }) {
  if (typeof html !== 'string' || !html.trim()) return { basarili: false, hata: 'Yazdırılacak içerik boş.' };
  if (Buffer.byteLength(html, 'utf8') > EN_BUYUK_HTML_BAYT) return { basarili: false, hata: 'Yazdırılacak içerik çok büyük. Daha az sayfa seçin.' };

  const yazdirmaSecenekleri = secenekleriHazirla(secenekler || {});

  // 1) Geçici HTML dosyası
  const klasor = path.join(app.getPath('temp'), 'PDEfe');
  await fs.promises.mkdir(klasor, { recursive: true });
  const dosya = path.join(klasor, `yazdir-${Date.now()}-${process.pid}.html`);
  await fs.promises.writeFile(dosya, html, 'utf8');

  // 2) Gizli pencere
  const ana = pencereAl?.() || null;
  const anaGecerli = ana && !ana.isDestroyed() ? ana : null;
  const pencere = new BrowserWindow({
    show: false,
    parent: anaGecerli || undefined,
    width: 900, height: 1200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  try {
    await yukle(pencere, dosya);
    if (pencere.isDestroyed()) return { basarili: false, hata: 'Yazdırma penceresi kapandı.' };
    return await webContentsYazdir(pencere.webContents, yazdirmaSecenekleri);
  } finally {
    try { if (!pencere.isDestroyed()) pencere.destroy(); } catch { /* yok say */ }
    fs.promises.unlink(dosya).catch(() => { /* geçici dosya silinemedi; Temp temizliğine kalır */ });
  }
}

/** Geçici dosyayı yükler; did-finish-load / did-fail-load / zaman aşımı. */
function yukle(pencere, dosya) {
  return new Promise((coz, reddet) => {
    let bitti = false;
    const zaman = setTimeout(() => { if (!bitti) { bitti = true; reddet(new Error('Yazdırma içeriği zamanında yüklenemedi.')); } }, YUKLEME_ZAMAN_ASIMI_MS);
    const wc = pencere.webContents;
    wc.once('did-finish-load', () => { if (!bitti) { bitti = true; clearTimeout(zaman); coz(); } });
    wc.once('did-fail-load', (_e, kod, aciklama) => { if (!bitti) { bitti = true; clearTimeout(zaman); reddet(new Error(`Yazdırma içeriği yüklenemedi (${kod}): ${aciklama}`)); } });
    wc.once('render-process-gone', (_e, ayrinti) => { if (!bitti) { bitti = true; clearTimeout(zaman); reddet(new Error('Yazdırma penceresi çöktü: ' + (ayrinti?.reason || ''))); } });
    pencere.loadFile(dosya).catch((e) => { if (!bitti) { bitti = true; clearTimeout(zaman); reddet(e); } });
  });
}

/** Renderer'dan gelen seçenekleri Electron webContents.print() biçimine çevirir. */
function secenekleriHazirla(s) {
  const secenek = {
    silent: false,                 // Windows yazdırma diyaloğu açılır (yazıcı, kopya sayısı vb. orada seçilir)
    printBackground: true,
    color: true,
    margins: { marginType: 'none' },
    landscape: false,
    duplexMode: CIFT_TARAFLI[s.ciftTarafli] || 'simplex',
  };
  const b = s.sayfaBoyutu;
  if (typeof b === 'string' && STANDART_BOYUTLAR.has(b)) {
    secenek.pageSize = b;
  } else if (b && Number.isFinite(b.genislikMikron) && Number.isFinite(b.yukseklikMikron) && b.genislikMikron > 0 && b.yukseklikMikron > 0) {
    // Electron mikron ister; tam sayıya yuvarla. Çok küçük değerler sürücüde hata verir; 30 mm altına inme.
    const g = Math.max(30_000, Math.round(b.genislikMikron));
    const y = Math.max(30_000, Math.round(b.yukseklikMikron));
    secenek.pageSize = { width: g, height: y };
  } else {
    secenek.pageSize = 'A4';
  }
  return secenek;
}

/** webContents.print() sözü; iptali ayırt eder. */
function webContentsYazdir(wc, secenek) {
  return new Promise((coz) => {
    let bitti = false;
    const bitir = (sonuc) => { if (!bitti) { bitti = true; coz(sonuc); } };
    try {
      wc.print(secenek, (basarili, neden) => {
        if (basarili) { bitir({ basarili: true }); return; }
        const n = String(neden || '');
        if (/cancel/i.test(n)) { bitir({ basarili: false, iptal: true }); return; }
        bitir({ basarili: false, hata: nedenTurkce(n) });
      });
    } catch (e) {
      bitir({ basarili: false, hata: hataMetni(e) });
    }
  });
}

function nedenTurkce(neden) {
  if (!neden) return 'Yazdırma başarısız oldu.';
  if (/no printers|printer not found|no valid printers/i.test(neden)) return 'Kurulu yazıcı bulunamadı. Windows Ayarlar > Yazıcılar ve tarayıcılar bölümünden bir yazıcı ekleyin.';
  if (/invalid printer settings|invalid settings/i.test(neden)) return 'Yazıcı ayarları geçersiz. Sayfa boyutu ya da çift taraflı seçeneği bu yazıcıda desteklenmiyor olabilir.';
  if (/failed/i.test(neden)) return 'Yazdırma başarısız oldu: ' + neden;
  return neden;
}

function hataMetni(e) { return (e && (e.message || String(e))) || 'Bilinmeyen hata'; }
