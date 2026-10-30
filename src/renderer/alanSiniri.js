// Form alanına giren yazının sınırı (0.3.1, kullanıcı: "sonsuza kadar aynı sayfaya yazılabiliyor", "bu metin çıktı alınmak üzere tasarlanmış unutma"). XFA formunda sınır
// alanın kâğıttaki kutusu (xfaHtml.js alanSigar) ve en çok karakter sayısı, düz form alanında (formlar.js) en çok karakter sayısı (MaxLen).
//   - Yazma ve Enter: beforeinput. Sığmayan harf girmez, uyarı yok, alan dolunca yazma durur. Sığan yazı tarayıcının yolundan gider.
//   - Yapıştırma, sürükleyip bırakma, tek seferde gelen uzun yazı (dikte): Sığan kısım girer, kalanı alınmaz, görünür uyarı kaç karakter alınmadığını bir kez söyler. Yazılan metnin
//     ortasına da: Seçimin yerine sonraki metni taşırmayacak kadarı girer. Yazı execCommand'la girer: İmleç ve olaylar yazmadaki gibi.
//   - IME ve bileşim: Olay iptal edilemez, bileşim bitince sığmıyorsa son sığan hâle döner.
// Silme, seçim, gezinme serbest.
//
// Geri al ve yinele alanın kendi geçmişinden (alanGeriAl). Tarayıcının geçmişi çerçeve başına tektir: Ctrl+Z başka alandaki yazıyı siler ve imleci oraya götürür (ölçüldü), programın değer
// yazması (komut yığınından geri al, Form yeniden dizilince) adımlarını bayat bırakır: Bayat Ctrl+Z ve Ctrl+Y yazıyı katlıyordu ("yazı" → "yazıyazıyazı", ölçüldü), reddedilen bileşimin taşan hâli de geri al
// adımı olurdu. Geçmişi temizleyen bir yol yok. Alanın geçmişine yalnız kabul edilen hâller girer, değer dışarıdan değişmişse geçmiş düşer.
//
// Seçilmeyen yol: maxlength'e bırakmak (tarayıcı fazlasını sessizce keser, kullanıcı yazının yarısının gittiğini görmez: Kullanıcının onayladığı öneri).
import { MAC } from './platform.js';

const EKLEYENLER = new Set(['insertText', 'insertLineBreak', 'insertParagraph', 'insertFromPaste', 'insertFromDrop', 'insertFromYank']);
const BIRLESME_MS = 1500;           // bu kadar içinde art arda yazılan ya da silinen harfler tek geri al adımı
const GECMIS_ADIM = 200;            // alan başına en çok geri al adımı
const GECMIS_KARAKTER = 4_000_000;  // alan başına geçmişin en çok karakteri: Dosyada duran çok büyük yazıda bellek dolmasın

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

// ------------------------------------------------------------ alanın geçmişi
const GECMIS = new WeakMap();   // alan → { geri: [{ deger, bas, son }], ileri: [...], bilinen: Son kabul edilen değer, grup, bitis, an, bekleyen }
const hareketGrubu = (tur) => {
  if (tur === 'insertText' || tur === 'insertLineBreak' || tur === 'insertParagraph') return 'yazi';
  if (tur === 'deleteContentBackward' || tur === 'deleteContentForward') return 'sil';
  return tur;
};

function gecmisi(el) {
  let g = GECMIS.get(el);
  if (!g) { g = { geri: [], ileri: [], bilinen: el.value, grup: null, bitis: -1, an: 0, bekleyen: null }; GECMIS.set(el, g); }
  return g;
}

function gecmisiBosalt(g, deger) {
  g.geri.length = 0; g.ileri.length = 0; g.bilinen = deger; g.grup = null; g.bekleyen = null;
}

/** Alanın yazısı değişmek üzere (yazma, silme, yapıştırma, kes): Önceki hâl adım olmaya hazır. Değer dışarıdan değişmişse (komut yığını, form yeniden kuruldu) eski adımlar geçersizdir. */
export function alanDegisecek(el, tur) {
  const g = gecmisi(el), deger = el.value, bas = el.selectionStart, son = el.selectionEnd;
  if (deger !== g.bilinen) gecmisiBosalt(g, deger);
  const grup = hareketGrubu(tur), simdi = performance.now();
  const birlesir = (grup === g.grup && (grup === 'yazi' || grup === 'sil') && bas === son && bas === g.bitis && simdi - g.an < BIRLESME_MS)
    || (tur === 'insertFromDrop' && g.grup === 'deleteByDrag');   // aynı alanda taşıma: Tek adım
  g.bekleyen = { deger, bas, son, grup, birlesir };
}

/** Değişiklik oldu (input): Önceki hâl geçmişe girer. Değişmediyse ya da önceki hâl yakalanmadıysa adım yok. */
function alanDegisti(el) {
  const g = GECMIS.get(el), deger = el.value;
  if (!g || deger === g.bilinen) { if (g) g.bekleyen = null; return; }
  const b = g.bekleyen;
  if (!b) { gecmisiBosalt(g, deger); return; }
  if (!b.birlesir) {
    g.geri.push({ deger: b.deger, bas: b.bas, son: b.son });
    let toplam = g.geri.reduce((t, a) => t + a.deger.length, 0);
    while (g.geri.length > 1 && (g.geri.length > GECMIS_ADIM || toplam > GECMIS_KARAKTER)) toplam -= g.geri.shift().deger.length;
  }
  g.ileri.length = 0; g.bilinen = deger; g.grup = b.grup; g.bitis = el.selectionEnd; g.an = performance.now(); g.bekleyen = null;
}

