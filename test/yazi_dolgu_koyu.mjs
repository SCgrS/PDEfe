// Yazı aracı (0.1.4): dolgu paleti (Dolgusuz paletin içinde; ayrı Dolgusuz düğmesi yok) ve koyulaştırılmış sayfada yazının görünmesi.
// Kullanım: $env:PDEFE_CDP_PORT=<port>; $env:PDEFE_TEST_PDF=<PDF kopyası>; node test/surucu.mjs betik test/yazi_dolgu_koyu.mjs
// Test örneği koyu temayla başlatılmalı (baslat.ps1 -Tema koyu). "Diğer renk" Windows renk seçicisini açacağından gerçekten tıklanmaz:
// girdinin click() çağrısı yakalanır.
const PDF = process.env.PDEFE_TEST_PDF;
const PNG = process.env.PDEFE_TEST_PNG || 'test/png/yazi-dolgu';
let hata = 0;
const dogrula = (kosul, ad, ayrinti = '') => { console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ayrinti ? ' — ' + ayrinti : ''}`); if (!kosul) hata++; };

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, surukle, yaz, tus }) {
  await evalJs(`(async () => {
    for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true });
    const b = await window.__pdefe.dosyaAc(${JSON.stringify(PDF)});
    await new Promise((r) => setTimeout(r, 1200));
    b.gorunum.koyuSayfaAyarla(true); b.notlar.hepsiniCiz();
    await new Promise((r) => setTimeout(r, 1500));
    return 1;
  })()`);
  const k = await evalJs(`(() => { const s = window.__pdefe.aktif().gorunum.sayfalar[0].el.getBoundingClientRect(); return [Math.round(s.left), Math.round(s.top), Math.round(s.width)]; })()`);
  await evalJs(`window.__pdefe.aktif().notlar.aracSec('yazi')`);
  const x = k[0] + Math.round(k[2] * 0.35), y = k[1] + 200;
  await surukle(x, y, x + 260, y + 70);
  await bekle(400);
  await yaz('Koyu sayfada yazı ğüşİöç');
  await bekle(300);

  // 1) Koyulaştırılmış sayfada düzenleyicideki siyah yazı beyaz görünür (filtre), dosya rengi siyah kalır
  const duz = await evalJs(`(() => { const e = document.querySelector('.yazi-duzenleyici'); const cs = getComputedStyle(e); return { renk: cs.color, filtre: cs.filter }; })()`);
  dogrula(/invert\(1\)/.test(duz.filtre) && duz.renk === 'rgb(0, 0, 0)', 'düzenleyici koyu sayfada ters çevrilir (siyah yazı beyaz görünür)', JSON.stringify(duz));
  await ekranGoruntusu(`${PNG}-01-koyu-yazarken.png`);

  // 2) Ayrı Dolgusuz düğmesi yok; dolgu düğmesi paleti açar
  dogrula(!(await evalJs(`!!document.querySelector('.yazi-bicim .arka-yok')`)), 'biçim çubuğunda ayrı Dolgusuz düğmesi yok');
  const dugme = await evalJs(`(() => { const r = document.querySelector('.yazi-bicim .dolgu-dugme').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  await tikla(dugme[0], dugme[1]); await bekle(250);
  let p = await evalJs(`(() => { const p = document.querySelector('.dolgu-paleti'); return { acik: !p.hidden, secili: p.querySelector('.secili')?.dataset.arka ?? null, odak: document.activeElement?.className }; })()`);
  dogrula(p.acik && p.secili === '', 'dolgu düğmesi paleti açar; Dolgusuz seçili', JSON.stringify(p));
  dogrula(/yazi-duzenleyici/.test(p.odak || ''), 'odak düzenleyicide kalır', p.odak);
  await ekranGoruntusu(`${PNG}-02-palet.png`);

  // 3) Sarı seçilince dolgu uygulanır, palet kapanır
  const sari = await evalJs(`(() => { const r = document.querySelector('.dolgu-paleti .dolgu-renk[data-arka="#ffd100"]').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  await tikla(sari[0], sari[1]); await bekle(250);
  let s = await evalJs(`(() => ({ arka: window.__pdefe.aktif().notlar.duzenleyici?.yazi.arka ?? null, acik: !document.querySelector('.dolgu-paleti').hidden }))()`);
  dogrula(s.arka === '#ffd100' && !s.acik, 'Sarı seçilince dolgu uygulanır, palet kapanır', JSON.stringify(s));

  // 4) Paletten Dolgusuz
  await tikla(dugme[0], dugme[1]); await bekle(200);
  p = await evalJs(`document.querySelector('.dolgu-paleti .secili')?.dataset.arka ?? null`);
  dogrula(p === '#ffd100', 'palette geçerli dolgu seçili görünür', p);
  const dolgusuz = await evalJs(`(() => { const r = document.querySelector('.dolgu-paleti .dolgu-dolgusuz').getBoundingClientRect(); return [Math.round(r.left + 20), Math.round(r.top + r.height / 2)]; })()`);
  await tikla(dolgusuz[0], dolgusuz[1]); await bekle(250);
  s = await evalJs(`(() => ({ arka: window.__pdefe.aktif().notlar.duzenleyici?.yazi.arka ?? null, acik: !document.querySelector('.dolgu-paleti').hidden }))()`);
  dogrula(s.arka === null && !s.acik, 'paletteki Dolgusuz dolguyu kaldırır', JSON.stringify(s));

  // 5) Esc yalnızca paleti kapatır, düzenleme sürer; ikinci Esc düzenlemeyi bitirir
  await tikla(dugme[0], dugme[1]); await bekle(200);
  await tus('Escape'); await bekle(200);
  s = await evalJs(`(() => ({ acik: !document.querySelector('.dolgu-paleti')?.hidden, duzenleyici: !!window.__pdefe.aktif().notlar.duzenleyici }))()`);
  dogrula(!s.acik && s.duzenleyici, 'Esc paleti kapatır, düzenleme sürer', JSON.stringify(s));

  // 6) Dışarı (biçim çubuğunda başka yere) basış paleti kapatır
  await tikla(dugme[0], dugme[1]); await bekle(200);
  const tip = await evalJs(`(() => { const r = document.querySelector('.yazi-bicim input.boyut').getBoundingClientRect(); return [Math.round(r.left + 8), Math.round(r.top + r.height / 2)]; })()`);
  await tikla(tip[0], tip[1]); await bekle(200);
  s = await evalJs(`!document.querySelector('.dolgu-paleti').hidden`);
  dogrula(!s, 'paletin dışına basış paleti kapatır');

  // 7) Diğer renk Windows renk seçicisini açar (girdinin click() çağrısı yakalanır, ekranda pencere açılmaz)
  await evalJs(`(() => { const g = document.querySelector('.yazi-bicim input.arka-renk'); g.click = () => { window.__digerRenk = g.value; }; return 1; })()`);
  await tikla(dugme[0], dugme[1]); await bekle(200);
  const diger = await evalJs(`(() => { const r = document.querySelector('.dolgu-paleti .dolgu-diger').getBoundingClientRect(); return [Math.round(r.left + 20), Math.round(r.top + r.height / 2)]; })()`);
  await tikla(diger[0], diger[1]); await bekle(200);
  const dr = await evalJs(`window.__digerRenk ?? null`);
  dogrula(!!dr, 'Diğer renk renk seçicisini açar', dr);
  await evalJs(`(() => { const g = document.querySelector('.yazi-bicim input.arka-renk'); g.value = '#b3e5fc'; g.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  s = await evalJs(`window.__pdefe.aktif().notlar.duzenleyici?.yazi.arka ?? null`);
  dogrula(s === '#b3e5fc', 'renk seçicide seçilen renk dolgu olur', s);

  // 8) Düzenleme bitince yazı kutusu koyu sayfada görünür (ters çevrilmiş)
  await tus('Escape'); await bekle(400);
  const ft = await evalJs(`(() => { const e = document.querySelector('.not-freetext'); if (!e) return null; const cs = getComputedStyle(e); return { filtre: cs.filter, arka: cs.backgroundColor }; })()`);
  dogrula(!!ft && /invert\(1\)/.test(ft.filtre), 'bitmiş yazı kutusu koyu sayfada ters çevrilir', JSON.stringify(ft));
  await ekranGoruntusu(`${PNG}-03-koyu-bitti.png`);
  // 9) Geri al: yeni kutu tek adımda kalkar
  await tus('z', ['ctrl']); await bekle(300);
  const kalan = await evalJs(`[...window.__pdefe.aktif().notlar.notlar.values()].filter((n) => n.tur === 'FreeText' && !n.silindi).length`);
  dogrula(kalan === 0, 'Ctrl+Z yeni yazı kutusunu kaldırır', String(kalan));
  console.log(hata ? `BİTTİ: ${hata} hata` : 'BİTTİ: hepsi tamam');
}
