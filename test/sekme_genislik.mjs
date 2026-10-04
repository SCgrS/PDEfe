// Sekme genişliği (0.1.21'e dek sabit 118 px; artık sekme sayısına göre 118–220 px, ayrıntısı senaryo23'te): dar pencerede 12 sekme en dar
// genişlikte (118 px) ve kaydırılır; her sekme aynı genişlikte, uzun ad üç noktayla kısalır, ipucunda tam ad ve yol; etkin sekme görünür
// kaydırılır; ◀ ▶, Ctrl+1–9, sürükleyerek sıralama (0.1.14'ten beri işaretçi olaylarıyla: sekme imleci izler, ötekiler kayarak yer
// açar, Esc iptal eder, liste uçta kendiliğinden kayar), Ctrl+Tab seçicisi, açık belgeler listesi ve Farklı kaydet sonrası ipucu.
// Ekran görüntüleri test/png/sekme altına.
// Kullanım: powershell -File test\baslat.ps1 -Port 9321 -Veri <klasör> [-Boyut "720,700"] [-Tema koyu]; $env:PDEFE_CDP_PORT=9321
//           node test\surucu.mjs betik test\sekme_genislik.mjs   (PDEFE_EK: ekran görüntüsü adlarına ek, ör. "dar-koyu")
import fs from 'node:fs';
import path from 'node:path';

const K = path.resolve('test/cikti/sekmeler');
const ADLAR = [
  'ustyazi (85).pdf', '(2)TensipZapti (9).pdf', 'a.pdf', 'Bilirkişi Raporu - Ek 1 - Hesap Tablosu ve Açıklamalar (son hali).pdf',
  '2099_12_BLR_BILIRKISI_EKRAPORU.pdf', 'İcra Emri (Örnek 7) düzeltilmiş.pdf', 'ustyazi (86).pdf', '(3)DurusmaZapti (12).pdf',
  'TBK.pdf', 'Tebligat Mazbatası - Ağustos 2026.pdf', 'Karar_2026_1234_Esas_2025_987.pdf', 'ek.pdf',
];
const KAYNAKLAR = ['dergipark_5104529_zamanasimi.pdf', 'dergipark_3972595_ttk_tbk.pdf'];
const EK = process.env.PDEFE_EK ? '-' + process.env.PDEFE_EK : '';
const js = (d) => JSON.stringify(d);

let hata = 0, tamam = 0;
function denetle(ad, kosul, ayrinti = '') {
  if (kosul) tamam++; else hata++;
  console.log(`${kosul ? 'TAMAM' : 'HATA '}  ${ad}${ayrinti ? '  — ' + ayrinti : ''}`);
}

