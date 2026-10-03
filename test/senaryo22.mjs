// Senaryo 22 (0.1.19, kullanıcı isteği): birden çok pencere ve sekmenin pencereler arasında taşınması.
//   - sekmede sağ tık › Pencereye ayır (tek sekmede ve açılış sekmesinde devre dışı); yeni pencerenin yeri, başlığı, sayfa ve yakınlaştırma
//   - sekmeyle birlikte taşınanlar: kaydedilmemiş notlar, sayfa değişiklikleri, geri al / yinele geçmişi, anlık kopya; taşınan belge,
//     aynı işlemlerin yapıldığı ama taşınmayan eş belgeyle adım adım karşılaştırılır (geri al, yinele, kaydet, diskteki sonuç)
//   - sekmeyi çubuğun dışına sürükleme (gerçek fare olayları CDP'den): eşik, önizleme penceresi, çubuğa geri takılma, Esc, boş yere
//     bırakınca yeni pencere (sekme imlecin altında), başka pencerenin çubuğuna bırakma (bırakma işareti, sıra), belgesiz pencereye
//     bırakma, tek sekmeli pencerenin taşınması / kapanması, açılış sekmesinin ayrılmaması
//   - dosya yalnızca bir pencerede açık: başka pencerede açık dosya orada gösterilir (arayüzden ve Gezgin'den / ikinci örnekten)
//   - ayarların pencereler arasında eşitlenmesi; meşgul hedef pencere; pencere kapatma, Çıkış ve güncelleme öncesi izin
//   - kilitler: kaydedilmekte olan belge taşınmaz, kapanmakta olan pencere sekme almaz, güncellemeye izin veren pencere girdi almaz,
//     kilitliyken açılan mesaj kutusu yanıtlanabilir; süresi dolmuş taşımada hedefte kurulan sekme kaldırılır
//   - görünüm: arka plandaki sekmenin sayfa içi konumu, "Görünür alana sığdır"
//   - kapanan pencerenin dosyaları çekirdekten, yarım yazdırma işi ana süreçten bırakılır; arayüzü çöken pencere Çıkış'ı durdurmaz
// İmleç gerçek imleç değildir: ana süreç imlecin yerini testten alır (test:imlec); pencereler ekran dışındadır.
// Kullanım: temiz veri klasörlü test örneği (baslat.ps1) açıkken  $env:PDEFE_CDP_PORT=9391; node test/surucu.mjs betik test/senaryo22.mjs
// Son adım (Çıkış) test örneğini kapatır.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 's22', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PYTHON = path.join(KOK, '.venv', 'Scripts', 'python.exe'), URET = path.join(KOK, 'test', 'ornek_pdf_uret.py');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, tamam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (ok) tamam++; else hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};
const uret = (ad, sayfa, { notlu = false, baslik = ad.replace('.pdf', '') } = {}) => { execFileSync(PYTHON, ['-X', 'utf8', URET, path.join(K, ad), String(sayfa), baslik, ...(notlu ? ['--notlu'] : [])]); return path.join(K, ad); };
const diskOzeti = (yol) => JSON.parse(execFileSync(PYTHON, ['-X', 'utf8', URET, '--ozet', yol]).toString('utf8'));

/** Bir pencereye (CDP hedefi) ham girdi oturumu: fare düğmesi adımlar arasında basılı kalabilsin. */
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
    /** Basılı tutarak (x, y)'ye adım adım gider. */
    git: async (x0, y0, x1, y1, adim = 8) => { for (let i = 1; i <= adim; i++) await fare('mouseMoved', x0 + ((x1 - x0) * i) / adim, y0 + ((y1 - y0) * i) / adim, 1); },
    birak: (x, y) => fare('mouseReleased', x, y, 0),
    esc: async () => { for (const type of ['rawKeyDown', 'keyUp']) await gonder('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); },
    kapat: () => ws.close(),
  };
}

