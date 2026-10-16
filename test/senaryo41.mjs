// Senaryo 41 (0.2.8, kullanıcı istekleri; araç pencereleri):
//   1) Karo açıklamaları (madde 1 ve 5): Format Değiştir "PDF, UDF, Word, TIFF, JPG dosya formatlarını değiştirir", Birleştir "Birleştirir,
//      farklı dosya formatlarıyla çalışabilir" (açılış ekranı, Araçlar penceresi). Açılış ekranında (1280, 1000, 800 ve 704 px genişlikte) ve
//      Araçlar penceresinde (geniş ve dar pencerede) bütün karolar aynı yükseklikte.
//   2) İdeal / Düşük'ün yanındaki yaklaşık boyut (madde 2): TIFF / JPG hedefi seçilince, renk değişince ve hesaplama sürerken düğmelerin
//      genişliği değişmez (ResizeObserver kaydı), "hesaplanıyor…" yazısı görünmez; hesaplanırken önceki değer soluk kalır.
//   3) Format Değiştir'in Kaydet bölümü (madde 9 ve 10): "Yeni belge olarak kaydet | Üzerine yaz" seçimi, "Dönüştürülen dosya her zaman yeni dosya
//      olarak kaydedilir." ve "Dosyalar girdilerin adıyla kaydedilir…" yazıları yok; "zaten var" sorusu duruyor; Sıkıştır'da seçim duruyor.
//   4) Sonuç kutusu (madde 3, 4, 6): tek ve çok dosyada (Word, PDF + UDF karışık, uzun ad, hatalı satır, 12 sayfalık JPG, Ayır) başlık, satırlar ve
//      düğmeler ortalı (getBoundingClientRect, ±1,5 px); küçük "Aç"lar yok; "Klasörde göster"in sağında "Tümünü aç" (tek dosyada "Aç"): ana sürecin
//      dosya:varsayilanlaAc'ı (test örneğinde program açılmaz, istek test:diyalogKaydi'na düşer); 10'dan çok dosyada önce soru; açamazsa ileti;
//      yalnızca araçların bu oturumda yazdığı dosyalar açılır.
// Girdiler test/ornek_pdf_uret.py ile test/cikti/s41/girdi altında üretilir (gerçek belge yok). Araçların çıktı klasörü test klasörüdür.
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9441 -Veri "$env:TEMP\pdefe-s41-9441" -Boyut "1280,1000" [-Olcek 1.25]
//   $env:PDEFE_CDP_PORT=9441; node test\surucu.mjs betik test\senaryo41.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,3". Ekran görüntüleri test/cikti/s41/png altına.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's41');
const GIRDI = path.join(UI, 'girdi');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const bilgi = (s) => console.log(`     · ${s}`);
/** Bu koşum için boş çıktı klasörü (test/cikti/s41/<ad>-<zaman>). */
const KOSUM = Date.now().toString(36);
const yeniKlasor = (ad) => { const k = path.join(UI, `${ad}-${KOSUM}`); fs.mkdirSync(k, { recursive: true }); return k; };
const yakin = (a, b, pay = 0.5) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= pay;

/** Örnek PDF (sayfa sayısı, başlık); var olanı yeniden üretmez. */
function ornekPdf(ad, sayfa = 2, baslik = 'Deneme belgesi') {
  const yol = path.join(GIRDI, ad);
  if (!fs.existsSync(yol)) execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yol, String(sayfa), baslik], { encoding: 'utf8' });
  return yol;
}

/** Sürekli CDP oturumu (pencere genişliği taklidi; acilis_hizasi.mjs'teki gibi). */
async function cdpOturumu() {
  const liste = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const sayfa = liste.find((h) => h.type === 'page' && /^pdefe:\/\/app\/src\/renderer\/index\.html/.test(h.url));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder };
}

