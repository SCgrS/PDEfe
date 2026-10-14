// Belgedeki bütün metnin seçimi (0.2.6, Ctrl+A; kullanıcı isteği: "Ctrl+A açık tüm sayfalardaki metni seçsin"). 0.2.5'e dek Ctrl+A yalnızca
// geçerli sayfanın metin katmanını seçiyordu: katman yalnızca görünür sayfalarda (ve yakınlarında) kurulur. Bütün sayfaların katmanını kurup
// DOM'da seçmek olmuyor (410 sayfalık kanunda 55 sn, 37 bin öğe; seçim varken hiçbir katman boşaltılmaz, bellek dolar).
// Bunun yerine "sanal" seçim: geçerli sayfanın katmanı DOM'da seçilir (çapa: tarayıcının kopyala olayı, klavye ve sağ tık menüsü bir seçim
// görür), görünümün köküne 'tum-secili' sınıfı konur ve CSS bütün katmanların öğelerini (kaydırınca sonradan kurulanlar ve görsellerde
// tanınan sözcükler dâhil) seçili renkte boyar (stil.css). Kopyalanan metin çekirdekten sayfa sayfa alınır (metin_sec, sayfayı kaplayan tek
// kutuyla; uygulama.js'teki kopyalamanın kuralları aynen: sayfaMetinleriniBirlestir + temizMetin). Metin eş zamanlı hazır olmadığından Ctrl+A
// anında arka planda hazırlanmaya başlar; kopyalama geldiğinde hazırsa doğrudan panoya, değilse "Metin hazırlanıyor (N/M)" yazılır ve hazır
// olunca pano bu arada başka bir şey kopyalanmadıysa doldurulur (0.1.23 kuralı). Esc hazırlığı durdurur.
// Seçim tıklayınca, Esc'le, seçim başka yere geçince (selectionchange), sekme değişince, belge kapanınca ve sayfa düzeni değişince kalkar.
import { temizMetin, sayfaMetinleriniBirlestir } from './metin.js';
import { MAC } from './platform.js';

const SINIF = 'tum-secili';
// Sayfayı (döndürülmüş, kırpılmış, büyük boyutlu olsa da) kaplayan tek seçim kutusu: metin_sec sözcüğü merkezi kutudaysa alır; taranmış
// sayfada tanınan sözcükler de seçime değdiği için katılır
const KAPLAYAN = [[-1e5, -1e5, 1e5, 1e5]];
const KATMAN_BEKLEME = 3000;   // ms: geçerli sayfanın metin katmanı kurulurken çapa için en çok bu kadar beklenir
const ILERLEME_ARALIGI = 120;  // ms: ilerleme bildirimi en sık bu aralıkla yazılır

// Sayfa girdisi → {yol, sayfa, sonuc}: aynı belgede yeniden Ctrl+A'da çekirdeğe yeniden sorulmaz. Anahtar girdinin kendisi: girdinin kaynağı
// değişirse (kayıt anlık kopyaya çevirdi, Farklı kaydet) yeniden sorulur; döndürülen ya da eklenen sayfa yeni girdidir
const onbellek = new WeakMap();
let tanimaYok = false;   // çekirdekte yazı tanıyıcı yok (ocr_sayfa "desteklenmiyor"): yalnızca PDF metni

/** Katmanın kurulması bitmiş mi (PDF.js öğeleri yazıp endOfContent'i eklemiş): yarım katmanı seçmek boş aralık olurdu. */
function tamKatman(s) {
  const k = s?.textLayer && s.el.isConnected && s.el.querySelector(':scope > .textLayer');
  return k && k.querySelector(':scope > .endOfContent') ? k : null;
}

/** Görünür alandaki, metin katmanı kurulmuş ilk sayfanın katmanı ya da null. */
function gorunurKatman(g) {
  const kr = g.kaydirici.getBoundingClientRect();
  for (const s of g.sayfalar) {
    const k = tamKatman(s);
    if (!k) continue;
    const r = s.el.getBoundingClientRect();
    if (r.bottom > kr.top && r.top < kr.bottom && r.right > kr.left && r.left < kr.right) return k;
  }
  return null;
}

/** i. sayfanın metin katmanı yoksa kurar, kuruluyorsa bitmesini bekler (en çok KATMAN_BEKLEME); boş sayfada hemen döner. */
function katmanBekle(g, i) {
  const s = g.sayfalar[i];
  if (!s || s.bos || tamKatman(s)) return Promise.resolve();
  return new Promise((coz) => {
    const bitti = () => { clearTimeout(zaman); g.removeEventListener('metinKatmani', olay); coz(); };
    const olay = (e) => { if (e.detail?.sayfa === i + 1) bitti(); };
    const zaman = setTimeout(bitti, KATMAN_BEKLEME);
    g.addEventListener('metinKatmani', olay);
    if (!s.textLayer) g.metinKatmaniHazirla(i).then((k) => { if (!k) bitti(); }, bitti);
  });
}

