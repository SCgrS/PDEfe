// Dosya Formatını Değiştir (0.2.6, kullanıcı isteği; ad kullanıcının yazdığı gibi): UDF ↔ PDF, TIFF ↔ PDF, Word ↔ PDF. PDF olmayan iki biçim
// arasında (ör. Word → UDF) çekirdek PDF üzerinden iki adımda dönüştürür. PDF → UDF yalnızca düzenlenebilir belge üretir (kullanıcının seçimi).
// Girdi: Dosya ekle düğmesi ("Desteklenen dosyalar" süzgeci), pencereye sürükle-bırak; ana pencereye bırakılan, komut satırından (Windows'ta
// "Birlikte aç", macOS'ta Finder) ya da Ctrl+O ile açılan UDF, TIFF ve Word dosyaları aracı o dosyalarla açar, araç açıksa listeye ekler
// (uygulama.js acilacaklariAyir). Bir PDF açıkken açılan araçta o PDF ilk girdidir (Birleştir'deki gibi).
// Her satır: küçük resim (çekirdeğin donusum_bilgi'sinden; UDF'nin ön izlemesi bilgisayardaki UYAP Doküman Editörü'yle, Word'ün ön izlemesi
// yok: türün simgesi), ad, algılanan tür (uzantıdan değil dosyanın içeriğinden) ve sayfa sayısı, hedef biçim (PDF | UDF | Word | TIFF, kendi
// türü hariç; bu bilgisayarda yapılamayan dönüştürme soluk, nedeni ipucunda ve seçiliyse satırda), satırı kaldırma. Tanınmayan dosya satırda
// anlaşılır hatayla durur, dönüştürülmez.
// Varsayılan hedef: o türün son seçilen hedefi (kalıcı: ayar donusturme.hedefler), ilk kez PDF girdide UDF, ötekilerde PDF.
// Seçenekler yalnızca TIFF hedefinde: Çözünürlük 200 / 300 dpi, Renk Siyah beyaz / Gri / Renkli (varsayılan 200, siyah beyaz; PDEfe açık
// kaldıkça hatırlanır); bütün TIFF hedeflerine uygulanır.
// Kaydet: öteki araçlardaki standart seçim (ortak.js kayitSecimi). Tek dosyada klasör ve ad (girdinin adı + yeni uzantı; klasörde varsa
// "(2)"), birden çok dosyada yalnızca klasör (adlar girdilerin adı; var olan dosyanın üzerine yazılmaz, "(2)" eklenir). Varsayılan klasör
// öteki araçlarla aynı kural (Ayarlar › Kaydetme'deki çıktı klasörü, yoksa Masaüstü). "Üzerine yaz" soluk: dönüştürülen dosya her zaman
// yeni dosyadır.
// Çekirdek (core/islemler/donustur.py, udf.py; parametreleri ana süreç de denetler: main/guvenlik.js donusumParametreleri):
//   donusum_yetenekleri {} → {donusumler: {"udf>pdf": {var, neden?}, …}, udf: {var, neden?, ude: {var, yol, surum, kaynak}, java}, word, …}
//   donusum_bilgi {yol, genislik, onizleme} → {tur, alt, boyut, sayfa, hedefler: [{bicim, var, neden?}], uyari?, png?, onizlemeUyarisi?, acilmadi?}
//   bicim_donustur {ogeler: [{yol, hedef, hedefBicim, secenekler}]} (ilerlemeli, iptal edilebilir) → {sonuclar: [{…, boyut, sayfa?, uyari?} |
//     {…, hata, kod}], basarili, hatali}. Bütün öğeler bitince hedefler yerine konur: iptal o ana dek gelirse hiçbir dosya yazılmaz; daha geç
//     gelirse (sonuç döner) yeni oluşan dosyalar çöp kutusuna atılır, onaylanıp üzerine yazılan dosya kalır (Birleştir'deki gibi).
//   UYAP Doküman Editörü'nün klasörünü (udeYolu) ana süreç kendi ayarından verir; satırdaki "UYAP Doküman Editörü'nün yerini göster"
//   bağlantısı ayar:udeKlasoruSec ile klasör seçtirir (Ayarlar › Kaydetme'deki satırla aynı yol).
// UYAP Doküman Editörü yokken (yetenekler.udf.var false: editör, Java ya da köprü bulunamadı) UDF satırının PDF hedefi (ve PDF → TIFF / Word
// yapılabiliyorsa TIFF / Word hedefi) ana sürecin yaklaşık çizimiyle yapılır (main/udfYaklasik.js: gizli pencere + printToPDF; kanallar
// udf:yaklasikBilgi, udf:yaklasikDonustur, udf:yaklasikIptal): satırda ve sonuçta "görünüm yaklaşık" uyarısı, küçük resim de bu çizimden.
// Editör bulunduğu hâlde çekirdek bir UDF'yi "desteklenmiyor" diye dönüştüremezse o öğe yaklaşık çizimle yeniden denenir.
// Sonuç: tek çıktı PDF ise sekmede açılır (ciktiyiAc) ve pencere kapanır; öbür durumlarda pencerede sonuç listesi (Ayır'daki gibi; PDF'ler
// için Aç) ve Klasörde göster. Çekirdeğin uyarıları (e-imza taşınmadı, yorumlar alınmadı, resimler alınmadı…) gösterilir.
import {
  pencereAc, pencereAcikMi, IslemIlerleme, kayitSecimi, boyutMetni, sayiMetni, kacis, hataMetni, dosyaAdi, adGovdesi, uzanti, yolAyni,
  yolBirlestir, guvenliAd, oge, segmentliSecim, kilitliHataMi, ciktiyiAc, acikBelge, degisiklikleriSor,
} from './ortak.js';
import { MAC } from '../platform.js';

/** PDF dışında, ana pencereye bırakılınca (komut satırı, Ctrl+O) sekmede değil bu araçta açılan uzantılar. Windows'ta .udf'nin dosya ilişkisi
 *  UYAP Doküman Editörü'nündür; PDEfe kurulumu bu uzantılara ilişki eklemez. */
export const DONUSTURULEN_UZANTILAR = ['udf', 'tif', 'tiff', 'doc', 'docx', 'rtf', 'odt'];
const GIRDI_UZANTILARI = ['pdf', ...DONUSTURULEN_UZANTILAR];
/** Dosya ekle ve Ctrl+O (uygulama.js) süzgeçleri: ilki desteklenen bütün türler. */
export const DOSYA_FILTRELERI = [
  { name: 'Desteklenen dosyalar', extensions: GIRDI_UZANTILARI },
  { name: 'PDF belgeleri', extensions: ['pdf'] },
  { name: 'UDF belgeleri', extensions: ['udf'] },
  { name: 'TIFF görüntüleri', extensions: ['tif', 'tiff'] },
  { name: 'Word belgeleri', extensions: ['doc', 'docx', 'rtf', 'odt'] },
  { name: 'Tüm dosyalar', extensions: ['*'] },
];

/** Hedef biçimler, seçimdeki sırayla. uzanti: çıktının uzantısı (Word hedefi .docx; TIFF .tif). */
export const BICIMLER = [
  { id: 'pdf', ad: 'PDF', uzanti: 'pdf', yonelme: 'PDF\'e' },
  { id: 'udf', ad: 'UDF', uzanti: 'udf', yonelme: 'UDF\'ye' },
  { id: 'word', ad: 'Word', uzanti: 'docx', yonelme: 'Word\'e' },
  { id: 'tiff', ad: 'TIFF', uzanti: 'tif', yonelme: 'TIFF\'e' },
];
const BICIM = Object.fromEntries(BICIMLER.map((b) => [b.id, b]));
const TUR_ADI = { pdf: 'PDF', udf: 'UDF', tiff: 'TIFF', word: 'Word' };
/** Uzantıdan beklenen tür (satırda "içeriği … uzantısı …" uyarısı için). */
const UZANTI_TURU = { pdf: 'pdf', udf: 'udf', tif: 'tiff', tiff: 'tiff', doc: 'word', docx: 'word', docm: 'word', rtf: 'word', odt: 'word' };
const UDE_YOK_IPUCU = 'UYAP Doküman Editörü kuruluysa klasörünü gösterin';

