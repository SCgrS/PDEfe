// Görüntü / PDF belgeleri birleştirerek PDF oluştur. birlestir.js aynı sınıfı "yalnızca PDF" kipinde kullanır.
// Girdi: Dosya ekle düğmesi, sürükle-bırak (pdefe.dosyaYolu), Ctrl+V (pano:dosyalar → pano:gorsel → pano_gorsel_kaydet).
// Çekirdek (core/islemler/araclar.py):
//   gorsel_bilgi {yol} → {tur:'pdf'|'gorsel', sayfa, boyut, genislik, yukseklik, png(base64, 220 px), bicim (görselde)}
//   boyut_tahmini {oge:{yol, tur, kalite, sayfaBoyutu, kenar, dondurme}, genelKalite} → {boyut, tahmin}   (öğe başına bir çağrı)
//   birlestir {ogeler:[{yol, tur, kalite, sayfaBoyutu, kenar, dondurme}], hedef, genelKalite} (ilerlemeli) → {boyut, sayfa}
//   pano_gorsel_kaydet {png(base64)} → {yol, boyut}   (Temp/PDEfe altına PNG yazar)
import {
  pencereAc, pencereAcikMi, IslemIlerleme, ciktiSecici, boyutMetni, sayiMetni, kacis, hataMetni, dosyaAdi, klasorAdi, uzanti,
  adGovdesi, bosAdBul, yolAyni, suruklemeSiralama, suruklemeKalintisi, geciktir, oge,
} from './ortak.js';

/** Kalite seviyeleri; DPI/JPEG değerleri çekirdekteki GORSEL_KALITE tablosuyla aynıdır (yalnızca bilgi için). */
export const KALITELER = [
  { id: 'orijinal', ad: 'Orijinal', aciklama: 'Görseller yeniden sıkıştırılmaz' },
  { id: 'yuksek', ad: 'Yüksek', aciklama: '300 DPI, JPEG %90' },
  { id: 'orta', ad: 'Orta', aciklama: '200 DPI, JPEG %75' },
  { id: 'dusuk', ad: 'Düşük', aciklama: '120 DPI, JPEG %55' },
];
export const GORSEL_UZANTILAR = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'tif', 'tiff', 'webp', 'heic', 'heif'];
const DOSYA_FILTRELERI = [
  { name: 'PDF ve görüntüler', extensions: ['pdf', ...GORSEL_UZANTILAR] },
  { name: 'PDF belgeleri', extensions: ['pdf'] },
  { name: 'Görüntüler', extensions: GORSEL_UZANTILAR },
  { name: 'Tüm dosyalar', extensions: ['*'] },
];
const KUCUK_RESIM = 144;

export class BirlestirmePenceresi {
  /**
   * @param {object} baglam
   * @param {{yalnizPdf?:boolean, baslik?:string, anahtar?:string, ilkDosyalar?:string[]}} s
   */
  constructor(baglam, { yalnizPdf = false, baslik, anahtar, ilkDosyalar = [] } = {}) {
    this.baglam = baglam;
    this.yalnizPdf = yalnizPdf;
    this.anahtar = anahtar || (yalnizPdf ? 'birlestir' : 'gorselBirlestir');
    this.ogeler = [];
    this.kimlikSayac = 0;
    this.genelKalite = 'orijinal';
    this.ciktiElleDegisti = false;
    this.tahminSayac = 0;
    this.tahminOnbellek = new Map();   // JSON(öğe parametresi) → bayt; değişmeyen öğe yeniden sorulmaz
    this.tahminGeciktir = geciktir(() => this.tahminAl(), 600);
    this.ilerleme = new IslemIlerleme();
    this._kur(baslik || (yalnizPdf ? 'PDF birleştir' : 'Görüntü / PDF belgeleri birleştirerek PDF oluştur'));
    if (ilkDosyalar.length) this.dosyaEkle(ilkDosyalar);
  }

  get uzantilar() { return this.yalnizPdf ? ['pdf'] : ['pdf', ...GORSEL_UZANTILAR]; }

