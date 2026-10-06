// Sayfaları düzenle: küçük resim ızgarası, çoklu seçim (tıklama, Ctrl/Shift, boş alandan sürükleyerek alan seçimi), sürükleyerek
// sıralama, sil, döndür, başka PDF'ten sayfa ekle, boş sayfa ekle, pencere içi geri al/yinele; standart kaydetme seçimi (ortak.js
// kayitSecimi; varsayılan "Yeni belge olarak kaydet"):
//  - Yeni belge: düzen çekirdek sayfalar_uygula ile yeni bir PDF'e yazılır (notlar, form alanları, bağlantılar ve korunan sayfaların
//    yer imleri yapısal kayıttaki gibi kopyalanır; geçici dosya + os.replace); özgün dosya ve sekme değişmez, yeni dosya yeni sekmede
//    açılır. Sayfalar dosyadaki kayıtlı hallerinden alınır (bkz. _yeniBelgeTarifi); sekmede kaydedilmemiş not değişikliği varsa önce sorulur.
//  - Üzerine yaz: Döndür'deki gibi tarif sekmeye geri alınabilir komut olarak uygulanır (baglam.sayfaTarifiUygula) ve belge
//    normal kayıt yoluyla kaydedilir (Ctrl+S ile aynı): Ctrl+Z ile geri alınıp yeniden kaydedilebilir. Sekmede kaydedilmemiş başka
//    değişiklik varsa önce sorulur.
// Çekirdek: kucuk_resim {yol, sayfa, genislik}, sayfa_boyutlari {yol} → {sayfalar:[{genislik, yukseklik}]} (yoksa belge_bilgi ile
// sayfa sayısı alınır, boyut A4 varsayılır), sayfalar_uygula {yol, hedef, tarif} (ilerlemeli).
import {
  pencereAc, pencereAcikMi, kacis, hataMetni, dosyaAdi, belgeTarifi, tarifDisari, anaKaynakMi, suruklemeSiralama, suruklemeKalintisi, oge,
  IslemIlerleme, kayitSecimi, degisiklikleriSor, kilitliHataMi, ciktiyiAc, yolAyni,
} from './ortak.js';
import { kaydetmedenCikisSorusu } from '../mesajKutusu.js';
import { tus } from '../platform.js';

// Kart resimleri büyük (0.2.2, kullanıcı isteği: "araçlardaki dosyaların, görüntülerin boyutu büyük olsun ki görebilelim içeriğini"): resim
// kutusunun kenarı araclar.css'teki --kart-resim (150 → 220 px); ızgara sütunu, boş sayfa ve hata yer tutucusu ondan türer. Resim çekirdekten
// ekran ölçeğine göre keskin istenir (_resimGenisligi; 0.2.1'e dek ölçekten bağımsız 160 px, %125 / %150 ekranda yatay sayfa bulanıktı).
const KART_RESIM_EN_FAZLA = 600;   // istenen genişliğin üst sınırı (cihaz pikseli): 220 px kutu × 2 = 440; CSS değişkeni büyütülse de PNG büyümesin
const GECMIS_SINIRI = 200;
const A4 = { w: 595.276, h: 841.89 };
const aci = (d) => ((d || 0) % 360 + 360) % 360;

export class SayfalarPenceresi {
  constructor(baglam, belge) {
    this.baglam = baglam;
    this.belge = belge;
    this.kimlikSayac = 0;
    // Sekmedeki sayfa girdileri (goruntuleyici.js), belgeTarifi ile aynı sırada: sekmeden gelen kart (k.sekme) kaynağını ve kimliğini
    // buradan okur (yapısal kayıt girdinin kaynağını anlık kopyaya çevirebilir; döndürme girdiyi aynı kimlikli kopyayla değiştirir)
    this.sekmeGirdileri = [...(belge.gorunum?.sayfalar || [])];
    this.kartlar = this._baslangicKartlari();
    this.baslangicImza = this._imza(this.kartlar);
    this.secim = new Set();
    this.capa = null;
    this.odak = null;
    this.gecmis = [];
    this.gecmisKonum = 0;
    this.ogeler = new Map();          // kimlik → kart öğesi
    this.resimOnbellek = new Map();   // "yol|sayfa|istenen genişlik" → Promise<{png, genislik, yukseklik}>
    this._alanTiki = false;           // alan seçimi bırakıldı: bırakışın tıklaması (sonraki basıştan önce gelir) seçimi değiştirmesin
    this.ilerleme = new IslemIlerleme();
    this._kur();
  }

  // ---------------------------------------------------------------- model
  _baslangicKartlari() {
    return belgeTarifi(this.belge).map((t, i) => ({
      kimlik: ++this.kimlikSayac, sekme: i,
      kaynak: t.kaynak, sayfa: t.sayfa, dondurme: t.dondurme || 0,
      genislik: t.pt?.w || t.genislik || A4.w, yukseklik: t.pt?.h || t.yukseklik || A4.h,
      bos: t.kaynak === null, yeni: false,
    }));
  }

  /** Düzenin imzası (değişti mi): sekmeden gelen kart sekmedeki sırasıyla tanınır (kaynağı kayıtta yeniden adlandırılabilir). */
  _imza(kartlar) { return JSON.stringify(kartlar.map((k) => [k.sekme ?? k.kaynak, k.sekme != null ? 0 : k.sayfa, k.dondurme, k.bos ? [Math.round(k.genislik), Math.round(k.yukseklik)] : 0])); }
  get degisti() { return this._imza(this.kartlar) !== this.baslangicImza; }

  /** Kartın kaynağı {yol, sayfa}. Sekmeden gelen kartta sekmedeki girdinin güncel kaynağı okunur: pencere açıkken yapılan ilk yapısal
   *  kayıt (ör. "Kaydet ve devam et") sekmenin sayfalarını anlık kopyaya çevirir, dosyanın kendisi artık yeni düzendedir. */
  _kaynak(k) {
    const s = k.sekme != null ? this.sekmeGirdileri[k.sekme] : null;
    return s && !s.bos && s.kaynak ? { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa } : { yol: k.kaynak, sayfa: k.sayfa };
  }

  /** Sekmenin kendi dosyasına (yapısal kayıttan sonra anlık kopyasına) artımlı kayıtla işlenmiş döndürme (belge.diskDondurme; bkz.
   *  uygulama.js yapisalTarif). Kart döndürmesi sekmedeki gibi belgenin açıldığı andaki /Rotate'e görelidir; çekirdek ise dosyadaki
   *  hali çizer ve tarifteki açıyı dosyadaki /Rotate'e ekler. */
  _diskDondurme(yol, sayfa) {
    const g = this.belge.gorunum;
    const kendi = g?.anlik ? yolAyni(yol, g.anlik) : !!g?.yol && yolAyni(yol, g.yol);
    return kendi ? (this.belge.diskDondurme?.[sayfa] || 0) : 0;
  }

  /** Küçük resimde (dosyadaki hal) görünenin üstüne uygulanacak döndürme. Pencerede eklenen kartın döndürmesi zaten dosyaya göredir. */
  _gorunenDondurme(k) {
    if (k.sekme == null || k.bos) return aci(k.dondurme);
    const { yol, sayfa } = this._kaynak(k);
    return aci(k.dondurme - this._diskDondurme(yol, sayfa));
  }

  /** Bir değişiklikten önce çağrılır: geçmişe anlık görüntü koyar. */
  _anlikGoruntuAl() {
    this.gecmis.length = this.gecmisKonum;
    this.gecmis.push({ kartlar: this.kartlar.map((k) => ({ ...k })), secim: new Set(this.secim) });
    if (this.gecmis.length > GECMIS_SINIRI) this.gecmis.shift();
    this.gecmisKonum = this.gecmis.length;
  }

