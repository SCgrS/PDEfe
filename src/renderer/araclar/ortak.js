// Araç pencereleri için ortak parçalar: pencere iskeleti, ilerleme çubuğu, boyut biçimleme,
// yol yardımcıları, sürükleyerek sıralama, çıktı satırı (ad + klasör çipi), standart kaydetme seçimi
// ("Yeni belge olarak kaydet" | "Üzerine yaz"), üzerine yazılan sekmeyi yenileme.
// Bütün araçlar (kucult: Sıkıştır, sayfalar, ayir, gorselBirlestir, dondur) bu modülü kullanır.
import { tus, MAC } from '../platform.js';

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

/** Dosya başka bir programda (örn. bir PDF okuyucuda) açık olduğu ya da salt okunur olduğu için okunamadı / yazılamadı mı?
 *  (çekirdek: KILITLI_METNI, SALT_OKUNUR_METNI) */
export function kilitliHataMi(e) {
  return /başka bir programda açık|salt okunur|EBUSY|EPERM|EACCES|being used by another process/i.test((e && (e.message || String(e))) || '');
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
  return String(ad || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/\.+$/, '') || 'Belge';
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
 * Kurallar: "-3" = 1-3, "5-" = 5-son, ters aralık düzeltilir (0.1.25'e dek çekirdekteki araliklari_ayristir da aynıydı).
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
const tumPencereler = new Set();    // açık bütün araç pencereleri (anahtarsızlar dahil), açılış sırasıyla
const kapanisDinleyicileri = new Set();

/** Açık araç penceresi var mı. */
export function acikAracPenceresiVar() { return tumPencereler.size > 0; }

// Odak pencerenin içindeki bir öğeyle birlikte kaybolursa (son satırı silen düğme, seçim kalmayınca devre dışı kalan düğme) BODY'ye düşer:
// tuşlar pencereye gitmez, Esc kapatmaz, Ctrl+A arkadaki sayfanın bütün metnini seçerdi. En üstteki pencere tuşu kendi işleyicisinden
// geçirir (Esc, Tab, Ctrl+A) ve odağı geri alır; diğer tuşlar belgeye zaten gitmez (uygulama.js açık pencere denetimi).
document.addEventListener('keydown', (e) => {
  if (e.target !== document.body || !tumPencereler.size || document.querySelector('.mesaj-kutusu')) return;
  const ust = [...tumPencereler].at(-1);
  if (!ust || ust.kapali) return;
  ust._tusIsle(e);
  if (!ust.kapali) ust.odakla();
}, true);

/** Her araç penceresi kapandığında (kapandi olayından sonra) çağrılır: f(pencere). uygulama.js çekirdeğin önbelleğindeki araç
 *  dosyalarını son pencere kapanınca bırakır. */
export function aracPenceresiKapaninca(f) { kapanisDinleyicileri.add(f); }

/**
 * Açık araç pencerelerini (en son açılan önce) kapatır. Her pencerenin kapatmadanOnce'u kendi sorusunu sorar (süren işlem, kaydedilmemiş
 * değişiklik: Kaydet | Kaydetme | Vazgeç). Hepsi kapandıysa true; biri açık kaldıysa (Vazgeç, başarısız kayıt) false ve ondan sonrakilere
 * dokunulmaz. Uygulama kapanmadan önce çağrılır (0.1.12: araçta kaydedilmemiş iş varken pencere X'i uygulamayı doğrudan kapatıyordu).
 */
export async function aracPencereleriniKapat() {
  for (const p of [...tumPencereler].reverse()) {
    if (p.kapali) continue;
    p.odakla();
    await p.kapat(null);
    // Soruda Kaydet seçildiyse aracın kaydı pencereyi kendisi kapatır ('tamam'); kapat(null) o zaman false döner: sonuca pencereden bakılır
    if (!p.kapali) return false;
    await p.kapanisIsi;   // kapanışta başlayan iş (Küçült: sekmeyi diskteki haliyle yeniden açma, kendi sorusuyla)
  }
  return true;
}

/**
 * Araç penceresi açar. Var olan diyalog görünümünü (.diyalog-ortusu/.diyalog) taklit eden daha geniş bir
 * iskelet: başlık + kapat (X) düğmesi, gövde, alt şerit. Kapatma X, Esc ya da pencerenin dışına tıklamayla (Kapat/Vazgeç düğmesi yok);
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
 * @param {boolean} [s.seritAlti] pencere ortada değil şeritlerin (sekme şeridi ve altındaki araç çubuğu) altında başlar (bkz. Pencere._seritAltinaYerlestir)
 * @returns {Pencere}
 */
export function pencereAc({ baslik, govde, dugmeler = [], genislik, anahtar, sinif, kapatmadanOnce, seritAlti = false }) {
  if (anahtar && acikPencereler.has(anahtar)) {
    const p = acikPencereler.get(anahtar);
    p.odakla();
    return p;
  }
  const pencere = new Pencere({ baslik, govde, dugmeler, genislik, anahtar, sinif, kapatmadanOnce, seritAlti });
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
  constructor({ baslik, govde, dugmeler, genislik, anahtar, sinif, kapatmadanOnce, seritAlti = false }) {
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
    // Örtüye (pencerenin dışına) tıklamak X gibi kapatır: kapatmadanOnce işlem sürüyorsa ya da uygulanmamış değişiklik varsa sorar.
    // Basış da bırakış da örtünün kendisinde olmalı: pencerede başlayıp dışarıda biten seçim / sürükleme, sağ ve orta tık kapatmaz
    // (../ortu.js ortuTiklamasiBagla ile aynı kural; çok tıklamanın sonraki tıkları, e.detail > 1, da kapatmaz: pencereyi açan tıklamanın
    // eşi örtüye düşebilir). Basış odağı pencereye alır (kapatma reddedilirse odak içeride kalsın); soru açılırken gelen ikinci
    // tıklama (çift tık) soruyu yinelemez.
    let basildi = false, birakildi = false, kapatiliyor = false;
    ortu.addEventListener('mousedown', (e) => { if (e.target === ortu) { e.preventDefault(); this.odakla(); } });
    ortu.addEventListener('pointerdown', (e) => { basildi = e.target === ortu && e.button === 0 && e.isPrimary; birakildi = false; });
    ortu.addEventListener('pointerup', (e) => { birakildi = basildi && e.target === ortu && e.button === 0; });
    ortu.addEventListener('click', async (e) => {
      const disari = basildi && birakildi && e.target === ortu && e.button === 0 && e.detail <= 1;
      basildi = birakildi = false;
      if (!disari || kapatiliyor) return;
      kapatiliyor = true;
      try { await this.kapat(null); } finally { kapatiliyor = false; }
    });
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
    tumPencereler.add(this);
    if (seritAlti) this._seritAltinaYerlestir();
    this.odakla();
  }

  /**
   * Pencere sekme şeridinin hemen altında başlar, yüksekliği pencerenin altına sığacak kadar kısalır (kullanıcı isteği, 0.1.26 Birleştir,
   * 0.1.27 Sayfaları düzenle: arkadaki sekmeler görünsün, doğru belgede olunduğu denetlenebilsin). Örtü şeridi de karartır, tıklama yine
   * pencerenin dışına tıklamadır. Şerit gizliyse (okuma kipi) ya da altında yeterli yer yoksa pencere ortalanır. Uygulama penceresi
   * boyutlanınca, menü çubuğu açılıp kapanınca ya da okuma kipine girilince yeniden yerleşir.
   * 0.2.3 (kullanıcı isteği: sekme şeridi en üstte, araç çubuğu altında): pencere alttaki şeridin, yani araç çubuğunun altında başlar
   * (güncelleme şeridi görünüyorsa onun altında); iki şerit de kapanmaz. Sekme şeridinin altından başlasaydı araç çubuğunu örterdi.
   */
  _seritAltinaYerlestir() {
    const serit = document.getElementById('sekme-cubugu');
    if (!serit) return;
    const alttakiler = ['arac-cubugu', 'guncelleme-seridi'].map((id) => document.getElementById(id)).filter(Boolean);
    const BOSLUK = 8, ALT_BOSLUK = 12, EN_AZ = 480;   // px: şeritle pencere arası, pencerenin altı, şeridin altında gereken en az yükseklik
    const yerlestir = () => {
      if (this.kapali) return;
      const k = serit.getBoundingClientRect();
      // Gizli öğenin (hidden güncelleme şeridi) kutusu boş; okuma kipinde sekme şeridi gizli (k.height 0), pencere ortada
      const alt = Math.max(k.bottom, ...alttakiler.map((e) => { const r = e.getBoundingClientRect(); return r.height ? r.bottom : 0; }));
      const ust = Math.round(alt + BOSLUK);
      const uygun = k.height > 0 && innerHeight - ust - ALT_BOSLUK >= EN_AZ;
      this.ortu.classList.toggle('serit-alti', uygun);
      this.ortu.style.setProperty('--arac-ust', uygun ? `${ust}px` : '');
    };
    const gozlemci = new ResizeObserver(yerlestir);
    gozlemci.observe(serit);
    for (const e of alttakiler) gozlemci.observe(e);   // güncelleme şeridi açılıp kapanınca da (boyutu 0'a iner / 0'dan çıkar)
    addEventListener('resize', yerlestir);
    this.el.addEventListener('kapandi', () => { gozlemci.disconnect(); removeEventListener('resize', yerlestir); });
    yerlestir();
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
      // Soru açıkken pencere başka yoldan kapanmış olabilir (ör. işlem bitti, araç 'tamam' ile kapattı): 'kapandi' iki kez gitmesin
      if (this.kapali) return false;
    }
    this.kapali = true;
    tumPencereler.delete(this);
    if (this.anahtar && acikPencereler.get(this.anahtar) === this) acikPencereler.delete(this.anahtar);
    // Kapanışta süren iş (ör. Küçült'ün bayat sekmeyi yenilemesi) detail.bekle(söz) ile bildirilir; kapanisIsi onları bekler
    // (aracPencereleriniKapat: uygulama kapanırken o iş bitmeden belgelere geçilmesin, iki soru üst üste açılmasın)
    const isler = [];
    this.el.dispatchEvent(new CustomEvent('kapandi', { detail: { bekle: (soz) => { if (soz?.then) isler.push(soz); } } }));
    this.kapanisIsi = Promise.allSettled(isler);
    for (const f of kapanisDinleyicileri) { try { f(this); } catch (e) { console.warn('[araçlar] kapanış dinleyicisi', e); } }
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
 * Araçların yeni belge çıktıları için varsayılan klasör: Ayarlar › Kaydetme "Çıktı klasörü" doluysa ve varsa o,
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

/** Klasör çipi: kısa ad (Masaüstü…), tam yol ipucunda. Tıklanınca klasör Gezgin'de açılır (0.1.12, kullanıcı isteği). */
function klasorCipi() {
  const el = oge(`<button type="button" class="arac-klasor-cip">${KLASOR_SVG}<span class="ad"></span></button>`);
  let klasor = '', pdefe = null;
  el.addEventListener('click', () => {
    if (!klasor || !pdefe) return;
    pdefe.cagir('kabuk:klasorAc', klasor).catch((e) => console.warn('[araçlar] klasör açılamadı', klasor, e));
  });
  return {
    el,
    yaz: async (k, p) => {
      klasor = k || ''; pdefe = p;
      el.disabled = !klasor;
      el.title = klasor ? `Klasörü aç: ${klasor}` : '';
      el.dataset.klasor = klasor;   // tam yol (testler çıktı klasörünü buradan denetler)
      el.querySelector('.ad').textContent = klasorEtiketi(klasor, await bilinenKlasorler(p));
    },
  };
}

/**
 * Yeni dosya çıktısı satırı: kısa dosya adı kutusu + klasör çipi (Masaüstü; tam yol ipucunda, tıklanınca Gezgin'de açılır) + Değiştir.
 * Kutuda ad uzantısız görünür (0.1.12, kullanıcı isteği); ad() ve yol() uzantıyla döner, ayarla() uzantılı ya da uzantısız ad alır.
 * Değiştir, Windows'un Farklı kaydet diyaloğunu açar (klasör ve ad birlikte seçilir; var olan dosyanın üzerine yazma
 * sorusunu Windows sorar, dolayısıyla o yol için araç ayrıca sormaz: onayli()).
 * onayla/onaylandi: aracın kendi "zaten var" sorusunda üzerine yazma onaylanan hedef ("Yeniden dene"de yeniden sorulmaz);
 * ad ya da klasör değişince ikisi de sıfırlanır.
 * @returns {{el:HTMLElement, yol:()=>string, klasor:()=>string, ad:()=>string, ayarla:(klasor:string|null, ad:string|null, s?:{elle?:boolean})=>void,
 *   onDegisti:(cb)=>void, elleDegisti:()=>boolean, onayli:(yol:string)=>boolean, onayla:(yol:string)=>void, onaylandi:(yol:string)=>boolean}}
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
  let aracOnayi = null;         // araç "zaten var" sorusunda onaylanan hedef
  const bildir = () => dinleyiciler.forEach((f) => f());
  const yaz = () => { cip.yaz(mevcutKlasor, pdefe); };
  // Kutudaki ad uzantısızdır; kullanıcı uzantıyı yazarsa odak çıkınca silinir, kaydederken ad() ekler
  const uzantiDeseni = uz ? new RegExp('\\.' + uz + '$', 'i') : null;
  const govdesi = (a) => (uzantiDeseni ? String(a ?? '').trim().replace(uzantiDeseni, '') : String(a ?? '').trim());
  // Uzantı yalnızca bir kez silinir: kutuGovde, kutudaki değerin uzantısı zaten silinmiş gövde olduğunu söyler ("dilekce.pdf.pdf"
  // seçilince kutuda "dilekce.pdf" kalır, ad() yine "dilekce.pdf.pdf")
  let kutuGovde = true;
  const tamAd = () => { const g = kutuGovde ? String(adEl.value).trim() : govdesi(adEl.value); return g ? (uz ? `${g}.${uz}` : g) : ''; };
  const govdeYaz = (a) => { adEl.value = govdesi(a); kutuGovde = true; };
  govdeYaz(ad);
  yaz();
  adEl.addEventListener('input', () => { kutuGovde = false; elle = true; onayliYol = null; aracOnayi = null; bildir(); });
  adEl.addEventListener('blur', () => {
    if (kutuGovde) return;
    const v = guvenliAd(govdesi(adEl.value));
    kutuGovde = true;
    if (v !== adEl.value) { adEl.value = v; bildir(); }
  });
  el.querySelector('.arac-cikti-degistir').addEventListener('click', async () => {
    const secilen = await pdefe.cagir('dosya:kaydetDiyalog', {
      baslik: diyalogBasligi, varsayilan: yolBirlestir(mevcutKlasor, tamAd()),
      filtreler: [{ name: 'PDF belgesi', extensions: [uz] }],
    });
    if (!secilen) return;
    mevcutKlasor = klasorAdi(secilen);
    govdeYaz(dosyaAdi(secilen));
    elle = true; onayliYol = secilen; aracOnayi = null;
    yaz(); bildir();
  });
  return {
    el,
    yol: () => yolBirlestir(mevcutKlasor, tamAd()),
    klasor: () => mevcutKlasor,
    ad: () => tamAd(),
    ayarla: (k, a, { elle: e = false } = {}) => { if (k != null) mevcutKlasor = k; if (a != null) govdeYaz(a); if (e) elle = true; onayliYol = null; aracOnayi = null; yaz(); bildir(); },
    onDegisti: (cb) => dinleyiciler.push(cb),
    elleDegisti: () => elle,
    onayli: (yol) => !!onayliYol && yolAyni(onayliYol, yol),
    onayla: (yol) => { aracOnayi = yol; },
    onaylandi: (yol) => !!aracOnayi && yolAyni(aracOnayi, yol),
    odakla: () => { adEl.focus(); adEl.select(); },
  };
}

/**
 * "Üzerine yaz" seçiliyken yeni belge satırının yerinde durur (0.1.25, kullanıcı isteği: kayıt yeri ve adı kaybolmasın): üzerine yazılacak
 * dosyanın adı (uzantısız) ve klasörü aynı düzende; ad kutusu ve Değiştir soluk (değiştirilemez), klasör çipi klasörü Gezgin'de açar.
 * @returns {{el:HTMLElement, yaz:(yol:string)=>void}}
 */
function sabitCiktiSatiri(pdefe) {
  const el = oge(`<div class="arac-cikti arac-cikti-sabit">
      <input type="text" class="arac-girdi arac-cikti-ad" spellcheck="false" disabled aria-label="Üzerine yazılacak dosya">
      <span class="arac-cikti-konum"></span>
      <button type="button" class="ikincil arac-cikti-degistir" disabled title="Üzerine yazarken dosya adı ve klasör değişmez">Değiştir</button>
    </div>`);
  const cip = klasorCipi();
  el.querySelector('.arac-cikti-konum').replaceWith(cip.el);
  const adEl = el.querySelector('.arac-cikti-ad');
  return {
    el,
    yaz: (yol) => { adEl.value = adGovdesi(yol); adEl.title = yol; cip.yaz(klasorAdi(yol), pdefe); },
  };
}

/** İki (ya da daha çok) seçenekli bölümlü düğme grubu. secenekler: [{id, etiket, baslik?}]. etkin(id, false) seçeneği devre dışı
 *  bırakır: tıklanamaz, ok tuşları atlar (seçili seçeneği değiştirmez; gerekiyorsa çağıran başka seçeneğe geçer). */
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
  // Ok tuşlarıyla seçenekler arasında gezinme (radyo grubu davranışı); devre dışı seçenekler atlanır
  el.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const etkinler = dugmeler.map((b, k) => (b.disabled ? -1 : k)).filter((k) => k >= 0);
    if (!etkinler.length) return;
    const i = secenekler.findIndex((s) => s.id === mevcut);
    const n = secenekler.length;
    let j = e.key === 'Home' ? etkinler[0] : e.key === 'End' ? etkinler[etkinler.length - 1] : i;
    if (e.key !== 'Home' && e.key !== 'End') {
      const adim = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      do { j = (j + adim + n) % n; } while (dugmeler[j].disabled && j !== i);
    }
    sec(secenekler[j].id, true);
    dugmeler[j].focus();
  });
  sec(deger);
  const dugme = (id) => dugmeler.find((b) => b.dataset.id === id);
  return {
    el, dugme, deger: () => mevcut, sec: (id) => sec(id),
    etkin: (id, evet) => { const b = dugme(id); if (b) b.disabled = !evet; },
  };
}

