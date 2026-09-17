// Keskin çizim: PDF.js sayfa tuvallerinde referans okuyucuya yakın görüntü kalitesi.
// 1) Görseller kutu/alan filtresiyle JS'de yeniden örneklenir. Referans okuyucunun (110 ppi, %100) ekran yakalamasıyla ölçüldü:
//    küçültmede (PTT JPEG ×0,76, taranmış sayfa ×0,55) nokta örneklemeli kutu, büyütmede (UYAP karekodu ×1,5) alan kapsaması
//    Referans okuyucuya en yakın sonuç. Chromium'un 'high' kalitesi küçültmede mip-map karıştırıp bulanıklaştırıyor, büyütmede kübik
//    yumuşatıyordu; PDF.js'in kendi seçimi (×1,33 üstünde en yakın komşu) ise pikselli. Fotoğraf/taranmış sayfa ×2–×4 arasında
//    giderek yumuşar, ×4 ve üstünde (ya da hedef çok büyükse) Chromium'un yüksek kaliteli yumuşatmasıyla çizilir; az renkli
//    küçük görseller (karekod, barkod) her yakınlaştırmada keskin kalır.
// 2) İnce çizgiler (eksene paralel, cihazda 4 px'ten ince çizgi ve dolu dikdörtgen) piksel ızgarasına oturtulur
//    (referans okuyucu "ince çizgileri geliştir"): tablo kenarlıkları iki satıra yayılmış gri yerine tam piksel siyah çizilir.
// Metin değişmez: aynı ölçekte PDF.js (ClearType alt piksel) ile referans okuyucu arasında ölçülen fark yok.
// Yalnızca keskinBaglam() ile sarılmış bağlamlar (sayfa tuvali ve PDF.js'in ara tuvalleri) etkilenir.

const INCE = 4;                 // cihaz pikselinde bu kalınlıktan ince çizgi/dikdörtgen ızgaraya oturtulur
const KESKIN_BUYUTME = 2;       // bu orana kadar büyütmede saf alan filtresi (referans okuyucu gibi keskin)
const YUMUSAK_BUYUTME = 4;      // bu oran ve üstünde Chromium yumuşatması (taranmış sayfa yakınlaştırınca pikselli olmasın)
const EN_FAZLA_CIKTI = 16e6;    // JS ile örneklenecek en fazla hedef pikseli; üstünde Chromium yumuşatması
const EN_FAZLA_BUYUTME_CIKTISI = 3e6;   // büyütülen fotoğraf/taranmış sayfada JS ile örneklenecek en fazla hedef pikseli
const EN_FAZLA_KAYNAK = 20e6;   // okunacak en fazla kaynak pikseli (RGBA kopyası geçici olarak 4 bayt/piksel)
const EPS = 1e-6;

// ------------------------------------------------------------ etkileşim sırasında erteleme
// Büyük görselin JS örneklemesi ana iş parçacığını 50–70 ms bloke eder (taranmış sayfa): sürekli kaydırırken her yeni sayfada
// takılma olmasın diye bu sırada Chromium ile hızlı çizilir, sayılır; görüntüleyici kaydırma durunca görünür sayfaları keskin
// yeniden çizer (goruntuleyici.js etkilesimIzle / yeterliMi).
export const ETKILESIM_MS = 250;
const ERTELEME_ESIGI = 512 * 512;       // bundan küçük görseller (karekod, simge) erteleme olmadan hep keskin
let sonEtkilesim = -Infinity, ertelenen = 0;
/** Kullanıcı sürekli kaydırıyor: ETKILESIM_MS boyunca büyük görsellerin keskin örneklemesi ertelenir. */
export function etkilesimBildir() { sonEtkilesim = performance.now(); }
/** Etkileşim sürüyor mu (keskin örnekleme erteleniyor mu)? */
export function keskinErtelenir() { return performance.now() - sonEtkilesim < ETKILESIM_MS; }
/** Şimdiye kadar ertelenen görsel çizimi sayısı: bir çizimin öncesi ve sonrası karşılaştırılarak hızlı çizildiği anlaşılır. */
export function ertelenenSayisi() { return ertelenen; }

