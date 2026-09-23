// Görüntü / PDF belgeleri birleştirerek PDF oluştur (PDF'leri de birleştirir; ayrı "PDF birleştir" aracı kaldırıldı).
// Girdi: Dosya ekle düğmesi, sürükle-bırak (pdefe.dosyaYolu), Ctrl+V / Panodan ekle / listede sağ tık Yapıştır (pano:icerik:
// Gezgin'den kopyalanan dosyalar, ekran görüntüsü ya da tarayıcıdan kopyalanan görsel, metin olarak kopyalanmış dosya yolları;
// ana süreçte Electron pano API'siyle okunur, görsel %TEMP%\PDEfe altına PNG olarak yazılır).
// Çekirdek (core/islemler/araclar.py):
//   gorsel_bilgi {yol} → {tur:'pdf'|'gorsel', sayfa, boyut, genislik, yukseklik, png(base64, küçük resim), bicim (görselde)}
//   boyut_tahmini {oge:{yol, tur, kalite, sayfaBoyutu, kenar, dondurme}} → {boyut, tahmin, ozet, tekrar}   (öğe × kalite başına
//     bir çağrı; çekirdek sonucu ve çözülmüş görseli önbellekte tutar). Aynı ozet'li öğeler (aynı dosya birden çok kez ya da
//     kopyası) çıktıda bir kez saklanır: toplamlarda ilki boyut, sonrakiler yalnızca tekrar kadar sayılır.
//   birlestir {ogeler:[{yol, tur, kalite, sayfaBoyutu, kenar, dondurme}], hedef, genelKalite} (ilerlemeli) → {boyut, sayfa}
import {
  pencereAc, pencereAcikMi, IslemIlerleme, ciktiSecici, boyutMetni, sayiMetni, kacis, hataMetni, dosyaAdi, uzanti,
  bosAdBul, yolAyni, suruklemeSiralama, suruklemeKalintisi, geciktir, oge, segmentliSecim, varsayilanCiktiKlasoru,
  varOlanaYazmaSor, kilitliHataMi, ciktiyiAc,
} from './ortak.js';

/** Kalite seviyeleri (çekirdekteki GORSEL_KALITE ile aynı kimlikler). Açıklamalar teknik ayrıntı (çözünürlük, sıkıştırma türü) içermez. */
export const KALITELER = [
  { id: 'orijinal', ad: 'Orijinal', aciklama: 'Görseller olduğu gibi eklenir; kalite kaybı olmaz, dosya en büyüktür.' },
  { id: 'yuksek', ad: 'Yüksek', aciklama: 'Baskıya uygun kalite; görseller hafifçe sıkıştırılır.' },
  { id: 'orta', ad: 'Orta', aciklama: 'Ekranda okuma ve paylaşım için iyi kalite, daha küçük dosya.' },
  { id: 'dusuk', ad: 'Düşük', aciklama: 'En küçük dosya; görsellerde belirgin kalite kaybı olabilir.' },
];
export const GORSEL_UZANTILAR = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'tif', 'tiff', 'webp', 'heic', 'heif'];
const UZANTILAR = ['pdf', ...GORSEL_UZANTILAR];
const DOSYA_FILTRELERI = [
  { name: 'PDF ve görüntüler', extensions: UZANTILAR },
  { name: 'PDF belgeleri', extensions: ['pdf'] },
  { name: 'Görüntüler', extensions: GORSEL_UZANTILAR },
  { name: 'Tüm dosyalar', extensions: ['*'] },
];
const KUCUK_RESIM = 144;

/** Satırda görünen dosya türü: kullanıcının tanıdığı uzantı ("JPG", "PNG"; çekirdeğin bicim'i "JPEG" gibi teknik ad olabilir). */
function bicimEtiketi(o) {
  if (o.tur === 'pdf') return 'PDF';
  const u = (uzanti(o.yol) || o.bicim || '').toUpperCase();
  return u === 'JPEG' || u === 'JPE' || u === 'JFIF' ? 'JPG' : u === 'TIFF' ? 'TIF' : u === 'HEIF' ? 'HEIC' : (u || 'Görüntü');
}
const SVG = {
  ekle: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  pano: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="4" width="11" height="13.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7.5 4V3.2c0-.4.3-.7.7-.7h3.6c.4 0 .7.3.7.7V4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7.5 9h5M7.5 12h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  tutamac: '<svg viewBox="0 0 12 20" aria-hidden="true"><circle cx="4" cy="6" r="1.2"/><circle cx="8" cy="6" r="1.2"/><circle cx="4" cy="10" r="1.2"/><circle cx="8" cy="10" r="1.2"/><circle cx="4" cy="14" r="1.2"/><circle cx="8" cy="14" r="1.2"/></svg>',
};

export class BirlestirmePenceresi {
  /**
   * @param {object} baglam
   * @param {{baslik?:string, anahtar?:string, ilkDosyalar?:string[]}} s
   */
  constructor(baglam, { baslik, anahtar = 'gorselBirlestir', ilkDosyalar = [] } = {}) {
    this.baglam = baglam;
    this.anahtar = anahtar;
    this.ogeler = [];
    this.kimlikSayac = 0;
    this.seciliKimlik = null;
    this.genelKalite = 'orijinal';
    this.tahminSayac = 0;
    this.tahminler = new Map();       // öğe anahtarı (kalite hariç parametre) → {boyut:{kalite: bayt}, ozet:{kalite: içerik özeti}, tekrar:{kalite: bayt}, hata:{kalite: ileti}}
    this.tahminSurenler = new Map();  // "anahtar|kalite" → Promise; aynı tahmin iki kez sorulmaz
    this.tahminGeciktir = geciktir(() => this.tahminAl(), 150);
    this.ilerleme = new IslemIlerleme();
    this._kur(baslik || 'Görüntü / PDF belgeleri birleştirerek PDF oluştur');
    if (ilkDosyalar.length) this.dosyaEkle(ilkDosyalar);
  }

