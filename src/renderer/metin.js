// Metin işleri: temiz kopyalama, sağ tık menüsü, sürükleyerek seçim, üç tıkla paragraf seçimi, Türkçe normalizasyon.

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
  if (gorselGecerli()) return girintiliBirlestir(gorselSatirlar());
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
  return girintiliBirlestir(satirlar);
}

/** Satırları ({parcalar, sol} ya da sayfa arası {bos}) metne çevirir: en soldakinden 8 pt'den fazla içeride başlayan satır girintili. */
function girintiliBirlestir(satirlar) {
  if (!satirlar.some((s) => !s.bos)) return '';
  const sollar = satirlar.filter((s) => !s.bos).map((s) => s.sol);
  const enSol = Math.min(...sollar);
  return satirlar.map((s) => (s.bos ? '' : ((s.sol - enSol > 8 ? '    ' : '') + s.parcalar.join('')))).join('\n');
}

/** Satır başının sayfa kenarına uzaklığı (pt), yazı yönünde (secimYapiliMetni ile aynı ölçü). */
function satirSolu(oge, sayfaEl) {
  const donme = metinDonmesi(oge);
  const sol = okumaKutusu(oge.getBoundingClientRect(), donme).bas - okumaKutusu(sayfaEl.getBoundingClientRect(), donme).bas;
  return sol / (parseFloat(getComputedStyle(sayfaEl).getPropertyValue('--total-scale-factor')) || 1);
}

/**
 * Okuma sırasındaki seçimin satırları: [{parcalar, sol} | {bos}] (sayfa değişiminde bos). Satır, seçimi kurarken öğeye yazılan okuma
 * satırıdır (içerikteki satır sonu değil); boşluk öğeleri bulundukları satıra katılır. Aynı satırdaki iki öğe arasında görünür aralık
 * varsa ama metinde boşluk yoksa (PDF'te boşluk karakteri yazılmamış) bir boşluk eklenir.
 */
