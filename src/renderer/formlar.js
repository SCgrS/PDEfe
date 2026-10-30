// Etkileşimli form alanları (AcroForm; 0.3.1, kullanıcı isteği: "tıklayarak işaretleme özelliğini getireceğiz mesela kutucuklu pdfler oluyor
// onlara"). Form alanlı PDF'te alanlar doğrudan kullanılır: onay kutusu ve seçenek düğmesi tıklayınca ya da Boşluk'la işaretlenip kalkar,
// yazı alanına yazılır, açılır listeden ve liste kutusundan seçilir. Tab / Shift+Tab alanlar arasında sayfa sırasıyla gezer (sayfanın /Tabs'ı;
// gerekirse sayfa kaydırılır, son alandan ilkine döner), seçenek düğmesi grubu tek durak sayılır (oklar grupta seçer). Salt okunur alan,
// imza alanı ve itme düğmesi değişmez (JavaScript ve düğme eylemleri çalıştırılmaz), görünür kalır.
//
// Görünüm: Her widget'ın görünümünü çekirdek çizer (core/islemler/formlar.py form_gorunum): kaydedilmemiş değerler dosyanın bellekteki
// kopyasına yazılıp oradan, yani kaydedilecek ve yazdırılacak görünümün aynısıyla çizilir. 0.3.0'a dek bütün widget'lar sayfa başına tek
// saydam PNG'ydi (tıklanamıyordu). Seçilmeyen yol: Alanı HTML denetimiyle çizmek (tarayıcıların form katmanı gibi): dosyadaki görünüm
// (kutucuğun çarpı ya da tik işareti, kenarlığı, yazı tipi) yerine PDEfe'nin çizimi görünürdü, kaydedilen dosya başka türlü görünürdü.
// Denetimler (input, textarea, select, liste) widget'ların üstünde saydamdır: Yazı alanı düzenlenirken görünür (zemin, yazı rengi ve boyu
// alanınki), bitince görünüm çekirdekten yeniden alınır, gelene dek denetim görünür kalır (yazı kaybolup gelmez). Onay kutusu ve seçenek
// düğmesinde çekirdek öbür durumun görünümünü de verir: Tıklama çekirdeği beklemeden görünümü değiştirir.
//
// Model: Değer alan başına (aynı alanın birden çok widget'ı, başka sayfada da olsa, birlikte değişir). Kayıt: kaynak dosya + alan xref'i
// (alan nesnesi: kaynakYeniden yolu çevirir, komutlar kaydı tutar). kayitli: dosyadaki değer, deger: bu oturumdaki değer (yoksa dosyadaki).
// Değişiklikler komut yığınına "Form: <alan adı>" adıyla girer (Geri al / Yinele, geri al ▾ listesi, durum çubuğundaki kaydedilmemiş
// değişiklikler listesi, kapatırken kaydet sorusu, otomatik kaydetme). Kayıt: notlar_kaydet (artımlı, e-imza korunur) ya da yapisal_kaydet
// (kaynak sayfa + alan xref'iyle kaynağa yazılıp sayfayla kopyalanır). Yazdırma bekleyen değerleri de basar (yazdirmaDegerleri).
//
// Not araçları: Not, Yazı ya da Vurgu aracı seçiliyken alanlar tıklamayı almaz (form-arac), tıklama aracındır (not ve yazı kutusu alanın
// üstüne de konabilir; araç bırakılınca alanlar yeniden çalışır). Metin seçimi alanda başlamaz (metin.js SECIM_DISI), başka yerden başlayan
// sürükleme alanların üstünden geçebilir. Notlar alanların üstünde çizilir.
import { CSS_BIRIM, yolAnahtari } from './goruntuleyici.js';
import { Komut, sayfaListesi } from './komutlar.js';

const ODAKLANIR = new Set(['metin', 'onay', 'secenek', 'acilir', 'liste']);
const AILE_CSS = { Arial: 'Arial, Helvetica, sans-serif', 'Times New Roman': '"Times New Roman", Times, serif', 'Courier New': '"Courier New", Courier, monospace' };
const OTOMATIK_BOY_KATI = 1.35;      // çekirdekle aynı (formlar.py): tek satırda otomatik yazı boyu = iç yükseklik / bu kat
const COK_SATIR_OTOMATIK = 12;
const IC_PAY = 2;                     // pt
const HEDEF_BEKLEME_MS = 4000;        // Tab başka sayfadaki alana giderken sayfanın form katmanı en çok bu kadar beklenir
// Bir değerin en çok karakteri (çekirdekteki EN_UZUN_METIN): Daha uzun değeri çekirdek reddeder, o dosyanın bütün form istekleri (görünüm,
// kayıt, yazdırma) hata verirdi (0.3.1 inceleme). En çok uzunluğu olmayan alana da bu sınır konur, uygulanan değer de kesilir
const EN_UZUN_METIN = 20000;

/** İki değer aynı mı (metin ya da metin listesi). */
export function degerEsit(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? a : a == null || a === '' ? [] : [a], y = Array.isArray(b) ? b : b == null || b === '' ? [] : [b];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return (a ?? '') === (b ?? '');
}

