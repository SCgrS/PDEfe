// Yazdırma (ana süreç): renderer'ın sayfa sayfa gönderdiği görüntüleri geçici bir iş klasörüne
// yazar, küçük bir HTML iskeletini gizli bir pencerede yükler ve Windows yazdırma diyaloğuyla
// (silent:false) yazdırır.
//
// Neden sayfa başına dosya? Bütün belgeyi tek base64 HTML dizesi olarak taşımak V8'in
// 512 MB dize sınırına ve Chromium'un IPC ileti sınırına takılır (756 sayfa ≈ 500 MB).
// Her sayfa ayrı bir IPC iletisiyle gelir (≈0,5–1,5 MB) ve diske yazılır; HTML yalnızca
// <img src="s0001.jpg"> satırlarından oluşur, göreli yollar file:// üzerinden aynı klasörden yüklenir.
//
// Kanallar (hepsi { basarili, hata } ya da doğrudan sonuç döner; hata iletileri Türkçe):
//   'yazdir:hazirla'  {}                                   → { is: string, klasor: string }
//   'yazdir:sayfaEkle' { is, sira, veri(base64), bicim }   → { dosya: 's0001.jpg', bayt, toplamBayt }
//   'yazdir:baslat'   { is, html, secenekler: { ciftTarafli: 'tek'|'uzun'|'kisa',
//                       sayfaBoyutu: { genislikMikron, yukseklikMikron } | 'A4'|'A3'|'A5'|'Letter'|'Legal'|'Tabloid' } }
//                                                          → { basarili: true } | { basarili: false, iptal: true } | { basarili: false, hata }
//   'yazdir:iptal'    { is? }                              → true  (hazırlık aşamasında klasörü siler; diyalog
//                                                             açıkken gizli pencereyi yok eder → diyalog kapanır)
//   'yazdir:durum'    {}                                   → { suruyor: boolean, asama: 'yok'|'hazirlik'|'yazdirma' }
//
// Aynı anda tek iş yürür. İş klasörü: app.getPath('temp')/PDEfe/yazdir-<zaman>-<pid>/ ; iş bitince,
// iptal edilince, ana pencere kapanınca ve uygulama çıkarken silinir. Önceki oturumlardan kalan
// (çökme vb.) bir günden eski iş klasörleri açılışta temizlenir.
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

const EN_BUYUK_HTML_BAYT = 32 * 1024 * 1024;          // HTML artık yalnızca iskelet; 32 MB üstü bozukluk işaretidir
const EN_BUYUK_SAYFA_BAYT = 64 * 1024 * 1024;         // tek sayfa görüntüsü (200 dpi A3 PNG bile 20 MB'ı geçmez)
const EN_BUYUK_TOPLAM_BAYT = 4 * 1024 * 1024 * 1024;  // iş başına disk kullanımı (≈ 3000 taranmış sayfa)
const EN_FAZLA_SAYFA = 5000;
const YUKLEME_ZAMAN_ASIMI_MS = 300_000;               // binlerce görselin çözülmesi uzun sürebilir
const ESKI_IS_OMRU_MS = 24 * 60 * 60 * 1000;

