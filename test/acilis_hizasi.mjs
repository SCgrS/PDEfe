// Açılış ekranında PDF aç düğmesinin hizası ve boyutu (0.2.3, kullanıcı isteği: "ana ekrandaki PDF aç butonu biraz daha küçük olsun ve
// bitim sınırı sayfaları düzenle aracının bitim sınırıyla eşitlensin"):
//   1) Her pencere genişliğinde (704 … 2560 CSS px), sol panel kapalı ve açıkken (varsayılan 240 px ve geniş panel), PDF aç'ın sağ kenarı
//      Araçlar ızgarasındaki ikinci karonun (Sayfaları düzenle) sağ kenarıyla aynı (fark ≤ 0,05 px), sol kenarı sütunun sol kenarı. Izgara
//      tek sütuna inince (geniş panel, dar alan) PDF aç da sütunun tamamı; düğmenin içi taşmıyor, ekran yatay kaymıyor.
//   2) Düğme küçüldü: iç boşluk 16 / 20 px, simge kutusu 52 px, simge 30 px, ad 18 px; açıklama 13 px ve düğmenin içinde; düğme yine araç
//      kartlarından yüksek.
//   3) Pencere boyutu değişince (ızgaranın sütun sayısı değişince) hiza JS çalışmadan korunur: ölçümden önce yalnızca boyut değişir.
// Ekran ölçeği başlatırken verilir (baslat.ps1 -Olcek 1 / 1.25 / 1.5); genişlikler CDP Emulation ile, ölçek korunarak.
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9631 -Veri "$env:TEMP\pdefe-acilis-9631" -Boyut "1280,800" [-Olcek 1.25]      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9631; node test\surucu.mjs betik test\acilis_hizasi.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Ekran görüntüleri test/cikti/acilis_hizasi/<zaman>/png altında; hiçbir belge açılmaz, ayarlara yazılmaz (sol panel sonunda eski hâline döner).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG = path.join(KOK, 'test', 'cikti', 'acilis_hizasi', new Date().toISOString().replace(/\D/g, '').slice(0, 14), 'png');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
const ACIKLAMA = "Bilgisayarınızdaki bir ya da birkaç PDF'i seçin veya bu pencereye sürükleyin";

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const bilgi = (s) => console.log(`     · ${s}`);

/** Sürekli CDP oturumu (genişlik taklidi ve ekran görüntüsü aynı oturumda). */
async function cdpOturumu() {
  const hedefler = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const sayfa = hedefler.find((h) => h.type === 'page' && /^pdefe:\/\/app\/src\/renderer\/index\.html/.test(h.url));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder };
}

