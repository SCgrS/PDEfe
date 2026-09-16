// Sayfaları düzenle: küçük resim ızgarası, çoklu seçim, sürükleyerek sıralama, sil, döndür,
// başka PDF'ten sayfa ekle, boş sayfa ekle, pencere içi geri al/yinele; "Uygula" tarif üretir.
// Çekirdek: kucuk_resim {yol, sayfa, genislik} (var), sayfa_boyutlari {yol} → {sayfalar:[{no, genislik, yukseklik}]}
// (yoksa belge_bilgi ile sayfa sayısı alınır, boyut A4 varsayılır).
import {
  pencereAc, pencereAcikMi, kacis, hataMetni, dosyaAdi, belgeTarifi, tarifDisari, anaKaynakMi, suruklemeSiralama, suruklemeKalintisi, oge,
} from './ortak.js';

const KUCUK_RESIM_GENISLIK = 160;
const GECMIS_SINIRI = 200;
const A4 = { w: 595.276, h: 841.89 };

export class SayfalarPenceresi {
  constructor(baglam, belge) {
    this.baglam = baglam;
    this.belge = belge;
    this.kimlikSayac = 0;
    this.kartlar = this._baslangicKartlari();
    this.baslangicImza = this._imza(this.kartlar);
    this.secim = new Set();
    this.capa = null;
    this.odak = null;
    this.gecmis = [];
    this.gecmisKonum = 0;
    this.ogeler = new Map();          // kimlik → kart öğesi
    this.resimOnbellek = new Map();   // "yol|sayfa" → Promise<{png, genislik, yukseklik}>
    this._kur();
  }

  // ---------------------------------------------------------------- model
  _baslangicKartlari() {
    return belgeTarifi(this.belge).map((t) => ({
      kimlik: ++this.kimlikSayac,
      kaynak: t.kaynak, sayfa: t.sayfa, dondurme: t.dondurme || 0,
      genislik: t.pt?.w || t.genislik || A4.w, yukseklik: t.pt?.h || t.yukseklik || A4.h,
      bos: t.kaynak === null, yeni: false,
    }));
  }

