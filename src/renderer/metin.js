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
  // Satır sonundaki yumuşak tire (U+00AD; dizgide bölünmüş sözcüğün görünen tiresi) sözcüğü boşluksuz birleştirir. glifDuzelt
  // yumuşak tireyi sildiğinden önce yapılır: sonra satırlar boşlukla birleşiyor, "insan- / lara" "insan lara" oluyordu
  let s = glifDuzelt(ham.normalize('NFC').replace(/\r\n?/g, '\n').replace(/­[ \t]*\n[ \t]*(?=\S)/g, ''));
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
  // Yan yana bloklarda (sütun) tıklanan birimin yüksekliğindeki komşu blok satırları paragrafa katılmaz
  const i = model.indeks.get(hedefSpan);
  const satirlar = i === undefined ? model.satirlar : birimSatirlari(model, model.sira[i].birim);
  let idx = satirlar.findIndex((L) => L.ogeler.some((x) => x.span === hedefSpan));
  if (idx < 0) {   // satırlarda olmayan (boşluk) öğe: ortası içinde kaldığı satır
    const r = hedefSpan.getBoundingClientRect(), k = sayfaEl.getBoundingClientRect();
    const o = okumaKutusu({ left: r.left - k.left, right: r.right - k.left, top: r.top - k.top, bottom: r.bottom - k.top }, model.ana);
    idx = satirlar.findIndex((L) => (o.ust + o.alt) / 2 > L.ust && (o.ust + o.alt) / 2 < L.alt);
  }
  if (idx < 0) return false;
  const [bas, son] = paragrafSatirlari(satirlar, idx);
  // İlk satırın okuma sırasındaki ilk öğesinden son satırın son öğesine
  const sira = (x) => model.indeks.get(x.span);
  const ilk = satirlar[bas].ogeler.reduce((a, b) => (sira(b) < sira(a) ? b : a));
  const sonOge = satirlar[son].ogeler.reduce((a, b) => (sira(b) > sira(a) ? b : a));
  return secimKur(null, onbellek, oge(ilk.span, 0), oge(sonOge.span, sonOge.span.textContent.length));
}

/**
 * Üstten alta sıralı satırlarda (okuma çerçevesi) idx. satırın paragrafı: [ilk, son] satır indeksleri. Komşu satır aynı paragraftadır:
 * aradaki boşluk satır kalınlığının 0,8'inden az, kalınlığı benzer (yazı boyu), satır aralığı (üstten üste) paragrafınkiyle tutarlı
 * (başlık/üst bilgi daha sık ya da seyrek durur), üstteki satır kısa değil (paragrafın son satırı: iki yana yaslı sayfada tam
 * satırların bittiği kenardan bir satır kalınlığından fazla önce biter; yaslı değilse genişliğin üçte birinden fazla kısadır) ve girinti
 * uyumlu: alttaki satır içeride başlıyorsa (ilk satır girintisi) yeni paragraftır; ancak üstteki satır paragrafın ilk satırıysa ve
 * alttaki, kendi altındaki satırla aynı hizadaysa (ya da kısa son satırsa ve altındaki üsttekiyle aynı hizadaysa) asılı girintidir
 * (numaralı madde: numara solda, devam satırları içeride) ve birliktedir. Üstteki satır içeride hizalı bir bloğun devamıysa (asılı
 * girintinin devam satırları) ve alttaki dışarıda başlıyorsa yeni maddedir.
 */
