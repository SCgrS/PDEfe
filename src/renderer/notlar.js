// Notlar: okuma (referans okuyucu notları dahil), çizim katmanı, etkileşim (seç/taşı/sil/düzenle),
// araçlar (yapışkan not, vurgu, metinle ilgili not, yazı), açılır balon (yazar, tarih, içerik; var olan yanıtlar salt okunur),
// komut deseniyle geri al/yinele ve kaydetme farkı (diff).
import { CSS_BIRIM, yolAnahtari } from './goruntuleyici.js';
import { Komut } from './komutlar.js';
import { secimDikdortgenleri, secimMetinKutulari, satirlaraBirlestir, secimBaslangicSayfasi } from './metin.js';
import { turAdi, tarihBicimle } from './panel.js';

// İlk renk referans okuyucunun varsayılan vurgu rengi: /C [1 .819611 0]
export const VURGU_RENKLERI = [
  { ad: 'Sarı', hex: '#ffd100' }, { ad: 'Kırmızı', hex: '#ff6e6e' }, { ad: 'Turuncu', hex: '#ffb74d' },
  { ad: 'Yeşil', hex: '#7ee787' }, { ad: 'Mavi', hex: '#7cc4ff' }, { ad: 'Pembe', hex: '#ff9ad5' },
];
export const YAZI_TIPLERI = ['Segoe UI', 'Arial', 'Times New Roman', 'Calibri'];
const NOT_RENGI = '#ffd100';                        // yapışkan not ve renksiz not için referans okuyucu varsayılanı
const METINLE_NOT_KONUSU = 'Metinle İlgili Yorum Yap';   // referans okuyucunun (Türkçe) notlu vurgu konusu; /IT /HighlightNote ile yazılır
const BALON_GOSTER_MS = 120;                        // üzerine gelince notun gösterilme gecikmesi
const BALON_GIZLE_MS = 250;                         // hedeften ve balondan çıkınca gizleme gecikmesi
const TASINABILIR = new Set(['Text', 'FreeText', 'Stamp', 'Square', 'Circle', 'Line', 'Ink', 'Polygon', 'PolyLine', 'FileAttachment', 'Caret']);
const ISARET = new Set(['Highlight', 'Underline', 'StrikeOut', 'Squiggly']);
// Çekirdeğin (not_ekle) yeniden oluşturabildiği türler: dosyadan kalkmış başka türde bir not (ör. kayıttan sonra silmesi geri alınan
// Referans okuyucu damgası) 'ekle' olarak gönderilirse kayıt bütünüyle hata verir; böyle not oturumda görünür ama dosyaya yazılamaz.
const EKLENEBILIR = new Set(['Highlight', 'Text', 'FreeText']);

