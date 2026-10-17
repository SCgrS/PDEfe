// Açılış hızı değişikliklerinin (0.2.10) davranış sınaması: Gezgin'de PDF'e çift tıklamanın yolları gerçek süreçlerle.
//   1) Belgeyle soğuk açılış: açılış ekranı belgenin sekmesine dek gizli ('belge-bekleniyor'; görünmedi), belge açıldı, sınıf kalktı.
//   2) İkinci örnek: PDEfe açıkken başka bir PDF; ikinci süreç hemen ve hatasız çıkar (2 sn içinde, kod 0), belge aynı pencerede açılır.
//   3) Ayarlar: ayar deposu yüklenmeden okunan ayarlar taşınmış (eski "son" yakınlaştırma → genişlik, kaldırılan anahtar yok); arayüzün
//      yazdığı ayar dosyaya geçer; çıkıştan sonra dosyada.
//   4) İlk sayfa ekran karesi beklemeden çizilir: requestAnimationFrame hiç çalışmazken açılan belgenin ilk sayfası çizilir; sonraki
//      sayfa çizimi (sayfaya gitme) eskisi gibi kareyi bekler, kare gelince çizilir.
//   5) Açılamayan belgeyle soğuk açılış: hata kutusu ve açılış ekranı görünür ('belge-bekleniyor' kalktı).
// Örnek görünmeyen ayrı masaüstünde (test/acilis_baslat.ps1) başlar; ekrana pencere çıkmaz. Geliştirme örneği (varsayılan; veri klasörü
// PDEFE_VERI_KLASORU) ya da paketli sürüm (--exe release\win-unpacked\PDEfe.exe; --user-data-dir). Arayüzün ölçüm işaretleri için örnek
// --pdefe-olcum ile başlar (src/renderer/olcum.js).
// Kullanım: node test\acilis_davranis.mjs [--exe <PDEfe.exe>] [--port 9460]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (ad, v) => { const i = process.argv.indexOf('--' + ad); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : v; };
const PAKETLI = arg('exe', '');
const EXE = PAKETLI ? path.resolve(PAKETLI) : path.join(KOK, 'node_modules', 'electron', 'dist', 'electron.exe');
const PORT = parseInt(arg('port', '9460'), 10);
const ORNEKLER = path.join(KOK, 'test', 'cikti', 'acilis', 'pdf');
const VERI = path.join(os.tmpdir(), `pdefe-acilis-davranis-${PORT}`);
const MASAUSTU = `PDEfeAcilisDavranis${PORT}`;
const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
const J = (x) => JSON.stringify(x);

