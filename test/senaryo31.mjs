// Senaryo 31 (0.2.4): yazısı ekranda yan ya da ters duran taranmış sayfa (sayfa döndürülmemiş; yatay belge dik sayfaya yatırılıp ya da
// sayfa ters taranmış). Tanıyıcı yazıyı çevirerek okur; tanınan sözcükler metin katmanında yazıyla birlikte dikey / ters ve görseldeki
// yerinde durur, fareyle sürükleyince okuma sırasıyla seçilir, kopya satırları okuma sırasıyla verir; sayfa ekranda döndürülünce (Ctrl+R)
// sözcükler sayfayla döner, kopya aynı kalır. Yazısız görselde yazı çıkmaz, az sözcüklü dik kaşe dik kalır. Ekranda ve dosyada bir şey
// değişmez (sayfa döndürülmez).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9431 -Veri "%TEMP%\pdefe-s31-9431"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9431; node test\surucu.mjs betik test\senaryo31.mjs
// Örnek PDF test/tanima_pdf_uret.py ile test/cikti/tanima altına üretilir (betik kendisi çalıştırır). Pano kullanılmaz (senaryo25 gibi).
// Tanıma Windows'un yazı tanıyıcısını ister (Türkçe dil paketi).
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = path.join(KOK, 'test', 'cikti', 'tanima');
const PDF = path.join(CIKTI, 'yan.pdf');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

// Sayfa n'nin metin katmanındaki öğeler: metin, sayfaya göre kesirli orta nokta, ekrandaki kutu ve yazı yönü (metin.js metinDonmesi gibi:
// katmanın döndürmesi + öğenin --rotate'i, 0/90/180/270)
const katmanOgeleri = (n) => `(() => {
  const g = window.__pdefe.aktif().gorunum, s = g.sayfalar[${n} - 1];
  const k = s.el.querySelector(':scope > .textLayer');
  if (!k) return null;
  const sr = s.el.getBoundingClientRect(), ana = parseFloat(k.dataset.mainRotation) || 0;
  return [...k.querySelectorAll('span')].filter((e) => e.textContent.trim()).map((e) => { const r = e.getBoundingClientRect();
    const d = ((Math.round((ana + (parseFloat(e.style.getPropertyValue('--rotate')) || 0)) / 90) * 90) % 360 + 360) % 360;
    return { m: e.textContent.trim(), ox: (r.left + r.width / 2 - sr.left) / sr.width, oy: (r.top + r.height / 2 - sr.top) / sr.height,
      x: r.left, y: r.top, w: r.width, h: r.height, d }; });
})()`;

// Dik içerikte (595×842 pt) "T.C."nin ortası (192, 105) yan / ters sayfada nereye düşer (tanima_pdf_uret.yan_nokta), sayfaya göre kesirli
const SAYFALAR = [
  { n: 1, ad: 'saat yönünün tersine 90° (aşağıdan yukarı)', d: 270, tc: [105 / 842, 403 / 595] },
  { n: 2, ad: 'ters (180°)', d: 180, tc: [403 / 595, 737 / 842] },
  { n: 3, ad: 'saat yönünde 90° (yukarıdan aşağı)', d: 90, tc: [737 / 842, 192 / 595] },
];
const SIRA = /^Bu belge elektronik[\s\S]*T\.C\. DENEME[\s\S]*Dosya No[\s\S]*Borçlu[\s\S]*malların[\s\S]*ödeme[\s\S]*İstanbul/;

