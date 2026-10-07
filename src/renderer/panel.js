// Sol panel: Sayfalar (küçük resimler), İçindekiler (yer imleri), Yorumlar (notlar).
import { yolAnahtari } from './goruntuleyici.js';

const aciyaIndir = (d) => ((d % 360) + 360) % 360;

/** Sayfanın kaynak dosyasına artımlı kayıtla işlenmiş göreli döndürme (uygulama.js belge.diskDondurme). Kaynak görünümün yüklendiği
 *  dosya ya da onun anlık kopyasıysa diskteki /Rotate, PDF.js'in yüklediği tabandan bu kadar farklıdır; başka kaynakta 0. */
function diskDondurmesi(b, s) {
  const d = b.diskDondurme?.[s.kaynak.sayfa];
  if (!d) return 0;
  const g = b.gorunum, k = yolAnahtari(s.kaynak.yol);
  return (g.yol && yolAnahtari(g.yol) === k) || (g.anlik && yolAnahtari(g.anlik) === k) ? d : 0;
}

// Küçük resimler panelin genişliğine uyar (0.2.2, kullanıcı isteği: "sağ penceresi sıkıştırıldığında sayfalar da sıkışsın (tam görüntüleme
// bozulmadan küçülsün) ve mavi işaret düzgün olsun; genişletildiğinde sayfalar da büyüsün"). 0.2.1'e dek genişlik alan kurulurken bir kez
// hesaplanıp satır içi px yazılıyordu; panel boyutu değişince resimler eski boyutta kalıyor, daraltılınca hücreden taşıp kırpılıyor, hücreye
// çizilen mavi çerçeve resmin içinden geçiyordu. Artık boyut CSS'ten gelir (stil.css: resim, yer tutucu ve döndürülen resmin kutusu hücrenin
// içinin tam genişliğinde, yükseklik orandan); tutamaç sürüklenirken DOM'a dokunulmadan canlı uyar. Çözünürlük ayrı iştir: panel genişleyince
// düşük çözünürlüklü kalan resimler durulunca daha yüksek çözünürlükte yeniden istenir, yeni resim gelene dek eskisi yerinde kalır;
// daralınca yeniden istenmez (büyük resim küçültülerek gösterilir).
const KUCUK_RESIM_KADEMESI = 64;     // istenen genişlik bu kadar cihaz pikseline yukarı yuvarlanır: her birkaç piksellik boy değişiminde yeniden istenmesin
const KUCUK_RESIM_EN_FAZLA = 1200;   // istenen genişliğin üst sınırı (cihaz pikseli): panel 60vw'ye dek büyüyebiliyor, sayfa başına resim büyümesin
const BOYUT_DURULMA_MS = 250;        // panel genişliği bu kadar değişmeden kalınca (sürükleme bitti) çözünürlük denetlenir
// Önbellek sınırı (0.2.2, bağımsız inceleme): panel en geniş hâline getirilip uzun belge baştan sona kaydırılınca her sayfanın 768–1200 px'lik
// PNG'si önbellekte ve hücrede kalıyor, panel daraltılsa da belge kapanana dek bellekte duruyordu (410 sayfada ~86 MB data URL, süreç +151
// MB). Bütün belgelerin resimlerinin toplam boyu (data URL karakteri) bu sınırı aşınca en uzun süredir kullanılmayanlar bırakılır: önce
// panelde gösterilmeyen belgelerinkiler, sonra gösterilen belgede görünen alandan uzak hücrelerinkiler (hücre yer tutucuya döner, göründükçe
// yeniden istenir: ilk açılıştaki gibi). Varsayılan genişlikte (240 px) yüzlerce sayfa sınırın altında kalır; görünen ve yakındaki
// hücrelere dokunulmaz.
const KUCUK_RESIM_BELLEK = 48 * 1024 * 1024;
const UZAK_ALAN = 2;                 // görünen alandan en az bu kadar alan yüksekliği uzaktaki hücrelerin resmi bırakılabilir
// İstek kuyruğu (0.2.3, kullanıcı isteği: "sayfaları kaydırırken daha hızlı yüklensin. hafif geç yükleniyor gibi oluyor"). 0.2.2'ye dek
// gözlemci hücre göründüğü anda isteği çekirdeğe gönderiyordu: sıra, öncelik, iptal yoktu; çekirdek de istekleri tek iş parçacığında
// geliş sırasıyla işler. Panelde hızla gezinince (kaydırma çubuğunu sürükleme, ana görünümü hızla kaydırma) geçilen her hücrenin isteği
// çekirdekte birikiyor, varılan yerin resimleri onların hepsi üretilene dek boş kalıyordu (410 sayfalık belgede 480 px'lik panelin çubuğu
// sürüklenip bırakılınca ~2 sn; istek gecikmesi ortancası 1,2–1,4 sn). Artık istekler panelin kuyruğunda bekler: çekirdekte aynı anda en
// çok KUYRUK_ESZAMANLI istek; sıradaki, görünen alana en yakın hücre (kaydırma yönündekiler önce); görünen alandan uzaklaşan hücrenin isteği
// hiç gönderilmez, hücre gözlemciye geri verilir (geri gelince yeniden istenir). Uzaktakiler düştüğü için gözlemcinin payı büyütüldü: hücre
// bir alan yüksekliği önceden istenir (0.2.2'de 300 px), görünenler bitmeden önden yükleme başlamaz.
const KUYRUK_ESZAMANLI = 2;          // biri çekirdekte işlenirken öteki onun ardında bekler: çekirdek boşta kalmaz, ardında sıra uzamaz
const ON_YUKLEME_PAYI = '100% 0px';  // gözlemcinin payı (rootMargin): görünen alanın bir alan yüksekliği üstü ve altı
const DUSME_ALANI = 2;               // görünen alandan bu kadar alan yüksekliğinden (pay + bir alan) uzaklaşan hücrenin isteği gönderilmez
const GERI_AGIRLIK = 2;              // kaydırma yönünün tersindeki hücrenin uzaklığı bu kadar katıyla sayılır: önce gidilen yöndekiler

