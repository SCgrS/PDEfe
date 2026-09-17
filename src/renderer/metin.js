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
 * NFC normalizasyonu ve bozuk glif düzeltmesi yapar. Paragraflar tek satır sonuyla ayrılır: UDF/UYAP
 * editörü her satır sonunu paragraf yapar, çift satır sonu araya boş paragraf bırakıyordu.
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
  return paragraflar.map((p) => p.replace(/ {2,}/g, ' ').replace(/ ([,.;:!?])/g, '$1')).join('\n');
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
    // Girinti: satır başının sayfa kenarına uzaklığı, yazı yönünde (döndürülmüş sayfada sol kenar değil); arama vurgusu değil metin öğesi ölçülür
    const oge = span.closest('span:not(.highlight)') || span, donme = metinDonmesi(oge);
    const sol = okumaKutusu(oge.getBoundingClientRect(), donme).bas - okumaKutusu(sayfaEl.getBoundingClientRect(), donme).bas;
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

// ---------------------------------------------------------------- döndürme
/** Açıyı 0/90/180/270'e indirger (en yakın dik açı). */
export const donmeYuvarla = (d) => ((Math.round((+d || 0) / 90) * 90) % 360 + 360) % 360;

/**
 * Metin öğesinin ekrandaki yazı yönü (0/90/180/270, saat yönünde): metin katmanının toplam döndürmesi (data-main-rotation;
 * öğe katman dışındaysa sayfasındaki katmanınki, yoksa 0) + öğenin kendi açısı (PDF.js --rotate: içerikte döndürülmüş yazı,
 * ör. /Rotate 90 sayfada -90° çizilmiş, ekranda düz görünen metin ya da sayfa kenarına dikey yazılmış şerit).
 */
export function metinDonmesi(el) {
  if (!el || el.nodeType !== 1) el = el?.parentElement;
  if (!el) return 0;
  const katman = el.closest('.textLayer') || el.closest('.sayfa')?.querySelector('.textLayer');
  const ana = parseFloat(katman?.dataset.mainRotation) || 0;
  const span = katman && katman.contains(el) ? el.closest('span:not(.highlight):not(.markedContent)') : null;   // arama vurgusu değil, PDF.js metin öğesi
  return donmeYuvarla(ana + (span && katman.contains(span) ? parseFloat(span.style.getPropertyValue('--rotate')) || 0 : 0));
}

/**
 * İstemci dikdörtgenini yazı yönüne göre okuma çerçevesine çevirir: bas→son satır boyunca (okuma yönünde artar),
 * ust→alt satırdan satıra (sonraki satır yönünde artar). 0°: sol/sağ, üst/alt; 90°: yazı yukarıdan aşağı, satırlar sağdan sola;
 * 180°: sağdan sola, aşağıdan yukarı; 270°: aşağıdan yukarı, soldan sağa.
 */
export function okumaKutusu(k, donme) {
  switch (donme) {
    case 90: return { bas: k.top, son: k.bottom, ust: -k.right, alt: -k.left };
    case 180: return { bas: -k.right, son: -k.left, ust: -k.bottom, alt: -k.top };
    case 270: return { bas: -k.bottom, son: -k.top, ust: k.left, alt: k.right };
    default: return { bas: k.left, son: k.right, ust: k.top, alt: k.bottom };
  }
}

// ---------------------------------------------------------------- seçimden geometri
/** Sayfa elemanının 1 tabanlı numarası: data-sayfa; yoksa kardeşler arasındaki .sayfa sırası (görüntüleyici sayfaları sırayla ekler). */
export function sayfaNumarasi(sayfaEl) {
  const n = parseInt(sayfaEl?.dataset?.sayfa, 10);
  if (n > 0) return n;
  let i = 0;
  for (let e = sayfaEl; e; e = e.previousElementSibling) if (e.classList.contains('sayfa')) i++;
  return i || NaN;
}

