// Yazı kutusunda birleşimli girdi (IME; macOS'ta ölü tuşla yazılan â, ê…) biter bitmez gelen basış ya da tuş (0.2.1): birleşen metin
// modele bir zamanlayıcıyla (compositionend → setTimeout) okunuyordu; arada işlenen basış düzenlemeyi birleşen metin olmadan bitiriyor,
// tuş ise DOM'u eski modelden yeniden çiziyordu, birleşen metin siliniyordu. CDP girdisiyle (Input.imeSetComposition / insertText,
// ardından yanıtı beklemeden basış ya da tuş) sınanır.
// Kullanım: powershell -File test\baslat.ps1 -Port <port> -Veri <klasör>; $env:PDEFE_CDP_PORT=<port>; node test\surucu.mjs betik test\yazi_ime.mjs
// Belge test/pdf'ten test/cikti/yazi-ime altına kopyalanır (asıl dosyaya yazılmaz).
import fs from 'node:fs';
import path from 'node:path';

const K = path.resolve('test/cikti/yazi-ime');
const KAYNAK = path.resolve('test/pdf/dergipark_5104529_zamanasimi.pdf');
const J = (x) => JSON.stringify(x);
let hata = 0, tamam = 0;
function sonuc(ad, kosul, ayrinti) {
  if (kosul) tamam++; else hata++;
  console.log(`${kosul ? 'TAMAM' : 'HATA '}  ${ad}${ayrinti === undefined ? '' : '  — ' + J(ayrinti)}`);
}

/** Tek oturumda ham CDP: komutlar yanıtı beklenmeden art arda gönderilebilir (gonderBekleme). */
async function cdp() {
  const hedefler = await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT || 9222}/json`)).json();
  const sayfa = hedefler.find((h) => h.type === 'page' && h.url.startsWith('pdefe://app/src/renderer/index.html'));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0; const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder };
}

export default async function ({ evalJs, bekle, tikla }) {
  fs.mkdirSync(K, { recursive: true });
  const pdf = path.join(K, 'ime.pdf');
  fs.copyFileSync(KAYNAK, pdf);
  await evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true });
    await p.dosyaAc(${J(pdf)}); await new Promise((r) => setTimeout(r, 1500)); return true; })()`);
  const N = 'window.__pdefe.aktif().notlar';
  const merkez = async (ifade) => evalJs(`(() => { const r = (${ifade}).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  await tikla(...(await merkez(`document.querySelector('#not-araclari [data-arac="yazi"]')`))); await bekle(300);
  sonuc('Yazı aracı seçildi (araç çubuğu)', (await evalJs(`${N}.arac`)) === 'yazi');
  // Noktalar ilk sayfanın görünen kısmında: x sayfa genişliğine, y görünen yüksekliğe göre
  const sayfa = await evalJs(`(() => { const r = window.__pdefe.aktif().gorunum.sayfalar[0].el.getBoundingClientRect(), k = window.__pdefe.aktif().gorunum.kaydirici.getBoundingClientRect();
    const t = Math.max(r.top, k.top), b = Math.min(r.bottom, k.bottom); return { l: r.left, w: r.width, t, h: b - t }; })()`);
  const nokta = (x, y) => [Math.round(sayfa.l + sayfa.w * x), Math.round(sayfa.t + sayfa.h * y)];
  const kutuAc = async (x, y) => {
    await evalJs(`(() => { const n = ${N}; if (n.arac !== 'yazi') n.aracSec('yazi'); return true; })()`);   // aracSec aç / kapa
    await tikla(...nokta(x, y));
    for (let i = 0; i < 30; i++) { if (await evalJs(`!!document.querySelector('.yazi-duzenleyici') && document.activeElement === document.querySelector('.yazi-duzenleyici')`)) return true; await bekle(100); }
    return false;
  };
  const yazilar = () => evalJs(`[...${N}.notlar.values()].filter((n) => n.tur === 'FreeText' && !n.silindi).map((n) => n.icerik)`);
  const { ws, gonder } = await cdp();
  const fareBas = (x, y, type) => gonder('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });

  // 1) "Merhaba " + birleşimde "dünya"; birleşim tamamlanır tamamlanmaz sayfada kutunun dışına basış (Korece IME'de son hece hep birleşimdedir)
  sonuc('Sayfaya tıklama yazı kutusu açar', await kutuAc(0.15, 0.1));
  await gonder('Input.insertText', { text: 'Merhaba ' });
  await gonder('Input.imeSetComposition', { text: 'dün', selectionStart: 3, selectionEnd: 3 });
  await gonder('Input.imeSetComposition', { text: 'dünya', selectionStart: 5, selectionEnd: 5 });
  await bekle(150);
  const [dx, dy] = nokta(0.75, 0.9);
  await Promise.all([gonder('Input.insertText', { text: 'dünya' }), fareBas(dx, dy, 'mousePressed'), fareBas(dx, dy, 'mouseReleased')]);
  await bekle(500);
  let y = await yazilar();
  sonuc('Birleşim biter bitmez dışarı basış: düzenleme biter, birleşen sözcük yazıda kalır ("Merhaba dünya")', J(y) === J(['Merhaba dünya']) && !(await evalJs(`!!${N}.duzenleyici`)), y);

  // 2) macOS ölü tuşu: "h", birleşimde "^", "â" ile biter; hemen ardından "k" tuşu
  sonuc('İkinci yazı kutusu açılır', await kutuAc(0.15, 0.35));
  await gonder('Input.insertText', { text: 'h' });
  await gonder('Input.imeSetComposition', { text: '^', selectionStart: 1, selectionEnd: 1 });
  await bekle(150);
  await Promise.all([gonder('Input.insertText', { text: 'â' }),
    gonder('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, nativeVirtualKeyCode: 75, text: 'k', unmodifiedText: 'k' }),
    gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, nativeVirtualKeyCode: 75 })]);
  await bekle(400);
  const ed = await evalJs(`(() => { const d = ${N}.duzenleyici; return d ? { model: d.parcalar.map((p) => p.metin).join(''), dom: d.el.textContent } : null; })()`);
  sonuc('Birleşim biter bitmez gelen tuş: birleşen harf silinmez ("hâk"; model ve görünen metin aynı)', ed?.model === 'hâk' && ed?.dom === 'hâk', ed);
  await Promise.all([fareBas(dx, dy, 'mousePressed'), fareBas(dx, dy, 'mouseReleased')]);
  await bekle(500);
  y = await yazilar();
  sonuc('Düzenleme bitince iki yazı da kayıtlı ("Merhaba dünya", "hâk")', J([...y].sort()) === J(['Merhaba dünya', 'hâk']), y);

  // 3) Olağan yol: birleşim bitip zamanlayıcı okuduktan sonra Esc
  sonuc('Üçüncü yazı kutusu açılır', await kutuAc(0.15, 0.6));
  await gonder('Input.imeSetComposition', { text: 'çiçek', selectionStart: 5, selectionEnd: 5 });
  await gonder('Input.insertText', { text: 'çiçek' });
  await bekle(300);
  await gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await bekle(400);
  y = await yazilar();
  sonuc('Birleşim bittikten sonra Esc: yazı kayıtlı ("çiçek")', y.includes('çiçek') && y.length === 3, y);
  ws.close();

  await evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); return true; })()`);
  console.log(`\n${tamam} tamam, ${hata} hata`);
}
