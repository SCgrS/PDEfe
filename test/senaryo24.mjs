// Senaryo 24 (0.1.23, güvenlik denetimi): PDF'teki dış bağlantılar yalnızca web ve e-posta adresiyse ve sorulduktan sonra açılır.
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9424 -Veri "%TEMP%\pdefe-s24-9424"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9424; node test\surucu.mjs betik test\senaryo24.mjs
// Örnek PDF'ler test/guvenlik_pdf_uret.py ile test/cikti/guvenlik altına üretilir (betik kendisi çalıştırır). Hiçbir bağlantı gerçekten
// açılmaz: sorular window.__pdefeOtoYanit ile "Vazgeç" yanıtlanır.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = path.join(KOK, 'test', 'cikti', 'guvenlik');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

export default async function ({ evalJs, bekle }) {
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), [path.join(KOK, 'test', 'guvenlik_pdf_uret.py'), CIKTI], { stdio: 'inherit' });

  // ---------------------------------------------------------------- 1. PDF'teki dış bağlantılar
  console.log('— PDF bağlantıları');
  const baglantili = path.join(CIKTI, 'baglantili.pdf');
  await evalJs(`window.__pdefe.dosyaAc(${J(baglantili)}).then(() => 1)`);
  sonuc('bağlantılar çizildi', await kosul(`document.querySelectorAll('.gorunum:not([hidden]) .baglanti').length >= 4`),
    await evalJs(`document.querySelectorAll('.gorunum:not([hidden]) .baglanti').length`));
  /** Bağlantıya tıklar (soru Vazgeç ile yanıtlanır); sorulan kutuyu döndürür ({ mesaj, ayrinti, dugmeler, onayKutusu }) ya da null. */
  const tikla = (uri, yanit = { secim: 1 }) => evalJs(`(async () => {
    window.__pdefeOtoYanit = ${J(yanit)};
    const el = [...document.querySelectorAll('.gorunum:not([hidden]) .baglanti')].find((a) => a.title === ${J(uri)});
    if (!el) return 'yok';
    el.click();
    await new Promise((c) => setTimeout(c, 300));
    const son = window.__pdefeOtoYanit.son || null;
    delete window.__pdefeOtoYanit;
    return son && { mesaj: son.mesaj, ayrinti: son.ayrinti, dugmeler: son.dugmeler, onayKutusu: son.onayKutusu };
  })()`);

  let s = await tikla('https://ornek.invalid/belge');
  sonuc('https: açmadan önce sorulur', s?.mesaj === 'Bağlantı tarayıcıda açılsın mı?', s);
  sonuc('https: soruda tam adres görünür', s?.ayrinti === 'https://ornek.invalid/belge', s);
  sonuc('https: Aç / Vazgeç ve "Bu belgede yeniden sorma"', J(s?.dugmeler) === J(['Aç', 'Vazgeç']) && s?.onayKutusu === 'Bu belgede yeniden sorma', s);
  s = await tikla('mailto:kisi@ornek.invalid');
  sonuc('mailto: e-posta sorusu', s?.mesaj === 'E-posta uygulaması açılsın mı?' && s?.ayrinti === 'mailto:kisi@ornek.invalid', s);
  s = await tikla('FILE:///C:/Windows/System32/calc.exe');
  sonuc('büyük harfli FILE: açılmaz, uyarı verilir', s?.mesaj === 'Bu bağlantı açılmadı.' && s?.ayrinti.includes('FILE:///C:/Windows/System32/calc.exe'), s);
  const searchMs = await evalJs(`[...document.querySelectorAll('.gorunum:not([hidden]) .baglanti')].map((a) => a.title).find((t) => t.startsWith('search-ms:'))`);
  s = await tikla(searchMs);
  sonuc('search-ms: açılmaz, uyarı verilir', s?.mesaj === 'Bu bağlantı açılmadı.', s);
  // "Bu belgede yeniden sorma" işaretlenip Vazgeç denirse izin verilmez (Vazgeç); Aç denmeden işaret kalıcı olmaz
  await tikla('https://ornek.invalid/belge', { secim: 1, onay: true });
  s = await tikla('https://ornek.invalid/belge');
  sonuc('Vazgeç ile işaretlenen "yeniden sorma" izin vermez', s?.mesaj === 'Bağlantı tarayıcıda açılsın mı?', s);
  await evalJs(`(async () => { const b = window.__pdefe.aktif(); if (b) await window.__pdefe.belgeKapat(b.id); return 1; })()`).catch(() => {});

  console.log(`\nSonuç: ${toplam - hataSayisi}/${toplam} geçti${hataSayisi ? `, ${hataSayisi} HATA` : ''}.`);
  if (hataSayisi) process.exitCode = 1;
}
