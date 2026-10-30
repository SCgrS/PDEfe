// Bul (Ctrl+F): belge alanının sağ üstünde küçük arama penceresi; Türkçe duyarlı arama,
// tüm eşleşmeleri vurgulama, yer imi ve yorumlarda arama, tüm sekmelerde arama. Taranmış sayfalarda tanınan yazıda da arar (0.3.1).
import { glifDuzelt1e1, trKucuk } from './metin.js';
import { tanimaBirak, tanimaYokMu } from './goruntuleyici.js';

/** Sonuçların sırası (0.3.1): Belge (aramadaki sırası), tür (metin, yer imi, yorum), metinde sayfa ve konum. Yer imi ve yorumlar
 *  eklendikleri sırada kalır (sıralama kararlı). Tanınan yazının eşleşmeleri sayfalar tanındıkça gelir, yerlerine girer. */
const TUR_SIRASI = { metin: 0, yerimi: 1, yorum: 2 };
/** Sayfanın vurgulanan metin katmanı: PDF.js TextLayer ya da XFA formunda (0.3.1) XFA katmanının öğeleri (goruntuleyici.js _xfaMetni:
 *  aynı textDivs / textContentItemsStr biçiminde). Vurgu seçicisi ikisini de kapsar. */
const katmanOf = (s) => s.textLayer || s.xfaMetin || null;
const VURGU = '.textLayer .highlight, .xfaLayer .highlight';
const SECILI_VURGU = '.textLayer .highlight.selected, .xfaLayer .highlight.selected';

const sonucSirasi = (a, b) => (a.sira - b.sira) || (TUR_SIRASI[a.tur] - TUR_SIRASI[b.tur]) || (a.tur === 'metin' ? (a.sayfa - b.sayfa) || (a.bas - b.bas) : 0);

export class Arama extends EventTarget {
  constructor({ kutu, belgeAl, belgeler, sekmeSec, cekirdek }) {
    super();
    this.kutu = kutu;
    this.belgeAl = belgeAl;          // () => aktif belge
    this.belgeler = belgeler;        // Map id → belge
    this.sekmeSec = sekmeSec;
    this.cekirdek = cekirdek;
    this.ayar = { tamSozcuk: false, buyukKucuk: false, yerimi: false, yorum: false, tumSekmeler: false };
    this.sorgu = '';
    this.sonuclar = [];              // {belgeId, tur:'metin'|'yerimi'|'yorum', sira, sayfa, bas, son, girdi, ...} (sonucSirasi'yla sıralı)
    this.gecerli = -1;
    this.aramaSayac = 0;
    this.tanima = null;              // son aramanın taranmış sayfaları {toplam, biten, yok} (_tanimaliAra; sayaç)
    this.tanimaIstegi = null;        // son aramanın tanıma kuyruğundaki istek nesnesi (goruntuleyici.js tanimaBirak)
    this.aramaBelgeId = null;        // son aramanın başladığı (o an aktif) belge
    this.kaliciKapsam = null;        // ac() geçici kapsam verdiyse kullanıcının seçtiği tumSekmeler değeri (kapanınca geri yüklenir)
    this.metinOnbellek = new WeakMap();   // gorunum → Map(sayfa → {metin, items})
    this.acik = false;
    this.konumlar = new Map();       // belgeId → {sorgu, sayfa, bas}: sekmeden çıkarken o belgedeki geçerli eşleşme (dönünce geri gelir)
    this._kur();
  }

