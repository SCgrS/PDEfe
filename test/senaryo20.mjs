// Senaryo 20 (0.1.14, kullanıcı istekleri): açılış ekranında Son açılanların araçların altına inmesi ("Son açılanlar" başlık, belgeler
// kutunun içinde, 10 belgede kutu da ekran da kaydırılmadan sığar; geniş pencerede iki sütun), sürükle-bırak bilgisinin PDF aç düğmesinin
// içine taşınması ("… PDF'i seçin veya bu pencereye sürükleyin"), içeriğin tam ortada değil biraz yukarıda durması, uygulama adı ve
// sürümünün sağ altta durup pencere boyutuna uyması (içerik sığmazsa içeriğin altında kalır, üstüne binmez); not balonunda "Not | yazar |
// tarih" başlığı; sekmelerin sürüklenirken imleci izlemesi, ötekilerin kayarak yer açması (tarayıcının yarı saydam sürükleme kopyası yok).
// Açık ve koyu temada ekran görüntüleri alınır.
// Kullanım:
//   powershell -File test\baslat_gizli.ps1 -Port 9420 -Veri "%TEMP%\pdefe-s20-9420" -Tema acik      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9420; node test\surucu.mjs betik test\senaryo20.mjs
// Belgeler test/pdf'ten test/cikti/s20/<zaman>/pdf'e kopyalanır (asıllarına yazılmaz); ekran görüntüleri …/png'de.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 's20', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PDF = path.join(K, 'pdf'), PNG = path.join(K, 'png');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
const ACIKLAMA = "Bilgisayarınızdaki bir ya da birkaç PDF'i seçin veya bu pencereye sürükleyin";
// UYAP'tan inen belgelere benzer adlar (uzunları sütunda kısalır)
const ADLAR = ['ustyazi (85).pdf', '(2)TensipZapti (9).pdf', '2099_12_BLR_BILIRKISI_EKRAPORU.pdf', '(3)BilirkisiEkRaporu (4).pdf', '(1)BLR_BILIRKISI_RAPORU.pdf',
  'Tebligat Mazbatası - Ağustos 2026.pdf', 'İcra Emri (Örnek 7) düzeltilmiş.pdf', 'Karar_2026_1234_Esas_2025_987.pdf', 'ustyazi (86).pdf', '(3)DurusmaZapti (12).pdf'];

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
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
  const koyuMu = () => evalJs(`document.documentElement.dataset.tema === 'koyu'`);
  const temaDegistir = async () => { await evalJs(`window.__pdefe.komutCalistir('gorunum.tema'), 1`); await bekle(500); };
  const boyut = async (w, h) => { if (w) await cdp.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false }); else await cdp.gonder('Emulation.clearDeviceMetricsOverride'); await bekle(400); };
  const ss = async (ad, clip) => { await bekle(250); const r = await cdp.gonder('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); fs.writeFileSync(path.join(PNG, ad + '.png'), Buffer.from(r.result.data, 'base64')); };
  const ssIki = async (ad, clip) => { if (await koyuMu()) await temaDegistir(); await ss(ad + '-acik', clip); await temaDegistir(); await ss(ad + '-koyu', clip); await temaDegistir(); };
  const hepsiniKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  const fareOlayi = (type, x, y, buttons) => cdp.gonder('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: 1 });

  // ---------------------------------------------------------------- hazırlık: 10 belge açılıp kapanır → Son açılanlar dolu
  for (const k of [PDF, PNG]) fs.mkdirSync(k, { recursive: true });
  const kucuk = fs.readdirSync(path.join(KOK, 'test', 'pdf')).filter((a) => /\.pdf$/i.test(a)).map((a) => path.join(KOK, 'test', 'pdf', a))
    .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size)[0];
  if (!kucuk) throw new Error('test/pdf altında PDF yok');
  for (const ad of ADLAR) fs.copyFileSync(kucuk, path.join(PDF, ad));
  if (await koyuMu()) await temaDegistir();
  await hepsiniKapat();
  await evalJs(`(async () => { const a = window.__pdefe.ayar(); if (a.sonAcilanlariHatirla === false) { a.sonAcilanlariHatirla = true; await window.pdefe.cagir('ayar:koy', 'sonAcilanlariHatirla', true); } window.__pdefe.komutCalistir('dosya.sonTemizle'); return true; })()`);
  for (const ad of [...ADLAR].reverse()) await evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ad))}).then(() => new Promise((r) => setTimeout(r, 250)))`);
  await hepsiniKapat();
  await kosul(`!document.querySelector('#baslangic').hidden`);
  const surum = (await evalJs(`window.pdefe.cagir('uygulama:bilgi')`))?.surum;

  try {
    // ================================================================ (a) açılış ekranı
    const olc = () => evalJs(`(() => {
      const r = (e) => { if (!e) return null; const k = e.getBoundingClientRect(); return { l: Math.round(k.left * 10) / 10, t: Math.round(k.top * 10) / 10, r: Math.round(k.right * 10) / 10, b: Math.round(k.bottom * 10) / 10, w: Math.round(k.width * 10) / 10, h: Math.round(k.height * 10) / 10 }; };
      const bas = document.querySelector('#baslangic'), br = bas.getBoundingClientRect(), ul = document.querySelector('#son-dosyalar'), us = getComputedStyle(ul);
      const ogeler = [...ul.querySelectorAll('.karsilama-oge')];
      const baslik = document.querySelector('.karsilama-son-ust h2'), temizle = document.querySelector('.karsilama-temizle');
      return {
        alan: { l: br.left, t: br.top, w: bas.clientWidth, h: bas.clientHeight, sw: bas.scrollWidth, sh: bas.scrollHeight, pl: parseFloat(getComputedStyle(bas).paddingLeft), pr: parseFloat(getComputedStyle(bas).paddingRight), pb: parseFloat(getComputedStyle(bas).paddingBottom) },
        karsilama: r(document.querySelector('.karsilama')), ac: r(document.querySelector('.karsilama-ac')), araclar: r(document.querySelector('.karsilama-araclar')),
        son: r(document.querySelector('.karsilama-son')), kutu: r(ul), baslik: r(baslik), baslikMetin: baslik?.textContent, baslikKutuda: ul.contains(baslik), temizle: r(temizle), temizleKutuda: ul.contains(temizle),
        kutuKenar: us.borderTopWidth !== '0px' && us.backgroundColor !== 'rgba(0, 0, 0, 0)', kutuTasma: ul.scrollHeight - ul.clientHeight, kutuKaydirma: us.overflowY, sutun: us.columnCount,
        ogeler: ogeler.map((o) => ({ ad: o.querySelector('.ad').textContent, ...r(o) })),
        imza: r(document.querySelector('.karsilama-imza')), imzaMetin: document.querySelector('.karsilama-imza')?.innerText.replace(/\\s+/g, ' ').trim(), logo: r(document.querySelector('.karsilama-imza .karsilama-logo')),
        eskiBaslik: !!document.querySelector('.karsilama-ust'), eskiIpucu: !!document.querySelector('.karsilama-ipucu'),
        aciklama: document.querySelector('.karsilama-ac .karsilama-aciklama')?.textContent, docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    })()`);

    // Kullanıcının koşulu: 1920×1080 ekran %125 ölçek → 1536×~770 pencere içi (belge alanı ~705 px); 1280×700 daha küçük pencere
    for (const [w, h] of [[1536, 770], [1280, 700], [1920, 1000]]) {
      await boyut(w, h);
      const o = await olc();
      const e = `[${w}×${h}]`;
      sonuc(`${e} PDF aç düğmesinin açıklaması: "${ACIKLAMA}"; ayrı sürükle-bırak satırı ve üstteki ad başlığı yok`, o.aciklama === ACIKLAMA && !o.eskiIpucu && !o.eskiBaslik, { aciklama: o.aciklama, eskiIpucu: o.eskiIpucu, eskiBaslik: o.eskiBaslik });
      sonuc(`${e} Son açılanlar araçların altında, aynı sütunda`, o.son.t >= o.araclar.b + 8 && Math.abs(o.son.l - o.araclar.l) < 1 && Math.abs(o.son.w - o.karsilama.w) < 1, { son: o.son, araclar: o.araclar });
      sonuc(`${e} "Son açılanlar" başlık, kutunun üstünde ve dışında; Listeyi temizle başlık satırında`, o.baslikMetin === 'Son açılanlar' && !o.baslikKutuda && o.baslik.b <= o.kutu.t && !o.temizleKutuda && o.temizle.b <= o.kutu.t && o.temizle.r <= o.kutu.r + 1 && o.kutuKenar,
        { baslik: o.baslik, kutu: o.kutu, temizle: o.temizle, kutuKenar: o.kutuKenar });
      sonuc(`${e} 10 belge kutuda, kutu kaydırılmıyor (taşma yok, kaydırma çubuğu yok), iki sütun`, o.ogeler.length === 10 && o.kutuTasma <= 0 && o.kutuKaydirma !== 'auto' && o.kutuKaydirma !== 'scroll' && o.sutun === '2'
        && o.ogeler.every((g) => g.b <= o.kutu.b + 0.5 && g.t >= o.kutu.t - 0.5 && g.r <= o.kutu.r + 0.5), { adet: o.ogeler.length, tasma: o.kutuTasma, kaydirma: o.kutuKaydirma, sutun: o.sutun });
      const solSutun = o.ogeler.slice(0, 5), sagSutun = o.ogeler.slice(5);
      sonuc(`${e} Sıra yukarıdan aşağı: 1–5 sol sütunda, 6–10 sağ sütunda (en yenisi sol üstte)`, o.ogeler[0].ad === ADLAR[0] && solSutun.every((g, i) => i === 0 || g.t > solSutun[i - 1].t) && sagSutun.every((g) => g.l > solSutun[0].r - 1) && Math.abs(sagSutun[0].t - solSutun[0].t) < 1,
        o.ogeler.map((g) => [g.ad, g.l, g.t]));
      sonuc(`${e} Açılış ekranı kaydırılmadan sığıyor (10 belgeyle)`, o.alan.sh <= o.alan.h && o.alan.sw <= o.alan.w && o.docScroll <= 0, o.alan);
      const ust = o.karsilama.t - o.alan.t, alt = o.imza.t - o.karsilama.b;
      // Boş yer azsa boşluklar en az değerlerinde (üst 20, alt 28 px; 0.1.21'den beri 780 px'e dek alçak pencerede üst 12, alt 16 px: sekme
      // çubuğu açılış ekranında da görünür) kalabilir; yoksa alt boşluk üsttekinin iki katı
      const alcak = (await evalJs('innerHeight')) <= 780, enAzUst = alcak ? 12 : 20, enAzAlt = alcak ? 16 : 28;
      sonuc(`${e} İçerik ortanın üstünde: üst boşluk alttakinin yarısı kadar (tam ortada değil)`, ust >= enAzUst - 0.5 && ust < alt && (ust <= enAzUst + 0.5 || alt <= enAzAlt + 0.5 || Math.abs(alt - 2 * ust) < 3), { ust, alt, alcak });
      sonuc(`${e} Ad ve sürüm sağ altta: "PDEfe · PDF görüntüleyici ve düzenleyici · sürüm ${surum}", logo yanında`,
        Math.abs(o.imza.r - (o.alan.l + o.alan.w - o.alan.pr)) < 1.5 && Math.abs(o.imza.b - (o.alan.t + o.alan.h - o.alan.pb)) < 1.5 && o.imzaMetin === `PDEfe PDF görüntüleyici ve düzenleyici · sürüm ${surum}` && o.logo.w >= 24 && o.logo.r <= o.imza.l + o.logo.w + 1,
        { imza: o.imza, alan: o.alan, metin: o.imzaMetin });
      if (w === 1536) await ssIki('a-acilis-1536');
      if (w === 1920) await ss('a-acilis-1920-acik');
    }
    // Pencere küçülünce: içerik sığmazsa ekran kayar, imza içeriğin altında kalır (üstüne binmez), sağa yaslı kalır; iki sütun dar pencerede tek
    for (const [w, h] of [[1024, 640], [760, 560], [520, 520]]) {
      await boyut(w, h);
      const o = await olc();
      const e = `[${w}×${h}]`;
      sonuc(`${e} İmza içeriğin altında (üst üste binmez), sağ kenarda; yatay taşma yok`, o.imza.t >= o.karsilama.b + 9 && Math.abs(o.imza.r - (o.alan.l + o.alan.w - o.alan.pr)) < 1.5 && o.alan.sw <= o.alan.w && o.docScroll <= 0, { imza: o.imza, karsilama: o.karsilama, alan: o.alan });
      sonuc(`${e} Son açılanlar ${w >= 700 ? 'iki' : 'tek'} sütun, kutu kaydırılmıyor`, o.sutun === (w >= 700 ? '2' : '1') && o.kutuTasma <= 0, { sutun: o.sutun, tasma: o.kutuTasma });
      if (o.alan.sh > o.alan.h) bilgi(`${e}: içerik sığmıyor, açılış ekranı kayıyor (${o.alan.sh} > ${o.alan.h}); imza en altta`);
      await ss(`a-acilis-${w}x${h}-acik`);
    }
    // Kaydırıp en alta inince imza görünür ve sağ altta
    await evalJs(`(() => { const b = document.querySelector('#baslangic'); b.scrollTop = b.scrollHeight; return true; })()`); await bekle(200);
    const altta = await evalJs(`(() => { const b = document.querySelector('#baslangic').getBoundingClientRect(), i = document.querySelector('.karsilama-imza').getBoundingClientRect(); return { gorunur: i.bottom <= b.bottom + 0.5 && i.top >= b.top, sag: Math.round(b.right - i.right) }; })()`);
    sonuc('[520×520] En alta kaydırınca imza görünür, sağ altta', altta.gorunur && altta.sag >= 24, altta);
    await ss('a-acilis-520-alt-acik');
    await evalJs(`document.querySelector('#baslangic').scrollTop = 0, 1`);
    await boyut(0);

    // ================================================================ (b) not balonu başlığı: "Not | yazar | tarih"
    await evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ADLAR[0]))}).then(() => new Promise((r) => setTimeout(r, 1500)))`);
    const notKoy = (yazar) => evalJs(`(() => { const b = window.__pdefe.aktif(); window.__pdefe.ayar().yazarAdi = ${J(yazar)}; const r = b.gorunum.sayfalar[0].el.getBoundingClientRect(); b.notlar.balonKapat(); b.notlar.sayfayaNotKoy(0, { clientX: r.left + 160, clientY: r.top + 140 }); return true; })()`);
    const baslik = () => evalJs(`(() => { const u = document.querySelector('.not-balonu .ust'); const r = (e) => { const k = e.getBoundingClientRect(); return { l: Math.round(k.left * 10) / 10, r: Math.round(k.right * 10) / 10, w: Math.round(k.width * 10) / 10, h: Math.round(k.height * 10) / 10 }; };
      return { parcalar: [...u.children].map((e) => ({ s: e.className, m: e.textContent.trim(), ...r(e), ipucu: e.title || '', tasma: e.scrollWidth > e.clientWidth })), ust: r(u) }; })()`);
    await notKoy('Deneme Yazar'); await bekle(500);
    let b = await baslik();
    const sira = b.parcalar.map((p) => p.s);
    sonuc('Not balonu başlığı: renk, "Not", çizgi, yazar, çizgi, tarih, boşluk, sil, kapat', J(sira) === J(['renk', 'tur', 'ayrac', 'yazar', 'ayrac', 'tarih', 'esnek', 'ikon kucuk sil', 'ikon kucuk kapat']) && b.parcalar[1].m === 'Not' && b.parcalar[3].m === 'Deneme Yazar' && /^\d\d\.\d\d\.\d{4} \d\d:\d\d$/.test(b.parcalar[5].m), sira);
    const p = Object.fromEntries(b.parcalar.map((x, i) => [x.s + (x.s === 'ayrac' ? i : ''), x]));
    sonuc('Çizgiler ince ve dikey (1 px × 12 px), parçaların arasında; tarih yazarın hemen yanında, düğmeler sağda',
      p.ayrac2.w === 1 && p.ayrac2.h === 12 && p.ayrac4.w === 1 && p.ayrac2.l > p.tur.r && p.ayrac2.r < p.yazar.l && p.ayrac4.l > p.yazar.r && p.ayrac4.r < p.tarih.l && p.tarih.l - p.yazar.r <= 16 && p['ikon kucuk kapat'].r >= b.ust.r - 10,
      b.parcalar);
    await ssIki('b-not-balonu', await evalJs(`(() => { const r = document.querySelector('.not-balonu').getBoundingClientRect(); return { x: r.left - 8, y: r.top - 8, width: r.width + 16, height: r.height + 16 }; })()`));
    // Uzun yazar adı: yalnızca yazar kısalır (tam adı ipucunda), tarih ve düğmeler tam
    await notKoy('Av. Uzun Adlı Deneme Yazar Soyadı'); await bekle(500);
    b = await baslik();
    const y = b.parcalar.find((x) => x.s === 'yazar'), t = b.parcalar.find((x) => x.s === 'tarih'), dugmeler = b.parcalar.filter((x) => /ikon/.test(x.s));
    sonuc('Uzun yazar adı üç noktayla kısalır, tam adı ipucunda; tarih ve düğmeler daralmaz', y.tasma && y.ipucu === 'Av. Uzun Adlı Deneme Yazar Soyadı' && !t.tasma && dugmeler.every((d) => d.w === 26) && dugmeler.at(-1).r <= b.ust.r, { y, t, dugmeler });
    // Yazarsız not: çift çizgi yok
    await notKoy(''); await bekle(500);
    b = await baslik();
    sonuc('Yazarsız notta başlık "Not | tarih" (fazladan çizgi yok)', J(b.parcalar.map((x) => x.s).filter((s) => /^(tur|yazar|tarih|ayrac)$/.test(s))) === J(['tur', 'ayrac', 'tarih']), b.parcalar.map((x) => x.s));
    await evalJs(`(() => { window.__pdefe.aktif().notlar.balonKapat(); window.__pdefe.ayar().yazarAdi = 'Deneme Yazar'; return true; })()`);

    // ================================================================ (c) sekme sürükleme
    for (const ad of ADLAR.slice(1, 5)) await evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ad))}).then(() => new Promise((r) => setTimeout(r, 400)))`);
    const sekmeler = () => evalJs(`({ model: window.__pdefe.sekmeler.sekmeler.map((s) => s.ad), dom: [...document.querySelectorAll('.sekme .ad')].map((a) => a.textContent) })`);
    const once = await sekmeler();
    await evalJs(`window.__pdefe.sekmeSec(window.__pdefe.sekmeler.sekmeler[0].id), 1`); await bekle(300);
    const k = await evalJs(`[...document.querySelectorAll('.sekme')].map((s) => { const r = s.getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2), l: r.left, t: r.top, sag: Math.round(r.right - 20) }; })`);
    await fareOlayi('mouseMoved', k[0].x, k[0].y, 0);
    await fareOlayi('mousePressed', k[0].x, k[0].y, 1);
    const hedefX = k[2].sag;
    for (let i = 1; i <= 12; i++) await fareOlayi('mouseMoved', k[0].x + ((hedefX - k[0].x) * i) / 12, k[0].y + (i > 6 ? 40 : 0), 1);
    await bekle(300);
    const ortada = await evalJs(`(() => { const t = document.querySelector('.sekme.tasiniyor'), r = t.getBoundingClientRect(), cs = getComputedStyle(t);
      return { l: r.left, t: r.top, opaklik: cs.opacity, golge: cs.boxShadow !== 'none', kaymis: [...document.querySelectorAll('.sekme:not(.tasiniyor)')].map((s) => s.style.transform), draggable: [...document.querySelectorAll('.sekme')].some((s) => s.draggable) }; })()`);
    const cubuk = await evalJs(`(() => { const r = document.querySelector('#sekme-cubugu').getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 44), width: Math.min(innerWidth, 900), height: r.height + 88 }; })()`);
    await ss('c-surukleme-ortasi-acik', cubuk);
    await temaDegistir(); await ss('c-surukleme-ortasi-koyu', cubuk); await temaDegistir();   // sürükleme sürerken tema değişir
    sonuc('Sürüklenen sekme imleci yatayda izler, çubuktan inmez (imleç aşağı insede); opak, gölgeli; tarayıcı sürüklemesi yok',
      Math.abs(ortada.l - (hedefX - 40)) <= 1.5 && Math.abs(ortada.t - k[0].t) <= 1 && ortada.opaklik === '1' && ortada.golge && !ortada.draggable, ortada);
    sonuc('Aradaki iki sekme bir sekme boyu sola kayarak yer açtı, ötekiler yerinde', J(ortada.kaymis.map((x) => !!x)) === J([true, true, false, false]) && ortada.kaymis[0] === ortada.kaymis[1] && /translateX\(-\d/.test(ortada.kaymis[0]), ortada.kaymis);
    await fareOlayi('mouseReleased', hedefX, k[0].y + 40, 0);
    await bekle(60);
    const yerlesirken = await evalJs(`!!document.querySelector('.sekme.tasiniyor.yerlesiyor')`);
    await bekle(400);
    const sonra = await sekmeler();
    const izler = await evalJs(`[...document.querySelectorAll('.sekme')].filter((s) => s.style.transform || s.classList.contains('tasiniyor')).length + (document.querySelector('#sekme-liste').classList.contains('siralaniyor') ? 1 : 0)`);
    sonuc('Bırakınca sekme açılan yere kayarak oturur (geçiş), sonra sıra kalıcı: 2, 3, 1, 4, 5', yerlesirken && J(sonra.model) === J([once.model[1], once.model[2], once.model[0], ...once.model.slice(3)]) && J(sonra.dom) === J(sonra.model) && izler === 0, { yerlesirken, sonra, izler });
    await ss('c-surukleme-sonrasi-acik', cubuk);
  } finally {
    await boyut(0).catch(() => {});
    await hepsiniKapat().catch(() => {});
    cdp.ws.close();
  }
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti; ekran görüntüleri: ${PNG}`);
}