let hata = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => { toplam++; if (!ok) hata++; console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${!ok && ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`); return ok; };

if (!fs.existsSync(EXE)) { console.error('Bulunamadı:', EXE); process.exit(2); }
if (!['kucuk', 'taranmis', 'buyuk'].every((t) => fs.existsSync(path.join(ORNEKLER, t + '.pdf')))) {
  const py = path.join(KOK, '.venv', 'Scripts', 'python.exe');
  execFileSync(fs.existsSync(py) ? py : 'python', [path.join(KOK, 'test', 'acilis_ornek_uret.py'), ORNEKLER], { stdio: 'inherit' });
}
const BOZUK = path.join(ORNEKLER, 'bozuk.pdf');
fs.writeFileSync(BOZUK, Buffer.from('%PDF-1.7\nbu bir PDF değil\n' + 'x'.repeat(4000)));   // imzası PDF, içi bozuk: açılamaz

// ---------------------------------------------------------------- başlatıcı (test/acilis_baslat.ps1)
// Geliştirme örneğinde veri klasörü ortam değişkeniyle (başlatıcı ortamı süreçlere geçirir)
const ortam = { ...process.env, PDEFE_VERI_KLASORU: VERI };
for (const ad of ['PDEFE_TEST_KONUM', 'PDEFE_TEST_BOYUT', 'PDEFE_TEST_GIZLI_MASAUSTU', 'PDEFE_TEST_GUNCELLEME']) delete ortam[ad];
const baslatici = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'acilis_baslat.ps1')], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true, env: ortam });
const satirlar = readline.createInterface({ input: baslatici.stdout });
const kuyruk = []; let bekleyen = null;
satirlar.on('line', (s) => { const j = JSON.parse(s); if (bekleyen) { const c = bekleyen; bekleyen = null; c(j); } else kuyruk.push(j); });
const yanit = () => (kuyruk.length ? Promise.resolve(kuyruk.shift()) : new Promise((c) => { bekleyen = c; }));
await yanit();
const veriArg = PAKETLI ? `--user-data-dir="${VERI}" ` : '';
const uygulamaArg = PAKETLI ? '' : '. ';
async function baslat(argumanlar) {
  baslatici.stdin.write(J({ exe: EXE, arguman: uygulamaArg + veriArg + argumanlar, klasor: PAKETLI ? path.dirname(EXE) : KOK, masaustu: MASAUSTU }) + '\n');
  const r = await yanit();
  if (r.hata) throw new Error(r.hata);
  return r;
}
async function cikis(pid, sure = 15000) { baslatici.stdin.write(J({ cikis: pid, sure }) + '\n'); const r = await yanit(); return r.cikis == null ? null : { zaman: r.cikis, kod: r.kod }; }
const zorla = (pid) => { try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* yok */ } };

async function sayfa(sonZaman = Date.now() + 30000) {
  let h = null;
  while (!h) {
    if (Date.now() > sonZaman) throw new Error('CDP sayfası yok');
    try { h = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page' && /index\.html/.test(x.url)); } catch { /* henüz */ }
    if (!h) await bekle(50);
  }
  const ws = new WebSocket(h.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0; const b = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && b.has(d.id)) { b.get(d.id)(d); b.delete(d.id); } };
  const ev = async (ifade) => {
    const r = await new Promise((c) => { const i = ++id; b.set(i, c); ws.send(J({ id: i, method: 'Runtime.evaluate', params: { expression: ifade, awaitPromise: true, returnByValue: true } })); });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  return { ws, ev };
}
const kosul = async (s, ifade, sure = 15000) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await s.ev(ifade); } catch { /* yükleniyor */ } if (v || Date.now() - t0 > sure) return v; await bekle(60); } };
const ISARETLER = `performance.getEntriesByType('mark').filter((m) => m.name.startsWith('pdefe:')).map((m) => ({ ad: m.name.slice(6), t: m.startTime, no: m.detail ?? null }))`;

async function kapat(s, pid) {
  s.ev(`window.pdefe.cagir('pencere:kapat'), true`).catch(() => {});
  const c = await cikis(pid);
  try { s.ws.close(); } catch { /* kapandı */ }
  if (!c) zorla(pid);
  await bekle(500);
  return c;
}

// ---------------------------------------------------------------- hazırlık: eski sürümden kalma ayarlar (taşınmalı)
fs.rmSync(VERI, { recursive: true, force: true });
fs.mkdirSync(VERI, { recursive: true });
fs.writeFileSync(path.join(VERI, 'ayarlar.json'), J({ tema: 'koyu', pencereKapatma: 'pencere', otoGuncelle: false, varsayilanZoom: 'son', sonZoom: 150, dondurmeKapsami: 'tum' }));

try {
  // ---------------------------------------------------------------- 1–3
  const b = await baslat(`--remote-debugging-port=${PORT} --pdefe-olcum "${path.join(ORNEKLER, 'kucuk.pdf')}"`);
  let s = await sayfa();
  const ilk = await kosul(s, `(${ISARETLER}).some((m) => m.ad === 'ilkSayfa') && ${ISARETLER}`);
  sonuc('Belgeyle soğuk açılış: ilk sayfa çizildi', Array.isArray(ilk), ilk);
  const I = ilk || [];
  const t = (ad) => I.find((m) => m.ad === ad)?.t ?? null;
  sonuc('Açılış ekranı belge beklenirken gizliydi (belgeBekleniyor işareti; açılış ekranı hiç görünmedi)', t('belgeBekleniyor') != null && t('acilisEkrani') == null, I.map((m) => m.ad));
  const dom = await s.ev(`({ sinif: document.documentElement.classList.contains('belge-bekleniyor'), baslangicGizli: document.querySelector('#baslangic').hidden, belge: window.__pdefe?.aktif()?.ad || null })`);
  sonuc('Belge açılınca bekleme sınıfı kalktı, belge sekmesi etkin', dom.sinif === false && dom.baslangicGizli === true && /kucuk/.test(dom.belge || ''), dom);
  const ayar = await s.ev(`window.pdefe.cagir('ayar:al').then((a) => ({ zoom: a.varsayilanZoom, kaldirilan: 'dondurmeKapsami' in a || 'sonZoom' in a, solPanel: a.solPanelKapatildi, otomatik: a.otomatikKaydet }))`);
  sonuc('Ayarlar okunurken taşımalar uygulanmış (son → genislik, kaldırılan anahtar yok, bayraklar)', ayar.zoom === 'genislik' && ayar.kaldirilan === false && ayar.solPanel === true && ayar.otomatik === false, ayar);

  // İkinci örnek
  const b2 = await baslat(`"${path.join(ORNEKLER, 'taranmis-2.pdf')}"`);
  const c2 = await cikis(b2.pid, 5000);
  sonuc('İkinci örnek hemen ve hatasız çıktı (2 sn içinde, kod 0)', !!c2 && c2.kod === 0 && c2.zaman - b2.olusma < 2000, c2 && { omur: Math.round(c2.zaman - b2.olusma), kod: c2.kod });
  if (!c2) zorla(b2.pid);
  const ikinci = await kosul(s, `[...window.__pdefe.belgeler.values()].some((b) => /taranmis-2/.test(b.ad) && b.gorunum.hazir) && [...window.__pdefe.belgeler.values()].map((b) => b.ad)`);
  sonuc('İkinci örneğin belgesi aynı pencerede açıldı', Array.isArray(ikinci) && ikinci.length === 2, ikinci);

  // Ayar yazımı: dosyaya geçer (depo gösterimden kısa süre sonra yüklenir; önce yazılan da sırayla yazılır)
  await s.ev(`window.pdefe.cagir('ayar:koy', 'yaziBoyutu', 15)`);
  const dosyada = async () => { try { return JSON.parse(fs.readFileSync(path.join(VERI, 'ayarlar.json'), 'utf8')); } catch { return {}; } };
  let f = {};
  for (let i = 0; i < 40 && f.yaziBoyutu !== 15; i++) { await bekle(100); f = await dosyada(); }
  sonuc('Arayüzün yazdığı ayar dosyaya geçti; taşımalar dosyada', f.yaziBoyutu === 15 && f.varsayilanZoom === 'genislik' && !('dondurmeKapsami' in f), { yaziBoyutu: f.yaziBoyutu, zoom: f.varsayilanZoom, eski: 'dondurmeKapsami' in f });
  const z = await s.ev(`window.pdefe.cagir('uygulama:acilisZamanlari').then((z) => z.kayitlar.map((k) => k.ad))`);
  sonuc('Ana süreç adımları yazıldı (pencere, gösterim, ayar deposu, ikinci örnek)', ['pencereKuruldu', 'gosterildi', 'ayarDeposu', 'ikinciOrnek', 'dosyaGonderildi'].every((a) => z.includes(a)), z);

  // 4) Kare beklemeden ilk sayfa: requestAnimationFrame çalışmazken yeni belge
  await s.ev(`(() => { window.__rafAsil = window.requestAnimationFrame; window.__rafBekleyen = []; window.requestAnimationFrame = (f) => { window.__rafBekleyen.push(f); return 0; }; return true; })()`);
  await s.ev(`(window.__pdefe.dosyaAc(${J(path.join(ORNEKLER, 'buyuk.pdf'))}), true)`);
  const karesiz = await kosul(s, `(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => /buyuk/.test(x.ad)); const p = b?.gorunum?.sayfalar?.[0]; return p?.canvas && p.canvas.width > 0 ? { w: p.canvas.width, n: b.gorunum.sayfalar.length } : null; })()`, 20000);
  sonuc('requestAnimationFrame çalışmazken yeni belgenin ilk sayfası çizildi', !!karesiz, karesiz);
  await s.ev(`(() => { const b = window.__pdefe.aktif(); b.gorunum.sayfayaGit(200, { aninda: true }); return true; })()`);
  await bekle(1500);
  const sonraki = await s.ev(`(() => { const b = window.__pdefe.aktif(); const p = b.gorunum.sayfalar[199]; return { cizildi: !!(p.canvas && p.canvas.width > 0), bekleyen: window.__rafBekleyen.length }; })()`);
  sonuc('Sonraki sayfa çizimi eskisi gibi kareyi bekliyor (kare yokken çizilmedi)', sonraki.cizildi === false && sonraki.bekleyen > 0, sonraki);
  await s.ev(`(() => { window.requestAnimationFrame = window.__rafAsil; const l = window.__rafBekleyen.splice(0); for (const f of l) window.__rafAsil(f); return true; })()`);
  const kareyle = await kosul(s, `(() => { const p = window.__pdefe.aktif().gorunum.sayfalar[199]; return !!(p.canvas && p.canvas.width > 0); })()`, 15000);
  sonuc('Kare gelince sonraki sayfa çizildi', !!kareyle);

  const k1 = await kapat(s, b.pid);
  sonuc('Olağan kapandı (kod 0)', !!k1 && k1.kod === 0, k1);
  const f2 = await dosyada();
  sonuc('Çıkıştan sonra ayarlar dosyada (pencerenin yeri yazıldı)', f2.yaziBoyutu === 15 && f2.pencere && Number.isFinite(f2.pencere.genislik), { yaziBoyutu: f2.yaziBoyutu, pencere: f2.pencere });

  // ---------------------------------------------------------------- 5) açılamayan belge
  const b3 = await baslat(`--remote-debugging-port=${PORT} --pdefe-olcum "${BOZUK}"`);
  s = await sayfa();
  const kutu = await kosul(s, `(() => { const k = document.querySelector('.mesaj-kutusu'); return k ? { ileti: k.querySelector('.mesaj-ileti')?.textContent, sinif: document.documentElement.classList.contains('belge-bekleniyor'), baslangic: !document.querySelector('#baslangic').hidden, isaret: (${ISARETLER}).some((m) => m.ad === 'acilisEkrani') } : null; })()`);
  sonuc('Açılamayan belge: hata kutusu, açılış ekranı görünür, bekleme sınıfı kalktı', !!kutu && /açılamadı/.test(kutu.ileti || '') && kutu.sinif === false && kutu.baslangic && kutu.isaret, kutu);
  await s.ev(`(document.querySelector('.mesaj-kutusu button')?.click(), true)`).catch(() => {});
  await bekle(300);
  await kapat(s, b3.pid);
} finally {
  baslatici.stdin.end('\n');
  try { fs.rmSync(BOZUK, { force: true }); } catch { /* yok */ }
  try { fs.rmSync(VERI, { recursive: true, force: true }); } catch (e) { console.warn('Veri klasörü silinemedi:', e.message); }
}
console.log(`\n${toplam - hata}/${toplam} denetim geçti${hata ? `, ${hata} HATA` : ''}`);
process.exit(hata ? 1 : 0);
