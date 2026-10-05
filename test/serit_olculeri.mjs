// Sekme şeridi ve araç çubuğunun ölçüleri (0.2.2, kullanıcı isteği; kullanıcı dört boyuttan ikincisini görselle seçti): iki şerit de 40 px
// yüksek (sekme şeridi 34 → 40), sekmeler 30 → 36 px, sekme yazısı 12 → 13 px, araç çubuğu düğmeleri 32 → 34 px, simgeleri 20 → 22 px,
// sayfa ve yakınlaştırma kutuları 28 px. Değişiklik yalnızca iki şeritte: öteki button.ikon'lar (Bul, notlar, araç pencereleri, Ayarlar)
// 32 px kalır. Dar pencerede araç çubuğu sıkışma kademeleriyle (uygulama.js aracCubuguSigdir) taşmadan sığar: Windows'ta en dar pencere
// 720 px (içi 704 px), Mac'te içi 720 px; 4 basamaklı sayfa sayısında ve Mac'te (menü düğmesi yok) de. Konsolda hata olmamalı (ResizeObserver
// döngüsü dahil).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9431 -Veri "%TEMP%\pdefe-so-9431"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9431; node test\surucu.mjs betik test\serit_olculeri.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(KOK, 'test', 'pdf');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
// Pencere içi genişlikler (CSS px): Windows'ta en dar pencerenin (720 px) içi 704 px; Mac'te pencerenin içi 720 px
const GENISLIKLER = [704, 720, 760, 900, 1000, 1280];

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const bilgi = (s) => console.log(`     · ${s}`);

/** Sürekli CDP oturumu: genişlik taklidi ve konsol olayları aynı oturumda. */
async function cdpOturumu() {
  const hedefler = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const sayfa = hedefler.find((h) => h.type === 'page' && h.url.startsWith('pdefe://app/src/renderer/index.html'));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map(), olaylar = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } else if (d.method) olaylar.push(d); };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder, olaylar };
}

