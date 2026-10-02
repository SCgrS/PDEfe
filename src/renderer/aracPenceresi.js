// Araçlar penceresi: araç çubuğundaki "Araçlar" düğmesinin altında açılan karolar (Sıkıştır, Sayfaları düzenle, Döndür,
// Ayır, Görüntü / PDF birleştir). Her karoda büyük simge, araç adı ve tek satırlık açıklama vardır; seçilen araç Araçlar menüsündeki
// (menu.js) komut kimliğiyle çalıştırılır. PDF'i kopyala'nın (0.1.21'e dek Paylaş) karosu yok: araç çubuğundaki düğmesi ve Araçlar menüsündeki öğesiyle çalışır.
// Esc, dışarı tıklama ya da araç seçimi pencereyi kapatır; ok tuşları, Tab, Home ve End karolar arasında gezer, Enter / Boşluk seçer.

const simge = (ic) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic}</svg>`;

/** Karolar, Araçlar menüsündeki araçların sırasıyla. belge: açık bir PDF gerektirir; belge yokken seçilince önce Aç penceresi açılır
 *  (uygulama.js; 0.1.13'e dek karo soluk ve seçilemezdi). Açılış ekranı (baslangic.js) da bu listeyi gösterir. */
export const ARACLAR = [
  {
    komut: 'arac.kucult', ad: 'Sıkıştır', aciklama: 'Dosya boyutunu azaltır', renk: 'yesil', belge: true,
    ipucu: 'Görselleri sıkıştırarak PDF dosyasının boyutunu azaltır',
    // Sayfa ve ortadaki çizgiye doğru bastıran iki ok
    ikon: '<path d="M5 2.75h10.5l3.5 3.5v15.5H5z"/><path d="M15.5 2.75v3.5H19"/><path d="M12 6.25v4M10 8.25l2 2 2-2M8.5 13.25h7M12 19.75v-3.5M10 18.25l2-2 2 2"/>',
  },
  {
    komut: 'arac.sayfalar', ad: 'Sayfaları düzenle', aciklama: 'Sıralar, siler, döndürür, sayfa ekler', renk: 'mavi', belge: true,
    ipucu: 'Sayfaları sürükleyerek sıralayın; silin, döndürün, boş sayfa ya da başka PDF\'ten sayfa ekleyin',
    // 2×2 sayfa ızgarası, biri seçili
    ikon: '<rect x="3.5" y="2.75" width="7" height="8.25" rx="1.2"/><rect x="13.5" y="2.75" width="7" height="8.25" rx="1.2"/><rect x="3.5" y="13" width="7" height="8.25" rx="1.2"/><rect x="13.5" y="13" width="7" height="8.25" rx="1.2" fill="currentColor" fill-opacity=".3"/>',
  },
  {
    komut: 'arac.dondurKaydet', ad: 'Döndür', aciklama: 'Sayfaları döndürür', renk: 'mor', belge: true,
    ipucu: 'Tüm sayfaları, geçerli sayfayı ya da bir aralığı döndürüp dosyaya kaydeder',
    // Sayfa ve saat yönünde dönen ok (0.1.12: ok ucu dolu, bütün döndürme simgeleriyle aynı)
    ikon: '<rect x="3.5" y="8.5" width="10.5" height="12.75" rx="1.5"/><path d="M10.5 3.5h2.75a7 7 0 0 1 7 7v.9"/><path d="M17.35 11.1h5.8l-2.9 3.5z" fill="currentColor" stroke="none"/>',
  },
  {
    komut: 'arac.ayir', ad: 'Ayır', aciklama: 'Belgeyi dosyalara böler', renk: 'turuncu', belge: true,
    ipucu: 'Belgeyi sayfa aralıklarına göre ayrı ayrı dosyalara ya da tek dosyaya ayırır; her sayfayı ayrı dosyaya da kaydedebilir',
    // Kesik çizgiyle ayrılan iki sayfa
    ikon: '<rect x="2.75" y="3.75" width="6.75" height="16.5" rx="1.2"/><rect x="14.5" y="3.75" width="6.75" height="16.5" rx="1.2"/><path d="M12 2.5v19" stroke-dasharray="2.2 2.6"/>',
  },
  {
    komut: 'arac.gorselBirlestir', ad: 'Görüntü / PDF birleştir', aciklama: 'Dosyalardan tek PDF oluşturur', renk: 'pembe', belge: false,
    ipucu: 'Görüntü ve PDF belgelerini birleştirerek tek bir PDF oluşturur',
    // Görüntü çerçevesi ve önünde artılı sayfa (sayfa dolgusu arkadaki çizgileri örter)
    ikon: '<rect x="2.5" y="3" width="11.5" height="9.5" rx="1.5"/><path d="m2.75 11 3.5-3.5 3 3 1.75-1.75 2.75 2.75"/><circle cx="10.25" cy="6.25" r="1"/><path class="dolgu" d="M10.25 9.25h6.5l4.25 4.25v8h-10.75z"/><path d="M16.75 9.25v4.25H21M15.6 15v4.5M13.35 17.25h4.5"/>',
  },
];

export class AraclarPenceresi {
  /**
   * @param {object} s
   * @param {HTMLButtonElement} s.dugme araç çubuğundaki Araçlar düğmesi
   * @param {(komut:string)=>void} s.komutCalistir uygulama komutunu çalıştırır
   */
  constructor({ dugme, komutCalistir }) {
    this.dugme = dugme;
    this.komutCalistir = komutCalistir;
    this.acik = false;

    const el = document.createElement('div');
    el.id = 'araclar-penceresi';
    el.className = 'araclar-penceresi';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Araçlar');
    el.hidden = true;
    el.innerHTML = '<div class="araclar-baslik">Araçlar</div><div class="araclar-izgara"></div>';
    this.el = el;
    const izgara = el.querySelector('.araclar-izgara');
    // data-komut kullanılmaz: uygulama.js [data-komut] öğelerine ayrıca tıklama dinleyicisi bağlar
    this.karolar = ARACLAR.map((a) => {
      const k = document.createElement('button');
      k.type = 'button';
      k.className = 'araclar-karo';
      k.dataset.aracKomut = a.komut;
      k.dataset.renk = a.renk;
      k.innerHTML = `<span class="araclar-ikon">${simge(a.ikon)}</span><span class="araclar-ad"></span><span class="araclar-aciklama"></span>`;
      k.querySelector('.araclar-ad').textContent = a.ad;
      k.querySelector('.araclar-aciklama').textContent = a.aciklama;
      k.title = a.ipucu;
      k.addEventListener('click', () => this.sec(a));
      izgara.append(k);
      return { a, k };
    });
    document.body.append(el);

    this._disTiklama = (e) => { if (!this.el.contains(e.target) && !this.dugme.contains(e.target)) this.kapat(); };
    this._belgeTusu = (e) => {
      // Odak içerideyse karo tuş işleyicisi (_tus), Araçlar düğmesindeyse düğmenin kendi işleyicisi ele alır
      const odak = document.activeElement;
      if (this.el.contains(odak) || (odak === this.dugme && ['Enter', ' ', 'ArrowDown'].includes(e.key))) return;
      if (e.ctrlKey || e.altKey || e.metaKey) { this.kapat(); return; }
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
      // Odak dışarıdayken de belge kısayolları (sayfa çevirme, not silme, kaydırma) çalışmasın: Esc kapatır, diğer tuşlar odağı karolara alır
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') this.kapat();
      else this.etkinKarolar()[0]?.focus({ preventScroll: true });
    };
    this._konumla = () => this.konumla();
    this._pencereOdagi = () => this.kapat();

    dugme.addEventListener('click', () => (this.acik ? this.kapat({ odakDugmeye: true }) : this.ac()));
    // Enter / Boşluk aç-kapa, aşağı ok açar; tuş belgeye ulaşmasın (Boşluk sayfayı kaydırıp düğmenin tıklamasını engellerdi)
    dugme.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || !['Enter', ' ', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (!this.acik) this.ac();
      else if (e.key === 'ArrowDown') this.etkinKarolar()[0]?.focus({ preventScroll: true });
      else this.kapat({ odakDugmeye: true });
    });
    el.addEventListener('keydown', (e) => this._tus(e));
    // Başlığa ya da karolar arasındaki boşluğa tıklamak odağı karodan almasın (odak BODY'ye düşünce tuşlar belgeye giderdi)
    el.addEventListener('mousedown', (e) => { if (!e.target.closest('.araclar-karo')) e.preventDefault(); });
  }

  /** Karolar, sırayla (klavye gezinmesi). */
  etkinKarolar() { return this.karolar.map((x) => x.k); }

  ac() {
    if (this.acik) return;
    this.el.hidden = false;
    this.acik = true;
    this.dugme.setAttribute('aria-expanded', 'true');
    this.konumla();
    if (!this.acik) return;
    document.addEventListener('pointerdown', this._disTiklama, true);
    document.addEventListener('keydown', this._belgeTusu, true);
    window.addEventListener('resize', this._konumla);
    window.addEventListener('blur', this._pencereOdagi);
    this.etkinKarolar()[0]?.focus({ preventScroll: true });
  }

  /** odakDugmeye: odak pencerenin içindeyse Araçlar düğmesine döner (Esc, düğmeyle kapatma). */
  kapat({ odakDugmeye = false } = {}) {
    if (!this.acik) return;
    const odakIceride = this.el.contains(document.activeElement);
    this.acik = false;
    this.el.hidden = true;
    this.dugme.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this._disTiklama, true);
    document.removeEventListener('keydown', this._belgeTusu, true);
    window.removeEventListener('resize', this._konumla);
    window.removeEventListener('blur', this._pencereOdagi);
    if (odakIceride) {
      if (odakDugmeye) this.dugme.focus({ preventScroll: true });
      else document.activeElement.blur();
    }
  }

  /** Pencereyi kapatıp aracı çalıştırır (belge gerektiren araç belge yokken önce Aç penceresini açar: uygulama.js). */
  sec(a) {
    this.kapat();
    this.komutCalistir(a.komut);
  }

  /** Düğmenin altına, düğmeyle ortalı yerleştirir; uygulama penceresinin kenarlarından taşmaz. Düğme görünmüyorsa pencere kapanır. */
  konumla() {
    if (!this.acik) return;
    const r = this.dugme.getBoundingClientRect();
    if (!r.width) { this.kapat(); return; }
    const kenar = 8;
    const ust = Math.round(r.bottom + 4);
    this.el.style.maxHeight = Math.max(160, innerHeight - ust - kenar) + 'px';
    const w = this.el.offsetWidth;
    this.el.style.left = Math.round(Math.max(kenar, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - kenar))) + 'px';
    this.el.style.top = ust + 'px';
  }

  _tus(e) {
    // Uygulama kısayolları (Ctrl+Z, Ctrl+Tab gibi) pencereyi kapatır ve olağan işini yapar
    if (e.ctrlKey || e.altKey || e.metaKey) { this.kapat(); return; }
    // Belge kısayolları (sayfa çevirme, not silme, kaydırma) pencere açıkken çalışmasın
    e.stopPropagation();
    const liste = this.etkinKarolar();
    const i = liste.indexOf(document.activeElement);
    const odakla = (k) => { e.preventDefault(); k?.focus({ preventScroll: true }); };
    switch (e.key) {
      case 'Escape': e.preventDefault(); this.kapat({ odakDugmeye: true }); break;
      case 'Tab': if (liste.length) odakla(liste[(i + (e.shiftKey ? -1 : 1) + liste.length) % liste.length]); else e.preventDefault(); break;
      case 'ArrowRight': if (liste.length) odakla(liste[(i + 1) % liste.length]); break;
      case 'ArrowLeft': if (liste.length) odakla(liste[(i - 1 + liste.length) % liste.length]); break;
      case 'ArrowDown': case 'ArrowUp': odakla(i < 0 ? liste[0] : this._dikey(document.activeElement, e.key === 'ArrowDown' ? 1 : -1)); break;
      case 'Home': odakla(liste[0]); break;
      case 'End': odakla(liste[liste.length - 1]); break;
      case 'Enter': case ' ': {
        e.preventDefault();
        const x = this.karolar.find((y) => y.k === document.activeElement);
        if (x) this.sec(x.a);
        break;
      }
      default: break;
    }
  }

  /**
   * Yukarı/aşağıda seçilebilir karo bulunan en yakın satırda yatayda en yakın karo; yoksa bulunduğu karo. Son satır ortalı olduğundan
   * sütunlar hizalı değil: iki karo eşit uzaklıktaysa aşağı giderken sağdaki, yukarı giderken soldaki (aşağı-yukarı geri döner).
   */
  _dikey(k, yon) {
    const r0 = k.getBoundingClientRect(), x0 = r0.left + r0.width / 2;
    let en = k, enSatir = Infinity, enUzak = Infinity, enSol = 0;
    for (const x of this.etkinKarolar()) {
      const r = x.getBoundingClientRect();
      const dy = (r.top - r0.top) * yon, dx = Math.abs(r.left + r.width / 2 - x0);
      if (dy <= 1) continue;   // aynı satır ya da öteki yön
      const yakinSatir = dy < enSatir - 1, ayniSatir = Math.abs(dy - enSatir) <= 1;
      const yakin = dx < enUzak - 1, esit = Math.abs(dx - enUzak) <= 1;
      if (yakinSatir || (ayniSatir && (yakin || (esit && (r.left - enSol) * yon > 0)))) { en = x; enSatir = dy; enUzak = dx; enSol = r.left; }
    }
    return en;
  }
}
