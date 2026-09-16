// Notlar: okuma (referans okuyucu notları dahil), çizim katmanı, etkileşim (seç/taşı/sil/düzenle),
// araçlar (yapışkan not, vurgu, yazı), açılır balon (yazar, tarih, içerik, yanıtlar),
// komut deseniyle geri al/yinele ve kaydetme farkı (diff).
import { CSS_BIRIM, yolAnahtari } from './goruntuleyici.js';
import { Komut } from './komutlar.js';
import { secimDikdortgenleri, satirlaraBirlestir } from './metin.js';
import { turAdi, tarihBicimle } from './panel.js';

export const VURGU_RENKLERI = [
  { ad: 'Sarı', hex: '#ffeb3b' }, { ad: 'Kırmızı', hex: '#ff6e6e' }, { ad: 'Turuncu', hex: '#ffb74d' },
  { ad: 'Yeşil', hex: '#7ee787' }, { ad: 'Mavi', hex: '#7cc4ff' }, { ad: 'Pembe', hex: '#ff9ad5' },
];
export const YAZI_TIPLERI = ['Segoe UI', 'Arial', 'Times New Roman', 'Calibri'];
const TASINABILIR = new Set(['Text', 'FreeText', 'Stamp', 'Square', 'Circle', 'Line', 'Ink', 'Polygon', 'PolyLine', 'FileAttachment', 'Caret']);
const ISARET = new Set(['Highlight', 'Underline', 'StrikeOut', 'Squiggly']);