export class FormYoneticisi extends EventTarget {
  constructor({ belge, yigin }) {
    super();
    this.belge = belge;
    this.g = belge.gorunum;
    this.yigin = yigin;
    this.alanlar = new Map();     // anahtar (yolAnahtari#alan xref) → kayıt { yol, xref, ad, tur, kayitli, deger? }
    this._istek = 0;
    this._degerSurumu = 0;        // her değer değişikliğinde artar (kayit._surum: alanın son değişikliği; görünüm yanıtı eskimiş mi)
    this.arac = null;
    // Sayfada alanın dışına basış odaktaki alanı bırakır (yazısı uygulanır): metin seçimi basışta varsayılanı engellediği için odak alanda
    // kalır, sonra yazılan alana giderdi
    this.g.alan.addEventListener('pointerdown', (e) => {
      const a = document.activeElement;
      if (a?.closest?.('.form-alan') && this.g.kok.contains(a) && !e.target.closest?.('.form-alan')) a.blur();
    }, true);
  }

  anahtar(kayit) { return yolAnahtari(kayit.yol) + '#' + kayit.xref; }

  /** Alanın şimdiki değeri (bu oturumda değiştiyse o, değilse dosyadaki). */
  simdi(kayit) { return 'deger' in kayit ? kayit.deger : kayit.kayitli; }

  /** Widget bilgisinden alan kaydı (yoksa kurulur; dosyadaki değer yalnızca ilk görüşte alınır). */
  alanKaydi(yol, a) {
    const k = yolAnahtari(yol) + '#' + a.alan;
    let kayit = this.alanlar.get(k);
    if (!kayit) { kayit = { yol, xref: a.alan, ad: a.ad, tur: a.tur, kayitli: a.deger }; this.alanlar.set(k, kayit); }
    return kayit;
  }

  bekliyor(kayit) { return 'deger' in kayit && !degerEsit(kayit.deger, kayit.kayitli); }

  /** Bir dosyanın kaydedilmemiş değerleri: [{xref, deger}] (çekirdeğin degerler / formlar parametresi). */
  bekleyenler(yol) {
    const ya = yolAnahtari(yol), sonuc = [];
    for (const kayit of this.alanlar.values()) if (yolAnahtari(kayit.yol) === ya && this.bekliyor(kayit)) sonuc.push({ xref: kayit.xref, deger: kayit.deger });
    return sonuc;
  }

  /** Kaydetme farkı: [{yol, xref, deger}]. */
  fark() {
    const sonuc = [];
    for (const kayit of this.alanlar.values()) if (this.bekliyor(kayit)) sonuc.push({ yol: kayit.yol, xref: kayit.xref, deger: kayit.deger });
    return sonuc;
  }

  get kirli() { return this.fark().length > 0; }

  /** Kaydedilecek değerlerden biri dosyada dolu olan bir yazı ya da liste alanının değerini değiştiriyor mu: artımlı kayıtta eski değer
   *  dosyanın önceki bölümünde kalır (0.1.23'teki not kararıyla aynı: belge temiz yazılır, e-imzalı belgede sorulur). Boş alanı doldurmak,
   *  onay kutusu ve seçenek düğmesi bu kurala girmez. */
  eskiDegerKalir() {
    return [...this.alanlar.values()].some((k) => this.bekliyor(k) && ['metin', 'acilir', 'liste'].includes(k.tur)
      && (Array.isArray(k.kayitli) ? k.kayitli.length > 0 : !!k.kayitli));
  }

  /** Kayıt başında: gönderilen değerler (kaydedildi'ye verilir; kayıt sürerken yapılan değişiklik kirli kalır). */
  kayitAnligi() { return new Map([...this.alanlar.values()].filter((k) => this.bekliyor(k)).map((k) => [k, k.deger])); }

  /** Değerler dosyaya yazıldı (aynı dosyaya artımlı ya da Farklı kaydet): dosyadaki değer gönderilen değer olur. Yapısal kayıtta çağrılmaz:
   *  kaynak (anlık kopya) değişmez, her yapısal kayıt bütün farkı yeniden yazar (notlarda olduğu gibi). */
  kaydedildi(anlik) {
    for (const [kayit, deger] of anlik || []) kayit.kayitli = deger;
    this.dispatchEvent(new CustomEvent('degisti'));
  }

  /** Kaynak dosyanın içeriği başka yola geçti (anlık kopya, yapısal olmayan Farklı kaydet): kayıtlar yeni yolla anahtarlanır. */
  kaynakYeniden(eskiYol, yeniYol) {
    const ek = yolAnahtari(eskiYol);
    for (const [k, kayit] of [...this.alanlar]) {
      if (yolAnahtari(kayit.yol) !== ek) continue;
      this.alanlar.delete(k);
      kayit.yol = yeniYol;
      this.alanlar.set(this.anahtar(kayit), kayit);
    }
  }

