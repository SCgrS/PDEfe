// Sekme çubuğu: sekme listesi, sürükleyerek sıralama ve çubuğun dışına sürükleyerek ayırma (işaretçi olaylarıyla; aşağıda
// surukleHazirla), tekerlekle geçiş, ◀ ▶ düğmeleri, + (yeni sekme; uygulama.js açılış sayfası sekmesi açar), "Açık belgeler" listesi ve
// Ctrl+Tab son-kullanım sırasına göre sekme seçici.
import { ortuTiklamasiBagla } from './ortu.js';
import { MAC } from './platform.js';

/** Sekmenin ipucu: sabit genişlikte kısalabilen tam ad ve dosyanın yolu. */
const ipucu = (ad, yol) => (yol && yol !== ad ? `${ad}\n${yol}` : ad);

// Sürüklenen sekme, imleç sekme çubuğunun üstünden ya da altından (ya da pencerenin yanlarından) bu kadar uzaklaşınca çubuktan ayrılır
// (sıralarken elin biraz kayması sekmeyi ayırmasın); ayrılmış sekme çubuğa bunun yarısı kadar yaklaşınca geri takılır (kıyıda gidip gelmesin)
const AYIRMA_ESIGI = 24;
// Sürüklenen sekme komşu sekmenin genişliğinin bu kadarına girince ikisi yer değiştirir (surukleIzle; 0.1.21)
const YER_DEGISTIRME = 0.25;

