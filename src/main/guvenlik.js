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

/** Yeni pencerede açılacak dosyalar (0.2.7, pencere:yeniPenceredeAc): en çok 100 mutlak yol (boş, çok uzun ya da NUL içeren yol yok).
 *  Pencere yalnızca yolları kendi arayüzüne verir; dosyalar orada olağan yoldan (dosya:oku, çekirdek) okunur. Geçersizse hata fırlatır. */
export function acilacakYollar(yollar) {
  if (!Array.isArray(yollar) || !yollar.length || yollar.length > 100) throw new Error('Geçersiz dosya listesi.');
  for (const y of yollar) {
    if (typeof y !== 'string' || !y || y.length > 32767 || y.includes('\0') || !path.isAbsolute(y)) throw new Error('Geçersiz dosya yolu.');
  }
  return [...yollar];
}

/** Yol, anlık kopya klasöründeki bir anlık kopya mı (çekirdeğin adlandırması: 32 onaltılık karakter + .pdf). */
export function anlikDosyasiMi(yol, anlikKlasor) {
  const y = String(yol || '');
  return !!y && ayniYol(path.dirname(path.resolve(y)), anlikKlasor) && /^[0-9a-f]{32}\.pdf$/i.test(path.basename(y));
}

/** Hedef verilmezse yol'a (açık belgenin kendisine) yazan çekirdek yöntemleri (0.2.1); ayir yalnızca uzerine ile. Bu yöntemler hedefsiz
 *  de denetlenir (main.js cekirdek:cagir). */
export const YOLA_YAZANLAR = new Set(['notlar_kaydet', 'yapisal_kaydet', 'sayfalar_uygula', 'kucult', 'dondur_kaydet', 'ayir']);

/** Format Değiştir'in çekirdek yöntemleri (0.2.6, core/islemler/donustur.py; 0.2.7: donusum_tahmini): parametreleri her zaman denetlenir. */
export const DONUSUM_YONTEMLERI = new Set(['donusum_yetenekleri', 'donusum_bilgi', 'bicim_donustur', 'donusum_tahmini']);

/** UYAP Doküman Editörü'nün klasörünü ana sürecin ayarından alan öteki yöntemler (0.2.7: Birleştir UDF'yi de alır; çekirdek gorsel_bilgi'de
 *  ve birlestir'de UDF'yi editörle çevirir). Parametrelerin geri kalanı değişmez. */
export const UDE_YOLLU_YONTEMLER = new Set(['gorsel_bilgi', 'birlestir']);

/** Parametreleri hedef verilmese de denetlenen yöntemler (main.js cekirdek:cagir). */
export const DENETLENEN_YONTEMLER = new Set([...YOLA_YAZANLAR, ...DONUSUM_YONTEMLERI, ...UDE_YOLLU_YONTEMLER, 'anlik_sil']);

/** bicim_donustur: hedef biçime göre izinli uzantılar (çekirdeğin HEDEF_UZANTILARI ile aynı; Word hedefi .docx; 0.2.7: görüntü hedefi JPG,
 *  hedef ad köküdür, çok sayfalı belgede çekirdek "<ad> - Sayfa n.jpg" yazar). */
export const HEDEF_UZANTILARI = { pdf: ['.pdf'], udf: ['.udf'], tiff: ['.tif', '.tiff'], word: ['.docx'], gorsel: ['.jpg', '.jpeg'] };
const EN_FAZLA_OGE = 500;
const TIFF_DPILERI = new Set([200, 300]);
const TIFF_RENKLERI = new Set(['sb', 'gri', 'renkli']);
const UDF_KIPLERI = new Set(['otomatik', 'pdf', 'yazici']);
/** Hedef zaten varsa (0.2.7, "zaten var" sorusunun "Yeni belge olarak kaydet"i): 'uzerineYaz' (varsayılan) | 'yeniAd' (çekirdek "(1)" adını seçer). */
const CAKISMALAR = new Set(['uzerineYaz', 'yeniAd']);
/** donusum_tahmini'nin (0.2.7) hedef biçimleri: boyutu "İdeal" / "Düşük" çözünürlüğe bağlı olanlar. */
const TAHMIN_HEDEFLERI = new Set(['tiff', 'gorsel']);

