// Araç pencereleri için ortak parçalar: pencere iskeleti, ilerleme çubuğu, boyut biçimleme,
// yol yardımcıları, sürükleyerek sıralama, çıktı satırı (ad + klasör çipi), standart kaydetme seçimi
// ("Yeni belge olarak kaydet" | "Üzerine yaz"), üzerine yazılan sekmeyi yenileme.
// Bütün araçlar (kucult, sayfalar, ayir, gorselBirlestir, dondur) bu modülü kullanır.

// ---------------------------------------------------------------- metin ve biçim
const TR_SAYI_2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TR_SAYI_1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TR_SAYI_0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

/** Bayt sayısını Türkçe biçimde yazar: "512 B", "356 KB", "1,25 MB", "1,20 GB". */
export function boyutMetni(bayt) {
  if (bayt == null || Number.isNaN(+bayt)) return '—';
  bayt = Math.max(0, +bayt);
  if (bayt < 1024) return TR_SAYI_0.format(bayt) + ' B';
  if (bayt < 1024 * 1024) return TR_SAYI_0.format(bayt / 1024) + ' KB';
  if (bayt < 1024 * 1024 * 1024) return TR_SAYI_2.format(bayt / (1024 * 1024)) + ' MB';
  return TR_SAYI_2.format(bayt / (1024 * 1024 * 1024)) + ' GB';
}

/** Yüzde farkı: eski→yeni. Örn. "%67 daha küçük" / "%12 daha büyük" / "aynı boyutta". */
export function farkMetni(eski, yeni) {
  if (!eski || yeni == null) return '';
  const oran = (eski - yeni) / eski * 100;
  if (Math.abs(oran) < 0.5) return 'aynı boyutta';
  const yuzde = Math.abs(oran) >= 10 ? TR_SAYI_0.format(Math.abs(oran)) : TR_SAYI_1.format(Math.abs(oran));
  return oran > 0 ? `%${yuzde} daha küçük` : `%${yuzde} daha büyük`;
}

export function sayiMetni(n) { return TR_SAYI_0.format(n); }

