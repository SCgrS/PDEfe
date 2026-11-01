// Linux ve macOS paket sınamalarının ortak bölümü (0.3.1): Paketlenmiş uygulamada, CDP ile (test kanalları paketli sürümde yok) 0.3.1'in yeni özellikleri. test/linux_duman.mjs ve
// test/mac_duman.mjs çağırır, denetimler iki sistemde aynı, yalnız sistemin yazı tipleri ve yazı tanıyıcısı ayrılır.
//   Yazdırma     Temiz veri klasöründe ilk Yazdır'da kâğıt A4 (A5 sayfalı belgede de), yazıcı varsa gerçek baskının kâğıdı.
//   Bağlantı     Adlandırılmış hedefli iç bağlantıya gerçek fareyle tıklama: Sayfa değişir, hedef noktası pencerenin üstünde. Başka dosyaya ve programa giden bağlantı açılmaz.
//   Bul          PDF metninde. Taranmış belgede Linux'ta sayaç "taranmış sayfalar aranamadı" der, çekirdek düşmez. macOS'ta gerçek tanıyıcıyla (Vision) bulur, süre sınırlı.
//   Düz form     Türkçe yazı, onay kutusu, seçenek düğmesi, kaydet, kapat, aç. Görünümün yazı tipi sistemin eşi. Karakter sınırı uyarısı. Mavi işaret yok.
//   XFA          "Please wait" yerine form. Yazı, hiza, Enter ve harf basılı tutma, 100.000 karakter yapıştırma, tek satır, Bölüm Ekle ve Sil, kaydet, aç, düz PDF, yazdırma penceresi, Bul,
//                yazı tipi yedeği (CDP'nin çizimde kullanılan yazı tipi bilgisi: Eksik harf başka yazı tipine düşer, görünür).
//   Sağ tık      Form alanında Kes, Kopyala, Yapıştır (yerel menü: gerçek klavyeyle, o.menuTus verilmişse).
//   Kapatma      Formda değişiklikle kapatınca soru, sekme başka pencereye taşınınca değer ve kirli durum.
// Her denetim sonuc(ad, ok, ayrıntı, zorunlu) ile, görüntüler çıktı klasörüne. Ölçü dosyadan bağımsız okunur: test/duman_olc.py. Örnekler: test/duman_ornekleri_uret.py.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (x) => JSON.stringify(x);
const MM = 72 / 25.4;
const KATMAN = '.gorunum:not([hidden]) .xfaLayer';
const TURKCE = 'Çağrı Şişli İğdır ığüşöç ĞÜŞİÖÇ';
const YAZI_METNI = 'Şişli İğdır Çığ Öğüt ĞÜŞİÖÇ ğüşıöç';
const DIS_DOSYA = 'Bu bağlantı başka bir dosyayı ya da programı açtığı için güvenlik nedeniyle açılmadı.';
const PAY = 8;   // sayfayaGit: Hedefin üstünde bırakılan pay (px)
const CUMLE = 'Karakter sınırı olan alana yazılan cümle sözcüklerden oluşur ve yetmiş beş karakteri geçer, fazlası alınmaz.';
const alinmadi = (n) => `Yazının tamamı bu alana sığmadı. ${n.toLocaleString('tr-TR')} karakter alınmadı.`;

// Şablondaki ölçüler (test/xfa_pdf_uret.py SINIR_SABLON). Beklenen satır şablondan okunmaz: floor(iç yükseklik / satır aralığı). null: Kendiliğinden satır aralığı, yazı boyundan
const COK_SATIRLI = [
  { ad: 'IkiSatir', h: 15.875, kenar: 1, aralik: 15, beklenen: 2 },
  { ad: 'UcSatir', h: 20, kenar: 1, aralik: 15, beklenen: 3 },
  { ad: 'Kendi', h: 30, kenar: 1, aralik: null },
  { ad: 'Yasli', h: 20, kenar: 1, aralik: 15, beklenen: 3 },
  { ad: 'DikeyOrta', h: 20, kenar: 1, aralik: 15, beklenen: 3 },
  { ad: 'Bosluklu', h: 25, kenar: 1, aralik: 15, ust: 4, beklenen: 4 },
  { ad: 'UstBaslikli', h: 25, kenar: 1, aralik: 15, baslik: 6, beklenen: 3 },
];
const beklenenSatir = (a, lh) => Math.max(1, Math.floor(((a.h - 2 * a.kenar - (a.baslik || 0)) * MM - (a.ust || 0) + 0.02) / (a.aralik || lh)));

/** Uzun deneme yazısı: Paragraflar, Türkçe harfler, satır sonları. */
function uzunYazi(boy) {
  const S = 'Mahkemece verilen kararın gerekçesi hukuka uygun değildir ve başvurucunun iddiaları incelenmemiştir. Şikâyet konusu işlem İĞŞÇÖÜ ığşçöü bakımından değerlendirilmelidir.';
  let s = '', i = 0;
  while (s.length < boy) s += `${++i}. ${S}${i % 3 ? ' ' : '\n'}`;
  return s.slice(0, boy);
}

/** Sayfaya yüklenen yardımcılar (test/senaryo45, 47, 48, 53'teki ölçüler, paketli sürümde test kancasız). */
const YARDIMCI = `window.__d = {
  b: () => window.__pdefe.aktif(),
  g: () => window.__pdefe.aktif().gorunum,
  bekle: (ms) => new Promise((c) => setTimeout(c, ms)),
  async durgun() { const b = this.b(); for (let i = 0; i < 400; i++) { if (b && !b.xfa.mesgul && !b.xfa.yapiSuruyor) break; await this.bekle(50); } await b?.xfa.bekle(); await this.bekle(80); return true; },
  alan(ad, i = 0) { return document.querySelectorAll('${KATMAN} [xfaname="' + ad + '"]')[i] || null; },
  denetim(ad, i = 0) { return this.alan(ad, i)?.querySelector('input, textarea, select, button') || null; },
  async yer(ad, i = 0, sayfa = null) {
    const g = this.g();
    for (let k = 0; k < 100; k++) {
      const el = this.denetim(ad, i);
      if (!el) { if (sayfa) g.sayfayaGit(sayfa); await this.bekle(120); continue; }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      await this.bekle(150);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 30), l: r.left, t: r.top, w: r.width, h: r.height };
    }
    return null;
  },
  /** Alandaki yazının gerçek satır sayısı (üretim aynasından bağımsız: Alanın kopyası aynı yerde, yüksekliği 0). */
  satirlar(el) {
    const k = el.cloneNode(false);
    k.value = el.value;
    const st = getComputedStyle(el);
    k.style.setProperty('field-sizing', 'fixed'); k.style.height = '0'; k.style.minHeight = '0'; k.style.maxHeight = 'none'; k.style.flex = '0 0 auto'; k.style.position = 'absolute'; k.style.visibility = 'hidden'; k.style.width = st.width;
    k.style.paddingTop = k.style.paddingBottom = '0';
    k.removeAttribute('data-xv'); k.removeAttribute('data-xa');
    el.parentElement.append(k);
    const n = k.scrollHeight / parseFloat(st.lineHeight);
    k.remove();
    return Math.round(n);
  },
  durum(ad, i = 0) {
    const el = this.denetim(ad, i), st = getComputedStyle(el);
    return { uz: el.value.length, deger: el.value, sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth, st: el.scrollTop, sl: el.scrollLeft, tasiyor: el.classList.contains('xfa-tasiyor'), lh: parseFloat(st.lineHeight), satir: el.tagName === 'TEXTAREA' ? this.satirlar(el) : 1, cubuk: el.offsetWidth - el.clientWidth, hiza: st.textAlign, aile: st.fontFamily };
  },
  /** Gerçek yapıştırma olayı (olayın içinde: Uzun yazı için bütün alanlarda hızlı. Biri gerçek panodan gerçek tuşla da yapılır). */
  yapistir(metin, el = document.activeElement) { const dt = new DataTransfer(); dt.setData('text/plain', metin); const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }); el.dispatchEvent(e); return e.defaultPrevented; },
  numaralar() { return [...document.querySelectorAll('${KATMAN} [xfaname="Numara"]')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()); },
  yigin() { return this.b().yigin.yigin.slice(0, this.b().yigin.konum).map((k) => k.ad + (k.ayrinti ? ' ' + k.ayrinti : '')); },
  bildirimleriIzle() { if (!window.__bildirimIzi) { const el = document.getElementById('bildirim'); window.__bildirimIzi = new MutationObserver(() => { if (!el.hidden && el.textContent) (window.__bildirimler ||= []).push(el.textContent); }); window.__bildirimIzi.observe(el, { childList: true, characterData: true, subtree: true }); } window.__bildirimler = []; return true; },
  async bildirimler() { await this.bekle(0); const l = window.__bildirimler || []; window.__bildirimler = []; return l; },
  async kayitBitsin() { await this.bekle(30); for (let i = 0; i < 800; i++) { if (!this.b().kaydediliyor) break; await this.bekle(40); } await this.bekle(120); return true; },
  // ---- düz form alanı
  oge(ad, { sayfa = null, acik = null } = {}) { const g = this.g(); for (const s of g.sayfalar) { if (sayfa && g.idx(s) + 1 !== sayfa) continue; for (const o of s._formOgeler?.values() || []) if (o.a.ad === ad && (acik == null || o.a.acik === acik)) return o; } return null; },
  async formYer(ad, secenek = {}) {
    const g = this.g();
    for (let i = 0; i < 80; i++) {
      let o = this.oge(ad, secenek);
      if (!o) { await this.bekle(100); continue; }
      const r0 = o.el.getBoundingClientRect(), k = g.kaydirici.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
      if (cy < k.top + 30 || cy > k.bottom - 30 || cx < k.left + 20 || cx > k.right - 30) { o.el.scrollIntoView({ block: 'center', inline: 'center' }); await this.bekle(250); continue; }
      const st = g.kaydirici.scrollTop; await this.bekle(80);
      if (g.kaydirici.scrollTop !== st) continue;
      o = this.oge(ad, secenek);
      const r = o.el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height };
    }
    return null;
  },
  formDeger(ad) { const b = this.b(); for (const k of b.formlar.alanlar.values()) if (k.ad === ad) return b.formlar.simdi(k); return undefined; },
  async sakin(ad, secenek = {}) { for (let i = 0; i < 100; i++) { const o = this.oge(ad, secenek); if (o && !o.el.classList.contains('bekliyor')) return true; await this.bekle(50); } return false; },
  formStil(ad, secenek = {}) { const o = this.oge(ad, secenek), c = getComputedStyle(o.el); return { zemin: c.backgroundColor, resim: c.backgroundImage, golge: c.boxShadow, cizgi: c.outlineStyle, imlec: c.cursor }; },
  // ---- iç bağlantı
  async hazir(no, adet) { const g = this.g(); for (let i = 0; i < 100; i++) { const s = g.sayfalar[no - 1]; if (s && s.el.querySelectorAll('.baglanti').length >= adet) return true; await this.bekle(100); } return false; },
  async baglantiYeri(no, k) {
    const g = this.g();
    for (let d = 0; d < 30; d++) {
      const st = g.kaydirici.scrollTop;
      await this.bekle(120);
      if (g.kaydirici.scrollTop !== st) continue;
      const el = g.sayfalar[no - 1].el.querySelectorAll('.baglanti')[k];
      if (!el) { await this.bekle(100); continue; }
      const kr = g.kaydirici.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.top < kr.top + 40 || r.bottom > kr.bottom - 40) { g.kaydirici.scrollTop += (r.top + r.height / 2) - (kr.top + kr.height / 2); continue; }
      if (r.left < kr.left + 4 || r.left + 60 > kr.right - 20) { g.kaydirici.scrollLeft += r.left - kr.left - 40; continue; }
      const x = Math.round(r.left + Math.min(40, r.width / 2)), y = Math.round(r.top + r.height / 2);
      if (!document.elementFromPoint(x, y)?.classList.contains('baglanti')) continue;
      return { x, y, title: el.title, imlec: getComputedStyle(el).cursor };
    }
    return null;
  },
  async konum(no, Y) {
    const g = this.g(), s = g.sayfalar[no - 1], p = await g.sayfaAl(no - 1), kr = g.kaydirici.getBoundingClientRect(), sr = s.el.getBoundingClientRect(), k = g.olcek * 96 / 72, kd = g.kaydirici;
    return { gecerli: g.gecerli, view: [...p.view], ust: Y == null ? null : sr.top + Y * k - kr.top, altSinir: kd.scrollTop >= kd.scrollHeight - kd.clientHeight - 1 };
  },
  // ---- yazı tipi yedeği
  tasmalar() {
    const tasiyor = (k) => k.scrollHeight > k.clientHeight + 1 || k.scrollWidth > k.clientWidth + 1;
    const l = [];
    for (const el of document.querySelectorAll('${KATMAN} .xfaRich, ${KATMAN} .xfaCaption')) { const kutu = el.classList.contains('xfaRich') ? el.parentElement : el; if (kutu?.clientHeight && tasiyor(kutu)) l.push(el.textContent.slice(0, 40)); }
    for (const el of document.querySelectorAll('${KATMAN} input[data-xv], ${KATMAN} textarea[data-xv]')) if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) l.push('alan: ' + el.value.slice(0, 40));
    return l;
  },
  /** Yazısı doğrudan kendisinde olan öğeler ve denetimler işaretlenir: CDP'nin yazı tipi bilgisi (getPlatformFontsForNode) öğenin altında iki kat iner. */
  yaziOgeleri(ad) {
    const kok = this.alan(ad), l = [];
    const yuru = (el) => {
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || el.matches('input, textarea')) {
        const k = 'fo' + (window.__foSayac = (window.__foSayac || 0) + 1);
        el.setAttribute('data-fo', k);
        l.push({ k, yazi: (el.value ?? el.textContent).slice(0, 40) });
      }
      for (const c of el.children) yuru(c);
    };
    if (kok) yuru(kok);
    return l;
  },
  /** Alandaki yazının kesilip kesilmediğini ölçmek için: Yazının aynı yazı tipinde, aynı büyüklükte, kesilmeyen kopyası (ekranda sabit). Döner: Alanın ve kopyanın görüntü kutuları. */
  kopyaKur(el, metin, ic = 0, oran = 1) {
    document.querySelector('.__kopya')?.remove();
    el.scrollIntoView({ block: 'center', inline: 'start' });
    if (el.offsetHeight * (el.getBoundingClientRect().width / el.offsetWidth) > innerHeight / 3) { el.scrollIntoView({ block: 'start', inline: 'start' }); this.g().kaydirici.scrollTop -= 200; }   // uzun alan: İlk satır görünsün
    const st = getComputedStyle(el), r = el.getBoundingClientRect(), olcek = r.width / el.offsetWidth, k = document.createElement('div');
    k.className = '__kopya';
    k.textContent = metin;
    Object.assign(k.style, { position: 'fixed', left: '20px', top: '100px', zIndex: 99999, background: '#fff', color: '#000', whiteSpace: 'pre', lineHeight: '2', padding: '0 8px', fontFamily: st.fontFamily, fontSize: parseFloat(st.fontSize) * olcek + 'px', fontWeight: st.fontWeight, fontStyle: st.fontStyle, textRendering: 'geometricPrecision' });
    document.body.append(k);
    const u = k.getBoundingClientRect(), g = Math.min(r.width * oran, innerWidth - r.left - 30), b = Math.min(r.height, parseFloat(st.lineHeight) * olcek * 1.8 + parseFloat(st.paddingTop) * olcek);   // çok satırlıda ilk satır
    return { olcek, alan: { x: r.left + ic, y: r.top + ic, width: g - 2 * ic, height: b - 2 * ic }, kopya: { x: u.left, y: u.top, width: u.width, height: u.height } };
  },
  kuculenler() { return [...document.querySelectorAll('${KATMAN} .xfaRich, ${KATMAN} .xfaCaption')].filter((e) => e.style.zoom).map((e) => e.style.zoom + ' ' + e.textContent.slice(0, 24)); },
};
if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); }
true`;

