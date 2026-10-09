// Senaryo 21 (0.1.15, kullanıcı istekleri): açılış ekranında PDF aç düğmesinin sütunun tamamını değil yalnızca yazısı kadar yer kaplaması
// ("… sürükleyin"den sonra bitsin; sola yaslı, dar pencerede açıklama alt satıra iner, taşmaz; 0.2.3'ten beri, kullanıcı isteği: sağ kenarı
// Araçlar'ın ikinci karosunun sağ kenarında, açıklama gerekirse iki satır) ve sağ alttaki simgeye ya da ada
// tıklanınca Ayarlar › Hakkında'nın açılması. İmza düğmeye dönüşmez: çerçeve, zemin, gölge, el imleci, üzerine gelince ya da basılıyken
// değişen görüntü, odak izi yok; Tab ile odaklanmaz; imzanın dışındaki boş yere tıklamak bir şey açmaz. Açık ve koyu temada ekran
// görüntüleri alınır.
// Kullanım:
//   powershell -File test\baslat_gizli.ps1 -Port 9421 -Veri "%TEMP%\pdefe-s21-9421" -Tema koyu      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9421; node test\surucu.mjs betik test\senaryo21.mjs
// Ekran görüntüleri test/cikti/s21/<zaman>/png'de.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG = path.join(KOK, 'test', 'cikti', 's21', new Date().toISOString().replace(/\D/g, '').slice(0, 14), 'png');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
const ACIKLAMA = "Bilgisayarınızdaki bir ya da birkaç PDF'i seçin veya bu pencereye sürükleyin";

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const bilgi = (s) => console.log(`     · ${s}`);

/** Sürekli CDP oturumu: genişlik taklidi, ham fare / tuş olayları ve ekran görüntüsü aynı oturumda. */
async function cdpOturumu() {
  const hedefler = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const sayfa = hedefler.find((h) => h.type === 'page' && h.url.startsWith('pdefe://'));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder };
}