export function kacis(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function hataMetni(e) {
  if (!e) return 'Bilinmeyen hata';
  const m = e.message || String(e);
  // Çekirdekten gelen Python hatalarında yalnızca son satır anlamlıdır; IPC'nin eklediği önek kullanıcıya gösterilmez
  return (m.split('\n').filter(Boolean).pop() || 'Bilinmeyen hata').replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
}

/** Dosya başka bir programda (örn. bir PDF okuyucu) açık olduğu için okunamadı ya da yazılamadı mı? (çekirdek: KILITLI_METNI) */
export function kilitliHataMi(e) {
  return /başka bir programda açık|EBUSY|EPERM|EACCES|being used by another process/i.test((e && (e.message || String(e))) || '');
}

// ---------------------------------------------------------------- yol yardımcıları
export function dosyaAdi(yol) { return String(yol || '').split(/[\\/]/).pop(); }
export function klasorAdi(yol) {
  const s = String(yol || '');
  const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
  return i >= 0 ? s.slice(0, i) : '';
}
export function uzanti(yol) { const m = /\.([^.\\/]+)$/.exec(String(yol || '')); return m ? m[1].toLowerCase() : ''; }
export function adGovdesi(yol) { const ad = dosyaAdi(yol); const i = ad.lastIndexOf('.'); return i > 0 ? ad.slice(0, i) : ad; }
export function yolBirlestir(klasor, ad) {
  if (!klasor) return ad;
  const ayirici = klasor.includes('/') && !klasor.includes('\\') ? '/' : '\\';
  return klasor.replace(/[\\/]+$/, '') + ayirici + ad;
}
export function yolAyni(a, b) {
  return String(a || '').replace(/\//g, '\\').toLowerCase() === String(b || '').replace(/\//g, '\\').toLowerCase();
}
/** Dosya adında kullanılamayan karakterleri temizler (çekirdekteki _guvenli_ad ile aynı kural). */
export function guvenliAd(ad) {
  // eslint-disable-next-line no-control-regex
  return String(ad || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/\.+$/, '') || 'belge';
}

/**
 * Klasörde var olmayan bir ad üretir: "ad.pdf" varsa "ad (2).pdf", "ad (3).pdf" …
 * @param {object} pdefe IPC köprüsü
 */
export async function bosAdBul(pdefe, klasor, ad) {
  const govde = adGovdesi(ad);
  const uz = uzanti(ad);
  let aday = ad;
  for (let i = 2; i < 1000; i++) {
    const var_ = await pdefe.cagir('dosya:varMi', yolBirlestir(klasor, aday));
    if (!var_) return aday;
    aday = `${govde} (${i})${uz ? '.' + uz : ''}`;
  }
  return `${govde}_${Date.now()}${uz ? '.' + uz : ''}`;
}

export async function dosyaBoyutu(pdefe, yol) {
  try { const b = await pdefe.cagir('dosya:bilgi', yol); return b?.var ? b.boyut : null; } catch { return null; }
}

/** Zaman damgası: 20260916-143005 */
export function zamanDamgasi(t = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`;
}

// ---------------------------------------------------------------- sayfa aralığı çözümleme
/**
 * "1-3, 5, 8-10" biçimindeki metni sayfa numarası listesine çevirir (1 tabanlı, sıralı, tekrarsız).
 * Dönüş: {sayfalar: number[], hata: string|null}
 */
export function sayfaListesiCoz(metin, toplam) {
  const sonuc = new Set();
  const parcalar = String(metin || '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!parcalar.length) return { sayfalar: [], hata: 'Sayfa numarası girin.' };
  for (const p of parcalar) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(p);
    if (!m) return { sayfalar: [], hata: `"${p}" anlaşılamadı. Örnek: 1-3, 5, 8-10` };
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (a < 1 || b < 1) return { sayfalar: [], hata: 'Sayfa numaraları 1\'den başlar.' };
    if (a > toplam || b > toplam) return { sayfalar: [], hata: `Belgede ${toplam} sayfa var; "${p}" bu sınırı aşıyor.` };
    const [bas, son] = a <= b ? [a, b] : [b, a];
    for (let i = bas; i <= son; i++) sonuc.add(i);
  }
  return { sayfalar: [...sonuc].sort((x, y) => x - y), hata: null };
}

/**
 * "1-3, 4-10, 12" → her parça ayrı bir aralık: [{bas, son, sayfalar:[...]}, ...]. Sıra korunur.
 * Çekirdekteki araliklari_ayristir ile aynı kurallar: "-3" = 1-3, "5-" = 5-son, ters aralık düzeltilir.
 */
export function sayfaAraliklariCoz(metin, toplam) {
  const araliklar = [];
  const parcalar = String(metin || '').split(/[,;]+/).map((s) => s.replace(/\s+/g, '')).filter(Boolean);
  if (!parcalar.length) return { araliklar: [], hata: 'Sayfa aralığı girin. Örnek: 1-3, 4-10' };
  for (const p of parcalar) {
    let a, b;
    const m = /^(\d*)[-–—](\d*)$/.exec(p);
    if (m) {
      if (!m[1] && !m[2]) return { araliklar: [], hata: `"${p}" anlaşılamadı. Örnek: 1-3, 4-10` };
      a = m[1] ? parseInt(m[1], 10) : 1;
      b = m[2] ? parseInt(m[2], 10) : toplam;
    } else if (/^\d+$/.test(p)) {
      a = b = parseInt(p, 10);
    } else return { araliklar: [], hata: `"${p}" anlaşılamadı. Örnek: 1-3, 4-10` };
    if (a > b) [a, b] = [b, a];
    if (a < 1) return { araliklar: [], hata: 'Sayfa numaraları 1\'den başlar.' };
    if (b > toplam) return { araliklar: [], hata: `Belgede ${toplam} sayfa var; "${p}" bu sınırı aşıyor.` };
    const sayfalar = [];
    for (let i = a; i <= b; i++) sayfalar.push(i);
    araliklar.push({ bas: a, son: b, sayfalar });
  }
  return { araliklar, hata: null };
}

// ---------------------------------------------------------------- pencere iskeleti
const acikPencereler = new Map();   // anahtar → Pencere

/**
 * Araç penceresi açar. Var olan diyalog görünümünü (.diyalog-ortusu/.diyalog) taklit eden daha geniş bir
 * iskelet: başlık + kapat (X) düğmesi, gövde, alt şerit. Kapatma yalnızca X ve Esc ile (Kapat/Vazgeç düğmesi yok);
 * birincil düğme alt şeridin ortasındadır. Metinler fareyle seçilip kopyalanabilir (sağ tık: Kopyala).
 * Klavye odağı pencere içinde kalır.
 *
 * @param {object} s
 * @param {string} s.baslik
 * @param {string|HTMLElement} [s.govde] HTML metni ya da öğe
 * @param {Array<{id:string, etiket:string, birincil?:boolean, devre?:boolean, sol?:boolean, tiklama?:(p:Pencere)=>void}>} [s.dugmeler]
 *   birincil: ortada; sol: sol köşede (ipucu vb.); diğerleri sağ köşede
 * @param {number} [s.genislik] px
 * @param {string} [s.anahtar] aynı anahtarla ikinci pencere açılmaz; var olan öne gelir
 * @param {string} [s.sinif] ek CSS sınıfı
 * @param {(p:Pencere)=>boolean|Promise<boolean>} [s.kapatmadanOnce] false dönerse kapatma iptal edilir
 * @returns {Pencere}
 */
export function pencereAc({ baslik, govde, dugmeler = [], genislik, anahtar, sinif, kapatmadanOnce }) {
  if (anahtar && acikPencereler.has(anahtar)) {
    const p = acikPencereler.get(anahtar);
    p.odakla();
    return p;
  }
  const pencere = new Pencere({ baslik, govde, dugmeler, genislik, anahtar, sinif, kapatmadanOnce });
  if (anahtar) acikPencereler.set(anahtar, pencere);
  return pencere;
}

/** Aynı anahtarlı pencere açıksa onu öne getirir ve true döner (araç yeniden kurulmaz). */
export function pencereAcikMi(anahtar) {
  const p = acikPencereler.get(anahtar);
  if (!p) return false;
  p.odakla();
  return true;
}

export class Pencere {
  constructor({ baslik, govde, dugmeler, genislik, anahtar, sinif, kapatmadanOnce }) {
    this.anahtar = anahtar;
    this.kapatmadanOnce = kapatmadanOnce;
    this.kapali = false;
    this._sonucCoz = null;
    this.sonuc = new Promise((coz) => { this._sonucCoz = coz; });
    this.onceOdak = document.activeElement;

    const ortu = document.createElement('div');
    ortu.className = 'arac-ortusu';
    ortu.innerHTML = `
      <div class="arac-pencere ${sinif || ''}" role="dialog" aria-modal="true" tabindex="-1" ${genislik ? `style="width:${genislik}px"` : ''}>
        <div class="arac-baslik"><span class="arac-baslik-metin"></span><button class="ikon arac-kapat" title="Kapat (Esc)" aria-label="Kapat"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.6"/></svg></button></div>
        <div class="arac-govde"></div>
        <div class="arac-dugmeler"><div class="arac-dugmeler-sol"></div><div class="arac-dugmeler-orta"></div><div class="arac-dugmeler-sag"></div></div>
      </div>`;
    this.ortu = ortu;
    this.el = ortu.querySelector('.arac-pencere');
    this.baslikEl = ortu.querySelector('.arac-baslik-metin');
    this.govde = ortu.querySelector('.arac-govde');
    this.dugmeAlani = ortu.querySelector('.arac-dugmeler');
    this.baslikEl.textContent = baslik;
    if (govde instanceof HTMLElement) this.govde.append(govde);
    else if (govde) this.govde.innerHTML = govde;
    this.dugmeler = new Map();
    for (const d of dugmeler) this.dugmeEkle(d);

    ortu.querySelector('.arac-kapat').addEventListener('click', () => this.kapat(null));
    // Örtüye tıklamak kapatmaz (yanlışlıkla veri kaybı olmasın); yalnızca odağı geri alır
    ortu.addEventListener('mousedown', (e) => { if (e.target === ortu) { e.preventDefault(); this.odakla(); } });
    this.el.addEventListener('keydown', (e) => this._tusIsle(e));
    // Uygulama düzeyindeki kısayollar (Ctrl+Z, Delete, ok tuşları…) pencere açıkken çalışmasın
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
    this.el.addEventListener('keyup', (e) => e.stopPropagation());
    // Sürükle-bırak uygulamanın "PDF'i bırakın" örtüsünü tetiklemesin (araçlar kendi ele alır)
    for (const t of ['dragenter', 'dragover', 'dragleave', 'drop']) {
      ortu.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'dragover' || t === 'drop') e.preventDefault(); if (t === 'drop') this.el.dispatchEvent(new CustomEvent('dosyaBirakildi', { detail: e })); });
    }
    // Sağ tık: seçili metin varsa Kopyala; araç baglamMenusuEkle ile kendi öğelerini ekler (örn. Yapıştır)
    this.menuSaglayicilar = [];
    this.el.addEventListener('contextmenu', (e) => this._baglamMenusu(e));
    document.body.append(ortu);
    this.odakla();
  }

  /**
   * Sağ tık menüsüne öğe sağlayıcı ekler: f(e) → [{id, etiket, devre?, ayirici?, calistir?}] | null.
   * Sağlayıcıların öğeleri sırayla, aralarına ayırıcı konarak gösterilir.
   */
  baglamMenusuEkle(f) { this.menuSaglayicilar.push(f); }

  /** Pencere içinde seçili metin (girdi kutuları hariç). */
  seciliMetin() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.anchorNode || !this.el.contains(s.anchorNode)) return '';
    return s.toString();
  }

  async _baglamMenusu(e) {
    if (e.target.closest('input, textarea, select')) return;   // girdilerin kendi davranışı
    const gruplar = [];
    if (this.seciliMetin().trim()) gruplar.push([{ id: 'kopyala', etiket: 'Kopyala', calistir: () => document.execCommand('copy') }]);
    for (const f of this.menuSaglayicilar) { try { const o = f(e); if (o?.length) gruplar.push(o); } catch (h) { console.warn('[araçlar] menü', h); } }
    if (!gruplar.length) return;
    e.preventDefault();
    const ogeler = gruplar.flatMap((g, i) => (i ? [{ ayirici: true }, ...g] : g));
    const sade = ogeler.map(({ calistir, ...o }) => o);
    // Test kancası (uygulama.js __pdefeOtoYanit gibi): yerel menü açılmadan verilen öğe seçilmiş sayılır
    const kanca = window.__pdefeMenuYaniti;
    const secilen = kanca ? (kanca.son = sade, kanca.secim) : await window.pdefe.cagir('menu:popup', sade);
    const oge = ogeler.find((o) => o.id && o.id === secilen);
    if (oge?.calistir && !this.kapali) oge.calistir();
  }

  /** Düğme ekler: {id, etiket, birincil, devre, sol, tiklama} */
  dugmeEkle({ id, etiket, birincil, devre, sol, tiklama, baslik }) {
    const btn = document.createElement('button');
    btn.className = birincil ? 'birincil' : 'ikincil';
    btn.textContent = etiket;
    btn.dataset.id = id;
    if (baslik) btn.title = baslik;
    btn.disabled = !!devre;
    btn.addEventListener('click', () => { if (tiklama) tiklama(this); else this.kapat(id); });
    this.dugmeAlani.querySelector(birincil ? '.arac-dugmeler-orta' : sol ? '.arac-dugmeler-sol' : '.arac-dugmeler-sag').append(btn);
    this.dugmeler.set(id, btn);
    return btn;
  }

  /** Alt şeridin sol köşesine küçük açıklama metni (örn. kısayollar) koyar. */
  altMetinAyarla(metin) {
    const sol = this.dugmeAlani.querySelector('.arac-dugmeler-sol');
    let s = sol.querySelector('.arac-alt-metin');
    if (!s) { s = document.createElement('span'); s.className = 'arac-alt-metin'; sol.append(s); }
    s.textContent = metin || '';
  }

  dugme(id) { return this.dugmeler.get(id); }
  dugmeAyarla(id, { devre, etiket, gizli } = {}) {
    const b = this.dugmeler.get(id);
    if (!b) return;
    if (devre != null) b.disabled = !!devre;
    if (etiket != null) b.textContent = etiket;
    if (gizli != null) b.hidden = !!gizli;
  }
  baslikAyarla(metin) { this.baslikEl.textContent = metin; }

  /** Odağı pencereye alır: ilk girdi/birincil düğme, yoksa pencere kendisi. */
  odakla() {
    const hedef = this.el.querySelector('[data-ilk-odak]') || this.el.querySelector('.arac-dugmeler .birincil:not(:disabled)') || this.el;
    hedef.focus({ preventScroll: true });
  }

  _odaklanabilirler() {
    return [...this.el.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]):not(:disabled)')]
      .filter((e) => !e.hidden && e.offsetParent !== null && e.tabIndex >= 0);   // bölümlü seçimde yalnızca seçili düğme sekmeyle gezilir
  }

  _tusIsle(e) {
    // Ctrl+A girdi dışında pencerenin metnini seçer (arkadaki belgenin bütün metnini değil); araç kendi Ctrl+A'sını işlediyse dokunma
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'a' || e.key === 'A') && !e.defaultPrevented && !e.target.closest('input, textarea, select')) {
      e.preventDefault();
      const s = window.getSelection(); const r = document.createRange();
      r.selectNodeContents(this.govde); s.removeAllRanges(); s.addRange(r);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      // Araç, 'esc' olayında preventDefault() çağırırsa (örn. işlem sürüyor → iptal) pencere kapanmaz
      const ev = new CustomEvent('esc', { cancelable: true });
      this.el.dispatchEvent(ev);
      if (!ev.defaultPrevented) this.kapat(null);
      return;
    }
    if (e.key === 'Tab') {
      const liste = this._odaklanabilirler();
      if (!liste.length) { e.preventDefault(); return; }
      const i = liste.indexOf(document.activeElement);
      let sonraki;
      if (e.shiftKey) sonraki = i <= 0 ? liste[liste.length - 1] : liste[i - 1];
      else sonraki = i < 0 || i >= liste.length - 1 ? liste[0] : liste[i + 1];
      e.preventDefault();
      sonraki.focus();
    }
  }

  /** Pencereyi kapatır; kapatmadanOnce false dönerse kapanmaz. */
  async kapat(sonuc = null) {
    if (this.kapali) return false;
    if (this.kapatmadanOnce) {
      let izin;
      try { izin = await this.kapatmadanOnce(this, sonuc); } catch { izin = true; }
      if (izin === false) return false;
    }
    this.kapali = true;
    if (this.anahtar && acikPencereler.get(this.anahtar) === this) acikPencereler.delete(this.anahtar);
    this.el.dispatchEvent(new CustomEvent('kapandi'));
    this.ortu.remove();
    this._sonucCoz(sonuc);
    try { if (this.onceOdak && document.contains(this.onceOdak)) this.onceOdak.focus({ preventScroll: true }); } catch { /* yok say */ }
    return true;
  }

  /** Pencere içinde hata şeridi gösterir (boş metin gizler). */
  hataGoster(metin) {
    let s = this.govde.querySelector(':scope > .arac-hata');
    if (!metin) { s?.remove(); return; }
    if (!s) { s = document.createElement('div'); s.className = 'arac-hata'; this.govde.prepend(s); }
    s.textContent = metin;
  }
}

// ---------------------------------------------------------------- İşlemİlerleme
/**
 * İlerleme çubuğu + mesaj + İptal düğmesi. Pencerenin gövdesine ya da düğme alanına eklenir.
 * ilerleme.calistir(baglam, yontem, params) çekirdek çağrısını sarar; iptal isteğini yönetir.
 */
export class IslemIlerleme {
  constructor({ iptalEdilebilir = true } = {}) {
    this.el = document.createElement('div');
    this.el.className = 'arac-ilerleme';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="arac-ilerleme-ust"><span class="arac-ilerleme-mesaj"></span><span class="arac-ilerleme-yuzde"></span></div>
      <div class="arac-ilerleme-cubuk"><div class="arac-ilerleme-dolgu"></div></div>
      <div class="arac-ilerleme-alt"><button class="ikincil arac-ilerleme-iptal" ${iptalEdilebilir ? '' : 'hidden'}>İptal</button></div>`;
    this.mesajEl = this.el.querySelector('.arac-ilerleme-mesaj');
    this.yuzdeEl = this.el.querySelector('.arac-ilerleme-yuzde');
    this.dolgu = this.el.querySelector('.arac-ilerleme-dolgu');
    this.iptalDugmesi = this.el.querySelector('.arac-ilerleme-iptal');
    this.calisiyor = false;
    this.iptalIstendi = false;
    this._iptalCb = null;
    this.iptalDugmesi.addEventListener('click', () => this.iptalIste());
  }

  goster(mesaj = 'Hazırlanıyor…') { this.el.hidden = false; this.ayarla(0, mesaj); this.iptalIstendi = false; this.iptalDugmesi.disabled = false; this.iptalDugmesi.textContent = 'İptal'; }
  gizle() { this.el.hidden = true; }

  ayarla(yuzde, mesaj) {
    if (this.iptalIstendi) return;
    const belirsiz = yuzde == null || Number.isNaN(+yuzde);
    this.el.classList.toggle('belirsiz', belirsiz);
    if (!belirsiz) {
      const y = Math.max(0, Math.min(100, +yuzde));
      this.dolgu.style.width = y + '%';
      this.yuzdeEl.textContent = '%' + Math.round(y);
    } else { this.dolgu.style.width = '100%'; this.yuzdeEl.textContent = ''; }
    if (mesaj != null) this.mesajEl.textContent = mesaj;
  }

  iptalIste() {
    if (!this.calisiyor || this.iptalIstendi) return;
    this.iptalIstendi = true;
    this.iptalDugmesi.disabled = true;   // düğme etiketi değişmez; durum iletide
    this.mesajEl.textContent = 'İptal ediliyor… (süren adım bitince durur)';
    this.el.classList.add('iptal');
    try { this._iptalCb?.(); } catch { /* yok say */ }
  }

  /**
   * Çekirdek çağrısını ilerlemeyle çalıştırır.
   * İptal edilirse Error('iptal') fırlatır (e.iptal = true); iş yine de bitmiş olabilir — e.sonuc'ta gelir.
   */
  async calistir(baglam, yontem, params, { baslangicMesaji } = {}) {
    if (this.calisiyor) throw new Error('Zaten bir işlem sürüyor.');
    this.calisiyor = true;
    this.goster(baslangicMesaji || 'Başlıyor…');
    let istekIptal = false;
    let soz = null;
    this._iptalCb = () => {
      istekIptal = true;
      // Çekirdeğe iptal isteği: çağrının kendi iptal'i (uygulama.js cekirdek() sözüne ekler; istek kimliğini bilir), yoksa
      // baglam.iptal(istekId). Kimliksiz baglam.iptal() hiçbir işi bulamadığından iptal önceden hiç ulaşmıyordu.
      try {
        if (typeof soz?.iptal === 'function') soz.iptal();
        else if (typeof baglam.iptal === 'function') baglam.iptal(soz?.istekId);
      } catch { /* yok say */ }
    };
    try {
      soz = baglam.cekirdek(yontem, params, (p) => this.ayarla(p?.yuzde, p?.mesaj));
      const sonuc = await soz;
      if (istekIptal) { const e = new Error('İşlem iptal edildi.'); e.iptal = true; e.sonuc = sonuc; throw e; }
      this.ayarla(100, 'Tamamlandı');
      return sonuc;
    } catch (e) {
      if (istekIptal && !e.iptal) { const h = new Error('İşlem iptal edildi.'); h.iptal = true; throw h; }
      throw e;
    } finally {
      this.calisiyor = false;
      this._iptalCb = null;
      this.el.classList.remove('iptal');
    }
  }
}

/** Kısa yol: yalnızca çubuk öğesi isteyenler için. */
export function ilerlemeCubugu(secenek) { return new IslemIlerleme(secenek); }

// ---------------------------------------------------------------- sürükleyerek sıralama
/**
 * Bir kapsayıcı içindeki öğeleri fareyle (pointer olayları) sürükleyip sıralamayı sağlar.
 * @param {HTMLElement} kap  öğelerin doğrudan üst öğesi
 * @param {object} s
 * @param {string} s.ogeSecici  sürüklenebilir öğe seçicisi (örn. '.sayfa-karti')
 * @param {string} [s.tutamacSecici] yalnızca bu alandan sürüklenebilsin (verilmezse öğenin tamamı; düğmeler hariç)
 * @param {(el:HTMLElement)=>HTMLElement[]} [s.grupAl] sürüklenen öğeyle birlikte taşınacak öğeler (çoklu seçim)
 * @param {(tasinan:HTMLElement[], hedefIdx:number)=>void} s.onBirak  hedefIdx: taşınanlar çıkarıldıktan sonraki ekleme konumu
 * @param {boolean} [s.izgara] true: iki boyutlu ızgara (kartlar), false: dikey liste
 * @param {string} [s.metinSecici] bu öğelerden başlayan sürükleme sıralama değil metin seçimidir (ad, boyut gibi kopyalanabilir metinler)
 * @returns {() => void} bağı kaldırma işlevi
 */
export function suruklemeSiralama(kap, { ogeSecici, tutamacSecici, grupAl, onBirak, izgara = false, metinSecici }) {
  let basla = null;         // {x, y, el}
  let surukleme = null;     // {ogeler, hayalet, isaret}
  const ESIK = 6;

  const ogeler = () => [...kap.querySelectorAll(':scope > ' + ogeSecici)];

  function hedefBul(x, y) {
    const liste = ogeler().filter((o) => !surukleme.ogeler.includes(o));
    if (!liste.length) return { idx: 0, el: null, once: true };
    // Dikey listede: y'ye göre; ızgarada: aynı satırdaki en yakın kart, satır yoksa en alta
    let enIyi = null;
    for (let i = 0; i < liste.length; i++) {
      const r = liste[i].getBoundingClientRect();
      let uzaklik, once;
      if (izgara) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        uzaklik = Math.hypot(cx - x, (cy - y) * 1.6);
        once = x < cx;
      } else {
        const cy = r.top + r.height / 2;
        uzaklik = Math.abs(cy - y);
        once = y < cy;
      }
      if (!enIyi || uzaklik < enIyi.uzaklik) enIyi = { uzaklik, i, once, el: liste[i] };
    }
    return { idx: enIyi.once ? enIyi.i : enIyi.i + 1, el: enIyi.el, once: enIyi.once };
  }

  function isaretGuncelle(h) {
    const isaret = surukleme.isaret;
    if (!h.el) { isaret.hidden = true; return; }
    const r = h.el.getBoundingClientRect();
    const kr = kap.getBoundingClientRect();
    isaret.hidden = false;
    if (izgara) {
      isaret.style.top = (r.top - kr.top + kap.scrollTop) + 'px';
      isaret.style.height = r.height + 'px';
      isaret.style.width = '3px';
      isaret.style.left = ((h.once ? r.left - 5 : r.right + 2) - kr.left + kap.scrollLeft) + 'px';
    } else {
      isaret.style.left = (r.left - kr.left + kap.scrollLeft) + 'px';
      isaret.style.width = r.width + 'px';
      isaret.style.height = '3px';
      isaret.style.top = ((h.once ? r.top - 3 : r.bottom + 1) - kr.top + kap.scrollTop) + 'px';
    }
  }

  function pointerDown(e) {
    if (e.button !== 0) return;
    const el = e.target.closest(ogeSecici);
    if (!el || el.parentElement !== kap) return;
    if (e.target.closest('button, input, select, textarea, a')) return;
    if (metinSecici && e.target.closest(metinSecici)) return;
    if (tutamacSecici && !e.target.closest(tutamacSecici)) return;
    basla = { x: e.clientX, y: e.clientY, el, pointerId: e.pointerId };
  }

  function pointerMove(e) {
    if (!basla) return;
    if (!surukleme) {
      if (Math.hypot(e.clientX - basla.x, e.clientY - basla.y) < ESIK) return;
      const grup = grupAl ? grupAl(basla.el) : [basla.el];
      const liste = grup.length && grup.includes(basla.el) ? grup : [basla.el];
      const hayalet = document.createElement('div');
      hayalet.className = 'arac-surukle-hayalet';
      hayalet.textContent = liste.length > 1 ? `${liste.length} öğe` : (basla.el.dataset.surukleEtiket || '1 öğe');
      const isaret = document.createElement('div');
      isaret.className = 'arac-surukle-isaret';
      isaret.hidden = true;
      if (getComputedStyle(kap).position === 'static') kap.style.position = 'relative';
      kap.append(isaret);
      document.body.append(hayalet);
      for (const o of liste) o.classList.add('surukleniyor');
      kap.classList.add('surukleme-aktif');
      try { window.getSelection()?.removeAllRanges(); } catch { /* yok say */ }
      try { kap.setPointerCapture(basla.pointerId); } catch { /* yok say */ }
      surukleme = { ogeler: liste, hayalet, isaret, hedef: null };
    }
    surukleme.hayalet.style.left = (e.clientX + 12) + 'px';
    surukleme.hayalet.style.top = (e.clientY + 12) + 'px';
    const h = hedefBul(e.clientX, e.clientY);
    surukleme.hedef = h;
    isaretGuncelle(h);
    // Kenara yaklaşınca kaydır
    const kr = kap.getBoundingClientRect();
    if (e.clientY > kr.bottom - 30) kap.scrollTop += 12;
    else if (e.clientY < kr.top + 30) kap.scrollTop -= 12;
  }

  function bitir(e, uygula) {
    if (!basla) return;
    if (surukleme) {
      try { kap.releasePointerCapture(basla.pointerId); } catch { /* yok say */ }
      surukleme.hayalet.remove();
      surukleme.isaret.remove();
      for (const o of surukleme.ogeler) o.classList.remove('surukleniyor');
      kap.classList.remove('surukleme-aktif');
      const s = surukleme;
      surukleme = null;
      basla = null;
      if (uygula && s.hedef) {
        // Hedef indeksi, taşınan öğeler çıkarılmış listeye göre hesaplandı
        onBirak(s.ogeler, s.hedef.idx);
      }
      // Sürükleme bitince tıklama olayı seçim yapmasın
      kap.__suruklemeBitti = Date.now();
      return;
    }
    basla = null;
  }

  const up = (e) => bitir(e, true);
  const iptal = (e) => bitir(e, false);
  const tus = (e) => { if (e.key === 'Escape' && surukleme) { e.stopPropagation(); bitir(e, false); } };
  kap.addEventListener('pointerdown', pointerDown);
  kap.addEventListener('pointermove', pointerMove);
  kap.addEventListener('pointerup', up);
  kap.addEventListener('pointercancel', iptal);
  kap.addEventListener('keydown', tus, true);
  return () => {
    kap.removeEventListener('pointerdown', pointerDown);
    kap.removeEventListener('pointermove', pointerMove);
    kap.removeEventListener('pointerup', up);
    kap.removeEventListener('pointercancel', iptal);
    kap.removeEventListener('keydown', tus, true);
  };
}