export class SekmeCubugu extends EventTarget {
  constructor({ cubuk, liste, onceki, sonraki, acilir, secici, belgeListesi, aramaSay = null, ayrilabilir = null }) {
    super();
    this.cubuk = cubuk; this.liste = liste; this.secici = secici; this.belgeListesi = belgeListesi;
    // (id, sorgu, { iptal }) => Promise<number>: "Açık belgeler" listesinde belge içi eşleşme sayısı; verilmezse liste ada göre süzülür
    this.aramaSay = typeof aramaSay === 'function' ? aramaSay : null;
    // (id) => boolean: sekme çubuğun dışına sürüklenince ayrılabilir mi (belge sekmesi, yüklenmiş); verilmezse hiçbir sekme ayrılmaz
    this.ayrilabilir = typeof ayrilabilir === 'function' ? ayrilabilir : null;
    this._isaret = null;      // başka pencereden sürüklenen sekmenin bırakılacağı yerin işareti (birakmaIsareti)
    this.listeNo = 0;         // açık listenin/sorgunun kimliği; geç gelen eski sayımları ayıklar
    this.listeZaman = null;
    this.sekmeler = [];       // {id, ad, yol, el, degisti}
    this.aktifId = null;
    this.mru = [];            // son kullanım sırası (id'ler; en yeni başta)
    this.seciciAcik = false;
    this.seciciIdx = 0;
    this.surukleme = null;    // basılı tutulan / sürüklenen sekmenin durumu (surukleHazirla)
    this.yerlesme = null;     // bırakılan sekme yerine kayarken: bitiren işlev

    // ◀ ▶ basılı tutunca hızlı geçiş. Başa dönmez (0.1.12, kullanıcı isteği): ilk / son sekmede durur, o uçtaki düğme devre dışı.
    // Devre dışı kalan düğme mouseup / mouseleave almaz: basılı tutma uca varınca kendisi biter, bırakma belgede de dinlenir
    this.onceki = onceki; this.sonraki = sonraki;
    for (const [dugme, yon] of [[onceki, -1], [sonraki, 1]]) {
      let zaman = null, aralik = null;
      const birak = () => { clearTimeout(zaman); clearInterval(aralik); zaman = aralik = null; };
      dugme.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        birak();
        if (!this.kaydir(yon)) return;
        zaman = setTimeout(() => { aralik = setInterval(() => { if (!this.kaydir(yon)) birak(); }, 180); }, 400);
      });
      dugme.addEventListener('mouseup', birak);
      dugme.addEventListener('mouseleave', birak);
      window.addEventListener('mouseup', birak);
      window.addEventListener('blur', birak);
    }
    acilir.addEventListener('click', (e) => { e.stopPropagation(); this.belgeListesiAcKapa(); });
    cubuk.addEventListener('pointerleave', () => this.genislikKilidiniKaldir());   // kapatırken kilitlenen sekme genişliği (genislikKilitle)

    // Sekme çubuğu üzerinde (sekmeler, boş kısım, düğmeler) fare tekerleği: sekme değiştir (sekme sürüklenirken değil). Bir tekerlek
    // hareketi bir sekme geçer (0.2.1): dokunmatik yüzey (macOS'ta ve Windows'un hassas dokunmatik yüzeyinde) tek hareketi ve ardından
    // gelen eylemsizliği kare başına küçük adımlı ayrı olaylarla gönderir; her olay bir sekme geçince tek hareket çubuğun ucuna atlatıyordu.
    // Arasında 150 ms'den uzun boşluk olmayan aynı yönlü olaylar bir harekettir (görüntüleyicideki tekerlekleCevir gibi). Süre olayın
    // kendi zamanından (timeStamp: girdinin geldiği an): sekme geçişi ana iş parçacığını meşgul edince bekleyen olaylar topluca işlenir,
    // işleme anına bakılsaydı aynı hareket ikinci kez sekme geçerdi. Piksel eşiği yok: Mac'te yavaş çevrilen fare tekerleğinin bir
    // çentiği ~4 px gelir. Windows'ta fare tekerleğinin çentiği (wheelDelta 120'nin katı) eskisi gibi çentik başına bir sekme geçer;
    // Mac'te bu ölçüt kullanılmaz (dokunmatik yüzeyin olayı da 120'nin katı olabilir).
    cubuk.addEventListener('wheel', (e) => {
      if (!this.sekmeler.length) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;   // dokunmatik yüzeyin hareket başı / sonu olayı (Mac'te deltası 0)
      const yon = d > 0 ? 1 : -1, simdi = e.timeStamp || performance.now();
      const w = Math.abs(e.wheelDeltaX || 0) > Math.abs(e.wheelDeltaY || 0) ? e.wheelDeltaX : e.wheelDeltaY;
      const centik = !MAC && (e.deltaMode !== 0 || (!!w && w % 120 === 0));
      const t = this._tekerlek || (this._tekerlek = { son: -Infinity, yon: 0 });
      const yeni = centik || simdi - t.son > 150 || yon !== t.yon;
      t.son = simdi; t.yon = yon;
      if (yeni && !this.surukleme?.basladi) this.kaydir(yon);
    }, { passive: false });

    // Dışarıda herhangi bir tuşla basış listeyi kapatır (Araçlar penceresi gibi yakalama evresinde: basışı işleyip mousedown'ı
    // engelleyen yerler, ör. nota tıklama, de kapatsın). Açılır düğme hariç: yoksa basış kapatır, ardından gelen click listeyi yeniden açar
    document.addEventListener('pointerdown', (e) => {
      if (!this.belgeListesi.hidden && !this.belgeListesi.contains(e.target) && !acilir.contains(e.target)) this.belgeListesiKapat();
    }, true);
    // Ctrl+Tab seçicisinin karartılmış arka planına tıklamak Esc gibi sekme değiştirmeden kapatır
    ortuTiklamasiBagla(secici, () => this.seciciIptal());
  }

  // ------------------------------------------------------------ temel işlemler
  /** Sekme ekler: sona ya da `once` kimlikli sekmenin önüne (açılış sekmesinden açılan belge onun yerini alır). baslangic: açılış
   *  sayfası sekmesi ("Yeni sekme"; dosyası yok). */
  ekle({ id, ad, yol, once = null, baslangic = false }) {
    if (!this.belgeListesi.hidden) this.belgeListesiKapat();   // açık liste sekme kümesini bir kez kurar; bayat kalmasın
    this.surukleKes();   // sürükleme sekmelerin yerlerini ölçüp tutar; yeni sekmeyle bayatlar
    this.genislikKilidiniKaldir();   // yeni sekme kilitli genişlikle eklenip listeyi gereksiz kaydırmasın
    const el = document.createElement('div');
    el.className = 'sekme' + (baslangic ? ' baslangic-sekmesi' : '');
    el.title = ipucu(ad, yol);
    el.innerHTML = `<span class="nokta">•</span><span class="ad"></span><button class="kapat" title="Kapat (Ctrl+W)"><svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/></svg></button>`;
    el.querySelector('.ad').textContent = ad;
    const sekme = { id, ad, yol, el, degisti: false, baslangic };
    const sonraki = once ? this.sekmeler.findIndex((s) => s.id === once) : -1;
    if (sonraki >= 0) { this.sekmeler.splice(sonraki, 0, sekme); this.liste.insertBefore(el, this.sekmeler[sonraki + 1].el); }
    else { this.sekmeler.push(sekme); this.liste.append(el); }

    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) { e.preventDefault(); this.genislikKilitle(el); this.dispatchEvent(new CustomEvent('kapat', { detail: { id } })); }
      else if (e.button === 0 && !e.target.closest('.kapat')) this.dispatchEvent(new CustomEvent('sec', { detail: { id } }));
    });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    el.querySelector('.kapat').addEventListener('click', (e) => { e.stopPropagation(); this.genislikKilitle(el); this.dispatchEvent(new CustomEvent('kapat', { detail: { id } })); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.dispatchEvent(new CustomEvent('sagTik', { detail: { id } })); });

    // Sürükleyerek sıralama / ayırma: sol tuşla basılıp çekilince (kapat düğmesinden değil)
    el.addEventListener('pointerdown', (e) => { if (e.button === 0 && e.isPrimary && !e.target.closest('.kapat')) this.surukleHazirla(e, el, id); });

    this.okDurumu();   // arka planda açılan sekme sona eklenir: ▶ etkinleşir
    this.tekAcilisDurumu();
    return sekme;
  }

  /** Sekme × ya da orta tıkla kapatılırken sekmelerin genişliği o anki genişlikte kilitlenir: sekme sayısı azalınca genişlemezler, sıradaki
   *  sekmenin × düğmesi imlecin altına gelir (tarayıcılardaki gibi). İmleç sekme çubuğundan çıkınca ya da sekme eklenince kilit kalkar,
   *  sekmeler sayılarına göre yeniden genişler (stil.css .sekme). */
  genislikKilitle(el) {
    const g = el.getBoundingClientRect().width;
    if (!g) return;
    this.liste.style.setProperty('--sekme-kilit', g + 'px');
    this.liste.classList.add('genislik-kilitli');
  }

  genislikKilidiniKaldir() { this.liste.classList.remove('genislik-kilitli'); }

  /** Çubuktaki tek sekme açılış sekmesiyse kapat düğmesi gizlenir: o sekme kapatılmaz, çubuk hiç boş kalmaz (0.1.21; uygulama.js
   *  baslangicSekmesiniKapat). */
  tekAcilisDurumu() { this.liste.classList.toggle('tek-acilis', this.sekmeler.length === 1 && !!this.sekmeler[0].baslangic); }

  siralamayiOku() {
    const sira = [...this.liste.children].map((el) => this.sekmeler.find((s) => s.el === el)).filter(Boolean);
    if (sira.length === this.sekmeler.length && sira.every((s, i) => s === this.sekmeler[i])) return;   // sıra değişmedi
    this.sekmeler = sira;
    this.okDurumu();
    this.dispatchEvent(new CustomEvent('siralandi', { detail: { idler: sira.map((s) => s.id) } }));
  }

  // ------------------------------------------------------------ sürükleyerek sıralama
  // 0.1.14 (kullanıcı isteği): tarayıcının sürükle-bırakı (draggable) yerine işaretçi olaylarıyla. Önceden sekmenin yarı saydam gri
  // kopyası imleçle her yöne gidiyor, sekmeler yer açmadan birden yer değiştiriyordu. Artık Chrome'daki gibi: sekme çubukta kalır, gölgeyle
  // öne çıkıp imleci yatayda izler; öteki sekmeler kayarak yer açar; bırakınca sekme açılan yere kayıp oturur, sıra ancak o zaman
  // değişir (siralamayiOku). Esc, pencerenin odağı kaybetmesi ya da işaretçinin iptali sürüklemeyi bırakır: sekmeler eski yerlerine kayar.
  // Sekmeler sığmayıp kaydırılıyorsa imleç listenin ucuna gelince liste kendiliğinden kayar. Konumlar sürükleme başında ölçülür
  // (liste içeriğine göre, kaydırmadan bağımsız); sekme eklenir ya da kapanırsa sürükleme hemen bırakılır (surukleKes).
  //
  // 0.1.19 (kullanıcı isteği): sekme çubuğun dışına sürüklenince çubuktan ayrılır. İmleç çubuğun üstüne / altına ya da pencerenin
  // yanlarına AYIRMA_ESIGI'nden çok uzaklaşınca (seridinDisinda) sekme çubukta görünmez olur, ötekiler boşluğu kapatır ve 'ayrildi'
  // olayı verilir (uygulama.js imleci izleyen önizlemeyi gösterir). Çubuğa geri gelince sekme imlecin altında yerine takılır
  // ('geriTakildi'), sıralama sürer. Dışarıda bırakılınca ('disariBirakildi') sıra değişmez; sekme, uygulama onu başka pencereye
  // taşıyana (kaldir) ya da vazgeçene (askidanCikar) dek çubukta gizli kalır. Esc ve odak kaybı ayrılmış sekmeyi de yerine döndürür.
  // Yalnızca ayrilabilir(id)'nin izin verdiği sekmeler ayrılır (açılış sekmesi ayrılmaz: çubukta kalır, imleci yatayda izler).

  /** Sol tuşla basış: sürükleme henüz başlamaz; 5 px'ten çok çekilince başlar (tıklama sekmeyi seçmekle kalır). */
  surukleHazirla(e, el, id = null) {
    this.surukleKes();
    const s = this.surukleme = { el, id, pointerId: e.pointerId, x0: e.clientX, x: e.clientX, y0: e.clientY, y: e.clientY, kaydirma0: this.liste.scrollLeft, basladi: false, ayrildi: false, ayrilir: false };
    const hareket = (ev) => {
      if (ev.pointerId !== s.pointerId) return;
      s.x = ev.clientX; s.y = ev.clientY;
      if (!s.basladi) { if (Math.hypot(s.x - s.x0, s.y - s.y0) < 5) return; this.surukleBaslat(s); }
      this.surukleGuncelle(s);
    };
    const birak = (ev) => { if (ev.pointerId !== s.pointerId) return; if (s.ayrildi) this.surukleDisariBirak(s); else this.surukleBitir(s, true); };
    const iptal = () => this.surukleBitir(s, false);
    const tus = (ev) => { if (ev.key === 'Escape' && s.basladi) { ev.preventDefault(); ev.stopImmediatePropagation(); iptal(); } };
    const dinleyiciler = [['pointermove', hareket], ['pointerup', birak], ['pointercancel', iptal], ['keydown', tus]];
    for (const [ad, f] of dinleyiciler) window.addEventListener(ad, f, true);
    window.addEventListener('blur', iptal);
    s.dinlemeyiBirak = () => { for (const [ad, f] of dinleyiciler) window.removeEventListener(ad, f, true); window.removeEventListener('blur', iptal); };
  }

  surukleBaslat(s) {
    const ogeler = [...this.liste.children].filter((x) => x.classList.contains('sekme') && !x.classList.contains('askida')), i = ogeler.indexOf(s.el);
    if (i < 0) { this.surukleBitir(s, false); return; }
    const lr = this.liste.getBoundingClientRect(), kaydirma = this.liste.scrollLeft;
    const kutular = ogeler.map((x) => x.getBoundingClientRect());
    Object.assign(s, {
      basladi: true, ogeler, i, j: i,
      konum: kutular.map((k) => k.left - lr.left + kaydirma), genislik: kutular.map((k) => k.width),
      bosluk: parseFloat(getComputedStyle(this.liste).columnGap) || 0,
      tutma: { x: s.x0 - kutular[i].left, y: s.y0 - kutular[i].top },   // sekmenin tutulduğu nokta (önizleme imlecin altında aynı yerden durur)
      ayrilir: !!(s.id != null && this.ayrilabilir?.(s.id)),
    });
    s.el.classList.add('tasiniyor');
    this.liste.classList.add('siralaniyor');
    // Yakalama listede (sekmede değil): sekme ayrılınca görünmez olur; imleç pencerenin dışına çıksa da olaylar gelmeye devam eder
    try { this.liste.setPointerCapture(s.pointerId); } catch { /* işaretçi bu arada bırakıldıysa */ }
    this.surukleKaydir(s);
  }

  /** İmleç sekme çubuğundan (üstünden / altından) ya da pencerenin yanlarından eşikten çok uzakta mı. Ayrılmış sekme için eşik yarıya iner. */
  seridinDisinda(s) {
    const r = this.cubuk.getBoundingClientRect(), e = s.ayrildi ? AYIRMA_ESIGI / 2 : AYIRMA_ESIGI;
    return s.y < r.top - e || s.y > r.bottom + e || s.x < -e || s.x > window.innerWidth + e;
  }

  /** İmlecin yeni yerine göre: sekme çubuktaysa sıralamayı izler, dışına çıktıysa ayırır, geri geldiyse yerine takar. */
  surukleGuncelle(s) {
    if (this.surukleme !== s || !s.basladi) return;
    const disarda = s.ayrilir && this.seridinDisinda(s);
    if (disarda && !s.ayrildi) this.surukleAyir(s);
    else if (!disarda && s.ayrildi) this.surukleGeriTak(s);
    if (!s.ayrildi) this.surukleIzle(s);
  }

  /** Sekme çubuktan ayrıldı: görünmez olur, sonraki sekmeler boşluğu kapatır (bırakılana ya da geri takılana dek DOM sırası değişmez). */
  surukleAyir(s) {
    s.ayrildi = true;
    s.el.classList.add('ayrildi');
    const kay = s.genislik[s.i] + s.bosluk;
    s.ogeler.forEach((x, k) => { if (k !== s.i) x.style.transform = k > s.i ? `translateX(${-kay}px)` : ''; });
    this.dispatchEvent(new CustomEvent('ayrildi', { detail: { id: s.id, tutma: s.tutma } }));
  }

  /** Ayrılmış sekme çubuğa geri döndü (ya da sürükleme bırakıldı): yeniden görünür. */
  surukleGeriTak(s) {
    s.ayrildi = false;
    s.el.classList.remove('ayrildi');
    this.dispatchEvent(new CustomEvent('geriTakildi', { detail: { id: s.id } }));
  }

  /** Ayrılmış sekme çubuğun dışında bırakıldı: sıra değişmez; sekme uygulama karar verene dek çubukta gizli (askıda) kalır. */
  surukleDisariBirak(s) {
    if (this.surukleme !== s) return;
    this.surukleme = null;
    s.dinlemeyiBirak();
    cancelAnimationFrame(s.kare);
    try { this.liste.releasePointerCapture(s.pointerId); } catch { /* zaten bırakılmış */ }
    this.liste.classList.remove('siralaniyor');
    s.el.classList.remove('tasiniyor', 'ayrildi');
    for (const x of s.ogeler) x.style.transform = '';
    s.el.classList.add('askida');
    this.dispatchEvent(new CustomEvent('disariBirakildi', { detail: { id: s.id } }));
  }

  /** Dışarıda bırakılan sekme taşınamadı ya da vazgeçildi: çubukta eski yerinde yeniden görünür. */
  askidanCikar(id) { this.bul(id)?.el.classList.remove('askida'); }

  /** Sürüklenen sekmeyi imlecin altında tutar (ilk sekmenin solu ile son sekmenin sağı arasında) ve ötekileri açılan yere göre kaydırır. */
  surukleIzle(s) {
    if (this.surukleme !== s || !s.basladi) return;
    const { i, konum, genislik, ogeler } = s, n = ogeler.length;
    const dx = Math.max(konum[0] - konum[i], Math.min(konum[n - 1] + genislik[n - 1] - konum[i] - genislik[i],
      s.x - s.x0 + this.liste.scrollLeft - s.kaydirma0));
    s.el.style.transform = `translateX(${dx}px)`;
    // Yeni yer: sürüklenen sekme öteki sekmelerin kaçının içine YER_DEGISTIRME kadar girdi (sağa giderken sağ kenarı, sola giderken sol
    // kenarı). 0.1.21 (kullanıcı isteği, "geçiş çok sert"): önceden sekmenin ortası komşunun ortasına varmalıydı, yani sekme komşusunun
    // tam üstüne gelince yer değişiyordu; artık komşusunun dörtte birine girince değişir. Varmak (eşitlik) yeter
    const sol = konum[i] + dx, sag = sol + genislik[i];
    s.j = ogeler.reduce((j, _x, k) => (k > i && sag >= konum[k] + genislik[k] * YER_DEGISTIRME ? j + 1
      : k < i && sol <= konum[k] + genislik[k] * (1 - YER_DEGISTIRME) ? j - 1 : j), i);
    const kay = genislik[i] + s.bosluk;
    ogeler.forEach((x, k) => {
      if (k === i) return;
      const d = k > i && k <= s.j ? -kay : k < i && k >= s.j ? kay : 0;
      x.style.transform = d ? `translateX(${d}px)` : '';
    });
  }

  /** İmleç listenin ucundaysa (ya da dışındaysa) liste o yöne kayar; uca uzaklığa göre hızlanır. */
  surukleKaydir(s) {
    if (this.surukleme !== s) return;
    const r = this.liste.getBoundingClientRect(), bolge = 32;
    const derinlik = s.ayrildi ? 0 : s.x < r.left + bolge ? s.x - r.left - bolge : s.x > r.right - bolge ? s.x - r.right + bolge : 0;   // ayrılmış sekme listeyi kaydırmaz
    if (derinlik) {
      const once = this.liste.scrollLeft, hiz = Math.max(-20, Math.min(20, derinlik / 3));
      this.liste.scrollLeft = once + (Math.trunc(hiz) || Math.sign(hiz));
      if (this.liste.scrollLeft !== once) this.surukleIzle(s);
    }
    s.kare = requestAnimationFrame(() => this.surukleKaydir(s));
  }

  /** Bırakma (kaydet) ya da iptal: sekme açılan yere (iptalde eski yerine) kayar, sonra DOM sırası değişir ve model okunur. hemen:
   *  kaydırma beklenmez (sekme eklenirken / kapanırken). */
  surukleBitir(s, kaydet, { hemen = false } = {}) {
    if (this.surukleme !== s) return;
    this.surukleme = null;
    s.dinlemeyiBirak();
    if (!s.basladi) return;
    cancelAnimationFrame(s.kare);
    try { this.liste.releasePointerCapture(s.pointerId); } catch { /* zaten bırakılmış */ }
    // Çubuktan ayrılmışken bırakma (Esc, odak kaybı, sekme eklendi / kapandı): sekme yeniden görünür, eski yerine döner
    if (s.ayrildi) { this.surukleGeriTak(s); kaydet = false; for (const x of s.ogeler) if (x !== s.el) x.style.transform = ''; }
    const { el, i, ogeler, konum, genislik } = s, j = kaydet ? s.j : i;
    let zaman = null;
    const yerles = () => {
      if (this.yerlesme !== yerles) return;
      this.yerlesme = null;
      clearTimeout(zaman);
      el.removeEventListener('transitionend', bitti);
      // Geçişsiz: sınıflar ve kaydırmalar aynı anda kalkar, sekmeler yeni DOM sırasındaki yerlerinde (görünen yerleri) durur
      this.liste.classList.remove('siralaniyor');
      el.classList.remove('tasiniyor', 'yerlesiyor');
      for (const x of ogeler) x.style.transform = '';
      if (j !== i && el.parentNode === this.liste && ogeler[j].parentNode === this.liste) this.liste.insertBefore(el, j > i ? ogeler[j].nextSibling : ogeler[j]);
      this.siralamayiOku();
    };
    const bitti = (ev) => { if (ev.target === el && ev.propertyName === 'transform') yerles(); };
    this.yerlesme = yerles;
    if (hemen) { yerles(); return; }
    if (!kaydet) for (const x of ogeler) if (x !== el) x.style.transform = '';   // ötekiler de eski yerlerine kayar
    // Varılacak yer: sağa taşınırken j'nin sağ kenarına, sola taşınırken j'nin sol kenarına hizalı (sekmeler eş genişlikte olmasa da)
    const hedef = j > i ? konum[j] + genislik[j] - genislik[i] - konum[i] : j < i ? konum[j] - konum[i] : 0;
    el.classList.add('yerlesiyor');
    el.style.transform = `translateX(${hedef}px)`;
    el.addEventListener('transitionend', bitti);
    zaman = setTimeout(yerles, 220);   // geçiş yoksa (yer aynı, azaltılmış hareket) ya da transitionend gelmezse
  }

  /** Süren sürüklemeyi hemen bırakır (sıra değişmez), yerleşmekte olan sekmeyi hemen yerine koyar. */
  surukleKes() {
    if (this.surukleme) this.surukleBitir(this.surukleme, false, { hemen: true });
    this.yerlesme?.();
  }

  kaldir(id) {
    const i = this.sekmeler.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.surukleKes();
    // Liste açıkken (ör. Ctrl+W) kapanan belgenin satırı kalmasın; kapatma listeNo'yu artırıp süren sayımları da iptal eder
    if (!this.belgeListesi.hidden) this.belgeListesiKapat();
    this.sekmeler[i].el.remove();
    this.sekmeler.splice(i, 1);
    this.mru = this.mru.filter((x) => x !== id);
    if (!this.sekmeler.length) this.aktifId = null;   // uygulama hemen açılış sekmesi açar (çubuk gizlenmez)
    this.okDurumu();
    this.tekAcilisDurumu();
  }

  aktifYap(id) {
    this.aktifId = id;
    for (const s of this.sekmeler) s.el.classList.toggle('aktif', s.id === id);
    const s = this.bul(id);
    if (s) s.el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    this.mru = [id, ...this.mru.filter((x) => x !== id)];
    this.okDurumu();
  }

  bul(id) { return this.sekmeler.find((s) => s.id === id); }

  /** Başka pencereden bırakılan sekmenin gireceği yer: x (pencere içi yatay konum) hangi sekmenin ortasından soldaysa o sekmenin
   *  kimliği (taşınan sekme onun önüne eklenir); bütün sekmelerin sağındaysa null (sona eklenir). */
  birakmaYeri(x) {
    for (const s of this.sekmeler) { const r = s.el.getBoundingClientRect(); if (r.width && x < r.left + r.width / 2) return s.id; }
    return null;
  }

  /** Başka pencereden sürüklenen sekmenin bırakılacağı yeri gösterir: x'in düştüğü iki sekmenin arasında dikey çizgi (birakmaYeri ile
   *  aynı kural); x null ise işaret kalkar. Sekmeler kaydırılmışsa çizgi listenin görünen kısmında kalır. */
  birakmaIsareti(x) {
    if (x == null || !this.sekmeler.length) { this._isaret?.remove(); this._isaret = null; return; }
    if (!this._isaret) { this._isaret = document.createElement('div'); this._isaret.className = 'sekme-birakma'; this.cubuk.append(this._isaret); }
    const once = this.birakmaYeri(x), cr = this.cubuk.getBoundingClientRect(), lr = this.liste.getBoundingClientRect();
    const son = this.sekmeler.at(-1).el.getBoundingClientRect();
    const sol = once ? this.bul(once).el.getBoundingClientRect().left - 2 : son.right + 1;
    this._isaret.style.left = Math.round(Math.max(lr.left, Math.min(lr.right, sol)) - cr.left) + 'px';
  }

  /** Ad, yol (Farklı kaydet) ya da değişiklik işareti değişti. */
  guncelle(id, { ad, yol, degisti }) {
    const s = this.bul(id);
    if (!s) return;
    if (ad != null) { s.ad = ad; s.el.querySelector('.ad').textContent = ad; }
    if (yol != null) s.yol = yol;
    if (ad != null || yol != null) s.el.title = ipucu(s.ad, s.yol);
    if (degisti != null) { s.degisti = degisti; s.el.classList.toggle('degisti', degisti); }
  }

  /** Bir sonraki/önceki sekmeye (sıra düzenine göre) geç: ◀ ▶ ve sekme çubuğunda tekerlek. İlk / son sekmede durur, başa dönmez
   *  (0.1.12, kullanıcı isteği). Geçildiyse true. */
  kaydir(yon) {
    if (!this.sekmeler.length) return false;
    const i = this.sekmeler.findIndex((s) => s.id === this.aktifId);
    const j = i < 0 ? 0 : i + yon;
    if (j < 0 || j >= this.sekmeler.length || j === i) return false;
    this.dispatchEvent(new CustomEvent('sec', { detail: { id: this.sekmeler[j].id } }));
    return true;
  }

  /** ◀ ▶ uçta devre dışı: ilk sekmedeyken ◀, son sekmedeyken ▶. */
  okDurumu() {
    const i = this.sekmeler.findIndex((s) => s.id === this.aktifId);
    if (this.onceki) this.onceki.disabled = i <= 0;
    if (this.sonraki) this.sonraki.disabled = i < 0 || i >= this.sekmeler.length - 1;
  }

  /** En son kullanılana göre bir sonraki (Ctrl+Tab'ın kısa basımı). */
  mruSonraki() {
    if (this.mru.length < 2) return null;
    return this.mru[1];
  }

  // ------------------------------------------------------------ Ctrl+Tab seçici
  seciciAc(kucukResim) {
    if (this.sekmeler.length < 2) return;
    this.seciciAcik = true;
    this.seciciIdx = 1;
    this.secici.innerHTML = '<div class="kutu-ic"></div>';
    const ic = this.secici.firstChild;
    this.mru.forEach((id, k) => {
      const s = this.bul(id);
      if (!s) return;
      const a = document.createElement('div');
      a.className = 'aday' + (k === this.seciciIdx ? ' secili' : '');
      a.dataset.id = id;
      a.innerHTML = s.baslangic ? '<div class="bos baslangic"><svg viewBox="0 0 20 20"><path d="M10 4.5v11M4.5 10h11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div><div class="ad"></div>'
        : '<div class="bos"></div><div class="ad"></div>';
      a.querySelector('.ad').textContent = s.ad;
      a.addEventListener('click', () => { this.seciciKapat(id); });
      ic.append(a);
      kucukResim(id).then((src) => {
        if (!src) return;
        const img = document.createElement('img'); img.src = src;
        a.querySelector('.bos')?.replaceWith(img);
      });
    });
    // Kısa basışta (Ctrl hemen bırakılırsa) seçici hiç görünmesin
    this.secici.hidden = true;
    clearTimeout(this._seciciZaman);
    this._seciciZaman = setTimeout(() => { if (this.seciciAcik) this.secici.hidden = false; }, 220);
  }

  seciciIlerle(yon) {
    const adaylar = [...this.secici.querySelectorAll('.aday')];
    if (!adaylar.length) return;
    this.seciciIdx = (this.seciciIdx + yon + adaylar.length) % adaylar.length;
    this.secici.hidden = false;   // ikinci basışta hemen göster
    adaylar.forEach((a, k) => a.classList.toggle('secili', k === this.seciciIdx));
    adaylar[this.seciciIdx].scrollIntoView({ inline: 'nearest' });
  }

  seciciKapat(secilenId = null) {
    if (!this.seciciAcik) return;
    const adaylar = [...this.secici.querySelectorAll('.aday')];
    const id = secilenId ?? adaylar[this.seciciIdx]?.dataset.id;
    this.seciciIptal();
    if (id && id !== this.aktifId) this.dispatchEvent(new CustomEvent('sec', { detail: { id } }));
  }

  /** Seçiciyi sekme değiştirmeden kapatır (Esc, arka plana tıklama). */
  seciciIptal() {
    if (!this.seciciAcik) return;
    clearTimeout(this._seciciZaman);
    this.seciciAcik = false;
    this.secici.hidden = true;
    this.secici.innerHTML = '';
  }

  // ------------------------------------------------------------ Açık belgeler listesi
  belgeListesiAcKapa() { if (this.belgeListesi.hidden) this.belgeListesiAc(); else this.belgeListesiKapat(); }

  /** Açık belgeler listesi. aramaSay verildiyse kutu tüm belgelerde metin arar: her satırda eşleşme sayısı, eşleşmeliler üstte;
   *  sorgu varken seçim 'belgedeAra' {id, sorgu} (0 eşleşmeli satırda 'sec'), yokken 'sec' {id} gönderir. aramaSay yoksa kutu ada/yola göre süzer. */
  belgeListesiAc() {
    const kut = this.belgeListesi;
    clearTimeout(this.listeZaman);
    this.listeNo++;
    kut.innerHTML = '';
    const sayarak = !!this.aramaSay;
    const girdi = document.createElement('input');
    girdi.type = 'text'; girdi.spellcheck = false;
    girdi.placeholder = sayarak ? 'Tüm belgelerde ara' : 'Belge ara';
    kut.append(girdi);
    const ul = document.createElement('ul');
    kut.append(ul);
    const sorguVar = () => sayarak && girdi.value.trim() !== '';
    const sec = (r) => {
      // "0 eşleşme" satırı yalnızca sekmeye geçer: tüm sekmelerde arama ilk eşleşmeyi başka belgede bulup oraya atlardı
      const sorgu = girdi.value, ara = sorguVar() && r.sayi !== 0 && !r.s.baslangic;   // açılış sekmesinde aranacak belge yok
      this.belgeListesiKapat();
      if (ara) this.dispatchEvent(new CustomEvent('belgedeAra', { detail: { id: r.s.id, sorgu } }));
      else this.dispatchEvent(new CustomEvent('sec', { detail: { id: r.s.id } }));
    };
    // Satırlar bir kez kurulur; sorgu değişince yalnızca rozet, görünürlük ve sıra güncellenir (seçili satır korunur)
    const satirlar = this.sekmeler.map((s) => {
      const li = document.createElement('li');
      if (s.id === this.aktifId) li.classList.add('aktif');
      li.innerHTML = '<span class="ad"></span><span class="rozet" hidden></span><span class="yol"></span>';
      li.querySelector('.ad').textContent = (s.degisti ? '• ' : '') + s.ad;
      li.querySelector('.yol').textContent = s.yol;
      const r = { s, li, rozet: li.querySelector('.rozet'), sayi: null, sonSayi: null };   // sayi null: sayılıyor; sonSayi: sıralama için son bilinen
      li.addEventListener('click', () => sec(r));
      ul.append(li);
      return r;
    });
    const satirOf = (li) => satirlar.find((r) => r.li === li);

    const duzenle = () => {
      if (!sayarak) {   // geri uyum: ada/yola göre süz
        const f = girdi.value.toLocaleLowerCase('tr');
        for (const r of satirlar) {
          r.li.hidden = !!f && !r.s.ad.toLocaleLowerCase('tr').includes(f) && !r.s.yol.toLocaleLowerCase('tr').includes(f);
          if (r.li.hidden) r.li.classList.remove('secili');
        }
        return;
      }
      const sorgulu = sorguVar();
      for (const r of satirlar) {
        const sayiliyor = sorgulu && r.sayi == null;
        r.rozet.hidden = !sorgulu;
        r.rozet.textContent = !sorgulu ? '' : sayiliyor ? 'aranıyor…' : `${r.sayi.toLocaleString('tr')} eşleşme`;
        r.rozet.classList.toggle('sayiliyor', sayiliyor);
        r.li.classList.toggle('eslesmeli', sorgulu && r.sayi > 0);
        r.li.classList.toggle('eslesmesiz', sorgulu && r.sayi === 0);
      }
      // Eşleşmeliler üstte, sayılmakta olanlar ortada, eşleşmesizler altta; grup içinde sekme sırası.
      // Yeniden sayılırken son bilinen sayıya göre yerinde kalır (satırlar her tuşta zıplamasın).
      const grup = (r) => { const n = r.sayi ?? r.sonSayi; return !sorgulu || n == null ? 1 : n > 0 ? 0 : 2; };
      const sirali = satirlar.map((r, i) => [grup(r), i, r]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
      sirali.forEach((r, i) => { if (ul.children[i] !== r.li) ul.insertBefore(r.li, ul.children[i] || null); });
    };

    girdi.addEventListener('input', () => {
      if (!sayarak) { duzenle(); return; }
      clearTimeout(this.listeZaman);
      const no = ++this.listeNo;   // eski sorgunun geç gelen sonuçları yok sayılır
      const sorgu = girdi.value;
      if (!sorgu.trim()) { for (const r of satirlar) r.sayi = r.sonSayi = null; duzenle(); return; }
      for (const r of satirlar) r.sayi = null;
      duzenle();
      this.listeZaman = setTimeout(() => {
        const iptal = () => no !== this.listeNo;
        for (const r of satirlar) {
          Promise.resolve().then(() => this.aramaSay(r.s.id, sorgu, { iptal })).then((n) => Math.max(0, +n || 0), () => 0).then((n) => {
            if (iptal()) return;
            r.sayi = r.sonSayi = n;
            duzenle();
          });
        }
      }, 250);
    });
    girdi.addEventListener('keydown', (e) => {
      const ogeler = [...ul.children].filter((li) => !li.hidden);
      let i = ogeler.findIndex((li) => li.classList.contains('secili'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        i = e.key === 'ArrowDown' ? Math.min(ogeler.length - 1, i + 1) : Math.max(0, i - 1);
        for (const r of satirlar) r.li.classList.toggle('secili', r.li === ogeler[i]);
        ogeler[i]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        let hedef = ogeler[i];
        // Sorgu varken seçili yoksa ilk eşleşmeli belge; sayım bitmediyse ya da hiç eşleşme yoksa aktif belge
        if (!hedef && sorguVar()) hedef = ogeler.find((li) => satirOf(li).sayi > 0) || ogeler.find((li) => satirOf(li).s.id === this.aktifId);
        hedef = hedef || ogeler[0];
        if (hedef) sec(satirOf(hedef));
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();   // genel Esc işleyicisi (araç bırakma vb.) ayrıca çalışmasın
        this.belgeListesiKapat();
      }
    });
    kut.hidden = false;
    girdi.focus();
  }

  belgeListesiKapat() { clearTimeout(this.listeZaman); this.listeNo++; this.belgeListesi.hidden = true; this.belgeListesi.innerHTML = ''; }
}
