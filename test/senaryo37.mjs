// Senaryo 37 (0.2.6, kullanıcı isteği): "Format Değiştir" aracı (araclar/donustur.js) — UDF ↔ PDF, TIFF ↔ PDF, Word ↔ PDF.
//   1) Araçlar penceresinde 6. karo (3 + 3), açılış ekranında ve Araçlar menüsünde (Birleştir'in hemen altında); belge gerektirmez: belge
//      yokken boş listeyle açılır (Aç penceresi açılmaz).
//   2) Açık PDF ilk girdi; hedefi UDF, önerilen ad PDF'in adı + .udf.
//   3) Tür dosyanın içeriğinden (uzantısı .udf olan PDF "PDF" sayılır, uyarı); hedef seçiminde kendi türü yok; varsayılan hedef PDF'te UDF,
//      ötekilerde PDF, son seçim kalıcı (yeni eklenen aynı türden dosyada önerilir); tanınmayan dosya satırda hatayla, Word dönüştürmesi
//      yoksa Word hedefi soluk ve nedeni ipucunda; aynı dosya iki kez eklenmez. UYAP Doküman Editörü (UDE) bulunamadı benzetimi: PDF hedefi
//      yaklaşık çizimle seçilebilir (C2; ayrıntısı test/udf_yaklasik.mjs), satırda "görünüm yaklaşık" uyarısı ve "UYAP Doküman Editörü'nün yerini
//      göster" bağlantısı; bağlantı klasör seçtirir (ana süreç ayar:udeKlasoruSec),
//      klasörde UDE yoksa ayar değişmez; arayüz ayar:koy ile udeYolu'nu klasöre yazamaz (yalnızca null).
//   4) TIFF seçenekleri yalnızca TIFF hedefi varken görünür; varsayılan İdeal (0.2.7: 300 dpi; 0.2.6'da 200 dpi), Siyah beyaz.
//   5) Kaydet bölümü: tek dosyada ad girdinin adı, uzantı hedefe göre değişir, klasörde varsa "(2)"; "Üzerine yaz" seçilemez, nedeni altında;
//      Değiştir'in kaydetme penceresi süzgeci biçime göre; birden çok dosyada ad kutusu yok, Değiştir klasör seçtirir, adlar notu görünür.
//   6) Gerçek dönüşümler (PyMuPDF / PIL ile ölçülür): TIFF → PDF (A4, sayfa sayısı; sonuç sekmede açılır, pencere kapanır), PDF → TIFF
//      (300 dpi, gri), PDF → UDF (zip, content.xml), UDF → PDF (UDE varsa), PDF → Word (Word dönüştürmesi varsa ve $env:S37_WORD="1": Word'ü
//      kullanabilir, uzun sürebilir); birden çok dosyada sonuç
//      listesi, Klasörde göster, PDF'ler için Aç, var olan adda "(2)".
//   7) İptal: uzun TIFF'in dönüştürmesi İptal'le durur, hedef klasörde dosya ve geçici dosya kalmaz; geç gelen iptal (benzetim) yeni dosyayı
//      çöp kutusuna gönderir (sınamada kaydedilir, gönderilmez), onaylanıp üzerine yazılan dosyayı bırakır; dönüştürme sürerken X sorar.
//   8) Açma yolları: ana pencereye bırakılan PDF sekmede, UDF / TIFF / Word araçta açılır (araç açıksa listesine eklenir); Ctrl+O'nun
//      süzgecinde desteklenen türler, seçilen UDF araçta; komut satırı (ikinci örnek, Gezgin'de "Birlikte aç") ve ana sürecin dosya:ac'ı;
//      sürükleme örtüsü "Dosyaları bırakın".
//   9) Ayarlar › Kaydetme › Format Değiştir › "UYAP Doküman Editörü": bulunan editörün yolu, sürümü ve Java; "Klasörü seç…" (ana
//      sürecin penceresi; editörün olmadığı klasör ayarı değiştirmez, nedeni yazar; editörün klasörü ayara yazılır), "Otomatik bul" ayarı
//      temizler; çıktı klasörü kartının açıklamasında yeni araç.
// Girdiler test/donustur_arayuz_uret.py ile test/cikti/s37/girdi altında üretilir (gerçek belge yok); çıktılar test/cikti/s37/cikti.
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9437 -Veri "$env:TEMP\pdefe-s37-9437" -Boyut "1280,1000"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9437; node test\surucu.mjs betik test\senaryo37.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="3,5". Ekran görüntüleri test/cikti/s37/png altına.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's37');
const GIRDI = path.join(UI, 'girdi');
const CIKTI = path.join(UI, 'cikti');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};
const atlandi = (ad, neden) => console.log(`ATLANDI ${ad} — ${neden}`);