/** PDF'in uygulamadan bağımsız ölçümü (test/duman_olc.py). */
export function pdfOlc(komut, pdf, gorselOnEki = null, python = 'python') {
  const r = spawnSync(python, ['-X', 'utf8', '-I', path.join(KOK, 'test', 'duman_olc.py'), komut, pdf, ...(gorselOnEki ? [gorselOnEki] : [])], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 120000 });
  if (r.status !== 0) throw new Error(`duman_olc ${komut}: ${(r.stderr || r.error?.message || '').slice(-400)}`);
  return JSON.parse(r.stdout);
}

const TUSLAR = { Tab: [9, 'Tab'], Enter: [13, 'Enter'], Escape: [27, 'Escape'], Delete: [46, 'Delete'], ArrowDown: [40, 'ArrowDown'], F3: [114, 'F3'] };

/**
 * o: { sonuc(ad, ok, ayrinti, zorunlu), kosul(f, sure, aralik), bekle(ms), degerlendir(ifade), gonder(method, params), ekranGoruntusu(ad), cagir(kanal, ...a),
 *      ORNEKLER, CIKTI, VERI, platform: 'linux' | 'darwin', python?: Python programı, sonBelge?: Bitince etkin yapılacak dosya,
 *      gercekYaz?(metin), gercekTus?(...tuslar), gercekTekrar?(tus, kez), gercekTikla?(x, y, { dugme }), menuTus?(...tuslar): Sistemin gerçek klavyesi ve faresi (yoksa CDP),
 *      pdfKlasoru?: Gerçek baskının düştüğü klasör, ekranKok?(ad): Bütün ekranın görüntüsü (yerel menü CDP görüntüsüne girmez), yaziTipleri: aile → beklenen yazı tipi, formYazisi: Görünümde beklenen yazı tipi (düzenli ifade) }
 */
