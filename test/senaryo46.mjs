// Senaryo 46 (0.3.1, kullanıcı isteği: "bu attığım dosyada yazıları bulmuyordu … bunlardaki Ctrl+F'i çalışır hale getireceğiz"): Bul
// taranmış sayfalarda tanınan yazıda da arar.
//   1) Taranmış sayfalı belgede (arama.pdf: PDF metinli, taranmış, /Rotate 90'lı, yan ve ters taranmış, karışık sayfalar) aranan sözcüğün
//      bütün eşleşmeleri bulunur. Sayaç tanıma ilerledikçe "Tanınıyor 3/10" / "1 / 4 · tanınıyor 5/10" der, "Bulunamadı" demez. İlk bulunana
//      hemen gidilir, sonuçlar sayfa sırasında. Tanınan sayfalar yalnızca görselinde yazı olanlar. Arayüz donmaz (zamanlayıcı gecikmesi).
//      Vurgu tanınan sözcüğün kutusunun üstünde (yan, ters ve döndürülmüş sayfada da). Enter / F3 / Shift+F3 sonraki ve önceki, sonda başa döner.
//   2) Bul kapanınca bekleyen tanımalar bırakılır (sürenler biter, sonuçları sayfada kalır), yeniden açınca tanınmışlar beklenmez.
//      Aranan metin değişince eski aramanın tanımaları bırakılır, yenisi bütün sayfaları bulur (Türkçe büyük İ: "dairesi" → "DAİRESİ").
//   3) Hiç geçmeyen sözcükte "Bulunamadı" ancak bütün taranmış sayfalar tanınınca.
//   4) Seçenekler: Büyük-küçük harf duyarlı, yalnızca tam sözcükler.
//   5) Sayfa düzeni değişmiş belge: Sayfa silinip taşınınca açık Bul sonuçları yeni numaralarla yeniden bulur (görünüm kaymaz, geçerli
//      eşleşme yerinde kalır), geri alınınca eskisine döner. Başka belgeden eklenen taranmış sayfa tanınıp aranır.
//   6) Tüm açık sekmelerde arama: iki belgenin tanınan yazısı da, etkin belge önce.
//   7) Tanıyıcı yoksa (Linux gibi; ayrı örnek PDEFE_TANIMA_YOK=1 ile, betik kendisi başlatır ve kapatır): yalnızca PDF metni aranır,
//      sayaç "· taranmış sayfalar aranamadı" der. Yalnızca metinli belgede bu bilgi çıkmaz.
//   8) Birden çok sözcük (0.3.1 kabul sınaması): Satır sonuna taşan iki sözcük tanınan yazıda ve PDF metninde bulunur (vurgu iki satırda),
//      fazladan boşluk fark etmez. Tanıyıcının ayırdığı noktalama işareti ("Örnek :") bitişik yazılınca ("Örnek:") bulunur.
// Örnek PDF test/tanima_pdf_uret.py ile üretilir (betik kendisi çalıştırır; gerçek belge yok): test/cikti/s46/<koşum>/. Her bölüm kendi
// kopyasını açar: çekirdeğin tanıma önbelleği dosya yoluna bağlı, kopya önceki bölümün tanımasını kullanmaz.
// Kullanım (ekran dışı; 7. bölüm PDEFE_CDP_PORT + 1'de ikinci bir örnek açar):
//   powershell -File test\baslat.ps1 -Port 9310 -Veri "$env:TEMP\pdefe-s46-9310"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9310; node test\surucu.mjs betik test\senaryo46.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,5". Tanıma Windows'un yazı tanıyıcısını (Türkçe dil paketi) ister.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's46', Date.now().toString(36));
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));
// tanima_pdf_uret.py'deki ARAMA_BEKLENEN ve ARAMA_TARANMIS
const BEKLENEN = { 1: 1, 2: 1, 4: 2, 5: 1, 6: 1, 8: 2, 10: 1, 11: 1 };
const BEKLENEN_SAYFALAR = Object.entries(BEKLENEN).flatMap(([s, n]) => Array(n).fill(+s));
const TOPLAM = BEKLENEN_SAYFALAR.length;   // 10
const TARANMIS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
const DAIRESI = TARANMIS.filter((s) => s !== 8);   // başlık her taranmış sayfada, kaşede yok
const TANIMA_ESZAMANLI = 2;   // goruntuleyici.js

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