  // ---------------------------------------------------------------- arayüz
  _kur(baslik) {
    const ayar = this.baglam.ayar?.() || {};
    const govde = oge(`<div class="birlestir-govde" style="display:flex;flex-direction:column;flex:1;min-height:0;gap:10px">
      <div class="arac-satir">
        <button class="ikincil birlestir-ekle" data-ilk-odak>Dosya ekle…</button>
        ${this.yalnizPdf ? '' : '<button class="ikincil birlestir-yapistir" title="Panodaki dosyaları ya da ekran görüntüsünü ekler (Ctrl+V)">Panodan ekle</button>'}
        <button class="ikincil birlestir-temizle">Listeyi temizle</button>
        <span class="soluk birlestir-ozet" style="margin-left:auto"></span>
      </div>
      <div class="birlestir-liste" tabindex="0"></div>
      <div class="birlestir-alt"></div>
    </div>`);
    this.govde = govde;
    this.liste = govde.querySelector('.birlestir-liste');
    this.ozetEl = govde.querySelector('.birlestir-ozet');
    const alt = govde.querySelector('.birlestir-alt');

    // Genel kalite + toplam tahmin
    if (!this.yalnizPdf) {
      this.genelEl = oge(`<div class="birlestir-genel">
        <span>Genel kalite</span>
        <select class="arac-girdi birlestir-genel-kalite">${KALITELER.map((k) => `<option value="${k.id}">${k.ad} — ${k.aciklama}</option>`).join('')}</select>
        <span class="degisti" hidden>Değiştirildi (öğelere özel ayarlar var)</span>
        <span class="toplam">Toplam tahmini boyut: <b>—</b></span>
      </div>`);
      this.genelSecim = this.genelEl.querySelector('.birlestir-genel-kalite');
      this.genelSecim.value = this.genelKalite;
      this.genelSecim.addEventListener('change', () => this.genelKaliteDegisti(this.genelSecim.value));
      this.toplamEl = this.genelEl.querySelector('.toplam');
      alt.append(this.genelEl);
    } else {
      this.toplamEl = oge('<div class="birlestir-genel"><span class="toplam">Toplam: <b>—</b></span></div>');
      alt.append(this.toplamEl);
      this.toplamEl = this.toplamEl.querySelector('.toplam');
    }

    this.cikti = ciktiSecici({ pdefe: this.baglam.pdefe, klasor: ayar.ciktiKlasoru || '', ad: 'birlesik.pdf', etiket: 'Çıktı dosyası', diyalogBasligi: 'Birleştirilmiş PDF' });
    this.cikti.onDegisti(() => { this.ciktiElleDegisti = true; });
    alt.append(this.cikti.el, this.ilerleme.el);

    govde.querySelector('.birlestir-ekle').addEventListener('click', () => this.dosyaSec());
    govde.querySelector('.birlestir-yapistir')?.addEventListener('click', () => this.panodanEkle());
    govde.querySelector('.birlestir-temizle').addEventListener('click', () => { if (this.ogeler.length) { this.ogeler = []; this.ciz(); } });

    this.pencere = pencereAc({
      baslik, govde, anahtar: this.anahtar, sinif: 'birlestir-pencere' + (this.yalnizPdf ? ' yalniz-pdf' : ''),
      dugmeler: [
        { id: 'birlestir', etiket: 'Birleştir', birincil: true, devre: true, tiklama: () => this.birlestir() },
        { id: 'kapat', etiket: 'Kapat' },
      ],
      kapatmadanOnce: (_p, sonuc) => this._kapatmaIzni(sonuc),
    });
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
    // Ctrl+V
    this.pencere.el.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V') && !e.target.matches('input, textarea')) { e.preventDefault(); this.panodanEkle(); }
      if (e.key === 'Delete' && e.target === this.liste && this.seciliKimlik != null) { e.preventDefault(); this.sil(this.seciliKimlik); }
    });
    // Liste etkileşimi
    this.liste.addEventListener('click', (e) => this._tikla(e));
    this.liste.addEventListener('change', (e) => this._degisti(e));
    this.liste.addEventListener('input', (e) => { if (e.target.matches('input[type=number]')) this._degisti(e); });
    this.sirala = suruklemeSiralama(this.liste, {
      ogeSecici: '.birlestir-oge', izgara: false,
      onBirak: (ogeler, hedefIdx) => this.tasi(+ogeler[0].dataset.kimlik, hedefIdx),
    });
    this.pencere.el.addEventListener('kapandi', () => this.sirala());
    this.ciz();
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

  // ---------------------------------------------------------------- dosya ekleme
  async dosyaSec() {
    const yollar = await this.baglam.pdefe.cagir('dosya:acDiyalog', {
      baslik: this.yalnizPdf ? 'Birleştirilecek PDF\'ler' : 'Birleştirilecek dosyalar',
      filtreler: this.yalnizPdf ? [{ name: 'PDF belgeleri', extensions: ['pdf'] }] : DOSYA_FILTRELERI,
      coklu: true,
    });
    if (yollar?.length && !this.pencere.kapali) this.dosyaEkle(yollar);
  }

  /** Yolları listeye ekler; desteklenmeyen uzantıları bildirir. */
  dosyaEkle(yollar, konum = null) {
    const kabul = [], red = [];
    for (const y of yollar) (this.uzantilar.includes(uzanti(y)) ? kabul : red).push(y);
    if (red.length) this.baglam.bildir(`${red.length} dosya atlandı (desteklenmeyen tür): ${red.slice(0, 3).map(dosyaAdi).join(', ')}${red.length > 3 ? '…' : ''}`, 4000);
    if (!kabul.length) return;
    const yeniler = kabul.map((yol) => ({
      kimlik: ++this.kimlikSayac, yol, ad: dosyaAdi(yol), tur: uzanti(yol) === 'pdf' ? 'pdf' : 'gorsel', sayfa: null, boyut: null,
      genislik: null, yukseklik: null, png: null, dondurme: 0, kalite: null, sayfaBoyutu: 'a4', kenar: 10, tahmin: null, hata: null, yukleniyor: true,
    }));
    const idx = konum == null ? this.ogeler.length : Math.max(0, Math.min(konum, this.ogeler.length));
    this.ogeler.splice(idx, 0, ...yeniler);
    if (!this.ciktiElleDegisti && !this.cikti.klasor()) this._varsayilanCikti(kabul[0]);
    this.ciz();
    for (const o of yeniler) this._bilgiYukle(o);
  }

  async _varsayilanCikti(ilkYol) {
    const klasor = klasorAdi(ilkYol);
    const govde = this.yalnizPdf ? adGovdesi(ilkYol) + '_birlesik' : 'birlesik';
    let ad = govde + '.pdf';
    try { ad = await bosAdBul(this.baglam.pdefe, klasor, ad); } catch { /* varsayılan */ }
    if (!this.ciktiElleDegisti) { this.cikti.ayarla(klasor, ad); this.ciktiElleDegisti = false; }
  }

  async _bilgiYukle(o) {
    try {
      let b;
      try {
        b = await this.baglam.cekirdek('gorsel_bilgi', { yol: o.yol, genislik: KUCUK_RESIM });
      } catch (e) {
        if (!/Bilinmeyen yöntem/i.test(e.message || '')) throw e;
        // Geriye dönüş: PDF için belge_bilgi + kucuk_resim; görsel için yalnızca dosya boyutu
        if (o.tur === 'pdf') {
          const bi = await this.baglam.cekirdek('belge_bilgi', { yol: o.yol });
          const kr = await this.baglam.cekirdek('kucuk_resim', { yol: o.yol, sayfa: 1, genislik: KUCUK_RESIM }).catch(() => null);
          b = { tur: 'pdf', sayfa: bi.sayfa, boyut: bi.boyut, png: kr?.png || null };
        } else {
          const bi = await this.baglam.pdefe.cagir('dosya:bilgi', o.yol);
          b = { tur: 'gorsel', sayfa: 1, boyut: bi?.boyut ?? null, png: null };
        }
      }
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

  async panodanEkle() {
    const { baglam } = this;
    if (this.yalnizPdf) {
      const dosyalar = await baglam.pdefe.cagir('pano:dosyalar').catch(() => []);
      const pdfler = (dosyalar || []).filter((y) => uzanti(y) === 'pdf');
      if (pdfler.length) this.dosyaEkle(pdfler); else baglam.bildir('Panoda PDF dosyası yok.');
      return;
    }
    try {
      const dosyalar = await baglam.pdefe.cagir('pano:dosyalar').catch(() => []);
      const uygun = (dosyalar || []).filter((y) => this.uzantilar.includes(uzanti(y)));
      if (uygun.length) { this.dosyaEkle(uygun); return; }
      const png = await baglam.pdefe.cagir('pano:gorsel');
      if (!png) { baglam.bildir('Panoda dosya ya da görsel yok.'); return; }
      // Çekirdek görseli Temp/PDEfe altına benzersiz bir PNG olarak yazar
      const r = await baglam.cekirdek('pano_gorsel_kaydet', { png });
      if (!r?.yol || this.pencere.kapali) { if (!r?.yol) throw new Error('Pano görseli kaydedilemedi.'); return; }
      this.dosyaEkle([r.yol]);
      baglam.bildir('Panodaki görsel eklendi (geçici dosya: ' + dosyaAdi(r.yol) + ').');
    } catch (e) {
      this.pencere.hataGoster('Panodan eklenemedi: ' + hataMetni(e));
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
  }

  genelKaliteDegisti(deger) {
    this.genelKalite = deger;
    // KURAL: genel kalite değişince bütün öğelerin özel ayarı silinir
    for (const o of this.ogeler) o.kalite = null;
    for (const o of this.ogeler) this._ogeCiz(o);
    this._genelEtiketYaz();
    this.tahminGeciktir();
  }

  _genelEtiketYaz() {
    if (!this.genelEl) return;
    const ozelVar = this.ogeler.some((o) => o.kalite);
    this.genelEl.querySelector('.degisti').hidden = !ozelVar;
  }

  etkinKalite(o) { return o.kalite || this.genelKalite; }

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
    this.seciliKimlik = kimlik;
    for (const x of this.liste.querySelectorAll('.birlestir-oge')) x.classList.toggle('secili', +x.dataset.kimlik === kimlik);
    this.liste.focus({ preventScroll: true });
  }

  _degisti(e) {
    const el = e.target.closest('.birlestir-oge');
    if (!el) return;
    const o = this._oge(+el.dataset.kimlik);
    if (!o) return;
    const t = e.target;
    if (t.matches('.oge-kalite')) { o.kalite = t.value || null; this._genelEtiketYaz(); this._tahminYaz(o); this.tahminGeciktir(); }
    else if (t.matches('.oge-sayfa-boyutu')) { o.sayfaBoyutu = t.value; this.tahminGeciktir(); }
    else if (t.matches('.oge-kenar')) { const v = parseFloat(t.value); o.kenar = Number.isFinite(v) ? Math.max(0, Math.min(50, v)) : 10; this.tahminGeciktir(); }
  }

  // ---------------------------------------------------------------- çizim
  ciz() {
    this.liste.innerHTML = '';
    if (!this.ogeler.length) {
      this.liste.append(oge(`<div class="bos-mesaj"><b>${this.yalnizPdf ? 'PDF dosyalarını buraya sürükleyin' : 'Dosyaları buraya sürükleyin'}</b><span>${this.yalnizPdf ? 'ya da "Dosya ekle…" düğmesini kullanın.' : 'ya da "Dosya ekle…" düğmesini kullanın. Gezgin\'den kopyalanan dosyaları ve ekran görüntüsünü Ctrl+V ile yapıştırabilirsiniz.'}</span><span class="soluk">${this.yalnizPdf ? 'PDF' : 'PDF, JPG, PNG, BMP, GIF, TIFF, WEBP, HEIC'}</span></div>`));
    }
    this.ogeler.forEach((o, i) => { const el = this._ogeOlustur(o); this.liste.append(el); this._ogeCiz(o, i); });
    this._ozetYaz();
    this._genelEtiketYaz();
    this.tahminGeciktir();
  }

  _ogeOlustur(o) {
    const el = oge(`<div class="birlestir-oge" data-kimlik="${o.kimlik}" data-surukle-etiket="${kacis(o.ad)}">
      <span class="sira"></span>
      <div class="resim"><div class="yer">…</div></div>
      <div class="bilgi">
        <span class="ad" title="${kacis(o.yol)}">${kacis(o.ad)}</span>
        <span class="ozet"></span>
        <div class="ayarlar" ${this.yalnizPdf ? 'hidden' : ''}>
          <label>Kalite <select class="arac-girdi oge-kalite"><option value="">Genel</option>${KALITELER.map((k) => `<option value="${k.id}">${k.ad}</option>`).join('')}</select></label>
          <span class="tahmin">—</span>
          <span class="gorsel-ayar" hidden>
            <label>Sayfa <select class="arac-girdi oge-sayfa-boyutu"><option value="a4">A4'e sığdır</option><option value="orijinal">Orijinal boyut</option></select></label>
            <label>Kenar <input type="number" class="arac-girdi oge-kenar" min="0" max="50" step="1"> mm</label>
          </span>
        </div>
        <span class="hata" hidden></span>
      </div>
      <div class="dugmeler">
        <div>
          <button class="ikon" data-komut="yukari" title="Yukarı taşı"><svg viewBox="0 0 20 20"><path d="m5 12 5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
          <button class="ikon" data-komut="asagi" title="Aşağı taşı"><svg viewBox="0 0 20 20"><path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
          <button class="ikon" data-komut="sil" title="Listeden çıkar"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5"/></svg></button>
        </div>
        <div>
          <button class="ikon" data-komut="sola" title="Sola döndür"><svg viewBox="0 0 20 20"><path d="M5 9A5.5 5.5 0 1 1 6 13.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 4v5h5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
          <button class="ikon" data-komut="saga" title="Sağa döndür"><svg viewBox="0 0 20 20"><path d="M15 9A5.5 5.5 0 1 0 14 13.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M15 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
        </div>
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
    const resim = el.querySelector('.resim');
    if (o.png && !resim.querySelector('img')) {
      resim.innerHTML = '';
      const img = document.createElement('img'); img.src = 'data:image/png;base64,' + o.png; img.alt = o.ad; img.draggable = false;
      resim.append(img);
    } else if (!o.png && !o.yukleniyor) {
      resim.innerHTML = `<div class="yer">${o.tur === 'pdf' ? 'PDF' : kacis((o.bicim || uzanti(o.yol)).toUpperCase())}</div>`;
    }
    const img = resim.querySelector('img');
    if (img) img.style.transform = o.dondurme ? `rotate(${o.dondurme}deg)` : '';
    const parcalar = [`<span class="tur">${o.tur === 'pdf' ? 'PDF' : kacis((o.bicim || uzanti(o.yol)).toUpperCase())}</span>`];
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
    el.querySelector('.gorsel-ayar').hidden = o.tur !== 'gorsel';
    el.querySelector('.oge-kalite').value = o.kalite || '';
    el.querySelector('.oge-kalite').querySelector('option[value=""]').textContent = `Genel (${KALITELER.find((k) => k.id === this.genelKalite)?.ad || ''})`;
    this._tahminYaz(o);
  }

  _tahminYaz(o) {
    const el = this.liste.querySelector(`.birlestir-oge[data-kimlik="${o.kimlik}"] .tahmin`);
    if (!el) return;
    el.classList.toggle('ozel', !!o.kalite);
    el.title = '';
    if (o.hata || o.yukleniyor) { el.textContent = ''; return; }
    if (o.tahminHata) { el.textContent = 'tahmin alınamadı'; el.title = o.tahminHata; return; }
    el.textContent = o.tahmin == null ? 'tahmin: hesaplanıyor…' : `tahmin: ${boyutMetni(o.tahmin)}`;
  }

  _toplamYaz(ogeler, bekliyor) {
    if (!this.toplamEl || this.yalnizPdf) return;
    this.toplamEl.classList.toggle('bekliyor', !!bekliyor);
    if (!ogeler.length) { this.toplamEl.innerHTML = 'Toplam tahmini boyut: <b>—</b>'; return; }
    const bilinen = ogeler.filter((o) => o.tahmin != null);
    const toplam = bilinen.reduce((t, o) => t + o.tahmin, 0);
    if (bekliyor) this.toplamEl.innerHTML = `Toplam tahmini boyut: <b>${bilinen.length ? '≥ ' + kacis(boyutMetni(toplam)) + ' · ' : ''}hesaplanıyor…</b>`;
    else if (bilinen.length === ogeler.length) this.toplamEl.innerHTML = `Toplam tahmini boyut: <b>${kacis(boyutMetni(toplam))}</b>`;
    else this.toplamEl.innerHTML = `Toplam tahmini boyut: <b>≥ ${kacis(boyutMetni(toplam))}</b> <span class="soluk">(${ogeler.length - bilinen.length} öğe için tahmin alınamadı)</span>`;
  }

  _ozetYaz() {
    const n = this.ogeler.length;
    const sayfa = this.ogeler.reduce((t, o) => t + (o.sayfa || 0), 0);
    const boyut = this.ogeler.reduce((t, o) => t + (o.boyut || 0), 0);
    this.ozetEl.textContent = n ? `${n} dosya · ${sayiMetni(sayfa)} sayfa · ${boyutMetni(boyut)} girdi` : '';
    const hazir = n >= (this.yalnizPdf ? 2 : 1) && !this.ogeler.some((o) => o.yukleniyor) && !this.ilerleme.calisiyor;
    this.pencere.dugmeAyarla('birlestir', { devre: !hazir });
    if (this.yalnizPdf) this.toplamEl.innerHTML = `Toplam: <b>${sayiMetni(sayfa)} sayfa · ${kacis(boyutMetni(boyut))}</b>`;
  }

  // ---------------------------------------------------------------- tahmin
  async tahminAl() {
    if (this.yalnizPdf || this.pencere.kapali) return;
    const sayac = ++this.tahminSayac;
    const ogeler = this.ogeler.filter((o) => !o.yukleniyor && !o.hata);
    if (!ogeler.length) { this.toplamEl.innerHTML = 'Toplam tahmini boyut: <b>—</b>'; this.toplamEl.classList.remove('bekliyor'); return; }
    this.toplamEl.classList.add('bekliyor');
    this.toplamEl.innerHTML = 'Toplam tahmini boyut: <b>hesaplanıyor…</b>';
    for (const o of ogeler) { o.tahmin = null; this._tahminYaz(o); }
    try {
      const r = await this.baglam.cekirdek('boyut_tahmini', { ogeler: ogeler.map((o) => this._ogeParametresi(o)), istek: sayac });
      if (sayac !== this.tahminSayac || this.pencere.kapali) return;   // eskimiş sonuç
      const liste = r?.ogeler || r?.tahminler || [];
      let toplam = 0;
      ogeler.forEach((o, i) => { const t = liste[i]; o.tahmin = typeof t === 'number' ? t : (t?.boyut ?? null); if (o.tahmin != null) toplam += o.tahmin; this._tahminYaz(o); });
      const genel = r?.toplam ?? toplam;
      this.toplamEl.classList.remove('bekliyor');
      this.toplamEl.innerHTML = `Toplam tahmini boyut: <b>${kacis(boyutMetni(genel))}</b>`;
    } catch (e) {
      if (sayac !== this.tahminSayac || this.pencere.kapali) return;
      this.toplamEl.classList.remove('bekliyor');
      this.toplamEl.innerHTML = `Toplam tahmini boyut: <b title="${kacis(hataMetni(e))}">alınamadı</b>`;
      for (const o of ogeler) { const el = this.liste.querySelector(`.birlestir-oge[data-kimlik="${o.kimlik}"] .tahmin`); if (el) el.textContent = ''; }
    }
  }

  _ogeParametresi(o) {
    return { yol: o.yol, tur: o.tur, dondurme: o.dondurme, kalite: this.etkinKalite(o), sayfaBoyutu: o.tur === 'gorsel' ? o.sayfaBoyutu : undefined, kenar: o.tur === 'gorsel' ? o.kenar : undefined };
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
    if (ogeler.length < (this.yalnizPdf ? 2 : 1)) { baglam.bildir(this.yalnizPdf ? 'En az iki PDF ekleyin.' : 'En az bir dosya ekleyin.'); return; }
    if (!this.cikti.ad()) { baglam.bildir('Çıktı dosyası adı girin.'); return; }
    if (!this.cikti.klasor()) {
      const k = await baglam.pdefe.cagir('dosya:klasorSec', { baslik: 'Çıktı klasörü' });
      if (!k) return;
      this.cikti.ayarla(k, null);
    }
    const hedef = this.cikti.yol();
    if (ogeler.some((o) => o.tur === 'pdf' && o.yol.replace(/\//g, '\\').toLowerCase() === hedef.replace(/\//g, '\\').toLowerCase())) {
      baglam.bildir('Çıktı dosyası, girdi dosyalarından biriyle aynı olamaz.'); return;
    }
    if (await baglam.pdefe.cagir('dosya:varMi', hedef)) {
      const { secim } = await baglam.mesajKutusu({ mesaj: `"${dosyaAdi(hedef)}" zaten var.`, ayrinti: 'Üzerine yazılsın mı?', dugmeler: ['Üzerine yaz', 'Vazgeç'], varsayilan: 1, iptal: 1 });
      if (secim !== 0) return;
    }
    this.pencere.hataGoster('');
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('birlestir', { devre: true });
    this.pencere.dugmeAyarla('kapat', { devre: true });
    try {
      const sonuc = await this.ilerleme.calistir(baglam, 'birlestir', {
        ogeler: ogeler.map((o) => this._ogeParametresi(o)), hedef, kalite: this.genelKalite,
      }, { baslangicMesaji: 'Birleştiriliyor…' });
      const yol = sonuc?.yol || hedef;
      const boyut = sonuc?.boyut ?? (await baglam.pdefe.cagir('dosya:bilgi', yol).catch(() => null))?.boyut;
      this.ilerleme.gizle();
      await this.pencere.kapat('tamam');
      baglam.bildir(`Birleştirildi: ${dosyaAdi(yol)}${boyut != null ? ' · ' + boyutMetni(boyut) : ''}${sonuc?.sayfa ? ' · ' + sonuc.sayfa + ' sayfa' : ''}`, 4000);
      await baglam.dosyaAc(yol, { arkaPlanda: false });
    } catch (e) {
      this.ilerleme.gizle();
      if (e.iptal) {
        baglam.bildir('Birleştirme iptal edildi.');
        if (e.sonuc) { try { await baglam.pdefe.cagir('dosya:sil', hedef); } catch { /* yok say */ } }
      } else this.pencere.hataGoster('Birleştirme başarısız: ' + hataMetni(e));
    } finally {
      if (!this.pencere.kapali) {
        this.pencere.el.classList.remove('mesgul');
        this.pencere.dugmeAyarla('kapat', { devre: false });
        this._ozetYaz();
      }
    }
  }
}

export function gorselBirlestirAc(baglam, ilkDosyalar = []) {
  if (pencereAcikMi('gorselBirlestir')) return null;
  return new BirlestirmePenceresi(baglam, { yalnizPdf: false, ilkDosyalar });
}
