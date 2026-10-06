// Seçili sekme ile araç çubuğunun birleşimi (0.2.3, kullanıcı isteği: "araç şeridi ile sekme şeridinin yerini değiştirelim"; "seçili sekmenin
// seçili olduğunu gösteren renk ile araç çubuğunun rengi eşit olsun. seçili sekme ile araç çubuğu arasında herhangi bir çizgi olmasın.
// sekmenin parçasıymış gibi olsun"). Denetlenenler:
//   1) Sıra: sekme şeridi pencerenin en üstünde, araç çubuğu hemen altında, belge alanı onun altında; güncelleme şeridi araç çubuğunun altında.
//   2) Renk: araç çubuğu seçili sekmenin renginde (--sekme-aktif: açık temada #ffffff, koyu temada #2b2b2b); sekme şeridi --arka (farklı).
//   3) Çizgi yok: seçili sekmenin alt kenarı araç çubuğunun üst kenarıyla aynı yerde; ekran görüntüsünde (Page.captureScreenshot, cihaz
//      pikseli) seçili sekmenin ortasından ve iki kenarına yakın sütunlardan sınırın 6 px üstünden 3 px altına dek her piksel satırı araç
//      çubuğunun renginde (kesirli pikselde kalan ince dikiş ya da açık renk boşluk bu satırlarda görünürdü). Sekme şeridinin boş yerinde
//      sekme rengi ile araç çubuğu rengi arasında ara renkli satır (çizgi) yok.
//   4) Açık ve koyu tema; seçili sekme ilk / ikinci belge ve açılış sekmesi; Mac düzeni (html[data-platform="mac"]) aynı ölçüler.
//   5) Açık belgeler listesi sekme şeridinin hemen altında, düğmesinin altında açılır.
// Ekran ölçeği başlatırken verilir; denetim üç ölçekte koşulur (%100, %125, %150):
//   powershell -File test\baslat.ps1 -Port 9622 -Veri "%TEMP%\pdefe-sb-9622" -Boyut "1280,800" -Olcek 1      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9622; node test\surucu.mjs betik test\serit_birlesim.mjs
//   (aynısı -Olcek 1.25 ve -Olcek 1.5 ile; her ölçekte yeni örnek)   powershell -File test\durdur.ps1 -SurecId <PID>
// Ekran görüntüleri test/cikti/serit-birlesim/<ölçek>-<tema>-<durum>.png (bakarak denetim için).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(KOK, 'test', 'pdf');
const CIKTI = path.join(KOK, 'test', 'cikti', 'serit-birlesim');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
const TOLERANS = 2;   // renk kanalı başına (0–255); sıkıştırmasız PNG'de düz zemin birebir aynıdır, pay yalnızca güvenlik için

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const bilgi = (s) => console.log(`     · ${s}`);

/** PNG çözücü (8 bit RGB / RGBA, taramasız; CDP'nin ekran görüntüsü böyledir). Döner: { en, boy, piksel(x, y) → [r, g, b] }. */
export function pngCoz(tampon) {
  if (tampon.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG değil');
  let i = 8, en = 0, boy = 0, derinlik = 0, tur = 0, tarama = 0;
  const veri = [];
  while (i < tampon.length) {
    const uzunluk = tampon.readUInt32BE(i), ad = tampon.toString('ascii', i + 4, i + 8), parca = tampon.subarray(i + 8, i + 8 + uzunluk);
    if (ad === 'IHDR') { en = parca.readUInt32BE(0); boy = parca.readUInt32BE(4); derinlik = parca[8]; tur = parca[9]; tarama = parca[12]; }
    else if (ad === 'IDAT') veri.push(parca);
    else if (ad === 'IEND') break;
    i += 12 + uzunluk;
  }
  if (derinlik !== 8 || (tur !== 2 && tur !== 6) || tarama !== 0) throw new Error(`Desteklenmeyen PNG: derinlik ${derinlik}, tür ${tur}, tarama ${tarama}`);
  const bp = tur === 6 ? 4 : 3, satir = en * bp, ham = zlib.inflateSync(Buffer.concat(veri)), cikti = Buffer.alloc(satir * boy);
  for (let y = 0; y < boy; y++) {
    const suzgec = ham[y * (satir + 1)], kaynak = y * (satir + 1) + 1, hedef = y * satir;
    for (let x = 0; x < satir; x++) {
      const a = x >= bp ? cikti[hedef + x - bp] : 0, b = y ? cikti[hedef - satir + x] : 0, c = x >= bp && y ? cikti[hedef - satir + x - bp] : 0;
      let d = ham[kaynak + x];
      if (suzgec === 1) d += a;
      else if (suzgec === 2) d += b;
      else if (suzgec === 3) d += (a + b) >> 1;
      else if (suzgec === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); d += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cikti[hedef + x] = d & 255;
    }
  }
  return { en, boy, piksel: (x, y) => { const k = y * satir + x * bp; return [cikti[k], cikti[k + 1], cikti[k + 2]]; } };
}
const renkCoz = (css) => (css.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
const ayniRenk = (a, b) => a.every((v, k) => Math.abs(v - b[k]) <= TOLERANS);
const hex = (r) => '#' + r.map((v) => v.toString(16).padStart(2, '0')).join('');

/** Sürekli CDP oturumu: ekran görüntüsü ve konsol olayları. */
async function cdpOturumu() {
  const hedefler = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const sayfa = hedefler.find((h) => h.type === 'page' && h.url.startsWith('pdefe://app/src/renderer/index.html'));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map(), olaylar = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } else if (d.method) olaylar.push(d); };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder, olaylar };
}