export default async function ({ evalJs, bekle }) {
  const cdp = await cdpOturumu();
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  const boyut = async (w, h) => {
    if (w) await cdp.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false });
    else await cdp.gonder('Emulation.clearDeviceMetricsOverride');
    await bekle(120);
  };
  const ss = async (ad) => { await bekle(200); const r = await cdp.gonder('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(PNG, ad + '.png'), Buffer.from(r.result.data, 'base64')); };
  const panelKur = (acik, g) => evalJs(`(() => { window.__pdefe.panel.acKapa(${acik}); ${g ? `window.__pdefe.panel.genislikAyarla(${g});` : ''} return 1; })()`);
  const hepsiniKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);

  fs.mkdirSync(PNG, { recursive: true });
  const dpr = await evalJs('devicePixelRatio');
  const panelOnce = await evalJs(`({ acik: window.__pdefe.panel.acik, g: parseFloat(document.querySelector('#sol-panel').style.width) || 240 })`);
  await hepsiniKapat();
  await kosul(`!document.querySelector('#baslangic').hidden`);
  bilgi(`ekran ölçeği ${dpr}`);

  const olc = () => evalJs(`(() => {
    const r = (e) => { const k = e.getBoundingClientRect(); return { l: k.left, r: k.right, t: k.top, b: k.bottom, w: k.width, h: k.height }; };
    const bas = document.querySelector('#baslangic'), ac = document.querySelector('.karsilama-ac'), cs = getComputedStyle(ac);
    const kartlar = [...document.querySelectorAll('.karsilama-arac')], izgara = document.querySelector('.karsilama-arac-izgara');
    const acik = ac.querySelector('.karsilama-aciklama');
    const ic = [...ac.querySelectorAll('*')].map(r).filter((x) => x.w > 0);
    return {
      gen: innerWidth, alan: { w: bas.clientWidth, sw: bas.scrollWidth }, docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      karsilama: r(document.querySelector('.karsilama')), ac: r(ac), kartlar: kartlar.map(r), sutun: getComputedStyle(izgara).gridTemplateColumns.split(' ').length,
      icTasma: ic.some((x) => x.r > r(ac).r - parseFloat(cs.paddingRight) + 0.5 || x.l < r(ac).l + parseFloat(cs.paddingLeft) - 0.5 || x.b > r(ac).b + 0.5 || x.t < r(ac).t - 0.5),
      olcu: { pt: cs.paddingTop, pl: cs.paddingLeft, ikon: [r(ac.querySelector('.karsilama-ac-ikon')).w, r(ac.querySelector('.karsilama-ac-ikon')).h].map((x) => Math.round(x * 10) / 10),
        simge: Math.round(r(ac.querySelector('.karsilama-ac-ikon svg')).w * 10) / 10,
        ad: getComputedStyle(ac.querySelector('.karsilama-ac-ad')).fontSize, aciklama: getComputedStyle(acik).fontSize, metin: acik.textContent },
    };
  })()`);

  try {
    // ================================================================ (1) hiza: pencere genişliği taraması, sol panel kapalı ve açık
    const durumlar = [];
    for (let w = 704; w <= 2560; w += 41) durumlar.push([w, 800, null]);
    for (const w of [720, 760, 900, 1000, 1024, 1280, 1366, 1536, 1600, 1920, 2560]) durumlar.push([w, 800, null]);
    for (let w = 704; w <= 1920; w += 67) durumlar.push([w, 800, 240]);
    // Geniş panel: içerik alanı daralır, ızgara 3 → 2 → 1 sütuna iner (720 px pencerede 432 px panel: alan 240 px, tek sütun)
    for (const g of [300, 380, 432, 470, 520, 560, 600, 640]) durumlar.push([1024, 800, g]);
    for (const [w, g] of [[720, 432], [900, 540], [1280, 760]]) durumlar.push([w, 800, g]);
    let enBuyukFark = 0, sutunlar = new Set(), tekSutun = 0, hatali = [];
    let oncekiPanel;
    for (const [w, h, g] of durumlar) {
      const anahtar = g ? `açık ${g}` : 'kapalı';
      if (anahtar !== oncekiPanel) { await panelKur(!!g, g); oncekiPanel = anahtar; }
      await boyut(w, h);
      const o = await olc();
      const k2 = o.kartlar[1], fark = Math.abs(o.ac.r - k2.r);
      sutunlar.add(o.sutun);
      enBuyukFark = Math.max(enBuyukFark, fark);
      const tek = o.sutun === 1;
      if (tek) tekSutun++;
      const ok = fark <= 0.05 && Math.abs(o.ac.l - o.karsilama.l) <= 0.05 && (!tek || Math.abs(o.ac.w - o.karsilama.w) <= 0.05)
        && (tek || Math.abs(o.ac.w - (k2.r - o.kartlar[0].l)) <= 0.05) && !o.icTasma && o.alan.sw <= o.alan.w && o.docScroll <= 0;
      if (!ok) hatali.push({ w, panel: anahtar, sutun: o.sutun, ac: [o.ac.l, o.ac.r], kart2: [k2.l, k2.r], karsilama: [o.karsilama.l, o.karsilama.r], icTasma: o.icTasma, alan: o.alan, docScroll: o.docScroll });
    }
    sonuc(`${durumlar.length} durumda (704–2560 px, panel kapalı / 240 px / geniş) PDF aç'ın sağ kenarı ikinci karonun sağ kenarında, sol kenarı sütunun solunda; düğmenin içi ve ekran taşmıyor`,
      hatali.length === 0, hatali.slice(0, 5));
    bilgi(`en büyük fark ${enBuyukFark.toFixed(3)} px; ızgaranın sütun sayıları: ${[...sutunlar].sort().join(', ')}; tek sütunlu ${tekSutun} durum`);
    sonuc('Tarama ızgaranın bütün sütun sayılarını (1–5) kapsıyor', [1, 2, 3, 4, 5].every((n) => sutunlar.has(n)), [...sutunlar]);
    // Tek sütunda düğme sütunun tamamı (karolar gibi), ekran görüntüsü
    await panelKur(true, 432); await boyut(720, 800);
    let o = await olc();
    sonuc('[720 px, panel 432 px] Izgara tek sütun; PDF aç da sütunun tamamı, karolarla aynı genişlik',
      o.sutun === 1 && Math.abs(o.ac.w - o.karsilama.w) <= 0.05 && Math.abs(o.ac.w - o.kartlar[1].w) <= 0.05 && !o.icTasma, { sutun: o.sutun, ac: o.ac, kart2: o.kartlar[1] });
    await ss('tek-sutun-720-panel-432');
    await panelKur(false); oncekiPanel = 'kapalı';

    // ================================================================ (2) ölçüler
    for (const w of [1280, 1920, 760]) {
      await boyut(w, 800);
      o = await olc();
      const enYuksekKart = Math.max(...o.kartlar.map((k) => k.h));
      sonuc(`[${w} px] PDF aç küçüldü: iç boşluk 16 / 20 px, simge kutusu 52 px, simge 30 px, ad 18 px; açıklama 13 px, metni aynı`,
        o.olcu.pt === '16px' && o.olcu.pl === '20px' && J(o.olcu.ikon) === J([52, 52]) && o.olcu.simge === 30 && o.olcu.ad === '18px' && o.olcu.aciklama === '13px' && o.olcu.metin === ACIKLAMA, o.olcu);
      sonuc(`[${w} px] PDF aç araç kartlarından yüksek (${o.ac.h.toFixed(1)} > ${enYuksekKart.toFixed(1)} px), 0.2.2'nin 110 px'inden alçak`, o.ac.h > enYuksekKart + 10 && o.ac.h < 110, { ac: o.ac.h, kart: enYuksekKart });
      bilgi(`[${w} px] PDF aç ${o.ac.w.toFixed(1)} × ${o.ac.h.toFixed(1)}, ${o.sutun} sütun`);
      await ss(`acilis-${w}`);
    }
    // Sol panel açıkken
    await panelKur(true, 240); await boyut(1280, 800);
    o = await olc();
    sonuc('[1280 px, panel 240 px] Hizalı', Math.abs(o.ac.r - o.kartlar[1].r) <= 0.05, { ac: o.ac, kart2: o.kartlar[1] });
    await ss('acilis-1280-panel-240');
  } finally {
    await boyut(0).catch(() => {});
    await panelKur(panelOnce.acik, panelOnce.g).catch(() => {});
    cdp.ws.close();
  }
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti; ekran görüntüleri: ${PNG}`);
}
