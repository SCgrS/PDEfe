// PDF yazılarının çizimi ("Dengeli"): her yazı referans okuyucunun görünümüne en yakın yolla çizilir.
//  - Düz (dönmemiş, eğilmemiş, aynalanmamış) yazı Chromium'un yazı çizicisiyle (FontFace; DirectWrite, ipuçlu, ClearType): referans okuyucu yazıyı
//    ipuçlarıyla ve LCD yumuşatmasıyla keskin çizer. 0.1.4'teki ana hat çiziminde (ipuçsuz, gri) harfler iki piksele yayılıp soluk ve
//    bulanık görünüyordu: UYAP tebligatının 7 pt Times paragrafı %100 ölçekte (cihaz pikseli oranı 1) referans okuyucudan %28 açık; ClearType ile
//    +%2, 8 pt Arial +%4.
//  - Kalın (yarı kalın ve üstü) yazı 0.1.4 – 0.1.7'de ana hatlarından çiziliyordu (ClearType kalın yazıyı referans okuyucudan koyu çiziyordu);
//    koyuluk referans okuyucuyla aynıydı ama yazı yanında bulanık görünüyordu. 0.1.8'den beri düz kalın yazı da ClearType'la, ClearType'ın
//    fazladan koyuluğu ölçülüp saydamlıkla giderilerek çizilir (kalinOpaklik; tebligatın kalın satırları referans okuyucuyla ±%3).
//  - Döndürülmüş / eğik yazı ana hatlarından (Path2D, gri yumuşatma): ipuçlu çizim döndürülmüş glifleri bozuk (ince, düzensiz) çiziyordu.
//  - Gömülü fontlar: PDF.js belgedeki font verisinden hem FontFace hem ana hat çıkarır (belge disableFontFace ile açılır: işçi glif
//    yollarını her yazı tipi için gönderir; FontFace ayrıca kurulur).
//  - Gömülü olmayan standart 14 font (Times, Helvetica/Arial, Courier): referans okuyucunun Windows'ta yaptığı gibi Windows'un Times New Roman,
//    Arial ve Courier New dosyaları kullanılır (PDF.js'in kendi yedekleri Foxit/Liberation'da Türkçe ş, İ, ğ yok).
//  - Gömülü olmayan öteki fontlar (UYAP doğrulama satırındaki Consolas, "e-imzalı" damgasındaki Segoe Script, Cambria…): Windows'taki
//    kendi fontlarıyla (local()) eskisi gibi Chromium çizer; ana hattı çıkarılacak verileri yok.
// Dayanılan PDF.js iç adları (pdfjs-dist 6): PDFDocumentProxy._transport.fontLoader, FontLoader.prototype.bind,
// FontFaceObject.prototype.getPathGenerator ve name / loadedName / missingFile / systemFontInfo / bold / black / italic / isType3Font /
// data / disableFontFace (erişimciyle gölgelenir), InternalRenderTask.initializeGraphics ve gfx, CanvasGraphics.showText (numaralı
// OPS anahtarı dahil) ve current.textMatrix / textHScale / fontDirection / font.vertical; pdfjs-dist yükseltmesinde denetlenmeli.
// Yoksa çökmez: yükleyici bulunamazsa bütün yazılar ana hatlarından, standart dışı fontlar PDF.js'in genel yedeğiyle (serif /
// sans-serif / monospace) çizilir, glif yolları ince çizgi oturtmasına girebilir; showText sarılamazsa düz yazı tipleri döndürülmüş
// sayfada da Chromium'la çizilir.
import { metinYolu } from './keskinlik.js';

/** PDF.js'in standart font dosya adı → Windows yazı tipi dosyası. Symbol ve ZapfDingbats PDF.js'in kendi dosyalarıyla kalır. */
const STANDART_DOSYALAR = {
  'FoxitSerif.pfb': 'times.ttf', 'FoxitSerifBold.pfb': 'timesbd.ttf', 'FoxitSerifItalic.pfb': 'timesi.ttf', 'FoxitSerifBoldItalic.pfb': 'timesbi.ttf',
  'LiberationSans-Regular.ttf': 'arial.ttf', 'LiberationSans-Bold.ttf': 'arialbd.ttf', 'LiberationSans-Italic.ttf': 'ariali.ttf', 'LiberationSans-BoldItalic.ttf': 'arialbi.ttf',
  'FoxitFixed.pfb': 'cour.ttf', 'FoxitFixedBold.pfb': 'courbd.ttf', 'FoxitFixedItalic.pfb': 'couri.ttf', 'FoxitFixedBoldItalic.pfb': 'courbi.ttf',
};