function gorselSatirlar() {
  const satirlar = [];
  let cur = null, sonSayfa = null;
  for (const range of gorsel.araliklar) {
    let kok = range.commonAncestorContainer;
    if (kok.nodeType !== 1) kok = kok.parentElement;
    const yuruyucu = document.createTreeWalker(kok, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (range.intersectsNode(n) && n.parentElement?.closest('.textLayer') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    for (let n; (n = yuruyucu.nextNode());) {
      let metin = n.data;
      if (n === range.endContainer) metin = metin.slice(0, range.endOffset);
      if (n === range.startContainer) metin = metin.slice(range.startOffset);
      if (!metin) continue;
      const sayfaEl = n.parentElement.closest('.sayfa');
      if (!sayfaEl) continue;
      let oge = n.parentElement;
      while (oge && !gorsel.ogeler.has(oge) && !oge.classList.contains('textLayer')) oge = oge.parentElement;
      const bilgi = oge && gorsel.ogeler.get(oge);
      if (sayfaEl !== sonSayfa) { if (cur) satirlar.push(cur); cur = null; if (sonSayfa) satirlar.push({ bos: true }); sonSayfa = sayfaEl; }
      if (bilgi && cur && cur.anahtar && cur.anahtar !== bilgi.anahtar) { satirlar.push(cur); cur = null; }
      if (!cur) cur = { anahtar: null, parcalar: [], sol: 0, solVar: false, onceki: null };
      if (bilgi && !cur.anahtar) cur.anahtar = bilgi.anahtar;
      if (bilgi && !cur.solVar && metin.trim()) { cur.sol = satirSolu(oge, sayfaEl); cur.solVar = true; }   // girinti ilk sözcükten (baştaki boşluk öğesinden değil)
      if (bilgi && cur.onceki && cur.onceki !== bilgi && bilgi.bas - cur.onceki.son > cur.onceki.kalin * 0.15
        && !/\s$/.test(cur.parcalar.at(-1) || '') && !/^\s/.test(metin)) cur.parcalar.push(' ');
      cur.parcalar.push(metin);
      if (bilgi) cur.onceki = bilgi;
    }
  }
  if (cur) satirlar.push(cur);
  return satirlar.filter((s) => s.bos || s.parcalar.join('').trim());
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
  const sonuc = [];
  const alt = document.createRange();
  for (const range of secimAraliklari()) {   // okuma sırasındaki seçimde yalnızca seçilen parçalar
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
 * Tıklanan metin öğesinin bulunduğu paragrafı okuma sırasıyla seçer (bkz. secimKur): sayfa modelinin (sayfaModeli) üstten alta
 * satırlarından, tıklanan satırın çevresinde paragrafSatirlari'nin birlikte saydıkları. İçerikte araya giren üst/alt bilgi ya da
 * önceki başlık seçime girmez. Geometri okuma çerçevesindedir (döndürülmüş sayfa); başka yönde yazılmış öğeye (kenar şeridi)
 * tıklanınca yalnızca o öğe seçilir.
 */
export function paragrafSec(hedef) {
  const katman = hedef?.closest?.('.textLayer');
  const sayfaEl = katman?.closest('.sayfa');
  if (!sayfaEl) return false;
  const hedefSpan = hedef.closest('span:not(.highlight)');   // arama vurgusuna tıklandıysa metin öğesi
  if (!hedefSpan || !katman.contains(hedefSpan)) return false;
  const onbellek = new Map();
  const model = sayfaModeli(sayfaEl, sayfaEl.getBoundingClientRect(), onbellek);
  if (!model) return false;
  const oge = (span, ofset) => ({ girdi: { el: sayfaEl }, span, ofset });
  const yan = model.yanlar.find((x) => x.span === hedefSpan);
  if (yan) return secimKur(null, onbellek, oge(yan.span, 0), oge(yan.span, yan.span.textContent.length));
  let idx = model.satirlar.findIndex((L) => L.ogeler.some((x) => x.span === hedefSpan));
  if (idx < 0) {   // modelde olmayan (boşluk) öğe: ortası içinde kaldığı satır
    const r = hedefSpan.getBoundingClientRect(), k = sayfaEl.getBoundingClientRect();
    const o = okumaKutusu({ left: r.left - k.left, right: r.right - k.left, top: r.top - k.top, bottom: r.bottom - k.top }, model.ana);
    idx = model.satirlar.findIndex((L) => (o.ust + o.alt) / 2 > L.ust && (o.ust + o.alt) / 2 < L.alt);
  }
  if (idx < 0) return false;
  const [bas, son] = paragrafSatirlari(model.satirlar, idx);
  const sonOge = model.satirlar[son].ogeler.at(-1);
  return secimKur(null, onbellek, oge(model.satirlar[bas].ogeler[0].span, 0), oge(sonOge.span, sonOge.span.textContent.length));
}

/**
 * Üstten alta sıralı satırlarda (okuma çerçevesi) idx. satırın paragrafı: [ilk, son] satır indeksleri. Komşu satır aynı paragraftadır:
 * aradaki boşluk satır kalınlığının 0,8'inden az, kalınlığı benzer (yazı boyu), satır aralığı (üstten üste) paragrafınkiyle tutarlı
 * (başlık/üst bilgi daha sık ya da seyrek durur), alttaki satır girintili değil (girinti yeni paragraf başlatır) ve üstteki satır
 * kısa değil (paragrafın son satırı: iki yana yaslı sayfada tam satırların bittiği kenardan bir satır kalınlığından fazla önce biter;
 * yaslı değilse genişliğin üçte birinden fazla kısadır).
 */
function paragrafSatirlari(satirlar, idx) {
  const kalin = (L) => L.alt - L.ust;
  const h = kalin(satirlar[idx]);
  const sonlar = satirlar.map((L) => L.son).sort((a, b) => b - a);
  const genislik = sonlar[0] - Math.min(...satirlar.map((L) => L.bas));
  // Tam satırların bittiği kenar: en çok satır sonunun toplandığı dar bant
  let kenar = sonlar[0], enCok = 0;
  for (let i = 0, j = 0; i < sonlar.length; i++) {
    while (sonlar[j] < sonlar[i] - h / 4) j++;   // azalan sırada [j..i] bandı: sonlar[j] - sonlar[i] ≤ h/4
    if (i - j + 1 > enCok) { enCok = i - j + 1; kenar = sonlar[j]; }
  }
  const yasli = enCok >= Math.max(3, satirlar.length * 0.4);
  const kisa = (L) => (yasli ? L.son < kenar - h : L.son < sonlar[0] - genislik / 3);
  let adim = null;   // paragrafın satır aralığı
  const birlikte = (U, A) => {
    if (A.ust - U.alt >= h * 0.8 || Math.abs(kalin(A) - kalin(U)) > Math.max(kalin(A), kalin(U)) * 0.12) return false;
    if (kisa(U) || A.bas - U.bas > h) return false;
    const a = A.ust - U.ust;
    if (adim !== null && Math.abs(a - adim) > Math.max(2, adim * 0.15)) return false;
    if (adim === null) adim = a;
    return true;
  };
  let bas = idx, son = idx;
  while (son + 1 < satirlar.length && birlikte(satirlar[son], satirlar[son + 1])) son++;
  while (bas > 0 && birlikte(satirlar[bas - 1], satirlar[bas])) bas--;
  return [bas, son];
}

// ---------------------------------------------------------------- sürükleyerek seçim
// Tarayıcının kendi seçimi yalnızca harfin üstüne basınca başlar (.sayfa ve body user-select:none) ve mutlak konumlu metin
// katmanında fare boşluğa gelince seçim sayfa başına/sonuna sıçrar. Referans okuyucudaki gibi: sayfanın herhangi bir yerine basıp
// sürükleyince basılan noktaya en yakın metin konumundan farenin altındaki (ya da en yakın) metin konumuna kadar seçilir;
// konumlar metin katmanı geometrisinden (okuma çerçevesinde satırlar) hesaplanır, seçim setBaseAndExtent ile kurulur.

const SECIM_DISI = '[data-id], .baglanti, .form-katmani, .yazi-duzenleyici, .yazi-bicim, .yazi-tutamac, .yazi-boyut, .yazi-cizim, .not-balonu, #secim-cubugu, input, textarea, select, button';
const SURUKLEME_ESIGI = 3;   // px: bundan kısa hareket tıklamadır (seçim oluşturmaz)
const KENAR_KAYDIRMA = 8;    // px: fare kaydırıcının kenarına bu kadar yaklaşınca ya da dışına çıkınca otomatik kaydırma

/** Katmanın metin öğeleri (PDF.js span'leri; satır sonu br ve endOfContent hariç, arama vurgusunun iç span'leri dahil değil). */
const katmanOgeleri = (katman) => [...katman.children].filter((s) => s.tagName === 'SPAN' && s.getAttribute('role') !== 'img');

/**
 * Basış metin seçimi başlatır mı: hedef bir sayfada, not/bağlantı/düzenleyici üstünde değil ve sayfanın metin katmanında metin var.
 * Döner: sayfa elemanı ya da null. Seçim çubuğu (notlar.js) ve sürükleyerek seçim aynı kararı kullanır.
 */
export function secimBaslangicSayfasi(hedef) {
  const el = hedef?.nodeType === 1 ? hedef : hedef?.parentElement;
  if (!el || el.closest(SECIM_DISI)) return null;
  const sayfaEl = el.closest('.sayfa');
  const katman = sayfaEl?.querySelector(':scope > .textLayer');
  return katman && katmanOgeleri(katman).some((s) => s.textContent.trim()) ? sayfaEl : null;
}

/** Öğenin metin düğümleri boyunca karakter konumu → [düğüm, ofset] (arama vurgusu öğeyi birkaç düğüme bölebilir). */
function dugumKonumu(span, ofset) {
  const y = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
  let n, son = null;
  while ((n = y.nextNode())) { if (ofset <= n.length) return [n, ofset]; ofset -= n.length; son = n; }
  return son ? [son, son.length] : [span, 0];
}

/**
 * Sayfanın seçim modeli (sayfa yerel px, okuma çerçevesinde): ana yazı yönündeki öğeler satırlara gruplanır; başka yönde yazılmış
 * öğeler (kenar şeridi vb.) yalnızca fare üstlerindeyken kullanılır. Sürükleme boyunca önbellekte (boyut ya da katman değişirse yenilenir).
 */
function sayfaModeli(sayfaEl, k, onbellek) {
  const katman = sayfaEl.querySelector(':scope > .textLayer');
  if (!katman) return null;
  const onceki = onbellek.get(sayfaEl);
  if (onceki && onceki.katman === katman && Math.abs(onceki.w - k.width) < 0.5 && Math.abs(onceki.h - k.height) < 0.5 && onceki.n === katman.childElementCount) return onceki;
  const ogeler = [], bosluklar = [], agirlik = new Map();
  katmanOgeleri(katman).forEach((span) => {
    const metin = span.textContent;
    if (!metin) return;
    const r = span.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return;
    const donme = metinDonmesi(span);
    const rr = { left: r.left - k.left, right: r.right - k.left, top: r.top - k.top, bottom: r.bottom - k.top };
    const oge = { span, donme, rr, o: okumaKutusu(rr, donme) };
    if (!metin.trim()) { bosluklar.push(oge); return; }   // yalnızca boşluk: konum aranmaz, seçimde bulunduğu satıra katılır
    ogeler.push(oge);
    agirlik.set(donme, (agirlik.get(donme) || 0) + metin.length);
  });
  let ana = 0, enCok = -1;
  for (const [d, a] of agirlik) if (a > enCok) { enCok = a; ana = d; }
  const satirlar = [];
  for (const oge of ogeler.filter((x) => x.donme === ana).sort((a, b) => a.o.ust - b.o.ust)) {
    const { o } = oge, orta = (o.ust + o.alt) / 2;
    let sat = null;
    for (let j = satirlar.length - 1; j >= 0 && j >= satirlar.length - 8; j--) {   // üstten sıralı: aday satırlar son eklenenler
      const L = satirlar[j];
      if ((orta > L.ust && orta < L.alt) || (L.orta > o.ust && L.orta < o.alt)) { sat = L; break; }
    }
    if (sat) { sat.ogeler.push(oge); sat.ust = Math.min(sat.ust, o.ust); sat.alt = Math.max(sat.alt, o.alt); sat.bas = Math.min(sat.bas, o.bas); sat.son = Math.max(sat.son, o.son); }
    else satirlar.push({ ust: o.ust, alt: o.alt, orta, bas: o.bas, son: o.son, ogeler: [oge] });
  }
  for (const L of satirlar) L.ogeler.sort((a, b) => a.o.bas - b.o.bas);
  satirlar.sort((a, b) => a.ust - b.ust);
  const yanlar = ogeler.filter((x) => x.donme !== ana);
  // Okuma sırası (seçim bu sırayla kurulur; içerik sırası farklı olabilir: Word ve UYAP'ta alt bilgi içerikte gövdeden önce gelir):
  // satırlar üstten alta, satırda baştan sona; başka yönde yazılmış öğe, ana yöndeki başlangıcına göre tek başına bir satırdır.
  // Boşluk öğeleri ortası içinde kaldığı satıra katılır (sözcükler arası boşluk seçimde boyanır ve kopyalanır; satırın ölçülerine girmez)
  const tum = new Map(satirlar.map((L) => [L, [...L.ogeler]]));
  for (const b of bosluklar) {
    if (b.donme !== ana) continue;
    const orta = (b.o.ust + b.o.alt) / 2, L = satirlar.find((x) => orta > x.ust && orta < x.alt);
    if (L) tum.get(L).push(b);
  }
  const siraSatirlari = [...satirlar.map((L) => ({ ust: L.ust, ogeler: tum.get(L).sort((a, b) => a.o.bas - b.o.bas) })),
    ...yanlar.map((oge) => ({ ust: okumaKutusu(oge.rr, ana).ust, ogeler: [oge] }))].sort((a, b) => a.ust - b.ust);
  const sira = [], indeks = new Map();
  siraSatirlari.forEach((S, si) => { for (const oge of S.ogeler) { oge.satir = si; indeks.set(oge.span, sira.length); sira.push(oge); } });
  const model = { katman, w: k.width, h: k.height, n: katman.childElementCount, ana, satirlar, yanlar, sira, indeks };
  onbellek.set(sayfaEl, model);
  return model;
}

/** Öğe içinde okuma yönündeki pb konumuna en yakın karakter sınırı (0..uzunluk); karakter kutuları ikili aramayla ölçülür. */
function ogeIciOfset(oge, pb, k) {
  const uzunluk = oge.span.textContent.length;
  if (!uzunluk) return 0;
  if (pb <= oge.o.bas) return 0;
  if (pb >= oge.o.son) return uzunluk;
  const r = document.createRange();
  const dugumler = [];
  for (let y = document.createTreeWalker(oge.span, NodeFilter.SHOW_TEXT), n; (n = y.nextNode());) dugumler.push(n);
  const kutu = (c) => {   // c. karakterin kutusu (karakter, sınırdaki önceki düğümün sonu değil içinde bulunduğu düğümden ölçülür)
    let n = null, o = c;
    for (const x of dugumler) { if (o < x.length) { n = x; break; } o -= x.length; }
    if (!n) return null;
    r.setStart(n, o); r.setEnd(n, o + 1);
    const b = r.getBoundingClientRect();
    return okumaKutusu({ left: b.left - k.left, right: b.right - k.left, top: b.top - k.top, bottom: b.bottom - k.top }, oge.donme);
  };
  let lo = 0, hi = uzunluk - 1;   // okuma yönünde sonu pb'yi geçen ilk karakter
  while (lo < hi) { const orta = (lo + hi) >> 1; const b = kutu(orta); if (b && b.son > pb) hi = orta; else lo = orta + 1; }
  const b = kutu(lo);
  return b && pb > (b.bas + b.son) / 2 ? lo + 1 : lo;
}

/**
 * İstemci noktasına en yakın metin konumu: {span, ofset} ya da null. Nokta bir sayfanın üstünde değilse en yakın (metni olan) sayfa
 * alınır. Sayfada önce dikeyde (okuma çerçevesinde satırdan satıra) en yakın satır, eşitlikte yatayda yakın olan; satırda yatay
 * konuma göre öğe ve karakter sınırı. Satır başının solu satır başı, sonunun sağı satır sonudur; iki öğe arasındaki boşlukta yakın olan kenar.
 */
function enYakinKonum(gorunum, x, y, onbellek) {
  const adaylar = [];
  for (const s of gorunum.sayfalar) {
    if (!s.textLayer) continue;
    const k = s.el.getBoundingClientRect();
    if (!k.width || !k.height) continue;   // tek/iki düzende gizli sayfa
    adaylar.push({ s, k, m: Math.hypot(Math.max(0, k.left - x, x - k.right), Math.max(0, k.top - y, y - k.bottom)) });
  }
  adaylar.sort((a, b) => a.m - b.m);
  for (const { s, k } of adaylar) {
    const model = sayfaModeli(s.el, k, onbellek);
    if (!model || (!model.satirlar.length && !model.yanlar.length)) continue;
    const px = x - k.left, py = y - k.top;
    // Başka yönde yazılmış öğe yalnızca fare üstündeyse
    for (const oge of model.yanlar) {
      const p = okumaKutusu({ left: px, right: px, top: py, bottom: py }, oge.donme);
      if (p.bas >= oge.o.bas - 2 && p.bas <= oge.o.son + 2 && p.ust >= oge.o.ust - 2 && p.ust <= oge.o.alt + 2) return { girdi: s, span: oge.span, ofset: ogeIciOfset(oge, p.bas, k) };
    }
    if (!model.satirlar.length) continue;
    const p = okumaKutusu({ left: px, right: px, top: py, bottom: py }, model.ana);
    // Karşılaştırma: satır bandına uzaklık; bantlar örtüşüyorsa (sık satır aralığı) bant ortasına uzaklık; sonra yatay uzaklık
    let enIyi = null, enIyiA = null;
    for (const L of model.satirlar) {
      const d = Math.max(0, L.ust - p.ust, p.ust - L.alt);
      const a = [d, d ? 0 : Math.abs(p.ust - (L.ust + L.alt) / 2), Math.max(0, L.bas - p.bas, p.bas - L.son)];
      if (!enIyiA || a[0] < enIyiA[0] || (a[0] === enIyiA[0] && (a[1] < enIyiA[1] || (a[1] === enIyiA[1] && a[2] < enIyiA[2])))) { enIyi = L; enIyiA = a; }
    }
    // Satırlardan uzak boşluk (paragraf arası, sayfanın üstü/altı): konum okuma sırasında boşluğun yeridir, altındaki satırın başı
    // (altında satır yoksa sayfa metninin sonu). Aşağı sürüklemede seçim üstteki son satırın sonunda, yukarı sürüklemede alttaki
    // ilk satırın başında biter; farenin henüz ulaşmadığı en yakın satır (ör. sayfa altındaki alt bilgi) seçime girmez
    if (enIyiA[0] > (enIyi.alt - enIyi.ust) / 2) {
      const alti = model.satirlar.find((L) => (L.ust + L.alt) / 2 > p.ust);
      if (alti) return { girdi: s, span: alti.ogeler[0].span, ofset: 0 };
      const son = model.sira[model.sira.length - 1];
      return { girdi: s, span: son.span, ofset: son.span.textContent.length };
    }
    const og = enIyi.ogeler;
    if (p.bas <= og[0].o.bas) return { girdi: s, span: og[0].span, ofset: 0 };
    for (let i = 0; i < og.length; i++) {
      const o = og[i];
      if (p.bas <= o.o.son) return { girdi: s, span: o.span, ofset: ogeIciOfset(o, p.bas, k) };
      const sonraki = og[i + 1];
      if (sonraki && p.bas < sonraki.o.bas) {
        return p.bas - o.o.son <= sonraki.o.bas - p.bas ? { girdi: s, span: o.span, ofset: o.span.textContent.length } : { girdi: s, span: sonraki.span, ofset: 0 };
      }
    }
    const son = og[og.length - 1];
    return { girdi: s, span: son.span, ofset: son.span.textContent.length };
  }
  return null;
}

/** Konumun güncel öğesi: katman yeniden kurulduysa (yakınlaştırma/boşaltma) aynı sıradaki öğe. */
function konumOgesi(konum) {
  if (konum.span.isConnected) return konum.span;
  const katman = konum.girdi?.el.querySelector(':scope > .textLayer');
  const yeni = katman && katman.children[konum.sira];
  return yeni && yeni.tagName === 'SPAN' ? (konum.span = yeni) : null;
}

// ---------------------------------------------------------------- okuma sırasındaki seçim
// Sürükleme, çift ve üç tıklamayla kurulan seçim içerik (DOM) sırasıyla değil okuma sırasıyla (sayfaModeli.sira) kurulur: metin
// katmanında öğeler içerik sırasındadır ve Word/UYAP belgelerinde sayfanın altındaki alt bilgi içerikte gövdeden önce gelir; tek bir
// DOM aralığı farenin geçmediği satırları da kapsardı. Seçilen öğe parçaları, DOM'da ardışık olanlar birleştirilerek aralıklara bölünür.
// Tarayıcı seçimi bu aralıkları kapsayan tek aralıktır (seçim var mı, kopyala olayı, katmanın tutulması için). Tek aralıksa (okuma ve
// içerik sırası aynı: çoğu seçim) tarayıcı seçimi olduğu gibi boyanır; birden çok aralıkta tarayıcı seçimi boyanmaz, aralıklar CSS
// vurgusu (::highlight) olarak boyanır. Seçimi okuyan işlevler (metin, kutular) geçerliyken aralıkları kullanır.

const SECIM_VURGUSU = 'pdefe-secim';
let gorsel = null;   // {gorunum, araliklar: Range[] okuma sırasıyla, ogeler: Map span → {anahtar, bas, son, kalin}, capa, odak, kapsam: [sc, so, ec, eo], imza}

/** Okuma sırasındaki seçimi ve boyamasını kaldırır (tarayıcı seçimine dokunmaz). */
function gorselTemizle() {
  gorsel = null;
  try { CSS.highlights?.delete(SECIM_VURGUSU); } catch { /* yok say */ }
  document.documentElement.classList.remove('gorsel-secim');
}

/** Okuma sırasındaki seçim hâlâ tarayıcı seçimiyle aynı mı (başka bir yol seçimi değiştirdiyse ya da kaldırdıysa temizlenir). */
function gorselGecerli() {
  if (!gorsel) return false;
  const sec = window.getSelection();
  if (sec && sec.rangeCount === 1) {
    const r = sec.getRangeAt(0), [sc, so, ec, eo] = gorsel.kapsam, { imza } = gorsel;
    const ayni = !sec.isCollapsed && r.startContainer === sc && r.startOffset === so && r.endContainer === ec && r.endOffset === eo;
    const kopuk = !sc.isConnected || !ec.isConnected;
    const kaydi = gorsel.araliklar.some((a, j) => a.startContainer !== imza[4 * j] || a.startOffset !== imza[4 * j + 1] || a.endContainer !== imza[4 * j + 2] || a.endOffset !== imza[4 * j + 3]);
    if (ayni && !kopuk && !kaydi) return true;
    // Öğelerin içi yeniden yazıldıysa (arama vurgusu eklendi/kaldırıldı: metin düğümleri değişir, öğeler kalır; tarayıcı seçimi ve
    // aralıklar kayar) seçim aynı konumlardan yeniden kurulur
    if (kopuk || (ayni && kaydi)) {
      const { gorunum, capa, odak } = gorsel;
      gorsel = null;
      if (secimKur(gorunum, new Map(), capa, odak)) return true;
    }
  }
  gorselTemizle();
  return false;
}
document.addEventListener('selectionchange', () => { if (gorsel) gorselGecerli(); });

/** Seçimi (okuma sırasındaki dahil) hemen kaldırır. */
function secimiKaldir() {
  gorselTemizle();
  const sec = window.getSelection();
  if (sec?.rangeCount) sec.removeAllRanges();
}

/** Seçimin metin aralıkları: okuma sırasındaki seçim geçerliyse onun aralıkları, değilse tarayıcı seçiminin aralıkları. */
function secimAraliklari() {
  const sec = window.getSelection();
  if (!sec || sec.rangeCount === 0 || sec.isCollapsed) return [];
  if (gorselGecerli()) return gorsel.araliklar;
  const l = [];
  for (let i = 0; i < sec.rangeCount; i++) l.push(sec.getRangeAt(i));
  return l;
}

/**
 * Konumun okuma sırasındaki yeri: {p: sayfa sırası, i: sayfa modelinde öğe sırası (model.sira), o: ofset, model} ya da null.
 * Modelde olmayan öğe (yalnızca boşluk) içerikte ardından gelen öğenin başı sayılır. gorunum yoksa (tek sayfa) p 0'dır.
 */
function siraKonumu(gorunum, onbellek, konum) {
  const span = konum && konumOgesi(konum);
  if (!span) return null;
  const sayfaEl = span.closest('.sayfa');
  const model = sayfaEl && sayfaModeli(sayfaEl, sayfaEl.getBoundingClientRect(), onbellek);
  if (!model || !model.sira.length) return null;
  let i = model.indeks.get(span), o = konum.ofset;
  if (i === undefined) {
    for (let e = span.nextElementSibling; e && i === undefined; e = e.nextElementSibling) { i = model.indeks.get(e); o = 0; }
    if (i === undefined) { i = model.sira.length - 1; o = model.sira[i].span.textContent.length; }
  }
  const p = gorunum ? gorunum.sayfalar.findIndex((s) => s.el === sayfaEl) : 0;
  return p < 0 ? null : { p, i, o, model };
}
const siraKarsilastir = (a, b) => a.p - b.p || a.i - b.i || a.o - b.o;

/** a öğesinden b öğesine (içerikte ardından gelen) arada yalnızca boşluk, satır sonu ya da boş öğe mi var. */
function arasiBos(a, b) {
  if (!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
  const r = document.createRange();
  r.setStartAfter(a); r.setEndBefore(b);
  return !r.toString().trim();
}

/**
 * Seçimi bas → odak olarak okuma sırasıyla kurar (odak basın önünde olabilir: geriye doğru seçim); aradaki sayfaların (metin katmanı
 * olanların) bütün metni dahildir. Aynı konumdaysa seçimi kaldırır. Döner: seçim kuruldu mu.
 */
function secimKur(gorunum, onbellek, bas, odak) {
  const a = siraKonumu(gorunum, onbellek, bas), b = siraKonumu(gorunum, onbellek, odak);
  if (!a || !b) return false;
  const yon = siraKarsilastir(a, b);
  if (!yon) { secimiKaldir(); return false; }
  const [ilk, son] = yon < 0 ? [a, b] : [b, a];
  const araliklar = [], ogeler = new Map();
  let aralik = null, onceki = null;
  for (let p = ilk.p; p <= son.p; p++) {
    let model = p === ilk.p ? ilk.model : p === son.p ? son.model : null;
    if (!model) { const el = gorunum?.sayfalar[p]?.el; model = el && sayfaModeli(el, el.getBoundingClientRect(), onbellek); }
    if (!model) continue;
    const i1 = p === son.p ? son.i : model.sira.length - 1;
    for (let i = p === ilk.p ? ilk.i : 0; i <= i1; i++) {
      const oge = model.sira[i], uzunluk = oge.span.textContent.length;
      const b0 = p === ilk.p && i === ilk.i ? ilk.o : 0, b1 = p === son.p && i === son.i ? son.o : uzunluk;
      if (b1 <= b0) continue;
      ogeler.set(oge.span, { anahtar: `${p}:${oge.satir}`, bas: oge.o.bas, son: oge.o.son, kalin: oge.o.alt - oge.o.ust });
      // İçerikte de ardışık olan parçalar tek aralıkta (aradaki boşluk öğeleri ve satır sonları da içinde)
      if (aralik && onceki.son === onceki.span.textContent.length && b0 === 0 && arasiBos(onceki.span, oge.span)) aralik.setEnd(...dugumKonumu(oge.span, b1));
      else {
        aralik = document.createRange();
        aralik.setStart(...dugumKonumu(oge.span, b0)); aralik.setEnd(...dugumKonumu(oge.span, b1));
        araliklar.push(aralik);
      }
      onceki = { span: oge.span, son: b1 };
    }
  }
  if (!araliklar.length) { secimiKaldir(); return false; }
  let ilkA = araliklar[0], sonA = araliklar[0];
  for (const r of araliklar) {
    if (r.compareBoundaryPoints(Range.START_TO_START, ilkA) < 0) ilkA = r;
    if (r.compareBoundaryPoints(Range.END_TO_END, sonA) > 0) sonA = r;
  }
  const kapsam = [ilkA.startContainer, ilkA.startOffset, sonA.endContainer, sonA.endOffset];
  const [an, ao, fn, fo] = yon < 0 ? kapsam : [kapsam[2], kapsam[3], kapsam[0], kapsam[1]];
  const sec = window.getSelection();
  const imza = araliklar.map((r) => [r.startContainer, r.startOffset, r.endContainer, r.endOffset]).flat();
  const ayni = sec.rangeCount === 1 && sec.anchorNode === an && sec.anchorOffset === ao && sec.focusNode === fn && sec.focusOffset === fo;
  if (ayni && gorselGecerli() && gorsel.imza.length === imza.length && gorsel.imza.every((v, j) => v === imza[j])) {   // değişmedi: yeniden boyanmaz
    Object.assign(gorsel, { capa: { ...bas }, odak: { ...odak } });
    return true;
  }
  if (!ayni) sec.setBaseAndExtent(an, ao, fn, fo);
  gorsel = { gorunum, araliklar, ogeler, capa: { ...bas }, odak: { ...odak }, kapsam, imza };
  // Tarayıcı seçim boyası sözcük aralarını ve satır sonunu da doldurur (::highlight doldurmaz): kapsayan aralık tam seçimse o kullanılır
  if (araliklar.length > 1 && window.CSS?.highlights && typeof Highlight === 'function') {
    CSS.highlights.set(SECIM_VURGUSU, new Highlight(...araliklar));
    document.documentElement.classList.add('gorsel-secim');
  } else {
    try { CSS.highlights?.delete(SECIM_VURGUSU); } catch { /* yok say */ }
    document.documentElement.classList.remove('gorsel-secim');
  }
  return true;
}

/** Konuma öğenin katmandaki sırasını ekler (katman yeniden kurulursa öğe sırayla bulunur). */
function siraEkle(konum) {
  if (konum) konum.sira = Array.prototype.indexOf.call(konum.span.parentElement.children, konum.span);
  return konum;
}

// Sözcük sınırları: tarayıcının çift tıklamadaki sözcük bölmesiyle aynı (ICU): "17-" → "17" + "-", "uygulanır." → "uygulanır" + "."
const SOZCUK_BOLUCU = new Intl.Segmenter('tr', { granularity: 'word' });

/** Öğedeki c. karakterin aralığı (arama vurgusu öğeyi birkaç düğüme bölebilir) ya da null. */
function karakterAraligi(span, c) {
  for (let y = document.createTreeWalker(span, NodeFilter.SHOW_TEXT), n; (n = y.nextNode());) {
    if (c < n.length) { const r = document.createRange(); r.setStart(n, c); r.setEnd(n, c + 1); return r; }
    c -= n.length;
  }
  return null;
}

/** Konumun iki yanındaki karakterlerden kutusu istemci noktasını içeren (fare harfin üstündeyse) ya da -1. */
function noktadakiKarakter(konum, x, y) {
  for (const c of [konum.ofset, konum.ofset - 1]) {
    const b = c >= 0 && karakterAraligi(konum.span, c)?.getBoundingClientRect();
    if (b && x >= b.left - 0.5 && x <= b.right + 0.5 && y >= b.top - 0.5 && y <= b.bottom + 0.5) return c;
  }
  return -1;
}

/** Çift tıklanan sözcük: [baş, son] konumları; sözcükse ardındaki boşluk da (Windows'ta tarayıcının çift tıklaması gibi). */
function sozcukAraligi(konum, x, y) {
  const metin = konum.span.textContent;
  if (!metin) return null;
  let c = noktadakiKarakter(konum, x, y);
  if (c < 0) c = Math.min(konum.ofset, metin.length - 1);
  const parcalar = SOZCUK_BOLUCU.segment(metin), p = parcalar.containing(c);
  let son = p.index + p.segment.length;
  if (p.isWordLike) for (let q; son < metin.length && !(q = parcalar.containing(son)).isWordLike && !q.segment.trim();) son = q.index + q.segment.length;
  return [{ ...konum, ofset: p.index }, { ...konum, ofset: son }];
}

/** Sözcük kipinde odak: farenin altındaki (boşluktaysa konumun ortasında kaldığı) sözcüğün okuma yönünde ucu (ileri: sonu, geri: başı). */
function sozcukUcu(konum, ileri, x, y) {
  const metin = konum.span.textContent, c = noktadakiKarakter(konum, x, y);
  const p = c >= 0 ? SOZCUK_BOLUCU.segment(metin).containing(c)
    : konum.ofset > 0 && konum.ofset < metin.length ? SOZCUK_BOLUCU.segment(metin).containing(konum.ofset) : null;
  if (!p || (c < 0 && p.index === konum.ofset)) return konum;   // boşlukta ve sözcük sınırında
  return { ...konum, ofset: ileri ? p.index + p.segment.length : p.index };
}

/** Var olan seçimin çapası bu görüntüleyicinin metin katmanındaysa konumu (Shift+tıkla genişletme için). */
function secimCapasi(gorunum) {
  const sec = window.getSelection();
  if (!sec || !sec.rangeCount || sec.isCollapsed) return null;
  if (gorselGecerli()) {   // okuma sırasındaki seçimin çapası (tarayıcı seçiminin ucu kapsayan aralığın ucudur)
    const span = konumOgesi(gorsel.capa);
    if (!span || !gorunum.alan.contains(span)) return null;
    const girdi = gorunum.sayfalar.find((s) => s.el.contains(span));
    return siraEkle({ ...gorsel.capa, girdi, span });
  }
  const el = sec.anchorNode?.nodeType === 1 ? sec.anchorNode : sec.anchorNode?.parentElement;
  const katman = el?.closest('.textLayer');
  if (!katman || !gorunum.alan.contains(katman)) return null;
  const span = el === katman ? null : [...katman.children].find((c) => c.contains(el));
  if (!span || span.tagName !== 'SPAN') return null;
  const r = document.createRange();
  r.setStart(span, 0); r.setEnd(sec.anchorNode, sec.anchorOffset);
  const girdi = gorunum.sayfalar.find((s) => s.el.contains(katman));
  return siraEkle({ girdi, span, ofset: r.toString().length });
}

/**
 * Görüntüleyicide sürükleyerek metin seçimini kurar. Sayfanın metin ya da boş yerine basılınca (harf üstünde üç tıklama hariç)
 * tarayıcı seçimi engellenir, fare bırakılana dek seçim canlı güncellenir, kenara gelince otomatik kaydırılır. Harfte çift tıklama
 * sözcüğü seçer, sürüklenirse seçim sözcük sözcük genişler.
 * aracAl: etkin not aracı ('not' | 'yazi' basışta not/yazı kutusu koyar, seçim başlamaz; 'vurgu' seçimle çalışır, bırakınca vurgular).
 */
export function surukleSecimiBagla(gorunum, { aracAl = () => null } = {}) {
  const { alan, kaydirici } = gorunum;
  let d = null;   // {bas, sozcuk, x0, y0, x, y, basladi, onbellek, kare, aralik}

  /** Noktaya en yakın görünür sayfanın indeksi (yerleşimden; metin katmanı olmasa da) ya da -1. */
  const noktadakiSayfa = (x, y) => {
    const a = alan.getBoundingClientRect(), cx = x - a.left, cy = y - a.top;
    let en = -1, enM = Infinity;
    gorunum.yerlesim.forEach((yer, i) => {
      if (!yer) return;
      const m = Math.hypot(Math.max(0, yer.x - cx, cx - yer.x - yer.w), Math.max(0, yer.y - cy, cy - yer.y - yer.h));
      if (m < enM) { enM = m; en = i; }
    });
    return en;
  };

  const guncelle = () => {
    if (!d || !d.basladi) return;
    // Çapa ile farenin sayfası arasında metin katmanı olmayan (hızlı kaydırmada çizilmemiş) sayfalar için katman kurulur
    const i0 = gorunum.idx(d.bas.girdi), i1 = noktadakiSayfa(d.x, d.y);
    if (i0 >= 0 && i1 >= 0 && d.aralik !== `${i0}:${i1}`) {
      d.aralik = `${i0}:${i1}`;
      for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) {
        if (!gorunum.sayfalar[i].textLayer) gorunum.metinKatmaniHazirla(i).then((kuruldu) => { if (kuruldu) guncelle(); }, () => {});
      }
    }
    const odak = siraEkle(enYakinKonum(gorunum, d.x, d.y, d.onbellek));
    if (!odak) return;
    const { onbellek } = d;
    if (!d.sozcuk) { secimKur(gorunum, onbellek, d.bas, odak); return; }
    // Sözcük kipi (harfte çift tıklayıp sürükleme): seçim sözcük sözcük genişler, çift tıklanan sözcük hep içinde kalır
    const [sb, ss] = d.sozcuk;
    const ko = siraKonumu(gorunum, onbellek, odak), kb = siraKonumu(gorunum, onbellek, sb), ks = siraKonumu(gorunum, onbellek, ss);
    if (!ko || !kb || !ks) return;
    if (siraKarsilastir(ko, kb) < 0) secimKur(gorunum, onbellek, ss, sozcukUcu(odak, false, d.x, d.y));
    else if (siraKarsilastir(ks, ko) < 0) secimKur(gorunum, onbellek, sb, sozcukUcu(odak, true, d.x, d.y));
    else secimKur(gorunum, onbellek, sb, ss);
  };

  const kaydir = () => {
    if (!d) return;
    d.kare = 0;
    if (!d.basladi) return;
    const r = kaydirici.getBoundingClientRect();
    const sol = r.left + kaydirici.clientLeft, ust = r.top + kaydirici.clientTop;
    const sag = sol + kaydirici.clientWidth, alt = ust + kaydirici.clientHeight;
    const hiz = (fark) => Math.sign(fark) * Math.min(48, Math.ceil(Math.abs(fark) / 2));
    const vy = d.y < ust + KENAR_KAYDIRMA ? hiz(d.y - ust - KENAR_KAYDIRMA) : d.y > alt - KENAR_KAYDIRMA ? hiz(d.y - alt + KENAR_KAYDIRMA) : 0;
    const vx = kaydirici.scrollWidth <= kaydirici.clientWidth ? 0 : d.x < sol + KENAR_KAYDIRMA ? hiz(d.x - sol - KENAR_KAYDIRMA) : d.x > sag - KENAR_KAYDIRMA ? hiz(d.x - sag + KENAR_KAYDIRMA) : 0;
    if (!vx && !vy) return;
    const onceki = [kaydirici.scrollLeft, kaydirici.scrollTop];
    kaydirici.scrollLeft += vx; kaydirici.scrollTop += vy;
    if (kaydirici.scrollLeft === onceki[0] && kaydirici.scrollTop === onceki[1]) return;   // kenara dayandı
    guncelle();
    d.kare = requestAnimationFrame(kaydir);
  };

  const hareket = (e) => {
    if (!d) return;
    if (!(e.buttons & 1)) { bitir(e); return; }   // bırakma pencere dışında kaçtıysa
    d.x = e.clientX; d.y = e.clientY;
    if (!d.basladi && Math.hypot(d.x - d.x0, d.y - d.y0) < SURUKLEME_ESIGI) return;
    if (!d.basladi) { d.basladi = true; document.documentElement.classList.add('metin-seciliyor'); }
    guncelle();
    if (!d.kare) kaydir();
  };

  const kaydirildi = () => guncelle();

  const bitir = (e) => {
    if (!d) return;
    if (e && e.clientX != null && d.basladi) { d.x = e.clientX; d.y = e.clientY; guncelle(); }
    if (d.kare) cancelAnimationFrame(d.kare);
    d = null;
    document.documentElement.classList.remove('metin-seciliyor');
    document.removeEventListener('mousemove', hareket, true);
    document.removeEventListener('mouseup', bitir, true);
    window.removeEventListener('blur', bitir);
    kaydirici.removeEventListener('scroll', kaydirildi);
  };

  alan.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.altKey || e.metaKey) return;
    // Harf üstünde üç tıklama tarayıcıya ve paragrafSec'e kalır; harfte çift tıklama sözcüğü seçer, sürüklenirse sözcük sözcük genişletir
    // (tarayıcınınki sürüklerken boşlukta takılıyordu). Boşlukta tıklayıp hemen sürüklemek de (detail 2) seçer
    const harfte = !!e.target.closest?.('.textLayer span');
    if (e.detail > 2 && harfte) return;
    const arac = aracAl();
    if (arac === 'not' || arac === 'yazi') return;
    const sayfaEl = secimBaslangicSayfasi(e.target);
    if (!sayfaEl || !alan.contains(sayfaEl)) return;
    const onbellek = new Map();
    const capa = e.shiftKey ? secimCapasi(gorunum) : null;
    const bas = capa || siraEkle(enYakinKonum(gorunum, e.clientX, e.clientY, onbellek));
    if (!bas) return;
    const sozcuk = e.detail === 2 && harfte && !capa ? sozcukAraligi(bas, e.clientX, e.clientY) : null;
    e.preventDefault();   // tarayıcının kendi seçimi (ve seçili metni sürükle-bırak) başlamasın
    bitir();
    if (!kaydirici.contains(document.activeElement)) kaydirici.focus({ preventScroll: true });   // tarayıcı basışta kaydırıcıya odaklanırdı (klavye kısayolları)
    if (!capa) secimiKaldir();   // boş yere tek tıklama seçimi kaldırır
    d = { bas, sozcuk, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, basladi: !!capa, onbellek, kare: 0 };
    if (capa) guncelle();
    if (sozcuk) secimKur(gorunum, onbellek, sozcuk[0], sozcuk[1]);
    document.addEventListener('mousemove', hareket, true);
    document.addEventListener('mouseup', bitir, true);
    window.addEventListener('blur', bitir);
    kaydirici.addEventListener('scroll', kaydirildi, { passive: true });
  });
}

/** Seçili metnin içindeki paragraf/satır yapısını (DOM'dan) döndürür. */
export function secimHamMetni() {
  const sec = window.getSelection();
  if (gorselGecerli()) return gorselSatirlar().filter((s) => !s.bos).map((s) => s.parcalar.join('')).join('\n');
  return sec ? sec.toString() : '';
}
