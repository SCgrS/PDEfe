// Senaryo 38 (0.2.7, kullanıcı istekleri; çekirdekten bağımsız arayüz maddeleri):
//   1) Yazdırma penceresinin alt satırı: Yazdır ve Vazgeç aynı yükseklik ve genişlikte, üst boşluksuz; Windows yazdırma penceresi bağlantısı
//      ve iki düğme aynı dikey hizada; düğmeler mesaj kutusunun düğmeleriyle aynı ölçüde. Ön izleme gezinmesi (◀ n / N ▶) ve "N sayfa" ön
//      izleme alanının ortasında, okların sayıya uzaklığı eşit. Açık ve koyu temada (ekran ölçeği baslat.ps1 -Olcek ile: 1 ve 1.25).
//      Yazdırma penceresi için sahte yazıcılar: $env:PDEFE_TEST_YAZICILAR = "1".
// Girdiler test/ornek_pdf_uret.py ile test/cikti/s38/girdi altında üretilir (gerçek belge yok).
// Kullanım:
//   $env:PDEFE_TEST_YAZICILAR = "1"; powershell -File test\baslat.ps1 -Port 9438 -Veri "$env:TEMP\pdefe-s38-9438" -Boyut "1280,1000" [-Olcek 1.25]
//   $env:PDEFE_CDP_PORT=9438; node test\surucu.mjs betik test\senaryo38.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1". Ekran görüntüleri test/cikti/s38/png altına.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's38');
const GIRDI = path.join(UI, 'girdi');
const PNG = path.join(UI, 'png');
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
const yakin = (a, b, pay = 0.5) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= pay;

/** Örnek PDF (sayfa sayısı, başlık); var olanı yeniden üretmez. */
function ornekPdf(ad, sayfa = 2, baslik = 'Deneme belgesi') {
  const yol = path.join(GIRDI, ad);
  if (!fs.existsSync(yol)) execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yol, String(sayfa), baslik], { encoding: 'utf8' });
  return yol;
}

