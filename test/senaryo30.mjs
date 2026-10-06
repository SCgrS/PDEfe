// Senaryo 30 (0.2.2, kullanıcı isteği): geri alınacak adımların listesi (araç çubuğunda Geri al'ın yanındaki ▾) ve durum çubuğundaki
// "Kaydedilmemiş değişiklikler" listesi (gecmisListesi.js). Word'deki gibi: satırlar en yenisi üstte, "ad · ayrıntı" ("Not ekle · s. 3");
// fare bir satıra gelince en üstten o satıra kadar boyanır, altta "N işlemi geri al"; tıklanınca o kadar adım birden geri alınır.
//   1) ▾ düğmesi: Geri al'ın hemen sağında, ipucu "Geri alınacak adımlar"; geri alınacak bir şey yokken soluk (devre dışı). Yinele'de ok yok.
//   2) Liste: sıra ve ayrıntılar (not: sayfası; Sayfayı döndür: s. N; Sayfaları döndür: s. 3–4; Sayfa düzenini uygula: farkın özeti); Geri al
//      düğmesinin altında açılır. Gerçek fareyle boyama aralığı ve alt yazıdaki sayı; satırdan çıkınca boyama kalkar.
//   3) Üçüncü satıra tıklamak üç adımı geri alır (yığın konumu, nottaki ve sayfalardaki durum), liste kapanır, odak belgede.
//   4) Klavye: Enter ile açılınca ilk satır boyalı; ↑ ↓ boyamayı değiştirir, Esc kapatır (odak ▾'de), Enter uygular. Kayıt sürerken uygulanmaz.
//   5) Kapanma: dışarı tıklama, Esc, sekme değişimi (programla ve Ctrl+PageDown), pencerenin odağı kaybetmesi, Ctrl+Z (kısayol işini yapar).
//   6) Uzun listede kaydırma (en çok pencerenin %60'ı), End son satırı boyar ve görünür yapar.
//   7) Durum çubuğu: "● Kaydedilmemiş değişiklikler" yalnızca değişiklik varken görünür, yanında yazıyla aynı hesaplanmış renkte liste simgesi.
//      Tıklanınca yukarı açılan liste: başlık, yalnızca son kayıttan sonraki değişiklikler, aynı boyama ("N değişikliği geri al"); kaydedip
//      geri alınanlar "(geri alındı)" ve tıklanamaz; Kaydet düğmesi kaydeder (test/cikti altındaki kopya), liste kapanır.
//   8) Kayıt konumu yokken (kaydedilen durum kesildi) liste net farktan çıkarılır, tıklanamaz.
//   9) Sekme başka pencereye taşınırken ayrıntılar da taşınır (sekmePaketi'ndeki komut tarifleri).
//  10) Koyu tema; konsolda hata yok.
//  11) Etkin sekme kapanınca açık liste de kapanır: pencere kapatma yoluyla (× → "Yalnızca geçerli sekmeyi kapat"; kaydetme sorusu
//      klavyeyle yanıtlanınca da) ve başka bir yoldan (bağımsız inceleme).
//  12) Listeyi açan Enter / Boşluk basılı tutulunca yinelenen basış bir adımı geri almaz (bağımsız inceleme).
//  13) Ekran okuyucu: odak listbox'ta, aria-activedescendant son boyalı satır, aria-multiselectable, alt yazı canlı bölge (bağımsız inceleme).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9550      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9550; node test\surucu.mjs betik test\senaryo30.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Ekran görüntüleri test/cikti/s30/png altına; $env:S30_EKRAN=<klasör> verilirse oraya da (README / denetim için; örnek
// baslat.ps1 -Boyut "1280,800" -Olcek 1 -Tema acik ile başlatılmalı).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's30');
const PDF = path.join(UI, 'pdf');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const EKRAN = process.env.S30_EKRAN || '';
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