  _imza(kartlar) { return JSON.stringify(kartlar.map((k) => [k.kaynak, k.sayfa, k.dondurme, k.bos ? [Math.round(k.genislik), Math.round(k.yukseklik)] : 0])); }
  get degisti() { return this._imza(this.kartlar) !== this.baslangicImza; }

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
        ${dugme('solaDondur', 'Seçilenleri sola döndür', '<path d="M5 9A5.5 5.5 0 1 1 6 13.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 4v5h5" fill="none" stroke="currentColor" stroke-width="1.4"/>')}
        ${dugme('sagaDondur', 'Seçilenleri sağa döndür', '<path d="M15 9A5.5 5.5 0 1 0 14 13.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M15 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.4"/>')}
        ${dugme('sil', 'Seçilenleri sil (Delete)', '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" fill="none" stroke="currentColor" stroke-width="1.4"/>')}
        <span class="ayrac"></span>
        <button class="ikincil" data-komut="bosEkle" title="Seçili sayfanın arkasına boş sayfa ekler (boyut: önceki sayfa)">Boş sayfa ekle</button>
        <button class="ikincil" data-komut="pdfEkle" title="Başka bir PDF'in sayfalarını seçili sayfanın arkasına ekler">PDF'ten sayfa ekle…</button>
        <span class="sayac"></span>
      </div>
      <div class="sayfalar-izgara" tabindex="0" role="listbox" aria-multiselectable="true"></div>
    </div>`);
    this.govde = govde;
    this.cubuk = govde.querySelector('.sayfalar-arac-cubugu');
    this.izgara = govde.querySelector('.sayfalar-izgara');
    this.sayac = govde.querySelector('.sayac');
    this.cubuk.addEventListener('click', (e) => { const b = e.target.closest('[data-komut]'); if (b && !b.disabled) this.komut(b.dataset.komut); });

    this.pencere = pencereAc({
      baslik: `Sayfaları düzenle — ${this.belge.ad}`, govde, anahtar: 'sayfalar', sinif: 'sayfalar-pencere',
      dugmeler: [
        { id: 'kisayol', etiket: '', sol: true },
        { id: 'uygula', etiket: 'Uygula', birincil: true, tiklama: () => this.uygula() },
        { id: 'vazgec', etiket: 'Vazgeç' },
      ],
      kapatmadanOnce: (_p, sonuc) => this._kapatmaIzni(sonuc),
    });
    const k = this.pencere.dugme('kisayol');
    k.className = 'kisayollar'; k.disabled = true; k.style.border = 'none'; k.style.background = 'transparent';
    k.textContent = 'Tıkla: seç · Ctrl/Shift: çoklu seç · Sürükle: sırala · Delete: sil · Ctrl+Z/Y: geri al/yinele';

    // Görünürlük gözlemcisi: küçük resimleri tembel yükle
    this.gozlemci = new IntersectionObserver((girdiler) => {
      for (const g of girdiler) if (g.isIntersecting) this._resimYukle(g.target);
    }, { root: this.izgara, rootMargin: '200px 0px' });

    // Seçim ve klavye
    this.izgara.addEventListener('click', (e) => this._tikla(e));
    this.izgara.addEventListener('dblclick', (e) => { const el = e.target.closest('.sayfa-karti'); if (el && !e.target.closest('button')) { this.secim = new Set([+el.dataset.kimlik]); this._secimiCiz(); } });
    this.izgara.addEventListener('keydown', (e) => this._tus(e));
    this.sirala = suruklemeSiralama(this.izgara, {
      ogeSecici: '.sayfa-karti', izgara: true,
      grupAl: (el) => { const k = +el.dataset.kimlik; return this.secim.has(k) ? [...this.izgara.querySelectorAll('.sayfa-karti.secili')] : [el]; },
      onBirak: (ogeler, hedefIdx) => this.tasi(ogeler.map((o) => +o.dataset.kimlik), hedefIdx),
    });
    this.pencere.el.addEventListener('kapandi', () => { this.gozlemci.disconnect(); this.sirala(); });
    this.ciz();
    this.izgara.focus();
  }

  async _kapatmaIzni(sonuc) {
    if (sonuc === 'tamam' || !this.degisti) return true;
    const { secim } = await this.baglam.mesajKutusu({ mesaj: 'Sayfa düzeninde uygulanmamış değişiklikler var.', ayrinti: 'Pencereyi kapatırsanız değişiklikler kaybolur.', dugmeler: ['Kapat', 'Düzenlemeye dön'], varsayilan: 1, iptal: 1 });
    return secim === 0;
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

  _sutunSayisi() {
    const ilk = this.izgara.firstElementChild;
    if (!ilk) return 1;
    const w = ilk.getBoundingClientRect().width;
    const alan = this.izgara.clientWidth - 28;
    return Math.max(1, Math.floor((alan + 12) / (w + 12)));
  }

  _tikla(e) {
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
    for (const k of this.kartlar) if (set.has(k.kimlik)) k.dondurme = ((k.dondurme + derece) % 360 + 360) % 360;
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
          <button class="ikon" data-kart-komut="sola" title="Sola döndür"><svg viewBox="0 0 20 20"><path d="M5 9A5.5 5.5 0 1 1 6 13.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 4v5h5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
          <button class="ikon" data-kart-komut="saga" title="Sağa döndür"><svg viewBox="0 0 20 20"><path d="M15 9A5.5 5.5 0 1 0 14 13.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M15 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
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
    const rozet = el.querySelector('.rozet.dondurme');
    rozet.hidden = !k.dondurme;
    rozet.textContent = k.dondurme ? `${k.dondurme}°` : '';
    el.querySelector('.rozet.yeni').hidden = !k.yeni || k.bos;
    const kaynak = el.querySelector('.kaynak');
    const farkli = k.kaynak && !anaKaynakMi(this.belge, k.kaynak);
    kaynak.hidden = !farkli && !k.bos;
    kaynak.textContent = k.bos ? `boş · ${Math.round(k.genislik)}×${Math.round(k.yukseklik)} pt` : (farkli ? `${dosyaAdi(k.kaynak)} · s. ${k.sayfa}` : '');
    kaynak.title = farkli ? k.kaynak : '';
    el.title = k.bos ? 'Boş sayfa' : `${dosyaAdi(k.kaynak)} — sayfa ${k.sayfa}${k.dondurme ? ` — ${k.dondurme}° döndürülmüş` : ''}`;
    const gorsel = el.querySelector('.resim-kutu img, .resim-kutu .bos-sayfa');
    if (gorsel) {
      gorsel.style.transform = k.dondurme ? `rotate(${k.dondurme}deg)` : '';
      if (k.bos) this._bosBoyutla(gorsel, k);
    }
  }

  _bosBoyutla(el, k) {
    const oran = k.genislik / k.yukseklik;
    const w = oran >= 1 ? 150 : Math.round(150 * oran);
    const h = oran >= 1 ? Math.round(150 / oran) : 150;
    el.style.width = w + 'px'; el.style.height = h + 'px';
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
    this.pencere.dugmeAyarla('uygula', { devre: !this.degisti });
  }

  _resimYukle(el) {
    if (el.dataset.yuklendi) return;
    const kimlik = +el.dataset.kimlik;
    const k = this.kartlar.find((x) => x.kimlik === kimlik);
    if (!k || k.bos) return;
    el.dataset.yuklendi = '1';
    const anahtar = `${k.kaynak}|${k.sayfa}`;
    let soz = this.resimOnbellek.get(anahtar);
    if (!soz) { soz = this.baglam.cekirdek('kucuk_resim', { yol: k.kaynak, sayfa: k.sayfa, genislik: KUCUK_RESIM_GENISLIK }); this.resimOnbellek.set(anahtar, soz); }
    soz.then((r) => {
      if (!this.ogeler.get(kimlik)) return;
      const kutu = el.querySelector('.resim-kutu');
      kutu.innerHTML = '';
      const img = document.createElement('img');
      img.src = 'data:image/png;base64,' + r.png;
      img.alt = `Sayfa ${k.sayfa}`;
      img.draggable = false;
      const kk = this.kartlar.find((x) => x.kimlik === kimlik);
      if (kk?.dondurme) img.style.transform = `rotate(${kk.dondurme}deg)`;
      kutu.append(img);
    }).catch((e) => {
      const kutu = el.querySelector('.resim-kutu');
      kutu.innerHTML = `<div class="bos-sayfa" style="width:110px;height:150px;color:#d13438" title="${kacis(hataMetni(e))}">yüklenemedi</div>`;
      delete el.dataset.yuklendi;
      this.resimOnbellek.delete(anahtar);
    });
  }

  // ---------------------------------------------------------------- uygula
  /** baglam.sayfaTarifiUygula biçiminde tarif: [{kaynak:{yol,sayfa}, dondurme} | {kaynak:null, genislik, yukseklik, dondurme}] */
  tarif() {
    return tarifDisari(this.kartlar.map((k) => (k.bos
      ? { kaynak: null, sayfa: null, genislik: k.genislik, yukseklik: k.yukseklik, dondurme: k.dondurme || 0 }
      : { kaynak: k.kaynak, sayfa: k.sayfa, dondurme: k.dondurme })));
  }

  async uygula() {
    const { baglam, belge } = this;
    if (!this.degisti) { this.pencere.kapat('tamam'); return; }
    if (!this.kartlar.length) { baglam.bildir('En az bir sayfa kalmalı.'); return; }
    this.pencere.dugmeAyarla('uygula', { devre: true, etiket: 'Uygulanıyor…' });
    this.pencere.hataGoster('');
    try {
      if (typeof baglam.sayfaTarifiUygula !== 'function') throw new Error('Sayfa düzeni komutu (sayfaTarifiUygula) henüz bağlanmamış.');
      await baglam.sayfaTarifiUygula(belge, this.tarif(), 'Sayfa düzenini uygula');
      await this.pencere.kapat('tamam');
      baglam.bildir(`Sayfa düzeni uygulandı: ${this.kartlar.length} sayfa. Kaydetmeyi unutmayın (Ctrl+S).`, 4000);
    } catch (e) {
      this.pencere.dugmeAyarla('uygula', { devre: false, etiket: 'Uygula' });
      this.pencere.hataGoster('Sayfa düzeni uygulanamadı: ' + hataMetni(e));
    }
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
