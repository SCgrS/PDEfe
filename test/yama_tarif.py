# -*- coding: utf-8 -*-
"""Görüntüleyiciye sayfa tarifi (yapısal düzen), boş sayfa, koyu sayfa (görsel koruma), bağlantı ve form katmanlarını ekler."""

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:80])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

yama("src/renderer/goruntuleyici.js", [
# --- kurucu
("""export class Goruntuleyici extends EventTarget {
  constructor(kok) {
    super();
    this.kok = kok;""",
 """/** Yol anahtarı: büyük/küçük harf ve eğik çizgi farklarını yok sayar. */
export const yolAnahtari = (yol) => (yol || '').replace(/\\//g, '\\\\').toLowerCase();

/** Boş sayfa için en küçük geçerli PDF (W×H pt). */
function bosPdfBaytlari(w, h) {
  const nesneler = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${w.toFixed(2)} ${h.toFixed(2)}]>>`,
  ];
  let govde = '%PDF-1.4\\n';
  const konumlar = [];
  nesneler.forEach((n, i) => { konumlar.push(govde.length); govde += `${i + 1} 0 obj\\n${n}\\nendobj\\n`; });
  const xref = govde.length;
  govde += `xref\\n0 ${nesneler.length + 1}\\n0000000000 65535 f \\n` + konumlar.map((k) => String(k).padStart(10, '0') + ' 00000 n \\n').join('');
  govde += `trailer\\n<</Size ${nesneler.length + 1}/Root 1 0 R>>\\nstartxref\\n${xref}\\n%%EOF\\n`;
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
    this.kayitliTarif = null;        // son kayıttaki sayfa tarifi (JSON)"""),
# --- yükleme
("""    this.yuklemeGorevi = gorev;
    this.belge = await gorev.promise;
    const n = this.belge.numPages;
    const ilk = await this.belge.getPage(1);
    const vp = ilk.getViewport({ scale: 1 });
    this.sayfalar = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'sayfa';
      el.dataset.sayfa = String(i + 1);
      const katman = document.createElement('div');
      katman.className = 'not-katmani';
      el.append(katman);
      this.sayfalar.push({ no: i + 1, pt: { w: vp.width, h: vp.height }, dondurme: 0, el, notKatmani: katman, canvas: null, textLayer: null, cizim: null, gorev: null, sayfaSozu: i === 0 ? Promise.resolve(ilk) : null, pdfSayfa: i === 0 ? ilk : null, metinOlcek: 0 });
      this.alan.append(el);
    }""",
 """    this.yuklemeGorevi = gorev;
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
    this.kayitliTarif = this.tarifJson();"""),
# --- sayfaAl kaynak duyarlı + yeni yardımcılar
("""  sayfaAl(i) {
    const s = this.sayfalar[i];
    if (!s.sayfaSozu) s.sayfaSozu = this.belge.getPage(i + 1).then((p) => { s.pdfSayfa = p; return p; });
    return s.sayfaSozu;
  }""",
 """  sayfaAl(i) {
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
        if (!s) s = this.girdiOlustur({ bos: true, w, h }, 0, { w, h });
        if (s.dondurme !== (t.dondurme || 0)) { s.dondurme = t.dondurme || 0; this.girdiBosalt(s); }
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
      } else if (s.dondurme !== (t.dondurme || 0)) { s.dondurme = t.dondurme || 0; this.girdiBosalt(s); }
      yeni.push(s);
    }
    return yeni;
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
  }"""),
# --- metinIcerigi boş sayfa
("""  metinIcerigi(i) {
    const s = this.sayfalar[i];
    if (!s.metinSozu) s.metinSozu = this.sayfaAl(i).then((p) => p.getTextContent({ includeMarkedContent: false }));
    return s.metinSozu;
  }""",
 """  metinIcerigi(i) {
    const s = this.sayfalar[i];
    if (s.bos) return Promise.resolve({ items: [], styles: {} });
    if (!s.metinSozu) s.metinSozu = this.sayfaAl(i).then((p) => p.getTextContent({ includeMarkedContent: false }));
    return s.metinSozu;
  }"""),
# --- görünür alana sığdır
("""    if (mod === 'gercek') return 1;
    if (mod === 'genislik' || mod === 'gorunur') return Math.max(EN_KUCUK, vw / genis);""",
 """    if (mod === 'gercek') return 1;
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
    if (mod === 'genislik') return Math.max(EN_KUCUK, vw / genis);"""),
("""  zoomModuAyarla(mod) {
    if (mod === 'serbest') return;
    const sayfa = this.gecerli, oran = this.sayfaIciOran();
    this.zoomModu = mod;
    this.yerlesimHesapla();
    this.sayfayaGit(sayfa, { oran, aninda: true });
    this.kaydirmaIsle();
  }""",
 """  async zoomModuAyarla(mod) {
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
  }"""),
# --- çizim: tuval gösterme (koyu sayfa), bağlantı ve form katmanları
("""    if (this.yok || olcek !== this.olcek) return;
    if (s.canvas) s.canvas.remove();
    s.canvas = canvas;
    s.cizim = { olcek, dondurme, dpr, tam: bolge.tam, fx: bolge.x / yer.w, fy: bolge.y / yer.h, fw: bolge.w / yer.w, fh: bolge.h / yer.h };
    s.el.insertBefore(canvas, s.el.firstChild);
    s.el.classList.remove('yukleniyor');
    s.el.classList.toggle('koyu-sayfa', this.koyuSayfa);
    this.metinKatmaniCiz(i, pdfSayfa, olcek, dondurme).catch((e) => console.error('Metin katmanı', e));
    this.dispatchEvent(new CustomEvent('sayfaCizildi', { detail: { sayfa: i + 1 } }));
  }""",
 """    if (this.yok || olcek !== this.olcek) return;
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
  }"""),
("""  sayfaBosalt(i) {
    const s = this.sayfalar[i];
    if (s.gorev) { try { s.gorev.cancel(); } catch {} s.gorev = null; }
    if (s.canvas) { s.canvas.width = 0; s.canvas.height = 0; s.canvas.remove(); s.canvas = null; }
    s.cizim = null;
    if (s.textLayer) { s.textLayer.cancel(); s.textLayer = null; }
    const tl = s.el.querySelector('.textLayer');
    if (tl) tl.remove();
    s.metinOlcek = 0;
    s.el.classList.remove('yukleniyor');
  }""",
 """  sayfaBosalt(i) { const s = this.sayfalar[i]; if (s) this.girdiBosalt(s); }"""),
("""  koyuSayfaAyarla(deger) {
    this.koyuSayfa = !!deger;
    for (const s of this.sayfalar) s.el.classList.toggle('koyu-sayfa', this.koyuSayfa);
  }""",
 """  koyuSayfaAyarla(deger) {
    this.koyuSayfa = !!deger;
    for (const s of this.sayfalar) if (s.hamCanvas && s.cizim) this.tuvalGoster(s);
  }"""),
# --- yok et: bütün belgeler
("""    if (this.yuklemeGorevi) { this.yuklemeGorevi.destroy().catch(() => {}); this.yuklemeGorevi = null; }
    this.belge = null;
    this.kok.innerHTML = '';""",
 """    for (const k of this.belgeler.values()) { try { k.gorev.destroy().catch(() => {}); } catch {} }
    for (const k of this.bosBelgeler.values()) { try { k.gorev.destroy().catch(() => {}); } catch {} }
    this.belgeler.clear(); this.bosBelgeler.clear();
    this.yuklemeGorevi = null;
    this.belge = null;
    this.kok.innerHTML = '';"""),
])

# CSS: bağlantı ve form katmanları
css = open("src/renderer/stil.css", encoding="utf-8").read()
css = css.replace("""html[data-tema="koyu"] .sayfa.koyu-sayfa canvas.ana { filter: invert(0.92) hue-rotate(180deg); }""",
""".sayfa .baglanti-katmani { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.sayfa .baglanti { position: absolute; display: block; pointer-events: auto; cursor: pointer; border-radius: 2px; }
.sayfa .baglanti:hover { background: rgba(0,103,192,0.12); outline: 1px solid rgba(0,103,192,0.5); }
.sayfa img.form-katmani { position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }""")
open("src/renderer/stil.css", "w", encoding="utf-8").write(css)
print("stil.css güncellendi")