// Sayfada çalışan izleyici: sayaçtaki her değişiklik (zaman, metin, sonuç sayısı, tanınmış taranmış sayfa sayısı), olay döngüsünün en
// uzun gecikmesi (50 ms'lik zamanlayıcının iki çalışması arası) ve görüntüleyicinin çekirdekten istediği tanımalar (istekler: sayfa no;
// önceden tanınmışlar: izleyici kurulurken tanınmış sayfalar)
const IZLE = `(() => {
  const g = window.__pdefe.aktif().gorunum, sayac = document.querySelector('#bul-sayac');
  window.__s46?.durdur?.();
  const iz = { kayit: [], enUzun: 0, t0: performance.now(), istekler: [], onceden: g.sayfalar.filter((s) => s.tanima).map((s) => s.no) };
  if (!g.__asilCekirdek) g.__asilCekirdek = g.cekirdek;
  const asil = g.__asilCekirdek;
  g.cekirdek = (y, p) => { if (y === 'ocr_sayfa') iz.istekler.push(p.sayfa); return asil(y, p); };
  const taranmis = ${J(TARANMIS)};
  const yaz = () => iz.kayit.push({ t: Math.round(performance.now() - iz.t0), m: sayac.textContent, n: window.__pdefe.arama.sonuclar.length,
    tanindi: taranmis.filter((n) => g.sayfalar[n - 1]?.tanima).length });
  const gozlem = new MutationObserver(yaz);
  gozlem.observe(sayac, { childList: true, characterData: true, subtree: true });
  let once = performance.now();
  const z = setInterval(() => { const s = performance.now(); iz.enUzun = Math.max(iz.enUzun, s - once - 50); once = s; }, 50);
  iz.durdur = () => { gozlem.disconnect(); clearInterval(z); };
  window.__s46 = iz;
  return 1;
})()`;
const ILERLEME = /(?:Tanınıyor|tanınıyor) (\d+)\/(\d+)/;
const SON = /^(\d+) \/ (\d+)$/;