  geriAl() {
    if (this.gecmisKonum === 0) return;
    if (this.gecmisKonum === this.gecmis.length) {
      // Şimdiki durumu yinele için sakla
      this.gecmis.push({ kartlar: this.kartlar.map((k) => ({ ...k })), secim: new Set(this.secim) });
    }
    this.gecmisKonum--;
    const g = this.gecmis[this.gecmisKonum];
    this.kartlar = g.kartlar.map((k) => ({ ...k }));
    this.secim = new Set(g.secim);
    this.ciz();
  }

  yinele() {
    if (this.gecmisKonum >= this.gecmis.length - 1) return;
    this.gecmisKonum++;
    const g = this.gecmis[this.gecmisKonum];
    this.kartlar = g.kartlar.map((k) => ({ ...k }));
    this.secim = new Set(g.secim);
    if (this.gecmisKonum === this.gecmis.length - 1) { this.gecmis.pop(); this.gecmisKonum = this.gecmis.length; }
    this.ciz();
  }

  get geriAlinabilir() { return this.gecmisKonum > 0; }
  get yinelenebilir() { return this.gecmisKonum < this.gecmis.length - 1; }

  // ---------------------------------------------------------------- arayüz
  _kur() {
    const govde = oge(`<div class="sayfalar-govde" style="display:flex;flex-direction:column;flex:1;min-height:0">
      <div class="sayfalar-arac-cubugu">
        ${dugme('geriAl', 'Geri al (Ctrl+Z)', '<path d="M7 5 3.5 8.5 7 12M4 8.5h8a4 4 0 0 1 0 8H9" fill="none" stroke="currentColor" stroke-width="1.4"/>')}
        ${dugme('yinele', 'Yinele (Ctrl+Y)', '<path d="m13 5 3.5 3.5L13 12M16 8.5H8a4 4 0 0 0 0 8h3" fill="none" stroke="currentColor" stroke-width="1.4"/>')}
        <span class="ayrac"></span>
        ${dugme('tumunuSec', 'Tümünü seç (Ctrl+A)', '<rect x="3" y="3" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m6.5 10 2.5 2.5 5-5" fill="none" stroke="currentColor" stroke-width="1.6"/>')}
        ${dugme('secimiKaldir', 'Seçimi kaldır', '<rect x="3" y="3" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>')}
        <span class="ayrac"></span>
        ${dugme('solaDondur', 'Seçilenleri sola döndür', '<path d="M13.1 15.8A6.2 6.2 0 1 0 5.1 13.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2.8 15.5 7.4 12.3 6.8 16.4z" fill="currentColor"/>')}
        ${dugme('sagaDondur', 'Seçilenleri sağa döndür', '<path d="M6.9 15.8A6.2 6.2 0 1 1 14.9 13.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M17.2 15.5 12.6 12.3 13.2 16.4z" fill="currentColor"/>')}
        ${dugme('sil', 'Seçilenleri sil (Delete)', '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" fill="none" stroke="currentColor" stroke-width="1.4"/>')}
        <span class="ayrac"></span>
        <button class="ikincil" data-komut="bosEkle" title="Seçili sayfanın arkasına boş sayfa ekler (boyut: önceki sayfa)">Boş sayfa ekle</button>
        <button class="ikincil" data-komut="pdfEkle" title="Başka bir PDF'in sayfalarını seçili sayfanın arkasına ekler">PDF ekle</button>
        <span class="sayac"></span>
      </div>
      <div class="sayfalar-izgara" tabindex="0" role="listbox" aria-multiselectable="true"></div>
      <div class="sayfalar-kayit arac-bolum"><div class="arac-bolum-baslik">Kaydet</div></div>
    </div>`);
    this.govde = govde;
    this.cubuk = govde.querySelector('.sayfalar-arac-cubugu');
    this.izgara = govde.querySelector('.sayfalar-izgara');
    this.sayac = govde.querySelector('.sayac');
    this.cubuk.addEventListener('click', (e) => { const b = e.target.closest('[data-komut]'); if (b && !b.disabled) { this.komut(b.dataset.komut); this._odagiKoru(); } });
    // Üzerine yaz: düzen sekmeye geri alınabilir komut olarak uygulanıp kaydedilir (Ctrl+Z)
    this.kayit = kayitSecimi({ baglam: this.baglam, belge: this.belge, ad: 'Düzenlenmiş', diyalogBasligi: 'Düzenlenmiş PDF', geriAlinabilir: true });
    govde.querySelector('.sayfalar-kayit').append(this.kayit.el);

    // Pencere sekme şeridinin altında başlar, arkadaki sekmeler görünür (0.1.27, kullanıcı isteği; Birleştir'deki gibi)
    this.pencere = pencereAc({
      baslik: `Sayfaları düzenle — ${this.belge.ad}`, govde, anahtar: 'sayfalar', sinif: 'sayfalar-pencere', seritAlti: true,
      dugmeler: [{ id: 'kaydet', etiket: 'Kaydet', birincil: true, tiklama: () => this.kaydet() }],
      kapatmadanOnce: (_p, sonuc) => this._kapatmaIzni(sonuc),
    });
    this.kutu = this._kutuOlcusu();   // kartlar çizilmeden önce (boş sayfa yer tutucusu bu ölçüyle boyutlanır)
    this.pencere.govde.append(this.ilerleme.el);   // gövdenin doğrudan çocuğu: meşgulken soluklaşmaz, İptal tıklanabilir
    this.pencere.el.addEventListener('esc', (e) => { if (this.ilerleme.calisiyor) { e.preventDefault(); this.ilerleme.iptalIste(); } });
    this.kayit.onDegisti(() => this._kaydetIpucu());
    this._kaydetIpucu();
    // Fare ve tuş kullanımı (tıkla: seç, Delete: sil…) pencerede yazmaz, F1 Kısayollar penceresinde (0.1.13, kullanıcı isteği)

    // Görünürlük gözlemcisi: küçük resimleri tembel yükle
    this.gozlemci = new IntersectionObserver((girdiler) => {
      for (const g of girdiler) if (g.isIntersecting) this._resimYukle(g.target);
    }, { root: this.izgara, rootMargin: '200px 0px' });

    // Seçim ve klavye
    this.izgara.addEventListener('click', (e) => this._tikla(e));
    this.izgara.addEventListener('dblclick', (e) => { const el = e.target.closest('.sayfa-karti'); if (el && !e.target.closest('button')) { this.secim = new Set([+el.dataset.kimlik]); this._secimiCiz(); } });
    // Izgaranın tuşları araç çubuğundaki bir düğmeye basıldıktan sonra da (odak düğmede kalır) çalışır; kayıt satırındaki girdi ve seçimler hariç
    govde.addEventListener('keydown', (e) => { if (this.izgara.contains(e.target) || this.cubuk.contains(e.target)) { this._tus(e); this._odagiKoru(); } });
    this.sirala = suruklemeSiralama(this.izgara, {
      ogeSecici: '.sayfa-karti', izgara: true,
      grupAl: (el) => { const k = +el.dataset.kimlik; return this.secim.has(k) ? [...this.izgara.querySelectorAll('.sayfa-karti.secili')] : [el]; },
      onBirak: (ogeler, hedefIdx) => this.tasi(ogeler.map((o) => +o.dataset.kimlik), hedefIdx),
    });
    this._alanSecimiBagla();
    // Ekran ölçeği değişince (pencere başka ölçekli ekrana taşındı) yüklenmiş kartlar yeni ölçek için düşük çözünürlüklüyse yeniden istenir
    // (görünenler hemen, ötekiler göründükçe; eski resim yenisi gelene dek yerinde). CSS boyutu değişmediği için başka olay gelmez; yoksa
    // sonradan yüklenen keskin kartlarla eski bulanık kartlar karışık kalıyordu (bağımsız inceleme)
    this._olcekDegisti = () => { this._olcekDinle(); this._resimleriTazele(); };
    this._olcekDinle();
    this.pencere.el.addEventListener('kapandi', () => { this.gozlemci.disconnect(); this.sirala(); this._olcekSorgu?.removeEventListener('change', this._olcekDegisti); });
    this.ciz();
    this.izgara.focus();
  }

