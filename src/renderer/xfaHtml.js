// XFA sayfalarının PDF.js HTML'i (page.getXfa) üzerindeki dönüşümler (0.3.1). Görüntüleyici (goruntuleyici.js) ve düz PDF'i çizen gizli
// sayfa (src/xfa-duz/cizim.js) aynı modülü kullanır: Ekrandaki ve basılan sayfa aynı kurallarla hazırlanır.
//
// PDF.js XFA betiklerini çalıştırmaz. Çekirdeğin şablondan çıkardığı bilgiyle (core/islemler/xfa.py xfa_bilgi):
//   - Sayfa numaraları: "Sayfa n / N" alanları (değeri xfa.layout.page / pageCount betiğiyle kurulan alanlar) sayfanın numarası ve sayfa
//     sayısıyla dolar. Çizimin zengin metnine gömülü (floating field) alanlarda PDF.js gömülen alanı hiç çizmez: Paragrafın metni
//     çekirdeğin verdiği kalıptan ("Sayfa {sayfa} / {toplam}") yeniden yazılır.
//   - Basımda: Ekranda görünüp basılmayan öğeler (relevant="-print", formun düğmeleri) gizlenir, yalnızca basımda görünenler (PDF.js'in
//     xfaPrintOnly sınıfı) gösterilir.
//   - Ekranda: Metinler (#text ve yaprak öğelerin değeri) data-xm numaralı span'lara, alanlar data-xa numarası ve data-xv (PDF.js'in veri
//     kimliği, annotationStorage anahtarı) özniteliklerine kavuşur: Bul her sayfanın aranan metnini katman çizilmeden bu sırayla kurar,
//     çizilen katmanda eşleşmeyi aynı numaralı öğede vurgular (arama.js). Ekleme PDF.js'in XfaLayer.render'ının çizdiği öğelerle sınırlıdır
//     (izin verdiği HTML ve SVG öğeleri).
//   - Alanların biçimi (alanBicimle, ekranda ve basımda aynı): PDF.js paragraf biçimini (para) yalnızca zengin metne uygular. Alanın input ve
//     textarea'sında yatay ve dikey hiza, satır aralığı, paragraf boşlukları, hücreli alan (comb) yoktu, yazı boyu 0,99 ile çarpılıyordu, renksiz
//     dolgu (beyaz) atlanıyordu. Çerçeveler ince kalır (ince): Tarayıcı kalınlığı katmanın kendi pikseline yuvarlıyor (0,5pt 1 px oluyordu).
// Dönüşüm sayfa kökünde yerinde ve bir kez yapılır (PDF.js aynı nesneyi yeniden verir; kok.__pdefe sonucu tutar).