const UYARI_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3 18 17H2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 8v4.5M10 14.6v.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const BILGI_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10 9v5M10 6.2v.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/**
 * Standart kaydetme seçimi: "Yeni belge olarak kaydet" | "Üzerine yaz". Bütün araçlar (Sıkıştır, Sayfaları düzenle, Döndür,
 * Ayır, Görüntü / PDF birleştir) aynı biçimde, aynı sırayla ve aynı varsayılanla ("Yeni belge olarak kaydet") kullanır: aracın "Kaydet"
 * başlığının altında bu seçim, (varsa) kısıt satırı, dosya satırı (ad + klasör çipi + Değiştir) ve üzerine yazma notu (0.1.25, kullanıcı
 * isteği: her araçta fotoğraftaki düzen).
 *  - Yeni belge: varsayılan klasör varsayilanCiktiKlasoru (Masaüstü), varsayılan ad aracın verdiği ad ("Sıkıştırılmış", "Ayrılmış"…;
 *    0.1.25'e dek "<özgün ad> (<ek>)"; klasörde varsa "(2)"…).
 *  - Üzerine yaz: sonuç özgün dosyaya yazılır, yedek alınmaz. Dosya satırı kaybolmaz: yazılacak dosyanın adı ve klasörüyle soluk
 *    (değiştirilemez) görünür. Altındaki not sonucun geri alınıp alınamayacağını söyler: geriAlinabilir araç (Döndür, Sayfaları
 *    düzenle) sonucu sekmedeki belgeye geri alınabilir komut olarak uygulayıp normal kayıt yoluyla kaydeder (Ctrl+Z), not sade bilgidir;
 *    değilse (Sıkıştır, Ayır, Birleştir: çekirdek aynı klasörde geçici dosyaya yazıp atomik olarak yerine koyar) not uyarı
 *    biçiminde "Geri alınamaz" der, seçeneğin ipucu da. Dosya kilitli ya da salt okunursa özgün dosya değişmez (bkz. hataSor).
 *  - uzerineKullanilabilir(false, neden): "Üzerine yaz" seçilemez (birden çok dosya üreten ayırma; Birleştir'de açık belge listeden
 *    çıkarıldı), neden seçimin altında yazar; seçiliyse "Yeni belge"ye geçilir (yeniden kullanılabilir olunca kendiliğinden geri seçilmez).
 *    belge verilmezse (Birleştir bir PDF açık değilken açıldı) hiç seçilemez; neden belgesizNeden.
 *  - cokluAyarla(true): araç birden çok dosya üretecek (Ayır); ad dosya adlarının ortak başıdır. Adları ve var olan dosyaları araç
 *    yönetir (denetle yalnızca ada ve klasöre bakar), varsayılan ada "(2)" eklenmez, Değiştir'le özgün dosya seçilse de üzerine yazma değildir.
 * denetle() işlemden önce, hataSor(e) kilit/salt okunur hatasında çağrılır; ikisi de hedefe göre (özgün dosya ya da yeni belge) konuşur.
 * @param {object} s
 * @param {object} s.baglam
 * @param {object|null} s.belge   {yol, ad}; null: üzerine yazılacak belge yok
 * @param {string} s.ad          varsayılan yeni belge adı, uzantısız (örn. 'Sıkıştırılmış')
 * @param {'yeni'|'uzerine'} [s.kip]
 * @param {boolean} [s.geriAlinabilir]  "Üzerine yaz" sonucu Ctrl+Z ile geri alınabiliyor mu (varsayılan: hayır → uyarı)
 * @param {string} [s.belgesizNeden]   belge yokken "Üzerine yaz"ın altında yazan neden
 * @returns {{el:HTMLElement, kip:()=>string, kipAyarla:(k:string)=>void, hedef:()=>string, uzerineMi:()=>boolean, cikti:object,
 *   hazir:Promise<void>, adYenile:()=>Promise<void>, denetle:()=>Promise<'devam'|'vazgec'|Error>, hataSor:(e:Error)=>Promise<boolean>,
 *   uzerineKullanilabilir:(evet:boolean, neden?:string)=>void, cokluAyarla:(evet:boolean)=>void, coklu:()=>boolean, onDegisti:(cb)=>void}}
 */
