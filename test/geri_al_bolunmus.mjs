// Geri al'ın bölünmüş düğmesi (0.2.3, kullanıcı isteği: "geri alınacak adım butonu geri al butonunun bir parçası gibi durmalı, biraz daha
// küçük olmalı. wordde öyle"). Geri al ile ▾'si (geri alınacak adımların listesi, 0.2.2) tek düğme gibi:
//   1) Yapı: ikisi bir kapta (.bolunmus), ▾ Geri al'ın hemen sağında, aralarında boşluk yok; ▾ 13 px (0.2.2'de 21), oku 10 px; aynı
//      yükseklikte; dış köşeler yuvarlak, iç köşeler düz. Yakınlaştırmanın ▾'si 21 px kaldı, Yinele'de ok yok.
//   2) Devre dışıyken ikisi birlikte soluk (0.35), üzerine gelince vurgulanmaz, ayırıcı yok.
//   3) Gerçek fareyle (CDP Input): imleç bir yarının üstündeyken iki yarı birlikte vurgulanır, üzerindeki yarı daha koyu, aralarında ayırıcı
//      görünür; imleç çıkınca vurgu ve ayırıcı kalkar. Ekran görüntüsünden piksel ölçümü (%100 ölçekte): ayırıcı > üzerindeki yarı > öteki
//      yarı > araç çubuğu (araç çubuğu renginden uzaklık), açık ve koyu temada.
//   4) Basılı: basılan yarı en koyu, öteki açık vurgulu; düğmenin dışında bırakılınca hiçbir şey olmaz (geri alınmaz, liste açılmaz).
//      Liste açıkken ▾ en koyu, Geri al açık vurgulu, ayırıcı görünür (imleç listedeyken de); Esc kapatır, vurgu kalkar.
//   5) Klavye ve ekran okuyucu değişmedi: ▾'de Enter listeyi açar (aria-expanded true), Esc kapatır, odak ▾'de; aria-haspopup "dialog".
//   6) Dar pencerede ▾ küçülür ama tıklanır kalır: 3. sıkışma kademesinden başlayarak 12 px, 6. kademede 11 px, oku 9 px; gerçek tıklama
//      listeyi açar. Windows'un en dar penceresinde (içi 704 px) 5. kademe yetiyor. Araç çubuğu taşmaz (ayrıntı test/serit_olculeri.mjs).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9640 -Veri "%TEMP%\pdefe-gb-9640" -Boyut "1280,800" -Olcek 1      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9640; node test\surucu.mjs betik test\geri_al_bolunmus.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Piksel ölçümü %100 ölçekte yapılır (başka ölçekte yalnızca görüntü kaydedilir). Görüntüler test/cikti/geri-al-bolunmus altına.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngCoz } from './serit_birlesim.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(KOK, 'test', 'pdf');
const CIKTI = path.join(KOK, 'test', 'cikti', 'geri-al-bolunmus');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const bilgi = (s) => console.log(`     · ${s}`);
const renk = (css) => (css.match(/[\d.]+/g) || []).map(Number);   // 'rgba(0, 0, 0, 0.1)' → [0, 0, 0, 0.1]
const saydam = (css) => css === 'rgba(0, 0, 0, 0)' || css === 'transparent';

/** Sürekli CDP oturumu: genişlik taklidi, ekran görüntüsü, konsol olayları. */
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

