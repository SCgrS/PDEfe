// Keskin çizim: PDF.js sayfa tuvallerinde referans okuyucuya yakın görüntü kalitesi.
// 1) Görseller kutu/alan filtresiyle JS'de yeniden örneklenir. Referans okuyucunun (110 ppi, %100) ekran yakalamasıyla ölçüldü:
//    küçültmede (PTT JPEG ×0,76, taranmış sayfa ×0,55) nokta örneklemeli kutu, büyütmede (UYAP karekodu ×1,5) alan kapsaması
//    referans okuyucuya en yakın sonuç. Chromium'un 'high' kalitesi küçültmede mip-map karıştırıp bulanıklaştırıyor, büyütmede kübik
//    yumuşatıyordu; PDF.js'in kendi seçimi (×1,33 üstünde en yakın komşu) ise pikselli. Fotoğraf/taranmış sayfa ×2–×4 arasında
//    giderek yumuşar, ×4 ve üstünde (ya da hedef çok büyükse) Chromium'un yüksek kaliteli yumuşatmasıyla çizilir; az renkli
//    küçük görseller (karekod, barkod) her yakınlaştırmada keskin kalır.
// 2) İnce çizgiler (eksene paralel, cihazda 4 px'ten ince çizgi ve dolu dikdörtgen) piksel ızgarasına oturtulur
//    (PDF okuyucularındaki "ince çizgileri geliştir" seçeneği gibi): tablo kenarlıkları iki satıra yayılmış gri yerine tam
//    piksel siyah çizilir.
// Metne dokunulmaz: yazı çizimi yaziTipleri.js'te (kalın ve döndürülmüş yazı ana hatlarından, düz yazı Chromium'un ClearType'ıyla).
// Ana hatlarından çizilen glif yolları ince çizgi oturtmasına girmez (metinYolu).
// Yalnızca keskinBaglam() ile sarılmış bağlamlar (sayfa tuvali ve PDF.js'in ara tuvalleri) etkilenir. Bellek görsel boyutundan
// bağımsız (BANT, sınırlı önbellek), işlemci süresi sınırlı (EN_FAZLA_*).
// Ana iş parçacığı GPU'dan eşzamanlı piksel okumaz: JPEG (VideoFrame) ve PDF.js'in çözdüğü görseller (ImageBitmap) bir işçide okunur
// ve büyükse orada örneklenir; o sırada Chromium ile hızlı çizilir ve örnekleme bitince görünür sayfa keskin yeniden çizilir.
// Taranmış sayfanın metin maskesi gibi PDF.js ara tuvalleri (maske, yarıya indirme) görselin kendisinden örneklenir: ara tuvalin
// çizim kaydı işlemcide oynatılmaz (0.1.1 sonrası ilk sürümde kaydırma bitince 300 ms'lik blokajın asıl nedeni buydu).

const INCE = 4;                 // cihaz pikselinde bu kalınlıktan ince çizgi/dikdörtgen ızgaraya oturtulur
const KESKIN_BUYUTME = 2;       // bu orana kadar büyütmede saf alan filtresi (referans okuyucudaki gibi keskin)
const YUMUSAK_BUYUTME = 4;      // bu oran ve üstünde Chromium yumuşatması (taranmış sayfa yakınlaştırınca pikselli olmasın)
const EN_FAZLA_CIKTI = 8e6;     // JS ile örneklenecek en fazla hedef pikseli; üstünde Chromium yumuşatması (süre ve sonuç belleği sınırı)
const EN_FAZLA_BUYUTME_CIKTISI = 3e6;   // büyütülen fotoğraf/taranmış sayfada JS ile örneklenecek en fazla hedef pikseli
const EN_FAZLA_KAYNAK = 12e6;   // ana iş parçacığında (ara tuval, küçük görsel) örneklenecek en fazla kaynak pikseli (süre sınırı)
const BANT = 1 << 20;           // bir seferde okunan ya da üretilen en fazla piksel (≈4 MB RGBA): bellek görsel boyutundan bağımsız
const EPS = 1e-6;

// ------------------------------------------------------------ etkileşim sırasında erteleme
// Kullanıcı kaydırırken (goruntuleyici.js etkilesimIzle: yalnızca gerçek girdi) örnekleme sonucu önbellekte olmayan büyük görsel ve
// ara tuval Chromium ile hızlı çizilir, sayılır; görüntüleyici kaydırma durunca (ve işçi örneklemesi bitince) görünür sayfaları keskin
// yeniden çizer (yeterliMi, keskinHazir). Sonucu önbellekte olan görsel kaydırırken de keskin çizilir (1:1 kopya): görünür olmayan (önden
// çizilen) sayfalar işçi örneklemesi bitince kaydırma sürerken de yeniden çizilir, görünür alana keskin girer (0.2.3, istenenSayisi).
export const ETKILESIM_MS = 250;
const ERTELEME_ESIGI = 512 * 512;       // bundan küçük görseller (karekod, simge) erteleme olmadan hep keskin
let sonEtkilesim = -Infinity, ertelenen = 0, istenenSayac = 0;
/** Kullanıcı sürekli kaydırıyor: ETKILESIM_MS boyunca büyük görsellerin keskin örneklemesi ertelenir. */
export function etkilesimBildir() { sonEtkilesim = performance.now(); }
/** Kaydırma dışı bir işlem (yakınlaştırma) başladı: süren erteleme hemen biter. */
export function etkilesimBitir() { sonEtkilesim = -Infinity; }
/** Etkileşim sürüyor mu (keskin örnekleme erteleniyor mu)? */
export function keskinErtelenir() { return performance.now() - sonEtkilesim < ETKILESIM_MS; }
/** Şimdiye kadar ertelenen görsel çizimi sayısı: bir çizimin öncesi ve sonrası karşılaştırılarak hızlı çizildiği anlaşılır. */
export function ertelenenSayisi() { return ertelenen; }
/**
 * İşçiden istenen (ya da istenip sırada / işçide bekleyen) örnekleme sayısı (0.2.3). Hızlı çizim sürerken artmışsa çizimin görselleri
 * işçide örnekleniyordur: örnekleme bitince sayfa kaydırma sürerken de keskin yeniden çizilebilir (sonuç önbellekten 1:1 kopyalanır).
 * Artmamışsa hızlı çizim ara tuvalin ertelenmesindendir: yeniden çizim de hızlı olur, sayfa ancak kaydırma bitince keskinleşir.
 */
export function istenenSayisi() { return istenenSayac; }

// ------------------------------------------------------------ yol kaydı
// Path2D geometrisi okunamadığı için PDF.js'in yol kurarken çağırdığı yöntemler kaydedilir (yalnızca doğru parçalarından
// oluşan kısa yollar; eğri ya da çok noktalı yol "karmaşık" işaretlenir). Metinle kurulan yollar (new Path2D(dize)) kayda girmez;
// PDF.js'in moveTo/lineTo ile kurduğu glif yolları yaziTipleri.js'te metinYolu ile karmaşık işaretlenir ve dokunulmadan çizilir.
// Kayıtlar PDF.js'in işlem listesi önbelleğindeki yollar yaşadıkça durur:
// çok çizimli belgede (plan, harita) bellek büyümesin diye yaşayan kayıtlardaki toplam nokta sınırlıdır, sınırda yeni yollar
// kaydedilmez (yalnızca ızgaraya oturtulmazlar).
const yolKaydi = new WeakMap();   // Path2D → { alt: [{ n: [x0,y0,x1,y1,…], kapali }], karmasik, nokta, yeniAlt }
const EN_FAZLA_NOKTA = 128;       // tek yolda (tablo kenarlıkları birkaç nokta; uzun çoklu çizgi ızgaraya oturtulmaz)
const KAYIT_BUTCESI = 1 << 20;    // yaşayan bütün kayıtlarda en fazla nokta (≈16 MB)
let kayitliNokta = 0;
const kayitSilici = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((k) => { kayitliNokta -= k.nokta; }) : null;
// Path2D'nin özgün (kaydetmeyen) yöntemleri: keskinlik.js'in kendi kurduğu yollar kayda ve bütçeye girmez, sarma yükü taşımaz
let yolYontemi = globalThis.Path2D?.prototype.__keskinKayit || null;

function kayitAl(yol) {
  let k = yolKaydi.get(yol);
  if (!k) {
    k = { alt: [], karmasik: false, nokta: 0, yeniAlt: null };
    yolKaydi.set(yol, k);
    kayitSilici?.register(yol, k);   // yol toplanınca noktaları bütçeden düşülür (k yola başvurmaz)
  }
  return k;
}

/** Kaydı karmaşık işaretler ve noktalarını bırakır (eğri, çok nokta, bütçe dolu). */
function kayitBirak(k) {
  kayitliNokta -= k.nokta;
  k.nokta = 0; k.karmasik = true; k.alt = []; k.yeniAlt = null;
}

/**
 * Glif yolu (yaziTipleri.js, ana hat çizimi): ince çizgi / dikdörtgen oturtmasına girmez. PDF.js glif yollarını moveTo/lineTo ile
 * kurduğundan kayda girerler; 'l', 'I', '-' gibi yalnızca dikdörtgenden oluşan glifler ızgaraya oturtulunca aynı harfler farklı
 * kalınlıkta çizilirdi.
 */
export function metinYolu(yol) {
  const k = kayitAl(yol);
  if (!k.karmasik) kayitBirak(k);
}