export function kayitSecimi({ baglam, belge = null, ad: varsayilanAd = 'Belge', kip = 'yeni', diyalogBasligi = 'Yeni belge olarak kaydet', geriAlinabilir = false, belgesizNeden = '' }) {
  const el = oge(`<div class="arac-kayit">
      <div class="arac-kayit-kip"></div>
      <div class="arac-kayit-kisit arac-aciklama" hidden></div>
      <div class="arac-kayit-yeni"></div>
      <div class="arac-kayit-sabit" hidden></div>
      <div class="arac-kayit-uzerine arac-not-satiri ${geriAlinabilir ? 'bilgi' : 'uyari'}" hidden>${geriAlinabilir ? BILGI_SVG : UYARI_SVG}<span class="metin"></span></div>
    </div>`);
  const dinleyiciler = [];
  const bildir = () => dinleyiciler.forEach((f) => f());
  const ozgunAd = belge ? dosyaAdi(belge.yol) : '';
  const oneriAd = () => `${guvenliAd(varsayilanAd)}.pdf`;
  let coklu = false;            // birden çok dosya (Ayır): ad dosya adlarının ortak başı
  let uzerineIzinli = !!belge;  // "Üzerine yaz" seçilebilir mi (uzerineKullanilabilir)
  const cikti = ciktiSecici({ pdefe: baglam.pdefe, klasor: '', ad: oneriAd(), diyalogBasligi });
  cikti.onDegisti(bildir);
  const yeniEl = el.querySelector('.arac-kayit-yeni');
  yeniEl.append(cikti.el);
  const sabit = sabitCiktiSatiri(baglam.pdefe);
  const sabitEl = el.querySelector('.arac-kayit-sabit');
  sabitEl.append(sabit.el);
  const kisitEl = el.querySelector('.arac-kayit-kisit');
  const notEl = el.querySelector('.arac-kayit-uzerine');
  const uzerineMetin = notEl.querySelector('.metin');
  if (belge) {
    sabit.yaz(belge.yol);
    if (geriAlinabilir) uzerineMetin.textContent = tus(`Belgeye uygulanıp "${ozgunAd}" dosyasına kaydedilir; Ctrl+Z ile geri alınabilir.`);
    else uzerineMetin.append(Object.assign(document.createElement('b'), { textContent: 'Geri alınamaz:' }), ` sonuç "${ozgunAd}" dosyasının yerine yazılır, yedek alınmaz.`);
    notEl.title = belge.yol;
  }
  const uzerineIpucu = !belge ? ''
    : geriAlinabilir ? tus(`Değişiklik açık belgeye uygulanıp "${ozgunAd}" dosyasına kaydedilir; Ctrl+Z ile geri alınabilir`)
      : `Sonuç "${ozgunAd}" dosyasının yerine kaydedilir; yedek alınmaz, geri alınamaz`;
  const secim = segmentliSecim({
    etiket: 'Kayıt biçimi', deger: belge ? kip : 'yeni', sinif: 'arac-kayit-secim',
    secenekler: [
      { id: 'yeni', etiket: 'Yeni belge olarak kaydet', baslik: 'Sonuç ayrı bir PDF dosyası olarak kaydedilir; özgün dosya değişmez' },
      { id: 'uzerine', etiket: 'Üzerine yaz', baslik: uzerineIpucu },
    ],
    degisti: () => { goster(); bildir(); },
  });
  el.querySelector('.arac-kayit-kip').replaceWith(secim.el);
  /** Üzerine yazmada dosya satırının yerinde yazılacak dosya (soluk) ve not durur; satır kaybolmaz. */
  function goster() {
    const uzerine = secim.deger() === 'uzerine';
    yeniEl.hidden = uzerine;
    sabitEl.hidden = !uzerine;
    notEl.hidden = !uzerine;
  }
  goster();
  const kipAyarla = (k) => { secim.sec(k); goster(); bildir(); };
  function uzerineKullanilabilir(evet, neden = '') {
    if (!belge) { evet = false; neden = neden || belgesizNeden; }
    uzerineIzinli = evet;
    secim.etkin('uzerine', evet);
    secim.dugme('uzerine').title = evet ? uzerineIpucu : neden;
    kisitEl.textContent = evet ? '' : neden;
    kisitEl.hidden = evet || !neden;
    if (!evet && secim.deger() === 'uzerine') kipAyarla('yeni');
  }
  if (!belge) uzerineKullanilabilir(false);
  /**
   * Kayıt özgün dosyanın yerine mi: "Üzerine yaz" seçili ya da (üzerine yazma seçilebilirken) yeni belgenin adı ve klasörü özgün dosyanın
   * kendisi (Değiştir'de seçildi ya da kutuya yazıldı; denetle önce "zaten var" diye sorar). Üzerine yazma seçilemiyorsa (ayırmada birden
   * çok dosya, Birleştir'de açık PDF listede değil ya da okunamadı) aynı ad olağan bir yeni belge hedefidir.
   */
  const uzerineMi = () => !!belge && uzerineIzinli && (secim.deger() === 'uzerine' || (!coklu && yolAyni(cikti.yol(), belge.yol)));
  /**
   * Varsayılan klasör ve ad (kullanıcı elle değiştirmediyse): tek dosyada klasörde boş bir ad ("Sıkıştırılmış (2)"), birden çok dosyada
   * aracın adı olduğu gibi (dosya adları sayfa numarasıyla ayrılır; var olanı araç yönetir). Son çağrının sonucu geçerlidir (hazir).
   */
  let adSayac = 0;
  let adSozu = Promise.resolve();
  function adYenile() {
    const n = ++adSayac;
    adSozu = (async () => {
      if (cikti.elleDegisti()) return;
      const klasor = cikti.klasor() || await varsayilanCiktiKlasoru(baglam);
      let ad = oneriAd();
      if (!coklu) { try { ad = await bosAdBul(baglam.pdefe, klasor, ad); } catch { /* varsayılan ad */ } }
      if (n === adSayac && !cikti.elleDegisti()) cikti.ayarla(klasor, ad);
    })();
    return adSozu;
  }
  adYenile();
  /** Araç birden çok dosya üretecekse true (Ayır); değişince varsayılan ad yeniden önerilir. */
  function cokluAyarla(evet) {
    evet = !!evet;
    if (evet === coklu) return;
    coklu = evet;
    adYenile();
  }
  /** Yeni belge adını aynı klasörde boş bir ada çevirir ("… (2).pdf"); elle yazılmış ad da değiştirilir. */
  async function baskaAdSec(temel) {
    const klasor = cikti.klasor() || await varsayilanCiktiKlasoru(baglam);
    const ad = temel || cikti.ad() || oneriAd();
    let bos = ad;
    try { bos = await bosAdBul(baglam.pdefe, klasor, ad); } catch { /* ad olduğu gibi */ }
    cikti.ayarla(klasor, bos);
  }

  /**
   * İşlemden önce: yeni belgede ad boş mu, klasör var mı, hedef zaten var mı (sorulur); yazılacak dosya (üzerine yazmada özgün dosya, yeni
   * belgede var olan hedef) başka bir programda kilitli ya da salt okunur mu (uzun işlem bittikten sonra hata vermemek için).
   * Döner: 'devam' | 'vazgec' | Error (hataSor'a verilir).
   */
  async function denetle() {
    await adSozu;
    const uzerine = uzerineMi();
    // Yeni belge (adı ve klasörü özgün dosyanın kendisi olsa da: üzerine yazma ancak sorulup onaylanınca); "Üzerine yaz" seçiliyse sorulmaz
    if (secim.deger() !== 'uzerine') {
      if (!cikti.ad()) { baglam.bildir('Dosya adı girin.'); cikti.odakla(); return 'vazgec'; }
      if (!cikti.klasor()) {
        const k = await baglam.pdefe.cagir('dosya:klasorSec', { baslik: diyalogBasligi }).catch(() => null);
        if (!k) return 'vazgec';
        cikti.ayarla(k, null, { elle: true });
      }
      if (coklu) return 'devam';   // dosya adlarını ve var olan dosyaları araç kendisi yönetir
      if (!(await varOlanaYazmaSor(baglam, cikti, cikti.yol()))) return 'vazgec';
      if (!uzerine && !(await baglam.pdefe.cagir('dosya:varMi', cikti.yol()).catch(() => false))) return 'devam';
    }
    const erisim = await yazilabilirMi(baglam, uzerine ? belge.yol : cikti.yol());
    if (erisim.okunur && erisim.yazilir) return 'devam';
    // Yeni belgede var olan hedefin okunamaması da yazılamamasıdır ("okunamadı" yalnızca özgün dosya için kullanılır)
    return new Error(erisim.saltOkunur ? 'Dosya salt okunur' : !erisim.okunur && uzerine ? 'Dosya okunamadı' : 'Dosya yazılamadı');
  }

  /**
   * Kayıt dosya kilidi ya da salt okunur öznitelik yüzünden olmayınca (işlem öncesi denetimde ya da çekirdekte) sorar; hiçbir dosya
   * değişmemiştir. İleti yazılamayan dosyayı adıyla söyler: üzerine yazmada özgün dosya, yeni belgede hedef dosya. Özgün dosya
   * okunamadıysa (yeni belge de üretilemez) yalnızca Yeniden dene / Vazgeç. "Yeni belge olarak kaydet" kaydetme seçimini değiştirir,
   * "Başka adla kaydet" hedefi aynı klasörde boş bir ada çevirir. Döner: true (yeniden denensin) | false (vazgeçildi).
   */
  async function hataSor(e) {
    const m = e?.message || String(e || '');
    const uzerine = uzerineMi();
    const okunamadi = /okunamadı/i.test(m);
    const saltOkunur = /salt okunur/i.test(m);
    const hedefAd = dosyaAdi(uzerine ? belge.yol : coklu ? '' : cikti.yol());
    // Çekirdeğin iletisi okunamayan dosyanın adıyla biter ("…: Ek.pdf"; Birleştir'de listedeki herhangi bir dosya olabilir)
    const hatadakiAd = (/: ([^:\\/]+\.pdf)\s*$/i.exec(m) || [])[1];
    const programda = 'başka bir programda (örneğin bir PDF okuyucuda) açık olabilir';
    // macOS (0.2.1): dosyaları başka programlar kilitlemez ve Gezgin'in Salt okunur özniteliği yoktur. Yazılamayan dosyada neden yazma izni
    // ya da Finder'ın Kilitli işaretidir (çekirdek ikisini de "salt okunur" sayar), okunamayanda okuma izni: "programı kapatıp yeniden
    // deneyin" işe yaramazdı. İletiler Finder'ın Bilgi Al penceresini anlatır (uygulama.js belgeKaydet'teki gibi); Windows metinleri değişmedi
    const finderda = 'Finder\'da dosyayı seçip Dosya › Bilgi Al\'dan';
    const kilitliMac = `${finderda} "Kilitli" işaretini kaldırıp ya da Paylaşma ve İzinler bölümünden yazma izni verip`;
    let mesaj, ayrinti, dugmeler, yanitlar;
    if (okunamadi) {
      mesaj = `"${hatadakiAd || ozgunAd || hedefAd}" okunamadı.`;
      ayrinti = MAC
        ? `Dosyayı okuma izni olmayabilir. Hiçbir dosya değiştirilmedi.\n\n${finderda} Paylaşma ve İzinler bölümünü denetleyip yeniden deneyin.`
        : `Dosya ${programda}. Hiçbir dosya değiştirilmedi.\n\nDosyayı kullanan programı kapatıp yeniden deneyin.`;
      dugmeler = ['Yeniden dene', 'Vazgeç']; yanitlar = ['tekrar', 'vazgec'];
    } else if (!uzerine && coklu) {
      // Birden çok dosyada araç var olan dosyaların üzerine yazmaz (ada "(2)" ekler): yazılamayan, seçilen klasördür
      mesaj = 'Dosyalar kaydedilemedi.';
      ayrinti = MAC
        ? 'Seçilen klasöre yazılamadı; klasöre yazma izni olmayabilir ya da içindeki bir dosya kilitli olabilir. Var olan hiçbir dosya değiştirilmedi.\n\nBaşka bir klasör seçebilir ya da Finder\'da klasörün Bilgi Al penceresinden Paylaşma ve İzinler bölümünü denetleyip yeniden deneyebilirsiniz.'
        : `Seçilen klasöre yazılamadı; klasör salt okunur olabilir ya da bir dosya ${programda}. Var olan hiçbir dosya değiştirilmedi.\n\nBaşka bir klasör seçebilir ya da yeniden deneyebilirsiniz.`;
      dugmeler = ['Yeniden dene', 'Vazgeç']; yanitlar = ['tekrar', 'vazgec'];
    } else if (uzerine) {
      mesaj = saltOkunur ? `"${hedefAd}" salt okunur olduğu için üzerine yazılamadı.` : `"${hedefAd}" dosyasının üzerine yazılamadı.`;
      if (MAC) {
        ayrinti = `${saltOkunur ? 'Dosyaya yazma izni yok ya da dosya kilitli.' : 'Dosyaya yazma izni olmayabilir ya da dosya kilitli olabilir.'} Özgün dosya değiştirilmedi.\n\n${kilitliMac} yeniden deneyebilir ya da sonucu yeni bir belge olarak kaydedebilirsiniz.`;
      } else {
        ayrinti = saltOkunur
          ? 'Dosyanın Salt okunur özniteliği açık. Özgün dosya değiştirilmedi.\n\nDosya Gezgini\'nde dosyanın Özellikler penceresinden Salt okunur işaretini kaldırıp yeniden deneyebilir ya da sonucu yeni bir belge olarak kaydedebilirsiniz.'
          : `Dosya ${programda}. Özgün dosya değiştirilmedi.\n\nDosyayı kullanan programı kapatıp yeniden deneyebilir ya da sonucu yeni bir belge olarak kaydedebilirsiniz.`;
      }
      dugmeler = ['Yeni belge olarak kaydet', 'Yeniden dene', 'Vazgeç']; yanitlar = ['yeni', 'tekrar', 'vazgec'];
    } else {
      mesaj = saltOkunur ? `"${hedefAd}" salt okunur olduğu için kaydedilemedi.` : `"${hedefAd}" kaydedilemedi.`;
      if (MAC) {
        ayrinti = `${saltOkunur ? 'Aynı adlı var olan dosyaya yazma izni yok ya da dosya kilitli' : 'Aynı adlı var olan dosyaya yazma izni olmayabilir ya da dosya kilitli olabilir'}; o dosya değiştirilmedi.\n\nSonucu başka bir adla kaydedebilir ya da ${kilitliMac} yeniden deneyebilirsiniz.`;
      } else {
        ayrinti = saltOkunur
          ? 'Aynı adlı var olan dosyanın Salt okunur özniteliği açık; o dosya değiştirilmedi.\n\nSonucu başka bir adla kaydedebilir ya da Salt okunur işaretini kaldırıp yeniden deneyebilirsiniz.'
          : `Aynı adlı var olan dosya ${programda}; o dosya değiştirilmedi.\n\nSonucu başka bir adla kaydedebilir ya da dosyayı kullanan programı kapatıp yeniden deneyebilirsiniz.`;
      }
      dugmeler = ['Başka adla kaydet', 'Yeniden dene', 'Vazgeç']; yanitlar = ['baskaAd', 'tekrar', 'vazgec'];
    }
    const { secim: yanit } = await baglam.mesajKutusu({ tur: 'warning', mesaj, ayrinti, dugmeler, varsayilan: 0, iptal: dugmeler.length - 1 });
    const sonuc = yanitlar[yanit] || 'vazgec';
    if (sonuc === 'vazgec') return false;
    if (sonuc === 'yeni') {
      kipAyarla('yeni');
      if (coklu || !cikti.elleDegisti()) await adYenile();
      else if (yolAyni(cikti.yol(), belge.yol)) await baskaAdSec(oneriAd());   // elle seçilen ad özgün dosyanın kendisiydi
    } else if (sonuc === 'baskaAd') await baskaAdSec();
    return true;
  }

  return {
    el, cikti, adYenile, kipAyarla, uzerineMi, uzerineKullanilabilir, cokluAyarla, denetle, hataSor,
    /** Varsayılan ad önerisi bitti (son adYenile). */
    get hazir() { return adSozu; },
    kip: () => secim.deger(),
    coklu: () => coklu,
    /** Üzerine yazmada özgün dosya; yeni belgede hedef dosya (birden çok dosyada ortak ad, klasörü cikti.klasor()). */
    hedef: () => (secim.deger() === 'uzerine' && belge ? belge.yol : cikti.yol()),
    onDegisti: (cb) => dinleyiciler.push(cb),
  };
}