// ------------------------------------------------------------ yol kaydı
// Path2D geometrisi okunamadığı için PDF.js'in yol kurarken çağırdığı yöntemler kaydedilir (yalnızca doğru parçalarından
// oluşan kısa yollar; eğri ya da çok noktalı yol "karmaşık" işaretlenir). Metinle kurulan yollar (new Path2D(dize),
// glif yolları) kayda girmez ve dokunulmadan çizilir.
const yolKaydi = new WeakMap();   // Path2D → { alt: [{ n: [x0,y0,x1,y1,…], kapali }], karmasik, nokta, yeniAlt }
const EN_FAZLA_NOKTA = 512;

function kayitAl(yol) {
  let k = yolKaydi.get(yol);
  if (!k) { k = { alt: [], karmasik: false, nokta: 0, yeniAlt: null }; yolKaydi.set(yol, k); }
  return k;
}

function yolKaydiKur() {
  const P = globalThis.Path2D?.prototype;
  if (!P || P.__keskinKayit) return;
  Object.defineProperty(P, '__keskinKayit', { value: true });
  const sar = (ad, kaydet) => {
    const ozgun = P[ad];
    if (typeof ozgun !== 'function') return;
    P[ad] = function (...a) { kaydet(this, a); return ozgun.apply(this, a); };
  };
  const ekle = (k, x, y) => {
    if (k.karmasik) return;
    if (++k.nokta > EN_FAZLA_NOKTA) { k.karmasik = true; k.alt = []; return; }
    let alt = k.alt[k.alt.length - 1];
    if (!alt || k.yeniAlt) {
      // lineTo'dan önce moveTo yoksa ya da closePath'ten sonra: yeni alt yol (closePath'te başlangıç noktasından sürer)
      const bas = k.yeniAlt;
      alt = { n: bas ? [bas[0], bas[1]] : [], kapali: false };
      k.alt.push(alt); k.yeniAlt = null;
    }
    alt.n.push(x, y);
  };
  sar('moveTo', (yol, [x, y]) => { const k = kayitAl(yol); if (k.karmasik) return; k.yeniAlt = null; k.alt.push({ n: [], kapali: false }); ekle(k, +x, +y); });
  sar('lineTo', (yol, [x, y]) => ekle(kayitAl(yol), +x, +y));
  sar('closePath', (yol) => {
    const k = kayitAl(yol);
    const alt = k.alt[k.alt.length - 1];
    if (k.karmasik || !alt || k.yeniAlt) return;
    alt.kapali = true; k.yeniAlt = [alt.n[0], alt.n[1]];
  });
  sar('rect', (yol, [x, y, w, h]) => {
    const k = kayitAl(yol);
    if (k.karmasik) return;
    x = +x; y = +y; w = +w; h = +h;
    k.yeniAlt = null;
    k.alt.push({ n: [], kapali: true });
    ekle(k, x, y); ekle(k, x + w, y); ekle(k, x + w, y + h); ekle(k, x, y + h);
    k.yeniAlt = [x, y];
  });
  for (const ad of ['bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'roundRect']) {
    sar(ad, (yol) => { const k = kayitAl(yol); k.karmasik = true; k.alt = []; });
  }
  sar('addPath', (yol, [kaynak, m]) => {
    const k = kayitAl(yol);
    const s = kaynak && yolKaydi.get(kaynak);
    if (k.karmasik) return;
    if (!s || s.karmasik) { k.karmasik = true; k.alt = []; return; }
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
 * bağlıysa onun eksenine, değilse (düz uç) dışa doğru tam piksele genişletilir: köşeler boşluksuz birleşir.
 * Döner: { yol, genislik, olcek } ya da null (uygun değil).
 */
function inceCizgi(ctx, kayit) {
  const m = ctx.getTransform();
  const ex = eksen(m);
  if (ex < 0 || !kayit.alt.length) return null;
  const sx = ex === 0 ? Math.abs(m.a) : Math.abs(m.b), sy = ex === 0 ? Math.abs(m.d) : Math.abs(m.c);
  if (Math.abs(sx - sy) > 1e-4 * Math.max(sx, sy)) return null;
  const w = ctx.lineWidth * sx;
  if (!(w > 0) || w >= INCE) return null;
  const wr = Math.max(1, Math.round(w));
  const ortala = wr % 2 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v);
  const duz = ctx.lineCap === 'butt';
  const yol = new Path2D();
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
    const uc = (v, alt_, ust) => (duz ? (alt_ && !ust ? Math.floor(v) : ust && !alt_ ? Math.ceil(v) : Math.round(v)) : Math.round(v));
    for (let i = 0; i < k; i++) {
      const x = dikey[i] ? ortala(n[2 * i]) : uc(n[2 * i], xAlt[i], xUst[i]);
      const y = yatay[i] ? ortala(n[2 * i + 1]) : uc(n[2 * i + 1], yAlt[i], yUst[i]);
      if (i === 0) yol.moveTo(x, y); else yol.lineTo(x, y);
    }
    if (k === 1) yol.lineTo(ortala(n[0]), ortala(n[1]));
    if (alt.kapali) yol.closePath();
  }
  return { yol, genislik: wr, olcek: sx };
}

/**
 * Yol yalnızca eksene paralel dikdörtgenlerden oluşuyorsa, ince olanları (en az bir kenarı 4 px'ten kısa) piksele oturtur:
 * kenarlar tam piksele yuvarlanır (bitişik dikdörtgenler boşluksuz kalır); 1 px'ten ince kenar merkezindeki piksele çizilir.
 * Köşe sırası korunur (sarım yönü, dolgu kuralı değişmez). Hiç ince dikdörtgen yoksa null.
 */
function inceDikdortgenler(m, kayit) {
  if (eksen(m) < 0 || !kayit.alt.length) return null;
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
      if (i === 0) yol.moveTo(x, y); else yol.lineTo(x, y);
    }
    yol.closePath();
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
 * Döner: { ilk, son (kaynak penceresi), bas: Int32Array (her hedef için ilk kaynak − ilk), sayi, agirlik: Float32Array, adim }
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

// Kaynak pikselleri: PDF.js'in çözdüğü görsel nesneleri (ImageBitmap, VideoFrame) sayfa temizlenene kadar aynı kalır; yakınlaştırınca
// yeniden okumamak için tam görselin pikselleri sınırlı bir önbellekte tutulur (en son kullanılanlar, toplam EN_FAZLA_ONBELLEK bayt).
const EN_FAZLA_ONBELLEK = 48 * 1024 * 1024;
const pikselOnbellek = new WeakMap();   // görsel → Uint8ClampedArray (tam görsel, RGBA)
let onbellekSirasi = [];                // [{ ref: WeakRef(görsel), bayt }] eskiden yeniye
let okumaTuvali = null;

/** Görselin [x,y,w,h] bölgesini okur. Döner: { veri, satir (satır başına piksel), x0, y0 (verinin görseldeki sol üstü) } */
function kaynakPikselleri(img, x, y, w, h) {
  if (img instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)) {
    const c = img.getContext('2d', { willReadFrequently: true });   // PDF.js ara tuvali: içeriği değişebilir, önbelleğe alınmaz
    if (c) return { veri: c.getImageData(x, y, w, h).data, satir: w, x0: x, y0: y };
  }
  const tw = img.displayWidth || img.width, th = img.displayHeight || img.height;
  let tam = pikselOnbellek.get(img);
  // Tamamı önbelleğe sığan ve istenen bölge görselin en az dörtte biri olduğunda (yüksek yakınlaştırmada küçük bölge için
  // bütün taranmış sayfa okunmasın) tamamı okunur
  if (!tam && tw * th * 4 <= EN_FAZLA_ONBELLEK && 4 * w * h >= tw * th) {
    tam = oku(img, 0, 0, tw, th);
    pikselOnbellek.set(img, tam);
    onbellekSirasi.push({ ref: new WeakRef(img), bayt: tam.byteLength });
    let toplam = onbellekSirasi.reduce((t, e) => t + e.bayt, 0);
    while (toplam > EN_FAZLA_ONBELLEK && onbellekSirasi.length > 1) {
      const e = onbellekSirasi.shift();
      const o = e.ref.deref();
      if (o) pikselOnbellek.delete(o);
      toplam -= e.bayt;
    }
  }
  if (tam) return { veri: tam, satir: tw, x0: 0, y0: 0 };
  return { veri: oku(img, x, y, w, h), satir: w, x0: x, y0: y };
}

function oku(img, x, y, w, h) {
  // OffscreenCanvas + willReadFrequently: belge tuvalinden ~2 kat hızlı (VideoFrame 1654×2338: 20 ms / 41 ms)
  okumaTuvali ||= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
  okumaTuvali.width = w; okumaTuvali.height = h;
  const c = okumaTuvali.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, w, h);
  c.drawImage(img, x, y, w, h, 0, 0, w, h);
  const veri = c.getImageData(0, 0, w, h).data;
  okumaTuvali.width = 1; okumaTuvali.height = 1;
  return veri;
}