let klasorSozu = null;
const veriler = new Map();   // Windows dosya adı → Promise<Uint8Array | null> (her dosya bir kez okunur)

/** Windows yazı tipi dosyasının baytları; okunamazsa null (PDF.js'in kendi dosyası kullanılır). */
function windowsYaziTipi(dosya) {
  if (!veriler.has(dosya)) {
    klasorSozu ||= window.pdefe.cagir('uygulama:klasorler').then((k) => k?.yaziTipleri || 'C:\\Windows\\Fonts').catch(() => 'C:\\Windows\\Fonts');
    veriler.set(dosya, klasorSozu
      .then((klasor) => window.pdefe.cagir('dosya:oku', klasor.replace(/[\\/]+$/, '') + '\\' + dosya))
      .then((r) => (r?.veri ? new Uint8Array(r.veri) : null))
      .catch((e) => { console.warn('Windows yazı tipi okunamadı; PDF.js yedeği kullanılacak', dosya, e); return null; }));
  }
  return veriler.get(dosya);
}

/**
 * PDF.js getDocument({ BinaryDataFactory }) için: standart font dosyaları Windows'tan, ötekiler (CMap, wasm, Symbol, ZapfDingbats)
 * PDF.js'in kendi klasöründen. Özel fabrika verildiğinde PDF.js bütün ikili verileri ana iş parçacığında bununla ister.
 */
export class SistemYaziTipiFabrikasi {
  constructor({ cMapUrl = null, standardFontDataUrl = null, wasmUrl = null } = {}) {
    this.kokler = { cMapUrl, standardFontDataUrl, wasmUrl };
  }

  async fetch({ kind, filename }) {
    const windows = kind === 'standardFontDataUrl' && STANDART_DOSYALAR[filename];
    if (windows) {
      const v = await windowsYaziTipi(windows);
      if (v) return v.slice();   // her belgeye ayrı kopya: işçiye aktarılan dizi boşaltılır, önbellekteki kalmalı
    }
    const kok = this.kokler[kind];
    if (!kok) throw new Error(`PDF.js verisi için adres yok: ${kind}`);
    const yanit = await fetch(kok + filename);
    if (!yanit.ok) throw new Error(`PDF.js verisi yüklenemedi: ${filename} (${yanit.status})`);
    return new Uint8Array(await yanit.arrayBuffer());
  }
}

/** "Dengeli" çizimle (döndürülmüş yazı ana hatlarından, düz yazı FontFace ile) belge açmak için getDocument seçenekleri. */
export function anaHatSecenekleri() {
  return { disableFontFace: true, useSystemFonts: false, BinaryDataFactory: SistemYaziTipiFabrikasi };
}

// ------------------------------------------------------------ PDF.js yazı tipi yükleyicisi
let yukleyiciSarili = false, yolSarili = false;

/**
 * Belgenin yazı tipi yükleyicisini (prototipte, bir kez) sarar; ilk sayfa çizilmeden önce çağrılmalı (bind yazı tipi ilk
 * kullanıldığında çalışır). Gömülü olmayan standart dışı fontlara Windows'taki fontu bağlar, düz yazıyı Chromium'a bırakır
 * (yerliCizimAc; kalın yazı tiplerini kalinYazilar'a yazar), glif yollarını keskinlik.js'in ince çizgi oturtmasından çıkarır ('l', 'I',
 * '-' gibi dikdörtgen glifler ızgaraya oturtulunca harf kalınlıkları tutarsızlaşırdı).
 */
