// Notlar: okuma (başka programların notları dahil), çizim katmanı, etkileşim (seç/taşı/sil/düzenle),
// araçlar (not, vurgu, metinle ilgili not, yazı), açılır balon (yazar, tarih, içerik; var olan yanıtlar salt okunur),
// komut deseniyle geri al/yinele ve kaydetme farkı (diff).
import { CSS_BIRIM, yolAnahtari } from './goruntuleyici.js';
import { MAC, birincil } from './platform.js';
import { Komut } from './komutlar.js';
import { secimDikdortgenleri, secimMetinKutulari, satirlaraBirlestir, secimBaslangicSayfasi } from './metin.js';
import { turAdi, balonTurAdi, tarihBicimle } from './panel.js';
import {
  yaziKanonik, parcalariCiz, duzMetin, stilAl, stilKonumda, hepsindeMi, stilDegistir, metinDegistir, uzlastir, domdanOku, ofsetAl, secimAl, secimKoy,
  HIZA_CSS, sirala, sonBosluklariCizgisizYap, bicimAraligi,
} from './yaziParcalari.js';

// İlk renk PDF okuyucularında yaygın varsayılan vurgu rengi: /C [1 .819611 0]
export const VURGU_RENKLERI = [
  { ad: 'Sarı', hex: '#ffd100' }, { ad: 'Kırmızı', hex: '#ff6e6e' }, { ad: 'Turuncu', hex: '#ffb74d' },
  { ad: 'Yeşil', hex: '#7ee787' }, { ad: 'Mavi', hex: '#7cc4ff' }, { ad: 'Pembe', hex: '#ff9ad5' },
];
// macOS'ta (0.2.0) Segoe UI ve Calibri yok: çekirdek o ailelerle yazılmış notu Arial'le gömer (core/islemler/notlar.py _font_dosyasi);
// ekranda da Arial'le gösterilir (yaziTipiCss)
export const YAZI_TIPLERI = MAC ? ['Arial', 'Times New Roman'] : ['Segoe UI', 'Arial', 'Times New Roman', 'Calibri'];
const VARSAYILAN_YAZI_TIPI = MAC ? 'Arial' : 'Segoe UI';
/** Yazı notunun CSS yazı tipi: macOS'ta bilgisayarda olmayan aile (Windows'ta yazılmış not) kaydedildiğinde olduğu gibi Arial'le görünür. */
const yaziTipiCss = (tip) => (MAC && !YAZI_TIPLERI.includes(tip) ? `'${tip}', 'Arial'` : `'${tip}'`);
// Yazı kutusu dolgu paleti (biçim çubuğundaki Dolgu rengi düğmesi): Dolgusuz, bu renkler ve Diğer renk (Windows renk seçicisi)
const DOLGU_RENKLERI = [
  { ad: 'Beyaz', hex: '#ffffff' }, { ad: 'Açık sarı', hex: '#fff7c2' }, { ad: 'Sarı', hex: '#ffd100' }, { ad: 'Açık turuncu', hex: '#ffe0b2' },
  { ad: 'Açık kırmızı', hex: '#ffcdd2' }, { ad: 'Pembe', hex: '#f8bbd0' }, { ad: 'Lila', hex: '#d1c4e9' }, { ad: 'Açık yeşil', hex: '#c8e6c9' },
  { ad: 'Açık mavi', hex: '#b3e5fc' }, { ad: 'Açık gri', hex: '#e0e0e0' },
];
// Yazı düzenleyicisindeki geri al / yinele adımlarının adları (araç çubuğu Geri al / Yinele ipuçları, ör. "Geri al: Yazma")
const DUZENLEYICI_ADIMLARI = {
  yaz: 'Yazma', sil: 'Silme', kalin: 'Kalın', italik: 'İtalik', alti: 'Altı çizili', renk: 'Yazı rengi', arka: 'Dolgu rengi',
  tip: 'Yazı tipi', boyut: 'Boyut', dolgusuz: 'Dolgusuz', kenarlik: 'Kenarlık',
};
/** Yazı düzenleyicisinde ve not balonunda da belge düzeyinde işlenen Ctrl kısayolları (uygulama.js): sekme geçişi (Ctrl+PageUp/PageDown),
 *  yakınlaştırma (Ctrl++ / Ctrl+− / Ctrl+sayısal 0). Bunlar metin için anlam taşımaz; düzenleyici yutmaz, belgeye geçirir. */
const belgeKisayoluMu = (e) => birincil(e) && !e.altKey && (MAC || !e.metaKey) && (e.key === 'PageUp' || e.key === 'PageDown' || e.key === '+' || e.key === '='
  || e.key === '-' || e.key === '_' || e.code === 'NumpadAdd' || e.code === 'NumpadSubtract' || (e.code === 'Numpad0' && e.key === '0'));