  _kur() {
    this.kutu.innerHTML = `
      <input type="text" id="bul-girdi" placeholder="Bul" spellcheck="false">
      <span class="sayac" id="bul-sayac"></span>
      <button class="ikon" id="bul-onceki" title="Önceki (Shift+Enter, Shift+F3)"><svg viewBox="0 0 20 20"><path d="m5 12 5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
      <button class="ikon" id="bul-sonraki" title="Sonraki (Enter, F3)"><svg viewBox="0 0 20 20"><path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
      <button class="ikon" id="bul-ayar" title="Arama seçenekleri"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M9.14 4.87L9.17 2.14A7.9 7.9 0 0 1 10.83 2.14L10.86 4.87A5.2 5.2 0 0 1 13.02 5.77L14.97 3.86A7.9 7.9 0 0 1 16.14 5.03L14.23 6.98A5.2 5.2 0 0 1 15.13 9.14L17.86 9.17A7.9 7.9 0 0 1 17.86 10.83L15.13 10.86A5.2 5.2 0 0 1 14.23 13.02L16.14 14.97A7.9 7.9 0 0 1 14.97 16.14L13.02 14.23A5.2 5.2 0 0 1 10.86 15.13L10.83 17.86A7.9 7.9 0 0 1 9.17 17.86L9.14 15.13A5.2 5.2 0 0 1 6.98 14.23L5.03 16.14A7.9 7.9 0 0 1 3.86 14.97L5.77 13.02A5.2 5.2 0 0 1 4.87 10.86L2.14 10.83A7.9 7.9 0 0 1 2.14 9.17L4.87 9.14A5.2 5.2 0 0 1 5.77 6.98L3.86 5.03A7.9 7.9 0 0 1 5.03 3.86L6.98 5.77A5.2 5.2 0 0 1 9.14 4.87Z"/><circle cx="10" cy="10" r="2.4"/></svg></button>
      <button class="ikon" id="bul-kapat" title="Kapat (Esc)"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.6"/></svg></button>
      <div class="ayar-menu" id="bul-ayar-menu" hidden>
        <label><input type="checkbox" data-ayar="tamSozcuk"> Yalnızca tam sözcükler</label>
        <label><input type="checkbox" data-ayar="buyukKucuk"> Büyük-küçük harf duyarlı</label>
        <label><input type="checkbox" data-ayar="yerimi"> Yer imlerini dahil et</label>
        <label><input type="checkbox" data-ayar="yorum"> Yorumları dahil et</label>
        <hr style="border:none;border-top:1px solid var(--kenar);margin:2px 0">
        <label><input type="radio" name="bul-kapsam" data-kapsam="belge" checked> Geçerli belgede ara</label>
        <label><input type="radio" name="bul-kapsam" data-kapsam="tum"> Tüm açık sekmelerde ara</label>
      </div>`;
    const g = this.kutu.querySelector('#bul-girdi');
    this.girdi = g;
    this.sayac = this.kutu.querySelector('#bul-sayac');
    let zaman = null;
    // Bul kapalıyken gelen input (başka bir kutuda Ctrl+Z bu gizli girdinin son yazmasını geri alabilir) aramaz, belgeyi kaydırmaz; yazdıktan
    // hemen sonra Esc ile kapatılırsa bekleyen arama da çalışmaz
    g.addEventListener('input', () => { clearTimeout(zaman); if (this.acik) zaman = setTimeout(() => { if (this.acik) this.ara(g.value); }, 200); });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (g.value !== this.sorgu) this.ara(g.value); else this.git(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { this.kapat(); }
      else if (e.key === 'F3') { e.preventDefault(); this.git(e.shiftKey ? -1 : 1); }
    });
    this.kutu.querySelector('#bul-onceki').addEventListener('click', () => this.git(-1));
    this.kutu.querySelector('#bul-sonraki').addEventListener('click', () => this.git(1));
    this.kutu.querySelector('#bul-kapat').addEventListener('click', () => this.kapat());
    const menu = this.kutu.querySelector('#bul-ayar-menu'), ayarDugme = this.kutu.querySelector('#bul-ayar');
    ayarDugme.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    // Dışarıda herhangi bir tuşla basış kapatır (açık belgeler listesi gibi yakalama evresinde). Düğme (içindeki svg/path dahil) hariç:
    // yoksa basış kapatır, ardından gelen click menüyü yeniden açar
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !ayarDugme.contains(e.target)) menu.hidden = true; }, true);
    menu.querySelectorAll('input[data-ayar]').forEach((c) => c.addEventListener('change', () => { this.ayar[c.dataset.ayar] = c.checked; this.ara(this.girdi.value, true); }));
    menu.querySelectorAll('input[data-kapsam]').forEach((c) => c.addEventListener('change', () => { this.ayar.tumSekmeler = menu.querySelector('input[data-kapsam="tum"]').checked; this.kaliciKapsam = null; this.ara(this.girdi.value, true); }));
  }

  /** Seçenek menüsündeki kapsam radyo düğmelerini this.ayar.tumSekmeler'e eşitler. */
  kapsamEsitle() {
    this.kutu.querySelector('input[data-kapsam="tum"]').checked = !!this.ayar.tumSekmeler;
    this.kutu.querySelector('input[data-kapsam="belge"]').checked = !this.ayar.tumSekmeler;
  }

  /** Bul kutusunu açar. secenek.tumSekmeler verilirse arama kapsamı yalnızca bu arama için ayarlanır (ör. "Açık belgeler" listesinden gelince):
   *  kutu kapanınca ya da seçeneksiz yeniden açılınca (sade Ctrl+F) kullanıcının seçtiği kapsama dönülür. Seçenek menüsündeki seçim kalıcıdır. */
  ac(onSorgu, secenek = {}) {
    this.kutu.hidden = false;
    this.acik = true;
    let tum = this.ayar.tumSekmeler;
    if (secenek.tumSekmeler != null) { if (this.kaliciKapsam == null) this.kaliciKapsam = this.ayar.tumSekmeler; tum = !!secenek.tumSekmeler; }
    else if (this.kaliciKapsam != null) { tum = this.kaliciKapsam; this.kaliciKapsam = null; }
    const kapsamDegisti = tum !== this.ayar.tumSekmeler;
    if (kapsamDegisti) { this.ayar.tumSekmeler = tum; this.kapsamEsitle(); }
    if (onSorgu) this.girdi.value = onSorgu;
    this.girdi.focus(); this.girdi.select();
    // Yalnızca kapsam verilerek açılınca ("Açık belgeler" listesi): seçilen belge geçerli sonucun/aramanın belgesi değilse yeniden ara.
    // Seçeneksiz açılış (sade Ctrl+F) yalnızca kapsam ya da sorgu değişince arar; sekme değiştirmez, odağı girdide bırakır.
    const aktifId = this.belgeAl()?.id ?? null, gs = this.sonuclar[this.gecerli];
    // Gidilmiş eşleşme yoksa (sekme değişiminde gitmeden bulundu, bkz. sekmeDegisti) listeden gelen istek ilk eşleşmeye gitsin
    const belgeDegisti = secenek.tumSekmeler != null && this.sorgu !== '' && (gs ? gs.belgeId !== aktifId : this.aramaBelgeId !== aktifId || this.sonuclar.length > 0);
    if (this.girdi.value && (kapsamDegisti || belgeDegisti || this.girdi.value !== this.sorgu)) this.ara(this.girdi.value, true);
  }

  kapat() {
    this.kutu.hidden = true;
    this.acik = false;
    if (this.kaliciKapsam != null) { this.ayar.tumSekmeler = this.kaliciKapsam; this.kaliciKapsam = null; this.kapsamEsitle(); }   // geçici kapsamdan dön (bkz. ac)
    this.aramaSayac++;   // süren arama sonradan sayaca yazmasın
    this.tanimaBirak();  // aramanın bekleyen tanımaları (başlamış olanlar biter, sonuçları sayfada kalır)
    this.vurgulariTemizle();
    this.sonuclar = []; this.gecerli = -1; this.sorgu = ''; this.konumlar.clear(); this.tanima = null;
    this.sayacTemizle();
    this.belgeAl()?.gorunum.kaydirici.focus();
  }

  sayacTemizle() { this.sayac.textContent = ''; this.sayac.title = ''; this.sayac.classList.remove('yok'); }

  /** Son aramanın tanıma kuyruğunda bekleyen sayfalarını bırakır. */
  tanimaBirak() {
    if (this.tanimaIstegi) { tanimaBirak(this.tanimaIstegi); this.tanimaIstegi = null; }
  }

  /** Etkin sekme değişti (sekmeye geçildi, sekme kapandı, yeni belge açıldı). Kutu açık ve sorgu varken sonuçlar etkin belge için
   *  yeniden bulunur; sayaç önceki belgenin sonuçlarında kalmaz. Görünüm kaydırılmaz (sekmeye dönen kullanıcı yerini kaybetmez):
   *  sayaç 'N sonuç' der, Enter / F3 geçerli sayfadaki ya da sonraki eşleşmeye gider. Belgede daha önce bir eşleşmeye gidilmişse
   *  (referans okuyucudaki gibi) o eşleşme yeniden geçerli olur ('3 / 12'), yine kaydırılmaz. Arama başka sekmedeki eşleşmeye giderken
   *  (tüm sekmelerde arama) geçerli eşleşme zaten o sekmededir; yeniden aranmaz. Belge henüz yüklenmediyse sonuçlar temizlenir,
   *  yüklenince yeniden çağrılır. */
  sekmeDegisti() {
    if (!this.acik || !this.girdi.value) return;
    const aktif = this.belgeAl(), aktifId = aktif?.id ?? null, gs = this.sonuclar[this.gecerli];
    if (gs ? gs.belgeId === aktifId : this.aramaBelgeId === aktifId && this.girdi.value === this.sorgu) return;
    if (gs?.tur === 'metin') this.konumlar.set(gs.belgeId, { sorgu: this.sorgu, sayfa: gs.sayfa, bas: gs.bas });
    if (!aktif?.gorunum.belge) {
      this.aramaSayac++; this.tanimaBirak(); this.vurgulariTemizle();
      this.sonuclar = []; this.gecerli = -1; this.aramaBelgeId = null; this.sorgu = ''; this.tanima = null;
      this.sayacTemizle();
      return;
    }
    const k = this.konumlar.get(aktifId);
    this.ara(this.girdi.value, true, { gitme: true, hedef: k?.sorgu === this.girdi.value ? { belgeId: aktifId, ...k } : null });
  }

  // ------------------------------------------------------------ metin dizini
  normalle(s) {
    s = glifDuzelt1e1(s);
    return this.ayar.buyukKucuk ? s : trKucuk(s);
  }

  /**
   * Sayfanın aranan metni: Metin katmanının öğeleri (goruntuleyici.js aramaOgeleri: PDF metni, ardından tanınmışsa görsellerdeki yazı,
   * 0.3.1). konumlar öğe başına (div: metin katmanındaki sırası, tanima: tanınan sözcük). Tanınan bölüm PDF metninden konumsuz bir satır
   * sonuyla ayrılır (iki bölüme taşan eşleşme olmaz), tanimaBasi o bölümün başı. Önbellekteki kayıt sayfa sonradan tanınınca (girdinin
   * s.tanima'sı değişti) yeniden kurulur.
   */
  async sayfaMetni(gorunum, sayfa) {
    let m = this.metinOnbellek.get(gorunum);
    if (!m) { m = new Map(); this.metinOnbellek.set(gorunum, m); }
    const girdi = gorunum.sayfalar[sayfa - 1];
    const eski = m.get(sayfa);
    // XFA formunda (0.3.1) alanların değerleri de aranır: değerler değişebildiği için her aramada yeniden kurulur (vurgu kaydı okur)
    if (eski && eski.girdi === girdi && eski.tanima === (girdi?.tanima || null) && !gorunum.xfa) return eski;
    const { items, pdfOgeSayisi, tanima } = await gorunum.aramaOgeleri(sayfa - 1);
    const parcalar = [], konumlar = [];
    let uz = 0, tanimaBasi = -1;
    items.forEach((it, i) => {
      if (i === pdfOgeSayisi) { if (uz) { parcalar.push('\n'); uz++; } tanimaBasi = uz; }
      const s = it.str + (it.hasEOL ? '\n' : '');
      konumlar.push({ bas: uz, son: uz + it.str.length, div: i, tanima: i >= pdfOgeSayisi });
      parcalar.push(s); uz += s.length;
    });
    const kayit = { metin: parcalar.join(''), konumlar, girdi, tanima, tanimaBasi: tanimaBasi < 0 ? uz : tanimaBasi };
    if (gorunum.sayfalar[sayfa - 1] === girdi) m.set(sayfa, kayit);   // bu arada düzen değiştiyse önbelleğe yazılmaz
    return kayit;
  }

  eslesmeleriBul(metin, sorgu) {
    const n = this.normalle(metin), q = this.normalle(sorgu);
    const sonuc = [];
    if (!q) return sonuc;
    let i = 0;
    const harf = (c) => c != null && /[\p{L}\p{N}]/u.test(c);
    while ((i = n.indexOf(q, i)) !== -1) {
      const bitis = i + q.length;
      if (!this.ayar.tamSozcuk || (!harf(n[i - 1]) && !harf(n[bitis]))) sonuc.push([i, bitis]);
      i = bitis;
    }
    return sonuc;
  }

  /** Belgenin bütün sayfalarındaki metin eşleşmesi sayısı (Bul ile aynı normalleştirme ve seçenekler; vurgulamaz, gezinmez).
   *  "Açık belgeler" listesi kullanır. iptal: () => boolean (ya da AbortSignal); true olunca o ana kadarki sayıyla erken döner. */
  async belgedeSay(belge, sorgu, { iptal } = {}) {
    const g = belge?.gorunum;
    sorgu = sorgu || '';
    if (!g || !sorgu.trim()) return 0;
    const iptalMi = () => (typeof iptal === 'function' ? !!iptal() : !!iptal?.aborted);
    let toplam = 0, mola = performance.now();
    for (let sayfa = 1; sayfa <= g.sayfaSayisi; sayfa++) {   // sayfa sayısı her turda yeniden okunur (belge kapanır/değişirse)
      // Görüntüleyici yok edildiyse dur: okunmamış sayfa, PDF'i dosyadan yeniden açıp hiç kapatılmayan bir belge bırakırdı
      if (iptalMi() || g.yok) return toplam;
      let kayit;
      try { kayit = await this.sayfaMetni(g, sayfa); } catch { continue; }
      toplam += this.eslesmeleriBul(kayit.metin, sorgu).length;
      // Büyük belgede arayüz donmasın: önbellekten gelen sayfalar da ~15 ms'de bir olay döngüsüne bırakılır
      if (performance.now() - mola > 15) { await new Promise((r) => setTimeout(r, 0)); mola = performance.now(); }
    }
    return toplam;
  }

  // ------------------------------------------------------------ arama
  /** gitme: eşleşmeleri bulup vurgular ama hiçbirine gitmez (görünüm kaymaz; bkz. sekmeDegisti). hedef {belgeId, sayfa, bas} ya da
   *  {belgeId, kimlik, bas} (sayfa girdisinin kimliğiyle, bkz. duzenDegisti): bu eşleşme (hâlâ varsa ve bu arada başka eşleşmeye
   *  gidilmediyse) kaydırmadan geçerli yapılır.
   *  Taranmış sayfalar (0.3.1): PDF metni sayfa sayfa aranırken görsellerinde yazı olan sayfalar tanınmak üzere sıraya girer (_tanimaliAra);
   *  tanınan yazının eşleşmeleri sayfalar tanındıkça eklenir. Arama ancak bütün sayfalar tanınınca biter ("Bulunamadı" ondan sonra). */
  async ara(sorgu, yeniden = false, { gitme = false, hedef = null } = {}) {
    sorgu = sorgu || '';
    if (!yeniden && sorgu === this.sorgu) return;
    this.sorgu = sorgu;
    this.aramaBelgeId = this.belgeAl()?.id ?? null;
    const sayac = ++this.aramaSayac;
    this.tanimaBirak();   // önceki aramanın bekleyen tanımaları
    this.vurgulariTemizle();
    this.sonuclar = []; this.gecerli = -1; this.tanima = null;
    if (!sorgu.trim()) { this.sayacTemizle(); return; }
    const aktif = this.belgeAl();
    if (!aktif) { this.sayacTemizle(); return; }
    const belgeler = this.ayar.tumSekmeler ? [aktif, ...[...this.belgeler.values()].filter((b) => b !== aktif)] : [aktif];
    this.sayac.textContent = 'aranıyor…'; this.sayac.title = ''; this.sayac.classList.remove('yok');
    // İki kolun (PDF metni sırayla, tanınan yazı sayfalar tanındıkça) ortak durumu: aynı eşleşme bir kez eklenir, ilk bulunana bir kez gidilir
    const d = { sayac, sorgu, gitme, ilkGidildi: false, eklenen: new Set(), sira: new Map(belgeler.map((b, i) => [b, i])) };
    const tanimaBitti = this._tanimaliAra(belgeler, aktif, d).catch((e) => console.warn('Taranmış sayfalarda aranamadı', e));
    for (const b of belgeler) {
      const g = b.gorunum;
      const n = g.sayfaSayisi;
      // Geçerli sayfadan başlayarak sıra
      const sira = [];
      const bas = b === aktif ? g.gecerli : 1;
      for (let s = bas; s <= n; s++) sira.push(s);
      for (let s = 1; s < bas; s++) sira.push(s);
      for (const sayfa of sira) {
        if (sayac !== this.aramaSayac) return;
        if (g.yok) break;   // arama sürerken belge kapandı (bkz. belgedeSay)
        let kayit;
        try { kayit = await this.sayfaMetni(g, sayfa); } catch { continue; }
        if (sayac !== this.aramaSayac) return;
        if (g.yok) break;
        this._eslesmeEkle(b, sayfa, this.eslesmeleriBul(kayit.metin, sorgu), d);
        if (n > 40 && sayfa % 10 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      if (g.yok) continue;   // kapanan belgenin yer imi/yorumuna bakılmaz
      const sira2 = d.sira.get(b);
      // Yer imleri
      if (this.ayar.yerimi) {
        try {
          const agac = await g.belge.getOutline();
          const duz = [];
          const gez = (l) => { for (const o of l || []) { duz.push(o); gez(o.items); } };
          gez(agac);
          for (const o of duz) if (this.eslesmeleriBul(o.title || '', sorgu).length) this.sonucEkle([{ belgeId: b.id, tur: 'yerimi', sira: sira2, baslik: o.title, dest: o.dest }]);
        } catch {}
      }
      // Yorumlar
      if (this.ayar.yorum) {
        try {
          const r = await this.cekirdek('notlar', { yol: b.yol });
          for (const nt of r.notlar) if (this.eslesmeleriBul((nt.icerik || '') + ' ' + (nt.yazar || ''), sorgu).length) this.sonucEkle([{ belgeId: b.id, tur: 'yorum', sira: sira2, sayfa: nt.sayfa, not: nt }]);
        } catch {}
      }
      if (sayac !== this.aramaSayac) return;
    }
    if (sayac !== this.aramaSayac) return;
    // PDF metni bitti: Tanınan sayfalar bekleniyor olabilir (sayaç ilerlemeyi gösterir)
    this._hedefeDon(hedef);
    this.sayacYaz(true);
    await tanimaBitti;
    if (sayac !== this.aramaSayac) return;
    this._hedefeDon(hedef);
    this.sayacYaz(false);
    if (this.sonuclar.length && this.gecerli < 0 && !gitme) { this.gecerli = 0; this.gecerliyeGit(); }
  }

  /** Bir sayfanın metin eşleşmelerini ekler (iki koldan gelen aynı eşleşme bir kez: d.eklenen), vurgular, ilk bulunana gider (gitme değilse). */
  _eslesmeEkle(b, sayfa, esl, d) {
    const g = b.gorunum, girdi = g.sayfalar[sayfa - 1], yeni = [];
    for (const [bas, son] of esl) {
      const a = `${b.id}:${sayfa}:${bas}`;
      if (d.eklenen.has(a)) continue;
      d.eklenen.add(a);
      yeni.push({ belgeId: b.id, tur: 'metin', sira: d.sira.get(b), sayfa, bas, son, girdi });
    }
    if (!yeni.length) return;
    if (!this.sonucEkle(yeni)) this.sayfayiVurgula(g, sayfa);
    if (!d.ilkGidildi) { d.ilkGidildi = true; if (!d.gitme) { this.gecerli = this.sonuclar.indexOf(yeni[0]); this.gecerliyeGit(); } }
    this.sayacYaz(true);
  }

  /**
   * Taranmış sayfalarda arama (0.3.1): Görsellerinde tanınacak yazı olan sayfalar (goruntuleyici.js tanimaAdaylari) pencerenin tanıma
   * kuyruğuna aramanın sırasıyla girer (etkin belgede geçerli sayfadan başlayarak; kuyrukta görünür sayfalar yine önce). Her sayfa
   * tanındıkça tanınan bölümdeki eşleşmeler eklenir (PDF metnininkileri PDF metni kolu ekler). Sayaç ilerlemeyi gösterir ("Tanınıyor
   * 12/39"). Daha önce tanınmış sayfalar beklenmez. Arama kapanınca ya da aranan değişince bekleyen tanımalar bırakılır (tanimaBirak),
   * tanınmış olanlar sayfada kalır. Tanıyıcı yoksa (dil paketi, Linux) bu sayfalar aranmaz, sayaç bunu söyler.
   */
  async _tanimaliAra(belgeler, aktif, d) {
    const istek = {}, t = { toplam: 0, biten: 0, yok: false }, bekleyen = [];
    this.tanimaIstegi = istek; this.tanima = t;
    for (const b of belgeler) {
      const g = b.gorunum;
      if (g.yok || !g.belge) continue;
      const bas = b === aktif ? g.gecerli : 1;
      const sira = [...g.sayfalar.slice(bas - 1), ...g.sayfalar.slice(0, bas - 1)];
      try {
        for await (const adaylar of g.tanimaAdaylari(sira)) {
          if (d.sayac !== this.aramaSayac) return;
          for (const s of adaylar) {
            if (!s.tanima && tanimaYokMu()) { t.yok = true; continue; }
            t.toplam++;
            bekleyen.push(this._taninanAra(b, s, istek, d, t));
          }
          this.sayacYaz(true);
        }
      } catch (e) { console.warn('Taranmış sayfalarda aranamadı', e); }
      if (d.sayac !== this.aramaSayac) return;
    }
    await Promise.all(bekleyen);
  }

  async _taninanAra(b, s, istek, d, t) {
    const g = b.gorunum;
    const r = await g.tanimaBekle(s, istek);
    if (d.sayac !== this.aramaSayac) return;
    t.biten++;
    if (!r && tanimaYokMu()) t.yok = true;
    const i = g.idx(s);
    if (r?.satirlar.length && i >= 0 && !g.yok) {
      let kayit = null;
      try { kayit = await this.sayfaMetni(g, i + 1); } catch {}
      if (d.sayac !== this.aramaSayac) return;
      if (kayit && g.sayfalar[i] === s) this._eslesmeEkle(b, i + 1, this.eslesmeleriBul(kayit.metin, d.sorgu).filter(([bas]) => bas >= kayit.tanimaBasi), d);
    }
    this.sayacYaz(true);
  }

  /** Sekmeye dönünce ya da düzen değişince (gitme) önceki geçerli eşleşmeyi kaydırmadan yeniden geçerli yapar. */
  _hedefeDon(hedef) {
    if (!hedef || this.gecerli >= 0) return;
    const i = this.sonuclar.findIndex((s) => s.tur === 'metin' && s.belgeId === hedef.belgeId && s.bas === hedef.bas
      && (hedef.kimlik ? s.girdi?.kimlik === hedef.kimlik : s.sayfa === hedef.sayfa));
    if (i >= 0 && this.belgeler.get(hedef.belgeId)) { this.gecerli = i; this._cizilenleriVurgula(); }
  }

  /** Sonuçları sıralı tutar (sonucSirasi; yeni kendi içinde sıralı): Sona eklenen sıralanmaz. Araya giren olunca sıralanır ve vurgu
   *  numaraları kaydığı için çizili sayfaların hepsi yeniden vurgulanır (gidilmemiş aramada da: bkz. ara gitme). Döner: yeniden vurgulandı mı. */
  sonucEkle(yeni) {
    const gecerliNesne = this.sonuclar[this.gecerli] || null, son = this.sonuclar.at(-1);
    this.sonuclar.push(...yeni);
    const araya = !!son && sonucSirasi(son, yeni[0]) > 0;
    if (araya) this.sonuclar.sort(sonucSirasi);
    if (gecerliNesne) this.gecerli = this.sonuclar.indexOf(gecerliNesne);
    if (araya) this._cizilenleriVurgula();
    return araya;
  }

  /** Sonucu olan belgelerde metin katmanı kurulu sayfaların vurgularını yeniden işler. */
  _cizilenleriVurgula() {
    const idler = new Set(this.sonuclar.map((s) => s.belgeId));
    for (const id of idler) {
      const g = this.belgeler.get(id)?.gorunum;
      if (g) for (const s of g.sayfalar) if (katmanOf(s)) this.sayfayiVurgula(g, s.no);
    }
  }

  /** Sayaç: "3 / 12", "12 sonuç" (gidilmemiş), "aranıyor…", "Bulunamadı". Taranmış sayfalar tanınırken ilerleme ("Tanınıyor 12/39",
   *  "3 / 12 · tanınıyor 12/39"); tanıyıcı olmadığı için aranamayan taranmış sayfa varsa arama bitince kısa bilgi. */
  sayacYaz(devam) {
    const n = this.sonuclar.length, t = this.tanima;
    const taniniyor = !!t && t.biten < t.toplam;
    let metin;
    if (!n) metin = taniniyor ? `Tanınıyor ${t.biten}/${t.toplam}` : (devam ? 'aranıyor…' : 'Bulunamadı');
    // Henüz bir eşleşmeye gidilmediyse (sekme değişiminde yeniden bulundu) yalnızca sayı
    else metin = (this.gecerli < 0 ? `${n} sonuç` : `${this.gecerli + 1} / ${n}`) + (taniniyor ? ` · tanınıyor ${t.biten}/${t.toplam}` : (devam ? '…' : ''));
    const eksik = !!t?.yok && !taniniyor && !devam;
    if (eksik) metin += ' · taranmış sayfalar aranamadı';
    this.sayac.textContent = metin;
    this.sayac.classList.toggle('yok', !n && !devam && !taniniyor);
    this.sayac.title = taniniyor ? 'Taranmış sayfalardaki yazı tanınıyor. Bulunanlar geldikçe eklenir.'
      : (eksik ? 'Bu bilgisayarda yazı tanıyıcı olmadığı için taranmış sayfalardaki yazı aranamadı.' : '');
  }

  git(yon) {
    if (!this.sonuclar.length) return;
    if (this.gecerli < 0) {
      // Gidilmiş eşleşme yok: etkin belgede geçerli sayfadaki ya da ondan sonraki (geri: önceki) ilk eşleşme; yoksa baştaki / sondaki
      const b = this.belgeAl(), no = b?.gorunum.gecerli || 1;
      const uygun = (s) => s.belgeId === b?.id && s.tur === 'metin';
      const i = yon > 0 ? this.sonuclar.findIndex((s) => uygun(s) && s.sayfa >= no) : this.sonuclar.findLastIndex((s) => uygun(s) && s.sayfa <= no);
      this.gecerli = i >= 0 ? i : (yon > 0 ? 0 : this.sonuclar.length - 1);
    } else this.gecerli = (this.gecerli + yon + this.sonuclar.length) % this.sonuclar.length;
    this.gecerliyeGit();
    this.sayacYaz(false);
  }

  async gecerliyeGit() {
    const s = this.sonuclar[this.gecerli];
    if (!s) return;
    const b = this.belgeler.get(s.belgeId);
    if (!b) return;
    if (this.belgeAl() !== b) this.sekmeSec(b.id);
    const g = b.gorunum;
    // Önceki seçili vurguyu kaldır
    document.querySelectorAll(SECILI_VURGU).forEach((e) => e.classList.remove('selected'));
    if (s.tur === 'metin') {
      const yer = g.yerlesim[s.sayfa - 1];
      if (!yer || !katmanOf(g.sayfalar[s.sayfa - 1])) g.sayfayaGit(s.sayfa);
      // Metin katmanı çizilince vurgular yerleşir; sonra kaydır
      await this.katmanBekle(g, s.sayfa);
      const el = g.sayfalar[s.sayfa - 1].el.querySelector(`.highlight[data-eslesme="${this.sonuclar.indexOf(s)}"]`);
      if (el) {
        el.classList.add('selected');
        const k = g.kaydirici.getBoundingClientRect(), r = el.getBoundingClientRect();
        if (r.top < k.top + 40 || r.bottom > k.bottom - 40 || r.left < k.left || r.right > k.right) {
          g.kaydirici.scrollTop += r.top - k.top - k.height / 2;
          if (r.left < k.left || r.right > k.right) g.kaydirici.scrollLeft += r.left - k.left - k.width / 2;
        }
      }
    } else if (s.tur === 'yerimi') {
      this.dispatchEvent(new CustomEvent('yerimineGit', { detail: { belge: b, oge: s } }));
    } else if (s.tur === 'yorum') {
      g.sayfayaGit(s.sayfa, { y: Math.max(0, s.not.rect[1] - 40) });
      this.dispatchEvent(new CustomEvent('notaGit', { detail: { belge: b, not: s.not } }));
    }
  }

  katmanBekle(g, sayfa) {
    return new Promise((coz) => {
      const s = g.sayfalar[sayfa - 1];
      if (katmanOf(s) && s.el.querySelector(VURGU)) { coz(); return; }
      let deneme = 0;
      const t = setInterval(() => { if ((katmanOf(s) && s.el.querySelector(VURGU)) || ++deneme > 40) { clearInterval(t); coz(); } }, 50);
    });
  }

  // ------------------------------------------------------------ vurgulama
  /** Sayfanın metin katmanına o sayfadaki eşleşmeleri işler (katman çizildiğinde de çağrılır). */
  async sayfayiVurgula(g, sayfa) {
    const s = g.sayfalar[sayfa - 1];
    const tl = katmanOf(s);
    if (!tl) return;
    const kayit = this.metinOnbellek.get(g)?.get(sayfa);
    if (!kayit) return;
    const divs = tl.textDivs;
    const strs = tl.textContentItemsStr;
    if (!divs || !divs.length) return;
    // Temizle
    divs.forEach((d, i) => { if (d.querySelector('.highlight')) d.textContent = strs[i]; });
    const eslesmeler = this.sonuclar.map((r, idx) => ({ r, idx })).filter((x) => x.r.tur === 'metin' && x.r.belgeId === this.belgeIdOf(g) && x.r.sayfa === sayfa);
    if (!eslesmeler.length) return;
    // Her div için parçalar
    const parcalar = new Map();   // divIdx → [{bas, son, idx}] (div içi konumlar)
    for (const { r, idx } of eslesmeler) {
      for (let i = 0; i < kayit.konumlar.length; i++) {
        const k = kayit.konumlar[i];
        if (k.son <= r.bas) continue;
        if (k.bas >= r.son) break;
        const bas = Math.max(r.bas, k.bas) - k.bas;
        let son = Math.min(r.son, k.son) - k.bas;
        if (son <= bas) continue;
        // Tanınan sözcüğün öğesi ardındaki boşluğu da taşır ama genişliği sözcüğünkü (goruntuleyici.js tanimaOgeleri): sözcüğün sonuna
        // dek uzanan vurgu boşluğu da kapsar, yoksa sözcüğün kutusundan boşluğun payı kadar kısa kalırdı (0.3.1)
        if (k.tanima && son === k.son - k.bas - 1 && strs[k.div]?.[son] === ' ') son++;
        if (!parcalar.has(k.div)) parcalar.set(k.div, []);
        parcalar.get(k.div).push({ bas, son, idx });
      }
    }
    for (const [divIdx, liste] of parcalar) {
      const div = divs[divIdx]; const metin = strs[divIdx];
      if (!div || metin == null) continue;
      liste.sort((a, b) => a.bas - b.bas);
      div.textContent = '';
      let imlec = 0;
      for (const p of liste) {
        if (p.bas > imlec) div.append(document.createTextNode(metin.slice(imlec, p.bas)));
        const sp = document.createElement('span');
        sp.className = 'highlight' + (p.idx === this.gecerli ? ' selected' : '');
        sp.dataset.eslesme = String(p.idx);
        sp.textContent = metin.slice(p.bas, p.son);
        div.append(sp);
        imlec = p.son;
      }
      if (imlec < metin.length) div.append(document.createTextNode(metin.slice(imlec)));
    }
  }

  belgeIdOf(g) { for (const b of this.belgeler.values()) if (b.gorunum === g) return b.id; return null; }

  vurgulariTemizle() {
    for (const b of this.belgeler.values()) {
      for (const s of b.gorunum.sayfalar) {
        const tl = katmanOf(s);
        if (!tl) continue;
        const divs = tl.textDivs, strs = tl.textContentItemsStr;
        divs.forEach((d, i) => { if (d.querySelector('.highlight')) d.textContent = strs[i]; });
      }
    }
  }

  /** Görüntüleyici bir sayfanın metin katmanını çizince çağrılır. */
  katmanCizildi(g, sayfa) {
    if (!this.acik || !this.sonuclar.length) return;
    this.sayfayiVurgula(g, sayfa);
  }

  belgeUnut(g) { this.metinOnbellek.delete(g); }

  /** Belgenin sayfa düzeni değişti (sayfa eklendi, silindi, taşındı, döndürüldü): metin önbelleği atılır. Bul açıksa ve bu belgede
   *  aranıyorsa sonuçlar yeni sayfa numaralarıyla yeniden bulunur, görünüm kaymaz. Geçerli eşleşmenin sayfası taşındıysa (girdinin
   *  kimliğiyle) yine geçerli olur (0.3.1; eskiden sonuçlar eski numaralarda kalıyor, vurgular siliniyordu). */
  duzenDegisti(g) {
    this.belgeUnut(g);
    if (!this.acik || !this.sorgu.trim()) return;
    const id = this.belgeIdOf(g);
    if (id == null || (!this.ayar.tumSekmeler && id !== this.aramaBelgeId)) return;
    const gs = this.sonuclar[this.gecerli];
    const hedef = gs?.tur === 'metin' && gs.girdi ? { belgeId: gs.belgeId, kimlik: gs.girdi.kimlik, bas: gs.bas } : null;
    this.ara(this.sorgu, true, { gitme: true, hedef });
  }
}