const KUCUK_GORSEL = 512 * 512;       // az renkli (grafik) sayılabilecek en büyük görsel
const AZ_RENK = 16;
const grafikOnbellek = new WeakMap(); // ImageBitmap/VideoFrame → az renkli mi (ara tuvallerin içeriği değişebildiği için onlarda tutulmaz)
/** Küçük ve en fazla 16 farklı renkli görsel mi (karekod, barkod, simge)? Fotoğraf ve taranmış sayfa değildir. */
function azRenkli(img, sx, sy, sw, sh) {
  if (sw * sh > KUCUK_GORSEL) return false;
  const onbellekli = !(img instanceof HTMLCanvasElement) && typeof img === 'object';
  if (onbellekli && grafikOnbellek.has(img)) return grafikOnbellek.get(img);
  let sonuc = true;
  try {
    const { veri, satir, x0, y0 } = kaynakPikselleri(img, sx, sy, sw, sh);
    const renkler = new Set();
    const g = new Uint32Array(veri.buffer, veri.byteOffset, veri.byteLength >> 2);
    for (let y = sy - y0; y < sy - y0 + sh && sonuc; y++) {
      for (let i = y * satir + sx - x0, son = i + sw; i < son; i++) {
        if (renkler.has(g[i])) continue;
        renkler.add(g[i]);
        if (renkler.size > AZ_RENK) { sonuc = false; break; }
      }
    }
  } catch { sonuc = false; }
  if (onbellekli) grafikOnbellek.set(img, sonuc);
  return sonuc;
}