/** Sürükleme az önce bittiyse (tıklama olayı sürüklemenin kalıntısıysa) true. */
export function suruklemeKalintisi(kap) { return kap.__suruklemeBitti && Date.now() - kap.__suruklemeBitti < 150; }

// ---------------------------------------------------------------- çıktı klasörü, çıktı satırı, kaydetme seçimi
let _klasorlerSozu = null;
/** Bilinen klasörler (ana süreç app.getPath): {masaustu, belgeler, indirilenler, ev}. Bir kez sorulur. */
export function bilinenKlasorler(pdefe) {
  if (!_klasorlerSozu) _klasorlerSozu = pdefe.cagir('uygulama:klasorler').catch(() => ({}));
  return _klasorlerSozu;
}

/**
 * Araçların yeni belge çıktıları için varsayılan klasör: Ayarlar › Dosya "Çıktı klasörü" doluysa ve varsa o,
 * yoksa kullanıcının Masaüstü.
 */
export async function varsayilanCiktiKlasoru(baglam) {
  const ayarKlasoru = baglam.ayar?.()?.ciktiKlasoru;
  if (ayarKlasoru) { try { if (await baglam.pdefe.cagir('dosya:varMi', ayarKlasoru)) return ayarKlasoru; } catch { /* Masaüstü */ } }
  return (await bilinenKlasorler(baglam.pdefe)).masaustu || '';
}

