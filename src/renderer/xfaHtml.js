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
// Dönüşüm sayfa kökünde yerinde ve bir kez yapılır (PDF.js aynı nesneyi yeniden verir; kok.__pdefe sonucu tutar).

const HTML_OGELERI = new Set(['a', 'b', 'br', 'button', 'div', 'i', 'img', 'input', 'label', 'li', 'ol', 'option', 'p', 'select', 'span', 'sub', 'sup', 'textarea', 'ul']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const ALAN_OGELERI = new Set(['input', 'textarea', 'select']);

const SIGDIRMA_ADIMLARI = [0.96, 0.92, 0.88, 0.84, 0.8];

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
  const numaralar = bilgi?.sayfaNumaralari || [], ekranda = baski ? bilgi?.ekranda || [] : [];
  const metinEkle = (deger) => {
    ogeler.push({ tur: 'metin', str: deger, sonu: false });
    return { name: 'span', attributes: { 'data-xm': String(ogeler.length - 1) }, value: deger };
  };
  const sonuIsaretle = (bas) => { if (ogeler.length > bas) ogeler[ogeler.length - 1].sonu = true; };
  const isle = (n, yol) => {
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
          else isle(c, y);
        }
      }
    } else {
      for (const c of n.children || []) isle(c, y);
    }
    if (!baski && (ad || n.name === 'p')) sonuIsaretle(bas);
  };
  isle(kok, []);
  const sonuc = { ogeler };
  try { Object.defineProperty(kok, '__pdefe', { value: sonuc, enumerable: false, configurable: true }); } catch { /* donmuş nesne */ }
  return sonuc;
}