function yolKaydiKur() {
  const P = globalThis.Path2D?.prototype;
  if (!P || P.__keskinKayit) return;
  yolYontemi = { moveTo: P.moveTo, lineTo: P.lineTo, closePath: P.closePath };
  Object.defineProperty(P, '__keskinKayit', { value: yolYontemi });
  const sar = (ad, kaydet) => {
    const ozgun = P[ad];
    if (typeof ozgun !== 'function') return;
    P[ad] = function (...a) { kaydet(this, a); return ozgun.apply(this, a); };
  };
  const ekle = (k, x, y) => {
    if (k.karmasik) return;
    if (k.nokta >= EN_FAZLA_NOKTA || kayitliNokta >= KAYIT_BUTCESI) { kayitBirak(k); return; }
    let alt = k.alt[k.alt.length - 1];
    if (!alt || k.yeniAlt) {
      // lineTo'dan önce moveTo yoksa ya da closePath'ten sonra: yeni alt yol (closePath'te başlangıç noktasından sürer)
      const bas = k.yeniAlt;
      alt = { n: bas ? [bas[0], bas[1]] : [], kapali: false };
      k.alt.push(alt); k.yeniAlt = null;
    }
    alt.n.push(x, y);
    k.nokta++; kayitliNokta++;
  };
  sar('moveTo', (yol, [x, y]) => { const k = kayitAl(yol); if (k.karmasik) return; k.yeniAlt = null; k.alt.push({ n: [], kapali: false }); ekle(k, +x, +y); });
  sar('lineTo', (yol, [x, y]) => ekle(kayitAl(yol), +x, +y));
  sar('closePath', (yol) => {
    const k = kayitAl(yol);
    const alt = k.alt[k.alt.length - 1];
    if (k.karmasik || !alt || !alt.n.length || k.yeniAlt) return;
    alt.kapali = true; k.yeniAlt = [alt.n[0], alt.n[1]];
  });
  sar('rect', (yol, [x, y, w, h]) => {
    const k = kayitAl(yol);
    if (k.karmasik) return;
    x = +x; y = +y; w = +w; h = +h;
    k.yeniAlt = null;
    k.alt.push({ n: [], kapali: true });
    ekle(k, x, y); ekle(k, x + w, y); ekle(k, x + w, y + h); ekle(k, x, y + h);
    if (!k.karmasik) k.yeniAlt = [x, y];
  });
  for (const ad of ['bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'roundRect']) {
    sar(ad, (yol) => { const k = kayitAl(yol); if (!k.karmasik) kayitBirak(k); });
  }
  sar('addPath', (yol, [kaynak, m]) => {
    const k = kayitAl(yol);
    const s = kaynak && yolKaydi.get(kaynak);
    if (k.karmasik) return;
    if (!s || s.karmasik) { kayitBirak(k); return; }
    const d = m ? DOMMatrix.fromMatrix(m) : null;
    for (const alt of s.alt) {
      if (!alt.n.length) continue;
      k.yeniAlt = null;
      k.alt.push({ n: [], kapali: false });
      const hedef = k.alt[k.alt.length - 1];
      for (let i = 0; i < alt.n.length; i += 2) {
        const x = alt.n[i], y = alt.n[i + 1];
        if (d) ekle(k, d.a * x + d.c * y + d.e, d.b * x + d.d * y + d.f); else ekle(k, x, y);
      }
      hedef.kapali = alt.kapali;
    }
    k.yeniAlt = null;
  });
}
yolKaydiKur();

// ------------------------------------------------------------ ince çizgiler
/** Dönüşüm eksene paralel mi: 0 (a,d ölçek), 1 (b,c: 90° döndürülmüş), -1 (eğik/döndürülmüş). */
function eksen(m) {
  if (Math.abs(m.b) < EPS && Math.abs(m.c) < EPS) return 0;
  if (Math.abs(m.a) < EPS && Math.abs(m.d) < EPS) return 1;
  return -1;
}

/** Kayıtlı yolun noktalarını cihaz koordinatına çevirir: [{ n: Float64Array, kapali }] */
function cihazaCevir(kayit, m) {
  return kayit.alt.map((alt) => {
    const n = new Float64Array(alt.n.length);
    for (let i = 0; i < n.length; i += 2) {
      const x = alt.n[i], y = alt.n[i + 1];
      n[i] = m.a * x + m.c * y + m.e; n[i + 1] = m.b * x + m.d * y + m.f;
    }
    return { n, kapali: alt.kapali };
  });
}

/**
 * Eksene paralel doğru parçalarından oluşan ince çizgiyi cihaz pikseline oturtur. Genişlik tam piksele yuvarlanır (en az 1);
 * çizginin ekseni tek genişlikte piksel ortasına, çift genişlikte piksel sınırına gelir. Uç noktalar, dik bir parçaya
 * bağlıysa onun eksenine, değilse (düz uç) dışa doğru tam piksele genişletilir: köşeler boşluksuz birleşir. Kesikli çizgide
 * uçlar içe doğru tam piksele çekilir (desenin sonunda özgünde olmayan kesik parçası çıkmasın) ve başlangıcın kayması desen
 * kaymasıyla telafi edilir (kayma: yeni lineDashOffset = özgün − kayma; alt yolların kayması farklıysa null).
 * Döner: { yol, genislik, olcek, kayma } ya da null (uygun değil).
 */
function inceCizgi(ctx, kayit, kesikli = false) {
  const m = ctx.getTransform();
  const ex = eksen(m);
  if (ex < 0 || !kayit.alt.length) return null;
  const sx = ex === 0 ? Math.abs(m.a) : Math.abs(m.b), sy = ex === 0 ? Math.abs(m.d) : Math.abs(m.c);
  if (Math.abs(sx - sy) > 1e-4 * Math.max(sx, sy)) return null;
  const w = ctx.lineWidth * sx;
  if (!(w > 0) || w >= INCE) return null;
  const wr = Math.max(1, Math.round(w));
  const ortala = wr % 2 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v);
  const duz = ctx.lineCap === 'butt' && !kesikli;
  const { moveTo, lineTo, closePath } = yolYontemi || Path2D.prototype;
  const yol = new Path2D();
  let kayma = null;
  for (const alt of cihazaCevir(kayit, m)) {
    const n = alt.n, k = n.length / 2;
    if (k < 1) continue;
    // Her köşe için: dikey parçaya bağlı mı (x eksene oturur), yatay parçaya bağlı mı (y eksene oturur), uç yönü
    const dikey = new Uint8Array(k), yatay = new Uint8Array(k);
    const xAlt = new Uint8Array(k), xUst = new Uint8Array(k), yAlt = new Uint8Array(k), yUst = new Uint8Array(k);
    const parca = alt.kapali ? k : k - 1;
    if (k === 1) { dikey[0] = yatay[0] = 1; }
    for (let i = 0; i < parca; i++) {
      const j = (i + 1) % k;
      const dx = n[2 * j] - n[2 * i], dy = n[2 * j + 1] - n[2 * i + 1];
      if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) { dikey[i] = dikey[j] = yatay[i] = yatay[j] = 1; continue; }
      if (Math.abs(dy) < 1e-3) {          // yatay parça: y eksene oturur, x uçları dışa
        yatay[i] = yatay[j] = 1;
        if (dx > 0) { xAlt[i] = 1; xUst[j] = 1; } else { xUst[i] = 1; xAlt[j] = 1; }
      } else if (Math.abs(dx) < 1e-3) {   // dikey parça
        dikey[i] = dikey[j] = 1;
        if (dy > 0) { yAlt[i] = 1; yUst[j] = 1; } else { yUst[i] = 1; yAlt[j] = 1; }
      } else return null;                 // çapraz parça: dokunma
    }
    // Düz uç dışa, kesikli çizginin ucu içe tam piksele (desen özgünde olmayan parça eklemesin); ikisi de değilse yuvarlanır
    const uc = (v, alt_, ust) => (duz ? (alt_ && !ust ? Math.floor(v) : ust && !alt_ ? Math.ceil(v) : Math.round(v))
      : kesikli ? (alt_ && !ust ? Math.ceil(v) : ust && !alt_ ? Math.floor(v) : Math.round(v)) : Math.round(v));
    let bx = 0, by = 0;
    for (let i = 0; i < k; i++) {
      const x = dikey[i] ? ortala(n[2 * i]) : uc(n[2 * i], xAlt[i], xUst[i]);
      const y = yatay[i] ? ortala(n[2 * i + 1]) : uc(n[2 * i + 1], yAlt[i], yUst[i]);
      if (i === 0) { moveTo.call(yol, x, y); bx = x; by = y; } else lineTo.call(yol, x, y);
    }
    if (k === 1) lineTo.call(yol, ortala(n[0]), ortala(n[1]));
    if (alt.kapali) closePath.call(yol);
    if (kesikli && k > 1) {
      // Desen alt yolun ilk noktasından başlar: başlangıç ilk parça boyunca e kadar geri alındıysa desen de e kadar geri kayar
      const dx = n[2] - n[0], dy = n[3] - n[1];
      const e = Math.abs(dy) < 1e-3 ? Math.sign(dx) * (n[0] - bx) : Math.sign(dy) * (n[1] - by);
      if (kayma === null) kayma = e;
      else if (Math.abs(kayma - e) > 1e-3) return null;
    }
  }
  return { yol, genislik: wr, olcek: sx, kayma: kayma || 0 };
}

/**
 * Yol yalnızca eksene paralel dikdörtgenlerden oluşuyorsa, ince olanları (en az bir kenarı 4 px'ten kısa) piksele oturtur:
 * kenarlar tam piksele yuvarlanır (bitişik dikdörtgenler boşluksuz kalır); 1 px'ten ince kenar merkezindeki piksele çizilir.
 * Köşe sırası korunur (sarım yönü, dolgu kuralı değişmez). Hiç ince dikdörtgen yoksa null.
 */
function inceDikdortgenler(m, kayit) {
  if (eksen(m) < 0 || !kayit.alt.length) return null;
  const { moveTo, lineTo, closePath } = yolYontemi || Path2D.prototype;
  const yol = new Path2D();
  let degisti = false;
  for (const alt of cihazaCevir(kayit, m)) {
    const n = alt.n;
    let k = n.length / 2;
    if (k === 5 && Math.abs(n[8] - n[0]) < 1e-3 && Math.abs(n[9] - n[1]) < 1e-3) k = 4;
    if (k !== 4) return null;
    // Kenarlar sırayla yatay/dikey olmalı
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const dx = Math.abs(n[2 * j] - n[2 * i]), dy = Math.abs(n[2 * j + 1] - n[2 * i + 1]);
      if (dx > 1e-3 && dy > 1e-3) return null;
      x0 = Math.min(x0, n[2 * i]); x1 = Math.max(x1, n[2 * i]); y0 = Math.min(y0, n[2 * i + 1]); y1 = Math.max(y1, n[2 * i + 1]);
    }
    const inceX = x1 - x0 < INCE, inceY = y1 - y0 < INCE;
    let X0 = x0, X1 = x1, Y0 = y0, Y1 = y1;
    if (inceX || inceY) {
      const otur = (a, b) => {
        let A = Math.round(a), B = Math.round(b);
        if (B - A < 1) { A = Math.floor((a + b) / 2); B = A + 1; }
        return [A, B];
      };
      [X0, X1] = otur(x0, x1); [Y0, Y1] = otur(y0, y1);
      degisti = true;
    }
    const esle = (v, a, A, B) => (Math.abs(v - a) < 1e-3 ? A : B);
    for (let i = 0; i < 4; i++) {
      const x = esle(n[2 * i], x0, X0, X1), y = esle(n[2 * i + 1], y0, Y0, Y1);
      if (i === 0) moveTo.call(yol, x, y); else lineTo.call(yol, x, y);
    }
    closePath.call(yol);
  }
  return degisti ? yol : null;
}

