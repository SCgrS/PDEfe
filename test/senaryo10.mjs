// Senaryo 10: okuma modu, iki sayfa + kapak ayrı, Ctrl+Tab kısa basış (seçici görünmez), Ctrl+Tab basılı (seçici görünür).
const D = 'C:/Users/Kullanici/Desktop/PDF DENEME/';

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  await evalJs(`(() => { window.__pdefeOtoYanit = { secim: 1 }; window.__pdefe.ayar().sekmeDegisimindeSor = false; return true; })()`);
  await evalJs(`(async () => { const p = window.__pdefe; await p.dosyaAc(${JSON.stringify(D + '1.5.6098.pdf')}); await p.dosyaAc(${JSON.stringify(D + 'fdsafsd.pdf')}); await new Promise(r => setTimeout(r, 800)); return true; })()`);
  // İki sayfa kaydırma + kapak ayrı
  await evalJs(`(() => { const p = window.__pdefe; p.komutCalistir('gorunum.duzen', 'ikiSurekli'); const b = p.aktif(); if (!b.gorunum.kapakAyri) p.komutCalistir('gorunum.kapakAyri'); p.komutCalistir('gorunum.zoom', 'sayfa'); })()`);
  await bekle(1500);
  console.log('iki sayfa kapak ayrı:', await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; return { duzen: g.duzen, kapakAyri: g.kapakAyri, ilkSatirSayfa: g.yerlesim.slice(0, 3).map(y => Math.round(y.x)) }; })()`));
  await ekranGoruntusu('test/png/s10-01-iki-sayfa-kapak.png');
  await evalJs(`(() => { const p = window.__pdefe; p.komutCalistir('gorunum.kapakAyri'); p.komutCalistir('gorunum.duzen', 'surekli'); p.komutCalistir('gorunum.zoom', 'genislik'); })()`);
  // Okuma modu
  await evalJs(`window.__pdefe.komutCalistir('gorunum.okumaModu')`);
  await bekle(600);
  console.log('okuma modu:', await evalJs(`({ sinif: document.body.className, aracCubugu: getComputedStyle(document.querySelector('#arac-cubugu')).display })`));
  await ekranGoruntusu('test/png/s10-02-okuma-modu.png');
  await evalJs(`window.__pdefe.komutCalistir('gorunum.okumaModu')`);
  // Ctrl+Tab kısa basış: seçici görünmemeli, en son kullanılan sekmeye geçmeli
  const once = await evalJs(`window.__pdefe.aktif().ad`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))`);
  const gorunurKisa = await evalJs(`!document.querySelector('#sekme-secici').hidden`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))`);
  await bekle(300);
  console.log('Ctrl+Tab kısa:', { once, seciciGorundu: gorunurKisa, sonra: await evalJs(`window.__pdefe.aktif().ad`) });
  // Basılı tutma: 300 ms sonra seçici görünmeli
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))`);
  await bekle(400);
  console.log('Ctrl+Tab basılı:', await evalJs(`({ gorunur: !document.querySelector('#sekme-secici').hidden, aday: document.querySelectorAll('#sekme-secici .aday').length })`));
  await ekranGoruntusu('test/png/s10-03-ctrl-tab.png');
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))`);
  console.log('bitti');
}