  // ------------------------------------------------------------ komutlar
  degerKomutu(kayit, eski, yeni, sayfa, ad = `Form: ${kayit.ad}`) {
    return new Komut(ad, () => this.degerKoy(kayit, yeni), () => this.degerKoy(kayit, eski), { tur: 'form.deger', kayit, eski, yeni, sayfa },
      sayfa ? sayfaListesi([sayfa]) : '');
  }

  /** Alanın değerini değiştirir (komutla; aynıysa bir şey yapmaz). sayfa: değişikliğin yapıldığı sayfa (geri al listesindeki "s. N"). */
  degistir(kayit, yeni, sayfa) {
    if (degerEsit(yeni, this.simdi(kayit))) return false;
    this.yigin.calistir(this.degerKomutu(kayit, structuredClone(this.simdi(kayit)), structuredClone(yeni), sayfa));
    return true;
  }

  degerKoy(kayit, deger) {
    kayit.deger = structuredClone(deger);
    kayit._surum = ++this._degerSurumu;
    this.alanGuncelle(kayit);
    this.dispatchEvent(new CustomEvent('degisti'));
  }

  komutDisari(k) {
    const t = k.tanim;
    if (t?.tur !== 'form.deger') return null;
    return { tur: t.tur, ad: k.ad, anahtar: this.anahtar(t.kayit), eski: t.eski, yeni: t.yeni, sayfa: t.sayfa };
  }

  komutIceri(veri) {
    const kayit = veri?.tur === 'form.deger' ? this.alanlar.get(veri.anahtar) : null;
    return kayit ? this.degerKomutu(kayit, veri.eski, veri.yeni, veri.sayfa, veri.ad) : null;
  }

  /** Sekme başka pencereye taşınırken (0.1.19 düzeni): kayıtlar (anahtarla). */
  durumAl() {
    return { alanlar: [...this.alanlar].map(([anahtar, k]) => ({ anahtar, yol: k.yol, xref: k.xref, ad: k.ad, tur: k.tur, kayitli: k.kayitli, ...('deger' in k ? { deger: k.deger } : {}) })) };
  }

  durumdanYukle(durum) {
    this.alanlar.clear();
    for (const v of durum?.alanlar || []) {
      if (!v || typeof v.anahtar !== 'string' || !Number.isInteger(v.xref)) continue;
      const kayit = { yol: v.yol, xref: v.xref, ad: v.ad, tur: v.tur, kayitli: v.kayitli };
      if ('deger' in v) kayit.deger = v.deger;
      this.alanlar.set(v.anahtar, kayit);
    }
  }

  /** Yazdırma (yazdir.js): yol dosyasına yazılabilen bekleyen değerler; tamam false: bekleyen değerlerden biri bu dosyaya eşlenemiyor
   *  (yapısal kayıttan sonra alanlar anlık kopyadan: yazdırmadan önce kaydedilmeli). */
  yazdirmaDegerleri(yol) {
    const fark = this.fark();
    return { degerler: fark.filter((f) => yolAnahtari(f.yol) === yolAnahtari(yol)).map(({ xref, deger }) => ({ xref, deger })),
      tamam: fark.every((f) => yolAnahtari(f.yol) === yolAnahtari(yol)) };
  }

