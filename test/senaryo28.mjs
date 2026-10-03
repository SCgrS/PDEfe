// Senaryo 28 (0.2.1, kullanıcı isteği): sağ tık menülerinde "Kaydet".
//   1) Belge sayfasında sağ tık: menünün en altında, Tümünü seç'ten ayraçla ayrılmış "Kaydet"; kaydedilecek değişiklik yokken devre dışı,
//      not eklenince etkin; seçilince belge kaydedilir (dosyada not var, sekme kaydedilmiş görünür, araç çubuğundaki Kaydet devre dışı).
//   2) Yazı kutusu düzenlenirken sağ tık: Kaydet etkin (yeni yazı henüz not değil); seçilince yazı not olarak dosyaya yazılır.
//   3) Sekmede sağ tık: "Sağdakileri kapat"tan sonra, ayraçlar arasında "Kaydet"; etkin olmayan sekmenin belgesi kaydedilir, etkin sekme
//      değişmez, öteki belgeye dokunulmaz. Değişikliksiz belgede, açılış sekmesinde ve kaydı süren belgede devre dışı.
// Girdiler test/cikti/s28/pdf altında üretilir; menü seçimi test yanıtıyla verilir (test:diyalogYanitlari), sağ tık gerçek fare olayıyla.
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9428      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9428; node test\surucu.mjs betik test\senaryo28.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bir bölüm: $env:BOLUM="3" (virgülle birden çok). Ekran görüntüleri test/cikti/s28/png altına yazılır.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's28');
const PDF = path.join(UI, 'pdf');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

