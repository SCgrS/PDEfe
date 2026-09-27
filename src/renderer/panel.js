// Sol panel: Sayfalar (küçük resimler), İçindekiler (yer imleri), Yorumlar (notlar).
import { yolAnahtari } from './goruntuleyici.js';

const aciyaIndir = (d) => ((d % 360) + 360) % 360;

/** Sayfanın kaynak dosyasına artımlı kayıtla işlenmiş göreli döndürme (uygulama.js belge.diskDondurme). Kaynak görünümün yüklendiği
 *  dosya ya da onun anlık kopyasıysa diskteki /Rotate, PDF.js'in yüklediği tabandan bu kadar farklıdır; başka kaynakta 0. */
function diskDondurmesi(b, s) {
  const d = b.diskDondurme?.[s.kaynak.sayfa];
  if (!d) return 0;
  const g = b.gorunum, k = yolAnahtari(s.kaynak.yol);
  return (g.yol && yolAnahtari(g.yol) === k) || (g.anlik && yolAnahtari(g.anlik) === k) ? d : 0;
}

export class SolPanel extends EventTarget {
  constructor({ panel, tutamac, sayfalar, icindekiler, yorumlar, sekmeler, cekirdek }) {
    super();
    this.panel = panel; this.tutamac = tutamac;
    this.alanlar = { sayfalar, icindekiler, yorumlar };
    this.sekmeler = sekmeler;
    this.cekirdek = cekirdek;
    this.aktifSekme = 'sayfalar';
    this.belge = null;         // aktif sekmenin bilgileri {id, yol, gorunum}
    this.kucukResimler = new Map();   // belgeId → Map(sayfa → dataURL)
    this._gozlemci = null;

    sekmeler.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.sekmeSec(b.dataset.panel)));

    // Genişlik sürükleme
    let baslangicX = 0, baslangicW = 0;
    tutamac.addEventListener('mousedown', (e) => {
      baslangicX = e.clientX; baslangicW = panel.getBoundingClientRect().width;
      const hareket = (e2) => { const w = Math.max(140, Math.min(window.innerWidth * 0.6, baslangicW + e2.clientX - baslangicX)); panel.style.width = w + 'px'; };
      const birak = () => {
        document.removeEventListener('mousemove', hareket); document.removeEventListener('mouseup', birak);
        document.body.style.cursor = '';
        this.dispatchEvent(new CustomEvent('genislik', { detail: { genislik: panel.getBoundingClientRect().width } }));
      };
      document.body.style.cursor = 'ew-resize';
      document.addEventListener('mousemove', hareket); document.addEventListener('mouseup', birak);
      e.preventDefault();
    });
  }

  get acik() { return !this.panel.hidden; }

  acKapa(deger) {
    const yeni = deger ?? this.panel.hidden;
    this.panel.hidden = !yeni;
    if (yeni) this.yenile();
    this.dispatchEvent(new CustomEvent('durum', { detail: { acik: yeni } }));
  }

  genislikAyarla(w) { this.panel.style.width = w + 'px'; }

  sekmeSec(ad) {
    this.aktifSekme = ad;
    this.sekmeler.querySelectorAll('button').forEach((b) => b.classList.toggle('secili', b.dataset.panel === ad));
    for (const [k, el] of Object.entries(this.alanlar)) el.hidden = k !== ad;
    this.yenile();
    this.dispatchEvent(new CustomEvent('sekme', { detail: { sekme: ad } }));
  }

  /** Aktif belge değişti. */
  belgeAyarla(belge) {
    this.belge = belge;
    this._icindekilerHazir = null;
    this._yorumlarHazir = null;
    this._sayfalarHazir = null;
    if (this.acik) this.yenile();
  }

  belgeUnut(belgeId) { this.kucukResimler.delete(belgeId); }

  yenile() {
    if (!this.acik) return;
    if (!this.belge) { for (const el of Object.values(this.alanlar)) el.innerHTML = '<p class="soluk">Açık belge yok.</p>'; return; }
    if (this.aktifSekme === 'sayfalar') this.sayfalariDoldur();
    else if (this.aktifSekme === 'icindekiler') this.icindekileriDoldur();
    else this.yorumlariDoldur();
  }

  // ------------------------------------------------------------ Sayfalar
  sayfalariDoldur() {
    const alan = this.alanlar.sayfalar;
    const b = this.belge;
    if (this._sayfalarHazir === b.id) { this.gecerliSayfaIsaretle(b.gorunum.gecerli); return; }
    this._sayfalarHazir = b.id;
    alan.innerHTML = '';
    if (this._gozlemci) this._gozlemci.disconnect();
    const genislik = Math.max(80, alan.clientWidth - 28);
    const onbellek = this.kucukResimler.get(b.id) || new Map();
    this.kucukResimler.set(b.id, onbellek);
    this._gozlemci = new IntersectionObserver((girdiler) => {
      for (const g of girdiler) {
        if (!g.isIntersecting) continue;
        const el = g.target; const no = +el.dataset.sayfa;
        this._gozlemci.unobserve(el);
        this.kucukResimYukle(b, no, genislik, el, onbellek);
      }
    }, { root: alan, rootMargin: '300px' });

    const n = b.gorunum.sayfaSayisi;
    for (let no = 1; no <= n; no++) {
      const s = b.gorunum.sayfalar[no - 1];
      const el = document.createElement('div');
      el.className = 'kucuk-resim' + (no === b.gorunum.gecerli ? ' gecerli' : '');
      el.dataset.sayfa = String(no);
      // Yer tutucu ekrandaki yönde (taban /Rotate s.pt'de, üstüne göreli ve görünüm döndürmesi) ve her zaman panel genişliğinde;
      // boyutu henüz öğrenilmemiş sayfada resim gelince resmin kendi oranıyla düzeltilir
      const d = aciyaIndir((s.dondurme || 0) + (b.gorunum.gorunumDondurme || 0));
      const oran = d % 180 === 0 ? s.pt.h / s.pt.w : s.pt.w / s.pt.h;
      el.innerHTML = `<div class="bos" style="width:${genislik}px;height:${Math.round(genislik * oran)}px"></div><span class="no">${no}</span>`;
      el.addEventListener('click', () => this.dispatchEvent(new CustomEvent('sayfayaGit', { detail: { sayfa: no } })));
      alan.append(el);
      this._gozlemci.observe(el);
    }
    this.gecerliSayfaIsaretle(b.gorunum.gecerli, true);
  }

  async kucukResimYukle(b, no, genislik, el, onbellek) {
    try {
      const s = b.gorunum.sayfalar[no - 1];
      if (!s) return;
      if (s.bos) { el.querySelector('.bos')?.classList.add('bos-sayfa'); return; }
      // Çekirdek sayfayı diskteki /Rotate ile çizer: kayıtla diske işlenmiş döndürme resimde vardır, anahtar ona göre ayrılır
      const disk = diskDondurmesi(b, s);
      const anahtar = (s.kaynak.yol + '#' + s.kaynak.sayfa).toLowerCase() + '#' + disk;
      let src = onbellek.get(anahtar);
      if (!src) {
        const r = await this.cekirdek('kucuk_resim', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, genislik: genislik * Math.min(2, window.devicePixelRatio || 1) });
        src = 'data:image/png;base64,' + r.png;
        onbellek.set(anahtar, src);
      }
      if (!el.isConnected) return;
      const img = document.createElement('img');
      img.src = src; img.draggable = false;
      await img.decode().catch(() => {});
      if (!el.isConnected || !img.naturalWidth) return;   // panel bu arada yeniden kuruldu ya da resim çözülemedi (yer tutucu kalır)
      // Resmin ekranda ayrıca döndürüleceği açı: ekrandaki yön (göreli + görünüm döndürmesi) eksi diske işlenmiş olan
      const d = aciyaIndir((s.dondurme || 0) + (b.gorunum.gorunumDondurme || 0) - disk);
      const oran = img.naturalHeight / img.naturalWidth;
      if (!d) { img.style.width = genislik + 'px'; el.querySelector('.bos')?.replaceWith(img); return; }
      // Döndürülen resim, ekrandaki (döndürülmüş) boyutta ve panel genişliğindeki kutunun ortasında döner; 90/270'te resmin
      // yüksekliği ekranda genişlik, genişliği yükseklik olur
      const yan = d % 180 !== 0;
      const sarmal = document.createElement('div');
      sarmal.className = 'donuk';
      sarmal.style.width = genislik + 'px';
      sarmal.style.height = Math.round(yan ? genislik / oran : genislik * oran) + 'px';
      if (yan) { img.style.height = genislik + 'px'; img.style.width = Math.round(genislik / oran) + 'px'; } else img.style.width = genislik + 'px';
      img.style.transform = `rotate(${d}deg)`;
      sarmal.append(img);
      el.querySelector('.bos')?.replaceWith(sarmal);
    } catch (e) { console.warn('Küçük resim alınamadı', no, e.message); }
  }

  gecerliSayfaIsaretle(no, kaydir = false) {
    if (this.aktifSekme !== 'sayfalar' || !this.acik) return;
    const alan = this.alanlar.sayfalar;
    alan.querySelectorAll('.kucuk-resim.gecerli').forEach((el) => el.classList.remove('gecerli'));
    const el = alan.querySelector(`.kucuk-resim[data-sayfa="${no}"]`);
    if (el) { el.classList.add('gecerli'); el.scrollIntoView({ block: kaydir ? 'center' : 'nearest' }); }
  }

  // ------------------------------------------------------------ İçindekiler
  async icindekileriDoldur() {
    const alan = this.alanlar.icindekiler;
    const b = this.belge;
    if (this._icindekilerHazir === b.id) return;
    this._icindekilerHazir = b.id;
    alan.innerHTML = '<p class="soluk">Yükleniyor…</p>';
    let agac;
    try { agac = await b.gorunum.belge.getOutline(); } catch { agac = null; }
    if (this.belge !== b) return;
    alan.innerHTML = '';
    if (!agac || !agac.length) { alan.innerHTML = '<p class="soluk">Bu belgede içindekiler (yer imi) yok.</p>'; return; }
    alan.append(this.yerimiListesi(agac, b, 0));
  }

  yerimiListesi(ogeler, b, seviye) {
    const ul = document.createElement('ul');
    ul.className = 'yerimi';
    for (const o of ogeler) {
      const li = document.createElement('li');
      const cocukVar = o.items && o.items.length;
      if (cocukVar && seviye >= 1) li.classList.add('kapali');
      const satir = document.createElement('div');
      satir.className = 'satir';
      satir.innerHTML = `<span class="ok ${cocukVar ? '' : 'bos'}">▶</span><span class="baslik"></span>`;
      satir.querySelector('.baslik').textContent = o.title || '(başlıksız)';
      satir.title = o.title || '';
      satir.querySelector('.ok').addEventListener('click', (e) => { e.stopPropagation(); li.classList.toggle('kapali'); });
      satir.addEventListener('click', () => this.yerimineGit(o, b));
      li.append(satir);
      if (cocukVar) li.append(this.yerimiListesi(o.items, b, seviye + 1));
      ul.append(li);
    }
    ul.querySelectorAll('li').forEach((li) => { const ok = li.querySelector(':scope > .satir > .ok'); if (ok && !ok.classList.contains('bos')) ok.textContent = li.classList.contains('kapali') ? '▶' : '▼'; });
    ul.addEventListener('click', () => ul.querySelectorAll('li').forEach((li) => { const ok = li.querySelector(':scope > .satir > .ok'); if (ok && !ok.classList.contains('bos')) ok.textContent = li.classList.contains('kapali') ? '▶' : '▼'; }));
    return ul;
  }

  async yerimineGit(o, b) {
    try {
      let dest = o.dest;
      if (typeof dest === 'string') dest = await b.gorunum.belge.getDestination(dest);
      if (!dest || !dest[0]) return;
      const idx = typeof dest[0] === 'object' ? await b.gorunum.belge.getPageIndex(dest[0]) : dest[0];
      const s = b.gorunum.sayfalar[idx];
      let y = null;
      if (dest[1]?.name === 'XYZ' && typeof dest[3] === 'number') y = s.pt.h - dest[3];
      else if (dest[1]?.name === 'FitH' && typeof dest[2] === 'number') y = s.pt.h - dest[2];
      this.dispatchEvent(new CustomEvent('sayfayaGit', { detail: { sayfa: idx + 1, y: y != null && y >= 0 ? y : undefined } }));
    } catch (e) { console.warn('Yer imi çözülemedi', e); }
  }

  // ------------------------------------------------------------ Yorumlar
  yorumlariYenile() { this._yorumlarHazir = null; if (this.acik && this.aktifSekme === 'yorumlar') this.yorumlariDoldur(); }

  async yorumlariDoldur() {
    const alan = this.alanlar.yorumlar;
    const b = this.belge;
    if (this._yorumlarHazir === b.id) return;
    this._yorumlarHazir = b.id;
    let notlar = [];
    if (b.notlar && b.notlar.yuklendi) {
      notlar = b.notlar.liste().map((n) => ({ ...n, yanitlar: b.notlar.yanitlari(n) }));
    } else {
      alan.innerHTML = '<p class="soluk">Yükleniyor…</p>';
      try { notlar = (await this.cekirdek('notlar', { yol: b.yol })).notlar.filter((n) => !n.yanitXref); } catch (e) { alan.innerHTML = '<p class="soluk">Notlar okunamadı.</p>'; return; }
      if (this.belge !== b) return;
    }
    alan.innerHTML = '';
    if (!notlar.length) { alan.innerHTML = '<p class="soluk">Bu belgede yorum yok.</p>'; return; }
    for (const n of notlar) {
      const el = document.createElement('div');
      el.className = 'yorum';
      el.dataset.id = n.id || '';
      el.innerHTML = '<div class="ust"><span class="renk"></span><span class="tur"></span><span class="yazar"></span><span class="esnek"></span><span class="sayfa-no"></span></div><div class="icerik"></div><div class="yanit-sayisi"></div>';
      el.querySelector('.renk').style.background = n.renk || (n.tur === 'FreeText' ? (n.yazi?.renk || '#999') : '#ffd100');
      el.querySelector('.tur').textContent = notTurAdi(n);
      el.querySelector('.yazar').textContent = n.yazar || '';
      el.querySelector('.sayfa-no').textContent = 's. ' + n.sayfa + (n.degisim ? ' · ' + tarihBicimle(n.degisim) : '');
      el.querySelector('.icerik').textContent = n.icerik || '';
      if (!n.icerik) el.querySelector('.icerik').remove();
      const ys = (n.yanitlar || []).length;
      if (ys) el.querySelector('.yanit-sayisi').textContent = ys + ' yanıt'; else el.querySelector('.yanit-sayisi').remove();
      el.addEventListener('click', () => this.dispatchEvent(new CustomEvent('notaGit', { detail: { not: n } })));
      alan.append(el);
    }
  }
}