export function yaziTipiYukleyicisiniSar(pdfBelge) {
  if (yukleyiciSarili) return;
  const yukleyici = pdfBelge?._transport?.fontLoader;
  const proto = yukleyici && Object.getPrototypeOf(yukleyici);
  if (!proto || typeof proto.bind !== 'function') { console.warn('PDF.js yazı tipi yükleyicisi bulunamadı; standart dışı fontlar genel yedekle çizilir'); return; }
  const ozgun = proto.bind;
  proto.bind = async function (font) {
    try {
      glifYollariniSar(font);
      if (font && !font.attached && !font.isType3Font) {
        if (font.missingFile) { if (!font.systemFontInfo) await yerelYaziTipiBagla(font); }
        // disableFontFace true: belge ana hat kipinde açıldı (işçi glif yollarını gönderiyor); düz yazı Chromium'la da çizilebilir
        else if (font.disableFontFace === true && font.data) { if (kalinMi(font)) kalinYazilar.add(font); yerliCizimAc(font); }
      }
    } catch (e) { console.warn('Yazı tipi hazırlanamadı', font?.name, e); }
    return ozgun.call(this, font);
  };
  yukleyiciSarili = true;
}

// ------------------------------------------------------------ düz yazı Chromium'la, döndürülmüş yazı ana hatlarından
// "Black" ve "Demi" büyük harfle ve ardından küçük harf gelmeden: "BlackadderITC", "Academic" kalın sayılmaz
const KALIN_AD = /bold|heavy|kal[ıi]n/i, KALIN_AD_BUYUK = /Black(?![a-z])|Demi(?![a-z])/;
/**
 * Kalın (yarı kalın ve üstü) yazı tipi mi: adı ("Times-Bold", "ABCDEF+Calibri-Bold", "Arial,Bold", "FrutigerBlack"), PDF.js'in
 * bayrakları ya da yazı tipinin kendi OS/2 ağırlığı (usWeightClass ≥ 600). Microsoft Print to PDF'in "CIDFont+F1" gibi adlarında
 * yalnızca ağırlık bilgi verir; bazı üreticiler (kurumsal belge sistemi) bütün yüzlere 400 yazdığından önce ada bakılır.
 */
function kalinMi(font) {
  const ad = String(font.name || '').replace(/^[A-Z]{6}\+/, '');
  if (font.bold || font.black || KALIN_AD.test(ad) || KALIN_AD_BUYUK.test(ad)) return true;
  const w = agirlikSinifi(font.data);
  return w !== null && w >= 600;
}

/** OpenType / TrueType verisindeki OS/2 usWeightClass; tablo yoksa, bozuksa ya da PDF.js'in kurduğu tabloysa (üretici "*21*") null. */
function agirlikSinifi(veri) {
  if (!(veri instanceof Uint8Array) || veri.length < 12) return null;
  const dv = new DataView(veri.buffer, veri.byteOffset, veri.byteLength);
  const n = dv.getUint16(4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (o + 16 > veri.length) return null;
    if (dv.getUint32(o) !== 0x4f532f32) continue;   // 'OS/2'
    const t = dv.getUint32(o + 8);
    if (dv.getUint32(o + 12) < 62 || t + 62 > veri.length || dv.getUint32(t + 58) === 0x2a32312a) return null;
    const w = dv.getUint16(t + 4);
    return w >= 100 && w <= 1000 ? w : null;
  }
  return null;
}

let yerliIzin = true;   // çizilen yazı düz mü (showText sarmalayıcısı yazar); showText dışında true: bind FontFace'i kurabilsin

/**
 * Gömülü (ya da Windows'tan okunan standart) yazı tipi: PDF.js'in disableFontFace bayrağı nesnede erişimciyle değiştirilir.
 * bind sırasında false (PDF.js FontFace kurar), çizimde yazı düzse false (Chromium fillText), değilse true (ana hat; işçi yolları
 * belge ana hat kipinde açıldığı için gönderir). FontFace yüklenemezse PDF.js true yazar: o yazı tipi hep ana hatlarından çizilir.
 */
function yerliCizimAc(font) {
  let yerli = true;
  Object.defineProperty(font, 'disableFontFace', {
    configurable: true, enumerable: true,
    get: () => !(yerli && yerliIzin),
    set: (v) => { if (v) yerli = false; },
  });
}

const KIMLIK = [1, 0, 0, 1, 0, 0];
/**
 * Yazı cihazda dönmeden, eğilmeden ve aynalanmadan mı çizilecek (tuval dönüşümü × metin matrisi × showText'in yatay ölçek / y
 * çevirmesi): öyleyse metin uzayının dikey ölçeği (cihaz pikseli; × yazı boyutu = harf boyu), değilse 0.
 */