/** Yolu bir sekmede açık olan belge (yoksa null). baglam.belgeler() sekmelerin belgelerini verir. */
export function acikBelge(baglam, yol) {
  const liste = typeof baglam.belgeler === 'function' ? baglam.belgeler() : [];
  return liste.find((b) => yolAyni(b.yol, yol)) || null;
}

/**
 * Yeni belge çıktısı var olan bir dosyanın üzerine gelecekse sorar. Farklı kaydet diyaloğunda Windows zaten sorduysa ya da bu hedef
 * araçta onaylandıysa ("Yeniden dene") yeniden sormaz; hedef PDEfe'de kaydedilmemiş değişiklikli bir sekmede açıksa Windows sormuş
 * olsa da sorar (kayıttan sonra sekme yeni haliyle yeniden açılır, o değişiklikler atılır). Onaylanınca cikti.onayla(hedef).
 * Döner: true (devam) | false (vazgeç).
 */
export async function varOlanaYazmaSor(baglam, cikti, hedef) {
  if (cikti?.onaylandi?.(hedef)) return true;
  const acik = acikBelge(baglam, hedef);
  if (cikti?.onayli?.(hedef) && !acik?.degisti) return true;
  if (!(await baglam.pdefe.cagir('dosya:varMi', hedef))) return true;
  const sekme = !acik ? ''
    : acik.degisti ? '\n\nDosya PDEfe\'de açık ve kaydedilmemiş değişiklikleri var: kayıttan sonra sekmesi yeni haliyle yeniden açılır, bu değişiklikler atılır.'
      : '\n\nDosya PDEfe\'de açık; kayıttan sonra sekmesi yeni haliyle yeniden açılır.';
  const { secim } = await baglam.mesajKutusu({ tur: 'warning', mesaj: `"${dosyaAdi(hedef)}" zaten var.`, ayrinti: `${hedef}\n\nVar olan dosyanın yerine kaydedilsin mi?${sekme}`, dugmeler: ['Üzerine yaz', 'Vazgeç'], varsayilan: 1, iptal: 1 });
  if (secim !== 0) return false;
  cikti?.onayla?.(hedef);
  return true;
}