/**
 * Ayrılabilir örnekleme (önce yatay, sonra dikey); saydamlıkta ön çarpımlı. Yatay geçiş sonuçları yalnızca dikey çekirdeğin
 * penceresi kadar satır tutulur (büyük taranmış sayfada ara dizi kaynak yüksekliği kadar büyümesin).
 * k: kaynakPikselleri sonucu; kx, ky: okunan penceredeki ilk kaynak pikseli (görsel koordinatı). Döner: ImageData.
 */
function ornekle(k, kx, ky, ax, ay) {
  const { veri, satir } = k;
  const ow = ax.bas.length, oh = ay.bas.length;
  const xk = kx - k.x0, yk = ky - k.y0;           // pencerenin veri içindeki başlangıcı
  const kw = ax.son - ax.ilk, kh = ay.son - ay.ilk;
  let opak = true;
  for (let y = 0; y < kh && opak; y++) {
    for (let p = ((yk + y) * satir + xk) * 4 + 3, son = p + kw * 4; p < son; p += 4) if (veri[p] !== 255) { opak = false; break; }
  }
  if (opak && ax.kucuk && ay.kucuk) return kutuKucult(veri, satir, xk, yk, ax, ay);
  const axBas = ax.bas, axSayi = ax.sayi, axAg = ax.agirlik, axAdim = ax.adim;
  const satirlar = new Map();                     // pencere satırı → yatay geçiş sonucu (Float32Array ow*4)
  const serbest = [];
  const yatay = (y) => {
    let s = satirlar.get(y);
    if (s) return s;
    s = serbest.pop() || new Float32Array(ow * 4);
    const sat = ((yk + y) * satir + xk) * 4;
    for (let j = 0, q = 0; j < ow; j++, q += 4) {
      const b = sat + axBas[j] * 4, sn = axSayi[j], ao = j * axAdim;
      let r = 0, g = 0, bl = 0, a = 0;
      if (opak) {
        for (let t = 0, p = b; t < sn; t++, p += 4) {
          const w = axAg[ao + t];
          r += veri[p] * w; g += veri[p + 1] * w; bl += veri[p + 2] * w;
        }
        a = 255;
      } else {
        for (let t = 0, p = b; t < sn; t++, p += 4) {
          const wa = axAg[ao + t] * veri[p + 3];
          r += veri[p] * wa; g += veri[p + 1] * wa; bl += veri[p + 2] * wa; a += wa;
        }
      }
      s[q] = r; s[q + 1] = g; s[q + 2] = bl; s[q + 3] = a;
    }
    satirlar.set(y, s);
    return s;
  };
  const sonuc = new ImageData(ow, oh);
  const d = sonuc.data;
  const birikim = new Float32Array(ow * 4);      // Uint8ClampedArray her atamada yuvarladığı için toplam ayrı tutulur
  const n4 = ow * 4;
  for (let k2 = 0; k2 < oh; k2++) {
    const b = ay.bas[k2], sn = ay.sayi[k2], ao = k2 * ay.adim;
    for (const [y, s] of satirlar) if (y < b) { satirlar.delete(y); serbest.push(s); }   // pencere yalnızca aşağı kayar
    const cik = k2 * n4;
    if (sn === 1) {
      const s = yatay(b);
      if (opak) for (let p = 0; p < n4; p += 4) { d[cik + p] = s[p]; d[cik + p + 1] = s[p + 1]; d[cik + p + 2] = s[p + 2]; d[cik + p + 3] = 255; }
      else for (let p = 0; p < n4; p += 4) { const a = s[p + 3]; if (a > 0) { d[cik + p] = s[p] / a; d[cik + p + 1] = s[p + 1] / a; d[cik + p + 2] = s[p + 2] / a; d[cik + p + 3] = a; } }
      continue;
    }
    birikim.fill(0);
    for (let t = 0; t < sn; t++) {
      const w = ay.agirlik[ao + t], s = yatay(b + t);
      for (let p = 0; p < n4; p++) birikim[p] += s[p] * w;
    }
    if (opak) for (let p = 0; p < n4; p += 4) { d[cik + p] = birikim[p]; d[cik + p + 1] = birikim[p + 1]; d[cik + p + 2] = birikim[p + 2]; d[cik + p + 3] = 255; }
    else for (let p = 0; p < n4; p += 4) { const a = birikim[p + 3]; if (a > 0) { d[cik + p] = birikim[p] / a; d[cik + p + 1] = birikim[p + 1] / a; d[cik + p + 2] = birikim[p + 2] / a; d[cik + p + 3] = a; } }
  }
  return sonuc;
}

