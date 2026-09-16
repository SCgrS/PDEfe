// Metin işleri: temiz kopyalama, sağ tık menüsü, üç tıkla paragraf seçimi, Türkçe normalizasyon.

/** Bilinen bozuk glif eşlemeleri (Word 2010 "Times New Roman TUR" hatası vb.). */
export const BOZUK_GLIFLER = new Map([
  ['Ġ', 'İ'], ['ġ', 'Ş'], ['Ģ', 'ş'], ['ģ', 'ş'],
  ['‟', '"'], ['ﬁ', 'fi'], ['ﬂ', 'fl'], ['­', ''],
]);

/** Karakter tabanlı, uzunluk koruyan düzeltme (arama dizini için). Çok karakterli eşlemeler uygulanmaz. */
export function glifDuzelt1e1(s) {
  let out = '';
  for (const c of s) { const y = BOZUK_GLIFLER.get(c); out += (y != null && y.length === c.length) ? y : c; }
  return out;
}

/** Tam düzeltme (kopyalama için). */
export function glifDuzelt(s) {
  let out = '';
  for (const c of s) { const y = BOZUK_GLIFLER.get(c); out += y != null ? y : c; }
  return out;
}

/** Türkçe'ye duyarlı, uzunluk koruyan küçük harfe çevirme (İ→i, I→ı). */
export function trKucuk(s) {
  let out = '';
  for (const c of s) { const l = c.toLocaleLowerCase('tr'); out += l.length === c.length ? l : c; }
  return out;
}

const NOKTALAMA_SONU = /[.:;!?…»”"’)]\s*$/;
const BASLIK = /^(MADDE\s+\d+|GEÇİCİ MADDE|BİRİNCİ|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ|ALTINCI|YEDİNCİ|SEKİZİNCİ|DOKUZUNCU|ONUNCU|[IVX]+\.\s|[A-ZÇĞİÖŞÜ]\.\s|\d+\.\s|[a-zçğıöşü]\)\s|\(\d+\))/;

/**
 * Ham (satır satır) metni temiz paragraf metnine çevirir:
 * satır sonu tirelerini birleştirir, aynı paragraftaki satırları birleştirir, boşlukları sadeleştirir,
 * NFC normalizasyonu ve bozuk glif düzeltmesi yapar.
 */
export function temizMetin(ham) {
  if (!ham) return '';
  let s = glifDuzelt(ham.normalize('NFC'));
  s = s.replace(/[-]/g, '');          // özel kullanım alanı (Wingdings madde imleri vb.)
  s = s.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/ /g, ' ');
  // Satırlar: girinti (baştaki boşluk) paragraf başlangıcı ipucudur
  const hamSatirlar = s.split('\n');
  const satirlar = hamSatirlar.map((x) => ({ metin: x.replace(/ {2,}/g, ' ').trim(), girintili: /^ {2,}\S/.test(x) }));
  const enUzun = Math.max(1, ...satirlar.map((x) => x.metin.length));
  const paragraflar = [];
  let cur = '';
  const bitir = () => { if (cur.trim()) paragraflar.push(cur.trim()); cur = ''; };
  for (let i = 0; i < satirlar.length; i++) {
    const { metin: satir, girintili } = satirlar[i];
    if (!satir) { bitir(); continue; }
    const sonrakiK = satirlar[i + 1];
    const sonraki = sonrakiK ? sonrakiK.metin : '';
    if (girintili && cur) bitir();                                     // girintili satır yeni paragraf
    if (!cur) cur = satir;
    else if (/[A-Za-zÇĞİÖŞÜçğıöşü]-$/.test(cur) && /^[a-zçğıöşü]/.test(satir)) cur = cur.slice(0, -1) + satir;  // tireyle bölünmüş kelime
    else cur += ' ' + satir;
    // Paragraf sonu kararı
    const kisa = satir.length < enUzun * 0.6;
    const noktali = NOKTALAMA_SONU.test(satir);
    const sonrakiBaslik = BASLIK.test(sonraki) || /^[A-ZÇĞİÖŞÜ]{3,}/.test(sonraki);
    if (!sonraki) bitir();
    else if (sonrakiK.girintili) bitir();
    else if (noktali && (kisa || sonrakiBaslik)) bitir();
    else if (BASLIK.test(satir) && kisa && !noktali && !/^[a-zçğıöşü]/.test(sonraki)) bitir();
  }
  bitir();
  return paragraflar.map((p) => p.replace(/ {2,}/g, ' ').replace(/ ([,.;:!?])/g, '$1')).join('\n\n');
}

/**
 * Seçimi, metin katmanı geometrisinden yararlanarak satır satır ve girintili biçimde çıkarır
 * (DOM'daki selection.toString() girinti bilgisini vermez). Sayfa değişiminde boş satır ekler.
 */
