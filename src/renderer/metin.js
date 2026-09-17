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
  const ogeler = [], agirlik = new Map();
  katmanOgeleri(katman).forEach((span) => {
    const metin = span.textContent;
    if (!metin.trim()) return;
    const r = span.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return;
    const donme = metinDonmesi(span);
    ogeler.push({ span, donme, o: okumaKutusu({ left: r.left - k.left, right: r.right - k.left, top: r.top - k.top, bottom: r.bottom - k.top }, donme) });
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
  const model = { katman, w: k.width, h: k.height, n: katman.childElementCount, ana, satirlar, yanlar: ogeler.filter((x) => x.donme !== ana) };
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

/** Seçimi bas → odak olarak kurar (odak basın önünde olabilir: geriye doğru seçim). Aynı konumdaysa seçimi kaldırır. */
function secimKur(bas, odak) {
  const sec = window.getSelection();
  const bs = konumOgesi(bas), os = konumOgesi(odak);
  if (!bs || !os) return;
  if (bs === os && bas.ofset === odak.ofset) { if (sec.rangeCount) sec.removeAllRanges(); return; }
  const [an, ao] = dugumKonumu(bs, bas.ofset), [fn, fo] = dugumKonumu(os, odak.ofset);
  if (sec.rangeCount && sec.anchorNode === an && sec.anchorOffset === ao && sec.focusNode === fn && sec.focusOffset === fo) return;
  sec.setBaseAndExtent(an, ao, fn, fo);
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

/** a konumu belge sırasında b'den önce mi. */
function onceMi(a, b) {
  const [an, ao] = dugumKonumu(a.span, a.ofset), [bn, bo] = dugumKonumu(b.span, b.ofset);
  const r = document.createRange();
  r.setStart(bn, bo);
  return r.comparePoint(an, ao) < 0;
}

/** Var olan seçimin çapası bu görüntüleyicinin metin katmanındaysa konumu (Shift+tıkla genişletme için). */
function secimCapasi(gorunum) {
  const sec = window.getSelection();
  if (!sec || !sec.rangeCount || sec.isCollapsed) return null;
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
    if (!d.sozcuk) { secimKur(d.bas, odak); return; }
    // Sözcük kipi (harfte çift tıklayıp sürükleme): seçim sözcük sözcük genişler, çift tıklanan sözcük hep içinde kalır
    const [sb, ss] = d.sozcuk;
    if (!konumOgesi(sb) || !konumOgesi(ss)) return;
    if (onceMi(odak, sb)) secimKur(ss, sozcukUcu(odak, false, d.x, d.y));
    else if (onceMi(ss, odak)) secimKur(sb, sozcukUcu(odak, true, d.x, d.y));
    else secimKur(sb, ss);
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
    if (!capa) window.getSelection().removeAllRanges();   // boş yere tek tıklama seçimi kaldırır
    d = { bas, sozcuk, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, basladi: !!capa, onbellek, kare: 0 };
    if (capa) guncelle();
    if (sozcuk) secimKur(sozcuk[0], sozcuk[1]);
    document.addEventListener('mousemove', hareket, true);
    document.addEventListener('mouseup', bitir, true);
    window.addEventListener('blur', bitir);
    kaydirici.addEventListener('scroll', kaydirildi, { passive: true });
  });
}

/** Seçili metnin içindeki paragraf/satır yapısını (DOM'dan) döndürür. */
export function secimHamMetni() {
  const sec = window.getSelection();
  return sec ? sec.toString() : '';
}
