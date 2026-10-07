// Belge görüntüleyici: PDF.js ile tembel (lazy) sayfa çizimi, yakınlaştırma, sayfa düzenleri.
// Her sekmenin kendi Goruntuleyici örneği vardır.
import * as pdfjs from '../../node_modules/pdfjs-dist/build/pdf.min.mjs';
import { keskinBaglam, KeskinTuvalFabrikasi, cizimGoreviHazirla, ETKILESIM_MS, etkilesimBildir, etkilesimBitir, keskinErtelenir, ertelenenSayisi, istenenSayisi, gorevSayaci, keskinHazirDinle, okumaSuruyor } from './keskinlik.js';
import { anaHatSecenekleri, yaziTipiYukleyicisiniSar, yaziGoreviHazirla } from './yaziTipleri.js';
import { MAC } from './platform.js';

/** Yakınlaştıran tekerlek olayı: Windows'ta Ctrl+tekerlek; macOS'ta (0.2.0) dokunmatik yüzeyde kıstırma (Ctrl'li gelir) ya da ⌘+tekerlek. */
const yakinlastirmaTekerlegi = (e) => e.ctrlKey || (MAC && e.metaKey);

const KAYNAK = new URL('../../node_modules/pdfjs-dist/', import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = KAYNAK + 'build/pdf.worker.min.mjs';

export const CSS_BIRIM = 96 / 72;        // 1 pt = 1.333 css px (PDF.js görüntüleyicisiyle aynı)
const BOSLUK = 12;                        // sayfalar arası boşluk (px)
const KENAR = 16;                         // kenar boşluğu (px)
const EN_KUCUK = 0.25, EN_BUYUK = 64;     // %25 – %6400
const EN_FAZLA_PIKSEL = 24e6;             // tek tuvalde en fazla piksel; üstünde bölgesel çizim
const BOLGE_PAYI = 0.25;                  // bölgesel çizimde görünür alanın her yanına eklenen pay (görünür boyutun oranı)
const BOLGE_ONDE = 0.9;                   // kaydırılırken bölgesel çizimin toplam payının kaydırma yönüne konan kısmı (0.2.3)
const ONIZLEME_ESIGI = 12e6;              // bundan büyük (cihaz pikseli) bölgesel ilk çizimde, sayfa görünüyorsa önce önizleme (0.2.3: 6e6, her ilk çizimde)
const ONIZLEME_PIKSEL = 1.5e6;            // önizleme tuvalinin en fazla piksel sayısı
const KOYU_YER_TUTUCU = '#000';            // beyazın invert(1) karşılığı: koyu sayfada henüz çizilmemiş sayfanın ve tuvalin kaplamadığı alanın rengi
const ZOOM_ADIMLARI = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
const BASKIN_PAY = 1.03;                  // baskın genişlik kümesi: genişlikleri en darından en çok %3 büyük satırlar (A4 ile Letter bir arada)
const ILK_BOYUT_SAYISI = 300;             // belge açılırken ilk yerleşimden önce boyutu öğrenilen sayfa sayısı (kalanlar arka planda)
const BOYUT_PARTISI = 50;                 // sayfa boyutları bu kadar sayfalık paralel isteklerle öğrenilir
const KAYDIRMA_TUSLARI = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
const GIRDI_MS = 300;                     // kullanıcı girdisinden (tekerlek, tuş) sonra bu süredeki kaydırma olayları etkileşimdir (yumuşak kaydırma kuyruğu dahil)

export { pdfjs };

// Görsel ve çizgi kalitesi keskinlik.js'te: sayfa tuvali ve PDF.js'in ara tuvalleri (KeskinTuvalFabrikasi) sarılır; görseller
// referans okuyucudaki gibi alan ortalamasıyla örneklenir, ince çizgiler piksel ızgarasına oturur. 0.1.1'deki prototip yaması (her görsele
// yüksek kaliteli yumuşatma) kaldırıldı: küçültmede mip-map karışımıyla, küçük görsellerin (karekod) büyütülmesinde kübik
// yumuşatmayla bulanıklaştırıyordu.

// Yazı çizimi (yaziTipleri.js): true ise "Dengeli" çizim (varsayılan; kalın ve döndürülmüş yazı ana hatlarından, düz yazı Chromium'la),
// false ise bütün yazılar Chromium'un yazı çizicisiyle (Ayarlar › Görünüm › Yazı çizimi). Belge açılırken okunur: değişiklik açık
// belgelere yeniden açılınca uygulanır.
let anaHatCizimi = true;
export function yaziCiziminiAyarla(anaHat) { anaHatCizimi = anaHat !== false; }
const yaziSecenekleri = () => (anaHatCizimi ? anaHatSecenekleri() : {});

/** Cihaz piksel oranı (CSS px başına cihaz pikseli). */
const pikselOrani = () => window.devicePixelRatio || 1;
/** Değeri cihaz pikseli ızgarasına oturtur (CSS px). */
const izgaraya = (v, dpr) => Math.round(v * dpr) / dpr;
/**
 * İçerik görünür boyuttan taşıyor mu (kaydırma çubuğu gerekir mi). 1 px'e kadar taşma sayılmaz: ızgaraya yuvarlama sığdırılmış satırı
 * bu kadar taşırabilir (iki sayfalık satırda iki sayfa da yarım piksel yukarı yuvarlanınca tam 1 px: 0.1.20'ye dek pay 1 px'ten azdı,
 * ekran ölçeği 1'de her iki pencere genişliğinden birinde sığdırılmış çiftin altında yatay çubuk çıkıyordu). O durumda alan görünür
 * boyutu aşmaz (gorunumCoz), fazlalığı kenar boşluğu karşılar, çubuk çıkmaz.
 */
const tasar = (icerik, gorunur) => icerik - gorunur > 1;
/**
 * Kaydırma çubuğunun kalınlığı (CSS px, yukarı yuvarlanmış tam sayı): en dikey çubuğun genişliği, boy yatay çubuğun yüksekliği. Stil
 * sayfası belirler (stil.css .kaydirici::-webkit-scrollbar); çubuğu hep açık bir deneme kutusunun iç öğesiyle, cihaz piksel oranı başına bir
 * kez ölçülür (clientWidth tam sayıya yuvarlar; kesirli kalınlıkta çubuğun kapladığı yer eksik hesaplanmasın).
 */
let cubukOlcusu = null;
function cubukKalinligi() {
  const dpr = pikselOrani();
  if (cubukOlcusu?.dpr === dpr) return cubukOlcusu;
  const el = document.createElement('div'), ic = document.createElement('div');
  el.className = 'kaydirma-olcer';   // belge görünümünün (.kaydirici) çubuk kalınlığı (stil.css)
  el.style.cssText = 'position:absolute;left:-9999px;top:0;width:100px;height:100px;overflow:scroll;visibility:hidden;';
  ic.style.cssText = 'width:100%;height:100%;';
  el.append(ic);
  document.body.append(el);
  const dis = el.getBoundingClientRect(), icKutu = ic.getBoundingClientRect();
  const olcu = { dpr, en: Math.ceil(dis.width - icKutu.width - 0.001), boy: Math.ceil(dis.height - icKutu.height - 0.001) };
  el.remove();
  if (dis.width > 0) cubukOlcusu = olcu;   // belge henüz yerleşmediyse (ölçüm 0) saklanmaz, sonraki çağrıda yeniden ölçülür
  return olcu;
}
/** Tuvalin belleğini hemen bırakır. */
const tuvalBirak = (c) => { c.width = 0; c.height = 0; };
/** Açıyı 0..359'a indirger. */
const aciyaIndir = (d) => ((d % 360) + 360) % 360;
/** Eleman (metin katmanı) belgedeki boş olmayan seçimle kesişiyor mu. */
const secimdeMi = (el) => { const sec = window.getSelection(); return !!el && !!sec && sec.rangeCount > 0 && !sec.isCollapsed && sec.getRangeAt(0).intersectsNode(el); };
// ---------------------------------------------------------------- görsellerdeki yazı (0.1.24)
/** Tanınan sözcüklerin metin katmanındaki yazı tipi anahtarı (PDF.js TextContent.styles). */
const TANIMA_YAZI = 'pdefe-tanima';
/** Çekirdek Windows yazı tanıyıcısını bulamadı (dil paketi yok): bu pencerede yeniden istenmez. */
let tanimaYok = false;
let tanimaOrani = 0;
/** Yazı tipinin üst payı / toplam yükseklik oranı: PDF.js TextLayer satır öğesinin üst kenarını kökenden bu oranla yukarı koyar; öğe
 *  tanınan satırın üst kenarına otursun diye köken aynı oranla aşağı alınır (TextLayer #getAscent ile aynı ölçüm). */
function tanimaYaziOrani() {
  if (tanimaOrani) return tanimaOrani;
  let oran = 0.8;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '30px sans-serif';
    const m = ctx.measureText('');
    const ust = m.fontBoundingBoxAscent, alt = Math.abs(m.fontBoundingBoxDescent);
    if (ust > 0) oran = ust / (ust + alt);
  } catch { /* varsayılan oran */ }
  return (tanimaOrani = oran);
}
const tanimaStili = () => ({ fontFamily: 'sans-serif', ascent: tanimaYaziOrani(), descent: tanimaYaziOrani() - 1, vertical: false });

/**
 * Çekirdeğin tanıdığı satırları (yazi_tanima.py: sözcük başına [metin, solÜst x/y, solAlt x/y, sağÜst x/y], PyMuPDF düzleminde: döndürülmemiş,
 * görünür kutunun üst-sol kökenli) PDF.js metin öğelerine çevirir: sözcük başına bir öğe, satırın son sözcüğünde satır sonu. Aradaki boşluk
 * sözcüğe katılır ve öğe sonraki sözcüğün başına dek uzar: ayrı boşluk öğesi (doğal genişliğinde, ölçeklenmez) sonraki sözcüğün üstüne
 * taşıyor, seçim vurgusu orada iki kat koyulaşıyordu. Öğenin dönüşümü yazı yönünden ve satır yüksekliğinden kurulur: döndürülmüş sayfada
 * da ekrandaki gibi düz durur. view: PDF.js sayfasının görünür kutusu (kullanıcı uzayı; uygulama.js'teki kopyalama aynı çeviriyi tersinden yapar).
 */
function tanimaOgeleri(satirlar, view) {
  const oran = tanimaYaziOrani();
  const kul = (x, y) => [x + view[0], view[3] - y];
  const ogeler = [];
  for (const satir of satirlar) {
    satir.forEach((w, j) => {
      const solUst = kul(w[1], w[2]), solAlt = kul(w[3], w[4]), sagUst = kul(w[5], w[6]);
      const yukari = [solUst[0] - solAlt[0], solUst[1] - solAlt[1]];
      const h = Math.hypot(yukari[0], yukari[1]);
      if (!(h > 0.5)) return;
      const ileri = [sagUst[0] - solUst[0], sagUst[1] - solUst[1]];
      const genislik = Math.hypot(ileri[0], ileri[1]);
      const yon = genislik > 0.01 ? [ileri[0] / genislik, ileri[1] / genislik] : [yukari[1] / h, -yukari[0] / h];
      const n = satir[j + 1];
      ogeler.push({
        str: String(w[0]) + (n ? ' ' : ''), dir: 'ltr', width: genislik, height: h, fontName: TANIMA_YAZI, hasEOL: !n,
        transform: [h * yon[0], h * yon[1], yukari[0], yukari[1], solUst[0] - oran * yukari[0], solUst[1] - oran * yukari[1]],
      });
    });
  }
  return ogeler;
}

/** PDF.js sayfa nesnesinin taban döndürmesi (sayfa sözlüğündeki /Rotate, 0/90/180/270); sayfa nesnesi yoksa 0. */
const tabanAl = (pdfSayfa) => aciyaIndir(pdfSayfa?.rotate || 0);

