// Senaryo 9: kilitli dosyaya kaydetme uyarısı; sekme değiştirirken kaydedilmemiş değişiklik sorusu ve "bir daha sorma".
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const D = 'C:/Users/Kullanici/Desktop/PDF DENEME/';
const A = 'C:/Projeler/PDEfe/test/cikti/kilit-a.pdf';
const B = 'C:/Projeler/PDEfe/test/cikti/kilit-b.pdf';

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  fs.copyFileSync(D + 'Deneme Kişi SGK işe giriş (1).pdf', A);
  fs.copyFileSync(D + 'daf3dfc4-0c16-4317-9868-6d1f0393c8cd.pdf', B);
  await evalJs(`(async () => { const p = window.__pdefe; window.__pdefeOtoYanit = { secim: 1, onay: false }; const a = p.ayar(); a.sekmeDegisimindeSor = true; a.otomatikKaydet = false; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); await p.dosyaAc(${JSON.stringify(A)}); await p.dosyaAc(${JSON.stringify(B)}); await new Promise(r => setTimeout(r, 1200)); return true; })()`);

  // A'ya not ekle (kirli yap): önce A'yı seç
  console.log('A kirli:', await evalJs(`(async () => { const p = window.__pdefe; const a = [...p.belgeler.values()].find(b => b.ad === 'kilit-a.pdf'); await p.sekmeSec(a.id); await new Promise(r => setTimeout(r, 700)); const s = a.gorunum.sayfalar[0]; const k = s.el.getBoundingClientRect(); a.notlar.yapiskanNotKoy(0, { clientX: k.left + 200, clientY: k.top + 200 }); const ta = document.querySelector('.not-balonu textarea.icerik'); ta.value = 'kilit testi'; ta.dispatchEvent(new Event('blur')); a.notlar.balonKapat(); return { degisti: a.degisti, aktif: p.aktif().ad }; })()`));

  // 1) Sekme değiştir → soru çıkmalı (otomatik yanıt: 1 = Kaydetme). Değişiklik sekmede kalmalı.
  console.log('sekme değiştir (Kaydetme):', await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find(x => x.ad === 'kilit-b.pdf'); window.__pdefeOtoYanit = { secim: 1, onay: false, son: null }; await p.sekmeSec(b.id); await new Promise(r => setTimeout(r, 500)); const a = [...p.belgeler.values()].find(x => x.ad === 'kilit-a.pdf'); return { soruldu: !!window.__pdefeOtoYanit.son, mesaj: window.__pdefeOtoYanit.son?.mesaj?.slice(0, 60), dugmeler: window.__pdefeOtoYanit.son?.dugmeler, onayKutusu: window.__pdefeOtoYanit.son?.onayKutusu, aktif: p.aktif().ad, aHalaKirli: a.degisti, notSayisi: a.notlar.liste().length }; })()`));
  // 2) Geri A'ya, sonra "bir daha sorma" ile B'ye → sonraki geçişte sorulmamalı
  console.log('bir daha sorma:', await evalJs(`(async () => { const p = window.__pdefe; const a = [...p.belgeler.values()].find(x => x.ad === 'kilit-a.pdf'); const b = [...p.belgeler.values()].find(x => x.ad === 'kilit-b.pdf'); await p.sekmeSec(a.id); window.__pdefeOtoYanit = { secim: 1, onay: true, son: null }; await p.sekmeSec(b.id); const ilk = !!window.__pdefeOtoYanit.son; await p.sekmeSec(a.id); window.__pdefeOtoYanit = { secim: 1, onay: false, son: null }; await p.sekmeSec(b.id); return { ilkSoruldu: ilk, ikinciSoruldu: !!window.__pdefeOtoYanit.son, sorma: a.sorma }; })()`));

  // 3) Kilitli dosyaya kaydet: A'yı dış süreçle kilitle, kaydet → uyarı (otomatik yanıt: Vazgeç)
  const kilit = spawn('C:/Projeler/PDEfe/.venv/Scripts/python.exe', ['test/kilitle.py', A, '12'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => kilit.stdout.on('data', () => r()));
  console.log('kilitli kaydet:', await evalJs(`(async () => { const p = window.__pdefe; const a = [...p.belgeler.values()].find(x => x.ad === 'kilit-a.pdf'); await p.sekmeSec(a.id); window.__pdefeOtoYanit = { secim: 1, onay: false, son: null }; const ok = await p.belgeKaydet(a); return { ok, mesaj: window.__pdefeOtoYanit.son?.mesaj, ayrinti: window.__pdefeOtoYanit.son?.ayrinti?.slice(0, 90), dugmeler: window.__pdefeOtoYanit.son?.dugmeler, degisti: a.degisti }; })()`));
  kilit.kill();
  await bekle(500);
  // 4) Kilit kalkınca kaydet başarılı olmalı
  console.log('kilit kalkınca kaydet:', await evalJs(`(async () => { const p = window.__pdefe; const a = [...p.belgeler.values()].find(x => x.ad === 'kilit-a.pdf'); window.__pdefeOtoYanit = { secim: 1, onay: false, son: null }; const ok = await p.belgeKaydet(a); return { ok, degisti: a.degisti, soruldu: !!window.__pdefeOtoYanit.son }; })()`));
  console.log('bitti');
}