/** Çipte gösterilecek kısa klasör adı: Masaüstü / Belgeler / İndirilenler ya da klasörün kendi adı. */
export function klasorEtiketi(klasor, bilinen = {}) {
  if (!klasor) return 'Klasör seçilmedi';
  if (bilinen.masaustu && yolAyni(klasor, bilinen.masaustu)) return 'Masaüstü';
  if (bilinen.belgeler && yolAyni(klasor, bilinen.belgeler)) return 'Belgeler';
  if (bilinen.indirilenler && yolAyni(klasor, bilinen.indirilenler)) return 'İndirilenler';
  const temiz = String(klasor).replace(/[\\/]+$/, '');
  return dosyaAdi(temiz) || temiz;
}

const KLASOR_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3.6l1.6 1.6H16a1.5 1.5 0 0 1 1.5 1.5v7.4A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';

/** Klasör çipi: kısa ad (Masaüstü…), tam yol ipucunda. */
function klasorCipi() {
  const el = oge(`<span class="arac-klasor-cip">${KLASOR_SVG}<span class="ad"></span></span>`);
  return {
    el,
    yaz: async (klasor, pdefe) => {
      el.title = klasor || '';
      el.querySelector('.ad').textContent = klasorEtiketi(klasor, await bilinenKlasorler(pdefe));
    },
  };
}