export default async function ({ evalJs, bekle, surukle }) {
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  const sayfaGit = async (n) => { await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(${n}, { aninda: true }), 1`); await bekle(300); };
  const bul = (ogeler, m) => (ogeler || []).filter((o) => o.m === m);
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), [path.join(KOK, 'test', 'tanima_pdf_uret.py'), CIKTI], { stdio: 'inherit' });

  await evalJs(`window.__pdefe.dosyaAc(${J(PDF)}).then(() => 1)`);
  await kosul(`window.__pdefe.aktif()?.gorunum.hazir`, 10000);
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.zoom', 'sayfa'), 1)`);
  await bekle(500);
  const donmeler = await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; return [g.gorunumDondurme, ...g.sayfalar.map((s) => s.dondurme || 0)]; })()`);
  sonuc('Sayfalar ekranda döndürülmedi, kaydedilecek değişiklik yok', Array.isArray(donmeler) && donmeler.every((d) => !d), donmeler);

  // ---------------------------------------------------------------- 1. Tanınan sözcükler yerinde ve yazıyla aynı yönde
  console.log('— Yan ve ters sayfalar');
  for (const S of SAYFALAR) {
    await sayfaGit(S.n);
    await kosul(`(${katmanOgeleri(S.n)} || []).some((o) => o.m === 'DAİRESİ')`, 15000);
    const o = await evalJs(katmanOgeleri(S.n));
    sonuc(`${S.ad}: tanınan sözcükler metin katmanında`, ['T.C.', 'DENEME', 'DAİRESİ', 'kesinleşmiş', 'müzekkere', '01.10.2026'].every((m) => bul(o, m).length === 1), o?.map((x) => x.m).join(' '));
    const tc = bul(o, 'T.C.')[0];
    sonuc(`${S.ad}: "T.C." görseldeki yerinde`, tc && Math.abs(tc.ox - S.tc[0]) < 0.03 && Math.abs(tc.oy - S.tc[1]) < 0.03, { tc, beklenen: S.tc });
    const yonler = [...new Set((o || []).map((x) => x.d))];
    sonuc(`${S.ad}: bütün sözcükler ekranda yazıyla aynı yönde (${S.d}°)`, yonler.length === 1 && yonler[0] === S.d, yonler);
    sonuc(`${S.ad}: sözcüğün kutusu yazının yönünde uzun`, tc && (S.d === 180 ? tc.w > tc.h : tc.h > tc.w), tc);
    const metin = await evalJs(`window.pdefe.cagir('cekirdek:cagir', 'metin_sec', { yol: ${J(PDF)}, sayfa: ${S.n}, kutular: [[0, 0, 900, 900]] }).then((r) => r.metin)`);
    sonuc(`${S.ad}: çekirdeğin kopyası okuma sırasıyla`, SIRA.test(metin), metin);
  }

  // ---------------------------------------------------------------- 2. Fareyle seçim ve kopya (aşağıdan yukarı okunan sayfada)
  console.log('— Fareyle seçim (aşağıdan yukarı okunan sayfa)');
  await sayfaGit(1);
  await kosul(`(${katmanOgeleri(1)} || []).some((o) => o.m === 'DAİRESİ')`, 10000);
  const o1 = await evalJs(katmanOgeleri(1));
  const dosya = bul(o1, 'Dosya')[0], olunur = bul(o1, 'olunur.')[0];
  // Yazı aşağıdan yukarı okunuyor: sözcüğün başı kutunun altında, sonu üstünde
  await surukle(dosya.x + dosya.w / 2, dosya.y + dosya.h - 1, olunur.x + olunur.w / 2, olunur.y + 1);
  await bekle(300);
  const secim = await evalJs('window.getSelection().toString()');
  sonuc('Fareyle sürükleyince tanınan yazı seçiliyor', /Dosya/.test(secim) && /kesinleşmiş/.test(secim) && /müzekkere/.test(secim) && /olunur/.test(secim), secim);
  sonuc('Seçime başlığa ya da alttaki imza satırına taşmadı', !/DAİRESİ/.test(secim) && !/İstanbul/.test(secim), secim);
  await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const kopya = await evalJs(`(() => { const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData('text/plain'); })()`);
  sonuc('Kopya: okuma sırasıyla, satırlar paragrafta birleşir', /^Dosya No: 2099\/123 Esas/.test(kopya) && /Borçlu hakkında yapılan takip kesinleşmiş olup haczi kabil malların bildirilmesi/.test(kopya), kopya);
  await bekle(1500);
  const kayit = await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const temiz = kayit.filter((x) => x.kanal === 'pano:metin').at(-1)?.secenek;
  sonuc('Çekirdeğin temiz metni de okuma sırasıyla, kopya uzunluğunda (bas: ilk 200 karakter)', temiz?.kosullu && /^Dosya No: 2099\/123 Esas/.test(temiz.bas)
    && /kesinleşmiş olup haczi kabil malların/.test(temiz.bas) && Math.abs(temiz.uzunluk - kopya.length) <= 0.1 * kopya.length, { temiz, kopya: kopya.length });
  await evalJs('window.getSelection().removeAllRanges(), 1');

  // ---------------------------------------------------------------- 3. Ekranda döndürünce (Ctrl+R): sözcükler sayfayla döner, seçim ve kopya aynı
  console.log('— Ekranda döndürünce');
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.dondur', 90), 1)`);
  await kosul(`window.__pdefe.aktif().gorunum.sayfalar[0].dondurme === 90`, 5000);
  await kosul(`(${katmanOgeleri(1)} || []).some((o) => o.m === 'DAİRESİ')`, 10000);
  await bekle(300);
  const r1 = await evalJs(katmanOgeleri(1));
  sonuc('Sayfa 90° döndürülünce yazı ve sözcükler ekranda dik', (r1 || []).length > 30 && r1.every((x) => x.d === 0), [...new Set((r1 || []).map((x) => x.d))]);
  await evalJs(`(() => { const k = window.__pdefe.aktif().gorunum.sayfalar[0].el.querySelector(':scope > .textLayer');
    [...k.querySelectorAll('span')].find((x) => x.textContent.startsWith('Borçlu')).scrollIntoView({ block: 'center', inline: 'center' }); return 1; })()`);
  await bekle(400);
  const r2 = await evalJs(katmanOgeleri(1)), d2 = bul(r2, 'Dosya')[0], u2 = bul(r2, 'olunur.')[0];
  await surukle(d2.x + 1, d2.y + d2.h / 2, u2.x + u2.w - 1, u2.y + u2.h / 2);
  await bekle(300);
  const kopya2 = await evalJs(`(() => { const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData('text/plain'); })()`);
  sonuc('Döndürülmüş görünümde fareyle seçim ve kopya aynı', kopya2 === kopya, { kopya2, kopya });
  await evalJs('window.getSelection().removeAllRanges(), 1');
  await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), 1)`);
  await kosul(`window.__pdefe.aktif().gorunum.sayfalar[0].dondurme === 0`, 5000);
  sonuc('Geri alınınca sayfa eski yönünde', (await evalJs(`window.__pdefe.aktif().gorunum.sayfalar[0].dondurme`)) === 0);

  // ---------------------------------------------------------------- 4. Yazısız görsel ve dik kaşe
  console.log('— Yazısız görsel, dik kaşe');
  await sayfaGit(4);
  await kosul(`(() => { const t = window.__pdefe.aktif().gorunum.sayfalar[3].tanima; return !!t && Array.isArray(t.satirlar); })()`, 15000);
  const t4 = await evalJs(`window.__pdefe.aktif().gorunum.sayfalar[3].tanima`);
  const o4 = await evalJs(katmanOgeleri(4));
  sonuc('Yazısız görsel: hiçbir yönde yazı bulunmadı', t4 && t4.satirlar.length === 0 && (o4 || []).length === 0, { t4, o4 });
  await sayfaGit(5);
  await kosul(`(${katmanOgeleri(5)} || []).some((o) => o.m === 'GİBİDİR')`, 15000);
  const o5 = await evalJs(katmanOgeleri(5));
  sonuc('Dik kaşe: tanındı, yazı yatay (yön değişmedi)', bul(o5, 'GİBİDİR').length === 1 && bul(o5, 'Kâtibi').length === 1 && (o5 || []).every((x) => x.d === 0), o5);

  await evalJs(`window.__pdefe.komutCalistir('sekme.kapat'), 1`);
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti`);
  if (hataSayisi) process.exitCode = 1;
}