export async function yeniOzellikleriSina(o) {
  const { sonuc, kosul, bekle, gonder, ekranGoruntusu, cagir, ORNEKLER, CIKTI, VERI, platform } = o;
  const degerlendir = (ifade, sure = 120000) => {
    let z;
    return Promise.race([o.degerlendir(ifade), new Promise((_, r) => { z = setTimeout(() => r(new Error('zaman aşımı: ' + ifade.slice(0, 100))), sure); })]).finally(() => clearTimeout(z));
  };
  const H = (ifade) => degerlendir(`(async () => { const H = window.__d; return ${ifade}; })()`);
  const ozet = JSON.parse(fs.readFileSync(path.join(ORNEKLER, 'ozet.json'), 'utf8'));
  const olc = (komut, pdf, onEk) => pdfOlc(komut, pdf, onEk ? path.join(CIKTI, onEk) : null, o.python);
  const acilanlar = new Set();
  let kopyaNo = 0;
  const kopya = (ad) => { const y = path.join(VERI, `${++kopyaNo}-${ad}`); fs.copyFileSync(path.join(ORNEKLER, ad), y); acilanlar.add(y); return y; };
  const komut = (k) => degerlendir(`(window.__pdefe.komutCalistir(${J(k)}), true)`);

  // ---- girdi: Sistemin gerçek klavyesi ve faresi varsa o (Linux'ta xdotool), yoksa CDP
  const yazCdp = (metin) => gonder('Input.insertText', { text: metin });
  const yaz = async (metin) => { if (o.gercekYaz) await o.gercekYaz(metin); else await yazCdp(metin); await bekle(40); };
  const tusCdp = async (ad, degistirici = 0) => {
    const [vk, code] = TUSLAR[ad];
    for (const type of ['rawKeyDown', 'keyUp']) await gonder('Input.dispatchKeyEvent', { type, key: ad, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: degistirici });
  };
  const GERCEK_AD = { Enter: 'Return', ArrowDown: 'Down' };
  const tus = async (ad) => { if (o.gercekTus) await o.gercekTus(GERCEK_AD[ad] || ad); else await tusCdp(ad); await bekle(40); };
  const tusTut = async (key, code, vk, metin, kez) => {
    for (let i = 0; i < kez; i++) await gonder('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: metin, unmodifiedText: metin, autoRepeat: i > 0 });
    await gonder('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  const enterTut = (kez) => tusTut('Enter', 'Enter', 13, '\r', kez);
  const harfTut = (h, kez) => tusTut(h, 'Key' + h.toUpperCase(), h.toUpperCase().charCodeAt(0), h, kez);
  const tiklaCdp = async (x, y, { dugme = 'left' } = {}) => {
    const bit = dugme === 'right' ? 2 : 1;
    await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await gonder('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: dugme, buttons: bit, clickCount: 1 });
    await gonder('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: dugme, buttons: 0, clickCount: 1 });
  };
  const tikla = async (x, y, secenek = {}) => { if (o.gercekTikla) await o.gercekTikla(x, y, secenek); else await tiklaCdp(x, y, secenek); await bekle(60); };

  // ---- XFA ve form alanı
  const belgeAc = async (yol, { xfa = false, z = 1 } = {}) => degerlendir(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); if (!b) return false; for (let i = 0; i < 200 && !document.querySelector(${J(xfa ? KATMAN : '.gorunum:not([hidden]) canvas')}); i++) await window.__d.bekle(50); ${xfa ? `b.gorunum.zoomAyarla(${z});` : ''} b.gorunum.sayfayaGit(1); await window.__d.bekle(500); return true; })()`);
  const formAc = async (yol) => { await belgeAc(yol); await H(`(async () => { for (let i = 0; i < 100; i++) { const s = H.g().sayfalar[0]; if (s?._formOgeler?.size) break; await H.bekle(100); } await H.bekle(300); return true; })()`); };
  const belgeKapat = (yol, zorla = true) => degerlendir(`(async () => { const p = window.__pdefe; for (const b of [...p.belgeler.values()]) if (b.yol === ${J(yol)}) await p.belgeKapat(b.id, { zorla: ${zorla} }); return true; })()`);
  const yer = (ad, i = 0, sayfa = null) => degerlendir(`window.__d.yer(${J(ad)}, ${i}, ${J(sayfa)})`);
  const tiklaAd = async (ad, i = 0, sayfa = null) => { const p = await yer(ad, i, sayfa); if (!p) throw new Error('Öğe bulunamadı: ' + ad); await tikla(p.x, p.y); return p; };
  const durum = (ad, i = 0) => degerlendir(`window.__d.durum(${J(ad)}, ${i})`);
  const durgun = () => degerlendir(`window.__d.durgun()`);
  const yapistir = (metin) => degerlendir(`window.__d.yapistir(${J(metin)})`);
  const bosalt = async (ad, i = 0) => { await tiklaAd(ad, i); await degerlendir(`(() => { const e = window.__d.denetim(${J(ad)}, ${i}); e.focus(); e.select(); return true; })()`); await tusCdp('Delete'); await bekle(30); };
  const izle = () => degerlendir(`window.__d.bildirimleriIzle()`);
  const bildirimler = () => degerlendir(`window.__d.bildirimler()`);
  const sinirTamam = (d, n) => d.satir === n && d.sh <= d.ch && d.st === 0 && d.cubuk === 0;
  const formTikla = async (ad, secenek = {}) => { const p = await degerlendir(`window.__d.formYer(${J(ad)}, ${J(secenek)})`); if (!p) throw new Error('Alan bulunamadı: ' + ad); await tikla(p.x, p.y); await bekle(100); return p; };
  const formDeger = (ad) => degerlendir(`window.__d.formDeger(${J(ad)})`);
  const kaydet = async () => { const r = await degerlendir(`(async () => { const b = window.__d.b(); const s = await window.__pdefe.belgeKaydet(b); await window.__d.kayitBitsin(); return { sonuc: s, degisti: b.degisti }; })()`); return r; };
  const dialogKapat = () => degerlendir(`(() => { document.querySelector('.yazdir-diyalog [data-id=iptal]')?.click(); document.querySelector('.mesaj-kutusu button.ikincil:last-of-type')?.click(); return true; })()`).catch(() => {});
  /** Yazıyı yazar: Sistemin klavyesi harfleri yanlış verirse (ör. sanal ekranda klavye düzeni) uyarıp CDP'yle yazar, ürünün denetimleri sürer. */
  const turkceYaz = async (metin, oku) => {
    await yaz(metin);
    if (!o.gercekYaz) return;
    const v = await oku();
    sonuc(`Gerçek klavyeyle Türkçe harfler: ${metin.slice(0, 20)}…`, v === metin, J(v), false);
    if (v !== metin) { await degerlendir(`document.activeElement.select?.()`); await yazCdp(metin); await bekle(40); }
  };

  await degerlendir(YARDIMCI);
  const bolum = async (ad, f) => {
    await degerlendir(`window.__hatalar.length = 0`);
    try {
      await f();
    } catch (e) {
      sonuc(`${ad}: Sınama yarıda kesildi`, false, e?.message || e);
      await ekranGoruntusu(`hata-${ad.replace(/\W+/g, '-')}.png`);
      await dialogKapat();
    }
    const h = await degerlendir(`window.__hatalar.splice(0)`).catch(() => ['okunamadı']);
    sonuc(`${ad}: Sayfada hata yok`, !h.filter((x) => !/ResizeObserver/.test(x)).length, h.join(' | '));
    await degerlendir(`(async () => { delete window.__pdefeOtoYanit; const p = window.__pdefe; for (const b of [...p.belgeler.values()]) if (${J([...acilanlar])}.includes(b.yol)) await p.belgeKapat(b.id, { zorla: true }); return true; })()`).catch((e) => sonuc(`${ad}: Belgeler kapanmadı`, false, e?.message));
  };

  // ================================================================== ilk yazdırma: Kâğıt A4
  await bolum('İlk yazdırma', async () => {
    const kayit = await degerlendir(`window.__pdefe.ayar()?.yazdirma ?? null`);
    const y = kopya('a5.pdf');
    await belgeAc(y);
    await komut('dosya.yazdir');
    const d = await kosul(() => degerlendir(`(() => { const d = document.querySelector('.yazdir-diyalog'), r = d?.querySelector('.yazdir-onizleme-sayfa'); return d && r?.naturalWidth > 0 ? { kagit: d.querySelector('[name=kagit]').value, ozet: d.querySelector('.yazdir-ozet')?.textContent, gen: r.naturalWidth, yuk: r.naturalHeight } : null; })()`), 20000);
    sonuc('İlk yazdırma: Temiz veri klasöründe kâğıt A4 (A5 sayfalı belgede de, "Belgeye göre" değil)', d?.kagit === 'A4' && !kayit?.kagit && !kayit?.kagitSecildi, J({ ...d, kayit }));
    await ekranGoruntusu('yazdir-ilk.png');
    const hazir = o.pdfKlasoru ? await kosul(() => degerlendir(`(() => { const d = document.querySelector('.yazdir-diyalog'); return d && d.querySelector('[name=yazici]').options.length > 0 && !d.querySelector('[data-id=yazdir]').disabled; })()`), 15000) : false;
    if (hazir) {
      const once = fs.existsSync(o.pdfKlasoru) ? fs.readdirSync(o.pdfKlasoru) : [];
      await degerlendir(`document.querySelector('.yazdir-diyalog [data-id=yazdir]').click(), true`);
      const yeni = await kosul(() => (fs.existsSync(o.pdfKlasoru) ? fs.readdirSync(o.pdfKlasoru).find((f) => !once.includes(f)) : null), 60000, 1000);
      await bekle(1500);   // yazıcı dosyayı kapatsın
      const s = yeni ? olc('duz', path.join(o.pdfKlasoru, yeni), 'yazdir-ilk-baski').sayfalar : [];
      sonuc('İlk yazdırma: Gerçek baskıda A5 sayfa A4 kâğıtta (595 × 842 pt)', s.length === 1 && Math.abs(s[0].g - 595) <= 3 && Math.abs(s[0].b - 842) <= 3, J({ yeni, boyut: s.map((x) => [x.g, x.b]) }));
      const k = await degerlendir(`window.__pdefe.ayar()?.yazdirma ?? null`);
      sonuc('İlk yazdırma: Kâğıda dokunulmadı, seçim hatırlanmaz', k?.kagitSecildi === false, J(k));
    } else {
      sonuc('İlk yazdırma: Gerçek baskının kâğıdı', null, 'yazıcı yok');
      await degerlendir(`document.querySelector('.yazdir-diyalog [data-id=iptal]')?.click(), true`);
    }
    await kosul(() => degerlendir(`!document.querySelector('.yazdir-ortusu')`), 15000);
  });

  // ================================================================== iç bağlantı
  await bolum('İç bağlantı', async () => {
    const b = ozet.baglanti;
    const y = kopya('ic_baglantilar.pdf');
    await belgeAc(y);
    await izle();
    await H(`(H.g().zoomModuAyarla('genislik'), H.bekle(500))`);
    const satir = (a) => b.satirlar.find((s) => s.anahtar === a);
    const sira = (a) => { const s = satir(a); return b.satirlar.filter((t) => t.sayfa === s.sayfa).indexOf(s); };
    const adet = b.satirlar.filter((s) => s.sayfa === 1).length;
    for (const a of ['ad-agac', 'ad-sozluk', 'ad-eylem', 'xyz']) {
      await H(`(H.g().sayfayaGit(1), H.bekle(300))`);
      sonuc(`İç bağlantı ${a}: Katman çizildi`, await H(`H.hazir(1, ${adet})`));
      const p = await H(`H.baglantiYeri(1, ${sira(a)})`);
      const h = b.hedefler[a];
      sonuc(`İç bağlantı ${a}: El imleci, ipucu "Sayfa ${h.sayfa}"`, p?.imlec === 'pointer' && p?.title === `Sayfa ${h.sayfa}`, J(p));
      if (!p) continue;
      await tikla(p.x, p.y);
      await kosul(() => H(`H.g().gecerli === ${h.sayfa}`), 4000);
      await bekle(300);
      const k0 = await H(`H.konum(${h.sayfa})`);
      const Y = h.ust == null ? 0 : k0.view[3] - h.ust;
      const k = await H(`H.konum(${h.sayfa}, ${Y})`);
      sonuc(`İç bağlantı ${a}: Gerçek fareyle tıklandı, sayfa ${h.sayfa}, hedef noktası pencerenin üstünde`, k.gecerli === h.sayfa && (Math.abs(k.ust - PAY) <= 2 || (k.altSinir && k.ust > PAY)), J({ gecerli: k.gecerli, ust: k.ust, Y }));
      if (a === 'ad-agac') await ekranGoruntusu('baglanti.png');
    }
    for (const a of ['gotor', 'launch']) {
      await H(`(H.g().sayfayaGit(1), H.bekle(300))`);
      await bildirimler();
      const p = await H(`H.baglantiYeri(1, ${sira(a)})`);
      if (p) await tikla(p.x, p.y);
      await bekle(400);
      const bl = await bildirimler();
      sonuc(`İç bağlantı ${a}: Açılmaz, güvenlik bildirimi, sayfa değişmez`, !!p && bl.includes(DIS_DOSYA) && (await H(`H.g().gecerli`)) === 1, J(bl));
    }
  });

  // ================================================================== Bul: PDF metni, taranmış belge
  await bolum('Bul', async () => {
    const y = kopya('arama.pdf');
    await belgeAc(y);
    const ac = async () => {
      await degerlendir(`document.activeElement?.blur?.(); window.__d.g().kaydirici?.focus?.(); true`);
      if (o.gercekTus && platform !== 'darwin') await o.gercekTus('ctrl+f'); else await komut('duzen.bul');
      await kosul(() => degerlendir(`window.__pdefe.arama.acik && document.activeElement?.id === 'bul-girdi'`), 5000);
      await degerlendir(`document.getElementById('bul-girdi').select(), true`);
    };
    const sayac = () => degerlendir(`document.getElementById('bul-sayac').textContent`);
    await ac();
    const t0 = Date.now();
    await yaz('tutanak');
    await bekle(1200);   // arama yazmayı bekler: Önceki aramanın sayacı sayılmasın
    if (platform === 'linux') {
      const s = await kosul(async () => { const m = await sayac(); return /aranamadı$/.test(m) ? m : null; }, 30000);
      sonuc('Bul: PDF metninde iki eşleşme, sayaçta "taranmış sayfalar aranamadı"', s === '1 / 2 · taranmış sayfalar aranamadı', s || await sayac());
      const r = await degerlendir(`({ ipucu: document.getElementById('bul-sayac').title, secili: document.querySelectorAll('.textLayer .highlight.selected').length })`);
      sonuc('Bul: İpucu nedeni söyler, seçili vurgu metin katmanında', /yazı tanıyıcı olmadığı/.test(r.ipucu) && r.secili === 1, J(r));
      await ekranGoruntusu('bul-pdf.png');
      await tusCdp('Enter');
      const s2 = await kosul(async () => { const m = await sayac(); return m.startsWith('2 / 2') ? m : null; }, 5000);
      sonuc('Bul: Enter sonraki eşleşmeye (8. sayfa)', !!s2 && await kosul(() => H(`H.g().gecerli === 8`), 4000), J({ s2, gecerli: await H(`H.g().gecerli`) }));
      await ac();
      await yaz('örneği');   // yalnız taranmış sayfaların görselinde
      await bekle(1200);
      const s3 = await kosul(async () => { const m = await sayac(); return /aranamadı$/.test(m) ? m : null; }, 30000);
      sonuc('Bul: Yalnız taranmış sayfada olan sözcük: Bulunamadı, nedeni sayaçta', s3 === 'Bulunamadı · taranmış sayfalar aranamadı', `${s3 || await sayac()} · kutuda: ${await degerlendir(`document.getElementById('bul-girdi').value`)}`);
      const ping = await cagir('cekirdek:cagir', 'ping', {});
      sonuc('Bul: Çekirdek düşmedi', ping?.ok === true, J(ping));
    } else {
      const SURE = 180000, YAVAS = 60000;
      const s = await kosul(async () => { const m = await sayac(); return /^\d+ \/ \d+$/.test(m) ? m : null; }, SURE, 500);
      const sure = Date.now() - t0, n = s ? +s.split('/')[1] : 0;
      sonuc(`Bul: Gerçek tanıyıcı taranmış sayfalarda buldu (PDF metninde 2, toplam ${n})`, n > 2, s || await sayac());
      sonuc('Bul: 12 sayfalık belgede bütün eşleşmeler (10 sayfa, 11 eşleşme beklenir, tanıyıcıya bağlı)', n >= 10, s || '', false);
      sonuc(`Bul: Tanıma ${Math.round(sure / 1000)} sn (sınır ${YAVAS / 1000} sn)`, sure <= YAVAS, s || '', false);
      await ekranGoruntusu('bul-tarama.png');
    }
    await tusCdp('Escape');
    sonuc('Bul: Esc kapatır', !!(await kosul(() => degerlendir(`!window.__pdefe.arama.acik`), 3000)));
  });

  // ================================================================== düz form alanı
  await bolum('Düz form', async () => {
    const y = kopya('alanlar.pdf');
    await formAc(y);
    await izle();
    await H(`(H.g().zoomAyarla(1.5), H.bekle(600))`);
    // Mavi işaret yok (fare üstünde değilken ve üstündeyken): Zemin saydam, gölge yok
    let st = await H(`H.formStil('ad', { sayfa: 1 })`);
    sonuc('Düz form: Mavi işaret yok (zemin saydam, gölge yok)', st.zemin === 'rgba(0, 0, 0, 0)' && st.resim === 'none' && st.golge === 'none', J(st));
    await formTikla('ad', { sayfa: 1 });
    const adOku = () => degerlendir(`document.activeElement?.value`);
    await turkceYaz(TURKCE, adOku);
    await ekranGoruntusu('form-duzenlenirken.png');
    await tus('Tab');
    await H(`H.sakin('ad', { sayfa: 1 })`);
    sonuc('Düz form: Türkçe yazı alana girdi (Tab ile uygulandı)', (await formDeger('ad')) === TURKCE, J(await formDeger('ad')));
    sonuc('Düz form: Tab sonraki alana geçti', await degerlendir(`document.activeElement === window.__d.oge('unvan')?.denetim`));
    await tusCdp('Escape');
    await formTikla('baslik');
    await turkceYaz('Ortalı başlık ŞĞİ', adOku);
    const ortalama = await degerlendir(`getComputedStyle(document.activeElement).textAlign`);
    await tus('Tab');
    await H(`H.sakin('baslik')`);
    sonuc('Düz form: Ortalı alana Türkçe yazı, düzenleyici ortalı', (await formDeger('baslik')) === 'Ortalı başlık ŞĞİ' && ortalama === 'center', J({ d: await formDeger('baslik'), ortalama }));
    await tusCdp('Escape');
    await formTikla('onay1');
    sonuc('Düz form: Onay kutusuna tıklandı: Yes', (await formDeger('onay1')) === 'Yes', J(await formDeger('onay1')));
    await formTikla('secim', { acik: 'B' });
    sonuc('Düz form: Seçenek düğmesine tıklandı: B', (await formDeger('secim')) === 'B', J(await formDeger('secim')));
    // Karakter sınırlı alan: Gerçek pano ve gerçek tuşla yapıştırma
    await formTikla('kisa');
    await bildirimler();
    const METIN = 'Beşten uzun yazı';
    if (o.gercekTus && platform !== 'darwin') {
      await cagir('pano:metin', METIN);
      await bekle(200);
      await o.gercekTus('ctrl+v');
    } else await yapistir(METIN);
    await bekle(200);
    const v = await degerlendir(`document.activeElement?.value`);
    const bl = await bildirimler();
    sonuc('Düz form: Karakter sınırlı alana (en çok 5) uzun yapıştırma: Sığan kısım, uyarı alınmayan sayıyla', v.length > 0 && v.length <= 5 && METIN.startsWith(v) && bl.length === 1 && bl[0] === alinmadi(METIN.length - v.length), J({ v, bl }));
    await tus('Tab');
    await H(`H.sakin('kisa')`);
    await tusCdp('Escape');
    await bekle(200);
    await ekranGoruntusu('form-dolu.png');
    const dur = await H(`({ odak: !!document.activeElement?.closest?.('.form-alan'), ad: H.formStil('ad', { sayfa: 1 }) })`);
    sonuc('Düz form: Doldurulmuş alanda da mavi işaret yok', dur.ad.zemin === 'rgba(0, 0, 0, 0)' && dur.ad.golge === 'none', J(dur));
    // Kaydet: Değerler dosyada, görünümün yazı tipi sistemin eşi, görünüm sayfaya işlenince Türkçe yazı okunur
    const k = await kaydet();
    sonuc('Düz form: Kaydedildi, belge temiz', k.sonuc && !k.degisti, J(k));
    const f = olc('form', y, 'form-kayitli');
    const alan = (ad) => f.alanlar.find((a) => a.ad === ad);
    sonuc('Düz form: Dosyadaki değerler (yazı, onay, seçenek), onarım gerekmiyor', alan('ad')?.deger === TURKCE && alan('baslik')?.deger === 'Ortalı başlık ŞĞİ' && alan('onay1')?.durum === '/Yes' && f.alanlar.find((a) => a.ad === 'secim' && a.durum === '/B') && !f.onarildi,
      J({ ad: alan('ad'), onay: alan('onay1'), secim: f.alanlar.filter((a) => a.ad === 'secim').map((a) => a.durum), onarildi: f.onarildi }));
    sonuc(`Düz form: Görünümün yazı tipi sistemin eşi (${o.formYazisi})`, new RegExp(o.formYazisi).test((alan('ad')?.fontlar || []).join(' ')) && new RegExp(o.formYazisi).test((alan('baslik')?.fontlar || []).join(' ')), J(alan('ad')?.fontlar));
    sonuc('Düz form: Görünüm sayfaya işlenince (başka okuyucu gibi) Türkçe yazı okunur', f.metin.includes(TURKCE) && f.metin.includes('Ortalı başlık ŞĞİ'), f.metin.slice(0, 300));
    // Kapat, aç
    await belgeKapat(y, false);
    sonuc('Düz form: Kaydedilmiş belge sormadan kapandı', await degerlendir(`![...window.__pdefe.belgeler.values()].some((b) => b.yol === ${J(y)})`));
    await formAc(y);
    await H(`(H.g().zoomAyarla(1.5), H.bekle(600))`);
    const r = { ad: await formDeger('ad'), baslik: await formDeger('baslik'), onay: await formDeger('onay1'), secim: await formDeger('secim'), kisa: await formDeger('kisa'), degisti: await H(`H.b().degisti`) };
    sonuc('Düz form: Yeniden açınca değerler yerinde, belge temiz', r.ad === TURKCE && r.baslik === 'Ortalı başlık ŞĞİ' && r.onay === 'Yes' && r.secim === 'B' && r.kisa === v && !r.degisti, J(r));
    await ekranGoruntusu('form-yeniden.png');
  });

  // ================================================================== XFA formu: Alanlar, bölüm, kayıt, Bul, yazdırma
  await bolum('XFA', async () => {
    const y = kopya('xfa.pdf');
    await belgeAc(y, { xfa: true });
    await izle();
    const ilk = await H(`({ xfa: H.g().xfa, sayfa: H.g().sayfaSayisi, katman: !!document.querySelector('${KATMAN}'), metin: document.querySelector('${KATMAN}')?.textContent || '', numara: H.numaralar(), degisti: H.b().degisti, tuvalYazi: document.body.innerText.includes('Please wait') })`);
    sonuc('XFA: "Please wait" yerine form sayfası çizildi', ilk.xfa && ilk.katman && ilk.sayfa === 1 && !/Please wait/i.test(ilk.metin) && !ilk.tuvalYazi && ilk.metin.includes('DENEME XFA FORMU İĞŞÇÖÜ ığşçöü') && !ilk.degisti, J({ ...ilk, metin: ilk.metin.slice(0, 120) }));
    sonuc('XFA: Alt bilgide "Sayfa 1 / 1"', J(ilk.numara) === J(['Sayfa 1 / 1']), J(ilk.numara));
    await ekranGoruntusu('xfa-acilis.png');
    await tiklaAd('AdSoyad');
    await turkceYaz(TURKCE, () => degerlendir(`window.__d.denetim('AdSoyad').value`));
    await tus('Tab');
    await bekle(150);
    await tiklaAd('Onay');
    await degerlendir(`window.__d.denetim('Sehir').focus(), true`);
    await tusCdp('ArrowDown');
    await tusCdp('Tab');
    await bekle(200);
    let r = await H(`({ ad: H.denetim('AdSoyad').value, onay: H.denetim('Onay').checked, sehir: H.denetim('Sehir').value, yigin: H.yigin(), degisti: H.b().degisti })`);
    sonuc('XFA: Yazı alanına Türkçe yazı, onay kutusu, açılır liste', r.ad === TURKCE && r.onay && !!r.sehir && r.degisti, J(r));
    sonuc('XFA: Komutlar "Form: <alanın açıklaması>"', J(r.yigin) === J(['Form: Adı ve soyadı s. 1', 'Form: Bilgilerin doğruluğunu onaylıyorum s. 1', 'Form: Şehir s. 1']), J(r.yigin));
    // Bölüm ekle ve sil
    await tiklaAd('SatirEkle', 0);
    await durgun();
    sonuc('XFA: Satır Ekle: 2 sayfa, yazılan değer yerinde', (await H(`H.g().sayfaSayisi`)) === 2 && (await H(`H.denetim('AdSoyad').value`)) === TURKCE, J(await H(`H.g().sayfaSayisi`)));
    await H(`(H.g().sayfayaGit(2), H.bekle(500))`);
    sonuc('XFA: Sayfa numaraları "Sayfa 1 / 2", "Sayfa 2 / 2"', J(await H(`H.numaralar()`)) === J(['Sayfa 1 / 2', 'Sayfa 2 / 2']), J(await H(`H.numaralar()`)));
    await tiklaAd('Aciklama', 1, 2);
    await yazCdp('Birinci satır Ş');
    await enterTut(1);
    await yazCdp('İkinci satır ğ');
    await tusCdp('Tab');
    await bekle(200);
    const IKI = 'Birinci satır Ş\nİkinci satır ğ';
    sonuc('XFA: İkinci bölümün çok satırlı alanı', (await H(`H.denetim('Aciklama', 1).value`)) === IKI, J(await H(`H.denetim('Aciklama', 1).value`)));
    await tiklaAd('SatirEkle', 1, 2);
    await durgun();
    sonuc('XFA: İkinci Satır Ekle: 3 sayfa', (await H(`H.g().sayfaSayisi`)) === 3);
    await bildirimler();
    await tiklaAd('SatirEkle', 2, 3);
    await durgun();
    sonuc('XFA: Sınırda (en çok 3): Uyarı, sayfa eklenmez', (await H(`H.g().sayfaSayisi`)) === 3 && (await bildirimler()).includes('Bu bölüm en çok 3 kez eklenebilir.'));
    await tiklaAd('SatirSil', 2, 3);
    await durgun();
    sonuc('XFA: Son Satırı Sil: 2 sayfa, değer yerinde', (await H(`H.g().sayfaSayisi`)) === 2 && (await H(`H.denetim('Aciklama', 1).value`)) === IKI, J(await H(`H.g().sayfaSayisi`)));
    await ekranGoruntusu('xfa-dolu.png');
    // Bul: Etikette, alan değerinde
    const ara = async (metin) => {
      await komut('duzen.bul');
      await kosul(() => degerlendir(`window.__pdefe.arama.acik && document.activeElement?.id === 'bul-girdi'`), 5000);
      await degerlendir(`document.getElementById('bul-girdi').select(), true`);
      await yaz(metin);
      await bekle(1200);
      return degerlendir(`({ sayac: document.getElementById('bul-sayac').textContent, kutu: document.getElementById('bul-girdi').value, secili: document.querySelectorAll('.xfaLayer .highlight.selected').length, alanda: document.querySelectorAll('.xfa-alan-metni .highlight').length })`);
    };
    const a1 = await ara('doğruluğunu');
    sonuc('XFA: Bul etikette (Türkçe harf): 1 / 1, seçili vurgu katmanda', a1.sayac === '1 / 1' && a1.secili === 1, J(a1));
    await ekranGoruntusu('xfa-bul.png');
    const a2 = await ara('Birinci satır');
    sonuc('XFA: Bul alanın değerinde (2. sayfa): 1 / 1, vurgu alanın üstünde', a2.sayac === '1 / 1' && a2.alanda === 1, J(a2));
    await tusCdp('Escape');
    await bekle(200);
    // Kaydet (aynı dosya), aç
    const k = await kaydet();
    sonuc('XFA: Kaydedildi (aynı dosya), belge temiz', k.sonuc && !k.degisti, J(k));
    const f = olc('xfa', y);
    sonuc('XFA: Değerler dosyada', f.degerler.AdSoyad?.[0] === TURKCE && f.degerler.Aciklama?.length === 2 && f.degerler.Aciklama[1] === IKI && !!f.degerler.Sehir?.[0] && !f.onarildi, J(f));
    const once = await H(`({ ad: H.denetim('AdSoyad').value, onay: H.denetim('Onay').checked, sehir: H.denetim('Sehir').value })`);
    await belgeKapat(y, false);
    await belgeAc(y, { xfa: true });
    await H(`(H.g().sayfayaGit(2), H.bekle(500))`);
    await yer('Aciklama', 1, 2);
    r = await H(`({ ad: H.denetim('AdSoyad').value, onay: H.denetim('Onay').checked, sehir: H.denetim('Sehir').value, ac: H.denetim('Aciklama', 1).value, sayfa: H.g().sayfaSayisi, degisti: H.b().degisti })`);
    sonuc('XFA: Yeniden açınca değerler ekranda dosyadakiyle aynı, belge temiz', r.ad === once.ad && r.onay === once.onay && r.sehir === once.sehir && r.ac === IKI && r.sayfa === 2 && !r.degisti, J(r));
    // Düz PDF ve yazdırma penceresi
    const d = await degerlendir(`(async () => { const d = await window.__d.b().xfa.duzPdf(); return { yol: d.yol, sayfa: d.sayfa, tasan: d.tasan }; })()`);
    const duzYol = path.join(CIKTI, 'xfa-duz.pdf');
    fs.copyFileSync(d.yol, duzYol);
    const m = olc('duz', duzYol, 'xfa-duz');
    const metin = m.sayfalar.map((s) => s.satir.map((x) => x.t).join('\n')).join('\n');
    sonuc('XFA: Düz PDF (gizli pencere): 2 sayfa A4', d.sayfa === 2 && m.sayfalar.length === 2 && m.sayfalar.every((s) => Math.abs(s.g - 595) <= 2 && Math.abs(s.b - 842) <= 2), J({ d, boyut: m.sayfalar.map((s) => [s.g, s.b]) }));
    sonuc('XFA: Düz PDF\'te değerler, Türkçe harfler, sayfa numaraları', metin.includes(TURKCE) && metin.includes('Birinci satır Ş') && metin.includes('İkinci satır ğ') && metin.includes('Sayfa 1 / 2') && metin.includes('DENEME XFA FORMU İĞŞÇÖÜ ığşçöü'), metin.slice(0, 400));
    sonuc('XFA: Formun düğmeleri basılmıyor', !/Satır Ekle|Son Satırı Sil|Formu Kaydet|Mesajı Gizle/.test(metin), metin.slice(0, 200));
    sonuc('XFA: Düz PDF\'in yazı tipleri (bilgi)', null, m.fontlar.join(', '));
    await komut('dosya.yazdir');
    const p = await kosul(() => degerlendir(`(() => { const d = document.querySelector('.yazdir-diyalog'), r = d?.querySelector('.yazdir-onizleme-sayfa'); return d && r?.naturalWidth > 0 ? { sayfa: d.querySelector('.yazdir-sayfa-no')?.textContent, ozet: d.querySelector('.yazdir-ozet')?.textContent, kagit: d.querySelector('[name=kagit]').value, uyari: d.querySelector('.yazdir-uyari')?.hidden ? '' : d.querySelector('.yazdir-uyari')?.textContent } : null; })()`), 20000);
    sonuc('XFA: Yazdırma penceresi açıldı, ön izleme, A4, uyarı yok', p?.kagit === 'A4' && !p?.uyari && /\b2\b/.test(p?.sayfa || ''), J(p));
    await ekranGoruntusu('xfa-yazdir.png');
    const hazir = o.pdfKlasoru ? await kosul(() => degerlendir(`(() => { const d = document.querySelector('.yazdir-diyalog'); return d && d.querySelector('[name=yazici]').options.length > 0 && !d.querySelector('[data-id=yazdir]').disabled; })()`), 15000) : false;
    if (hazir) {
      const once = fs.existsSync(o.pdfKlasoru) ? fs.readdirSync(o.pdfKlasoru) : [];
      await degerlendir(`document.querySelector('.yazdir-diyalog [data-id=yazdir]').click(), true`);
      const yeni = await kosul(() => (fs.existsSync(o.pdfKlasoru) ? fs.readdirSync(o.pdfKlasoru).find((f) => !once.includes(f)) : null), 60000, 1000);
      await bekle(2000);
      const s = yeni ? olc('duz', path.join(o.pdfKlasoru, yeni), 'xfa-baski').sayfalar : [];
      sonuc('XFA: Gerçek baskı: 2 sayfa A4', s.length === 2 && s.every((x) => Math.abs(x.g - 595) <= 3 && Math.abs(x.b - 842) <= 3), J({ yeni, boyut: s.map((x) => [x.g, x.b]) }));
    } else {
      sonuc('XFA: Gerçek baskı', null, 'yazıcı yok');
      await degerlendir(`document.querySelector('.yazdir-diyalog [data-id=iptal]')?.click(), true`);
    }
    await kosul(() => degerlendir(`!document.querySelector('.yazdir-ortusu')`), 15000);
  });

  // ================================================================== XFA formu: Alanın sınırı
  await bolum('XFA sınır', async () => {
    const y = kopya('xfa-sinir.pdf');
    await belgeAc(y, { xfa: true });
    await izle();
    // Enter basılı: Beklenen satırda durur
    for (const a of COK_SATIRLI) {
      await tiklaAd(a.ad);
      await enterTut(12);
      await bekle(30);
      const d = await durum(a.ad);
      const b = beklenenSatir(a, d.lh);
      if (a.beklenen) sonuc(`XFA sınır ${a.ad}: Şablondan hesaplanan beklenen ${a.beklenen} satır`, b === a.beklenen, b);
      sonuc(`XFA sınır ${a.ad}: Enter basılı: ${b} satırda durur, kaydırma yok`, sinirTamam(d, b) && d.deger.split('\n').length === b && !d.tasiyor, J({ b, ...d, deger: undefined }));
      await bosalt(a.ad);
    }
    if (o.gercekTekrar) {
      await tiklaAd('IkiSatir');
      await o.gercekTekrar('Return', 15);
      await bekle(200);
      const d = await durum('IkiSatir');
      sonuc('XFA sınır IkiSatir: Gerçek klavyede Enter tekrarı: 2 satırda durur', sinirTamam(d, 2) && d.deger.split('\n').length === 2, J({ ...d, deger: undefined }));
      await bosalt('IkiSatir');
    }
    // Harf basılı: Çok satırlı ve tek satırlı alan
    await tiklaAd('IkiSatir');
    await harfTut('x', 260);
    let d = await durum('IkiSatir');
    sonuc('XFA sınır IkiSatir: Harf basılı: Yazma durur, 2 satır, kaydırma yok', sinirTamam(d, 2) && d.uz > 100 && d.uz < 260, J({ ...d, deger: undefined }));
    await bosalt('IkiSatir');
    for (const ad of ['TekKapali', 'TekSagda', 'YanBaslikli']) {
      await tiklaAd(ad);
      await harfTut('x', 110);
      d = await durum(ad);
      sonuc(`XFA sınır ${ad}: Tek satırlı alan genişlikte durur, kaymaz`, d.uz > 5 && d.uz < 110 && d.sw <= d.cw && d.sl === 0 && !d.tasiyor, J({ ...d, deger: undefined }));
      await bosalt(ad);
    }
    if (o.gercekYaz) {
      await tiklaAd('UcSatir');
      await o.gercekYaz('Satir sonu gelince yazi durur ve ekran kaymaz. '.repeat(14));
      await bekle(300);
      d = await durum('UcSatir');
      sonuc('XFA sınır UcSatir: Gerçek klavyeyle uzun yazı: En çok 3 satır, kaydırma yok', d.satir <= 3 && d.sh <= d.ch && d.st === 0 && d.uz > 60, J({ ...d, deger: undefined }));
      await bosalt('UcSatir');
    }
    // 100.000 karakter yapıştırma: Kaç karakter alınmadığını söyler
    const UZUN = uzunYazi(100000);
    const say = (s) => Array.from(s).length;
    await bildirimler();
    const degerler = {};
    for (const a of COK_SATIRLI.filter((x) => x.beklenen)) {
      await tiklaAd(a.ad);
      const t0 = Date.now();
      const iptal = await yapistir(UZUN);
      const sure = Date.now() - t0;
      await bekle(30);
      d = await durum(a.ad);
      const bl = await bildirimler();
      const beklenenUyari = alinmadi(say(UZUN) - say(d.deger));
      sonuc(`XFA sınır ${a.ad}: 100.000 karakter yapıştırma: En çok ${a.beklenen} satır, kaydırma yok, ${sure} ms`, iptal && d.satir <= a.beklenen && d.sh <= d.ch && d.st === 0 && d.uz > 0 && !d.tasiyor && sure < 3000, J({ ...d, deger: undefined, sure }));
      sonuc(`XFA sınır ${a.ad}: Uyarı bir kez, alınmayan sayı doğru (${beklenenUyari})`, bl.length === 1 && bl[0] === beklenenUyari, J(bl));
      sonuc(`XFA sınır ${a.ad}: Yazının başı aynı, sözcük ortasından kesilmez`, UZUN.startsWith(d.deger) && /\s/.test(UZUN[d.uz] ?? ' '), J({ son: d.deger.slice(-20), sonraki: UZUN.slice(d.uz, d.uz + 10) }));
      degerler[a.ad] = d.deger;
    }
    for (const ad of ['TekKapali', 'TekSagda']) {
      await tiklaAd(ad);
      await yapistir(UZUN);
      await bekle(30);
      d = await durum(ad);
      const bl = await bildirimler();
      sonuc(`XFA sınır ${ad}: 100.000 karakter: Genişliği geçmez, uyarı bir kez`, d.uz > 0 && d.sw <= d.cw && d.sl === 0 && !d.tasiyor && bl.length === 1 && bl[0] === alinmadi(say(UZUN) - say(d.deger)), J({ ...d, deger: undefined, bl }));
      degerler[ad] = d.deger;
    }
    await tiklaAd('Sinirli75');
    await yapistir(CUMLE);
    d = await durum('Sinirli75');
    let bl = await bildirimler();
    sonuc('XFA sınır Sinirli75: En çok 75 karakter, sözcük sınırında, uyarı alınmayan sayıyla', d.uz <= 75 && d.uz > 60 && CUMLE.startsWith(d.deger) && /\s/.test(CUMLE[d.uz]) && bl.length === 1 && bl[0] === alinmadi(CUMLE.length - d.uz), J({ d: d.deger, bl }));
    degerler.Sinirli75 = d.deger;
    await tiklaAd('Hucre10');
    await yapistir('1234 5678 9012 3456 7890');
    d = await durum('Hucre10');
    bl = await bildirimler();
    sonuc('XFA sınır Hucre10: Hücre sayısı kadar, kalanı söylenir', d.uz === 10 && bl.length === 1 && bl[0].includes(' 14 karakter'), J({ d: d.deger, bl }));
    degerler.Hucre10 = d.deger;
    // Gerçek pano ve gerçek tuşla yapıştırma (Linux: Chromium'un kendi panosu üstünden X seçimi)
    if (o.gercekTus && platform !== 'darwin') {
      await cagir('pano:metin', UZUN);
      await bekle(300);
      await tiklaAd('Kendi');
      await o.gercekTus('ctrl+v');
      await bekle(800);
      d = await durum('Kendi');
      bl = await bildirimler();
      sonuc('XFA sınır Kendi: Gerçek pano ve gerçek Ctrl+V ile 100.000 karakter: Sığan kısım, kaydırma yok, uyarı alınmayan sayıyla', d.uz > 0 && d.sh <= d.ch && d.st === 0 && UZUN.startsWith(d.deger) && bl.length === 1 && bl[0] === alinmadi(say(UZUN) - say(d.deger)), J({ ...d, deger: undefined, bl }));
      degerler.Kendi = d.deger;
    }
    // Şablondaki hiza
    d = await durum('TekSagda');
    sonuc('XFA sınır TekSagda: Şablondaki sağa hiza uygulanıyor', d.hiza === 'right', d.hiza);
    await ekranGoruntusu('xfa-sinir-dolu.png');
    // Bölüm Ekle ve Sil (düğmeler 1. sayfada, ikinci örnek 2. sayfaya düşer)
    await tusCdp('Tab');
    const ornek = () => H(`(H.g().sayfayaGit(2), await H.bekle(500), H.g().sayfalar[1].el.querySelectorAll('[xfaname="YTek"]').length)`);
    await tiklaAd('SinirEkle', 0, 1);
    await durgun();
    sonuc('XFA sınır: Bölüm Ekle: Komut, değerler yerinde', (await H(`H.yigin().at(-1)`)) === 'Form: Bölüm Ekle' && (await H(`H.denetim('Sinirli75').value`)) === degerler.Sinirli75, J(await H(`H.yigin().at(-1)`)));
    const ilkOrnek = await ornek();
    sonuc('XFA sınır: Bölüm Ekle: İkinci örnek 2. sayfada', ilkOrnek === 1, J(ilkOrnek));
    const sonYTek = (i = ilkOrnek - 1) => `H.g().sayfalar[1].el.querySelectorAll('[xfaname="YTek"]')[${i}]?.querySelector('input')`;
    const pt = await H(`(() => { const e = ${sonYTek()}; e.scrollIntoView({ block: 'center' }); return H.bekle(150).then(() => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); })()`);
    await tikla(pt.x, pt.y);
    await yazCdp('İkinci bölüm Şğı');
    await tusCdp('Tab');
    await bekle(150);
    await tiklaAd('SinirEkle', 0, 1);
    await durgun();
    sonuc('XFA sınır: Yeniden Bölüm Ekle: Üçüncü örnek 2. sayfada', (await ornek()) === 2, J(await ornek()));
    await tiklaAd('SinirEkle', 0, 1);
    await durgun();
    sonuc('XFA sınır: Sınırda (en çok 3): Uyarı', (await bildirimler()).includes('Bu bölüm en çok 3 kez eklenebilir.'));
    await tiklaAd('SinirSil', 0, 1);
    await durgun();
    sonuc('XFA sınır: Bölüm Sil: Son eklenen gider, önceki değer yerinde', (await ornek()) === 1 && (await H(`${sonYTek()}?.value`)) === 'İkinci bölüm Şğı', J(await H(`${sonYTek()}?.value`)));
    await H(`(H.g().sayfayaGit(1), H.bekle(400))`);
    // Kaydet, kapat, aç: Değerler dosyada ve ekranda aynı
    const k = await kaydet();
    sonuc('XFA sınır: Kaydedildi, belge temiz', k.sonuc && !k.degisti, J(k));
    const bosluksuz = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
    const f = olc('xfa', y);
    const farkDosya = Object.entries(degerler).filter(([ad, v]) => bosluksuz(f.degerler[ad]?.[0]) !== bosluksuz(v)).map(([ad]) => ad);
    sonuc('XFA sınır: Yazılan bütün değerler dosyada', !farkDosya.length && f.degerler.YTek?.[1] === 'İkinci bölüm Şğı' && !f.onarildi, J({ farkDosya, onarildi: f.onarildi }));
    await belgeKapat(y, false);
    await belgeAc(y, { xfa: true });
    await H(`H.bekle(300)`);
    const ekran = await degerlendir(`(() => { const c = {}; for (const ad of ${J(Object.keys(degerler))}) c[ad] = window.__d.denetim(ad)?.value; return c; })()`);
    const farkEkran = Object.entries(degerler).filter(([ad, v]) => bosluksuz(ekran[ad]) !== bosluksuz(v)).map(([ad]) => ad);
    sonuc('XFA sınır: Yeniden açınca değerler ekranda aynı', !farkEkran.length && !(await H(`H.b().degisti`)), J(farkEkran));
    sonuc('XFA sınır: Yeniden açınca alanlar sığıyor, işaret yok (dosyadaki üç eski uzun değer dışında)', await degerlendir(`${J(Object.keys(degerler))}.every((ad) => !window.__d.denetim(ad).classList.contains('xfa-tasiyor'))`));
    await ekranGoruntusu('xfa-sinir-yeniden.png');
    // Düz PDF: Satır sayısı ekrandakiyle aynı, son satır kâğıtta
    const kutular = await degerlendir(`(() => { const g = window.__d.g(), s = g.sayfalar[0].el.getBoundingClientRect(), k = s.width / g.sayfalar[0].pdfSayfa.view[2], c = {}; for (const ad of ${J(Object.keys(degerler))}) { const r = window.__d.denetim(ad).getBoundingClientRect(); c[ad] = { x0: (r.left - s.left) / k, y0: (r.top - s.top) / k, x1: (r.right - s.left) / k, y1: (r.bottom - s.top) / k }; } return c; })()`);
    const satirlar = await degerlendir(`(() => { const c = {}; for (const ad of ${J(Object.keys(degerler))}) c[ad] = window.__d.durum(ad).satir; return c; })()`);
    const duz = await degerlendir(`(async () => { const d = await window.__d.b().xfa.duzPdf(); return { yol: d.yol, sayfa: d.sayfa, tasan: d.tasan, ekran: window.__d.g().sayfaSayisi }; })()`);
    const duzYol = path.join(CIKTI, 'xfa-sinir-duz.pdf');
    fs.copyFileSync(duz.yol, duzYol);
    const m = olc('duz', duzYol, 'xfa-sinir-duz');
    sonuc('XFA sınır: Düz PDF\'te sayfa sayısı formunki, A4', duz.sayfa === duz.ekran && m.sayfalar.length === duz.ekran && m.sayfalar.every((s) => Math.abs(s.g - 595) <= 2 && Math.abs(s.b - 842) <= 2), J({ duz, boyut: m.sayfalar.map((s) => [s.g, s.b]) }));
    sonuc('XFA sınır: Düz PDF\'te yalnız dosyadaki üç eski uzun değer sığmıyor', duz.tasan === 3, J(duz.tasan));
    const sy = m.sayfalar[0];
    for (const ad of Object.keys(degerler)) {
      const u = kutular[ad];
      const icinde = sy.satir.filter((s) => s.x0 >= u.x0 - 1 && s.x1 <= u.x1 + 2 && (s.y0 + s.y1) / 2 >= u.y0 - 1 && (s.y0 + s.y1) / 2 <= u.y1 + 1);
      const metin = bosluksuz(icinde.map((s) => s.t.trim()).join(' '));
      const basilan = icinde.length ? Math.max(...icinde.map((s) => s.y1)) : 0;
      sonuc(`XFA sınır ${ad}: Kâğıtta yazının tamamı, son sözcük dâhil`, ad === 'Hucre10' ? metin.replace(/ /g, '') === bosluksuz(degerler[ad]).replace(/ /g, '') : metin === bosluksuz(degerler[ad]), J({ kagit: metin.slice(-50), ekran: bosluksuz(degerler[ad]).slice(-50), uz: [metin.length, bosluksuz(degerler[ad]).length] }));
      sonuc(`XFA sınır ${ad}: Son satır kutunun içinde, ${icinde.length} satır (ekranda ${satirlar[ad]})`, ad === 'Hucre10' || (basilan <= u.y1 + 0.5 && icinde.length === satirlar[ad]), J({ basilan, kutu: u, satir: icinde.length, ekran: satirlar[ad] }));
    }
    const metin = m.sayfalar.map((s) => s.satir.map((x) => x.t).join('\n')).join('\n');
    sonuc('XFA sınır: Düğmeler basılmıyor, ikinci bölümün değeri kâğıtta', !/Bölüm Ekle|Bölüm Sil|Formu Kaydet/.test(metin) && metin.includes('İkinci bölüm Şğı'), metin.slice(0, 200));
    await komut('dosya.yazdir');
    const u = await kosul(() => degerlendir(`(() => { const d = document.querySelector('.yazdir-diyalog'), r = d?.querySelector('.yazdir-onizleme-sayfa'); return d && r?.naturalWidth > 0 ? { uyari: d.querySelector('.yazdir-uyari')?.hidden ? '' : d.querySelector('.yazdir-uyari')?.textContent, sayfa: d.querySelector('.yazdir-sayfa-no')?.textContent } : null; })()`), 20000);
    sonuc('XFA sınır: Yazdırma penceresi yalnız dosyada sığmayan alanları söyler', u?.uyari === '3 alandaki yazı alana sığmıyor. Sığmayan kısım basılmaz.', J(u));
    await ekranGoruntusu('xfa-sinir-yazdir.png');
    await degerlendir(`document.querySelector('.yazdir-diyalog [data-id=iptal]')?.click(), true`);
    await kosul(() => degerlendir(`!document.querySelector('.yazdir-ortusu')`), 10000);
  });

  // ================================================================== XFA formu: Şablondaki biçimler
  await bolum('XFA biçim', async () => {
    await bekle(8000);   // önceki bölümün bildirimi kapansın
    const y = kopya('xfa-bicim.pdf');
    await izle();
    await belgeAc(y, { xfa: true });
    const hiza = async (ad) => (await durum(ad)).hiza;
    const h = { Solda: await hiza('Solda'), Ortali: await hiza('Ortali'), Sagda: await hiza('Sagda'), CokOrtali: await hiza('CokOrtali'), CokIki: await hiza('CokIki') };
    sonuc('XFA biçim: Şablondaki hiza (solda, ortalı, sağda, çok satırlı ortalı, iki yana)', /^(left|start)$/.test(h.Solda) && h.Ortali === 'center' && h.Sagda === 'right' && h.CokOrtali === 'center' && h.CokIki === 'justify', J(h));
    for (const [ad, deger] of [['Solda', 'Solda yazı Şğı'], ['Ortali', 'Ortada yazı Şğı'], ['Sagda', 'Sağda yazı Şğı'], ['CokOrtali', 'Çok satırlı ortada'], ['CokSatir', YAZI_METNI], ['Renkli', 'Renkli zemin İ']]) {
      await tiklaAd(ad);
      await yazCdp(deger);
      await tusCdp('Tab');
      await bekle(100);
    }
    await bekle(300);
    await ekranGoruntusu('xfa-bicim.png');
    sonuc('XFA biçim: Ortalı alandaki yazı yerinde', (await H(`H.denetim('Ortali').value`)) === 'Ortada yazı Şğı');
    const t = await degerlendir(`[...document.querySelectorAll('${KATMAN} .xfa-tasiyor')].map((e) => e.closest('[xfaname]')?.getAttribute('xfaname'))`);
    const bl = await bildirimler();
    sonuc('XFA biçim: Kısa yazılar taşıyor sayılmadı, bildirim yok', !t.length && !bl.length, J({ t, bl }));
  });

  // ================================================================== XFA formu: Yazı tipi yedeği
  await bolum('XFA yazı tipi', async () => {
    const y = kopya('xfa-yazi.pdf');
    await belgeAc(y, { xfa: true });
    await H(`H.bekle(800)`);
    await gonder('DOM.enable');
    await gonder('CSS.enable');
    const fontlar = async (ad) => {
      const ogeler = await degerlendir(`window.__d.yaziOgeleri(${J(ad)})`);
      const kok = (await gonder('DOM.getDocument', { depth: 0 })).result.root.nodeId;
      const sonuclar = [];
      for (const u of ogeler) {
        const n = (await gonder('DOM.querySelector', { nodeId: kok, selector: `[data-fo="${u.k}"]` })).result?.nodeId;
        sonuclar.push({ yazi: u.yazi, fonts: n ? (await gonder('CSS.getPlatformFontsForNode', { nodeId: n })).result?.fonts || [] : [] });
      }
      return sonuclar;
    };
    const AILELER = ['Calibri', 'Optima', 'Myriad Pro', 'Minion Pro', 'Turkish Times New Roman'];
    for (let i = 0; i < AILELER.length; i++) {
      const beklenen = o.yaziTipleri[AILELER[i]];
      for (const [tur, ad] of [['düz', `YaziDuz${i}`], ['kalın', `YaziKalin${i}`], ['italik', `YaziItalik${i}`], ['zengin', `YaziZengin${i}`], ['alan', `YaziAlan${i}`]]) {
        const f = await fontlar(ad);
        const adlar = f.map((u) => `${u.yazi.slice(0, 16)} → ${u.fonts.map((x) => `${x.familyName} (${x.glyphCount})`).join(' + ')}`);
        // Eksik harf başka yazı tipine düşer: Listede beklenenden başka yazı tipi görünür. Alanda başlığın ve değerin ikisi de aynı aile
        sonuc(`XFA yazı tipi ${AILELER[i]} ${tur}: ${beklenen}, eksik harf yok`, f.length > 0 && f.every((u) => u.fonts.length > 0 && u.fonts.every((x) => x.familyName === beklenen)), adlar.join(' | '));
      }
    }
    await gonder('CSS.disable');
    await gonder('DOM.disable');
    const t = await H(`({ tasma: H.tasmalar(), kucuk: H.kuculenler() })`);
    sonuc('XFA yazı tipi: Taşan yazı yok', !t.tasma.length, J(t.tasma));
    sonuc('XFA yazı tipi: Küçültülen yazılar (bilgi)', null, t.kucuk.join(' | ') || 'yok');
    await ekranGoruntusu('xfa-yazi.png');
    const d = await degerlendir(`(async () => { const d = await window.__d.b().xfa.duzPdf(); return { yol: d.yol, sayfa: d.sayfa, tasan: d.tasan }; })()`);
    const duzYol = path.join(CIKTI, 'xfa-yazi-duz.pdf');
    fs.copyFileSync(d.yol, duzYol);
    const m = olc('duz', duzYol, 'xfa-yazi-duz');
    const metin = m.sayfalar.map((s) => s.satir.map((x) => x.t).join('\n')).join('\n');
    const kac = metin.split(YAZI_METNI).length - 1;
    sonuc('XFA yazı tipi: Düz PDF\'te Türkçe satırlar eksiksiz (5 aile, 4 çizim ve alan)', kac === 25 && d.tasan === 0, J({ kac, tasan: d.tasan, sayfa: d.sayfa }));
    sonuc('XFA yazı tipi: Düz PDF\'in yazı tipleri (bilgi)', null, m.fontlar.join(', '));
    sonuc('XFA yazı tipi: Düz PDF\'in yazı tipleri sistemin eşleri', m.fontlar.every((f) => new RegExp(o.duzYazisi).test(f)), m.fontlar.join(', '));
  });

  // ================================================================== Türkçe büyük harflerin üstü ve küçük harflerin altı kesilmiyor
  // Tek satırlı denetimde tarayıcı yazıyı satır yüksekliğinde keser: Yazı tipinin harfleri satırdan yüksekse İ'nin noktası, Ğ'nin ve Ü'nün işareti kaybolur. Alandaki yazının mürekkep yüksekliği,
  // aynı yazı tipinde kesilmeyen kopyasınınkiyle karşılaştırılır (büyütülmüş ekran görüntüsünde, 1 piksel pay)
  await bolum('Harf kesilmesi', async () => {
    const MET = 'İĞÜŞÖÇ ğçşı';
    const kesilme = async (ad, elIfade, metin = MET, { ic = 0, oran = 1 } = {}) => {
      const k = await H(`(async () => { const el = ${elIfade}; const u = H.kopyaKur(el, ${J(metin)}, ${ic}, ${oran}); await H.bekle(250); return H.kopyaKur(el, ${J(metin)}, ${ic}, ${oran}); })()`);
      await bekle(250);
      const dene = async (r, dosya) => {
        const g = await gonder('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } });
        const y = path.join(CIKTI, dosya);
        fs.writeFileSync(y, Buffer.from(g.result.data, 'base64'));
        return pdfOlc('murekkep', y, null, o.python);
      };
      const a = await dene(k.alan, `kesilme-${ad}-alan.png`), b = await dene(k.kopya, `kesilme-${ad}-kopya.png`);
      await degerlendir(`document.querySelector('.__kopya')?.remove(), true`);
      sonuc(`Harf kesilmesi ${ad}: İ, Ğ, Ü'nün üstü ve ç, ş, ğ'nin altı alanda da görünüyor`, a.yuk > 0 && b.yuk > 0 && b.yuk - a.yuk <= 1, J({ alan: a.yuk, kopya: b.yuk, olcek: k.olcek }));
    };
    const yazAlan = async (ad, metin = MET) => { await tiklaAd(ad); await degerlendir(`(() => { const e = window.__d.denetim(${J(ad)}); e.focus(); e.select(); return true; })()`); await yazCdp(metin); await tusCdp('Tab'); await bekle(100); await degerlendir(`document.activeElement?.blur?.(), true`); await bekle(100); };
    const y = kopya('xfa.pdf');
    await belgeAc(y, { xfa: true, z: 3 });
    await yazAlan('AdSoyad');
    await kesilme('XFA tek satır', `H.denetim('AdSoyad')`);
    await ekranGoruntusu('kesilme-xfa.png');
    await degerlendir(`(() => { const e = window.__d.denetim('Sehir'); e.value = [...e.options].find((x) => x.text === 'İstanbul').value; return e.value; })()`);
    await kesilme('XFA açılır liste', `H.denetim('Sehir')`, 'İstanbul', { oran: 0.6 });
    await tiklaAd('Aciklama');
    await yazCdp(MET);
    await tusCdp('Tab');
    await bekle(100);
    await degerlendir(`document.activeElement?.blur?.(), true`);
    await kesilme('XFA çok satır', `H.denetim('Aciklama')`);
    const y2 = kopya('xfa-sinir.pdf');
    await belgeAc(y2, { xfa: true, z: 3 });
    await yazAlan('TekKapali');   // dikey ortalı
    await kesilme('XFA dikey ortalı', `H.denetim('TekKapali')`);
    await yazAlan('IkiSatir');
    await kesilme('XFA çok satır, 1 mm kenar boşluğu', `H.denetim('IkiSatir')`);
    const y3 = kopya('xfa-yazi.pdf');
    await belgeAc(y3, { xfa: true, z: 3 });
    for (let i = 0; i < 5; i++) {
      await yazAlan(`YaziAlan${i}`);
      await kesilme(`XFA yazı tipi ${i}`, `H.denetim('YaziAlan${i}')`);
    }
    // Düz PDF'te aynı: Alan, aynı yazı tipindeki çizimle
    const d = await degerlendir(`(async () => { const d = await window.__d.b().xfa.duzPdf(); return d.yol; })()`);
    const duzYol = path.join(CIKTI, 'kesilme-duz.pdf');
    fs.copyFileSync(d, duzYol);
    const kac = pdfOlc('duz-murekkep', duzYol, YAZI_METNI, o.python).satirlar;
    const alanlar = pdfOlc('duz-murekkep', duzYol, MET, o.python).satirlar;
    sonuc('Harf kesilmesi düz PDF: Satırlar bulundu (bilgi)', null, J({ cizim: kac.length, alan: alanlar.length }));
    const cizimYuk = (font) => Math.max(0, ...kac.filter((x) => x.font === font).map((x) => x.yuk));
    for (const a of alanlar) {
      const c = cizimYuk(a.font);
      sonuc(`Harf kesilmesi düz PDF ${a.font}: Alanın yazısı çizimdeki kadar yüksek`, c > 0 && a.yuk >= c - 0.35, J({ alan: a.yuk, cizim: c }));
    }
    // Düz form alanı (düzenlenirken)
    const y4 = kopya('alanlar.pdf');
    await formAc(y4);
    await H(`(H.g().zoomAyarla(3), H.bekle(700))`);
    await formTikla('ad', { sayfa: 1 });
    await yazCdp(MET);
    await kesilme('düz form düzenlenirken', `document.activeElement`, MET, { ic: 3 });
    await tusCdp('Escape');
  });

  // ================================================================== sağ tık: Kes, Kopyala, Yapıştır (yerel menü)
  await bolum('Sağ tık', async () => {
    if (!o.menuTus) { sonuc('Sağ tık: Yerel menü', null, 'menüyü süren gerçek klavye yok'); return; }
    const pano = () => cagir('pano:oku');
    const y = kopya('xfa-sinir.pdf');
    await belgeAc(y, { xfa: true });
    await izle();
    const METIN = 'Kopyalanacak yazı burada';
    await tiklaAd('UcSatir');
    await yazCdp(METIN);
    const sec = (a, b) => degerlendir(`(() => { const e = window.__d.denetim('UcSatir'); e.focus(); e.setSelectionRange(${a}, ${b}); return true; })()`);
    const nokta = () => degerlendir(`(() => { const e = window.__d.denetim('UcSatir'); const r = e.getBoundingClientRect(); const o = r.width / e.offsetWidth; return { x: r.left + 15 * o, y: r.top + 9 * o }; })()`);
    const menu = async (...tuslar) => {
      const p = await nokta();
      await tikla(p.x, p.y, { dugme: 'right' });
      await bekle(700);
      if (o.ekranKok && !menu.alindi) { menu.alindi = true; o.ekranKok('menu-kok.png'); }
      await o.menuTus(...tuslar);
      await bekle(500);
    };
    await cagir('pano:metin', 'eski pano');
    await sec(0, 11);
    await menu('Down', 'Down', 'Return');   // Kes, Kopyala
    let v = await pano();
    sonuc('Sağ tık Kopyala (XFA): Seçili yazı gerçek panoda, alan değişmez', v === 'Kopyalanaca' && (await durum('UcSatir')).deger === METIN, J({ v, alan: (await durum('UcSatir')).deger }));
    await sec(0, 12);
    await menu('Down', 'Return');   // Kes
    v = await pano();
    const sonra = (await durum('UcSatir')).deger;
    sonuc('Sağ tık Kes (XFA): Yazı panoya ve alandan', v === 'Kopyalanacak' && sonra === METIN.slice(12), J({ v, sonra }));
    await sec(0, 0);
    await menu('Down', 'Return');   // seçim yok: Kes ve Kopyala kapalı, ilk açık öğe Yapıştır
    const son = (await durum('UcSatir')).deger;
    sonuc('Sağ tık Yapıştır (XFA): Panodaki yazı alana girdi', son.length === METIN.length && son.includes('Kopyalanacak'), J(son));
    // Yapıştır alanın sınırından geçer: Uzun yazı sığdığı kadar, uyarıyla
    await bosalt('IkiSatir');
    const UZUN = uzunYazi(3000);
    await cagir('pano:metin', UZUN);
    await tiklaAd('IkiSatir');
    await bildirimler();
    const p = await yer('IkiSatir');
    await tikla(p.x, p.y, { dugme: 'right' });
    await bekle(700);
    await o.menuTus('Down', 'Return');
    await bekle(500);
    const d = await durum('IkiSatir');
    const bl = await bildirimler();
    sonuc('Sağ tık Yapıştır (XFA): Sınırdan geçer, 2 satır, uyarı bir kez', sinirTamam(d, 2) && d.uz > 100 && bl.length === 1 && /alınmadı\.$/.test(bl[0]), J({ ...d, deger: undefined, bl }));
    // Düz form alanı
    const y2 = kopya('alanlar.pdf');
    await formAc(y2);
    await izle();
    const pk = await formTikla('kisa');
    await cagir('pano:metin', 'Beşten uzun yazı');
    await bildirimler();
    await tikla(pk.x, pk.y, { dugme: 'right' });
    await bekle(700);
    await o.menuTus('Down', 'Return');
    await bekle(500);
    const v2 = await degerlendir(`document.activeElement?.value`);
    const bl2 = await bildirimler();
    sonuc('Sağ tık Yapıştır (düz form): En çok 5 karakter, uyarı', v2?.length > 0 && v2.length <= 5 && bl2.some((x) => x === alinmadi(16 - v2.length)), J({ v2, bl2 }));
    await degerlendir(`document.activeElement.select(), true`);
    await tikla(pk.x, pk.y, { dugme: 'right' });
    await bekle(700);
    await o.menuTus('Down', 'Down', 'Return');
    await bekle(500);
    v = await pano();
    sonuc('Sağ tık Kopyala (düz form): Panoda', v === v2, J({ v, v2 }));
  });

  // ================================================================== kapatma sorusu, sekme taşıma
  await bolum('Kapatma', async () => {
    const soruBekle = async (yol) => {
      await degerlendir(`(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.yol === ${J(yol)}); window.__kapanis = window.__pdefe.belgeKapat(b.id); return true; })()`);
      return kosul(() => degerlendir(`(() => { const k = document.querySelector('.mesaj-kutusu'); if (!k) return null; const r = [...k.querySelectorAll('button')].map((d) => { const u = d.getBoundingClientRect(); return { yazi: d.textContent, x: u.left + u.width / 2, y: u.top + u.height / 2 }; }); return { ileti: k.querySelector('.mesaj-ileti')?.textContent, dugmeler: r }; })()`), 8000);
    };
    const vazgec = async (s) => {
      const d = s.dugmeler.find((x) => x.yazi === 'Vazgeç');
      await tikla(d.x, d.y);
      return degerlendir(`window.__kapanis`);
    };
    // XFA
    const y = kopya('xfa.pdf');
    await belgeAc(y, { xfa: true });
    await tiklaAd('AdSoyad');
    await yazCdp('Kaydedilmemiş yazı');
    let s = await soruBekle(y);
    sonuc('Kapatma: XFA formunda değişiklikle kapatınca soru çıkar, düğmeler Kaydet, Kaydetme, Vazgeç', !!s && s.ileti?.includes('kaydedilmemiş değişiklikler') && J(s.dugmeler.map((d) => d.yazi)) === J(['Kaydet', 'Kaydetme', 'Vazgeç']), J(s));
    await ekranGoruntusu('kapatma-sorusu.png');
    let kapandi = s ? await vazgec(s) : null;
    sonuc('Kapatma: Vazgeç: Sekme açık, yazı yerinde', kapandi === false && (await H(`H.denetim('AdSoyad').value`)) === 'Kaydedilmemiş yazı', J(kapandi));
    // Düz form
    const y2 = kopya('alanlar.pdf');
    await formAc(y2);
    await formTikla('ad', { sayfa: 1 });
    await yazCdp('Kaydedilmemiş');
    s = await soruBekle(y2);
    sonuc('Kapatma: Düz formda değişiklikle kapatınca soru çıkar', !!s && s.ileti?.includes('kaydedilmemiş değişiklikler'), J(s));
    kapandi = s ? await vazgec(s) : null;
    sonuc('Kapatma: Vazgeç: Değer komut oldu, belge açık', kapandi === false && (await formDeger('ad')) === 'Kaydedilmemiş', J(kapandi));
    // Sekme başka pencereye taşınır: XFA formunun yazılan değeri ve kirli durumu
    const port = o.port;
    const hedefler = async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((h) => h.type === 'page' && /index\.html/.test(h.url));
    await degerlendir(`(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.yol === ${J(y)}); return window.__pdefe.sekmeSec(b.id), true; })()`);
    await H(`H.bekle(300)`);
    const once = (await hedefler()).map((h) => h.id);
    const tasindi = await degerlendir(`(async () => { const r = await window.__pdefe.sekmeyiTasi(window.__d.b().id, { tur: 'yeni' }); return r; })()`);
    const yeni = await kosul(async () => (await hedefler()).find((h) => !once.includes(h.id)), 10000);
    sonuc('Sekme taşıma: Form yeni pencereye taşındı', !!yeni, J(tasindi));
    if (yeni) {
      const ws = new WebSocket(yeni.webSocketDebuggerUrl);
      await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
      let no = 0;
      const bek = new Map();
      ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bek.has(d.id)) { bek.get(d.id)(d); bek.delete(d.id); } };
      const de = (ifade) => new Promise((c) => { const i = ++no; bek.set(i, (d) => c(d.result?.result?.value)); ws.send(J({ id: i, method: 'Runtime.evaluate', params: { expression: ifade, awaitPromise: true, returnByValue: true } })); });
      const r = await kosul(() => de(`(() => { const b = window.__pdefe?.aktif?.(); const e = document.querySelector('${KATMAN} [xfaname="AdSoyad"] input'); return b?.gorunum?.xfa && e ? { deger: e.value, degisti: b.degisti, yol: b.yol } : null; })()`), 15000);
      sonuc('Sekme taşıma: Yeni pencerede XFA kipi, yazılan değer, kaydedilmemiş durum', r?.deger === 'Kaydedilmemiş yazı' && r?.degisti === true && r?.yol === y, J(r));
      await de(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); setTimeout(() => window.close(), 200); return true; })()`).catch(() => {});
      try { ws.close(); } catch { /* kapandı */ }
      await kosul(async () => (await hedefler()).length === once.length, 8000);
    }
    if (o.gercekOdak) await o.gercekOdak();
  });

  if (o.sonBelge) await degerlendir(`(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.yol === ${J(o.sonBelge)}); if (b) window.__pdefe.sekmeSec(b.id); return true; })()`);
}