export default async function ({ evalJs, bekle }) {
  const cdp = await cdpOturumu();
  await cdp.gonder('Runtime.enable'); await cdp.gonder('Log.enable');
  const kosul = async (ifade, sure = 15000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
  const genislik = async (w) => { if (w) await cdp.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: 700, deviceScaleFactor: 0, mobile: false }); else await cdp.gonder('Emulation.clearDeviceMetricsOverride'); await bekle(400); };

  try {
    await evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
    for (const ad of ['mevzuat_4721_TMK.pdf', 'mevzuat_6102_TTK.pdf']) {
      await evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ad))}).then(() => 1)`);
      await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
    }
    await bekle(800);
    await genislik(1280);

    // ================================================================ 1. Ölçüler
    const olc = () => evalJs(`(() => {
      const r = (s) => { const e = typeof s === 'string' ? document.querySelector(s) : s; if (!e) return null; const k = e.getBoundingClientRect(); return { l: k.left, t: k.top, r: k.right, b: k.bottom, w: k.width, h: k.height }; };
      const svg = (s) => r(document.querySelector(s)?.querySelector('svg'));
      const yazi = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
      const dugmeler = [...document.querySelectorAll('#arac-cubugu button.ikon:not(.acilir):not(.metinli)')].filter((d) => d.offsetParent);
      return {
        arac: r('#arac-cubugu'), serit: r('#sekme-cubugu'), liste: r('#sekme-liste'), sekme: r('.sekme.aktif'), sekmeYazi: yazi('.sekme.aktif .ad'),
        kapat: r('.sekme.aktif .kapat'), kapatSvg: svg('.sekme.aktif .kapat'), nokta: yazi('.sekme .nokta'),
        seritDugmeleri: ['#sekme-onceki', '#sekme-yeni', '#sekme-sonraki', '#sekme-acilir'].map((s) => ({ s, ...r(s), svg: svg(s)?.w })),
        dugmeler: dugmeler.map((d) => ({ k: d.dataset.komut || d.id, w: d.getBoundingClientRect().width, h: d.getBoundingClientRect().height, svg: [...d.querySelectorAll('svg')].map((s) => s.getBoundingClientRect().width).find((g) => g > 0) })),
        acilir: r('#dugme-zoom-secenek'), araclar: r('#dugme-araclar'), araclarOk: r('#dugme-araclar svg.ok'),
        zoom: r('#zoom-kutusu'), sayfa: r('#sayfa-kutusu'), kutuYazi: yazi('#zoom-kutusu'), aracYazi: yazi('#arac-cubugu'), gorunum: r('#belge-alani'),
      };
    })()`);
    const o = await olc();
    sonuc('Araç çubuğu 40 px, sekme şeridi 40 px (0.2.1\'de 34), belge alanı şeridin altında', o.arac.h === 40 && o.serit.h === 40 && o.serit.t === o.arac.b && Math.abs(o.gorunum.t - o.serit.b) < 0.5, { arac: o.arac, serit: o.serit, gorunum: o.gorunum.t });
    sonuc('Sekme 36 px yüksek (30\'du), şeridin altına oturur; yazı 13 px (12\'ydi)', o.sekme.h === 36 && Math.abs(o.sekme.b - (o.serit.b - 1)) < 0.5 && o.sekmeYazi === 13, { sekme: o.sekme, serit: o.serit, yazi: o.sekmeYazi });
    sonuc('Sekmenin × düğmesi 20 px (18\'di), simgesi 15 px; değişiklik noktası 18 px', o.kapat.w === 20 && o.kapat.h === 20 && o.kapatSvg.w === 15 && o.nokta === 18, { kapat: o.kapat, svg: o.kapatSvg, nokta: o.nokta });
    sonuc('Şeridin ◀ + ▶ ve açık belgeler düğmeleri 30 px (28\'di), simgeleri 22 px; dikeyde sekmeyle ortalı (±2 px)',
      o.seritDugmeleri.every((d) => d.w === 30 && d.h === 30 && d.svg === 22 && Math.abs((d.t + d.b) / 2 - (o.sekme.t + o.sekme.b) / 2) <= 2), o.seritDugmeleri);
    sonuc('Araç çubuğu düğmeleri 34×34 px (32\'ydi), simgeleri 22 px (20\'ydi)', o.dugmeler.length >= 17 && o.dugmeler.every((d) => d.w === 34 && d.h === 34 && d.svg === 22), o.dugmeler.filter((d) => d.w !== 34 || d.h !== 34 || d.svg !== 22));
    sonuc('Açılır ok 21 px (20\'ydi); Araçlar düğmesi yazılı, oku 15 px (14\'tü)', o.acilir.w === 21 && o.acilir.h === 34 && o.araclar.w > 80 && o.araclar.h === 34 && o.araclarOk?.w === 15, { acilir: o.acilir, araclar: o.araclar, ok: o.araclarOk });
    sonuc('Sayfa ve yakınlaştırma kutuları 28 px yüksek (24\'tü), yazı 13 px; çubukta dikey ortalı', o.zoom.h === 28 && o.sayfa.h === 28 && o.kutuYazi === 13 && o.aracYazi === 13
      && Math.abs((o.zoom.t + o.zoom.b) / 2 - (o.arac.t + o.arac.b - 1) / 2) <= 1, { zoom: o.zoom, sayfa: o.sayfa, yazi: o.kutuYazi });

    // Öteki button.ikon'lar değişmedi (genel kural 32 px / simge 20 px; Bul kutusunun düğmeleri)
    const oteki = await evalJs(`(async () => {
      const d = document.createElement('button'); d.className = 'ikon'; d.innerHTML = '<svg viewBox="0 0 20 20"></svg>'; document.body.append(d);
      const k = d.getBoundingClientRect(), s = d.querySelector('svg').getBoundingClientRect(); d.remove();
      window.__pdefe.komutCalistir('duzen.bul'); await new Promise((r) => setTimeout(r, 400));
      const b = document.querySelector('#bul-sonraki')?.getBoundingClientRect();
      document.querySelector('#bul-kapat')?.click(); await new Promise((r) => setTimeout(r, 200));
      return { genel: [k.width, k.height, s.width], bul: b ? [b.width, b.height] : null };
    })()`);
    sonuc('Şeritlerin dışındaki düğmeler değişmedi: genel button.ikon 32×32, simge 20; Bul kutusunun düğmeleri 34 px değil', J(oteki.genel) === J([32, 32, 20]) && oteki.bul && oteki.bul[0] !== 34 && oteki.bul[0] <= 32, oteki);

    // Başka pencereden sürüklenen sekmenin bırakılacağı yeri gösteren çizgi sekmeden 2 px kısa (34 px; 28'di)
    const birakma = await evalJs(`(() => { const e = document.createElement('div'); e.className = 'sekme-birakma'; document.querySelector('#sekme-cubugu').append(e); const h = e.getBoundingClientRect().height; e.remove(); return h; })()`);
    sonuc('Bırakma çizgisi 34 px (sekme yüksekliği − 2)', birakma === 34, birakma);

    // ================================================================ 2. Dar pencerede araç çubuğu taşmaz
    const sigma = () => evalJs(`(() => {
      const c = document.querySelector('#arac-cubugu'), k = c.getBoundingClientRect(), sinir = k.right - parseFloat(getComputedStyle(c).paddingRight);
      const ogeler = [...c.children].filter((e) => !e.classList.contains('esnek'));
      const kutular = ogeler.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, id: e.id || e.className }; });
      const ust = kutular.slice(1).filter((u, i) => u.l < kutular[i].r - 0.5);   // bir önceki öğenin üstüne binen
      const tema = document.querySelector('#dugme-tema').getBoundingClientRect();
      const gorunmeyen = [...c.querySelectorAll('button.ikon, input')].filter((d) => !d.offsetParent).map((d) => d.dataset.komut || d.id);
      return { sinif: c.className, tasma: Math.round((c.lastElementChild.getBoundingClientRect().right - sinir) * 10) / 10, ust: ust.length, temaIcinde: tema.left >= k.left && tema.right <= sinir + 0.5 && tema.width > 0,
        esnek: Math.round(c.querySelector('.esnek').getBoundingClientRect().width), gorunmeyen, sayfaKutusu: document.querySelector('#sayfa-kutusu').getBoundingClientRect().width };
    })()`);
    for (const w of GENISLIKLER) {
      await genislik(w);
      const s = await sigma();
      sonuc(`[${w} px] araç çubuğu taşmıyor, öğeler üst üste binmiyor, Tema düğmesi (en sağdaki) görünür`, s.tasma <= 0.5 && s.ust === 0 && s.temaIcinde, s);
      bilgi(`${w} px: kademe "${s.sinif || '-'}", boş ${s.esnek} px${s.gorunmeyen.length ? ', gizli: ' + s.gorunmeyen.join(' ') : ''}`);
      if (w === 1280) sonuc('[1280 px] sıkışma yok: bütün düğmeler tam boyda, Araçlar yazılı', s.sinif === '' && s.gorunmeyen.length === 0, s);
      if (w === 1000) sonuc('[1000 px] en çok ilk iki kademe (boşluklar, Araçlar simge); düğmeler 34 px', !/sikisik-3/.test(s.sinif), s.sinif);
    }
    // 4 basamaklı sayfa sayısı (ör. 1234 sayfalık belge; sayfa kutusu ve "/ 1234" genişler): en dar pencerede de sığar
    const eskiToplam = await evalJs(`(() => { const t = document.querySelector('#sayfa-toplam'), k = document.querySelector('#sayfa-kutusu'); const e = [t.textContent, k.value, k.style.getPropertyValue('--basamak')];
      t.textContent = '/ 1234'; k.value = '1234'; k.style.setProperty('--basamak', 4); return e; })()`);
    for (const w of [704, 720]) {
      await genislik(w); const s = await sigma();
      sonuc(`[${w} px, 1234 sayfa] araç çubuğu taşmıyor, Tema düğmesi görünür`, s.tasma <= 0.5 && s.ust === 0 && s.temaIcinde, s);
      bilgi(`${w} px, 4 basamak: kademe "${s.sinif}", boş ${s.esnek} px`);
    }
    // Geri al grubunda açılır ok yoksa bir tane eklenir (ör. geri alınabilecek adımların listesi): 6. kademe (düğmeler 26 px) devreye girer, sığar
    const ekOk = await evalJs(`(() => { const g = document.querySelector('#dugme-geri-al').parentElement; if (g.querySelector('.acilir')) return false;
      const d = document.createElement('button'); d.className = 'ikon acilir'; d.id = 'deneme-ek-ok'; d.innerHTML = '<svg viewBox="0 0 20 20"></svg>'; document.querySelector('#dugme-geri-al').after(d); return true; })()`);
    await genislik(720); await genislik(704);
    const s6 = await sigma();
    sonuc(`[704 px, 1234 sayfa, geri al grubunda açılır ok${ekOk ? ' (denemelik)' : ' (geri alınacak adımlar, 0.2.2)'}] araç çubuğu taşmıyor`, s6.tasma <= 0.5 && s6.ust === 0 && s6.temaIcinde, s6);
    bilgi(`704 px, 4 basamak + açılır ok: kademe "${s6.sinif}", boş ${s6.esnek} px`);
    sonuc('6. kademe: düğmeler 26 px, simgeler 20 px', /sikisik-6/.test(s6.sinif) && (await evalJs(`[document.querySelector('#dugme-geri-al').getBoundingClientRect().width, document.querySelector('#dugme-geri-al svg').getBoundingClientRect().width]`)).join() === '26,20', s6.sinif);
    if (ekOk) await evalJs(`document.querySelector('#deneme-ek-ok').remove(), 1`);
    // macOS (menü düğmesi hiç yok): en dar pencerede (içi 720 px) sığar
    await evalJs(`document.documentElement.dataset.platform = 'mac', 1`);
    for (const w of [720]) {
      await genislik(w); const s = await sigma();
      sonuc(`[Mac, ${w} px, 1234 sayfa] araç çubuğu taşmıyor`, s.tasma <= 0.5 && s.ust === 0 && s.temaIcinde, s);
      bilgi(`Mac ${w} px: kademe "${s.sinif}", boş ${s.esnek} px`);
    }
    await evalJs(`(() => { delete document.documentElement.dataset.platform; const t = document.querySelector('#sayfa-toplam'), k = document.querySelector('#sayfa-kutusu'), e = ${J(eskiToplam)};
      t.textContent = e[0]; k.value = e[1]; if (e[2]) k.style.setProperty('--basamak', e[2]); else k.style.removeProperty('--basamak'); return 1; })()`);
    // Geri genişleyince kademeler kalkar
    await genislik(704); await genislik(1280);
    const genis = await sigma();
    sonuc('[704 → 1280 px] genişleyince sıkışma kalkar', genis.sinif === '' && genis.tasma <= 0.5, genis);
    await genislik(0);
  } finally {
    await cdp.gonder('Emulation.clearDeviceMetricsOverride');
    const hatalar = cdp.olaylar.filter((x) => x.method === 'Runtime.exceptionThrown' || (x.method === 'Runtime.consoleAPICalled' && x.params.type === 'error')
      || (x.method === 'Log.entryAdded' && x.params.entry.level === 'error'))
      .map((x) => x.params.exceptionDetails?.exception?.description || x.params.exceptionDetails?.text || x.params.entry?.text || x.params.args?.map((a) => a.value ?? a.description).join(' '));
    sonuc('Konsolda hata yok (ResizeObserver döngüsü dahil)', hatalar.length === 0, hatalar);
    cdp.ws.close();
  }
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti`);
  if (hataSayisi) process.exitCode = 1;
}