  /** Kart resim kutusunun kenarı (CSS pikseli): araclar.css'teki --kart-resim. Izgara DOM'a girdikten sonra okunur. */
  _kutuOlcusu() {
    const v = parseFloat(getComputedStyle(this.izgara).getPropertyValue('--kart-resim'));
    return Number.isFinite(v) && v > 0 ? v : 220;
  }

  /** Birincil düğmenin ipucu kaydetme seçimine göre. */
  _kaydetIpucu() {
    const b = this.pencere.dugme('kaydet');
    if (b) b.title = this.kayit.uzerineMi()
      ? 'Sayfa düzenini belgeye uygulayıp kaydeder; Ctrl+Z ile geri alınabilir'
      : 'Sayfa düzenini yeni bir PDF dosyası olarak kaydeder; özgün dosya değişmez';
  }

  async _kapatmaIzni(sonuc) {
    if (this.ilerleme.calisiyor) {
      const { secim } = await this.baglam.mesajKutusu({ mesaj: 'Kaydetme sürüyor.', ayrinti: 'Pencereyi kapatırsanız işlem iptal edilir.', dugmeler: ['İptal et ve kapat', 'Sürdür'], varsayilan: 1, iptal: 1 });
      if (secim !== 0) return false;
      this.ilerleme.iptalIste();
      return true;
    }
    if (sonuc === 'tamam' || !this.degisti) return true;
    // Uygulamanın bütün çıkış sorularıyla aynı: Kaydet | Kaydetme | Vazgeç. Kaydet, alttaki Kaydet düğmesiyle aynı işi yapar (kaydetme
    // seçimine göre yeni belge ya da üzerine yaz); başarılıysa pencereyi kendisi kapatır ('tamam'), olmazsa pencere açık kalır
    const { secim } = await this.baglam.mesajKutusu(kaydetmedenCikisSorusu(this.belge.ad));
    if (secim === 1) return true;
    if (secim === 0 && !this.pencere.kapali) await this.kaydet();
    return false;
  }

  komut(ad) {
    switch (ad) {
      case 'geriAl': return this.geriAl();
      case 'yinele': return this.yinele();
      case 'tumunuSec': this.secim = new Set(this.kartlar.map((k) => k.kimlik)); return this._secimiCiz();
      case 'secimiKaldir': this.secim.clear(); return this._secimiCiz();
      case 'solaDondur': return this.dondur([...this.secim], -90);
      case 'sagaDondur': return this.dondur([...this.secim], 90);
      case 'sil': return this.sil([...this.secim]);
      case 'bosEkle': return this.bosSayfaEkle();
      case 'pdfEkle': return this.pdfdenEkle();
      default: return undefined;
    }
  }

  /** Odaklı düğme işlemden sonra devre dışı kaldıysa (seçim boşaldı) ya da DOM'dan çıktıysa odak ızgaraya döner (BODY'ye düşmesin). */
  _odagiKoru() {
    const a = document.activeElement;
    if (!a || a === document.body || a.disabled || !a.isConnected) this.izgara.focus({ preventScroll: true });
  }

