// Yazdırmanın saf işlevleri (0.2.6): sayfa aralığı, kâğıt seçimi, sayfanın kâğıt üzerindeki yerleşimi, yazdırma HTML'i ve ön izlemenin
// çözünürlüğü. DOM kullanmaz; yazdırma penceresi (yazdir.js) ve Node sınaması (test/yazdir_html_testi.mjs) birlikte kullanır. Ön izleme
// ile basılan kâğıt aynı yerleşim işlevinden (sayfaYerlesimi) çıkar: pencerede görülen, kâğıtta çıkanın küçüğüdür.
//
// Dışa verilen API:
//   sayfaAraligiCoz(metin, toplam)                       → { sayfalar: number[] } | { hata: string }
//   secilenSayfalar({ aralik, aralikMetni, toplam, gecerli }) → { sayfalar } | { hata }   (aralik: 'tumu' | 'gecerli' | 'aralik')
//   kagitSec(sayfalar, secim)                            → { ad, genislikPt, yukseklikPt, genislikMm, yukseklikMm }   (dikey)
//     sayfalar[i] = { genislikPt, yukseklikPt }; secim = 'belge' (en sık görülen boyut) | 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal'
//   sayfaYerlesimi(sayfa, kagit, olcek)                  → { yatay, olcek, genislikMm, yukseklikMm, kutuGenislikMm, kutuYukseklikMm }
//   yazdirmaHtmlOlustur(sayfalar, secenek)               → { html, sayfaBoyutu: 'A4' | … | { genislikMikron, yukseklikMikron }, kagit }
//   kagitEtiketi(kagit), ozetMetni(sayfaSayisi, kopya), onizlemeDpi(...)
//
// Kâğıt tek bir boyuttur (Windows yazdırma işinde kâğıt boyutu tektir; sürücüler sayfa başına yön değişimini güvenilir biçimde
// desteklemez). Yatay sayfalar (genişlik > yükseklik; /Rotate'li sayfa döndürülmüş ölçüsüyle) dikey kâğıda 90° döndürülerek basılır:
// karışık yönlü belge tek işte, kesilmeden çıkar. Yazıcıya yön (landscape) bu yüzden hiç gönderilmez.

export const PT_MM = 25.4 / 72;            // 1 pt = 0,352778 mm
export const PT_MIKRON = 25400 / 72;       // 1 pt = 352,778 mikron
export const GUVENLI_KENAR_MM = 4;         // "Sayfaya sığdır" için yazıcıların basamadığı kenar payı
const SAYFA_KISALTMA_MM = 0.2;             // sayfa kutusunu kâğıttan bir tık kısa tut: yüksek DPI'de yuvarlama taşması boş sayfa üretmesin

/** Pencerede seçilebilen kâğıtlar (dikey ölçü, pt). Tabloid yalnızca "Belgeye göre" için standart ada eşleşir. */
export const KAGITLAR = [
  { ad: 'A4', g: 595.276, y: 841.89 }, { ad: 'A3', g: 841.89, y: 1190.55 }, { ad: 'A5', g: 419.528, y: 595.276 },
  { ad: 'Letter', g: 612, y: 792 }, { ad: 'Legal', g: 612, y: 1008 },
];
const STANDART_KAGITLAR = [...KAGITLAR, { ad: 'Tabloid', g: 792, y: 1224 }];
const VARSAYILAN_SAYFA = { genislikPt: 595.276, yukseklikPt: 841.89 };

// ---------------------------------------------------------------- sayfa aralığı
/**
 * "1-3,5, 8-" biçimindeki aralık metnini sayfa listesine çevirir (sıralı, tekrarsız).
 * Hatalıysa { hata } döner.
 */
export function sayfaAraligiCoz(metin, toplam) {
  const t = String(metin || '').replace(/\s+/g, '').replace(/;/g, ',').replace(/–|—/g, '-');
  if (!t) return { hata: 'Sayfa aralığı boş. Örnek: 1-3,5' };
  const kume = new Set();
  for (const parca of t.split(',')) {
    if (!parca) continue;
    const m = /^(\d*)-(\d*)$/.exec(parca);
    let bas, son;
    if (m) {
      if (!m[1] && !m[2]) return { hata: `Geçersiz aralık: "${parca}"` };
      bas = m[1] ? parseInt(m[1], 10) : 1;
      son = m[2] ? parseInt(m[2], 10) : toplam;
    } else if (/^\d+$/.test(parca)) {
      bas = son = parseInt(parca, 10);
    } else {
      return { hata: `Geçersiz ifade: "${parca}". Örnek: 1-3,5` };
    }
    if (bas < 1 || son < 1) return { hata: 'Sayfa numaraları 1\'den başlar.' };
    if (bas > toplam || son > toplam) return { hata: `Belgede ${toplam} sayfa var; ${Math.max(bas, son)} numaralı sayfa yok.` };
    if (bas > son) [bas, son] = [son, bas];
    for (let i = bas; i <= son; i++) kume.add(i);
  }
  if (!kume.size) return { hata: 'Yazdırılacak sayfa seçilmedi.' };
  return { sayfalar: [...kume].sort((a, b) => a - b) };
}

