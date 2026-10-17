// Açılış ve kapanışın sağlamlığı (0.2.10 inceleme bulguları): gerçek süreçlerle, görünmeyen ayrı masaüstünde (test/acilis_baslat.ps1;
// ekrana pencere ya da hata kutusu çıkmaz). Hata kutuları test/hata_kutusu.ps1 ile okunur ve Tamam'a basılır.
//   1) Uygulama modülü (anaSurec.js) yüklenemezse: "PDEfe açılamadı" kutusu; kutu açıkken tek örnek kilidi bırakılmış (Gezgin'de çift
//      tıklanan ikinci PDF bu sürece iletilip kaybolmaz, yeni örnek kendisi açılmayı dener); Tamam'dan sonra süreç çıkar (kod 1). Depo
//      kopyasında anaSurec.js'i bozuk geçici bir uygulama klasörüyle; yalnızca geliştirme sürümünde.
//   2) Ayar dosyası açılış boyunca okunamıyor (başka bir program paylaşımsız açmış): PDEfe varsayılanlarla açılmaz (son açılanlar ve sayfa
//      konumları sonradan boş listeyle üzerine yazılırdı); "PDEfe açılamadı" kutusu, Tamam'dan sonra çıkış; ayar dosyası değişmedi.
//   3) PDEfe kapanırken (son pencere kapandı, süreç henüz çıkmadı) çift tıklanan PDF kaybolmaz: süreç çıkınca PDEfe o belgeyle yeniden
//      açılır (yalnızca o belgeyle). Kapanma süresi test kancasıyla uzatılır (PDEFE_TEST_CIKIS_BEKLEMESI); yalnızca geliştirme sürümünde.
//   4) Ölçüm işaretleri (performance.mark 'pdefe:…') yalnızca ölçüm istenince (--pdefe-olcum) yazılır; olağan açılışta hiç yazılmaz.
// Kullanım: node test\acilis_saglamlik.mjs [--exe release\win-unpacked\PDEfe.exe] [--port 9470] [--yalniz 1,2,3,4]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (ad, v) => { const i = process.argv.indexOf('--' + ad); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : v; };
const PAKETLI = arg('exe', '');
const EXE = PAKETLI ? path.resolve(PAKETLI) : path.join(KOK, 'node_modules', 'electron', 'dist', 'electron.exe');
const PORT = parseInt(arg('port', '9470'), 10);
const YALNIZ = arg('yalniz', '1,2,3,4').split(',').map((s) => s.trim());
const ORNEKLER = path.join(KOK, 'test', 'cikti', 'acilis', 'pdf');
const MASAUSTU = `PDEfeSaglamlik${PORT}`;
const KUTU = path.join(KOK, 'test', 'hata_kutusu.ps1');
const PY = fs.existsSync(path.join(KOK, '.venv', 'Scripts', 'python.exe')) ? path.join(KOK, '.venv', 'Scripts', 'python.exe') : 'python';
const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
const J = (x) => JSON.stringify(x);