export default async function ({ evalJs, bekle, tus }) {
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  const sayac = () => evalJs(`document.querySelector('#bul-sayac').textContent`);
  const sonuclar = () => evalJs(`window.__pdefe.arama.sonuclar.map((s) => ({ sayfa: s.sayfa, tur: s.tur, bas: s.bas, belge: s.belgeId }))`);
  const ac = async (yol) => {
    await evalJs(`window.__pdefe.dosyaAc(${J(yol)}).then(() => 1)`);
    await kosul(`window.__pdefe.aktif()?.gorunum.hazir && window.__pdefe.aktif().yol === ${J(yol)}`, 15000);
  };
  const bul = (metin) => evalJs(`(window.__pdefe.komutCalistir('duzen.bul', ${J(metin)}), 1)`);
  const bitti = (sure = 60000) => kosul(`/^(\\d+ \\/ \\d+|Bulunamadı)( ·.*)?$/.test(document.querySelector('#bul-sayac').textContent) && !/tanınıyor|…/.test(document.querySelector('#bul-sayac').textContent)`, sure);
  const kapatTum = async () => { await evalJs(`(async () => { window.__pdefe.arama.kapat(); for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true }).catch(() => {}); return 1; })()`); await bekle(300); };
  const girdiyeOdak = () => evalJs(`(document.querySelector('#bul-girdi').focus(), 1)`);
  const ilerlemeler = (kayit) => kayit.map((k) => ILERLEME.exec(k.m)).filter(Boolean).map((m) => [+m[1], +m[2]]);

  fs.mkdirSync(UI, { recursive: true });
  execFileSync(PY, [path.join(KOK, 'test', 'tanima_pdf_uret.py'), UI], { stdio: 'inherit' });
  const kopya = (ad) => { const y = path.join(UI, ad); fs.copyFileSync(path.join(UI, 'arama.pdf'), y); return y; };
  await kapatTum();

  // ---------------------------------------------------------------- 1. Taranmış sayfalarda bulma, sayaç, vurgu, gezinme
  if (bolum(1)) {
    console.log('— 1. Taranmış sayfalarda bulma');
    const a1 = kopya('a1.pdf');
    await ac(a1);
    await evalJs(IZLE);
    const t0 = Date.now();
    await bul('tutanak');
    const son = await bitti();
    const sure = (Date.now() - t0) / 1000;
    const iz = await evalJs(`(() => { window.__s46.durdur(); return { kayit: window.__s46.kayit, enUzun: Math.round(window.__s46.enUzun), istekler: window.__s46.istekler, onceden: window.__s46.onceden }; })()`);
    const ss = await sonuclar(), m = await sayac();
    sonuc(`Bütün eşleşmeler bulundu: ${TOPLAM} (PDF metni 2, tanınan yazı 8; ${sure.toFixed(1)} sn)`, !!son && SON.test(m) && +SON.exec(m)[2] === TOPLAM && ss.length === TOPLAM, { m, ss });
    sonuc('Sonuçlar sayfa sırasında (karışık sayfada PDF metni ve kaşe ikisi de)', J(ss.map((s) => s.sayfa)) === J(BEKLENEN_SAYFALAR), ss.map((s) => s.sayfa));
    const il = ilerlemeler(iz.kayit);
    sonuc('Sayaç tanıma ilerlemesini gösterdi (paydası taranmış sayfa sayısı, pay artarak)', il.length >= 3 && il.every(([, p]) => p === TARANMIS.length)
      && il.every(([a], i) => i === 0 || a >= il[i - 1][0]) && new Set(il.map(([a]) => a)).size >= 3, iz.kayit.slice(0, 12));
    sonuc('Arama sürerken "Bulunamadı" yok', !iz.kayit.some((k) => /Bulunamadı/.test(k.m)), iz.kayit.map((k) => k.m));
    const ilkSonuc = iz.kayit.find((k) => k.n > 0 && /tanınıyor/.test(k.m));
    sonuc('İlk bulunana gidildi, tanıma bitmeden sayıldı ("1 / n · tanınıyor …")', !!ilkSonuc && /^1 \/ \d+ · tanınıyor \d+\/\d+$/.test(ilkSonuc.m) && ilkSonuc.tanindi < TARANMIS.length, ilkSonuc);
    const tanima = await evalJs(`window.__pdefe.aktif().gorunum.sayfalar.map((s) => ({ aday: s.tanimaAday ?? null, tanindi: !!s.tanima, sozcuk: s.tanima?.satirlar.flat().length ?? null }))`);
    sonuc('Taranmış sayfaların hepsi tanındı, metinli sayfa 1 ve 7 aday değil', TARANMIS.every((n) => tanima[n - 1].aday !== false && tanima[n - 1].sozcuk > 0)
      && tanima[0].aday !== true && tanima[6].aday !== true, tanima);
    const say = (l) => l.reduce((m2, n) => m2.set(n, (m2.get(n) || 0) + 1), new Map());
    const istek = say(iz.istekler);
    sonuc('Sayfa başına en çok bir tanıma isteği, önceden tanınmışlar yeniden istenmedi, Bul metinli sayfayı istemedi', [...istek.values()].every((n) => n === 1)
      && iz.onceden.every((n) => !istek.has(n)) && !istek.has(7), { istekler: iz.istekler, onceden: iz.onceden });
    sonuc(`Arayüz donmadı: olay döngüsünün en uzun gecikmesi ${iz.enUzun} ms (< 250)`, iz.enUzun < 250, iz.enUzun);

    // Vurgu tanınan sözcüğün kutusunda: her tanınan eşleşmeye gidilir, seçili vurgunun kutusu sözcüğün çekirdekteki kutusuyla örtüşür
    const vurgular = [];
    for (let i = 0; i < TOPLAM; i++) {
      const v = await evalJs(`(async () => {
        const a = window.__pdefe.arama, r = a.sonuclar[${i}], g = window.__pdefe.aktif().gorunum;
        a.gecerli = ${i}; await a.gecerliyeGit(); a.sayacYaz(false);
        const kayit = a.metinOnbellek.get(g)?.get(r.sayfa);
        const tanima = !!kayit && r.bas >= kayit.tanimaBasi;
        const e = document.querySelector('.textLayer .highlight.selected');
        if (!e) return { i: ${i}, sayfa: r.sayfa, tanima, yok: true };
        const h = e.getBoundingClientRect();
        if (!tanima) return { i: ${i}, sayfa: r.sayfa, tanima, metin: e.textContent };
        const s = g.sayfalar[r.sayfa - 1], vp = g.viewportAl(r.sayfa - 1), view = s.pdfSayfa.view, er = s.el.getBoundingClientRect();
        const nk = (x, y) => { const [px, py] = vp.convertToViewportPoint(x + view[0], view[3] - y); return [er.left + px, er.top + py]; };
        let en = null;
        for (const w of s.tanima.satirlar.flat()) {
          if (!String(w[0]).toLocaleLowerCase('tr').includes('tutanak')) continue;
          const k = [nk(w[1], w[2]), nk(w[3], w[4]), nk(w[5], w[6]), nk(w[5] + w[3] - w[1], w[6] + w[4] - w[2])];
          const b = { l: Math.min(...k.map((p) => p[0])), t: Math.min(...k.map((p) => p[1])), r: Math.max(...k.map((p) => p[0])), b: Math.max(...k.map((p) => p[1])) };
          const ix = Math.max(0, Math.min(b.r, h.right) - Math.max(b.l, h.left)), iy = Math.max(0, Math.min(b.b, h.bottom) - Math.max(b.t, h.top));
          const ortak = ix * iy, iou = ortak / ((b.r - b.l) * (b.b - b.t) + h.width * h.height - ortak);
          if (!en || iou > en.iou) {
            const yatay = b.r - b.l >= b.b - b.t;
            const fark = yatay ? Math.max(Math.abs(h.left - b.l), Math.abs(h.right - b.r)) : Math.max(Math.abs(h.top - b.t), Math.abs(h.bottom - b.b));
            en = { iou: Math.round(iou * 100) / 100, yatay, fark: Math.round(fark * 10) / 10, sozcuk: [b.l, b.t, b.r, b.b].map(Math.round), vurgu: [h.left, h.top, h.right, h.bottom].map(Math.round) };
          }
        }
        return { i: ${i}, sayfa: r.sayfa, tanima, metin: e.textContent, ...en };
      })()`);
      vurgular.push(v);
    }
    const taninan = vurgular.filter((v) => v.tanima);
    sonuc('Tanınan eşleşmeler 8, PDF metnindekiler 2 (1. ve 8. sayfa)', taninan.length === 8 && J(vurgular.filter((v) => !v.tanima).map((v) => v.sayfa)) === J([1, 8]), vurgular);
    sonuc('Her eşleşmeye gidilince seçili vurgu var', vurgular.every((v) => !v.yok), vurgular.filter((v) => v.yok));
    sonuc('Vurgu tanınan sözcüğün kutusuyla örtüşür (IoU ≥ 0,6; yazı yönünde uçlar 3 px içinde)', taninan.every((v) => v.iou >= 0.6 && v.fark <= 3), taninan);
    sonuc('Yan taranmış sayfada (6) vurgu dikey, ters (11) ve döndürülmüş (5) sayfada yatay', taninan.find((v) => v.sayfa === 6)?.yatay === false
      && taninan.find((v) => v.sayfa === 11)?.yatay === true && taninan.find((v) => v.sayfa === 5)?.yatay === true, taninan);

    // Gerçek tuşlarla sonraki / önceki (girdide Enter, F3, Shift+F3, Shift+Enter); sondan başa döner
    await evalJs(`(() => { const a = window.__pdefe.arama; a.gecerli = 0; a.gecerliyeGit(); a.sayacYaz(false); return 1; })()`);
    await bekle(400);
    await girdiyeOdak();
    const adimlar = [];
    for (const [t, d] of [['Enter', []], ['F3', []], ['F3', ['shift']], ['Enter', ['shift']], ['Enter', ['shift']]]) {
      await tus(t, d); await bekle(500);
      adimlar.push({ t: (d.length ? 'Shift+' : '') + t, m: await sayac(), sayfa: await evalJs('window.__pdefe.aktif().gorunum.gecerli') });
    }
    sonuc('Enter → 2, F3 → 3, Shift+F3 → 2, Shift+Enter → 1, Shift+Enter → son (10, 11. sayfa)', J(adimlar.map((a) => a.m)) === J([`2 / ${TOPLAM}`, `3 / ${TOPLAM}`, `2 / ${TOPLAM}`, `1 / ${TOPLAM}`, `${TOPLAM} / ${TOPLAM}`])
      && adimlar.at(-1).sayfa === 11, adimlar);
    await tus('F3'); await bekle(500);
    sonuc('Sondan F3 başa döner (1. sayfa)', (await sayac()) === `1 / ${TOPLAM}` && (await evalJs('window.__pdefe.aktif().gorunum.gecerli')) === 1, await sayac());
    await kapatTum();
  }

  // ---------------------------------------------------------------- 2. Kapatınca ve aranan değişince bırakma
  if (bolum(2)) {
    console.log('— 2. Bul kapanınca ve aranan değişince');
    const a2 = kopya('a2.pdf');
    await ac(a2);
    await evalJs(IZLE);
    await bul('tutanak');
    await kosul(`(/tanınıyor (\\d+)/i.exec(document.querySelector('#bul-sayac').textContent)?.[1] ?? 0) >= 2`, 30000);
    await girdiyeOdak();
    await tus('Escape'); await bekle(50);
    const durum = () => evalJs(`({ d: window.__pdefe.aktif().gorunum.sayfalar.map((s) => s.tanima === undefined ? 'u' : s.tanima === null ? 'n' : 't').join(''), istek: window.__s46.istekler.length })`);
    const d0 = await durum();
    await bekle(3000);
    const d1 = await durum();
    const say = (d, c) => [...d].filter((x) => x === c).length;
    sonuc('Esc ile kapandı, sayaç boş', (await evalJs(`document.querySelector('#bul-kutusu').hidden`)) && (await sayac()) === '', await sayac());
    sonuc(`Kapatınca bekleyen tanımalar bırakıldı: Yeni istek yok, sürenler (en çok ${TANIMA_ESZAMANLI}) bitti, öbürleri istenmemiş durumda`,
      d1.istek === d0.istek && say(d1.d, 't') <= say(d0.d, 't') + TANIMA_ESZAMANLI && say(d1.d, 'n') === 0 && say(d1.d, 'u') >= 3, { d0, d1 });
    // Tanınmış sayfaların sonucu işaretlenir: yeniden açınca aynı sonuç kullanılmalı (yeniden istenmez)
    await evalJs(`(window.__pdefe.aktif().gorunum.sayfalar.forEach((s) => { if (s.tanima) s.tanima.__s46 = 1; }), 1)`);
    await bul('tutanak');
    await bitti();
    const iz = await evalJs(`(() => { window.__s46.durdur(); return { istekler: window.__s46.istekler, isaretli: window.__pdefe.aktif().gorunum.sayfalar.filter((s) => s.tanima?.__s46).length }; })()`);
    const istek = iz.istekler.reduce((m2, n) => m2.set(n, (m2.get(n) || 0) + 1), new Map());
    sonuc(`Yeniden açınca tanınmışlar yeniden istenmedi (${say(d1.d, 't')} sayfa), öbürleri birer kez; sonunda ${TOPLAM} sonuç`, [...istek.values()].every((n) => n === 1)
      && iz.isaretli === say(d1.d, 't') && (await sonuclar()).length === TOPLAM && SON.test(await sayac()), { iz, d1, m: await sayac() });
    await kapatTum();

    const a3 = kopya('a3.pdf');
    await ac(a3);
    await evalJs(IZLE);
    await bul('tutanak');
    await kosul(`(/tanınıyor (\\d+)/i.exec(document.querySelector('#bul-sayac').textContent)?.[1] ?? 0) >= 2`, 30000);
    await evalJs(`(() => { const g = document.querySelector('#bul-girdi'); g.value = 'dairesi'; g.dispatchEvent(new Event('input')); return 1; })()`);
    await kosul(`window.__pdefe.arama.sorgu === 'dairesi'`, 3000);
    await bitti();
    const iz2 = await evalJs(`(() => { window.__s46.durdur(); return { istekler: window.__s46.istekler }; })()`);
    const ss = await sonuclar();
    sonuc(`Aranan değişince yeni arama bütün taranmış sayfaları buldu ("dairesi" → "DAİRESİ", ${DAIRESI.length} sayfa)`, J(ss.map((s) => s.sayfa)) === J(DAIRESI) && SON.test(await sayac()), { ss: ss.map((s) => s.sayfa), m: await sayac() });
    const istek2 = iz2.istekler.reduce((m2, n) => m2.set(n, (m2.get(n) || 0) + 1), new Map());
    sonuc('Eski aramanın bırakılan sayfaları yenisinde birer kez istendi (çift istek yok)', [...istek2.values()].every((n) => n === 1) && TARANMIS.every((n) => istek2.has(n)), iz2.istekler);
    await kapatTum();
  }

  // ---------------------------------------------------------------- 3. Hiç geçmeyen sözcük
  if (bolum(3)) {
    console.log('— 3. Bulunamadı ancak bütün sayfalar tanınınca');
    const a4 = kopya('a4.pdf');
    await ac(a4);
    await evalJs(IZLE);
    await bul('yokyokyok');
    await bitti();
    const iz = await evalJs(`(() => { window.__s46.durdur(); return window.__s46.kayit; })()`);
    const ilk = iz.find((k) => k.m === 'Bulunamadı');
    sonuc('"Bulunamadı" ancak bütün taranmış sayfalar tanınınca', !!ilk && ilk.tanindi === TARANMIS.length && iz.filter((k) => k.t < ilk.t).every((k) => /Tanınıyor|aranıyor/.test(k.m)), iz);
    sonuc('Sayaç kırmızı', await evalJs(`document.querySelector('#bul-sayac').classList.contains('yok')`));
    await kapatTum();
  }

  // ---------------------------------------------------------------- 4. Seçenekler
  if (bolum(4)) {
    console.log('— 4. Arama seçenekleri');
    const a5 = kopya('a5.pdf');
    await ac(a5);
    const secenek = (ad, acik) => evalJs(`(() => { const c = document.querySelector('#bul-ayar-menu input[data-ayar="${ad}"]'); if (c.checked !== ${acik}) { c.checked = ${acik}; c.dispatchEvent(new Event('change')); } return 1; })()`);
    await bul('TUTANAK');
    await bitti();
    sonuc(`Büyük-küçük harf duyarsız: "TUTANAK" ${TOPLAM} sonuç`, (await sonuclar()).length === TOPLAM, await sayac());
    await secenek('buyukKucuk', true);
    await bitti();
    const ss = await sonuclar();
    sonuc('Büyük-küçük harf duyarlı: yalnızca kaşedeki "TUTANAK" (8. sayfa)', ss.length === 1 && ss[0].sayfa === 8, ss);
    await secenek('buyukKucuk', false);
    await bul('tutana');
    await bitti();
    const n1 = (await sonuclar()).length;
    await secenek('tamSozcuk', true);
    await bitti();
    sonuc(`"tutana": tam sözcük kapalıyken ${TOPLAM + 1} ("tutanağının" da), açıkken Bulunamadı`, n1 === TOPLAM + 1 && (await sonuclar()).length === 0 && (await sayac()) === 'Bulunamadı', { n1, m: await sayac() });
    await secenek('tamSozcuk', false);
    await kapatTum();
  }

  // ---------------------------------------------------------------- 5. Sayfa düzeni değişmiş belge
  if (bolum(5)) {
    console.log('— 5. Sayfa düzeni değişince');
    const a6 = kopya('a6.pdf'), a7 = kopya('a7.pdf');
    await ac(a6);
    await bul('tutanak');
    await bitti();
    // Geçerli eşleşme 4. sayfanın ikincisi
    await evalJs(`(async () => { const a = window.__pdefe.arama; a.gecerli = 3; await a.gecerliyeGit(); a.sayacYaz(false); return 1; })()`);
    await bekle(500);
    const once = await evalJs(`(() => { const r = window.__pdefe.arama.sonuclar[3]; return { sayfa: r.sayfa, bas: r.bas, kimlik: !!r.girdi?.kimlik, st: window.__pdefe.aktif().gorunum.kaydirici.scrollTop }; })()`);
    // 1. sayfa silinir, 11. sayfa başa taşınır: [11, 2, 3, …, 10, 12]
    await evalJs(`(async () => { const b = window.__pdefe.aktif(), t = b.gorunum.tarif(); await window.__pdefe.sayfaTarifiUygula(b, [t[10], ...t.filter((_, i) => i !== 0 && i !== 10)]); return 1; })()`);
    await kosul(`window.__pdefe.aktif().gorunum.sayfaSayisi === 11`, 5000);
    await bitti(20000);
    await bekle(300);
    const ss = await sonuclar();
    const beklenen5 = [1, 2, 4, 4, 5, 6, 8, 8, 10];   // eski 11 → 1; eski 1 silindi; 2–10 yerinde
    sonuc('Açık Bul sonuçları yeni sayfa numaralarıyla yeniden bulundu', J(ss.map((s) => s.sayfa)) === J(beklenen5), ss.map((s) => s.sayfa));
    const sonra = await evalJs(`(() => { const a = window.__pdefe.arama, r = a.sonuclar[a.gecerli]; return { gecerli: a.gecerli, sayfa: r?.sayfa, bas: r?.bas, sayac: document.querySelector('#bul-sayac').textContent,
      secili: !!document.querySelector('.textLayer .highlight.selected'), yeniIstek: window.__pdefe.aktif().gorunum.sayfalar.some((s) => s.tanima === null) }; })()`);
    sonuc('Geçerli eşleşme sayfasıyla birlikte geçerli kaldı (4. sayfanın ikincisi → "4 / 9"), vurgusu seçili', sonra.sayfa === 4 && sonra.bas === once.bas && sonra.sayac === `4 / ${beklenen5.length}` && sonra.secili, { once, sonra });
    sonuc('Tanınmış sayfalar yeniden tanınmadı', !sonra.yeniIstek, sonra);
    // Odak Bul girdisindeyken Geri al girdinin kendi geri almasıdır: önce belge
    await evalJs(`(window.__pdefe.aktif().gorunum.kaydirici.focus(), window.__pdefe.komutCalistir('duzen.geriAl'), 1)`);
    await kosul(`window.__pdefe.aktif().gorunum.sayfaSayisi === 12`, 5000);
    await bitti(20000);
    await bekle(300);
    sonuc('Geri alınınca eski sonuçlar', J((await sonuclar()).map((s) => s.sayfa)) === J(BEKLENEN_SAYFALAR), (await sonuclar()).map((s) => s.sayfa));
    // Başka belgeden taranmış sayfa eklenir (tanınmamış: başka dosya): tanınıp aranır
    await evalJs(`(async () => { const b = window.__pdefe.aktif(), t = b.gorunum.tarif(); await window.__pdefe.sayfaTarifiUygula(b, [...t, { kaynak: { yol: ${J(a7)}, sayfa: 4 }, dondurme: 0 }]); return 1; })()`);
    await kosul(`window.__pdefe.aktif().gorunum.sayfaSayisi === 13`, 8000);
    await bitti(30000);
    await bekle(300);
    const ss2 = await sonuclar();
    const ek = await evalJs(`(() => { const s = window.__pdefe.aktif().gorunum.sayfalar[12]; return { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, tanindi: !!s.tanima?.satirlar.length }; })()`);
    sonuc('Eklenen taranmış sayfa (başka dosyanın 4. sayfası) tanındı, iki eşleşmesi 13. sayfada', J(ss2.map((s) => s.sayfa)) === J([...BEKLENEN_SAYFALAR, 13, 13]) && ek.tanindi && ek.yol === a7, { ss: ss2.map((s) => s.sayfa), ek });
    // Kullanıcının döndürdüğü sayfa (girdi kopyası): tanınan yazı kopyaya geçer, yeniden istenmez, vurgu yine sözcükte
    await evalJs(`(window.__pdefe.sayfalariDondur(window.__pdefe.aktif(), [2], 90), 1)`);
    await kosul(`window.__pdefe.aktif().gorunum.sayfalar[1].dondurme === 90`, 5000);
    await bitti(20000);
    await bekle(300);
    const don = await evalJs(`(async () => { const a = window.__pdefe.arama, g = window.__pdefe.aktif().gorunum; const i = a.sonuclar.findIndex((r) => r.sayfa === 2);
      a.gecerli = i; await a.gecerliyeGit(); a.sayacYaz(false); const e = document.querySelector('.textLayer .highlight.selected'), r = e?.getBoundingClientRect();
      return { n: a.sonuclar.length, tanima: !!g.sayfalar[1].tanima?.satirlar.length, dondurme: g.sayfalar[1].dondurme, dikey: r ? r.height > r.width : null }; })()`);
    sonuc('Döndürülen sayfada tanınan yazı kopyaya geçti, eşleşme yine bulundu, vurgu sayfayla döndü (dikey)', don.n === TOPLAM + 2 && don.tanima && don.dondurme === 90 && don.dikey === true, don);
    await kapatTum();
  }

  // ---------------------------------------------------------------- 6. Tüm açık sekmelerde
  if (bolum(6)) {
    console.log('— 6. Tüm açık sekmelerde');
    const a8 = kopya('a8.pdf'), a9 = kopya('a9.pdf');
    await ac(a8); await ac(a9);
    await evalJs(`(() => { const c = document.querySelector('#bul-ayar-menu input[data-kapsam="tum"]'); c.checked = true; c.dispatchEvent(new Event('change')); return 1; })()`);
    await bul('tutanak');
    await bitti(90000);
    const ss = await sonuclar();
    const etkin = await evalJs(`window.__pdefe.aktif().id`);
    sonuc(`İki belgenin tanınan yazısı da: ${2 * TOPLAM} sonuç, önce etkin belgeninkiler (sayfa sırasıyla)`, ss.length === 2 * TOPLAM && ss.slice(0, TOPLAM).every((s) => s.belge === etkin)
      && J(ss.slice(0, TOPLAM).map((s) => s.sayfa)) === J(BEKLENEN_SAYFALAR) && J(ss.slice(TOPLAM).map((s) => s.sayfa)) === J(BEKLENEN_SAYFALAR), ss.map((s) => `${s.belge === etkin ? 'e' : 'o'}${s.sayfa}`).join(' '));
    await evalJs(`(() => { const c = document.querySelector('#bul-ayar-menu input[data-kapsam="belge"]'); c.checked = true; c.dispatchEvent(new Event('change')); return 1; })()`);
    await kapatTum();
  }

  // ---------------------------------------------------------------- 8. Birden çok sözcük, boşluk ve noktalama (0.3.1 kabul sınaması)
  if (bolum(8)) {
    console.log('— 8. Birden çok sözcük');
    const a12 = kopya('a12.pdf');
    await ac(a12);
    const ara = async (m) => { await bul(m); await bekle(100); await bitti(); return sonuclar(); };
    // Tanınan yazıda: "… haczi kabil" satırın sonu, "malların …" sonraki satırın başı (tanima_pdf_uret.py GOVDE)
    const ayni = await ara('haczi kabil');
    sonuc(`Tanınan yazıda aynı satırda iki sözcük: ${DAIRESI.length} sayfa`, J(ayni.map((s) => s.sayfa)) === J(DAIRESI), ayni.map((s) => s.sayfa));
    const tasan = await ara('kabil malların');
    sonuc('Tanınan yazıda satır sonuna taşan iki sözcük: Aynı sayfalar', J(tasan.map((s) => s.sayfa)) === J(DAIRESI), tasan.map((s) => s.sayfa));
    const buyuk = await ara('KABİL MALLARIN');
    sonuc('Büyük harfle de (Türkçe İ / I)', J(buyuk.map((s) => s.sayfa)) === J(DAIRESI), buyuk.map((s) => s.sayfa));
    const cift = await ara('kabil    malların');
    sonuc('Fazladan boşluk fark etmez', J(cift.map((s) => s.sayfa)) === J(DAIRESI), cift.map((s) => s.sayfa));
    await evalJs(`(async () => { const a = window.__pdefe.arama; await a.katmanBekle(window.__pdefe.aktif().gorunum, a.sonuclar[a.gecerli].sayfa); return 1; })()`);
    await bekle(300);
    const v = await evalJs(`(() => { const a = window.__pdefe.arama; const e = [...document.querySelectorAll('.textLayer .highlight[data-eslesme="' + a.gecerli + '"]')]; const r = e.map((x) => x.getBoundingClientRect());
      return { parca: e.length, metin: e.map((x) => x.textContent.trim()), ikiSatir: r.length === 2 && Math.abs(r[1].top - r[0].top) > 5 }; })()`);
    sonuc('Taşan eşleşmenin vurgusu iki satırda, iki sözcüğün üstünde', v.ikiSatir && J(v.metin.map((m) => m.toLocaleLowerCase('tr'))) === J(['kabil', 'malların']), v);
    // PDF metninde (1. sayfanın iki satırı)
    const pdfTasan = await ara('metnidir. Aranan tutanak');
    sonuc('PDF metninde satır sonuna taşan sözcükler (1. sayfa)', J(pdfTasan.map((s) => s.sayfa)) === J([1]), pdfTasan.map((s) => s.sayfa));
    // Eşleşme kuralları
    const k = await evalJs(`(() => { const A = window.__pdefe.arama, say = (m, q) => A.eslesmeleriBul(m, q).map((x) => m.slice(x[0], x[1]));
      return { nokta: say('Örnek :\\n22 tamam ! son', 'Örnek:'), unlem: say('tamam ! son', 'tamam!'), tarih: say('no 12 . 34 . 5678 bitti', '12.34.5678'), bitisik: say('Örnek: 5', 'Örnek :'),
        ozel: say('a.b (c) [d] e*f', '(c) [d]'), yildiz: say('e*f', 'e*f'), bosSorgu: say('a b', '   '), sonBosluk: say('ab\\ncd', 'ab '), tek: say('aXb axb', 'x').length,
        ozelTek: say('a?b', '?').length }; })()`);
    sonuc('Noktalama: "Örnek:" → "Örnek :", "tamam!" → "tamam !", "12.34.5678" → "12 . 34 . 5678"', J(k.nokta) === J(['Örnek :']) && J(k.unlem) === J(['tamam !']) && J(k.tarih) === J(['12 . 34 . 5678']), k);
    sonuc('Aranandaki boşluk metinde yoksa bulunmaz ("Örnek :" → "Örnek:"), düzenli ifade karakterleri düz aranır', J(k.bitisik) === J([]) && J(k.ozel) === J(['(c) [d]']) && J(k.yildiz) === J(['e*f']) && k.ozelTek === 1, k);
    sonuc('Yalnızca boşluk aranmaz, sondaki boşluk satır sonuna da uyar, büyük-küçük duyarsız', J(k.bosSorgu) === J([]) && J(k.sonBosluk) === J(['ab\n']) && k.tek === 2, k);
    await kapatTum();
  }

  // ---------------------------------------------------------------- 7. Tanıyıcı yok (ikinci örnek)
  if (bolum(7)) {
    console.log('— 7. Tanıyıcı yoksa');
    const port = +(process.env.PDEFE_CDP_PORT || 9222) + 1;
    const veri = path.join(process.env.TEMP || UI, `pdefe-s46-tanimasiz-${port}`);
    const cikti = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'baslat.ps1'), '-Port', String(port), '-Veri', veri],
      { encoding: 'utf8', env: { ...process.env, PDEFE_TANIMA_YOK: '1' } });
    const pid = /PID=(\d+)/.exec(cikti)?.[1];
    // İkinci örnek ayrı CDP portunda: surucu.mjs portu yüklenirken okuduğu için ayrı süreçle sürülür
    const ev2 = (kod) => JSON.parse(execFileSync(process.execPath, [path.join(KOK, 'test', 'surucu.mjs'), 'eval', kod], { encoding: 'utf8', env: { ...process.env, PDEFE_CDP_PORT: String(port) } }) || 'null');
    try {
      const a10 = kopya('a10.pdf');
      ev2(`window.__pdefe.dosyaAc(${J(a10)}).then(() => 1)`);
      const bekle2 = async (ifade, sure) => { const t0 = Date.now(); for (;;) { const v = ev2(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(200); } };
      await bekle2(`!!window.__pdefe.aktif()?.gorunum.hazir`, 15000);
      ev2(`(window.__pdefe.komutCalistir('duzen.bul', 'tutanak'), 1)`);
      await bekle2(`/aranamadı$|^\\d+ \\/ \\d+$/.test(document.querySelector('#bul-sayac').textContent)`, 20000);
      const d = ev2(`({ m: document.querySelector('#bul-sayac').textContent, title: document.querySelector('#bul-sayac').title, ss: window.__pdefe.arama.sonuclar.map((s) => s.sayfa) })`);
      sonuc('Tanıyıcısız: yalnızca PDF metni (1. ve 8. sayfa), sayaç "1 / 2 · taranmış sayfalar aranamadı", ipucu açıklar', J(d.ss) === J([1, 8]) && d.m === '1 / 2 · taranmış sayfalar aranamadı' && /yazı tanıyıcı/.test(d.title), d);
      ev2(`(async () => { window.__pdefe.arama.kapat(); for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true }).catch(() => {}); return 1; })()`);
      ev2(`window.__pdefe.dosyaAc(${J(path.join(UI, 'taranmis.pdf'))}).then(() => 1)`);
      await bekle2(`!!window.__pdefe.aktif()?.gorunum.hazir`, 15000);
      ev2(`(window.__pdefe.komutCalistir('duzen.bul', 'Yalnızca'), 1)`);
      await bekle2(`/aranamadı$|^\\d+ \\/ \\d+$/.test(document.querySelector('#bul-sayac').textContent)`, 20000);
      const d2 = ev2(`document.querySelector('#bul-sayac').textContent`);
      sonuc('Tanıyıcısız, taranmış sayfalı başka belgede PDF metni yine bulunur', /^1 \/ 1 · taranmış sayfalar aranamadı$/.test(d2), d2);
    } finally {
      if (pid) execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'durdur.ps1'), '-SurecId', pid], { encoding: 'utf8' });
    }
    // Yalnızca metinli belgede bilgi yok (bu örnekte tanıyıcı var; tanıyıcısız örnekte de aday sayfa olmadığından bilgi çıkmaz)
    console.log('— 7b. Yalnızca metinli belgede');
    const metinli = path.join(UI, 'metinli.pdf');
    execFileSync(PY, ['-c', `import pymupdf,sys\nd=pymupdf.open()\nfor i in range(3):\n  d.new_page().insert_text((72,100),'Metinli sayfa %d tutanak' % (i+1))\nd.save(sys.argv[1])`, metinli]);
    await ac(metinli);
    await bul('tutanak');
    await bitti(10000);
    sonuc('Yalnızca metinli belgede sayaç "1 / 3" (tanıma ilerlemesi ve bilgi yok)', (await sayac()) === '1 / 3', await sayac());
    await kapatTum();
  }

  console.log(`\n${denetim - hataSayisi}/${denetim} denetim geçti`);
  if (hataSayisi) process.exitCode = 1;
}