/** Değeri programdan koyar, alanı dinleyenlere (PDF.js'in deposu, hücreler, taşma işareti) input olayıyla bildirir. inputType history: Sınır ve geçmiş yeniden işlemez. */
function degerKoy(el, deger, bas, son, geri) {
  const g = gecmisi(el);
  el.value = deger;
  el.setSelectionRange(bas ?? deger.length, son ?? deger.length);
  g.bilinen = deger; g.grup = null; g.bekleyen = null;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: geri ? 'historyUndo' : 'historyRedo' }));
}

/** Alanda geri al (geri=true) ya da yinele. Döner: Yapıldı mı. Değer dışarıdan değişmişse (komut yığınından geri al) adımlar geçersizdir, yapılmaz. Başka alana hiç gitmez. */
export function alanGeriAl(el, geri = true) {
  const g = GECMIS.get(el);
  if (!g) return false;
  if (el.value !== g.bilinen) { gecmisiBosalt(g, el.value); return false; }
  const a = (geri ? g.geri : g.ileri).pop();
  if (!a) return false;
  (geri ? g.ileri : g.geri).push({ deger: el.value, bas: el.selectionStart, son: el.selectionEnd });
  degerKoy(el, a.deger, a.bas, a.son, geri);
  return true;
}

// ------------------------------------------------------------ yazının sığan kısmı
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
    alanDegisecek(el, 'yapistir');
    document.execCommand('insertText', false, m.slice(0, k));
    alanDegisti(el);
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
    degerKoy(el, a.deger, a.bas, a.son, true);
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

  // Geri al ve yinele: Alanın kendi geçmişi (baştaki açıklama). Tuş tarayıcıya gitmez: Tarayıcının yinele komutu kendi geçmişi boşken hiç çalışmaz, olay da doğmaz
  kok.addEventListener('keydown', (e) => {
    if (e.isComposing || e.altKey || !(MAC ? e.metaKey : e.ctrlKey)) return;
    const z = e.key === 'z' || e.key === 'Z', y = !MAC && !e.shiftKey && (e.key === 'y' || e.key === 'Y');
    if (!z && !y) return;
    const el = alanBul(e.target);
    if (!el) return;
    e.preventDefault();
    if (!kilitli()) alanGeriAl(el, z && !e.shiftKey);
  }, true);

  kok.addEventListener('beforeinput', (e) => {
    const tur = e.inputType || '';
    if (tur === 'historyUndo' || tur === 'historyRedo') {
      // Tarayıcının geçmişi bu alana gelmez. Olayın hedefi adımın sahibi, odaktaki alan değil. Başka bir yerden (Bul kutusu) de alana dokunulmaz
      const odak = alanBul(document.activeElement);
      if (!odak && !alanBul(e.target)) return;
      e.preventDefault();
      if (odak && !kilitli()) alanGeriAl(odak, tur === 'historyUndo');
      return;
    }
    const el = alanBul(e.target);
    if (!el) return;
    if (kilitli() && (tur.startsWith('insert') || tur.startsWith('delete'))) { e.preventDefault(); return; }
    if (e.isComposing || tur === 'insertCompositionText' || tur === 'insertFromComposition') return;
    if (tur.startsWith('delete')) { alanDegisecek(el, tur); return; }
    if (!tur.startsWith('insert')) return;
    anlikAl(el);
    if (!EKLEYENLER.has(tur)) { alanDegisecek(el, tur); return; }   // yazım önerisi gibi: Yeri bilinmiyor, sığmazsa input'ta geri döner
    const satirSonu = tur === 'insertLineBreak' || tur === 'insertParagraph';
    if (satirSonu && el.tagName !== 'TEXTAREA') return;
    const ham = satirSonu ? '\n' : e.data ?? e.dataTransfer?.getData('text/plain') ?? null;
    if (ham === null) { alanDegisecek(el, tur); return; }
    const metin = girdiMetni(el, ham);
    const once = el.value.slice(0, el.selectionStart ?? el.value.length), sonra = el.value.slice(el.selectionEnd ?? el.value.length);
    const sayiSigar = once.length + metin.length + sonra.length <= enCokKarakter(el);
    if (metin === ham && sayiSigar && (!sigar || sigar(el, once + metin + sonra))) { alanDegisecek(el, tur); return; }   // tarayıcının yolu
    e.preventDefault();
    // Tek harf ya da Enter: Alan dolunca yazma durur. Tek seferde gelen yazı (dikte, bırakma): Sığan kısmı, uyarıyla
    if (satirSonu || Array.from(metin).length <= 1) { dolu?.(el); return; }
    alanaKoy(el, metin, { sigar, bildir });
  }, true);

  // İptal edilemeyen yollar: Bileşim bitince, yazım önerisi gibi ekleme sonrası sığmıyorsa son sığan hâle döner. Silme bu yoldan geçmez (dosyadaki sığmayan yazı silinirken sığmıyor olabilir)
  kok.addEventListener('compositionstart', (e) => { const el = alanBul(e.target); if (el) { anlikAl(el); alanDegisecek(el, 'bilesim'); } }, true);
  kok.addEventListener('compositionend', (e) => { const el = alanBul(e.target); if (el) { geriDon(el); alanDegisti(el); } }, true);
  kok.addEventListener('input', (e) => {
    const el = alanBul(e.target), tur = e.inputType || '';
    if (!el || e.isComposing || tur === 'insertCompositionText' || tur === 'insertFromComposition' || tur.startsWith('history')) return;
    if (tur.startsWith('insert')) geriDon(el);
    alanDegisti(el);
  }, true);
}