/** Küçük resim için çekirdekten istenecek genişlik (cihaz pikseli): ekrandaki genişlik (CSS pikseli) × ekran ölçeği (en çok 2, 0.2.1'deki
 *  gibi) × oran (resim ekranda 90/270° döndürülüyorsa resmin genişliği ekranda yükseklik olur: resmin genişliği / yüksekliği), kademeye
 *  yukarı yuvarlanmış ve üst sınırlı. */
export function kucukResimIstegi(css, dpr, oran = 1) {
  const cihaz = Math.max(1, css) * Math.min(2, dpr || 1) * oran;
  return Math.min(KUCUK_RESIM_EN_FAZLA, Math.ceil(cihaz / KUCUK_RESIM_KADEMESI) * KUCUK_RESIM_KADEMESI);
}

/** Çekirdeğin 'kucuk_resim' yanıtının adresi (data URL). 0.2.3'ten beri görsel ağırlıklı sayfanın (taranmış evrak, büyük fotoğraf) resmi
 *  JPEG, ötekiler PNG (core/pdefe_core.py kucuk_resim_bicimi); 0.2.2'ye dek hep PNG'ydi ve alanı 'png'di. */
export function kucukResimAdresi(r) {
  return `data:image/${r.bicim === 'jpeg' ? 'jpeg' : 'png'};base64,${r.veri}`;
}

/** Hücrenin yer tutucusu: ekrandaki yönde (taban /Rotate s.pt'de, üstüne göreli ve görünüm döndürmesi), genişliği CSS'ten (hücrenin içi),
 *  yüksekliği bu orandan; boyutu henüz öğrenilmemiş sayfada resim gelince resmin kendi oranı geçerli olur. */
function yerTutucuHtml(b, s) {
  const d = aciyaIndir((s.dondurme || 0) + (b.gorunum.gorunumDondurme || 0));
  const [w, h] = d % 180 === 0 ? [s.pt.w, s.pt.h] : [s.pt.h, s.pt.w];
  return `<div class="bos" style="aspect-ratio:${+w} / ${+h}"></div>`;
}

