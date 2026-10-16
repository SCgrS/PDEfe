// Senaryo 44 (0.2.9, kullanıcı istekleri; Birleştir ve Format Değiştir):
//   1) Birleştir'in açıklaması (madde 2): "Dosyalardan tek PDF oluşturur, farklı dosya formatlarıyla çalışabilir" (açılış ekranı, Araçlar
//      penceresi); açılış ekranında (1280, 1000, 800, 704 px) ve Araçlar penceresinde (geniş, dar) karolar eşit yükseklikte (0.2.8 kuralı).
//   2) Birleştir'de sayfa seçeneği yok (madde 1): görüntü satırında "Sayfa" seçimi (A4'e sığdır / Orijinal) ve "Kenar … mm" kutusu yok, kalite
//      seçimi duruyor; birleştirilmiş PDF'te her görüntü sayfası A4'e sığan ölçüde (dikey 3:4 JPEG 210 × 280 mm, yatay PNG 280 × 210 mm, sağa
//      döndürülmüş dikey JPEG yatay, Letter TIFF 210 × 271,8 mm), beyaz kenar yok, PDF kendi ölçüsünde; satırların tahmini sayı.
//   3) Format Değiştir'in bildirimi (madde 3): görüntü → PDF (tek PDF, sekmede açılır): alttaki beyaz bildirim "Format değiştirildi: <ad>"
//      ("Dönüştürüldü" yok); sayfa A4'e sığan ölçüde.
//   4) Dönüştür düğmesi işlem sürerken soluk (madde 4): Dönüştür'e basıldığı andan iş bitene dek düğme hiç etkin görünmez (her 15 ms'de ve
//      her öznitelik değişiminde kayıt); bitince (sonuç pencerede) 0.2.7'nin kuralıyla soluk kalır, hedef değişince etkin.
// Girdiler bu betikte üretilir (Python, proje .venv; gerçek belge yok): test/cikti/s44/girdi; araçların çıktı klasörü test klasörü.
// Kullanım (ekran dışı):
//   powershell -File test\baslat.ps1 -Port 9444 -Veri "$env:TEMP\pdefe-s44-9444" -Boyut "1280,1000"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9444; node test\surucu.mjs betik test\senaryo44.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,3". Ekran görüntüleri test/cikti/s44/png altına.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's44');
const GIRDI = path.join(UI, 'girdi');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));
const ACIKLAMA = 'Dosyalardan tek PDF oluşturur, farklı dosya formatlarıyla çalışabilir';
const A4 = [595.276, 841.89];
/** 0.2.9'un kuralı (testin kendi hesabı): görünen en / boy oranıyla A4'e sığan sayfa (pt). */
const a4e = (g, y) => { const [kg, ky] = g > y ? [A4[1], A4[0]] : A4; const k = Math.min(kg / g, ky / y); return [g * k, y * k]; };

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const bilgi = (s) => console.log(`     · ${s}`);
const KOSUM = Date.now().toString(36);
const yeniKlasor = (ad) => { const k = path.join(UI, `${ad}-${KOSUM}`); fs.mkdirSync(k, { recursive: true }); return k; };
const yakin = (a, b, pay = 0.5) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= pay;

/** Python (proje .venv) çalıştırır; son satırı JSON olarak döner. */
function py(kod) {
  const on = 'import sys, json, os\nimport pymupdf\nfrom PIL import Image, ImageDraw, TiffImagePlugin\n';
  const cikti = execFileSync(PY, ['-X', 'utf8', '-c', on + kod], { encoding: 'utf8' });
  return JSON.parse(cikti.trim().split(/\r?\n/).pop());
}
/** PDF'in sayfa ölçüleri ve her sayfadaki görselin kutusu sayfanın kendisi mi. */
const pdfOzeti = (yol) => py(`d = pymupdf.open(${J(yol)}, filetype="pdf")
s = []
for p in d:
    b = p.get_image_info()
    s.append({"olcu": [p.rect.width, p.rect.height], "kaplar": bool(b) and max(abs(a - c) for a, c in zip(pymupdf.Rect(b[0]["bbox"]), p.rect)) < 1e-3})
print(json.dumps(s))`);
/** Örnek PDF (sayfa sayısı, başlık); var olanı yeniden üretmez. */
function ornekPdf(ad, sayfa = 2, baslik = 'Deneme belgesi') {
  const yol = path.join(GIRDI, ad);
  if (!fs.existsSync(yol)) execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yol, String(sayfa), baslik], { encoding: 'utf8' });
  return yol;
}

