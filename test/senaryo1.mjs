// Senaryo 1: çoklu belge, büyük belge, düzenler, yakınlaştırma, panel. node test/surucu.mjs betik test/senaryo1.mjs
const D = 'C:/Users/Kullanici/Desktop/PDF DENEME/';
const T = 'C:/Projeler/PDEfe/test/pdf/';

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  const ac = async (yol) => evalJs(`(async () => { const t0 = performance.now(); const b = await window.__pdefe.dosyaAc(${JSON.stringify(yol)}); return { ad: b?.ad, sayfa: b?.gorunum.sayfaSayisi, ms: Math.round(performance.now() - t0) }; })()`);
  const durum = () => evalJs(`(() => { const b = window.__pdefe.aktif(); return { ad: b.ad, sayfa: b.gorunum.gecerli, olcek: +b.gorunum.olcek.toFixed(3), mod: b.gorunum.zoomModu, duzen: b.gorunum.duzen, cizili: b.gorunum.sayfalar.filter(s=>s.canvas).length, metin: b.gorunum.sayfalar.filter(s=>s.textLayer).length, gorunur: b.gorunum.gorunurSayfalar() }; })()`);

  console.log('aç DENEME PDF (2):', await ac(D + 'DENEME PDF (2).pdf'));
  console.log('aç PDF32000 (756 sayfa, 22 MB):', await ac(T + 'PDF32000_2008_yerimli.pdf'));
  console.log('aç dergipark (yer imli):', await ac(T + 'dergipark_3972595_ttk_tbk.pdf'));
  console.log('aç tekrar DENEME (aynı sekmeye geçmeli):', await ac(D + 'DENEME PDF (2).pdf'));
  console.log('sekmeler:', await evalJs('window.__pdefe.sekmeler.sekmeler.map(s=>s.ad)'));
  await bekle(500);
  await ekranGoruntusu('test/png/s1-01-deneme.png');

  // Büyük belgeye geç, sayfa 400'e git
  await evalJs(`window.__pdefe.sekmeSec(window.__pdefe.sekmeler.sekmeler[1].id)`);
  await bekle(300);
  const t0 = Date.now();
  await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(400)`);
  await bekle(600);
  console.log('sayfa 400:', await durum(), 'süre ms:', Date.now() - t0);
  await ekranGoruntusu('test/png/s1-02-buyuk-400.png');

  // Hızlı kaydırma: 40 adım
  await evalJs(`(async () => { const k = window.__pdefe.aktif().gorunum.kaydirici; for (let i = 0; i < 40; i++) { k.scrollTop += 900; await new Promise(r => setTimeout(r, 30)); } })()`);
  await bekle(800);
  console.log('kaydırma sonrası:', await durum());

  // Sol panel: içindekiler
  await evalJs(`window.__pdefe.komutCalistir('gorunum.solPanel'); window.__pdefe.panel.sekmeSec('icindekiler')`);
  await bekle(1500);
  console.log('yer imi sayısı:', await evalJs(`document.querySelectorAll('#panel-icindekiler li').length`));
  // İlk yer imine tıkla
  await evalJs(`document.querySelector('#panel-icindekiler .yerimi > li:nth-child(5) .satir')?.click()`);
  await bekle(800);
  console.log('yer imi sonrası:', await durum());
  await ekranGoruntusu('test/png/s1-03-icindekiler.png');

  // Sayfalar paneli
  await evalJs(`window.__pdefe.panel.sekmeSec('sayfalar')`);
  await bekle(2500);
  console.log('küçük resim sayısı (yüklü):', await evalJs(`document.querySelectorAll('#panel-sayfalar img').length`));
  await ekranGoruntusu('test/png/s1-04-sayfalar.png');

  // İki sayfa kaydırma düzeni + kapak ayrı
  await evalJs(`window.__pdefe.komutCalistir('gorunum.duzen', 'ikiSurekli'); window.__pdefe.komutCalistir('gorunum.zoom', 'sayfa')`);
  await bekle(1200);
  console.log('iki sayfa:', await durum());
  await ekranGoruntusu('test/png/s1-05-iki-sayfa.png');

  // Tek sayfa düzeni, döndür
  await evalJs(`window.__pdefe.komutCalistir('gorunum.duzen', 'tek'); window.__pdefe.komutCalistir('gorunum.dondur', 90)`);
  await bekle(1200);
  console.log('tek sayfa döndürülmüş:', await durum());
  await ekranGoruntusu('test/png/s1-06-tek-dondur.png');
  await evalJs(`window.__pdefe.komutCalistir('gorunum.dondur', -90); window.__pdefe.komutCalistir('gorunum.duzen', 'surekli')`);

  // Aşırı yakınlaştırma (%3200) — bölgesel çizim
  await evalJs(`window.__pdefe.aktif().gorunum.zoomAyarla(32)`);
  await bekle(1500);
  console.log('%3200:', await durum(), await evalJs(`(() => { const b = window.__pdefe.aktif(); const s = b.gorunum.sayfalar.find(s=>s.canvas); return s ? { tuval: [s.canvas.width, s.canvas.height], tam: s.cizim.tam } : null; })()`));
  await ekranGoruntusu('test/png/s1-07-zoom3200.png');
  await evalJs(`window.__pdefe.komutCalistir('gorunum.zoom', 'genislik')`);

  // Ctrl+Tab seçici
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))`);
  await bekle(1200);
  await ekranGoruntusu('test/png/s1-08-ctrl-tab.png');
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))`);
  await bekle(300);
  console.log('Ctrl+Tab sonrası aktif:', await evalJs('window.__pdefe.aktif().ad'));

  // Koyu tema
  await evalJs(`window.__pdefe.komutCalistir('gorunum.tema')`);
  await bekle(600);
  await ekranGoruntusu('test/png/s1-09-koyu.png');
  await evalJs(`window.__pdefe.komutCalistir('gorunum.tema')`);
  console.log('bitti');
}