/** Tarayıcı seçimi çapanın aralığı mı ([sc, so, ec, eo]; çapasızsa: seçim yok ya da daralmış). */
function secimCapada(aralik) {
  const sec = window.getSelection();
  if (!aralik) return !sec || sec.isCollapsed;
  if (!sec || sec.rangeCount !== 1) return false;
  const r = sec.getRangeAt(0), [sc, so, ec, eo] = aralik;
  return sc.isConnected && r.startContainer === sc && r.startOffset === so && r.endContainer === ec && r.endOffset === eo;
}

export class TumSecim {
  /**
   * cekirdek(yontem, params): çekirdek isteği (uygulama.js); panoyaYaz(metin, yalnizcaPanodaysa): ana süreçte panoya yazar, yazıldıysa true
   * (main.js 'pano:metin'); bildir(metin, sure): kısa bildirim.
   */
  constructor({ cekirdek, panoyaYaz, bildir }) {
    this.cekirdek = cekirdek; this.panoyaYaz = panoyaYaz; this.bildir = bildir;
    this.durum = null;              // {belge, kok, aralik: [sc, so, ec, eo] | null (çapasız: katmanı olan sayfa yok)}
    this.is = null;                 // seçimin hazırlığı (_isAl): sayfalar, sonuçlar, ilerleme, bitince metin
    this.bekleyenler = new Set();   // kopyalaması istenmiş, metni hazırlanan işler (seçim kalksa da biter, panoya yazar; Esc durdurur)
    this._sagTik = null;            // {durum}: bütün belge seçiliyken sağ tuşa basıldı (menuIcinGecerli)
    document.addEventListener('selectionchange', () => {
      if (this.durum && !this._sagTik && !secimCapada(this.durum.aralik)) this.kaldir();
    });
  }

  /** Bütün belge seçili mi (belge verilirse o belgede); tarayıcı seçimi hâlâ çapada olmalı. */
  gecerli(belge = null) {
    const d = this.durum;
    return !!d && (!belge || d.belge === belge) && secimCapada(d.aralik);
  }

  /** Belgenin görüntüleyicisine bağlanır (uygulama.js metinOlaylariBagla): sayfa alanında tıklama seçimi kaldırır, sağ tık kaldırmaz. */
  bagla(belge) {
    belge.gorunum.alan.addEventListener('mousedown', (e) => {
      if (!this.durum || this.durum.belge !== belge) return;
      if (e.button === 2 || (MAC && e.button === 0 && e.ctrlKey)) {   // sağ tık (macOS'ta Ctrl+tık da): menünün Kopyala'sı bütün belgeyi kopyalar
        const k = this._sagTik = { durum: this.durum };
        setTimeout(() => { if (this._sagTik === k) this._sagTik = null; }, 0);
        return;
      }
      if (e.button === 0) this.kaldir();
    }, true);
  }

  /**
   * Sağ tık menüsü açılırken (contextmenu, eş zamanlı): bütün belge seçili mi. macOS'ta sağ tık seçimin dışındaki sözcüğü seçer (Chromium:
   * menünün öğeleri sözcüğe uygulansın); sağ tuşa bütün belge seçiliyken basıldıysa çapa yeniden kurulur, Kopyala yine bütün belgeyi kopyalar.
   */
  menuIcinGecerli(belge) {
    const sag = this._sagTik;
    this._sagTik = null;
    if (this.gecerli(belge)) return true;
    const d = this.durum;
    if (!sag || !d || sag.durum !== d || d.belge !== belge || !d.aralik) return false;
    const [sc, so, ec, eo] = d.aralik;
    if (!sc.isConnected || !ec.isConnected) return false;
    const r = document.createRange();
    r.setStart(sc, so); r.setEnd(ec, eo);
    const sec = window.getSelection();
    sec.removeAllRanges(); sec.addRange(r);
    return this.gecerli(belge);
  }