/**
 * Yeni dosya çıktısı satırı: kısa dosya adı kutusu + klasör çipi (Masaüstü; tam yol ipucunda) + Değiştir.
 * Değiştir, Windows'un Farklı kaydet diyaloğunu açar (klasör ve ad birlikte seçilir; var olan dosyanın üzerine yazma
 * sorusunu Windows sorar, dolayısıyla o yol için araç ayrıca sormaz: onayli()).
 * @returns {{el:HTMLElement, yol:()=>string, klasor:()=>string, ad:()=>string, ayarla:(klasor:string|null, ad:string|null, s?:{elle?:boolean})=>void,
 *   onDegisti:(cb)=>void, elleDegisti:()=>boolean, onayli:(yol:string)=>boolean}}
 */
export function ciktiSecici({ pdefe, klasor, ad, uzanti: uz = 'pdf', diyalogBasligi = 'Farklı kaydet' }) {
  const el = oge(`<div class="arac-cikti">
      <input type="text" class="arac-girdi arac-cikti-ad" spellcheck="false" aria-label="Dosya adı" title="Dosya adı">
      <span class="arac-cikti-konum">konum</span>
      <button type="button" class="ikincil arac-cikti-degistir" title="Kaydedilecek klasörü ve dosya adını seçin">Değiştir</button>
    </div>`);
  const cip = klasorCipi();
  el.querySelector('.arac-cikti-konum').replaceWith(cip.el);
  const adEl = el.querySelector('.arac-cikti-ad');
  const dinleyiciler = [];
  let mevcutKlasor = klasor || '';
  let elle = false;             // kullanıcı adı ya da klasörü kendisi değiştirdi (varsayılan ad artık önerilmez)
  let onayliYol = null;         // Farklı kaydet diyaloğunda seçilen (Windows üzerine yazmayı sordu)
  const bildir = () => dinleyiciler.forEach((f) => f());
  const yaz = () => { cip.yaz(mevcutKlasor, pdefe); };
  adEl.value = ad || '';
  yaz();
  adEl.addEventListener('input', () => { elle = true; onayliYol = null; bildir(); });
  adEl.addEventListener('blur', () => {
    let v = guvenliAd(adEl.value);
    if (uz && !new RegExp('\\.' + uz + '$', 'i').test(v)) v += '.' + uz;
    if (v !== adEl.value) { adEl.value = v; bildir(); }
  });
  el.querySelector('.arac-cikti-degistir').addEventListener('click', async () => {
    const secilen = await pdefe.cagir('dosya:kaydetDiyalog', {
      baslik: diyalogBasligi, varsayilan: yolBirlestir(mevcutKlasor, adEl.value),
      filtreler: [{ name: 'PDF belgesi', extensions: [uz] }],
    });
    if (!secilen) return;
    mevcutKlasor = klasorAdi(secilen);
    adEl.value = dosyaAdi(secilen);
    elle = true; onayliYol = secilen;
    yaz(); bildir();
  });
  return {
    el,
    yol: () => yolBirlestir(mevcutKlasor, adEl.value.trim()),
    klasor: () => mevcutKlasor,
    ad: () => adEl.value.trim(),
    ayarla: (k, a, { elle: e = false } = {}) => { if (k != null) mevcutKlasor = k; if (a != null) adEl.value = a; if (e) elle = true; onayliYol = null; yaz(); bildir(); },
    onDegisti: (cb) => dinleyiciler.push(cb),
    elleDegisti: () => elle,
    onayli: (yol) => !!onayliYol && yolAyni(onayliYol, yol),
    odakla: () => { adEl.focus(); adEl.select(); },
  };
}

