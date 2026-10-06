// Geri al geçmişi ve kaydedilmemiş değişiklikler listesi (0.2.2, kullanıcı isteği: "geri al simgesinin yanına bir ok işareti çıkartalım geri
// alınma adımlarını da oradan görelim. worddeki gibi olsun mekaniği ve görüntüsü"; durum çubuğundaki "Kaydedilmemiş değişiklikler" için
// "aşağıdakinin mekaniği de benzer olabilir"). İki liste de bu bileşenden gelir, aynı anda biri açık olur: araç çubuğunda Geri al'ın yanındaki
// ▾ düğmesinin listesi (Geri al düğmesinin altında) ve durum çubuğundaki yazının listesi (yukarı doğru, başlıklı, altta Kaydet).
// Satırlar en yenisi üstte, "ad · ayrıntı" ("Not ekle · s. 3"). Word'deki gibi: fare bir satıra gelince en üstten o satıra kadar boyanır, altta
// "N işlemi geri al" yazar, tıklanınca o kadar adım birden geri alınır. Tıklanamayan satırlar (kaydedilip geri alınanlar, net farktan
// çıkarılanlar) soluk görünür, boyanmaz. Klavye: ↑ ↓ boyamayı değiştirir (Home / End, Page Up / Down da), Enter uygular, Esc kapatır, Tab
// Kaydet düğmesine geçer. Dışarı tıklama, pencerenin odağı kaybetmesi, pencere boyutunun değişmesi ve Ctrl / Alt / ⌘'li tuşlar listeyi kapatır
// (kısayol olağan işini yapar: Ctrl+Z geri alır, Ctrl+S kaydeder); sekme değişimini ve menü komutlarını uygulama bildirir (uygulama.js).
// Liste açıkken belge kısayolları (sayfa çevirme, not silme, kaydırma) çalışmaz: tuşlar belgeye ulaşmaz (Araçlar penceresindeki gibi).
// Yinelenen Enter / Boşluk (tuş basılı tutulunca) uygulamaz: listeyi açan basış biraz uzun tutulunca bir adımı sessizce geri alıyordu (bağımsız
// inceleme; mesajKutusu.js'teki gibi). Ekran okuyucu: odak listbox'tadır (ul), aria-activedescendant son boyalı satırı gösterir, boyalı satırlar
// seçilidir (çok seçimli listbox), alt yazı canlı bölgedir ("N işlemi geri al" okunur).

const KAYDIRMA_ADIMI = 10;   // Page Up / Page Down ile boyanan satır sayısının değişimi

