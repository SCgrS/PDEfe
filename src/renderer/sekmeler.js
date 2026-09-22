// Sekme çubuğu: sekme listesi, sürükleyerek sıralama, tekerlekle geçiş, ◀ ▶ düğmeleri,
// "Açık belgeler" listesi ve Ctrl+Tab son-kullanım sırasına göre sekme seçici.

/** Sekmenin ipucu: sabit genişlikte kısalabilen tam ad ve dosyanın yolu. */
const ipucu = (ad, yol) => (yol && yol !== ad ? `${ad}\n${yol}` : ad);

export class SekmeCubugu extends EventTarget {
  constructor({ cubuk, liste, onceki, sonraki, acilir, secici, belgeListesi, aramaSay = null }) {
    super();
    this.cubuk = cubuk; this.liste = liste; this.secici = secici; this.belgeListesi = belgeListesi;
    // (id, sorgu, { iptal }) => Promise<number>: "Açık belgeler" listesinde belge içi eşleşme sayısı; verilmezse liste ada göre süzülür
    this.aramaSay = typeof aramaSay === 'function' ? aramaSay : null;
    this.listeNo = 0;         // açık listenin/sorgunun kimliği; geç gelen eski sayımları ayıklar
    this.listeZaman = null;
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
      // Açılır düğme hariç: yoksa mousedown kapatır, ardından gelen click listeyi yeniden açar
      if (!this.belgeListesi.hidden && !this.belgeListesi.contains(e.target) && !acilir.contains(e.target)) this.belgeListesiKapat();
    });
  }

  // ------------------------------------------------------------ temel işlemler
  ekle({ id, ad, yol }) {
    if (!this.belgeListesi.hidden) this.belgeListesiKapat();   // açık liste sekme kümesini bir kez kurar; bayat kalmasın
    const el = document.createElement('div');
    el.className = 'sekme';
    el.title = ipucu(ad, yol);
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
    // Liste açıkken (ör. Ctrl+W) kapanan belgenin satırı kalmasın; kapatma listeNo'yu artırıp süren sayımları da iptal eder
    if (!this.belgeListesi.hidden) this.belgeListesiKapat();
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

  /** Ad, yol (Farklı kaydet) ya da değişiklik işareti değişti. */
  guncelle(id, { ad, yol, degisti }) {
    const s = this.bul(id);
    if (!s) return;
    if (ad != null) { s.ad = ad; s.el.querySelector('.ad').textContent = ad; }
    if (yol != null) s.yol = yol;
    if (ad != null || yol != null) s.el.title = ipucu(s.ad, s.yol);
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

  /** Açık belgeler listesi. aramaSay verildiyse kutu tüm belgelerde metin arar: her satırda eşleşme sayısı, eşleşmeliler üstte;
   *  sorgu varken seçim 'belgedeAra' {id, sorgu} (0 eşleşmeli satırda 'sec'), yokken 'sec' {id} gönderir. aramaSay yoksa kutu ada/yola göre süzer. */
  belgeListesiAc() {
    const kut = this.belgeListesi;
    clearTimeout(this.listeZaman);
    this.listeNo++;
    kut.innerHTML = '';
    const sayarak = !!this.aramaSay;
    const girdi = document.createElement('input');
    girdi.type = 'text'; girdi.spellcheck = false;
    girdi.placeholder = sayarak ? 'Tüm belgelerde ara' : 'Belge ara';
    kut.append(girdi);
    const ul = document.createElement('ul');
    kut.append(ul);
    const sorguVar = () => sayarak && girdi.value.trim() !== '';
    const sec = (r) => {
      // "0 eşleşme" satırı yalnızca sekmeye geçer: tüm sekmelerde arama ilk eşleşmeyi başka belgede bulup oraya atlardı
      const sorgu = girdi.value, ara = sorguVar() && r.sayi !== 0;
      this.belgeListesiKapat();
      if (ara) this.dispatchEvent(new CustomEvent('belgedeAra', { detail: { id: r.s.id, sorgu } }));
      else this.dispatchEvent(new CustomEvent('sec', { detail: { id: r.s.id } }));
    };
    // Satırlar bir kez kurulur; sorgu değişince yalnızca rozet, görünürlük ve sıra güncellenir (seçili satır korunur)
    const satirlar = this.sekmeler.map((s) => {
      const li = document.createElement('li');
      if (s.id === this.aktifId) li.classList.add('aktif');
      li.innerHTML = '<span class="ad"></span><span class="rozet" hidden></span><span class="yol"></span>';
      li.querySelector('.ad').textContent = (s.degisti ? '• ' : '') + s.ad;
      li.querySelector('.yol').textContent = s.yol;
      const r = { s, li, rozet: li.querySelector('.rozet'), sayi: null, sonSayi: null };   // sayi null: sayılıyor; sonSayi: sıralama için son bilinen
      li.addEventListener('click', () => sec(r));
      ul.append(li);
      return r;
    });
    const satirOf = (li) => satirlar.find((r) => r.li === li);

    const duzenle = () => {
      if (!sayarak) {   // geri uyum: ada/yola göre süz
        const f = girdi.value.toLocaleLowerCase('tr');
        for (const r of satirlar) {
          r.li.hidden = !!f && !r.s.ad.toLocaleLowerCase('tr').includes(f) && !r.s.yol.toLocaleLowerCase('tr').includes(f);
          if (r.li.hidden) r.li.classList.remove('secili');
        }
        return;
      }
      const sorgulu = sorguVar();
      for (const r of satirlar) {
        const sayiliyor = sorgulu && r.sayi == null;
        r.rozet.hidden = !sorgulu;
        r.rozet.textContent = !sorgulu ? '' : sayiliyor ? 'aranıyor…' : `${r.sayi.toLocaleString('tr')} eşleşme`;
        r.rozet.classList.toggle('sayiliyor', sayiliyor);
        r.li.classList.toggle('eslesmeli', sorgulu && r.sayi > 0);
        r.li.classList.toggle('eslesmesiz', sorgulu && r.sayi === 0);
      }
      // Eşleşmeliler üstte, sayılmakta olanlar ortada, eşleşmesizler altta; grup içinde sekme sırası.
      // Yeniden sayılırken son bilinen sayıya göre yerinde kalır (satırlar her tuşta zıplamasın).
      const grup = (r) => { const n = r.sayi ?? r.sonSayi; return !sorgulu || n == null ? 1 : n > 0 ? 0 : 2; };
      const sirali = satirlar.map((r, i) => [grup(r), i, r]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
      sirali.forEach((r, i) => { if (ul.children[i] !== r.li) ul.insertBefore(r.li, ul.children[i] || null); });
    };

    girdi.addEventListener('input', () => {
      if (!sayarak) { duzenle(); return; }
      clearTimeout(this.listeZaman);
      const no = ++this.listeNo;   // eski sorgunun geç gelen sonuçları yok sayılır
      const sorgu = girdi.value;
      if (!sorgu.trim()) { for (const r of satirlar) r.sayi = r.sonSayi = null; duzenle(); return; }
      for (const r of satirlar) r.sayi = null;
      duzenle();
      this.listeZaman = setTimeout(() => {
        const iptal = () => no !== this.listeNo;
        for (const r of satirlar) {
          Promise.resolve().then(() => this.aramaSay(r.s.id, sorgu, { iptal })).then((n) => Math.max(0, +n || 0), () => 0).then((n) => {
            if (iptal()) return;
            r.sayi = r.sonSayi = n;
            duzenle();
          });
        }
      }, 250);
    });
    girdi.addEventListener('keydown', (e) => {
      const ogeler = [...ul.children].filter((li) => !li.hidden);
      let i = ogeler.findIndex((li) => li.classList.contains('secili'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        i = e.key === 'ArrowDown' ? Math.min(ogeler.length - 1, i + 1) : Math.max(0, i - 1);
        for (const r of satirlar) r.li.classList.toggle('secili', r.li === ogeler[i]);
        ogeler[i]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        let hedef = ogeler[i];
        // Sorgu varken seçili yoksa ilk eşleşmeli belge; sayım bitmediyse ya da hiç eşleşme yoksa aktif belge
        if (!hedef && sorguVar()) hedef = ogeler.find((li) => satirOf(li).sayi > 0) || ogeler.find((li) => satirOf(li).s.id === this.aktifId);
        hedef = hedef || ogeler[0];
        if (hedef) sec(satirOf(hedef));
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();   // genel Esc işleyicisi (araç bırakma vb.) ayrıca çalışmasın
        this.belgeListesiKapat();
      }
    });
    kut.hidden = false;
    girdi.focus();
  }

  belgeListesiKapat() { clearTimeout(this.listeZaman); this.listeNo++; this.belgeListesi.hidden = true; this.belgeListesi.innerHTML = ''; }
}