// ------------------------------------------------------------ görsel örnekleme
/**
 * Tek eksen için ağırlıklar: n kaynak pikseli [0,n) → m hedef pikseli; yalnızca hedef [j0,j1) aralığı. Büyütme oranı s = m/n.
 * Küçültmede (s<1) merkezi hedef pikselin izdüşümüne düşen kaynak pikselleri eşit ağırlıklıdır (kutu; referans okuyucuya en yakın sonuç,
 * kısmi örtüşme ağırlığı kenarları yumuşatıyordu). Büyütmede hedef pikselin [j+0.5−g/2, j+0.5+g/2) penceresinin her kaynak
 * pikseliyle örtüşme uzunluğu ağırlıktır (g=1: alan kapsaması; g: geçiş genişliği, hedef pikseli). grafik: az renkli küçük
 * görsel (karekod, barkod): her büyütmede g=1, yakınlaştırınca da keskin kalır.
 * Döner: { ilk, son (kaynak penceresi), bas: Int32Array (her hedef için ilk kaynak − ilk), sayi, agirlik: Float32Array, adim, kucuk }
 */
function eksenAgirliklari(n, m, j0, j1, grafik) {
  const s = m / n;
  const kucuk = s < 1;
  const g = grafik || s <= KESKIN_BUYUTME ? 1 : Math.min(s, 1 + 1.5 * (s - KESKIN_BUYUTME));
  const adim = Math.ceil(g / s) + 2;
  const say = j1 - j0;
  const bas = new Int32Array(say), sayi = new Int32Array(say), agirlik = new Float32Array(say * adim);
  const dizin = new Int32Array(adim), w = new Float64Array(adim);
  let ilk = Infinity, son = -Infinity;
  for (let j = j0; j < j1; j++) {
    const L = (j + 0.5 - g / 2) / s, R = (j + 0.5 + g / 2) / s;
    const i0 = kucuk ? Math.floor(L - 0.5) + 1 : Math.floor(L), i1 = kucuk ? Math.floor(R - 0.5) : Math.ceil(R) - 1;
    let k = 0, toplam = 0;
    for (let i = i0; i <= i1; i++) {
      const a = kucuk ? 1 : Math.min(R, i + 1) - Math.max(L, i);
      if (a <= 1e-7) continue;
      const ii = i < 0 ? 0 : i >= n ? n - 1 : i;
      if (k && dizin[k - 1] === ii) w[k - 1] += a;
      else { dizin[k] = ii; w[k] = a; k++; }
      toplam += a;
    }
    if (!k) { dizin[0] = Math.min(n - 1, Math.max(0, Math.floor((j + 0.5) / s))); w[0] = 1; toplam = 1; k = 1; }
    const o = j - j0;
    bas[o] = dizin[0]; sayi[o] = k;
    for (let t = 0; t < k; t++) agirlik[o * adim + t] = w[t] / toplam;
    if (dizin[0] < ilk) ilk = dizin[0];
    if (dizin[k - 1] + 1 > son) son = dizin[k - 1] + 1;
  }
  for (let o = 0; o < say; o++) bas[o] -= ilk;
  return { ilk, son, bas, sayi, agirlik, adim, kucuk };
}

// ------------------------------------------------------------ kaynak pikselleri
// Görseller (JPEG sayfası VideoFrame, PDF.js'in çözdüğü ImageBitmap) ana iş parçacığında GPU'dan okunmaz: eşzamanlı okuma sayfa başına
// 30–90 ms, büyük görselin örneklemesi 20–30 ms bloke ediyordu (taranmış belgede kaydırma bitince 300 ms'lik görev). Büyük görseli
// bir işçi okur, pikselleri kendinde tutar ve istenen geometri için örnekler; ana iş parçacığı sonucu önbellekten 1:1 çizer. Küçük
// görseli (karekod, simge) işçi okuyup piksellerini gönderir; piksel önbelleğinde tutulur ve burada örneklenir (az renkli mi
// bakılabilsin, yakınlaştırınca hemen keskin çizilsin). İçeriği değişebilen ara tuvaller önbelleğe alınmaz, BANT piksellik
// şeritlerle okunur. Önbellek biçimi görsele göre küçültülür:
// 'gri' (opak, r=g=b: taranmış sayfa), 'alfa' (siyah/saydam maske: taramanın metin maskesi), 'rgb' (opak renkli), 'rgba'.
const EN_FAZLA_ONBELLEK = 16 * 1024 * 1024;         // ana iş parçacığındaki küçük görsel pikselleri
const EN_FAZLA_ISCI_KAYNAGI = 32 * 1024 * 1024;     // işçide tutulan görsel pikselleri
const EN_FAZLA_CIKTI_ONBELLEGI = 32 * 1024 * 1024;  // işçinin örneklediği sonuçlar (görünür sayfaların görselleri)
const EN_FAZLA_ISCI_PIKSELI = 16e6;                 // işçide okunacak en büyük görsel (okuma anında RGBA ≈ 64 MB)
const KANAL = { rgba: 4, rgb: 3, gri: 1, alfa: 1 };
const BEKLE = 'bekle';                  // görsel işçide örnekleniyor: şimdilik hızlı çizilir
const TAZE_MS = 2000;                   // bu kadar süre içinde kullanılmış giriş yer açmak için düşürülmez
const SIGMADI_MS = 5000;                // yer açılamayan küçük görsel bu süre yeniden okunmaz (Chromium ile çizilir)
const pikselOnbellek = new WeakMap();   // küçük görsel → { veri, tur, bayt, zaman (son kullanım) }
let onbellekSirasi = [];                // [{ ref: WeakRef(görsel), e: giriş }]
const sigmadi = new WeakMap();          // görsel → zaman
let bantTuvali = null;

const tuvalMi = (img) => img instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas);
const genislikAl = (img) => img.displayWidth || img.width;
const yukseklikAl = (img) => img.displayHeight || img.height;

/** Ara tuvalin [x,y,w,h] bölgesini RGBA okur (PDF.js ara tuvalleri willReadFrequently: işlemcide). */
function bolgeOku(img, x, y, w, h) {
  return img.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w, h).data;
}

/** Şerit tuvalinin belleğini bırakır (bir görselin örneklemesi bitince). */
function tuvalleriBirak() {
  if (bantTuvali) { bantTuvali.width = 0; bantTuvali.height = 0; }
}

/** RGBA pikselleri önbellek biçimine çevirir: { tur, veri }. İşçide de aynı kod çalışır. */
function sikistir(v) {
  let opak = true, gri = true, alfa = true;
  for (let p = 0, n = v.length; p < n; p += 4) {
    const r = v[p], g = v[p + 1], b = v[p + 2], a = v[p + 3];
    if (a !== 255) opak = false;
    if (r !== g || g !== b) gri = false;
    if (a !== 0 && (r | g | b) !== 0) alfa = false;
    if (!opak && !alfa) break;
  }
  const n = v.length >> 2;
  if (opak && gri) { const d = new Uint8Array(n); for (let i = 0, p = 0; i < n; i++, p += 4) d[i] = v[p]; return { tur: 'gri', veri: d }; }
  if (opak) {
    const d = new Uint8Array(n * 3);
    for (let p = 0, q = 0; q < d.length; p += 4, q += 3) { d[q] = v[p]; d[q + 1] = v[p + 1]; d[q + 2] = v[p + 2]; }
    return { tur: 'rgb', veri: d };
  }
  if (alfa) { const d = new Uint8Array(n); for (let i = 0, p = 3; i < n; i++, p += 4) d[i] = v[p]; return { tur: 'alfa', veri: d }; }
  return { tur: 'rgba', veri: v };
}

/** Önbellekteki girişi verir ve son kullanım zamanını işaretler. */
function onbellektenAl(img) {
  const e = pikselOnbellek.get(img);
  if (e) e.zaman = performance.now();
  return e || null;
}

/**
 * Küçük görselin piksellerini önbelleğe koyar; yer açmak için en uzun süredir kullanılmayan girişler düşer. Son TAZE_MS içinde
 * kullanılmış girişler düşürülmez (birbirini düşürüp sonsuz yeniden çizime girmesinler); yer açılamazsa görsel önbelleğe alınmaz
 * ve SIGMADI_MS boyunca Chromium ile çizilir. Döner: giriş ya da null.
 */
function onbellegeKoy(img, tur, veri) {
  const simdi = performance.now(), bayt = veri.byteLength;
  onbellekSirasi = onbellekSirasi.filter((o) => o.ref.deref());   // toplanmış görsellerin pikselleri de gitti
  let toplam = onbellekSirasi.reduce((t, o) => t + o.e.bayt, 0);
  const adaylar = onbellekSirasi.filter((o) => simdi - o.e.zaman > TAZE_MS).sort((p, q) => p.e.zaman - q.e.zaman);
  if (toplam - adaylar.reduce((t, o) => t + o.e.bayt, 0) + bayt > EN_FAZLA_ONBELLEK) { sigmadi.set(img, simdi); return null; }
  while (toplam + bayt > EN_FAZLA_ONBELLEK && adaylar.length) {
    const o = adaylar.shift();
    onbellekSirasi.splice(onbellekSirasi.indexOf(o), 1);
    const g = o.ref.deref();
    if (g) pikselOnbellek.delete(g);
    toplam -= o.e.bayt;
  }
  const e = { veri, tur, bayt, zaman: simdi };
  pikselOnbellek.set(img, e);
  onbellekSirasi.push({ ref: new WeakRef(img), e });
  return e;
}

