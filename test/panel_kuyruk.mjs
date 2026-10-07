// Sayfalar panelinin küçük resim istek kuyruğu (0.2.3, kullanıcı isteği: "sayfaları kaydırırken daha hızlı yüklensin. hafif geç yükleniyor
// gibi oluyor"). Çekirdeğe giden 'kucuk_resim' istekleri sarılır (her biri kayda geçer; yavaş çekirdek benzetimi için isteğe gecikme
// eklenir). Denetlenenler:
//   1) Açılışta: görünen hücrelerin resimleri önce istenir, çekirdekte aynı anda en çok 2 istek; sonra bir alan yüksekliği önden yükleme.
//   2) Hızlı kaydırma (alan baştan sona 40 adımda; çekirdek yavaş): geçilen hücrelerin çoğu hiç istenmez; hiçbir istek görünen alandan
//      2 alan yüksekliğinden uzak hücre için gönderilmez; görünen hücre beklerken görünmeyen istenmez; varılan yerde boş hücre kalmaz.
//   3) Geçilip düşen hücreler gözlemciye geri verilmiştir: geri dönülünce resimleri gelir.
//   4) Panel kapanınca ve başka panel sekmesi (İçindekiler) seçilince bekleyen istekler gönderilmez; geri açılınca görünenler dolar.
//   5) Belge sekmesi değişince eski belgenin bekleyen istekleri gönderilmez; yeni belge dolar; belge kapanınca öncekine dönülür, dolar.
//   6) Ana görünüm hızla gezilince (panel geçerli sayfayı izler) varılan yer dolar, geçilenlerin çoğu istenmez.
//   7) Panel genişleyince yüksek çözünürlüklü yeniden istekler de kuyruktan (en çok 2), görünenler yeterli çözünürlükte.
//   8) Taranmış sayfanın küçük resmi JPEG, metin sayfasınınki PNG (çekirdek kucuk_resim_bicimi; 0.2.3): panelde, Sayfaları düzenle'de ve
//      Ctrl+Tab seçicisinde resim yeni yanıtla (veri + bicim) doğru kuruluyor ve çözülüyor.
//   9) Konsolda hata yok.
// Kullanım (en az iki ekran ölçeğinde):
//   powershell -File test\baslat.ps1 -Port 9682 [-Olcek 1.25]      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9682; node test\surucu.mjs betik test\panel_kuyruk.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Örnek PDF'ler test\cikti\panel_kuyruk\<zaman> altında üretilir (ornek_pdf_uret.py; gerçek belge yok), iş bitince silinir.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 'panel_kuyruk', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, tamamSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (ok) tamamSayisi++; else hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

// Sayfada: panelin çekirdek çağrısını sarar. Her 'kucuk_resim' isteği gönderildiği anda kaydedilir: sayfa (kaynak), yol, hücrenin görünen
// alana uzaklığı (alan yüksekliği biriminde; 0 görünen), o an kuyrukta görünen hücre kalıp kalmadığı, o anki eşzamanlı istek sayısı.
const SARMA = `(() => {
  const p = window.__pdefe.panel;
  const ozgun = p.cekirdek.__kuyrukOzgun || p.cekirdek;
  const K = window.__kuyruk = { istekler: [], yolda: 0, enFazla: 0, gecikme: 0 };
  const uzaklik = (el) => {
    const alan = document.querySelector('#panel-sayfalar'), h = alan.clientHeight;
    if (!el || !h) return null;
    const ar = alan.getBoundingClientRect(), ust = ar.top + alan.clientTop, alt = ust + h, r = el.getBoundingClientRect();
    return (r.top >= alt ? r.top - alt : r.bottom <= ust ? ust - r.bottom : 0) / h;
  };
  const f = async (y, prm, ...a) => {
    if (y !== 'kucuk_resim') return ozgun(y, prm, ...a);
    const hucreler = [...document.querySelectorAll('#panel-sayfalar .kucuk-resim')];
    const el = hucreler.find((x) => window.__pdefe.aktif()?.gorunum.sayfalar[+x.dataset.sayfa - 1]?.kaynak.sayfa === prm.sayfa && !x.querySelector('img') && !x.__gonderildi)
      || hucreler.find((x) => window.__pdefe.aktif()?.gorunum.sayfalar[+x.dataset.sayfa - 1]?.kaynak.sayfa === prm.sayfa);
    if (el) el.__gonderildi = 1;
    const bekleyenGorunen = [...p._kuyruk.keys()].some((x) => x.isConnected && uzaklik(x) === 0);
    K.yolda++; K.enFazla = Math.max(K.enFazla, K.yolda);
    K.istekler.push({ sayfa: prm.sayfa, yol: prm.yol, uzaklik: uzaklik(el), bekleyenGorunen, t: performance.now(), yolda: K.yolda });
    try {
      if (K.gecikme) await new Promise((c) => setTimeout(c, K.gecikme));
      return await ozgun(y, prm, ...a);
    } finally { K.yolda--; }
  };
  f.__kuyrukOzgun = ozgun;
  p.cekirdek = f;
  return true;
})()`;

