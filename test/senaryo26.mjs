// Senaryo 26 (0.1.25, kullanıcı istekleri): araçların Kaydet bölümü, PDEfe'nin verdiği adlar, PDF ayır'ın yeni seçenekleri, Birleştir'de
// açık PDF ve üzerine yazma, PDF Sıkıştırma adı.
//   1) "PDF küçült" her yerde "PDF Sıkıştırma" (Araçlar penceresi, Araçlar menüsü, pencere başlığı, "Sıkıştır" düğmesi), "Sıkıştırma"
//      başlığı "Sıkıştırma seçenekleri".
//   2) Beş araçta Kaydet bölümü aynı düzende: başlık, altında Yeni belge olarak kaydet | Üzerine yaz, altında ad + klasör + Değiştir
//      (alt alta, sola hizalı); varsayılan ad parantezsiz, baş harfi büyük, Türkçe harfli: Sıkıştırılmış, Düzenlenmiş, Döndürülmüş,
//      Ayrılmış, Birleşik. "Üzerine yaz" seçilince satır kaybolmaz: yerinde üzerine yazılacak dosyanın adı ve klasörü soluk
//      (değiştirilemez) durur, altında not.
//   3) PDF ayır: "Sayfa aralıklarına göre"nin yanında Ayrı ayrı dosya | Tek dosya ("aralık" sözcüğü yok), "Her … sayfada bir" ve "Seçili
//      sayfaları çıkart" yok; dosya adı kutusu (Ayrılmış), birden çok dosyada "Ayrılmış - Sayfa 1-3.pdf"; çıktılar diskte; var olan
//      dosyada "(2)"; tek dosyada üzerine yazma.
//   4) Birleştir: açık PDF listenin başında; "Üzerine yaz" açık PDF listedeyken seçilebilir, çıkarılınca seçilemez; üzerine yazınca açık
//      PDF birleşik sonuçla yeniden açılır; PDF açık değilken açılan araçta seçilemez; yeni belge "Birleşik.pdf", ikincisi "Birleşik (2)".
//   5) Sıkıştırma ve Döndür'ün yeni belgeleri "Sıkıştırılmış.pdf", "Döndürülmüş.pdf".
// Girdiler test/cikti/s26/pdf altında üretilir; araçların çıktı klasörü test/cikti/s26/cikti (Masaüstüne yazılmaz).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9426 -Veri "%TEMP%\pdefe-s26-9426"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9426; node test\surucu.mjs betik test\senaryo26.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bir bölüm: $env:BOLUM="3" (virgülle birden çok). Ekran görüntüleri test/cikti/s26/png altına yazılır.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's26');
const PDF = path.join(UI, 'pdf');
const CIKTI = path.join(UI, 'cikti');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