  /** Ctrl+A (belgede, girdi dışında): belgenin bütün sayfalarının metnini seçer, kopyalanacak metni arka planda hazırlamaya başlar. */
  async sec(belge) {
    const g = belge?.gorunum;
    if (!g?.belge || g.yok || !g.sayfalar.length) return false;
    if (this.durum && this.durum.belge !== belge) this.kaldir();
    const d = this.durum || { belge, kok: g.kok, aralik: null };
    this.durum = d;
    g.kok.classList.add(SINIF);
    belge.notlar?.secimCubuguGizle();   // seçim çubuğunun Vurgula'sı yalnızca çapa sayfasını boyardı
    this._isAl(belge);
    const sec = window.getSelection();
    let katman = tamKatman(g.sayfalar[g.gecerli - 1]);
    if (!katman) {
      // Geçerli sayfanın katmanı yok (yeni açıldı, hızlı kaydırıldı ya da boş sayfa): önce kurulur; olmazsa görünür bir sayfanınki çapa olur.
      // Beklerken eski seçim kalkar (seçim çapasızken başka yer seçilince bütün belge seçimi de kalkar)
      d.aralik = null;
      sec.removeAllRanges();
      await katmanBekle(g, g.gecerli - 1);
      if (this.durum !== d) return false;
      katman = tamKatman(g.sayfalar[g.gecerli - 1]) || gorunurKatman(g);
    }
    if (katman) {
      const r = document.createRange();
      r.selectNodeContents(katman);
      d.aralik = [r.startContainer, r.startOffset, r.endContainer, r.endOffset];   // seçim değişince gelen selectionchange çapayı tanısın
      sec.removeAllRanges(); sec.addRange(r);
    }
    return true;
  }

  /**
   * Bütün belge seçimini kaldırır. Kopyalaması istenmiş hazırlık sürer (iptal: o da durur; Esc, belge kapanması). secimiBirak: tarayıcı seçimi
   * hâlâ çapadaysa o da kalkar (sekme değişimi, sayfa düzeni; yoksa geçerli sayfa tek başına seçili kalırdı).
   */
  kaldir({ iptal = false, secimiBirak = false } = {}) {
    const d = this.durum;
    if (d) {
      this.durum = null;
      d.kok.classList.remove(SINIF);
      if (secimiBirak && d.aralik && secimCapada(d.aralik)) window.getSelection().removeAllRanges();
    }
    const is = this.is;
    if (is && (iptal || !is.kopya)) is.iptal = true;
    this.is = null;
    if (iptal) this._bekleyenleriDurdur();
  }

  /** Belgenin sayfa düzeni (sayfa listesi) ya da görünüm düzeni (tek / iki sayfa, kaydırma) değişti: o belgenin seçimi kalkar. Kopyalaması
   *  istenmiş hazırlık sürer (kopyalama anındaki sayfaların metni). */
  duzenDegisti(belge) {
    if (this.durum?.belge === belge) this.kaldir({ secimiBirak: true });
  }

  /** Belge kapandı (ya da başka pencereye taşındı): seçimi ve o belgenin bütün hazırlıkları (kopyalaması istenmişler dâhil) durur; çekirdek
   *  kapanan dosyayı yeniden açıp kilitli tutmasın. */
  belgeKapandi(belge) {
    if (this.durum?.belge === belge) this.kaldir();
    if (this.is?.belge === belge) { this.is.iptal = true; this.is = null; }
    let durdu = false;
    for (const is of this.bekleyenler) if (is.belge === belge) { is.iptal = true; this.bekleyenler.delete(is); durdu = true; }
    if (durdu) this.bildir('Belge kapandığı için kopyalama durduruldu', 3000);
  }

  /** Esc: süren kopyalamayı durdurur ya da bütün belge seçimini kaldırır; bir şey yaptıysa true. */
  escIsle() {
    const durdu = this._bekleyenleriDurdur();
    if (durdu) this.bildir('Kopyalama durduruldu', 3000);
    if (this.durum) { this.kaldir({ iptal: true, secimiBirak: true }); return true; }
    return durdu;
  }

  /** Kopyalama olayı (uygulama.js 'copy'): bütün belge seçiliyse metni panoya verir (hazır değilse hazır olunca); işlediyse true. */
  kopyala(e) {
    if (!this.gecerli()) return false;
    e.preventDefault();
    const is = this._isAl(this.durum.belge);
    if (is.bitti) { e.clipboardData.setData('text/plain', is.metin); return true; }
    // Metin hazır değil: pano şimdilik boşalır (eski içerik yapıştırılıp bütün belge sanılmasın), hazır olunca pano hâlâ boşsa yazılır
    e.clipboardData.setData('text/plain', '');
    is.kopya = true;
    this.bekleyenler.add(is);
    is.sonIlerleme = 0;
    this._ilerlemeYaz(is, true);
    return true;
  }