export class SolPanel extends EventTarget {
  constructor({ panel, tutamac, sayfalar, icindekiler, yorumlar, sekmeler, cekirdek }) {
    super();
    this.panel = panel; this.tutamac = tutamac;
    this.alanlar = { sayfalar, icindekiler, yorumlar };
    this.sekmeler = sekmeler;
    this.cekirdek = cekirdek;
    this.aktifSekme = 'sayfalar';
    this.belge = null;         // aktif sekmenin bilgileri {id, yol, gorunum}
    this.kucukResimler = new Map();   // belgeId → Map(kaynak sayfa anahtarı → { src: dataURL, istenen: istenen genişlik, cihaz pikseli, boy, zaman })
    this.kucukResimSiniri = KUCUK_RESIM_BELLEK;   // önbelleğin toplam boyu (data URL karakteri) üst sınırı (bellegiSinirla)
    this._kullanim = 0;        // önbellek kayıtlarının son kullanım sırası (en uzun süredir kullanılmayan önce bırakılır)
    this._gozlemci = null;
    this._sayfalarB = null;    // Sayfalar alanının küçük resimlerini gösterdiği belge (belgeUnut, çözünürlük denetimi)
    this._capa = null;         // kaydırma yerinin çapası (capaKaydet)
    this._sonGenislik = 0;     // Sayfalar alanının son bilinen iç genişliği (yalnızca genişlik değişimi işlenir)
    this._sonOlcek = 0;        // o andaki ekran ölçeği (devicePixelRatio): ölçek değişimi de işlenir
    this._kuyruk = new Map();  // istek bekleyen hücre → { b, onbellek } (gözlemciden çıkarılmış; gönderilmezse geri verilir)
    this._yolda = 0;           // çekirdekte yanıtı beklenen küçük resim isteği sayısı (en çok KUYRUK_ESZAMANLI)
    this._yon = 0;             // Sayfalar alanının son kaydırma yönü (1 aşağı, −1 yukarı, 0 bilinmiyor): kuyruğun önceliği
    this._sonKaydirma = 0;     // alanın son scrollTop'u (yön için)

    sekmeler.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.sekmeSec(b.dataset.panel)));

    // Sayfalar alanının genişliği değişince (tutamaç, pencere boyutu, 60vw sınırı, panel açılınca) küçük resimler CSS'le kendiliğinden uyar;
    // gözlemci yalnızca kaydırma yerini korur ve çözünürlük denetimini planlar. Boyut yazmaz: "ResizeObserver loop" döngüsü kurulmaz.
    new ResizeObserver(() => this.sayfalarBoyutlandi()).observe(sayfalar);
    sayfalar.addEventListener('scroll', () => {
      const st = sayfalar.scrollTop;
      if (st !== this._sonKaydirma) { this._yon = st > this._sonKaydirma ? 1 : -1; this._sonKaydirma = st; }
      if (!this._boyutlaniyor) this.capaKaydet();
    }, { passive: true });
    // Ekran ölçeği değişince (pencere başka ölçekli ekrana taşındı) CSS genişliği aynı kaldığı için ResizeObserver gelmez: ölçeğe bağlı
    // ortam sorgusu dinlenir (goruntuleyici.js dprDinle gibi), çözünürlük denetlenir. Panel kapalıyken değiştiyse panel açılınca (ölçek de
    // sayfalarBoyutlandi'nin karşılaştırmasında; bağımsız inceleme)
    const olcekDinle = () => matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      .addEventListener('change', () => { olcekDinle(); this.sayfalarBoyutlandi(); }, { once: true });
    olcekDinle();

    // Genişlik sürükleme
    let baslangicX = 0, baslangicW = 0;
    tutamac.addEventListener('mousedown', (e) => {
      baslangicX = e.clientX; baslangicW = panel.getBoundingClientRect().width;
      const hareket = (e2) => { const w = Math.max(140, Math.min(window.innerWidth * 0.6, baslangicW + e2.clientX - baslangicX)); panel.style.width = w + 'px'; };
      const birak = () => {
        document.removeEventListener('mousemove', hareket); document.removeEventListener('mouseup', birak);
        document.body.style.cursor = '';
        this.dispatchEvent(new CustomEvent('genislik', { detail: { genislik: panel.getBoundingClientRect().width } }));
      };
      document.body.style.cursor = 'ew-resize';
      document.addEventListener('mousemove', hareket); document.addEventListener('mouseup', birak);
      e.preventDefault();
    });
  }

  get acik() { return !this.panel.hidden; }

  acKapa(deger) {
    const yeni = deger ?? this.panel.hidden;
    this.panel.hidden = !yeni;
    if (yeni) this.yenile();
    this.dispatchEvent(new CustomEvent('durum', { detail: { acik: yeni } }));
  }

  genislikAyarla(w) { this.panel.style.width = w + 'px'; }

  sekmeSec(ad) {
    this.aktifSekme = ad;
    this.sekmeler.querySelectorAll('button').forEach((b) => b.classList.toggle('secili', b.dataset.panel === ad));
    for (const [k, el] of Object.entries(this.alanlar)) el.hidden = k !== ad;
    this.yenile();
    this.dispatchEvent(new CustomEvent('sekme', { detail: { sekme: ad } }));
  }

  /** Aktif belge değişti. */
  belgeAyarla(belge) {
    this.belge = belge;
    this._icindekilerHazir = null;
    this._yorumlarHazir = null;
    this._sayfalarHazir = null;
    if (this.acik) this.yenile();
  }

  /** Belge kapandı: küçük resim önbelleği silinir. Sayfalar alanı o belgenin küçük resimlerini gösteriyorsa (panel kapalı ya da başka
   *  panel sekmesindeyken yeniden kurulmaz) gözlemci ve resimler de bırakılır: gözlemcinin geri çağrısı kapanan belgeyi tutuyordu. */
  belgeUnut(belgeId) {
    this.kucukResimler.delete(belgeId);
    for (const [el, k] of this._kuyruk) if (k.b.id === belgeId) this._kuyruk.delete(el);   // kapanan belgenin bekleyen istekleri gönderilmez
    if (this._sayfalarB?.id !== belgeId) return;
    this._gozlemci?.disconnect(); this._gozlemci = null;
    this.alanlar.sayfalar.innerHTML = '';
    this._sayfalarB = null; this._sayfalarHazir = null; this._capa = null;
  }

  /** Belgenin notları kaydedildi (0.2.1): küçük resimler diskteki hâlden notlarıyla çizilir, önbellek anahtarı (yol, sayfa, diskteki
   *  döndürme) not kaydıyla değişmez; silinen not resimde kalıyor, yeni not görünmüyordu. Belgenin önbelleği boşaltılır; Sayfalar alanı
   *  o belgeyi gösteriyorsa resimler yerinde yenilenir: alan baştan kurulmaz (kaydırma yeri ve eski resim yenisi gelene dek kalır),
   *  görünenler hemen, ötekiler göründükçe yeniden istenir (gözlemci). */
  kucukResimleriYenile(belgeId) {
    this.kucukResimler.get(belgeId)?.clear();   // gözlemcinin geri çağrısı aynı önbelleği tutar: silinmez, boşaltılır
    if (this._sayfalarB?.id !== belgeId || !this._gozlemci) return;
    for (const el of this.alanlar.sayfalar.querySelectorAll('.kucuk-resim')) this._gozlemci.observe(el);
  }

  yenile() {
    if (!this.acik) return;
    if (!this.belge) {
      for (const el of Object.values(this.alanlar)) el.innerHTML = '<p class="soluk">Açık belge yok.</p>';
      this._gozlemci?.disconnect(); this._gozlemci = null; this._sayfalarB = null; this._capa = null;   // kaldırılan küçük resimler belgeyi tutmasın
      this._kuyruk.clear();
      return;
    }
    if (this.aktifSekme === 'sayfalar') this.sayfalariDoldur();
    else if (this.aktifSekme === 'icindekiler') this.icindekileriDoldur();
    else this.yorumlariDoldur();
  }

  // ------------------------------------------------------------ Sayfalar
  sayfalariDoldur() {
    const alan = this.alanlar.sayfalar;
    const b = this.belge;
    if (this._sayfalarHazir === b.id) { this.gecerliSayfaIsaretle(b.gorunum.gecerli); return; }
    this._sayfalarHazir = b.id;
    this._sayfalarB = b;   // alanın küçük resimleri hangi belgenin (belgeUnut, çözünürlük denetimi)
    alan.innerHTML = '';
    if (this._gozlemci) this._gozlemci.disconnect();
    this._kuyruk.clear();   // eski hücreler kalktı; yoldaki istekler sürer, yanıtları önbelleğe girer
    this._yon = 0; this._sonKaydirma = alan.scrollTop;
    const onbellek = this.kucukResimler.get(b.id) || new Map();
    this.kucukResimler.set(b.id, onbellek);
    // Görünen (ve bir alan yüksekliği yakınındaki) hücrenin resmi önbellekten konur ya da kuyruğa girer (_hucreGorundu); genişlik istek
    // gönderilirken okunur (panel o arada boyutlanmış olabilir)
    this._gozlemci = new IntersectionObserver((girdiler, gozlemci) => {
      for (const g of girdiler) {
        if (!g.isIntersecting) continue;
        gozlemci.unobserve(g.target);
        this._hucreGorundu(b, g.target, onbellek);
      }
      this._kuyrukIsle();   // bildirimin bütün hücreleri kuyruktayken: ilk gönderilen de en yakın olsun
    }, { root: alan, rootMargin: ON_YUKLEME_PAYI });

    const n = b.gorunum.sayfaSayisi;
    for (let no = 1; no <= n; no++) {
      const s = b.gorunum.sayfalar[no - 1];
      const el = document.createElement('div');
      el.className = 'kucuk-resim' + (no === b.gorunum.gecerli ? ' gecerli' : '');
      el.dataset.sayfa = String(no);
      el.innerHTML = `${yerTutucuHtml(b, s)}<span class="no">${no}</span>`;
      el.addEventListener('click', () => this.dispatchEvent(new CustomEvent('sayfayaGit', { detail: { sayfa: no } })));
      alan.append(el);
      this._gozlemci.observe(el);
    }
    this._sonGenislik = alan.clientWidth; this._sonOlcek = window.devicePixelRatio || 1;
    this._capa = null;
    this.gecerliSayfaIsaretle(b.gorunum.gecerli, true);
  }

  /** Sayfanın resmi için çekirdekten istenecek genişlik (cihaz pikseli), hücrenin o anki genişliğinden. disk: diske işlenmiş döndürme. */
  istenenGenislik(b, s, disk = diskDondurmesi(b, s)) {
    // Resim, yer tutucu ve döndürülen resmin kutusu hücrenin içinin tam genişliğinde: ilk hücreninki hepsininki
    const css = this.alanlar.sayfalar.querySelector('.kucuk-resim > :first-child')?.getBoundingClientRect().width || 160;
    // Resim ekranda 90/270° döndürülüyorsa (ekrandaki yön eksi diske işlenmiş olan) resmin genişliği ekranda yüksekliktir. Resim diskteki
    // yönde çizilir: s.pt tabandaki yön, diske işlenmiş 90/270 en ve boyu değiştirir.
    const d = aciyaIndir((s.dondurme || 0) + (b.gorunum.gorunumDondurme || 0) - disk);
    const oran = d % 180 === 0 ? 1 : aciyaIndir(disk) % 180 === 0 ? s.pt.w / s.pt.h : s.pt.h / s.pt.w;
    return kucukResimIstegi(css, window.devicePixelRatio, oran);
  }

  /** Hücredeki resim, hücrenin şimdiki genişliği için düşük çözünürlüklü mü (panel genişledi: yeniden istenmeli). Resmi henüz gelmemiş
   *  hücre sayılmaz (gözlemci zaten yükleyecek). */
  yenidenIstenecekMi(el) {
    const b = this._sayfalarB, img = el.querySelector('img'), s = b?.gorunum.sayfalar[+el.dataset.sayfa - 1];
    return !!(img && s && +img.dataset.istenen < this.istenenGenislik(b, s));
  }

  /** Sayfanın önbellek anahtarı ve istenecek genişliği. Çekirdek sayfayı diskteki /Rotate ile çizer: kayıtla diske işlenmiş döndürme
   *  resimde vardır, anahtar ona göre ayrılır. */
  _resimAnahtari(b, s) {
    const disk = diskDondurmesi(b, s);
    return { disk, anahtar: (s.kaynak.yol + '#' + s.kaynak.sayfa).toLowerCase() + '#' + disk, istenen: this.istenenGenislik(b, s, disk) };
  }

  /** Gözlemci hücrenin görünen alanın payına girdiğini bildirdi: önbellekte yeterli resim varsa hemen konur (çekirdeğe gitmez), yoksa hücre
   *  kuyruğa girer (gözlemcinin geri çağrısı ardından _kuyrukIsle'yi çağırır). */
  _hucreGorundu(b, el, onbellek) {
    const s = b.gorunum.sayfalar[+el.dataset.sayfa - 1];
    if (s && !s.bos) {
      const { anahtar, istenen } = this._resimAnahtari(b, s);
      if (!(onbellek.get(anahtar)?.istenen >= istenen)) { this._kuyruk.set(el, { b, onbellek }); return; }
    }
    this.kucukResimYukle(b, +el.dataset.sayfa, el, onbellek);
  }

  /** Kuyruktan çekirdeğe istek gönderir: yer oldukça (KUYRUK_ESZAMANLI) görünen alana en yakın hücreninkini; her yanıt geldiğinde sıradaki.
   *  Seçim gönderme anında yapılır (hücrelerin o anki yeri); istenen genişlik de gönderilirken okunur. */
  _kuyrukIsle() {
    while (this._yolda < KUYRUK_ESZAMANLI && this._kuyruk.size) {
      const el = this._kuyruktanSec();
      if (!el) return;
      const { b, onbellek } = this._kuyruk.get(el);
      this._kuyruk.delete(el);
      this._yolda++;
      let birakildi = false;
      const birak = () => { if (birakildi) return; birakildi = true; this._yolda--; this._kuyrukIsle(); };
      this.kucukResimYukle(b, +el.dataset.sayfa, el, onbellek, birak).finally(birak);
    }
  }

  /** Kuyruğun sıradaki hücresi: görünen hücreler (uzaklık 0) önce, sonra görünen alana en yakın; kaydırma yönünün tersindekilerin uzaklığı
   *  GERI_AGIRLIK katıyla sayılır. Görünen alandan DUSME_ALANI alan yüksekliğinden uzaklaşmış ya da panelden kalkmış hücreler kuyruktan
   *  düşer; uzaklaşanlar gözlemciye geri verilir (yeniden yaklaşınca yeniden istenir). Alan görünmüyorsa (panel kapandı, başka panel sekmesi
   *  seçildi) bekleyenlerin hepsi geri verilir: alan görününce gözlemci yeniden bildirir. Kuyruk boşalınca null. */
  _kuyruktanSec() {
    const alan = this.alanlar.sayfalar, h = alan.clientHeight;
    const geriVer = (el) => { this._kuyruk.delete(el); if (el.isConnected) this._gozlemci?.observe(el); };
    if (!this.acik || this.aktifSekme !== 'sayfalar' || !h) { for (const el of [...this._kuyruk.keys()]) geriVer(el); return null; }
    const ar = alan.getBoundingClientRect(), ust = ar.top + alan.clientTop, alt = ust + h;
    let secilen = null, enIyi = Infinity;
    for (const el of [...this._kuyruk.keys()]) {
      if (!el.isConnected) { this._kuyruk.delete(el); continue; }
      const r = el.getBoundingClientRect();
      const asagida = r.top >= alt, yukarida = r.bottom <= ust;
      const uzaklik = asagida ? r.top - alt : yukarida ? ust - r.bottom : 0;
      if (uzaklik > DUSME_ALANI * h) { geriVer(el); continue; }
      const puan = uzaklik * ((asagida && this._yon < 0) || (yukarida && this._yon > 0) ? GERI_AGIRLIK : 1);
      if (puan < enIyi) { secilen = el; enIyi = puan; }
    }
    return secilen;
  }

  /** Hücrenin resmini koyar: önbellekte yeterlisi yoksa çekirdekten ister. cekirdektenSonra: çekirdeğin yanıtı (ya da hatası) gelince bir kez
   *  çağrılır (kuyruğun yeri resim çözülmeyi beklemeden boşalır). */
  async kucukResimYukle(b, no, el, onbellek, cekirdektenSonra = null) {
    try {
      const s = b.gorunum.sayfalar[no - 1];
      if (!s) return;
      if (s.bos) { el.querySelector('.bos')?.classList.add('bos-sayfa'); return; }
      // Önbellekte sayfanın en büyük çözünürlüklü resmi durur: istenenden küçük değilse kullanılır (daralınca yeniden istenmez), küçükse
      // yeniden istenir.
      const { disk, anahtar, istenen } = this._resimAnahtari(b, s);
      const sira = el._istek = (el._istek || 0) + 1;   // hücrenin sonraki isteği öncekini geçersiz kılar: geç gelen düşük çözünürlük yenisini ezmesin
      let kayit = onbellek.get(anahtar);
      if (!kayit || kayit.istenen < istenen) {
        let r;
        try { r = await this.cekirdek('kucuk_resim', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, genislik: istenen }); } finally { cekirdektenSonra?.(); }
        const src = kucukResimAdresi(r);
        kayit = { src, istenen, boy: src.length, zaman: ++this._kullanim };
        if (!(onbellek.get(anahtar)?.istenen >= istenen)) { onbellek.set(anahtar, kayit); this.bellegiSinirla(kayit); }
      }
      kayit.zaman = ++this._kullanim;
      if (!el.isConnected || el._istek !== sira || el._kayit === kayit) return;   // panel yeniden kuruldu, yeni istek var ya da aynı resim yerinde
      const img = document.createElement('img');
      img.src = kayit.src; img.draggable = false;
      img.dataset.istenen = String(kayit.istenen);
      await img.decode().catch(() => {});
      if (!el.isConnected || el._istek !== sira || !img.naturalWidth) return;   // resim çözülemedi: yer tutucu ya da önceki resim kalır
      el._kayit = kayit;
      // Resmin ekranda ayrıca döndürüleceği açı: ekrandaki yön (göreli + görünüm döndürmesi) eksi diske işlenmiş olan
      const d = aciyaIndir((s.dondurme || 0) + (b.gorunum.gorunumDondurme || 0) - disk);
      // Yerine konan: yer tutucu ya da (kayıttan sonra ya da genişleyince yenilenirken) önceki resim
      const eski = () => el.querySelector(':scope > .bos, :scope > img, :scope > .donuk');
      if (!d) eski()?.replaceWith(img);
      else {
        // Döndürülen resim, ekrandaki (döndürülmüş) oranda ve hücre genişliğindeki kutunun ortasında döner. Resmin boyutu kutuya göre
        // yüzde: 90/270'te resmin genişliği kutunun yüksekliği, yüksekliği kutunun genişliği olur (kutunun genişlik / yükseklik oranı =
        // resmin yükseklik / genişlik oranı); boyut panelle birlikte değişir
        const yan = d % 180 !== 0, nw = img.naturalWidth, nh = img.naturalHeight;
        const sarmal = document.createElement('div');
        sarmal.className = 'donuk' + (yan ? ' yan' : '');
        sarmal.style.aspectRatio = yan ? `${nh} / ${nw}` : `${nw} / ${nh}`;
        if (yan) { img.style.width = (100 * nw) / nh + '%'; img.style.height = (100 * nh) / nw + '%'; }
        img.style.transform = `translate(-50%, -50%) rotate(${d}deg)`;
        sarmal.append(img);
        eski()?.replaceWith(sarmal);
      }
      // Resim yoldayken panel genişlediyse (çözünürlük denetimi resmi henüz gelmemiş hücreyi atlar) daha büyüğü istenir
      if (!this._boyutlaniyor && this.yenidenIstenecekMi(el)) this._gozlemci?.observe(el);
    } catch (e) { console.warn('Küçük resim alınamadı', no, e.message); }
  }

  /** Önbellekteki resimlerin toplam boyu (data URL karakteri), bütün belgeler. */
  kucukResimBellegi() {
    let t = 0;
    for (const ob of this.kucukResimler.values()) for (const k of ob.values()) t += k.boy || 0;
    return t;
  }

  /** Önbellek sınırı aşıldıysa en uzun süredir kullanılmayan resimler bırakılır (KUCUK_RESIM_BELLEK), sınırın %90'ına inene dek (her yeni
   *  resimde yeniden bırakma olmasın): önce panelde gösterilmeyen belgelerinkiler, sonra gösterilen belgede hiçbir hücrede olmayanlar, en son
   *  görünen alandan uzak hücrelerinkiler (hücre yer tutucuya döner, gözlemciye yeniden verilir: göründükçe yeniden istenir). Hücrede kalan
   *  ama önbellekte olmayan resimler (kayıttan sonra önbellek boşaltıldı, daha büyüğü geldi) de sayılır ve uzaktaysa bırakılır. Görünen ve
   *  yakındaki hücrelere, yeni gelen kayda (korunan) dokunulmaz. */
  bellegiSinirla(korunan = null) {
    const sinir = this.kucukResimSiniri;
    let toplam = this.kucukResimBellegi();
    if (toplam <= sinir) return;
    const b = this._sayfalarB, alan = this.alanlar.sayfalar;
    // Gösterilen belgenin hücreleri: hangi resim hangi hücrelerde (aynı kaynak sayfa iki hücrede olabilir), hücre görünen alana yakın mı
    const hucreler = new Map(), yakin = new Set();
    const olcu = b && alan.clientHeight ? { ar: alan.getBoundingClientRect(), pay: UZAK_ALAN * alan.clientHeight } : null;
    for (const el of b ? alan.children : []) {
      if (!el._kayit) continue;
      if (!hucreler.has(el._kayit)) hucreler.set(el._kayit, []);
      hucreler.get(el._kayit).push(el);
      const r = olcu && el.getBoundingClientRect();
      if (!olcu || (r.bottom > olcu.ar.top - olcu.pay && r.top < olcu.ar.bottom + olcu.pay)) yakin.add(el._kayit);   // alan gizliyse hepsi
    }
    const adaylar = [], onbellekte = new Set();
    for (const [id, ob] of this.kucukResimler) {
      for (const [anahtar, k] of ob) {
        onbellekte.add(k);
        if (k === korunan || yakin.has(k)) continue;
        adaylar.push({ ob, anahtar, k, oncelik: !(b && id === b.id) ? 0 : hucreler.has(k) ? 3 : 1 });
      }
    }
    for (const k of hucreler.keys()) {   // yalnızca hücrede kalanlar
      if (onbellekte.has(k)) continue;
      toplam += k.boy || 0;
      if (!yakin.has(k)) adaylar.push({ ob: null, k, oncelik: 2 });
    }
    adaylar.sort((x, y) => x.oncelik - y.oncelik || (x.k.zaman || 0) - (y.k.zaman || 0));
    for (const a of adaylar) {
      if (toplam <= sinir * 0.9) break;
      a.ob?.delete(a.anahtar);
      toplam -= a.k.boy || 0;
      for (const el of hucreler.get(a.k) || []) {
        const s = b.gorunum.sayfalar[+el.dataset.sayfa - 1], eski = el.querySelector(':scope > img, :scope > .donuk');
        if (!s || !eski) continue;
        el._istek = (el._istek || 0) + 1; el._kayit = null;   // yoldaki istek de geçersiz
        eski.insertAdjacentHTML('beforebegin', yerTutucuHtml(b, s));
        eski.remove();
        this._gozlemci?.observe(el);
      }
    }
  }

  gecerliSayfaIsaretle(no, kaydir = false) {
    if (this.aktifSekme !== 'sayfalar' || !this.acik) return;
    const alan = this.alanlar.sayfalar;
    alan.querySelectorAll('.kucuk-resim.gecerli').forEach((el) => el.classList.remove('gecerli'));
    const el = alan.querySelector(`.kucuk-resim[data-sayfa="${no}"]`);
    if (el) { el.classList.add('gecerli'); el.scrollIntoView({ block: kaydir ? 'center' : 'nearest' }); }
    if (!this._boyutlaniyor) this.capaKaydet();
  }

  /** Sayfalar alanının boyutu (ResizeObserver) ya da ekran ölçeği (ortam sorgusu) değişti. Küçük resimler CSS'le kendiliğinden uyar; burada
   *  kaydırma yeri korunur (geçerli sayfa görünüyorsa alanda aynı yerde kalır, görünmüyorsa üstteki sayfa) ve boyut durulunca çözünürlük
   *  denetlenir. */
  sayfalarBoyutlandi() {
    const alan = this.alanlar.sayfalar, g = alan.clientWidth, olcek = window.devicePixelRatio || 1;
    // gizli (panel kapalı ya da başka sekmede), boş ya da yalnızca yükseklik değişti
    if (!g || !this._sayfalarB || (g === this._sonGenislik && olcek === this._sonOlcek)) return;
    this._sonGenislik = g; this._sonOlcek = olcek;
    this.capaUygula();
    this._boyutlaniyor = true;   // bu arada (kendi kaydırmamızla gelen) kaydırma olayı çapayı değiştirmesin
    clearTimeout(this._boyutZamani);
    this._boyutZamani = setTimeout(() => { this._boyutlaniyor = false; this.capaKaydet(); this.cozunurlukDenetle(); }, BOYUT_DURULMA_MS);
  }

  /** Kaydırma yerinin çapası: geçerli sayfa görünüyorsa onun ortası ve alandaki yeri (yükseklik oranı), görünmüyorsa alanın üst kenarındaki
   *  sayfanın o kenara denk gelen noktası. Genişlik değişince (sayfalarBoyutlandi) aynı nokta aynı yere getirilir: bütün resimler aynı oranda
   *  büyüyüp küçüldüğü için tarayıcının kendi kaydırma çapası geçerli sayfayı alandan çıkarabilirdi. */
  capaKaydet() {
    const alan = this.alanlar.sayfalar, h = alan.clientHeight;
    if (!h || !this._sayfalarB) return;
    const ust = alan.getBoundingClientRect().top + alan.clientTop;
    const gecerli = alan.querySelector('.kucuk-resim.gecerli'), r = gecerli?.getBoundingClientRect();
    if (r && r.bottom > ust && r.top < ust + h) { this._capa = { el: gecerli, t: 0.5, v: (r.top + r.height / 2 - ust) / h }; return; }
    // Hücreler alt alta: alt kenarı alanın üst kenarını geçen ilk hücre (ikili arama)
    const hucreler = alan.children;
    let a = 0, z = hucreler.length - 1;
    while (a < z) { const o = (a + z) >> 1; if (hucreler[o].getBoundingClientRect().bottom > ust) z = o; else a = o + 1; }
    const el = hucreler[a], rr = el?.getBoundingClientRect();
    this._capa = rr ? { el, t: rr.height ? (ust - rr.top) / rr.height : 0, v: 0 } : null;
  }

  capaUygula() {
    const c = this._capa, alan = this.alanlar.sayfalar;
    if (!c || !c.el.isConnected || !alan.clientHeight) return;
    const r = c.el.getBoundingClientRect(), ust = alan.getBoundingClientRect().top + alan.clientTop;
    alan.scrollTop += r.top - ust + c.t * r.height - c.v * alan.clientHeight;
  }

  /** Panel genişleyince düşük çözünürlüklü kalan resimler yeniden istenir: hücre gözlemciye yeniden verilir, görünenler hemen, ötekiler
   *  göründükçe yüklenir (kucukResimYukle; eski resim yenisi gelene dek yerinde). Daralınca istenmez. */
  cozunurlukDenetle() {
    if (!this._gozlemci || !this._sayfalarB || !this.alanlar.sayfalar.clientWidth) return;
    for (const el of this.alanlar.sayfalar.querySelectorAll('.kucuk-resim')) if (this.yenidenIstenecekMi(el)) this._gozlemci.observe(el);
  }

  // ------------------------------------------------------------ İçindekiler
  async icindekileriDoldur() {
    const alan = this.alanlar.icindekiler;
    const b = this.belge;
    if (this._icindekilerHazir === b.id) return;
    this._icindekilerHazir = b.id;
    alan.innerHTML = '<p class="soluk">Yükleniyor…</p>';
    let agac;
    try { agac = await b.gorunum.belge.getOutline(); } catch { agac = null; }
    if (this.belge !== b) return;
    alan.innerHTML = '';
    if (!agac || !agac.length) { alan.innerHTML = '<p class="soluk">Bu belgede içindekiler (yer imi) yok.</p>'; return; }
    alan.append(this.yerimiListesi(agac, b, 0));
  }

  yerimiListesi(ogeler, b, seviye) {
    const ul = document.createElement('ul');
    ul.className = 'yerimi';
    for (const o of ogeler) {
      const li = document.createElement('li');
      const cocukVar = o.items && o.items.length;
      if (cocukVar && seviye >= 1) li.classList.add('kapali');
      const satir = document.createElement('div');
      satir.className = 'satir';
      satir.innerHTML = `<span class="ok ${cocukVar ? '' : 'bos'}">▶</span><span class="baslik"></span>`;
      satir.querySelector('.baslik').textContent = o.title || '(başlıksız)';
      satir.title = o.title || '';
      satir.querySelector('.ok').addEventListener('click', (e) => { e.stopPropagation(); li.classList.toggle('kapali'); });
      satir.addEventListener('click', () => this.yerimineGit(o, b));
      li.append(satir);
      if (cocukVar) li.append(this.yerimiListesi(o.items, b, seviye + 1));
      ul.append(li);
    }
    ul.querySelectorAll('li').forEach((li) => { const ok = li.querySelector(':scope > .satir > .ok'); if (ok && !ok.classList.contains('bos')) ok.textContent = li.classList.contains('kapali') ? '▶' : '▼'; });
    ul.addEventListener('click', () => ul.querySelectorAll('li').forEach((li) => { const ok = li.querySelector(':scope > .satir > .ok'); if (ok && !ok.classList.contains('bos')) ok.textContent = li.classList.contains('kapali') ? '▶' : '▼'; }));
    return ul;
  }

  async yerimineGit(o, b) {
    try {
      const g = b.gorunum;
      let dest = o.dest;
      if (typeof dest === 'string') dest = await g.belge.getDestination(dest);
      if (!dest || !dest[0]) return;
      const idx = typeof dest[0] === 'object' ? await g.belge.getPageIndex(dest[0]) : dest[0];
      // Hedef, yüklenen dosyanın (g.belge) sayfasıdır; şimdiki yeri kaynak sayfasından bulunur (0.2.1; bağlantılar gibi, uygulama.js
      // baglantiyaGit). Sayfa silinmiş, eklenmiş ya da sıralanmışsa dizin aynı sayfayı göstermez; yüklenen dosyanın sayfalarının kaynak
      // yolu kayıtla değişebilir (anlık kopya, Farklı kaydet): o yol görünümün belge kaydındadır (kaynakYeniden onu da çevirir)
      const ana = [...g.belgeler.values()].find((k) => k.belge === g.belge);
      const i = !ana ? -1 : g.sayfalar.findIndex((s) => !s.bos && yolAnahtari(s.kaynak.yol) === yolAnahtari(ana.yol) && s.kaynak.sayfa === idx + 1);
      if (i < 0) { this.dispatchEvent(new CustomEvent('yerimiHedefiYok')); return; }
      const s = g.sayfalar[i];
      let y = null;
      if (dest[1]?.name === 'XYZ' && typeof dest[3] === 'number') y = s.pt.h - dest[3];
      else if (dest[1]?.name === 'FitH' && typeof dest[2] === 'number') y = s.pt.h - dest[2];
      this.dispatchEvent(new CustomEvent('sayfayaGit', { detail: { sayfa: i + 1, y: y != null && y >= 0 ? y : undefined } }));
    } catch (e) { console.warn('Yer imi çözülemedi', e); }
  }

  // ------------------------------------------------------------ Yorumlar
  yorumlariYenile() { this._yorumlarHazir = null; if (this.acik && this.aktifSekme === 'yorumlar') this.yorumlariDoldur(); }

  async yorumlariDoldur() {
    const alan = this.alanlar.yorumlar;
    const b = this.belge;
    if (this._yorumlarHazir === b.id) return;
    this._yorumlarHazir = b.id;
    let notlar = [];
    if (b.notlar && b.notlar.yuklendi) {
      notlar = b.notlar.liste().map((n) => ({ ...n, yanitlar: b.notlar.yanitlari(n) }));
    } else {
      alan.innerHTML = '<p class="soluk">Yükleniyor…</p>';
      try { notlar = (await this.cekirdek('notlar', { yol: b.yol })).notlar.filter((n) => !n.yanitXref); } catch (e) { alan.innerHTML = '<p class="soluk">Notlar okunamadı.</p>'; return; }
      if (this.belge !== b) return;
    }
    alan.innerHTML = '';
    if (!notlar.length) { alan.innerHTML = '<p class="soluk">Bu belgede yorum yok.</p>'; return; }
    for (const n of notlar) {
      const el = document.createElement('div');
      el.className = 'yorum';
      el.dataset.id = n.id || '';
      el.innerHTML = '<div class="ust"><span class="renk"></span><span class="tur"></span><span class="yazar"></span><span class="esnek"></span><span class="sayfa-no"></span></div><div class="icerik"></div><div class="yanit-sayisi"></div>';
      el.querySelector('.renk').style.background = n.renk || (n.tur === 'FreeText' ? (n.yazi?.renk || '#999') : '#ffd100');
      el.querySelector('.tur').textContent = notTurAdi(n);
      el.querySelector('.yazar').textContent = n.yazar || '';
      el.querySelector('.sayfa-no').textContent = 's. ' + n.sayfa + (n.degisim ? ' · ' + tarihBicimle(n.degisim) : '');
      el.querySelector('.icerik').textContent = n.icerik || '';
      if (!n.icerik) el.querySelector('.icerik').remove();
      const ys = (n.yanitlar || []).length;
      if (ys) el.querySelector('.yanit-sayisi').textContent = ys + ' yanıt'; else el.querySelector('.yanit-sayisi').remove();
      el.addEventListener('click', () => this.dispatchEvent(new CustomEvent('notaGit', { detail: { not: n } })));
      alan.append(el);
    }
  }
}