function duzYaziOlcegi(gfx) {
  const c = gfx.current, ctx = gfx.ctx;
  if (!c || !ctx || c.font?.vertical) return 0;
  const m = ctx.getTransform(), t = c.textMatrix || KIMLIK;
  const yon = c.fontDirection > 0 ? 1 : -1, sx = (c.textHScale ?? 1) * yon, sy = -yon;
  const a = (m.a * t[0] + m.c * t[1]) * sx, b = (m.b * t[0] + m.d * t[1]) * sx;
  const cc = (m.a * t[2] + m.c * t[3]) * sy, d = (m.b * t[2] + m.d * t[3]) * sy;
  const pay = 1e-3 * Math.max(Math.abs(a), Math.abs(d));
  return a > 0 && d > 0 && Math.abs(b) <= pay && Math.abs(cc) <= pay ? d : 0;
}

// ------------------------------------------------------------ kalın yazı: ClearType keskinliği, referans okuyucu koyuluğu
// Kalın yazı 0.1.4 – 0.1.7'de ana hatlarından (ipuçsuz, gri) çiziliyordu: koyuluğu referans okuyucuyla aynıydı ama gövdeler iki piksele yayılıp
// yazı referans okuyucunun ipuçlu ClearType çizimi yanında bulanık görünüyordu. Artık düz kalın yazı da Chromium'la (ipuçlu, ClearType) çizilir.
// Windows'un bazı kalın yüzleri ClearType'la küçük boyutta belirgin koyu çıkar: ipucu talimatları gövdeleri tam piksele kalınlaştırır
// (Times New Roman Bold 8–11 px'te ana hattından %25, 12 px'te %16, 16 px'te %6 fazla; Georgia, Garamond, Palatino, Book Antiqua,
// Cambria Bold benzer; Arial, Calibri, Segoe UI, Tahoma, Verdana Bold'da sistematik fark yok, 20 px üstünde hiçbirinde yok). Referans okuyucu
// kalın yazıyı ana hattı kadar koyu çizer (UYAP tebligatında ±%8). Bu yüzden her yazı tipi ve boyutta bir kez aynı glifler küçük bir
// tuvale hem ClearType'la hem ana hattından çizilip mürekkepleri oranlanır; ClearType daha koyuysa yazı o oranda saydam çizilir.
const kalinYazilar = new WeakSet();          // kalın yazı tipleri (PDF.js FontFaceObject)
const kalinGlifleri = new WeakMap();         // yazı tipi → Set(fontChar): ölçümde çizilecek glifler (belgenin yazılarından)
const kalinOpakliklari = new Map();          // "ad|opak|boyut kovası" → opaklık; belgeler arasında paylaşılır (aynı ad aynı yüzdür)
const OLCUM_GLIF = 24;                       // oranlamada en çok bu kadar glif
const OPAKLIK_EN_AZ = 0.85;                  // referans okuyucu küçük kalın yazıyı ana hattından biraz koyu çizer (tebligatın 7 pt satırları +%5–9)
const OPAKLIK_SAKLAMA = 4000;                // saklanan ölçüm sayısı (sürekli yakınlaştırmada sınırsız büyümesin)

/**
 * Glifleri px boyunda bir tuvalin üst yarısına ClearType'la, alt yarısına ana hatlarından çizip mürekkeplerini (0–255 koyuluk toplamı)
 * döndürür: [ClearType, ana hat]. Tuval sayfa tuvaliyle aynı saydamlık kipindedir (opakta Chromium yazıyı ClearType'la, saydamda gri
 * çizer) ve ekran kartındadır: willReadFrequently tuvali işlemciye alır, ClearType orada başka karışır (sayfadakinden %15'e dek farklı
 * ölçüyordu). Tek okuma (aynı tuvalden ikinci okumada Chromium konsola uyarı yazar); en az 300×300 px, küçük tuval ekran kartına
 * alınmayabilir.
 */
