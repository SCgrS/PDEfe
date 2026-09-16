// Senaryo 2: büyük belge (756 sayfa), içindekiler, küçük resimler, metne yakınlaştırma.
export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  const sec = (ad) => evalJs(`(() => { const p = window.__pdefe; const s = p.sekmeler.sekmeler.find(s => s.ad.includes(${JSON.stringify(ad)})); if (s) p.sekmeSec(s.id); return s?.ad; })()`);
  const durum = () => evalJs(`(() => { const b = window.__pdefe.aktif(); return { ad: b.ad, sayfa: b.gorunum.gecerli, olcek: +b.gorunum.olcek.toFixed(3), cizili: b.gorunum.sayfalar.filter(s=>s.canvas).length, gorunur: b.gorunum.gorunurSayfalar() }; })()`);

  console.log('seçildi:', await sec('PDF32000'));
  await bekle(300);
  let t0 = Date.now();
  await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(400)`);
  await bekle(700);
  console.log('sayfa 400:', await durum(), 'ms:', Date.now() - t0);
  await ekranGoruntusu('test/png/s2-01-buyuk-400.png');

  // Hızlı kaydırma ölçümü: 60 adım × 1200 px, kare süresi
  const olcum = await evalJs(`(async () => { const k = window.__pdefe.aktif().gorunum.kaydirici; const sureler = []; for (let i = 0; i < 60; i++) { const t = performance.now(); k.scrollTop += 1200; await new Promise(r => requestAnimationFrame(r)); await new Promise(r => setTimeout(r, 16)); sureler.push(performance.now() - t); } sureler.sort((a,b)=>a-b); return { ortanca: +sureler[30].toFixed(1), enUzun: +sureler[59].toFixed(1) }; })()`);
  console.log('kaydırma kare süresi (ms):', olcum, await durum());
  await bekle(800);
  await ekranGoruntusu('test/png/s2-02-kaydirma-sonrasi.png');

  // Sol panel açık mı? Açık değilse aç
  await evalJs(`(() => { const p = window.__pdefe; if (!p.panel.acik) p.komutCalistir('gorunum.solPanel'); p.panel.sekmeSec('icindekiler'); })()`);
  await bekle(2000);
  console.log('yer imi öğe sayısı:', await evalJs(`document.querySelectorAll('#panel-icindekiler li').length`));
  await evalJs(`[...document.querySelectorAll('#panel-icindekiler .yerimi > li > .satir')].find(s => s.textContent.includes('Annotations'))?.click()`);
  await bekle(1000);
  console.log('"Annotations" yer imi sonrası:', await durum());
  await ekranGoruntusu('test/png/s2-03-icindekiler.png');

  await evalJs(`window.__pdefe.panel.sekmeSec('sayfalar')`);
  await bekle(3000);
  console.log('küçük resim (yüklü/toplam):', await evalJs(`document.querySelectorAll('#panel-sayfalar img').length + '/' + document.querySelectorAll('#panel-sayfalar .kucuk-resim').length`));
  await ekranGoruntusu('test/png/s2-04-sayfalar.png');

  // Yorumlar paneli, notlu belge
  await sec('DENEME PDF');
  await evalJs(`window.__pdefe.panel.sekmeSec('yorumlar')`);
  await bekle(1500);
  console.log('yorumlar:', await evalJs(`[...document.querySelectorAll('#panel-yorumlar .yorum')].map(e => e.textContent.trim().slice(0, 60))`));
  await ekranGoruntusu('test/png/s2-05-yorumlar.png');

  // Metne yakınlaştırma (%800), başlık bölgesi
  await sec('dergipark');
  await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; g.sayfayaGit(1); g.zoomAyarla(8, { x: 600, y: 300 }); })()`);
  await bekle(1500);
  console.log('%800:', await durum());
  await ekranGoruntusu('test/png/s2-06-zoom800.png');
  await evalJs(`window.__pdefe.komutCalistir('gorunum.zoom', 'genislik')`);
  console.log('bitti');
}
