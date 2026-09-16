// Bul (Ctrl+F): belge alanının sağ üstünde küçük arama penceresi; Türkçe duyarlı arama,
// tüm eşleşmeleri vurgulama, yer imi ve yorumlarda arama, tüm sekmelerde arama.
import { glifDuzelt1e1, trKucuk } from './metin.js';

export class Arama extends EventTarget {
  constructor({ kutu, belgeAl, belgeler, sekmeSec, cekirdek }) {
    super();
    this.kutu = kutu;
    this.belgeAl = belgeAl;          // () => aktif belge
    this.belgeler = belgeler;        // Map id → belge
    this.sekmeSec = sekmeSec;
    this.cekirdek = cekirdek;
    this.ayar = { tamSozcuk: false, buyukKucuk: false, yerimi: false, yorum: false, tumSekmeler: false };
    this.sorgu = '';
    this.sonuclar = [];              // {belgeId, tur:'metin'|'yerimi'|'yorum', sayfa, bas, son, ...}
    this.gecerli = -1;
    this.aramaSayac = 0;
    this.metinOnbellek = new WeakMap();   // gorunum → Map(sayfa → {metin, items})
    this.acik = false;
    this._kur();
  }

  _kur() {
    this.kutu.innerHTML = `
      <input type="text" id="bul-girdi" placeholder="Bul…" spellcheck="false">
      <span class="sayac" id="bul-sayac"></span>
      <button class="ikon" id="bul-onceki" title="Önceki (Shift+Enter, Shift+F3)"><svg viewBox="0 0 20 20"><path d="m5 12 5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
      <button class="ikon" id="bul-sonraki" title="Sonraki (Enter, F3)"><svg viewBox="0 0 20 20"><path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
      <button class="ikon" id="bul-ayar" title="Arama seçenekleri"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" stroke="currentColor" stroke-width="1.4"/></svg></button>
      <button class="ikon" id="bul-kapat" title="Kapat (Esc)"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.6"/></svg></button>
      <div class="ayar-menu" id="bul-ayar-menu" hidden>
        <label><input type="checkbox" data-ayar="tamSozcuk"> Yalnızca tam sözcükler</label>
        <label><input type="checkbox" data-ayar="buyukKucuk"> Büyük-küçük harf duyarlı</label>
        <label><input type="checkbox" data-ayar="yerimi"> Yer imlerini dahil et</label>
        <label><input type="checkbox" data-ayar="yorum"> Yorumları dahil et</label>
        <hr style="border:none;border-top:1px solid var(--kenar);margin:2px 0">
        <label><input type="radio" name="bul-kapsam" data-kapsam="belge" checked> Geçerli belgede ara</label>
        <label><input type="radio" name="bul-kapsam" data-kapsam="tum"> Tüm açık sekmelerde ara</label>
      </div>`;
    const g = this.kutu.querySelector('#bul-girdi');
    this.girdi = g;
    this.sayac = this.kutu.querySelector('#bul-sayac');
    let zaman = null;
    g.addEventListener('input', () => { clearTimeout(zaman); zaman = setTimeout(() => this.ara(g.value), 200); });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (g.value !== this.sorgu) this.ara(g.value); else this.git(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { this.kapat(); }
      else if (e.key === 'F3') { e.preventDefault(); this.git(e.shiftKey ? -1 : 1); }
    });
    this.kutu.querySelector('#bul-onceki').addEventListener('click', () => this.git(-1));
    this.kutu.querySelector('#bul-sonraki').addEventListener('click', () => this.git(1));
    this.kutu.querySelector('#bul-kapat').addEventListener('click', () => this.kapat());
    const menu = this.kutu.querySelector('#bul-ayar-menu');
    this.kutu.querySelector('#bul-ayar').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('mousedown', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target.id !== 'bul-ayar') menu.hidden = true; });
    menu.querySelectorAll('input[data-ayar]').forEach((c) => c.addEventListener('change', () => { this.ayar[c.dataset.ayar] = c.checked; this.ara(this.girdi.value, true); }));
    menu.querySelectorAll('input[data-kapsam]').forEach((c) => c.addEventListener('change', () => { this.ayar.tumSekmeler = menu.querySelector('input[data-kapsam="tum"]').checked; this.ara(this.girdi.value, true); }));
  }

  ac(onSorgu) {
    this.kutu.hidden = false;
    this.acik = true;
    if (onSorgu) this.girdi.value = onSorgu;
    this.girdi.focus(); this.girdi.select();
    if (this.girdi.value && this.girdi.value !== this.sorgu) this.ara(this.girdi.value);
  }

  kapat() {
    this.kutu.hidden = true;
    this.acik = false;
    this.vurgulariTemizle();
    this.sonuclar = []; this.gecerli = -1; this.sorgu = '';
    this.sayac.textContent = '';
    this.belgeAl()?.gorunum.kaydirici.focus();
  }

  // ------------------------------------------------------------ metin dizini
  normalle(s) {
    s = glifDuzelt1e1(s);
    return this.ayar.buyukKucuk ? s : trKucuk(s);
  }

  async sayfaMetni(gorunum, sayfa) {
    let m = this.metinOnbellek.get(gorunum);
    if (!m) { m = new Map(); this.metinOnbellek.set(gorunum, m); }
    if (m.has(sayfa)) return m.get(sayfa);
    const tc = await gorunum.metinIcerigi(sayfa - 1);
    const parcalar = [], konumlar = [];
    let uz = 0;
    tc.items.forEach((it, i) => {
      const s = it.str + (it.hasEOL ? '\n' : '');
      konumlar.push({ bas: uz, son: uz + it.str.length, div: i });
      parcalar.push(s); uz += s.length;
    });
    const kayit = { metin: parcalar.join(''), konumlar };
    m.set(sayfa, kayit);
    return kayit;
  }

  eslesmeleriBul(metin, sorgu) {
    const n = this.normalle(metin), q = this.normalle(sorgu);
    const sonuc = [];
    if (!q) return sonuc;
    let i = 0;
    const harf = (c) => c != null && /[\p{L}\p{N}]/u.test(c);
    while ((i = n.indexOf(q, i)) !== -1) {
      const bitis = i + q.length;
      if (!this.ayar.tamSozcuk || (!harf(n[i - 1]) && !harf(n[bitis]))) sonuc.push([i, bitis]);
      i = bitis;
    }
    return sonuc;
  }

  // ------------------------------------------------------------ arama
  async ara(sorgu, yeniden = false) {
    sorgu = sorgu || '';
    if (!yeniden && sorgu === this.sorgu) return;
    this.sorgu = sorgu;
    const sayac = ++this.aramaSayac;
    this.vurgulariTemizle();
    this.sonuclar = []; this.gecerli = -1;
    if (!sorgu.trim()) { this.sayac.textContent = ''; this.sayac.classList.remove('yok'); return; }
    const aktif = this.belgeAl();
    if (!aktif) return;
    const belgeler = this.ayar.tumSekmeler ? [aktif, ...[...this.belgeler.values()].filter((b) => b !== aktif)] : [aktif];
    this.sayac.textContent = 'aranıyor…'; this.sayac.classList.remove('yok');
    let ilkGidildi = false;
    for (const b of belgeler) {
      const g = b.gorunum;
      const n = g.sayfaSayisi;
      // Geçerli sayfadan başlayarak sıra
      const sira = [];
      const bas = b === aktif ? g.gecerli : 1;
      for (let s = bas; s <= n; s++) sira.push(s);
      for (let s = 1; s < bas; s++) sira.push(s);
      for (const sayfa of sira) {
        if (sayac !== this.aramaSayac) return;
        let kayit;
        try { kayit = await this.sayfaMetni(g, sayfa); } catch { continue; }
        if (sayac !== this.aramaSayac) return;
        const esl = this.eslesmeleriBul(kayit.metin, sorgu);
        if (esl.length) {
          const yeni = esl.map(([bas2, son]) => ({ belgeId: b.id, tur: 'metin', sayfa, bas: bas2, son }));
          this.sonucEkle(yeni, b === aktif);
          this.sayfayiVurgula(g, sayfa);
          if (!ilkGidildi) { ilkGidildi = true; this.gecerli = this.sonuclar.indexOf(yeni[0]); this.gecerliyeGit(); }
          else if (this._yenidenNumarala) { this._yenidenNumarala = false; for (const s2 of g.sayfalar) if (s2.textLayer) this.sayfayiVurgula(g, s2.no); }
          this.sayacYaz(true);
        }
        if (n > 40 && sayfa % 10 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      // Yer imleri
      if (this.ayar.yerimi) {
        try {
          const agac = await g.belge.getOutline();
          const duz = [];
          const gez = (l) => { for (const o of l || []) { duz.push(o); gez(o.items); } };
          gez(agac);
          for (const o of duz) if (this.eslesmeleriBul(o.title || '', sorgu).length) this.sonucEkle([{ belgeId: b.id, tur: 'yerimi', baslik: o.title, dest: o.dest }], false);
        } catch {}
      }
      // Yorumlar
      if (this.ayar.yorum) {
        try {
          const r = await this.cekirdek('notlar', { yol: b.yol });
          for (const nt of r.notlar) if (this.eslesmeleriBul((nt.icerik || '') + ' ' + (nt.yazar || ''), sorgu).length) this.sonucEkle([{ belgeId: b.id, tur: 'yorum', sayfa: nt.sayfa, not: nt }], false);
        } catch {}
      }
      if (sayac !== this.aramaSayac) return;
    }
    if (sayac !== this.aramaSayac) return;
    this.sayacYaz(false);
    if (this.sonuclar.length && this.gecerli < 0) { this.gecerli = 0; this.gecerliyeGit(); }
  }

  sonucEkle(yeni, sirala) {
    const gecerliNesne = this.sonuclar[this.gecerli] || null;
    this.sonuclar.push(...yeni);
    if (sirala) this.sonuclar.sort((a, b) => (a.sayfa || 0) - (b.sayfa || 0) || (a.bas || 0) - (b.bas || 0));
    if (gecerliNesne) this.gecerli = this.sonuclar.indexOf(gecerliNesne);
    // Vurgu numaraları kaydıysa çizili sayfaların vurgularını yenile
    if (sirala && gecerliNesne) this._yenidenNumarala = true;
  }

  sayacYaz(devam) {
    const n = this.sonuclar.length;
    if (!n) { this.sayac.textContent = devam ? 'aranıyor…' : 'Bulunamadı'; this.sayac.classList.toggle('yok', !devam); return; }
    this.sayac.classList.remove('yok');
    this.sayac.textContent = `${this.gecerli + 1} / ${n}${devam ? '…' : ''}`;
  }

  git(yon) {
    if (!this.sonuclar.length) return;
    this.gecerli = (this.gecerli + yon + this.sonuclar.length) % this.sonuclar.length;
    this.gecerliyeGit();
    this.sayacYaz(false);
  }

  async gecerliyeGit() {
    const s = this.sonuclar[this.gecerli];
    if (!s) return;
    const b = this.belgeler.get(s.belgeId);
    if (!b) return;
    if (this.belgeAl() !== b) this.sekmeSec(b.id);
    const g = b.gorunum;
    // Önceki seçili vurguyu kaldır
    document.querySelectorAll('.textLayer .highlight.selected').forEach((e) => e.classList.remove('selected'));
    if (s.tur === 'metin') {
      const yer = g.yerlesim[s.sayfa - 1];
      if (!yer || !g.sayfalar[s.sayfa - 1].textLayer) g.sayfayaGit(s.sayfa);
      // Metin katmanı çizilince vurgular yerleşir; sonra kaydır
      await this.katmanBekle(g, s.sayfa);
      const el = g.sayfalar[s.sayfa - 1].el.querySelector(`.highlight[data-eslesme="${this.sonuclar.indexOf(s)}"]`);
      if (el) {
        el.classList.add('selected');
        const k = g.kaydirici.getBoundingClientRect(), r = el.getBoundingClientRect();
        if (r.top < k.top + 40 || r.bottom > k.bottom - 40 || r.left < k.left || r.right > k.right) {
          g.kaydirici.scrollTop += r.top - k.top - k.height / 2;
          if (r.left < k.left || r.right > k.right) g.kaydirici.scrollLeft += r.left - k.left - k.width / 2;
        }
      }
    } else if (s.tur === 'yerimi') {
      this.dispatchEvent(new CustomEvent('yerimineGit', { detail: { belge: b, oge: s } }));
    } else if (s.tur === 'yorum') {
      g.sayfayaGit(s.sayfa, { y: Math.max(0, s.not.rect[1] - 40) });
      this.dispatchEvent(new CustomEvent('notaGit', { detail: { belge: b, not: s.not } }));
    }
  }

  katmanBekle(g, sayfa) {
    return new Promise((coz) => {
      const s = g.sayfalar[sayfa - 1];
      if (s.textLayer && s.el.querySelector('.textLayer .highlight')) { coz(); return; }
      let deneme = 0;
      const t = setInterval(() => { if ((s.textLayer && s.el.querySelector('.textLayer .highlight')) || ++deneme > 40) { clearInterval(t); coz(); } }, 50);
    });
  }

  // ------------------------------------------------------------ vurgulama
  /** Sayfanın metin katmanına o sayfadaki eşleşmeleri işler (katman çizildiğinde de çağrılır). */
  async sayfayiVurgula(g, sayfa) {
    const s = g.sayfalar[sayfa - 1];
    if (!s.textLayer) return;
    const kayit = this.metinOnbellek.get(g)?.get(sayfa);
    if (!kayit) return;
    const divs = s.textLayer.textDivs;
    const strs = s.textLayer.textContentItemsStr;
    if (!divs || !divs.length) return;
    // Temizle
    divs.forEach((d, i) => { if (d.querySelector('.highlight')) d.textContent = strs[i]; });
    const eslesmeler = this.sonuclar.map((r, idx) => ({ r, idx })).filter((x) => x.r.tur === 'metin' && x.r.belgeId === this.belgeIdOf(g) && x.r.sayfa === sayfa);
    if (!eslesmeler.length) return;
    // Her div için parçalar
    const parcalar = new Map();   // divIdx → [{bas, son, idx}] (div içi konumlar)
    for (const { r, idx } of eslesmeler) {
      for (let i = 0; i < kayit.konumlar.length; i++) {
        const k = kayit.konumlar[i];
        if (k.son <= r.bas) continue;
        if (k.bas >= r.son) break;
        const bas = Math.max(r.bas, k.bas) - k.bas, son = Math.min(r.son, k.son) - k.bas;
        if (son <= bas) continue;
        if (!parcalar.has(k.div)) parcalar.set(k.div, []);
        parcalar.get(k.div).push({ bas, son, idx });
      }
    }
    for (const [divIdx, liste] of parcalar) {
      const div = divs[divIdx]; const metin = strs[divIdx];
      if (!div || metin == null) continue;
      liste.sort((a, b) => a.bas - b.bas);
      div.textContent = '';
      let imlec = 0;
      for (const p of liste) {
        if (p.bas > imlec) div.append(document.createTextNode(metin.slice(imlec, p.bas)));
        const sp = document.createElement('span');
        sp.className = 'highlight' + (p.idx === this.gecerli ? ' selected' : '');
        sp.dataset.eslesme = String(p.idx);
        sp.textContent = metin.slice(p.bas, p.son);
        div.append(sp);
        imlec = p.son;
      }
      if (imlec < metin.length) div.append(document.createTextNode(metin.slice(imlec)));
    }
  }

  belgeIdOf(g) { for (const b of this.belgeler.values()) if (b.gorunum === g) return b.id; return null; }

  vurgulariTemizle() {
    for (const b of this.belgeler.values()) {
      for (const s of b.gorunum.sayfalar) {
        if (!s.textLayer) continue;
        const divs = s.textLayer.textDivs, strs = s.textLayer.textContentItemsStr;
        divs.forEach((d, i) => { if (d.querySelector('.highlight')) d.textContent = strs[i]; });
      }
    }
  }

  /** Görüntüleyici bir sayfanın metin katmanını çizince çağrılır. */
  katmanCizildi(g, sayfa) {
    if (!this.acik || !this.sonuclar.length) return;
    this.sayfayiVurgula(g, sayfa);
  }

  belgeUnut(g) { this.metinOnbellek.delete(g); }
}