// UDF'nin yaklaşık çizimi (ana süreç, main/udfYaklasik.js): istek kimliği bu pencerenin sayacından, ilerleme 'udf:yaklasikIlerleme' ile
let yaklasikSayac = 0;
let yaklasikDinleme = null;
const yaklasikDinleyiciler = new Map();
/** Ana süreçte yaklaşık çizimle dönüştürür; döner: sözü ({ sonuclar, basarili, hatali } | { iptal: true }) ve iptal() işlevi. */
function yaklasikDonustur(pdefe, ogeler, ilerleme) {
  if (!yaklasikDinleme) yaklasikDinleme = pdefe.dinle('udf:yaklasikIlerleme', (id, p) => yaklasikDinleyiciler.get(id)?.(p));
  const istekId = ++yaklasikSayac;
  if (ilerleme) yaklasikDinleyiciler.set(istekId, ilerleme);
  const soz = pdefe.cagir('udf:yaklasikDonustur', { ogeler, istekId }).finally(() => yaklasikDinleyiciler.delete(istekId));
  soz.iptal = () => pdefe.cagir('udf:yaklasikIptal', { istekId }).catch(() => false);
  return soz;
}
const iptalHatasi = () => Object.assign(new Error('İşlem iptal edildi.'), { iptal: true });

// TIFF seçenekleri PDEfe açık kaldıkça hatırlanır (kalıcı değil: bir sonraki açılışta UYAP'ın kendi taramaları gibi 200 dpi siyah beyaz)
const tiffSecimi = { dpi: 200, renk: 'sb' };
const KUCUK_RESIM_EN_AZ = 120;
const KUTU_VARSAYILAN = 120;   // araclar.css --donustur-resim