function paragrafSatirlari(satirlar, idx) {
  const kalin = (L) => L.alt - L.ust;
  const h = kalin(satirlar[idx]);
  const sonlar = satirlar.map((L) => L.son).sort((a, b) => b - a);
  const genislik = sonlar[0] - Math.min(...satirlar.map((L) => L.bas));
  // Tam satırların bittiği kenar: en çok satır sonunun toplandığı dar bant
  let kenar = sonlar[0], enCok = 0;
  for (let i = 0, j = 0; i < sonlar.length; i++) {
    while (sonlar[j] > sonlar[i] + h / 4) j++;   // azalan sırada [j..i] bandı: sonlar[j] - sonlar[i] ≤ h/4
    if (i - j + 1 > enCok) { enCok = i - j + 1; kenar = sonlar[j]; }
  }
  const yasli = enCok >= Math.max(3, satirlar.length * 0.4);
  const kisa = (L) => (yasli ? L.son < kenar - h : L.son < sonlar[0] - genislik / 3);
  let adim = null;   // paragrafın satır aralığı
  const yakin = (U, A) => U && A && A.ust - U.alt < h * 0.8 && Math.abs(kalin(A) - kalin(U)) <= Math.max(kalin(A), kalin(U)) * 0.12 && !kisa(U);
  const hizali = (U, A) => Math.abs(U.bas - A.bas) <= h * 0.3;
  const birlikte = (i) => {   // i. ve (i+1). satır
    const P = satirlar[i - 1], U = satirlar[i], A = satirlar[i + 1], S = satirlar[i + 2];
    if (!yakin(U, A)) return false;
    const devam = yakin(P, U) && hizali(P, U);   // üstteki satır, kendi üstündekiyle aynı hizada bir bloğun devamı
    if (A.bas - U.bas > h && (devam || !(S ? (yakin(A, S) && hizali(A, S)) || (kisa(A) && hizali(U, S)) : kisa(A)))) return false;
    if (U.bas - A.bas > h && devam) return false;
    const a = A.ust - U.ust;
    if (adim !== null && Math.abs(a - adim) > Math.max(2, adim * 0.15)) return false;
    if (adim === null) adim = a;
    return true;
  };
  let bas = idx, son = idx;
  while (son + 1 < satirlar.length && birlikte(son)) son++;
  while (bas > 0 && birlikte(bas - 1)) bas--;
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
  katmanOgeleri(katman).forEach((span, dom) => {
    const metin = span.textContent;
    if (!metin) return;
    const r = span.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return;
    const donme = metinDonmesi(span);
    const rr = { left: r.left - k.left, right: r.right - k.left, top: r.top - k.top, bottom: r.bottom - k.top };
    const oge = { span, dom, donme, rr, o: okumaKutusu(rr, donme) };
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
  satirlar.forEach((L, si) => { for (const oge of L.ogeler) oge.si = si; });
  const yanlar = ogeler.filter((x) => x.donme !== ana);
  const { sira, birimler, hTip } = okumaSirasi(ogeler.filter((x) => x.donme === ana), bosluklar.filter((x) => x.donme === ana), satirlar, yanlar, ana);
  const indeks = new Map(sira.map((oge, i) => [oge.span, i]));
  const model = { katman, w: k.width, h: k.height, n: katman.childElementCount, ana, satirlar, yanlar, sira, indeks, birimler, hTip, birimSatir: new Map() };
  onbellek.set(sayfaEl, model);
  return model;
}

/** Öğelerin okuma çerçevesindeki kapsayan kutusu (öğenin kendi kutusu ya da verilen dönüşümle). */
function ogelerKutusu(ogeler, kutu = (x) => x.o) {
  const K = { ust: Infinity, alt: -Infinity, bas: Infinity, son: -Infinity };
  for (const x of ogeler) {
    const o = kutu(x);
    K.ust = Math.min(K.ust, o.ust); K.alt = Math.max(K.alt, o.alt); K.bas = Math.min(K.bas, o.bas); K.son = Math.max(K.son, o.son);
  }
  return K;
}

const KOSU_SINIRI = 60;   // bundan çok koşuya bölünen sayfada (içerik sırası dağınık) birimler aranmaz, sıra tümüyle geometrik
const BLOK_ARASI = 3;     // satır kalınlığı: koşuda arada başka satırlar bulunan bundan büyük dikey boşluk yeni koşu başlatır

/**
 * Sayfanın okuma sırası (seçim bu sırayla kurulur). İçerik (DOM) sırası çoğu belgede okuma sırasıdır ve sütunları, yan yana blokları
 * (UYAP tebligat formu ile muhatap bloğu, imza blokları) doğru dizer; ama Word ve UYAP'ta sayfanın altındaki alt bilgi içerikte
 * gövdeden önce gelir. İçerik sırası bu yüzden geometriyle denetlenir:
 * - Koşu: içerikte ardışık, aynı satırda ya da satırdan satıra aşağı ilerleyen öğeler. Yukarı dönüş, arada yatayda örtüşen öğeler
 *   bulunan satırların üstünden aşağı atlayış ya da yanında başka satırlar bulunan büyük dikey boşluk (BLOK_ARASI) yeni koşu başlatır.
 * - Birim: dikeyde örtüşen iki koşu, örtüştükleri bantta yatayda ayrıksa yan yanadır (sütun, blok, etiket ile değeri; bantta tek
 *   satırı olan için komşu satırlar da ayrık olmalı); değilse iç içedir (satırın içine sonradan yazılmış sözcük) ve aynı birime
 *   katılır. Birim içinde sıra satırlar üstten alta, satırda baştan sona.
 * - Birimlerin sırası: hiçbir birimin dikeyde kesmediği yatay boşlukla ayrılan bantlarda üstteki bant önce; bantta yan yanadan
 *   soldaki önce, yatayda örtüşen birimlerden tümüyle üstte olan önce (alt bilgi gövdeden sonra, üst bilgi önce); aralarında bağ
 *   olmayanlar içerik sırasıyla. BLOK_ARASI boşlukla bölünen koşunun ikinci parçası ilkinin devamıdır: bağı kalmadıysa ilkinin
 *   hemen ardından gelir (sütun, yanındaki sütundan ve bant sırasından önce sürer).
 * Başka yönde yazılmış her öğe kendi birimidir. Boşluk öğeleri içerikte komşu oldukları (aynı satırdaki) sözcüğün birimine katılır.
 * Öğelere okuma satırı (satir: birimde satır) ve birim indeksi yazılır. Döner: {sira, birimler: [{ust, alt, bas, son, rakipler: Set}], hTip}
 * (hTip: sayfada tipik satır kalınlığı).
 */
function okumaSirasi(anaOgeler, bosluklar, satirlar, yanlar, ana) {
  const kalinlik = satirlar.map((L) => L.alt - L.ust).sort((a, b) => a - b);
  const hTip = kalinlik.length ? kalinlik[kalinlik.length >> 1] : 10;
  const kosular = [];
  let kosu = null;
  for (const oge of anaOgeler) {
    const a = kosu && kosu.ogeler[kosu.ogeler.length - 1];
    let yeni = !a || oge.si < a.si, blokArasi = false;
    if (!yeni && oge.si > a.si + 1) {
      const x0 = Math.min(a.o.bas, oge.o.bas), x1 = Math.max(a.o.son, oge.o.son);
      for (let s = a.si + 1; s < oge.si && !yeni; s++) yeni = satirlar[s].ogeler.some((x) => x.o.son > x0 && x.o.bas < x1);
      // Yanındaki satırların hizasından birkaç satır aşağı atlayış (tebligat formunda muhatap bloğu ile duruşma bilgileri): ayrı blok.
      // Yeni koşu öncekinin devamıdır (aynı sütunda boşluktan sonra süren metin; bkz. birimlerin sırası)
      if (!yeni) yeni = blokArasi = oge.o.ust - a.o.alt > hTip * BLOK_ARASI;
    }
    if (yeni) {
      const onceki = kosu;
      kosular.push((kosu = { ogeler: [] }));
      if (blokArasi) kosu.onceki = onceki;
    }
    kosu.ogeler.push(oge);
  }
  const n = kosular.length, ata = kosular.map((_, i) => i), yanyana = [];
  const kok = (i) => { while (ata[i] !== i) i = ata[i] = ata[ata[i]]; return i; };
  if (n > KOSU_SINIRI) ata.fill(0);
  else {
    kosular.forEach((K) => Object.assign(K, ogelerKutusu(K.ogeler)));
    const bant = (K, lo, hi) => {   // koşunun ortası [lo, hi] içinde kalan öğeleri: kapsayan kutu ve satır sayısı
      const l = K.ogeler.filter((x) => (x.o.ust + x.o.alt) / 2 > lo && (x.o.ust + x.o.alt) / 2 < hi);
      return l.length ? { ...ogelerKutusu(l), satir: new Set(l.map((x) => x.si)).size } : null;
    };
    // Etiket/değer tablosu (Duruşma Günü/Saati/Yeri ile değerleri): iki koşunun satırları bire bir aynı (en az iki), aralarındaki
    // boşluk dar ve biri ötekinin en çok yarısı genişlikteyse yan yana sütun değil, aynı birimin satırlarıdır: okuma sırası satır
    // satır (referans okuyucu 'Duruşma Yeri  <yer adı>…' satırını böyle okur). Eşit genişlikte sütunlar ve tek satırlık etiketler yan yana kalır
    const satirKumesi = (K) => (K.satirK ??= new Set(K.ogeler.map((x) => x.si)));
    const tabloSatiri = (A, B, solda) => {
      const a = satirKumesi(A), b = satirKumesi(B);
      if (a.size < 2 || a.size !== b.size || [...a].some((s) => !b.has(s))) return false;
      const bosluk = solda ? B.bas - A.son : A.bas - B.son, wa = A.son - A.bas, wb = B.son - B.bas;
      return bosluk < hTip * 2 && Math.min(wa, wb) <= Math.max(wa, wb) / 2;
    };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = kosular[i], B = kosular[j];
      const lo = Math.max(A.ust, B.ust), hi = Math.min(A.alt, B.alt);
      if (hi - lo <= hTip * 0.3) continue;
      let a = bant(A, lo, hi), b = bant(B, lo, hi);
      if (!a || !b) continue;
      const solda = a.son <= b.bas + 1;
      let yan = solda || b.son <= a.bas + 1;
      // Bantta tek satırı olan (etiket ya da sonradan yazılmış sözcük): üst ve alt komşu satırlar da ayrık kalmalı (satır sonuna
      // sonradan yazılmış sözcüğün üstündeki ve altındaki satırlar onun hizasına uzanır)
      if (yan && (a.satir < 2 || b.satir < 2)) {
        a = bant(A, lo - hTip * 1.5, hi + hTip * 1.5); b = bant(B, lo - hTip * 1.5, hi + hTip * 1.5);
        yan = solda ? a.son <= b.bas + 1 : b.son <= a.bas + 1;
      }
      if (yan && tabloSatiri(A, B, solda)) yan = false;
      if (yan) yanyana.push(solda ? [i, j] : [j, i]);
      else ata[kok(i)] = kok(j);
    }
  }
  const birimler = [], kokBirim = new Map();
  kosular.forEach((K, i) => {
    const r = kok(i);
    if (!kokBirim.has(r)) { kokBirim.set(r, birimler.length); birimler.push({ ogeler: [], dom: Infinity, rakipler: new Set(), sonra: new Set() }); }
    const B = birimler[(K.birim = kokBirim.get(r))];
    for (const oge of K.ogeler) { oge.birim = K.birim; B.ogeler.push(oge); }
    B.dom = Math.min(B.dom, K.ogeler[0].dom);
  });
  birimler.forEach((B) => Object.assign(B, ogelerKutusu(B.ogeler)));
  // Devam: büyük dikey boşlukla (BLOK_ARASI) bölünen koşunun ikinci parçasının birimi, ilk parçanınkinin devamıdır (ilk bulunan)
  for (const K of kosular) {
    if (!K.onceki || K.onceki.birim === K.birim) continue;
    const U = birimler[K.onceki.birim];
    if (U.devam === undefined) U.devam = K.birim;
  }
  for (const [s, g] of yanyana) {
    const S = kosular[s].birim, G = kosular[g].birim;
    if (S === G) continue;
    birimler[S].rakipler.add(G); birimler[G].rakipler.add(S); birimler[S].sonra.add(G);
  }
  for (const oge of yanlar) {
    oge.birim = birimler.length;
    birimler.push({ ogeler: [oge], dom: oge.dom, yan: true, rakipler: new Set(), sonra: new Set(), ...okumaKutusu(oge.rr, ana) });
  }
  // Boşluk öğeleri: ortası içinde kaldığı satırda, içerikte önceki (yoksa sonraki) sözcük öğesi aynı satırdaysa onun birimine
  const icerik = [...anaOgeler, ...bosluklar].sort((a, b) => a.dom - b.dom);
  for (const b of bosluklar) {
    const orta = (b.o.ust + b.o.alt) / 2, si = satirlar.findIndex((x) => orta > x.ust && orta < x.alt);
    b.bosluk = true;
    if (si >= 0) b.si = si;
  }
  for (const yon of [1, -1]) {
    let komsu = null;
    for (let i = yon > 0 ? 0 : icerik.length - 1; i >= 0 && i < icerik.length; i += yon) {
      const x = icerik[i];
      if (!x.bosluk) komsu = x;
      else if (x.birim === undefined && x.si !== undefined && komsu?.si === x.si) { x.birim = komsu.birim; birimler[x.birim].ogeler.push(x); }
    }
  }
  // Birimler arası bağlar ve sıralama (bağı olmayan en erken içerik sıralı birim önce; döngüde içerik sırası)
  const ustte = [];
  birimler.forEach((U, i) => birimler.forEach((V, j) => {
    if (i === j || U.rakipler.has(j) || (U.yan && V.yan)) return;   // başka yönde yazılmış öğeler kendi aralarında içerik sırasıyla
    if (Math.min(U.son, V.son) - Math.max(U.bas, V.bas) > 1 && U.alt <= V.ust + hTip * 0.3) { U.sonra.add(j); ustte.push([i, j]); }
    else if ((U.yan || V.yan) && Math.min(U.alt, V.alt) > Math.max(U.ust, V.ust) && U.son <= V.bas) U.sonra.add(j);
  }));
  // Yan yana birimler bir şerittir: birinin altındaki (ör. alt bilgi, yalnızca soldaki imza bloğuyla yatayda örtüşür) ötekilerin de
  // tümüyle altındaysa hepsinden sonra gelir. Birimin devamı (aynı sütunda boşluktan sonra süren metin: tebligatın sol hücresinin
  // altındaki 'Muhatap adresini…' satırı, iki sütunlu sayfada şekil boşluğundan sonraki satırlar) şeridin ötekilerini beklemez
  for (const [i, j] of ustte) {
    if (birimler[i].devam === j) continue;
    for (const r of birimler[i].rakipler) if (r !== j && !birimler[r].rakipler.has(j) && birimler[r].alt <= birimler[j].ust + hTip * 0.3) birimler[r].sonra.add(j);
  }
  // Bantlar: hiçbir birimin dikeyde kesmediği yatay boşluklar sayfayı bantlara böler (tebligatın iki nüshası, katlama çizgisi);
  // üstteki bandın birimleri alttakilerden önce gelir (içerikte ikinci nüshanın başlığı birinci nüshanın son satırından önce olabilir)
  const bant = [];
  let b = -1, bantAlti = -Infinity;
  for (const i of [...birimler.keys()].sort((x, y) => birimler[x].ust - birimler[y].ust)) {
    if (birimler[i].ust >= bantAlti - hTip * 0.3) b++;
    bant[i] = birimler[i].bant = b;
    bantAlti = Math.max(bantAlti, birimler[i].alt);
  }
  const once = (i, j) => bant[i] < bant[j] || (bant[i] === bant[j] && birimler[i].dom < birimler[j].dom);
  const girdi = birimler.map(() => 0);
  for (const U of birimler) for (const j of U.sonra) girdi[j]++;
  const kalan = new Set(birimler.keys()), sira = [];
  let satir = -1, son = -1;
  while (kalan.size) {
    // Az önce yazılan birimin devamı bağı kalmadıysa hemen ardından gelir (sütun boşluktan sonra sürer; bant sırası onu yan
    // sütundan sonraya atmasın)
    const dv = son >= 0 ? birimler[son].devam : undefined;
    let sec = dv !== undefined && kalan.has(dv) && !girdi[dv] ? dv : -1;
    if (sec < 0) for (const i of kalan) if (!girdi[i] && (sec < 0 || once(i, sec))) sec = i;
    if (sec < 0) for (const i of kalan) if (sec < 0 || once(i, sec)) sec = i;
    son = sec;
    kalan.delete(sec);
    for (const j of birimler[sec].sonra) girdi[j]--;
    const B = birimler[sec];
    B.ogeler.sort((a, b) => (a.si ?? 0) - (b.si ?? 0) || a.o.bas - b.o.bas);
    let onceki;
    for (const oge of B.ogeler) {
      if (B.yan || oge.si !== onceki) { satir++; onceki = oge.si; }
      oge.satir = satir;
      sira.push(oge);
    }
  }
  return { sira, birimler, hTip };
}

/**
 * Modelin satırları, i. birimle yan yana duran birimlerin (öteki sütun ya da blok) bu birimin yüksekliğindeki öğeleri çıkarılmış
 * olarak: fare ya da üç tıklama bir sütundayken komşu sütunun aynı yükseklikteki satırları aranmaz. Yan yanası yoksa tüm satırlar.
 */
function birimSatirlari(model, i) {
  const B = model.birimler[i];
  if (!B || !B.rakipler.size) return model.satirlar;
  let l = model.birimSatir.get(i);
  if (l) return l;
  l = [];
  for (const L of model.satirlar) {
    const ogeler = L.ogeler.filter((x) => !(B.rakipler.has(x.birim) && (x.o.ust + x.o.alt) / 2 > B.ust && (x.o.ust + x.o.alt) / 2 < B.alt));
    if (ogeler.length) l.push({ ...ogelerKutusu(ogeler), ogeler });
  }
  l.sort((a, b) => a.ust - b.ust);
  model.birimSatir.set(i, l);
  return l;
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
 * Sürüklemenin çapası fareye göre nerede: {yon: 1 fare çapanın altında (sonraki sayfada), -1 üstünde (önceki sayfada), 0 aynı satır
 * yüksekliğinde; birim: çapanın bu sayfadaki birimi ya da null; sira: çapa öğesinin bu sayfadaki okuma sırası ya da undefined}.
 */
function capaYeri(gorunum, model, s, k, capa, p) {
  const span = konumOgesi(capa);
  if (!span) return null;
  if (!s.el.contains(span)) {
    const i = gorunum.sayfalar.findIndex((x) => x.el.contains(span)), j = gorunum.sayfalar.indexOf(s);
    return i < 0 || j < 0 ? null : { yon: Math.sign(j - i), birim: null };
  }
  const r = span.getBoundingClientRect();
  const o = okumaKutusu({ left: r.left - k.left, right: r.right - k.left, top: r.top - k.top, bottom: r.bottom - k.top }, model.ana);
  const i = model.indeks.get(span);
  return { yon: p.ust > o.alt ? 1 : p.ust < o.ust ? -1 : 0, birim: i === undefined ? null : model.birimler[model.sira[i].birim], sira: i };
}

/**
 * Satırlardan uzak boşluktaki p noktasının (sayfa yerel, okuma çerçevesi) okuma sırasındaki konumu: {span, ofset} ya da null.
 * Referans okuyucudaki gibi konum farenin altındaki düzen biriminde (blok, sütun) aranır: kapsayan (yatayda farenin hizasındaki birimlerin
 * indeksleri) ve çapanın birimi (başlanan blok, fare onun hizasında olmasa da: sağdaki imza bloğunun, kutudaki kısa satırın altı),
 * ikisi de yoksa yatayda en yakın birimler. Her birimde farenin üstündeki son satırın sonu ve altındaki ilk satırın başı adaydır;
 * aday birimle fare arasında üst üste duran birim (gövdenin altındaki alt bilgi, üstündeki üst bilgi) fare hizasında olmasa da
 * farenin geçtiği yerdir ve öne geçer. Aşağı sürüklemede (fare çapanın altında) en yakın üst aday: bloğun altındaki boşluğa inen
 * seçim o bloğun son satırında biter; yukarı sürüklemede en yakın alt aday: bloğun üstüne çıkan seçim ilk satırından başlar (aday
 * yoksa öteki yön). Sürüklemede seçimi ters çeviren adaylar (aşağıda okuma sırasında çapanın gerisi, yukarıda ilerisi) elenir:
 * başlanan blok seçimden düşmez. Aday bandı ile fare arasında başka bantlar (bkz. okumaSirasi) varsa fare onların üstünden geçmiştir:
 * aşağıda okuma sırasında en sondaki, yukarıda en baştaki öğeleri öne geçer (tebligatın katlama çizgisi, ikinci nüshanın başlığı).
 * Çapa yoksa ya da fare aynı yükseklikteyse en yakın aday. Farenin gelmediği satırlar (gövdenin altındaki alt bilgi, yan yana
 * bloğun ya da ikinci nüshanın satırları) seçime girmez; farenin geçtiği komşu sütundaki konuma kadar okuma sırasıyla seçilir.
 */
function boslukKonumu(model, p, capa, kapsayan) {
  const birimler = model.birimler.filter((B) => !B.yan);
  let adaylar = kapsayan.map((i) => model.birimler[i]);
  if (capa?.birim && !capa.birim.yan && !adaylar.includes(capa.birim)) adaylar.push(capa.birim);
  if (!adaylar.length) {
    const dx = (B) => Math.max(0, B.bas - p.bas, p.bas - B.son), en = Math.min(...birimler.map(dx));
    adaylar = birimler.filter((B) => dx(B) <= en + model.hTip);
  }
  const sira = (oge) => model.indeks.get(oge.span);
  const yon = capa?.yon || 0, cs = capa?.sira;
  // Seçimi ters çevirmeyen aday (c.ustte: öğenin sonu, değilse başı): aşağı sürüklemede çapadan sonra, yukarıda önce
  let suz = cs !== undefined && yon !== 0;
  const uygun = (c) => {
    if (!c) return false;
    if (!suz) return true;
    const i = sira(c.oge);
    return yon > 0 ? (c.ustte ? i >= cs : i > cs) : (c.ustte ? i < cs : i <= cs);
  };
  /**
   * Birimde farenin üstündeki son öğe ve altındaki ilk öğe (okuma sırasında): [{oge, B, dik, iki} | null, ...]; dik: o yöndeki öğelere
   * en küçük dikey uzaklık, iki: en küçük uzaklık (yatay dahil: geniş birimin uzaktaki kısa satırı, farenin üstündeki bloğun önüne geçmesin)
   */
  const uclar = (B) => {
    let u = null, a = null;
    for (const oge of B.ogeler) {
      if (oge.bosluk) continue;
      const ustte = (oge.o.ust + oge.o.alt) / 2 < p.ust, dik = ustte ? p.ust - oge.o.alt : oge.o.ust - p.ust;
      const iki = Math.hypot(Math.max(0, oge.o.bas - p.bas, p.bas - oge.o.son), Math.max(0, dik));
      const c = ustte ? u : a;
      if (!c) { if (ustte) u = { oge, B, dik, iki, ustte }; else a = { oge, B, dik, iki, ustte }; continue; }
      if (ustte ? sira(oge) > sira(c.oge) : sira(oge) < sira(c.oge)) c.oge = oge;
      c.dik = Math.min(c.dik, dik); c.iki = Math.min(c.iki, iki);
    }
    return [u, a];
  };
  const secim = () => {
    let ust = null, alt = null;
    for (const B of adaylar) {
      const [u, a] = uclar(B);
      if (uygun(u) && (!ust || u.iki < ust.iki)) ust = u;
      if (uygun(a) && (!alt || a.iki < alt.iki)) alt = a;
    }
    return [ust, alt];
  };
  let [ust, alt] = secim();
  if (!ust && !alt && suz) { suz = false; [ust, alt] = secim(); }
  // Aday birimle fare arasında üst üste duran birim dikeyde yakınsa (fare onun hizasında olmasa da üstünden geçmiştir). Aday birim
  // farenin hizasında olmalı: yalnız başlanan blok olduğu için aday olan birimin altındaki (muhatap bloğunun altındaki duruşma
  // bilgileri) farenin geçtiği yer değildir
  const pay = model.hTip * 0.3, ortusur = (U, V) => Math.min(U.son, V.son) - Math.max(U.bas, V.bas) > 1;
  const hizada = (B) => !kapsayan.length || kapsayan.includes(model.birimler.indexOf(B));
  const ustH = ust && hizada(ust.B), altH = alt && hizada(alt.B);
  for (const V of birimler) {
    if (ustH && V !== ust.B && ortusur(V, ust.B) && V.ust >= ust.B.alt - pay && V.ust <= p.ust) {
      const [u] = uclar(V);
      if (u && u.dik < ust.dik && uygun(u)) ust = u;
    }
    if (altH && V !== alt.B && ortusur(V, alt.B) && V.alt <= alt.B.ust + pay && V.alt >= p.ust) {
      const [, a] = uclar(V);
      if (a && a.dik < alt.dik && uygun(a)) alt = a;
    }
  }
  // Aday bandı ile fare arasındaki bantlar (fare yatayda onların hizasında olmasa da üstlerinden geçmiştir): aşağıda farenin
  // üstünde biten bantlardan okuma sırasında en sondaki öğe, yukarıda altında başlayanlardan en baştaki öğe
  if (ust && yon > 0) {
    let bm = Infinity;
    for (const V of birimler) if (V.alt >= p.ust) bm = Math.min(bm, V.bant);
    const b0 = ust.B.bant;
    for (const V of birimler) {
      if (V.bant <= b0 || V.bant >= bm) continue;
      for (const oge of V.ogeler) if (!oge.bosluk && sira(oge) > sira(ust.oge)) ust = { ...ust, oge, B: V };
    }
  }
  if (alt && yon < 0) {
    let bm = -Infinity;
    for (const V of birimler) if (V.ust <= p.ust) bm = Math.max(bm, V.bant);
    const b0 = alt.B.bant;
    for (const V of birimler) {
      if (V.bant >= b0 || V.bant <= bm) continue;
      for (const oge of V.ogeler) if (!oge.bosluk && sira(oge) < sira(alt.oge)) alt = { ...alt, oge, B: V };
    }
  }
  // Okuma sırasında adaydan hemen sonra (yukarıda hemen önce) gelen birim aday satırı ile fare arasında dikeyde kalıyorsa fare
  // yatayda onun hizasında olmasa da satırlarını geçmiştir (muhatap bloğundan 'Savcı Mütalasıdır.' kutusunun boşluğuna): seçim onu
  // da alır. Yan yana birim (öteki sütun) ve okuma sırasında araya başka birim giren birimler alınmaz
  const komsu = (c, ileri) => {
    for (let n = 0; c && n < birimler.length; n++) {
      let j = sira(c.oge) + (ileri ? 1 : -1);
      while (model.sira[j]?.bosluk) j += ileri ? 1 : -1;
      const o = model.sira[j], Vi = o?.birim, V = Vi === undefined ? null : model.birimler[Vi];
      if (!V || V === c.B || V.yan || c.B.rakipler.has(Vi)) break;
      if (ileri ? V.ust < c.oge.o.alt - pay || V.alt > p.ust : V.alt > c.oge.o.ust + pay || V.ust < p.ust) break;
      let uc = o;
      for (const x of V.ogeler) if (!x.bosluk && (ileri ? sira(x) > sira(uc) : sira(x) < sira(uc))) uc = x;
      c = { ...c, oge: uc, B: V };
    }
    return c;
  };
  if (ust && yon > 0) ust = komsu(ust, true);
  if (alt && yon < 0) alt = komsu(alt, false);
  const secilen = yon > 0 ? ust || alt : yon < 0 ? alt || ust : ust && alt ? (alt.iki < ust.iki ? alt : ust) : ust || alt;
  if (!secilen) return null;
  return secilen === ust ? { span: ust.oge.span, ofset: ust.oge.span.textContent.length } : { span: alt.oge.span, ofset: 0 };
}

/**
 * İstemci noktasına en yakın metin konumu: {span, ofset} ya da null. Nokta bir sayfanın üstünde değilse en yakın (metni olan) sayfa
 * alınır. Sayfada önce dikeyde (okuma çerçevesinde satırdan satıra) en yakın satır, eşitlikte yatayda yakın olan; satırda yatay
 * konuma göre öğe ve karakter sınırı. Satır başının solu satır başı, sonunun sağı satır sonudur; iki öğe arasındaki boşlukta yakın olan kenar.
 * Satırlardan uzak boşlukta konum boslukKonumu'dur; capa (sürüklemenin başladığı konum) yönü ve birimi verir.
 */
function enYakinKonum(gorunum, x, y, onbellek, capa = null) {
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
    // Yan yana birimler (sütun, blok): fare, yan yanası olan birimlerden öğesi en yakın olanın yüksekliğindeyse (bir satır payla)
    // ötekilerin o yükseklikteki satırları aranmaz (birimin kutusu değil öğeleri: gövdeyle aynı birimdeki sol imza bloğunun kutusu sağdakini de kapsar)
    let yakin = null, yakinM = Infinity;
    for (const B of model.birimler) {
      if (!B.rakipler.size) continue;
      for (const { o, bosluk } of B.ogeler) {
        if (bosluk) continue;
        const dx = Math.max(0, o.bas - p.bas, p.bas - o.son), dy = Math.max(0, o.ust - p.ust, p.ust - o.alt), m = dx * dx + dy * dy;
        if (m < yakinM) { yakinM = m; yakin = B; }
      }
    }
    const satirlar = yakin && p.ust >= yakin.ust - model.hTip && p.ust <= yakin.alt + model.hTip ? birimSatirlari(model, model.birimler.indexOf(yakin)) : model.satirlar;
    // Karşılaştırma: satır bandına uzaklık; bantlar örtüşüyorsa (sık satır aralığı) bant ortasına uzaklık; sonra yatay uzaklık
    const enYakinSatir = (liste) => {
      let enIyi = null, enIyiA = null;
      for (const L of liste) {
        const d = Math.max(0, L.ust - p.ust, p.ust - L.alt);
        const a = [d, d ? 0 : Math.abs(p.ust - (L.ust + L.alt) / 2), Math.max(0, L.bas - p.bas, p.bas - L.son)];
        if (!enIyiA || a[0] < enIyiA[0] || (a[0] === enIyiA[0] && (a[1] < enIyiA[1] || (a[1] === enIyiA[1] && a[2] < enIyiA[2])))) { enIyi = L; enIyiA = a; }
      }
      return enIyi && { L: enIyi, d: enIyiA[0] };
    };
    let en = enYakinSatir(satirlar);
    const cy = capa && capaYeri(gorunum, model, s, k, capa, p), capaOge = cy?.sira === undefined ? null : model.sira[cy.sira];
    // Farenin yatay hizasındaki birimler (blok, sütun; bir satır kalınlığı payla). Hiçbiri en yakın satırda değilse ve metinleri farenin
    // bu satıra yatay uzaklığından yakınsa satır yan yana başka bir bloğundur (sol formun satırı hizasında sağ sütunun boşluğu):
    // yalnızca o birimlerin satırlarına bakılır. Fare sürüklemenin başladığı satırın bandındaysa o satırda kalınır (satırın sonunu
    // aşan sürükleme satırın kalanını seçer; yandaki bloğun farenin geçmediği satırları girmez)
    const kapsayan = [];
    model.birimler.forEach((B, i) => { if (!B.yan && p.bas >= B.bas - model.hTip && p.bas <= B.son + model.hTip) kapsayan.push(i); });
    let yanBlok = en && kapsayan.length && !en.L.ogeler.some((o) => kapsayan.includes(o.birim))
      && !(en.d === 0 && capaOge && en.L.ogeler.some((o) => o.si === capaOge.si));
    if (yanBlok) {
      const satirUzak = Math.max(0, en.L.bas - p.bas, p.bas - en.L.son);
      let blokUzak = Infinity;
      for (const i of kapsayan) {
        for (const { o, bosluk } of model.birimler[i].ogeler) {
          if (!bosluk) blokUzak = Math.min(blokUzak, Math.hypot(Math.max(0, o.bas - p.bas, p.bas - o.son), Math.max(0, o.ust - p.ust, p.ust - o.alt)));
        }
      }
      yanBlok = blokUzak < satirUzak;
    }
    const satirda = (e) => e && e.d <= (e.L.alt - e.L.ust) / 2, enSatir = en;
    if (yanBlok) {
      const liste = [];
      for (const L of model.satirlar) {
        const ogeler = L.ogeler.filter((o) => kapsayan.includes(o.birim));
        if (ogeler.length) liste.push({ ...ogelerKutusu(ogeler), ogeler });
      }
      en = enYakinSatir(liste);
    }
    // Satırlardan uzak boşluk (paragraf arası, bloğun altı, sayfanın üstü/altı): bkz. boslukKonumu
    let konum = satirda(en) ? null : boslukKonumu(model, p, cy, kapsayan);
    if (!konum && !en) continue;
    konum ??= satirKonumu(en.L, p, k);
    // Yan bloktaki konuma okuma sırasında çapadan varılırken çapanın bloğu (ve devamı) ile konumun bloğu dışında bir bloğun fare ile
    // çapanın dikey aralığının tümüyle dışındaki satırları atlanıyorsa fare o bloğun üstünden geçmemiştir (tebligatın başlığından sağ
    // sütunun başına: sıra arada sol formun tamamından geçer). Fare bir satırın bandındaysa konum o satırdadır
    if (yanBlok && satirda(enSatir) && capaOge && blokAtlar(model, capaOge, konum.span, p)) konum = satirKonumu(enSatir.L, p, k);
    return { girdi: s, ...konum };
  }
  return null;
}

/** Fare bandındaki L satırında p'nin konumu: satır başının solu satır başı, sonunun sağı satır sonu; iki öğe arasında yakın olan kenar. */
function satirKonumu(L, p, k) {
  const og = L.ogeler;
  if (p.bas <= og[0].o.bas) return { span: og[0].span, ofset: 0 };
  for (let i = 0; i < og.length; i++) {
    const o = og[i];
    if (p.bas <= o.o.son) return { span: o.span, ofset: ogeIciOfset(o, p.bas, k) };
    const sonraki = og[i + 1];
    if (sonraki && p.bas < sonraki.o.bas) {
      return p.bas - o.o.son <= sonraki.o.bas - p.bas ? { span: o.span, ofset: o.span.textContent.length } : { span: sonraki.span, ofset: 0 };
    }
  }
  const son = og[og.length - 1];
  return { span: son.span, ofset: son.span.textContent.length };
}

/**
 * Çapa öğesinden span'e okuma sırasında aradaki öğelerden biri, çapanın birimi (ve devamı) ile span'in birimi dışında bir birimdeyse
 * ve çapa ile farenin (p) dikey aralığının tümüyle dışındaysa true.
 */
function blokAtlar(model, capaOge, span, p) {
  const cs = model.indeks.get(capaOge.span), ci = model.indeks.get(span);
  if (cs === undefined || ci === undefined) return false;
  const izin = new Set([model.sira[ci].birim]);
  for (let u = capaOge.birim, n = 0; u !== undefined && n < model.birimler.length; u = model.birimler[u].devam, n++) izin.add(u);
  const pay = model.hTip * 0.3, ust = Math.min(capaOge.o.ust, p.ust) - pay, alt = Math.max(capaOge.o.alt, p.ust) + pay;
  for (let j = Math.min(cs, ci) + 1; j < Math.max(cs, ci); j++) {
    const x = model.sira[j];
    if (!x.bosluk && !izin.has(x.birim) && (x.o.alt < ust || x.o.ust > alt)) return true;
  }
  return false;
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

  /** Aradaki sayfanın metin katmanı kuruldu: sürükleme sürüyorsa seçim güncellenir; bittiyse bu görüntüleyicideki seçim o sayfayı da alsın. */
  const katmanKuruldu = (kuruldu) => {
    if (!kuruldu) return;
    if (d) guncelle();
    else if (gorselGecerli() && gorsel.gorunum === gorunum) secimKur(gorunum, new Map(), gorsel.capa, gorsel.odak);
  };

  const guncelle = () => {
    if (!d || !d.basladi) return;
    // Çapa ile farenin sayfası arasında metin katmanı olmayan (hızlı kaydırmada çizilmemiş) sayfalar için katman kurulur
    const i0 = gorunum.idx(d.bas.girdi), i1 = noktadakiSayfa(d.x, d.y);
    if (i0 >= 0 && i1 >= 0 && d.aralik !== `${i0}:${i1}`) {
      d.aralik = `${i0}:${i1}`;
      for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) {
        if (!gorunum.sayfalar[i].textLayer) gorunum.metinKatmaniHazirla(i).then(katmanKuruldu, () => {});
      }
    }
    const odak = siraEkle(enYakinKonum(gorunum, d.x, d.y, d.onbellek, d.bas));
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