/** Klasör var mı (bağlantıysa gösterdiği yer). */
async function klasorMu(yol) {
  if (typeof yol !== 'string' || !yol.trim()) return false;
  const st = await fs.promises.stat(yol).catch(() => null);
  return !!st?.isDirectory();
}

const izinYok = () => new Error('İzin verilmeyen istek.');
const dolu = (s) => typeof s === 'string' && s.trim().length > 0 && !s.includes('\0');

/**
 * ayar:koy (main.js): arayüzün yazabileceği ayar. Yalnızca bilinen üst düzey ayarlar (varsayilanlar: ayarlar.js VARSAYILANLAR; arayüz
 * başkasını yazmaz) ve udeYolu yalnızca null (temizleme; klasörü yalnızca ana sürecin ayar:udeKlasoruSec penceresi yazar: çekirdek o
 * klasördeki Java'yı çalıştırır). Anahtar metin olmalı: electron-store (conf) nesne anahtarında bütün girdileri yazar ({ udeYolu: … }),
 * noktalı yolu iç içe alan sayar ('udeYolu.x' udeYolu'nu nesneye çevirir); ikisi de bu denetimi aşardı (0.2.6 incelemesi). Uymayan istekte
 * hata fırlatır.
 */
export function ayarYazimiDenetle(anahtar, deger, varsayilanlar) {
  if (typeof anahtar !== 'string' || !anahtar || anahtar.includes('.') || !Object.prototype.hasOwnProperty.call(varsayilanlar || {}, anahtar)) throw izinYok();
  if (anahtar === 'udeYolu' && deger != null) throw izinYok();
}

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
    p.ogeler = p.ogeler.map((o) => donusumOgesi(o));
  }
  // 0.2.7: "İdeal" / "Düşük"ün yaklaşık boyutu (yalnızca okur): yollar 1–500 dolu metin (tek metin de olur), hedef TIFF ya da JPG, renk bilinen
  if (yontem === 'donusum_tahmini') {
    const yollar = typeof p.yollar === 'string' ? [p.yollar] : p.yollar;
    if (!Array.isArray(yollar) || !yollar.length || yollar.length > EN_FAZLA_OGE || !yollar.every(dolu)) throw izinYok();
    if (!TAHMIN_HEDEFLERI.has(p.hedefBicim)) throw izinYok();
    if (p.renk != null && !TIFF_RENKLERI.has(p.renk)) throw izinYok();
    return { yollar: [...yollar], hedefBicim: p.hedefBicim, ...(p.renk != null ? { renk: p.renk } : {}) };
  }
  return p;
}

/** bicim_donustur'un (ve UDF'nin yaklaşık çiziminin) bir öğesi: yol ve hedef dolu metin, hedefBicim bilinen biçim, hedefin uzantısı biçimle
 *  eşleşir, seçeneklerde yalnızca bilinen anahtarlar ve değerler; cakisma (0.2.7) 'uzerineYaz' | 'yeniAd' (verilmezse alan yok: çekirdekte
 *  uzerineYaz). Uymayan öğede hata fırlatır. */
function donusumOgesi(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || !dolu(o.yol) || !dolu(o.hedef)) throw izinYok();
  const uzantilar = Object.prototype.hasOwnProperty.call(HEDEF_UZANTILARI, o.hedefBicim) ? HEDEF_UZANTILARI[o.hedefBicim] : null;
  if (!uzantilar) throw izinYok();
  if (!uzantilar.includes(path.extname(o.hedef).toLowerCase())) throw new Error(`Hedef dosyanın uzantısı ${uzantilar.join(' ya da ')} olmalı.`);
  const s = o.secenekler && typeof o.secenekler === 'object' && !Array.isArray(o.secenekler) ? o.secenekler : {};
  const secenekler = {};
  if (s.dpi != null) { if (!TIFF_DPILERI.has(s.dpi)) throw izinYok(); secenekler.dpi = s.dpi; }
  if (s.renk != null) { if (!TIFF_RENKLERI.has(s.renk)) throw izinYok(); secenekler.renk = s.renk; }
  if (s.kip != null) { if (!UDF_KIPLERI.has(s.kip)) throw izinYok(); secenekler.kip = s.kip; }
  if (o.cakisma != null && !CAKISMALAR.has(o.cakisma)) throw izinYok();
  return { yol: o.yol, hedef: o.hedef, hedefBicim: o.hedefBicim, secenekler, ...(o.cakisma != null ? { cakisma: o.cakisma } : {}) };
}

