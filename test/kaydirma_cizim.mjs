// Kaydırırken sayfa çizimi (0.2.3, kullanıcı isteği: "sayfaları kaydırırken daha hızlı yüklensin. hafif geç yükleniyor gibi oluyor").
// Gerçek girdiyle (CDP Input: tekerlek, Ctrl+tekerlek) sınanır; çizimler görünümün örnek düzeyinde sarılan yöntemleriyle kaydedilir.
//   1) Kısma: ölçek aynıyken yeniden çizim beklemez. %600'de (bölgesel çizim) tekerlekle kaydırırken görünür sayfanın bölgesi kaydırma
//      sürerken yenilenir, görünen alanın çoğu kaydırma boyunca çizili kalır (önceden 120 ms'lik bekleme her kaydırma olayında yeniden
//      kuruluyor, yeniden çizim ancak kaydırma durunca geliyordu). Ölçek değişince (Ctrl+tekerlekle yakınlaştırma sürerken) tuvali olan
//      sayfa yine son adımdan 120 ms sonra yeniden çizilir.
//   2) Bant sayfaları kaydırırken keskinleşir: logolu, karekodlu belgede (görseller kaydırırken işçide örneklenir, sayfa önce hızlı
//      çizilir) önden çizilen sayfalar işçi örneklemesi bitince kaydırma sürerken keskin yeniden çizilir, görünür alana keskin girer
//      (önceden 5 sayfanın 4'ü bulanık giriyor, kaydırma durduktan ~0,5 sn sonra netleşiyordu); sayfa başına çizim sınırlı (döngü yok).
//      yeterliMi: ara tuvalden hızlı çizilmiş bant sayfası (keskinlesir yok) kaydırma bitene dek yeniden çizilmez.
//   3) Önizleme (düşük çözünürlüklü ilk çizim) yalnızca görünen sayfada ve çok büyük (12 MP üstü) bölgesel çizimde: genişliğe sığdırılmış
//      sayfada (6,7 MP) ve yakınlaştırılmış tam çizimde (19 MP: %125 ekranda %370, %100 ekranda %463) yok, önden çizilen sayfada hiç yok;
//      görünüm pencereden büyük yapılınca (4K ekran benzeri bölgesel çizim) görünen sayfada var.
//   4) Bölgesel çizimde pay kaydırma yönünde: %600'de aşağı kaydırınca bölgenin payının çoğu görünen kısmın altında, yukarı kaydırınca
//      üstünde, sayfaya gidince (yön bilinmez) iki yana eşit; bölgenin boyutu değişmez.
//   5) Önden çizme bandı kaydırma yönünde: görünümün ortasından yönde 2, geride 1 ekran (yön bilinmiyorsa iki yana 1,5, önceki gibi);
//      tuvali kalan sayfalar boşaltma sınırının (yönde 4, geride 3 ekran) içinde; bandın sayfa sayısı yönden bağımsız.
//   6) Form alanlı belgede ek katmanlar yalnızca görünüm değişince kurulur (bağımsız incelemenin bulgusu): %600'de kaydırırken
//      bölgesel yeniden çizimler çekirdekten form görüntüsü istemez, not katmanını baştan kurmaz (önceden her çizimde: kaydırma başına
//      ~17 tam sayfa form görüntüsü, çekirdeğin sırası uzuyor, kaydırma durduktan sonraki küçük resim isteği ~6 sn bekliyordu); form
//      katmanı yerinde kalır, ölçek değişince ve sayfa boşaltılıp yeniden çizilince yeniden kurulur.
//   7) Hızlı çizim ve keskinleşme işareti çizimin kendi sayaçlarından (bağımsız incelemenin bulgusu): fotoğraflı ve yalnızca metinli iki
//      sayfa kaydırma sürerken aynı anda çizilince metinli sayfa hızlı / keskinleşecek sayılmaz (önceden 3 denemenin 2'sinde sayılıyor,
//      kaydırma sürerken boşuna yeniden çiziliyordu), fotoğraflı sayfa sayılır.
// Kullanım (ev ekranı benzeri; sayfa 6 MP'yi aşar):
//   .venv\Scripts\python.exe test\kaydirma_ornek_uret.py      (test\cikti\kaydirma\pdf yoksa betik kendisi üretir)
//   powershell -File test\baslat.ps1 -Port 9643 -Boyut "1800,1050" -Olcek 1.25      → PID=… yazar
//     (ofis ekranı: -Boyut "1900,1000" -Olcek 1; %150: -Boyut "1280,680" -Olcek 1.5; ölçüler ekran ölçeğinden bağımsız seçilir)
//   $env:PDEFE_CDP_PORT=9643; node test\surucu.mjs betik test\kaydirma_cizim.mjs     [$env:BOLUM="1,3"]
//   powershell -File test\durdur.ps1 -SurecId <PID>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORNEK = path.join(KOK, 'test', 'cikti', 'kaydirma', 'pdf');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '1,2,3,4,5,6,7').split(',').map((s) => +s.trim()).filter(Boolean);

let hataSayisi = 0, denetimSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetimSayisi++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