/**
 * Görselin (x, y, w, h) penceresini satır satır okuyan nesne: satir(r) pencerenin r. satırının veri içindeki başlangıcını verir,
 * tur piksel düzenini (KANAL). veri satir çağrısından sonra okunur (parça değişebilir); satırlar artan sırada istenir.
 * Görsel (tuval olmayan) yalnızca küçükse önbellekten okunur; önbellekte yoksa işçiden istenir (GPU'dan eşzamanlı okuma, GPU meşgulken
 * küçük görselde bile 30–55 ms bekletiyordu). Döner: kaynak | BEKLE (işçide okunuyor) | null (okunamaz).
 */
function kaynakAc(img, x, y, w, h) {
  if (!tuvalMi(img)) {
    const e = onbellektenAl(img);
    if (!e) {
      if (okunamaz.has(img) || performance.now() - (sigmadi.get(img) ?? -Infinity) < SIGMADI_MS) return null;
      if (genislikAl(img) * yukseklikAl(img) > KUCUK_GORSEL) return null;
      iste(img, 'oku', null);
      return BEKLE;
    }
    const kanal = KANAL[e.tur], tw = genislikAl(img);
    return { veri: e.veri, tur: e.tur, satir: (r) => ((y + r) * tw + x) * kanal };
  }
  const k = { veri: null, tur: 'rgba', p0: 0, p1: 0 };
  const parca = Math.max(1, Math.floor(BANT / w));
  k.satir = (r) => {
    if (r < k.p0 || r >= k.p1) {
      const n = Math.min(parca, h - r);
      k.veri = bolgeOku(img, x, y + r, w, n);
      k.p0 = r; k.p1 = r + n;
    }
    return (r - k.p0) * w * 4;
  };
  return k;
}

/** Sıkıştırılmış biçimli kaynağın satırlarını RGBA'ya açar (genel ayrılabilir örnekleme RGBA okur). w: pencere genişliği. */
function rgbaKaynagi(k, w) {
  if (k.tur === 'rgba') return k;
  const t = new Uint8ClampedArray(w * 4), tur = k.tur;
  return {
    veri: t, tur: 'rgba',
    satir: (r) => {
      const p0 = k.satir(r), v = k.veri;
      if (tur === 'rgb') for (let q = 0, p = p0; q < t.length; q += 4, p += 3) { t[q] = v[p]; t[q + 1] = v[p + 1]; t[q + 2] = v[p + 2]; t[q + 3] = 255; }
      else if (tur === 'gri') for (let q = 0, p = p0; q < t.length; q += 4, p++) { t[q] = t[q + 1] = t[q + 2] = v[p]; t[q + 3] = 255; }
      else for (let q = 0, p = p0; q < t.length; q += 4, p++) { t[q] = t[q + 1] = t[q + 2] = 0; t[q + 3] = v[p]; }
      return 0;
    },
  };
}

// ------------------------------------------------------------ işçide örnekleme
// İstek: görsel + geometri (kaynak penceresi, hedef boyutu, görünür hedef aralığı) ya da yalnızca görsel (küçük görselin pikselleri
// geri gönderilir). İşçi görselin piksellerini ilk istekte okur
// (VideoFrame kopyası ya da ImageBitmap kopyası aktarılır) ve tutar (en fazla EN_FAZLA_ISCI_KAYNAGI; ana iş parçacığı en uzun
// süredir kullanılmayanları sildirir), aynı örnekleme kodunu (toString) çalıştırıp sonucu aktarır. Sonuçlar ana iş parçacığında
// görsel ve geometri anahtarıyla önbelleğe alınır. Kuyrukta en yeni istek önce işlenir (kaydırırken görünür sayfa); kuyruk
// boşalınca dinleyiciler (görüntüleyiciler) hızlı çizilmiş sayfaları keskin yeniden çizer (görünürleri kaydırma bitince).
const EN_FAZLA_KUYRUK = 12;
const ISCI_BOSTA_MS = 10000;              // bu kadar süre istek gelmezse işçi kapatılır: tuttuğu pikseller ve yığını bırakılır
const kuyruk = [];                        // [{ ref: WeakRef(görsel), anahtar, geo, w, h }] en yeni sonda
const istenen = new WeakMap();            // görsel → Set(anahtar): kuyrukta ya da işçide
const okunamaz = new WeakSet();           // okunamadı: Chromium ile çizilir
const iscide = new WeakMap();             // görsel → { id, nesil, bayt, zaman }
let iscideSirasi = [];                    // [{ ref: WeakRef(görsel), k: giriş }]
const ciktiOnbellek = new WeakMap();      // görsel → Map(anahtar → { goruntu: ImageData, bayt, zaman })
let ciktiSirasi = [];                     // [{ ref: WeakRef(görsel), anahtar, c }]
const hazirDinleyiciler = new Set();
let isci = null, isciNesli = 0, isciKimligi = 0, isciMesgul = false, isciBitir = null, isciBostaZamani = null;
const isciSilici = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((id) => isci?.postMessage({ sil: id })) : null;

/** İşçi örneklemeleri bitince (kuyruk boşalınca) çağrılacak işlevi ekler; döner: dinlemeyi bırakan işlev. */
export function keskinHazirDinle(fn) { hazirDinleyiciler.add(fn); return () => hazirDinleyiciler.delete(fn); }
/** İşçide örneklenen ya da sırada bekleyen görsel var mı (hızlı çizilmiş sayfa şimdi yeniden çizilirse yine hızlı çizilir)? */
export function okumaSuruyor() { return isciMesgul || kuyruk.length > 0; }

function isciKur() {
  const kod = [
    `const KANAL = ${JSON.stringify(KANAL)}, KESKIN_BUYUTME = ${KESKIN_BUYUTME}, BANT = ${BANT};`,
    ...[sikistir, eksenAgirliklari, ornekle, kutuSatiri, kutuTek, kutuRgb, kutuRgba, ayrikSatir, rgbaKaynagi].map(String),
    `const kaynaklar = new Map();
self.onmessage = ({ data: m }) => {
  if (m.sil !== undefined) { kaynaklar.delete(m.sil); return; }
  let k = kaynaklar.get(m.id) || null, yeni = false;
  if (!k && !m.kaynak) { self.postMessage({ no: m.no, kaynakYok: true }); return; }
  try {
    if (!k) {
      const t = new OffscreenCanvas(m.w, m.h), c = t.getContext('2d');
      c.drawImage(m.kaynak, 0, 0, m.w, m.h);
      k = { ...sikistir(c.getImageData(0, 0, m.w, m.h).data), w: m.w };
      t.width = 0; t.height = 0;
      if (m.geo) { kaynaklar.set(m.id, k); yeni = true; }
    }
  } catch { k = null; }
  if (m.kaynak) try { m.kaynak.close(); } catch {}
  if (!k) { self.postMessage({ no: m.no, hata: true }); return; }
  if (!m.geo) { self.postMessage({ no: m.no, tur: k.tur, veri: k.veri }, [k.veri.buffer]); return; }
  const g = m.geo;
  const ax = eksenAgirliklari(g.sw, g.dw, g.j0, g.j1, g.grafik), ay = eksenAgirliklari(g.sh, g.dh, g.k0, g.k1, g.grafik);
  const kanal = KANAL[k.tur], x = g.sx + ax.ilk, y = g.sy + ay.ilk, ow = g.j1 - g.j0, oh = g.k1 - g.k0;
  const kaynak = { veri: k.veri, tur: k.tur, satir: (r) => ((y + r) * k.w + x) * kanal };
  const cikti = new Uint8ClampedArray(ow * oh * 4);
  ornekle(kaynak, ax, ay, (bant, r0, n) => cikti.set(n === bant.height ? bant.data : bant.data.subarray(0, n * ow * 4), r0 * ow * 4));
  self.postMessage({ no: m.no, cikti, ow, oh, bayt: yeni ? k.veri.byteLength : -1 }, [cikti.buffer]);
};`,
  ].join('\n');
  const url = URL.createObjectURL(new Blob([kod], { type: 'text/javascript' }));
  const w = new Worker(url);
  URL.revokeObjectURL(url);
  w.onmessage = ({ data }) => { const f = isciBitir; isciBitir = null; f?.(data); };
  w.onerror = (e) => {
    console.warn('Keskin çizim işçisi', e.message);
    isci = null; iscideSirasi = []; isciNesli++;     // yeni işçide hiçbir görsel yok: eski nesildeki kayıtlar geçersiz
    try { w.terminate(); } catch {}
    const f = isciBitir; isciBitir = null; f?.({ hata: true });
  };
  return w;
}

/** Görselin geometri anahtarlı örnekleme sonucu (varsa). */
function ciktiAl(img, anahtar) {
  const c = ciktiOnbellek.get(img)?.get(anahtar);
  if (c) c.zaman = performance.now();
  return c || null;
}

function ciktiKoy(img, anahtar, goruntu) {
  const simdi = performance.now(), bayt = goruntu.data.byteLength;
  ciktiSirasi = ciktiSirasi.filter((o) => o.ref.deref() && ciktiOnbellek.get(o.ref.deref())?.get(o.anahtar) === o.c);
  let toplam = ciktiSirasi.reduce((t, o) => t + o.c.bayt, 0);
  // Taze sonuçlar (görünür sayfalar) düşürülmez; sınır geçici olarak aşılabilir (yeni sonuç her zaman tutulur: sonsuz döngü olmasın)
  const adaylar = ciktiSirasi.filter((o) => simdi - o.c.zaman > TAZE_MS).sort((p, q) => p.c.zaman - q.c.zaman);
  while (toplam + bayt > EN_FAZLA_CIKTI_ONBELLEGI && adaylar.length) {
    const o = adaylar.shift();
    ciktiSirasi.splice(ciktiSirasi.indexOf(o), 1);
    ciktiOnbellek.get(o.ref.deref())?.delete(o.anahtar);
    toplam -= o.c.bayt;
  }
  const c = { goruntu, bayt, zaman: simdi };
  let harita = ciktiOnbellek.get(img);
  if (!harita) ciktiOnbellek.set(img, (harita = new Map()));
  harita.set(anahtar, c);
  ciktiSirasi.push({ ref: new WeakRef(img), anahtar, c });
}

/** Boştaki işçiyi kapatır (sonraki istekte yeniden kurulur, görseller yeniden gönderilir). */
function isciKapat() {
  if (isciMesgul || !isci) return;
  try { isci.terminate(); } catch {}
  isci = null; iscideSirasi = []; isciNesli++;
}

