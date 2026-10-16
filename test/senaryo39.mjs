// Senaryo 39 (0.2.7, kullanıcının revizyonu, U2: çekirdeğe bağlı arayüz maddeleri). Format Değiştir (araclar/donustur.js) ve Birleştir
// (araclar/gorselBirlestir.js):
//   1) Görüntü girdileri (madde 3): satırda tür "Görüntü (JPG)" / "Görüntü (PNG)", piksel ölçüsü, küçük resim; hedefler PDF, UDF, Word, TIFF
//      (kendi türü yok), varsayılan PDF; Dosya ekle süzgecinde görüntüler; boş listede "görüntü".
//   2) Görüntü → PDF (gerçek dönüşüm): 300 dpi etiketli taranmış JPG → A4 dikey (sonuç sekmede açılır); dpi etiketsiz PNG → uzun kenar A4'ün
//      uzun kenarı; iki görüntü birlikte → iki PDF, sonuç listesi.
//   3) PDF → JPG (madde 3): JPG hedefinde ad kutusu kalır (ad dosyaların ortak başı), altında adların notu, "JPG seçenekleri" (renk satırı yok);
//      iki sayfalı PDF → "<ad> - Sayfa 1.jpg", "<ad> - Sayfa 2.jpg" (seçilen çözünürlükte piksel ölçüsü ve dpi etiketi), tek sayfalı → "<ad>.jpg";
//      sonuçta her dosya bir satır, Aç yok, KB / sayfa yok, Klasörde göster; dosyalar varken "zaten var" sorusu (Üzerine yaz | Yeni belge
//      olarak kaydet | Vazgeç): yeni belge "(1)" adlarıyla, var olanlar değişmez; üzerine yaz var olanları yeniler; vazgeç hiçbir şey yazmaz;
//      birden çok girdide var olan adlar "(2)"; geç iptalde bütün sayfa dosyaları çöp kutusuna (sınamada kaydedilir); ana süreç elle yazılmış
//      .jpg'yi silmez.
//   4) İdeal / Düşük (madde 8): TIFF ve JPG hedefinde "İdeal" (varsayılan, 300 dpi) ve "Düşük" (200 dpi), dpi yazısı yok; yanlarında yaklaşık
//      boyut, renk değişince yeniden; dönüştürülen dosyanın boyutu tahmine yakın; yalnızca UDF'de sayı yok, UDF + PDF'te "≥".
//   5) Açma yolları (madde 3): Ctrl+O'nun süzgecinde görüntüler, seçilen JPG araçta; ana sürecin dosya:ac'ı (PNG) ve ikinci örnek (JPG)
//      aracı açar; ana pencereye bırakılan görüntü araçta açılır.
//   6) Açılamayan görüntü (HEIC; açıcısı pakette yok): satırda nedeni, hedefler soluk, dönüştürülmez.
//   7) Kalite notu (madde 10): seçili hedefin notu satırın altında hemen (UDF → Word, TIFF → Word, görüntü → UDF, PDF → UDF), notsuz yönlerde yok,
//      sakin renkte.
//   8) Birleştir (madde 2): Dosya ekle süzgecinde UDF ve Word; satırlarda tür (UDF küçük resmiyle, Word mavi yer tutucuyla), tahmin yok, özet "en az …
//      sayfa", kalite toplamı "≥"; açıkken bırakılan dosya Birleştir'in listesine; belgeler çevrilirken İptal (hedef yazılmaz); UDF + PDF + TIFF
//      (+ Word, $env:S39_WORD="1" ile) + JPG → tek PDF, sıra listedeki gibi. UYAP Doküman Editörü yok benzetimi (PDEFE_UDE_YOK=1): UDF yaklaşık çizimle,
//      satırda ve bildirimde "görünüm yaklaşık"; Word yok benzetimi (PDEFE_WORD_YOK=1): Word satırı soluk, nedeni satırda, birleştirmeden önce
//      "Bir dosya birleştirilemiyor." sorusu, atlanarak birleştirilir.
// Girdiler bu betikte üretilir (Python, proje .venv; gerçek belge yok): test/cikti/s39/girdi; çıktılar test/cikti/s39/cikti.
// Kullanım (görünmeyen masaüstü):
//   powershell -ExecutionPolicy Bypass -File test\baslat_gizli.ps1 -Port 9439 -Veri "$env:TEMP\pdefe-s39-9439" -Boyut "1280,1000"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9439; node test\surucu.mjs betik test\senaryo39.mjs
//   powershell -ExecutionPolicy Bypass -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,3". Ekran görüntüleri test/cikti/s39/png altına (görünmeyen masaüstünde alınamayabilir).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's39');
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

/** Python (proje .venv) çalıştırır; son satırı JSON olarak döner. test/ klasörü içe aktarma yolunda (donustur_testi'nin üreticileri). */
function py(kod) {
  const on = `import sys, json, os, zipfile\nsys.path.insert(0, ${J(path.join(KOK, 'test'))})\nimport pymupdf\nfrom PIL import Image\n`;
  const cikti = execFileSync(PY, ['-X', 'utf8', '-c', on + kod], { encoding: 'utf8' });
  return JSON.parse(cikti.trim().split(/\r?\n/).pop());
}
const pdfOzeti = (yol) => py(`d = pymupdf.open(${J(yol)}, filetype="pdf")\nprint(json.dumps({"sayfa": d.page_count, "olcu": [[round(p.rect.width, 1), round(p.rect.height, 1)] for p in d], "resim": len(d[0].get_images())}))`);
const jpgOzeti = (yol) => py(`im = Image.open(${J(yol)})\nprint(json.dumps({"bicim": im.format, "olcu": list(im.size), "dpi": [round(float(x)) for x in im.info.get("dpi", (0, 0))]}))`);
const A4 = (o) => Math.abs(o[0] - 595.3) <= 1.5 && Math.abs(o[1] - 841.9) <= 1.5;
/** Piksel ölçüsü beklenene ±1 piksel (A4'ün 300 dpi'de 2480,3 piksel: çizim yukarı yuvarlar). */
const olcuYakin = (o, b) => Array.isArray(o) && Math.abs(o[0] - b[0]) <= 1 && Math.abs(o[1] - b[1]) <= 1;