let hata = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => { toplam++; if (!ok) hata++; console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${!ok && ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`); return ok; };
const atla = (ad, neden) => console.log(`ATLANDI ${ad} (${neden})`);

if (!fs.existsSync(EXE)) { console.error('Bulunamadı:', EXE); process.exit(2); }
if (!['kucuk', 'taranmis', 'buyuk'].every((t) => fs.existsSync(path.join(ORNEKLER, t + '.pdf')) && fs.existsSync(path.join(ORNEKLER, t + '-2.pdf')))) {
  execFileSync(PY, [path.join(KOK, 'test', 'acilis_ornek_uret.py'), ORNEKLER], { stdio: 'inherit' });
}
const pdf = (ad) => path.join(ORNEKLER, ad + '.pdf');

// ---------------------------------------------------------------- başlatıcı (her senaryo kendi ortamıyla)
async function baslaticiAc(ek = {}) {
  const ortam = { ...process.env, ...ek };
  for (const ad of ['PDEFE_TEST_KONUM', 'PDEFE_TEST_BOYUT', 'PDEFE_TEST_GIZLI_MASAUSTU', 'PDEFE_TEST_GUNCELLEME', 'PDEFE_TEST_CIKIS_BEKLEMESI']) if (!(ad in ek)) delete ortam[ad];
  const s = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'acilis_baslat.ps1')], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true, env: ortam });
  const satirlar = readline.createInterface({ input: s.stdout });
  const kuyruk = []; let bekleyen = null;
  satirlar.on('line', (x) => { const j = JSON.parse(x); if (bekleyen) { const c = bekleyen; bekleyen = null; c(j); } else kuyruk.push(j); });
  const yanit = () => (kuyruk.length ? Promise.resolve(kuyruk.shift()) : new Promise((c) => { bekleyen = c; }));
  await yanit();
  return {
    async baslat(arguman, klasor) {
      s.stdin.write(J({ exe: EXE, arguman, klasor, masaustu: MASAUSTU }) + '\n');
      const r = await yanit();
      if (r.hata) throw new Error(r.hata);
      return r;
    },
    async cikis(pid, sure = 15000) { s.stdin.write(J({ cikis: pid, sure }) + '\n'); const r = await yanit(); return r.cikis == null ? null : { zaman: r.cikis, kod: r.kod }; },
    kapat() { try { s.stdin.end('\n'); } catch { /* kapandı */ } },
  };
}
/** Uygulamanın komut satırı: geliştirme sürümünde uygulama klasörü, paketlide ayrı veri klasörü (geliştirmede PDEFE_VERI_KLASORU). */
const uygulamaArg = (veri, uygulama = '.') => (PAKETLI ? `--user-data-dir="${veri}" ` : `"${uygulama}" `);
const klasorAl = (uygulama = KOK) => (PAKETLI ? path.dirname(EXE) : uygulama);
const zorla = (pid) => { try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* yok */ } };
/** Portu dinleyen süreç (yeniden açılan örnek; netstat). */
function portSureci(port) {
  try {
    const cikti = execFileSync('netstat.exe', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true });
    for (const s of cikti.split(/\r?\n/)) {
      const p = s.trim().split(/\s+/);
      if (p.length >= 5 && /LISTEN/i.test(p[3]) && p[1].endsWith(':' + port)) return parseInt(p[4], 10) || null;
    }
  } catch { /* yok */ }
  return null;
}

/** Sürecin hata kutuları (test/hata_kutusu.ps1); tikla: Tamam'a basılır. */
function kutular(pid, tikla = false) {
  try {
    const c = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', KUTU, '-Masaustu', MASAUSTU, '-SurecNo', String(pid), ...(tikla ? ['-Tikla'] : [])], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    return JSON.parse(c.trim().replace(/^﻿/, ''));
  } catch (e) { return { hata: e.message }; }
}
/** Sürecin bir hata kutusu görünene dek bekler (en çok sure ms). */
async function kutuyuBekle(pid, sure = 12000) {
  const t0 = Date.now();
  for (;;) {
    const k = kutular(pid);
    if (k.sayi > 0 || Date.now() - t0 > sure) return k;
    await bekle(400);
  }
}
const metinler = (k) => (k?.kutular || []).flatMap((x) => [x.baslik, ...(x.metinler || [])]).join(' | ');

// ---------------------------------------------------------------- CDP
async function sayfa(port, sonZaman = Date.now() + 30000) {
  let h = null;
  while (!h) {
    if (Date.now() > sonZaman) return null;
    // Zaman sınırlı: hata kutusu açıkken ana iş parçacığı kutuyu bekler, hata ayıklama kapısı yanıt vermez
    try { h = (await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1500) })).json()).find((x) => x.type === 'page' && /index\.html/.test(x.url)); } catch { /* henüz */ }
    if (!h) await bekle(80);
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
const kosul = async (s, ifade, sure = 15000) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await s.ev(ifade); } catch { /* yükleniyor */ } if (v || Date.now() - t0 > sure) return v; await bekle(80); } };
const BELGELER = `[...(window.__pdefe?.belgeler?.values() || [])].map((b) => ({ ad: b.ad, hazir: !!b.gorunum?.hazir }))`;
const ISARETLER = `performance.getEntriesByType('mark').filter((m) => m.name.startsWith('pdefe:')).map((m) => m.name.slice(6))`;
async function pencereyiKapat(s) { s.ev(`window.pdefe.cagir('pencere:kapat'), true`).catch(() => {}); await bekle(200); try { s.ws.close(); } catch { /* kapandı */ } }

const silinecekler = [];
const veriKlasoru = (ad) => { const v = path.join(os.tmpdir(), `pdefe-saglamlik-${PORT}-${ad}`); fs.rmSync(v, { recursive: true, force: true }); fs.mkdirSync(v, { recursive: true }); silinecekler.push(v); return v; };
const AYAR = { tema: 'koyu', pencereKapatma: 'pencere', otoGuncelle: false };

try {
  // ---------------------------------------------------------------- 1) uygulama modülü yüklenemedi
  if (YALNIZ.includes('1')) {
    if (PAKETLI) atla('1) Uygulama modülü yüklenemedi', 'yalnızca geliştirme sürümünde: paketin app.asar\'ı değiştirilemez');
    else {
      const uyg = path.join(os.tmpdir(), `pdefe-saglamlik-${PORT}-uygulama`);
      fs.rmSync(uyg, { recursive: true, force: true });
      fs.mkdirSync(path.join(uyg, 'src'), { recursive: true });
      silinecekler.push(uyg);
      fs.cpSync(path.join(KOK, 'src', 'main'), path.join(uyg, 'src', 'main'), { recursive: true });
      // Sonraki bir sürümde yanlış adlı içe aktarma ya da bozuk kurulum: modül yüklenirken hata
      fs.writeFileSync(path.join(uyg, 'src', 'main', 'anaSurec.js'), "import { yokBoyleBirSey } from './yok-boyle-bir-modul.js';\nyokBoyleBirSey();\n");
      fs.writeFileSync(path.join(uyg, 'package.json'), J({ name: 'pdefe', productName: 'PDEfe', version: '0.0.0', type: 'module', main: 'src/main/main.js' }));
      const veri = veriKlasoru('1');
      const b = await baslaticiAc({ PDEFE_VERI_KLASORU: veri });
      try {
        const a = await b.baslat(`"${uyg}" "${pdf('kucuk')}"`, uyg);
        const k = await kutuyuBekle(a.pid);
        sonuc('1) Modül yüklenemedi: hata kutusu "PDEfe açılamadı"', k.sayi >= 1 && /PDEfe açılamadı/.test(metinler(k)), k);
        // Kutu açıkken Gezgin'de başka bir PDF'e çift tıklandı: kilit bırakıldıysa yeni süreç ilk örnek olur (o da açılamaz, kendi kutusunu
        // gösterir); bırakılmadıysa dosyayı açılamayan sürece iletip hemen kod 0 ile çıkar (belge sessizce kaybolur)
        const ikinci = await b.baslat(`"${uyg}" "${pdf('taranmis')}"`, uyg);
        const c2 = await b.cikis(ikinci.pid, 2500);
        sonuc('1) Kutu açıkken tek örnek kilidi bırakılmış: ikinci PDF açılamayan sürece iletilip kaybolmuyor', c2 == null, c2 && { omur: Math.round(c2.zaman - ikinci.olusma), kod: c2.kod });
        const t = kutular(a.pid, true);
        const c1 = await b.cikis(a.pid, 6000);
        sonuc('1) Tamam\'dan sonra süreç çıktı (kod 1; penceresiz süreç kalmadı)', !!t.tiklandi && !!c1 && c1.kod === 1, { tiklandi: t.tiklandi, cikis: c1 });
        if (!c1) zorla(a.pid);
        if (!c2) {
          const k2 = await kutuyuBekle(ikinci.pid);
          kutular(ikinci.pid, true);
          const c3 = await b.cikis(ikinci.pid, 6000);
          sonuc('1) İkinci süreç de kutusunu gösterdi ve Tamam\'dan sonra çıktı', k2.sayi >= 1 && !!c3 && c3.kod === 1, { kutu: metinler(k2), cikis: c3 });
          if (!c3) zorla(ikinci.pid);
        }
      } finally { b.kapat(); }
    }
  }

  // ---------------------------------------------------------------- 2) ayar dosyası okunamıyor
  if (YALNIZ.includes('2')) {
    const veri = veriKlasoru('2');
    const ayarYolu = path.join(veri, 'ayarlar.json');
    fs.writeFileSync(ayarYolu, J({ ...AYAR, sonDosyalar: [pdf('kucuk'), pdf('buyuk')], sayfaKonumlari: { [pdf('buyuk')]: 7 } }, null, 2));
    const ozet = () => crypto.createHash('sha256').update(fs.readFileSync(ayarYolu)).digest('hex');
    const once = ozet();
    // Dosya paylaşımsız açık (yedekleme, eşitleme ya da virüs tarayıcısı): okuma EBUSY
    const kilit = spawn(PY, [path.join(KOK, 'test', 'kilitle.py'), ayarYolu, '40'], { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
    await new Promise((c) => { kilit.stdout.on('data', (d) => { if (/kilitlendi/.test(String(d))) c(); }); setTimeout(c, 5000); });
    const b = await baslaticiAc(PAKETLI ? {} : { PDEFE_VERI_KLASORU: veri });
    try {
      const a = await b.baslat(`${uygulamaArg(veri)}--remote-debugging-port=${PORT} "${pdf('taranmis')}"`, klasorAl());
      // Beklenen: açılış hatası kutusu, uygulama penceresi yok. Kusur: pencere varsayılanlarla açılır (ayar deposu ~0,3 sn sonra okuyamayınca
      // ayrıca ana süreç hata kutusu çıkar; kutu açıkken hata ayıklama kapısı yanıt vermez): pencere, kutuyla birlikte masaüstünden aranır
      let acildi = null, k = { sayi: 0 };
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        k = kutular(a.pid);
        if (k.pencereler?.length) acildi = { pencereler: k.pencereler };
        if (acildi || k.sayi > 0) break;
        await bekle(300);
      }
      if (!acildi && k.sayi > 0) { await bekle(1500); const k2 = kutular(a.pid); if (k2.pencereler?.length) acildi = { pencereler: k2.pencereler }; }
      sonuc('2) Ayar dosyası okunamazken PDEfe varsayılanlarla açılmadı', acildi == null, acildi);
      sonuc('2) "PDEfe açılamadı" kutusu dosyanın okunamadığını söylüyor', k.sayi >= 1 && /PDEfe açılamadı/.test(metinler(k)) && /Ayar dosyası okunamadı/.test(metinler(k)), metinler(k) || k);
      if (k.sayi >= 1) kutular(a.pid, true);
      const c = await b.cikis(a.pid, 6000);
      sonuc('2) Tamam\'dan sonra süreç çıktı (kod 1)', !!c && c.kod === 1, c);
      if (!c) zorla(a.pid);
    } finally {
      b.kapat();
      kilit.kill();
      await bekle(500);
    }
    sonuc('2) Ayar dosyası değişmedi (son açılanlar ve sayfa konumları yerinde)', ozet() === once, JSON.parse(fs.readFileSync(ayarYolu, 'utf8')));
  }

  // ---------------------------------------------------------------- 3) kapanırken çift tıklanan PDF
  if (YALNIZ.includes('3')) {
    if (PAKETLI) atla('3) Kapanırken çift tıklama', 'kapanmayı uzatan test kancası yalnızca geliştirme sürümünde');
    else {
      const veri = veriKlasoru('3');
      fs.writeFileSync(path.join(veri, 'ayarlar.json'), J(AYAR));
      // Pencere yine de görünen masaüstüne düşerse ekran dışında kalsın (yeniden açılan örnek de aynı ortamı alır)
      const b = await baslaticiAc({ PDEFE_VERI_KLASORU: veri, PDEFE_TEST_CIKIS_BEKLEMESI: '3000', PDEFE_TEST_KONUM: '-2600,0', PDEFE_TEST_GIZLI_MASAUSTU: '1' });
      let yeniPid = null;
      try {
        const a = await b.baslat(`. --remote-debugging-port=${PORT} "${pdf('kucuk')}"`, KOK);
        let s = await sayfa(PORT);
        const ilk = await kosul(s, `(${BELGELER}).some((b) => /kucuk/.test(b.ad) && b.hazir) && ${BELGELER}`);
        sonuc('3) İlk örnek belgeyle açıldı', Array.isArray(ilk), ilk);
        await pencereyiKapat(s);
        // Son pencere kapandı; süreç 3 sn daha yaşıyor (kancayla). Bu arada Gezgin'de başka bir PDF'e çift tıklandı
        await bekle(400);
        // Adında boşluk ve Türkçe harf olan belge: yeniden başlatmanın komut satırı
        const ikinciBelge = path.join(ORNEKLER, 'kapanırken açılan belge.pdf');
        fs.copyFileSync(pdf('taranmis-2'), ikinciBelge);
        silinecekler.push(ikinciBelge);
        const ikinci = await b.baslat(`. "${ikinciBelge}"`, KOK);
        const c2 = await b.cikis(ikinci.pid, 3000);
        sonuc('3) İkinci süreç dosyayı kapanmakta olan örneğe iletip çıktı (kod 0)', !!c2 && c2.kod === 0, c2);
        if (!c2) zorla(ikinci.pid);
        const c1 = await b.cikis(a.pid, 15000);
        sonuc('3) İlk örnek olağan kapandı (kod 0)', !!c1 && c1.kod === 0, c1);
        if (!c1) zorla(a.pid);
        s = await sayfa(PORT, Date.now() + 20000);
        yeniPid = portSureci(PORT);
        const yeni = s ? await kosul(s, `(${BELGELER}).some((b) => /kapanırken açılan belge/.test(b.ad) && b.hazir) && ${BELGELER}`, 15000) : null;
        sonuc('3) Süreç çıkınca PDEfe çift tıklanan belgeyle yeniden açıldı (yalnızca o belge)', Array.isArray(yeni) && yeni.length === 1, yeni ?? 'yeniden açılmadı');
        if (s) {
          await pencereyiKapat(s);
          for (let i = 0; i < 60 && portSureci(PORT); i++) await bekle(250);
        }
      } finally {
        const kalan = portSureci(PORT) || yeniPid;
        if (kalan) zorla(kalan);
        b.kapat();
      }
    }
  }

  // ---------------------------------------------------------------- 4) ölçüm işaretleri
  if (YALNIZ.includes('4')) {
    const veri = veriKlasoru('4');
    fs.writeFileSync(path.join(veri, 'ayarlar.json'), J(AYAR));
    const b = await baslaticiAc(PAKETLI ? {} : { PDEFE_VERI_KLASORU: veri });
    try {
      for (const olcum of [false, true]) {
        const a = await b.baslat(`${uygulamaArg(veri)}--remote-debugging-port=${PORT}${olcum ? ' --pdefe-olcum' : ''} "${pdf('kucuk')}"`, klasorAl());
        const s = await sayfa(PORT);
        const hazir = s && await kosul(s, `(${BELGELER}).some((b) => /kucuk/.test(b.ad) && b.hazir)`);
        if (s) await s.ev(`(window.__pdefe.dosyaAc(${J(pdf('taranmis'))}), true)`).catch(() => {});
        const iki = s && await kosul(s, `(${BELGELER}).filter((b) => b.hazir).length === 2`);
        const isaretler = s ? await s.ev(ISARETLER).catch(() => null) : null;
        if (!olcum) sonuc('4) Olağan açılışta ölçüm işareti yazılmıyor (iki belge açıldı)', !!hazir && !!iki && Array.isArray(isaretler) && isaretler.length === 0, { hazir, iki, isaretler });
        else sonuc('4) --pdefe-olcum ile işaretler yazılıyor (ölçüm betikleri)', !!hazir && !!iki && Array.isArray(isaretler) && ['html', 'moduller', 'dosyaAc', 'ilkSayfa', 'belgeYuklendi'].every((x) => isaretler.includes(x)), isaretler);
        if (s) await pencereyiKapat(s);
        const c = await b.cikis(a.pid);
        if (!c) zorla(a.pid);
        await bekle(500);
      }
    } finally { b.kapat(); }
  }
} finally {
  for (const k of silinecekler) { try { fs.rmSync(k, { recursive: true, force: true }); } catch (e) { console.warn('Silinemedi:', k, e.message); } }
}
console.log(`\n${toplam - hata}/${toplam} denetim geçti${hata ? `, ${hata} HATA` : ''}`);
process.exit(hata ? 1 : 0);