/** surucu.mjs'teki gibi CDP bağlantısı; sürükleme ortasında ölçüm ve ekran görüntüsü için tek oturumda ham komut gerekir. */
async function cdp() {
  const hedefler = await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT || 9222}/json`)).json();
  const sayfa = hedefler.find((h) => h.type === 'page' && h.url.startsWith('pdefe://'));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0; const bekleyen = new Map(); const dinleyiciler = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } else if (d.method) dinleyiciler.forEach((f) => f(d)); };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder, dinle: (f) => dinleyiciler.push(f) };
}

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, tus, fare }) {
  fs.mkdirSync(K, { recursive: true });
  ADLAR.forEach((ad, i) => { const h = path.join(K, ad); if (!fs.existsSync(h)) fs.copyFileSync(path.resolve('test/pdf', KAYNAKLAR[i % 2]), h); });
  await evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); for (const ad of ${js(ADLAR)}) await p.dosyaAc(${js(K + path.sep)} + ad); await new Promise((r) => setTimeout(r, 1500)); return true; })()`);

  const olc = () => evalJs(`(() => {
    const liste = document.querySelector('#sekme-liste'), lr = liste.getBoundingClientRect();
    const sekmeler = [...document.querySelectorAll('.sekme')].map((s) => { const a = s.querySelector('.ad'), r = s.getBoundingClientRect();
      return { ad: a.textContent, g: r.width, kisaldi: a.scrollWidth > a.clientWidth, ipucu: s.title, gorunur: r.left >= lr.left - 0.5 && r.right <= lr.right + 0.5, aktif: s.classList.contains('aktif') }; });
    return { sekmeler, genislik: innerWidth, tema: document.documentElement.dataset.tema, ustTasma: getComputedStyle(document.querySelector('.sekme .ad')).textOverflow };
  })()`);
  let o = await olc();
  const genislikler = new Set(o.sekmeler.map((s) => Math.round(s.g)));
  denetle(`${o.sekmeler.length} sekmenin genişliği aynı`, genislikler.size === 1, [...genislikler].join(', ') + ' px');
  const kisa = (ad) => o.sekmeler.find((s) => s.ad === ad);
  denetle('sığmayan sekmeler en dar genişlikte: 118 px (0.1.4\'teki 168 px\'ten %30 dar)', genislikler.size === 1 && genislikler.has(118), [...genislikler].join(', ') + ' px');
  denetle('"ustyazi (85).pdf" ve "ustyazi (86).pdf" tam görünür', !kisa('ustyazi (85).pdf').kisaldi && !kisa('ustyazi (86).pdf').kisaldi);
  denetle('"(2)TensipZapti (9).pdf" üç noktayla kısalır (tam adı ipucunda)', kisa('(2)TensipZapti (9).pdf').kisaldi);
  denetle('uzun ad üç noktayla kısalır', kisa('Bilirkişi Raporu - Ek 1 - Hesap Tablosu ve Açıklamalar (son hali).pdf').kisaldi && o.ustTasma === 'ellipsis');
  denetle('ipucu: tam ad + yol', o.sekmeler.every((s) => s.ipucu === `${s.ad}\n${K}${path.sep}${s.ad}`), js(o.sekmeler[3].ipucu));
  denetle('etkin (son açılan) sekme görünür', o.sekmeler.find((s) => s.aktif)?.gorunur);
  await ekranGoruntusu(`test/png/sekme/sekmeler-12${EK}.png`);

  // Ctrl+1 / Ctrl+9: etkin sekme kaydırılıp görünür olur
  await tus('1', ['ctrl']); await bekle(400); o = await olc();
  denetle('Ctrl+1: ilk sekme etkin ve görünür', o.sekmeler[0].aktif && o.sekmeler[0].gorunur);
  await tus('9', ['ctrl']); await bekle(400); o = await olc();
  denetle('Ctrl+9: son sekme etkin ve görünür', o.sekmeler.at(-1).aktif && o.sekmeler.at(-1).gorunur);
  // ▶ ve ◀ düğmeleri (basış: bir sonraki / önceki sekme)
  await tus('1', ['ctrl']); await bekle(300);
  const sonraki = await evalJs(`(() => { const r = document.querySelector('#sekme-sonraki').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  const onceki = await evalJs(`(() => { const r = document.querySelector('#sekme-onceki').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  for (let i = 0; i < 6; i++) { await tikla(...sonraki); await bekle(150); }
  o = await olc();
  denetle('▶ altı kez: 7. sekme etkin ve görünür', o.sekmeler[6].aktif && o.sekmeler[6].gorunur, o.sekmeler.find((s) => s.aktif)?.ad);
  await tikla(...onceki); await bekle(300); o = await olc();
  denetle('◀: 6. sekme etkin ve görünür', o.sekmeler[5].aktif && o.sekmeler[5].gorunur);
  // 0.1.12 (kullanıcı isteği): başa dönmez — ilk sekmede ◀, son sekmede ▶ devre dışı ve etkisiz; tekerlek de uçta durur
  const oklar = () => evalJs(`[document.querySelector('#sekme-onceki').disabled, document.querySelector('#sekme-sonraki').disabled]`);
  const listeOrtasi = await evalJs(`(() => { const r = document.querySelector('#sekme-liste').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  await tus('1', ['ctrl']); await bekle(300);
  let d = await oklar();
  await tikla(...onceki); await bekle(300);
  await fare([{ tur: 'hareket', x: listeOrtasi[0], y: listeOrtasi[1] }, { tur: 'tekerlek', x: listeOrtasi[0], y: listeOrtasi[1], deltaY: -120, bekle: 300 }]);
  o = await olc();
  denetle('ilk sekmede ◀ devre dışı; ◀ ve yukarı tekerlek ilk sekmede bırakır (son sekmeye dönmez)', d[0] === true && d[1] === false && o.sekmeler[0].aktif, js(d));
  await tus('9', ['ctrl']); await bekle(300);
  d = await oklar();
  await tikla(...sonraki); await bekle(300);
  await fare([{ tur: 'hareket', x: listeOrtasi[0], y: listeOrtasi[1] }, { tur: 'tekerlek', x: listeOrtasi[0], y: listeOrtasi[1], deltaY: 120, bekle: 300 }]);
  o = await olc();
  denetle('son sekmede ▶ devre dışı; ▶ ve aşağı tekerlek son sekmede bırakır (ilk sekmeye dönmez)', d[0] === false && d[1] === true && o.sekmeler.at(-1).aktif, js(d));
  // Bir tekerlek hareketi bir sekme (0.2.1): dokunmatik yüzey tek hareketi kare başına küçük adımlı olaylarla gönderir (sayfa olayıyla:
  // CDP'nin tekerlek olayı çentik gibi wheelDeltaY -120 taşır). 150 ms'ten kısa aralıklı aynı yönlü olaylar bir harekettir; fare
  // tekerleğinin çentiği (wheelDelta 120'nin katı, Windows) eskisi gibi çentik başına bir sekme. Süre olayın zamanından (timeStamp):
  // olaylar önceden, aralarında [ara] ms bekleyerek oluşturulur, sonra gönderilir (sekme geçişinin meşgul ettiği ana iş parçacığı süreyi bozmasın)
  const teker = (olaylar) => evalJs(`(async () => {
    const c = document.querySelector('#sekme-liste'), hazir = [];
    for (const [dy, ara, w = 0] of ${js(olaylar)}) {
      hazir.push(new WheelEvent('wheel', { deltaY: dy, wheelDeltaY: w, bubbles: true, cancelable: true }));
      const t0 = performance.now(); while (performance.now() - t0 < ara) { /* bekle */ }
    }
    for (const e of hazir) { c.dispatchEvent(e); await new Promise((r) => setTimeout(r, 5)); }
    await new Promise((r) => setTimeout(r, 300));
    const s = window.__pdefe.sekmeler; return s.sekmeler.findIndex((x) => x.id === s.aktifId);
  })()`);
  await tus('1', ['ctrl']); await bekle(300);
  let t = await teker(Array.from({ length: 12 }, () => [4, 16]));
  denetle('tekerlek: dokunmatik yüzeyin tek hareketi (16 ms arayla 12 küçük olay) bir sekme geçer', t === 1, 'etkin ' + t);
  t = await teker([[0, 10], ...Array.from({ length: 8 }, () => [9, 16]), [3, 120], [2, 140], [1, 140], [0, 10]]);
  denetle('tekerlek: eylemsizlikle süren hareket (arada 140 ms) bir sekme; deltası 0 olan baş / son olayı sayılmaz', t === 2, 'etkin ' + t);
  t = await teker([[4, 200], [4, 200]]);
  denetle('tekerlek: 150 ms\'ten uzun arayla iki hareket iki sekme', t === 4, 'etkin ' + t);
  t = await teker([[-4, 16], [-4, 16], [-4, 16]]);
  denetle('tekerlek: ters yöndeki hareket bir sekme geri', t === 3, 'etkin ' + t);
  t = await teker([[100, 20, -120], [100, 20, -120], [100, 20, -120]]);
  denetle('tekerlek: fare tekerleğinin hızlı üç çentiği üç sekme (Windows)', t === 6, 'etkin ' + t);
  await fare([{ tur: 'hareket', x: listeOrtasi[0], y: listeOrtasi[1] }, { tur: 'tekerlek', x: listeOrtasi[0], y: listeOrtasi[1], deltaY: -100, bekle: 20 },
    { tur: 'tekerlek', x: listeOrtasi[0], y: listeOrtasi[1], deltaY: -100, bekle: 300 }]);
  t = await evalJs(`(() => { const s = window.__pdefe.sekmeler; return s.sekmeler.findIndex((x) => x.id === s.aktifId); })()`);
  denetle('tekerlek: gerçek (CDP) tekerleğin hızlı iki çentiği iki sekme geri', t === 4, 'etkin ' + t);

  // Sürükleyerek sıralama (0.1.14'ten beri işaretçi olaylarıyla). Gerçek fare olayları CDP'den verilir (Input.dispatchMouseEvent; gerçek
  // fareye dokunulmaz). Sürükleme ortasında ölçülür: sekme imlecin altında, aradaki sekmeler bir sekme boyu kaymış, tarayıcının
  // sürükle-bırakı yok (draggable değil). disari: imleç çubuğun biraz altına (belge alanının üst kenarına) inip orada bırakılır; 0.1.19'dan
  // beri çubuktan 24 px'ten çok uzaklaşan sekme çubuktan ayrılır ve dışarıda bırakılınca yeni pencerede açılır (test/senaryo22.mjs),
  // eşiğin içinde kalan sekme eskisi gibi çubukta kalır. iptal: bırakmadan önce Esc.
  const durum = () => evalJs(`({ model: window.__pdefe.sekmeler.sekmeler.map((s) => s.ad), dom: [...document.querySelectorAll('.sekme .ad')].map((a) => a.textContent),
    kalan: [...document.querySelectorAll('.sekme')].filter((s) => s.style.transform || s.classList.contains('tasiniyor') || s.classList.contains('yerlesiyor')).length
      + (document.querySelector('#sekme-liste').classList.contains('siralaniyor') ? 1 : 0) })`);
  async function surukleBirak(kaynak, hedef, { disari = false, iptal = false, ekran = null, x = null } = {}) {
    await tus('1', ['ctrl']); await bekle(400);   // dar pencerede de ilk sekmeler görünsün
    const { ws, gonder } = await cdp();
    const k = await evalJs(`[...document.querySelectorAll('.sekme')].map((s) => { const r = s.getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }; })`);
    const [a, b] = [k[kaynak], k[hedef]];
    const cubukAlti = await evalJs(`Math.round(document.querySelector('#sekme-cubugu').getBoundingClientRect().bottom)`);
    // x: imlecin bırakılacağı yer; verilmezse hedef sekmenin tutma noktası: sürüklenen sekme hedefin tam üstüne gelir, hedefin dörtte
    // birinden çoğuna girer, sonrakine girmez (0.1.21'e dek sekmenin ortası komşunun ortasına varınca yer değişiyordu, hedefin sağ yarısına
    // bırakılıyordu)
    const son = { x: x ?? b.x, y: disari ? cubukAlti + 18 : a.y };
    const fareOlayi = (type, x, y, buttons) => gonder('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: 1 });
    await fareOlayi('mouseMoved', a.x, a.y, 0);
    await fareOlayi('mousePressed', a.x, a.y, 1);
    for (let i = 1; i <= 10; i++) await fareOlayi('mouseMoved', a.x + ((son.x - a.x) * i) / 10, a.y + ((son.y - a.y) * i) / 10, 1);
    await bekle(300);   // öteki sekmelerin kayması (0,15 sn) bitsin
    const ortada = await evalJs(`(() => { const t = document.querySelector('.sekme.tasiniyor'), r = t?.getBoundingClientRect();
      return { tasinan: t?.querySelector('.ad').textContent ?? null, sol: r ? Math.round(r.left) : null, ust: r ? Math.round(r.top) : null,
        kaymis: [...document.querySelectorAll('.sekme:not(.tasiniyor)')].filter((s) => s.style.transform).length,
        opak: t ? getComputedStyle(t).opacity === '1' && getComputedStyle(t).backgroundColor !== 'rgba(0, 0, 0, 0)' : false,
        draggable: [...document.querySelectorAll('.sekme')].some((s) => s.draggable) }; })()`);
    ortada.solBeklenen = son.x - 40; ortada.ustBeklenen = Math.round(a.y - 15);
    if (ekran) await ekran();
    if (iptal) {
      await gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await bekle(300);
    }
    await fareOlayi('mouseReleased', son.x, son.y, 0);
    ws.close();
    await bekle(400);   // sekmenin yerine kayması (0,15 sn) ve bitiş
    return { ortada, ...(await durum()) };
  }
  // 1. sekmeyi 3. sekmenin üstüne sürükle → ortada: sekme imlecin altında, çubuğun hizasında; 2. ve 3. sekme sola kaymış
  let r = await surukleBirak(0, 2, { ekran: () => ekranGoruntusu(`test/png/sekme/surukleme-ortasi${EK}.png`) });
  denetle('sürükle-bırak ortası: sürüklenen sekme imlecin altında, çubukta (yukarı-aşağı oynamaz), opak; tarayıcı sürüklemesi yok',
    r.ortada.tasinan === ADLAR[0] && Math.abs(r.ortada.sol - r.ortada.solBeklenen) <= 2 && Math.abs(r.ortada.ust - r.ortada.ustBeklenen) <= 2 && r.ortada.opak && !r.ortada.draggable, js(r.ortada));
  denetle('sürükle-bırak ortası: aradaki iki sekme kayarak yer açmış', r.ortada.kaymis === 2, js(r.ortada));
  denetle('sürükle-bırak: 1. sekme 3.nün arkasına taşındı (model ve DOM), sürükleme izi kalmadı', js(r.model.slice(0, 3)) === js([ADLAR[1], ADLAR[2], ADLAR[0]]) && js(r.dom) === js(r.model) && r.kalan === 0, js({ ilk3: r.model.slice(0, 3), kalan: r.kalan }));
  // İmleç çubuğun biraz altına (ayırma eşiğinin içinde) inip orada bırakılınca da sekme çubukta kalır ve görünen sıra geçerli olur
  // (Ctrl+1 görünen ilk sekmeyi seçer); sekme ayrılmaz, yeni pencere açılmaz
  r = await surukleBirak(0, 1, { disari: true });
  denetle('sürükle-bırak (imleç çubuğun 18 px altında bırakıldı): sekme çubukta kaldı, ayrılmadı; model DOM sırasıyla aynı', r.ortada.kaymis === 1 && Math.abs(r.ortada.ust - r.ortada.ustBeklenen) <= 2 && js(r.dom) === js(r.model) && js(r.model.slice(0, 3)) === js([ADLAR[2], ADLAR[1], ADLAR[0]]) && r.kalan === 0
    && (await evalJs(`window.pdefe.cagir('pencere:sayi')`)) === 1 && !(await evalJs(`!!document.querySelector('.sekme.ayrildi, .sekme.askida')`)), js({ ortada: r.ortada, ilk3: r.model.slice(0, 3) }));
  await tus('1', ['ctrl']); await bekle(300);
  denetle('sürükle-bırak sonrası Ctrl+1: görünen ilk sekme seçilir', (await evalJs(`window.__pdefe.aktif().ad`)) === r.dom[0]);
  // En sola: sekme listenin solunun ötesine dek çekilince ilk sekme olur (sürüklenen sekme uçta durur, ortası uçtaki sekmenin ortasıyla
  // çakışır; bu düzeltilmeden önce bir önceki yere düşüyordu)
  const ad2 = (await durum()).dom[2];
  const listeSol = await evalJs(`Math.round(document.querySelector('#sekme-liste').getBoundingClientRect().left)`);
  r = await surukleBirak(2, 0, { x: Math.max(1, listeSol - 40) });
  denetle('sürükle-bırak en sola (imleç listenin solunun ötesinde): sekme ilk sırada', r.dom[0] === ad2 && js(r.dom) === js(r.model) && r.kalan === 0, js({ ilk: r.dom[0], beklenen: ad2 }));
  // Esc: sekmeler eski yerlerine kayar, sıra değişmez
  const eskiSira = r.model;
  r = await surukleBirak(0, 3, { iptal: true });
  denetle('sürükle-bırak Esc ile iptal: sıra değişmedi, sürükleme izi kalmadı', r.ortada.kaymis === 3 && js(r.model) === js(eskiSira) && js(r.dom) === js(eskiSira) && r.kalan === 0, js({ ortada: r.ortada, kalan: r.kalan }));
  // En sağa: imleç listenin sağ ucunun ötesinde tutulur. Sekmeler sığmıyorsa liste kendiliğinden sonuna dek kayar (uca uzaklığa göre
  // hızlanır); bırakınca sekme en sonda
  {
    await tus('1', ['ctrl']); await bekle(400);
    const { ws, gonder } = await cdp();
    const l = await evalJs(`(() => { const l = document.querySelector('#sekme-liste'), r = l.getBoundingClientRect(), s = document.querySelector('.sekme').getBoundingClientRect();
      return { sag: Math.round(r.right), x: Math.round(s.left + 40), y: Math.round(s.top + s.height / 2), kaydirma: l.scrollLeft, enCok: l.scrollWidth - l.clientWidth, gen: innerWidth }; })()`);
    const ad0 = (await durum()).dom[0], hedefX = Math.min(l.gen - 2, l.sag + 40), tasiyor = l.enCok > 1;
    await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: l.x, y: l.y, button: 'none', buttons: 0 });
    await gonder('Input.dispatchMouseEvent', { type: 'mousePressed', x: l.x, y: l.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: l.x + ((hedefX - l.x) * i) / 10, y: l.y, button: 'left', buttons: 1 });
    await bekle(1500);
    const kaydirma = await evalJs(`document.querySelector('#sekme-liste').scrollLeft`);
    await gonder('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hedefX, y: l.y, button: 'left', buttons: 0, clickCount: 1 });
    ws.close();
    await bekle(400);
    r = await durum();
    denetle(`sürükle-bırak en sağa: sekme son sırada${tasiyor ? '; imleç ucun ötesinde tutulunca liste kendiliğinden sonuna dek kaydı' : ''}`,
      r.dom.at(-1) === ad0 && (!tasiyor || kaydirma >= l.enCok - 1) && js(r.dom) === js(r.model) && r.kalan === 0, js({ son: r.dom.at(-1), beklenen: ad0, once: l.kaydirma, sonra: kaydirma, enCok: l.enCok }));
    if (!tasiyor) console.log('       (sekmeler sığıyor: kendiliğinden kaydırma denenmedi; dar pencerede çalıştırın)');
  }

  // Ctrl+Tab seçicisi ve açık belgeler listesi (uzun adlar)
  await tus('Tab', ['ctrl']); await bekle(600);
  await ekranGoruntusu(`test/png/sekme/ctrl-tab${EK}.png`);
  await tus('Escape'); await tus('Control'); await bekle(200);
  await tikla(...(await evalJs(`(() => { const r = document.querySelector('#sekme-acilir').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`)));
  await bekle(300);
  denetle('açık belgeler listesi açıldı', await evalJs(`!document.querySelector('#belge-listesi').hidden && document.querySelectorAll('#belge-listesi li').length === ${ADLAR.length}`));
  await ekranGoruntusu(`test/png/sekme/belge-listesi${EK}.png`);
  await tus('Escape'); await bekle(200);

  // Değişiklik noktası: sekme genişliği değişmez, ad biraz daha kısalır
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${js(ADLAR[1])}); await p.sekmeSec(b.id); p.sekmeler.guncelle(b.id, { degisti: true }); return true; })()`);
  await bekle(200); o = await olc();
  denetle('değişiklik noktalı sekme aynı genişlikte', Math.round(o.sekmeler.find((s) => s.ad === ADLAR[1]).g) === [...genislikler][0]);
  await ekranGoruntusu(`test/png/sekme/degisti${EK}.png`);
  await evalJs(`(() => { const p = window.__pdefe; p.sekmeler.guncelle(p.aktif().id, { degisti: false }); return true; })()`);

  // Farklı kaydet: sekme adı ve ipucu yeni dosyaya göre
  const yeni = path.join(K, 'farkli kaydedilen uzun bir belge adı (1).pdf');
  if (fs.existsSync(yeni)) fs.unlinkSync(yeni);
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:kaydetDiyalog', [${js(yeni)}])`);
  const kayit = await evalJs(`(async () => { const p = window.__pdefe; const ok = await p.belgeKaydet(p.aktif(), true); const s = p.sekmeler.bul(p.aktif().id); return { ok, ad: s.ad, yol: s.yol, ipucu: s.el.title, dom: s.el.querySelector('.ad').textContent }; })()`);
  denetle('Farklı kaydet: sekme adı, yolu ve ipucu güncellendi', kayit.ok && kayit.ad === path.basename(yeni) && kayit.yol === yeni && kayit.ipucu === `${path.basename(yeni)}\n${yeni}` && kayit.dom === kayit.ad, js(kayit));

  // Ctrl+Tab seçicisi arka planda açılmış (hiç etkin olmamış) sekmeleri de gösterir: son kullanım sırasından sonra (0.2.1; önceden
  // yalnızca etkin olmuş sekmeler, tek etkin sekme varken Ctrl+Tab hiçbir şey yapmıyordu). Ayır › Tümünü aç böyle açar
  await evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true });
    await p.dosyaAc(${js(path.join(K, ADLAR[2]))}); await p.dosyaAc(${js(path.join(K, ADLAR[0]))}, { arkaPlanda: true }); await p.dosyaAc(${js(path.join(K, ADLAR[1]))}, { arkaPlanda: true });
    await new Promise((r) => setTimeout(r, 800)); return true; })()`);
  const secici = () => evalJs(`(() => { const s = window.__pdefe.sekmeler; return { acik: s.seciciAcik, adaylar: [...document.querySelectorAll('#sekme-secici .aday .ad')].map((x) => x.textContent),
    secili: document.querySelector('#sekme-secici .aday.secili .ad')?.textContent ?? null, aktif: s.bul(s.aktifId)?.ad, mru: s.mru.map((id) => s.bul(id)?.ad) }; })()`);
  let sc = await secici();
  denetle('Ctrl+Tab hazırlık: biri önde, ikisi arka planda açıldı (son kullanım sırasında yalnızca öndeki)', sc.aktif === ADLAR[2] && js(sc.mru) === js([ADLAR[2]]), js(sc));
  await tus('Tab', ['ctrl']); await bekle(400);
  sc = await secici();
  denetle('Ctrl+Tab seçicisi arka planda açılmış sekmeleri de gösterir; ikinci aday seçili', sc.acik && js(sc.adaylar) === js([ADLAR[2], ADLAR[0], ADLAR[1]]) && sc.secili === ADLAR[0], js(sc));
  await tus('Control'); await bekle(500);
  sc = await secici();
  denetle('Ctrl bırakılınca seçilen (hiç etkin olmamış) sekmeye geçilir', !sc.acik && sc.aktif === ADLAR[0] && js(sc.mru) === js([ADLAR[0], ADLAR[2]]), js(sc));
  await tus('Tab', ['ctrl']); await tus('Tab', ['ctrl']); await bekle(300);
  sc = await secici();
  denetle('ikinci açılış: son kullanım sırası, sonra hiç etkin olmamış sekme; iki Tab onu seçer', js(sc.adaylar) === js([ADLAR[0], ADLAR[2], ADLAR[1]]) && sc.secili === ADLAR[1], js(sc));
  await tus('Control'); await bekle(500);
  sc = await secici();
  denetle('Ctrl bırakılınca son (hiç etkin olmamış) sekmeye geçilir', sc.aktif === ADLAR[1], js(sc));

  await evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); return true; })()`);
  console.log(`\n${tamam} tamam, ${hata} hata (pencere genişliği ${o.genislik} px, tema ${o.tema})`);
}
