// Senaryo 34 (0.2.6, kullanıcı isteği: "kaydet butonunun yanına yazdır butonu", sağ tıka da Yazdır): araç çubuğunda ve sağ tık
// menülerinde Yazdır. Yazdırma penceresinin kendisi (seçenekler, Windows'un yazdırma kutusu) bu senaryonun konusu değil: düğme ve menüler
// Ctrl+P ile aynı komutu (dosya.yazdir) çalıştırır.
//   1) Araç çubuğu: Kaydet'in hemen sağında, aynı grupta Yazdır (34×34, simgesi 22 px ve Kaydet'le aynı çizgi stilinde, ipucu
//      "Yazdır (Ctrl+P)"); açılış sekmesinde soluk, belgede etkin (kaydedilmemiş değişiklik olsa da). Tıklanınca yazdırma seçenekleri
//      penceresi (.yazdir-ortusu) o belgenin adıyla açılır, Esc kapatır, yazdırma başlamaz (ana süreçte iş yok, yazdir:durum). Yazı kutusu
//      düzenlenirken Yazdır'a basmak düzenlemeyi uygular: yazı not olur, belge değişmiş sayılır, yazdırma kaydetme sorusunu sorar.
//   2) Belge sayfasında sağ tık: son grup "Kaydet, Yazdır" (Yazdır en altta); seçilince seçenek penceresi açılır. Başka pencereye taşınan
//      sekmede devre dışı (seçilse de bir şey yapmaz).
//   3) Sekmede sağ tık: Kaydet'in hemen altında Yazdır; arka plandaki sekmede seçilince önce o sekmeye geçilir, pencerede o belgenin adı;
//      açılış sekmesinde ve taşınan sekmede devre dışı.
// Girdiler test/cikti/s34/pdf altında üretilir; menü seçimi test yanıtıyla verilir (test:diyalogYanitlari), tıklamalar gerçek fare olayıyla.
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9434 -Veri "%TEMP%\pdefe-s34-9434"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9434; node test\surucu.mjs betik test\senaryo34.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bir bölüm: $env:BOLUM="3" (virgülle birden çok). Ekran görüntüleri test/cikti/s34/png altına yazılır.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's34');
const PDF = path.join(UI, 'pdf');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
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
/** Menü öğeleri metin olarak: ayraç '-', devre dışı öğe "(devre dışı)" ekli */
const menuMetni = (ogeler) => (ogeler ? ogeler.map((o) => (o.ayirici ? '-' : o.etiket + (o.devre ? ' (devre dışı)' : ''))) : null);

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, yaz, tus }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad, kirp = null) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png'), kirp); };
  const diyalogKaydi = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const yanitla = (yanit) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'menu:popup', [${J(yanit)}])`);
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); for (const s of [...p.sekmeler.sekmeler]) p.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 300)); return p.belgeler.size; })()`);
  const ac = async (yol) => {
    const r = await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); return !!b; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(300);
    return r;
  };
  const etkinAd = () => evalJs(`window.__pdefe.aktif()?.ad ?? null`);
  const belgeIfadesi = (ad) => `[...window.__pdefe.belgeler.values()].find((x) => x.ad === ${J(ad)})`;
  const dugme = () => evalJs(`(() => { const d = document.querySelector('#arac-cubugu [data-komut="dosya.yazdir"]'); if (!d) return null; const r = d.getBoundingClientRect();
    return { devre: d.disabled, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  /** Açık yazdırma seçenekleri penceresi (yazdir.js) ya da null */
  const yazdirPenceresi = () => evalJs(`(() => { const o = document.querySelector('.yazdir-ortusu'); return o ? { baslik: o.querySelector('.baslik')?.textContent ?? null, belge: o.querySelector('.yazdir-belge')?.textContent ?? null, odak: o.contains(document.activeElement) } : null; })()`);
  /** Pencere açılmışsa Esc ile kapatır; kapandı mı ve ana süreçte yazdırma işi var mı */
  const escIleKapat = async () => {
    await tus('Escape'); await bekle(300);
    return { kapandi: !(await evalJs(`!!document.querySelector('.yazdir-ortusu')`)), is: await evalJs(`window.pdefe.cagir('yazdir:durum')`) };
  };
  /** Gerçek fareyle sağ tık; menüyü test yanıtıyla kapatır, menünün öğelerini döndürür */
  const sagTikMenu = async (x, y, yanit = null) => {
    await diyalogKaydi(); await yanitla(yanit);
    await tikla(x, y, { dugme: 'right' }); await bekle(500);
    return (await diyalogKaydi()).filter((d) => d.kanal === 'menu:popup').at(-1)?.secenek || null;
  };
  /** Sayfanın ekrandaki bir noktası (sayfa kutusunun solundan dx, üstünden dy; görünür alanın içinde) */
  const sayfaNoktasi = (dx, dy) => evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; const r = g.sayfalar[g.gecerli - 1].el.getBoundingClientRect();
    const k = g.kaydirici.getBoundingClientRect(); return [Math.round(r.left + ${dx}), Math.round(Math.max(r.top, k.top) + ${dy})]; })()`);
  /** Sekmede gerçek fareyle sağ tık (model adıyla bulunur; sekmenin ad yazısının ortası) */
  const sekmeSagTik = async (ad, yanit = null) => {
    const n = await evalJs(`(() => { const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === ${J(ad)}); if (!s) return null;
      const r = s.el.querySelector('.ad').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
    if (!n) return null;
    return sagTikMenu(n[0], n[1], yanit);
  };
  const bolumler = (process.env.BOLUM || '1,2,3').split(',').map((s) => s.trim());
  const bolum = (n) => bolumler.includes(String(n));

  // ------------------------------------------------------------ hazırlık
  await sekmeleriKapat();
  await bekle(400);
  fs.mkdirSync(PDF, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); const ce = console.error; console.error = (...a) => { window.__hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; } return true; })()`);
  // Otomatik kayıt kapalı (varsayılan da kapalı): yazdırma kaydedilmemiş değişikliği sorsun
  await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'otomatikKaydet', false); window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);
  await diyalogKaydi();
  const A = path.join(PDF, 'a.pdf'), B = path.join(PDF, 'b.pdf');
  uret(A, 3, 'Yazdır A'); uret(B, 2, 'Yazdır B');

  // ------------------------------------------------------------ 1) Araç çubuğundaki Yazdır
  if (bolum(1)) {
    console.log('\n== 1) Araç çubuğundaki Yazdır');
    const yer = await evalJs(`(() => { const k = document.querySelector('#arac-cubugu [data-komut="dosya.kaydet"]'), d = document.querySelector('#arac-cubugu [data-komut="dosya.yazdir"]');
      if (!k || !d) return null; const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, w: b.width, h: b.height }; };
      const svg = d.querySelector('svg'), yollar = [...svg.querySelectorAll('path')];
      return { kaydet: r(k), yazdir: r(d), svg: svg.getBoundingClientRect().width, ayniGrup: k.parentElement === d.parentElement && k.parentElement.classList.contains('grup'),
        hemenSagi: k.nextElementSibling === d, ipucu: d.title, cizgi: yollar.length > 0 && yollar.every((p) => p.getAttribute('stroke') === 'currentColor' && p.getAttribute('stroke-width') === '1.4'),
        sinif: d.className, devre: d.disabled, belgeVar: window.__pdefe.belgeler.size, acilis: !document.querySelector('#baslangic').hidden }; })()`);
    sonuc('Açılış sekmesi (belge yok): Yazdır düğmesi var ve soluk (devre dışı)', yer && yer.belgeVar === 0 && yer.acilis && yer.devre === true, yer);
    sonuc('Yazdır, Kaydet\'in hemen sağında, aynı grupta; aynı satırda, aralarında 0–4 px', yer && yer.ayniGrup && yer.hemenSagi && yer.yazdir.l - yer.kaydet.r >= 0 && yer.yazdir.l - yer.kaydet.r <= 4 && yer.yazdir.t === yer.kaydet.t, yer);
    sonuc('Yazdır 34×34 px, simgesi 22 px; çizgi simge (currentColor, 1,4 px; Kaydet gibi)', yer && yer.yazdir.w === 34 && yer.yazdir.h === 34 && yer.svg === 22 && yer.cizgi && yer.sinif === 'ikon', yer);
    sonuc('İpucu "Yazdır (Ctrl+P)"', yer?.ipucu === 'Yazdır (Ctrl+P)', yer?.ipucu);
    // Soluk düğmeye tıklamak bir şey yapmaz
    let d = await dugme();
    await tikla(d.x, d.y); await bekle(400);
    sonuc('Açılış sekmesinde soluk Yazdır\'a tıklamak pencere açmaz', !(await yazdirPenceresi()));

    await ac(A);
    d = await dugme();
    sonuc('Belge açılınca Yazdır etkin (değişiklik yokken de)', d && d.devre === false, d);
    await ss('01-arac-cubugu', { x: 0, y: 0, width: 420, height: 90 });
    await tikla(d.x, d.y);
    await kosul(`!!document.querySelector('.yazdir-ortusu')`, 8000);
    let p = await yazdirPenceresi();
    sonuc('Yazdır\'a tıklanınca yazdırma seçenekleri penceresi açılır: başlık "Yazdır", belgenin adı ve sayfa sayısı, odak pencerede', p && p.baslik === 'Yazdır' && /^a\.pdf/.test(p.belge) && /3 sayfa/.test(p.belge) && p.odak, p);
    await ss('02-yazdir-penceresi');
    let k = await escIleKapat();
    sonuc('Esc pencereyi kapatır, yazdırma başlamaz (ana süreçte yazdırma işi yok)', k.kapandi && k.is && k.is.suruyor === false, k);
    // Pencere açıkken ikinci basış ikinci pencere açmaz (yazdir.js acikPencere): düğme, Ctrl+P ve menülerin ortak yolu
    await evalJs(`(window.__pdefe.komutCalistir('dosya.yazdir'), true)`);
    await kosul(`!!document.querySelector('.yazdir-ortusu')`, 8000);
    await evalJs(`(window.__pdefe.komutCalistir('dosya.yazdir'), true)`); await bekle(500);
    sonuc('Pencere açıkken Yazdır yeniden çalışınca ikinci pencere açılmaz', (await evalJs(`document.querySelectorAll('.yazdir-ortusu').length`)) === 1);
    await escIleKapat();

    // Kaydedilmemiş değişiklik varken de etkin
    await evalJs(`(async () => { const b = window.__pdefe.aktif(); b.notlar.ekle({ tur: 'Text', sayfa: 1, rect: [400, 600, 420, 620], icerik: 'yazdır notu', yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' }); await new Promise((r) => setTimeout(r, 200)); return true; })()`);
    d = await dugme();
    sonuc('Kaydedilmemiş not varken de Yazdır etkin', d.devre === false && (await evalJs(`!!window.__pdefe.aktif().degisti`)), d);
    await evalJs(`(async () => { await window.__pdefe.belgeKapat(window.__pdefe.aktif().id, { zorla: true }); return true; })()`);
    await bekle(300);

    // Yazı kutusu düzenlenirken Yazdır: düzenleme uygulanır (yazı not olur), yazdırma kaydetme sorusunu sorar (Vazgeç)
    await ac(A);
    await evalJs(`(window.__pdefe.aktif().notlar.aracSec('yazi'), true)`);
    const [x, y] = await sayfaNoktasi(120, 260);
    await tikla(x, y); await bekle(400);
    await yaz('Yazdırmadan önce'); await bekle(200);
    const acik = await evalJs(`(() => { const b = window.__pdefe.aktif(), dz = b.notlar.duzenleyici; return { metin: dz ? dz.el.textContent : null, degisti: !!b.degisti }; })()`);
    sonuc('Yazı kutusu düzenleniyor (yazı henüz not değil)', acik.metin === 'Yazdırmadan önce' && acik.degisti === false, acik);
    await evalJs(`(window.__pdefeOtoYanit = { secim: 2, onay: false }, true)`);   // "Yazdırmadan önce kaydedilsin mi?" → Vazgeç
    d = await dugme();
    await tikla(d.x, d.y); await bekle(800);
    const sonra = await evalJs(`(() => { const b = window.__pdefe.aktif(), n = [...b.notlar.notlar.values()].find((x) => x.tur === 'FreeText' && !x.silindi);
      const soru = window.__pdefeOtoYanit?.son; delete window.__pdefeOtoYanit;
      return { duzenleyici: !!b.notlar.duzenleyici, yazi: n?.icerik ?? null, degisti: !!b.degisti, soru: soru?.mesaj ?? null, pencere: !!document.querySelector('.yazdir-ortusu') }; })()`);
    sonuc('Düzenlenirken Yazdır: düzenleme uygulandı (yazı not oldu, belge değişti), yazdırma kaydetmeyi sordu; Vazgeç\'te pencere açılmadı',
      !sonra.duzenleyici && sonra.yazi === 'Yazdırmadan önce' && sonra.degisti && sonra.soru === 'Yazdırmadan önce kaydedilsin mi?' && !sonra.pencere, sonra);
    await evalJs(`(window.__pdefe.aktif().notlar.aracSec(null), true)`);
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 2) Belge sayfasında sağ tık › Yazdır
  if (bolum(2)) {
    console.log('\n== 2) Belge sayfasında sağ tık › Yazdır');
    await ac(B);
    const [x, y] = await sayfaNoktasi(300, 200);
    let m = menuMetni(await sagTikMenu(x, y));
    sonuc('Sayfa menüsünde son grup "Kaydet, Yazdır": Yazdır en altta, Kaydet\'in hemen altında; Tümünü seç\'ten ayraçla ayrılmış',
      m && m.at(-1) === 'Yazdır' && m.at(-2) === 'Kaydet (devre dışı)' && m.at(-3) === '-' && m.at(-4) === 'Tümünü seç' && m[0]?.startsWith('Kopyala'), m);
    await sagTikMenu(x, y, 'yazdir');
    await kosul(`!!document.querySelector('.yazdir-ortusu')`, 8000);
    const p = await yazdirPenceresi();
    sonuc('Sağ tık › Yazdır: yazdırma seçenekleri penceresi bu belgeyle açılır', p && p.baslik === 'Yazdır' && /^b\.pdf/.test(p.belge) && /2 sayfa/.test(p.belge), p);
    const k = await escIleKapat();
    sonuc('Esc kapatır, yazdırma başlamaz', k.kapandi && k.is?.suruyor === false, k);
    // Başka pencereye taşınmakta olan sekme (b.tasiniyor): devre dışı; menü yanıtı yine Yazdır olsa da bir şey yapılmaz
    await evalJs(`(${belgeIfadesi('b.pdf')}.tasiniyor = true, true)`);
    m = menuMetni(await sagTikMenu(x, y));
    const ms = menuMetni(await sekmeSagTik('b.pdf'));
    await sagTikMenu(x, y, 'yazdir'); await bekle(500);
    const acildi = await evalJs(`!!document.querySelector('.yazdir-ortusu')`);
    await evalJs(`(${belgeIfadesi('b.pdf')}.tasiniyor = false, true)`);
    sonuc('Taşınan sekmede Yazdır devre dışı (sayfada ve sekmede), seçilse de pencere açılmaz', m?.at(-1) === 'Yazdır (devre dışı)' && ms?.includes('Yazdır (devre dışı)') && !acildi, { sayfa: m, sekme: ms, acildi });
    if (acildi) await escIleKapat();
    m = menuMetni(await sagTikMenu(x, y));
    sonuc('Taşıma bitince yeniden etkin', m?.at(-1) === 'Yazdır', m);
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 3) Sekmede sağ tık › Yazdır
  if (bolum(3)) {
    console.log('\n== 3) Sekmede sağ tık › Yazdır');
    await ac(A); await ac(B);
    let m = menuMetni(await sekmeSagTik('a.pdf'));
    sonuc('Sekme menüsünde Yazdır, Kaydet\'in hemen altında (aynı grupta)',
      J(m) === J(['Kapat', 'Diğerlerini kapat', 'Sağdakileri kapat', '-', 'Kaydet (devre dışı)', 'Yazdır', '-', 'Pencereye ayır', '-', 'Klasörde göster', 'Yolu kopyala', 'PDF\'i kopyala']), m);
    sonuc('Hazırlık: etkin sekme b.pdf', (await etkinAd()) === 'b.pdf', await etkinAd());
    await sekmeSagTik('a.pdf', 'yazdir');
    await kosul(`!!document.querySelector('.yazdir-ortusu')`, 8000);
    const p = await yazdirPenceresi();
    const etkin = await etkinAd();
    sonuc('Arka plandaki a.pdf\'in sekmesinden Yazdır: önce a.pdf\'e geçilir, pencerede a.pdf', etkin === 'a.pdf' && p && /^a\.pdf/.test(p.belge) && /3 sayfa/.test(p.belge), { etkin, p });
    await ss('03-sekmeden-yazdir');
    const k = await escIleKapat();
    sonuc('Esc kapatır, yazdırma başlamaz; a.pdf etkin kalır', k.kapandi && k.is?.suruyor === false && (await etkinAd()) === 'a.pdf', k);
    // Etkin sekmenin kendi menüsünden de
    await sekmeSagTik('a.pdf', 'yazdir');
    await kosul(`!!document.querySelector('.yazdir-ortusu')`, 8000);
    sonuc('Etkin sekmenin menüsünden Yazdır pencereyi açar', /^a\.pdf/.test((await yazdirPenceresi())?.belge || ''));
    await escIleKapat();
    // Açılış sekmesi
    await evalJs(`(window.__pdefe.komutCalistir('sekme.yeni'), true)`); await bekle(400);
    m = menuMetni(await sekmeSagTik('Yeni sekme'));
    const d = await dugme();
    sonuc('Açılış sekmesinde Yazdır devre dışı (sekme menüsünde ve araç çubuğunda)', m?.includes('Yazdır (devre dışı)') && d.devre === true, { m, d });
    await sekmeSagTik('Yeni sekme', 'yazdir'); await bekle(500);
    sonuc('Açılış sekmesinde menü yanıtı Yazdır olsa da bir şey olmaz (pencere açılmaz)', !(await evalJs(`!!document.querySelector('.yazdir-ortusu')`)));
    await evalJs(`(async () => { const p = window.__pdefe; await p.sekmeSec([...p.belgeler.values()].find((x) => x.ad === 'b.pdf').id); return true; })()`); await bekle(300);
    sonuc('Belge sekmesine dönülünce araç çubuğundaki Yazdır yeniden etkin', (await dugme()).devre === false);
    await sekmeleriKapat();
  }

  const hatalar = await evalJs(`window.__hatalar || []`);
  sonuc('Sayfada hata yok', hatalar.length === 0, hatalar);
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti${hataSayisi ? ' — HATA: ' + hataSayisi : ''}`);
  if (hataSayisi) process.exitCode = 1;
}
