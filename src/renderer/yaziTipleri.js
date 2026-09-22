// PDF yazılarının çizimi: referans okuyucu gibi glifler ana hatlarından (Path2D) çizilir.
// Chromium'un yazı çizicisi (DirectWrite, ClearType + kontrast artırımı) kalın yazıyı referans okuyucudan belirgin kalın ve koyu çiziyordu
// (kullanıcının %125 ölçekli ekranında UYAP tebligatının Times-Bold satırlarında referans okuyucudan %24 fazla mürekkep); döndürülmüş sayfada da
// döndürülmüş glifleri ipuçlarıyla (hinting) bozuk çiziyordu. Ana hat çiziminde glif, yazı tipi dosyasındaki biçimiyle ve gri
// yumuşatmayla çizilir; kalınlık ve görünüm referans okuyucuya yakındır, sayfa hangi açıda olursa olsun aynıdır.
//  - Gömülü fontlar: PDF.js belgedeki font verisinden ana hat çıkarır.
//  - Gömülü olmayan standart 14 font (Times, Helvetica/Arial, Courier): referans okuyucunun Windows'ta yaptığı gibi Windows'un Times New Roman,
//    Arial ve Courier New dosyaları kullanılır (PDF.js'in kendi yedekleri Foxit/Liberation'da Türkçe ş, İ, ğ yok).
//  - Gömülü olmayan öteki fontlar (UYAP doğrulama satırındaki Consolas, "e-imzalı" damgasındaki Segoe Script, Cambria…): Windows'taki
//    kendi fontlarıyla (local()) eskisi gibi Chromium çizer; ana hattı çıkarılacak verileri yok.
// Dayanılan PDF.js iç adları (pdfjs-dist 6): PDFDocumentProxy._transport.fontLoader, FontLoader.prototype.bind,
// FontFaceObject.prototype.getPathGenerator ve name / loadedName / missingFile / systemFontInfo / bold / italic / isType3Font;
// pdfjs-dist yükseltmesinde denetlenmeli. Yoksa çökmez: standart dışı fontlar PDF.js'in genel yedeğiyle (serif / sans-serif /
// monospace) çizilir, glif yolları ince çizgi oturtmasına girebilir.
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

/** Ana hat çizimiyle belge açmak için getDocument seçenekleri. */
export function anaHatSecenekleri() {
  return { disableFontFace: true, useSystemFonts: false, BinaryDataFactory: SistemYaziTipiFabrikasi };
}

// ------------------------------------------------------------ PDF.js yazı tipi yükleyicisi
let yukleyiciSarili = false, yolSarili = false;

/**
 * Belgenin yazı tipi yükleyicisini (prototipte, bir kez) sarar; ilk sayfa çizilmeden önce çağrılmalı (bind yazı tipi ilk
 * kullanıldığında çalışır). Gömülü olmayan standart dışı fontlara Windows'taki fontu bağlar, glif yollarını keskinlik.js'in ince
 * çizgi oturtmasından çıkarır ('l', 'I', '-' gibi dikdörtgen glifler ızgaraya oturtulunca harf kalınlıkları tutarsızlaşırdı).
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
      if (font && !font.attached && font.missingFile && !font.systemFontInfo && !font.isType3Font) await yerelYaziTipiBagla(font);
    } catch (e) { console.warn('Yazı tipi hazırlanamadı', font?.name, e); }
    return ozgun.call(this, font);
  };
  yukleyiciSarili = true;
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
