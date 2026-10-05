// Windows oturum sonu (0.2.1): oturum kapatma, yeniden başlatma ve kapatmada Windows pencerelere 'close' değil WM_QUERYENDSESSION /
// WM_ENDSESSION gönderir; kaydedilmemiş değişiklik önceden sorulmadan kayboluyordu. Beklenen:
//   1) Kaydedilmemiş değişikliği olmayan pencere oturumun bitmesini engellemez (yanıt 1), soru açılmaz.
//   2) Kaydedilmemiş not varken engeller (yanıt 0) ve Çıkış gibi kapatma sorusu açılır; Vazgeç: pencere ve değişiklik yerinde. Oturumu
//      kapatma nedeniyle de aynı.
//   3) Yazı kutusunda henüz not olmamış yazı da kaydedilmemiş değişiklik sayılır. Çok sekmeli pencerede (0.2.2) "Geçerli sekme / Tüm
//      sekmeler" sorulmaz (oturum sonu Çıkış gibidir), doğrudan kaydetme sorusu.
//   4) İki pencere: değişikliksiz pencere engellemez; değişiklikli iki pencere aynı iletiyi alınca Çıkış bir kez başlar (öndeki pencere bir
//      kez sorar, öteki sırasını bekler); soru açıkken yeniden gelen ileti Çıkış'ı yeniden başlatmaz. Vazgeç: ikisi de açık kalır.
//   5) "Kaydetme" seçilince pencereler sırayla sorup kapanır, uygulama çıkar (oturum bitebilir).
// 1–3'te soru otomatik yanıtlanır (window.__pdefeOtoYanit); 4–5'te sayfa içindeki soru kutusu açık kalır, düğmesine sonra basılır.
// İletiler test/oturum_sonu.ps1 ile yalnızca test örneğinin pencerelerine gönderilir (oturum kapanmaz).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9611      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9611; $env:PDEFE_TEST_PID=<PID>; node test\surucu.mjs betik test\oturum_sonu.mjs
// Son adım test örneğini kapatır (kapanmazsa: powershell -File test\durdur.ps1 -SurecId <PID>). Örnek PDF'lerin klasörü
// $env:OTURUM_SONU_KLASORU (varsayılan test\cikti\oturum_sonu).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = process.env.OTURUM_SONU_KLASORU || path.join(KOK, 'test', 'cikti', 'oturum_sonu');   // örnek PDF'ler (iş bitince silinir)
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const PID = +process.env.PDEFE_TEST_PID;
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, tamamSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (ok) tamamSayisi++; else hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

/** Oturum sonu iletisi: [{ hwnd, baslik, sonuc }] (her uygulama penceresi için) */
const ileti = (secenek = {}) => {
  const a = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'oturum_sonu.ps1'), '-SurecId', String(PID)];
  for (const [k, v] of Object.entries(secenek)) a.push('-' + k, String(v));
  return execFileSync('powershell.exe', a, { encoding: 'utf8' }).split(/\r?\n/).filter((s) => s.trim().startsWith('{')).map((s) => JSON.parse(s));
};
const surecVar = () => { try { return execFileSync('tasklist.exe', ['/FI', `PID eq ${PID}`, '/NH'], { encoding: 'utf8' }).includes(String(PID)); } catch { return false; } };