export function turAdi(tur) {
  return {
    Text: 'Not', Highlight: 'Vurgu', Underline: 'Altı çizili', StrikeOut: 'Üstü çizili', Squiggly: 'Dalgalı',
    FreeText: 'Yazı', Ink: 'Çizim', Square: 'Kare', Circle: 'Daire', Line: 'Çizgi', Polygon: 'Çokgen', PolyLine: 'Çoklu çizgi',
    Stamp: 'Damga', FileAttachment: 'Dosya eki', Caret: 'Düzeltme', Link: 'Bağlantı', Widget: 'Form alanı', Popup: 'Balon',
  }[tur] || tur;
}

/**
 * Notun gösterilen tür adı: not taşıyan vurgu (referans okuyucunun "Metinle ilgili yorum yap"ı, /IT /HighlightNote; ya da metni olan vurgu)
 * "Metin notu"dur, notsuz vurgu "Vurgu" kalır.
 */
export function notTurAdi(n) {
  if (n?.tur === 'Highlight' && (n.it === 'HighlightNote' || String(n.icerik || '').trim())) return 'Metin notu';
  return turAdi(n?.tur);
}

/** Not balonunun başlığındaki tür: metin notunda yalnızca "Not" (0.1.12, kullanıcı isteği; Yorumlar panelinde "Metin notu" kalır).
 *  0.1.14'e dek "Not:" idi; tür, yazar ve tarih artık ince dikey çizgilerle ayrılır (notlar.js balonYenile). */
export function balonTurAdi(n) {
  const ad = notTurAdi(n);
  return ad === 'Metin notu' ? 'Not' : ad;
}

/** PDF tarih dizesini (D:20260915225519+03'00') okunur biçime çevirir. */
export function tarihBicimle(d) {
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/.exec(d || '');
  if (!m) return d || '';
  return `${m[3]}.${m[2]}.${m[1]}` + (m[4] ? ` ${m[4]}:${m[5] || '00'}` : '');
}
