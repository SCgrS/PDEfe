// Dinamik XFA formları (0.3.1, kullanıcı isteği: "Bireysel başvuru formunda açabilir hale getireceğiz. bb formunda sayfa ekleme tuşunun
// çalışabilir, tüm fonksiyonların çalışabilir haline gelmesi lazım"). Saf XFA belgede (katalogda NeedsRendering, alanı olmayan AcroForm'da
// /XFA paketleri) sayfalar PDF'in kendi içeriği değil formun şablonudur: MuPDF yalnızca belgenin "lütfen bekleyin" sayfasını görür. Belge
// "XFA kipi"nde açılır: Sayfaları PDF.js XFA şablonundan dizer ve HTML olarak çizer (goruntuleyici.js xfaKatmaniCiz), alanlar doğrudan
// doldurulur (PDF.js annotationStorage). Karma belge (XFA paketli, AcroForm alanlı) bu kipe girmez, AcroForm yolunda kalır (formlar.js).
//
// Betikler çalıştırılmaz (genel JavaScript yok). Çekirdek şablondaki düğmelerin tıklama betiklerini form tasarım programının ürettiği eylem
// kalıplarıyla eşler (core/islemler/xfa.py xfa_bilgi): Örnek ekle / sil (addInstance, removeInstance), görünürlük (presence), Kaydet / Farklı
// kaydet / Yazdır. "Sayfa n / N" alanları sayfa numarasıyla dolar (xfaHtml.js). Betiği tanınmayan düğme "işlevi çalışmıyor" der.
//
// Örnek ekleme / silme: PDF.js formun güncel değerlerini XFA verisine yazar (saveDocument), çekirdek o alt formun veri grubunu ekler ya da
// siler (occur sınırına uyarak; sınırda kısa uyarı) ve eklediği bölümü döner, PDF.js formu yeni baytlarla yeniden dizer (xfaYenile; görünüm
// yerinde kalır). Değerler korunur, sayfa sayısı değişebilir. Geri alınabilir: Komut önceki ve sonraki baytları tutar (sonraki = önceki +
// çekirdeğin eklediği bölüm).
//
// Değerler: Alan değişince (change, alandan çıkma, Enter) komut yığınına "Form: <alanın adı>" girer. Alan, PDF.js'in veri kimliğiyle değil
// belgedeki sırasıyla (bütün sayfaların HTML'inde veri kimliklerinin ilk görüldüğü sıra) tutulur: Form yeniden dizilince kimlikler değişir,
// sıra değişmez (geri alma ters sırada gittiği için bir değer komutu, oluşturulduğu anki form yapısında geri alınır ya da yinelenir).
// Yeniden kurma ve değer koyma tek kuyrukta sırayla yürür (_kuyruk).
//
// Kaydetme: PDF.js'in kaydettiği baytlar (güncel XFA verisi) çekirdekte dosyaya baştan yazılır, kullanım hakları imzası (/Perms /UR3)
// kaldırılır (xfa_kaydet). Yazım atomiktir ve doğrulanır, başarısızlıkta özgün dosya aynı kalır, yazılanlar burada durur (uygulama.js belgeKaydet: Yeniden dene, Farklı kaydet).
// Yazdırma ve Sayfalar panelinin küçük resimleri formun düz PDF'inden: Ana süreç formu gizli pencerede aynı
// kurallarla çizip PDF'e çevirir (src/main/xfaDuz.js), yazdırma ve küçük resimler o dosyadan (çekirdek, olağan PDF gibi).
import { Komut, sayfaListesi } from './komutlar.js';
import { alanTasiyor, combGuncelle, yolUyar } from './xfaHtml.js';

const ALAN = 'input[data-xv], textarea[data-xv], select[data-xv]';
const DENETIM = 'input, textarea, select, button';
const TASMA_ILETISI = 'Yazı bu alana sığmıyor, sığmayan kısım basılmaz. Yazıyı kısaltın ya da formda varsa düğmeyle yeni sayfa ekleyin.';
const KATMAN_BEKLEME_MS = 2500;  // Tab başka sayfaya geçerken o sayfanın XFA katmanı en çok bu kadar beklenir
const YAPI_EYLEMLERI = new Set(['ekle', 'sil', 'gorunurluk']);
const KOMUT_EYLEMLERI = { kaydet: 'dosya.kaydet', farkliKaydet: 'dosya.farkliKaydet', yazdir: 'dosya.yazdir' };
const DUZ_BEKLEME_MS = 2000;     // değişiklikten sonra küçük resimlerin düz PDF'i bu kadar beklenip yenilenir
const AD_UZUNLUGU = 48;          // komut adındaki alan adının en çok karakteri (geri al listeleri)
const INCE_KAT = 8;              // xfaHtml.js ince: Çerçevenin köşe yarıçapı bu kat büyük yazılı