/**
 * Opak görselin iki eksende de küçültülmesi (en sık durum: sayfa genişliğinde taranmış sayfa, fotoğraf). Nokta örneklemeli
 * kutuda her kaynak satırı/sütunu tek bir hedef pikseline düşer ve ağırlıklar eşittir: tam sayı toplamla tek geçişte yapılır
 * (genel ayrılabilir yoldan ~2 kat hızlı, sonuç aynı).
 */
function kutuKucult(veri, satir, xk, yk, ax, ay) {
  const ow = ax.bas.length, oh = ay.bas.length;
  const axBas = ax.bas, axSayi = ax.sayi;
  const sonuc = new ImageData(ow, oh);
  const d = sonuc.data;
  const top = new Uint32Array(ow * 3);
  for (let k2 = 0, q = 0; k2 < oh; k2++) {
    const b = ay.bas[k2], sn = ay.sayi[k2];
    top.fill(0);
    for (let y = b; y < b + sn; y++) {
      const sat = ((yk + y) * satir + xk) * 4;
      for (let j = 0, u = 0; j < ow; j++, u += 3) {
        let r = 0, g = 0, bl = 0;
        for (let p = sat + axBas[j] * 4, son = p + axSayi[j] * 4; p < son; p += 4) { r += veri[p]; g += veri[p + 1]; bl += veri[p + 2]; }
        top[u] += r; top[u + 1] += g; top[u + 2] += bl;
      }
    }
    for (let j = 0, u = 0; j < ow; j++, u += 3, q += 4) {
      const n = axSayi[j] * sn;
      d[q] = top[u] / n; d[q + 1] = top[u + 1] / n; d[q + 2] = top[u + 2] / n; d[q + 3] = 255;
    }
  }
  return sonuc;
}
/**
 * drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) keskin sürümü. PDF.js görselleri drawImageAtIntegerCoords ile ±1 ölçekli,
 * tam sayı ötelemeli dönüşümde tam sayı hedef boyutuna çizer: bu durumda görünür hedef bölgesi JS'de örneklenip 1:1 çizilir.
 * Döner: true (çizildi ya da görünür değil) / false (bu yol uygun değil: Chromium yumuşatmasıyla çizilmeli).
 */
