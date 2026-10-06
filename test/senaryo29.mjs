// Senaryo 29 (0.2.2, kullanıcı isteği): pencere kapatma sorusu. Pencerede iki ya da daha çok sekme varken (en az birinde belge açıkken)
// pencerenin kapatma düğmesi (×, Alt+F4, Mac'te kırmızı düğme) önce "Geçerli sekme / Tüm sekmeler / Vazgeç" sorar, altında "Bir daha
// sorma" kutusu. Kullanıcının sözü: "kaydet sorusuyla çakışmasın. önce geçerli sekme mi tüm sekmeler mi sorusu sorulsun. iki pencere
// açıkken de sorun çıkmasın. tekrar sorma butonu ekleyelim … ayarlardan değiştirilebilelim".
//   - soru tek sekmede ve yalnızca açılış sekmeleri varken çıkmaz; iletisi, düğmeleri, Enter = Tüm sekmeler, Esc / Vazgeç hiçbir şey yapmaz
//   - Geçerli sekme yalnızca etkin sekmeyi kapatır, pencere açık kalır; değişmiş belgede kaydetme sorusu ARDINDAN gelir (iki kutu hiçbir
//     zaman aynı anda açık değil), orada Vazgeç sekmeyi açık bırakır; etkin sekme açılış sekmesiyse o kapanır; açık araç penceresi önce
//   - Tüm sekmeler bugünkü akış (değişmeyenler sorusuz kapanır, kaydedilmemişler tek tek sorulur)
//   - Bir daha sorma: Geçerli sekme / Tüm sekmeler seçilince ayara yazılır ve sonraki kapatmada soru çıkmaz; Vazgeç'te yazılmaz; bilinmeyen
//     ayar değeri "Her seferinde sor" sayılır
//   - Ayarlar › Açılış ve düzen › Pencere › "Pencereyi kapatırken": değeri gösterir, değiştirir, ayar dışarıdan değişince güncellenir,
//     "Varsayılanlara dön" "Her seferinde sor"a döndürür
//   - iki pencere: soru yalnızca kapatılan pencerede, yalnızca onun sekmeleri; ayar öbür pencereye (ve açık Ayarlar kartına) geçer
//   - Çıkış'tan gelen kapatmada (cikis: true: Dosya › Çıkış, ⌘Q, Windows oturum sonu) soru yok; soru açıkken Çıkış gelirse soru "Tüm
//     sekmeler" olarak kapanır ve akış sürer ("Bir daha sorma" yazılmaz); Geçerli sekmenin kaydetme sorusu açıkken Çıkış gelirse sekme
//     kapanınca pencere de kapanır; soru açıkken ikinci olağan kapatma isteği yalnızca kutuyu belirginleştirir
//   - güncelleme kurulumunun kapatma izni süren kaydı beklerken × kapsam sorusu açmaz, aynı izni bekler (bağımsız inceleme, 14b)
//   - görünmeyen masaüstündeki örnekte gerçek Windows kapatma iletisi (× / Alt+F4'ün SC_CLOSE'u, WM_CLOSE; test/pencere_kapat.ps1)
//   - son adım: soru açıkken Dosya › Çıkış (test:cik) → soru kapanır, kaydetme sorusunda Kaydetme → uygulama kapanır (Çıkış takılmaz)
// Kullanım (temiz veri klasörlü örnek; ekran dışı ya da görünmeyen masaüstü):
//   powershell -File test\baslat.ps1 -Port 9542 -Veri "$env:TEMP\pdefe-s29-9542"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9542; $env:PDEFE_TEST_PID=<PID>; node test\surucu.mjs betik test\senaryo29.mjs
// Görünmeyen masaüstünde (baslat_gizli.ps1) ayrıca $env:S29_GIZLI="1": kapatma iletisi Windows'tan da gönderilir. Son adım örneği kapatır.
// Girdiler test/cikti/s29/pdf altında (test/pdf'teki en küçük PDF'in kopyaları).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(KOK, 'test', 'cikti', 's29', 'pdf');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const PID = process.env.PDEFE_TEST_PID || '';
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, tamam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (ok) tamam++; else hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};
const bilgi = (m) => console.log('     ' + m);

const SORU_DUGMELERI = ['Geçerli sekme', 'Tüm sekmeler', 'Vazgeç'];
const sekmeSorusuMu = (k) => !!k && /^Bu pencerede \d+ sekme açık\.$/.test(k.ileti || '') && J(k.dugmeler) === J(SORU_DUGMELERI);
const kaydetSorusuMu = (k, ad) => !!k && k.ileti === `"${ad}" belgesinde kaydedilmemiş değişiklikler var.` && J(k.dugmeler) === J(['Kaydet', 'Kaydetme', 'Vazgeç']);
const KUTU = `(() => { const hepsi = document.querySelectorAll('.mesaj-kutusu'), k = [...hepsi].at(-1); if (!k) return null;
  const o = document.activeElement;
  return { sayi: hepsi.length, ileti: k.querySelector('.mesaj-ileti')?.textContent, ayrinti: k.querySelector('.mesaj-ayrinti')?.textContent || '',
    dugmeler: [...k.querySelectorAll('.dugmeler button')].map((b) => b.textContent), odak: o?.tagName === 'BUTTON' ? o.textContent : o?.tagName,
    onay: k.querySelector('.mesaj-onay span')?.textContent || null, onayIsaretli: !!k.querySelector('.mesaj-onay input')?.checked,
    dikkat: k.classList.contains('dikkat'), birincil: k.querySelector('.dugmeler button.birincil')?.textContent }; })()`;