const CIFT_TARAFLI = { tek: 'simplex', uzun: 'longEdge', kisa: 'shortEdge' };
const STANDART_BOYUTLAR = new Set(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid']);
const BICIM_UZANTI = { jpeg: 'jpg', jpg: 'jpg', png: 'png' };

/** @type {{ id: string, klasor: string, asama: 'hazirlik'|'yazdirma', sayfaSayisi: number, toplamBayt: number, pencere: any, bitir: Function|null, iptalEdildi: boolean, sahipBirak: Function|null } | null} */
let aktif = null;
let sayac = 0;

/**
 * Yazdırma IPC işleyicilerini kurar.
 * @param {{ ipcMain: Electron.IpcMain, BrowserWindow: typeof Electron.BrowserWindow, pencereAl: (e: Electron.IpcMainInvokeEvent) => Electron.BrowserWindow|null }} p
 *   pencereAl: isteği gönderen uygulama penceresi (birden çok pencere olabilir)
 */
export function yazdirmaKur({ ipcMain, BrowserWindow, pencereAl }) {
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
      return await yazdir({ BrowserWindow, pencereAl: () => pencereAl?.(e) || null }, is, { html, secenekler });   // diyaloğun sahibi: yazdıran pencere
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

// ---------------------------------------------------------------- iş yaşam döngüsü
function kokKlasor() { return path.join(app.getPath('temp'), 'PDEfe'); }

/** Diyalog açıksa gizli pencereyi yok eder (diyalog kapanır, print geri çağrısı iptalle döner). */
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
async function yazdir({ BrowserWindow, pencereAl }, is, { html, secenekler }) {
  if (typeof html !== 'string' || !html.trim()) return { basarili: false, hata: 'Yazdırılacak içerik boş.' };
  if (Buffer.byteLength(html, 'utf8') > EN_BUYUK_HTML_BAYT) return { basarili: false, hata: 'Yazdırma sayfası beklenmedik biçimde büyük. Daha az sayfa seçin.' };
  if (!is.sayfaSayisi) return { basarili: false, hata: 'Yazdırılacak sayfa görüntüsü eklenmedi.' };

  const yazdirmaSecenekleri = secenekleriHazirla(secenekler || {});

  // 1) HTML iskeleti iş klasörüne (görseller aynı klasörde, göreli yol)
  const dosya = path.join(is.klasor, 'yazdir.html');
  await fs.promises.writeFile(dosya, html, 'utf8');
  if (is.iptalEdildi) return { basarili: false, iptal: true };

  // 2) Gizli pencere: diyaloğun sahibi bu pencere olur; ana pencerenin konumuna oturtulur ki
  //    Windows diyaloğu ana pencerenin ortasında açılsın.
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
    const sonuc = await webContentsYazdir(pencere, is, yazdirmaSecenekleri);
    return sonuc;
  } finally {
    try { anaGecerli?.removeListener('closed', anaKapandi); } catch { /* yok say */ }
    try { if (!pencere.isDestroyed()) pencere.destroy(); } catch { /* yok say */ }
    is.pencere = null;
    // Diyaloğun sahibi gizli pencereydi; kapanınca Windows odağı başka bir uygulamaya verebilir
    try { if (anaGecerli && !anaGecerli.isDestroyed() && !anaGecerli.isMinimized()) anaGecerli.focus(); } catch { /* yok say */ }
  }
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
      bitir({ basarili: false, hata: hataMetni(e) });
    }
  });
}

/** Electron/Chromium'un İngilizce yazdırma hatalarını Türkçeye çevirir. */
function nedenTurkce(neden) {
  if (!neden) return 'Yazdırma başarısız oldu.';
  if (/no printers|printer not found|no valid printers|printer_not_found/i.test(neden)) return 'Kurulu yazıcı bulunamadı. Windows Ayarlar > Yazıcılar ve tarayıcılar bölümünden bir yazıcı ekleyin.';
  if (/invalid printer settings|invalid settings|invalid_settings/i.test(neden)) return 'Yazıcı ayarları geçersiz. Sayfa boyutu ya da çift taraflı seçeneği bu yazıcıda desteklenmiyor olabilir.';
  if (/print job failed|^failed$/i.test(neden)) return 'Yazdırma işi başarısız oldu. Yazıcının açık ve bağlı olduğundan emin olun.';
  if (/failed to print|printing failed/i.test(neden)) return 'Yazdırma işi başarısız oldu. Yazıcının açık ve bağlı olduğundan emin olun.';
  if (/access denied|permission/i.test(neden)) return 'Yazıcıya erişim izni verilmedi.';
  if (/out of memory|oom/i.test(neden)) return 'Yazdırma için yeterli bellek yok. Daha az sayfa seçin.';
  return `Yazdırma başarısız oldu (yazıcı yanıtı: ${neden}).`;
}

function mb(bayt) { return (bayt / 1024 / 1024).toFixed(1).replace('.', ','); }
function hataMetni(e) { return (e && (e.message || String(e))) || 'Bilinmeyen hata'; }