function keskinGorsel(ctx, ozgun, img, sx, sy, sw, sh, dx, dy, dw, dh, grafik) {
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
  // Fotoğraf/taranmış sayfa büyütülürken (yakınlaştırma) hedef büyük olur: JS yavaşlar, fark da azalır → Chromium yumuşatması
  if (cikti > EN_FAZLA_CIKTI || (!grafik && (dw > sw || dh > sh) && cikti > EN_FAZLA_BUYUTME_CIKTISI)) return false;
  const ax = eksenAgirliklari(sw, dw, j0, j1, grafik), ay = eksenAgirliklari(sh, dh, k0, k1, grafik);
  if ((ax.son - ax.ilk) * (ay.son - ay.ilk) > EN_FAZLA_KAYNAK) return false;
  let k;
  try { k = kaynakPikselleri(img, sx + ax.ilk, sy + ay.ilk, ax.son - ax.ilk, ay.son - ay.ilk); } catch { return false; }   // okunamayan kaynak
  const sonuc = ornekle(k, sx + ax.ilk, sy + ay.ilk, ax, ay);
  const c = document.createElement('canvas');
  c.width = sonuc.width; c.height = sonuc.height;
  c.getContext('2d').putImageData(sonuc, 0, 0);
  ozgun.call(ctx, c, 0, 0, c.width, c.height, dx + j0, dy + k0, c.width, c.height);
  c.width = 0; c.height = 0;
  return true;
}

/**
 * PDF.js'in çizdiği bir 2B bağlamı keskin çizime sarar (örnek düzeyinde; prototip değişmez). Aynı bağlam iki kez sarılmaz.
 */