let sayac = 0;
const yeniId = () => 'n' + Date.now().toString(36) + '_' + (++sayac);
const kacis = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const simdiPdfTarih = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); const o = -d.getTimezoneOffset(); const s = o >= 0 ? '+' : '-'; return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${s}${p(Math.floor(Math.abs(o) / 60))}'${p(Math.abs(o) % 60)}'`; };

export class NotYoneticisi extends EventTarget {
  constructor({ belge, cekirdek, ayar, yigin, alan }) {
    super();
    this.belge = belge;
    this.g = belge.gorunum;
    this.cekirdek = cekirdek;
    this.ayar = ayar;            // () => ayarlar
    this.yigin = yigin;
    this.alan = alan;            // #belge-alani (balon ve çubuklar için)
    this.notlar = new Map();
    this.kayitli = new Map();    // id → JSON anlık görüntü (dosyadaki durum)
    this.secili = null;
    this.arac = null;
    this.balon = null;
    this.balonNotId = null;
    this.balonGecici = false;
    this.pixmapOnbellek = new Map();
    this.duzenleyici = null;     // {not, el, kutu, yeniMi, eskiDurum}
    this._hoverZaman = null;
    this._surukle = null;
    this.yuklendi = false;

    this.g.addEventListener('sayfaCizildi', (e) => this.cizSayfa(e.detail.sayfa));
    this.g.addEventListener('sayfalar', () => this.sayfalarDegisti());
    this.g.addEventListener('yerlesim', () => { this.hepsiniCiz(); this.balonKonumla(); this.duzenleyiciKonumla(); });
    this.g.alan.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.g.alan.addEventListener('dblclick', (e) => this.ciftTik(e));
    this.g.alan.addEventListener('pointerover', (e) => this.pointerOver(e));
    this.g.alan.addEventListener('pointerout', (e) => this.pointerOut(e));
    this.g.alan.addEventListener('mouseup', (e) => setTimeout(() => this.secimCubuguGuncelle(e), 0));
    this.g.kaydirici.addEventListener('scroll', () => { this.balonKonumla(); this.secimCubuguGizle(); }, { passive: true });
  }

  // ------------------------------------------------------------ yükleme ve model
  async yukle() {
    this.notlar.clear();
    await this.kaynakYukle(this.belge.yol);
    this.kayitliAnlikGoruntu();
    this.yuklendi = true;
    this.hepsiniCiz();
    this.dispatchEvent(new CustomEvent('yuklendi'));
  }

  /** Bir kaynak dosyanın notlarını modele ekler (başka PDF'ten sayfa eklenince de çağrılır). */
  async kaynakYukle(yol) {
    const k = yolAnahtari(yol);
    if (this.yuklenenKaynaklar?.has(k)) return;
    (this.yuklenenKaynaklar ||= new Set()).add(k);
    let liste = [];
    try { liste = (await this.cekirdek('notlar', { yol })).notlar; } catch (e) { console.warn('Notlar okunamadı', yol, e); return; }
    const xrefIndex = new Map();
    for (const n of liste) {
      if (n.gizli || n.tur === 'Popup' || n.tur === 'Link' || n.tur === 'Widget') continue;
      const not = { ...n, id: yeniId(), yeni: false, silindi: false, yanitlar: [], ustId: null, kaynak: { yol, sayfa: n.sayfa } };
      this.notlar.set(not.id, not);
      xrefIndex.set(not.xref, not);
    }
    for (const not of xrefIndex.values()) {
      if (not.yanitXref && xrefIndex.has(not.yanitXref)) { const ust = xrefIndex.get(not.yanitXref); ust.yanitlar.push(not.id); not.ustId = ust.id; }
    }
    this.sayfalarDegisti(false);
    if (this.yuklendi) { this.kayitliEkle(xrefIndex.values()); this.hepsiniCiz(); }
  }

  kayitliEkle(notlar) { for (const n of notlar) if (!n.silindi) this.kayitli.set(n.id, this.anlik(n)); }

  /** Sayfa listesi değişince (silme/sıralama/ekleme) notların konumlarını yeniden eşler. */
  sayfalarDegisti(ciz = true) {
    const konum = new Map();
    this.g.sayfalar.forEach((s, i) => { if (!s.bos) { const k = yolAnahtari(s.kaynak.yol) + '#' + s.kaynak.sayfa; if (!konum.has(k)) konum.set(k, i + 1); } });
    for (const n of this.notlar.values()) {
      if (!n.kaynak || n.kaynak.bos) continue;   // boş sayfaya eklenen notlar sayfa nesnesini izler (kaynakGirdi)
      const yeniSayfa = konum.get(yolAnahtari(n.kaynak.yol) + '#' + n.kaynak.sayfa);
      n.sayfaYok = !yeniSayfa;
      if (yeniSayfa) n.sayfa = yeniSayfa;
    }
    for (const n of this.notlar.values()) {
      if (n.kaynakGirdi) { const i = this.g.sayfalar.indexOf(n.kaynakGirdi); n.sayfaYok = i < 0; if (i >= 0) n.sayfa = i + 1; }
    }
    if (ciz) { this.balonKapat(); this.hepsiniCiz(); this.degisti(); }
  }

  /** Özgün dosya anlık kopyaya taşındığında not kaynaklarını yeniden adlandırır. */
  kaynakYeniden(eskiYol, yeniYol) {
    const ek = yolAnahtari(eskiYol);
    for (const n of this.notlar.values()) if (n.kaynak && n.kaynak.yol && yolAnahtari(n.kaynak.yol) === ek) n.kaynak = { ...n.kaynak, yol: yeniYol };
    if (this.yuklenenKaynaklar?.has(ek)) { this.yuklenenKaynaklar.delete(ek); this.yuklenenKaynaklar.add(yolAnahtari(yeniYol)); }
  }

  anlik(not) {
    const { id, yeni, silindi, yanitlar, ustId, kaynak, kaynakGirdi, sayfaYok, sayfa, ...gerisi } = not;
    return JSON.stringify(gerisi);
  }

  kayitliAnlikGoruntu() {
    this.kayitli.clear();
    for (const [id, n] of this.notlar) if (!n.silindi) this.kayitli.set(id, this.anlik(n));
  }

  /** Üst düzey (yanıt olmayan), silinmemiş notlar; sayfa ve konuma göre sıralı. */
  liste() {
    return [...this.notlar.values()].filter((n) => !n.silindi && !n.ustId && !n.sayfaYok).sort((a, b) => a.sayfa - b.sayfa || a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
  }
  sayfaNotlari(sayfa) { return this.liste().filter((n) => n.sayfa === sayfa); }
  yanitlari(not) { return (not.yanitlar || []).map((id) => this.notlar.get(id)).filter((y) => y && !y.silindi).sort((a, b) => (a.olusturma || '').localeCompare(b.olusturma || '')); }

  /** Kaydetme farkı: dosyadaki duruma göre ekle / güncelle / sil işlemleri. */
  fark() {
    const ops = [];
    const sirali = [...this.notlar.values()].sort((a, b) => (a.ustId ? 1 : 0) - (b.ustId ? 1 : 0));   // önce üstler, sonra yanıtlar
    for (const n of sirali) {
      const kay = this.kayitli.get(n.id);
      const not = this.disaAktar(n);
      const kaynak = n.kaynak && n.kaynak.yol ? { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa } : null;
      if (!kay && !n.silindi) { if (!n.sayfaYok) ops.push({ islem: 'ekle', id: n.id, not }); }
      else if (kay && n.silindi) ops.push({ islem: 'sil', id: n.id, xref: n.xref, kaynak, not: { xref: n.xref, sayfa: n.sayfa } });
      else if (kay && this.anlik(n) !== kay) { if (!n.sayfaYok) ops.push({ islem: 'guncelle', id: n.id, xref: n.xref, kaynak, not }); }
    }
    return ops;
  }

  disaAktar(n) {
    const d = { xref: n.xref, tur: n.tur, sayfa: n.sayfa, rect: n.rect, icerik: n.icerik, yazar: n.yazar, renk: n.renk, opaklik: n.opaklik, konu: n.konu };
    if (n.tur === 'Highlight') d.quads = n.quadKutular || quadKutulari(n.quads);
    if (n.tur === 'Text') d.simge = n.simge || 'Comment';
    if (n.tur === 'FreeText') d.yazi = n.yazi;
    if (n.ustId) { const ust = this.notlar.get(n.ustId); if (ust) { if (ust.xref) d.yanitXref = ust.xref; d.yanitId = ust.id; if (ust.kaynak && ust.kaynak.yol) d.yanitKaynak = { yol: ust.kaynak.yol, sayfa: ust.kaynak.sayfa }; } }
    return d;
  }

  get kirli() { return this.fark().length > 0; }

  kaydedildi(xrefler) {
    for (const [id, xref] of Object.entries(xrefler || {})) { const n = this.notlar.get(id); if (n) { n.xref = xref; n.yeni = false; } }
    for (const [id, n] of [...this.notlar]) if (n.silindi) this.notlar.delete(id);
    this.kayitliAnlikGoruntu();
    this.pixmapOnbellek.clear();
    this.degisti();
  }

  degisti() { this.dispatchEvent(new CustomEvent('degisti')); }

  // ------------------------------------------------------------ koordinatlar
  vp(i) { return this.g.viewportAl(i); }
  pdfToPx(i, x, y) {
    const vp = this.vp(i); if (!vp) return [0, 0];
    const view = this.g.sayfalar[i].pdfSayfa.view;
    return vp.convertToViewportPoint(view[0] + x, view[3] - y);
  }
  pxToPdf(i, px, py) {
    const vp = this.vp(i); if (!vp) return [0, 0];
    const view = this.g.sayfalar[i].pdfSayfa.view;
    const [ux, uy] = vp.convertToPdfPoint(px, py);
    return [ux - view[0], view[3] - uy];
  }
  rectToPx(i, r) {
    const a = this.pdfToPx(i, r[0], r[1]), b = this.pdfToPx(i, r[2], r[3]);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
  }
  pxRectToPdf(i, x, y, w, h) {
    const a = this.pxToPdf(i, x, y), b = this.pxToPdf(i, x + w, y + h);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }
  ptPx() { return this.g.olcek * CSS_BIRIM; }

  // ------------------------------------------------------------ çizim
  hepsiniCiz() { for (const s of this.g.sayfalar) if (s.canvas) this.cizSayfa(s.no); }

  cizSayfa(sayfa) {
    const s = this.g.sayfalar[sayfa - 1];
    if (!s || !s.pdfSayfa || !s.canvas || !this.yuklendi) return;
    const katman = s.notKatmani;
    katman.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'not-isaretler');
    katman.append(svg);
    for (const n of this.sayfaNotlari(sayfa)) {
      const el = this.notElemani(n, sayfa - 1, svg);
      if (el && el !== svg) katman.append(el);
    }
    this.seciliIsaretle();
  }

  simgeBoyutu() { return Math.max(24, Math.min(44, 22 * this.g.olcek)); }

  notElemani(n, i, svg) {
    if (ISARET.has(n.tur)) { this.isaretCiz(n, i, svg); return svg; }
    const r = this.rectToPx(i, n.rect);
    const el = document.createElement('div');
    el.dataset.id = n.id;
    el.className = 'not-oge not-' + n.tur.toLowerCase();
    el.title = (n.yazar ? n.yazar + ': ' : '') + (n.icerik || turAdi(n.tur));
    if (n.tur === 'Text') {
      const b = this.simgeBoyutu();
      el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${b}px;height:${b}px;--not-renk:${n.renk || '#ffd000'}`;
      el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h13A2.5 2.5 0 0 1 21 4.5v10a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h-.5A2.5 2.5 0 0 1 3 14.5z" fill="var(--not-renk)" stroke="rgba(0,0,0,.55)" stroke-width="1.2"/><path d="M7 7.5h10M7 11h7" stroke="rgba(0,0,0,.6)" stroke-width="1.4" stroke-linecap="round"/></svg>`;
      return el;
    }
    el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${Math.max(r.w, 4)}px;height:${Math.max(r.h, 4)}px`;
    if (n.tur === 'FreeText' && (n.yeni || n.yazi || !n.ap)) {
      this.freeTextDoldur(el, n);
      return el;
    }
    if (n.ap && n.xref) { this.pixmapYukle(el, n, i); return el; }
    el.classList.add('not-bilinmeyen');
    el.innerHTML = `<span>${kacis(turAdi(n.tur))}</span>`;
    return el;
  }

  freeTextDoldur(el, n) {
    const y = n.yazi || {};
    const k = this.ptPx();
    el.classList.add('not-freetext-yerli');
    el.style.fontFamily = `'${y.tip || 'Segoe UI'}'`;
    el.style.fontSize = ((y.boyut || 12) * k) + 'px';
    el.style.lineHeight = '1.2';
    el.style.color = y.renk || '#000';
    el.style.background = y.arka || 'transparent';
    el.style.fontWeight = y.kalin ? '700' : '400';
    el.style.textDecoration = y.altiCizili ? 'underline' : 'none';
    el.style.border = y.kenarlik ? `${Math.max(1, k)}px solid ${y.kenarlikRengi || y.renk || '#000'}` : 'none';
    el.style.padding = (2 * k) + 'px';
    el.textContent = n.icerik || '';
  }

  async pixmapYukle(el, n, i) {
    const dpr = window.devicePixelRatio || 1;
    const olcek = Math.min(8, this.ptPx() * dpr);
    const anahtar = `${n.xref}@${olcek.toFixed(2)}`;
    let src = this.pixmapOnbellek.get(anahtar);
    if (!src) {
      try {
        if (!n.kaynak || !n.kaynak.yol) { el.classList.add('not-bilinmeyen'); return; }
        const r = await this.cekirdek('not_gorunum', { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa, xref: n.xref, olcek });
        src = 'data:image/png;base64,' + r.png;
        this.pixmapOnbellek.set(anahtar, src);
      } catch (e) { el.classList.add('not-bilinmeyen'); return; }
    }
    if (!el.isConnected) return;
    const img = document.createElement('img');
    img.src = src; img.draggable = false;
    el.append(img);
  }

  isaretCiz(n, i, svg) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.id = n.id;
    g.setAttribute('class', 'not-isaret not-' + n.tur.toLowerCase());
    const renk = n.renk || '#ffeb3b';
    const kutular = n.quadKutular || quadKutulari(n.quads);
    for (const q of kutular.length ? kutular : [n.rect]) {
      const r = this.rectToPx(i, q);
      if (n.tur === 'Highlight') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', r.x); rect.setAttribute('y', r.y); rect.setAttribute('width', r.w); rect.setAttribute('height', r.h);
        rect.setAttribute('fill', renk); rect.setAttribute('fill-opacity', n.opaklik ?? 0.4);
        g.append(rect);
      } else {
        const kal = Math.max(1, r.h * 0.07);
        if (n.tur === 'Squiggly') {
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const y = r.y + r.h - kal; const adim = Math.max(2, r.h * 0.18); let d = `M${r.x} ${y}`; let yukari = true;
          for (let x = r.x + adim; x <= r.x + r.w; x += adim) { d += ` L${x} ${yukari ? y - adim * 0.8 : y}`; yukari = !yukari; }
          p.setAttribute('d', d); p.setAttribute('stroke', renk); p.setAttribute('fill', 'none'); p.setAttribute('stroke-width', kal);
          g.append(p);
        } else {
          const l = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          const y = n.tur === 'Underline' ? r.y + r.h - kal * 1.2 : r.y + r.h * 0.5 - kal / 2;
          l.setAttribute('x', r.x); l.setAttribute('y', y); l.setAttribute('width', r.w); l.setAttribute('height', kal); l.setAttribute('fill', renk);
          g.append(l);
        }
        // Tıklama alanı
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hit.setAttribute('x', r.x); hit.setAttribute('y', r.y); hit.setAttribute('width', r.w); hit.setAttribute('height', r.h); hit.setAttribute('fill', 'transparent');
        g.append(hit);
      }
    }
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = (n.yazar ? n.yazar + ': ' : '') + (n.icerik || turAdi(n.tur));
    g.append(t);
    svg.append(g);
  }

  seciliIsaretle() {
    for (const el of this.g.alan.querySelectorAll('.not-secili')) el.classList.remove('not-secili');
    if (!this.secili) return;
    for (const el of this.g.alan.querySelectorAll(`[data-id="${this.secili}"]`)) el.classList.add('not-secili');
  }

  sec(id) {
    this.secili = id;
    this.seciliIsaretle();
    this.dispatchEvent(new CustomEvent('secim', { detail: { id } }));
  }

  // ------------------------------------------------------------ komutlar
  calistir(ad, uygula, geriAl) {
    const k = new Komut(ad, () => { uygula(); this.degisti(); }, () => { geriAl(); this.degisti(); });
    this.yigin.calistir(k);
    return k;
  }

  ekle(not) {
    not.id = not.id || yeniId(); not.yeni = true; not.silindi = false; not.yanitlar = not.yanitlar || []; not.ustId = not.ustId || null;
    if (!not.kaynak) { const s = this.g.sayfalar[not.sayfa - 1]; if (s) { not.kaynak = s.bos ? { bos: true } : { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa }; not.kaynakGirdi = s; } }
    not.olusturma = not.olusturma || simdiPdfTarih(); not.degisim = not.olusturma;
    this.calistir(`${turAdi(not.tur)} ekle`,
      () => { this.notlar.set(not.id, not); not.silindi = false; if (not.ustId) { const u = this.notlar.get(not.ustId); if (u && !u.yanitlar.includes(not.id)) u.yanitlar.push(not.id); } this.cizSayfa(not.sayfa); },
      () => { not.silindi = true; if (this.secili === not.id) this.sec(null); this.balonKapat(); this.cizSayfa(not.sayfa); });
    return not;
  }

  sil(not) {
    const yanitlar = this.yanitlari(not);
    this.calistir(`${turAdi(not.tur)} sil`,
      () => { not.silindi = true; for (const y of yanitlar) y.silindi = true; if (this.secili === not.id) this.sec(null); this.balonKapat(); this.cizSayfa(not.sayfa); },
      () => { not.silindi = false; for (const y of yanitlar) y.silindi = false; this.cizSayfa(not.sayfa); });
  }

  guncelle(not, yeni, ad = null) {
    const eski = {};
    for (const k of Object.keys(yeni)) eski[k] = structuredClone(not[k]);
    const eskiSayfa = not.sayfa;
    this.calistir(ad || `${turAdi(not.tur)} düzenle`,
      () => { Object.assign(not, structuredClone(yeni)); not.degisim = simdiPdfTarih(); this.pixmapOnbellek.clear(); this.cizSayfa(not.sayfa); if (this.balonNotId === not.id) this.balonYenile(); },
      () => { Object.assign(not, structuredClone(eski)); this.pixmapOnbellek.clear(); this.cizSayfa(eskiSayfa); if (this.balonNotId === not.id) this.balonYenile(); });
  }

  silSecili() {
    if (!this.secili) return false;
    const n = this.notlar.get(this.secili);
    if (!n) return false;
    this.sil(n);
    return true;
  }

  // ------------------------------------------------------------ etkileşim
  sayfaIdx(el) { const s = el.closest?.('.sayfa'); return s ? +s.dataset.sayfa - 1 : -1; }

  pointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.yazi-duzenleyici, .yazi-bicim')) return;
    const hedef = e.target.closest('[data-id]');
    const i = this.sayfaIdx(e.target);
    if (this.duzenleyici && !hedef) { this.duzenleyiciBitir(true); }
    if (this.arac === 'not' && !hedef && i >= 0) { e.preventDefault(); this.yapiskanNotKoy(i, e); return; }
    if (this.arac === 'yazi' && !hedef && i >= 0) { e.preventDefault(); this.yaziBaslat(i, e); return; }
    if (hedef) {
      const id = hedef.dataset.id;
      const n = this.notlar.get(id);
      if (!n) return;
      this.sec(id);
      e.preventDefault();
      if (TASINABILIR.has(n.tur) && !n.kilitli) this.surukleBaslat(n, hedef, e);
      return;
    }
    if (!e.target.closest('.not-balonu, #secim-cubugu')) { if (this.secili) this.sec(null); if (!this.balonGecici) this.balonKapat(); }
  }

  surukleBaslat(n, el, e) {
    const i = n.sayfa - 1;
    const bas = { x: e.clientX, y: e.clientY, left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0, hareket: false };
    const hareket = (e2) => {
      const dx = e2.clientX - bas.x, dy = e2.clientY - bas.y;
      if (!bas.hareket && Math.hypot(dx, dy) < 3) return;
      bas.hareket = true;
      el.style.left = (bas.left + dx) + 'px'; el.style.top = (bas.top + dy) + 'px';
      this.balonKonumla();
    };
    const birak = (e2) => {
      document.removeEventListener('pointermove', hareket); document.removeEventListener('pointerup', birak);
      if (!bas.hareket) return;
      const dx = e2.clientX - bas.x, dy = e2.clientY - bas.y;
      const r = this.rectToPx(i, n.rect);
      const yeniRect = this.pxRectToPdf(i, r.x + dx, r.y + dy, r.w, r.h);
      this.guncelle(n, { rect: yeniRect }, `${turAdi(n.tur)} taşı`);
    };
    document.addEventListener('pointermove', hareket); document.addEventListener('pointerup', birak);
  }

  ciftTik(e) {
    const hedef = e.target.closest('[data-id]');
    if (!hedef) return;
    const n = this.notlar.get(hedef.dataset.id);
    if (!n) return;
    e.preventDefault();
    if (n.tur === 'FreeText') this.yaziDuzenle(n);
    else this.balonAc(n, { odak: true });
  }

  pointerOver(e) {
    const hedef = e.target.closest('[data-id]');
    if (!hedef || this._surukle) return;
    const n = this.notlar.get(hedef.dataset.id);
    if (!n || n.tur === 'FreeText' && (n.yeni || n.yazi)) return;
    clearTimeout(this._hoverZaman);
    this._hoverZaman = setTimeout(() => { if (!this.balon || this.balonGecici) this.balonAc(n, { gecici: true }); }, 450);
  }

  pointerOut(e) {
    const hedef = e.target.closest('[data-id]');
    if (!hedef) return;
    clearTimeout(this._hoverZaman);
    if (this.balonGecici) {
      // Balona geçiliyorsa kapatma
      const iliskili = e.relatedTarget;
      if (iliskili && iliskili.closest && iliskili.closest('.not-balonu')) return;
      setTimeout(() => { if (this.balonGecici && !this.balon?.matches(':hover')) this.balonKapat(); }, 250);
    }
  }

  // ------------------------------------------------------------ balon
  balonAc(n, { gecici = false, odak = false } = {}) {
    this.balonKapat();
    const b = document.createElement('div');
    b.className = 'not-balonu' + (gecici ? ' gecici' : '');
    b.dataset.notId = n.id;
    this.balon = b; this.balonNotId = n.id; this.balonGecici = gecici;
    this.alan.append(b);
    this.balonYenile();
    this.balonKonumla();
    b.addEventListener('mouseleave', () => { if (this.balonGecici) this.balonKapat(); });
    b.addEventListener('mousedown', () => { if (this.balonGecici) { this.balonGecici = false; b.classList.remove('gecici'); } });
    if (odak) { const ta = b.querySelector('textarea.icerik'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
  }

  balonYenile() {
    const b = this.balon; if (!b) return;
    const n = this.notlar.get(this.balonNotId); if (!n || n.silindi) { this.balonKapat(); return; }
    const renk = n.renk || (n.tur === 'FreeText' ? (n.yazi?.renk || '#888') : '#ffd000');
    const yanitlar = this.yanitlari(n);
    b.innerHTML = `
      <div class="ust" style="--not-renk:${kacis(renk)}">
        <span class="renk"></span>
        <span class="tur">${kacis(turAdi(n.tur))}</span>
        <span class="yazar">${kacis(n.yazar || '')}</span>
        <span class="esnek"></span>
        <span class="tarih">${kacis(tarihBicimle(n.degisim || n.olusturma))}</span>
        <button class="ikon kucuk sil" title="Notu sil (Delete)"><svg viewBox="0 0 20 20"><path d="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></button>
        <button class="ikon kucuk kapat" title="Kapat"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5"/></svg></button>
      </div>
      <textarea class="icerik" placeholder="Not yazın…" ${n.kilitli ? 'readonly' : ''}>${kacis(n.icerik || '')}</textarea>
      <div class="yanitlar">${yanitlar.map((y) => `
        <div class="yanit" data-yanit="${y.id}">
          <div class="ust"><span class="yazar">${kacis(y.yazar || '')}</span><span class="esnek"></span><span class="tarih">${kacis(tarihBicimle(y.degisim || y.olusturma))}</span><button class="ikon kucuk yanit-sil" title="Yanıtı sil"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.4"/></svg></button></div>
          <div class="metin">${kacis(y.icerik || '')}</div>
        </div>`).join('')}</div>
      <div class="yanit-kutusu"><input type="text" class="yanit-girdi" placeholder="Yanıt yazın… (Enter)"><button class="ikincil yanitla">Yanıtla</button></div>`;
    const ta = b.querySelector('textarea.icerik');
    let eskiDeger = ta.value;
    const kaydet = () => { if (ta.value !== eskiDeger) { const yeni = ta.value; eskiDeger = yeni; this.guncelle(n, { icerik: yeni }, 'Not metnini düzenle'); } };
    ta.addEventListener('blur', kaydet);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ta.blur(); } e.stopPropagation(); });
    b.querySelector('.sil').addEventListener('click', () => this.sil(n));
    b.querySelector('.kapat').addEventListener('click', () => this.balonKapat());
    const yg = b.querySelector('.yanit-girdi');
    const yanitla = () => {
      const metin = yg.value.trim(); if (!metin) return;
      const yanit = { tur: 'Text', sayfa: n.sayfa, rect: [...n.rect], icerik: metin, yazar: this.ayar().yazarAdi, renk: n.renk || '#ffd000', opaklik: 1, ustId: n.id, simge: 'Comment', konu: 'Yanıt' };
      this.ekle(yanit);
      yg.value = '';
      this.balonYenile();
      this.balon.querySelector('.yanit-girdi')?.focus();
    };
    yg.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') yanitla(); if (e.key === 'Escape') this.balonKapat(); });
    b.querySelector('.yanitla').addEventListener('click', yanitla);
    b.querySelectorAll('.yanit-sil').forEach((btn) => btn.addEventListener('click', () => { const y = this.notlar.get(btn.closest('.yanit').dataset.yanit); if (y) { this.sil(y); this.balonYenile(); } }));
    b.addEventListener('keydown', (e) => e.stopPropagation());
  }

  balonKonumla() {
    const b = this.balon; if (!b) return;
    const n = this.notlar.get(this.balonNotId); if (!n) return;
    const s = this.g.sayfalar[n.sayfa - 1];
    if (!s || !s.pdfSayfa) return;
    const r = this.rectToPx(n.sayfa - 1, ISARET.has(n.tur) ? (n.quadKutular || quadKutulari(n.quads))[0] || n.rect : n.rect);
    const sayfaK = s.el.getBoundingClientRect(), alanK = this.alan.getBoundingClientRect();
    const genis = 300;
    let x = sayfaK.left - alanK.left + r.x + (n.tur === 'Text' ? this.simgeBoyutu() : r.w) + 8;
    let y = sayfaK.top - alanK.top + r.y;
    if (x + genis > alanK.width - 8) x = Math.max(8, sayfaK.left - alanK.left + r.x - genis - 8);
    if (x + genis > alanK.width - 8) x = alanK.width - genis - 8;
    const yuk = b.offsetHeight || 200;
    if (y + yuk > alanK.height - 8) y = Math.max(8, alanK.height - yuk - 8);
    if (y < 8) y = 8;
    b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = genis + 'px';
  }

  balonKapat() {
    if (this.balon) { const ta = this.balon.querySelector('textarea.icerik'); if (ta && document.activeElement === ta) ta.blur(); this.balon.remove(); }
    this.balon = null; this.balonNotId = null; this.balonGecici = false;
  }

  /** Yorumlar panelinden: nota git, seç ve balonu aç. */
  notaGit(id) {
    const n = this.notlar.get(id); if (!n) return;
    const kutu = ISARET.has(n.tur) ? ((n.quadKutular || quadKutulari(n.quads))[0] || n.rect) : n.rect;
    this.g.sayfayaGit(n.sayfa, { y: Math.max(0, kutu[1] - 60) });
    this.sec(id);
    setTimeout(() => this.balonAc(n, {}), 350);
  }

  // ------------------------------------------------------------ araçlar
  aracSec(arac) {
    this.arac = this.arac === arac ? null : arac;
    this.g.alan.classList.toggle('arac-not', this.arac === 'not');
    this.g.alan.classList.toggle('arac-yazi', this.arac === 'yazi');
    this.g.alan.classList.toggle('arac-vurgu', this.arac === 'vurgu');
    this.dispatchEvent(new CustomEvent('arac', { detail: { arac: this.arac } }));
  }

  yapiskanNotKoy(i, e) {
    const sayfaEl = this.g.sayfalar[i].el;
    const k = sayfaEl.getBoundingClientRect();
    const [x, y] = this.pxToPdf(i, e.clientX - k.left, e.clientY - k.top);
    const a = this.ayar();
    const not = { tur: 'Text', sayfa: i + 1, rect: [x, y, x + 20, y + 20], icerik: '', yazar: a.yazarAdi, renk: '#ffd000', opaklik: 1, simge: 'Comment', konu: 'Yapışkan Not' };
    this.ekle(not);
    this.aracSec(null);
    this.sec(not.id);
    this.balonAc(not, { odak: true });
  }

  /** Metin seçiminden vurgu oluşturur (sayfa başına bir not). */
  vurguUygula(renk) {
    const sayfalar = satirlaraBirlestir(secimDikdortgenleri());
    if (!sayfalar.size) return false;
    const a = this.ayar();
    for (const [sayfa, satirlar] of sayfalar) {
      const i = sayfa - 1;
      const kutular = satirlar.map((l) => this.pxRectToPdf(i, l.x0, l.y, l.x1 - l.x0, l.h));
      const rect = [Math.min(...kutular.map((q) => q[0])), Math.min(...kutular.map((q) => q[1])), Math.max(...kutular.map((q) => q[2])), Math.max(...kutular.map((q) => q[3]))];
      this.ekle({ tur: 'Highlight', sayfa, rect, quadKutular: kutular, quads: null, icerik: '', yazar: a.yazarAdi, renk, opaklik: a.vurguOpaklik ?? 0.4, konu: 'Vurgu' });
    }
    window.getSelection()?.removeAllRanges();
    this.secimCubuguGizle();
    return true;
  }

  /** Seçimin başlangıcına yapışkan not koyar (sağ tık → Not ekle). */
  secimeNotKoy() {
    const dik = secimDikdortgenleri();
    if (!dik.length) return false;
    const d = dik[0];
    const i = d.sayfa - 1;
    const [x, y] = this.pxToPdf(i, d.x, d.y);
    const a = this.ayar();
    const not = { tur: 'Text', sayfa: d.sayfa, rect: [x - 22, y, x - 2, y + 20], icerik: '', yazar: a.yazarAdi, renk: '#ffd000', opaklik: 1, simge: 'Comment', konu: 'Yapışkan Not' };
    this.ekle(not);
    window.getSelection()?.removeAllRanges();
    this.secimCubuguGizle();
    this.sec(not.id);
    this.balonAc(not, { odak: true });
    return true;
  }

  secimCubuguGuncelle(e) {
    const sec = window.getSelection();
    const cubuk = this.alan.querySelector('#secim-cubugu');
    if (!cubuk) return;
    if (!sec || sec.isCollapsed || !sec.anchorNode) { this.secimCubuguGizle(); return; }
    const katman = (sec.anchorNode.nodeType === 1 ? sec.anchorNode : sec.anchorNode.parentElement)?.closest('.textLayer');
    if (!katman || !this.g.alan.contains(katman)) { this.secimCubuguGizle(); return; }
    if (this.arac === 'vurgu') { this.vurguUygula(this.ayar().vurguRengi || VURGU_RENKLERI[0].hex); return; }
    const r = sec.getRangeAt(0).getBoundingClientRect();
    const alanK = this.alan.getBoundingClientRect();
    cubuk.hidden = false;
    let x = (e ? e.clientX : r.right) - alanK.left - cubuk.offsetWidth / 2;
    let y = r.bottom - alanK.top + 8;
    x = Math.max(8, Math.min(alanK.width - cubuk.offsetWidth - 8, x));
    if (y + cubuk.offsetHeight > alanK.height - 8) y = r.top - alanK.top - cubuk.offsetHeight - 8;
    cubuk.style.left = x + 'px'; cubuk.style.top = y + 'px';
  }

  secimCubuguGizle() { const c = this.alan.querySelector('#secim-cubugu'); if (c) c.hidden = true; }

  // ------------------------------------------------------------ yazı (FreeText)
  varsayilanYazi() {
    const a = this.ayar();
    return { tip: a.yaziTipi || 'Segoe UI', boyut: a.yaziBoyutu || 12, renk: a.yaziRengi || '#000000', arka: a.yaziArka || null, kalin: false, altiCizili: false, kenarlik: false };
  }

  yaziBaslat(i, e) {
    const sayfaEl = this.g.sayfalar[i].el;
    const k = sayfaEl.getBoundingClientRect();
    const px = e.clientX - k.left, py = e.clientY - k.top;
    const bas = { x: px, y: py };
    const kutu = document.createElement('div');
    kutu.className = 'yazi-cizim';
    kutu.style.cssText = `left:${px}px;top:${py}px;width:0;height:0`;
    sayfaEl.append(kutu);
    let cizildi = false;
    const hareket = (e2) => {
      const x2 = e2.clientX - k.left, y2 = e2.clientY - k.top;
      if (Math.hypot(x2 - bas.x, y2 - bas.y) > 6) cizildi = true;
      kutu.style.left = Math.min(bas.x, x2) + 'px'; kutu.style.top = Math.min(bas.y, y2) + 'px';
      kutu.style.width = Math.abs(x2 - bas.x) + 'px'; kutu.style.height = Math.abs(y2 - bas.y) + 'px';
    };
    const birak = (e2) => {
      document.removeEventListener('pointermove', hareket); document.removeEventListener('pointerup', birak);
      kutu.remove();
      const ptpx = this.ptPx();
      let x = px, y = py, w = 200 * ptpx, h = 44 * ptpx;
      if (cizildi) { x = parseFloat(kutu.style.left); y = parseFloat(kutu.style.top); w = Math.max(40 * ptpx, parseFloat(kutu.style.width)); h = Math.max(20 * ptpx, parseFloat(kutu.style.height)); }
      const rect = this.pxRectToPdf(i, x, y, w, h);
      const a = this.ayar();
      const not = { id: yeniId(), tur: 'FreeText', sayfa: i + 1, rect, icerik: '', yazar: a.yazarAdi, renk: null, opaklik: 1, yazi: this.varsayilanYazi(), yeni: true, silindi: false, yanitlar: [], ustId: null, konu: 'Yazı' };
      this.aracSec(null);
      this.duzenleyiciAc(not, true);
    };
    document.addEventListener('pointermove', hareket); document.addEventListener('pointerup', birak);
  }

  async yaziDuzenle(n) {
    if (n.kilitli) return;
    if (!n.yazi) {
      try { const r = await this.cekirdek('freetext_stil', { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa, xref: n.xref }); n.yazi = r.stil; if (!n.icerik) n.icerik = r.icerik; }
      catch { n.yazi = this.varsayilanYazi(); }
    }
    this.duzenleyiciAc(n, false);
  }

  duzenleyiciAc(n, yeniMi) {
    this.duzenleyiciBitir(true);
    this.balonKapat();
    const i = n.sayfa - 1;
    const sayfaEl = this.g.sayfalar[i].el;
    const r = this.rectToPx(i, n.rect);
    const ta = document.createElement('textarea');
    ta.className = 'yazi-duzenleyici';
    ta.value = n.icerik || '';
    ta.spellcheck = false;
    sayfaEl.append(ta);
    const bicim = document.createElement('div');
    bicim.className = 'yazi-bicim';
    this.alan.append(bicim);
    this.duzenleyici = { not: n, el: ta, bicim, yeniMi, eski: { icerik: n.icerik, yazi: structuredClone(n.yazi), rect: [...n.rect] }, yazi: structuredClone(n.yazi), rect: [...n.rect] };
    // Yerli çizimi gizle (düzenleyici üstte)
    for (const el of sayfaEl.querySelectorAll(`.not-oge[data-id="${n.id}"]`)) el.style.visibility = 'hidden';
    this.duzenleyiciBicimYenile();
    this.duzenleyiciKonumla();
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.duzenleyiciBitir(false); }
    });
    ta.addEventListener('input', () => this.duzenleyiciOtoBoyut());
    // Taşıma (kenar) ve boyutlandırma (sağ alt köşe) tutamaçları
    const tut = document.createElement('div'); tut.className = 'yazi-tutamac'; sayfaEl.append(tut);
    const bt = document.createElement('div'); bt.className = 'yazi-boyut'; sayfaEl.append(bt);
    this.duzenleyici.tut = tut; this.duzenleyici.bt = bt;
    this.duzenleyiciKonumla();
    const surukle = (hedefEl, boyutMu) => (e) => {
      e.preventDefault(); e.stopPropagation();
      const bas = { x: e.clientX, y: e.clientY, rect: [...this.duzenleyici.rect] };
      const hareket = (e2) => {
        const k = this.ptPx();
        const dx = (e2.clientX - bas.x) / k, dy = (e2.clientY - bas.y) / k;
        const rr = bas.rect;
        this.duzenleyici.rect = boyutMu ? [rr[0], rr[1], Math.max(rr[0] + 30, rr[2] + dx), Math.max(rr[1] + 14, rr[3] + dy)] : [rr[0] + dx, rr[1] + dy, rr[2] + dx, rr[3] + dy];
        this.duzenleyiciKonumla();
      };
      const birak = () => { document.removeEventListener('pointermove', hareket); document.removeEventListener('pointerup', birak); };
      document.addEventListener('pointermove', hareket); document.addEventListener('pointerup', birak);
    };
    tut.addEventListener('pointerdown', surukle(tut, false));
    bt.addEventListener('pointerdown', surukle(bt, true));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
  }

  duzenleyiciKonumla() {
    const d = this.duzenleyici; if (!d) return;
    const i = d.not.sayfa - 1;
    const r = this.rectToPx(i, d.rect);
    const k = this.ptPx();
    const y = d.yazi;
    Object.assign(d.el.style, {
      left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px',
      fontFamily: `'${y.tip}'`, fontSize: (y.boyut * k) + 'px', color: y.renk, background: y.arka || 'rgba(255,255,255,0.01)',
      fontWeight: y.kalin ? '700' : '400', textDecoration: y.altiCizili ? 'underline' : 'none',
      border: y.kenarlik ? `${Math.max(1, k)}px solid ${y.renk}` : `1px dashed var(--vurgu)`, padding: (2 * k) + 'px', lineHeight: '1.2',
    });
    if (d.tut) Object.assign(d.tut.style, { left: (r.x - 6) + 'px', top: (r.y - 6) + 'px' });
    if (d.bt) Object.assign(d.bt.style, { left: (r.x + r.w - 5) + 'px', top: (r.y + r.h - 5) + 'px' });
    // Biçim çubuğu: kutunun üstünde
    const sayfaK = this.g.sayfalar[i].el.getBoundingClientRect(), alanK = this.alan.getBoundingClientRect();
    let bx = sayfaK.left - alanK.left + r.x, by = sayfaK.top - alanK.top + r.y - d.bicim.offsetHeight - 8;
    if (by < 4) by = sayfaK.top - alanK.top + r.y + r.h + 8;
    bx = Math.max(4, Math.min(alanK.width - d.bicim.offsetWidth - 4, bx));
    d.bicim.style.left = bx + 'px'; d.bicim.style.top = by + 'px';
  }

  duzenleyiciOtoBoyut() {
    const d = this.duzenleyici; if (!d) return;
    const ta = d.el;
    if (ta.scrollHeight > ta.clientHeight + 1) {
      const k = this.ptPx();
      const ekle = (ta.scrollHeight - ta.clientHeight) / k + 2;
      d.rect = [d.rect[0], d.rect[1], d.rect[2], d.rect[3] + ekle];
      this.duzenleyiciKonumla();
    }
  }

  duzenleyiciBicimYenile() {
    const d = this.duzenleyici; if (!d) return;
    const y = d.yazi;
    d.bicim.innerHTML = `
      <select class="tip" title="Yazı tipi">${YAZI_TIPLERI.map((t) => `<option ${t === y.tip ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input class="boyut" type="number" min="6" max="72" step="1" value="${y.boyut}" title="Boyut (pt)">
      <label class="renk-etiket" title="Yazı rengi"><span class="ornek" style="background:${y.renk}"></span><input class="renk" type="color" value="${y.renk}"></label>
      <label class="renk-etiket" title="Arka plan"><span class="ornek arka" style="background:${y.arka || 'transparent'}"></span><input class="arka" type="color" value="${y.arka || '#ffffff'}"></label>
      <button class="ikon kucuk arka-yok ${y.arka ? '' : 'secili'}" title="Dolgusuz">∅</button>
      <button class="ikon kucuk kalin ${y.kalin ? 'secili' : ''}" title="Kalın"><b>K</b></button>
      <button class="ikon kucuk alti ${y.altiCizili ? 'secili' : ''}" title="Altı çizili"><u>A</u></button>
      <button class="ikon kucuk kenar ${y.kenarlik ? 'secili' : ''}" title="Kenarlık">▢</button>
      <span class="ayrac"></span>
      <button class="ikon kucuk tamam" title="Tamam (dışarı tıkla)"><svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>
      <button class="ikon kucuk iptal" title="Vazgeç (Esc)"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.6"/></svg></button>`;
    const b = d.bicim;
    const uygula = () => { this.duzenleyiciKonumla(); this.duzenleyiciBicimYenile(); d.el.focus(); };
    b.querySelector('.tip').addEventListener('change', (e) => { y.tip = e.target.value; uygula(); });
    b.querySelector('.boyut').addEventListener('change', (e) => { y.boyut = Math.max(6, Math.min(72, +e.target.value || 12)); uygula(); });
    b.querySelector('.renk').addEventListener('input', (e) => { y.renk = e.target.value; this.duzenleyiciKonumla(); b.querySelector('.ornek:not(.arka)').style.background = y.renk; });
    b.querySelector('.arka').addEventListener('input', (e) => { y.arka = e.target.value; this.duzenleyiciKonumla(); b.querySelector('.ornek.arka').style.background = y.arka; b.querySelector('.arka-yok').classList.remove('secili'); });
    b.querySelector('.arka-yok').addEventListener('click', () => { y.arka = null; uygula(); });
    b.querySelector('.kalin').addEventListener('click', () => { y.kalin = !y.kalin; uygula(); });
    b.querySelector('.alti').addEventListener('click', () => { y.altiCizili = !y.altiCizili; uygula(); });
    b.querySelector('.kenar').addEventListener('click', () => { y.kenarlik = !y.kenarlik; uygula(); });
    b.querySelector('.tamam').addEventListener('click', () => this.duzenleyiciBitir(true));
    b.querySelector('.iptal').addEventListener('click', () => this.duzenleyiciBitir(false));
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('keydown', (e) => e.stopPropagation());
  }

  duzenleyiciBitir(kaydet) {
    const d = this.duzenleyici; if (!d) return;
    this.duzenleyici = null;
    const n = d.not;
    const metin = d.el.value;
    d.el.remove(); d.bicim.remove(); d.tut?.remove(); d.bt?.remove();
    const sayfaEl = this.g.sayfalar[n.sayfa - 1].el;
    for (const el of sayfaEl.querySelectorAll(`.not-oge[data-id="${n.id}"]`)) el.style.visibility = '';
    if (!kaydet) { if (!d.yeniMi) this.cizSayfa(n.sayfa); return; }
    if (d.yeniMi) {
      if (!metin.trim()) return;                 // boş yazı eklenmez
      n.icerik = metin; n.yazi = d.yazi; n.rect = d.rect;
      this.ekle(n);
      this.sec(n.id);
      return;
    }
    const degisiklik = {};
    if (metin !== d.eski.icerik) degisiklik.icerik = metin;
    if (JSON.stringify(d.yazi) !== JSON.stringify(d.eski.yazi)) degisiklik.yazi = d.yazi;
    if (JSON.stringify(d.rect) !== JSON.stringify(d.eski.rect)) degisiklik.rect = d.rect;
    if (Object.keys(degisiklik).length) this.guncelle(n, degisiklik, 'Yazıyı düzenle');
    else this.cizSayfa(n.sayfa);
  }

  yokEt() { this.balonKapat(); this.duzenleyiciBitir(false); }
}

/** PyMuPDF vertices (8 nokta/quad: x,y çiftleri, 4 nokta bir quad) → satır kutuları [x0,y0,x1,y1] */
export function quadKutulari(quads) {
  if (!quads || !quads.length) return [];
  const sonuc = [];
  for (let k = 0; k + 3 < quads.length; k += 4) {
    const p = quads.slice(k, k + 4);
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    sonuc.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  return sonuc;
}