/** Penceredeki "Sayfalar" seçiminin sayfa listesi: Tümü, Geçerli sayfa ya da Aralık. */
export function secilenSayfalar({ aralik, aralikMetni, toplam, gecerli }) {
  if (aralik === 'gecerli') return { sayfalar: [Math.min(Math.max(1, Number(gecerli) || 1), toplam)] };
  if (aralik === 'aralik') return sayfaAraligiCoz(aralikMetni, toplam);
  return { sayfalar: Array.from({ length: toplam }, (_, i) => i + 1) };
}

// ---------------------------------------------------------------- kâğıt ve yerleşim
/** Sayfanın pt ölçüsü (bilinmiyorsa A4). */
function olcu(s) {
  return { g: Number(s?.genislikPt) || VARSAYILAN_SAYFA.genislikPt, y: Number(s?.yukseklikPt) || VARSAYILAN_SAYFA.yukseklikPt };
}

function kagitKur(ad, kisa, uzun) {
  return { ad, genislikPt: kisa, yukseklikPt: uzun, genislikMm: kisa * PT_MM, yukseklikMm: uzun * PT_MM };
}

/**
 * Kâğıt: secim 'belge' (ya da bilinmeyen) ise seçilen sayfalar arasında en sık görülen boyut (dikey; eşitlikte büyüğü: küçük sayfa
 * büyük kâğıda sığar, tersi kesilir), standart kâğıda ±2 pt yakınsa tam standart ölçü (sürücü bilinen boyutu daha iyi tanır).
 * Öteki seçimlerde o standart kâğıt.
 */
export function kagitSec(sayfalar, secim = 'belge') {
  const sabit = KAGITLAR.find((k) => k.ad === secim);
  if (sabit) return kagitKur(sabit.ad, sabit.g, sabit.y);
  const liste = Array.isArray(sayfalar) && sayfalar.length ? sayfalar : [VARSAYILAN_SAYFA];
  const sayim = new Map();
  for (const s of liste) {
    const { g, y } = olcu(s);
    const kisa = Math.min(g, y), uzun = Math.max(g, y);
    const anahtar = `${Math.round(kisa * 2) / 2}x${Math.round(uzun * 2) / 2}`;
    const k = sayim.get(anahtar) || { kisa, uzun, adet: 0 };
    k.adet++;
    sayim.set(anahtar, k);
  }
  let secili = null;
  for (const k of sayim.values()) {
    if (!secili || k.adet > secili.adet || (k.adet === secili.adet && k.kisa * k.uzun > secili.kisa * secili.uzun)) secili = k;
  }
  for (const k of STANDART_KAGITLAR) {
    if (Math.abs(k.g - secili.kisa) <= 2 && Math.abs(k.y - secili.uzun) <= 2) return kagitKur(k.ad, k.g, k.y);
  }
  return kagitKur(null, secili.kisa, secili.uzun);
}

/**
 * Sayfanın dikey kâğıt üzerindeki yerleşimi. yatay: sayfa 90° döndürülerek basılır. genislikMm × yukseklikMm sayfa görüntüsünün
 * döndürülmeden önceki ölçüsü (CSS'te width / height), kutuGenislikMm × kutuYukseklikMm kâğıtta kapladığı kutu. Görüntü kâğıdın
 * ortasındadır.
 *   "sigdir": oran korunarak kâğıda (GUVENLI_KENAR_MM payıyla) sığdırılır; küçük sayfa büyütülür.
 *   "gercek": PDF'teki ölçüsüyle; taşan kısım kesilir.
 */
export function sayfaYerlesimi(sayfa, kagit, olcekModu = 'sigdir') {
  const { g, y } = olcu(sayfa);
  const yatay = g > y;
  const kutuG = (yatay ? y : g) * PT_MM, kutuY = (yatay ? g : y) * PT_MM;
  let olcek = 1;
  if (olcekModu !== 'gercek') {
    olcek = Math.min((kagit.genislikMm - 2 * GUVENLI_KENAR_MM) / kutuG, (kagit.yukseklikMm - 2 * GUVENLI_KENAR_MM) / kutuY);
    if (!Number.isFinite(olcek) || olcek <= 0) olcek = 1;
  }
  return { yatay, olcek, genislikMm: g * PT_MM * olcek, yukseklikMm: y * PT_MM * olcek, kutuGenislikMm: kutuG * olcek, kutuYukseklikMm: kutuY * olcek };
}

/** Kâğıdın penceredeki adı: standartsa adı (A4), değilse ölçüsü ("216 × 330 mm"). */
export function kagitEtiketi(kagit) {
  if (kagit?.ad) return kagit.ad;
  const mm = (v) => String(Math.round(v));
  return `${mm(kagit.genislikMm)} × ${mm(kagit.yukseklikMm)} mm`;
}

/** Ön izlemenin altındaki özet: "3 sayfa", "3 sayfa × 2 kopya". */
export function ozetMetni(sayfaSayisi, kopya = 1) {
  const n = Number(sayfaSayisi) || 0;
  const k = Math.max(1, Math.floor(Number(kopya) || 1));
  return k > 1 ? `${n} sayfa × ${k} kopya` : `${n} sayfa`;
}

