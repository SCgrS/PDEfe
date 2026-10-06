// Senaryo 25 (0.1.24): menü çubuğu düğmesi, belge görünümünün kalın kaydırma çubuğu (0.2.2'de 16 → 20 px; iki çubuk birlikteyken sağ alt
// köşe zemin renginde, açık ve koyu temada ekran görüntüsünden), görsellerdeki yazının tanınması.
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9425 -Veri "%TEMP%\pdefe-s25-9425"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9425; node test\surucu.mjs betik test\senaryo25.mjs
// Örnek PDF test/tanima_pdf_uret.py ile test/cikti/tanima altına üretilir (betik kendisi çalıştırır). Pano kullanılmaz: kopyalama sahte
// bir copy olayıyla (DataTransfer) sınanır; çekirdeğin temiz metni test örneğinde panoya yazılmaz, test:diyalogKaydi'na düşer.
// Tanıma Windows'un yazı tanıyıcısını ister (Türkçe dil paketi); yoksa tanıma denetimleri düşer.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = path.join(KOK, 'test', 'cikti', 'tanima');
const PDF = path.join(CIKTI, 'taranmis.pdf');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

// Sayfa n'nin metin katmanındaki öğeler: metin, sayfaya göre kesirli konum (sol, üst, sağ, alt) ve ekrandaki kutu
const katmanOgeleri = (n) => `(() => {
  const g = window.__pdefe.aktif().gorunum, s = g.sayfalar[${n} - 1];
  const k = s.el.querySelector(':scope > .textLayer');
  if (!k) return null;
  const sr = s.el.getBoundingClientRect();
  return [...k.querySelectorAll('span')].filter((e) => e.textContent.trim()).map((e) => { const r = e.getBoundingClientRect();
    return { m: e.textContent.trim(), sol: (r.left - sr.left) / sr.width, ust: (r.top - sr.top) / sr.height, sag: (r.right - sr.left) / sr.width, alt: (r.bottom - sr.top) / sr.height,
      x: r.left, y: r.top, w: r.width, h: r.height }; });
})()`;

