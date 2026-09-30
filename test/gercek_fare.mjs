// Gerçek girdiyle sekme ayırma (0.1.19): test/gercek_fare.ps1'in sürücü adımları. CDP fare olayları tarayıcı sürecinin girdi yolunu ve
// fare yakalamasını atlar; burada fare iletilerini görünmeyen masaüstündeki yardımcı (fare_gonder.ps1) gönderir, bu betik yalnızca
// belgeleri açar ve DOM'u izler. Adım PDEFE_GF_ADIM ile seçilir:
//   hazirla  PDEFE_GF_KLASOR'daki a.pdf, b.pdf, c.pdf açılır; etkin sekmenin tutulacağı nokta PDEFE_GF_KLASOR\nokta.json'a yazılır
//   izle     PDEFE_GF_SURE ms boyunca ilk pencerenin durumu örneklenir (değişince yazılır); sonunda pencereler listelenir
// Kullanım: powershell -File test\gercek_fare.ps1
import fs from 'node:fs';
import path from 'node:path';

const J = (x) => JSON.stringify(x);
const K = process.env.PDEFE_GF_KLASOR || path.resolve('test/cikti/gercek-fare');

export default async function ({ evalJs, bekle, hedefler, hedefSec }) {
  const adim = process.env.PDEFE_GF_ADIM || 'hazirla';
  const ilk = (await hedefler())[0].id;
  hedefSec(ilk);
  if (adim === 'hazirla') {
    await evalJs(`(async () => { const p = window.__pdefe; for (const ad of ['a.pdf', 'b.pdf', 'c.pdf']) await p.dosyaAc(${J(K + path.sep)} + ad); await new Promise((r) => setTimeout(r, 1500)); return true; })()`);
    const v = await evalJs(`(() => { const r = document.querySelector('.sekme.aktif').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + 15), dpr: devicePixelRatio, ic: innerHeight, sekmeler: window.__pdefe.sekmeler.sekmeler.map((s) => s.ad), odak: document.hasFocus() }; })()`);
    fs.writeFileSync(path.join(K, 'nokta.json'), J(v));
    console.log('hazır', J(v));
    return;
  }
  const sure = Number(process.env.PDEFE_GF_SURE || 10000);
  let onceki = '';
  const t0 = Date.now();
  while (Date.now() - t0 < sure) {
    let d;
    try {
      hedefSec(ilk);
      d = J(await evalJs(`({ ayrildi: !!document.querySelector('.sekme.ayrildi'), askida: !!document.querySelector('.sekme.askida'), odak: document.hasFocus(), sekmeler: window.__pdefe.sekmeler.sekmeler.map((s) => s.ad).join(','), tasima: window.__pdefe.tasimaSuruyor() })`));
    } catch (e) { d = 'okunamadı: ' + e.message; }
    const satir = `${d} pencere=${(await hedefler()).length}`;
    if (satir !== onceki) { console.log(`+${Date.now() - t0} ms`, satir); onceki = satir; }
    await bekle(150);
  }
  for (const x of await hedefler()) {
    hedefSec(x.id);
    console.log('pencere', J(await evalJs(`({ sekmeler: window.__pdefe.sekmeler.sekmeler.map((s) => s.ad), odak: document.hasFocus(), gorunur: document.visibilityState })`)));
  }
}
