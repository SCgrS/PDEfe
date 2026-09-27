// Senaryo 9: kaydedilmemiş değişiklik sorusu (sekme değiştirince SORULMAZ, sekme kapatılınca sorulur); kilitli dosyaya kaydetme uyarısı.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const D = 'C:/Users/Kullanici/Desktop/PDF DENEME/';
const A = 'C:/Projeler/PDEfe/test/cikti/kilit-a.pdf';
const B = 'C:/Projeler/PDEfe/test/cikti/kilit-b.pdf';

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  fs.copyFileSync(D + 'Deneme Kişi SGK işe giriş (1).pdf', A);
  fs.copyFileSync(D + 'daf3dfc4-0c16-4317-9868-6d1f0393c8cd.pdf', B);
  await evalJs(`(async () => { const p = window.__pdefe; window.__pdefeOtoYanit = { secim: 1, onay: false }; const a = p.ayar(); a.otomatikKaydet = false; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); await p.dosyaAc(${JSON.stringify(A)}); await p.dosyaAc(${JSON.stringify(B)}); await new Promise(r => setTimeout(r, 1200)); return true; })()`);

  // A'ya not ekle (kirli yap): önce A'yı seç
  console.log('A kirli:', await evalJs(`(async () => { const p = window.__pdefe; const a = [...p.belgeler.values()].find(b => b.ad === 'kilit-a.pdf'); await p.sekmeSec(a.id); await new Promise(r => setTimeout(r, 700)); const s = a.gorunum.sayfalar[0]; const k = s.el.getBoundingClientRect(); a.notlar.sayfayaNotKoy(0, { clientX: k.left + 200, clientY: k.top + 200 }); const ta = document.querySelector('.not-balonu textarea.icerik'); ta.value = 'kilit testi'; ta.dispatchEvent(new Event('blur')); a.notlar.balonKapat(); return { degisti: a.degisti, aktif: p.aktif().ad }; })()`));

  // 1) Sekme değiştir (A→B→A→B) → soru SORULMAMALI; değişiklik sekmede kalmalı. Otomatik yanıt 2 = Vazgeç: yanlışlıkla sorulursa geçiş de durur, fark görünür.
  console.log('sekme değiştir (soru yok):', await evalJs(`(async () => { const p = window.__pdefe; const a = [...p.belgeler.values()].find(x => x.ad === 'kilit-a.pdf'); const b = [...p.belgeler.values()].find(x => x.ad === 'kilit-b.pdf'); window.__pdefeOtoYanit = { secim: 2, onay: false, son: null }; await p.sekmeSec(b.id); await new Promise(r => setTimeout(r, 500)); const ilkAktif = p.aktif().ad; await p.sekmeSec(a.id); await p.sekmeSec(b.id); await new Promise(r => setTimeout(r, 300)); const s = window.__pdefeOtoYanit.son; return { soruldu: !!s, mesaj: s?.mesaj?.slice(0, 60), ilkAktif, aktif: p.aktif().ad, aHalaKirli: a.degisti, notSayisi: a.notlar.liste().length }; })()`));
  // 2) Kirli A sekmesini kapat → soru SORULMALI (otomatik yanıt 2 = Vazgeç): A açık ve kirli kalmalı
  console.log('kirli sekmeyi kapat (Vazgeç):', await evalJs(`(async () => { const p = window.__pdefe; const a = [...p.belgeler.values()].find(x => x.ad === 'kilit-a.pdf'); window.__pdefeOtoYanit = { secim: 2, onay: false, son: null }; const kapandi = await p.belgeKapat(a.id); const s = window.__pdefeOtoYanit.son; return { soruldu: !!s, mesaj: s?.mesaj?.slice(0, 60), ayrinti: s?.ayrinti?.slice(0, 60), dugmeler: s?.dugmeler, kapandi, aHalaAcik: p.belgeler.has(a.id), aHalaKirli: a.degisti }; })()`));
  // 3) Temiz B sekmesini kapat → soru sorulmamalı, sekme kapanmalı
  console.log('temiz sekmeyi kapat:', await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find(x => x.ad === 'kilit-b.pdf'); window.__pdefeOtoYanit = { secim: 2, onay: false, son: null }; const kapandi = await p.belgeKapat(b.id); await new Promise(r => setTimeout(r, 300)); return { soruldu: !!window.__pdefeOtoYanit.son, kapandi, sekmeler: p.sekmeler.sekmeler.map(x => x.ad), aktif: p.aktif()?.ad }; })()`));

  // 4) Kilitli dosyaya kaydet: A'yı dış süreçle kilitle, kaydet → uyarı (otomatik yanıt: Vazgeç)
  const kilit = spawn('C:/Projeler/PDEfe/.venv/Scripts/python.exe', ['test/kilitle.py', A, '12'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => kilit.stdout.on('data', () => r()));
  console.log('kilitli kaydet:', await evalJs(`(async () => { const p = window.__pdefe; const a = [...p.belgeler.values()].find(x => x.ad === 'kilit-a.pdf'); await p.sekmeSec(a.id); window.__pdefeOtoYanit = { secim: 1, onay: false, son: null }; const ok = await p.belgeKaydet(a); return { ok, mesaj: window.__pdefeOtoYanit.son?.mesaj, ayrinti: window.__pdefeOtoYanit.son?.ayrinti?.slice(0, 90), dugmeler: window.__pdefeOtoYanit.son?.dugmeler, degisti: a.degisti }; })()`));
  kilit.kill();
  await bekle(500);
  // 5) Kilit kalkınca kaydet başarılı olmalı
  console.log('kilit kalkınca kaydet:', await evalJs(`(async () => { const p = window.__pdefe; const a = [...p.belgeler.values()].find(x => x.ad === 'kilit-a.pdf'); window.__pdefeOtoYanit = { secim: 1, onay: false, son: null }; const ok = await p.belgeKaydet(a); return { ok, degisti: a.degisti, soruldu: !!window.__pdefeOtoYanit.son }; })()`));
  console.log('bitti');
}