// ---------------------------------------------------------------- UDF'nin yaklaşık çizimi (0.2.6, main/udfYaklasik.js)
const MiB = 1024 * 1024;
/** Yaklaşık çizime verilen .udf'nin sınırları: dosya, açılmış content.xml ve zip'in öğe sayısı çizim sayfasındaki motorunkilerle aynı
 *  (udf-cizim/udf-motoru.js SINIR.paket, icerik, girdi); zip'in bütün öğelerinin beyan edilen açılmış boyutlarının toplamı ayrıca sınırlı. Ana
 *  süreç baytları açmaz, yalnızca merkezî dizindeki beyana bakar; motor açarken gerçekten açılan baytı sayar ve beyanı ya da sınırı aşan akışı
 *  durdurur (zip bombası). */
export const UDF_SINIRI = Object.freeze({ dosya: 40 * MiB, icerik: 20 * MiB, girdi: 1000, acikToplam: 64 * MiB });

const hataKodlu = (kod, ileti) => Object.assign(new Error(ileti), { kod });

/**
 * .udf'nin baytları yaklaşık çizime verilebilir mi (eş zamanlı; baytlar açılmaz). Zip ise: imza, merkezî dizin (ZIP64 ve çok parçalı arşiv
 * yok), en çok 1000 öğe, şifreli öğe yok, sıkıştırma yalnızca saklama ya da deflate, tam bir content.xml (motorun ad kuralıyla: baştaki ./ ve /
 * atılır, büyük / küçük harf ayrılmaz) ve onun beyan edilen açılmış boyutu 20 MB'ı, bütün öğelerinki 64 MB'ı geçmez. Zip değilse düz XML
 * (UDE'nin sıkıştırılmamış UDF'si: BOM ya da boşluktan sonra "<"), en çok 20 MB. Döner: 'zip' | 'xml'; uymayan baytta kodlu hata fırlatır
 * (kod: 'bozuk' | 'parolali' | 'guvensiz' | 'buyuk'; çekirdeğin bicim_donustur kodlarıyla aynı adlar).
 */
