// Senaryo 40 (0.2.7, bağımsız incelemenin bulguları; arayüz ve ana süreç):
//   1) "Zaten var" sorusunun "Yeni belge olarak kaydet"i adı "(1)"e çevirir ama bu ad elle yazılmış sayılmaz: Format Değiştir'de dönüştürme
//      → ayar değişir → "A.tif zaten var" → Yeni belge ("A (1).tif") → Listeyi temizle → B.pdf: ad kutusu "B", hedef "B.tif" (önceden "A (1)"
//      kalıyor, B "A (2).tif" adıyla kaydediliyordu). Kullanıcının kendi yazdığı ad ise (0.2.6'daki gibi) girdi değişince de kalır.
//   2) Birleştir, UYAP Doküman Editörü yokken (PDEFE_UDE_YOK=1): açık PDF + UDF (yaklaşık çizim), "Üzerine yaz": PDF birleşik hâliyle yazılır,
//      sekmesi yeni hâliyle açılır (önceden "Kaydedilecek dosya, birleştirilen dosyalardan biri olamaz" hatasıyla hiç çalışmıyordu).
//   3) PDF → JPG, tek girdi, sayfa sayısı bilinmiyor (Word / ön izlemesi gelmemiş UDF satırının durumu): klasörde yalnızca "<ad> - Sayfa 2.jpg"
//      ve "Sayfa 3" varken (sınanan adlar "<ad>.jpg", "Sayfa 1" yok) onlar ezilmez: çekirdek ilk boş "(1)" adını seçer, sonuçta not
//      (önceden soru çıkmadan üzerlerine yazılıyordu).
//   4) PDF → JPG, önceki daha uzun dönüştürmeden kalan sayfa: 3 sayfalık "Dilekce" → JPG, sonra aynı adlı 2 sayfalık belge → "zaten var"
//      sorusu "Sayfa 3"ün kalacağını söyler; Üzerine yaz: Sayfa 1 ve 2 yenilenir, Sayfa 3 silinmez, sonuçta not (önceden hiç söylenmiyordu).
// Girdiler bu betikte üretilir (Python, proje .venv; gerçek belge yok): test/cikti/s40/girdi; çıktılar test/cikti/s40/<bölüm>-<koşum>.
// Kullanım (görünmeyen masaüstü; 2. bölüm için editör yok benzetimi):
//   $env:PDEFE_UDE_YOK="1"; powershell -ExecutionPolicy Bypass -File test\baslat_gizli.ps1 -Port 9440 -Veri "$env:TEMP\pdefe-s40-9440" -Boyut "1280,1000"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9440; node test\surucu.mjs betik test\senaryo40.mjs
//   powershell -ExecutionPolicy Bypass -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,4".
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's40');
const GIRDI = path.join(UI, 'girdi');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const atlandi = (ad, neden) => console.log(`ATLANDI ${ad} — ${neden}`);
/** Bu koşum için boş çıktı klasörü (eski koşumların dosyaları test örneğinde açık kalabilir, silinmez). */
const KOSUM = Date.now().toString(36);
const yeniKlasor = (ad) => { const k = path.join(UI, `${ad}-${KOSUM}`); fs.mkdirSync(k, { recursive: true }); return k; };

/** Python (proje .venv) çalıştırır; son satırı JSON olarak döner. test/ klasörü içe aktarma yolunda (donustur_testi'nin üreticileri). */
function py(kod) {
  const on = `import sys, json, os\nsys.path.insert(0, ${J(path.join(KOK, 'test'))})\nimport pymupdf\n`;
  const cikti = execFileSync(PY, ['-X', 'utf8', '-c', on + kod], { encoding: 'utf8' });
  return JSON.parse(cikti.trim().split(/\r?\n/).pop());
}
/** Sentetik metinli PDF (donustur_testi.sentetik_pdf): n sayfa. */
const pdfUret = (yol, n = 1, tohum = 7) => py(`import donustur_testi as dt\nprint(json.dumps(dt.sentetik_pdf(${J(yol)}, sayfa=${n}, tohum=${tohum})))`);