function murekkepleriOlc(gfx, font, karakterler, px, opak) {
  const hucre = Math.ceil(px * 1.3) + 2, taban = Math.ceil(px * 1.35) + 2, h = taban + Math.ceil(px * 0.55) + 2, w = hucre * karakterler.length;
  const tuval = document.createElement('canvas');
  tuval.width = Math.max(w, 300); tuval.height = Math.max(2 * h, 300);
  const ctx = tuval.getContext('2d', { alpha: !opak });
  try {
    if (opak) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tuval.width, tuval.height); }
    ctx.fillStyle = '#000';
    // ClearType: PDF.js'in kurduğu yazı tipi tanımı (tarayıcı boyu 16–100 px), ölçekle cihazda px boyunda
    ctx.font = gfx.ctx.font;
    const k = px / ((gfx.current.fontSize || 1) / (gfx.current.fontSizeScale || 1));
    karakterler.forEach((c, i) => { ctx.setTransform(k, 0, 0, k, i * hucre + 1, taban); ctx.fillText(c, 0, 0); });
    // Ana hat: PDF.js paintChar gibi (glif yolu em biriminde, y yukarı)
    karakterler.forEach((c, i) => { const yol = font.getPathGenerator(gfx.commonObjs, c); if (yol) { ctx.setTransform(px, 0, 0, -px, i * hucre + 1, h + taban); ctx.fill(yol); } });
    const v = ctx.getImageData(0, 0, w, 2 * h).data, yari = w * h * 4;
    const m = [0, 0];
    if (opak) for (let i = 0; i < v.length; i += 4) m[i < yari ? 0 : 1] += 765 - v[i] - v[i + 1] - v[i + 2];
    else for (let i = 3; i < v.length; i += 4) m[i < yari ? 0 : 1] += v[i] * 3;
    return m;
  } finally { tuval.width = 0; tuval.height = 0; }
}

/**
 * Kalın yazının ClearType'la çizilirken alacağı opaklık (OPAKLIK_EN_AZ – 1): belgenin bu yazı tipiyle yazılmış glifleri (en çok
 * OLCUM_GLIF) px boyunda ana hattından ve ClearType'la çizildiğinde mürekkeplerinin oranı. Yazı tipinin adı (alt küme öneki atılmış),
 * tuval kipi ve çeyrek piksellik boyut kovasıyla saklanır: aynı yazı tipi ve boyut bir kez ölçülür (ölçüm ~5 ms), başka belgede de
 * yeniden ölçülmez. Yeterli glif yoksa (tek harflik parçalar) 1; ölçüm sonraki parçalarda yapılır.
 */
function kalinOpaklik(gfx, font, glifler, px) {
  const kova = Math.round(px * 4) / 4;
  const opak = gfx.ctx.getContextAttributes?.().alpha === false;
  const anahtar = `${String(font.name || font.loadedName).replace(/^[A-Z]{6}\+/, '')}|${opak ? 1 : 0}|${kova}`;
  if (kalinOpakliklari.has(anahtar)) return kalinOpakliklari.get(anahtar);
  let secilen = kalinGlifleri.get(font);
  if (!secilen) kalinGlifleri.set(font, secilen = new Set());
  for (const g of glifler || []) {
    if (secilen.size >= OLCUM_GLIF) break;
    if (g && typeof g === 'object' && g.fontChar && !g.isSpace && g.isInFont && !g.accent) secilen.add(g.fontChar);
  }
  if (secilen.size < 3) return 1;
  let deger = 1;
  try {
    const [ct, ah] = murekkepleriOlc(gfx, font, [...secilen], kova, opak);
    if (ct > 0 && ah > 0) deger = Math.max(OPAKLIK_EN_AZ, Math.min(1, ah / ct));
  } catch (e) { console.warn('Kalın yazı ölçülemedi', font?.name, e); }
  if (kalinOpakliklari.size >= OPAKLIK_SAKLAMA) kalinOpakliklari.clear();
  kalinOpakliklari.set(anahtar, deger);
  return deger;
}