  // ------------------------------------------------------------ hazırlık
  /** Seçimin hazırlığı: süren ya da biten iş belgenin şu anki sayfa listesininse o, değilse yeni iş. */
  _isAl(belge) {
    const liste = belge.gorunum.sayfalar;
    let is = this.is;
    if (is && (is.iptal || is.belge !== belge || is.liste !== liste)) { if (!is.kopya) is.iptal = true; is = null; }
    // Seçim kalkmış ama aynı sayfaların kopyalaması sürüyorsa o iş sürdürülür (ikinci kez hazırlanmaz)
    if (!is) is = [...this.bekleyenler].find((x) => !x.iptal && x.belge === belge && x.liste === liste) || null;
    if (!is) {
      is = { belge, liste, sayfalar: liste.filter((s) => !s.bos), sonuclar: [], yapilan: 0, hata: 0, iptal: false, bitti: false, metin: '', kopya: false, sonIlerleme: 0 };
      this._calistir(is).catch((err) => {
        console.warn('Belgenin metni hazırlanamadı', err);
        is.iptal = true;
        if (this.bekleyenler.delete(is)) this.bildir('Belgenin metni hazırlanamadı', 4000);
      });
    }
    this.is = is;
    return is;
  }

  /**
   * Sayfa sayfa, sırayla: çekirdeğin tek işçisi var, tek büyük istek kuyruğu saniyelerce tıkardı (öteki istekler, ör. küçük resimler, arada
   * yanıtlanır). Görselli sayfada önce yazı tanıma istenir (ocr_sayfa işçiyi tutmaz, tanıma kendi iş parçacığında); metin_sec tanınmamış
   * sayfada tanımayı işçide bekleyerek yapardı (en çok 30 sn, kuyruk tıkanırdı). Görselsiz sayfada ocr_sayfa hemen boş döner.
   */
  async _calistir(is) {
    for (let i = 0; i < is.sayfalar.length; i++) {
      if (is.iptal) return;
      const s = is.sayfalar[i];
      const { yol, sayfa } = s.kaynak;   // istek anında: kayıt kaynağı anlık kopyaya çevirmiş olabilir
      const k = onbellek.get(s);
      let r = k && k.yol === yol && k.sayfa === sayfa ? k.sonuc : undefined;
      if (r === undefined) {
        try {
          if (!tanimaYok) {
            const t = await this.cekirdek('ocr_sayfa', { yol, sayfa }).catch(() => null);
            if (t?.desteklenmiyor) tanimaYok = true;
            if (is.iptal) return;
          }
          r = await this.cekirdek('metin_sec', { yol, sayfa, kutular: KAPLAYAN });
          onbellek.set(s, { yol, sayfa, sonuc: r });
        } catch (err) {
          console.warn('Sayfanın metni alınamadı', sayfa, err);
          r = null; is.hata++;
        }
        if (is.iptal) return;
      }
      is.sonuclar[i] = r;
      is.yapilan = i + 1;
      if (is.kopya) this._ilerlemeYaz(is);
    }
    // Sayfa geçişinde paragraf sürer ya da (boş satırla) ayrılır; ilk satırın sayfada dolu olup olmadığını çekirdek söyler (uygulama.js copy)
    const ilkDolu = !!is.sonuclar.find((r) => r?.metin?.trim())?.ilk_dolu;
    is.metin = temizMetin(sayfaMetinleriniBirlestir(is.sonuclar), { ilkDolu });
    is.bitti = true;
    if (!is.kopya) return;
    this.bekleyenler.delete(is);
    // Kopyalamada pano boşaltılmıştı: yalnızca hâlâ boşsa yazılır (bu arada başka bir şey kopyalandıysa onun yerine geçmez)
    const yazildi = await this.panoyaYaz(is.metin, '');
    if (is.iptal) return;
    const n = is.sayfalar.length;
    if (!yazildi) this.bildir('Bu arada başka bir şey kopyalandığı için belgenin metni panoya yazılmadı', 5000);
    else if (is.hata) this.bildir(`Belgenin metni kopyalandı; ${is.hata} sayfanın metni alınamadı`, 5000);
    else this.bildir(`Belgenin metni kopyalandı (${n} sayfa)`, 3000);
  }

  _ilerlemeYaz(is, hemen = false) {
    const simdi = performance.now();
    if (!hemen && simdi - is.sonIlerleme < ILERLEME_ARALIGI) return;
    is.sonIlerleme = simdi;
    this.bildir(`Metin hazırlanıyor (${is.yapilan}/${is.sayfalar.length})… Durdurmak için Esc`, 60000);
  }

  _bekleyenleriDurdur() {
    let durdu = false;
    for (const is of this.bekleyenler) { is.iptal = true; durdu = true; }
    this.bekleyenler.clear();
    return durdu;
  }
}
