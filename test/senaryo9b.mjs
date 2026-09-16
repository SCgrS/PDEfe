// Kilitli dosya: çekirdek çağrısı doğrudan hata veriyor mu?
import { spawn } from 'node:child_process';
const A = 'C:/Projeler/PDEfe/test/cikti/kilit-a.pdf';
export default async function ({ evalJs, bekle }) {
  const kilit = spawn('C:/Projeler/PDEfe/.venv/Scripts/python.exe', ['test/kilitle.py', A, '15'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => kilit.stdout.on('data', () => r()));
  await bekle(300);
  console.log('doğrudan çekirdek:', await evalJs(`(async () => { try { const r = await window.pdefe.cagir('cekirdek:cagir', 'notlar_kaydet', { yol: ${JSON.stringify(A)}, hedef: ${JSON.stringify(A)}, islemler: [], artimli: true }, 777); return { sonuc: r }; } catch (e) { return { hata: e.message.slice(0, 200) }; } })()`));
  console.log('belgeKaydet:', await evalJs(`(async () => { const p = window.__pdefe; const a = [...p.belgeler.values()].find(x => x.ad === 'kilit-a.pdf'); await p.sekmeSec(a.id); const s = a.gorunum.sayfalar[0]; const k = s.el.getBoundingClientRect(); a.notlar.yapiskanNotKoy(0, { clientX: k.left + 120, clientY: k.top + 120 }); a.notlar.balonKapat(); window.__pdefeOtoYanit = { secim: 1, onay: false, son: null }; const ok = await p.belgeKaydet(a); return { ok, degisti: a.degisti, soru: window.__pdefeOtoYanit.son?.mesaj, ayrinti: window.__pdefeOtoYanit.son?.ayrinti?.slice(0, 120), dugmeler: window.__pdefeOtoYanit.son?.dugmeler }; })()`));
  kilit.kill();
}