const uret = (yol, sayfa, baslik) => {
  fs.rmSync(yol, { force: true, maxRetries: 10, retryDelay: 300 });
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yol, String(sayfa), baslik], { encoding: 'utf8' });
};
/** Dosyadaki notlar (ornek_pdf_uret.py --ozet): [{ sayfa, tur, metin }] */
const dosyaNotlari = (yol) => {
  const o = JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), '--ozet', yol], { encoding: 'utf8' }));
  return (o.notlar || []).map((n) => ({ sayfa: n.sayfa, tur: n.tur, metin: n.icerik }));
};
/** Menü öğeleri metin olarak: ayraç '-', devre dışı öğe "(devre dışı)" ekli */
const menuMetni = (ogeler) => (ogeler ? ogeler.map((o) => (o.ayirici ? '-' : o.etiket + (o.devre ? ' (devre dışı)' : ''))) : null);

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, yaz }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const diyalogKaydi = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const yanitla = (yanit) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'menu:popup', [${J(yanit)}])`);
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); for (const s of [...p.sekmeler.sekmeler]) p.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 300)); return p.belgeler.size; })()`);
  const ac = async (yol) => {
    const r = await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); return !!b; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(300);
    return r;
  };
  /** Belgenin durumu (ada göre) */
  const belgeDurumu = (ad) => evalJs(`(() => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${J(ad)}); if (!b) return null;
    const s = p.sekmeler.sekmeler.find((x) => x.id === b.id);
    return { degisti: !!b.degisti, kaydediliyor: !!b.kaydediliyor, aktif: p.aktif()?.id === b.id, sekmeDegisti: !!s?.degisti, sekmeYildiz: !!s?.el?.classList.contains('degisti'),
      dugmeDevre: document.querySelector('#arac-cubugu [data-komut="dosya.kaydet"]').disabled }; })()`);
  /** Sayfanın ekrandaki bir noktası (sayfa kutusunun solundan dx, üstünden dy; görünür alanın içinde) */
  const sayfaNoktasi = (dx, dy) => evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; const r = g.sayfalar[g.gecerli - 1].el.getBoundingClientRect();
    const k = g.kaydirici.getBoundingClientRect(); return [Math.round(r.left + ${dx}), Math.round(Math.max(r.top, k.top) + ${dy})]; })()`);
  /** Gerçek fareyle sağ tık; menüyü test yanıtıyla kapatır, menünün öğelerini döndürür */
  const sagTikMenu = async (x, y, yanit = null) => {
    await diyalogKaydi(); await yanitla(yanit);
    await tikla(x, y, { dugme: 'right' }); await bekle(500);
    const k = (await diyalogKaydi()).filter((d) => d.kanal === 'menu:popup');
    return k.at(-1)?.secenek || null;
  };
  /** Sekmede gerçek fareyle sağ tık (sekmenin ad yazısının ortası) */
  const sekmeSagTik = async (ad, yanit = null) => {
    const n = await evalJs(`(() => { const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === ${J(ad)}); if (!s) return null;
      const r = s.el.querySelector('.ad').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
    if (!n) return null;
    return sagTikMenu(n[0], n[1], yanit);
  };
  const notEkle = (ad, icerik) => evalJs(`(async () => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.ad === ${J(ad)});
    b.notlar.ekle({ tur: 'Text', sayfa: 1, rect: [400, 600, 420, 620], icerik: ${J(icerik)}, yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' });
    await new Promise((r) => setTimeout(r, 200)); return !!b.degisti; })()`);
  const mesajKutulari = async () => (await diyalogKaydi()).filter((d) => d.kanal === 'mesaj:kutu');
  const bolumler = (process.env.BOLUM || '1,2,3').split(',').map((s) => s.trim());
  const bolum = (n) => bolumler.includes(String(n));

  // ------------------------------------------------------------ hazırlık
  await sekmeleriKapat();
  await bekle(400);
  fs.mkdirSync(PDF, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); const ce = console.error; console.error = (...a) => { window.__hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; } return true; })()`);
  // Otomatik kayıt kapalı (varsayılan da kapalı): kaydı yalnızca menüdeki Kaydet yapsın
  await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'otomatikKaydet', false); window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);
  // Sorular ana süreçteki test kuyruğuna gitsin (açılırsa diyalog kaydında görünür)
  await evalJs(`(() => { window.__pdefeYerelKutu = true; return true; })()`);
  await diyalogKaydi();

  // ------------------------------------------------------------ 1) Belge sayfasında sağ tık › Kaydet
  if (bolum(1)) {
    console.log('\n== 1) Belge sayfasında sağ tık › Kaydet');
    const yol = path.join(PDF, 'sayfa.pdf');
    uret(yol, 3, 'Sağ tık kaydet');
    await ac(yol);
    let [x, y] = await sayfaNoktasi(300, 200);
    let menu = await sagTikMenu(x, y);
    let m = menuMetni(menu);
    sonuc('Sayfada sağ tık menüsü açıldı', !!menu, m);
    sonuc('Kaydet en altta, Tümünü seç\'ten ayraçla ayrılmış', m && m.at(-1)?.startsWith('Kaydet') && m.at(-2) === '-' && m.at(-3) === 'Tümünü seç', m);
    sonuc('Değişiklik yokken Kaydet devre dışı', m?.at(-1) === 'Kaydet (devre dışı)', m);
    sonuc('Öteki öğeler yerinde (Kopyala ilk sırada)', m?.[0]?.startsWith('Kopyala') && m.includes('Not ekle') && m.includes('Tümünü seç'), m);

    const dosyaOnce = fs.statSync(yol).mtimeMs;
    sonuc('Not eklendi: belge kaydedilmemiş', await notEkle('sayfa.pdf', 'sağ tık notu'));
    menu = await sagTikMenu(x, y);
    sonuc('Kaydedilmemiş not varken Kaydet etkin', menuMetni(menu)?.at(-1) === 'Kaydet', menuMetni(menu));
    await mesajKutulari();
    await sagTikMenu(x, y, 'kaydet');
    await kosul(`(() => { const b = window.__pdefe.aktif(); return b && !b.degisti && !b.kaydediliyor; })()`, 8000);
    const d = await belgeDurumu('sayfa.pdf');
    const notlar = dosyaNotlari(yol);
    sonuc('Kaydet seçilince belge kaydedildi (sekme ve araç çubuğu kaydedilmiş gösteriyor)', d && !d.degisti && !d.sekmeDegisti && d.dugmeDevre, d);
    sonuc('Dosyada not var', notlar.some((n) => n.metin === 'sağ tık notu'), notlar);
    sonuc('Dosya diske yazıldı', fs.statSync(yol).mtimeMs > dosyaOnce);
    const kutular = await mesajKutulari();
    sonuc('Kaydederken soru sorulmadı', kutular.length === 0, kutular.map((k) => k.secenek?.mesaj));
    const durumMesaji = await evalJs(`document.querySelector('#durum-mesaj')?.textContent || ''`);
    sonuc('Durum çubuğunda "Kaydedildi"', /Kaydedildi/.test(durumMesaji), durumMesaji);
    menu = await sagTikMenu(x, y);
    sonuc('Kayıttan sonra Kaydet yeniden devre dışı', menuMetni(menu)?.at(-1) === 'Kaydet (devre dışı)', menuMetni(menu));
    await ss('01-sayfa-kaydedildi');

    // ---------------------------------------------------------- 2) Yazı kutusu düzenlenirken
    console.log('\n== 2) Yazı kutusu düzenlenirken sağ tık › Kaydet');
    await evalJs(`(window.__pdefe.aktif().notlar.aracSec('yazi'), true)`);
    [x, y] = await sayfaNoktasi(120, 320);
    await tikla(x, y); await bekle(400);
    await yaz('Sağ tık yazısı');
    await bekle(200);
    const acik = await evalJs(`(() => { const b = window.__pdefe.aktif(); const d = b.notlar.duzenleyici; return { duzenleyici: d ? d.el.textContent : null, degisti: !!b.degisti }; })()`);
    sonuc('Yazı kutusu düzenleniyor', acik.duzenleyici === 'Sağ tık yazısı', acik);
    // Düzenleyicinin içinde sağ tık (yazının ortası)
    const ic = await evalJs(`(() => { const r = window.__pdefe.aktif().notlar.duzenleyici.el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
    menu = await sagTikMenu(ic[0], ic[1]);
    const duzenleyiciSonra = await evalJs(`(() => { const d = window.__pdefe.aktif().notlar.duzenleyici; return d ? d.el.textContent : null; })()`);
    sonuc('Düzenlenirken sağ tık: Kaydet etkin', menuMetni(menu)?.at(-1) === 'Kaydet', { menu: menuMetni(menu), duzenleyici: duzenleyiciSonra, degistiOnce: acik.degisti });
    await ss('02-yazi-duzenlenirken');
    await mesajKutulari();
    await sagTikMenu(ic[0], ic[1], 'kaydet');
    await kosul(`(() => { const b = window.__pdefe.aktif(); return b && !b.notlar.duzenleyici && !b.degisti && !b.kaydediliyor; })()`, 8000);
    const d2 = await belgeDurumu('sayfa.pdf');
    const notlar2 = dosyaNotlari(yol);
    sonuc('Kaydet seçilince yazı not olarak kaydedildi, düzenleme bitti', d2 && !d2.degisti && notlar2.some((n) => n.tur === 'FreeText' && n.metin === 'Sağ tık yazısı'), { d2, notlar2 });
    sonuc('Önceki not da dosyada', notlar2.some((n) => n.metin === 'sağ tık notu'), notlar2);
    const kutular2 = await mesajKutulari();
    sonuc('Soru sorulmadı', kutular2.length === 0, kutular2.map((k) => k.secenek?.mesaj));
    await evalJs(`(window.__pdefe.aktif().notlar.aracSec(null), true)`);
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 3) Sekmede sağ tık › Kaydet
  if (bolum(3)) {
    console.log('\n== 3) Sekmede sağ tık › Kaydet');
    const a = path.join(PDF, 'a.pdf'), b = path.join(PDF, 'b.pdf');
    uret(a, 2, 'Sekme A'); uret(b, 2, 'Sekme B');
    await ac(a); await ac(b);
    const bOnce = fs.statSync(b).mtimeMs, aOnce = fs.statSync(a).mtimeMs;
    let menu = await sekmeSagTik('a.pdf');
    let m = menuMetni(menu);
    sonuc('Sekme menüsünde Kaydet, Sağdakileri kapat\'tan sonra ayraçlar arasında',
      J(m) === J(['Kapat', 'Diğerlerini kapat', 'Sağdakileri kapat', '-', 'Kaydet (devre dışı)', '-', 'Pencereye ayır', '-', 'Klasörde göster', 'Yolu kopyala', 'PDF\'i kopyala']), m);

    sonuc('Etkin olmayan a.pdf\'e not eklendi', await notEkle('a.pdf', 'sekme notu'));
    let da = await belgeDurumu('a.pdf'), db = await belgeDurumu('b.pdf');
    sonuc('Etkin sekme b.pdf, a.pdf kaydedilmemiş', db.aktif && da.degisti && da.sekmeDegisti && !db.degisti, { da, db });
    menu = await sekmeSagTik('a.pdf');
    sonuc('Kaydedilmemiş a.pdf\'in sekmesinde Kaydet etkin', menuMetni(menu)?.includes('Kaydet'), menuMetni(menu));
    menu = await sekmeSagTik('b.pdf');
    sonuc('Değişikliksiz b.pdf\'in sekmesinde Kaydet devre dışı', menuMetni(menu)?.includes('Kaydet (devre dışı)'), menuMetni(menu));
    await mesajKutulari();
    await sekmeSagTik('a.pdf', 'kaydet');
    await kosul(`(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.ad === 'a.pdf'); return b && !b.degisti && !b.kaydediliyor; })()`, 8000);
    da = await belgeDurumu('a.pdf'); db = await belgeDurumu('b.pdf');
    const notlarA = dosyaNotlari(a), notlarB = dosyaNotlari(b);
    sonuc('a.pdf kaydedildi (sekmesi kaydedilmiş gösteriyor), dosyasında not var', !da.degisti && !da.sekmeDegisti && notlarA.some((n) => n.metin === 'sekme notu') && fs.statSync(a).mtimeMs > aOnce, { da, notlarA });
    sonuc('Etkin sekme değişmedi (b.pdf), b.pdf\'e dokunulmadı', db.aktif && !db.degisti && notlarB.length === 0 && fs.statSync(b).mtimeMs === bOnce, { db, notlarB });
    const kutular = await mesajKutulari();
    sonuc('Soru sorulmadı', kutular.length === 0, kutular.map((k) => k.secenek?.mesaj));
    menu = await sekmeSagTik('a.pdf');
    sonuc('Kayıttan sonra a.pdf\'in sekmesinde Kaydet devre dışı', menuMetni(menu)?.includes('Kaydet (devre dışı)'), menuMetni(menu));

    // Kaydı süren belgede devre dışı
    await notEkle('b.pdf', 'ikinci not');
    await evalJs(`([...window.__pdefe.belgeler.values()].find((x) => x.ad === 'b.pdf').kaydediliyor = true, true)`);
    menu = await sekmeSagTik('b.pdf');
    const sayfaMenu = await sagTikMenu(...(await sayfaNoktasi(300, 200)));
    await evalJs(`([...window.__pdefe.belgeler.values()].find((x) => x.ad === 'b.pdf').kaydediliyor = false, true)`);
    sonuc('Kaydı süren belgede Kaydet devre dışı (sekmede ve sayfada)', menuMetni(menu)?.includes('Kaydet (devre dışı)') && menuMetni(sayfaMenu)?.at(-1) === 'Kaydet (devre dışı)', { sekme: menuMetni(menu), sayfa: menuMetni(sayfaMenu) });
    menu = await sekmeSagTik('b.pdf');
    sonuc('Kayıt bitince yeniden etkin', menuMetni(menu)?.includes('Kaydet'), menuMetni(menu));

    // Açılış sekmesi (dosyası yok)
    await evalJs(`(window.__pdefe.komutCalistir('sekme.yeni'), true)`); await bekle(300);
    menu = await sekmeSagTik('Yeni sekme');
    sonuc('Açılış sekmesinde Kaydet devre dışı', menuMetni(menu)?.includes('Kaydet (devre dışı)'), menuMetni(menu));
    await ss('03-sekmeler');
    await sekmeleriKapat();
  }

  const hatalar = await evalJs(`window.__hatalar || []`);
  sonuc('Sayfada hata yok', hatalar.length === 0, hatalar);
  console.log(`\n${hataSayisi ? 'HATA: ' + hataSayisi : 'Hepsi geçti'}`);
}
