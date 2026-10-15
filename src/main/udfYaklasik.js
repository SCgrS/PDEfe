// UDF'nin yaklaşık çizimi (0.2.6, Dosya Formatını Değiştir). UDF → PDF'in birincil yolu bilgisayardaki UYAP Doküman Editörü'nün (UDE) kendi
// sayfalayıcısıdır (core/islemler/udf.py). UDE bulunamadığında (ya da onunla dönüştürme bu bilgisayarda yapılamadığında) araç bu yedek yolu
// kullanır; sonuçta "görünüm yaklaşık" uyarısı verilir: satır ve sayfa kırılımları UDE'ninki değil Chromium'unkidir.
//
// Nasıl: ana süreç .udf'yi kendisi okur ve denetler (guvenlik.js udfDosyasiOku: boyut, zip'in merkezî dizini, düz XML; arayüzün dosya:oku'su
// değişmedi). Gizli (show: false), yalıtılmış (sandbox), Node erişimi ve ön yükleme betiği olmayan, iletişim kutusu açamayan (disableDialogs) bir pencere, ayrı bir
// bellek içi oturumda (BOLUM) pdefe://udf-cizim/sayfa.html'i yükler (src/udf-cizim). Baytlar base64 dilimleriyle executeJavaScript üzerinden
// verilir; sayfa belgeyi Drive UDF Okuyucu'nun motoruyla kurar (udf-motoru.js: belge içeriği HTML olarak işlenmez, XML'de DTD ve varlık
// tanımı reddedilir, açılan baytlar sayılır). Sayfa boyu, kenarlar, üst / alt bilgi ve sayfa numarası UDF'nin pageFormat'ından (@page);
// webContents.printToPDF (preferCSSPageSize) sayfaları yazdırma kâğıdına göre böler. Oturumun sayfası ağa ve dosyalara çıkamaz, başka bir
// sayfaya gidemez, pencere açamaz, izin isteyemez, dosya indiremez. Gizli pencere iş bitince, hata, iptal ya da zaman aşımında yok edilir.
// Çizimler sırayla yapılır (tek gizli pencere); dönüştürme, bekleyen küçük resimlerin önüne geçer.
//
// Kanallar (renderer/araclar/donustur.js; parametreler guvenlik.js udfYaklasikParametreleri). Geçici dosyaların yolu arayüze verilmez:
//   'udf:yaklasikBilgi'    { yol, genislik?, istekId? } → { sayfa, png, pngGenislik, pngYukseklik, genislik, yukseklik, uyari? }   (satırın küçük
//        resmi: yaklaşık PDF'in ilk sayfası, çekirdeğin donusum_bilgi'siyle; sonuç dosyanın boyutu ve değişme zamanıyla ön bellekte)
//   'udf:yaklasikDonustur' { ogeler: [{ yol, hedef, hedefBicim: 'pdf' | 'tiff' | 'word' | 'gorsel', secenekler?, cakisma? }], istekId? }
//        → { sonuclar: [{ yol, hedef, hedefBicim, kaynakTur: 'udf', boyut, sayfa, uyari?, yaklasik: true, hedefler?, istenenHedef? } | { yol, hedef,
//            hedefBicim, hata, kod, hedefler? }], basarili, hatali } | { iptal: true } (iptal yerine koymadan önce geldi: hiçbir dosya yazılmadı)
//        0.2.7: JPG hedefi (gorsel; çok sayfada "<ad> - Sayfa n.jpg", sonucun hedefler'i) ve cakisma: 'yeniAd' (hedef varsa "<ad> (1)"; sonucun
//        hedef'i yazılan ad, istenenHedef istenen) çekirdeğinkiyle aynı.
//        Her öğe önce %TEMP%\PDEfe'de geçici PDF'e çizilir. Bütün öğeler çizilince TIFF / Word / JPG hedefleri çekirdeğin bicim_donustur'una verilir
//        (PDF → TIFF / Word / JPG; çekirdek kendi hedeflerini yerine koyar), sonra PDF hedefleri yerine konur (hedefin yanına kopya
//        "<hedef>.<pid>-y<sıra>.pdefe-tmp.pdf", ardından rename; 0.2.6'dan beri çizim sürerken hedef klasörde geçici dosya yok). Çekirdek iptalden önce bitirmişse (geç iptal) onun yazdığı
//        dosyalar sonuçta kalır, PDF hedefleri yazılmaz; araç geç iptalde yeni oluşan dosyaları çöp kutusuna gönderir (Birleştir'deki kural).
//        İlerleme 'udf:yaklasikIlerleme' (istekId, { yuzde, mesaj }) ile isteyen pencereye; sonuçların uyarısı motorun notlarıdır (resim,
//        yorum, kesilen kısım; e-imza uyarısı 0.2.7'de kalktı), "görünüm yaklaşık" uyarısını araç ekler.
//   'udf:yaklasikIptal'    { istekId } → true | false   (dönüştürmeyi ya da istekId'li küçük resmi iptal eder)
// İsteyen pencere kapanırsa onun işleri iptal edilir; uygulama kapanırken gizli pencereler yok edilir, geçici dosyalar silinir.
import { app, BrowserWindow, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { udfDosyasiOku, udfYaklasikParametreleri } from './guvenlik.js';

const BOLUM = 'pdefe-udf-cizim';               // bellek içi oturum ("persist:" ön eki yok: diske hiçbir şey yazılmaz)
const KAYNAK = 'pdefe://udf-cizim/';
const SAYFA_DOSYALARI = Object.freeze({ 'sayfa.html': 'text/html; charset=utf-8', 'udf-motoru.js': 'text/javascript; charset=utf-8', 'cizim.js': 'text/javascript; charset=utf-8' });
// sayfa.html'deki meta etiketiyle aynı; yanıt üst bilgisi olarak da verilir
const CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src blob:; font-src 'none'; connect-src 'none'; media-src 'none'; "
  + "object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
const DILIM = 3 * 1024 * 1024;                   // base64 dilimi (3'ün katı: dilimler ayrı ayrı çözülür)
const YUKLEME_MS = 20_000;
const CIZIM_MS = 60_000, CIZIM_MS_MB = 6_000;    // motorun kendi okuma sınırı 8 sn; çizim ve resimlerin çözülmesi belgeyle uzar
const PDF_MS = 120_000;
const ONBELLEK = 32;                             // küçük resim sonuçları
const ESKI_GECICI_MS = 24 * 3600 * 1000;
const CIZIM_PAYI = { tek: 95, zincir: 40 };      // yüzde: çizim (gerisi zincirde çekirdek, tekte yerine koyma)
const MAC = process.platform === 'darwin';

const iptalHatasi = () => Object.assign(new Error('İptal edildi.'), { iptal: true, kod: 'iptal' });
const kodlu = (kod, ileti) => Object.assign(new Error(ileti), { kod });
const hataMetni = (e) => (e && (e.message || String(e))) || 'Bilinmeyen hata';

/** Motorun hata kodları (udf-motoru.js UdfHatasi) → çekirdeğin kodları ve PDEfe'nin iletileri (motorun iletileri tarayıcı eklentisi içindir). */
const MOTOR_HATALARI = {
  zip: ['bozuk', 'Dosya açılamadı: bozuk ya da UDF değil.'],
  'content-xml-yok': ['bozuk', 'UDF paketinde belge içeriği (content.xml) yok.'],
  xml: ['bozuk', 'Belge içeriği okunamadı (XML bozuk).'],
  dtd: ['guvensiz', 'Belge güvenlik nedeniyle dönüştürülmedi (izin verilmeyen XML tanımı).'],
  boyut: ['buyuk', 'Belge yaklaşık çizimin sınırından büyük.'],
  belirsiz: ['guvensiz', 'UDF paketi birden çok içerik dosyası taşıyor; güvenlik nedeniyle dönüştürülmedi.'],
  sure: ['zaman_asimi', 'Belge zamanında hazırlanamadı.'],
  bos: ['bozuk', 'Dosya boş.'],
};
function motorHatasi(kod) {
  if (kod === 'iptal') return iptalHatasi();
  const [k, ileti] = Object.prototype.hasOwnProperty.call(MOTOR_HATALARI, kod) ? MOTOR_HATALARI[kod] : ['hata', 'Belge çizilemedi.'];
  return kodlu(k, ileti);
}

// ---------------------------------------------------------------- oturum ve sayfa
let oturum = null;
let sayfaKlasoru = '';
const sayfaOnbellegi = new Map();

/** Çizim penceresinin oturumu (ilk istekte kurulur): pdefe://udf-cizim/ yalnızca üç dosyayı verir; izin, indirme, başka adres yok. */
function oturumuKur() {
  if (oturum) return oturum;
  const s = session.fromPartition(BOLUM, { cache: false });
  s.protocol.handle('pdefe', (istek) => sayfaYaniti(istek));
  s.setPermissionRequestHandler((_wc, _izin, geri) => geri(false));
  s.setPermissionCheckHandler(() => false);
  // Sayfanın kendi dosyaları ve belgenin resimleri (blob:) dışında hiçbir istek çıkmaz (sayfanın CSP'sine ek katman)
  s.webRequest.onBeforeRequest((ayrinti, geri) => geri({ cancel: !/^(pdefe:\/\/udf-cizim\/|blob:|data:)/i.test(String(ayrinti.url || '')) }));
  s.on('will-download', (olay) => olay.preventDefault());
  try { s.setSpellCheckerEnabled(false); } catch { /* yok say */ }
  oturum = s;
  return s;
}

async function sayfaYaniti(istek) {
  const yok = () => new Response('Bulunamadı', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  let url;
  try { url = new URL(istek.url); } catch { return yok(); }
  if (url.host !== 'udf-cizim' || (istek.method && istek.method !== 'GET')) return yok();
  const ad = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!Object.prototype.hasOwnProperty.call(SAYFA_DOSYALARI, ad)) return yok();
  try {
    let veri = sayfaOnbellegi.get(ad);
    if (!veri) { veri = await fs.promises.readFile(path.join(sayfaKlasoru, ad)); sayfaOnbellegi.set(ad, veri); }
    return new Response(veri, { status: 200, headers: { 'content-type': SAYFA_DOSYALARI[ad], 'cache-control': 'no-store', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff' } });
  } catch { return yok(); }
}

// ---------------------------------------------------------------- çizim
/** Söz, süre ya da kesinti (çökme, iptal) hangisi önce gelirse. Süre dolunca kodlu hata. */
function sureli(soz, kesinti, ms, ileti) {
  let zaman = null;
  const sure = new Promise((_coz, reddet) => { zaman = setTimeout(() => reddet(kodlu('zaman_asimi', ileti)), ms); });
  return Promise.race([soz, kesinti, sure]).finally(() => clearTimeout(zaman));
}

/**
 * UDF baytlarını gizli pencerede çizer, PDF'e çevirir. Döner: { pdf: Buffer, ozet } (ozet: cizim.js'in sayıları). denetim: { istendi, durdur }
 * (iptal: durdur() pencereyi yok eder). Hata ya da iptalde pencere yok edilir; hiçbir iletişim kutusu açılmaz.
 */
async function ciz(veri, baslik, denetim) {
  if (denetim.istendi) throw iptalHatasi();
  const ses = oturumuKur();
  const pencere = new BrowserWindow({
    show: false, width: 1000, height: 1400, skipTaskbar: true, focusable: false,
    webPreferences: {
      session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, webSecurity: true,
      javascript: true, images: true, webgl: false, plugins: false, spellcheck: false, backgroundThrottling: false, disableDialogs: true,
      navigateOnDragDrop: false, enableWebSQL: false, devTools: !app.isPackaged,
    },
  });
  const wc = pencere.webContents;
  let kes = null;
  const kesinti = new Promise((_coz, reddet) => { kes = reddet; });
  kesinti.catch(() => { /* yarışlardan biri; burada yakalanmazsa işlenmemiş ret olur */ });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (olay) => olay.preventDefault());
  wc.on('render-process-gone', (_olay, ayrinti) => kes(kodlu('hata', 'Çizim sayfası kapandı' + (ayrinti?.reason ? ` (${ayrinti.reason})` : '') + '.')));
  pencere.on('unresponsive', () => kes(kodlu('zaman_asimi', 'Çizim sayfası yanıt vermiyor.')));
  denetim.durdur = () => kes(iptalHatasi());
  try {
    await sureli(pencere.loadURL(KAYNAK + 'sayfa.html'), kesinti, YUKLEME_MS, 'Çizim sayfası zamanında yüklenemedi.');
    const hazir = await sureli(wc.executeJavaScript('typeof window.udfCizim === "object" && typeof window.UDFMotoru === "object"', true), kesinti, YUKLEME_MS, 'Çizim sayfası hazır olmadı.');
    if (hazir !== true) throw kodlu('hata', 'Çizim sayfası yüklenemedi.');
    for (let o = 0; o < veri.length; o += DILIM) {
      if (denetim.istendi) throw iptalHatasi();
      const b64 = veri.subarray(o, Math.min(veri.length, o + DILIM)).toString('base64');
      await sureli(wc.executeJavaScript(`window.udfCizim.parca(${JSON.stringify(b64)})`, true), kesinti, YUKLEME_MS, 'Belge çizim sayfasına aktarılamadı.');
    }
    const ms = CIZIM_MS + Math.ceil(veri.length / (1024 * 1024)) * CIZIM_MS_MB;
    const r = await sureli(wc.executeJavaScript(`window.udfCizim.ciz(${JSON.stringify({ baslik: String(baslik || '').slice(0, 200) })})`, true), kesinti, ms, 'Belge zamanında çizilemedi.');
    if (!r || r.tamam !== true) throw motorHatasi(r?.kod);
    if (denetim.istendi) throw iptalHatasi();
    const pdf = await sureli(wc.printToPDF({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, generateTaggedPDF: false, generateDocumentOutline: false }),
      kesinti, PDF_MS, 'PDF zamanında üretilemedi.');
    if (denetim.istendi) throw iptalHatasi();
    if (!pdf?.length) throw kodlu('hata', 'PDF üretilemedi.');
    return { pdf: Buffer.from(pdf), ozet: r.ozet && typeof r.ozet === 'object' ? r.ozet : {} };
  } catch (e) {
    if (denetim.istendi || e?.iptal) throw iptalHatasi();
    if (e?.kod) throw e;
    throw kodlu('hata', 'Belge çizilemedi: ' + hataMetni(e));
  } finally {
    denetim.durdur = null;
    try { if (!pencere.isDestroyed()) pencere.destroy(); } catch { /* yok say */ }
  }
}

// Sıra: tek gizli pencere; dönüştürme işleri bekleyen küçük resimlerin önüne geçer
const sira = [];
let siraCalisiyor = false;
function siraya(oncelikli, is) {
  return new Promise((coz, reddet) => {
    const oge = { oncelikli, is, coz, reddet };
    if (oncelikli) { const i = sira.findIndex((x) => !x.oncelikli); if (i < 0) sira.push(oge); else sira.splice(i, 0, oge); } else sira.push(oge);
    siraIsle();
  });
}
async function siraIsle() {
  if (siraCalisiyor) return;
  siraCalisiyor = true;
  try {
    while (sira.length) {
      const o = sira.shift();
      try { o.coz(await o.is()); } catch (e) { o.reddet(e); }
    }
  } finally { siraCalisiyor = false; }
}

/** PDF'teki sayfa sayısı (Chromium'un PDF'inde her sayfa bir "/Type /Page" nesnesi); okunamazsa null. */
function sayfaSay(pdf) {
  const n = (pdf.toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;
  return n || null;
}

/** Motorun özetinden kullanıcıya uyarı (UDE'nin yolundaki iletilerle aynı söyleyiş). 0.2.7 (kullanıcı isteği: "Belgedeki e-imza PDF'e
 *  taşınmaz uyarısını kaldıralım"): e-imza uyarısı yok (çekirdeğin UDE yolunda da kalktı). */
function ozetUyarisi(ozet) {
  const u = [];
  const resim = Math.max(ozet.gosterilemeyenResim | 0, ozet.resimReddi | 0);
  if (ozet.kesildi) u.push('Belge çok büyük ya da karmaşık; bir kısmı çizilemedi.');
  if (resim) u.push(resim === 1 ? 'Bir resim çizilemedi.' : `${resim} resim çizilemedi.`);
  if (ozet.notSayisi > 0) u.push('Belgedeki yorumlar (açıklama notları) PDF\'e alınmadı.');
  return u.join(' ') || null;
}

// ---------------------------------------------------------------- geçici dosyalar ve yerine koyma
let sayac = 0;
const geciciler = new Set();   // canlı geçici dosyalar (kapanışta silinir)
function geciciKlasor() { return path.join(app.getPath('temp'), 'PDEfe'); }
function geciciYol() { return path.join(geciciKlasor(), `udf-yaklasik-${process.pid}-${++sayac}.pdf`); }
function hedefYaninda(hedef) { return `${hedef}.${process.pid}-y${++sayac}.pdefe-tmp.pdf`; }

async function geciciYaz(yol, pdf) {
  await fs.promises.mkdir(path.dirname(yol), { recursive: true });
  try { await fs.promises.writeFile(yol, pdf, { flag: 'wx' }); } catch (e) {
    if (e?.code !== 'EEXIST') await fs.promises.rm(yol, { force: true }).catch(() => {});   // yarım yazılmış (disk dolu): kalmasın
    throw e;
  }
  geciciler.add(yol);
}
async function geciciSil(yol) {
  geciciler.delete(yol);
  try { await fs.promises.rm(yol, { force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* sonraki açılışta (eskileri temizle) */ }
}

const kilitKodu = (e) => /^(EBUSY|EPERM|EACCES)$/.test(e?.code || '');
/** Yazılamaz mı (salt okunur; Windows'ta öznitelik, macOS'ta yazma izni). */
async function saltOkunurMu(yol) {
  try { const st = await fs.promises.stat(yol); return (st.mode & 0o200) === 0; } catch { return false; }
}

/** Var olan PDF hedefi yazılabilir mi (uzun çizimden ÖNCE; çekirdeğin _hedef_denetle'si gibi). İletiler çekirdeğinkiyle aynı ifadeleri taşır
 *  (araç kilitli / salt okunur hedefi bunlarla tanır, renderer/araclar/ortak.js kilitliHataMi). */
async function hedefDenetle(hedef) {
  const ad = path.basename(hedef);
  let st = null;
  try { st = await fs.promises.stat(hedef); } catch { return; }
  if (st.isDirectory()) throw kodlu('gecersiz', `Hedef bir klasör: ${ad}`);
  if (await saltOkunurMu(hedef)) throw kodlu('salt_okunur', `Dosya yazılamadı; salt okunur: ${ad}`);
  let fh = null;
  try { fh = await fs.promises.open(hedef, 'r+'); } catch (e) {
    if (kilitKodu(e)) throw kodlu('kilitli', `Dosya yazılamadı; başka bir programda açık olabilir: ${ad}`);
  } finally { await fh?.close().catch(() => {}); }
}

/**
 * Geçici PDF'i (%TEMP%\PDEfe) hedefin yerine koyar: önce hedefin yanına kopyalanır ("<hedef>.<pid>-y<n>.pdefe-tmp.pdf"; kopya hedef klasörün
 * izinlerini alır, taşınan dosya %TEMP%'inkini taşırdı), sonra aynı klasörde rename. Çizim sürerken hedef klasörde geçici dosya durmaz:
 * PDEfe bu arada çökerse kalan dosya %TEMP%'tedir, eskileriTemizle siler (0.2.6 incelemesi; önceden çizim hedefin yanına yapılıyordu).
 * Hedef açık bir sekmenin PDF'iyse çekirdek önce dosyayı bırakır.
 */
async function yerineKoy(gecici, hedef, cekirdekBirak) {
  const ad = path.basename(hedef);
  await cekirdekBirak(hedef);
  if (MAC && await saltOkunurMu(hedef)) throw kodlu('salt_okunur', `Dosya yazılamadı; salt okunur: ${ad}`);   // rename klasörün iznine bakar
  const yan = hedefYaninda(hedef);
  try { await fs.promises.copyFile(gecici, yan, fs.constants.COPYFILE_EXCL); } catch (e) {
    await fs.promises.rm(yan, { force: true }).catch(() => {});
    throw kodlu('hata', `Dosya yazılamadı: ${ad} (${hataMetni(e)})`);
  }
  geciciler.add(yan);
  try {
    for (let deneme = 0; ; deneme++) {
      try { await fs.promises.rename(yan, hedef); geciciler.delete(yan); return; } catch (e) {
        if (kilitKodu(e) && deneme < 2) { await new Promise((c) => setTimeout(c, 250)); continue; }
        if (await saltOkunurMu(hedef)) throw kodlu('salt_okunur', `Dosya yazılamadı; salt okunur: ${ad}`);
        if (kilitKodu(e)) throw kodlu('kilitli', `Dosya yazılamadı; başka bir programda açık olabilir: ${ad} (${e.code})`);
        throw kodlu('hata', `Dosya yazılamadı: ${ad} (${hataMetni(e)})`);
      }
    }
  } finally {
    if (geciciler.has(yan)) await geciciSil(yan);
  }
}

/** "Yeni belge olarak kaydet" (0.2.7, cakisma: 'yeniAd'): hedef varsa klasörde olmayan ilk "<ad> (1).pdf", "(2)"…; ad "(n)" ile bitiyorsa (1–3
 *  basamak; "Rapor (2023)" yıl) n + 1'den (çekirdeğin bos_ad'ı ve arayüzün numaraliAdBul'u ile aynı kural). Hedef yoksa kendisi. */
function bosAd(hedef) {
  if (!fs.existsSync(hedef)) return hedef;
  const { dir, name, ext } = path.parse(hedef);
  const m = / \((\d{1,3})\)$/.exec(name);
  const kok = m ? name.slice(0, m.index) : name;
  for (let i = m ? +m[1] + 1 : 1; i < 1000; i++) {
    const aday = path.join(dir, `${kok} (${i})${ext}`);
    if (!fs.existsSync(aday)) return aday;
  }
  return path.join(dir, `${kok}_${Date.now()}${ext}`);
}

/** Önceki oturumlardan (çökme) kalan bir günden eski geçici PDF'ler (%TEMP%\PDEfe\udf-yaklasik-*.pdf). */
async function eskileriTemizle() {
  let adlar = [];
  try { adlar = await fs.promises.readdir(geciciKlasor()); } catch { return; }
  for (const ad of adlar) {
    if (!/^udf-yaklasik-\d+-\d+\.pdf$/i.test(ad)) continue;
    const y = path.join(geciciKlasor(), ad);
    try { const st = await fs.promises.stat(y); if (Date.now() - st.mtimeMs > ESKI_GECICI_MS) await fs.promises.rm(y, { force: true }); } catch { /* yok say */ }
  }
}

// ---------------------------------------------------------------- kurulum
/**
 * Kanalları kurar (main.js).
 * @param {{ ipcMain: { handle: Function }, KOK: string, cekirdekCagir: (yontem: string, params: object, ilerleme?: Function, anahtar?: string) => Promise<any>,
 *   cekirdekIptal: (anahtar: string) => Promise<boolean> }} p
 *   ipcMain: guvenliIpc sarmalayıcısı; cekirdekCagir: çekirdek çağrısı (parametreleri guvenlik.js cekirdekParametreleri'nden geçirerek);
 *   cekirdekIptal: o anahtarla çalışan çekirdek işini iptal eder.
 */
export function udfYaklasikKur({ ipcMain, KOK, cekirdekCagir, cekirdekIptal }) {
  sayfaKlasoru = path.join(KOK, 'src', 'udf-cizim');
  const isler = new Map();         // "<gönderen>:<istekId>" → denetim
  const denetimler = new Set();    // bütün süren işlerin denetimleri (kapanışta iptal)
  const sahipler = new Map();      // gönderenin kimliği → süren işlerinin denetimleri (pencere başına tek 'destroyed' dinleyicisi)
  const onbellek = new Map();      // küçük resim: anahtar → sonuç
  const cekirdekBirak = (yol) => cekirdekCagir('belge_birak', { yol }).catch(() => {});

  const iptalEt = (d) => {
    if (d.istendi) return;
    d.istendi = true;
    try { d.durdur?.(); } catch { /* yok say */ }
    if (d.cekirdekAnahtari) cekirdekIptal(d.cekirdekAnahtari).catch(() => {});
  };
  /** İş, isteyen pencere kapanınca iptal edilir (sıradaki küçük resimler dâhil). Döner: bırakma işlevi. */
  const sahibeBagla = (gonderen, d) => {
    denetimler.add(d);
    const id = gonderen.id;
    let kume = sahipler.get(id);
    if (!kume) {
      kume = new Set();
      sahipler.set(id, kume);
      try { gonderen.once('destroyed', () => { for (const x of kume) iptalEt(x); sahipler.delete(id); }); } catch { /* yok say */ }
    }
    kume.add(d);
    return () => { denetimler.delete(d); kume.delete(d); };
  };

  // ---------------------------------------------------- küçük resim
  ipcMain.handle('udf:yaklasikBilgi', async (e, p) => {
    const { yol, genislik, istekId } = udfYaklasikParametreleri('udf:yaklasikBilgi', p);
    let st = null;
    try { st = await fs.promises.stat(yol); } catch { /* udfDosyasiOku anlaşılır hatayı verir */ }
    const anahtar = st ? `${path.resolve(yol).toLowerCase()}|${st.size}|${st.mtimeMs}|${genislik}` : null;
    if (anahtar && onbellek.has(anahtar)) return onbellek.get(anahtar);
    const d = { istendi: false, durdur: null, cekirdekAnahtari: null };
    // İptal (udf:yaklasikIptal): araç kapanınca ya da satır çıkarılınca sıradaki küçük resim çizilmez (0.2.6 incelemesi)
    const isAnahtari = istekId == null ? null : `${e.sender.id}:${istekId}`;
    if (isAnahtari) isler.set(isAnahtari, d);
    const birak = sahibeBagla(e.sender, d);
    let gecici = null;
    try {
      // Dosya sırası gelince okunur: sırada bekleyen küçük resimlerin baytları (her biri en çok 40 MB) birlikte bellekte durmasın
      const { pdf, ozet } = await siraya(false, async () => {
        if (d.istendi) throw iptalHatasi();
        return ciz(await udfDosyasiOku(yol), path.parse(yol).name, d);
      });
      if (d.istendi) throw iptalHatasi();
      gecici = geciciYol();
      await geciciYaz(gecici, pdf);
      const b = await cekirdekCagir('donusum_bilgi', { yol: gecici, genislik, onizleme: false });
      const sonuc = {
        sayfa: b?.sayfa ?? sayfaSay(pdf), png: typeof b?.png === 'string' ? b.png : null, pngGenislik: b?.pngGenislik ?? null, pngYukseklik: b?.pngYukseklik ?? null,
        genislik: b?.genislik ?? null, yukseklik: b?.yukseklik ?? null, uyari: ozetUyarisi(ozet),
      };
      if (anahtar) { onbellek.set(anahtar, sonuc); while (onbellek.size > ONBELLEK) onbellek.delete(onbellek.keys().next().value); }
      return sonuc;
    } finally {
      birak();
      if (isAnahtari && isler.get(isAnahtari) === d) isler.delete(isAnahtari);
      if (gecici) { await cekirdekBirak(gecici); await geciciSil(gecici); }
    }
  });

  // ---------------------------------------------------- dönüştürme
  ipcMain.handle('udf:yaklasikDonustur', async (e, p) => {
    const { ogeler, istekId } = udfYaklasikParametreleri('udf:yaklasikDonustur', p);
    const gonderen = e.sender;
    const anahtar = istekId == null ? null : `${gonderen.id}:${istekId}`;
    const d = { istendi: false, durdur: null, cekirdekAnahtari: null };
    if (anahtar) isler.set(anahtar, d);
    const birak = sahibeBagla(gonderen, d);
    const ilerle = (yuzde, mesaj) => {
      try { if (istekId != null && !gonderen.isDestroyed()) gonderen.send('udf:yaklasikIlerleme', istekId, { yuzde: Math.round(Math.max(0, Math.min(100, yuzde)) * 10) / 10, mesaj }); } catch { /* yok say */ }
    };
    const n = ogeler.length;
    const zincirVar = ogeler.some((o) => o.hedefBicim !== 'pdf');
    const pay = zincirVar ? CIZIM_PAYI.zincir : CIZIM_PAYI.tek;
    const sonuclar = new Array(n).fill(null);
    const hataSonucu = (o, h) => ({ yol: o.yol, hedef: o.hedef, hedefBicim: o.hedefBicim, hata: hataMetni(h), kod: h?.kod || 'hata' });
    const cizilen = [];   // { k, gecici, boyut, sayfa, uyari }
    try {
      // 1) Çizim: her öğe geçici PDF'e
      for (let k = 0; k < n; k++) {
        if (d.istendi) return { iptal: true };
        const o = ogeler[k];
        ilerle((k / n) * pay, `${path.basename(o.yol)} çiziliyor…` + (n > 1 ? ` (${k + 1}/${n})` : ''));
        try {
          // "Yeni belge olarak kaydet"te (0.2.7) var olan hedefe yazılmaz: yerine koyarken boş ad seçilir, onu denetlemek gerekmez
          if (o.hedefBicim === 'pdf' && o.cakisma !== 'yeniAd') await hedefDenetle(o.hedef);
          const veri = await udfDosyasiOku(o.yol);
          const { pdf, ozet } = await siraya(true, () => ciz(veri, path.parse(o.yol).name, d));
          const gecici = geciciYol();   // PDF hedefi de: hedefin yanına yalnızca yerine koyarken kopyalanır (yerineKoy)
          await geciciYaz(gecici, pdf);
          cizilen.push({ k, gecici, boyut: pdf.length, sayfa: sayfaSay(pdf), uyari: ozetUyarisi(ozet) });
        } catch (h) {
          if (h?.iptal || d.istendi) return { iptal: true };
          sonuclar[k] = hataSonucu(o, h);
        }
      }
      if (d.istendi) return { iptal: true };
      // 2) TIFF / Word / JPG hedefleri: yaklaşık PDF çekirdeğe (PDF → TIFF / Word / JPG); çekirdek hedefleri kendisi yerine koyar
      const zincir = cizilen.filter((c) => ogeler[c.k].hedefBicim !== 'pdf');
      let gecIptal = false;
      if (zincir.length) {
        ilerle(pay, 'Dönüştürülüyor…');
        d.cekirdekAnahtari = `udf-yaklasik:${++sayac}`;
        let r = null;
        try {
          r = await cekirdekCagir('bicim_donustur', {
            ogeler: zincir.map((c) => {
              const o = ogeler[c.k];
              return { yol: c.gecici, hedef: o.hedef, hedefBicim: o.hedefBicim, secenekler: o.secenekler, ...(o.cakisma ? { cakisma: o.cakisma } : {}) };
            }),
          }, (il) => ilerle(pay + ((Number(il?.yuzde) || 0) * (100 - pay)) / 100, il?.mesaj), d.cekirdekAnahtari);
        } catch (h) {
          if (d.istendi) return { iptal: true };   // çekirdek yerine koymadan önce durdu: hiçbir dosya yazılmadı
          for (const c of zincir) sonuclar[c.k] = hataSonucu(ogeler[c.k], h);
        } finally { d.cekirdekAnahtari = null; }
        const rs = Array.isArray(r?.sonuclar) ? r.sonuclar : [];
        zincir.forEach((c, i) => {
          const o = ogeler[c.k], s = rs[i];
          if (!r) return;
          if (!s) { sonuclar[c.k] = hataSonucu(o, kodlu('hata', 'Dönüştürme sonucu alınamadı.')); return; }
          // Çekirdeğin yazdığı adlar (0.2.7): "(1)" adı (hedef, istenenHedef) ve JPG'nin sayfa dosyaları (hedefler); yol arayüzün verdiği UDF
          const adlar = { ...(Array.isArray(s.hedefler) ? { hedefler: s.hedefler } : {}), ...(s.istenenHedef ? { istenenHedef: s.istenenHedef } : {}) };
          sonuclar[c.k] = s.hata ? { yol: o.yol, hedef: o.hedef, hedefBicim: o.hedefBicim, hata: s.hata, kod: s.kod || 'hata', ...adlar }
            : { yol: o.yol, hedef: s.hedef || o.hedef, hedefBicim: o.hedefBicim, kaynakTur: 'udf', boyut: s.boyut ?? null, sayfa: s.sayfa ?? c.sayfa, uyari: [c.uyari, s.uyari].filter(Boolean).join(' ') || null, yaklasik: true, ...adlar };
        });
        gecIptal = d.istendi;
      }
      // 3) PDF hedefleri yerine konur (iptal buraya dek geldiyse yazılmaz; yerine koyma başlayınca iptale bakılmaz)
      const pdfler = cizilen.filter((c) => ogeler[c.k].hedefBicim === 'pdf');
      if (!zincir.length && d.istendi) return { iptal: true };
      if (pdfler.length) ilerle(Math.max(pay, 97), 'Kaydediliyor…');
      for (const c of pdfler) {
        const o = ogeler[c.k];
        if (gecIptal || d.istendi) { sonuclar[c.k] = hataSonucu(o, kodlu('iptal', 'İptal edildi.')); continue; }
        try {
          const hedef = o.cakisma === 'yeniAd' ? bosAd(o.hedef) : o.hedef;   // ad yerine koyma anında seçilir (çekirdekteki gibi)
          await yerineKoy(c.gecici, hedef, cekirdekBirak);
          sonuclar[c.k] = { yol: o.yol, hedef, hedefBicim: 'pdf', kaynakTur: 'udf', boyut: c.boyut, sayfa: c.sayfa, uyari: c.uyari, yaklasik: true,
            ...(hedef !== o.hedef ? { istenenHedef: o.hedef } : {}) };
        } catch (h) { sonuclar[c.k] = hataSonucu(o, h); }
      }
      const liste = sonuclar.map((s, k) => s || hataSonucu(ogeler[k], kodlu('hata', 'Dönüştürülemedi.')));
      const basarili = liste.filter((s) => !s.hata).length;
      ilerle(100, 'Tamamlandı');
      return { sonuclar: liste, basarili, hatali: liste.length - basarili };
    } finally {
      birak();
      if (anahtar) isler.delete(anahtar);
      for (const c of cizilen) {
        if (!geciciler.has(c.gecici)) continue;
        if (ogeler[c.k].hedefBicim !== 'pdf') await cekirdekBirak(c.gecici);
        await geciciSil(c.gecici);
      }
    }
  });

  ipcMain.handle('udf:yaklasikIptal', (e, p) => {
    const { istekId } = udfYaklasikParametreleri('udf:yaklasikIptal', p);
    const d = isler.get(`${e.sender.id}:${istekId}`);
    if (!d) return false;
    iptalEt(d);
    return true;
  });

  // Uygulama kapanırken: süren çizimler durur (gizli pencereler yok edilir), geçici dosyalar silinir
  app.once('will-quit', () => {
    for (const d of denetimler) iptalEt(d);
    for (const y of geciciler) { try { fs.rmSync(y, { force: true }); } catch { /* sonraki açılışta */ } }
    geciciler.clear();
  });
  eskileriTemizle().catch(() => { /* yalnızca bakım */ });
}
