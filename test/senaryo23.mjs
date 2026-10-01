// Senaryo 23 (0.1.21, kullanıcı istekleri): sekme çubuğu ve PDF'i kopyala.
//   1) Sekme çubuğu hiç kapanmaz: pencere açılış sekmesiyle ("Yeni sekme") açılır, son sekme kapanınca yerine o gelir; pencerenin tek
//      sekmesi açılış sekmesiyse kapatılmaz (× gizli, Kapat devre dışı, orta tık etkisiz), pencerede açılan ya da başka pencereden gelen
//      ilk belge onun yerini alır; tek açılış sekmesinde Ctrl+W pencereyi kapatır.
//      0.1.22 (kullanıcı isteği): belgesiz pencerede de + / Ctrl+T yeni boş sekme açar; son belge kapanınca yanındaki açılış sekmeleri kalır
//      (0.1.21'de teke iniyordu); birden çok açılış sekmesi varken arka planda açılan ya da taşınan belge onların yanına eklenir.
//   2) Sürüklenen sekme komşusunun dörtte birine girince yer değiştirir (önceden ortası komşunun ortasına varınca: tam üstüne gelince).
//   3) Sekme genişliği sekme sayısına göre: az sekmede 220 px, sığmayınca birlikte daralır, 118 px'e inince liste kaydırılır; × ile
//      kapatırken genişlik imleç çubuktan çıkana dek kilitli (sıradaki sekmenin × düğmesi imlecin altına gelir).
//   4) Sekmede sağ tık › PDF'i kopyala (Yolu kopyala'nın altında): dosya panoya; kaydedilmemiş değişiklik varsa önce sorulur.
//   5) Kopyala düğmesinin sorusu ve adları "paylaş" değil "kopyala".
// Gerçek fare olayları CDP'den verilir (gerçek fareye dokunulmaz); pencereler ekran dışındadır.
// Kullanım: temiz veri klasörlü test örneği açıkken
//   powershell -File test\baslat.ps1 -Port 9423 -Veri "$env:TEMP\pdefe-s23-9423"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9423; node test\surucu.mjs betik test\senaryo23.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Belgeler test/cikti/s23/<zaman>/ altına üretilir (ornek_pdf_uret.py; gerçek belge kullanılmaz).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 's23', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PYTHON = path.join(KOK, '.venv', 'Scripts', 'python.exe'), URET = path.join(KOK, 'test', 'ornek_pdf_uret.py');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);
const EN_GENIS = 220, EN_DAR = 118, YER_DEGISTIRME = 0.25;

let hataSayisi = 0, tamam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (ok) tamam++; else hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};
const uret = (ad, sayfa = 2) => { execFileSync(PYTHON, ['-X', 'utf8', URET, path.join(K, ad), String(sayfa), ad.replace('.pdf', '')]); return path.join(K, ad); };

