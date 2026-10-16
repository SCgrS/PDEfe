// Senaryo 43 (0.2.8, kullanıcı isteği: "Yeni sekmeleri (boş 'Yeni sekme') tutup ayıramıyorum yeni pencereye. Bunu yapalım."): boş sekme
// (açılış sekmesi) de belgeli sekme gibi pencereye ayrılır.
//   1) Sekmenin sağ tık menüsü: "Pencereye ayır" boş sekmede de etkin (pencerenin tek sekmesinde, belgeli sekmedeki gibi, devre dışı).
//   2) Menüyle ayırma: yeni pencere kaynak pencerenin biraz sağında ve altında açılış ekranıyla açılır (tek "Yeni sekme"); kaynakta öteki
//      sekmeler kalır (belgesiz pencerede de); belgeli pencereden ayrılan boş sekmeden sonra etkin sekme belge olur.
//   3) Sürükleyerek ayırma (CDP fare olayları): eşiği geçince boş sekme de çubuktan ayrılır, ön izleme penceresi (hayalet) görünür (adı
//      "Yeni sekme", sayfa görüntüsü yok, yalnızca başlık), imleci izler; boş yere bırakınca yeni pencere açılır, sekmesi imlecin altında.
//   4) Esc: ayrılmış boş sekme yerine döner, yeni pencere açılmaz.
//   5) Başka pencerenin çubuğuna bırakma: belgeli pencerede işaretin gösterdiği yere, belgesiz pencerede sona yeni boş sekme olarak girer ve
//      etkin olur; kaynakta sekme kalkar.
//   6) Tek sekmesi boş olan pencere: sekme boş yere bırakılınca pencere oraya taşınır (yeni pencere açılmaz); başka pencereye bırakılınca
//      sekme oraya geçer, kaynak pencere kapanır (belgeli sekmedeki kural).
// İmleç gerçek imleç değildir: ana süreç imlecin yerini testten alır (test:imlec); pencereler ekran dışındadır.
// Kullanım: temiz veri klasörlü test örneği (baslat.ps1) açıkken  $env:PDEFE_CDP_PORT=9443; node test/surucu.mjs betik test/senaryo43.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 's43', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PYTHON = path.join(KOK, '.venv', 'Scripts', 'python.exe'), URET = path.join(KOK, 'test', 'ornek_pdf_uret.py');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
const BOS = 'Yeni sekme';

let hataSayisi = 0, tamam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (ok) tamam++; else hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const uret = (ad, sayfa) => { execFileSync(PYTHON, ['-X', 'utf8', URET, path.join(K, ad), String(sayfa), ad.replace('.pdf', '')]); return path.join(K, ad); };