export function udfIcerigiDenetle(bayt) {
  if (!bayt || !bayt.length) throw hataKodlu('bozuk', 'Dosya boş.');
  const b = Buffer.isBuffer(bayt) ? bayt : Buffer.from(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  if (b.length > UDF_SINIRI.dosya) throw hataKodlu('buyuk', `Dosya çok büyük (${Math.round(b.length / MiB)} MB; en çok ${UDF_SINIRI.dosya / MiB} MB).`);
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    const bozuk = () => hataKodlu('bozuk', 'Dosya açılamadı: bozuk ya da UDF değil.');
    if (b.length < 22) throw bozuk();
    let eocd = -1;
    for (let i = b.length - 22, alt = Math.max(0, b.length - 22 - 65535); i >= alt; i--) {
      if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0 || b.readUInt16LE(eocd + 4) || b.readUInt16LE(eocd + 6) || b.readUInt16LE(eocd + 8) !== b.readUInt16LE(eocd + 10)) throw bozuk();
    const adet = b.readUInt16LE(eocd + 10), mdBoyut = b.readUInt32LE(eocd + 12), mdOfset = b.readUInt32LE(eocd + 16);
    if (adet === 0xffff || mdBoyut === 0xffffffff || mdOfset === 0xffffffff || mdOfset + mdBoyut > eocd) throw bozuk();
    if (adet > UDF_SINIRI.girdi) throw hataKodlu('guvensiz', `UDF paketinde çok fazla öğe var (${adet}); güvenlik nedeniyle dönüştürülmedi.`);
    let p = mdOfset, icerik = 0, toplam = 0;
    for (let k = 0; k < adet; k++) {
      if (p + 46 > mdOfset + mdBoyut || b.readUInt32LE(p) !== 0x02014b50) throw bozuk();
      const bayrak = b.readUInt16LE(p + 8), yontem = b.readUInt16LE(p + 10), acik = b.readUInt32LE(p + 24);
      const adUz = b.readUInt16LE(p + 28), ekUz = b.readUInt16LE(p + 30), notUz = b.readUInt16LE(p + 32);
      if (p + 46 + adUz + ekUz + notUz > mdOfset + mdBoyut) throw bozuk();
      const ad = b.toString(bayrak & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + adUz).replace(/^(\.?\/)+/, '').toLowerCase();
      if (bayrak & 1) throw hataKodlu('parolali', 'UDF paketi parolayla korunuyor; dönüştürülemez.');
      if (yontem !== 0 && yontem !== 8) throw bozuk();
      toplam += acik;
      if (ad === 'content.xml') {
        icerik++;
        if (acik > UDF_SINIRI.icerik) throw hataKodlu('buyuk', `Belgenin içeriği çok büyük (açılınca ${Math.round(acik / MiB)} MB; en çok ${UDF_SINIRI.icerik / MiB} MB).`);
      }
      if (toplam > UDF_SINIRI.acikToplam) throw hataKodlu('guvensiz', 'UDF paketi açılınca çok büyüyor; güvenlik nedeniyle dönüştürülmedi.');
      p += 46 + adUz + ekUz + notUz;
    }
    if (!icerik) throw hataKodlu('bozuk', 'UDF paketinde belge içeriği (content.xml) yok.');
    if (icerik > 1) throw hataKodlu('guvensiz', 'UDF paketi birden çok içerik dosyası taşıyor; güvenlik nedeniyle dönüştürülmedi.');
    return 'zip';
  }
  let i = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  const utf16 = (b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff);
  while (!utf16 && i < b.length && i < 4096 && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0a || b[i] === 0x0d)) i++;
  if (!utf16 && b[i] !== 0x3c) throw hataKodlu('bozuk', 'Dosya bir UDF belgesi değil.');
  if (b.length > UDF_SINIRI.icerik) throw hataKodlu('buyuk', `Belgenin içeriği çok büyük (${Math.round(b.length / MiB)} MB; en çok ${UDF_SINIRI.icerik / MiB} MB).`);
  return 'xml';
}

/** .udf'yi ana süreç kendisi okur (arayüzün dosya:oku'su yalnızca PDF okur, değişmedi): olağan dosya, boyut sınırı, udfIcerigiDenetle.
 *  Döner: Buffer; olmayan / kilitli dosyada kodlu hata ('bulunamadi' | 'kilitli'; ileti kilitte çekirdeğinkiyle aynı ifadeyi taşır). */
export async function udfDosyasiOku(yol) {
  const ad = path.basename(String(yol || ''));
  const kilitli = (e) => /^(EBUSY|EPERM|EACCES)$/.test(e?.code || '');
  let st;
  try { st = await fs.promises.stat(yol); } catch (e) {
    if (kilitli(e)) throw hataKodlu('kilitli', `Dosya okunamadı; başka bir programda açık olabilir: ${ad}`);
    throw hataKodlu('bulunamadi', `Dosya bulunamadı: ${ad}`);
  }
  if (!st.isFile()) throw hataKodlu('bozuk', 'Dosya bir UDF belgesi değil.');
  if (st.size > UDF_SINIRI.dosya) throw hataKodlu('buyuk', `Dosya çok büyük (${Math.round(st.size / MiB)} MB; en çok ${UDF_SINIRI.dosya / MiB} MB).`);
  let veri;
  try { veri = await fs.promises.readFile(yol); } catch (e) {
    if (kilitli(e)) throw hataKodlu('kilitli', `Dosya okunamadı; başka bir programda açık olabilir: ${ad}`);
    throw hataKodlu('hata', 'Dosya okunamadı: ' + (e?.message || e));
  }
  udfIcerigiDenetle(veri);
  return veri;
}

