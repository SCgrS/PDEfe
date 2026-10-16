// Açılışta tema (0.2.10, kullanıcı şikâyeti: "Açılışta böyle bir şey oluyor anlık": koyu temada açılış ekranındaki PDF aç ve araç karoları bir
// an açık gri, açıklama yazıları okunmuyordu). Kök neden: html'in teması ayarlar IPC ile gelince konuyordu; ilk kareler açık temayla çiziliyor
// (pencere de ilk çizimde gösteriliyordu), tema gelince karoların 0,1 sn'lik renk geçişi onları beyazdan koyuya griden geçiriyordu. 0.2.9'da
// koyu temada yeniden yüklemede 3 tamamen açık kare + 6 açık / gri karolu kare ölçüldü. Denetlenenler (her karede, requestAnimationFrame ile;
// karoların, PDF aç'ın ve gövdenin hesaplanan zemin rengi ve html'in teması):
//   1) Pencere yeniden yüklenince (arayüzün açılışı): ilk kareden itibaren tema ve renkler doğru, yanlış renkli kare 0; window.pdefe.ilkTema
//      pencerenin teması; açılıştaki 'tema-uygulaniyor' sınıfı kalkar, karoların üzerine gelme geçişi (0,1 sn) yine çalışır.
//   2) Her temada yeni pencere (sekmeyi pencereye ayır; ana süreçte ilk pencereyle aynı pencereOlustur): koyu, açık, "Sistemi izle" ile
//      Windows koyu ve açık (test:sistemTemasi ile benzetim; bilgisayarın ayarına dokunulmaz). Yeni pencere debugger beklemesiyle yakalanır,
//      örnekleyici ilk karesinden çalışır; yanlış renkli kare 0, ilkTema doğru, son renkler temanın renkleri.
//   3) Tema değişince (Ayarlar › Tema, araç çubuğundaki tema düğmesi, "Sistemi izle"de sistem teması değişince): değişimden sonraki ilk
//      karede karolar yeni renkte, ara (gri) kare yok; sınıf kalkar, geçiş yine 0,1 sn.
// Kullanım (ekran dışı örnek; belge açılmaz, tema ayarı sonunda eski hâline döner):
//   powershell -File test\baslat.ps1 -Port 9471 -Veri "$env:TEMP\pdefe-tema-9471" -Tema koyu      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9471; node test\surucu.mjs betik test\tema_acilis.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
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

// Temaların bilinen renkleri (stil.css: --arka gövde, --arka-yukseltilmis karo)
const RENK = { koyu: { govde: 'rgb(32, 32, 32)', karo: 'rgb(43, 43, 43)' }, acik: { govde: 'rgb(243, 243, 243)', karo: 'rgb(255, 255, 255)' } };
const GECIS = '0.1s, 0.1s';   // .karsilama-arac: transition: border-color 0.1s, background-color 0.1s

// Sayfa belgesi oluşurken (sayfanın kendi betiklerinden önce) kurulan örnekleyici: her karede bir kayıt, en çok 240 kare
const ORNEKLEYICI = `(() => {
  if (!/\\/src\\/renderer\\/index\\.html/.test(location.href)) return;
  const k = []; window.__temaKareleri = k;
  const zemin = (e) => (e ? getComputedStyle(e).backgroundColor : null);
  function ornek(t) {
    const html = document.documentElement, karo = document.querySelector('.karsilama-arac'), ac = document.querySelector('.karsilama-ac');
    k.push({ t: Math.round(t), tema: html && html.dataset.tema, sinif: !!html && html.classList.contains('tema-uygulaniyor'),
      govde: document.body ? zemin(document.body) : null, karo: karo && karo.offsetParent ? zemin(karo) : null, ac: ac && ac.offsetParent ? zemin(ac) : null });
    if (k.length < 240) requestAnimationFrame(ornek);
  }
  requestAnimationFrame(ornek);
})();`;

