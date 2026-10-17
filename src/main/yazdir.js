// Yazdırma (ana süreç): renderer'ın sayfa sayfa gönderdiği görüntüleri geçici bir iş klasörüne yazar, küçük bir HTML iskeletini gizli
// bir pencerede yükler ve seçilen yazıcıya yazdırır.
//
// 0.2.6: Yazdırma PDEfe'nin kendi penceresinden (renderer/yazdir.js: yazıcı, kopya, kâğıt, renk, çift taraflı, ön izleme) Windows'un
// yazdırma kutusu açılmadan yapılır (webContents.print silent:true + deviceName). Neden: silent:false iken Chromium PrintDlgEx çağırıyor;
// Windows 11 22H2'den beri bu Win32 çağrısı birleşik (modern) yazdırma kutusuna gidiyor. O kutuda Win32 uygulamalarının ön izlemesi hep boş
// ("Bu uygulama yazdırma önizlemesini desteklemiyor"), kutu uygulamanın verdiği kâğıdı / yönü / çift taraflıyı yok sayabiliyor ve sayfa
// seçimi PDEfe'dekiyle ikinci kez yapılıyordu. Windows'un (macOS'un) yazdırma penceresi yedek yol olarak duruyor (sistemPenceresi).
//
// Neden sayfa başına dosya? Bütün belgeyi tek base64 HTML dizesi olarak taşımak V8'in 512 MB dize sınırına ve Chromium'un IPC ileti
// sınırına takılır (756 sayfa ≈ 500 MB). Her sayfa ayrı bir IPC iletisiyle gelir (≈0,5–1,5 MB) ve diske yazılır; HTML yalnızca
// <img src="s0001.jpg"> satırlarından oluşur, göreli yollar file:// üzerinden aynı klasörden yüklenir.
//
// Kanallar (hepsi { basarili, hata } ya da doğrudan sonuç döner; hata iletileri Türkçe):
//   'yazdir:yazicilar'   {}                                 → { yazicilar: [{ ad, gorunenAd, varsayilan }], varsayilan: ad | null }
//   'yazdir:yaziciDurumu' {}                                → { durumlar: { <ad>: { cevrimDisi, ciftTarafli, dosyayaYazar, varsayilan } } }
//                          (Windows: Win32_Printer, ~1 sn, pencere açıldıktan sonra arkadan; macOS'ta boş)
//   'yazdir:tercihler'   { yazici }                         → { basarili, hata? }  (Windows: yazıcının "Yazdırma tercihleri" penceresi;
//                          macOS: Sistem Ayarları › Yazıcılar ve Tarayıcılar)
//   'yazdir:hazirla'     {}                                 → { is: string, klasor: string }
//   'yazdir:sayfaEkle'   { is, sira, veri(base64), bicim }  → { dosya: 's0001.jpg', bayt, toplamBayt }
//   'yazdir:baslat'      { is, html, secenekler: { yazici, kopya, harmanla, renk, ciftTarafli, sayfaBoyutu, sistemPenceresi } }
//                                                           → { basarili: true } | { basarili: false, iptal: true } | { basarili: false, hata }
//   'yazdir:iptal'       { is? }                            → true  (hazırlık aşamasında klasörü siler; yazdırma sürerken gizli pencereyi
//                                                             yok eder → iş / Windows kutusu kapanır)
//   'yazdir:durum'       {}                                 → { suruyor: boolean, asama: 'yok'|'hazirlik'|'yazdirma' }
//
// Test örneğinde (gelistirme.js testDiyalogKur) yazıcıya hiçbir şey gitmez: print çağrısı ve tercihler penceresi test:diyalogKaydi'na düşer
// ('yazdir:yazdir', 'yazdir:tercihler'). PDEFE_TEST_YAZICILAR sahte yazıcı listesi verir ("1": yerleşik liste, ya da JSON dizi), test:yazicilar
// onu sonradan değiştirir. Görünmeyen masaüstündeki örnekte PDEFE_TEST_GERCEK_YAZDIR=1 gerçek yazdırmayı açar (test/yazdir_gercek.mjs).
//
// Aynı anda tek iş yürür. İş klasörü: app.getPath('temp')/PDEfe/yazdir-<zaman>-<pid>/ ; iş bitince, iptal edilince, ana pencere kapanınca
// ve uygulama çıkarken silinir. Önceki oturumlardan kalan (çökme vb.) bir günden eski iş klasörleri açılışta temizlenir.
import path from 'node:path';
import fs from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { app, shell } from 'electron';
import { secenekleriHazirla, nedenTurkce, varsayilanYaziciCoz, lpstatCoz, yaziciListesiHazirla, yaziciDurumlariniCoz, dosyayaYazarMi } from './yazdirSecenek.js';

