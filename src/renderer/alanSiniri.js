// Form alanına giren yazının sınırı (0.3.1, kullanıcı: "sonsuza kadar aynı sayfaya yazılabiliyor", "bu metin çıktı alınmak üzere tasarlanmış unutma"). XFA formunda sınır
// alanın kâğıttaki kutusu (xfaHtml.js alanSigar) ve en çok karakter sayısı, düz form alanında (formlar.js) en çok karakter sayısı (MaxLen).
//   - Yazma ve Enter: beforeinput. Sığmayan harf girmez, uyarı yok, alan dolunca yazma durur. Sığan yazı tarayıcının yolundan gider (geri al adımları onun).
//   - Yapıştırma, sürükleyip bırakma, tek seferde gelen uzun yazı (dikte): Sığan kısım girer, kalanı alınmaz, görünür uyarı kaç karakter alınmadığını bir kez söyler. Yazılan metnin
//     ortasına da: Seçimin yerine sonraki metni taşırmayacak kadarı girer. Yazı execCommand'la girer: Tek geri al adımı (value yazmak geri al geçmişini siler).
//   - IME ve bileşim: Olay iptal edilemez, bileşim bitince sığmıyorsa son sığan hâle döner.
// Silme, seçim, gezinme, geri al ve yinele serbest.
//
// Seçilmeyen yol: maxlength'e bırakmak (tarayıcı fazlasını sessizce keser, kullanıcı yazının yarısının gittiğini görmez: Kullanıcının onayladığı öneri).
const EKLEYENLER = new Set(['insertText', 'insertLineBreak', 'insertParagraph', 'insertFromPaste', 'insertFromDrop', 'insertFromYank']);

/** Alınmayan yazının uyarısı. */
export const alinmadiMetni = (n) => `Yazının tamamı bu alana sığmadı. ${n.toLocaleString('tr-TR')} karakter alınmadı.`;

/** Dışarıdan gelen yazının alana girecek hâli: Satır sonları tek biçimde, sayfa sonu ve dikey sekme satır sonu, öbür denetim karakterleri boşluk (forma böyle yazılır: xfa.js
 *  veriDegeri. Ölçü yazılacak hâlle yapılmazsa kâğıtta satır artardı). Tek satırlık alanda satır sonu boşluk (tarayıcının yapıştırması gibi). */
export function girdiMetni(el, metin) {
  const m = String(metin ?? '').toWellFormed().replace(/\r\n?/g, '\n').replace(/[\u000B\u000C]/g, '\n').replace(/[\u0000-\u0008\u000E-\u001F￾￿]/g, ' ');
  return el.tagName === 'TEXTAREA' ? m : m.replace(/\n/g, ' ');
}

/** Alan en çok kaç karakter alır (maxlength'in değeri, yoksa sınırsız). */
const enCokKarakter = (el) => (el.maxLength >= 0 ? el.maxLength : Infinity);

/** Kesim yeri: Harfi bölme (vekil çift, birleşen işaret), sözcük ortasına düşüyorsa son boşlukta kes. Hücreli alanda (kimlik numarası gibi) sözcük yok. */
function kesimYeri(metin, k, hucreli, sonraVar) {
  if (k >= metin.length) return metin.length;
  const bolunuyor = (i) => i > 0 && i < metin.length && (/[\uDC00-\uDFFF]/.test(metin[i]) || /\p{M}/u.test(metin[i]));
  while (bolunuyor(k)) k--;
  if (hucreli || k <= 0) return Math.max(0, k);
  if (/\s/.test(metin[k]) || /\s/.test(metin[k - 1])) {
    // Kesim zaten boşlukta. Alanın sonunda sonda kalan boşluk yazıya bir şey katmaz (ortaya yapıştırmada sonraki metne bitişmesin diye kalır)
    if (!sonraVar) while (k > 0 && /\s/.test(metin[k - 1])) k--;
    return k;
  }
  let i = k - 1;
  while (i >= 0 && !/\s/.test(metin[i])) i--;
  if (i < 0) return k;   // boşluksuz tek uzun sözcük
  k = i + 1;
  if (!sonraVar) while (k > 0 && /\s/.test(metin[k - 1])) k--;
  return k;
}

/**
 * Yazının seçimin yerine girebilen kısmı. sigar(deger) yoksa yalnız karakter sayısı. İkiye bölme: Yazı uzun olsa da en çok log2(n) ölçü, uzun adaylar ölçülmeden reddedilir (xfaHtml.js).
 * Döner: Alınacak karakter sayısı.
 */
function sigan(el, metin, once, sonra, sigar) {
  let ust = Math.min(metin.length, Math.max(0, enCokKarakter(el) - once.length - sonra.length));
  if (ust <= 0) return 0;
  const dener = (k) => !sigar || sigar(once + metin.slice(0, k) + sonra);
  let alt = 0;
  if (!dener(ust)) {
    while (ust - alt > 1) { const o = (alt + ust) >>> 1; if (dener(o)) alt = o; else ust = o; }
    ust = alt;
  }
  const hucreli = el.hasAttribute('data-xfa-comb') || el.dataset.tarak !== undefined;
  const k = kesimYeri(metin, ust, hucreli, !!sonra);
  return k === ust || dener(k) ? k : ust;   // ender: Kısa hâli satırları farklı kırdı
}