/** Girdiler: iki sayfalı ve tek sayfalı PDF, 300 dpi etiketli taranmış JPG (A4), dpi etiketsiz PNG (yatay), sahte HEIC; UDF, Word, TIFF. */
function girdileriUret() {
  fs.mkdirSync(GIRDI, { recursive: true });
  return py(`import donustur_testi as dt
from PIL import ImageDraw
k = ${J(GIRDI)}
g = {}
g["pdf2"] = dt.sentetik_pdf(os.path.join(k, "Dilekçe örneği.pdf"), sayfa=2)
g["pdf1"] = dt.sentetik_pdf(os.path.join(k, "Tek sayfa.pdf"), sayfa=1)
im = Image.new("RGB", (2480, 3508), "white")
c = ImageDraw.Draw(im)
for i in range(30):
    c.rectangle([200, 300 + i * 100, 2000 - (i % 5) * 200, 340 + i * 100], fill=(30, 30, 30))
g["jpg"] = os.path.join(k, "Taranmış dilekçe.jpg")
im.save(g["jpg"], "JPEG", quality=80, dpi=(300, 300))
im2 = Image.new("RGB", (1654, 1240), (240, 240, 250))
ImageDraw.Draw(im2).ellipse([300, 200, 1300, 1000], fill=(200, 40, 40))
g["png"] = os.path.join(k, "Ekran görüntüsü.png")
im2.save(g["png"], "PNG")
# Birleştir (8. bölüm): UDF, Word (en küçük .docx), iki sayfalı TIFF
import udf_donusum_testi as ut
import donustur_arayuz_uret as dau
u = ut.UdfYaz()
u.paragraf("DENEME DİLEKÇESİ", hiza=1, kalin=True)
u.paragraf(ut.cumleler(1, 3), oz='FirstLineIndent="35.4"')
g["udf"] = u.yaz(os.path.join(k, "Karar örneği.udf"))
g["docx"] = dau.docx_yaz(os.path.join(k, "Word örneği.docx"), ["Deneme paragrafı; ğüşıöç İ.", "İkinci paragraf."])
g["tiff"] = dt.tiff_yaz(os.path.join(k, "Tarama örneği.tif"), [(dt.metin_karesi(1654, 2339, t), {"compression": "group4"}) for t in (1, 2)])
g["heic"] = os.path.join(k, "Telefon fotoğrafı.heic")
with open(g["heic"], "wb") as f:
    f.write(b"\\x00\\x00\\x00\\x18ftypheic\\x00\\x00\\x00\\x00mif1heic" + b"\\x00" * 64)
print(json.dumps(g, ensure_ascii=False))`);
}

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => { await bekle(250); try { await ekranGoruntusu(path.join(PNG, ad + '.png')); } catch { /* görünmeyen masaüstü */ } };
  const yanitla = (kanal, yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', ${J(kanal)}, ${J(yanitlar)})`);
  const kayit = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const bildirimler = () => evalJs(`window.__s39b.splice(0)`);
  const tikSecici = async (secici) => {
    const r = await evalJs(`(() => { const e = ${secici.startsWith('[') || secici.startsWith('document') ? secici : `document.querySelector(${J(secici)})`}; if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) return false;
    await tikla(r.x, r.y);
    await bekle(250);
    return true;
  };
  const A = 'window.__s39.d.acikDonusturPenceresi()';
  const pencereKapat = async () => {
    await evalJs(`(async () => { window.__pdefeOtoYanit = { secim: 0 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); }
      finally { delete window.__pdefeOtoYanit; } return true; })()`);
    return kosul(`!document.querySelector('.arac-ortusu')`, 5000);
  };
  const sekmeleriKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return window.__pdefe.belgeler.size; })()`);
  const aracAc = async (yollar = [], sure = 20000) => {
    await evalJs(`window.__pdefe.komutCalistir('arac.donustur', ${J(yollar)})`);
    await kosul(`!!document.querySelector('.donustur-pencere')`, 5000);
    await kosul(`!document.querySelector('.donustur-oge.yukleniyor')`, sure);
    await bekle(300);
  };
  const satirlar = () => evalJs(`[...document.querySelectorAll('.donustur-pencere .donustur-oge')].map((e) => ({
    ad: e.querySelector('.ad').textContent, tur: e.dataset.tur, ozet: e.querySelector('.ozet').textContent,
    turEtiketi: e.querySelector('.ozet .tur')?.textContent || '',
    hedefler: [...e.querySelectorAll('.donustur-hedef-secim > button')].map((b) => ({ id: b.dataset.id, ad: b.textContent, secili: b.classList.contains('secili'), devre: b.disabled, ipucu: b.title })),
    neden: e.querySelector('.neden').hidden ? '' : (e.querySelector('.neden .metin')?.textContent || ''),
    uyari: e.querySelector('.uyari').hidden ? '' : e.querySelector('.uyari').textContent, hata: e.querySelector('.hata').hidden ? '' : e.querySelector('.hata').textContent,
    resim: e.querySelector('.resim img') ? 'img' : (e.querySelector('.resim .yer')?.textContent || '') }))`);
  const hedefTikla = (ad, bicim) => tikSecici(`[...document.querySelectorAll('.donustur-oge')].find((e) => e.querySelector('.ad').textContent === ${J(ad)}).querySelector('.donustur-hedef-secim > button[data-id="${bicim}"]')`);
  const donusturDevre = () => evalJs(`document.querySelector('.donustur-pencere .arac-dugmeler .birincil').disabled`);
  const donusturBas = () => tikSecici('.donustur-pencere .arac-dugmeler .birincil');
  const donusturVeBekle = async (sure = 90000) => {
    await evalJs(`(() => { const s = document.querySelector('.donustur-sonuc'); if (s) s.hidden = true; return true; })()`);
    await donusturBas();
    await kosul(`!document.querySelector('.donustur-pencere') || !document.querySelector('.donustur-sonuc')?.hidden || !!document.querySelector('.donustur-pencere .arac-hata:not(:empty)')`, sure);
    await bekle(400);
  };
  const sonucKutusu = () => evalJs(`(() => { const s = document.querySelector('.donustur-sonuc'); return s && !s.hidden ? { baslik: s.querySelector('.arac-sonuc-baslik').innerText,
    satirlar: [...s.querySelectorAll('li')].map((l) => ({ ad: l.querySelector('.ad').textContent, ac: !!l.querySelector('[data-ac]'), uyari: l.querySelector('.uyari-metin')?.textContent || '' })),
    metin: s.innerText, goster: s.querySelector('.donustur-goster')?.textContent || '', tek: s.classList.contains('arac-sonuc-tek') } : null; })()`);
  const ciktilar = () => (fs.existsSync(CIKTI) ? fs.readdirSync(CIKTI).sort() : []);
  const bolumler = (process.env.BOLUM || '1,2,3,4,5,6,7,8').split(',').map((s) => s.trim());
  const bolum = (n) => bolumler.includes(String(n));

  // ------------------------------------------------------------ hazırlık
  await pencereKapat();
  await sekmeleriKapat();
  fs.mkdirSync(PNG, { recursive: true });
  fs.rmSync(CIKTI, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); fs.mkdirSync(CIKTI, { recursive: true });
  const G = girdileriUret();
  await evalJs(`(async () => {
    window.__s39 = { d: await import('pdefe://app/src/renderer/araclar/donustur.js') };
    { const m = await import('pdefe://app/src/renderer/araclar/gorselBirlestir.js'); window.__s39.b = { acik: () => m.acikBirlestirmePenceresi() }; }
    window.__s39b = [];
    if (!window.__s39Gozlem) {
      window.__s39Gozlem = new MutationObserver(() => { const t = document.querySelector('#bildirim')?.textContent; if (t && window.__s39b.at(-1) !== t) window.__s39b.push(t); });
      window.__s39Gozlem.observe(document.querySelector('#bildirim'), { childList: true, characterData: true, subtree: true });
      window.__s39Hatalar = [];
      addEventListener('error', (e) => window.__s39Hatalar.push('error: ' + e.message));
      addEventListener('unhandledrejection', (e) => window.__s39Hatalar.push('reject: ' + (e.reason?.message || e.reason)));
      const ce = console.error; console.error = (...a) => { window.__s39Hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); };
    }
    for (const [k, v] of Object.entries({ ciktiKlasoru: ${J(CIKTI)}, otomatikKaydet: false, donusturme: {} })) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; }
    window.__pdefeYerelKutu = true;
    return true;
  })()`);
  for (let i = 0; i < 20 && (await evalJs(`window.pdefe.cagir('dosya:acDiyalog', { baslik: 'test kuyruğu boşaltma' })`))?.length; i++);
  for (let i = 0; i < 20 && (await evalJs(`window.pdefe.cagir('mesaj:kutu', { mesaj: 'test kuyruğu boşaltma', dugmeler: ['a', 'b'], varsayilan: 7 })`))?.secim !== 7; i++);
  await kayit();
  const YET = await evalJs(`window.pdefe.cagir('cekirdek:cagir', 'donusum_yetenekleri', {}, null)`);
  const GORSEL_VAR = !!YET?.gorsel?.var;
  console.log(`     Görüntü dönüştürmesi: ${GORSEL_VAR ? 'var' : 'yok'}; HEIC: ${YET?.gorsel?.heic ? 'açılabiliyor' : 'açılamıyor'}`);
  if (!GORSEL_VAR) sonuc('Ön koşul: çekirdekte görüntü ↔ PDF dönüştürmesi var (donusum_yetenekleri.gorsel.var)', false, YET?.gorsel);

  // ------------------------------------------------------------ 1) Görüntü girdileri
  if (bolum(1)) {
    console.log('\n== 1) Görüntü girdileri');
    await aracAc([]);
    const bos = await evalJs(`document.querySelector('.donustur-liste .bos-mesaj')?.innerText || ''`);
    sonuc('Boş listede desteklenen türler arasında görüntü (JPG, PNG…)', /görüntü \(JPG, PNG/.test(bos), bos);
    await yanitla('dosya:acDiyalog', [[G.jpg, G.png]]);
    await tikSecici('.donustur-pencere .donustur-ekle');
    await kosul(`document.querySelectorAll('.donustur-oge').length === 2 && !document.querySelector('.donustur-oge.yukleniyor')`, 20000);
    await bekle(400);
    const dk = (await kayit()).find((x) => x.kanal === 'dosya:acDiyalog');
    const f = dk?.secenek?.filtreler || [];
    sonuc('Dosya ekle: "Desteklenen dosyalar"da görüntüler (jpg, jpeg, png, bmp, gif, webp); ayrıca "Görüntüler" süzgeci', ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'].every((u) => f[0]?.extensions?.includes(u))
      && f[0].extensions.includes('pdf') && f[0].extensions.includes('udf') && J(f.find((x) => x.name === 'Görüntüler')?.extensions) === J(['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'])
      && f.at(-1)?.name === 'Tüm dosyalar', f);
    const S = await satirlar();
    const s = Object.fromEntries(S.map((x) => [x.ad, x]));
    const j = s['Taranmış dilekçe.jpg'], p = s['Ekran görüntüsü.png'];
    sonuc('Tür içerikten: "Görüntü (JPG)" ve "Görüntü (PNG)", piksel ölçüsü özette (sayfa yok), küçük resim var', j?.tur === 'gorsel' && j.turEtiketi === 'Görüntü (JPG)'
      && /2\.480 × 3\.508 piksel/.test(j.ozet) && !/sayfa/.test(j.ozet) && j.resim === 'img' && p?.tur === 'gorsel' && p.turEtiketi === 'Görüntü (PNG)' && /1\.654 × 1\.240 piksel/.test(p.ozet), S);
    sonuc('Görüntünün hedefleri PDF, UDF, Word, TIFF (JPG yok: kendi türü); varsayılan PDF; PDF ve TIFF seçilebilir', J(j?.hedefler.map((h) => h.id)) === J(['pdf', 'udf', 'word', 'tiff'])
      && j.hedefler.find((h) => h.secili)?.id === 'pdf' && !j.hedefler.find((h) => h.id === 'pdf').devre && !j.hedefler.find((h) => h.id === 'tiff').devre, j?.hedefler);
    const k = await evalJs(`(() => { const a = ${A}; return { coklu: a.kayit.coklu(), klasor: a.kayit.cikti.klasor() }; })()`);
    sonuc('İki görüntü: Kaydet bölümü klasör kipinde (adlar girdilerin adı)', k.coklu === true && k.klasor === CIKTI, k);
    await ss('01-goruntuler');
    await pencereKapat();
  }

  // ------------------------------------------------------------ 2) Görüntü → PDF
  if (bolum(2) && GORSEL_VAR) {
    console.log('\n== 2) Görüntü → PDF');
    await aracAc([G.jpg]);
    await evalJs(`window.__s39b.length = 0`);
    await donusturVeBekle();
    const h1 = path.join(CIKTI, 'Taranmış dilekçe.pdf');
    const o1 = fs.existsSync(h1) ? pdfOzeti(h1) : null;
    const akt = await evalJs(`window.__pdefe.aktif()?.yol || null`);
    sonuc('300 dpi etiketli taranmış JPG → PDF: tek sayfa, A4 dikey, tek resim; sonuç sekmede açıldı, pencere kapandı', !!o1 && o1.sayfa === 1 && A4(o1.olcu[0]) && o1.resim === 1
      && !!akt && path.resolve(akt) === path.resolve(h1) && !(await evalJs(`!!document.querySelector('.donustur-pencere')`)), { o1, akt });
    await sekmeleriKapat();
    // İki görüntü birlikte: sonuç listesi; dpi etiketsiz PNG'nin uzun kenarı A4'ün uzun kenarı
    fs.rmSync(h1, { force: true });
    await aracAc([G.jpg, G.png]);
    await donusturVeBekle();
    const h2 = path.join(CIKTI, 'Ekran görüntüsü.pdf');
    const o2 = fs.existsSync(h2) ? pdfOzeti(h2) : null;
    const sk = await sonucKutusu();
    sonuc('İki görüntü → iki PDF; dpi etiketsiz PNG: yatay sayfa, uzun kenar A4\'ün uzun kenarı (841,9 pt); sonuç listesinde iki satır, Aç\'lar',
      fs.existsSync(h1) && !!o2 && o2.sayfa === 1 && Math.abs(o2.olcu[0][0] - 841.9) <= 1.5 && o2.olcu[0][1] < o2.olcu[0][0] && sk?.satirlar.length === 2 && sk.satirlar.every((x) => x.ac)
      && /2 dosya dönüştürüldü/.test(sk.baslik), { o2, sk });
    await pencereKapat();
  }

  // ------------------------------------------------------------ 3) PDF → JPG
  if (bolum(3) && GORSEL_VAR) {
    console.log('\n== 3) PDF → JPG');
    const sayfa1 = path.join(CIKTI, 'Dilekçe örneği - Sayfa 1.jpg'), sayfa2 = path.join(CIKTI, 'Dilekçe örneği - Sayfa 2.jpg');
    await aracAc([G.pdf2]);
    let S = await satirlar();
    sonuc('PDF\'in hedeflerinde JPG (son sırada), ipucunda "her sayfa ayrı dosya"', J(S[0]?.hedefler.map((h) => h.id)) === J(['udf', 'word', 'tiff', 'gorsel'])
      && S[0].hedefler.at(-1).ad === 'JPG' && /JPG'ye dönüştür \(\.jpg; çok sayfalı belgede her sayfa ayrı dosya\)/.test(S[0].hedefler.at(-1).ipucu), S[0]?.hedefler);
    await hedefTikla('Dilekçe örneği.pdf', 'gorsel');
    await kosul(`${A}.kayit.cikti.ad() === 'Dilekçe örneği.jpg'`, 5000);
    const k = await evalJs(`(() => { const p = document.querySelector('.donustur-pencere'); const a = ${A};
      return { ad: a.kayit.cikti.ad(), adGizli: p.querySelector('.arac-kayit-yeni .arac-cikti-ad').hidden, not: p.querySelector('.donustur-jpg-adlari').hidden ? '' : p.querySelector('.donustur-jpg-adlari').textContent,
        adlar: !p.querySelector('.donustur-adlar').hidden, secenek: !p.querySelector('.donustur-secenekler').hidden, baslik: p.querySelector('.donustur-secenekler .arac-bolum-baslik').textContent,
        renk: !p.querySelector('.donustur-renk-satiri').hidden, secenekNotu: p.querySelector('.donustur-secenek-notu').textContent }; })()`);
    sonuc('JPG hedefi (tek girdi): ad kutusu görünür ("Dilekçe örneği"), altında sayfa dosyalarının adları; "JPG seçenekleri", renk satırı yok', k.ad === 'Dilekçe örneği.jpg' && !k.adGizli
      && k.not === 'Her sayfa ayrı bir JPG dosyası olur: "Dilekçe örneği - Sayfa 1.jpg" … "Dilekçe örneği - Sayfa 2.jpg".' && !k.adlar && k.secenek && k.baslik === 'JPG seçenekleri' && !k.renk
      && /büyütülmez/.test(k.secenekNotu), k);
    await yanitla('dosya:kaydetDiyalog', [null]);
    await tikSecici('.donustur-pencere .arac-kayit-yeni .arac-cikti-degistir');
    const kd = (await kayit()).find((x) => x.kanal === 'dosya:kaydetDiyalog');
    sonuc('Değiştir: kaydetme penceresinin süzgeci "JPG görüntüsü" (.jpg, .jpeg)', kd?.secenek?.filtreler?.[0]?.name === 'JPG görüntüsü' && J(kd.secenek.filtreler[0].extensions) === J(['jpg', 'jpeg']), kd?.secenek);
    await tikSecici('.donustur-pencere .donustur-secenekler .arac-segmentli[aria-label="Çözünürlük"] > button[data-id="200"]');
    await evalJs(`window.__s39b.length = 0`);
    await donusturVeBekle();
    const j1 = fs.existsSync(sayfa1) ? jpgOzeti(sayfa1) : null, j2 = fs.existsSync(sayfa2) ? jpgOzeti(sayfa2) : null;
    sonuc('İki sayfalı PDF → "Dilekçe örneği - Sayfa 1.jpg" ve "… - Sayfa 2.jpg"; 200 dpi: 1654 × 2339 piksel, dpi etiketi 200; "Dilekçe örneği.jpg" yok',
      j1?.bicim === 'JPEG' && olcuYakin(j1.olcu, [1654, 2339]) && J(j1.dpi) === J([200, 200]) && j2?.bicim === 'JPEG' && !fs.existsSync(path.join(CIKTI, 'Dilekçe örneği.jpg')), { j1, j2 });
    let sk = await sonucKutusu();
    sonuc('Sonuç: "Dosya dönüştürüldü · 2 görüntü dosyası", her dosya bir satır, Aç yok, KB / sayfa yok, Klasörde göster', !!sk && /^Dosya dönüştürüldü · 2 görüntü dosyası$/.test(sk.baslik.trim())
      && J(sk.satirlar.map((x) => x.ad)) === J(['Dilekçe örneği - Sayfa 1.jpg', 'Dilekçe örneği - Sayfa 2.jpg']) && sk.satirlar.every((x) => !x.ac) && !/KB|sayfa ·/.test(sk.metin)
      && sk.goster === 'Klasörde göster' && !sk.tek, sk);
    sonuc('Bildirim "Dönüştürüldü: 2 görüntü dosyası"; Dönüştür soluk', (await bildirimler()).includes('Dönüştürüldü: 2 görüntü dosyası') && (await donusturDevre()), await bildirimler());
    await ss('03-pdf-jpg-sonuc');
    await kayit();
    await tikSecici('.donustur-sonuc .donustur-goster');
    const kg = (await kayit()).find((x) => x.kanal === 'kabuk:klasordeGoster');
    sonuc('Klasörde göster ilk dosyayı gösterir', !!kg && path.resolve(kg.secenek.yol) === path.resolve(sayfa1), kg);
    // Dosyalar varken: "zaten var" sorusu
    const zaman = (y) => fs.statSync(y).mtimeMs;
    const once1 = zaman(sayfa1);
    await bekle(1100);
    await tikSecici('.donustur-pencere .donustur-secenekler .arac-segmentli[aria-label="Çözünürlük"] > button[data-id="300"]');   // ayar değişti: Dönüştür yeniden etkin
    await yanitla('mesaj:kutu', [{ secim: 2 }]);
    await kayit();
    await donusturBas();
    await bekle(1200);
    const soru = (await kayit()).find((x) => x.kanal === 'mesaj:kutu');
    sonuc('Var olan sayfa dosyaları: "zaten var" sorusu (Üzerine yaz | Yeni belge olarak kaydet | Vazgeç; varsayılan yeni belge); yeni ad soruda', !!soru
      && J(soru.secenek.dugmeler) === J(['Üzerine yaz', 'Yeni belge olarak kaydet', 'Vazgeç']) && soru.secenek.varsayilan === 1 && soru.secenek.iptal === 2
      && /zaten var/.test(soru.secenek.mesaj) && /"Dilekçe örneği \(1\) - Sayfa 1\.jpg" \(ve sonraki sayfalar\) olur/.test(soru.secenek.ayrinti), soru?.secenek);
    sonuc('Vazgeç: hiçbir dosya yazılmaz', J(ciktilar().filter((a) => a.endsWith('.jpg'))) === J(['Dilekçe örneği - Sayfa 1.jpg', 'Dilekçe örneği - Sayfa 2.jpg']) && zaman(sayfa1) === once1, ciktilar());
    await yanitla('mesaj:kutu', [{ secim: 1 }]);
    await donusturVeBekle();
    const yeni1 = path.join(CIKTI, 'Dilekçe örneği (1) - Sayfa 1.jpg');
    sk = await sonucKutusu();
    sonuc('Yeni belge olarak kaydet: "Dilekçe örneği (1) - Sayfa 1.jpg", "(1) - Sayfa 2.jpg" (300 dpi: 2480 × 3508); var olanlar değişmedi', fs.existsSync(yeni1)
      && fs.existsSync(path.join(CIKTI, 'Dilekçe örneği (1) - Sayfa 2.jpg')) && olcuYakin(jpgOzeti(yeni1).olcu, [2480, 3508]) && zaman(sayfa1) === once1
      && J(sk?.satirlar.map((x) => x.ad)) === J(['Dilekçe örneği (1) - Sayfa 1.jpg', 'Dilekçe örneği (1) - Sayfa 2.jpg']), { dosyalar: ciktilar(), sk });
    // Üzerine yaz: var olanlar yenilenir, yeni ad yok
    await tikSecici('.donustur-pencere .donustur-secenekler .arac-segmentli[aria-label="Çözünürlük"] > button[data-id="200"]');
    await yanitla('mesaj:kutu', [{ secim: 0 }]);
    const sayi = ciktilar().length;
    await donusturVeBekle();
    sonuc('Üzerine yaz: var olan sayfa dosyaları yenilenir (değişme zamanı), yeni dosya yok', zaman(sayfa1) > once1 && ciktilar().length === sayi && olcuYakin(jpgOzeti(sayfa1).olcu, [1654, 2339]), ciktilar());
    await pencereKapat();
    // Tek sayfalı PDF → "<ad>.jpg"
    await aracAc([G.pdf1]);
    await evalJs(`${A}.hedefSec(${A}.ogeler[0], 'gorsel')`);
    await kosul(`${A}.kayit.cikti.ad() === 'Tek sayfa.jpg'`, 5000);
    const not1 = await evalJs(`document.querySelector('.donustur-jpg-adlari').textContent`);
    await tikSecici('.donustur-pencere .donustur-secenekler .arac-segmentli[aria-label="Çözünürlük"] > button[data-id="300"]');
    await donusturVeBekle();
    const t1 = path.join(CIKTI, 'Tek sayfa.jpg');
    sk = await sonucKutusu();
    sonuc('Tek sayfalı PDF → "Tek sayfa.jpg" (sayfa eki yok; 300 dpi: 2480 × 3508); not "… adıyla kaydedilir"; sonuç ortalı tek satır', fs.existsSync(t1) && olcuYakin(jpgOzeti(t1).olcu, [2480, 3508])
      && !fs.existsSync(path.join(CIKTI, 'Tek sayfa - Sayfa 1.jpg')) && not1 === 'Görüntü "Tek sayfa.jpg" adıyla kaydedilir.' && sk?.tek && /^Dosya dönüştürüldü$/.test(sk.baslik.trim()), { not1, sk });
    await pencereKapat();
    // Birden çok girdi: adları araç verir; var olan adlarda "(2)"
    const once = new Set(ciktilar());
    await aracAc([G.pdf2, G.pdf1]);
    for (const ad of ['Dilekçe örneği.pdf', 'Tek sayfa.pdf']) await hedefTikla(ad, 'gorsel');
    await bekle(300);
    const adlarNotu = await evalJs(`(() => { const e = document.querySelector('.donustur-adlar'); return e.hidden ? '' : e.textContent; })()`);
    await donusturVeBekle();
    const yeniler = ciktilar().filter((a) => !once.has(a));
    sonuc('Birden çok girdi → JPG: var olan adlarda "(2)" ("Dilekçe örneği (2) - Sayfa 1.jpg", "… - Sayfa 2.jpg", "Tek sayfa (2).jpg"); not her sayfanın ayrı dosya olduğunu söyler',
      J(yeniler) === J(['Dilekçe örneği (2) - Sayfa 1.jpg', 'Dilekçe örneği (2) - Sayfa 2.jpg', 'Tek sayfa (2).jpg']) && /her sayfası ayrı bir JPG dosyası olur/.test(adlarNotu), { yeniler, adlarNotu });
    sk = await sonucKutusu();
    sonuc('Sonuç listesinde üç satır (bütün dosyalar), başlık "2 dosya dönüştürüldü"', sk?.satirlar.length === 3 && /^2 dosya dönüştürüldü/.test(sk.baslik.trim()), sk);
    await pencereKapat();
    // Geç iptal (benzetim): çekirdek sonucu döndürdükten sonra iptal; JPG'nin bütün sayfa dosyaları dosya:sil'e (sınamada yalnızca kaydedilir)
    for (const a of ciktilar()) fs.rmSync(path.join(CIKTI, a), { force: true });
    await aracAc([G.pdf2]);
    await evalJs(`${A}.hedefSec(${A}.ogeler[0], 'gorsel')`);
    await evalJs(`${A}.kayit.hazir.then(() => true)`);
    await evalJs(`(() => { const a = ${A}; window.__s39Silinen = []; const b = a.baglam, k = b.pdefe;
      a.baglam = { ...b, pdefe: { platform: k.platform, dinle: (x, c) => k.dinle(x, c), gonder: (...x) => k.gonder(...x), dosyaYolu: (f) => k.dosyaYolu(f),
        cagir: (x, ...y) => (x === 'dosya:sil' ? (window.__s39Silinen.push(y[0]), Promise.resolve(true)) : k.cagir(x, ...y)) } };
      const asil = a.ilerleme.calistir.bind(a.ilerleme);
      a.ilerleme.calistir = async (...g) => { const r = await asil(...g); const e = new Error('İşlem iptal edildi.'); e.iptal = true; e.sonuc = r; throw e; };
      window.__s39b.length = 0; return true; })()`);
    await donusturBas();
    await bekle(4000);
    const silinen = (await evalJs(`window.__s39Silinen`)).map((y) => path.basename(y)).sort();
    sonuc('Geç iptal: iki sayfa dosyası da dosya:sil\'e (çöp kutusu) verilir, "Dönüştürme iptal edildi."', J(silinen) === J(['Dilekçe örneği - Sayfa 1.jpg', 'Dilekçe örneği - Sayfa 2.jpg'])
      && (await bildirimler()).includes('Dönüştürme iptal edildi.'), silinen);
    await pencereKapat();
    // Ana süreç: dönüştürmenin oluşturmadığı .jpg silinmez
    const elle = path.join(CIKTI, 'Elle konmuş.jpg');
    fs.writeFileSync(elle, 'yer tutucu');
    sonuc('dosya:sil: dönüştürmenin oluşturmadığı .jpg reddedilir, dosya yerinde', (await evalJs(`window.pdefe.cagir('dosya:sil', ${J(elle)})`)) === false && fs.existsSync(elle));
    fs.rmSync(elle, { force: true });
  }

  // ------------------------------------------------------------ 4) İdeal / Düşük ve yaklaşık boyut (madde 8)
  if (bolum(4) && GORSEL_VAR) {
    console.log('\n== 4) İdeal / Düşük');
    for (const a of ciktilar()) fs.rmSync(path.join(CIKTI, a), { force: true });
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
    const dugmeler = () => evalJs(`[...document.querySelectorAll('.donustur-dpi-secim > button')].map((b) => ({ id: b.dataset.id, ad: b.querySelector('.ad').textContent,
      boyut: b.querySelector('.boyut').textContent, secili: b.classList.contains('secili'), ipucu: b.title }))`);
    // 0.2.8: hesaplanırken "hesaplanıyor…" yazmaz (önceki değer ya da "…" soluk: .bekliyor sınıfı)
    const tahminBitti = (sure = 30000) => kosul(`(() => { const b = [...document.querySelectorAll('.donustur-dpi-secim .boyut')]; return b.length && b.every((x) => !x.classList.contains('bekliyor') && !/hesaplanıyor/.test(x.textContent)); })()`, sure);
    /** " · 1,20 MB" / " · ≥ 356 KB" → bayt */
    const bayt = (s) => { const m = /([\d.,]+)\s*(KB|MB)/.exec(s || ''); if (!m) return null; const n = parseFloat(m[1].replace(/\./g, '').replace(',', '.')); return m[2] === 'MB' ? n * 1048576 : n * 1024; };
    const yakin = (a, b, oran = 0.1) => a > 0 && b > 0 && Math.abs(a - b) / b <= oran;
    // Varsayılan İdeal: görünmesi, boyutlar, dpi yazısının olmaması
    await aracAc([G.pdf2]);
    await evalJs(`${A}.hedefSec(${A}.ogeler[0], 'tiff')`);
    await bekle(300);
    await tahminBitti();
    let D = await dugmeler();
    const bolumMetni = await evalJs(`document.querySelector('.donustur-secenekler').innerText`);
    sonuc('TIFF: Çözünürlük "İdeal" (seçili, varsayılan) ve "Düşük"; yanlarında yaklaşık boyut (" · … KB / MB"); bölümde ve ipuçlarında "dpi" yok',
      J(D.map((x) => [x.id, x.ad, x.secili])) === J([['300', 'İdeal', true], ['200', 'Düşük', false]]) && D.every((x) => /^ · [\d.,]+ (KB|MB)$/.test(x.boyut))
      && bayt(D[0].boyut) > bayt(D[1].boyut) && !/dpi/i.test(bolumMetni) && D.every((x) => !/dpi/i.test(x.ipucu) && /Tahminî boyut: /.test(x.ipucu)), { D, bolumMetni });
    await ss('04-ideal-dusuk');
    // Renk değişince yeniden hesaplanır
    const sb = bayt(D[0].boyut);
    await tikSecici('.donustur-renk-secim > button[data-id="gri"]');
    await kosul(`(() => { const e = document.querySelector('.donustur-dpi-secim > button[data-id="300"] .boyut'), b = e.textContent; return !!b && !e.classList.contains('bekliyor') && b !== ${J(D[0].boyut)}; })()`, 30000);
    D = await dugmeler();
    sonuc('Renk "Gri" seçilince boyut yeniden hesaplanır (siyah beyazdan büyük)', bayt(D[0].boyut) > sb, { sb: D[0].boyut });
    // Dönüştürmenin gerçek boyutu tahmine yakın; İdeal 300 dpi
    await donusturVeBekle();
    const t1 = path.join(CIKTI, 'Dilekçe örneği.tif');
    const g1 = fs.existsSync(t1) ? fs.statSync(t1).size : 0;
    const o1 = g1 ? py(`im = Image.open(${J(t1)})\nprint(json.dumps({"dpi": [round(float(x)) for x in im.info.get("dpi", (0, 0))], "kip": im.mode}))`) : null;
    console.log(`     ölçüm: TIFF İdeal gri tahmini ${D[0].boyut.replace(' · ', '')}, gerçek ${g1} bayt`);
    sonuc('İdeal: TIFF 300 dpi, gri; dosyanın boyutu "İdeal"in tahminine yakın (±%10)', J(o1?.dpi) === J([300, 300]) && o1.kip === 'L' && yakin(g1, bayt(D[0].boyut)), { o1, gercek: g1, tahmin: D[0].boyut });
    await tikSecici('.donustur-renk-secim > button[data-id="sb"]');
    await pencereKapat();
    // JPG: aynı iki seçenek ve tahmin; Düşük'ün gerçek boyutu
    await aracAc([G.pdf2]);
    await evalJs(`${A}.hedefSec(${A}.ogeler[0], 'gorsel')`);
    await bekle(300);
    await tahminBitti();
    D = await dugmeler();
    sonuc('JPG: İdeal / Düşük ve yanlarında yaklaşık boyut', J(D.map((x) => x.ad)) === J(['İdeal', 'Düşük']) && D.every((x) => /^ · [\d.,]+ (KB|MB)$/.test(x.boyut)), D);
    await tikSecici('.donustur-pencere .donustur-secenekler .arac-segmentli[aria-label="Çözünürlük"] > button[data-id="200"]');
    await donusturVeBekle();
    const jpgler = ciktilar().filter((a) => /^Dilekçe örneği - Sayfa \d\.jpg$/.test(a));
    const g2 = jpgler.reduce((t, a) => t + fs.statSync(path.join(CIKTI, a)).size, 0);
    console.log(`     ölçüm: JPG Düşük tahmini ${D[1].boyut.replace(' · ', '')}, gerçek ${g2} bayt`);
    sonuc('Düşük: iki JPG (200 dpi), toplam boyut "Düşük"ün tahminine yakın (±%10)', jpgler.length === 2 && J(jpgOzeti(path.join(CIKTI, jpgler[0])).dpi) === J([200, 200]) && yakin(g2, bayt(D[1].boyut)),
      { jpgler, gercek: g2, tahmin: D[1].boyut });
    await tikSecici('.donustur-pencere .donustur-secenekler .arac-segmentli[aria-label="Çözünürlük"] > button[data-id="300"]');
    await pencereKapat();
    // UDF / Word: tahmin yok. Yalnızca UDF → TIFF: sayı yok, ipucunda not; UDF + PDF: toplam "≥"
    await aracAc([G.udf]);
    await evalJs(`${A}.hedefSec(${A}.ogeler[0], 'tiff')`);
    await bekle(300);
    await tahminBitti();
    await bekle(400);
    D = await dugmeler();
    sonuc('Yalnızca UDF → TIFF: boyut yazmaz, ipucunda "UDF ve Word dosyalarının boyutu dönüştürülmeden kestirilemiyor"', D.every((x) => x.boyut === '' && /UDF ve Word dosyalarının boyutu dönüştürülmeden kestirilemiyor/.test(x.ipucu)), D);
    await evalJs(`${A}.dosyaEkle(${J([G.pdf2])})`);
    await kosul(`!document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    await evalJs(`(() => { const a = ${A}; a.hedefSec(a.ogeler[1], 'tiff'); return true; })()`);
    await bekle(300);
    await tahminBitti();
    D = await dugmeler();
    sonuc('UDF + PDF → TIFF: toplam "≥ …" (UDF katılmadı), ipucunda not', D.every((x) => /^ · ≥ [\d.,]+ (KB|MB)$/.test(x.boyut) && /UDF ve Word/.test(x.ipucu)), D);
    await pencereKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
  }

  // ------------------------------------------------------------ 5) Açma yolları
  if (bolum(5)) {
    console.log('\n== 5) Açma yolları');
    await pencereKapat();
    await sekmeleriKapat();
    await yanitla('dosya:acDiyalog', [[G.jpg]]);
    await kayit();
    await evalJs(`window.__pdefe.komutCalistir('dosya.ac')`);
    await kosul(`!!document.querySelector('.donustur-pencere') && document.querySelectorAll('.donustur-oge').length === 1 && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    const ck = (await kayit()).find((x) => x.kanal === 'dosya:acDiyalog');
    let S = await satirlar();
    sonuc('Ctrl+O: süzgeçte görüntüler; seçilen JPG Format Değiştir\'de açılır (sekme açılmaz)', ck?.secenek?.filtreler?.[0]?.extensions?.includes('jpg') && ck.secenek.filtreler.some((x) => x.name === 'Görüntüler')
      && J(S.map((x) => x.ad)) === J(['Taranmış dilekçe.jpg']) && (await evalJs(`window.__pdefe.belgeler.size`)) === 0, { f: ck?.secenek?.filtreler, S: S.map((x) => x.ad) });
    await evalJs(`window.pdefe.cagir('test:olayGonder', 'dosya:ac', ${J([G.png])})`);
    await kosul(`document.querySelectorAll('.donustur-oge').length === 2 && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    S = await satirlar();
    sonuc('Ana sürecin dosya:ac\'ı (PNG): açık aracın listesine eklenir', S.length === 2 && S[1].ad === 'Ekran görüntüsü.png', S.map((x) => x.ad));
    await pencereKapat();
    const ikinci = await evalJs(`window.pdefe.cagir('test:uygulamaOlayi', 'second-instance', [${J(G.jpg)}])`);
    await kosul(`!!document.querySelector('.donustur-pencere') && document.querySelectorAll('.donustur-oge').length === 1 && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    S = await satirlar();
    sonuc('Komut satırı (ikinci örnek): JPG Format Değiştir\'de açılır (ana süreç görüntü uzantısını tanır)', ikinci && J(S.map((x) => x.ad)) === J(['Taranmış dilekçe.jpg'])
      && (await evalJs(`window.__pdefe.belgeler.size`)) === 0, { ikinci, S: S.map((x) => x.ad) });
    await pencereKapat();
    // Ana pencereye bırakma (CDP sürükle-bırak: sayfa File nesnesinden yolu okur)
    const h = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT || 9222}/json`)).json()).find((x) => x.type === 'page' && /index\.html/.test(x.url));
    const ws = new WebSocket(h.webSocketDebuggerUrl);
    await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
    let n = 0; const bek = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bek.has(d.id)) { bek.get(d.id)(d); bek.delete(d.id); } };
    const gonder = (method, params = {}) => new Promise((c) => { const i = ++n; bek.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
    const data = { items: [], files: [G.png, G.pdf1], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) { await gonder('Input.dispatchDragEvent', { type, x: 640, y: 520, data }); await bekle(100); }
    await kosul(`!!document.querySelector('.donustur-pencere') && document.querySelectorAll('.donustur-oge').length === 1 && !document.querySelector('.donustur-oge.yukleniyor')`, 15000);
    await kosul(`window.__pdefe.belgeler.size === 1`, 8000);
    S = await satirlar();
    sonuc('Ana pencereye bırakma: PNG Format Değiştir\'de (Birleştir\'de değil), PDF sekmede', J(S.map((x) => x.ad)) === J(['Ekran görüntüsü.png'])
      && !(await evalJs(`!!document.querySelector('.birlestir-pencere')`)) && J(await evalJs(`[...window.__pdefe.belgeler.values()].map((b) => b.ad)`)) === J(['Tek sayfa.pdf']), S.map((x) => x.ad));
    ws.close();
    await pencereKapat();
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 6) Açılamayan görüntü (HEIC)
  if (bolum(6)) {
    console.log('\n== 6) HEIC');
    await aracAc([G.heic]);
    const S = await satirlar();
    const h = S[0];
    if (YET?.gorsel?.heic) atlandi('HEIC açılamıyor', 'bu çekirdekte HEIC açıcısı var');
    else {
      sonuc('HEIC (açıcısı yok): satırda tür "Görüntü (HEIC)", hedefler soluk, seçili hedefin nedeni satırda, Dönüştür soluk', h?.tur === 'gorsel' && h.turEtiketi === 'Görüntü (HEIC)'
        && h.hedefler.every((x) => x.devre) && /dönüştürülemez/.test(h.neden) && (await donusturDevre()), h);
    }
    await pencereKapat();
  }

  // ------------------------------------------------------------ 7) Kalite notu (madde 10)
  if (bolum(7)) {
    console.log('\n== 7) Kalite notu');
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
    await aracAc([G.udf, G.tiff, G.jpg, G.pdf2]);
    const not = (ad) => evalJs(`(() => { const e = [...document.querySelectorAll('.donustur-oge')].find((x) => x.querySelector('.ad').textContent === ${J(ad)});
      const k = e.querySelector('.kalite'); return k.hidden ? '' : k.querySelector('.metin').textContent; })()`);
    const D = YET?.donusumler || {};
    const UDF = 'Karar örneği.udf', TIF = 'Tarama örneği.tif', JPG = 'Taranmış dilekçe.jpg', PDF = 'Dilekçe örneği.pdf';
    sonuc('Varsayılan hedeflerde: UDF → PDF, TIFF → PDF, görüntü → PDF notsuz; PDF → UDF\'de not ("Satır ve sayfa düzeni UDF\'de kayabilir; …")', (await not(UDF)) === '' && (await not(TIF)) === ''
      && (await not(JPG)) === '' && (await not(PDF)) === 'Satır ve sayfa düzeni UDF\'de kayabilir; imza, kaşe gibi resimler alınmayabilir.', [await not(UDF), await not(TIF), await not(JPG), await not(PDF)]);
    if (D['udf>word']?.var) {
      await hedefTikla(UDF, 'word');
      sonuc('UDF seçiliyken Word\'e tıklanınca hemen satırın altında not: "Sayfa düzeni Word\'de birebir korunmayabilir."', (await not(UDF)) === 'Sayfa düzeni Word\'de birebir korunmayabilir.', await not(UDF));
      await ss('07-kalite-udf-word');
      await hedefTikla(UDF, 'pdf');
      sonuc('UDF → PDF\'e dönülünce not kalkar', (await not(UDF)) === '', await not(UDF));
    } else atlandi('UDF → Word notu', 'UDF → Word bu bilgisayarda yapılamıyor (not yalnızca yapılabilen hedefte)');
    if (D['tiff>word']?.var) {
      await hedefTikla(TIF, 'word');
      sonuc('TIFF → Word: "Taranmış sayfalar Word\'e resim olarak geçer; yazıları düzenlenemez."', (await not(TIF)) === 'Taranmış sayfalar Word\'e resim olarak geçer; yazıları düzenlenemez.', await not(TIF));
    } else atlandi('TIFF → Word notu', 'TIFF → Word bu bilgisayarda yapılamıyor');
    await hedefTikla(JPG, 'udf');
    sonuc('Görüntü → UDF: "Yazılar görüntüden tanınarak çıkarılır; …"', (await not(JPG)) === 'Yazılar görüntüden tanınarak çıkarılır; harf yanlışları ve düzen kayması olabilir.', await not(JPG));
    await hedefTikla(PDF, 'tiff');
    const pdfTiff = await not(PDF);
    await hedefTikla(PDF, 'gorsel');
    sonuc('PDF → TIFF ve PDF → JPG notsuz (sayfanın birebir resmi)', pdfTiff === '' && (await not(PDF)) === '', [pdfTiff, await not(PDF)]);
    const renk = await evalJs(`(() => { const e = [...document.querySelectorAll('.donustur-oge')].find((x) => x.querySelector('.ad').textContent === ${J(JPG)});
      const k = getComputedStyle(e.querySelector('.kalite')).color, o = getComputedStyle(e.querySelector('.ozet')).color, u = getComputedStyle(e.querySelector('.uyari')).color;
      return { k, o, u, simge: !!e.querySelector('.kalite svg') }; })()`);
    sonuc('Not sakin renkte (satırın özetiyle aynı soluk renk, uyarı renginden farklı), bilgi simgesiyle', renk.k === renk.o && renk.k !== renk.u && renk.simge, renk);
    await pencereKapat();
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'donusturme', {}); window.__pdefe.ayar().donusturme = {}; return true; })()`);
  }

  // ------------------------------------------------------------ 8) Birleştir: UDF, Word, TIFF, görüntü, PDF → tek PDF (madde 2)
  if (bolum(8)) {
    console.log('\n== 8) Birleştir');
    const UDE_VAR = !!YET?.donusumler?.['udf>pdf']?.var;
    const WORD_VAR = !!YET?.donusumler?.['word>pdf']?.var;
    const WORD_SINA = WORD_VAR && process.env.S39_WORD === '1';
    console.log(`     UYAP Doküman Editörü: ${UDE_VAR ? 'var' : 'yok (yaklaşık çizim)'}; Word → PDF: ${WORD_VAR ? (WORD_SINA ? 'var, sınanıyor' : 'var; birleştirmede sınamak için $env:S39_WORD="1"') : 'yok'}`);
    const BA = `document.querySelector('.birlestir-pencere')`;
    const bSatirlar = () => evalJs(`[...document.querySelectorAll('.birlestir-pencere .birlestir-oge')].map((e) => ({
      ad: e.querySelector('.ad').textContent, tur: e.dataset.tur, ozet: e.querySelector('.ozet').textContent, cevrilemez: e.classList.contains('cevrilemez'),
      neden: e.querySelector('.neden').hidden ? '' : e.querySelector('.neden').textContent, hata: e.querySelector('.hata').hidden ? '' : e.querySelector('.hata').textContent,
      tahmin: e.querySelector('.tahmin')?.textContent || '', ayarlar: !e.querySelector('.ayarlar').hidden,
      resim: e.querySelector('.resim img') ? 'img' : (e.querySelector('.resim .yer')?.textContent || ''), yerTur: e.querySelector('.resim .yer')?.dataset.tur || '' }))`);
    const bAc = async (yollar) => {
      await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir', ${J(yollar)})`);
      await kosul(`!!${BA}`, 5000);
      await kosul(`!document.querySelector('.birlestir-oge.yukleniyor') && document.querySelectorAll('.birlestir-oge').length === ${yollar.length}`, 30000);
      // UDF'nin küçük resmi (editörün ön izlemesi ya da yaklaşık çizim) gelene dek
      await kosul(`[...document.querySelectorAll('.birlestir-oge[data-tur="udf"]')].every((e) => !e.querySelector('.resim.onizleniyor'))`, 40000);
      await bekle(400);
    };
    const bKapat = async () => {
      await evalJs(`(async () => { window.__pdefeOtoYanit = { secim: 1 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); }
        finally { delete window.__pdefeOtoYanit; } return true; })()`);
      await kosul(`!document.querySelector('.arac-ortusu')`, 5000);
    };
    // Dosya ekle süzgeci
    await bAc([]);
    await yanitla('dosya:acDiyalog', [[G.udf, G.pdf2, G.tiff, G.docx, G.jpg]]);
    await kayit();
    await tikSecici('.birlestir-pencere .birlestir-ekle');
    await kosul(`document.querySelectorAll('.birlestir-oge').length === 5 && !document.querySelector('.birlestir-oge.yukleniyor')`, 30000);
    await kosul(`[...document.querySelectorAll('.birlestir-oge[data-tur="udf"]')].every((e) => !e.querySelector('.resim.onizleniyor'))`, 40000);
    await bekle(500);
    const dk = (await kayit()).find((x) => x.kanal === 'dosya:acDiyalog');
    const f = dk?.secenek?.filtreler || [];
    sonuc('Dosya ekle: "Desteklenen dosyalar"da PDF, görüntüler, TIFF, UDF ve Word (doc, docx, docm, rtf, odt); "UDF belgeleri" ve "Word belgeleri" süzgeçleri', f[0]?.name === 'Desteklenen dosyalar'
      && ['pdf', 'jpg', 'png', 'tif', 'tiff', 'udf', 'doc', 'docx', 'docm', 'rtf', 'odt'].every((u) => f[0].extensions.includes(u)) && J(f.find((x) => x.name === 'UDF belgeleri')?.extensions) === J(['udf'])
      && J(f.find((x) => x.name === 'Word belgeleri')?.extensions) === J(['doc', 'docx', 'docm', 'rtf', 'odt']), f);
    let S = await bSatirlar();
    const s = Object.fromEntries(S.map((x) => [x.ad, x]));
    const u = s['Karar örneği.udf'], w = s['Word örneği.docx'];
    sonuc('Satırlar sırayla: UDF, PDF, TIFF, Word, JPG; türler içerikten (udf, pdf, gorsel, word, gorsel)', J(S.map((x) => x.tur)) === J(['udf', 'pdf', 'gorsel', 'word', 'gorsel']), S.map((x) => [x.ad, x.tur]));
    sonuc(`UDF satırı: tür "UDF", küçük resim (${UDE_VAR ? 'editörün ön izlemesi' : 'yaklaşık çizim'}), sayfa sayısı; tahmin yok`, /^UDF · 1 sayfa/.test(u?.ozet || '') && u.resim === 'img' && u.tahmin === 'tahmin yok'
      && !u.cevrilemez && u.ayarlar, u);
    if (!UDE_VAR) sonuc('UDE yok: UDF satırında "görünüm yaklaşık" uyarısı', /^UYAP Doküman Editörü bulunamadı; görünüm yaklaşık/.test(u?.neden || ''), u);
    else sonuc('UDE var: UDF satırında uyarı yok', !u?.neden, u);
    if (WORD_VAR) sonuc('Word satırı: tür "DOCX", mavi yer tutucu ("DOCX"), sayfa sayısı yok, tahmin yok; çevrilebilir', /^DOCX · /.test(w?.ozet || '') && !/sayfa/.test(w.ozet) && w.resim === 'DOCX' && w.yerTur === 'word'
      && w.tahmin === 'tahmin yok' && !w.cevrilemez, w);
    else sonuc('Word yok: Word satırı soluk, "PDF\'e çevrilemiyor: …" nedeni satırda, ayarlar gizli', w?.cevrilemez && /^PDF'e çevrilemiyor: /.test(w.neden) && !w.ayarlar, w);
    await kosul(`![...document.querySelectorAll('.birlestir-kalite-secim .boyut')].some((b) => /hesaplanıyor/.test(b.textContent))`, 30000);
    const ozet = await evalJs(`document.querySelector('.birlestir-ozet').textContent`);
    const kd = await evalJs(`[...document.querySelectorAll('.birlestir-kalite-secim > button')].map((b) => [b.querySelector('.boyut').textContent, b.title])`);
    // Word çevrilebiliyorsa sayfa sayısı dönüştürmeden bilinmez: "en az"; çevrilemiyorsa (Word yok) satır toplamlarda yok
    sonuc(`Özet: ${WORD_VAR ? 'Word\'ün sayfa sayısı bilinmediği için "en az … sayfa"' : 'çevrilemeyen Word sayılmaz (6 sayfa)'}; kalite düğmelerinde toplam "≥" ve ipucunda UDF / Word notu`,
      (WORD_VAR ? /^5 dosya · en az \d+ sayfa · /.test(ozet) : /^5 dosya · 6 sayfa · /.test(ozet)) && kd.every(([b, t]) => /^ · ≥ /.test(b) && /UDF ve Word belgelerinin boyutu/.test(t)), { ozet, kd });
    await ss('08-birlestir-satirlar');
    // Birleştir'e bırakılan Word dosyası Birleştir'in listesine eklenir (aracın örtüsü)
    const h = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT || 9222}/json`)).json()).find((x) => x.type === 'page' && /index\.html/.test(x.url));
    const ws = new WebSocket(h.webSocketDebuggerUrl);
    await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
    let n = 0; const bek = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bek.has(d.id)) { bek.get(d.id)(d); bek.delete(d.id); } };
    const gonder = (method, params = {}) => new Promise((c) => { const i = ++n; bek.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
    const data = { items: [], files: [G.pdf1], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) { await gonder('Input.dispatchDragEvent', { type, x: 640, y: 420, data }); await bekle(100); }
    ws.close();
    await kosul(`document.querySelectorAll('.birlestir-oge').length === 6 && !document.querySelector('.birlestir-oge.yukleniyor')`, 15000);
    S = await bSatirlar();
    sonuc('Birleştir açıkken bırakılan dosya Birleştir\'in listesine eklenir (Format Değiştir açılmaz)', S.length === 6 && S[5].ad === 'Tek sayfa.pdf' && !(await evalJs(`!!document.querySelector('.donustur-pencere')`)), S.map((x) => x.ad));
    await evalJs(`(() => { const p = window.__s39.b.acik(); p.sil([p.ogeler[5].kimlik]); return true; })()`);
    if (WORD_VAR && !WORD_SINA) await evalJs(`(() => { const p = window.__s39.b.acik(); p.sil([p.ogeler[3].kimlik]); return true; })()`);   // Word'ü kullanmadan
    // İptal: belgeler PDF'e çevrilirken İptal; hedef yazılmaz
    const hedef = path.join(CIKTI, 'Birleştirilmiş.pdf');
    fs.rmSync(hedef, { force: true });
    await evalJs(`window.__s39b.length = 0`);
    if (!WORD_VAR) await yanitla('mesaj:kutu', [{ secim: 0 }]);   // "1 dosya birleştirilemiyor": Atla ve devam et
    await kayit();
    // İlerleme iletileri kaydedilir; UDF'nin çevrildiğini (ya da çizildiğini) söyleyen ileti gelince (sayfanın içinde bekleyip) İptal: belgenin
    // çevrilmesi kısa sürebilir
    await evalJs(`(() => { window.__s39Mesajlar = []; const p = window.__s39.b.acik(); const asil = p.ilerleme.ayarla.bind(p.ilerleme);
      p.ilerleme.ayarla = (y, m) => { if (m) window.__s39Mesajlar.push(m); return asil(y, m); }; return true; })()`);
    await tikSecici('.birlestir-pencere .arac-dugmeler .birincil');
    const ilerlemeMesaji = await evalJs(`(async () => { const p = window.__s39.b.acik(); const bul = () => window.__s39Mesajlar.find((m) => /Karar örneği\\.udf (çiziliyor|PDF'e çevriliyor)/.test(m));
      for (let i = 0; i < 2000 && p && !p.pencere.kapali && !bul(); i++) await new Promise((c) => setTimeout(c, 10));
      if (p && !p.pencere.kapali) p.ilerleme.iptalIste(); return bul() || window.__s39Mesajlar.join(' | '); })()`);
    await kosul(`!${BA} || ${BA}.querySelector('.arac-ilerleme').hidden`, 60000);
    await bekle(800);
    const atlaSorusu = (await kayit()).find((x) => x.kanal === 'mesaj:kutu');
    sonuc('İptal (belgeler PDF\'e çevrilirken): birleştirme durur, hedef yazılmaz, "Birleştirme iptal edildi."; pencere açık', !fs.existsSync(hedef) && !!(await evalJs(`!!${BA}`))
      && (await bildirimler()).some((b) => /Birleştirme iptal edildi/.test(b)), { ilerlemeMesaji, var: fs.existsSync(hedef) });
    sonuc(`İlerleme UDF'nin ${UDE_VAR ? 'PDF\'e çevrildiğini' : 'çizildiğini'} adıyla söyler`, new RegExp(`^Karar örneği\\.udf ${UDE_VAR ? "PDF'e çevriliyor" : 'çiziliyor'} \\(1/\\d\\)$`).test(ilerlemeMesaji || ''), ilerlemeMesaji);
    if (!WORD_VAR) sonuc('Word yokken birleştirmeden önce "1 dosya birleştirilemiyor." sorusu (adı ve nedeniyle; Atla ve devam et | Vazgeç)', atlaSorusu?.secenek?.mesaj === 'Bir dosya birleştirilemiyor.'
      && /Word örneği\.docx: PDF'e çevrilemiyor/.test(atlaSorusu.secenek.ayrinti) && J(atlaSorusu.secenek.dugmeler) === J(['Atla ve devam et', 'Vazgeç']), atlaSorusu?.secenek);
    // Birleştirme: tek PDF, sıra listedeki gibi
    if (!WORD_VAR) await yanitla('mesaj:kutu', [{ secim: 0 }]);
    await evalJs(`window.__s39b.length = 0`);
    await tikSecici('.birlestir-pencere .arac-dugmeler .birincil');
    await kosul(`!${BA}`, 240000);
    await bekle(600);
    const o = fs.existsSync(hedef) ? py(`d = pymupdf.open(${J(hedef)}, filetype="pdf")
print(json.dumps([{"metin": " ".join(p.get_text().split())[:60], "resim": len(p.get_images())} for p in d], ensure_ascii=False))`) : null;
    const wordli = WORD_SINA;
    // Beklenen: UDF (1 sayfa, "DENEME DİLEKÇESİ"), PDF (2 sayfa, "SAYIN MAHKEMESİ'NE"), TIFF (2 sayfa, resim), [Word (1 sayfa, "Deneme paragrafı")], JPG (1 sayfa, resim)
    const beklenen = ['udf', 'pdf', 'pdf', 'tif', 'tif', ...(wordli ? ['word'] : []), 'jpg'];
    const tanı = (x) => (/DENEME D/.test(x.metin) ? 'udf' : /SAYIN MAHKEMES/.test(x.metin) ? 'pdf' : /Deneme paragraf/.test(x.metin) ? 'word' : x.resim && !x.metin ? 'resim' : '?');
    const gercek = (o || []).map(tanı);
    const akt = await evalJs(`window.__pdefe.aktif()?.yol || null`);
    const bl = await bildirimler();
    sonuc(`Birleştirme: tek PDF, ${beklenen.length} sayfa, sıra listedeki gibi (UDF, PDF ×2, TIFF ×2${wordli ? ', Word' : ''}, JPG); sekmede açıldı`, !!o && o.length === beklenen.length
      && J(gercek) === J(beklenen.map((b) => (b === 'tif' || b === 'jpg' ? 'resim' : b))) && !!akt && path.resolve(akt) === path.resolve(hedef), { gercek, akt });
    if (!UDE_VAR) sonuc('UDE yokken bildirimde UDF\'nin adıyla "görünüm yaklaşık"', bl.some((b) => /Karar örneği\.udf: UYAP Doküman Editörü bulunamadı; görünüm yaklaşık/.test(b)), bl);
    else sonuc('Bildirim "Birleştirildi: Birleştirilmiş.pdf"', bl.some((b) => /^Birleştirildi: Birleştirilmiş\.pdf/.test(b)), bl);
    await sekmeleriKapat();
    await bKapat();
    if (!WORD_SINA && WORD_VAR) atlandi('Birleştirmede Word belgesi', 'Word\'ü kullanmak için $env:S39_WORD="1"');
  }

  // ------------------------------------------------------------ son
  await pencereKapat();
  await sekmeleriKapat();
  await evalJs(`(async () => { delete window.__pdefeYerelKutu; for (const [k, v] of Object.entries({ ciktiKlasoru: '', donusturme: {} })) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; } return true; })()`);
  const hatalar = await evalJs(`window.__s39Hatalar || []`);
  sonuc('Renderer konsolunda hata yok', hatalar.length === 0, hatalar);
  console.log(`\n${denetim} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}  (ekran görüntüleri: ${PNG})`);
  if (hataSayisi) process.exitCode = 1;
}