/** Sayfada: öğenin kutusu (CSS px). */
const KUTU = `window.__s41kutu = (e) => { if (typeof e === 'string') e = document.querySelector(e); if (!e) return null; const r = e.getBoundingClientRect();
  return { sol: r.left, sag: r.right, ust: r.top, alt: r.bottom, w: r.width, h: r.height, ortaX: r.left + r.width / 2, ortaY: r.top + r.height / 2 }; }; true`;

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await evalJs(ifade); } catch { v = null; }
      if (v || Date.now() - t0 > sure) return v;
      await bekle(120);
    }
  };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  fs.mkdirSync(GIRDI, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  await evalJs(KUTU);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const olcek = await evalJs('devicePixelRatio');
  bilgi(`ekran ölçeği ${olcek}`);
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const ciktiKlasoruAyarla = (k) => evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'ciktiKlasoru', ${J(k)}); window.__pdefe.ayar().ciktiKlasoru = ${J(k)}; return true; })()`);
  const araclariKapat = () => evalJs(`(async () => { const eski = window.__pdefeOtoYanit; window.__pdefeOtoYanit = { secim: 0 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); } finally { window.__pdefeOtoYanit = eski; } return true; })()`);
  fs.mkdirSync(path.join(UI, 'cikti'), { recursive: true });
  await ciktiKlasoruAyarla(path.join(UI, 'cikti'));
  const cdp = await cdpOturumu();
  const genislik = async (w, h = 900) => {
    if (w) await cdp.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false });
    else await cdp.gonder('Emulation.clearDeviceMetricsOverride');
    await bekle(200);
  };

  // ------------------------------------------------------------ 1) Karo açıklamaları ve eşit karo yüksekliği (madde 1 ve 5)
  if (bolum(1)) {
    console.log('\n== 1) Karo açıklamaları; açılış ekranında ve Araçlar penceresinde karolar eşit yükseklikte');
    await araclariKapat(); await sekmeleriKapat();
    await kosul(`!document.querySelector('#baslangic').hidden`);
    const BEKLENEN = { 'arac.gorselBirlestir': 'Birleştirir, farklı dosya formatlarıyla çalışabilir', 'arac.donustur': 'PDF, UDF, Word, TIFF, JPG dosya formatlarını değiştirir' };
    const acilis = () => evalJs(`[...document.querySelectorAll('.karsilama-arac')].map((k) => ({ komut: k.dataset.eylem, aciklama: k.querySelector('.karsilama-aciklama').textContent,
      h: Math.round(k.getBoundingClientRect().height * 10) / 10, ust: Math.round(k.getBoundingClientRect().top) }))`);
    let a = await acilis();
    sonuc('1) Açılış ekranı: Format Değiştir ve Birleştir karolarının açıklaması kullanıcının yazdığı gibi', Object.entries(BEKLENEN).every(([k, v]) => a.find((x) => x.komut === k)?.aciklama === v),
      a.map((x) => [x.komut, x.aciklama]));
    for (const w of [1280, 1000, 800, 704]) {
      await genislik(w);
      a = await acilis();
      const h = a.map((x) => x.h);
      sonuc(`1) Açılış ekranı ${w} px: altı karo aynı yükseklikte`, a.length === 6 && h.every((x) => yakin(x, h[0], 0.6)), a.map((x) => [x.komut, x.h, x.ust]));
      if (w === 1280) await ss('01-acilis-1280');
    }
    // Araçlar penceresi (araç çubuğundaki düğme; dar pencerede iki sütun)
    for (const w of [1280, 690]) {
      await genislik(w);
      await evalJs(`(document.querySelector('#dugme-araclar').click(), true)`);
      await kosul(`!document.querySelector('#araclar-penceresi').hidden`, 3000);
      await bekle(250);
      const k = await evalJs(`[...document.querySelectorAll('.araclar-karo')].map((k) => ({ komut: k.dataset.aracKomut, aciklama: k.querySelector('.araclar-aciklama').textContent,
        h: Math.round(k.getBoundingClientRect().height * 10) / 10, w: Math.round(k.getBoundingClientRect().width), ust: Math.round(k.getBoundingClientRect().top), sol: Math.round(k.getBoundingClientRect().left) }))`);
      const sutun = new Set(k.map((x) => x.sol)).size;
      sonuc(`1) Araçlar penceresi ${w} px: açıklamalar yeni metin, ${w > 700 ? 3 : 2} sütun, karolar 200 px genişlikte ve aynı yükseklikte`, Object.entries(BEKLENEN).every(([kk, v]) => k.find((x) => x.komut === kk)?.aciklama === v)
        && sutun === (w > 700 ? 3 : 2) && k.every((x) => x.w === 200 && yakin(x.h, k[0].h, 0.6)), k);
      if (w === 1280) await ss('01-araclar-penceresi');
      await evalJs(`(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`);
      await evalJs(`(document.querySelector('#araclar-penceresi').hidden || document.querySelector('#dugme-araclar').click(), true)`);
      await kosul(`document.querySelector('#araclar-penceresi').hidden`, 3000);
    }
    await genislik(0);
  }

  // ------------------------------------------------------------ 2) İdeal / Düşük'ün tahmini: düzen kaymaz (madde 2)
  if (bolum(2)) {
    console.log('\n== 2) İdeal / Düşük: tahmin hesaplanırken düğmeler genişleyip daralmaz, "hesaplanıyor…" yazısı yok');
    await araclariKapat(); await sekmeleriKapat();
    const pdf = ornekPdf('tahmin.pdf', 3, 'Tahmin örneği');
    await evalJs(`(async () => { window.__s41d = await import('pdefe://app/src/renderer/araclar/donustur.js'); return true; })()`);
    const A = 'window.__s41d.acikDonusturPenceresi()';
    await evalJs(`(window.__pdefe.komutCalistir('arac.donustur', [${J(pdf)}]), true)`);
    await kosul(`!!${A} && ${A}.ogeler.length === 1 && !${A}.ogeler[0].yukleniyor`, 15000);
    await bekle(400);
    /** Gözlemi başlatır: düğmelerin genişliği ve .boyut metni her değişiklikte kaydedilir (bölüm görünürken). */
    const gozle = () => evalJs(`(() => {
      window.__s41olc = []; const t0 = performance.now();
      const kaydet = () => { const s = document.querySelector('.donustur-secenekler'); if (s.hidden) return; const d = [...document.querySelectorAll('.donustur-dpi-secim > button')];
        window.__s41olc.push({ t: Math.round(performance.now() - t0), w: d.map((b) => Math.round(b.getBoundingClientRect().width * 10) / 10), metin: d.map((b) => b.querySelector('.boyut').textContent),
          bekliyor: d.map((b) => b.querySelector('.boyut').classList.contains('bekliyor')), bolumH: Math.round(s.getBoundingClientRect().height) }); };
      window.__s41RO?.disconnect(); window.__s41MO?.disconnect();
      window.__s41RO = new ResizeObserver(kaydet); for (const b of document.querySelectorAll('.donustur-dpi-secim > button, .donustur-secenekler')) window.__s41RO.observe(b);
      window.__s41MO = new MutationObserver(kaydet); window.__s41MO.observe(document.querySelector('.donustur-secenekler'), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
      kaydet(); return true; })()`);
    const bitti = () => kosul(`(() => { const b = [...document.querySelectorAll('.donustur-dpi-secim .boyut')]; return b.length === 2 && b.every((x) => !x.classList.contains('bekliyor') && /^ · [\\d.,]+ (KB|MB)$/.test(x.textContent)); })()`, 30000);
    const ozet = async () => { await bekle(300); const o = await evalJs('window.__s41olc'); return {
      kayit: o.length, wler: [...new Set(o.map((x) => J(x.w)))], hesaplaniyor: o.some((x) => x.metin.some((m) => /hesaplan/i.test(m))), bos: o.some((x) => x.metin.some((m) => m === '')),
      son: o.at(-1), bolumH: [...new Set(o.map((x) => x.bolumH))] }; };
    const sabit = (z) => z.wler.length === 1 && JSON.parse(z.wler[0]).every((w) => w > 0);
    // TIFF hedefi seçilir (bölüm görünür olur)
    await gozle();
    await evalJs(`(${A}.hedefSec(${A}.ogeler[0], 'tiff'), true)`);
    await bitti();
    let z = await ozet();
    sonuc('2) TIFF seçilince: düğmelerin genişliği bölüm göründüğü andan değer gelene dek hiç değişmedi', sabit(z), z);
    sonuc('2) "hesaplanıyor…" yazısı hiç görünmedi; sonunda "· N KB / MB"', !z.hesaplaniyor && /^ · [\d.,]+ (KB|MB)$/.test(z.son?.metin?.[0] || ''), { hesaplaniyor: z.hesaplaniyor, son: z.son });
    sonuc('2) İki düğme aynı genişlikte; seçenekler bölümünün yüksekliği değişmedi', !!z.son && yakin(z.son.w[0], z.son.w[1], 0.5) && z.bolumH.length === 1, { w: z.son?.w, bolumH: z.bolumH });
    await ss('02-tahmin-tiff');
    // Renk değişince yeniden hesaplanır: eski değer soluk kalır (boşalmaz, "…" olmaz), genişlik değişmez
    const onceki = z.son.metin;
    await gozle();
    await evalJs(`(document.querySelector('.donustur-renk-secim > button[data-id="renkli"]').click(), true)`);
    await kosul(`(() => { const b = document.querySelector('.donustur-dpi-secim > button[data-id="300"] .boyut'); return !b.classList.contains('bekliyor') && b.textContent !== ${J(onceki[0])}; })()`, 30000);
    await bitti();
    z = await ozet();
    const ara = (await evalJs('window.__s41olc')).filter((x) => x.bekliyor.some(Boolean));
    sonuc('2) Renk değişince: hesaplanırken önceki değer soluk kaldı (boş ya da "…" olmadı), sonra yeni değer; genişlik değişmedi', sabit(z) && !z.bos && ara.length > 0
      && ara.every((x) => J(x.metin) === J(onceki)) && J(z.son.metin) !== J(onceki), { z, ara: ara.slice(0, 3) });
    // Renk değişip 200 ms içinde eski hâline dönünce (aynı istek) bekleme durumunda kalmaz, değer aynı
    const simdiki = z.son.metin;
    await evalJs(`(document.querySelector('.donustur-renk-secim > button[data-id="gri"]').click(), document.querySelector('.donustur-renk-secim > button[data-id="renkli"]').click(), true)`);
    await bekle(800);
    const geri = await evalJs(`[...document.querySelectorAll('.donustur-dpi-secim .boyut')].map((b) => ({ m: b.textContent, b: b.classList.contains('bekliyor') }))`);
    sonuc('2) Renk değişip 200 ms içinde geri dönünce: değer yerinde, bekleme durumunda kalmadı', geri.every((x) => !x.b) && J(geri.map((x) => x.m)) === J(simdiki), { geri, simdiki });
    // JPG hedefi: aynı
    await evalJs(`(${A}.hedefSec(${A}.ogeler[0], 'udf'), true)`);
    await bekle(600);
    await gozle();
    await evalJs(`(${A}.hedefSec(${A}.ogeler[0], 'gorsel'), true)`);
    await bitti();
    z = await ozet();
    sonuc('2) JPG seçilince: düğmelerin genişliği değişmedi, "hesaplanıyor…" yok', sabit(z) && !z.hesaplaniyor, z);
    await evalJs(`(window.__s41RO?.disconnect(), window.__s41MO?.disconnect(), true)`);
    await araclariKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
  }

  // ------------------------------------------------------------ 3) Format Değiştir'in Kaydet bölümü (madde 9 ve 10)
  if (bolum(3)) {
    console.log('\n== 3) Format Değiştir\'in Kaydet bölümü: seçim ve açıklama yazıları yok; "zaten var" sorusu duruyor; öbür araçlarda seçim duruyor');
    await araclariKapat(); await sekmeleriKapat();
    const klasor = yeniKlasor('kaydet');
    await ciktiKlasoruAyarla(klasor);
    const pdf = ornekPdf('kaydet.pdf', 2, 'Kaydet örneği'), pdf2 = ornekPdf('kaydet2.pdf', 1, 'İkinci örnek');
    await evalJs(`(async () => { window.__s41d = await import('pdefe://app/src/renderer/araclar/donustur.js'); return true; })()`);
    const A = 'window.__s41d.acikDonusturPenceresi()';
    // Hedef seçimleri hatırlanır (ayar donusturme): önceki bölümün JPG seçimi kalmasın
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
    await evalJs(`(window.__pdefe.komutCalistir('arac.donustur', [${J(pdf)}]), true)`);
    await kosul(`!!${A} && ${A}.ogeler.length === 1 && !${A}.ogeler[0].yukleniyor`, 15000);
    await evalJs(`${A}.kayit.hazir.then(() => true)`);
    await evalJs(`(${A}.hedefSec(${A}.ogeler[0], 'udf'), true)`);
    await kosul(`${A}.kayit.cikti.ad() === 'kaydet.udf'`, 5000);
    const durum = () => evalJs(`(() => { const p = document.querySelector('.donustur-pencere'), b = p.querySelector('.donustur-kayit');
      const gorunur = [...b.querySelectorAll('*')].filter((e) => !e.closest('[hidden]') && e.getBoundingClientRect().height > 0);
      return { metin: b.innerText, secim: !!b.querySelector('.arac-kayit-secim, .arac-segmentli'), dugmeler: gorunur.filter((e) => e.matches('button')).map((e) => e.textContent.trim()),
        aciklamalar: gorunur.filter((e) => e.matches('.arac-aciklama')).map((e) => e.textContent), ad: b.querySelector('.arac-kayit-yeni .arac-cikti-ad').value,
        adGizli: b.querySelector('.arac-kayit-yeni .arac-cikti-ad').hidden, hedef: ${A}.kayit.hedef() }; })()`);
    let d = await durum();
    await ss('03-kaydet-tek');
    sonuc('3) Tek dosya: "Yeni belge olarak kaydet | Üzerine yaz" seçimi ve "Dönüştürülen dosya her zaman…" yazısı yok; ad + klasör + Değiştir var', !d.secim
      && !/Yeni belge olarak kaydet|Üzerine yaz|her zaman yeni dosya/.test(d.metin) && !d.aciklamalar.length && d.ad === 'kaydet' && !d.adGizli
      && d.dugmeler.length === 2 && d.dugmeler[1] === 'Değiştir' && /^Kaydet\s*$/m.test(d.metin), d);
    // Birden çok dosya: "Dosyalar girdilerin adıyla kaydedilir…" açıklaması yok
    await evalJs(`(${A}.dosyaEkle([${J(pdf2)}]), true)`);
    await kosul(`${A}.ogeler.length === 2 && !${A}.ogeler.some((o) => o.yukleniyor)`, 15000);
    await bekle(300);
    d = await durum();
    await ss('03-kaydet-coklu');
    sonuc('3) Birden çok dosya: "Dosyalar girdilerin adıyla kaydedilir. Var olan dosyaların üzerine yazılmaz…" açıklaması yok; klasör + Değiştir var', !d.secim
      && !/girdilerin adıyla|üzerine yazılmaz|"\(2\)" eklenir/.test(d.metin) && !d.aciklamalar.length && d.adGizli && d.dugmeler.includes('Değiştir'), d);
    // JPG hedefi (birden çok dosya): yalnız "her sayfası ayrı bir JPG dosyası olur" cümlesi
    await evalJs(`(${A}.hedefSec(${A}.ogeler[0], 'gorsel'), true)`);
    await bekle(300);
    d = await durum();
    sonuc('3) Birden çok dosyada JPG hedefi: yalnız "Çok sayfalı belgenin her sayfası ayrı bir JPG dosyası olur." cümlesi', J(d.aciklamalar) === J(['Çok sayfalı belgenin her sayfası ayrı bir JPG dosyası olur.']), d.aciklamalar);
    // Tek dosyaya dönülür; var olan adla "zaten var" sorusu (Üzerine yaz | Yeni belge olarak kaydet | Vazgeç) yine sorulur
    await evalJs(`(${A}.sil(${A}.ogeler[1]), ${A}.hedefSec(${A}.ogeler[0], 'udf'), true)`);
    await kosul(`${A}.kayit.cikti.ad() === 'kaydet.udf'`, 5000);
    fs.writeFileSync(path.join(klasor, 'Var olan.udf'), 'eski');
    await evalJs(`(${A}.kayit.cikti.ayarla(${J(klasor)}, 'Var olan', { elle: true }), true)`);
    const soru = await evalJs(`(async () => { const p = ${A}; const o = { secim: 2 }; window.__pdefeOtoYanit = o; let s; try { s = await p.kayit.denetle(); } finally { delete window.__pdefeOtoYanit; }
      return { sonuc: s, mesaj: o.son?.mesaj, dugmeler: o.son?.dugmeler }; })()`);
    sonuc('3) "Zaten var" sorusu duruyor: "… zaten var." (Üzerine yaz | Yeni belge olarak kaydet | Vazgeç); Vazgeç işlemi durdurur', soru.mesaj === '"Var olan.udf" zaten var.'
      && J(soru.dugmeler) === J(['Üzerine yaz', 'Yeni belge olarak kaydet', 'Vazgeç']) && soru.sonuc === 'vazgec', soru);
    await araclariKapat();
    // Öbür araçlarda seçim duruyor (Sıkıştır)
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(pdf)}); return true; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
    await evalJs(`(window.__pdefe.komutCalistir('arac.kucult'), true)`);
    await kosul(`!!document.querySelector('.kucult-pencere .arac-kayit-secim')`, 5000);
    const kucult = await evalJs(`[...document.querySelectorAll('.kucult-pencere .arac-kayit-secim > button')].map((b) => b.textContent)`);
    sonuc('3) Sıkıştır\'da "Yeni belge olarak kaydet | Üzerine yaz" seçimi yerinde', J(kucult) === J(['Yeni belge olarak kaydet', 'Üzerine yaz']), kucult);
    await araclariKapat(); await sekmeleriKapat();
    await ciktiKlasoruAyarla(path.join(UI, 'cikti'));
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
  }

  // ------------------------------------------------------------ 4) Sonuç kutusu ortalı; küçük Aç'lar yok; Tümünü aç / Aç (madde 3, 4, 6)
  if (bolum(4)) {
    console.log('\n== 4) Sonuç kutusu: başlık, satırlar ve düğmeler ortalı; küçük "Aç"lar yok; "Tümünü aç" / "Aç" varsayılan programla açar');
    await araclariKapat(); await sekmeleriKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
    const klasor = yeniKlasor('sonuc');
    await ciktiKlasoruAyarla(klasor);
    const pdf = ornekPdf('sonuc-a.pdf', 2, 'Sonuç örneği'), pdf2 = ornekPdf('sonuc-b.pdf', 1, 'İkinci sonuç'), pdf12 = ornekPdf('sonuc-12.pdf', 12, 'On iki sayfa');
    await evalJs(`(async () => { window.__s41d = await import('pdefe://app/src/renderer/araclar/donustur.js'); return true; })()`);
    const A = 'window.__s41d.acikDonusturPenceresi()';
    const kayitOku = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
    /** Sonuç kutusunun ölçüleri: başlık metninin, her satırın (ad + simge) ve düğme grubunun yatay ortası, kutunun ortası; küçük Aç'lar */
    const kutu = (secici) => evalJs(`(() => { const s = document.querySelector(${J(secici)}); if (!s || s.hidden) return null; const k = window.__s41kutu;
      const metinOrta = (e) => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return b.left + b.width / 2; };
      const ul = s.querySelector('ul');
      const dugmeler = [...s.querySelectorAll('.arac-sonuc-dugmeler button')];
      return { kutu: k(s), ortaX: k(s).ortaX, baslik: metinOrta(s.querySelector('.arac-sonuc-baslik')), baslikMetin: s.querySelector('.arac-sonuc-baslik').innerText,
        satirlar: [...s.querySelectorAll('li')].map((li) => { const a = li.querySelector('.ad-satiri') || li.querySelector('.ad'); const r = a.getBoundingClientRect();
          return { ad: li.querySelector('.ad').textContent, orta: r.left + r.width / 2, kisaldi: li.querySelector('.ad').scrollWidth > li.querySelector('.ad').clientWidth + 1, gorunur: r.bottom <= ul.getBoundingClientRect().bottom + 0.5 }; }),
        dugmeOrta: dugmeler.length ? (dugmeler[0].getBoundingClientRect().left + dugmeler.at(-1).getBoundingClientRect().right) / 2 : null, dugmeler: dugmeler.map((b) => b.textContent.trim()),
        kucukAc: s.querySelectorAll('[data-ac], .ac-sutun, .donustur-baglanti').length, kaydirma: ul.scrollHeight > ul.clientHeight + 1, sinif: s.className }; })()`);
    const ortali = (o, pay = 1.5) => !!o && yakin(o.baslik, o.ortaX, pay) && o.satirlar.every((x) => yakin(x.orta, o.ortaX, pay)) && (o.dugmeOrta == null || yakin(o.dugmeOrta, o.ortaX, pay));
    const ozetle = (o) => o && { ortaX: o.ortaX, baslik: o.baslik, satirlar: o.satirlar.map((x) => [x.ad.slice(0, 24), Math.round(x.orta * 10) / 10]), dugmeOrta: o.dugmeOrta, dugmeler: o.dugmeler, kucukAc: o.kucukAc };
    await evalJs(`(window.__pdefe.komutCalistir('arac.donustur', [${J(pdf)}]), true)`);
    await kosul(`!!${A} && ${A}.ogeler.length === 1 && !${A}.ogeler[0].yukleniyor`, 15000);
    // a) Benzetilen sonuçlar (çekirdek çağrılmaz): tek Word çıktısı; PDF + UDF + uzun ad + uyarılı + hatalı karışık liste
    await evalJs(`(async () => { const p = ${A}; await p._sonucGoster([{ yol: ${J(pdf)}, hedef: ${J(path.join(klasor, 'Dilekçe örneği.docx'))}, hedefBicim: 'word' }], { tek: true }); return true; })()`);
    let o = await kutu('.donustur-sonuc');
    await ss('04-tek-word');
    sonuc('4a) Tek dosya (Word): başlık, ad ve düğmeler ortalı; düğmeler "Klasörde göster", "Aç"; küçük Aç yok', ortali(o) && J(o.dugmeler) === J(['Klasörde göster', 'Aç']) && o.kucukAc === 0, ozetle(o));
    const uzun = 'Çok uzun bir dosya adı ' + 'uzun '.repeat(30) + 'son.pdf';
    const karisik = [
      { yol: pdf, hedef: path.join(klasor, 'a.pdf'), hedefBicim: 'pdf' },
      { yol: pdf, hedef: path.join(klasor, 'Orta uzunlukta bir ad.udf'), hedefBicim: 'udf' },
      { yol: pdf, hedef: path.join(klasor, uzun), hedefBicim: 'pdf' },
      { yol: pdf, hedef: path.join(klasor, 'Dilekçe.docx'), hedefBicim: 'word' },
      { yol: path.join(klasor, 'Bozuk.tif'), hedef: path.join(klasor, 'Bozuk.pdf'), hedefBicim: 'pdf', hata: 'Dosya açılamadı.', kod: 'hata' },
    ];
    await evalJs(`(async () => { await ${A}._sonucGoster(${J(karisik)}, { tek: false }); return true; })()`);
    o = await kutu('.donustur-sonuc');
    await ss('04-karisik');
    sonuc('4a) Karışık liste (PDF, UDF, Word, uzun ad, hatalı): başlık, her satır ve düğmeler kutunun ortasında (±1,5 px)', ortali(o) && /arac-sonuc-liste/.test(o.sinif), ozetle(o));
    sonuc('4a) Satırlarda küçük "Aç" yok; düğmeler "Klasörde göster" ve "Tümünü aç"; uzun ad "…" ile kısalır', o?.kucukAc === 0 && J(o.dugmeler) === J(['Klasörde göster', 'Tümünü aç']) && o.satirlar[2].kisaldi, ozetle(o));
    // b) Gerçek dönüştürme: iki PDF → UDF (ana süreç çıktıları kaydeder); Tümünü aç ikisini de varsayılan programla açar (test örneğinde kaydedilir)
    await evalJs(`(${A}.dosyaEkle([${J(pdf2)}]), true)`);
    await kosul(`${A}.ogeler.length === 2 && !${A}.ogeler.some((x) => x.yukleniyor)`, 15000);
    for (const i of [0, 1]) await evalJs(`(${A}.hedefSec(${A}.ogeler[${i}], 'udf'), true)`);
    await evalJs(`(document.querySelector('.donustur-sonuc').hidden = true, document.querySelector('.donustur-pencere .arac-dugmeler .birincil').click(), true)`);
    await kosul(`!document.querySelector('.donustur-sonuc').hidden || !!document.querySelector('.donustur-pencere .arac-hata:not(:empty)')`, 60000);
    await bekle(300);
    const udfler = ['sonuc-a.udf', 'sonuc-b.udf'].map((a) => path.join(klasor, a));
    o = await kutu('.donustur-sonuc');
    sonuc('4b) İki PDF → UDF: iki dosya yazıldı; sonuç ortalı, "Klasörde göster" ve "Tümünü aç"', udfler.every((y) => fs.existsSync(y)) && ortali(o) && J(o?.dugmeler) === J(['Klasörde göster', 'Tümünü aç']), ozetle(o));
    await kayitOku();
    await evalJs(`(document.querySelector('.donustur-sonuc .arac-sonuc-ac').click(), true)`);
    await bekle(600);
    let k = (await kayitOku()).filter((x) => x.kanal === 'dosya:varsayilanlaAc').map((x) => path.resolve(x.secenek.yol));
    sonuc('4b) Tümünü aç: iki UDF de varsayılan programla açılır (dosya:varsayilanlaAc; test örneğinde program açılmaz)', J(k) === J(udfler.map((y) => path.resolve(y))), k);
    // Program açamazsa: anlaşılır ileti (dosyanın adı, neden, UDF'de UYAP Doküman Editörü ipucu)
    await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:varsayilanlaAc', ['Bu dosya için ilişkilendirilmiş uygulama yok.', ''])`);
    await evalJs(`(window.__s41oto = window.__pdefeOtoYanit = { secim: 0 }, true)`);
    await evalJs(`(document.querySelector('.donustur-sonuc .arac-sonuc-ac').click(), true)`);
    await bekle(700);
    let soru = await evalJs(`(() => { const o = window.__s41oto; delete window.__pdefeOtoYanit; return o?.son ? { mesaj: o.son.mesaj, ayrinti: o.son.ayrinti, dugmeler: o.son.dugmeler } : null; })()`);
    sonuc('4b) Program açamazsa: "\\"sonuc-a.udf\\" açılamadı." ve nedeni; UDF ipucu (UYAP Doküman Editörü)', soru?.mesaj === '"sonuc-a.udf" açılamadı.'
      && /bu dosya türünü açan bir program bulunamadı/.test(soru.ayrinti) && /UYAP Doküman Editörü/.test(soru.ayrinti) && J(soru.dugmeler) === J(['Tamam']), soru);
    // Dosya silinmişse: "dosya bulunamadı"
    fs.rmSync(udfler[1], { force: true });
    await evalJs(`(window.__s41oto = window.__pdefeOtoYanit = { secim: 0 }, true)`);
    await evalJs(`(document.querySelector('.donustur-sonuc .arac-sonuc-ac').click(), true)`);
    await bekle(700);
    soru = await evalJs(`(() => { const o = window.__s41oto; delete window.__pdefeOtoYanit; return o?.son ? { mesaj: o.son.mesaj, ayrinti: o.son.ayrinti } : null; })()`);
    sonuc('4b) Silinmiş dosya: "\\"sonuc-b.udf\\" açılamadı." — dosya bulunamadı', soru?.mesaj === '"sonuc-b.udf" açılamadı.' && /dosya bulunamadı/.test(soru.ayrinti), soru);
    // Ana süreç yalnızca araçların bu oturumda yazdığı çıktıları açar
    const yabanci = path.join(klasor, 'Elle konmuş.udf');
    fs.writeFileSync(yabanci, 'yer tutucu');
    const izin = await evalJs(`window.pdefe.cagir('dosya:varsayilanlaAc', [${J(yabanci)}, ${J(pdf)}, ${J(path.join(klasor, 'Program.exe'))}, ${J(udfler[0])}])`);
    await kayitOku();
    sonuc('4b) dosya:varsayilanlaAc: araçların yazmadığı dosyalar (elle konmuş UDF, girdi PDF, .exe) açılmaz ("izinsiz"), yazdığı açılır', izin?.acilan === 1
      && J(izin.hatalar.map((h) => h.neden)) === J(['izinsiz', 'izinsiz', 'izinsiz']), izin);
    let red = null; try { red = await evalJs(`window.pdefe.cagir('dosya:varsayilanlaAc', ['göreli.udf']).then(() => 'kabul', () => 'red')`); } catch { red = 'red'; }
    sonuc('4b) dosya:varsayilanlaAc: göreli yol reddedilir', red === 'red', red);
    // c) Tek dosya (PDF → UDF): düğme "Aç"
    fs.rmSync(udfler[0], { force: true });   // önce silinir: satır çıkınca önerilen ad yeniden aranır ("(2)" olmasın)
    await evalJs(`(${A}.sil(${A}.ogeler[1]), true)`);
    await bekle(300);
    await evalJs(`(document.querySelector('.donustur-pencere .arac-dugmeler .birincil').click(), true)`);
    await kosul(`!document.querySelector('.donustur-sonuc').hidden || !!document.querySelector('.donustur-pencere .arac-hata:not(:empty)')`, 60000);
    await bekle(300);
    o = await kutu('.donustur-sonuc');
    await kayitOku();
    await evalJs(`(document.querySelector('.donustur-sonuc .arac-sonuc-ac')?.click(), true)`);
    await bekle(500);
    k = (await kayitOku()).filter((x) => x.kanal === 'dosya:varsayilanlaAc').map((x) => path.basename(x.secenek.yol));
    sonuc('4c) Tek dosya (PDF → UDF): sonuç ortalı, düğmeler "Klasörde göster" ve "Aç"; Aç dosyayı açar', ortali(o) && J(o?.dugmeler) === J(['Klasörde göster', 'Aç']) && J(k) === J(['sonuc-a.udf']), { o: ozetle(o), k });
    await araclariKapat();
    // d) JPG çıktısı (12 sayfa → 12 dosya): liste kaydırılır, satırlar ve düğmeler yine ortalı; Tümünü aç önce sorar
    await evalJs(`(window.__pdefe.komutCalistir('arac.donustur', [${J(pdf12)}]), true)`);
    await kosul(`!!${A} && ${A}.ogeler.length === 1 && !${A}.ogeler[0].yukleniyor`, 15000);
    await evalJs(`(${A}.hedefSec(${A}.ogeler[0], 'gorsel'), true)`);
    await bekle(300);
    await evalJs(`(document.querySelector('.donustur-pencere .donustur-secenekler .arac-segmentli[aria-label="Çözünürlük"] > button[data-id="200"]').click(), true)`);
    await evalJs(`(document.querySelector('.donustur-pencere .arac-dugmeler .birincil').click(), true)`);
    await kosul(`!document.querySelector('.donustur-sonuc').hidden || !!document.querySelector('.donustur-pencere .arac-hata:not(:empty)')`, 90000);
    await bekle(300);
    o = await kutu('.donustur-sonuc');
    await ss('04-jpg-12');
    sonuc('4d) JPG (12 sayfa dosyası): liste kaydırılıyor; başlık, görünen satırlar ve "Klasörde göster" + "Tümünü aç" ortalı (±1,5 px)', !!o && o.kaydirma && o.satirlar.length === 12
      && ortali({ ...o, satirlar: o.satirlar.filter((x) => x.gorunur) }) && J(o.dugmeler) === J(['Klasörde göster', 'Tümünü aç']), ozetle(o));
    const dugmeGorunur = await evalJs(`(() => { const d = document.querySelector('.donustur-sonuc .arac-sonuc-ac').getBoundingClientRect(), g = document.querySelector('.donustur-pencere .arac-govde').getBoundingClientRect(); return d.bottom <= g.bottom + 0.5 && d.height > 0; })()`);
    sonuc('4d) Düğmeler listenin altında görünür (liste kaydırılsa da)', dugmeGorunur === true);
    await kayitOku();
    await evalJs(`(window.__s41oto = window.__pdefeOtoYanit = { secim: 1 }, true)`);
    await evalJs(`(document.querySelector('.donustur-sonuc .arac-sonuc-ac').click(), true)`);
    await bekle(500);
    soru = await evalJs(`(() => { const o = window.__s41oto; return o?.son ? { mesaj: o.son.mesaj, dugmeler: o.son.dugmeler } : null; })()`);
    k = (await kayitOku()).filter((x) => x.kanal === 'dosya:varsayilanlaAc');
    sonuc('4d) Tümünü aç (12 dosya): önce "12 dosya açılsın mı?" (Aç | Vazgeç); Vazgeç: hiçbiri açılmaz', soru?.mesaj === '12 dosya açılsın mı?' && J(soru.dugmeler) === J(['Aç', 'Vazgeç']) && !k.length, { soru, k: k.length });
    await evalJs(`(window.__s41oto = window.__pdefeOtoYanit = { secim: 0 }, true)`);
    await evalJs(`(document.querySelector('.donustur-sonuc .arac-sonuc-ac').click(), true)`);
    await bekle(800);
    await evalJs(`(delete window.__pdefeOtoYanit, true)`);
    k = (await kayitOku()).filter((x) => x.kanal === 'dosya:varsayilanlaAc').map((x) => path.basename(x.secenek.yol));
    sonuc('4d) Aç: 12 sayfa dosyasının hepsi açılır', k.length === 12 && k[0] === 'sonuc-12 - Sayfa 1.jpg' && k[11] === 'sonuc-12 - Sayfa 12.jpg', k);
    await araclariKapat();
    // e) Ayır: aynı düzen (iki dosya ve tek dosya); Tümünü aç Ayır'ın dosyalarını açar
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(pdf12)}); return true; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
    await evalJs(`(window.__pdefe.komutCalistir('arac.ayir'), true)`);
    await kosul(`!!document.querySelector('.ayir-pencere .ayir-aralik')`);
    await evalJs(`(() => { const a = document.querySelector('.ayir-pencere .ayir-aralik'); a.value = '1-3, 4-12'; a.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await bekle(400);
    await evalJs(`(document.querySelector('.ayir-pencere .arac-dugmeler .birincil').click(), true)`);
    await kosul(`!document.querySelector('.ayir-sonuc').hidden && document.querySelectorAll('.ayir-sonuc li').length === 2`, 20000);
    o = await kutu('.ayir-sonuc');
    await ss('04-ayir');
    sonuc('4e) Ayır (iki dosya): başlık, satırlar ve düğmeler ortalı; "Klasörde göster" ve "Tümünü aç"; küçük Aç ve "Hepsini aç" yok', ortali(o) && J(o.dugmeler) === J(['Klasörde göster', 'Tümünü aç'])
      && o.kucukAc === 0 && !(await evalJs(`!!document.querySelector('.ayir-hepsi-ac, .ayir-ilk-ac')`)), ozetle(o));
    await kayitOku();
    await evalJs(`(document.querySelector('.ayir-sonuc .arac-sonuc-ac').click(), true)`);
    await bekle(500);
    k = (await kayitOku()).filter((x) => x.kanal === 'dosya:varsayilanlaAc').map((x) => path.basename(x.secenek.yol));
    sonuc('4e) Ayır\'da Tümünü aç iki PDF\'i varsayılan programla açar; araç penceresi açık kalır', k.length === 2 && k.every((a) => /^Ayrılmış - Sayfa .*\.pdf$/.test(a))
      && (await evalJs(`!!document.querySelector('.ayir-pencere')`)), k);
    await araclariKapat(); await sekmeleriKapat();
    await ciktiKlasoruAyarla(path.join(UI, 'cikti'));
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
  }

  const hatalar = await evalJs('window.__hatalar || []');
  sonuc('Renderer konsolunda hata yok', !hatalar.length, hatalar);
  try { cdp.ws.close(); } catch { /* yok say */ }
  console.log(`\n${denetim} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}  (ekran görüntüleri: ${PNG})`);
  if (hataSayisi) process.exitCode = 1;
}
