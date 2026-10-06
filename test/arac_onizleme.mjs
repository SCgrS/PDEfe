// Araçlarda büyük önizleme (0.2.2, kullanıcı isteği: "araçlardaki dosyaların, görüntülerin boyutu büyük olsun ki görebilelim içeriğini, sayfa
// boyutları daha büyük, iyi gözüksün araçlarda"):
//   1) Sayfaları düzenle: kart resim kutusu --kart-resim = 220 px (0.2.1'de 150); pencere min(1320 px, 94vw) genişliğinde, 88vh (ya da şeridin
//      altına sığacak kadar); 1280 px pencerede satırda 4 sayfa. Resimlerin uzun kenarı kutunun kenarı, doğal boyutu en az ekrandaki boyut ×
//      ekran ölçeği (en çok 2): dikey, yatay ve /Rotate 90'lı sayfada; önbellek anahtarı istenen genişliği içerir. Boş sayfa ve "yüklenemedi"
//      yer tutucusu da sayfanın oranıyla kutuya sığar; R ile döndürülen resim kutudan taşmaz. Ekran ölçeği değişince (Emulation) görünen
//      kartlar yeni ölçeğe göre yeniden istenir.
//   2) Görüntü / PDF birleştir: satırdaki önizleme kutusu --birlestir-resim = 120 px (0.2.1'de 64), satırın üçüncü sütunu 120 px. Yatay görsel
//      120 px genişlikte, dikey görsel ve PDF 120 px yükseklikte; doğal boyut en az kutu × ekran ölçeği (en çok 2). Okunamayan dosyanın yer
//      tutucusu kutunun %72 × %94'ü. Döndür, sürükleyerek sıralama (gerçek fare) ve Listeden çıkar yeni ölçüde çalışır.
//   3) Renderer'da hata yok.
// Kullanım: boş veri klasörlü ekran dışı test örneği (baslat.ps1; 1280×900 varsayılan, istenirse -Olcek 1.25 / 1.5) açıkken
//   $env:PDEFE_CDP_PORT=9531; node test/surucu.mjs betik test/arac_onizleme.mjs
// Belgeler PyMuPDF / PIL ile test/cikti/onizleme/<zaman>/pdf altında üretilir; hiçbir şey kaydedilmez.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 'onizleme', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PDF = path.join(K, 'pdf'), PNG = path.join(K, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, denetimSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetimSayisi++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};
const yakin = (a, b, t = 1.01) => Math.abs(a - b) <= t;