const uret = (yol, sayfa, baslik) => {
  fs.rmSync(yol, { force: true, maxRetries: 10, retryDelay: 300 });
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yol, String(sayfa), baslik], { encoding: 'utf8' });
};
const dosyaOzeti = (yol) => JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), '--ozet', yol], { encoding: 'utf8' }));

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, fare, tus }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => {
    await bekle(300);
    await ekranGoruntusu(path.join(PNG, ad + '.png'));
    if (EKRAN) { fs.mkdirSync(EKRAN, { recursive: true }); fs.copyFileSync(path.join(PNG, ad + '.png'), path.join(EKRAN, 'g5-' + ad + '.png')); }
  };
  const ac = async (yol) => {
    const r = await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); return b ? b.id : null; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(400);
    return r;
  };
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); await new Promise((r) => setTimeout(r, 300)); return p.belgeler.size; })()`);
  /** Etkin belgenin durumu */
  const durumu = () => evalJs(`(() => { const b = window.__pdefe.aktif(); if (!b) return null; const g = b.gorunum, y = b.yigin;
    const dd = document.querySelector('#durum-degisiklik');
    return { konum: y.konum, kayit: y.kayitKonumu, uzunluk: y.yigin.length, not: b.notlar.liste().length, sayfa: g.sayfaSayisi, dondurme: g.sayfalar.slice(0, 6).map((s) => s.dondurme),
      degisti: !!b.degisti, okDevre: document.querySelector('#dugme-geri-al-liste')?.disabled, durumGizli: dd.hidden, mesaj: document.querySelector('#durum-mesaj').textContent,
      odak: document.activeElement === g.kaydirici ? 'belge' : (document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName) }; })()`);
  /** Açık listenin durumu (kapalıysa null) */
  const liste = () => evalJs(`(() => { const el = document.querySelector('.gecmis-listesi'); if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect(), ul = el.querySelector('.gecmis-ogeler'), li = [...ul.children], b = el.querySelector('.gecmis-baslik'), k = el.querySelector('.gecmis-kaydet');
    return { kaynak: el.dataset.kaynak, satirlar: li.map((x) => x.textContent), boyali: li.filter((x) => x.classList.contains('boyali')).length,
      boyaliSurekli: li.every((x, i) => x.classList.contains('boyali') === (i < li.filter((y) => y.classList.contains('boyali')).length)),
      tiklanir: li.filter((x) => x.classList.contains('tiklanir')).length, alt: el.querySelector('.gecmis-alt-yazi').textContent,
      baslik: b.hidden ? null : b.textContent, kaydet: k.hidden ? null : { devre: k.disabled },
      kutu: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), h: Math.round(r.height) },
      kaydir: { sh: ul.scrollHeight, ch: ul.clientHeight, st: ul.scrollTop }, odak: el.contains(document.activeElement), pencereH: innerHeight }; })()`);
  const satirNoktasi = (i) => evalJs(`(() => { const li = document.querySelectorAll('.gecmis-listesi .gecmis-ogeler > li')[${i}]; if (!li) return null; const r = li.getBoundingClientRect(); return [Math.round(r.left + 30), Math.round(r.top + r.height / 2)]; })()`);
  const ogeNoktasi = (sec) => evalJs(`(() => { const e = document.querySelector(${J(sec)}); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  const belgeNoktasi = () => evalJs(`(() => { const r = window.__pdefe.aktif().gorunum.kaydirici.getBoundingClientRect(); return [Math.round(r.left + 60), Math.round(r.top + r.height / 2)]; })()`);
  const hareket = async (n) => { if (n) await fare([{ tur: 'hareket', x: n[0], y: n[1] }]); await bekle(120); };
  const okTikla = async () => { const n = await ogeNoktasi('#dugme-geri-al-liste'); await tikla(n[0], n[1]); await bekle(250); };
  const durumTikla = async () => { const n = await ogeNoktasi('#durum-degisiklik'); await tikla(n[0], n[1]); await bekle(250); };
  const notEkle = (sayfa, icerik) => evalJs(`(async () => { const b = window.__pdefe.aktif();
    b.notlar.ekle({ tur: 'Text', sayfa: ${sayfa}, rect: [400, 600, 420, 620], icerik: ${J(icerik)}, yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' });
    await new Promise((r) => setTimeout(r, 120)); return b.yigin.konum; })()`);
  const dondur = (sayfalar, ad) => evalJs(`(async () => { const p = window.__pdefe, b = p.aktif(); await p.sayfalariDondur(b, ${J(sayfalar)}, 90, ${J(ad)}); await new Promise((r) => setTimeout(r, 200)); return b.yigin.konum; })()`);
  const geriAl = (n = 1) => evalJs(`(async () => { for (let i = 0; i < ${n}; i++) { window.__pdefe.komutCalistir('duzen.geriAl'); await new Promise((r) => setTimeout(r, 120)); } return window.__pdefe.aktif().yigin.konum; })()`);
  const yinele = (n = 1) => evalJs(`(async () => { for (let i = 0; i < ${n}; i++) { window.__pdefe.komutCalistir('duzen.yinele'); await new Promise((r) => setTimeout(r, 120)); } return window.__pdefe.aktif().yigin.konum; })()`);
  const kapat = () => evalJs(`(() => { window.__pdefe.gecmisListesi.kapat(); return true; })()`);

  // ------------------------------------------------------------ hazırlık
  await sekmeleriKapat();
  fs.mkdirSync(PDF, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); const ce = console.error; console.error = (...a) => { window.__hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; } return true; })()`);
  await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'otomatikKaydet', false); window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);
  await evalJs(`(() => { window.__pdefeYerelKutu = true; return true; })()`);   // beklenmeyen soru açılırsa diyalog kaydına düşsün
  // Kanun metninin kopyası (kişisel veri yok); kayıtlar bu kopyaya yazılır
  const yolA = path.join(PDF, 'Türk Medeni Kanunu.pdf');
  fs.rmSync(yolA, { force: true }); fs.copyFileSync(path.join(KOK, 'test', 'pdf', 'mevzuat_4721_TMK.pdf'), yolA);
  const ozIlk = dosyaOzeti(yolA);
  const yolB = path.join(PDF, 'net-fark.pdf');
  uret(yolB, 3, 'Net fark denemesi');
  const idA = await ac(yolA);
  sonuc('Belge açıldı', !!idA);
  const ilk = await durumu();
  const tabanNot = ilk.not, sayfaN = ilk.sayfa;

  // ------------------------------------------------------------ 1) ▾ düğmesi
  console.log('\n== 1) Geri al düğmesinin yanındaki ok');
  const dugme = await evalJs(`(() => { const o = document.querySelector('#dugme-geri-al-liste'), g = document.querySelector('#dugme-geri-al'), y = document.querySelector('#dugme-yinele');
    if (!o) return null; const ro = o.getBoundingClientRect(), rg = g.getBoundingClientRect();
    return { ardinda: g.nextElementSibling === o, ayniGrup: o.parentElement === g.parentElement, title: o.title, devre: o.disabled, opak: getComputedStyle(o).opacity,
      bitisik: Math.round(ro.left - rg.right), yukseklik: Math.round(ro.height), yineleOk: !!(y.nextElementSibling?.classList.contains('acilir')), haspopup: o.getAttribute('aria-haspopup') }; })()`);
  sonuc('▾ düğmesi Geri al\'ın hemen sağında, aynı grupta, ipucu "Geri alınacak adımlar"', dugme && dugme.ardinda && dugme.ayniGrup && dugme.title === 'Geri alınacak adımlar' && dugme.bitisik <= 1, dugme);
  sonuc('Geri alınacak bir şey yokken ▾ soluk (devre dışı, saydamlık 0.35)', dugme?.devre === true && Math.abs(parseFloat(dugme.opak) - 0.35) < 0.01, dugme);
  sonuc('Yinele düğmesinin yanında ok yok', dugme && !dugme.yineleOk, dugme);
  sonuc('Değişiklik yokken durum çubuğundaki yazı gizli', ilk.durumGizli === true, ilk);
  await okTikla();
  sonuc('Soluk ▾ tıklanınca liste açılmaz', (await liste()) === null);

  // ------------------------------------------------------------ 2) Liste: sıra, ayrıntılar, boyama
  console.log('\n== 2) Liste, sıra, ayrıntılar, fareyle boyama');
  await notEkle(1, 'Birinci not');                       // a
  await dondur([2], 'Sayfayı döndür');                   // b
  await notEkle(3, 'Üçüncü sayfa notu');                 // c
  await dondur([3, 4], 'Sayfaları döndür');              // d
  // e) Sayfa düzenini uygula: 3 ile 4 yer değiştirir, 5. sayfa silinir, sona boş sayfa eklenir
  await evalJs(`(async () => { const p = window.__pdefe, b = p.aktif(), t = b.gorunum.tarif();
    const yeni = [t[0], t[1], t[3], t[2], ...t.slice(5), { kaynak: null, genislik: 595.28, yukseklik: 841.89, dondurme: 0 }];
    await p.sayfaTarifiUygula(b, yeni, 'Sayfa düzenini uygula'); await new Promise((r) => setTimeout(r, 300)); return true; })()`);
  let d = await durumu();
  sonuc('Beş komut çalıştı, ▾ etkin', d.konum === 5 && d.okDevre === false, d);
  const geriAlIpucu = await evalJs(`document.querySelector('#dugme-geri-al').title`);
  sonuc('Geri al ipucu değişmedi (yalnızca ad): "Geri al: Sayfa düzenini uygula (Ctrl+Z)"', geriAlIpucu === 'Geri al: Sayfa düzenini uygula (Ctrl+Z)', geriAlIpucu);
  await okTikla();
  let l = await liste();
  const BEKLENEN = ['Sayfa düzenini uygula · 1 sayfa silindi, 1 sayfa eklendi, sıra değişti', 'Sayfaları döndür · s. 3–4', 'Not ekle · s. 3', 'Sayfayı döndür · s. 2', 'Not ekle · s. 1'];
  sonuc('▾ tıklanınca liste açıldı (kaynak "geri"), odak listede', l?.kaynak === 'geri' && l.odak, l);
  sonuc('Satırlar en yenisi üstte, "ad · ayrıntı"', J(l?.satirlar) === J(BEKLENEN), l?.satirlar);
  sonuc('Bütün satırlar tıklanabilir, hiçbiri boyalı değil, alt yazı "Vazgeç", başlık ve Kaydet yok', l && l.tiklanir === 5 && l.boyali === 0 && l.alt === 'Vazgeç' && l.baslik === null && l.kaydet === null, l);
  const konum = await evalJs(`(() => { const g = document.querySelector('#dugme-geri-al').getBoundingClientRect(); return { l: Math.round(g.left), b: Math.round(g.bottom) }; })()`);
  sonuc('Liste Geri al düğmesinin altında, sol kenarı hizalı', l && l.kutu.t >= konum.b && l.kutu.t <= konum.b + 6 && Math.abs(l.kutu.l - konum.l) <= 1, { kutu: l?.kutu, dugme: konum });
  sonuc('▾ basılı görünür (aria-expanded)', (await evalJs(`document.querySelector('#dugme-geri-al-liste').getAttribute('aria-expanded')`)) === 'true');
  await hareket(await satirNoktasi(2));
  l = await liste();
  sonuc('Fare üçüncü satırda: en üstten üç satır boyalı, alt yazı "3 işlemi geri al"', l?.boyali === 3 && l.boyaliSurekli && l.alt === '3 işlemi geri al', l && { boyali: l.boyali, alt: l.alt });
  await ss('geri-al-listesi');
  await hareket(await satirNoktasi(0));
  l = await liste();
  sonuc('Fare ilk satırda: bir satır boyalı, "1 işlemi geri al"', l?.boyali === 1 && l.alt === '1 işlemi geri al', l && { boyali: l.boyali, alt: l.alt });
  await hareket(await satirNoktasi(4));
  l = await liste();
  sonuc('Fare son satırda: beşi boyalı, "5 işlemi geri al"', l?.boyali === 5 && l.alt === '5 işlemi geri al', l && { boyali: l.boyali, alt: l.alt });
  const disari = await evalJs(`(() => { const r = document.querySelector('#durum-cubugu').getBoundingClientRect(); return [Math.round(r.left + 200), Math.round(r.top - 30)]; })()`);
  await hareket(disari);
  l = await liste();
  sonuc('Fare listeden çıkınca boyama kalkar, alt yazı "Vazgeç"; liste açık kalır', l?.boyali === 0 && l.alt === 'Vazgeç', l && { boyali: l.boyali, alt: l.alt });

  // ------------------------------------------------------------ 3) Üçüncü satıra tıklama
  console.log('\n== 3) Tıklayınca o kadar adım geri alınır');
  let n3 = await satirNoktasi(2);
  await tikla(n3[0], n3[1]); await bekle(400);
  d = await durumu();
  sonuc('Üç adım geri alındı: yığın konumu 5 → 2', d.konum === 2 && d.uzunluk === 5, d);
  sonuc('Belgede: üçüncü sayfanın notu kalktı (not sayısı taban + 1), sayfa düzeni geri döndü, 2. sayfa döndürülmüş, 3–4 değil',
    d.not === tabanNot + 1 && d.sayfa === sayfaN && J(d.dondurme.slice(0, 4)) === J([0, 90, 0, 0]), d);
  sonuc('Liste kapandı, odak belgede, durum çubuğunda "Geri alındı: 3 işlem"', (await liste()) === null && d.odak === 'belge' && d.mesaj === 'Geri alındı: 3 işlem', d);
  sonuc('Kalan iki adım için ▾ hâlâ etkin', d.okDevre === false, d);

  // ------------------------------------------------------------ 4) Klavye
  console.log('\n== 4) Klavye');
  await evalJs(`document.querySelector('#dugme-geri-al-liste').focus(), 1`);
  await tus('Enter'); await bekle(250);
  l = await liste();
  sonuc('Enter ile açılan listede ilk satır boyalı ("1 işlemi geri al")', l?.boyali === 1 && l.alt === '1 işlemi geri al' && J(l.satirlar) === J(['Sayfayı döndür · s. 2', 'Not ekle · s. 1']), l);
  await tus('ArrowDown'); await bekle(100);
  l = await liste();
  sonuc('↓: iki satır boyalı, "2 işlemi geri al"', l?.boyali === 2 && l.alt === '2 işlemi geri al', l && { boyali: l.boyali, alt: l.alt });
  await tus('ArrowDown'); await bekle(100);
  sonuc('↓ son satırda durur', (await liste())?.boyali === 2);
  await tus('ArrowUp'); await bekle(100);
  sonuc('↑: bir satır boyalı', (await liste())?.boyali === 1);
  const sayfaOnce = await evalJs(`window.__pdefe.aktif().gorunum.kaydirici.scrollTop`);
  await tus('ArrowDown'); await bekle(150);
  sonuc('Liste açıkken ok tuşları belgeyi kaydırmaz', (await evalJs(`window.__pdefe.aktif().gorunum.kaydirici.scrollTop`)) === sayfaOnce);
  await tus('Escape'); await bekle(200);
  d = await durumu();
  sonuc('Esc listeyi kapatır, hiçbir şey geri alınmaz, odak ▾ düğmesinde', (await liste()) === null && d.konum === 2 && d.odak === 'dugme-geri-al-liste', d);
  // Kayıt sürerken uygulanmaz
  await tus('Enter'); await bekle(250);
  await evalJs(`(() => { window.__pdefe.aktif().kaydediliyor = true; return 1; })()`);
  await tus('Enter'); await bekle(250);
  d = await durumu();
  const bildirim = await evalJs(`(() => { const b = document.querySelector('#bildirim'); return b.hidden ? '' : b.textContent; })()`);
  await evalJs(`(() => { window.__pdefe.aktif().kaydediliyor = false; return 1; })()`);
  sonuc('Kayıt sürerken listeden geri alınmaz: "Kaydediliyor, lütfen bekleyin."', d.konum === 2 && bildirim === 'Kaydediliyor, lütfen bekleyin.', { d, bildirim });
  await evalJs(`document.querySelector('#dugme-geri-al-liste').focus(), 1`);
  await tus('Enter'); await bekle(250);
  await tus('End'); await bekle(100);
  sonuc('End: bütün satırlar boyalı', (await liste())?.boyali === 2);
  await tus('Enter'); await bekle(400);
  d = await durumu();
  sonuc('Enter uygular: iki adım daha geri alındı (konum 0), not ve döndürme kalktı', d.konum === 0 && d.not === tabanNot && J(d.dondurme.slice(0, 4)) === J([0, 0, 0, 0]) && (await liste()) === null, d);
  sonuc('Geri alınacak kalmayınca ▾ yeniden soluk; belge değişmemiş, durum çubuğu yazısı gizli', d.okDevre === true && !d.degisti && d.durumGizli, d);

  // ------------------------------------------------------------ 5) Kapanma yolları
  console.log('\n== 5) Kapanma');
  await yinele(5);
  d = await durumu();
  sonuc('Yinele ile beş adım geri geldi', d.konum === 5 && d.not === tabanNot + 2, d);
  await okTikla();
  sonuc('Liste açık', !!(await liste()));
  const bn = await belgeNoktasi();
  await tikla(bn[0], bn[1]); await bekle(250);
  sonuc('Dışarı (belgeye) tıklama listeyi kapatır, bir şey geri alınmaz', (await liste()) === null && (await durumu()).konum === 5);
  await okTikla(); await okTikla();
  sonuc('▾ ikinci kez tıklanınca liste kapanır', (await liste()) === null);
  await okTikla();
  await evalJs(`window.dispatchEvent(new Event('blur')), 1`); await bekle(150);
  sonuc('Pencere odağı kaybedince liste kapanır', (await liste()) === null);
  const idB = await ac(yolB);
  await evalJs(`window.__pdefe.sekmeSec(${J(idA)})`); await bekle(400);
  await okTikla();
  sonuc('A sekmesinde liste açık', (await liste())?.kaynak === 'geri');
  await evalJs(`window.__pdefe.sekmeSec(${J(idB)})`); await bekle(300);
  sonuc('Sekme değişince liste kapanır', (await liste()) === null);
  await evalJs(`window.__pdefe.sekmeSec(${J(idA)})`); await bekle(400);
  await okTikla();
  await tus('PageDown', ['ctrl']); await bekle(400);
  sonuc('Ctrl+PageDown: liste kapanır, sonraki sekmeye geçilir', (await liste()) === null && (await evalJs(`window.__pdefe.aktif().id`)) === idB);
  await evalJs(`window.__pdefe.sekmeSec(${J(idA)})`); await bekle(400);
  await okTikla();
  await tus('z', ['ctrl']); await bekle(300);
  d = await durumu();
  sonuc('Ctrl+Z: liste kapanır, kısayol olağan işini yapar (bir adım geri alındı)', (await liste()) === null && d.konum === 4, d);
  await yinele(1);

  // ------------------------------------------------------------ 9) Taşınan sekmede ayrıntılar (komut tarifleri)
  console.log('\n== 9) Sekme taşınırken ayrıntılar');
  const paket = await evalJs(`(async () => { const p = window.__pdefe, b = p.aktif(); const k = await p.sekmePaketi(b); return k.yigin ? k.yigin.komutlar.map((x) => x.ad + ' · ' + x.ayrinti) : null; })()`);
  sonuc('Taşınan paketteki komut tarifleri ayrıntıyı taşır', J(paket) === J([...BEKLENEN].reverse()), paket);

  // ------------------------------------------------------------ 6) Uzun liste
  console.log('\n== 6) Uzun listede kaydırma');
  await evalJs(`(async () => { const b = window.__pdefe.aktif(); for (let i = 0; i < 45; i++) b.notlar.ekle({ tur: 'Text', sayfa: 1 + (i % 9), rect: [60 + i * 4, 700, 80 + i * 4, 720], icerik: 'Uzun ' + i, yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' }); await new Promise((r) => setTimeout(r, 300)); return b.yigin.konum; })()`);
  await okTikla();
  l = await liste();
  sonuc('50 satır; liste en çok pencerenin %60\'ı kadar uzun, satırlar kendi içinde kayar', l?.satirlar.length === 50 && l.kutu.h <= Math.round(l.pencereH * 0.6) + 1 && l.kaydir.sh > l.kaydir.ch, l && { n: l.satirlar.length, kutu: l.kutu, kaydir: l.kaydir, h: l.pencereH });
  await tus('End'); await bekle(150);
  l = await liste();
  sonuc('End: 50 satır boyalı, son satır görünür (liste kaydı), "50 işlemi geri al"', l?.boyali === 50 && l.kaydir.st > 0 && l.alt === '50 işlemi geri al', l && { boyali: l.boyali, kaydir: l.kaydir, alt: l.alt });
  await tus('PageUp'); await bekle(100);
  sonuc('Page Up: 10 satır daha az (40)', (await liste())?.boyali === 40);
  await tus('Escape'); await bekle(150);
  await geriAl(45);
  d = await durumu();
  sonuc('Uzun liste testinin notları geri alındı', d.konum === 5, d);

  // ------------------------------------------------------------ 7) Durum çubuğu
  console.log('\n== 7) Durum çubuğundaki liste');
  const dd = await evalJs(`(() => { const e = document.querySelector('#durum-degisiklik'); const s = e.querySelector('svg'); const parca = s?.querySelector('path, circle');
    return { gizli: e.hidden, metin: e.textContent.trim(), title: e.title, renk: getComputedStyle(e).color, simgeVar: !!s, simgeRengi: parca ? getComputedStyle(parca).stroke : null,
      dolgu: s ? getComputedStyle(s.querySelector('circle')).fill : null, simgeGen: s ? Math.round(s.getBoundingClientRect().width) : 0, sagda: s ? s.getBoundingClientRect().left > e.querySelector('.metin').getBoundingClientRect().right - 1 : false }; })()`);
  sonuc('Değişiklik varken "● Kaydedilmemiş değişiklikler" görünür, ipucu "Kaydedilmemiş değişiklikleri göster"', dd.gizli === false && dd.metin === '● Kaydedilmemiş değişiklikler' && dd.title === 'Kaydedilmemiş değişiklikleri göster', dd);
  sonuc('Yazının sağında liste simgesi, yazıyla aynı hesaplanmış renkte (çizgi ve noktalar)', dd.simgeVar && dd.sagda && dd.simgeRengi === dd.renk && dd.dolgu === dd.renk && dd.simgeGen >= 12, dd);
  await ss('durum-cubugu');
  // Kaydedilir (kopya üzerinde), sonra iki değişiklik daha
  const kaydedildi = await evalJs(`(async () => { const p = window.__pdefe; return await p.belgeKaydet(p.aktif()); })()`);
  await bekle(500);
  d = await durumu();
  sonuc('Kaydedildi: durum çubuğu yazısı gizli, kayıt konumu 5', kaydedildi === true && d.durumGizli && d.kayit === 5 && !d.degisti, d);
  await notEkle(2, 'Kayıttan sonra');
  await dondur([5], 'Sayfayı döndür');
  d = await durumu();
  sonuc('Kayıttan sonra iki değişiklik: yazı yeniden görünür', !d.durumGizli && d.konum === 7, d);
  await durumTikla();
  l = await liste();
  const yazi = await evalJs(`(() => { const r = document.querySelector('#durum-degisiklik').getBoundingClientRect(); return { t: Math.round(r.top), r: Math.round(r.right) }; })()`);
  sonuc('Yazı tıklanınca liste yukarı doğru açılır (kaynak "durum"), sağ kenarı yazıyla hizalı', l?.kaynak === 'durum' && l.kutu.b <= yazi.t && l.kutu.b >= yazi.t - 6 && Math.abs(l.kutu.r - yazi.r) <= 1, { kutu: l?.kutu, yazi });
  sonuc('Başlık "Kaydedilmemiş değişiklikler", yalnızca kayıttan sonrakiler, Kaydet etkin, alt yazı "2 değişiklik"',
    l?.baslik === 'Kaydedilmemiş değişiklikler' && J(l.satirlar) === J(['Sayfayı döndür · s. 5', 'Not ekle · s. 2']) && l.kaydet && !l.kaydet.devre && l.alt === '2 değişiklik', l);
  await hareket(await satirNoktasi(1));
  l = await liste();
  sonuc('Fare ikinci satırda: iki satır boyalı, "2 değişikliği geri al"', l?.boyali === 2 && l.alt === '2 değişikliği geri al', l && { boyali: l.boyali, alt: l.alt });
  await ss('durum-listesi');
  await tikla(...(await satirNoktasi(0))); await bekle(400);
  d = await durumu();
  sonuc('İlk satıra tıklamak bir değişikliği geri alır (konum 6), liste kapanır, yazı görünür kalır', d.konum === 6 && (await liste()) === null && !d.durumGizli, d);
  await geriAl(2);   // konum 4: kaydedilen durumdaki son komut (Sayfa düzenini uygula) geri alındı
  await durumTikla();
  l = await liste();
  sonuc('Kaydedip geri alınan "(geri alındı)" diye görünür ve tıklanamaz; alt yazı açıklar',
    J(l?.satirlar) === J(['Sayfa düzenini uygula · 1 sayfa silindi, 1 sayfa eklendi, sıra değişti (geri alındı)']) && l.tiklanir === 0 && l.alt === 'Kaydedince dosyadan da kalkar', l);
  await hareket(await satirNoktasi(0));
  sonuc('Tıklanamayan satır boyanmaz', (await liste())?.boyali === 0);
  await tikla(...(await satirNoktasi(0))); await bekle(300);
  sonuc('Tıklanamayan satıra tıklamak bir şey geri almaz, liste açık kalır', (await durumu()).konum === 4 && !!(await liste()));
  await tikla(...(await ogeNoktasi('.gecmis-listesi .gecmis-kaydet'))); await bekle(1500);
  await kosul(`!window.__pdefe.aktif().kaydediliyor`);
  d = await durumu();
  sonuc('Kaydet düğmesi kaydeder: liste kapandı, belge temiz, yazı gizli, kayıt konumu 4', (await liste()) === null && !d.degisti && d.durumGizli && d.kayit === 4, d);
  const oz = dosyaOzeti(yolA);
  const fark = (i) => ((oz.dondurme[i] - ozIlk.dondurme[i]) % 360 + 360) % 360;
  sonuc('Kopya dosyada kaydedilen durum: sayfa düzeni geri alınmış (özgün sayfa sayısı), 2–4. sayfalar döndürülmüş, iki not eklenmiş',
    oz.sayfa === sayfaN && J([0, 1, 2, 3, 4].map(fark)) === J([0, 90, 90, 90, 0]) && oz.notlar.length === ozIlk.notlar.length + 2,
    { sayfa: oz.sayfa, dondurme: oz.dondurme.slice(0, 5), notlar: oz.notlar.length, ilk: ozIlk.notlar.length });

  // ------------------------------------------------------------ 8) Net fark (kayıt konumu yok)
  console.log('\n== 8) Kayıt konumu yokken net fark');
  await evalJs(`window.__pdefe.sekmeSec(${J(idB)})`); await bekle(400);
  await notEkle(1, 'Kaydedilecek not');
  await evalJs(`(async () => { const p = window.__pdefe; return await p.belgeKaydet(p.aktif()); })()`); await bekle(400);
  await geriAl(1);
  await notEkle(2, 'Dal kesen not');
  d = await durumu();
  sonuc('Kaydedilen durum kesildi: kayıt konumu -1, belge değişmiş', d.kayit === -1 && d.degisti, d);
  await durumTikla();
  l = await liste();
  sonuc('Liste net farktan: "Not sil · s. 1" ve "Not ekle · s. 2", tıklanamaz', l && l.tiklanir === 0 && l.satirlar.length === 2 && l.satirlar.includes('Not sil · s. 1') && l.satirlar.includes('Not ekle · s. 2'), l);
  await hareket(await satirNoktasi(0));
  sonuc('Net fark satırları boyanmaz', (await liste())?.boyali === 0);
  await tus('Escape'); await bekle(150);
  sonuc('Esc durum listesini de kapatır, odak yazıda', (await liste()) === null && (await durumu()).odak === 'durum-degisiklik');
  await evalJs(`(async () => { const p = window.__pdefe; return await p.belgeKapat(p.aktif().id, { zorla: true }); })()`); await bekle(400);

  // ------------------------------------------------------------ 10) Koyu tema
  console.log('\n== 10) Koyu tema');
  await evalJs(`window.__pdefe.sekmeSec(${J(idA)})`); await bekle(300);
  await notEkle(2, 'Koyu tema notu');
  await dondur([3], 'Sayfayı döndür');
  // Tema düğmesinin komutu açık ↔ koyu çevirir (başlangıç teması sistemden gelebilir): koyuya geçilir, sonunda eski temaya dönülür
  const eskiTema = await evalJs(`document.documentElement.dataset.tema`);
  const temaYap = (t) => evalJs(`(() => { if (document.documentElement.dataset.tema !== ${J(t)}) window.__pdefe.komutCalistir('gorunum.tema'); return document.documentElement.dataset.tema; })()`);
  await temaYap('koyu'); await bekle(300);
  await okTikla();
  await hareket(await satirNoktasi(2));
  l = await liste();
  const koyu = await evalJs(`(() => { const el = document.querySelector('.gecmis-listesi'), li = el.querySelector('li.boyali'), dz = getComputedStyle(el).backgroundColor;
    return { tema: document.documentElement.dataset.tema, zemin: dz, satir: li ? getComputedStyle(li).backgroundColor : null, yazi: getComputedStyle(el).color }; })()`);
  sonuc('Koyu temada liste koyu zeminli, açık yazılı; boyalı satır zeminden ayrışır', koyu.tema === 'koyu' && koyu.zemin === 'rgb(43, 43, 43)' && koyu.yazi === 'rgb(240, 240, 240)' && koyu.satir && koyu.satir !== koyu.zemin, koyu);
  await ss('geri-al-listesi-koyu');
  await kapat();
  await durumTikla(); await hareket(await satirNoktasi(0));
  await ss('durum-listesi-koyu');
  await kapat();
  await temaYap(eskiTema); await bekle(200);

  // ------------------------------------------------------------ 11) Etkin sekme kapanınca açık liste de kapanır (bağımsız inceleme)
  // Pencere kapatma yoluyla (× → "Yalnızca geçerli sekmeyi kapat"; pencerenin × düğmesi sayfaya basış göndermez, soru klavyeyle yanıtlanır)
  // ya da başka bir yoldan etkin belge kapanınca liste kapanan belgenin adımlarını yeni belgenin üstünde göstermemeli, tuşları yutmamalı.
  console.log('\n== 11) Etkin sekme kapanınca liste kapanır');
  const listeKapali = () => evalJs(`(() => { const o = document.querySelector('#dugme-geri-al-liste'), dd = document.querySelector('#durum-degisiklik');
    return { acik: window.__pdefe.gecmisListesi.acik, gorunur: !document.querySelector('.gecmis-listesi').hidden, okBasili: o.classList.contains('liste-acik') || o.getAttribute('aria-expanded') === 'true',
      durumBasili: dd.classList.contains('liste-acik') || dd.getAttribute('aria-expanded') === 'true', aktif: window.__pdefe.aktif()?.ad || null }; })()`);
  const kapaliMi = (x) => x.acik === null && !x.gorunur && !x.okBasili && !x.durumBasili;
  await evalJs(`(async () => { window.__pdefe.ayar().pencereKapatma = 'sekme'; await window.pdefe.cagir('ayar:koy', 'pencereKapatma', 'sekme'); return true; })()`);
  const yolC = path.join(PDF, 'kapatma-c.pdf'), yolD = path.join(PDF, 'kapatma-d.pdf'), yolE = path.join(PDF, 'kapatma-e.pdf');
  uret(yolC, 3, 'Kapatma C'); uret(yolD, 3, 'Kapatma D'); uret(yolE, 3, 'Kapatma E');
  // a) ▾ listesi açık, kaydedilmiş belge (geri alınabilir adımları var), × → soru sorulmadan yalnızca etkin sekme kapanır
  const idC = await ac(yolC);
  await dondur([1], 'Sayfayı döndür'); await dondur([2], 'Sayfayı döndür');
  await evalJs(`(async () => { const p = window.__pdefe; return await p.belgeKaydet(p.aktif()); })()`); await bekle(400);
  await okTikla();
  l = await liste();
  sonuc('Hazırlık: kapatma-c.pdf etkin ve kaydedilmiş, ▾ listesi açık (iki adım)', l?.kaynak === 'geri' && l.satirlar.length === 2 && !(await durumu()).degisti, l);
  await evalJs(`window.pdefe.cagir('test:olayGonder', 'pencere:kapatIstegi')`);
  await kosul(`!window.__pdefe.belgeler.has(${J(idC)})`, 6000); await bekle(300);
  let lk = await listeKapali();
  sonuc('× (Yalnızca geçerli sekmeyi kapat): sekme kapandı, liste de kapandı, ▾ basılı görünmüyor', kapaliMi(lk) && lk.aktif && lk.aktif !== 'kapatma-c.pdf', lk);
  const kayOnce = await evalJs(`window.__pdefe.aktif().gorunum.kaydirici.scrollTop`);
  await evalJs(`window.__pdefe.aktif().gorunum.kaydirici.focus(), 1`);
  await tus('PageDown'); await bekle(400);
  sonuc('Belge tuşları yeni etkin belgeye ulaşır (Page Down kaydırır)', (await evalJs(`window.__pdefe.aktif().gorunum.kaydirici.scrollTop`)) > kayOnce, { kayOnce });
  await evalJs(`window.__pdefe.aktif().gorunum.kaydirici.scrollTop = ${kayOnce}, 1`);
  // b) Durum çubuğu listesi açık, değişmiş belge; × → kaydetme sorusu klavyeyle (→, Enter: Kaydetme) yanıtlanır
  const idD = await ac(yolD);
  await dondur([1], 'Sayfayı döndür');
  await durumTikla();
  sonuc('Hazırlık: kapatma-d.pdf değişmiş, durum listesi açık', (await liste())?.kaynak === 'durum');
  await evalJs(`(() => { window.__pdefeYerelKutu = false; return true; })()`);   // uygulama içi kutu: tuşları pencere düzeyinde yakalar
  await evalJs(`window.pdefe.cagir('test:olayGonder', 'pencere:kapatIstegi')`);
  const soru = await kosul(`document.querySelector('.mesaj-kutusu .mesaj-ileti')?.textContent || ''`, 4000);
  await tus('ArrowRight'); await bekle(100); await tus('Enter');
  await kosul(`!window.__pdefe.belgeler.has(${J(idD)})`, 6000); await bekle(300);
  await evalJs(`(() => { window.__pdefeYerelKutu = true; return true; })()`);
  lk = await listeKapali();
  sonuc('Kaydetme sorusu klavyeyle "Kaydetme": sekme kapandı, durum listesi de kapandı', /kapatma-d\.pdf/.test(soru) && kapaliMi(lk) && !(await evalJs(`!!document.querySelector('.mesaj-kutusu')`)), { soru, lk });
  // c) Başka bir yoldan (programla) etkin belge kapanır
  const idE = await ac(yolE);
  await dondur([1], 'Sayfayı döndür');
  await okTikla();
  sonuc('Hazırlık: kapatma-e.pdf, ▾ listesi açık', (await liste())?.kaynak === 'geri');
  await evalJs(`window.__pdefe.belgeKapat(${J(idE)}, { zorla: true })`); await bekle(300);
  lk = await listeKapali();
  sonuc('Etkin belge başka yoldan kapanınca da liste kapanır', kapaliMi(lk), lk);
  await evalJs(`(async () => { window.__pdefe.ayar().pencereKapatma = 'sor'; await window.pdefe.cagir('ayar:koy', 'pencereKapatma', 'sor'); return true; })()`);

  // ------------------------------------------------------------ 12) Listeyi açan tuş basılı tutulunca (bağımsız inceleme)
  // Enter / Boşluk biraz uzun basılınca Windows tuşu yineler (keydown, repeat: true). Liste ilk basışta klavyeyle açılır (ilk satır boyalı);
  // yinelenen basış açık listede bir adımı sessizce geri almamalı (mesajKutusu.js'teki gibi yinelenen Enter / Boşluk yok sayılır).
  console.log('\n== 12) Listeyi açan Enter / Boşluk basılı tutulunca');
  const cdp = async () => {
    const h = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT || 9222}/json`)).json()).find((x) => x.type === 'page' && /index\.html/.test(x.url));
    const ws = new WebSocket(h.webSocketDebuggerUrl);
    await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
    let n = 0; const bek = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bek.has(d.id)) { bek.get(d.id)(d); bek.delete(d.id); } };
    return { ws, gonder: (method, params = {}) => new Promise((c) => { const i = ++n; bek.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); }) };
  };
  /** Tuşa basar, basılı tutar (yinelenen keydown'lar) ve bırakır. */
  const basiliTut = async (ad, yineleme = 2) => {
    const ortak = ad === 'Enter' ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 } : { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
    const metin = ad === 'Enter' ? { type: 'rawKeyDown' } : { type: 'keyDown', text: ' ', unmodifiedText: ' ' };
    const { ws, gonder } = await cdp();
    await gonder('Input.dispatchKeyEvent', { ...metin, ...ortak });
    for (let i = 0; i < yineleme; i++) { await bekle(40); await gonder('Input.dispatchKeyEvent', { ...metin, ...ortak, autoRepeat: true }); }
    await gonder('Input.dispatchKeyEvent', { type: 'keyUp', ...ortak });
    ws.close();
    await bekle(300);
  };
  const yolF = path.join(PDF, 'yineleme-f.pdf');
  uret(yolF, 4, 'Yineleme F');
  await ac(yolF);
  await dondur([1], 'Sayfayı döndür'); await dondur([2], 'Sayfayı döndür'); await dondur([3], 'Sayfayı döndür');
  for (const [sec, kaynak, ad] of [['#dugme-geri-al-liste', 'geri', '▾'], ['#durum-degisiklik', 'durum', 'durum yazısı']]) {
    for (const t of ['Enter', ' ']) {
      const once = (await durumu()).konum;
      await evalJs(`(document.querySelector(${J(sec)}).focus(), true)`);
      await basiliTut(t);
      l = await liste();
      const d = await durumu();
      sonuc(`${ad}: ${t === 'Enter' ? 'Enter' : 'Boşluk'} basılı tutulunca liste açık kalır, hiçbir adım geri alınmaz (ilk satır boyalı)`, l?.kaynak === kaynak && l.boyali === 1 && d.konum === once, { l: l && { kaynak: l.kaynak, boyali: l.boyali }, konum: d.konum, once, mesaj: d.mesaj });
      await kapat(); await bekle(150);
    }
  }
  // Yinelenmeyen (yeni) basış açık listede yine uygular
  await evalJs(`(document.querySelector('#dugme-geri-al-liste').focus(), true)`);
  await tus('Enter'); await bekle(200);
  const onceF = (await durumu()).konum;
  await tus('Enter'); await bekle(300);
  sonuc('Açık listede yeni Enter basışı ilk satırı uygular (bir adım geri alınır)', (await durumu()).konum === onceF - 1 && (await liste()) === null, { onceF, d: await durumu() });

  // ------------------------------------------------------------ 13) Ekran okuyucu: boyanan satır ve alt yazı (bağımsız inceleme)
  // Odak listbox'ta; aria-activedescendant son boyalı satırı gösterir, boyalı satırlar aria-selected (çok seçimli listbox), alt yazı
  // ("N işlemi geri al") canlı bölge.
  console.log('\n== 13) Ekran okuyucu bilgileri');
  const aria = () => evalJs(`(() => { const el = document.querySelector('.gecmis-listesi'), ul = el.querySelector('.gecmis-ogeler'), od = document.activeElement;
    const ad = od?.getAttribute('aria-activedescendant'), hedef = ad ? document.getElementById(ad) : null, li = [...ul.children];
    return { odakRol: od?.getAttribute('role') || null, odakListede: el.contains(od), aktifSatir: hedef ? li.indexOf(hedef) : (ad ? 'yok:' + ad : null),
      cok: ul.getAttribute('aria-multiselectable'), secili: li.filter((x) => x.getAttribute('aria-selected') === 'true').length,
      idler: li.every((x) => x.id && document.querySelectorAll('#' + CSS.escape(x.id)).length === 1), canli: el.querySelector('.gecmis-alt-yazi').getAttribute('aria-live'),
      etiket: ul.getAttribute('aria-label') || null }; })()`);
  await dondur([4], 'Sayfayı döndür');
  await evalJs(`(document.querySelector('#dugme-geri-al-liste').focus(), true)`);
  await tus('Enter'); await bekle(200);
  await tus('ArrowDown'); await bekle(150);
  let ar = await aria();
  sonuc('Klavyeyle açılıp ↓: odak listbox\'ta, aria-activedescendant 2. satırı gösterir, iki satır seçili, aria-multiselectable, satır kimlikleri tekil',
    ar.odakRol === 'listbox' && ar.odakListede && ar.aktifSatir === 1 && ar.cok === 'true' && ar.secili === 2 && ar.idler && !!ar.etiket, ar);
  sonuc('Alt yazı ("N işlemi geri al") canlı bölge (aria-live polite)', ar.canli === 'polite', ar);
  await tus('ArrowUp'); await bekle(150);
  ar = await aria();
  sonuc('↑: aria-activedescendant 1. satırı gösterir, bir satır seçili', ar.aktifSatir === 0 && ar.secili === 1, ar);
  await tus('Tab'); await bekle(100); await tus('Tab'); await bekle(100);
  ar = await aria();
  sonuc('Tab ile dönülünce odak yine listbox\'ta (geri al listesinde Kaydet yok)', ar.odakRol === 'listbox' && ar.aktifSatir === 0, ar);
  await tus('Escape'); await bekle(150);
  const okOdak = await evalJs(`document.activeElement?.id || null`);
  sonuc('Esc: liste kapandı, odak ▾ düğmesinde', (await liste()) === null && okOdak === 'dugme-geri-al-liste', okOdak);
  await sekmeleriKapat();

  // ------------------------------------------------------------ son
  const hatalar = await evalJs(`window.__hatalar || []`);
  sonuc('Konsolda hata yok', hatalar.length === 0, hatalar);
  await sekmeleriKapat();
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti`);
  if (hataSayisi) process.exitCode = 1;
}