export default async function ({ evalJs, bekle }) {
  const cdp = await cdpOturumu();
  await cdp.gonder('Runtime.enable'); await cdp.gonder('Log.enable');
  const kosul = async (ifade, sure = 15000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
  fs.mkdirSync(CIKTI, { recursive: true });
  const dpr = await evalJs('devicePixelRatio');
  const olcekAdi = '%' + Math.round(dpr * 100);
  console.log(`Ekran ölçeği ${olcekAdi} (devicePixelRatio ${dpr}), pencere içi ${await evalJs('innerWidth + "×" + innerHeight')}`);
  const ilkTema = await evalJs(`document.documentElement.dataset.tema`);

  const olc = () => evalJs(`(() => {
    const r = (s) => { const e = typeof s === 'string' ? document.querySelector(s) : s; if (!e) return null; const k = e.getBoundingClientRect(); return { l: k.left, t: k.top, r: k.right, b: k.bottom, w: k.width, h: k.height }; };
    const bg = (s) => getComputedStyle(document.querySelector(s)).backgroundColor;
    const kok = getComputedStyle(document.documentElement);
    const sira = [...document.querySelector('#uygulama').children].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.id).filter(Boolean);
    return { sekmeCubugu: r('#sekme-cubugu'), arac: r('#arac-cubugu'), sekme: r('.sekme.aktif'), govde: r('#govde'), esnek: r('#sekme-cubugu > .esnek'),
      sira, seritSiniri: getComputedStyle(document.querySelector('#sekme-cubugu')).borderBottomWidth, aracUstKenar: getComputedStyle(document.querySelector('#arac-cubugu')).borderTopWidth,
      sekmeAltKenar: getComputedStyle(document.querySelector('.sekme.aktif')).borderBottomWidth,
      renk: { arac: bg('#arac-cubugu'), sekme: bg('.sekme.aktif'), serit: bg('#sekme-cubugu'), sekmeAktif: kok.getPropertyValue('--sekme-aktif').trim(), arka: kok.getPropertyValue('--arka').trim() },
      guncellemeSonra: (() => { const g = document.querySelector('#guncelleme-seridi'), a = document.querySelector('#arac-cubugu'); return !!(a.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING) && a.nextElementSibling === g; })(),
      tema: document.documentElement.dataset.tema, ad: document.querySelector('.sekme.aktif .ad')?.textContent };
  })()`);

  /** Ekran görüntüsünde sınır satırlarını sayar. Döner: { sutunlar: [{ ad, x, sapan: [satır…] }], bos: { gecis } }. */
  const pikselDenetimi = async (o, dosyaAdi) => {
    const r = await cdp.gonder('Page.captureScreenshot', { format: 'png' });
    const tampon = Buffer.from(r.result.data, 'base64');
    fs.writeFileSync(path.join(CIKTI, dosyaAdi), tampon);
    const g = pngCoz(tampon);
    const sinir = Math.round(o.arac.t * dpr);                   // araç çubuğunun ilk piksel satırı (cihaz pikseli)
    const ust = Math.max(0, sinir - Math.round(6 * dpr)), alt = Math.min(g.boy, sinir + Math.round(3 * dpr));   // eski düzende sınır 0'dı
    const aracRenk = renkCoz(o.renk.arac), seritRenk = renkCoz(o.renk.serit);
    const sutunlar = [['sol kenara yakın', o.sekme.l + 2], ['orta', o.sekme.l + o.sekme.w / 2], ['sağ kenara yakın', o.sekme.r - 2]].map(([ad, x]) => {
      const px = Math.round(x * dpr), sapan = [];
      for (let y = ust; y < alt; y++) { const p = g.piksel(px, y); if (!ayniRenk(p, aracRenk)) sapan.push({ y, sinira: y - sinir, renk: hex(p) }); }
      return { ad, x: px, sapan };
    });
    // Sekme şeridinin boş yeri: sınırın üstü şerit renginde, altı araç çubuğu renginde; arada başka renkte satır (çizgi, yumuşatma) yok
    let bos = null;
    if (o.esnek && o.esnek.w > 4) {
      const px = Math.round((o.esnek.l + o.esnek.w / 2) * dpr), satirlar = [];
      for (let y = ust; y < alt; y++) satirlar.push(hex(g.piksel(px, y)));
      const ara = satirlar.filter((h, k) => !ayniRenk(g.piksel(px, ust + k), aracRenk) && !ayniRenk(g.piksel(px, ust + k), seritRenk));
      const ilkArac = satirlar.findIndex((h, k) => ayniRenk(g.piksel(px, ust + k), aracRenk));
      bos = { x: px, ara, gecis: ilkArac < 0 ? null : ust + ilkArac - sinir };
    }
    return { en: g.en, boy: g.boy, sinir, sutunlar, bos };
  };

  const durumDenetle = async (etiket, dosyaAdi) => {
    await bekle(400);
    const o = await olc();
    const ad = `[${olcekAdi}, ${o.tema === 'koyu' ? 'koyu' : 'açık'} tema, ${etiket}]`;
    sonuc(`${ad} sıra: sekme şeridi en üstte, araç çubuğu altında, belge alanı onun altında; güncelleme şeridi araç çubuğunun ardında`,
      o.sekmeCubugu.t === 0 && o.sekmeCubugu.h === 40 && o.arac.t === o.sekmeCubugu.b && o.arac.h === 40 && Math.abs(o.govde.t - o.arac.b) < 0.5
      && J(o.sira.slice(0, 2)) === J(['sekme-cubugu', 'arac-cubugu']) && o.guncellemeSonra, { sira: o.sira, sekmeCubugu: o.sekmeCubugu, arac: o.arac, govde: o.govde.t });
    const beklenen = o.tema === 'koyu' ? 'rgb(43, 43, 43)' : 'rgb(255, 255, 255)';
    sonuc(`${ad} araç çubuğu seçili sekmenin renginde (${beklenen}); sekme şeridi --arka, ondan farklı`,
      o.renk.arac === o.renk.sekme && o.renk.arac === beklenen && o.renk.serit !== o.renk.arac && renkCoz(o.renk.serit).join() === renkCoz(hexRgb(o.renk.arka)).join(), o.renk);
    sonuc(`${ad} seçili sekmenin altı araç çubuğunun üstüne oturur: arada boşluk ve kenar çizgisi yok`,
      o.sekme.h === 36 && o.sekme.b === o.arac.t && o.seritSiniri === '0px' && o.aracUstKenar === '0px' && o.sekmeAltKenar === '0px',
      { sekme: o.sekme, aracUst: o.arac.t, seritSiniri: o.seritSiniri, aracUstKenar: o.aracUstKenar, sekmeAltKenar: o.sekmeAltKenar });
    const p = await pikselDenetimi(o, dosyaAdi);
    sonuc(`${ad} ekran görüntüsü cihaz pikseliyle (${p.en}×${p.boy})`, p.en === Math.round(o.sekmeCubugu.w * dpr), { en: p.en, bekl: o.sekmeCubugu.w * dpr });
    for (const s of p.sutunlar) {
      sonuc(`${ad} piksel: seçili sekmenin ${s.ad} sütunu (x ${s.x}), sınırın ${Math.round(6 * dpr)} satır üstünden ${Math.round(3 * dpr)} satır altına dek hepsi araç çubuğu renginde (çizgi / dikiş yok)`,
        s.sapan.length === 0, s.sapan.slice(0, 6));
    }
    if (p.bos) {
      sonuc(`${ad} piksel: sekme şeridinin boş yerinde şerit rengi doğrudan araç çubuğu rengine geçer (ara renkli satır yok), geçiş tam sınırda`,
        p.bos.ara.length === 0 && p.bos.gecis === 0, p.bos);
    }
    bilgi(`${dosyaAdi}: sınır satırı ${p.sinir} (CSS ${o.arac.t} × ${dpr}), sekme "${o.ad}" ${Math.round(o.sekme.l)}–${Math.round(o.sekme.r)} px`);
    return o;
  };
  // '#rrggbb' → 'rgb(r, g, b)'
  function hexRgb(h) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim()); return m ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})` : h; }

  try {
    await evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
    const kimlikler = [];
    for (const ad of ['mevzuat_4721_TMK.pdf', 'mevzuat_6102_TTK.pdf']) {
      kimlikler.push(await evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ad))}).then((b) => b?.id ?? null)`));
      await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
    }
    await bekle(800);
    sonuc('İki belge açıldı', kimlikler.every((k) => k != null), kimlikler);
    const ad = Math.round(dpr * 100);
    for (const tema of ['acik', 'koyu']) {
      if ((await evalJs(`document.documentElement.dataset.tema`)) !== tema) { await evalJs(`window.__pdefe.komutCalistir('gorunum.tema'), 1`); await bekle(300); }
      await evalJs(`window.__pdefe.sekmeSec(${J(kimlikler[0])}).then(() => 1)`);
      await durumDenetle('ilk sekme seçili', `${ad}-${tema}-ilk.png`);
      await evalJs(`window.__pdefe.sekmeSec(${J(kimlikler[1])}).then(() => 1)`);
      await durumDenetle('ikinci sekme seçili', `${ad}-${tema}-ikinci.png`);
      // Açılış sekmesi (yeni boş sekme): açılış ekranı; araç çubuğu belgesiz
      await evalJs(`window.__pdefe.komutCalistir('sekme.yeni'), 1`);
      await kosul(`!!document.querySelector('.sekme.aktif.baslangic-sekmesi')`, 5000);
      await durumDenetle('açılış sekmesi seçili', `${ad}-${tema}-acilis.png`);
      await evalJs(`window.__pdefe.komutCalistir('sekme.kapat'), 1`);
      await kosul(`!document.querySelector('.sekme.baslangic-sekmesi')`, 5000);
    }
    // Mac düzeni: menü düğmesi yok, ölçüler aynı (yerel başlık çubuğu pencere içeriğinin dışında)
    await evalJs(`document.documentElement.dataset.platform = 'mac', 1`);
    await durumDenetle('Mac düzeni', `${ad}-koyu-mac.png`);
    await evalJs(`(delete document.documentElement.dataset.platform, 1)`);

    // Açık belgeler listesi: sekme şeridinin sağındaki düğmenin altında, şeridin hemen altında (0.2.2'ye dek iki şeridin altındaydı)
    await evalJs(`(document.querySelector('#sekme-acilir').click(), 1)`);
    await bekle(300);
    const liste = await evalJs(`(() => { const l = document.querySelector('#belge-listesi'), d = document.querySelector('#sekme-acilir').getBoundingClientRect(), s = document.querySelector('#sekme-cubugu').getBoundingClientRect();
      if (l.hidden) return null; const r = l.getBoundingClientRect(); return { ust: r.top, sag: r.right, seritAlt: s.bottom, dugmeSag: d.right, dugmeSol: d.left }; })()`);
    sonuc('Açık belgeler listesi sekme şeridinin hemen altında, düğmesinin altında (sağ kenarı düğmeyle hizalı ±8 px)',
      liste && liste.ust === liste.seritAlt && liste.sag >= liste.dugmeSol && Math.abs(liste.sag - liste.dugmeSag) <= 8, liste);
    await evalJs(`(window.__pdefe.sekmeler.belgeListesiKapat(), 1)`);
  } finally {
    if ((await evalJs(`document.documentElement.dataset.tema`)) !== ilkTema) await evalJs(`window.__pdefe.komutCalistir('gorunum.tema'), 1`);
    const hatalar = cdp.olaylar.filter((x) => x.method === 'Runtime.exceptionThrown' || (x.method === 'Runtime.consoleAPICalled' && x.params.type === 'error')
      || (x.method === 'Log.entryAdded' && x.params.entry.level === 'error'))
      .map((x) => x.params.exceptionDetails?.exception?.description || x.params.exceptionDetails?.text || x.params.entry?.text || x.params.args?.map((a) => a.value ?? a.description).join(' '));
    sonuc('Konsolda hata yok', hatalar.length === 0, hatalar);
    cdp.ws.close();
  }
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti  (ekran görüntüleri: ${CIKTI})`);
  if (hataSayisi) process.exitCode = 1;
}