function metinCizimiSar(P) {
  if (!P || Object.prototype.hasOwnProperty.call(P, '__yaziYonu') || typeof P.showText !== 'function') return;
  Object.defineProperty(P, '__yaziYonu', { value: true });
  const ozgun = P.showText;
  const sarili = function (...a) {
    const olcek = duzYaziOlcegi(this);
    yerliIzin = olcek > 0;
    const c = this.current, font = c?.font, ctx = this.ctx;
    let alfa = null;
    // Kalın yazı Chromium'la dolgu olarak çizilecekse (FontFace yüklü, desen dolgusu yok, görünmez / yalnızca çizgi kipi değil)
    if (yerliIzin && font && kalinYazilar.has(font) && !font.disableFontFace && !c.patternFill && ((c.textRenderingMode & 3) === 0 || (c.textRenderingMode & 3) === 2)) {
      const o = kalinOpaklik(this, font, a.find(Array.isArray), olcek * (c.fontSize || 0));
      if (o < 1) { alfa = ctx.globalAlpha; ctx.globalAlpha = alfa * o; }
    }
    try { return ozgun.apply(this, a); } finally { yerliIzin = true; if (alfa !== null) ctx.globalAlpha = alfa; }
  };
  // PDF.js işlemleri numarasıyla (OPS) çağırır: aynı işlevi taşıyan numaralı anahtar da değiştirilir
  for (const k of Object.getOwnPropertyNames(P)) if (Object.getOwnPropertyDescriptor(P, k).value === ozgun) P[k] = sarili;
}

/**
 * page.render() görevini alır: PDF.js'in çizim sınıfının showText'ini ilk çizimden önce (bir kez) sarar; yazının yönü her yazı
 * parçasında denetlenir. PDF.js iç yapısı değişirse hiçbir şey yapmaz. Döner: görev.
 */
export function yaziGoreviHazirla(gorev) {
  const P = gorev?._internalRenderTask && Object.getPrototypeOf(gorev._internalRenderTask);
  if (!P || Object.prototype.hasOwnProperty.call(P, '__yaziGorev') || typeof P.initializeGraphics !== 'function') return gorev;
  Object.defineProperty(P, '__yaziGorev', { value: true });
  const ozgun = P.initializeGraphics;
  P.initializeGraphics = function (...a) {
    const r = ozgun.apply(this, a);
    if (this.gfx) metinCizimiSar(Object.getPrototypeOf(this.gfx));
    return r;
  };
  return gorev;
}

function glifYollariniSar(font) {
  if (yolSarili || !font) return;
  const p = Object.getPrototypeOf(font);
  if (typeof p?.getPathGenerator !== 'function') return;
  const ozgun = p.getPathGenerator;
  p.getPathGenerator = function (objs, karakter) {
    const yeni = this.compiledGlyphs?.[karakter] === undefined;
    const yol = ozgun.call(this, objs, karakter);
    if (yeni && yol) metinYolu(yol);
    return yol;
  };
  yolSarili = true;
}

const yerelYuklenenler = new Map();   // loadedName → Promise (aynı font bir kez)

/**
 * Gömülü olmayan standart dışı font: Windows'taki fontu PDF.js'in bu font için kullandığı aile adıyla (loadedName) yükler; PDF.js
 * yazıyı "loadedName", <genel yedek> aile listesiyle çizdiğinden bulunursa o kullanılır. Ad biçimleri: "SegoeScript-Bold",
 * "Calibri,Bold", "ABCDEF+Cambria" (alt küme öneki atılır). PostScript adı, "Aile Stil" ve aile adı sırayla denenir.
 */
function yerelYaziTipiBagla(font) {
  const kimlik = font.loadedName;
  if (!kimlik || yerelYuklenenler.has(kimlik)) return yerelYuklenenler.get(kimlik);
  const ad = String(font.name || '').replace(/^[A-Z]{6}\+/, '').trim();
  const soz = (async () => {
    if (!ad) return;
    const [aileHam, stilHam = ''] = ad.split(/[-,]/, 2);
    const aile = aileHam.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/MT$|PS$/, '').trim();
    const kalin = /bold|black|heavy|semibold|demi/i.test(stilHam) || !!font.bold;
    const italik = /italic|oblique/i.test(stilHam) || !!font.italic;
    const stil = [kalin ? 'Bold' : '', italik ? 'Italic' : ''].filter(Boolean).join(' ');
    const adaylar = [...new Set([ad, stil ? `${aile} ${stil}` : aile, aileHam + (stil ? '-' + stil.replace(' ', '') : ''), aile])];
    const kaynak = adaylar.map((x) => `local("${x.replace(/"/g, '')}")`).join(', ');
    const yuz = new FontFace(kimlik, kaynak, { weight: kalin ? 'bold' : 'normal', style: italik ? 'italic' : 'normal' });
    try { await yuz.load(); document.fonts.add(yuz); } catch { /* Windows'ta yok: PDF.js'in genel yedeği */ }
  })();
  yerelYuklenenler.set(kimlik, soz);
  return soz;
}
