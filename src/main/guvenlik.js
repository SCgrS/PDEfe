// Ana süreç güvenlik yardımcıları (0.1.23, güvenlik denetimi). Arayüz (renderer) yalıtılmış çalışır: sandbox, contextIsolation, sıkı
// CSP; PDF içindeki JavaScript çalışmaz. Buradaki denetimler bir katman daha ekler: PDF'i çizen bileşende ileride bir açık çıkıp arayüzde
// kod çalışsa bile ana süreç her dosyayı okuyup silmez, program çalıştırmaz, uygulamanın dışındaki bir sayfaya köprü (preload) açmaz.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAC = process.platform === 'darwin';

/** Dışarıda (tarayıcıda, e-posta uygulamasında) açılabilecek adres türleri. shell.openExternal adresi Windows'ta ShellExecute'a verir:
 *  file:, search-ms:, ms-…: gibi türler program çalıştırabilir, uzak ağ paylaşımına bağlanıp Windows oturumunun parola özetini
 *  gönderebilir. PDF'teki bağlantılar güvenilmeyen girdidir. */
const DIS_TURLER = new Set(['http:', 'https:', 'mailto:']);

/** Adres dışarıda açılabilir mi (yalnızca http, https, mailto; büyük/küçük harf fark etmez). */
export function disAdresMi(adres) {
  try { return DIS_TURLER.has(new URL(String(adres)).protocol); } catch { return false; }
}

// ---------------------------------------------------------------- IPC: yalnızca uygulamanın kendi sayfaları
const UYGULAMA_KOKU = 'pdefe://app/';

/** IPC isteği uygulamanın kendi sayfasından mı geldi (pdefe://app/…; çerçevesi kapanmış istek sayılmaz). */
export function uygulamaSayfasiMi(e) {
  try { return String(e?.senderFrame?.url || '').startsWith(UYGULAMA_KOKU); } catch { return false; }
}

/** ipcMain'in yerine geçen sarmalayıcı (handle / on): uygulamanın sayfası dışından gelen istek işlenmez, handle reddedilir. Bütün
 *  modüllere ipcMain yerine bu verilir (main.js). */
export function guvenliIpc(ipcMain) {
  return {
    handle(kanal, isleyici) {
      ipcMain.handle(kanal, (e, ...a) => {
        if (!uygulamaSayfasiMi(e)) throw new Error('İzin verilmeyen istek.');
        return isleyici(e, ...a);
      });
    },
    on(kanal, dinleyici) {
      ipcMain.on(kanal, (e, ...a) => { if (uygulamaSayfasiMi(e)) dinleyici(e, ...a); });
    },
  };
}

/** Bütün webContents'lerde uygulama dışına gezinme ve gömülü sayfa (webview) engellenir. Yazdırma penceresi geçici HTML'i ana süreçten
 *  loadFile ile yükler (bu bir gezinme olayı değildir); sayfanın kendisi başka yere gidemez. Bir sayfa (bağlantı, form, location)
 *  pdefe://app/ dışına gitmeye kalkarsa durdurulur: önyükleme köprüsü (preload) başka bir sayfaya açılmasın. */
export function gezinmeKorumasiKur(app) {
  app.on('web-contents-created', (_e, wc) => {
    const engelle = (olay, url) => { if (!String(url || '').startsWith(UYGULAMA_KOKU)) olay.preventDefault(); };
    wc.on('will-navigate', (olay, url) => engelle(olay, url));
    wc.on('will-frame-navigate', (olay) => engelle(olay, olay.url));
    wc.on('will-redirect', (olay, url) => engelle(olay, url));
    wc.on('will-attach-webview', (olay) => olay.preventDefault());
  });
}

// ---------------------------------------------------------------- dosya yolları
/** Sistemin yazı tipi klasörleri (renderer/yaziTipleri.js gömülü olmayan standart yazı tiplerini buradan okur): Windows'ta Windows\Fonts;
 *  macOS'ta (0.2.0) sistemle gelen Arial / Times New Roman / Courier New'ün klasörü (Supplemental), sistem ve kullanıcı yazı tipleri. */