export class GecmisListesi {
  constructor() {
    const el = document.createElement('div');
    el.className = 'gecmis-listesi';
    el.setAttribute('role', 'dialog');
    el.tabIndex = -1;
    el.hidden = true;
    el.innerHTML = '<div class="gecmis-baslik"></div><ul class="gecmis-ogeler" role="listbox" aria-multiselectable="true" tabindex="-1"></ul>'
      + '<div class="gecmis-alt"><span class="gecmis-alt-yazi" aria-live="polite"></span><button type="button" class="birincil gecmis-kaydet">Kaydet</button></div>';
    this.el = el;
    this.baslikEl = el.querySelector('.gecmis-baslik');
    this.listeEl = el.querySelector('.gecmis-ogeler');   // odak burada (satırlar odak almaz; aria-activedescendant)
    this.altEl = el.querySelector('.gecmis-alt-yazi');
    this.kaydetEl = el.querySelector('.gecmis-kaydet');
    document.body.append(el);
    this.s = null;          // açık listenin seçenekleri (ac); kapalıyken null
    this.ogeler = [];       // gösterilen satırlar
    this.tiklanir = 0;      // en üstteki tıklanabilir satır sayısı (boyanabilecek en çok satır)
    this.n = 0;             // boyalı satır sayısı (en üstten)

    // Satırlar: fare satıra gelince boyar, satırdan çıkınca boyama kalkar; tıklanabilir satıra tıklamak o kadar adımı geri alır
    this.listeEl.addEventListener('mousemove', (e) => {
      const li = e.target.closest('li[data-i]');
      const i = li ? +li.dataset.i : -1;
      this.boya(i >= 0 && i < this.tiklanir ? i + 1 : 0);
    });
    this.listeEl.addEventListener('mouseleave', () => this.boya(0));
    this.listeEl.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]');
      const i = li ? +li.dataset.i : -1;
      if (i >= 0 && i < this.tiklanir) this.uygula(i + 1);
    });
    // Alt yazı: boyalıyken "N işlemi geri al" (tıklanınca uygular), boyasızken Vazgeç (geri al listesinde: kapatır)
    this.altEl.addEventListener('click', () => {
      if (this.n) this.uygula(this.n);
      else if (this.s?.altVazgec) this.kapat({ odakAciciya: true });
    });
    this.kaydetEl.addEventListener('click', () => { const k = this.s?.kaydet; if (!k || !k.etkin()) return; this.kapat({ odakBelgeye: true }); k.calistir(); });
    // Listenin içine basmak odağı listede tutar (satırlar odak almaz; odak BODY'ye düşerse tuşlar belgeye giderdi); Kaydet düğmesi tıklanır
    el.addEventListener('mousedown', (e) => { if (e.button === 0 || e.button === 2) e.preventDefault(); });

    this._disTiklama = (e) => {
      if (!this.s || this.el.contains(e.target) || this.s.acici?.contains(e.target)) return;   // açıcı düğme kendi tıklamasıyla kapatır
      this.kapat();
    };
    this._tus = (e) => this.tus(e);
    this._kapat = () => this.kapat();
  }

  /** Açık listenin kaynağı ('geri' | 'durum') ya da null. */
  get acik() { return this.s ? this.s.kaynak : null; }

  /**
   * Listeyi açar (başka liste açıksa önce o kapanır). s: {
   *   kaynak: 'geri' | 'durum', acici: düğme (aria-expanded, dışarı tıklama sayılmaz), capa: hizalanacak öğe (verilmezse acici),
   *   yon: 'asagi' (çapanın altında, sol kenarı hizalı) | 'yukari' (çapanın üstünde, sağ kenarı hizalı), etiket: erişilebilir ad,
   *   baslik?: listenin başlığı, ogeler: () => [{ ad, ayrinti?, tiklanir?, ek? }] (en yenisi önce; tıklanabilirler üstte),
   *   altYazi: (n) => boyalıyken alt yazı, varsayilanAlt: (ogeler) => boyasızken alt yazı, altVazgec?: boyasız alt yazı tıklanınca kapatır,
   *   uygula: (n) => n adımı geri alır, kaydet?: { etkin: () => bool, calistir: () => void }, ilkBoyali?: ilk satır boyalı açılır (klavyeyle)
   * }. Gösterilecek satır yoksa açılmaz. Döner: açıldı mı.
   */
  ac(s) {
    if (this.s) this.kapat();
    this.s = s;
    if (!this.ciz()) { this.s = null; return false; }
    this.el.setAttribute('aria-label', s.etiket || s.baslik || '');
    this.listeEl.setAttribute('aria-label', s.etiket || s.baslik || '');
    this.el.dataset.kaynak = s.kaynak;
    this.baslikEl.hidden = !s.baslik;
    this.baslikEl.textContent = s.baslik || '';
    this.kaydetEl.hidden = !s.kaydet;
    this.el.hidden = false;
    s.acici?.setAttribute('aria-expanded', 'true');
    s.acici?.classList.add('liste-acik');
    this.boya(s.ilkBoyali && this.tiklanir ? 1 : 0);
    this.konumla();
    if (!this.s) return false;
    document.addEventListener('pointerdown', this._disTiklama, true);
    document.addEventListener('keydown', this._tus, true);
    window.addEventListener('resize', this._kapat);
    window.addEventListener('blur', this._kapat);
    this.listeEl.focus({ preventScroll: true });
    return true;
  }

  /**
   * Listeyi kapatır. odakAciciya: odak listedeyse açıcı düğmeye döner (Esc, düğmeyle kapatma); odakBelgeye: s.odakBelgeye() çağrılır
   * (geri alma ve Kaydet'ten sonra kısayollar belgede çalışsın). Dışarı tıklamada odağa dokunulmaz (tıklanan yer alır).
   */
  kapat({ odakAciciya = false, odakBelgeye = false } = {}) {
    const s = this.s;
    if (!s) return;
    const odakIceride = this.el.contains(document.activeElement);
    this.s = null;
    this.el.hidden = true;
    this.listeEl.innerHTML = '';
    this.ogeler = []; this.tiklanir = 0; this.n = 0;
    s.acici?.setAttribute('aria-expanded', 'false');
    s.acici?.classList.remove('liste-acik');
    document.removeEventListener('pointerdown', this._disTiklama, true);
    document.removeEventListener('keydown', this._tus, true);
    window.removeEventListener('resize', this._kapat);
    window.removeEventListener('blur', this._kapat);
    if (odakBelgeye) s.odakBelgeye?.();
    else if (odakIceride) {
      if (odakAciciya && s.acici && !s.acici.disabled && s.acici.offsetParent) s.acici.focus({ preventScroll: true });
      else document.activeElement.blur();
    }
  }

  /** Belgenin durumu değişti (geri al yığını, kayıt): satırlar yeniden okunur, boyama sığdığı kadar korunur; satır kalmadıysa kapanır. */
  yenile() {
    if (!this.s) return;
    const n = this.n;
    if (!this.ciz()) { this.kapat({ odakBelgeye: this.el.contains(document.activeElement) }); return; }
    this.boya(Math.min(n, this.tiklanir));
    this.konumla();
  }

  /** Satırları çizer; satır yoksa false. */
  ciz() {
    const ogeler = this.s.ogeler() || [];
    this.ogeler = ogeler;
    let t = 0;
    while (t < ogeler.length && ogeler[t].tiklanir) t++;   // tıklanabilirler üstte, kesintisiz
    this.tiklanir = t;
    this.listeEl.textContent = '';
    if (!ogeler.length) return false;
    const parca = document.createDocumentFragment();
    ogeler.forEach((o, i) => {
      const li = document.createElement('li');
      li.dataset.i = String(i);
      li.id = 'gecmis-oge-' + i;
      li.className = 'gecmis-oge' + (i < t ? ' tiklanir' : ' tiklanmaz');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      const ad = document.createElement('span'); ad.className = 'ad'; ad.textContent = o.ad;
      li.append(ad);
      if (o.ayrinti) { const a = document.createElement('span'); a.className = 'ayrinti'; a.textContent = ' · ' + o.ayrinti; li.append(a); }
      if (o.ek) { const e = document.createElement('span'); e.className = 'ek'; e.textContent = ' ' + o.ek; li.append(e); }
      li.title = li.textContent;
      parca.append(li);
    });
    this.listeEl.append(parca);
    this.kaydetEl.disabled = !!this.s.kaydet && !this.s.kaydet.etkin();
    return true;
  }

  /** En üstten n satırı boyar (0: boyama yok) ve alt yazıyı yazar. */
  boya(n) {
    if (!this.s) return;
    n = Math.max(0, Math.min(n, this.tiklanir));
    this.n = n;
    const satirlar = this.listeEl.children;
    for (let i = 0; i < satirlar.length; i++) {
      const boyali = i < n;
      satirlar[i].classList.toggle('boyali', boyali);
      satirlar[i].setAttribute('aria-selected', String(boyali));
    }
    if (n && satirlar[n - 1]) this.listeEl.setAttribute('aria-activedescendant', satirlar[n - 1].id);
    else this.listeEl.removeAttribute('aria-activedescendant');
    this.altEl.textContent = n ? this.s.altYazi(n) : (this.s.varsayilanAlt?.(this.ogeler) || '');
    this.altEl.classList.toggle('etkin', !!n || !!this.s.altVazgec);
    this.altEl.classList.toggle('sayili', !!n);
  }

  uygula(n) {
    const s = this.s;
    if (!s || n < 1) return;
    this.kapat({ odakBelgeye: true });
    s.uygula(n);
  }

  tus(e) {
    if (!this.s) return;
    // Önde bir pencere açıldıysa (mesaj kutusu, araç penceresi) liste kapanır, tuş o pencerenin
    if (document.querySelector('.mesaj-ortusu, .diyalog-ortusu, .arac-ortusu, .ayarlar-ortusu')) { this.kapat(); return; }
    // Uygulama kısayolları (Ctrl+Z, Ctrl+S, ⌘Z…) ve işlev tuşları listeyi kapatır, olağan işlerini yapar
    if (e.ctrlKey || e.altKey || e.metaKey || /^F\d+$/.test(e.key)) { this.kapat(); return; }
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
    e.stopPropagation();
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return; }   // basılı tutulan tuş: yalnızca ilk basış sayılır
    const kaydetteOdak = document.activeElement === this.kaydetEl;
    if (kaydetteOdak && (e.key === 'Enter' || e.key === ' ')) return;   // düğmenin kendi tıklaması (varsayılan eylem)
    e.preventDefault();
    const t = this.tiklanir;
    switch (e.key) {
      case 'Escape': this.kapat({ odakAciciya: true }); break;
      case 'ArrowDown': this.boya(Math.min(t, this.n + 1)); this.gorunurYap(); break;
      case 'ArrowUp': if (this.n > 1) { this.boya(this.n - 1); this.gorunurYap(); } break;
      case 'Home': this.boya(t ? 1 : 0); this.gorunurYap(); break;
      case 'End': this.boya(t); this.gorunurYap(); break;
      case 'PageDown': this.boya(Math.min(t, this.n + KAYDIRMA_ADIMI)); this.gorunurYap(); break;
      case 'PageUp': this.boya(Math.max(t ? 1 : 0, this.n - KAYDIRMA_ADIMI)); this.gorunurYap(); break;
      case 'Enter': case ' ': if (this.n) this.uygula(this.n); else this.kapat({ odakAciciya: true }); break;
      case 'Tab':
        if (!this.kaydetEl.hidden && !this.kaydetEl.disabled && !kaydetteOdak) this.kaydetEl.focus({ preventScroll: true });
        else this.listeEl.focus({ preventScroll: true });
        break;
      default: break;
    }
  }

  /** Klavyeyle boyanan son satır listenin görünen kısmına gelir (uzun listede kaydırma). */
  gorunurYap() {
    const li = this.listeEl.children[Math.max(0, this.n - 1)];
    li?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Çapaya göre yerleştirir: aşağı açılan liste çapanın altında (sol kenarı hizalı), yukarı açılan çapanın üstünde (sağ kenarı hizalı);
   * pencerenin kenarlarından taşmaz, en çok pencere yüksekliğinin %60'ı kadar uzar (uzun liste kendi içinde kayar). Çapa görünmüyorsa kapanır.
   */
  konumla() {
    const s = this.s;
    if (!s) return;
    const capa = s.capa || s.acici;
    const r = capa?.getBoundingClientRect();
    if (!r || !r.width) { this.kapat(); return; }
    const kenar = 8, bosluk = 3;
    const yer = s.yon === 'yukari' ? r.top - bosluk - kenar : innerHeight - r.bottom - bosluk - kenar;
    this.el.style.maxHeight = Math.max(120, Math.min(Math.round(innerHeight * 0.6), Math.floor(yer))) + 'px';
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    const sol = s.yon === 'yukari' ? r.right - w : r.left;
    this.el.style.left = Math.round(Math.max(kenar, Math.min(sol, innerWidth - w - kenar))) + 'px';
    this.el.style.top = Math.round(s.yon === 'yukari' ? Math.max(kenar, r.top - bosluk - h) : r.bottom + bosluk) + 'px';
  }
}