export default async function ({ evalJs, bekle, tus }) {
  const kosul = async (ifade, sure = 15000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  const hatalar = () => evalJs(`(() => { const h = window.__hatalar.slice(); window.__hatalar.length = 0; return h; })()`);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); const ce = console.error; console.error = (...a) => { window.__hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; } return true; })()`);
  await evalJs(`(() => { window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);

  fs.mkdirSync(K, { recursive: true });
  const yolA = path.join(K, 'kuyruk-a.pdf'), yolB = path.join(K, 'kuyruk-b.pdf');
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yolA, '160', 'Kuyruk A'], { encoding: 'utf8' });
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yolB, '60', 'Kuyruk B'], { encoding: 'utf8' });
  console.log(`Ekran ölçeği ${await evalJs('window.devicePixelRatio')}, pencere ${await evalJs('window.innerWidth + "×" + window.innerHeight')}`);

  // Görünen (ve isteğe bağlı olarak payın içindeki) hücrelerin hepsi resimli mi; kuyruk ve yoldaki istekler boş mu
  const DURUM = (pay = 0) => `(() => {
    const p = window.__pdefe.panel, alan = document.querySelector('#panel-sayfalar'), h = alan.clientHeight, ar = alan.getBoundingClientRect();
    const ust = ar.top + alan.clientTop - ${pay} * h, alt = ar.top + alan.clientTop + h + ${pay} * h;
    const hucreler = [...alan.querySelectorAll('.kucuk-resim')].filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > ust && r.top < alt; });
    return { sayi: hucreler.length, bos: hucreler.filter((el) => !el.querySelector('img')).map((el) => +el.dataset.sayfa), kuyruk: p._kuyruk.size, yolda: p._yolda };
  })()`;
  const doldu = (pay = 0, sure = 15000) => kosul(`(() => { const d = ${DURUM(pay)}; return d.sayi > 0 && !d.bos.length && !d.kuyruk && !d.yolda ? d : null; })()`, sure);
  const durum = (pay = 0) => evalJs(DURUM(pay));
  const kayitlar = () => evalJs('window.__kuyruk.istekler');
  const sifirla = (gecikme = 0) => evalJs(`(() => { const K = window.__kuyruk; K.istekler = []; K.enFazla = 0; K.gecikme = ${gecikme}; for (const el of document.querySelectorAll('#panel-sayfalar .kucuk-resim')) delete el.__gonderildi; return true; })()`);
  const onbellekBosalt = () => evalJs(`(() => { const p = window.__pdefe.panel, b = window.__pdefe.aktif(); p.kucukResimler.get(b.id)?.clear(); p._sayfalarHazir = null; p.yenile(); return true; })()`);
  const alanKaydir = (oran) => evalJs(`(() => { const a = document.querySelector('#panel-sayfalar'); a.scrollTop = (a.scrollHeight - a.clientHeight) * ${oran}; return a.scrollTop; })()`);
  /** Kayıtların ortak denetimleri: eşzamanlılık, uzak hücreye istek yok, görünen beklerken görünmeyen istenmedi */
  const kuyrukDenetle = async (etiket, ist) => {
    const enFazla = await evalJs('window.__kuyruk.enFazla');
    sonuc(`${etiket}: çekirdekte aynı anda en çok 2 küçük resim isteği`, enFazla <= 2 && enFazla >= 1, { enFazla, istek: ist.length });
    const uzak = ist.filter((k) => k.uzaklik != null && k.uzaklik > 2.05);
    sonuc(`${etiket}: görünen alandan 2 alan yüksekliğinden uzak hücre için istek gönderilmedi`, !uzak.length, uzak.slice(0, 5));
    const sirasiz = ist.filter((k) => k.uzaklik > 0 && k.bekleyenGorunen);
    sonuc(`${etiket}: görünen hücre kuyruktayken görünmeyen hücre istenmedi`, !sirasiz.length, sirasiz.slice(0, 5));
  };

  await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(yolA)}); return true; })()`);
  await kosul(`!!window.__pdefe.aktif()?.gorunum?.hazir`);
  await evalJs(SARMA);

  // ------------------------------------------------------------ 1) Açılış
  console.log('\n== 1) Açılış: önce görünenler, en çok 2 istek, önden yükleme');
  await sifirla(40);
  await evalJs(`(() => { const p = window.__pdefe; p.panel.genislikAyarla(240); p.panel.acKapa(true); p.panel.sekmeSec('sayfalar'); p.panel._sayfalarHazir = null; p.panel.yenile(); return true; })()`);
  let d = await doldu(1);
  sonuc('Açılış: görünen ve bir alan yüksekliği yakınındaki hücreler resimli, kuyruk boş', !!d, d || await durum(1));
  let ist = await kayitlar();
  const gorunenSayisi = (await durum(0)).sayi;
  const ilkler = ist.slice(0, gorunenSayisi);
  sonuc(`Açılış: ilk ${gorunenSayisi} istek görünen hücrelerin`, ilkler.length === gorunenSayisi && ilkler.every((k) => k.uzaklik === 0), ilkler.map((k) => [k.sayfa, k.uzaklik]));
  sonuc('Açılış: önden yükleme oldu (görünmeyen hücre de istendi)', ist.some((k) => k.uzaklik > 0), ist.map((k) => [k.sayfa, k.uzaklik]));
  await kuyrukDenetle('Açılış', ist);

  // ------------------------------------------------------------ 2) Hızlı kaydırma, yavaş çekirdek
  console.log('\n== 2) Hızlı kaydırma (çekirdek yavaş: istek başına +60 ms)');
  await onbellekBosalt();
  await doldu(1);
  await sifirla(60);
  const hucreSayisi = await evalJs(`document.querySelectorAll('#panel-sayfalar .kucuk-resim').length`);
  for (let k = 1; k <= 40; k++) { await alanKaydir(k / 40); await bekle(16); }
  const tBirak = Date.now();
  d = await doldu(0, 20000);
  const dolma = Date.now() - tBirak;
  sonuc('Hızlı kaydırma: varılan yerde görünen hücrelerin hepsi resimli', !!d, d || await durum(0));
  console.log(`  bırakınca görünenlerin dolması ~${dolma} ms (sürücü yoklaması dahil)`);
  await doldu(1, 20000);
  ist = await kayitlar();
  const istenenSayfalar = new Set(ist.map((k) => k.sayfa));
  sonuc(`Hızlı kaydırma: geçilen hücrelerin çoğu istenmedi (${istenenSayfalar.size} / ${hucreSayisi} hücre)`, istenenSayfalar.size < hucreSayisi * 0.5, { istek: ist.length, hucre: hucreSayisi });
  await kuyrukDenetle('Hızlı kaydırma', ist);

  // ------------------------------------------------------------ 3) Düşen hücreler geri gelince istenir
  console.log('\n== 3) Geçilip düşen hücreler geri dönülünce yüklenir');
  const ortadakiler = await evalJs(`(() => { const a = document.querySelector('#panel-sayfalar'); return [...a.querySelectorAll('.kucuk-resim')].filter((el) => !el.querySelector('img')).map((el) => +el.dataset.sayfa); })()`);
  sonuc('Resimsiz kalan (geçilip düşen) hücreler var', ortadakiler.length > hucreSayisi * 0.3, ortadakiler.length);
  await sifirla(0);
  for (const oran of [0.5, 0.25, 0.75]) {
    await alanKaydir(oran);
    d = await doldu(0, 10000);
    sonuc(`Geri dönüş (%${oran * 100}): görünen hücrelerin hepsi resimli`, !!d, d || await durum(0));
  }
  await kuyrukDenetle('Geri dönüş', await kayitlar());

  // ------------------------------------------------------------ 4) Panel kapanınca / başka panel sekmesi
  console.log('\n== 4) Panel kapanınca ve İçindekiler seçilince bekleyen istekler gönderilmez');
  for (const [ad, gizle, goster] of [
    ['Panel kapandı', `window.__pdefe.panel.acKapa(false)`, `window.__pdefe.panel.acKapa(true)`],
    ['İçindekiler seçildi', `window.__pdefe.panel.sekmeSec('icindekiler')`, `window.__pdefe.panel.sekmeSec('sayfalar')`],
  ]) {
    await onbellekBosalt();
    await doldu(1);
    await sifirla(300);
    await alanKaydir(0.9);
    await bekle(50);
    await evalJs(`(() => { ${gizle}; return true; })()`);
    const tGizle = await evalJs('performance.now()');
    await bekle(1200);
    const sonra = (await kayitlar()).filter((k) => k.t > tGizle);
    const iz = await evalJs('(() => ({ kuyruk: window.__pdefe.panel._kuyruk.size, yolda: window.__pdefe.panel._yolda }))()');
    sonuc(`${ad}: ardından yeni istek gönderilmedi, kuyruk boşaldı`, !sonra.length && !iz.kuyruk && !iz.yolda, { sonra: sonra.map((k) => k.sayfa), ...iz });
    await sifirla(0);
    await evalJs(`(() => { ${goster}; return true; })()`);
    d = await doldu(1, 10000);
    sonuc(`${ad}, geri açıldı: görünen ve yakındaki hücreler resimli`, !!d, d || await durum(1));
    await alanKaydir(0.9);   // açılınca panel geçerli sayfaya döner; gizlenirken beklenen yere yeniden gidilir
    d = await doldu(1, 10000);
    sonuc(`${ad}, gizlenirken beklenen yerde: görünen ve yakındaki hücreler resimli`, !!d, d || await durum(1));
  }

  // ------------------------------------------------------------ 5) Belge sekmesi değişimi ve belge kapanması
  console.log('\n== 5) Belge sekmesi değişince eski belgenin bekleyen istekleri gönderilmez');
  await onbellekBosalt();
  await doldu(1);
  const idA = await evalJs('window.__pdefe.aktif().id');
  await sifirla(300);
  await alanKaydir(0.6);
  await bekle(50);
  await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(yolB)}); return true; })()`);
  await kosul(`window.__pdefe.aktif()?.gorunum?.hazir && window.__pdefe.aktif().id !== ${J(idA)}`);
  const tB = await evalJs('performance.now()');
  await sifirla(0);
  d = await doldu(1, 10000);
  sonuc('B belgesi: görünen ve yakındaki hücreler resimli', !!d, d || await durum(1));
  const aSonra = (await evalJs('window.__kuyruk.istekler')).filter((k) => k.t > tB && k.yol === yolA);
  sonuc('B açıldıktan sonra A belgesi için istek gönderilmedi', !aSonra.length, aSonra.map((k) => k.sayfa));
  await evalJs(`(async () => { const p = window.__pdefe; await p.belgeKapat(p.aktif().id, { zorla: true }); return true; })()`);
  await kosul(`window.__pdefe.aktif()?.id === ${J(idA)}`);
  d = await doldu(1, 10000);
  sonuc('B kapandı, A\'ya dönüldü: görünen ve yakındaki hücreler resimli', !!d, d || await durum(1));

  // ------------------------------------------------------------ 6) Ana görünüm hızla gezilince
  console.log('\n== 6) Ana görünüm hızla gezilince (panel geçerli sayfayı izler)');
  await onbellekBosalt();
  await evalJs(`(() => { window.__pdefe.aktif().gorunum.sayfayaGit(1, { aninda: true }); return true; })()`);
  await doldu(1);
  await sifirla(60);
  for (let no = 2; no <= 120; no += 2) { await evalJs(`(() => { window.__pdefe.aktif().gorunum.sayfayaGit(${no}, { aninda: true }); return true; })()`); await bekle(16); }
  d = await doldu(0, 15000);
  sonuc('Ana görünümle gezinme: panelde görünen hücrelerin hepsi resimli', !!d, d || await durum(0));
  const gec = await evalJs(`document.querySelector('#panel-sayfalar .kucuk-resim.gecerli')?.dataset.sayfa`);
  sonuc('Ana görünümle gezinme: panelin geçerli sayfası 120', gec === '120', gec);
  await doldu(1, 15000);
  ist = await kayitlar();
  // Kuyruksuz (0.2.2) geçilen her hücre ve payın içindekiler istenirdi (~120+); kuyrukta yalnızca üzerinden geçilirken sırası gelenler
  sonuc(`Ana görünümle gezinme: geçilen 120 sayfanın bir kısmı hiç istenmedi (${new Set(ist.map((k) => k.sayfa)).size} istendi)`, new Set(ist.map((k) => k.sayfa)).size < 90, ist.length);
  await kuyrukDenetle('Ana görünümle gezinme', ist);

  // ------------------------------------------------------------ 7) Panel genişleyince yeniden istekler de kuyruktan
  console.log('\n== 7) Panel genişleyince yüksek çözünürlüklü yeniden istekler');
  await sifirla(40);
  await evalJs(`(() => { window.__pdefe.panel.genislikAyarla(480); return true; })()`);
  await bekle(400);
  d = await kosul(`(() => { const d = ${DURUM(0)}; const alan = document.querySelector('#panel-sayfalar'), ar = alan.getBoundingClientRect();
    const yeterli = [...alan.querySelectorAll('.kucuk-resim')].filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > ar.top && r.top < ar.bottom; })
      .every((el) => el.querySelector('img') && !window.__pdefe.panel.yenidenIstenecekMi(el));
    return yeterli && !d.kuyruk && !d.yolda ? d : null; })()`, 15000);
  sonuc('480 px: görünen hücreler yeterli çözünürlükte, kuyruk boş', !!d, d || await durum(0));
  ist = await kayitlar();
  sonuc('480 px: yeniden istek yapıldı', ist.length > 0, ist.length);
  await kuyrukDenetle('480 px', ist);
  await evalJs(`(() => { window.__pdefe.panel.genislikAyarla(240); return true; })()`);

  // ------------------------------------------------------------ 8) Taranmış sayfanın küçük resmi JPEG (çekirdek kucuk_resim_bicimi)
  console.log('\n== 8) Taranmış sayfa: panelde, Sayfaları düzenle\'de ve Ctrl+Tab seçicisinde JPEG, metin sayfası PNG');
  const yolT = path.join(K, 'kuyruk-tarama.pdf');
  execFileSync(PY, ['-X', 'utf8', '-c', [
    'import io, random, sys, pymupdf', 'from PIL import Image, ImageDraw', 'random.seed(1)',
    'img = Image.new("L", (1240, 1754), 245); d = ImageDraw.Draw(img)',
    'for s in range(40): d.text((140, 120 + s * 38), "Satir %d: ornek taranmis metin" % (s + 1), fill=25)',
    'px = img.load()', 'for _ in range(60000): px[random.randrange(1240), random.randrange(1754)] = random.randrange(150, 256)',
    'b = io.BytesIO(); img.save(b, "JPEG", quality=75)',
    'doc = pymupdf.open(sys.argv[1]); p = doc.new_page(0, width=595, height=842); p.insert_image(p.rect, stream=b.getvalue())',
    'doc.save(sys.argv[2])',
  ].join('\n'), yolB, yolT], { encoding: 'utf8' });
  await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(yolT)}); return true; })()`);
  await kosul(`window.__pdefe.aktif()?.gorunum?.hazir && window.__pdefe.aktif().yol.endsWith('kuyruk-tarama.pdf')`);
  await evalJs(`(() => { window.__pdefe.panel.acKapa(true); window.__pdefe.panel.sekmeSec('sayfalar'); window.__pdefe.aktif().gorunum.sayfayaGit(1, { aninda: true }); return true; })()`);
  await doldu(0);
  const tur = (sec, n = 0) => evalJs(`(() => { const i = document.querySelectorAll(${J(sec)})[${n}]; return i ? { tur: i.src.slice(5, i.src.indexOf(';')), nw: i.naturalWidth } : null; })()`);
  const p1 = await tur('#panel-sayfalar .kucuk-resim[data-sayfa="1"] img'), p2 = await tur('#panel-sayfalar .kucuk-resim[data-sayfa="2"] img');
  sonuc('Panel: taranmış 1. sayfa JPEG, metin 2. sayfa PNG, ikisi de çözüldü', p1?.tur === 'image/jpeg' && p2?.tur === 'image/png' && p1.nw > 0 && p2.nw > 0, { p1, p2 });
  await evalJs(`window.__pdefe.komutCalistir('arac.sayfalar')`);
  await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 2 && [...document.querySelectorAll('.sayfalar-izgara img')].every((i) => i.complete && i.naturalWidth)`, 15000);
  const s1 = await tur('.sayfalar-izgara > .sayfa-karti .resim-kutu img', 0), s2 = await tur('.sayfalar-izgara > .sayfa-karti .resim-kutu img', 1);
  sonuc('Sayfaları düzenle: taranmış sayfa JPEG, metin sayfası PNG, ikisi de çözüldü', s1?.tur === 'image/jpeg' && s2?.tur === 'image/png' && s1.nw > 0 && s2.nw > 0, { s1, s2 });
  await evalJs(`(async () => { window.__pdefeOtoYanit = { secim: 1 }; const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); delete window.__pdefeOtoYanit; return true; })()`);
  await kosul(`!document.querySelector('.sayfalar-pencere')`, 5000);
  // Ctrl+Tab seçicisi: sekmelerin ilk sayfaları (taranmış belge JPEG, ötekiler PNG). Ctrl bırakılmadığı için seçici açık kalır; Esc kapatır
  await tus('Tab', ['ctrl']);
  await kosul(`(() => { const a = [...document.querySelectorAll('#sekme-secici .aday')]; return a.length >= 2 && a.every((x) => x.querySelector('img')?.naturalWidth); })()`, 8000);
  const adaylar = await evalJs(`[...document.querySelectorAll('#sekme-secici .aday')].map((a) => ({ ad: a.querySelector('.ad').textContent, tur: a.querySelector('img')?.src.slice(5, a.querySelector('img').src.indexOf(';')) }))`);
  sonuc('Ctrl+Tab seçicisi: taranmış belge JPEG, metin belgesi PNG', adaylar.find((a) => a.ad === 'kuyruk-tarama.pdf')?.tur === 'image/jpeg' && adaylar.find((a) => a.ad === 'kuyruk-a.pdf')?.tur === 'image/png', adaylar);
  await tus('Escape', ['ctrl']);
  await evalJs(`(() => { const s = window.__pdefe.sekmeler; if (s.seciciAcik) s.seciciIptal(); return true; })()`);
  await evalJs(`(async () => { const p = window.__pdefe; await p.belgeKapat(p.aktif().id, { zorla: true }); return true; })()`);

  // ------------------------------------------------------------ 9) Konsol
  const h = await hatalar();
  sonuc('Konsolda hata yok', !h.length, h.slice(0, 5));

  await evalJs(`(() => { const p = window.__pdefe.panel; if (p.cekirdek.__kuyrukOzgun) p.cekirdek = p.cekirdek.__kuyrukOzgun; p.acKapa(false); return true; })()`);
  await evalJs(`(async () => { const p = window.__pdefe; for (const b of [...p.belgeler.values()]) await p.belgeKapat(b.id, { zorla: true }); return true; })()`);
  await bekle(500);
  try { fs.rmSync(K, { recursive: true, force: true }); } catch { /* dosya kilitli kalabilir */ }
  console.log(`\n${tamamSayisi} tamam, ${hataSayisi} hata (ölçek ${await evalJs('window.devicePixelRatio')})`);
  if (hataSayisi) process.exitCode = 1;
}