const NOT_RENGI = '#ffd100';                        // not (Text) ve renksiz not için PDF okuyucularının yaygın varsayılanı
const METINLE_NOT_KONUSU = 'Metinle İlgili Yorum Yap';   // referans okuyucunun (Türkçe) notlu vurgu konusu; /IT /HighlightNote ile yazılır
const BALON_GOSTER_MS = 120;                        // üzerine gelince notun gösterilme gecikmesi
const BALON_GIZLE_MS = 250;                         // hedeften ve balondan çıkınca gizleme gecikmesi
const TASINABILIR = new Set(['Text', 'FreeText', 'Stamp', 'Square', 'Circle', 'Line', 'Ink', 'Polygon', 'PolyLine', 'FileAttachment', 'Caret']);
const ISARET = new Set(['Highlight', 'Underline', 'StrikeOut', 'Squiggly']);
// Çekirdeğin (not_ekle) yeniden oluşturabildiği türler: dosyadan kalkmış başka türde bir not (ör. kayıttan sonra silmesi geri alınan,
// başka programda eklenmiş bir damga) 'ekle' olarak gönderilirse kayıt bütünüyle hata verir; böyle not oturumda görünür ama dosyaya yazılamaz.
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
    this._hoverId = null;        // fare altındaki notun kimliği (vurgu, not simgesi, not)
    this._balonUstunde = false;  // fare balonun üzerinde
    this._canliIcerik = null;    // {id, metin}: balonda yazılan, henüz kaydedilmemiş not metni (not simgesi anında görünsün)
    this._kutuBekleyenler = new WeakSet(); // koyu sayfada görsel kutuları gelince notları yeniden çizmek için beklenen istekler
    this._balonCapa = null;      // 'simge': geçici balon not simgesinden açıldı (simgenin yanına konur); değilse notun kendisine
    this._ayrilanKutu = null;    // fare notun hangi parçasından çıktı (istemci kutusu): balona giden koridor bundan hesaplanır
    this._hoverSimgeden = false; // fare altındaki parça not simgesi mi
    this._surukle = null;
    this._fareBekleniyor = false; // metin üzerinde basıldı, bırakılması bekleniyor (seçim çubuğu)
    this._cubukOnbellek = null;   // {anahtar, liste}: seçimin sayfa yerel kutuları (kaydırmada yeniden ölçülmez)
    this.notCubugu = null;        // vurgu çubuğu (vurguya tıklayınca: renkler, not, kaldır); notCubuguId açık olduğu notun kimliği
    this.notCubuguId = null;
    this.yuklendi = false;

    this.g.addEventListener('sayfaCizildi', (e) => { this.cizSayfa(e.detail.sayfa); this._cubukOnbellek = null; this.secimCubuguKonumla(); });
    this.g.addEventListener('metinKatmani', () => { if (this.balon) this.balonKonumla(); });
    this.g.addEventListener('sayfalar', () => this.sayfalarDegisti());
    this.g.addEventListener('yerlesim', () => { this.hepsiniCiz(); this.balonKonumla(); this.duzenleyiciKonumla(); this._cubukOnbellek = null; this.secimCubuguKonumla(); this.notCubuguKonumla(); });
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
    this.g.kaydirici.addEventListener('scroll', () => { this.balonKonumla(); this.secimCubuguKonumla(); this.duzenleyiciCubukKonumla(); this.notCubuguKonumla(); }, { passive: true });
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
    if (n.tur === 'FreeText') d.yazi = n.yazi ? yaziKanonik(n.yazi, n.icerik) : n.yazi;   // parçalar içerikle uyumlu gider
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

  degisti() { this.notCubuguYenile(); this.dispatchEvent(new CustomEvent('degisti')); }

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

  /** Sayfanın ekrandaki açısı (0 / 90 / 180 / 270; /Rotate ve kaydedilmemiş döndürme dahil). */
  sayfaAcisi(i) { const vp = this.vp(i); return vp ? ((Math.round(vp.rotation / 90) * 90) % 360 + 360) % 360 : 0; }

  /**
   * Yazının ekrandaki eğimi (saat yönünde derece): sayfa açısından metin yönü (yazi.donus) çıkarılır. Referans okuyucu yazının görünümünü
   * dosyadaki gibi çizip sayfanın /Rotate'ini üstüne uygular: 0.1.1'in döndürülmüş sayfaya yazdığı (/Matrix'siz) yazı sayfayla
   * birlikte yan döner, sayfa sonradan döndürülünce yazı da onunla döner. Yeni yazı ekrandaki sayfa açısıyla (dik) oluşturulur.
   */
  yaziEgimi(i, yazi) { return ((this.sayfaAcisi(i) - (+yazi?.donus || 0)) % 360 + 360) % 360; }

  /** Yazı öğesini (yerli çizim ya da düzenleyici) sayfa içi px kutusu r'ye koyar: eğik yazıda öğe yazının kendi yönündeki boyutlarıyla
   *  kutunun ortasına yerleşip döndürülür (ekrandaki kutusu yine r). */
  yaziYerlestir(el, r, egim) {
    const yan = egim === 90 || egim === 270, w = yan ? r.h : r.w, h = yan ? r.w : r.h;
    Object.assign(el.style, { left: (r.x + (r.w - w) / 2) + 'px', top: (r.y + (r.h - h) / 2) + 'px', width: w + 'px', height: h + 'px', transform: egim ? `rotate(${egim}deg)` : '' });
  }

  // ------------------------------------------------------------ çizim
  hepsiniCiz() { for (const s of this.g.sayfalar) if (s.canvas) this.cizSayfa(s.no); }

  /**
   * Sayfanın not katmanını yeniden kurar. Sıra (alttan üste): vurgular, diğer metin işaretleri, not öğeleri, not simgeleri.
   * Vurgular referans okuyucudaki gibi çarpma (multiply) karışımıyla ayrı bir SVG'de çizilir: yazı siyah kalır, yalnızca beyaz zemin renklenir
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
      if (el && this.duzenleyici?.not === n) el.style.visibility = 'hidden';   // düzenlenen yazı yeniden çizimde (zoom) düzenleyicinin altında görünmesin
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

  /** Üzerine gelince balon açılır mı: not (Text) her zaman; diğerleri metni ya da yanıtı varsa (boş vurgu okurken balon açmasın). */
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
      const egim = this.yaziEgimi(i, n.yazi);
      if (egim) this.yaziYerlestir(el, r, egim);
      this.freeTextDoldur(el, n);
      return el;
    }
    if (n.ap && n.xref) { this.pixmapYukle(el, n, i); return el; }
    el.classList.add('not-bilinmeyen');
    el.innerHTML = `<span>${kacis(turAdi(n.tur))}</span>`;
    return el;
  }

  freeTextDoldur(el, n) {
    const y = yaziKanonik(n.yazi, n.icerik);
    const k = this.ptPx();
    el.classList.add('not-freetext-yerli');
    el.style.fontFamily = yaziTipiCss(y.tip);
    el.style.fontSize = (y.boyut * k) + 'px';
    el.style.lineHeight = '1.2';
    el.style.color = y.renk;
    el.style.background = y.arka || 'transparent';
    el.style.textAlign = HIZA_CSS[y.hiza] || 'left';
    el.style.border = y.kenarlik ? `${Math.max(1, k)}px solid ${y.kenarlikRengi || y.renk}` : 'none';
    el.style.padding = (2 * k) + 'px';
    parcalariCiz(el, y.parcalar);   // kalın / italik / altı çizili / renk karakter düzeyinde (parça başına span)
    queueMicrotask(() => sonBosluklariCizgisizYap(el));   // katmana eklendikten sonra (dizilim gerekir)
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
   * Notlu vurgu ailesi için küçük konuşma balonu simgesi (yalnızca PDEfe'de gösterilir, dosyaya yazılmaz). Konumu simgeKonumu: ilk
   * satırın bitişinde, üst simge gibi yukarıda. data-id taşır: üzerine gelince not gösterilir, tıklanınca düzenlemek için açılır.
   * Altındaki harflere binebildiği için simgenin çevresinde yarı saydam beyaz hale (ilk yol) çizilir.
   */
  notSimgesi(n, i, dolu = []) {
    const el = document.createElement('div');
    el.className = 'not-simge';
    el.dataset.id = n.id;
    el.setAttribute('aria-label', 'Not');
    el.style.setProperty('--not-renk', n.renk || NOT_RENGI);
    const yol = 'M2.5 4.2A2.2 2.2 0 0 1 4.7 2h10.6a2.2 2.2 0 0 1 2.2 2.2v7.6a2.2 2.2 0 0 1-2.2 2.2H9.2L5.4 17.6V14h-.7a2.2 2.2 0 0 1-2.2-2.2z';
    el.innerHTML = `<svg viewBox="1.5 1.5 17 17"><path class="hale" d="${yol}"/><path d="${yol}" fill="var(--not-renk)" stroke="#1f1f1f" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 6.6h8M6 9.6h5.5" stroke="#1f1f1f" stroke-width="1.5" stroke-linecap="round"/></svg>`;
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
   * Not simgesinin sayfa içi konumu {x, y, b} (px): üst simge (dipnot işareti) gibi vurgunun ilk satırının okuma yönündeki bitişinde,
   * ortası o satırın üst kenarında. Boyut satır kalınlığının yaklaşık üçte ikisidir (12–22 px); komşu harflere biraz binebilir (yarı saydam
   * beyaz hale okunur tutar, stil.css). Aynı sayfada önceden yerleştirilmiş bir simgeyle (dolu: {x, y, b} kutuları) çakışırsa okuma yönünde
   * ileri, sayfaya sığmazsa geri kaydırılır. Döndürülmüş sayfada okuma yönü viewport açısından alınır; simge dik kalır.
   */
  simgeKonumu(n, i, dolu = []) {
    const vp = this.vp(i), s = this.g.sayfalar[i];
    if (!vp || !s) return null;
    const W = s.el.clientWidth || vp.width, H = s.el.clientHeight || vp.height;
    const aci = ((Math.round(vp.rotation / 90) * 90) % 360 + 360) % 360;
    // Yerel eksenler: u okuma yönünde, v sonraki satıra doğru artar. yerel: sayfa kutusu → {u0,u1,v0,v1}; sayfaya: yerel simge (u,v,b) → sol üst köşe
    const yerel = (x0, y0, x1, y1) => aci === 0 ? { u0: x0, u1: x1, v0: y0, v1: y1 } : aci === 90 ? { u0: y0, u1: y1, v0: -x1, v1: -x0 }
      : aci === 180 ? { u0: -x1, u1: -x0, v0: -y1, v1: -y0 } : { u0: -y1, u1: -y0, v0: x0, v1: x1 };
    const sayfaya = (u, v, b) => aci === 0 ? { x: u, y: v } : aci === 90 ? { x: -v - b, y: u } : aci === 180 ? { x: -u - b, y: -v - b } : { x: v, y: -u - b };
    const kutular = n.quadKutular || quadKutulari(n.quads);
    const satirlar = (kutular.length ? kutular : [n.rect]).map((q) => { const r = this.rectToPx(i, q); return yerel(r.x, r.y, r.x + r.w, r.y + r.h); });
    // İlk satır: okuma sırasında en üstteki kutu; aynı satırdaki öteki parçaları da (satır birden çok kutudan oluşabilir) bitişe katılır
    const ilk = satirlar.reduce((a, q) => (q.v0 + q.v1 < a.v0 + a.v1 ? q : a));
    const kalinlik = ilk.v1 - ilk.v0;
    const ayni = satirlar.filter((q) => Math.min(q.v1, ilk.v1) - Math.max(q.v0, ilk.v0) >= 0.5 * Math.min(q.v1 - q.v0, kalinlik));
    const u1 = Math.max(...ayni.map((q) => q.u1)), v0 = Math.min(...ayni.map((q) => q.v0));
    const b = Math.round(Math.max(12, Math.min(22, kalinlik * 0.65)));
    const aday = (u) => { const p = sayfaya(u, v0 - b / 2, b); return { x: Math.max(0, Math.min(W - b, p.x)), y: Math.max(0, Math.min(H - b, p.y)), b }; };
    const carpisir = (k) => dolu.some((d) => Math.min(k.x + k.b, d.x + d.b) - Math.max(k.x, d.x) > 1 && Math.min(k.y + k.b, d.y + d.b) - Math.max(k.y, d.y) > 1);
    const bas = u1 - b * 0.15;   // vurgunun ucuna hafifçe değer: hangi vurguya ait olduğu görünsün
    for (const yon of [1, -1]) {
      for (let kay = yon > 0 ? 0 : 1; kay < 8; kay++) { const k = aday(bas + yon * kay * (b + 2)); if (!carpisir(k)) return k; }
    }
    return aday(bas);
  }

  seciliIsaretle() {
    for (const el of this.g.alan.querySelectorAll('.not-secili')) el.classList.remove('not-secili');
    if (!this.secili) return;
    for (const el of this.g.alan.querySelectorAll(`[data-id="${this.secili}"]`)) el.classList.add('not-secili');
  }

  sec(id) {
    if (this.notCubuguId && this.notCubuguId !== id) this.notCubuguKapat();
    this.secili = id;
    this.seciliIsaretle();
    this.dispatchEvent(new CustomEvent('secim', { detail: { id } }));
  }

  // ------------------------------------------------------------ komutlar
  // Not komutları üç kurucuyla kurulur (ekleKomutu / silKomutu / guncelleKomutu) ve tariflerini (tanim) taşır: sekme başka pencereye
  // taşınınca (0.1.19) geri al yığını oradaki tariflerden aynı kurucularla yeniden kurulur (komutDisari / komutIceri); komutun
  // kapattığı bütün değerler bu yüzden tarifte durur.
  komutKur(ad, uygula, geriAl, tanim) {
    return new Komut(ad, () => { uygula(); this.degisti(); }, () => { geriAl(); this.degisti(); }, tanim);
  }

  ekleKomutu(not, ad) {
    // Yinele: eklenip kaydedilen, geri alınıp (silinerek) yeniden kaydedilen not modelden çıkmıştır; geri konur ve yeniden eklenir.
    // Kayıtlıyken geri alınırsa silindi işaretlenir, sonraki kayıtta 'sil' yazılır.
    return this.komutKur(ad,
      () => { this.modeleGeriKoy(not); this.cizSayfa(not.sayfa); },
      () => { not.silindi = true; if (this.secili === not.id) this.sec(null); this.balonKapat(); this.cizSayfa(not.sayfa); },
      { tur: 'not.ekle', not });
  }

  ekle(not, ad = null) {
    not.id = not.id || yeniId(); not.yeni = true; not.silindi = false; not.yanitlar = not.yanitlar || []; not.ustId = not.ustId || null;
    if (!not.kaynak) { const s = this.g.sayfalar[not.sayfa - 1]; if (s) { not.kaynak = s.bos ? { bos: true } : { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa }; not.kaynakGirdi = s; } }
    not.olusturma = not.olusturma || simdiPdfTarih(); not.degisim = not.olusturma;
    this.yigin.calistir(this.ekleKomutu(not, ad || `${turAdi(not.tur)} ekle`));
    return not;
  }

  silKomutu(not, yanitlar, ad) {
    // Geri al: kayıt silinen notu ve yanıtlarını modelden çıkarmış olabilir; modele geri konur (dosyada yoksa sonraki kayıtta eklenir)
    return this.komutKur(ad,
      () => { not.silindi = true; for (const y of yanitlar) y.silindi = true; if (this.secili === not.id) this.sec(null); this.balonKapat(); this.cizSayfa(not.sayfa); },
      () => {
        // Kayıt notu dosyadan silmiş ve çekirdek bu türü yeniden oluşturamıyorsa (EKLENEBILIR dışı: ek, damga, şekil) geri konmaz: ekranda
        // görünür ama kayıtta yazılmaz, belge temiz sayılırdı. Yanıtlar da konmaz (üstsüz kalıp bağımsız not olarak yazılırlardı).
        if (!this.kayitli.has(not.id) && !EKLENEBILIR.has(not.tur)) {
          this.dispatchEvent(new CustomEvent('uyari', { detail: { metin: `${turAdi(not.tur)} kaydedilirken dosyadan silindi; bu tür not dosyaya geri yazılamadığı için silme geri alınamaz.` } }));
          return;
        }
        this.modeleGeriKoy(not); for (const y of yanitlar) this.modeleGeriKoy(y); this.cizSayfa(not.sayfa);
      },
      { tur: 'not.sil', not, yanitlar });
  }

  sil(not) { this.yigin.calistir(this.silKomutu(not, this.yanitlari(not), `${turAdi(not.tur)} sil`)); }

  /**
   * v: { yeni, eski, eskiSayfa, kayitliIlk, dosyaEski, degisim }. eski: değişen alanların önceki değerleri ve değişim tarihi (geri
   * alınınca tarih de döner; yoksa anlık farkı belgeyi kirli bırakır). kayitliIlk: komut kurulurken notun dosyadaki durumu. degisim:
   * ilk uygulamadaki tarih (yinelemede aynısı yazılır: kaydedilmiş duruma dönülünce belge temiz görünür).
   * dosyaEski: eski değerlerin açık hâli, eski değer dosyadan okunan (modelde olmayan) bir şeyse (ör. başka programda yazılmış yazının biçimi: n.yazi
   * yok, çekirdek kayıtta dosyadan okur). Komuttan sonra not kaydedildiyse geri alma bunları yazar: dosyada artık düzenlenmiş
   * biçim durduğundan eski (boş) değer kaydı ve ekranı geri getirmezdi. Kayıt olmadıysa eski (boş) değer döner, belge temiz kalır.
   */
  guncelleKomutu(not, v, ad) {
    return this.komutKur(ad,
      () => { Object.assign(not, structuredClone(v.yeni)); not.degisim = v.degisim ||= simdiPdfTarih(); this.pixmapOnbellek.clear(); this.cizSayfa(not.sayfa); if (this.balonNotId === not.id) this.balonYenile(); },
      () => {
        const deger = v.dosyaEski && this.kayitli.get(not.id) !== v.kayitliIlk ? { ...v.eski, ...v.dosyaEski } : v.eski;
        Object.assign(not, structuredClone(deger)); this.pixmapOnbellek.clear(); this.cizSayfa(v.eskiSayfa); if (this.balonNotId === not.id) this.balonYenile();
      },
      { tur: 'not.guncelle', not, v });
  }

  guncelle(not, yeni, ad = null, dosyaEski = null) {
    const eski = { degisim: not.degisim };
    for (const k of Object.keys(yeni)) eski[k] = structuredClone(not[k]);
    this.yigin.calistir(this.guncelleKomutu(not, { yeni, eski, eskiSayfa: not.sayfa, kayitliIlk: this.kayitli.get(not.id), dosyaEski, degisim: null }, ad || `${turAdi(not.tur)} düzenle`));
  }

  // ------------------------------------------------------------ sekmenin başka pencereye taşınması (0.1.19)
  /** Not komutunun taşınabilen tarifi (not nesneleri yerine kimlikler); not komutu değilse null. */
  komutDisari(k) {
    const t = k.tanim;
    if (t?.tur === 'not.ekle') return { tur: t.tur, ad: k.ad, not: t.not.id };
    if (t?.tur === 'not.sil') return { tur: t.tur, ad: k.ad, not: t.not.id, yanitlar: t.yanitlar.map((y) => y.id) };
    if (t?.tur === 'not.guncelle') return { tur: t.tur, ad: k.ad, not: t.not.id, v: t.v };
    return null;
  }

  /** Komutun tuttuğu notlar: kayıtta modelden çıkmış olsalar da taşınan pakete girerler (durumAl ekNotlar). */
  komutNotlari(k) { const t = k.tanim; return typeof t?.tur === 'string' && t.tur.startsWith('not.') ? [t.not, ...(t.yanitlar || [])] : []; }

  /** Taşınan tariften komutu kurar (çalıştırmaz). notBul: kimlik → taşınan not (durumdanYukle'nin döndürdüğü). Tarif eksikse null. */
  komutIceri(veri, notBul) {
    const not = notBul(veri?.not);
    if (!not) return null;
    if (veri.tur === 'not.ekle') return this.ekleKomutu(not, veri.ad);
    if (veri.tur === 'not.sil') { const yanitlar = (veri.yanitlar || []).map(notBul); return yanitlar.every(Boolean) ? this.silKomutu(not, yanitlar, veri.ad) : null; }
    if (veri.tur === 'not.guncelle') return veri.v && veri.v.yeni && veri.v.eski ? this.guncelleKomutu(not, veri.v, veri.ad) : null;
    return null;
  }

  /**
   * Not modelinin tamamı: notlar (modeldeki sırasıyla), dosyadaki durumun anlık görüntüleri (kayitli), yüklenmiş kaynaklar ve modelden
   * çıkmış ama geri al yığınında duran notlar (ekNotlar: yığındaki komutların notları). girdiNo: sayfa girdisi → taşınan numarası
   * (kaynakGirdi nesnesi taşınamaz). Açık balon ve yazı düzenlemesi çağrıdan önce kapatılmış olmalıdır.
   */
  durumAl(girdiNo, ekNotlar = []) {
    const disari = (n) => { const { kaynakGirdi, ...gerisi } = n; return kaynakGirdi ? { ...gerisi, kaynakGirdi: girdiNo(kaynakGirdi) } : gerisi; };
    const modelde = new Set(this.notlar.values()), cikanlar = new Set();
    for (const r of this._cikanlar) { const n = r.deref(); if (n && !modelde.has(n)) cikanlar.add(n); }
    for (const n of ekNotlar) if (n && !modelde.has(n)) cikanlar.add(n);
    return {
      notlar: [...this.notlar.values()].map(disari),
      cikanlar: [...cikanlar].map(disari),
      kayitli: [...this.kayitli],
      yuklenenKaynaklar: [...(this.yuklenenKaynaklar || [])],
    };
  }

  /** Taşınan not modelini kurar (dosyadan okumaz). girdiAl: taşınan numara → bu penceredeki sayfa girdisi. Döner: kimlik → not. */
  durumdanYukle(durum, girdiAl) {
    const iceri = (v) => {
      const n = { ...v };
      if (v.kaynakGirdi != null) { const s = girdiAl(v.kaynakGirdi); if (s) n.kaynakGirdi = s; else delete n.kaynakGirdi; }
      return n;
    };
    const hepsi = new Map();
    this.notlar.clear(); this._cikanlar.clear();
    for (const v of durum.notlar || []) { const n = iceri(v); this.notlar.set(n.id, n); hepsi.set(n.id, n); }
    for (const v of durum.cikanlar || []) { const n = iceri(v); this._cikanlar.add(new WeakRef(n)); hepsi.set(n.id, n); }
    this.kayitli = new Map(durum.kayitli || []);
    this.yuklenenKaynaklar = new Set(durum.yuklenenKaynaklar || []);
    this.pixmapOnbellek.clear();
    this.sayfalarDegisti(false);
    this.yuklendi = true;
    this.hepsiniCiz();
    this.dispatchEvent(new CustomEvent('yuklendi'));
    return (id) => hepsi.get(id) || null;
  }

  silSecili() {
    if (!this.secili) return false;
    const n = this.notlar.get(this.secili);
    if (!n) return false;
    // Açık yazı düzenlemesi önce uygulanır (odak düzenleyicide değilken Delete ya da menüden sil): silinen nota sonradan yazılan
    // düzenleme, silme geri alınınca da gelmezdi
    this.duzenleyiciBitir(true);
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
    // macOS'ta Ctrl+tık sağ tıktır: Chromium onu sol tık (button 0, ctrlKey) olarak iletip ardından sağ tık menüsünü açar. Sol tık gibi
    // işlenince not eklenip menü de açılıyor, vurgu çubuğu ya da sürükleme başlıyordu (0.2.1); Windows'taki sağ tık gibi yalnızca menü
    if (e.button !== 0 || (MAC && e.ctrlKey)) return;
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
    if (this.arac === 'not' && !hedef && i >= 0) { e.preventDefault(); this.sayfayaNotKoy(i, e); return; }
    if (this.arac === 'yazi' && !hedef && i >= 0) { e.preventDefault(); this.yaziBaslat(i, e); return; }
    if (hedef) {
      const id = hedef.dataset.id;
      const n = this.notlar.get(id);
      if (!n) return;
      this.sec(id);
      e.preventDefault();
      // Not simgesine tıklama: notu düzenlemek için açar (geçici balon kalıcı olur, metin kutusuna odaklanılır)
      if (hedef.classList.contains('not-simge')) { this.gosterimIptal(); this.balonAc(n, { odak: !n.kilitli, capa: 'simge' }); return; }
      // Vurgu ailesine tıklama: vurgu çubuğu (renk, not, kaldır)
      if (ISARET.has(n.tur)) { this.notCubuguAc(n); return; }
      if (TASINABILIR.has(n.tur) && !n.kilitli) this.surukleBaslat(n, hedef, e);
      return;
    }
    this.notCubuguKapat();
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
    if (n.tur === 'FreeText') this.yaziDuzenle(n, { x: e.clientX, y: e.clientY });
    else this.balonAc(n, { odak: true });
  }

  /**
   * Üzerine gelince hızlı gösterim: notun hedefine (vurgu, not simgesi, not) girince BALON_GOSTER_MS sonra geçici balon açılır.
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
    if (this.notCubuguId === id) return;   // vurgu çubuğu açık: notu çubuktaki düğme açar, balon çubuğun üstüne gelmesin
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
    this.duzenleyiciBitir(true);   // açık yazı düzenlemesi uygulanır (balondan aynı yazı silinebilir ya da metni değiştirilebilirdi)
    if (!gecici || n.id === this.notCubuguId) this.notCubuguKapat();
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
    // Yanıt eklenemez; dosyadaki (başka bir programda yazılmış) yanıtlar bilgi kaybolmasın diye salt okunur gösterilir
    const yanitlar = this.yanitlari(n);
    // Başlık "Not | Yazar | tarih" (0.1.14, kullanıcı isteği; önceden "Not: Yazar" ve sağa yaslı tarih): parçalar ince dikey çizgiyle
    // ayrılır, tarih yazarın hemen yanında, düğmeler sağda. Boş parça (yazarsız ya da tarihsiz not) ve çizgisi yazılmaz. Yanıtlarda da.
    // Yer darsa yazar üç noktayla kısalır; tam adı ipucunda.
    const basligi = (parcalar) => parcalar.filter(([, metin]) => metin)
      .map(([sinif, metin]) => `<span class="${sinif}"${sinif === 'yazar' ? ` title="${kacis(metin)}"` : ''}>${kacis(metin)}</span>`)
      .join('<span class="ayrac" aria-hidden="true"></span>');
    b.innerHTML = `
      <div class="ust" style="--not-renk:${kacis(renk)}">
        <span class="renk"></span>
        ${basligi([['tur', balonTurAdi(n)], ['yazar', n.yazar], ['tarih', tarihBicimle(n.degisim || n.olusturma)]])}
        <span class="esnek"></span>
        <button class="ikon kucuk sil" title="Notu sil (Delete)"><svg viewBox="0 0 20 20"><path d="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></button>
        <button class="ikon kucuk kapat" title="Kapat"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5"/></svg></button>
      </div>
      <textarea class="icerik" placeholder="Not yazın" ${n.kilitli ? 'readonly' : ''}>${kacis(n.icerik || '')}</textarea>
      ${yanitlar.length ? `<div class="yanitlar">${yanitlar.map((y) => `
        <div class="yanit">
          <div class="ust">${basligi([['yazar', y.yazar], ['tarih', tarihBicimle(y.degisim || y.olusturma)]])}</div>
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
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ta.blur(); } if (!belgeKisayoluMu(e)) e.stopPropagation(); });
    // Düğmeye basış metin kutusunun odağını almasın: odaktan çıkış kaydı balonu yeniden kurar, tıklama kaybolurdu
    for (const btn of b.querySelectorAll('.ust button')) btn.addEventListener('mousedown', (e) => e.preventDefault());
    b.querySelector('.sil').addEventListener('click', () => { if (document.activeElement === ta) ta.blur(); if (!n.silindi) this.sil(n); });
    b.querySelector('.kapat').addEventListener('click', () => this.balonKapat());
    b.addEventListener('keydown', (e) => { if (!belgeKisayoluMu(e)) e.stopPropagation(); });
  }

  /**
   * Balonu notun yanına koyar; notun kendisini (vurgunun hiçbir satırını, not simgesini) örtmeyen ve görünür alana sığan ilk yer seçilir.
   * Çapa: simgeden açılan balonda not simgesi; değilse notun ilk satırı (simge ona bitişikse ikisi birlikte). Sıra: çapanın sağı →
   * hemen altı → hemen üstü → notun bütün satırlarının altı → üstü (bu dördü önce çapanın sağına, sonra soluna hizalı) → sayfanın
   * sağ kenarının dışı → çapanın solu. Önce komşu sayfalar dahil başka notları da (vurgu, simge, not, yazı) örtmeyen ilk yer
   * aranır (bunda sayfa kenarından önce, yakındaki başka notun hemen altı/üstü de denenir); yoksa yalnızca kendi notunu örtmeyen ilk
   * yer. Hiçbiri olmazsa sağda, alana kırpılarak.
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
    const sagHiza = yatayKirp(capa.r - genis), solHiza = yatayKirp(capa.l);
    const yakin = [
      { x: capa.r + P, y: dikeyKirp(capa.t) },
      { x: sagHiza, y: capa.b + 6 }, { x: sagHiza, y: capa.t - 6 - yuk }, { x: sagHiza, y: alt + 6 }, { x: sagHiza, y: ust - 6 - yuk },
      { x: solHiza, y: capa.b + 6 }, { x: solHiza, y: capa.t - 6 - yuk }, { x: solHiza, y: alt + 6 }, { x: solHiza, y: ust - 6 - yuk },
    ];
    const uzak = [{ x: ox + sayfaK.width + P, y: dikeyKirp(capa.t) }, { x: capa.l - P - genis, y: dikeyKirp(capa.t) }];
    const ortmez = (a, liste) => !liste.some((k) => Math.min(k.r, a.x + genis) > Math.max(k.l, a.x) && Math.min(k.b, a.y + yuk) > Math.max(k.t, a.y));
    const uygun = (a) => a.x >= P && a.x + genis <= W - P && a.y >= P && a.y + yuk <= H - P && ortmez(a, kutular);
    // Başka notların parçaları (bu sayfa ve komşuları; koyu sayfadaki ikinci vurgu kopyası da aynı kutuları verir)
    const digerleri = [];
    for (const j of [i - 1, i, i + 1]) {
      const katman = this.g.sayfalar[j]?.notKatmani;
      if (!katman) continue;
      for (const el of katman.querySelectorAll('[data-id]')) {
        if (el.dataset.id === n.id || el.hidden) continue;
        for (const p of el instanceof SVGGElement ? el.querySelectorAll('rect, path') : [el]) {
          const k = p.getBoundingClientRect();
          if (k.width || k.height) digerleri.push({ l: k.left - alanK.left, t: k.top - alanK.top, r: k.right - alanK.left, b: k.bottom - alanK.top });
        }
      }
    }
    // Hemen altı/üstü başka notu örtüyorsa o notun altına/üstüne kaydırılmış yerler (notun yakınında kalsın diye en çok KAYMA px)
    const KAYMA = 80, kaymali = [];
    for (const k of digerleri) {
      if (k.b > alt && k.b - alt <= KAYMA) kaymali.push({ x: sagHiza, y: k.b + 6, d: k.b - alt }, { x: solHiza, y: k.b + 6, d: k.b - alt });
      if (k.t < ust && ust - k.t <= KAYMA) kaymali.push({ x: sagHiza, y: k.t - 6 - yuk, d: ust - k.t }, { x: solHiza, y: k.t - 6 - yuk, d: ust - k.t });
    }
    kaymali.sort((p, q) => p.d - q.d);
    const yer = [...yakin, ...kaymali, ...uzak].find((a) => uygun(a) && ortmez(a, digerleri)) || [...yakin, ...uzak].find(uygun)
      || { x: yatayKirp(capa.r + P), y: dikeyKirp(capa.t) };
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
    this.notCubuguKapat();
    // Metin seçiliyken Not aracı (düğme ya da menü) seçimi notlu vurguya çevirir; araç açılmaz
    if (arac === 'not' && this.arac !== 'not' && this.secimKatmani() && this.secimeNotKoy()) return;
    this.arac = this.arac === arac ? null : arac;
    this.g.alan.classList.toggle('arac-not', this.arac === 'not');
    this.g.alan.classList.toggle('arac-yazi', this.arac === 'yazi');
    this.g.alan.classList.toggle('arac-vurgu', this.arac === 'vurgu');
    this.dispatchEvent(new CustomEvent('arac', { detail: { arac: this.arac } }));
  }

  /** Sayfaya not (Text) koyar ve balonunu yazmaya açar: Not aracıyla tıklama, sağ tık › Not ekle (seçim yokken). */
  sayfayaNotKoy(i, e) {
    if (!this.g.sayfalar[i] && e?.target) i = this.sayfaIdx(e.target);   // sayfa numarası geçersizse tıklanan sayfadan bul
    if (!this.vp(i)) return false;
    const sayfaEl = this.g.sayfalar[i].el;
    const k = sayfaEl.getBoundingClientRect();
    const [x, y] = this.pxToPdf(i, e.clientX - k.left, e.clientY - k.top);
    const a = this.ayar();
    const not = { tur: 'Text', sayfa: i + 1, rect: [x, y, x + 20, y + 20], icerik: '', yazar: a.yazarAdi, renk: NOT_RENGI, opaklik: 1, simge: 'Comment', konu: 'Not' };
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
   * Seçili metne not: seçim notlu vurguya dönüşür (ayrı not simgesi konmaz) ve notun düzenleyicisi hemen açılır.
   * Seçim mini çubuğu, sağ tık "Not ekle" ve metin seçiliyken Not aracı buraya gelir. Seçim yoksa false.
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
    // ▾ ile açılan renk sütunu çubuğun dışında durur (stil.css), çubuğun boyutunu ve yerini değiştirmez
    const ustte = y + h > alt - P;
    if (ustte) y = t - alanK.top - h - P;                               // altta yer yok → seçimin üstüne
    cubuk.classList.toggle('ustte', ustte);
    y = Math.max(ust + P, Math.min(alt - h - P, y));
    const x = Math.max(sol + P, Math.min(sag - w - P, (l + r) / 2 - alanK.left - w / 2));
    cubuk.style.left = x + 'px'; cubuk.style.top = y + 'px';
    // Renk sütunu: çubuk seçimin altındaysa aşağı, üstündeyse yukarı açılır (seçili metni örtmesin); o yönde görünür alanda yer yoksa öteki yöne
    const renkler = cubuk.classList.contains('renkler-acik') ? cubuk.querySelector('.secim-renkler') : null;
    if (renkler) {
      const rh = renkler.offsetHeight + 6;
      const asagiSigar = y + h + rh <= alt, yukariSigar = y - rh >= ust;
      const yukari = !asagiSigar && !yukariSigar ? y - ust > alt - (y + h) : ustte ? yukariSigar : !asagiSigar;
      cubuk.classList.toggle('renkler-yukari', yukari);
    } else cubuk.classList.remove('renkler-yukari');
    return true;
  }

  secimCubuguGizle() {
    cubukSahibi = null; this._cubukOnbellek = null;
    const c = this.cubuk();
    if (!c) return;
    c.hidden = true;
    // ▾ ile açılan renk sütunu (uygulama.js secimCubuguYenile) çubuk bir sonraki seçimde kapalı açılsın
    c.classList.remove('renkler-acik', 'renkler-yukari');
    c.querySelector('.renk-ac')?.setAttribute('aria-expanded', 'false');
  }

  // ------------------------------------------------------------ vurgu çubuğu
  /**
   * Vurgu ailesinden bir nota (vurgu, altı / üstü çizili, dalgalı; başka programlarda eklenenler dahil) tıklanınca altında açılan çubuk: renkler
   * (seçim çubuğundakiler; varsayılan vurgu rengini değiştirmez), Not ekle / Notu düzenle, Kaldır. Seçim çubuğu gibi görünür alana
   * kırpılır, kaydırmada ve yakınlaştırmada notu izler, not görünümden çıkınca gizlenir. Başka yere basış, Esc, araç seçimi, sekme
   * değişimi, notun silinmesi ya da kalıcı balonun açılması kapatır. Renk değişince açık kalır; değişiklik geri alınabilir.
   */
  notCubuguAc(n) {
    if (!n || !ISARET.has(n.tur)) return;
    let c = this.notCubugu;
    if (!c) {
      c = this.notCubugu = document.createElement('div');
      c.className = 'not-cubugu';
      c.setAttribute('role', 'toolbar');
      c.hidden = true;
      // Basış odağı ve metin seçimini değiştirmesin, belge (pointerDown) başka yere basıldı sanmasın
      c.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      c.addEventListener('pointerdown', (e) => e.stopPropagation());
      c.addEventListener('click', (e) => this.notCubuguTikla(e));
      this.alan.append(c);
    }
    // Açık balon (üzerine gelince açılan geçici ya da Not ekle'yle açılmış kalıcı) çubuğu örtmesin: kapanır, yazılan not odaktan çıkışta
    // kaydedilir; Notu düzenle yeniden açar. Balon açılınca da çubuk kapanır (notCubuguTikla): ikisi aynı anda açık olmaz (0.1.13: kalıcı
    // balon açıkken vurguya yeniden tıklanınca çubuk balonun altında kalıyor, Kaldır'a basılamıyordu)
    if (this.balon) this.balonKapat();
    this.gosterimIptal();
    this.notCubuguId = n.id;
    this.notCubuguCiz();
    this.notCubuguKonumla();
  }

  notCubuguKapat() {
    this.notCubuguId = null;
    if (this.notCubugu) this.notCubugu.hidden = true;
  }

  /** Not değişince (renk, geri al / yinele): çubuk kendi notunu yeniden gösterir; not silindiyse kapanır. */
  notCubuguYenile() {
    if (!this.notCubuguId) return;
    const n = this.notlar.get(this.notCubuguId);
    if (!n || n.silindi) { this.notCubuguKapat(); return; }
    this.notCubuguCiz();
    this.notCubuguKonumla();
  }

  notCubuguCiz() {
    const c = this.notCubugu, n = this.notlar.get(this.notCubuguId);
    if (!c || !n) return;
    const kilitli = !!n.kilitli, renk = String(n.renk || '').toLowerCase();
    const notVar = !!this.notMetni(n) || this.yanitlari(n).length > 0;
    const kaldirIpucu = kilitli ? 'Not kilitli' : `${n.tur === 'Highlight' ? 'Vurguyu' : 'İşareti'} kaldır (Delete)`;
    c.setAttribute('aria-label', turAdi(n.tur));
    c.innerHTML = VURGU_RENKLERI.map((r) => `<button class="renk${r.hex === renk ? ' secili' : ''}" data-renk="${r.hex}" title="${kilitli ? 'Not kilitli' : r.ad}" style="--r:${r.hex}"${kilitli ? ' disabled' : ''}></button>`).join('')
      + '<span class="ayrac"></span>'
      + `<button class="ikon kucuk metinli" data-islem="not" title="${notVar ? 'Notu aç' : 'Bu vurguya not ekle'}"><svg viewBox="0 0 20 20"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4.5A1.5 1.5 0 0 1 3 12.5z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg><span>${notVar ? 'Notu düzenle' : 'Not ekle'}</span></button>`
      + `<button class="ikon kucuk metinli" data-islem="kaldir" title="${kaldirIpucu}"${kilitli ? ' disabled' : ''}><svg viewBox="0 0 20 20"><path d="M4 6h12M8 6V4.5h4V6M6 6l.8 10h6.4L14 6M8.6 9v4.5M11.4 9v4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg><span>Kaldır</span></button>`;
  }

  notCubuguTikla(e) {
    const b = e.target.closest('button');
    const n = this.notlar.get(this.notCubuguId);
    if (!b || b.disabled || !n) return;
    if (b.dataset.renk) {
      if (String(n.renk || '').toLowerCase() !== b.dataset.renk) this.guncelle(n, { renk: b.dataset.renk }, `${turAdi(n.tur)} rengini değiştir`);
      return;
    }
    if (b.dataset.islem === 'not') { this.notCubuguKapat(); this.sec(n.id); this.balonAc(n, { odak: !n.kilitli }); return; }
    if (b.dataset.islem === 'kaldir') { this.notCubuguKapat(); this.sil(n); }
  }

  /**
   * Çubuğun konumu: notun görünür parçalarının birleşiminin altında ortalı (yer yoksa üstünde), görünür belge alanına kırpılır.
   * Not görünür alanda değilse (kaydırıldı, sekme gizli) gizlenir, çubuk açık sayılır; görününce geri gelir.
   */
  notCubuguKonumla() {
    const c = this.notCubugu;
    if (!c || !this.notCubuguId) return;
    const kay = this.g.kaydirici;
    const parcalar = [...this.g.alan.querySelectorAll(`g[data-id="${this.notCubuguId}"] rect`)];
    if (!parcalar.length || !kay.clientWidth || !kay.clientHeight) { c.hidden = true; return; }
    const kk = kay.getBoundingClientRect(), alanK = this.alan.getBoundingClientRect();
    const gl = kk.left, gt = kk.top, gr = kk.left + kay.clientWidth, gb = kk.top + kay.clientHeight;   // kaydırma çubukları hariç
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const p of parcalar) {
      const d = p.getBoundingClientRect();
      const x0 = Math.max(d.left, gl), x1 = Math.min(d.right, gr), y0 = Math.max(d.top, gt), y1 = Math.min(d.bottom, gb);
      if (x1 > x0 && y1 > y0) { l = Math.min(l, x0); r = Math.max(r, x1); t = Math.min(t, y0); b = Math.max(b, y1); }
    }
    if (!(r > l)) { c.hidden = true; return; }
    c.hidden = false;
    const P = 8, w = c.offsetWidth, h = c.offsetHeight;
    const sol = Math.max(0, gl - alanK.left), sag = Math.min(alanK.width, gr - alanK.left), ust = Math.max(0, gt - alanK.top), alt = Math.min(alanK.height, gb - alanK.top);
    let y = b - alanK.top + P;
    if (y + h > alt - P) y = t - alanK.top - h - P;
    y = Math.max(ust + P, Math.min(alt - h - P, y));
    const x = Math.max(sol + P, Math.min(sag - w - P, (l + r) / 2 - alanK.left - w / 2));
    c.style.left = x + 'px'; c.style.top = y + 'px';
  }

  // ------------------------------------------------------------ yazı (FreeText)
  varsayilanYazi() {
    const a = this.ayar();
    return yaziKanonik({ tip: YAZI_TIPLERI.includes(a.yaziTipi) ? a.yaziTipi : VARSAYILAN_YAZI_TIPI, boyut: a.yaziBoyutu || 12, renk: a.yaziRengi || '#000000', arka: a.yaziArka || null, kenarlik: false }, '');
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
      const not = { id: yeniId(), tur: 'FreeText', sayfa: i + 1, rect, icerik: '', yazar: a.yazarAdi, renk: null, opaklik: 1, yazi: yaziKanonik({ ...this.varsayilanYazi(), donus: this.sayfaAcisi(i) }, ''), yeni: true, silindi: false, yanitlar: [], ustId: null, konu: 'Yazı' };
      this.aracSec(null);
      this.duzenleyiciAc(not, true);
    };
    document.addEventListener('pointermove', hareket); document.addEventListener('pointerup', birak);
  }

  /** Var olan yazıyı düzenler. nokta: çift tıklanan yer (imleç oraya konur). */
  async yaziDuzenle(n, nokta = null) {
    if (n.kilitli) return;
    let yazi = n.yazi, icerik = n.icerik;
    if (!yazi) {
      // Dosyadaki (ör. başka programda yazılmış) yazının biçimi (/RC parçaları dahil) çekirdekten okunur; not ancak düzenleme onaylanıp bir şey
      // değişirse güncellenir (açıp vazgeçmek ya da değiştirmeden kapatmak belgeyi değiştirmez)
      try { const r = await this.cekirdek('freetext_stil', { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa, xref: n.xref }); yazi = r.stil; icerik = r.icerik ?? icerik; }
      catch { yazi = this.varsayilanYazi(); }
      if (n.silindi || this.notlar.get(n.id) !== n) return;
    }
    this.duzenleyiciAc(n, false, { yazi, icerik, nokta });
  }

  /**
   * Zengin metin düzenleyicisi (contenteditable). Model parçalardır (d.parcalar); yazma, silme, yapıştırma ve biçim komutları
   * beforeinput'ta modele uygulanıp DOM yeniden çizilir, imleç ve seçim metin ofsetleriyle korunur. Düzenleyici içinde geri al /
   * yinele (Ctrl+Z / Ctrl+Y) metin, biçim ve kutu (dolgu, kenarlık, yazı tipi) değişikliklerini kapsar; düzenleme bitince bütün
   * değişiklik tek komut olarak belgenin geri al yığınına girer.
   */
  duzenleyiciAc(n, yeniMi, { yazi = n.yazi, icerik = n.icerik, nokta = null } = {}) {
    this.duzenleyiciBitir(true);
    this.balonKapat();
    const i = n.sayfa - 1;
    const sayfaEl = this.g.sayfalar[i].el;
    const kanonik = yaziKanonik(yazi, String(icerik ?? '').replace(/\r\n?/g, '\n'));
    const { parcalar, ...kutu } = kanonik;
    const ed = document.createElement('div');
    ed.className = 'yazi-duzenleyici';
    ed.contentEditable = 'true';
    ed.spellcheck = false;
    ed.setAttribute('role', 'textbox');
    ed.setAttribute('aria-multiline', 'true');
    ed.setAttribute('aria-label', 'Yazı');
    sayfaEl.append(ed);
    const bicim = document.createElement('div');
    bicim.className = 'yazi-bicim';
    this.alan.append(bicim);
    const uzunluk = duzMetin(parcalar).length;
    const d = this.duzenleyici = {
      not: n, el: ed, bicim, yeniMi, eski: { icerik: duzMetin(parcalar), yazi: kanonik, rect: [...n.rect] }, yazi: kutu, parcalar, rect: [...n.rect],
      secim: [uzunluk, uzunluk], bekleyen: null, geri: [], ileri: [], sonKayit: null,
    };
    parcalariCiz(ed, parcalar);
    // Yerli çizimi gizle (düzenleyici üstte)
    for (const el of sayfaEl.querySelectorAll(`.not-oge[data-id="${n.id}"]`)) el.style.visibility = 'hidden';
    this.duzenleyiciBicimYenile();
    this.duzenleyiciKonumla();
    this.duzenleyiciGecmisBildir();
    ed.addEventListener('keydown', (e) => this.duzenleyiciTus(e));
    ed.addEventListener('beforeinput', (e) => this.duzenleyiciGirdi(e));
    ed.addEventListener('input', (e) => { if (!e.isComposing) this.duzenleyiciDomdanOku(); });
    ed.addEventListener('compositionstart', () => { d.birlesim = true; });
    ed.addEventListener('compositionend', () => { d.birlesim = false; setTimeout(() => this.duzenleyiciDomdanOku(), 0); });
    ed.addEventListener('paste', (e) => { e.preventDefault(); this.duzenleyiciYaz(e.clipboardData?.getData('text/plain') || ''); });
    ed.addEventListener('drop', (e) => e.preventDefault());
    d.secimDinle = () => this.duzenleyiciSecimDegisti();
    document.addEventListener('selectionchange', d.secimDinle);
    // Taşıma (kenar) ve boyutlandırma (sağ alt köşe) tutamaçları
    const tut = document.createElement('div'); tut.className = 'yazi-tutamac'; sayfaEl.append(tut);
    const bt = document.createElement('div'); bt.className = 'yazi-boyut'; sayfaEl.append(bt);
    this.duzenleyici.tut = tut; this.duzenleyici.bt = bt;
    this.duzenleyiciKonumla();
    const surukle = (hedefEl, boyutMu) => (e) => {
      e.preventDefault(); e.stopPropagation();
      const bas = { x: e.clientX, y: e.clientY, rect: [...d.rect] };
      const hareket = (e2) => {
        // Ekran pikselinde taşınır / boyutlanır, sonra PDF'e çevrilir: döndürülmüş sayfada da fare yönünde (en az 30 × 14 pt)
        const k = this.ptPx(), i = d.not.sayfa - 1;
        const dx = e2.clientX - bas.x, dy = e2.clientY - bas.y;
        const r = this.rectToPx(i, bas.rect);
        d.rect = boyutMu ? this.pxRectToPdf(i, r.x, r.y, Math.max(30 * k, r.w + dx), Math.max(14 * k, r.h + dy)) : this.pxRectToPdf(i, r.x + dx, r.y + dy, r.w, r.h);
        this.duzenleyiciKonumla();
      };
      const birak = () => { document.removeEventListener('pointermove', hareket); document.removeEventListener('pointerup', birak); };
      document.addEventListener('pointermove', hareket); document.addEventListener('pointerup', birak);
    };
    tut.addEventListener('pointerdown', surukle(tut, false));
    bt.addEventListener('pointerdown', surukle(bt, true));
    setTimeout(() => {
      if (this.duzenleyici !== d) return;
      // Çift tıklanan yazıda imleç tıklanan karaktere, yoksa metnin sonuna
      const r = nokta && document.caretRangeFromPoint?.(nokta.x, nokta.y);
      if (r && ed.contains(r.startContainer)) { const o = ofsetAl(ed, r.startContainer, r.startOffset); d.secim = [o, o]; }
      this.duzenleyiciOdakla();
      this.duzenleyiciDurum();
    }, 0);
  }

  duzenleyiciKonumla() {
    const d = this.duzenleyici; if (!d) return;
    const i = d.not.sayfa - 1;
    const r = this.rectToPx(i, d.rect);
    const k = this.ptPx();
    const y = d.yazi;
    const egim = this.yaziEgimi(i, y);
    this.yaziYerlestir(d.el, r, egim);
    Object.assign(d.el.style, {
      fontFamily: yaziTipiCss(y.tip), fontSize: (y.boyut * k) + 'px', color: y.renk, background: y.arka || 'rgba(255,255,255,0.01)',
      textAlign: HIZA_CSS[y.hiza] || 'left',
      // Kenarlıksızken kesik çizgili işaret outline ile (kutunun içine): kenarlık gibi yer kaplayıp içeriği yerli çizimden ve kaydedilen
      // görünümden 2 px daraltmasın (satırlar düzenlerken başka yerden kırılırdı)
      border: y.kenarlik ? `${Math.max(1, k)}px solid ${y.kenarlikRengi || y.renk}` : 'none', outline: y.kenarlik ? 'none' : '1px dashed var(--vurgu)', outlineOffset: '-1px',
      padding: (2 * k) + 'px', lineHeight: '1.2',
    });
    if (d.tut) Object.assign(d.tut.style, { left: (r.x - 6) + 'px', top: (r.y - 6) + 'px' });
    if (d.bt) Object.assign(d.bt.style, { left: (r.x + r.w - 5) + 'px', top: (r.y + r.h - 5) + 'px' });
    this.duzenleyiciCubukKonumla(r);
    // Satır kırılımı değişmiş olabilir (genişlik, yakınlaştırma, yazı tipi, boyut, kenarlık): satır sonu boşluklarının çizgisi yeniden belirlenir
    const dizilim = [d.el.style.width, y.boyut * k, y.tip, y.kenarlik].join('|');
    if (d.dizilim !== dizilim && !d.birlesim) { d.dizilim = dizilim; if (d.parcalar.some((p) => p.alti || p.ustu)) this.duzenleyiciDomCiz(); }
  }

  /**
   * Biçim çubuğu (kaydırılmayan belge alanında): kutunun üstünde, yer yoksa altında; ikisine de sığmıyorsa (kutu görünür alandan uzun)
   * görünür alanın üst kenarında. Kaydırmada kutuyu izler; kutu görünür alanın dışına çıkınca gizlenir (sayfa metninin üstünde asılı
   * kalmasın). r: kutunun sayfa içi px dikdörtgeni (verilmezse hesaplanır).
   */
  duzenleyiciCubukKonumla(r = null) {
    const d = this.duzenleyici; if (!d) return;
    const i = d.not.sayfa - 1, s = this.g.sayfalar[i]; if (!s) return;
    r ||= this.rectToPx(i, d.rect);
    const b = d.bicim, k = this.g.kaydirici;
    const sayfaK = s.el.getBoundingClientRect(), alanK = this.alan.getBoundingClientRect(), kK = k.getBoundingClientRect();
    // Görünür alan (kaydırma çubukları hariç) ve kutu, belge alanının koordinatında
    const ust = kK.top + k.clientTop - alanK.top, alt = ust + k.clientHeight;
    const sol = kK.left + k.clientLeft - alanK.left, sag = sol + k.clientWidth;
    const kx = sayfaK.left - alanK.left + r.x, ky = sayfaK.top - alanK.top + r.y;
    const gorunur = !!k.clientHeight && ky + r.h > ust && ky < alt && kx + r.w > sol && kx < sag;
    b.style.visibility = gorunur ? '' : 'hidden';
    if (!gorunur) return;
    const h = b.offsetHeight, w = b.offsetWidth;
    let by = ky - h - 8;
    if (by < ust + 4) { by = ky + r.h + 8; if (by + h > alt - 4) by = ust + 4; }
    const bx = Math.max(sol + 4, Math.min(sag - w - 4, kx));
    b.style.left = bx + 'px'; b.style.top = by + 'px';
  }

  /** Modeli düzenleyicinin DOM'una çizer (satır sonu boşlukları çizgisiz, kaydedilen görünüm gibi); odaktaysa seçimi geri koyar. */
  duzenleyiciDomCiz() {
    const d = this.duzenleyici; if (!d) return;
    parcalariCiz(d.el, d.parcalar);
    sonBosluklariCizgisizYap(d.el);
    if (document.activeElement === d.el) secimKoy(d.el, d.secim[0], d.secim[1]);
  }

  duzenleyiciOtoBoyut() {
    const d = this.duzenleyici; if (!d) return;
    const ta = d.el;
    if (ta.scrollHeight > ta.clientHeight + 1) {
      // Yazının aşağı yönünde büyür: ekranda aşağı, eğik yazıda sola / yukarı / sağa (döndürülmüş sayfada PDF'in başka kenarı)
      const i = d.not.sayfa - 1, r = this.rectToPx(i, d.rect), ek = (ta.scrollHeight - ta.clientHeight) + 2 * this.ptPx();
      const egim = this.yaziEgimi(i, d.yazi);
      const [x, y, w, h] = egim === 90 ? [r.x - ek, r.y, r.w + ek, r.h] : egim === 180 ? [r.x, r.y - ek, r.w, r.h + ek]
        : egim === 270 ? [r.x, r.y, r.w + ek, r.h] : [r.x, r.y, r.w, r.h + ek];
      d.rect = this.pxRectToPdf(i, x, y, w, h);
      this.duzenleyiciKonumla();
    }
  }

  /** Biçim çubuğunu kurar (bir kez); durum (basılı düğmeler, renkler) duzenleyiciDurum ile güncellenir. */
  duzenleyiciBicimYenile() {
    const d = this.duzenleyici; if (!d) return;
    d.bicim.innerHTML = `
      <select class="tip" title="Yazı tipi">${YAZI_TIPLERI.map((t) => `<option>${t}</option>`).join('')}</select>
      <input class="boyut" type="number" min="6" max="72" step="1" title="Boyut (pt)">
      <label class="renk-etiket" title="Yazı rengi"><span class="ornek"></span><input class="renk" type="color"></label>
      <span class="dolgu-kap">
        <button class="ikon kucuk dolgu-dugme" title="Dolgu rengi" aria-haspopup="menu" aria-expanded="false"><span class="ornek arka"></span><svg class="ok" viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>
        <input class="arka-renk" type="color" tabindex="-1" aria-hidden="true">
        <div class="dolgu-paleti" role="menu" aria-label="Dolgu rengi" hidden>
          <button class="dolgu-dolgusuz" data-arka="" role="menuitemradio"><span class="ornek arka"></span>Dolgusuz</button>
          <div class="dolgu-renkler">${DOLGU_RENKLERI.map((r) => `<button class="dolgu-renk" data-arka="${r.hex}" title="${r.ad}" role="menuitemradio" style="--r:${r.hex}"></button>`).join('')}</div>
          <button class="dolgu-diger" data-islem="diger">Diğer renk</button>
        </div>
      </span>
      <button class="ikon kucuk kalin" title="Kalın (Ctrl+B)"><b>K</b></button>
      <button class="ikon kucuk italik" title="İtalik (Ctrl+I)"><i>T</i></button>
      <button class="ikon kucuk alti" title="Altı çizili (Ctrl+U)"><u>A</u></button>
      <button class="ikon kucuk kenar" title="Kenarlık">▢</button>
      <span class="ayrac"></span>
      <button class="ikon kucuk tamam" title="Tamam (Esc ya da dışarı tıkla)"><svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>
      <button class="ikon kucuk iptal" title="Vazgeç"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.6"/></svg></button>`;
    const b = d.bicim;
    // Seçiciler öğe türüyle birlikte: '.arka' hem örnek span'ını hem dolgu girdisini seçiyordu, dolgu rengi dinleyicisi span'a bağlanıyordu
    b.querySelector('select.tip').addEventListener('change', (e) => this.duzenleyiciKutu({ tip: e.target.value }));
    b.querySelector('input.boyut').addEventListener('change', (e) => this.duzenleyiciKutu({ boyut: Math.max(6, Math.min(72, Math.round(+e.target.value) || 12)) }));
    b.querySelector('input.renk').addEventListener('input', (e) => this.duzenleyiciRenk(e.target.value));
    b.querySelector('input.arka-renk').addEventListener('input', (e) => this.duzenleyiciKutu({ arka: e.target.value.toLowerCase() }, 'arka'));
    // Renk seçici açılmadan değer bir birim kaydırılır: gösterilen rengin aynısı seçilince de (ör. dolgusuzken beyaz, karışık
    // seçimde ilk karakterin rengi) 'input' olayı gelsin
    const komsu = (hex) => '#' + (parseInt(hex.slice(1), 16) ^ 1).toString(16).padStart(6, '0');
    b.querySelector('input.renk').addEventListener('click', (e) => { e.target.value = komsu(this.duzenleyiciEtkinStil().renk || d.yazi.renk); });
    // Dolgu rengi: düğme paleti açar (Dolgusuz, hazır renkler, Diğer renk → Windows renk seçicisi). Ayrı Dolgusuz düğmesi yok.
    // Esc ve paletin dışına basış yalnızca paleti kapatır; düzenleme sürer
    const kap = b.querySelector('.dolgu-kap'), palet = kap.querySelector('.dolgu-paleti'), dolguDugme = kap.querySelector('.dolgu-dugme');
    const disBasis = (e) => { if (!kap.contains(e.target)) paletKapat(); };
    const paletKapat = () => { palet.hidden = true; dolguDugme.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', disBasis, true); };
    d.dolguPaletiKapat = paletKapat;
    d.dolguPaletiAcik = () => !palet.hidden;
    dolguDugme.addEventListener('click', () => {
      if (!palet.hidden) { paletKapat(); return; }
      palet.hidden = false; dolguDugme.setAttribute('aria-expanded', 'true');
      palet.classList.remove('yukari');
      const r = palet.getBoundingClientRect(), a = this.alan.getBoundingClientRect();
      if (r.bottom > a.bottom - 4 && r.top - r.height - dolguDugme.offsetHeight - 12 > a.top) palet.classList.add('yukari');   // altta yer yok
      document.addEventListener('pointerdown', disBasis, true);
    });
    palet.addEventListener('click', (e) => {
      const s = e.target.closest('button'); if (!s) return;
      paletKapat();
      if (s.dataset.islem === 'diger') { const g = kap.querySelector('input.arka-renk'); g.value = komsu(d.yazi.arka || '#ffffff'); g.click(); return; }
      const arka = s.dataset.arka ? s.dataset.arka.toLowerCase() : null;
      if (arka !== (d.yazi.arka || null)) this.duzenleyiciKutu({ arka });
    });
    b.querySelector('button.kalin').addEventListener('click', () => this.duzenleyiciBicim('kalin'));
    b.querySelector('button.italik').addEventListener('click', () => this.duzenleyiciBicim('italik'));
    b.querySelector('button.alti').addEventListener('click', () => this.duzenleyiciBicim('alti'));
    b.querySelector('button.kenar').addEventListener('click', () => this.duzenleyiciKutu({ kenarlik: !d.yazi.kenarlik }));
    b.querySelector('button.tamam').addEventListener('click', () => this.duzenleyiciBitir(true));
    b.querySelector('button.iptal').addEventListener('click', () => this.duzenleyiciBitir(false));
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    // Düğmeye basmak odağı ve seçimi düzenleyicide bırakır (biçim seçili karakterlere uygulanır)
    b.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    // Çubuktaki Esc de düzenlemeyi uygulayıp bitirir. Açık yazı tipi listesi / renk seçici ilk Esc'le kendisi kapanır (açıkken tuş
    // sayfaya gelmez), ikinci Esc buraya gelir. Boyut kutusuna yazılıp Enter'a basılmamış değer önce uygulanır (odak çıkınca olduğu gibi).
    b.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key !== 'Escape' || e.isComposing) return;
      e.preventDefault();
      if (!palet.hidden) { paletKapat(); return; }
      if (e.target.matches('input.boyut')) e.target.blur();
      this.duzenleyiciEsc();
    });
    this.duzenleyiciDurum();
  }

  /** Çubuğun durumu: imleçteki / seçimdeki biçim, renkler, dolgu, kenarlık, yazı tipi ve boyut. */
  duzenleyiciDurum() {
    const d = this.duzenleyici; if (!d) return;
    const b = d.bicim, st = this.duzenleyiciEtkinStil();
    const bas = (sec, acik) => { const x = b.querySelector(sec); x.classList.toggle('secili', !!acik); x.setAttribute('aria-pressed', acik ? 'true' : 'false'); };
    bas('button.kalin', st.kalin); bas('button.italik', st.italik); bas('button.alti', st.alti);
    bas('button.kenar', d.yazi.kenarlik);
    const renk = st.renk || d.yazi.renk;
    b.querySelector('span.ornek:not(.arka)').style.background = renk;
    // Dolgusuzda satranç deseni (CSS) görünsün: background kısaltması desen görselini de siler
    b.querySelector('.dolgu-dugme span.ornek.arka').style.background = d.yazi.arka || '';
    b.querySelector('.dolgu-dugme').title = d.yazi.arka ? 'Dolgu rengi' : 'Dolgu rengi: Dolgusuz';
    const arka = String(d.yazi.arka || '').toLowerCase();
    for (const x of b.querySelectorAll('.dolgu-paleti [data-arka]')) {
      const secili = x.dataset.arka === arka;
      x.classList.toggle('secili', secili); x.setAttribute('aria-checked', secili ? 'true' : 'false');
    }
    const deger = (sec, v) => { const x = b.querySelector(sec); if (document.activeElement !== x && x.value !== String(v)) x.value = v; };
    deger('input.renk', renk); deger('input.arka-renk', d.yazi.arka || '#ffffff');
    deger('select.tip', d.yazi.tip); deger('input.boyut', d.yazi.boyut);
  }

  /** İmleçteki (yazılacak) ya da seçimin tamamındaki biçim; seçimin baş ve sonundaki boşluklar sayılmaz (bkz. bicimAraligi). */
  duzenleyiciEtkinStil() {
    const d = this.duzenleyici;
    const [a, b] = sirala(d.secim);
    if (a === b) return d.bekleyen && d.bekleyen.ofset === a ? d.bekleyen.stil : stilKonumda(d.parcalar, a);
    const [x, y] = bicimAraligi(d.parcalar, a, b);
    const st = {};
    for (const k of ['kalin', 'italik', 'alti', 'ustu']) if (hepsindeMi(d.parcalar, x, y, k)) st[k] = true;
    const renk = stilKonumda(d.parcalar, x, false).renk;
    if (renk) st.renk = renk;
    return st;
  }

  duzenleyiciOdakla() {
    const d = this.duzenleyici; if (!d) return;
    if (document.activeElement !== d.el) d.el.focus({ preventScroll: true });
    secimKoy(d.el, d.secim[0], d.secim[1]);
  }

  /** Modeli düzenleyiciye çizer; düzenleyici odaktaysa seçimi geri koyar. */
  duzenleyiciCiz() {
    const d = this.duzenleyici; if (!d) return;
    this.duzenleyiciDomCiz();
    this.duzenleyiciOtoBoyut();
  }

  duzenleyiciSecimDegisti() {
    const d = this.duzenleyici; if (!d) return;
    const s = secimAl(d.el); if (!s) return;
    d.secim = s;
    if (d.bekleyen && !(s[0] === s[1] && s[0] === d.bekleyen.ofset)) d.bekleyen = null;   // imleç başka yere gitti
    this.duzenleyiciDurum();
  }

  /** Güncel seçim [baş, son]: selectionchange eşzamansız geldiğinden (hızlı Shift+ok, Ctrl+B) odak düzenleyicideyse canlı seçimden okunur. */
  duzenleyiciSecim() {
    const d = this.duzenleyici;
    if (document.activeElement === d.el) { const s = secimAl(d.el); if (s) d.secim = s; }
    return sirala(d.secim);
  }

  duzenleyiciTus(e) {
    if (belgeKisayoluMu(e)) return;   // sekme geçişi, yakınlaştırma: belgede (sekme değişince düzenleme uygulanıp biter)
    e.stopPropagation();
    const d = this.duzenleyici; if (!d || e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); this.duzenleyiciEsc(); return; }
    // Kutu içeriğe göre büyür, kendi içinde kaymaz: PageUp/PageDown'u tarayıcı belgeyi kaydırmaya çevirip düzenleyiciyi görünümden çıkarmasın
    if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); return; }
    const ctrl = birincil(e) && !e.altKey && (MAC || !e.metaKey);   // Ctrl+Alt = AltGr (Türkçe klavyede @, € …): kısayol değil; macOS'ta ⌘
    if (e.key === 'Enter' && !ctrl && !e.altKey) { e.preventDefault(); this.duzenleyiciYaz('\n'); return; }
    if (!ctrl) return;
    // Harf, düzenden bağımsız: önce tuşun ürettiği harf (Türkçe Q'da ı → i), harf değilse fiziksel tuş
    const k = (e.key || '').toLocaleLowerCase('tr');
    const harf = /^[a-z]$/.test(k) ? k : k === 'ı' ? 'i' : /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : '';
    const islem = e.shiftKey ? { z: 'yinele' }[harf] : { b: 'kalin', i: 'italik', u: 'alti', z: 'geriAl', y: 'yinele' }[harf];
    if (!islem) return;
    e.preventDefault();
    if (islem === 'geriAl') this.duzenleyiciGeriAl();
    else if (islem === 'yinele') this.duzenleyiciYinele();
    else this.duzenleyiciBicim(islem);
  }

  /** Tarayıcının düzenleme isteklerini modele uygular (DOM'u tarayıcı değil model değiştirir). */
  duzenleyiciGirdi(e) {
    const d = this.duzenleyici; if (!d) return;
    const t = e.inputType || '';
    if (e.isComposing || t === 'insertCompositionText') return;   // IME: tarayıcı yazar, bitince DOM'dan okunur
    e.preventDefault();
    const aralik = () => {
      const r = e.getTargetRanges?.()[0];
      return r ? sirala([ofsetAl(d.el, r.startContainer, r.startOffset), ofsetAl(d.el, r.endContainer, r.endOffset)]) : sirala(secimAl(d.el) || d.secim);
    };
    if (t === 'insertText' || t === 'insertReplacementText') this.duzenleyiciYaz(e.data ?? e.dataTransfer?.getData('text/plain') ?? '', aralik());
    else if (t === 'insertLineBreak' || t === 'insertParagraph') this.duzenleyiciYaz('\n', aralik());
    else if (t.startsWith('delete')) { const [a, b] = aralik(); if (b > a) this.duzenleyiciYaz('', [a, b]); }
    else if (t === 'historyUndo') this.duzenleyiciGeriAl();
    else if (t === 'historyRedo') this.duzenleyiciYinele();
    else if (t === 'formatBold') this.duzenleyiciBicim('kalin');
    else if (t === 'formatItalic') this.duzenleyiciBicim('italik');
    else if (t === 'formatUnderline') this.duzenleyiciBicim('alti');
    // yapıştırma 'paste' olayında düz metin olarak; bırakma, liste, hizalama gibi diğer istekler yok sayılır
  }

  /** [a, b) aralığını metinle değiştirir (boş metin: silme). Yazılan metin bekleyen biçimi ya da imleçten önceki karakterin biçimini alır. */
  duzenleyiciYaz(metin, aralik = null) {
    const d = this.duzenleyici; if (!d) return;
    const [a, b] = aralik || this.duzenleyiciSecim();
    // Yapıştırılan metinde PDF görünümüne çizilemeyen denetim karakterleri: sekme boşluk olur, yumuşak tire / sıfır genişlikli boşluk atılır
    metin = String(metin ?? '').replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/\t/g, '    ').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u00ad\u200b]/g, '');
    if (!metin && a === b) return;
    const stil = a === b ? (d.bekleyen?.ofset === a ? d.bekleyen.stil : stilKonumda(d.parcalar, a)) : stilKonumda(d.parcalar, a, false);
    this.duzenleyiciKayit(metin ? 'yaz' : 'sil', /^\s+$/.test(metin));
    d.parcalar = metinDegistir(d.parcalar, a, b, metin, stil);
    d.bekleyen = null;
    d.secim = [a + metin.length, a + metin.length];
    this.duzenleyiciCiz();
    this.duzenleyiciDurum();
  }

  /**
   * Kalın / italik / altı çizili: seçimde Word gibi (hepsinde varsa kaldırır, yoksa ekler); imleçte sonra yazılacak metne.
   * Karar ve ekleme seçimin baş ve sonundaki boşluklar olmadan verilir: Windows'ta çift tık sözcüğü sondaki boşlukla seçer; biçimli
   * sözcükte ilk basış biçimi kaldırsın, alt çizgi boşluğa uzamasın. Kaldırma seçimin tamamından (sözcükle komşusu arasındaki boşlukta
   * biçim kalmasın).
   */
  duzenleyiciBicim(anahtar) {
    const d = this.duzenleyici; if (!d) return;
    const [a, b] = this.duzenleyiciSecim();
    if (a === b) {
      const stil = { ...(d.bekleyen?.ofset === a ? d.bekleyen.stil : stilKonumda(d.parcalar, a)) };
      if (stil[anahtar]) delete stil[anahtar]; else stil[anahtar] = true;
      d.bekleyen = { ofset: a, stil };
    } else {
      const [x, y] = bicimAraligi(d.parcalar, a, b);
      const ekle = !hepsindeMi(d.parcalar, x, y, anahtar);
      this.duzenleyiciKayit('bicim', false, DUZENLEYICI_ADIMLARI[anahtar]);
      d.parcalar = ekle ? stilDegistir(d.parcalar, x, y, anahtar, true) : stilDegistir(d.parcalar, a, b, anahtar, false);
      this.duzenleyiciCiz();
    }
    this.duzenleyiciOdakla();
    this.duzenleyiciDurum();
  }

  /** Yazı rengi: seçime; imleçte sonra yazılacak metne; kutu boşsa ya da metnin tamamı seçiliyse kutunun rengi (kenarlık da). */
  duzenleyiciRenk(renk) {
    const d = this.duzenleyici; if (!d) return;
    renk = String(renk).toLowerCase();
    const [a, b] = this.duzenleyiciSecim();
    const uzunluk = duzMetin(d.parcalar).length;
    if (!uzunluk || (a === 0 && b >= uzunluk && b > a)) {
      this.duzenleyiciKayit('renk');
      d.yazi.renk = renk;
      d.parcalar = stilDegistir(d.parcalar, 0, uzunluk, 'renk', null);
      d.bekleyen = null;
      this.duzenleyiciKonumla();
      this.duzenleyiciCiz();
    } else if (a === b) {
      d.bekleyen = { ofset: a, stil: stilAl({ ...(d.bekleyen?.ofset === a ? d.bekleyen.stil : stilKonumda(d.parcalar, a)), renk }, d.yazi.renk) };
    } else {
      this.duzenleyiciKayit('renk');
      d.parcalar = stilDegistir(d.parcalar, a, b, 'renk', renk === d.yazi.renk ? null : renk);
      this.duzenleyiciCiz();
    }
    this.duzenleyiciOdakla();
    this.duzenleyiciDurum();
  }

  /** Kutu düzeyindeki değişiklik (yazı tipi, boyut, dolgu, dolgusuz, kenarlık): anında görünür, düzenleyicide geri alınabilir. */
  duzenleyiciKutu(degisim, tur = 'kutu') {
    const d = this.duzenleyici; if (!d) return;
    if (Object.entries(degisim).some(([k, v]) => d.yazi[k] !== v)) {
      const anahtar = Object.keys(degisim)[0];
      this.duzenleyiciKayit(tur, false, DUZENLEYICI_ADIMLARI[anahtar === 'arka' && !degisim.arka ? 'dolgusuz' : anahtar]);
      Object.assign(d.yazi, degisim);
      this.duzenleyiciKonumla();
      this.duzenleyiciOtoBoyut();
    }
    this.duzenleyiciOdakla();
    this.duzenleyiciDurum();
  }

  /** IME gibi tarayıcının kendi yazdığı durumda DOM'dan okur; biçim modelden (değişen bölüm önündeki karakterin biçimini alır). */
  duzenleyiciDomdanOku() {
    const d = this.duzenleyici; if (!d) return;
    const metin = duzMetin(domdanOku(d.el, d.yazi.renk));
    if (metin === duzMetin(d.parcalar)) return;
    const secim = secimAl(d.el);
    this.duzenleyiciKayit('yaz');
    d.parcalar = uzlastir(d.parcalar, metin);
    d.bekleyen = null;
    if (secim) d.secim = secim;
    this.duzenleyiciCiz();
    this.duzenleyiciDurum();
  }

  // Düzenleyici içi geri al / yinele: anlık görüntü yığını. Ardışık yazma / silme (1 sn içinde, boşluktan sonra yeni sözcüğe kadar) ve
  // renk sürüklemesi tek adımdır. Her kayıt adımın adını taşır (ad: bu durumdan sonraki değişiklik; araç çubuğu ipuçları).
  duzenleyiciKayit(tur, bosluk = false, ad = null) {
    const d = this.duzenleyici; if (!d) return;
    const simdi = Date.now(), s = d.sonKayit;
    const birlesir = ['yaz', 'sil', 'renk', 'arka'].includes(tur) && s?.tur === tur && simdi - s.zaman < 1000 && !(tur === 'yaz' && s.bosluk && !bosluk);
    d.sonKayit = { tur, zaman: simdi, bosluk };
    if (birlesir) return;
    d.geri.push({ parcalar: structuredClone(d.parcalar), yazi: structuredClone(d.yazi), secim: [...d.secim], ad: ad || DUZENLEYICI_ADIMLARI[tur] || 'Yazma' });
    if (d.geri.length > 500) d.geri.shift();
    d.ileri.length = 0;
    this.duzenleyiciGecmisBildir();
  }

  duzenleyiciGeriAl() { this._duzenleyiciGecmis('geri', 'ileri'); }
  duzenleyiciYinele() { this._duzenleyiciGecmis('ileri', 'geri'); }
  _duzenleyiciGecmis(kaynak, hedef) {
    const d = this.duzenleyici; if (!d || !d[kaynak].length) return;
    const a = d[kaynak].pop();
    d[hedef].push({ parcalar: structuredClone(d.parcalar), yazi: structuredClone(d.yazi), secim: [...d.secim], ad: a.ad });
    d.parcalar = a.parcalar; d.yazi = a.yazi; d.secim = a.secim; d.bekleyen = null; d.sonKayit = null;
    this.duzenleyiciKonumla();
    this.duzenleyiciCiz();
    this.duzenleyiciOdakla();
    this.duzenleyiciDurum();
    this.duzenleyiciGecmisBildir();
  }

  /**
   * Açık düzenleyicinin geri al / yinele durumu: { geri, ileri } (adımın adı ya da null); düzenleyici yoksa null. Düzenleyici açıkken
   * araç çubuğu ve Düzen menüsündeki Geri al / Yinele belgeyi değil düzenleyicinin metnini geri alır (referans okuyucudaki gibi; belge geri alınsaydı
   * son komut "Yazı ekle" olduğunda yazı kurtarılamadan kaybolurdu).
   */
  duzenleyiciGecmisi() {
    const d = this.duzenleyici; if (!d) return null;
    return { geri: d.geri.at(-1)?.ad || null, ileri: d.ileri.at(-1)?.ad || null };
  }

  /** Düzenleyici açıldı, kapandı ya da geçmişi değişti ('duzenleyici' olayı: uygulama Geri al / Yinele düğmelerini günceller). */
  duzenleyiciGecmisBildir() { this.dispatchEvent(new CustomEvent('duzenleyici')); }

  /**
   * Esc: düzenlemeyi dışarı tıklamak gibi uygulayıp bitirir (referans okuyucudaki gibi; yazılan atılmaz, bütün düzenleme belgenin geri al yığınına tek
   * adım olarak girer), yeni yazı seçili kalır; boş yeni yazı eklenmez. Odak düzenleyici ya da çubuktaysa belgeye döner (kısayollar,
   * ikinci Esc seçimi kaldırır).
   */
  duzenleyiciEsc() {
    const d = this.duzenleyici; if (!d) return;
    if (d.dolguPaletiAcik?.()) { d.dolguPaletiKapat(); return; }   // açık dolgu paleti önce kendisi kapanır (odak düzenleyicide kalır)
    this.duzenleyiciBitir(true);
    const odak = document.activeElement;
    if (!odak || odak === document.body) this.g.kaydirici.focus({ preventScroll: true });
  }

  /** Açık yazı düzenlemesi uygulanınca (duzenleyiciBitir(true)) belge değişir mi: yeni kutuda boş olmayan metin; var olan yazıda metin,
   *  biçim ya da kutu farkı (duzenleyiciBitir'in karşılaştırması). Düzenleme yoksa false. Sağ tık menülerindeki Kaydet'in etkinliği (0.2.1). */
  duzenleyiciDegisti() {
    const d = this.duzenleyici; if (!d) return false;
    const metin = duzMetin(d.parcalar);
    if (d.yeniMi) return !!metin.trim();
    const yazi = yaziKanonik({ ...d.yazi, parcalar: d.parcalar }, metin);
    return JSON.stringify(yazi) !== JSON.stringify(d.eski.yazi) || metin !== d.eski.icerik || JSON.stringify(d.rect) !== JSON.stringify(d.eski.rect);
  }

  duzenleyiciBitir(kaydet) {
    const d = this.duzenleyici; if (!d) return;
    this.duzenleyici = null;
    this.duzenleyiciGecmisBildir();
    document.removeEventListener('selectionchange', d.secimDinle);
    const n = d.not;
    const metin = duzMetin(d.parcalar);
    d.dolguPaletiKapat?.();   // belge düzeyindeki dış basış dinleyicisi kalmasın
    d.el.remove(); d.bicim.remove(); d.tut?.remove(); d.bt?.remove();
    const sayfaEl = this.g.sayfalar[n.sayfa - 1].el;
    for (const el of sayfaEl.querySelectorAll(`.not-oge[data-id="${n.id}"]`)) el.style.visibility = '';
    if (!kaydet) { if (!d.yeniMi) this.cizSayfa(n.sayfa); return; }
    const yazi = yaziKanonik({ ...d.yazi, parcalar: d.parcalar }, metin);
    if (d.yeniMi) {
      if (!metin.trim()) return;                 // boş yazı eklenmez
      n.icerik = metin; n.yazi = yazi; n.rect = d.rect;
      this.ekle(n);
      this.sec(n.id);
      return;
    }
    const degisiklik = {};
    if (JSON.stringify(yazi) !== JSON.stringify(d.eski.yazi)) degisiklik.yazi = yazi;
    // Biçim değiştiyse metin de gider (dosyadaki /Contents'te \r satır sonu olabilir; parçalar metinle uyumlu olmalı)
    if (metin !== d.eski.icerik || (degisiklik.yazi && metin !== (n.icerik ?? ''))) degisiklik.icerik = metin;
    if (JSON.stringify(d.rect) !== JSON.stringify(d.eski.rect)) degisiklik.rect = d.rect;
    // Dosyadaki biçimiyle (yazısız) açılan yazı: kayıttan sonra geri alınırsa özgün biçim (okunan kanonik hâli) açıkça yazılır
    const dosyaEski = !n.yazi && degisiklik.yazi ? { yazi: d.eski.yazi, ...('icerik' in degisiklik ? { icerik: d.eski.icerik } : {}) } : null;
    if (Object.keys(degisiklik).length) this.guncelle(n, degisiklik, 'Yazıyı düzenle', dosyaEski);
    else this.cizSayfa(n.sayfa);
  }

  yokEt() { this.gosterimIptal(); this.balonKapat(); this.duzenleyiciBitir(false); if (cubukSahibi === this) this.secimCubuguGizle(); this.notCubuguKapat(); this.notCubugu?.remove(); }
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
