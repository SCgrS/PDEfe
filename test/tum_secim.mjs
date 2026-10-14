// Ctrl+A belgenin bütün sayfalarının metnini seçer (0.2.6; tumSecim.js). 0.2.5'e dek yalnızca geçerli sayfanın metin katmanı seçiliyordu.
// Denetlenenler: görünüm kökünde 'tum-secili' sınıfı, tarayıcı seçimi yalnızca geçerli sayfada (çapa), görünür ve kaydırınca sonradan kurulan
// (200. sayfa) katmanların öğeleri seçim renginde, çapa sayfası iki kat boyanmaz, koyulaştırılmış sayfa renkleri; kopya (sahte copy olayı):
// hazırsa doğrudan, hazır değilse pano boşalır, "Metin hazırlanıyor (N/M)" yazılır, hazır olunca koşullu pano:metin (uzunluk çekirdeğin
// get_text'ine yakın), bu sırada çekirdek ve arayüz yanıt verir, seçim kalksa da kopyalama sürer; Esc ve belgenin kapanması kopyalamayı
// durdurur; tık, Esc, sekme değişimi, sayfa ve görünüm düzeni değişimi seçimi kaldırır; sağ tık menüsünde Kopyala etkin, Vurgula ve Ara soluk;
// Ctrl+F seçimden doldurmaz; tek sayfa düzeninde de çalışır; taranmış örnekte tanınan yazı kopyada.
// Sistem panosu hiç kullanılmaz: kopyalama sahte ClipboardEvent ile, çekirdeğin metni test örneğinde test:diyalogKaydi'na düşer (main.js).
// Menüden Kopyala seçilmez (document.execCommand('copy') sistem panosuna yazardı).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9473 -Veri "%TEMP%\pdefe-tum-9473"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9473; node test\surucu.mjs betik test\tum_secim.mjs
// Kanun PDF'leri test/pdf altında olmalı (mevzuat_6102_TTK.pdf 410 s., mevzuat_4721_TMK.pdf, dergipark_5104529_zamanasimi.pdf; depoya girmez).
// Taranmış örnek test/tanima_pdf_uret.py ile test/cikti/tanima altına üretilir (betik kendisi çalıştırır); tanıma Windows'un yazı tanıyıcısını ister.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(KOK, 'test', 'pdf');
const TTK = path.join(PDF, 'mevzuat_6102_TTK.pdf');
const TMK = path.join(PDF, 'mevzuat_4721_TMK.pdf');
const MAKALE = path.join(PDF, 'dergipark_5104529_zamanasimi.pdf');
const TANIMA = path.join(KOK, 'test', 'cikti', 'tanima');
const TARANMIS = path.join(TANIMA, 'taranmis.pdf');
const J = (x) => JSON.stringify(x);
const SECIM_RENGI = 'rgba(0, 103, 192, 0.35)', KOYU_SECIM_RENGI = 'rgba(60, 150, 255, 0.45)', SAYDAM = 'rgba(0, 0, 0, 0)';

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

// Sayfa n'nin katmanındaki metin öğelerinin arka plan renkleri ve tarayıcı seçiminin rengi (katman yoksa null)
const boya = (n) => `(() => { const g = window.__pdefe.aktif().gorunum, s = g.sayfalar[${n} - 1];
  const k = s?.el.querySelector(':scope > .textLayer'); if (!k || !k.querySelector(':scope > .endOfContent')) return null;
  const sp = [...k.querySelectorAll('span[role="presentation"]')];
  return { oge: sp.length, renkler: [...new Set(sp.map((e) => getComputedStyle(e).backgroundColor))],
    secimRengi: sp[0] ? getComputedStyle(sp[0], '::selection').backgroundColor : null }; })()`;