export function secimYapiliMetni() {
  const sec = window.getSelection();
  if (!sec || sec.rangeCount === 0 || sec.isCollapsed) return '';
  const range = sec.getRangeAt(0);
  let kok = range.commonAncestorContainer;
  if (kok.nodeType !== 1) kok = kok.parentElement;
  const yuruyucu = document.createTreeWalker(kok, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (n.nodeType === 1) return n.tagName === 'BR' && range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      return range.intersectsNode(n) && n.parentElement?.closest('.textLayer') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const satirlar = [];
  let cur = null, sonSayfa = null;
  const yeniSatir = () => { if (cur && cur.parcalar.length) satirlar.push(cur); cur = null; };
  let n;
  while ((n = yuruyucu.nextNode())) {
    if (n.nodeType === 1) { yeniSatir(); continue; }
    const span = n.parentElement;
    const sayfaEl = span.closest('.sayfa');
    if (sayfaEl !== sonSayfa) { yeniSatir(); if (sonSayfa) satirlar.push({ bos: true }); sonSayfa = sayfaEl; }
    let metin = n.textContent;
    if (n === range.endContainer) metin = metin.slice(0, range.endOffset);
    if (n === range.startContainer) metin = metin.slice(range.startOffset);
    if (!metin) continue;
    const sol = span.getBoundingClientRect().left - sayfaEl.getBoundingClientRect().left;
    const olcek = parseFloat(getComputedStyle(sayfaEl).getPropertyValue('--total-scale-factor')) || 1;
    if (!cur) cur = { parcalar: [], sol: sol / olcek };
    cur.parcalar.push(metin);
  }
  yeniSatir();
  if (!satirlar.length) return '';
  const sollar = satirlar.filter((s) => !s.bos).map((s) => s.sol);
  const enSol = Math.min(...sollar);
  return satirlar.map((s) => (s.bos ? '' : ((s.sol - enSol > 8 ? '    ' : '') + s.parcalar.join('')))).join('\n');
}

/** Ham modda yalnızca temel düzeltme: NFC, bozuk glif, Windows satır sonu. */
export function hamMetin(ham) {
  return glifDuzelt((ham || '').normalize('NFC')).replace(/\r\n?/g, '\n');
}

// ---------------------------------------------------------------- seçimden geometri
/** Seçimin, üzerinde bulunduğu metin katmanlarını ve sayfa yerel piksel dikdörtgenlerini döndürür. */
export function secimDikdortgenleri() {
  const sec = window.getSelection();
  if (!sec || sec.rangeCount === 0 || sec.isCollapsed) return [];
  const sonuc = [];
  for (let r = 0; r < sec.rangeCount; r++) {
    const range = sec.getRangeAt(r);
    for (const rect of range.getClientRects()) {
      if (rect.width < 0.5 || rect.height < 0.5) continue;
      const el = document.elementFromPoint(rect.left + 1, rect.top + rect.height / 2);
      const sayfaEl = el?.closest?.('.sayfa') || range.startContainer.parentElement?.closest('.sayfa');
      if (!sayfaEl) continue;
      const k = sayfaEl.getBoundingClientRect();
      sonuc.push({ sayfa: +sayfaEl.dataset.sayfa, x: rect.left - k.left, y: rect.top - k.top, w: rect.width, h: rect.height });
    }
  }
  return sonuc;
}

/** Aynı satırdaki dikdörtgenleri birleştirir (sayfa bazında). */
export function satirlaraBirlestir(dikler) {
  const sayfalar = new Map();
  for (const d of dikler) {
    if (!sayfalar.has(d.sayfa)) sayfalar.set(d.sayfa, []);
    const satirlar = sayfalar.get(d.sayfa);
    const orta = d.y + d.h / 2;
    let s = satirlar.find((x) => orta > x.y && orta < x.y + x.h && Math.abs(x.h - d.h) < Math.max(x.h, d.h));
    if (s) { s.x0 = Math.min(s.x0, d.x); s.x1 = Math.max(s.x1, d.x + d.w); s.y = Math.min(s.y, d.y); s.h = Math.max(s.y + s.h, d.y + d.h) - s.y; }
    else satirlar.push({ x0: d.x, x1: d.x + d.w, y: d.y, h: d.h });
  }
  return sayfalar;
}

// ---------------------------------------------------------------- üç tıkla paragraf
/** Tıklanan metin öğesinin bulunduğu paragrafı (dikey aralığı dar satır dizisi) seçer. */
export function paragrafSec(hedefSpan) {
  const katman = hedefSpan.closest('.textLayer');
  if (!katman) return false;
  const spanlar = [...katman.querySelectorAll(':scope > span, :scope .markedContent > span')].filter((s) => s.textContent.trim());
  const kut = (s) => s.getBoundingClientRect();
  // Satırlara grupla
  const satirlar = [];
  for (const s of spanlar) {
    const k = kut(s); const orta = k.top + k.height / 2;
    let sat = satirlar.find((x) => orta > x.top && orta < x.bottom);
    if (sat) { sat.spanlar.push(s); sat.top = Math.min(sat.top, k.top); sat.bottom = Math.max(sat.bottom, k.bottom); }
    else satirlar.push({ top: k.top, bottom: k.bottom, spanlar: [s] });
  }
  satirlar.sort((a, b) => a.top - b.top);
  const idx = satirlar.findIndex((x) => x.spanlar.includes(hedefSpan));
  if (idx < 0) return false;
  const yukseklik = satirlar[idx].bottom - satirlar[idx].top;
  let bas = idx, son = idx;
  while (bas > 0 && satirlar[bas].top - satirlar[bas - 1].bottom < yukseklik * 0.8) bas--;
  while (son < satirlar.length - 1 && satirlar[son + 1].top - satirlar[son].bottom < yukseklik * 0.8) son++;
  const ilk = satirlar[bas].spanlar.reduce((a, b) => (kut(a).left <= kut(b).left ? a : b));
  const sonSpan = satirlar[son].spanlar.reduce((a, b) => (kut(a).right >= kut(b).right ? a : b));
  const sec = window.getSelection();
  const r = document.createRange();
  r.setStart(ilk.firstChild || ilk, 0);
  const sonDugum = sonSpan.firstChild || sonSpan;
  r.setEnd(sonDugum, sonDugum.nodeType === 3 ? sonDugum.length : sonDugum.childNodes.length);
  sec.removeAllRanges(); sec.addRange(r);
  return true;
}

/** Seçili metnin içindeki paragraf/satır yapısını (DOM'dan) döndürür. */
export function secimHamMetni() {
  const sec = window.getSelection();
  return sec ? sec.toString() : '';
}