let sayac = 0;
const yeniId = () => 'n' + Date.now().toString(36) + '_' + (++sayac);
const kacis = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const simdiPdfTarih = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); const o = -d.getTimezoneOffset(); const s = o >= 0 ? '+' : '-'; return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${s}${p(Math.floor(Math.abs(o) / 60))}'${p(Math.abs(o) % 60)}'`; };

// #secim-cubugu bütün belgelerce paylaşılır: seçimi izleyen (çubuğu açan) tek yönetici. Başka yöneticilerin kaydırma/yerleşim/
// çizim olayları konumu sahibine hesaplatır: sekme değişip sahibin görünümü gizlenince çubuk gizlenir (izleme sürer, sahip
// yeniden görününce 'yerlesim' ile geri gelir). Seçim klavyeyle ya da başka yoldan değişirse çubuk yeniden konumlanır/gizlenir.
let cubukSahibi = null;
document.addEventListener('selectionchange', () => cubukSahibi?.secimCubuguKonumla());
// Farenin son konumu (istemci px): geçici balona doğru ilerleyip ilerlemediği bununla anlaşılır (gizlemeyiPlanla)
const fare = { x: -1, y: -1 };
document.addEventListener('pointermove', (e) => { fare.x = e.clientX; fare.y = e.clientY; }, { capture: true, passive: true });

export class NotYoneticisi extends EventTarget {
  constructor({ belge, cekirdek, ayar, yigin, alan }) {
    super();
    this.belge = belge;
    this.g = belge.gorunum;
    this.cekirdek = cekirdek;
    this.ayar = ayar;            // () => ayarlar
    this.yigin = yigin;
    this.alan = alan;            // #belge-alani (balon ve çubuklar için)
    this.notlar = new Map();
    this._cikanlar = new Set();  // kayıtta modelden çıkarılan notların WeakRef'leri (geri al yığınında durabilirler; kaynakYeniden bunları da çevirir)
    this.kayitli = new Map();    // id → JSON anlık görüntü (dosyadaki durum)
    this.secili = null;
    this.arac = null;
    this.balon = null;
    this.balonNotId = null;
    this.balonGecici = false;
    this.pixmapOnbellek = new Map();
    this.duzenleyici = null;     // {not, el, kutu, yeniMi, eskiDurum}
    this._hoverZaman = null;     // balonu gösterme zamanlayıcısı
    this._gosterilecekId = null; // gösterimi planlanmış notun kimliği
    this._gizleZaman = null;     // geçici balonu gizleme zamanlayıcısı
    this._hoverId = null;        // fare altındaki notun kimliği (vurgu, not simgesi, yapışkan not)
    this._balonUstunde = false;  // fare balonun üzerinde
    this._canliIcerik = null;    // {id, metin}: balonda yazılan, henüz kaydedilmemiş not metni (not simgesi anında görünsün)
    this._metinKutulari = new WeakMap();   // .textLayer → öğelerin sayfaya oranla kutuları (not simgesini metnin dışına koymak için)
    this._kutuBekleyenler = new WeakSet(); // koyu sayfada görsel kutuları gelince notları yeniden çizmek için beklenen istekler
    this._balonCapa = null;      // 'simge': geçici balon not simgesinden açıldı (simgenin yanına konur); değilse notun kendisine
    this._ayrilanKutu = null;    // fare notun hangi parçasından çıktı (istemci kutusu): balona giden koridor bundan hesaplanır
    this._hoverSimgeden = false; // fare altındaki parça not simgesi mi
    this._surukle = null;
    this._fareBekleniyor = false; // metin üzerinde basıldı, bırakılması bekleniyor (seçim çubuğu)
    this._cubukOnbellek = null;   // {anahtar, liste}: seçimin sayfa yerel kutuları (kaydırmada yeniden ölçülmez)
    this.yuklendi = false;

    this.g.addEventListener('sayfaCizildi', (e) => { this.cizSayfa(e.detail.sayfa); this._cubukOnbellek = null; this.secimCubuguKonumla(); });
    this.g.addEventListener('metinKatmani', (e) => { this.simgeleriKonumla(e.detail.sayfa); if (this.balon) this.balonKonumla(); });
    this.g.addEventListener('sayfalar', () => this.sayfalarDegisti());
    this.g.addEventListener('yerlesim', () => { this.hepsiniCiz(); this.balonKonumla(); this.duzenleyiciKonumla(); this._cubukOnbellek = null; this.secimCubuguKonumla(); });
    this.g.alan.addEventListener('pointerdown', (e) => this.pointerDown(e));
    // Kısa belgede tuval alanının altında kalan boş kaydırıcı alanına basış da "başka yere tıklama"dır (kaydırma çubukları hariç)
    this.g.kaydirici.addEventListener('pointerdown', (e) => {
      const k = this.g.kaydirici; if (e.target !== k) return;
      const r = k.getBoundingClientRect();
      if (e.clientX - r.left - k.clientLeft < k.clientWidth && e.clientY - r.top - k.clientTop < k.clientHeight) this.pointerDown(e);
    });
    this.g.alan.addEventListener('dblclick', (e) => this.ciftTik(e));
    this.g.alan.addEventListener('pointerover', (e) => this.pointerOver(e));
    this.g.alan.addEventListener('pointerout', (e) => this.pointerOut(e));
    // Seçim bitişi: metin üzerindeki basıştan sonra belge düzeyinde pointerup izlenir (secimBaslat)
    this.g.kaydirici.addEventListener('scroll', () => { this.balonKonumla(); this.secimCubuguKonumla(); }, { passive: true });
  }

  // ------------------------------------------------------------ yükleme ve model
  async yukle() {
    this.notlar.clear();
    await this.kaynakYukle(this.belge.yol);
    this.kayitliAnlikGoruntu();
    this.yuklendi = true;
    this.hepsiniCiz();
    this.dispatchEvent(new CustomEvent('yuklendi'));
  }

  /** Bir kaynak dosyanın notlarını modele ekler (başka PDF'ten sayfa eklenince de çağrılır). */
  async kaynakYukle(yol) {
    const k = yolAnahtari(yol);
    if (this.yuklenenKaynaklar?.has(k)) return;
    (this.yuklenenKaynaklar ||= new Set()).add(k);
    let liste = [];
    try { liste = (await this.cekirdek('notlar', { yol })).notlar; } catch (e) { console.warn('Notlar okunamadı', yol, e); return; }
    const xrefIndex = new Map();
    for (const n of liste) {
      if (n.gizli || n.tur === 'Popup' || n.tur === 'Link' || n.tur === 'Widget') continue;
      const not = { ...n, id: yeniId(), yeni: false, silindi: false, yanitlar: [], ustId: null, kaynak: { yol, sayfa: n.sayfa } };
      this.notlar.set(not.id, not);
      xrefIndex.set(not.xref, not);
    }
    for (const not of xrefIndex.values()) {
      if (not.yanitXref && xrefIndex.has(not.yanitXref)) { const ust = xrefIndex.get(not.yanitXref); ust.yanitlar.push(not.id); not.ustId = ust.id; }
    }
    this.sayfalarDegisti(false);
    if (this.yuklendi) { this.kayitliEkle(xrefIndex.values()); this.hepsiniCiz(); }
  }

  kayitliEkle(notlar) { for (const n of notlar) if (!n.silindi) this.kayitli.set(n.id, this.anlik(n)); }

  /** Sayfa listesi değişince (silme/sıralama/ekleme) notların konumlarını yeniden eşler. */
  sayfalarDegisti(ciz = true) {
    const konum = new Map();
    this.g.sayfalar.forEach((s, i) => { if (!s.bos) { const k = yolAnahtari(s.kaynak.yol) + '#' + s.kaynak.sayfa; if (!konum.has(k)) konum.set(k, i + 1); } });
    for (const n of this.notlar.values()) {
      if (!n.kaynak || n.kaynak.bos) continue;   // boş sayfaya eklenen notlar sayfa nesnesini izler (kaynakGirdi)
      const yeniSayfa = konum.get(yolAnahtari(n.kaynak.yol) + '#' + n.kaynak.sayfa);
      n.sayfaYok = !yeniSayfa;
      if (yeniSayfa) n.sayfa = yeniSayfa;
    }
    // Bu oturumda eklenen notlar girdiyi nesneyle değil kalıcı kimlikle izler: döndürme girdinin kopyasını koyar (girdiKopyala), not kaybolmasın.
    // Bir listede aynı kimlik iki kez olamaz (tarifHazirla her girdiyi bir kez kullanır, çoğaltılan sayfa yeni kimlik alır).
    const sira = new Map(this.g.sayfalar.map((s, i) => [s.kimlik, i]));
    for (const n of this.notlar.values()) {
      if (n.kaynakGirdi) { const i = sira.get(n.kaynakGirdi.kimlik) ?? -1; n.sayfaYok = i < 0; if (i >= 0) n.sayfa = i + 1; }
    }
    if (ciz) { this.balonKapat(); this.hepsiniCiz(); this.degisti(); }
  }

  /** Kaynak dosyanın içeriği başka yola geçince (anlık kopya, yapısal olmayan Farklı kaydet) not kaynaklarını yeniden adlandırır. */
  kaynakYeniden(eskiYol, yeniYol) {
    const ek = yolAnahtari(eskiYol);
    const cevir = (n) => { if (n.kaynak && n.kaynak.yol && yolAnahtari(n.kaynak.yol) === ek) n.kaynak = { ...n.kaynak, yol: yeniYol }; };
    for (const n of this.notlar.values()) cevir(n);
    // Kayıtta modelden çıkmış, geri al yığınında duran notlar da (geri alınınca modeleGeriKoy eski yolla koyardı; sayfası bulunamazdı)
    for (const r of this._cikanlar) { const n = r.deref(); if (!n) this._cikanlar.delete(r); else cevir(n); }
    if (this.yuklenenKaynaklar?.has(ek)) { this.yuklenenKaynaklar.delete(ek); this.yuklenenKaynaklar.add(yolAnahtari(yeniYol)); }
  }

  anlik(not) {
    const { id, yeni, silindi, yanitlar, ustId, kaynak, kaynakGirdi, sayfaYok, sayfa, ...gerisi } = not;
    return JSON.stringify(gerisi);
  }

  kayitliAnlikGoruntu() {
    this.kayitli.clear();
    for (const [id, n] of this.notlar) if (!n.silindi) this.kayitli.set(id, this.anlik(n));
  }

  /** Üst düzey (yanıt olmayan), silinmemiş notlar; sayfa ve konuma göre sıralı. */
  liste() {
    return [...this.notlar.values()].filter((n) => !n.silindi && !n.ustId && !n.sayfaYok).sort((a, b) => a.sayfa - b.sayfa || a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
  }
  sayfaNotlari(sayfa) { return this.liste().filter((n) => n.sayfa === sayfa); }
  yanitlari(not) { return (not.yanitlar || []).map((id) => this.notlar.get(id)).filter((y) => y && !y.silindi).sort((a, b) => (a.olusturma || '').localeCompare(b.olusturma || '')); }

  /** Dosyada olmayan not kayıtta eklenebilir mi (sayfası duruyor ve çekirdek bu türü oluşturabiliyor). */
  eklenebilir(n) { return !n.sayfaYok && EKLENEBILIR.has(n.tur); }

  /** Kaydetme farkı: dosyadaki duruma göre ekle / güncelle / sil işlemleri. */
  fark() {
    const ops = [];
    const sirali = [...this.notlar.values()].sort((a, b) => (a.ustId ? 1 : 0) - (b.ustId ? 1 : 0));   // önce üstler, sonra yanıtlar
    for (const n of sirali) {
      const kay = this.kayitli.get(n.id);
      const kaynak = n.kaynak && n.kaynak.yol ? { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa } : null;
      if (!kay && !n.silindi) { if (this.eklenebilir(n)) ops.push({ islem: 'ekle', id: n.id, not: this.disaAktar(n) }); }
      else if (kay && n.silindi) {
        // Üstüyle birlikte silinen yanıt ayrıca silinmez: çekirdek not_sil yanıtları (IRT) da siler, ikinci 'sil' notu bulamayıp
        // kaydı bütünüyle düşürürdü (yapısal kayıtta sıra kayması başka notu silebilirdi)
        const ust = n.ustId && this.notlar.get(n.ustId);
        if (!(ust && ust.silindi && this.kayitli.has(ust.id))) ops.push({ islem: 'sil', id: n.id, xref: n.xref, kaynak, not: { xref: n.xref, sayfa: n.sayfa } });
      }
      else if (kay && this.anlik(n) !== kay) { if (!n.sayfaYok) ops.push({ islem: 'guncelle', id: n.id, xref: n.xref, kaynak, not: this.disaAktar(n) }); }
    }
    return ops;
  }

  disaAktar(n) {
    const d = { xref: n.xref, tur: n.tur, sayfa: n.sayfa, rect: n.rect, icerik: n.icerik, yazar: n.yazar, renk: n.renk, opaklik: n.opaklik, konu: n.konu, olusturma: n.olusturma };
    if (n.tur === 'Highlight') { d.quads = n.quadKutular || quadKutulari(n.quads); if (n.it) d.it = n.it; }
    if (n.tur === 'Text') d.simge = n.simge || 'Comment';
    if (n.tur === 'FreeText') d.yazi = n.yazi;
    if (n.ustId) { const ust = this.notlar.get(n.ustId); if (ust) { if (ust.xref) d.yanitXref = ust.xref; d.yanitId = ust.id; if (ust.kaynak && ust.kaynak.yol) d.yanitKaynak = { yol: ust.kaynak.yol, sayfa: ust.kaynak.sayfa }; } }
    return d;
  }

  get kirli() { return this.fark().length > 0; }

  /**
   * Kayıt başında alınır: id → dosyaya gönderilen durumun anlık görüntüsü; kayıttan sonra dosyada olmayacaksa null (silinmiş ya da
   * dosyada olmayıp eklenemeyen not: fark() göndermez, kaydedilmiş sayılmamalı). kaydedildi'ye verilir.
   */
  kayitAnligi() {
    const m = new Map();
    for (const [id, n] of this.notlar) m.set(id, n.silindi || (!this.kayitli.has(id) && !this.eklenebilir(n)) ? null : this.anlik(n));
    return m;
  }

  /** anlik (kayitAnligi) verilirse yalnızca gönderilen durum kaydedilmiş sayılır; kayıt sürerken eklenen/değiştirilen/silinen notlar kirli kalır. */
  kaydedildi(xrefler, anlik) {
    anlik ||= this.kayitAnligi();   // verilmezse kayıt şimdiki durumla yapılmış sayılır
    // Kayıt sürerken değişmeyen notlar: xref ataması anlık görüntüyü değiştirdiğinden önce belirlenir
    const ayni = new Set();
    for (const [id, a] of anlik) { const n = this.notlar.get(id); if (n && a != null && !n.silindi && this.anlik(n) === a) ayni.add(id); }
    for (const [id, xref] of Object.entries(xrefler || {})) { const n = this.notlar.get(id); if (n) { n.xref = xref; n.yeni = false; } }
    // Modelden yalnızca kayıtta silinmiş olanlar çıkar; kayıt sürerken silinenler sonraki kayıtta dosyadan silinir
    for (const [id, n] of [...this.notlar]) if (n.silindi && anlik.get(id) === null) { this.notlar.delete(id); this._cikanlar.add(new WeakRef(n)); }
    for (const [id, a] of anlik) {
      const n = this.notlar.get(id);
      if (!n || a == null) {
        this.kayitli.delete(id);                        // dosyada yok
        if (n) this.dosyadanKalkti(n);                  // kayıt sürerken geri getirilen not: eski xref geçersiz, sonraki kayıtta yeniden eklenir
      } else this.kayitli.set(id, ayni.has(id) ? this.anlik(n) : a);
    }
    this.pixmapOnbellek.clear();
    this.degisti();
  }

  /** Dosyada karşılığı kalmamış (kayıtlı olmayan) not: eski xref'i başka nesneye ait olabilir; görünümü yeni not gibi yerli çizilir. */
  dosyadanKalkti(n) {
    if (this.kayitli.has(n.id)) return;
    delete n.xref; n.yeni = true;
  }

  /**
   * Silinmiş notu modele geri koyar (kayıt dosyadan silip modelden çıkarmış olabilir; kayıtlı değilse sonraki kayıtta 'ekle' yazılır).
   * Sayfa numarası yeniden eşlenmez: yığın doğrusal olduğundan geri alma anında sayfa düzeni silme anındakiyle aynıdır.
   */
  modeleGeriKoy(n) {
    this.notlar.set(n.id, n);
    n.silindi = false;
    this.dosyadanKalkti(n);
  }

  degisti() { this.dispatchEvent(new CustomEvent('degisti')); }

  // ------------------------------------------------------------ koordinatlar
  vp(i) { return this.g.sayfalar[i] ? this.g.viewportAl(i) : null; }
  pdfToPx(i, x, y) {
    const vp = this.vp(i); if (!vp) return [0, 0];
    const view = this.g.sayfalar[i].pdfSayfa.view;
    return vp.convertToViewportPoint(view[0] + x, view[3] - y);
  }
  pxToPdf(i, px, py) {
    const vp = this.vp(i); if (!vp) return [0, 0];
    const view = this.g.sayfalar[i].pdfSayfa.view;
    const [ux, uy] = vp.convertToPdfPoint(px, py);
    return [ux - view[0], view[3] - uy];
  }
  rectToPx(i, r) {
    const a = this.pdfToPx(i, r[0], r[1]), b = this.pdfToPx(i, r[2], r[3]);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
  }
  pxRectToPdf(i, x, y, w, h) {
    const a = this.pxToPdf(i, x, y), b = this.pxToPdf(i, x + w, y + h);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }
  ptPx() { return this.g.olcek * CSS_BIRIM; }

  // ------------------------------------------------------------ çizim
  hepsiniCiz() { for (const s of this.g.sayfalar) if (s.canvas) this.cizSayfa(s.no); }

  /**
   * Sayfanın not katmanını yeniden kurar. Sıra (alttan üste): vurgular, diğer metin işaretleri, not öğeleri, not simgeleri.
   * Vurgular referans okuyucu gibi çarpma (multiply) karışımıyla ayrı bir SVG'de çizilir: yazı siyah kalır, yalnızca beyaz zemin renklenir
   * (katman yığın bağlamı oluşturmaz, karışım .sayfa içindeki tuvalle yapılır; stil.css). Koyulaştırılmış sayfada (ters çevrilmiş
   * tuval) karışım ekran (screen) olur: çarpmanın tersine çevrilmiş sayfadaki karşılığıdır, açık renkli yazı olduğu gibi kalır,
   * koyu zemin vurgu rengine döner. Koyu sayfada görseller (taramalar, gömülü resimler) ters çevrilmeden özgün renginde çizildiği için
   * (goruntuleyici tuvalGoster) vurgunun görsel kutularına düşen kısmı yine çarpmayla çizilir: vurgular iki kopyadır, ekran kopyası
   * görsel kutuları dışına (maske), çarpma kopyası görsel kutularının içine (kırpma) sınırlanır.
   */
  cizSayfa(sayfa) {
    const s = this.g.sayfalar[sayfa - 1];
    if (!s || !s.pdfSayfa || !s.canvas || !this.yuklendi) return;
    const katman = s.notKatmani;
    katman.innerHTML = '';
    const notlar = this.sayfaNotlari(sayfa);
    const SVG = 'http://www.w3.org/2000/svg';
    const ogeOlustur = (ad, nitelikler = {}, ata = null) => {
      const el = document.createElementNS(SVG, ad);
      for (const [k, v] of Object.entries(nitelikler)) el.setAttribute(k, v);
      if (ata) ata.append(el);
      return el;
    };
    const svgOlustur = (sinif) => { const svg = ogeOlustur('svg', { class: sinif }); katman.append(svg); return svg; };
    const vurgular = [];   // vurguların çizileceği kaplar (koyu sayfada görsel varsa iki)
    if (notlar.some((n) => n.tur === 'Highlight')) {
      const koyu = this.g.koyuSayfa;
      const gorseller = koyu ? this.gorselKutulariPx(s) : [];
      const ekran = svgOlustur('not-isaretler not-vurgular' + (koyu ? ' koyu-sayfa' : ''));
      if (!gorseller.length) vurgular.push(ekran);
      else {
        const W = s.el.clientWidth, H = s.el.clientHeight;
        const kutuEkle = (ata, renk) => { for (const r of gorseller) ogeOlustur('rect', { x: r.x, y: r.y, width: r.w, height: r.h, ...(renk ? { fill: renk } : {}) }, ata); };
        const maskeId = yeniId(), kirpId = yeniId();
        const maske = ogeOlustur('mask', { id: maskeId, maskUnits: 'userSpaceOnUse', x: -W, y: -H, width: 3 * W, height: 3 * H }, ogeOlustur('defs', {}, ekran));
        ogeOlustur('rect', { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: '#fff' }, maske);
        kutuEkle(maske, '#000');
        vurgular.push(ogeOlustur('g', { mask: `url(#${maskeId})` }, ekran));
        const carpma = svgOlustur('not-isaretler not-vurgular');
        kutuEkle(ogeOlustur('clipPath', { id: kirpId }, ogeOlustur('defs', {}, carpma)));
        vurgular.push(ogeOlustur('g', { 'clip-path': `url(#${kirpId})` }, carpma));
      }
    }
    const isaretler = notlar.some((n) => ISARET.has(n.tur) && n.tur !== 'Highlight') ? svgOlustur('not-isaretler') : null;
    for (const n of notlar) {
      if (n.tur === 'Highlight') { for (const kap of vurgular) this.isaretCiz(n, sayfa - 1, kap); continue; }
      if (ISARET.has(n.tur)) { this.isaretCiz(n, sayfa - 1, isaretler); continue; }
      const el = this.notElemani(n, sayfa - 1);
      if (el) katman.append(el);
    }
    const dolu = [];
    for (const n of notlar) if (this.simgeliMi(n)) katman.append(this.notSimgesi(n, sayfa - 1, dolu));
    this.seciliIsaretle();
    this.hoverIsaretle();
  }

  /**
   * Koyu sayfada özgün renginde çizilen görsellerin sayfa içi kutuları (px). Kutular henüz bilinmiyorsa görüntüleyici onları getiriyordur
   * (s._kutuIstegi): gelince sayfanın notları yeniden çizilir; o zamana dek tuval de bütünüyle ters çevrilmiş durur.
   */
  gorselKutulariPx(s) {
    const i = this.g.sayfalar.indexOf(s);
    if (i < 0) return [];
    if (!s.gorselKutulari) {
      const istek = s._kutuIstegi;
      if (istek && !this._kutuBekleyenler.has(istek)) {
        this._kutuBekleyenler.add(istek);
        istek.then(() => { this._kutuBekleyenler.delete(istek); const j = this.g.sayfalar.indexOf(s); if (j >= 0 && this.g.koyuSayfa && s.gorselKutulari) this.cizSayfa(j + 1); });
      }
      return [];
    }
    return s.gorselKutulari.map((k) => this.rectToPx(i, k)).filter((r) => r.w >= 1 && r.h >= 1);
  }

  simgeBoyutu() { return Math.max(24, Math.min(44, 22 * this.g.olcek)); }

  /** Notun gösterilecek metni (balonda yazılmakta olan metin önceliklidir); boşluktan ibaretse ''. */
  notMetni(n) {
    const m = this._canliIcerik && this._canliIcerik.id === n.id ? this._canliIcerik.metin : n.icerik;
    return String(m || '').trim() ? m : '';
  }

  /** Üzerine gelince balon açılır mı: yapışkan not her zaman; diğerleri metni ya da yanıtı varsa (boş vurgu okurken balon açmasın). */
  balonluMu(n) {
    if (!n || n.tur === 'FreeText') return false;
    return n.tur === 'Text' || !!this.notMetni(n) || this.yanitlari(n).length > 0;
  }

  /** Not simgesi gösterilir mi: metin işaretinde (vurgu ailesi) not metni ya da dosyadan gelen yanıtı varsa (içinde bilgi olduğu görünsün). */
  simgeliMi(n) { return ISARET.has(n.tur) && !n.silindi && !n.sayfaYok && this.balonluMu(n); }

  notElemani(n, i) {
    const r = this.rectToPx(i, n.rect);
    const el = document.createElement('div');
    el.dataset.id = n.id;
    el.className = 'not-oge not-' + n.tur.toLowerCase();
    if (!this.balonluMu(n)) el.title = (n.yazar ? n.yazar + ': ' : '') + (n.icerik || turAdi(n.tur));   // balonlu notta ipucu balonla çakışırdı
    if (n.tur === 'Text') {
      const b = this.simgeBoyutu();
      el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${b}px;height:${b}px;--not-renk:${n.renk || NOT_RENGI}`;
      el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h13A2.5 2.5 0 0 1 21 4.5v10a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h-.5A2.5 2.5 0 0 1 3 14.5z" fill="var(--not-renk)" stroke="rgba(0,0,0,.55)" stroke-width="1.2"/><path d="M7 7.5h10M7 11h7" stroke="rgba(0,0,0,.6)" stroke-width="1.4" stroke-linecap="round"/></svg>`;
      return el;
    }
    el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${Math.max(r.w, 4)}px;height:${Math.max(r.h, 4)}px`;
    if (n.tur === 'FreeText' && (n.yeni || n.yazi || !n.ap)) {
      this.freeTextDoldur(el, n);
      return el;
    }
    if (n.ap && n.xref) { this.pixmapYukle(el, n, i); return el; }
    el.classList.add('not-bilinmeyen');
    el.innerHTML = `<span>${kacis(turAdi(n.tur))}</span>`;
    return el;
  }

  freeTextDoldur(el, n) {
    const y = n.yazi || {};
    const k = this.ptPx();
    el.classList.add('not-freetext-yerli');
    el.style.fontFamily = `'${y.tip || 'Segoe UI'}'`;
    el.style.fontSize = ((y.boyut || 12) * k) + 'px';
    el.style.lineHeight = '1.2';
    el.style.color = y.renk || '#000';
    el.style.background = y.arka || 'transparent';
    el.style.fontWeight = y.kalin ? '700' : '400';
    el.style.textDecoration = y.altiCizili ? 'underline' : 'none';
    el.style.border = y.kenarlik ? `${Math.max(1, k)}px solid ${y.kenarlikRengi || y.renk || '#000'}` : 'none';
    el.style.padding = (2 * k) + 'px';
    el.textContent = n.icerik || '';
  }

  async pixmapYukle(el, n, i) {
    const dpr = window.devicePixelRatio || 1;
    const olcek = Math.min(8, this.ptPx() * dpr);
    const anahtar = `${n.xref}@${olcek.toFixed(2)}`;
    let src = this.pixmapOnbellek.get(anahtar);
    if (!src) {
      try {
        if (!n.kaynak || !n.kaynak.yol) { el.classList.add('not-bilinmeyen'); return; }
        const r = await this.cekirdek('not_gorunum', { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa, xref: n.xref, olcek });
        src = 'data:image/png;base64,' + r.png;
        this.pixmapOnbellek.set(anahtar, src);
      } catch (e) { el.classList.add('not-bilinmeyen'); return; }
    }
    if (!el.isConnected) return;
    const img = document.createElement('img');
    img.src = src; img.draggable = false;
    el.append(img);
  }

  isaretCiz(n, i, svg) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.id = n.id;
    g.setAttribute('class', 'not-isaret not-' + n.tur.toLowerCase());
    const renk = n.renk || VURGU_RENKLERI[0].hex;
    const kutular = n.quadKutular || quadKutulari(n.quads);
    for (const q of kutular.length ? kutular : [n.rect]) {
      const r = this.rectToPx(i, q);
      if (n.tur === 'Highlight') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', r.x); rect.setAttribute('y', r.y); rect.setAttribute('width', r.w); rect.setAttribute('height', r.h);
        rect.setAttribute('fill', renk); rect.setAttribute('fill-opacity', n.opaklik ?? 0.4);
        g.append(rect);
      } else {
        const kal = Math.max(1, r.h * 0.07);
        if (n.tur === 'Squiggly') {
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const y = r.y + r.h - kal; const adim = Math.max(2, r.h * 0.18); let d = `M${r.x} ${y}`; let yukari = true;
          for (let x = r.x + adim; x <= r.x + r.w; x += adim) { d += ` L${x} ${yukari ? y - adim * 0.8 : y}`; yukari = !yukari; }
          p.setAttribute('d', d); p.setAttribute('stroke', renk); p.setAttribute('fill', 'none'); p.setAttribute('stroke-width', kal);
          g.append(p);
        } else {
          const l = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          const y = n.tur === 'Underline' ? r.y + r.h - kal * 1.2 : r.y + r.h * 0.5 - kal / 2;
          l.setAttribute('x', r.x); l.setAttribute('y', y); l.setAttribute('width', r.w); l.setAttribute('height', kal); l.setAttribute('fill', renk);
          g.append(l);
        }
        // Tıklama alanı
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hit.setAttribute('x', r.x); hit.setAttribute('y', r.y); hit.setAttribute('width', r.w); hit.setAttribute('height', r.h); hit.setAttribute('fill', 'transparent');
        g.append(hit);
      }
    }
    if (!this.balonluMu(n)) {   // balonlu notta ipucu balonla çakışırdı
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      t.textContent = (n.yazar ? n.yazar + ': ' : '') + (n.icerik || turAdi(n.tur));
      g.append(t);
    }
    svg.append(g);
  }

  // ------------------------------------------------------------ not simgesi (metin işaretindeki not)
  /**
   * Notlu vurgu ailesi için küçük konuşma balonu simgesi (yalnızca PDEfe'de gösterilir, dosyaya yazılmaz). Konumu simgeKonumu:
   * ilk satırın sonunda, metnin dışında. data-id taşır: üzerine gelince not gösterilir, tıklanınca düzenlemek için açılır.
   */
  notSimgesi(n, i, dolu = []) {
    const el = document.createElement('div');
    el.className = 'not-simge';
    el.dataset.id = n.id;
    el.setAttribute('aria-label', 'Not');
    el.style.setProperty('--not-renk', n.renk || NOT_RENGI);
    el.innerHTML = '<svg viewBox="0 0 20 20"><path d="M2.5 4.2A2.2 2.2 0 0 1 4.7 2h10.6a2.2 2.2 0 0 1 2.2 2.2v7.6a2.2 2.2 0 0 1-2.2 2.2H9.2L5.4 17.6V14h-.7a2.2 2.2 0 0 1-2.2-2.2z" fill="var(--not-renk)" stroke="#1f1f1f" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 6.6h8M6 9.6h5.5" stroke="#1f1f1f" stroke-width="1.5" stroke-linecap="round"/></svg>';
    this.simgeYerlestir(el, n, i, dolu);
    return el;
  }

  /** dolu: aynı sayfada önceden yerleştirilmiş simgelerin kutuları ({x, y, b}); yerleştirilen simge eklenir. */
  simgeYerlestir(el, n, i, dolu = []) {
    const k = this.simgeKonumu(n, i, dolu);
    if (!k) { el.hidden = true; return; }
    el.hidden = false;
    dolu.push(k);
    Object.assign(el.style, { left: k.x + 'px', top: k.y + 'px', width: k.b + 'px', height: k.b + 'px' });
  }

  /** Metin katmanı çizilince (ya da yeniden kurulunca) sayfadaki not simgeleri metnin gerçek satır sonuna göre yeniden konumlanır. */
  simgeleriKonumla(sayfa) {
    const s = this.g.sayfalar[sayfa - 1];
    if (!s || !this.yuklendi) return;
    const dolu = [];
    for (const el of s.notKatmani.querySelectorAll('.not-simge')) {
      const n = this.notlar.get(el.dataset.id);
      if (n) this.simgeYerlestir(el, n, sayfa - 1, dolu);
    }
  }

  /** Balonda yazılırken ya da not silinince/boşalınca tek notun simgesini ekler/kaldırır (sayfanın tamamını yeniden çizmeden). */
  notSimgesiYenile(n) {
    if (!ISARET.has(n.tur)) return;
    const s = this.g.sayfalar[n.sayfa - 1];
    if (!s || !s.canvas || !this.yuklendi) return;
    const eski = s.notKatmani.querySelector(`.not-simge[data-id="${n.id}"]`);
    const gerekli = this.simgeliMi(n);
    if (eski && !gerekli) eski.remove();
    else if (!eski && gerekli) {
      const dolu = [...s.notKatmani.querySelectorAll('.not-simge:not([hidden])')].map((d) => ({ x: parseFloat(d.style.left), y: parseFloat(d.style.top), b: parseFloat(d.style.width) }));
      s.notKatmani.append(this.notSimgesi(n, n.sayfa - 1, dolu));
      this.seciliIsaretle();
    }
  }

  /**
   * Metin katmanındaki öğelerin sayfa kutusuna oranla kutuları [x0,y0,x1,y1] (0..1). Oran kullanıldığı için yakınlaştırma sürerken
   * (katman eski ölçekteyken) de geçerlidir; katman yeniden kurulunca (döndürme) önbellek kendiliğinden düşer.
   */
  metinKutulari(i) {
    const katman = this.g.sayfalar[i]?.el.querySelector('.textLayer');
    if (!katman || !katman.querySelector('.endOfContent')) return null;   // katman henüz çizilmedi
    const onceki = this._metinKutulari.get(katman);
    if (onceki && onceki.n === katman.childElementCount) return onceki.kutular;
    const kr = katman.getBoundingClientRect();
    if (!kr.width || !kr.height) return null;
    const kutular = [];
    for (const sp of katman.querySelectorAll('span:not(.markedContent):not(.highlight)')) {
      if (!sp.textContent.trim()) continue;
      const r = sp.getBoundingClientRect();
      if (r.width < 0.5 || r.height < 0.5) continue;
      kutular.push([(r.left - kr.left) / kr.width, (r.top - kr.top) / kr.height, (r.right - kr.left) / kr.width, (r.bottom - kr.top) / kr.height]);
    }
    this._metinKutulari.set(katman, { n: katman.childElementCount, kutular });
    return kutular;
  }

  /**
   * Not simgesinin sayfa içi konumu {x, y, b} (px). Simge hiçbir yazının (metin katmanı öğesinin) ve başka simgenin üstüne binmez; yerler
   * sırayla denenir, boş olan ilki seçilir:
   *  1) vurgunun ilk satırının bittiği yerin hemen sağı (satırdan biraz yukarıda, olmazsa satıra ortalı),
   *  2) ilk satırın sağ üst köşesinin üstü (satır arasında ya da üst satırda boş yer varsa);
   *     bu ikisi önce tam boyutla, sonra satır kalınlığına göre küçültülerek (en az 9 px) denenir; olmazsa
   *  3) metin satırının gerçek sonu (satır vurgudan sonra bitişik yazıyla sürüyorsa; çoğunlukla sağ kenar boşluğu) ve okuma yönünde ötesi.
   * Boyut satır kalınlığıyla ölçeklenir (12–30 px). Döndürülmüş sayfada okuma yönü viewport açısından alınır; simge dik kalır.
   */
  simgeKonumu(n, i, dolu = []) {
    const vp = this.vp(i), s = this.g.sayfalar[i];
    if (!vp || !s) return null;
    const kutular = n.quadKutular || quadKutulari(n.quads);
    const r = this.rectToPx(i, kutular[0] || n.rect);
    const W = s.el.clientWidth || vp.width, H = s.el.clientHeight || vp.height;
    const aci = ((Math.round(vp.rotation / 90) * 90) % 360 + 360) % 360;
    // Yerel eksenler: u okuma yönünde, v sonraki satıra doğru artar. yerel: sayfa kutusu → {u0,u1,v0,v1}; sayfaya: yerel simge (u,v,b) → sol üst köşe
    const yerel = (x0, y0, x1, y1) => aci === 0 ? { u0: x0, u1: x1, v0: y0, v1: y1 } : aci === 90 ? { u0: y0, u1: y1, v0: -x1, v1: -x0 }
      : aci === 180 ? { u0: -x1, u1: -x0, v0: -y1, v1: -y0 } : { u0: -y1, u1: -y0, v0: x0, v1: x1 };
    const sayfaya = (u, v, b) => aci === 0 ? { x: u, y: v } : aci === 90 ? { x: -v - b, y: u } : aci === 180 ? { x: -u - b, y: -v - b } : { x: v, y: -u - b };
    const satir = yerel(r.x, r.y, r.x + r.w, r.y + r.h);
    const kalinlik = satir.v1 - satir.v0;
    const oranlar = this.metinKutulari(i);
    const metin = oranlar ? oranlar.map((o) => [o[0] * W, o[1] * H, o[2] * W, o[3] * H]) : [];
    const kesisir = (k, x0, y0, x1, y1) => Math.min(x1, k.x + k.b) - Math.max(x0, k.x) > 1 && Math.min(y1, k.y + k.b) - Math.max(y0, k.y) > 1;
    const aday = (u, v, b) => { const p = sayfaya(u, v, b); return { x: Math.max(0, Math.min(W - b, p.x)), y: Math.max(0, Math.min(H - b, p.y)), b }; };
    const bos = (k) => !metin.some((m) => kesisir(k, ...m)) && !dolu.some((d) => kesisir(k, d.x, d.y, d.x + d.b, d.y + d.b));
    const bosluk = (b) => Math.max(2, Math.min(kalinlik * 0.15, b * 0.3));
    const buyuk = Math.round(Math.max(12, Math.min(30, kalinlik * 1.05)));
    const kucuk = Math.round(Math.max(9, Math.min(buyuk, kalinlik * 0.8)));
    const boyutlar = [...new Set([buyuk, Math.round((buyuk + kucuk) / 2), kucuk])];
    // 1-2) vurgunun ilk satırının ucunda
    for (const b of boyutlar) {
      const yerler = [
        [satir.u1 + bosluk(b), satir.v0 - b * 0.35],             // bitişin sağı, satırdan biraz yukarıda
        [satir.u1 + bosluk(b), satir.v0 + (kalinlik - b) / 2],   // bitişin sağı, satıra ortalı
        [satir.u1 - b * 0.5, satir.v0 - b - 1],                   // sağ üst köşenin üstü, köşeye ortalı
        [satir.u1 + 1, satir.v0 - b - 1],                         // sağ üst köşenin üstü, bitişin sağında
      ];
      for (const [u, v] of yerler) { const k = aday(u, v, b); if (bos(k)) return k; }
    }
    // 3) metin satırının gerçek sonu: vurgunun bittiği yerden sonra bitişik metin öğeleri boyunca uzatılır
    const ayniSatir = metin.map((m) => yerel(...m))
      .filter((m) => Math.min(m.v1, satir.v1) - Math.max(m.v0, satir.v0) >= 0.5 * Math.min(m.v1 - m.v0, kalinlik))
      .sort((p, q) => p.u0 - q.u0);
    let son = satir.u1;
    for (let degisti = true; degisti;) {
      degisti = false;
      for (const m of ayniSatir) if (m.u0 <= son + kalinlik && m.u1 > son + 0.5) { son = m.u1; degisti = true; }
    }
    for (const b of boyutlar) {
      for (let kay = 0; kay < 6; kay++) {
        const u = son + bosluk(b) + kay * (b + 2);
        for (const v of [satir.v0 - b * 0.35, satir.v0 + (kalinlik - b) / 2]) { const k = aday(u, v, b); if (bos(k)) return k; }
      }
    }
    return aday(son + bosluk(kucuk), satir.v0 + (kalinlik - kucuk) / 2, kucuk);   // hiç boş yer yoksa satırın sonunda, satıra ortalı
  }

  seciliIsaretle() {
    for (const el of this.g.alan.querySelectorAll('.not-secili')) el.classList.remove('not-secili');
    if (!this.secili) return;
    for (const el of this.g.alan.querySelectorAll(`[data-id="${this.secili}"]`)) el.classList.add('not-secili');
  }

  sec(id) {
    this.secili = id;
    this.seciliIsaretle();
    this.dispatchEvent(new CustomEvent('secim', { detail: { id } }));
  }

  // ------------------------------------------------------------ komutlar
  calistir(ad, uygula, geriAl) {
    const k = new Komut(ad, () => { uygula(); this.degisti(); }, () => { geriAl(); this.degisti(); });
    this.yigin.calistir(k);
    return k;
  }

  ekle(not, ad = null) {
    not.id = not.id || yeniId(); not.yeni = true; not.silindi = false; not.yanitlar = not.yanitlar || []; not.ustId = not.ustId || null;
    if (!not.kaynak) { const s = this.g.sayfalar[not.sayfa - 1]; if (s) { not.kaynak = s.bos ? { bos: true } : { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa }; not.kaynakGirdi = s; } }
    not.olusturma = not.olusturma || simdiPdfTarih(); not.degisim = not.olusturma;
    // Yinele: eklenip kaydedilen, geri alınıp (silinerek) yeniden kaydedilen not modelden çıkmıştır; geri konur ve yeniden eklenir.
    // Kayıtlıyken geri alınırsa silindi işaretlenir, sonraki kayıtta 'sil' yazılır.
    this.calistir(ad || `${turAdi(not.tur)} ekle`,
      () => { this.modeleGeriKoy(not); this.cizSayfa(not.sayfa); },
      () => { not.silindi = true; if (this.secili === not.id) this.sec(null); this.balonKapat(); this.cizSayfa(not.sayfa); });
    return not;
  }

  sil(not) {
    const yanitlar = this.yanitlari(not);
    // Geri al: kayıt silinen notu ve yanıtlarını modelden çıkarmış olabilir; modele geri konur (dosyada yoksa sonraki kayıtta eklenir)
    this.calistir(`${turAdi(not.tur)} sil`,
      () => { not.silindi = true; for (const y of yanitlar) y.silindi = true; if (this.secili === not.id) this.sec(null); this.balonKapat(); this.cizSayfa(not.sayfa); },
      () => {
        // Kayıt notu dosyadan silmiş ve çekirdek bu türü yeniden oluşturamıyorsa (EKLENEBILIR dışı: ek, damga, şekil) geri konmaz: ekranda
        // görünür ama kayıtta yazılmaz, belge temiz sayılırdı. Yanıtlar da konmaz (üstsüz kalıp bağımsız yapışkan not olarak yazılırlardı).
        if (!this.kayitli.has(not.id) && !EKLENEBILIR.has(not.tur)) {
          this.dispatchEvent(new CustomEvent('uyari', { detail: { metin: `${turAdi(not.tur)} kaydedilirken dosyadan silindi; bu tür not dosyaya geri yazılamadığı için silme geri alınamaz.` } }));
          return;
        }
        this.modeleGeriKoy(not); for (const y of yanitlar) this.modeleGeriKoy(y); this.cizSayfa(not.sayfa);
      });
  }

  guncelle(not, yeni, ad = null) {
    const eski = { degisim: not.degisim };   // geri alınınca değişim tarihi de döner (yoksa anlık farkı belgeyi kirli bırakır)
    for (const k of Object.keys(yeni)) eski[k] = structuredClone(not[k]);
    const eskiSayfa = not.sayfa;
    let degisim = null;                      // yinelemede ilk uygulamadaki tarih: kaydedilmiş duruma dönülünce belge temiz görünür
    this.calistir(ad || `${turAdi(not.tur)} düzenle`,
      () => { Object.assign(not, structuredClone(yeni)); not.degisim = degisim ||= simdiPdfTarih(); this.pixmapOnbellek.clear(); this.cizSayfa(not.sayfa); if (this.balonNotId === not.id) this.balonYenile(); },
      () => { Object.assign(not, structuredClone(eski)); this.pixmapOnbellek.clear(); this.cizSayfa(eskiSayfa); if (this.balonNotId === not.id) this.balonYenile(); });
  }

  silSecili() {
    if (!this.secili) return false;
    const n = this.notlar.get(this.secili);
    if (!n) return false;
    this.sil(n);
    return true;
  }

  // ------------------------------------------------------------ etkileşim
  /** Elemanın bulunduğu sayfanın sırası (0 tabanlı) ya da -1. data-sayfa yoksa/tutmuyorsa sayfa elemanı listede aranır. */
  sayfaIdx(el) {
    const s = el?.closest?.('.sayfa'); if (!s) return -1;
    const n = parseInt(s.dataset.sayfa, 10);
    if (n > 0 && this.g.sayfalar[n - 1]?.el === s) return n - 1;
    return this.g.sayfalar.findIndex((x) => x.el === s);
  }

  pointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.yazi-duzenleyici, .yazi-bicim, .yazi-tutamac, .yazi-boyut, .not-balonu, #secim-cubugu')) return;
    const hedef = e.target.closest('[data-id]');
    const i = this.sayfaIdx(e.target);
    // Metin seçimi: metni olan sayfanın metnine ya da boş yerine basış yeni seçim başlatır (çubuk bırakılana dek gizli; bkz. metin.js
    // surukleSecimiBagla); başka her yere basış seçimi kaldırır
    const aracTiki = !hedef && i >= 0 && (this.arac === 'not' || this.arac === 'yazi');
    if (!hedef && !aracTiki && secimBaslangicSayfasi(e.target)) this.secimBaslat();
    else this.secimTemizle();
    if (this.duzenleyici && !hedef) { this.duzenleyiciBitir(true); }
    if (!hedef) this.gosterimIptal();   // basılıyken (metin seçerken) balon açılmasın
    if (this.arac === 'not' && !hedef && i >= 0) { e.preventDefault(); this.yapiskanNotKoy(i, e); return; }
    if (this.arac === 'yazi' && !hedef && i >= 0) { e.preventDefault(); this.yaziBaslat(i, e); return; }
    if (hedef) {
      const id = hedef.dataset.id;
      const n = this.notlar.get(id);
      if (!n) return;
      this.sec(id);
      e.preventDefault();
      // Not simgesine tıklama: notu düzenlemek için açar (geçici balon kalıcı olur, metin kutusuna odaklanılır)
      if (hedef.classList.contains('not-simge')) { this.gosterimIptal(); this.balonAc(n, { odak: !n.kilitli, capa: 'simge' }); return; }
      if (TASINABILIR.has(n.tur) && !n.kilitli) this.surukleBaslat(n, hedef, e);
      return;
    }
    if (this.secili) this.sec(null);
    this.balonKapat();
  }

  surukleBaslat(n, el, e) {
    const i = n.sayfa - 1;
    const bas = { x: e.clientX, y: e.clientY, left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0, hareket: false };
    const hareket = (e2) => {
      const dx = e2.clientX - bas.x, dy = e2.clientY - bas.y;
      if (!bas.hareket && Math.hypot(dx, dy) < 3) return;
      bas.hareket = true;
      el.style.left = (bas.left + dx) + 'px'; el.style.top = (bas.top + dy) + 'px';
      this.balonKonumla();
    };
    const birak = (e2) => {
      document.removeEventListener('pointermove', hareket); document.removeEventListener('pointerup', birak);
      if (!bas.hareket) return;
      const dx = e2.clientX - bas.x, dy = e2.clientY - bas.y;
      const r = this.rectToPx(i, n.rect);
      const yeniRect = this.pxRectToPdf(i, r.x + dx, r.y + dy, r.w, r.h);
      this.guncelle(n, { rect: yeniRect }, `${turAdi(n.tur)} taşı`);
    };
    document.addEventListener('pointermove', hareket); document.addEventListener('pointerup', birak);
  }

  ciftTik(e) {
    const hedef = e.target.closest('[data-id]');
    if (!hedef) return;
    const n = this.notlar.get(hedef.dataset.id);
    if (!n) return;
    e.preventDefault();
    if (n.tur === 'FreeText') this.yaziDuzenle(n);
    else this.balonAc(n, { odak: true });
  }

  /**
   * Üzerine gelince hızlı gösterim: notun hedefine (vurgu, not simgesi, yapışkan not) girince BALON_GOSTER_MS sonra geçici balon açılır.
   * Balon, fare hedefte ya da balonun üzerinde kaldıkça açık kalır; ikisinden de çıkınca BALON_GIZLE_MS sonra kapanır. Aynı notun
   * parçaları arasında (çok satırlı vurgunun satır aralıkları, vurgu → simge) geçiş kapatmayı iptal eder: titreme olmaz. Fare hedeften
   * balona doğru ilerlerken (ikisini kapsayan koridorda balona yaklaşıyorsa) kapatma ertelenir, yoldaki başka not balonu değiştirmez.
   * Fare düğmesi basılıyken (metin seçerken sürükleme) ve seçim mini çubuğu açıkken balon açılmaz.
   */
  pointerOver(e) {
    const hedef = e.target.closest('[data-id]');
    if (!hedef) return;
    const id = hedef.dataset.id;
    const simgeden = hedef.classList.contains('not-simge');
    if (this._hoverId !== id || this._hoverSimgeden !== simgeden) { this._hoverId = id; this._hoverSimgeden = simgeden; this.hoverIsaretle(); }
    if (this.balon && this.balonNotId === id) { clearTimeout(this._gizleZaman); this.gosterimIptal(); return; }   // zaten bu notun balonu açık
    if (!this.balonGecici) clearTimeout(this._gizleZaman);
    if (this._surukle || this._fareBekleniyor || e.buttons || this.secimCubuguAcik()) return;
    const n = this.notlar.get(id);
    if (!this.balonluMu(n)) { this.gosterimIptal(); return; }   // kapatma planı (varsa) sürer
    if (this._gosterilecekId === id) return;   // gösterim zaten planlı (aynı notun parçaları arasında gezinirken ertelenmesin)
    this.gosterimIptal();
    this._gosterilecekId = id;
    let mesafe = this.balonMesafesi();
    const goster = () => {
      if (this._hoverId !== id || this._fareBekleniyor || this.duzenleyici || this.secimCubuguAcik() || !this.g.kaydirici.clientWidth) { this._gosterilecekId = null; return; }   // sekme gizlendiyse açma
      if (this.balon && !this.balonGecici) { this._gosterilecekId = null; return; }
      // Başka notun geçici balonuna doğru ilerlerken yoldaki not balonu değiştirmez: fare durunca (yaklaşmayı bırakınca) açılır
      const simdi = this.balonMesafesi();
      if (this.balon && this.koridorda() && simdi < mesafe - 4) { mesafe = simdi; this._hoverZaman = setTimeout(goster, BALON_GOSTER_MS); return; }
      this._gosterilecekId = null;
      this.balonAc(n, { gecici: true, capa: this._hoverSimgeden ? 'simge' : null });
    };
    this._hoverZaman = setTimeout(goster, BALON_GOSTER_MS);
  }

  pointerOut(e) {
    const hedef = e.target.closest('[data-id]');
    if (!hedef) return;
    const id = hedef.dataset.id;
    const sonraki = e.relatedTarget?.closest?.('[data-id]');
    if (sonraki && sonraki.dataset.id === id) return;   // aynı notun başka parçasına geçiş (simge ↔ vurgu geçişini pointerOver işler)
    this._ayrilanKutu = (e.target instanceof Element ? e.target : hedef).getBoundingClientRect();
    if (this._hoverId === id) { this._hoverId = null; this._hoverSimgeden = false; this.hoverIsaretle(); }
    if (this._gosterilecekId === id) this.gosterimIptal();
    if (this.balonGecici && this.balonNotId === id) this.gizlemeyiPlanla();
  }

  gosterimIptal() { clearTimeout(this._hoverZaman); this._gosterilecekId = null; }

  /** Seçim mini çubuğu bu belgede açık mı (üzerine gelince balon çubuğun üstüne açılmasın). */
  secimCubuguAcik() { const c = cubukSahibi === this && this.cubuk(); return !!c && !c.hidden; }

  /** Fare altındaki notun bütün parçalarını işaretler: simgenin üzerindeyken vurgusu, vurgunun üzerindeyken simgesi belirginleşir. */
  hoverIsaretle() {
    for (const el of this.g.alan.querySelectorAll('.not-hover')) el.classList.remove('not-hover', 'not-hover-simgeden');
    if (!this._hoverId) return;
    for (const el of this.g.alan.querySelectorAll(`[data-id="${this._hoverId}"]`)) el.classList.add('not-hover', ...(this._hoverSimgeden ? ['not-hover-simgeden'] : []));
  }

  /** Farenin balona uzaklığı (px; balonun üzerindeyse 0, balon yoksa Infinity). */
  balonMesafesi() {
    if (!this.balon) return Infinity;
    const r = this.balon.getBoundingClientRect();
    return Math.hypot(Math.max(r.left - fare.x, 0, fare.x - r.right), Math.max(r.top - fare.y, 0, fare.y - r.bottom));
  }

  /** Fare, çıktığı not parçasıyla balonu kapsayan dikdörtgenin (koridorun) içinde mi. */
  koridorda() {
    const k = this._ayrilanKutu;
    if (!this.balon || !k) return false;
    const r = this.balon.getBoundingClientRect(), P = 12;
    return fare.x >= Math.min(k.left, r.left) - P && fare.x <= Math.max(k.right, r.right) + P && fare.y >= Math.min(k.top, r.top) - P && fare.y <= Math.max(k.bottom, r.bottom) + P;
  }

  /** Geçici balon: fare ne hedef notta ne balonda kaldıysa kısa gecikmeyle kapatır; balona doğru ilerliyorsa bekler. */
  gizlemeyiPlanla() {
    clearTimeout(this._gizleZaman);
    const mesafe = this.balonMesafesi();
    this._gizleZaman = setTimeout(() => {
      if (!this.balonGecici || this._balonUstunde || (this._hoverId && this._hoverId === this.balonNotId)) return;
      if (this.koridorda() && this.balonMesafesi() < mesafe - 4) { this.gizlemeyiPlanla(); return; }
      this.balonKapat();
    }, BALON_GIZLE_MS);
  }

  // ------------------------------------------------------------ balon
  /** capa: 'simge' ise balon not simgesinin yanına, değilse notun kendisine (vurgunun ilk satırına) göre konur. */
  balonAc(n, { gecici = false, odak = false, capa = null } = {}) {
    this.balonKapat();
    const b = document.createElement('div');
    b.className = 'not-balonu' + (gecici ? ' gecici' : '');
    b.dataset.notId = n.id;
    b.style.width = '300px';   // metin kutusu yüksekliği bu genişlikte ölçülür (balonKonumla)
    this.balon = b; this.balonNotId = n.id; this.balonGecici = gecici; this._balonCapa = capa;
    this.alan.append(b);
    this.balonYenile();
    this.balonKonumla();
    // Fare balondayken açık kalır; çıkınca (hedef notun üzerine dönmediyse) kısa gecikmeyle kapanır
    b.addEventListener('pointerenter', () => { if (this.balon !== b) return; this._balonUstunde = true; clearTimeout(this._gizleZaman); });
    b.addEventListener('pointerleave', () => { if (this.balon !== b) return; this._balonUstunde = false; if (this.balonGecici) this.gizlemeyiPlanla(); });
    b.addEventListener('mousedown', () => { if (this.balonGecici) { this.balonGecici = false; b.classList.remove('gecici'); } });
    if (odak) { const ta = b.querySelector('textarea.icerik'); if (ta && !ta.readOnly) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
  }

  balonYenile() {
    const b = this.balon; if (!b) return;
    const n = this.notlar.get(this.balonNotId); if (!n || n.silindi) { this.balonKapat(); return; }
    const renk = n.renk || (n.tur === 'FreeText' ? (n.yazi?.renk || '#888') : NOT_RENGI);
    // Yanıt eklenemez; dosyada (ör. Referans okuyucuda) yazılmış yanıtlar bilgi kaybolmasın diye salt okunur gösterilir
    const yanitlar = this.yanitlari(n);
    b.innerHTML = `
      <div class="ust" style="--not-renk:${kacis(renk)}">
        <span class="renk"></span>
        <span class="tur">${kacis(turAdi(n.tur))}</span>
        <span class="yazar">${kacis(n.yazar || '')}</span>
        <span class="esnek"></span>
        <span class="tarih">${kacis(tarihBicimle(n.degisim || n.olusturma))}</span>
        <button class="ikon kucuk sil" title="Notu sil (Delete)"><svg viewBox="0 0 20 20"><path d="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></button>
        <button class="ikon kucuk kapat" title="Kapat"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5"/></svg></button>
      </div>
      <textarea class="icerik" placeholder="Not yazın" ${n.kilitli ? 'readonly' : ''}>${kacis(n.icerik || '')}</textarea>
      ${yanitlar.length ? `<div class="yanitlar">${yanitlar.map((y) => `
        <div class="yanit">
          <div class="ust"><span class="yazar">${kacis(y.yazar || '')}</span><span class="esnek"></span><span class="tarih">${kacis(tarihBicimle(y.degisim || y.olusturma))}</span></div>
          <div class="metin">${kacis(y.icerik || '')}</div>
        </div>`).join('')}</div>` : ''}`;
    const ta = b.querySelector('textarea.icerik');
    let eskiDeger = ta.value;
    const kaydet = () => {
      if (this._canliIcerik?.id === n.id) this._canliIcerik = null;
      if (ta.value !== eskiDeger) { const yeni = ta.value; eskiDeger = yeni; this.guncelle(n, { icerik: yeni }, 'Not metnini düzenle'); }
    };
    ta.addEventListener('blur', kaydet);
    // Uzun not kaydırmadan okunsun: metin kutusu içeriğe göre uzar (stil.css'teki en az/en çok yükseklik arasında)
    const boyutla = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };
    boyutla();
    // Yazarken not simgesi hemen görünür/kaybolur (kayıt yine odaktan çıkınca tek komutla yapılır)
    ta.addEventListener('input', () => { this._canliIcerik = { id: n.id, metin: ta.value }; this.notSimgesiYenile(n); boyutla(); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ta.blur(); } e.stopPropagation(); });
    // Düğmeye basış metin kutusunun odağını almasın: odaktan çıkış kaydı balonu yeniden kurar, tıklama kaybolurdu
    for (const btn of b.querySelectorAll('.ust button')) btn.addEventListener('mousedown', (e) => e.preventDefault());
    b.querySelector('.sil').addEventListener('click', () => { if (document.activeElement === ta) ta.blur(); if (!n.silindi) this.sil(n); });
    b.querySelector('.kapat').addEventListener('click', () => this.balonKapat());
    b.addEventListener('keydown', (e) => e.stopPropagation());
  }

  /**
   * Balonu notun yanına koyar; notun kendisini (vurgunun hiçbir satırını, not simgesini) örtmeyen ve görünür alana sığan ilk yer seçilir.
   * Çapa: simgeden açılan balonda not simgesi; değilse notun ilk satırı (simge ona bitişikse ikisi birlikte). Sıra: çapanın sağı →
   * hemen altı → hemen üstü → notun bütün satırlarının altı → üstü → çapanın solu. Hiçbiri olmazsa sağda, alana kırpılarak.
   */
  balonKonumla() {
    const b = this.balon; if (!b) return;
    const n = this.notlar.get(this.balonNotId); if (!n) return;
    const i = n.sayfa - 1, s = this.g.sayfalar[i];
    if (!s || !s.pdfSayfa) return;
    const sayfaK = s.el.getBoundingClientRect(), alanK = this.alan.getBoundingClientRect();
    const ox = sayfaK.left - alanK.left, oy = sayfaK.top - alanK.top;
    const P = 8, genis = 300;
    b.style.width = genis + 'px';
    const yuk = b.offsetHeight || 200;
    const kutu = (r) => ({ l: ox + r.x, t: oy + r.y, r: ox + r.x + r.w, b: oy + r.y + r.h });
    let kutular, capa;
    if (ISARET.has(n.tur)) {
      const q = n.quadKutular || quadKutulari(n.quads);
      kutular = (q.length ? q : [n.rect]).map((x) => kutu(this.rectToPx(i, x)));
      capa = kutular[0];
      // Simge yoksa da yeri ayrılır: yazmaya başlayınca simge çıkınca balon kaymasın
      const el = s.notKatmani.querySelector(`.not-simge[data-id="${n.id}"]:not([hidden])`);
      const k = el ? { x: parseFloat(el.style.left), y: parseFloat(el.style.top), b: parseFloat(el.style.width) } : this.simgeKonumu(n, i);
      if (k) {
        const sk = { l: ox + k.x, t: oy + k.y, r: ox + k.x + k.b, b: oy + k.y + k.b };
        kutular.push(sk);
        const bitisik = sk.l <= capa.r + k.b * 1.5 && sk.r >= capa.l && Math.min(sk.b, capa.b) - Math.max(sk.t, capa.t) > -k.b;
        if (this._balonCapa === 'simge') capa = sk;
        else if (bitisik) capa = { l: Math.min(capa.l, sk.l), t: Math.min(capa.t, sk.t), r: Math.max(capa.r, sk.r), b: Math.max(capa.b, sk.b) };
      }
    } else {
      const r = this.rectToPx(i, n.rect);
      capa = kutu(n.tur === 'Text' ? { x: r.x, y: r.y, w: this.simgeBoyutu(), h: this.simgeBoyutu() } : r);
      kutular = [capa];
    }
    const ust = Math.min(...kutular.map((k) => k.t)), alt = Math.max(...kutular.map((k) => k.b));
    const W = alanK.width, H = alanK.height;
    const yatayKirp = (x) => Math.max(P, Math.min(W - genis - P, x));
    const dikeyKirp = (y) => Math.max(P, Math.min(H - yuk - P, y));
    const adaylar = [
      { x: capa.r + P, y: dikeyKirp(capa.t) },
      { x: yatayKirp(capa.r - genis), y: capa.b + 6 },
      { x: yatayKirp(capa.r - genis), y: capa.t - 6 - yuk },
      { x: yatayKirp(capa.r - genis), y: alt + 6 },
      { x: yatayKirp(capa.r - genis), y: ust - 6 - yuk },
      { x: capa.l - P - genis, y: dikeyKirp(capa.t) },
    ];
    const uygun = (a) => a.x >= P && a.x + genis <= W - P && a.y >= P && a.y + yuk <= H - P
      && !kutular.some((k) => Math.min(k.r, a.x + genis) > Math.max(k.l, a.x) && Math.min(k.b, a.y + yuk) > Math.max(k.t, a.y));
    const yer = adaylar.find(uygun) || { x: yatayKirp(capa.r + P), y: dikeyKirp(capa.t) };
    b.style.left = yer.x + 'px'; b.style.top = yer.y + 'px';
  }

  balonKapat() {
    const b = this.balon;
    clearTimeout(this._gizleZaman);
    this.gosterimIptal();
    // Odaktan çıkış notu kaydeder (guncelle → balonYenile); o sırada balon kapanmış/değişmiş olabilir
    if (b) { const ta = b.querySelector('textarea.icerik'); if (ta && document.activeElement === ta) ta.blur(); b.remove(); }
    if (this.balon === b) { this.balon = null; this.balonNotId = null; this.balonGecici = false; this._balonCapa = null; }
    this._balonUstunde = false;
    const canli = this._canliIcerik;
    if (canli) { this._canliIcerik = null; const n = this.notlar.get(canli.id); if (n) this.notSimgesiYenile(n); }
  }

  /** Yorumlar panelinden: nota git, seç ve balonu aç. */
  notaGit(id) {
    const n = this.notlar.get(id); if (!n) return;
    const kutu = ISARET.has(n.tur) ? ((n.quadKutular || quadKutulari(n.quads))[0] || n.rect) : n.rect;
    this.g.sayfayaGit(n.sayfa, { y: Math.max(0, kutu[1] - 60) });
    this.sec(id);
    setTimeout(() => this.balonAc(n, {}), 350);
  }

  // ------------------------------------------------------------ araçlar
  aracSec(arac) {
    // Metin seçiliyken Yapışkan not aracı (düğme ya da menü) seçimi notlu vurguya çevirir; araç açılmaz
    if (arac === 'not' && this.arac !== 'not' && this.secimKatmani() && this.secimeNotKoy()) return;
    this.arac = this.arac === arac ? null : arac;
    this.g.alan.classList.toggle('arac-not', this.arac === 'not');
    this.g.alan.classList.toggle('arac-yazi', this.arac === 'yazi');
    this.g.alan.classList.toggle('arac-vurgu', this.arac === 'vurgu');
    this.dispatchEvent(new CustomEvent('arac', { detail: { arac: this.arac } }));
  }

  yapiskanNotKoy(i, e) {
    if (!this.g.sayfalar[i] && e?.target) i = this.sayfaIdx(e.target);   // sayfa numarası geçersizse tıklanan sayfadan bul
    if (!this.vp(i)) return false;
    const sayfaEl = this.g.sayfalar[i].el;
    const k = sayfaEl.getBoundingClientRect();
    const [x, y] = this.pxToPdf(i, e.clientX - k.left, e.clientY - k.top);
    const a = this.ayar();
    const not = { tur: 'Text', sayfa: i + 1, rect: [x, y, x + 20, y + 20], icerik: '', yazar: a.yazarAdi, renk: NOT_RENGI, opaklik: 1, simge: 'Comment', konu: 'Yapışkan Not' };
    this.ekle(not);
    this.aracSec(null);
    this.sec(not.id);
    this.balonAc(not, { odak: true });
    return true;
  }

  /** Sayfa numarası (1 tabanlı) geçerli ve sayfa nesnesi yüklü mü (koordinat dönüşümü yapılabilir mi). */
  sayfaGecerli(sayfa) { return Number.isInteger(sayfa) && sayfa >= 1 && !!this.vp(sayfa - 1); }

  /** Metin seçiminden vurgu oluşturur (sayfa başına bir not). Geçersiz sayfalar atlanır; istisna fırlatmaz. */
  vurguUygula(renk) { return this.secimdenVurgular(renk).length > 0; }

  /**
   * Seçimdeki metnin üzerine sayfa başına bir vurgu ekler, eklenen notları (okuma sırasıyla) döndürür; seçim kaldırılır.
   * notlu: referans okuyucunun "Metinle ilgili yorum yap"ı gibi ilk sayfadaki vurgu not taşır (/IT /HighlightNote, konu METINLE_NOT_KONUSU).
   */
  secimdenVurgular(renk, { notlu = false } = {}) {
    let sayfalar;
    try { sayfalar = satirlaraBirlestir(secimDikdortgenleri()); } catch (e) { console.warn('Seçim okunamadı', e); return []; }
    const a = this.ayar();
    const eklenenler = [];
    for (const [sayfa, satirlar] of sayfalar) {
      if (!this.sayfaGecerli(sayfa) || !satirlar.length) continue;
      const i = sayfa - 1;
      try {
        const kutular = satirlar.map((l) => this.pxRectToPdf(i, l.x0, l.y, l.x1 - l.x0, l.h));
        const rect = [Math.min(...kutular.map((q) => q[0])), Math.min(...kutular.map((q) => q[1])), Math.max(...kutular.map((q) => q[2])), Math.max(...kutular.map((q) => q[3]))];
        const not = { tur: 'Highlight', sayfa, rect, quadKutular: kutular, quads: null, icerik: '', yazar: a.yazarAdi, renk, opaklik: a.vurguOpaklik ?? 0.4, konu: 'Vurgu' };
        if (notlu && !eklenenler.length) Object.assign(not, { konu: METINLE_NOT_KONUSU, it: 'HighlightNote' });
        this.ekle(not, notlu && !eklenenler.length ? 'Not ekle' : null);
        eklenenler.push(not);
      } catch (e) { console.warn('Vurgu eklenemedi', sayfa, e); }
    }
    if (!eklenenler.length) return eklenenler;
    window.getSelection()?.removeAllRanges();
    this.secimCubuguGizle();
    return eklenenler;
  }

  /**
   * Seçili metne not: seçim notlu vurguya dönüşür (ayrı yapışkan not simgesi konmaz) ve notun düzenleyicisi hemen açılır.
   * Seçim mini çubuğu, sağ tık "Not ekle" ve metin seçiliyken Yapışkan not aracı buraya gelir. Seçim yoksa false.
   */
  secimeNotKoy() {
    const a = this.ayar();
    const [not] = this.secimdenVurgular(a.vurguRengi || VURGU_RENKLERI[0].hex, { notlu: true });
    if (!not) return false;
    this.sec(not.id);
    this.balonAc(not, { odak: true });
    return true;
  }

  // ------------------------------------------------------------ seçim çubuğu
  cubuk() { return this.alan.querySelector('#secim-cubugu'); }

  /** Seçim bu belgenin bir metin katmanındaysa o katman, değilse null. */
  secimKatmani() {
    const sec = window.getSelection();
    if (!sec || sec.rangeCount === 0 || sec.isCollapsed) return null;
    for (const d of [sec.anchorNode, sec.focusNode]) {
      const k = (d?.nodeType === 1 ? d : d?.parentElement)?.closest('.textLayer');
      if (k && this.g.alan.contains(k)) return k;
    }
    return null;
  }

  /** Metin üzerine basıldı: çubuk bırakılana dek gizli; bırakınca (sayfa dışında bile) seçime göre güncellenir. */
  secimBaslat() {
    this.secimCubuguGizle();
    if (this._fareBekleniyor) return;
    this._fareBekleniyor = true;
    const bitti = () => {
      document.removeEventListener('pointerup', bitti, true); document.removeEventListener('pointercancel', bitti, true);
      this._fareBekleniyor = false;
      setTimeout(() => this.secimCubuguGuncelle(), 0);
    };
    document.addEventListener('pointerup', bitti, true); document.addEventListener('pointercancel', bitti, true);
  }

  /** Sayfa alanında metin dışına basıldı: seçimi kaldırır, çubuğu gizler. */
  secimTemizle() {
    const sec = window.getSelection();
    if (sec && sec.rangeCount && !sec.isCollapsed) sec.removeAllRanges();
    this.secimCubuguGizle();
  }

  /** Seçim bittiğinde: vurgu aracı açıksa uygular, değilse çubuğu açar ve seçimi izlemeye başlar. */
  secimCubuguGuncelle() {
    if (!this.cubuk()) return;
    if (!this.secimKatmani()) { this.secimCubuguGizle(); return; }
    if (this.arac === 'vurgu') { this.vurguUygula(this.ayar().vurguRengi || VURGU_RENKLERI[0].hex); return; }
    cubukSahibi = this; this._cubukOnbellek = null;
    this.secimCubuguKonumla();
  }

  /** Seçimin görünür metin kutuları (istemci px: l,t,r,b). Sayfa yerel kutular seçim değişene ya da yerleşim/çizim yenilenene dek önbellekte. */
  secimKutulari() {
    if (!this.secimKatmani()) { this._cubukOnbellek = null; return []; }
    const r = window.getSelection().getRangeAt(0);
    const anahtar = [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
    const kutu = (m, el) => { if (!m.has(el)) m.set(el, el.getBoundingClientRect()); return m.get(el); };
    let o = this._cubukOnbellek;
    if (!o || o.anahtar.some((v, k) => v !== anahtar[k])) {
      const m = new Map();
      o = this._cubukOnbellek = { anahtar, liste: secimMetinKutulari().map(({ sayfaEl, rect }) => { const k = kutu(m, sayfaEl); return { sayfaEl, x: rect.left - k.left, y: rect.top - k.top, w: rect.width, h: rect.height }; }) };
    }
    const m = new Map();
    return o.liste.filter((d) => d.sayfaEl.isConnected).map((d) => { const k = kutu(m, d.sayfaEl); return { l: k.left + d.x, t: k.top + d.y, r: k.left + d.x + d.w, b: k.top + d.y + d.h }; });
  }

  /**
   * Çubuğun tek konum hesabı: seçimin görünür metin kutularının birleşimi → yatayda ortası, dikeyde altının 8px altı
   * (yer yoksa üstü); görünür belge alanına kırpılır. Seçim yoksa ya da görünür alanın dışındaysa gizler (izleme sürer).
   */
  secimCubuguKonumla() {
    if (cubukSahibi !== this) return cubukSahibi ? cubukSahibi.secimCubuguKonumla() : false;   // başka sekmenin olayı: sahibi ölçer
    const cubuk = this.cubuk();
    if (!cubuk) return false;
    if (!this.secimKatmani()) { this.secimCubuguGizle(); return false; }   // seçim kalktı: izleme biter
    const P = 8;
    const kay = this.g.kaydirici;
    if (!kay.clientWidth || !kay.clientHeight) { cubuk.hidden = true; return false; }   // sahibin sekmesi gizli (ölçüm önbelleğe alınmaz)
    const kk = kay.getBoundingClientRect(), alanK = this.alan.getBoundingClientRect();
    const gl = kk.left, gt = kk.top, gr = kk.left + kay.clientWidth, gb = kk.top + kay.clientHeight;   // kaydırma çubukları hariç
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const d of this.secimKutulari()) {
      const x0 = Math.max(d.l, gl), x1 = Math.min(d.r, gr), y0 = Math.max(d.t, gt), y1 = Math.min(d.b, gb);
      if (x1 > x0 && y1 > y0) { l = Math.min(l, x0); r = Math.max(r, x1); t = Math.min(t, y0); b = Math.max(b, y1); }
    }
    if (!(r > l)) { cubuk.hidden = true; return false; }
    cubuk.hidden = false;
    const w = cubuk.offsetWidth, h = cubuk.offsetHeight;
    const sol = Math.max(0, gl - alanK.left), sag = Math.min(alanK.width, gr - alanK.left), ust = Math.max(0, gt - alanK.top), alt = Math.min(alanK.height, gb - alanK.top);
    let y = b - alanK.top + P;
    if (y + h > alt - P) y = t - alanK.top - h - P;                     // altta yer yok → üstüne
    y = Math.max(ust + P, Math.min(alt - h - P, y));
    const x = Math.max(sol + P, Math.min(sag - w - P, (l + r) / 2 - alanK.left - w / 2));
    cubuk.style.left = x + 'px'; cubuk.style.top = y + 'px';
    return true;
  }

  secimCubuguGizle() { cubukSahibi = null; this._cubukOnbellek = null; const c = this.cubuk(); if (c) c.hidden = true; }

  // ------------------------------------------------------------ yazı (FreeText)
  varsayilanYazi() {
    const a = this.ayar();
    return { tip: a.yaziTipi || 'Segoe UI', boyut: a.yaziBoyutu || 12, renk: a.yaziRengi || '#000000', arka: a.yaziArka || null, kalin: false, altiCizili: false, kenarlik: false };
  }

  yaziBaslat(i, e) {
    const sayfaEl = this.g.sayfalar[i].el;
    const k = sayfaEl.getBoundingClientRect();
    const px = e.clientX - k.left, py = e.clientY - k.top;
    const bas = { x: px, y: py };
    const kutu = document.createElement('div');
    kutu.className = 'yazi-cizim';
    kutu.style.cssText = `left:${px}px;top:${py}px;width:0;height:0`;
    sayfaEl.append(kutu);
    let cizildi = false;
    const hareket = (e2) => {
      const x2 = e2.clientX - k.left, y2 = e2.clientY - k.top;
      if (Math.hypot(x2 - bas.x, y2 - bas.y) > 6) cizildi = true;
      kutu.style.left = Math.min(bas.x, x2) + 'px'; kutu.style.top = Math.min(bas.y, y2) + 'px';
      kutu.style.width = Math.abs(x2 - bas.x) + 'px'; kutu.style.height = Math.abs(y2 - bas.y) + 'px';
    };
    const birak = (e2) => {
      document.removeEventListener('pointermove', hareket); document.removeEventListener('pointerup', birak);
      kutu.remove();
      const ptpx = this.ptPx();
      let x = px, y = py, w = 200 * ptpx, h = 44 * ptpx;
      if (cizildi) { x = parseFloat(kutu.style.left); y = parseFloat(kutu.style.top); w = Math.max(40 * ptpx, parseFloat(kutu.style.width)); h = Math.max(20 * ptpx, parseFloat(kutu.style.height)); }
      const rect = this.pxRectToPdf(i, x, y, w, h);
      const a = this.ayar();
      const not = { id: yeniId(), tur: 'FreeText', sayfa: i + 1, rect, icerik: '', yazar: a.yazarAdi, renk: null, opaklik: 1, yazi: this.varsayilanYazi(), yeni: true, silindi: false, yanitlar: [], ustId: null, konu: 'Yazı' };
      this.aracSec(null);
      this.duzenleyiciAc(not, true);
    };
    document.addEventListener('pointermove', hareket); document.addEventListener('pointerup', birak);
  }

  async yaziDuzenle(n) {
    if (n.kilitli) return;
    if (!n.yazi) {
      try { const r = await this.cekirdek('freetext_stil', { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa, xref: n.xref }); n.yazi = r.stil; if (!n.icerik) n.icerik = r.icerik; }
      catch { n.yazi = this.varsayilanYazi(); }
    }
    this.duzenleyiciAc(n, false);
  }

  duzenleyiciAc(n, yeniMi) {
    this.duzenleyiciBitir(true);
    this.balonKapat();
    const i = n.sayfa - 1;
    const sayfaEl = this.g.sayfalar[i].el;
    const r = this.rectToPx(i, n.rect);
    const ta = document.createElement('textarea');
    ta.className = 'yazi-duzenleyici';
    ta.value = n.icerik || '';
    ta.spellcheck = false;
    sayfaEl.append(ta);
    const bicim = document.createElement('div');
    bicim.className = 'yazi-bicim';
    this.alan.append(bicim);
    this.duzenleyici = { not: n, el: ta, bicim, yeniMi, eski: { icerik: n.icerik, yazi: structuredClone(n.yazi), rect: [...n.rect] }, yazi: structuredClone(n.yazi), rect: [...n.rect] };
    // Yerli çizimi gizle (düzenleyici üstte)
    for (const el of sayfaEl.querySelectorAll(`.not-oge[data-id="${n.id}"]`)) el.style.visibility = 'hidden';
    this.duzenleyiciBicimYenile();
    this.duzenleyiciKonumla();
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.duzenleyiciBitir(false); }
      // Kutu içeriğe göre büyür, kendi içinde kaymaz: PageUp/PageDown'u tarayıcı belgeyi kaydırmaya çevirip düzenleyiciyi görünümden çıkarmasın
      if (e.key === 'PageDown' || e.key === 'PageUp') e.preventDefault();
    });
    ta.addEventListener('input', () => this.duzenleyiciOtoBoyut());
    // Taşıma (kenar) ve boyutlandırma (sağ alt köşe) tutamaçları
    const tut = document.createElement('div'); tut.className = 'yazi-tutamac'; sayfaEl.append(tut);
    const bt = document.createElement('div'); bt.className = 'yazi-boyut'; sayfaEl.append(bt);
    this.duzenleyici.tut = tut; this.duzenleyici.bt = bt;
    this.duzenleyiciKonumla();
    const surukle = (hedefEl, boyutMu) => (e) => {
      e.preventDefault(); e.stopPropagation();
      const bas = { x: e.clientX, y: e.clientY, rect: [...this.duzenleyici.rect] };
      const hareket = (e2) => {
        const k = this.ptPx();
        const dx = (e2.clientX - bas.x) / k, dy = (e2.clientY - bas.y) / k;
        const rr = bas.rect;
        this.duzenleyici.rect = boyutMu ? [rr[0], rr[1], Math.max(rr[0] + 30, rr[2] + dx), Math.max(rr[1] + 14, rr[3] + dy)] : [rr[0] + dx, rr[1] + dy, rr[2] + dx, rr[3] + dy];
        this.duzenleyiciKonumla();
      };
      const birak = () => { document.removeEventListener('pointermove', hareket); document.removeEventListener('pointerup', birak); };
      document.addEventListener('pointermove', hareket); document.addEventListener('pointerup', birak);
    };
    tut.addEventListener('pointerdown', surukle(tut, false));
    bt.addEventListener('pointerdown', surukle(bt, true));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
  }

  duzenleyiciKonumla() {
    const d = this.duzenleyici; if (!d) return;
    const i = d.not.sayfa - 1;
    const r = this.rectToPx(i, d.rect);
    const k = this.ptPx();
    const y = d.yazi;
    Object.assign(d.el.style, {
      left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px',
      fontFamily: `'${y.tip}'`, fontSize: (y.boyut * k) + 'px', color: y.renk, background: y.arka || 'rgba(255,255,255,0.01)',
      fontWeight: y.kalin ? '700' : '400', textDecoration: y.altiCizili ? 'underline' : 'none',
      border: y.kenarlik ? `${Math.max(1, k)}px solid ${y.renk}` : `1px dashed var(--vurgu)`, padding: (2 * k) + 'px', lineHeight: '1.2',
    });
    if (d.tut) Object.assign(d.tut.style, { left: (r.x - 6) + 'px', top: (r.y - 6) + 'px' });
    if (d.bt) Object.assign(d.bt.style, { left: (r.x + r.w - 5) + 'px', top: (r.y + r.h - 5) + 'px' });
    // Biçim çubuğu: kutunun üstünde
    const sayfaK = this.g.sayfalar[i].el.getBoundingClientRect(), alanK = this.alan.getBoundingClientRect();
    let bx = sayfaK.left - alanK.left + r.x, by = sayfaK.top - alanK.top + r.y - d.bicim.offsetHeight - 8;
    if (by < 4) by = sayfaK.top - alanK.top + r.y + r.h + 8;
    bx = Math.max(4, Math.min(alanK.width - d.bicim.offsetWidth - 4, bx));
    d.bicim.style.left = bx + 'px'; d.bicim.style.top = by + 'px';
  }

  duzenleyiciOtoBoyut() {
    const d = this.duzenleyici; if (!d) return;
    const ta = d.el;
    if (ta.scrollHeight > ta.clientHeight + 1) {
      const k = this.ptPx();
      const ekle = (ta.scrollHeight - ta.clientHeight) / k + 2;
      d.rect = [d.rect[0], d.rect[1], d.rect[2], d.rect[3] + ekle];
      this.duzenleyiciKonumla();
    }
  }

  duzenleyiciBicimYenile() {
    const d = this.duzenleyici; if (!d) return;
    const y = d.yazi;
    d.bicim.innerHTML = `
      <select class="tip" title="Yazı tipi">${YAZI_TIPLERI.map((t) => `<option ${t === y.tip ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input class="boyut" type="number" min="6" max="72" step="1" value="${y.boyut}" title="Boyut (pt)">
      <label class="renk-etiket" title="Yazı rengi"><span class="ornek" style="background:${y.renk}"></span><input class="renk" type="color" value="${y.renk}"></label>
      <label class="renk-etiket" title="Arka plan"><span class="ornek arka" style="background:${y.arka || 'transparent'}"></span><input class="arka" type="color" value="${y.arka || '#ffffff'}"></label>
      <button class="ikon kucuk arka-yok ${y.arka ? '' : 'secili'}" title="Dolgusuz">∅</button>
      <button class="ikon kucuk kalin ${y.kalin ? 'secili' : ''}" title="Kalın"><b>K</b></button>
      <button class="ikon kucuk alti ${y.altiCizili ? 'secili' : ''}" title="Altı çizili"><u>A</u></button>
      <button class="ikon kucuk kenar ${y.kenarlik ? 'secili' : ''}" title="Kenarlık">▢</button>
      <span class="ayrac"></span>
      <button class="ikon kucuk tamam" title="Tamam (dışarı tıkla)"><svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>
      <button class="ikon kucuk iptal" title="Vazgeç (Esc)"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.6"/></svg></button>`;
    const b = d.bicim;
    const uygula = () => { this.duzenleyiciKonumla(); this.duzenleyiciBicimYenile(); d.el.focus(); };
    b.querySelector('.tip').addEventListener('change', (e) => { y.tip = e.target.value; uygula(); });
    b.querySelector('.boyut').addEventListener('change', (e) => { y.boyut = Math.max(6, Math.min(72, +e.target.value || 12)); uygula(); });
    b.querySelector('.renk').addEventListener('input', (e) => { y.renk = e.target.value; this.duzenleyiciKonumla(); b.querySelector('.ornek:not(.arka)').style.background = y.renk; });
    b.querySelector('.arka').addEventListener('input', (e) => { y.arka = e.target.value; this.duzenleyiciKonumla(); b.querySelector('.ornek.arka').style.background = y.arka; b.querySelector('.arka-yok').classList.remove('secili'); });
    b.querySelector('.arka-yok').addEventListener('click', () => { y.arka = null; uygula(); });
    b.querySelector('.kalin').addEventListener('click', () => { y.kalin = !y.kalin; uygula(); });
    b.querySelector('.alti').addEventListener('click', () => { y.altiCizili = !y.altiCizili; uygula(); });
    b.querySelector('.kenar').addEventListener('click', () => { y.kenarlik = !y.kenarlik; uygula(); });
    b.querySelector('.tamam').addEventListener('click', () => this.duzenleyiciBitir(true));
    b.querySelector('.iptal').addEventListener('click', () => this.duzenleyiciBitir(false));
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('keydown', (e) => e.stopPropagation());
  }

  duzenleyiciBitir(kaydet) {
    const d = this.duzenleyici; if (!d) return;
    this.duzenleyici = null;
    const n = d.not;
    const metin = d.el.value;
    d.el.remove(); d.bicim.remove(); d.tut?.remove(); d.bt?.remove();
    const sayfaEl = this.g.sayfalar[n.sayfa - 1].el;
    for (const el of sayfaEl.querySelectorAll(`.not-oge[data-id="${n.id}"]`)) el.style.visibility = '';
    if (!kaydet) { if (!d.yeniMi) this.cizSayfa(n.sayfa); return; }
    if (d.yeniMi) {
      if (!metin.trim()) return;                 // boş yazı eklenmez
      n.icerik = metin; n.yazi = d.yazi; n.rect = d.rect;
      this.ekle(n);
      this.sec(n.id);
      return;
    }
    const degisiklik = {};
    if (metin !== d.eski.icerik) degisiklik.icerik = metin;
    if (JSON.stringify(d.yazi) !== JSON.stringify(d.eski.yazi)) degisiklik.yazi = d.yazi;
    if (JSON.stringify(d.rect) !== JSON.stringify(d.eski.rect)) degisiklik.rect = d.rect;
    if (Object.keys(degisiklik).length) this.guncelle(n, degisiklik, 'Yazıyı düzenle');
    else this.cizSayfa(n.sayfa);
  }

  yokEt() { this.gosterimIptal(); this.balonKapat(); this.duzenleyiciBitir(false); if (cubukSahibi === this) this.secimCubuguGizle(); }
}

/** PyMuPDF vertices (8 nokta/quad: x,y çiftleri, 4 nokta bir quad) → satır kutuları [x0,y0,x1,y1] */
export function quadKutulari(quads) {
  if (!quads || !quads.length) return [];
  const sonuc = [];
  for (let k = 0; k + 3 < quads.length; k += 4) {
    const p = quads.slice(k, k + 4);
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    sonuc.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  return sonuc;
}