export default async function ({ evalJs, bekle }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await evalJs(ifade); } catch { v = null; }
      if (v || Date.now() - t0 > sure) return v;
      await bekle(120);
    }
  };
  fs.mkdirSync(GIRDI, { recursive: true });
  await evalJs(`(async () => {
    window.__s40 = { d: await import('pdefe://app/src/renderer/araclar/donustur.js'), o: await import('pdefe://app/src/renderer/araclar/ortak.js'),
      b: await import('pdefe://app/src/renderer/araclar/gorselBirlestir.js') };
    if (!window.__s40Hatalar) {
      window.__s40Hatalar = [];
      addEventListener('error', (e) => window.__s40Hatalar.push('error: ' + e.message));
      addEventListener('unhandledrejection', (e) => window.__s40Hatalar.push('reject: ' + (e.reason?.message || e.reason)));
      window.__s40Bildirim = [];
      new MutationObserver(() => { const t = document.querySelector('#bildirim')?.textContent; if (t && window.__s40Bildirim.at(-1) !== t) window.__s40Bildirim.push(t); })
        .observe(document.querySelector('#bildirim'), { childList: true, characterData: true, subtree: true });
    }
    return true; })()`);
  const ayarla = (o) => evalJs(`(async () => { for (const [k, v] of Object.entries(${J(o)})) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; } return true; })()`);
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const araclariKapat = () => evalJs(`(async () => { const eski = window.__pdefeOtoYanit; window.__pdefeOtoYanit = { secim: 0 }; try { if (window.__s40.o.acikAracPenceresiVar()) await window.__s40.o.aracPencereleriniKapat(); } finally { window.__pdefeOtoYanit = eski; } return true; })()`);
  const D = 'window.__s40.d.acikDonusturPenceresi()';
  /** Format Değiştir'i dosyalarla açar, satırlar okunana dek bekler. */
  const donusturAc = async (yollar) => {
    await evalJs(`(window.__pdefe.komutCalistir('arac.donustur', ${J(yollar)}), true)`);
    await kosul(`!!${D} && ${D}.ogeler.length === ${yollar.length} && !${D}.ogeler.some((o) => o.yukleniyor)`, 20000);
    await evalJs(`${D}.kayit.hazir.then(() => true)`);
    await bekle(300);
  };
  /** Listeyi temizler, dosyaları ekler, okunmalarını ve önerilen adı bekler. */
  const listeyiDegistir = async (yollar) => {
    await evalJs(`(() => { document.querySelector('.donustur-pencere .donustur-temizle').click(); ${D}.dosyaEkle(${J(yollar)}); return true; })()`);
    await kosul(`${D}.ogeler.length === ${yollar.length} && !${D}.ogeler.some((o) => o.yukleniyor)`, 20000);
    await bekle(200);
    await evalJs(`${D}.kayit.hazir.then(() => true)`);
  };
  const adKutusu = () => evalJs(`document.querySelector('.donustur-pencere .arac-kayit-yeni .arac-cikti-ad').value`);
  /** Dönüştür'e basar (soru varsa secim ile yanıtlanır); sonuç gelene dek bekler. Döner: sorunun iletisi (yoksa null). */
  const donustur = async (secim = 1) => {
    await evalJs(`(() => { window.__s40Oto = window.__pdefeOtoYanit = { secim: ${secim} }; const s = document.querySelector('.donustur-sonuc'); if (s) s.hidden = true; ${D}.donustur(); return true; })()`);
    await kosul(`!${D} || !document.querySelector('.donustur-sonuc')?.hidden || !!document.querySelector('.donustur-pencere .arac-hata:not(:empty)')`, 90000);
    await kosul(`!${D} || !${D}._suruyor`, 10000);
    return evalJs(`(() => { delete window.__pdefeOtoYanit; const o = window.__s40Oto; return o?.son ? { mesaj: o.son.mesaj, ayrinti: o.son.ayrinti } : null; })()`);
  };
  const dosyalar = (k) => fs.readdirSync(k).filter((a) => !/pdefe-tmp/i.test(a)).sort();

  // ------------------------------------------------------------ 1) "Yeni belge olarak kaydet"in "(1)" adı elle yazılmış sayılmaz
  if (bolum(1)) {
    console.log('\n== 1) "(1)" adı sonraki girdide kalmaz');
    await araclariKapat(); await sekmeleriKapat();
    const k = yeniKlasor('ad');
    const A = path.join(GIRDI, 'A.pdf'), B = path.join(GIRDI, 'B.pdf'), C = path.join(GIRDI, 'C.pdf');
    pdfUret(A, 1, 3); pdfUret(B, 1, 5); pdfUret(C, 1, 9);
    await ayarla({ ciktiKlasoru: k, otomatikKaydet: false, donusturme: { hedefler: { pdf: 'tiff' } } });
    await donusturAc([A]);
    sonuc('1) Önerilen ad "A", hedef A.tif', (await adKutusu()) === 'A' && path.basename(await evalJs(`${D}.kayit.hedef()`)) === 'A.tif', await adKutusu());
    let soru = await donustur();
    sonuc('1) İlk dönüştürme: soru yok, A.tif yazıldı', !soru && dosyalar(k).includes('A.tif'), { soru, dosyalar: dosyalar(k) });
    // Bir ayar değişir (Düşük), yeniden: "A.tif zaten var" → Yeni belge olarak kaydet (Enter'daki varsayılan)
    await evalJs(`(${D}.dpiSecim.dugme('200').click(), true)`);
    soru = await donustur(1);
    sonuc('1) Ayar değişince yeniden: "A.tif zaten var" sorusu, Yeni belge → "A (1).tif" yazıldı, ad kutusunda "A (1)"', soru?.mesaj === '"A.tif" zaten var.'
      && dosyalar(k).includes('A (1).tif') && (await adKutusu()) === 'A (1)', { soru, dosyalar: dosyalar(k), ad: await adKutusu() });
    // Listeyi temizle, B: ad kutusu girdinin adını önerir
    await listeyiDegistir([B]);
    const hedefB = await evalJs(`${D}.kayit.hedef()`);
    sonuc('1) Listeyi temizle → B.pdf: ad kutusunda "B", hedef B.tif ("A (1)" kalmaz)', (await adKutusu()) === 'B' && path.resolve(hedefB) === path.resolve(path.join(k, 'B.tif')),
      { ad: await adKutusu(), hedef: hedefB });
    const onceA1 = fs.statSync(path.join(k, 'A (1).tif')).size;
    soru = await donustur(1);
    sonuc('1) B dönüştürülür: soru yok, "B.tif" yazıldı, A\'nın dosyaları değişmedi', !soru && dosyalar(k).includes('B.tif') && !dosyalar(k).includes('A (2).tif')
      && fs.statSync(path.join(k, 'A (1).tif')).size === onceA1, { soru, dosyalar: dosyalar(k) });
    // Kullanıcının kendi yazdığı ad: "zaten var"da Yeni belge "(1)" ekler, girdi değişince de kullanıcının adı kalır (0.2.6'daki gibi)
    await evalJs(`(() => { const e = document.querySelector('.donustur-pencere .arac-kayit-yeni .arac-cikti-ad'); e.value = 'Özel ad'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('blur')); return true; })()`);
    fs.writeFileSync(path.join(k, 'Özel ad.tif'), 'eski');
    soru = await donustur(1);
    sonuc('1) Elle yazılan "Özel ad" var: Yeni belge → "Özel ad (1).tif", eski dosya değişmedi', soru?.mesaj === '"Özel ad.tif" zaten var.' && dosyalar(k).includes('Özel ad (1).tif')
      && fs.readFileSync(path.join(k, 'Özel ad.tif'), 'utf8') === 'eski', { soru, dosyalar: dosyalar(k) });
    await listeyiDegistir([C]);
    sonuc('1) Elle yazılan ad girdi değişince kalır ("Özel ad (1)")', (await adKutusu()) === 'Özel ad (1)', await adKutusu());
    await evalJs(`(${D}.dpiSecim.dugme('300').click(), true)`);   // İdeal'e geri (seçim modülde kalır)
    await araclariKapat(); await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 2) Birleştir: editör yokken UDF + "Üzerine yaz"
  if (bolum(2)) {
    console.log('\n== 2) Birleştir: UYAP Doküman Editörü yokken UDF + "Üzerine yaz"');
    const YET = await evalJs(`window.pdefe.cagir('cekirdek:cagir', 'donusum_yetenekleri', {}, null)`);
    if (YET?.udf?.var !== false) atlandi('2) Birleştir, editör yokken', 'UYAP Doküman Editörü bulundu: test örneğini $env:PDEFE_UDE_YOK="1" ile başlatın');
    else {
      await araclariKapat(); await sekmeleriKapat();
      const k = yeniKlasor('birlestir');
      const acik = path.join(k, 'Açık belge.pdf');
      pdfUret(acik, 2, 11);
      const udf = py(`import udf_donusum_testi as ut
u = ut.UdfYaz()
u.paragraf("DENEME DİLEKÇESİ", hiza=1, kalin=True)
u.paragraf(ut.cumleler(1, 2))
print(json.dumps(u.yaz(${J(path.join(GIRDI, 'Dilekçe.udf'))})))`);
      await ayarla({ ciktiKlasoru: k, otomatikKaydet: false, udeYolu: null });
      await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(acik)}); return true; })()`);
      await kosul(`window.__pdefe.aktif()?.yol === ${J(acik)} && window.__pdefe.aktif()?.gorunum?.sayfaSayisi === 2`, 15000);
      const B = 'window.__s40.b.acikBirlestirmePenceresi()';
      await evalJs(`(window.__pdefe.komutCalistir('arac.gorselBirlestir'), true)`);
      await kosul(`!!${B}`, 10000);
      await evalJs(`(${B}.dosyaEkle(${J([udf])}), true)`);
      await kosul(`${B}.ogeler.length === 2 && ${B}.ogeler.every((o) => !o.yukleniyor) && !${B}.ogeler.some((o) => o.onizleniyor)`, 30000);
      await bekle(400);
      const satirlar = await evalJs(`${B}.ogeler.map((o) => ({ ad: o.ad, tur: o.tur, yaklasik: !!o.yaklasik, hata: o.hata || null }))`);
      await evalJs(`(${B}.kayit.kipAyarla('uzerine'), true)`);
      const uzerine = await evalJs(`${B}.kayit.uzerineMi()`);
      sonuc('2) Satırlar: açık PDF ve yaklaşık çizilecek UDF; "Üzerine yaz" seçili', satirlar.length === 2 && satirlar[0].tur === 'pdf' && satirlar[1].tur === 'udf' && satirlar[1].yaklasik && uzerine,
        { satirlar, uzerine });
      await evalJs(`(window.__s40Bildirim.length = 0, true)`);
      await evalJs(`(() => { window.__pdefeOtoYanit = { secim: 0 }; ${B}.birlestir(); return true; })()`);
      await kosul(`!${B} || !!document.querySelector('.birlestir-pencere .arac-hata:not(:empty)')`, 90000);
      await bekle(800);
      await evalJs(`(delete window.__pdefeOtoYanit, true)`);
      const hata = await evalJs(`document.querySelector('.birlestir-pencere .arac-hata')?.textContent || null`);
      const sayfa = py(`print(json.dumps([" ".join(p.get_text().split())[:40] for p in pymupdf.open(${J(acik)})]))`);
      await kosul(`window.__pdefe.aktif()?.yol === ${J(acik)} && window.__pdefe.aktif()?.gorunum?.sayfaSayisi === ${sayfa.length}`, 15000);
      const sekme = await evalJs(`({ yol: window.__pdefe.aktif()?.yol, sayfa: window.__pdefe.aktif()?.gorunum?.sayfaSayisi, sekme: window.__pdefe.belgeler.size })`);
      const bildirim = await evalJs(`window.__s40Bildirim.slice()`);
      sonuc('2) Birleştirme başarılı: hata yok, pencere kapandı', !hata && !(await evalJs(`!!${B}`)), hata);
      sonuc('2) Açık PDF birleşik hâliyle yazıldı (2 + UDF sayfası; ilk sayfalar PDF\'in, sonra UDF\'nin metni)', sayfa.length >= 3 && /DENEME D/.test(sayfa[2] || ''), sayfa);
      sonuc('2) Sekme yeni hâliyle yeniden açıldı (aynı sekme, yeni sayfa sayısı)', path.resolve(sekme.yol || '') === path.resolve(acik) && sekme.sayfa === sayfa.length && sekme.sekme === 1, sekme);
      sonuc('2) Bildirim "Birleştirildi ve üzerine yazıldı", UDF\'nin adıyla "görünüm yaklaşık"', bildirim.some((b) => /^Birleştirildi ve üzerine yazıldı: Açık belge\.pdf/.test(b)
        && /Dilekçe\.udf: UYAP Doküman Editörü bulunamadı; görünüm yaklaşık/.test(b)), bildirim);
      await araclariKapat(); await sekmeleriKapat();
    }
  }

  /** Sonuç kutusunun satırları: [{ ad, uyari }] */
  const sonucSatirlari = () => evalJs(`[...document.querySelectorAll('.donustur-sonuc li')].map((e) => ({ ad: e.querySelector('.ad')?.textContent, uyari: e.querySelector('.uyari-metin')?.textContent || '' }))`);

  // ------------------------------------------------------------ 3) JPG: sayfa sayısı bilinmezken var olan "Sayfa n" dosyaları ezilmez
  if (bolum(3)) {
    console.log('\n== 3) JPG: sayfa sayısı bilinmiyor, yalnızca "Sayfa 2" ve "Sayfa 3" var');
    await araclariKapat(); await sekmeleriKapat();
    const k = yeniKlasor('jpg-bilinmeyen');
    const W = path.join(GIRDI, 'W.pdf');
    pdfUret(W, 3, 13);
    await ayarla({ ciktiKlasoru: k, otomatikKaydet: false, donusturme: { hedefler: { pdf: 'gorsel' } } });
    await donusturAc([W]);
    // Word satırında olduğu gibi sayfa sayısı yok (çekirdeğin donusum_bilgi'si Word'de sayfa vermez)
    await evalJs(`(() => { const p = ${D}; p.ogeler[0].sayfa = null; p._durumGuncelle(); return true; })()`);
    for (const n of [2, 3]) fs.writeFileSync(path.join(k, `W - Sayfa ${n}.jpg`), 'ESKI DOSYA ' + n);
    const soru = await donustur(1);
    const d = dosyalar(k);
    sonuc('3) Var olan "W - Sayfa 2.jpg" ve "Sayfa 3" değişmedi, "W - Sayfa 1.jpg" yazılmadı', [2, 3].every((n) => fs.readFileSync(path.join(k, `W - Sayfa ${n}.jpg`), 'utf8') === 'ESKI DOSYA ' + n)
      && !d.includes('W - Sayfa 1.jpg'), { soru, dosyalar: d });
    sonuc('3) Sayfalar ilk boş "(1)" adıyla yazıldı', [1, 2, 3].every((n) => d.includes(`W (1) - Sayfa ${n}.jpg`)), d);
    const satirlar = await sonucSatirlari();
    sonuc('3) Sonuçta yazılan adlar ve "yeni adla kaydedildi" notu', J(satirlar.map((x) => x.ad)) === J([1, 2, 3].map((n) => `W (1) - Sayfa ${n}.jpg`)) && /yeni adla kaydedildi/.test(satirlar[0]?.uyari || ''),
      satirlar);
    await araclariKapat(); await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 4) JPG "Üzerine yaz": önceki dönüştürmeden kalan sayfa söylenir
  if (bolum(4)) {
    console.log('\n== 4) JPG: önceki daha uzun dönüştürmeden kalan sayfa');
    await araclariKapat(); await sekmeleriKapat();
    const k = yeniKlasor('jpg-kalan');
    const uc = path.join(GIRDI, 'uc', 'Dilekce.pdf'), iki = path.join(GIRDI, 'iki', 'Dilekce.pdf');
    fs.mkdirSync(path.dirname(uc), { recursive: true }); fs.mkdirSync(path.dirname(iki), { recursive: true });
    pdfUret(uc, 3, 31); pdfUret(iki, 2, 32);
    await ayarla({ ciktiKlasoru: k, otomatikKaydet: false, donusturme: { hedefler: { pdf: 'gorsel' } } });
    await donusturAc([uc]);
    let soru = await donustur(1);
    sonuc('4) 3 sayfalık belge → "Dilekce - Sayfa 1..3.jpg"', !soru && [1, 2, 3].every((n) => dosyalar(k).includes(`Dilekce - Sayfa ${n}.jpg`)), { soru, dosyalar: dosyalar(k) });
    const ucuncu = path.join(k, 'Dilekce - Sayfa 3.jpg');
    const once = fs.readFileSync(ucuncu);
    const birinciOnce = fs.readFileSync(path.join(k, 'Dilekce - Sayfa 1.jpg'));
    await listeyiDegistir([iki]);
    soru = await donustur(0);   // Üzerine yaz
    sonuc('4) Aynı adlı 2 sayfalık belge: "zaten var" sorusu kalan "Dilekce - Sayfa 3.jpg"ü ve silinmeyeceğini söyler',
      /zaten var\.$/.test(soru?.mesaj || '') && (soru?.ayrinti || '').includes('Klasörde önceki bir dönüştürmeden kalan "Dilekce - Sayfa 3.jpg" dosyası da var.')
      && (soru?.ayrinti || '').includes('Bu belge 2 sayfa; üzerine yazılırsa o dosya silinmez'), soru);
    sonuc('4) Üzerine yaz: Sayfa 1 ve 2 yenilendi, önceki Sayfa 3 değişmedi', !fs.readFileSync(path.join(k, 'Dilekce - Sayfa 1.jpg')).equals(birinciOnce)
      && fs.readFileSync(ucuncu).equals(once), dosyalar(k));
    const satirlar = await sonucSatirlari();
    sonuc('4) Sonuçta iki satır, ilkinde kalan sayfanın notu', J(satirlar.map((x) => x.ad)) === J(['Dilekce - Sayfa 1.jpg', 'Dilekce - Sayfa 2.jpg'])
      && /Önceki bir dönüştürmeden kalan "Dilekce - Sayfa 3\.jpg" klasörde duruyor/.test(satirlar[0]?.uyari || ''), satirlar);
    await araclariKapat(); await sekmeleriKapat();
  }

  // ------------------------------------------------------------ son
  await ayarla({ ciktiKlasoru: '', donusturme: {} });
  const hatalar = await evalJs('window.__s40Hatalar || []');
  sonuc('Renderer konsolunda hata yok', !hatalar.length, hatalar);
  console.log(`\n${denetim} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}`);
  if (hataSayisi) process.exitCode = 1;
}