const EN_BUYUK_HTML_BAYT = 32 * 1024 * 1024;          // HTML artık yalnızca iskelet; 32 MB üstü bozukluk işaretidir
const EN_BUYUK_SAYFA_BAYT = 64 * 1024 * 1024;         // tek sayfa görüntüsü (200 dpi A3 PNG bile 20 MB'ı geçmez)
const EN_BUYUK_TOPLAM_BAYT = 4 * 1024 * 1024 * 1024;  // iş başına disk kullanımı (≈ 3000 taranmış sayfa)
const EN_FAZLA_SAYFA = 5000;
const YUKLEME_ZAMAN_ASIMI_MS = 300_000;               // binlerce görselin çözülmesi uzun sürebilir
const ESKI_IS_OMRU_MS = 24 * 60 * 60 * 1000;
const DURUM_OMRU_MS = 15_000;                         // Win32_Printer sorgusu bu kadar süre yeniden kullanılır (pencere art arda açılınca)
const BICIM_UZANTI = { jpeg: 'jpg', jpg: 'jpg', png: 'png' };
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const SISTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');

/** Test örneğinin yerleşik sahte yazıcıları (PDEFE_TEST_YAZICILAR=1): çift taraflı basan varsayılan yazıcı, dosyaya yazan, çevrim dışı. */
const SAHTE_YAZICILAR = [
  { ad: 'Lazer Yazıcı', varsayilan: true, ciftTarafli: true },
  { ad: 'Microsoft Print to PDF', dosyayaYazar: true },
  { ad: 'Kat 2 Yazıcısı', cevrimDisi: true, ciftTarafli: true },
];
const SAHTE_DURUM_GECIKMESI_MS = 400;   // Win32_Printer gibi arkadan gelsin

/** @type {{ id: string, klasor: string, asama: 'hazirlik'|'yazdirma', sayfaSayisi: number, toplamBayt: number, pencere: any, bitir: Function|null, iptalEdildi: boolean, sahipBirak: Function|null } | null} */
let aktif = null;
let sayac = 0;

/**
 * Yazdırma IPC işleyicilerini kurar.
 * @param {{ ipcMain: Electron.IpcMain, BrowserWindow: typeof Electron.BrowserWindow, pencereAl: (e: Electron.IpcMainInvokeEvent) => Electron.BrowserWindow|null,
 *   testDiyalog?: Function|null, TEST?: { yazicilar?: string, gercekYazdir?: boolean } }} p
 *   pencereAl: isteği gönderen uygulama penceresi (birden çok pencere olabilir); testDiyalog: test örneğinde yerel pencerelerin yerine (anaSurec.js)
 */
