// Kaydırırken sayfaların ne kadar boş (çizilmemiş) ya da bulanık (önizleme / hızlı çizim) kaldığını ölçer (0.2.3, kullanıcı isteği:
// "sayfaları kaydırırken daha hızlı yüklensin"). Test örneğinde gerçek girdiyle (CDP Input: tekerlek, PageDown, kaydırma çubuğunu
// sürükleme) kaydırılır; uygulama bunu kullanıcı kaydırması sayar. Ölçüm kancaları test/kaydirma_olcum_sayfa.js'te (kaynağa dokunmaz).
// Kullanım (PowerShell):
//   .venv\Scripts\python.exe test\kaydirma_ornek_uret.py                       → test\cikti\kaydirma\pdf\{metin,karisik,taranmis}.pdf
//   powershell -File test\baslat.ps1 -Port 9641 -Boyut "1800,1050" -Olcek 1.25    → PID=… yazar (ev: 2560 %125 benzeri; ofis: -Boyut "1900,1000" -Olcek 1)
//   $env:PDEFE_CDP_PORT=9641; [$env:OLCUM_PDF="<pdf>[,<pdf>…]"] [$env:OLCUM_SENARYO="tekerlek-hizli,atlama"] [$env:OLCUM_TEKRAR=2]
//   [$env:OLCUM_CPU=4] [$env:OLCUM_CIKTI="test\cikti\kaydirma\once.json"] [$env:OLCUM_PID=<PID>]
//   node test\surucu.mjs betik test\kaydirma_olcum.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Önce / sonra karşılaştırması: node test\kaydirma_karsilastir.mjs <önce.json> <sonra.json>
// Senaryolar (varsayılan: ana görünümünkiler):
//   tekerlek-hizli (100 adım, 30 ms arayla), tekerlek-yavas (40 adım, 150 ms), sayfa-asagi (12 PageDown, 250 ms), yukari-hizli,
//   atlama (dört uzak sayfaya gitme), surukle (kaydırma çubuğunu sürükleme), yakin-tekerlek (%600, bölgesel çizim, 60 adım),
//   yakin-yukari (%600, yukarı), panel-tekerlek, panel-atlama, panel-surukle, panel-surukle-genis (Sayfalar paneli), ana-panel,
//   bellek: bütün OLCUM_PDF belgeleri birlikte açılır, her birinde tekerlek-hizli; sonra test örneğinin süreç ağacının özel çalışma
//   kümesi (test\surec_bellegi.ps1, OLCUM_PID gerekir) ve tuvallerin toplam boyu.
//   panel-bellek: her belge tek başına, Sayfalar paneli 480 px ve önbelleği boş: panelin kaydırma çubuğu baştan sona hızla sürüklenir,
//   sonra alan alan başa dönülür (her hücrenin resmi gelir); çekirdekten istenen küçük resim sayısı, önbelleğin boyu ve süreç ağacının
//   belleği (OLCUM_PID gerekir).
// OLCUM_OLCEK=<ölçek> (ör. 3.7): ana senaryolar sığdırma yerine bu yakınlaştırmada koşulur (yakin-* senaryoları yine %600).
// OLCUM_CPU=4: renderer ana iş parçacığı 4 kat yavaş (CDP Emulation; yavaş bilgisayar benzetimi, çekirdek etkilenmez).
// OLCUM_PROFIL=1: senaryo başına CPU profili (<çıktı>.<senaryo>.<n>.cpuprofile).
// Ölçüler: ana.bosAlanSn / bulanikAlanSn (görünen alanın boş / bulanık kaldığı süre, alanla ağırlıklı: "sn·ekran"), bekleme (boş giren
// sayfanın ilk görüntüsü, ms), keskinBekleme (sayfanın keskin görüntüsü), durunca (kaydırma durduktan sonra keskinleşme), girisDurumu
// (görünür alana girerken keskin / hizli / onizleme / bos), kare.uzun50 (50 ms'yi aşan kare), cizim (çizim sayısı, süre, önizleme).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORNEK = path.join(KOK, 'test', 'cikti', 'kaydirma', 'pdf');
const PDFLER = (process.env.OLCUM_PDF || ['metin', 'karisik', 'taranmis'].map((a) => path.join(ORNEK, a + '.pdf')).join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);
const CIKTI = process.env.OLCUM_CIKTI || path.join(KOK, 'test', 'cikti', 'kaydirma', `olcum-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.json`);
const SENARYOLAR = (process.env.OLCUM_SENARYO || 'tekerlek-hizli,yukari-hizli,sayfa-asagi,atlama,surukle,yakin-tekerlek,yakin-yukari')
  .split(',').map((s) => s.trim()).filter(Boolean);
