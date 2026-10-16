// Senaryo 41 (0.2.8, kullanıcı istekleri; araç pencereleri):
//   1) Karo açıklamaları (madde 1 ve 5): Format Değiştir "PDF, UDF, Word, TIFF, JPG dosya formatlarını değiştirir", Birleştir "Birleştirir,
//      farklı dosya formatlarıyla çalışabilir" (açılış ekranı, Araçlar penceresi). Açılış ekranında (1280, 1000, 800 ve 704 px genişlikte) ve
//      Araçlar penceresinde (geniş ve dar pencerede) bütün karolar aynı yükseklikte.
// Girdiler test/ornek_pdf_uret.py ile test/cikti/s41/girdi altında üretilir (gerçek belge yok). Araçların çıktı klasörü test klasörüdür.
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9441 -Veri "$env:TEMP\pdefe-s41-9441" -Boyut "1280,1000" [-Olcek 1.25]
//   $env:PDEFE_CDP_PORT=9441; node test\surucu.mjs betik test\senaryo41.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,3". Ekran görüntüleri test/cikti/s41/png altına.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's41');
const GIRDI = path.join(UI, 'girdi');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const bilgi = (s) => console.log(`     · ${s}`);
/** Bu koşum için boş çıktı klasörü (test/cikti/s41/<ad>-<zaman>). */
const KOSUM = Date.now().toString(36);
const yeniKlasor = (ad) => { const k = path.join(UI, `${ad}-${KOSUM}`); fs.mkdirSync(k, { recursive: true }); return k; };
const yakin = (a, b, pay = 0.5) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= pay;

/** Örnek PDF (sayfa sayısı, başlık); var olanı yeniden üretmez. */
function ornekPdf(ad, sayfa = 2, baslik = 'Deneme belgesi') {
  const yol = path.join(GIRDI, ad);
  if (!fs.existsSync(yol)) execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yol, String(sayfa), baslik], { encoding: 'utf8' });
  return yol;
}

/** Sürekli CDP oturumu (pencere genişliği taklidi; acilis_hizasi.mjs'teki gibi). */
async function cdpOturumu() {
  const liste = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const sayfa = liste.find((h) => h.type === 'page' && /^pdefe:\/\/app\/src\/renderer\/index\.html/.test(h.url));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder };
}

