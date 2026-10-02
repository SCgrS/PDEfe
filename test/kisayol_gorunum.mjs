// Kısayol sınaması (0.1.13): F1 Kısayollar penceresindeki "Gezinme", "Görünüm" ve "Yazı kutusu" bölümlerinin her kısayolu gerçek tuşla /
// fareyle denenir. Sayfada işlenen tuşlar CDP tuş olayıyla gönderilir (tus / tusHam; Türkçe Q düzeni tusHam ile birebir: + Shift+4,
// = Shift+0, − tuşu code 'Equal', Ctrl+I 'ı'); menü hızlandırıcıları ve gerçek girdi yolu tarayıcı sürecinden gönderilir (test:tusGonder,
// Electron sendInputEvent: sayfanın işlemediği tuş menüye ulaşır). Not: görünmeyen masaüstündeki ETKİN pencerede sayfanın işlemediği CDP
// rawKeyDown da menü hızlandırıcısına ulaşır (F4, Ctrl+G, Ctrl+H, Ctrl+0 CDP ile de çalışır; ekran dışındaki etkin olmayan örnekte ulaşmaz).
// Yakınlaştırma, gerçek boyut ve döndürme tuşlarının (döndürme yalnızca Ctrl+R / Ctrl+Shift+R; Shift'li − yakınlaştırmadır) her iki yoldan da TEK adım çalıştığı (menü hızlandırıcısı ile sayfa işleyicisinin
// birlikte tetiklenmediği) ölçülür. F1 penceresindeki bu üç bölümde testte karşılığı olmayan yeni bir satır belirirse o da HATA olarak
// yazılır (liste ile test ayrışmasın). Uç durumlar: iki sayfa düzeninde ← → / PageDown çift çift, sayfa kutusuna sınır dışı / geçersiz
// değer, yazı kutusu düzenlenirken yakınlaştırma tuşları, biçim çubuğundaki boyut kutusundan Esc.
// Kullanım (menü kısayolları yalnızca görünmeyen masaüstündeki örnekte sınanabilir; test:odakla pencereyi orada etkinleştirir):
//   powershell -NoProfile -ExecutionPolicy Bypass -File test\baslat_gizli.ps1 -Port 9412 -Veri "%TEMP%\pdefe-kg-9412"
//   $env:PDEFE_CDP_PORT=9412; node test\surucu.mjs betik test\kisayol_gorunum.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Belge: .venv'deki PyMuPDF ile test/cikti/kg/<zaman>/pdf altına 15 sayfalık deneme PDF'i üretilir (test/pdf'e ve başka dosyaya yazılmaz).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 'kg', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PDF = path.join(K, 'pdf'), PNG = path.join(K, 'png');
const BELGE = path.join(PDF, 'kisayol.pdf');
const SAYFA = 15;
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, denetimSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetimSayisi++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const yakin = (a, b, pay = 1.5) => Math.abs(a - b) <= pay;

// Deneme belgesi: 15 dikey A4 sayfa, her sayfada iri "Sayfa N" ve metin satırları (Yazı aracı sağ üstteki boş yere kutu koyar)
const URET = `
import sys, pymupdf
d = pymupdf.open()
for i in range(1, ${SAYFA} + 1):
    p = d.new_page(width=595, height=842)
    p.insert_text((72, 120), 'Sayfa %d' % i, fontsize=48)
    for s in range(20):
        p.insert_text((72, 200 + s * 28), 'Deneme satiri %d - sayfa %d: kisayol sinamasi icin metin.' % (s + 1, i), fontsize=12)
d.save(sys.argv[1])
`;

