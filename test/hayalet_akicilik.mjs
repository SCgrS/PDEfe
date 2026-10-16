// Sürüklenen sekmenin ön izleme penceresinin akıcılığı (0.2.7, kullanıcı isteği: "Sekmeleri kaldırınca biraz kasmaya başlıyor, basılı
// tuttuğumuz küçük kare şeklindeki sekme. Bunu daha sakin, daha akışkan yapabilir miyiz?").
// Sekme şeridin dışına sürüklenir (CDP fare olayları; düğme basılı kalır), ön izleme görününce ana sürecin imleci test kancasıyla
// (test:imlecYolu) sabit hızla kaydırılır ve şu ölçülür:
//   - ana sürecin ön izlemeyi taşıyan adımlarının aralıkları (test:hayaletOlcum: ortalama, ortanca, %95, en çok; 25 ms'den uzun aralık sayısı)
//   - pencerenin yerinin değiştirilmesinin süresi (setBounds / setPosition)
//   - pencerenin ekrandaki yerinin dışarıdan okunan değişme aralıkları (test/hayalet_izle.ps1, GetWindowRect; $env:PDEFE_HA_PID verilirse)
//   - ön izlemenin gösterilme süresi (sürükleme başlayınca pencerenin görünmesine dek)
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9481 -Veri "$env:TEMP\pdefe-ha-9481"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9481; $env:PDEFE_HA_PID=<PID>; node test\surucu.mjs betik test\hayalet_akicilik.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Ek: $env:HA_SURE (ms, varsayılan 3000), $env:HA_TEKRAR (varsayılan 2: ilk sürükleme ön izleme penceresini kurar, sonrakiler yeniden kullanır).
// 0.2.8: belge turlarından sonra bir tur da boş sekmeyle ("Yeni sekme"; artık o da pencereye ayrılır): ön izlemesi yalnızca başlık, aynı ölçütler.
// Sonuçlar test/cikti/hayalet/sonuc-<zaman>.json'a da yazılır. Ekran dışındaki örnekte ön izleme de ekran dışındadır (kişinin ekranına çıkmaz).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 'hayalet');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
const SURE = Number(process.env.HA_SURE || 3000);
const TEKRAR = Number(process.env.HA_TEKRAR || 2);

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

/** Aralıkların özeti (ms). */
function ozet(dizi) {
  const a = [...dizi].sort((x, y) => x - y);
  if (!a.length) return { n: 0 };
  const yuzde = (p) => a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))];
  const ort = a.reduce((t, x) => t + x, 0) / a.length;
  const sapma = Math.sqrt(a.reduce((t, x) => t + (x - ort) ** 2, 0) / a.length);
  const y = (x) => Math.round(x * 100) / 100;
  return { n: a.length, ort: y(ort), sapma: y(sapma), ortanca: y(yuzde(0.5)), p95: y(yuzde(0.95)), enCok: y(a[a.length - 1]), uzun25: a.filter((x) => x > 25).length };
}
const araliklar = (zamanlar) => zamanlar.slice(1).map((t, i) => t - zamanlar[i]);