export default async function ({ evalJs, bekle, tikla, surukle, ekranGoruntusu }) {
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  const menu = () => evalJs(`window.pdefe.cagir('test:menuCubugu')`);
  const dugme = () => evalJs(`(() => { const d = document.querySelector('#dugme-menu'); const r = d.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2,
    basili: d.getAttribute('aria-pressed'), secili: d.classList.contains('secili'), baslik: d.title, sonraki: d.nextElementSibling?.dataset.komut }; })()`);
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), [path.join(KOK, 'test', 'tanima_pdf_uret.py'), CIKTI], { stdio: 'inherit' });

  // ---------------------------------------------------------------- 1. Menü çubuğu
  console.log('— Menü çubuğu');
  const m0 = await menu(), d0 = await dugme();
  sonuc('Varsayılan: menü çubuğu gizli, Alt ile geçici açılır', m0 && !m0.gorunur && m0.otoGizle, m0);
  sonuc('Düğme kopyala düğmesinin yanında, basılı değil', d0.sonraki === 'arac.paylas' && d0.basili === 'false' && !d0.secili && d0.baslik === 'Menü çubuğunu göster', d0);
  const ic0 = await evalJs('window.innerHeight');
  await tikla(d0.x, d0.y);
  await kosul(`window.pdefe.cagir('test:menuCubugu').then((m) => m.gorunur)`, 3000);
  const m1 = await menu(), d1 = await dugme();
  sonuc('Tıklayınca menü çubuğu görünür (Alt gizlemesi kapanır)', m1.gorunur && !m1.otoGizle, m1);
  sonuc('İçerik alanı menü çubuğu kadar kısalır, pencere boyu değişmez', m1.icerikYuksekligi < m0.icerikYuksekligi - 10 && m1.disYukseklik === m0.disYukseklik, { m0, m1 });
  await kosul(`window.innerHeight < ${ic0}`, 3000);
  sonuc('Sayfanın yüksekliği de kısaldı', (await evalJs('window.innerHeight')) < ic0);
  sonuc('Düğme basılı, ipucu "gizle"', d1.basili === 'true' && d1.secili && d1.baslik === 'Menü çubuğunu gizle', d1);
  sonuc('Seçim ayara yazıldı', (await evalJs(`window.pdefe.cagir('ayar:al', 'menuCubugu')`)) === true);
  // Arayüz yeniden yüklenince düğme ayarı gösterir; menü çubuğu ana süreçte açık kalır
  await evalJs('location.reload(), 1').catch(() => {});
  await bekle(800);
  await kosul(`!!window.__pdefe && document.querySelector('#dugme-menu')?.getAttribute('aria-pressed') === 'true'`, 10000);
  const d2 = await dugme(), m2 = await menu();
  sonuc('Yeniden yüklenince düğme basılı, çubuk görünür', d2.basili === 'true' && m2.gorunur, { d2, m2 });
  await tikla(d2.x, d2.y);
  await kosul(`window.pdefe.cagir('test:menuCubugu').then((m) => !m.gorunur)`, 3000);
  const m3 = await menu(), d3 = await dugme();
  sonuc('Yeniden tıklayınca gizlenir, içerik alanı eski boyuna döner', !m3.gorunur && m3.otoGizle && m3.icerikYuksekligi === m0.icerikYuksekligi, m3);
  sonuc('Düğme basılı değil, ayar false', d3.basili === 'false' && (await evalJs(`window.pdefe.cagir('ayar:al', 'menuCubugu')`)) === false, d3);

  // ---------------------------------------------------------------- 2. Kaydırma çubuğu
  console.log('— Kaydırma çubuğu');
  await evalJs(`window.__pdefe.dosyaAc(${J(PDF)}).then(() => 1)`);
  await kosul(`window.__pdefe.aktif()?.gorunum.hazir`, 10000);
  await bekle(500);
  const cubuk = await evalJs(`(() => { const k = window.__pdefe.aktif().gorunum.kaydirici;
    const o = document.createElement('div'); o.style.cssText = 'position:absolute;left:-999px;width:100px;height:100px;overflow:scroll'; document.body.append(o);
    const genel = o.offsetWidth - o.clientWidth; o.remove();
    return { belge: k.offsetWidth - k.clientWidth, yatayVar: k.scrollWidth > k.clientWidth, genel, zoom: window.__pdefe.aktif().gorunum.zoomModu }; })()`);
  sonuc('Belgenin dikey çubuğu 20 px (0.2.2; 0.1.24\'te 16, önceden 12)', cubuk.belge === 20, cubuk);
  sonuc('Öteki çubuklar (paneller) değişmedi: 12 px', cubuk.genel === 12, cubuk);
  sonuc('Genişliğe sığdırılmış belgede yatay çubuk yok', !cubuk.yatayVar, cubuk);
  // İki çubuk birlikteyken sağ alt köşe (0.2.2): beyaz kare kalmamalı, zemin rengi (boş çubuk yolu gibi) görünmeli; açık ve koyu temada
  const koseOlc = async () => {
    await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; g.zoomAyarla(3); g.kaydirici.scrollTop = 0; g.kaydirici.scrollLeft = 0; return 1; })()`); await bekle(600);
    const k = await evalJs(`(() => { const e = window.__pdefe.aktif().gorunum.kaydirici, r = e.getBoundingClientRect(), cw = e.offsetWidth - e.clientWidth, ch = e.offsetHeight - e.clientHeight;
      return { dpr: devicePixelRatio, cw, ch, kose: [r.right - cw / 2, r.bottom - ch / 2], yol: [r.right - cw / 2, r.bottom - ch - 30], tema: document.documentElement.dataset.tema }; })()`);
    const png = await ekranGoruntusu(path.join(CIKTI, `kose-${k.tema}.png`));
    const p = (n) => n.map((v) => Math.round(v * k.dpr));
    const [kose, yol] = JSON.parse(execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), ['-c',
      `import json,sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGB')\nprint(json.dumps([im.getpixel(tuple(json.loads(sys.argv[2]))), im.getpixel(tuple(json.loads(sys.argv[3])))]))`,
      png, J(p(k.kose)), J(p(k.yol))], { encoding: 'utf8' }));
    return { ...k, renk: { kose, yol }, ayni: kose.every((v, i) => Math.abs(v - yol[i]) <= 6) };
  };
  for (let i = 0; i < 2; i++) {
    const k = await koseOlc();
    sonuc(`İki çubuk birlikteyken sağ alt köşe zemin renginde, beyaz kare yok (${k.tema} tema)`, k.cw === 20 && k.ch === 20 && k.ayni, k);
    await evalJs(`(window.__pdefe.komutCalistir('gorunum.tema'), 1)`); await bekle(500);
  }
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.zoom', 'genislik'), 1)`); await bekle(500);

  // ---------------------------------------------------------------- 3. Görsellerdeki yazı
  console.log('— Görsellerdeki yazı');
  const sayfaGit = async (n) => { await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(${n}, { aninda: true }), 1`); await bekle(300); };
  const bul = (ogeler, m) => (ogeler || []).filter((o) => o.m === m);
  await sayfaGit(1);
  await kosul(`(${katmanOgeleri(1)} || []).some((o) => o.m === 'DAİRESİ')`, 10000);
  const o1 = await evalJs(katmanOgeleri(1));
  sonuc('Taranmış sayfa: tanınan sözcükler metin katmanında', ['T.C.', 'DENEME', 'DAİRESİ', 'kesinleşmiş', 'müzekkere', '01.10.2026'].every((m) => bul(o1, m).length === 1), o1?.map((o) => o.m).join(' '));
  const imza1 = (o1 || []).filter((o) => o.m.includes('elektronik'));   // PDF.js satırı tek öğe verir, tanınan satır sözcük sözcük
  sonuc('PDF metni olan satır ikinci kez eklenmedi', imza1.length === 1 && imza1[0].m.startsWith('Bu belge'), imza1);
  const tc = bul(o1, 'T.C.')[0], dai = bul(o1, 'DAİRESİ')[0];
  sonuc('Tanınan sözcük görseldeki yerinde (sol ~%30, üst ~%11–13)', tc && Math.abs(tc.sol - 180 / 595) < 0.012 && tc.ust > 0.10 && tc.ust < 0.125 && tc.alt > 0.125 && tc.alt < 0.145, tc);
  sonuc('Aynı satırın sözcükleri aynı yükseklikte', tc && dai && Math.abs(tc.ust - dai.ust) < 0.002 && Math.abs(tc.alt - dai.alt) < 0.002, { tc, dai });

  // Fareyle seçim ve kopyalama
  const dosya = bul(o1, 'Dosya')[0], olunur = bul(o1, 'olunur.')[0];
  await surukle(dosya.x + 1, dosya.y + dosya.h / 2, olunur.x + olunur.w - 1, olunur.y + olunur.h / 2);
  await bekle(300);
  const secim = await evalJs('window.getSelection().toString()');
  sonuc('Fareyle sürükleyince tanınan yazı seçiliyor', /kesinleşmiş/.test(secim) && /müzekkere/.test(secim) && /olunur/.test(secim), secim);
  await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const kopya = await evalJs(`(() => { const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData('text/plain'); })()`);
  sonuc('Kopya: satırlar paragrafta birleşir', /Borçlu hakkında yapılan takip kesinleşmiş olup haczi kabil malların bildirilmesi/.test(kopya), kopya);
  await bekle(1500);
  const kayit = await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const temiz = kayit.filter((x) => x.kanal === 'pano:metin').at(-1)?.secenek;
  sonuc('Çekirdeğin temiz metni de tanınan yazıyı içerir (koşullu, panoya yalnızca kopya duruyorsa)', temiz?.kosullu && /^Dosya No: 2099\/123 Esas/.test(temiz.bas) && /kesinleşmiş olup haczi kabil malların/.test(temiz.bas), temiz);
  await evalJs('window.getSelection().removeAllRanges(), 1');

  // Yan çevrilmiş taranmış sayfa
  await sayfaGit(2);
  await kosul(`(${katmanOgeleri(2)} || []).some((o) => o.m === 'DAİRESİ')`, 10000);
  const o2 = await evalJs(katmanOgeleri(2));
  const tc2 = bul(o2, 'T.C.')[0];
  sonuc('Yan çevrilmiş sayfa: sözcükler ekranda düz (yatay) ve yerinde', tc2 && tc2.w > tc2.h && Math.abs(tc2.sol - 180 / 595) < 0.015 && tc2.ust > 0.10 && tc2.ust < 0.125, tc2);
  sonuc('Yan çevrilmiş sayfa: görseldeki imza satırı da tanındı', bul(o2, 'elektronik').length === 1, o2?.map((o) => o.m).join(' '));
  const metin2 = await evalJs(`window.pdefe.cagir('cekirdek:cagir', 'metin_sec', { yol: ${J(PDF)}, sayfa: 2, kutular: [[0, 0, 900, 900]] }).then((r) => r.metin)`);
  sonuc('Yan çevrilmiş sayfa: kopyada satırlar okuma sırasıyla', /^Bu belge elektronik[\s\S]*T\.C\. DENEME[\s\S]*Dosya No[\s\S]*Borçlu[\s\S]*malların[\s\S]*ödeme/.test(metin2), metin2);

  // Görselsiz, önceden tanınmış ve karışık sayfalar
  await sayfaGit(3);
  await kosul(`(${katmanOgeleri(3)} || []).length > 0`, 8000);
  await bekle(800);
  const o3 = await evalJs(katmanOgeleri(3));
  sonuc('Görselsiz sayfa: yalnızca PDF metni', o3 && o3.length > 0 && o3.every((o) => /görsel|yok|Yalnızca|PDF|metni|var|Bu|sayfada/.test(o.m)), o3?.map((o) => o.m).join(' '));
  await sayfaGit(4);
  await kosul(`(${katmanOgeleri(4)} || []).some((o) => o.m === 'DAİRESİ' || o.m.includes('DAİRESİ'))`, 8000);
  await bekle(1200);
  const o4 = await evalJs(katmanOgeleri(4));
  const tanima4 = await evalJs(`window.__pdefe.aktif().gorunum.sayfalar[3].tanima`);
  sonuc('Önceden tanınmış sayfa yeniden tanınmadı (yazı iki kez yok)', tanima4 && tanima4.satirlar.length === 0 && o4.filter((o) => o.m.includes('DAİRESİ')).length === 1, { tanima4, o4: o4?.map((o) => o.m).join('|') });
  await sayfaGit(5);
  await kosul(`(${katmanOgeleri(5)} || []).some((o) => o.m === 'GİBİDİR')`, 10000);
  const o5 = await evalJs(katmanOgeleri(5));
  sonuc('Karışık sayfa: kaşe görselindeki yazı tanındı, PDF metni bir kez', bul(o5, 'GİBİDİR').length === 1 && bul(o5, 'Kâtibi').length === 1 && o5.filter((o) => o.m.includes('Karışık')).length === 1, o5?.map((o) => o.m).join(' '));

  // Katman yeniden kurulunca (yakınlaştırma, kaydırıp dönme) tanınan yazı yeniden istenmeden yerinde
  await evalJs(`window.__pdefe.komutCalistir('gorunum.zoom', 'sayfa'), 1`);
  await bekle(600);
  await sayfaGit(1);
  await kosul(`(${katmanOgeleri(1)} || []).some((o) => o.m === 'DAİRESİ')`, 8000);
  const o1b = await evalJs(katmanOgeleri(1));
  const tc1b = bul(o1b, 'T.C.')[0];
  sonuc('Sayfayı sığdırınca tanınan yazı yine yerinde', tc1b && Math.abs(tc1b.sol - 180 / 595) < 0.012 && tc1b.ust > 0.10 && tc1b.ust < 0.125, tc1b);
  await evalJs(`window.__pdefe.komutCalistir('gorunum.zoom', 'genislik'), 1`);

  // Bul tanınan yazıyı aramaz, PDF metnini bulur ve vurgular (öğe sırası bozulmadı)
  await evalJs(`window.__pdefe.komutCalistir('duzen.bul', 'Yalnızca'), 1`);
  await kosul(`!!document.querySelector('.textLayer .highlight')`, 8000);
  const vurgu = await evalJs(`[...document.querySelectorAll('.textLayer .highlight')].map((e) => e.textContent)`);
  sonuc('Bul: PDF metnindeki eşleşme vurgulanır', vurgu.length >= 1 && vurgu.every((v) => v === 'Yalnızca'), vurgu);

  await evalJs(`window.__pdefe.komutCalistir('sekme.kapat'), 1`);
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti`);
  if (hataSayisi) process.exitCode = 1;
}
