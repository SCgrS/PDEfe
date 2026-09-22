// Vurgu çubuğu (0.1.4): vurguya tıklayınca renkler, Not ekle / Notu düzenle, Kaldır. Gerçek fare ve klavye girdisiyle.
// Kullanım: $env:PDEFE_CDP_PORT=<port>; $env:PDEFE_TEST_PDF=<notlu PDF'in kopyası>; node test/surucu.mjs betik test/vurgu_cubugu.mjs
// PDF'te vurgu olmalı (yoksa ilk sayfanın metni seçilip vurgulanır). Dosyaya yazılabilir: kopya verin.
const PDF = process.env.PDEFE_TEST_PDF;
const PNG = process.env.PDEFE_TEST_PNG || 'test/png/vurgu-cubugu';

let hata = 0;
const dogrula = (kosul, ad, ayrinti = '') => { console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ayrinti ? ' — ' + ayrinti : ''}`); if (!kosul) hata++; };

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, tus }) {
  const durum = () => evalJs(`(() => {
    const b = window.__pdefe.aktif(), n = b.notlar, c = document.querySelector('.not-cubugu');
    const not = n.notCubuguId ? n.notlar.get(n.notCubuguId) : null;
    return { acik: !!c && !c.hidden, id: n.notCubuguId, renk: not?.renk || null, secili: c?.querySelector('.renk.secili')?.dataset.renk || null,
      balon: !!n.balon, balonGecici: n.balonGecici, sayi: [...n.notlar.values()].filter((x) => !x.silindi && x.tur === 'Highlight').length,
      kutu: c && !c.hidden ? (() => { const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); })() : null };
  })()`);
  // Vurgunun ekrandaki bir satır parçasının ortası (istemci px, tam sayı: küsuratlı koordinatta basış yok sayılabiliyor)
  const vurguNoktasi = (id = null) => evalJs(`(() => {
    const b = window.__pdefe.aktif();
    const g = ${id ? `b.gorunum.alan.querySelector('g[data-id="${id}"]')` : `[...b.gorunum.alan.querySelectorAll('.not-vurgular g[data-id]')].find((x) => { const r = x.getBoundingClientRect(); return r.width > 20 && r.top > 80 && r.bottom < innerHeight - 60; })`};
    if (!g) return null;
    const r = g.querySelector('rect').getBoundingClientRect();
    return { id: g.dataset.id, x: Math.round(r.left + Math.min(40, r.width / 2)), y: Math.round(r.top + r.height / 2) };
  })()`);

  const acildi = await evalJs(`(async () => {
    for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true });
    const b = await window.__pdefe.dosyaAc(${JSON.stringify(PDF)});
    await new Promise((r) => setTimeout(r, 1500));
    const n = b.notlar; const v = [...n.notlar.values()].find((x) => x.tur === 'Highlight' && !x.silindi);
    if (v) { b.gorunum.sayfayaGit(v.sayfa, { y: Math.max(0, (v.quadKutular || [])[0]?.[1] ?? 0) }); }
    await new Promise((r) => setTimeout(r, 1500));
    return { ad: b.ad, vurgu: !!v };
  })()`);
  console.log('açıldı:', JSON.stringify(acildi));
  let nokta = await vurguNoktasi();
  dogrula(!!nokta, 'görünür bir vurgu var');
  if (!nokta) return;
  const ilkSayi = (await durum()).sayi;

  // 1) Vurguya tıklama çubuğu açar
  await tikla(nokta.x, nokta.y);
  await bekle(300);
  let d = await durum();
  dogrula(d.acik && d.id === nokta.id, 'tıklayınca vurgu çubuğu açılır', JSON.stringify(d.kutu));
  dogrula(d.kutu && (d.kutu[1] > nokta.y || d.kutu[1] + d.kutu[3] < nokta.y), 'çubuk vurgunun üstünü örtmez (altında ya da üstünde)');
  await ekranGoruntusu(`${PNG}-01-acik.png`);

  // 2) Renk değiştirme: çubuk açık kalır, seçili renk güncellenir; Ctrl+Z geri alır
  const eskiRenk = d.renk;
  const yesil = await evalJs(`(() => { const r = document.querySelector('.not-cubugu .renk[data-renk="#7ee787"]').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  await tikla(yesil[0], yesil[1]);
  await bekle(300);
  d = await durum();
  dogrula(d.renk === '#7ee787' && d.acik && d.secili === '#7ee787', 'renk yeşile döner, çubuk açık kalır', `renk=${d.renk}`);
  const cizilen = await evalJs(`document.querySelector('g[data-id="${nokta.id}"] rect')?.getAttribute('fill')`);
  dogrula(cizilen === '#7ee787', 'sayfadaki vurgu yeşil çizilir', cizilen);
  await ekranGoruntusu(`${PNG}-02-yesil.png`);
  await tus('z', ['ctrl']);
  await bekle(300);
  d = await durum();
  dogrula(String(d.renk || '').toLowerCase() === String(eskiRenk || '').toLowerCase(), 'Ctrl+Z rengi geri alır', `renk=${d.renk}`);

  // 3) Dışarı tıklama kapatır
  const bos = await evalJs(`(() => { const s = window.__pdefe.aktif().gorunum.kaydirici.getBoundingClientRect(); return [Math.round(s.left + 12), Math.round(s.top + 12)]; })()`);
  await tikla(bos[0], bos[1]);
  await bekle(200);
  d = await durum();
  dogrula(!d.acik && !d.id, 'başka yere tıklayınca çubuk kapanır');

  // 4) Esc kapatır
  nokta = await vurguNoktasi(nokta.id);
  await tikla(nokta.x, nokta.y); await bekle(250);
  await tus('Escape'); await bekle(200);
  d = await durum();
  dogrula(!d.acik, 'Esc çubuğu kapatır');

  // 5) Not ekle / Notu düzenle: kalıcı balon açılır, çubuk kapanır
  await tikla(nokta.x, nokta.y); await bekle(250);
  const notDugmesi = await evalJs(`(() => { const r = document.querySelector('.not-cubugu [data-islem="not"]').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  await tikla(notDugmesi[0], notDugmesi[1]); await bekle(300);
  d = await durum();
  dogrula(d.balon && !d.balonGecici && !d.acik, 'Not düğmesi kalıcı balonu açar, çubuk kapanır');
  await ekranGoruntusu(`${PNG}-03-not.png`);
  await tus('Escape'); await bekle(200);

  // 6) Kaldır: vurgu silinir; Ctrl+Z geri getirir
  nokta = await vurguNoktasi(nokta.id);
  await tikla(nokta.x, nokta.y); await bekle(250);
  const kaldir = await evalJs(`(() => { const r = document.querySelector('.not-cubugu [data-islem="kaldir"]').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  await tikla(kaldir[0], kaldir[1]); await bekle(300);
  d = await durum();
  dogrula(d.sayi === ilkSayi - 1 && !d.acik, 'Kaldır vurguyu siler, çubuk kapanır', `sayi=${d.sayi}/${ilkSayi}`);
  await tus('z', ['ctrl']); await bekle(300);
  d = await durum();
  dogrula(d.sayi === ilkSayi, 'Ctrl+Z silinen vurguyu geri getirir', `sayi=${d.sayi}`);

  // 7) Kaydırınca çubuk vurguyu izler
  nokta = await vurguNoktasi(nokta.id);
  await tikla(nokta.x, nokta.y); await bekle(250);
  const once = (await durum()).kutu;
  await evalJs(`(() => { window.__pdefe.aktif().gorunum.kaydirici.scrollTop += 40; return 1; })()`);
  await bekle(300);
  const sonra = (await durum()).kutu;
  dogrula(once && sonra && Math.abs((once[1] - sonra[1]) - 40) <= 2, 'kaydırınca çubuk vurguyla birlikte kayar', `${once?.[1]} → ${sonra?.[1]}`);
  await tus('Escape');
  console.log(hata ? `BİTTİ: ${hata} hata` : 'BİTTİ: hepsi tamam');
}
