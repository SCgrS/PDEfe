// Senaryo 40 (0.2.7, bağımsız incelemenin bulguları; arayüz ve ana süreç):
//   1) "Zaten var" sorusunun "Yeni belge olarak kaydet"i adı "(1)"e çevirir ama bu ad elle yazılmış sayılmaz: Format Değiştir'de dönüştürme
//      → ayar değişir → "A.tif zaten var" → Yeni belge ("A (1).tif") → Listeyi temizle → B.pdf: ad kutusu "B", hedef "B.tif" (önceden "A (1)"
//      kalıyor, B "A (2).tif" adıyla kaydediliyordu). Kullanıcının kendi yazdığı ad ise (0.2.6'daki gibi) girdi değişince de kalır.
// Girdiler bu betikte üretilir (Python, proje .venv; gerçek belge yok): test/cikti/s40/girdi; çıktılar test/cikti/s40/<bölüm>-<koşum>.
// Kullanım (görünmeyen masaüstü):
//   powershell -ExecutionPolicy Bypass -File test\baslat_gizli.ps1 -Port 9440 -Veri "$env:TEMP\pdefe-s40-9440" -Boyut "1280,1000"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9440; node test\surucu.mjs betik test\senaryo40.mjs
//   powershell -ExecutionPolicy Bypass -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1".
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

  // ------------------------------------------------------------ son
  await ayarla({ ciktiKlasoru: '', donusturme: {} });
  const hatalar = await evalJs('window.__s40Hatalar || []');
  sonuc('Renderer konsolunda hata yok', !hatalar.length, hatalar);
  console.log(`\n${denetim} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}`);
  if (hataSayisi) process.exitCode = 1;
}