  _tus(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); this.geriAl(); return; }
    if (ctrl && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) { e.preventDefault(); this.yinele(); return; }
    if (ctrl && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); this.komut('tumunuSec'); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.sil([...this.secim]); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
      if (!this.kartlar.length) return;
      e.preventDefault();
      const sutun = this._sutunSayisi();
      const idx = this.kartlar.findIndex((k) => k.kimlik === this.odak);
      let yeni = idx < 0 ? 0 : idx;
      if (e.key === 'ArrowLeft') yeni = Math.max(0, idx - 1);
      else if (e.key === 'ArrowRight') yeni = Math.min(this.kartlar.length - 1, idx + 1);
      else if (e.key === 'ArrowUp') yeni = Math.max(0, idx - sutun);
      else if (e.key === 'ArrowDown') yeni = Math.min(this.kartlar.length - 1, idx + sutun);
      else if (e.key === 'Home') yeni = 0;
      else if (e.key === 'End') yeni = this.kartlar.length - 1;
      const kimlik = this.kartlar[yeni].kimlik;
      if (e.shiftKey && this.capa != null) this._aralikSec(this.capa, kimlik);
      else if (!ctrl) { this.secim = new Set([kimlik]); this.capa = kimlik; }
      this.odak = kimlik;
      this._secimiCiz();
      this.ogeler.get(kimlik)?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === ' ' && ctrl && this.odak != null) { e.preventDefault(); this._toggle(this.odak); this._secimiCiz(); return; }
    if ((e.key === 'r' || e.key === 'R') && !ctrl) { e.preventDefault(); this.dondur([...this.secim], e.shiftKey ? -90 : 90); }
  }

  /** Izgaranın sütun sayısı (↑ ↓ bir satır gezer): çözülmüş sütun listesinden. 0.2.1'e dek kartın genişliğinden bölmeyle bulunuyordu; sütunlar
   *  1fr olduğu için kart genişliği kesirlidir, 0.2.2'nin büyük kartlarıyla 1280 px pencerede bölme 3,99 çıkıp 4 sütunda 3 sayıyordu. */
  _sutunSayisi() {
    const sutunlar = getComputedStyle(this.izgara).gridTemplateColumns.split(' ').filter((s) => parseFloat(s) > 0).length;
    return Math.max(1, sutunlar);
  }

  _tikla(e) {
    if (this._alanTiki) { this._alanTiki = false; return; }
    if (suruklemeKalintisi(this.izgara)) return;
    const btn = e.target.closest('button[data-kart-komut]');
    const el = e.target.closest('.sayfa-karti');
    if (!el) { if (e.target === this.izgara) { this.secim.clear(); this._secimiCiz(); } return; }
    const kimlik = +el.dataset.kimlik;
    if (btn) {
      const k = btn.dataset.kartKomut;
      // Kart seçiliyse toplu, değilse yalnızca o kart
      const hedefler = this.secim.has(kimlik) ? [...this.secim] : [kimlik];
      if (k === 'sola') this.dondur(hedefler, -90);
      else if (k === 'saga') this.dondur(hedefler, 90);
      else if (k === 'sil') this.sil(hedefler);
      return;
    }
    if (e.shiftKey && this.capa != null) this._aralikSec(this.capa, kimlik);
    else if (e.ctrlKey || e.metaKey) { this._toggle(kimlik); this.capa = kimlik; }
    else { this.secim = new Set([kimlik]); this.capa = kimlik; }
    this.odak = kimlik;
    this._secimiCiz();
    this.izgara.focus({ preventScroll: true });
  }

  /**
   * Boş alandan sürükleyerek alan seçimi: ızgaranın boş yerine (kartların dışı) basıp sürükleyince dikdörtgen çizilir, kesiştiği kartlar
   * sürüklerken seçilir. Değiştiricisiz sürükleme seçimin yerini alır; Ctrl ya da Shift ile sürükleme başındaki seçime ekler. Fare
   * ızgaranın üst / alt kenarına yaklaşınca ya da dışına çıkınca ızgara kayar (kenara ne kadar yakınsa o kadar hızlı). Esc sürüklemeyi
   * iptal eder, önceki seçim geri gelir. Kıpırdamadan bırakılan basış olağan tıklamadır (boş yere tıklama seçimi kaldırır); kartlardan
   * başlayan sürükleme sıralamadır (suruklemeSiralama), kaydırma çubuğuna basış kaydırmadır.
   * Boş alana basınca işaretçi ızgarada tutulur (setPointerCapture): ızgaranın dışına taşan hareket ve bırakış da buraya gelir.
   */
  _alanSecimiBagla() {
    const iz = this.izgara;
    const ESIK = 5, KENAR = 36, EN_HIZ = 24;
    // a: basılı işaretçi {pointerId, bx, by (başlangıç, içerik koordinatı), x, y, sx, sy (istemci), onceki, taban, ilk, basladi, iptal,
    //    kutular, sinirG, sinirY, el, raf}
    let a = null;
    const icerik = (x, y) => {
      const r = iz.getBoundingClientRect();
      return { x: x - r.left - iz.clientLeft + iz.scrollLeft, y: y - r.top - iz.clientTop + iz.scrollTop };
    };
    const guncelle = () => {
      const p = icerik(a.x, a.y);
      const sinirla = (v, m) => Math.max(0, Math.min(m, v));   // dikdörtgen kaydırılabilir alanı büyütmesin
      const x0 = sinirla(Math.min(a.bx, p.x), a.sinirG), x1 = sinirla(Math.max(a.bx, p.x), a.sinirG);
      const y0 = sinirla(Math.min(a.by, p.y), a.sinirY), y1 = sinirla(Math.max(a.by, p.y), a.sinirY);
      Object.assign(a.el.style, { left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
      const secim = new Set(a.taban);
      a.ilk = null;
      for (const k of a.kutular) if (k.x0 < x1 && k.x1 > x0 && k.y0 < y1 && k.y1 > y0) { secim.add(k.kimlik); a.ilk ??= k.kimlik; }
      this.secim = secim;
      this._secimiCiz();
    };
    const kaydir = () => {
      a.raf = requestAnimationFrame(kaydir);
      const r = iz.getBoundingClientRect();
      const dy = a.y < r.top + KENAR ? -Math.min(EN_HIZ, Math.ceil((r.top + KENAR - a.y) / 3))
        : a.y > r.bottom - KENAR ? Math.min(EN_HIZ, Math.ceil((a.y - r.bottom + KENAR) / 3)) : 0;
      if (!dy) return;
      const once = iz.scrollTop;
      iz.scrollTop += dy;
      if (iz.scrollTop !== once) guncelle();
    };
    const basla = () => {
      // Kartlar alan seçimi sürerken yer değiştirmez: kutuları bir kez, içerik koordinatında ölçülür (kaydırma yalnızca görünümü kaydırır)
      const r = iz.getBoundingClientRect();
      const ox = r.left + iz.clientLeft - iz.scrollLeft, oy = r.top + iz.clientTop - iz.scrollTop;
      a.kutular = [...this.ogeler].map(([kimlik, el]) => { const b = el.getBoundingClientRect(); return { kimlik, x0: b.left - ox, y0: b.top - oy, x1: b.right - ox, y1: b.bottom - oy }; });
      a.sinirG = iz.scrollWidth; a.sinirY = iz.scrollHeight;
      a.el = document.createElement('div');
      a.el.className = 'sayfalar-alan-secimi';
      iz.append(a.el);
      iz.classList.add('alan-seciliyor');
      try { window.getSelection()?.removeAllRanges(); } catch { /* yok say */ }
      a.basladi = true;
      a.raf = requestAnimationFrame(kaydir);
    };
    /** Dikdörtgeni kaldırır. iptal: önceki seçimi geri getirir (Esc; işaretçi bırakılana kadar tutulur, hareketi yok sayılır). */
    const durdur = (iptal) => {
      if (!a?.basladi || a.iptal) return;
      cancelAnimationFrame(a.raf);
      a.el.remove();
      iz.classList.remove('alan-seciliyor');
      if (iptal) { a.iptal = true; this.secim = a.onceki; }
      else if (a.ilk != null) this.odak = this.capa = a.ilk;
      this._secimiCiz();
    };
    /** Bırakış: sürükleme olduysa arkasından gelen tıklama seçimi değiştirmesin (_tikla yutar; tıklama gelmezse sonraki basış sıfırlar). */
    const birak = () => {
      const s = a;
      a = null;
      if (!s) return;
      try { if (iz.hasPointerCapture(s.pointerId)) iz.releasePointerCapture(s.pointerId); } catch { /* yok say */ }
      if (!s.basladi) return;
      this._alanTiki = true;
      iz.focus({ preventScroll: true });
    };
    iz.addEventListener('pointerdown', (e) => {
      a = null;
      this._alanTiki = false;
      if (e.button !== 0 || e.pointerType === 'touch' || this.ilerleme.calisiyor || e.target.closest('.sayfa-karti')) return;
      const r = iz.getBoundingClientRect();
      if (e.clientX - r.left - iz.clientLeft >= iz.clientWidth || e.clientY - r.top - iz.clientTop >= iz.clientHeight) return;   // kaydırma çubuğu
      const p = icerik(e.clientX, e.clientY);
      const onceki = new Set(this.secim);
      a = { pointerId: e.pointerId, bx: p.x, by: p.y, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, onceki, ilk: null, basladi: false, iptal: false,
        taban: e.ctrlKey || e.metaKey || e.shiftKey ? onceki : new Set() };
      try { iz.setPointerCapture(e.pointerId); } catch { /* yok say */ }
    });
    iz.addEventListener('pointermove', (e) => {
      if (!a || e.pointerId !== a.pointerId || a.iptal) return;
      if (!(e.buttons & 1)) { durdur(false); birak(); return; }   // bırakış kaçırıldı (ör. pencere odağı gitti)
      a.x = e.clientX; a.y = e.clientY;
      if (!a.basladi) { if (Math.hypot(a.x - a.sx, a.y - a.sy) < ESIK) return; basla(); }
      guncelle();
    });
    iz.addEventListener('pointerup', (e) => { if (a && e.pointerId === a.pointerId) { durdur(false); birak(); } });
    iz.addEventListener('pointercancel', (e) => { if (a && e.pointerId === a.pointerId) { durdur(true); birak(); } });
    iz.addEventListener('lostpointercapture', (e) => { if (a && e.pointerId === a.pointerId) { durdur(false); birak(); } });
    // Sürerken Esc pencereyi kapatmaz: alan seçimini iptal eder (iptalden sonra, bırakılana kadar gelen Esc de yutulur)
    iz.addEventListener('keydown', (e) => { if (e.key === 'Escape' && a?.basladi) { e.preventDefault(); e.stopPropagation(); durdur(true); } }, true);
  }

  _toggle(kimlik) { if (this.secim.has(kimlik)) this.secim.delete(kimlik); else this.secim.add(kimlik); }
  _aralikSec(a, b) {
    const i = this.kartlar.findIndex((k) => k.kimlik === a), j = this.kartlar.findIndex((k) => k.kimlik === b);
    if (i < 0 || j < 0) return;
    const [bas, son] = i <= j ? [i, j] : [j, i];
    this.secim = new Set(this.kartlar.slice(bas, son + 1).map((k) => k.kimlik));
  }

  // ---------------------------------------------------------------- düzenleme işlemleri
  dondur(kimlikler, derece) {
    if (!kimlikler.length) { this.baglam.bildir('Döndürülecek sayfayı seçin.'); return; }
    this._anlikGoruntuAl();
    const set = new Set(kimlikler);
    for (const k of this.kartlar) if (set.has(k.kimlik)) k.dondurme = aci(k.dondurme + derece);
    this.ciz();
  }

  sil(kimlikler) {
    if (!kimlikler.length) { this.baglam.bildir('Silinecek sayfayı seçin.'); return; }
    if (kimlikler.length >= this.kartlar.length) { this.baglam.bildir('Bütün sayfalar silinemez; en az bir sayfa kalmalı.'); return; }
    this._anlikGoruntuAl();
    const set = new Set(kimlikler);
    const ilkIdx = this.kartlar.findIndex((k) => set.has(k.kimlik));
    this.kartlar = this.kartlar.filter((k) => !set.has(k.kimlik));
    for (const k of kimlikler) this.secim.delete(k);
    // Odak: silinenlerin yerindeki kart
    const sonraki = this.kartlar[Math.min(ilkIdx, this.kartlar.length - 1)];
    this.odak = sonraki?.kimlik ?? null;
    this.capa = this.odak;
    this.ciz();
  }

  /** Kartları hedef konuma taşır (hedefIdx: taşınanlar çıkarılmış listeye göre). */
  tasi(kimlikler, hedefIdx) {
    const set = new Set(kimlikler);
    const tasinan = this.kartlar.filter((k) => set.has(k.kimlik));
    const kalan = this.kartlar.filter((k) => !set.has(k.kimlik));
    const idx = Math.max(0, Math.min(hedefIdx, kalan.length));
    const yeni = [...kalan.slice(0, idx), ...tasinan, ...kalan.slice(idx)];
    if (this._imza(yeni) === this._imza(this.kartlar)) return;
    this._anlikGoruntuAl();
    this.kartlar = yeni;
    this.secim = new Set(kimlikler);
    this.ciz();
  }

  _eklemeKonumu() {
    // Seçili son kartın arkası; seçim yoksa sona
    let idx = -1;
    this.kartlar.forEach((k, i) => { if (this.secim.has(k.kimlik)) idx = i; });
    return idx < 0 ? this.kartlar.length : idx + 1;
  }

  bosSayfaEkle() {
    const idx = this._eklemeKonumu();
    const onceki = this.kartlar[idx - 1] || this.kartlar[idx] || null;
    let g = onceki ? onceki.genislik : A4.w, y = onceki ? onceki.yukseklik : A4.h;
    // Önceki sayfa döndürülmüşse görünen boyutunu al
    if (onceki && (onceki.dondurme === 90 || onceki.dondurme === 270)) [g, y] = [y, g];
    this._anlikGoruntuAl();
    const kart = { kimlik: ++this.kimlikSayac, kaynak: null, sayfa: null, dondurme: 0, genislik: g, yukseklik: y, bos: true, yeni: true };
    this.kartlar.splice(idx, 0, kart);
    this.secim = new Set([kart.kimlik]);
    this.odak = this.capa = kart.kimlik;
    this.ciz();
    this.ogeler.get(kart.kimlik)?.scrollIntoView({ block: 'nearest' });
  }

  async pdfdenEkle() {
    const { baglam } = this;
    const yollar = await baglam.pdefe.cagir('dosya:acDiyalog', { baslik: 'Sayfaları eklenecek PDF', filtreler: [{ name: 'PDF belgeleri', extensions: ['pdf'] }], coklu: true });
    if (!yollar?.length || this.pencere.kapali) return;
    let idx = this._eklemeKonumu();
    const yeniKartlar = [];
    this.pencere.hataGoster('');
    for (const yol of yollar) {
      try {
        const sayfalar = await this._sayfaBoyutlari(yol);
        for (const s of sayfalar) yeniKartlar.push({ kimlik: ++this.kimlikSayac, kaynak: yol, sayfa: s.no, dondurme: 0, genislik: s.genislik, yukseklik: s.yukseklik, bos: false, yeni: !anaKaynakMi(this.belge, yol) });
      } catch (e) {
        this.pencere.hataGoster(`"${dosyaAdi(yol)}" okunamadı: ${hataMetni(e)}`);
      }
    }
    if (!yeniKartlar.length) return;
    this._anlikGoruntuAl();
    this.kartlar.splice(idx, 0, ...yeniKartlar);
    this.secim = new Set(yeniKartlar.map((k) => k.kimlik));
    this.odak = this.capa = yeniKartlar[0].kimlik;
    this.ciz();
    this.ogeler.get(yeniKartlar[0].kimlik)?.scrollIntoView({ block: 'nearest' });
    baglam.bildir(`${yeniKartlar.length} sayfa eklendi.`);
  }

  async _sayfaBoyutlari(yol) {
    try {
      const r = await this.baglam.cekirdek('sayfa_boyutlari', { yol });
      const liste = r?.sayfalar || r;
      if (Array.isArray(liste) && liste.length) {
        return liste.map((s, i) => ({ no: s.no ?? s.sayfa ?? i + 1, genislik: s.genislik ?? s.w ?? A4.w, yukseklik: s.yukseklik ?? s.h ?? A4.h }));
      }
    } catch (e) {
      if (!/Bilinmeyen yöntem/i.test(e.message || '')) throw e;
    }
    // Geriye dönüş: belge_bilgi ile yalnızca sayfa sayısı
    const b = await this.baglam.cekirdek('belge_bilgi', { yol });
    const n = b?.sayfa || 0;
    if (!n) throw new Error('Belgede sayfa yok ya da açılamadı.');
    return Array.from({ length: n }, (_, i) => ({ no: i + 1, genislik: A4.w, yukseklik: A4.h }));
  }

  // ---------------------------------------------------------------- çizim
  ciz() {
    const gecerliKimlikler = new Set(this.kartlar.map((k) => k.kimlik));
    for (const [kimlik, el] of this.ogeler) if (!gecerliKimlikler.has(kimlik)) { this.gozlemci.unobserve(el); el.remove(); this.ogeler.delete(kimlik); }
    for (const k of this.secim) if (!gecerliKimlikler.has(k)) this.secim.delete(k);
    if (this.odak != null && !gecerliKimlikler.has(this.odak)) this.odak = null;
    // Sırayı DOM'a uygula (var olan öğeler korunur, resimler yeniden yüklenmez)
    let onceki = null;
    this.kartlar.forEach((k, i) => {
      let el = this.ogeler.get(k.kimlik);
      if (!el) { el = this._kartOlustur(k); this.ogeler.set(k.kimlik, el); this.gozlemci.observe(el); }
      this._kartGuncelle(el, k, i);
      if (onceki ? el.previousElementSibling !== onceki : el !== this.izgara.firstElementChild) {
        if (onceki) onceki.after(el); else this.izgara.prepend(el);
      }
      onceki = el;
    });
    this._secimiCiz();
  }

  _kartOlustur(k) {
    const el = oge(`<div class="sayfa-karti" data-kimlik="${k.kimlik}" role="option">
      <span class="rozet dondurme" hidden></span><span class="rozet yeni" hidden>yeni</span>
      <div class="resim-kutu"><div class="yukleniyor"></div></div>
      <div class="alt"><span class="no"></span>
        <span class="kart-dugmeler">
          <button class="ikon" data-kart-komut="sola" title="Sola döndür"><svg viewBox="0 0 20 20"><path d="M13.1 15.8A6.2 6.2 0 1 0 5.1 13.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2.8 15.5 7.4 12.3 6.8 16.4z" fill="currentColor"/></svg></button>
          <button class="ikon" data-kart-komut="saga" title="Sağa döndür"><svg viewBox="0 0 20 20"><path d="M6.9 15.8A6.2 6.2 0 1 1 14.9 13.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M17.2 15.5 12.6 12.3 13.2 16.4z" fill="currentColor"/></svg></button>
          <button class="ikon" data-kart-komut="sil" title="Sil"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5"/></svg></button>
        </span></div>
      <span class="kaynak" hidden></span>
    </div>`);
    if (k.bos) {
      const kutu = el.querySelector('.resim-kutu');
      kutu.innerHTML = '';
      const b = document.createElement('div');
      b.className = 'bos-sayfa';
      b.textContent = 'Boş sayfa';
      kutu.append(b);
      el.dataset.yuklendi = '1';
    }
    return el;
  }

  _kartGuncelle(el, k, i) {
    el.querySelector('.no').textContent = String(i + 1);
    el.dataset.surukleEtiket = `Sayfa ${i + 1}`;
    // Rozet ve küçük resim dosyadaki hale göre döndürmeyi gösterir (artımlı kayıtla dosyaya yazılmış döndürme bir daha sayılmaz)
    const d = this._gorunenDondurme(k);
    const rozet = el.querySelector('.rozet.dondurme');
    rozet.hidden = !d;
    rozet.textContent = d ? `${d}°` : '';
    el.querySelector('.rozet.yeni').hidden = !k.yeni || k.bos;
    const { yol, sayfa } = this._kaynak(k);
    const kaynak = el.querySelector('.kaynak');
    const farkli = !k.bos && yol && !anaKaynakMi(this.belge, yol);
    kaynak.hidden = !farkli && !k.bos;
    kaynak.textContent = k.bos ? `boş · ${Math.round(k.genislik)}×${Math.round(k.yukseklik)} pt` : (farkli ? `${dosyaAdi(yol)} · s. ${sayfa}` : '');
    kaynak.title = farkli ? yol : '';
    el.title = k.bos ? 'Boş sayfa' : `${dosyaAdi(yol)} — sayfa ${sayfa}${d ? ` — ${d}° döndürülmüş` : ''}`;
    const gorsel = el.querySelector('.resim-kutu img, .resim-kutu .bos-sayfa');
    if (gorsel) {
      gorsel.style.transform = d ? `rotate(${d}deg)` : '';
      if (k.bos) this._bosBoyutla(gorsel, k);
    }
  }

  /** Öğeyi (boş sayfa, yüklenemedi yer tutucusu) sayfanın oranıyla kutuya sığdırır: uzun kenarı kutunun kenarı. */
  _bosBoyutla(el, k) {
    const oran = (k.genislik || A4.w) / (k.yukseklik || A4.h), K = this.kutu;
    const w = oran >= 1 ? K : Math.round(K * oran);
    const h = oran >= 1 ? Math.round(K / oran) : K;
    el.style.width = w + 'px'; el.style.height = h + 'px';
  }

  /**
   * Kartın küçük resmi için çekirdekten istenecek genişlik (cihaz pikseli). Çekirdek sayfayı dosyadaki yönüyle bu genişliğe çizer, resim
   * kutunun uzun kenarına sığdırılır: yatay sayfada genişlik kutunun kenarı, dikey sayfada kenar × genişlik / yükseklik. Ekran ölçeğiyle
   * çarpılır (en çok 2, Sayfalar panelindeki gibi): %125 / %150 ekranda da keskin. Sayfanın ölçüsü sekmede açılıştaki yönüyledir; dosyaya
   * artımlı kayıtla işlenmiş çeyrek tur döndürme (_diskDondurme) çizilen resmin yönünü çevirir. Oran tutmasa da resim kutuya sığar
   * (_resimYukle boyutu çizilen resmin kendi oranından verir); yalnızca keskinlik etkilenir.
   */
  _resimGenisligi(k, yol, sayfa) {
    let w = k.genislik || A4.w, h = k.yukseklik || A4.h;
    if (k.sekme != null && this._diskDondurme(yol, sayfa) % 180) [w, h] = [h, w];
    const cihaz = this.kutu * Math.min(2, window.devicePixelRatio || 1) * (w >= h ? 1 : w / h);
    return Math.max(16, Math.min(KART_RESIM_EN_FAZLA, Math.ceil(cihaz)));
  }

  _secimiCiz() {
    for (const [kimlik, el] of this.ogeler) {
      el.classList.toggle('secili', this.secim.has(kimlik));
      el.classList.toggle('odak', this.odak === kimlik);
      el.setAttribute('aria-selected', this.secim.has(kimlik) ? 'true' : 'false');
    }
    const n = this.kartlar.length, s = this.secim.size;
    this.sayac.textContent = `${n} sayfa${s ? ` · ${s} seçili` : ''}${this.degisti ? ' · değişti' : ''}`;
    const ayarla = (id, devre) => { const b = this.cubuk.querySelector(`[data-komut="${id}"]`); if (b) b.disabled = devre; };
    ayarla('geriAl', !this.geriAlinabilir);
    ayarla('yinele', !this.yinelenebilir);
    ayarla('solaDondur', !s); ayarla('sagaDondur', !s); ayarla('sil', !s || s >= n);
    ayarla('secimiKaldir', !s); ayarla('tumunuSec', s === n);
    this.pencere.dugmeAyarla('kaydet', { devre: !this.degisti || this.ilerleme.calisiyor });
  }

  /** Geçerli ekran ölçeğine bağlı ortam sorgusunu dinler; ölçek değişince sorgu eşleşmez olur, dinleyici yeni ölçekle yeniden kurulur. */
  _olcekDinle() {
    this._olcekSorgu?.removeEventListener('change', this._olcekDegisti);
    this._olcekSorgu = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this._olcekSorgu.addEventListener('change', this._olcekDegisti);
  }

  /** Yüklenmiş kartlardan yeni ekran ölçeği için düşük çözünürlüklü kalanlar gözlemciye yeniden verilir (_resimYukle yeniden ister). */
  _resimleriTazele() {
    if (this.pencere.kapali) return;
    for (const [kimlik, el] of this.ogeler) {
      if (!el.dataset.yuklendi || !el.dataset.genislik) continue;
      const k = this.kartlar.find((x) => x.kimlik === kimlik);
      if (!k || k.bos) continue;
      const { yol, sayfa } = this._kaynak(k);
      if (this._resimGenisligi(k, yol, sayfa) <= +el.dataset.genislik) continue;
      delete el.dataset.yuklendi;
      this.gozlemci.unobserve(el); this.gozlemci.observe(el);   // yeniden gözlenen hücre için ilk bildirim gelir (görünüyorsa yüklenir)
    }
  }

  _resimYukle(el) {
    if (el.dataset.yuklendi) return;
    const kimlik = +el.dataset.kimlik;
    const k = this.kartlar.find((x) => x.kimlik === kimlik);
    if (!k || k.bos) return;
    el.dataset.yuklendi = '1';
    const { yol, sayfa } = this._kaynak(k);
    const genislik = this._resimGenisligi(k, yol, sayfa);
    el.dataset.genislik = String(genislik);
    const sira = el._istek = (el._istek || 0) + 1;   // kartın sonraki isteği (ekran ölçeği değişti) öncekini geçersiz kılar: geç gelen eski resim yenisini ezmesin
    const anahtar = `${yol}|${sayfa}|${genislik}`;
    let soz = this.resimOnbellek.get(anahtar);
    if (!soz) { soz = this.baglam.cekirdek('kucuk_resim', { yol, sayfa, genislik }); this.resimOnbellek.set(anahtar, soz); }
    soz.then(async (r) => {
      if (!this.ogeler.get(kimlik) || el._istek !== sira) return;
      const kutu = el.querySelector('.resim-kutu');
      const img = document.createElement('img');
      img.src = 'data:image/png;base64,' + r.png;
      img.alt = `Sayfa ${sayfa}`;
      img.draggable = false;
      // Ekrandaki boyut çizilen resmin oranından, uzun kenarı kutunun kenarı: resim cihaz pikselinde çizildiği için doğal boyutu kutudan büyüktür
      const m = Math.max(r.genislik || 0, r.yukseklik || 0);
      if (m > 0) { img.style.width = Math.round(this.kutu * r.genislik / m) + 'px'; img.style.height = Math.round(this.kutu * r.yukseklik / m) + 'px'; }
      // Önceki resim (ya da yer tutucu) yenisi çözülene dek yerinde kalır: ölçek değişince yeniden istenen kartta boş kare görünmesin
      await img.decode().catch(() => {});
      if (!this.ogeler.get(kimlik) || el._istek !== sira) return;
      const kk = this.kartlar.find((x) => x.kimlik === kimlik);   // döndürme çözülürken değişmiş olabilir: yerine konarken okunur
      const d = kk ? this._gorunenDondurme(kk) : 0;
      if (d) img.style.transform = `rotate(${d}deg)`;
      kutu.innerHTML = '';
      kutu.append(img);
    }).catch((e) => {
      if (el._istek !== sira) return;
      const kutu = el.querySelector('.resim-kutu');
      kutu.innerHTML = `<div class="bos-sayfa" style="color:#d13438" title="${kacis(hataMetni(e))}">yüklenemedi</div>`;
      this._bosBoyutla(kutu.firstElementChild, k);
      delete el.dataset.yuklendi;
      this.resimOnbellek.delete(anahtar);
    });
  }

  // ---------------------------------------------------------------- tarifler
  /** baglam.sayfaTarifiUygula biçiminde tarif (sekmedeki anlamıyla): [{kaynak:{yol,sayfa}, dondurme} | {kaynak:null, genislik, yukseklik, dondurme}] */
  tarif() {
    return tarifDisari(this.kartlar.map((k) => {
      if (k.bos) return { kaynak: null, sayfa: null, genislik: k.genislik, yukseklik: k.yukseklik, dondurme: k.dondurme || 0 };
      const { yol, sayfa } = this._kaynak(k);
      return { kaynak: yol, sayfa, dondurme: k.dondurme };
    }));
  }

  /**
   * "Yeni belge olarak kaydet" için çekirdek (sayfalar_uygula) tarifi: [{kaynak, sayfa, dondurme} | {kaynak:null, genislik, yukseklik,
   * dondurme}]; dondurme kaynak sayfanın dosyadaki /Rotate'ine eklenir. Sayfalar dosyadaki kayıtlı hallerinden (notları, bağlantıları
   * ve yer imleriyle) alınır:
   *  - Sekmede yapısal kayıt yapılmamışsa (anlık kopya yok) dosyanın sayfa sırası özgün sıradır: sekmeden gelen kart kendi kaynağından
   *    alınır, artımlı kayıtla dosyaya işlenmiş döndürme çıkarılır (_diskDondurme); sekmeye eklenmiş ama kaydedilmemiş boş sayfa yeni
   *    boş sayfadır.
   *  - Yapısal kayıttan sonra sekmenin sayfaları anlık kopyayı gösterir; kaydedilen notlar ise dosyadadır. Sekmenin sayfa düzeni kayıtlı
   *    olmalıdır (değilse _yeniBelge önce kaydettirir): sekmedeki i. sayfa dosyanın i+1. sayfasıdır (boş sayfalar dahil; sekmede sonradan
   *    döndürülmüş olabilir: girdi kimliğiyle aranır), döndürme dosyadakine göre farktır.
   * Pencerede eklenen sayfalar (başka PDF'ten ya da aynı dosyadan, boş sayfa) olduğu gibi gider; döndürmeleri zaten dosyaya göredir.
   */
  _yeniBelgeTarifi() {
    const { belge } = this;
    const g = belge.gorunum;
    const yapisal = !!g?.anlik;
    if (yapisal && g.yapisalKirli?.()) throw new Error('Sekmedeki sayfa düzeni kaydedilmedi; önce belgeyi kaydedin.');
    const sekme = g?.sayfalar || [];
    return this.kartlar.map((k) => {
      const s = k.sekme != null ? this.sekmeGirdileri[k.sekme] : null;
      if (s && yapisal) {
        const i = sekme.findIndex((x) => x.kimlik === s.kimlik);
        if (i < 0) throw new Error('Belgenin sayfa düzeni bu pencere açıkken değişti; pencereyi kapatıp yeniden açın.');
        return { kaynak: belge.yol, sayfa: i + 1, dondurme: aci(k.dondurme - (sekme[i].dondurme || 0)) };
      }
      if (k.bos) return { kaynak: null, sayfa: null, genislik: k.genislik, yukseklik: k.yukseklik, dondurme: aci(k.dondurme) };
      const { yol, sayfa } = this._kaynak(k);
      return { kaynak: yol, sayfa, dondurme: s ? aci(k.dondurme - this._diskDondurme(yol, sayfa)) : aci(k.dondurme) };
    });
  }

  // ---------------------------------------------------------------- kaydet
  /** Kaydeder; kilitli / salt okunur dosya sorusunda "Yeniden dene", "Yeni belge olarak kaydet" ya da "Başka adla kaydet" seçilirse yeniden çalışır. */
  async kaydet() {
    if (this.ilerleme.calisiyor || this._suruyor) return;
    this._suruyor = true;
    try {
      while (!this.pencere.kapali && await this._kaydetBir());
    } finally { this._suruyor = false; }
  }

  /** Bir deneme; kilitli / salt okunur dosya sorusunda yeniden denenecekse true döner. */
  async _kaydetBir() {
    const { baglam } = this;
    if (!this.degisti) return false;
    if (!this.kartlar.length) { baglam.bildir('En az bir sayfa kalmalı.'); return false; }
    this.pencere.hataGoster('');
    // Önce kaydetme seçiminin denetimi: yazılacak dosya kilitli ya da salt okunursa sekmeye de dosyaya da dokunulmadan sorulur
    const denetim = await this.kayit.denetle();
    if (this.pencere.kapali || denetim === 'vazgec') return false;
    if (denetim instanceof Error) return this.kayit.hataSor(denetim);
    return this.kayit.uzerineMi() ? this._sekmedeUygula() : this._yeniBelge();
  }

  /**
   * Yeni belge olarak kaydet. Sekmede kaydedilmemiş not değişikliği varsa (yeni belge dosyadaki kayıtlı notlarla kurulur) Sıkıştır'daki
   * gibi sorulur: Kaydet ve devam et | Kaydetmeden devam et | Vazgeç. Yapısal kayıttan sonra sekmenin sayfa düzeni kaydedilmemişse
   * sayfalar dosyadakilerle eşleştirilemez: yalnızca Kaydet ve devam et | Vazgeç. Pencerede yapılan düzen sekmeye uygulanmaz.
   */
  async _yeniBelge() {
    const { baglam, belge } = this;
    const g = belge.gorunum;
    if (belge.kaydediliyor) { baglam.bildir('Kaydediliyor, lütfen bekleyin.'); return false; }
    if (belge.degisti) {
      const duzenKayitsiz = !!g?.anlik && !!g.yapisalKirli?.();
      // Yapısal kayıttan sonra not farkı anlık kopyaya göredir; sayfa düzeni kayıtlıyken kalan değişiklikler nottur
      const notKayitsiz = g?.anlik ? !duzenKayitsiz : !!belge.notlar?.kirli;
      if (duzenKayitsiz || notKayitsiz) {
        const cevap = await degisiklikleriSor(baglam, belge, 'Sayfa düzenleme', duzenKayitsiz
          ? { yalnizKaydet: true, aciklama: 'Yeni belge dosyadaki kayıtlı sayfalardan oluşturulur.', neden: 'Sekmedeki sayfa düzeni kaydedilmediği için sayfalar dosyadakilerle eşleştirilemiyor.' }
          : { aciklama: 'Yeni belge, burada düzenlediğiniz sayfa sırasıyla ve dosyadaki kayıtlı notlarla oluşturulur; kaydedilmemiş not değişiklikleri yeni belgeye girmez.' });
        if (cevap === 'vazgec' || this.pencere.kapali) return false;
      }
    }
    let tarif;
    try { tarif = this._yeniBelgeTarifi(); } catch (e) { this.pencere.hataGoster(hataMetni(e)); return false; }
    const hedef = this.kayit.hedef();
    // İptal yazdıktan sonra ulaşırsa yalnızca yeni oluşan dosya silinir; var olanın (onaylanmış) yerine yazılmışsa sonuç kalır (0.2.1, Birleştir'deki gibi)
    const hedefVardi = await baglam.pdefe.cagir('dosya:varMi', hedef).catch(() => true);
    if (this.pencere.kapali) return false;
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('kaydet', { devre: true });
    let kilit = null;
    const soruAyrintisi = 'Belge diskteki yeni haliyle yeniden açılırsa bu değişiklikler atılır.';
    try {
      const sonuc = await this.ilerleme.calistir(baglam, 'sayfalar_uygula', { yol: belge.yol, hedef, tarif }, { baslangicMesaji: 'Kaydediliyor…' });
      this.ilerleme.gizle();
      await this.pencere.kapat('tamam');
      // Var olan (bir sekmede açık) dosyanın üzerine yazıldıysa o sekme yeni haliyle yeniden açılır, yoksa yeni sekmede açılır
      await ciktiyiAc(baglam, hedef, { cikti: this.kayit.cikti, soruAyrintisi });
      baglam.bildir(`Sayfa düzeni yeni belgeye kaydedildi: ${dosyaAdi(hedef)} · ${sonuc?.sayfa ?? tarif.length} sayfa`, 4000);
    } catch (e) {
      this.ilerleme.gizle();
      if (e.iptal && e.sonuc && hedefVardi) {
        // İptal dosya yazıldıktan sonra ulaştı (çekirdek yazdıktan sonra iptale bakmaz): var olan dosyanın yerine yazılmıştır, önceki içeriği
        // gitti (0.2.1'e dek sonuç da çöp kutusuna gönderiliyordu)
        await this.pencere.kapat('tamam');
        baglam.bildir(`İptal edilemeden tamamlandı: "${dosyaAdi(hedef)}" üzerine yazıldı.`, 6000);
        await ciktiyiAc(baglam, hedef, { cikti: this.kayit.cikti, soruAyrintisi });
      } else if (e.iptal) {
        // İptal geç ulaştıysa yeni dosya yazılmıştır: yarım iş bırakılmasın (çekirdek yazmadan önce iptal ederse dosya oluşmaz)
        if (e.sonuc) { try { await baglam.pdefe.cagir('dosya:sil', hedef); } catch { /* yok say */ } }
        baglam.bildir('Kaydetme iptal edildi.');
      } else if (kilitliHataMi(e)) kilit = e;
      else this.pencere.hataGoster('Yeni belge kaydedilemedi: ' + hataMetni(e));
    } finally {
      if (!this.pencere.kapali) { this.pencere.el.classList.remove('mesgul'); this._secimiCiz(); }
    }
    // Soru yazılamayan dosyayı adıyla söyler (var olan hedef kilitli ya da salt okunur)
    return kilit && !this.pencere.kapali ? this.kayit.hataSor(kilit) : false;
  }

  /**
   * Üzerine yaz: düzen sekmedeki belgeye geri alınabilir komut olarak uygulanır ve belge kaydedilir (Ctrl+S ile aynı yol; Döndür ve
   * kaydet gibi). Sekmede kaydedilmemiş başka değişiklik varsa (kayıt onları da dosyaya yazacağından) önce sorulur. Kayıt başarısız olursa
   * belgeKaydet kendi sorusunu gösterir; düzen sekmede kalır (Ctrl+Z ile geri alınır).
   */
  async _sekmedeUygula() {
    const { baglam, belge } = this;
    const hazir = () => !!belge.gorunum?.sayfaSayisi && !(belge.el && !belge.el.isConnected);
    if (belge.kaydediliyor) { baglam.bildir('Kaydediliyor, lütfen bekleyin.'); return false; }
    if (!hazir()) { this.pencere.hataGoster('Belge açık değil ya da henüz yüklenmedi.'); return false; }
    if ((await degisiklikleriSor(baglam, belge, 'Sayfa düzenleme', {
      yalnizKaydet: true,
      aciklama: 'Üzerine yazarken sayfa düzeni belgeye uygulanır ve belge kaydedilir; bu değişiklikler de dosyaya yazılır.',
    })) === 'vazgec') return false;
    if (this.pencere.kapali) return false;
    // "Kaydet ve devam et" sekmenin sayfalarını anlık kopyaya çevirmiş olabilir: tarif sekmedeki girdilerin güncel kaynağından kurulur
    if (!hazir()) { this.pencere.hataGoster('Belge açık değil ya da henüz yüklenmedi.'); return false; }
    const n = this.kartlar.length;
    this.pencere.el.classList.add('mesgul');
    try {
      if (typeof baglam.sayfaTarifiUygula !== 'function') throw new Error('Sayfa düzeni komutu (sayfaTarifiUygula) bağlanmamış.');
      await baglam.sayfaTarifiUygula(belge, this.tarif(), 'Sayfa düzenini uygula');
    } catch (e) {
      this.pencere.hataGoster('Sayfa düzeni uygulanamadı: ' + hataMetni(e));
      return false;
    } finally {
      if (!this.pencere.kapali) this.pencere.el.classList.remove('mesgul');
    }
    await this.pencere.kapat('tamam');
    const kaydedildi = await baglam.kaydet(belge);
    baglam.bildir(kaydedildi ? tus(`Sayfa düzeni uygulandı ve kaydedildi: ${n} sayfa. Geri almak için Ctrl+Z.`) : `Sayfa düzeni uygulandı: ${n} sayfa; kaydedilmedi.`, kaydedildi ? 4000 : 6000);
    return false;
  }
}

function dugme(komut, baslik, svgIc) {
  return `<button class="ikon" data-komut="${komut}" title="${kacis(baslik)}"><svg viewBox="0 0 20 20">${svgIc}</svg></button>`;
}

export function sayfalarAc(baglam) {
  const belge = baglam.aktif();
  if (!belge) { baglam.bildir('Önce bir PDF açın.'); return null; }
  if (pencereAcikMi('sayfalar')) return null;
  return new SayfalarPenceresi(baglam, belge);
}
