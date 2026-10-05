// Sayfalar panelinin küçük resimleri panel genişliğine uyar (0.2.2, kullanıcı isteği: "sağ penceresi sıkıştırıldığında sayfalar da
// sıkışsın (tam görüntüleme bozulmadan küçülsün) ve mavi işaret düzgün olsun; genişletildiğinde sayfalar da büyüsün"):
//   1) Tutamaç gerçek fare olayıyla (CDP Input) 240 → 140 → 480 → 60vw sınırına → 240 sürüklenir. Her genişlikte görünen her küçük resim
//      hücrenin içinde ve hücrenin içini dolduruyor, oranı sayfanınki; yatay kaydırma yok; geçerli sayfanın mavi çerçevesi (hücre) resmi ve
//      numarasını kuşatıyor ve alanın içinde (kırpılmıyor); geçerli sayfa görünür kalıyor. Sürüklerken (fare basılıyken) resimler canlı uyar.
//   2) Çözünürlük: genişleyince görünen resimler daha yüksek çözünürlükte yeniden istenir (naturalWidth ≥ ekrandaki genişlik × ölçek), yeni
//      resim gelene dek eskisi yerinde (hücre yer tutucuya dönmez); daralınca yeniden istenmez (aynı resim öğesi). İstenen genişliğin
//      kademesi ve üst sınırı (kucukResimIstegi).
//   3) Döndürülmüş sayfalar: kaydedilmemiş döndürme 90° ve 180° (resim ekranda döner), dosyanın kendi /Rotate'i, diske işlenmiş döndürme
//      (resim çekirdekten döndürülmüş gelir), görünüm döndürmesi; hepsi hücreye sığar, oran doğru.
//   4) Pencere daralıp 60vw sınırı paneli kısınca (Emulation) resimler yine sığar, çözünürlük denetlenir; 140 px'te panel sekme başlıkları
//      ("Sayfalar", "İçindekiler", "Yorumlar") panelin içinde ve kırpılmadan.
//   5) Konsolda hata yok ("ResizeObserver loop" dahil).
// Kullanım (en az iki ekran ölçeğinde):
//   powershell -File test\baslat.ps1 -Port 9520 [-Olcek 1.25]      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9520; node test\surucu.mjs betik test\panel_kucuk_resim.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Örnek PDF test\cikti\panel_kucuk_resim\<zaman> altında üretilir (ornek_pdf_uret.py; gerçek belge yok), iş bitince silinir.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 'panel_kucuk_resim', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const PORT = process.env.PDEFE_CDP_PORT || 9222;

let hataSayisi = 0, tamamSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (ok) tamamSayisi++; else hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