const KART = `(() => { const k = [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((x) => x.querySelector('.ayar-baslik')?.textContent === 'Pencereyi kapatırken');
  if (!k) return null; const s = k.querySelector('select'); let h3 = null;
  for (let e = k.previousElementSibling; e; e = e.previousElementSibling) if (e.tagName === 'H3') { h3 = e.textContent; break; }
  return { h3, aciklama: k.querySelector('.ayar-aciklama')?.textContent || '', deger: s?.value, secenekler: [...(s?.options || [])].map((o) => [o.value, o.textContent]),
    sonKart: [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].at(-1) === k }; })()`;

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, tus, hedefler, hedefSec }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  // ---- pencereler (senaryo22'deki gibi): ana süreçteki kimlik → CDP hedefi
  let harita = new Map(), secili = null;
  const yenile = async () => {
    const m = new Map();
    for (const h of await hedefler()) { hedefSec(h.id); try { m.set(await evalJs(`window.pdefe.cagir('pencere:kimlik')`), h.id); } catch { /* kapanıyor */ } }
    harita = m;
    if (!m.has(secili)) secili = [...m.keys()][0] ?? null;
    hedefSec(m.get(secili) || null);
    return [...m.keys()].sort((a, b) => a - b);
  };
  const P = (kimlik) => { if (!harita.has(kimlik)) throw new Error('Pencere yok: ' + kimlik); secili = kimlik; hedefSec(harita.get(kimlik)); };
  const ana = (kanal, ...args) => evalJs(`window.pdefe.cagir(${J(kanal)}, ...${J(args)})`);
  const yeniPencere = async (once) => {
    const t0 = Date.now();
    for (;;) {
      const yeni = (await yenile()).find((k) => !once.includes(k)) ?? null;
      if (yeni != null && (await ana('test:pencereler')).find((p) => p.id === yeni)?.gorunur) return yeni;
      if (Date.now() - t0 > 12000) return null;
      await bekle(150);
    }
  };
  const pencereKapandi = async (kimlik, sure = 8000) => { const t0 = Date.now(); for (;;) { if (!(await yenile()).includes(kimlik)) return true; if (Date.now() - t0 > sure) return false; await bekle(200); } };
  // ---- sekmeler ve belgeler
  const sekmeAdlari = () => evalJs(`window.__pdefe.sekmeler.sekmeler.map((s) => s.ad + (s.degisti ? '*' : ''))`);
  const aktifAd = () => evalJs(`window.__pdefe.sekmeler.bul(window.__pdefe.sekmeler.aktifId)?.ad || null`);
  const ac = (...adlar) => evalJs(`(async () => { const p = window.__pdefe; for (const ad of ${J(adlar)}) { const b = await p.dosyaAc(${J(PDF + path.sep)} + ad);
    for (let i = 0; i < 100 && b && !b.gorunum.hazir; i++) await new Promise((r) => setTimeout(r, 50)); } await new Promise((r) => setTimeout(r, 300)); return true; })()`);
  const kirlet = (ad) => evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${J(ad)}); await p.sayfalariDondur(b, [1], 90, 'Sayfayı döndür'); await new Promise((r) => setTimeout(r, 300)); return b.degisti; })()`);
  const sekmeSec = (ad) => evalJs(`(async () => { const p = window.__pdefe; const s = p.sekmeler.sekmeler.find((x) => x.ad === ${J(ad)}); await p.sekmeSec(s.id); return true; })()`);
  const komut = (id, veri) => evalJs(`(window.__pdefe.komutCalistir(${J(id)}${veri === undefined ? '' : ', ' + J(veri)}), new Promise((r) => setTimeout(() => r(true), 300)))`);
  const sifirla = () => evalJs(`(async () => { const p = window.__pdefe; document.querySelectorAll('.arac-ortusu').forEach((e) => e.remove()); for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true });
    for (const s of p.sekmeler.sekmeler.slice(1)) p.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 200)); return p.sekmeler.sekmeler.length; })()`);
  const tasi = (ad, hedef) => evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${J(ad)}); return await p.sekmeyiTasi(b.id, ${J(hedef)}); })()`);
  // ---- mesaj kutusu
  const kutu = () => evalJs(KUTU);
  const kutuBekle = async (f = () => true, sure = 6000) => { const t0 = Date.now(); for (;;) { const k = await kutu(); if (k && f(k)) return k; if (Date.now() - t0 > sure) return k; await bekle(100); } };
  const kutuYok = () => kosul(`!document.querySelector('.mesaj-kutusu')`, 5000);
  const merkez = async (sec) => JSON.parse(await evalJs(`(() => { const e = ${sec}; if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`));
  /** En üstteki kutunun düğmesine gerçek fare tıklaması. */
  const kutuDugmesi = async (metin) => { const m = await merkez(`[...[...document.querySelectorAll('.mesaj-kutusu')].at(-1)?.querySelectorAll('.dugmeler button') || []].find((b) => b.textContent === ${J(metin)})`); if (!m) throw new Error('Düğme yok: ' + metin); await tikla(...m); await bekle(350); };
  const onayTikla = async () => { const m = await merkez(`[...document.querySelectorAll('.mesaj-kutusu')].at(-1)?.querySelector('.mesaj-onay input')`); if (!m) throw new Error('Onay kutusu yok'); await tikla(...m); await bekle(150); };
  const kapatIstegi = (cikis = false) => ana('test:olayGonder', 'pencere:kapatIstegi', ...(cikis ? [{ cikis: true }] : []));
  // Aynı anda açık kutu sayısının en büyüğü (iki soru hiçbir zaman üst üste açılmamalı)
  const gozcuKur = () => evalJs(`(() => { if (!window.__s29Gozcu) { window.__s29Gozcu = new MutationObserver(() => { window.__s29EnFazla = Math.max(window.__s29EnFazla || 0, document.querySelectorAll('.mesaj-kutusu').length); });
    window.__s29Gozcu.observe(document.body, { childList: true }); } window.__s29EnFazla = 0; return true; })()`);
  const enFazlaKutu = () => evalJs(`window.__s29EnFazla || 0`);
  // ---- ayar
  const ayarYerel = () => evalJs(`window.__pdefe.ayar().pencereKapatma`);
  const ayarDepo = () => ana('ayar:al', 'pencereKapatma');
  const ayarKoy = (v) => evalJs(`(async () => { window.__pdefe.ayar().pencereKapatma = ${J(v)}; await window.pdefe.cagir('ayar:koy', 'pencereKapatma', ${J(v)}); return true; })()`);
  const ayarlarAc = async (bolum) => { await evalJs(`(window.__pdefe.komutCalistir('duzen.ayarlar', ${J(bolum)}), true)`); await kosul(`!!document.querySelector('.ayarlar-ortusu .ayar-kart')`); await bekle(200); };
  const ayarlarKapat = async () => { await evalJs(`(document.querySelector('.ayarlar-ortusu [data-id="kapat2"]')?.click(), true)`); await kosul(`!document.querySelector('.ayarlar-ortusu')`); };
  const kart = () => evalJs(KART);
  const kartSec = (v) => evalJs(`(() => { const k = [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((x) => x.querySelector('.ayar-baslik')?.textContent === 'Pencereyi kapatırken'); const s = k.querySelector('select'); s.value = ${J(v)}; s.dispatchEvent(new Event('change')); return true; })()`);
  // ---- konsol hataları (her pencerede; kapanacak pencerenin hataları kapanmadan okunur)
  const hatalar = [];
  const hatalariTopla = () => evalJs(`(() => { if (!window.__s29Hatalar) { window.__s29Hatalar = []; addEventListener('error', (e) => window.__s29Hatalar.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__s29Hatalar.push(String(e.reason?.message || e.reason))); } return true; })()`);
  const hatalariOku = async () => { hatalar.push(...JSON.parse(await evalJs(`JSON.stringify((window.__s29Hatalar || []).splice(0))`))); };
  const pencereKapat = (ileti, baslik) => {
    try {
      return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'pencere_kapat.ps1'), '-Port', String(PORT), '-SurecNo', String(PID), '-Ileti', ileti, '-Baslik', baslik]).toString('utf8').trim();
    } catch (e) { return 'HATA ' + e.message; }
  };

  // ================================================================ hazırlık
  fs.mkdirSync(PDF, { recursive: true });
  const kaynak = fs.readdirSync(path.join(KOK, 'test', 'pdf')).filter((a) => /\.pdf$/i.test(a)).map((a) => path.join(KOK, 'test', 'pdf', a))
    .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size)[0];
  if (!kaynak) throw new Error('test/pdf altında PDF yok');
  for (const ad of ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']) fs.copyFileSync(kaynak, path.join(PDF, ad));
  let kimlikler = await yenile();
  if (kimlikler.length !== 1) throw new Error('Test tek pencereli, temiz bir örnekle başlamalı.');
  const P1 = kimlikler[0];
  P(P1);
  await hatalariTopla(); await gozcuKur();
  await tus('Escape');
  await sifirla();

  // ================================================================ 1) varsayılan
  sonuc('Ayar varsayılanı "Her seferinde sor" (pencereKapatma: sor; pencerede ve depoda)', (await ayarYerel()) === 'sor' && (await ayarDepo()) === 'sor', { yerel: await ayarYerel(), depo: await ayarDepo() });

  // ================================================================ 2) tek sekme: soru yok
  await ac('a.pdf'); await kirlet('a.pdf');
  await kapatIstegi();
  let k = await kutuBekle();
  sonuc('Tek sekmeli pencere: sekme sorusu çıkmaz, doğrudan kaydetme sorusu', kaydetSorusuMu(k, 'a.pdf'), k);
  await kutuDugmesi('Vazgeç'); await kutuYok();
  sonuc('Kaydetme sorusunda Vazgeç: pencere ve sekme açık', J(await sekmeAdlari()) === J(['a.pdf*']) && (await yenile()).includes(P1), await sekmeAdlari());
  await sifirla();

  // ================================================================ 3) iki sekme: soru, biçimi; Esc ve Vazgeç hiçbir şey yapmaz
  await ac('a.pdf', 'b.pdf');
  await kapatIstegi();
  k = await kutuBekle(sekmeSorusuMu);
  sonuc('İki sekmede kapatma isteği: "Geçerli sekme / Tüm sekmeler / Vazgeç" sorusu', sekmeSorusuMu(k) && k.ileti === 'Bu pencerede 2 sekme açık.', k);
  sonuc('Açıklama geçerli sekmenin adını ve pencerenin bütün sekmeleriyle kapanacağını söyler (kaydedilmemiş yokken kaydetme notu yok)',
    /"b\.pdf"/.test(k?.ayrinti) && /bu pencere bütün sekmeleriyle/.test(k?.ayrinti) && !/Kaydedilmemiş/.test(k?.ayrinti), k?.ayrinti);
  sonuc('"Bir daha sorma" onay kutusu işaretsiz; varsayılan (Enter, odak) "Tüm sekmeler"', k?.onay === 'Bir daha sorma' && !k.onayIsaretli && k.odak === 'Tüm sekmeler' && k.birincil === 'Tüm sekmeler', k);
  await tus('Escape'); await kutuYok();
  sonuc('Esc = Vazgeç: kutu kapanır, sekmeler ve pencere olduğu gibi', !(await kutu()) && J(await sekmeAdlari()) === J(['a.pdf', 'b.pdf']) && (await yenile()).includes(P1), await sekmeAdlari());
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu);
  await kutuDugmesi('Vazgeç'); await kutuYok();
  sonuc('Vazgeç düğmesi hiçbir şey yapmaz (sekmeler, pencere, ayar)', J(await sekmeAdlari()) === J(['a.pdf', 'b.pdf']) && (await yenile()).includes(P1) && (await ayarYerel()) === 'sor');

  // ================================================================ 4) soru açıkken ikinci olağan kapatma isteği
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu);
  await evalJs(`(document.querySelector('.mesaj-kutusu').classList.remove('dikkat'), true)`);
  await kapatIstegi(); await bekle(400);
  k = await kutu();
  sonuc('Soru açıkken ikinci kapatma isteği (× yeniden): ikinci kutu açılmaz, soru belirginleşir', k?.sayi === 1 && sekmeSorusuMu(k) && k.dikkat, k);
  await tus('Escape'); await kutuYok();

  // ================================================================ 5) Enter = Tüm sekmeler: bugünkü akış (değişmeyen sorusuz kapanır, sonra kaydetme sorusu)
  await kirlet('b.pdf');
  await kapatIstegi(); k = await kutuBekle(sekmeSorusuMu);
  sonuc('Kaydedilmemiş belge varken açıklamada kaydetme sorusunun ardından geleceği yazar', /Kaydedilmemiş değişiklikler ardından sorulur\./.test(k?.ayrinti), k?.ayrinti);
  await gozcuKur();
  await tus('Enter');
  k = await kutuBekle((x) => kaydetSorusuMu(x, 'b.pdf'));
  sonuc('Enter = Tüm sekmeler: değişmeyen a.pdf sorusuz kapandı, ardından b.pdf\'in kaydetme sorusu', kaydetSorusuMu(k, 'b.pdf') && J(await sekmeAdlari()) === J(['b.pdf*']), { k, sekmeler: await sekmeAdlari() });
  sonuc('Tüm sekmeler: iki soru aynı anda açık değil', (await enFazlaKutu()) === 1, await enFazlaKutu());
  await kutuDugmesi('Vazgeç'); await kutuYok();
  sonuc('Kaydetme sorusunda Vazgeç: pencere açık, değişen belge duruyor', J(await sekmeAdlari()) === J(['b.pdf*']) && (await yenile()).includes(P1), await sekmeAdlari());

  // ================================================================ 6) Geçerli sekme: yalnızca etkin sekme kapanır, pencere açık kalır
  await ac('a.pdf', 'c.pdf');   // b*, a, c (etkin c)
  await kapatIstegi(); k = await kutuBekle(sekmeSorusuMu);
  sonuc('Üç sekme: "Bu pencerede 3 sekme açık.", geçerli sekme c.pdf', k?.ileti === 'Bu pencerede 3 sekme açık.' && /"c\.pdf"/.test(k.ayrinti), k);
  await kutuDugmesi('Geçerli sekme'); await bekle(400);
  sonuc('Geçerli sekme (değişmemiş c.pdf): yalnızca c.pdf kapandı, öteki sekmeler ve pencere açık, soru kalmadı',
    J(await sekmeAdlari()) === J(['b.pdf*', 'a.pdf']) && !(await kutu()) && (await yenile()).includes(P1), await sekmeAdlari());

  // ================================================================ 7) Geçerli sekme, değişmiş belge: kaydetme sorusu ardından
  const bYolu = path.join(PDF, 'b.pdf'), bOnce = fs.statSync(bYolu).mtimeMs;
  await sekmeSec('b.pdf');
  await gozcuKur();
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu);
  await kutuDugmesi('Geçerli sekme');
  k = await kutuBekle((x) => kaydetSorusuMu(x, 'b.pdf'));
  sonuc('Geçerli sekme (değişmiş b.pdf): sekme sorusundan sonra b.pdf\'in kaydetme sorusu', kaydetSorusuMu(k, 'b.pdf') && k.sayi === 1, k);
  await kutuDugmesi('Vazgeç'); await kutuYok();
  sonuc('Kaydetme sorusunda Vazgeç: b.pdf açık ve değişmiş, a.pdf ve pencere açık', J(await sekmeAdlari()) === J(['b.pdf*', 'a.pdf']) && (await yenile()).includes(P1), await sekmeAdlari());
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu); await kutuDugmesi('Geçerli sekme');
  await kutuBekle((x) => kaydetSorusuMu(x, 'b.pdf')); await kutuDugmesi('Kaydetme'); await kutuYok(); await bekle(300);
  sonuc('Kaydetme: yalnızca b.pdf kapandı (dosyaya yazılmadı), a.pdf ve pencere açık',
    J(await sekmeAdlari()) === J(['a.pdf']) && (await yenile()).includes(P1) && fs.statSync(bYolu).mtimeMs === bOnce, await sekmeAdlari());
  sonuc('Geçerli sekme: iki soru aynı anda açık değil', (await enFazlaKutu()) === 1, await enFazlaKutu());

  // ================================================================ 8) etkin sekme açılış sekmesi
  await komut('sekme.yeni');
  await kapatIstegi(); k = await kutuBekle(sekmeSorusuMu);
  sonuc('Belge + açılış sekmesi: soru çıkar, geçerli sekme "Yeni sekme"', k?.ileti === 'Bu pencerede 2 sekme açık.' && /"Yeni sekme"/.test(k.ayrinti), k);
  await kutuDugmesi('Geçerli sekme'); await bekle(400);
  sonuc('Geçerli sekme açılış sekmesiyse o kapanır, belge kalır ve etkin olur', J(await sekmeAdlari()) === J(['a.pdf']) && (await aktifAd()) === 'a.pdf' && (await yenile()).includes(P1), await sekmeAdlari());

  // ================================================================ 9) Bir daha sorma + Geçerli sekme: ayar yazılır, sonra soru yok
  await ac('b.pdf');
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu);
  await onayTikla();
  sonuc('Onay kutusuna tıklanınca işaretlenir', (await kutu())?.onayIsaretli === true);
  await kutuDugmesi('Geçerli sekme'); await bekle(400);
  sonuc('Bir daha sorma + Geçerli sekme: b.pdf kapandı, ayar "sekme" (pencerede ve depoda)',
    J(await sekmeAdlari()) === J(['a.pdf']) && (await ayarYerel()) === 'sekme' && (await ayarDepo()) === 'sekme', { sekmeler: await sekmeAdlari(), yerel: await ayarYerel(), depo: await ayarDepo() });
  await ac('b.pdf'); await gozcuKur();
  await kapatIstegi(); await bekle(800);
  sonuc('Ayar "Yalnızca geçerli sekmeyi kapat": soru çıkmadan etkin b.pdf kapandı, pencere açık',
    J(await sekmeAdlari()) === J(['a.pdf']) && (await enFazlaKutu()) === 0 && (await yenile()).includes(P1), { sekmeler: await sekmeAdlari(), kutu: await enFazlaKutu() });
  await ac('b.pdf'); await kirlet('b.pdf');
  await kapatIstegi(); k = await kutuBekle();
  sonuc('Ayar "sekme", değişmiş etkin belge: sekme sorusu yok, kaydetme sorusu var', kaydetSorusuMu(k, 'b.pdf') && k.sayi === 1, k);
  await kutuDugmesi('Kaydetme'); await kutuYok(); await bekle(300);
  sonuc('Kaydetme: yalnızca b.pdf kapandı', J(await sekmeAdlari()) === J(['a.pdf']), await sekmeAdlari());
  // Tek sekmede "sekme" ayarı da pencereyi kapatır (tek sekme kapatılamaz): burada sınanmaz, pencere kapanırdı (bkz. 15)

  // ================================================================ 10) Ayarlar kartı
  await ayarlarAc('acilis');
  let kb = await kart();
  sonuc('Ayarlar › Açılış ve düzen: "Pencere" başlığı altında son kart "Pencereyi kapatırken", üç seçenek',
    kb?.h3 === 'Pencere' && kb.sonKart && J(kb.secenekler) === J([['sor', 'Her seferinde sor'], ['sekme', 'Yalnızca geçerli sekmeyi kapat'], ['pencere', 'Bütün sekmeleri kapat']]), kb);
  sonuc('Kart güncel değeri gösteriyor ("Yalnızca geçerli sekmeyi kapat")', kb?.deger === 'sekme', kb?.deger);
  sonuc('Açıklama (Windows) kapatma düğmesini (×) ve Alt+F4\'ü anar, kaydedilmemiş değişikliklerin yine sorulacağını söyler',
    /\(×\)/.test(kb?.aciklama) && /Alt\+F4/.test(kb?.aciklama) && /Kaydedilmemiş değişiklikler her durumda sorulur/.test(kb?.aciklama) && !/kırmızı/.test(kb?.aciklama), kb?.aciklama);
  await kartSec('pencere'); await bekle(200);
  sonuc('Kartta "Bütün sekmeleri kapat" seçilince ayar "pencere" (pencerede ve depoda)', (await ayarYerel()) === 'pencere' && (await ayarDepo()) === 'pencere');
  await ayarlarKapat();
  await ac('b.pdf'); await kirlet('b.pdf');   // a, b*
  await kapatIstegi(); k = await kutuBekle();
  sonuc('Ayar "pencere": sekme sorusu yok; değişmeyen a.pdf sorusuz kapandı, b.pdf\'in kaydetme sorusu (bugünkü akış)', kaydetSorusuMu(k, 'b.pdf') && J(await sekmeAdlari()) === J(['b.pdf*']), { k, sekmeler: await sekmeAdlari() });
  await kutuDugmesi('Vazgeç'); await kutuYok();
  // Bilinmeyen değer "Her seferinde sor" sayılır
  await ayarKoy('bilinmeyen');
  await ac('a.pdf');   // b*, a
  await kapatIstegi(); k = await kutuBekle();
  sonuc('Bilinmeyen ayar değeri "Her seferinde sor" sayılır (soru çıkar)', sekmeSorusuMu(k), k);
  await tus('Escape'); await kutuYok();
  // Varsayılanlara dön: "Her seferinde sor"
  await ayarKoy('sekme');
  await ayarlarAc('acilis');
  await evalJs(`(document.querySelector('.ayarlar-ortusu [data-id="varsayilan"]').click(), true)`);
  await kutuBekle((x) => /varsayılan değerlere/.test(x.ileti)); await kutuDugmesi('Varsayılanlara dön'); await bekle(400);
  kb = await kart();
  sonuc('"Varsayılanlara dön" ayarı "Her seferinde sor"a döndürür, kart da onu gösterir', (await ayarYerel()) === 'sor' && (await ayarDepo()) === 'sor' && kb?.deger === 'sor', { yerel: await ayarYerel(), kart: kb?.deger });

  // ================================================================ 11) Ayarlar açıkken: Bir daha sorma + Vazgeç yazmaz; + Geçerli sekme yazar, kart canlı güncellenir
  await kapatIstegi(); k = await kutuBekle(sekmeSorusuMu);
  sonuc('Ayarlar açıkken de soru çıkar (Ayarlar\'ın üstünde)', sekmeSorusuMu(k) && await evalJs(`!!document.querySelector('.ayarlar-ortusu')`), k);
  await onayTikla(); await kutuDugmesi('Vazgeç'); await kutuYok();
  sonuc('Bir daha sorma + Vazgeç: ayar yazılmaz ("sor" kalır), sekmeler olduğu gibi', (await ayarYerel()) === 'sor' && (await ayarDepo()) === 'sor' && (await kart())?.deger === 'sor' && J(await sekmeAdlari()) === J(['b.pdf*', 'a.pdf']),
    { yerel: await ayarYerel(), depo: await ayarDepo(), sekmeler: await sekmeAdlari() });
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu);
  await onayTikla(); await kutuDugmesi('Geçerli sekme'); await bekle(400);
  sonuc('Bir daha sorma + Geçerli sekme (Ayarlar açıkken): a.pdf kapandı, ayar "sekme", açık kart da "sekme" gösteriyor',
    J(await sekmeAdlari()) === J(['b.pdf*']) && (await ayarYerel()) === 'sekme' && (await kart())?.deger === 'sekme', { sekmeler: await sekmeAdlari(), kart: (await kart())?.deger });
  await ayarlarKapat();
  await ayarKoy('sor');

  // ================================================================ 12) Çıkış'tan gelen kapatma (cikis: true): soru yok
  await ac('a.pdf');   // b*, a
  await gozcuKur();
  await kapatIstegi(true); k = await kutuBekle();
  sonuc('Çıkış\'tan gelen kapatma (cikis: true): sekme sorusu yok; değişmeyen a.pdf kapandı, b.pdf\'in kaydetme sorusu',
    kaydetSorusuMu(k, 'b.pdf') && J(await sekmeAdlari()) === J(['b.pdf*']) && (await enFazlaKutu()) === 1, { k, sekmeler: await sekmeAdlari() });
  await kutuDugmesi('Vazgeç'); await kutuYok();

  // ================================================================ 13) soru açıkken Çıkış: "Tüm sekmeler" olarak kapanır, "Bir daha sorma" yazılmaz
  await ac('a.pdf');   // b*, a
  await gozcuKur();
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu);
  await onayTikla();
  await kapatIstegi(true);
  k = await kutuBekle((x) => kaydetSorusuMu(x, 'b.pdf'));
  sonuc('Soru açıkken Çıkış geldi: soru "Tüm sekmeler" seçilmiş gibi kapandı; a.pdf kapandı, b.pdf\'in kaydetme sorusu',
    kaydetSorusuMu(k, 'b.pdf') && k.sayi === 1 && J(await sekmeAdlari()) === J(['b.pdf*']) && (await enFazlaKutu()) === 1, { k, sekmeler: await sekmeAdlari() });
  sonuc('Çıkış\'ın kapattığı soruda işaretli "Bir daha sorma" yazılmadı', (await ayarYerel()) === 'sor' && (await ayarDepo()) === 'sor', { yerel: await ayarYerel(), depo: await ayarDepo() });
  await kutuDugmesi('Vazgeç'); await kutuYok();

  // ================================================================ 14) araç penceresi açıkken Geçerli sekme: önce aracın sorusu
  await ac('a.pdf');   // b*, a (etkin a)
  await evalJs(`(window.__pdefe.komutCalistir('arac.gorselBirlestir', [${J(path.join(PDF, 'c.pdf'))}]), true)`);
  await kosul(`document.querySelectorAll('.birlestir-oge').length > 0`); await bekle(800);
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu);
  await kutuDugmesi('Geçerli sekme');
  k = await kutuBekle((x) => /^"Birleştirilmiş/.test(x.ileti || ''));
  sonuc('Araç açıkken Geçerli sekme: önce aracın kaydetme sorusu', /^"Birleştirilmiş( \(\d+\))?\.pdf" belgesinde kaydedilmemiş/.test(k?.ileti || '') && k.sayi === 1, k);
  await kutuDugmesi('Vazgeç'); await kutuYok(); await bekle(300);
  sonuc('Aracın sorusunda Vazgeç: araç ve sekmeler açık', await evalJs(`!!document.querySelector('.birlestir-pencere')`) && J(await sekmeAdlari()) === J(['b.pdf*', 'a.pdf']), await sekmeAdlari());
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu); await kutuDugmesi('Geçerli sekme');
  await kutuBekle((x) => /^"Birleştirilmiş/.test(x.ileti || '')); await kutuDugmesi('Kaydetme');
  await kosul(`!document.querySelector('.birlestir-pencere') && window.__pdefe.sekmeler.sekmeler.length === 1`, 5000); await bekle(300);
  sonuc('Aracın sorusunda Kaydetme: araç kapandı, ardından yalnızca etkin a.pdf kapandı', !(await evalJs(`!!document.querySelector('.birlestir-pencere')`)) && J(await sekmeAdlari()) === J(['b.pdf*']) && !(await kutu()), await sekmeAdlari());

  // ================================================================ 14b) güncelleme izni süren kaydı beklerken × (bağımsız inceleme)
  // Kurulumun kapatma izni (başka pencereden 'pencere:izinIste'; bu penceredeki "Kur ve yeniden başlat" da aynı yoldan) süren bir kaydı
  // beklerken pencerenin × düğmesine basılınca kapsam sorusu açılmaz, pencere o izni bekler (0.2.1'deki gibi): sorular üst üste açılmaz,
  // aynı belge iki kez sorulmaz. Süren kayıt b.kaydediliyor / b.kayitSozu ile taklit edilir (büyük belgede yapısal kayıt saniyeler sürer).
  await ac('a.pdf'); await kirlet('a.pdf');   // b*, a* (etkin a)
  await evalJs(`(() => { const b = window.__pdefe.aktif(); b.kaydediliyor = true; b.kayitSozu = new Promise((r) => { window.__s29KayitBitir = () => { b.kaydediliyor = false; r(); }; }); return true; })()`);
  await gozcuKur();
  await ana('test:olayGonder', 'pencere:izinIste', 's29-izin');
  await bekle(300);
  await kapatIstegi(); await bekle(600);
  k = await kutu();
  sonuc('Güncelleme izni süren kaydı beklerken ×: kapsam sorusu açılmaz (pencere aynı izni bekler)', !k, k);
  await evalJs(`(window.__s29KayitBitir(), true)`);
  k = await kutuBekle((x) => kaydetSorusuMu(x, 'b.pdf'));
  sonuc('Kayıt bitince iznin kaydetme sorusu tek başına açılır (b.pdf)', kaydetSorusuMu(k, 'b.pdf') && k.sayi === 1, k);
  await kutuDugmesi('Vazgeç'); await bekle(600);
  sonuc('İznin sorusunda Vazgeç: başka soru açılmaz (iki soru hiçbir zaman üst üste değil), sekmeler ve pencere açık, kurulum kilidi yok',
    !(await kutu()) && (await enFazlaKutu()) === 1 && J(await sekmeAdlari()) === J(['b.pdf*', 'a.pdf*']) && !(await evalJs(`window.__pdefe.kilitli()`)) && (await yenile()).includes(P1),
    { kutu: await kutu(), enFazla: await enFazlaKutu(), sekmeler: await sekmeAdlari() });
  for (let i = 0; i < 4 && (await kutu()); i++) { await tus('Escape'); await bekle(300); }   // düşerse kalan soruları kapat (sonraki bölümler için)
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'a.pdf'); if (b) await p.belgeKapat(b.id, { zorla: true }); return true; })()`);
  await bekle(300);

  // ================================================================ 15) iki pencere
  await ac('c.pdf');
  let once = await yenile();
  await tasi('c.pdf', { tur: 'yeni' });
  const P2 = await yeniPencere(once);
  sonuc('Hazırlık: c.pdf yeni pencerede (P2)', P2 != null);
  P(P2); await hatalariTopla(); await gozcuKur(); await ac('d.pdf');   // P2: c, d
  P(P1); await gozcuKur(); await ayarlarAc('acilis');
  P(P2); await kapatIstegi(); k = await kutuBekle(sekmeSorusuMu);
  P(P1); const p1Kutu = await kutu();
  sonuc('İki pencere: soru yalnızca kapatılan pencerede (P2: "2 sekme", geçerli d.pdf), P1\'de kutu yok', sekmeSorusuMu(k) && k.ileti === 'Bu pencerede 2 sekme açık.' && /"d\.pdf"/.test(k.ayrinti) && !p1Kutu, { k, p1Kutu });
  P(P2); await onayTikla(); await hatalariOku(); await kutuDugmesi('Tüm sekmeler');
  const p2Kapandi = await pencereKapandi(P2);
  P(P1);
  sonuc('Tüm sekmeler (değişiklik yok): yalnızca P2 kapandı; P1 ve sekmesi açık, P1\'de soru açılmadı',
    p2Kapandi && J(await sekmeAdlari()) === J(['b.pdf*']) && (await enFazlaKutu()) === 0, { p2Kapandi, sekmeler: await sekmeAdlari() });
  sonuc('"Bir daha sorma" + Tüm sekmeler öbür pencereye geçti: P1\'de ayar "pencere", depoda "pencere", P1\'de açık Ayarlar kartı "Bütün sekmeleri kapat"',
    (await ayarYerel()) === 'pencere' && (await ayarDepo()) === 'pencere' && (await kart())?.deger === 'pencere', { yerel: await ayarYerel(), kart: (await kart())?.deger });
  await ayarlarKapat();
  await ayarKoy('sor');

  // ================================================================ 16) Geçerli sekmenin kaydetme sorusu açıkken Çıkış: sekme kapanınca pencere de kapanır
  await ac('c.pdf');
  once = await yenile();
  await tasi('c.pdf', { tur: 'yeni' });
  const P3 = await yeniPencere(once);
  P(P3); await hatalariTopla(); await ac('d.pdf'); await kirlet('d.pdf');   // P3: c, d* (etkin d)
  sonuc('Hazırlık: P3 = c, d* ve ayar P3\'te de "sor"', P3 != null && J(await sekmeAdlari()) === J(['c.pdf', 'd.pdf*']) && (await ayarYerel()) === 'sor', { sekmeler: await sekmeAdlari(), ayar: await ayarYerel() });
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu); await kutuDugmesi('Geçerli sekme');
  await kutuBekle((x) => kaydetSorusuMu(x, 'd.pdf'));
  await kapatIstegi(true); await bekle(400);
  k = await kutu();
  sonuc('Geçerli sekmenin kaydetme sorusu açıkken Çıkış geldi: soru açık kalır (ikinci kutu yok)', kaydetSorusuMu(k, 'd.pdf') && k.sayi === 1, k);
  await hatalariOku();
  await kutuDugmesi('Kaydetme');
  sonuc('Kaydetme: d.pdf kapandı ve Çıkış geldiği için pencere de kapandı (c.pdf değişmemişti)', await pencereKapandi(P3));

  // ================================================================ 17) yalnızca açılış sekmeleri: soru yok
  P(P1);
  await ac('c.pdf');
  once = await yenile();
  await tasi('c.pdf', { tur: 'yeni' });
  const P4 = await yeniPencere(once);
  P(P4); await hatalariTopla();
  await komut('sekme.yeni');
  await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  await komut('sekme.yeni');
  sonuc('Hazırlık: P4\'te iki açılış sekmesi, belge yok', J(await sekmeAdlari()) === J(['Yeni sekme', 'Yeni sekme']), await sekmeAdlari());
  await hatalariOku();
  await kapatIstegi();
  sonuc('Yalnızca açılış sekmeleri: soru çıkmadan pencere kapandı', await pencereKapandi(P4, 5000));
  P(P1);
  sonuc('Öbür pencere (P1) etkilenmedi', J(await sekmeAdlari()) === J(['b.pdf*']) && !(await kutu()), await sekmeAdlari());

  // ================================================================ 18) gerçek Windows kapatma iletisi (görünmeyen masaüstü)
  await ac('a.pdf');   // P1: b*, a
  if (process.env.S29_GIZLI === '1' && PID) {
    let r = pencereKapat('sistem', 'a.pdf');
    k = await kutuBekle(sekmeSorusuMu);
    sonuc('Windows kapatma iletisi (SC_CLOSE: × düğmesi / Alt+F4): sekme sorusu çıkar', /^TAMAM/.test(r) && sekmeSorusuMu(k), { r, k });
    await tus('Escape'); await kutuYok();
    r = pencereKapat('kapat', 'a.pdf');
    k = await kutuBekle(sekmeSorusuMu);
    sonuc('WM_CLOSE (görev çubuğunun "Pencereyi kapat"ı): sekme sorusu çıkar', /^TAMAM/.test(r) && sekmeSorusuMu(k), { r, k });
    await kutuDugmesi('Vazgeç'); await kutuYok();
    sonuc('Vazgeç: pencere ve sekmeler açık', J(await sekmeAdlari()) === J(['b.pdf*', 'a.pdf']) && (await yenile()).includes(P1), await sekmeAdlari());
  } else bilgi('Gerçek Windows kapatma iletisi atlandı (görünmeyen masaüstündeki örnek: S29_GIZLI=1 ve PDEFE_TEST_PID gerekir)');

  // ================================================================ 19) konsol hataları
  await hatalariOku();
  sonuc('Konsolda hata yok (bütün pencereler)', hatalar.length === 0, hatalar);

  // ================================================================ 20) soru açıkken Dosya › Çıkış: soru kapanır, akış sürer, uygulama kapanır
  await kapatIstegi(); await kutuBekle(sekmeSorusuMu);
  await ana('test:cik');
  k = await kutuBekle((x) => kaydetSorusuMu(x, 'b.pdf'));
  sonuc('Soru açıkken Dosya › Çıkış: soru "Tüm sekmeler" olarak kapandı, a.pdf kapandı, b.pdf\'in kaydetme sorusu', kaydetSorusuMu(k, 'b.pdf') && k.sayi === 1 && J(await sekmeAdlari()) === J(['b.pdf*']), { k, sekmeler: await sekmeAdlari() });
  await kutuDugmesi('Kaydetme').catch(() => {});
  let kapandi = false;
  for (let i = 0; i < 60 && !kapandi; i++) { await bekle(250); try { await fetch(`http://127.0.0.1:${PORT}/json`); } catch { kapandi = true; } }
  sonuc('Kaydetme: Çıkış sürdü, uygulama kapandı (Çıkış takılmadı)', kapandi);

  console.log(`\n${tamam} tamam, ${hataSayisi} hata`);
  console.log(hataSayisi ? `${hataSayisi} HATA` : 'Hepsi geçti');
}
