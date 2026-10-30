// XFA formunun düz PDF'i için çizim sayfası (0.3.1; main/xfaDuz.js gizli pencerede açar). Ana süreç baytları dilim dilim verir (parca),
// ciz formu PDF.js'in XFA katmanıyla sayfa sayfa kurar: her sayfa kendi boyutunda (@page adlı sayfaları), ekrandakiyle aynı hazırlıkla
// (xfaHtml.js sayfaHazirla: sayfa numaraları; basımda görünmeyen düğmeler gizli, yalnızca basımda görünenler açık). Yazı tipleri ve görseller
// yüklenince döner, ana süreç sayfayı printToPDF ile PDF'e çevirir.
import * as pdfjs from './pdfjs/pdf.min.mjs';
import { sayfaHazirla, xfaSigdir } from './xfaHtml.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const KAYNAK = new URL('./pdfjs/', import.meta.url).href;
const CSS_BIRIM = 96 / 72;

const parcalar = [];


function baytlar() {
  const diziler = parcalar.map((b64) => {
    const ham = atob(b64), b = new Uint8Array(ham.length);
    for (let i = 0; i < ham.length; i++) b[i] = ham.charCodeAt(i);
    return b;
  });
  const toplam = diziler.reduce((t, b) => t + b.length, 0), veri = new Uint8Array(toplam);
  let o = 0;
  for (const b of diziler) { veri.set(b, o); o += b.length; }
  parcalar.length = 0;
  return veri;
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function ciz(bilgi) {
  const belge = await pdfjs.getDocument({
    // Ekrandaki gibi (goruntuleyici.js XFA_YAZI): PDF.js FontFace kurmaz, yazı tipi adıyla bilgisayardan ya da xfa.css'teki benzerinden
    data: baytlar(), enableXfa: true, isEvalSupported: false, disableFontFace: true,
    standardFontDataUrl: KAYNAK + 'standard_fonts/', cMapUrl: KAYNAK + 'cmaps/', cMapPacked: true,
  }).promise;
  if (!belge.isPureXfa) return { tamam: false, hata: 'Belge XFA formu değil.' };
  const n = belge.numPages, alan = document.getElementById('alan');
  const sayfaKurallari = new Map();
  for (let i = 1; i <= n; i++) {
    const sayfa = await belge.getPage(i);
    const [x0, y0, x1, y1] = sayfa.view;
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const ad = `s${Math.round(w * 100)}x${Math.round(h * 100)}`;
    if (!sayfaKurallari.has(ad)) sayfaKurallari.set(ad, `@page ${ad} { size: ${w}pt ${h}pt; margin: 0; } .xfa-sayfa[data-boyut="${ad}"] { page: ${ad}; }`);
    const kap = document.createElement('div');
    kap.className = 'xfa-sayfa';
    kap.dataset.boyut = ad;
    kap.style.width = `${w}pt`; kap.style.height = `${h}pt`;
    const katman = document.createElement('div');
    kap.append(katman);
    alan.append(kap);
    const html = await sayfa.getXfa();
    sayfaHazirla(html, { sayfaNo: i, sayfaSayisi: n, bilgi, baski: true });
    pdfjs.XfaLayer.render({ viewport: sayfa.getViewport({ scale: CSS_BIRIM }).clone({ dontFlip: true }), div: katman, xfaHtml: html,
      annotationStorage: belge.annotationStorage, intent: 'print' });
  }
  const stil = document.createElement('style');
  stil.textContent = [...sayfaKurallari.values()].join('\n');
  document.head.append(stil);
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  await bekle(50);
  await document.fonts.ready;
  xfaSigdir(alan);   // ekrandaki gibi: taşan yazılar küçültülür
  return { tamam: true, sayfa: n };
}

window.xfaDuz = {
  parca(b64) { if (typeof b64 === 'string') parcalar.push(b64); return true; },
  async ciz(bilgi) {
    try { return await ciz(bilgi); } catch (e) { return { tamam: false, hata: String(e?.message || e) }; }
  },
};
