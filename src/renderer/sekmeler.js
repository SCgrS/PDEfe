// Sekme çubuğu: sekme listesi, sürükleyerek sıralama, tekerlekle geçiş, ◀ ▶ düğmeleri,
// "Açık belgeler" listesi ve Ctrl+Tab son-kullanım sırasına göre sekme seçici.

export class SekmeCubugu extends EventTarget {
  constructor({ cubuk, liste, onceki, sonraki, acilir, secici, belgeListesi }) {
    super();
    this.cubuk = cubuk; this.liste = liste; this.secici = secici; this.belgeListesi = belgeListesi;
    this.sekmeler = [];       // {id, ad, yol, el, degisti}
    this.aktifId = null;
    this.mru = [];            // son kullanım sırası (id'ler; en yeni başta)
    this.seciciAcik = false;
    this.seciciIdx = 0;

    // ◀ ▶ basılı tutunca hızlı geçiş
    for (const [dugme, yon] of [[onceki, -1], [sonraki, 1]]) {
      let zaman = null, aralik = null;
      dugme.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        this.kaydir(yon);
        zaman = setTimeout(() => { aralik = setInterval(() => this.kaydir(yon), 180); }, 400);
      });
      const birak = () => { clearTimeout(zaman); clearInterval(aralik); zaman = aralik = null; };
      dugme.addEventListener('mouseup', birak);
      dugme.addEventListener('mouseleave', birak);
    }
    acilir.addEventListener('click', (e) => { e.stopPropagation(); this.belgeListesiAcKapa(); });

    // Sekme çubuğu üzerinde fare tekerleği: sekme değiştir
    liste.addEventListener('wheel', (e) => {
      if (!this.sekmeler.length) return;
      e.preventDefault();
      this.kaydir(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1);
    }, { passive: false });

    document.addEventListener('mousedown', (e) => {
      if (!this.belgeListesi.hidden && !this.belgeListesi.contains(e.target)) this.belgeListesiKapat();
    });
  }

  // ------------------------------------------------------------ temel işlemler
  ekle({ id, ad, yol }) {
    const el = document.createElement('div');
    el.className = 'sekme';
    el.title = yol;
    el.draggable = true;
    el.innerHTML = `<span class="nokta">•</span><span class="ad"></span><button class="kapat" title="Kapat (Ctrl+W)"><svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/></svg></button>`;
    el.querySelector('.ad').textContent = ad;
    const sekme = { id, ad, yol, el, degisti: false };
    this.sekmeler.push(sekme);
    this.liste.append(el);

    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) { e.preventDefault(); this.dispatchEvent(new CustomEvent('kapat', { detail: { id } })); }
      else if (e.button === 0 && !e.target.closest('.kapat')) this.dispatchEvent(new CustomEvent('sec', { detail: { id } }));
    });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    el.querySelector('.kapat').addEventListener('click', (e) => { e.stopPropagation(); this.dispatchEvent(new CustomEvent('kapat', { detail: { id } })); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.dispatchEvent(new CustomEvent('sagTik', { detail: { id } })); });

    // Sürükleyerek sıralama
    el.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/pdefe-sekme', id); el.classList.add('surukleniyor'); });
    el.addEventListener('dragend', () => el.classList.remove('surukleniyor'));
    el.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/pdefe-sekme')) return;
      e.preventDefault();
      const surukleyen = this.liste.querySelector('.surukleniyor');
      if (!surukleyen || surukleyen === el) return;
      const kut = el.getBoundingClientRect();
      const sonra = e.clientX > kut.left + kut.width / 2;
      this.liste.insertBefore(surukleyen, sonra ? el.nextSibling : el);
    });
    el.addEventListener('drop', (e) => {
      if (!e.dataTransfer.types.includes('text/pdefe-sekme')) return;
      e.preventDefault(); e.stopPropagation();
      this.siralamayiOku();
    });

    this.cubuk.hidden = false;
    return sekme;
  }

  siralamayiOku() {
    const sira = [...this.liste.children].map((el) => this.sekmeler.find((s) => s.el === el)).filter(Boolean);
    this.sekmeler = sira;
    this.dispatchEvent(new CustomEvent('siralandi', { detail: { idler: sira.map((s) => s.id) } }));
  }

  kaldir(id) {
    const i = this.sekmeler.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.sekmeler[i].el.remove();
    this.sekmeler.splice(i, 1);
    this.mru = this.mru.filter((x) => x !== id);
    if (!this.sekmeler.length) { this.cubuk.hidden = true; this.aktifId = null; }
  }

  aktifYap(id) {
    this.aktifId = id;
    for (const s of this.sekmeler) s.el.classList.toggle('aktif', s.id === id);
    const s = this.bul(id);
    if (s) s.el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    this.mru = [id, ...this.mru.filter((x) => x !== id)];
  }

  bul(id) { return this.sekmeler.find((s) => s.id === id); }

  guncelle(id, { ad, degisti }) {
    const s = this.bul(id);
    if (!s) return;
    if (ad != null) { s.ad = ad; s.el.querySelector('.ad').textContent = ad; }
    if (degisti != null) { s.degisti = degisti; s.el.classList.toggle('degisti', degisti); }
  }

  /** Bir sonraki/önceki sekmeye (sıra düzenine göre) geç. */
  kaydir(yon) {
    if (!this.sekmeler.length) return;
    const i = this.sekmeler.findIndex((s) => s.id === this.aktifId);
    const j = (i + yon + this.sekmeler.length) % this.sekmeler.length;
    this.dispatchEvent(new CustomEvent('sec', { detail: { id: this.sekmeler[j].id } }));
  }

  /** En son kullanılana göre bir sonraki (Ctrl+Tab'ın kısa basımı). */
  mruSonraki() {
    if (this.mru.length < 2) return null;
    return this.mru[1];
  }

  // ------------------------------------------------------------ Ctrl+Tab seçici
  seciciAc(kucukResim) {
    if (this.sekmeler.length < 2) return;
    this.seciciAcik = true;
    this.seciciIdx = 1;
    this.secici.innerHTML = '<div class="kutu-ic"></div>';
    const ic = this.secici.firstChild;
    this.mru.forEach((id, k) => {
      const s = this.bul(id);
      if (!s) return;
      const a = document.createElement('div');
      a.className = 'aday' + (k === this.seciciIdx ? ' secili' : '');
      a.dataset.id = id;
      a.innerHTML = '<div class="bos"></div><div class="ad"></div>';
      a.querySelector('.ad').textContent = s.ad;
      a.addEventListener('click', () => { this.seciciKapat(id); });
      ic.append(a);
      kucukResim(id).then((src) => {
        if (!src) return;
        const img = document.createElement('img'); img.src = src;
        a.querySelector('.bos')?.replaceWith(img);
      });
    });
    // Kısa basışta (Ctrl hemen bırakılırsa) seçici hiç görünmesin
    this.secici.hidden = true;
    clearTimeout(this._seciciZaman);
    this._seciciZaman = setTimeout(() => { if (this.seciciAcik) this.secici.hidden = false; }, 220);
  }

  seciciIlerle(yon) {
    const adaylar = [...this.secici.querySelectorAll('.aday')];
    if (!adaylar.length) return;
    this.seciciIdx = (this.seciciIdx + yon + adaylar.length) % adaylar.length;
    this.secici.hidden = false;   // ikinci basışta hemen göster
    adaylar.forEach((a, k) => a.classList.toggle('secili', k === this.seciciIdx));
    adaylar[this.seciciIdx].scrollIntoView({ inline: 'nearest' });
  }

  seciciKapat(secilenId = null) {
    if (!this.seciciAcik) return;
    clearTimeout(this._seciciZaman);
    const adaylar = [...this.secici.querySelectorAll('.aday')];
    const id = secilenId ?? adaylar[this.seciciIdx]?.dataset.id;
    this.seciciAcik = false;
    this.secici.hidden = true;
    this.secici.innerHTML = '';
    if (id && id !== this.aktifId) this.dispatchEvent(new CustomEvent('sec', { detail: { id } }));
  }

  // ------------------------------------------------------------ Açık belgeler listesi
  belgeListesiAcKapa() { if (this.belgeListesi.hidden) this.belgeListesiAc(); else this.belgeListesiKapat(); }

  belgeListesiAc() {
    const kut = this.belgeListesi;
    kut.innerHTML = '';
    let arama = null;
    if (this.sekmeler.length > 6) {
      arama = document.createElement('input');
      arama.placeholder = 'Belge ara…';
      kut.append(arama);
    }
    const ul = document.createElement('ul');
    kut.append(ul);
    const doldur = (filtre = '') => {
      ul.innerHTML = '';
      const f = filtre.toLocaleLowerCase('tr');
      for (const s of this.sekmeler) {
        if (f && !s.ad.toLocaleLowerCase('tr').includes(f) && !s.yol.toLocaleLowerCase('tr').includes(f)) continue;
        const li = document.createElement('li');
        li.className = s.id === this.aktifId ? 'aktif' : '';
        li.innerHTML = '<span class="ad"></span><span class="yol"></span>';
        li.querySelector('.ad').textContent = (s.degisti ? '• ' : '') + s.ad;
        li.querySelector('.yol').textContent = s.yol;
        li.addEventListener('click', () => { this.belgeListesiKapat(); this.dispatchEvent(new CustomEvent('sec', { detail: { id: s.id } })); });
        ul.append(li);
      }
    };
    doldur();
    if (arama) {
      arama.addEventListener('input', () => doldur(arama.value));
      arama.addEventListener('keydown', (e) => {
        const ogeler = [...ul.children];
        let i = ogeler.findIndex((li) => li.classList.contains('secili'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          i = e.key === 'ArrowDown' ? Math.min(ogeler.length - 1, i + 1) : Math.max(0, i - 1);
          ogeler.forEach((li, k) => li.classList.toggle('secili', k === i));
        } else if (e.key === 'Enter') { (ogeler[i] || ogeler[0])?.click(); }
        else if (e.key === 'Escape') this.belgeListesiKapat();
      });
    }
    kut.hidden = false;
    if (arama) arama.focus();
  }

  belgeListesiKapat() { this.belgeListesi.hidden = true; this.belgeListesi.innerHTML = ''; }
}