/** Değerin form verisine yazılan hâli. PDF.js formu dizerken değerin boş satırlarını atıyor (Text: split().filter(Boolean)): Paragraflar arasındaki
 *  boş satır düğmeye basınca, yazdırınca ve dosya yeniden açılınca kayboluyordu (0.3.1 kabul sınaması). Boş satıra bir boşluk konur, görünüşü aynı.
 *  XML 1.0'da yazılamayan karakterler (Word'den ya da PDF'ten yapıştırılan yazıda sayfa sonu, satır sonu dışı denetim karakterleri, yarım vekil çift) temizlenir:
 *  Dosyaya geçersiz başvuru olarak yazılıp formun verisini başka okuyucularda ve Ekle düğmesinde okunamaz yapıyordu (0.3.1 kayıt sınaması). */
const veriDegeri = (d) => {
  if (typeof d !== 'string') return d;
  const temiz = d.toWellFormed().replace(/[\u000B\u000C]/g, '\n').replace(/[\u0000-\u0008\u000E-\u001F\uFFFE\uFFFF]/g, ' ');
  return temiz.includes('\n') ? temiz.replace(/(^|\n)(?=\n)/g, '$1 ') : temiz;
};

/** Baytlar → base64 (çekirdeğe). Parça parça: String.fromCharCode'un argüman sınırı. */
export function base64Yaz(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64Oku(s) {
  const ham = atob(s), b = new Uint8Array(ham.length);
  for (let i = 0; i < ham.length; i++) b[i] = ham.charCodeAt(i);
  return b;
}

function birlestir(a, b) {
  const c = new Uint8Array(a.length + b.length);
  c.set(a, 0); c.set(b, a.length);
  return c;
}

/** Çekirdeğin sınır yanıtının iletisi. */
function sinirMetni(sinir) {
  if (sinir?.tur === 'en_fazla') return `Bu bölüm en çok ${sinir.sayi} kez eklenebilir.`;
  return sinir?.sayi > 1 ? `Bu bölümden en az ${sinir.sayi} tane kalmalı.` : 'Bu bölümün son örneği silinemez.';
}

export class XfaYoneticisi extends EventTarget {
  /** baglam: { belge, yigin, cekirdek, bildir, duzPdfAl(veri, bilgi) → { yol, sayfa }, anlikSil(yol) } */
  constructor({ belge, yigin, cekirdek, bildir, duzPdfAl = null, anlikSil = null }) {
    super();
    this.belge = belge;
    this.g = belge.gorunum;
    this.yigin = yigin;
    this.cekirdek = cekirdek;
    this.bildir = bildir || (() => {});
    this.duzPdfAl = duzPdfAl;
    this.anlikSil = anlikSil;
    this._kuyruk = Promise.resolve();   // yeniden kurmalar ve değer koymalar sırayla
    this._acik = null;                  // odaktaki alan { el, veri, ilk }
    this._siralar = new WeakMap();      // PDF.js belgesi → { kimlikler: [veri kimliği], siralar: Map(veri kimliği → sıra), metinler: Set(metin alanlarının veri kimliği) }
    this._mesgul = 0;
    this._yapiSozu = null;              // süren yapı işi (bölüm ekleme / silme, görünürlük): bitince çözülür
    this._yaziliyor = false;            // odaktaki alanda uygulanmamış yazı var mı (son bildirilen)
    this.sonGirdi = 0;                  // alana son yazılan an (otomatik kayıt yazı sürerken beklesin)
    this.surum = 0;                     // içeriğin sürümü (değer ya da yapı değişince artar): düz PDF'in güncelliği
    this.duz = null;                    // { yol, sayfa, surum }: son düz PDF (anlık klasörde)
    this.diskDamga = null;              // bu formun bildiği dosyanın içerik özeti (çekirdek xfa_bilgi, xfa_kaydet): Dosya başka programda değişti mi
    this._duzSozu = null;
    this.yok = false;
    const alan = this.g.alan;
    alan.addEventListener('focusin', (e) => this._odak(e));
    alan.addEventListener('change', (e) => this._degisti(e));
    alan.addEventListener('click', (e) => this._tik(e));
    alan.addEventListener('keydown', (e) => this._tus(e));
    alan.addEventListener('input', (e) => { const el = e.target?.closest?.(ALAN); if (el && this.etkin) { combGuncelle(el); this._tasmaGuncelle(el, true); this._yaziBildir(); } });
    alan.addEventListener('focusout', (e) => this._odakGitti(e));
    // Form yeniden dizilirken alanlara yazılamaz (0.3.1 kayıp avı): Yeni form önceden alınan baytlardan kurulur, bu arada yazılan silinirdi. Fare zaten geçmez (xfa.css),
    // klavyeyle (Tab'la) alana girilebiliyordu
    alan.addEventListener('beforeinput', (e) => { if (this.mesgul && this.etkin && e.target?.closest?.(ALAN)) e.preventDefault(); }, true);
    this.g.addEventListener('xfaKatmani', (e) => this._katmanKuruldu(e.detail.katman));
    // Yakınlaştırınca odak çerçevesi yeni ölçekte ekran pikseline yeniden oturur
    this.g.addEventListener('xfaOlcek', (e) => { const a = document.activeElement; if (a?.matches?.(DENETIM) && e.detail.katman.contains(a)) this._odakCiz(a); });
  }

  get etkin() { return !!this.g.xfa && !this.yok; }
  get mesgul() { return this._mesgul > 0; }
  /** Bölüm ekleme, silme ya da görünürlük işi sürüyor mu: Komutu henüz geri al yığınında değil, baytları işin başında alındı. */
  get yapiSuruyor() { return !!this._yapiSozu; }

  _mesgulKoy(artir) {
    this._mesgul = Math.max(0, this._mesgul + (artir ? 1 : -1));
    this.g.kok.classList.toggle('xfa-mesgul', this._mesgul > 0);
  }

  /** Belge açıldı (ya da taşındı). Düz PDF hemen hazırlanmaz: küçük resim istenince (kucukResimKaynagi) ya da yazdırılınca. damga: Taşınan sekmede kaynak pencerenin bildiği
   *  içerik özeti (taşıma dosyayı yeniden okumaz, çekirdeğin bugünkü özeti başka programın kaydını gizlerdi). Yoksa açılışta okunan. */
  acildi(damga) { this.duz = null; this.diskDamga = damga !== undefined ? damga : (this.g.xfaBilgi?.damga ?? null); }

  /** Sekme kapanıyor: düz PDF silinir, bekleyen işler bırakılır. */
  birak() {
    this.yok = true;
    clearTimeout(this._duzZaman);
    if (this.duz?.yol) this.anlikSil?.(this.duz.yol);
    this.duz = null;
  }

  // ------------------------------------------------------------ alanlar ve değerler
  /** Belgedeki alanların sırası (bütün sayfaların HTML'inde veri kimliklerinin ilk görüldüğü sıra). */
  _sira() {
    const b = this.g.belge;
    let k = this._siralar.get(b);
    if (!k) {
      const kimlikler = [], siralar = new Map(), metinler = new Set();
      const yuru = (n) => {
        if (!n || typeof n !== 'object') return;
        const v = n.attributes?.dataId;
        if (v && !siralar.has(v)) { siralar.set(v, kimlikler.length); kimlikler.push(v); }
        if (v && (n.name === 'textarea' || (n.name === 'input' && n.attributes.type === 'text'))) metinler.add(v);
        for (const c of n.children || []) yuru(c);
      };
      yuru(b?.allXfaHtml);
      k = { kimlikler, siralar, metinler };
      if (b) this._siralar.set(b, k);
    }
    return k;
  }

  _ogeler(veri) { return this.g.alan.querySelectorAll(`[data-xv="${CSS.escape(veri)}"]`); }

  /** Denetimin gösterdiği değer (PDF.js'in annotationStorage'a yazdığı biçimde: onay kutusu / seçenek düğmesinde açık ya da kapalı durumun adı). */
  _alanDegeri(el) {
    if (el.type === 'radio') {
      const secili = [...this._ogeler(el.dataset.xv)].find((x) => x.checked);
      return secili ? secili.getAttribute('xfaon') ?? '' : el.getAttribute('xfaoff') ?? '';
    }
    if (el.type === 'checkbox') return (el.checked ? el.getAttribute('xfaon') : el.getAttribute('xfaoff')) ?? '';
    if (el.tagName === 'SELECT') return el.selectedIndex < 0 ? '' : el.options[el.selectedIndex].value;
    return el.value;
  }

  _elemanaKoy(el, deger) {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = deger === el.getAttribute('xfaon');
    else if (el.value !== deger) { el.value = deger; combGuncelle(el); }
  }

  /** Komutun adındaki alan adı: alanın açıklaması (araç ipucu; PDF.js aria-label yapar), yoksa etiketi (caption), o da yoksa şablondaki adı.
   *  Uzunsa kısaltılır. */
  _alanAdi(el) {
    const temiz = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const alan = el.closest('[xfaname]');
    const ad = temiz(el.getAttribute('aria-label')) || temiz(alan?.querySelector('.xfaCaption, .xfaCaptionForCheckButton')?.textContent) || alan?.getAttribute('xfaname') || 'alan';
    return ad.length > AD_UZUNLUGU ? ad.slice(0, AD_UZUNLUGU - 1).trimEnd() + '…' : ad;
  }

  _sayfaNo(el) { return +el.closest('.sayfa')?.dataset.sayfa || 0; }

  _odak(e) {
    if (e.target?.matches?.(DENETIM) && e.target.closest('.xfaLayer')) this._odakCiz(e.target);
    const el = e.target?.closest?.(ALAN);
    if (!el || !this.etkin || this._acik?.el === el) return;
    // Seçenek düğmesine tıklanınca odak tıklamadan önce gelir: ilk değer grubun şimdiki seçimidir
    this._acik = { el, veri: el.dataset.xv, ilk: this._alanDegeri(el) };
  }

  _degisti(e) {
    const el = e.target?.closest?.(ALAN);
    if (el && this.etkin) this._uygula(el);
  }

  /** Alandan çıkınca yazının başı görünür (ekrandaki, basılacak olan): Uzun yazıda alan yazılan yere kaymış kalıyordu. */
  _odakGitti(e) {
    this._odakCerceve?.remove();
    const el = e.target?.closest?.(ALAN);
    if (el?.tagName === 'TEXTAREA' && this.etkin) el.scrollTop = 0;
  }

  /**
   * Yazı alana sığmıyor mu (0.3.1 kabul sınaması): Form betiksiz çalıştığı için alan sığmayan yazıyı da alır, kendi içinde kaydırır, ama basımda
   * ve düz PDF'te alanın dışı sessizce kesilir (tasarım programının "kaydırmasız" alanlarında referans okuyucu yazmayı durdurur). Alan kırmızı
   * çerçeveyle işaretlenir, sığmaz hâle geldiği an bir kez söylenir (bildir), yazdırma penceresi de söyler (duzPdf: tasan).
   */
  _tasmaGuncelle(el, bildir = false) {
    const tasiyor = alanTasiyor(el);
    if (tasiyor === el.classList.contains('xfa-tasiyor')) return;
    el.classList.toggle('xfa-tasiyor', tasiyor);
    if (tasiyor && bildir) this.bildir(TASMA_ILETISI);
  }

  /**
   * Odaktaki denetimin çerçevesi (0.3.1, kullanıcı: "seçtiğim kutucuk çok kalın gözüküyor sanki şekli hatalı gibi"): Köşesiz, yakınlaştırmadan
   * bağımsız 1 piksel, alanı büyütmez, çerçevesini aşmaz. Tarayıcının odak halkası kalın, yuvarlak ve katmanla büyüyordu, yazı alanının kenarına
   * bindiği için boş alandaki imleci de örtüyordu (imleç yanıp sönmüyor gibi görünüyordu, ölçüldü). Çerçeve ayrı bir öğe: CSS'teki outline kalınlığı
   * katmanın pikseline yuvarlanır, 2 kat yakınlaştırmada 2,7 piksel olur. Yazı alanında alanın çerçevesinin içinde, imlecin dışında durur (köşe
   * yuvarlaklığını aşmayacak kadar içeride), başlıklı alanda, onay kutusunda ve düğmede denetimin çevresinde.
   */
  _odakCiz(el) {
    const kap = el.closest('.xfaWrapper') || el.closest('.xfaField');
    if (!kap) return;
    if (getComputedStyle(kap).position === 'static') kap.style.position = 'relative';
    const c = this._odakCerceve || (this._odakCerceve = document.createElement('span'));
    c.className = 'xfa-odak';
    const boy = (e) => { const st = getComputedStyle(e); return [parseFloat(st.width) || e.offsetWidth, parseFloat(st.height) || e.offsetHeight]; };   // offsetWidth tam sayıya yuvarlar
    let x = 0, y = 0, [g, b] = boy(el);
    for (let e = el; e && e !== kap; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
    const alan = el.closest('.xfaField');
    if (el.matches('textarea, select, input[type="text"]') && alan && !alan.querySelector('.xfaCaption')) {
      const st = getComputedStyle(alan), sinir = kap.querySelector(':scope > .xfaBorder');
      const yaricap = sinir ? parseFloat(getComputedStyle(sinir).borderTopLeftRadius) / INCE_KAT || 0 : 0;
      const ic = (pay) => Math.max(0.293 * yaricap, 0.4 * (parseFloat(pay) || 0));
      const sol = ic(st.paddingLeft), sag = ic(st.paddingRight), ust = ic(st.paddingTop), alt = ic(st.paddingBottom);
      const [kg, kb] = boy(kap);
      x = sol; y = ust; g = kg - sol - sag; b = kb - ust - alt;
    } else {
      // Onay kutusu ve seçenek düğmesi: PDF.js denetimi alanın boyunda kurar, işaret ortada çizilir. Çerçeve işaretin çevresinde (kare)
      if (el.matches('input[type="checkbox"], input[type="radio"]')) {
        const k = Math.min(g, b);
        x += (g - k) / 2; y += (b - k) / 2; g = b = k;
      } else { x -= 1; y -= 1; g += 2; b += 2; }
    }
    const koy = () => {
      c.style.left = `${x}px`; c.style.top = `${y}px`;
      c.style.setProperty('--g', String(g)); c.style.setProperty('--b', String(b));
    };
    koy();
    kap.append(c);
    // Ekran pikseline oturt: Katmanın kesirli konumu çizgiyi iki piksele yayıp bulanık ve kalın gösteriyordu
    const r = c.getBoundingClientRect();
    const olcek = parseFloat(getComputedStyle(c).getPropertyValue('--xfa-olcek')) || 1, d = window.devicePixelRatio || 1;
    const oturt = (v) => Math.round(v * d) / d;
    const sol = oturt(r.left), ust = oturt(r.top), sag = oturt(r.right), alt = oturt(r.bottom);
    x += (sol - r.left) / olcek; y += (ust - r.top) / olcek; g = (sag - sol) / olcek; b = (alt - ust) / olcek;
    koy();
  }

  // ------------------------------------------------------------ Tab sırası
  /** Katmanın odaklanabilen denetimleri, sayfadaki yerlerine göre: Satır satır, soldan sağa. PDF.js denetimleri şablondaki sırayla dizer,
   *  şablonda sekme sırası tanımlı değilse (traversal) bu sıra sayfadaki yerle ilgisiz olabilir: Tab başka bölüme atlıyordu (0.3.1 kabul
   *  sınaması). Tepeleri alan boyunun yarısından yakın olanlar aynı satırdır. */
  _tabSirasi(katman) {
    const ogeler = [...katman.querySelectorAll(DENETIM)].filter((el) => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => ({ el, r: el.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top);
    const satirlar = [];
    for (const o of ogeler) {
      const s = satirlar.at(-1);
      if (s && o.r.top - s.top < Math.min(s.boy, o.r.height) / 2) s.ogeler.push(o);
      else satirlar.push({ top: o.r.top, boy: o.r.height, ogeler: [o] });
    }
    return satirlar.flatMap((s) => s.ogeler.sort((a, b) => a.r.left - b.r.left)).map((o) => o.el);
  }

  _tus(e) {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey || !this.etkin) return;
    const el = e.target?.closest?.(DENETIM);
    if (!el?.closest('.xfaLayer')) return;
    e.preventDefault();
    if (this.mesgul) return;   // form yeniden diziliyor: Odak alana geçmesin, yazılan silinirdi
    this._tabGec(el, e.shiftKey ? -1 : 1).catch((err) => console.warn('XFA Tab', err));
  }

  /** Sonraki ya da önceki denetim. Sayfanın sonunda sonraki sayfanın ilk denetimi (katmanı yoksa sayfaya gidilip beklenir), belgenin sonunda
   *  başa döner. Denetimi olmayan sayfa atlanır. */
  async _tabGec(el, yon) {
    const g = this.g, n = g.sayfalar.length, i = g.sayfalar.findIndex((s) => s.el.contains(el));
    if (i < 0) return;
    const sira = this._tabSirasi(g.sayfalar[i].el.querySelector('.xfaLayer'));
    // Odak yalnızca imlecin satırını gösterir: Uzun alanın tamamı görünsün
    const git = (x) => { x.focus(); x.scrollIntoView({ block: 'nearest', inline: 'nearest' }); this._odakCiz(x); };
    const hedef = sira[sira.indexOf(el) + yon];
    if (hedef) { git(hedef); return; }
    for (let k = 1; k <= n; k++) {
      const katman = await this._katmanBekle((i + yon * k + n * k) % n);
      if (document.activeElement !== el || this.yok) return;   // beklerken odak başka yere geçti
      const liste = katman ? this._tabSirasi(katman) : [];
      if (liste.length) { git(yon > 0 ? liste[0] : liste.at(-1)); return; }
    }
  }

  /** Sayfanın (dizin) XFA katmanı; yoksa sayfaya gidilir, kurulması beklenir. Süre dolarsa null. */
  async _katmanBekle(i) {
    const s = this.g.sayfalar[i];
    const hazir = () => s?.el.querySelector('.xfaLayer');
    if (hazir()) return hazir();
    this.g.sayfayaGit(i + 1);
    for (const t0 = performance.now(); performance.now() - t0 < KATMAN_BEKLEME_MS;) {
      await new Promise((c) => setTimeout(c, 50));
      if (hazir()) return hazir();
    }
    return null;
  }

  /** Alanın yazılan değerini uygular (komut). Döner: değer değişti mi. */
  _uygula(el) {
    const veri = el.dataset.xv, b = this.g.belge;
    if (!veri || !b) return false;
    const yeni = this._alanDegeri(el);
    const eski = this._acik?.veri === veri ? this._acik.ilk : b.annotationStorage.getValue(veri, { value: yeni }).value;
    b.annotationStorage.setValue(veri, { value: veriDegeri(yeni) });   // PDF.js da yazar (input / change); seçimden sonra da aynı olsun
    if (this._acik?.veri === veri) this._acik.ilk = yeni;
    for (const x of this._ogeler(veri)) if (x !== el) this._elemanaKoy(x, yeni);   // aynı veriye bağlı öbür alanlar
    const sira = (eski ?? '') === (yeni ?? '') ? null : this._sira().siralar.get(veri);
    if (sira == null) { this._yaziBildir(); return false; }
    this._yaziliyor = false;   // komut bildirir (yığın değişti: kirliGuncelle)
    const k = this.degerKomutu({ sira, eski: eski ?? '', yeni, ad: `Form: ${this._alanAdi(el)}`, sayfa: this._sayfaNo(el) });
    this.yigin.calistir(k);
    return true;
  }

  degerKomutu({ sira, eski, yeni, ad, sayfa }) {
    return new Komut(ad, () => this._koy(sira, yeni), () => this._koy(sira, eski), { tur: 'xfa.deger', sira, eski, yeni, ad, sayfa },
      sayfa ? sayfaListesi([sayfa]) : '');
  }

  /** Sıradaki alana değeri koyar (kuyrukta: süren yeniden kurma bitince, yeni belgenin kimliğiyle). */
  _koy(sira, deger) {
    this.surum++;
    this._kuyruk = this._kuyruk.then(() => {
      const b = this.g.belge, veri = this._sira().kimlikler[sira];
      if (!b || !veri) return;
      b.annotationStorage.setValue(veri, { value: veriDegeri(deger) });
      for (const el of this._ogeler(veri)) { this._elemanaKoy(el, deger); this._tasmaGuncelle(el); }
      if (this._acik?.veri === veri) this._acik.ilk = deger;
    }).catch((e) => console.warn('XFA alanı', e));
    this._degisiklikBildir();
  }

  /** Değişiklik oldu: küçük resimler kullanılıyorsa (düz PDF bir kez hazırlandıysa) düz PDF beklenip yenilenir. */
  _degisiklikBildir() {
    this.dispatchEvent(new CustomEvent('degisti'));
    if (this.duz) this._duzPlanla(DUZ_BEKLEME_MS);
  }

  /** Odaktaki alanın yazılan değeri uygulanır (kaydet, yazdır, kapat, sekme değiştirme ve taşıma, düğme öncesi); odak alanda kalır. */
  duzenlemeyiUygula() {
    const el = document.activeElement;
    if (this.etkin && el?.matches?.(ALAN) && this.g.alan.contains(el)) this._uygula(el);
  }

  /** Odaktaki alanda uygulanmamış değer var mı (pencere kapanırken kaydedilmemiş sayılır). */
  duzenleniyor() {
    const el = document.activeElement;
    if (!this.etkin || !el?.matches?.(ALAN) || !this.g.alan.contains(el) || this._acik?.el !== el) return false;
    return this._alanDegeri(el) !== this._acik.ilk;
  }

  /** Alana yazılıyor: Belge yazı sürerken de kaydedilmemiş görünsün (0.3.1 kayıt sınaması: Alandan çıkılana dek sekmede işaret yoktu, Kaydet düğmesi soluktu). Her
   *  tuşta değil, durum değişince bildirilir. */
  _yaziBildir() {
    this.sonGirdi = performance.now();
    const d = this.duzenleniyor();
    if (d === this._yaziliyor) return;
    this._yaziliyor = d;
    this.dispatchEvent(new CustomEvent('degisti'));
  }

  /** Alana az önce yazıldı mı: Otomatik kayıt yazı sürerken beklesin, duraklayınca yazılan da kaydedilsin. */
  yeniYaziliyor(ms) { return this.duzenleniyor() && performance.now() - this.sonGirdi < ms; }

  // ------------------------------------------------------------ düğmeler
  /** Katman kuruldu: betiği tanınmayan düğmeler işaretlenir (imleç ok, ipucu). */
  _katmanKuruldu(katman) {
    for (const d of katman.querySelectorAll('button')) {
      const k = this._dugmeBul(this._yol(d));
      if (!k || k.desteklenmiyor || !k.eylemler?.length) {
        d.classList.add('xfa-desteklenmiyor');
        d.title = 'Bu düğmenin işlevi PDEfe\'de çalışmıyor';
      }
    }
    for (const el of katman.querySelectorAll(ALAN)) this._tasmaGuncelle(el);
  }

  /** Öğenin XFA ad yolu (PDF.js'in xfaName'leri; sayfa kökünün adıyla başlar). */
  _yol(el) {
    const yol = [];
    for (let x = el; x && !x.classList?.contains('xfaLayer'); x = x.parentElement) {
      const a = x.getAttribute?.('xfaname');
      if (a) yol.unshift(a);
    }
    return yol;
  }

  _dugmeBul(yol) { return (this.g.xfaBilgi?.dugmeler || []).find((k) => yolUyar(k, yol)) || null; }

  _tik(e) {
    const d = e.target?.closest?.('.xfaLayer button');
    if (!d || !this.etkin) return;
    e.preventDefault();
    if (this.mesgul) return;
    const yol = this._yol(d), k = this._dugmeBul(yol);
    const ad = (d.textContent || '').replace(/\s+/g, ' ').trim() || yol.at(-1) || 'Düğme';
    if (!k || k.desteklenmiyor || !k.eylemler?.length) { this.bildir(`"${ad}" düğmesinin işlevi PDEfe'de çalışmıyor.`); return; }
    this.dugmeCalistir(k, ad).catch((err) => { console.error('XFA düğmesi', err); this.bildir('Düğmenin işi yapılamadı: ' + (err?.message || err)); });
  }

  /** Düğmenin eylemleri: yapı eylemleri tek çekirdek çağrısında (tek geri al adımı), ardından Kaydet / Farklı kaydet / Yazdır komutları. */
  async dugmeCalistir(k, ad) {
    const yapi = k.eylemler.filter((x) => YAPI_EYLEMLERI.has(x.tur));
    if (yapi.length && !(await this.yapiDegistir(ad, yapi))) return;
    for (const x of k.eylemler) if (KOMUT_EYLEMLERI[x.tur]) this.dispatchEvent(new CustomEvent('komut', { detail: { komut: KOMUT_EYLEMLERI[x.tur] } }));
  }

  // ------------------------------------------------------------ yapı (örnek ekle / sil, görünürlük)
  /** Formun yapısını değiştirir: güncel değerlerle baytlar → çekirdek (xfa_degistir) → yeniden dizim; komut yığınına "Form: <düğme>".
   *  Döner: yapıldı mı (sınıra takıldıysa ya da değişecek bir şey yoksa false / true). */
  async yapiDegistir(ad, islemler) {
    if (this.mesgul || !this.etkin) return false;
    let bitti;
    this._yapiSozu = new Promise((c) => { bitti = c; });
    this._mesgulKoy(true);
    try {
      this.duzenlemeyiUygula();
      await this._kuyruk;
      const once = await this.g.xfaBaytlari();
      const r = await this.cekirdek('xfa_degistir', { veri: base64Yaz(once), islemler: islemler.map((x) => ({ ...x })) });
      if (r?.sinir) { this.bildir(sinirMetni(r.sinir)); return false; }
      let ek = null, sonra = null;
      if (typeof r?.ek === 'string') {
        if (!r.ek) return true;   // değişecek bir şey yok (görünürlük zaten öyle)
        ek = base64Oku(r.ek);
      } else if (typeof r?.veri === 'string') sonra = base64Oku(r.veri);
      else throw new Error('Çekirdek formu değiştiremedi.');
      const tanim = { tur: 'xfa.yapi', ad: `Form: ${ad}`, once, ek, sonra };
      await this._yukle(tanim, true);
      const komut = this.yapiKomutu(tanim);
      komut._atla = true;            // yığına girerken yeniden kurulmaz (az önce kuruldu)
      this.yigin.calistir(komut);
      return true;
    } finally { this._mesgulKoy(false); this._yapiSozu = null; bitti(); }
  }

  yapiKomutu(t) {
    const k = new Komut(t.ad, () => { if (k._atla) { k._atla = false; return null; } return this._yukle(t, true); }, () => this._yukle(t, false), t, '');
    return k;
  }

  /** Komutun önceki ya da sonraki baytlarıyla formu yeniden kurar (kuyrukta). */
  _yukle(t, sonra) {
    this.surum++;
    const veri = (sonra ? t.sonra || birlestir(t.once, t.ek) : t.once).slice();   // PDF.js baytları işçiye aktarır
    const soz = this._kuyruk.then(() => this._yenile(veri));
    this._kuyruk = soz.catch((e) => { console.error('XFA formu yeniden kurulamadı', e); this.bildir('Form yeniden dizilemedi: ' + (e?.message || e)); });
    this._degisiklikBildir();
    return soz;
  }

  async _yenile(veri) {
    if (this.yok) return;
    this._mesgulKoy(true);
    try {
      this._acik = null;
      await this.g.xfaYenile(veri);
    } finally { this._mesgulKoy(false); }
  }

  // ------------------------------------------------------------ komutların taşınması (sekme başka pencereye)
  komutDisari(k) {
    const t = k.tanim;
    if (t?.tur === 'xfa.deger') return { tur: t.tur, ad: k.ad, sira: t.sira, eski: t.eski, yeni: t.yeni, sayfa: t.sayfa };
    if (t?.tur === 'xfa.yapi') return { tur: t.tur, ad: k.ad, once: t.once, ek: t.ek, sonra: t.sonra };
    return null;
  }

  komutIceri(v) {
    if (v?.tur === 'xfa.deger' && Number.isInteger(v.sira)) return this.degerKomutu({ sira: v.sira, eski: String(v.eski ?? ''), yeni: String(v.yeni ?? ''), ad: v.ad, sayfa: v.sayfa });
    if (v?.tur === 'xfa.yapi' && v.once instanceof Uint8Array && (v.ek instanceof Uint8Array || v.sonra instanceof Uint8Array)) {
      return this.yapiKomutu({ tur: v.tur, ad: v.ad, once: v.once, ek: v.ek || null, sonra: v.sonra || null });
    }
    return null;
  }

  // ------------------------------------------------------------ kaydetme, yazdırma, küçük resimler
  /** Süren yapı işi (bölüm ekleme / silme), kuyruktaki yeniden kurmalar ve değer koymalar bitene dek bekler (sekme taşınırken ve kaydederken: Baytlar ile geri al
   *  yığınının konumu birbirini tutsun, 0.3.1 inceleme). Bekleme sürerken yeni iş girerse onu da bekler. */
  async bekle() {
    for (;;) {
      const k = this._kuyruk, y = this._yapiSozu;
      await k; await y;
      if (k === this._kuyruk && y === this._yapiSozu) return;
    }
  }

  /** Güncel değerleriyle formun baytları (PDF.js saveDocument; açık düzenleme uygulanır, süren yeniden kurma beklenir). */
  async baytlar() {
    this.duzenlemeyiUygula();
    await this.bekle();
    return this.g.xfaBaytlari();
  }

  /** Veriye yazılması beklenen metinler (çekirdek dosyada arar: PDF.js veri düğümü olmayan alanın değerini sessizce yazmaz). */
  _beklenenDegerler() {
    const depo = this.g.belge?.annotationStorage, c = [];
    for (const v of this._sira().metinler) {
      const d = depo?.getRawValue(v)?.value;
      if (d && typeof d === 'string') c.push(d);
    }
    return c;
  }

  /** Formu hedefe yazar (çekirdek xfa_kaydet: baştan yazım, kullanım hakları imzası kaldırılır, atomik). imzayiKoru: e-imzalı formda PDF.js'in artımlı baytları olduğu
   *  gibi yazılır (imza korunur, 0.3.1 inceleme). hizli: kilitte beklenmez (otomatik kayıt). Döner: çekirdeğin sonucu, konum ve komut: Yazılan durumun geri al
   *  yığınındaki yeri. Baytlarla aynı anda alınır: Yapı işi ya da yeniden kurma beklenirken yapılan değişiklik kayıtlı sayılmasın, kayıt sürerken yazılan da. damga: Hedefin
   *  beklenen içerik özeti (dosya başka programda değiştiyse çekirdek yazmaz). */
  async kaydet(hedef, { imzayiKoru = false, hizli = false, damga = null } = {}) {
    this.duzenlemeyiUygula();
    await this.bekle();
    if (this.yok) throw new Error('Sekme kapatıldı.');
    this.duzenlemeyiUygula();   // beklerken yazılan
    const konum = this.yigin.konum, komut = this.yigin.geriAlinacak, beklenen = this._beklenenDegerler();
    const veri = await this.g.xfaBaytlari();   // PDF.js değerleri çağrı anında alır
    const r = await this.cekirdek('xfa_kaydet', { veri: base64Yaz(veri), hedef, yol: this.g.yol, beklenen, ...(imzayiKoru ? { imzayiKoru: true } : {}), ...(hizli ? { hizli: true } : {}), ...(damga ? { damga } : {}) });
    if (r?.damga) this.diskDamga = r.damga;
    return { ...r, konum, komut };
  }

  /** Formun güncel değerleriyle düz PDF'i (yazdırma; küçük resimler). Döner: { yol, sayfa }. */
  async duzPdf() {
    if (!this.duzPdfAl) throw new Error('Form yazdırılamıyor.');
    const surum = this.surum;
    if (this.duz && this.duz.surum === surum && !this.duzenleniyor()) return this.duz;
    if (this._duzSozu && this._duzSozu.surum === surum) return this._duzSozu.soz;
    const soz = (async () => {
      const veri = await this.baytlar();
      const r = await this.duzPdfAl(veri, this.g.xfaBilgi);
      if (!r?.yol) throw new Error('Formun yazdırılacak hâli hazırlanamadı.');
      if (this.yok) { this.anlikSil?.(r.yol); throw new Error('Sekme kapatıldı.'); }
      const eski = this.duz;
      this.duz = { yol: r.yol, sayfa: r.sayfa, tasan: r.tasan || 0, surum: this.surum === surum ? surum : -1 };
      if (eski?.yol && eski.yol !== r.yol) this.anlikSil?.(eski.yol);
      this.dispatchEvent(new CustomEvent('duz'));
      return this.duz;
    })();
    this._duzSozu = { surum, soz };
    try { return await soz; } finally { if (this._duzSozu?.soz === soz) this._duzSozu = null; }
  }

  /** Küçük resimlerin düz PDF'i değişiklikten sonra beklenip yenilenir (arka planda; hata yalnızca günlüğe). */
  _duzPlanla(ms) {
    if (!this.duzPdfAl || this.yok) return;
    clearTimeout(this._duzZaman);
    this._duzZaman = setTimeout(() => {
      if (this.yok || !this.etkin) return;
      if (this.mesgul || this.duzenleniyor()) { this._duzPlanla(ms); return; }
      this.duzPdf().catch((e) => console.warn('XFA düz PDF', e));
    }, ms);
  }

  /** Sayfalar panelinin ve sekme ön izlemesinin küçük resminin kaynağı (düz PDF'in sayfası). Hazır değilse null: düz PDF hazırlanır, hazır
   *  olunca 'duz' olayı (panel küçük resimleri yeniden ister). */
  kucukResimKaynagi(s) {
    const n = s?.kaynak?.sayfa;
    if (!this.duz && !this._duzSozu && this.etkin) this._duzPlanla(100);
    return this.duz && n && n <= (this.duz.sayfa || 0) ? { yol: this.duz.yol, sayfa: n } : null;
  }
}