/** Sayfa düzeninin ve küçük resimlerin ölçümü (sayfada çalışır): panel, alan, görünen hücreler, geçerli hücre, sekme başlıkları. */
const OLCUM = `(() => {
  const p = window.__pdefe, b = p.aktif(), g = b.gorunum;
  const aci = (d) => ((d % 360) + 360) % 360;
  const alan = document.querySelector('#panel-sayfalar'), ar = alan.getBoundingClientRect();
  const ust = ar.top + alan.clientTop, alt = ust + alan.clientHeight, sol = ar.left + alan.clientLeft, sag = sol + alan.clientWidth;
  const kutu = (r) => ({ l: +r.left.toFixed(2), t: +r.top.toFixed(2), r: +r.right.toFixed(2), b: +r.bottom.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) });
  const hucreler = [];
  for (const el of alan.querySelectorAll('.kucuk-resim')) {
    const hr = el.getBoundingClientRect();
    if (hr.bottom <= ust || hr.top >= alt) continue;   // görünmeyen
    const no = +el.dataset.sayfa, s = g.sayfalar[no - 1];
    const ortam = el.firstElementChild, img = el.querySelector('img'), st = getComputedStyle(el);
    const ic = { l: hr.left + parseFloat(st.paddingLeft), r: hr.right - parseFloat(st.paddingRight) };
    const d = aci((s.dondurme || 0) + (g.gorunumDondurme || 0));
    hucreler.push({
      no, tur: ortam.classList.contains('donuk') ? (ortam.classList.contains('yan') ? 'donuk-yan' : 'donuk') : ortam.tagName === 'IMG' ? 'img' : 'bos',
      hucre: kutu(hr), ic, ortam: kutu(ortam.getBoundingClientRect()), numara: kutu(el.querySelector('.no').getBoundingClientRect()),
      resimGorunen: img ? kutu(img.getBoundingClientRect()) : null,   // dönüşümden sonraki görünen kutu
      nw: img?.naturalWidth || 0, nh: img?.naturalHeight || 0, istenen: img ? +img.dataset.istenen : 0,
      beklenenOran: d % 180 === 0 ? s.pt.h / s.pt.w : s.pt.w / s.pt.h,
      gecerli: el.classList.contains('gecerli'), isaret: !!img && img.__isaret === 1, satirIci: [...el.querySelectorAll('*')].some((x) => /px/.test(x.getAttribute('style') || '')),
    });
  }
  const gec = alan.querySelector('.kucuk-resim.gecerli'), gr = gec?.getBoundingClientRect();
  const nav = document.querySelector('.panel-sekmeler'), navr = nav.getBoundingClientRect();
  return {
    panel: +document.querySelector('#sol-panel').getBoundingClientRect().width.toFixed(2), vw: window.innerWidth, dpr: window.devicePixelRatio,
    alan: { sw: alan.scrollWidth, cw: alan.clientWidth, ust, alt, sol, sag }, hucreler,
    gecerli: gec ? { no: +gec.dataset.sayfa, orta: (gr.top + gr.bottom) / 2, kutu: kutu(gr) } : null,
    sekmeler: [...nav.querySelectorAll('button')].map((x) => { const r = x.getBoundingClientRect(); return { ad: x.textContent, sol: r.left, sag: r.right, kirpik: x.scrollWidth > x.clientWidth + 0.5 }; }),
    navSag: navr.right, navTasma: nav.scrollWidth > nav.clientWidth + 0.5,
  };
})()`;