/**
 * Yalnızca klasör satırı (birden çok dosya üreten araçlar, örn. PDF ayır): klasör çipi + Değiştir (klasör seçme diyaloğu).
 * @returns {{el:HTMLElement, klasor:()=>string, ayarla:(k:string)=>void, onDegisti:(cb)=>void}}
 */
export function klasorSecici({ pdefe, klasor, diyalogBasligi = 'Kaydedilecek klasör' }) {
  const el = oge(`<div class="arac-cikti"><span class="arac-cikti-konum"></span><button type="button" class="ikincil arac-cikti-degistir" title="Dosyaların kaydedileceği klasörü seçin">Değiştir</button></div>`);
  const cip = klasorCipi();
  el.querySelector('.arac-cikti-konum').replaceWith(cip.el);
  const dinleyiciler = [];
  let mevcut = klasor || '';
  const ayarla = (k) => { mevcut = k || ''; cip.yaz(mevcut, pdefe); dinleyiciler.forEach((f) => f()); };
  cip.yaz(mevcut, pdefe);
  el.querySelector('.arac-cikti-degistir').addEventListener('click', async () => {
    const k = await pdefe.cagir('dosya:klasorSec', { baslik: diyalogBasligi, varsayilan: mevcut || undefined });
    if (k) ayarla(k);
  });
  return { el, klasor: () => mevcut, ayarla, onDegisti: (cb) => dinleyiciler.push(cb) };
}

/** İki (ya da daha çok) seçenekli bölümlü düğme grubu. secenekler: [{id, etiket, baslik?}] */
export function segmentliSecim({ secenekler, deger, etiket = '', sinif = '', degisti }) {
  const el = oge(`<div class="arac-segmentli ${sinif}" role="radiogroup" aria-label="${kacis(etiket)}"></div>`);
  let mevcut = deger;
  const dugmeler = secenekler.map((s) => {
    const b = oge(`<button type="button" role="radio" data-id="${kacis(s.id)}"></button>`);
    b.innerHTML = s.html ?? kacis(s.etiket);
    if (s.baslik) b.title = s.baslik;
    b.addEventListener('click', () => sec(s.id, true));
    el.append(b);
    return b;
  });
  function sec(id, kullanici = false) {
    if (!secenekler.some((s) => s.id === id)) return;
    const degisti_ = id !== mevcut;
    mevcut = id;
    for (const b of dugmeler) {
      const secili = b.dataset.id === id;
      b.classList.toggle('secili', secili);
      b.setAttribute('aria-checked', secili ? 'true' : 'false');
      b.tabIndex = secili ? 0 : -1;
    }
    if (kullanici && degisti_) degisti?.(id);
  }
  // Ok tuşlarıyla seçenekler arasında gezinme (radyo grubu davranışı)
  el.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = secenekler.findIndex((s) => s.id === mevcut);
    const n = secenekler.length;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + n) % n;
    sec(secenekler[j].id, true);
    dugmeler[j].focus();
  });
  sec(deger);
  return { el, deger: () => mevcut, sec: (id) => sec(id), dugme: (id) => dugmeler.find((b) => b.dataset.id === id) };
}