export function yaziTipiKlasorleri() {
  if (MAC) return ['/System/Library/Fonts/Supplemental', '/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts')];
  return [path.join(process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows', 'Fonts')];
}

// PDF.js'in gömülü olmayan standart fontları (Times, Helvetica, Courier) yerine okunan sistem fontları: anahtar Windows dosya adı
// (renderer/yaziTipleri.js STANDART_DOSYALAR), değer macOS'taki dosya adı (Supplemental klasöründe)
const MAC_STANDART = {
  'times.ttf': 'Times New Roman.ttf', 'timesbd.ttf': 'Times New Roman Bold.ttf', 'timesi.ttf': 'Times New Roman Italic.ttf',
  'timesbi.ttf': 'Times New Roman Bold Italic.ttf', 'arial.ttf': 'Arial.ttf', 'arialbd.ttf': 'Arial Bold.ttf', 'ariali.ttf': 'Arial Italic.ttf',
  'arialbi.ttf': 'Arial Bold Italic.ttf', 'cour.ttf': 'Courier New.ttf', 'courbd.ttf': 'Courier New Bold.ttf', 'couri.ttf': 'Courier New Italic.ttf',
  'courbi.ttf': 'Courier New Bold Italic.ttf',
};

/** Standart fontların bu sistemdeki tam yolları: { 'times.ttf': '<yol>', … } (uygulama:klasorler → renderer/yaziTipleri.js). */
export function standartYaziTipleri() {
  const [klasor] = yaziTipiKlasorleri();
  return Object.fromEntries(Object.entries(MAC_STANDART).map(([win, mac]) => [win, path.join(klasor, MAC ? mac : win)]));
}

const ayniYol = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Yol sistemin yazı tipi klasörlerinden birinde bir yazı tipi dosyası mı (alt klasör yok). */
export function yaziTipiDosyasiMi(yol) {
  const y = String(yol || '');
  return !!y && /\.(ttf|ttc|otf)$/i.test(y) && yaziTipiKlasorleri().some((k) => ayniYol(path.dirname(path.resolve(y)), k));
}

/** Dosyanın başında (ilk 64 KB; başına e-posta ağ geçidi gibi araçların eklediği başlıklar olabilir) PDF imzası (%PDF-) var mı.
 *  Dosya okunamazsa (yok, başka programda kilitli) hata fırlatır: çağıran olağan okuma hatasını göstersin, "PDF değil" demesin. */
export async function pdfDosyasiMi(yol) {
  const fh = await fs.promises.open(String(yol), 'r');
  try {
    const bas = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fh.read(bas, 0, bas.length, 0);
    return bas.subarray(0, bytesRead).includes('%PDF-');
  } finally { await fh.close().catch(() => {}); }
}

/** macOS paket uzantıları: Finder bu klasörleri tek dosya gibi gösterir; uygulama, eklenti, kurulum paketi… */
const PAKET_UZANTILARI = /\.(app|appex|bundle|framework|plugin|kext|prefpane|saver|workflow|xpc|qlgenerator|mdimporter|pkg|mpkg)$/i;

/** Klasör bir macOS paketi mi (0.2.1): uygulama paketi (.app) de klasördür ve shell.openPath (NSWorkspace) onu açınca uygulamayı başlatır;
 *  kabuk:klasorAc'ın "yalnızca klasör" sınırı Mac'te program başlatmayı engellemiyordu. Yol (bağlantıysa gösterdiği yer) paket uzantısıyla
 *  bitiyorsa ya da içinde Contents/Info.plist varsa true. */
export async function paketKlasoruMu(yol) {
  const y = String(yol || '').replace(/(.)[\\/]+$/, '$1');
  const gercek = await fs.promises.realpath(y).catch(() => y);
  if (PAKET_UZANTILARI.test(y) || PAKET_UZANTILARI.test(gercek)) return true;
  return fs.promises.access(path.join(gercek, 'Contents', 'Info.plist')).then(() => true, () => false);
}

/** Yol, anlık kopya klasöründeki bir anlık kopya mı (çekirdeğin adlandırması: 32 onaltılık karakter + .pdf). */
export function anlikDosyasiMi(yol, anlikKlasor) {
  const y = String(yol || '');
  return !!y && ayniYol(path.dirname(path.resolve(y)), anlikKlasor) && /^[0-9a-f]{32}\.pdf$/i.test(path.basename(y));
}

/** Hedef verilmezse yol'a (açık belgenin kendisine) yazan çekirdek yöntemleri (0.2.1); ayir yalnızca uzerine ile. Bu yöntemler hedefsiz
 *  de denetlenir (main.js cekirdek:cagir). */
export const YOLA_YAZANLAR = new Set(['notlar_kaydet', 'yapisal_kaydet', 'sayfalar_uygula', 'kucult', 'dondur_kaydet', 'ayir']);

/** Dosya Formatını Değiştir'in çekirdek yöntemleri (0.2.6, core/islemler/donustur.py): parametreleri her zaman denetlenir. */
export const DONUSUM_YONTEMLERI = new Set(['donusum_yetenekleri', 'donusum_bilgi', 'bicim_donustur']);

/** Parametreleri hedef verilmese de denetlenen yöntemler (main.js cekirdek:cagir). */
export const DENETLENEN_YONTEMLER = new Set([...YOLA_YAZANLAR, ...DONUSUM_YONTEMLERI, 'anlik_sil']);

/** bicim_donustur: hedef biçime göre izinli uzantılar (çekirdeğin HEDEF_UZANTILARI ile aynı; Word hedefi .docx). */
export const HEDEF_UZANTILARI = { pdf: ['.pdf'], udf: ['.udf'], tiff: ['.tif', '.tiff'], word: ['.docx'] };
const EN_FAZLA_OGE = 500;
const TIFF_DPILERI = new Set([200, 300]);
const TIFF_RENKLERI = new Set(['sb', 'gri', 'renkli']);
const UDF_KIPLERI = new Set(['otomatik', 'pdf', 'yazici']);

/** Klasör var mı (bağlantıysa gösterdiği yer). */
async function klasorMu(yol) {
  if (typeof yol !== 'string' || !yol.trim()) return false;
  const st = await fs.promises.stat(yol).catch(() => null);
  return !!st?.isDirectory();
}

const izinYok = () => new Error('İzin verilmeyen istek.');
const dolu = (s) => typeof s === 'string' && s.trim().length > 0 && !s.includes('\0');

/**
 * Dosya Formatını Değiştir'in parametreleri (0.2.6). Çekirdek de denetler; bu katman, arayüzde kod çalışsa bile çekirdeğin .bat / .cmd / .exe
 * gibi bir dosyaya yazmamasını ve kullanıcının seçmediği bir klasördeki programı çalıştırmamasını sağlar.
 *  - udeYolu: arayüzün verdiği yok sayılır; ana sürecin ayarındaki klasör (yalnızca ana sürecin klasör seçme penceresinden yazılır,
 *    main.js ayar:udeKlasoruSec) var olan bir klasörse o, değilse null (çekirdek UYAP Doküman Editörü'nü kendisi arar). Çekirdek bu
 *    klasördeki Java'yı çalıştırır: arayüz başka bir klasörü gösterememeli.
 *  - donusum_bilgi: yol dolu bir metin, onizleme mantıksal değer, genislik 16–1024.
 *  - bicim_donustur: ogeler en çok 500 öğe; her öğede yol (okunacak girdi) ve hedef dolu metin, hedefBicim bilinen biçim ve hedefin
 *    uzantısı biçimle eşleşmeli (pdf → .pdf, udf → .udf, tiff → .tif / .tiff, word → .docx); secenekler yalnızca bilinen anahtarlar ve
 *    değerler (dpi 200 | 300, renk sb | gri | renkli, kip otomatik | pdf | yazici; bilinmeyen anahtarlar atılır). Uyuşmazlıkta istek reddedilir.
 */
async function donusumParametreleri(yontem, p, { udeYolu = null } = {}) {
  p.udeYolu = (await klasorMu(udeYolu)) ? udeYolu : null;
  if (yontem === 'donusum_bilgi') {
    if (!dolu(p.yol)) throw izinYok();
    p.onizleme = p.onizleme == null ? true : p.onizleme === true;
    if (p.genislik != null) { const g = Math.round(Number(p.genislik)); p.genislik = Number.isFinite(g) ? Math.max(16, Math.min(1024, g)) : 220; }
  }
  if (yontem === 'bicim_donustur') {
    if (!Array.isArray(p.ogeler) || !p.ogeler.length || p.ogeler.length > EN_FAZLA_OGE) throw izinYok();
    p.ogeler = p.ogeler.map((o) => {
      if (!o || typeof o !== 'object' || Array.isArray(o) || !dolu(o.yol) || !dolu(o.hedef)) throw izinYok();
      const uzantilar = Object.prototype.hasOwnProperty.call(HEDEF_UZANTILARI, o.hedefBicim) ? HEDEF_UZANTILARI[o.hedefBicim] : null;
      if (!uzantilar) throw izinYok();
      if (!uzantilar.includes(path.extname(o.hedef).toLowerCase())) throw new Error(`Hedef dosyanın uzantısı ${uzantilar.join(' ya da ')} olmalı.`);
      const s = o.secenekler && typeof o.secenekler === 'object' && !Array.isArray(o.secenekler) ? o.secenekler : {};
      const secenekler = {};
      if (s.dpi != null) { if (!TIFF_DPILERI.has(s.dpi)) throw izinYok(); secenekler.dpi = s.dpi; }
      if (s.renk != null) { if (!TIFF_RENKLERI.has(s.renk)) throw izinYok(); secenekler.renk = s.renk; }
      if (s.kip != null) { if (!UDF_KIPLERI.has(s.kip)) throw izinYok(); secenekler.kip = s.kip; }
      return { yol: o.yol, hedef: o.hedef, hedefBicim: o.hedefBicim, secenekler };
    });
  }
  return p;
}

/**
 * Çekirdek çağrısının parametreleri (renderer'dan gelir) denetlenir, gerekirse düzeltilir; izin verilmeyen çağrıda hata fırlatır.
 *  - yazılacak dosya (hedef; hedef verilmezse YOLA_YAZANLAR'da yol): çekirdek yalnızca .pdf uzantılı dosyaya ya da zaten var olan bir PDF'in
 *    üzerine (uzantısı başka olsa da: "Tüm dosyalar" süzgeciyle açılıp kaydedilen belge) yazar. PDF baytları .bat/.cmd gibi bir dosyaya
 *    yazılıp çalıştırılmasın: notun /Contents'indeki "&komut&" komut satırında çalışırdı. 0.2.1: önceden yalnızca hedef denetleniyordu;
 *    yapisal_kaydet ve sayfalar_uygula hedefsiz çağrılınca var olması gerekmeyen yol'a yazıyordu.
 *  - yapisal_kaydet: anlık kopyanın klasörünü ana süreç verir (renderer'ın verdiği yok sayılır).
 *  - anlik_sil: yalnızca anlık kopya klasöründeki anlık kopyalar silinir.
 *  - Dosya Formatını Değiştir'in yöntemleri (0.2.6): donusumParametreleri. ana.udeYolu: ana sürecin ayarındaki UYAP Doküman Editörü klasörü.
 */
export async function cekirdekParametreleri(yontem, params, anlikKlasor, ana = {}) {
  const p = params && typeof params === 'object' && !Array.isArray(params) ? { ...params } : {};
  const yazilacak = p.hedef != null ? p.hedef : (YOLA_YAZANLAR.has(yontem) && (yontem !== 'ayir' || p.uzerine) ? p.yol : null);
  if (yazilacak != null && !/\.pdf$/i.test(String(yazilacak)) && !(await pdfDosyasiMi(yazilacak).catch(() => false))) {
    throw new Error('Yalnızca .pdf uzantılı dosyaya yazılabilir.');
  }
  if (yontem === 'yapisal_kaydet') p.anlikKlasor = anlikKlasor;
  if (yontem === 'anlik_sil' && !anlikDosyasiMi(p.yol, anlikKlasor)) throw new Error('İzin verilmeyen istek.');
  if (DONUSUM_YONTEMLERI.has(yontem)) return donusumParametreleri(yontem, p, ana);
  return p;
}