export default async function ({ evalJs, bekle, fare, tikla, tus }) {
  const cdp = await cdpOturumu();
  await cdp.gonder('Runtime.enable'); await cdp.gonder('Log.enable');
  fs.mkdirSync(CIKTI, { recursive: true });
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
  const genislik = async (w) => { if (w) await cdp.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: 700, deviceScaleFactor: 0, mobile: false }); else await cdp.gonder('Emulation.clearDeviceMetricsOverride'); await bekle(400); };
  const dpr = await evalJs('devicePixelRatio');
  const ilkTema = await evalJs(`document.documentElement.dataset.tema`);

  /** İki yarının ölçüleri ve hesaplanmış biçimi; ayırıcı ::before'un saydamlığı. */
  const durum = () => evalJs(`(() => {
    const g = document.querySelector('#dugme-geri-al'), o = document.querySelector('#dugme-geri-al-liste'), k = g.parentElement;
    const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const cs = (e) => getComputedStyle(e);
    return { kap: k.className, ayniKap: o.parentElement === k, ardinda: g.nextElementSibling === o, kapGrupta: k.parentElement.classList.contains('grup'),
      g: { ...r(g), bg: cs(g).backgroundColor, op: cs(g).opacity, radius: cs(g).borderRadius, devre: g.disabled },
      o: { ...r(o), bg: cs(o).backgroundColor, op: cs(o).opacity, radius: cs(o).borderRadius, devre: o.disabled, svg: r(o.querySelector('svg')), expanded: o.getAttribute('aria-expanded'), haspopup: o.getAttribute('aria-haspopup'), title: o.title },
      ayirici: getComputedStyle(o, '::before').opacity, ayiriciW: getComputedStyle(o, '::before').width,
      zoomOk: document.querySelector('#dugme-zoom-secenek').getBoundingClientRect().width, yineleOk: !!document.querySelector('#dugme-yinele').nextElementSibling?.classList.contains('acilir'),
      sinif: document.querySelector('#arac-cubugu').className, liste: window.__pdefe.gecmisListesi.acik || null, konum: window.__pdefe.aktif()?.yigin?.konum ?? null,
      odak: document.activeElement?.id || null, aracBg: cs(document.querySelector('#arac-cubugu')).backgroundColor };
  })()`);
  const merkez = (d, yari) => [Math.round(d[yari].l + d[yari].w / 2), Math.round(d[yari].t + d[yari].h / 2)];
  // İmleç düğmeden uzağa; odak belgeye (Esc listeyi kapatınca odak ▾'ye döner, odak halkası piksel ölçümüne karışmasın)
  const disari = async () => {
    const d = await durum(); await fare([{ tur: 'hareket', x: Math.round(d.o.r + 300), y: Math.round(d.o.b + 200) }]);
    await evalJs(`(window.__pdefe.aktif()?.gorunum.kaydirici.focus({ preventScroll: true }), 1)`); await bekle(150);
  };

  /** Ekran görüntüsünden (%100'de) ayırıcı ve iki yarının araç çubuğu renginden uzaklığı; başka ölçekte yalnızca görüntü kaydedilir. */
  const piksel = async (d, ad) => {
    const kirp = { x: Math.max(0, d.g.l - 8), y: Math.max(0, d.g.t - 4), width: d.o.r - d.g.l + 40, height: d.g.h + 8 };
    const r = await cdp.gonder('Page.captureScreenshot', { format: 'png', clip: { ...kirp, scale: 4 } });   // 4 kat büyütülmüş görüntü: bakarak denetim
    fs.writeFileSync(path.join(CIKTI, `${Math.round(dpr * 100)}-${ad}.png`), Buffer.from(r.result.data, 'base64'));
    if (dpr !== 1) return null;
    const t = await cdp.gonder('Page.captureScreenshot', { format: 'png' });
    const p = pngCoz(Buffer.from(t.result.data, 'base64'));
    const zemin = renk(d.aracBg);
    const y = Math.round(d.g.t + 10);   // ayırıcının boyunda (üstten 8 px'ten başlar), simgelerin üstünde
    const uzak = (x) => { const c = p.piksel(Math.round(x), y); return Math.round(Math.abs(c[0] - zemin[0]) + Math.abs(c[1] - zemin[1]) + Math.abs(c[2] - zemin[2])); };
    return { geri: uzak(d.g.l + 3), ayirici: uzak(d.o.l), ok: uzak(d.o.r - 1.5) };
  };

  try {
    await evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
    await evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, 'mevzuat_4721_TMK.pdf'))}).then(() => 1)`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(500);
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'otomatikKaydet', false); window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);
    await evalJs(`(() => { window.__pdefeYerelKutu = true; return true; })()`);

    // ------------------------------------------------------------ 1) Yapı
    let d = await durum();
    sonuc('Geri al ile ▾ bir kapta (.bolunmus, araç çubuğu grubunda), ▾ hemen sağında', d.kap === 'bolunmus' && d.ayniKap && d.ardinda && d.kapGrupta, d);
    sonuc('Aralarında boşluk yok, aynı yükseklikte (34 px)', Math.abs(d.o.l - d.g.r) < 0.01 && d.g.h === 34 && d.o.h === 34 && d.o.t === d.g.t, { g: d.g, o: d.o });
    sonuc('▾ 13 px (0.2.2\'de 21), oku 10 px, okun ortası ▾\'nin ortasında', d.o.w === 13 && d.o.svg.w === 10 && d.o.svg.h === 10
      && Math.abs(d.o.svg.l + 5 - (d.o.l + d.o.w / 2)) <= 0.5 && Math.abs(d.o.svg.t + 5 - (d.o.t + d.o.h / 2)) <= 0.5, { o: d.o });
    sonuc('Dış köşeler yuvarlak, iç köşeler düz (tek düğme gibi)', d.g.radius === '6px 0px 0px 6px' && d.o.radius === '0px 6px 6px 0px', { g: d.g.radius, o: d.o.radius });
    sonuc('Yakınlaştırmanın ▾\'si 21 px kaldı; Yinele\'de ok yok; ▾\'nin ipucu ve aria-haspopup değişmedi', d.zoomOk === 21 && !d.yineleOk && d.o.title === 'Geri alınacak adımlar' && d.o.haspopup === 'dialog', d);
    sonuc('Ayırıcı 1 px, vurgu yokken görünmez', d.ayiriciW === '1px' && d.ayirici === '0', { w: d.ayiriciW, op: d.ayirici });

    // ------------------------------------------------------------ 2) Devre dışı
    sonuc('Geri alınacak bir şey yokken ikisi birlikte devre dışı ve soluk (0.35)', d.g.devre && d.o.devre && d.g.op === '0.35' && d.o.op === '0.35', d);
    await fare([{ tur: 'hareket', x: merkez(d, 'g')[0], y: merkez(d, 'g')[1] }]); await bekle(150);
    d = await durum();
    const pDevre = await piksel(d, 'devre-disi-ustunde');
    sonuc('Devre dışıyken üzerine gelince vurgu ve ayırıcı yok', saydam(d.g.bg) && saydam(d.o.bg) && d.ayirici === '0' && (!pDevre || (pDevre.geri === 0 && pDevre.ayirici === 0 && pDevre.ok === 0)), { g: d.g.bg, o: d.o.bg, ayirici: d.ayirici, pDevre });
    await disari();

    // Geri alınacak iki adım (not ekle)
    for (const [s, ic] of [[1, 'Birinci not'], [2, 'İkinci not']]) {
      await evalJs(`(async () => { const b = window.__pdefe.aktif(); b.notlar.ekle({ tur: 'Text', sayfa: ${s}, rect: [400, 600, 420, 620], icerik: ${J(ic)}, yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' }); await new Promise((r) => setTimeout(r, 150)); return 1; })()`);
    }
    d = await durum();
    sonuc('İki adım sonra iki yarı etkin, soluk değil', !d.g.devre && !d.o.devre && d.g.op === '1' && d.o.op === '1' && d.konum === 2, d);

    for (const tema of ['acik', 'koyu']) {
      if ((await evalJs(`document.documentElement.dataset.tema`)) !== tema) { await evalJs(`window.__pdefe.komutCalistir('gorunum.tema'), 1`); await bekle(300); }
      const T = tema === 'koyu' ? 'koyu tema' : 'açık tema';
      const [hover, basili, sert] = tema === 'koyu' ? ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.18)'] : ['rgba(0, 0, 0, 0.06)', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.16)'];
      // ------------------------------------------------------------ 3) Üzerine gelme
      await disari();
      d = await durum();
      const pYok = await piksel(d, `${tema}-vurgusuz`);
      sonuc(`[${T}] imleç uzaktayken iki yarı vurgusuz, ayırıcı yok`, saydam(d.g.bg) && saydam(d.o.bg) && d.ayirici === '0' && (!pYok || (pYok.geri === 0 && pYok.ayirici === 0 && pYok.ok === 0)), { g: d.g.bg, o: d.o.bg, ayirici: d.ayirici, pYok });
      for (const [yari, ad] of [['g', 'Geri al'], ['o', '▾']]) {
        const [x, y] = merkez(d, yari);
        await fare([{ tur: 'hareket', x, y }]); await bekle(150);
        const e = await durum();
        const ust = yari === 'g' ? e.g : e.o, oteki = yari === 'g' ? e.o : e.g;
        sonuc(`[${T}] imleç ${ad} yarısında: o yarı daha koyu (${basili}), öteki açık vurgulu (${hover}), ayırıcı görünür`, ust.bg === basili && oteki.bg === hover && e.ayirici === '1', { ust: ust.bg, oteki: oteki.bg, ayirici: e.ayirici });
        const p = await piksel(e, `${tema}-ustunde-${yari === 'g' ? 'geri' : 'ok'}`);
        if (p) {
          const [u, o] = yari === 'g' ? [p.geri, p.ok] : [p.ok, p.geri];
          sonuc(`[${T}] piksel (imleç ${ad}'de): ayırıcı > üzerindeki yarı > öteki yarı > araç çubuğu (zeminden uzaklık)`, p.ayirici > u && u > o && o > 0, p);
          bilgi(`${tema}, imleç ${ad}: zeminden uzaklık (R+G+B) Geri al ${p.geri}, ayırıcı ${p.ayirici}, ▾ ${p.ok}`);
        }
      }
      // ------------------------------------------------------------ 4) Basılı ve liste açık
      // Geri al'a basılır, düğmenin dışında bırakılır: geri alınmaz
      const konum0 = (await durum()).konum;
      let [x, y] = merkez(d, 'g');
      await fare([{ tur: 'hareket', x, y }, { tur: 'bas', x, y }]); await bekle(120);
      let e = await durum();
      await piksel(e, `${tema}-basili-geri`);
      sonuc(`[${T}] Geri al basılıyken o yarı en koyu (${sert}), ▾ açık vurgulu`, e.g.bg === sert && e.o.bg === hover && e.ayirici === '1', { g: e.g.bg, o: e.o.bg });
      await fare([{ tur: 'birak', x: Math.round(e.o.r + 300), y: Math.round(e.o.b + 200) }]); await bekle(250);
      await disari();
      e = await durum();
      sonuc(`[${T}] düğmenin dışında bırakılınca geri alınmaz, liste açılmaz, vurgu kalkar`, e.konum === konum0 && !e.liste && saydam(e.g.bg) && saydam(e.o.bg), { konum: e.konum, konum0, liste: e.liste });
      // ▾'ye basılı
      [x, y] = merkez(d, 'o');
      await fare([{ tur: 'hareket', x, y }, { tur: 'bas', x, y }]); await bekle(120);
      e = await durum();
      sonuc(`[${T}] ▾ basılıyken o yarı en koyu, Geri al açık vurgulu`, e.o.bg === sert && e.g.bg === hover && e.ayirici === '1', { g: e.g.bg, o: e.o.bg });
      await fare([{ tur: 'birak', x, y }]); await bekle(300);   // tıklama: liste açılır
      e = await durum();
      sonuc(`[${T}] ▾ tıklanınca liste açılır (aria-expanded true)`, e.liste === 'geri' && e.o.expanded === 'true', { liste: e.liste, expanded: e.o.expanded });
      // İmleç listenin içine iner: vurgu sürer (liste açık)
      const satir = await evalJs(`(() => { const li = document.querySelector('.gecmis-listesi .gecmis-ogeler > li'); if (!li) return null; const r = li.getBoundingClientRect(); return [Math.round(r.left + 30), Math.round(r.top + r.height / 2)]; })()`);
      if (satir) { await fare([{ tur: 'hareket', x: satir[0], y: satir[1] }]); await bekle(150); }
      e = await durum();
      await piksel(e, `${tema}-liste-acik`);
      sonuc(`[${T}] liste açıkken (imleç listede) ▾ en koyu, Geri al açık vurgulu, ayırıcı görünür`, e.o.bg === sert && e.g.bg === hover && e.ayirici === '1', { g: e.g.bg, o: e.o.bg, ayirici: e.ayirici });
      await tus('Escape'); await bekle(250);
      await disari();
      e = await durum();
      sonuc(`[${T}] Esc listeyi kapatır, hiçbir şey geri alınmaz, vurgu ve ayırıcı kalkar`, !e.liste && e.konum === konum0 && e.o.expanded === 'false' && saydam(e.g.bg) && saydam(e.o.bg) && e.ayirici === '0', e);
    }

    // ------------------------------------------------------------ 5) Klavye
    await evalJs(`(document.querySelector('#dugme-geri-al-liste').focus(), 1)`);
    await tus('Enter'); await bekle(300);
    let k = await durum();
    sonuc('Klavye: ▾\'de Enter listeyi açar (aria-expanded true)', k.liste === 'geri' && k.o.expanded === 'true', { liste: k.liste, expanded: k.o.expanded });
    await tus('Escape'); await bekle(250);
    k = await durum();
    sonuc('Klavye: Esc kapatır, odak ▾\'de, hiçbir şey geri alınmaz', !k.liste && k.o.expanded === 'false' && k.odak === 'dugme-geri-al-liste' && k.konum === 2, k);

    // ------------------------------------------------------------ 6) Dar pencere
    // 760 px: 3. kademe. 704 px (Windows'ta en dar pencerenin içi): bu belgede 5. kademe (▾ daralınca 6. kademe gerekmiyor; 0.2.2'de 6.
    // kademeydi). 6. kademe 4 basamaklı sayfa sayısında ya da daha dar alanda: 660 px taklidiyle sınanır
    for (const [w, kademe, yok, gen, ok] of [[760, 'sikisik-3', 'sikisik-4', 12, 10], [704, 'sikisik-5', 'sikisik-6', 12, 10], [660, 'sikisik-6', null, 11, 9]]) {
      await genislik(w);
      const n = await durum();
      sonuc(`[${w} px] ${kademe.replace('sikisik-', '')}. kademede${yok ? ` (${yok.replace('sikisik-', '')}. değil)` : ''} ▾ ${gen} px, oku ${ok} px; Geri al'a bitişik`,
        n.sinif.includes(kademe) && (!yok || !n.sinif.includes(yok)) && n.o.w === gen && n.o.svg.w === ok && Math.abs(n.o.l - n.g.r) < 0.01, { sinif: n.sinif, o: n.o, g: n.g });
      const [x, y] = merkez(n, 'o');
      const ustteki = await evalJs(`(() => { const e = document.elementFromPoint(${x}, ${y}); return e?.closest('button')?.id || null; })()`);
      await tikla(x, y); await bekle(300);
      const t = await durum();
      sonuc(`[${w} px] ▾ tıklanır: ortası ▾'nin kendisi, tıklayınca liste açılır`, ustteki === 'dugme-geri-al-liste' && t.liste === 'geri', { ustteki, liste: t.liste });
      await tus('Escape'); await bekle(250);
      await piksel(n, `dar-${w}`);
    }
    await genislik(0);
    const son = await durum();
    sonuc('Genişleyince ▾ yeniden 13 px', son.o.w === 13 && son.o.svg.w === 10, son.o);
  } finally {
    await cdp.gonder('Emulation.clearDeviceMetricsOverride');
    if ((await evalJs(`document.documentElement.dataset.tema`)) !== ilkTema) await evalJs(`window.__pdefe.komutCalistir('gorunum.tema'), 1`);
    const hatalar = cdp.olaylar.filter((x) => x.method === 'Runtime.exceptionThrown' || (x.method === 'Runtime.consoleAPICalled' && x.params.type === 'error')
      || (x.method === 'Log.entryAdded' && x.params.entry.level === 'error'))
      .map((x) => x.params.exceptionDetails?.exception?.description || x.params.exceptionDetails?.text || x.params.entry?.text || x.params.args?.map((a) => a.value ?? a.description).join(' '));
    sonuc('Konsolda hata yok', hatalar.length === 0, hatalar);
    cdp.ws.close();
  }
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti  (görüntüler: ${CIKTI})`);
  if (hataSayisi) process.exitCode = 1;
}
