// Kaydırırken sayfa çizimi (0.2.3, kullanıcı isteği: "sayfaları kaydırırken daha hızlı yüklensin. hafif geç yükleniyor gibi oluyor").
// Gerçek girdiyle (CDP Input: tekerlek, Ctrl+tekerlek) sınanır; çizimler görünümün örnek düzeyinde sarılan yöntemleriyle kaydedilir.
//   1) Kısma: ölçek aynıyken yeniden çizim beklemez. %600'de (bölgesel çizim) tekerlekle kaydırırken görünür sayfanın bölgesi kaydırma
//      sürerken yenilenir, görünen alanın çoğu kaydırma boyunca çizili kalır (önceden 120 ms'lik bekleme her kaydırma olayında yeniden
//      kuruluyor, yeniden çizim ancak kaydırma durunca geliyordu). Ölçek değişince (Ctrl+tekerlekle yakınlaştırma sürerken) tuvali olan
//      sayfa yine son adımdan 120 ms sonra yeniden çizilir.
// Kullanım (ev ekranı benzeri; sayfa 6 MP'yi aşar):
//   .venv\Scripts\python.exe test\kaydirma_ornek_uret.py      (test\cikti\kaydirma\pdf yoksa betik kendisi üretir)
//   powershell -File test\baslat.ps1 -Port 9643 -Boyut "1800,1050" -Olcek 1.25      → PID=… yazar
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
const BOLUMLER = (process.env.BOLUM || '1').split(',').map((s) => +s.trim()).filter(Boolean);

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
  const pdfler = ['metin', 'karisik', 'taranmis'].map((a) => path.join(ORNEK, a + '.pdf'));
  if (pdfler.some((p) => !fs.existsSync(p))) execFileSync(PY, [path.join(KOK, 'test', 'kaydirma_ornek_uret.py'), ORNEK], { stdio: 'inherit' });
  const [METIN] = pdfler;

  // Tekerlek dizileri tek CDP bağlantısından, sabit aralıkla gönderilir
  const h = (await hedefler())[0];
  const ws = new WebSocket(h.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); const b = bekleyen.get(d.id); if (b) { bekleyen.delete(d.id); b(d); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(J({ id: i, method, params })); });
  const tekerlek = async (n, deltaY, ara, { ctrl = false } = {}) => {
    const m = await evalJs(`(() => { const r = window.__kc.g().kaydirici.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
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

  await gonder('Emulation.setCPUThrottlingRate', { rate: 1 });
  ws.close();
  await evalJs(`(async () => { for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true }); return true; })()`).catch(() => {});
  console.log(`\n${denetimSayisi} denetim, ${hataSayisi} hata`);
  if (hataSayisi) process.exitCode = 1;
}