export function keskinBaglam(ctx) {
  if (!ctx || ctx.__keskin) return ctx;
  Object.defineProperty(ctx, '__keskin', { value: true });
  const ozgunCiz = ctx.drawImage, ozgunCizgi = ctx.stroke, ozgunDoldur = ctx.fill, ozgunDikdortgen = ctx.fillRect;

  const yumusak = (bag, arg, kalite = 'high') => {
    bag.save();
    bag.imageSmoothingEnabled = true; bag.imageSmoothingQuality = kalite;
    ozgunCiz.apply(bag, arg);
    bag.restore();
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
      const esit = a.length === 2 || (a[2] === (img.displayWidth || img.width) && a[3] === (img.displayHeight || img.height));
      if (esit && birim(this.getTransform()) && Number.isInteger(a[0]) && Number.isInteger(a[1])) return ozgunCiz.call(this, img, ...a);
      return yumusak(this, [img, ...a]);
    }
    const [sx, sy, sw, sh, , , dw, dh] = a;
    if (dw === sw && dh === sh) {
      if (birim(this.getTransform())) return ozgunCiz.call(this, img, ...a);
      return yumusak(this, [img, ...a]);
    }
    // PDF.js'in yarıya indirme adımları (_scaleImage): tam yarıda iki doğrusal örnekleme 2×2 kutu ortalamasıdır
    const yari = (d, s) => d === s || d === Math.ceil(s / 2);
    if (yari(dw, sw) && yari(dh, sh) && sw > 1 && sh > 1 && (dw !== sw || dh !== sh) && this.getTransform().isIdentity) {
      this.save(); this.imageSmoothingEnabled = true; this.imageSmoothingQuality = 'low';
      ozgunCiz.call(this, img, ...a);
      this.restore();
      return;
    }
    // Büyütmede az renkli küçük görseller (karekod, barkod) hep alan filtresiyle keskin; fotoğraf ve taranmış sayfa ×4'ten sonra yumuşak
    const grafik = dw > sw && dh > sh && azRenkli(img, sx, sy, sw, sh);
    if (!grafik && dw / sw >= YUMUSAK_BUYUTME && dh / sh >= YUMUSAK_BUYUTME) return yumusak(this, [img, ...a]);
    if (!grafik && sw * sh > ERTELEME_ESIGI && keskinErtelenir()) {
      // Kaydırma sürüyor: hızlı çiz (küçültmede iki doğrusal, mip-map'li 'high' kadar bulanık değil), sonra keskin yeniden çizilir
      ertelenen++;
      return yumusak(this, [img, ...a], dw < sw && dh < sh ? 'low' : 'high');
    }
    if (!keskinGorsel(this, ozgunCiz, img, ...a, grafik)) yumusak(this, [img, ...a]);
  };

  ctx.stroke = function (yol) {
    if (arguments.length === 1 && yol && typeof this.strokeStyle === 'string') {
      const kayit = yolKaydi.get(yol);
      const s = kayit && !kayit.karmasik ? inceCizgi(this, kayit) : null;
      if (s) {
        const kesik = this.getLineDash(), kayma = this.lineDashOffset;
        this.save();
        this.setTransform(1, 0, 0, 1, 0, 0);
        this.lineWidth = s.genislik;
        if (kesik.length) { this.setLineDash(kesik.map((v) => v * s.olcek)); this.lineDashOffset = kayma * s.olcek; }
        ozgunCizgi.call(this, s.yol);
        this.restore();
        return;
      }
    }
    return ozgunCizgi.apply(this, arguments);
  };

  ctx.fill = function (yol, kural) {
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
  return ctx;
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
    return { canvas, context: keskinBaglam(canvas.getContext('2d', { willReadFrequently: !this.#hwa })) };
  }
  reset(entry, width, height) {
    if (!entry.canvas) throw new Error('Canvas is not specified');
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    entry.canvas.width = width; entry.canvas.height = height;
  }
  destroy(entry) {
    if (!entry.canvas) throw new Error('Canvas is not specified');
    entry.canvas.width = entry.canvas.height = 0;
    entry.canvas = null; entry.context = null;
  }
}