/** Tarayıcı düzeyinde CDP bağlantısı (oturumlar düz: sessionId ile). */
async function tarayici() {
  const surum = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const ws = new WebSocket(surum.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map(), dinleyiciler = new Set();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } else if (d.method) for (const f of dinleyiciler) f(d); };
  const gonder = (method, params = {}, sessionId) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const degerlendir = async (oturum, ifade) => {
    const r = await gonder('Runtime.evaluate', { expression: ifade, awaitPromise: true, returnByValue: true }, oturum);
    if (r.error) throw new Error(r.error.message);
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || J(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  return { ws, gonder, degerlendir, dinle: (f) => { dinleyiciler.add(f); return () => dinleyiciler.delete(f); } };
}

/** Kareleri temanın renkleriyle karşılaştırır: beklenen tema ve (varsa) gövde, karo, PDF aç rengi her karede beklenen değer olmalı. */
function yanlisKareler(kareler, tema, ref) {
  return kareler.filter((o) => o.tema !== tema || (o.govde && o.govde !== ref.govde) || (o.karo && o.karo !== ref.karo) || (o.ac && o.ac !== ref.ac));
}

export default async function ({ bekle }) {
  const cdp = await tarayici();
  const anaHedef = (await cdp.gonder('Target.getTargets')).result.targetInfos.find((h) => h.type === 'page' && /\/src\/renderer\/index\.html/.test(h.url));
  const ana = (await cdp.gonder('Target.attachToTarget', { targetId: anaHedef.targetId, flatten: true })).result.sessionId;
  await cdp.gonder('Page.enable', {}, ana);
  // Bütün ana pencere ifadeleri bu oturumla (yeni pencere açıkken de ana pencereye gider)
  const evalJs = (ifade) => cdp.degerlendir(ana, ifade);
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade).catch(() => false); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };

  // Ana pencerede belge yok, açılış ekranı görünür
  await evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  const eskiTema = await evalJs(`window.__pdefe.ayar().tema`);
  const ilk = await evalJs(`({ tema: document.documentElement.dataset.tema, ilkTema: window.pdefe.ilkTema })`);
  sonuc('Ana pencere: window.pdefe.ilkTema pencerenin teması (ana süreç komut satırıyla verdi)', ilk.ilkTema === ilk.tema && !!RENK[ilk.tema], ilk);
  /** Açılış ekranının yerleşmiş renkleri (gövde, karo, PDF aç) ve sınıf / geçiş durumu. */
  const yerlesik = (oturum) => cdp.degerlendir(oturum, `(() => { const z = (e) => getComputedStyle(e).backgroundColor; const karo = document.querySelector('.karsilama-arac');
    return { tema: document.documentElement.dataset.tema, govde: z(document.body), karo: z(karo), ac: z(document.querySelector('.karsilama-ac')),
      sinif: document.documentElement.classList.contains('tema-uygulaniyor'), gecis: getComputedStyle(karo).transitionDuration, ilkTema: window.pdefe.ilkTema }; })()`);

  // ---------------------------------------------------------------- 1) yeniden yükleme
  {
    const { result: { identifier } } = await cdp.gonder('Page.addScriptToEvaluateOnNewDocument', { source: ORNEKLEYICI }, ana);
    await cdp.gonder('Page.reload', {}, ana);
    await bekle(400);
    await kosul(`!!window.__pdefe && !document.documentElement.classList.contains('tema-uygulaniyor')`, 10000);
    await bekle(500);
    await cdp.gonder('Page.removeScriptToEvaluateOnNewDocument', { identifier }, ana);
    const kareler = await evalJs(`window.__temaKareleri`);
    const son = await yerlesik(ana);
    const yanlis = yanlisKareler(kareler, ilk.tema, son);
    bilgi(`yeniden yükleme (${ilk.tema}): ${kareler.length} kare, karolu ${kareler.filter((o) => o.karo).length}, ilk kare ${J(kareler[0])}`);
    sonuc(`Yeniden yükleme (${ilk.tema}): son renkler temanın renkleri`, son.govde === RENK[ilk.tema].govde && son.karo === RENK[ilk.tema].karo, son);
    sonuc(`Yeniden yükleme (${ilk.tema}): ilk kareden itibaren yanlış renkli kare yok (gövde, karolar, PDF aç)`, kareler.length > 20 && yanlis.length === 0, { kare: kareler.length, yanlis: yanlis.slice(0, 4) });
    sonuc(`Yeniden yükleme (${ilk.tema}): karolar çizildiği ilk karede doğru renkte`, kareler.some((o) => o.karo) && kareler.find((o) => o.karo).karo === son.karo, kareler.find((o) => o.karo));
    sonuc('Yeniden yükleme: açılıştaki tema-uygulaniyor sınıfı kalktı, karoların üzerine gelme geçişi yine 0,1 sn', !son.sinif && son.gecis === GECIS, son);
    const sinifli = kareler.filter((o) => o.sinif).length;
    sonuc('Yeniden yükleme: sınıf ayarlar gelince birkaç karede kalkar (≤ 30 kare)', sinifli > 0 && sinifli <= 30, sinifli);
  }

  // ---------------------------------------------------------------- tema değişimi kare kare (ana pencere)
  /** degistir: sayfada çalışan ifade (temayı değiştirir). Değişimden önce 3, sonra 24 kare örneklenir. */
  const degisimKareleri = (degistir) => evalJs(`(async () => {
    const z = (e) => getComputedStyle(e).backgroundColor, karo = document.querySelector('.karsilama-arac'), ac = document.querySelector('.karsilama-ac');
    const k = [], kare = () => new Promise((c) => requestAnimationFrame(c));
    const al = (asama) => k.push({ asama, tema: document.documentElement.dataset.tema, sinif: document.documentElement.classList.contains('tema-uygulaniyor'), govde: z(document.body), karo: z(karo), ac: z(ac) });
    for (let i = 0; i < 3; i++) { await kare(); al('once'); }
    await (${degistir});
    for (let i = 0; i < 24; i++) { await kare(); al('sonra'); }
    await new Promise((c) => setTimeout(c, 300));
    return { k, son: { tema: document.documentElement.dataset.tema, govde: z(document.body), karo: z(karo), ac: z(ac), sinif: document.documentElement.classList.contains('tema-uygulaniyor'), gecis: getComputedStyle(karo).transitionDuration } };
  })()`);
  /** Değişimin denetimi: önceki renkten yeni renge ara kare olmadan; yeni tema geldiği karede karolar ve PDF aç yeni renkte. */
  const degisimiDenetle = (ad, r, onceki, yeniTema) => {
    const sonra = r.k.filter((o) => o.asama === 'sonra');
    const ara = sonra.filter((o) => (o.tema === yeniTema ? (o.karo !== r.son.karo || o.ac !== r.son.ac || o.govde !== r.son.govde) : (o.karo !== onceki.karo || o.govde !== onceki.govde)));
    sonuc(`${ad}: tema ${yeniTema}, son renkler temanın renkleri`, r.son.tema === yeniTema && r.son.govde === RENK[yeniTema].govde && r.son.karo === RENK[yeniTema].karo, r.son);
    sonuc(`${ad}: ara (gri) kare yok; yeni tema geldiği karede karolar ve PDF aç yeni renkte`, sonra.some((o) => o.tema === yeniTema) && ara.length === 0, ara.slice(0, 4));
    sonuc(`${ad}: sınıf kalktı, üzerine gelme geçişi yine 0,1 sn`, !r.son.sinif && r.son.gecis === GECIS, r.son);
    return r.son;
  };
  const ayarlardanTema = async (tema) => {
    await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'gorunum')`);
    await kosul(`!!document.querySelector('.ayarlar-ortusu') && [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].some((k) => k.querySelector('.ayar-baslik')?.textContent === 'Tema')`);
    const onceki = await yerlesik(ana);
    const r = await degisimKareleri(`(() => { const s = [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((k) => k.querySelector('.ayar-baslik')?.textContent === 'Tema').querySelector('select'); s.value = ${J(tema)}; s.dispatchEvent(new Event('change')); })()`);
    await evalJs(`document.querySelector('.ayarlar-ortusu [data-id="kapat2"]')?.click()`);
    await kosul(`!document.querySelector('.ayarlar-ortusu')`);
    return { onceki, r };
  };

  // ---------------------------------------------------------------- 2) her temada yeni pencere
  /** Ana penceredeki açılış sekmesi yeni pencereye ayrılır; yeni pencere debugger beklemesiyle yakalanıp örnekleyici kurulur. */
  const yeniPencere = async () => {
    let yeni = null;
    const birak = cdp.dinle((d) => {
      if (d.method !== 'Target.attachedToTarget') return;
      const s = d.params.sessionId;
      if (d.params.targetInfo.type === 'page' && d.params.waitingForDebugger && !yeni) {
        yeni = s;
        // Yanıt beklenmeden: duraklatılmış hedef örnekleyici kurulduktan sonra sürer (komutlar sırayla işlenir)
        cdp.gonder('Page.enable', {}, s); cdp.gonder('Runtime.enable', {}, s);
        cdp.gonder('Page.addScriptToEvaluateOnNewDocument', { source: ORNEKLEYICI }, s);
      }
      cdp.gonder('Runtime.runIfWaitingForDebugger', {}, s);
    });
    await cdp.gonder('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    const tamam = await evalJs(`(async () => { window.__pdefe.komutCalistir('sekme.yeni'); await new Promise((r) => setTimeout(r, 250));
      const s = window.__pdefe.sekmeler.sekmeler.at(-1); return window.__pdefe.sekmeyiTasi(s.id, { tur: 'yeni' }); })()`);
    for (let i = 0; i < 50 && !yeni; i++) await bekle(100);
    // Otomatik bağlanma pencere kapanınca kapatılır (kapatmak bağlanılan oturumları da koparır)
    const bitir = async () => { await cdp.gonder('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: true }); birak(); };
    if (!yeni) { await bitir(); return { tamam, oturum: null, bitir }; }
    for (let i = 0; i < 80; i++) { if (await cdp.degerlendir(yeni, `!!window.__pdefe && !document.documentElement.classList.contains('tema-uygulaniyor')`).catch(() => false)) break; await bekle(100); }
    await bekle(400);
    const kareler = await cdp.degerlendir(yeni, 'window.__temaKareleri');
    const son = await yerlesik(yeni);
    return { tamam, oturum: yeni, kareler, son, bitir };
  };
  const pencereyiKapat = async (p) => {
    if (p.oturum) await Promise.race([cdp.degerlendir(p.oturum, 'window.close(), true').catch(() => {}), bekle(1500)]);
    await bekle(800);
    await p.bitir();
  };

  const DURUMLAR = [
    { ad: 'koyu', ayar: 'koyu', beklenen: 'koyu' },
    { ad: 'açık', ayar: 'acik', beklenen: 'acik' },
    { ad: 'Sistemi izle, Windows koyu', ayar: 'sistem', sistem: 'dark', beklenen: 'koyu' },
    { ad: 'Sistemi izle, Windows açık', ayar: 'sistem', sistem: 'light', beklenen: 'acik' },
  ];
  try {
    for (const d of DURUMLAR) {
      if (d.sistem) sonuc(`${d.ad}: sistem teması benzetimi`, (await evalJs(`window.pdefe.cagir('test:sistemTemasi', ${J(d.sistem)})`)) === (d.sistem === 'dark'));
      if ((await evalJs(`window.__pdefe.ayar().tema`)) !== d.ayar) {
        const { onceki, r } = await ayarlardanTema(d.ayar);
        if (onceki.tema !== d.beklenen) degisimiDenetle(`Ayarlar › Tema → ${d.ad}`, r, onceki, d.beklenen);
      }
      await kosul(`document.documentElement.dataset.tema === ${J(d.beklenen)} && !document.documentElement.classList.contains('tema-uygulaniyor')`);
      const ref = await yerlesik(ana);
      const p = await yeniPencere();
      if (!sonuc(`${d.ad}: yeni pencere açıldı ve ilk karesinden yakalandı`, !!p.oturum && p.tamam === true && Array.isArray(p.kareler), { tamam: p.tamam, oturum: !!p.oturum })) { await pencereyiKapat(p); continue; }
      const yanlis = yanlisKareler(p.kareler, d.beklenen, ref);
      bilgi(`${d.ad}: ${p.kareler.length} kare, karolu ${p.kareler.filter((o) => o.karo).length}, ilk kare ${J(p.kareler[0])}`);
      sonuc(`${d.ad}: yeni pencerede window.pdefe.ilkTema = ${d.beklenen}`, p.son.ilkTema === d.beklenen, p.son);
      sonuc(`${d.ad}: yeni pencerenin son renkleri temanın renkleri (ana pencereyle aynı)`, p.son.tema === d.beklenen && p.son.govde === RENK[d.beklenen].govde && p.son.karo === RENK[d.beklenen].karo && p.son.ac === ref.ac, { son: p.son, ref });
      sonuc(`${d.ad}: yeni pencerede ilk kareden itibaren yanlış renkli kare yok`, p.kareler.length > 10 && yanlis.length === 0, { kare: p.kareler.length, yanlis: yanlis.slice(0, 4) });
      sonuc(`${d.ad}: yeni pencerede sınıf kalktı, geçiş yine 0,1 sn`, !p.son.sinif && p.son.gecis === GECIS, p.son);
      await pencereyiKapat(p);
    }

    // ---------------------------------------------------------------- 3) tema değişimi: sistem teması ve tema düğmesi
    // "Sistemi izle" açıkken (son durum: Windows açık) sistem koyulaşınca ve yeniden açılınca
    const s1 = await yerlesik(ana);
    const r1 = await degisimKareleri(`window.pdefe.cagir('test:sistemTemasi', 'dark')`);
    degisimiDenetle('Sistemi izle: Windows açık → koyu', r1, s1, 'koyu');
    const s2 = await yerlesik(ana);
    const r2 = await degisimKareleri(`window.pdefe.cagir('test:sistemTemasi', 'light')`);
    degisimiDenetle('Sistemi izle: Windows koyu → açık', r2, s2, 'acik');
    // Araç çubuğundaki tema düğmesi (gorunum.tema): açık → koyu → açık
    const s3 = await yerlesik(ana);
    const r3 = await degisimKareleri(`window.__pdefe.komutCalistir('gorunum.tema')`);
    degisimiDenetle('Tema düğmesi: açık → koyu', r3, s3, 'koyu');
    const s4 = await yerlesik(ana);
    const r4 = await degisimKareleri(`window.__pdefe.komutCalistir('gorunum.tema')`);
    degisimiDenetle('Tema düğmesi: koyu → açık', r4, s4, 'acik');
    // Arka arkaya iki değişim (son çağrının sınıf kaldırması geçerli; sınıf asılı kalmaz)
    await evalJs(`(() => { window.__pdefe.komutCalistir('gorunum.tema'); window.__pdefe.komutCalistir('gorunum.tema'); return true; })()`);
    await bekle(700);
    const s5 = await yerlesik(ana);
    sonuc('Arka arkaya iki tema değişimi: tema açık, sınıf kalktı, geçiş 0,1 sn', s5.tema === 'acik' && !s5.sinif && s5.gecis === GECIS, s5);
  } finally {
    // Eski hâline: sistem teması bilgisayarınki, tema ayarı eskisi (Ayarlar yoluyla, ayarlar.json'a da yazılır)
    await evalJs(`window.pdefe.cagir('test:sistemTemasi', 'system')`).catch(() => {});
    if ((await evalJs(`window.__pdefe.ayar().tema`)) !== eskiTema) await ayarlardanTema(eskiTema).catch((e) => bilgi('tema geri alınamadı: ' + e.message));
    cdp.ws.close();
  }
  console.log(`\nTema açılışı: ${toplam - hataSayisi}/${toplam} OK, ${hataSayisi} hata`);
  if (hataSayisi) process.exitCode = 1;
}