/**
 * Dosya yazılabilir mi (başka program kilitlemiş mi, salt okunur mu)? Çekirdek yanıt veremezse yazılabilir sayılır.
 * Döner: {okunur, yazilir, saltOkunur}
 */
export async function yazilabilirMi(baglam, yol) {
  try {
    const r = await baglam.cekirdek('dosya_erisim', { yol });
    return r ? { okunur: r.okunur !== false, yazilir: r.yazilir !== false, saltOkunur: r.saltOkunur === true } : { okunur: true, yazilir: true, saltOkunur: false };
  } catch { return { okunur: true, yazilir: true, saltOkunur: false }; }
}

/**
 * Üzerine yazılan dosyanın açık sekmesini diskteki güncel haliyle yeniden açar (aynı sayfada). Sekmede kaydedilmemiş değişiklik
 * varsa önce sorar (sormadan: kullanıcı yazmadan önce onayladı). Döner: 'yenilendi' | 'yok' (sekme zaten kapalı) | false (vazgeçildi
 * ya da kapatılamadı).
 * @param {{soruAyrintisi?:string, ac?:boolean, sormadan?:boolean}} [s] ac=false: yalnızca kapatır (çağıran açar)
 */
export async function sekmeyiYenile(baglam, belge, { soruAyrintisi, ac = true, sormadan = false } = {}) {
  if (!belge || (belge.el && !belge.el.isConnected)) return 'yok';
  if (typeof baglam.belgeKapat !== 'function') return false;
  if (belge.degisti && !sormadan) {
    const { secim } = await baglam.mesajKutusu({ tur: 'warning', mesaj: `"${belge.ad}" belgesinde kaydedilmemiş değişiklikler var.`, ayrinti: soruAyrintisi || 'Belge diskteki güncel haliyle yeniden açılırsa bu değişiklikler atılır.', dugmeler: ['Değişiklikleri at ve yeniden aç', 'Vazgeç'], varsayilan: 1, iptal: 1 });
    if (secim !== 0) return false;
  }
  const sayfa = belge.gorunum?.gecerli || 1;
  if (!(await baglam.belgeKapat(belge.id, { zorla: true }))) return false;
  if (ac) await baglam.dosyaAc(belge.yol, { arkaPlanda: false, sayfa, yenile: true });   // yenile: açılış sekmesinin yerine açılmaz
  return 'yenilendi';
}