// Sayfada: çizimlerin kaydı (tuvalCiz başlangıcı, cizimUygula), tekerlek olaylarının zamanı, her karede görünen alanın çizilmemiş kısmı
const SAYFA_KODU = `(async () => {
  const k = await import('./keskinlik.js');
  const K = window.__kc = { k, olaylar: [], tekerlekler: [], kaydirmalar: [], girisler: [], girenler: new Set(), giris: false, ornek: null };
  K.g = () => window.__pdefe.aktif().gorunum;
  K.bagla = () => {
    const g = K.g(), P = Object.getPrototypeOf(g);
    if (g.__kc === K) return true;
    g.__kc = K;
    g.cizimUygula = function (s, c, cz) {
      K.olaylar.push({ tur: 'uygula', no: s.no, t: performance.now(), tam: !!cz.tam, onizleme: !!cz.onizleme, hizli: !!cz.hizli, gorunur: this._gorunurKume.has(s),
        tuvalliydi: !!s.canvas, ertelenir: k.keskinErtelenir(), bolge: { ...cz.bolge }, vt: this.kaydirici.scrollTop, yerY: this.yerAl(this.idx(s))?.y });
      return P.cizimUygula.call(this, s, c, cz);
    };
    g.tuvalCiz = function (s, p, olcek, d, oran, b, koyu) {
      const yer = this.yerAl(this.idx(s));
      K.olaylar.push({ tur: 'bas', no: s.no, t: performance.now(), tuvalliydi: !!s.canvas, gorunur: this._gorunurKume.has(s), onizleme: oran < devicePixelRatio - 1e-6, olcek,
        bolge: { ...b }, vt: this.kaydirici.scrollTop, vh: this.kaydirici.clientHeight, yerY: yer?.y, yerH: yer?.h, mp: b.w * b.h * oran * oran / 1e6 });
      return P.tuvalCiz.call(this, s, p, olcek, d, oran, b, koyu);
    };
    // Görünür alana giren sayfanın o anki çizimi (keskin / hizli / onizleme / bos)
    g.kaydirmaIsle = function (...a) {
      const once = new Set(this._gorunurKume);
      const r = P.kaydirmaIsle.apply(this, a);
      if (K.giris) for (const s of this._gorunurKume) if (!once.has(s) && !K.girenler.has(s)) {
        K.girenler.add(s);
        K.girisler.push({ no: s.no, t: performance.now(), durum: !s.canvas ? 'bos' : s.cizim?.onizleme ? 'onizleme' : s.cizim?.hizli ? 'hizli' : 'keskin' });
      }
      return r;
    };
    g.kaydirici.addEventListener('wheel', () => K.tekerlekler.push(performance.now()), { passive: true });
    g.kaydirici.addEventListener('scroll', () => K.kaydirmalar.push(performance.now()), { passive: true });
    return true;
  };
  K.sifirla = () => { K.olaylar = []; K.tekerlekler = []; K.kaydirmalar = []; K.giris = false; return performance.now(); };
  K.girisIzle = () => { K.giris = true; K.girenler = new Set(K.g()._gorunurKume); K.girisler = []; return true; };
  K.durgun = () => {
    const g = K.g();
    if (k.okumaSuruyor()) return false;
    for (const s of g.sayfalar) if (s.hedef || s._planli) return false;
    for (const s of g._gorunurKume) if (!s.canvas) return false;
    return true;
  };
  /** Her karede görünen alanın tuvalce kapsanmayan oranı (bölgesel çizimde tuvalin dışında kalan kısım dahil). */
  const bosOran = () => {
    const g = K.g(), kd = g.kaydirici;
    const vt = kd.scrollTop, vh = kd.clientHeight, vl = kd.scrollLeft, vw = kd.clientWidth;
    let bos = 0;
    for (const s of g._gorunurKume) {
      const y = g.yerlesim[g.idx(s)];
      if (!y) continue;
      const gy = Math.max(0, Math.min(y.y + y.h, vt + vh) - Math.max(y.y, vt)), gx = Math.max(0, Math.min(y.x + y.w, vl + vw) - Math.max(y.x, vl));
      const a = (gx * gy) / (vw * vh);
      const c = s.cizim;
      if (!s.canvas || !c) { bos += a; continue; }
      if (c.tam) continue;
      const kx = s.boyut ? s.boyut.w / c.w : 1, ky = s.boyut ? s.boyut.h / c.h : 1, b = c.bolge;
      const x0 = Math.max(vl - y.x, b.x * kx), x1 = Math.min(vl + vw - y.x, (b.x + b.w) * kx);
      const y0 = Math.max(vt - y.y, b.y * ky), y1 = Math.min(vt + vh - y.y, (b.y + b.h) * ky);
      bos += a - Math.min(a, (Math.max(0, x1 - x0) * Math.max(0, y1 - y0)) / (vw * vh));
    }
    return bos;
  };
  K.ornekBasla = () => {
    const o = K.ornek = { kareler: [], calis: true };
    const kare = (t) => { if (!o.calis) return; o.kareler.push([t, bosOran()]); requestAnimationFrame(kare); };
    requestAnimationFrame(kare);
    return true;
  };
  K.ornekBitir = () => { if (K.ornek) K.ornek.calis = false; return K.ornek?.kareler || []; };
  return true;
})()`;

