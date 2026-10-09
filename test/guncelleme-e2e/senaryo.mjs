// Güncelleme uçtan uca testi: kurulu deneme uygulamasında (CDP) şerit adımları. surucu.mjs ile çalışır:
//   $env:PDEFE_CDP_PORT=9911; $env:ADIM='serit'; node test/surucu.mjs betik test/guncelleme-e2e/senaryo.mjs
// ADIM: serit | dahaSonra | hataIndir | ertele (PDF=<yol>) | kur | ayarlarDenetle | erteleAyarlar (PDF=<yol>) | kapat | eskiKur
//   0.2.5: yarimKapat (YUZDE) | seritBekle (SURE) | kesinti (PDF=<yol>; sunucu /__kes) | donma (sunucu /__dur)
//   erteleAyarlar: kaydedilmemiş belgeyle Güncelle; indirme sürerken ve Vazgeç'ten sonra Ayarlar › Şimdi denetle sonucu
//   kapat: kaydedilmemiş belge varsa Kaydetme yanıtıyla pencereyi kapatır (indirilmiş paket kurulmaz; autoInstallOnAppQuit false)
//   eskiKur: 0.1.2 ve öncesinin şeridi (Güncellemeyi yükle → Şimdi yeniden başlat ve kur; quitAndInstall(false, true))
// Tıklamalar gerçek CDP fare olaylarıdır (Input.dispatchMouseEvent). Sunucu denetimi SUNUCU (varsayılan http://127.0.0.1:9914).
import fs from 'node:fs';
import path from 'node:path';

const SUNUCU = process.env.SUNUCU || 'http://127.0.0.1:9914';
const AYAR = path.join(process.env.APPDATA, 'PDEfe Guncelleme Testi', 'ayarlar.json');
const SERIT = `(() => { const s = document.querySelector('#guncelleme-seridi');
  return { gizli: s.hidden, asama: s.dataset.asama || '', metin: s.querySelector('.metin')?.textContent || '',
    dugmeler: [...s.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { ad: b.textContent, sinif: b.className, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }) }; })()`;

/** Haftalık denetimin kaydı (0.1.8; önceden açılış sayacı): son başarılı denetim zamanı ve bekleyen sürüm. */
function sayac() {
  try { const a = JSON.parse(fs.readFileSync(AYAR, 'utf8')); return { sonDenetimZamani: a.sonDenetimZamani ? new Date(a.sonDenetimZamani).toISOString() : null, bekleyenGuncelleme: a.bekleyenGuncelleme, pencere: a.pencere }; }
  catch (e) { return { hata: e.message }; }
}
const ozet = (s) => (s.gizli ? '(gizli)' : `[${s.asama}] ${s.metin} | ${s.dugmeler.map((b) => b.ad + (b.sinif === 'birincil-serit' ? '*' : '')).join(', ')}`);