/** Bir pencereye (CDP hedefi) ham fare oturumu: düğme adımlar arasında basılı kalabilsin. */
async function girdi(hedefId) {
  const hepsi = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const ws = new WebSocket(hepsi.find((h) => h.id === hedefId).webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0; const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  const fare = (type, x, y, buttons, button = 'left') => gonder('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : button, buttons, clickCount: 1 });
  return {
    git: (x, y) => fare('mouseMoved', x, y, 0),
    bas: async (x, y) => { await fare('mouseMoved', x, y, 0); await fare('mousePressed', x, y, 1); },
    /** Basılı tutarak (x1, y)'ye adım adım gider. */
    surukle: async (x0, x1, y, adim = 8) => { for (let i = 1; i <= adim; i++) await fare('mouseMoved', x0 + ((x1 - x0) * i) / adim, y, 1); },
    birak: (x, y) => fare('mouseReleased', x, y, 0),
    tikla: async (x, y, button = 'left') => { const b = button === 'middle' ? 4 : 1; await fare('mouseMoved', x, y, 0); await fare('mousePressed', x, y, b, button); await fare('mouseReleased', x, y, 0, button); },
    kapat: () => ws.close(),
  };
}

export default async function ({ evalJs, ekranGoruntusu, bekle, hedefler, hedefSec }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  let harita = new Map();
  const yenile = async () => {
    const m = new Map();
    for (const h of await hedefler()) { hedefSec(h.id); m.set(await evalJs(`window.pdefe.cagir('pencere:kimlik')`), h.id); }
    harita = m;
    return [...m.keys()].sort((a, b) => a - b);
  };
  const P = (kimlik) => hedefSec(harita.get(kimlik));
  const ana = (kanal, ...args) => evalJs(`window.pdefe.cagir(${J(kanal)}, ...${J(args)})`);
  const durum = () => evalJs(`(() => { const p = window.__pdefe, c = document.querySelector('#sekme-cubugu'), cr = c.getBoundingClientRect();
    return { sekmeler: p.sekmeler.sekmeler.map((s) => s.ad), idler: p.sekmeler.sekmeler.map((s) => s.id), acilis: p.sekmeler.sekmeler.map((s) => !!s.baslangic), aktif: p.sekmeler.aktifId,
      aktifAd: p.sekmeler.bul(p.sekmeler.aktifId)?.ad ?? null, belge: p.aktif()?.ad ?? null, cubukGorunur: !c.hidden && cr.height > 20,
      acilisEkrani: !document.querySelector('#baslangic').hidden, toplam: document.querySelector('#sayfa-toplam').textContent,
      kapatGorunur: [...document.querySelectorAll('.sekme .kapat')].map((k) => getComputedStyle(k).visibility === 'visible') }; })()`);
  const ac = (adlar, secenek = {}) => evalJs(`(async () => { for (const ad of ${J(adlar)}) await window.__pdefe.dosyaAc(${J(K + path.sep)} + ad, ${J(secenek)}); await new Promise((r) => setTimeout(r, 300)); return true; })()`);
  const kapatOlayi = (ad) => evalJs(`(async () => { const p = window.__pdefe; const s = p.sekmeler.sekmeler.find((x) => x.ad === ${J(ad)}); p.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 300)); return true; })()`);
  const hepsiniKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const b of [...p.belgeler.values()]) await p.belgeKapat(b.id, { zorla: true }); for (const s of [...p.sekmeler.sekmeler]) p.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 300)); return true; })()`);
  const sagTik = (ad, yanit) => evalJs(`(async () => { await window.pdefe.cagir('test:diyalogKaydi'); await window.pdefe.cagir('test:diyalogYanitlari', 'menu:popup', [${J(yanit)}]); const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === ${J(ad)}); window.__pdefe.sekmeler.dispatchEvent(new CustomEvent('sagTik', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 400)); const k = await window.pdefe.cagir('test:diyalogKaydi'); const m = k.filter((x) => x.kanal === 'menu:popup').at(-1); return { menu: m ? m.secenek.map((o) => (o.ayirici ? '-' : o.etiket + (o.devre ? ' (devre dışı)' : ''))) : null, pano: k.filter((x) => x.kanal === 'pano:dosya').map((x) => x.secenek.yol) }; })()`);
  const genislikler = () => evalJs(`(() => { const l = document.querySelector('#sekme-liste'), lr = l.getBoundingClientRect(), yeni = document.querySelector('#sekme-yeni').getBoundingClientRect();
    const s = [...document.querySelectorAll('#sekme-liste .sekme')].map((x) => x.getBoundingClientRect());
    return { g: s.map((r) => Math.round(r.width * 10) / 10), kayiyor: l.scrollWidth > l.clientWidth + 1, liste: Math.round(lr.width), yeniBitisik: Math.abs(yeni.left - lr.right) <= 3,
      bosluk: parseFloat(getComputedStyle(l).columnGap) || 0, cubuk: Math.round(document.querySelector('#sekme-cubugu').getBoundingClientRect().width) }; })()`);
  const sekmeKutusu = (i) => evalJs(`(() => { const s = [...document.querySelectorAll('#sekme-liste .sekme')][${i}]; const r = s.getBoundingClientRect(), k = s.querySelector('.kapat').getBoundingClientRect();
    return { sol: r.left, sag: r.right, g: r.width, y: Math.round(r.top + r.height / 2), kapatX: Math.round(k.left + k.width / 2), kapatY: Math.round(k.top + k.height / 2), ad: s.querySelector('.ad').textContent }; })()`);
  const kayanlar = () => evalJs(`[...document.querySelectorAll('#sekme-liste .sekme:not(.tasiniyor)')].filter((s) => s.style.transform).map((s) => s.querySelector('.ad').textContent)`);
  const sekmeAdlari = () => evalJs(`window.__pdefe.sekmeler.sekmeler.map((s) => s.ad)`);
  const hatalariTopla = () => evalJs(`(() => { if (!window.__s23Hatalar) { window.__s23Hatalar = []; addEventListener('error', (e) => window.__s23Hatalar.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__s23Hatalar.push(String(e.reason?.message || e.reason))); } return true; })()`);

  fs.mkdirSync(path.join(K, 'png'), { recursive: true });
  const ADLAR = 'abcdefghijklmn'.split('').map((h) => h + '.pdf');
  for (const ad of ADLAR) uret(ad);
  let kimlikler = await yenile();
  const P1 = kimlikler[0];
  P(P1);
  await hatalariTopla();

  // ---------------------------------------------------------------- 1) sekme çubuğu hiç kapanmaz
  let d = await durum();
  sonuc('Açılışta sekme çubuğu görünür, tek sekme "Yeni sekme" (açılış sekmesi), açılış ekranı görünür',
    d.cubukGorunur && J(d.sekmeler) === J(['Yeni sekme']) && d.acilis[0] && d.aktif != null && d.acilisEkrani && d.belge === null, d);
  sonuc('Tek açılış sekmesinin × düğmesi gizli', J(d.kapatGorunur) === J([false]), d.kapatGorunur);
  await ekranGoruntusu(path.join(K, 'png', '1-acilis.png'));
  const ilkId = d.aktif;
  await kapatOlayi('Yeni sekme');
  d = await durum();
  sonuc('Tek açılış sekmesi kapatılmaz (×, orta tık: aynı sekme kalır)', J(d.sekmeler) === J(['Yeni sekme']) && d.aktif === ilkId && d.cubukGorunur, d);
  let m = await sagTik('Yeni sekme', null);
  sonuc('Tek açılış sekmesinde sağ tık: Kapat ve PDF\'i kopyala devre dışı', m.menu && m.menu.includes('Kapat (devre dışı)') && m.menu.includes('PDF\'i kopyala (devre dışı)'), m.menu);

  await ac(['a.pdf']);
  d = await durum();
  sonuc('Açılış sekmesinden açılan belge onun yerini alır: tek sekme a.pdf, × görünür', J(d.sekmeler) === J(['a.pdf']) && d.belge === 'a.pdf' && !d.acilisEkrani && J(d.kapatGorunur) === J([true]), d);
  await kapatOlayi('a.pdf');
  d = await durum();
  sonuc('Son belge kapanınca yerine açılış sekmesi gelir: çubuk görünür, "Yeni sekme" etkin, açılış ekranı ve boş araç çubuğu', d.cubukGorunur && J(d.sekmeler) === J(['Yeni sekme']) && d.acilis[0] && d.aktifAd === 'Yeni sekme' && d.acilisEkrani && d.belge === null && d.toplam === '/ 0' && J(d.kapatGorunur) === J([false]), d);
  await ekranGoruntusu(path.join(K, 'png', '1-son-belge-kapandi.png'));
  // 0.1.22 (kullanıcı isteği): belgesiz pencerede de + yeni boş sekme açar (0.1.21'de açmıyordu). + düğmesine gerçek fare tıklaması
  const bosId = d.aktif;
  const fare = await girdi(harita.get(P1));
  const arti = await evalJs(`(() => { const r = document.querySelector('#sekme-yeni').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  await fare.tikla(...arti); await bekle(300);
  d = await durum();
  sonuc('Belgesiz pencerede + yeni boş sekme açar, o etkin; iki sekmenin de × düğmesi görünür, açılış ekranı',
    J(d.sekmeler) === J(['Yeni sekme', 'Yeni sekme']) && d.acilis.every(Boolean) && d.aktif === d.idler[1] && d.idler[0] === bosId && d.acilisEkrani && d.belge === null && J(d.kapatGorunur) === J([true, true]), d);
  const arti2 = await evalJs(`(() => { const r = document.querySelector('#sekme-yeni').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  await fare.tikla(...arti2); await bekle(300);
  fare.kapat();
  d = await durum();
  sonuc('+ ile üçüncü boş sekme de açılır (+ son sekmenin yanına kayar)', J(d.sekmeler) === J(['Yeni sekme', 'Yeni sekme', 'Yeni sekme']) && d.aktif === d.idler[2] && arti2[0] > arti[0], { d, arti, arti2 });
  await evalJs(`window.__pdefe.komutCalistir('sekme.yeni')`); await bekle(200);
  d = await durum();
  sonuc('Belgesiz pencerede Ctrl+T (sekme.yeni) de yeni boş sekme açar', J(d.sekmeler) === J(['Yeni sekme', 'Yeni sekme', 'Yeni sekme', 'Yeni sekme']) && d.aktif === d.idler[3], d);
  m = await sagTik('Yeni sekme', null);
  sonuc('Birden çok açılış sekmesinde sağ tık: Kapat etkin, Pencereye ayır devre dışı', m.menu && m.menu.includes('Kapat') && m.menu.includes('Pencereye ayır (devre dışı)'), m.menu);
  // Ctrl+W etkin açılış sekmesini kapatır (pencere kapanmaz); son kullanılan sekmeye dönülür
  const ucuncu = d.idler[2];
  await evalJs(`window.__pdefe.komutCalistir('sekme.kapat')`); await bekle(300);
  d = await durum();
  sonuc('Belgesiz pencerede Ctrl+W etkin açılış sekmesini kapatır, son kullanılana döner, pencere açık', J(d.sekmeler) === J(['Yeni sekme', 'Yeni sekme', 'Yeni sekme']) && d.aktif === ucuncu && (await yenile()).includes(P1), d);
  P(P1);
  // × ile kapatma: son açılış sekmesi kalınca × gizlenir, ilk sekme kalır
  for (const id of d.idler.slice(1)) await evalJs(`(async () => { window.__pdefe.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: ${J(id)} } })); await new Promise((r) => setTimeout(r, 200)); return true; })()`);
  d = await durum();
  sonuc('Açılış sekmeleri tek tek kapatılır; tek açılış sekmesi kalınca × gizli, kapatılmaz', J(d.sekmeler) === J(['Yeni sekme']) && d.aktif === bosId && J(d.kapatGorunur) === J([false]) && d.acilisEkrani, d);
  // Belgesiz pencerede açılış sekmelerinden birinden açılan belge yalnızca o sekmenin yerini alır
  await evalJs(`window.__pdefe.komutCalistir('sekme.yeni')`); await bekle(200);
  await ac(['a.pdf']);
  d = await durum();
  sonuc('İki açılış sekmesinden etkin olandan açılan belge onun yerini alır, öteki kalır', J(d.sekmeler) === J(['Yeni sekme', 'a.pdf']) && d.idler[0] === bosId && d.belge === 'a.pdf', d);
  await kapatOlayi('a.pdf');
  d = await durum();
  sonuc('Belge kapanınca yanındaki açılış sekmesi kalır (yenisi açılmaz)', J(d.sekmeler) === J(['Yeni sekme']) && d.aktif === bosId && d.acilisEkrani && J(d.kapatGorunur) === J([false]), d);
  // Belgelerin yanındaki açılış sekmeleri: son belge kapanınca hepsi kalır, etkin olan değişmez (0.1.21'de teke iniyordu)
  await ac(['a.pdf', 'b.pdf']);
  await evalJs(`window.__pdefe.komutCalistir('sekme.yeni')`); await bekle(200);
  await evalJs(`(async () => { const p = window.__pdefe; await p.sekmeSec([...p.belgeler.values()].find((x) => x.ad === 'a.pdf').id); p.komutCalistir('sekme.yeni'); await new Promise((r) => setTimeout(r, 200)); return true; })()`);
  d = await durum();
  sonuc('İki belge + iki Yeni sekme', J(d.sekmeler) === J(['a.pdf', 'b.pdf', 'Yeni sekme', 'Yeni sekme']) && d.aktifAd === 'Yeni sekme', d.sekmeler);
  const yeniId = d.aktif;
  await kapatOlayi('a.pdf'); await kapatOlayi('b.pdf');
  d = await durum();
  sonuc('Belgeler kapanınca iki açılış sekmesi de kalır, etkin olan değişmez, çubuk görünür', J(d.sekmeler) === J(['Yeni sekme', 'Yeni sekme']) && d.aktif === yeniId && d.cubukGorunur && d.acilisEkrani && J(d.kapatGorunur) === J([true, true]), d);
  // Birden çok açılış sekmesi varken arka planda açılan belge sona eklenir, etkin açılış sekmesi kalır
  await ac(['c.pdf'], { arkaPlanda: true });
  d = await durum();
  sonuc('İki açılış sekmesi varken arka planda açılan belge sona eklenir, etkin sekme değişmez', J(d.sekmeler) === J(['Yeni sekme', 'Yeni sekme', 'c.pdf']) && d.aktif === yeniId && d.belge === null && d.acilisEkrani, d);
  await kapatOlayi('c.pdf');
  await evalJs(`(async () => { const p = window.__pdefe; const s = p.sekmeler.sekmeler.find((x) => x.id !== ${J(yeniId)}); p.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 300)); return true; })()`);
  d = await durum();
  sonuc('Etkin olmayan açılış sekmesi kapatılınca tek açılış sekmesi kalır', J(d.sekmeler) === J(['Yeni sekme']) && d.aktif === yeniId && J(d.kapatGorunur) === J([false]), d);
  // Arka planda açılan belge de tek açılış sekmesinin yerini alır ve etkin olur
  await ac(['c.pdf'], { arkaPlanda: true });
  d = await durum();
  sonuc('Arka planda açılan belge tek açılış sekmesinin yerini alır, etkin olur', J(d.sekmeler) === J(['c.pdf']) && d.belge === 'c.pdf', d);
  // + ile açılan ikinci açılış sekmesi kapatılabilir; belge sekmesi açıkken açılış sekmesinin × düğmesi görünür
  await evalJs(`window.__pdefe.komutCalistir('sekme.yeni')`); await bekle(200);
  d = await durum();
  sonuc('Belgenin yanındaki açılış sekmesinin × düğmesi görünür', J(d.kapatGorunur) === J([true, true]), d.kapatGorunur);
  await kapatOlayi('Yeni sekme');
  d = await durum();
  sonuc('Belgenin yanındaki açılış sekmesi kapatılır', J(d.sekmeler) === J(['c.pdf']) && d.belge === 'c.pdf', d);

  // Pencereye ayır: yeni pencerede yalnızca taşınan belge (açılış sekmesi kalmaz); son belge kapanınca açılış sekmesi; Ctrl+W pencereyi
  // kapatır. Belgesiz pencerenin bırakma alanı (pencerenin tamamı) gerçek sürüklemeyle senaryo22'de sınanır
  await ac(['d.pdf', 'e.pdf']);
  const once = await yenile(); P(P1);
  const tasindi = await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'd.pdf'); return await p.sekmeyiTasi(b.id, { tur: 'yeni' }); })()`);
  let P2 = null;
  for (let i = 0; i < 60 && P2 == null; i++) { await bekle(200); P2 = (await yenile()).find((k) => !once.includes(k)) ?? null; }
  P(P2);
  await kosul(`window.__pdefe.aktif()?.ad === 'd.pdf'`, 8000);
  d = await durum();
  sonuc('Pencereye ayır: yeni pencerede yalnızca taşınan belge (açılış sekmesinin yerini aldı)', tasindi === true && J(d.sekmeler) === J(['d.pdf']) && d.belge === 'd.pdf', d);
  await kapatOlayi('d.pdf');
  d = await durum();
  sonuc('Yeni pencerede son belge kapanınca açılış sekmesi', J(d.sekmeler) === J(['Yeni sekme']) && d.cubukGorunur && d.acilisEkrani, d);
  // Belgesiz pencereye başka pencereden taşınan sekme açılış sekmesinin yerini alır (P1'de e.pdf kalır: son belgesi giden pencere kapanır)
  P(P1);
  const geri = await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'c.pdf'); return await p.sekmeyiTasi(b.id, { tur: 'pencere', pencere: ${P2}, x: 200 }); })()`);
  P(P2);
  await kosul(`window.__pdefe.aktif()?.ad === 'c.pdf'`, 8000);
  d = await durum();
  sonuc('Belgesiz pencereye taşınan sekme açılış sekmesinin yerini alır', geri === true && J(d.sekmeler) === J(['c.pdf']) && d.belge === 'c.pdf', d);
  // c.pdf ilk pencereye geri: P2'nin son belgesi gidince P2 kapanır (açılış sekmesi pencereyi açık tutmaz, önceki gibi)
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'c.pdf'); return await p.sekmeyiTasi(b.id, { tur: 'pencere', pencere: ${P1}, x: null }); })()`);
  for (let i = 0; i < 40 && (await yenile()).includes(P2); i++) await bekle(200);
  sonuc('Son belgesi başka pencereye taşınan pencere kapanır', !(await yenile()).includes(P2));
  P(P1);
  d = await durum();
  sonuc('İlk pencerede e.pdf ve c.pdf', J(d.sekmeler) === J(['e.pdf', 'c.pdf']), d);
  // Ctrl+W tek açılış sekmesinde pencereyi kapatır: yeni pencere aç (Pencereye ayır), belgesini kapat, sekme.kapat
  await ac(['d.pdf']);
  const once2 = await yenile(); P(P1);
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'd.pdf'); return await p.sekmeyiTasi(b.id, { tur: 'yeni' }); })()`);
  let P3 = null;
  for (let i = 0; i < 60 && P3 == null; i++) { await bekle(200); P3 = (await yenile()).find((k) => !once2.includes(k)) ?? null; }
  P(P3);
  await kosul(`window.__pdefe.aktif()?.ad === 'd.pdf'`, 8000);
  await evalJs(`window.__pdefe.komutCalistir('sekme.kapat')`); await bekle(400);
  d = await durum();
  sonuc('Ctrl+W belgeyi kapatır, yerine açılış sekmesi', J(d.sekmeler) === J(['Yeni sekme']), d);
  // 0.1.22: iki açılış sekmeli belgesiz pencereye taşınan sekme onların yanına eklenir (açılış sekmeleri kalır)
  await evalJs(`window.__pdefe.komutCalistir('sekme.yeni')`); await bekle(200);
  P(P1);
  const tasindi3 = await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'e.pdf'); return await p.sekmeyiTasi(b.id, { tur: 'pencere', pencere: ${P3}, x: null }); })()`);
  P(P3);
  await kosul(`window.__pdefe.aktif()?.ad === 'e.pdf'`, 8000);
  d = await durum();
  sonuc('İki açılış sekmeli belgesiz pencereye taşınan sekme sona eklenir, açılış sekmeleri kalır', tasindi3 === true && J(d.sekmeler) === J(['Yeni sekme', 'Yeni sekme', 'e.pdf']) && d.belge === 'e.pdf', d);
  await kapatOlayi('e.pdf');
  await evalJs(`window.__pdefe.komutCalistir('sekme.kapat')`); await bekle(300);
  d = await durum();
  sonuc('Belgesi kapanınca açılış sekmeleri kalır; Ctrl+W birini kapatır, tek açılış sekmesi kalır', J(d.sekmeler) === J(['Yeni sekme']) && (await yenile()).includes(P3), d);
  P(P3);
  await evalJs(`window.__pdefe.komutCalistir('sekme.kapat')`);
  let kapandi = false;
  for (let i = 0; i < 40 && !kapandi; i++) { await bekle(200); kapandi = !(await yenile()).includes(P3); }
  sonuc('Tek açılış sekmesinde Ctrl+W pencereyi kapatır', kapandi);
  P(P1);
  await hepsiniKapat();
  d = await durum();
  sonuc('Hepsi kapatılınca tek açılış sekmesi', J(d.sekmeler) === J(['Yeni sekme']), d.sekmeler);

  // ---------------------------------------------------------------- 3) sekme genişliği
  const olcumler = [];
  for (let n = 1; n <= ADLAR.length; n++) {
    await ac([ADLAR[n - 1]]);
    const o = await genislikler();
    olcumler.push({ n, ...o });
  }
  const esit = olcumler.every((o) => o.g.length === o.n && Math.max(...o.g) - Math.min(...o.g) <= 1);
  sonuc('Her sekme sayısında sekmeler eşit genişlikte', esit, olcumler.map((o) => [o.n, o.g[0], Math.max(...o.g) - Math.min(...o.g)]));
  sonuc('Tek belgede sekme 220 px, + hemen yanında', Math.abs(olcumler[0].g[0] - EN_GENIS) <= 0.5 && olcumler[0].yeniBitisik, olcumler[0]);
  const azalan = olcumler.every((o, i) => i === 0 || o.g[0] <= olcumler[i - 1].g[0] + 0.5);
  sonuc('Sekme çoğaldıkça genişlik azalır ya da aynı kalır', azalan, olcumler.map((o) => o.g[0]));
  const orta = olcumler.filter((o) => o.g[0] < EN_GENIS - 1 && o.g[0] > EN_DAR + 1);
  sonuc('Sığmayınca daralan sekmeler kaydırma olmadan çubuğa sığar (118–220 px arası en az bir ölçüm)', orta.length >= 1 && orta.every((o) => !o.kayiyor), orta.map((o) => [o.n, o.g[0], o.kayiyor]));
  const dar = olcumler.filter((o) => o.kayiyor);
  sonuc('Kaydırma yalnızca sekmeler en dar genişliğe (118 px) inince başlar', dar.length >= 1 && dar.every((o) => Math.abs(o.g[0] - EN_DAR) <= 0.5), dar.map((o) => [o.n, o.g[0]]));
  sonuc('220 px\'lik sekmeler sığdıkça kaydırma yok', olcumler.filter((o) => Math.abs(o.g[0] - EN_GENIS) <= 0.5).every((o) => !o.kayiyor));
  console.log('     genişlikler:', olcumler.map((o) => `${o.n}:${o.g[0]}${o.kayiyor ? '(kayıyor)' : ''}`).join(' '), 'çubuk', olcumler[0].cubuk);
  await ekranGoruntusu(path.join(K, 'png', '3-cok-sekme.png'));

  // × ile kapatma: genişlik kilitlenir, sıradaki sekmenin × düğmesi imlecin altına gelir; imleç çubuktan çıkınca sekmeler genişler.
  // Daralmış ama kaymayan sayıda sekmeye in
  const hedefN = orta.length ? orta.at(-1).n : 8;
  while ((await sekmeAdlari()).length > hedefN) await evalJs(`(async () => { const p = window.__pdefe; const s = p.sekmeler.sekmeler.at(-1); await p.belgeKapat(s.id, { zorla: true }); return true; })()`);
  await evalJs(`window.__pdefe.komutCalistir('sekme.sonraki')`);
  let g = await girdi(harita.get(P1));
  await g.git(400, 400); await bekle(200);   // imleç belge alanında: kilit yok
  const k2 = await sekmeKutusu(2), gOnce = (await genislikler()).g[0];
  await g.tikla(k2.kapatX, k2.kapatY); await bekle(400);
  const kSonra = await sekmeKutusu(2), gSonra = (await genislikler()).g;
  sonuc('× ile kapatınca sekmeler genişlemez (imleç çubukta), sıradaki sekmenin × düğmesi imlecin altında',
    (await sekmeAdlari()).length === hedefN - 1 && Math.abs(gSonra[0] - gOnce) <= 0.5 && Math.abs(kSonra.kapatX - k2.kapatX) <= 1 && kSonra.ad !== k2.ad, { gOnce, gSonra: gSonra[0], k2, kSonra });
  await g.tikla(kSonra.kapatX, kSonra.kapatY); await bekle(400);
  sonuc('Art arda ikinci × da aynı yerde', (await sekmeAdlari()).length === hedefN - 2 && Math.abs((await genislikler()).g[0] - gOnce) <= 0.5);
  await g.git(400, 400); await bekle(300);
  const gCikis = (await genislikler()).g[0];
  sonuc('İmleç çubuktan çıkınca sekmeler sayılarına göre genişler', gCikis > gOnce + 5, { gOnce, gCikis });
  // Orta tıkla kapatma da kilitler
  const k0 = await sekmeKutusu(1), gOrta = (await genislikler()).g[0];
  await g.tikla(k0.sol + 40, k0.y, 'middle'); await bekle(400);
  sonuc('Orta tıkla kapatınca da genişlik kilitli', Math.abs((await genislikler()).g[0] - gOrta) <= 0.5 || gOrta >= EN_GENIS - 0.5, { gOrta, simdi: (await genislikler()).g[0] });
  await g.git(400, 400); await bekle(300);
  g.kapat();

  // ---------------------------------------------------------------- 2) sürüklerken yer değiştirme eşiği (komşunun %25'i)
  await hepsiniKapat();
  await ac(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']);
  const surukle = async (i, kayma, { birak = true } = {}) => {
    const k = await sekmeKutusu(i), gi = await girdi(harita.get(P1));
    const x0 = Math.round(k.sol + 40);
    await gi.bas(x0, k.y);
    await gi.surukle(x0, x0 + kayma, k.y);
    await bekle(250);
    const kay = await kayanlar();
    if (birak) { await gi.birak(x0 + kayma, k.y); await bekle(400); }
    gi.kapat();
    return { kay, sira: await sekmeAdlari() };
  };
  const k0b = await sekmeKutusu(0), aralik = (await sekmeKutusu(1)).sol - k0b.sag, w = k0b.g;
  let r = await surukle(0, Math.round(aralik + w * 0.18));
  sonuc('Sağa: komşunun %18\'ine girince yer değişmez', r.kay.length === 0 && J(r.sira) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']), r);
  r = await surukle(0, Math.round(aralik + w * 0.32));
  sonuc('Sağa: komşunun %32\'sine girince yer değişir (b kayar, bırakınca b, a)', J(r.kay) === J(['b.pdf']) && J(r.sira) === J(['b.pdf', 'a.pdf', 'c.pdf', 'd.pdf']), r);
  r = await surukle(2, -Math.round(aralik + w * 0.32));
  sonuc('Sola: komşunun %32\'sine girince yer değişir', J(r.kay) === J(['a.pdf']) && J(r.sira) === J(['b.pdf', 'c.pdf', 'a.pdf', 'd.pdf']), r);
  r = await surukle(0, Math.round(2 * (aralik + w) + aralik + w * 0.3));
  sonuc('İki sekme öteye: üçüncü komşunun %30\'una girince üç sekme kayar', J(r.kay) === J(['c.pdf', 'a.pdf', 'd.pdf']) && J(r.sira) === J(['c.pdf', 'a.pdf', 'd.pdf', 'b.pdf']), r);
  r = await surukle(3, -Math.round(aralik + w * 0.18));
  sonuc('Sola: komşunun %18\'ine girince yer değişmez', r.kay.length === 0 && J(r.sira) === J(['c.pdf', 'a.pdf', 'd.pdf', 'b.pdf']), r);
  void YER_DEGISTIRME;

  // ---------------------------------------------------------------- 4) ve 5) PDF'i kopyala
  m = await sagTik('a.pdf', null);
  const iYol = m.menu?.indexOf('Yolu kopyala') ?? -1;
  sonuc('Sekmede sağ tık: "PDF\'i kopyala" "Yolu kopyala"nın hemen altında', iYol >= 0 && m.menu[iYol + 1] === 'PDF\'i kopyala', m.menu);
  m = await sagTik('a.pdf', 'pdf');
  sonuc('PDF\'i kopyala: a.pdf dosyası panoya', m.pano.length === 1 && m.pano[0] === path.join(K, 'a.pdf'), m.pano);
  // Kaydedilmemiş değişiklik: soru "kopyala" diye sorar; sağ tıklanan sekme etkin değilse önce ona geçilir
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'b.pdf'); await p.sekmeSec(b.id);
    b.notlar.ekle({ tur: 'Text', sayfa: 1, rect: [100, 100, 120, 120], icerik: 'deneme', yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' });
    await new Promise((r) => setTimeout(r, 300)); await p.sekmeSec([...p.belgeler.values()].find((x) => x.ad === 'a.pdf').id); return b.degisti; })()`);
  await evalJs(`window.__pdefeOtoYanit = { secim: 1 }; true`);
  m = await sagTik('b.pdf', 'pdf');
  let soru = await evalJs(`(() => { const s = window.__pdefeOtoYanit.son; delete window.__pdefeOtoYanit; return s ? { mesaj: s.mesaj, ayrinti: s.ayrinti, dugmeler: s.dugmeler } : null; })()`);
  sonuc('Kaydedilmemiş belge: soru "Kopyalamadan önce kaydetmek ister misiniz?" (Kaydet ve kopyala / Kaydetmeden kopyala / Vazgeç)',
    soru && soru.ayrinti === 'Kopyalamadan önce kaydetmek ister misiniz?' && J(soru.dugmeler) === J(['Kaydet ve kopyala', 'Kaydetmeden kopyala', 'Vazgeç']), soru);
  sonuc('Kaydetmeden kopyala: soru açılmadan sekmeye geçildi, dosya panoya', (await evalJs(`window.__pdefe.aktif().ad`)) === 'b.pdf' && m.pano.length === 1 && m.pano[0] === path.join(K, 'b.pdf'), m);
  // Araç çubuğundaki düğme (komut arac.paylas): aynı soru; Vazgeç panoya koymaz
  await evalJs(`window.__pdefeOtoYanit = { secim: 2 }; true`);
  await ana('test:diyalogKaydi');
  await evalJs(`(async () => { document.querySelector('#arac-cubugu [data-komut="arac.paylas"]').click(); await new Promise((r) => setTimeout(r, 400)); return true; })()`);
  soru = await evalJs(`(() => { const s = window.__pdefeOtoYanit.son; delete window.__pdefeOtoYanit; return s ? { ayrinti: s.ayrinti, dugmeler: s.dugmeler } : null; })()`);
  const kayit = await ana('test:diyalogKaydi');
  sonuc('Kopyala düğmesi: soru "kopyala" diyor, Vazgeç panoya koymaz', soru && soru.ayrinti === 'Kopyalamadan önce kaydetmek ister misiniz?' && soru.dugmeler[0] === 'Kaydet ve kopyala' && !kayit.some((x) => x.kanal === 'pano:dosya'), { soru, kayit });
  const ipucu = await evalJs(`document.querySelector('#arac-cubugu [data-komut="arac.paylas"]').title`);
  const menu = await ana('test:menu');
  const araclar = menu.find((x) => typeof x === 'object' && /Araçlar/.test(x.etiket))?.alt || [];
  sonuc('Düğmenin ipucu ve Araçlar menüsü "PDF\'i kopyala"; "Paylaş" geçmiyor', /^PDF'i kopyala/.test(ipucu) && araclar.includes('PDF\'i kopyala (dosyayı panoya)') && !J(menu).includes('Paylaş') && !/Paylaş/.test(ipucu), { ipucu, araclar });

  const hatalar = await evalJs(`window.__s23Hatalar`);
  sonuc('Sayfada yakalanmamış hata yok', hatalar.length === 0, hatalar);
  await evalJs(`(async () => { const p = window.__pdefe; for (const b of [...p.belgeler.values()]) await p.belgeKapat(b.id, { zorla: true }); return true; })()`);
  console.log(`\n${tamam} tamam, ${hataSayisi} hata. Çıktı: ${K}`);
}