export function yazdirmaKur({ ipcMain, BrowserWindow, pencereAl, testDiyalog = null, TEST = {} }) {
  const test = testDiyalog ? { diyalog: testDiyalog, gercekYazdir: !!TEST.gercekYazdir, yazicilar: sahteYazicilariCoz(TEST.yazicilar) } : null;
  if (test) ipcMain.handle('test:yazicilar', (_e, liste) => { test.yazicilar = liste == null ? null : sahteYazicilariCoz(liste); return true; });

  /** İsteği gönderen pencereden yazıcı listesi (test örneğinde sahte liste verilmişse o). */
  const yazicilar = (e) => (test?.yazicilar ? sahteListe(test.yazicilar) : yazicilariOku(e.sender));
  /** Yazıcının durumu (çevrim dışı, çift taraflı, dosyaya yazar). */
  const durumlar = () => (test?.yazicilar ? sahteDurumlar(test.yazicilar) : yaziciDurumlariOku());

  ipcMain.handle('yazdir:yazicilar', async (e) => {
    try { return await yazicilar(e); } catch (h) { return { yazicilar: [], varsayilan: null, hata: hataMetni(h) }; }
  });
  ipcMain.handle('yazdir:yaziciDurumu', async () => ({ durumlar: await durumlar().catch(() => ({})) }));

  ipcMain.handle('yazdir:tercihler', async (e, istek) => {
    const ad = String(istek?.yazici || '');
    let liste = [];
    try { liste = (await yazicilar(e)).yazicilar; } catch { /* aşağıda bulunamadı */ }
    if (!ad || !liste.some((y) => y.ad === ad)) return { basarili: false, hata: 'Yazıcı bulunamadı (kaldırılmış ya da adı değişmiş olabilir).' };
    if (test) return test.diyalog('yazdir:tercihler', { yazici: ad, platform: process.platform }, { basarili: true });
    try {
      if (WIN) {
        // Yazıcının kendi "Yazdırma tercihleri" penceresi (ayrı süreç, kipsiz): kabuk yok, ad yukarıda listeden doğrulandı
        const surec = spawn(path.join(SISTEM32, 'rundll32.exe'), ['printui.dll,PrintUIEntry', '/e', '/n', ad], { detached: true, stdio: 'ignore', windowsHide: false });
        surec.on('error', (h) => console.warn('[yazdır] tercihler açılamadı:', h?.message || h));
        surec.unref();
      } else if (MAC) {
        await shell.openExternal('x-apple.systempreferences:com.apple.Print-Scan-Settings.extension');
      }
      return { basarili: true };
    } catch (h) {
      return { basarili: false, hata: 'Yazıcı tercihleri açılamadı: ' + hataMetni(h) };
    }
  });

  ipcMain.handle('yazdir:hazirla', async (e) => {
    if (aktif) return { basarili: false, hata: 'Bir yazdırma işlemi zaten sürüyor. Önce onu bitirin ya da iptal edin.' };
    const id = `${Date.now().toString(36)}-${process.pid}-${++sayac}`;
    const klasor = path.join(kokKlasor(), `yazdir-${id}`);
    try {
      await fs.promises.mkdir(klasor, { recursive: true });
    } catch (h) {
      return { basarili: false, hata: 'Geçici yazdırma klasörü oluşturulamadı: ' + hataMetni(h) };
    }
    if (aktif) { fs.promises.rm(klasor, { recursive: true, force: true }).catch(() => {}); return { basarili: false, hata: 'Bir yazdırma işlemi zaten sürüyor. Önce onu bitirin ya da iptal edin.' }; }   // klasör kurulurken başka pencere başlattı
    const is = aktif = { id, klasor, asama: 'hazirlik', sayfaSayisi: 0, toplamBayt: 0, pencere: null, bitir: null, iptalEdildi: false, sahipBirak: null };
    // İşi başlatan pencere hazırlık sürerken kapanırsa ya da arayüz süreci çökerse iş bırakılır (0.1.19: birden çok pencere; yoksa
    // öteki pencereler PDEfe kapanana dek yazdıramazdı). Yazdırma aşamasında pencerenin kapanışını yazdir() izler.
    const sahip = e?.sender;
    if (sahip && !sahip.isDestroyed?.()) {
      const sahipGitti = () => { if (aktif === is && is.asama === 'hazirlik') { iptalEt(is); isiBitir(is).catch(() => {}); } };
      sahip.once('destroyed', sahipGitti);
      sahip.once('render-process-gone', sahipGitti);
      is.sahipBirak = () => { try { if (!sahip.isDestroyed()) { sahip.removeListener('destroyed', sahipGitti); sahip.removeListener('render-process-gone', sahipGitti); } } catch { /* yok say */ } };
    }
    return { basarili: true, is: id, klasor };
  });

  ipcMain.handle('yazdir:sayfaEkle', async (_e, istek) => {
    const is = aktif;
    const { is: id, sira, veri, bicim } = istek || {};
    if (!is || is.id !== id) return { basarili: false, hata: 'Yazdırma işi bulunamadı ya da iptal edildi.' };
    if (is.asama !== 'hazirlik') return { basarili: false, hata: 'Yazdırma zaten başladı; sayfa eklenemez.' };
    if (!Number.isInteger(sira) || sira < 1 || sira > EN_FAZLA_SAYFA) return { basarili: false, hata: `Geçersiz sayfa sırası (1–${EN_FAZLA_SAYFA}).` };
    const uzanti = BICIM_UZANTI[String(bicim || 'jpeg').toLowerCase()];
    if (!uzanti) return { basarili: false, hata: 'Desteklenmeyen görüntü biçimi: ' + bicim };
    if (typeof veri !== 'string' || !veri) return { basarili: false, hata: `Sayfa ${sira} için görüntü verisi boş.` };
    let tampon;
    try { tampon = Buffer.from(veri, 'base64'); } catch (e) { return { basarili: false, hata: `Sayfa ${sira} görüntüsü çözülemedi: ` + hataMetni(e) }; }
    if (!tampon.length) return { basarili: false, hata: `Sayfa ${sira} görüntüsü çözülemedi (boş veri).` };
    if (tampon.length > EN_BUYUK_SAYFA_BAYT) return { basarili: false, hata: `Sayfa ${sira} görüntüsü çok büyük (${mb(tampon.length)} MB).` };
    if (is.toplamBayt + tampon.length > EN_BUYUK_TOPLAM_BAYT) return { basarili: false, hata: `Yazdırılacak veri çok büyük (${mb(is.toplamBayt)} MB üstü). Daha az sayfa seçin.` };
    const dosya = `s${String(sira).padStart(4, '0')}.${uzanti}`;
    try {
      await fs.promises.writeFile(path.join(is.klasor, dosya), tampon);
    } catch (e) {
      return { basarili: false, hata: `Sayfa ${sira} diske yazılamadı: ` + hataMetni(e) };
    }
    if (aktif !== is) return { basarili: false, hata: 'Yazdırma işi iptal edildi.' };   // yazım sırasında iptal geldi
    is.sayfaSayisi++;
    is.toplamBayt += tampon.length;
    return { basarili: true, dosya, bayt: tampon.length, toplamBayt: is.toplamBayt };
  });

  ipcMain.handle('yazdir:baslat', async (e, istek) => {
    const is = aktif;
    const { is: id, html, secenekler } = istek || {};
    if (!is || is.id !== id) return { basarili: false, hata: 'Yazdırma işi bulunamadı ya da iptal edildi.' };
    if (is.asama !== 'hazirlik') return { basarili: false, hata: 'Bu yazdırma işi zaten başlatıldı.' };
    is.asama = 'yazdirma';
    try {
      return await yazdir({ BrowserWindow, pencereAl: () => pencereAl?.(e) || null, test, durumlar }, is, { html, secenekler });   // sahip: yazdıran pencere
    } catch (e) {
      return { basarili: false, hata: hataMetni(e) };
    } finally {
      await isiBitir(is);
    }
  });

  ipcMain.handle('yazdir:iptal', async (_e, istek) => {
    const id = istek && istek.is;
    const is = aktif;
    if (!is || (id != null && is.id !== id)) return false;
    iptalEt(is);
    if (is.asama === 'hazirlik') await isiBitir(is);
    return true;
  });

  ipcMain.handle('yazdir:durum', () => ({ suruyor: !!aktif, asama: aktif ? aktif.asama : 'yok' }));

  app.once('will-quit', () => {
    const is = aktif;
    if (!is) return;
    iptalEt(is);
    try { fs.rmSync(is.klasor, { recursive: true, force: true }); } catch { /* Temp temizliğine kalır */ }
    aktif = null;
  });

  eskiIsleriTemizle().catch(() => { /* yalnızca bakım */ });
}