function py(kod) {
  const cikti = execFileSync(PY, ['-X', 'utf8', '-c', 'import json, os\nimport pymupdf\n' + kod], { encoding: 'utf8' });
  return JSON.parse(cikti.trim().split(/\r?\n/).pop());
}

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, surukle, tus }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(120); } };
  const ss = async (ad) => { await bekle(200); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const merkez = async (sec) => JSON.parse(await evalJs(`(() => { const e = ${sec}; if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify([Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]); })()`));
  const acYaniti = (yollar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:acDiyalog', ${J([yollar])})`);
  const hepsiniKapat = async () => {
    await evalJs(`(async () => { window.__pdefeOtoYanit = { secim: 1 }; const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); return true; })()`);
    await kosul(`import('pdefe://app/src/renderer/araclar/ortak.js').then((m) => !m.acikAracPenceresiVar())`, 5000);
    return evalJs(`(async () => { delete window.__pdefeOtoYanit; for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  };
  const ac = async (yol) => {
    await evalJs(`window.__pdefe.dosyaAc(${J(yol)}).then(() => true)`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(300);
  };
  /** Ekran ölçeği taklidi için CDP oturumu (ilk uygulama penceresi). */
  const cdp = async () => {
    const h = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT || 9222}/json`)).json()).find((x) => x.type === 'page' && /index\.html/.test(x.url));
    const ws = new WebSocket(h.webSocketDebuggerUrl);
    await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
    let n = 0; const bek = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bek.has(d.id)) { bek.get(d.id)(d); bek.delete(d.id); } };
    return { gonder: (method, params = {}) => new Promise((c) => { const i = ++n; bek.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); }), kapat: () => ws.close() };
  };
  /** Açık araç penceresinin örneği: sınıfın _secimiCiz'i bir kez sarılır, ilk çağrıda örnek alınır, sonra eski hâline döner. */
  const ornekYakala = (modul, sinif) => evalJs(`(async () => { const m = await import('pdefe://app/src/renderer/araclar/${modul}'); const P = m.${sinif}.prototype; const asil = P._secimiCiz;
    window.__oiOrnek = null; P._secimiCiz = function (...a) { window.__oiOrnek = this; P._secimiCiz = asil; return asil.apply(this, a); }; return true; })()`);

  // ---------------------------------------------------------------- hazırlık
  for (const k of [PDF, PNG]) fs.mkdirSync(k, { recursive: true });
  const Y = py(`from PIL import Image, ImageDraw
k = ${J(PDF)}
def sayfa(d, w, h, metin, dondur=0):
    pg = d.new_page(width=w, height=h)
    pg.draw_rect(pymupdf.Rect(30, 30, w - 30, h - 30), color=(0.1, 0.3, 0.7), width=6)
    pg.insert_text((60, 120), metin, fontsize=48)
    if dondur: pg.set_rotation(dondur)
d = pymupdf.open()
for i in range(12):
    if i == 2: sayfa(d, 842, 595, "Yatay %d" % (i + 1))
    elif i == 4: sayfa(d, 595, 842, "Rotate %d" % (i + 1), 90)
    else: sayfa(d, 595, 842, "Sayfa %d" % (i + 1))
ana = os.path.join(k, "ana.pdf"); d.save(ana); d.close()
d = pymupdf.open()
for i in range(2): sayfa(d, 595, 842, "Ek %d" % (i + 1))
ek = os.path.join(k, "ek.pdf"); d.save(ek); d.close()
def gorsel(ad, boyut, renk):
    y = os.path.join(k, ad); im = Image.new("RGB", boyut, renk); ImageDraw.Draw(im).rectangle((20, 20, boyut[0] - 21, boyut[1] - 21), outline=(0, 0, 0), width=12); im.save(y); return y
bozuk = os.path.join(k, "bozuk.pdf")
with open(bozuk, "wb") as f: f.write(b"%PDF-1.7 bu bir PDF degil")
print(json.dumps({"ana": ana, "ek": ek, "yatay": gorsel("yatay.png", (1600, 1000), (230, 120, 60)), "dikey": gorsel("dikey.jpg", (1000, 1600), (60, 140, 200)), "bozuk": bozuk}))`);
  await hepsiniKapat();
  for (let i = 0; i < 20 && (await evalJs(`window.pdefe.cagir('dosya:acDiyalog', { baslik: 'test kuyruğu boşaltma' })`))?.length; i++);
  await evalJs(`(() => { window.__oiHatalar = []; if (window.__oiDinleyici) return true; window.__oiDinleyici = true;
    addEventListener('error', (e) => window.__oiHatalar.push('error: ' + e.message)); addEventListener('unhandledrejection', (e) => window.__oiHatalar.push('reject: ' + (e.reason?.message || e.reason)));
    const ce = console.error; console.error = (...a) => { window.__oiHatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; return true; })()`);
  await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'otomatikKaydet', false); window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);
  const dpr = await evalJs('devicePixelRatio');
  const olcek = Math.min(2, dpr);
  console.log(`     ekran ölçeği ${dpr}, pencere ${await evalJs('innerWidth')}×${await evalJs('innerHeight')}`);

  // ---------------------------------------------------------------- 1) Sayfaları düzenle
  console.log('\n== 1) Sayfaları düzenle');
  await ac(Y.ana);
  await ornekYakala('sayfalar.js', 'SayfalarPenceresi');
  await evalJs(`window.__pdefe.komutCalistir('arac.sayfalar')`);
  await kosul(`!!document.querySelector('.sayfalar-pencere')`);
  await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 8 && [...document.querySelectorAll('.sayfalar-izgara img')].every((i) => i.complete)`, 15000);
  await bekle(300);
  const p = await evalJs(`(() => { const p = document.querySelector('.sayfalar-pencere'), iz = p.querySelector('.sayfalar-izgara'); const b = p.getBoundingClientRect();
    const kartlar = [...iz.querySelectorAll(':scope > .sayfa-karti')]; const t = kartlar[0].getBoundingClientRect().top;
    const kutular = kartlar.map((k) => { const r = k.querySelector('.resim-kutu').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    return { w: b.width, h: b.height, iw: innerWidth, ih: innerHeight, ust: b.top, degisken: getComputedStyle(p).getPropertyValue('--kart-resim').trim(),
      kutular: [...new Set(kutular.map((x) => JSON.stringify(x)))], sutun: kartlar.filter((k) => Math.abs(k.getBoundingClientRect().top - t) < 2).length, izIc: iz.clientWidth - 28 }; })()`);
  sonuc('kart resim kutusu --kart-resim = 220 px, bütün kartlarda 220 × 220', p.degisken === '220px' && J(p.kutular) === J([J([220, 220])]), { degisken: p.degisken, kutular: p.kutular });
  sonuc('pencere genişliği min(1320 px, 94vw); yükseklik 88vh ya da şeridin altına sığacak kadar', yakin(p.w, Math.min(1320, 0.94 * p.iw), 2) && yakin(p.h, Math.min(0.88 * p.ih, p.ih - p.ust - 12), 2), p);
  const beklenenSutun = Math.max(1, Math.floor((p.izIc + 12) / (240 + 12)));
  sonuc(`satırda ${beklenenSutun} sayfa (sütun en az kutu + 20 px)${p.iw >= 1280 ? '; 1280 px pencerede 4' : ''}`, p.sutun === beklenenSutun && (p.iw < 1280 || p.sutun >= 4), { sutun: p.sutun, beklenenSutun, izIc: p.izIc });
  const resimler = () => evalJs(`(() => [...document.querySelectorAll('.sayfalar-izgara > .sayfa-karti')].map((k) => { const i = k.querySelector('.resim-kutu img'), b = k.querySelector('.resim-kutu .bos-sayfa');
    const e = i || b; const r = e?.getBoundingClientRect(); return { no: +k.querySelector('.no').textContent, baslik: k.title, tur: i ? 'img' : b ? b.textContent : '',
      w: i ? i.width : b ? b.offsetWidth : 0, h: i ? i.height : b ? b.offsetHeight : 0, nw: i?.naturalWidth || 0, nh: i?.naturalHeight || 0, gw: r ? Math.round(r.width) : 0, gh: r ? Math.round(r.height) : 0,
      donus: e?.style.transform || '' }; }))()`);
  let R = await resimler();
  const yuklu = R.filter((r) => r.tur === 'img');
  const keskin = (r) => r.nw >= r.w * olcek - 1 && r.nh >= r.h * olcek - 1;
  sonuc('yüklenen resimlerin uzun kenarı 220 px', yuklu.length >= 8 && yuklu.every((r) => yakin(Math.max(r.w, r.h), 220)), yuklu.map((r) => [r.no, r.w, r.h]));
  sonuc(`resimler keskin: doğal boyut ≥ ekrandaki boyut × ${olcek}`, yuklu.every(keskin), yuklu.filter((r) => !keskin(r)).map((r) => [r.no, r.w, r.h, r.nw, r.nh]));
  const s1 = R[0], s3 = R[2], s5 = R[4];
  sonuc('dikey sayfa (1) 220 px yüksekliğinde, yatay sayfa (3) ve /Rotate 90 sayfa (5) 220 px genişliğinde', s1.h === 220 && s1.w < 220 && s3.w === 220 && s3.h < 220 && s5.w === 220 && s5.h < 220, { s1, s3, s5 });
  sonuc('yatay sayfa için istenen genişlik kutu × ölçek (yatayda doğal genişlik = 220 × ölçek)', s3.nw === Math.ceil(220 * olcek) && s5.nw === Math.ceil(220 * olcek), { s3: s3.nw, s5: s5.nw, beklenen: Math.ceil(220 * olcek) });
  const anahtarlar = await evalJs(`[...window.__oiOrnek.resimOnbellek.keys()].slice(0, 5).map((a) => a.split('|').slice(-2).join('|'))`);
  sonuc('önbellek anahtarı istenen genişliği içerir ("…|sayfa|genişlik")', anahtarlar.length > 0 && anahtarlar.every((a) => /^\d+\|\d+$/.test(a)) && anahtarlar.includes(`3|${Math.ceil(220 * olcek)}`), anahtarlar);
  await ss('01-sayfalar');
  // Ekran ölçeği değişince (pencere başka ölçekli ekrana taşındı) açık penceredeki yüklenmiş kartlar da yeni ölçeğe göre yeniden istenir:
  // sonradan yüklenen keskin kartlarla eski bulanık kartlar karışık kalmaz (bağımsız inceleme; Emulation ile, genişlik aynı)
  const yeniDpr = Math.min(2, dpr + 0.5);
  if (yeniDpr > dpr) {
    const c = await cdp();
    await c.gonder('Emulation.setDeviceMetricsOverride', { width: await evalJs('innerWidth'), height: await evalJs('innerHeight'), deviceScaleFactor: yeniDpr, mobile: false });
    const yeniOlcek = Math.min(2, yeniDpr);
    const ok = await kosul(`(() => { const iz = document.querySelector('.sayfalar-izgara'), ir = iz.getBoundingClientRect();
      const g = [...iz.querySelectorAll(':scope > .sayfa-karti')].filter((k) => { const r = k.getBoundingClientRect(); return r.bottom > ir.top && r.top < ir.bottom; }).map((k) => k.querySelector('.resim-kutu img'));
      return g.length > 0 && g.every((i) => i && i.complete && i.naturalWidth >= i.width * ${yeniOlcek} - 1 && i.naturalHeight >= i.height * ${yeniOlcek} - 1); })()`, 8000);
    sonuc(`ekran ölçeği ${dpr} → ${yeniDpr}: görünen kartlar yeni ölçeğe göre yeniden istendi (doğal boyut ≥ ekrandaki × ${yeniOlcek})`, !!ok, (await resimler()).slice(0, 8).map((r) => [r.no, r.w, r.h, r.nw, r.nh]));
    await c.gonder('Emulation.clearDeviceMetricsOverride'); c.kapat();
    await bekle(500);
  }
  // R ile döndürülen dikey resim kutudan taşmaz (görünen boyut: 220 × <220)
  const k1 = await merkez(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti')[0]`);
  await tikla(k1[0], k1[1] - 60);
  await tus('r');
  await bekle(400);
  R = await resimler();
  sonuc('R: dikey sayfa döner (rotate 90deg), döndürülmüş resim 220 px genişliğinde, kutudan taşmaz', R[0].donus === 'rotate(90deg)' && yakin(R[0].gw, 220, 2) && R[0].gh <= 221, R[0]);
  // Boş sayfa: yatay sayfanın (3) arkasına yatay, dikeyin (1) arkasına dikey; uzun kenar 220
  const k3 = await merkez(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti')[2]`);
  await tikla(k3[0], k3[1] - 60);
  await evalJs(`document.querySelector('.sayfalar-arac-cubugu [data-komut="bosEkle"]').click()`);
  await bekle(300);
  R = await resimler();
  const bos = R.find((r) => r.tur === 'Boş sayfa');
  sonuc('boş sayfa (yatay sayfanın arkasında) 220 px genişliğinde, sayfanın oranıyla', !!bos && bos.no === 4 && bos.w === 220 && yakin(bos.h, Math.round(220 * 595 / 842)), bos);
  // "yüklenemedi" yer tutucusu: çekirdek küçük resmi veremezse sayfanın oranıyla kutuya sığar (örneğin bağlamı yalnızca bu pencere için sarılır)
  await evalJs(`(() => { const o = window.__oiOrnek; const b = o.baglam; window.__oiBaglam = b;
    o.baglam = Object.assign(Object.create(b), { cekirdek: (y, prm, ...a) => y === 'kucuk_resim' ? Promise.reject(new Error('deneme hatası')) : b.cekirdek(y, prm, ...a) }); return true; })()`);
  await acYaniti([Y.ek]);
  await evalJs(`document.querySelector('.sayfalar-arac-cubugu [data-komut="pdfEkle"]').click()`);
  await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti').length === 15`, 8000);
  await kosul(`[...document.querySelectorAll('.sayfalar-izgara .bos-sayfa')].some((e) => e.textContent === 'yüklenemedi')`, 8000);
  R = await resimler();
  const hatali = R.filter((r) => r.tur === 'yüklenemedi');
  sonuc('"yüklenemedi" yer tutucusu dikey sayfanın oranıyla, 220 px yüksekliğinde', hatali.length >= 1 && hatali.every((r) => r.h === 220 && yakin(r.w, Math.round(220 * 595 / 842))), hatali);
  await evalJs(`(() => { window.__oiOrnek.baglam = window.__oiBaglam; delete window.__oiBaglam; return true; })()`);
  await ss('01-sayfalar-bos-hata');
  await hepsiniKapat();

  // ---------------------------------------------------------------- 2) Görüntü / PDF birleştir
  console.log('\n== 2) Görüntü / PDF birleştir');
  await ac(Y.ana);
  await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir')`);
  await kosul(`!!document.querySelector('.birlestir-pencere') && document.querySelectorAll('.birlestir-oge').length === 1 && !document.querySelector('.birlestir-oge.yukleniyor')`);
  await acYaniti([Y.yatay, Y.dikey, Y.bozuk]);
  await evalJs(`document.querySelector('.birlestir-ekle').click()`);
  await kosul(`document.querySelectorAll('.birlestir-oge').length === 4 && !document.querySelector('.birlestir-oge.yukleniyor')`, 15000);
  await bekle(400);
  const satirlar = () => evalJs(`[...document.querySelectorAll('.birlestir-liste > .birlestir-oge')].map((e) => { const k = e.querySelector('.resim').getBoundingClientRect(); const i = e.querySelector('.resim img'), y = e.querySelector('.resim .yer');
    const g = (i || y)?.getBoundingClientRect(); return { ad: e.querySelector('.ad').textContent, kutu: [Math.round(k.width), Math.round(k.height)], tur: i ? 'img' : y ? 'yer' : '',
      w: i ? i.width : y ? y.offsetWidth : 0, h: i ? i.height : y ? y.offsetHeight : 0, nw: i?.naturalWidth || 0, nh: i?.naturalHeight || 0,
      gw: g ? Math.round(g.width) : 0, gh: g ? Math.round(g.height) : 0, sutun: getComputedStyle(e).gridTemplateColumns, donus: i?.style.transform || '', satirH: Math.round(e.getBoundingClientRect().height) }; })`);
  let S = await satirlar();
  const degisken = await evalJs(`getComputedStyle(document.querySelector('.birlestir-pencere')).getPropertyValue('--birlestir-resim').trim()`);
  sonuc('önizleme kutusu --birlestir-resim = 120 px, her satırda 120 × 120; satırın üçüncü sütunu 120 px', degisken === '120px' && S.every((s) => J(s.kutu) === J([120, 120]) && s.sutun.split(' ')[2] === '120px'), { degisken, S: S.map((s) => [s.ad, s.kutu, s.sutun]) });
  const [sPdf, sYatay, sDikey, sBozuk] = S;
  sonuc('PDF (dikey sayfa) ve dikey görsel 120 px yüksekliğinde, yatay görsel 120 px genişliğinde', sPdf.h === 120 && sPdf.w < 120 && sDikey.h === 120 && sDikey.w < 120 && sYatay.w === 120 && sYatay.h < 120, { sPdf, sYatay, sDikey });
  const enAz = Math.max(144, Math.ceil(120 * olcek));
  sonuc(`küçük resimler keskin: istenen genişlik max(144, 120 × ${olcek}) = ${enAz}, doğal boyut ≥ ekrandaki × ${olcek}`, [sPdf, sYatay, sDikey].every((s) => s.nw === enAz && s.nw >= s.w * olcek - 1 && s.nh >= s.h * olcek - 1), [sPdf, sYatay, sDikey].map((s) => [s.ad, s.w, s.h, s.nw, s.nh]));
  sonuc('okunamayan dosyanın yer tutucusu kutunun %72 × %94\'ü (86 × 113 px), türü yazar', sBozuk.tur === 'yer' && yakin(sBozuk.w, 120 * 0.72, 1) && yakin(sBozuk.h, 120 * 0.94, 1), sBozuk);
  sonuc('satır yüksekliği önizlemeye göre (120 + boşluk)', S.every((s) => s.satirH >= 120 && s.satirH <= 140), S.map((s) => s.satirH));
  await ss('02-birlestir');
  // Döndür: yatay görsel sağa döner, döndürülmüş resim kutudan taşmaz
  await evalJs(`document.querySelectorAll('.birlestir-oge')[1].querySelector('[data-komut="saga"]').click()`);
  await bekle(400);
  S = await satirlar();
  sonuc('Sağa döndür: yatay görsel döner (rotate 90deg), görünen boyutu 75 × 120, kutudan taşmaz', S[1].donus === 'rotate(90deg)' && S[1].gh <= 121 && S[1].gw <= 121 && yakin(S[1].gh, 120, 2), S[1]);
  // Sürükleyerek sıralama (gerçek fare): ilk satır (PDF) önizlemesinden tutulup üçüncü satırın alt yarısına bırakılır (eklenen dosyalar
  // listeyi sona kaydırmıştı: önce başa dönülür)
  await evalJs(`document.querySelector('.birlestir-liste').scrollTop = 0`);
  await bekle(150);
  const ilk = await merkez(`document.querySelectorAll('.birlestir-oge')[0].querySelector('.resim')`);
  const ucuncu = await evalJs(`(() => { const r = document.querySelectorAll('.birlestir-oge')[2].getBoundingClientRect(); return [Math.round(r.left + 60), Math.round(r.top + r.height * 0.6)]; })()`);
  await surukle(ilk[0], ilk[1], ucuncu[0], ucuncu[1], { adim: 16 });
  await bekle(400);
  S = await satirlar();
  sonuc('sürükleyerek sıralama: ilk satır üçüncünün arkasına taşınır', J(S.map((s) => s.ad)) === J(['yatay.png', 'dikey.jpg', 'ana.pdf', 'bozuk.pdf']), S.map((s) => s.ad));
  // Listeden çıkar
  await evalJs(`document.querySelectorAll('.birlestir-oge')[3].querySelector('[data-komut="sil"]').click()`);
  await bekle(300);
  S = await satirlar();
  sonuc('Listeden çıkar: satır kalkar, kalanların kutusu 120 × 120', J(S.map((s) => s.ad)) === J(['yatay.png', 'dikey.jpg', 'ana.pdf']) && S.every((s) => J(s.kutu) === J([120, 120])), S.map((s) => [s.ad, s.kutu]));
  await hepsiniKapat();

  // ---------------------------------------------------------------- 3) hata yok
  const hatalar = await evalJs(`window.__oiHatalar`);
  sonuc('renderer konsolunda hata yok', hatalar.length === 0, hatalar);
  console.log(`\n${denetimSayisi} denetim; ${hataSayisi ? hataSayisi + ' hata' : 'hepsi geçti'}  (ekran görüntüleri: ${PNG})`);
}