export default async function ({ evalJs, bekle, tikla, yaz, hedefler, hedefSec }) {
  if (!PID) throw new Error('PDEFE_TEST_PID verilmedi (baslat.ps1\'in yazdığı PID).');
  fs.rmSync(K, { recursive: true, force: true }); fs.mkdirSync(K, { recursive: true });
  for (const ad of ['a', 'b', 'c']) execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), path.join(K, ad + '.pdf'), '3', `Oturum ${ad}`], { encoding: 'utf8' });
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(120); } };
  // Pencereler: ana süreçteki kimlik → CDP hedefi
  let harita = new Map();
  const yenile = async () => { const m = new Map(); for (const h of await hedefler()) { hedefSec(h.id); m.set(await evalJs(`window.pdefe.cagir('pencere:kimlik')`), h.id); } harita = m; return [...m.keys()]; };
  const P = (kimlik) => hedefSec(harita.get(kimlik));
  const ac = async (ad) => {
    await evalJs(`window.__pdefe.dosyaAc(${J(path.join(K, ad + '.pdf'))}).then((b) => !!b)`);
    return kosul(`(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.ad === ${J(ad + '.pdf')}); return !!b?.gorunum?.sayfaSayisi && b.notlar?.yuklendi; })()`);
  };
  const notEkle = (ad) => evalJs(`(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.ad === ${J(ad)});
    b.notlar.ekle({ tur: 'Text', sayfa: 1, rect: [400, 600, 420, 620], icerik: 'oturum sonu notu', yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' });
    return !!b.degisti; })()`);
  const sekmeler = () => evalJs(`window.__pdefe.sekmeler.sekmeler.map((s) => s.ad + (s.degisti ? '*' : ''))`);
  const otoYanit = (secim) => evalJs(`(window.__pdefeOtoYanit = ${secim == null ? 'null' : `{ secim: ${secim} }`}, true)`);
  const soru = () => evalJs(`window.__pdefeOtoYanit?.son?.mesaj || ''`);
  /** Sorunun sorulup yanıtlanmasını ve kapatma akışının bitmesini bekler */
  const soruBekle = async () => { const s = await kosul(`window.__pdefeOtoYanit?.son?.mesaj || ''`, 6000); await bekle(500); return s; };

  // ---- 1) değişiklik yok: engellemez, soru yok
  await yenile();
  sonuc('a.pdf açıldı', await ac('a'));
  await otoYanit(2);
  let r = ileti();
  sonuc('Değişiklik yokken WM_QUERYENDSESSION engellenmez (yanıt 1)', r.length === 1 && r[0].sonuc === 1, r);
  await bekle(800);
  sonuc('Değişiklik yokken soru açılmaz, pencere ve belge açık', !(await soru()) && J(await sekmeler()) === J(['a.pdf']) && (await hedefler()).length === 1, await sekmeler());

  // ---- 2) kaydedilmemiş not: engeller, Çıkış sorusu; Vazgeç
  sonuc('Not eklendi (kaydedilmemiş)', await notEkle('a.pdf'));
  await bekle(300);
  r = ileti();
  sonuc('Kaydedilmemiş notla WM_QUERYENDSESSION engellenir (yanıt 0)', r.length === 1 && r[0].sonuc === 0, r);
  const s2 = await soruBekle();
  sonuc('Kapatma sorusu açıldı (a.pdf)', s2.includes('a.pdf'), s2);
  sonuc('Vazgeç: pencere ve kaydedilmemiş not yerinde', J(await sekmeler()) === J(['a.pdf*']) && (await hedefler()).length === 1, await sekmeler());
  await otoYanit(2);
  r = ileti({ Neden: 'oturum' });
  sonuc('Oturumu kapatmada da engellenir (yanıt 0) ve yeniden sorulur', r[0]?.sonuc === 0 && (await soruBekle()).includes('a.pdf'), r);
  await otoYanit(2);
  r = ileti({ Ileti: 'bitis', Bitti: 0 });
  await bekle(500);
  sonuc('Oturum sonundan vazgeçildi (WM_ENDSESSION 0): uygulama açık kalır, soru yok', r.length === 1 && surecVar() && !(await soru()) && J(await sekmeler()) === J(['a.pdf*']), r);

  // ---- 3) yazı kutusunda henüz not olmamış yazı
  await otoYanit(null);
  await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  await ac('c');
  await evalJs(`(window.__pdefe.aktif().notlar.aracSec('yazi'), true)`);
  const nokta = await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; const s = g.sayfalar[g.gecerli - 1].el.getBoundingClientRect(); const k = g.kaydirici.getBoundingClientRect();
    return [Math.round(s.left + 120), Math.round(Math.max(s.top, k.top) + 120)]; })()`);
  await tikla(nokta[0], nokta[1]); await bekle(400);
  await yaz('henüz not değil'); await bekle(400);
  const yazi = await evalJs(`(() => { const b = window.__pdefe.aktif(); return { duzenleyici: !!b.notlar.duzenleyici, degisti: !!b.degisti, yaziDegisti: b.notlar.duzenleyiciDegisti() }; })()`);
  sonuc('Yazı kutusunda yazı var, belge henüz değişmiş sayılmıyor', yazi.duzenleyici && yazi.yaziDegisti && !yazi.degisti, yazi);
  await otoYanit(2);
  r = ileti();
  sonuc('Yazı kutusundaki yazıyla WM_QUERYENDSESSION engellenir (yanıt 0)', r[0]?.sonuc === 0, r);
  const s3 = await soruBekle();
  sonuc('Kapatma sorusu açıldı (c.pdf), Vazgeç: yazı not olarak sekmede', s3.includes('c.pdf') && J(await sekmeler()) === J(['c.pdf*']), { soru: s3, sekmeler: await sekmeler() });
  await evalJs(`(window.__pdefe.aktif().notlar.aracSec(null), true)`);

  // ---- 3b) çok sekmeli pencere (0.2.2): oturum sonu Çıkış gibidir, "Geçerli sekme / Tüm sekmeler" sorulmaz; doğrudan kaydetme sorusu
  // (soru sorulsaydı otomatik Vazgeç onda kalır, son soru o olurdu)
  sonuc('a.pdf ikinci sekmede açıldı', await ac('a'));
  await otoYanit(2);
  r = ileti();
  const s3b = await soruBekle();
  sonuc('Çok sekmeli pencerede oturum sonu: sekme sorusu yok, kaydetme sorusu (c.pdf); değişmeyen a.pdf kapandı', r[0]?.sonuc === 0 && s3b.includes('c.pdf') && J(await sekmeler()) === J(['c.pdf*']),
    { r, soru: s3b, sekmeler: await sekmeler() });

  // ---- 4) iki pencere
  sonuc('b.pdf açıldı', await ac('b'));
  const tasima = await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'b.pdf'); return await p.sekmeyiTasi(b.id, { tur: 'yeni' }); })()`);
  let kimlikler = [];
  for (let i = 0; i < 40 && kimlikler.length < 2; i++) { await bekle(250); kimlikler = await yenile(); }
  sonuc('b.pdf yeni pencereye taşındı', kimlikler.length === 2, { tasima, kimlikler });
  const [A, B] = kimlikler.sort((x, y) => x - y);
  P(B); await bekle(300);
  await otoYanit(2);
  P(A); await otoYanit(2); await evalJs(`window.pdefe.cagir('test:oneAl')`);   // A önde: Çıkış önce A'yı kapatmak ister
  r = ileti();
  const yanit = (ad) => r.find((x) => x.baslik.startsWith(ad))?.sonuc;
  sonuc('Değişikliksiz pencere engellemez, değişiklikli engeller', r.length === 2 && yanit('c.pdf') === 0 && yanit('b.pdf') === 1, r);
  P(A); sonuc('Öndeki değişiklikli pencere sordu', (await soruBekle()).includes('c.pdf'));
  P(B); sonuc('Değişikliksiz pencere açık, soru yok', !(await soru()) && (await yenile()).length === 2);

  // Kişi soruyu hemen yanıtlamaz: bundan sonra sayfa içindeki soru kutusu açık kalır (otomatik yanıt yok), iletiler bu arada iki pencereye
  // de gelir ve düğmeye sonra basılır. Pencereye gelen kapatma istekleri sayılır
  const KUTU = `(() => { const k = [...document.querySelectorAll('.mesaj-kutusu')].at(-1); return k ? (k.querySelector('.mesaj-ileti')?.textContent || k.textContent) : ''; })()`;
  const kutuDugmesi = (metin) => evalJs(`(() => { const b = [...([...document.querySelectorAll('.mesaj-kutusu')].at(-1)?.querySelectorAll('.dugmeler button') || [])].find((x) => x.textContent === ${J(metin)}); if (!b) return false; b.click(); return true; })()`);
  const sayac = async (k) => { P(k); return evalJs('window.__osSayac'); };
  P(B); sonuc('B\'ye not eklendi', await notEkle('b.pdf')); await bekle(300);
  for (const k of [A, B]) { P(k); await evalJs(`(window.__osSayac = 0, window.__osDinle ||= window.pdefe.dinle('pencere:kapatIstegi', () => window.__osSayac++), window.__pdefeOtoYanit = null, true)`); }
  P(A); await evalJs(`window.pdefe.cagir('test:oneAl')`);
  r = ileti();
  sonuc('İki değişiklikli pencere de engeller', r.length === 2 && r.every((x) => x.sonuc === 0), r);
  P(A); const kutuA = await kosul(KUTU, 6000); await bekle(500);
  P(B); const kutuB = await evalJs(KUTU);
  let sayA = await sayac(A), sayB = await sayac(B);
  sonuc('Çıkış bir kez başladı: öndeki pencere bir kez kapatılmak istendi ve soruyor, öteki sırasını bekliyor', kutuA.includes('c.pdf') && !kutuB && sayA === 1 && sayB === 0, { kutuA, kutuB, A: sayA, B: sayB });
  r = ileti(); await bekle(500);
  sayA = await sayac(A); sayB = await sayac(B);
  sonuc('Soru açıkken gelen ileti de engellenir, Çıkış yeniden başlamaz', r.length === 2 && r.every((x) => x.sonuc === 0) && sayA === 1 && sayB === 0, { r, A: sayA, B: sayB });
  P(A); await kutuDugmesi('Vazgeç'); await bekle(600);
  P(B); const kutuB2 = await evalJs(KUTU);
  sonuc('Vazgeç: Çıkış durdu, iki pencere ve değişiklikleri yerinde', !kutuB2 && (await yenile()).length === 2 && (P(A), J(await sekmeler()) === J(['c.pdf*'])) && (P(B), J(await sekmeler()) === J(['b.pdf*'])));

  // ---- 5) Kaydetme: bütün pencereler kapanır, uygulama çıkar
  P(A); await evalJs(`window.pdefe.cagir('test:oneAl')`);
  r = ileti();
  P(A); const kutuA3 = await kosul(KUTU, 6000);
  sonuc('Yeniden engellenir, öndeki pencere sorar', r.every((x) => x.sonuc === 0) && kutuA3.includes('c.pdf'), r);
  await kutuDugmesi('Kaydetme');
  let kalan = [];
  for (let i = 0; i < 40; i++) { await bekle(250); kalan = await yenile().catch(() => []); if (J(kalan) === J([B])) break; }
  P(B); const kutuB3 = await kosul(KUTU, 6000);
  sonuc('A kapandı, ardından B sordu', J(kalan) === J([B]) && kutuB3.includes('b.pdf'), { kalan, kutuB3 });
  await kutuDugmesi('Kaydetme');
  let cikti = false;
  for (let i = 0; i < 40 && !cikti; i++) { await bekle(250); cikti = !surecVar(); }
  sonuc('"Kaydetme" ile bütün pencereler kapandı, uygulama çıktı', cikti);

  console.log(`\n${tamamSayisi} OK, ${hataSayisi} HATA`);
  try { fs.rmSync(K, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { console.log('Not: ' + K + ' silinemedi (uygulama açık).'); }
  if (hataSayisi) process.exitCode = 1;
}