/** Python (proje .venv) çalıştırır; son satırı JSON olarak döner. */
function py(kod) {
  const on = 'import sys, json, os, zipfile\nimport pymupdf\nfrom PIL import Image\n';
  const cikti = execFileSync(PY, ['-X', 'utf8', '-c', on + kod], { encoding: 'utf8' });
  return JSON.parse(cikti.trim().split(/\r?\n/).pop());
}
const pdfOzeti = (yol) => py(`d = pymupdf.open(${J(yol)}, filetype="pdf")\nprint(json.dumps({"sayfa": d.page_count, "olcu": [[round(p.rect.width, 1), round(p.rect.height, 1)] for p in d]}))`);
const tiffOzeti = (yol) => py(`im = Image.open(${J(yol)})\nprint(json.dumps({"sayfa": im.n_frames, "dpi": [round(float(x)) for x in im.info.get("dpi", (0, 0))], "kip": im.mode}))`);
const zipOzeti = (yol) => py(`z = zipfile.ZipFile(${J(yol)})\nadlar = z.namelist()\nx = z.read("content.xml").decode("utf-8") if "content.xml" in adlar else ""\nw = "word/document.xml" in adlar\nprint(json.dumps({"adlar": adlar, "template": "<template" in x, "word": w}))`);
const A4 = (o) => Math.abs(o[0] - 595.3) <= 1.5 && Math.abs(o[1] - 841.9) <= 1.5;

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, hedefler, hedefSec }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const yanitla = (kanal, yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', ${J(kanal)}, ${J(yanitlar)})`);
  const kayit = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const bildirimler = () => evalJs(`(() => { const b = window.__s37b.splice(0); return b; })()`);
  const tikSecici = async (secici) => {
    const r = await evalJs(`(() => { const e = ${secici.startsWith('[') || secici.startsWith('document') ? secici : `document.querySelector(${J(secici)})`}; if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) return false;
    await tikla(r.x, r.y);
    await bekle(250);
    return true;
  };
  const A = 'window.__s37.m.acikDonusturPenceresi()';
  /** Açık araç pencerelerini kapatır; dönüştürme sürüyorsa sorusu "İptal et ve kapat" ile yanıtlanır. */
  const pencereKapat = async () => {
    await evalJs(`(async () => { window.__pdefeOtoYanit = { secim: 0 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); }
      finally { delete window.__pdefeOtoYanit; } return true; })()`);
    return kosul(`!document.querySelector('.arac-ortusu')`, 5000);
  };
  const sekmeleriKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return window.__pdefe.belgeler.size; })()`);
  const ac = async (yol) => {
    await evalJs(`window.__pdefe.dosyaAc(${J(yol)}).then(() => true)`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
    await bekle(300);
  };
  /** Aracı verilen dosyalarla açar ve satırlar okunana dek bekler. */
  const aracAc = async (yollar = [], sure = 20000) => {
    await evalJs(`window.__pdefe.komutCalistir('arac.donustur', ${J(yollar)})`);
    await kosul(`!!document.querySelector('.donustur-pencere')`, 5000);
    await kosul(`!document.querySelector('.donustur-oge.yukleniyor')`, sure);
    await bekle(300);
  };
  const satirlar = () => evalJs(`[...document.querySelectorAll('.donustur-pencere .donustur-oge')].map((e) => ({
    ad: e.querySelector('.ad').textContent, tur: e.dataset.tur, ozet: e.querySelector('.ozet').textContent, hedefGorunur: !e.querySelector('.hedef-satiri').hidden,
    hedefler: [...e.querySelectorAll('.donustur-hedef-secim > button')].map((b) => ({ id: b.dataset.id, ad: b.textContent, secili: b.classList.contains('secili'), devre: b.disabled, ipucu: b.title })),
    neden: e.querySelector('.neden').hidden ? '' : (e.querySelector('.neden .metin')?.textContent || ''), bag: e.querySelector('.neden:not([hidden]) [data-komut="ude"]')?.textContent || '',
    uyari: e.querySelector('.uyari').hidden ? '' : e.querySelector('.uyari').textContent, hata: e.querySelector('.hata').hidden ? '' : e.querySelector('.hata').textContent,
    resim: e.querySelector('.resim img') ? 'img' : (e.querySelector('.resim .yer')?.textContent || '') }))`);
  const kayitDurumu = () => evalJs(`(() => { const a = ${A}; const p = document.querySelector('.donustur-pencere'); const k = p.querySelector('.arac-kayit');
    const adEl = k.querySelector('.arac-kayit-yeni .arac-cikti-ad');
    return { ad: adEl.value, adGizli: adEl.hidden, klasor: k.querySelector('.arac-kayit-yeni .arac-klasor-cip').dataset.klasor, cikti: a.kayit.cikti.ad(), coklu: a.kayit.coklu(),
      secim: !!k.querySelector('.arac-kayit-secim'), kayitMetni: p.querySelector('.donustur-kayit').innerText,
      kisit: k.querySelector('.arac-kayit-kisit').hidden ? '' : k.querySelector('.arac-kayit-kisit').textContent, cokluJpg: !p.querySelector('.donustur-coklu-jpg').hidden,
      degistirIpucu: k.querySelector('.arac-kayit-yeni .arac-cikti-degistir').title, secenekler: !p.querySelector('.donustur-secenekler').hidden,
      donusturDevre: p.querySelector('.arac-dugmeler .birincil').disabled }; })()`);
  const donusturBas = () => tikSecici('.donustur-pencere .arac-dugmeler .birincil');
  /** Dönüştür'e basar; pencere kapanana ya da sonuç görünene dek bekler. */
  const donusturVeBekle = async (sure = 90000) => {
    await donusturBas();
    await kosul(`!document.querySelector('.donustur-pencere') || !document.querySelector('.donustur-sonuc')?.hidden || !!document.querySelector('.donustur-pencere .arac-hata')`, sure);
    await bekle(400);
  };
  const ciktiDosyalari = () => fs.readdirSync(CIKTI).sort();
  const bolumler = (process.env.BOLUM || '1,2,3,4,5,6,7,8,9').split(',').map((s) => s.trim());
  const bolum = (n) => bolumler.includes(String(n));

  // ------------------------------------------------------------ hazırlık
  await pencereKapat();
  await sekmeleriKapat();
  await bekle(400);
  fs.mkdirSync(PNG, { recursive: true });
  fs.rmSync(CIKTI, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); fs.mkdirSync(CIKTI, { recursive: true });
  const G = JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'donustur_arayuz_uret.py'), GIRDI], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  await evalJs(`(async () => {
    window.__s37 = { m: await import('pdefe://app/src/renderer/araclar/donustur.js') };
    window.__s37b = [];
    if (!window.__s37Gozlem) {
      window.__s37Gozlem = new MutationObserver(() => { const t = document.querySelector('#bildirim')?.textContent; if (t && window.__s37b.at(-1) !== t) window.__s37b.push(t); });
      window.__s37Gozlem.observe(document.querySelector('#bildirim'), { childList: true, characterData: true, subtree: true });
      window.__s37Hatalar = [];
      addEventListener('error', (e) => window.__s37Hatalar.push('error: ' + e.message));
      addEventListener('unhandledrejection', (e) => window.__s37Hatalar.push('reject: ' + (e.reason?.message || e.reason)));
      const ce = console.error; console.error = (...a) => { window.__s37Hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); };
    }
    for (const [k, v] of Object.entries({ ciktiKlasoru: ${J(CIKTI)}, otomatikKaydet: false, donusturme: {} })) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; }
    await window.pdefe.cagir('ayar:koy', 'udeYolu', null); window.__pdefe.ayar().udeYolu = null;
    window.__pdefeYerelKutu = true;
    return true;
  })()`);
  for (let i = 0; i < 20 && (await evalJs(`window.pdefe.cagir('dosya:acDiyalog', { baslik: 'test kuyruğu boşaltma' })`))?.length; i++);
  await kayit();
  // Bu bilgisayarda UDE ve Word dönüştürmesi var mı (UDE / Word gerektiren denetimler yoksa atlanır)
  const YET = await evalJs(`window.pdefe.cagir('cekirdek:cagir', 'donusum_yetenekleri', {}, null)`);
  const UDE_VAR = !!YET?.donusumler?.['udf>pdf']?.var, WORD_VAR = !!YET?.donusumler?.['pdf>word']?.var;
  console.log(`     UYAP Doküman Editörü: ${UDE_VAR ? 'var' : 'yok'} (${YET?.udf?.ude?.yol || YET?.udf?.neden || '?'}); Word dönüştürmesi: ${WORD_VAR ? 'var' : 'yok'}`);

  // ------------------------------------------------------------ 1) Karo, açılış ekranı, menü
  if (bolum(1)) {
    console.log('\n== 1) Karo, açılış ekranı, Araçlar menüsü');
    const tanim = await evalJs(`import('pdefe://app/src/renderer/aracPenceresi.js').then((m) => m.ARACLAR.map((a) => ({ komut: a.komut, ad: a.ad, aciklama: a.aciklama, renk: a.renk, belge: a.belge })))`);
    const t = tanim.at(-1);
    sonuc('ARACLAR: 6. araç "Format Değiştir" (arac.donustur), belge gerektirmez, kendi rengi', tanim.length === 6 && t.komut === 'arac.donustur' && t.ad === 'Format Değiştir'
      && t.belge === false && !tanim.slice(0, 5).some((x) => x.renk === t.renk), tanim);
    await tikSecici('#dugme-araclar');
    await kosul(`!document.querySelector('#araclar-penceresi').hidden`);
    const karo = await evalJs(`(() => { const k = [...document.querySelectorAll('.araclar-karo')]; const r = k.map((e) => e.getBoundingClientRect());
      const satir = [...new Set(r.map((x) => Math.round(x.top)))]; const s = k.at(-1);
      return { sayi: k.length, satirlar: satir.map((y) => r.filter((x) => Math.round(x.top) === y).length), komut: s.dataset.aracKomut, ad: s.querySelector('.araclar-ad').textContent,
        aciklama: s.querySelector('.araclar-aciklama').textContent, ipucu: s.title, renk: getComputedStyle(s).getPropertyValue('--renk').trim(), ikon: !!s.querySelector('svg rect') }; })()`);
    sonuc('Araçlar penceresi: altı karo 3 + 3; sonuncusu "Format Değiştir", açıklama, ipucu, simge ve turkuaz renk', karo.sayi === 6 && J(karo.satirlar) === J([3, 3])
      && karo.komut === 'arac.donustur' && karo.ad === 'Format Değiştir' && karo.aciklama === 'PDF, UDF, Word, TIFF, JPG dosya formatlarını değiştirir' && /UDF, TIFF, Word ve görüntü/.test(karo.ipucu) && karo.ikon && !!karo.renk, karo);
    await ss('01-araclar-penceresi');
    // Belge yokken karo: Aç penceresi açılmaz, araç boş listeyle açılır
    await kayit();
    await tikSecici('.araclar-karo[data-arac-komut="arac.donustur"]');
    await kosul(`!!document.querySelector('.donustur-pencere')`, 5000);
    await bekle(400);
    const bos = await evalJs(`({ baslik: document.querySelector('.donustur-pencere .arac-baslik-metin').textContent, satir: document.querySelectorAll('.donustur-oge').length,
      bosMesaj: document.querySelector('.donustur-liste .bos-mesaj')?.innerText || '', devre: document.querySelector('.donustur-pencere .arac-dugmeler .birincil').disabled,
      dugme: document.querySelector('.donustur-pencere .arac-dugmeler .birincil').textContent })`);
    const acKaydi = (await kayit()).filter((x) => x.kanal === 'dosya:acDiyalog');
    sonuc('Belge yokken karo: Aç penceresi açılmaz, araç boş listeyle açılır ("Dosyaları buraya sürükleyin"), Dönüştür soluk', !acKaydi.length && bos.baslik === 'Format Değiştir'
      && bos.satir === 0 && /Dosyaları buraya sürükleyin/.test(bos.bosMesaj) && /UDF, TIFF, Word/.test(bos.bosMesaj) && bos.devre && bos.dugme === 'Dönüştür', { acKaydi, bos });
    await ss('01-bos-pencere');
    await pencereKapat();
    // Açılış ekranı
    const acilis = await evalJs(`(async () => { if (window.__pdefe.belgeler.size) await window.__pdefe.komutCalistir('sekme.yeni'); await new Promise((c) => setTimeout(c, 400));
      const k = document.querySelector('.karsilama-arac[data-eylem="arac.donustur"]'); return k ? { ad: k.querySelector('.karsilama-arac-ad').textContent, aciklama: k.querySelector('.karsilama-aciklama').textContent,
        sira: [...document.querySelectorAll('.karsilama-arac')].indexOf(k), renk: getComputedStyle(k).getPropertyValue('--renk').trim() } : null; })()`);
    sonuc('Açılış ekranı: 6. kart "Format Değiştir" (aynı açıklama ve renk)', acilis?.ad === 'Format Değiştir' && acilis.sira === 5 && acilis.aciklama === t.aciklama && acilis.renk === karo.renk, acilis);
    await tikSecici('.karsilama-arac[data-eylem="arac.donustur"]');
    sonuc('Açılış ekranındaki kart aracı açar', !!(await kosul(`!!document.querySelector('.donustur-pencere')`, 5000)));
    await ss('01-acilis');
    await pencereKapat();
    // Araçlar menüsü (Windows şablonu; Mac şablonu aynı araclarMenusu'nu kullanır)
    const menu = await evalJs(`window.pdefe.cagir('test:menu')`);
    const araclar = (menu || []).find((m) => m?.etiket === '&Araçlar' || m?.etiket === 'Araçlar')?.alt || [];
    const i = araclar.indexOf('Format Değiştir');
    sonuc('Araçlar menüsü: "Format Değiştir" Birleştir\'in hemen altında', i > 0 && /birleştir/i.test(araclar[i - 1]), araclar);
    await evalJs(`window.pdefe.cagir('test:olayGonder', 'menu:komut', 'arac.donustur')`);
    sonuc('Araçlar menüsünden seçilince araç açılır', !!(await kosul(`!!document.querySelector('.donustur-pencere')`, 5000)));
    await pencereKapat();
  }

  // ------------------------------------------------------------ 2) Açık PDF ilk girdi
  if (bolum(2)) {
    console.log('\n== 2) Açık PDF ilk girdi');
    await ac(G.pdf);
    await evalJs(`window.__pdefe.komutCalistir('arac.donustur')`);
    await kosul(`!!document.querySelector('.donustur-pencere') && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    await kosul(`document.querySelector('.donustur-pencere .arac-kayit-yeni .arac-cikti-ad')?.value === 'Dilekçe örneği'`, 5000);
    const S = await satirlar(), k = await kayitDurumu();
    sonuc('Açık PDF listenin ilk (tek) girdisi; türü PDF, 2 sayfa, küçük resmi var; hedefte PDF yok, UDF seçili', S.length === 1 && S[0].ad === 'Dilekçe örneği.pdf' && S[0].tur === 'pdf'
      && /^PDF · 2 sayfa/.test(S[0].ozet) && S[0].resim === 'img' && J(S[0].hedefler.map((h) => h.id)) === J(['udf', 'word', 'tiff', 'gorsel']) && S[0].hedefler.find((h) => h.secili)?.id === 'udf', S);
    sonuc('Kaydet: önerilen ad PDF\'in adı, uzantı .udf, klasör çıktı klasörü', k.ad === 'Dilekçe örneği' && k.cikti === 'Dilekçe örneği.udf' && k.klasor === CIKTI && !k.coklu && !k.donusturDevre, k);
    await ss('02-acik-pdf');
    await pencereKapat();
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 3) Tür, hedef, kalıcı seçim, UDE yok benzetimi
  if (bolum(3)) {
    console.log('\n== 3) Tür ve hedef seçimi');
    await aracAc([]);
    await yanitla('dosya:acDiyalog', [[G.pdf, G.tiff, G.udf, G.udf_xml, G.docx, G.txt, G.pdf_udf]]);
    await tikSecici('.donustur-pencere .donustur-ekle');
    await kosul(`document.querySelectorAll('.donustur-oge').length === 7 && !document.querySelector('.donustur-oge.yukleniyor')`, 20000);
    await bekle(600);
    const dk = (await kayit()).find((x) => x.kanal === 'dosya:acDiyalog');
    sonuc('Dosya ekle: çoklu seçim, ilk süzgeç "Desteklenen dosyalar" (pdf, udf, tif, tiff, doc, docx, rtf, odt; 0.2.7: görüntüler), ayrıca tek tek ve Tüm dosyalar', dk?.secenek?.coklu === true
      && dk.secenek.filtreler?.[0]?.name === 'Desteklenen dosyalar' && J(dk.secenek.filtreler[0].extensions) === J(['pdf', 'udf', 'tif', 'tiff', 'doc', 'docx', 'rtf', 'odt', 'jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'])
      && J(dk.secenek.filtreler.map((f) => f.name)) === J(['Desteklenen dosyalar', 'PDF belgeleri', 'UDF belgeleri', 'TIFF görüntüleri', 'Word belgeleri', 'Görüntüler', 'Tüm dosyalar']), dk?.secenek);
    let S = await satirlar();
    const s = Object.fromEntries(S.map((x) => [x.ad, x]));
    const hedefIdleri = (x) => x.hedefler.map((h) => h.id).join(',');
    const secili = (x) => x.hedefler.find((h) => h.secili)?.id;
    sonuc('Türler içerikten: PDF, TIFF (3 sayfa), UDF (zip ve düz XML), Word (DOCX); uzantısı .udf olan PDF "PDF"', s['Dilekçe örneği.pdf']?.tur === 'pdf' && s['Tarama örneği.tif']?.tur === 'tiff'
      && /TIFF · 3 sayfa/.test(s['Tarama örneği.tif'].ozet) && s['Karar örneği.udf']?.tur === 'udf' && s['Düz biçim.udf']?.tur === 'udf' && s['Word örneği.docx']?.tur === 'word'
      && /^DOCX/.test(s['Word örneği.docx'].ozet) && s['Yanlış uzantı.udf']?.tur === 'pdf', S.map((x) => [x.ad, x.tur, x.ozet]));
    sonuc('Hedef seçiminde kendi türü yok (0.2.7: JPG de): PDF → UDF, Word, TIFF, JPG; TIFF → PDF, UDF, Word, JPG; UDF → PDF, Word, TIFF, JPG; Word → PDF, UDF, TIFF, JPG', hedefIdleri(s['Dilekçe örneği.pdf']) === 'udf,word,tiff,gorsel'
      && hedefIdleri(s['Tarama örneği.tif']) === 'pdf,udf,word,gorsel' && hedefIdleri(s['Karar örneği.udf']) === 'pdf,word,tiff,gorsel' && hedefIdleri(s['Word örneği.docx']) === 'pdf,udf,tiff,gorsel', S.map((x) => [x.ad, hedefIdleri(x)]));
    sonuc('Varsayılan hedef: PDF\'te UDF, TIFF ve UDF\'de PDF', secili(s['Dilekçe örneği.pdf']) === 'udf' && secili(s['Tarama örneği.tif']) === 'pdf' && (secili(s['Karar örneği.udf']) === 'pdf' || !UDE_VAR), S.map((x) => [x.ad, secili(x)]));
    sonuc('Tanınmayan dosya: satırda anlaşılır hata, hedef seçimi yok, türün adı yer tutucuda', /biçimi tanınmadı/.test(s['notlar.txt']?.hata || '') && !s['notlar.txt'].hedefGorunur && s['notlar.txt'].resim === 'TXT', s['notlar.txt']);
    sonuc('Uzantısı içeriğiyle uyuşmayan dosyada uyarı ("içeriği PDF (uzantısı .udf)")', /içeriği PDF \(uzantısı \.udf\)/.test(s['Yanlış uzantı.udf']?.uyari || ''), s['Yanlış uzantı.udf']);
    if (!WORD_VAR) {
      const w = s['Dilekçe örneği.pdf'].hedefler.find((h) => h.id === 'word');
      sonuc('Word dönüştürmesi yokken PDF\'in Word hedefi soluk, nedeni ipucunda; Word dosyasının bütün hedefleri soluk, satırda neden', w?.devre && /Word/.test(w.ipucu)
        && s['Word örneği.docx'].hedefler.every((h) => h.devre) && /dönüştürülemez/.test(s['Word örneği.docx'].neden), { w, docx: s['Word örneği.docx'] });
    } else {
      sonuc('Word dönüştürmesi var: PDF\'in Word hedefi seçilebilir', !s['Dilekçe örneği.pdf'].hedefler.find((h) => h.id === 'word')?.devre, s['Dilekçe örneği.pdf'].hedefler);
    }
    const ozet = await evalJs(`document.querySelector('.donustur-ozet').textContent`);
    sonuc('Özet: dosya sayısı ve dönüştürülebilir sayısı', /^7 dosya · \d dosya dönüştürülebilir$/.test(ozet), ozet);
    await ss('03-turler');
    // Aynı dosya ikinci kez eklenmez
    await evalJs(`window.__s37b.length = 0`);
    await yanitla('dosya:acDiyalog', [[G.pdf]]);
    await tikSecici('.donustur-pencere .donustur-ekle');
    await bekle(500);
    sonuc('Aynı dosya ikinci kez eklenmez ("Dosya zaten listede.")', (await satirlar()).length === 7 && (await bildirimler()).includes('Dosya zaten listede.'));
    // Kalıcı seçim: PDF satırının hedefi TIFF (gerçek tıklama) → ayar; yeni eklenen PDF'te TIFF önerilir
    await tikSecici(`[...document.querySelectorAll('.donustur-oge')].find((e) => e.querySelector('.ad').textContent === 'Dilekçe örneği.pdf').querySelector('.donustur-hedef-secim > button[data-id="tiff"]')`);
    const ayar1 = await evalJs(`window.pdefe.cagir('ayar:al', 'donusturme')`);
    const kopya = path.join(GIRDI, 'Dilekçe kopyası.pdf');
    fs.copyFileSync(G.pdf, kopya);
    await evalJs(`${A}.dosyaEkle(${J([kopya])})`);
    await kosul(`!document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    S = await satirlar();
    const yeniPdf = S.find((x) => x.ad === 'Dilekçe kopyası.pdf');
    sonuc('Son seçim kalıcı: PDF\'in hedefi TIFF seçilince ayara yazılır, yeni eklenen PDF\'te TIFF önerilir', ayar1?.hedefler?.pdf === 'tiff' && secili(yeniPdf || { hedefler: [] }) === 'tiff', { ayar1, yeniPdf });
    sonuc('TIFF hedefi varken TIFF seçenekleri görünür: İdeal (0.2.7; 300 dpi) ve Siyah beyaz seçili', await evalJs(`(() => { const p = document.querySelector('.donustur-secenekler'); return !p.hidden
      && p.querySelector('.donustur-dpi-secim .secili .ad')?.textContent === 'İdeal' && p.querySelector('.donustur-dpi-secim .secili')?.dataset.id === '300'
      && p.querySelector('.donustur-renk-secim .secili')?.textContent === 'Siyah beyaz'; })()`));
    await ss('03-tiff-secenekleri');
    // UDE bulunamadı benzetimi: çekirdeğin bu bilgisayardaki yanıtı yerine UDE'siz yetenek ve satır hedefleri
    const UDE_YOK = 'Bu bilgisayarda UYAP Doküman Editörü bulunamadı.';
    await evalJs(`(() => { const a = ${A}; a.yetenekler = { ...(a.yetenekler || {}), udf: { var: false, neden: ${J(UDE_YOK)}, ude: { var: false, yol: null } } };
      for (const o of a.ogeler) if (o.tur === 'udf') { for (const b of ['pdf', 'word', 'tiff']) o.hedefler.set(b, { bicim: b, var: false, neden: ${J(UDE_YOK)} }); o.hedefBicim = 'pdf'; a._ogeCiz(o); }
      a._durumGuncelle(); return true; })()`);
    S = await satirlar();
    const u = S.find((x) => x.ad === 'Karar örneği.udf');
    // 0.2.6 (C2): UDE yokken UDF yaklaşık çizimle dönüştürülür: PDF hedefi (ve PDF → TIFF / Word yapılabiliyorsa TIFF / Word) seçilebilir, satırda
    // neden değil "görünüm yaklaşık" uyarısı; bağlantı yine var
    const yh = (id) => u.hedefler.find((h) => h.id === id);
    sonuc('UDE yok: UDF satırının PDF hedefi yaklaşık çizimle seçilebilir (TIFF / Word, PDF\'ten dönüştürülebiliyorsa); satırda "görünüm yaklaşık" uyarısı ve "UYAP Doküman Editörü\'nün yerini göster" bağlantısı',
      !yh('pdf')?.devre && /görünüm yaklaşık/.test(yh('pdf')?.ipucu || '') && yh('tiff')?.devre === !YET?.donusumler?.['pdf>tiff']?.var && yh('word')?.devre === !WORD_VAR
      && /^UYAP Doküman Editörü bulunamadı; görünüm yaklaşık/.test(u.neden) && u.bag === 'UYAP Doküman Editörü\'nün yerini göster', u);
    await ss('03-ude-yok');
    // Bağlantı: klasör seçtirir; seçilen klasörde UDE yoksa ayar değişmez
    const bosKlasor = path.join(UI, 'bos-klasor');
    fs.mkdirSync(bosKlasor, { recursive: true });
    await evalJs(`window.__s37b.length = 0`);
    await yanitla('dosya:klasorSec', [bosKlasor]);
    await tikSecici(`[...document.querySelectorAll('.donustur-oge')].find((e) => e.querySelector('.ad').textContent === 'Karar örneği.udf').querySelector('[data-komut="ude"]')`);
    await bekle(1500);
    const kk = (await kayit()).find((x) => x.kanal === 'dosya:klasorSec');
    const udeAyari1 = await evalJs(`window.pdefe.cagir('ayar:al', 'udeYolu')`);
    sonuc('Bağlantı ana sürecin klasör seçme penceresini açar; klasörde UDE yoksa ayar değişmez, bildirilir', !!kk && kk.secenek?.ude === true && /UYAP Doküman Editörü/.test(kk.secenek.baslik)
      && udeAyari1 == null && (await bildirimler()).some((b) => /Seçilen klasörde UYAP Doküman Editörü bulunamadı/.test(b)), { kk, udeAyari1 });
    let reddedildi = false;
    try { await evalJs(`window.pdefe.cagir('ayar:koy', 'udeYolu', ${J(bosKlasor)})`); } catch { reddedildi = true; }
    sonuc('Arayüz ayar:koy ile udeYolu\'nu bir klasöre yazamaz (yalnızca null)', reddedildi && (await evalJs(`window.pdefe.cagir('ayar:al', 'udeYolu')`)) == null);
    // Nesne anahtarı (electron-store bütün girdileri yazar) ve noktalı yol da reddedilir (0.2.6 incelemesi: korumayı aşıyordu)
    const redSayisi = await evalJs(`(async () => { let n = 0;
      for (const [a, d] of [[{ udeYolu: ${J(bosKlasor)} }, undefined], ['udeYolu.x', ${J(bosKlasor)}], ['bilinmeyenAyar', 1]]) { try { await window.pdefe.cagir('ayar:koy', a, d); } catch { n++; } }
      return n; })()`);
    const udeAyari3 = await evalJs(`window.pdefe.cagir('ayar:al', 'udeYolu')`);
    sonuc('ayar:koy: nesne anahtarı, noktalı yol ve bilinmeyen ayar reddedilir; udeYolu değişmez', redSayisi === 3 && udeAyari3 == null
      && (await evalJs(`window.pdefe.cagir('ayar:al', 'bilinmeyenAyar')`)) == null, { redSayisi, udeAyari3 });
    if (UDE_VAR && YET.udf?.ude?.yol) {
      await yanitla('dosya:klasorSec', [YET.udf.ude.yol]);
      await tikSecici(`[...document.querySelectorAll('.donustur-oge')].find((e) => e.querySelector('.ad').textContent === 'Karar örneği.udf').querySelector('[data-komut="ude"]')`);
      await kosul(`(() => { const o = ${A}.ogeler.find((x) => x.ad === 'Karar örneği.udf'); return !o.yukleniyor && o.hedefler.get('pdf')?.var; })()`, 15000);
      const udeAyari2 = await evalJs(`window.pdefe.cagir('ayar:al', 'udeYolu')`);
      const y2 = await evalJs(`${A}.yetenekler?.udf?.ude`);
      S = await satirlar();
      const u2 = S.find((x) => x.ad === 'Karar örneği.udf');
      sonuc('UDE\'nin klasörü gösterilince ayara yazılır (ana süreç), yetenekler ve UDF satırı yenilenir: hedefler seçilebilir, neden kalkar', udeAyari2 === YET.udf.ude.yol && y2?.kaynak === 'ayar'
        && !u2.neden && !u2.hedefler.find((h) => h.id === 'pdf').devre, { udeAyari2, y2, u2 });
      await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'udeYolu', null); window.__pdefe.ayar().udeYolu = null; return true; })()`);
    } else atlandi('UDE\'nin gerçek klasörüyle bağlantı', 'bu bilgisayarda UYAP Doküman Editörü yok');
    // PDF → Word dönüştürücüsü yok benzetimi: çekirdek bu hedefi hiç sunmuyorsa neden pdf_word yeteneğinden (Word → PDF'inki değil)
    const wb = await evalJs(`(() => { const a = ${A}; const d = { ...(a.yetenekler?.donusumler || {}) }; delete d['pdf>word'];
      a.yetenekler = { ...(a.yetenekler || {}), donusumler: d, pdf_word: { var: false, neden: 'PDF → Word dönüştürücüsü bu sürümde eksik.' }, word: { var: true } };
      const o = a.ogeler.find((x) => x.ad === 'Dilekçe örneği.pdf'); o.hedefler.delete('word'); a._ogeCiz(o);
      const b = [...document.querySelectorAll('.donustur-oge')].find((e) => e.querySelector('.ad').textContent === 'Dilekçe örneği.pdf').querySelector('.donustur-hedef-secim > button[data-id="word"]');
      return { devre: b.disabled, ipucu: b.title }; })()`);
    sonuc('PDF → Word dönüştürücüsü yokken Word hedefi soluk, nedeni pdf_word yeteneğinden', wb.devre && wb.ipucu === 'PDF → Word dönüştürücüsü bu sürümde eksik.', wb);
    await pencereKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
    fs.rmSync(kopya, { force: true });
  }

  // ------------------------------------------------------------ 4) TIFF seçenekleri
  if (bolum(4)) {
    console.log('\n== 4) TIFF seçenekleri');
    await aracAc([G.tiff, G.pdf]);
    const gizli = await evalJs(`document.querySelector('.donustur-secenekler').hidden`);
    sonuc('TIFF hedefi yokken (TIFF → PDF, PDF → UDF) seçenekler görünmez', gizli === true);
    await tikSecici(`[...document.querySelectorAll('.donustur-oge')].find((e) => e.querySelector('.ad').textContent === 'Dilekçe örneği.pdf').querySelector('.donustur-hedef-secim > button[data-id="tiff"]')`);
    const s4 = await evalJs(`(() => { const p = document.querySelector('.donustur-secenekler'); return { gorunur: !p.hidden, baslik: p.querySelector('.arac-bolum-baslik').textContent,
      dpi: [...p.querySelectorAll('.donustur-dpi-secim > button')].map((b) => [b.querySelector('.ad').textContent, b.classList.contains('secili')]),
      renk: [...p.querySelectorAll('.donustur-renk-secim > button')].map((b) => [b.textContent, b.classList.contains('secili')]), not: p.querySelector('.arac-aciklama').textContent }; })()`);
    sonuc('PDF\'in hedefi TIFF: "TIFF seçenekleri" görünür; Çözünürlük İdeal / Düşük (0.2.7; İdeal seçili), Renk Siyah beyaz / Gri / Renkli (Siyah beyaz seçili)', s4.gorunur && s4.baslik === 'TIFF seçenekleri'
      && J(s4.dpi) === J([['İdeal', true], ['Düşük', false]]) && J(s4.renk) === J([['Siyah beyaz', true], ['Gri', false], ['Renkli', false]]) && /kendi çözünürlüğünde/.test(s4.not), s4);
    await ss('04-tiff-secenekleri');
    await pencereKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
  }

  // ------------------------------------------------------------ 5) Kaydet bölümü
  if (bolum(5)) {
    console.log('\n== 5) Kaydet bölümü');
    fs.writeFileSync(path.join(CIKTI, 'Tarama örneği.pdf'), '%PDF-1.4 yer tutucu');
    await aracAc([G.tiff]);
    await kosul(`${A}.kayit.cikti.ad() === 'Tarama örneği (2).pdf'`, 5000);
    let k = await kayitDurumu();
    sonuc('Tek dosya: ad girdinin adı, uzantı hedefin (.pdf); klasörde aynı ad varsa "(2)"', k.cikti === 'Tarama örneği (2).pdf' && k.ad === 'Tarama örneği (2)' && !k.adGizli && !k.coklu && !k.cokluJpg, k);
    // 0.2.8 (kullanıcı isteği): "Yeni belge olarak kaydet | Üzerine yaz" seçimi ve altındaki "Dönüştürülen dosya her zaman…" yazısı yok
    sonuc('Kaydet bölümünde "Yeni belge olarak kaydet | Üzerine yaz" seçimi ve "Dönüştürülen dosya her zaman yeni dosya olarak kaydedilir." yazısı yok (0.2.8)', !k.secim && k.kisit === ''
      && !/Üzerine yaz|Yeni belge olarak kaydet|her zaman yeni dosya/.test(k.kayitMetni), k);
    // Hedef UDF → uzantı .udf (önerilen ad yeniden aranır: Tarama örneği.udf yok)
    await tikSecici('.donustur-oge .donustur-hedef-secim > button[data-id="udf"]');
    await kosul(`${A}.kayit.cikti.ad() === 'Tarama örneği.udf'`, 5000);
    k = await kayitDurumu();
    sonuc('Hedef UDF seçilince ad "Tarama örneği.udf" (uzantı hedefe göre, "(2)" gerekmiyor)', k.cikti === 'Tarama örneği.udf', k);
    // Değiştir: kaydetme penceresinin süzgeci biçime göre (UDF belgesi, .udf); elle yazılan ad hedef değişince kalır, uzantısı değişir
    await yanitla('dosya:kaydetDiyalog', [null]);
    await tikSecici('.donustur-pencere .arac-kayit-yeni .arac-cikti-degistir');
    const kd = (await kayit()).find((x) => x.kanal === 'dosya:kaydetDiyalog');
    sonuc('Değiştir: kaydetme penceresinin süzgeci "UDF belgesi" (.udf), önerilen yol çıktı klasöründe', kd?.secenek?.filtreler?.[0]?.name === 'UDF belgesi' && J(kd.secenek.filtreler[0].extensions) === J(['udf'])
      && kd.secenek.varsayilan === path.join(CIKTI, 'Tarama örneği.udf'), kd?.secenek);
    await evalJs(`(() => { const g = document.querySelector('.donustur-pencere .arac-kayit-yeni .arac-cikti-ad'); g.focus(); g.value = 'Elle ad'; g.dispatchEvent(new Event('input')); g.blur(); return true; })()`);
    await tikSecici('.donustur-oge .donustur-hedef-secim > button[data-id="pdf"]');
    await bekle(400);
    k = await kayitDurumu();
    sonuc('Elle yazılan ad hedef değişince kalır, uzantısı değişir ("Elle ad.pdf")', k.cikti === 'Elle ad.pdf' && k.ad === 'Elle ad', k);
    // Birden çok dosya: ad kutusu yok, Değiştir klasör seçtirir, adlar notu
    await evalJs(`${A}.dosyaEkle(${J([G.pdf])})`);
    await kosul(`!document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    await bekle(300);
    k = await kayitDurumu();
    sonuc('Birden çok dosya: ad kutusu gizli, klasör çipi ve Değiştir kalır; "girdilerin adıyla … (2)" açıklaması yok (0.2.8)', k.coklu && k.adGizli && !k.cokluJpg && !/girdilerin adıyla|eklenir/.test(k.kayitMetni)
      && k.klasor === CIKTI && /klasörü seçin/.test(k.degistirIpucu), k);
    await yanitla('dosya:klasorSec', [null]);
    await tikSecici('.donustur-pencere .arac-kayit-yeni .arac-cikti-degistir');
    const kk = (await kayit()).filter((x) => x.kanal === 'dosya:klasorSec' || x.kanal === 'dosya:kaydetDiyalog');
    sonuc('Birden çok dosyada Değiştir klasör seçme penceresini açar (kaydetme penceresi değil)', kk.length === 1 && kk[0].kanal === 'dosya:klasorSec', kk);
    await ss('05-coklu-kaydet');
    // Bir satır çıkarılınca tek dosyaya döner
    await tikSecici(`[...document.querySelectorAll('.donustur-oge')].at(-1).querySelector('[data-komut="sil"]')`);
    k = await kayitDurumu();
    sonuc('Satır çıkarılınca tek dosya: ad kutusu yeniden görünür', !k.coklu && !k.adGizli && !k.cokluJpg, k);
    await pencereKapat();
    // TIFF hedefinde süzgeç: PDF girdisi, hedef TIFF
    await aracAc([G.pdf]);
    await evalJs(`${A}.hedefSec(${A}.ogeler[0], 'tiff')`);
    await kosul(`${A}.kayit.cikti.ad() === 'Dilekçe örneği.tif'`, 5000);
    await yanitla('dosya:kaydetDiyalog', [null]);
    await tikSecici('.donustur-pencere .arac-kayit-yeni .arac-cikti-degistir');
    const kt = (await kayit()).find((x) => x.kanal === 'dosya:kaydetDiyalog');
    sonuc('TIFF hedefinde ad "Dilekçe örneği.tif", süzgeç "TIFF görüntüsü" (.tif, .tiff)', kt?.secenek?.filtreler?.[0]?.name === 'TIFF görüntüsü' && J(kt.secenek.filtreler[0].extensions) === J(['tif', 'tiff'])
      && (await evalJs(`${A}.kayit.cikti.ad()`)) === 'Dilekçe örneği.tif', kt?.secenek);
    // Kaydetme penceresinde ".tiff" seçilince (Windows "değiştirilsin mi"yi o ad için sordu) çıktı o ad olur, ".tif"e çevrilmez
    const secilenTiff = path.join(CIKTI, 'Seçilen tarama.tiff');
    await yanitla('dosya:kaydetDiyalog', [secilenTiff]);
    await tikSecici('.donustur-pencere .arac-kayit-yeni .arac-cikti-degistir');
    await bekle(300);
    const tiffDurum = await evalJs(`(() => { const c = ${A}.kayit.cikti; return { ad: c.ad(), yol: c.yol(), hedef: ${A}.kayit.hedef(), onayli: c.onayli(c.yol()),
      kutu: document.querySelector('.donustur-pencere .arac-kayit-yeni .arac-cikti-ad').value }; })()`);
    sonuc('Kaydetme penceresinde seçilen "….tiff" korunur: hedef o dosya (onaylı), kutuda uzantısız ad', tiffDurum.ad === 'Seçilen tarama.tiff' && tiffDurum.hedef === secilenTiff
      && tiffDurum.onayli && tiffDurum.kutu === 'Seçilen tarama', tiffDurum);
    await pencereKapat();
    // Birden çok dosyada klasör değiştirilip tek dosyaya dönülünce ad kalan dosyanın adı olur (klasör seçimi adı "elle" saymaz), klasör kalır
    await aracAc([G.tiff, G.pdf]);
    await kosul(`${A}.ogeler.length === 2 && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    await bekle(300);
    const baskaKlasor = path.join(UI, 'baska-klasor');
    fs.mkdirSync(baskaKlasor, { recursive: true });
    await yanitla('dosya:klasorSec', [baskaKlasor]);
    await tikSecici('.donustur-pencere .arac-kayit-yeni .arac-cikti-degistir');
    await bekle(300);
    await tikSecici(`[...document.querySelectorAll('.donustur-oge')][0].querySelector('[data-komut="sil"]')`);
    await bekle(600);
    const tekDurum = await evalJs(`(() => { const c = ${A}.kayit.cikti; return { ad: c.ad(), klasor: c.klasor(), kalan: ${A}.ogeler.map((o) => o.ad) }; })()`);
    sonuc('Çok dosyada klasör seçilip tek dosyaya dönülünce: ad kalan dosyanın adı ("Dilekçe örneği" + hedefin uzantısı), seçilen klasör kalır', /^Dilekçe örneği\.(udf|tif)$/.test(tekDurum.ad)
      && path.resolve(tekDurum.klasor) === path.resolve(baskaKlasor) && J(tekDurum.kalan) === J(['Dilekçe örneği.pdf']), tekDurum);
    await pencereKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
    fs.rmSync(path.join(CIKTI, 'Tarama örneği.pdf'), { force: true });
  }

  // ------------------------------------------------------------ 6) Gerçek dönüşümler
  if (bolum(6)) {
    console.log('\n== 6) Gerçek dönüşümler');
    // TIFF → PDF: sonuç sekmede açılır, pencere kapanır
    await aracAc([G.tiff]);
    await evalJs(`window.__s37b.length = 0`);
    await donusturVeBekle();
    const hTiff = path.join(CIKTI, 'Tarama örneği.pdf');
    const o1 = fs.existsSync(hTiff) ? pdfOzeti(hTiff) : null;
    const akt = await evalJs(`window.__pdefe.aktif()?.yol || null`);
    sonuc('TIFF → PDF: 3 sayfa, hepsi A4; pencere kapandı, sonuç sekmede açıldı, bildirim', !!o1 && o1.sayfa === 3 && o1.olcu.every(A4) && !(await evalJs(`!!document.querySelector('.donustur-pencere')`))
      && akt && path.resolve(akt) === path.resolve(hTiff) && (await bildirimler()).some((b) => /^Dönüştürüldü: Tarama örneği\.pdf · 3 sayfa/.test(b)), { o1, akt });
    await sekmeleriKapat();
    // PDF → TIFF, 300 dpi, gri
    await aracAc([G.pdf]);
    await evalJs(`${A}.hedefSec(${A}.ogeler[0], 'tiff')`);
    await tikSecici('.donustur-dpi-secim > button[data-id="300"]');
    await tikSecici('.donustur-renk-secim > button[data-id="gri"]');
    await donusturVeBekle();
    const hTif = path.join(CIKTI, 'Dilekçe örneği.tif');
    const o2 = fs.existsSync(hTif) ? tiffOzeti(hTif) : null;
    const sonuc2 = await evalJs(`(() => { const s = document.querySelector('.donustur-sonuc'); return s && !s.hidden ? { metin: s.innerText, ac: s.querySelectorAll('[data-ac]').length, goster: s.querySelector('.donustur-goster')?.textContent, acDugmesi: s.querySelector('.arac-sonuc-ac')?.textContent } : null; })()`);
    sonuc('PDF → TIFF (300 dpi, gri): tek dosyada 2 sayfa, dpi 300, gri; pencerede sonuç (Klasörde göster ve Aç; 0.2.8: satırda küçük Aç yok)', !!o2 && o2.sayfa === 2 && J(o2.dpi) === J([300, 300]) && o2.kip === 'L'
      && !!sonuc2 && /Dosya dönüştürüldü/.test(sonuc2.metin) && sonuc2.ac === 0 && sonuc2.goster === 'Klasörde göster' && sonuc2.acDugmesi === 'Aç', { o2, sonuc2 });
    await ss('06-pdf-tiff-sonuc');
    // Klasörde göster (test örneğinde Gezgin açılmaz, istek kaydedilir)
    await kayit();
    await tikSecici('.donustur-sonuc .donustur-goster');
    const kg = (await kayit()).find((x) => x.kanal === 'kabuk:klasordeGoster');
    sonuc('Klasörde göster dönüştürülen dosyayı gösterir', !!kg && path.resolve(kg.secenek.yol) === path.resolve(hTif), kg);
    await pencereKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
    // PDF → UDF (düzenlenebilir)
    await aracAc([G.pdf]);
    await donusturVeBekle();
    const hUdf = path.join(CIKTI, 'Dilekçe örneği.udf');
    const o3 = fs.existsSync(hUdf) ? zipOzeti(hUdf) : null;
    sonuc('PDF → UDF: zip içinde content.xml (<template>)', !!o3 && o3.adlar.includes('content.xml') && o3.template, o3);
    await pencereKapat();
    // UDF → PDF (UDE varsa)
    if (UDE_VAR) {
      await aracAc([G.udf], 30000);
      await donusturVeBekle();
      const hUp = path.join(CIKTI, 'Karar örneği.pdf');
      const o4 = fs.existsSync(hUp) ? pdfOzeti(hUp) : null;
      sonuc('UDF → PDF (UDE ile): sayfalar A4, sonuç sekmede açıldı', !!o4 && o4.sayfa >= 1 && o4.olcu.every(A4) && path.resolve((await evalJs(`window.__pdefe.aktif()?.yol || ''`)) || '.') === path.resolve(hUp), o4);
      await sekmeleriKapat();
    } else atlandi('UDF → PDF', 'bu bilgisayarda UYAP Doküman Editörü yok');
    // PDF → Word (Word dönüştürmesi varsa ve S37_WORD=1: dönüştürme bilgisayardaki Word'ü kullanabilir, uzun sürebilir)
    if (WORD_VAR && process.env.S37_WORD === '1') {
      await aracAc([G.pdf]);
      await evalJs(`${A}.hedefSec(${A}.ogeler[0], 'word')`);
      await donusturVeBekle(180000);
      const hW = path.join(CIKTI, 'Dilekçe örneği.docx');
      const o5 = fs.existsSync(hW) ? zipOzeti(hW) : null;
      sonuc('PDF → Word: .docx (word/document.xml)', !!o5 && o5.word, o5);
      await pencereKapat();
      await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
    } else atlandi('PDF → Word', WORD_VAR ? 'Word dönüştürmesi var; sınamak için $env:S37_WORD="1"' : 'Word dönüştürmesi bu sürümde ya da bu bilgisayarda yok');
    // Birden çok dosya: sonuç listesi, var olan adda "(2)", PDF'ler için Aç
    const once = new Set(ciktiDosyalari());
    await aracAc([G.tiff, G.udf_xml, G.pdf_udf], 30000);
    await donusturVeBekle();
    const yeni = ciktiDosyalari().filter((a) => !once.has(a));
    const s6 = await evalJs(`(() => { const s = document.querySelector('.donustur-sonuc'); return s && !s.hidden ? { metin: s.innerText, satir: s.querySelectorAll('li').length, ac: s.querySelectorAll('[data-ac]').length,
      goster: s.querySelector('.donustur-goster')?.textContent, tumunuAc: s.querySelector('.arac-sonuc-ac')?.textContent } : null; })()`);
    // 0.2.6 (C2): UDE yokken de UDF yaklaşık çizimle PDF'e dönüşür; üç dosya da çıkar
    const beklenen = ['Düz biçim.pdf', 'Tarama örneği (2).pdf', 'Yanlış uzantı.udf'];
    sonuc(`Birden çok dosya: adlar girdilerin adı, var olan adda "(2)" (${beklenen.join(', ')}); sonuç listesi, Klasörde göster ve Tümünü aç (0.2.8; satırlarda Aç yok)`, J(yeni.sort()) === J([...beklenen].sort()) && !!s6
      && s6.goster === 'Klasörde göster' && s6.tumunuAc === 'Tümünü aç' && s6.ac === 0 && new RegExp(`${beklenen.length} dosya dönüştürüldü`).test(s6.metin), { yeni, s6 });
    await ss('06-coklu-sonuc');
    await evalJs(`window.__s37b.length = 0`);
    // 0.2.8 (kullanıcı isteği): sonuçtaki küçük Aç'lar kalktı; "Tümünü aç" dönüştürülen dosyaları varsayılan programlarıyla açar (test örneğinde program
    // açılmaz, istek kaydedilir; ayrıntı senaryo41 4. bölüm). Komutlar bu pencereye gitsin (seçilmemiş hedef, CDP listesinin ilki, yeni pencere olabilir)
    const buHedef = (await hedefler())[0].id;
    hedefSec(buHedef);
    const buPencere = await evalJs(`window.pdefe.cagir('pencere:kimlik')`);
    await kayit();
    await tikSecici('.donustur-sonuc .arac-sonuc-ac');
    await bekle(600);
    const acilan = (await kayit()).filter((x) => x.kanal === 'dosya:varsayilanlaAc').map((x) => path.basename(x.secenek.yol)).sort();
    sonuc('Tümünü aç dönüştürülen üç dosyayı varsayılan programla açar (araç penceresi açık kalır, PDEfe\'de sekme açılmaz; 0.2.8)', J(acilan) === J([...beklenen].sort())
      && (await evalJs(`window.__pdefe.belgeler.size`)) === 0 && (await evalJs(`!!document.querySelector('.donustur-pencere')`)), acilan);
    void buPencere;
    for (const h of await hedefler()) {
      hedefSec(h.id);
      let k = null; try { k = await evalJs(`window.pdefe ? window.pdefe.cagir('pencere:kimlik') : null`); } catch { /* yükleniyor */ }
      if (k != null && k !== buPencere) await evalJs(`(window.pdefe.cagir('pencere:kapatOnayla', null), true)`);
    }
    await bekle(600);
    hedefSec(buHedef);
    await tikSecici('.donustur-pencere .donustur-temizle');
    sonuc('Listeyi temizle: satırlar ve sonuç listesi kalkar, Dönüştür soluk', await evalJs(`document.querySelectorAll('.donustur-oge').length === 0
      && document.querySelector('.donustur-sonuc').hidden && document.querySelector('.donustur-pencere .arac-dugmeler .birincil').disabled`));
    await pencereKapat();
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 7) İptal
  if (bolum(7)) {
    console.log('\n== 7) İptal');
    // Ana sürecin dosya:sil'i PDF dışı dosyayı yalnızca bu oturumda dönüştürmenin oluşturduğuysa çöpe atar (0.2.6 incelemesi: arayüzde kod
    // çalışırsa her yerdeki .docx / .udf / .tif çöpe gidebiliyordu). Dönüştürmenin oluşturmadığı dosyalar: istek reddedilir, dosya yerinde
    const elleDosyalar = ['Elle yazılmış.docx', 'Elle yazılmış.udf', 'Elle yazılmış.tif'].map((a) => path.join(CIKTI, a));
    for (const y of elleDosyalar) fs.writeFileSync(y, 'yer tutucu');
    const silYanitlari = [];
    for (const y of elleDosyalar) silYanitlari.push(await evalJs(`window.pdefe.cagir('dosya:sil', ${J(y)})`));
    sonuc('dosya:sil: dönüştürmenin oluşturmadığı .docx / .udf / .tif reddedilir, dosyalar yerinde', silYanitlari.every((x) => x === false) && elleDosyalar.every((y) => fs.existsSync(y)), silYanitlari);
    for (const y of elleDosyalar) fs.rmSync(y, { force: true });
    const geciciVar = () => fs.readdirSync(CIKTI).filter((a) => /pdefe-tmp/i.test(a));
    // Erken iptal: uzun TIFF'in dönüştürmesi İptal'le durur; hedef klasörde dosya ve geçici dosya kalmaz
    const once = new Set(ciktiDosyalari());
    await aracAc([G.buyuk_tiff], 30000);
    await evalJs(`window.__s37b.length = 0`);
    await donusturBas();
    await kosul(`!document.querySelector('.donustur-pencere .arac-ilerleme').hidden`, 5000);
    await bekle(700);
    await tikSecici('.donustur-pencere .arac-ilerleme-iptal');
    await kosul(`document.querySelector('.donustur-pencere .arac-ilerleme').hidden`, 30000);
    await bekle(800);
    const yeni = ciktiDosyalari().filter((a) => !once.has(a));
    sonuc('İptal: dönüştürme durur, hiçbir dosya ve geçici dosya kalmaz; "iptal edildi" bildirimi; pencere açık', !yeni.length && !geciciVar().length
      && (await bildirimler()).some((b) => /iptal edildi/.test(b)) && (await evalJs(`!!document.querySelector('.donustur-pencere')`)), { yeni, gecici: geciciVar() });
    // Dönüştürme sürerken X: "Dönüştürme sürüyor" sorulur; İptal et ve kapat
    await yanitla('mesaj:kutu', [{ secim: 0 }]);
    await donusturBas();
    await kosul(`!document.querySelector('.donustur-pencere .arac-ilerleme').hidden`, 5000);
    await bekle(500);
    await tikSecici('.donustur-pencere .arac-kapat');
    await kosul(`!document.querySelector('.donustur-pencere')`, 30000);
    const soru = (await kayit()).find((x) => x.kanal === 'mesaj:kutu');
    await bekle(2500);
    const yeni2 = ciktiDosyalari().filter((a) => !once.has(a));
    sonuc('Dönüştürme sürerken X: "Dönüştürme sürüyor." sorusu (İptal et ve kapat | Sürdür); kapanınca dosya kalmaz', soru?.secenek?.mesaj === 'Dönüştürme sürüyor.'
      && J(soru.secenek.dugmeler) === J(['İptal et ve kapat', 'Sürdür']) && !yeni2.length && !geciciVar().length, { soru: soru?.secenek, yeni2 });
    // Geç gelen iptal (benzetim): çekirdek sonucu döndürdükten sonra iptal; yeni dosya çöp kutusuna (sınamada yalnızca kaydedilir)
    // Bağlamın dosya:sil'i kaydedilir (çöp kutusuna gönderilmez); calistir çekirdeğin sonucunu aldıktan sonra iptal hatası fırlatır
    const GEC_IPTAL = `(() => { const a = ${A}; window.__s37Silinen = []; const b = a.baglam, k = b.pdefe;
      a.baglam = { ...b, pdefe: { platform: k.platform, dinle: (x, c) => k.dinle(x, c), gonder: (...x) => k.gonder(...x), dosyaYolu: (f) => k.dosyaYolu(f),
        cagir: (x, ...y) => (x === 'dosya:sil' ? (window.__s37Silinen.push(y[0]), Promise.resolve(true)) : k.cagir(x, ...y)) } };
      const asil = a.ilerleme.calistir.bind(a.ilerleme);
      a.ilerleme.calistir = async (...g) => { const r = await asil(...g); const e = new Error('İşlem iptal edildi.'); e.iptal = true; e.sonuc = r; throw e; };
      window.__s37b.length = 0; return a.kayit.hedef(); })()`;
    await aracAc([G.pdf]);
    await evalJs(`${A}.kayit.hazir.then(() => true)`);
    const hedef1 = await evalJs(GEC_IPTAL);
    await donusturBas();
    await bekle(4000);
    const g1 = { silinen: await evalJs(`window.__s37Silinen`), bildirim: await bildirimler() };
    sonuc('Geç iptal, yeni dosya: dosya:sil (çöp kutusu) çağrılır, "Dönüştürme iptal edildi." bildirilir, sonuç gösterilmez', J(g1.silinen.map((y) => path.resolve(y))) === J([path.resolve(hedef1)])
      && g1.bildirim.includes('Dönüştürme iptal edildi.') && (await evalJs(`document.querySelector('.donustur-sonuc').hidden`)), g1);
    await pencereKapat();
    fs.rmSync(hedef1, { force: true });
    // Geç iptal, onaylanıp üzerine yazılan dosya: silinmez, "İptal edilemeden tamamlandı"
    const varOlan = path.join(CIKTI, 'Var olan.pdf');
    fs.writeFileSync(varOlan, '%PDF-1.4 eski');
    await aracAc([G.tiff]);
    await evalJs(`(() => { const a = ${A}; a.kayit.cikti.ayarla(${J(CIKTI)}, 'Var olan', { elle: true }); return a.kayit.cikti.ad(); })()`);
    await yanitla('mesaj:kutu', [{ secim: 0 }]);   // "zaten var" sorusu: Üzerine yaz
    await evalJs(GEC_IPTAL);
    await donusturBas();
    await kosul(`!document.querySelector('.donustur-pencere')`, 20000);
    await bekle(800);
    const silinen2 = await evalJs(`window.__s37Silinen`), b2 = await bildirimler();
    const o7 = pdfOzeti(varOlan);
    sonuc('Geç iptal, onaylanıp üzerine yazılan dosya: silinmez, "İptal edilemeden tamamlandı" bildirilir, sonuç sekmede açılır', !silinen2.length && o7.sayfa === 3
      && b2.some((b) => /İptal edilemeden tamamlandı: "Var olan\.pdf" üzerine yazıldı/.test(b)), { silinen2, b2, o7 });
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 8) Açma yolları
  if (bolum(8)) {
    console.log('\n== 8) Ana pencereye bırakma, Ctrl+O, komut satırı');
    await pencereKapat();
    await sekmeleriKapat();
    // Sürükle-bırak gerçek dosya yollarıyla: CDP Input.dispatchDragEvent (sayfa File nesnesinden yolu webUtils ile okur)
    const h = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT || 9222}/json`)).json()).find((x) => x.type === 'page' && /index\.html/.test(x.url));
    const ws = new WebSocket(h.webSocketDebuggerUrl);
    await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
    let n = 0; const bek = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bek.has(d.id)) { bek.get(d.id)(d); bek.delete(d.id); } };
    const gonder = (method, params = {}) => new Promise((c) => { const i = ++n; bek.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
    const birak = async (dosyalar, x = 640, y = 520) => {
      const data = { items: [], files: dosyalar, dragOperationsMask: 1 };
      for (const type of ['dragEnter', 'dragOver']) await gonder('Input.dispatchDragEvent', { type, x, y, data });
      await bekle(150);
      const ortu = await evalJs(`(() => { const o = document.querySelector('#surukle-ortusu'); return o.hidden ? null : o.textContent; })()`);
      await gonder('Input.dispatchDragEvent', { type: 'drop', x, y, data });
      return ortu;
    };
    const ortuMetni = await birak([G.udf, G.pdf, G.tiff, G.txt]);
    await kosul(`!!document.querySelector('.donustur-pencere') && document.querySelectorAll('.donustur-oge').length === 2 && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    await kosul(`window.__pdefe.belgeler.size === 1`, 8000);
    let S = await satirlar();
    const sekmeler = await evalJs(`[...window.__pdefe.belgeler.values()].map((b) => b.ad)`);
    sonuc('Ana pencereye bırakma: sürükleme örtüsü "Dosyaları bırakın"; PDF sekmede açılır, UDF ve TIFF araçta (sırayla), tanınmayan uzantı yok sayılır', ortuMetni === 'Dosyaları bırakın'
      && J(sekmeler) === J(['Dilekçe örneği.pdf']) && J(S.map((x) => x.ad)) === J(['Karar örneği.udf', 'Tarama örneği.tif']), { ortuMetni, sekmeler, satirlar: S.map((x) => x.ad) });
    await ss('08-birakma');
    // Araç açıkken bırakılan Word dosyası araca eklenir (aracın örtüsü pencereyi kaplar)
    await birak([G.docx]);
    await kosul(`document.querySelectorAll('.donustur-oge').length === 3 && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    S = await satirlar();
    sonuc('Araç açıkken bırakılan Word dosyası listeye eklenir', S.length === 3 && S[2].ad === 'Word örneği.docx' && S[2].tur === 'word', S.map((x) => [x.ad, x.tur]));
    // Ana sürecin dosya:ac'ı (komut satırı / macOS open-file): araç açıksa listeye eklenir
    await evalJs(`window.pdefe.cagir('test:olayGonder', 'dosya:ac', ${J([G.udf_xml])})`);
    await kosul(`document.querySelectorAll('.donustur-oge').length === 4 && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    S = await satirlar();
    sonuc('Ana sürecin dosya:ac\'ı (UDF): açık aracın listesine eklenir, sekme açılmaz', S.length === 4 && S[3].ad === 'Düz biçim.udf' && (await evalJs(`window.__pdefe.belgeler.size`)) === 1, S.map((x) => x.ad));
    ws.close();
    await pencereKapat();
    await sekmeleriKapat();
    // Ctrl+O: süzgeçte desteklenen türler; seçilen PDF sekmede, UDF araçta
    await yanitla('dosya:acDiyalog', [[G.udf, G.pdf]]);
    await kayit();
    await evalJs(`window.__pdefe.komutCalistir('dosya.ac')`);
    await kosul(`!!document.querySelector('.donustur-pencere') && document.querySelectorAll('.donustur-oge').length === 1 && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    await kosul(`window.__pdefe.belgeler.size === 1`, 8000);
    const ck = (await kayit()).find((x) => x.kanal === 'dosya:acDiyalog');
    S = await satirlar();
    sonuc('Ctrl+O: ilk süzgeç "Desteklenen dosyalar" (PDF, UDF, TIFF, Word), çoklu seçim; seçilen PDF sekmede, UDF araçta', ck?.secenek?.filtreler?.[0]?.name === 'Desteklenen dosyalar'
      && ck.secenek.filtreler[0].extensions.includes('udf') && ck.secenek.filtreler[0].extensions.includes('pdf') && ck.secenek.coklu !== false
      && J(S.map((x) => x.ad)) === J(['Karar örneği.udf']) && J(await evalJs(`[...window.__pdefe.belgeler.values()].map((b) => b.ad)`)) === J(['Dilekçe örneği.pdf']), { ck: ck?.secenek, S: S.map((x) => x.ad) });
    await pencereKapat();
    await sekmeleriKapat();
    // Komut satırı: ikinci örnek (Gezgin'de "Birlikte aç" ya da PDEfe'nin simgesine bırakma) TIFF'i ilk örneğe verir, araç açılır. 0.2.7: ikinci
    // bir Electron başlatılmaz (olağan masaüstünde Electron başlatılmaz); ana sürecin 'second-instance' olayı test kancasıyla verilir
    const ikinci = await evalJs(`window.pdefe.cagir('test:uygulamaOlayi', 'second-instance', [${J(G.tiff)}])`);
    await kosul(`!!document.querySelector('.donustur-pencere') && document.querySelectorAll('.donustur-oge').length === 1 && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    S = await satirlar();
    sonuc('Komut satırı (ikinci örnek): TIFF ilk örneğin Format Değiştir aracında açılır, sekme açılmaz', ikinci && J(S.map((x) => x.ad)) === J(['Tarama örneği.tif'])
      && (await evalJs(`window.__pdefe.belgeler.size`)) === 0, { ikinci, S: S.map((x) => x.ad) });
    await pencereKapat();
  }

  // ------------------------------------------------------------ 9) Ayarlar › UYAP Doküman Editörü
  if (bolum(9)) {
    console.log('\n== 9) Ayarlar: UYAP Doküman Editörü');
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'udeYolu', null); window.__pdefe.ayar().udeYolu = null; window.__pdefe.komutCalistir('duzen.ayarlar', 'kaydetme'); return true; })()`);
    await kosul(`!!document.querySelector('.ayarlar-ortusu .ayar-kart[data-hedef="udeYolu"]')`, 5000);
    const KART = `document.querySelector('.ayarlar-ortusu .ayar-kart[data-hedef="udeYolu"]')`;
    const kartDurumu = () => evalJs(`(() => { const k = ${KART}; return { baslik: k.querySelector('.ayar-baslik').textContent, aciklama: k.querySelector('.ayar-aciklama').textContent,
      dugmeler: [...k.querySelectorAll('.ayar-kontrol button')].map((b) => [b.textContent, b.disabled]), durum: [...k.querySelectorAll('.ayar-ude-durum > div')].map((d) => d.textContent),
      hata: k.querySelector('.ayar-ude-durum').classList.contains('ayar-sonuc-hata'), bolum: [...document.querySelectorAll('.ayarlar-icerik h3')].map((h) => h.textContent),
      cikti: [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((x) => /çıktı klasörü/.test(x.textContent))?.querySelector('.ayar-aciklama').textContent }; })()`);
    await kosul(`!${KART}.querySelector('.ayar-ude-durum').textContent.includes('Aranıyor')`, 15000);
    let d = await kartDurumu();
    sonuc('Ayarlar › Kaydetme: "Format Değiştir" başlığı altında "UYAP Doküman Editörü" kartı; Otomatik bul ve Klasörü seç… düğmeleri; çıktı klasörü açıklamasında yeni araç',
      d.bolum.includes('Format Değiştir') && d.baslik === 'UYAP Doküman Editörü' && J(d.dugmeler.map((x) => x[0])) === J(['Otomatik bul', 'Klasörü seç…']) && /Format Değiştir/.test(d.cikti || ''), d);
    if (UDE_VAR) sonuc('Durum: kendiliğinden bulunan editörün yolu ve sürümü, Java\'nın sürümü', d.durum[0]?.startsWith(`Bulunan: ${YET.udf.ude.yol}`) && /kendiliğinden bulundu/.test(d.durum[0]) && /^Java /.test(d.durum[1] || '') && !d.hata, d.durum);
    else sonuc('Durum: editör bulunamadı, nedeni yazar', d.hata && /bulunamadı/.test(d.durum.join(' ')), d.durum);
    await ss('09-ayarlar-ude');
    // Editörün olmadığı klasör: ayar değişmez, durumda neden
    const bosKlasor = path.join(UI, 'bos-klasor');
    fs.mkdirSync(bosKlasor, { recursive: true });
    await yanitla('dosya:klasorSec', [bosKlasor]);
    await tikSecici(`[...${KART}.querySelectorAll('.ayar-kontrol button')].find((b) => b.textContent === 'Klasörü seç…')`);
    await kosul(`${KART}.querySelector('.ayar-ude-durum').textContent.includes('Seçilen klasörde')`, 15000);
    d = await kartDurumu();
    sonuc('Klasörü seç… (editörsüz klasör): ayar değişmez; durumda "Seçilen klasörde UYAP Doküman Editörü bulunamadı."', d.hata && d.durum[0] === 'Seçilen klasörde UYAP Doküman Editörü bulunamadı.'
      && (await evalJs(`window.pdefe.cagir('ayar:al', 'udeYolu')`)) == null, d.durum);
    if (UDE_VAR) {
      await yanitla('dosya:klasorSec', [YET.udf.ude.yol]);
      await tikSecici(`[...${KART}.querySelectorAll('.ayar-kontrol button')].find((b) => b.textContent === 'Klasörü seç…')`);
      await kosul(`${KART}.querySelector('.ayar-ude-durum').textContent.includes('seçtiğiniz klasör')`, 15000);
      d = await kartDurumu();
      sonuc('Klasörü seç… (editörün klasörü): ayara yazılır, durumda "(seçtiğiniz klasör)"', /\(seçtiğiniz klasör\)/.test(d.durum[0] || '') && !d.hata
        && (await evalJs(`window.pdefe.cagir('ayar:al', 'udeYolu')`)) === YET.udf.ude.yol && (await evalJs(`window.__pdefe.ayar().udeYolu`)) === YET.udf.ude.yol, d.durum);
      await tikSecici(`[...${KART}.querySelectorAll('.ayar-kontrol button')].find((b) => b.textContent === 'Otomatik bul')`);
      await kosul(`${KART}.querySelector('.ayar-ude-durum').textContent.includes('kendiliğinden bulundu')`, 15000);
      d = await kartDurumu();
      sonuc('Otomatik bul: ayar temizlenir, durumda "(kendiliğinden bulundu)"', /\(kendiliğinden bulundu\)/.test(d.durum[0] || '') && (await evalJs(`window.pdefe.cagir('ayar:al', 'udeYolu')`)) == null, d.durum);
    } else atlandi('Editörün klasörü ve Otomatik bul', 'bu bilgisayarda UYAP Doküman Editörü yok');
    await evalJs(`(async () => { const m = await import('pdefe://app/src/renderer/ayarlarPenceresi.js'); m.ayarlarPenceresiKapat(); return true; })()`);
  }

  // ------------------------------------------------------------ son
  await pencereKapat();
  await sekmeleriKapat();
  await evalJs(`(async () => { delete window.__pdefeYerelKutu; for (const [k, v] of Object.entries({ ciktiKlasoru: '', donusturme: {} })) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; } return true; })()`);
  const hatalar = await evalJs(`window.__s37Hatalar || []`);
  sonuc('Renderer konsolunda hata yok', hatalar.length === 0, hatalar);
  console.log(`\n${denetim} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}  (ekran görüntüleri: ${PNG})`);
}
