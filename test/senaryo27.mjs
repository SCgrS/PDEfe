// Senaryo 27 (0.1.27, kullanıcı istekleri): Döndür aracının adı ve açıklamaları, Sayfaları düzenle'nin yeri, sorusuz Döndür düğmesi.
//   1) "Döndür ve kaydet" her yerde "Döndür" (Araçlar penceresi, Araçlar menüsü, açılış ekranı, pencere başlığı ve düğmesi); açıklaması
//      "Sayfaları döndürür"; Sayfaları düzenle'nin açıklaması "Sıralar, siler, döndürür, sayfa ekler".
//   2) Sayfaları düzenle penceresi Birleştir'deki gibi sekme şeridinin altında başlar, etkin sekme görünür; okuma kipinde ortada.
//   3) Döndür düğmesi (araç çubuğu, Ctrl+R / Ctrl+Shift+R) sormaz, yalnızca geçerli sayfayı döndürür (eski "Tüm PDF" tercihi de yok
//      sayılır); geri alınır; yazı kutusu düzenlenirken basılırsa yazı not olarak kalır, sayfa döner. Etiketler "Sayfayı … döndür".
//   4) Ayarlar › Açılış ve düzen'de "Döndür düğmesi" yok. Örnek, veri klasöründe eski ayarla (dondurmeKapsami: "tum") başlatıldıysa
//      ($env:S27_ESKI_AYAR="1") o ayarın açılışta silindiği de denetlenir.
// Girdiler test/cikti/s27/pdf altında üretilir.
// Kullanım:
//   $v="$env:TEMP\pdefe-s27-9427"; mkdir $v; Set-Content "$v\ayarlar.json" '{"dondurmeKapsami":"tum"}'   (isteğe bağlı: eski ayar)
//   powershell -File test\baslat.ps1 -Port 9427 -Veri $v      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9427; $env:S27_ESKI_AYAR="1"; node test\surucu.mjs betik test\senaryo27.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bir bölüm: $env:BOLUM="3" (virgülle birden çok). Ekran görüntüleri test/cikti/s27/png altına yazılır.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's27');
const PDF = path.join(UI, 'pdf');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, yaz, tus }) {
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
  const sekmeleriKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return window.__pdefe.belgeler.size; })()`);
  const ac = async (yol) => {
    const r = await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); return !!b; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(300);
    return r;
  };
  const aracAc = async (komut, sinif) => { await evalJs(`window.__pdefe.komutCalistir(${J(komut)})`); await kosul(`!!document.querySelector('.${sinif}')`); await bekle(500); };
  const pencereKapat = async () => {
    await evalJs(`document.querySelector('.arac-pencere .arac-kapat')?.click()`);
    return kosul(`!document.querySelector('.arac-ortusu')`, 4000);
  };
  const donmeler = () => evalJs(`window.__pdefe.aktif().gorunum.tarif().map((t) => t.dondurme || 0)`);
  const bolumler = (process.env.BOLUM || '1,2,3,4').split(',').map((s) => s.trim());
  const bolum = (n) => bolumler.includes(String(n));

  // ------------------------------------------------------------ hazırlık
  await sekmeleriKapat();
  await bekle(500);
  fs.mkdirSync(PDF, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  const belge = path.join(PDF, 'sekiz.pdf');
  fs.rmSync(belge, { force: true, maxRetries: 10, retryDelay: 300 });
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), belge, '8', 'Döndürme örneği'], { encoding: 'utf8' });
  // Açılıştaki ayar (bölüm 4): eski sürümün "Döndür düğmesi" ayarı silinmiş olmalı
  const acilistakiKapsam = await evalJs(`window.pdefe.cagir('ayar:al', 'dondurmeKapsami')`);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); const ce = console.error; console.error = (...a) => { window.__hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; } return true; })()`);
  await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'otomatikKaydet', false); window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);
  // Sorular ana süreçteki test kuyruğuna gitsin (açılırsa diyalog kaydında görünür)
  await evalJs(`(() => { window.__pdefeYerelKutu = true; return true; })()`);
  await diyalogKaydi();

  // ------------------------------------------------------------ 1) Adlar ve açıklamalar
  if (bolum(1)) {
    console.log('\n== 1) Döndür adı, açıklamalar');
    await ac(belge);
    await evalJs(`document.querySelector('#dugme-araclar').click()`);
    await kosul(`!document.querySelector('#araclar-penceresi').hidden`);
    const karolar = await evalJs(`[...document.querySelectorAll('.araclar-karo')].map((k) => [k.querySelector('.araclar-ad').textContent, k.querySelector('.araclar-aciklama').textContent])`);
    const karo = (ad) => karolar.find((k) => k[0] === ad);
    sonuc('Araçlar penceresi: "Döndür" — "Sayfaları döndürür"; "Döndür ve kaydet" yok', J(karo('Döndür')) === J(['Döndür', 'Sayfaları döndürür']) && !karolar.some((k) => /ve kaydet/i.test(k[0])), karolar);
    sonuc('Araçlar penceresi: "Sayfaları düzenle" — "Sıralar, siler, döndürür, sayfa ekler"', J(karo('Sayfaları düzenle')) === J(['Sayfaları düzenle', 'Sıralar, siler, döndürür, sayfa ekler']), karo('Sayfaları düzenle'));
    await ss('01-araclar');
    await evalJs(`document.querySelector('#dugme-araclar').click()`);
    const menu = await evalJs(`window.pdefe.cagir('test:menu')`);
    const araclar = (menu || []).find((m) => m?.etiket === '&Araçlar')?.alt || [];
    const gorunum = (menu || []).find((m) => m?.etiket === '&Görünüm')?.alt || [];
    sonuc('Araçlar menüsü: "Döndür" ("Döndür ve kaydet" yok)', araclar.includes('Döndür') && !araclar.some((m) => typeof m === 'string' && /ve kaydet/i.test(m)), araclar);
    sonuc('Görünüm menüsü: "Sayfayı saat yönünde döndür" ve "Sayfayı saat yönünün tersine döndür"', gorunum.includes('Sayfayı saat yönünde döndür') && gorunum.includes('Sayfayı saat yönünün tersine döndür'), gorunum.filter((m) => /döndür/i.test(m)));
    const baslangic = await evalJs(`(async () => { await window.__pdefe.komutCalistir('sekme.yeni'); await new Promise((c) => setTimeout(c, 400)); return [...document.querySelectorAll('.karsilama-arac')].map((k) => [k.querySelector('.karsilama-arac-ad').textContent, k.querySelector('.karsilama-aciklama').textContent]); })()`);
    sonuc('Açılış ekranı: "Döndür" — "Sayfaları döndürür", "Sayfaları düzenle" — "Sıralar, siler, döndürür, sayfa ekler"',
      baslangic.some((k) => J(k) === J(['Döndür', 'Sayfaları döndürür'])) && baslangic.some((k) => J(k) === J(['Sayfaları düzenle', 'Sıralar, siler, döndürür, sayfa ekler'])), baslangic);
    await ss('01-acilis');
    await evalJs(`window.__pdefe.komutCalistir('sekme.kapat')`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
    await aracAc('arac.dondurKaydet', 'dondur-pencere');
    const p = await evalJs(`({ baslik: document.querySelector('.arac-baslik-metin').textContent, dugme: document.querySelector('.arac-dugmeler .birincil').textContent })`);
    sonuc('Döndür penceresi: başlık "Döndür", düğme "Döndür"', p.baslik === 'Döndür' && p.dugme === 'Döndür', p);
    await ss('01-dondur');
    await pencereKapat();
  }

  // ------------------------------------------------------------ 2) Sayfaları düzenle'nin yeri
  if (bolum(2)) {
    console.log('\n== 2) Sayfaları düzenle sekme şeridinin altında');
    await sekmeleriKapat();
    await ac(belge);
    await aracAc('arac.sayfalar', 'sayfalar-pencere');
    const yer = () => evalJs(`(() => {
      const o = document.querySelector('.arac-ortusu'), p = document.querySelector('.sayfalar-pencere');
      const s = document.getElementById('sekme-cubugu').getBoundingClientRect(), b = p.getBoundingClientRect();
      const t = document.querySelector('#sekme-cubugu .sekme.aktif')?.getBoundingClientRect();
      const ustteki = t && t.height ? document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2) : null;
      return { seritAlti: o.classList.contains('serit-alti'), seritAlt: Math.round(s.bottom), seritH: Math.round(s.height), ust: Math.round(b.top),
        alt: Math.round(b.bottom), h: Math.round(b.height), ih: innerHeight, sekmeGorunur: !!ustteki && ustteki === o, ortaY: Math.round((b.top + b.bottom) / 2) };
    })()`);
    let y = await yer();
    sonuc('Sayfaları düzenle sekme şeridinin altında başlar, etkin sekme görünür; yükseklik 88vh ya da sığacak kadar',
      y.seritAlti && y.seritH > 0 && y.ust >= y.seritAlt + 7 && y.ust <= y.seritAlt + 9 && y.alt <= y.ih - 11 && y.sekmeGorunur
      && Math.abs(y.h - Math.min(0.88 * y.ih, y.ih - y.ust - 12)) <= 2, y);
    await ss('02-sayfalar-yer');
    await evalJs(`window.__pdefe.komutCalistir('gorunum.okumaModu')`);
    await kosul(`!document.querySelector('.arac-ortusu').classList.contains('serit-alti')`, 3000);
    y = await yer();
    sonuc('okuma kipinde (şerit gizli) Sayfaları düzenle ortada', !y.seritAlti && y.seritH === 0 && Math.abs(y.ortaY - y.ih / 2) <= 2, y);
    await evalJs(`window.__pdefe.komutCalistir('gorunum.okumaModu')`);
    await kosul(`document.querySelector('.arac-ortusu').classList.contains('serit-alti')`, 3000);
    y = await yer();
    sonuc('okuma kipinden çıkınca yeniden şeridin altında', y.seritAlti && y.ust >= y.seritAlt + 7 && y.sekmeGorunur, y);
    await pencereKapat();
  }

  // ------------------------------------------------------------ 3) Döndür düğmesi
  if (bolum(3)) {
    console.log('\n== 3) Döndür düğmesi sormaz, yalnızca geçerli sayfa');
    await sekmeleriKapat();
    await ac(belge);
    await diyalogKaydi();
    // Eski sürümde "Seçeneğimi hatırla" ile kaydedilmiş "Tüm PDF" tercihi kalmış olsa bile (renderer'ın ayarında) yok sayılır
    await evalJs(`(() => { window.__pdefe.ayar().dondurmeKapsami = 'tum'; return true; })()`);
    await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(3, { aninda: true })`);
    await kosul(`window.__pdefe.aktif().gorunum.gecerli === 3`, 3000);
    const dugme = await evalJs(`(() => { const d = document.querySelector('#arac-cubugu [data-komut="gorunum.dondur"]'); const r = d.getBoundingClientRect(); return { baslik: d.title, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    sonuc('Araç çubuğundaki düğmenin ipucu "Sayfayı döndür (Ctrl+R)"', dugme.baslik === 'Sayfayı döndür (Ctrl+R)', dugme.baslik);
    await tikla(dugme.x, dugme.y);
    await kosul(`window.__pdefe.aktif().gorunum.tarif()[2]?.dondurme === 90`, 3000);
    let d = await donmeler();
    let kayit = (await diyalogKaydi()).filter((k) => k.kanal === 'mesaj:kutu');
    sonuc('Düğmeye tık: soru yok, yalnızca 3. sayfa saat yönünde 90° (belge değişti)', kayit.length === 0 && !(await evalJs(`!!document.querySelector('.mesaj-kutusu')`))
      && J(d) === J(d.map((_, i) => (i === 2 ? 90 : 0))) && await evalJs(`window.__pdefe.aktif().degisti`), { d, kayit });
    await ss('03-dondur-dugme');
    await evalJs(`window.__pdefe.komutCalistir('gorunum.dondur', -90)`);
    await kosul(`window.__pdefe.aktif().gorunum.tarif()[2]?.dondurme === 0`, 3000);
    await evalJs(`window.__pdefe.komutCalistir('gorunum.dondur', -90)`);
    await kosul(`window.__pdefe.aktif().gorunum.tarif()[2]?.dondurme === 270`, 3000);
    d = await donmeler();
    sonuc('Saat yönünün tersine (Ctrl+Shift+R): 90 → 0 → 270, yalnızca 3. sayfa', J(d) === J(d.map((_, i) => (i === 2 ? 270 : 0))), d);
    const geriler = [];
    for (let i = 0; i < 3; i++) { await evalJs(`window.__pdefe.komutCalistir('duzen.geriAl')`); await bekle(500); geriler.push((await donmeler())[2]); }
    sonuc('Geri al üç kez: 270 → 0 → 90 → 0', J(geriler) === J([0, 90, 0]), geriler);
    // Yazı kutusu düzenlenirken döndürme: yazı not olarak kalır (düzenleme uygulanır), sayfa döner; geri al önce döndürmeyi alır
    await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(1, { aninda: true })`);
    await kosul(`window.__pdefe.aktif().gorunum.gecerli === 1`, 3000);
    await evalJs(`(window.__pdefe.aktif().notlar.aracSec('yazi'), true)`);
    const nokta = await evalJs(`(() => { const r = window.__pdefe.aktif().gorunum.sayfalar[0].el.getBoundingClientRect(); return [Math.round(r.left + 120), Math.round(Math.max(r.top, 120) + 60)]; })()`);
    await tikla(...nokta); await bekle(400);
    await yaz('Deneme yazı');
    const yazilar = () => evalJs(`[...window.__pdefe.aktif().notlar.notlar.values()].filter((x) => x.tur === 'FreeText' && !x.silindi).map((x) => x.icerik)`);
    const once = await evalJs(`(() => { const d = window.__pdefe.aktif().notlar.duzenleyici; return d ? d.el.textContent : null; })()`);
    await evalJs(`window.__pdefe.komutCalistir('gorunum.dondur', 90)`);
    await kosul(`window.__pdefe.aktif().gorunum.tarif()[0]?.dondurme === 90`, 3000);
    await bekle(300);
    const sonra = { duzenleyici: await evalJs(`!!window.__pdefe.aktif().notlar.duzenleyici`), yazilar: await yazilar(), d: await donmeler() };
    sonuc('Yazı düzenlenirken döndür: yazı not olarak kalır, 1. sayfa döner, soru yok', once === 'Deneme yazı' && !sonra.duzenleyici && J(sonra.yazilar) === J(['Deneme yazı'])
      && sonra.d[0] === 90 && !(await evalJs(`!!document.querySelector('.mesaj-kutusu')`)), sonra);
    await ss('03-yazi-dondur');
    await evalJs(`window.__pdefe.komutCalistir('duzen.geriAl')`); await bekle(500);
    const geri1 = { d: (await donmeler())[0], yazilar: await yazilar() };
    await evalJs(`window.__pdefe.komutCalistir('duzen.geriAl')`); await bekle(500);
    const geri2 = { d: (await donmeler())[0], yazilar: await yazilar() };
    sonuc('Geri al: önce döndürme, sonra yazı', geri1.d === 0 && J(geri1.yazilar) === J(['Deneme yazı']) && geri2.d === 0 && J(geri2.yazilar) === J([]), { geri1, geri2 });
    kayit = (await diyalogKaydi()).filter((k) => k.kanal === 'mesaj:kutu');
    sonuc('Bu bölümde hiç soru sorulmadı', kayit.length === 0, kayit);
    await evalJs(`(() => { delete window.__pdefe.ayar().dondurmeKapsami; return true; })()`);
  }

  // ------------------------------------------------------------ 4) Ayarlar ve F1
  if (bolum(4)) {
    console.log('\n== 4) Ayarlar, F1');
    await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'acilis')`);
    await kosul(`!!document.querySelector('.ayarlar-ortusu')`);
    const basliklar = await evalJs(`[...document.querySelectorAll('.ayarlar-icerik .ayar-kart .ayar-baslik')].map((e) => e.textContent)`);
    sonuc('Ayarlar › Açılış ve düzen: "Döndür düğmesi" seçeneği yok', basliklar.includes('Kapak sayfasını ayrı göster') && !basliklar.some((t) => /döndür/i.test(t)), basliklar);
    await ss('04-ayarlar');
    await tus('Escape'); await bekle(300);
    if (process.env.S27_ESKI_AYAR === '1') sonuc('Eski "Döndür düğmesi" ayarı (dondurmeKapsami) açılışta silindi', acilistakiKapsam === undefined || acilistakiKapsam === null, acilistakiKapsam);
    else console.log('(eski ayarın silinmesi denetlenmedi: S27_ESKI_AYAR yok)');
    await evalJs(`window.__pdefe.komutCalistir('yardim.kisayollar')`);
    await kosul(`!!document.querySelector('table.kisayollar')`);
    const satir = await evalJs(`(() => { const tr = [...document.querySelectorAll('table.kisayollar tr')].find((t) => t.cells[0]?.textContent.trim() === 'Ctrl+R / Ctrl+Shift+R'); return tr ? tr.cells[1].textContent : null; })()`);
    sonuc('F1: Ctrl+R / Ctrl+Shift+R — "Geçerli sayfayı saat yönünde / tersine döndür"', satir === 'Geçerli sayfayı saat yönünde / tersine döndür', satir);
    await tus('Escape'); await bekle(300);
  }

  const hatalar = await evalJs(`window.__hatalar || []`);
  sonuc('sayfada hata yok', hatalar.length === 0, hatalar);
  await sekmeleriKapat();
  console.log(hataSayisi ? `\n${hataSayisi} HATA` : '\nHepsi geçti.');
  process.exitCode = hataSayisi ? 1 : 0;
}
