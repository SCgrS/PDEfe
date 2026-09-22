// Güncelleme uçtan uca testi için yerel güncelleme sunucusu (GitHub Releases düzenini taklit eder). Yalnızca 127.0.0.1'i dinler.
//
// Kullanım: node test/guncelleme-e2e/sunucu.mjs --port 9914 --kok test/cikti/g1/e2e --gunluk <istekler.jsonl> [--hiz 40000000]
//   <kok>/<X>/latest.yml + PDEfe-Setup.exe + PDEfe-Setup.exe.blockmap (derle.mjs çıktıları; X: A, B, C…) sürümlere göre eşlenir.
//   GET /latest.yml                  → yayındaki sürümün latest.yml'i; dosya yolu "v<sürüm>/PDEfe-Setup.exe" olarak yazılır (GitHub'daki
//                                      gibi sürüm yolda: eski sürümün blockmap'i v<eski>/PDEfe-Setup.exe.blockmap'ten bulunur)
//   GET /v<sürüm>/PDEfe-Setup.exe[.blockmap]   (Range ve çok aralıklı multipart/byteranges desteklenir)
//   Denetim: /__yayinla?surum=0.9.1   /__hata?acik=1|0 (açıkken /v… istekleri bağlantı kesilerek düşer)   /__gunluk   /__kapat
// Her istek <gunluk>'e bir JSON satırı olarak yazılır: { t, yontem, yol, aralik, durum, bayt }.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const arg = (ad, v) => { const i = process.argv.indexOf('--' + ad); return i > 0 ? process.argv[i + 1] : v; };
const PORT = Number(arg('port', 9914));
const KOK = path.resolve(arg('kok', '.'));
const GUNLUK = path.resolve(arg('gunluk', path.join(KOK, 'istekler.jsonl')));
const HIZ = Number(arg('hiz', 0));   // bayt/sn; 0 = sınırsız

const surumler = new Map();   // '0.9.1' → { klasor, yml }
for (const ad of fs.readdirSync(KOK)) {
  const yml = path.join(KOK, ad, 'latest.yml');
  if (!fs.existsSync(yml)) continue;
  const metin = fs.readFileSync(yml, 'utf8');
  const surum = /^version:\s*(\S+)/m.exec(metin)?.[1];
  if (surum) surumler.set(surum, { klasor: path.join(KOK, ad), yml: metin });
}
let yayinda = arg('yayinda', [...surumler.keys()].sort().at(-1));
let hataModu = false;

function gunlukYaz(k) { fs.appendFileSync(GUNLUK, JSON.stringify({ t: new Date().toISOString(), ...k }) + '\n'); }

function aralikCoz(baslik, boyut) {
  const m = /^bytes=(.+)$/.exec(baslik || '');
  if (!m) return null;
  const araliklar = [];
  for (const p of m[1].split(',')) {
    const [a, b] = p.trim().split('-');
    let bas, son;
    if (a === '') { bas = boyut - Number(b); son = boyut - 1; } else { bas = Number(a); son = b === '' || b === undefined ? boyut - 1 : Number(b); }
    if (!(bas >= 0 && son >= bas && son < boyut)) return 'gecersiz';
    araliklar.push([bas, son]);
  }
  return araliklar;
}

/** Dosya parçasını (hız sınırıyla) yazar. */
function parcaYaz(res, dosya, bas, son) {
  return new Promise((coz, reddet) => {
    const akis = fs.createReadStream(dosya, { start: bas, end: son, highWaterMark: 256 * 1024 });
    akis.on('data', (parca) => {
      const devam = res.write(parca);
      if (HIZ > 0) { akis.pause(); setTimeout(() => akis.resume(), (parca.length / HIZ) * 1000); }
      else if (!devam) { akis.pause(); res.once('drain', () => akis.resume()); }
    });
    akis.on('end', coz);
    akis.on('error', reddet);
    res.on('close', () => akis.destroy());
  });
}

