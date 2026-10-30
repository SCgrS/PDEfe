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
// kaldırılır (xfa_kaydet). Yazdırma ve Sayfalar panelinin küçük resimleri formun düz PDF'inden: Ana süreç formu gizli pencerede aynı
// kurallarla çizip PDF'e çevirir (src/main/xfaDuz.js), yazdırma ve küçük resimler o dosyadan (çekirdek, olağan PDF gibi).
import { Komut, sayfaListesi } from './komutlar.js';
import { yolUyar } from './xfaHtml.js';

const ALAN = 'input[data-xv], textarea[data-xv], select[data-xv]';
const YAPI_EYLEMLERI = new Set(['ekle', 'sil', 'gorunurluk']);
const KOMUT_EYLEMLERI = { kaydet: 'dosya.kaydet', farkliKaydet: 'dosya.farkliKaydet', yazdir: 'dosya.yazdir' };
const DUZ_BEKLEME_MS = 2000;     // değişiklikten sonra küçük resimlerin düz PDF'i bu kadar beklenip yenilenir
const AD_UZUNLUGU = 48;          // komut adındaki alan adının en çok karakteri (geri al listeleri)

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
    this._siralar = new WeakMap();      // PDF.js belgesi → { kimlikler: [veri kimliği], siralar: Map(veri kimliği → sıra) }
    this._mesgul = 0;
    this.surum = 0;                     // içeriğin sürümü (değer ya da yapı değişince artar): düz PDF'in güncelliği
    this.duz = null;                    // { yol, sayfa, surum }: son düz PDF (anlık klasörde)
    this._duzSozu = null;
    this.yok = false;
    const alan = this.g.alan;
    alan.addEventListener('focusin', (e) => this._odak(e));
    alan.addEventListener('change', (e) => this._degisti(e));
    alan.addEventListener('click', (e) => this._tik(e));
    this.g.addEventListener('xfaKatmani', (e) => this._katmanKuruldu(e.detail.katman));
  }

  get etkin() { return !!this.g.xfa && !this.yok; }
  get mesgul() { return this._mesgul > 0; }

  _mesgulKoy(artir) {
    this._mesgul = Math.max(0, this._mesgul + (artir ? 1 : -1));
    this.g.kok.classList.toggle('xfa-mesgul', this._mesgul > 0);
  }

  /** Belge açıldı (ya da taşındı). Düz PDF hemen hazırlanmaz: küçük resim istenince (kucukResimKaynagi) ya da yazdırılınca. */
  acildi() { this.duz = null; }

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
      const kimlikler = [], siralar = new Map();
      const yuru = (n) => {
        if (!n || typeof n !== 'object') return;
        const v = n.attributes?.dataId;
        if (v && !siralar.has(v)) { siralar.set(v, kimlikler.length); kimlikler.push(v); }
        for (const c of n.children || []) yuru(c);
      };
      yuru(b?.allXfaHtml);
      k = { kimlikler, siralar };
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
    else if (el.value !== deger) el.value = deger;
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
    const el = e.target?.closest?.(ALAN);
    if (!el || !this.etkin || this._acik?.el === el) return;
    // Seçenek düğmesine tıklanınca odak tıklamadan önce gelir: ilk değer grubun şimdiki seçimidir
    this._acik = { el, veri: el.dataset.xv, ilk: this._alanDegeri(el) };
  }

  _degisti(e) {
    const el = e.target?.closest?.(ALAN);
    if (el && this.etkin) this._uygula(el);
  }

  /** Alanın yazılan değerini uygular (komut). Döner: değer değişti mi. */
  _uygula(el) {
    const veri = el.dataset.xv, b = this.g.belge;
    if (!veri || !b) return false;
    const yeni = this._alanDegeri(el);
    const eski = this._acik?.veri === veri ? this._acik.ilk : b.annotationStorage.getValue(veri, { value: yeni }).value;
    b.annotationStorage.setValue(veri, { value: yeni });   // PDF.js da yazar (input / change); seçimden sonra da aynı olsun
    if (this._acik?.veri === veri) this._acik.ilk = yeni;
    for (const x of this._ogeler(veri)) if (x !== el) this._elemanaKoy(x, yeni);   // aynı veriye bağlı öbür alanlar
    if ((eski ?? '') === (yeni ?? '')) return false;
    const sira = this._sira().siralar.get(veri);
    if (sira == null) return false;
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
      b.annotationStorage.setValue(veri, { value: deger });
      for (const el of this._ogeler(veri)) this._elemanaKoy(el, deger);
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
    } finally { this._mesgulKoy(false); }
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
  /** Güncel değerleriyle formun baytları (PDF.js saveDocument; açık düzenleme uygulanır, süren yeniden kurma beklenir). */
  async baytlar() {
    this.duzenlemeyiUygula();
    await this._kuyruk;
    return this.g.xfaBaytlari();
  }

  /** Formu hedefe yazar (çekirdek xfa_kaydet: baştan yazım, kullanım hakları imzası kaldırılır). Döner: çekirdeğin sonucu. */
  async kaydet(hedef) {
    const veri = await this.baytlar();
    return this.cekirdek('xfa_kaydet', { veri: base64Yaz(veri), hedef, yol: this.g.yol });
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
      this.duz = { yol: r.yol, sayfa: r.sayfa, surum: this.surum === surum ? surum : -1 };
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