/** Python (proje .venv) çalıştırır; son satırı JSON olarak döner. test/araclar_testi.py yardımcıları içe aktarılabilir. */
function py(kod) {
  const on = `import sys, json, os\nsys.path.insert(0, ${J(path.join(KOK, 'test'))})\nimport pymupdf\n`;
  const cikti = execFileSync(PY, ['-X', 'utf8', '-c', on + kod], { encoding: 'utf8' });
  return JSON.parse(cikti.trim().split(/\r?\n/).pop());
}
/** Sayfaların ilk satırları ("Sayfa N"). */
const ilkSatirlar = (yol) => py(`d = pymupdf.open(${J(yol)})\nprint(json.dumps([(p.get_text().strip().splitlines() or [''])[0] for p in d]))`);
const dosyalar = () => fs.readdirSync(CIKTI).filter((a) => a.toLowerCase().endsWith('.pdf')).sort();

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const diyalogYanitla = (yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'mesaj:kutu', ${J(yanitlar)})`);
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
  /** Gerçek fareyle seçicideki öğeye tıklar (öğenin ortası). */
  const tikSecici = async (secici) => {
    const r = await evalJs(`(() => { const e = document.querySelector(${J(secici)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) return false;
    await tikla(r.x, r.y);
    await bekle(250);
    return true;
  };
  /** Açık araç penceresinin Kaydet bölümü: sıra, görünürlük, değerler, konumlar. */
  const kayitDurumu = () => evalJs(`(() => {
    const p = document.querySelector('.arac-pencere');
    const baslik = [...p.querySelectorAll('.arac-bolum-baslik')].find((e) => e.textContent.trim() === 'Kaydet');
    const k = p.querySelector('.arac-kayit');
    const gor = (e) => !!e && !e.closest('[hidden]') && e.getBoundingClientRect().height > 0;
    const kutu = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), h: Math.round(b.height) }; };
    const yeni = k.querySelector('.arac-kayit-yeni .arac-cikti'), sabit = k.querySelector('.arac-kayit-sabit .arac-cikti');
    const satir = gor(yeni) ? yeni : sabit;
    return {
      sonraki: baslik?.nextElementSibling === k,
      sira: [...k.children].map((c) => c.className.split(' ')[0]),
      secenekler: [...k.querySelectorAll('.arac-kayit-secim > button')].map((b) => ({ ad: b.textContent.trim(), secili: b.classList.contains('secili'), devre: b.disabled })),
      kisit: gor(k.querySelector('.arac-kayit-kisit')) ? k.querySelector('.arac-kayit-kisit').textContent : '',
      yeniGorunur: gor(yeni), sabitGorunur: gor(sabit), notGorunur: gor(k.querySelector('.arac-kayit-uzerine')),
      not: k.querySelector('.arac-kayit-uzerine .metin')?.textContent || '',
      ad: satir.querySelector('.arac-cikti-ad').value, adDevre: satir.querySelector('.arac-cikti-ad').disabled,
      klasor: satir.querySelector('.arac-klasor-cip').dataset.klasor, cip: satir.querySelector('.arac-klasor-cip .ad').textContent,
      degistirDevre: satir.querySelector('.arac-cikti-degistir').disabled,
      baslikKutu: baslik ? kutu(baslik) : null, secimKutu: kutu(k.querySelector('.arac-kayit-secim')), satirKutu: kutu(satir),
    };
  })()`);
  const kipSec = (id) => tikSecici(`.arac-pencere .arac-kayit-secim > button[data-id="${id}"]`);
  const bolumler = (process.env.BOLUM || '1,2,3,4,5').split(',').map((s) => s.trim());
  const bolum = (n) => bolumler.includes(String(n));

  // ------------------------------------------------------------ hazırlık
  // Önceki koşumun sekmeleri (ve çekirdeğin açık tuttuğu dosyalar) kapanmadan klasörler silinemez
  await sekmeleriKapat();
  await bekle(500);
  fs.mkdirSync(PDF, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  fs.rmSync(CIKTI, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); fs.mkdirSync(CIKTI, { recursive: true });
  const zengin = {};
  for (const ad of ['a', 'b', 'c', 'd']) zengin[ad] = path.join(PDF, `zengin_${ad}.pdf`);
  for (const ad of fs.readdirSync(PDF)) fs.rmSync(path.join(PDF, ad), { maxRetries: 10, retryDelay: 300 });
  py(`from araclar_testi import zengin_pdf_uret\nfor y in ${J(Object.values(zengin))}: zengin_pdf_uret(y)\nprint("1")`);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); const ce = console.error; console.error = (...a) => { window.__hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; } return true; })()`);
  await evalJs(`(async () => { const a = { ciktiKlasoru: ${J(CIKTI)}, otomatikKaydet: false };
    for (const [k, v] of Object.entries(a)) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; } return true; })()`);
  await evalJs(`(() => { window.__pdefeYerelKutu = true; return true; })()`);
  await diyalogKaydi();
  await sekmeleriKapat();

  // ------------------------------------------------------------ 1) PDF Sıkıştırma adı
  if (bolum(1)) {
    console.log('\n== 1) PDF Sıkıştırma');
    await ac(zengin.a);
    await evalJs(`document.querySelector('#dugme-araclar').click()`);
    await kosul(`!document.querySelector('#araclar-penceresi').hidden`);
    const karolar = await evalJs(`[...document.querySelectorAll('.araclar-karo .araclar-ad')].map((e) => e.textContent)`);
    sonuc('Araçlar penceresi: ilk karo "PDF Sıkıştırma"', karolar[0] === 'PDF Sıkıştırma' && !karolar.some((k) => /küçült/i.test(k)), karolar);
    const ayirIpucu = await evalJs(`document.querySelector('.araclar-karo[data-arac-komut="arac.ayir"]').title`);
    sonuc('PDF ayır ipucunda "her N sayfada" yok', !/her N sayfada/i.test(ayirIpucu), ayirIpucu);
    await evalJs(`document.querySelector('#dugme-araclar').click()`);
    const menu = await evalJs(`window.pdefe.cagir('test:menu')`);
    const araclar = (menu || []).find((m) => m?.etiket === '&Araçlar')?.alt || [];
    sonuc('Araçlar menüsü: "PDF Sıkıştırma"', araclar[0] === 'PDF Sıkıştırma' && !araclar.some((m) => typeof m === 'string' && /küçült/i.test(m)), araclar);
    const baslangic = await evalJs(`(async () => { await window.__pdefe.komutCalistir('sekme.yeni'); await new Promise((c) => setTimeout(c, 400)); return [...document.querySelectorAll('.karsilama-arac-ad')].map((e) => e.textContent); })()`);
    sonuc('Açılış ekranı: "PDF Sıkıştırma"', baslangic.includes('PDF Sıkıştırma') && !baslangic.some((k) => /küçült/i.test(k)), baslangic);
    await evalJs(`window.__pdefe.komutCalistir('sekme.kapat')`);
    await kosul(`!!window.__pdefe.aktif()`);
    await aracAc('arac.kucult', 'kucult-pencere');
    const k = await evalJs(`({ baslik: document.querySelector('.arac-baslik-metin').textContent, dugme: document.querySelector('.arac-dugmeler .birincil').textContent,
      basliklar: [...document.querySelectorAll('.arac-pencere .arac-bolum-baslik')].map((e) => e.textContent.trim()) })`);
    sonuc('pencere "PDF Sıkıştırma", düğme "Sıkıştır", başlıklar "Sıkıştırma seçenekleri" ve "Kaydet"',
      k.baslik === 'PDF Sıkıştırma' && k.dugme === 'Sıkıştır' && J(k.basliklar) === J(['Sıkıştırma seçenekleri', 'Kaydet']), k);
    await ss('01-sikistirma');
    await pencereKapat();
  }

  // ------------------------------------------------------------ 2) Kaydet bölümü beş araçta aynı
  if (bolum(2)) {
    console.log('\n== 2) Kaydet bölümü');
    await sekmeleriKapat();
    await ac(zengin.a);
    const araclar = [
      ['arac.kucult', 'kucult-pencere', 'Sıkıştırılmış'], ['arac.sayfalar', 'sayfalar-pencere', 'Düzenlenmiş'],
      ['arac.dondurKaydet', 'dondur-pencere', 'Döndürülmüş'], ['arac.ayir', 'ayir-pencere', 'Ayrılmış'], ['arac.gorselBirlestir', 'birlestir-pencere', 'Birleşik'],
    ];
    for (const [komut, sinif, ad] of araclar) {
      await aracAc(komut, sinif);
      await kosul(`document.querySelector('.arac-kayit-yeni .arac-cikti-ad')?.value === ${J(ad)}`, 4000);
      const d = await kayitDurumu();
      const sirali = d.baslikKutu && d.baslikKutu.y < d.secimKutu.y && d.secimKutu.y + d.secimKutu.h <= d.satirKutu.y
        && Math.abs(d.baslikKutu.x - d.secimKutu.x) <= 2 && Math.abs(d.secimKutu.x - d.satirKutu.x) <= 2;
      sonuc(`${sinif}: Kaydet başlığı, altında seçim, altında ad + klasör + Değiştir (alt alta, sola hizalı)`,
        d.sonraki && J(d.sira) === J(['arac-segmentli', 'arac-kayit-kisit', 'arac-kayit-yeni', 'arac-kayit-sabit', 'arac-kayit-uzerine']) && sirali
        && J(d.secenekler.map((s) => s.ad)) === J(['Yeni belge olarak kaydet', 'Üzerine yaz']) && d.secenekler[0].secili, d);
      sonuc(`${sinif}: varsayılan ad "${ad}", çıktı klasörü, düzenlenebilir`, d.yeniGorunur && d.ad === ad && d.klasor === CIKTI && !d.adDevre && !d.degistirDevre, { ad: d.ad, klasor: d.klasor });
      await ss(`02-${sinif}-yeni`);
      await kipSec('uzerine');
      const u = await kayitDurumu();
      sonuc(`${sinif}: Üzerine yaz seçilince satır kaybolmaz; özgün dosyanın adı ve klasörü soluk, not görünür`,
        u.secenekler[1].secili && !u.yeniGorunur && u.sabitGorunur && u.notGorunur && u.ad === 'zengin_a' && u.klasor === PDF && u.adDevre && u.degistirDevre
        && u.satirKutu.y - u.baslikKutu.y === d.satirKutu.y - d.baslikKutu.y && u.not.includes('zengin_a.pdf'), u);
      await ss(`02-${sinif}-uzerine`);
      await kipSec('yeni');
      const y = await kayitDurumu();
      sonuc(`${sinif}: Yeni belge'ye dönünce ad ve klasör yerinde`, y.yeniGorunur && !y.sabitGorunur && !y.notGorunur && y.ad === ad && y.klasor === CIKTI, { ad: y.ad, klasor: y.klasor });
      await pencereKapat();
    }
  }

  // ------------------------------------------------------------ 3) PDF ayır
  if (bolum(3)) {
    console.log('\n== 3) PDF ayır');
    await sekmeleriKapat();
    for (const a of dosyalar()) fs.rmSync(path.join(CIKTI, a));
    await ac(zengin.b);
    await aracAc('arac.ayir', 'ayir-pencere');
    await kosul(`document.querySelector('.arac-kayit-yeni .arac-cikti-ad')?.value === 'Ayrılmış'`, 4000);
    const secenekler = await evalJs(`({ modlar: [...document.querySelectorAll('input[name="ayir-mod"]')].map((r) => r.value),
      metin: document.querySelector('.ayir-govde .arac-secenek-liste').textContent.replace(/\\s+/g, ' ').trim(),
      kip: [...document.querySelectorAll('.ayir-dosya-kipi-secim > button')].map((b) => b.textContent.trim()),
      kipYaninda: document.querySelector('.ayir-aralik-satiri').contains(document.querySelector('.ayir-dosya-kipi-secim')) })`);
    sonuc('seçenekler: Sayfa aralıklarına göre [Ayrı ayrı dosya | Tek dosya], Her sayfayı ayrı dosyaya; "Her … sayfada bir" ve "Seçili sayfaları çıkart" yok',
      J(secenekler.modlar) === J(['aralik', 'herSayfa']) && J(secenekler.kip) === J(['Ayrı ayrı dosya', 'Tek dosya']) && secenekler.kipYaninda
      && !/sayfada bir|Seçili sayfaları/i.test(secenekler.metin) && !secenekler.kip.some((k) => /aralık/i.test(k)), secenekler);
    const yazAralik = async (metin) => {
      await evalJs(`(() => { const e = document.querySelector('.ayir-aralik'); e.value = ${J(metin)}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await bekle(250);
    };
    const onizleme = () => evalJs(`({ li: [...document.querySelectorAll('.ayir-onizleme li')].map((l) => l.textContent.replace(/\\s+/g, ' ').trim()),
      ozet: document.querySelector('.ayir-onizleme b')?.textContent, adlarGorunur: !document.querySelector('.ayir-adlar').hidden,
      uzerineDevre: document.querySelector('.arac-kayit-secim > button[data-id="uzerine"]').disabled,
      kisit: document.querySelector('.arac-kayit-kisit').hidden ? '' : document.querySelector('.arac-kayit-kisit').textContent })`);
    await yazAralik('1-3, 5, 7-8');
    let o = await onizleme();
    sonuc('Ayrı ayrı dosya: "Ayrılmış - Sayfa 1-3.pdf", "… 5.pdf", "… 7-8.pdf"; Üzerine yaz seçilemez (neden yazar)',
      o.ozet === '3 dosya' && o.li[0].startsWith('Ayrılmış - Sayfa 1-3.pdf') && o.li[1].startsWith('Ayrılmış - Sayfa 5.pdf') && o.li[2].startsWith('Ayrılmış - Sayfa 7-8.pdf')
      && o.adlarGorunur && o.uzerineDevre && /yalnızca yeni belge/.test(o.kisit), o);
    await ss('03-ayir-ayri');
    await tikSecici('.ayir-dosya-kipi-secim > button[data-id="tek"]');
    o = await onizleme();
    sonuc('Tek dosya: "Ayrılmış.pdf" (6 sayfa: 1-3, 5, 7-8); Üzerine yaz seçilebilir', o.ozet === '1 dosya' && o.li[0] === 'Ayrılmış.pdf (6 sayfa: 1-3, 5, 7-8)' && !o.uzerineDevre && !o.kisit && !o.adlarGorunur, o);
    await ss('03-ayir-tek');
    // Her sayfayı ayrı dosyaya; aralık kutusuna tıklamak ve dosya sayısı seçimine tıklamak "Sayfa aralıklarına göre"yi seçer
    await tikSecici('input[name="ayir-mod"][value="herSayfa"]');
    o = await onizleme();
    sonuc('Her sayfayı ayrı dosyaya: 8 dosya "Ayrılmış - Sayfa 1.pdf"…', o.ozet === '8 dosya' && o.li[0].startsWith('Ayrılmış - Sayfa 1.pdf') && o.uzerineDevre, o.li.slice(0, 2));
    await tikSecici('.ayir-dosya-kipi-secim > button[data-id="ayri"]');
    const mod1 = await evalJs(`document.querySelector('input[name="ayir-mod"]:checked').value`);
    await tikSecici('input[name="ayir-mod"][value="herSayfa"]');
    await tikSecici('.ayir-aralik');
    const mod2 = await evalJs(`document.querySelector('input[name="ayir-mod"]:checked').value`);
    sonuc('dosya sayısı seçimine ya da sayfa kutusuna tıklamak "Sayfa aralıklarına göre"yi seçer', mod1 === 'aralik' && mod2 === 'aralik', { mod1, mod2 });
    // Ayrı ayrı dosya: diskte
    await diyalogKaydi();
    await evalJs(`document.querySelector('.arac-dugmeler .birincil').click()`);
    await kosul(`!document.querySelector('.ayir-sonuc').hidden`, 15000);
    let liste = dosyalar();
    sonuc('ayrı ayrı: diskte üç dosya, sayfaları doğru', J(liste) === J(['Ayrılmış - Sayfa 1-3.pdf', 'Ayrılmış - Sayfa 5.pdf', 'Ayrılmış - Sayfa 7-8.pdf'])
      && J(ilkSatirlar(path.join(CIKTI, 'Ayrılmış - Sayfa 1-3.pdf'))) === J(['Sayfa 1', 'Sayfa 2', 'Sayfa 3']) && J(ilkSatirlar(path.join(CIKTI, 'Ayrılmış - Sayfa 7-8.pdf'))) === J(['Sayfa 7', 'Sayfa 8']), liste);
    await ss('03-ayir-sonuc');
    // Yeniden: var olanlar korunur, "(2)" eklenir (önce sorulur)
    await diyalogYanitla([{ secim: 0 }]);   // Devam et
    await evalJs(`document.querySelector('.arac-dugmeler .birincil').click()`);
    await kosul(`document.querySelectorAll('.ayir-sonuc li').length === 3 && document.querySelector('.ayir-sonuc').textContent.includes('(2)')`, 15000);
    const soru = (await diyalogKaydi()).filter((d) => d.kanal === 'mesaj:kutu').map((d) => d.secenek?.mesaj);
    liste = dosyalar();
    sonuc('ikinci kez: "3 dosya zaten var" sorulur, yeni dosyalar "(2)" ile', soru.some((m) => /3 dosya zaten var/.test(m || '')) && liste.includes('Ayrılmış - Sayfa 1-3 (2).pdf') && liste.length === 6, { soru, liste });
    // Tek dosya: "Ayrılmış.pdf"
    await tikSecici('.ayir-dosya-kipi-secim > button[data-id="tek"]');
    await evalJs(`document.querySelector('.arac-dugmeler .birincil').click()`);
    await kosul(`document.querySelectorAll('.ayir-sonuc li').length === 1`, 15000);
    sonuc('tek dosya: "Ayrılmış.pdf" 6 sayfa', fs.existsSync(path.join(CIKTI, 'Ayrılmış.pdf')) && ilkSatirlar(path.join(CIKTI, 'Ayrılmış.pdf')).length === 6, dosyalar());
    await pencereKapat();
    // Yeniden açınca varsayılan ad boş ad: "Ayrılmış (2)"; ad değişince dosya adları değişir
    await aracAc('arac.ayir', 'ayir-pencere');
    const ad2 = await kosul(`document.querySelector('.arac-kayit-yeni .arac-cikti-ad')?.value === 'Ayrılmış (2)' && 'Ayrılmış (2)'`, 4000);
    sonuc('klasörde "Ayrılmış.pdf" varken önerilen ad "Ayrılmış (2)"', ad2 === 'Ayrılmış (2)', ad2);
    await yazAralik('2-3, 6');
    const ayriAd = await kosul(`document.querySelector('.arac-kayit-yeni .arac-cikti-ad')?.value === 'Ayrılmış' && 'Ayrılmış'`, 4000);
    sonuc('ayrı ayrı dosyaya geçince ortak ad yine "Ayrılmış" (dosyalar sayfa numarasıyla ayrılır)', ayriAd === 'Ayrılmış', ayriAd);
    await evalJs(`(() => { const e = document.querySelector('.arac-kayit-yeni .arac-cikti-ad'); e.value = 'Dilekçe ekleri'; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await bekle(200);
    o = await onizleme();
    sonuc('ad "Dilekçe ekleri": "Dilekçe ekleri - Sayfa 2-3.pdf", "… 6.pdf"', o.li[0]?.startsWith('Dilekçe ekleri - Sayfa 2-3.pdf') && o.li[1]?.startsWith('Dilekçe ekleri - Sayfa 6.pdf'), o.li);
    await evalJs(`document.querySelector('.arac-dugmeler .birincil').click()`);
    await kosul(`!document.querySelector('.ayir-sonuc').hidden`, 15000);
    sonuc('diskte "Dilekçe ekleri - Sayfa 2-3.pdf" ve "… 6.pdf"', fs.existsSync(path.join(CIKTI, 'Dilekçe ekleri - Sayfa 2-3.pdf')) && fs.existsSync(path.join(CIKTI, 'Dilekçe ekleri - Sayfa 6.pdf')), dosyalar());
    await pencereKapat();
    // Tek dosya + Üzerine yaz: özgün dosyada yalnızca o sayfalar kalır, sekme yenilenir
    await aracAc('arac.ayir', 'ayir-pencere');
    await yazAralik('2, 4-5');
    await tikSecici('.ayir-dosya-kipi-secim > button[data-id="tek"]');
    await kipSec('uzerine');
    const ozetU = await evalJs(`document.querySelector('.ayir-onizleme').textContent`);
    sonuc('üzerine yaz önizlemesi: "yalnızca 3 sayfa kalır"', /yalnızca 3 sayfa kalır/.test(ozetU), ozetU);
    await evalJs(`document.querySelector('.arac-dugmeler .birincil').click()`);
    await kosul(`!document.querySelector('.ayir-pencere') && window.__pdefe.aktif()?.gorunum?.sayfaSayisi === 3`, 15000);
    sonuc('üzerine yazıldı: zengin_b 3 sayfa (2, 4, 5), sekme yenilendi', J(ilkSatirlar(zengin.b)) === J(['Sayfa 2', 'Sayfa 4', 'Sayfa 5']) && await evalJs(`window.__pdefe.aktif().gorunum.sayfaSayisi`) === 3);
  }

  // ------------------------------------------------------------ 4) Birleştir
  if (bolum(4)) {
    console.log('\n== 4) Birleştir');
    await sekmeleriKapat();
    for (const a of dosyalar()) fs.rmSync(path.join(CIKTI, a));
    await ac(zengin.c);
    await aracAc('arac.gorselBirlestir', 'birlestir-pencere');
    await kosul(`document.querySelectorAll('.birlestir-oge').length === 1 && !document.querySelector('.birlestir-oge.yukleniyor')`, 8000);
    const ilk = await evalJs(`document.querySelector('.birlestir-oge .ad').textContent`);
    let d = await kayitDurumu();
    sonuc('açık PDF listenin başında; Üzerine yaz seçilebilir, ad "Birleşik"', ilk === 'zengin_c.pdf' && !d.secenekler[1].devre && !d.kisit && d.ad === 'Birleşik', { ilk, d: d.secenekler, ad: d.ad });
    await ss('04-birlestir-acik-pdf');
    // Listeden çıkarınca seçilemez, geri eklenince seçilebilir
    await kipSec('uzerine');
    await evalJs(`document.querySelector('.birlestir-oge [data-komut="sil"]').click()`);
    await bekle(300);
    d = await kayitDurumu();
    sonuc('açık PDF listeden çıkarılınca Üzerine yaz seçilemez (Yeni belge seçilir, neden yazar)', d.secenekler[1].devre && d.secenekler[0].secili && /listeden çıkarıldığı için/.test(d.kisit), d.kisit);
    await ss('04-birlestir-cikarildi');
    // Dosya ekle diyaloğunun yanıtı: önce açık PDF, sonra ikinci PDF
    await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:acDiyalog', [[${J(zengin.c)}, ${J(zengin.d)}]])`);
    await evalJs(`document.querySelector('.birlestir-ekle').click()`);
    await kosul(`document.querySelectorAll('.birlestir-oge').length === 2 && !document.querySelector('.birlestir-oge.yukleniyor')`, 8000);
    d = await kayitDurumu();
    sonuc('geri eklenince Üzerine yaz yeniden seçilebilir', !d.secenekler[1].devre && !d.kisit, d.secenekler);
    await kipSec('uzerine');
    d = await kayitDurumu();
    sonuc('Üzerine yaz: satırda "zengin_c" ve klasörü (soluk), not "Geri alınamaz"', d.sabitGorunur && d.ad === 'zengin_c' && d.klasor === PDF && /Geri alınamaz/.test(d.not), d);
    await ss('04-birlestir-uzerine');
    await evalJs(`document.querySelector('.arac-dugmeler .birincil').click()`);
    await kosul(`!document.querySelector('.birlestir-pencere') && window.__pdefe.aktif()?.gorunum?.sayfaSayisi === 16`, 20000);
    const satir = ilkSatirlar(zengin.c);
    sonuc('üzerine yazıldı: zengin_c 16 sayfa (c + d), sekme yenilendi; çıktı klasörüne dosya yazılmadı', satir.length === 16 && await evalJs(`window.__pdefe.aktif().ad`) === 'zengin_c.pdf' && dosyalar().length === 0, { sayfa: satir.length, cikti: dosyalar() });
    // PDF açık değilken: Üzerine yaz seçilemez
    await sekmeleriKapat();
    await aracAc('arac.gorselBirlestir', 'birlestir-pencere');
    d = await kayitDurumu();
    const bos = await evalJs(`document.querySelectorAll('.birlestir-oge').length`);
    sonuc('PDF açık değilken: liste boş, Üzerine yaz seçilemez (neden yazar)', bos === 0 && d.secenekler[1].devre && /PDF açıkken/.test(d.kisit), d.kisit);
    await ss('04-birlestir-belgesiz');
    await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:acDiyalog', [[${J(zengin.a)}]])`);
    await evalJs(`document.querySelector('.birlestir-ekle').click()`);
    await kosul(`document.querySelectorAll('.birlestir-oge').length === 1 && !document.querySelector('.birlestir-oge.yukleniyor')`, 8000);
    d = await kayitDurumu();
    sonuc('belgesiz açılan araçta dosya eklenince de Üzerine yaz seçilemez', d.secenekler[1].devre, d.secenekler);
    await evalJs(`document.querySelector('.arac-dugmeler .birincil').click()`);
    await kosul(`!document.querySelector('.birlestir-pencere')`, 15000);
    await aracAc('arac.gorselBirlestir', 'birlestir-pencere');
    const ad2 = await kosul(`document.querySelector('.arac-kayit-yeni .arac-cikti-ad')?.value === 'Birleşik (2)' && 'Birleşik (2)'`, 4000);
    sonuc('yeni belge "Birleşik.pdf"; ikincisinde önerilen ad "Birleşik (2)"', fs.existsSync(path.join(CIKTI, 'Birleşik.pdf')) && ad2 === 'Birleşik (2)', { dosyalar: dosyalar(), ad2 });
    await pencereKapat();
  }

  // ------------------------------------------------------------ 5) Sıkıştırma ve Döndür'ün yeni belgeleri
  if (bolum(5)) {
    console.log('\n== 5) Sıkıştırılmış, Döndürülmüş');
    await sekmeleriKapat();
    for (const a of dosyalar()) fs.rmSync(path.join(CIKTI, a));
    await ac(zengin.a);
    await aracAc('arac.kucult', 'kucult-pencere');
    await kosul(`document.querySelector('.arac-kayit-yeni .arac-cikti-ad')?.value === 'Sıkıştırılmış'`, 4000);
    await evalJs(`document.querySelector('.arac-dugmeler .birincil').click()`);
    await kosul(`!document.querySelector('.kucult-pencere') || !document.querySelector('.kucult-sonuc').hidden`, 20000);
    await kosul(`!document.querySelector('.kucult-pencere')`, 3000);
    sonuc('"Sıkıştırılmış.pdf" oluştu', fs.existsSync(path.join(CIKTI, 'Sıkıştırılmış.pdf')), dosyalar());
    await pencereKapat();
    await sekmeleriKapat();
    await ac(zengin.a);
    await aracAc('arac.dondurKaydet', 'dondur-pencere');
    await kosul(`document.querySelector('.arac-kayit-yeni .arac-cikti-ad')?.value === 'Döndürülmüş'`, 4000);
    await evalJs(`document.querySelector('.arac-dugmeler .birincil').click()`);
    await kosul(`!document.querySelector('.dondur-pencere')`, 15000);
    sonuc('"Döndürülmüş.pdf" oluştu', fs.existsSync(path.join(CIKTI, 'Döndürülmüş.pdf')), dosyalar());
  }

  const hatalar = await evalJs(`window.__hatalar || []`);
  sonuc('sayfada hata yok', !hatalar.length, hatalar.slice(0, 5));
  console.log(`\n${hataSayisi ? `${hataSayisi} HATA` : 'Hepsi geçti.'}`);
}