/**
 * Yeni belge çıktısını gösterir. Hedef bir sekmede zaten açıksa (var olan dosyanın üzerine yazıldı) o sekme diskteki yeni haliyle
 * yeniden açılır: yoksa sekme eski xref'leri tutan bayat içeriği gösterir ve sonraki kaydı bozar (0.1.1 bayat sekme mantığı;
 * kaydedilmemiş değişiklik varsa varOlanaYazmaSor'da onaylanmadıysa sorulur). Değilse yeni sekmede açılır.
 * Döner: true | false (sekme dosyanın önceki halini gösteriyor; kullanıcıya bildirildi).
 */
export async function ciktiyiAc(baglam, hedef, { cikti, soruAyrintisi } = {}) {
  const acik = acikBelge(baglam, hedef);
  const r = acik ? await sekmeyiYenile(baglam, acik, { soruAyrintisi, sormadan: !!cikti?.onaylandi?.(hedef) }).catch(() => false) : 'yok';
  // yazildi: hedef başka bir PDEfe penceresinde açıksa oradaki sekmesi diskteki yeni hâliyle yenilenir (uygulama.js dosyaAc)
  if (r === 'yok') { await baglam.dosyaAc(hedef, { arkaPlanda: false, yazildi: true }); return true; }
  if (r) return true;
  baglam.bildir(`"${acik.ad}" sekmesi dosyanın önceki halini gösteriyor; notlarda değişiklik yapmadan önce sekmeyi kapatıp yeniden açın.`, 8000);
  return false;
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

/** Sekmedeki sayfa numaraları dosyadakilerle aynı mı (kaydedilmemiş sayfa silme / sıralama / ekleme yok)? Dosya üzerinde çalışan ve
 *  sayfa numarasını sekmedeki gibi alan araçlar (Döndür'ün yeni belgesi, Ayır) uyuşmazlıkta önce kaydettirir. */
export function numaralarDosyaylaAyni(belge) {
  const g = belge?.gorunum;
  if (!belge?.degisti || typeof g?.yapisalKirli !== 'function' || !g.yapisalKirli()) return true;
  const tarif = belgeTarifi(belge);
  return !g.anlik && tarif.every((t, i) => t.kaynak && anaKaynakMi(belge, t.kaynak) && t.sayfa === i + 1)
    && (belge.bilgi?.sayfa == null || tarif.length === belge.bilgi.sayfa);
}
export const NUMARA_UYUSMAZ = 'Sayfa düzeninde kaydedilmemiş değişiklik olduğundan sayfa numaraları dosyadakiyle uyuşmuyor.';

/**
 * Kaydedilmemiş değişiklik varsa kullanıcıya sorar. Dönüş: 'devam' | 'vazgec'.
 * yalnizKaydet: kaydetmeden devam edilemez (örn. sekmedeki sayfa sırası değişti; sayfa numaraları dosyadakiyle uyuşmaz).
 * aciklama: "<işlem> dosyadaki kayıtlı sürüm üzerinde çalışır." cümlesinin yerine (işlem sekmedeki belgeye uygulanıp kaydediliyorsa).
 */
export async function degisiklikleriSor(baglam, belge, islemAdi, { yalnizKaydet = false, neden = '', aciklama = '' } = {}) {
  if (!belge?.degisti) return 'devam';
  const { secim } = await baglam.mesajKutusu({
    mesaj: `"${belge.ad}" belgesinde kaydedilmemiş değişiklikler var.`,
    ayrinti: `${aciklama || `${islemAdi} dosyadaki kayıtlı sürüm üzerinde çalışır.`} ${neden ? neden + ' ' : ''}Önce kaydetmek ister misiniz?`,
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