/** Bir pencereye ham girdi oturumu: fare düğmesi adımlar arasında basılı kalabilsin (senaryo22'deki gibi). */
async function girdi(hedefId) {
  const hepsi = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const ws = new WebSocket(hepsi.find((h) => h.id === hedefId).webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0; const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  const fare = (type, x, y, buttons) => gonder('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: 1 });
  return {
    bas: async (x, y) => { await fare('mouseMoved', x, y, 0); await fare('mousePressed', x, y, 1); },
    git: async (x0, y0, x1, y1, adim = 8) => { for (let i = 1; i <= adim; i++) await fare('mouseMoved', x0 + ((x1 - x0) * i) / adim, y0 + ((y1 - y0) * i) / adim, 1); },
    birak: (x, y) => fare('mouseReleased', x, y, 0),
    esc: async () => { for (const type of ['rawKeyDown', 'keyUp']) await gonder('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); },
    kapat: () => ws.close(),
  };
}

export default async function ({ evalJs, bekle, hedefler, hedefSec }) {
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(80); } };
  const ana = (kanal, ...args) => evalJs(`window.pdefe.cagir(${J(kanal)}, ...${J(args)})`);
  fs.mkdirSync(K, { recursive: true });
  const ilk = (await hedefler())[0].id;
  hedefSec(ilk);
  // Hazırlık: üç belge (sekme şeridinde üç sekme)
  await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  for (const ad of ['a', 'b', 'c']) {
    const y = path.join(K, `${ad}.pdf`);
    if (!fs.existsSync(y)) execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), y, '2', `Belge ${ad}`]);
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(y)}); return true; })()`);
  }
  await kosul(`window.__pdefe.sekmeler.sekmeler.length === 3`);
  await bekle(800);
  const pencere = (await ana('test:pencereler')).find((p) => p.yollar.length === 3) || (await ana('test:pencereler'))[0];
  const tumOlcumler = [];
  const turlar = [...Array.from({ length: TEKRAR }, () => false), true];   // true: boş sekme turu (0.2.8)
  for (let tur = 1; tur <= turlar.length; tur++) {
    const bos = turlar[tur - 1];
    if (bos) { await evalJs(`(window.__pdefe.komutCalistir('sekme.yeni'), true)`); await bekle(500); }
    const yer = await evalJs(`(() => { const ss = window.__pdefe.sekmeler.sekmeler; const s = ${bos} ? ss.at(-1) : ss.find((x) => x.ad === 'c.pdf'); const r = s.el.getBoundingClientRect(); const c = document.querySelector('#sekme-cubugu').getBoundingClientRect(); return { id: s.id, x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2), alt: c.bottom }; })()`);
    const g = await girdi(ilk);
    // Dış izleyici (pencerenin ekrandaki yeri): sürüklemeden önce başlar, derlenmesi ~1-2 sn
    let izleyici = null, izDosya = null;
    if (process.env.PDEFE_HA_PID) {
      izDosya = path.join(K, `izle-${tur}.txt`);
      fs.rmSync(izDosya, { force: true });
      izleyici = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'hayalet_izle.ps1'), '-SurecNo', String(process.env.PDEFE_HA_PID), '-SureMs', String(SURE + 4000), '-Cikti', izDosya], { stdio: 'ignore', windowsHide: true });
      const t0 = Date.now(); while (!fs.existsSync(izDosya) && Date.now() - t0 < 10000) await bekle(100);
    }
    await ana('test:imlecYolu', null);
    await ana('test:imlec', { x: pencere.icerik.x + 300, y: pencere.icerik.y + 300 });
    await g.bas(yer.x, yer.y);
    await g.git(yer.x, yer.y, yer.x + 30, yer.alt + 120);
    const gorundu = await kosul(`window.pdefe.cagir('test:hayalet').then((h) => !!h && h.gorunur)`, 6000);
    await bekle(300);
    // Ölçüm: imleç sabit hızla (400 px/sn yatay, 60 px/sn dikey) kayar
    await ana('test:hayaletOlcum', 'basla');
    await ana('test:imlecYolu', { x: pencere.icerik.x + 200, y: pencere.icerik.y + 250, vx: 400, vy: 60 });
    await bekle(SURE);
    const o = await ana('test:hayaletOlcum', 'bitir');
    await ana('test:imlecYolu', null);
    await g.esc(); await bekle(300); await g.birak(yer.x + 30, yer.alt + 120); g.kapat();
    await bekle(400);
    if (bos) await evalJs(`(async () => { window.__pdefe.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: ${J(yer.id)} } })); await new Promise((r) => setTimeout(r, 200)); return true; })()`);
    let dis = null;
    if (izleyici) {
      const t0 = Date.now(); while (Date.now() - t0 < SURE + 8000 && !/^BITTI/.test(fs.readFileSync(izDosya, 'utf8'))) await bekle(200);
      const satirlar = fs.readFileSync(izDosya, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((s) => s.split(' ').map(Number));
      // Ölçüm penceresindeki hareketler: imleç yolunun x aralığında (ön izleme imlecin solunda, tutma noktası kadar)
      const xs = o.konumlar.map((k) => k.x);
      const enAz = Math.min(...xs), enCok = Math.max(...xs);
      const hareket = satirlar.filter(([, x]) => x >= enAz && x <= enCok).map(([t]) => t);
      dis = { degisim: hareket.length, aralik: ozet(araliklar(hareket)) };
    }
    const adim = ozet(araliklar(o.adimlar.map((a) => a.t)));
    const konum = ozet(araliklar(o.konumlar.map((k) => k.t)));
    const tasima = ozet(o.konumlar.map((k) => k.sure));
    const gosterim = o.gosterim?.gorunur != null ? Math.round(o.gosterim.gorunur - o.gosterim.istek) : null;
    const kayit = { tur, bos, gorundu: !!gorundu, adimAraligi: adim, konumAraligi: konum, tasimaSuresi: tasima, disAralik: dis, gosterimMs: gosterim };
    tumOlcumler.push(kayit);
    console.log(`\n== Tur ${tur}${bos ? ' (boş sekme, 0.2.8)' : tur === 1 ? ' (ön izleme penceresi kuruluyor)' : ' (pencere yeniden kullanılıyor)'}`);
    console.log('adım aralığı (ms)      ', J(adim));
    console.log('konum değişimi (ms)    ', J(konum));
    console.log('yer değiştirme süresi  ', J(tasima));
    if (dis) console.log('dışarıdan (GetWindowRect)', J(dis));
    console.log('gösterilme (ms)        ', gosterim);
  }
  fs.writeFileSync(path.join(K, `sonuc-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.json`), J(tumOlcumler, null, 1));
  // Ölçütler (0.2.7 düzeltmesinden sonra): ekran tazelemesine bağlı adımlar ~16,7 ms aralıkla, düzenli. Son belge turu ve boş sekme turu (0.2.8)
  sonuc('Ön izleme sürükleyince göründü (belge ve boş sekme)', tumOlcumler.every((x) => x.gorundu), tumOlcumler.map((x) => [x.tur, x.bos, x.gorundu]));
  for (const son of [tumOlcumler.filter((x) => !x.bos).at(-1), tumOlcumler.find((x) => x.bos)]) {
    const ad = son.bos ? 'Boş sekme' : 'Belge';
    sonuc(`${ad}: konum güncellemeleri düzenli: ortanca 14–19 ms, %95 ≤ 22 ms, 25 ms'den uzun aralık yok denecek kadar az (≤ %2)`,
      son.konumAraligi.ortanca >= 14 && son.konumAraligi.ortanca <= 19 && son.konumAraligi.p95 <= 22 && son.konumAraligi.uzun25 <= Math.ceil(son.konumAraligi.n * 0.02), son.konumAraligi);
    if (son.disAralik) sonuc(`${ad}: dışarıdan görülen hareket de düzenli: %95 ≤ 22 ms`, son.disAralik.aralik.p95 <= 22 && son.disAralik.aralik.n >= SURE / 25, son.disAralik);
    sonuc(`${ad}: yer değiştirme kısa: %95 ≤ 4 ms`, son.tasimaSuresi.p95 <= 4, son.tasimaSuresi);
  }
  console.log(`\n${denetim} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}`);
  await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  if (hataSayisi) process.exitCode = 1;
}