/**
 * Seçimdeki metin katmanı (.textLayer) düğümlerinin istemci dikdörtgenleri, belge sırasıyla: [{sayfaEl, rect, donme}]
 * (donme: metinDonmesi, ekrandaki yazı yönü). range.getClientRects() seçimin sardığı kapsayıcıların (sayfa, katman) kutularını
 * da verdiği için her metin düğümünün yalnızca seçimle kesişen alt aralığı ölçülür; yalnızca boşluktan oluşan parçalar atlanır.
 */
export function secimMetinKutulari() {
  const sec = window.getSelection();
  if (!sec || sec.rangeCount === 0 || sec.isCollapsed) return [];
  const sonuc = [];
  const alt = document.createRange();
  for (let r = 0; r < sec.rangeCount; r++) {
    const range = sec.getRangeAt(r);
    let kok = range.commonAncestorContainer;
    if (kok.nodeType !== 1) kok = kok.parentNode;
    if (!kok) continue;
    const yuruyucu = document.createTreeWalker(kok, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!range.intersectsNode(n)) return NodeFilter.FILTER_REJECT;                                    // seçim dışı alt ağaç atlanır
        if (n.nodeType === 1) return n.classList.contains('not-katmani') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        return n.length && n.parentElement?.closest('.textLayer') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    let n;
    while ((n = yuruyucu.nextNode())) {
      const bas = n === range.startContainer ? range.startOffset : 0;
      const son = n === range.endContainer ? range.endOffset : n.length;
      if (son <= bas || !n.data.slice(bas, son).trim()) continue;
      const sayfaEl = n.parentElement.closest('.sayfa');
      if (!sayfaEl) continue;
      alt.setStart(n, bas); alt.setEnd(n, son);
      const donme = metinDonmesi(n.parentElement);
      for (const rect of alt.getClientRects()) if (rect.width >= 0.5 && rect.height >= 0.5) sonuc.push({ sayfaEl, rect, donme });
    }
  }
  return sonuc;
}

/**
 * Seçili metnin sayfa yerel piksel dikdörtgenleri: [{sayfa, x, y, w, h, donme}]; birden çok sayfaya yayılan seçimde her kutu
 * kendi sayfasıyla. donme: ekrandaki yazı yönü (90/270'te satırlar ekranda dikey şerittir).
 */
export function secimDikdortgenleri() {
  const sonuc = [];
  const sayfalar = new Map();   // sayfaEl → {no, k}
  for (const { sayfaEl, rect, donme } of secimMetinKutulari()) {
    let s = sayfalar.get(sayfaEl);
    if (!s) sayfalar.set(sayfaEl, (s = { no: sayfaNumarasi(sayfaEl), k: sayfaEl.getBoundingClientRect() }));
    if (!(s.no > 0)) continue;
    sonuc.push({ sayfa: s.no, x: rect.left - s.k.left, y: rect.top - s.k.top, w: rect.width, h: rect.height, donme: donme || 0 });
  }
  return sonuc;
}

/**
 * Aynı satırdaki dikdörtgenleri birleştirir (sayfa bazında): Map sayfa → [{x0, x1, y, h}] sayfa yerel px (ekran eksenleri).
 * Satır kalınlık ekseninde (yatay satırda y, 90/270°'de ekranda dikey şeritte x) orta noktası satırın içinde kalan ve kalınlığı
 * benzer kutular aynı satırdır; yatay ve dikey satırlar birbirine katılmaz.
 */