/** İşçinin tuttuğu görseli kaydeder; sınır aşılırsa en uzun süredir kullanılmayanları işçiye sildirir (en yenisi hep kalır). */
function iscideKaydet(img, id, bayt) {
  const simdi = performance.now();
  const k = { id, nesil: isciNesli, bayt, zaman: simdi };
  iscide.set(img, k);
  isciSilici?.register(img, id);
  iscideSirasi = iscideSirasi.filter((o) => o.ref.deref() && iscide.get(o.ref.deref()) === o.k);
  iscideSirasi.push({ ref: new WeakRef(img), k });
  let toplam = iscideSirasi.reduce((t, o) => t + o.k.bayt, 0);
  const adaylar = iscideSirasi.filter((o) => o.k !== k).sort((p, q) => p.k.zaman - q.k.zaman);
  while (toplam > EN_FAZLA_ISCI_KAYNAGI && adaylar.length) {
    const o = adaylar.shift();
    iscideSirasi.splice(iscideSirasi.indexOf(o), 1);
    const g = o.ref.deref();
    if (g) iscide.delete(g);
    isci?.postMessage({ sil: o.k.id });
    toplam -= o.k.bayt;
  }
}

/**
 * İşçiden ister: geo verilirse görselin bu geometrideki örneklemesini (anahtar: geometri), verilmezse küçük görselin piksellerini
 * (anahtar 'oku'). Aynı istek sırada ya da işçideyse yeniden eklenmez.
 */
function iste(img, anahtar, geo) {
  istenenSayac++;
  let set = istenen.get(img);
  if (set?.has(anahtar)) return;
  if (!set) istenen.set(img, (set = new Set()));
  set.add(anahtar);
  kuyruk.push({ ref: new WeakRef(img), anahtar, geo, w: genislikAl(img), h: yukseklikAl(img) });
  while (kuyruk.length > EN_FAZLA_KUYRUK) { const o = kuyruk.shift(); istenen.get(o.ref.deref())?.delete(o.anahtar); }
  sonrakiniIsle();
}

async function sonrakiniIsle() {
  if (isciMesgul) return;
  let is = null, img = null;
  while (kuyruk.length && !img) {
    is = kuyruk.pop();
    img = is.ref.deref() || null;
    if (img && (okunamaz.has(img) || (is.geo ? ciktiAl(img, is.anahtar) : pikselOnbellek.has(img)))) { istenen.get(img)?.delete(is.anahtar); img = null; }
  }
  if (!img) {
    clearTimeout(isciBostaZamani);
    isciBostaZamani = setTimeout(isciKapat, ISCI_BOSTA_MS);
    for (const f of [...hazirDinleyiciler]) { try { f(); } catch (e) { console.warn('Keskin çizim bildirimi', e); } }
    return;
  }
  clearTimeout(isciBostaZamani);
  isciMesgul = true;
  const bitir = (sonuc) => {
    isciMesgul = false;
    if (sonuc.kaynakYok) { iscide.delete(img); kuyruk.push(is); sonrakiniIsle(); return; }   // işçi silmiş: kaynakla yeniden
    istenen.get(img)?.delete(is.anahtar);
    if (sonuc.hata) okunamaz.add(img);
    else if (!is.geo) onbellegeKoy(img, sonuc.tur, sonuc.veri);
    else {
      if (sonuc.bayt >= 0) iscideKaydet(img, is.id, sonuc.bayt);
      else { const k = iscide.get(img); if (k) k.zaman = performance.now(); }
      ciktiKoy(img, is.anahtar, new ImageData(sonuc.cikti, sonuc.ow, sonuc.oh));
    }
    sonrakiniIsle();
  };
  try {
    isci ||= isciKur();
    const kayit = iscide.get(img);
    let kopya = null;
    if (is.geo && kayit && kayit.nesil === isciNesli) is.id = kayit.id;
    else {
      kopya = typeof VideoFrame !== 'undefined' && img instanceof VideoFrame ? img.clone() : await createImageBitmap(img);
      is.id = ++isciKimligi;
    }
    isciBitir = bitir;
    isci.postMessage({ no: is.id, id: is.id, kaynak: kopya, w: is.w, h: is.h, geo: is.geo }, kopya ? [kopya] : []);
  } catch { isciBitir = null; bitir({ hata: true }); }
}

/** İşçinin örneklediği sonucu (görünür hedef bölgesi) tuvale 1:1 çizer. */
function ciktiCiz(ctx, ozgun, c, x, y) {
  const { width: w, height: h } = c.goruntu;
  bantTuvali ||= document.createElement('canvas');
  bantTuvali.width = w; bantTuvali.height = h;
  bantTuvali.getContext('2d', { willReadFrequently: true }).putImageData(c.goruntu, 0, 0);
  ozgun.call(ctx, bantTuvali, 0, 0, w, h, x, y, w, h);
  bantTuvali.width = 0; bantTuvali.height = 0;
}

// ------------------------------------------------------------ ara tuvalin kökü
// PDF.js büyük küçültmede görseli önce ara tuvallere yarıya indirir (_scaleImage), maskeyi önce bir tuvale koyar (_createMaskCanvas).
// Chromium bu çizimleri kaydedip ertelediği için ara tuvali okumak, kaydı işlemcide oynatmak demektir (taranmış sayfanın 1904×3136
// metin maskesinde 30–90 ms). Fabrikanın yeni kurduğu (boş) tuvale bir görselin ya da kökü bilinen tuvalin tamamı, birim dönüşüm,
// tam opaklık, süzgeçsiz ve kaynak-üstü birleştirmeyle tuvalin tamamına kopyalanır ya da yarıya indirilirse tuvalin kökü o görseldir:
// son çizim kökten örneklenir. Kopya da çizilmez (tembel): ImageBitmap'i işlemci tuvaline çizmek bile GPU'dan okuma demekti (maske
// başına 8–15 ms). Tembel tuvale başka bir şey çizilir, okunur ya da desen yapılırsa önce kökten çizilir (somutlastir). Tuvale
// başka her çizim kökü siler.
function tazeIsaretle(canvas, ctx) { canvas.__taze = true; canvas.__kok = null; canvas.__tembel = false; ctx.__koklu = true; }
function kokSil(ctx) {
  const t = ctx.canvas;
  if (t.__tembel) somutlastir(t);
  t.__taze = false; t.__kok = null; ctx.__koklu = false;
}

/** Tembel ara tuvalin içeriğini kökünden çizer (yarıya indirilmiş zincirin yerine tek adımda, mip-map'li). */
function somutlastir(t) {
  if (!t.__tembel) return;
  t.__tembel = false;
  const kok = t.__kok, ctx = t.getContext('2d');
  if (!kok || !ctx?.__ozgunCiz) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
  ctx.__ozgunCiz.call(ctx, kok, 0, 0, genislikAl(kok), yukseklikAl(kok), 0, 0, t.width, t.height);
  ctx.restore();
}

/** Döner: true → çizim yapılmamalı (tuval tembel kopya oldu). */
function kokGuncelle(ctx, img, a, yari = false) {
  if (!ctx.__koklu) return false;
  const t = ctx.canvas, bos = t.__taze;
  kokSil(ctx);
  if (!bos || !img) return false;
  const tw = genislikAl(img), th = yukseklikAl(img);
  const tam = a.length === 2
    ? a[0] === 0 && a[1] === 0 && tw === t.width && th === t.height
    : a.length === 8 && a[0] === 0 && a[1] === 0 && a[2] === tw && a[3] === th && a[4] === 0 && a[5] === 0
      && a[6] === t.width && a[7] === t.height && (yari || (a[6] === tw && a[7] === th));
  if (!tam || !ctx.getTransform().isIdentity || ctx.globalAlpha !== 1 || ctx.globalCompositeOperation !== 'source-over'
    || (ctx.filter && ctx.filter !== 'none')) return false;
  const kok = tuvalMi(img) ? img.__kok : img;
  if (!kok) return false;
  t.__kok = kok; t.__tembel = true; ctx.__koklu = true;
  return true;
}

/** Kaynak penceresi kökü bilinen ara tuvalin tamamıysa [kök, 0, 0, genişlik, yükseklik]; değilse null (tembelse önce çizilir). */
function kokBul(img, sx, sy, sw, sh) {
  const kok = tuvalMi(img) ? img.__kok : null;
  if (!kok || sx !== 0 || sy !== 0 || sw !== img.width || sh !== img.height) { if (img.__tembel) somutlastir(img); return null; }
  return [kok, 0, 0, genislikAl(kok), yukseklikAl(kok)];
}

const KUCUK_GORSEL = 512 * 512;       // az renkli (grafik) sayılabilecek ve hemen okunabilecek en büyük görsel
const AZ_RENK = 16;
const grafikOnbellek = new WeakMap(); // ImageBitmap/VideoFrame → az renkli mi (ara tuvallerin içeriği değişebildiği için onlarda tutulmaz)
/** Küçük ve en fazla 16 farklı renkli görsel mi (karekod, barkod, simge)? Fotoğraf ve taranmış sayfa değildir. BEKLE: okunuyor. */
function azRenkli(img, sx, sy, sw, sh) {
  if (sw * sh > KUCUK_GORSEL) return false;
  const onbellekli = !tuvalMi(img);
  if (onbellekli && grafikOnbellek.has(img)) return grafikOnbellek.get(img);
  let sonuc = true;
  try {
    const k = kaynakAc(img, sx, sy, sw, sh);
    if (k === BEKLE) return BEKLE;
    if (!k) sonuc = false;
    const kanal = k ? KANAL[k.tur] : 4;
    const renkler = new Set();
    for (let y = 0; y < sh && sonuc; y++) {
      const p0 = k.satir(y), v = k.veri;
      for (let p = p0, son = p0 + sw * kanal; p < son; p += kanal) {
        const renk = kanal === 4 ? v[p] * 16777216 + ((v[p + 1] << 16) | (v[p + 2] << 8) | v[p + 3])
          : kanal === 3 ? (v[p] << 16) | (v[p + 1] << 8) | v[p + 2] : v[p];
        if (renkler.has(renk)) continue;
        renkler.add(renk);
        if (renkler.size > AZ_RENK) { sonuc = false; break; }
      }
    }
  } catch { sonuc = false; }
  if (onbellekli) grafikOnbellek.set(img, sonuc);
  return sonuc;
}