export default async function ({ evalJs, bekle, fare, hedefler }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
  const hatalar = () => evalJs(`(() => { const h = window.__hatalar.slice(); window.__hatalar.length = 0; return h; })()`);
  const olc = () => evalJs(OLCUM);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); const ce = console.error; console.error = (...a) => { window.__hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; } return true; })()`);
  await evalJs(`(() => { window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);

  // Örnek: 9 sayfa (1–4 ve 7–9 dikey, 5 yatay, 6'nın dosyada /Rotate 90'ı var)
  fs.mkdirSync(K, { recursive: true });
  const yol = path.join(K, 'panel-kucuk-resim.pdf');
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yol, '8', 'Küçük resim'], { encoding: 'utf8' });
  execFileSync(PY, ['-X', 'utf8', '-c', [
    'import pymupdf, sys', 'd = pymupdf.open(sys.argv[1])', 'p = d.new_page(4, width=842, height=595)',
    'p.insert_text((72, 90), "Yatay sayfa", fontsize=18)', 'd[5].set_rotation(90)', 'd.save(sys.argv[1] + ".tmp")', 'd.close()',
  ].join('\n'), yol], { encoding: 'utf8' });
  fs.renameSync(yol + '.tmp', yol);

  const dpr = await evalJs('window.devicePixelRatio');
  console.log(`Ekran ölçeği ${dpr}, pencere ${await evalJs('window.innerWidth + "×" + window.innerHeight')}`);
  await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(yol)}); return true; })()`);
  await kosul(`!!window.__pdefe.aktif()?.gorunum?.hazir`);
  await evalJs(`(() => { const p = window.__pdefe; p.panel.genislikAyarla(240); p.panel.acKapa(true); p.panel.sekmeSec('sayfalar'); p.aktif().gorunum.sayfayaGit(3, { aninda: true }); return true; })()`);
  await kosul(`(() => { const el = document.querySelector('#panel-sayfalar .kucuk-resim.gecerli'); return el?.dataset.sayfa === '3' && !!el.querySelector('img'); })()`);
  await bekle(600);

  /** Görünen resimlerin hepsi yüklendi ve istenen çözünürlükte mi (çözünürlük denetimi gecikmeli: durulunca) */
  const yuklendi = (sure = 8000) => kosul(`(() => {
    const alan = document.querySelector('#panel-sayfalar'), ar = alan.getBoundingClientRect();
    return [...alan.querySelectorAll('.kucuk-resim')].filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > ar.top && r.top < ar.bottom; })
      .every((el) => el.querySelector('img') && !window.__pdefe.panel.yenidenIstenecekMi?.(el));
  })()`, sure);

  /** Bir ölçümün denetimleri (etiket: hangi genişlik) */
  const denetle = (etiket, o, { cozunurluk = true } = {}) => {
    const sorun = { tasma: [], icini: [], oran: [], cerceve: [], donuk: [], cozunurluk: [] };
    for (const h of o.hucreler) {
      if (h.ortam.l < h.ic.l - 0.75 || h.ortam.r > h.ic.r + 0.75) sorun.tasma.push(h.no);
      if (Math.abs(h.ortam.w - (h.ic.r - h.ic.l)) > 1) sorun.icini.push({ no: h.no, w: h.ortam.w, ic: +(h.ic.r - h.ic.l).toFixed(2) });
      const oran = h.ortam.h / h.ortam.w;
      if (Math.abs(oran - h.beklenenOran) / h.beklenenOran > 0.02) sorun.oran.push({ no: h.no, oran: +oran.toFixed(3), beklenen: +h.beklenenOran.toFixed(3) });
      // Hücre (mavi çerçeve hücreye çizilir: outline 2 px dışında) resmi ve numarayı kuşatıyor
      if (h.ortam.t < h.hucre.t || h.ortam.b > h.hucre.b || h.numara.b > h.hucre.b || h.numara.t < h.ortam.b) sorun.cerceve.push(h.no);
      // Ekranda döndürülen resmin görünen kutusu kutunun kendisi (taşmıyor, eksik kalmıyor)
      if (h.tur.startsWith('donuk') && h.resimGorunen && ['l', 't', 'r', 'b'].some((k) => Math.abs(h.resimGorunen[k] - h.ortam[k]) > 1.5)) sorun.donuk.push({ no: h.no, resim: h.resimGorunen, kutu: h.ortam });
      if (cozunurluk && h.nw) {
        // Resmin kendi genişliği ekranda ne kadar yer kaplıyor (90/270'te kutunun yüksekliği) × ölçek (en çok 2) kadar çizilmiş olmalı (üst sınır 1200)
        const ekranda = h.tur === 'donuk-yan' ? h.ortam.h : h.ortam.w;
        const gerekli = Math.min(1200, ekranda * Math.min(2, o.dpr));
        if (h.nw < gerekli * 0.97 || h.nw > 1201) sorun.cozunurluk.push({ no: h.no, nw: h.nw, gerekli: Math.round(gerekli), istenen: h.istenen });
      }
    }
    const bos = Object.entries(sorun).filter(([, v]) => v.length);
    sonuc(`${etiket}: resimler hücrenin içinde, hücreyi dolduruyor, oran doğru${o.hucreler.some((h) => h.tur.startsWith('donuk')) ? ', döndürülen resim kutusunda' : ''}${cozunurluk ? ', çözünürlük yeterli' : ''} (${o.hucreler.length} görünen)`,
      o.hucreler.length > 0 && !bos.length, bos.length ? Object.fromEntries(bos) : '');
    sonuc(`${etiket}: yatay kaydırma yok`, o.alan.sw <= o.alan.cw, { scrollWidth: o.alan.sw, clientWidth: o.alan.cw });
    sonuc(`${etiket}: satır içi px genişlik yok`, !o.hucreler.some((h) => h.satirIci), o.hucreler.filter((h) => h.satirIci).map((h) => h.no));
    if (o.gecerli) {
      const k = o.gecerli.kutu;
      sonuc(`${etiket}: geçerli sayfa (${o.gecerli.no}) görünür, mavi çerçevesi alanın içinde`,
        o.gecerli.orta > o.alan.ust && o.gecerli.orta < o.alan.alt && k.l - 2 >= o.alan.sol - 0.5 && k.r + 2 <= o.alan.sag + 0.5, { kutu: k, alan: o.alan });
    } else sonuc(`${etiket}: geçerli sayfa işaretli`, false);
  };

  /** Tutamacı gerçek fare olayıyla sürükler: panel genişliği hedef olacak kadar (tutamacın ortası panelin kenarına göre birkaç piksel
   *  kayık olabilir: hedef x, basılan noktadan genişlik farkı kadar ötede). birakma false ise fare basılı kalır (sonra birak()). */
  const tutamac = () => evalJs(`(() => { const r = document.querySelector('#panel-tutamac').getBoundingClientRect(); return { x: Math.round((r.left + r.right) / 2), y: Math.round((r.top + r.bottom) / 2), w: document.querySelector('#sol-panel').getBoundingClientRect().width }; })()`);
  let basiliX = null, basiliY = null;
  const surukle = async (hedefGenislik, { birakma = true, adim = 10 } = {}) => {
    const t = await tutamac();
    const x2 = t.x + hedefGenislik - t.w;
    const ustteki = await evalJs(`document.elementFromPoint(${t.x}, ${t.y})?.id || ''`);
    if (ustteki !== 'panel-tutamac') sonuc('Tutamaç fare altında', false, ustteki);
    const adimlar = [{ tur: 'hareket', x: t.x, y: t.y }, { tur: 'bas', x: t.x, y: t.y, bekle: 30 }];
    for (let i = 1; i <= adim; i++) adimlar.push({ tur: 'hareket', x: t.x + ((x2 - t.x) * i) / adim, y: t.y, bekle: 25 });
    if (birakma) adimlar.push({ tur: 'birak', x: x2, y: t.y }); else { basiliX = x2; basiliY = t.y; }
    await fare(adimlar);
  };
  const birak = async () => { await fare([{ tur: 'birak', x: basiliX, y: basiliY }]); basiliX = null; };
  /** Panel sol kenarı (genişlik hedefi bu kenara göre) */
  const panelSol = await evalJs(`document.querySelector('#sol-panel').getBoundingClientRect().left`);
  /** Yüklü resimleri işaretler; resmi olan hücrelerin sayfa numaralarını döner (sonradan görünür olup ilk kez yüklenenler sayılmaz) */
  const isaretle = () => evalJs(`[...document.querySelectorAll('#panel-sayfalar .kucuk-resim')].filter((el) => { const i = el.querySelector('img'); if (i) i.__isaret = 1; return !!i; }).map((el) => +el.dataset.sayfa)`);

  // ------------------------------------------------------------ 1–2) Sürükleyerek genişlikler, çözünürlük
  console.log('\n== 1–2) Tutamaçla genişlikler, çözünürlük');
  await yuklendi();
  let o = await olc();
  denetle('240 px (açılış)', o);
  const nw240 = Object.fromEntries(o.hucreler.map((h) => [h.no, h.nw]));

  // 240 → 140: daralınca yeniden istenmez (aynı resim öğeleri)
  let isaretli = await isaretle();
  await surukle(140);
  await bekle(900);
  o = await olc();
  sonuc('140 px: panel genişliği', Math.abs(o.panel - 140) <= 1, o.panel);
  denetle('140 px', o);
  const once140 = o.hucreler.filter((h) => isaretli.includes(h.no));
  sonuc('140 px: daralınca resimler yeniden istenmedi (aynı öğe)', once140.length > 0 && once140.every((h) => h.isaret), o.hucreler.map((h) => [h.no, isaretli.includes(h.no), h.isaret]));
  sonuc('140 px: panel sekme başlıkları panelin içinde, kırpılmadan', !o.navTasma && o.sekmeler.every((s) => !s.kirpik && s.sag <= o.panel + panelSol + 0.5),
    { sekmeler: o.sekmeler, navSag: o.navSag });
  const nw140 = Object.fromEntries(o.hucreler.map((h) => [h.no, h.nw]));

  // 140 → 480: sürüklerken (fare basılıyken) resimler canlı uyar; bırakınca yüksek çözünürlük gelir, eski resim yenisi gelene dek yerinde
  await surukle(310, { birakma: false });
  await bekle(120);
  o = await olc();
  sonuc('Sürüklerken (fare basılı, ~310 px) resimler panelle birlikte büyüdü', Math.abs(o.panel - 310) <= 2 && o.hucreler.length > 0
    && o.hucreler.every((h) => Math.abs(h.ortam.w - (h.ic.r - h.ic.l)) <= 1 && h.ortam.l >= h.ic.l - 0.75 && h.ortam.r <= h.ic.r + 0.75), { panel: o.panel, ilk: o.hucreler[0] && { ortam: o.hucreler[0].ortam, ic: o.hucreler[0].ic } });
  sonuc('Sürüklerken hücreler yer tutucuya dönmedi (eski resim yerinde)', o.hucreler.every((h) => h.tur !== 'bos'), o.hucreler.map((h) => h.tur));
  await fare([{ tur: 'hareket', x: basiliX + 170, y: basiliY, bekle: 30 }]);
  basiliX += 170;
  await birak();
  await yuklendi();
  await bekle(300);
  o = await olc();
  sonuc('480 px: panel genişliği', Math.abs(o.panel - 480) <= 1, o.panel);
  denetle('480 px', o);
  sonuc('480 px: çözünürlük 140 px\'tekinden yüksek (naturalWidth)', o.hucreler.filter((h) => nw140[h.no]).every((h) => h.nw > nw140[h.no]) && o.hucreler.some((h) => nw140[h.no]),
    o.hucreler.map((h) => [h.no, nw140[h.no], h.nw]));

  // 480 → 60vw sınırı (daha sağa sürüklense de panel pencerenin %60'ı)
  await surukle(o.vw * 0.85);
  await yuklendi();
  await bekle(300);
  o = await olc();
  sonuc('60vw: panel genişliği pencerenin %60\'ı', Math.abs(o.panel - o.vw * 0.6) <= 1, { panel: o.panel, vw: o.vw });
  denetle('60vw', o);
  const nw60 = Object.fromEntries(o.hucreler.map((h) => [h.no, h.nw]));

  // 60vw → 240: daralınca yeniden istenmez
  isaretli = await isaretle();
  await surukle(240);
  await bekle(900);
  o = await olc();
  sonuc('60vw → 240 px: panel genişliği', Math.abs(o.panel - 240) <= 1, o.panel);
  denetle('60vw → 240 px', o);
  const once240 = o.hucreler.filter((h) => isaretli.includes(h.no));
  sonuc('60vw → 240 px: yeniden istenmedi, büyük resim küçültülerek gösteriliyor', once240.length > 0 && once240.every((h) => h.isaret && (!nw60[h.no] || h.nw === nw60[h.no])),
    o.hucreler.map((h) => [h.no, h.isaret, h.nw]));
  const ayarG = await evalJs(`window.__pdefe.ayar().solPanelGenislik`);
  sonuc('Ayara bırakılan genişlik yazıldı (solPanelGenislik)', Math.abs(ayarG - o.panel) <= 0.5, { ayar: ayarG, panel: o.panel });
  void nw240;

  // İstek genişliği: kademe ve üst sınır (çekirdekten istenen cihaz pikseli)
  const istek = await evalJs(`(async () => { const m = await import('./panel.js'); return [m.kucukResimIstegi(100, 1), m.kucukResimIstegi(200, 1), m.kucukResimIstegi(203, 1.25), m.kucukResimIstegi(500, 3), m.kucukResimIstegi(900, 2), m.kucukResimIstegi(300, 1, 1.414)]; })()`);
  sonuc('İstek genişliği kademeli (64 px), ölçek en çok 2, üst sınır 1200, döndürmede oranla', J(istek) === J([128, 256, 256, 1024, 1200, 448]), istek);

  // ------------------------------------------------------------ 3) Döndürülmüş sayfalar
  console.log('\n== 3) Döndürülmüş sayfalar');
  const dondurVeBekle = async (sayfa, derece) => {
    await evalJs(`(async () => { const p = window.__pdefe, b = p.aktif(); b.gorunum.sayfayaGit(${sayfa}, { aninda: true }); await new Promise((r) => setTimeout(r, 200)); await p.komutCalistir('gorunum.dondur', ${derece}); return true; })()`);
    await kosul(`(() => { const b = window.__pdefe.aktif(); return (b.gorunum.sayfalar[${sayfa - 1}].dondurme || 0) % 360 === ${derece % 360}; })()`);
    await bekle(400);
  };
  const sayfayaGit = async (sayfa) => {
    await evalJs(`(() => { window.__pdefe.aktif().gorunum.sayfayaGit(${sayfa}, { aninda: true }); return true; })()`);
    await bekle(400);
  };
  await dondurVeBekle(2, 90);
  await dondurVeBekle(3, 180);
  await sayfayaGit(3);
  await yuklendi();
  o = await olc();
  const h2 = o.hucreler.find((h) => h.no === 2), h3 = o.hucreler.find((h) => h.no === 3), h5 = o.hucreler.find((h) => h.no === 5);
  sonuc('Kaydedilmemiş 90° döndürme: resim ekranda döndürülüyor (yan), kutu yatay', h2?.tur === 'donuk-yan' && h2.ortam.w > h2.ortam.h, h2 && { tur: h2.tur, ortam: h2.ortam });
  sonuc('Kaydedilmemiş 180° döndürme: resim ekranda döndürülüyor, kutu dikey', h3?.tur === 'donuk' && h3.ortam.h > h3.ortam.w, h3 && { tur: h3.tur, ortam: h3.ortam });
  denetle('240 px, döndürülmüş sayfalar', o);
  // Daraltıp genişletince döndürülen resimler de uyar
  await surukle(140);
  await bekle(900);
  denetle('140 px, döndürülmüş sayfalar', await olc(), { cozunurluk: false });
  await surukle(420);
  await yuklendi();
  await bekle(300);
  o = await olc();
  denetle('420 px, döndürülmüş sayfalar', o);
  await sayfayaGit(6);
  await yuklendi();
  o = await olc();
  const h6 = o.hucreler.find((h) => h.no === 6);
  const y5 = o.hucreler.find((h) => h.no === 5) || h5;
  sonuc('Yatay sayfa (5) ve dosyada /Rotate 90 olan sayfa (6) yatay, düz resim', y5?.tur === 'img' && y5.ortam.w > y5.ortam.h && h6?.tur === 'img' && h6.ortam.w > h6.ortam.h,
    { 5: y5 && { tur: y5.tur, ortam: y5.ortam }, 6: h6 && { tur: h6.tur, ortam: h6.ortam } });
  denetle('420 px, yatay ve /Rotate\'li sayfalar', o);

  // Diske işlenmiş döndürme: kaydedilir (yalnızca döndürme: artımlı), alan yeniden kurulunca resimler çekirdekten döndürülmüş gelir
  const kayit = await evalJs(`(async () => { const p = window.__pdefe, b = p.aktif(); return await p.belgeKaydet(b); })()`);
  sonuc('Döndürmeler kaydedildi', kayit === true, kayit);
  await evalJs(`(() => { const p = window.__pdefe; p.panel.belgeAyarla(p.aktif()); p.aktif().gorunum.sayfayaGit(2, { aninda: true }); return true; })()`);
  await bekle(300);
  await kosul(`!!document.querySelector('#panel-sayfalar .kucuk-resim[data-sayfa="2"] img')`);
  await yuklendi();
  o = await olc();
  const d2 = o.hucreler.find((h) => h.no === 2), d3 = o.hucreler.find((h) => h.no === 3);
  sonuc('Diske işlenmiş 90°: düz resim, çekirdekten yatay gelmiş', d2?.tur === 'img' && d2.nw > d2.nh && d2.ortam.w > d2.ortam.h, d2 && { tur: d2.tur, nw: d2.nw, nh: d2.nh });
  sonuc('Diske işlenmiş 180°: düz resim', d3?.tur === 'img', d3 && { tur: d3.tur });
  denetle('420 px, diske işlenmiş döndürme', o);

  // Görünüm döndürmesi (yalnızca ekranda; taşınan sekmenin durumundan gelebilir): bütün sayfalar 90° daha
  await evalJs(`(() => { const p = window.__pdefe, b = p.aktif(); b.gorunum.dondur(90); p.panel.belgeAyarla(b); return true; })()`);
  await bekle(300);
  await yuklendi();
  o = await olc();
  const v1 = o.hucreler.find((h) => h.tur === 'donuk-yan');
  sonuc('Görünüm döndürmesi: resimler ekranda döndürülüyor', !!v1, o.hucreler.map((h) => [h.no, h.tur]));
  denetle('420 px, görünüm döndürmesi', o);
  await surukle(160);
  await bekle(900);
  denetle('160 px, görünüm döndürmesi', await olc(), { cozunurluk: false });
  await evalJs(`(() => { const p = window.__pdefe, b = p.aktif(); b.gorunum.dondur(-90); p.panel.belgeAyarla(b); return true; })()`);
  await bekle(300);

  // ------------------------------------------------------------ 4) Pencere daralınca 60vw sınırı
  console.log('\n== 4) Pencere daralınca 60vw sınırı paneli kısar');
  await surukle(480);
  await yuklendi();
  await bekle(300);
  const hedef = (await hedefler())[0];
  const ws = new WebSocket(hedef.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let sira = 0; const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++sira; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  try {
    const yukseklik = await evalJs('window.innerHeight');
    await gonder('Emulation.setDeviceMetricsOverride', { width: 640, height: yukseklik, deviceScaleFactor: 0, mobile: false });
    await bekle(900);
    o = await olc();
    sonuc('Pencere 640 px: panel 60vw sınırına kısıldı', Math.abs(o.panel - 384) <= 1, { panel: o.panel, vw: o.vw });
    denetle('Pencere 640 px (panel 384)', o, { cozunurluk: false });
    await gonder('Emulation.clearDeviceMetricsOverride');
    await bekle(900);
    o = await olc();
    sonuc('Pencere eski boyutunda: panel yeniden 480 px', Math.abs(o.panel - 480) <= 1, o.panel);
    denetle('Pencere eski boyutunda (480)', o, { cozunurluk: false });
  } finally { ws.close(); }

  // ------------------------------------------------------------ 5) Konsol
  const h = await hatalar();
  sonuc('Konsolda hata yok', !h.length, h);

  await evalJs(`(async () => { const p = window.__pdefe; p.panel.genislikAyarla(240); p.panel.acKapa(false); for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  await evalJs(`window.pdefe.cagir('ayar:koy', 'solPanelGenislik', 240)`);
  await bekle(300);
  try { fs.rmSync(K, { recursive: true, force: true }); } catch { /* açık kalmış olabilir */ }
  console.log(`\n${tamamSayisi} tamam, ${hataSayisi} hata (ölçek ${dpr})`);
}