/**
 * Standart kaydetme seçimi: "Yeni belge olarak kaydet" | "Üzerine yaz". Açık belgenin değiştirilmiş sürümünü üreten her araç
 * (PDF küçült, Döndür ve kaydet) aynı biçimde kullanır.
 *  - Yeni belge: dosya adı + klasör çipi + Değiştir; varsayılan klasör varsayilanCiktiKlasoru (Masaüstü), varsayılan ad
 *    "<ad> (<ek>).pdf" (klasörde varsa "(2)"…).
 *  - Üzerine yaz: özgün dosyanın üzerine doğrudan yazılır, yedek alınmaz. Çekirdek önce aynı klasörde geçici dosyaya yazar,
 *    sonra atomik olarak yerine koyar; dosya kilitliyse özgün dosya değişmez (bkz. uzerineYazmaHatasi).
 * @param {object} s
 * @param {object} s.baglam
 * @param {object} s.belge   {yol, ad}
 * @param {string} s.ek      varsayılan ad eki, örn. 'küçültülmüş'
 * @param {'yeni'|'uzerine'} [s.kip]
 * @returns {{el:HTMLElement, kip:()=>string, kipAyarla:(k:string)=>void, hedef:()=>string, cikti:object, hazir:Promise<void>,
 *   adYenile:()=>Promise<void>, onDegisti:(cb)=>void}}
 */
export function kayitSecimi({ baglam, belge, ek, kip = 'yeni', diyalogBasligi = 'Yeni belge olarak kaydet' }) {
  const el = oge(`<div class="arac-kayit">
      <div class="arac-kayit-kip"></div>
      <div class="arac-kayit-yeni"></div>
      <div class="arac-kayit-uzerine arac-not-satiri" hidden>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3 18 17H2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 8v4.5M10 14.6v.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span class="metin"></span>
      </div>
    </div>`);
  const dinleyiciler = [];
  const bildir = () => dinleyiciler.forEach((f) => f());
  const ozgunAd = dosyaAdi(belge.yol);
  const oneriAd = () => `${adGovdesi(belge.yol)} (${ek}).pdf`;
  const cikti = ciktiSecici({ pdefe: baglam.pdefe, klasor: '', ad: oneriAd(), diyalogBasligi });
  cikti.onDegisti(bildir);
  el.querySelector('.arac-kayit-yeni').append(cikti.el);
  const uzerineMetin = el.querySelector('.arac-kayit-uzerine .metin');
  uzerineMetin.textContent = `Değişiklik doğrudan "${ozgunAd}" dosyasına kaydedilir; yedek alınmaz.`;
  el.querySelector('.arac-kayit-uzerine').title = belge.yol;
  const secim = segmentliSecim({
    etiket: 'Kaydetme biçimi', deger: kip, sinif: 'arac-kayit-secim',
    secenekler: [
      { id: 'yeni', etiket: 'Yeni belge olarak kaydet', baslik: 'Sonuç ayrı bir PDF dosyası olarak kaydedilir; özgün dosya değişmez' },
      { id: 'uzerine', etiket: 'Üzerine yaz', baslik: `Sonuç "${ozgunAd}" dosyasının yerine kaydedilir` },
    ],
    degisti: () => { goster(); bildir(); },
  });
  el.querySelector('.arac-kayit-kip').replaceWith(secim.el);
  function goster() {
    const uzerine = secim.deger() === 'uzerine';
    el.querySelector('.arac-kayit-yeni').hidden = uzerine;
    el.querySelector('.arac-kayit-uzerine').hidden = !uzerine;
  }
  goster();
  /** Varsayılan klasör ve boş ad (kullanıcı elle değiştirmediyse). */
  async function adYenile() {
    if (cikti.elleDegisti()) return;
    const klasor = cikti.klasor() || await varsayilanCiktiKlasoru(baglam);
    let ad = oneriAd();
    try { ad = await bosAdBul(baglam.pdefe, klasor, ad); } catch { /* varsayılan ad */ }
    if (!cikti.elleDegisti()) cikti.ayarla(klasor, ad);
  }
  const hazir = adYenile();
  return {
    el, cikti, hazir, adYenile,
    kip: () => secim.deger(),
    kipAyarla: (k) => { secim.sec(k); goster(); bildir(); },
    hedef: () => (secim.deger() === 'uzerine' ? belge.yol : cikti.yol()),
    onDegisti: (cb) => dinleyiciler.push(cb),
  };
}

/**
 * Yeni belge çıktısı başka bir dosyanın üzerine gelecekse sorar (Farklı kaydet diyaloğunda Windows zaten sorduysa sormaz).
 * Döner: true (devam) | false (vazgeç).
 */
export async function varOlanaYazmaSor(baglam, cikti, hedef) {
  if (cikti?.onayli?.(hedef)) return true;
  if (!(await baglam.pdefe.cagir('dosya:varMi', hedef))) return true;
  const { secim } = await baglam.mesajKutusu({ tur: 'warning', mesaj: `"${dosyaAdi(hedef)}" zaten var.`, ayrinti: `${hedef}\n\nVar olan dosyanın yerine kaydedilsin mi?`, dugmeler: ['Üzerine yaz', 'Vazgeç'], varsayilan: 1, iptal: 1 });
  return secim === 0;
}

/**
 * Üzerine yazma (ya da okuma) dosya kilidi yüzünden başarısız olunca sorar. Özgün dosya değişmemiştir.
 * okunamadi: dosya okunamıyor bile (yeni belge de üretilemez) → yalnızca Yeniden dene / Vazgeç.
 * Döner: 'yeni' (Yeni belge olarak kaydet) | 'tekrar' | 'vazgec'.
 */
export async function uzerineYazmaHatasi(baglam, belge, e) {
  const okunamadi = /okunamadı/i.test(e?.message || '');
  const ad = belge?.ad || dosyaAdi(belge?.yol);
  const dugmeler = okunamadi ? ['Yeniden dene', 'Vazgeç'] : ['Yeni belge olarak kaydet', 'Yeniden dene', 'Vazgeç'];
  const { secim } = await baglam.mesajKutusu({
    tur: 'warning',
    mesaj: okunamadi ? `"${ad}" okunamadı.` : `"${ad}" dosyasının üzerine yazılamadı.`,
    ayrinti: `Dosya başka bir programda (örneğin bir PDF okuyucu) açık olabilir. Özgün dosya değiştirilmedi.\n\n`
      + (okunamadi ? 'Dosyayı kullanan programı kapatıp yeniden deneyin.' : 'Dosyayı kullanan programı kapatıp yeniden deneyebilir ya da sonucu yeni bir belge olarak kaydedebilirsiniz.'),
    dugmeler, varsayilan: 0, iptal: dugmeler.length - 1,
  });
  if (okunamadi) return secim === 0 ? 'tekrar' : 'vazgec';
  return ['yeni', 'tekrar', 'vazgec'][secim] || 'vazgec';
}