/**
 * Ayrılabilir örnekleme; saydamlıkta ön çarpımlı. Hedef en fazla BANT piksellik yatay şeritler hâlinde üretilir ve her şerit
 * bantCiz(ImageData, ilkSatir, satirSayisi) ile çizilir: bellek görselin ve hedefin boyutundan bağımsızdır.
 */
function ornekle(kaynak, ax, ay, bantCiz) {
  const ow = ax.bas.length, oh = ay.bas.length, n4 = ow * 4;
  const bantSatir = Math.max(1, Math.min(oh, Math.floor(BANT / ow)));
  const bant = new ImageData(ow, bantSatir);
  const satirYaz = ax.kucuk && ay.kucuk ? kutuSatiri(kaynak, ax, ay, bant.data) : ayrikSatir(rgbaKaynagi(kaynak, ax.son - ax.ilk), ax, ay, bant.data);
  for (let r0 = 0; r0 < oh; r0 += bantSatir) {
    const n = Math.min(bantSatir, oh - r0);
    for (let k = 0; k < n; k++) satirYaz(r0 + k, k * n4);
    bantCiz(bant, r0, n);
  }
}

/**
 * İki eksende de küçültme (en sık durum: sayfa genişliğinde taranmış sayfa, fotoğraf). Nokta örneklemeli kutuda her kaynak
 * sütunu tek bir hedef pikseline düşer ve ağırlıklar eşittir: her kaynak pikseli tek toplama eklenir, biçime özel döngüyle
 * (gri/alfa tek kanal, rgb ağırlıksız, rgba alfa ağırlıklı). Sonuç ağırlıklı ortalamayla birebir aynı.
 * Döner: satirYaz(hedefSatiri, d içindeki başlangıç)
 */
function kutuSatiri(kaynak, ax, ay, d) {
  const ow = ax.bas.length, kw = ax.son - ax.ilk, tek = KANAL[kaynak.tur] === 1;
  const hedef = new Int32Array(kw);                 // kaynak sütunu → toplam dizisindeki yeri
  for (let j = 0; j < ow; j++) for (let t = 0, i = ax.bas[j]; t < ax.sayi[j]; t++, i++) hedef[i] = tek ? j : j * 4;
  // Biçime özel ayrı işlevler: tek döngü farklı dizi türleri görünce (Int32/Float64, Uint8/Uint8Clamped) V8 onu yavaşlatıyordu
  const yap = kaynak.tur === 'rgba' ? kutuRgba : kaynak.tur === 'rgb' ? kutuRgb : kutuTek;
  return yap(kaynak, hedef, ax.sayi, ay, d, kaynak.tur === 'alfa');
}

/** Tek kanallı (gri: opak gri, alfa: siyah maske) kutu toplamı. */
function kutuTek(kaynak, hedef, sayiX, ay, d, alfa) {
  const ow = sayiX.length, kw = hedef.length;
  const top = new Int32Array(ow), yuvarla = new Uint8ClampedArray(1);
  const du = new Uint8Array(d.buffer, d.byteOffset, d.length);   // yuvarlanmış tam sayılar kırpmasız yazılır
  return (k2, cik) => {
    const b = ay.bas[k2], sn = ay.sayi[k2];
    top.fill(0);
    for (let y = b; y < b + sn; y++) {
      const p0 = kaynak.satir(y), v = kaynak.veri;
      for (let i = 0, p = p0; i < kw; i++, p++) top[hedef[i]] += v[p];
    }
    for (let j = 0, q = cik; j < ow; j++, q += 4) {
      yuvarla[0] = top[j] / (sayiX[j] * sn);          // Uint8ClampedArray atamada yuvarlar (çifte yuvarlama)
      const g = yuvarla[0];
      if (alfa) { du[q] = du[q + 1] = du[q + 2] = 0; du[q + 3] = g; } else { du[q] = du[q + 1] = du[q + 2] = g; du[q + 3] = 255; }
    }
  };
}

/** Opak renkli kutu toplamı. */
function kutuRgb(kaynak, hedef, sayiX, ay, d) {
  const ow = sayiX.length, kw = hedef.length;
  const top = new Int32Array(ow * 4);
  return (k2, cik) => {
    const b = ay.bas[k2], sn = ay.sayi[k2];
    top.fill(0);
    for (let y = b; y < b + sn; y++) {
      const p0 = kaynak.satir(y), v = kaynak.veri;
      for (let i = 0, p = p0; i < kw; i++, p += 3) { const u = hedef[i]; top[u] += v[p]; top[u + 1] += v[p + 1]; top[u + 2] += v[p + 2]; }
    }
    for (let j = 0, u = 0, q = cik; j < ow; j++, u += 4, q += 4) {
      const n = sayiX[j] * sn;
      d[q] = top[u] / n; d[q + 1] = top[u + 1] / n; d[q + 2] = top[u + 2] / n; d[q + 3] = 255;
    }
  };
}

/** Saydamlıklı kutu toplamı (alfa ağırlıklı: ön çarpımlı ortalama). */
function kutuRgba(kaynak, hedef, sayiX, ay, d) {
  const ow = sayiX.length, kw = hedef.length;
  const top = new Float64Array(ow * 4);             // Σ renk·alfa, Σ alfa
  return (k2, cik) => {
    const b = ay.bas[k2], sn = ay.sayi[k2];
    top.fill(0);
    for (let y = b; y < b + sn; y++) {
      const p0 = kaynak.satir(y), v = kaynak.veri;
      for (let i = 0, p = p0; i < kw; i++, p += 4) {
        const al = v[p + 3];
        if (al === 0) continue;
        const u = hedef[i];
        top[u] += v[p] * al; top[u + 1] += v[p + 1] * al; top[u + 2] += v[p + 2] * al; top[u + 3] += al;
      }
    }
    for (let j = 0, u = 0, q = cik; j < ow; j++, u += 4, q += 4) {
      const a = top[u + 3];
      if (a > 0) { d[q] = top[u] / a; d[q + 1] = top[u + 1] / a; d[q + 2] = top[u + 2] / a; d[q + 3] = a / (sayiX[j] * sn); }
      else d[q] = d[q + 1] = d[q + 2] = d[q + 3] = 0;
    }
  };
}

/**
 * Genel ayrılabilir örnekleme (büyütme ya da karışık): önce yatay, sonra dikey. Yatay geçiş sonuçlarından yalnızca dikey çekirdeğin
 * penceresi kadar satır tutulur. Döner: satirYaz(hedefSatiri, d içindeki başlangıç)
 */
function ayrikSatir(kaynak, ax, ay, d) {
  const ow = ax.bas.length, n4 = ow * 4;
  const axBas = ax.bas, axSayi = ax.sayi, axAg = ax.agirlik, axAdim = ax.adim;
  const satirlar = new Map();                     // pencere satırı → yatay geçiş sonucu (Float32Array ow*4, ön çarpımlı)
  const serbest = [];
  const yatay = (y) => {
    let s = satirlar.get(y);
    if (s) return s;
    s = serbest.pop() || new Float32Array(n4);
    const sat = kaynak.satir(y), veri = kaynak.veri;
    for (let j = 0, q = 0; j < ow; j++, q += 4) {
      const ao = j * axAdim;
      let r = 0, g = 0, bl = 0, a = 0;
      for (let t = 0, p = sat + axBas[j] * 4, sn = axSayi[j]; t < sn; t++, p += 4) {
        const wa = axAg[ao + t] * veri[p + 3];
        r += veri[p] * wa; g += veri[p + 1] * wa; bl += veri[p + 2] * wa; a += wa;
      }
      s[q] = r; s[q + 1] = g; s[q + 2] = bl; s[q + 3] = a;
    }
    satirlar.set(y, s);
    return s;
  };
  const birikim = new Float32Array(n4);           // Uint8ClampedArray her atamada yuvarladığı için toplam ayrı tutulur
  return (k2, cik) => {
    const b = ay.bas[k2], sn = ay.sayi[k2], ao = k2 * ay.adim;
    for (const [y, s] of satirlar) if (y < b) { satirlar.delete(y); serbest.push(s); }   // pencere yalnızca aşağı kayar
    let s = birikim;
    if (sn === 1) s = yatay(b);
    else {
      birikim.fill(0);
      for (let t = 0; t < sn; t++) {
        const w = ay.agirlik[ao + t], ys = yatay(b + t);
        for (let p = 0; p < n4; p++) birikim[p] += ys[p] * w;
      }
    }
    for (let p = 0; p < n4; p += 4) {
      const a = s[p + 3], q = cik + p;
      if (a > 0) { d[q] = s[p] / a; d[q + 1] = s[p + 1] / a; d[q + 2] = s[p + 2] / a; d[q + 3] = a; }
      else d[q] = d[q + 1] = d[q + 2] = d[q + 3] = 0;
    }
  };
}

/**
 * drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) keskin sürümü. PDF.js görselleri drawImageAtIntegerCoords ile ±1 ölçekli,
 * tam sayı ötelemeli dönüşümde tam sayı hedef boyutuna çizer: bu durumda görünür hedef bölgesi JS'de örneklenip şerit şerit 1:1
 * çizilir (şeritler tam piksel sınırında birleşir). Büyük görsel (ve kaydırırken her görsel) işçide örneklenir: sonucu önbellekte
 * yoksa istenir. ertele: kullanıcı kaydırıyor, önbellekte sonucu olmayan büyük görsel/ara tuval hızlı çizilsin.
 * Döner: true (çizildi ya da görünür değil) / BEKLE (işçide örnekleniyor ya da ertelendi: hızlı çizilmeli) / false (bu yol uygun
 * değil ya da kaynak okunamadı: Chromium yumuşatmasıyla çizilmeli).
 */