export default async function ({ evalJs, bekle, tikla, ekranGoruntusu }) {
  const adim = process.env.ADIM || 'serit';
  // Uygulama kapanınca surucu.mjs'in isteği hiç yanıtlanmaz: süre sınırıyla bağlantı koptu sayılır
  const zamanli = (p, ms = 4000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('yanıt yok')), ms))]);
  const serit = () => zamanli(evalJs(SERIT));
  const bas = async (...adlar) => {
    const s = await serit();
    const d = s.dugmeler.find((b) => adlar.includes(b.ad));
    if (!d) throw new Error(`Düğme yok (${adlar.join('/')}); şerit: ${ozet(s)}`);
    console.log(`tıkla "${d.ad}" (${d.x}, ${d.y})`);
    await tikla(d.x, d.y);
  };
  /** Ayarlar › Güncelleme › Şimdi denetle: sonuç satırının metni ve düğmeleri. */
  const ayarlarDenetle = async (ss) => {
    await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar')`); await bekle(400);
    await evalJs(`document.querySelector('.ayarlar-bolumler button[data-bolum="guncelleme"]').click()`); await bekle(300);
    const d = await evalJs(`(() => { const b = [...document.querySelectorAll('.ayarlar-icerik button')].find((b) => b.textContent === 'Şimdi denetle'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await tikla(d.x, d.y);
    for (let i = 0; i < 40; i++) { await bekle(250); if (!/Denetleniyor/.test(await evalJs(`document.querySelector('.ayar-sonuc').textContent`))) break; }
    const r = await evalJs(`(() => { const s = document.querySelector('.ayar-sonuc'); return { metin: (s.querySelector('span')?.textContent ?? s.textContent).trim(), dugmeler: [...s.querySelectorAll('button')].map((b) => b.textContent) }; })()`);
    if (ss) await ekranGoruntusu(ss);
    await evalJs(`document.querySelector('.ayarlar-ortusu [data-id="kapat2"]').click()`); await bekle(200);
    return r;
  };
  const belgeDegistir = async () => {
    const pdf = process.env.PDF.replace(/\\/g, '/');
    return evalJs(`(async () => { const p = window.__pdefe; const b = await p.dosyaAc(${JSON.stringify(pdf)}); await new Promise((r) => setTimeout(r, 1200)); await p.sayfalariDondur(b, [1], 90, 'Sayfayı döndür'); await new Promise((r) => setTimeout(r, 400)); return { ad: b.ad, degisti: b.degisti }; })()`);
  };
  /** Şeridi izler; kosul(s) doğru olunca ya da bağlantı kopunca (uygulama kapandı) döner. */
  const izle = async (kosul, sureMs = 60000, ornekMs = 200) => {
    const gorulen = [];
    const t0 = Date.now(), son = t0 + sureMs;
    const zaman = () => `${((Date.now() - t0) / 1000).toFixed(1)} sn `;
    let onceki = '';
    while (Date.now() < son) {
      let s;
      try { s = await serit(); } catch (e) { gorulen.push(zaman() + '(bağlantı koptu: ' + String(e.message || e).slice(0, 60) + ')'); return { gorulen, koptu: true }; }
      const o = ozet(s);
      if (onceki !== o) { gorulen.push(zaman() + o); onceki = o; }
      if (kosul(s)) return { gorulen, s };
      await bekle(ornekMs);
    }
    return { gorulen, zamanAsimi: true };
  };

  if (adim === 'serit') {
    const s = await serit();
    console.log('şerit:', ozet(s));
    console.log('denetim kaydı:', JSON.stringify(sayac()));
    console.log('durum:', JSON.stringify(await evalJs(`pdefe.cagir('guncelleme:durum')`)));
    console.log('sürüm:', JSON.stringify(await evalJs(`pdefe.cagir('uygulama:bilgi').then((b) => ({ surum: b.surum, paketli: b.paketli }))`)));
    if (process.env.SS) await ekranGoruntusu(process.env.SS);
  } else if (adim === 'dahaSonra') {
    await bas('Daha sonra'); await bekle(300);
    console.log('Daha sonra →', ozet(await serit()));
    await evalJs(`window.__pdefe.komutCalistir('yardim.guncelle')`);
    const r = await izle((s) => !s.gizli, 15000);
    console.log('Yardım › Güncellemeleri denetle →', r.gorulen.join('  →  '));
  } else if (adim === 'hataIndir') {
    console.log('sunucu:', await (await fetch(`${SUNUCU}/__hata?acik=1`)).text());
    await bas('Güncelle', 'Yeniden dene');
    const r = await izle((s) => s.asama === 'hata', 90000);
    console.log('akış:', r.gorulen.join('  →  '));
    if (process.env.SS) await ekranGoruntusu(process.env.SS);
    console.log('sunucu:', await (await fetch(`${SUNUCU}/__hata?acik=0`)).text());
  } else if (adim === 'ertele') {
    // Kaydedilmemiş değişiklik: PDF aç, bir sayfayı döndür; kapatma sorusu Vazgeç (2) ile yanıtlanır (packaged'da da çalışan __pdefeOtoYanit)
    const pdf = process.env.PDF.replace(/\\/g, '/');
    console.log('belge:', JSON.stringify(await evalJs(`(async () => { const p = window.__pdefe; const b = await p.dosyaAc(${JSON.stringify(pdf)}); await new Promise((r) => setTimeout(r, 1200)); await p.sayfalariDondur(b, [1], 90, 'Sayfayı döndür'); await new Promise((r) => setTimeout(r, 400)); window.__pdefeOtoYanit = { secim: 2 }; return { ad: b.ad, degisti: b.degisti }; })()`)));
    await bas('Güncelle', 'Yeniden dene');
    const r = await izle((s) => s.asama === 'hazir' || s.asama === 'hata', 120000, 150);
    console.log('akış:', r.gorulen.join('\n   → '));
    console.log('sorulan:', await evalJs(`JSON.stringify(window.__pdefeOtoYanit.son || null)`));
    console.log('durum:', JSON.stringify(await evalJs(`pdefe.cagir('guncelleme:durum')`)));
    if (process.env.SS) await ekranGoruntusu(process.env.SS);
  } else if (adim === 'kur') {
    await evalJs(`window.__pdefeOtoYanit = { secim: 1 }; true`);   // varsa kaydedilmemiş değişiklik: Kaydetme
    if (process.env.YAZAR) await evalJs(`pdefe.cagir('ayar:koy', 'yazarAdi', ${JSON.stringify(process.env.YAZAR)})`);   // güncellemeden sonra korunmalı
    const t0 = Date.now();
    await bas('Kur ve yeniden başlat', 'Güncelle');
    const r = await izle(() => false, 180000, 150);
    console.log('akış:', r.gorulen.join('\n   → '));
    console.log(`bağlantı ${((Date.now() - t0) / 1000).toFixed(1)} sn sonra koptu:`, !!r.koptu);
    process.exit(0);   // kopan CDP bağlantısında bekleyen istek süreci açık tutmasın
  } else if (adim === 'erteleAyarlar') {
    console.log('belge:', JSON.stringify(await belgeDegistir()));
    await evalJs(`window.__pdefeOtoYanit = { secim: 2 }; true`);   // kapatma sorusu: Vazgeç
    await bas('Güncelle', 'Yeniden dene');
    const r1 = await izle((s) => (s.asama === 'indiriliyor' && /%[1-9]/.test(s.metin)) || s.asama === 'hazir' || s.asama === 'hata', 60000, 100);
    console.log('akış:', r1.gorulen.join('\n   → '));
    console.log('Ayarlar (indirme sürerken):', JSON.stringify(await ayarlarDenetle(process.env.SS_DIR ? path.join(process.env.SS_DIR, 'ayarlar-indirirken.png') : '')));
    console.log('şerit:', ozet(await serit()));
    const r2 = await izle((s) => s.asama === 'hazir' || s.asama === 'hata', 180000, 150);
    console.log('akış:', r2.gorulen.join('\n   → '));
    console.log('sorulan:', await evalJs(`JSON.stringify(window.__pdefeOtoYanit.son?.mesaj || null)`));
    console.log('Ayarlar (Vazgeç sonrası):', JSON.stringify(await ayarlarDenetle(process.env.SS_DIR ? path.join(process.env.SS_DIR, 'ayarlar-hazir.png') : '')));
    console.log('şerit:', ozet(await serit()));
    console.log('durum:', JSON.stringify(await evalJs(`pdefe.cagir('guncelleme:durum')`)));
    if (process.env.SS_DIR) await ekranGoruntusu(path.join(process.env.SS_DIR, 'serit-hazir.png'));
  } else if (adim === 'kapat') {
    await evalJs(`window.__pdefeOtoYanit = { secim: 1 }; true`);   // kaydedilmemiş belge: Kaydetme
    const t0 = Date.now();
    zamanli(evalJs(`pdefe.cagir('pencere:kapat')`), 3000).catch(() => {});
    const r = await izle(() => false, 30000, 200);
    console.log(`pencere kapatıldı; bağlantı ${((Date.now() - t0) / 1000).toFixed(1)} sn sonra koptu:`, !!r.koptu);
    process.exit(0);
  } else if (adim === 'eskiKur') {
    await evalJs(`window.__pdefeOtoYanit = { secim: 1 }; true`);
    let s = await serit();
    if (s.gizli) { await evalJs(`window.__pdefe.komutCalistir('yardim.guncelle')`); s = (await izle((x) => !x.gizli, 20000)).s || s; }
    console.log('şerit (0.1.2 arayüzü):', ozet(s));
    await bas('Güncellemeyi yükle');
    const r1 = await izle((x) => x.dugmeler.some((b) => b.ad === 'Şimdi yeniden başlat ve kur'), 180000, 200);
    console.log('akış:', r1.gorulen.join('\n   → '));
    const t0 = Date.now();
    await bas('Şimdi yeniden başlat ve kur');
    const r2 = await izle(() => false, 60000, 150);
    console.log('akış:', r2.gorulen.join('\n   → '));
    console.log(`bağlantı ${((Date.now() - t0) / 1000).toFixed(1)} sn sonra koptu:`, !!r2.koptu);
    process.exit(0);
  } else if (adim === 'ayarlarDenetle') {
    await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar')`); await bekle(400);
    await evalJs(`document.querySelector('.ayarlar-bolumler button[data-bolum="guncelleme"]').click()`); await bekle(300);
    const d = await evalJs(`(() => { const b = [...document.querySelectorAll('.ayarlar-icerik button')].find((b) => b.textContent === 'Şimdi denetle'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await tikla(d.x, d.y);
    for (let i = 0; i < 40; i++) { await bekle(250); if (!/Denetleniyor/.test(await evalJs(`document.querySelector('.ayar-sonuc').textContent`))) break; }
    console.log('Ayarlar › Güncelleme sonucu:', await evalJs(`document.querySelector('.ayar-sonuc').textContent`));
    console.log('anahtar:', await evalJs(`document.querySelector('.ayarlar-icerik .ayar-baslik').textContent`));
    if (process.env.SS) await ekranGoruntusu(process.env.SS);
    await evalJs(`document.querySelector('.ayarlar-ortusu [data-id="kapat2"]').click()`); await bekle(200);
    console.log('şerit:', ozet(await serit()));
  } else if (adim === 'yarimKapat') {
    // 0.2.5: indirme sürerken (YUZDE, varsayılan %15) durur; kapatma dışarıdan (uygulama.ps1 -Islem kapat). Şeritte kapatma uyarısı
    await bas('Güncelle', 'Yeniden dene');
    const r = await izle((s) => yuzde(s) >= Number(process.env.YUZDE || 15) || s.asama === 'hata', 180000, 150);
    console.log('akış:', r.gorulen.join('\n   → '));
    console.log('kapatma uyarısı:', /İndirme bitene dek PDEfe'yi kapatmayın\./.test(r.s?.metin || '') ? 'var' : 'YOK');
    console.log('denetim kaydı:', JSON.stringify(sayac()));
    if (process.env.SS) await ekranGoruntusu(process.env.SS);
  } else if (adim === 'seritBekle') {
    // 0.2.5: açılıştan sonra şeridin (otomatik denetimle) görünmesini bekler
    const t0 = Date.now();
    const r = await izle((s) => !s.gizli, Number(process.env.SURE || 25000), 200);
    console.log(`açılış: ${r.zamanAsimi ? 'şerit görünmedi' : `şerit ${((Date.now() - t0) / 1000).toFixed(1)} sn sonra`}:`, r.gorulen.join('  →  '));
    console.log('denetim kaydı:', JSON.stringify(sayac()));
  } else if (adim === 'kesinti') {
    // 0.2.5: indirme %10'dayken bağlantı ortasında kesilir (internet kopması); kaydedilmemiş belge var (Vazgeç). Yeniden dene baştan indirir,
    // bitince belge sorulur, Vazgeç → hazır
    console.log('belge:', JSON.stringify(await belgeDegistir()));
    await evalJs(`window.__pdefeOtoYanit = { secim: 2 }; true`);
    await bas('Güncelle', 'Yeniden dene');
    const r1 = await izle((s) => yuzde(s) >= 10 || s.asama === 'hata', 180000, 150);
    console.log('kesiliyor:', await (await fetch(`${SUNUCU}/__kes`)).text());
    const t0 = Date.now();
    const r2 = await izle((s) => s.asama === 'hata', 120000, 150);
    console.log(`akış (hata ${((Date.now() - t0) / 1000).toFixed(1)} sn sonra):`, [...r1.gorulen, ...r2.gorulen].join('\n   → '));
    if (process.env.SS_DIR) await ekranGoruntusu(path.join(process.env.SS_DIR, 'kesinti-hata.png'));
    await bas('Yeniden dene');
    const r3 = await izle((s) => s.asama === 'hazir' || s.asama === 'hata', 600000, 300);
    console.log('Yeniden dene:', r3.gorulen.join('\n   → '));
    console.log('sorulan:', await evalJs(`JSON.stringify(window.__pdefeOtoYanit.son?.mesaj || null)`));
    console.log('durum:', JSON.stringify(await evalJs(`pdefe.cagir('guncelleme:durum')`)));
    console.log('denetim kaydı:', JSON.stringify(sayac()));
  } else if (adim === 'donma') {
    // 0.2.5: indirme %10'dayken sunucu veri göndermeyi keser, bağlantı açık kalır; bekçi ~60 sn sonra indirmeyi keser
    await bas('Güncelle', 'Yeniden dene');
    const r1 = await izle((s) => yuzde(s) >= 10 || s.asama === 'hata', 180000, 150);
    console.log('donduruluyor:', await (await fetch(`${SUNUCU}/__dur?acik=1`)).text());
    const t0 = Date.now();
    const r2 = await izle((s) => s.asama === 'hata', 150000, 500);
    console.log(`akış (hata ${((Date.now() - t0) / 1000).toFixed(1)} sn sonra):`, [...r1.gorulen, ...r2.gorulen].join('\n   → '));
    if (process.env.SS_DIR) await ekranGoruntusu(path.join(process.env.SS_DIR, 'donma-hata.png'));
    console.log('sunucu:', await (await fetch(`${SUNUCU}/__dur?acik=0`)).text());
  }
}

/** Şeritteki indirme yüzdesi ("indiriliyor %N"); indirme sürmüyorsa -1. */
function yuzde(s) { return s.asama === 'indiriliyor' ? Number(/%(\d+)/.exec(s.metin)?.[1] ?? 0) : -1; }