const mutlakYol = (s) => dolu(s) && path.isAbsolute(s);
/** UDF'nin yaklaşık çiziminin hedef biçimleri: PDF (ana süreç yerine koyar), TIFF, Word ve (0.2.7) JPG (yaklaşık PDF'ten çekirdek dönüştürür). */
const YAKLASIK_HEDEFLER = new Set(['pdf', 'tiff', 'word', 'gorsel']);

/**
 * UDF'nin yaklaşık çiziminin kanallarına arayüzden gelen parametreler (main/udfYaklasik.js). Döner: yalnızca bilinen anahtarlar; uymayan
 * istekte hata fırlatır. Geçici dosyaların yolları arayüze hiç verilmez, arayüzden de alınmaz (çizim, zincirleme ve yerine koyma ana süreçte).
 *  - udf:yaklasikBilgi { yol (mutlak), genislik? 16–1024 (verilmezse 220), istekId? (udf:yaklasikIptal ile iptal için) }
 *  - udf:yaklasikDonustur { ogeler: 1–500 öğe [{ yol (mutlak), hedef (mutlak), hedefBicim: 'pdf' | 'tiff' | 'word', secenekler? }], istekId? };
 *    öğe bicim_donustur'unkiyle aynı denetimden geçer (donusumOgesi: hedefin uzantısı biçimle eşleşir, seçenekler bilinen değerler); hedef
 *    öğenin kendi girdisi olamaz
 *  - udf:yaklasikIptal { istekId }
 *  - udf:yaklasikBirlestir (0.2.7, Birleştir) { ogeler: 1–500 birlestir öğesi (birlestirOgesi; en az biri yaklasik UDF), hedef (mutlak .pdf; yaklaşık
 *    çizilen UDF'lerden biri olamaz, listedeki bir PDF olabilir: Üzerine yaz), genelKalite?, istekId? }
 */
export function udfYaklasikParametreleri(kanal, p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw izinYok();
  const kimlik = (v) => (v == null ? null : Number.isSafeInteger(v) && v >= 0 ? v : (() => { throw izinYok(); })());
  if (kanal === 'udf:yaklasikBilgi') {
    if (!mutlakYol(p.yol)) throw izinYok();
    const g = p.genislik == null ? 220 : Math.round(Number(p.genislik));
    const sonuc = { yol: p.yol, genislik: Number.isFinite(g) ? Math.max(16, Math.min(1024, g)) : 220 };
    const id = kimlik(p.istekId);   // isteğe bağlı (0.2.6): küçük resim de udf:yaklasikIptal ile iptal edilebilir
    return id == null ? sonuc : { ...sonuc, istekId: id };
  }
  if (kanal === 'udf:yaklasikDonustur') {
    if (!Array.isArray(p.ogeler) || !p.ogeler.length || p.ogeler.length > EN_FAZLA_OGE) throw izinYok();
    const ogeler = p.ogeler.map((o) => {
      const d = donusumOgesi(o);
      if (!YAKLASIK_HEDEFLER.has(d.hedefBicim) || !mutlakYol(d.yol) || !mutlakYol(d.hedef)) throw izinYok();
      if (ayniYol(d.yol, d.hedef)) throw new Error('Hedef dosya, dönüştürülen dosyanın kendisi olamaz.');
      return d;
    });
    const hedefler = new Set();
    for (const d of ogeler) {
      const a = path.resolve(d.hedef).toLowerCase();
      if (hedefler.has(a)) throw new Error('Aynı hedef dosya iki kez verildi: ' + path.basename(d.hedef));
      hedefler.add(a);
    }
    return { ogeler, istekId: kimlik(p.istekId) };
  }
  if (kanal === 'udf:yaklasikIptal') {
    const id = kimlik(p.istekId);
    if (id == null) throw izinYok();
    return { istekId: id };
  }
  if (kanal === 'udf:yaklasikBirlestir') {
    if (!Array.isArray(p.ogeler) || !p.ogeler.length || p.ogeler.length > EN_FAZLA_OGE || !mutlakYol(p.hedef) || !/\.pdf$/i.test(p.hedef)) throw izinYok();
    if (p.genelKalite != null && !BIRLESTIR_KALITELERI.has(p.genelKalite)) throw izinYok();
    const ogeler = p.ogeler.map(birlestirOgesi);
    if (!ogeler.some((o) => o.yaklasik)) throw izinYok();   // yaklaşık çizilecek UDF yoksa çekirdeğin birlestir'i
    // Hedef listedeki bir PDF olabilir (0.2.7 inceleme: Birleştir'in "Üzerine yaz"ı açık PDF'in yerine yazar; çekirdeğin birlestir'i bütün girdileri
    // okuduktan sonra yazar, kural onunkiyle aynı). Yaklaşık çizilen UDF'nin kendisi olamaz: UDF'nin yerine PDF yazılırdı
    if (ogeler.some((o) => o.yaklasik && ayniYol(o.yol, p.hedef))) throw new Error('Kaydedilecek dosya, birleştirilen UDF belgelerinden biri olamaz.');
    return { ogeler, hedef: p.hedef, ...(p.genelKalite != null ? { genelKalite: p.genelKalite } : {}), istekId: kimlik(p.istekId) };
  }
  throw izinYok();
}