function keskinGorsel(ctx, ozgun, img, sx, sy, sw, sh, dx, dy, dw, dh, grafik, ertele = false) {
  const m = ctx.getTransform();
  const ex = eksen(m);
  if (ex < 0) return false;
  const bir = (v) => Math.abs(Math.abs(v) - 1) < EPS;
  if (ex === 0 ? !(bir(m.a) && bir(m.d)) : !(bir(m.b) && bir(m.c))) return false;
  if (![sx, sy, sw, sh, dx, dy, dw, dh, m.e, m.f].every(Number.isInteger) || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return false;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  // Tuval dikdörtgeninin hedef uzayındaki karşılığı (dönüşüm ±1 ve tam sayı: sınırlar tam sayı)
  let u0, u1, v0, v1;
  if (ex === 0) {
    [u0, u1] = [(0 - m.e) / m.a, (W - m.e) / m.a].sort((p, q) => p - q);
    [v0, v1] = [(0 - m.f) / m.d, (H - m.f) / m.d].sort((p, q) => p - q);
  } else {
    [u0, u1] = [(0 - m.f) / m.b, (H - m.f) / m.b].sort((p, q) => p - q);
    [v0, v1] = [(0 - m.e) / m.c, (W - m.e) / m.c].sort((p, q) => p - q);
  }
  const j0 = Math.max(0, u0 - dx), j1 = Math.min(dw, u1 - dx);
  const k0 = Math.max(0, v0 - dy), k1 = Math.min(dh, v1 - dy);
  if (j1 <= j0 || k1 <= k0) return true;                    // görünür değil: çizilecek bir şey yok
  const cikti = (j1 - j0) * (k1 - k0);
  // Fotoğraf/taranmış sayfa büyütülürken (yakınlaştırma) hedef büyük olur: JS yavaşlar, fark da azalır → Chromium yumuşatması.
  // Kırpılmış görsel maskesinde (maskeKirpmaKur) büyütme kararı bütün maskenin dolgu boyutuyla verilir: iki renkli maske ara
  // büyütmede (×2–4) basamaklı görünmesin, kırpılmadan önceki gibi yumuşak çizilsin.
  const buyutmeCiktisi = ctx.__maskeDolgusu || cikti;
  if (cikti > EN_FAZLA_CIKTI || (!grafik && (dw > sw || dh > sh) && buyutmeCiktisi > EN_FAZLA_BUYUTME_CIKTISI)) return false;
  const tw = tuvalMi(img) ? 0 : genislikAl(img) * yukseklikAl(img);
  if (tw > KUCUK_GORSEL || (tw && ertele)) {
    if (okunamaz.has(img) || tw > EN_FAZLA_ISCI_PIKSELI) return false;
    const geo = { sx, sy, sw, sh, dw, dh, j0, j1, k0, k1, grafik: !!grafik };
    const anahtar = `${sx},${sy},${sw},${sh},${dw},${dh},${j0},${j1},${k0},${k1},${geo.grafik ? 1 : 0}`;
    const c = ciktiAl(img, anahtar);
    if (c) { ciktiCiz(ctx, ozgun, c, dx + j0, dy + k0); return true; }
    iste(img, anahtar, geo);
    return BEKLE;
  }
  if (ertele) return BEKLE;                                 // ara tuval: kaydırma durunca şeritlerle okunur
  const ax = eksenAgirliklari(sw, dw, j0, j1, grafik), ay = eksenAgirliklari(sh, dh, k0, k1, grafik);
  const kw = ax.son - ax.ilk, kh = ay.son - ay.ilk, ow = j1 - j0;
  if (kw * kh > EN_FAZLA_KAYNAK) return false;
  const kaynak = kaynakAc(img, sx + ax.ilk, sy + ay.ilk, kw, kh);
  if (!kaynak || kaynak === BEKLE) return kaynak || false;
  let cizildi = false;
  try {
    kaynak.satir(0);                                        // okunamayan ara tuval hiçbir şey çizilmeden burada düşer
    bantTuvali ||= document.createElement('canvas');
    const bc = bantTuvali.getContext('2d', { willReadFrequently: true });
    ornekle(kaynak, ax, ay, (bant, r0, n) => {
      if (bantTuvali.width !== ow || bantTuvali.height < n) { bantTuvali.width = ow; bantTuvali.height = bant.height; }
      bc.putImageData(bant, 0, 0, 0, 0, ow, n);
      ozgun.call(ctx, bantTuvali, 0, 0, ow, n, dx + j0, dy + k0 + r0, ow, n);
      cizildi = true;
    });
    return true;
  } catch (e) {
    if (cizildi) console.warn('Keskin görsel çizimi yarıda kaldı', e);
    return false;
  } finally {
    tuvalleriBirak();
  }
}

/**
 * PDF.js'in çizdiği bir 2B bağlamı keskin çizime sarar (örnek düzeyinde; prototip değişmez). Aynı bağlam iki kez sarılmaz.
 */
export function keskinBaglam(ctx) {
  if (!ctx || ctx.__keskin) return ctx;
  Object.defineProperty(ctx, '__keskin', { value: true });
  const ozgunCiz = ctx.drawImage, ozgunCizgi = ctx.stroke, ozgunDoldur = ctx.fill, ozgunDikdortgen = ctx.fillRect;
  const ozgunKoy = ctx.putImageData, ozgunTemizle = ctx.clearRect, ozgunOku = ctx.getImageData, ozgunDesen = ctx.createPattern;
  ctx.__ozgunCiz = ozgunCiz;

  const yumusak = (bag, arg, kalite = 'high') => {
    bag.save();
    bag.imageSmoothingEnabled = true; bag.imageSmoothingQuality = kalite;
    ozgunCiz.apply(bag, arg);
    bag.restore();
  };
  // Görsel işçide örnekleniyor ya da kullanıcı kaydırıyor: hızlı çiz (küçültmede iki doğrusal, mip-map'li 'high' kadar bulanık
  // değil) ve say; görüntüleyici sonra keskin yeniden çizer
  const hizli = (bag, arg) => {
    ertelenen++;
    yumusak(bag, arg, arg[7] < arg[3] && arg[8] < arg[4] ? 'low' : 'high');
  };
  // Dönüşüm ±1 ölçekli ve tam sayı ötelemeli mi (piksel kopyası: örnekleme yok)?
  const birim = (m) => {
    const bir = (v) => Math.abs(Math.abs(v) - 1) < EPS;
    const ex = eksen(m);
    return ex >= 0 && (ex === 0 ? bir(m.a) && bir(m.d) : bir(m.b) && bir(m.c)) && Number.isInteger(m.e) && Number.isInteger(m.f);
  };
  ctx.drawImage = function (img, ...a) {
    // Kısa biçimler (grup/maske birleştirme, desen karosu) ve ölçeklenmiş dönüşümle birebir çizim: piksel kopyası değilse yumuşak.
    // PDF.js endGroup'ta yumuşatmayı kapatıyor, eğik/döndürülmüş görseli de (drawImageAtIntegerCoords 3. dalı) birebir boyutla
    // dönüşüme bırakıyor: yumuşatma kapalı kalırsa yakınlaştırınca pikselli çizilirdi.
    if (a.length !== 8) {
      if (kokGuncelle(this, img, a)) return;
      if (img?.__tembel) somutlastir(img);
      const esit = a.length === 2 || (a[2] === (img.displayWidth || img.width) && a[3] === (img.displayHeight || img.height));
      if (esit && birim(this.getTransform()) && Number.isInteger(a[0]) && Number.isInteger(a[1])) return ozgunCiz.call(this, img, ...a);
      return yumusak(this, [img, ...a]);
    }
    const [sx, sy, sw, sh, , , dw, dh] = a;
    if (dw === sw && dh === sh) {
      if (kokGuncelle(this, img, a)) return;
      if (img.__tembel && !kokBul(img, sx, sy, sw, sh)) somutlastir(img);
      if (img.__tembel) { const k = kokBul(img, sx, sy, sw, sh); return yumusak(this, [k[0], k[1], k[2], k[3], k[4], a[4], a[5], dw, dh]); }
      if (birim(this.getTransform())) return ozgunCiz.call(this, img, ...a);
      return yumusak(this, [img, ...a]);
    }
    // PDF.js'in yarıya indirme adımları (_scaleImage): tam yarıda iki doğrusal örnekleme 2×2 kutu ortalamasıdır
    const yari = (d, s) => d === s || d === Math.ceil(s / 2);
    if (yari(dw, sw) && yari(dh, sh) && sw > 1 && sh > 1 && (dw !== sw || dh !== sh) && this.getTransform().isIdentity) {
      if (kokGuncelle(this, img, a, true)) return;
      if (img.__tembel) somutlastir(img);
      this.save(); this.imageSmoothingEnabled = true; this.imageSmoothingQuality = 'low';
      ozgunCiz.call(this, img, ...a);
      this.restore();
      return;
    }
    kokGuncelle(this, img, a);
    // Ara tuval bir görselin tamamının kopyası ya da yarıya indirilmişiyse doğrudan o görselden örneklenir (ara tuval okunmaz)
    const [g, gx, gy, gw, gh] = kokBul(img, sx, sy, sw, sh) || [img, sx, sy, sw, sh];
    const arg = [g, gx, gy, gw, gh, a[4], a[5], dw, dh];   // hızlı/yumuşak çizim de kökten (tembel ara tuval boş)
    // Büyütmede az renkli küçük görseller (karekod, barkod) hep alan filtresiyle keskin; fotoğraf ve taranmış sayfa ×4'ten sonra yumuşak
    const grafik = dw > gw && dh > gh ? azRenkli(g, gx, gy, gw, gh) : false;
    if (grafik === BEKLE) return hizli(this, arg);
    if (!grafik && dw / gw >= YUMUSAK_BUYUTME && dh / gh >= YUMUSAK_BUYUTME) return yumusak(this, arg);
    // Kaydırma sürüyor: sonucu önbellekte olmayan büyük görsel (işçide örneklenmeye başlar) ve ara tuval hızlı çizilir
    const ertele = !grafik && gw * gh > ERTELEME_ESIGI && keskinErtelenir();
    const sonuc = keskinGorsel(this, ozgunCiz, g, gx, gy, gw, gh, a[4], a[5], dw, dh, grafik, ertele);
    if (sonuc === BEKLE) hizli(this, arg);
    else if (!sonuc) yumusak(this, arg);
  };

  ctx.stroke = function (yol) {
    if (this.__koklu) kokSil(this);
    if (arguments.length === 1 && yol && typeof this.strokeStyle === 'string') {
      const kayit = yolKaydi.get(yol);
      const kesik = kayit && !kayit.karmasik ? this.getLineDash() : null;
      const s = kesik ? inceCizgi(this, kayit, kesik.length > 0) : null;
      if (s) {
        const kayma = this.lineDashOffset;
        this.save();
        this.setTransform(1, 0, 0, 1, 0, 0);
        this.lineWidth = s.genislik;
        if (kesik.length) { this.setLineDash(kesik.map((v) => v * s.olcek)); this.lineDashOffset = kayma * s.olcek - s.kayma; }
        ozgunCizgi.call(this, s.yol);
        this.restore();
        return;
      }
    }
    return ozgunCizgi.apply(this, arguments);
  };

  ctx.fill = function (yol, kural) {
    if (this.__koklu) kokSil(this);
    if (yol && typeof yol === 'object' && typeof this.fillStyle === 'string') {
      const kayit = yolKaydi.get(yol);
      const d = kayit && !kayit.karmasik ? inceDikdortgenler(this.getTransform(), kayit) : null;
      if (d) {
        this.save();
        this.setTransform(1, 0, 0, 1, 0, 0);
        if (kural) ozgunDoldur.call(this, d, kural); else ozgunDoldur.call(this, d);
        this.restore();
        return;
      }
    }
    return ozgunDoldur.apply(this, arguments);
  };

  // Tek renkli görsel maskesi (paintSolidColorImageMask) birim kareyi dönüşümle doldurur: ince çizgi olarak da kullanılır
  ctx.fillRect = function (x, y, w, h) {
    if (this.__koklu) kokSil(this);
    if (arguments.length === 4 && typeof this.fillStyle === 'string') {
      const kayit = { alt: [{ n: [x, y, x + w, y, x + w, y + h, x, y + h], kapali: true }], karmasik: false };
      const d = inceDikdortgenler(this.getTransform(), kayit);
      if (d) {
        this.save();
        this.setTransform(1, 0, 0, 1, 0, 0);
        ozgunDoldur.call(this, d);
        this.restore();
        return;
      }
    }
    return ozgunDikdortgen.apply(this, arguments);
  };

  // Tuvalin içeriğini değiştiren diğer işlemler kökü siler (ara tuvalin kökü: kokGuncelle)
  ctx.putImageData = function () { if (this.__koklu) kokSil(this); return ozgunKoy.apply(this, arguments); };
  ctx.getImageData = function () { if (this.canvas.__tembel) somutlastir(this.canvas); return ozgunOku.apply(this, arguments); };
  ctx.createPattern = function (img) { if (img?.__tembel) somutlastir(img); return ozgunDesen.apply(this, arguments); };
  ctx.clearRect = function () { if (this.__koklu && this.canvas.__kok) kokSil(this); return ozgunTemizle.apply(this, arguments); };
  return ctx;
}

// ------------------------------------------------------------ görsel maskesinin kırpılması
// PDF.js görsel maskesini (MRC taramanın metin maskesi: CCITT, dolgu rengiyle çizilir) önce maskenin cihazdaki tam boyutunda bir
// dolgu tuvaline boyar (_createMaskCanvas), sonra hedef tuvale kopyalar. Bölgesel çizimde (yüksek yakınlaştırma) hedef tuval görünen
// bölge kadardır ama dolgu tuvali bütün maske kadar kalıyordu: Canon taramasında %1600'de 9707×15790 (153 MP, 0,6–3 sn, GPU belleği
// GB'larca büyüyüp geri verilmiyordu), %2000'de 6 sn, %2400 ve üstünde Chromium'un tuval sınırını aşıp metin hiç çizilmiyordu.
// Tek konumda çizilen maskenin (paintImageMaskXObject) dolgu tuvali hedef tuvalle kesişimi kadar kurulur ve çizim o kadar kaydırılır;
// maskenin örneklenmesi ve dolgu rengi PDF.js'in kendi kodunda aynen kalır. Tamamı görünen maske (sayfa genişliği, tam sayfa
// çizimi) ile tekrarlı/desenli maske eskisi gibi çizilir. PDF.js sınıfları dışa açık olmadığı için prototip ilk çizim görevinden bulunur.
const MASKE_PAYI = 2;   // kırpılan kenarda yuvarlama farkına karşı pay (cihaz pikseli; hedef tuvalin dışında kalır)

/** CanvasGraphics prototipinde tek konumlu görsel maskesini hedef tuvale kırpar (bir kez). */
function maskeKirpmaKur(G) {
  if (!G || Object.prototype.hasOwnProperty.call(G, '__keskinMaske')) return;
  Object.defineProperty(G, '__keskinMaske', { value: true });
  const ozgunMaske = G._createMaskCanvas, ozgunBoya = G.paintImageMaskXObject;
  if (typeof ozgunMaske !== 'function' || typeof ozgunBoya !== 'function') return;
  // Tekrarlı maske (paintImageMaskXObjectRepeat) aynı tuvali birçok konuma çizer: yalnızca tek konumlu çizimde kırpılır. PDF.js
  // işlemleri numarasıyla (OPS) çağırır: prototipte aynı işlevi taşıyan numaralı anahtar da değiştirilir.
  const boya = function (...a) {
    this.__maskeKirp = true;
    try { return ozgunBoya.apply(this, a); } finally { this.__maskeKirp = false; }
  };
  for (const k of Object.getOwnPropertyNames(G)) if (Object.getOwnPropertyDescriptor(G, k).value === ozgunBoya) G[k] = boya;
  G._createMaskCanvas = function (opIdx, img) {
    const kirp = this.__maskeKirp;
    this.__maskeKirp = false;
    const ctx = this.ctx, t = ctx?.canvas, fab = this.canvasFactory;
    if (!kirp || !t || !fab || this.dependencyTracker || this.current?.patternFill || !(img?.width > 0 && img?.height > 0)) return ozgunMaske.call(this, opIdx, img);
    // Maskenin cihazdaki kutusu (PDF.js'teki gibi: birim karenin dönüşümü) ve dolgu tuvalinin hedefte görünen kısmı [i0,i1)×[k0,k1)
    const m = ctx.getTransform();
    const xs = [m.e, m.a + m.e, m.c + m.e, m.a + m.c + m.e], ys = [m.f, m.b + m.f, m.d + m.f, m.b + m.d + m.f];
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    if (![x0, y0, x1, y1].every(Number.isFinite)) return ozgunMaske.call(this, opIdx, img);
    const gw = Math.round(x1 - x0) || 1, gh = Math.round(y1 - y0) || 1, ox = Math.round(x0), oy = Math.round(y0);
    const i0 = Math.max(0, -ox - MASKE_PAYI), i1 = Math.min(gw, t.width - ox + MASKE_PAYI);
    const k0 = Math.max(0, -oy - MASKE_PAYI), k1 = Math.min(gh, t.height - oy + MASKE_PAYI);
    if (i0 === 0 && k0 === 0 && i1 === gw && k1 === gh) return ozgunMaske.call(this, opIdx, img);
    if (i1 <= i0 || k1 <= k0) {                             // hiç görünmüyor: maske çözülmeden boş tuval
      const bos = fab.create(1, 1);
      return { canvas: bos.canvas, canvasEntry: bos, offsetX: ox, offsetY: oy };
    }
    // PDF.js önce maskeyi kendi boyutunda (1.), sonra dolgu tuvalini (2.) kurar; dolgu tuvali kesişim kadar kurulur ve ilk ötelemesi
    // (cihaz uzayında) kesişimin başına kaydırılır. Önbellek (aynı maske birden çok kez: count > 1) kapalı: kırpılmış tuval başka
    // konumda kullanılamaz, kurulan tuvallerin sırası da böylece sabit kalır.
    let n = 0, kaydirma = null;
    this.canvasFactory = {
      create: (w, h) => {
        if (++n !== 2 || Math.abs(w - gw) > 1 || Math.abs(h - gh) > 1) return fab.create(w, h);
        const e = fab.create(i1 - i0, k1 - k0);
        e.context.translate = function (x, y) { delete this.translate; return this.translate(x - i0, y - k0); };
        if (e.context.__keskin) e.context.__maskeDolgusu = gw * gh;   // örnekleme kararı için bütün dolgunun boyutu (keskinGorsel)
        kaydirma = [i0, k0];
        return e;
      },
      reset: (...a) => fab.reset(...a),
      destroy: (...a) => fab.destroy(...a),
    };
    const sayi = img.count;
    img.count = 1;
    try {
      const r = ozgunMaske.call(this, opIdx, img);
      if (r && kaydirma) { r.offsetX += kaydirma[0]; r.offsetY += kaydirma[1]; }
      return r;
    } finally {
      this.canvasFactory = fab;
      img.count = sayi;
    }
  };
}

/**
 * page.render() görevini alır: PDF.js'in çizim sınıfını ilk çizimden önce bulup görsel maskesi kırpmasını kurar (bir kez; ilk
 * görevin çizimi de kırpılır). PDF.js iç yapısı değişirse hiçbir şey yapmaz. Döner: görev.
 */
export function cizimGoreviHazirla(gorev) {
  const P = gorev?._internalRenderTask && Object.getPrototypeOf(gorev._internalRenderTask);
  if (!P || Object.prototype.hasOwnProperty.call(P, '__keskinGorev') || typeof P.initializeGraphics !== 'function') return gorev;
  Object.defineProperty(P, '__keskinGorev', { value: true });
  const ozgun = P.initializeGraphics;
  P.initializeGraphics = function (...a) {
    const r = ozgun.apply(this, a);
    if (this.gfx) maskeKirpmaKur(Object.getPrototypeOf(this.gfx));
    return r;
  };
  return gorev;
}

/** PDF.js getDocument({ CanvasFactory }) için: ara tuvallerin (grup, maske, desen, küçültme) bağlamları da keskin sarılır. */
export class KeskinTuvalFabrikasi {
  #hwa;
  constructor({ ownerDocument = globalThis.document, enableHWA = false } = {}) {
    this._document = ownerDocument;
    this.#hwa = enableHWA;
  }
  create(width, height) {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = this._document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = keskinBaglam(canvas.getContext('2d', { willReadFrequently: !this.#hwa }));
    tazeIsaretle(canvas, context);
    return { canvas, context };
  }
  reset(entry, width, height) {
    if (!entry.canvas) throw new Error('Canvas is not specified');
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    entry.canvas.width = width; entry.canvas.height = height;
    if (entry.context) tazeIsaretle(entry.canvas, entry.context);
  }
  destroy(entry) {
    if (!entry.canvas) throw new Error('Canvas is not specified');
    entry.canvas.width = entry.canvas.height = 0;
    entry.canvas.__kok = null; entry.canvas.__tembel = false;
    entry.canvas = null; entry.context = null;
  }
}