export default async function ({ evalJs, ekranGoruntusu, bekle, fare, tikla, tus, tusHam, yaz }) {
  const kosul = async (ifade, sure = 5000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  const ss = async (ad) => { await bekle(200); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const merkez = async (sec) => JSON.parse(await evalJs(`(() => { const e = ${sec}; if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`));
  const G = 'window.__pdefe.aktif().gorunum';
  const N = 'window.__pdefe.aktif().notlar';
  /** Görünümün ölçülen durumu: ölçek, mod, düzen, geçerli sayfa, kaydırma ve sınırları, sayfa üstleri, sayfa döndürmeleri. */
  const durum = () => evalJs(`(() => { const g = ${G}, k = g.kaydirici; return { olcek: +g.olcek.toFixed(4), mod: g.zoomModu, duzen: g.duzen, gecerli: g.gecerli,
    st: Math.round(k.scrollTop), sl: Math.round(k.scrollLeft), enAlt: Math.round(k.scrollHeight - k.clientHeight), enSag: Math.round(k.scrollWidth - k.clientWidth), ch: k.clientHeight, cw: k.clientWidth,
    ust: g.yerlesim.map((y) => (y ? Math.round(y.y) : null)), alt: g.yerlesim.map((y) => (y ? Math.round(y.y + y.h) : null)), sol: g.yerlesim.map((y) => (y ? Math.round(y.x) : null)), don: g.sayfalar.map((s) => s.dondurme), degisti: window.__pdefe.aktif().degisti }; })()`);
  /** Tarayıcı sürecinin girdi yolundan tuş (menü hızlandırıcısına da ulaşır). keyCode Electron adı, modifiers 'control' | 'shift' | 'alt'. */
  const tusG = async (keyCode, modifiers = [], sonra = 350) => {
    await evalJs(`window.pdefe.cagir('test:tusGonder', ${J([{ type: 'keyDown', keyCode, modifiers }, { type: 'keyUp', keyCode, modifiers }])})`);
    await bekle(sonra);
  };
  const git = async (no, sonra = 350) => { await evalJs(`(() => { ${G}.sayfayaGit(${no}); ${G}.kaydirici.focus({ preventScroll: true }); return true; })()`); await bekle(sonra); };
  const olcekAyarla = async (o, sonra = 300) => { await evalJs(`(() => { ${G}.zoomAyarla(${o}); return true; })()`); await bekle(sonra); };
  const sigdir = async (mod = 'genislik') => { await evalJs(`(async () => { await window.__pdefe.komutCalistir('gorunum.zoom', ${J(mod)}); return true; })()`); await bekle(500); };
  const duzenYap = async (hedef) => {   // 'surekli' | 'tek' (kaydırma aç/kapat komutuyla, menüdeki gibi)
    for (let i = 0; i < 2 && (await evalJs(`${G}.duzen`)) !== hedef; i++) { await evalJs(`(() => { window.__pdefe.komutCalistir('gorunum.kaydirma'); return true; })()`); await bekle(500); }
    return (await evalJs(`${G}.duzen`)) === hedef;
  };
  const kutu = () => evalJs(`(() => { const k = [...document.querySelectorAll('.mesaj-kutusu')].at(-1); return k ? { ileti: k.querySelector('.mesaj-ileti')?.textContent, dugmeler: [...k.querySelectorAll('.dugmeler button')].map((b) => b.textContent) } : null; })()`);
  const kutuDugmesi = async (metin) => { const m = await merkez(`[...[...document.querySelectorAll('.mesaj-kutusu')].at(-1)?.querySelectorAll('.dugmeler button') || []].find((b) => b.textContent === ${J(metin)})`); if (!m) throw new Error('Düğme yok: ' + metin); await tikla(...m); await bekle(400); };
  const donBekle = (sayfa, aci) => kosul(`${G}.sayfalar[${sayfa - 1}]?.dondurme === ${aci}`, 4000);
  const hepsiniKapat = () => evalJs(`(async () => { document.querySelectorAll('.arac-ortusu, .diyalog-ortusu').forEach((e) => e.remove()); for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  const odakla = async () => { const o = await evalJs(`window.pdefe.cagir('test:odakla')`); await bekle(200); return o; };

  // ---------------------------------------------------------------- hazırlık
  for (const k of [PDF, PNG]) fs.mkdirSync(k, { recursive: true });
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), ['-c', URET, BELGE], { stdio: 'pipe' });
  if (!fs.existsSync(BELGE)) throw new Error('Deneme PDF\'i üretilemedi: ' + BELGE);
  await tus('Escape');
  await hepsiniKapat();
  await evalJs(`(() => { window.__kgHatalar = []; addEventListener('error', (e) => window.__kgHatalar.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__kgHatalar.push(String(e.reason?.message || e.reason))); return true; })()`);
  // Aynı veri klasörüyle yeniden çalıştırmada da aynı başlangıç: sol panel kapalı, düzen kaydırmalı
  await evalJs(`(async () => { const a = window.__pdefe.ayar(); for (const [k, v] of [['solPanelAcik', false]]) { a[k] = v; await window.pdefe.cagir('ayar:koy', k, v); } if (window.__pdefe.panel.acik) window.__pdefe.panel.acKapa(false); return true; })()`);
  await evalJs(`window.__pdefe.dosyaAc(${J(BELGE)}).then(() => new Promise((r) => setTimeout(() => r(true), 1500)))`);
  sonuc(`Deneme belgesi açıldı (${SAYFA} sayfa)`, (await evalJs(`${G}.sayfaSayisi`)) === SAYFA);
  if (!(await duzenYap('surekli'))) sonuc('Başlangıç düzeni kaydırmalı tek sayfa', false, await evalJs(`${G}.duzen`));
  await sigdir('genislik');
  const odak = await odakla();
  if (!sonuc('Görünmeyen masaüstündeki örnek etkin pencere (test:odakla) — menü kısayolları sınanabilir', odak?.odak === true && odak?.gizliMasaustu === true, odak)) {
    console.log('Menü kısayolları sınanamaz: örnek test\\baslat_gizli.ps1 ile başlatılmalı.');
  }

  // ---------------------------------------------------------------- F1: bu üç bölümün satırları testteki listeyle aynı mı
  const SINANAN = {
    Gezinme: ['Ctrl+G', '← →', 'PageUp / PageDown', '↑ ↓', 'Boşluk / Shift+Boşluk', 'Home / End', 'Ctrl+Home / End', 'Shift+Fare tekerleği'],
    'Görünüm': ['Ctrl+Fare tekerleği | Ctrl++ / Ctrl+−', 'Ctrl+0', 'Ctrl+R / Ctrl+Shift+R', 'F4', 'Ctrl+H', 'F11'],
    'Yazı kutusu': ['Ctrl+B / I / U', 'Esc'],
  };
  await tusG('F1', [], 500);
  const f1 = await evalJs(`(() => { const o = [...document.querySelectorAll('.diyalog-ortusu')].at(-1); if (!o) return null; const b = {}; let ad = null;
    for (const tr of o.querySelectorAll('table.kisayollar tr')) { if (tr.classList.contains('bolum')) { ad = tr.textContent.trim(); b[ad] = []; continue; } if (ad) b[ad].push([...tr.cells[0].querySelectorAll('kbd')].map((k) => k.textContent).join(' | ')); }
    return { baslik: o.querySelector('h2, .baslik, .diyalog-baslik')?.textContent?.trim() || '', bolumler: b }; })()`);
  sonuc('F1 Kısayollar penceresini açar', f1?.baslik === 'Kısayollar', f1);
  for (const [bolum, liste] of Object.entries(SINANAN)) {
    const f1Liste = f1?.bolumler?.[bolum] || [];
    const eksikTest = f1Liste.filter((x) => !liste.includes(x)), eksikF1 = liste.filter((x) => !f1Liste.includes(x));
    sonuc(`F1 "${bolum}" bölümündeki her satır testte sınanıyor`, eksikTest.length === 0 && eksikF1.length === 0, { testteYok: eksikTest, f1deYok: eksikF1 });
  }
  await ss('f1-kisayollar');
  await tus('Escape'); await bekle(300);
  sonuc('F1 penceresi Esc ile kapanır', !(await evalJs(`!!document.querySelector('.diyalog-ortusu')`)));

  // ================================================================ GEZİNME
  // ---------------------------------------------------------------- Ctrl+G
  await git(1);
  await tusG('G', ['control']);
  let s = await evalJs(`(() => { const k = document.querySelector('#sayfa-kutusu'); return { odak: document.activeElement === k, deger: k.value, secili: k.selectionStart === 0 && k.selectionEnd === k.value.length }; })()`);
  sonuc('Ctrl+G: sayfa kutusu odak alır, içeriği seçili', s.odak && s.deger === '1' && s.secili, s);
  await tus('7'); await tus('Enter'); await bekle(500);
  let d = await durum();
  let odakKaydirici = await evalJs(`document.activeElement === ${G}.kaydirici`);
  sonuc('Ctrl+G, 7, Enter: 7. sayfaya gider, odak belgeye döner', d.gecerli === 7 && yakin(d.st, Math.max(0, d.ust[6] - 8), 2) && odakKaydirici, { gecerli: d.gecerli, st: d.st, ust7: d.ust[6], odakKaydirici });
  await tusG('G', ['control']); await tus('1'); await tus('2'); await tus('Enter'); await bekle(500);
  d = await durum();
  sonuc('Ctrl+G, 12, Enter: iki basamaklı sayfaya gider', d.gecerli === 12 && yakin(d.st, Math.max(0, d.ust[11] - 8), 2), { gecerli: d.gecerli, st: d.st });
  await tusG('G', ['control']); await tus('3'); await tus('Escape'); await bekle(400);
  s = await evalJs(`({ deger: document.querySelector('#sayfa-kutusu').value, gecerli: ${G}.gecerli, odakKutu: document.activeElement?.id === 'sayfa-kutusu' })`);
  sonuc('Ctrl+G, 3, Esc: gidilmez, kutu geçerli sayfayı gösterir, odak kutudan çıkar', s.gecerli === 12 && s.deger === '12' && !s.odakKutu, s);
  await tusG('G', ['control']); await tus('9'); await tus('9'); await tus('Enter'); await bekle(500);
  s = await evalJs(`({ deger: document.querySelector('#sayfa-kutusu').value, gecerli: ${G}.gecerli })`);
  sonuc(`Ctrl+G, 99, Enter (sayfa sayısından büyük): son sayfaya (${SAYFA}) gider, kutu ${SAYFA} gösterir`, s.gecerli === SAYFA && s.deger === String(SAYFA), s);
  await git(4);
  await tusG('G', ['control']); await yaz('ab'); await tus('Enter'); await bekle(500);
  s = await evalJs(`({ deger: document.querySelector('#sayfa-kutusu').value, gecerli: ${G}.gecerli, odakKutu: document.activeElement?.id === 'sayfa-kutusu' })`);
  sonuc('Ctrl+G, "ab", Enter (geçersiz): gidilmez, kutu geçerli sayfayı gösterir', s.gecerli === 4 && s.deger === '4' && !s.odakKutu, s);

  // ---------------------------------------------------------------- ← → (sığdırılmış: sayfa çevirir)
  await sigdir('genislik'); await git(1);
  await tus('ArrowRight'); await bekle(300);
  d = await durum();
  sonuc('→ (genişliğe sığdır): sonraki sayfa (2), sayfanın üstüne kayar', d.gecerli === 2 && yakin(d.st, d.ust[1] - 8, 2), { gecerli: d.gecerli, st: d.st, ust2: d.ust[1] });
  await tus('ArrowRight'); await bekle(300);
  await tus('ArrowLeft'); await bekle(300);
  sonuc('→ → ←: 2 → 3 → 2', (await durum()).gecerli === 2);
  await tusG('Right');
  sonuc('→ (gerçek girdi yolu): tek adım (2 → 3)', (await durum()).gecerli === 3);
  await tusG('Left');
  sonuc('← (gerçek girdi yolu): tek adım (3 → 2)', (await durum()).gecerli === 2);

  // ---------------------------------------------------------------- ← → (elle yakınlaştırılmış: önce yana kaydırır)
  await olcekAyarla(2); await git(5);
  await evalJs(`(() => { ${G}.kaydirici.scrollLeft = 0; return true; })()`); await bekle(200);
  d = await durum();
  const elleBas = { gecerli: d.gecerli, sl: d.sl, enSag: d.enSag, mod: d.mod };
  await tus('ArrowRight'); await bekle(200);
  d = await durum();
  sonuc('→ (%200, sayfa pencereden geniş): sayfa çevrilmez, 48 px sağa kayar', elleBas.mod === 'serbest' && elleBas.enSag > 100 && d.gecerli === 5 && d.sl === 48, { elleBas, gecerli: d.gecerli, sl: d.sl });
  let basis = 1, cevrildi = false, sonSl = d.sl;
  for (; basis < 60; basis++) {
    await tus('ArrowRight'); await bekle(120);
    d = await durum();
    if (d.gecerli !== 5) { cevrildi = true; break; }
    sonSl = d.sl;
  }
  sonuc('→ (%200): sağ kenar görününce sonraki sayfaya (6) geçer', cevrildi && d.gecerli === 6 && sonSl >= d.enSag - 1, { basis, gecerli: d.gecerli, sonSl, enSag: d.enSag });
  sonuc('→ (%200): yeni sayfa sol kenarından başlar', yakin(d.sl, Math.max(0, d.sol[5] - 16), 1), { sl: d.sl, sol6: d.sol[5] });
  await tus('ArrowLeft'); await bekle(200);
  d = await durum();
  sonuc('← (%200, sol kenarda): önceki sayfaya (5) geçer, sağ kenarından başlar', d.gecerli === 5 && d.sl >= d.enSag - 1, { gecerli: d.gecerli, sl: d.sl, enSag: d.enSag });
  await tus('ArrowLeft'); await bekle(200);
  const d2 = await durum();
  sonuc('← (%200): sayfa çevrilmez, 48 px sola kayar', d2.gecerli === 5 && d2.sl === d.sl - 48, { gecerli: d2.gecerli, once: d.sl, sonra: d2.sl });
  await tusG('Left', [], 250);
  const d3 = await durum();
  sonuc('← (%200, gerçek girdi yolu): tek adım 48 px', d3.gecerli === 5 && d3.sl === d2.sl - 48, { once: d2.sl, sonra: d3.sl });

  // ---------------------------------------------------------------- PageUp / PageDown
  await sigdir('genislik'); await git(3);
  await tus('PageDown'); await bekle(300);
  let a1 = (await durum()).gecerli;
  await tus('PageDown'); await bekle(300);
  let a2 = (await durum()).gecerli;
  await tus('PageUp'); await bekle(300);
  let a3 = (await durum()).gecerli;
  sonuc('PageDown / PageUp (kaydırmalı): 3 → 4 → 5 → 4', J([a1, a2, a3]) === J([4, 5, 4]), [a1, a2, a3]);
  await tusG('PageDown');
  a1 = (await durum()).gecerli;
  await tusG('PageUp');
  a2 = (await durum()).gecerli;
  sonuc('PageDown / PageUp (gerçek girdi yolu): tek adım 4 → 5 → 4', a1 === 5 && a2 === 4, [a1, a2]);

  // İki sayfa düzeninde (kaydırmalı) ← → ve PageUp / PageDown çift çift çevirir
  await evalJs(`(() => { window.__pdefe.komutCalistir('gorunum.duzen', 'iki'); return true; })()`); await bekle(700);
  await git(3);
  const ciftler = await evalJs(`${G}.ciftler().map((c) => c.map((i) => i + 1))`);
  const ciftBas = (no) => { const k = ciftler.findIndex((c) => c.includes(no)); return { ileri: ciftler[k + 1]?.[0], geri: ciftler[k - 1]?.[0] }; };
  const ikiBas = await durum();
  const beklenen = ciftBas(ikiBas.gecerli);
  await tus('ArrowRight'); await bekle(300);
  a1 = (await durum()).gecerli;
  await tus('ArrowLeft'); await bekle(300);
  a2 = (await durum()).gecerli;
  await tus('PageDown'); await bekle(300);
  a3 = (await durum()).gecerli;
  sonuc('İki sayfa düzeni: → / ← / PageDown bir çift ileri / geri', ikiBas.duzen === 'ikiSurekli' && a1 === beklenen.ileri && a2 === ikiBas.gecerli && a3 === beklenen.ileri,
    { duzen: ikiBas.duzen, bas: ikiBas.gecerli, ciftler: ciftler.slice(0, 4), sag: a1, sol: a2, pgdn: a3 });
  await evalJs(`(() => { window.__pdefe.komutCalistir('gorunum.duzen', 'tek'); return true; })()`); await bekle(700);
  sonuc('Tek sayfa düzenine dönüş (kaydırmalı, genişliğe sığdır)', (await durum()).duzen === 'surekli');
  await sigdir('genislik');

  sonuc('Kaydırmayı kapat: tek sayfa düzeni (kaydırmasız)', await duzenYap('tek'));
  await git(3); await evalJs(`(() => { ${G}.kaydirici.scrollTop = 0; return true; })()`); await bekle(300);
  d = await durum();
  const tekBas = { st: d.st, enAlt: d.enAlt, ch: d.ch };
  await tus('PageDown'); await bekle(250);
  d = await durum();
  sonuc('PageDown (kaydırmasız, sayfa uzun): sayfa çevrilmez, bir ekran (yükseklik − 40) kayar', tekBas.enAlt > tekBas.ch && d.gecerli === 3 && d.st === Math.min(tekBas.enAlt, tekBas.st + tekBas.ch - 40), { tekBas, gecerli: d.gecerli, st: d.st });
  let pd = 1;
  for (; pd < 10 && d.st < d.enAlt - 1; pd++) { await tus('PageDown'); await bekle(200); d = await durum(); }
  sonuc('PageDown (kaydırmasız): sayfa sonuna dek aynı sayfada kalır', d.gecerli === 3 && d.st >= d.enAlt - 1, { pd, gecerli: d.gecerli, st: d.st });
  await tus('PageDown'); await bekle(300);
  d = await durum();
  sonuc('PageDown (kaydırmasız, sayfa sonunda): sonraki sayfaya geçer, üstünden başlar', d.gecerli === 4 && d.st === 0, { gecerli: d.gecerli, st: d.st });
  await tus('PageUp'); await bekle(300);
  d = await durum();
  sonuc('PageUp (kaydırmasız, sayfa başında): önceki sayfaya geçer, altından başlar', d.gecerli === 3 && d.st >= d.enAlt - 1, { gecerli: d.gecerli, st: d.st, enAlt: d.enAlt });
  await tus('PageUp'); await bekle(250);
  const d4 = await durum();
  sonuc('PageUp (kaydırmasız, sayfa ortasında): bir ekran yukarı kayar', d4.gecerli === 3 && d4.st === Math.max(0, d.st - (d.ch - 40)), { once: d.st, sonra: d4.st });

  // ---------------------------------------------------------------- ↑ ↓
  await evalJs(`(() => { ${G}.kaydirici.scrollTop = 0; return true; })()`); await bekle(250);
  await tus('ArrowDown'); await bekle(200);
  a1 = await durum();
  await tus('ArrowUp'); await bekle(200);
  a2 = await durum();
  sonuc('↓ / ↑ (kaydırmasız): 48 px aşağı / yukarı, sayfa aynı', a1.gecerli === 3 && a1.st === 48 && a2.gecerli === 3 && a2.st === 0, { a1: [a1.gecerli, a1.st], a2: [a2.gecerli, a2.st] });
  await evalJs(`(() => { const k = ${G}.kaydirici; k.scrollTop = k.scrollHeight; return true; })()`); await bekle(250);
  await tus('ArrowDown'); await bekle(300);
  d = await durum();
  sonuc('↓ (kaydırmasız, sayfa sonunda): sonraki sayfaya geçer, üstünden başlar', d.gecerli === 4 && d.st === 0, { gecerli: d.gecerli, st: d.st });
  await tus('ArrowUp'); await bekle(300);
  d = await durum();
  sonuc('↑ (kaydırmasız, sayfa başında): önceki sayfaya geçer, altından başlar', d.gecerli === 3 && d.st >= d.enAlt - 1, { gecerli: d.gecerli, st: d.st, enAlt: d.enAlt });

  // Kaydırmasız düzende Home / End de sayfa değiştirir
  await tus('End'); await bekle(300);
  a1 = (await durum()).gecerli;
  await tus('Home'); await bekle(300);
  a2 = (await durum()).gecerli;
  sonuc('End / Home (kaydırmasız): son / ilk sayfa', a1 === SAYFA && a2 === 1, [a1, a2]);

  sonuc('Kaydırmayı aç: kaydırmalı düzen', await duzenYap('surekli'));
  await sigdir('genislik'); await git(5);
  const kb = await durum();
  await tus('ArrowDown'); await bekle(200);
  a1 = await durum();
  await tus('ArrowUp'); await bekle(200);
  a2 = await durum();
  sonuc('↓ / ↑ (kaydırmalı): 48 px aşağı / yukarı', a1.st === kb.st + 48 && a2.st === kb.st, { bas: kb.st, asagi: a1.st, yukari: a2.st });
  await tusG('Down', [], 250);
  a3 = await durum();
  sonuc('↓ (gerçek girdi yolu): tek adım 48 px', a3.st === kb.st + 48, { bas: kb.st, sonra: a3.st });

  // ---------------------------------------------------------------- Boşluk / Shift+Boşluk
  await git(5);
  const bb = await durum();
  await tus(' '); await bekle(200);
  a1 = await durum();
  await tus(' ', ['shift']); await bekle(200);
  a2 = await durum();
  sonuc('Boşluk / Shift+Boşluk: bir ekran (yükseklik − 40) aşağı / yukarı', a1.st === bb.st + bb.ch - 40 && a2.st === bb.st, { bas: bb.st, ch: bb.ch, asagi: a1.st, yukari: a2.st });
  await tusG('Space', [], 250);
  a3 = await durum();
  sonuc('Boşluk (gerçek girdi yolu): tek adım bir ekran', a3.st === bb.st + bb.ch - 40, { bas: bb.st, sonra: a3.st });

  // ---------------------------------------------------------------- Home / End, Ctrl+Home / Ctrl+End
  await git(7);
  await tus('End'); await bekle(300);
  d = await durum();
  sonuc(`End: son sayfa (${SAYFA}), sayfanın üstü`, d.gecerli === SAYFA && yakin(d.st, d.ust[SAYFA - 1] - 8, 2) && d.st < d.enAlt - 100, { gecerli: d.gecerli, st: d.st, ust: d.ust[SAYFA - 1], enAlt: d.enAlt });
  await tus('Home'); await bekle(300);
  d = await durum();
  sonuc('Home: ilk sayfa, sayfanın üstü', d.gecerli === 1 && yakin(d.st, Math.max(0, d.ust[0] - 8), 2), { gecerli: d.gecerli, st: d.st });
  await git(7);
  await tus('End', ['ctrl']); await bekle(300);
  d = await durum();
  // Ctrl+End son sayfanın altını KENAR/2 (8 px) payla gösterir (sayfayaGit son: true); kaydırma sınırına 8 px kalır, Ctrl+Home ise 0'a gider
  sonuc('Ctrl+End: belge sonu (son sayfanın alt kenarı görünür, kaydırma sınırında ya da 16 px içinde)', d.gecerli === SAYFA && d.st + d.ch >= d.alt[SAYFA - 1] && d.st >= d.enAlt - 16, { gecerli: d.gecerli, st: d.st, enAlt: d.enAlt, altKenar: d.alt[SAYFA - 1], ch: d.ch });
  await tus('Home', ['ctrl']); await bekle(300);
  d = await durum();
  sonuc('Ctrl+Home: belge başı (kaydırma 0)', d.gecerli === 1 && d.st === 0, { gecerli: d.gecerli, st: d.st });
  await tusG('End', ['control']);
  a1 = await durum();
  await tusG('Home', ['control']);
  a2 = await durum();
  await tusG('End');
  a3 = await durum();
  sonuc('Ctrl+End / Ctrl+Home / End (gerçek girdi yolu)', a1.gecerli === SAYFA && a1.st + a1.ch >= a1.alt[SAYFA - 1] && a1.st >= a1.enAlt - 16 && a2.st === 0 && a2.gecerli === 1 && a3.gecerli === SAYFA && a3.st < a3.enAlt - 100, { ctrlEnd: [a1.gecerli, a1.st], ctrlHome: [a2.gecerli, a2.st], end: [a3.gecerli, a3.st] });

  // ---------------------------------------------------------------- Shift+fare tekerleği (yatay kaydırma)
  await olcekAyarla(2); await git(3);
  await evalJs(`(() => { ${G}.kaydirici.scrollLeft = 0; return true; })()`); await bekle(250);
  const [kx, ky] = await merkez(`${G}.kaydirici`);
  const tb = await durum();
  await fare([{ tur: 'hareket', x: kx, y: ky }, { tur: 'tekerlek', x: kx, y: ky, deltaY: 120, degistiriciler: ['shift'] }]); await bekle(400);
  a1 = await durum();
  await fare([{ tur: 'tekerlek', x: kx, y: ky, deltaY: -120, degistiriciler: ['shift'] }]); await bekle(400);
  a2 = await durum();
  sonuc('Shift+tekerlek (%200, kaydırmalı): sağa / sola yatay kayar, dikey konum ve sayfa aynı', a1.sl > 0 && a1.st === tb.st && a1.gecerli === 3 && a2.sl === 0 && a2.st === tb.st,
    { bas: [tb.sl, tb.st], sag: [a1.sl, a1.st, a1.gecerli], sol: [a2.sl, a2.st] });
  sonuc('Kaydırmayı kapat (Shift+tekerlek kaydırmasız düzende)', await duzenYap('tek'));
  await olcekAyarla(2); await git(3);
  await evalJs(`(() => { const k = ${G}.kaydirici; k.scrollLeft = 0; k.scrollTop = k.scrollHeight; return true; })()`); await bekle(300);
  const tb2 = await durum();
  await fare([{ tur: 'hareket', x: kx, y: ky }, { tur: 'tekerlek', x: kx, y: ky, deltaY: 120, degistiriciler: ['shift'] }]); await bekle(400);
  a1 = await durum();
  sonuc('Shift+tekerlek (%200, kaydırmasız, sayfa sonunda): sayfa çevrilmez, yatay kayar', a1.gecerli === 3 && a1.sl > 0 && a1.st === tb2.st, { bas: [tb2.gecerli, tb2.sl, tb2.st], sonra: [a1.gecerli, a1.sl, a1.st] });
  // Karşılaştırma: aynı yerde Shift'siz tekerlek kaydırmasız düzende sayfayı çevirir (Shift'in yutulmadığını gösterir)
  await evalJs(`(() => { const k = ${G}.kaydirici; k.scrollTop = k.scrollHeight; return true; })()`); await bekle(300);
  await fare([{ tur: 'tekerlek', x: kx, y: ky, deltaY: 120 }]); await bekle(400);
  sonuc('Tekerlek (Shift\'siz, kaydırmasız, sayfa sonunda): sonraki sayfaya geçer', (await durum()).gecerli === 4);
  sonuc('Kaydırmayı aç', await duzenYap('surekli'));

  // ================================================================ GÖRÜNÜM
  // ---------------------------------------------------------------- Ctrl+fare tekerleği
  await sigdir('genislik'); await git(2);
  const zb = await durum();
  const ekran0 = await evalJs(`({ dpr: devicePixelRatio, vv: visualViewport.scale })`);
  await fare([{ tur: 'hareket', x: kx, y: ky }, { tur: 'tekerlek', x: kx, y: ky, deltaY: -120, degistiriciler: ['ctrl'] }]); await bekle(400);
  a1 = await durum();
  await fare([{ tur: 'tekerlek', x: kx, y: ky, deltaY: 120, degistiriciler: ['ctrl'] }]); await bekle(400);
  a2 = await durum();
  const ekran1 = await evalJs(`({ dpr: devicePixelRatio, vv: visualViewport.scale })`);
  sonuc('Ctrl+tekerlek yukarı: yakınlaştırır (×e^0,18), mod serbest', yakin(a1.olcek / zb.olcek, Math.exp(0.18), 0.01) && a1.mod === 'serbest', { once: zb.olcek, sonra: a1.olcek });
  sonuc('Ctrl+tekerlek aşağı: aynı oranda uzaklaştırır', yakin(a2.olcek, zb.olcek, 0.002), { once: zb.olcek, sonra: a2.olcek });
  sonuc('Ctrl+tekerlek pencereyi (sayfa yakınlaştırması) büyütmez', J(ekran0) === J(ekran1) && ekran1.dpr === 1 && ekran1.vv === 1, { ekran0, ekran1 });
  sonuc('Ctrl+tekerlek sayfa çevirmez', a1.gecerli === 2 && a2.gecerli === 2, [a1.gecerli, a2.gecerli]);

  // ---------------------------------------------------------------- Ctrl++ / Ctrl+− (her yol tek adım: 1 → 1,1 ya da 0,9)
  const zoomDenemeleri = [
    ['Ctrl++ (Türkçe Q: Ctrl+Shift+4)', () => tusHam({ key: '+', code: 'Digit4', vk: 0x34, degistiriciler: ['ctrl', 'shift'] }), 1.1],
    ['Ctrl+= (Türkçe Q: Ctrl+Shift+0)', () => tusHam({ key: '=', code: 'Digit0', vk: 0x30, degistiriciler: ['ctrl', 'shift'] }), 1.1],
    ['Ctrl+− (Türkçe Q: − tuşu, code Equal)', () => tusHam({ key: '-', code: 'Equal', vk: 0xBD, degistiriciler: ['ctrl'] }), 0.9],
    ['Ctrl+sayısal +', () => tusHam({ key: '+', code: 'NumpadAdd', vk: 0x6B, degistiriciler: ['ctrl'] }), 1.1],
    ['Ctrl+sayısal −', () => tusHam({ key: '-', code: 'NumpadSubtract', vk: 0x6D, degistiriciler: ['ctrl'] }), 0.9],
    ['Ctrl+= (ABD düzeni, gerçek girdi yolu)', () => tusG('=', ['control'], 0), 1.1],
    ['Ctrl+Plus (ABD Ctrl+Shift+=, gerçek girdi yolu)', () => tusG('Plus', ['control'], 0), 1.1],
    ['Ctrl+- (ABD düzeni, gerçek girdi yolu)', () => tusG('-', ['control'], 0), 0.9],
    ['Ctrl+sayısal + (gerçek girdi yolu)', () => tusG('numadd', ['control'], 0), 1.1],
    ['Ctrl+sayısal − (gerçek girdi yolu)', () => tusG('numsub', ['control'], 0), 0.9],
  ];
  for (const [ad, bas, beklenen] of zoomDenemeleri) {
    await olcekAyarla(1, 250);
    const once = await durum();
    await bas(); await bekle(450);
    const sonra = await durum();
    sonuc(`${ad}: tek adım %100 → %${Math.round(beklenen * 100)}, döndürmez, belge değişmez`,
      sonra.olcek === beklenen && J(sonra.don) === J(once.don) && sonra.degisti === once.degisti, { once: once.olcek, sonra: sonra.olcek, don: sonra.don.filter(Boolean).length, degisti: sonra.degisti });
  }

  // ---------------------------------------------------------------- Ctrl+0 / Ctrl+sayısal 0
  const gercekDenemeleri = [
    ['Ctrl+0 (menü hızlandırıcısı, gerçek girdi yolu)', () => tusG('0', ['control'], 0)],
    ['Ctrl+sayısal 0 (sayfada)', () => tusHam({ key: '0', code: 'Numpad0', vk: 0x60, degistiriciler: ['ctrl'] })],
    ['Ctrl+sayısal 0 (gerçek girdi yolu)', () => tusG('num0', ['control'], 0)],
  ];
  for (const [ad, bas] of gercekDenemeleri) {
    await sigdir('genislik');
    const once = await durum();
    await bas(); await bekle(450);
    const sonra = await durum();
    sonuc(`${ad}: gerçek boyut %100 (genişliğe sığdır %${Math.round(once.olcek * 100)} iken)`, once.olcek !== 1 && sonra.olcek === 1 && sonra.mod === 'serbest', { once: [once.olcek, once.mod], sonra: [sonra.olcek, sonra.mod] });
  }
  await sigdir('genislik');

  // ---------------------------------------------------------------- Ctrl+R / Ctrl+Shift+R (menü)
  // 0.1.27 (kullanıcı isteği): soru yok, yalnızca geçerli sayfa döner; Ayarlar'da "Döndür düğmesi" seçeneği yok (bütün sayfalar ya da
  // bir aralık: Araçlar › Döndür)
  await git(3);
  await tusG('R', ['control'], 500);
  await donBekle(3, 90);
  d = await durum();
  sonuc('Ctrl+R (çok sayfalı belge): soru yok, yalnızca 3. sayfa saat yönünde 90°', !(await kutu()) && J(d.don) === J(d.don.map((_, i) => (i === 2 ? 90 : 0))) && d.degisti, { don: d.don, degisti: d.degisti, kutu: await kutu() });
  await tusG('Z', ['control'], 600);
  sonuc('Ctrl+Z döndürmeyi geri alır', (await durum()).don.every((x) => x === 0), (await durum()).don);

  // Ayarlar › Açılış ve düzen: döndürme seçeneği yok
  await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'acilis')`);
  await kosul(`!!document.querySelector('.ayarlar-ortusu')`);
  const basliklar = await evalJs(`[...document.querySelectorAll('.ayarlar-icerik .ayar-kart .ayar-baslik')].map((e) => e.textContent)`);
  sonuc('Ayarlar › Açılış ve düzen: "Döndür düğmesi" seçeneği yok', basliklar.includes('Kapak sayfasını ayrı göster') && !basliklar.some((t) => /döndür/i.test(t)), basliklar);
  await tus('Escape'); await bekle(300);
  sonuc('Ayarlar Esc ile kapanır', !(await evalJs(`!!document.querySelector('.ayarlar-ortusu')`)));
  await odakla();

  await git(4);
  const oncekiGecmis = await evalJs(`window.__pdefe.aktif().yigin?.geri?.length ?? null`);
  await tusG('R', ['control'], 200);
  await donBekle(4, 90);
  d = await durum();
  sonuc('Ctrl+R: soru yok, yalnızca 4. sayfa saat yönünde 90° (bir kez)', !(await kutu()) && J(d.don) === J(d.don.map((_, i) => (i === 3 ? 90 : 0))), { don: d.don, kutu: await kutu() });
  await tusG('R', ['control', 'shift'], 200);
  await donBekle(4, 0);
  a1 = await durum();
  await tusG('R', ['control', 'shift'], 200);
  await donBekle(4, 270);
  a2 = await durum();
  sonuc('Ctrl+Shift+R: saat yönünün tersine 90° (90 → 0 → 270, bir kez)', a1.don[3] === 0 && a2.don[3] === 270 && a2.don.filter((x, i) => i !== 3).every((x) => x === 0), { a1: a1.don[3], a2: a2.don[3] });
  sonuc('Döndürme sırasında ölçek değişmez', a2.olcek === d.olcek, [d.olcek, a2.olcek]);
  const geriler = [];
  for (let i = 0; i < 3; i++) { await tusG('Z', ['control'], 600); geriler.push((await durum()).don[3]); }
  sonuc('Ctrl+Z üç kez: 270 → 0 → 90 → 0 (her basış bir adım)', J(geriler) === J([0, 90, 0]), { geriler, oncekiGecmis });

  // Shift'li − ve sayısal + / − DÖNDÜRMEZ, yakınlaştırır / uzaklaştırır (0.1.13 inceleme kararı: Türkçe Q'da + için basılı tutulan Shift'le
  // gelen − belgeyi yanlışlıkla döndürüp değiştirirdi; döndürme yalnızca Ctrl+R / Ctrl+Shift+R). NumLock kapalıyken sayısal 0 = Insert:
  // Ctrl+Ins kopyalamadır, gerçek boyuta almaz.
  const shiftDenemeleri = [
    ['Ctrl+Shift+− (Türkçe Q, sayfada)', () => tusHam({ key: '_', code: 'Equal', vk: 0xBD, degistiriciler: ['ctrl', 'shift'] }), 0.9],
    ['Ctrl+Shift+sayısal + (sayfada)', () => tusHam({ key: '+', code: 'NumpadAdd', vk: 0x6B, degistiriciler: ['ctrl', 'shift'] }), 1.1],
    ['Ctrl+Shift+sayısal − (sayfada)', () => tusHam({ key: '-', code: 'NumpadSubtract', vk: 0x6D, degistiriciler: ['ctrl', 'shift'] }), 0.9],
    ['Ctrl+Shift+− (gerçek girdi yolu)', () => tusG('-', ['control', 'shift'], 0), 0.9],
    ['Ctrl+Shift+sayısal + (gerçek girdi yolu)', () => tusG('numadd', ['control', 'shift'], 0), 1.1],
    ['Ctrl+Shift+sayısal − (gerçek girdi yolu)', () => tusG('numsub', ['control', 'shift'], 0), 0.9],
    ['Ctrl+Ins (NumLock kapalı sayısal 0, sayfada)', () => tusHam({ key: 'Insert', code: 'Numpad0', vk: 0x2D, degistiriciler: ['ctrl'] }), 1],
  ];
  for (const [ad, bas, beklenen] of shiftDenemeleri) {
    await git(4);
    await olcekAyarla(1, 250);
    const once = await durum();
    await bas(); await bekle(500);
    const sonra = await durum();
    sonuc(`${ad}: ${beklenen === 1 ? 'ölçek değişmez' : `tek adım %100 → %${Math.round(beklenen * 100)}`}, döndürmez, belge değişmez`,
      sonra.olcek === beklenen && J(sonra.don) === J(once.don) && sonra.degisti === once.degisti, { once: once.olcek, sonra: sonra.olcek, don: sonra.don.filter(Boolean).length, degisti: sonra.degisti });
  }
  await sigdir('genislik');

  // ---------------------------------------------------------------- F4 (sol panel)
  const panelDurumu = () => evalJs(`({ acik: window.__pdefe.panel.acik, gorunur: document.querySelector('#sol-panel').getBoundingClientRect().width > 0, ayar: window.__pdefe.ayar().solPanelAcik })`);
  const p0 = await panelDurumu();
  await tusG('F4', [], 500);
  const p1 = await panelDurumu();
  await tusG('F4', [], 500);
  const p2 = await panelDurumu();
  sonuc('F4: sol panel açılır / kapanır (ayar da yazılır)', !p0.acik && p1.acik && p1.gorunur && p1.ayar === true && !p2.acik && !p2.gorunur && p2.ayar === false, { p0, p1, p2 });
  // Görünmeyen masaüstündeki etkin pencerede sayfanın işlemediği CDP rawKeyDown da menü hızlandırıcısına ulaşır: F4 yine bir kez aç / kapa
  await tus('F4'); await bekle(400);
  const p3 = await panelDurumu();
  await tus('F4'); await bekle(400);
  const p4 = await panelDurumu();
  sonuc('F4 (CDP tuşu, sayfa işlemez → menü): her basış bir kez aç / kapa', p3.acik && !p4.acik, { p3, p4 });

  // ---------------------------------------------------------------- Ctrl+H (okuma modu), Esc
  const okuma = () => evalJs(`({ mod: document.body.classList.contains('okuma-modu'), cubuk: getComputedStyle(document.querySelector('#arac-cubugu')).display, sekme: getComputedStyle(document.querySelector('#sekme-cubugu')).display })`);
  await tusG('H', ['control'], 500);
  const o1 = await okuma();
  sonuc('Ctrl+H: okuma modu açılır (araç ve sekme çubuğu gizli)', o1.mod && o1.cubuk === 'none' && o1.sekme === 'none', o1);
  await ss('okuma-modu');
  await tus('Escape'); await bekle(400);
  sonuc('Esc okuma modunu kapatır', !(await okuma()).mod);
  await tusG('H', ['control'], 400);
  const o2 = await okuma();
  await tusG('H', ['control'], 400);
  const o3 = await okuma();
  sonuc('Ctrl+H iki kez: açılır, kapanır', o2.mod && !o3.mod && o3.cubuk !== 'none', { o2, o3 });
  await tusG('H', ['control'], 400);
  await tusG('Escape', [], 400);
  sonuc('Esc (gerçek girdi yolu) okuma modunu kapatır', !(await okuma()).mod);

  // ---------------------------------------------------------------- F11 (tam ekran)
  const ekran = () => evalJs(`({ tam: document.body.classList.contains('tam-ekran'), iw: innerWidth, ih: innerHeight, sw: screen.width, sh: screen.height })`);
  const e0 = await ekran();
  await tusG('F11', [], 200);
  await kosul(`document.body.classList.contains('tam-ekran') && innerWidth === screen.width`, 4000);
  const e1 = await ekran();
  sonuc('F11: tam ekran (pencere ekranı kaplar)', e1.tam && e1.iw === e1.sw && e1.ih === e1.sh, { e0, e1 });
  await tusG('F11', [], 200);
  await kosul(`!document.body.classList.contains('tam-ekran') && innerWidth === ${e0.iw}`, 4000);
  const e2 = await ekran();
  sonuc('F11 tekrar: tam ekrandan çıkar (eski boyut)', !e2.tam && e2.iw === e0.iw && e2.ih === e0.ih, { e0, e2 });

  // ================================================================ YAZI KUTUSU
  await sigdir('genislik'); await git(1); await bekle(500);
  await tikla(...(await merkez(`document.querySelector('#not-araclari [data-arac="yazi"]')`))); await bekle(300);
  sonuc('Yazı aracı seçildi (araç çubuğu)', (await evalJs(`${N}.arac`)) === 'yazi');
  const nokta = JSON.parse(await evalJs(`(() => { const r = ${G}.sayfalar[0].el.getBoundingClientRect(); return JSON.stringify([r.left + r.width * 0.62, r.top + r.height * 0.05]); })()`));
  await tikla(...nokta);
  const edVar = await kosul(`!!document.querySelector('.yazi-duzenleyici') && document.activeElement === document.querySelector('.yazi-duzenleyici')`, 3000);
  sonuc('Sayfaya tıklama yazı kutusu açar, odak kutuda', !!edVar);
  const METIN = 'Kısayol denemesi ığüşöç';
  await yaz(METIN); await bekle(300);
  const parca = () => evalJs(`(() => { const d = ${N}.duzenleyici; if (!d) return null; return { metin: d.parcalar.map((p) => p.metin).join(''), kalin: d.parcalar.every((p) => p.kalin), italik: d.parcalar.every((p) => p.italik), alti: d.parcalar.every((p) => p.alti),
    hicKalin: d.parcalar.every((p) => !p.kalin), hicItalik: d.parcalar.every((p) => !p.italik), hicAlti: d.parcalar.every((p) => !p.alti), parcaSayisi: d.parcalar.length,
    dugme: ['kalin', 'italik', 'alti'].map((c) => d.bicim.querySelector('button.' + c)?.classList.contains('secili')), secim: ${N}.duzenleyiciSecim() }; })()`);
  let p = await parca();
  sonuc('Yazılan metin kutuda', p?.metin === METIN && p.hicKalin && p.hicItalik && p.hicAlti, p);
  await tus('a', ['ctrl']); await bekle(250);
  p = await parca();
  sonuc('Ctrl+A kutudaki bütün metni seçer', J(p?.secim) === J([0, METIN.length]), p?.secim);
  await tus('b', ['ctrl']); await bekle(250);
  p = await parca();
  sonuc('Ctrl+B: seçili metin kalın, Kalın düğmesi basılı', p.kalin && p.dugme[0] && p.metin === METIN, p);
  await tusHam({ key: 'ı', code: 'KeyI', vk: 0x49, degistiriciler: ['ctrl'] }); await bekle(250);
  p = await parca();
  sonuc('Ctrl+I (Türkçe Q: ı tuşu): italik, düğme basılı, metne "ı" eklenmez', p.italik && p.dugme[1] && p.metin === METIN, p);
  await tus('u', ['ctrl']); await bekle(250);
  p = await parca();
  sonuc('Ctrl+U: altı çizili, düğme basılı', p.alti && p.dugme[2] && p.metin === METIN, p);
  await tus('b', ['ctrl']); await bekle(250);
  p = await parca();
  sonuc('Ctrl+B ikinci kez: kalın kalkar (aç / kapa), öteki biçimler kalır', p.hicKalin && !p.dugme[0] && p.italik && p.alti, p);
  // Gerçek girdi yolu: her basış biçimi bir kez değiştirir (menüde karşılığı yok; çift işlenmez)
  const yol = [];
  for (const [tusAdi, alan] of [['B', 'kalin'], ['I', 'italik'], ['I', 'italik'], ['U', 'alti'], ['U', 'alti']]) {
    await tusG(tusAdi, ['control'], 250);
    const x = await parca();
    yol.push(`${tusAdi}:${x?.[alan] ? 'var' : x?.['hic' + alan[0].toUpperCase() + alan.slice(1)] ? 'yok' : 'karışık'}`);
  }
  sonuc('Ctrl+B / Ctrl+I / Ctrl+U (gerçek girdi yolu): her basış bir kez aç / kapa', J(yol) === J(['B:var', 'I:yok', 'I:var', 'U:yok', 'U:var']), yol);
  p = await parca();
  sonuc('Biçim tuşlarından sonra metin aynı, seçim korunur', p.metin === METIN && J(p.secim) === J([0, METIN.length]), p);
  await ss('yazi-kutusu-bicimli');
  await tus('Escape'); await bekle(500);
  const bitti = await evalJs(`(() => { const n = ${N}; const y = [...n.notlar.values()].filter((x) => x.tur === 'FreeText' && !x.silindi); const s = y.at(-1);
    return { duzenleyici: !!document.querySelector('.yazi-duzenleyici'), sayi: y.length, icerik: s?.icerik, secili: n.secili === s?.id, parcalar: s?.yazi?.parcalar,
      odakBelge: document.activeElement === ${G}.kaydirici, gorunur: !!document.querySelector('.not-oge[data-id="' + s?.id + '"]') && getComputedStyle(document.querySelector('.not-oge[data-id="' + s?.id + '"]')).visibility !== 'hidden',
      degisti: window.__pdefe.aktif().degisti, okuma: document.body.classList.contains('okuma-modu'), id: s?.id }; })()`);
  sonuc('Esc: düzenleme biter, yazılan korunur (yeni Yazı notu), not seçili kalır, odak belgede', !bitti.duzenleyici && bitti.sayi === 1 && bitti.icerik === METIN && bitti.secili && bitti.odakBelge && bitti.gorunur && bitti.degisti, bitti);
  sonuc('Esc sonrası kaydedilen biçim: kalın ve italik ve altı çizili (son durum)', Array.isArray(bitti.parcalar) && bitti.parcalar.length > 0 && bitti.parcalar.every((x) => x.kalin && x.italik && x.alti) && bitti.parcalar.map((x) => x.metin).join('') === METIN, bitti.parcalar);

  // Var olan yazıyı çift tıkla düzenle, sonuna ekle, Esc (gerçek girdi yolu): eklenen korunur; Ctrl+Z bütün düzenlemeyi tek adımda geri alır
  const oge = await merkez(`document.querySelector('.not-oge[data-id="${bitti.id}"]')`);
  await tikla(...oge, { tiklama: 2 });
  const ed2 = await kosul(`!!document.querySelector('.yazi-duzenleyici') && document.activeElement === document.querySelector('.yazi-duzenleyici')`, 3000);
  sonuc('Çift tık var olan yazıyı düzenlemeye açar', !!ed2);
  await tus('End', ['ctrl']); await bekle(150);
  await yaz(' ek'); await bekle(250);
  await tusG('Escape', [], 500);
  const bitti2 = await evalJs(`(() => { const n = ${N}.notlar.get(${J(bitti.id)}); return { duzenleyici: !!document.querySelector('.yazi-duzenleyici'), icerik: n?.icerik, secili: ${N}.secili === n?.id }; })()`);
  sonuc('Esc (gerçek girdi yolu): düzenleme biter, eklenen metin korunur', !bitti2.duzenleyici && bitti2.icerik === METIN + ' ek', bitti2);
  await tusG('Z', ['control'], 500);
  const geri = await evalJs(`${N}.notlar.get(${J(bitti.id)})?.icerik`);
  sonuc('Ctrl+Z: ikinci düzenleme tek adımda geri alınır', geri === METIN, geri);

  // Biçim çubuğundaki boyut kutusundayken Esc: düzenleme uygulanıp biter (yazılan korunur)
  const duzenlemeyeAc = async () => {
    await tikla(...(await merkez(`document.querySelector('.not-oge[data-id="${bitti.id}"]')`)), { tiklama: 2 });
    return kosul(`!!document.querySelector('.yazi-duzenleyici') && document.activeElement === document.querySelector('.yazi-duzenleyici')`, 3000);
  };
  await duzenlemeyeAc();
  await tus('End', ['ctrl']); await bekle(150);
  await yaz(' iki'); await bekle(200);
  await tikla(...(await merkez(`document.querySelector('.yazi-bicim input.boyut')`))); await bekle(250);
  const boyutOdak = await evalJs(`!!document.activeElement?.matches?.('.yazi-bicim input.boyut')`);
  await tus('Escape'); await bekle(500);
  const bitti3 = await evalJs(`({ duzenleyici: !!document.querySelector('.yazi-duzenleyici'), icerik: ${N}.notlar.get(${J(bitti.id)})?.icerik })`);
  sonuc('Esc (odak biçim çubuğunun boyut kutusunda): düzenleme biter, yazılan korunur', boyutOdak && !bitti3.duzenleyici && bitti3.icerik === METIN + ' iki', { boyutOdak, ...bitti3 });

  // Yazı kutusu düzenlenirken yakınlaştırma tuşları: Ctrl+0 (menü) çalışıyor; Ctrl++ / Ctrl+− de tek adım çalışmalı, düzenleme açık kalmalı.
  // 0.1.12'de Ctrl+- kayıtlı menü hızlandırıcısıydı (düzenleyici tuşu engellemediğinden çalışırdı); 0.1.13'te tuş sayfada işleniyor, düzenleyicinin
  // keydown'ı stopPropagation yaptığından belge işleyicisine ulaşmıyor.
  await duzenlemeyeAc();
  const edMetin = () => evalJs(`${N}.duzenleyici?.parcalar.map((p) => p.metin).join('') ?? null`);
  const metinOnce = await edMetin();
  const edZoom = [];
  for (const [ad, bas, yon] of [
    ['Ctrl+− (Türkçe Q)', () => tusHam({ key: '-', code: 'Equal', vk: 0xBD, degistiriciler: ['ctrl'] }), -1],
    ['Ctrl++ (Türkçe Q)', () => tusHam({ key: '+', code: 'Digit4', vk: 0x34, degistiriciler: ['ctrl', 'shift'] }), 1],
    ['Ctrl+sayısal +', () => tusHam({ key: '+', code: 'NumpadAdd', vk: 0x6B, degistiriciler: ['ctrl'] }), 1],
    ['Ctrl+= (ABD, gerçek girdi yolu)', () => tusG('=', ['control'], 0), 1],
    ['Ctrl+0 (menü, gerçek girdi yolu)', () => tusG('0', ['control'], 0), 0],
  ]) {
    await evalJs(`(() => { ${G}.zoomAyarla(1.25); return true; })()`); await bekle(300);
    await evalJs(`${N}.duzenleyiciOdakla?.() ?? true`); await bekle(100);
    await bas(); await bekle(450);
    const o = await evalJs(`({ olcek: ${G}.olcek, acik: !!${N}.duzenleyici })`);
    const hedef = yon > 0 ? 1.5 : yon < 0 ? 1.1 : 1;
    edZoom.push({ ad, olcek: o.olcek, hedef, acik: o.acik, metin: (await edMetin()) === metinOnce });
  }
  for (const z of edZoom) sonuc(`Yazı kutusu düzenlenirken ${z.ad}: tek adım (%125 → %${Math.round(z.hedef * 100)}), düzenleme açık kalır, metin aynı`, z.olcek === z.hedef && z.acik && z.metin, z);
  await tus('Escape'); await bekle(400);
  sonuc('Esc: düzenleme biter (yakınlaştırmadan sonra), metin korunur', !(await evalJs(`!!document.querySelector('.yazi-duzenleyici')`)) && (await evalJs(`${N}.notlar.get(${J(bitti.id)})?.icerik`)) === METIN + ' iki');

  // ---------------------------------------------------------------- son
  const hatalar = await evalJs(`JSON.stringify(window.__kgHatalar || [])`);
  sonuc('Konsolda yakalanmamış hata yok', hatalar === '[]', hatalar);
  await hepsiniKapat();
  console.log(`\n${denetimSayisi} denetim, ${denetimSayisi - hataSayisi} geçti` + (hataSayisi ? `, ${hataSayisi} HATA` : ' — hepsi geçti'));
  process.exitCode = hataSayisi ? 1 : 0;
}