async function dosyaGonder(req, res, dosya, kayit) {
  const boyut = fs.statSync(dosya).size;
  const araliklar = aralikCoz(req.headers.range, boyut);
  if (araliklar === 'gecersiz') { res.writeHead(416, { 'content-range': `bytes */${boyut}` }); res.end(); kayit.durum = 416; return; }
  if (!araliklar) {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': boyut, 'accept-ranges': 'bytes' });
    kayit.durum = 200; kayit.bayt = boyut;
    await parcaYaz(res, dosya, 0, boyut - 1); res.end(); return;
  }
  if (araliklar.length === 1) {
    const [bas, son] = araliklar[0];
    res.writeHead(206, { 'content-type': 'application/octet-stream', 'content-length': son - bas + 1, 'content-range': `bytes ${bas}-${son}/${boyut}`, 'accept-ranges': 'bytes' });
    kayit.durum = 206; kayit.bayt = son - bas + 1;
    await parcaYaz(res, dosya, bas, son); res.end(); return;
  }
  const sinir = 'pdefe' + Date.now().toString(16);
  const bolumBasi = (bas, son, ilk) => Buffer.from(`${ilk ? '' : '\r\n'}--${sinir}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${bas}-${son}/${boyut}\r\n\r\n`);
  const kapanis = Buffer.from(`\r\n--${sinir}--\r\n`);
  let uzunluk = kapanis.length;
  araliklar.forEach(([bas, son], i) => { uzunluk += bolumBasi(bas, son, i === 0).length + (son - bas + 1); });
  res.writeHead(206, { 'content-type': `multipart/byteranges; boundary=${sinir}`, 'content-length': uzunluk, 'accept-ranges': 'bytes' });
  kayit.durum = 206; kayit.bayt = uzunluk; kayit.parca = araliklar.length;
  for (let i = 0; i < araliklar.length; i++) {
    const [bas, son] = araliklar[i];
    res.write(bolumBasi(bas, son, i === 0));
    await parcaYaz(res, dosya, bas, son);
  }
  res.end(kapanis);
}

const sunucu = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const kayit = { yontem: req.method, yol: url.pathname, aralik: req.headers.range ? String(req.headers.range).slice(0, 80) : undefined };
  try {
    if (url.pathname === '/__yayinla') { yayinda = url.searchParams.get('surum'); res.end(JSON.stringify({ yayinda })); return; }
    if (url.pathname === '/__hata') { hataModu = url.searchParams.get('acik') === '1'; res.end(JSON.stringify({ hataModu })); return; }
    if (url.pathname === '/__gunluk') { res.end(fs.existsSync(GUNLUK) ? fs.readFileSync(GUNLUK) : ''); return; }
    if (url.pathname === '/__kapat') { res.end('kapanıyor'); setTimeout(() => process.exit(0), 100); return; }
    if (url.pathname === '/latest.yml') {
      const s = surumler.get(yayinda);
      if (!s) { res.writeHead(404); res.end(); kayit.durum = 404; return; }
      const govde = s.yml.replace(/^(\s*-?\s*url:\s*)(PDEfe-Setup\.exe)\s*$/m, `$1v${yayinda}/$2`).replace(/^path:\s*(PDEfe-Setup\.exe)\s*$/m, `path: v${yayinda}/$1`);
      res.writeHead(200, { 'content-type': 'text/yaml; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(govde); kayit.durum = 200; kayit.surum = yayinda; return;
    }
    const m = /^\/v(\d+\.\d+\.\d+)\/(PDEfe-Setup\.exe(?:\.blockmap)?)$/.exec(url.pathname);
    if (m && surumler.has(m[1])) {
      if (hataModu) { kayit.durum = 'kesildi'; req.socket.destroy(); return; }
      await dosyaGonder(req, res, path.join(surumler.get(m[1]).klasor, m[2]), kayit);
      return;
    }
    res.writeHead(404); res.end(); kayit.durum = 404;
  } catch (e) {
    kayit.durum = 'hata'; kayit.hata = String(e?.message || e);
    try { res.destroy(); } catch { /* yok say */ }
  } finally {
    if (!url.pathname.startsWith('/__')) gunlukYaz(kayit);
  }
});
sunucu.listen(PORT, '127.0.0.1', () => console.log(`güncelleme sunucusu http://127.0.0.1:${PORT}/  yayında ${yayinda}  sürümler ${[...surumler.keys()].join(', ')}  günlük ${GUNLUK}`));