export function turAdi(tur) {
  return {
    Text: 'Not', Highlight: 'Vurgu', Underline: 'Altı çizili', StrikeOut: 'Üstü çizili', Squiggly: 'Dalgalı',
    FreeText: 'Yazı', Ink: 'Çizim', Square: 'Kare', Circle: 'Daire', Line: 'Çizgi', Polygon: 'Çokgen', PolyLine: 'Çoklu çizgi',
    Stamp: 'Damga', FileAttachment: 'Dosya eki', Caret: 'Düzeltme', Link: 'Bağlantı', Widget: 'Form alanı', Popup: 'Balon',
  }[tur] || tur;
}

/**
 * Notun gösterilen tür adı: not taşıyan vurgu (referans okuyucunun "Metinle ilgili yorum yap"ı, /IT /HighlightNote; ya da metni olan vurgu)
 * "Metin notu"dur, notsuz vurgu "Vurgu" kalır.
 */
export function notTurAdi(n) {
  if (n?.tur === 'Highlight' && (n.it === 'HighlightNote' || String(n.icerik || '').trim())) return 'Metin notu';
  return turAdi(n?.tur);
}

/** Not balonunun başlığındaki tür: metin notunda yalnızca "Not" (0.1.12, kullanıcı isteği; Yorumlar panelinde "Metin notu" kalır).
 *  0.1.14'e dek "Not:" idi; tür, yazar ve tarih artık ince dikey çizgilerle ayrılır (notlar.js balonYenile). */
export function balonTurAdi(n) {
  const ad = notTurAdi(n);
  return ad === 'Metin notu' ? 'Not' : ad;
}

/** PDF tarih dizesini (D:20260915225519+03'00') okunur biçime çevirir. */
export function tarihBicimle(d) {
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/.exec(d || '');
  if (!m) return d || '';
  return `${m[3]}.${m[2]}.${m[1]}` + (m[4] ? ` ${m[4]}:${m[5] || '00'}` : '');
}