export default async function ({ evalJs, bekle }) {
  const cdp = await cdpOturumu();
  const kosul = async (ifade, sure = 5000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  const koyuMu = () => evalJs(`document.documentElement.dataset.tema === 'koyu'`);
  const temaDegistir = async () => { await evalJs(`window.__pdefe.komutCalistir('gorunum.tema'), 1`); await bekle(500); };
  const boyut = async (w, h) => { if (w) await cdp.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false }); else await cdp.gonder('Emulation.clearDeviceMetricsOverride'); await bekle(400); };
  const goruntu = async (clip) => (await cdp.gonder('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })).result.data;
  const ss = async (ad, clip) => { await bekle(250); fs.writeFileSync(path.join(PNG, ad + '.png'), Buffer.from(await goruntu(clip), 'base64')); };
  // Önce açık, sonra koyu temada çeker; başladığı temaya döner
  const ssIki = async (ad, clip) => { const koyuydu = await koyuMu(); if (koyuydu) await temaDegistir(); await ss(ad + '-acik', clip); await temaDegistir(); await ss(ad + '-koyu', clip); if (!koyuydu) await temaDegistir(); };
  const fare = (type, x, y, buttons = 0) => cdp.gonder('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: 1 });
  const tikla = async (x, y) => { await fare('mouseMoved', x, y); await fare('mousePressed', x, y, 1); await fare('mouseReleased', x, y); };
  const hepsiniKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  const ayarlarAcik = () => evalJs(`!!document.querySelector('.ayarlar-ortusu')`);
  const seciliBolum = () => evalJs(`document.querySelector('.ayarlar-bolumler button.secili')?.dataset.bolum || null`);
  const ayarlarKapat = async () => { await evalJs(`document.querySelector('.ayarlar-ortusu [data-id="kapat2"]')?.click(), 1`); await kosul(`!document.querySelector('.ayarlar-ortusu')`); };

  fs.mkdirSync(PNG, { recursive: true });
  if (!(await koyuMu())) await temaDegistir();   // koyu temada başlar (kullanıcının teması); açık tema ayrıca sınanır
  if (await ayarlarAcik()) await ayarlarKapat();
  await hepsiniKapat();
  await kosul(`!document.querySelector('#baslangic').hidden`);
  const surum = (await evalJs(`window.pdefe.cagir('uygulama:bilgi')`))?.surum;

  try {
    // ================================================================ (a) PDF aç düğmesi yazısı kadar
    const olc = () => evalJs(`(() => {
      const r = (e) => { if (!e) return null; const k = e.getBoundingClientRect(); return { l: Math.round(k.left * 10) / 10, t: Math.round(k.top * 10) / 10, r: Math.round(k.right * 10) / 10, b: Math.round(k.bottom * 10) / 10, w: Math.round(k.width * 10) / 10, h: Math.round(k.height * 10) / 10 }; };
      const ac = document.querySelector('.karsilama-ac'), acik = ac.querySelector('.karsilama-aciklama'), cs = getComputedStyle(ac);
      // Açıklamanın metin satırları (sarılınca birden çok): Range.getClientRects satır başına bir dikdörtgen verir
      const aralik = document.createRange(); aralik.selectNodeContents(acik);
      const satirlar = [...new Set([...aralik.getClientRects()].map((k) => Math.round(k.top)))].length;
      const metinSag = Math.max(...[...aralik.getClientRects()].map((k) => k.right));
      const bas = document.querySelector('#baslangic'), br = bas.getBoundingClientRect();
      return { ac: r(ac), ikon: r(ac.querySelector('.karsilama-ac-ikon')), ad: r(ac.querySelector('.karsilama-ac-ad')), aciklama: r(acik), aciklamaMetin: acik.textContent, satirlar, metinSag: Math.round(metinSag * 10) / 10,
        pl: parseFloat(cs.paddingLeft), pr: parseFloat(cs.paddingRight), kenar: parseFloat(cs.borderLeftWidth),
        karsilama: r(document.querySelector('.karsilama')), araclar: r(document.querySelector('.karsilama-araclar')), izgara: r(document.querySelector('.karsilama-arac-izgara')),
        kart2: r(document.querySelectorAll('.karsilama-arac')[1]), sutun: getComputedStyle(document.querySelector('.karsilama-arac-izgara')).gridTemplateColumns.split(' ').length,
        alan: { w: bas.clientWidth, sw: bas.scrollWidth }, docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    })()`);
    for (const [w, h] of [[1920, 1000], [1536, 770], [1280, 700], [760, 560], [520, 520]]) {
      await boyut(w, h);
      const o = await olc();
      const e = `[${w}×${h}]`;
      sonuc(`${e} PDF aç açıklaması aynı: "${ACIKLAMA}"`, o.aciklamaMetin === ACIKLAMA, o.aciklamaMetin);
      sonuc(`${e} PDF aç sola yaslı (araçlarla aynı sol kenar), sütundan taşmıyor; ekran yatay kaymıyor`,
        Math.abs(o.ac.l - o.karsilama.l) < 1 && o.ac.r <= o.karsilama.r + 0.5 && o.alan.sw <= o.alan.w && o.docScroll <= 0, { ac: o.ac, karsilama: o.karsilama, alan: o.alan });
      // 0.2.3 (kullanıcı isteği): genişliği yazısı kadar değil (0.1.15–0.2.2), sağ kenarı Araçlar'ın ikinci karosunun (Sayfaları düzenle)
      // sağ kenarında; açıklama gerekirse alt satıra iner, düğmenin içinde kalır. Ayrıntılı genişlik taraması test/acilis_hizasi.mjs'te
      sonuc(`${e} PDF aç'ın sağ kenarı ikinci araç karosunun sağ kenarında (${o.ac.r} / ${o.kart2.r}); açıklama düğmenin içinde (${o.satirlar} satır)`,
        Math.abs(o.ac.r - o.kart2.r) <= 0.1 && (o.ac.w < o.karsilama.w - 40) === (o.sutun > 2) && o.aciklama.r <= o.ac.r - o.pr + 0.5 && o.aciklama.b <= o.ac.b && o.metinSag <= o.ac.r - o.pr + 0.5,
        { ac: o.ac, kart2: o.kart2, karsilama: o.karsilama, sutun: o.sutun, aciklama: o.aciklama, satirlar: o.satirlar });
      bilgi(`${e} PDF aç ${o.ac.w}×${o.ac.h}; sütun ${o.karsilama.w}; ızgara ${o.sutun} sütun`);
      if (w === 1536) await ssIki('a-acilis-1536');
      if (w === 520) await ss('a-acilis-520-koyu');
    }

    // ================================================================ (b) sağ alttaki imza: tıklanınca Ayarlar › Hakkında, görünüm düğme değil
    await boyut(1536, 770);
    const imzaOlc = () => evalJs(`(() => {
      const r = (e) => { const k = e.getBoundingClientRect(); return { l: k.left, t: k.top, r: k.right, b: k.bottom, w: k.width, h: k.height, x: k.left + k.width / 2, y: k.top + k.height / 2 }; };
      const imza = document.querySelector('.karsilama-imza'), logo = imza.querySelector('.karsilama-logo'), ad = imza.querySelector('.karsilama-ad'), alt = imza.querySelector('.karsilama-alt');
      const stil = (e) => { const c = getComputedStyle(e); return { imlec: c.cursor, cerceve: c.borderTopWidth + ' ' + c.borderTopStyle, zemin: c.backgroundColor, golge: c.boxShadow, anahat: c.outlineStyle, secim: c.userSelect }; };
      return { imza: r(imza), logo: r(logo), ad: r(ad), alt: r(alt), metin: imza.innerText.replace(/\\s+/g, ' ').trim(), etiket: imza.tagName, eylem: imza.dataset.eylem,
        odaklanir: imza.tabIndex >= 0 || [...imza.querySelectorAll('*')].some((e) => e.tabIndex >= 0), rol: imza.getAttribute('role'), ipucu: imza.title || logo.title || '',
        stil: [imza, logo, ad, alt].map(stil) };
    })()`);
    const im = await imzaOlc();
    sonuc(`İmza aynı: "PDEfe Sürüm ${surum} · Geliştirici: x.com/CgrShn", logo yanında`, im.metin === `PDEfe Sürüm ${surum} · Geliştirici: x.com/CgrShn` && im.logo.r <= im.ad.l, { metin: im.metin });
    // 0.2.2 (kullanıcı isteği): imza büyüdü (simge 30 → 50 px, ad 14 → 22, alt yazı 11 → 16 px), simge yazıya yakın (9 → 5 px)
    sonuc('İmza büyük: simge 50×50 px, simge ile yazı arası 5 px, ad alt yazıdan büyük', im.logo.w === 50 && im.logo.h === 50 && Math.abs(im.ad.l - im.logo.r - 5) < 0.6 && im.ad.h > im.alt.h,
      { logo: im.logo, ad: im.ad, alt: im.alt });
    sonuc('İmza düğme değil: çerçeve, zemin, gölge, anahat yok; imleç ok (el değil), metin seçilmez; Tab ile odaklanmaz, ipucu yok',
      im.etiket === 'FOOTER' && !im.rol && !im.odaklanir && !im.ipucu && im.stil.every((s) => (s.imlec === 'auto' || s.imlec === 'default') && /^0px/.test(s.cerceve) && s.zemin === 'rgba(0, 0, 0, 0)' && s.golge === 'none' && s.anahat === 'none' && s.secim === 'none'),
      { stil: im.stil, rol: im.rol, odaklanir: im.odaklanir, ipucu: im.ipucu });

    // Yöntemin denetimi: PDF aç düğmesinin üzerine gelince görüntüsü değişir; aynı karşılaştırma imzada değişiklik yakalayabilir
    const acK = await evalJs(`(() => { const k = document.querySelector('.karsilama-ac').getBoundingClientRect(); return { x: Math.floor(k.left) - 8, y: Math.floor(k.top) - 8, width: Math.ceil(k.width) + 16, height: Math.ceil(k.height) + 16 }; })()`);
    await fare('mouseMoved', 200, 700); await bekle(300);
    const acOnce = await goruntu(acK);
    await fare('mouseMoved', acK.x + 100, acK.y + 50); await bekle(400);
    const acUzerinde = await goruntu(acK);
    await fare('mouseMoved', 200, 700); await bekle(300);
    sonuc('Denetim: PDF aç düğmesinin üzerine gelince görüntüsü değişiyor (karşılaştırma farkı yakalıyor)', acOnce !== acUzerinde);

    // Üzerine gelince ve basılıyken görüntü piksel piksel aynı (fare önce uzakta)
    const kirp = { x: Math.floor(im.imza.l) - 16, y: Math.floor(im.imza.t) - 16, width: Math.ceil(im.imza.w) + 32, height: Math.ceil(im.imza.h) + 32 };
    await fare('mouseMoved', 200, 200); await bekle(300);
    const once = await goruntu(kirp);
    await fare('mouseMoved', im.ad.x, im.ad.y); await bekle(400);
    const uzerinde = await goruntu(kirp);
    await fare('mouseMoved', im.logo.x, im.logo.y); await bekle(400);
    const logoUzerinde = await goruntu(kirp);
    await fare('mousePressed', im.logo.x, im.logo.y, 1); await bekle(300);
    const basili = await goruntu(kirp);
    await fare('mouseMoved', 200, 200, 1); await fare('mouseReleased', 200, 200); await bekle(300);   // imzanın dışında bırakılır: tıklama sayılmaz
    sonuc('Üzerine gelince ve basılıyken imzanın görüntüsü değişmiyor (piksel piksel aynı)', once === uzerinde && once === logoUzerinde && once === basili,
      { adUzerinde: once === uzerinde, logoUzerinde: once === logoUzerinde, basili: once === basili });
    sonuc('Basıp imzanın dışında bırakınca Ayarlar açılmıyor', !(await ayarlarAcik()));
    fs.writeFileSync(path.join(PNG, 'b-imza-once.png'), Buffer.from(once, 'base64'));
    fs.writeFileSync(path.join(PNG, 'b-imza-uzerinde.png'), Buffer.from(logoUzerinde, 'base64'));

    // Simgeye, ada ve alt yazıya tıklayınca Ayarlar › Hakkında; gerçek fare olaylarıyla
    for (const [ad, n] of [['simgeye', im.logo], ['"PDEfe" yazısına', im.ad], ['alt yazıya ve sürüme', im.alt]]) {
      await tikla(n.x, n.y);
      const acildi = await kosul(`!!document.querySelector('.ayarlar-ortusu')`, 3000);
      const bolum = await seciliBolum();
      const odakImzada = await evalJs(`!!document.activeElement?.closest?.('.karsilama-imza')`);
      sonuc(`İmzada ${ad} tıklayınca Ayarlar › Hakkında açılıyor`, acildi && bolum === 'hakkinda' && !odakImzada, { acildi, bolum, odakImzada });
      if (ad === 'simgeye') await ss('b-hakkinda-koyu');
      await ayarlarKapat();
    }
    // Başka bölümdeyken açık Ayarlar yeniden Hakkında'ya geçer (yardim.hakkinda'nın davranışı): burada Ayarlar kapanıp yeniden açılır
    await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'gorunum'), 1`); await kosul(`!!document.querySelector('.ayarlar-ortusu')`);
    await ayarlarKapat();
    await tikla(im.logo.x, im.logo.y); await kosul(`!!document.querySelector('.ayarlar-ortusu')`, 3000);
    sonuc('Önce Görünüm açılıp kapansa da imza Hakkında\'yı açıyor', (await seciliBolum()) === 'hakkinda', await seciliBolum());
    await ayarlarKapat();

    // İmzanın dışı: solundaki ve üstündeki boş yer, ekranın sol alt köşesi bir şey açmaz
    for (const [ad, x, y] of [['imzanın 30 px solu', im.imza.l - 30, im.ad.y], ['imzanın 30 px üstü', im.logo.x, im.imza.t - 30], ['sol alt köşe', 60, im.imza.y]]) {
      await tikla(x, y); await bekle(400);
      sonuc(`Boş yere (${ad}) tıklayınca Ayarlar açılmıyor`, !(await ayarlarAcik()));
      if (await ayarlarAcik()) await ayarlarKapat();
    }

    // Tab ile dolaşınca odak imzaya hiç gelmiyor
    await evalJs(`document.activeElement?.blur?.(), 1`);
    const tabOdaklari = [];
    for (let i = 0; i < 30; i++) {
      await cdp.gonder('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await cdp.gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      tabOdaklari.push(await evalJs(`(() => { const a = document.activeElement; return a?.closest?.('.karsilama-imza') ? 'IMZA' : (a?.className || a?.tagName || ''); })()`));
    }
    sonuc('Tab ile dolaşınca odak imzaya gelmiyor (odak PDF aç ve araç kartlarında dolaşıyor)', !tabOdaklari.includes('IMZA') && tabOdaklari.some((x) => /karsilama-ac/.test(x)) && tabOdaklari.some((x) => /karsilama-arac/.test(x)), tabOdaklari);
    await evalJs(`document.activeElement?.blur?.(), 1`);

    // Açık temada da: tıklama Hakkında'yı açar, üzerine gelince görüntü aynı
    await temaDegistir();
    await fare('mouseMoved', 200, 200); await bekle(300);
    const onceAcik = await goruntu(kirp);
    await fare('mouseMoved', im.logo.x, im.logo.y); await bekle(400);
    sonuc('[açık tema] Üzerine gelince imzanın görüntüsü değişmiyor', onceAcik === await goruntu(kirp));
    await tikla(im.ad.x, im.ad.y);
    sonuc('[açık tema] "PDEfe" yazısına tıklayınca Ayarlar › Hakkında', (await kosul(`!!document.querySelector('.ayarlar-ortusu')`, 3000)) && (await seciliBolum()) === 'hakkinda');
    await ss('b-hakkinda-acik');
    await ayarlarKapat();
    await temaDegistir();

    // ================================================================ (c) çift tık: açılan pencere hemen kapanmaz
    // İlk tık pencereyi açar; ikinci tık (detail 2) artık pencerenin dışındaki örtüye düşer. ortu.js ve araclar/ortak.js çok tıklamanın
    // sonraki tıklarını kapatma saymaz (0.1.15); inceleme bulgusu: imzaya çift tıklayınca Hakkında bir an görünüp kayboluyordu.
    const ciftTikla = async (x, y) => {
      await fare('mouseMoved', x, y);
      for (const n of [1, 2]) {
        await cdp.gonder('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: n });
        await cdp.gonder('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: n });
        if (n === 1) await bekle(80);
      }
    };
    const ortudeMi = (x, y, sinif) => evalJs(`document.elementFromPoint(${x}, ${y})?.classList.contains(${J(sinif)}) || false`);
    await ciftTikla(im.logo.x, im.logo.y); await bekle(500);
    const ikinciOrtude = await ortudeMi(im.logo.x, im.logo.y, 'ayarlar-ortusu');
    sonuc('İmzaya çift tıklayınca Ayarlar › Hakkında açık kalıyor (ikinci tık örtüye düşse de)', ikinciOrtude && (await ayarlarAcik()) && (await seciliBolum()) === 'hakkinda', { ikinciOrtude, acik: await ayarlarAcik() });
    // Denetim: örtüye tek tık hâlâ kapatır
    await tikla(im.logo.x, im.logo.y); await bekle(400);
    sonuc('Ayarlar açıkken örtüye (imzanın yerine) tek tık yine kapatıyor', !(await ayarlarAcik()));
    if (await ayarlarAcik()) await ayarlarKapat();
    const disli = await evalJs(`(() => { const k = document.querySelector('#dugme-ayarlar').getBoundingClientRect(); return { x: k.left + k.width / 2, y: k.top + k.height / 2 }; })()`);
    await ciftTikla(disli.x, disli.y); await bekle(500);
    const disliOrtude = await ortudeMi(disli.x, disli.y, 'ayarlar-ortusu');
    sonuc('Araç çubuğundaki dişliye çift tıklayınca Ayarlar açık kalıyor', disliOrtude && (await ayarlarAcik()), { disliOrtude, acik: await ayarlarAcik() });
    if (await ayarlarAcik()) await ayarlarKapat();
    // Araç penceresi (araclar/ortak.js, aynı kural): kart pencerenin altında kaldığı için örtüye çift tıklamanın ikinci tıkı doğrudan
    // gönderilir (clickCount 2); kapatmamalı. Ardından tek tık kapatmalı.
    await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir'), 1`);
    await kosul(`!!document.querySelector('.arac-ortusu')`);
    await bekle(400);
    const aracDisi = { x: 40, y: im.imza.y };
    const aracOrtude = await ortudeMi(aracDisi.x, aracDisi.y, 'arac-ortusu');
    for (const tip of ['mousePressed', 'mouseReleased']) await cdp.gonder('Input.dispatchMouseEvent', { type: tip, x: aracDisi.x, y: aracDisi.y, button: 'left', buttons: tip === 'mousePressed' ? 1 : 0, clickCount: 2 });
    await bekle(400);
    sonuc('Araç penceresinin örtüsüne düşen çift tıklamanın ikinci tıkı pencereyi kapatmıyor', aracOrtude && (await evalJs(`!!document.querySelector('.arac-ortusu')`)), { aracOrtude });
    await tikla(aracDisi.x, aracDisi.y);
    sonuc('Araç penceresinin örtüsüne tek tık yine kapatıyor', await kosul(`!document.querySelector('.arac-ortusu')`, 3000));

    // Belge açıkken yeni sekmede (+) açılan başlangıç ekranında da çalışır
    const kucuk = fs.readdirSync(path.join(KOK, 'test', 'pdf')).filter((a) => /\.pdf$/i.test(a)).map((a) => path.join(KOK, 'test', 'pdf', a))
      .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size)[0];
    const kopya = path.join(path.dirname(PNG), 'belge.pdf');
    fs.copyFileSync(kucuk, kopya);
    await evalJs(`window.__pdefe.dosyaAc(${J(kopya)}).then(() => new Promise((r) => setTimeout(r, 800)))`);
    await evalJs(`window.__pdefe.komutCalistir('sekme.yeni'), 1`);
    const yeniSekme = await kosul(`window.__pdefe.belgeler.size === 1 && !document.querySelector('#baslangic').hidden`, 3000);
    const yeni = await imzaOlc();
    await tikla(yeni.logo.x, yeni.logo.y);
    sonuc('Belge açıkken yeni sekmedeki (+) açılış ekranında da imza Hakkında\'yı açıyor', yeniSekme && (await kosul(`!!document.querySelector('.ayarlar-ortusu')`, 3000)) && (await seciliBolum()) === 'hakkinda', { yeniSekme });
    await ayarlarKapat();
  } finally {
    await boyut(0).catch(() => {});
    if (await ayarlarAcik().catch(() => false)) await ayarlarKapat().catch(() => {});
    await hepsiniKapat().catch(() => {});
    cdp.ws.close();
  }
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti; ekran görüntüleri: ${PNG}`);
}
