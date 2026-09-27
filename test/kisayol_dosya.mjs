// Kısayol testi (0.1.13): F1 Kısayollar penceresindeki "Dosya ve sekmeler" ve "Düzen" bölümlerindeki her kısayol ile "Genel"deki F1 / Esc
// gerçek tuşla sınanır. Menü hızlandırıcısı olanlar (Ctrl+O, Ctrl+T, Ctrl+S, Ctrl+Shift+S, Ctrl+P, Ctrl+W, Ctrl+F, F3 / Shift+F3, Ctrl+,,
// F1) test:tusGonder ile (Electron sendInputEvent: tarayıcı sürecinin girdi yolu, menüye de ulaşır); sayfada işlenenler (Ctrl+PageUp /
// PageDown, Ctrl+← / →, Ctrl+Tab / Ctrl+Shift+Tab ve seçici, Ctrl+1–9, Ctrl+Z / Ctrl+Y, Ctrl+A, Delete, Esc) hem CDP tuşuyla (tus /
// tusHam) hem test:tusGonder ile. Ayrıca: sayfa kutusundayken Ctrl+← / → sekme değiştirmez (Ctrl+PageUp / PageDown değiştirir), sekme
// geçişinde hiçbir belgenin sayfası değişmez, açılış sekmesinde (Ctrl+T) de geçiş çalışır, F3 girdideyken ve belgedeyken tek adım gider,
// Ctrl+Tab seçicisinde ← → gezinir / Esc vazgeçer, Ctrl basılıyken Shift+Tab geriye doğru gezinir; açık pencerenin (Kısayollar, Ayarlar,
// Yazdır) arkasındaki sekme / belge sekme ve düzen kısayollarıyla değişmez, sonra Esc pencereyi kapatır.
// Kullanım (görünmeyen masaüstündeki örnek gerekir; ekran dışı örnekte menü hızlandırıcısı çalışmaz):
//   powershell -NoProfile -ExecutionPolicy Bypass -File test\baslat_gizli.ps1 -Port 9411 -Veri "$env:TEMP\pdefe-kd-9411"
//   $env:PDEFE_CDP_PORT=9411; node test\surucu.mjs betik test\kisayol_dosya.mjs
//   powershell -NoProfile -File test\durdur.ps1 -SurecId <PID>
// Belgeler test/pdf'ten test/cikti/kd/<zaman>/pdf'e kopyalanır (asıllarına yazılmaz); aynı örnekte yeniden çalıştırılabilir.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 'kd', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PDF = path.join(K, 'pdf'), PNG = path.join(K, 'png');
const PYTHON = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${!ok && ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, tus, tusHam, yaz }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(120); } };
  const ss = async (ad) => { await bekle(200); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const merkez = async (sec) => JSON.parse(await evalJs(`(() => { const e = ${sec}; if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`));

  // ---- tuşlar
  const odakla = () => evalJs(`window.pdefe.cagir('test:odakla')`);
  const G = (olaylar) => evalJs(`window.pdefe.cagir('test:tusGonder', ${J(olaylar)})`);
  /** test:tusGonder ile tek basış (keyDown + keyUp). keyCode Electron adı ('O', 'PageDown', 'Left', ',', 'F3'…). */
  const tusG = async (keyCode, mods = [], sonra = 350) => { await G([{ type: 'keyDown', keyCode, modifiers: mods }, { type: 'keyUp', keyCode, modifiers: mods }]); await bekle(sonra); };
  const tusC = async (ad, deg = [], sonra = 350) => { await tus(ad, deg); await bekle(sonra); };
  // Ctrl+Tab: Ctrl basılı kalır (bırakılınca seçilen sekmeye geçilir)
  const ctrlTabG = (shift = false) => G([{ type: 'keyDown', keyCode: 'Control', modifiers: ['control'] }, { type: 'keyDown', keyCode: 'Tab', modifiers: shift ? ['control', 'shift'] : ['control'] }, { type: 'keyUp', keyCode: 'Tab', modifiers: shift ? ['control', 'shift'] : ['control'] }]);
  const tabYineG = (shift = false) => G([{ type: 'keyDown', keyCode: 'Tab', modifiers: shift ? ['control', 'shift'] : ['control'] }, { type: 'keyUp', keyCode: 'Tab', modifiers: shift ? ['control', 'shift'] : ['control'] }]);
  const ctrlBirakG = () => G([{ type: 'keyUp', keyCode: 'Control' }]);
  const ctrlTabC = (shift = false) => tus('Tab', shift ? ['ctrl', 'shift'] : ['ctrl']);
  const ctrlBirakC = () => tusHam({ key: 'Control', code: 'ControlLeft', vk: 17 });
  // Yöntemler: her sayfa kısayolu iki yoldan
  const YOL = {
    CDP: { ad: 'CDP', bas: (k, deg, sonra) => tusC({ Left: 'ArrowLeft', Right: 'ArrowRight' }[k] || k, deg.map((d) => ({ control: 'ctrl' }[d] || d)), sonra), ctrlTab: ctrlTabC, tabYine: (s) => ctrlTabC(s), birak: ctrlBirakC },
    G: { ad: 'tusGonder', bas: (k, deg, sonra) => tusG(k.length === 1 ? k.toUpperCase() : k, deg, sonra), ctrlTab: ctrlTabG, tabYine: tabYineG, birak: ctrlBirakG },
  };

  // ---- durum
  const durumAl = () => evalJs(`(() => { const p = window.__pdefe, s = p.sekmeler; const a = s.sekmeler.find((x) => x.id === s.aktifId);
    return { sekmeler: s.sekmeler.map((x) => x.ad), aktif: a ? a.ad : null, aktifIdx: s.sekmeler.findIndex((x) => x.id === s.aktifId),
      baslangic: !document.querySelector('#baslangic').hidden, cubuk: !document.querySelector('#sekme-cubugu').hidden, belge: p.aktif()?.ad ?? null }; })()`);
  const aktifAd = async () => (await durumAl()).aktif;
  const sayfalar = () => evalJs(`Object.fromEntries([...window.__pdefe.belgeler.values()].map((b) => [b.ad, b.gorunum.gecerli]))`);
  const sec = async (ad) => { await evalJs(`(async () => { const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === ${J(ad)}); if (!s) throw new Error('sekme yok: ${ad}'); await window.__pdefe.sekmeSec(s.id); return true; })()`); await bekle(250); };
  const ac = async (ad) => { await evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ad))})`); await kosul(`[...window.__pdefe.belgeler.values()].some((b) => b.ad === ${J(ad)} && b.gorunum.sayfaSayisi > 0)`); await bekle(300); };
  const kapat = (ad) => evalJs(`(async () => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.ad === ${J(ad)}); if (b) await window.__pdefe.belgeKapat(b.id, { zorla: true }); return true; })()`);
  const sayfayaGit = async (ad, n) => { await sec(ad); await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(${n})`); await kosul(`window.__pdefe.aktif().gorunum.gecerli === ${n}`, 5000); await bekle(200); };
  const hepsiniKapat = () => evalJs(`(async () => { document.querySelectorAll('.arac-ortusu, .diyalog-ortusu').forEach((e) => e.remove()); for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); for (const s of [...window.__pdefe.sekmeler.sekmeler]) window.__pdefe.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: s.id } })); return true; })()`);
  const kayit = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const yanitla = (kanal, yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', ${J(kanal)}, ${J(yanitlar)})`);
  const odakBelgede = () => evalJs(`(() => { document.activeElement?.blur?.(); window.__pdefe.aktif()?.gorunum.kaydirici.focus(); return document.activeElement?.className || document.activeElement?.tagName; })()`);
  const dondurme = (ad, sayfa) => evalJs(`(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.ad === ${J(ad)}); return b.gorunum.tarif()[${sayfa - 1}].dondurme || 0; })()`);
  const dondur = (ad, sayfa) => evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${J(ad)}); await p.sayfalariDondur(b, [${sayfa}], 90, 'Sayfayı döndür'); await new Promise((r) => setTimeout(r, 250)); return b.degisti; })()`);
  const degisti = (ad) => evalJs(`!![...window.__pdefe.belgeler.values()].find((x) => x.ad === ${J(ad)})?.degisti`);
  const kutu = () => evalJs(`(() => { const k = [...document.querySelectorAll('.mesaj-kutusu')].at(-1); return k ? { ileti: k.querySelector('.mesaj-ileti')?.textContent, dugmeler: [...k.querySelectorAll('.dugmeler button')].map((b) => b.textContent) } : null; })()`);
  const kutuDugmesi = async (metin) => { const m = await merkez(`[...[...document.querySelectorAll('.mesaj-kutusu')].at(-1)?.querySelectorAll('.dugmeler button') || []].find((b) => b.textContent === ${J(metin)})`); if (!m) throw new Error('Düğme yok: ' + metin); await tikla(...m); await bekle(400); };
  const seciciDurumu = () => evalJs(`(() => { const s = window.__pdefe.sekmeler, el = document.querySelector('#sekme-secici'); const ad = [...el.querySelectorAll('.aday')];
    return { acik: s.seciciAcik, gorunur: !el.hidden, idx: s.seciciIdx, adaylar: ad.map((a) => a.querySelector('.ad')?.textContent), secili: ad.findIndex((a) => a.classList.contains('secili')) }; })()`);
  const mruAdlari = () => evalJs(`window.__pdefe.sekmeler.mru.map((id) => window.__pdefe.sekmeler.bul(id)?.ad)`);
  const bulSayac = () => evalJs(`document.querySelector('#bul-sayac').textContent`);

  // ---------------------------------------------------------------- hazırlık
  for (const k of [PDF, PNG]) fs.mkdirSync(k, { recursive: true });
  const kaynak = path.join(KOK, 'test', 'pdf', 'dergipark_3972595_ttk_tbk.pdf');   // 17 sayfa, metinli
  if (!fs.existsSync(kaynak)) throw new Error('Kaynak PDF yok: ' + kaynak);
  const ADLAR = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((x) => x + '.pdf');
  for (const ad of ADLAR) fs.copyFileSync(kaynak, path.join(PDF, ad));
  await hepsiniKapat();
  // Arayüz yeniden yüklenir: aynı örnekte önceki çalıştırmanın durumu (Chromium'un çerçeve geneli geri alma yığınındaki yazmalar, Ctrl+Tab
  // son kullanım sırası, dinleyiciler) bu çalıştırmayı etkilemesin
  await evalJs(`(() => { setTimeout(() => location.reload(), 50); return true; })()`);
  await bekle(1500);
  for (let i = 0; i < 60; i++) { try { if (await evalJs(`document.readyState === 'complete' && typeof window.__pdefe === 'object'`)) break; } catch { /* yeniden yükleniyor */ } await bekle(250); }
  await bekle(500);
  const od = await odakla();
  sonuc('test:odakla pencereyi görünmeyen masaüstünde etkinleştirir (menü hızlandırıcıları için)', od?.odak === true && od?.gizliMasaustu === true, od);
  await evalJs(`(() => { if (!window.__kdHatalar) { window.__kdHatalar = []; addEventListener('error', (e) => window.__kdHatalar.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__kdHatalar.push(String(e.reason?.message || e.reason))); } window.__kdHatalar.length = 0; return true; })()`);
  await evalJs(`window.pdefe.cagir('ayar:koy', 'otomatikKaydet', false).then(() => { window.__pdefe.ayar().otomatikKaydet = false; return true; })`);
  await kayit();

  // ================================================================ 1) belge yokken: Ctrl+T, Ctrl+O
  let d = await durumAl();
  sonuc('Başlangıç: sekme yok, sekme çubuğu gizli, açılış ekranı görünür', !d.sekmeler.length && !d.cubuk && d.baslangic, d);
  await tusG('T', ['control']);
  d = await durumAl();
  sonuc('Ctrl+T belge yokken: sekme açılmaz, çubuk gizli, açılış ekranı görünür', !d.sekmeler.length && !d.cubuk && d.baslangic, d);
  await tusG('O', ['control'], 600);
  let k = await kayit();
  sonuc('Ctrl+O: Aç penceresi (dosya:acDiyalog) açılır; yanıtsız (vazgeç) hiçbir şey açılmaz', k.length === 1 && k[0].kanal === 'dosya:acDiyalog' && (await durumAl()).sekmeler.length === 0, k);
  await yanitla('dosya:acDiyalog', [[path.join(PDF, 'a.pdf')]]);
  await tusG('O', ['control'], 300);
  await kosul(`window.__pdefe.aktif()?.ad === 'a.pdf' && window.__pdefe.aktif().gorunum.sayfaSayisi > 0`);
  k = await kayit(); d = await durumAl();
  sonuc('Ctrl+O + seçilen PDF: belge açılır ve etkin olur', k.length === 1 && k[0].kanal === 'dosya:acDiyalog' && J(d.sekmeler) === J(['a.pdf']) && d.aktif === 'a.pdf' && !d.baslangic, { k, d });

  // ================================================================ 2) sekme geçişi: Ctrl+PageUp / PageDown, Ctrl+← / →
  for (const ad of ['b.pdf', 'c.pdf', 'd.pdf']) await ac(ad);
  const SAYFA = { 'a.pdf': 3, 'b.pdf': 5, 'c.pdf': 7, 'd.pdf': 9 };
  for (const [ad, n] of Object.entries(SAYFA)) await sayfayaGit(ad, n);
  const s0 = await sayfalar();
  sonuc('Hazırlık: dört sekme (a b c d), sayfalar 3 / 5 / 7 / 9', J(s0) === J(SAYFA), s0);
  await ss('dort-sekme');

  const gecisDizisi = async (yol, geri, ileri, etiket) => {
    // d'den başla: ileri (uçta durur), geri × 3 (d→c→b→a), geri (uçta durur), ileri (→b)
    await sec('d.pdf'); await odakBelgede();
    const adimlar = [[ileri, 'd.pdf'], [geri, 'c.pdf'], [geri, 'b.pdf'], [geri, 'a.pdf'], [geri, 'a.pdf'], [ileri, 'b.pdf']];
    const gorulen = [];
    for (const [t] of adimlar) { await yol.bas(t, ['control'], 350); gorulen.push(await aktifAd()); }
    const beklenen = adimlar.map((x) => x[1]);
    sonuc(`${etiket} (${yol.ad}): d'de ileri durur, geri d→c→b→a, a'da durur, ileri →b`, J(gorulen) === J(beklenen), { gorulen, beklenen });
    const s1 = await sayfalar();
    sonuc(`${etiket} (${yol.ad}): hiçbir belgenin sayfası değişmez`, J(s1) === J(SAYFA), s1);
  };
  for (const yol of [YOL.G, YOL.CDP]) {
    await gecisDizisi(yol, 'PageUp', 'PageDown', 'Ctrl+PageUp / Ctrl+PageDown');
    await gecisDizisi(yol, 'Left', 'Right', 'Ctrl+← / Ctrl+→');
  }
  // Menüde yazan hızlandırıcı (Sonraki / Önceki sekme) registerAccelerator:false: tek basış tek adım (çift işleme yok)
  await sec('b.pdf'); await odakBelgede();
  await tusG('PageDown', ['control']);
  sonuc('Ctrl+PageDown (tusGonder) tek basışta tek sekme ilerler (b→c, menüyle çift değil)', (await aktifAd()) === 'c.pdf', await aktifAd());

  // Girdi kutusu: sayfa kutusunda Ctrl+← / → sözcük atlar, sekme değiştirmez; Ctrl+PageUp / PageDown girdide de sekme değiştirir
  for (const yol of [YOL.CDP, YOL.G]) {
    await sec('b.pdf');
    await tikla(...(await merkez(`document.querySelector('#sayfa-kutusu')`))); await bekle(200);
    const odak = await evalJs(`document.activeElement?.id`);
    await yol.bas('Right', ['control']); await yol.bas('Left', ['control']);
    const a1 = await aktifAd(), odak2 = await evalJs(`document.activeElement?.id`);
    sonuc(`Sayfa kutusundayken Ctrl+→ / Ctrl+← sekme değiştirmez (${yol.ad})`, odak === 'sayfa-kutusu' && a1 === 'b.pdf' && odak2 === 'sayfa-kutusu', { odak, a1, odak2 });
    await yol.bas('PageDown', ['control']);
    const a2 = await aktifAd();
    sonuc(`Sayfa kutusundayken Ctrl+PageDown sekme değiştirir (b→c; ${yol.ad})`, a2 === 'c.pdf', a2);
    const s2 = await sayfalar();
    sonuc(`Sayfa kutusundaki tuşlar sayfaları değiştirmez (${yol.ad})`, J(s2) === J(SAYFA), s2);
  }
  // Bul kutusunda da Ctrl+← / → sekme değiştirmez
  await sec('b.pdf'); await evalJs(`getSelection().removeAllRanges()`);   // sayfa kutusundaki seçim Bul'a yazılmasın (ayrıca sınanıyor, bölüm 9)
  await tusG('F', ['control'], 500);
  await tusC('ArrowRight', ['ctrl']); await tusG('Left', ['control']);
  sonuc('Bul kutusundayken Ctrl+→ / Ctrl+← sekme değiştirmez', (await aktifAd()) === 'b.pdf' && (await evalJs(`document.activeElement?.id`)) === 'bul-girdi', await durumAl());
  await tusC('Escape');

  // ================================================================ 3) Ctrl+T: açılış sekmesi; oradan geçiş, Ctrl+O, Ctrl+W
  await sec('b.pdf');
  await tusG('T', ['control'], 500);
  d = await durumAl();
  const bs = await evalJs(`(() => { const s = window.__pdefe.sekmeler.sekmeler.at(-1); return { sinif: s.el.classList.contains('baslangic-sekmesi'), aktif: s.el.classList.contains('aktif'), baslik: s.el.title }; })()`);
  sonuc('Ctrl+T belge açıkken: sona "Yeni sekme" açılış sekmesi eklenir ve etkin olur, açılış ekranı görünür, etkin belge yok',
    J(d.sekmeler) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'Yeni sekme']) && d.aktif === 'Yeni sekme' && d.baslangic && d.belge === null && bs.sinif && bs.aktif, { d, bs });
  await ss('acilis-sekmesi');
  for (const yol of [YOL.G, YOL.CDP]) {
    const gorulen = [];
    for (const t of ['PageUp', 'PageDown', 'Left', 'Right', 'PageDown', 'Right']) { await yol.bas(t, ['control']); gorulen.push(await aktifAd()); }
    const beklenen = ['d.pdf', 'Yeni sekme', 'd.pdf', 'Yeni sekme', 'Yeni sekme', 'Yeni sekme'];
    sonuc(`Açılış sekmesinde Ctrl+PageUp / PageDown / ← / → çalışır, son sekmede durur (${yol.ad})`, J(gorulen) === J(beklenen), { gorulen, beklenen });
    sonuc(`Açılış sekmesiyle geçişte sayfalar değişmez (${yol.ad})`, J(await sayfalar()) === J(SAYFA), await sayfalar());
    sonuc(`Açılış sekmesine dönünce açılış ekranı görünür (${yol.ad})`, (await durumAl()).baslangic);
  }
  // Açılış sekmesinden Ctrl+O: açılan belge sekmenin yerini alır
  await yanitla('dosya:acDiyalog', [[path.join(PDF, 'e.pdf')]]);
  await tusG('O', ['control'], 300);
  await kosul(`window.__pdefe.aktif()?.ad === 'e.pdf' && window.__pdefe.aktif().gorunum.sayfaSayisi > 0`); await bekle(300);
  d = await durumAl(); k = await kayit();
  sonuc('Açılış sekmesinde Ctrl+O: açılan belge açılış sekmesinin yerini alır (aynı konum), etkin', J(d.sekmeler) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf']) && d.aktif === 'e.pdf' && !d.baslangic && k.length === 1, { d, k });
  // Zaten açık dosya: o sekmeye geçilir, açılış sekmesi kapanır
  await tusG('T', ['control'], 400);
  await yanitla('dosya:acDiyalog', [[path.join(PDF, 'b.pdf')]]);
  await tusG('O', ['control'], 700);
  d = await durumAl(); await kayit();
  sonuc('Açılış sekmesinde Ctrl+O ile zaten açık dosya: o sekmeye geçilir, açılış sekmesi kapanır', J(d.sekmeler) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf']) && d.aktif === 'b.pdf', d);
  // Ctrl+W açılış sekmesinde
  await sec('d.pdf');
  await tusG('T', ['control'], 400);
  sonuc('Ctrl+T ikinci kez: yeni açılış sekmesi', (await aktifAd()) === 'Yeni sekme');
  await tusG('W', ['control'], 500);
  d = await durumAl();
  sonuc('Ctrl+W açılış sekmesini kapatır; son kullanılan sekmeye (d) dönülür', J(d.sekmeler) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf']) && d.aktif === 'd.pdf' && !d.baslangic, d);
  // Ctrl+W belge sekmesinde: değişmemiş kapanır
  await sec('e.pdf');
  await tusG('W', ['control'], 600);
  d = await durumAl();
  sonuc('Ctrl+W değişmemiş belgeyi sorusuz kapatır (e), son kullanılan sekmeye (d) dönülür', J(d.sekmeler) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']) && d.aktif === 'd.pdf', d);
  // Ctrl+W değişmiş belgede: kaydetme sorusu; Esc = Vazgeç; Kaydetme ile kapanır
  await ac('e.pdf'); await dondur('e.pdf', 1);
  await tusG('W', ['control'], 300);
  await kosul(`!!document.querySelector('.mesaj-kutusu')`, 5000);
  const soru = await kutu();
  sonuc('Ctrl+W değişmiş belgede: Kaydet | Kaydetme | Vazgeç sorusu', soru?.ileti === '"e.pdf" belgesinde kaydedilmemiş değişiklikler var.' && J(soru.dugmeler) === J(['Kaydet', 'Kaydetme', 'Vazgeç']), soru);
  await tusG('Escape', [], 400);
  sonuc('Soruda Esc (tusGonder) = Vazgeç: kutu kapanır, e açık ve değişmiş', !(await kutu()) && (await aktifAd()) === 'e.pdf' && (await degisti('e.pdf')));
  await tusG('W', ['control'], 300);
  await kosul(`!!document.querySelector('.mesaj-kutusu')`, 5000);
  await kutuDugmesi('Kaydetme');
  await kosul(`![...window.__pdefe.belgeler.values()].some((b) => b.ad === 'e.pdf')`, 5000);
  sonuc('Soruda Kaydetme: e kapanır', J((await durumAl()).sekmeler) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']));

  // ================================================================ 4) Ctrl+1 … Ctrl+9
  for (const ad of ['e.pdf', 'f.pdf', 'g.pdf', 'h.pdf', 'i.pdf', 'j.pdf']) await ac(ad);
  d = await durumAl();
  sonuc('Hazırlık: on sekme (a … j)', J(d.sekmeler) === J(ADLAR), d.sekmeler);
  for (const yol of [YOL.CDP, YOL.G]) {
    await sec('e.pdf'); await odakBelgede();
    const gorulen = [];
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) { await yol.bas(String(n), ['control'], 300); gorulen.push(await aktifAd()); }
    const beklenen = [...ADLAR.slice(0, 8), 'j.pdf'];
    sonuc(`Ctrl+1 … Ctrl+8 o sıradaki sekme, Ctrl+9 son sekme (j; 9. değil) (${yol.ad})`, J(gorulen) === J(beklenen), { gorulen, beklenen });
  }
  for (const ad of ['f.pdf', 'g.pdf', 'h.pdf', 'i.pdf', 'j.pdf', 'e.pdf']) await kapat(ad);
  await bekle(300);
  for (const yol of [YOL.CDP, YOL.G]) {
    await sec('b.pdf'); await odakBelgede();
    await yol.bas('6', ['control']);
    const a6 = await aktifAd();
    await yol.bas('9', ['control']);
    const a9 = await aktifAd();
    sonuc(`Dört sekmede Ctrl+6 bir şey yapmaz, Ctrl+9 son sekme (d) (${yol.ad})`, a6 === 'b.pdf' && a9 === 'd.pdf', { a6, a9 });
  }
  await tusG('T', ['control'], 400);
  await sec('a.pdf'); await odakBelgede();
  await tusC('9', ['ctrl']);
  const a9b = await aktifAd();
  await tusC('1', ['ctrl']);
  const a1b = await aktifAd();
  await tusG('9', ['control']);
  const a9c = await aktifAd();
  sonuc('Açılış sekmesi sondayken Ctrl+9 ona, açılış sekmesinden Ctrl+1 ilk sekmeye geçer', a9b === 'Yeni sekme' && a1b === 'a.pdf' && a9c === 'Yeni sekme', { a9b, a1b, a9c });
  await tusG('W', ['control'], 400);
  sonuc('Sayfalar Ctrl+1–9 boyunca değişmedi', J(await sayfalar()) === J(SAYFA), await sayfalar());

  // ================================================================ 5) Ctrl+Tab / Ctrl+Shift+Tab (son kullanılan sırası) ve seçici
  const mruKur = async () => { for (const ad of ['a.pdf', 'c.pdf', 'b.pdf', 'd.pdf']) await sec(ad); await odakBelgede(); };   // MRU: d, b, c, a
  for (const yol of [YOL.G, YOL.CDP]) {
    await mruKur();
    const mru0 = await mruAdlari();
    await yol.ctrlTab(); await yol.birak(); await bekle(400);
    const k1 = await aktifAd();
    await yol.ctrlTab(); await yol.birak(); await bekle(400);
    const k2 = await aktifAd();
    sonuc(`Ctrl+Tab kısa basış son kullanılana geçer (MRU d,b,c,a: d→b, sonra b→d; sıraya göre c değil) (${yol.ad})`, J(mru0) === J(['d.pdf', 'b.pdf', 'c.pdf', 'a.pdf']) && k1 === 'b.pdf' && k2 === 'd.pdf', { mru0, k1, k2 });
    await mruKur();
    await yol.ctrlTab(true); await yol.birak(); await bekle(400);
    const k3 = await aktifAd();
    sonuc(`Ctrl+Shift+Tab kısa basış listenin sonuna (en eski kullanılan: a) geçer (${yol.ad})`, k3 === 'a.pdf', k3);

    // Basılı tutma: seçici görünür, ← → gezinir, sayfa değişmez; Ctrl bırakınca seçilene geçer
    await mruKur();
    const sOnce = await sayfalar();
    const kay0 = await evalJs(`window.__pdefe.aktif().gorunum.kaydirici.scrollTop`);
    await yol.ctrlTab(); await bekle(500);
    const sc1 = await seciciDurumu();
    sonuc(`Ctrl+Tab basılı: seçici görünür, adaylar son kullanım sırasıyla, ikinci aday seçili (${yol.ad})`, sc1.acik && sc1.gorunur && J(sc1.adaylar) === J(['d.pdf', 'b.pdf', 'c.pdf', 'a.pdf']) && sc1.secili === 1, sc1);
    if (yol === YOL.G) await ss('ctrl-tab-secici');
    await yol.bas('Right', ['control'], 250);
    const sc2 = await seciciDurumu();
    await yol.bas('Right', ['control'], 250);
    const sc3 = await seciciDurumu();
    await yol.bas('Left', ['control'], 250);
    const sc4 = await seciciDurumu();
    sonuc(`Seçicide → → ← adaylarda gezer (1→2→3→2) (${yol.ad})`, sc2.secili === 2 && sc3.secili === 3 && sc4.secili === 2 && sc4.acik, { sc2: sc2.secili, sc3: sc3.secili, sc4: sc4.secili });
    await yol.tabYine(false); await bekle(250);
    const sc5 = await seciciDurumu();
    sonuc(`Seçici açıkken Tab bir sonraki adaya geçer (2→3) (${yol.ad})`, sc5.secili === 3, sc5.secili);
    const kay1 = await evalJs(`window.__pdefe.aktif().gorunum.kaydirici.scrollTop`);
    sonuc(`Seçici açıkken oklar belgeyi kaydırmaz / sayfa çevirmez, etkin sekme değişmez (${yol.ad})`, J(await sayfalar()) === J(sOnce) && kay0 === kay1 && (await aktifAd()) === 'd.pdf', { once: sOnce, sonra: await sayfalar(), kay0, kay1 });
    await yol.birak(); await bekle(400);
    const sc6 = await seciciDurumu();
    sonuc(`Ctrl bırakınca seçici kapanır ve seçilen adaya (a) geçilir (${yol.ad})`, !sc6.acik && !sc6.gorunur && (await aktifAd()) === 'a.pdf', { sc6, aktif: await aktifAd() });

    // Esc vazgeçer
    await mruKur();
    await yol.ctrlTab(); await bekle(450);
    await yol.bas('Right', ['control'], 200);
    await yol.bas('Escape', ['control'], 250);
    const sc7 = await seciciDurumu();
    await yol.birak(); await bekle(350);
    sonuc(`Seçicide Esc vazgeçer: seçici kapanır, Ctrl bırakınca da sekme değişmez (d) (${yol.ad})`, !sc7.acik && !sc7.gorunur && (await aktifAd()) === 'd.pdf', { sc7, aktif: await aktifAd() });
    sonuc(`Ctrl+Tab bölümü boyunca sayfalar değişmedi (${yol.ad})`, J(await sayfalar()) === J(SAYFA), await sayfalar());

    // Ctrl basılıyken Shift+Tab'ı tekrarlamak geriye doğru gezinmeli (en eski → daha yeni): 3 → 2 → 1
    await mruKur();
    await yol.ctrlTab(true); await bekle(300);
    const g1 = (await seciciDurumu()).secili;
    await yol.tabYine(true); await bekle(200);
    const g2 = (await seciciDurumu()).secili;
    await yol.tabYine(true); await bekle(200);
    const g3 = (await seciciDurumu()).secili;
    await yol.birak(); await bekle(400);
    const gSon = await aktifAd();
    sonuc(`Ctrl basılıyken Shift+Tab üç kez: seçim 3 → 2 → 1 gider, bırakınca b (${yol.ad})`, g1 === 3 && g2 === 2 && g3 === 1 && gSon === 'b.pdf', { g1, g2, g3, gSon });
    // Ctrl+Tab, Tab, sonra Shift+Tab: bir geri (2 → 1)
    await mruKur();
    await yol.ctrlTab(false); await bekle(250);
    await yol.tabYine(false); await bekle(200);
    const h1 = (await seciciDurumu()).secili;
    await yol.tabYine(true); await bekle(200);
    const h2 = (await seciciDurumu()).secili;
    await yol.birak(); await bekle(400);
    const hSon = await aktifAd();
    sonuc(`Ctrl basılıyken Tab, Tab, Shift+Tab: seçim 1 → 2 → 1, bırakınca b (${yol.ad})`, h1 === 2 && h2 === 1 && hSon === 'b.pdf', { h1, h2, hSon });
  }
  // Açılış sekmesiyle Ctrl+Tab
  await sec('c.pdf'); await tusG('T', ['control'], 400);
  await ctrlTabG(); await ctrlBirakG(); await bekle(400);
  const t1 = await aktifAd();
  await ctrlTabG(); await ctrlBirakG(); await bekle(400);
  const t2 = await aktifAd();
  sonuc('Açılış sekmesinde Ctrl+Tab son kullanılana (c) geçer, yeniden Ctrl+Tab açılış sekmesine döner', t1 === 'c.pdf' && t2 === 'Yeni sekme', { t1, t2 });
  await tusG('W', ['control'], 400);

  // ================================================================ 6) Ctrl+Z / Ctrl+Y (döndürmeyi geri al / yinele)
  await sec('a.pdf'); await odakBelgede();
  await dondur('a.pdf', 3); await dondur('a.pdf', 3);
  sonuc('Hazırlık: a.pdf 3. sayfa iki kez döndürüldü (180°), değişmiş', (await dondurme('a.pdf', 3)) === 180 && (await degisti('a.pdf')));
  for (const yol of [YOL.CDP, YOL.G]) {
    await odakBelgede();
    await yol.bas('z', ['control'], 500);
    const z1 = await dondurme('a.pdf', 3);
    await yol.bas('y', ['control'], 500);
    const y1 = await dondurme('a.pdf', 3);
    sonuc(`Ctrl+Z bir adım geri alır (180→90), Ctrl+Y yineler (90→180) (${yol.ad})`, z1 === 90 && y1 === 180, { z1, y1 });
  }
  // Girdi kutusundayken Ctrl+Z belgeyi geri almaz
  for (const yol of [YOL.CDP, YOL.G]) {
    await tikla(...(await merkez(`document.querySelector('#sayfa-kutusu')`))); await bekle(200);
    await yol.bas('z', ['control'], 400);
    sonuc(`Sayfa kutusundayken Ctrl+Z belgenin döndürmesini geri almaz (${yol.ad})`, (await dondurme('a.pdf', 3)) === 180 && (await evalJs(`document.activeElement?.id`)) === 'sayfa-kutusu');
    await tusC('Escape');
  }
  await odakBelgede();
  await tusG('Z', ['control'], 400); await tusC('z', ['ctrl'], 400);
  sonuc('İki Ctrl+Z ile döndürme tamamen geri alındı, belge değişmemiş sayılır', (await dondurme('a.pdf', 3)) === 0 && !(await degisti('a.pdf')), { d: await dondurme('a.pdf', 3), degisti: await degisti('a.pdf') });
  sonuc('Ctrl+Z / Ctrl+Y sırasında a.pdf sayfası yerinde (3)', (await sayfalar())['a.pdf'] === 3, await sayfalar());

  // ================================================================ 7) Ctrl+S, Ctrl+Shift+S
  await odakBelgede();
  await tusG('S', ['control'], 500);
  const bil = await evalJs(`(() => { const b = document.querySelector('#bildirim'); return b.hidden ? '' : b.textContent; })()`);
  sonuc('Ctrl+S değişiklik yokken: "Kaydedilecek değişiklik yok." bildirimi, dosya yazılmaz', bil === 'Kaydedilecek değişiklik yok.', bil);
  const mtime0 = fs.statSync(path.join(PDF, 'a.pdf')).mtimeMs;
  await dondur('a.pdf', 1);
  sonuc('Hazırlık: a.pdf 1. sayfa döndürüldü, değişmiş', (await degisti('a.pdf')) && (await dondurme('a.pdf', 1)) === 90);
  await tusG('S', ['control'], 300);
  const kaydedildi = await kosul(`(() => { const b = window.__pdefe.aktif(); return !b.degisti && !b.kaydediliyor; })()`, 20000);
  await bekle(500);
  let diskDon = null;
  try { diskDon = execFileSync(PYTHON, ['-c', 'import sys, pymupdf; d = pymupdf.open(sys.argv[1]); print(d[0].rotation, d[2].rotation)', path.join(PDF, 'a.pdf')], { encoding: 'utf8' }).trim(); } catch (e) { diskDon = 'okunamadı: ' + e.message; }
  sonuc('Ctrl+S: döndürülmüş belge kaydedilir (degisti false, dosya yazıldı, diskte 1. sayfa 90°, 3. sayfa 0°)', kaydedildi && fs.statSync(path.join(PDF, 'a.pdf')).mtimeMs > mtime0 && diskDon === '90 0', { kaydedildi, diskDon });
  await kayit();
  await sec('b.pdf'); await odakBelgede();
  await tusG('S', ['control', 'shift'], 700);
  k = await kayit();
  const fk = k.find((x) => x.kanal === 'dosya:kaydetDiyalog');
  sonuc('Ctrl+Shift+S: Farklı kaydet penceresi (dosya:kaydetDiyalog, başlık "Farklı kaydet", varsayılan belgenin yolu); vazgeçince sekme aynı',
    k.length === 1 && fk?.secenek?.baslik === 'Farklı kaydet' && fk.secenek.varsayilan === path.join(PDF, 'b.pdf') && (await aktifAd()) === 'b.pdf', k);
  const farkliYol = path.join(PDF, 'b-farkli.pdf');
  await yanitla('dosya:kaydetDiyalog', [farkliYol]);
  await tusG('S', ['control', 'shift'], 300);
  await kosul(`window.__pdefe.aktif()?.ad === 'b-farkli.pdf' && !window.__pdefe.aktif().kaydediliyor`, 15000);
  await kayit();
  sonuc('Ctrl+Shift+S + seçilen yol: dosya yazılır, sekme yeni adı alır', fs.existsSync(farkliYol) && (await aktifAd()) === 'b-farkli.pdf', { var: fs.existsSync(farkliYol), aktif: await aktifAd() });

  // ================================================================ 8) Ctrl+P (yazdırma seçenekleri), Esc
  await sec('c.pdf'); await odakBelgede();
  for (const [etiket, esc] of [['tusGonder', () => tusG('Escape', [], 400)], ['CDP', () => tusC('Escape', [], 400)]]) {
    await tusG('P', ['control'], 300);
    const acildi = await kosul(`!!document.querySelector('.yazdir-ortusu')`, 8000);
    const yb = await evalJs(`(() => { const o = document.querySelector('.yazdir-ortusu'); return o ? { baslik: o.querySelector('.baslik')?.textContent, belge: o.querySelector('.yazdir-belge')?.textContent, odak: o.contains(document.activeElement) } : null; })()`);
    sonuc(`Ctrl+P: yazdırma seçenekleri penceresi açılır (Yazdır, c.pdf · 17 sayfa, odak pencerede) [Esc: ${etiket}]`, acildi && yb?.baslik === 'Yazdır' && /^c\.pdf/.test(yb.belge) && /17 sayfa/.test(yb.belge) && yb.odak, yb);
    if (etiket === 'tusGonder') await ss('yazdir');
    await esc();
    sonuc(`Yazdırma penceresinde Esc (${etiket}) kapatır, yazdırma başlamaz`, !(await evalJs(`!!document.querySelector('.yazdir-ortusu')`)) && !(await kayit()).some((x) => /yazdir/.test(x.kanal)));
  }

  // ================================================================ 9) Ctrl+F, F3 / Shift+F3
  await evalJs(`getSelection().removeAllRanges()`);
  await sec('c.pdf'); await odakBelgede();
  // Önce sayfa kutusu kullanılır (tık, Esc): belgede metin seçili değilken Ctrl+F Bul'a sayfa numarasını yazmamalı
  const cSayfa = String(await evalJs(`window.__pdefe.aktif().gorunum.gecerli`));
  await tikla(...(await merkez(`document.querySelector('#sayfa-kutusu')`))); await bekle(200);
  await tusC('Escape', [], 300);
  const oncekiBul = await evalJs(`document.querySelector('#bul-girdi').value`);
  await tusG('F', ['control'], 700);
  const bk = await evalJs(`({ gorunur: !document.querySelector('#bul-kutusu').hidden, odak: document.activeElement?.id, deger: document.querySelector('#bul-girdi').value, sayac: document.querySelector('#bul-sayac').textContent, secim: getSelection().toString() })`);
  sonuc('Ctrl+F: Bul kutusu açılır, odak arama girdisinde', bk.gorunur && bk.odak === 'bul-girdi', bk);
  sonuc(`Sayfa kutusu kullanıldıktan sonra Ctrl+F Bul'a sayfa numarasını ("${cSayfa}") yazıp aramaz`, bk.deger !== cSayfa, { oncekiBul, ...bk });
  await evalJs(`(() => { const g = document.querySelector('#bul-girdi'); g.value = ''; g.dispatchEvent(new Event('input')); return true; })()`);
  await yaz('madde');
  const sayacTamam = await kosul(`window.__pdefe.arama.sorgu === 'madde' && /^\\d+ \\/ \\d+$/.test(document.querySelector('#bul-sayac').textContent)`, 15000);
  await bekle(300);
  const oku = async () => { const m = /^(\d+) \/ (\d+)$/.exec(await bulSayac()); return m ? [+m[1], +m[2]] : null; };
  const [k0, N] = (await oku()) || [0, 0];
  sonuc('Bul: "madde" için birden çok eşleşme ("k / N")', sayacTamam && N >= 3, await bulSayac());
  const ileri = (x) => (x % N) + 1, geri = (x) => ((x - 2 + N) % N) + 1;
  let beklenen = k0;
  const f3Dene = async (etiket, bas, yon) => {
    await bas(); await bekle(500);
    beklenen = yon > 0 ? ileri(beklenen) : geri(beklenen);
    const s = await oku();
    sonuc(`${etiket}: tek adım (${yon > 0 ? 'sonraki' : 'önceki'}) eşleşme → ${beklenen} / ${N}`, s && s[0] === beklenen && s[1] === N, { sayac: await bulSayac(), beklenen });
    if (s) beklenen = s[0];
  };
  await f3Dene('F3 girdideyken (CDP)', () => tus('F3'), 1);
  await f3Dene('Shift+F3 girdideyken (CDP)', () => tus('F3', ['shift']), -1);
  await f3Dene('F3 girdideyken (tusGonder)', () => tusG('F3', [], 0), 1);
  await f3Dene('Shift+F3 girdideyken (tusGonder)', () => tusG('F3', ['shift'], 0), -1);
  await odakBelgede();
  sonuc('Odak belgede (Bul açık)', (await evalJs(`document.activeElement?.id`)) !== 'bul-girdi');
  await f3Dene('F3 odak belgedeyken (tusGonder, menü)', () => tusG('F3', [], 0), 1);
  await f3Dene('Shift+F3 odak belgedeyken (tusGonder, menü)', () => tusG('F3', ['shift'], 0), -1);
  await ss('bul');
  // Esc: girdideyken kapatır
  await tikla(...(await merkez(`document.querySelector('#bul-girdi')`))); await bekle(200);
  await tusG('Escape', [], 400);
  sonuc('Bul girdisinde Esc (tusGonder) Bul kutusunu kapatır', await evalJs(`document.querySelector('#bul-kutusu').hidden`));
  await tusG('F', ['control'], 500);
  await tusC('Escape', [], 400);
  sonuc('Ctrl+F yeniden açar; girdide Esc (CDP) kapatır', await evalJs(`document.querySelector('#bul-kutusu').hidden`));
  const sBul = await sayfalar();
  sonuc('Bul / F3 yalnızca aranan belgeyi (c) gezdirir; diğer sekmelerin sayfaları yerinde', sBul['a.pdf'] === 3 && sBul['b-farkli.pdf'] === 5 && sBul['d.pdf'] === 9, sBul);
  // Bul kapalıyken sayfa kutusunda Ctrl+Z: girdi kendi geçmişi yokken Chromium'un çerçeve geneli geri alması son yazmayı (gizli Bul
  // girdisindeki) geri alır; bu, aramayı çalıştırıp belgeyi başka sayfaya atlatmamalı. Kullanıcı yolu: Ctrl+F, önceki sözcüğün yerine
  // yeni sözcük yaz, Esc; başka sayfaya git, sayfa kutusuna tıkla, Ctrl+Z.
  for (const yol of [YOL.CDP, YOL.G]) {
    await sec('c.pdf');
    await tusG('F', ['control'], 500);
    const onceki = await evalJs(`document.querySelector('#bul-girdi').value`);
    await yaz('kanun');
    await kosul(`window.__pdefe.arama.sorgu === 'kanun' && /^\\d+ \\/ \\d+$/.test(document.querySelector('#bul-sayac').textContent)`, 15000);
    await tusC('Escape', [], 400);
    await sayfayaGit('c.pdf', 8);
    await tikla(...(await merkez(`document.querySelector('#sayfa-kutusu')`))); await bekle(250);
    await yol.bas('z', ['control'], 1500);
    const gz = await evalJs(`({ sayfa: window.__pdefe.aktif().gorunum.gecerli, bulGirdi: document.querySelector('#bul-girdi').value, bulAcik: !document.querySelector('#bul-kutusu').hidden, sayac: document.querySelector('#bul-sayac').textContent, odak: document.activeElement?.id })`);
    sonuc(`Bul kapalıyken sayfa kutusunda Ctrl+Z gizli aramayı çalıştırıp sayfayı değiştirmez (c: 8. sayfa; ${yol.ad})`, gz.sayfa === 8 && gz.sayac === '' && gz.bulGirdi === 'kanun', { onceki, ...gz });
    await tusC('Escape', [], 300);
  }

  // ================================================================ 10) Ctrl+A
  for (const yol of [YOL.CDP, YOL.G]) {
    await evalJs(`getSelection().removeAllRanges()`);
    await odakBelgede();
    await yol.bas('a', ['control'], 400);
    const sa = await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; const katman = g.sayfalar[g.gecerli - 1].el.querySelector('.textLayer'); const s = getSelection();
      return { uzunluk: s.toString().length, icinde: !!katman && katman.contains(s.anchorNode) && katman.contains(s.focusNode), sayfa: g.gecerli,
        baskaSayfa: [...document.querySelectorAll('.textLayer')].some((t) => t !== katman && s.containsNode(t, true)) }; })()`);
    sonuc(`Ctrl+A: geçerli sayfanın (${sa.sayfa}) bütün metni seçilir, başka sayfa seçilmez (${yol.ad})`, sa.uzunluk > 200 && sa.icinde && !sa.baskaSayfa, sa);
  }
  await evalJs(`getSelection().removeAllRanges()`);
  await tikla(...(await merkez(`document.querySelector('#sayfa-kutusu')`))); await bekle(200);
  await tusC('a', ['ctrl'], 300);
  const sk = await evalJs(`(() => { const k = document.querySelector('#sayfa-kutusu'); const katmanlar = [...document.querySelectorAll('.textLayer')]; return { odak: document.activeElement === k, tumu: k.selectionStart === 0 && k.selectionEnd === k.value.length, sayfaMetni: katmanlar.some((t) => getSelection().containsNode(t, true)) }; })()`);
  sonuc('Sayfa kutusundayken Ctrl+A yalnızca kutunun metnini seçer, sayfa metnini seçmez', sk.odak && sk.tumu && !sk.sayfaMetni, sk);
  await tusC('Escape');

  // ================================================================ 11) Delete (seçili not)
  await sec('d.pdf'); await odakBelgede();
  const notSayisi = () => evalJs(`[...window.__pdefe.aktif().notlar.notlar.values()].filter((n) => !n.silindi).length`);
  const not0 = await notSayisi();
  await tikla(...(await merkez(`document.querySelector('#not-araclari [data-arac="not"]')`))); await bekle(250);
  const nokta = await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; const r = g.sayfalar[g.gecerli - 1].el.getBoundingClientRect(); const k = g.kaydirici.getBoundingClientRect(); const ust = Math.max(r.top, k.top); return [r.left + r.width * 0.35, ust + 90]; })()`);
  await tikla(...nokta); await bekle(500);
  const n1 = await evalJs(`(() => { const n = window.__pdefe.aktif().notlar; const not = n.notlar.get(n.secili); return { id: n.secili, tur: not?.tur, konu: not?.konu, odak: !!document.activeElement?.matches('.not-balonu textarea.icerik') }; })()`);
  sonuc('Not aracıyla sayfaya tıklama: not (Text, konu "Not") eklenir, seçili, balon metin kutusunda odak', n1.id && n1.tur === 'Text' && n1.konu === 'Not' && n1.odak && (await notSayisi()) === not0 + 1, n1);
  await yaz('Silinecek not');
  await tusC('Delete', [], 300);
  sonuc('Balonun metin kutusundayken Delete notu silmez (metin kutusunun tuşu)', (await notSayisi()) === not0 + 1);
  await tusC('Escape', [], 300);
  const odakSonra = await evalJs(`document.activeElement?.tagName + '.' + (document.activeElement?.className || '')`);
  await tusC('Delete', [], 400);
  const sil1 = await evalJs(`(() => { const n = window.__pdefe.aktif().notlar; const not = n.notlar.get(${J(n1.id)}); return { silindi: !not || not.silindi, secili: n.secili, dom: !!document.querySelector('[data-id="${n1.id}"]'), balon: !!document.querySelector('.not-balonu') }; })()`);
  sonuc('Esc ile metin kutusundan çıkıp Delete (CDP): seçili not silinir, balon kapanır', sil1.silindi && !sil1.dom && !sil1.balon && (await notSayisi()) === not0, { odakSonra, sil1 });
  await odakBelgede();
  await tusC('z', ['ctrl'], 500);
  sonuc('Ctrl+Z silinen notu geri getirir', (await notSayisi()) === not0 + 1 && await kosul(`!!document.querySelector('[data-id="${n1.id}"]')`, 3000));
  await tikla(...(await merkez(`document.querySelector('[data-id="${n1.id}"]')`))); await bekle(500);
  const secildi = await evalJs(`({ secili: window.__pdefe.aktif().notlar.secili, odak: !!document.activeElement?.matches('.not-balonu textarea.icerik') })`);
  if (secildi.odak) await tusG('Escape', [], 300);
  await tusG('Delete', [], 500);
  const sil2 = await evalJs(`(() => { const n = window.__pdefe.aktif().notlar; const not = n.notlar.get(${J(n1.id)}); return { silindi: !not || not.silindi, dom: !!document.querySelector('[data-id="${n1.id}"]') }; })()`);
  sonuc('Nota tıklayıp seçme, Esc, Delete (tusGonder): not silinir', secildi.secili === n1.id && sil2.silindi && !sil2.dom && (await notSayisi()) === not0, { secildi, sil2 });
  sonuc('Delete not seçili değilken belgeye bir şey yapmaz (sayfa yerinde)', (await (async () => { await odakBelgede(); await tusC('Delete', [], 300); return (await sayfalar())['d.pdf'] === 9 && (await notSayisi()) === not0; })()));

  // ================================================================ 12) Ctrl+, (Ayarlar), F1 (Kısayollar), Esc
  for (const [etiket, esc] of [['tusGonder', () => tusG('Escape', [], 400)], ['CDP', () => tusC('Escape', [], 400)]]) {
    await odakBelgede();
    await tusG(',', ['control'], 500);
    sonuc(`Ctrl+,: Ayarlar penceresi açılır [Esc: ${etiket}]`, await kosul(`!!document.querySelector('.ayarlar-ortusu')`, 3000));
    await esc();
    sonuc(`Ayarlar penceresinde Esc (${etiket}) kapatır`, !(await evalJs(`!!document.querySelector('.ayarlar-ortusu')`)));
  }
  const kisayolPenceresi = () => evalJs(`(() => { const o = [...document.querySelectorAll('.diyalog-ortusu')].find((x) => x.querySelector('.kisayol-sutunlar')); if (!o) return null;
    const tablolar = [...o.querySelectorAll('.kisayol-sutunlar table.kisayollar')];
    return { baslik: o.querySelector('.baslik')?.textContent, sutun: tablolar.length, bolumler: tablolar.map((t) => [...t.querySelectorAll('tr.bolum th')].map((x) => x.textContent)),
      tuslar: tablolar.slice(0, 2).map((t) => [...t.querySelectorAll('tr:not(.bolum)')].map((r) => [...r.querySelectorAll('kbd')].map((x) => x.textContent).join(' | ') + ' = ' + r.cells[1]?.textContent)),
      yanYana: tablolar.length === 3 && tablolar[0].getBoundingClientRect().top === tablolar[1].getBoundingClientRect().top && tablolar[1].getBoundingClientRect().left > tablolar[0].getBoundingClientRect().right - 1 }; })()`);
  for (const [etiket, esc] of [['tusGonder', () => tusG('Escape', [], 400)], ['CDP', () => tusC('Escape', [], 400)]]) {
    await odakBelgede();
    await tusG('F1', [], 500);
    const kp = await kisayolPenceresi();
    sonuc(`F1: "Kısayollar" penceresi, üç sütun yan yana [Esc: ${etiket}]`, kp?.baslik === 'Kısayollar' && kp.sutun === 3 && kp.yanYana, kp && { baslik: kp.baslik, sutun: kp.sutun, yanYana: kp.yanYana });
    sonuc(`F1 bölümleri: 1) Dosya ve sekmeler, Düzen, Genel 2) Gezinme, Görünüm, Yazı kutusu 3) Sayfaları düzenle, Görüntü / PDF birleştir`,
      J(kp?.bolumler) === J([['Dosya ve sekmeler', 'Düzen', 'Genel'], ['Gezinme', 'Görünüm', 'Yazı kutusu'], ['Sayfaları düzenle', 'Görüntü / PDF birleştir']]), kp?.bolumler);
    if (etiket === 'tusGonder') {
      const ilk = kp?.tuslar?.[0] || [];
      const gerekli = ['Ctrl+O', 'Ctrl+T', 'Ctrl+S', 'Ctrl+Shift+S', 'Ctrl+P', 'Ctrl+W', 'Ctrl+PageUp / PageDown', 'Ctrl+← / →', 'Ctrl+Tab / Ctrl+Shift+Tab', 'Ctrl+1 – Ctrl+9', 'Ctrl+Z / Ctrl+Y', 'Ctrl+F', 'F3 / Shift+F3', 'Ctrl+A', 'Delete', 'Ctrl+,'];
      const eksik = gerekli.filter((t) => !ilk.some((s) => s.split(' = ')[0].split(' | ').includes(t)));
      sonuc('F1 ilk sütunu sınanan bütün kısayolları listeler', !eksik.length, { eksik, ilk });
      const genel = (kp?.tuslar?.[0] || []).slice(-2);   // Genel birinci sütunun sonunda
      sonuc('F1 "Genel": F1 = Kısayollar, Esc = Kapat / vazgeç', J(genel) === J(['F1 = Kısayollar', 'Esc = Kapat / vazgeç']), genel);
      await ss('kisayollar');
    }
    const odak = await evalJs(`!![...document.querySelectorAll('.diyalog-ortusu')].find((x) => x.querySelector('.kisayol-sutunlar'))?.contains(document.activeElement)`);
    await esc();
    sonuc(`Kısayollar penceresinde Esc (${etiket}) kapatır`, !(await kisayolPenceresi()), { odakPenceredeydi: odak });
    if (await kisayolPenceresi()) await evalJs(`(() => { document.querySelectorAll('.diyalog-ortusu [data-id="tamam"]').forEach((b) => b.click()); return true; })()`);
  }

  // ================================================================ 13) açık pencerenin (Kısayollar, Ayarlar, Yazdır) arkasına kısayol sızmamalı
  // Ctrl+PageUp / PageDown ve Ctrl+← / → açık pencerede sekme değiştirmemek için özellikle denetleniyor (uygulama.js); aynı beklenti
  // öteki sekme / belge kısayolları için de sınanır. Her tuş ayrı açılmış pencerede; ardından Esc'in pencereyi hâlâ kapatıp kapatmadığı.
  const temizle = async () => {
    await evalJs(`(() => { if (window.__pdefe.sekmeler.seciciAcik) window.__pdefe.sekmeler.seciciIptal();
      document.querySelectorAll('.diyalog-ortusu').forEach((o) => o.querySelector('[data-id="tamam"], [data-id="iptal"]')?.click());
      document.querySelector('.ayarlar-ortusu [data-id="kapat2"]')?.click();
      const s = window.__pdefe.sekmeler; for (const x of [...s.sekmeler]) if (x.baslangic) s.dispatchEvent(new CustomEvent('kapat', { detail: { id: x.id } })); return true; })()`);
    await bekle(200);
    if (!(await evalJs(`[...window.__pdefe.belgeler.values()].some((b) => b.ad === 'c.pdf')`))) await ac('c.pdf');
    if (await degisti('c.pdf')) await evalJs(`(() => { [...window.__pdefe.belgeler.values()].find((x) => x.ad === 'c.pdf').yigin.yinele(); return true; })()`);
    await sec('c.pdf'); await odakBelgede();
  };
  const PENCERELER = [
    { ad: 'Kısayollar penceresi', ac: () => tusG('F1', [], 500), sec: '.diyalog-ortusu:not(.yazdir-ortusu)' },
    { ad: 'Ayarlar', ac: async () => { await tusG(',', ['control'], 300); await kosul(`!!document.querySelector('.ayarlar-ortusu')`, 3000); await bekle(200); }, sec: '.ayarlar-ortusu' },
    { ad: 'Yazdır penceresi', ac: async () => { await tusG('P', ['control'], 300); await kosul(`!!document.querySelector('.yazdir-ortusu')`, 8000); await bekle(200); }, sec: '.yazdir-ortusu' },
  ];
  const SIZMA = [
    ['Ctrl+PageDown', () => tusG('PageDown', ['control'])],
    ['Ctrl+→', () => tusG('Right', ['control'])],
    ['Ctrl+1', () => tusG('1', ['control'])],
    ['Ctrl+Tab', async () => { await ctrlTabG(); await ctrlBirakG(); await bekle(400); }],
    ['Ctrl+Z', () => tusG('Z', ['control'], 500)],
    ['Ctrl+T', () => tusG('T', ['control'], 500)],
    ['Ctrl+W', () => tusG('W', ['control'], 700)],
  ];
  const belgeIzi = async () => ({ aktif: await aktifAd(), sekmeler: (await durumAl()).sekmeler,
    c: await evalJs(`(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.ad === 'c.pdf'); return b ? { degisti: b.degisti, don: b.gorunum.tarif()[1].dondurme || 0 } : null; })()`) });
  for (const p of PENCERELER) {
    await temizle();
    // c.pdf'te kaydedilmiş bir döndürme: geri alma yığınında bir komut var, belge değişmemiş (Ctrl+Z sızarsa belge değişir)
    await dondur('c.pdf', 2); await evalJs(`window.__pdefe.komutCalistir('dosya.kaydet')`);
    await kosul(`(() => { const b = window.__pdefe.aktif(); return b && !b.degisti && !b.kaydediliyor; })()`, 15000);
    for (const [tad, bas] of SIZMA) {
      await temizle();
      await p.ac();
      const acik0 = await evalJs(`!!document.querySelector(${J(p.sec)})`);
      const odak0 = await evalJs(`!!document.querySelector(${J(p.sec)})?.contains(document.activeElement)`);
      const once = await belgeIzi();
      await bas();
      const sonra = await belgeIzi();
      const acik1 = await evalJs(`!!document.querySelector(${J(p.sec)})`);
      const odak1 = await evalJs(`!!document.querySelector(${J(p.sec)})?.contains(document.activeElement)`);
      sonuc(`${p.ad} açıkken ${tad} arkadaki sekmeye / belgeye dokunmaz`, acik0 && odak0 && J(once) === J(sonra), J(once) === J(sonra) ? { acik0, odak0 } : { once, sonra });
      await tusG('Escape', [], 400);
      const acik2 = await evalJs(`!!document.querySelector(${J(p.sec)})`);
      sonuc(`${p.ad}: ${tad} sonrasında Esc pencereyi kapatır`, acik1 && !acik2, { acik1, odak1, acik2 });
    }
  }
  await temizle();
  // Esc hiçbir pencere yokken bir şey bozmaz
  await sec('c.pdf'); await odakBelgede();
  const sEsc = await sayfalar();
  await tusG('Escape', [], 300); await tusC('Escape', [], 300);
  const sSon = await sayfalar();
  sonuc('Açık pencere yokken Esc bir şey değiştirmez (sekme, sayfalar)', (await aktifAd()) === 'c.pdf' && J(sSon) === J(sEsc), { sEsc, sSon });

  sonuc('Konsolda hata yok', J(await evalJs(`window.__kdHatalar`)) === '[]', await evalJs(`window.__kdHatalar`));
  await hepsiniKapat();
  console.log(`\n${toplam - hataSayisi} / ${toplam} denetim geçti` + (hataSayisi ? ` — ${hataSayisi} HATA` : ''));
  process.exitCode = hataSayisi ? 1 : 0;
}