const TEKRAR = +(process.env.OLCUM_TEKRAR || 2);
const CPU = +(process.env.OLCUM_CPU || 1);
const J = (x) => JSON.stringify(x);

export default async function ({ evalJs, bekle, hedefler, tus }) {
  for (const p of PDFLER) if (!fs.existsSync(p)) throw new Error('PDF yok: ' + p + ' (test\\kaydirma_ornek_uret.py ile üretin)');
  const kosul = async (ifade, sure = 20000, ara = 100) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(ara); } };

  // CDP bağlantısı: tekerlek dizileri tek bağlantıdan, sabit aralıkla gönderilir (yanıt beklenmez, yanıt gecikmesi ayrıca ölçülür)
  const h = (await hedefler())[0];
  const ws = new WebSocket(h.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); const b = bekleyen.get(d.id); if (b) { bekleyen.delete(d.id); b(d); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(J({ id: i, method, params })); });

  /** n tekerlek olayı (her biri deltaY), ara ms arayla; yanıt gecikmeleri (ms) döner. */
  const tekerlek = async (x, y, n, deltaY, ara) => {
    await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    const gecikme = [], sozler = [];
    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      const kalan = t0 + k * ara - performance.now();
      if (kalan > 1) await bekle(kalan);
      const ts = performance.now();
      sozler.push(gonder('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY, button: 'none', buttons: 0 }).then(() => gecikme.push(performance.now() - ts)));
    }
    await Promise.all(sozler);
    return gecikme;
  };
  const ozetle = (d) => { const a = [...d].sort((x, y) => x - y); return a.length ? { ortanca: Math.round(a[a.length >> 1]), enFazla: Math.round(a[a.length - 1]) } : null; };

  await gonder('Emulation.setCPUThrottlingRate', { rate: CPU });
  await evalJs(fs.readFileSync(path.join(KOK, 'test', 'kaydirma_olcum_sayfa.js'), 'utf8'));
  await evalJs(`(() => { window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);
  const hepsiniKapat = () => evalJs(`(async () => { for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true }); return window.__pdefe.belgeler.size; })()`);
  const belgeAc = async (pdf) => {
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(pdf)}); return true; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.hazir`);
    await evalJs(`(() => { const p = window.__pdefe; p.panel.acKapa(false); return window.__olc.bagla(); })()`);
  };
  const durul = async (sure = 20000) => {
    let ard = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < sure) {
      if (await evalJs('window.__olc.durgunMu()')) { if (++ard >= 3) return true; } else ard = 0;
      await bekle(120);
    }
    return false;
  };
  const sayfayaGit = (no) => evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; g.sayfayaGit(${no}, { aninda: true }); return g.gecerli; })()`);
  const panelAc = async (ac) => {
    await evalJs(`(() => { const p = window.__pdefe.panel; p.genislikAyarla(240); p.acKapa(${ac}); if (${ac}) p.sekmeSec('sayfalar'); return true; })()`);
    if (ac) { await bekle(300); await evalJs('window.__olc.panelBagla()'); }
  };
  const panelMerkez = () => evalJs(`(() => { const r = document.querySelector('#panel-sayfalar').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const anaMerkez = () => evalJs(`(() => { const r = window.__pdefe.aktif().gorunum.kaydirici.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const yakinlas = async (olcek) => { await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; g.zoomAyarla(${olcek}); return g.olcek; })()`); };
  const OLCEK = +(process.env.OLCUM_OLCEK || 0);
  const sigdir = () => (OLCEK ? yakinlas(OLCEK) : evalJs(`(async () => { await window.__pdefe.aktif().gorunum.zoomModuAyarla('genislik'); return true; })()`));

  const sonuclar = [];
  const ozetler = [];
  let belgeAdi = '', bilgi = null;
  const kos = async (ad, hazirla, yap) => {
    for (let t = 0; t < TEKRAR; t++) {
      await hazirla();
      const durgun = await durul();
      await bekle(400);
      await evalJs(`window.__olc.basla(${J(ad)}, { zamanKaydi: ${process.env.OLCUM_ZAMAN === '1'} })`);
      const profil = process.env.OLCUM_PROFIL === '1';
      if (profil) { await gonder('Profiler.enable'); await gonder('Profiler.setSamplingInterval', { interval: 200 }); await gonder('Profiler.start'); }
      const ek = (await yap()) || {};
      const sonDurgun = await durul(30000);
      if (profil) {
        const r = await gonder('Profiler.stop');
        fs.mkdirSync(path.dirname(CIKTI), { recursive: true });
        fs.writeFileSync(CIKTI.replace(/\.json$/, '') + `.${belgeAdi}.${ad}.${t + 1}.cpuprofile`, JSON.stringify(r.result.profile));
      }
      await bekle(200);
      const o = await evalJs('window.__olc.bitir()');
      o.belge = belgeAdi; o.ek = ek; o.oncedenDurgun = durgun; o.sondaDurgun = sonDurgun; o.tekrar = t + 1;
      sonuclar.push(o);
      const a = o.ana;
      console.log(`${belgeAdi.padEnd(9)} ${ad.padEnd(15)} #${t + 1} giren ${String(a.girenSayfa).padStart(3)} ${J(a.girisDurumu)} | boş ${a.bosAlanSn} bulanık ${a.bulanikAlanSn} sn·ekran`
        + ` | ilk ortanca ${a.bekleme.ortanca ?? '-'} en ${a.bekleme.enFazla ?? '-'} | keskin ortanca ${a.keskinBekleme.ortanca ?? '-'} en ${a.keskinBekleme.enFazla ?? '-'}`
        + ` | durunca ${a.durunca.ortanca ?? '-'} ms (${a.durunca.n}; keskinsiz ${a.durunca_keskinOlmayan}) | kare>50 ${o.kare.uzun50}/${o.kare.sayi}`
        + ` | çizim ${o.cizimler.length} (${o.cizim.toplamMs} ms, önizleme ${o.cizim.onizleme}/${o.cizim.onizlemeGorunmeyen} görünmeyen, iptal ${o.cizim.iptal})`
        + (o.panel.giren ? ` | panel boş ${o.panel.bosGiren}/${o.panel.giren}` : '') + (sonDurgun ? '' : ' | DURULMADI'));
    }
  };

  /** Senaryoyu çalıştırır (n: belgenin sayfa sayısı). */
  const senaryo = async (ad, n) => {
    if (ad === 'tekerlek-hizli') {
      await kos(ad, async () => { await panelAc(false); await sayfayaGit(1); },
        async () => { const m = await anaMerkez(); return { tekerlekYaniti: ozetle(await tekerlek(m.x, m.y, 100, 100, 30)) }; });
    } else if (ad === 'tekerlek-yavas') {
      await kos(ad, async () => { await panelAc(false); await sayfayaGit(Math.min(n, 20)); },
        async () => { const m = await anaMerkez(); return { tekerlekYaniti: ozetle(await tekerlek(m.x, m.y, 40, 100, 150)) }; });
    } else if (ad === 'sayfa-asagi') {
      await kos(ad, async () => { await panelAc(false); await sayfayaGit(Math.min(n, 5)); await evalJs('(() => { window.__pdefe.aktif().gorunum.kaydirici.focus(); return true; })()'); },
        async () => { for (let k = 0; k < 12; k++) { await tus('PageDown'); await bekle(250); } return {}; });
    } else if (ad === 'yukari-hizli') {
      await kos(ad, async () => { await panelAc(false); await sayfayaGit(Math.min(n, 30)); },
        async () => { const m = await anaMerkez(); return { tekerlekYaniti: ozetle(await tekerlek(m.x, m.y, 100, -100, 30)) }; });
    } else if (ad === 'atlama') {
      // Uzak sayfalara atlama (sayfa kutusu, yer imi, kaydırma çubuğunu bırakma): görünür sayfanın ilk ve keskin çizimine dek süre
      const hedefler = [Math.round(n * 0.5), Math.round(n * 0.25), Math.round(n * 0.8), Math.round(n * 0.6)].map((x) => Math.max(1, Math.min(n, x)));
      await kos(ad, async () => { await panelAc(false); await sayfayaGit(1); },
        async () => { for (const no of hedefler) { await sayfayaGit(no); await durul(15000); } return { hedefler }; });
    } else if (ad === 'yakin-tekerlek' || ad === 'yakin-yukari') {
      // Yüksek yakınlaştırma (%600: sayfa 24 MP'yi aşar, bölgesel çizim): tekerlekle 60 adım; görünen alanın tuvalce kapsanmayan kısmı boş sayılır
      const yukari = ad === 'yakin-yukari';
      await kos(ad, async () => { await panelAc(false); await yakinlas(6); await sayfayaGit(Math.min(n, yukari ? 5 : 3)); },
        async () => { const m = await anaMerkez(); return { tekerlekYaniti: ozetle(await tekerlek(m.x, m.y, 60, yukari ? -100 : 100, 30)), olcek: await evalJs('window.__pdefe.aktif().gorunum.olcek') }; });
      await sigdir();
    } else if (ad === 'surukle' || ad === 'surukle-panel') {
      // Kaydırma çubuğunun tutamacını gerçek fareyle sürükleme: 60 adım × 2 px, 16 ms arayla; sonra 600 ms tutup bırakma.
      // surukle-panel: Sayfalar paneli açık ve küçük resim önbelleği boş (panel geçerli sayfayı izler: geçilen hücrelerin resimleri istenir)
      const panelli = ad === 'surukle-panel';
      await kos(ad, async () => {
        await panelAc(panelli); await sayfayaGit(Math.min(n, 2));
        if (panelli) {
          await evalJs(`(() => { const p = window.__pdefe.panel, b = window.__pdefe.aktif(); p.kucukResimler.get(b.id)?.clear(); p._sayfalarHazir = null; p.yenile(); return true; })()`);
          await evalJs('window.__olc.panelBagla()');
        }
      }, async () => {
        const c = await evalJs(`(() => { const k = window.__pdefe.aktif().gorunum.kaydirici, r = k.getBoundingClientRect();
          const boy = Math.max(20, k.clientHeight * k.clientHeight / k.scrollHeight);
          return { x: Math.round(r.left + k.clientWidth + (r.width - k.clientWidth) / 2), y: Math.round(r.top + k.scrollTop / k.scrollHeight * k.clientHeight + boy / 2), st: k.scrollTop }; })()`);
        await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, button: 'none', buttons: 0 });
        await gonder('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let k = 1; k <= 60; k++) { await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y + 2 * k, button: 'left', buttons: 1 }); await bekle(16); }
        await bekle(600);
        await gonder('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y + 120, button: 'left', buttons: 0, clickCount: 1 });
        return { kaydirma: Math.round((await evalJs('window.__pdefe.aktif().gorunum.kaydirici.scrollTop')) - c.st) };
      });
    } else if (ad === 'panel-tekerlek') {
      await kos(ad, async () => { await panelAc(true); await sayfayaGit(1); await evalJs(`(() => { document.querySelector('#panel-sayfalar').scrollTop = 0; return true; })()`); },
        async () => { const m = await panelMerkez(); return { tekerlekYaniti: ozetle(await tekerlek(m.x, m.y, 40, 100, 30)) }; });
    } else if (ad === 'panel-atlama') {
      await kos(ad, async () => { await panelAc(true); await sayfayaGit(1); }, async () => {
        for (const oran of [0.5, 0.2, 0.85]) {
          await evalJs(`(() => { const a = document.querySelector('#panel-sayfalar'); a.scrollTop = (a.scrollHeight - a.clientHeight) * ${oran}; return true; })()`);
          await durul(20000);
        }
        return {};
      });
    } else if (ad === 'panel-surukle' || ad === 'panel-surukle-genis') {
      // Sayfalar panelinin kaydırma çubuğunu gerçek fareyle sürükleme (soğuk önbellek; panel-surukle-genis: panel 480 px)
      const genis = ad === 'panel-surukle-genis';
      await kos(ad, async () => {
        await panelAc(true);
        if (genis) { await evalJs('(() => { window.__pdefe.panel.genislikAyarla(480); return true; })()'); await bekle(500); }
        await sayfayaGit(1);
        await evalJs(`(() => { const p = window.__pdefe.panel, b = window.__pdefe.aktif(); p.kucukResimler.get(b.id)?.clear(); p._sayfalarHazir = null; p.yenile(); document.querySelector('#panel-sayfalar').scrollTop = 0; return true; })()`);
        await evalJs('window.__olc.panelBagla()');
      }, async () => {
        const c = await evalJs(`(() => { const a = document.querySelector('#panel-sayfalar'), r = a.getBoundingClientRect();
          const boy = Math.max(20, a.clientHeight * a.clientHeight / a.scrollHeight);
          return { x: Math.round(r.left + a.clientLeft + a.clientWidth + (r.width - a.clientWidth - 2 * a.clientLeft) / 2), y: Math.round(r.top + a.scrollTop / a.scrollHeight * a.clientHeight + boy / 2), adim: Math.max(1, Math.round((a.clientHeight - boy) * 0.6 / 60)) }; })()`);
        await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, button: 'none', buttons: 0 });
        await gonder('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let k = 1; k <= 60; k++) { await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y + c.adim * k, button: 'left', buttons: 1 }); await bekle(16); }
        await bekle(300);
        await gonder('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y + c.adim * 60, button: 'left', buttons: 0, clickCount: 1 });
        const t0 = Date.now();
        await durul(60000);
        return { birakincaDolmaMs: Date.now() - t0 - 360 };   // bırakınca görünen hücrelerin hepsinin resmi gelene dek (durul ~360 ms payla döner)
      });
      if (genis) await evalJs('(() => { window.__pdefe.panel.genislikAyarla(240); return true; })()');
    } else if (ad === 'ana-panel') {
      await kos(ad, async () => { await panelAc(true); await sayfayaGit(Math.min(n, 3)); },
        async () => { const m = await anaMerkez(); return { tekerlekYaniti: ozetle(await tekerlek(m.x, m.y, 100, 100, 30)) }; });
    } else throw new Error('Bilinmeyen senaryo: ' + ad);
  };

  const bellekler = [];
  const anaSenaryolar = SENARYOLAR.filter((s) => s !== 'bellek' && s !== 'panel-bellek');
  for (const pdf of anaSenaryolar.length ? PDFLER : []) {
    await hepsiniKapat();
    await belgeAc(pdf);
    if (OLCEK) { await sigdir(); await durul(); }
    belgeAdi = path.basename(pdf, '.pdf');
    bilgi = await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum, k = g.kaydirici; return { sayfa: g.sayfaSayisi, olcek: +g.olcek.toFixed(3), dpr: devicePixelRatio, vw: k.clientWidth, vh: k.clientHeight, sayfaMP: +(g.yerlesim[0].w * g.yerlesim[0].h * devicePixelRatio ** 2 / 1e6).toFixed(2), pencere: innerWidth + 'x' + innerHeight }; })()`);
    console.log('Belge', belgeAdi, J(bilgi), 'işlemci', CPU + '×');
    const once = sonuclar.length;
    for (const ad of anaSenaryolar) await senaryo(ad, bilgi.sayfa);
    ozetler.push({ belge: belgeAdi, bilgi, sonuclar: sonuclar.slice(once).length });
  }

  if (SENARYOLAR.includes('bellek')) {
    // 3 belge açık, her birinde aynı kaydırma (tekerlek-hizli); son açılan etkin, ötekiler arka planda (gizli sekmede yalnızca görünür
    // sayfaların tuvali kalır). Çöp toplama sonrası süreç ağacının özel çalışma kümesi.
    const pid = +process.env.OLCUM_PID;
    if (!pid) throw new Error('bellek senaryosu OLCUM_PID ister (baslat.ps1 PID=…).');
    for (let t = 0; t < TEKRAR; t++) {
      await hepsiniKapat();
      await bekle(1000);
      for (const pdf of PDFLER) {
        await belgeAc(pdf);
        await sayfayaGit(1);
        await durul();
        const m = await anaMerkez();
        await tekerlek(m.x, m.y, 100, 100, 30);
        await durul(30000);
      }
      await bekle(1500);
      await gonder('HeapProfiler.enable'); await gonder('HeapProfiler.collectGarbage');
      await bekle(1500);
      const olcumler = [];
      for (let k = 0; k < 3; k++) {
        const cikis = execFileSync('powershell', ['-NoProfile', '-File', path.join(KOK, 'test', 'surec_bellegi.ps1'), '-SurecId', String(pid)], { encoding: 'utf8' });
        olcumler.push(JSON.parse(cikis.trim()).toplamMB);
        await bekle(700);
      }
      const tuval = await evalJs('window.__olc.tuvaller()');
      const yigin = await evalJs('(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null)()');
      const b = { tekrar: t + 1, belgeler: PDFLER.map((p) => path.basename(p)), bellekMB: olcumler.sort((x, y) => x - y)[1], olcumler, tuval, jsYiginMB: yigin };
      bellekler.push(b);
      console.log(`bellek #${t + 1}: süreç ağacı ${b.bellekMB} MB (${J(olcumler)}), tuval ${tuval.sayi} adet ${tuval.mp} MP, JS yığını ${yigin} MB`);
    }
  }

  const panelBellekleri = [];
  if (SENARYOLAR.includes('panel-bellek')) {
    // Sayfalar paneli 480 px (geniş panel önbelleği en çabuk doldurur), önbellek boş, belge tek başına açık. 1) Panelin kaydırma çubuğu
    // baştan sona ~1,5 sn'de sürüklenir: geçilen hücrelerin kaçının resmi üretildi. 2) Alan alan başa dönülür, her adımda görünenler
    // gelene dek beklenir: her hücrenin resmi üretilir (önbellek sınırı devreye girebilir). Sonra çöp toplama ve süreç ağacının belleği.
    const pid = +process.env.OLCUM_PID;
    if (!pid) throw new Error('panel-bellek senaryosu OLCUM_PID ister (baslat.ps1 PID=…).');
    const onbellek = () => evalJs(`(() => { const p = window.__pdefe.panel; let n = 0; for (const ob of p.kucukResimler.values()) n += ob.size;
      return { mb: +(p.kucukResimBellegi() / 1048576).toFixed(1), kayit: n, resimli: document.querySelectorAll('#panel-sayfalar .kucuk-resim img').length }; })()`);
    const istekler = (o) => ({ n: o.cekirdek['panel:kucuk_resim']?.n || 0, ortanca: o.cekirdek['panel:kucuk_resim']?.ortanca ?? null, enFazla: o.cekirdek['panel:kucuk_resim']?.enFazla ?? null });
    for (const pdf of PDFLER) {
      for (let t = 0; t < TEKRAR; t++) {
        await hepsiniKapat();
        await bekle(1000);
        await belgeAc(pdf);
        belgeAdi = path.basename(pdf, '.pdf');
        await panelAc(true);
        await evalJs('(() => { window.__pdefe.panel.genislikAyarla(480); return true; })()');
        await bekle(500);
        await sayfayaGit(1);
        await evalJs(`(() => { const p = window.__pdefe.panel, b = window.__pdefe.aktif(); p.kucukResimler.get(b.id)?.clear(); p._sayfalarHazir = null; p.yenile(); document.querySelector('#panel-sayfalar').scrollTop = 0; return true; })()`);
        await evalJs('window.__olc.panelBagla()');
        await durul();
        // 1) Hızlı sürükleme baştan sona
        await evalJs(`window.__olc.basla('panel-bellek-hizli')`);
        const c = await evalJs(`(() => { const a = document.querySelector('#panel-sayfalar'), r = a.getBoundingClientRect();
          const boy = Math.max(20, a.clientHeight * a.clientHeight / a.scrollHeight);
          return { x: Math.round(r.left + a.clientLeft + a.clientWidth + (r.width - a.clientWidth - 2 * a.clientLeft) / 2), y: Math.round(r.top + boy / 2), yol: a.clientHeight - boy }; })()`);
        await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, button: 'none', buttons: 0 });
        await gonder('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let k = 1; k <= 90; k++) { await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: Math.round(c.y + (c.yol + 10) * k / 90), button: 'left', buttons: 1 }); await bekle(16); }
        await gonder('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: Math.round(c.y + c.yol + 10), button: 'left', buttons: 0, clickCount: 1 });
        await durul(60000);
        const o1 = await evalJs('window.__olc.bitir()');
        const hizli = { ...(await onbellek()), istek: istekler(o1), panelBosHucreSn: o1.panel.bosHucreSn };
        // 2) Alan alan başa dönüş
        await evalJs(`window.__olc.basla('panel-bellek-yavas')`);
        for (let k = 0; k < 2000; k++) {
          const st = await evalJs(`(() => { const a = document.querySelector('#panel-sayfalar'); a.scrollTop = Math.max(0, a.scrollTop - a.clientHeight); return a.scrollTop; })()`);
          await durul(15000);
          if (st <= 0) break;
        }
        const o2 = await evalJs('window.__olc.bitir()');
        const yavas = { ...(await onbellek()), istek: istekler(o2) };
        await bekle(1500);
        await gonder('HeapProfiler.enable'); await gonder('HeapProfiler.collectGarbage');
        await bekle(1500);
        const olcumler = [];
        for (let k = 0; k < 3; k++) {
          const cikis = execFileSync('powershell', ['-NoProfile', '-File', path.join(KOK, 'test', 'surec_bellegi.ps1'), '-SurecId', String(pid)], { encoding: 'utf8' });
          olcumler.push(JSON.parse(cikis.trim()).toplamMB);
          await bekle(700);
        }
        const yigin = await evalJs('(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null)()');
        const pb = { belge: belgeAdi, tekrar: t + 1, hizli, yavas, bellekMB: olcumler.sort((x, y) => x - y)[1], olcumler, jsYiginMB: yigin };
        panelBellekleri.push(pb);
        console.log(`panel-bellek ${belgeAdi} #${t + 1}: hızlı sürükleme ${hizli.istek.n} istek (gecikme ortanca ${hizli.istek.ortanca} en ${hizli.istek.enFazla} ms),`
          + ` önbellek ${hizli.mb} MB / ${hizli.kayit} kayıt; başa dönüş ${yavas.istek.n} istek, önbellek ${yavas.mb} MB / ${yavas.kayit} kayıt, resimli hücre ${yavas.resimli};`
          + ` süreç ağacı ${pb.bellekMB} MB (${J(olcumler)}), JS yığını ${yigin} MB`);
      }
    }
    await evalJs('(() => { window.__pdefe.panel.genislikAyarla(240); return true; })()');
  }

  await gonder('Emulation.setCPUThrottlingRate', { rate: 1 });
  ws.close();
  fs.mkdirSync(path.dirname(CIKTI), { recursive: true });
  fs.writeFileSync(CIKTI, JSON.stringify({ cpu: CPU, belgeler: ozetler, sonuclar, bellek: bellekler, panelBellek: panelBellekleri }, null, 1));
  console.log('Yazıldı:', CIKTI);
  await hepsiniKapat().catch(() => {});
}