// ---------------------------------------------------------------- yazıcılar
/** Electron'un yazıcı listesi + varsayılan yazıcı. */
async function yazicilariOku(wc) {
  const [liste, varsayilan] = await Promise.all([
    wc.getPrintersAsync().catch(() => []),
    varsayilanYaziciOku().catch(() => null),
  ]);
  const yazicilar = yaziciListesiHazirla(liste, varsayilan);
  return { yazicilar, varsayilan: yazicilar.find((y) => y.varsayilan)?.ad ?? null };
}

/** Varsayılan yazıcının adı: Windows'ta kayıt defterinden (~35 ms; Electron'un listesinde bu bilgi yok), macOS'ta lpstat -d. */
function varsayilanYaziciOku() {
  return new Promise((coz) => {
    if (WIN) {
      // reg.exe tam yoluyla: çıplak ad sürecin çalışma klasöründe aranabilirdi (anaSurec.js progIdOku ile aynı)
      execFile(path.join(SISTEM32, 'reg.exe'), ['query', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows', '/v', 'Device'],
        { windowsHide: true, timeout: 5000 }, (hata, cikti) => coz(hata ? null : varsayilanYaziciCoz(cikti)));
    } else if (MAC) {
      execFile('/usr/bin/lpstat', ['-d'], { timeout: 5000, env: { ...process.env, LANG: 'C', LC_ALL: 'C' } }, (hata, cikti) => coz(hata ? null : lpstatCoz(cikti)));
    } else {
      coz(null);
    }
  });
}

let durumOnbellegi = null;   // { zaman, soz }
/** Windows'ta yazıcıların durumu (Win32_Printer; PowerShell ~1 sn). Kısa süre önbellekte; hata ya da başka sistemde {}. */
function yaziciDurumlariOku() {
  if (!WIN) return Promise.resolve({});
  if (durumOnbellegi && Date.now() - durumOnbellegi.zaman < DURUM_OMRU_MS) return durumOnbellegi.soz;
  const komut = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; '
    + 'Get-CimInstance -ClassName Win32_Printer | Select-Object Name, Default, WorkOffline, PrinterStatus, ExtendedPrinterStatus, PortName, CapabilityDescriptions | ConvertTo-Json -Compress -Depth 3';
  const soz = new Promise((coz) => {
    execFile(path.join(SISTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', komut],
      { windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (hata, cikti) => coz(hata ? {} : yaziciDurumlariniCoz(cikti)));
  });
  durumOnbellegi = { zaman: Date.now(), soz };
  soz.then((d) => { if (!Object.keys(d).length && durumOnbellegi?.soz === soz) durumOnbellegi = null; });   // başarısız sorgu önbellekte kalmasın
  return soz;
}

/** PDEFE_TEST_YAZICILAR / test:yazicilar: "1" ya da boş olmayan herhangi bir değer dışı JSON → yerleşik liste; JSON dizi → o liste. */
function sahteYazicilariCoz(deger) {
  if (deger == null || deger === '') return null;
  if (Array.isArray(deger)) return deger;
  try { const d = JSON.parse(String(deger)); if (Array.isArray(d)) return d; } catch { /* yerleşik liste */ }
  return SAHTE_YAZICILAR;
}
function sahteListe(liste) {
  const yazicilar = yaziciListesiHazirla(liste.map((y) => ({ name: y.ad, displayName: y.gorunenAd || y.ad })), liste.find((y) => y.varsayilan)?.ad ?? null);
  return Promise.resolve({ yazicilar, varsayilan: yazicilar.find((y) => y.varsayilan)?.ad ?? null });
}
function sahteDurumlar(liste) {
  const durumlar = {};
  for (const y of liste) durumlar[y.ad] = { cevrimDisi: !!y.cevrimDisi, ciftTarafli: !!y.ciftTarafli, dosyayaYazar: !!y.dosyayaYazar, varsayilan: !!y.varsayilan };
  return new Promise((coz) => setTimeout(() => coz(durumlar), SAHTE_DURUM_GECIKMESI_MS));
}

// ---------------------------------------------------------------- iş yaşam döngüsü
function kokKlasor() { return path.join(app.getPath('temp'), 'PDEfe'); }

/** Yazdırma sürüyorsa gizli pencereyi yok eder (iş ya da Windows kutusu kapanır, print geri çağrısı iptalle döner). */
function iptalEt(is) {
  is.iptalEdildi = true;
  const p = is.pencere;
  if (p && !p.isDestroyed()) {
    try { p.destroy(); } catch { /* yok say */ }
  }
  if (is.bitir) is.bitir({ basarili: false, iptal: true });
}

/** İş klasörünü siler, aktif kaydı düşürür. */
async function isiBitir(is) {
  if (aktif === is) aktif = null;
  is.sahipBirak?.(); is.sahipBirak = null;
  const p = is.pencere;
  if (p && !p.isDestroyed()) { try { p.destroy(); } catch { /* yok say */ } }
  is.pencere = null;
  try { await fs.promises.rm(is.klasor, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
  catch { /* geçici klasör silinemedi; açılış temizliğine kalır */ }
}

/** Önceki oturumlardan kalan (çökme vb.) bir günden eski iş klasörlerini siler. */
async function eskiIsleriTemizle() {
  const kok = kokKlasor();
  let girdiler;
  try { girdiler = await fs.promises.readdir(kok, { withFileTypes: true }); } catch { return; }
  const simdi = Date.now();
  for (const g of girdiler) {
    if (!g.isDirectory() || !g.name.startsWith('yazdir-')) continue;
    const yol = path.join(kok, g.name);
    try {
      const st = await fs.promises.stat(yol);
      if (simdi - st.mtimeMs > ESKI_IS_OMRU_MS) await fs.promises.rm(yol, { recursive: true, force: true });
    } catch { /* yok say */ }
  }
}

// ---------------------------------------------------------------- yazdırma
async function yazdir({ BrowserWindow, pencereAl, test, durumlar }, is, { html, secenekler }) {
  if (typeof html !== 'string' || !html.trim()) return { basarili: false, hata: 'Yazdırılacak içerik boş.' };
  if (Buffer.byteLength(html, 'utf8') > EN_BUYUK_HTML_BAYT) return { basarili: false, hata: 'Yazdırma sayfası beklenmedik biçimde büyük. Daha az sayfa seçin.' };
  if (!is.sayfaSayisi) return { basarili: false, hata: 'Yazdırılacak sayfa görüntüsü eklenmedi.' };

  const s = secenekler || {};
  const yazdirmaSecenekleri = secenekleriHazirla(s);
  // Dosyaya yazan yazıcı (Microsoft Print to PDF, XPS) sessiz yazdırmada da "Çıktıyı Farklı Kaydet" kutusunu açar
  const dosyaKutusu = !s.sistemPenceresi && (WIN || !!test?.yazicilar) && ((await durumlar().catch(() => ({})))[s.yazici]?.dosyayaYazar ?? dosyayaYazarMi(s.yazici));

  // 1) HTML iskeleti iş klasörüne (görseller aynı klasörde, göreli yol)
  const dosya = path.join(is.klasor, 'yazdir.html');
  await fs.promises.writeFile(dosya, html, 'utf8');
  if (is.iptalEdildi) return { basarili: false, iptal: true };

  // 2) Gizli pencere: Windows kutusunun (yedek yol) sahibi bu pencere olur; ana pencerenin konumuna oturtulur ki kutu ana pencerenin
  //    ortasında açılsın.
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
  is.pencere = pencere;
  try { if (anaGecerli) pencere.setBounds(anaGecerli.getBounds()); } catch { /* önemsiz */ }

  // Ana pencere kapanırsa iş de iptal
  const anaKapandi = () => iptalEt(is);
  anaGecerli?.once('closed', anaKapandi);

  try {
    await yukle(pencere, dosya);
    if (pencere.isDestroyed() || is.iptalEdildi) return { basarili: false, iptal: true };
    if (test && !test.gercekYazdir) return await testYazdir(test, pencere, is, yazdirmaSecenekleri, { dosyaKutusu });
    return await webContentsYazdir(pencere, is, yazdirmaSecenekleri);
  } finally {
    try { anaGecerli?.removeListener('closed', anaKapandi); } catch { /* yok say */ }
    try { if (!pencere.isDestroyed()) pencere.destroy(); } catch { /* yok say */ }
    is.pencere = null;
    // Kutunun (Windows yazdırma penceresi, "Çıktıyı Farklı Kaydet") ardından Windows odağı başka bir uygulamaya verebilir. Kutusuz sessiz
    // yazdırmada odağa dokunulmaz: kullanıcı bu arada başka bir pencereye geçmiş olabilir. Test örneğinde hiç (kişinin ekranındaki odak)
    if (!test && (s.sistemPenceresi || dosyaKutusu)) {
      try { if (anaGecerli && !anaGecerli.isDestroyed() && !anaGecerli.isMinimized()) anaGecerli.focus(); } catch { /* yok say */ }
    }
  }
}

/** Test örneği: yazıcıya gitmez. Seçenekler ve yüklenen sayfa test:diyalogKaydi'na düşer; yanıt test kuyruğundan
 *  ({ basarili: true } varsayılan; { basarili: false, neden } Chromium'un hata iletisi; { iptal: true }). */
async function testYazdir(test, pencere, is, secenek, ek) {
  let sayfa = null;
  try {
    sayfa = await pencere.webContents.executeJavaScript(`(() => ({ sayfa: document.querySelectorAll('.sayfa').length, gorsel: [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length,
      kagit: (document.styleSheets[0]?.cssRules[0]?.cssText || '').replace(/\\s+/g, ' ') }))()`, true);
  } catch { /* yok say */ }
  const yanit = test.diyalog('yazdir:yazdir', { secenek, sayfaSayisi: is.sayfaSayisi, sayfa, ...ek }, { basarili: true }) || {};
  if (yanit.iptal) return { basarili: false, iptal: true };
  if (yanit.basarili === false) return /cancel/i.test(String(yanit.neden || '')) ? { basarili: false, iptal: true } : { basarili: false, hata: nedenTurkce(String(yanit.neden || '')) };
  return { basarili: true };
}

/** Geçici dosyayı yükler; did-finish-load / did-fail-load / çökme / kapanma / zaman aşımı. */
function yukle(pencere, dosya) {
  return new Promise((coz, reddet) => {
    let bitti = false;
    const bitir = (hata) => { if (bitti) return; bitti = true; clearTimeout(zaman); if (hata) reddet(hata); else coz(); };
    const zaman = setTimeout(() => bitir(new Error('Yazdırma içeriği zamanında yüklenemedi.')), YUKLEME_ZAMAN_ASIMI_MS);
    const wc = pencere.webContents;
    wc.once('did-finish-load', () => bitir(null));
    wc.once('did-fail-load', (_e, kod, aciklama) => bitir(new Error(`Yazdırma içeriği yüklenemedi (${kod}): ${aciklama}`)));
    wc.once('render-process-gone', (_e, ayrinti) => bitir(new Error('Yazdırma penceresi çöktü: ' + (ayrinti?.reason || ''))));
    pencere.once('closed', () => bitir(Object.assign(new Error('Yazdırma vazgeçildi.'), { iptal: true })));
    pencere.loadFile(dosya).catch((e) => bitir(e));
  });
}

/**
 * webContents.print() sözü. Geri çağrı hiç gelmese bile pencere kapanınca ('closed': iptal ya da
 * ana pencere kapanışı) ya da renderer çökünce çözülür; böylece 'aktif' bayrağı takılı kalmaz.
 */
function webContentsYazdir(pencere, is, secenek) {
  return new Promise((coz) => {
    let bitti = false;
    const bitir = (sonuc) => { if (!bitti) { bitti = true; is.bitir = null; coz(sonuc); } };
    is.bitir = bitir;
    pencere.once('closed', () => bitir({ basarili: false, iptal: true }));
    const wc = pencere.webContents;
    wc.once('render-process-gone', (_e, ayrinti) => bitir({ basarili: false, hata: 'Yazdırma penceresi çöktü: ' + (ayrinti?.reason || '') }));
    try {
      wc.print(secenek, (basarili, neden) => {
        if (basarili) { bitir({ basarili: true }); return; }
        const n = String(neden || '');
        if (/cancel/i.test(n) || pencere.isDestroyed()) { bitir({ basarili: false, iptal: true }); return; }
        bitir({ basarili: false, hata: nedenTurkce(n) });
      });
    } catch (e) {
      bitir({ basarili: false, hata: nedenTurkce(hataMetni(e)) });
    }
  });
}

function mb(bayt) { return (bayt / 1024 / 1024).toFixed(1).replace('.', ','); }
function hataMetni(e) { return (e && (e.message || String(e))) || 'Bilinmeyen hata'; }