const HTML_OGELERI = new Set(['a', 'b', 'br', 'button', 'div', 'i', 'img', 'input', 'label', 'li', 'ol', 'option', 'p', 'select', 'span', 'sub', 'sup', 'textarea', 'ul']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const ALAN_OGELERI = new Set(['input', 'textarea', 'select']);

const SIGDIRMA_ADIMLARI = [0.96, 0.92, 0.88, 0.84, 0.8];

const YATAY_HIZA = { left: 'left', center: 'center', right: 'right', justify: 'justify', justifyAll: 'justify', radix: 'right' };
const DIKEY_YER = { top: 'flex-start', bottom: 'flex-end' };   // input ve textarea olağan olarak ortada ya da üstte durur (alanBicimle)
const COMB_YAZI = 'Consolas, "Liberation Mono", "DejaVu Sans Mono", Menlo, "Courier New", monospace';   // hücreli alanın görünmeyen yazısı: Her harf eşit genişlikte
const INCE_KAT = 8;   // çerçevenin büyütülüp küçültüldüğü kat (ince)
const OLCU_DESENI = /(-?\d*\.?\d+)px/g;

/** Öğe bu sınıfı taşıyor mu (PDF.js sınıfları dizi olarak taşır). */
const sinifVar = (n, ad) => Array.isArray(n?.attributes?.class) && n.attributes.class.includes(ad);
const pikseller = (s) => [...String(s ?? '').matchAll(OLCU_DESENI)].map((m) => parseFloat(m[1]));
/** padding yazısının sol ve sağ ölçüsü (PDF.js dört değer yazar: üst sağ alt sol). */
function yanBosluklar(s) {
  const p = pikseller(s);
  return p.length === 4 ? { sag: p[1], sol: p[3] } : p.length === 1 ? { sag: p[0], sol: p[0] } : { sag: 0, sol: 0 };
}

/**
 * Çerçevenin kalınlığı formdaki gibi kalsın: Tarayıcı kenarlık kalınlığını katmanın kendi pikseline yuvarlıyor, 0,5pt'lik çerçeve 1 piksel oluyor,
 * katman da yakınlaştırmayla büyüdüğü için ekranda ve kâğıtta iki kat kalın çıkıyordu (ölçüldü). Çerçeve kat kat büyük kurulur, dönüşümle
 * küçültülür: Kalınlık yuvarlanmaz, köşe yuvarlaklığı aynı kalır.
 */
function ince(n) {
  if (!n || typeof n !== 'object') return;
  if (sinifVar(n, 'xfaBorder')) {
    const st = n.attributes.style;
    if (st && (st.borderWidth || st.borderRadius)) {
      const kat = (v) => String(v).replace(OLCU_DESENI, (_, x) => `${parseFloat(x) * INCE_KAT}px`);
      for (const k of ['borderWidth', 'borderRadius']) if (st[k]) st[k] = kat(st[k]);
      for (const k of ['width', 'height']) if (st[k]) st[k] = `calc(${st[k]} * ${INCE_KAT})`;
      st.transform = `scale(${1 / INCE_KAT})`;
      st.transformOrigin = '0 0';
    }
    return;
  }
  for (const c of n.children || []) ince(c);
}

/** Çekirdeğin alan kaydı. Aynı ad yolunda birden çok alan olabilir (formda aynı adlı kardeşler): Şablondaki yerinden ve boyutundan ayırt edilir. */
function alanKaydi(alanlar, y, sarmal) {
  const adaylar = alanlar.filter((k) => yolUyar(k, y));
  if (adaylar.length < 2) return adaylar[0] || null;
  const st = sarmal?.attributes?.style || {};
  const fark = (k) => [['x', 'left'], ['y', 'top'], ['g', 'width'], ['b', 'height']].reduce((t, [a, c]) => {
    const v = parseFloat(st[c]);
    return t + (Number.isFinite(k[a]) && Number.isFinite(v) ? Math.abs(k[a] - v) : 0);
  }, 0);
  return adaylar.reduce((e, k) => (fark(k) < fark(e) ? k : e));
}

/**
 * Hücreli alan (comb): Her harf eşit genişlikte bir hücrenin ortasında. Tarayıcının input'unda yok. input yerinde durur (imleç, seçim, yazma):
 * Yazısı görünmez, eşit genişlikli yazı tipi ve harf aralığıyla her harf bir hücreye düşer. Görünen harfler üstteki hücrelerde (combGuncelle),
 * alanın kendi yazı tipiyle. Hücre çizgileri alanın iç kenarlığının renginde (SVG: Kalınlık yuvarlanmaz).
 */
function combKur(denetim, etiket, n, genislik, dikey, baslikGen = 0) {
  const ds = denetim.attributes.style;
  // PDF.js kenarlığı dört kenar için yazar ("solid solid solid solid", "#c0c0c0 #c0c0c0 …"): İlk kenarınki alınır
  const renk = /^\s*solid\b/.test(ds.borderStyle || '') ? String(ds.borderColor || '').match(/rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+/i)?.[0] || null : null;
  const kalin = pikseller(ds.borderWidth)[0] || 0.5;
  for (const k of ['border', 'borderWidth', 'borderColor', 'borderStyle', 'borderRadius']) delete ds[k];
  const hucreGen = genislik / n;
  ds.fontFamily = COMB_YAZI;
  ds.letterSpacing = `calc(${hucreGen}px - 1ch)`;
  ds.textAlign = 'left';
  ds.paddingLeft = ds.paddingRight = '0';
  denetim.attributes.class = [...(denetim.attributes.class || []), 'xfa-comb'];
  denetim.attributes['data-xfa-comb'] = String(n);
  const azami = parseInt(denetim.attributes.maxLength, 10);
  denetim.attributes.maxLength = Number.isFinite(azami) && azami > 0 ? Math.min(azami, n) : n;
  const hucreler = [];
  for (let i = 0; i < n; i++) hucreler.push({ name: 'span', attributes: { class: ['xfa-comb-hucre'] }, children: [] });
  // Başlıklı alanda (başlık solda ya da sağda) hücreler yalnızca denetimin üstünde
  const yer = baslikGen ? { width: `${genislik}px`, ...(sinifVar(etiket, 'xfaRight') ? { left: '0', right: 'auto' } : { left: 'auto', right: '0' }) } : {};
  const cizgiler = [];
  if (renk) {
    const cizgi = { stroke: renk, strokeWidth: `${kalin}px` };
    cizgiler.push({ name: 'svg', attributes: { xmlns: SVG_NS, class: ['xfa-comb-cizgi'], style: { overflow: 'visible', ...yer } }, children: [
      { name: 'rect', attributes: { xmlns: SVG_NS, x: '0', y: '0', width: '100%', height: '100%', style: { ...cizgi, fill: 'none' } } },
      ...hucreler.slice(1).map((_, i) => { const x = `${((i + 1) * 100) / n}%`; return { name: 'line', attributes: { xmlns: SVG_NS, x1: x, x2: x, y1: '0', y2: '100%', style: cizgi } }; }),
    ] });
  }
  etiket.attributes.style = { ...(etiket.attributes.style || {}), position: 'relative' };
  const katman = { name: 'div', attributes: { class: ['xfa-comb-katman'], style: { alignItems: DIKEY_YER[dikey] || 'center', ...yer } }, children: hucreler };
  etiket.children.push(katman, ...cizgiler);
}

/**
 * Alanı şablondaki biçimine getirir (HTML üzerinde, ekranda ve basımda aynı). b: çekirdeğin kaydı (xfa.py _alan_bicimi), sarmal: PDF.js'in alanın
 * çevresine koyduğu kutu. Değerler çekirdekten yalnızca sayı ya da sabit liste olarak gelir.
 */
function alanBicimle(alan, b, sarmal) {
  const st = alan.attributes.style || (alan.attributes.style = {});
  if (b.boyut > 0) st.fontSize = `${b.boyut}px`;     // PDF.js 0,99 ile çarpıyor: Satır kırılması ve satır yüksekliği formdakinden ayrılıyordu
  if (sarmal) {
    // Zemin çerçevenin köşesinden taşmasın (PDF.js zemini köşesiz kutuya koyuyor). Renksiz dolgu beyaz
    const sinir = sarmal.children?.find((c) => sinifVar(c, 'xfaBorder')), ss = sarmal.attributes.style || (sarmal.attributes.style = {});
    if (b.dolgu) ss.backgroundColor = '#fff';
    else if (st['background-color']) { ss.backgroundColor = st['background-color']; delete st['background-color']; }   // renkli dolgu alanın köşesiz kutusundaydı
    if ((ss.background || ss.backgroundColor) && sinir?.attributes?.style?.borderRadius) ss.borderRadius = sinir.attributes.style.borderRadius;
  }
  const m = b.metin;
  if (!m) return;
  const d = altlar(alan, 'textarea')[0] || altlar(alan, 'input')[0], etiket = altlar(alan, 'label')[0];
  if (!d || !etiket) return;
  const ds = d.attributes.style || (d.attributes.style = {});
  ds.letterSpacing = `${b.harfAraligi || 0}px`;
  if (YATAY_HIZA[m.hiza] && m.hiza !== 'left') ds.textAlign = YATAY_HIZA[m.hiza];
  if (m.hiza === 'justifyAll') ds.textAlignLast = 'justify';
  if (m.satir > 0) ds.lineHeight = `${m.satir}px`;
  if (m.sol) ds.paddingLeft = `${m.sol}px`;
  if (m.sag) ds.paddingRight = `${m.sag}px`;
  if (m.ust) ds.paddingTop = `${m.ust}px`;
  if (m.alt) ds.paddingBottom = `${m.alt}px`;
  if (m.girinti) ds.textIndent = `${m.girinti}px`;
  if (m.kaydirmasiz) ds.scrollbarWidth = 'none';   // kaydırma çubuğu yazının genişliğini daraltıp satırları kâğıttakinden farklı kırıyordu
  // Hücreli alan (alanın iç genişliği şablondan: Yazı tipleri ve yerleşim beklenmez, gizli sekmede de doğru)
  const baslik = (etiket.children || []).find((c) => sinifVar(c, 'xfaCaption'));
  const yanBaslik = baslik ? (sinifVar(etiket, 'xfaLeft') || sinifVar(etiket, 'xfaRight') ? pikseller(baslik.attributes?.style?.width)[0] : 0) : 0;
  if (m.comb > 0 && d.name === 'input' && b.g > 0 && yanBaslik !== undefined) {
    const y = yanBosluklar(st.padding);
    const genislik = b.g - y.sol - y.sag - (m.sol || 0) - (m.sag || 0) - (yanBaslik || 0);
    if (genislik > 0) { combKur(d, etiket, m.comb, genislik, m.dikey, yanBaslik || 0); return; }
  }
  // Dikey hiza: input yazısını ortalar, textarea üste koyar. Farklıysa denetim yazısı kadar olur, alanın içinde yerine oturur (tıklama alanı aynı: label).
  const ortada = d.name === 'input' ? 'middle' : 'top';
  if (m.dikey !== ortada && (sinifVar(etiket, 'xfaLeft') || sinifVar(etiket, 'xfaRight'))) {
    ds.height = 'auto';
    ds.alignSelf = m.dikey === 'middle' ? 'center' : DIKEY_YER[m.dikey] || 'flex-start';
    if (d.name === 'textarea') { ds.fieldSizing = 'content'; ds.maxHeight = '100%'; }
  }
}

/** Hücreli alanın görünen harfleri: Değer değişince (yazma, geri al) ve katman çizilince. */
export function combGuncelle(el) {
  const n = +el.getAttribute?.('data-xfa-comb');
  if (!n) return;
  const hucreler = el.parentElement?.querySelectorAll(':scope > .xfa-comb-katman > .xfa-comb-hucre');
  if (!hucreler) return;
  const harfler = Array.from(el.value || '');
  hucreler.forEach((h, i) => { const c = harfler[i] ?? ''; if (h.textContent !== c) h.textContent = c; });
}

/** Katman çizildikten sonra: Hücreli alanların harfleri (değer PDF.js'in deposundan gelir, sayfaHazirla bilmez). */
export function xfaAlanlariKur(kok) {
  for (const el of kok.querySelectorAll('[data-xfa-comb]')) combGuncelle(el);
}

/**
 * Taşan yazıları sığdırır (çizilen katmanda, yazı tipleri yüklendikten sonra). PDF.js yerleşimi belgedeki yazı tipi genişlikleriyle
 * yapar; yazı tipi bilgisayarda yoksa yerine çizilen (xfa.css) biraz geniş olabilir: Kutusundan taşan (satırı kırılıp yüksekliği aşan ya da
 * genişliği aşan) zengin metin ve alan etiketi, sığana dek (en çok %20) küçültülür (zoom: içerikle birlikte yazı boyları da). Sayfa numarası
 * paragrafı (bilerek tek satır) atlanır.
 */
export function xfaSigdir(kok) {
  const tasiyor = (k) => k.scrollHeight > k.clientHeight + 1 || k.scrollWidth > k.clientWidth + 1;
  for (const el of kok.querySelectorAll('.xfaRich, .xfaCaption')) {
    if (el.querySelector('[data-xfa-numara]')) continue;
    const kutu = el.classList.contains('xfaRich') ? el.parentElement : el;
    if (!kutu || !kutu.clientHeight || !tasiyor(kutu)) continue;
    for (const z of SIGDIRMA_ADIMLARI) {
      el.style.zoom = String(z);
      if (!tasiyor(kutu)) break;
    }
  }
}

/**
 * Alanın yazısı kutusuna sığmıyor mu (0.3.1 kabul sınaması): Çok satırlı alanda yükseklik, tek satırlıda genişlik. Tarayıcı sığmayan yazıyı
 * alanın içinde kaydırır, basımda ve düz PDF'te alanın dışı kesilir. TASMA_PAYI: Satır yüksekliğinin yuvarlanması (yazısız ve tek satırlık
 * alanda scrollHeight clientHeight'tan birkaç piksel büyük olabilir), yeni bir satırın boyundan küçük.
 */
const TASMA_PAYI = 6;
export function alanTasiyor(el) {
  if (el.hasAttribute('data-xfa-comb')) return Array.from(el.value || '').length > +el.getAttribute('data-xfa-comb');
  if (el.tagName === 'TEXTAREA') return !!el.value && el.scrollHeight > el.clientHeight + TASMA_PAYI;
  if (el.tagName === 'INPUT' && el.type === 'text') return !!el.value && el.scrollWidth > el.clientWidth + 1;
  return false;
}

/** Çekirdeğin kaydı (yol, sayfaAlani) HTML'deki ad yoluna uyuyor mu. yol sayfa kökünün (sayfa alanının) adıyla başlar; sayfa alanındaki
 *  düğümün kaydı da onunla başlar, içerikteki düğümünki kök alt formla (HTML'de sayfa kökünün içinde). */
export function yolUyar(kayit, yol) {
  if (!kayit || !Array.isArray(kayit.yol)) return false;
  const y = kayit.sayfaAlani ? yol : yol.slice(1);
  return y.length === kayit.yol.length && y.every((a, i) => a === kayit.yol[i]);
}

/** Kalıptaki {sayfa} / {sayfa0} / {toplam} yer tutucuları. */
function numaraYaz(kalip, sayfaNo, sayfaSayisi) {
  return String(kalip).replace(/\{(sayfa0|sayfa|toplam)\}/g, (_, t) => String(t === 'toplam' ? sayfaSayisi : t === 'sayfa0' ? sayfaNo - 1 : sayfaNo));
}

function altlar(n, ad, sonuc = []) {
  for (const c of n?.children || []) {
    if (!c || typeof c !== 'object') continue;
    if (c.name === ad) sonuc.push(c);
    altlar(c, ad, sonuc);
  }
  return sonuc;
}

/** Düğümün sınıflarına ad ekler / çıkarır (PDF.js sınıfları dizi olarak taşır). */
function sinifCikar(n, ad) {
  const c = n.attributes?.class;
  if (Array.isArray(c)) n.attributes.class = c.filter((x) => x !== ad);
}

/** Yazı tipi ailesi: PDF.js belgede bulamadığı yazı tipine kendi yedeğini "<ad>-PdfJS-XFA" adıyla verir (bilinmeyenlere "PdfJS-Fallback");
 *  PDEfe PDF.js'in yazı tiplerini kurmadığı için (goruntuleyici.js XFA_YAZI) ad yazı tipinin kendi adına döner, tarayıcı onu bilgisayarda
 *  ya da xfa.css'teki benzerinde bulur. Bilinmeyenin yerine Arial. */
function aileDuzelt(aile) {
  return String(aile).replace(/(["']?)PdfJS-Fallback(?:-PdfJS-XFA)?\1/g, '"Arial"').replace(/-PdfJS-XFA(["']?)/g, '$1');
}

/** Alanın dosyadaki (PDF.js'in veriden kurduğu) değeri: arama, alan henüz çizilmediyse ve değeri değişmediyse bunu bulur. */
function ilkDeger(n) {
  const a = n.attributes || {};
  if (n.name === 'textarea') return a.textContent ?? n.value ?? '';
  if (n.name === 'select') {
    const s = (n.children || []).find((o) => o?.attributes?.selected);
    return s ? s.attributes.value ?? '' : '';
  }
  return a.value ?? '';
}

/**
 * Sayfa kökünü hazırlar. secenek: { sayfaNo, sayfaSayisi, bilgi (xfa_bilgi'nin sonucu ya da null), baski }. Döner (ve kok.__pdefe'de
 * tutar): { ogeler: [{ tur: 'metin', str, sonu } | { tur: 'alan', veri, ilk, sonu: true }] } — numarası ekrandaki öğenin data-xm / data-xa'sı.
 * sonu: öğe bir paragrafın ya da adlı bir düğümün (çizim, alan) son metni (Bul bölümler arasına satır sonu koyar).
 */
export function sayfaHazirla(kok, { sayfaNo = 1, sayfaSayisi = 1, bilgi = null, baski = false } = {}) {
  if (kok?.__pdefe) return kok.__pdefe;
  const ogeler = [];
  const numaralar = bilgi?.sayfaNumaralari || [], ekranda = baski ? bilgi?.ekranda || [] : [], alanlar = bilgi?.alanlar || [];
  const metinEkle = (deger) => {
    ogeler.push({ tur: 'metin', str: deger, sonu: false });
    return { name: 'span', attributes: { 'data-xm': String(ogeler.length - 1) }, value: deger };
  };
  const sonuIsaretle = (bas) => { if (ogeler.length > bas) ogeler[ogeler.length - 1].sonu = true; };
  const isle = (n, yol, ust = null) => {
    if (!n || typeof n !== 'object' || n.name === '#text') return;
    const a = n.attributes || (n.attributes = {});
    if (a.xmlns ? a.xmlns !== SVG_NS : !HTML_OGELERI.has(n.name)) return;   // PDF.js çizmez
    if (baski) sinifCikar(n, 'xfaPrintOnly');
    if (typeof a.style?.fontFamily === 'string' && a.style.fontFamily.includes('PdfJS')) a.style.fontFamily = aileDuzelt(a.style.fontFamily);
    const ad = a.xfaName;
    const y = ad ? [...yol, ad] : yol;
    if (ad) {
      for (const k of numaralar) {
        if (!yolUyar(k, y)) continue;
        if (k.tur === 'cizim') {
          const ps = altlar(n, 'p');
          // Tek satır: PDF.js çizimin genişliğini numarasız metne göre ölçtü (gömülü alanı çizmez); numara sığmazsa satır kırılmasın
          for (const p of k.paragraflar || []) {
            const hedef = ps[p.sira];
            if (!hedef) continue;
            hedef.children = [{ name: '#text', value: numaraYaz(p.metin, sayfaNo, sayfaSayisi) }];
            hedef.attributes = { ...(hedef.attributes || {}), style: { ...(hedef.attributes?.style || {}), whiteSpace: 'nowrap' }, 'data-xfa-numara': '1' };
          }
        } else if (k.tur === 'alan') {
          for (const g of [...altlar(n, 'input'), ...altlar(n, 'textarea')]) {
            g.attributes = g.attributes || {};
            const deger = numaraYaz(`{${k.deger}}`, sayfaNo, sayfaSayisi);
            if (g.name === 'textarea') g.attributes.textContent = deger; else g.attributes.value = deger;
          }
        }
      }
      if (ekranda.some((k) => yolUyar(k, y))) a.style = { ...(a.style || {}), visibility: 'hidden' };
      if (alanlar.length && sinifVar(n, 'xfaField')) {
        const sarmal = sinifVar(ust, 'xfaWrapper') ? ust : null;
        const kayit = alanKaydi(alanlar, y, sarmal);
        if (kayit) alanBicimle(n, kayit, sarmal);
      }
    }
    if (ALAN_OGELERI.has(n.name)) {
      if (!baski && a.dataId && !(n.name === 'input' && (a.type === 'checkbox' || a.type === 'radio'))) {
        ogeler.push({ tur: 'alan', veri: a.dataId, ilk: ilkDeger(n), sonu: true });
        a['data-xa'] = String(ogeler.length - 1);
      }
      if (!baski && a.dataId) a['data-xv'] = a.dataId;
      return;
    }
    const bas = ogeler.length;
    if (!baski) {
      if (!n.children?.length) {
        if (typeof n.value === 'string' && n.value && n.name !== 'option') { n.children = [metinEkle(n.value)]; delete n.value; }
      } else {
        for (let i = 0; i < n.children.length; i++) {
          const c = n.children[i];
          if (c?.name === '#text' && typeof c.value === 'string' && c.value) n.children[i] = metinEkle(c.value);
          else isle(c, y, n);
        }
      }
    } else {
      for (const c of n.children || []) isle(c, y, n);
    }
    if (!baski && (ad || n.name === 'p')) sonuIsaretle(bas);
  };
  isle(kok, []);
  ince(kok);
  const sonuc = { ogeler };
  try { Object.defineProperty(kok, '__pdefe', { value: sonuc, enumerable: false, configurable: true }); } catch { /* donmuş nesne */ }
  return sonuc;
}
