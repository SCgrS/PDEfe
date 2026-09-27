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
import { kaydetmedenCikisSorusu } from '../mesajKutusu.js';

/** Kalite seviyeleri (çekirdekteki GORSEL_KALITE ile aynı kimlikler). Açıklamalar teknik ayrıntı (çözünürlük, sıkıştırma türü) içermez. */
export const KALITELER = [
  { id: 'orijinal', ad: 'Orijinal', aciklama: 'Görseller olduğu gibi eklenir; kalite kaybı olmaz, dosya en büyüktür.' },
  // Kayıplı seviyede sıkıştırınca küçülmeyen görsel (zaten sıkıştırılmış JPEG, ekran görüntüsü) olduğu gibi eklenir (çekirdek _buyutmeyen)
  { id: 'yuksek', ad: 'Yüksek', aciklama: 'Baskıya uygun kalite; görseller hafifçe sıkıştırılır. Sıkıştırınca küçülmeyen görsel olduğu gibi eklenir.' },
  { id: 'orta', ad: 'Orta', aciklama: 'Ekranda okuma ve paylaşım için iyi kalite, daha küçük dosya. Sıkıştırınca küçülmeyen görsel olduğu gibi eklenir.' },
  { id: 'dusuk', ad: 'Düşük', aciklama: 'En küçük dosya; görsellerde belirgin kalite kaybı olabilir. Sıkıştırınca küçülmeyen görsel olduğu gibi eklenir.' },
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
    this.secim = new Set();           // seçili öğelerin kimlikleri (tıklama, Ctrl/Shift, alan seçimi)
    this.capa = null;                 // Shift+tık aralığının başı
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
    govde.querySelector('.birlestir-temizle').addEventListener('click', () => { if (this.ogeler.length) { this.ogeler = []; this.secim.clear(); this.capa = null; this.ciz(); } });

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
    });
    // Listede Delete seçilenleri çıkarır, Ctrl+A satırların hepsini seçer. Listenin kendi dinleyicisinde: pencerenin Ctrl+A'sından
    // (ortak.js _tusIsle: pencerenin metnini seçer; işlenmiş olayı atlar) önce çalışsın
    this.liste.addEventListener('keydown', (e) => {
      // Satırdaki bir düğmeye (döndür, taşı) basıldıktan sonra da; satırdaki girdi ve seçim kutuları kendi tuşlarını alır
      if (this.ilerleme.calisiyor || e.target.closest('input, select, textarea')) return;
      if (e.key === 'Delete' && this.secim.size) { e.preventDefault(); this.sil(this._secilenler()); if (!this.liste.contains(document.activeElement)) this.liste.focus({ preventScroll: true }); }
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); this.secim = new Set(this.ogeler.map((o) => o.kimlik)); this._secimiCiz(); }
    });
    // Listede ve bırakma alanında sağ tık: Yapıştır (Ctrl+V ile aynı), satırda sıralama/döndürme/çıkarma (seçiliyse seçilenlerin hepsine)
    this.pencere.baglamMenusuEkle((e) => this._listeMenusu(e));
    // Liste etkileşimi. Ctrl / Shift ile satıra basış satır seçimidir: tarayıcı metin seçimini (dosya adı, özet seçilebilir) uzatmasın
    this.liste.addEventListener('mousedown', (e) => {
      if (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey) && e.target.closest('.birlestir-oge') && !e.target.closest('button, input, select, textarea')) {
        e.preventDefault();
        try { window.getSelection()?.removeAllRanges(); } catch { /* yok say */ }
      }
    });
    this.liste.addEventListener('click', (e) => this._tikla(e));
    this.liste.addEventListener('change', (e) => this._degisti(e));
    this.liste.addEventListener('input', (e) => { if (e.target.matches('input[type=number]')) this._degisti(e); });
    // Seçili bir satırı sürüklemek seçilenlerin hepsini birlikte taşır
    this.sirala = suruklemeSiralama(this.liste, {
      ogeSecici: '.birlestir-oge', izgara: false, metinSecici: '.secilebilir',
      grupAl: (el) => (this.secim.has(+el.dataset.kimlik) ? [...this.liste.querySelectorAll('.birlestir-oge.secili')] : [el]),
      onBirak: (ogeler, hedefIdx) => this.tasi(ogeler.map((o) => +o.dataset.kimlik), hedefIdx),
    });
    this._alanSecimiBagla();
    // Fare ve tuş kullanımı (tıkla: seç, Delete: çıkar…) pencerede yazmaz, F1 Kısayollar penceresinde (0.1.13, kullanıcı isteği)
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
    // Liste doluyken birleştirilmiş belge henüz kaydedilmemiştir: uygulamanın bütün çıkış sorularıyla aynı soru, ad kaydedilecek dosyanın
    // adı. Kaydet, Birleştir düğmesiyle aynı işi yapar; başarılıysa pencereyi kendisi kapatır ('tamam'), olmazsa pencere açık kalır
    if (sonuc !== 'tamam' && this.ogeler.length > 0) {
      const { secim } = await this.baglam.mesajKutusu(kaydetmedenCikisSorusu(this.cikti.ad() || 'birlesik.pdf'));
      if (secim === 1) return true;
      if (secim === 0 && !this.pencere.kapali) await this.birlestir();
      return false;
    }
    return true;
  }

  _listeMenusu(e) {
    if (!e.target.closest('.birlestir-liste') || this.ilerleme.calisiyor) return null;
    const satir = e.target.closest('.birlestir-oge');
    const menu = [{ id: 'yapistir', etiket: 'Yapıştır', calistir: () => this.panodanEkle() }];
    if (!satir) {
      menu.push({ id: 'ekle', etiket: 'Dosya ekle', calistir: () => this.dosyaSec() });
      if (this.ogeler.length) menu.push({ ayirici: true }, { id: 'tumu', etiket: 'Tümünü seç', calistir: () => { this.secim = new Set(this.ogeler.map((o) => o.kimlik)); this._secimiCiz(); } });
      return menu;
    }
    const kimlik = +satir.dataset.kimlik;
    // Seçili satıra sağ tık seçimi korur (işlemler seçilenlerin hepsine); seçili olmayana tıklamak yalnızca onu seçer
    if (!this.secim.has(kimlik)) this._tekSec(kimlik);
    const hedefler = this._hedefler(kimlik), n = hedefler.length, ek = n > 1 ? ` (${n})` : '';
    menu.push(
      { ayirici: true },
      { id: 'yukari', etiket: 'Yukarı taşı' + ek, devre: !this._kayabilir(hedefler, -1), calistir: () => this.kaydir(hedefler, -1) },
      { id: 'asagi', etiket: 'Aşağı taşı' + ek, devre: !this._kayabilir(hedefler, 1), calistir: () => this.kaydir(hedefler, 1) },
      { id: 'sola', etiket: 'Sola döndür' + ek, calistir: () => this.dondur(hedefler, -90) },
      { id: 'saga', etiket: 'Sağa döndür' + ek, calistir: () => this.dondur(hedefler, 90) },
      { ayirici: true },
      { id: 'cikar', etiket: 'Listeden çıkar' + ek, calistir: () => this.sil(hedefler) },
    );
    return menu;
  }

  /**
   * Alan seçimi: listede sağ tuşla (satırların üzerinden de) ya da sol tuşla boş alandan sürükleyince dikdörtgen çizilir, kesiştiği satırlar
   * sürüklerken seçilir. Değiştiricisiz sürükleme seçimin yerini alır, Ctrl ya da Shift ile başlangıçtaki seçime ekler. Fare listenin üst /
   * alt kenarına yaklaşınca ya da dışına çıkınca liste kayar (kenara yakınlıkla hızlanır); Esc iptal eder, önceki seçim geri gelir.
   * Kıpırdamadan bırakılan sağ tuş olağan sağ tık menüsünü açar; sürüklemeden sonra menü açılmaz (Windows'ta contextmenu bırakışta gelir).
   * Sol tuşla satırdan başlayan sürükleme sıralamadır (suruklemeSiralama); girdilere, düğmelere ve kaydırma çubuğuna basış seçim başlatmaz.
   * İşaretçi listede tutulur (setPointerCapture): listenin dışına taşan hareket ve bırakış da buraya gelir. sayfalar.js _alanSecimiBagla'nın
   * dikey liste karşılığı.
   */
  _alanSecimiBagla() {
    const li = this.liste;
    const ESIK = 5, KENAR = 30, EN_HIZ = 22;
    // a: basılı işaretçi {pointerId, tus (1 sol, 2 sağ), bx, by (başlangıç, içerik koordinatı), x, y, sx, sy (istemci), onceki, taban,
    //    ilk, basladi, iptal, kutular, sinirG, sinirY, el, raf}
    let a = null;
    const icerik = (x, y) => {
      const r = li.getBoundingClientRect();
      return { x: x - r.left - li.clientLeft + li.scrollLeft, y: y - r.top - li.clientTop + li.scrollTop };
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
      const r = li.getBoundingClientRect();
      const dy = a.y < r.top + KENAR ? -Math.min(EN_HIZ, Math.ceil((r.top + KENAR - a.y) / 3))
        : a.y > r.bottom - KENAR ? Math.min(EN_HIZ, Math.ceil((a.y - r.bottom + KENAR) / 3)) : 0;
      if (!dy) return;
      const once = li.scrollTop;
      li.scrollTop += dy;
      if (li.scrollTop !== once) guncelle();
    };
    const basla = () => {
      // Satırlar alan seçimi sürerken yer değiştirmez: kutular bir kez, içerik koordinatında ölçülür (kaydırma yalnızca görünümü kaydırır)
      const r = li.getBoundingClientRect();
      const ox = r.left + li.clientLeft - li.scrollLeft, oy = r.top + li.clientTop - li.scrollTop;
      a.kutular = [...li.querySelectorAll(':scope > .birlestir-oge')].map((el) => {
        const b = el.getBoundingClientRect();
        return { kimlik: +el.dataset.kimlik, x0: b.left - ox, y0: b.top - oy, x1: b.right - ox, y1: b.bottom - oy };
      });
      a.sinirG = li.scrollWidth; a.sinirY = li.scrollHeight;
      a.el = document.createElement('div');
      a.el.className = 'birlestir-alan-secimi';
      li.append(a.el);
      li.classList.add('alan-seciliyor');
      try { window.getSelection()?.removeAllRanges(); } catch { /* yok say */ }
      a.basladi = true;
      a.raf = requestAnimationFrame(kaydir);
    };
    /** Dikdörtgeni kaldırır. iptal: önceki seçimi geri getirir (Esc; işaretçi bırakılana kadar tutulur, hareketi yok sayılır). */
    const durdur = (iptal) => {
      if (!a?.basladi || a.iptal) return;
      cancelAnimationFrame(a.raf);
      a.el.remove();
      li.classList.remove('alan-seciliyor');
      if (iptal) { a.iptal = true; this.secim = a.onceki; }
      else if (a.ilk != null) this.capa = a.ilk;
      this._secimiCiz();
    };
    /** Bırakış: sürükleme olduysa arkasından gelen tıklama (sol tuş) seçimi değiştirmesin, sağ tık menüsü (sağ tuş) açılmasın. */
    const birak = () => {
      const s = a;
      a = null;
      if (!s) return;
      try { if (li.hasPointerCapture(s.pointerId)) li.releasePointerCapture(s.pointerId); } catch { /* yok say */ }
      if (!s.basladi) return;
      if (s.tus === 2) this._sagSuruklemeBitti = performance.now(); else this._alanTiki = true;
      li.focus({ preventScroll: true });
    };
    li.addEventListener('pointerdown', (e) => {
      a = null;
      this._alanTiki = false;
      if ((e.button !== 0 && e.button !== 2) || e.pointerType === 'touch' || this.ilerleme.calisiyor || !this.ogeler.length) return;
      if (e.target.closest('button, input, select, textarea, a, .birlestir-alan-secimi')) return;
      if (e.button === 0 && e.target.closest('.birlestir-oge')) return;   // sol tuşla satırdan: sıralama
      const r = li.getBoundingClientRect();
      if (e.clientX - r.left - li.clientLeft >= li.clientWidth || e.clientY - r.top - li.clientTop >= li.clientHeight) return;   // kaydırma çubuğu
      const p = icerik(e.clientX, e.clientY);
      const onceki = new Set(this.secim);
      a = { pointerId: e.pointerId, tus: e.button === 2 ? 2 : 1, bx: p.x, by: p.y, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, onceki, ilk: null,
        basladi: false, iptal: false, taban: e.ctrlKey || e.metaKey || e.shiftKey ? onceki : new Set() };
      try { li.setPointerCapture(e.pointerId); } catch { /* yok say */ }
    });
    li.addEventListener('pointermove', (e) => {
      if (!a || e.pointerId !== a.pointerId || a.iptal) return;
      if (!(e.buttons & a.tus)) { durdur(false); birak(); return; }   // bırakış kaçırıldı (ör. pencere odağı gitti)
      a.x = e.clientX; a.y = e.clientY;
      if (!a.basladi) { if (Math.hypot(a.x - a.sx, a.y - a.sy) < ESIK) return; basla(); }
      guncelle();
    });
    li.addEventListener('pointerup', (e) => { if (a && e.pointerId === a.pointerId) { durdur(false); birak(); } });
    li.addEventListener('pointercancel', (e) => { if (a && e.pointerId === a.pointerId) { durdur(true); birak(); } });
    li.addEventListener('lostpointercapture', (e) => { if (a && e.pointerId === a.pointerId) { durdur(false); birak(); } });
    // Sürerken Esc pencereyi kapatmaz: alan seçimini iptal eder
    li.addEventListener('keydown', (e) => { if (e.key === 'Escape' && a?.basladi) { e.preventDefault(); e.stopPropagation(); durdur(true); } }, true);
    // Sağ tuşla alan seçiminin bırakışından sonra gelen sağ tık menüsü açılmaz (pencerenin menü dinleyicisine ulaşmadan durur)
    li.addEventListener('contextmenu', (e) => {
      if (a?.basladi || performance.now() - (this._sagSuruklemeBitti ?? -Infinity) < 600) { e.preventDefault(); e.stopPropagation(); this._sagSuruklemeBitti = null; }
    }, true);
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

  /** Seçili öğelerin kimlikleri, liste sırasıyla. */
  _secilenler() { return this.ogeler.filter((o) => this.secim.has(o.kimlik)).map((o) => o.kimlik); }

  /** Satırdaki düğme ya da menü işleminin hedefleri: satır seçiliyse seçilenlerin hepsi, değilse yalnızca o satır (sayfalar.js gibi). */
  _hedefler(kimlik) { return this.secim.has(kimlik) ? this._secilenler() : [kimlik]; }

  /** Öğeleri listeden çıkarır; seçim, çıkarılan ilk öğenin yerine gelen öğeye geçer. kimlikler: tek kimlik ya da dizi. */
  sil(kimlikler) {
    const kume = new Set([].concat(kimlikler));
    const ilk = this.ogeler.findIndex((o) => kume.has(o.kimlik));
    if (ilk < 0) return;
    this.ogeler = this.ogeler.filter((o) => !kume.has(o.kimlik));
    for (const k of kume) this.secim.delete(k);
    if (!this.secim.size) {
      const yeni = this.ogeler[Math.min(ilk, this.ogeler.length - 1)]?.kimlik;
      if (yeni != null) this.secim.add(yeni);
      this.capa = yeni ?? null;
    }
    this.ciz();
  }

  /** Öğeleri (liste sırasını koruyarak, blok hâlinde) hedefIdx'e taşır; hedefIdx taşınanlar çıkarılmış listeye göredir. */
  tasi(kimlikler, hedefIdx) {
    const kume = new Set([].concat(kimlikler));
    const tasinan = this.ogeler.filter((o) => kume.has(o.kimlik));
    if (!tasinan.length) return;
    const kalan = this.ogeler.filter((o) => !kume.has(o.kimlik));
    kalan.splice(Math.max(0, Math.min(hedefIdx, kalan.length)), 0, ...tasinan);
    this.ogeler = kalan;
    this.secim = new Set(kume);
    this.ciz();
  }

  /** Öğeler yon (−1 yukarı, 1 aşağı) yönünde birer sıra kayabilir mi: en az biri, önünde seçili olmayan öğe bulunan. */
  _kayabilir(kimlikler, yon) {
    const kume = new Set([].concat(kimlikler));
    return this.ogeler.some((o, i) => kume.has(o.kimlik) && this.ogeler[i + yon] && !kume.has(this.ogeler[i + yon].kimlik));
  }

  /** Öğeleri birer sıra yukarı / aşağı kaydırır; bitişik öğeler birlikte kayar, listenin ucuna dayanan blok yerinde kalır. */
  kaydir(kimlikler, yon) {
    const kume = new Set([].concat(kimlikler));
    if (!this._kayabilir([...kume], yon)) return;
    const l = this.ogeler;
    const sira = yon < 0 ? l.map((_, i) => i) : l.map((_, i) => l.length - 1 - i);
    for (const i of sira) {
      const j = i + yon;
      if (kume.has(l[i].kimlik) && l[j] && !kume.has(l[j].kimlik)) [l[i], l[j]] = [l[j], l[i]];
    }
    this.secim = new Set(kume);
    this.ciz();
    const tek = kume.size === 1 ? [...kume][0] : null;
    if (tek != null) this.liste.querySelector(`[data-kimlik="${tek}"] [data-komut="${yon < 0 ? 'yukari' : 'asagi'}"]`)?.focus();
  }

  dondur(kimlikler, derece) {
    let gorsel = false;
    for (const k of [].concat(kimlikler)) {
      const o = this._oge(k);
      if (!o) continue;
      o.dondurme = ((o.dondurme + derece) % 360 + 360) % 360;
      this._ogeCiz(o);
      gorsel ||= o.tur === 'gorsel';
    }
    if (gorsel) this.tahminGeciktir();   // görselde sayfa yönü değişir, boyut da değişebilir
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

  /** Satırların seçili görünümünü this.secim'e göre yeniler. */
  _secimiCiz() {
    for (const x of this.liste.querySelectorAll('.birlestir-oge')) x.classList.toggle('secili', this.secim.has(+x.dataset.kimlik));
  }

  _tekSec(kimlik) { this.secim = new Set([kimlik]); this.capa = kimlik; this._secimiCiz(); }

  /** Shift+tık: çapadan tıklanan satıra kadar (ikisi dahil) bütün satırlar. */
  _aralikSec(capa, kimlik) {
    const i = this.ogeler.findIndex((o) => o.kimlik === capa), j = this.ogeler.findIndex((o) => o.kimlik === kimlik);
    if (i < 0 || j < 0) { this._tekSec(kimlik); return; }
    const [bas, son] = i <= j ? [i, j] : [j, i];
    this.secim = new Set(this.ogeler.slice(bas, son + 1).map((o) => o.kimlik));
    this._secimiCiz();
  }

  _tikla(e) {
    if (this._alanTiki) { this._alanTiki = false; return; }
    if (suruklemeKalintisi(this.liste)) return;
    const el = e.target.closest('.birlestir-oge');
    if (!el) { if (e.target === this.liste && this.secim.size) { this.secim.clear(); this._secimiCiz(); } return; }   // boş alana tıklama seçimi kaldırır
    const kimlik = +el.dataset.kimlik;
    const btn = e.target.closest('button[data-komut]');
    if (btn) {
      // Satır seçiliyse seçilenlerin hepsine, değilse yalnızca o satıra
      const k = btn.dataset.komut, hedefler = this._hedefler(kimlik);
      if (k === 'sil') this.sil(hedefler);
      else if (k === 'yukari') this.kaydir(hedefler, -1);
      else if (k === 'asagi') this.kaydir(hedefler, 1);
      else if (k === 'sola') this.dondur(hedefler, -90);
      else if (k === 'saga') this.dondur(hedefler, 90);
      return;
    }
    if (e.target.matches('select, input')) return;
    if (e.shiftKey && this.capa != null) this._aralikSec(this.capa, kimlik);
    else if (e.ctrlKey || e.metaKey) { if (this.secim.has(kimlik)) this.secim.delete(kimlik); else this.secim.add(kimlik); this.capa = kimlik; this._secimiCiz(); }
    else this._tekSec(kimlik);
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
        <button class="ikon" data-komut="sola" title="Sola döndür"><svg viewBox="0 0 20 20"><path d="M13.1 15.8A6.2 6.2 0 1 0 5.1 13.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2.8 15.5 7.4 12.3 6.8 16.4z" fill="currentColor"/></svg></button>
        <button class="ikon" data-komut="saga" title="Sağa döndür"><svg viewBox="0 0 20 20"><path d="M6.9 15.8A6.2 6.2 0 1 1 14.9 13.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M17.2 15.5 12.6 12.3 13.2 16.4z" fill="currentColor"/></svg></button>
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
    el.classList.toggle('secili', this.secim.has(o.kimlik));
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
    // Birleştir düğmesi dosyalar okunurken devre dışıdır; kapatma sorusundaki Kaydet de buraya gelir: okuma bitmeden birleştirilmez
    if (this.ogeler.some((o) => o.yukleniyor)) { baglam.bildir('Dosyalar hâlâ okunuyor; bitince yeniden deneyin.'); return; }
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