const DURUM = `(() => { const p = window.__pdefe, t = p.tumSecim, b = p.aktif(), g = b?.gorunum, sec = getSelection();
  const k = g?.sayfalar[g.gecerli - 1]?.el.querySelector(':scope > .textLayer');
  const katmanlar = g ? [...g.alan.querySelectorAll('.textLayer')] : [];
  return { gecerli: !!t?.gecerli(), sinif: !!g?.kok.classList.contains('tum-secili'), sayfa: g?.gecerli, secimUzunluk: sec.toString().length,
    capada: !!k && sec.rangeCount === 1 && k.contains(sec.anchorNode) && k.contains(sec.focusNode),
    baskaSayfa: katmanlar.some((x) => x !== k && sec.rangeCount && sec.getRangeAt(0).intersectsNode(x)), katman: katmanlar.length,
    yapilan: t?.is?.yapilan ?? null, toplamSayfa: t?.is?.sayfalar.length ?? null, bitti: !!t?.is?.bitti,
    bekleyen: t?.bekleyenler.size ?? null, bildirim: document.querySelector('#bildirim').hidden ? '' : document.querySelector('#bildirim').textContent }; })()`;

export default async function ({ evalJs, bekle, tus, tikla }) {
  const kosul = async (ifade, sure = 15000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(120); } };
  const durum = () => evalJs(DURUM);
  const kayit = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const panoKayitlari = async () => (await kayit()).filter((x) => x.kanal === 'pano:metin').map((x) => x.secenek);
  const kopyala = () => evalJs(`(() => { const dt = new DataTransfer(); const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true });
    document.dispatchEvent(ev); return { metin: dt.getData('text/plain'), turler: [...dt.types], engellendi: ev.defaultPrevented }; })()`);
  const odakBelgede = () => evalJs(`(document.activeElement?.blur?.(), window.__pdefe.aktif()?.gorunum.kaydirici.focus(), 1)`);
  const ctrlA = async () => { await odakBelgede(); await tus('a', ['ctrl']); await bekle(300); };
  const kapatHepsi = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); getSelection().removeAllRanges(); return p.belgeler.size; })()`);
  const ac = async (yol, secenek = {}) => {
    await evalJs(`window.__pdefe.dosyaAc(${J(yol)}, ${J(secenek)}).then(() => 1)`);
    await kosul(`[...window.__pdefe.belgeler.values()].some((b) => b.yol === ${J(yol)} && b.gorunum.hazir)`);
    await bekle(600);
  };
  const sayfaGit = async (n) => { await evalJs(`(window.__pdefe.aktif().gorunum.sayfayaGit(${n}, { aninda: true }), 1)`); await bekle(250); };
  const sayfaNoktasi = (n, fx, fy) => evalJs(`(() => { const g = window.__pdefe.aktif().gorunum, r = g.sayfalar[${n} - 1].el.getBoundingClientRect(), k = g.kaydirici.getBoundingClientRect();
    const ust = Math.max(r.top, k.top), alt = Math.min(r.bottom, k.bottom); return [Math.round(r.left + r.width * ${fx}), Math.round(ust + (alt - ust) * ${fy})]; })()`);
  // Belgenin metni çekirdekte (get_text): boşluklar tek boşluğa indirilerek sayılır (temizMetin de satır sonlarını boşluk yapar)
  const getTextUzunlugu = () => evalJs(`(async () => { const g = window.__pdefe.aktif().gorunum; let n = 0;
    for (const s of g.sayfalar) { if (s.bos) continue; const r = await window.pdefe.cagir('cekirdek:cagir', 'sayfa_metni', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa }, 1); n += r.metin.replace(/\\s+/g, ' ').trim().length + 1; }
    return n; })()`);
  // Gerçek fareyle sağ tık (menü test yanıtıyla kapanır): menünün öğeleri id → devre
  const sagTik = async (x, y) => {
    await kayit();
    await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'menu:popup', [null])`);
    await tikla(x, y, { dugme: 'right' }); await bekle(450);
    const ogeler = (await kayit()).filter((d) => d.kanal === 'menu:popup').at(-1)?.secenek;
    return ogeler ? Object.fromEntries(ogeler.filter((o) => o.id).map((o) => [o.id, !!o.devre])) : null;
  };

  for (const y of [TTK, TMK, MAKALE]) if (!fs.existsSync(y)) { console.log('Örnek PDF yok:', y); process.exitCode = 1; return; }
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), [path.join(KOK, 'test', 'tanima_pdf_uret.py'), TANIMA], { stdio: 'ignore' });
  await kapatHepsi();
  await kayit();

  // ---------------------------------------------------------------- 1. Ctrl+A, hazır olmadan kopyalama, arayüz donmuyor
  console.log('— TTK (410 sayfa): Ctrl+A ve hazır olmadan kopyalama');
  await ac(TTK);
  await ac(MAKALE, { arkaPlanda: true });
  await sayfaGit(1);   // kaldığı sayfadan açılmış olabilir
  await kosul(`(${boya(1)}) !== null && (${boya(2)}) !== null`, 10000);
  // Ölçüm: olay döngüsünün en uzun boşluğu (setInterval 20 ms) ve çekirdeğe ping'in en uzun yanıtı, kopyalama sürerken
  await evalJs(`(() => { const o = window.__olcum = { bosluk: 0, ping: [], son: performance.now(), sur: true };
    o.z = setInterval(() => { const t = performance.now(); o.bosluk = Math.max(o.bosluk, t - o.son); o.son = t; }, 20);
    (async () => { while (o.sur) { const t = performance.now(); await window.pdefe.cagir('cekirdek:cagir', 'ping', {}, 1); o.ping.push(performance.now() - t); await new Promise((r) => setTimeout(r, 150)); } })();
    return 1; })()`);
  await ctrlA();
  const d1 = await durum();
  sonuc('Ctrl+A: bütün belge seçili, görünüm kökünde tum-secili', d1.gecerli && d1.sinif, d1);
  sonuc('Ctrl+A: tarayıcı seçimi yalnızca geçerli sayfada (çapa), başka sayfa DOM\'da seçilmez', d1.capada && !d1.baskaSayfa && d1.secimUzunluk > 200, d1);
  sonuc('Ctrl+A anında metin arka planda hazırlanmaya başladı (boş sayfalar hariç 410 sayfa)', d1.toplamSayfa === 410 && d1.yapilan !== null && !d1.bitti, d1);
  const b1 = await evalJs(boya(1)), b2 = await evalJs(boya(2));
  sonuc('Geçerli sayfanın (çapa) metin öğeleri seçim renginde, tarayıcı seçimi boyanmaz (iki kat koyulaşmaz)', b1 && b1.oge > 20 && J(b1.renkler) === J([SECIM_RENGI]) && b1.secimRengi === SAYDAM, b1);
  sonuc('Sonraki sayfanın (seçimin dışında) metin öğeleri de seçim renginde', b2 && b2.oge > 20 && J(b2.renkler) === J([SECIM_RENGI]), b2);
  const k1 = await kopyala();
  const d1b = await durum();
  sonuc('Hazır olmadan kopyalama: olay işlendi, pano boşaltılır (eski içerik yapıştırılmasın)', k1.engellendi && k1.metin === '' && k1.turler.includes('text/plain'), k1);
  sonuc('Hazır olmadan kopyalama: "Metin hazırlanıyor (N/410)" bildirimi', /^Metin hazırlanıyor \(\d+\/410\)… Durdurmak için Esc$/.test(d1b.bildirim), d1b.bildirim);
  // Kopyalama sürerken seçim kalkar (sayfaya tık): kopyalama sürer
  await tikla(...(await sayfaNoktasi(1, 0.5, 0.5))); await bekle(200);
  const d1c = await durum();
  sonuc('Kopyalama sürerken sayfaya tıklama seçimi kaldırır, kopyalama sürer', !d1c.gecerli && !d1c.sinif && d1c.bekleyen === 1, d1c);
  await evalJs(`(window.__pdefe.aktif().gorunum.sayfayaGit(300, { aninda: true }), 1)`);
  const gitti = await kosul(`window.__pdefe.aktif().gorunum.gecerli === 300 && document.querySelector('#sayfa-kutusu').value === '300'`, 3000);
  sonuc('Kopyalama sürerken arayüz çalışıyor (300. sayfaya gidildi, sayfa kutusu güncel)', !!gitti);
  const t0 = Date.now();
  const bitti = await kosul(`window.__pdefe.tumSecim?.bekleyenler.size === 0`, 60000);
  const sure = Date.now() - t0;
  const olcum = await evalJs(`(() => { const o = window.__olcum; o.sur = false; clearInterval(o.z); return { bosluk: Math.round(o.bosluk), pingEnUzun: Math.round(Math.max(...o.ping)), pingSayisi: o.ping.length }; })()`);
  console.log(`     ölçüm: kalan hazırlık ${sure} ms, olay döngüsünde en uzun boşluk ${olcum.bosluk} ms, ping en uzun ${olcum.pingEnUzun} ms (${olcum.pingSayisi} ping)`);
  sonuc('Kopyalama sürerken çekirdek yanıt veriyor (ping < 500 ms) ve arayüz donmuyor (olay döngüsünde en uzun boşluk < 400 ms)', !!bitti && olcum.pingEnUzun < 500 && olcum.bosluk < 400 && olcum.pingSayisi >= 3, olcum);
  const pano1 = await panoKayitlari();
  const gt = await getTextUzunlugu();
  const p1 = pano1.at(-1);
  sonuc('Hazır olunca panoya bir kez, koşullu yazıldı (bu arada başka şey kopyalandıysa ezmez)', pano1.length === 1 && p1.kosullu, pano1);
  sonuc(`Panoya yazılan metnin uzunluğu çekirdeğin get_text'ine yakın (%3; ${p1?.uzunluk} / ${gt})`, p1 && Math.abs(p1.uzunluk - gt) / gt < 0.03, { pano: p1?.uzunluk, gt });
  sonuc('Metin belgenin başından başlıyor', /^TÜRK TİCARET KANUNU/.test(p1?.bas || ''), p1?.bas);
  const d1d = await durum();
  sonuc('Bitince "Belgenin metni kopyalandı (410 sayfa)" bildirimi', d1d.bildirim === 'Belgenin metni kopyalandı (410 sayfa)', d1d.bildirim);

  // ---------------------------------------------------------------- 2. Hazırken kopyalama, sonradan kurulan katman
  console.log('— Hazırken kopyalama, kaydırınca kurulan katman');
  await sayfaGit(1);
  await ctrlA();
  const hazir = await kosul(`window.__pdefe.tumSecim?.is?.bitti`, 5000);
  sonuc('İkinci Ctrl+A: sayfaların metni önbellekten, hazırlık hemen biter', !!hazir);
  const k2 = await kopyala();
  sonuc('Hazırken kopyalama: metin doğrudan panoya (aynı uzunluk), ayrıca pano:metin yok', k2.engellendi && k2.metin.length === p1?.uzunluk && (await panoKayitlari()).length === 0, { uzunluk: k2.metin.length, beklenen: p1?.uzunluk });
  const katman0 = (await durum()).katman;
  await sayfaGit(200);
  await kosul(`(${boya(200)}) !== null`, 10000);
  const b200 = await evalJs(boya(200)), d2 = await durum();
  sonuc('200. sayfaya gidince kurulan katmanın öğeleri de seçim renginde', b200 && b200.oge > 20 && J(b200.renkler) === J([SECIM_RENGI]), b200);
  sonuc('Kaydırınca seçim sürer; uzaktaki katmanlar yine boşaltılır (yalnızca çapa tutulur)', d2.gecerli && d2.sinif && d2.katman <= katman0 + 6, { d2, katman0 });
  sonuc('Uzaktaki sayfadan da kopyalama bütün belgeyi verir', (await kopyala()).metin.length === p1?.uzunluk);
  // Koyulaştırılmış sayfa
  await evalJs(`(window.__pdefe.aktif().gorunum.koyuSayfaAyarla(true), 1)`); await bekle(200);
  const bk = await evalJs(boya(200));
  sonuc('Koyulaştırılmış sayfada koyu sayfanın seçim rengi', bk && J(bk.renkler) === J([KOYU_SECIM_RENGI]), bk);
  await evalJs(`(window.__pdefe.aktif().gorunum.koyuSayfaAyarla(false), 1)`); await bekle(200);

  // ---------------------------------------------------------------- 3. Sağ tık menüsü, Ctrl+F
  console.log('— Sağ tık menüsü ve Ctrl+F');
  // 1. sayfanın alt çeyreği ve 2. sayfanın üstü görünür (çapa 1. sayfada)
  const ikiSayfa = async () => { await evalJs(`(window.__pdefe.aktif().gorunum.sayfayaGit(1, { oran: 0.75, aninda: true }), 1)`); await bekle(400); };
  await ikiSayfa();
  const m1 = await sagTik(...(await sayfaNoktasi(2, 0.5, 0.5)));
  const d3 = await durum();
  sonuc('Sağ tık (çapanın dışındaki sayfada): Kopyala etkin, Vurgula ve Ara soluk, Not ekle ve Tümünü seç etkin', m1 && !m1.kopyala && m1.vurgula && m1.ara && !m1.not && !m1.tumunuSec, m1);
  sonuc('Sağ tıktan sonra bütün belge hâlâ seçili', d3.gecerli && d3.sinif, d3);
  const m2 = await sagTik(...(await sayfaNoktasi(1, 0.5, 0.5)));
  sonuc('Sağ tık (çapa sayfasında): Kopyala etkin, Vurgula ve Ara soluk', m2 && !m2.kopyala && m2.vurgula && m2.ara, m2);
  // macOS'ta sağ tık seçimin dışındaki sözcüğü seçer (Chromium), sonra menü olayı gelir: çapa yeniden kurulur, Kopyala bütün belgeyi kopyalar.
  // Windows'ta aynı sıra sahte olaylarla (sağ tuşa basış, sözcüğün seçilmesi, contextmenu; eş zamanlı)
  await kayit();
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'menu:popup', [null])`);
  await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum, sp = g.sayfalar[1].el.querySelector(':scope > .textLayer span[role="presentation"]');
    const r = sp.getBoundingClientRect(), x = r.left + 2, y = r.top + r.height / 2;
    g.alan.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, bubbles: true, cancelable: true, clientX: x, clientY: y }));
    const w = document.createRange(); w.setStart(sp.firstChild, 0); w.setEnd(sp.firstChild, Math.min(3, sp.firstChild.length));
    getSelection().removeAllRanges(); getSelection().addRange(w);
    sp.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true, clientX: x, clientY: y }));
    return 1; })()`);
  await bekle(450);
  const mMac = (await kayit()).filter((d) => d.kanal === 'menu:popup').at(-1)?.secenek;
  const mm = mMac && Object.fromEntries(mMac.filter((o) => o.id).map((o) => [o.id, !!o.devre]));
  const dMac = await durum();
  sonuc('Sağ tık sözcüğü seçse de (macOS): Kopyala etkin, Vurgula ve Ara soluk, bütün belge seçili ve çapa yerinde', mm && !mm.kopyala && mm.vurgula && mm.ara && dMac.gecerli && dMac.sinif && dMac.capada, { mm, dMac });
  // Bul'a önce başka bir sözcük yazılır; Ctrl+A'dan sonra Ctrl+F onu korur (seçimden, çapa sayfasının ilk satırıyla doldurmaz)
  await evalJs(`(window.__pdefe.arama.ac('zamanaşımı'), 1)`); await bekle(300);
  await tus('Escape'); await bekle(200);
  await ctrlA();
  await evalJs(`(window.__pdefe.komutCalistir('duzen.bul'), 1)`); await bekle(400);   // menüdeki Bul (Ctrl+F) gibi: komut seçimden doldurur
  const bul = await evalJs(`({ deger: document.querySelector('#bul-girdi').value, acik: !document.querySelector('#bul-kutusu').hidden })`);
  sonuc('Ctrl+A\'dan sonra Ctrl+F Bul\'u seçimden doldurmaz', bul.acik && bul.deger === 'zamanaşımı', bul);
  await tus('Escape'); await bekle(250);
  await odakBelgede();
  // Seçim yokken sağ tık: Kopyala soluk (değişmedi)
  await ikiSayfa();
  await evalJs(`(getSelection().removeAllRanges(), 1)`); await bekle(100);
  const m3 = await sagTik(...(await sayfaNoktasi(1, 0.5, 0.5)));
  sonuc('Seçim yokken sağ tık: Kopyala, Vurgula, Ara soluk (değişmedi)', m3 && m3.kopyala && m3.vurgula && m3.ara, m3);

  // ---------------------------------------------------------------- 4. Seçimin kalkması
  console.log('— Seçimin kalkması');
  await ctrlA();
  await tikla(...(await sayfaNoktasi(1, 0.5, 0.5))); await bekle(250);
  let d4 = await durum();
  sonuc('Sayfaya tıklama bütün belge seçimini kaldırır', !d4.gecerli && !d4.sinif && d4.secimUzunluk === 0, d4);
  await ctrlA();
  await tus('Escape'); await bekle(250);
  d4 = await durum();
  sonuc('Esc bütün belge seçimini kaldırır (çapa sayfası da seçili kalmaz)', !d4.gecerli && !d4.sinif && d4.secimUzunluk === 0, d4);
  await ctrlA();
  await evalJs(`(() => { const k = window.__pdefe.aktif().gorunum.sayfalar[1].el.querySelector(':scope > .textLayer span[role="presentation"]');
    const r = document.createRange(); r.selectNodeContents(k); getSelection().removeAllRanges(); getSelection().addRange(r); return 1; })()`); await bekle(250);
  d4 = await durum();
  sonuc('Seçim başka bir yolla değişince (2. sayfada bir öğe seçildi) bütün belge seçimi kalkar', !d4.gecerli && !d4.sinif && d4.secimUzunluk > 0, d4);
  await ctrlA();
  const ttkId = await evalJs(`window.__pdefe.aktif().id`);
  await evalJs(`(window.__pdefe.sekmeSec([...window.__pdefe.belgeler.values()].find((b) => b.yol === ${J(MAKALE)}).id), 1)`); await bekle(400);
  d4 = await durum();
  const ttkSinif = await evalJs(`window.__pdefe.belgeler.get(${J(ttkId)}).gorunum.kok.classList.contains('tum-secili')`);
  sonuc('Sekme değişince bütün belge seçimi kalkar (önceki belgede sınıf ve çapa seçimi kalmaz)', !d4.gecerli && !ttkSinif && d4.secimUzunluk === 0, { d4, ttkSinif });
  // Sayfa düzeni (geçerli sayfayı döndürme) ve görünüm düzeni (kaydırmayı kapatma) değişimi
  await ctrlA();
  sonuc('Makalede Ctrl+A', (await durum()).gecerli);
  await evalJs(`window.__pdefe.komutCalistir('gorunum.dondur', 90)`); await bekle(500);
  d4 = await durum();
  sonuc('Sayfa düzeni değişince (sayfa döndürüldü) bütün belge seçimi kalkar', !d4.gecerli && !d4.sinif, d4);
  await evalJs(`window.__pdefe.komutCalistir('duzen.geriAl')`); await bekle(500);

  // ---------------------------------------------------------------- 5. Tek sayfa düzeni
  console.log('— Tek sayfa düzeni (kaydırma kapalı)');
  const duzen0 = await evalJs(`window.__pdefe.aktif().gorunum.duzen`);
  await ctrlA();
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.kaydirma'), 1)`); await bekle(600);
  d4 = await durum();
  const duzen1 = await evalJs(`window.__pdefe.aktif().gorunum.duzen`);
  sonuc('Görünüm düzeni değişince (kaydırma kapatıldı) bütün belge seçimi kalkar', duzen1 === 'tek' && !d4.gecerli && !d4.sinif, { duzen0, duzen1, d4 });
  await sayfaGit(3);
  await ctrlA();
  await kosul(`(${DURUM}).capada`, 5000);
  const d5 = await durum();
  sonuc('Tek sayfa düzeninde Ctrl+A: bütün belge seçili, çapa geçerli sayfada (3)', d5.gecerli && d5.sinif && d5.capada && d5.sayfa === 3, d5);
  await evalJs(`(window.__pdefe.aktif().gorunum.sonrakiSayfa(), 1)`);
  await kosul(`window.__pdefe.aktif().gorunum.gecerli === 4 && (${boya(4)}) !== null`, 8000);
  const b4 = await evalJs(boya(4)), d5b = await durum();
  sonuc('Tek sayfa düzeninde sonraki sayfaya geçince onun metni de seçim renginde, seçim sürer', b4 && b4.oge > 20 && J(b4.renkler) === J([SECIM_RENGI]) && d5b.gecerli, { b4, d5b });
  await kosul(`window.__pdefe.tumSecim?.is?.bitti`, 15000);
  const k5 = await kopyala();
  sonuc('Tek sayfa düzeninde kopya bütün makaleyi verir (ilk ve son sayfanın metni)', k5.metin.length > 20000 && /zamanaşımı/i.test(k5.metin.slice(0, 3000)), { uzunluk: k5.metin.length, bas: k5.metin.slice(0, 120) });
  // Geçerli sayfa boş (eklenmiş boş sayfa, metin katmanı yok) ve başka sayfa görünmüyor: çapasız seçim; yine bütün belge seçili ve kopyalanır
  const n0 = await evalJs(`window.__pdefe.aktif().gorunum.sayfalar.length`);
  await evalJs(`(async () => { const p = window.__pdefe, b = p.aktif(); await p.sayfaTarifiUygula(b, [{ kaynak: null, genislik: 595, yukseklik: 842 }, ...b.gorunum.tarif()]); return 1; })()`);
  await bekle(600);
  await sayfaGit(1);
  await ctrlA();
  await kosul(`window.__pdefe.tumSecim?.is?.bitti`, 15000);
  const d5c = await durum();
  sonuc('Boş sayfada Ctrl+A: çapasız, bütün belge seçili (sınıf), boş sayfa hazırlığa girmez', d5c.gecerli && d5c.sinif && d5c.sayfa === 1 && d5c.secimUzunluk === 0 && d5c.toplamSayfa === n0, { n0, d5c });
  const k5b = await kopyala();
  sonuc('Boş sayfada Ctrl+A: kopya yine bütün makale', k5b.engellendi && k5b.metin === k5.metin, { uzunluk: k5b.metin.length, beklenen: k5.metin.length });
  const m5 = await sagTik(...(await sayfaNoktasi(1, 0.5, 0.5)));
  sonuc('Boş sayfada sağ tık: Kopyala etkin, Vurgula ve Ara soluk', m5 && !m5.kopyala && m5.vurgula && m5.ara, m5);
  await evalJs(`window.__pdefe.komutCalistir('duzen.geriAl')`); await bekle(500);
  sonuc('Boş sayfa geri alındı', (await evalJs(`window.__pdefe.aktif().gorunum.sayfalar.length`)) === n0);
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.kaydirma'), 1)`); await bekle(400);
  sonuc('Kaydırma geri açıldı', (await evalJs(`window.__pdefe.aktif().gorunum.duzen`)) === duzen0);

  // ---------------------------------------------------------------- 6. Esc ve belgenin kapanması kopyalamayı durdurur
  console.log('— Kopyalamanın durdurulması (TMK)');
  await ac(TMK);
  await ctrlA();
  await kopyala();
  await bekle(150);
  const d6 = await durum();
  sonuc('TMK: hazır olmadan kopyalama sürüyor', d6.bekleyen === 1 && /^Metin hazırlanıyor/.test(d6.bildirim), d6);
  await tus('Escape'); await bekle(200);
  const d6b = await durum();
  sonuc('Esc kopyalamayı durdurur ("Kopyalama durduruldu"), seçim de kalkar', d6b.bekleyen === 0 && d6b.bildirim === 'Kopyalama durduruldu' && !d6b.gecerli && !d6b.sinif, d6b);
  await bekle(4000);
  sonuc('Durdurulan kopyalama panoya yazmaz', (await panoKayitlari()).length === 0);
  // Belge kapanınca
  await evalJs(`(async () => { const p = window.__pdefe; await p.belgeKapat(p.aktif().id, { zorla: true }); return 1; })()`);
  await ac(TMK);
  await ctrlA();
  await kopyala();
  await bekle(150);
  sonuc('TMK yeniden: kopyalama sürüyor', (await durum()).bekleyen === 1);
  await evalJs(`(async () => { const p = window.__pdefe; await p.belgeKapat(p.aktif().id, { zorla: true }); return 1; })()`);
  await bekle(200);
  const d6c = await evalJs(`({ bekleyen: window.__pdefe.tumSecim?.bekleyenler.size ?? null, bildirim: document.querySelector('#bildirim').textContent })`);
  sonuc('Belge kapanınca kopyalama durur', d6c.bekleyen === 0 && d6c.bildirim === 'Belge kapandığı için kopyalama durduruldu', d6c);
  await bekle(3000);
  sonuc('Kapanan belgenin metni panoya yazılmaz', (await panoKayitlari()).length === 0);

  // ---------------------------------------------------------------- 7. Taranmış örnek: tanınan yazı kopyada
  console.log('— Taranmış örnek (yazı tanıma)');
  await ac(TARANMIS);
  // Geçerli (1.) sayfada tanınan sözcükler katmana eklenene dek beklenir: çapa sayfasının katmanı seçiliyken yeniden kurulmaz
  const tanindi = await kosul(`[...(window.__pdefe.aktif().gorunum.sayfalar[0].el.querySelector(':scope > .textLayer')?.querySelectorAll('span') || [])].some((e) => e.textContent.trim() === 'DAİRESİ')`, 20000);
  sonuc('1. sayfanın görselindeki yazı tanındı (Türkçe tanıyıcı)', !!tanindi);
  await ctrlA();
  const bt = await evalJs(boya(1));
  sonuc('Tanınan sözcükler de seçim renginde', bt && J(bt.renkler) === J([SECIM_RENGI]), bt);
  await kosul(`window.__pdefe.tumSecim?.is?.bitti`, 30000);
  const kt = (await kopyala()).metin;
  sonuc('Kopyada taranmış sayfanın tanınan yazısı (1. sayfa)', /Borçlu hakkında yapılan takip kesinleşmiş olup haczi kabil malların bildirilmesi/.test(kt), kt.slice(0, 400));
  sonuc('Kopyada görselsiz sayfanın PDF metni (3. sayfa) ve kaşedeki tanınan yazı (5. sayfa)', /Bu sayfada görsel yok\./.test(kt) && /ASLI GİBİDİR/.test(kt) && /Karışık sayfanın PDF metni/.test(kt), kt);
  const sira = ['T.C. DENEME', 'Bu sayfada görsel yok', 'Karışık sayfanın'].map((s) => kt.indexOf(s));
  sonuc('Sayfalar belgedeki sırayla', sira.every((x, i) => x >= 0 && (i === 0 || x > sira[i - 1])), sira);

  await kapatHepsi();
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti`);
  if (hataSayisi) process.exitCode = 1;
}
