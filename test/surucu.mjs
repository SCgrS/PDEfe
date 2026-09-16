// Geliştirme/test sürücüsü: çalışan PDEfe'ye Chrome DevTools Protokolü ile bağlanır,
// renderer'da JS çalıştırır ve ekran görüntüsü alır.
// Kullanım: node test/surucu.mjs eval "<js>"  |  node test/surucu.mjs ss <dosya.png>  |  node test/surucu.mjs betik <dosya.mjs>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = process.env.PDEFE_CDP_PORT || 9222;

async function baglan() {
  const hedefler = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const sayfa = hedefler.find((h) => h.type === 'page' && h.url.startsWith('pdefe://'));
  if (!sayfa) throw new Error('PDEfe penceresi bulunamadı: ' + JSON.stringify(hedefler.map((h) => h.url)));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map();
  const olaylar = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } else if (d.method) olaylar.push(d); };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder, olaylar };
}

/** Sayfayı yeniden yükler, konsol mesajlarını ve hataları toplar. */
export async function konsol(sure = 4000, yenile = true) {
  const { ws, gonder, olaylar } = await baglan();
  await gonder('Runtime.enable'); await gonder('Log.enable');
  if (yenile) await gonder('Page.reload', { ignoreCache: true });
  await bekle(sure);
  ws.close();
  const satirlar = [];
  for (const o of olaylar) {
    if (o.method === 'Runtime.exceptionThrown') satirlar.push('HATA: ' + (o.params.exceptionDetails.exception?.description || o.params.exceptionDetails.text) + ' @' + (o.params.exceptionDetails.url || '') + ':' + o.params.exceptionDetails.lineNumber);
    else if (o.method === 'Runtime.consoleAPICalled') satirlar.push(o.params.type + ': ' + o.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    else if (o.method === 'Log.entryAdded') satirlar.push('log/' + o.params.entry.level + ': ' + o.params.entry.text + ' ' + (o.params.entry.url || ''));
  }
  return satirlar;
}

export async function evalJs(kod) {
  const { ws, gonder } = await baglan();
  const r = await gonder('Runtime.evaluate', { expression: kod, awaitPromise: true, returnByValue: true, userGesture: true });
  ws.close();
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}

export async function ekranGoruntusu(dosya) {
  const { ws, gonder } = await baglan();
  const r = await gonder('Page.captureScreenshot', { format: 'png' });
  ws.close();
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.writeFileSync(dosya, Buffer.from(r.result.data, 'base64'));
  return dosya;
}

export const bekle = (ms) => new Promise((c) => setTimeout(c, ms));

const [, , komut, arg] = process.argv;
if (komut === 'eval') console.log(JSON.stringify(await evalJs(arg), null, 1));
else if (komut === 'ss') console.log('kaydedildi:', await ekranGoruntusu(arg));
else if (komut === 'konsol') console.log((await konsol(+arg || 4000)).join('\n') || '(mesaj yok)');
else if (komut === 'betik') { const m = await import(pathToFileURL(path.resolve(arg)).href); await m.default({ evalJs, ekranGoruntusu, bekle }); }