/**
 * Ön izleme görüntüsünün çözünürlüğü: sayfa görüntüsünün ekrandaki uzun kenarı (kâğıdın piksel ölçüsü, yerleşim ve ekran ölçeğiyle)
 * keskin çıksın; 8'in katına yuvarlanır (pencere biraz büyüyüp küçülünce önbellekteki görüntü yeniden kullanılsın), 24–200 dpi.
 */
export function onizlemeDpi({ sayfa, kagit, olcek, kagitPikselGenislik, ekranOlcegi = 1 }) {
  const yer = sayfaYerlesimi(sayfa, kagit, olcek);
  const { g, y } = olcu(sayfa);
  const mmPiksel = (Number(kagitPikselGenislik) || 0) / kagit.genislikMm;
  const uzunPiksel = Math.max(yer.genislikMm, yer.yukseklikMm) * mmPiksel * (Number(ekranOlcegi) || 1);
  const dpi = (uzunPiksel * 72) / Math.max(g, y);
  return Math.min(200, Math.max(24, Math.ceil(dpi / 8) * 8));
}

// ---------------------------------------------------------------- yazdırma HTML'i
/**
 * Yazdırma belgesini kurar. Sayfa sonu: her sayfa kutusu kâğıttan SAYFA_KISALTMA_MM kısa tutulur ve ikinci sayfadan itibaren
 * break-before kullanılır; böylece yüksek yazıcı DPI'sinde mm→piksel yuvarlaması bir pikselle taşsa bile araya boş sayfa girmez,
 * sonda da boş sayfa çıkmaz.
 *
 * sayfaBoyutu: kâğıt standartsa adı ('A4'; Electron'un bilinen kâğıdı), değilse mikron ölçüsü.
 *
 * @param {Array<{no:number, kaynak?:string, veri?:string, bicim?:string, genislikPt:number, yukseklikPt:number}>} sayfalar
 *   kaynak: iş klasöründeki göreli dosya adı (s0001.jpg); veri: base64 (data: URL)
 * @param {{ olcek?: 'sigdir'|'gercek', kagit?: string, baslik?: string }} secenek
 */
export function yazdirmaHtmlOlustur(sayfalar, secenek = {}) {
  if (!Array.isArray(sayfalar) || !sayfalar.length) throw new Error('Yazdırılacak sayfa yok.');
  const olcekModu = secenek.olcek === 'gercek' ? 'gercek' : 'sigdir';
  const kagit = kagitSec(sayfalar, secenek.kagit || 'belge');
  const KG = kagit.genislikMm, KY = kagit.yukseklikMm;
  const mm = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

  const parcalar = [];
  for (const s of sayfalar) {
    const yer = sayfaYerlesimi(s, kagit, olcekModu);
    const no = Number(s.no) || 0;
    parcalar.push(
      `<div class="sayfa" data-no="${no}"><img class="${yer.yatay ? 'don' : ''}" alt="Sayfa ${no}" style="width:${mm(yer.genislikMm)}mm;height:${mm(yer.yukseklikMm)}mm" src="${gorselKaynagi(s)}"></div>`,
    );
  }

  const baslik = kacis(secenek.baslik ? `${secenek.baslik} — PDEfe` : 'PDEfe yazdırma');
  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file: data:; style-src 'unsafe-inline';">
<style>
@page { size: ${mm(KG)}mm ${mm(KY)}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { width: ${mm(KG)}mm; }
.sayfa { position: relative; width: ${mm(KG)}mm; height: ${mm(KY - SAYFA_KISALTMA_MM)}mm; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
.sayfa + .sayfa { break-before: page; page-break-before: always; }
.sayfa img { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: block; image-rendering: auto; }
.sayfa img.don { transform: translate(-50%, -50%) rotate(90deg); }
@media screen { body { background: #888; } .sayfa { margin: 8mm auto; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.4); } }
@media print { html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
${parcalar.join('\n')}
</body></html>`;

  const sayfaBoyutu = kagit.ad ? kagit.ad : { genislikMikron: Math.round(kagit.genislikPt * PT_MIKRON), yukseklikMikron: Math.round(kagit.yukseklikPt * PT_MIKRON) };
  return { html, sayfaBoyutu, kagit: { genislikMm: KG, yukseklikMm: KY, ad: kagit.ad } };
}

/** <img src> değeri: göreli dosya adı (iş klasöründeki sNNNN.jpg) ya da data: URL. */
function gorselKaynagi(s) {
  if (s.kaynak != null) {
    const ad = String(s.kaynak);
    if (!/^[A-Za-z0-9_.-]+$/.test(ad) || ad.startsWith('.')) throw new Error(`Geçersiz görüntü dosya adı: ${ad}`);
    return ad;
  }
  if (typeof s.veri === 'string' && s.veri) {
    const mime = s.bicim === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${s.veri}`;
  }
  throw new Error(`Sayfa ${s.no} için görüntü kaynağı yok.`);
}

export function kacis(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