/** Bir pencereye (CDP hedefi) ham girdi oturumu: fare düğmesi adımlar arasında basılı kalabilsin (senaryo22'deki gibi). */
async function girdi(hedefId) {
  const hepsi = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const ws = new WebSocket(hepsi.find((h) => h.id === hedefId).webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0; const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  const fare = (type, x, y, buttons) => gonder('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: 1 });
  return {
    bas: async (x, y) => { await fare('mouseMoved', x, y, 0); await fare('mousePressed', x, y, 1); },
    git: async (x0, y0, x1, y1, adim = 8) => { for (let i = 1; i <= adim; i++) await fare('mouseMoved', x0 + ((x1 - x0) * i) / adim, y0 + ((y1 - y0) * i) / adim, 1); },
    birak: (x, y) => fare('mouseReleased', x, y, 0),
    esc: async () => { for (const type of ['rawKeyDown', 'keyUp']) await gonder('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); },
    kapat: () => ws.close(),
  };
}

export default async function ({ evalJs, ekranGoruntusu, bekle, hedefler, hedefSec }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(ifade); } catch { v = null; } if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  let harita = new Map(), secili = null;
  /** Pencere listesini yeniler (kimlikler, artan sırada); seçili pencere değişmez, kapandıysa ilk pencere seçilir. */
  const yenile = async () => {
    const m = new Map();
    // Yeni açılmakta olan pencerenin sayfası listede hemen görünür, köprüsü (window.pdefe) biraz sonra kurulur: o sayfa bu turda atlanır
    for (const h of await hedefler()) {
      hedefSec(h.id);
      let k = null;
      try { k = await evalJs(`window.pdefe ? window.pdefe.cagir('pencere:kimlik') : null`); } catch { k = null; }
      if (k != null) m.set(k, h.id);
    }
    harita = m;
    if (!m.has(secili)) secili = [...m.keys()][0] ?? null;
    hedefSec(m.get(secili) || null);
    return [...m.keys()].sort((a, b) => a - b);
  };
  const P = (kimlik) => { if (!harita.has(kimlik)) throw new Error('Pencere yok: ' + kimlik); secili = kimlik; hedefSec(harita.get(kimlik)); };
  const oneAl = () => evalJs(`window.pdefe.cagir('test:oneAl')`);
  const ana = (kanal, ...args) => evalJs(`window.pdefe.cagir(${J(kanal)}, ...${J(args)})`);
  const pencereBilgisi = async (kimlik) => (await ana('test:pencereler')).find((p) => p.id === kimlik);
  const sekmeler = () => evalJs(`window.__pdefe.sekmeler.sekmeler.map((s) => ({ id: s.id, ad: s.ad, bos: !!s.baslangic, aktif: s.el.classList.contains('aktif') }))`);
  const sekmeAdlari = async () => (await sekmeler()).map((s) => s.ad);
  const durum = () => evalJs(`({ sekmeler: window.__pdefe.sekmeler.sekmeler.map((s) => s.ad), aktif: window.__pdefe.sekmeler.sekmeler.find((s) => s.el.classList.contains('aktif'))?.ad ?? null,
    acilis: !document.querySelector('#baslangic').hidden, belge: window.__pdefe.aktif()?.ad ?? null, kilitli: window.__pdefe.kilitli(), askida: !!document.querySelector('.sekme.askida'),
    ortu: !document.querySelector('#tasima-ortusu').hidden })`);
  const yeniSekme = async () => { await evalJs(`(window.__pdefe.komutCalistir('sekme.yeni'), true)`); await bekle(300); return (await sekmeler()).at(-1).id; };
  const ac = async (yol) => { await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(yol)}); return true; })()`); await kosul(`!!window.__pdefe.aktif()?.gorunum?.hazir`); await bekle(300); };
  const sekmeYeri = (id) => evalJs(`(() => { const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.id === ${J(id)}); if (!s) return null; const r = s.el.getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2), sol: r.left, ust: r.top, sag: r.right }; })()`);
  const cubuk = () => evalJs(`(() => { const r = document.querySelector('#sekme-cubugu').getBoundingClientRect(); return { ust: r.top, alt: r.bottom }; })()`);
  const sinif = (id) => evalJs(`(() => { const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.id === ${J(id)}); return s ? [...s.el.classList].filter((c) => c !== 'sekme' && c !== 'aktif' && c !== 'baslangic-sekmesi').join('+') : null; })()`);
  const sagTik = (id, yanit) => evalJs(`(async () => { await window.pdefe.cagir('test:diyalogKaydi'); await window.pdefe.cagir('test:diyalogYanitlari', 'menu:popup', [${J(yanit)}]); window.__pdefe.sekmeler.dispatchEvent(new CustomEvent('sagTik', { detail: { id: ${J(id)} } })); await new Promise((r) => setTimeout(r, 250)); const k = (await window.pdefe.cagir('test:diyalogKaydi')).filter((x) => x.kanal === 'menu:popup').at(-1); return k ? k.secenek.map((o) => (o.ayirici ? '-' : o.etiket + (o.devre ? ' (devre dışı)' : ''))) : null; })()`);
  const yeniPencere = async (once) => {
    const t0 = Date.now();
    for (;;) {
      const yeni = (await yenile()).find((k) => !once.includes(k)) ?? null;
      if (yeni != null && (await ana('test:pencereler')).find((p) => p.id === yeni)?.gorunur) return yeni;
      if (Date.now() - t0 > 12000) return null;
      await bekle(150);
    }
  };
  const pencereKapandi = async (kimlik) => { const t0 = Date.now(); for (;;) { if (!(await yenile()).includes(kimlik)) return true; if (Date.now() - t0 > 8000) return false; await bekle(200); } };
  const tasimaBitti = () => kosul(`!window.__pdefe.tasimaSuruyor() && !document.querySelector('.sekme.askida')`, 8000);
  const hayaletGorundu = () => kosul(`window.pdefe.cagir('test:hayalet').then((h) => !!h && h.gorunur)`, 4000);
  const hatalariTopla = () => evalJs(`(() => { if (!window.__s43Hatalar) { window.__s43Hatalar = []; addEventListener('error', (e) => window.__s43Hatalar.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__s43Hatalar.push(String(e.reason?.message || e.reason))); } return true; })()`);
  const hatalar = async () => { const t = []; for (const k of await yenile()) { P(k); t.push(...((await evalJs(`window.__s43Hatalar || []`)) || [])); } return t; };

  // ---------------------------------------------------------------- hazırlık
  fs.mkdirSync(K, { recursive: true });
  const A = uret('a.pdf', 3), B = uret('b.pdf', 2);
  let kimlikler = await yenile();
  if (kimlikler.length !== 1) throw new Error('Test tek pencereli, temiz bir örnekle başlamalı.');
  const P1 = kimlikler[0];
  P(P1);
  await hatalariTopla();
  await evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  await bekle(300);

  // ---------------------------------------------------------------- 1) sağ tık menüsü
  console.log('\n== 1) Sağ tık menüsü: "Pencereye ayır" boş sekmede de etkin (pencerenin tek sekmesinde devre dışı)');
  let s = await sekmeler();
  let menu = await sagTik(s[0].id, null);
  sonuc('1) Pencerenin tek sekmesi boş sekme: "Pencereye ayır" devre dışı (ayrılacak başka sekme yok)', s.length === 1 && s[0].bos && menu?.includes('Pencereye ayır (devre dışı)'), { s, menu });
  const ikinci = await yeniSekme();
  menu = await sagTik(ikinci, null);
  sonuc('1) İki boş sekmeli pencerede boş sekmenin menüsünde "Pencereye ayır" etkin', menu?.includes('Pencereye ayır') && !menu.includes('Pencereye ayır (devre dışı)'), menu);

  // ---------------------------------------------------------------- 2) menüyle ayırma
  console.log('\n== 2) Menüyle ayırma: yeni pencere açılış ekranıyla açılır');
  const p1Bilgi = await pencereBilgisi(P1);
  let once = await yenile();
  await sagTik(ikinci, 'ayir');
  const P2 = await yeniPencere(once);
  sonuc('2) Boş sekme "Pencereye ayır" ile yeni pencereye ayrıldı', P2 != null, await yenile());
  P(P1); await tasimaBitti();
  let d = await durum();
  sonuc('2) Kaynak (belgesiz) pencere açık, bir boş sekmesi kaldı; kilit ve askıda sekme yok', J(d.sekmeler) === J([BOS]) && d.acilis && !d.kilitli && !d.askida && !d.ortu, d);
  P(P2); await hatalariTopla();
  d = await durum();
  sonuc('2) Yeni pencerede tek "Yeni sekme", açılış ekranı görünür', J(d.sekmeler) === J([BOS]) && d.aktif === BOS && d.acilis && d.belge === null, d);
  const p2Bilgi = await pencereBilgisi(P2);
  sonuc('2) Yeni pencere kaynak pencerenin boyutunda, biraz sağında ve altında; başlığı "PDEfe"',
    p2Bilgi.sinirlar.x === p1Bilgi.sinirlar.x + 32 && p2Bilgi.sinirlar.y === p1Bilgi.sinirlar.y + 32 && p2Bilgi.sinirlar.width === p1Bilgi.sinirlar.width && p2Bilgi.baslik === 'PDEfe', { p1: p1Bilgi.sinirlar, p2: p2Bilgi.sinirlar, baslik: p2Bilgi.baslik });
  // Belgeli pencereden boş sekmeyi ayırma: kaynakta belge kalır ve etkin olur
  P(P1);
  await ac(A);
  const bosA = await yeniSekme();
  once = await yenile();
  await sagTik(bosA, 'ayir');
  const P3 = await yeniPencere(once);
  P(P1); await tasimaBitti();
  d = await durum();
  sonuc('2) Belgeli pencerenin boş sekmesi ayrıldı: kaynakta yalnızca belge, etkin; yeni pencerede açılış ekranı', P3 != null && J(d.sekmeler) === J(['a.pdf']) && d.belge === 'a.pdf' && !d.acilis
    && (P(P3), J((await durum()).sekmeler) === J([BOS])), { d, P3 });
  P(P3); await hatalariTopla();

  // ---------------------------------------------------------------- 3) sürükleyerek ayırma
  console.log('\n== 3) Sürükleyerek ayırma: eşik, ön izleme, boş yere bırakınca yeni pencere');
  P(P1);
  let bos = await yeniSekme();
  let yer = await sekmeYeri(bos), cb = await cubuk();
  let g = await girdi(harita.get(P1));
  await ana('test:imlec', { x: -1700, y: 400 });
  await g.bas(yer.x, yer.y);
  await g.git(yer.x, yer.y, yer.x - 10, cb.alt + 20);   // çubuğun 20 px altı: eşiğin (24) içinde
  await bekle(250);
  let sn = await sinif(bos);
  sonuc('3) Çubuğun 20 px altı: boş sekme taşınıyor, ayrılmadı, ön izleme yok', /tasiniyor/.test(sn) && !/ayrildi/.test(sn) && !(await ana('test:hayalet'))?.gorunur, sn);
  await g.git(yer.x - 10, cb.alt + 20, yer.x - 30, cb.alt + 80);
  const gorundu = await hayaletGorundu();
  sn = await sinif(bos);
  let hy = await ana('test:hayalet');
  sonuc('3) Eşiği geçince boş sekme çubuktan ayrıldı (0.2.7\'ye dek ayrılmıyordu)', /ayrildi/.test(sn), sn);
  sonuc('3) Ön izleme penceresi göründü: adı "Yeni sekme", sayfa görüntüsü yok, yalnızca başlık (240 px genişlikte, başlık kadar alçak)', gorundu && hy?.icerik?.ad === BOS && hy.icerik.onizleme === false && hy.sinirlar.width >= 240 && hy.sinirlar.width <= 300 && hy.sinirlar.height < 60, hy);
  await ekranGoruntusu(path.join(K, 'png', 'bos-ayrildi.png'));
  await ana('test:imlec', { x: -1650, y: 520 }); await bekle(250);
  hy = await ana('test:hayalet');
  const tutma = { x: -1650 - hy.sinirlar.x, y: 520 - hy.sinirlar.y };
  sonuc('3) Ön izleme imleci izler; sekme tutulduğu noktadan imlecin altında', tutma.x >= 30 && tutma.x <= 60 && tutma.y >= 8 && tutma.y <= 28, { sinirlar: hy.sinirlar, tutma });
  once = await yenile();
  const birakilan = { x: -2000, y: -1200 };   // hiçbir pencerenin kaplamadığı bir nokta (ekran dışında, pencerelerin üstünde)
  await ana('test:imlec', birakilan); await bekle(150);
  await g.birak(yer.x - 30, cb.alt + 80);
  const P4 = await yeniPencere(once);
  sonuc('3) Boş yere bırakınca yeni pencere açıldı', P4 != null, await yenile());
  P(P4); await hatalariTopla(); await bekle(300);
  const p4 = await pencereBilgisi(P4), p4Sekme = await sekmeYeri((await sekmeler())[0].id);
  const imlecSekmede = { x: birakilan.x - p4.icerik.x - p4Sekme.sol, y: birakilan.y - p4.icerik.y - p4Sekme.ust };
  d = await durum();
  sonuc('3) Yeni pencerede tek "Yeni sekme" ve açılış ekranı; sekmesi bırakılan yerde, imlecin altında', J(d.sekmeler) === J([BOS]) && d.acilis
    && Math.abs(imlecSekmede.x - 40) <= 3 && imlecSekmede.y >= 5 && imlecSekmede.y <= 25, { d, imlecSekmede, p4: p4.icerik });
  sonuc('3) Bırakıldıktan sonra ön izleme kalktı, sürükleme bitti', (await ana('test:hayalet')).gorunur === false && (await ana('test:surukleme')) === null);
  P(P1); await tasimaBitti();
  d = await durum();
  sonuc('3) Kaynak pencerede belge kaldı ve etkin; taşıma örtüsü kalktı', J(d.sekmeler) === J(['a.pdf']) && d.belge === 'a.pdf' && !d.ortu && !d.askida && !d.kilitli, d);

  // ---------------------------------------------------------------- 4) Esc
  console.log('\n== 4) Esc: ayrılmış boş sekme yerine döner');
  bos = await yeniSekme();
  yer = await sekmeYeri(bos);
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x + 20, cb.alt + 90);
  await hayaletGorundu();
  once = await yenile();
  await g.esc(); await bekle(400);
  sn = await sinif(bos);
  sonuc('4) Esc: boş sekme yerine döndü, ön izleme kalktı', sn === '' && (await ana('test:hayalet')).gorunur === false && J(await sekmeAdlari()) === J(['a.pdf', BOS]), { sn, ad: await sekmeAdlari() });
  await g.birak(yer.x + 20, cb.alt + 90); await bekle(400);
  sonuc('4) Esc\'ten sonra bırakmak bir şey yapmaz (yeni pencere yok)', (await yenile()).length === once.length && !(await evalJs(`!!document.querySelector('.sekme.askida')`)));

  // ---------------------------------------------------------------- 5) başka pencerenin çubuğuna bırakma
  console.log('\n== 5) Başka pencerenin çubuğuna bırakma: belgeli pencerede işaretin yerine, belgesiz pencerede sona');
  P(P3);
  await ac(B);
  sonuc('5) Hazırlık: P3\'te b.pdf açılış sekmesinin yerini aldı', J(await sekmeAdlari()) === J(['b.pdf']));
  await oneAl();
  const p3 = await pencereBilgisi(P3), bYer = await sekmeYeri((await sekmeler())[0].id), c3 = await cubuk();
  const nokta = { x: Math.round(p3.icerik.x + bYer.sag - 15), y: Math.round(p3.icerik.y + (c3.ust + c3.alt) / 2) };   // b'nin sağ yarısı: b'den sonra
  P(P1);
  yer = await sekmeYeri(bos);
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x + 10, cb.alt + 120);
  await hayaletGorundu();
  await ana('test:imlec', nokta);
  sonuc('5) Belgeli pencerenin çubuğu üstünde: hedef o pencere', await kosul(`window.pdefe.cagir('test:surukleme').then((s) => s?.hedef === ${P3})`, 4000), await ana('test:surukleme'));
  P(P3);
  sonuc('5) Hedef pencerede bırakma işareti görünür', await kosul(`!!document.querySelector('.sekme-birakma')`, 3000));
  P(P1);
  await g.birak(yer.x + 10, cb.alt + 120);
  P(P3);
  await kosul(`window.__pdefe.sekmeler.sekmeler.length === 2 && !window.__pdefe.tasimaSuruyor()`, 8000);
  d = await durum();
  sonuc('5) Belgeli pencereye bırakılan boş sekme işaretin yerine (b\'den sonra) girdi ve etkin: açılış ekranı; işaret kalktı', J(d.sekmeler) === J(['b.pdf', BOS]) && d.aktif === BOS && d.acilis && d.belge === null
    && !(await evalJs(`!!document.querySelector('.sekme-birakma')`)), d);
  sonuc('5) Sekmenin bırakıldığı pencere öne geldi', await kosul(`window.pdefe.cagir('test:pencereler').then((p) => p[0].id === ${P3})`, 4000));
  P(P1); await tasimaBitti();
  sonuc('5) Kaynakta boş sekme kalktı, belge duruyor; yeni pencere açılmadı', J(await sekmeAdlari()) === J(['a.pdf']) && (await yenile()).length === once.length, { ad: await sekmeAdlari(), p: await yenile() });
  // Belgesiz pencereye (P2: tek boş sekme): pencerenin her yeri bırakma alanı; sekme sona eklenir, eski boş sekme kalır
  P(P2); await oneAl();
  const p2 = await pencereBilgisi(P2);
  P(P1);
  bos = await yeniSekme();
  yer = await sekmeYeri(bos);
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x + 10, cb.alt + 100);
  await hayaletGorundu();
  await ana('test:imlec', { x: Math.round(p2.icerik.x + p2.icerik.width / 2), y: Math.round(p2.icerik.y + p2.icerik.height / 2) });
  sonuc('5) Belgesiz pencerenin ortası bırakma alanı', await kosul(`window.pdefe.cagir('test:surukleme').then((s) => s?.hedef === ${P2})`, 4000), await ana('test:surukleme'));
  await g.birak(yer.x + 10, cb.alt + 100);
  P(P2);
  await kosul(`window.__pdefe.sekmeler.sekmeler.length === 2 && !window.__pdefe.tasimaSuruyor()`, 8000);
  d = await durum();
  const p2Sekmeler = await sekmeler();
  sonuc('5) Belgesiz pencereye bırakılan boş sekme sona eklendi ve etkin; "Sekmeyi buraya bırakın" örtüsü kalktı', J(d.sekmeler) === J([BOS, BOS]) && p2Sekmeler[1].aktif
    && (await evalJs(`document.querySelector('#surukle-ortusu').hidden`)), { d, p2Sekmeler });
  P(P1); await tasimaBitti();
  sonuc('5) Kaynakta yalnızca belge', J(await sekmeAdlari()) === J(['a.pdf']), await sekmeAdlari());
  g.kapat();

  // ---------------------------------------------------------------- 6) tek sekmesi boş olan pencere
  console.log('\n== 6) Tek sekmesi boş olan pencere: boş yere bırakınca pencere taşınır; başka pencereye bırakınca kapanır');
  P(P4);
  const p4Once = await pencereBilgisi(P4);
  const tek = (await sekmeler())[0].id;
  yer = await sekmeYeri(tek); cb = await cubuk();
  g = await girdi(harita.get(P4));
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x + 5, cb.alt + 150);
  sonuc('6) Pencerenin tek boş sekmesi de çubuktan ayrılır (ön izleme)', await hayaletGorundu());
  once = await yenile();
  const tasinan = { x: -2300, y: -2500 };
  await ana('test:imlec', tasinan); await bekle(150);
  P(P4);
  await g.birak(yer.x + 5, cb.alt + 150);
  await kosul(`window.pdefe.cagir('test:pencereler').then((p) => { const s = p.find((x) => x.id === ${P4}).sinirlar; return s.x !== ${p4Once.sinirlar.x} || s.y !== ${p4Once.sinirlar.y}; })`, 5000);
  await tasimaBitti(); await bekle(200);
  const p4Sonra = await pencereBilgisi(P4), tekYer = await sekmeYeri(tek);
  const altinda = { x: tasinan.x - p4Sonra.icerik.x - tekYer.sol, y: tasinan.y - p4Sonra.icerik.y - tekYer.ust };
  sonuc('6) Boş yere bırakıldı: yeni pencere yok, pencere oraya taşındı (sekme imlecin altında), sekmesi aynı', (await yenile()).length === once.length
    && (p4Sonra.sinirlar.x !== p4Once.sinirlar.x || p4Sonra.sinirlar.y !== p4Once.sinirlar.y) && Math.abs(altinda.x - 40) <= 3 && altinda.y >= 5 && altinda.y <= 25
    && (P(P4), J(await sekmeAdlari()) === J([BOS])) && (await ana('test:hayalet')).gorunur === false, { p4Once: p4Once.sinirlar, p4Sonra: p4Sonra.sinirlar, altinda });
  // Başka pencereye (P3: b.pdf + boş sekme) bırakılınca sekme oraya geçer, kaynak pencere kapanır
  P(P3); await oneAl();
  const p3b = await pencereBilgisi(P3), c3b = await cubuk(), sonYer = await sekmeYeri((await sekmeler()).at(-1).id);
  const hedefNokta = { x: Math.round(p3b.icerik.x + sonYer.sag - 10), y: Math.round(p3b.icerik.y + (c3b.ust + c3b.alt) / 2) };
  P(P4);
  yer = await sekmeYeri(tek);
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x + 5, cb.alt + 150);
  await hayaletGorundu();
  await ana('test:imlec', hedefNokta);
  await kosul(`window.pdefe.cagir('test:surukleme').then((s) => s?.hedef === ${P3})`, 4000);
  P(P4);
  await g.birak(yer.x + 5, cb.alt + 150);
  sonuc('6) Tek boş sekmesi başka pencereye bırakılan pencere kapandı', await pencereKapandi(P4), await yenile());
  P(P3);
  await kosul(`window.__pdefe.sekmeler.sekmeler.length === 3 && !window.__pdefe.tasimaSuruyor()`, 8000);
  d = await durum();
  sonuc('6) Hedef pencerede yeni boş sekme sonda ve etkin', J(d.sekmeler) === J(['b.pdf', BOS, BOS]) && (await sekmeler())[2].aktif && d.acilis, d);
  g.kapat();

  // ---------------------------------------------------------------- bitiş
  const h = await hatalar();
  sonuc('Pencerelerde sayfa hatası yok', !h.length, h.slice(0, 5));
  console.log(hataSayisi ? `\n${hataSayisi} HATA / ${tamam + hataSayisi}` : `\nBÜTÜN DENETİMLER GEÇTİ (${tamam})`);
  if (hataSayisi) process.exitCode = 1;
}
