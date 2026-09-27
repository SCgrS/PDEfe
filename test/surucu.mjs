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

// ---------- Gerçek girdi (CDP Input): koordinatlar pencere içi CSS pikseli ----------
const DUGME_BIT = { left: 1, right: 2, middle: 4 };
const DEGISTIRICI = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const degistiriciMaske = (d = []) => d.reduce((m, k) => m | (DEGISTIRICI[k] || 0), 0);

/** Fare olayı: tur 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel'. */
async function fareGonder(gonder, tur, x, y, { dugme = 'left', tiklama = 1, degistiriciler = [], basili = false, deltaY = 0 } = {}) {
  await gonder('Input.dispatchMouseEvent', {
    type: tur, x, y, modifiers: degistiriciMaske(degistiriciler),
    button: tur === 'mouseMoved' && !basili ? 'none' : dugme, buttons: basili || tur === 'mousePressed' ? DUGME_BIT[dugme] : 0,
    clickCount: tiklama, deltaX: 0, deltaY,
  });
}

/** Fare: [{tur:'hareket'|'bas'|'birak'|'tekerlek', x, y, dugme, tiklama, degistiriciler, deltaY, bekle}] sırasıyla gönderilir. */
export async function fare(adimlar) {
  const { ws, gonder } = await baglan();
  let basili = false;
  for (const a of adimlar) {
    const tur = { hareket: 'mouseMoved', bas: 'mousePressed', birak: 'mouseReleased', tekerlek: 'mouseWheel' }[a.tur];
    if (a.tur === 'bas') basili = true;
    await fareGonder(gonder, tur, a.x, a.y, { ...a, basili });
    if (a.tur === 'birak') basili = false;
    if (a.bekle) await bekle(a.bekle);
  }
  ws.close();
}

export async function tikla(x, y, { dugme = 'left', tiklama = 1, degistiriciler = [] } = {}) {
  const adimlar = [{ tur: 'hareket', x, y }];
  for (let i = 1; i <= tiklama; i++) adimlar.push({ tur: 'bas', x, y, dugme, tiklama: i, degistiriciler }, { tur: 'birak', x, y, dugme, tiklama: i, degistiriciler });
  await fare(adimlar);
}

/** Basılı sürükleme: (x1,y1) → (x2,y2), adim ara hareketle. */
export async function surukle(x1, y1, x2, y2, { adim = 12, araMs = 15, degistiriciler = [] } = {}) {
  const adimlar = [{ tur: 'hareket', x: x1, y: y1 }, { tur: 'bas', x: x1, y: y1, degistiriciler, bekle: araMs }];
  for (let i = 1; i <= adim; i++) adimlar.push({ tur: 'hareket', x: x1 + ((x2 - x1) * i) / adim, y: y1 + ((y2 - y1) * i) / adim, degistiriciler, bekle: araMs });
  adimlar.push({ tur: 'birak', x: x2, y: y2, degistiriciler });
  await fare(adimlar);
}

const TUS_KODLARI = {
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, PageUp: 33, PageDown: 34, Home: 36, End: 35,
  Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ' ': 32, F3: 114, F4: 115, F11: 122,
};

/** Tuş basışı: tus 'ArrowRight', 'a', 'Enter'…; degistiriciler ['ctrl','shift','alt']. */
export async function tus(ad, degistiriciler = []) {
  const { ws, gonder } = await baglan();
  const tekKarakter = ad.length === 1;
  const kod = TUS_KODLARI[ad] ?? (tekKarakter ? ad.toUpperCase().charCodeAt(0) : 0);
  const code = tekKarakter ? (/[a-z]/i.test(ad) ? 'Key' + ad.toUpperCase() : /[0-9]/.test(ad) ? 'Digit' + ad : '') : ad;
  const ortak = { key: ad, code, windowsVirtualKeyCode: kod, nativeVirtualKeyCode: kod, modifiers: degistiriciMaske(degistiriciler) };
  const metinli = tekKarakter && !degistiriciler.some((d) => d === 'ctrl' || d === 'alt' || d === 'meta');
  await gonder('Input.dispatchKeyEvent', { type: metinli ? 'keyDown' : 'rawKeyDown', ...ortak, ...(metinli ? { text: ad, unmodifiedText: ad } : {}) });
  await gonder('Input.dispatchKeyEvent', { type: 'keyUp', ...ortak });
  ws.close();
}

/**
 * Ham tuş basışı (CDP): key, code ve sanal tuş kodu ayrı verilir; klavye düzeni birebir taklit edilir. Türkçe Q örnekleri:
 * Ctrl++ = { key: '+', code: 'Digit4', vk: 0x34, degistiriciler: ['ctrl', 'shift'] }, Ctrl+− = { key: '-', code: 'Equal', vk: 0xBD, ['ctrl'] },
 * sayısal + = { key: '+', code: 'NumpadAdd', vk: 0x6B }, Ctrl+I (ı) = { key: 'ı', code: 'KeyI', vk: 0x49, ['ctrl'] }. CDP tuşu menü
 * hızlandırıcısına ulaşmaz (sayfada işlenen tuşlar için); hızlandırıcı için test:tusGonder (görünmeyen masaüstündeki örnekte).
 */
export async function tusHam({ key, code, vk, degistiriciler = [] }) {
  const { ws, gonder } = await baglan();
  const ortak = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: degistiriciMaske(degistiriciler) };
  const metinli = key.length === 1 && !degistiriciler.some((d) => d === 'ctrl' || d === 'alt' || d === 'meta');
  await gonder('Input.dispatchKeyEvent', { type: metinli ? 'keyDown' : 'rawKeyDown', ...ortak, ...(metinli ? { text: key, unmodifiedText: key } : {}) });
  await gonder('Input.dispatchKeyEvent', { type: 'keyUp', ...ortak });
  ws.close();
}

/** Odaktaki öğeye metin yazar (IME gibi; Türkçe karakterler dahil). */
export async function yaz(metin) {
  const { ws, gonder } = await baglan();
  await gonder('Input.insertText', { text: metin });
  ws.close();
}

const [, , komut, arg] = process.argv;
if (komut === 'eval') console.log(JSON.stringify(await evalJs(arg), null, 1));
else if (komut === 'ss') console.log('kaydedildi:', await ekranGoruntusu(arg));
else if (komut === 'konsol') console.log((await konsol(+arg || 4000)).join('\n') || '(mesaj yok)');
else if (komut === 'betik') { const m = await import(pathToFileURL(path.resolve(arg)).href); await m.default({ evalJs, ekranGoruntusu, bekle, fare, tikla, surukle, tus, tusHam, yaz }); }