/** Yol anahtarı: büyük/küçük harf ve eğik çizgi farklarını yok sayar. */
export const yolAnahtari = (yol) => (yol || '').replace(/\//g, '\\').toLowerCase();

/** Sözü bekler; görünüm kapatılınca (yokEt, sinyal) beklemeden 'Görünüm kapatıldı.' hatasıyla biter (0.2.1). Bırakılan PDF.js görevinin
 *  sözü hiç sonuçlanmayabilir (işçi belgeyi okurken sonlandırılırsa yanıt gelmez): yükleme beklemesi asılı kalıp birden çok dosya açılırken
 *  sıradakileri durdurmasın. */
function kapanmadan(soz, sinyal) {
  return new Promise((coz, reddet) => {
    const kapandi = () => reddet(new Error('Görünüm kapatıldı.'));
    if (sinyal.aborted) { kapandi(); return; }
    sinyal.addEventListener('abort', kapandi, { once: true });
    soz.then(coz, reddet).finally(() => sinyal.removeEventListener('abort', kapandi));
  });
}

/** PDF.js belge yükleme seçenekleri (veri: dosyanın baytları). */
const belgeSecenekleri = (veri, parola) => ({
  data: veri,
  cMapUrl: KAYNAK + 'cmaps/', cMapPacked: true,
  standardFontDataUrl: KAYNAK + 'standard_fonts/',
  wasmUrl: KAYNAK + 'wasm/', iccUrl: KAYNAK + 'iccs/',
  enableXfa: false, isEvalSupported: false,
  CanvasFactory: KeskinTuvalFabrikasi,       // PDF.js ara tuvalleri de keskin çizsin (keskinlik.js)
  password: parola,
  ...yaziSecenekleri(),
});

/** Boş sayfa için en küçük geçerli PDF (W×H pt). */
function bosPdfBaytlari(w, h) {
  const nesneler = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${w.toFixed(2)} ${h.toFixed(2)}]>>`,
  ];
  let govde = '%PDF-1.4\n';
  const konumlar = [];
  nesneler.forEach((n, i) => { konumlar.push(govde.length); govde += `${i + 1} 0 obj\n${n}\nendobj\n`; });
  const xref = govde.length;
  govde += `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n` + konumlar.map((k) => String(k).padStart(10, '0') + ' 00000 n \n').join('');
  govde += `trailer\n<</Size ${nesneler.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(govde);
}

export class Goruntuleyici extends EventTarget {
  constructor(kok, { dosyaOku = null, cekirdek = null } = {}) {
    super();
    this.kok = kok;
    this.dosyaOku = dosyaOku;        // (yol) => Promise<Uint8Array>  (başka PDF'ten sayfa eklemek için)
    this.cekirdek = cekirdek;        // (yontem, params) => Promise  (görsel kutuları, bağlantılar, form alanları)
    this.yol = null;                 // sekmenin dosya yolu
    this.belgeler = new Map();       // yolAnahtari → {yol, belge, gorev}
    this.bosBelgeler = new Map();    // 'WxH' → {belge, gorev}
    this.anlik = null;               // yapısal kayıttan sonra özgün dosyanın anlık kopyası (yol)
    this.kayitliTarif = null;        // son kayıttaki sayfa tarifi (JSON)
    this._girdiler = new Set();      // oluşturulan bütün girdilerin WeakRef'leri: kaynakYeniden geri al yığınındaki (listede olmayan) girdileri de çevirsin
    this._budamaSiniri = 4096;       // _girdiler bu boyutu aşınca toplanmış girdilerin başvuruları atılır
    this.kok.innerHTML = '<div class="kaydirici" tabindex="0"><div class="tuval-alani"></div></div>';
    this.kaydirici = kok.querySelector('.kaydirici');
    this.alan = kok.querySelector('.tuval-alani');

    this.belge = null;
    this.sayfalar = [];          // {no, pt:{w,h}, dondurme, el, katman, canvas, textLayer, cizim, hedef, gorev, sayfaSozu}
    this.yerlesim = [];          // görüntü koordinatlarında sayfa dikdörtgenleri {x,y,w,h,olcek} ya da null (gizli)
    this.onYerlesim = [];        // tek/iki düzende komşu satırların gösterildiklerinde alacağı yerleşim (ön çizim için; sanal)
    this._onIdx = [];            // onYerlesim'de yeri olan sayfa indeksleri
    this._gorunurKume = new Set();   // son kaydırmada görünür sayfa girdileri
    this._onKuyruk = [];         // görünürler çizilince ön çizilecek sayfa indeksleri
    this.olcek = 1;
    this.zoomModu = 'genislik';  // 'serbest' | 'gercek' | 'sayfa' | 'genislik' | 'gorunur'
    this.duzen = 'surekli';      // 'tek' | 'surekli' | 'iki' | 'ikiSurekli'
    this.kapakAyri = false;
    this.gorunumDondurme = 0;
    this.gecerli = 1;
    this._istenen = null;        // son sayfayaGit hedefi ve o anki kaydırma konumu {no, st, sl} (kaydirmaIsle)
    this.koyuSayfa = false;
    this.yok = false;
    this._kapanis = new AbortController();   // yokEt'te tetiklenir: süren yükleme beklemesi biter (kapanmadan)
    this.hazir = false;          // yukle / durumdanYukle bitince true
    this._tanimaBekleyen = new Set();   // görsellerindeki yazının tanınması bekleyen sayfa girdileri (tanimaIste)
    this._tanimaSuruyor = false;
    this._cizimZamanlayici = null;
    this._boyutZamanlayici = null;

    this.kaydirici.addEventListener('scroll', () => { this.etkilesimIzle(); this.kaydirmaIsle(); }, { passive: true });
    this.kaydirici.addEventListener('wheel', (e) => this.tekerlek(e), { passive: false });
    // Kaydırma etkileşimi yalnızca kullanıcı girdisinden sayılır (etkilesimIzle): tekerlek (Ctrl'siz), dokunma, kaydırma çubuğu, tuşlar
    this._girdiZamani = -Infinity; this._cubukTutuluyor = false;
    this._yon = { x: 0, y: 0 }; this._yonKonum = null;   // kaydırma yönü (yonIzle)
    this.kaydirici.addEventListener('wheel', (e) => {
      if (yakinlastirmaTekerlegi(e)) { this._girdiZamani = -Infinity; etkilesimBitir(); } else this._girdiZamani = performance.now();
    }, { passive: true });
    this.kaydirici.addEventListener('touchmove', () => { this._girdiZamani = performance.now(); }, { passive: true });
    this.kaydirici.addEventListener('pointerdown', (e) => {
      if (e.target === this.kaydirici && (e.offsetX >= this.kaydirici.clientWidth || e.offsetY >= this.kaydirici.clientHeight)) this._cubukTutuluyor = true;
    });
    this._cubukBirak = () => { this._cubukTutuluyor = false; };
    this._tusGirdisi = (e) => { if (KAYDIRMA_TUSLARI.has(e.key)) this._girdiZamani = performance.now(); };
    window.addEventListener('pointerup', this._cubukBirak);
    document.addEventListener('keydown', this._tusGirdisi, true);
    // Arka planda okunan görseller hazır: hızlı çizilmiş sayfalar keskin yeniden çizilir (yeterliMi, keskinHazir)
    this._keskinHazirBirak = keskinHazirDinle(() => this.keskinHazir());
    this._gozlemci = new ResizeObserver(() => this.kutuDegisti());
    this._gozlemci.observe(this.kaydirici);
    // Metin seçimi bitince katmanların 'selecting' sınıfını kaldır (katman başına belge dinleyicisi eklemek sızıntı yapıyordu)
    this._fareBirak = () => { for (const k of this.alan.querySelectorAll('.textLayer.selecting')) k.classList.remove('selecting'); };
    document.addEventListener('mouseup', this._fareBirak);
    // Cihaz piksel oranı değişince (ekran ölçeği, pencereyi başka ekrana taşıma) ızgarayı ve tuvalleri yenile
    this._dprIsle = () => { if (this.yok) return; this.dprDinle(); this.boyutDegisti(); };
    this.dprDinle();
  }

  /** Geçerli devicePixelRatio'ya bağlı ortam sorgusunu dinler; oran değişince sorgu eşleşmez olur ve dinleyici yeni oranla yeniden kurulur. */
  dprDinle() {
    this._dprSorgu?.removeEventListener('change', this._dprIsle);
    this._dprSorgu = window.matchMedia(`(resolution: ${pikselOrani()}dppx)`);
    this._dprSorgu.addEventListener('change', this._dprIsle);
  }

  // ------------------------------------------------------------ yükleme
  async yukle(veri, secenek = {}) {
    if (this.yok) throw new Error('Görünüm kapatıldı.');
    const gorev = pdfjs.getDocument(belgeSecenekleri(veri, secenek.parola));
    // Girilen parola saklanır: sekme başka pencereye taşınınca orada yeniden sorulmaz (durumAl)
    this._parola = secenek.parola ?? null;
    if (secenek.parolaIste) gorev.onPassword = (cb, neden) => secenek.parolaIste(neden).then((p) => { this._parola = p; cb(p); }, () => cb(new Error('vazgeçildi')));
    this.yuklemeGorevi = gorev;
    const belge = await kapanmadan(gorev.promise, this._kapanis.signal);
    // Beklerken sekme kapatıldıysa (0.2.1): yokEt süren görevi bırakır ve bekleme biter; yine de çözüldüyse belge yok edilmiş görünümde
    // kurulmaz, görev bırakılır (işçisi pencere kapanana dek yaşamasın)
    if (this.yok) { try { gorev.destroy().catch(() => {}); } catch {} throw new Error('Görünüm kapatıldı.'); }
    this.belge = belge;
    if (anaHatCizimi) yaziTipiYukleyicisiniSar(this.belge);   // ilk sayfa çizilmeden önce
    this.yol = secenek.yol || null;
    this.belgeler.set(yolAnahtari(this.yol), { yol: this.yol, belge: this.belge, gorev });
    const n = this.belge.numPages;
    const ilk = await kapanmadan(this.belge.getPage(1), this._kapanis.signal);
    const vp = ilk.getViewport({ scale: 1 });
    this.sayfalar = [];
    for (let i = 0; i < n; i++) {
      const s = this.girdiOlustur({ yol: this.yol, sayfa: i + 1 }, 0, { w: vp.width, h: vp.height });
      if (i === 0) { s.sayfaSozu = Promise.resolve(ilk); s.pdfSayfa = ilk; }
      this.numaraVer(s, i + 1);
      this.sayfalar.push(s);
      this.alan.append(s.el);
    }
    this.kayitliTarif = this.tarifJson();
    if (secenek.duzen) this.duzen = secenek.duzen;
    if (secenek.kapakAyri != null) this.kapakAyri = secenek.kapakAyri;
    if (secenek.zoomModu) this.zoomModu = secenek.zoomModu;
    if (secenek.olcek) this.olcek = secenek.olcek;
    if (secenek.sayfa) this.gecerli = Math.min(Math.max(1, secenek.sayfa), n);
    // Genişliğe sığdırma belgenin baskın sayfa genişliğine göre (sigdirOlcek): ilk yerleşimden önce sayfa boyutları öğrenilir, belge
    // açıldıktan sonra ölçek sıçramasın. Çok sayfalı belgede ilk ILK_BOYUT_SAYISI sayfa beklenir, kalanlar arka planda.
    try { await this.boyutlariOgren(this.sayfalar.slice(1, ILK_BOYUT_SAYISI)); } catch (e) { if (this.yok) return this.belge; console.warn('Sayfa boyutları alınamadı', e); }
    if (this.yok) return this.belge;
    // Boyutu henüz öğrenilmeyen sayfalar ilk sayfanın değil öğrenilenlerin en sık boyutunu alır: ilk sayfası farklı (kapak, A3 ek) büyük
    // belgede baskın genişlik, ölçek ve kaydırma çubuğu baştan doğru olsun (yoksa arka plan yüklemesi bitince ölçek sıçrıyordu)
    if (n > ILK_BOYUT_SAYISI) {
      const sayim = new Map();
      for (const s of this.sayfalar.slice(0, ILK_BOYUT_SAYISI)) {
        const k = `${Math.round(s.pt.w)}x${Math.round(s.pt.h)}`;
        const e = sayim.get(k);
        if (e) e.adet++; else sayim.set(k, { adet: 1, pt: s.pt });
      }
      let en = null;
      for (const e of sayim.values()) if (!en || e.adet > en.adet) en = e;
      for (const s of this.sayfalar.slice(ILK_BOYUT_SAYISI)) s.pt = { ...en.pt };
    }
    this.yerlesimHesapla();
    if (secenek.sayfa && secenek.sayfa > 1) this.sayfayaGit(secenek.sayfa, { aninda: true });
    this.kaydirmaIsle();
    this.hazir = true;   // belge yüklendi, sayfalar yerleşti (uygulama.js: sekme ancak bundan sonra başka pencereye taşınabilir)
    this.dispatchEvent(new CustomEvent('hazir'));
    this.sayfaBoyutlariniYukle();
    return this.belge;
  }

  // ------------------------------------------------------------ sekmenin başka pencereye taşınması (0.1.19)
  /**
   * Görünümün başka pencerede aynen kurulabilmesi için durumu. Döner: { durum, girdiNo }.
   *   durum.girdiler[i] = { kimlik, kaynak: {yol, sayfa} | null (boş sayfa), pt, dondurme }; durum.sayfalar: şimdiki sayfa listesi (girdi
   *   numaraları); durum.belgeler: yüklü PDF.js belgeleri [{ yol, ana, veri: Uint8Array }] (ana: görünümün kendi belgesi).
   *   girdiNo(s): girdinin taşınan numarası. Listede olmayan girdiler (geri al yığınındaki eski sayfa listeleri, notların izlediği
   *   sayfa) çağrıldıkça durum.girdiler'e eklenir; durum gönderilmeden önce hepsi için çağrılmış olmalıdır.
   * Baytlar diskten yeniden okunmaz, PDF.js'in elindeki veri gönderilir: hedef pencere belgeyi bu pencerenin gördüğü hâliyle açar.
   * Artımlı kayıtla diske işlenmiş döndürmenin hesabı (uygulama.js belge.diskDondurme) böylece olduğu gibi geçerli kalır; dosya bu arada
   * taşınmış ya da silinmiş olsa da sekme taşınır.
   */
  async durumAl() {
    const belgeler = [];
    for (const kayit of this.belgeler.values()) belgeler.push({ yol: kayit.yol, ana: kayit.belge === this.belge, veri: await kayit.belge.getData() });
    const girdiler = [], sira = new Map(), kimlikler = new Map();
    const girdiNo = (s) => {
      let i = sira.get(s);
      if (i == null) {
        i = girdiler.length; sira.set(s, i);
        if (!kimlikler.has(s.kimlik)) kimlikler.set(s.kimlik, kimlikler.size);
        girdiler.push({ kimlik: kimlikler.get(s.kimlik), kaynak: s.bos ? null : { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa }, pt: { w: s.pt.w, h: s.pt.h }, dondurme: s.dondurme || 0,
          icerikKutusu: s.icerikKutusu ? [...s.icerikKutusu] : null });   // "Görünür alana sığdır" ölçeği hedefte de aynı kutudan hesaplansın
      }
      return i;
    };
    // Arka plandaki sekmenin kaydırıcısı ölçülemez (display: none iken scrollTop 0 okunur): gizlenmeden önce saklanan konum kullanılır
    const konum = !this.kaydirici.clientHeight && this._gizliKonum ? this._gizliKonum : { oran: this.sayfaIciOran(), sol: this.kaydirici.scrollLeft };
    const durum = {
      yol: this.yol, anlik: this.anlik, kayitliTarif: this.kayitliTarif, parola: this._parola ?? null,
      zoomModu: this.zoomModu, olcek: this.olcek, gecerli: this.gecerli, oran: konum.oran, kaydirmaSol: konum.sol,
      gorunumDondurme: this.gorunumDondurme, boyutlarEksik: !!this._boyutlarEksik,
      girdiler, sayfalar: this.sayfalar.map(girdiNo), belgeler,
    };
    return { durum, girdiNo };
  }

  /**
   * Başka pencereden taşınan görünümü kurar (durumAl'ın verdiği durum). secenek: { duzen, kapakAyri } (genel ayar; bütün pencerelerde
   * aynıdır). Döner: taşınan numara → bu penceredeki girdi (notlar ve geri al yığını kendi girdilerini bununla bulur).
   */
  async durumdanYukle(durum, secenek = {}) {
    let ana = null;
    for (const b of durum.belgeler || []) {
      const gorev = pdfjs.getDocument(belgeSecenekleri(b.veri, b.ana ? durum.parola ?? undefined : undefined));
      let belge;
      try { belge = await gorev.promise; } catch (e) { try { gorev.destroy().catch(() => {}); } catch {} throw e; }
      // Beklerken sekme kapatıldıysa (yokEt belgeleri bıraktı) az önce yüklenen belge de bırakılır: işçisi açık kalmasın
      if (this.yok) { try { gorev.destroy().catch(() => {}); } catch {} return null; }
      if (anaHatCizimi) yaziTipiYukleyicisiniSar(belge);
      const kayit = { yol: b.yol, belge, gorev };
      this.belgeler.set(yolAnahtari(b.yol), kayit);
      if (b.ana) ana = kayit;
    }
    if (!ana) throw new Error('Taşınan sekmenin belgesi eksik.');
    this.yuklemeGorevi = ana.gorev; this.belge = ana.belge;
    this.yol = durum.yol || null; this.anlik = durum.anlik || null; this._parola = durum.parola ?? null;
    // Aynı sayfanın döndürme kopyaları (geri al yığınında) kimliği paylaşır: bu oturumda eklenen notlar sayfayı kimliğiyle izler
    const kimlikler = new Map();
    const girdiler = (durum.girdiler || []).map((v) => {
      const s = this.girdiOlustur(v.kaynak ? { yol: v.kaynak.yol, sayfa: v.kaynak.sayfa } : { bos: true, w: v.pt.w, h: v.pt.h }, v.dondurme || 0, v.pt);
      if (kimlikler.has(v.kimlik)) s.kimlik = kimlikler.get(v.kimlik); else kimlikler.set(v.kimlik, s.kimlik);
      if (Array.isArray(v.icerikKutusu)) s.icerikKutusu = [...v.icerikKutusu];
      return s;
    });
    this.sayfalar = (durum.sayfalar || []).map((i) => girdiler[i]).filter(Boolean);
    if (!this.sayfalar.length) throw new Error('Taşınan sekmenin sayfaları eksik.');
    this.sayfalar.forEach((s, i) => { this.numaraVer(s, i + 1); this.alan.append(s.el); });
    this.kayitliTarif = durum.kayitliTarif ?? this.tarifJson();
    if (secenek.duzen) this.duzen = secenek.duzen;
    if (secenek.kapakAyri != null) this.kapakAyri = secenek.kapakAyri;
    if (durum.zoomModu) this.zoomModu = durum.zoomModu;
    if (durum.olcek) this.olcek = durum.olcek;
    this.gorunumDondurme = durum.gorunumDondurme || 0;
    this.gecerli = Math.min(Math.max(1, durum.gecerli || 1), this.sayfalar.length);
    // "Görünür alana sığdır": ölçek içerik kutusundan ve sayfanın toplam döndürmesinden hesaplanır; taban döndürme ancak sayfa nesnesi
    // yüklüyse bilinir (sigdirOlcek yoksa sayfa genişliğine sığdırır, ölçek kaynak penceredekinden farklı çıkardı)
    if (this.zoomModu === 'gorunur') {
      await Promise.all([this.icerikKutusuAl(this.gecerli - 1), this.sayfaAl(this.gecerli - 1).catch(() => null)]);
      if (this.yok) return null;
    }
    this.yerlesimHesapla();
    this.sayfayaGit(this.gecerli, { oran: durum.oran || 0, aninda: true });
    if (this.zoomModu === 'gorunur') this.gorunurAlanaKaydir(this.gecerli);
    else if (durum.kaydirmaSol && this.zoomModu === 'serbest') this.kaydirici.scrollLeft = durum.kaydirmaSol;
    this.kaydirmaIsle();
    this.hazir = true;
    this.dispatchEvent(new CustomEvent('hazir'));
    // Çok sayfalı belge boyutları öğrenilmeden taşındıysa (açılır açılmaz) kalanlar burada öğrenilir
    if (durum.boyutlarEksik) this.sayfaBoyutlariniYukle(this.sayfalar);
    return (i) => girdiler[i] || null;
  }

  /**
   * Girdilerin gerçek boyutlarını (s.pt, taban /Rotate dahil) PDF.js'ten BOYUT_PARTISI'lik paralel isteklerle öğrenir (sırayla beklemek
   * büyük belgede saniyeler sürüyordu). Döner: boyutu değişen girdi var mı. Sekme kapanırsa PDF.js "Transport destroyed" ile reddeder.
   */
  async boyutlariOgren(girdiler) {
    let degisti = false;
    for (let bas = 0; bas < girdiler.length && !this.yok; bas += BOYUT_PARTISI) {
      const parti = girdiler.slice(bas, bas + BOYUT_PARTISI).filter((s) => !s.bos);
      const pdfSayfalari = await Promise.all(parti.map((s) => {
        const i = this.idx(s);
        return i >= 0 ? this.sayfaAl(i) : (s.sayfaSozu || null);
      }));
      if (this.yok) return degisti;
      parti.forEach((s, k) => {
        const p = pdfSayfalari[k];
        if (!p) return;
        const vp = p.getViewport({ scale: 1 });   // varsayılan döndürme page.rotate: pt taban (/Rotate) dahil
        if (Math.abs(vp.width - s.pt.w) > 0.5 || Math.abs(vp.height - s.pt.h) > 0.5) { s.pt = { w: vp.width, h: vp.height }; degisti = true; }
      });
    }
    return degisti;
  }

  /** İlk yerleşimden sonra kalan sayfaların gerçek boyutlarını arka planda öğrenir; farklıysa yerleşimi bir kez yeniler.
   *  _boyutlarEksik: öğrenme sürüyor (sekme bu sırada başka pencereye taşınırsa orada yeniden öğrenilir, bkz. durumAl). */
  async sayfaBoyutlariniYukle(kalan = this.sayfalar.slice(ILK_BOYUT_SAYISI)) {
    if (!kalan.length) return;
    let degisti;
    this._boyutlarEksik = true;
    try { degisti = await this.boyutlariOgren(kalan); } catch (e) { if (this.yok) return; throw e; }   // sekme bu arada kapandı: "Transport destroyed"
    this._boyutlarEksik = false;
    // Yeni pt'lerle yerleşimi kurar; geçerli sayfa ve sayfa içi oran korunur (boyutDegisti gibi: scrollTop olduğu gibi kalırsa görünüm
    // başka sayfaya kayar, yanlış sayfa kaydedilirdi). Gizli sekmede (boyut 0) atlanır: sigdirOlcek %25 verirdi; sekme gösterilince
    // boyutDegisti oranı eski (scrollTop ile tutarlı) yerleşimden alıp yeni pt'lerle kurar. Boyutu değişen görünür sayfalar yeniden planlanır.
    if (!degisti || this.yok || !this.kaydirici.clientWidth || !this.kaydirici.clientHeight) return;
    const sayfa = this.gecerli, oran = this.sayfaIciOran();
    this.yerlesimHesapla(true);
    this.sayfayaGit(sayfa, { oran, aninda: true });
    this.kaydirmaIsle();
  }

  sayfaAl(i) {
    const s = this.sayfalar[i];
    if (!s.sayfaSozu) s.sayfaSozu = this.kaynakBelgesi(s).then((b) => b.getPage(s.bos ? 1 : s.kaynak.sayfa)).then((p) => { s.pdfSayfa = p; return p; });
    // girdiKopyala süren sözü paylaşır; o söz yalnızca özgün girdinin pdfSayfa'sını atar. Taban döndürme pdfSayfa'dan okunduğu için kopyaya da ata.
    if (!s.pdfSayfa) return s.sayfaSozu.then((p) => { s.pdfSayfa = p; return p; });
    return s.sayfaSozu;
  }

  /** Bir sayfa girdisi (DOM elemanı dahil) oluşturur. kaynak: {yol, sayfa} ya da {bos:true, w, h}. */
  girdiOlustur(kaynak, dondurme, pt) {
    const el = document.createElement('div');
    el.className = 'sayfa';
    const katman = document.createElement('div');
    katman.className = 'not-katmani';
    el.append(katman);
    // kimlik: döndürme kopyalarının (girdiKopyala) paylaştığı kalıcı kimlik; notlar kaynakGirdi'yi bununla eşler
    const s = { no: 0, kimlik: {}, kaynak, bos: !!kaynak.bos, pt: { w: pt.w, h: pt.h }, dondurme: dondurme || 0, el, notKatmani: katman, canvas: null, hamCanvas: null, textLayer: null, cizim: null, hedef: null, gorev: null, sayfaSozu: null, pdfSayfa: null, metinOlcek: 0, baglantilar: null, gorselKutulari: null, icerikKutusu: null };
    this._girdiler.add(new WeakRef(s));
    if (this._girdiler.size > this._budamaSiniri) {   // döndürdükçe küme sınırsız büyümesin
      for (const r of this._girdiler) if (!r.deref()) this._girdiler.delete(r);
      this._budamaSiniri = Math.max(4096, 2 * this._girdiler.size);
    }
    this.yerTutucuRengi(s);
    return s;
  }

  /** Girdinin sıra numarasını ve elemanın data-sayfa özniteliğini birlikte verir (notlar, metin ve sağ tık bunu okur). */
  numaraVer(s, no) { s.no = no; s.el.dataset.sayfa = String(no); }

  /** Henüz çizilmemiş sayfanın rengi: koyu sayfada beyaz parlamasın diye koyu, değilse stil.css'teki beyaz. */
  yerTutucuRengi(s) {
    if (this.koyuSayfa) s.el.style.background = KOYU_YER_TUTUCU;
    else s.el.style.removeProperty('background');
  }

  /** Girdinin listedeki indeksi (numarası kaydıysa arar); yoksa -1. */
  idx(s) { return this.sayfalar[s.no - 1] === s ? s.no - 1 : this.sayfalar.indexOf(s); }

  /** Girdinin kaynak PDF.js belgesini döndürür (gerekirse yükler). */
  async kaynakBelgesi(s) {
    if (s.bos) return this.bosBelge(s.pt.w, s.pt.h);
    return this.belgeAl(s.kaynak.yol);
  }

  async belgeAl(yol) {
    const k = yolAnahtari(yol);
    if (this.belgeler.has(k)) return this.belgeler.get(k).belge;
    if (!this.dosyaOku) throw new Error('Dosya okuyucu tanımlı değil');
    const veri = await this.dosyaOku(yol);
    const gorev = pdfjs.getDocument(belgeSecenekleri(veri));
    const belge = await gorev.promise;
    if (anaHatCizimi) yaziTipiYukleyicisiniSar(belge);
    this.belgeler.set(k, { yol, belge, gorev });
    return belge;
  }

  async bosBelge(w, h) {
    const k = `${Math.round(w)}x${Math.round(h)}`;
    if (this.bosBelgeler.has(k)) return this.bosBelgeler.get(k).belge;
    const gorev = pdfjs.getDocument({ data: bosPdfBaytlari(w, h) });
    const belge = await gorev.promise;
    this.bosBelgeler.set(k, { belge, gorev });
    return belge;
  }

  /** Geçerli sayfa tarifi: [{kaynak:{yol,sayfa}, dondurme} | {kaynak:null, genislik, yukseklik, dondurme}] */
  tarif() {
    return this.sayfalar.map((s) => (s.bos ? { kaynak: null, genislik: s.pt.w, yukseklik: s.pt.h, dondurme: s.dondurme } : { kaynak: { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa }, dondurme: s.dondurme }));
  }
  tarifJson() { return JSON.stringify(this.tarif().map((t) => [t.kaynak ? yolAnahtari(t.kaynak.yol) + '#' + t.kaynak.sayfa : `bos${Math.round(t.genislik)}x${Math.round(t.yukseklik)}`, t.dondurme])); }
  yapisalKirli() { return this.kayitliTarif != null && this.tarifJson() !== this.kayitliTarif; }
  yapisalKaydedildi() { this.kayitliTarif = this.tarifJson(); }

  /**
   * Tarifi girdilere çevirir (başka belgeleri yükler); var olan girdiler yeniden kullanılır.
   * Döner: yeni girdi listesi (henüz uygulanmaz; sayfalariAyarla ile uygulanır).
   */
  async tarifHazirla(tarif) {
    const havuz = new Map();   // anahtar → [girdi...]
    for (const s of this.sayfalar) {
      const k = s.bos ? `bos${Math.round(s.pt.w)}x${Math.round(s.pt.h)}` : yolAnahtari(s.kaynak.yol) + '#' + s.kaynak.sayfa;
      if (!havuz.has(k)) havuz.set(k, []);
      havuz.get(k).push(s);
    }
    const yeni = [];
    for (const t of tarif) {
      if (!t.kaynak) {
        const w = t.genislik || 595.28, h = t.yukseklik || 841.89;
        const k = `bos${Math.round(w)}x${Math.round(h)}`;
        let s = havuz.get(k)?.shift();
        if (!s) s = this.girdiOlustur({ bos: true, w, h }, t.dondurme || 0, { w, h });
        else if (s.dondurme !== (t.dondurme || 0)) s = this.girdiKopyala(s, t.dondurme || 0);   // girdiler değişmez: döndürme farklıysa kopya
        yeni.push(s);
        continue;
      }
      const k = yolAnahtari(t.kaynak.yol) + '#' + t.kaynak.sayfa;
      let s = havuz.get(k)?.shift();
      if (!s) {
        const belge = await this.belgeAl(t.kaynak.yol);
        const p = await belge.getPage(t.kaynak.sayfa);
        const vp = p.getViewport({ scale: 1 });   // varsayılan döndürme page.rotate: pt taban (/Rotate) dahil
        s = this.girdiOlustur({ yol: t.kaynak.yol, sayfa: t.kaynak.sayfa }, t.dondurme || 0, { w: vp.width, h: vp.height });
        s.sayfaSozu = Promise.resolve(p); s.pdfSayfa = p;
      } else if (s.dondurme !== (t.dondurme || 0)) s = this.girdiKopyala(s, t.dondurme || 0);
      yeni.push(s);
    }
    return yeni;
  }

  /** Aynı kaynağa işaret eden, farklı döndürmeli yeni bir girdi (geri al için eski girdi dokunulmaz kalır). */
  girdiKopyala(s, dondurme) {
    const k = this.girdiOlustur(s.bos ? { bos: true, w: s.pt.w, h: s.pt.h } : { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa }, dondurme, s.pt);
    k.kimlik = s.kimlik;   // kopya aynı sayfadır: bu oturumda eklenen notlar döndürmeden sonra da sayfasında kalır (notlar.sayfalarDegisti)
    k.sayfaSozu = s.sayfaSozu; k.pdfSayfa = s.pdfSayfa; k.metinSozu = s.metinSozu;
    k.baglantilar = s.baglantilar; k.gorselKutulari = s.gorselKutulari; k.icerikKutusu = s.icerikKutusu; k.formYok = s.formYok;
    return k;
  }

  /** Sayfa listesini değiştirir (geri al/yinele komutları bunu çağırır). */
  sayfalariAyarla(liste) {
    const sayfa = Math.min(this.gecerli, liste.length) || 1;
    const eskiler = new Set(this.sayfalar);
    for (const s of this.sayfalar) if (!liste.includes(s)) { this.girdiBosalt(s); s.el.remove(); }
    this.sayfalar = liste;
    for (let i = 0; i < liste.length; i++) {
      const s = liste[i];
      this.numaraVer(s, i + 1);
      this.alan.append(s.el);          // sırayı yeniden kur
      if (!eskiler.has(s)) { s.el.style.display = ''; this.yerTutucuRengi(s); }
    }
    this.gecerli = sayfa;
    this.yerlesimHesapla(true);
    this.sayfayaGit(sayfa, { aninda: true });
    this.kaydirmaIsle();
    this.dispatchEvent(new CustomEvent('sayfalar', { detail: { sayfa: this.sayfalar.length } }));
  }

  /** Bir girdinin tuval/metin katmanı önbelleğini boşaltır (listede olmasa da). */
  girdiBosalt(s) {
    clearTimeout(s._zaman); s._planli = false;
    s._katmanAnahtari = null;          // ek katmanlar aşağıda silinir: sonraki çizim onları ve not katmanını yeniden kurar (sayfaCiz)
    s.hedef = null;                    // süren çizim sonucunu bırakır
    if (s.gorev) { try { s.gorev.cancel(); } catch {} s.gorev = null; }
    const katmanVar = !!(s.cizim || s.textLayer || s.metinOlcek);
    if (s.canvas) { tuvalBirak(s.canvas); s.canvas.remove(); s.canvas = null; }
    if (s.hamCanvas) { tuvalBirak(s.hamCanvas); s.hamCanvas = null; }
    s.cizim = null;
    // Seçimin uğradığı sayfanın metin katmanı tutulur: çok sayfalı seçimde çapanın katmanı boşaltılırsa seçim bozulur, arada kalanlar kopyada eksik kalırdı
    const metinKalir = !!s.textLayer && s.el.isConnected && secimdeMi(s.el.querySelector(':scope > .textLayer'));
    if (s.textLayer && !metinKalir) { s.textLayer.cancel(); s.textLayer = null; }
    if (katmanVar) for (const k of s.el.querySelectorAll(metinKalir ? '.baglanti-katmani, .form-katmani' : '.textLayer, .baglanti-katmani, .form-katmani')) k.remove();
    if (!metinKalir) s.metinOlcek = 0;
    s.el.classList.remove('yukleniyor');
    // PDF.js sayfa nesnelerini (işlem listesi, çözülmüş görseller, ImageBitmap) bırakır; yoksa taranmış belgede kaydırdıkça bellek
    // sınırsız büyür. Süren çizim varsa (kopyalar pdfSayfa'yı paylaşır) PDF.js bitince temizler, yeni render() bekleyeni iptal eder.
    s.pdfSayfa?.cleanup();
  }

  /** Kaynak dosyanın içeriği başka yola geçince (yapısal kayıtta anlık kopya, yapısal olmayan Farklı kaydet'te yeni dosya) kaynakları yeniden adlandırır. */
  kaynakYeniden(eskiYol, yeniYol) {
    const ek = yolAnahtari(eskiYol), yk = yolAnahtari(yeniYol);
    const kayit = this.belgeler.get(ek);
    if (kayit) { this.belgeler.delete(ek); kayit.yol = yeniYol; this.belgeler.set(yk, kayit); }
    // Listedekiler kadar geri al yığınındaki girdiler de çevrilir: yoksa geri alınıp kaydedilince eski yol diskteki yeniden yazılmış
    // dosyayı gösterir, yanlış sayfa yazılırdı. Bu andan sonra oluşturulan girdilere dokunulmaz (eski yoldan eklenen sayfa yeni içeriktir).
    for (const r of this._girdiler) {
      const s = r.deref();
      if (!s) { this._girdiler.delete(r); continue; }
      if (!s.bos && yolAnahtari(s.kaynak.yol) === ek) s.kaynak = { ...s.kaynak, yol: yeniYol };
    }
    this.kayitliTarif = this.tarifJson();
  }

  // ------------------------------------------------------------ döndürme
  // PDF.js getViewport({rotation}) açıyı MUTLAK alır (verilmezse page.rotate, yani sayfa sözlüğündeki /Rotate). s.dondurme
  // tarifteki göreli döndürmedir (çekirdek kaydederken set_rotation(pg.rotation + d) yazar); gorunumDondurme yalnızca ekrandır.
  // Bu yüzden her viewport'a taban + s.dondurme + gorunumDondurme verilir. s.pt varsayılan viewport'tan gelir (taban dahil),
  // o yüzden sayfaBoyutu yalnızca s.dondurme + gorunumDondurme ile döndürür. Çekirdeğin görsel/içerik kutuları PyMuPDF'in
  // döndürülmemiş sayfa koordinatındadır; view[0] + x, view[3] - y ile PDF noktasına çevrilip bu viewport'tan geçirilir.

  /** Girdinin ekrandaki mutlak döndürmesi (0..359). Taban verilmezse yüklü sayfa nesnesinden alınır (yüklenmemişse 0 varsayılır). */
  toplamDondurme(s, taban = tabanAl(s.pdfSayfa)) { return aciyaIndir(taban + s.dondurme + this.gorunumDondurme); }

  /** Girdinin şu anki döndürmesiyle görünüm dönüşümü (scale: CSS px / pt, gerekirse piksel oranıyla çarpılmış). */
  sayfaGorunumu(s, scale, pdfSayfa = s.pdfSayfa) { return pdfSayfa.getViewport({ scale, rotation: this.toplamDondurme(s, tabanAl(pdfSayfa)) }); }

  /**
   * Sayfanın taban döndürmesi (sayfa sözlüğündeki /Rotate, 0/90/180/270; i: sayfalar dizisindeki 0 tabanlı indeks). Boş ya da
   * olmayan sayfada 0. Kaydedilecek mutlak açı: (tabanDondurme(i) + sayfalar[i].dondurme) % 360 (tarif göreli döndürme tutar).
   */
  async tabanDondurme(i) {
    const s = this.sayfalar[i];
    if (!s || s.bos) return 0;
    return tabanAl(await this.sayfaAl(i));
  }

  /** Eşzamanlı görünüm dönüşümü (sayfa nesnesi yüklüyse); not katmanı için. */
  viewportAl(i) {
    const s = this.sayfalar[i];
    if (!s.pdfSayfa) return null;
    return this.sayfaGorunumu(s, this.olcek * CSS_BIRIM);
  }

  /** Sayfanın metin içeriği (PDF.js TextContent), önbellekli. Arama ve metin katmanı aynı veriyi kullanır. */
  metinIcerigi(i) {
    const s = this.sayfalar[i];
    if (s.bos) return Promise.resolve({ items: [], styles: {} });
    if (!s.metinSozu) s.metinSozu = this.sayfaAl(i).then((p) => p.getTextContent({ includeMarkedContent: false }));
    return s.metinSozu;
  }

  get sayfaSayisi() { return this.sayfalar.length; }

  // ------------------------------------------------------------ yerleşim
  /** Sayfanın görüntü boyutu (döndürme dahil), piksel. s.pt taban döndürmeyi (/Rotate) zaten içerir: üstüne yalnızca göreli + görünüm eklenir. */
  sayfaBoyutu(i, olcek = this.olcek) {
    const s = this.sayfalar[i];
    const d = aciyaIndir(s.dondurme + this.gorunumDondurme);
    const w = (d % 180 === 0 ? s.pt.w : s.pt.h) * olcek * CSS_BIRIM;
    const h = (d % 180 === 0 ? s.pt.h : s.pt.w) * olcek * CSS_BIRIM;
    return { w, h };
  }

  ikili() { return this.duzen === 'iki' || this.duzen === 'ikiSurekli'; }
  surekli() { return this.duzen === 'surekli' || this.duzen === 'ikiSurekli'; }

  /** İkili düzende sayfa çiftleri: [[0],[1,2],[3,4]] (kapak ayrı) ya da [[0,1],[2,3]] */
  ciftler() {
    const n = this.sayfalar.length;
    const sonuc = [];
    let i = 0;
    if (this.kapakAyri && n > 0) { sonuc.push([0]); i = 1; }
    for (; i < n; i += 2) sonuc.push(i + 1 < n ? [i, i + 1] : [i]);
    return sonuc;
  }

  ciftBul(sayfaIdx) {
    const c = this.ciftler();
    for (let k = 0; k < c.length; k++) if (c[k].includes(sayfaIdx)) return k;
    return 0;
  }

  /**
   * İkili düzende tek sayfalık satır yarım çift mi: ayrı kapak (tek sayfalık belgede de) ya da çok sayfalı belgede tek kalan son
   * sayfa. Yarım satır çiftle aynı ölçekte çizilir; kapak sağ, son sayfa sol sütuna oturur (referans okuyucudaki gibi).
   */
  yarimSatirMi(idxler) {
    return this.ikili() && idxler.length === 1 && ((this.kapakAyri && idxler[0] === 0) || this.sayfalar.length > 1);
  }

  /** Düzenin satırları: tek sütunlu (tek/surekli) → [[0],[1],…], ikili (iki/ikiSurekli) → ciftler(). */
  satirlar() {
    if (this.ikili()) return this.ciftler();
    return Array.from({ length: this.sayfalar.length }, (_, i) => [i]);
  }

  /**
   * Satırın ölçek 1'deki ölçüleri: genis (sayfaların toplam genişliği, px), bosluk (satırdaki sabit, ölçekle büyümeyen sayfa arası
   * boşluk, px), yuksek (en yüksek sayfa). Tek sayfalık satır (ayrı kapak ya da tek kalan son sayfa) ikili düzende yarım çift yer
   * kaplar: çiftlerle aynı ölçekte kalsın (son sayfada yakınlaştırma sıçramasın).
   */
  satirOlcusu(idxler) {
    let genis = 0, yuksek = 0;
    for (const i of idxler) { const b = this.sayfaBoyutu(i, 1); genis += b.w; yuksek = Math.max(yuksek, b.h); }
    let bosluk = (idxler.length - 1) * BOSLUK;
    if (this.yarimSatirMi(idxler)) { genis *= 2; bosluk = BOSLUK; }
    return { genis, bosluk, yuksek };
  }

  /**
   * Kaydırmalı düzende belgenin baskın satır ölçüsü (satirOlcusu): satırların en çoğunun sığdığı genişlik. Genişlikleri en darından en
   * çok BASKIN_PAY kadar büyük satırlar bir kümedir; en kalabalık kümenin en geniş satırı döner (kümedeki bütün sayfalar tam sığar).
   * Eşitlikte genişliği bütün satırların ortancasına en yakın küme, sonra daha dar olan. Geçerli sayfaya bağlı değildir: kaydırınca ya
   * da başka sayfadayken yeniden sığdırınca ölçek değişmez; birkaç geniş sayfa (yatay tablo, büyük görsel) belgeyi küçültmez, yana taşar.
   */
  baskinSatir() {
    const olculer = this.satirlar().map((r) => this.satirOlcusu(r)).sort((a, b) => a.genis - b.genis);
    const n = olculer.length;
    if (!n) return null;
    const ortanca = olculer[(n - 1) >> 1].genis;
    let en = null;
    for (let i = 0, j = 0; i < n; i++) {
      if (j < i) j = i;
      while (j + 1 < n && olculer[j + 1].genis <= olculer[i].genis * BASKIN_PAY) j++;
      const adet = j - i + 1, uzak = Math.abs((olculer[i].genis + olculer[j].genis) / 2 - ortanca);
      if (!en || adet > en.adet || (adet === en.adet && uzak < en.uzak - 1e-9)) en = { adet, uzak, olcu: olculer[j] };
    }
    return en.olcu;
  }

  /**
   * Sığdırma modları için ölçek hesabı (varsayılan: gecerli sayfa; komşu satırın ölçeği için başka sayfa verilebilir). gw × gh:
   * kaydırıcının görünür boyutu (kaydırma çubukları düşülmüş); verilmezse o anki. Yerleşim o ankini kullanmaz, çubukları kendisi
   * hesaplayıp verir (gorunumCoz).
   */
  sigdirOlcek(mod, sayfaIdx = this.gecerli - 1, gw = this.kaydirici.clientWidth, gh = this.kaydirici.clientHeight) {
    const vw = gw - 2 * KENAR;
    const vh = gh - 2 * KENAR;
    const idx = Math.max(0, Math.min(sayfaIdx, this.sayfalar.length - 1));
    // Kaydırmalı düzende genişliğe sığdırma belgenin baskın satır genişliğine (0.1.8; önceden geçerli sayfanın satırına), öteki
    // modlar ve kaydırmasız düzen gösterilen satıra göre
    const baskin = mod === 'genislik' && this.surekli() ? this.baskinSatir() : null;
    const { genis, bosluk, yuksek } = baskin || this.satirOlcusu(this.ikili() ? this.ciftler()[this.ciftBul(idx)] : [idx]);
    // Boşluk ölçeklenmediği için sayfalara kalan genişlik: yoksa çift satır görünür alandan taşar, yatay kaydırma çubuğu çıkar
    const sayfaW = Math.max(1, vw - bosluk);
    if (mod === 'gercek') return 1;
    if (mod === 'gorunur') {
      const s = this.sayfalar[idx];
      const k = s?.icerikKutusu;
      // Kutu döndürülmemiş sayfa koordinatında: ekrandaki genişliği toplam döndürmeye (taban dahil) bağlı. Taban ancak sayfa nesnesi
      // yüklüyse bilinir; değilse sayfa genişliğine sığdırılır (zoomModuAyarla sayfa nesnesini bekler)
      if (k && s.pdfSayfa && !this.ikili()) {
        const d = this.toplamDondurme(s);
        const icerikW = (d % 180 === 0 ? k[2] - k[0] : k[3] - k[1]) * CSS_BIRIM;
        return Math.max(EN_KUCUK, Math.min(EN_BUYUK, vw / Math.max(icerikW + 8, 40)));
      }
      return Math.max(EN_KUCUK, sayfaW / genis);
    }
    if (mod === 'genislik') return Math.max(EN_KUCUK, sayfaW / genis);
    if (mod === 'sayfa') return Math.max(EN_KUCUK, Math.min(sayfaW / genis, vh / yuksek));
    return this.olcek;
  }

  /**
   * Verilen satırların (sayfa indeks dizileri) bu ölçekteki ölçüleri, üst üste dizilmiş; bütün boyutlar cihaz pikseli ızgarasına oturur
   * (tuval CSS boyutu cihaz pikseline tam denk gelsin, yeniden örnekleme bulanıklığı olmasın).
   * Döner: { olculer: [{idxler, boyutlar, satirW, y}], icW, icH } (icW × icH: içeriğin kenar boşluklarıyla kapladığı alan)
   */
  satirlariOlc(satirlar, olcek, dpr) {
    let icW = 0, y = KENAR;
    const olculer = satirlar.map((idxler) => {
      const boyutlar = idxler.map((i) => { const b = this.sayfaBoyutu(i, olcek); return { w: izgaraya(b.w, dpr), h: izgaraya(b.h, dpr) }; });
      // Yarım satır (bkz. yarimSatirMi) bir çift genişliğinde yer kaplar: sayfa bu yerin sağ (kapak) ya da sol (son sayfa) yarısındadır
      const satirW = this.yarimSatirMi(idxler) ? 2 * boyutlar[0].w + BOSLUK : boyutlar.reduce((t, b) => t + b.w, 0) + (idxler.length - 1) * BOSLUK;
      const satirH = Math.max(...boyutlar.map((b) => b.h));
      icW = Math.max(icW, satirW + 2 * KENAR);
      const r = { idxler, boyutlar, satirW, y: izgaraya(y, dpr) };
      y = r.y + satirH + BOSLUK;
      return r;
    });
    return { olculer, icW, icH: y - BOSLUK + KENAR };
  }

  /** Kaydırıcının gerçek dış boyutu (CSS px; ekran ölçeği 1 değilse kesirli olabilir, kaydırma çubuklarından etkilenmez) ve piksel oranı. */
  disKutu() {
    const r = this.kaydirici.getBoundingClientRect();
    return { w: r.width, h: r.height, dpr: pikselOrani() };
  }

  /**
   * Verilen satırlar gösterilirken geçerli olacak ölçeği, satır ölçülerini (satirlariOlc), kaydırıcının görünür boyutunu (vw × vh:
   * kaydırma çubukları düşülmüş) ve tuval alanının boyutunu (alanW × alanH) hesaplar. Hesap kaydırıcının dış boyutuna dayanır, o anki
   * görünür boyutuna (clientWidth / clientHeight) değil: görünür boyut yerleşimin kendi çıkardığı çubuklara bağlıdır. Sığdırma ölçeği
   * o anki görünür boyuttan alınırken, çubuksuz ölçekte içerik taşıp çubuklu ölçekte sığan belgede (ör. yatay iki sayfa, ekranın
   * yarısındaki pencere) çubuk çıkıyor → genişlik çubuk kadar daralıyor → ölçek küçülüyor → içerik sığıyor → çubuk kalkıyor → ölçek
   * büyüyor… ve görüntü saniyede ~16 kez %81 ↔ %82 arasında gidip geliyordu (0.1.20).
   * Sığdırmada gerekli görülen çubuk hesabın sonuna dek var sayılır (çubuk yalnızca eklenir; en çok üç tur): kararsız aralıkta küçük
   * ölçek seçilir, içerik çubuksuz sığar. Sonra o ölçekte tarayıcının göstereceği çubuklar bulunur (overflow: auto kuralı: önce
   * çubuksuz dener; biri gerekiyorsa onun kapladığı yer ötekini de gerektirebilir).
   * Kesirli boyut: ekran ölçeği 1 değilken (%125, %150) kaydırıcının gerçek boyutu CSS pikselinin kesri olabilir (951 cihaz pikseli
   * 760,8 px); offsetWidth / clientWidth bunu 761'e yuvarlar. Yuvarlanmış boyuta kurulan alan gerçek kutudan taşıp gereksiz çubuk
   * çıkarıyordu (0.1.19'da %125'te sığdırılmış uzun belgede her beş pencere genişliğinden birinde yatay çubuk). Boyut bu yüzden
   * getBoundingClientRect'ten alınır: taşma gerçek (kesirli) boyuta göre, sığdırma ve alan tam piksele aşağı yuvarlanmış boyuta göre
   * hesaplanır. Alan taşmayan yönde gerçek kutuyu hiç aşmaz; taşma sayılan fazlalık 1 px'ten büyüktür (karar tarayıcının
   * yuvarlamasına kalmaz).
   */
  gorunumCoz(satirlar, sayfaIdx, dpr) {
    const kutu = this.disKutu(), cubuk = cubukKalinligi();
    // Verilen çubuklar varken görünür boyut: gw × gh gerçek (kesirli), vw × vh tam piksele aşağı yuvarlanmış
    const gorunur = (dikey, yatay) => {
      const gw = Math.max(0, kutu.w - (dikey ? cubuk.en : 0)), gh = Math.max(0, kutu.h - (yatay ? cubuk.boy : 0));
      return { gw, gh, vw: Math.floor(gw), vh: Math.floor(gh) };
    };
    let olcek = this.olcek, olcum;
    if (this.zoomModu === 'serbest') olcum = this.satirlariOlc(satirlar, olcek, dpr);
    else {
      for (let tur = 0, dikey = false, yatay = false; tur < 3; tur++) {
        const g = gorunur(dikey, yatay);
        olcek = Math.min(EN_BUYUK, Math.max(EN_KUCUK, this.sigdirOlcek(this.zoomModu, sayfaIdx, g.vw, g.vh)));
        olcum = this.satirlariOlc(satirlar, olcek, dpr);
        const d = dikey || tasar(olcum.icH, g.gh), y = yatay || tasar(olcum.icW, g.gw);
        if (d === dikey && y === yatay) break;
        dikey = d; yatay = y;
      }
    }
    let yatayCubuk = tasar(olcum.icW, kutu.w), dikeyCubuk = tasar(olcum.icH, kutu.h);
    if (yatayCubuk && !dikeyCubuk) dikeyCubuk = tasar(olcum.icH, kutu.h - cubuk.boy);
    else if (dikeyCubuk && !yatayCubuk) yatayCubuk = tasar(olcum.icW, kutu.w - cubuk.en);
    const { vw, vh } = gorunur(dikeyCubuk, yatayCubuk);
    // Alan taşan yönde içerik kadardır; taşmayan yönde görünür boyutu aşmaz (1 px'e kadar fazlalığı kenar boşluğu karşılar, bkz. tasar).
    // Genişlikte görünür boyutu tam kaplar: satırlar ortasına dizilir.
    return { olcek, olcum, vw, vh, alanW: yatayCubuk ? olcum.icW : vw, alanH: dikeyCubuk ? olcum.icH : Math.min(olcum.icH, vh), kutu };
  }

  /** Ölçülen satırları (satirlariOlc) alanW genişliğindeki tuval alanının ortasına dizer. Döner: [[i, {x,y,w,h,olcek}]] */
  satirlariYerlestir({ olculer }, olcek, alanW, dpr) {
    const yerler = [];
    for (const r of olculer) {
      let x = (alanW - r.satirW) / 2;
      // Kapak ayrıysa tek sayfalık ilk satırı sağ tarafa hizala (referans okuyucudaki gibi); tek kalan son sayfa sol yarıda kalır
      if (this.ikili() && this.kapakAyri && r.idxler.length === 1 && r.idxler[0] === 0) x = alanW / 2 + BOSLUK / 2;
      r.idxler.forEach((i, k) => {
        const b = r.boyutlar[k];
        x = izgaraya(x, dpr);
        yerler.push([i, { x, y: r.y, w: b.w, h: b.h, olcek }]);
        x += b.w + BOSLUK;
      });
    }
    return yerler;
  }

  /** Görünürde (yerlesim) ya da ön çizim için sanal olarak (onYerlesim) sayfanın yeri; yoksa null. */
  yerAl(i) { return this.yerlesim[i] || this.onYerlesim[i] || null; }

  yerlesimHesapla(sessiz = false) {
    if (!this.belge) return;
    const eskiOlcek = this.olcek;
    const n = this.sayfalar.length, dpr = pikselOrani();
    const tumSatirlar = this.satirlar();
    const satirNo = new Int32Array(n);
    tumSatirlar.forEach((r, k) => { for (const i of r) satirNo[i] = k; });
    const gk = n ? satirNo[Math.max(0, Math.min(this.gecerli - 1, n - 1))] : 0;
    const gosterilen = this.surekli() ? tumSatirlar : (tumSatirlar[gk] ? [tumSatirlar[gk]] : []);

    // Ölçek (sığdırma modunda), görünür boyut ve alan kaydırıcının dış boyutundan, çıkacak kaydırma çubukları hesaplanarak (gorunumCoz)
    const coz = this.gorunumCoz(gosterilen, this.gecerli - 1, dpr);
    const { vw, alanW, alanH } = coz;
    this.olcek = coz.olcek;
    this._yerlesimKutusu = coz.kutu;   // bu yerleşimin hesaplandığı dış boyut (kutuDegisti)
    this.yerlesim = new Array(n).fill(null);
    for (const [i, yer] of this.satirlariYerlestir(coz.olcum, this.olcek, alanW, dpr)) this.yerlesim[i] = yer;
    this.alan.style.width = alanW + 'px';
    this.alan.style.height = alanH + 'px';
    // Sığdırmada bir satır (baskın genişlikten geniş yatay tablo, büyük görsel) görünür alandan taşıyorsa görünüm yatayda ortalanır:
    // satırlar alanın ortasına dizildiği için sol kenarda kalan görünümde sığdırılan sayfalar sağa kayık, bir kısmı dışarıda kalırdı.
    // Sığdırılan sayfalar tam görünür, geniş sayfa iki yandan taşar (yatay kaydırılır).
    if ((this.zoomModu === 'genislik' || this.zoomModu === 'sayfa') && alanW > vw) this.kaydirici.scrollLeft = (alanW - vw) / 2;

    // Tek/iki düzende önceki/sonraki satırın, gösterildiğinde alacağı yerleşimin aynısı (y=KENAR, ortalı, kendi sığdırma ölçeği)
    this.onYerlesim = new Array(n).fill(null);
    this._onIdx = [];
    if (!this.surekli()) {
      for (const k of [gk - 1, gk + 1]) {
        const satir = tumSatirlar[k];
        if (!satir) continue;
        const c = this.gorunumCoz([satir], satir[0], dpr);
        for (const [i, yer] of this.satirlariYerlestir(c.olcum, c.olcek, c.alanW, dpr)) { yer.sanal = true; this.onYerlesim[i] = yer; this._onIdx.push(i); }
      }
    }

    for (let i = 0; i < n; i++) {
      const s = this.sayfalar[i];
      const yer = this.yerlesim[i];
      if (!yer) {
        if (s.el.style.display !== 'none') s.el.style.display = 'none';
        // Gizlenen sayfanın tuvali komşu kümedeyse (en fazla 2 satır uzak) tutulur; uzaktakiler boşaltılır
        if (Math.abs(satirNo[i] - gk) > 2) this.sayfaBosalt(i);
        continue;
      }
      s.el.style.display = '';
      s.el.style.left = yer.x + 'px'; s.el.style.top = yer.y + 'px';
      s.el.style.width = yer.w + 'px'; s.el.style.height = yer.h + 'px';
      s.el.style.setProperty('--total-scale-factor', String(this.olcek * CSS_BIRIM));
      s.boyut = { w: yer.w, h: yer.h };
      // Var olan tuvali yeni boyuta gerdir (yeniden çizilene kadar); boyut aynıysa tam piksel yerinde kalır
      if (s.canvas && s.cizim) this.tuvalKonumla(s);
    }
    if (!sessiz || this.olcek !== eskiOlcek) this.dispatchEvent(new CustomEvent('zoom', { detail: { olcek: this.olcek, mod: this.zoomModu } }));
    this.dispatchEvent(new CustomEvent('yerlesim'));
  }

  /**
   * Kaydırıcının içerik kutusu değişti (ResizeObserver). Kutu iki nedenle değişir: kaydırıcının kendisi boyut değiştirmiştir (pencere,
   * sol panel, okuma modu) ya da son yerleşim kaydırma çubuğu çıkarmış / kaldırmıştır. İkincisi yeni yerleşim gerektirmez: yerleşim
   * dış boyuttan hesaplanır, çubukları kendisi öngörür (gorunumCoz); yeniden hesap aynı sonucu verirdi. Gizlenip gösterilen sekmede dış
   * boyut aynı kalsa da yerleşim yenilenir (sekme gizliyken sayfa boyutları öğrenilmiş olabilir, bkz. sayfaBoyutlariniYukle).
   */
  kutuDegisti() {
    const k = this.disKutu(), y = this._yerlesimKutusu;
    if (!k.w || !k.h) { this._kutuGizliydi = true; return; }
    const ayni = !this._kutuGizliydi && !!y && Math.abs(y.w - k.w) < 0.01 && Math.abs(y.h - k.h) < 0.01 && y.dpr === k.dpr;
    this._kutuGizliydi = false;
    if (!ayni) this.boyutDegisti();
  }

  boyutDegisti() {
    if (!this.belge) return;
    clearTimeout(this._boyutZamanlayici);
    this._boyutZamanlayici = setTimeout(() => {
      // Gizli sekme (boyut 0): yerleşimi bozma; sekme gösterilince yeniden çağrılır
      if (this.yok || !this.belge || !this.kaydirici.clientWidth || !this.kaydirici.clientHeight) return;
      const sayfa = this.gecerli, oran = this.sayfaIciOran();
      this.yerlesimHesapla();
      this.sayfayaGit(sayfa, { oran, aninda: true });
      this.kaydirmaIsle();
    }, 60);
  }

  /** Geçerli sayfanın görünümde ne kadar yukarıda olduğunu (0..1) döndürür. */
  sayfaIciOran() {
    const yer = this.yerlesim[this.gecerli - 1];
    if (!yer) return 0;
    return Math.min(1, Math.max(0, (this.kaydirici.scrollTop - yer.y) / yer.h));
  }

  // ------------------------------------------------------------ kaydırma ve görünürlük
  /** Kaydırma sonrası: geçerli sayfayı bulur, görünürleri hemen, bant/komşu sayfaları görünürler bitince çizer. */
  kaydirmaIsle(olayGonder = true) {
    if (!this.belge || this.yok) return;
    const vt = this.kaydirici.scrollTop, vl = this.kaydirici.scrollLeft;
    const vh = this.kaydirici.clientHeight, vw = this.kaydirici.clientWidth;
    if (!vw || !vh) return;                                 // gizli sekme: çizme, geçerli sayfayı bozma
    // Önden çizme bandı ve boşaltma sınırı görünümün ortasından ölçülür (0.2.3): bant kaydırma yönünde 2, gerisinde 1 ekran; bunun
    // dışında yönde 4, geride 3 ekrandan uzaktakiler boşaltılır. Yön bilinmiyorsa (programatik kaydırma, açılış) iki yana eşit: bant 1,5,
    // boşaltma 3,5 ekran, önceden hep olduğu gibi (görünümün iki kenarından birer ve üçer ekran). Toplamlar (bant 3, boşaltma 7 ekran)
    // yönden bağımsız: tuval sayısı ve bellek artmaz.
    const orta = vt + vh / 2, yon = this._yon.y;
    const bantAlt = yon > 0 ? 2 : yon < 0 ? 1 : 1.5, uzakAltPay = yon > 0 ? 4 : yon < 0 ? 3 : 3.5;
    const ustSinir = orta - (3 - bantAlt) * vh, altSinir = orta + bantAlt * vh;           // ön yükleme bandı
    const uzakUst = orta - (7 - uzakAltPay) * vh, uzakAlt = orta + uzakAltPay * vh;      // bunun dışındakiler boşaltılır
    // sayfayaGit'in istediği sayfa: görünüm o andan beri kımıldamadıysa geçerli olabilir (ardından gelen kaydırma olayı da aynı sonucu versin)
    const ist = this._istenen && Math.abs(this._istenen.st - vt) < 1 && Math.abs(this._istenen.sl - vl) < 1 ? this._istenen.no - 1 : -1;
    if (ist < 0) this._istenen = null;
    let enIyi = -1, enIyiAlan = -1, gecerliAlan = -1, istenenAlan = -1, istenenTam = false;
    const gorunurler = [], bant = [], uzaklar = [];
    for (let i = 0; i < this.sayfalar.length; i++) {
      const yer = this.yerlesim[i];
      if (!yer) continue;
      const alt = yer.y + yer.h;
      if (alt >= vt && yer.y <= vt + vh) gorunurler.push(i);
      else if (alt >= ustSinir && yer.y <= altSinir) bant.push(i);
      else if (alt < uzakUst || yer.y > uzakAlt) uzaklar.push(i);
      // görünür alan hesabı (geçerli sayfa)
      const gy = Math.max(0, Math.min(alt, vt + vh) - Math.max(yer.y, vt));
      const gx = Math.max(0, Math.min(yer.x + yer.w, vl + vw) - Math.max(yer.x, vl));
      const a = gx * gy;
      if (a > enIyiAlan) { enIyiAlan = a; enIyi = i; }
      if (i === this.gecerli - 1) gecerliAlan = a;
      if (i === ist) { istenenAlan = a; istenenTam = a >= yer.w * yer.h - 1; }
    }
    // Aynı satırdaki (iki sayfa düzeninde çiftteki) sayfa en görünürle eşit görünüyorsa geçerli sayfa korunur: çift içinde kaydırınca
    // sayfa kutusu sağ sayfadan sola atlamasın
    const gecerliYer = this.yerlesim[this.gecerli - 1];
    if (enIyi >= 0 && gecerliYer && gecerliAlan > 0 && gecerliAlan >= enIyiAlan - 0.5 && Math.abs(gecerliYer.y - this.yerlesim[enIyi].y) < 1) enIyi = this.gecerli - 1;
    // Gidilen sayfa tam ya da en çok görünenle eşit görünüyorsa geçerli odur: belge sonunda kaydırma sınırı hedef satırı en üste
    // getiremez; yoksa End, sayfa kutusuna yazılan son sayfa ya da son satıra ileri ok önceki satırın sayfasını gösterir (ok "çalışmaz")
    if (enIyi >= 0 && ist >= 0 && istenenAlan > 0 && (istenenTam || istenenAlan >= enIyiAlan - 0.5)) enIyi = ist;
    if (enIyi >= 0 && enIyi + 1 !== this.gecerli) {
      this.gecerli = enIyi + 1;
      if (olayGonder) this.dispatchEvent(new CustomEvent('sayfa', { detail: { sayfa: this.gecerli } }));
    }
    const komsular = this.komsuSayfalar();
    const komsuKume = new Set(komsular);
    for (const i of uzaklar) if (!komsuKume.has(i)) this.sayfaBosalt(i);
    this._gorunurKume = new Set(gorunurler.map((i) => this.sayfalar[i]));
    const gorunurIdx = new Set(gorunurler);
    this._onKuyruk = [...new Set([...komsular, ...bant])].filter((i) => !gorunurIdx.has(i));
    for (const i of gorunurler) this.sayfaCizPlanla(i);
    this.onYuklemeIsle();
  }

  /**
   * Kullanıcı girdisiyle (tekerlek, dokunma, kaydırma çubuğu, kaydırma tuşları) art arda gelen kaydırma olayları etkileşimdir: bu
   * sırada büyük görsellerin keskin örneklemesi ertelenir (keskinlik.js). Kaydırma durunca hızlı çizilmiş görünür sayfalar keskin
   * yeniden çizilir. Programatik kaydırma (yakınlaştırmanın konumlaması, boyut değişince sayfaya gitme) girdisiz olduğu için sayılmaz:
   * yakınlaştırma 60–70 ms arayla iki kaydırma olayı üretiyor ve bunlar etkileşim sayılınca sayfa önce yumuşak çiziliyordu.
   */
  etkilesimIzle() {
    const simdi = performance.now();
    const girdi = this._cubukTutuluyor || simdi - this._girdiZamani < GIRDI_MS;
    if (girdi && simdi - (this._sonKaydirmaOlayi ?? -Infinity) < 100) { etkilesimBildir(); this.keskinlestirPlanla(); }
    this._sonKaydirmaOlayi = simdi;
    this.yonIzle(girdi);
  }

  /**
   * Kaydırma yönü (0.2.3): kullanıcı girdisiyle kaydırılırken son hareketin yönü, eksen başına (aşağı / sağa 1, yukarı / sola −1).
   * Kaydırma durunca da kalır (sonraki hareket büyük olasılıkla aynı yönde); programatik kaydırmada (sayfaya gitme, yakınlaştırmanın
   * konumlaması, boyut değişimi) bilinmez sayılır (0). Bölgesel çizimin payı (bolgeHesapla) ve önden çizme bandı (kaydirmaIsle) bu
   * yöne konur.
   */
  yonIzle(girdi) {
    const st = this.kaydirici.scrollTop, sl = this.kaydirici.scrollLeft, o = this._yonKonum;
    if (!girdi) this._yon = { x: 0, y: 0 };
    else if (o) this._yon = { x: sl !== o.sl ? Math.sign(sl - o.sl) : this._yon.x, y: st !== o.st ? Math.sign(st - o.st) : this._yon.y };
    this._yonKonum = { st, sl };
  }

  /** Yön bilinmez olur ve şimdiki konum yönün çıkış noktası sayılır: sayfa çevrilip kaydırma yeni sayfanın başına (sonuna) atlayınca,
   *  ardından gelen kaydırma olayı girdi süresinde olsa da atlamayı ters yönde bir hareket saymaz. */
  yonSifirla() {
    this._yon = { x: 0, y: 0 };
    this._yonKonum = { st: this.kaydirici.scrollTop, sl: this.kaydirici.scrollLeft };
  }

  /**
   * İşçi örneklemeleri bitti (ya da hızlı çizim sırasında zaten bitmişti): hızlı çizilmiş ya da çizimi örneklemeyi bekleyen görünür
   * sayfalar (yalnızca tek sayfa verilirse o) gecikmesiz yeniden çizilir; görseller artık önbellekten keskin çizilir. Ardından hızlı
   * çizilmiş bant ve komşu sayfalar, görünürlerin çizimi bitince (onYuklemeIsle): kaydırma sürerken de, görselleri işçide
   * örneklendiyse (0.2.3, yeterliMi). Kaydırma sürerken görünür sayfalar kaydırma bitince çizilir (keskinlestirPlanla).
   */
  keskinHazir(tek = null) {
    if (this.yok || !this.belge || !this.kaydirici.clientWidth) return;   // gizli sekme: gösterilince kaydirmaIsle çizer
    if (keskinErtelenir()) { this.keskinlestirPlanla(); this.onYuklemeIsle(); return; }
    for (const s of tek ? [tek] : this._gorunurKume) {
      if (!s._okumaBekliyor && !s.cizim?.hizli) continue;
      s._okumaBekliyor = null;
      const i = this.idx(s);
      if (i < 0 || !this._gorunurKume.has(s) || !this.cizimGerekliMi(i)) continue;
      clearTimeout(s._zaman); s._planli = false;
      this.sayfaCiz(i);
    }
    this.onYuklemeIsle();
  }

  /** Etkileşim bitince (ETKILESIM_MS sonra) görünür sayfaların hızlı çizimini keskin çizimle değiştirmek için yeniden planlar. */
  keskinlestirPlanla() {
    clearTimeout(this._keskinZaman);
    this._keskinZaman = setTimeout(() => { if (!this.yok && !keskinErtelenir()) this.kaydirmaIsle(); else if (!this.yok) this.keskinlestirPlanla(); }, ETKILESIM_MS + 50);
  }

  /** Geçerli sayfanın komşuları (ön çizilir, uzakta olsa da boşaltılmaz). */
  komsuSayfalar() {
    if (!this.surekli()) return this._onIdx;                // tek/iki: önceki/sonraki satır (sanal yerleşimli)
    const n = this.sayfalar.length, g = this.gecerli - 1;
    if (this.duzen === 'surekli') return [g - 1, g + 1].filter((i) => i >= 0 && i < n);
    const c = this.ciftler(), k = this.ciftBul(g);
    return [...(c[k - 1] || []), ...(c[k + 1] || [])];
  }

  /** Görünür sayfaların çizimi bitmişse (ya da gerekmiyorsa) bant ve komşu sayfaların çizimini planlar. */
  onYuklemeIsle() {
    if (this.yok || !this.belge) return;
    for (const s of this._gorunurKume) if (s._planli || s.hedef) return;   // görünür çizim bitince sayfaCiz yeniden çağırır
    // Görünür sayfa görsellerinin işçide örneklenmesini bekliyor (hızlı çizildi): ön çizimler şimdi başlarsa onların istekleri
    // işçide öne geçer (son istek önce işlenir), keskin çizim de kuyruk boşalınca yapıldığından gecikir (taranmış belgenin ilk
    // açılışında ~0,3 sn). Okuma bitince keskinHazir görünür sayfayı çizer, onun sayfaCiz'i buraya yeniden gelir.
    if (!keskinErtelenir() && okumaSuruyor()) for (const s of this._gorunurKume) if (s.cizim?.hizli || s._okumaBekliyor) return;
    for (const i of this._onKuyruk) if (i >= 0 && i < this.sayfalar.length) this.sayfaCizPlanla(i);
  }

  gorunurSayfalar() {
    const vt = this.kaydirici.scrollTop, vh = this.kaydirici.clientHeight;
    const sonuc = [];
    for (let i = 0; i < this.sayfalar.length; i++) {
      const yer = this.yerlesim[i];
      if (yer && yer.y + yer.h >= vt && yer.y <= vt + vh) sonuc.push(i + 1);
    }
    return sonuc;
  }

  // ------------------------------------------------------------ çizim
  /**
   * Sayfanın çizimini planlar. Tuvali olmayan sayfa hemen çizilir. Tuvali olan sayfa iki türlü yeniden çizilir:
   * - Ölçek değişti (yakınlaştırma sürerken, pencere boyutu, döndürme, koyu sayfa): 120 ms beklenir, her çağrıda bekleme yeniden kurulur;
   *   yakınlaştırmanın her adımında yeniden çizilmez, bu arada eski tuval gerilmiş gösterilir.
   * - Ölçek aynı (ayniGorunumMu), yeniden çizimin nedeni bölgesel çizimin görünen kısmı kapsamaması ya da önizleme / hızlı çizimin
   *   keskinleşmesi: beklemeden (0 ms) ve kısılarak, bekleyen plan her çağrıda yeniden kurulmaz (0.2.3, kullanıcı isteği: "sayfaları
   *   kaydırırken daha hızlı yüklensin"). 120 ms'lik bekleme her kaydırma olayında yeniden kurulduğu için kaydırma sürdükçe hiç dolmuyordu:
   *   %600'de kaydırırken görünen alanın ~%90'ı beyaz kalıyor, yeniden çizim ancak kaydırma durunca geliyordu.
   */
  sayfaCizPlanla(i) {
    const s = this.sayfalar[i], yer = this.yerAl(i);
    if (!s || !yer) return;
    if (!this.cizimGerekliMi(i)) { this.gereksizCizimiBirak(s, i, yer); return; }
    if (s.hedef && this.yeterliMi(i, s.hedef, yer)) return;   // süren çizim yeterli: yeniden başlatma (kaydırırken iptal fırtınası olmasın)
    const gecikme = !s.canvas || (s.cizim && this.ayniGorunumMu(s, s.cizim, yer)) ? 0 : 120;
    if (s._planli && gecikme === 0 && s._planGecikmesi === 0) return;   // bekleyen plan zaten hemen çizecek (kısma)
    s.el.classList.add('yukleniyor');
    clearTimeout(s._zaman);
    s._planli = true; s._planGecikmesi = gecikme;
    s._zaman = setTimeout(() => {
      s._planli = false;
      const j = this.idx(s);
      if (j >= 0 && !this.yok) this.sayfaCiz(j);
    }, gecikme);
  }

  /**
   * Var olan tuval yeterliyken: bekleyen planı ve artık yeterli olmayan süren çizimi bırakır (sonucu atılacak ya da görünür
   * kısmı kapsamayacak). Yoksa bayat çizim sonuna kadar işlemci harcar ve görünür sayfada ön çizim kuyruğunu bekletir.
   */
  gereksizCizimiBirak(s, i, yer) {
    clearTimeout(s._zaman); s._planli = false;
    if (s.hedef && !this.yeterliMi(i, s.hedef, yer)) {
      if (s.gorev) { try { s.gorev.cancel(); } catch {} s.gorev = null; }
      s.hedef = null;
    }
    s.el.classList.remove('yukleniyor');
  }

  /**
   * Sayfanın görünür kısmı (sayfa yerel CSS px, sayfaya kırpılmış) ve görünüm ölçüleri.
   * Sanal (ön) yerleşimde görünüm sayfa üstünde varsayılır (scrollTop=0, scrollLeft olduğu gibi).
   * Görünür alanın üstündeki sayfada kısım alt kenara, altındakinde üst kenara sıkışır.
   */
  gorunurKisim(yer) {
    const vt = yer.sanal ? 0 : this.kaydirici.scrollTop, vl = this.kaydirici.scrollLeft;
    const vh = this.kaydirici.clientHeight, vw = this.kaydirici.clientWidth;
    const kirp = (v, ust) => Math.max(0, Math.min(ust, v));
    return {
      vt, vl, vw, vh,
      x0: kirp(vl - yer.x, yer.w), y0: kirp(vt - yer.y, yer.h),
      x1: kirp(vl + vw - yer.x, yer.w), y1: kirp(vt + vh - yer.y, yer.h),
    };
  }

  /** Çizilmesi gereken bölge (sayfa yerel CSS px, cihaz pikseli ızgarasında). */
  bolgeHesapla(i, yer = this.yerAl(i)) {
    const dpr = pikselOrani();
    if (yer.w * yer.h * dpr * dpr <= EN_FAZLA_PIKSEL) return { x: 0, y: 0, w: yer.w, h: yer.h, tam: true };
    // Görünür alan + iki yanına toplam 2 × BOLGE_PAYI; sayfaya kırpılır, bölge sayfanın dışına taşmaz (h negatif olamaz). Pay kaydırma
    // yönündeyse çoğu (BOLGE_ONDE) o yöne konur, yön bilinmiyorsa iki yana eşit (0.2.3; bölgenin boyutu, yani bellek aynı): yüksek
    // yakınlaştırmada kaydırırken görünen kısım bölgeden daha geç çıkar, yeniden çizim yetişir (%600'de kaydırırken yeniden çizim ~%35
    // azaldı; beyaz kalan alan %30–55, 4× yavaş işlemcide)
    const { vt, vl, vw, vh } = this.gorunurKisim(yer);
    const w = izgaraya(Math.min(yer.w, vw * (1 + 2 * BOLGE_PAYI)), dpr);
    const h = izgaraya(Math.min(yer.h, vh * (1 + 2 * BOLGE_PAYI)), dpr);
    const geride = (yon) => (yon > 0 ? 1 - BOLGE_ONDE : yon < 0 ? BOLGE_ONDE : 0.5);   // payın görünen kısmın gerisinde (üstünde / solunda) kalanı
    const x = izgaraya(Math.max(0, Math.min(vl - yer.x - Math.max(0, w - vw) * geride(this._yon.x), yer.w - w)), dpr);
    const y = izgaraya(Math.max(0, Math.min(vt - yer.y - Math.max(0, h - vh) * geride(this._yon.y), yer.h - h)), dpr);
    return { x, y, w, h, tam: false };
  }

  /**
   * Çizim tanımı c (bitmiş s.cizim ya da süren s.hedef) şu anki yer için yeterli mi?
   * Önizleme hiçbir zaman yeterli değildir; ölçek, döndürme, piksel oranı ve boyut aynı olmalı; bölgeselde görünür kısmı kapsamalı.
   */
  yeterliMi(i, c, yer) {
    const s = this.sayfalar[i];
    if (!c || !s || c.onizleme) return false;
    // Hızlı çizilmiş (görsel örneklemesi ertelenmiş) sayfa, arka plan okuması bitince yeterli değil: görünüyorsa kaydırma da bitince;
    // görünmüyorsa (bant ve komşu sayfa) kaydırma bitince ya da görselleri işçide örneklendiyse kaydırma sürerken de (0.2.3, kullanıcı
    // isteği: "sayfaları kaydırırken daha hızlı yüklensin"). Önden çizilen sayfa böylece görünür alana keskin girer; önceden logolu,
    // karekodlu sayfalar kaydırırken bulanık girip kaydırma durduktan ~0,5 sn sonra netleşiyordu. Görünür sayfa kaydırma sürerken
    // yeniden çizilmez (yeni giren sayfanın çizimiyle yarışmasın). Ara tuvalden hızlı çizilen bant sayfası kaydırırken yeniden
    // çizilmez (keskinlesir yok): yeniden çizim de hızlı olurdu, her kaydırma olayında boşuna çizilirdi.
    if (c.hizli && !okumaSuruyor() && (this._gorunurKume.has(s) ? !keskinErtelenir() : !keskinErtelenir() || c.keskinlesir)) return false;
    if (!this.ayniGorunumMu(s, c, yer)) return false;
    if (c.tam) return true;
    const g = this.gorunurKisim(yer), b = c.bolge;
    return g.x0 >= b.x - 1 && g.y0 >= b.y - 1 && g.x1 <= b.x + b.w + 1 && g.y1 <= b.y + b.h + 1;
  }

  /**
   * Çizim tanımı c (bitmiş s.cizim ya da süren s.hedef) sayfanın şu anki görünümüyle aynı ölçekte mi: ölçek, döndürme, piksel oranı,
   * koyuluk ve boyut aynı. Öyleyse c'nin yetmemesinin nedeni yalnızca önizleme / hızlı çizim ya da bölgenin görünen kısmı kapsamamasıdır.
   */
  ayniGorunumMu(s, c, yer) {
    if (c.olcek !== yer.olcek || c.dondurme !== this.toplamDondurme(s) || c.dpr !== pikselOrani()) return false;
    if (!!c.koyu !== !!this.koyuSayfa) return false;        // metin yumuşatması sayfa koyuluğuna göre (tuvalCiz)
    return Math.abs(c.w - yer.w) <= 1e-3 && Math.abs(c.h - yer.h) <= 1e-3;
  }

  cizimGerekliMi(i) {
    const s = this.sayfalar[i];
    const yer = this.yerAl(i);
    if (!s || !yer) return false;
    return !(s.canvas && s.cizim && this.yeterliMi(i, s.cizim, yer));
  }

  /** Süren çizim hâlâ geçerli mi (yerini başka çizim almadı, sayfa listede ve yerinin boyutu/ölçeği değişmedi)? */
  hedefGecerliMi(s, hedef) {
    if (this.yok || s.hedef !== hedef) return false;
    const i = this.idx(s);
    const yer = i >= 0 ? this.yerAl(i) : null;
    return !!yer && Math.abs(yer.w - hedef.w) <= 1e-3 && Math.abs(yer.h - hedef.h) <= 1e-3 && yer.olcek === hedef.olcek
      && this.toplamDondurme(s) === hedef.dondurme && pikselOrani() === hedef.dpr && hedef.koyu === !!this.koyuSayfa;
  }

  /**
   * Sayfanın b bölgesini (CSS px) oran (tuval pikseli / CSS px) çözünürlüğünde yeni bir tuvale çizer (dondurme: mutlak, toplamDondurme). İptal/hata: null.
   * koyu: koyu sayfa için gri tonlamalı metin yumuşatması. Opak tuvalde (alpha:false) Chromium metni ClearType gibi alt piksel
   * renkleriyle çizer (referans okuyucunun açık sayfadaki görüntüsüyle ölçüldü, aynı); koyu sayfanın invert + hue-rotate dönüşümü bu renk
   * saçaklarını ters tarafa koyup harfleri bulanık gösteriyordu. alpha:true tuvalde metin gri tonlamalı çizilir.
   */
  async tuvalCiz(s, pdfSayfa, olcek, dondurme, oran, b, koyu = false) {
    const px = Math.round(b.x * oran), py = Math.round(b.y * oran);
    const canvas = document.createElement('canvas');
    canvas.className = 'ana';
    canvas.width = Math.max(1, Math.round(b.w * oran));
    canvas.height = Math.max(1, Math.round(b.h * oran));
    const viewport = pdfSayfa.getViewport({ scale: olcek * CSS_BIRIM * oran, rotation: dondurme });
    const ertelenenOnce = ertelenenSayisi(), istenenOnce = istenenSayisi();
    const gorev = yaziGoreviHazirla(cizimGoreviHazirla(pdfSayfa.render({
      canvasContext: keskinBaglam(canvas.getContext('2d', { alpha: koyu })), viewport,
      transform: [1, 0, 0, 1, -px, -py],
      annotationMode: pdfjs.AnnotationMode.DISABLE,
    })));   // görsel maskesi bölgesel tuvale kırpılır (keskinlik.js); yazının yönü her parçada denetlenir (yaziTipleri.js)
    s.gorev = gorev;
    try {
      await gorev.promise;
      // hizli: bu çizimde görsel örneklemesi ertelendi; kaydırma bitince yeniden çizilir. keskinlesir: ertelenen görseller işçide
      // örnekleniyor; örnekleme bitince kaydırma sürerken de keskin çizilebilir (yeterliMi). Yalnızca bu çizimin ertelemeleri ve
      // istekleri sayılır (0.2.3, gorevSayaci): önceden eşzamanlı çizilen başka sayfanınkiler de sayılıyor, ertelenecek bir şeyi olmayan
      // sayfa hızlı ve keskinleşecek sayılıp kaydırma sürerken boşuna yeniden çiziliyordu. Görev sarılamadıysa pencerenin sayaçları
      const sayac = gorevSayaci(gorev);
      const hizli = sayac ? sayac.ertelenen > 0 : ertelenenSayisi() !== ertelenenOnce;
      return { canvas, px, py, hizli, keskinlesir: hizli && (sayac ? sayac.istenen > 0 : istenenSayisi() !== istenenOnce) };
    } catch (e) {
      tuvalBirak(canvas);
      if (!(e instanceof pdfjs.RenderingCancelledException)) console.error('Sayfa çizilemedi', s.no, e);
      return null;
    } finally {
      if (s.gorev === gorev) s.gorev = null;
    }
  }

  async sayfaCiz(i) {
    const s = this.sayfalar[i];
    if (!s || this.yok) return;
    s._planli = false;
    let hedef = null, bayat = false;
    // Süren çizim geçerli mi? Başka çizim yerini almadan yerleşim değiştiyse (bayat) sonuç atılır ve sayfa yeniden planlanır.
    const gecerliMi = () => {
      if (this.hedefGecerliMi(s, hedef)) return true;
      if (s.hedef === hedef && !this.yok) bayat = true;
      return false;
    };
    try {
      const yer = this.yerAl(i);
      if (!yer) return;
      if (!this.cizimGerekliMi(i)) { this.gereksizCizimiBirak(s, i, yer); return; }
      if (s.hedef && this.yeterliMi(i, s.hedef, yer)) return;          // süren çizim zaten yeterli
      const dpr = pikselOrani();
      const bolge = this.bolgeHesapla(i, yer);
      // Aynı çizim görsellerin işçide örneklenmesini bekliyor: bitince keskinHazir çizer (beklerken gizli çizim tekrarlanmasın)
      const bekleme = `${yer.olcek}|${this.toplamDondurme(s)}|${!!this.koyuSayfa}|${dpr}|${bolge.x},${bolge.y},${bolge.w},${bolge.h}`;
      if (s._okumaBekliyor === bekleme && okumaSuruyor()) return;
      if (s.gorev) { try { s.gorev.cancel(); } catch {} s.gorev = null; }
      // dondurme mutlaktır (taban dahil). Sayfa nesnesi henüz yüklenmemişse taban 0 varsayılır ve yüklenince düzeltilir; beklerken
      // görünüm döndürmesi değişirse girdiBosalt hedefi zaten düşürür (girdinin kendi döndürmesi değişmez)
      hedef = { olcek: yer.olcek, dondurme: this.toplamDondurme(s), dpr, oran: dpr, w: yer.w, h: yer.h, tam: bolge.tam, onizleme: false, bolge, koyu: !!this.koyuSayfa };
      s.hedef = hedef;
      const pdfSayfa = await this.sayfaAl(i);
      hedef.dondurme = this.toplamDondurme(s, tabanAl(pdfSayfa));
      if (!gecerliMi()) return;
      const dondurme = hedef.dondurme;

      // Pahalı ilk çizim: önce düşük çözünürlüklü tam sayfa önizleme (gerilmiş gösterilir), sonra tam çizim onun yerini alır. 0.2.3:
      // yalnızca çizim başlarken görünen sayfada ve çok büyük bölgesel çizimde (ONIZLEME_ESIGI). Önceden 6 MP'yi aşan her ilk çizimde
      // (2560 px %125 ekranda genişliğe sığdırılmış her sayfa, 6,7 MP) ve görünmeyen (önden çizilen) sayfada da yapılıyordu: önden çizilen
      // sayfa iki kez çiziliyor, görünen sayfa önce bulanık sonra net geliyordu. Ölçümde (metin, logolu, taranmış; 6,7 ve 19 MP; 1× ve
      // 4× yavaş işlemci) önizleme ilk görüntüyü hızlandırmadı (çizim süresi piksel sayısından çok çizim işlemlerine bağlı), keskin
      // görüntüyü 15–80 ms geciktirdi, kaydırma çubuğunu sürüklerken çizim işini ~%35 artırdı.
      if (!s.canvas && !s.bos && !bolge.tam && this._gorunurKume.has(s) && bolge.w * bolge.h * dpr * dpr > ONIZLEME_ESIGI) {
        const oran = Math.min(dpr, Math.sqrt(ONIZLEME_PIKSEL / (yer.w * yer.h)));
        const tamSayfa = { x: 0, y: 0, w: yer.w, h: yer.h };
        const on = await this.tuvalCiz(s, pdfSayfa, hedef.olcek, dondurme, oran, tamSayfa, hedef.koyu);
        if (!on) return;                                                // iptal ya da hata
        if (!gecerliMi()) { tuvalBirak(on.canvas); return; }
        if (s.canvas) tuvalBirak(on.canvas);
        else this.cizimUygula(s, on.canvas, { ...hedef, oran, tam: true, onizleme: true, bolge: tamSayfa, px: 0, py: 0 });
      }

      const son = await this.tuvalCiz(s, pdfSayfa, hedef.olcek, dondurme, dpr, bolge, hedef.koyu);
      if (!son) return;
      if (!gecerliMi()) { tuvalBirak(son.canvas); return; }   // çizerken boyut/ölçek değişti: yanlış boyutlu tuvali gösterme
      s._okumaBekliyor = null;
      if (son.hizli && !keskinErtelenir()) {
        // Görseller işçide örneklendiği için hızlı çizildi. Sayfada tam ve keskin bir çizim varsa (yakınlaştırma, koyu sayfa geçişi)
        // yumuşak ara çizim gösterilmez: örnekleme bitince keskin çizilir (0.1.1 sonrası ilk sürümde yakınlaştırınca önce yumuşak görünüyordu)
        if (s.canvas && s.cizim && s.cizim.tam && !s.cizim.onizleme && !s.cizim.hizli) {
          tuvalBirak(son.canvas);
          s._okumaBekliyor = bekleme;
          if (!okumaSuruyor()) setTimeout(() => this.keskinHazir(s), 0);
          return;
        }
      }
      const c = son.canvas;
      // CSS kutusu tuvalin cihaz pikseli boyutundan türetilir: 1 tuval pikseli = 1 cihaz pikseli
      this.cizimUygula(s, c, { ...hedef, hizli: son.hizli, keskinlesir: son.keskinlesir, px: son.px, py: son.py, bolge: { x: son.px / dpr, y: son.py / dpr, w: c.width / dpr, h: c.height / dpr } });
      if (son.hizli) { if (keskinErtelenir()) this.keskinlestirPlanla(); else if (!okumaSuruyor()) setTimeout(() => this.keskinHazir(s), 0); }
      s.el.classList.remove('yukleniyor');
      const j = this.idx(s);
      // Ek katmanlar (bağlantı, form alanı) ve not katmanı (sayfaCizildi) yalnızca sayfanın görünümü (ölçek, döndürme, piksel oranı,
      // koyuluk) değişince yeniden kurulur (0.2.3): aynı ölçekteki yeniden çizim (bölgesel çizimin kaydırılması, hızlı çizimin
      // keskinleşmesi) yalnızca tuvali değiştirir, katmanlar sayfanın tamamını kapsar. Önceden her çizimde kuruluyordu; 0.2.3'te aynı
      // ölçekteki yeniden çizim beklemeden geldiği için form alanlı belgede %600'de kaydırırken çekirdekten saniyede onlarca tam sayfa
      // form görüntüsü isteniyor, çekirdeğin sırası uzuyor, Sayfalar panelinin küçük resimleri, arama ve kayıt 5–6 sn bekliyordu.
      // girdiBosalt katmanları siler ve anahtarı sıfırlar. Metin katmanı aynı ölçekte zaten yeniden kurulmaz (metinKatmaniCiz).
      const katmanAnahtari = `${hedef.olcek}|${dondurme}|${dpr}|${hedef.koyu}`;
      const yeniGorunum = s._katmanAnahtari !== katmanAnahtari;
      s._katmanAnahtari = katmanAnahtari;
      if (!s.bos) {
        this.metinKatmaniCiz(j, pdfSayfa, hedef.olcek, dondurme).catch((e) => console.error('Metin katmanı', e));
        if (yeniGorunum) this.ekKatmanlar(j, pdfSayfa, hedef.olcek, dondurme).catch((e) => console.warn('Ek katmanlar', e));
      }
      if (yeniGorunum) this.dispatchEvent(new CustomEvent('sayfaCizildi', { detail: { sayfa: j + 1 } }));
    } catch (e) {
      console.error('Sayfa çizilemedi', i + 1, e);
    } finally {
      if (hedef && s.hedef === hedef) s.hedef = null;
      const gorunur = this._gorunurKume.has(s);
      // Bayat sonuç: görünür sayfa yeni yerleşime göre hemen yeniden planlanır; görünmeyen (bant/komşu) sayfa görünürlerin
      // bitmesini bekleyen ön çizim kuyruğundan geçer (yakınlaştırırken görünür çizimle işlemci için yarışmasın)
      if (bayat && gorunur) { const j = this.idx(s); if (j >= 0) this.sayfaCizPlanla(j); }
      if (bayat || gorunur) this.onYuklemeIsle();                      // görünür sayfa bitti: ön çizimlere geç
    }
  }

  /** Yeni çizilen tuvali girdiye bağlar, gösterir ve eski ham tuvali bırakır. */
  cizimUygula(s, canvas, cizim) {
    const eskiHam = s.hamCanvas;
    s.cizim = cizim; s.hamCanvas = canvas;
    this.tuvalGoster(s);
    if (eskiHam && eskiHam !== canvas) tuvalBirak(eskiHam);
  }

  /**
   * Tuvali sayfa elemanında konumlar. Çizimdeki sayfa boyutu elemanın şu anki boyutuna eşitse kutu olduğu gibi
   * (tam piksel) kullanılır; değilse (yakınlaştırma sürerken, önizleme) orantılı gerilir.
   */
  tuvalKonumla(s, tuval = s.canvas) {
    const c = s.cizim, b = c.bolge, k = s.boyut;
    const kx = k ? k.w / c.w : 1, ky = k ? k.h / c.h : 1;
    const st = tuval.style;
    st.left = b.x * kx + 'px'; st.top = b.y * ky + 'px';
    st.width = b.w * kx + 'px'; st.height = b.h * ky + 'px';
  }

  /** Ham tuvali (gerekirse koyu sayfa dönüşümüyle, görselleri koruyarak) DOM'a yerleştirir. */
  tuvalGoster(s) {
    const ham = s.hamCanvas, c = s.cizim;
    if (!ham || !c) return;
    let goster = ham;
    if (this.koyuSayfa) {
      goster = document.createElement('canvas');
      goster.width = ham.width; goster.height = ham.height;     // kopya ham tuvalle aynı piksel boyutunda ve konumda
      const ctx = goster.getContext('2d', { alpha: false });
      ctx.filter = 'invert(1) hue-rotate(180deg)';     // beyaz sayfa tam siyah, siyah metin beyaz; renkler tonunu korur
      ctx.drawImage(ham, 0, 0);
      ctx.filter = 'none';
      // Görselleri özgün renginde geri çiz
      const kutular = s.gorselKutulari;
      if (kutular && kutular.length && s.pdfSayfa) {
        const vp = s.pdfSayfa.getViewport({ scale: c.olcek * CSS_BIRIM * c.oran, rotation: c.dondurme });   // c.dondurme mutlak (çizimdeki toplamDondurme)
        const view = s.pdfSayfa.view;
        for (const k of kutular) {
          const p1 = vp.convertToViewportPoint(view[0] + k[0], view[3] - k[1]);
          const p2 = vp.convertToViewportPoint(view[0] + k[2], view[3] - k[3]);
          const x = Math.min(p1[0], p2[0]) - (c.px || 0), y = Math.min(p1[1], p2[1]) - (c.py || 0);
          const w = Math.abs(p2[0] - p1[0]), h = Math.abs(p2[1] - p1[1]);
          if (w < 1 || h < 1) continue;
          ctx.drawImage(ham, x, y, w, h, x, y, w, h);
        }
      } else if (!kutular && this.cekirdek && !s.bos && !s._kutuIstegi) {
        // Kutular henüz bilinmiyor: bir kez getir (önizleme + tam çizim iki istek açmasın) ve o anki tuvalle yeniden birleştir
        s._kutuIstegi = this.cekirdek('gorsel_kutulari', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa })
          .then((r) => { s.gorselKutulari = r.kutular || []; s._kutuIstegi = null; if (this.koyuSayfa && !this.yok && s.hamCanvas && s.cizim) this.tuvalGoster(s); })
          .catch(() => { s.gorselKutulari = []; s._kutuIstegi = null; });
      }
    }
    goster.className = 'ana';
    this.tuvalKonumla(s, goster);
    const eski = s.canvas;
    if (eski && eski !== goster) { eski.remove(); if (eski !== ham) tuvalBirak(eski); }
    s.canvas = goster;
    if (goster.parentNode !== s.el) s.el.insertBefore(goster, s.el.firstChild);
  }

  /** Bağlantı (Link) ve form alanı (Widget) katmanları (dondurme: mutlak, çizimdeki toplamDondurme). */
  async ekKatmanlar(i, pdfSayfa, olcek, dondurme) {
    const s = this.sayfalar[i];
    if (!this.cekirdek || s.bos) return;
    const viewport = pdfSayfa.getViewport({ scale: olcek * CSS_BIRIM, rotation: dondurme });
    const view = pdfSayfa.view;
    const px = (x, y) => viewport.convertToViewportPoint(view[0] + x, view[3] - y);
    // Bağlantılar (bir kez alınır)
    if (!s.baglantilar) {
      try { s.baglantilar = (await this.cekirdek('baglantilar', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa })).baglantilar || []; } catch { s.baglantilar = []; }
    }
    if (this.yok || s.cizim?.olcek !== olcek) return;
    s.el.querySelector('.baglanti-katmani')?.remove();
    if (s.baglantilar.length) {
      const katman = document.createElement('div');
      katman.className = 'baglanti-katmani';
      for (const l of s.baglantilar) {
        if (!l.sayfa && !l.uri && !l.ad) continue;
        const a = px(l.rect[0], l.rect[1]), b = px(l.rect[2], l.rect[3]);
        const el = document.createElement('a');
        el.className = 'baglanti';
        el.style.cssText = `left:${Math.min(a[0], b[0])}px;top:${Math.min(a[1], b[1])}px;width:${Math.abs(b[0] - a[0])}px;height:${Math.abs(b[1] - a[1])}px`;
        el.title = l.uri || (l.sayfa ? `Sayfa ${l.sayfa}` : '');
        el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.dispatchEvent(new CustomEvent('baglanti', { detail: { ...l, kaynakYol: s.kaynak.yol } })); });
        katman.append(el);
      }
      s.el.insertBefore(katman, s.notKatmani);
    }
    // Form alanları (yakınlaştırmaya göre yeniden çizilir)
    if (s.formYok) return;
    try {
      const dpr = window.devicePixelRatio || 1;
      // dondurme: ekrandaki mutlak açı; çekirdek diskteki /Rotate'ten farkını uygular (PNG kutuyla aynı yönde ve oranda gelir, %100 gerilir)
      const r = await this.cekirdek('form_gorunum', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, olcek: Math.min(6, olcek * CSS_BIRIM * dpr), dondurme });
      if (!r || !r.png) { s.formYok = true; return; }
      if (this.yok || s.cizim?.olcek !== olcek) return;
      s.el.querySelector('.form-katmani')?.remove();
      const img = document.createElement('img');
      img.className = 'form-katmani'; img.src = 'data:image/png;base64,' + r.png; img.draggable = false;
      s.el.insertBefore(img, s.el.querySelector('.textLayer') || s.notKatmani);
    } catch { s.formYok = true; }
  }

  /** PDF.js metin katmanı (dondurme: mutlak, çizimdeki toplamDondurme; TextLayer bunu data-main-rotation olarak yazar). */
  async metinKatmaniCiz(i, pdfSayfa, olcek, dondurme) {
    const s = this.sayfalar[i];
    const viewport = pdfSayfa.getViewport({ scale: olcek * CSS_BIRIM, rotation: dondurme });
    if (s.textLayer && s.metinDondurme === dondurme) {
      if (s.metinOlcek !== olcek) { s.textLayer.update({ viewport }); s.metinOlcek = olcek; }
      return;
    }
    if (s.textLayer) { s.textLayer.cancel(); s.textLayer = null; }
    // Seçim ve arama vurgusunun sayfayla karışımı (stil.css): koyulaştırılmış sayfada screen. koyuSayfa yüklemeden önce doğrudan atanabildiği için burada da eşitlenir
    this.kok.classList.toggle('koyu-sayfa', this.koyuSayfa);
    const eski = s.el.querySelector('.textLayer');
    if (eski) eski.remove();
    const katman = document.createElement('div');
    katman.className = 'textLayer';
    s.el.insertBefore(katman, s.notKatmani);
    const icerik = await this.metinIcerigi(i);
    if (this.yok || s.el.querySelector('.textLayer') !== katman) return;
    // Görsellerde tanınan sözcükler (0.1.24) PDF'in metninin ardına eklenir: arama vurgusu öğe sırasıyla eşlenir, PDF'in öğeleri yerinde kalır
    const tanima = s.tanima?.satirlar.length ? tanimaOgeleri(s.tanima.satirlar, pdfSayfa.view) : null;
    const kaynak = tanima?.length ? { ...icerik, items: [...icerik.items, ...tanima], styles: { ...icerik.styles, [TANIMA_YAZI]: tanimaStili() } } : icerik;
    const tl = new pdfjs.TextLayer({ textContentSource: kaynak, container: katman, viewport });
    s.textLayer = tl; s.metinOlcek = olcek; s.metinDondurme = dondurme;
    await tl.render();
    if (s.textLayer !== tl) return;
    const son = document.createElement('div');
    son.className = 'endOfContent';
    katman.append(son);
    katman.addEventListener('mousedown', () => katman.classList.add('selecting'));   // kaldırma: kurucudaki _fareBirak
    this.dispatchEvent(new CustomEvent('metinKatmani', { detail: { sayfa: i + 1 } }));
    this.tanimaIste(s);
  }

  // ------------------------------------------------------------ görsellerdeki yazı (0.1.24)
  /**
   * Metin katmanı kurulan sayfanın görsellerindeki yazı çekirdekte tanınır (core/islemler/yazi_tanima.py: Windows'un yazı tanıyıcısı);
   * tanınan sözcükler katmana eklenir, PDF'in kendi metni gibi seçilir ve kopyalanır (Bul onları aramaz). Görseli olmayan sayfa çekirdekte
   * hemen boş döner. Aynı anda tek istek: sıradaki, geçerli sayfaya en yakın bekleyen sayfa; katmanı boşaltılan (kaydırılıp geçilen) sayfa
   * kuyruktan düşer, yeniden görününce istenir. Sonuç girdide (s.tanima) kalır: katman yeniden kurulunca yeniden istenmez.
   */
  tanimaIste(s) {
    if (tanimaYok || !this.cekirdek || s.bos || s.tanima !== undefined || this.yok) return;
    s.tanima = null;   // istendi
    this._tanimaBekleyen.add(s);
    this._tanimaSur();
  }

  async _tanimaSur() {
    if (this._tanimaSuruyor || this.yok) return;
    let s = null, uzaklik = Infinity;
    for (const x of this._tanimaBekleyen) {
      const i = this.sayfalar.indexOf(x);
      if (i < 0 || !x.textLayer || tanimaYok) { this._tanimaBekleyen.delete(x); if (x.tanima === null) x.tanima = undefined; continue; }
      const d = Math.abs(i + 1 - this.gecerli);
      if (d < uzaklik) { uzaklik = d; s = x; }
    }
    if (!s) return;
    this._tanimaBekleyen.delete(s);
    this._tanimaSuruyor = true;
    try {
      const r = await this.cekirdek('ocr_sayfa', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa });
      if (r?.desteklenmiyor) tanimaYok = true;
      s.tanima = { satirlar: Array.isArray(r?.satirlar) ? r.satirlar : [] };
      if (s.tanima.satirlar.length) this._tanimaKatmanaEkle(s);
    } catch (e) {
      console.warn('Görseldeki yazı tanınamadı', e);
      s.tanima = { satirlar: [] };
    } finally {
      this._tanimaSuruyor = false;
      this._tanimaSur();
    }
  }

  /** Tanınan sözcükler gelince sayfanın metin katmanı yeniden kurulur (PDF.js katmanına öğe eklenemiyor). Katmanda seçim varsa seçim
   *  bozulmasın diye seçim kalkana dek beklenir; katman bu arada boşaltılırsa yeniden kurulurken öğeler zaten eklenir. */
  _tanimaKatmanaEkle(s) {
    clearTimeout(s._tanimaZaman);
    const i = this.sayfalar.indexOf(s);
    if (this.yok || i < 0 || !s.textLayer) return;
    if (secimdeMi(s.el.querySelector(':scope > .textLayer'))) { s._tanimaZaman = setTimeout(() => this._tanimaKatmanaEkle(s), 500); return; }
    // Ön çizilen (tek / iki sayfa düzeninde henüz gösterilmeyen sonraki) sayfanın yeri ön yerleşimdedir (yerAl): orada da yeniden kurulur;
    // yalnızca yerleşime bakılsaydı gösterilince tuval yeterli bulunup katman kurulmayacağından tanınan yazı hiç eklenmezdi
    const yer = this.yerAl(i);
    if (!yer) return;
    const olcek = s.metinOlcek || yer.olcek;
    s.textLayer.cancel(); s.textLayer = null;
    this.sayfaAl(i).then((p) => {
      if (this.yok || this.sayfalar[i] !== s || s.textLayer || !this.yerAl(i)) return null;
      return this.metinKatmaniCiz(i, p, olcek, this.toplamDondurme(s, tabanAl(p)));
    }).catch((e) => console.error('Metin katmanı', e));
  }

  /**
   * Sayfanın metin katmanını tuvalini çizmeden kurar (yoksa): sürükleyerek seçimde çapa ile odak arasında kalıp hızlı kaydırmada
   * hiç çizilmemiş sayfalar seçime (ve kopyaya) girsin. Döner: kuruldu mu.
   */
  async metinKatmaniHazirla(i) {
    const s = this.sayfalar[i];
    if (!s || s.bos || s.textLayer || s._metinHazirlik || !this.yerlesim[i] || this.yok) return false;
    s._metinHazirlik = true;
    try {
      const p = await this.sayfaAl(i);
      if (this.yok || this.sayfalar[i] !== s || s.textLayer || !this.yerlesim[i]) return false;
      await this.metinKatmaniCiz(i, p, this.olcek, this.toplamDondurme(s, tabanAl(p)));
      return !!s.textLayer;
    } finally { s._metinHazirlik = false; }
  }

  sayfaBosalt(i) { const s = this.sayfalar[i]; if (s) this.girdiBosalt(s); }

  /** Sekme gizlenmek üzere (henüz görünür): sayfa içi konum saklanır; gizli kaydırıcı ölçülemez (durumAl arka plandaki sekme için kullanır). */
  gizlenecek() {
    if (this.yok || !this.belge || !this.kaydirici.clientHeight) return;
    this._gizliKonum = { oran: this.sayfaIciOran(), sol: this.kaydirici.scrollLeft };
  }

  /**
   * Sekme arka plana alındı (başka sekme ya da açılış ekranı seçildi): görünür sayfalar dışındaki tuvaller bırakılır. Gizli sekmede
   * kaydirmaIsle çalışmadığından ön çizilmiş bant ve komşu sayfalar sekme kapanana dek bellekte kalıyordu (2560 px genişliğe sığdırılmış
   * A4 tuvali ~27 MB, sekme başına 3–4 tuval). Görünür sayfalar tutulur: sekmeye dönünce aynı görüntü beklemeden gelir, bant yeniden çizilir.
   */
  arkaPlanaAlindi() {
    if (this.yok || !this.belge) return;
    this._onKuyruk = [];
    for (let i = 0; i < this.sayfalar.length; i++) if (!this._gorunurKume.has(this.sayfalar[i])) this.sayfaBosalt(i);
  }

  hepsiniYenidenCiz() {
    for (let i = 0; i < this.sayfalar.length; i++) this.sayfaBosalt(i);
    this.kaydirmaIsle();
  }

  koyuSayfaAyarla(deger) {
    const degisti = !!this.koyuSayfa !== !!deger;
    this.koyuSayfa = !!deger;
    this.kok.classList.toggle('koyu-sayfa', this.koyuSayfa);   // metin katmanı karışımı (stil.css)
    for (const s of this.sayfalar) { this.yerTutucuRengi(s); if (s.hamCanvas && s.cizim) this.tuvalGoster(s); }
    if (degisti) this.kaydirmaIsle();       // görünür sayfalar koyuluğa uygun metin yumuşatmasıyla yeniden çizilir (yeterliMi)
  }

  // ------------------------------------------------------------ yakınlaştırma
  tekerlek(e) {
    if (!yakinlastirmaTekerlegi(e)) { this.tekerlekleCevir(e); return; }
    e.preventDefault();
    const kut = this.kaydirici.getBoundingClientRect();
    const sabit = { x: e.clientX - kut.left, y: e.clientY - kut.top };
    // macOS'ta dokunmatik yüzeyde iki parmakla kıstırma Ctrl'li küçük tekerlek adımları olarak gelir (0.2.0): adım büyütülür, sıçrama
    // olmasın diye sınırlanır. Fare tekerleği (Windows'ta Ctrl, Mac'te ⌘ ile) önceki gibi
    const adim = MAC && e.ctrlKey ? Math.exp(Math.max(-0.5, Math.min(0.5, -e.deltaY * 0.01))) : Math.exp(-e.deltaY * 0.0015);
    this.zoomAyarla(this.olcek * adim, sabit);
  }

  /** Ölçeği değiştirir; sabit nokta (kaydırıcı içindeki piksel) yerinde kalır. */
  zoomAyarla(yeniOlcek, sabit = null, mod = 'serbest') {
    if (!this.belge) return;
    yeniOlcek = Math.min(EN_BUYUK, Math.max(EN_KUCUK, yeniOlcek));
    const vt = this.kaydirici.scrollTop, vl = this.kaydirici.scrollLeft;
    const vw = this.kaydirici.clientWidth, vh = this.kaydirici.clientHeight;
    if (!sabit) sabit = { x: vw / 2, y: Math.min(vh / 2, 80) };
    const dx = vl + sabit.x, dy = vt + sabit.y;
    // Sabit noktanın hangi sayfada, nerede olduğunu bul
    let idx = -1;
    for (let i = 0; i < this.yerlesim.length; i++) {
      const y = this.yerlesim[i];
      if (y && dy >= y.y - BOSLUK && dy <= y.y + y.h + BOSLUK) { idx = i; if (dx >= y.x && dx <= y.x + y.w) break; }
    }
    if (idx < 0) idx = this.gecerli - 1;
    const yer = this.yerlesim[idx] || { x: 0, y: 0, w: 1, h: 1 };
    const fx = (dx - yer.x) / yer.w, fy = (dy - yer.y) / yer.h;

    this.zoomModu = mod;
    this.olcek = yeniOlcek;
    this.yerlesimHesapla();
    const y2 = this.yerlesim[idx] || yer;
    this.kaydirici.scrollLeft = y2.x + fx * y2.w - sabit.x;
    this.kaydirici.scrollTop = y2.y + fy * y2.h - sabit.y;
    this.kaydirmaIsle();
  }

  async zoomModuAyarla(mod) {
    if (mod === 'serbest') return;
    const sayfa = this.gecerli, oran = this.sayfaIciOran();
    // İçerik genişliği toplam döndürmeye bağlı; taban için sayfa nesnesi de yüklenmiş olmalı
    if (mod === 'gorunur') await Promise.all([this.icerikKutusuAl(sayfa - 1), this.sayfalar[sayfa - 1] && this.sayfaAl(sayfa - 1).catch(() => null)]);
    this.zoomModu = mod;
    this.yerlesimHesapla();
    this.sayfayaGit(sayfa, { oran, aninda: true });
    if (mod === 'gorunur') this.gorunurAlanaKaydir(sayfa);
    this.kaydirmaIsle();
  }

  /** "Görünür alana sığdır"da yatay kaydırma: sayfanın içerik kutusunun sol kenarı görünümün soluna gelir (kutu ve sayfa nesnesi yüklüyse). */
  gorunurAlanaKaydir(sayfa) {
    const s = this.sayfalar[sayfa - 1];
    if (!s?.icerikKutusu || !s.pdfSayfa) return;
    const vp = this.viewportAl(sayfa - 1), view = s.pdfSayfa.view, k = s.icerikKutusu;
    // Döndürülmüş sayfada kutunun ekrandaki sol kenarı başka köşeden gelir: karşıt iki köşenin küçük x'i
    const x = Math.min(vp.convertToViewportPoint(view[0] + k[0], view[3] - k[1])[0], vp.convertToViewportPoint(view[0] + k[2], view[3] - k[3])[0]);
    const yer = this.yerlesim[sayfa - 1];
    if (yer) this.kaydirici.scrollLeft = Math.max(0, yer.x + x - 4);
  }

  /** Sayfanın içerik kutusunu (metin+çizim+görsel birleşimi, PyMuPDF üst-sol pt) çekirdekten alır. */
  async icerikKutusuAl(i) {
    const s = this.sayfalar[i];
    if (!s || s.bos || s.icerikKutusu || !this.cekirdek) return s?.icerikKutusu || null;
    try { const r = await this.cekirdek('icerik_kutusu', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa }); s.icerikKutusu = r.kutu; } catch { s.icerikKutusu = null; }
    return s.icerikKutusu;
  }

  yakinlastir(yon) {
    const o = this.olcek;
    let hedef;
    if (yon > 0) hedef = ZOOM_ADIMLARI.find((z) => z > o + 0.001) ?? EN_BUYUK;
    else hedef = [...ZOOM_ADIMLARI].reverse().find((z) => z < o - 0.001) ?? EN_KUCUK;
    this.zoomAyarla(hedef);
  }

  // ------------------------------------------------------------ düzen ve döndürme
  duzenAyarla(duzen, kapakAyri = this.kapakAyri, tekZoomModu = 'genislik') {
    const sayfa = this.gecerli, oran = this.sayfaIciOran();
    // Tek sayfalıdan iki sayfalıya geçiş: yakınlaştırma ne olursa olsun sayfayı sığdır. Elle seçilmiş yakınlaştırma ("Gerçek boyut"
    // dahil) çift pencereye sığmaz; genişliğe sığdırılmış iki sayfa da geniş (ekranı kaplayan) pencerede yukarıdan aşağı sığmaz.
    const ikiliyeGecis = !this.ikili() && (duzen === 'iki' || duzen === 'ikiSurekli');
    if (ikiliyeGecis) this.zoomModu = 'sayfa';
    // İki sayfalıdan tek sayfalıya (kaydırmalı ya da kaydırmasız) geçiş: yakınlaştırma ne olursa olsun tek sayfanın varsayılan
    // sığdırması (tekZoomModu; varsayılanı genişliğe sığdır)
    if (this.ikili() && (duzen === 'tek' || duzen === 'surekli')) this.zoomModu = tekZoomModu;
    this.duzen = duzen; this.kapakAyri = kapakAyri;
    this.yerlesimHesapla();
    this.sayfayaGit(sayfa, { oran: this.surekli() ? oran : 0, aninda: true });
    this.kaydirmaIsle();
  }

  dondur(derece) {
    const sayfa = this.gecerli, oran = this.sayfaIciOran();
    this.gorunumDondurme = aciyaIndir(this.gorunumDondurme + derece);
    for (let i = 0; i < this.sayfalar.length; i++) this.sayfaBosalt(i);
    this.yerlesimHesapla();
    this.sayfayaGit(sayfa, { oran, aninda: true });
    this.kaydirmaIsle();
  }

  // ------------------------------------------------------------ gezinme
  /** Sayfaya gider. secenek.y: sayfa üstünden pt; secenek.oran: 0..1 sayfa içi oran. */
  sayfayaGit(no, secenek = {}) {
    if (!this.belge) return;
    const onceki = this.gecerli;
    const sayfaOlayi = () => { if (this.gecerli !== onceki) this.dispatchEvent(new CustomEvent('sayfa', { detail: { sayfa: this.gecerli } })); };
    no = Math.max(1, Math.min(this.sayfalar.length, Math.round(no) || 1));
    this._yon = { x: 0, y: 0 };   // programatik kaydırma: yön bilinmez (yonIzle); kaydırma olayı gelmeden çizilen sayfa da ortalı bölge alsın
    if (!this.surekli()) {
      // Tek/iki düzende gösterilen satır gecerli'ye bağlı: önce ata, sonra yerleştir (olay en sonda onceki ile karşılaştırılarak gider)
      this.gecerli = no;
      if (!this.yerlesim[no - 1] || onceki !== no) this.yerlesimHesapla(true);
    }
    const yer = this.yerlesim[no - 1];
    if (!yer) { sayfaOlayi(); return; }
    let ust = yer.y - KENAR / 2;
    if (secenek.y != null) ust = yer.y + secenek.y * this.olcek * CSS_BIRIM - 8;
    else if (secenek.oran) ust = yer.y + secenek.oran * yer.h;
    if (secenek.son) ust = yer.y + yer.h - this.kaydirici.clientHeight + KENAR / 2;
    this.kaydirici.scrollTop = Math.max(0, ust);
    if (secenek.x != null) this.kaydirici.scrollLeft = yer.x + secenek.x * this.olcek * CSS_BIRIM - 16;
    this.gecerli = no;
    this._istenen = { no, st: this.kaydirici.scrollTop, sl: this.kaydirici.scrollLeft };   // kaydırma sınırına dayanılmış olsa da (bkz. kaydirmaIsle)
    this.yonSifirla();
    this.kaydirmaIsle(false);          // gecerli'yi en görünür sayfaya düzeltebilir; olayı aşağıda tek sefer gönder
    sayfaOlayi();
  }

  // İki sayfa düzeninde (kaydırmalı da) önceki/sonraki çifte gidilir. Kaydırmalı düzende gecerli+1 çoğu zaman aynı satırdaki sağ
  // sayfadır: satır zaten görünür olduğu için görünüm kımıldamaz ve geçerli sayfa yeniden sol sayfaya döner (ileri ok çalışmıyordu).
  oncekiSayfa() {
    if (this.ikili()) {
      const k = this.ciftBul(this.gecerli - 1);
      if (k > 0) this.sayfayaGit(this.ciftler()[k - 1][0] + 1);
      return;
    }
    this.sayfayaGit(this.gecerli - 1);
  }

  sonrakiSayfa() {
    if (this.ikili()) {
      const c = this.ciftler(); const k = this.ciftBul(this.gecerli - 1);
      if (k < c.length - 1) this.sayfayaGit(c[k + 1][0] + 1);
      return;
    }
    this.sayfayaGit(this.gecerli + 1);
  }

  /**
   * Sağ/sol ok (yon: 1 | -1). Elle yakınlaştırılmış (serbest/gercek) görünümde görünen sayfalar o yönde pencereden taşıyorsa önce yatay
   * kaydırır; sayfa kenarı görününce sonraki/önceki sayfaya (iki sayfa düzeninde çifte) geçer. Sığdırma modlarında her zaman sayfa
   * çevrilir: oradaki taşma (Görünür alana sığdır'ın kestiği kenar boşluğu, belgedeki daha geniş başka bir sayfa) çevirmeyi engellemesin.
   */
  yatayOk(yon, miktar) {
    const k = this.kaydirici;
    const elle = this.zoomModu === 'serbest' || this.zoomModu === 'gercek';
    if (elle) {
      let sol = Infinity, sag = -Infinity;
      for (const no of this.gorunurSayfalar()) { const y = this.yerlesim[no - 1]; sol = Math.min(sol, y.x); sag = Math.max(sag, y.x + y.w); }
      const pay = yon > 0 ? sag - (k.scrollLeft + k.clientWidth) : k.scrollLeft - sol;
      if (pay >= 1) { k.scrollLeft += yon * Math.min(miktar, pay + KENAR); return; }
    }
    const onceki = this.gecerli;
    if (yon > 0) this.sonrakiSayfa(); else this.oncekiSayfa();
    if (!elle || this.gecerli === onceki) return;
    // Çevrilen sayfa (çift) okuma yönündeki kenarından başlar: ileride sol, geride sağ kenar. Yoksa yatay konum eski kenarda kalır,
    // sonraki her ok yeni sayfanın yalnız o kenarını gösterip hemen bir sayfa daha çevirir.
    let sol = Infinity, sag = -Infinity;
    for (const i of this.ikili() ? this.ciftler()[this.ciftBul(this.gecerli - 1)] : [this.gecerli - 1]) {
      const y = this.yerlesim[i]; if (y) { sol = Math.min(sol, y.x); sag = Math.max(sag, y.x + y.w); }
    }
    if (sol === Infinity) return;
    k.scrollLeft = yon > 0 ? sol - KENAR : sag - k.clientWidth + KENAR;
    if (this._istenen?.no === this.gecerli) this._istenen.sl = k.scrollLeft;   // gidilen sayfa geçerli kalsın (bkz. kaydirmaIsle)
  }

  /**
   * Kaydırmasız (tek/iki) düzende fare tekerleği: görünüm o yönde kenara dayanmışsa sayfa (çift) çevrilir; ileride yeni sayfanın üstü,
   * geride altı görünür (referans okuyucudaki gibi). Dayanmamışsa tarayıcı kaydırır. Bir tekerlek hareketi (arasında 150 ms'den uzun boşluk olmayan
   * olaylar; dokunmatik yüzeyde momentum dahil) en çok bir sayfa çevirir; kenara o hareketle kaydırarak gelindiyse çevirmez (yeni hareket gerekir).
   */
  tekerlekleCevir(e) {
    if (this.surekli() || !this.belge || e.shiftKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    // Yazı düzenleyicisi açıkken ya da sayfadaki bir girdiye yazılırken çevirme (klavyedeki girdideMi gibi): düzenleyici gizlenen
    // sayfada sahipsiz kalır, yazılanlar gider
    const odak = document.activeElement;
    if (this.kaydirici.querySelector('.yazi-duzenleyici') || (this.kaydirici.contains(odak) && (odak.isContentEditable || odak.tagName === 'INPUT' || odak.tagName === 'TEXTAREA'))) return;
    const k = this.kaydirici, yon = e.deltaY > 0 ? 1 : -1, simdi = performance.now();
    const t = this._tekerlek || (this._tekerlek = { son: -Infinity, yon: 0, kaydirdi: false, cevirdi: false, birikim: 0 });
    if (simdi - t.son > 150 || yon !== t.yon) { t.kaydirdi = false; t.cevirdi = false; t.birikim = 0; }   // yeni hareket
    t.son = simdi; t.yon = yon;
    if (t.cevirdi) { e.preventDefault(); return; }       // bu hareket zaten çevirdi: kalanı yeni sayfayı kaydırmasın
    if (yon > 0 ? k.scrollTop < k.scrollHeight - k.clientHeight - 1 : k.scrollTop > 0) { t.kaydirdi = true; return; }
    e.preventDefault();
    if (t.kaydirdi) return;
    t.birikim += Math.abs(e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * k.clientHeight : e.deltaY);
    if (t.birikim < 60) return;
    t.cevirdi = true;
    this.dikeyKaydir(yon);   // kenarda: sonraki/önceki sayfaya (çifte) geçer
  }

  /** Ok tuşuyla dikey kaydırma; tek sayfa düzeninde sayfa sonunda sonraki sayfaya geçer. */
  dikeyKaydir(miktar) {
    const k = this.kaydirici;
    const enAlt = k.scrollHeight - k.clientHeight;
    if (!this.surekli()) {
      // Satır üzerinden karar ver: iki düzende son/ilk çiftin herhangi bir sayfası geçerli olabilir (yoksa görünüm çift başına/sonuna zıplar)
      const satir = this.ikili() ? this.ciftBul(this.gecerli - 1) : this.gecerli - 1;
      const son = this.ikili() ? this.ciftler().length - 1 : this.sayfalar.length - 1;
      if (miktar > 0 && k.scrollTop >= enAlt - 1) {
        if (satir < son) { this.sonrakiSayfa(); k.scrollTop = 0; this.yonSifirla(); }
        return;
      }
      if (miktar < 0 && k.scrollTop <= 0) {
        if (satir > 0) { this.oncekiSayfa(); k.scrollTop = k.scrollHeight; this.yonSifirla(); }
        return;
      }
    }
    k.scrollTop += miktar;
  }

  belgeBasi() { this.sayfayaGit(1); this.kaydirici.scrollTop = 0; }
  belgeSonu() { this.sayfayaGit(this.sayfalar.length, { son: true }); }

  // ------------------------------------------------------------ koordinat dönüşümü
  /** Sayfa üzerindeki görüntü noktasını (px, sayfa elemanına göre) PDF koordinatına (pt, alt-sol köken) çevirir. */
  async pikselToPdf(i, x, y) {
    const p = await this.sayfaAl(i);
    return this.sayfaGorunumu(this.sayfalar[i], this.olcek * CSS_BIRIM, p).convertToPdfPoint(x, y);
  }

  /** PDF koordinatını (pt, alt-sol köken, döndürülmemiş kullanıcı uzayı) sayfa elemanına göre görüntü pikseline çevirir. */
  async pdfToPiksel(i, x, y) {
    const p = await this.sayfaAl(i);
    return this.sayfaGorunumu(this.sayfalar[i], this.olcek * CSS_BIRIM, p).convertToViewportPoint(x, y);
  }

  // ------------------------------------------------------------ kapatma
  yokEt() {
    this.yok = true; this.hazir = false;
    this._kapanis.abort();
    this._gozlemci.disconnect();
    clearTimeout(this._boyutZamanlayici); clearTimeout(this._keskinZaman);
    this._dprSorgu?.removeEventListener('change', this._dprIsle); this._dprSorgu = null;
    document.removeEventListener('mouseup', this._fareBirak);
    window.removeEventListener('pointerup', this._cubukBirak); document.removeEventListener('keydown', this._tusGirdisi, true);
    this._keskinHazirBirak?.();
    this._gorunurKume = new Set(); this._onKuyruk = [];
    for (let i = 0; i < this.sayfalar.length; i++) this.sayfaBosalt(i);
    // Süren yükleme (0.2.1): görev belge yüklenene dek this.belgeler'de değildir; bırakılmazsa işçisi pencere kapanana dek yaşardı
    const gorevler = new Set([this.yuklemeGorevi, ...[...this.belgeler.values()].map((k) => k.gorev)].filter(Boolean));
    for (const gorev of gorevler) { try { gorev.destroy().catch(() => {}); } catch {} }
    for (const k of this.bosBelgeler.values()) { try { k.gorev.destroy().catch(() => {}); } catch {} }
    this.belgeler.clear(); this.bosBelgeler.clear();
    this.yuklemeGorevi = null;
    this.belge = null;
    this.kok.innerHTML = '';
  }
}