/** Birleştir'in kalite seviyeleri (çekirdeğin GORSEL_KALITE'si ve "orijinal"). */
const BIRLESTIR_KALITELERI = new Set(['orijinal', 'yuksek', 'orta', 'dusuk']);
const BIRLESTIR_TURLERI = new Set(['pdf', 'gorsel', 'udf', 'word']);

/**
 * udf:yaklasikBirlestir'in (0.2.7, UYAP Doküman Editörü yokken Birleştir'deki UDF) bir öğesi: çekirdeğin birlestir öğesinin bilinen alanları
 * (yol mutlak; tur pdf | gorsel | udf | word; kalite bilinen seviye ya da yok; sayfaBoyutu a4 | orijinal; kenar 0–50 mm; dondurme 0 / 90 / 180 /
 * 270) ve yaklasik (yalnızca UDF'de: ana süreç çizer, çekirdeğe geçici PDF olarak verir). Bilinmeyen alanlar atılır; uymayan öğede hata.
 */
function birlestirOgesi(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || !mutlakYol(o.yol)) throw izinYok();
  const s = { yol: o.yol };
  if (o.tur != null) { if (!BIRLESTIR_TURLERI.has(o.tur)) throw izinYok(); s.tur = o.tur; }
  if (o.kalite != null) { if (!BIRLESTIR_KALITELERI.has(o.kalite)) throw izinYok(); s.kalite = o.kalite; }
  if (o.sayfaBoyutu != null) { if (o.sayfaBoyutu !== 'a4' && o.sayfaBoyutu !== 'orijinal') throw izinYok(); s.sayfaBoyutu = o.sayfaBoyutu; }
  if (o.kenar != null) { const k = Number(o.kenar); if (!Number.isFinite(k) || k < 0 || k > 50) throw izinYok(); s.kenar = k; }
  if (o.dondurme != null) { if (![0, 90, 180, 270].includes(o.dondurme)) throw izinYok(); s.dondurme = o.dondurme; }
  if (o.yaklasik === true) { if (s.tur !== 'udf') throw izinYok(); s.yaklasik = true; }
  return s;
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
  // Birleştir'in UDF'leri (0.2.7): editörün klasörü yalnızca ana sürecin ayarından (arayüzün verdiği yok sayılır; donusumParametreleri gibi)
  if (UDE_YOLLU_YONTEMLER.has(yontem)) p.udeYolu = (await klasorMu(ana.udeYolu)) ? ana.udeYolu : null;
  return p;
}