/** Sayfada: öğenin kutusu (CSS px). */
const KUTU = `window.__s41kutu = (e) => { if (typeof e === 'string') e = document.querySelector(e); if (!e) return null; const r = e.getBoundingClientRect();
  return { sol: r.left, sag: r.right, ust: r.top, alt: r.bottom, w: r.width, h: r.height, ortaX: r.left + r.width / 2, ortaY: r.top + r.height / 2 }; }; true`;

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await evalJs(ifade); } catch { v = null; }
      if (v || Date.now() - t0 > sure) return v;
      await bekle(120);
    }
  };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  fs.mkdirSync(GIRDI, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  await evalJs(KUTU);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const olcek = await evalJs('devicePixelRatio');
  bilgi(`ekran ölçeği ${olcek}`);
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const ciktiKlasoruAyarla = (k) => evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'ciktiKlasoru', ${J(k)}); window.__pdefe.ayar().ciktiKlasoru = ${J(k)}; return true; })()`);
  const araclariKapat = () => evalJs(`(async () => { const eski = window.__pdefeOtoYanit; window.__pdefeOtoYanit = { secim: 0 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); } finally { window.__pdefeOtoYanit = eski; } return true; })()`);
  fs.mkdirSync(path.join(UI, 'cikti'), { recursive: true });
  await ciktiKlasoruAyarla(path.join(UI, 'cikti'));
  const cdp = await cdpOturumu();
  const genislik = async (w, h = 900) => {
    if (w) await cdp.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false });
    else await cdp.gonder('Emulation.clearDeviceMetricsOverride');
    await bekle(200);
  };

  // ------------------------------------------------------------ 1) Karo açıklamaları ve eşit karo yüksekliği (madde 1 ve 5)
  if (bolum(1)) {
    console.log('\n== 1) Karo açıklamaları; açılış ekranında ve Araçlar penceresinde karolar eşit yükseklikte');
    await araclariKapat(); await sekmeleriKapat();
    await kosul(`!document.querySelector('#baslangic').hidden`);
    const BEKLENEN = { 'arac.gorselBirlestir': 'Birleştirir, farklı dosya formatlarıyla çalışabilir', 'arac.donustur': 'PDF, UDF, Word, TIFF, JPG dosya formatlarını değiştirir' };
    const acilis = () => evalJs(`[...document.querySelectorAll('.karsilama-arac')].map((k) => ({ komut: k.dataset.eylem, aciklama: k.querySelector('.karsilama-aciklama').textContent,
      h: Math.round(k.getBoundingClientRect().height * 10) / 10, ust: Math.round(k.getBoundingClientRect().top) }))`);
    let a = await acilis();
    sonuc('1) Açılış ekranı: Format Değiştir ve Birleştir karolarının açıklaması kullanıcının yazdığı gibi', Object.entries(BEKLENEN).every(([k, v]) => a.find((x) => x.komut === k)?.aciklama === v),
      a.map((x) => [x.komut, x.aciklama]));
    for (const w of [1280, 1000, 800, 704]) {
      await genislik(w);
      a = await acilis();
      const h = a.map((x) => x.h);
      sonuc(`1) Açılış ekranı ${w} px: altı karo aynı yükseklikte`, a.length === 6 && h.every((x) => yakin(x, h[0], 0.6)), a.map((x) => [x.komut, x.h, x.ust]));
      if (w === 1280) await ss('01-acilis-1280');
    }
    // Araçlar penceresi (araç çubuğundaki düğme; dar pencerede iki sütun)
    for (const w of [1280, 690]) {
      await genislik(w);
      await evalJs(`(document.querySelector('#dugme-araclar').click(), true)`);
      await kosul(`!document.querySelector('#araclar-penceresi').hidden`, 3000);
      await bekle(250);
      const k = await evalJs(`[...document.querySelectorAll('.araclar-karo')].map((k) => ({ komut: k.dataset.aracKomut, aciklama: k.querySelector('.araclar-aciklama').textContent,
        h: Math.round(k.getBoundingClientRect().height * 10) / 10, w: Math.round(k.getBoundingClientRect().width), ust: Math.round(k.getBoundingClientRect().top), sol: Math.round(k.getBoundingClientRect().left) }))`);
      const sutun = new Set(k.map((x) => x.sol)).size;
      sonuc(`1) Araçlar penceresi ${w} px: açıklamalar yeni metin, ${w > 700 ? 3 : 2} sütun, karolar 200 px genişlikte ve aynı yükseklikte`, Object.entries(BEKLENEN).every(([kk, v]) => k.find((x) => x.komut === kk)?.aciklama === v)
        && sutun === (w > 700 ? 3 : 2) && k.every((x) => x.w === 200 && yakin(x.h, k[0].h, 0.6)), k);
      if (w === 1280) await ss('01-araclar-penceresi');
      await evalJs(`(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`);
      await evalJs(`(document.querySelector('#araclar-penceresi').hidden || document.querySelector('#dugme-araclar').click(), true)`);
      await kosul(`document.querySelector('#araclar-penceresi').hidden`, 3000);
    }
    await genislik(0);
  }

  const hatalar = await evalJs('window.__hatalar || []');
  sonuc('Renderer konsolunda hata yok', !hatalar.length, hatalar);
  try { cdp.ws.close(); } catch { /* yok say */ }
  console.log(`\n${denetim} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}  (ekran görüntüleri: ${PNG})`);
  if (hataSayisi) process.exitCode = 1;
}
