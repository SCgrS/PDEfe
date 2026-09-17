// Belge görüntüleyici: PDF.js ile tembel (lazy) sayfa çizimi, yakınlaştırma, sayfa düzenleri.
// Her sekmenin kendi Goruntuleyici örneği vardır.
import * as pdfjs from '../../node_modules/pdfjs-dist/build/pdf.min.mjs';

const KAYNAK = new URL('../../node_modules/pdfjs-dist/', import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = KAYNAK + 'build/pdf.worker.min.mjs';

export const CSS_BIRIM = 96 / 72;        // 1 pt = 1.333 css px (PDF.js görüntüleyicisiyle aynı)
const BOSLUK = 12;                        // sayfalar arası boşluk (px)
const KENAR = 16;                         // kenar boşluğu (px)
const EN_KUCUK = 0.25, EN_BUYUK = 64;     // %25 – %6400
const EN_FAZLA_PIKSEL = 24e6;             // tek tuvalde en fazla piksel; üstünde bölgesel çizim
const BOLGE_PAYI = 0.25;                  // bölgesel çizimde görünür alanın her yanına eklenen pay (görünür boyutun oranı)
const ONIZLEME_ESIGI = 6e6;               // bundan büyük (cihaz pikseli) ilk çizimlerde önce önizleme
const ONIZLEME_PIKSEL = 1.5e6;            // önizleme tuvalinin en fazla piksel sayısı
const KOYU_YER_TUTUCU = 'rgb(20, 20, 20)'; // beyazın invert(0.92) karşılığı: koyu sayfada henüz çizilmemiş sayfanın rengi
const ZOOM_ADIMLARI = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

export { pdfjs };

// Görsel kalitesi: PDF.js (pdf.mjs getImageSmoothingEnabled) bir görsel pixelRatio*96/72 katından fazla büyütülerek
// çizildiğinde bağlamın imageSmoothingEnabled özelliğini false yapıyor (endGroup'ta da false atıyor). Sonuç: yakınlaştırınca
// ya da düşük çözünürlüklü taranmış belgelerde fotoğraflar en yakın komşu örneklemesiyle pikselli görünür. PDF.js bu
// özelliği yalnızca atamayla kullandığı için (pdf.min.mjs'te 3 atama) prototipteki ayarlayıcıyı değiştiriyoruz: her atamada
// yumuşatma açık kalır ve kalite 'high' olur. Okuyucu özgündür; aynı süreçteki bütün 2B tuvalleri etkiler.
const ozgunYumusatma = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'imageSmoothingEnabled');
if (ozgunYumusatma?.configurable && ozgunYumusatma.get && ozgunYumusatma.set) {
  Object.defineProperty(CanvasRenderingContext2D.prototype, 'imageSmoothingEnabled', {
    configurable: true, enumerable: ozgunYumusatma.enumerable, get: ozgunYumusatma.get,
    set(_deger) { ozgunYumusatma.set.call(this, true); this.imageSmoothingQuality = 'high'; },
  });
}

/** Cihaz piksel oranı (CSS px başına cihaz pikseli). */
const pikselOrani = () => window.devicePixelRatio || 1;
/** Değeri cihaz pikseli ızgarasına oturtur (CSS px). */
const izgaraya = (v, dpr) => Math.round(v * dpr) / dpr;
/** Tuvalin belleğini hemen bırakır. */
const tuvalBirak = (c) => { c.width = 0; c.height = 0; };
/** Açıyı 0..359'a indirger. */
const aciyaIndir = (d) => ((d % 360) + 360) % 360;
/** PDF.js sayfa nesnesinin taban döndürmesi (sayfa sözlüğündeki /Rotate, 0/90/180/270); sayfa nesnesi yoksa 0. */
const tabanAl = (pdfSayfa) => aciyaIndir(pdfSayfa?.rotate || 0);

