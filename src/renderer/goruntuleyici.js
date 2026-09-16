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
const ZOOM_ADIMLARI = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

export { pdfjs };

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
    this.kok.innerHTML = '<div class="kaydirici" tabindex="0"><div class="tuval-alani"></div></div>';
    this.kaydirici = kok.querySelector('.kaydirici');
    this.alan = kok.querySelector('.tuval-alani');

    this.belge = null;
    this.sayfalar = [];          // {no, pt:{w,h}, dondurme, el, katman, canvas, textLayer, cizim, gorev, sayfaSozu}
    this.yerlesim = [];          // görüntü koordinatlarında sayfa dikdörtgenleri {x,y,w,h} ya da null (gizli)
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
      s.no = i + 1;
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
    for (let i = 1; i < n && !this.yok; i++) {
      const p = await this.sayfaAl(i);
      if (this.yok) return;
      const vp = p.getViewport({ scale: 1 });
      const s = this.sayfalar[i];
      if (Math.abs(vp.width - s.pt.w) > 0.5 || Math.abs(vp.height - s.pt.h) > 0.5) { s.pt = { w: vp.width, h: vp.height }; degisti = true; }
      if (i % 40 === 0 && degisti) { this.yerlesimHesapla(true); degisti = false; }
    }
    if (degisti) this.yerlesimHesapla(true);
  }

  sayfaAl(i) {
    const s = this.sayfalar[i];
    if (!s.sayfaSozu) s.sayfaSozu = this.kaynakBelgesi(s).then((b) => b.getPage(s.bos ? 1 : s.kaynak.sayfa)).then((p) => { s.pdfSayfa = p; return p; });
    return s.sayfaSozu;
  }

  /** Bir sayfa girdisi (DOM elemanı dahil) oluşturur. kaynak: {yol, sayfa} ya da {bos:true, w, h}. */
  girdiOlustur(kaynak, dondurme, pt) {
    const el = document.createElement('div');
    el.className = 'sayfa';
    const katman = document.createElement('div');
    katman.className = 'not-katmani';
    el.append(katman);
    return { no: 0, kaynak, bos: !!kaynak.bos, pt: { w: pt.w, h: pt.h }, dondurme: dondurme || 0, el, notKatmani: katman, canvas: null, hamCanvas: null, textLayer: null, cizim: null, gorev: null, sayfaSozu: null, pdfSayfa: null, metinOlcek: 0, baglantilar: null, gorselKutulari: null, icerikKutusu: null };
  }

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
        const vp = p.getViewport({ scale: 1 });
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
      s.no = i + 1;
      s.el.dataset.sayfa = String(i + 1);
      this.alan.append(s.el);          // sırayı yeniden kur
      if (!eskiler.has(s)) s.el.style.display = '';
    }
    this.gecerli = sayfa;
    this.yerlesimHesapla(true);
    this.sayfayaGit(sayfa, { aninda: true });
    this.kaydirmaIsle();
    this.dispatchEvent(new CustomEvent('sayfalar', { detail: { sayfa: this.sayfalar.length } }));
  }

  /** Bir girdinin tuval/metin katmanı önbelleğini boşaltır (listede olmasa da). */
  girdiBosalt(s) {
    if (s.gorev) { try { s.gorev.cancel(); } catch {} s.gorev = null; }
    if (s.canvas) { s.canvas.width = 0; s.canvas.height = 0; s.canvas.remove(); s.canvas = null; }
    if (s.hamCanvas) { s.hamCanvas.width = 0; s.hamCanvas.height = 0; s.hamCanvas = null; }
    s.cizim = null;
    if (s.textLayer) { s.textLayer.cancel(); s.textLayer = null; }
    for (const k of s.el.querySelectorAll('.textLayer, .baglanti-katmani, .form-katmani')) k.remove();
    s.metinOlcek = 0;
    s.el.classList.remove('yukleniyor');
  }

  /** Özgün dosya anlık kopyaya taşındığında kaynakları yeniden adlandırır. */
  kaynakYeniden(eskiYol, yeniYol) {
    const ek = yolAnahtari(eskiYol), yk = yolAnahtari(yeniYol);
    const kayit = this.belgeler.get(ek);
    if (kayit) { this.belgeler.delete(ek); kayit.yol = yeniYol; this.belgeler.set(yk, kayit); }
    for (const s of this.sayfalar) if (!s.bos && yolAnahtari(s.kaynak.yol) === ek) s.kaynak = { ...s.kaynak, yol: yeniYol };
    // Yığındaki eski girdiler de aynı nesneleri paylaşır; havuz dışındakiler için de düzelt
    this.kayitliTarif = this.tarifJson();
  }

  /** Eşzamanlı görünüm dönüşümü (sayfa nesnesi yüklüyse); not katmanı için. */
  viewportAl(i) {
    const s = this.sayfalar[i];
    if (!s.pdfSayfa) return null;
    return s.pdfSayfa.getViewport({ scale: this.olcek * CSS_BIRIM, rotation: this.gorunumDondurme + s.dondurme });
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
  /** Sayfanın görüntü boyutu (döndürme dahil), piksel. */
  sayfaBoyutu(i, olcek = this.olcek) {
    const s = this.sayfalar[i];
    const d = ((s.dondurme + this.gorunumDondurme) % 360 + 360) % 360;
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

  /** Sığdırma modları için ölçek hesabı (gecerli sayfa esas alınır). */
  sigdirOlcek(mod) {
    const vw = this.kaydirici.clientWidth - 2 * KENAR;
    const vh = this.kaydirici.clientHeight - 2 * KENAR;
    const idx = Math.max(0, Math.min(this.gecerli - 1, this.sayfalar.length - 1));
    let genis, yuksek;
    if (this.ikili()) {
      const c = this.ciftler()[this.ciftBul(idx)];
      genis = c.reduce((t, i) => t + this.sayfaBoyutu(i, 1).w, 0) + (c.length - 1) * BOSLUK;
      yuksek = Math.max(...c.map((i) => this.sayfaBoyutu(i, 1).h));
      if (c.length === 1 && this.kapakAyri) genis = genis * 2 + BOSLUK;
    } else {
      ({ w: genis, h: yuksek } = this.sayfaBoyutu(idx, 1));
    }
    if (mod === 'gercek') return 1;
    if (mod === 'gorunur') {
      const s = this.sayfalar[idx];
      const k = s?.icerikKutusu;
      if (k && !this.ikili()) {
        const d = ((s.dondurme + this.gorunumDondurme) % 360 + 360) % 360;
        const icerikW = (d % 180 === 0 ? k[2] - k[0] : k[3] - k[1]) * CSS_BIRIM;
        return Math.max(EN_KUCUK, Math.min(EN_BUYUK, vw / Math.max(icerikW + 8, 40)));
      }
      return Math.max(EN_KUCUK, vw / genis);
    }
    if (mod === 'genislik') return Math.max(EN_KUCUK, vw / genis);
    if (mod === 'sayfa') return Math.max(EN_KUCUK, Math.min(vw / genis, vh / yuksek));
    return this.olcek;
  }

  yerlesimHesapla(sessiz = false) {
    if (!this.belge) return;
    if (this.zoomModu !== 'serbest') this.olcek = Math.min(EN_BUYUK, Math.max(EN_KUCUK, this.sigdirOlcek(this.zoomModu)));
    const n = this.sayfalar.length;
    const vw = this.kaydirici.clientWidth;
    this.yerlesim = new Array(n).fill(null);
    let toplamW = 0, y = KENAR;

    const yerlestirSatir = (idxler) => {
      const boyutlar = idxler.map((i) => this.sayfaBoyutu(i));
      const satirW = boyutlar.reduce((t, b) => t + b.w, 0) + (idxler.length - 1) * BOSLUK;
      const satirH = Math.max(...boyutlar.map((b) => b.h));
      toplamW = Math.max(toplamW, satirW + 2 * KENAR);
      return { idxler, boyutlar, satirW, satirH, y };
    };

    const satirlar = [];
    if (this.duzen === 'surekli') {
      for (let i = 0; i < n; i++) { const s = yerlestirSatir([i]); satirlar.push(s); y += s.satirH + BOSLUK; }
    } else if (this.duzen === 'tek') {
      const s = yerlestirSatir([this.gecerli - 1]); satirlar.push(s); y += s.satirH + BOSLUK;
    } else if (this.duzen === 'ikiSurekli') {
      for (const c of this.ciftler()) { const s = yerlestirSatir(c); satirlar.push(s); y += s.satirH + BOSLUK; }
    } else if (this.duzen === 'iki') {
      const c = this.ciftler()[this.ciftBul(this.gecerli - 1)];
      const s = yerlestirSatir(c); satirlar.push(s); y += s.satirH + BOSLUK;
    }
    const alanW = Math.max(vw, toplamW);
    const alanH = y - BOSLUK + KENAR;
    this.alan.style.width = alanW + 'px';
    this.alan.style.height = alanH + 'px';

    // Sayfaları yerleştir
    for (const s of satirlar) {
      let x = (alanW - s.satirW) / 2;
      // Kapak ayrıysa tek sayfalık ilk satırı sağ tarafa hizala (referans okuyucu gibi)
      if (this.ikili() && this.kapakAyri && s.idxler.length === 1 && s.idxler[0] === 0) x = alanW / 2 + BOSLUK / 2;
      s.idxler.forEach((i, k) => {
        const b = s.boyutlar[k];
        this.yerlesim[i] = { x, y: s.y, w: b.w, h: b.h };
        x += b.w + BOSLUK;
      });
    }
    for (let i = 0; i < n; i++) {
      const s = this.sayfalar[i];
      const yer = this.yerlesim[i];
      if (!yer) { if (s.el.style.display !== 'none') { s.el.style.display = 'none'; this.sayfaBosalt(i); } continue; }
      s.el.style.display = '';
      s.el.style.left = yer.x + 'px'; s.el.style.top = yer.y + 'px';
      s.el.style.width = yer.w + 'px'; s.el.style.height = yer.h + 'px';
      s.el.style.setProperty('--total-scale-factor', String(this.olcek * CSS_BIRIM));
      // Var olan tuvali yeni boyuta gerdir (yeniden çizilene kadar)
      if (s.canvas && s.cizim) {
        const c = s.cizim;
        s.canvas.style.left = (c.fx * yer.w) + 'px'; s.canvas.style.top = (c.fy * yer.h) + 'px';
        s.canvas.style.width = (c.fw * yer.w) + 'px'; s.canvas.style.height = (c.fh * yer.h) + 'px';
      }
    }
    if (!sessiz) this.dispatchEvent(new CustomEvent('zoom', { detail: { olcek: this.olcek, mod: this.zoomModu } }));
    this.dispatchEvent(new CustomEvent('yerlesim'));
  }

  boyutDegisti() {
    if (!this.belge) return;
    clearTimeout(this._boyutZamanlayici);
    this._boyutZamanlayici = setTimeout(() => {
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
    return Math.max(0, (this.kaydirici.scrollTop - yer.y) / yer.h);
  }

  // ------------------------------------------------------------ kaydırma ve görünürlük
  kaydirmaIsle() {
    if (!this.belge || this.yok) return;
    const vt = this.kaydirici.scrollTop, vl = this.kaydirici.scrollLeft;
    const vh = this.kaydirici.clientHeight, vw = this.kaydirici.clientWidth;
    const ustSinir = vt - vh, altSinir = vt + 2 * vh;     // ön yükleme bandı
    const uzakUst = vt - 3 * vh, uzakAlt = vt + 4 * vh;    // bunun dışındakiler boşaltılır
    let enIyi = -1, enIyiAlan = -1;
    for (let i = 0; i < this.sayfalar.length; i++) {
      const yer = this.yerlesim[i];
      if (!yer) continue;
      const alt = yer.y + yer.h;
      if (alt >= ustSinir && yer.y <= altSinir) {
        this.sayfaCizPlanla(i);
      } else if (alt < uzakUst || yer.y > uzakAlt) {
        this.sayfaBosalt(i);
      }
      // görünür alan hesabı (geçerli sayfa)
      const gy = Math.max(0, Math.min(alt, vt + vh) - Math.max(yer.y, vt));
      const gx = Math.max(0, Math.min(yer.x + yer.w, vl + vw) - Math.max(yer.x, vl));
      const a = gx * gy;
      if (a > enIyiAlan) { enIyiAlan = a; enIyi = i; }
    }
    if (enIyi >= 0 && enIyi + 1 !== this.gecerli) {
      this.gecerli = enIyi + 1;
      this.dispatchEvent(new CustomEvent('sayfa', { detail: { sayfa: this.gecerli } }));
    }
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
    const s = this.sayfalar[i];
    if (this.cizimGerekliMi(i)) {
      s.el.classList.add('yukleniyor');
      clearTimeout(s._zaman);
      s._zaman = setTimeout(() => this.sayfaCiz(i), s.canvas ? 120 : 0);
    }
  }

  /** Çizilmesi gereken bölge (sayfa yerel piksel koordinatı). */
  bolgeHesapla(i) {
    const yer = this.yerlesim[i];
    const dpr = window.devicePixelRatio || 1;
    if (yer.w * yer.h * dpr * dpr <= EN_FAZLA_PIKSEL) return { x: 0, y: 0, w: yer.w, h: yer.h, tam: true };
    const vt = this.kaydirici.scrollTop, vl = this.kaydirici.scrollLeft;
    const vh = this.kaydirici.clientHeight, vw = this.kaydirici.clientWidth;
    let x = vl - yer.x - vw * 0.5, y = vt - yer.y - vh * 0.5, w = vw * 2, h = vh * 2;
    x = Math.max(0, x); y = Math.max(0, y);
    w = Math.min(yer.w - x, w); h = Math.min(yer.h - y, h);
    return { x, y, w, h, tam: false };
  }

  cizimGerekliMi(i) {
    const s = this.sayfalar[i];
    const yer = this.yerlesim[i];
    if (!yer) return false;
    if (!s.canvas || !s.cizim) return true;
    const c = s.cizim;
    if (c.olcek !== this.olcek || c.dondurme !== this.gorunumDondurme + s.dondurme || c.dpr !== (window.devicePixelRatio || 1)) return true;
    if (c.tam) return false;
    // Bölgesel çizim: görünür kısım çizili bölgenin içinde mi?
    const vt = this.kaydirici.scrollTop, vl = this.kaydirici.scrollLeft;
    const vh = this.kaydirici.clientHeight, vw = this.kaydirici.clientWidth;
    const gx0 = Math.max(0, vl - yer.x), gy0 = Math.max(0, vt - yer.y);
    const gx1 = Math.min(yer.w, vl + vw - yer.x), gy1 = Math.min(yer.h, vt + vh - yer.y);
    const cx0 = c.fx * yer.w, cy0 = c.fy * yer.h, cx1 = cx0 + c.fw * yer.w, cy1 = cy0 + c.fh * yer.h;
    return !(gx0 >= cx0 - 1 && gy0 >= cy0 - 1 && gx1 <= cx1 + 1 && gy1 <= cy1 + 1);
  }

  async sayfaCiz(i) {
    const s = this.sayfalar[i];
    const yer = this.yerlesim[i];
    if (!yer || this.yok) return;
    if (!this.cizimGerekliMi(i)) { s.el.classList.remove('yukleniyor'); return; }
    if (s.gorev) { try { s.gorev.cancel(); } catch {} s.gorev = null; }
    const olcek = this.olcek, dondurme = this.gorunumDondurme + s.dondurme;
    const dpr = window.devicePixelRatio || 1;
    const bolge = this.bolgeHesapla(i);
    const pdfSayfa = await this.sayfaAl(i);
    if (this.yok || olcek !== this.olcek || this.yerlesim[i] !== yer) return;

    const viewport = pdfSayfa.getViewport({ scale: olcek * CSS_BIRIM * dpr, rotation: dondurme });
    const canvas = document.createElement('canvas');
    canvas.className = 'ana';
    canvas.width = Math.max(1, Math.ceil(bolge.w * dpr));
    canvas.height = Math.max(1, Math.ceil(bolge.h * dpr));
    canvas.style.left = bolge.x + 'px'; canvas.style.top = bolge.y + 'px';
    canvas.style.width = bolge.w + 'px'; canvas.style.height = bolge.h + 'px';
    const ctx = canvas.getContext('2d', { alpha: false });
    const gorev = pdfSayfa.render({
      canvasContext: ctx, viewport,
      transform: [1, 0, 0, 1, -Math.round(bolge.x * dpr), -Math.round(bolge.y * dpr)],
      annotationMode: pdfjs.AnnotationMode.DISABLE,
    });
    s.gorev = gorev;
    try {
      await gorev.promise;
    } catch (e) {
      if (e instanceof pdfjs.RenderingCancelledException) return;
      console.error('Sayfa çizilemedi', i + 1, e);
      return;
    } finally {
      if (s.gorev === gorev) s.gorev = null;
    }
    if (this.yok || olcek !== this.olcek) return;
    s.cizim = { olcek, dondurme, dpr, tam: bolge.tam, fx: bolge.x / yer.w, fy: bolge.y / yer.h, fw: bolge.w / yer.w, fh: bolge.h / yer.h, bolge };
    if (s.hamCanvas) { s.hamCanvas.width = 0; s.hamCanvas.height = 0; }
    s.hamCanvas = canvas;
    this.tuvalGoster(s);
    s.el.classList.remove('yukleniyor');
    if (!s.bos) {
      this.metinKatmaniCiz(i, pdfSayfa, olcek, dondurme).catch((e) => console.error('Metin katmanı', e));
      this.ekKatmanlar(i, pdfSayfa, olcek, dondurme).catch((e) => console.warn('Ek katmanlar', e));
    }
    this.dispatchEvent(new CustomEvent('sayfaCizildi', { detail: { sayfa: i + 1 } }));
  }

  /** Ham tuvali (gerekirse koyu sayfa dönüşümüyle, görselleri koruyarak) DOM'a yerleştirir. */
  tuvalGoster(s) {
    const ham = s.hamCanvas;
    if (!ham || !s.cizim) return;
    const b = s.cizim.bolge;
    let goster = ham;
    if (this.koyuSayfa) {
      goster = document.createElement('canvas');
      goster.width = ham.width; goster.height = ham.height;
      const ctx = goster.getContext('2d', { alpha: false });
      ctx.filter = 'invert(0.92) hue-rotate(180deg)';
      ctx.drawImage(ham, 0, 0);
      ctx.filter = 'none';
      // Görselleri özgün renginde geri çiz
      const kutular = s.gorselKutulari;
      if (kutular && kutular.length && s.pdfSayfa) {
        const dpr = s.cizim.dpr;
        const vp = s.pdfSayfa.getViewport({ scale: s.cizim.olcek * CSS_BIRIM * dpr, rotation: s.cizim.dondurme });
        const view = s.pdfSayfa.view;
        for (const k of kutular) {
          const p1 = vp.convertToViewportPoint(view[0] + k[0], view[3] - k[1]);
          const p2 = vp.convertToViewportPoint(view[0] + k[2], view[3] - k[3]);
          const x = Math.min(p1[0], p2[0]) - b.x * dpr, y = Math.min(p1[1], p2[1]) - b.y * dpr;
          const w = Math.abs(p2[0] - p1[0]), h = Math.abs(p2[1] - p1[1]);
          if (w < 1 || h < 1) continue;
          ctx.drawImage(ham, x, y, w, h, x, y, w, h);
        }
      } else if (!kutular && this.cekirdek && !s.bos) {
        // Kutular henüz bilinmiyor: getir ve sonra yeniden birleştir
        this.cekirdek('gorsel_kutulari', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa }).then((r) => { s.gorselKutulari = r.kutular || []; if (this.koyuSayfa && s.hamCanvas === ham) this.tuvalGoster(s); }).catch(() => { s.gorselKutulari = []; });
      }
    }
    goster.className = 'ana';
    goster.style.left = b.x + 'px'; goster.style.top = b.y + 'px';
    goster.style.width = b.w + 'px'; goster.style.height = b.h + 'px';
    if (s.canvas && s.canvas !== ham) { s.canvas.remove(); if (s.canvas !== s.hamCanvas) { s.canvas.width = 0; } }
    else if (s.canvas) s.canvas.remove();
    s.canvas = goster;
    s.el.insertBefore(goster, s.el.firstChild);
  }

  /** Bağlantı (Link) ve form alanı (Widget) katmanları. */
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
      const r = await this.cekirdek('form_gorunum', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, olcek: Math.min(6, olcek * CSS_BIRIM * dpr) });
      if (!r || !r.png) { s.formYok = true; return; }
      if (this.yok || s.cizim?.olcek !== olcek) return;
      s.el.querySelector('.form-katmani')?.remove();
      const img = document.createElement('img');
      img.className = 'form-katmani'; img.src = 'data:image/png;base64,' + r.png; img.draggable = false;
      s.el.insertBefore(img, s.el.querySelector('.textLayer') || s.notKatmani);
    } catch { s.formYok = true; }
  }

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
    katman.addEventListener('mousedown', () => katman.classList.add('selecting'));
    document.addEventListener('mouseup', () => katman.classList.remove('selecting'), { once: false });
    this.dispatchEvent(new CustomEvent('metinKatmani', { detail: { sayfa: i + 1 } }));
  }

  sayfaBosalt(i) { const s = this.sayfalar[i]; if (s) this.girdiBosalt(s); }

  hepsiniYenidenCiz() {
    for (let i = 0; i < this.sayfalar.length; i++) this.sayfaBosalt(i);
    this.kaydirmaIsle();
  }

  koyuSayfaAyarla(deger) {
    this.koyuSayfa = !!deger;
    for (const s of this.sayfalar) if (s.hamCanvas && s.cizim) this.tuvalGoster(s);
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
    if (mod === 'gorunur') await this.icerikKutusuAl(sayfa - 1);
    this.zoomModu = mod;
    this.yerlesimHesapla();
    this.sayfayaGit(sayfa, { oran, aninda: true });
    if (mod === 'gorunur') {
      const s = this.sayfalar[sayfa - 1];
      if (s?.icerikKutusu && s.pdfSayfa) {
        const vp = this.viewportAl(sayfa - 1);
        const [x] = vp.convertToViewportPoint(s.pdfSayfa.view[0] + s.icerikKutusu[0], s.pdfSayfa.view[3] - s.icerikKutusu[1]);
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
    this.duzen = duzen; this.kapakAyri = kapakAyri;
    this.yerlesimHesapla();
    this.sayfayaGit(sayfa, { oran: this.surekli() ? oran : 0, aninda: true });
    this.kaydirmaIsle();
  }

  dondur(derece) {
    const sayfa = this.gecerli, oran = this.sayfaIciOran();
    this.gorunumDondurme = ((this.gorunumDondurme + derece) % 360 + 360) % 360;
    for (let i = 0; i < this.sayfalar.length; i++) this.sayfaBosalt(i);
    this.yerlesimHesapla();
    this.sayfayaGit(sayfa, { oran, aninda: true });
    this.kaydirmaIsle();
  }

  // ------------------------------------------------------------ gezinme
  /** Sayfaya gider. secenek.y: sayfa üstünden pt; secenek.oran: 0..1 sayfa içi oran. */
  sayfayaGit(no, secenek = {}) {
    if (!this.belge) return;
    no = Math.max(1, Math.min(this.sayfalar.length, Math.round(no) || 1));
    if (!this.surekli()) {
      const eski = this.gecerli;
      this.gecerli = no;
      if (!this.yerlesim[no - 1] || eski !== no) this.yerlesimHesapla(true);
    }
    const yer = this.yerlesim[no - 1];
    if (!yer) return;
    let ust = yer.y - KENAR / 2;
    if (secenek.y != null) ust = yer.y + secenek.y * this.olcek * CSS_BIRIM - 8;
    else if (secenek.oran) ust = yer.y + secenek.oran * yer.h;
    if (secenek.son) ust = yer.y + yer.h - this.kaydirici.clientHeight + KENAR / 2;
    this.kaydirici.scrollTop = Math.max(0, ust);
    if (secenek.x != null) this.kaydirici.scrollLeft = yer.x + secenek.x * this.olcek * CSS_BIRIM - 16;
    if (this.gecerli !== no) { this.gecerli = no; this.dispatchEvent(new CustomEvent('sayfa', { detail: { sayfa: no } })); }
    this.kaydirmaIsle();
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
      if (miktar > 0 && k.scrollTop >= enAlt - 1) {
        if (this.gecerli < this.sayfalar.length) { this.sonrakiSayfa(); k.scrollTop = 0; }
        return;
      }
      if (miktar < 0 && k.scrollTop <= 0) {
        if (this.gecerli > 1) { this.oncekiSayfa(); k.scrollTop = k.scrollHeight; }
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
    const vp = p.getViewport({ scale: this.olcek * CSS_BIRIM, rotation: this.gorunumDondurme + this.sayfalar[i].dondurme });
    return vp.convertToPdfPoint(x, y);
  }

  async pdfToPiksel(i, x, y) {
    const p = await this.sayfaAl(i);
    const vp = p.getViewport({ scale: this.olcek * CSS_BIRIM, rotation: this.gorunumDondurme + this.sayfalar[i].dondurme });
    return vp.convertToViewportPoint(x, y);
  }

  // ------------------------------------------------------------ kapatma
  yokEt() {
    this.yok = true;
    this._gozlemci.disconnect();
    for (let i = 0; i < this.sayfalar.length; i++) this.sayfaBosalt(i);
    for (const k of this.belgeler.values()) { try { k.gorev.destroy().catch(() => {}); } catch {} }
    for (const k of this.bosBelgeler.values()) { try { k.gorev.destroy().catch(() => {}); } catch {} }
    this.belgeler.clear(); this.bosBelgeler.clear();
    this.yuklemeGorevi = null;
    this.belge = null;
    this.kok.innerHTML = '';
  }
}