/** Bir pencereye (CDP hedefi) tek komut gönderir; yanıt beklenmez (Page.crash bağlantıyı koparır). */
async function cdpKomut(hedefId, method, params = {}) {
  const hepsi = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const ws = new WebSocket(hepsi.find((h) => h.id === hedefId).webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  ws.send(JSON.stringify({ id: 1, method, params }));
  await new Promise((c) => setTimeout(c, 300));
  try { ws.close(); } catch { /* bağlantı koptu */ }
}

// Belgenin karşılaştırılabilir özeti (renderer'da çalışır). Dosya adları 'kendi' / 'anlik' olarak yazılır: eş belgeler karşılaştırılabilsin
const OZET = `(ad) => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ad); if (!b) return null; const g = b.gorunum, n = b.notlar;
  const kisa = (yol) => (g.anlik && yol === g.anlik ? 'anlik' : yol === b.yol ? 'kendi' : yol.slice(Math.max(yol.lastIndexOf('/'), yol.lastIndexOf(String.fromCharCode(92))) + 1));
  const notOzeti = (x) => ({ tur: x.tur, sayfa: x.sayfa, icerik: x.icerik || '', rect: (x.rect || []).map((v) => Math.round(v)), renk: x.renk || null, silindi: !!x.silindi, sayfaYok: !!x.sayfaYok, dosyada: n.kayitli.has(x.id) });
  return { degisti: b.degisti, sayfaSayisi: g.sayfaSayisi, tarif: g.tarif().map((t) => (t.kaynak ? kisa(t.kaynak.yol) + '#' + t.kaynak.sayfa : 'bos') + '@' + (t.dondurme || 0)),
    yapisalKirli: g.yapisalKirli(), anlik: !!g.anlik, diskDondurme: b.diskDondurme,
    notlar: [...n.notlar.values()].map(notOzeti).sort((x, y) => x.sayfa - y.sayfa || x.rect[1] - y.rect[1] || x.rect[0] - y.rect[0] || x.tur.localeCompare(y.tur)),
    fark: n.fark().map((o) => o.islem).sort(), yigin: { adlar: b.yigin.yigin.map((k) => k.ad), konum: b.yigin.konum, kayit: b.yigin.kayitKonumu } }; }`;
// İki eş belgeye de uygulanan işlemler: dosyadaki notu düzenle, dosyadaki vurguyu sil, vurgu ekle, not ekle, notu taşı, 2. sayfayı döndür, 4. sayfayı sil
const ISLEMLER = `async (ad) => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ad); await p.sekmeSec(b.id); const n = b.notlar, g = b.gorunum;
  const dosyaNotu = [...n.notlar.values()].find((x) => x.tur === 'Text'), dosyaVurgusu = [...n.notlar.values()].find((x) => x.tur === 'Highlight');
  n.guncelle(dosyaNotu, { icerik: 'düzenlenen not' }, 'Not metnini düzenle');
  n.sil(dosyaVurgusu);
  n.ekle({ tur: 'Highlight', sayfa: 2, rect: [72, 150, 300, 166], quadKutular: [[72, 150, 300, 166]], quads: null, icerik: '', yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 0.4, konu: 'Vurgu' });
  const yeni = n.ekle({ tur: 'Text', sayfa: 3, rect: [100, 100, 120, 120], icerik: 'yeni not', yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' });
  n.guncelle(yeni, { rect: [200, 300, 220, 320] }, 'Not taşı');
  await p.sayfalariDondur(b, [2], 90, 'Sayfayı döndür');
  const t = g.tarif(); t.splice(3, 1); await p.sayfaTarifiUygula(b, t, 'Sayfa sil');
  await new Promise((r) => setTimeout(r, 300)); return true; }`;

export default async function ({ evalJs, ekranGoruntusu, bekle, hedefler, hedefSec }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  // Pencereler: ana süreçteki kimlik (webContents kimliği) → CDP hedefi
  let harita = new Map(), secili = null;
  /** Pencere listesini yeniler (kimlikler, artan sırada); seçili pencere (P) değişmez, kapandıysa ilk pencere seçilir. */
  const yenile = async () => {
    const m = new Map();
    for (const h of await hedefler()) { hedefSec(h.id); m.set(await evalJs(`window.pdefe.cagir('pencere:kimlik')`), h.id); }
    harita = m;
    if (!m.has(secili)) secili = [...m.keys()][0] ?? null;
    hedefSec(m.get(secili) || null);
    return [...m.keys()].sort((a, b) => a - b);
  };
  /** Sonraki komutların gideceği pencereyi seçer. */
  const P = (kimlik) => { if (!harita.has(kimlik)) throw new Error('Pencere yok: ' + kimlik); secili = kimlik; hedefSec(harita.get(kimlik)); };
  /** Seçili pencereyi odak sırasında en öne alır (ekran dışındaki örnekte pencere gerçekten etkinleşmez). */
  const oneAl = () => evalJs(`window.pdefe.cagir('test:oneAl')`);
  const ana = (kanal, ...args) => evalJs(`window.pdefe.cagir(${J(kanal)}, ...${J(args)})`);
  const pencereBilgisi = async (kimlik) => (await ana('test:pencereler')).find((p) => p.id === kimlik);
  const sekmeAdlari = () => evalJs(`window.__pdefe.sekmeler.sekmeler.map((s) => s.ad + (s.degisti ? '*' : ''))`);
  const ac = (...adlar) => evalJs(`(async () => { for (const ad of ${J(adlar)}) await window.__pdefe.dosyaAc(${J(K + path.sep)} + ad); return true; })()`);
  const notlarYuklendi = (ad) => kosul(`[...window.__pdefe.belgeler.values()].find((x) => x.ad === ${J(ad)})?.notlar.yuklendi === true`);
  const ozet = (ad) => evalJs(`(${OZET})(${J(ad)})`);
  const belgeIslemi = (ad, govde) => evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${J(ad)}); if (!b) return null; ${govde} })()`);
  const tasi = (ad, hedef) => belgeIslemi(ad, `return await p.sekmeyiTasi(b.id, ${J(hedef)});`);
  /** Taşıma sonunda açılan yeni pencerenin kimliği. Pencere, sekme içinde kurulana dek gizlidir (CDP hedefi hemen görünür): gösterilmesi beklenir. */
  const yeniPencere = async (once) => {
    const t0 = Date.now();
    for (;;) {
      const yeni = (await yenile()).find((k) => !once.includes(k)) ?? null;
      if (yeni != null && (await ana('test:pencereler')).find((p) => p.id === yeni)?.gorunur) return yeni;
      if (Date.now() - t0 > 12000) return null;
      await bekle(150);
    }
  };
  /** Pencerenin kapanmasını bekler (son belgesi başka pencereye taşınan pencere kendiliğinden kapanır). */
  const pencereKapandi = async (kimlik) => { const t0 = Date.now(); for (;;) { if (!(await yenile()).includes(kimlik)) return true; if (Date.now() - t0 > 8000) return false; await bekle(200); } };
  /** Seçili (kaynak) pencerede süren taşımanın bitmesini bekler: sekme bırakıldı ya da yerine döndü. */
  const tasimaBitti = () => kosul(`!window.__pdefe.tasimaSuruyor() && !document.querySelector('.sekme.askida')`, 8000);
  const sekmeYeri = (ad) => evalJs(`(() => { const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === ${J(ad)}); if (!s) return null; const r = s.el.getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2), sol: r.left, ust: r.top, sag: r.right }; })()`);
  const cubuk = () => evalJs(`(() => { const r = document.querySelector('#sekme-cubugu').getBoundingClientRect(); return { ust: r.top, alt: r.bottom }; })()`);
  const sekmeSiniflari = () => evalJs(`Object.fromEntries([...document.querySelectorAll('.sekme')].map((s) => [s.querySelector('.ad').textContent, [...s.classList].filter((c) => c !== 'sekme' && c !== 'aktif').join('+') + (s.style.transform ? '~' : '')]))`);
  const hatalariTopla = () => evalJs(`(() => { if (!window.__s22Hatalar) { window.__s22Hatalar = []; addEventListener('error', (e) => window.__s22Hatalar.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__s22Hatalar.push(String(e.reason?.message || e.reason))); } return true; })()`);
  const kutu = () => evalJs(`(() => { const k = [...document.querySelectorAll('.mesaj-kutusu')].at(-1); return k ? { ileti: k.querySelector('.mesaj-ileti')?.textContent, dugmeler: [...k.querySelectorAll('.dugmeler button')].map((b) => b.textContent) } : null; })()`);
  const kutuDugmesi = (metin) => evalJs(`(() => { const b = [...([...document.querySelectorAll('.mesaj-kutusu')].at(-1)?.querySelectorAll('.dugmeler button') || [])].find((x) => x.textContent === ${J(metin)}); if (!b) return false; b.click(); return true; })()`);
  const sagTik = (ad, yanit) => evalJs(`(async () => { await window.pdefe.cagir('test:diyalogKaydi'); await window.pdefe.cagir('test:diyalogYanitlari', 'menu:popup', [${J(yanit)}]); const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === ${J(ad)}); window.__pdefe.sekmeler.dispatchEvent(new CustomEvent('sagTik', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 200)); const k = (await window.pdefe.cagir('test:diyalogKaydi')).filter((x) => x.kanal === 'menu:popup').at(-1); return k ? k.secenek.map((o) => (o.ayirici ? '-' : o.etiket + (o.devre ? ' (devre dışı)' : ''))) : null; })()`);

  // ---------------------------------------------------------------- hazırlık
  fs.mkdirSync(K, { recursive: true });
  uret('a.pdf', 4); uret('b.pdf', 3); uret('c.pdf', 6); uret('d.pdf', 2); uret('e.pdf', 2);
  const ESLER = [uret('es-duran.pdf', 5, { notlu: true, baslik: 'Eş belge' }), uret('es-tasinan.pdf', 5, { notlu: true, baslik: 'Eş belge' })];
  uret('notlu.pdf', 3, { notlu: true });
  let kimlikler = await yenile();
  if (kimlikler.length !== 1) throw new Error('Test tek pencereli, temiz bir örnekle başlamalı.');
  const P1 = kimlikler[0];
  P(P1);
  await hatalariTopla();
  await evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);

  // ---------------------------------------------------------------- 1) sağ tık menüsü: Pencereye ayır
  await ac('a.pdf');
  let menu = await sagTik('a.pdf', null);
  sonuc('Sağ tık menüsünde "Pencereye ayır" var; pencerenin tek sekmesinde devre dışı', menu?.includes('Pencereye ayır (devre dışı)'), menu);
  await ac('b.pdf', 'c.pdf');
  menu = await sagTik('a.pdf', null);
  sonuc('Birden çok sekme varken "Pencereye ayır" etkin; Kapat grubundan sonra, Klasörde göster\'den önce',
    J(menu) === J(['Kapat', 'Diğerlerini kapat', 'Sağdakileri kapat', '-', 'Kaydet (devre dışı)', '-', 'Pencereye ayır', '-', 'Klasörde göster', 'Yolu kopyala', 'PDF\'i kopyala']), menu);   // PDF'i kopyala: 0.1.21, Kaydet: 0.2.1
  await evalJs(`(window.__pdefe.komutCalistir('sekme.yeni'), true)`); await bekle(200);
  menu = await sagTik('Yeni sekme', null);
  sonuc('Açılış sekmesinde "Pencereye ayır" devre dışı', menu?.includes('Pencereye ayır (devre dışı)'), menu);
  await evalJs(`(async () => { const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === 'Yeni sekme'); window.__pdefe.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 200)); return true; })()`);

  // ---------------------------------------------------------------- 2) menüyle ayırma: yeni pencere, sayfa ve yakınlaştırma
  await belgeIslemi('a.pdf', `await p.sekmeSec(b.id); b.gorunum.zoomAyarla(1.25); b.gorunum.sayfayaGit(3); await new Promise((r) => setTimeout(r, 600)); return true;`);
  const kaynakOnce = await pencereBilgisi(P1);
  await sagTik('a.pdf', 'ayir');
  const P2 = await yeniPencere(kimlikler);
  sonuc('Pencereye ayır: ikinci pencere açıldı', P2 != null);
  kimlikler = await yenile();
  P(P2); await hatalariTopla();
  const p2 = await evalJs(`({ sekmeler: window.__pdefe.sekmeler.sekmeler.map((s) => s.ad), aktif: window.__pdefe.aktif()?.ad, sayfa: window.__pdefe.aktif()?.gorunum.gecerli, olcek: window.__pdefe.aktif()?.gorunum.olcek, mod: window.__pdefe.aktif()?.gorunum.zoomModu, degisti: window.__pdefe.aktif()?.degisti, baslangicGizli: document.querySelector('#baslangic').hidden })`);
  sonuc('Yeni pencerede yalnızca ayrılan sekme; aynı sayfa (3) ve yakınlaştırma (%125)', J(p2.sekmeler) === J(['a.pdf']) && p2.aktif === 'a.pdf' && p2.sayfa === 3 && Math.abs(p2.olcek - 1.25) < 1e-6 && p2.mod === 'serbest' && p2.degisti === false && p2.baslangicGizli, p2);
  const yeniBilgi = await pencereBilgisi(P2);
  sonuc('Yeni pencere kaynak pencerenin boyutunda, biraz sağında ve aşağısında; başlığı belgenin adı',
    yeniBilgi.sinirlar.width === kaynakOnce.sinirlar.width && yeniBilgi.sinirlar.height === kaynakOnce.sinirlar.height && yeniBilgi.sinirlar.x === kaynakOnce.sinirlar.x + 32 && yeniBilgi.sinirlar.y === kaynakOnce.sinirlar.y + 32 && yeniBilgi.baslik === 'a.pdf — PDEfe' && yeniBilgi.gorunur, { yeniBilgi, kaynakOnce });
  P(P1); await tasimaBitti();
  sonuc('Kaynak pencerede sekme kalmadı, öteki sekmeler duruyor', J(await sekmeAdlari()) === J(['b.pdf', 'c.pdf']), await sekmeAdlari());
  const kayit = await ana('test:pencereler');
  sonuc('Ana süreç: her dosya tek pencerede kayıtlı', kayit.find((p) => p.id === P2).yollar.length === 1 && kayit.find((p) => p.id === P1).yollar.length === 2 && kayit.find((p) => p.id === P2).yollar[0].endsWith('a.pdf'), kayit.map((p) => [p.id, p.yollar.length]));

  // ---------------------------------------------------------------- 3) dosyadaki notlar: değişiklik yoksa taşınan belge temiz kalır
  await ac('notlu.pdf'); await notlarYuklendi('notlu.pdf');
  const notluOnce = await ozet('notlu.pdf');
  sonuc('Taşımadan önce: notlu belge temiz, iki not dosyada', notluOnce.degisti === false && notluOnce.notlar.length === 2 && notluOnce.notlar.every((n) => n.dosyada), notluOnce);
  sonuc('Notlu belge var olan pencereye taşındı', (await tasi('notlu.pdf', { tur: 'pencere', pencere: P2, x: null })) === true);
  P(P2);
  const notluSonra = await ozet('notlu.pdf');
  sonuc('Taşınan notlu belge temiz: notlar dosyadakiyle aynı, kaydedilecek fark yok', J(notluSonra) === J(notluOnce), { notluOnce, notluSonra });
  sonuc('Var olan pencereye taşınan sekme sona eklendi ve etkin', J(await sekmeAdlari()) === J(['a.pdf', 'notlu.pdf']) && (await evalJs(`window.__pdefe.aktif().ad`)) === 'notlu.pdf', await sekmeAdlari());
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.solPanel'), window.__pdefe.panel.sekmeSec('yorumlar'), true)`); await bekle(500);
  sonuc('Yorumlar paneli taşınan belgenin notlarını gösterir', (await evalJs(`document.querySelectorAll('#panel-yorumlar .yorum').length`)) === 2);
  await evalJs(`(window.__pdefe.panel.sekmeSec('sayfalar'), window.__pdefe.komutCalistir('gorunum.solPanel'), true)`);

  // ---------------------------------------------------------------- 4) eş belgeler: biri taşınır, öteki taşınmaz; adım adım aynı sonuç
  P(P1);
  await ac('es-duran.pdf', 'es-tasinan.pdf'); await notlarYuklendi('es-duran.pdf'); await notlarYuklendi('es-tasinan.pdf');
  await evalJs(`(${ISLEMLER})('es-duran.pdf')`);
  await evalJs(`(${ISLEMLER})('es-tasinan.pdf')`);
  const duranIlk = await ozet('es-duran.pdf'), tasinanIlk = await ozet('es-tasinan.pdf');
  sonuc('İşlemlerden sonra eş belgeler aynı durumda (7 komut, kaydedilmemiş)', J(duranIlk) === J(tasinanIlk) && duranIlk.yigin.adlar.length === 7 && duranIlk.degisti, { duranIlk, tasinanIlk });
  let once = await yenile();
  sonuc('Kaydedilmemiş değişiklikli sekme yeni pencereye ayrıldı', (await tasi('es-tasinan.pdf', { tur: 'yeni' })) === true);
  const P3 = await yeniPencere(once);
  kimlikler = await yenile();
  P(P3); await hatalariTopla();
  sonuc('Taşınan belge: notlar, sayfa düzeni, geri al yığını ve kaydedilmemiş durum aynen geldi', J(await ozet('es-tasinan.pdf')) === J(duranIlk), { tasinan: await ozet('es-tasinan.pdf'), duranIlk });
  sonuc('Taşınan sekmede kaydedilmemiş değişiklik işareti ve Geri al ipucu', (await sekmeAdlari())[0] === 'es-tasinan.pdf*' && (await evalJs(`document.querySelector('#dugme-geri-al').title`)) === 'Geri al: Sayfa sil (Ctrl+Z)' && !(await evalJs(`document.querySelector('#durum-degisiklik').hidden`)));
  // Aynı adımlar iki pencerede: her adımdan sonra durum, her kayıttan sonra diskteki dosya karşılaştırılır
  let tasinanPencere = P3;
  const ikisinde = async (govde) => { const r = []; for (const [pencere, ad] of [[P1, 'es-duran.pdf'], [tasinanPencere, 'es-tasinan.pdf']]) { P(pencere); r.push(await belgeIslemi(ad, `await p.sekmeSec(b.id); ${govde}`)); await bekle(250); } return r; };
  const durumlar = async () => { P(P1); const d = await ozet('es-duran.pdf'); P(tasinanPencere); const t = await ozet('es-tasinan.pdf'); return [d, t]; };
  const diskler = () => ESLER.map((y) => diskOzeti(y));
  const adim = async (ad, govde, { disk = false } = {}) => {
    const donen = await ikisinde(govde);
    const [d, t] = await durumlar();
    let esit = J(d) === J(t) && J(donen[0]) === J(donen[1]), ayrinti = { donen, d, t };
    if (disk) { const [dd, dt] = diskler(); esit = esit && J(dd) === J(dt); ayrinti = { donen, d, t, dd, dt }; }
    sonuc(`Eş belgeler: ${ad}`, esit, ayrinti);
    return d;
  };
  const geriAl = `p.komutCalistir('duzen.geriAl'); await new Promise((r) => setTimeout(r, 250)); return document.querySelector('#dugme-geri-al').title;`;
  const yinele = `p.komutCalistir('duzen.yinele'); await new Promise((r) => setTimeout(r, 250)); return document.querySelector('#dugme-yinele').title;`;
  const kaydet = `return await p.belgeKaydet(b);`;
  let d = await adim('geri al (sayfa silme geri gelir)', geriAl);
  sonuc('Taşınan belgede geri al: silinen sayfa geri geldi (5 sayfa)', d.sayfaSayisi === 5, d.sayfaSayisi);
  d = await adim('geri al (döndürme)', geriAl);
  sonuc('Taşınan belgede geri al: döndürme geri alındı', d.tarif.every((t) => t.endsWith('@0')), d.tarif);
  await adim('geri al (not taşıma)', geriAl);
  await adim('yinele (not taşıma)', yinele);
  d = await adim('kaydet (artımlı: notlar dosyaya yazılır)', kaydet, { disk: true });
  sonuc('Kayıttan sonra taşınan belge temiz; yığın duruyor', d.degisti === false && d.yigin.konum === d.yigin.kayit && d.yigin.adlar.length === 7, d.yigin);
  let diskte = diskOzeti(ESLER[1]);
  sonuc('Diskte: düzenlenen not, yeni not ve yeni vurgu var; silinen vurgu yok', diskte.notlar.some((n) => n.icerik === 'düzenlenen not') && diskte.notlar.some((n) => n.icerik === 'yeni not' && n.sayfa === 3) && diskte.notlar.filter((n) => n.tur === 'Highlight').length === 1 && diskte.notlar.find((n) => n.tur === 'Highlight').sayfa === 2, diskte.notlar);
  // Kayıttan sonra geri al (dosyaya yazılmış değişiklikler tersine gider), yeniden pencere değiştir, yinele
  await adim('kayıttan sonra geri al ×3 (not taşıma, not ekleme, vurgu ekleme)', `for (let i = 0; i < 3; i++) { p.komutCalistir('duzen.geriAl'); await new Promise((r) => setTimeout(r, 200)); } return document.querySelector('#dugme-geri-al').title;`);
  P(tasinanPencere);
  sonuc('Kayıttan ve geri almalardan sonra sekme ilk pencereye geri taşındı', (await tasi('es-tasinan.pdf', { tur: 'pencere', pencere: P1, x: null })) === true);
  tasinanPencere = P1;
  sonuc('Son belgesi başka pencereye taşınan pencere kapandı', await pencereKapandi(P3), await yenile());
  kimlikler = await yenile();
  const [dGeri, tGeri] = await durumlar();
  sonuc('Geri taşınan belge eşiyle aynı durumda (kayıtta modelden çıkmayan, geri alınmış notlar dahil)', J(dGeri) === J(tGeri), { dGeri, tGeri });
  d = await adim('kaydet (geri alınan notlar dosyadan silinir)', kaydet, { disk: true });
  await adim('geri al ×2 (vurgu silme, not düzenleme) ve kaydet', `for (let i = 0; i < 2; i++) { p.komutCalistir('duzen.geriAl'); await new Promise((r) => setTimeout(r, 200)); } return await p.belgeKaydet(b);`, { disk: true });
  diskte = diskOzeti(ESLER[1]);
  sonuc('Diskte: dosya baştaki notlarına döndü (dosyadaki not ve vurgu)', diskte.notlar.length === 2 && diskte.notlar.some((n) => n.icerik === 'dosyadaki not') && diskte.notlar.some((n) => n.tur === 'Highlight' && n.sayfa === 1), diskte.notlar);
  d = await adim('yinele ×7 (hepsi) ve kaydet: döndürme ve sayfa silme yapısal kayıtla yazılır', `for (let i = 0; i < 7; i++) { p.komutCalistir('duzen.yinele'); await new Promise((r) => setTimeout(r, 200)); } return await p.belgeKaydet(b);`, { disk: true });
  diskte = diskOzeti(ESLER[1]);
  sonuc('Diskte: 4 sayfa, 2. sayfa 90° döndürülmüş, silinen sayfa yok', diskte.sayfa === 4 && J(diskte.dondurme) === J([0, 90, 0, 0]) && !diskte.ilkSatir.some((s) => s.endsWith('sayfa 4')), diskte);
  sonuc('Yapısal kayıttan sonra anlık kopya var, belge temiz', d.anlik === true && d.degisti === false, d);
  // Anlık kopyalı belgeyi yeniden ayır: anlık kopya silinmez, hedefte kayıt ve geri al çalışır
  P(P1);
  const anlikYol = await belgeIslemi('es-tasinan.pdf', `return b.gorunum.anlik;`);
  once = await yenile();
  await tasi('es-tasinan.pdf', { tur: 'yeni' });
  const P4 = await yeniPencere(once);
  kimlikler = await yenile(); tasinanPencere = P4;
  P(P4); await hatalariTopla();
  sonuc('Anlık kopyalı belge taşındı: kopya yerinde, hedef aynı kopyayı kullanıyor', fs.existsSync(anlikYol) && (await belgeIslemi('es-tasinan.pdf', `return b.gorunum.anlik;`)) === anlikYol);
  d = await adim('taşındıktan sonra geri al (sayfa silme) ve kaydet: sayfa dosyaya geri gelir', `p.komutCalistir('duzen.geriAl'); await new Promise((r) => setTimeout(r, 300)); return await p.belgeKaydet(b);`, { disk: true });
  diskte = diskOzeti(ESLER[1]);
  sonuc('Diskte: 5 sayfa (silinen sayfa geri geldi), döndürme duruyor', diskte.sayfa === 5 && J(diskte.dondurme) === J([0, 90, 0, 0, 0]) && diskte.ilkSatir[3].endsWith('sayfa 4'), diskte);
  P(P4);
  await belgeIslemi('es-tasinan.pdf', `await p.belgeKapat(b.id, { zorla: true }); await new Promise((r) => setTimeout(r, 800)); return true;`);
  sonuc('Taşınan sekme kapanınca anlık kopyası silindi', !fs.existsSync(anlikYol));
  // Belgesiz kalan pencere (kullanıcı son belgeyi kapattı) açık kalır: açılış ekranı; 0.1.21'den beri sekme çubuğunda açılış sekmesi
  sonuc('Son belgesi kapatılan pencere açık kalır (açılış ekranı, sekme çubuğunda "Yeni sekme")', (await yenile()).includes(P4) && (P(P4), !(await evalJs(`document.querySelector('#baslangic').hidden`))) && J(await sekmeAdlari()) === J(['Yeni sekme']) && (await pencereBilgisi(P4)).baslik === 'PDEfe');
  P(P1); await belgeIslemi('es-duran.pdf', `await p.belgeKapat(b.id, { zorla: true }); return true;`);

  // ---------------------------------------------------------------- 4b) görünüm durumu, kaydedilmekte olan belge
  // P1: [b, c]. c 2. sayfanın ortasına kaydırılır, b seçilir (c arka planda kalır), c sağ tık menüsünden ayrılır: aynı yerde açılmalı
  // (arka plandaki sekmenin kaydırıcısı ölçülemez; konum sekme gizlenirken saklanır)
  P(P1);
  const konumOnce = await belgeIslemi('c.pdf', `await p.sekmeSec(b.id); await new Promise((r) => setTimeout(r, 400)); const g = b.gorunum; g.sayfayaGit(2, { oran: 0.5, aninda: true }); await new Promise((r) => setTimeout(r, 300)); return { sayfa: g.gecerli, oran: g.sayfaIciOran() };`);
  await belgeIslemi('b.pdf', `await p.sekmeSec(b.id); await new Promise((r) => setTimeout(r, 300)); return true;`);
  once = await yenile();
  await sagTik('c.pdf', 'ayir');
  const PK = await yeniPencere(once);
  kimlikler = await yenile();
  P(PK); await hatalariTopla();
  const konumSonra = await belgeIslemi('c.pdf', `await new Promise((r) => setTimeout(r, 400)); const g = b.gorunum; return { sayfa: g.gecerli, oran: g.sayfaIciOran() };`);
  sonuc('Arka plandaki sekme ayrılınca aynı sayfada, sayfa içinde aynı yerde açılır', konumOnce.sayfa === 2 && konumOnce.oran > 0.3 && konumSonra?.sayfa === 2 && Math.abs(konumSonra.oran - konumOnce.oran) < 0.03, { konumOnce, konumSonra });
  P(P1); await tasimaBitti();
  sonuc('Arka plandaki sekme ayrılınca kaynak pencerede etkin sekme değişmez', (await evalJs(`window.__pdefe.aktif()?.ad`)) === 'b.pdf' && J(await sekmeAdlari()) === J(['b.pdf']), await sekmeAdlari());
  // Kaydedilmekte olan belge taşınmaz: kayıt başarısız olursa sorusu taşıma kilidinin altında kalır, pencere kilitlenirdi
  const kayitliyken = await belgeIslemi('b.pdf', `b.kaydediliyor = true; const r = await p.sekmeyiTasi(b.id, { tur: 'yeni' }); b.kaydediliyor = false; return { r, kilitli: p.kilitli(), bildirim: document.querySelector('#bildirim').textContent };`);
  sonuc('Kaydedilmekte olan belge taşınmaz; pencere kilitlenmez', kayitliyken.r === false && kayitliyken.kilitli === false && /kaydediliyor/.test(kayitliyken.bildirim) && (await yenile()).length === kimlikler.length, kayitliyken);
  // "Görünür alana sığdır": ölçek sayfanın içerik kutusundan hesaplanır; taşınınca sayfa genişliğine sığdırmaya düşmemeli
  P(PK);
  const gorunurOnce = await belgeIslemi('c.pdf', `const g = b.gorunum; await g.zoomModuAyarla('gorunur'); await new Promise((r) => setTimeout(r, 400)); return { mod: g.zoomModu, olcek: g.olcek, genislik: g.sigdirOlcek('genislik'), sol: g.kaydirici.scrollLeft };`);
  sonuc('Görünür alana sığdırılmış sekme ilk pencereye geri taşındı', (await tasi('c.pdf', { tur: 'pencere', pencere: P1, x: null })) === true);
  await pencereKapandi(PK);
  kimlikler = await yenile();
  P(P1);
  const gorunurSonra = await belgeIslemi('c.pdf', `await new Promise((r) => setTimeout(r, 500)); const g = b.gorunum; return { mod: g.zoomModu, olcek: g.olcek, genislik: g.sigdirOlcek('genislik'), sol: g.kaydirici.scrollLeft };`);
  sonuc('Görünür alana sığdır: taşınınca yakınlaştırma ve yatay konum aynı', gorunurSonra?.mod === 'gorunur' && Math.abs(gorunurSonra.olcek - gorunurOnce.olcek) < 0.01 && Math.abs(gorunurOnce.olcek - gorunurOnce.genislik) > 0.05 && Math.abs(gorunurSonra.sol - gorunurOnce.sol) <= 8, { gorunurOnce, gorunurSonra });   // yatay konum birkaç piksel oynayabilir (yerleşim yeniden hesaplanır)
  await belgeIslemi('c.pdf', `await b.gorunum.zoomModuAyarla('genislik'); await new Promise((r) => setTimeout(r, 300)); return true;`);
  // Ana süreç yanıtı artık beklemiyorsa (taşımanın süresi doldu, sekme kaynakta kaldı) hedefte kurulan sekme kaldırılır: belge iki
  // pencerede birden açık kalmaz. Paket aynı pencereye, beklenmeyen bir istek numarasıyla ve başka bir yolla verilir
  const gecKalan = await belgeIslemi('c.pdf', `const paket = await p.sekmePaketi(b); paket.yol = b.yol.replace(/c\\.pdf$/, 'c-gec.pdf'); paket.ad = 'c-gec.pdf';
    const kabul = await window.pdefe.cagir('yanit', 987654321, { tamam: true });
    await window.pdefe.cagir('test:olayGonder', 'sekme:al', 987654321, paket, {});
    for (let i = 0; i < 40 && (p.tasimaSuruyor() || p.sekmeler.sekmeler.some((s) => s.ad === 'c-gec.pdf')); i++) await new Promise((r) => setTimeout(r, 100));
    return { kabul, sekmeler: p.sekmeler.sekmeler.map((s) => s.ad), kilitli: p.kilitli(), aktif: p.aktif()?.ad };`);
  sonuc('Beklenmeyen yanıt kabul edilmez; süresi dolmuş taşımada hedefte kurulan sekme kaldırılır', gecKalan.kabul === false && J(gecKalan.sekmeler) === J(['b.pdf', 'c.pdf']) && gecKalan.kilitli === false, gecKalan);

  // ---------------------------------------------------------------- 5) sürükleyerek ayırma (gerçek fare olayları)
  // P1: [b, c], P2: [a, notlu], P4: belgesiz (açılış sekmesi)
  P(P1);
  await ac('d.pdf'); await bekle(500);
  let yer = await sekmeYeri('c.pdf'), cb = await cubuk();
  let g = await girdi(harita.get(P1));
  await g.bas(yer.x, yer.y);
  await g.git(yer.x, yer.y, yer.x + 12, cb.alt + 20);   // çubuğun 20 px altı: eşiğin (24) içinde
  await bekle(250);
  let sinif = await sekmeSiniflari();
  sonuc('Çubuğun 20 px altına sürükleme: sekme çubukta, ayrılmadı (eşik 24 px)', sinif['c.pdf'].startsWith('tasiniyor') && !sinif['c.pdf'].includes('ayrildi') && !(await ana('test:hayalet'))?.gorunur, sinif);
  await g.git(yer.x + 12, cb.alt + 20, yer.x + 30, cb.alt + 60);
  const hayaletGorundu = await kosul(`window.pdefe.cagir('test:hayalet').then((h) => !!h && h.gorunur)`, 4000);
  sinif = await sekmeSiniflari();
  let hy = await ana('test:hayalet'), sur = await ana('test:surukleme');
  sonuc('Eşiği geçince sekme çubuktan ayrıldı: çubukta görünmez, sonraki sekme yerini kapattı', sinif['c.pdf'].includes('ayrildi') && sinif['d.pdf'] === '~' && sinif['b.pdf'] === '' && getVis(await evalJs(`getComputedStyle(window.__pdefe.sekmeler.sekmeler.find((s) => s.ad === 'c.pdf').el).visibility`)), sinif);
  sonuc('Önizleme penceresi göründü: sekmenin adı ve sayfa görüntüsü, imlecin altında', hayaletGorundu && hy.icerik.ad === 'c.pdf' && hy.icerik.onizleme === true && hy.sinirlar.width === 240 && hy.sinirlar.height > 100 && sur?.kaynak === P1, { hy, sur });
  await ekranGoruntusu(path.join(K, 'png', 'ayrildi-kaynak.png'));
  // Önizleme imleci izler
  await ana('test:imlec', { x: -1700, y: 500 }); await bekle(200);
  hy = await ana('test:hayalet');
  const tutmaX = -1700 - hy.sinirlar.x, tutmaY = 500 - hy.sinirlar.y;
  sonuc('Önizleme imleci izler; sekme tutulduğu noktadan imlecin altında', tutmaX >= 30 && tutmaX <= 60 && tutmaY >= 8 && tutmaY <= 22, { sinirlar: hy.sinirlar, tutmaX, tutmaY });
  // Çubuğa geri dön: sekme yerine takılır, önizleme kalkar, sıralama sürer
  await g.git(yer.x + 30, cb.alt + 60, yer.x + 130, cb.alt + 4);
  await bekle(350);
  sinif = await sekmeSiniflari(); hy = await ana('test:hayalet');
  sonuc('Çubuğa geri gelince sekme yerine takıldı, önizleme kalktı, sıralama sürüyor (sonraki sekme yer açtı)', sinif['c.pdf'].startsWith('tasiniyor') && !sinif['c.pdf'].includes('ayrildi') && hy.gorunur === false && (await ana('test:surukleme')) === null && sinif['d.pdf'] === '~', { sinif, hy });
  await g.birak(yer.x + 130, cb.alt + 4); await bekle(400);
  sonuc('Çubukta bırakınca yalnızca sıra değişti (c, d\'nin arkasına), yeni pencere açılmadı', J(await sekmeAdlari()) === J(['b.pdf', 'd.pdf', 'c.pdf']) && (await yenile()).length === kimlikler.length, await sekmeAdlari());
  // Esc: ayrılmış sekme yerine döner
  yer = await sekmeYeri('d.pdf');
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x + 20, cb.alt + 80);
  await kosul(`window.pdefe.cagir('test:hayalet').then((h) => !!h && h.gorunur)`, 4000);
  await g.esc(); await bekle(400);
  sinif = await sekmeSiniflari();
  sonuc('Esc: ayrılmış sekme yerine döndü, önizleme kalktı', sinif['d.pdf'] === '' && (await ana('test:hayalet')).gorunur === false && J(await sekmeAdlari()) === J(['b.pdf', 'd.pdf', 'c.pdf']), sinif);
  await g.birak(yer.x + 20, cb.alt + 80); await bekle(400);
  sonuc('Esc\'ten sonra bırakmak bir şey yapmaz (yeni pencere yok, sekme askıda değil)', (await yenile()).length === kimlikler.length && !(await evalJs(`!!document.querySelector('.sekme.askida')`)));
  // Açılış sekmesi ayrılmaz
  await evalJs(`(window.__pdefe.komutCalistir('sekme.yeni'), true)`); await bekle(300);
  yer = await sekmeYeri('Yeni sekme');
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x - 60, cb.alt + 90); await bekle(300);
  sinif = await sekmeSiniflari();
  sonuc('Açılış sekmesi çubuğun dışına sürüklenince ayrılmaz (çubukta kalır, önizleme yok)', sinif['Yeni sekme'].includes('tasiniyor') && !sinif['Yeni sekme'].includes('ayrildi') && (await ana('test:hayalet')).gorunur === false, sinif);
  await g.birak(yer.x - 60, cb.alt + 90); await bekle(400);
  await evalJs(`(async () => { const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === 'Yeni sekme'); window.__pdefe.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 200)); return true; })()`);
  // Boş yere bırak: yeni pencere, ilk sekmesi imlecin altında. "Boş yer": hiçbir PDEfe penceresinin kaplamadığı bir nokta (test
  // pencereleri ekranın solunda, y ≥ 0'da; nokta onların üstünde seçilir ki yeni pencere de ekran dışında kalsın)
  await belgeIslemi('d.pdf', `await p.sekmeSec(b.id); b.notlar.ekle({ tur: 'Text', sayfa: 1, rect: [90, 90, 110, 110], icerik: 'sürüklenen not', yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' }); await new Promise((r) => setTimeout(r, 200)); return true;`);
  yer = await sekmeYeri('d.pdf');
  once = await yenile();
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x + 40, cb.alt + 200);
  await kosul(`window.pdefe.cagir('test:hayalet').then((h) => !!h && h.gorunur)`, 4000);
  const birakilan = { x: -2000, y: -1200 };
  await ana('test:imlec', birakilan); await bekle(150);
  await g.birak(yer.x + 40, cb.alt + 200);
  const P5 = await yeniPencere(once);
  sonuc('Çubuğun dışında bırakınca yeni pencere açıldı', P5 != null);
  kimlikler = await yenile();
  P(P5); await hatalariTopla();
  await bekle(300);
  const p5 = await pencereBilgisi(P5), p5Sekme = await sekmeYeri('d.pdf');
  const imlecSekmede = { x: birakilan.x - p5.icerik.x - p5Sekme.sol, y: birakilan.y - p5.icerik.y - p5Sekme.ust };
  sonuc('Yeni pencerenin sekmesi bırakılan yerde, imlecin altında (tutulduğu noktadan)', Math.abs(imlecSekmede.x - 40) <= 3 && imlecSekmede.y >= 5 && imlecSekmede.y <= 25 && p5.sinirlar.width === kaynakOnce.sinirlar.width && p5.baslik === 'd.pdf — PDEfe', { imlecSekmede, p5 });
  const dSonra = await ozet('d.pdf');
  sonuc('Sürüklenen sekmenin kaydedilmemiş notu ve geri al adımı yeni pencerede', dSonra.degisti && dSonra.notlar.some((n) => n.icerik === 'sürüklenen not') && J(dSonra.yigin.adlar) === J(['Not ekle']), dSonra);
  sonuc('Bırakıldıktan sonra önizleme kalktı', (await ana('test:hayalet')).gorunur === false && (await ana('test:surukleme')) === null);
  P(P1); await tasimaBitti();
  sonuc('Kaynak pencerede kalan sekmeler; taşıma örtüsü kalktı, askıda sekme yok', J(await sekmeAdlari()) === J(['b.pdf', 'c.pdf']) && (await evalJs(`document.querySelector('#tasima-ortusu').hidden && !document.querySelector('.sekme.askida') && !window.__pdefe.tasimaSuruyor()`)), await sekmeAdlari());

  // Başka pencerenin çubuğuna bırak: bırakma işareti ve sıra. P2: [a, notlu]
  // Hedef pencere öne alınır: test pencereleri üst üste durur, imlecin altındaki pencere en öndekidir
  const hedefCubuk = async (kimlik, ad, taraf) => { P(kimlik); await oneAl(); const b = await pencereBilgisi(kimlik), s = await sekmeYeri(ad), c = await cubuk(); return { x: Math.round(b.icerik.x + (taraf === 'sol' ? s.sol + 15 : s.sag - 15)), y: Math.round(b.icerik.y + (c.ust + c.alt) / 2) }; };
  let nokta = await hedefCubuk(P2, 'notlu.pdf', 'sol');   // notlu'nun sol yarısı: a ile notlu'nun arasına
  P(P1);
  yer = await sekmeYeri('c.pdf');
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x + 10, cb.alt + 120);
  await kosul(`window.pdefe.cagir('test:hayalet').then((h) => !!h && h.gorunur)`, 4000);
  await ana('test:imlec', nokta);
  await kosul(`window.pdefe.cagir('test:surukleme').then((s) => s?.hedef === ${P2})`, 4000);
  P(P2);
  const isaret = await evalJs(`(() => { const i = document.querySelector('.sekme-birakma'), s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === 'notlu.pdf').el.getBoundingClientRect(); return i ? { isaret: i.getBoundingClientRect().left, sekmeSol: s.left, gorunur: getComputedStyle(i).display !== 'none' } : null; })()`);
  sonuc('Başka pencerenin çubuğu üstünde: bırakılacak yerde işaret (iki sekmenin arası)', isaret && isaret.gorunur && Math.abs(isaret.isaret - (isaret.sekmeSol - 2)) <= 2, isaret);
  await ekranGoruntusu(path.join(K, 'png', 'birakma-isareti.png'));
  // İmleç çubuktan çıkınca işaret kalkar
  await ana('test:imlec', { x: nokta.x, y: nokta.y + 300 });
  sonuc('İmleç hedef çubuktan çıkınca işaret kalkar', await kosul(`!document.querySelector('.sekme-birakma')`, 3000));
  await ana('test:imlec', nokta);
  await kosul(`!!document.querySelector('.sekme-birakma')`, 3000);
  P(P1);
  await g.birak(yer.x + 10, cb.alt + 120);
  P(P2);
  await kosul(`window.__pdefe.sekmeler.sekmeler.length === 3 && !!window.__pdefe.aktif()?.gorunum.hazir`, 8000);
  sonuc('Başka pencerenin çubuğuna bırakılan sekme işaretin gösterdiği yere girdi ve etkin; işaret kalktı', J(await sekmeAdlari()) === J(['a.pdf', 'c.pdf', 'notlu.pdf']) && (await evalJs(`window.__pdefe.aktif().ad`)) === 'c.pdf' && !(await evalJs(`!!document.querySelector('.sekme-birakma')`)), await sekmeAdlari());
  sonuc('Sekmenin bırakıldığı pencere öne geldi', await kosul(`window.pdefe.cagir('test:pencereler').then((p) => p[0].id === ${P2})`, 4000));
  P(P1); await tasimaBitti();
  kimlikler = await yenile();
  sonuc('Yeni pencere açılmadı; kaynakta tek sekme kaldı', kimlikler.length === once.length + 1 && J(await sekmeAdlari()) === J(['b.pdf']), kimlikler);

  // Tek sekmeli pencere: sekme boş yere bırakılınca pencere oraya taşınır, yeni pencere açılmaz
  P(P1);
  yer = await sekmeYeri('b.pdf'); cb = await cubuk();
  const p1Once = await pencereBilgisi(P1);
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x + 5, cb.alt + 150);
  await kosul(`window.pdefe.cagir('test:hayalet').then((h) => !!h && h.gorunur)`, 4000);
  const tasinan = { x: -2300, y: -2500 };   // hiçbir pencerenin kaplamadığı bir nokta (ekran dışında, öteki pencerelerin üstünde)
  await ana('test:imlec', tasinan); await bekle(150);
  await g.birak(yer.x + 5, cb.alt + 150);
  await kosul(`window.pdefe.cagir('test:pencereler').then((p) => { const s = p.find((x) => x.id === ${P1}).sinirlar; return s.x !== ${p1Once.sinirlar.x} || s.y !== ${p1Once.sinirlar.y}; })`, 5000);
  await tasimaBitti(); await bekle(200);
  const p1Sonra = await pencereBilgisi(P1), bYer = await sekmeYeri('b.pdf');
  const altinda = { x: tasinan.x - p1Sonra.icerik.x - bYer.sol, y: tasinan.y - p1Sonra.icerik.y - bYer.ust };
  sonuc('Tek sekmeli pencerenin sekmesi boş yere bırakıldı: yeni pencere yok, pencere oraya taşındı (sekme imlecin altında)', (await yenile()).length === kimlikler.length && (p1Sonra.sinirlar.x !== p1Once.sinirlar.x || p1Sonra.sinirlar.y !== p1Once.sinirlar.y) && Math.abs(altinda.x - 40) <= 3 && altinda.y >= 5 && altinda.y <= 25 && J(await sekmeAdlari()) === J(['b.pdf']) && (await ana('test:hayalet')).gorunur === false, { p1Once: p1Once.sinirlar, p1Sonra: p1Sonra.sinirlar, altinda });
  g.kapat();

  // Belgesiz pencereye (P4, yalnızca açılış sekmesi; 0.1.21'e dek sekmesizdi) bırakma: pencerenin her yeri bırakma alanı. P4 öteki pencerelerle üst üste: öne alınır
  // (üst üste binen pencerelerde imlecin altındaki, en öndeki penceredir)
  P(P4); await oneAl();
  const p4 = await pencereBilgisi(P4);
  P(P5);
  yer = await sekmeYeri('d.pdf'); cb = await cubuk();
  g = await girdi(harita.get(P5));
  await g.bas(yer.x, yer.y); await g.git(yer.x, yer.y, yer.x + 10, cb.alt + 100);
  await kosul(`window.pdefe.cagir('test:hayalet').then((h) => !!h && h.gorunur)`, 4000);
  await ana('test:imlec', { x: Math.round(p4.icerik.x + p4.icerik.width / 2), y: Math.round(p4.icerik.y + p4.icerik.height / 2) });
  sonuc('Belgesiz pencerenin ortası bırakma alanı sayılır', await kosul(`window.pdefe.cagir('test:surukleme').then((s) => s?.hedef === ${P4})`, 4000), await ana('test:surukleme'));
  P(P4);
  sonuc('Belgesiz pencerenin üstünde: "Sekmeyi buraya bırakın" örtüsü', await kosul(`!document.querySelector('#surukle-ortusu').hidden && document.querySelector('#surukle-ortusu').textContent.includes('Sekmeyi buraya bırakın')`, 3000));
  P(P5);
  await g.birak(yer.x + 10, cb.alt + 100);
  P(P4);
  await kosul(`window.__pdefe.sekmeler.sekmeler.length === 1 && !!window.__pdefe.aktif()?.gorunum.hazir`, 8000);
  sonuc('Belgesiz pencereye bırakılan sekme orada açıldı, açılış sekmesinin yerini aldı; örtü kalktı ve eski yazısına döndü', J(await sekmeAdlari()) === J(['d.pdf*']) && (await evalJs(`document.querySelector('#surukle-ortusu').hidden && document.querySelector('#surukle-ortusu').textContent.includes('PDF')`)), await sekmeAdlari());
  sonuc('Tek sekmesi başka pencereye bırakılan pencere kapandı', await pencereKapandi(P5), await yenile());
  kimlikler = await yenile();
  g.kapat();

  // ---------------------------------------------------------------- 6) dosya yalnızca bir pencerede açık
  // P1: [b], P2: [a, c, notlu], P4: [d*]
  P(P1);
  const acma = await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(path.join(K, 'notlu.pdf'))}); await new Promise((r) => setTimeout(r, 400)); return { donen: b ? b.ad : null, sekmeler: window.__pdefe.sekmeler.sekmeler.map((s) => s.ad) }; })()`);
  P(P2);
  sonuc('Başka pencerede açık dosya burada ikinci kez açılmaz; açık olduğu pencere öne gelir ve sekmesine geçer', acma.donen === null && J(acma.sekmeler) === J(['b.pdf']) && (await ana('test:pencereler'))[0].id === P2 && (await evalJs(`window.__pdefe.aktif().ad`)) === 'notlu.pdf', acma);
  // İkinci örnek (Gezgin'de çift tık): açık dosya açık olduğu pencerede, yeni dosya en son etkin pencerede
  const veri = await ana('uygulama:veriKlasoru');
  const ikinciOrnek = (dosya) => new Promise((coz) => { const s = spawn(path.join(KOK, 'node_modules', 'electron', 'dist', 'electron.exe'), ['.', dosya], { cwd: KOK, env: { ...process.env, PDEFE_VERI_KLASORU: veri, PDEFE_TEST_KONUM: '-2600,0' }, stdio: 'ignore' }); s.on('exit', () => coz(true)); setTimeout(() => coz(false), 15000); });
  P(P4); await oneAl();   // en öndeki pencere P4; b.pdf P1'de açık
  await ikinciOrnek(path.join(K, 'b.pdf'));
  const onde = await kosul(`window.pdefe.cagir('test:pencereler').then((p) => p[0].id === ${P1})`, 6000);
  const sayi = (await yenile()).length;
  P(P4); const p4Sekmeleri = await sekmeAdlari();
  sonuc('İkinci örnek, açık dosya: açık olduğu pencere öne geldi, başka pencerede açılmadı', onde && sayi === kimlikler.length && J(p4Sekmeleri) === J(['d.pdf*']), { onde, sayi, p4Sekmeleri });
  await ikinciOrnek(path.join(K, 'e.pdf'));
  P(P1);
  await kosul(`window.__pdefe.sekmeler.sekmeler.some((s) => s.ad === 'e.pdf')`, 8000);
  sonuc('İkinci örnek, yeni dosya: en son etkin pencerede yeni sekmede açıldı', J(await sekmeAdlari()) === J(['b.pdf', 'e.pdf']), await sekmeAdlari());

  // ---------------------------------------------------------------- 7) ayarlar pencereler arasında ortak
  P(P1); const temaOnce = await evalJs(`document.documentElement.dataset.tema`);
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.tema'), true)`); await bekle(300);
  P(P2);
  sonuc('Tema bir pencerede değişince öteki pencere de değişir', (await evalJs(`document.documentElement.dataset.tema`)) !== temaOnce && (await evalJs(`window.__pdefe.ayar().tema`)) !== 'sistem');
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.duzen', 'iki'), true)`); await bekle(500);
  P(P1);
  sonuc('Sayfa düzeni bir pencerede değişince öteki pencerenin etkin belgesi de geçer (iki sayfa)', (await evalJs(`window.__pdefe.aktif().gorunum.ikili()`)) === true && (await evalJs(`window.__pdefe.ayar().varsayilanDuzen`)).startsWith('iki'));
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.duzen', 'tek'), true)`); await bekle(400);
  await evalJs(`window.pdefe.cagir('ayar:koy', 'vurguRengi', '#7ee787')`); await bekle(300);
  P(P2);
  sonuc('Vurgu rengi öteki pencerenin seçim çubuğuna da geçer', (await evalJs(`window.__pdefe.ayar().vurguRengi`)) === '#7ee787' && (await evalJs(`document.querySelector('#secim-cubugu .vurgu-dugme').style.getPropertyValue('--r')`)) === '#7ee787');
  sonuc('Son açılanlar bütün pencerelerde aynı (son açılan e.pdf başta)', (await evalJs(`window.__pdefe.ayar().sonDosyalar[0]`)).endsWith('e.pdf') && (P(P4), (await evalJs(`window.__pdefe.ayar().sonDosyalar[0]`)).endsWith('e.pdf')));
  // Çekirdek paylaşılır: iki pencere aynı istek kimliğiyle art arda çağırır (her pencere kendi sayacından verir), yanıtlar karışmaz
  const cagri = (yol) => evalJs(`(window.__s22Cagri = window.pdefe.cagir('cekirdek:cagir', 'belge_bilgi', { yol: ${J(yol)} }, 4242).then((b) => b.sayfa), true)`);
  P(P1); await cagri(path.join(K, 'c.pdf')); P(P2); await cagri(path.join(K, 'd.pdf'));
  P(P1); const s1 = await evalJs(`window.__s22Cagri`); P(P2); const s2 = await evalJs(`window.__s22Cagri`);
  sonuc('Çekirdek: iki pencerenin aynı kimlikli istekleri kendi yanıtını alır', s1 === 6 && s2 === 2, { s1, s2 });

  // ---------------------------------------------------------------- 8) meşgul hedef pencere: sekme kaynakta kalır
  P(P2); await evalJs(`(window.__pdefe.komutCalistir('duzen.ayarlar'), true)`); await kosul(`!!document.querySelector('.ayarlar-ortusu')`);
  P(P4);
  const dOnce = await ozet('d.pdf');
  const red = await tasi('d.pdf', { tur: 'pencere', pencere: P2, x: null });
  const bildirim = await evalJs(`document.querySelector('#bildirim').textContent`);
  sonuc('Hedef pencerede açık pencere varken taşıma olmaz; sekme ve kaydedilmemiş durumu kaynakta aynen kalır, nedeni bildirilir', red === false && J(await ozet('d.pdf')) === J(dOnce) && /meşgul/.test(bildirim) && J(await sekmeAdlari()) === J(['d.pdf*']) && (await evalJs(`document.querySelector('#tasima-ortusu').hidden && !window.__pdefe.tasimaSuruyor()`)), { red, bildirim });
  P(P2); await evalJs(`(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`); await kosul(`!document.querySelector('.ayarlar-ortusu')`);
  sonuc('Hedef pencerede sekme açılmadı', J(await sekmeAdlari()) === J(['a.pdf', 'c.pdf', 'notlu.pdf']), await sekmeAdlari());

  // ---------------------------------------------------------------- 9) pencere kapatma, güncelleme öncesi izin, Çıkış
  // P4: [d*] kaydedilmemiş. Kapatma isteği: soru; Vazgeç'te pencere açık kalır
  P(P4);
  await ana('test:olayGonder', 'pencere:kapatIstegi');
  await kosul(`!!document.querySelector('.mesaj-kutusu')`, 5000);
  let k = await kutu();
  sonuc('Kaydedilmemiş belgeli pencere kapatılırken yalnızca o pencerede sorulur', k?.ileti === '"d.pdf" belgesinde kaydedilmemiş değişiklikler var.' && (P(P2), !(await kutu())), k);
  P(P4); await kutuDugmesi('Vazgeç'); await bekle(300);
  sonuc('Vazgeç: pencere ve sekme açık', (await yenile()).includes(P4) && (P(P4), J(await sekmeAdlari()) === J(['d.pdf*'])));
  // Kapanmakta olan pencere sekme almaz: kapatma akışı soru açmadan beklerken (süren kayıt) gelen sekme sorulmadan pencereyle birlikte
  // kapanırdı. P4'te süren kayıt taklit edilir, kapatma istenir, P2'den sekme taşınmak istenir
  P(P4);
  await evalJs(`(() => { const p = window.__pdefe, b = [...p.belgeler.values()][0]; b.kaydediliyor = true; b.kayitSozu = new Promise((c) => { window.__s22KayitBitir = () => { b.kaydediliyor = false; c(); }; }); return true; })()`);
  await ana('test:olayGonder', 'pencere:kapatIstegi'); await bekle(400);
  const kapanirkenKutu = await kutu();
  P(P2);
  const p2Once = await sekmeAdlari();
  const kapanirken = await tasi(p2Once[0].replace('*', ''), { tur: 'pencere', pencere: P4, x: null });
  const kapanirkenBildirim = await evalJs(`document.querySelector('#bildirim').textContent`);
  sonuc('Kapanmakta olan pencere sekme almaz; sekme kaynak pencerede kalır', kapanirkenKutu === null && kapanirken === false && J(await sekmeAdlari()) === J(p2Once) && /kapanıyor/.test(kapanirkenBildirim), { kapanirkenKutu, kapanirken, kapanirkenBildirim, sekmeler: await sekmeAdlari() });
  P(P4); await evalJs(`(window.__pdefeOtoYanit = { secim: 2 }, window.__s22KayitBitir(), true)`); await bekle(500);
  sonuc('Kayıt bitince kapatma sorusu sorulur; Vazgeç: pencere ve sekme açık', (await yenile()).includes(P4) && (P(P4), J(await sekmeAdlari()) === J(['d.pdf*'])) && (await evalJs(`window.__pdefeOtoYanit?.son?.mesaj || ''`)).includes('d.pdf'), await sekmeAdlari());
  await evalJs(`(window.__pdefeOtoYanit = null, true)`);
  // Güncelleme kurulumu öncesi: isteyen pencere öteki pencerelerden izin alır (her biri kendi belgelerini sorar)
  P(P4); await evalJs(`(window.__pdefeOtoYanit = { secim: 2 }, true)`);
  P(P1);
  sonuc('Öteki pencerelerden izin: birinde Vazgeç denirse izin yok', (await ana('pencere:digerlerindenIzinAl')) === false);
  // İzin veren pencere kurulum başlayana dek girdi almaz (izinden sonra yapılan değişiklik sorulmadan kaybolmasın); vazgeçilince kilit kalkar
  const kilitler = async () => { const s = {}; for (const p of [P1, P2, P4]) { P(p); s[p] = await evalJs(`window.__pdefe.kilitli()`); } return s; };
  await bekle(200);
  let kl = await kilitler();
  sonuc('Vazgeçilince hiçbir pencere kilitli kalmaz', !kl[P1] && !kl[P2] && !kl[P4], kl);
  P(P4); await evalJs(`(window.__pdefeOtoYanit = { secim: 1 }, true)`);
  P(P1);
  sonuc('Öteki pencerelerden izin: Kaydetme denirse izin var; pencereler ve sekmeler açık kalır', (await ana('pencere:digerlerindenIzinAl')) === true && (await yenile()).length === kimlikler.length && (P(P4), J(await sekmeAdlari()) === J(['d.pdf*'])));
  kl = await kilitler();
  sonuc('İzin veren pencereler kurulum başlayana dek kilitli', kl[P2] === true && kl[P4] === true, kl);
  // Kilitli pencere: menü komutu çalışmaz, kapatma isteği soru açmadan reddedilir, sekme taşınmaz
  P(P4);
  await ana('test:olayGonder', 'menu:komut', 'sekme.yeni'); await ana('test:olayGonder', 'pencere:kapatIstegi'); await bekle(400);
  const kilitliTasima = await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()][0]; return await p.sekmeyiTasi(b.id, { tur: 'yeni' }); })()`);
  sonuc('Kilitli pencere girdi almaz (menü komutu, kapatma isteği, sekme taşıma)', J(await sekmeAdlari()) === J(['d.pdf*']) && !(await kutu()) && kilitliTasima === false && (await yenile()).length === kimlikler.length,
    { sekmeler: await sekmeAdlari(), kutu: await kutu(), kilitliTasima });
  // Kilitliyken açılan mesaj kutusu (beklenmeyen bir hata sorusu) yanıtlanabilir: kilit örtüsü çekilir, tuşlar kutuya gider
  P(P4);
  const kilitliKutu = await evalJs(`(async () => { const p = window.__pdefe, oto = window.__pdefeOtoYanit; window.__pdefeOtoYanit = null;
    const soz = p.mesajKutusu({ tur: 'info', mesaj: 'Kilit denemesi', dugmeler: ['Tamam', 'Vazgeç'], iptal: 1 }); await new Promise((r) => setTimeout(r, 200));
    const ortuGorunur = getComputedStyle(document.querySelector('#tasima-ortusu')).display !== 'none';
    const k = [...document.querySelectorAll('.mesaj-kutusu')].at(-1), r = k.getBoundingClientRect(), ustte = k.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const yanit = await Promise.race([soz.then((y) => y.secim), new Promise((c) => setTimeout(() => c('yanıtsız'), 1500))]);
    document.querySelector('.mesaj-ortusu')?.remove(); window.__pdefeOtoYanit = oto;
    await new Promise((r) => setTimeout(r, 100));
    return { ortuGorunur, ustte, yanit, kilitli: p.kilitli(), ortuGeriGeldi: getComputedStyle(document.querySelector('#tasima-ortusu')).display !== 'none' }; })()`);
  sonuc('Kilitli pencerede açılan mesaj kutusu yanıtlanabilir (örtü çekilir, Esc kutuya gider), sonra kilit sürer',
    kilitliKutu.ortuGorunur === false && kilitliKutu.ustte === true && kilitliKutu.yanit === 1 && kilitliKutu.kilitli === true && kilitliKutu.ortuGeriGeldi === true, kilitliKutu);
  // Kurulum başlatılamadı: kilitler açılır
  await ana('pencere:izinBirak'); await bekle(200);
  kl = await kilitler();
  sonuc('Kurulum başlatılamayınca kilitler açılır', !kl[P1] && !kl[P2] && !kl[P4], kl);
  // Çıkış: pencereler en öndekinden başlayarak kapanır; Vazgeç denilen pencerede durur
  P(P4); await evalJs(`(window.__pdefeOtoYanit = { secim: 2 }, true)`);
  await oneAl();   // P4 en öne: ilk o sorulur
  const sira = (await ana('test:pencereler')).map((p) => p.id);
  await ana('test:cik'); await bekle(1200);
  const kalan = await yenile();
  sonuc('Çıkış, ilk pencerede Vazgeç: hiçbir pencere kapanmadı (sıra o pencerede durdu)', sira[0] === P4 && kalan.length === kimlikler.length, { sira, kalan });
  const hatalar = [];
  for (const p of [P1, P2, P4]) { P(p); hatalar.push(...JSON.parse(await evalJs(`JSON.stringify(window.__s22Hatalar || [])`))); }
  sonuc('Konsolda hata yok (üç pencere)', hatalar.length === 0, hatalar);
  P(P1); await oneAl(); P(P2); await oneAl();   // sıra: P2, P1 (değişiklik yok: kapanırlar), P4 (Vazgeç)
  const sira2 = (await ana('test:pencereler')).map((p) => p.id);
  // Kapanan pencerenin dosyaları ve yarım yazdırma işi öteki pencere açık kalsa da bırakılır (çekirdek ve yazdırma işi ortaktır).
  // P2'nin bir dosyası çekirdeğe okutulur: açık tanıtıcı varken Windows'ta dosyanın adı değiştirilemez
  P(P2);
  const kilitYolu = await evalJs(`[...window.__pdefe.belgeler.values()][0].yol`);
  await evalJs(`window.pdefe.cagir('cekirdek:cagir', 'belge_bilgi', { yol: ${J(kilitYolu)} }).then(() => true)`);
  const adDegisir = () => { try { fs.renameSync(kilitYolu, kilitYolu + '.x'); fs.renameSync(kilitYolu + '.x', kilitYolu); return true; } catch { return false; } };
  const onceDegisir = adDegisir();
  const yazdirIsi = await ana('yazdir:hazirla');
  P(P4);
  sonuc('Hazırlık: P2\'nin dosyası çekirdekte açık (adı değiştirilemiyor), yazdırma işi P2\'de sürüyor', onceDegisir === false && yazdirIsi?.basarili === true && (await ana('yazdir:durum')).suruyor === true, { onceDegisir, yazdirIsi });
  await ana('test:cik').catch(() => {}); await bekle(1800);
  const kalan2 = await yenile();
  sonuc('Çıkış: değişikliği olmayan öndeki pencereler kapandı, Vazgeç denilen pencere açık kaldı', J(sira2) === J([P2, P1, P4]) && J(kalan2) === J([P4]), { sira2, kalan2 });
  P(P4);
  let sonraDegisir = false;
  for (let i = 0; i < 15 && !sonraDegisir; i++) { sonraDegisir = adDegisir(); if (!sonraDegisir) await bekle(200); }
  sonuc('Kapanan pencerenin dosyası çekirdekten bırakıldı (öteki pencere açıkken adı değiştirilebiliyor)', sonraDegisir === true);
  const yazdirDurumu = await ana('yazdir:durum');
  sonuc('Kapanan pencerenin yarım yazdırma işi bırakıldı (öteki pencere yazdırabilir, geçici klasör silindi)', yazdirDurumu.suruyor === false && !fs.existsSync(yazdirIsi.klasor), { yazdirDurumu, klasor: fs.existsSync(yazdirIsi.klasor) });
  // Arayüz süreci çöken pencere Çıkış'ı durdurmaz: sorusuz kapanır. P4: [d*]; e ayrılır (P6), P6 çökertilir
  await ac('e.pdf'); await bekle(400);
  once = await yenile();
  await tasi('e.pdf', { tur: 'yeni' });
  const P6 = await yeniPencere(once);
  await yenile();
  await cdpKomut(harita.get(P6), 'Page.crash');
  await bekle(1200);
  P(P4);
  const cokmus = (await ana('test:pencereler')).find((p) => p.id === P6);
  sonuc('Çöken pencere: hazır değil, dosya kaydı boş (dosyası başka pencerede açılabilir)', cokmus?.hazir === false && cokmus.yollar.length === 0, cokmus);
  // Çıkış'ın sorusu açıkken gelen ikinci kapatma isteği (× ya da Çıkış yeniden) Çıkış'ı yarıda kesmez: soru yanıtlanınca sıradaki
  // pencereler de kapanır. Sıra: P4 (soru), P6 (çökmüş)
  await evalJs(`(window.__pdefeOtoYanit = null, true)`);
  await oneAl();
  await ana('test:cik');
  await kosul(`!!document.querySelector('.mesaj-kutusu')`, 5000);
  await ana('test:olayGonder', 'pencere:kapatIstegi'); await bekle(400);
  const ikinciIstek = { kutu: await kutu(), pencereler: (await ana('test:pencereler')).map((p) => p.id) };
  sonuc('Çıkış sorusu açıkken ikinci kapatma isteği: soru açık kalır, pencereler durur', ikinciIstek.kutu?.ileti === '"d.pdf" belgesinde kaydedilmemiş değişiklikler var.' && J(ikinciIstek.pencereler) === J([P4, P6]), ikinciIstek);
  await kutuDugmesi('Kaydetme').catch(() => {});
  let kapandi = false;
  for (let i = 0; i < 60 && !kapandi; i++) { await bekle(250); try { await fetch(`http://127.0.0.1:${PORT}/json`); } catch { kapandi = true; } }
  sonuc('Çıkış, Kaydetme: soru yanıtlanınca pencere ve sıradaki (çökmüş) pencere kapandı, uygulama kapandı', kapandi);

  console.log(`\n${tamam} tamam, ${hataSayisi} hata`);
  console.log(hataSayisi ? `${hataSayisi} HATA` : 'Hepsi geçti');
  process.exitCode = hataSayisi ? 1 : 0;
}

function getVis(v) { return v === 'hidden'; }