/** Üzerine yazmadan önce: dosya yazılabilir mi (başka program kilitlemiş mi)? Çekirdek yanıt veremezse true sayılır. */
export async function yazilabilirMi(baglam, yol) {
  try { const r = await baglam.cekirdek('dosya_erisim', { yol }); return r ? { okunur: r.okunur !== false, yazilir: r.yazilir !== false } : { okunur: true, yazilir: true }; }
  catch { return { okunur: true, yazilir: true }; }
}

/**
 * Üzerine yazılan dosyanın açık sekmesini diskteki güncel haliyle yeniden açar (aynı sayfada). Sekmede kaydedilmemiş değişiklik
 * varsa önce sorar. Döner: 'yenilendi' | 'yok' (sekme zaten kapalı) | false (vazgeçildi ya da kapatılamadı).
 * @param {{soruAyrintisi?:string, ac?:boolean}} [s] ac=false: yalnızca kapatır (çağıran açar)
 */
export async function sekmeyiYenile(baglam, belge, { soruAyrintisi, ac = true } = {}) {
  if (!belge || (belge.el && !belge.el.isConnected)) return 'yok';
  if (typeof baglam.belgeKapat !== 'function') return false;
  if (belge.degisti) {
    const { secim } = await baglam.mesajKutusu({ tur: 'warning', mesaj: `"${belge.ad}" belgesinde kaydedilmemiş değişiklikler var.`, ayrinti: soruAyrintisi || 'Belge diskteki güncel haliyle yeniden açılırsa bu değişiklikler atılır.', dugmeler: ['Değişiklikleri at ve yeniden aç', 'Vazgeç'], varsayilan: 1, iptal: 1 });
    if (secim !== 0) return false;
  }
  const sayfa = belge.gorunum?.gecerli || 1;
  if (!(await baglam.belgeKapat(belge.id, { zorla: true }))) return false;
  if (ac) await baglam.dosyaAc(belge.yol, { arkaPlanda: false, sayfa });
  return 'yenilendi';
}

// ---------------------------------------------------------------- belge yardımcıları
const A4_PT = { w: 595.276, h: 841.89 };

/**
 * Sekmedeki belgenin geçerli sayfa düzenini araçların iç biçiminde verir:
 *   [{kaynak: yol, sayfa: 1-tabanlı, dondurme, pt:{w,h}} | {kaynak: null, sayfa: null, genislik, yukseklik, dondurme, pt}]
 * Kaynak: gorunum.tarif() (goruntuleyici.js; [{kaynak:{yol,sayfa}, dondurme} | {kaynak:null, genislik, yukseklik, dondurme}]).
 * dondurme, kaynak dosyadaki /Rotate'e EK döndürmedir; pt ise ek döndürme uygulanmamış görünen ölçüdür (pt).
 * gorunum.tarif() yoksa gorunum.sayfalar[i] ({kaynak:{yol,sayfa}|{bos}, bos, pt, dondurme}) okunur.
 */
export function belgeTarifi(belge) {
  const g = belge?.gorunum;
  const sayfalar = g?.sayfalar || [];
  const ptAl = (i, t) => {
    const p = sayfalar[i]?.pt;
    if (p && p.w && p.h) return { w: p.w, h: p.h };
    return { w: t?.genislik || A4_PT.w, h: t?.yukseklik || A4_PT.h };
  };
  const tarif = typeof g?.tarif === 'function' ? g.tarif() : null;
  if (Array.isArray(tarif)) {
    return tarif.map((t, i) => {
      const pt = ptAl(i, t);
      const dondurme = ((t.dondurme || 0) % 360 + 360) % 360;
      if (!t.kaynak) return { kaynak: null, sayfa: null, dondurme, genislik: pt.w, yukseklik: pt.h, pt };
      return { kaynak: t.kaynak.yol, sayfa: t.kaynak.sayfa, dondurme, pt };
    });
  }
  return sayfalar.map((s, i) => {
    const pt = ptAl(i, null);
    const dondurme = ((s.dondurme || 0) % 360 + 360) % 360;
    if (s.bos || !s.kaynak || s.kaynak.bos) return { kaynak: null, sayfa: null, dondurme, genislik: pt.w, yukseklik: pt.h, pt };
    return { kaynak: s.kaynak.yol || belge.yol, sayfa: s.kaynak.sayfa || s.no || i + 1, dondurme, pt };
  });
}

/**
 * İç biçimdeki tarifi baglam.sayfaTarifiUygula'nın beklediği biçime çevirir:
 *   [{kaynak:{yol, sayfa}, dondurme} | {kaynak:null, genislik, yukseklik, dondurme}]
 */
export function tarifDisari(icTarif) {
  return icTarif.map((t) => {
    const dondurme = ((t.dondurme || 0) % 360 + 360) % 360;
    if (!t.kaynak) return { kaynak: null, genislik: t.genislik || t.pt?.w || A4_PT.w, yukseklik: t.yukseklik || t.pt?.h || A4_PT.h, dondurme };
    return { kaynak: { yol: t.kaynak, sayfa: t.sayfa }, dondurme };
  });
}

/** Yol, belgenin kendi dosyası (ya da yapısal kayıt sonrası anlık kopyası) mı? */
export function anaKaynakMi(belge, yol) {
  if (!yol || !belge) return false;
  if (yolAyni(yol, belge.yol)) return true;
  const anlik = belge.gorunum?.anlik;
  return !!anlik && yolAyni(yol, anlik);
}

/**
 * Kaydedilmemiş değişiklik varsa kullanıcıya sorar. Dönüş: 'devam' | 'vazgec'.
 * yalnizKaydet: kaydetmeden devam edilemez (örn. sekmedeki sayfa sırası değişti; sayfa numaraları dosyadakiyle uyuşmaz).
 */
export async function degisiklikleriSor(baglam, belge, islemAdi, { yalnizKaydet = false, neden = '' } = {}) {
  if (!belge?.degisti) return 'devam';
  const { secim } = await baglam.mesajKutusu({
    mesaj: `"${belge.ad}" belgesinde kaydedilmemiş değişiklikler var.`,
    ayrinti: `${islemAdi} dosyadaki kayıtlı sürüm üzerinde çalışır. ${neden ? neden + ' ' : ''}Önce kaydetmek ister misiniz?`,
    dugmeler: yalnizKaydet ? ['Kaydet ve devam et', 'Vazgeç'] : ['Kaydet ve devam et', 'Kaydetmeden devam et', 'Vazgeç'],
    varsayilan: 0, iptal: yalnizKaydet ? 1 : 2,
  });
  if (secim === (yalnizKaydet ? 1 : 2)) return 'vazgec';
  if (secim === 0) { const ok = await baglam.kaydet(belge); if (!ok) return 'vazgec'; }
  return 'devam';
}

/** Küçük yardımcı: HTML dizesinden tek öğe. */
export function oge(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

/** Gecikmeli çağrı (debounce). */
export function geciktir(f, ms) { let z = null; return (...a) => { clearTimeout(z); z = setTimeout(() => f(...a), ms); }; }