/** Yol anahtarı: büyük/küçük harf ve eğik çizgi farklarını yok sayar. */
export const yolAnahtari = (yol) => (yol || '').replace(/\//g, '\\').toLowerCase();

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
    this.koyuSayfa = false;
    this.yok = false;
    this._cizimZamanlayici = null;
    this._boyutZamanlayici = null;

    this.kaydirici.addEventListener('scroll', () => this.kaydirmaIsle(), { passive: true });
    this.kaydirici.addEventListener('wheel', (e) => this.tekerlek(e), { passive: false });
    this._gozlemci = new ResizeObserver(() => this.boyutDegisti());
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
    const gorev = pdfjs.getDocument({
      data: veri,
      cMapUrl: KAYNAK + 'cmaps/', cMapPacked: true,
      standardFontDataUrl: KAYNAK + 'standard_fonts/',
      wasmUrl: KAYNAK + 'wasm/', iccUrl: KAYNAK + 'iccs/',
      enableXfa: false, isEvalSupported: false,
      password: secenek.parola,
    });
    if (secenek.parolaIste) gorev.onPassword = (cb, neden) => secenek.parolaIste(neden).then((p) => cb(p), () => cb(new Error('vazgeçildi')));
    this.yuklemeGorevi = gorev;
    this.belge = await gorev.promise;
    this.yol = secenek.yol || null;
    this.belgeler.set(yolAnahtari(this.yol), { yol: this.yol, belge: this.belge, gorev });
    const n = this.belge.numPages;
    const ilk = await this.belge.getPage(1);
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
    this.yerlesimHesapla();
    if (secenek.sayfa && secenek.sayfa > 1) this.sayfayaGit(secenek.sayfa, { aninda: true });
    this.kaydirmaIsle();
    this.dispatchEvent(new CustomEvent('hazir'));
    this.sayfaBoyutlariniYukle();
    return this.belge;
  }

  /** Bütün sayfaların gerçek boyutlarını arka planda öğrenir; farklıysa yerleşimi yeniler. */
  async sayfaBoyutlariniYukle() {
    const n = this.sayfalar.length;
    let degisti = false;
    // Yeni pt'lerle yerleşimi kurar; geçerli sayfa ve sayfa içi oran korunur (boyutDegisti gibi: scrollTop olduğu gibi kalırsa görünüm
    // başka sayfaya kayar, yanlış sayfa kaydedilirdi). Gizli sekmede (boyut 0) atlanır: sigdirOlcek %25 verirdi; sekme gösterilince
    // boyutDegisti oranı eski (scrollTop ile tutarlı) yerleşimden alıp yeni pt'lerle kurar. Boyutu değişen görünür sayfalar yeniden planlanır.
    const yenile = () => {
      degisti = false;
      if (this.yok || !this.kaydirici.clientWidth || !this.kaydirici.clientHeight) return;
      const sayfa = this.gecerli, oran = this.sayfaIciOran();
      this.yerlesimHesapla(true);
      this.sayfayaGit(sayfa, { oran, aninda: true });
      this.kaydirmaIsle();
    };
    for (let i = 1; i < n && !this.yok; i++) {
      const p = await this.sayfaAl(i);
      if (this.yok) return;
      const vp = p.getViewport({ scale: 1 });   // varsayılan döndürme page.rotate: pt taban (/Rotate) dahil
      const s = this.sayfalar[i];
      if (Math.abs(vp.width - s.pt.w) > 0.5 || Math.abs(vp.height - s.pt.h) > 0.5) { s.pt = { w: vp.width, h: vp.height }; degisti = true; }
      if (i % 40 === 0 && degisti) yenile();
    }
    if (degisti) yenile();
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
    const gorev = pdfjs.getDocument({ data: veri, cMapUrl: KAYNAK + 'cmaps/', cMapPacked: true, standardFontDataUrl: KAYNAK + 'standard_fonts/', wasmUrl: KAYNAK + 'wasm/', iccUrl: KAYNAK + 'iccs/', enableXfa: false, isEvalSupported: false });
    const belge = await gorev.promise;
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
    s.hedef = null;                    // süren çizim sonucunu bırakır
    if (s.gorev) { try { s.gorev.cancel(); } catch {} s.gorev = null; }
    const katmanVar = !!(s.cizim || s.textLayer || s.metinOlcek);
    if (s.canvas) { tuvalBirak(s.canvas); s.canvas.remove(); s.canvas = null; }
    if (s.hamCanvas) { tuvalBirak(s.hamCanvas); s.hamCanvas = null; }
    s.cizim = null;
    if (s.textLayer) { s.textLayer.cancel(); s.textLayer = null; }
    if (katmanVar) for (const k of s.el.querySelectorAll('.textLayer, .baglanti-katmani, .form-katmani')) k.remove();
    s.metinOlcek = 0;
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

  /** Düzenin satırları: tek sütunlu (tek/surekli) → [[0],[1],…], ikili (iki/ikiSurekli) → ciftler(). */
  satirlar() {
    if (this.ikili()) return this.ciftler();
    return Array.from({ length: this.sayfalar.length }, (_, i) => [i]);
  }

  /** Sığdırma modları için ölçek hesabı (varsayılan: gecerli sayfa; komşu satırın ölçeği için başka sayfa verilebilir). */
  sigdirOlcek(mod, sayfaIdx = this.gecerli - 1) {
    const vw = this.kaydirici.clientWidth - 2 * KENAR;
    const vh = this.kaydirici.clientHeight - 2 * KENAR;
    const idx = Math.max(0, Math.min(sayfaIdx, this.sayfalar.length - 1));
    let genis, yuksek, bosluk = 0;       // bosluk: satırdaki sabit (ölçekle büyümeyen) sayfa arası boşluk, px
    if (this.ikili()) {
      const c = this.ciftler()[this.ciftBul(idx)];
      genis = c.reduce((t, i) => t + this.sayfaBoyutu(i, 1).w, 0);
      bosluk = (c.length - 1) * BOSLUK;
      yuksek = Math.max(...c.map((i) => this.sayfaBoyutu(i, 1).h));
      if (c.length === 1 && this.kapakAyri) { genis *= 2; bosluk = BOSLUK; }
    } else {
      ({ w: genis, h: yuksek } = this.sayfaBoyutu(idx, 1));
    }
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
   * Verilen satırları (sayfa indeks dizileri) üst üste yerleştirir; bütün dikdörtgenler cihaz pikseli ızgarasına oturur
   * (tuval CSS boyutu cihaz pikseline tam denk gelsin, yeniden örnekleme bulanıklığı olmasın).
   * Döner: {yerler: [[i, {x,y,w,h,olcek}]], alanW, alanH}
   */
  satirlariYerlestir(satirlar, olcek, vw, vh, dpr) {
    let toplamW = 0, y = KENAR;
    const olculer = satirlar.map((idxler) => {
      const boyutlar = idxler.map((i) => { const b = this.sayfaBoyutu(i, olcek); return { w: izgaraya(b.w, dpr), h: izgaraya(b.h, dpr) }; });
      const satirW = boyutlar.reduce((t, b) => t + b.w, 0) + (idxler.length - 1) * BOSLUK;
      const satirH = Math.max(...boyutlar.map((b) => b.h));
      toplamW = Math.max(toplamW, satirW + 2 * KENAR);
      const r = { idxler, boyutlar, satirW, y: izgaraya(y, dpr) };
      y = r.y + satirH + BOSLUK;
      return r;
    });
    // Izgaraya yuvarlama sığdırılmış satırı görünür alandan 1 px'ten az taşırabilir: bu kadarlık taşmada kaydırma çubuğu
    // çıkıp görünür boyut (ve sığdırma ölçeği) değişmesin diye alan görünür boyutta tutulur
    const alanW = toplamW - vw < 1 ? vw : toplamW;
    let alanH = y - BOSLUK + KENAR;
    if (alanH > vh && alanH - vh < 1) alanH = vh;
    const yerler = [];
    for (const r of olculer) {
      let x = (alanW - r.satirW) / 2;
      // Kapak ayrıysa tek sayfalık ilk satırı sağ tarafa hizala (referans okuyucu gibi)
      if (this.ikili() && this.kapakAyri && r.idxler.length === 1 && r.idxler[0] === 0) x = alanW / 2 + BOSLUK / 2;
      r.idxler.forEach((i, k) => {
        const b = r.boyutlar[k];
        x = izgaraya(x, dpr);
        yerler.push([i, { x, y: r.y, w: b.w, h: b.h, olcek }]);
        x += b.w + BOSLUK;
      });
    }
    return { yerler, alanW, alanH };
  }

  /** Görünürde (yerlesim) ya da ön çizim için sanal olarak (onYerlesim) sayfanın yeri; yoksa null. */
  yerAl(i) { return this.yerlesim[i] || this.onYerlesim[i] || null; }

  yerlesimHesapla(sessiz = false) {
    if (!this.belge) return;
    const eskiOlcek = this.olcek;
    const sinirla = (o) => Math.min(EN_BUYUK, Math.max(EN_KUCUK, o));
    if (this.zoomModu !== 'serbest') this.olcek = sinirla(this.sigdirOlcek(this.zoomModu));
    const n = this.sayfalar.length;
    const vw = this.kaydirici.clientWidth, vh = this.kaydirici.clientHeight, dpr = pikselOrani();
    const tumSatirlar = this.satirlar();
    const satirNo = new Int32Array(n);
    tumSatirlar.forEach((r, k) => { for (const i of r) satirNo[i] = k; });
    const gk = n ? satirNo[Math.max(0, Math.min(this.gecerli - 1, n - 1))] : 0;
    const gosterilen = this.surekli() ? tumSatirlar : (tumSatirlar[gk] ? [tumSatirlar[gk]] : []);

    const { yerler, alanW, alanH } = this.satirlariYerlestir(gosterilen, this.olcek, vw, vh, dpr);
    this.yerlesim = new Array(n).fill(null);
    for (const [i, yer] of yerler) this.yerlesim[i] = yer;
    this.alan.style.width = alanW + 'px';
    this.alan.style.height = alanH + 'px';

    // Tek/iki düzende önceki/sonraki satırın, gösterildiğinde alacağı yerleşimin aynısı (y=KENAR, ortalı, kendi sığdırma ölçeği)
    this.onYerlesim = new Array(n).fill(null);
    this._onIdx = [];
    if (!this.surekli()) {
      for (const k of [gk - 1, gk + 1]) {
        const satir = tumSatirlar[k];
        if (!satir) continue;
        const olcek = this.zoomModu !== 'serbest' ? sinirla(this.sigdirOlcek(this.zoomModu, satir[0])) : this.olcek;
        for (const [i, yer] of this.satirlariYerlestir([satir], olcek, vw, vh, dpr).yerler) { yer.sanal = true; this.onYerlesim[i] = yer; this._onIdx.push(i); }
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
    const ustSinir = vt - vh, altSinir = vt + 2 * vh;     // ön yükleme bandı
    const uzakUst = vt - 3 * vh, uzakAlt = vt + 4 * vh;    // bunun dışındakiler boşaltılır
    let enIyi = -1, enIyiAlan = -1;
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
    }
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
  sayfaCizPlanla(i) {
    const s = this.sayfalar[i], yer = this.yerAl(i);
    if (!s || !yer) return;
    if (!this.cizimGerekliMi(i)) { this.gereksizCizimiBirak(s, i, yer); return; }
    if (s.hedef && this.yeterliMi(i, s.hedef, yer)) return;   // süren çizim yeterli: yeniden başlatma (kaydırırken iptal fırtınası olmasın)
    s.el.classList.add('yukleniyor');
    clearTimeout(s._zaman);
    s._planli = true;
    s._zaman = setTimeout(() => {
      s._planli = false;
      const j = this.idx(s);
      if (j >= 0 && !this.yok) this.sayfaCiz(j);
    }, s.canvas ? 120 : 0);
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
    // Görünür alan + her yandan BOLGE_PAYI; sayfaya kırpılır, bölge sayfanın dışına taşmaz (h negatif olamaz)
    const { vt, vl, vw, vh } = this.gorunurKisim(yer);
    const w = izgaraya(Math.min(yer.w, vw * (1 + 2 * BOLGE_PAYI)), dpr);
    const h = izgaraya(Math.min(yer.h, vh * (1 + 2 * BOLGE_PAYI)), dpr);
    const x = izgaraya(Math.max(0, Math.min(vl - yer.x - vw * BOLGE_PAYI, yer.w - w)), dpr);
    const y = izgaraya(Math.max(0, Math.min(vt - yer.y - vh * BOLGE_PAYI, yer.h - h)), dpr);
    return { x, y, w, h, tam: false };
  }

  /**
   * Çizim tanımı c (bitmiş s.cizim ya da süren s.hedef) şu anki yer için yeterli mi?
   * Önizleme hiçbir zaman yeterli değildir; ölçek, döndürme, piksel oranı ve boyut aynı olmalı; bölgeselde görünür kısmı kapsamalı.
   */
  yeterliMi(i, c, yer) {
    const s = this.sayfalar[i];
    if (!c || !s || c.onizleme) return false;
    if (c.olcek !== yer.olcek || c.dondurme !== this.toplamDondurme(s) || c.dpr !== pikselOrani()) return false;
    if (Math.abs(c.w - yer.w) > 1e-3 || Math.abs(c.h - yer.h) > 1e-3) return false;
    if (c.tam) return true;
    const g = this.gorunurKisim(yer), b = c.bolge;
    return g.x0 >= b.x - 1 && g.y0 >= b.y - 1 && g.x1 <= b.x + b.w + 1 && g.y1 <= b.y + b.h + 1;
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
      && this.toplamDondurme(s) === hedef.dondurme && pikselOrani() === hedef.dpr;
  }

  /** Sayfanın b bölgesini (CSS px) oran (tuval pikseli / CSS px) çözünürlüğünde yeni bir tuvale çizer (dondurme: mutlak, toplamDondurme). İptal/hata: null. */
  async tuvalCiz(s, pdfSayfa, olcek, dondurme, oran, b) {
    const px = Math.round(b.x * oran), py = Math.round(b.y * oran);
    const canvas = document.createElement('canvas');
    canvas.className = 'ana';
    canvas.width = Math.max(1, Math.round(b.w * oran));
    canvas.height = Math.max(1, Math.round(b.h * oran));
    const viewport = pdfSayfa.getViewport({ scale: olcek * CSS_BIRIM * oran, rotation: dondurme });
    const gorev = pdfSayfa.render({
      canvasContext: canvas.getContext('2d', { alpha: false }), viewport,
      transform: [1, 0, 0, 1, -px, -py],
      annotationMode: pdfjs.AnnotationMode.DISABLE,
    });
    s.gorev = gorev;
    try {
      await gorev.promise;
      return { canvas, px, py };
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
      if (s.gorev) { try { s.gorev.cancel(); } catch {} s.gorev = null; }
      const dpr = pikselOrani();
      const bolge = this.bolgeHesapla(i, yer);
      // dondurme mutlaktır (taban dahil). Sayfa nesnesi henüz yüklenmemişse taban 0 varsayılır ve yüklenince düzeltilir; beklerken
      // görünüm döndürmesi değişirse girdiBosalt hedefi zaten düşürür (girdinin kendi döndürmesi değişmez)
      hedef = { olcek: yer.olcek, dondurme: this.toplamDondurme(s), dpr, oran: dpr, w: yer.w, h: yer.h, tam: bolge.tam, onizleme: false, bolge };
      s.hedef = hedef;
      const pdfSayfa = await this.sayfaAl(i);
      hedef.dondurme = this.toplamDondurme(s, tabanAl(pdfSayfa));
      if (!gecerliMi()) return;
      const dondurme = hedef.dondurme;

      // Pahalı ilk çizim: önce düşük çözünürlüklü tam sayfa önizleme (gerilmiş gösterilir), sonra tam çizim onun yerini alır
      if (!s.canvas && !s.bos && bolge.w * bolge.h * dpr * dpr > ONIZLEME_ESIGI) {
        const oran = Math.min(dpr, Math.sqrt(ONIZLEME_PIKSEL / (yer.w * yer.h)));
        const tamSayfa = { x: 0, y: 0, w: yer.w, h: yer.h };
        const on = await this.tuvalCiz(s, pdfSayfa, hedef.olcek, dondurme, oran, tamSayfa);
        if (!on) return;                                                // iptal ya da hata
        if (!gecerliMi()) { tuvalBirak(on.canvas); return; }
        if (s.canvas) tuvalBirak(on.canvas);
        else this.cizimUygula(s, on.canvas, { ...hedef, oran, tam: true, onizleme: true, bolge: tamSayfa, px: 0, py: 0 });
      }

      const son = await this.tuvalCiz(s, pdfSayfa, hedef.olcek, dondurme, dpr, bolge);
      if (!son) return;
      if (!gecerliMi()) { tuvalBirak(son.canvas); return; }   // çizerken boyut/ölçek değişti: yanlış boyutlu tuvali gösterme
      const c = son.canvas;
      // CSS kutusu tuvalin cihaz pikseli boyutundan türetilir: 1 tuval pikseli = 1 cihaz pikseli
      this.cizimUygula(s, c, { ...hedef, px: son.px, py: son.py, bolge: { x: son.px / dpr, y: son.py / dpr, w: c.width / dpr, h: c.height / dpr } });
      s.el.classList.remove('yukleniyor');
      const j = this.idx(s);
      if (!s.bos) {
        this.metinKatmaniCiz(j, pdfSayfa, hedef.olcek, dondurme).catch((e) => console.error('Metin katmanı', e));
        this.ekKatmanlar(j, pdfSayfa, hedef.olcek, dondurme).catch((e) => console.warn('Ek katmanlar', e));
      }
      this.dispatchEvent(new CustomEvent('sayfaCizildi', { detail: { sayfa: j + 1 } }));
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
      ctx.filter = 'invert(0.92) hue-rotate(180deg)';
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
    const eski = s.el.querySelector('.textLayer');
    if (eski) eski.remove();
    const katman = document.createElement('div');
    katman.className = 'textLayer';
    s.el.insertBefore(katman, s.notKatmani);
    const icerik = await this.metinIcerigi(i);
    if (this.yok || s.el.querySelector('.textLayer') !== katman) return;
    const tl = new pdfjs.TextLayer({ textContentSource: icerik, container: katman, viewport });
    s.textLayer = tl; s.metinOlcek = olcek; s.metinDondurme = dondurme;
    await tl.render();
    if (s.textLayer !== tl) return;
    const son = document.createElement('div');
    son.className = 'endOfContent';
    katman.append(son);
    katman.addEventListener('mousedown', () => katman.classList.add('selecting'));   // kaldırma: kurucudaki _fareBirak
    this.dispatchEvent(new CustomEvent('metinKatmani', { detail: { sayfa: i + 1 } }));
  }

  sayfaBosalt(i) { const s = this.sayfalar[i]; if (s) this.girdiBosalt(s); }

  hepsiniYenidenCiz() {
    for (let i = 0; i < this.sayfalar.length; i++) this.sayfaBosalt(i);
    this.kaydirmaIsle();
  }

  koyuSayfaAyarla(deger) {
    this.koyuSayfa = !!deger;
    for (const s of this.sayfalar) { this.yerTutucuRengi(s); if (s.hamCanvas && s.cizim) this.tuvalGoster(s); }
  }

  // ------------------------------------------------------------ yakınlaştırma
  tekerlek(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const kut = this.kaydirici.getBoundingClientRect();
    const sabit = { x: e.clientX - kut.left, y: e.clientY - kut.top };
    const adim = Math.exp(-e.deltaY * 0.0015);
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
    if (mod === 'gorunur') {
      const s = this.sayfalar[sayfa - 1];
      if (s?.icerikKutusu && s.pdfSayfa) {
        const vp = this.viewportAl(sayfa - 1), view = s.pdfSayfa.view, k = s.icerikKutusu;
        // Döndürülmüş sayfada kutunun ekrandaki sol kenarı başka köşeden gelir: karşıt iki köşenin küçük x'i
        const x = Math.min(vp.convertToViewportPoint(view[0] + k[0], view[3] - k[1])[0], vp.convertToViewportPoint(view[0] + k[2], view[3] - k[3])[0]);
        const yer = this.yerlesim[sayfa - 1];
        if (yer) this.kaydirici.scrollLeft = Math.max(0, yer.x + x - 4);
      }
    }
    this.kaydirmaIsle();
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
  duzenAyarla(duzen, kapakAyri = this.kapakAyri) {
    const sayfa = this.gecerli, oran = this.sayfaIciOran();
    // Tek sayfalıdan iki sayfalıya geçiş: elle seçilmiş yakınlaştırma ("Gerçek boyut" dahil) çift pencereye sığmaz → sayfayı sığdır.
    // Sığdırma modları (genislik/sayfa/gorunur) yeni düzene kendiliğinden uyar.
    const ikiliyeGecis = !this.ikili() && (duzen === 'iki' || duzen === 'ikiSurekli');
    if (ikiliyeGecis && (this.zoomModu === 'serbest' || this.zoomModu === 'gercek')) this.zoomModu = 'sayfa';
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
    this.kaydirmaIsle(false);          // gecerli'yi en görünür sayfaya düzeltebilir; olayı aşağıda tek sefer gönder
    sayfaOlayi();
  }

  oncekiSayfa() {
    if (this.ikili() && !this.surekli()) {
      const k = this.ciftBul(this.gecerli - 1);
      if (k > 0) this.sayfayaGit(this.ciftler()[k - 1][0] + 1);
      return;
    }
    this.sayfayaGit(this.gecerli - 1);
  }

  sonrakiSayfa() {
    if (this.ikili() && !this.surekli()) {
      const c = this.ciftler(); const k = this.ciftBul(this.gecerli - 1);
      if (k < c.length - 1) this.sayfayaGit(c[k + 1][0] + 1);
      return;
    }
    this.sayfayaGit(this.gecerli + 1);
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
        if (satir < son) { this.sonrakiSayfa(); k.scrollTop = 0; }
        return;
      }
      if (miktar < 0 && k.scrollTop <= 0) {
        if (satir > 0) { this.oncekiSayfa(); k.scrollTop = k.scrollHeight; }
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
    this.yok = true;
    this._gozlemci.disconnect();
    clearTimeout(this._boyutZamanlayici);
    this._dprSorgu?.removeEventListener('change', this._dprIsle); this._dprSorgu = null;
    document.removeEventListener('mouseup', this._fareBirak);
    this._gorunurKume = new Set(); this._onKuyruk = [];
    for (let i = 0; i < this.sayfalar.length; i++) this.sayfaBosalt(i);
    for (const k of this.belgeler.values()) { try { k.gorev.destroy().catch(() => {}); } catch {} }
    for (const k of this.bosBelgeler.values()) { try { k.gorev.destroy().catch(() => {}); } catch {} }
    this.belgeler.clear(); this.bosBelgeler.clear();
    this.yuklemeGorevi = null;
    this.belge = null;
    this.kok.innerHTML = '';
  }
}