/**
 * Yazıyı alanın seçiminin yerine koyar (yapıştırma, bırakma, sağ tık › Yapıştır): Sığan kısmı girer, kalanı alınmazsa bir kez uyarır. Döner: Alınmayan karakter sayısı.
 * ayar: { sigar(el, deger) | null, bildir(metin) }.
 */
export function alanaKoy(el, metin, { sigar = null, bildir = null } = {}) {
  const m = girdiMetni(el, metin);
  if (!m) return 0;
  const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
  const once = el.value.slice(0, s), sonra = el.value.slice(e);
  const k = sigan(el, m, once, sonra, sigar ? (d) => sigar(el, d) : null);
  if (k > 0) {
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    document.execCommand('insertText', false, m.slice(0, k));
  }
  const alinmayan = Array.from(m.slice(k)).length;
  if (alinmayan) bildir?.(alinmadiMetni(alinmayan));
  return alinmayan;
}

/**
 * Sınırı bir kapsayıcıdaki alanlara bağlar. ayar:
 *   alanBul(hedef) → yazı denetimi ya da null (olayın hedefi),
 *   sigar(el, deger) | null, bildir(metin),
 *   kilitli() → true: Yazı girilemez (form yeniden diziliyor),
 *   dolu(el): Alan doluyken harf basıldı (uyarı yok, istenirse işaret).
 */
export function alanSiniriBagla(kok, { alanBul, sigar = null, bildir = null, kilitli = () => false, dolu = null }) {
  const anlik = new WeakMap();   // alan → { deger, bas, son }: Son eklemeden (ya da bileşimden) önceki hâl
  const anlikAl = (el) => anlik.set(el, { deger: el.value, bas: el.selectionStart, son: el.selectionEnd });
  const geriDon = (el) => {
    const a = anlik.get(el);
    if (!a || !sigar || sigar(el, el.value) || el.value.length <= a.deger.length) return;
    const fazla = Array.from(el.value).length - Array.from(a.deger).length;
    el.setSelectionRange(0, el.value.length);
    if (a.deger) document.execCommand('insertText', false, a.deger); else document.execCommand('delete');
    el.setSelectionRange(a.bas ?? a.deger.length, a.son ?? a.deger.length);
    bildir?.(alinmadiMetni(fazla));
  };

  kok.addEventListener('paste', (e) => {
    const el = alanBul(e.target);
    if (!el || e.defaultPrevented || el.readOnly || el.disabled) return;
    if (kilitli()) { e.preventDefault(); return; }
    const metin = e.clipboardData?.getData('text/plain');
    if (!metin) return;
    e.preventDefault();
    alanaKoy(el, metin, { sigar, bildir });
  }, true);

  kok.addEventListener('beforeinput', (e) => {
    const el = alanBul(e.target);
    if (!el) return;
    const tur = e.inputType || '';
    if (kilitli() && (tur.startsWith('insert') || tur.startsWith('delete'))) { e.preventDefault(); return; }
    if (e.isComposing || tur === 'insertCompositionText' || tur === 'insertFromComposition') return;
    if (!tur.startsWith('insert')) return;
    anlikAl(el);
    if (!EKLEYENLER.has(tur)) return;   // yazım önerisi gibi: Yeri bilinmiyor, sığmazsa input'ta geri döner
    const satirSonu = tur === 'insertLineBreak' || tur === 'insertParagraph';
    if (satirSonu && el.tagName !== 'TEXTAREA') return;
    const ham = satirSonu ? '\n' : e.data ?? e.dataTransfer?.getData('text/plain') ?? null;
    if (ham === null) return;
    const metin = girdiMetni(el, ham);
    const once = el.value.slice(0, el.selectionStart ?? el.value.length), sonra = el.value.slice(el.selectionEnd ?? el.value.length);
    const sayiSigar = once.length + metin.length + sonra.length <= enCokKarakter(el);
    if (metin === ham && sayiSigar && (!sigar || sigar(el, once + metin + sonra))) return;   // tarayıcının yolu
    e.preventDefault();
    // Tek harf ya da Enter: Alan dolunca yazma durur. Tek seferde gelen yazı (dikte, bırakma): Sığan kısmı, uyarıyla
    if (satirSonu || Array.from(metin).length <= 1) { dolu?.(el); return; }
    alanaKoy(el, metin, { sigar, bildir });
  }, true);

  // İptal edilemeyen yollar: Bileşim bitince, yazım önerisi gibi ekleme sonrası sığmıyorsa son sığan hâle döner. Silme ve geri al bu yoldan geçmez (dosyadaki sığmayan yazı silinirken sığmıyor olabilir)
  kok.addEventListener('compositionstart', (e) => { const el = alanBul(e.target); if (el) anlikAl(el); }, true);
  kok.addEventListener('compositionend', (e) => { const el = alanBul(e.target); if (el) geriDon(el); }, true);
  kok.addEventListener('input', (e) => {
    const el = alanBul(e.target), tur = e.inputType || '';
    if (el && !e.isComposing && tur.startsWith('insert') && tur !== 'insertCompositionText' && tur !== 'insertFromComposition') geriDon(el);
  }, true);
}