export default async function ({ evalJs, bekle, hedefler }) {
  const pdfler = ['metin', 'karisik', 'taranmis', 'formlu', 'karma'].map((a) => path.join(ORNEK, a + '.pdf'));
  if (pdfler.some((p) => !fs.existsSync(p))) execFileSync(PY, [path.join(KOK, 'test', 'kaydirma_ornek_uret.py'), ORNEK], { stdio: 'inherit' });
  const [METIN, KARISIK, , FORMLU, KARMA] = pdfler;

  // Tekerlek dizileri tek CDP bağlantısından, sabit aralıkla gönderilir
  const h = (await hedefler())[0];
  const ws = new WebSocket(h.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); const b = bekleyen.get(d.id); if (b) { bekleyen.delete(d.id); b(d); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(J({ id: i, method, params })); });
  const tekerlek = async (n, deltaY, ara, { ctrl = false } = {}) => {
    // Kaydırıcının ortası; kaydırıcı pencereden uzun yapıldıysa (5. bölüm) pencerenin içinde kalır
    const m = await evalJs(`(() => { const r = window.__kc.g().kaydirici.getBoundingClientRect();
      return { x: Math.round(Math.min(r.left + r.width / 2, innerWidth - 40)), y: Math.round(Math.min(r.top + r.height / 2, innerHeight - 40)) }; })()`);
    await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m.x, y: m.y, button: 'none', buttons: 0 });
    const sozler = [], t0 = performance.now();
    for (let k = 0; k < n; k++) {
      const kalan = t0 + k * ara - performance.now();
      if (kalan > 1) await bekle(kalan);
      sozler.push(gonder('Input.dispatchMouseEvent', { type: 'mouseWheel', x: m.x, y: m.y, deltaX: 0, deltaY, modifiers: ctrl ? 2 : 0, button: 'none', buttons: 0 }));
    }
    await Promise.all(sozler);
  };
  const durul = async (sure = 20000) => {
    const t0 = Date.now();
    for (let ard = 0; Date.now() - t0 < sure; await bekle(120)) if (await evalJs('window.__kc.durgun()')) { if (++ard >= 3) return true; } else ard = 0;
    return false;
  };
  const belgeAc = async (yol) => {
    await evalJs(`(async () => { for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true }); return true; })()`);
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(yol)}); return true; })()`);
    for (let i = 0; i < 100 && !(await evalJs('!!window.__pdefe.aktif()?.gorunum?.hazir')); i++) await bekle(100);
    await evalJs(`(() => { window.__pdefe.panel.acKapa(false); return window.__kc.bagla(); })()`);
    await durul();
  };

  await evalJs(`(() => { window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);
  await evalJs(SAYFA_KODU);
  const bilgi = await evalJs('({ dpr: devicePixelRatio, w: innerWidth, h: innerHeight })');
  console.log('Pencere', J(bilgi));

  if (BOLUMLER.includes(1)) {
    console.log('--- 1) Kısma: ölçek aynıyken yeniden çizim beklemez; ölçek değişince 120 ms');
    await belgeAc(METIN);
    await evalJs(`(() => { const g = window.__kc.g(); g.zoomAyarla(6); g.sayfayaGit(3, { aninda: true }); return g.olcek; })()`);
    await durul();
    const ilk = await evalJs(`(() => { const g = window.__kc.g(), s = g.sayfalar[2]; return { olcek: g.olcek, tam: s.cizim?.tam, tuval: !!s.canvas }; })()`);
    sonuc('%600: görünür sayfa bölgesel çizildi', ilk.olcek === 6 && ilk.tuval && ilk.tam === false, ilk);
    await evalJs('(() => { window.__kc.sifirla(); return window.__kc.ornekBasla(); })()');
    await tekerlek(60, 100, 30);
    await bekle(400);   // yumuşak kaydırmanın sonu
    const kareler = await evalJs('window.__kc.ornekBitir()');
    await durul();
    const o = await evalJs(`(() => { const K = window.__kc; return { olaylar: K.olaylar, tekerlekler: K.tekerlekler }; })()`);
    const bas = o.tekerlekler[0], son = o.tekerlekler[o.tekerlekler.length - 1];
    const sirasinda = o.olaylar.filter((e) => e.tur === 'uygula' && e.gorunur && e.tuvalliydi && !e.tam && !e.onizleme && e.t > bas && e.t < son);
    sonuc('%600: kaydırma sürerken görünür sayfanın bölgesi yenilendi (en az 3 kez)', o.tekerlekler.length >= 55 && sirasinda.length >= 3,
      { tekerlek: o.tekerlekler.length, yenileme: sirasinda.length, sureMs: Math.round(son - bas) });
    const surerken = kareler.filter(([t]) => t > bas && t < son);
    const ortBos = surerken.reduce((a, [, b]) => a + b, 0) / Math.max(1, surerken.length);
    sonuc('%600: kaydırma boyunca görünen alanın ortalama %35\'inden azı çizilmemiş', surerken.length >= 20 && ortBos < 0.35,
      { kare: surerken.length, ortBos: +ortBos.toFixed(3), enCok: +Math.max(0, ...surerken.map(([, b]) => b)).toFixed(3) });

    // Ölçek değişince: Ctrl+tekerlek (6 adım, 40 ms arayla), tuvali olan sayfa son adımdan ~120 ms sonra yeniden çizilir
    await evalJs(`(async () => { await window.__kc.g().zoomModuAyarla('genislik'); return true; })()`);
    await evalJs(`(() => { window.__kc.g().sayfayaGit(5, { aninda: true }); return true; })()`);
    await durul();
    await evalJs('window.__kc.sifirla()');
    await tekerlek(6, -100, 40, { ctrl: true });
    await durul();
    const z = await evalJs(`(() => { const K = window.__kc, g = K.g(); return { olaylar: K.olaylar, tekerlekler: K.tekerlekler, olcek: g.olcek, mod: g.zoomModu }; })()`);
    const zSon = z.tekerlekler[z.tekerlekler.length - 1];
    const tuvalli = z.olaylar.filter((e) => e.tur === 'bas' && e.tuvalliydi);
    const ilkTuvalli = tuvalli.length ? tuvalli[0].t - zSon : null;
    sonuc('Ctrl+tekerlek: ölçek değişti', z.tekerlekler.length === 6 && z.mod === 'serbest' && z.olcek > 2.5, { tekerlek: z.tekerlekler.length, olcek: z.olcek, mod: z.mod });
    sonuc('Ctrl+tekerlek: tuvali olan sayfa yakınlaştırma sürerken çizilmedi, son adımdan ≥ 100 ms sonra yeni ölçekte çizildi',
      tuvalli.length >= 1 && ilkTuvalli >= 100 && tuvalli.every((e) => e.olcek === z.olcek), { ilkTuvalliMs: ilkTuvalli && Math.round(ilkTuvalli), cizim: tuvalli.length });
    await evalJs(`(async () => { await window.__kc.g().zoomModuAyarla('genislik'); return true; })()`);
  }

  if (BOLUMLER.includes(2)) {
    console.log('--- 2) Bant sayfaları kaydırırken keskinleşir (logolu, karekodlu belge)');
    await belgeAc(KARISIK);
    await evalJs(`(() => { window.__kc.g().sayfayaGit(1, { aninda: true }); return true; })()`);
    await durul();
    await evalJs('(() => { window.__kc.sifirla(); return window.__kc.girisIzle(); })()');
    await tekerlek(100, 100, 30);
    await bekle(400);
    await durul();
    const o = await evalJs(`(() => { const K = window.__kc, g = K.g(); return { olaylar: K.olaylar, tekerlekler: K.tekerlekler, kaydirmalar: K.kaydirmalar, girisler: K.girisler,
      sonda: [...g._gorunurKume].map((s) => ({ no: s.no, keskin: !!s.cizim && !s.cizim.hizli && !s.cizim.onizleme })) }; })()`);
    const bas = o.tekerlekler[0], sonKaydirma = o.kaydirmalar[o.kaydirmalar.length - 1];
    const girenler = o.girisler.filter((g) => g.t > bas + 300);   // ilk sayfalar ölçüm başlamadan çizilmişti
    const hizliGiren = girenler.filter((g) => g.durum !== 'keskin');
    sonuc('Kaydırırken görünür alana giren sayfalar keskin girdi (en çok 1 bulanık)', girenler.length >= 3 && hizliGiren.length <= 1,
      { giren: girenler.length, durumlar: girenler.map((g) => g.no + ':' + g.durum) });
    const bantKeskin = o.olaylar.filter((e) => e.tur === 'uygula' && !e.gorunur && e.tuvalliydi && !e.hizli && e.ertelenir && e.t < sonKaydirma);
    sonuc('Kaydırma sürerken bant sayfaları keskin yeniden çizildi', bantKeskin.length >= 2, { yeniden: bantKeskin.map((e) => e.no) });
    const sayfaBasina = {};
    for (const e of o.olaylar) if (e.tur === 'bas' && !e.onizleme) sayfaBasina[e.no] = (sayfaBasina[e.no] || 0) + 1;
    const enCok = Math.max(0, ...Object.values(sayfaBasina));
    sonuc('Sayfa başına en çok 3 çizim (yeniden çizim döngüsü yok)', enCok <= 3, sayfaBasina);
    const keskinlesme = o.olaylar.filter((e) => e.tur === 'uygula' && e.gorunur && !e.hizli && e.t > sonKaydirma).map((e) => e.t - sonKaydirma);
    sonuc('Kaydırma durunca görünen sayfalar keskin; durduktan sonra en çok 250 ms içinde', o.sonda.every((s) => s.keskin) && keskinlesme.every((ms) => ms < 250),
      { sonda: o.sonda, durdukranSonraMs: keskinlesme.map(Math.round) });
    // Kaydırma sürerken bant sayfasının hızlı çizimi: görselleri işçide örneklendiyse yeterli değil (yeniden çizilir), örneklenmeyen ara
    // tuvalden hızlıysa (keskinlesir yok) kaydırma bitene dek yeterli (her kaydırma olayında boşuna yeniden çizilmez)
    const y = await evalJs(`(async () => {
      const K = window.__kc, g = K.g(), k = K.k;
      const i = g.sayfalar.findIndex((s) => s.canvas && s.cizim && !g._gorunurKume.has(s));
      if (i < 0) return null;
      const s = g.sayfalar[i], yer = g.yerAl(i), c = s.cizim;
      const dene = (ek) => g.yeterliMi(i, { ...c, hizli: true, ...ek }, yer);
      k.etkilesimBildir();
      const r = { okuma: k.okumaSuruyor(), surerkenIscili: dene({ keskinlesir: true }), surerkenAra: dene({ keskinlesir: false }) };
      await new Promise((c) => setTimeout(c, k.ETKILESIM_MS + 30));
      r.bitinceAra = dene({ keskinlesir: false });
      r.bitinceIscili = dene({ keskinlesir: true });
      return r;
    })()`);
    sonuc('yeterliMi (bant, hızlı): işçili kaydırırken yeterli değil, ara tuvalli kaydırırken yeterli; kaydırma bitince ikisi de yeterli değil',
      !!y && !y.okuma && y.surerkenIscili === false && y.surerkenAra === true && y.bitinceAra === false && y.bitinceIscili === false, y);
  }

  if (BOLUMLER.includes(3)) {
    console.log('--- 3) Önizleme yalnızca görünen sayfada ve çok büyük bölgesel çizimde');
    await belgeAc(METIN);
    const atla = async (sayfalar) => { for (const no of sayfalar) { await evalJs(`(() => { window.__kc.g().sayfayaGit(${no}, { aninda: true }); return true; })()`); await durul(); } };
    const oku = () => evalJs('window.__kc.olaylar.filter((e) => e.tur === "bas")');
    await evalJs('window.__kc.sifirla()');
    await atla([200, 100, 300]);
    let bas = await oku();
    const sayfaMP = Math.max(0, ...bas.filter((e) => e.gorunur && !e.onizleme).map((e) => e.mp));
    sonuc(`Genişliğe sığdırılmış sayfa (${sayfaMP.toFixed(1)} MP): önizleme yok, bant sayfaları doğrudan tam çizildi`,
      bas.length >= 6 && bas.every((e) => !e.onizleme) && bas.some((e) => !e.gorunur), { cizim: bas.length, onizleme: bas.filter((e) => e.onizleme).length });
    const yakinOlcek = await evalJs(`(() => { const g = window.__kc.g(); g.zoomAyarla(3.7 * 1.25 / devicePixelRatio); g.sayfayaGit(150, { aninda: true }); return g.olcek; })()`);
    await durul();
    await evalJs('window.__kc.sifirla()');
    await atla([250, 50]);
    bas = await oku();
    const buyukMP = Math.max(0, ...bas.filter((e) => e.gorunur && !e.onizleme).map((e) => e.mp));
    sonuc(`%${Math.round(yakinOlcek * 100)} (${buyukMP.toFixed(1)} MP, tam çizim): önizleme yok`, buyukMP > 15 && bas.length >= 4 && bas.every((e) => !e.onizleme),
      { cizim: bas.length, onizleme: bas.filter((e) => e.onizleme).length });
    // Çok büyük bölgesel çizim (4K ekran benzeri: görünüm pencereden büyük yapılır): görünen sayfanın ilk çiziminde önizleme korunur
    await evalJs(`(() => { const g = window.__kc.g(); g.kaydirici.style.right = '-1800px'; g.kaydirici.style.bottom = '-1000px'; g.zoomAyarla(6); return true; })()`);
    await bekle(300);
    await durul();
    await evalJs('window.__kc.sifirla()');
    await atla([120]);
    bas = await oku();
    const bolgeMP = Math.max(0, ...bas.filter((e) => e.gorunur && !e.onizleme).map((e) => e.mp));
    const gorunenOnizleme = bas.filter((e) => e.onizleme && e.gorunur), gorunmeyenOnizleme = bas.filter((e) => e.onizleme && !e.gorunur);
    sonuc(`Çok büyük bölgesel çizim (${bolgeMP.toFixed(1)} MP): görünen sayfada önizleme var, görünmeyende yok`,
      bolgeMP > 12 && gorunenOnizleme.length >= 1 && gorunmeyenOnizleme.length === 0, { gorunen: gorunenOnizleme.map((e) => e.no), gorunmeyen: gorunmeyenOnizleme.map((e) => e.no) });
    await evalJs(`(async () => { const g = window.__kc.g(); g.kaydirici.style.right = ''; g.kaydirici.style.bottom = ''; await g.zoomModuAyarla('genislik'); return true; })()`);
    await bekle(300);
    await durul();
  }

  if (BOLUMLER.includes(4)) {
    console.log('--- 4) Bölgesel çizimde pay kaydırma yönünde (bölgenin boyutu aynı)');
    await belgeAc(METIN);
    await evalJs(`(() => { const g = window.__kc.g(); g.zoomAyarla(6); g.sayfayaGit(3, { oran: 0.3, aninda: true }); return true; })()`);
    await durul();
    // Görünür sayfanın şimdiki bölgesi (bolgeHesapla): görünen kısmın üstünde (geride) ve altında kalan pay, bölgenin boyutu
    const pay = () => evalJs(`(() => { const g = window.__kc.g(), k = g.kaydirici, i = g.gecerli - 1, yer = g.yerlesim[i], b = g.bolgeHesapla(i, yer);
      const ust = (k.scrollTop - yer.y) - b.y, alt = (b.y + b.h) - (k.scrollTop - yer.y + k.clientHeight);
      return { yon: g._yon.y, ust: Math.round(ust), alt: Math.round(alt), w: Math.round(b.w), h: Math.round(b.h), tam: b.tam, vh: k.clientHeight }; })()`);
    const ortali = await pay();
    sonuc('Yön bilinmiyor (sayfaya gidildi): pay iki yana eşit', !ortali.tam && ortali.yon === 0 && Math.abs(ortali.ust - ortali.alt) <= 2 && ortali.ust > 100, ortali);
    await evalJs('window.__kc.sifirla()');
    await tekerlek(30, 100, 30);
    await bekle(400);
    const asagi = await pay();
    sonuc('Aşağı kaydırınca payın çoğu aşağıda (alt ≈ 9 × üst), bölge boyutu aynı', asagi.yon === 1 && asagi.alt > 6 * asagi.ust && asagi.ust >= 0 && asagi.h === ortali.h && asagi.w === ortali.w, asagi);
    const asagiCizimler = await evalJs(`window.__kc.olaylar.filter((e) => e.tur === 'bas' && e.gorunur && e.tuvalliydi && !e.onizleme && e.yerY != null)
      .map((e) => ({ ust: Math.round(e.vt - e.yerY - e.bolge.y), alt: Math.round(e.bolge.y + e.bolge.h - (e.vt - e.yerY + e.vh)) }))`);
    sonuc('Aşağı kaydırırken başlayan bölgesel çizimlerde pay aşağıda', asagiCizimler.length >= 2 && asagiCizimler.every((p) => p.alt > p.ust), asagiCizimler);
    await durul();
    await tekerlek(15, -100, 30);
    await bekle(400);
    const yukari = await pay();
    sonuc('Yukarı kaydırınca payın çoğu yukarıda', yukari.yon === -1 && yukari.ust > 6 * yukari.alt && yukari.alt >= 0 && yukari.h === ortali.h, yukari);
    await durul();
    await evalJs(`(() => { window.__kc.g().sayfayaGit(4, { oran: 0.3, aninda: true }); return true; })()`);
    await bekle(300);
    const gidince = await pay();
    sonuc('Sayfaya gidince (programatik kaydırma) yön bilinmez, pay yine eşit', gidince.yon === 0 && Math.abs(gidince.ust - gidince.alt) <= 2, gidince);
    await durul();
    await evalJs(`(async () => { await window.__kc.g().zoomModuAyarla('genislik'); return true; })()`);
    await durul();
  }

  if (BOLUMLER.includes(5)) {
    console.log('--- 5) Önden çizme bandı kaydırma yönünde (toplamı aynı)');
    await belgeAc(METIN);
    // Bandın sınırları ekran yüksekliğinin katı, sayfalar bütün sayılır: alçak görünümde (%150 ekranda 576 px) sayfa aralığı ~0,6 ekran
    // olur, yönün etkisi bant sayfalarının sayısına yansımayabilir. Görünüm en az ev ekranındaki yüksekliğe (951 px) getirilir (kaydırıcı
    // pencereden uzun olabilir, 3. bölümdeki gibi)
    await evalJs(`(() => { const k = window.__kc.g().kaydirici, vh = k.clientHeight; if (vh < 951) k.style.bottom = (vh - 951) + 'px'; return true; })()`);
    await bekle(300);
    await durul();
    await evalJs(`(() => { const g = window.__kc.g(); g.zoomAyarla(0.3); g.sayfayaGit(100, { aninda: true }); return true; })()`);
    await durul();
    // Bant: görünür olmayıp ön çizim kuyruğunda olan sayfalar (geçerli sayfanın komşuları hariç); görünümün üstünde / altında kalanlar ve
    // görünümün ortasından en uzak bant sayfasının uzaklığı (ekran). Tuvali olan sayfaların en uzağı (boşaltma sınırının içinde mi)
    const bant = () => evalJs(`(() => {
      const g = window.__kc.g(), k = g.kaydirici, vt = k.scrollTop, vh = k.clientHeight, orta = vt + vh / 2;
      const komsu = new Set(g.komsuSayfalar());
      const sayfalar = g._onKuyruk.filter((i) => !komsu.has(i)).map((i) => g.yerlesim[i]).filter(Boolean);
      const ust = sayfalar.filter((y) => y.y + y.h < vt), alt = sayfalar.filter((y) => y.y > vt + vh);
      const uzak = (d) => +(Math.max(0, ...d) / vh).toFixed(2);
      const tuvalli = g.sayfalar.map((s, i) => [s, i]).filter(([s, i]) => s.canvas && !komsu.has(i)).map(([, i]) => g.yerlesim[i]).filter(Boolean);
      return { yon: g._yon.y, ust: ust.length, alt: alt.length, ustUzak: uzak(ust.map((y) => orta - (y.y + y.h))), altUzak: uzak(alt.map((y) => y.y - orta)),
        tuvalUstUzak: uzak(tuvalli.map((y) => orta - (y.y + y.h))), tuvalAltUzak: uzak(tuvalli.map((y) => y.y - orta)), sayfaH: Math.round(g.yerlesim[0].h), vh };
    })()`);
    const ortali = await bant();
    sonuc('Yön bilinmiyor: bant görünümün ortasından iki yana 1,5 ekran (önceki gibi)', ortali.yon === 0 && ortali.ust >= 1 && ortali.alt >= 1
      && Math.abs(ortali.ust - ortali.alt) <= 1 && ortali.ustUzak <= 1.5 && ortali.altUzak <= 1.5, ortali);
    await tekerlek(20, 100, 30);
    await bekle(400);
    await durul();
    const asagi = await bant();
    sonuc('Aşağı kaydırınca bant aşağıda 2, yukarıda 1 ekran', asagi.yon === 1 && asagi.alt > asagi.ust && asagi.altUzak > 1.5 && asagi.altUzak <= 2 && asagi.ustUzak <= 1, asagi);
    sonuc('Aşağı kaydırınca tuvalli sayfalar boşaltma sınırının içinde (yukarıda 3, aşağıda 4 ekran)', asagi.tuvalUstUzak <= 3 && asagi.tuvalAltUzak <= 4, asagi);
    await tekerlek(20, -100, 30);
    await bekle(400);
    await durul();
    const yukari = await bant();
    sonuc('Yukarı kaydırınca bant yukarıda 2, aşağıda 1 ekran', yukari.yon === -1 && yukari.ust > yukari.alt && yukari.ustUzak > 1.5 && yukari.ustUzak <= 2 && yukari.altUzak <= 1, yukari);
    sonuc('Yukarı kaydırınca tuvalli sayfalar boşaltma sınırının içinde (yukarıda 4, aşağıda 3 ekran)', yukari.tuvalUstUzak <= 4 && yukari.tuvalAltUzak <= 3, yukari);
    sonuc('Bandın sayfa sayısı yönden bağımsız (en çok 1 fark)', Math.abs((asagi.ust + asagi.alt) - (yukari.ust + yukari.alt)) <= 1 && Math.abs((asagi.ust + asagi.alt) - (ortali.ust + ortali.alt)) <= 1,
      { ortali: ortali.ust + ortali.alt, asagi: asagi.ust + asagi.alt, yukari: yukari.ust + yukari.alt });
    await evalJs(`(() => { window.__kc.g().sayfayaGit(200, { aninda: true }); return true; })()`);
    await durul();
    const gidince = await bant();
    sonuc('Sayfaya gidince yön bilinmez, bant yine ortalı', gidince.yon === 0 && Math.abs(gidince.ust - gidince.alt) <= 1 && gidince.ustUzak <= 1.5 && gidince.altUzak <= 1.5, gidince);
    await evalJs(`(async () => { const g = window.__kc.g(); g.kaydirici.style.bottom = ''; await g.zoomModuAyarla('genislik'); return true; })()`);
    await durul();
  }

  if (BOLUMLER.includes(6)) {
    console.log('--- 6) Form alanlı belge: ek katmanlar ve not katmanı yalnızca görünüm değişince kurulur');
    await belgeAc(FORMLU);
    // Çekirdek istekleri (yanıtı beklenenler dahil) ve not katmanı olayı (sayfaCizildi) görünümün örneğinde kaydedilir (belge kapanınca
    // görünümle birlikte gider). %600'deki tam sayfa form görüntüsü yavaştır (saniyeler): sayım, önceki çizimlerin istekleri bitince başlar
    await evalJs(`(() => { const K = window.__kc, g = K.g();
      K.istekler = []; K.notCizim = 0; K.bekleyen = 0;
      const ozgun = g.cekirdek;
      g.cekirdek = async (y, p, ...a) => { K.istekler.push({ y, sayfa: p?.sayfa, olcek: p?.olcek }); K.bekleyen++; try { return await ozgun(y, p, ...a); } finally { K.bekleyen--; } };
      g.addEventListener('sayfaCizildi', () => { K.notCizim++; });
      return true; })()`);
    const formIstekleri = () => evalJs('window.__kc.istekler.filter((r) => r.y === "form_gorunum")');
    const katmanlar = () => evalJs(`(() => { const g = window.__kc.g(); return [...g._gorunurKume].map((s) => ({ no: s.no, form: s.el.querySelectorAll('.form-katmani').length,
      bag: s.el.querySelectorAll('.baglanti-katmani').length })); })()`);
    const sifirla = () => evalJs('(() => { const K = window.__kc; K.sifirla(); K.istekler = []; K.notCizim = 0; return true; })()');
    const tamDurul = async () => {
      await durul();
      for (let ard = 0, t0 = Date.now(); Date.now() - t0 < 30000; await bekle(150)) if (await evalJs('window.__kc.bekleyen === 0')) { if (++ard >= 3) break; } else ard = 0;
      await durul();
    };
    await evalJs(`(() => { const g = window.__kc.g(); g.zoomAyarla(6); g.sayfayaGit(2, { aninda: true }); return true; })()`);
    await tamDurul();
    const ilk = await katmanlar();
    sonuc('%600: görünür sayfada form katmanı var', ilk.length >= 1 && ilk.every((s) => s.form === 1), ilk);
    await sifirla();
    await tekerlek(60, 100, 30);
    await bekle(400);
    // Kaydırma durduktan hemen sonra çekirdeğe giden sıradan bir istek (Sayfalar panelinin küçük resmi) form isteklerinin arkasında beklemez
    const kucuk = await evalJs(`(async () => { const g = window.__kc.g(), b = window.__pdefe.aktif(), t = performance.now();
      const r = await g.cekirdek('kucuk_resim', { yol: b.yol, sayfa: 15, genislik: 200 }); return { ms: Math.round(performance.now() - t), veri: !!r?.veri }; })()`);
    await tamDurul();
    const o = await evalJs('(() => { const K = window.__kc; return { olaylar: K.olaylar, notCizim: K.notCizim }; })()');
    const form = await formIstekleri();
    const yenileme = o.olaylar.filter((e) => e.tur === 'uygula' && e.tuvalliydi && !e.onizleme);
    const ilkCizim = {};   // tuvalsiz sayfanın çizimi (görünüm ilk kez): ek katmanlar kurulmalı
    for (const e of o.olaylar) if (e.tur === 'uygula' && !e.tuvalliydi && !e.onizleme) ilkCizim[e.no] = (ilkCizim[e.no] || 0) + 1;
    const formSayfa = {};
    for (const r of form) formSayfa[r.sayfa] = (formSayfa[r.sayfa] || 0) + 1;
    sonuc('%600: kaydırma sürerken aynı ölçekte en az 3 yeniden çizim (durum kuruldu)', yenileme.length >= 3, { yenileme: yenileme.length });
    sonuc('Aynı ölçekteki yeniden çizim form görüntüsü istemedi (yalnızca ilk kez çizilen sayfa için, sayfa başına en çok 1)',
      Object.entries(formSayfa).every(([no, n]) => n <= (ilkCizim[no] || 0)), { form: formSayfa, ilkCizim, yenileme: yenileme.length });
    const ilkToplam = Object.values(ilkCizim).reduce((a, n) => a + n, 0);
    sonuc('Aynı ölçekteki yeniden çizim not katmanını baştan kurmadı (sayfaCizildi yalnızca ilk çizimde)', o.notCizim <= ilkToplam, { notCizim: o.notCizim, ilkCizim: ilkToplam });
    sonuc('Kaydırma durduktan 0,4 sn sonra küçük resim isteği 1 sn içinde yanıtlandı', kucuk.veri && kucuk.ms < 1000, kucuk);
    const sonra = await katmanlar();
    sonuc('Kaydırmadan sonra görünür sayfalarda tek form katmanı', sonra.length >= 1 && sonra.every((s) => s.form === 1 && s.bag <= 1), sonra);
    // Ölçek değişince katman yeni ölçekte yeniden kurulur
    await sifirla();
    const yeni = await evalJs(`(() => { const g = window.__kc.g(); g.zoomAyarla(2.5); return Math.min(6, 2.5 * 96 / 72 * devicePixelRatio); })()`);
    await tamDurul();
    const zf = await formIstekleri(), zk = await katmanlar();
    sonuc('Ölçek değişince görünür sayfalar için form görüntüsü yeni ölçekte istendi, katman yerinde',
      zk.length >= 1 && zk.every((s) => s.form === 1 && zf.some((r) => r.sayfa === s.no && Math.abs(r.olcek - yeni) < 1e-6)), { istek: zf, katman: zk });
    // Sayfalar boşaltılıp yeniden çizilince (girdiBosalt katmanları siler) katman yeniden kurulur
    await sifirla();
    await evalJs('(() => { window.__kc.g().hepsiniYenidenCiz(); return true; })()');
    await tamDurul();
    const bf = await formIstekleri(), bk = await katmanlar();
    sonuc('Boşaltılıp yeniden çizilen sayfada form katmanı yeniden kuruldu', bk.length >= 1 && bk.every((s) => s.form === 1 && bf.some((r) => r.sayfa === s.no)), { istek: bf.length, katman: bk });
    await evalJs(`(async () => { await window.__kc.g().zoomModuAyarla('genislik'); return true; })()`);
    await durul();
  }

  if (BOLUMLER.includes(7)) {
    console.log('--- 7) Hızlı çizim ve keskinleşme işareti çizimin kendi sayaçlarından (eşzamanlı çizim)');
    await belgeAc(KARMA);
    // Görünümden uzak, hiç çizilmemiş bir fotoğraflı (tek) ve bir metinli (çift) sayfa kaydırma sürerken aynı anda çizilir: metinli sayfanın
    // çizimi işlem listesini beklerken fotoğraflı sayfanın görseli ertelenip işçiden istenir. Fotoğraf (1400 px genişlik) küçültülerek
    // çizilsin diye sayfa ~1000 cihaz pikseli genişliğe getirilir (büyütülen fotoğraf ertelenmez, Chromium yumuşatmasıyla çizilir)
    await evalJs(`(() => { const g = window.__kc.g(); g.zoomAyarla(1000 / (595 * 96 / 72 * devicePixelRatio)); g.sayfayaGit(1, { aninda: true }); return true; })()`);
    await durul();
    const sonuclar = [];
    for (const [a, b] of [[31, 34], [33, 36], [35, 38]]) {
      sonuclar.push(await evalJs(`(async () => {
        const K = window.__kc, g = K.g(), k = K.k, dpr = devicePixelRatio;
        const iA = ${a} - 1, iB = ${b} - 1, sA = g.sayfalar[iA], sB = g.sayfalar[iB];
        const pA = await g.sayfaAl(iA), pB = await g.sayfaAl(iB);
        const yA = g.yerAl(iA), yB = g.yerAl(iB), tam = (y) => ({ x: 0, y: 0, w: y.w, h: y.h });
        const zaman = setInterval(() => k.etkilesimBildir(), 50);
        k.etkilesimBildir();
        try {
          const [rA, rB] = await Promise.all([
            g.tuvalCiz(sA, pA, yA.olcek, g.toplamDondurme(sA), dpr, tam(yA), false),
            g.tuvalCiz(sB, pB, yB.olcek, g.toplamDondurme(sB), dpr, tam(yB), false),
          ]);
          for (const r of [rA, rB]) if (r) { r.canvas.width = r.canvas.height = 0; }
          return { a: ${a}, b: ${b}, A: rA && { hizli: rA.hizli, keskinlesir: rA.keskinlesir }, B: rB && { hizli: rB.hizli, keskinlesir: rB.keskinlesir } };
        } finally { clearInterval(zaman); }
      })()`));
      await durul();
    }
    sonuc('Fotoğraflı sayfa kaydırırken hızlı çizildi ve keskinleşecek (kendi görseli işçide)', sonuclar.every((r) => r.A?.hizli && r.A?.keskinlesir), sonuclar);
    sonuc('Aynı anda çizilen metinli sayfa hızlı / keskinleşecek sayılmadı', sonuclar.every((r) => r.B && !r.B.hizli && !r.B.keskinlesir), sonuclar);
    await evalJs(`(async () => { await window.__kc.g().zoomModuAyarla('genislik'); return true; })()`);
    await durul();
  }

  await gonder('Emulation.setCPUThrottlingRate', { rate: 1 });
  ws.close();
  await evalJs(`(async () => { for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true }); return true; })()`).catch(() => {});
  console.log(`\n${denetimSayisi} denetim, ${hataSayisi} hata`);
  if (hataSayisi) process.exitCode = 1;
}