  // ------------------------------------------------------------ katman
  /** Sayfanın form katmanı (Goruntuleyici.ekKatmanlar, yalnızca görünüm değişince): widget görünümleri yeni ölçekte, denetimler yerinde
   *  (odaktaki denetim korunur). dondurme: ekrandaki mutlak açı. */
  async katmanKur(s, i, pdfSayfa, olcek, dondurme) {
    const g = this.g;
    if (!g.cekirdek || s.bos || s.formYok) return;
    const dpr = window.devicePixelRatio || 1;
    const surum = s._formSurum = (s._formSurum || 0) + 1;
    const degerSurumu = this._degerSurumu;
    const ilk = !s.formAlanlari;
    let r;
    try {
      r = await g.cekirdek('form_gorunum', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, olcek: Math.min(6, olcek * CSS_BIRIM * dpr), dondurme,
        degerler: this.bekleyenler(s.kaynak.yol), ...(ilk ? { alanlar: true } : {}) });
    } catch (e) { if (ilk) s.formYok = true; throw e; }
    if (ilk && r?.alanlar) s.formAlanlari = r.alanlar;
    if (!s.formAlanlari?.length) { s.formYok = true; return; }
    if (g.yok || s._formSurum !== surum || s.cizim?.olcek !== olcek || !s.el.isConnected) return;
    let katman = s.el.querySelector(':scope > .form-katmani');
    if (!katman) {
      katman = document.createElement('div');
      katman.className = 'form-katmani';
      s.el.insertBefore(katman, s.notKatmani);
      s._formOgeler = null;
    }
    if (!s._formOgeler) { katman.replaceChildren(); s._formOgeler = new Map(); }   // öğeleri bilinmeyen katman baştan kurulur
    const vp = pdfSayfa.getViewport({ scale: olcek * CSS_BIRIM, rotation: dondurme });
    const gorunumler = new Map((r.widgetlar || []).map((w) => [w.xref, w]));
    const kalan = new Set(s._formOgeler.keys());
    const ayniYon = s._formAnahtar?.split('|')[1] === String(dondurme);
    const yenilenecek = [];
    for (const a of s.formAlanlari) {
      if (a.gizli) continue;
      kalan.delete(a.xref);
      let oge = s._formOgeler.get(a.xref);
      if (!oge) { oge = this.ogeKur(s, a); s._formOgeler.set(a.xref, oge); katman.append(oge.img, oge.el); }
      this.yerlestir(oge, vp, pdfSayfa.view, olcek * CSS_BIRIM);
      const w = gorunumler.get(a.xref);
      // Değeri istek gittikten sonra değişen alanın görünümü eskidir (0.3.1 inceleme: yakınlaştırınca giden istek, alandan Tab ile
      // çıkmadan önceki değerle dönüp yeni görünümün üstüne yazıyordu, yeni görünüm isteği de anahtar değiştiği için atılıyordu). Ekrandaki
      // görünümü kalır (aynı yönde: kutusu sayfanın oranı), yeni ölçekte yeniden istenir
      const eski = (oge.kayit._surum || 0) > degerSurumu;
      if (w && !(eski && oge.gorunum && ayniYon)) this.gorunumKoy(oge, w);
      else if (!w) oge.img.hidden = true;
      if (eski) yenilenecek.push(oge);
      this.denetimGuncelle(oge);
    }
    for (const x of kalan) { const o = s._formOgeler.get(x); o.img.remove(); o.el.remove(); s._formOgeler.delete(x); }
    s._formAnahtar = `${olcek}|${dondurme}|${dpr}`;
    if (yenilenecek.length) this.gorunumYenile(s, yenilenecek);
  }

  /** Sayfanın form katmanı boşaltılıyor (Goruntuleyici.girdiBosalt): odaktaki yazı uygulanır (katman silinince yazılan kaybolmasın). */
  katmanBirak(s) {
    for (const oge of s._formOgeler?.values() || []) if (oge.denetim && oge.el.contains(document.activeElement)) this.uygula(oge);
    s._formOgeler = null; s._formAnahtar = null;
  }

  /** Widget'ın görünümü (çekirdekten): görüntü sayfanın oranıyla konur. */
  gorunumKoy(oge, w) {
    oge.gorunum = w;
    const img = oge.img;
    img.src = 'data:image/png;base64,' + w.png;
    Object.assign(img.style, { left: w.kutu[0] * 100 + '%', top: w.kutu[1] * 100 + '%', width: w.kutu[2] * 100 + '%', height: w.kutu[3] * 100 + '%' });
    img.hidden = false;
  }

  /** Widget'ın öğeleri: görünüm (img) ve üstündeki denetim (oge.el, gerekirse içinde input / textarea / select). */
  ogeKur(s, a) {
    const kayit = this.alanKaydi(s.kaynak.yol, a);
    const img = document.createElement('img');
    img.className = 'form-gorunum'; img.alt = ''; img.draggable = false; img.hidden = true;
    const el = document.createElement('div');
    el.className = 'form-alan';
    el.dataset.xref = String(a.xref); el.dataset.tur = a.tur;
    const oge = { s, a, kayit, img, el, denetim: null };
    const etkin = ODAKLANIR.has(a.tur) && !a.salt;
    el.classList.toggle('pasif', !etkin);
    if (a.etiket) el.title = a.etiket;
    else if (a.tur === 'imza') el.title = 'İmza alanı';
    else if (a.tur === 'dugme') el.title = 'Düğme (PDEfe düğmelerin işlevini çalıştırmaz)';
    if (!etkin) { el.addEventListener('pointerdown', (e) => { if (e.button === 0) e.preventDefault(); }); return oge; }
    el.addEventListener('keydown', (e) => this.tus(oge, e));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });   // sayfanın sağ tık menüsü alanda açılmaz
    if (a.tur === 'metin' || (a.tur === 'acilir' && a.duzenlenebilir)) {
      const d = document.createElement(a.tur === 'metin' && a.cokSatir ? 'textarea' : 'input');
      if (d.tagName === 'INPUT') d.type = a.tur === 'metin' && a.parola ? 'password' : 'text';
      d.className = 'form-denetim'; d.spellcheck = false; d.autocomplete = 'off';
      d.maxLength = a.tur === 'metin' && a.enCok > 0 ? Math.min(a.enCok, EN_UZUN_METIN) : EN_UZUN_METIN;
      if (a.tur === 'acilir') {
        const liste = document.createElement('datalist');
        liste.id = 'form-liste-' + Math.random().toString(36).slice(2);
        for (const [, gorunen] of a.secenekler || []) { const o = document.createElement('option'); o.value = gorunen; liste.append(o); }
        el.append(liste);
        d.setAttribute('list', liste.id);
      }
      d.addEventListener('focus', () => { el.classList.add('duzenleniyor'); d.value = this.yaziDegeri(oge); });
      d.addEventListener('blur', () => { const degisti = this.uygula(oge); if (!degisti) el.classList.remove('duzenleniyor'); });
      el.append(d);
      oge.denetim = d;
    } else if (a.tur === 'acilir') {
      const d = document.createElement('select');
      d.className = 'form-denetim form-secim';
      for (const [disari, gorunen] of a.secenekler || []) { const o = document.createElement('option'); o.value = disari; o.textContent = gorunen; d.append(o); }
      d.addEventListener('change', () => this.degistir(kayit, d.value, this.sayfaNo(oge)));
      el.append(d);
      oge.denetim = d;
    } else {
      // Onay kutusu, seçenek düğmesi, liste kutusu: alanın kendisi odaklanır
      el.tabIndex = 0;
      el.setAttribute('role', a.tur === 'onay' ? 'checkbox' : a.tur === 'secenek' ? 'radio' : 'listbox');
      if (a.tur === 'liste') {
        el.addEventListener('focus', () => this.listeAc(oge));
        el.addEventListener('blur', () => this.listeKapat(oge));
      } else {
        el.addEventListener('click', (e) => { if (e.button === 0) this.tikla(oge); });
      }
    }
    return oge;
  }

  sayfaNo(oge) { const i = this.g.idx(oge.s); return i >= 0 ? i + 1 : null; }

  /** Denetimin kutusu: widget'ın ekrandaki (döndürülmüş) kutusu; yazı denetimi içinde alanın kendi yönünde döndürülür (sayfa açısı - /MK /R). */
  yerlestir(oge, vp, view, ptPx) {
    const a = oge.a, el = oge.el;
    const p1 = vp.convertToViewportPoint(view[0] + a.rect[0], view[3] - a.rect[1]);
    const p2 = vp.convertToViewportPoint(view[0] + a.rect[2], view[3] - a.rect[3]);
    const x = Math.min(p1[0], p2[0]), y = Math.min(p1[1], p2[1]), w = Math.abs(p2[0] - p1[0]), h = Math.abs(p2[1] - p1[1]);
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    oge.ptPx = ptPx;
    const egim = (((Math.round(vp.rotation / 90) * 90 - (a.donme || 0)) % 360) + 360) % 360;
    oge.egim = egim;
    const d = oge.denetim;
    if (!d) return;
    const yan = egim === 90 || egim === 270, dw = yan ? h : w, dh = yan ? w : h;
    Object.assign(d.style, { left: (w - dw) / 2 + 'px', top: (h - dh) / 2 + 'px', width: dw + 'px', height: dh + 'px', transform: egim ? `rotate(${egim}deg)` : '' });
    // Yazı biçimi alanınki: boy (otomatik boyda iç yükseklikten, çekirdekle aynı kural), yazı tipi, renk, hiza, zemin
    const bw = a.kenar ? a.kenarKalinlik : 0;
    const icH = dh / ptPx - 2 * bw;
    let boy = a.yaziBoyu || (a.tur === 'metin' && a.cokSatir ? COK_SATIR_OTOMATIK : Math.max(4, icH / OTOMATIK_BOY_KATI));
    boy *= ptPx;
    d.style.fontSize = boy + 'px';
    d.style.fontFamily = AILE_CSS[a.yaziTipi] || AILE_CSS.Arial;
    d.style.fontWeight = a.kalin ? 'bold' : 'normal';
    d.style.setProperty('--form-yazi', a.yaziRengi || '#000');
    d.style.setProperty('--form-zemin', a.arka || '#fff');
    d.style.textAlign = ['left', 'center', 'right'][a.hiza] || 'left';
    const pay = (bw + IC_PAY) * ptPx;
    if (a.tarak && a.enCok > 0) {
      // Tarak: Her harf kendi hücresinde (eşit aralıklı yazı tipiyle harf aralığı hücre genişliğine)
      const hucre = dw / a.enCok, harf = 0.6 * boy;
      d.style.fontFamily = AILE_CSS['Courier New'];
      d.style.letterSpacing = Math.max(0, hucre - harf) + 'px';
      d.style.padding = `0 0 0 ${Math.max(0, (hucre - harf) / 2)}px`;
      d.style.textAlign = 'left';
    } else d.style.padding = d.tagName === 'TEXTAREA' ? `${(bw + 1) * ptPx}px ${pay}px` : `0 ${pay}px`;
  }

  /** Denetimin durumunu modelden yazar (odaktaki yazı denetimine dokunulmaz). */
  denetimGuncelle(oge) {
    const a = oge.a, deger = this.simdi(oge.kayit), d = oge.denetim;
    if (a.tur === 'onay' || a.tur === 'secenek') oge.el.setAttribute('aria-checked', String(deger === a.acik));
    if (!d) { if (a.tur === 'liste' && oge.liste) this.listeCiz(oge); return; }
    if (d.tagName === 'SELECT') { d.value = deger || ''; if (d.selectedIndex < 0) d.selectedIndex = -1; return; }
    if (document.activeElement !== d) d.value = this.yaziDegeri(oge);
  }

  /** Yazı denetiminde gösterilen: açılır listede seçeneğin görünen adı, yazı alanında değer. */
  yaziDegeri(oge) {
    const deger = this.simdi(oge.kayit) ?? '';
    if (oge.a.tur !== 'acilir') return String(deger);
    return (oge.a.secenekler || []).find((o) => o[0] === deger)?.[1] ?? String(deger);
  }

  /** Yazı denetimindeki metni değer yapar (değiştiyse komut; true). Açılır listeye yazılan görünen ad dışa aktarma değerine çevrilir. */
  uygula(oge) {
    const d = oge.denetim;
    if (!d || d.tagName === 'SELECT') return false;
    let yeni = d.value;
    if (oge.a.tur === 'acilir') yeni = (oge.a.secenekler || []).find((o) => o[1] === yeni)?.[0] ?? yeni;
    else if (!oge.a.cokSatir) yeni = yeni.replace(/\r?\n/g, ' ');
    // maxLength yalnızca yazılanı sınırlar: dosyadaki değer daha uzunsa denetimde öyle görünür, düzenlenince sınıra kesilir
    if (yeni.length > EN_UZUN_METIN) yeni = yeni.slice(0, EN_UZUN_METIN).replace(/[\uD800-\uDBFF]$/, '');   // yarım vekil çift kalmasın
    return this.degistir(oge.kayit, yeni, this.sayfaNo(oge));
  }

  tikla(oge) {
    const a = oge.a, simdi = this.simdi(oge.kayit);
    let yeni;
    if (a.tur === 'onay') yeni = simdi === a.acik ? 'Off' : a.acik;
    else if (simdi === a.acik) { if (a.kapanmaz) return; yeni = 'Off'; }
    else yeni = a.acik;
    this.degistir(oge.kayit, yeni, this.sayfaNo(oge));
  }

  // ------------------------------------------------------------ liste kutusu
  /** Liste kutusu odaklanınca satırları görünür bir örtüde (çekirdeğin görünümüyle aynı satır yüksekliği ve ilk satır), kaydırılabilir. */
  listeAc(oge) {
    if (oge.liste) return;
    const l = oge.liste = document.createElement('div');
    l.className = 'form-liste';
    l.addEventListener('pointerdown', (e) => {
      const satir = e.target.closest('.form-liste-satir');
      if (!satir || e.button !== 0) return;
      e.preventDefault();
      this.listeSec(oge, +satir.dataset.i, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
    });
    l.addEventListener('wheel', (e) => { if (l.scrollHeight > l.clientHeight) e.stopPropagation(); }, { passive: true });
    oge.el.append(l);
    oge.el.classList.add('duzenleniyor');
    this.listeCiz(oge, true);
  }

  listeKapat(oge) {
    oge.liste?.remove(); oge.liste = null;
    oge.el.classList.remove('duzenleniyor');
  }

  listeCiz(oge, kaydir = false) {
    const a = oge.a, l = oge.liste;
    if (!l) return;
    const ptPx = oge.ptPx || 1, satir = (a.satir || 13.8) * ptPx, bw = a.kenar ? a.kenarKalinlik : 0;
    const secili = new Set(this.simdi(oge.kayit) || []);
    const yan = oge.egim === 90 || oge.egim === 270, w = parseFloat(oge.el.style.width), h = parseFloat(oge.el.style.height);
    const dw = yan ? h : w, dh = yan ? w : h;
    Object.assign(l.style, { left: (w - dw) / 2 + 'px', top: (h - dh) / 2 + 'px', width: dw + 'px', height: dh + 'px', transform: oge.egim ? `rotate(${oge.egim}deg)` : '',
      padding: `${bw * ptPx}px`, fontSize: (a.yaziBoyu || COK_SATIR_OTOMATIK) * ptPx + 'px', fontFamily: AILE_CSS[a.yaziTipi] || AILE_CSS.Arial });
    l.style.setProperty('--form-yazi', a.yaziRengi || '#000');
    l.style.setProperty('--form-zemin', a.arka || '#fff');
    l.replaceChildren(...(a.secenekler || []).map(([disari, gorunen], i) => {
      const r = document.createElement('div');
      r.className = 'form-liste-satir' + (secili.has(disari) ? ' secili' : '') + (i === oge.imlec ? ' imlec' : '');
      r.dataset.i = String(i);
      r.style.height = r.style.lineHeight = satir + 'px';
      r.style.paddingLeft = IC_PAY * ptPx + 'px';
      r.textContent = gorunen;
      return r;
    }));
    if (kaydir) l.scrollTop = (a.ust || 0) * satir;
  }

  /** Liste kutusunda seçim: tek seçimde tıklanan, çok seçimde Ctrl ile ekle / çıkar, Shift ile aralık, düz tıklama yalnızca o. */
  listeSec(oge, i, { ctrl = false, shift = false, ekle = false } = {}) {
    const a = oge.a, sec = a.secenekler || [];
    if (i < 0 || i >= sec.length) return;
    let yeni;
    const simdi = this.simdi(oge.kayit) || [];
    if (!a.cokluSecim) yeni = [sec[i][0]];
    else if (shift && oge.capa != null) { const [b, s] = [Math.min(oge.capa, i), Math.max(oge.capa, i)]; yeni = sec.slice(b, s + 1).map((o) => o[0]); }
    else if (ctrl || ekle) yeni = simdi.includes(sec[i][0]) ? simdi.filter((v) => v !== sec[i][0]) : sec.map((o) => o[0]).filter((v) => v === sec[i][0] || simdi.includes(v));
    else yeni = [sec[i][0]];
    if (!shift) oge.capa = i;
    oge.imlec = i;
    if (!this.degistir(oge.kayit, yeni, this.sayfaNo(oge))) this.listeCiz(oge);
    oge.liste?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------------ klavye
  tus(oge, e) {
    const a = oge.a;
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); this.gezin(oge, e.shiftKey ? -1 : 1); return; }
    const d = oge.denetim;
    if (d && e.target === d && d.tagName !== 'SELECT') {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); d.value = this.yaziDegeri(oge); d.blur(); this.g.kaydirici.focus({ preventScroll: true }); return; }
      if (e.key === 'Enter' && d.tagName === 'INPUT' && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); d.blur(); this.g.kaydirici.focus({ preventScroll: true }); return; }
      return;
    }
    if ((a.tur === 'onay' || a.tur === 'secenek') && e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.tikla(oge); return; }
    if (a.tur === 'secenek' && ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const grup = [...oge.s._formOgeler.values()].filter((o) => o.kayit === oge.kayit && !o.a.gizli);
      const k = grup.indexOf(oge), hedef = grup[(k + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : grup.length - 1)) % grup.length];
      if (hedef && hedef !== oge) { hedef.el.focus(); if (this.simdi(hedef.kayit) !== hedef.a.acik) this.tikla(hedef); }
      return;
    }
    if (a.tur === 'liste' && ['ArrowDown', 'ArrowUp', 'Home', 'End', ' '].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const n = (a.secenekler || []).length;
      if (!n) return;
      const simdi = this.simdi(oge.kayit) || [];
      const bas = oge.imlec ?? Math.max(0, (a.secenekler || []).findIndex((o) => simdi.includes(o[0])));
      if (e.key === ' ') { this.listeSec(oge, bas, { ekle: a.cokluSecim }); return; }
      const i = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : Math.max(0, Math.min(n - 1, bas + (e.key === 'ArrowDown' ? 1 : -1)));
      this.listeSec(oge, i, { shift: e.shiftKey && a.cokluSecim });
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); oge.el.blur(); this.g.kaydirici.focus({ preventScroll: true }); }
  }

  /** Tab sırası: belgenin sayfaları görünüm sırasıyla, sayfa içinde çekirdeğin verdiği sıra (/Tabs). Seçenek grubunun sayfadaki
   *  widget'ları tek durak (seçili olan, yoksa ilki). Alan bilgisi olmayan sayfa için çekirdeğe sorulur. */
  async gezin(oge, yon) {
    const g = this.g, n = g.sayfalar.length;
    let i = g.idx(oge.s);
    if (i < 0) return;
    const duraklar = (s) => {
      const liste = [], gruplar = new Set();
      const kayitlar = (s.formAlanlari || []).filter((a) => ODAKLANIR.has(a.tur) && !a.salt && !a.gizli);
      for (const a of kayitlar) {
        if (a.tur === 'secenek') {
          if (gruplar.has(a.alan)) continue;
          gruplar.add(a.alan);
          const kayit = this.alanKaydi(s.kaynak.yol, a);
          liste.push(kayitlar.find((b) => b.alan === a.alan && b.acik === this.simdi(kayit)) || a);
        } else liste.push(a);
      }
      return liste;
    };
    let liste = duraklar(oge.s);
    let k = liste.findIndex((a) => a.xref === oge.a.xref || (oge.a.tur === 'secenek' && a.alan === oge.a.alan)) + yon;
    for (let adim = 0; adim <= n; adim++) {
      if (k >= 0 && k < liste.length) { await this.odakla(g.sayfalar[i], liste[k]); return; }
      i = (i + yon + n) % n;
      const s = g.sayfalar[i];
      if (!s.bos && !s.formYok && !s.formAlanlari) {
        try { s.formAlanlari = (await g.cekirdek('form_alanlari', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa })).alanlar || []; } catch { s.formAlanlari = []; }
        if (!s.formAlanlari.length) s.formYok = true;
      }
      liste = s.bos ? [] : duraklar(s);
      k = yon > 0 ? 0 : liste.length - 1;
    }
  }

  /** Widget'ın denetimine odaklanır; sayfası çizilmemişse önce oraya gidilir ve katmanı beklenir. */
  async odakla(s, a) {
    const g = this.g, no = g.idx(s) + 1;
    const bul = () => s._formOgeler?.get(a.xref);
    let oge = bul();
    if (!oge) {
      const vp = s.pdfSayfa ? g.viewportAl(no - 1) : null;
      if (vp) {
        const p = vp.convertToViewportPoint(s.pdfSayfa.view[0] + a.rect[0], s.pdfSayfa.view[3] - a.rect[1]);
        const q = vp.convertToViewportPoint(s.pdfSayfa.view[0] + a.rect[2], s.pdfSayfa.view[3] - a.rect[3]);
        g.sayfayaGit(no, { y: Math.max(0, Math.min(p[1], q[1]) / (g.olcek * CSS_BIRIM) - 40) });
      } else g.sayfayaGit(no);
      const son = performance.now() + HEDEF_BEKLEME_MS;
      while (!(oge = bul()) && performance.now() < son) await new Promise((c) => setTimeout(c, 50));
      if (!oge) return;
    }
    const hedef = oge.denetim || oge.el;
    hedef.focus({ preventScroll: true });
    oge.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (hedef.select && hedef.tagName === 'INPUT') hedef.select();
  }

  // ------------------------------------------------------------ değer değişince
  /** Alanın bütün çizili widget'ları (her sayfada) yeni değeri gösterir: onay kutusu ve seçenek düğmesinde öbür durumun görünümü hemen
   *  konur (çekirdek beklenmez), yazı ve listelerde görünüm çekirdekten yeniden alınır. */
  alanGuncelle(kayit) {
    for (const s of this.g.sayfalar) {
      if (!s._formOgeler) continue;
      const yenilenecek = [];
      for (const oge of s._formOgeler.values()) {
        if (oge.kayit !== kayit) continue;
        this.denetimGuncelle(oge);
        const a = oge.a, gr = oge.gorunum;
        if (a.tur === 'onay' || a.tur === 'secenek') {
          const istenen = this.simdi(kayit) === a.acik ? a.acik : 'Off';
          if (gr && gr.durum === istenen) continue;
          if (gr?.diger && gr.diger.durum === istenen) { this.gorunumKoy(oge, { ...gr.diger, xref: gr.xref, durum: istenen, diger: { png: gr.png, kutu: gr.kutu, durum: gr.durum } }); continue; }
        }
        yenilenecek.push(oge);
      }
      if (yenilenecek.length) this.gorunumYenile(s, yenilenecek);
    }
  }

  /** Sayfadaki bazı widget'ların görünümünü (bekleyen değerlerle) yeniden ister. Gelene dek yazı denetimi görünür kalır (bekliyor). */
  async gorunumYenile(s, ogeler) {
    const c = s.cizim, g = this.g;
    if (!c || !s._formAnahtar) return;
    const no = ++this._istek, anahtar = s._formAnahtar;
    for (const o of ogeler) { o.istek = no; if (o.denetim && o.denetim.tagName !== 'SELECT') o.el.classList.add('bekliyor'); }
    let r = null;
    try {
      r = await g.cekirdek('form_gorunum', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, olcek: Math.min(6, c.olcek * CSS_BIRIM * (window.devicePixelRatio || 1)),
        dondurme: c.dondurme, degerler: this.bekleyenler(s.kaynak.yol), xrefler: ogeler.map((o) => o.a.xref) });
    } catch (e) { console.warn('Form görünümü alınamadı', e); }
    const gelen = new Map((r?.widgetlar || []).map((w) => [w.xref, w]));
    for (const o of ogeler) {
      if (o.istek !== no) continue;
      if (s._formAnahtar === anahtar && s._formOgeler?.get(o.a.xref) === o && gelen.has(o.a.xref)) this.gorunumKoy(o, gelen.get(o.a.xref));
      o.el.classList.remove('bekliyor');
      if (o.denetim && document.activeElement !== o.denetim && !o.liste) o.el.classList.remove('duzenleniyor');
    }
  }

  // ------------------------------------------------------------ belge düzeyinde
  /** Odaktaki yazı denetiminin metni uygulanır (kaydet, yazdır, kapat, sekme taşıma ve değiştirme öncesi); düzenleme sürer. */
  duzenlemeyiUygula() {
    const d = document.activeElement;
    if (!d?.classList?.contains('form-denetim') || !this.g.kok.contains(d)) return;
    const el = d.closest('.form-alan'), s = this.g.sayfalar.find((x) => x.el.contains(el));
    const oge = s?._formOgeler?.get(+el.dataset.xref);
    if (oge) this.uygula(oge);
  }

  /** Odaktaki yazı denetiminde uygulanmamış metin var mı (pencere kapanırken kaydedilmemiş sayılır). */
  duzenleniyor() {
    const d = document.activeElement;
    if (!d?.classList?.contains('form-denetim') || d.tagName === 'SELECT' || !this.g.kok.contains(d)) return false;
    const el = d.closest('.form-alan'), s = this.g.sayfalar.find((x) => x.el.contains(el));
    const oge = s?._formOgeler?.get(+el.dataset.xref);
    return !!oge && d.value !== this.yaziDegeri(oge);
  }

  /** Not aracı seçilince (notlar.js aracSec) alanlar tıklamayı almaz; odaktaki alan bırakılır (yazısı uygulanır). */
  aracDegisti(arac) {
    this.arac = arac || null;
    this.g.kok.classList.toggle('form-arac', !!this.arac);
    if (this.arac && this.g.kok.contains(document.activeElement) && document.activeElement.closest?.('.form-alan')) {
      document.activeElement.blur();
      this.g.kaydirici.focus({ preventScroll: true });
    }
  }
}