export function satirlaraBirlestir(dikler) {
  const gecici = new Map();   // sayfa → [{dik, a0, a1, b0, b1}]: a satır boyu, b kalınlık ekseni
  for (const d of dikler) {
    if (!gecici.has(d.sayfa)) gecici.set(d.sayfa, []);
    const satirlar = gecici.get(d.sayfa);
    const dik = donmeYuvarla(d.donme) % 180 !== 0;
    const a0 = dik ? d.y : d.x, a1 = a0 + (dik ? d.h : d.w), b0 = dik ? d.x : d.y, b1 = b0 + (dik ? d.w : d.h);
    const orta = (b0 + b1) / 2, kalin = b1 - b0;
    const s = satirlar.find((x) => x.dik === dik && orta > x.b0 && orta < x.b1 && Math.abs(x.b1 - x.b0 - kalin) < Math.max(x.b1 - x.b0, kalin));
    if (s) { s.a0 = Math.min(s.a0, a0); s.a1 = Math.max(s.a1, a1); s.b0 = Math.min(s.b0, b0); s.b1 = Math.max(s.b1, b1); }
    else satirlar.push({ dik, a0, a1, b0, b1 });
  }
  const sayfalar = new Map();
  for (const [sayfa, satirlar] of gecici) {
    sayfalar.set(sayfa, satirlar.map((s) => (s.dik ? { x0: s.b0, x1: s.b1, y: s.a0, h: s.a1 - s.a0 } : { x0: s.a0, x1: s.a1, y: s.b0, h: s.b1 - s.b0 })));
  }
  return sayfalar;
}

// ---------------------------------------------------------------- üç tıkla paragraf
/**
 * Tıklanan metin öğesinin bulunduğu paragrafı (satırlar arası aralığı dar satır dizisi) seçer. Geometri okuma çerçevesinde
 * (okumaKutusu) karşılaştırılır: döndürülmüş sayfada satırlar ekranda dikey şerit ya da ters sıralı olabilir.
 * Yalnızca tıklanan öğeyle aynı yönde yazılmış öğeler dikkate alınır (kenar şeridi gibi dik metin paragrafa katılmaz).
 */
export function paragrafSec(hedef) {
  const katman = hedef?.closest?.('.textLayer');
  if (!katman) return false;
  const hedefSpan = hedef.closest('span:not(.highlight)');   // arama vurgusuna tıklandıysa metin öğesi
  if (!hedefSpan || !katman.contains(hedefSpan)) return false;
  const donme = metinDonmesi(hedefSpan);
  const spanlar = [...katman.querySelectorAll(':scope > span, :scope .markedContent > span')]
    .filter((s) => !s.classList.contains('markedContent') && s.textContent.trim() && metinDonmesi(s) === donme);
  const kutular = new Map();
  const kut = (s) => { let k = kutular.get(s); if (!k) kutular.set(s, (k = okumaKutusu(s.getBoundingClientRect(), donme))); return k; };
  // Satırlara grupla
  const satirlar = [];
  for (const s of spanlar) {
    const k = kut(s); const orta = (k.ust + k.alt) / 2;
    const sat = satirlar.find((x) => orta > x.ust && orta < x.alt);
    if (sat) { sat.spanlar.push(s); sat.ust = Math.min(sat.ust, k.ust); sat.alt = Math.max(sat.alt, k.alt); }
    else satirlar.push({ ust: k.ust, alt: k.alt, spanlar: [s] });
  }
  satirlar.sort((a, b) => a.ust - b.ust);
  const idx = satirlar.findIndex((x) => x.spanlar.includes(hedefSpan));
  if (idx < 0) return false;
  const yukseklik = satirlar[idx].alt - satirlar[idx].ust;
  let bas = idx, son = idx;
  while (bas > 0 && satirlar[bas].ust - satirlar[bas - 1].alt < yukseklik * 0.8) bas--;
  while (son < satirlar.length - 1 && satirlar[son + 1].ust - satirlar[son].alt < yukseklik * 0.8) son++;
  let ilk = satirlar[bas].spanlar.reduce((a, b) => (kut(a).bas <= kut(b).bas ? a : b));
  let sonSpan = satirlar[son].spanlar.reduce((a, b) => (kut(a).son >= kut(b).son ? a : b));
  // DOM sırası okuma sırasına ters düşerse aralık çökmesin
  if (ilk !== sonSpan && ilk.compareDocumentPosition(sonSpan) & Node.DOCUMENT_POSITION_PRECEDING) [ilk, sonSpan] = [sonSpan, ilk];
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