/** Sayfada: öğenin kutusu (CSS px) ve hesaplanmış birkaç stil. */
const KUTU = `window.__s38kutu = (e) => { if (typeof e === 'string') e = document.querySelector(e); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return { sol: r.left, sag: r.right, ust: r.top, alt: r.bottom, w: r.width, h: r.height, ortaX: r.left + r.width / 2, ortaY: r.top + r.height / 2,
    ustBosluk: cs.marginTop, kenarRengi: cs.borderTopColor, kenarKalinligi: cs.borderTopWidth, zemin: cs.backgroundColor }; }; true`;

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await evalJs(ifade); } catch { v = null; }
      if (v || Date.now() - t0 > sure) return v;
      await bekle(120);
    }
  };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  fs.mkdirSync(GIRDI, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  await evalJs(KUTU);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const olcek = await evalJs('devicePixelRatio');
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  // Görünüm › Koyu tema komutu açık ↔ koyu arasında geçer
  // Araçların çıktı klasörü test klasörü (Masaüstüne hiçbir şey yazılmaz)
  const ciktiKlasoruAyarla = (k) => evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'ciktiKlasoru', ${J(k)}); window.__pdefe.ayar().ciktiKlasoru = ${J(k)}; return true; })()`);
  const araclariKapat = () => evalJs(`(async () => { const eski = window.__pdefeOtoYanit; window.__pdefeOtoYanit = { secim: 0 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); } finally { window.__pdefeOtoYanit = eski; } return true; })()`);
  fs.mkdirSync(path.join(UI, 'cikti'), { recursive: true });
  await ciktiKlasoruAyarla(path.join(UI, 'cikti'));
  const temaAyarla = async (tema) => { if ((await evalJs('document.documentElement.dataset.tema')) !== tema) await evalJs(`(window.__pdefe.komutCalistir('gorunum.tema'), true)`); await bekle(300); return evalJs('document.documentElement.dataset.tema'); };

  // ------------------------------------------------------------ 1) Yazdırma penceresinin alt satırı ve ön izleme gezinmesi
  if (bolum(1)) {
    console.log(`\n== 1) Yazdırma penceresi: düğmeler ve gezinme (ölçek ${olcek})`);
    const yazicilar = await evalJs(`window.pdefe.cagir('yazdir:yazicilar').then((r) => (r?.yazicilar || []).length).catch(() => -1)`);
    if (yazicilar <= 0) console.log('ATLANDI 1) — sahte yazıcı yok: örneği $env:PDEFE_TEST_YAZICILAR = "1" ile başlatın');
    else {
      await sekmeleriKapat();
      const pdf = ornekPdf('yazdir.pdf', 3, 'Yazdırma örneği');
      await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(pdf)}); return true; })()`);
      await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
      // Mesaj kutusunun düğmeleri (karşılaştırma ölçüsü)
      await evalJs(`(window.__s38mk = window.__pdefe.mesajKutusu({ mesaj: 'Ölçü', dugmeler: ['Tamam', 'Vazgeç'], varsayilan: 0, iptal: 1 }), true)`);
      await kosul(`!!document.querySelector('.mesaj-kutusu .dugmeler button')`);
      const mk = await evalJs(`[...document.querySelectorAll('.mesaj-kutusu .dugmeler button')].map((b) => window.__s38kutu(b))`);
      await evalJs(`(document.querySelectorAll('.mesaj-kutusu .dugmeler button')[1].click(), true)`);
      await kosul(`!document.querySelector('.mesaj-kutusu')`);
      for (const tema of ['acik', 'koyu']) {
        sonuc(`[${tema}] Tema uygulandı`, (await temaAyarla(tema)) === tema);
        await evalJs(`(window.__pdefe.komutCalistir('dosya.yazdir'), true)`);
        await kosul(`!!document.querySelector('.yazdir-diyalog') && !document.querySelector('.yazdir-diyalog [name="yazici"]').disabled`, 8000);
        await kosul(`(() => { const g = document.querySelector('.yazdir-onizleme-sayfa'); return g && g.naturalWidth > 0 && !g.classList.contains('yukleniyor'); })()`, 10000);
        await bekle(400);
        const d = await evalJs(`(() => { const k = window.__s38kutu, q = (s) => document.querySelector('.yazdir-diyalog ' + s);
          return { yazdir: k(q('[data-id="yazdir"]')), iptal: k(q('[data-id="iptal"]')), sistem: k(q('[data-id="sistem"]')), alan: k(q('.yazdir-onizleme-alan')),
            onceki: k(q('[data-id="onceki"]')), no: k(q('.yazdir-sayfa-no')), sonraki: k(q('[data-id="sonraki"]')), ozet: k(q('.yazdir-ozet')),
            noMetin: q('.yazdir-sayfa-no').textContent, ozetMetin: q('.yazdir-ozet').textContent }; })()`);
        await ss(`01-yazdir-${tema}-${String(olcek).replace('.', '_')}`);
        const t = `[${tema}, ${olcek}] `;
        sonuc(t + '1) Yazdır ve Vazgeç aynı yükseklik ve genişlikte', yakin(d.yazdir.h, d.iptal.h) && yakin(d.yazdir.w, d.iptal.w), { yazdir: [d.yazdir.w, d.yazdir.h], iptal: [d.iptal.w, d.iptal.h] });
        sonuc(t + '1) Yazdır üst boşluksuz, iki düğme aynı satır hizasında (üst ve alt kenar)', d.yazdir.ustBosluk === '0px' && yakin(d.yazdir.ust, d.iptal.ust) && yakin(d.yazdir.alt, d.iptal.alt), { yazdir: d.yazdir, iptal: d.iptal });
        sonuc(t + '1) Windows yazdırma penceresi bağlantısı düğmelerle aynı dikey hizada', yakin(d.sistem.ortaY, d.yazdir.ortaY, 1), { sistem: d.sistem.ortaY, yazdir: d.yazdir.ortaY });
        sonuc(t + '1) Düğmeler mesaj kutusunun düğmeleriyle aynı ölçüde', yakin(d.yazdir.h, mk[0].h) && yakin(d.iptal.h, mk[1].h) && yakin(d.yazdir.w, mk[0].w, 1), { yazdir: [d.yazdir.w, d.yazdir.h], mesajKutusu: mk.map((x) => [x.w, x.h]) });
        sonuc(t + '1) Vazgeç\'in kenarı görünür, Yazdır\'ınki saydam (ölçü aynı)', parseFloat(d.iptal.kenarKalinligi) > 0 && d.yazdir.kenarKalinligi === d.iptal.kenarKalinligi && d.iptal.kenarRengi !== d.iptal.zemin && /rgba\(0, 0, 0, 0\)|transparent/.test(d.yazdir.kenarRengi), { iptal: [d.iptal.kenarRengi, d.iptal.zemin], yazdir: d.yazdir.kenarRengi });
        const gezinmeOrta = (d.onceki.sol + d.sonraki.sag) / 2;
        sonuc(t + '1) Ön izleme gezinmesi (◀ n / N ▶) ön izleme alanının ortasında', yakin(gezinmeOrta, d.alan.ortaX, 1) && yakin(d.no.ortaX, d.alan.ortaX, 1), { gezinmeOrta, no: d.no.ortaX, alan: d.alan.ortaX });
        sonuc(t + '1) Okların sayfa numarasına uzaklığı eşit', yakin(d.no.sol - d.onceki.sag, d.sonraki.sol - d.no.sag), [d.no.sol - d.onceki.sag, d.sonraki.sol - d.no.sag]);
        sonuc(t + '1) "N sayfa" özeti ön izleme alanının ortasında, gezinmenin altında', yakin(d.ozet.ortaX, d.alan.ortaX, 1) && d.ozet.ust >= d.onceki.alt && d.noMetin === '1 / 3' && d.ozetMetin === '3 sayfa', { ozet: d.ozet.ortaX, alan: d.alan.ortaX, no: d.noMetin, ozetMetin: d.ozetMetin });
        await evalJs(`(document.querySelector('.yazdir-diyalog [data-id="iptal"]').click(), true)`);
        await kosul(`!document.querySelector('.yazdir-ortusu')`);
      }
      await sekmeleriKapat();
    }
  }

  // ------------------------------------------------------------ 2) Sonuç kutuları (Format Değiştir, Ayır)
  if (bolum(2)) {
    console.log('\n== 2) Sonuç kutuları: tek dosyada ortalı, birden çok dosyada Aç sabit sütunda, boyut ve sayfa yok');
    await araclariKapat(); await sekmeleriKapat();
    const pdf = ornekPdf('sonuc.pdf', 4, 'Sonuç örneği');
    await evalJs(`(window.__s38m = window.__s38m || {}, true)`);
    await evalJs(`(async () => { window.__s38m.d = await import('pdefe://app/src/renderer/araclar/donustur.js'); return true; })()`);
    const A = 'window.__s38m.d.acikDonusturPenceresi()';
    await evalJs(`(window.__pdefe.komutCalistir('arac.donustur', [${J(pdf)}]), true)`);
    await kosul(`!!${A} && ${A}.ogeler.length === 1 && !${A}.ogeler[0].yukleniyor`, 15000);
    const klasor = GIRDI;
    const kutu = () => evalJs(`(() => { const s = document.querySelector('.donustur-sonuc'); if (!s || s.hidden) return null; const k = window.__s38kutu;
      const satirlar = [...s.querySelectorAll('li')].map((li) => { const ad = li.querySelector('.ad'), ac = li.querySelector('[data-ac]');
        return { ad: ad.textContent, adKutu: k(ad), kisaldi: ad.scrollWidth > ad.clientWidth + 1, ac: ac ? k(ac) : null, acSutun: k(li.querySelector('.ac-sutun')), uyari: li.querySelector('.uyari-metin')?.textContent || '', uyariKutu: k(li.querySelector('.uyari-metin')), hata: li.querySelector('.hata-metin')?.textContent || '' }; });
      const baslik = s.querySelector('.arac-sonuc-baslik'), dugme = s.querySelector('.donustur-goster');
      const baslikMetin = document.createRange(); baslikMetin.selectNodeContents(baslik); const bm = baslikMetin.getBoundingClientRect();
      const adMetin = s.querySelector('li .ad'); const am = adMetin ? (() => { const r = document.createRange(); r.selectNodeContents(adMetin); return r.getBoundingClientRect(); })() : null;
      return { metin: s.innerText, sinif: s.className, kutu: k(s), baslikOrtaX: bm.left + bm.width / 2, adOrtaX: am ? am.left + am.width / 2 : null, dugme: dugme && k(dugme), satirlar,
        hizalama: getComputedStyle(s).textAlign }; })()`);
    // Tek dosya (PDF olmayan çıktı; görüntüdeki gibi Word)
    await evalJs(`(async () => { const p = ${A}; await p._sonucGoster([{ yol: ${J(pdf)}, hedef: ${J(path.join(klasor, 'Birleştirilmiş (2).docx'))}, hedefBicim: 'word', boyut: 120832, sayfa: 4 }], { tek: true }); return true; })()`);
    let s = await kutu();
    await ss('02-tek-sonuc');
    sonuc('2) Tek dosya: başlık "Dosya dönüştürüldü", ad ve Klasörde göster; boyut ve sayfa sayısı yok', !!s && /^Dosya dönüştürüldü\s*$/m.test(s.metin) && s.satirlar.length === 1 && s.satirlar[0].ad === 'Birleştirilmiş (2).docx'
      && !!s.dugme && !/KB|MB|sayfa/.test(s.metin), s);
    sonuc('2) Tek dosya: başlık, dosya adı ve düğme kutunun ortasında', !!s && s.hizalama === 'center' && yakin(s.baslikOrtaX, s.kutu.ortaX, 1.5) && yakin(s.adOrtaX, s.kutu.ortaX, 1.5) && yakin(s.dugme.ortaX, s.kutu.ortaX, 1.5),
      s && { kutu: s.kutu.ortaX, baslik: s.baslikOrtaX, ad: s.adOrtaX, dugme: s.dugme?.ortaX });
    // Birden çok dosya: kısa ve uzun adlar, PDF olmayan çıktı (Aç yok), uyarılı ve hatalı satır
    const uzun = 'Çok uzun bir dosya adı ' + 'uzun '.repeat(30) + 'son.pdf';
    const coklu = [
      { yol: pdf, hedef: path.join(klasor, 'a.pdf'), hedefBicim: 'pdf', boyut: 1000, sayfa: 1 },
      { yol: pdf, hedef: path.join(klasor, 'Orta uzunlukta bir ad.pdf'), hedefBicim: 'pdf', boyut: 125952, sayfa: 3, uyari: 'Belgedeki bir ayrıntı aktarılmadı.' },
      { yol: pdf, hedef: path.join(klasor, uzun), hedefBicim: 'pdf', boyut: 2048, sayfa: 2 },
      { yol: pdf, hedef: path.join(klasor, 'Dilekçe.udf'), hedefBicim: 'udf', boyut: 4096 },
      { yol: path.join(klasor, 'Bozuk.tif'), hedef: path.join(klasor, 'Bozuk.pdf'), hedefBicim: 'pdf', hata: 'Dosya açılamadı.', kod: 'hata' },
    ];
    await evalJs(`(async () => { await ${A}._sonucGoster(${J(coklu)}, { tek: false }); return true; })()`);
    s = await kutu();
    await ss('02-coklu-sonuc');
    const acler = s ? s.satirlar.filter((x) => x.ac).map((x) => x.ac) : [];
    sonuc('2) Birden çok dosya: başlıkta toplam boyut yok ("4 dosya dönüştürüldü · 1 dosya dönüştürülemedi"); satırlarda boyut ve sayfa yok', !!s
      && /^4 dosya dönüştürüldü · 1 dosya dönüştürülemedi$/m.test(s.metin) && !/KB|MB|toplam|\d sayfa/.test(s.metin), s?.metin);
    sonuc('2) PDF satırlarında Aç (3), PDF olmayanda ve hatalıda yok', acler.length === 3 && !s.satirlar[3].ac && !s.satirlar[4].ac, s?.satirlar.map((x) => [x.ad.slice(0, 20), !!x.ac]));
    sonuc('2) Aç düğmeleri aynı sütunda (sol kenarları eşit), adın uzunluğundan bağımsız', acler.length === 3 && acler.every((a) => yakin(a.sol, acler[0].sol, 0.5)), acler.map((a) => a.sol));
    sonuc('2) Uzun ad "…" ile kısalır, Aç kutunun içinde kalır; Aç sütunu kutunun sağında', !!s && s.satirlar[2].kisaldi && acler.every((a) => a.sag <= s.kutu.sag) && acler[0].sol > s.kutu.ortaX,
      s && { kisaldi: s.satirlar[2].kisaldi, ac: acler.map((a) => [a.sol, a.sag]), kutu: [s.kutu.sol, s.kutu.sag] });
    sonuc('2) Uyarı adın altında, hata metni hatalı satırda', !!s && s.satirlar[1].uyari === 'Belgedeki bir ayrıntı aktarılmadı.' && s.satirlar[1].uyariKutu.ust >= s.satirlar[1].adKutu.alt - 0.5 && s.satirlar[4].hata === 'Dosya açılamadı.',
      s?.satirlar[1]);
    // Aç (yeni sekmede; dosya yoksa "bulunamadı" bildirimi) yerine: düğme ac işlevini satırın sırasıyla çağırır
    await evalJs(`(() => { const p = ${A}; window.__s38acilan = []; p.__eskiDosyaAc = p.baglam.dosyaAc; p.baglam.dosyaAc = async (y, o) => { window.__s38acilan.push([y, o]); return null; }; return true; })()`);
    await evalJs(`(document.querySelectorAll('.donustur-sonuc [data-ac]')[1].click(), true)`);
    await bekle(200);
    const acilan = await evalJs(`(() => { const p = ${A}; p.baglam.dosyaAc = p.__eskiDosyaAc; return window.__s38acilan; })()`);
    sonuc('2) Aç tıklanan satırın dosyasını açar', acilan.length === 1 && path.resolve(acilan[0][0]) === path.resolve(coklu[1].hedef), acilan);
    await araclariKapat();
    // Ayır: gerçek ayırma (iki dosya), sonra tek dosya
    const cikti = path.join(UI, 'ayir'); fs.rmSync(cikti, { recursive: true, force: true }); fs.mkdirSync(cikti, { recursive: true });
    await ciktiKlasoruAyarla(cikti);
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(pdf)}); return true; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
    await evalJs(`(window.__pdefe.komutCalistir('arac.ayir'), true)`);
    await kosul(`!!document.querySelector('.ayir-pencere .ayir-aralik')`);
    await evalJs(`(() => { const a = document.querySelector('.ayir-pencere .ayir-aralik'); a.value = '1, 2-4'; a.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await kosul(`document.querySelector('.ayir-pencere .arac-klasor-cip')?.title?.includes(${J(path.basename(cikti))})`, 5000);
    await bekle(300);
    await evalJs(`(document.querySelector('.ayir-pencere .arac-dugmeler .birincil').click(), true)`);
    await kosul(`!document.querySelector('.ayir-sonuc').hidden && document.querySelectorAll('.ayir-sonuc li').length === 2`, 15000);
    let a = await evalJs(`(() => { const s = document.querySelector('.ayir-sonuc'), k = window.__s38kutu; return { metin: s.innerText, sinif: s.className, ac: [...s.querySelectorAll('[data-ac]')].map((x) => k(x)), kutu: k(s) }; })()`);
    await ss('02-ayir-coklu');
    sonuc('2) Ayır (iki dosya): "2 dosya oluşturuldu", her satırda Aç aynı sütunda; boyut ve sayfa yok', /^2 dosya oluşturuldu$/m.test(a.metin) && a.ac.length === 2 && yakin(a.ac[0].sol, a.ac[1].sol, 0.5)
      && !/KB|MB|toplam|\d sayfa\b/.test(a.metin.replace(/Sayfa \d[-\d]*/g, '')) && /arac-sonuc-liste/.test(a.sinif), a);
    await evalJs(`(document.querySelector('.ayir-dosya-kipi-secim > button[data-id="tek"]').click(), true)`);
    await bekle(200);
    await evalJs(`(document.querySelector('.ayir-pencere .arac-dugmeler .birincil').click(), true)`);
    await kosul(`document.querySelectorAll('.ayir-sonuc li').length === 1`, 15000);
    a = await evalJs(`(() => { const s = document.querySelector('.ayir-sonuc'), k = window.__s38kutu; const r = document.createRange(); r.selectNodeContents(s.querySelector('li .ad')); const am = r.getBoundingClientRect();
      return { metin: s.innerText, sinif: s.className, ac: s.querySelectorAll('[data-ac]').length, kutu: k(s), adOrtaX: am.left + am.width / 2, dugmeler: [...s.querySelectorAll('.arac-sonuc-dugmeler button')].map((b) => k(b)) }; })()`);
    await ss('02-ayir-tek');
    const dOrta = a.dugmeler.length ? (a.dugmeler[0].sol + a.dugmeler.at(-1).sag) / 2 : NaN;
    sonuc('2) Ayır (tek dosya): "Dosya oluşturuldu", ad ve düğmeler ortalı, satırda Aç yok, boyut yok', /^Dosya oluşturuldu$/m.test(a.metin) && /arac-sonuc-tek/.test(a.sinif) && a.ac === 0
      && yakin(a.adOrtaX, a.kutu.ortaX, 1.5) && yakin(dOrta, a.kutu.ortaX, 1.5) && !/KB|MB/.test(a.metin), { ...a, dOrta });
    await araclariKapat(); await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 3) "zaten var" sorusunda "Yeni belge olarak kaydet"
  if (bolum(3)) {
    console.log('\n== 3) "zaten var" sorusu: Üzerine yaz | Yeni belge olarak kaydet | Vazgeç');
    await araclariKapat(); await sekmeleriKapat();
    const klasor = path.join(UI, 'zatenvar'); fs.rmSync(klasor, { recursive: true, force: true }); fs.mkdirSync(klasor, { recursive: true });
    await ciktiKlasoruAyarla(klasor);
    const pdf = ornekPdf('zatenvar.pdf', 2, 'Zaten var örneği');
    fs.writeFileSync(path.join(klasor, 'Sigorta Başvuru.udf'), 'eski');
    await evalJs(`(window.__s38m = window.__s38m || {}, true)`);
    await evalJs(`(async () => { window.__s38m.d = await import('pdefe://app/src/renderer/araclar/donustur.js'); return true; })()`);
    const A = 'window.__s38m.d.acikDonusturPenceresi()';
    await evalJs(`(window.__pdefe.komutCalistir('arac.donustur', [${J(pdf)}]), true)`);
    await kosul(`!!${A} && ${A}.ogeler.length === 1 && !${A}.ogeler[0].yukleniyor`, 15000);
    await evalJs(`(async () => { const p = ${A}; await p.kayit.hazir; p.kayit.cikti.ayarla(${J(klasor)}, 'Sigorta Başvuru', { elle: true }); return true; })()`);
    /** Kaydet denetimini sorunun yanıtıyla çalıştırır: { sonuc, soru, hedef, kutu } */
    const denetle = (secim) => evalJs(`(async () => { const p = ${A}; const o = { secim: ${secim} }; window.__pdefeOtoYanit = o;
      let sonuc; try { sonuc = await p.kayit.denetle(); } finally { delete window.__pdefeOtoYanit; }
      return { sonuc: sonuc instanceof Error ? 'hata: ' + sonuc.message : sonuc, soru: o.son ? { mesaj: o.son.mesaj, ayrinti: o.son.ayrinti, dugmeler: o.son.dugmeler, varsayilan: o.son.varsayilan, iptal: o.son.iptal } : null,
        hedef: p.kayit.hedef(), kutu: document.querySelector('.donustur-pencere .arac-kayit-yeni .arac-cikti-ad').value }; })()`);
    let r = await denetle(2);
    sonuc('3) Soru: "… zaten var.", düğmeler Üzerine yaz | Yeni belge olarak kaydet | Vazgeç; varsayılan Yeni belge, Esc Vazgeç; yeni ad soruda',
      !!r.soru && r.soru.mesaj === '"Sigorta Başvuru.udf" zaten var.' && J(r.soru.dugmeler) === J(['Üzerine yaz', 'Yeni belge olarak kaydet', 'Vazgeç']) && r.soru.varsayilan === 1 && r.soru.iptal === 2
      && r.soru.ayrinti.includes('"Sigorta Başvuru (1).udf"'), r);
    sonuc('3) Vazgeç: işlem yapılmaz, ad değişmez', r.sonuc === 'vazgec' && path.basename(r.hedef) === 'Sigorta Başvuru.udf' && r.kutu === 'Sigorta Başvuru', r);
    // Kutunun kendisi: üç düğme aynı satırda, odak (Enter) Yeni belge olarak kaydet'te; Esc Vazgeç
    await evalJs(`(window.__s38d = ${A}.kayit.denetle(), true)`);
    await kosul(`!!document.querySelector('.mesaj-kutusu .dugmeler button')`);
    const kutuDugmeleri = await evalJs(`(() => { const d = [...document.querySelectorAll('.mesaj-kutusu .dugmeler button')]; return { metin: d.map((b) => b.textContent), odak: document.activeElement?.textContent, birincil: d.map((b) => b.classList.contains('birincil')), ust: d.map((b) => Math.round(b.getBoundingClientRect().top)) }; })()`);
    await ss('03-zaten-var-sorusu');
    await evalJs(`(document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`);
    const escSonucu = await evalJs(`window.__s38d.then((x) => x)`);
    sonuc('3) Kutuda üç düğme aynı satırda, Yeni belge olarak kaydet odakta (birincil); Esc Vazgeç gibi', J(kutuDugmeleri.metin) === J(['Üzerine yaz', 'Yeni belge olarak kaydet', 'Vazgeç'])
      && kutuDugmeleri.odak === 'Yeni belge olarak kaydet' && J(kutuDugmeleri.birincil) === J([false, true, false]) && new Set(kutuDugmeleri.ust).size === 1 && escSonucu === 'vazgec', { kutuDugmeleri, escSonucu });
    r = await denetle(1);
    sonuc('3) Yeni belge olarak kaydet: hedef "Sigorta Başvuru (1).udf", ad kutusunda "Sigorta Başvuru (1)", işlem sürer', r.sonuc === 'devam' && path.resolve(r.hedef) === path.resolve(path.join(klasor, 'Sigorta Başvuru (1).udf')) && r.kutu === 'Sigorta Başvuru (1)', r);
    // "(1)" de varsa "(2)"; ad "(1)" ile bitiyorsa sayı artar
    fs.writeFileSync(path.join(klasor, 'Sigorta Başvuru (1).udf'), 'eski');
    await evalJs(`(${A}.kayit.cikti.ayarla(${J(klasor)}, 'Sigorta Başvuru', { elle: true }), true)`);
    r = await denetle(1);
    sonuc('3) "(1)" de varsa "(2)"', r.sonuc === 'devam' && path.basename(r.hedef) === 'Sigorta Başvuru (2).udf' && r.soru?.ayrinti.includes('"Sigorta Başvuru (2).udf"'), r);
    await evalJs(`(${A}.kayit.cikti.ayarla(${J(klasor)}, 'Sigorta Başvuru (1)', { elle: true }), true)`);
    r = await denetle(1);
    sonuc('3) Ad "(1)" ile bitiyorsa sayı artar: "Sigorta Başvuru (1)" → "Sigorta Başvuru (2)"', r.sonuc === 'devam' && path.basename(r.hedef) === 'Sigorta Başvuru (2).udf', r);
    await evalJs(`(${A}.kayit.cikti.ayarla(${J(klasor)}, 'Sigorta Başvuru', { elle: true }), true)`);
    r = await denetle(0);
    sonuc('3) Üzerine yaz: ad değişmez, işlem sürer', r.sonuc === 'devam' && path.basename(r.hedef) === 'Sigorta Başvuru.udf', r);
    await araclariKapat();
    // Uçtan uca: Döndür, var olan adla kaydet → "(1)" adlı yeni dosya, var olan dosya değişmez
    fs.copyFileSync(pdf, path.join(klasor, 'Döndürülecek.pdf'));
    const eskiBoyut = fs.statSync(path.join(klasor, 'Döndürülecek.pdf')).size;
    fs.writeFileSync(path.join(klasor, 'Hedef.pdf'), 'eski içerik');
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(path.join(klasor, 'Döndürülecek.pdf'))}); return true; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
    await evalJs(`(window.__pdefe.komutCalistir('arac.dondurKaydet'), true)`);
    await kosul(`!!document.querySelector('.dondur-pencere .arac-kayit-yeni .arac-cikti-ad')`);
    await bekle(400);
    await evalJs(`(() => { const e = document.querySelector('.dondur-pencere .arac-kayit-yeni .arac-cikti-ad'); e.value = 'Hedef'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('blur')); return true; })()`);
    await evalJs(`(window.__s38oto = window.__pdefeOtoYanit = { secim: 1 }, true)`);
    await evalJs(`(document.querySelector('.dondur-pencere .arac-dugmeler .birincil').click(), true)`);
    const yeni = path.join(klasor, 'Hedef (1).pdf');
    await kosul(`!document.querySelector('.dondur-pencere')`, 15000);
    await evalJs(`(delete window.__pdefeOtoYanit, true)`);
    const soru = await evalJs(`window.__s38oto?.son ? { mesaj: window.__s38oto.son.mesaj, dugmeler: window.__s38oto.son.dugmeler } : null`);
    await bekle(500);
    sonuc('3) Döndür: "Hedef.pdf zaten var" → Yeni belge olarak kaydet: "Hedef (1).pdf" oluşur, "Hedef.pdf" değişmez, özgün dosya değişmez',
      !!soru && soru.mesaj === '"Hedef.pdf" zaten var.' && fs.existsSync(yeni) && fs.readFileSync(path.join(klasor, 'Hedef.pdf'), 'utf8') === 'eski içerik'
      && fs.statSync(path.join(klasor, 'Döndürülecek.pdf')).size === eskiBoyut, { soru, yeni: fs.existsSync(yeni), dosyalar: fs.readdirSync(klasor) });
    await araclariKapat(); await sekmeleriKapat();
    await ciktiKlasoruAyarla(path.join(UI, 'cikti'));
  }

  const hatalar = await evalJs('window.__hatalar || []');
  sonuc('Renderer konsolunda hata yok', !hatalar.length, hatalar);
  console.log(`\n${denetim} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}  (ekran görüntüleri: ${PNG})`);
  if (hataSayisi) process.exitCode = 1;
}