/** Sürekli CDP oturumu (pencere genişliği taklidi). */
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
  const ss = async (ad) => { await bekle(250); try { await ekranGoruntusu(path.join(PNG, ad + '.png')); } catch (e) { bilgi(`ekran görüntüsü alınamadı: ${e.message}`); } };
  fs.mkdirSync(GIRDI, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const ciktiKlasoruAyarla = (k) => evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'ciktiKlasoru', ${J(k)}); window.__pdefe.ayar().ciktiKlasoru = ${J(k)}; return true; })()`);
  const araclariKapat = () => evalJs(`(async () => { const eski = window.__pdefeOtoYanit; window.__pdefeOtoYanit = { secim: 0 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); } finally { window.__pdefeOtoYanit = eski; } return true; })()`);
  // #bildirim'in her yeni metni kaydedilir (senaryo41'deki gibi)
  await evalJs(`(() => { window.__s44b = []; if (!window.__s44BG) { window.__s44BG = new MutationObserver(() => { const e = document.querySelector('#bildirim'); const t = e && !e.hidden ? e.textContent : '';
    if (t && window.__s44b.at(-1) !== t) window.__s44b.push(t); }); window.__s44BG.observe(document.querySelector('#bildirim'), { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); } return true; })()`);
  const bildirimler = () => evalJs('window.__s44b.slice()');
  const bildirimTemizle = () => evalJs('(window.__s44b.length = 0, true)');
  const cdp = await cdpOturumu();
  const genislik = async (w, h = 900) => {
    if (w) await cdp.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false });
    else await cdp.gonder('Emulation.clearDeviceMetricsOverride');
    await bekle(200);
  };
  // Girdiler (yapay): dikey 3:4 JPEG (72 dpi), yatay 4:3 PNG, kare PNG, Letter 150 dpi TIFF, iki sayfalı PDF, otuz sayfalık PDF
  const g = py(`k = ${J(GIRDI)}
def cerceve(boyut, kalinlik=8):
    im = Image.new("RGB", boyut, (200, 30, 30))
    ImageDraw.Draw(im).rectangle((kalinlik, kalinlik, boyut[0] - 1 - kalinlik, boyut[1] - 1 - kalinlik), fill=(40, 90, 200))
    return im
y = {"dikey": os.path.join(k, "dikey 3x4.jpg"), "yatay": os.path.join(k, "yatay 4x3.png"), "kare": os.path.join(k, "kare.png"), "letter": os.path.join(k, "letter 150.tif")}
cerceve((1500, 2000)).save(y["dikey"], quality=90, dpi=(72, 72))
cerceve((1200, 900)).save(y["yatay"])
cerceve((400, 400)).save(y["kare"])
cerceve((1275, 1650)).save(y["letter"], compression="tiff_lzw", dpi=(150, 150))
print(json.dumps(y))`);
  const pdf2 = ornekPdf('iki sayfa.pdf', 2, 'Birleştir örneği');

  // ------------------------------------------------------------ 1) Birleştir'in açıklaması; karolar eşit yükseklikte (madde 2)
  if (bolum(1)) {
    console.log('\n== 1) Birleştir\'in açıklaması; açılış ekranında ve Araçlar penceresinde karolar eşit yükseklikte');
    await araclariKapat(); await sekmeleriKapat();
    await kosul(`!document.querySelector('#baslangic').hidden`);
    const acilis = () => evalJs(`[...document.querySelectorAll('.karsilama-arac')].map((k) => ({ komut: k.dataset.eylem, aciklama: k.querySelector('.karsilama-aciklama').textContent,
      h: Math.round(k.getBoundingClientRect().height * 10) / 10, ust: Math.round(k.getBoundingClientRect().top) }))`);
    let a = await acilis();
    sonuc('1) Açılış ekranı: Birleştir\'in açıklaması kullanıcının yazdığı gibi', a.find((x) => x.komut === 'arac.gorselBirlestir')?.aciklama === ACIKLAMA, a.map((x) => [x.komut, x.aciklama]));
    for (const w of [1280, 1000, 800, 704]) {
      await genislik(w);
      a = await acilis();
      const h = a.map((x) => x.h);
      sonuc(`1) Açılış ekranı ${w} px: altı karo aynı yükseklikte`, a.length === 6 && h.every((x) => yakin(x, h[0], 0.6)), a.map((x) => [x.komut, x.h, x.ust]));
      if (w === 1280) await ss('01-acilis-1280');
    }
    for (const w of [1280, 690]) {
      await genislik(w);
      await evalJs(`(document.querySelector('#dugme-araclar').click(), true)`);
      await kosul(`!document.querySelector('#araclar-penceresi').hidden`, 3000);
      await bekle(250);
      const k = await evalJs(`[...document.querySelectorAll('.araclar-karo')].map((k) => ({ komut: k.dataset.aracKomut, aciklama: k.querySelector('.araclar-aciklama').textContent,
        h: Math.round(k.getBoundingClientRect().height * 10) / 10, w: Math.round(k.getBoundingClientRect().width) }))`);
      sonuc(`1) Araçlar penceresi ${w} px: Birleştir'in açıklaması yeni metin, karolar aynı yükseklikte`, k.find((x) => x.komut === 'arac.gorselBirlestir')?.aciklama === ACIKLAMA
        && k.length === 6 && k.every((x) => yakin(x.h, k[0].h, 0.6)), k);
      if (w === 1280) await ss('01-araclar-penceresi');
      await evalJs(`(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`);
      await evalJs(`(document.querySelector('#araclar-penceresi').hidden || document.querySelector('#dugme-araclar').click(), true)`);
      await kosul(`document.querySelector('#araclar-penceresi').hidden`, 3000);
    }
    await genislik(0);
  }

  // ------------------------------------------------------------ 2) Birleştir: sayfa seçeneği yok, sayfalar A4'e sığar (madde 1)
  if (bolum(2)) {
    console.log('\n== 2) Birleştir: satırda Sayfa / Kenar yok; görüntü sayfaları A4\'e sığan ölçüde');
    await araclariKapat(); await sekmeleriKapat();
    const klasor = yeniKlasor('birlestir');
    await ciktiKlasoruAyarla(klasor);
    const yollar = [g.dikey, g.yatay, g.dikey, g.letter, pdf2];
    await evalJs(`(window.__pdefe.komutCalistir('arac.gorselBirlestir', ${J(yollar)}), true)`);
    await kosul(`document.querySelectorAll('.birlestir-oge').length === 5 && !document.querySelector('.birlestir-oge.yukleniyor')`, 20000);
    const satirlar = await evalJs(`[...document.querySelectorAll('.birlestir-oge')].map((o) => ({ tur: o.dataset.tur, sayfa: !!o.querySelector('.oge-sayfa-boyutu, select[class*="sayfa"]'),
      kenar: !!o.querySelector('.oge-kenar, .oge-kenar-alani, input[type=number]'), kalite: !!o.querySelector('.oge-kalite'), metin: o.querySelector('.ayarlar').textContent.replace(/\\s+/g, ' ').trim() }))`);
    sonuc('2) Görüntü satırlarında "Sayfa" seçimi ve "Kenar" kutusu yok; kalite seçimi var', satirlar.length === 5 && satirlar.every((s) => !s.sayfa && !s.kenar && s.kalite)
      && satirlar.every((s) => !/Sayfa|Kenar|A4'e sığdır/.test(s.metin)), satirlar);
    // Üçüncü satır (dikey JPEG) sağa döndürülür: sayfası yatay olmalı
    await evalJs(`(document.querySelectorAll('.birlestir-oge')[2].querySelector('[data-komut="saga"]').click(), true)`);
    await kosul(`[...document.querySelectorAll('.birlestir-oge .tahmin')].every((t) => /tahmin: \\d/.test(t.textContent)) && !document.querySelector('.birlestir-kalite-secim .boyut.bekliyor')`, 30000);
    const tahminler = await evalJs(`[...document.querySelectorAll('.birlestir-oge .tahmin')].map((t) => t.textContent)`);
    sonuc('2) Satırların boyut tahmini sayı', tahminler.length === 5 && tahminler.every((t) => /^tahmin: [\d.,]+ (KB|MB|bayt)/.test(t)), tahminler);
    await ss('02-birlestir-satirlar');
    await bildirimTemizle();
    await evalJs(`(document.querySelector('.birlestir-pencere .arac-dugmeler [data-id="birlestir"]').click(), true)`);
    await kosul(`!document.querySelector('.birlestir-pencere')`, 30000);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`, 10000);
    const hedef = await evalJs(`window.__pdefe.aktif()?.yol || ''`);
    const oz = hedef && fs.existsSync(hedef) ? pdfOzeti(hedef) : [];
    const beklenen = [a4e(1500, 2000), a4e(1200, 900), a4e(2000, 1500), a4e(1275, 1650)];
    sonuc('2) Birleştirilmiş PDF: görüntü sayfaları A4\'e sığan ölçüde (210 × 280, 280 × 210, döndürülmüş 280 × 210, Letter 210 × 271,8 mm), görüntü sayfayı kaplar',
      oz.length === 6 && beklenen.every((b, i) => yakin(oz[i].olcu[0], b[0], 0.05) && yakin(oz[i].olcu[1], b[1], 0.05) && oz[i].kaplar), oz.map((s) => [s.olcu.map((v) => Math.round(v * 25.4 / 72 * 10) / 10), s.kaplar]));
    sonuc('2) PDF girdisinin sayfaları kendi ölçüsünde (595 × 842)', oz.length === 6 && [4, 5].every((i) => yakin(oz[i].olcu[0], 595, 0.5) && yakin(oz[i].olcu[1], 842, 0.5)), oz.slice(4));
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 3) Format Değiştir'in bildirimi (madde 3)
  if (bolum(3)) {
    console.log('\n== 3) Format Değiştir: görüntü → PDF sekmede açılınca bildirim "Format değiştirildi: <ad>"');
    await araclariKapat(); await sekmeleriKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
    const klasor = yeniKlasor('bildirim');
    await ciktiKlasoruAyarla(klasor);
    await evalJs(`(async () => { window.__s44d = await import('pdefe://app/src/renderer/araclar/donustur.js'); return true; })()`);
    const A = 'window.__s44d.acikDonusturPenceresi()';
    await evalJs(`(window.__pdefe.komutCalistir('arac.donustur', [${J(g.dikey)}]), true)`);
    await kosul(`!!${A} && ${A}.ogeler.length === 1 && !${A}.ogeler[0].yukleniyor`, 15000);
    await evalJs(`(${A}.hedefSec(${A}.ogeler[0], 'pdf'), true)`);
    await bekle(300); await bildirimTemizle();
    await evalJs(`(document.querySelector('.donustur-pencere .arac-dugmeler .birincil').click(), true)`);
    await kosul(`!document.querySelector('.donustur-pencere')`, 30000);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`, 10000);
    await bekle(500);
    const b = await bildirimler();
    const akt = await evalJs(`window.__pdefe.aktif()?.yol || ''`);
    sonuc('3) Görüntü → PDF: sonuç sekmede açıldı, bildirim "Format değiştirildi: dikey 3x4.pdf" ("Dönüştürüldü" yok)', path.basename(akt) === 'dikey 3x4.pdf'
      && J(b) === J(['Format değiştirildi: dikey 3x4.pdf']), { akt, b });
    const oz = akt && fs.existsSync(akt) ? pdfOzeti(akt) : [];
    const be = a4e(1500, 2000);
    sonuc('3) Görüntü → PDF: sayfa A4\'e sığan ölçüde (210 × 280 mm), görüntü sayfayı kaplar', oz.length === 1 && yakin(oz[0].olcu[0], be[0], 0.05) && yakin(oz[0].olcu[1], be[1], 0.05) && oz[0].kaplar, oz);
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 4) Dönüştür işlem sürerken soluk (madde 4)
  if (bolum(4)) {
    console.log('\n== 4) Format Değiştir: Dönüştür düğmesi işlem boyunca soluk');
    await araclariKapat(); await sekmeleriKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
    const klasor = yeniKlasor('dugme');
    await ciktiKlasoruAyarla(klasor);
    const uzun = ornekPdf('otuz sayfa.pdf', 30, 'Uzun belge');
    await evalJs(`(async () => { window.__s44d = await import('pdefe://app/src/renderer/araclar/donustur.js'); return true; })()`);
    const A = 'window.__s44d.acikDonusturPenceresi()';
    await evalJs(`(window.__pdefe.komutCalistir('arac.donustur', [${J(uzun)}]), true)`);
    await kosul(`!!${A} && ${A}.ogeler.length === 1 && !${A}.ogeler[0].yukleniyor`, 15000);
    await evalJs(`(${A}.hedefSec(${A}.ogeler[0], 'tiff'), true)`);
    await evalJs(`(document.querySelector('.donustur-pencere .donustur-secenekler .arac-segmentli[aria-label="Renk"] > button[data-id="renkli"]')?.click(), true)`);
    await bekle(400);
    const dugme = `document.querySelector('.donustur-pencere .arac-dugmeler [data-id="donustur"]')`;
    sonuc('4) Önkoşul: Dönüştür etkin', await evalJs(`!${dugme}.disabled`));
    // Kayıt: tıklamadan bitene dek her 15 ms'de ve düğmenin her öznitelik değişiminde {süren, soluk}
    await evalJs(`(() => { const d = ${dugme}; const p = ${A}; window.__s44k = [];
      const kaydet = (neden) => window.__s44k.push({ t: Math.round(performance.now()), suren: !!p.ilerleme.calisiyor || !!p._suruyor, calisiyor: !!p.ilerleme.calisiyor, soluk: d.disabled, neden });
      window.__s44MO?.disconnect(); window.__s44MO = new MutationObserver(() => kaydet('öznitelik')); window.__s44MO.observe(d, { attributes: true });
      clearInterval(window.__s44Z); window.__s44Z = setInterval(() => kaydet('zaman'), 15);
      d.click(); kaydet('tık'); return true; })()`);
    await kosul(`!document.querySelector('.donustur-sonuc').hidden || !!document.querySelector('.donustur-pencere .arac-hata:not(:empty)')`, 120000);
    await bekle(400);
    const k = await evalJs(`(clearInterval(window.__s44Z), window.__s44MO.disconnect(), window.__s44k.slice())`);
    const surerken = k.filter((x) => x.calisiyor);
    const etkin = k.filter((x) => x.suren && !x.soluk);
    sonuc('4) Dönüştürme sürdü (kayıt alındı)', surerken.length >= 3, { kayit: k.length, surerken: surerken.length });
    sonuc('4) Dönüştür\'e basıldığı andan iş bitene dek düğme hiç etkin görünmedi', !etkin.length, etkin.slice(0, 5));
    sonuc('4) Bitince (sonuç pencerede) Dönüştür soluk kalır (0.2.7 kuralı)', await evalJs(`${dugme}.disabled && !${A}.ilerleme.calisiyor && !${A}._suruyor`));
    const tiff = path.join(klasor, 'otuz sayfa.tif');
    sonuc('4) TIFF yazıldı', fs.existsSync(tiff));
    await evalJs(`(${A}.hedefSec(${A}.ogeler[0], 'gorsel'), true)`);
    await bekle(300);
    sonuc('4) Hedef değişince Dönüştür yeniden etkin', await evalJs(`!${dugme}.disabled`));
    await ss('04-donustur-sonrasi');
    await araclariKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
  }

  await ciktiKlasoruAyarla(path.join(UI, 'cikti'));
  const hatalar = await evalJs('window.__hatalar || []');
  sonuc('Renderer konsolunda hata yok', !hatalar.length, hatalar);
  try { cdp.ws.close(); } catch { /* yok say */ }
  console.log(`\n${denetim} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}  (ekran görüntüleri: ${PNG})`);
  if (hataSayisi) process.exitCode = 1;
}