  get uzantilar() { return UZANTILAR; }

  // ---------------------------------------------------------------- arayüz
  _kur(baslik) {
    const govde = oge(`<div class="birlestir-govde">
      <div class="birlestir-ust">
        <button class="ikincil ikonlu birlestir-ekle" data-ilk-odak>${SVG.ekle}<span>Dosya ekle</span></button>
        <button class="ikincil ikonlu birlestir-yapistir" title="Panodaki dosyaları ya da görüntüyü ekler (Ctrl+V)">${SVG.pano}<span>Panodan ekle</span></button>
        <button class="ikincil birlestir-temizle">Listeyi temizle</button>
        <span class="birlestir-ozet"></span>
      </div>
      <div class="birlestir-liste" tabindex="0" aria-label="Birleştirilecek dosyalar"></div>
      <div class="birlestir-ayarlar">
        <span class="arac-bolum-baslik">Kalite</span>
        <div class="birlestir-kalite-sutun">
          <div class="birlestir-kalite"></div>
          <div class="birlestir-kalite-not" hidden><span class="degisti">Değiştirildi (öğelerde özel ayarlar var)</span><span class="toplam"></span></div>
        </div>
        <span class="arac-bolum-baslik">Kaydet</span>
        <div class="birlestir-cikti"></div>
      </div>
    </div>`);
    this.govde = govde;
    this.liste = govde.querySelector('.birlestir-liste');
    this.ozetEl = govde.querySelector('.birlestir-ozet');
    this.kaliteNotEl = govde.querySelector('.birlestir-kalite-not');

    // Genel kalite: her seviye bir düğme; düğmede o seviyenin toplam tahmini boyutu
    this.kaliteSecim = segmentliSecim({
      etiket: 'Genel kalite', deger: this.genelKalite, sinif: 'birlestir-kalite-secim',
      secenekler: KALITELER.map((k) => ({ id: k.id, baslik: k.aciklama, html: `<span class="ad">${kacis(k.ad)}</span><span class="boyut"></span>` })),
      degisti: (id) => this.genelKaliteDegisti(id),
    });
    govde.querySelector('.birlestir-kalite').replaceWith(this.kaliteSecim.el);

    this.cikti = ciktiSecici({ pdefe: this.baglam.pdefe, klasor: '', ad: 'birlesik.pdf', diyalogBasligi: 'Birleştirilmiş PDF' });
    govde.querySelector('.birlestir-cikti').replaceWith(this.cikti.el);
    this.ciktiHazir = this._varsayilanCikti();

    govde.querySelector('.birlestir-ekle').addEventListener('click', () => this.dosyaSec());
    govde.querySelector('.birlestir-yapistir').addEventListener('click', () => this.panodanEkle());
    govde.querySelector('.birlestir-temizle').addEventListener('click', () => { if (this.ogeler.length) { this.ogeler = []; this.seciliKimlik = null; this.ciz(); } });

    this.pencere = pencereAc({
      baslik, govde, anahtar: this.anahtar, sinif: 'birlestir-pencere',
      dugmeler: [{ id: 'birlestir', etiket: 'Birleştir', birincil: true, devre: true, tiklama: () => this.birlestir() }],
      kapatmadanOnce: (_p, sonuc) => this._kapatmaIzni(sonuc),
    });
    this.pencere.govde.append(this.ilerleme.el);   // meşgulken soluklaşmasın, İptal tıklanabilsin
    this.pencere.el.addEventListener('esc', (e) => { if (this.ilerleme.calisiyor) { e.preventDefault(); this.ilerleme.iptalIste(); } });

    // Sürükle-bırak (Pencere örtüsü olayları yakalar ve 'dosyaBirakildi' yayar)
    this.pencere.ortu.addEventListener('dragenter', () => this.liste.classList.add('surukle-uzerinde'));
    this.pencere.ortu.addEventListener('dragleave', (e) => { if (!this.pencere.ortu.contains(e.relatedTarget)) this.liste.classList.remove('surukle-uzerinde'); });
    this.pencere.el.addEventListener('dosyaBirakildi', (e) => {
      this.liste.classList.remove('surukle-uzerinde');
      const dt = e.detail?.dataTransfer;
      if (!dt) return;
      const yollar = [];
      for (const f of dt.files || []) { try { const y = this.baglam.pdefe.dosyaYolu(f); if (y) yollar.push(y); } catch { /* yok say */ } }
      if (yollar.length) this.dosyaEkle(yollar);
    });
    // Ctrl+V (girdi kutularında normal yapıştırma)
    this.pencere.el.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'v' || e.key === 'V') && !e.target.matches('input, textarea')) { e.preventDefault(); this.panodanEkle(); }
      if (e.key === 'Delete' && e.target === this.liste && this.seciliKimlik != null) { e.preventDefault(); this.sil(this.seciliKimlik); }
    });
    // Listede ve bırakma alanında sağ tık: Yapıştır (Ctrl+V ile aynı), satırda sıralama/döndürme/çıkarma
    this.pencere.baglamMenusuEkle((e) => this._listeMenusu(e));
    // Liste etkileşimi
    this.liste.addEventListener('click', (e) => this._tikla(e));
    this.liste.addEventListener('change', (e) => this._degisti(e));
    this.liste.addEventListener('input', (e) => { if (e.target.matches('input[type=number]')) this._degisti(e); });
    this.sirala = suruklemeSiralama(this.liste, {
      ogeSecici: '.birlestir-oge', izgara: false, metinSecici: '.secilebilir',
      onBirak: (ogeler, hedefIdx) => this.tasi(+ogeler[0].dataset.kimlik, hedefIdx),
    });
    this.pencere.el.addEventListener('kapandi', () => this.sirala());
    this.ciz();
  }

  async _varsayilanCikti() {
    const klasor = await varsayilanCiktiKlasoru(this.baglam);
    let ad = 'birlesik.pdf';
    try { ad = await bosAdBul(this.baglam.pdefe, klasor, ad); } catch { /* varsayılan */ }
    if (!this.cikti.elleDegisti()) this.cikti.ayarla(klasor, ad);
  }

  async _kapatmaIzni(sonuc) {
    if (this.ilerleme.calisiyor) {
      const { secim } = await this.baglam.mesajKutusu({ mesaj: 'Birleştirme sürüyor.', ayrinti: 'Pencereyi kapatırsanız işlem iptal edilir.', dugmeler: ['İptal et ve kapat', 'Sürdür'], varsayilan: 1, iptal: 1 });
      if (secim !== 0) return false;
      this.ilerleme.iptalIste();
      return true;
    }
    if (sonuc !== 'tamam' && this.ogeler.length > 0) {
      const { secim } = await this.baglam.mesajKutusu({ mesaj: 'Liste boş değil.', ayrinti: 'Pencereyi kapatırsanız eklediğiniz dosya listesi kaybolur.', dugmeler: ['Kapat', 'Listeye dön'], varsayilan: 1, iptal: 1 });
      return secim === 0;
    }
    return true;
  }

  _listeMenusu(e) {
    if (!e.target.closest('.birlestir-liste') || this.ilerleme.calisiyor) return null;
    const satir = e.target.closest('.birlestir-oge');
    const menu = [{ id: 'yapistir', etiket: 'Yapıştır', calistir: () => this.panodanEkle() }];
    if (!satir) { menu.push({ id: 'ekle', etiket: 'Dosya ekle', calistir: () => this.dosyaSec() }); return menu; }
    const kimlik = +satir.dataset.kimlik;
    const i = this.ogeler.findIndex((o) => o.kimlik === kimlik);
    this._sec(kimlik);
    menu.push(
      { ayirici: true },
      { id: 'yukari', etiket: 'Yukarı taşı', devre: i <= 0, calistir: () => this.kaydir(kimlik, -1) },
      { id: 'asagi', etiket: 'Aşağı taşı', devre: i >= this.ogeler.length - 1, calistir: () => this.kaydir(kimlik, 1) },
      { id: 'sola', etiket: 'Sola döndür', calistir: () => this.dondur(kimlik, -90) },
      { id: 'saga', etiket: 'Sağa döndür', calistir: () => this.dondur(kimlik, 90) },
      { ayirici: true },
      { id: 'cikar', etiket: 'Listeden çıkar', calistir: () => this.sil(kimlik) },
    );
    return menu;
  }

  // ---------------------------------------------------------------- dosya ekleme
  async dosyaSec() {
    const yollar = await this.baglam.pdefe.cagir('dosya:acDiyalog', { baslik: 'Birleştirilecek dosyalar', filtreler: DOSYA_FILTRELERI, coklu: true });
    if (yollar?.length && !this.pencere.kapali) this.dosyaEkle(yollar);
  }

  /** Yolları listeye ekler; desteklenmeyen uzantıları bildirir. Eklenen dosya sayısını döner. */
  dosyaEkle(yollar, konum = null) {
    const kabul = [], red = [];
    for (const y of yollar) (this.uzantilar.includes(uzanti(y)) ? kabul : red).push(y);
    if (red.length) this.baglam.bildir(`${red.length} dosya atlandı (desteklenmeyen tür): ${red.slice(0, 3).map(dosyaAdi).join(', ')}${red.length > 3 ? ` ve ${red.length - 3} dosya daha` : ''}`, 4000);
    if (!kabul.length) return 0;
    const yeniler = kabul.map((yol) => ({
      kimlik: ++this.kimlikSayac, yol, ad: dosyaAdi(yol), tur: uzanti(yol) === 'pdf' ? 'pdf' : 'gorsel', sayfa: null, boyut: null,
      genislik: null, yukseklik: null, png: null, dondurme: 0, kalite: null, sayfaBoyutu: 'orijinal', kenar: 10, hata: null, yukleniyor: true,
    }));
    const idx = konum == null ? this.ogeler.length : Math.max(0, Math.min(konum, this.ogeler.length));
    this.ogeler.splice(idx, 0, ...yeniler);
    this.ciz();
    this.liste.querySelector(`.birlestir-oge[data-kimlik="${yeniler[yeniler.length - 1].kimlik}"]`)?.scrollIntoView({ block: 'nearest' });
    for (const o of yeniler) this._bilgiYukle(o);
    return yeniler.length;
  }

  async _bilgiYukle(o) {
    try {
      const b = await this.baglam.cekirdek('gorsel_bilgi', { yol: o.yol, genislik: KUCUK_RESIM });
      if (this.pencere.kapali) return;
      Object.assign(o, {
        tur: b.tur || o.tur, sayfa: b.sayfa ?? (o.tur === 'gorsel' ? 1 : null), boyut: b.boyut ?? null,
        genislik: b.genislik ?? null, yukseklik: b.yukseklik ?? null, png: b.png || null, bicim: b.bicim || uzanti(o.yol), yukleniyor: false, hata: null,
      });
      if (b.boyut == null) { const bi = await this.baglam.pdefe.cagir('dosya:bilgi', o.yol).catch(() => null); if (bi?.var) o.boyut = bi.boyut; }
    } catch (e) {
      o.yukleniyor = false;
      o.hata = hataMetni(e);
    }
    this._ogeCiz(o);
    this._ozetYaz();
    this.tahminGeciktir();
  }

  /** Ctrl+V, Panodan ekle ve sağ tık Yapıştır: panodaki dosyalar, yoksa görüntü, yoksa metin olarak kopyalanmış dosya yolları. */
  async panodanEkle() {
    if (this._panoSuruyor || this.ilerleme.calisiyor) return;
    this._panoSuruyor = true;
    const t0 = performance.now();
    // Okuma çoğunlukla birkaç milisaniye sürer; uzarsa geri bildirim göster (yanıp sönmesin diye hemen değil)
    const bekleme = setTimeout(() => { this.ozetEl.textContent = 'Panodan ekleniyor…'; this.ozetEl.classList.add('bekliyor'); }, 120);
    try {
      const r = await this.baglam.pdefe.cagir('pano:icerik');
      if (this.pencere.kapali) return;
      this.sonPanoSuresi = Math.round(performance.now() - t0);
      if (r?.tur === 'dosyalar') {
        const n = this.dosyaEkle(r.dosyalar);
        if (!n && r.dosyalar.length) this.baglam.bildir('Panodaki dosyalar eklenemedi: yalnızca PDF ve görüntü dosyaları eklenebilir.', 4000);
      } else if (r?.tur === 'gorsel' && r.yol) {
        this.dosyaEkle([r.yol]);
      } else if (r?.tur === 'metin') {
        this.baglam.bildir('Panoda metin var; eklenecek dosya ya da görüntü yok.', 3500);
      } else {
        this.baglam.bildir('Pano boş: eklenecek dosya ya da görüntü yok.', 3500);
      }
    } catch (e) {
      if (!this.pencere.kapali) this.pencere.hataGoster('Panodan eklenemedi: ' + hataMetni(e));
    } finally {
      clearTimeout(bekleme);
      this._panoSuruyor = false;
      if (!this.pencere.kapali) { this.ozetEl.classList.remove('bekliyor'); this._ozetYaz(); }
    }
  }

  // ---------------------------------------------------------------- liste işlemleri
  _oge(kimlik) { return this.ogeler.find((o) => o.kimlik === kimlik); }

  sil(kimlik) {
    const i = this.ogeler.findIndex((o) => o.kimlik === kimlik);
    if (i < 0) return;
    this.ogeler.splice(i, 1);
    if (this.seciliKimlik === kimlik) this.seciliKimlik = this.ogeler[Math.min(i, this.ogeler.length - 1)]?.kimlik ?? null;
    this.ciz();
  }

  tasi(kimlik, hedefIdx) {
    const i = this.ogeler.findIndex((o) => o.kimlik === kimlik);
    if (i < 0) return;
    const [o] = this.ogeler.splice(i, 1);
    this.ogeler.splice(Math.max(0, Math.min(hedefIdx, this.ogeler.length)), 0, o);
    this.seciliKimlik = kimlik;
    this.ciz();
  }

  kaydir(kimlik, yon) {
    const i = this.ogeler.findIndex((o) => o.kimlik === kimlik);
    const j = i + yon;
    if (i < 0 || j < 0 || j >= this.ogeler.length) return;
    [this.ogeler[i], this.ogeler[j]] = [this.ogeler[j], this.ogeler[i]];
    this.seciliKimlik = kimlik;
    this.ciz();
    this.liste.querySelector(`[data-kimlik="${kimlik}"] [data-komut="${yon < 0 ? 'yukari' : 'asagi'}"]`)?.focus();
  }

  dondur(kimlik, derece) {
    const o = this._oge(kimlik);
    if (!o) return;
    o.dondurme = ((o.dondurme + derece) % 360 + 360) % 360;
    this._ogeCiz(o);
    if (o.tur === 'gorsel') this.tahminGeciktir();   // görselde sayfa yönü değişir, boyut da değişebilir
  }

  genelKaliteDegisti(deger) {
    this.genelKalite = deger;
    this.kaliteSecim.sec(deger);
    // KURAL: genel kalite değişince bütün öğelerin özel ayarı silinir
    for (const o of this.ogeler) o.kalite = null;
    for (const o of this.ogeler) this._ogeCiz(o);
    this._tahminleriYaz();
    this.tahminGeciktir();
  }

  etkinKalite(o) { return o.kalite || this.genelKalite; }

  _sec(kimlik) {
    this.seciliKimlik = kimlik;
    for (const x of this.liste.querySelectorAll('.birlestir-oge')) x.classList.toggle('secili', +x.dataset.kimlik === kimlik);
  }

  _tikla(e) {
    if (suruklemeKalintisi(this.liste)) return;
    const el = e.target.closest('.birlestir-oge');
    if (!el) return;
    const kimlik = +el.dataset.kimlik;
    const btn = e.target.closest('button[data-komut]');
    if (btn) {
      const k = btn.dataset.komut;
      if (k === 'sil') this.sil(kimlik);
      else if (k === 'yukari') this.kaydir(kimlik, -1);
      else if (k === 'asagi') this.kaydir(kimlik, 1);
      else if (k === 'sola') this.dondur(kimlik, -90);
      else if (k === 'saga') this.dondur(kimlik, 90);
      return;
    }
    if (e.target.matches('select, input')) return;
    this._sec(kimlik);
    // Metin seçiliyken odak listeye alınırsa seçim kaybolmaz; yine de seçimi bozmamak için yalnızca seçim yoksa odakla
    if (!window.getSelection()?.toString()) this.liste.focus({ preventScroll: true });
  }

  _degisti(e) {
    const el = e.target.closest('.birlestir-oge');
    if (!el) return;
    const o = this._oge(+el.dataset.kimlik);
    if (!o) return;
    const t = e.target;
    if (t.matches('.oge-kalite')) { o.kalite = t.value || null; this._tahminleriYaz(); this.tahminGeciktir(); }
    else if (t.matches('.oge-sayfa-boyutu')) {
      o.sayfaBoyutu = t.value;
      el.querySelector('.oge-kenar-alani').hidden = o.sayfaBoyutu === 'orijinal';
      this._tahminleriYaz(); this.tahminGeciktir();
    }
    else if (t.matches('.oge-kenar')) { const v = parseFloat(t.value); o.kenar = Number.isFinite(v) ? Math.max(0, Math.min(50, v)) : 10; this._tahminleriYaz(); this.tahminGeciktir(); }
  }

  // ---------------------------------------------------------------- çizim
  ciz() {
    this.liste.innerHTML = '';
    this.liste.classList.toggle('bos', !this.ogeler.length);
    if (!this.ogeler.length) {
      this.liste.append(oge(`<div class="bos-mesaj"><b>Dosyaları buraya sürükleyin</b><span>ya da "Dosya ekle" düğmesini kullanın. Gezgin'den kopyalanan dosyaları ve ekran görüntüsünü Ctrl+V veya Yapıştır ile yapıştırabilirsiniz.</span><span class="soluk">PDF, JPG, PNG, BMP, GIF, TIFF, WEBP, HEIC</span></div>`));
    }
    this.ogeler.forEach((o, i) => { const el = this._ogeOlustur(o); this.liste.append(el); this._ogeCiz(o, i); });
    this._ozetYaz();
    this._tahminleriYaz();
    this.tahminGeciktir();
  }

  _ogeOlustur(o) {
    const el = oge(`<div class="birlestir-oge" data-kimlik="${o.kimlik}" data-surukle-etiket="${kacis(o.ad)}">
      <span class="birlestir-tutamac" title="Sürükleyerek sıralayın">${SVG.tutamac}</span>
      <span class="sira"></span>
      <div class="resim"><div class="yer"></div></div>
      <div class="bilgi">
        <span class="ad secilebilir" title="${kacis(o.yol)}">${kacis(o.ad)}</span>
        <span class="ozet secilebilir"></span>
        <div class="ayarlar">
          <label>Kalite <select class="arac-girdi oge-kalite"><option value="">Genel</option>${KALITELER.map((k) => `<option value="${k.id}">${k.ad}</option>`).join('')}</select></label>
          <span class="tahmin secilebilir"></span>
          <span class="gorsel-ayar" hidden>
            <label>Sayfa <select class="arac-girdi oge-sayfa-boyutu"><option value="a4">A4'e sığdır</option><option value="orijinal">Orijinal</option></select></label>
            <label class="oge-kenar-alani">Kenar <input type="number" class="arac-girdi oge-kenar" min="0" max="50" step="1"> mm</label>
          </span>
        </div>
        <span class="hata secilebilir" hidden></span>
      </div>
      <div class="dugmeler">
        <button class="ikon" data-komut="sola" title="Sola döndür"><svg viewBox="0 0 20 20"><path d="M5 9A5.5 5.5 0 1 1 6 13.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 4v5h5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
        <button class="ikon" data-komut="saga" title="Sağa döndür"><svg viewBox="0 0 20 20"><path d="M15 9A5.5 5.5 0 1 0 14 13.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M15 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
        <span class="ayrac"></span>
        <button class="ikon" data-komut="yukari" title="Yukarı taşı"><svg viewBox="0 0 20 20"><path d="m5 12 5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
        <button class="ikon" data-komut="asagi" title="Aşağı taşı"><svg viewBox="0 0 20 20"><path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
        <span class="ayrac"></span>
        <button class="ikon" data-komut="sil" title="Listeden çıkar"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5"/></svg></button>
      </div>
    </div>`);
    el.querySelector('.oge-kalite').value = o.kalite || '';
    el.querySelector('.oge-sayfa-boyutu').value = o.sayfaBoyutu;
    el.querySelector('.oge-kenar').value = String(o.kenar);
    return el;
  }

  _ogeCiz(o, idx = null) {
    const el = this.liste.querySelector(`.birlestir-oge[data-kimlik="${o.kimlik}"]`);
    if (!el) return;
    const i = idx ?? this.ogeler.indexOf(o);
    el.querySelector('.sira').textContent = String(i + 1);
    el.classList.toggle('secili', this.seciliKimlik === o.kimlik);
    el.classList.toggle('yukleniyor', !!o.yukleniyor);
    el.querySelector('[data-komut="yukari"]').disabled = i <= 0;
    el.querySelector('[data-komut="asagi"]').disabled = i >= this.ogeler.length - 1;
    const resim = el.querySelector('.resim');
    if (o.png && !resim.querySelector('img')) {
      resim.innerHTML = '';
      const img = document.createElement('img'); img.src = 'data:image/png;base64,' + o.png; img.alt = o.ad; img.draggable = false;
      resim.append(img);
    } else if (!o.png && !o.yukleniyor) {
      resim.innerHTML = `<div class="yer">${kacis(bicimEtiketi(o))}</div>`;
    }
    const img = resim.querySelector('img');
    if (img) img.style.transform = o.dondurme ? `rotate(${o.dondurme}deg)` : '';
    const parcalar = [`<span class="tur">${kacis(bicimEtiketi(o))}</span>`];
    if (o.yukleniyor) parcalar.push('okunuyor…');
    else {
      if (o.tur === 'pdf' && o.sayfa != null) parcalar.push(`${sayiMetni(o.sayfa)} sayfa`);
      if (o.genislik && o.yukseklik) parcalar.push(o.tur === 'pdf' ? `${Math.round(o.genislik)}×${Math.round(o.yukseklik)} pt` : `${o.genislik}×${o.yukseklik} px`);
      if (o.boyut != null) parcalar.push(boyutMetni(o.boyut));
      if (o.dondurme) parcalar.push(`${o.dondurme}° döndürülmüş`);
    }
    el.querySelector('.ozet').innerHTML = parcalar.join(' · ');
    const hata = el.querySelector('.hata');
    hata.hidden = !o.hata; hata.textContent = o.hata || '';
    el.querySelector('.ayarlar').hidden = !!o.hata;
    el.querySelector('.gorsel-ayar').hidden = o.tur !== 'gorsel';
    // "Orijinal"de (varsayılan) sayfa görselin kendisidir, kenar boşluğu yoktur: kenar yalnızca "A4'e sığdır"da ayarlanır
    el.querySelector('.oge-kenar-alani').hidden = o.sayfaBoyutu === 'orijinal';
    el.querySelector('.oge-kalite').value = o.kalite || '';
    el.querySelector('.oge-kalite').querySelector('option[value=""]').textContent = `Genel (${KALITELER.find((k) => k.id === this.genelKalite)?.ad || ''})`;
    this._ogeTahminYaz(o, el);
  }

  _ozetYaz() {
    const n = this.ogeler.length;
    const sayfa = this.ogeler.reduce((t, o) => t + (o.sayfa || 0), 0);
    const boyut = this.ogeler.reduce((t, o) => t + (o.boyut || 0), 0);
    if (!this._panoSuruyor || !this.ozetEl.classList.contains('bekliyor')) {
      this.ozetEl.textContent = n ? `${n} dosya · ${sayiMetni(sayfa)} sayfa · ${boyutMetni(boyut)}` : '';
      this.ozetEl.title = n ? 'Eklenen dosyaların toplam sayfa sayısı ve boyutu' : '';
    }
    const hazir = n >= 1 && !this.ogeler.some((o) => o.yukleniyor) && !this.ilerleme.calisiyor;
    this.pencere.dugmeAyarla('birlestir', { devre: !hazir });
    this.govde.querySelector('.birlestir-temizle').disabled = !n;
  }

  // ---------------------------------------------------------------- tahmin
  /** Kalite hariç öğe parametresi: tahmin önbelleğinin anahtarı (PDF'te boyutu döndürme değiştirmez). */
  _tahminAnahtari(o) {
    const p = { yol: o.yol, tur: o.tur };
    if (o.tur === 'gorsel') { p.sayfaBoyutu = o.sayfaBoyutu; p.kenar = this._kenar(o); p.dondurme = o.dondurme; }
    return JSON.stringify(p);
  }

  /** Görselin kenar boşluğu: orijinal boyutta yok (çekirdek de kullanmaz; tahmin anahtarı kenara göre ayrılmasın). */
  _kenar(o) { return o.sayfaBoyutu === 'orijinal' ? 0 : o.kenar; }

  /** Öğenin verilen kalitedeki tahmini: sayı | null (alınamadı) | undefined (henüz yok). */
  _tahmin(o, kalite) {
    const t = this.tahminler.get(this._tahminAnahtari(o));
    if (!t) return undefined;
    if (kalite in t.boyut) return t.boyut[kalite];
    if (kalite in t.hata) return null;
    return undefined;
  }

  /**
   * Her öğe için her kalite seviyesinin boyutunu çekirdekten sırayla alır: önce öğelerin etkin kalitesi (öğedeki "tahmin"),
   * sonra genel kalite, sonra diğer seviyeler (düğmelerdeki toplamlar). Sonuçlar öğe parametresine göre önbellekte kalır;
   * değişmeyen öğe yeniden sorulmaz. Çağrılar tek tek yapıldığından araya giren küçük resim istekleri beklemez.
   * Arada yeni bir istek gelirse (sayac değişir) eski döngü süren çağrıdan sonra durur.
   */
  async tahminAl() {
    if (this.pencere.kapali) return;
    const sayac = ++this.tahminSayac;
    const hazir = this.ogeler.filter((o) => !o.yukleniyor && !o.hata);
    const isler = [];
    const ekle = (o, kalite) => { if (this._tahmin(o, kalite) === undefined && !isler.some((x) => x.o === o && x.kalite === kalite)) isler.push({ o, kalite }); };
    for (const o of hazir) ekle(o, this.etkinKalite(o));
    for (const o of hazir) ekle(o, this.genelKalite);
    for (const k of KALITELER) for (const o of hazir) ekle(o, k.id);
    this._tahminleriYaz();
    for (const { o, kalite } of isler) {
      if (sayac !== this.tahminSayac || this.pencere.kapali) return;
      if (!this.ogeler.includes(o) || o.hata || this._tahmin(o, kalite) !== undefined) continue;
      await this._tahminIste(o, kalite);
      if (this.pencere.kapali) return;
      this._tahminleriYaz();
    }
    if (this.tahminler.size > 300) { this.tahminler.clear(); this.tahminSurenler.clear(); }
  }

  _tahminIste(o, kalite) {
    const anahtar = this._tahminAnahtari(o);
    const is = anahtar + '|' + kalite;
    if (this.tahminSurenler.has(is)) return this.tahminSurenler.get(is);
    const param = this._ogeParametresi(o, kalite);
    const soz = (async () => {
      let t = this.tahminler.get(anahtar);
      if (!t) { t = { boyut: {}, ozet: {}, tekrar: {}, hata: {} }; this.tahminler.set(anahtar, t); }
      try {
        const r = await this.baglam.cekirdek('boyut_tahmini', { oge: param });
        const b = typeof r === 'number' ? r : r?.boyut;
        if (typeof b === 'number' && Number.isFinite(b)) {
          t.boyut[kalite] = b;
          if (r?.ozet) { t.ozet[kalite] = r.ozet; t.tekrar[kalite] = Number.isFinite(r.tekrar) ? r.tekrar : 0; }
        } else t.hata[kalite] = 'Çekirdek boyut vermedi.';
      } catch (e) {
        t.hata[kalite] = hataMetni(e);
      } finally {
        this.tahminSurenler.delete(is);
      }
    })();
    this.tahminSurenler.set(is, soz);
    return soz;
  }

  /** Öğenin verilen kalitedeki içerik özeti (çekirdek vermediyse null): aynı özetli öğeler çıktıda bir kez saklanır. */
  _tahminOzeti(o, kalite) {
    return this.tahminler.get(this._tahminAnahtari(o))?.ozet[kalite] || null;
  }

  /** Listede bu öğeden önce, etkin kalitede aynı içeriği taşıyan ilk öğe (yoksa null). */
  _oncekiAyni(o) {
    if (o.hata || o.yukleniyor) return null;
    const ozet = this._tahminOzeti(o, this.etkinKalite(o));
    if (!ozet) return null;
    for (const x of this.ogeler) {
      if (x === o) return null;
      if (!x.hata && !x.yukleniyor && this._tahminOzeti(x, this.etkinKalite(x)) === ozet) return x;
    }
    return null;
  }

  _ogeTahminYaz(o, el = this.liste.querySelector(`.birlestir-oge[data-kimlik="${o.kimlik}"]`)) {
    const t = el?.querySelector('.tahmin');
    if (!t) return;
    t.classList.toggle('ozel', !!o.kalite);
    t.title = o.kalite ? 'Bu dosyaya özel kalite' : '';
    if (o.hata || o.yukleniyor) { t.textContent = ''; return; }
    const b = this._tahmin(o, this.etkinKalite(o));
    if (b === null) { t.textContent = 'tahmin alınamadı'; t.title = this.tahminler.get(this._tahminAnahtari(o))?.hata[this.etkinKalite(o)] || ''; return; }
    if (b === undefined) { t.textContent = 'tahmin: hesaplanıyor…'; return; }
    // Aynı içerik listede daha önce varsa PDF'te bir kez saklanır: toplam bu satır kadar büyümez
    const ayni = this._oncekiAyni(o);
    const n = ayni ? this.ogeler.indexOf(ayni) + 1 : 0;
    t.textContent = `tahmin: ${boyutMetni(b)}${ayni ? ` · ${n}. satırla aynı içerik` : ''}`;
    if (ayni) t.title = `${t.title ? t.title + '\n' : ''}Aynı içerik ${n}. satırda da var. PDF'te bir kez saklanır; bu satır toplam boyutu çok az artırır.`;
  }

  /** Öğe tahminleri, kalite düğmelerindeki toplamlar ve (öğelere özel kalite varsa) gerçek toplam. */
  _tahminleriYaz() {
    if (this.pencere?.kapali) return;
    for (const o of this.ogeler) this._ogeTahminYaz(o);
    const gecerli = this.ogeler.filter((o) => !o.hata);
    const toplam = (kaliteAl) => {
      let bayt = 0, eksik = false, hatali = 0;
      const gorulen = new Set();   // içerik özetleri: aynı içerik ikinci kez yalnızca kendi sayfa nesneleri kadar yer tutar
      for (const o of gecerli) {
        if (o.yukleniyor) { eksik = true; continue; }
        const kalite = kaliteAl(o);
        const b = this._tahmin(o, kalite);
        if (b === undefined) eksik = true;
        else if (b === null) hatali++;
        else {
          const ozet = this._tahminOzeti(o, kalite);
          if (ozet && gorulen.has(ozet)) bayt += this.tahminler.get(this._tahminAnahtari(o))?.tekrar[kalite] || 0;
          else { if (ozet) gorulen.add(ozet); bayt += b; }
        }
      }
      return { bayt, eksik, hatali };
    };
    const metin = ({ bayt, eksik, hatali }) => (eksik ? 'hesaplanıyor…' : hatali ? `≥ ${boyutMetni(bayt)}` : boyutMetni(bayt));
    for (const k of KALITELER) {
      const d = this.kaliteSecim.dugme(k.id);
      const bSpan = d.querySelector('.boyut');
      if (!gecerli.length) { bSpan.textContent = ''; d.title = k.aciklama; continue; }
      const s = toplam(() => k.id);
      bSpan.textContent = ' · ' + metin(s);
      bSpan.classList.toggle('bekliyor', s.eksik);
      d.title = `${k.aciklama}${s.eksik ? '' : `\nTahmini boyut: ${metin(s)}`}${s.hatali ? `\n${s.hatali} dosya için tahmin alınamadı` : ''}`;
    }
    const ozelVar = this.ogeler.some((o) => o.kalite && !o.hata);
    this.kaliteNotEl.hidden = !ozelVar;
    if (ozelVar) {
      const s = toplam((o) => this.etkinKalite(o));
      this.kaliteNotEl.querySelector('.toplam').textContent = ` · Tahmini boyut: ${metin(s)}`;
    }
  }

  /** Çekirdeğin birlestir/boyut_tahmini öğe biçimi. kalite verilmezse etkin kalite (öğeye özel ya da genel). */
  _ogeParametresi(o, kalite = this.etkinKalite(o)) {
    const p = { yol: o.yol, tur: o.tur, dondurme: o.dondurme, kalite };
    if (o.tur === 'gorsel') { p.sayfaBoyutu = o.sayfaBoyutu; p.kenar = this._kenar(o); }
    return p;
  }

  // ---------------------------------------------------------------- birleştir
  async birlestir() {
    const { baglam } = this;
    if (this.ilerleme.calisiyor) return;
    const ogeler = this.ogeler.filter((o) => !o.hata);
    if (this.ogeler.some((o) => o.hata)) {
      const { secim } = await baglam.mesajKutusu({ mesaj: 'Bazı dosyalar okunamadı.', ayrinti: 'Okunamayan dosyalar atlanarak devam edilsin mi?', dugmeler: ['Atla ve devam et', 'Vazgeç'], varsayilan: 0, iptal: 1 });
      if (secim !== 0) return;
    }
    if (ogeler.length < 1) { baglam.bildir('En az bir dosya ekleyin.'); return; }
    await this.ciktiHazir;
    if (!this.cikti.ad()) { baglam.bildir('Dosya adı girin.'); this.cikti.odakla(); return; }
    if (!this.cikti.klasor()) {
      const k = await baglam.pdefe.cagir('dosya:klasorSec', { baslik: 'Birleştirilmiş PDF\'in kaydedileceği klasör' });
      if (!k) return;
      this.cikti.ayarla(k, null, { elle: true });
    }
    const hedef = this.cikti.yol();
    if (ogeler.some((o) => yolAyni(o.yol, hedef))) {
      baglam.bildir('Kaydedilecek dosya, listedeki dosyalardan biriyle aynı olamaz. Başka bir ad seçin.', 4000); return;
    }
    if (!(await varOlanaYazmaSor(baglam, this.cikti, hedef))) return;
    if (this.pencere.kapali) return;
    this.pencere.hataGoster('');
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('birlestir', { devre: true });
    try {
      // Çekirdek sonucu: {boyut, sayfa}
      const sonuc = await this.ilerleme.calistir(baglam, 'birlestir', {
        ogeler: ogeler.map((o) => this._ogeParametresi(o)), hedef, genelKalite: this.genelKalite,
      }, { baslangicMesaji: 'Birleştiriliyor…' });
      const boyut = sonuc?.boyut ?? (await baglam.pdefe.cagir('dosya:bilgi', hedef).catch(() => null))?.boyut;
      this.ilerleme.gizle();
      await this.pencere.kapat('tamam');
      baglam.bildir(`Birleştirildi: ${dosyaAdi(hedef)}${boyut != null ? ' · ' + boyutMetni(boyut) : ''}${sonuc?.sayfa ? ' · ' + sonuc.sayfa + ' sayfa' : ''}`, 4000);
      // Var olan (bir sekmede açık) dosyanın üzerine yazıldıysa o sekme yeni haliyle yeniden açılır, yoksa yeni sekmede açılır
      await ciktiyiAc(baglam, hedef, { cikti: this.cikti, soruAyrintisi: 'Belge diskteki yeni haliyle yeniden açılırsa bu değişiklikler atılır.' });
    } catch (e) {
      this.ilerleme.gizle();
      if (e.iptal) {
        baglam.bildir('Birleştirme iptal edildi.');
        if (e.sonuc) { try { await baglam.pdefe.cagir('dosya:sil', hedef); } catch { /* yok say */ } }
      } else if (kilitliHataMi(e)) {
        this.pencere.hataGoster(/salt okunur/i.test(e?.message || '')
          ? `"${dosyaAdi(hedef)}" kaydedilemedi: aynı adlı var olan dosya salt okunur. Başka bir ad seçin.`
          : `"${dosyaAdi(hedef)}" kaydedilemedi: dosya başka bir programda açık olabilir. Programı kapatıp yeniden deneyin ya da başka bir ad seçin.`);
      } else this.pencere.hataGoster('Birleştirme başarısız: ' + hataMetni(e));
    } finally {
      if (!this.pencere.kapali) {
        this.pencere.el.classList.remove('mesgul');
        this._ozetYaz();
      }
    }
  }
}

export function gorselBirlestirAc(baglam, ilkDosyalar = []) {
  if (pencereAcikMi('gorselBirlestir')) return null;
  return new BirlestirmePenceresi(baglam, { ilkDosyalar });
}