const SVG = {
  ekle: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  sil: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5"/></svg>',
  ok: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10h12M11.5 6l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

let acikPencere = null;
/** Açık Dosya Formatını Değiştir penceresi (yoksa null); testler ve uygulama.js'in yönlendirmesi için. */
export function acikDonusturPenceresi() { return acikPencere && !acikPencere.pencere.kapali ? acikPencere : null; }

/** Satırda görünen tür: "UDF", "PDF", "TIFF"; Word'de alt tür ("DOCX", "DOC", "RTF", "ODT"). */
function turEtiketi(o) {
  if (!o.tur || o.tur === 'bilinmeyen') return (uzanti(o.yol) || 'Dosya').toUpperCase();
  if (o.tur === 'word') return o.alt && o.alt !== 'sifreli' ? o.alt.toUpperCase() : 'Word';
  return TUR_ADI[o.tur] || o.tur.toUpperCase();
}

export class DonusturPenceresi {
  /**
   * @param {object} baglam araç bağlamı (araclar/index.js)
   * @param {{ilkDosyalar?: string[]}} s
   */
  constructor(baglam, { ilkDosyalar = [] } = {}) {
    this.baglam = baglam;
    this.ogeler = [];
    this.kimlikSayac = 0;
    this.yetenekler = null;
    this.ilerleme = new IslemIlerleme();
    this._kur();
    this.yetenekSozu = this._yetenekYenile();
    acikPencere = this;
    if (ilkDosyalar.length) this.dosyaEkle(ilkDosyalar);
  }

  // ---------------------------------------------------------------- arayüz
  _kur() {
    const govde = oge(`<div class="donustur-govde">
      <div class="donustur-ust">
        <button class="ikincil ikonlu donustur-ekle" data-ilk-odak>${SVG.ekle}<span>Dosya ekle</span></button>
        <button class="ikincil donustur-temizle">Listeyi temizle</button>
        <span class="donustur-ozet"></span>
      </div>
      <div class="donustur-liste" tabindex="0" aria-label="Dönüştürülecek dosyalar"></div>
      <div class="arac-bolum donustur-secenekler" hidden>
        <div class="arac-bolum-baslik">TIFF seçenekleri</div>
        <div class="donustur-secenek-satiri"><span class="donustur-secenek-ad">Çözünürlük</span><span class="donustur-dpi"></span></div>
        <div class="donustur-secenek-satiri"><span class="donustur-secenek-ad">Renk</span><span class="donustur-renk"></span></div>
        <div class="arac-aciklama">Taranmış sayfalar kendi çözünürlüğünde kalır.</div>
      </div>
      <div class="arac-bolum donustur-kayit"><div class="arac-bolum-baslik">Kaydet</div></div>
      <div class="donustur-sonuc" hidden></div>
    </div>`);
    this.govde = govde;
    this.liste = govde.querySelector('.donustur-liste');
    this.ozetEl = govde.querySelector('.donustur-ozet');
    this.seceneklerEl = govde.querySelector('.donustur-secenekler');
    this.sonucEl = govde.querySelector('.donustur-sonuc');

    this.dpiSecim = segmentliSecim({
      etiket: 'Çözünürlük', deger: String(tiffSecimi.dpi), sinif: 'donustur-dpi-secim',
      secenekler: [{ id: '200', etiket: '200 dpi', baslik: 'Daha küçük dosya; yazılı belgeler için yeterli' }, { id: '300', etiket: '300 dpi', baslik: 'Daha keskin, daha büyük dosya' }],
      degisti: (id) => { tiffSecimi.dpi = +id; },
    });
    govde.querySelector('.donustur-dpi').replaceWith(this.dpiSecim.el);
    this.renkSecim = segmentliSecim({
      etiket: 'Renk', deger: tiffSecimi.renk, sinif: 'donustur-renk-secim',
      secenekler: [{ id: 'sb', etiket: 'Siyah beyaz', baslik: 'En küçük dosya' }, { id: 'gri', etiket: 'Gri' }, { id: 'renkli', etiket: 'Renkli' }],
      degisti: (id) => { tiffSecimi.renk = id; },
    });
    govde.querySelector('.donustur-renk').replaceWith(this.renkSecim.el);

    // Kaydetme: öteki araçlardaki standart seçim; "Üzerine yaz" hiç seçilemez (belge yok), nedeni altında
    this.kayit = kayitSecimi({
      baglam: this.baglam, belge: null, ad: 'Dönüştürülmüş', uzanti: 'pdf', diyalogBasligi: 'Dönüştürülen dosya',
      belgesizNeden: 'Dönüştürülen dosya her zaman yeni dosya olarak kaydedilir.',
    });
    const kayitBolumu = govde.querySelector('.donustur-kayit');
    kayitBolumu.append(this.kayit.el);
    this.adlarEl = oge('<div class="arac-aciklama donustur-adlar" hidden>Dosyalar girdilerin adıyla kaydedilir. Var olan dosyaların üzerine yazılmaz; aynı adlı dosya varsa ada "(2)" eklenir.</div>');
    kayitBolumu.append(this.adlarEl);

    govde.querySelector('.donustur-ekle').addEventListener('click', () => this.dosyaSec());
    govde.querySelector('.donustur-temizle').addEventListener('click', () => {
      if (this.ogeler.length && !this.ilerleme.calisiyor) { this._yaklasikIptal(this.ogeler); this.ogeler = []; this.sonucEl.hidden = true; this.ciz(); }
    });

    // Pencere sekme şeridinin altında başlar (Birleştir ve Sayfaları düzenle gibi; arkadaki sekmeler görünür)
    this.pencere = pencereAc({
      baslik: 'Dosya Formatını Değiştir', govde, anahtar: 'donustur', sinif: 'donustur-pencere', seritAlti: true,
      dugmeler: [{ id: 'donustur', etiket: 'Dönüştür', birincil: true, devre: true, tiklama: () => this.donustur() }],
      kapatmadanOnce: () => this._kapatmaIzni(),
    });
    this.pencere.govde.append(this.ilerleme.el);   // meşgulken soluklaşmasın, İptal tıklanabilsin
    this.pencere.el.addEventListener('esc', (e) => { if (this.ilerleme.calisiyor) { e.preventDefault(); this.ilerleme.iptalIste(); } });
    this.pencere.el.addEventListener('kapandi', () => { this._yaklasikIptal(this.ogeler); if (acikPencere === this) acikPencere = null; });

    // Sürükle-bırak (Pencere örtüsü olayları yakalar ve 'dosyaBirakildi' yayar)
    this.pencere.ortu.addEventListener('dragenter', () => this.liste.classList.add('surukle-uzerinde'));
    this.pencere.ortu.addEventListener('dragleave', (e) => { if (!this.pencere.ortu.contains(e.relatedTarget)) this.liste.classList.remove('surukle-uzerinde'); });
    this.pencere.el.addEventListener('dosyaBirakildi', (e) => {
      this.liste.classList.remove('surukle-uzerinde');
      const dt = e.detail?.dataTransfer;
      if (!dt || this.ilerleme.calisiyor) return;
      const yollar = [];
      for (const f of dt.files || []) { try { const y = this.baglam.pdefe.dosyaYolu(f); if (y) yollar.push(y); } catch { /* yok say */ } }
      if (yollar.length) this.dosyaEkle(yollar);
    });
    this.liste.addEventListener('click', (e) => this._tikla(e));
    // Sağ tık: satırda Listeden çıkar, boş alanda Dosya ekle (Birleştir'deki gibi)
    this.pencere.baglamMenusuEkle((e) => this._listeMenusu(e));
    this.ciz();
  }

  async _kapatmaIzni() {
    if (!this.ilerleme.calisiyor) return true;
    const { secim } = await this.baglam.mesajKutusu({ mesaj: 'Dönüştürme sürüyor.', ayrinti: 'Pencereyi kapatırsanız işlem iptal edilir; dönüştürülmekte olan dosyalar kaydedilmez.', dugmeler: ['İptal et ve kapat', 'Sürdür'], varsayilan: 1, iptal: 1 });
    if (secim !== 0) return false;
    this.ilerleme.iptalIste();
    return true;
  }

  _listeMenusu(e) {
    if (!e.target.closest('.donustur-liste') || this.ilerleme.calisiyor) return null;
    const satir = e.target.closest('.donustur-oge');
    if (!satir) return [{ id: 'ekle', etiket: 'Dosya ekle', calistir: () => this.dosyaSec() }];
    const o = this._oge(+satir.dataset.kimlik);
    if (!o) return null;
    return [
      { id: 'goster', etiket: MAC ? 'Finder\'da göster' : 'Klasörde göster', calistir: () => this.baglam.pdefe.cagir('kabuk:klasordeGoster', o.yol) },
      { ayirici: true },
      { id: 'cikar', etiket: 'Listeden çıkar', calistir: () => this.sil(o) },
    ];
  }

  // ---------------------------------------------------------------- yetenekler
  /** Dönüştürmelerin bu bilgisayarda yapılıp yapılamayacağı (UYAP Doküman Editörü, Word…). UYAP Doküman Editörü'nün klasörünü ana süreç
   *  ayardan verir. Alınamazsa null: satırlardaki hedefler çekirdeğin donusum_bilgi yanıtından yine okunur. */
  async _yetenekYenile() {
    try { this.yetenekler = await this.baglam.cekirdek('donusum_yetenekleri', {}); } catch (e) { console.warn('[dönüştür] yetenekler alınamadı', e); this.yetenekler = null; }
    if (!this.pencere?.kapali) for (const o of this.ogeler) this._ogeCiz(o);
    return this.yetenekler;
  }

  /** UYAP Doküman Editörü bulunamadı mı (yetenek bilgisi geldiyse). */
  _udeYok() { const u = this.yetenekler?.udf?.ude; return !!u && u.var === false; }

  /** UDF → PDF bu bilgisayarda UYAP Doküman Editörü'yle yapılamıyor mu (editör, Java ya da köprü yok): UDF'ler yaklaşık çizilir. */
  _udfYaklasik() { return this.yetenekler?.udf?.var === false; }

  /** Yaklaşık PDF'ten bu hedefe gidilebilir mi: PDF'in kendisi, TIFF ve Word çekirdeğin PDF → TIFF / Word'üyle. */
  _yaklasikHedefVar(bicim) { return bicim === 'pdf' || ((bicim === 'tiff' || bicim === 'word') && this.yetenekler?.donusumler?.[`pdf>${bicim}`]?.var === true); }

  /** Satırda ve sonuçta gösterilen uyarı. neden: çekirdeğin "desteklenmiyor" nedeni (editör bulunduğu hâlde dönüştüremediyse). */
  _yaklasikUyarisi(neden = null) {
    const n = neden || (this._udeYok() ? null : this.yetenekler?.udf?.neden);
    const bas = n ? String(n).trim().replace(/[.\s]+$/, '') : 'UYAP Doküman Editörü bulunamadı';
    return `${bas}; görünüm yaklaşık (satır ve sayfa kırılımları editördekinden farklı olabilir).`;
  }

  /** UDF satırının bu hedefi yaklaşık çizimle mi yapılır: { var: true, yaklasik: true } | { var: false, neden } (yaklaşık PDF'ten bu hedefe
   *  gidilemiyor) | null (yaklaşık yol bu satır için değil: editör kullanılabiliyor ya da satıra özgü neden var: bozuk, güvensiz paket). */
  _yaklasikDurumu(o, bicim, h) {
    const udf = this.yetenekler?.udf;
    if (o.tur !== 'udf' || bicim === 'udf' || !udf || udf.var !== false) return null;
    if (h?.neden && udf.neden && h.neden !== udf.neden) return null;
    if (this._yaklasikHedefVar(bicim)) return { var: true, neden: null, yaklasik: true };
    const d = this.yetenekler?.donusumler?.[`pdf>${bicim}`];
    const parca = bicim === 'word' ? (this.yetenekler?.pdf_word || this.yetenekler?.word) : null;
    const neden = d?.neden || (parca?.neden && !/^Bu sürümde yok\.?$/.test(parca.neden) ? parca.neden : null);
    return { var: false, neden: neden || (bicim === 'word' ? 'Word dönüştürmesi bu sürümde yok.' : `UDF → ${BICIM[bicim]?.ad || bicim} dönüştürmesi yapılamıyor.`) };
  }

  /** Satırdaki "UYAP Doküman Editörü'nün yerini göster": ana süreç klasör seçtirir, çekirdek o klasörde bulursa ayara yazar. Sonra
   *  yetenekler ve UDF satırları yenilenir. */
  async udeYeriniGoster() {
    let r = null;
    try { r = await this.baglam.pdefe.cagir('ayar:udeKlasoruSec'); } catch (e) { this.baglam.bildir('Klasör seçilemedi: ' + hataMetni(e)); return; }
    if (!r || this.pencere.kapali) return;
    if (!r.kaydedildi) { this.baglam.bildir(r.neden || 'Seçilen klasörde UYAP Doküman Editörü bulunamadı.', 6000); return; }
    const a = this.baglam.ayar?.();
    if (a) a.udeYolu = r.yol;   // bu pencerenin ayar kopyası (öteki pencerelere ana süreç bildirir)
    if (r.yetenekler) this.yetenekler = r.yetenekler;
    await this._yetenekYenile();
    for (const o of this.ogeler) if (o.tur === 'udf') this._bilgiYukle(o);
    this.baglam.bildir('UYAP Doküman Editörü bulundu' + (this.yetenekler?.udf?.ude?.surum ? ` (sürüm ${this.yetenekler.udf.ude.surum})` : '') + '.', 4000);
  }

  // ---------------------------------------------------------------- dosya ekleme
  async dosyaSec() {
    if (this.ilerleme.calisiyor) return;
    const yollar = await this.baglam.pdefe.cagir('dosya:acDiyalog', { baslik: 'Dönüştürülecek dosyalar', filtreler: DOSYA_FILTRELERI, coklu: true });
    if (yollar?.length && !this.pencere.kapali) this.dosyaEkle(yollar);
  }

  /** Yolları listeye ekler (listede olanlar atlanır); tür çekirdekte dosyanın içeriğinden belirlenir. Eklenen dosya sayısını döner. */
  dosyaEkle(yollar) {
    if (this.ilerleme.calisiyor) { this.baglam.bildir('Dönüştürme sürerken dosya eklenemez.'); return 0; }
    const yeniler = [];
    let zatenVar = 0;
    for (const yol of yollar) {
      if (typeof yol !== 'string' || !yol) continue;
      if (this.ogeler.some((o) => yolAyni(o.yol, yol)) || yeniler.some((o) => yolAyni(o.yol, yol))) { zatenVar++; continue; }
      yeniler.push({
        kimlik: ++this.kimlikSayac, yol, ad: dosyaAdi(yol), tur: null, alt: null, boyut: null, sayfa: null, png: null, hedefler: new Map(),
        hedefBicim: null, uyari: null, onizlemeUyarisi: null, acilmadi: false, hata: null, yukleniyor: true, onizleniyor: false,
      });
    }
    if (zatenVar) this.baglam.bildir(zatenVar === 1 ? 'Dosya zaten listede.' : `${zatenVar} dosya zaten listede.`, 3000);
    if (!yeniler.length) return 0;
    this.sonucEl.hidden = true;
    this.ogeler.push(...yeniler);
    this.ciz();
    this.liste.querySelector(`.donustur-oge[data-kimlik="${yeniler[yeniler.length - 1].kimlik}"]`)?.scrollIntoView({ block: 'nearest' });
    for (const o of yeniler) this._bilgiYukle(o);
    return yeniler.length;
  }

  /** donusum_bilgi'den istenecek küçük resim genişliği (cihaz pikseli): kutunun kenarı × ekran ölçeği (en çok 2), en az 120. */
  _kucukResimGenisligi() {
    const v = parseFloat(getComputedStyle(this.liste).getPropertyValue('--donustur-resim'));
    const kutu = Number.isFinite(v) && v > 0 ? v : KUTU_VARSAYILAN;
    return Math.max(KUCUK_RESIM_EN_AZ, Math.ceil(kutu * Math.min(2, window.devicePixelRatio || 1)));
  }

  /** Satırın türü, sayfa sayısı, hedefleri ve küçük resmi. UDF'nin ön izlemesi (UYAP Doküman Editörü, ilk belgede birkaç saniye) ayrı
   *  istekle sonradan gelir: tür ve hedefler hemen görünür, dönüştürme ön izlemeyi beklemez. */
  async _bilgiYukle(o) {
    o.yukleniyor = true;
    this._ogeCiz(o);
    try {
      const b = await this.baglam.cekirdek('donusum_bilgi', { yol: o.yol, genislik: this._kucukResimGenisligi(), onizleme: false });
      await this.yetenekSozu;
      if (this.pencere.kapali || !this.ogeler.includes(o)) return;
      this._bilgiUygula(o, b);
    } catch (e) {
      if (this.pencere.kapali || !this.ogeler.includes(o)) return;
      Object.assign(o, { yukleniyor: false, hata: hataMetni(e), tur: null });
    }
    this._ogeCiz(o);
    this._durumGuncelle();
    if (!o.hata && !o.png && o.tur === 'udf') {
      if (this._udfYaklasik()) this._yaklasikOnizlemeYukle(o);
      else if (!this._udeYok()) this._onizlemeYukle(o);
    }
  }

  _bilgiUygula(o, b) {
    Object.assign(o, {
      tur: b?.tur || 'bilinmeyen', alt: b?.alt || b?.udfAlt || null, boyut: b?.boyut ?? null, sayfa: b?.sayfa ?? null, png: b?.png || null,
      uyari: b?.uyari || null, onizlemeUyarisi: b?.onizlemeUyarisi || null, acilmadi: !!b?.acilmadi, yukleniyor: false, hata: null,
      hedefler: new Map((Array.isArray(b?.hedefler) ? b.hedefler : []).map((h) => [h.bicim, h])),
    });
    if (o.tur === 'bilinmeyen') { o.hata = b?.uyari || 'Dosyanın biçimi tanınmadı. PDF, UDF, TIFF ve Word dosyaları dönüştürülebilir.'; o.uyari = null; return; }
    if (!o.hedefBicim || o.hedefBicim === o.tur || !this._hedefDurumu(o, o.hedefBicim).var) o.hedefBicim = this._varsayilanHedef(o);
  }

  async _onizlemeYukle(o) {
    if (o.onizleniyor) return;
    o.onizleniyor = true;
    this._ogeCiz(o);
    try {
      const b = await this.baglam.cekirdek('donusum_bilgi', { yol: o.yol, genislik: this._kucukResimGenisligi(), onizleme: true });
      if (this.pencere.kapali || !this.ogeler.includes(o)) return;
      if (b?.png) o.png = b.png;
      if (b?.sayfa != null) o.sayfa = b.sayfa;
      o.onizlemeUyarisi = b?.onizlemeUyarisi || null;
      o.acilmadi = !!b?.acilmadi;
    } catch (e) {
      if (this.pencere.kapali) return;
      o.onizlemeUyarisi = 'Ön izleme alınamadı: ' + hataMetni(e);
    } finally { o.onizleniyor = false; }
    this._ogeCiz(o);
  }

  /** UYAP Doküman Editörü kullanılamıyorken UDF'nin küçük resmi ve sayfa sayısı yaklaşık çizimden (ana süreç). Belge çizilemezse nedeni
   *  satırda ("Belge açılamadı: …"). */
  async _yaklasikOnizlemeYukle(o) {
    if (o.onizleniyor) return;
    o.onizleniyor = true;
    this._ogeCiz(o);
    // İstek kimliğiyle: satır çıkarılınca, liste temizlenince ya da pencere kapanınca sıradaki çizim iptal edilir (_yaklasikIptal)
    const istekId = o.yaklasikIstek = ++yaklasikSayac;
    try {
      const b = await this.baglam.pdefe.cagir('udf:yaklasikBilgi', { yol: o.yol, genislik: this._kucukResimGenisligi(), istekId });
      if (this.pencere.kapali || !this.ogeler.includes(o)) return;
      if (b?.png) o.png = b.png;
      if (b?.sayfa != null) o.sayfa = b.sayfa;
      o.onizlemeUyarisi = null;
      o.acilmadi = false;
    } catch (e) {
      if (this.pencere.kapali || !this.ogeler.includes(o)) return;
      o.onizlemeUyarisi = 'Belge açılamadı: ' + hataMetni(e);
      o.acilmadi = true;
    } finally { o.onizleniyor = false; if (o.yaklasikIstek === istekId) o.yaklasikIstek = null; }
    this._ogeCiz(o);
  }

  /** Satırların süren / sıradaki yaklaşık küçük resim çizimlerini iptal eder (ana süreç udf:yaklasikIptal). */
  _yaklasikIptal(ogeler) {
    for (const o of ogeler) {
      if (o.yaklasikIstek == null) continue;
      this.baglam.pdefe.cagir('udf:yaklasikIptal', { istekId: o.yaklasikIstek }).catch(() => false);
      o.yaklasikIstek = null;
    }
  }

  // ---------------------------------------------------------------- hedefler
  /** Hedefin bu satır için durumu: {var, neden}. Çekirdek bu dönüştürmeyi hiç sunmuyorsa (ör. Word dönüştürücüsü bu sürümde yok) neden
   *  yeteneklerden. */
  _hedefDurumu(o, bicim) {
    const h = o.hedefler?.get(bicim);
    if (h && h.var !== false) return { var: true, neden: null };
    // UYAP Doküman Editörü'yle yapılamıyorsa UDF'nin yaklaşık çizimi (PDF; TIFF ve Word yaklaşık PDF'ten)
    const yd = this._yaklasikDurumu(o, bicim, h);
    if (yd) return yd;
    if (h) return { var: false, neden: h.neden || 'Bu dönüştürme bu bilgisayarda yapılamıyor.' };
    const y = this.yetenekler;
    const d = y?.donusumler?.[`${o.tur}>${bicim}`];
    let neden = d?.neden || null;
    // Word → PDF'in yeteneği word (Word ya da LibreOffice), PDF → Word'ünkü pdf_word (çekirdeğin donusum_yetenekleri'nde)
    const parca = o.tur === 'word' ? y?.word : bicim === 'word' ? (y?.pdf_word || y?.word) : null;
    if (!neden && parca && parca.var === false) {
      neden = parca.neden && !/^Bu sürümde yok\.?$/.test(parca.neden) ? parca.neden : 'Word dönüştürmesi bu sürümde yok.';
    }
    return { var: false, neden: neden || `${TUR_ADI[o.tur] || 'Bu dosya'} → ${BICIM[bicim]?.ad || bicim} dönüştürmesi yapılamıyor.` };
  }

  /** Önerilen hedef: o türün son seçilen hedefi, yoksa PDF girdide UDF, ötekilerde PDF; yapılamıyorsa sıradaki yapılabilen. */
  _varsayilanHedef(o) {
    const kayitli = this.baglam.ayar?.()?.donusturme?.hedefler?.[o.tur];
    const adaylar = [kayitli, o.tur === 'pdf' ? 'udf' : 'pdf', ...BICIMLER.map((b) => b.id)].filter((b) => b && BICIM[b] && b !== o.tur);
    return adaylar.find((b) => this._hedefDurumu(o, b).var) || adaylar[0] || null;
  }

  /** Kullanıcı satırın hedefini seçti: o türün son seçimi kalıcı hatırlanır. */
  hedefSec(o, bicim) {
    if (!o || !BICIM[bicim] || bicim === o.tur) return;
    o.hedefBicim = bicim;
    const a = this.baglam.ayar?.() || {};
    const onceki = a.donusturme && typeof a.donusturme === 'object' ? a.donusturme : {};
    if (onceki.hedefler?.[o.tur] !== bicim) {
      try { this.baglam.ayarKoy?.('donusturme', { ...onceki, hedefler: { ...(onceki.hedefler || {}), [o.tur]: bicim } }); } catch (e) { console.warn('[dönüştür] seçim kaydedilemedi', e); }
    }
    this.sonucEl.hidden = true;
    this._ogeCiz(o);
    this._durumGuncelle();
  }

  /** Dönüştürülebilecek satırlar (tür bilinen, hatasız, seçili hedefi bu bilgisayarda yapılabilen), liste sırasıyla. */
  _donusecekler() { return this.ogeler.filter((o) => !o.yukleniyor && !o.hata && o.tur && o.hedefBicim && this._hedefDurumu(o, o.hedefBicim).var); }

  /** Seçili hedefin çekirdek seçenekleri (yalnızca TIFF: çözünürlük ve renk). */
  _secenekler(o) { return o.hedefBicim === 'tiff' ? { dpi: tiffSecimi.dpi, renk: tiffSecimi.renk } : {}; }

  // ---------------------------------------------------------------- liste işlemleri
  _oge(kimlik) { return this.ogeler.find((o) => o.kimlik === kimlik); }

  sil(o) {
    if (this.ilerleme.calisiyor) return;
    this._yaklasikIptal([o]);
    this.ogeler = this.ogeler.filter((x) => x !== o);
    this.sonucEl.hidden = true;
    this.ciz();
  }

  _tikla(e) {
    const el = e.target.closest('.donustur-oge');
    if (!el) return;
    const o = this._oge(+el.dataset.kimlik);
    if (!o) return;
    if (e.target.closest('[data-komut="sil"]')) this.sil(o);
    else if (e.target.closest('[data-komut="ude"]')) this.udeYeriniGoster();
  }

  // ---------------------------------------------------------------- çizim
  ciz() {
    this.liste.innerHTML = '';
    this.liste.classList.toggle('bos', !this.ogeler.length);
    if (!this.ogeler.length) {
      this.liste.append(oge(`<div class="bos-mesaj"><b>Dosyaları buraya sürükleyin</b><span>ya da "Dosya ekle" düğmesini kullanın.</span><span class="soluk">PDF, UDF, TIFF, Word (DOC, DOCX, RTF, ODT)</span></div>`));
    }
    for (const o of this.ogeler) { this.liste.append(this._ogeOlustur(o)); this._ogeCiz(o); }
    this._durumGuncelle();
  }

  _ogeOlustur(o) {
    const el = oge(`<div class="donustur-oge" data-kimlik="${o.kimlik}">
      <div class="resim"><div class="yer"></div></div>
      <div class="bilgi">
        <span class="ad secilebilir" title="${kacis(o.yol)}">${kacis(o.ad)}</span>
        <span class="ozet secilebilir"></span>
        <div class="hedef-satiri" hidden><span class="hedef-etiket">${SVG.ok}<span>Hedef</span></span><span class="hedef-secimi"></span></div>
        <span class="neden" hidden></span>
        <span class="uyari secilebilir" hidden></span>
        <span class="hata secilebilir" hidden></span>
      </div>
      <div class="dugmeler"><button class="ikon" data-komut="sil" title="Listeden çıkar" aria-label="Listeden çıkar">${SVG.sil}</button></div>
    </div>`);
    return el;
  }

  _ogeCiz(o) {
    const el = this.liste.querySelector(`.donustur-oge[data-kimlik="${o.kimlik}"]`);
    if (!el) return;
    el.classList.toggle('yukleniyor', !!o.yukleniyor);
    el.classList.toggle('hatali', !!o.hata);
    el.dataset.tur = o.tur || '';
    el.querySelector('[data-komut="sil"]').disabled = this.ilerleme.calisiyor;
    // Küçük resim; yoksa türün simgesi (Word'ün, ön izlemesi alınamayan UDF'nin)
    const resim = el.querySelector('.resim');
    if (o.png) {
      let img = resim.querySelector('img');
      if (!img || img.dataset.png !== String(o.png.length)) {
        resim.innerHTML = '';
        img = document.createElement('img'); img.src = 'data:image/png;base64,' + o.png; img.alt = o.ad; img.draggable = false; img.dataset.png = String(o.png.length);
        resim.append(img);
      }
    } else {
      resim.innerHTML = `<div class="yer" data-tur="${kacis(o.tur || '')}">${o.yukleniyor ? '' : kacis(turEtiketi(o))}</div>`;
    }
    resim.classList.toggle('onizleniyor', !!o.onizleniyor && !o.png);
    // Özet: tür · sayfa · boyut
    const parcalar = [];
    if (o.yukleniyor) parcalar.push('okunuyor…');
    else {
      parcalar.push(`<span class="tur">${kacis(turEtiketi(o))}</span>`);
      if (o.sayfa != null) parcalar.push(`${sayiMetni(o.sayfa)} sayfa`);
      else if (o.onizleniyor) parcalar.push('sayfalar sayılıyor…');
      if (o.boyut != null) parcalar.push(boyutMetni(o.boyut));
    }
    el.querySelector('.ozet').innerHTML = parcalar.join(' · ');
    // Hedef seçimi (kendi türü hariç); yapılamayan hedef soluk, nedeni ipucunda
    const hedefSatiri = el.querySelector('.hedef-satiri');
    const goster = !o.yukleniyor && !o.hata && !!o.tur && o.tur !== 'bilinmeyen';
    hedefSatiri.hidden = !goster;
    if (goster) {
      const anahtar = o.tur;
      if (!o.secim || o._secimTuru !== anahtar) {
        o.secim = segmentliSecim({
          etiket: 'Hedef biçim', deger: o.hedefBicim, sinif: 'donustur-hedef-secim',
          secenekler: BICIMLER.filter((b) => b.id !== o.tur).map((b) => ({ id: b.id, etiket: b.ad })),
          degisti: (id) => this.hedefSec(o, id),
        });
        o._secimTuru = anahtar;
      }
      const yer = hedefSatiri.querySelector('.hedef-secimi');
      if (o.secim.el.parentElement !== yer) { yer.innerHTML = ''; yer.append(o.secim.el); }
      for (const b of BICIMLER) {
        if (b.id === o.tur) continue;
        const d = this._hedefDurumu(o, b.id);
        o.secim.etkin(b.id, d.var && !this.ilerleme.calisiyor);
        const dg = o.secim.dugme(b.id);
        if (dg) { dg.title = d.var ? `${b.yonelme} dönüştür (.${b.uzanti})${d.yaklasik ? '; görünüm yaklaşık' : ''}` : d.neden; dg.classList.toggle('yapilamaz', !d.var); }
      }
      if (o.hedefBicim) o.secim.sec(o.hedefBicim);
    }
    // Seçili hedef yapılamıyorsa nedeni, yaklaşık çizimle yapılacaksa uyarısı; UYAP Doküman Editörü bulunamadıysa yerini gösterme bağlantısı
    const nedenEl = el.querySelector('.neden');
    const durum = goster && o.hedefBicim ? this._hedefDurumu(o, o.hedefBicim) : { var: true };
    const yaklasik = !!(durum.var && durum.yaklasik);
    nedenEl.hidden = durum.var && !yaklasik;
    nedenEl.classList.toggle('yaklasik', yaklasik);
    if (!durum.var || yaklasik) {
      nedenEl.innerHTML = `<span class="metin"></span>`;
      nedenEl.querySelector('.metin').textContent = yaklasik ? this._yaklasikUyarisi() : `${BICIM[o.hedefBicim]?.yonelme || ''} dönüştürülemez: ${durum.neden}`;
      if (o.tur === 'udf' && this._udeYok()) nedenEl.append(oge(`<button type="button" class="donustur-baglanti" data-komut="ude" title="${kacis(UDE_YOK_IPUCU)}">UYAP Doküman Editörü'nün yerini göster</button>`));
    }
    // Uyarılar: çekirdeğin (e-imza, açılamayan UDF), uzantısı içeriğiyle uyuşmayan dosya
    const uyarilar = [];
    if (!o.hata && o.uyari) uyarilar.push(o.uyari);
    if (!o.hata && o.acilmadi && o.onizlemeUyarisi) uyarilar.push(o.onizlemeUyarisi);
    const beklenen = UZANTI_TURU[uzanti(o.yol)];
    if (!o.hata && o.tur && TUR_ADI[o.tur] && beklenen && beklenen !== o.tur) uyarilar.push(`Dosyanın içeriği ${TUR_ADI[o.tur]} (uzantısı .${uzanti(o.yol)}).`);
    const uyariEl = el.querySelector('.uyari');
    uyariEl.hidden = !uyarilar.length;
    uyariEl.textContent = uyarilar.join(' ');
    const hata = el.querySelector('.hata');
    hata.hidden = !o.hata; hata.textContent = o.hata || '';
  }

  /** Özet, Dönüştür düğmesi, TIFF seçenekleri ve Kaydet bölümü (tek dosya: ad ve uzantı; birden çok dosya: yalnızca klasör). */
  _durumGuncelle() {
    if (this.pencere?.kapali) return;
    const n = this.ogeler.length;
    const donusecek = this._donusecekler();
    const yukleniyor = this.ogeler.some((o) => o.yukleniyor);
    this.ozetEl.textContent = n ? `${sayiMetni(n)} dosya${donusecek.length !== n && !yukleniyor ? ` · ${sayiMetni(donusecek.length)} dosya dönüştürülebilir` : ''}` : '';
    this.govde.querySelector('.donustur-temizle').disabled = !n || this.ilerleme.calisiyor;
    this.govde.querySelector('.donustur-ekle').disabled = this.ilerleme.calisiyor;
    this.pencere?.dugmeAyarla('donustur', { devre: !donusecek.length || yukleniyor || this.ilerleme.calisiyor });
    this.seceneklerEl.hidden = !donusecek.some((o) => o.hedefBicim === 'tiff');
    // Tek dosyada önerilen ad girdinin adı + yeni uzantı; birden çok dosyada adları araç verir
    const adaylar = donusecek.length ? donusecek : this.ogeler.filter((o) => !o.hata && o.tur && o.hedefBicim);
    const coklu = adaylar.length > 1;
    this.kayit.cokluAyarla(coklu);
    this.kayit.klasorKipi(coklu);
    this.adlarEl.hidden = !coklu;
    const ilk = adaylar[0];
    if (!coklu && ilk) {
      this.kayit.adAyarla(adGovdesi(ilk.ad) || 'Dönüştürülmüş');
      this.kayit.uzantiAyarla(BICIM[ilk.hedefBicim]?.uzanti || 'pdf');
    }
  }

  // ---------------------------------------------------------------- dönüştürme
  /** Dönüştürür; tek dosyada kilitli / salt okunur hedef sorusunda "Yeniden dene" ya da "Başka adla kaydet" seçilirse yeniden çalışır. */
  async donustur() {
    if (this.ilerleme.calisiyor || this._suruyor) return;
    this._suruyor = true;
    try {
      while (!this.pencere.kapali && await this._donusturBir());
    } finally { this._suruyor = false; if (!this.pencere.kapali) this._durumGuncelle(); }
  }

  /** Birden çok dosyanın hedefleri: seçilen klasörde girdinin adı + uzantı; var olan dosya, listedeki bir dosya ya da aynı istekteki başka
   *  bir hedef varsa "(2)", "(3)"… */
  async _hedefYollari(ogeler, klasor) {
    const kullanilan = new Set(this.ogeler.map((o) => o.yol.replace(/\//g, '\\').toLowerCase()));
    const sonuc = [];
    for (const o of ogeler) {
      const uz = BICIM[o.hedefBicim].uzanti;
      const govde = guvenliAd(adGovdesi(o.ad));
      let yol = null;
      for (let i = 1; i < 1000 && !yol; i++) {
        const aday = yolBirlestir(klasor, `${govde}${i > 1 ? ` (${i})` : ''}.${uz}`);
        const anahtar = aday.replace(/\//g, '\\').toLowerCase();
        if (kullanilan.has(anahtar)) continue;
        if (await this.baglam.pdefe.cagir('dosya:varMi', aday).catch(() => false)) continue;
        yol = aday;
        kullanilan.add(anahtar);
      }
      if (!yol) { yol = yolBirlestir(klasor, `${govde}_${Date.now()}.${uz}`); kullanilan.add(yol.toLowerCase()); }
      sonuc.push({ o, hedef: yol });
    }
    return sonuc;
  }

  /** Listedeki, PDEfe'de kaydedilmemiş değişiklikle açık PDF'ler (her biri bir kez): dönüştürme dosyadaki kayıtlı sürümle yapılır. */
  _kirliAcikBelgeler(ogeler) {
    const sonuc = [];
    for (const o of ogeler) {
      if (o.tur !== 'pdf') continue;
      const b = acikBelge(this.baglam, o.yol);
      if (b?.degisti && !sonuc.includes(b)) sonuc.push(b);
    }
    return sonuc;
  }

  /** Bir dönüştürme denemesi; yeniden denenecekse true döner. */
  async _donusturBir() {
    const { baglam } = this;
    if (this.ogeler.some((o) => o.yukleniyor)) { baglam.bildir('Dosyalar hâlâ okunuyor; bitince yeniden deneyin.'); return false; }
    const hazir = this._donusecekler();
    if (!hazir.length) { baglam.bildir('Dönüştürülebilecek dosya yok.'); return false; }
    const disarida = this.ogeler.filter((o) => !hazir.includes(o));
    if (disarida.length) {
      const adlar = disarida.slice(0, 6).map((o) => o.ad).join('\n') + (disarida.length > 6 ? `\nve ${disarida.length - 6} dosya daha` : '');
      const { secim } = await baglam.mesajKutusu({ mesaj: disarida.length === 1 ? 'Bir dosya dönüştürülemiyor.' : `${disarida.length} dosya dönüştürülemiyor.`, ayrinti: `${adlar}\n\nÖteki dosyalar dönüştürülsün mü?`, dugmeler: ['Atla ve devam et', 'Vazgeç'], varsayilan: 0, iptal: 1 });
      if (secim !== 0 || this.pencere.kapali) return false;
    }
    for (const b of this._kirliAcikBelgeler(hazir)) {
      if ((await degisiklikleriSor(baglam, b, 'Dönüştürme')) === 'vazgec' || this.pencere.kapali) return false;
    }
    // Ad, klasör, var olan dosya sorusu (tek dosyada), var olan hedef kilitli ya da salt okunur mu
    await this.kayit.hazir;
    const denetim = await this.kayit.denetle();
    if (this.pencere.kapali || denetim === 'vazgec') return false;
    if (denetim instanceof Error) return this.kayit.hataSor(denetim);
    const coklu = this.kayit.coklu();
    let isler;
    if (!coklu) {
      const hedef = this.kayit.hedef();
      if (this.ogeler.some((o) => yolAyni(o.yol, hedef))) { baglam.bildir('Kaydedilecek dosya, listedeki dosyalardan biriyle aynı olamaz. Başka bir ad seçin.', 4000); return false; }
      isler = [{ o: hazir[0], hedef }];
    } else {
      isler = await this._hedefYollari(hazir, this.kayit.cikti.klasor());
    }
    if (this.pencere.kapali) return false;
    for (const x of isler) x.yaklasik = this._hedefDurumu(x.o, x.o.hedefBicim).yaklasik === true;
    // İptal dosyalar yazıldıktan sonra ulaşırsa yalnızca yeni oluşan dosyalar silinir; var olanın (onaylanmış) yerine yazılmışsa sonuç kalır
    const vardi = new Map();
    for (const { hedef } of isler) vardi.set(hedef, await baglam.pdefe.cagir('dosya:varMi', hedef).catch(() => true));
    this.pencere.hataGoster('');
    this.sonucEl.hidden = true;
    this.pencere.el.classList.add('mesgul');
    for (const o of this.ogeler) this._ogeCiz(o);
    this._durumGuncelle();
    let sonuc = null, gecIptal = false;
    try {
      // Çekirdeğin bicim_donustur'u ve UDF'nin yaklaşık çizimi tek iş olarak (ilerleme ve iptal IslemIlerleme'nin; _karmaDonustur)
      sonuc = await this.ilerleme.calistir({ cekirdek: (_yontem, _p, ilerleme) => this._karmaDonustur(isler, ilerleme) }, 'bicim_donustur', null,
        { baslangicMesaji: isler.length > 1 ? `${sayiMetni(isler.length)} dosya dönüştürülüyor…` : 'Dönüştürülüyor…' });
    } catch (e) {
      this.ilerleme.gizle();
      if (e.iptal && e.sonuc) { sonuc = e.sonuc; gecIptal = true; }
      else if (e.iptal) { baglam.bildir('Dönüştürme iptal edildi; hiçbir dosya kaydedilmedi.', 4000); return false; }
      else { if (!this.pencere.kapali) this.pencere.hataGoster('Dönüştürme başarısız: ' + hataMetni(e)); return false; }
    } finally {
      if (!this.pencere.kapali) {
        this.pencere.el.classList.remove('mesgul');
        for (const o of this.ogeler) this._ogeCiz(o);
      }
    }
    const sonuclar = Array.isArray(sonuc?.sonuclar) ? sonuc.sonuclar : [];
    if (gecIptal) {
      // Çekirdek yerine koymaya başlayınca iptale bakmaz: yeni oluşan dosyalar çöp kutusuna, onaylanıp üzerine yazılan dosya kalır
      const kalan = [];
      for (const r of sonuclar) {
        if (r.hata) continue;
        if (vardi.get(r.hedef)) kalan.push(r);
        else { try { await baglam.pdefe.cagir('dosya:sil', r.hedef); } catch { /* yok say */ } }
      }
      if (!kalan.length) { baglam.bildir('Dönüştürme iptal edildi.', 4000); return false; }
      baglam.bildir(`İptal edilemeden tamamlandı: "${dosyaAdi(kalan[0].hedef)}" üzerine yazıldı.`, 6000);
      return this._sonucGoster(kalan, { tek: !coklu });
    }
    if (this.pencere.kapali) return false;
    // Tek dosya kilitli ya da salt okunur hedefe yazılamadı: kaydetme seçimi sorar (Yeniden dene, Başka adla kaydet); hiçbir dosya değişmedi
    if (!coklu && sonuclar.length === 1 && sonuclar[0].hata && (['kilitli', 'salt_okunur'].includes(sonuclar[0].kod) || kilitliHataMi(new Error(sonuclar[0].hata)))) {
      return this.kayit.hataSor(new Error(sonuclar[0].hata));
    }
    return this._sonucGoster(sonuclar, { tek: !coklu });
  }

  /**
   * Dönüştürme işi: yaklaşık olmayan öğeler çekirdeğin bicim_donustur'una, UDF'nin yaklaşık çizimi gereken öğeler (x.yaklasik) ve çekirdeğin
   * "desteklenmiyor" diye dönüştüremediği UDF'ler ana sürecin udf:yaklasikDonustur'una. Döner: çekirdeğinkiyle aynı biçimde { sonuclar (isler
   * sırasıyla), basarili, hatali } sözü ve iptal() işlevi (süren adıma iletilir). İptal ilk adım yazmadan önce gelirse söz iptal hatasıyla
   * reddedilir; çekirdek dosyalarını yazdıktan sonra gelirse kalan yaklaşık öğeler "İptal edildi" sonucu alır (araç geç iptalde yeni oluşan
   * dosyaları çöp kutusuna gönderir).
   */
  _karmaDonustur(isler, ilerleme) {
    const { baglam } = this;
    let iptal = false, suren = null;
    const sonuclar = new Map();
    const param = (x) => ({ yol: x.o.yol, hedef: x.hedef, hedefBicim: x.o.hedefBicim, secenekler: this._secenekler(x.o) });
    const hataSonucu = (x, hata, kod = 'hata') => ({ yol: x.o.yol, hedef: x.hedef, hedefBicim: x.o.hedefBicim, hata, kod });
    const olagan = isler.filter((x) => !x.yaklasik);
    const yaklasikIlk = isler.filter((x) => x.yaklasik);
    const pay = olagan.length / Math.max(1, olagan.length + yaklasikIlk.length);   // ilerleme çubuğunda çekirdeğin payı
    const aralik = (bas, son) => (p) => ilerleme?.({ yuzde: (bas + ((son - bas) * Math.max(0, Math.min(100, Number(p?.yuzde) || 0))) / 100) * 100, mesaj: p?.mesaj });
    const is = (async () => {
      let yedek = [];
      if (olagan.length) {
        suren = baglam.cekirdek('bicim_donustur', { ogeler: olagan.map(param) }, aralik(0, pay));
        const r = await suren;
        const rs = Array.isArray(r?.sonuclar) ? r.sonuclar : [];
        olagan.forEach((x, i) => sonuclar.set(x, rs[i] || hataSonucu(x, 'Dönüştürme sonucu alınamadı.')));
        // UYAP Doküman Editörü bulundu ama bu belgeyi dönüştüremedi ("desteklenmiyor"): yaklaşık çizimle yeniden denenir
        yedek = olagan.filter((x) => x.o.tur === 'udf' && sonuclar.get(x)?.kod === 'desteklenmiyor' && this._yaklasikHedefVar(x.o.hedefBicim));
      }
      const yaklasik = [...yaklasikIlk, ...yedek];
      if (yaklasik.length) {
        const nedenler = new Map(yedek.map((x) => [x, sonuclar.get(x)?.hata || null]));
        const iptalSonucu = () => { if (!olagan.length) throw iptalHatasi(); for (const x of yaklasik) sonuclar.set(x, hataSonucu(x, 'İptal edildi.', 'iptal')); };
        if (iptal) iptalSonucu();
        else {
          suren = yaklasikDonustur(baglam.pdefe, yaklasik.map(param), aralik(pay, 1));
          let r = null;
          try { r = await suren; } catch (e) {
            if (!olagan.length) throw e;
            for (const x of yaklasik) sonuclar.set(x, hataSonucu(x, hataMetni(e)));
          }
          if (r?.iptal) iptalSonucu();
          else if (r) {
            const rs = Array.isArray(r.sonuclar) ? r.sonuclar : [];
            yaklasik.forEach((x, i) => {
              const s = rs[i];
              if (!s) sonuclar.set(x, hataSonucu(x, 'Dönüştürme sonucu alınamadı.'));
              else sonuclar.set(x, s.hata ? s : { ...s, uyari: [this._yaklasikUyarisi(nedenler.get(x)), s.uyari].filter(Boolean).join(' ') });
            });
          }
        }
      }
      const liste = isler.map((x) => sonuclar.get(x) || hataSonucu(x, 'Dönüştürülemedi.'));
      const basarili = liste.filter((r) => !r.hata).length;
      return { sonuclar: liste, basarili, hatali: liste.length - basarili };
    })();
    is.iptal = () => { iptal = true; try { suren?.iptal?.(); } catch { /* yok say */ } };
    return is;
  }

  /** Sonuç: tek çıktı PDF ise sekmede açılır ve pencere kapanır; değilse pencerede sonuç listesi. Döner: false (yeniden denenmez). */
  async _sonucGoster(sonuclar, { tek }) {
    const { baglam } = this;
    const basarili = sonuclar.filter((r) => !r.hata);
    const hatali = sonuclar.filter((r) => r.hata);
    if (tek && basarili.length === 1 && !hatali.length && basarili[0].hedefBicim === 'pdf') {
      const r = basarili[0];
      this.ilerleme.gizle();
      await this.pencere.kapat('tamam');
      baglam.bildir(`Dönüştürüldü: ${dosyaAdi(r.hedef)}${r.sayfa ? ' · ' + sayiMetni(r.sayfa) + ' sayfa' : ''}${r.boyut != null ? ' · ' + boyutMetni(r.boyut) : ''}${r.uyari ? '. ' + r.uyari : ''}`, r.uyari ? 9000 : 4000);
      await ciktiyiAc(baglam, r.hedef, { cikti: this.kayit.cikti });
      return false;
    }
    if (this.pencere.kapali) return false;
    this.ilerleme.gizle();
    if (tek && !basarili.length && hatali.length === 1) {
      this.pencere.hataGoster(`"${dosyaAdi(hatali[0].yol)}" dönüştürülemedi: ${hatali[0].hata}`);
      return false;
    }
    const s = this.sonucEl;
    s.hidden = false;
    s.className = `donustur-sonuc arac-sonuc-liste ${basarili.length ? 'arac-basari' : 'arac-uyari'}`;
    const toplam = basarili.reduce((t, r) => t + (r.boyut || 0), 0);
    const baslik = !basarili.length ? '<b>Hiçbir dosya dönüştürülemedi.</b>'
      : basarili.length === 1 && !hatali.length ? `<b>Dosya dönüştürüldü</b> · ${kacis(boyutMetni(toplam))}`
        : `<b>${sayiMetni(basarili.length)} dosya dönüştürüldü</b> · toplam ${kacis(boyutMetni(toplam))}${hatali.length ? ` · ${sayiMetni(hatali.length)} dosya dönüştürülemedi` : ''}`;
    const satirlar = sonuclar.map((r, i) => {
      if (r.hata) return `<li class="hatali"><span class="ad">${kacis(dosyaAdi(r.yol))}</span><span class="hata-metin">${kacis(r.hata)}</span></li>`;
      const ac = r.hedefBicim === 'pdf' ? `<button type="button" class="donustur-baglanti" data-ac="${i}" title="Yeni sekmede aç">Aç</button>` : '';
      return `<li><span class="ad" title="${kacis(r.hedef)}">${kacis(dosyaAdi(r.hedef))}</span><span class="soluk">${r.sayfa ? sayiMetni(r.sayfa) + ' sayfa' : ''}</span><span class="boyut">${kacis(boyutMetni(r.boyut))}</span>${ac}${r.uyari ? `<span class="uyari-metin">${kacis(r.uyari)}</span>` : ''}</li>`;
    });
    s.innerHTML = `<div>${baslik}</div><ul>${satirlar.join('')}</ul>${basarili.length ? `<div class="arac-satir" style="margin-top:6px"><button class="ikincil donustur-goster">${MAC ? 'Finder\'da göster' : 'Klasörde göster'}</button></div>` : ''}`;
    s.querySelector('.donustur-goster')?.addEventListener('click', () => baglam.pdefe.cagir('kabuk:klasordeGoster', basarili[0].hedef));
    for (const d of s.querySelectorAll('[data-ac]')) {
      d.addEventListener('click', async () => {
        const r = sonuclar[+d.dataset.ac];
        await baglam.dosyaAc(r.hedef, { arkaPlanda: true });
        baglam.bildir(`"${dosyaAdi(r.hedef)}" yeni sekmede açıldı.`, 3000);
      });
    }
    s.scrollIntoView({ block: 'nearest' });
    if (basarili.length) baglam.bildir(basarili.length === 1 ? `Dönüştürüldü: ${dosyaAdi(basarili[0].hedef)}` : `${sayiMetni(basarili.length)} dosya dönüştürüldü.`, 4000);
    return false;
  }
}

/** Aracı açar; açıksa öne getirir ve verilen dosyaları listeye ekler. Dosya verilmezse açık PDF (varsa) ilk girdidir. */
export function donusturAc(baglam, ilkDosyalar = []) {
  const acik = acikDonusturPenceresi();
  if (acik || pencereAcikMi('donustur')) {
    if (acik && ilkDosyalar.length) acik.dosyaEkle(ilkDosyalar);
    return acik;
  }
  const belge = baglam.aktif?.() || null;
  const ilk = ilkDosyalar.length ? ilkDosyalar : belge?.yol ? [belge.yol] : [];
  return new DonusturPenceresi(baglam, { ilkDosyalar: ilk });
}

