// Senaryo 13: araç pencereleri revizyonu. Araçlar penceresi 5 karo (Paylaş yok) ve klavyeyle gezinme; kaydetme seçiminde "Üzerine yaz"
// notu (PDF küçült: geri alınamaz uyarısı, Döndür ve kaydet / Sayfaları düzenle: Ctrl+Z bilgisi); Sayfaları düzenle: boş alandan
// sürükleyerek alan seçimi (gerçek fare: canlı seçim, Ctrl ile ekleme, kenarda otomatik kaydırma, Esc, düz tıklama, kartla sıralama),
// "Yeni belge olarak kaydet" (notlar/bağlantılar/yer imleri, bekleyen not sorusu) ve "Üzerine yaz" (kayıt, Ctrl+Z, yeniden kayıt);
// PDF ayır "Üzerine yaz" (tek dosya kuralı canlı, seçili sayfalar ve tek aralık, sekmenin yenilenmesi, bekleyen değişiklik soruları);
// Görüntü / PDF birleştir: varsayılan "Orijinal" (kenar alanı gizli, çıktıda kenar boşluğu yok), "A4'e sığdır"da kenar alanı.
// 0.1.25: varsayılan adlar "Düzenlenmiş", "Birleşik" (0.1.26'dan "Birleştirilmiş"; klasörde varsa "(2)"; hedef addan okunur); Ayır'da
// "Seçili sayfaları çıkart" yerine Sayfa aralıklarına göre + Tek dosya, "Her N sayfada bir" yok (6. bölüm).
// 0.1.13: araç pencerelerinin alt şeridindeki fare/tuş ipucu kalktı (F1 "Kısayollar" penceresine taşındı; 3. bölüm), araçlardaki
// "Kaydetme" bölüm başlığı "Kaydet" oldu (2, 3, 6. bölüm), Sayfaları düzenle'de "PDF'ten sayfa ekle" düğmesi "PDF ekle" (3. bölüm).
// Girdiler test/cikti/ui/pdf altına kopyalanır/üretilir; araçların çıktı klasörü test/cikti/ui/cikti yapılır (Masaüstüne yazılmaz).
// Kullanım: test örneği (baslat.ps1) açıkken  $env:PDEFE_CDP_PORT=9331; node test/surucu.mjs betik test/senaryo13.mjs
// Yalnızca bir bölüm: $env:BOLUM="3" (virgülle birden çok). Ekran görüntüleri test/cikti/ui/png altına yazılır.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 'ui');
const PDF = path.join(UI, 'pdf');
const CIKTI = path.join(UI, 'cikti');
const GORSEL = path.join(UI, 'gorsel');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const MASAUSTU_DENEME = path.join(process.env.USERPROFILE || '', 'Desktop', 'PDF DENEME');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

/** Python (proje .venv) çalıştırır; son satırı JSON olarak döner. test/araclar_testi.py yardımcıları içe aktarılabilir. */
function py(kod) {
  const on = `import sys, json, os, hashlib\nsys.path.insert(0, ${J(path.join(KOK, 'test'))})\nimport pymupdf\n`;
  const cikti = execFileSync(PY, ['-X', 'utf8', '-c', on + kod], { encoding: 'utf8' });
  return JSON.parse(cikti.trim().split(/\r?\n/).pop());
}
const ozet = (yol) => py(`from araclar_testi import sayfa_ozeti, md5\ns, t = sayfa_ozeti(${J(yol)})\nprint(json.dumps({"sayfalar": s, "toc": t, "md5": md5(${J(yol)})}))`);

export default async function ({ evalJs, ekranGoruntusu, bekle, fare, tikla, surukle, tus }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const tema = async (ad) => evalJs(`(() => { const t = document.documentElement.dataset.tema; if (t !== ${J(ad)}) window.__pdefe.komutCalistir('gorunum.tema'); return document.documentElement.dataset.tema; })()`);
  const diyalogYanitla = (yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'mesaj:kutu', ${J(yanitlar)})`);
  const diyalogKaydi = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const sekmeleriKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return window.__pdefe.belgeler.size; })()`);
  const ac = async (yol) => {
    const r = await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); return !!b; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(300);
    return r;
  };
  const aracAc = async (komut, sinif) => { await evalJs(`window.__pdefe.komutCalistir(${J(komut)})`); await kosul(`!!document.querySelector('.${sinif}')`); await bekle(400); };
  const pencereKapat = async () => {
    await evalJs(`document.querySelector('.arac-pencere .arac-kapat')?.click()`);
    return kosul(`!document.querySelector('.arac-ortusu')`, 4000);
  };
  /** Açık araç penceresinin bölüm başlıkları (0.1.13: kayıt bölümü "Kaydetme" değil "Kaydet"). */
  const bolumBasliklari = () => evalJs(`[...document.querySelectorAll('.arac-pencere .arac-bolum-baslik')].map((e) => e.textContent.trim())`);
  /** Açık aracın yeni belge hedefi (0.1.25: varsayılan ad klasördeki dosyalara göre "Düzenlenmiş", "Düzenlenmiş (2)"…). */
  const yeniBelgeHedefi = async () => {
    const r = await evalJs(`(() => { const s = document.querySelector('.arac-pencere .arac-kayit-yeni'); return { klasor: s.querySelector('.arac-klasor-cip').dataset.klasor, ad: s.querySelector('.arac-cikti-ad').value }; })()`);
    return path.join(r.klasor, r.ad + '.pdf');
  };
  const bolumler = (process.env.BOLUM || '1,2,3,4,5,6,7,8').split(',').map((s) => s.trim());
  const bolum = (n) => bolumler.includes(String(n));

  // ------------------------------------------------------------ hazırlık
  fs.mkdirSync(PDF, { recursive: true }); fs.mkdirSync(PNG, { recursive: true }); fs.mkdirSync(GORSEL, { recursive: true });
  fs.rmSync(CIKTI, { recursive: true, force: true }); fs.mkdirSync(CIKTI, { recursive: true });
  for (const ad of ['fdsafsd.pdf', '1.5.6098.pdf']) if (!fs.existsSync(path.join(PDF, ad))) fs.copyFileSync(path.join(MASAUSTU_DENEME, ad), path.join(PDF, ad));
  const zengin = {};
  for (const ad of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) zengin[ad] = path.join(PDF, `zengin_${ad}.pdf`);
  for (const ad of fs.readdirSync(PDF)) if (/^zengin_/.test(ad)) fs.rmSync(path.join(PDF, ad));
  py(`from araclar_testi import zengin_pdf_uret\nfor y in ${J(Object.values(zengin))}: zengin_pdf_uret(y)\nprint("1")`);
  // Hataları topla (sayfa yeniden yüklenmeden); çıktı klasörü Masaüstü yerine test klasörü
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); const ce = console.error; console.error = (...a) => { window.__hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; } return true; })()`);
  // Otomatik kaydetme kapalı: kaydedilmemiş değişiklik soruları denetlenirken sekme kendiliğinden kaydedilmesin
  await evalJs(`(async () => { const a = { ciktiKlasoru: ${J(CIKTI)}, dondurmeKapsami: 'sayfa', otomatikKaydet: false };
    for (const [k, v] of Object.entries(a)) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; } return true; })()`);
  // Sorular ana süreçteki test kuyruğuyla yanıtlanıp kaydedilsin (uygulama içi mesaj kutusu açılmaz; bkz. mesajKutusu.js)
  await evalJs(`(() => { window.__pdefeYerelKutu = true; return true; })()`);
  await diyalogKaydi();
  await sekmeleriKapat();

  // ------------------------------------------------------------ 1) Araçlar penceresi: 5 karo, klavye
  if (bolum(1)) {
    console.log('\n== 1) Araçlar penceresi');
    await ac(path.join(PDF, 'fdsafsd.pdf'));
    for (const t of ['koyu', 'acik']) {
      await tema(t);
      await evalJs(`document.querySelector('#dugme-araclar').click()`);
      await kosul(`!document.querySelector('#araclar-penceresi').hidden`);
      const k = await evalJs(`[...document.querySelectorAll('.araclar-karo')].map((x) => x.dataset.aracKomut)`);
      sonuc(`karolar (${t})`, k.length === 5 && !k.includes('arac.paylas'), k);
      await ss(`01-araclar-5-karo-${t}`);
      if (t === 'koyu') {
        const odak = () => evalJs(`document.activeElement?.dataset?.aracKomut || document.activeElement?.id`);
        const adimlar = [];
        // Alt satır (PDF ayır, Görüntü / PDF birleştir) ortalı: aşağı ok yatayda en yakın karoya, eşitlikte aşağıda sağdakine, yukarıda soldakine
        for (const [tus_, bekl] of [['ArrowRight', 'arac.sayfalar'], ['ArrowRight', 'arac.dondurKaydet'], ['ArrowDown', 'arac.gorselBirlestir'], ['ArrowDown', 'arac.gorselBirlestir'],
          ['ArrowUp', 'arac.sayfalar'], ['ArrowDown', 'arac.gorselBirlestir'], ['ArrowLeft', 'arac.ayir'], ['ArrowUp', 'arac.kucult'], ['ArrowDown', 'arac.ayir'],
          ['ArrowRight', 'arac.gorselBirlestir'], ['ArrowRight', 'arac.kucult'], ['End', 'arac.gorselBirlestir'], ['ArrowUp', 'arac.sayfalar'], ['Home', 'arac.kucult'],
          ['ArrowLeft', 'arac.gorselBirlestir'], ['Tab', 'arac.kucult']]) {
          await tus(tus_);
          const o = await odak();
          adimlar.push(`${tus_}→${o}${o === bekl ? '' : ' (beklenen ' + bekl + ')'}`);
          if (o !== bekl) hataSayisi++;
        }
        console.log('     klavye: ' + adimlar.join(', '));
        sonuc('karolar arasında klavyeyle gezinme (3 + ortalı 2, sarma)', !adimlar.some((a) => a.includes('beklenen')));
      }
      await tus('Escape');
      sonuc(`Esc kapatır (${t})`, await kosul(`document.querySelector('#araclar-penceresi').hidden`, 2000));
    }
    await tema('koyu');
    const menu = await evalJs(`typeof window.__pdefe.komutCalistir`);
    sonuc('Paylaş komutu (araç çubuğu / menü) duruyor', menu === 'function' && await evalJs(`!!document.querySelector('#arac-cubugu [data-komut="arac.paylas"]')`));
  }

  // ------------------------------------------------------------ 2) Kaydetme seçimi: üzerine yazma notları
  if (bolum(2)) {
    console.log('\n== 2) Üzerine yaz notları');
    await sekmeleriKapat();
    await ac(path.join(PDF, 'fdsafsd.pdf'));
    const oku = () => evalJs(`(() => { const n = document.querySelector('.arac-kayit-uzerine'); const s = document.querySelector('.arac-kayit-secim [data-id="uzerine"]'); return { gorunur: !!n && !n.hidden, sinif: n?.className, metin: n?.textContent.trim(), ipucu: s?.title, renk: n && getComputedStyle(n).color, zemin: n && getComputedStyle(n).backgroundColor }; })()`);
    for (const [komut, sinif, ad, geriAlinir] of [['arac.kucult', 'kucult-pencere', 'kucult', false], ['arac.dondurKaydet', 'dondur-pencere', 'dondur', true]]) {
      for (const t of ['koyu', 'acik']) {
        await tema(t);
        await aracAc(komut, sinif);
        if (t === 'koyu') {
          const basliklar = await bolumBasliklari();
          sonuc(`${ad}: kayıt bölümünün başlığı "Kaydet" (0.1.13; önceden "Kaydetme")`, basliklar.includes('Kaydet') && !basliklar.includes('Kaydetme'), basliklar);
        }
        await evalJs(`document.querySelector('.arac-kayit-secim [data-id="uzerine"]').click()`);
        const n = await oku();
        const ok = n.gorunur && (geriAlinir
          ? n.sinif.includes('bilgi') && /Ctrl\+Z ile geri alınabilir/.test(n.metin) && /Ctrl\+Z ile geri alınabilir/.test(n.ipucu)
          : n.sinif.includes('uyari') && /^Geri alınamaz: sonuç "fdsafsd\.pdf" dosyasının yerine yazılır, yedek alınmaz\.$/.test(n.metin) && /geri alınamaz/.test(n.ipucu));
        sonuc(`${ad} üzerine yaz notu (${t})`, ok, n);
        await ss(`02-${ad}-uzerine-${t}`);
        await pencereKapat();
      }
    }
    await tema('koyu');
  }

  // ------------------------------------------------------------ 3) Sayfaları düzenle: alan seçimi (gerçek fare)
  if (bolum(3)) {
    console.log('\n== 3) Sayfaları düzenle: alan seçimi');
    await sekmeleriKapat();
    await ac(path.join(PDF, '1.5.6098.pdf'));
    await aracAc('arac.sayfalar', 'sayfalar-pencere');
    await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 10`);
    const olc = () => evalJs(`(() => { const iz = document.querySelector('.sayfalar-izgara'); const r = iz.getBoundingClientRect();
      return { iz: { x: r.left, y: r.top, w: r.width, h: r.height, cw: iz.clientWidth, ch: iz.clientHeight, st: iz.scrollTop },
        kartlar: [...iz.querySelectorAll(':scope > .sayfa-karti')].map((k) => { const b = k.getBoundingClientRect(); return { no: +k.querySelector('.no').textContent, x: b.left, y: b.top, r: b.right, b: b.bottom }; }) }; })()`);
    const secili = () => evalJs(`[...document.querySelectorAll('.sayfalar-izgara > .sayfa-karti.secili')].map((k) => +k.querySelector('.no').textContent)`);
    const kesisen = (o, x0, y0, x1, y1) => o.kartlar.filter((k) => k.x < Math.max(x0, x1) && k.r > Math.min(x0, x1) && k.y < Math.max(y0, y1) && k.b > Math.min(y0, y1)).map((k) => k.no);
    const sb = { basliklar: await bolumBasliklari(), pdfEkle: await evalJs(`document.querySelector('.sayfalar-arac-cubugu [data-komut="pdfEkle"]')?.textContent.trim()`) };
    sonuc('sayfalar: "Kaydet" başlığı ve "PDF ekle" düğmesi (0.1.13; önceden "Kaydetme", "PDF\'ten sayfa ekle")', sb.basliklar.includes('Kaydet') && !sb.basliklar.includes('Kaydetme') && sb.pdfEkle === 'PDF ekle', sb);
    // 0.1.13 (kullanıcı isteği): alt şeritteki "Tıkla: seç · Delete: sil…" ipucu kaldırıldı; fare ve tuş kullanımı F1 Kısayollar'da (aşağıda)
    const alt = await evalJs(`(() => { const s = document.querySelector('.sayfalar-pencere .arac-dugmeler-sol'); return { metinOgesi: !!document.querySelector('.arac-alt-metin'), solMetin: (s?.textContent || '').replace(/\\u00a0/g, ' ').trim() }; })()`);
    sonuc('alt şeritte ipucu yok (F1 Kısayollar\'a taşındı)', !alt.metinOgesi && !/Tıkla|sürükle|Delete|Ctrl\+Z/.test(alt.solMetin), alt);
    let o = await olc();
    const bx = Math.round(o.iz.x + 6), by = Math.round(o.iz.y + 6);          // ızgaranın iç boşluğu: kart değil
    const k7 = o.kartlar[6];
    const hx = Math.round((k7.x + k7.r) / 2), hy = Math.round((k7.y + k7.b) / 2);
    // a) Sürüklerken canlı seçim + dikdörtgen (bırakmadan ekran görüntüsü)
    const adimlar = [{ tur: 'hareket', x: bx, y: by }, { tur: 'bas', x: bx, y: by, bekle: 30 }];
    for (let i = 1; i <= 10; i++) adimlar.push({ tur: 'hareket', x: Math.round(bx + (hx - bx) * i / 10), y: Math.round(by + (hy - by) * i / 10), bekle: 20 });
    await fare(adimlar);
    const canli = await secili();
    const dikdortgen = await evalJs(`(() => { const d = document.querySelector('.sayfalar-alan-secimi'); return d ? d.getBoundingClientRect().width > 20 : false; })()`);
    await ss('03-alan-secimi-surerken-koyu');
    await fare([{ tur: 'birak', x: hx, y: hy }]);
    const beklenen = kesisen(o, bx, by, hx, hy);
    const son = await secili();
    sonuc('sürüklerken canlı seçim ve dikdörtgen', dikdortgen && J(canli) === J(beklenen), { canli, beklenen });
    sonuc('bırakınca seçim kalır (bırakıştaki tıklama seçimi silmez)', J(son) === J(beklenen) && !(await evalJs(`!!document.querySelector('.sayfalar-alan-secimi')`)), son);
    // b) Ctrl ile sürükleme önceki seçime ekler; değiştiricisiz sürükleme yerine koyar
    const k10 = o.kartlar[9];
    await tikla(Math.round((k10.x + k10.r) / 2), Math.round(k10.y + 20));
    const kx = Math.round(o.iz.x + 6), ky = Math.round((o.kartlar[0].b + o.kartlar[5].y) / 2);   // 1. ve 2. satır arasındaki boşluk
    const k2 = o.kartlar[1];
    await surukle(kx, ky, Math.round((k2.x + k2.r) / 2), Math.round(o.kartlar[0].y + 30), { degistiriciler: ['ctrl'] });
    const ctrlSecim = await secili();
    const ctrlBeklenen = [...new Set([...kesisen(o, kx, ky, (k2.x + k2.r) / 2, o.kartlar[0].y + 30), 10])].sort((a, b) => a - b);
    sonuc('Ctrl + sürükleme seçime ekler', J(ctrlSecim) === J(ctrlBeklenen), { ctrlSecim, ctrlBeklenen });
    await surukle(kx, ky, Math.round((k2.x + k2.r) / 2), Math.round(o.kartlar[0].y + 30));
    const yalin = await secili();
    sonuc('değiştiricisiz sürükleme seçimin yerini alır', !yalin.includes(10) && yalin.length > 0, yalin);
    // c) Esc sürüklemeyi iptal eder, önceki seçim geri gelir; pencere kapanmaz
    const once = await secili();
    await fare([{ tur: 'hareket', x: bx, y: by }, { tur: 'bas', x: bx, y: by, bekle: 30 }, { tur: 'hareket', x: bx + 60, y: by + 60, bekle: 30 }, { tur: 'hareket', x: hx, y: hy, bekle: 60 }]);
    await tus('Escape');
    const iptalde = await evalJs(`({ dikdortgen: !!document.querySelector('.sayfalar-alan-secimi'), pencere: !!document.querySelector('.sayfalar-pencere') })`);
    await tus('Escape');   // bırakmadan ikinci Esc de pencereyi kapatmaz
    await bekle(400);      // bırakış geç gelse de tıklaması seçimi değiştirmez
    await fare([{ tur: 'birak', x: hx, y: hy }]);
    sonuc('Esc alan seçimini iptal eder (dikdörtgen kalkar, pencere açık, bırakış seçimi değiştirmez)', !iptalde.dikdortgen && iptalde.pencere
      && J(await secili()) === J(once) && await evalJs(`!!document.querySelector('.sayfalar-pencere')`), { iptalde, secili: await secili() });
    // d) Kıpırdamadan tıklama (boş alan): bugünkü gibi seçimi kaldırır
    await tikla(bx, by);
    sonuc('boş alana tıklama seçimi kaldırır', (await secili()).length === 0);
    // e) Kenarda otomatik kaydırma: ızgaranın altına inip basılı tutunca kayar, yeni kartlar seçilir
    o = await olc();
    await fare([{ tur: 'hareket', x: bx, y: by }, { tur: 'bas', x: bx, y: by, bekle: 30 }, { tur: 'hareket', x: bx + 300, y: Math.round(o.iz.y + o.iz.h / 2), bekle: 50 },
      { tur: 'hareket', x: bx + 300, y: Math.round(o.iz.y + o.iz.h + 20), bekle: 1500 }]);
    const kay = await evalJs(`document.querySelector('.sayfalar-izgara').scrollTop`);
    await ss('03-alan-secimi-otomatik-kaydirma-koyu');
    await fare([{ tur: 'birak', x: bx + 300, y: Math.round(o.iz.y + o.iz.h + 20) }]);
    const oto = await secili();
    sonuc('alt kenarda otomatik kaydırma ve seçim', kay > 300 && oto.length > 20 && oto[0] === 1, { scrollTop: kay, secili: oto.length, ilk: oto[0], son: oto[oto.length - 1] });
    await fare([{ tur: 'hareket', x: bx + 300, y: Math.round(o.iz.y + o.iz.h - 20) }]);
    // Yukarı kenar: aşağıdan başlayıp yukarı taşınca geri kayar
    o = await olc();
    const altBos = { x: Math.round(o.iz.x + 6), y: Math.round(o.iz.y + o.iz.h - 8) };
    await fare([{ tur: 'hareket', ...altBos }, { tur: 'bas', ...altBos, bekle: 30 }, { tur: 'hareket', x: altBos.x + 200, y: Math.round(o.iz.y - 15), bekle: 700 }]);
    const kay2 = await evalJs(`document.querySelector('.sayfalar-izgara').scrollTop`);
    await fare([{ tur: 'birak', x: altBos.x + 200, y: Math.round(o.iz.y - 15) }]);
    sonuc('üst kenarda otomatik kaydırma', kay2 < kay, { once: kay, sonra: kay2 });
    // f) Karttan başlayan sürükleme hâlâ sıralar (alan seçimi başlamaz)
    await evalJs(`document.querySelector('.sayfalar-izgara').scrollTop = 0`);
    await bekle(200);
    o = await olc();
    const [c1, c4] = [o.kartlar[0], o.kartlar[3]];
    await tikla(Math.round((c1.x + c1.r) / 2), Math.round(c1.y + 40));
    await surukle(Math.round((c1.x + c1.r) / 2), Math.round(c1.y + 40), Math.round(c4.r - 10), Math.round(c4.y + 60));
    const sira = await evalJs(`[...document.querySelectorAll('.sayfalar-izgara > .sayfa-karti')].slice(0, 5).map((k) => k.title.replace(/^.* — sayfa (\\d+).*$/, '$1'))`);
    sonuc('karttan sürükleme sıralar', sira[0] === '2' && sira.indexOf('1') === 3, sira);
    await tus('z', ['ctrl']);
    const sira2 = await evalJs(`[...document.querySelectorAll('.sayfalar-izgara > .sayfa-karti')].slice(0, 3).map((k) => k.title.replace(/^.* — sayfa (\\d+).*$/, '$1'))`);
    sonuc('pencere içi Ctrl+Z sıralamayı geri alır', sira2[0] === '1', sira2);
    // Görünüm: açık tema, kaydetme şeridi
    await tikla(bx, by);
    await surukle(bx, by, hx, hy);
    await tema('acik'); await ss('03-sayfalar-alan-secimi-acik');
    await tema('koyu'); await ss('03-sayfalar-alan-secimi-koyu');
    sonuc('pencere kapanır (düzen değişmedi: soru yok)', await pencereKapat() && (await diyalogKaydi()).length === 0);
    // Alt şeritten taşınan ipucu F1 "Kısayollar" penceresinde (0.1.13; başlık önceden "Klavye kısayolları")
    await evalJs(`window.__pdefe.komutCalistir('yardim.kisayollar')`);
    await kosul(`!!document.querySelector('.diyalog-ortusu')`, 3000);
    const kys = await evalJs(`(() => { const o = document.querySelector('.diyalog-ortusu'); return o ? { baslik: o.querySelector('.baslik').textContent, bolumler: [...o.querySelectorAll('tr.bolum th')].map((e) => e.textContent), metin: o.querySelector('.govde').innerText } : null; })()`);
    sonuc('F1 "Kısayollar": Sayfaları düzenle ve Görüntü / PDF birleştir bölümleri (alan seçimi, sıralama)', kys?.baslik === 'Kısayollar' && kys.bolumler.includes('Sayfaları düzenle')
      && kys.bolumler.includes('Görüntü / PDF birleştir') && /Boş alandan sürükle/.test(kys.metin) && /Sayfayı sürükle/.test(kys.metin), kys && { baslik: kys.baslik, bolumler: kys.bolumler });
    await ss('03-kisayollar-koyu');
    await tus('Escape');
    sonuc('Kısayollar Esc ile kapanır', !!(await kosul(`!document.querySelector('.diyalog-ortusu')`, 2000)));
  }

  // ------------------------------------------------------------ 4) Sayfaları düzenle: Yeni belge olarak kaydet
  if (bolum(4)) {
    console.log('\n== 4) Sayfaları düzenle: yeni belge');
    await sekmeleriKapat();
    const once = ozet(zengin.a);
    await ac(zengin.a);
    await aracAc('arac.sayfalar', 'sayfalar-pencere');
    await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 8`);
    const kart = (i) => `document.querySelectorAll('.sayfalar-izgara > .sayfa-karti')[${i}]`;
    const kartTikla = async (i, degistiriciler = []) => {
      const r = await evalJs(`(() => { const b = ${kart(i)}.getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + 40)]; })()`);
      await tikla(r[0], r[1], { degistiriciler });
    };
    const kayit = await evalJs(`(() => { const s = document.querySelector('.sayfalar-kayit'); return { kip: s.querySelector('.arac-kayit-secim .secili')?.dataset.id, ad: s.querySelector('.arac-cikti-ad')?.value, klasor: s.querySelector('.arac-klasor-cip')?.dataset.klasor, dugme: document.querySelector('.arac-dugmeler [data-id="kaydet"]')?.textContent, devre: document.querySelector('.arac-dugmeler [data-id="kaydet"]')?.disabled }; })()`);
    // 0.1.12: ad kutusunda uzantı görünmez; kaydederken .pdf eklenir. 0.1.25: varsayılan ad "Düzenlenmiş" (klasörde varsa "(2)"…)
    sonuc('varsayılan: Yeni belge, "Düzenlenmiş" (uzantısız), çıktı klasörü, Kaydet (değişiklik yokken pasif)',
      kayit.kip === 'yeni' && /^Düzenlenmiş( \(\d+\))?$/.test(kayit.ad) && kayit.klasor === CIKTI && kayit.dugme === 'Kaydet' && kayit.devre === true, kayit);
    await ss('04-sayfalar-yeni-belge-koyu');
    // 4. sayfayı sil, 3. sayfayı saat yönünde döndür (1-3 ardışık kalır: 1. sayfadaki 3. sayfaya iç bağlantı korunur; insert_pdf
    // kopyalanan aralığın dışını gösteren iç bağlantıyı atar, yapısal kayıttaki gibi)
    await kartTikla(3); await tus('Delete');
    await kartTikla(2); await tus('r');
    await tema('acik'); await ss('04-sayfalar-yeni-belge-acik'); await tema('koyu');
    const hedef = await yeniBelgeHedefi();
    if (!(await evalJs(`document.querySelector('.sayfalar-kayit .arac-klasor-cip').dataset.klasor === ${J(CIKTI)}`))) throw new Error('çıktı klasörü test klasörü değil; Masaüstüne yazılmasın');
    await evalJs(`document.querySelector('.arac-dugmeler [data-id="kaydet"]').click()`);
    await kosul(`!document.querySelector('.sayfalar-pencere') && window.__pdefe.belgeler.size === 2`, 15000);
    await bekle(800);
    const sekmeler = await evalJs(`[...window.__pdefe.belgeler.values()].map((b) => ({ ad: b.ad, degisti: b.degisti, sayfa: b.gorunum.sayfaSayisi }))`);
    const yeni = ozet(hedef), sonra = ozet(zengin.a);
    const sorular = await diyalogKaydi();
    sonuc('yeni belge yazıldı ve yeni sekmede açıldı; özgün sekme değişmedi',
      sekmeler.length === 2 && sekmeler[1].ad === path.basename(hedef) && sekmeler[1].sayfa === 7 && !sekmeler[0].degisti && sekmeler[0].sayfa === 8, sekmeler);
    sonuc('özgün dosya değişmedi', once.md5 === sonra.md5);
    sonuc('yeni belge: sıra, döndürme, notlar, bağlantılar, yer imleri',
      J(yeni.sayfalar.map((s) => s.metin)) === J(['Sayfa 1', 'Sayfa 2', 'Sayfa 3', 'Sayfa 5', 'Sayfa 6', 'Sayfa 7', 'Sayfa 8'])
      && J(yeni.sayfalar.map((s) => s.rot)) === J([0, 0, 90, 0, 0, 0, 0]) && yeni.sayfalar.every((s) => s.not.length === 2)
      && J(yeni.sayfalar[0].baglanti) === J([2]) && J(yeni.sayfalar[1].baglanti) === J(['https://example.com/pdefe'])
      && J(yeni.toc) === J([['Bölüm A', 1], ['A.1', 2], ['A.2', 3], ['B.1', 4], ['B.2', 5], ['Bölüm C', 6], ['C.1', 7]]),
    { metin: yeni.sayfalar.map((s) => s.metin), rot: yeni.sayfalar.map((s) => s.rot), not: yeni.sayfalar.map((s) => s.not.length), baglanti: yeni.sayfalar.map((s) => s.baglanti), toc: yeni.toc });
    sonuc('temiz sekmede soru sorulmadı', sorular.length === 0, sorular.map((s) => s.secenek?.mesaj));
    // Bekleyen not: sorulur; "Kaydetmeden devam et" → yeni belge dosyadaki kayıtlı notlarla (bekleyen not girmez), sekme kirli kalır
    await evalJs(`window.__pdefe.sekmeSec([...window.__pdefe.belgeler.keys()][0])`);
    await bekle(300);
    await evalJs(`window.__pdefe.aktif().notlar.ekle({ tur: 'Text', sayfa: 1, rect: [100, 700, 120, 720], icerik: 'bekleyen not', yazar: 'Test', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' })`);
    await kosul(`window.__pdefe.aktif().degisti`);
    await aracAc('arac.sayfalar', 'sayfalar-pencere');
    await kartTikla(7); await tus('Delete');                // 8. sayfayı sil
    await diyalogYanitla([{ secim: 1 }]);                  // Kaydetmeden devam et
    const hedef2 = await yeniBelgeHedefi();
    await evalJs(`document.querySelector('.arac-dugmeler [data-id="kaydet"]').click()`);
    await kosul(`!document.querySelector('.sayfalar-pencere') && window.__pdefe.belgeler.size === 3`, 15000);
    await bekle(800);
    const sorular2 = await diyalogKaydi();
    const yeni2 = ozet(hedef2);
    const ilk = await evalJs(`(() => { const b = [...window.__pdefe.belgeler.values()][0]; return { degisti: b.degisti, sayfa: b.gorunum.sayfaSayisi }; })()`);
    sonuc('bekleyen notta sorulur (Kaydet ve devam et / Kaydetmeden devam et / Vazgeç)',
      sorular2.length === 1 && sorular2[0].secenek.dugmeler.length === 3 && /kaydedilmemiş not değişiklikleri yeni belgeye girmez/.test(sorular2[0].secenek.ayrinti), sorular2.map((s) => [s.secenek?.mesaj, s.secenek?.ayrinti, s.secenek?.dugmeler]));
    sonuc('Kaydetmeden devam et: bekleyen not yeni belgede yok, sekme kirli kalır, "(2)" adı',
      path.basename(hedef2) === path.basename(hedef, '.pdf') + ' (2).pdf' && yeni2.sayfalar.length === 7 && yeni2.sayfalar[0].not.length === 2 && ilk.degisti && ilk.sayfa === 8, { not: yeni2.sayfalar.map((s) => s.not.length), ilk });
  }

  // ------------------------------------------------------------ 5) Sayfaları düzenle: Üzerine yaz (+ Ctrl+Z)
  if (bolum(5)) {
    console.log('\n== 5) Sayfaları düzenle: üzerine yaz');
    await sekmeleriKapat();
    await ac(zengin.b);
    await aracAc('arac.sayfalar', 'sayfalar-pencere');
    await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 8`);
    await evalJs(`document.querySelector('.sayfalar-kayit .arac-kayit-secim [data-id="uzerine"]').click()`);
    const not_ = await evalJs(`(() => { const n = document.querySelector('.sayfalar-kayit .arac-kayit-uzerine'); return { gorunur: !n.hidden, sinif: n.className, metin: n.textContent.trim(), dugmeIpucu: document.querySelector('.arac-dugmeler [data-id="kaydet"]').title }; })()`);
    sonuc('üzerine yaz notu: Ctrl+Z ile geri alınabilir (bilgi)', not_.gorunur && not_.sinif.includes('bilgi') && /Belgeye uygulanıp "zengin_b\.pdf" dosyasına kaydedilir; Ctrl\+Z ile geri alınabilir\./.test(not_.metin), not_);
    // 7. ve 8. sayfayı sil (alan seçimiyle: 2. satırın sağ ucundaki boşluktan), 1. sayfayı döndür
    const r = await evalJs(`(() => { const k = [...document.querySelectorAll('.sayfalar-izgara > .sayfa-karti')].map((x) => x.getBoundingClientRect()); const iz = document.querySelector('.sayfalar-izgara').getBoundingClientRect(); return { k7: [k[6].left, k[6].top], k8: [k[7].right, k[7].bottom], sag: iz.right - 20 }; })()`);
    await surukle(Math.round(r.sag), Math.round(r.k8[1] - 20), Math.round(r.k7[0] + 20), Math.round(r.k7[1] + 30));
    const sec = await evalJs(`[...document.querySelectorAll('.sayfalar-izgara > .sayfa-karti.secili')].map((k) => +k.querySelector('.no').textContent)`);
    sonuc('alan seçimi 7-8. sayfaları seçti', J(sec) === J([7, 8]), sec);
    await tus('Delete');
    const k1 = await evalJs(`(() => { const b = document.querySelector('.sayfalar-izgara > .sayfa-karti').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + 40)]; })()`);
    await tikla(k1[0], k1[1]); await tus('r');
    await ss('05-sayfalar-uzerine-yaz-koyu');
    await tema('acik'); await ss('05-sayfalar-uzerine-yaz-acik'); await tema('koyu');
    const once = ozet(zengin.b);
    await evalJs(`document.querySelector('.arac-dugmeler [data-id="kaydet"]').click()`);
    await kosul(`!document.querySelector('.sayfalar-pencere') && !window.__pdefe.aktif().kaydediliyor && !window.__pdefe.aktif().degisti`, 15000);
    await bekle(500);
    const sonra = ozet(zengin.b);
    const sorular = await diyalogKaydi();
    sonuc('üzerine yaz: sekmeye uygulandı ve kaydedildi (soru yok)', sorular.length === 0 && sonra.sayfalar.length === 6 && sonra.sayfalar[0].rot === 90
      && J(sonra.sayfalar.map((s) => s.metin)) === J(['Sayfa 1', 'Sayfa 2', 'Sayfa 3', 'Sayfa 4', 'Sayfa 5', 'Sayfa 6']) && sonra.sayfalar.every((s) => s.not.length === 2),
    { sayfa: sonra.sayfalar.length, rot: sonra.sayfalar.map((s) => s.rot), not: sonra.sayfalar.map((s) => s.not.length), sorular: sorular.length });
    // Ctrl+Z (gerçek tuş, belge odaktayken) düzeni geri alır; kaydedince dosya eski haline döner
    await evalJs(`window.__pdefe.aktif().gorunum.kaydirici.focus()`);
    await tus('z', ['ctrl']);
    await kosul(`window.__pdefe.aktif().degisti && window.__pdefe.aktif().gorunum.sayfaSayisi === 8`);
    const geri = await evalJs(`({ sayfa: window.__pdefe.aktif().gorunum.sayfaSayisi, degisti: window.__pdefe.aktif().degisti })`);
    sonuc('Ctrl+Z üzerine yazılan düzeni sekmede geri alır', geri.sayfa === 8 && geri.degisti, geri);
    await evalJs(`window.__pdefe.komutCalistir('dosya.kaydet')`);
    await kosul(`!window.__pdefe.aktif().kaydediliyor && !window.__pdefe.aktif().degisti`, 15000);
    await bekle(500);
    const geriKayit = ozet(zengin.b);
    sonuc('geri alınıp kaydedilince dosya eski düzende', geriKayit.sayfalar.length === 8 && geriKayit.sayfalar.every((s) => s.rot === 0 && s.not.length === 2)
      && J(geriKayit.sayfalar.map((s) => s.metin)) === J(once.sayfalar.map((s) => s.metin)), { sayfa: geriKayit.sayfalar.length, not: geriKayit.sayfalar.map((s) => s.not.length) });
    // Sekmede başka kaydedilmemiş değişiklik varken: yalnızca "Kaydet ve devam et / Vazgeç" sorulur; Vazgeç hiçbir şeye dokunmaz
    await evalJs(`window.__pdefe.aktif().notlar.ekle({ tur: 'Text', sayfa: 2, rect: [100, 700, 120, 720], icerik: 'bekleyen', yazar: 'Test', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' })`);
    await aracAc('arac.sayfalar', 'sayfalar-pencere');
    await evalJs(`document.querySelector('.sayfalar-kayit .arac-kayit-secim [data-id="uzerine"]').click()`);
    await tikla(k1[0], k1[1]); await tus('r');
    await diyalogYanitla([{ secim: 1 }]);   // Vazgeç
    await evalJs(`document.querySelector('.arac-dugmeler [data-id="kaydet"]').click()`);
    await bekle(1200);
    const sorular2 = await diyalogKaydi();
    const durum = await evalJs(`({ pencere: !!document.querySelector('.sayfalar-pencere'), sayfa: window.__pdefe.aktif().gorunum.sayfaSayisi, rot: window.__pdefe.aktif().gorunum.sayfalar[0].dondurme })`);
    sonuc('başka değişiklik varken sorulur (2 düğme); Vazgeç sekmeye dokunmaz', sorular2.length === 1 && sorular2[0].secenek.dugmeler.length === 2 && durum.pencere && durum.rot === 0,
      { soru: sorular2.map((s) => [s.secenek?.ayrinti, s.secenek?.dugmeler]), durum });
    await diyalogYanitla([{ secim: 1 }]);   // Kaydetme (kaydedilmemiş düzen atılır; 0.1.12: Kaydet | Kaydetme | Vazgeç)
    await pencereKapat();
    const kapatSoru = await diyalogKaydi();
    sonuc('pencereyi kapatırken kaydedilmemiş düzen sorulur', kapatSoru.length === 1 && /kaydedilmemiş değişiklikler/.test(kapatSoru[0].secenek.mesaj), kapatSoru.map((s) => s.secenek?.mesaj));
  }

  // ------------------------------------------------------------ 6) PDF ayır: üzerine yaz
  if (bolum(6)) {
    console.log('\n== 6) PDF ayır: üzerine yaz');
    await sekmeleriKapat();
    await ac(zengin.c);
    await aracAc('arac.ayir', 'ayir-pencere');
    const ayirBasliklar = await bolumBasliklari();
    sonuc('ayir: kayıt bölümünün başlığı "Kaydet" (0.1.13; önceden "Kaydetme")', ayirBasliklar.includes('Kaydet') && !ayirBasliklar.includes('Kaydetme'), ayirBasliklar);
    const durum = () => evalJs(`(() => { const u = document.querySelector('.ayir-pencere .arac-kayit-secim [data-id="uzerine"]'); const k = document.querySelector('.ayir-pencere .arac-kayit-kisit'); const n = document.querySelector('.ayir-pencere .arac-kayit-uzerine');
      return { etkin: !u.disabled, kip: document.querySelector('.ayir-pencere .arac-kayit-secim .secili').dataset.id, kisit: k.hidden ? '' : k.textContent, ipucu: u.title, not: n.hidden ? '' : n.textContent.trim(), notSinif: n.className,
        onizleme: document.querySelector('.ayir-onizleme').textContent.replace(/\\s+/g, ' ').trim(), adlar: !document.querySelector('.ayir-adlar').hidden, ayir: !document.querySelector('.arac-dugmeler [data-id="ayir"]').disabled }; })()`);
    const mod = (m) => evalJs(`document.querySelector('input[name="ayir-mod"][value="${m}"]').click()`);
    const tekDosya = () => evalJs(`document.querySelector('.ayir-dosya-kipi-secim [data-id="tek"]').click()`);
    const yazIn = (sinif, v) => evalJs(`(() => { const g = document.querySelector('.${sinif}'); g.value = ${J(v)}; g.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    let d = await durum();
    sonuc('aralık kipinde, boş kutu: üzerine yaz seçilebilir, varsayılan yeni belge', d.etkin && d.kip === 'yeni', d);
    await yazIn('ayir-aralik', '1-3, 5');
    d = await durum();
    sonuc('birden çok aralık: üzerine yaz devre dışı ve nedeni yazılı', !d.etkin && /Birden çok dosya üreten ayırmada yalnızca yeni belge olarak kaydedilir/.test(d.kisit) && d.ipucu === d.kisit, d);
    await ss('06-ayir-coklu-devre-disi-koyu');
    await yazIn('ayir-aralik', '2-4');
    d = await durum();
    sonuc('tek aralık: üzerine yaz yeniden seçilebilir', d.etkin && !d.kisit, d);
    await evalJs(`document.querySelector('.ayir-pencere .arac-kayit-secim [data-id="uzerine"]').click()`);
    d = await durum();
    sonuc('üzerine yaz: geri alınamaz uyarısı ve kalan sayfalar önizlemesi', d.kip === 'uzerine' && d.notSinif.includes('uyari') && /^Geri alınamaz: sonuç "zengin_c\.pdf" dosyasının yerine yazılır, yedek alınmaz\.$/.test(d.not)
      && /"zengin_c\.pdf" dosyasında yalnızca 3 sayfa kalır \(2-4\); diğer 5 sayfa silinir\./.test(d.onizleme) && !d.adlar, d);
    await ss('06-ayir-uzerine-aralik-koyu');
    await mod('herSayfa');
    d = await durum();
    sonuc('her sayfa ayrı dosya: devre dışı, yeni belgeye geçildi (canlı)', !d.etkin && d.kip === 'yeni' && d.adlar && !!d.kisit, d);
    // 0.1.25: "Seçili sayfaları çıkart" yerine Sayfa aralıklarına göre + Tek dosya
    await mod('aralik');
    await tekDosya();
    await yazIn('ayir-aralik', '7, 2, 5');
    d = await durum();
    sonuc('tek dosya (seçili sayfalar): seçilebilir (kendiliğinden üzerine yaza dönmez)', d.etkin && d.kip === 'yeni' && !d.kisit, d);
    await evalJs(`document.querySelector('.ayir-pencere .arac-kayit-secim [data-id="uzerine"]').click()`);
    await ss('06-ayir-uzerine-secili-koyu');
    await tema('acik'); await ss('06-ayir-uzerine-secili-acik');
    await mod('herSayfa'); await ss('06-ayir-coklu-devre-disi-acik'); await mod('aralik');
    await evalJs(`document.querySelector('.ayir-pencere .arac-kayit-secim [data-id="uzerine"]').click()`);
    await tema('koyu');
    const oncekiDosyalar = fs.readdirSync(PDF).sort();
    await evalJs(`document.querySelector('.arac-dugmeler [data-id="ayir"]').click()`);
    await kosul(`!document.querySelector('.ayir-pencere') && window.__pdefe.aktif()?.gorunum?.sayfaSayisi === 3`, 15000);
    await bekle(600);
    const c = ozet(zengin.c);
    const sekme = await evalJs(`({ sayfa: window.__pdefe.aktif().gorunum.sayfaSayisi, degisti: window.__pdefe.aktif().degisti, ad: window.__pdefe.aktif().ad, adet: window.__pdefe.belgeler.size })`);
    sonuc('seçili sayfalar üzerine yazıldı: yalnızca 2, 5, 7; notlar ve yer imleri; sekme yeniden açıldı',
      J(c.sayfalar.map((s) => s.metin)) === J(['Sayfa 2', 'Sayfa 5', 'Sayfa 7']) && c.sayfalar.every((s) => s.not.length === 2) && J(c.toc.map((t) => t[0])) === J(['A.1', 'B.1', 'Bölüm C'])
      && sekme.sayfa === 3 && !sekme.degisti && sekme.adet === 1, { metin: c.sayfalar.map((s) => s.metin), toc: c.toc, sekme });
    sonuc('"(2)" adı ya da geçici dosya yok, çıktı klasörüne dosya yazılmadı', J(fs.readdirSync(PDF).sort()) === J(oncekiDosyalar) && fs.readdirSync(CIKTI).every((a) => !/zengin_c/.test(a)),
      fs.readdirSync(PDF).filter((a) => /zengin_c|pdefe-tmp/.test(a)));
    // Tek aralık, sekmede bekleyen not: "Kaydetmeden devam et" → üzerine yazılır, sekme yenilenirken "Değişiklikleri at ve yeniden aç" sorulur
    await sekmeleriKapat();
    await ac(zengin.d);
    await evalJs(`window.__pdefe.aktif().notlar.ekle({ tur: 'Text', sayfa: 1, rect: [100, 700, 120, 720], icerik: 'bekleyen', yazar: 'Test', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' })`);
    await aracAc('arac.ayir', 'ayir-pencere');
    await yazIn('ayir-aralik', '3-6');
    await evalJs(`document.querySelector('.ayir-pencere .arac-kayit-secim [data-id="uzerine"]').click()`);
    await diyalogYanitla([{ secim: 1 }, { secim: 0 }]);   // Kaydetmeden devam et; Değişiklikleri at ve yeniden aç
    await evalJs(`document.querySelector('.arac-dugmeler [data-id="ayir"]').click()`);
    await kosul(`!document.querySelector('.ayir-pencere') && window.__pdefe.aktif()?.gorunum?.sayfaSayisi === 4`, 15000);
    await bekle(600);
    const sorular = await diyalogKaydi();
    const dd = ozet(zengin.d);
    const sekme2 = await evalJs(`({ sayfa: window.__pdefe.aktif().gorunum.sayfaSayisi, degisti: window.__pdefe.aktif().degisti })`);
    sonuc('tek aralık üzerine yazıldı (3-6), bekleyen değişiklik iki kez soruldu, sekme yenilendi',
      J(dd.sayfalar.map((s) => s.metin)) === J(['Sayfa 3', 'Sayfa 4', 'Sayfa 5', 'Sayfa 6']) && dd.sayfalar[0].not.length === 2 && sorular.length === 2
      && /yeniden açılır ve kaydedilmemiş değişiklikler atılır/.test(sorular[0].secenek.ayrinti) && /Değişiklikleri at ve yeniden aç/.test(sorular[1].secenek.dugmeler[0]) && sekme2.sayfa === 4 && !sekme2.degisti,
    { metin: dd.sayfalar.map((s) => s.metin), sorular: sorular.map((s) => [s.secenek?.mesaj, s.secenek?.dugmeler]), sekme2 });
    // Salt okunur dosya: önceden sorulur (Yeni belge olarak kaydet / Yeniden dene / Vazgeç); Vazgeç → dosya değişmez
    await sekmeleriKapat();
    fs.chmodSync(zengin.e, 0o444);
    try {
      await ac(zengin.e);
      await aracAc('arac.ayir', 'ayir-pencere');
      await yazIn('ayir-aralik', '1');
      await evalJs(`document.querySelector('.ayir-pencere .arac-kayit-secim [data-id="uzerine"]').click()`);
      const once = ozet(zengin.e);
      await diyalogYanitla([{ secim: 2 }]);   // Vazgeç
      await evalJs(`document.querySelector('.arac-dugmeler [data-id="ayir"]').click()`);
      await bekle(1500);
      const sorular3 = await diyalogKaydi();
      sonuc('salt okunur özgün dosya: sorulur, Vazgeç ile dosya değişmez', sorular3.length === 1 && /salt okunur/.test(sorular3[0].secenek.mesaj)
        && sorular3[0].secenek.dugmeler[0] === 'Yeni belge olarak kaydet' && ozet(zengin.e).md5 === once.md5 && await evalJs(`!!document.querySelector('.ayir-pencere')`),
      sorular3.map((s) => [s.secenek?.mesaj, s.secenek?.dugmeler]));
      await pencereKapat();
    } finally { fs.chmodSync(zengin.e, 0o666); }
    // Sekmede kaydedilmemiş sayfa silme: numaralar dosyadakiyle uyuşmaz → yalnızca "Kaydet ve devam et / Vazgeç"; Vazgeç dosyaya dokunmaz
    await sekmeleriKapat();
    await ac(zengin.g);
    await evalJs(`(async () => { const b = window.__pdefe.aktif(); await window.__pdefe.sayfaTarifiUygula(b, b.gorunum.tarif().slice(1), 'Test: 1. sayfayı sil'); return b.degisti; })()`);
    await aracAc('arac.ayir', 'ayir-pencere');
    await yazIn('ayir-aralik', '1');
    await evalJs(`document.querySelector('.ayir-pencere .arac-kayit-secim [data-id="uzerine"]').click()`);
    const onceG = ozet(zengin.g);
    await diyalogYanitla([{ secim: 1 }]);   // Vazgeç
    await evalJs(`document.querySelector('.arac-dugmeler [data-id="ayir"]').click()`);
    await bekle(1200);
    const sorularG = await diyalogKaydi();
    sonuc('kaydedilmemiş sayfa silmede yalnızca kaydedip devam (numaralar uyuşmaz); Vazgeç dosyaya dokunmaz', sorularG.length === 1 && sorularG[0].secenek.dugmeler.length === 2
      && /numaraları dosyadakiyle uyuşmuyor/.test(sorularG[0].secenek.ayrinti) && ozet(zengin.g).md5 === onceG.md5 && await evalJs(`!!document.querySelector('.ayir-pencere')`),
    sorularG.map((x) => [x.secenek?.ayrinti, x.secenek?.dugmeler]));
    await pencereKapat();
  }

  // ------------------------------------------------------------ 7) Görüntü / PDF birleştir: varsayılan Orijinal, kenarsız
  if (bolum(7)) {
    console.log('\n== 7) Görüntü birleştir: Orijinal');
    await sekmeleriKapat();
    const gorseller = py(`from PIL import Image, ImageDraw
k = ${J(GORSEL)}
def cerceve(boyut, kip="RGB", t=8):
    s = kip == "RGBA"
    im = Image.new(kip, boyut, (200, 30, 30) + ((255,) if s else ()))
    ImageDraw.Draw(im).rectangle((t, t, boyut[0] - 1 - t, boyut[1] - 1 - t), fill=(40, 90, 200) + ((110,) if s else ()))
    return im
y = {"jpeg": os.path.join(k, "foto.jpg"), "png": os.path.join(k, "ekran.png"), "saydam": os.path.join(k, "saydam.png"), "exif": os.path.join(k, "telefon_exif6.jpg")}
cerceve((1200, 900)).save(y["jpeg"], quality=92)
cerceve((640, 480)).save(y["png"])
cerceve((500, 400), "RGBA").save(y["saydam"])
e = Image.Exif(); e[0x0112] = 6
cerceve((4032, 3024), t=24).save(y["exif"], quality=90, exif=e.tobytes())
print(json.dumps(y))`);
    await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir', ${J(Object.values(gorseller))})`);
    await kosul(`document.querySelectorAll('.birlestir-oge').length === 4 && !document.querySelector('.birlestir-oge.yukleniyor')`, 15000);
    const kenarGorunur = () => evalJs(`[...document.querySelectorAll('.birlestir-oge')].map((o) => !o.querySelector('.oge-kenar-alani').hidden)`);
    const sayfaSecimi = (deger) => evalJs(`(() => { for (const s of document.querySelectorAll('.oge-sayfa-boyutu')) { s.value = ${J(deger)}; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
    const secimler = await evalJs(`[...document.querySelectorAll('.oge-sayfa-boyutu')].map((s) => s.value + ':' + s.selectedOptions[0].textContent)`);
    const secenekAdlari = await evalJs(`[...document.querySelector('.oge-sayfa-boyutu').options].map((o) => o.textContent)`);
    sonuc('Orijinal (varsayılan): kenar ayarı gizli, seçenekler "A4\'e sığdır" / "Orijinal" ("boyut" yok)',
      J(await kenarGorunur()) === J([false, false, false, false]) && secimler.every((x) => x === 'orijinal:Orijinal') && J(secenekAdlari) === J(["A4'e sığdır", 'Orijinal']),
      { secimler, secenekAdlari });
    await sayfaSecimi('a4');
    sonuc('A4\'e sığdır: kenar ayarı görünür', J(await kenarGorunur()) === J([true, true, true, true]));
    await sayfaSecimi('orijinal');
    // Döndürülmüş öğe: ikinci görsel (PNG) sağa döndürülür
    await evalJs(`document.querySelectorAll('.birlestir-oge')[1].querySelector('[data-komut="saga"]').click()`);
    sonuc('Orijinal: kenar ayarı gizli', J(await kenarGorunur()) === J([false, false, false, false]));
    await kosul(`!document.querySelector('.birlestir-kalite-secim .boyut.bekliyor') && [...document.querySelectorAll('.birlestir-oge .tahmin')].every((t) => /tahmin: \\d/.test(t.textContent))`, 20000);
    await ss('07-gorsel-orijinal-koyu');
    await tema('acik'); await ss('07-gorsel-orijinal-acik'); await tema('koyu');
    if (!(await evalJs(`document.querySelector('.birlestir-pencere .arac-klasor-cip').dataset.klasor === ${J(CIKTI)}`))) throw new Error('çıktı klasörü test klasörü değil');
    const hedef = await yeniBelgeHedefi();   // "Birleştirilmiş" (0.1.25'te "Birleşik")
    await evalJs(`document.querySelector('.arac-dugmeler [data-id="birlestir"]').click()`);
    await kosul(`!document.querySelector('.birlestir-pencere')`, 20000);
    await bekle(800);
    const kontrol = py(`d = pymupdf.open(${J(hedef)})
sonuc = []
for pg in d:
    pix = pg.get_pixmap(alpha=False)
    w, h = pix.width, pix.height
    kenar = [pix.pixel(x, 0) for x in range(w)] + [pix.pixel(x, h - 1) for x in range(w)] + [pix.pixel(0, y) for y in range(h)] + [pix.pixel(w - 1, y) for y in range(h)]
    bbox = pymupdf.Rect(pg.get_image_info()[0]["bbox"])
    sonuc.append({"sayfa": [round(pg.rect.width, 2), round(pg.rect.height, 2)], "px": [w, h], "kutuAyni": max(abs(a - b) for a, b in zip(bbox, pg.rect)) < 1e-3,
                  "beyaz": sum(1 for p in kenar if min(p) >= 235), "fark": max(max(abs(p[i] - (200, 30, 30)[i]) for i in range(3)) for p in kenar)})
print(json.dumps(sonuc))`);
    const beklenen = [[1200, 900], [480, 640], [500, 400], [726, 968]];
    sonuc('birleştirilmiş PDF: sayfa = görsel, kenarlarda beyaz yok (JPEG, döndürülmüş PNG, saydam PNG, EXIF fotoğraf)',
      kontrol.length === 4 && kontrol.every((s, i) => J(s.sayfa) === J(beklenen[i]) && s.kutuAyni && s.beyaz === 0 && s.fark <= 60), kontrol);
  }

  // ------------------------------------------------------------ 8) Sayfaları düzenle: artımlı döndürme ve yapısal kayıttan sonra yeni belge
  if (bolum(8)) {
    console.log('\n== 8) Sayfaları düzenle: kayıtlı döndürme ve yapısal kayıttan sonra');
    await sekmeleriKapat();
    await ac(zengin.f);
    const kartlar = () => evalJs(`[...document.querySelectorAll('.sayfalar-izgara > .sayfa-karti')].map((k) => { const b = k.getBoundingClientRect(); const r = k.querySelector('.rozet.dondurme'); const g = k.querySelector('.resim-kutu img'); return { no: +k.querySelector('.no').textContent, x: Math.round(b.left + b.width / 2), y: Math.round(b.top + 40), r: Math.round(b.right), rozet: r.hidden ? '' : r.textContent, css: g ? g.style.transform : null, baslik: k.title }; })`);
    const kaydetTikla = () => evalJs(`document.querySelector('.arac-dugmeler [data-id="kaydet"]').click()`);
    const sekmeBekle = (ifade) => kosul(`!document.querySelector('.arac-ortusu') && !window.__pdefe.aktif().kaydediliyor && (${ifade})`, 15000);
    // a) Döndür ve kaydet (üzerine yaz, 1. sayfa): yalnızca döndürme değiştiği için artımlı kayıt (belge.diskDondurme)
    await aracAc('arac.dondurKaydet', 'dondur-pencere');
    await evalJs(`document.querySelector('input[name="dondur-kapsam"][value="gecerli"]').click(); document.querySelector('.arac-kayit-secim [data-id="uzerine"]').click(); document.querySelector('.arac-dugmeler [data-id="uygula"]').click()`);
    await sekmeBekle('!window.__pdefe.aktif().degisti');
    const disk = await evalJs(`JSON.stringify(window.__pdefe.aktif().diskDondurme)`);
    const f1 = ozet(zengin.f);
    sonuc('Döndür ve kaydet üzerine yaz: 1. sayfa dosyada 90°, artımlı kayıt', f1.sayfalar[0].rot === 90 && Object.entries(JSON.parse(disk)).every(([n, d]) => d === (n === '1' ? 90 : 0)),
      { rot: f1.sayfalar.map((s) => s.rot), disk });
    // b) Küçük resim dosyadaki hali gösterir: bir daha döndürülmez, rozet yok
    await aracAc('arac.sayfalar', 'sayfalar-pencere');
    await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 8`);
    let k = await kartlar();
    sonuc('kayıtlı döndürme küçük resimde iki kez uygulanmaz (rozet yok)', k[0].rozet === '' && !k[0].css, k[0]);
    await ss('08-sayfalar-kayitli-dondurme-koyu');
    // c) Yeni belge: 8. sayfa silinir; 1. sayfa dosyadaki gibi 90°
    await tikla(k[7].x, k[7].y); await tus('Delete');
    const h1 = await yeniBelgeHedefi();
    await kaydetTikla();
    await kosul(`!document.querySelector('.sayfalar-pencere') && window.__pdefe.belgeler.size === 2`, 15000);
    await bekle(600);
    const y1 = ozet(h1);
    sonuc('yeni belge: kayıtlı döndürme korunur (iki kez eklenmez)', y1.sayfalar.length === 7 && J(y1.sayfalar.map((s) => s.rot)) === J([90, 0, 0, 0, 0, 0, 0]), y1.sayfalar.map((s) => s.rot));
    // d) Üzerine yaz ile yapısal kayıt: 2. sayfa sona taşınır (sekme anlık kopyaya geçer)
    await evalJs(`window.__pdefe.sekmeSec([...window.__pdefe.belgeler.keys()][0])`);
    await bekle(300);
    await aracAc('arac.sayfalar', 'sayfalar-pencere');
    await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 8`);
    await evalJs(`document.querySelector('.sayfalar-kayit .arac-kayit-secim [data-id="uzerine"]').click()`);
    k = await kartlar();
    await tikla(k[1].x, k[1].y);
    await surukle(k[1].x, k[1].y, k[7].r - 10, k[7].y + 20);
    await kaydetTikla();
    await sekmeBekle('!window.__pdefe.aktif().degisti');
    const f2 = ozet(zengin.f);
    const anlik = await evalJs(`!!window.__pdefe.aktif().gorunum.anlik`);
    sonuc('yapısal üzerine yaz: sıra değişti, 1. sayfa 90° kaldı, notlar korundu', anlik && J(f2.sayfalar.map((s) => s.metin)) === J(['Sayfa 1', 'Sayfa 3', 'Sayfa 4', 'Sayfa 5', 'Sayfa 6', 'Sayfa 7', 'Sayfa 8', 'Sayfa 2'])
      && f2.sayfalar[0].rot === 90 && f2.sayfalar.every((s, i) => i === 0 || s.rot === 0) && f2.sayfalar.every((s) => s.not.length === 2), { metin: f2.sayfalar.map((s) => s.metin), rot: f2.sayfalar.map((s) => s.rot), anlik });
    // e) Yapısal kayıttan sonra, bekleyen notla yeni belge: sorulur (3 düğme); dosyadaki sayfalar ve kayıtlı notlar, bekleyen not yok
    await evalJs(`window.__pdefe.aktif().notlar.ekle({ tur: 'Text', sayfa: 1, rect: [100, 700, 120, 720], icerik: 'bekleyen', yazar: 'Test', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' })`);
    await aracAc('arac.sayfalar', 'sayfalar-pencere');
    await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 8`);
    k = await kartlar();
    sonuc('yapısal kayıttan sonra kartlar anlık kopyadan: 1. kart rozetsiz, sıra sekmedeki gibi', k[0].rozet === '' && /sayfa 1$/.test(k[0].baslik) && /sayfa 2$/.test(k[7].baslik), k.map((x) => x.baslik.replace(/^.* — /, '')));
    await tikla(k[7].x, k[7].y); await tus('Delete');
    await diyalogYanitla([{ secim: 1 }]);   // Kaydetmeden devam et
    const h2 = await yeniBelgeHedefi();
    await kaydetTikla();
    await kosul(`!document.querySelector('.sayfalar-pencere') && window.__pdefe.belgeler.size === 3`, 15000);
    await bekle(600);
    const s8 = await diyalogKaydi();
    const y2 = ozet(h2);
    sonuc('yapısal kayıttan sonra yeni belge (bekleyen not sorusu, Kaydetmeden devam et)', s8.length === 1 && s8[0].secenek.dugmeler.length === 3
      && J(y2.sayfalar.map((s) => s.metin)) === J(['Sayfa 1', 'Sayfa 3', 'Sayfa 4', 'Sayfa 5', 'Sayfa 6', 'Sayfa 7', 'Sayfa 8']) && y2.sayfalar[0].rot === 90
      && y2.sayfalar.every((s) => s.not.length === 2) && J(y2.toc.map((t) => t[0])) === J(['Bölüm A', 'A.2', 'Bölüm B', 'B.1', 'B.2', 'Bölüm C', 'C.1']),
    { sorular: s8.map((s) => s.secenek?.dugmeler), metin: y2.sayfalar.map((s) => s.metin), rot: y2.sayfalar.map((s) => s.rot), not: y2.sayfalar.map((s) => s.not.length), toc: y2.toc });
    // f) Sekmede kaydedilmemiş sayfa düzeni (Ctrl+Z ile yapısal değişiklik geri alındı): yalnızca "Kaydet ve devam et / Vazgeç"; kaydedip devam eder
    await evalJs(`window.__pdefe.sekmeSec([...window.__pdefe.belgeler.keys()][0])`);
    await bekle(300);
    await evalJs(`window.__pdefe.aktif().gorunum.kaydirici.focus()`);
    await tus('z', ['ctrl']); await tus('z', ['ctrl']);   // bekleyen notu ve sıralamayı geri al
    await kosul(`window.__pdefe.aktif().gorunum.yapisalKirli()`);
    await aracAc('arac.sayfalar', 'sayfalar-pencere');
    await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 8`);
    k = await kartlar();
    await tikla(k[2].x, k[2].y); await tus('r');
    await diyalogYanitla([{ secim: 0 }]);   // Kaydet ve devam et
    const h3 = await yeniBelgeHedefi();
    await kaydetTikla();
    await kosul(`!document.querySelector('.sayfalar-pencere') && window.__pdefe.belgeler.size === 4`, 15000);
    await bekle(600);
    const s9 = await diyalogKaydi();
    const y3 = ozet(h3), f3 = ozet(zengin.f);
    const ilk = await evalJs(`(() => { const b = [...window.__pdefe.belgeler.values()][0]; return { degisti: b.degisti, sayfa: b.gorunum.sayfaSayisi }; })()`);
    sonuc('kaydedilmemiş düzende yalnızca kaydedip devam (2 düğme); sekme kaydedildi, yeni belge sekmenin düzeniyle', s9.length === 1 && s9[0].secenek.dugmeler.length === 2
      && J(f3.sayfalar.map((s) => s.metin)) === J(['Sayfa 1', 'Sayfa 2', 'Sayfa 3', 'Sayfa 4', 'Sayfa 5', 'Sayfa 6', 'Sayfa 7', 'Sayfa 8']) && !ilk.degisti
      && J(y3.sayfalar.map((s) => s.metin)) === J(f3.sayfalar.map((s) => s.metin)) && J(y3.sayfalar.map((s) => s.rot)) === J([90, 0, 90, 0, 0, 0, 0, 0]) && y3.sayfalar.every((s) => s.not.length === 2),
    { sorular: s9.map((s) => [s.secenek?.ayrinti, s.secenek?.dugmeler]), dosya: f3.sayfalar.map((s) => s.metin), yeni: y3.sayfalar.map((s) => [s.metin, s.rot, s.not.length]), ilk });
  }

  // ------------------------------------------------------------ son: konsol hataları
  const hatalar = await evalJs(`window.__hatalar || []`);
  sonuc('renderer konsolunda hata yok', hatalar.length === 0, hatalar);
  await sekmeleriKapat();
  console.log(`\n${hataSayisi ? 'BAŞARISIZ: ' + hataSayisi + ' denetim' : 'Hepsi geçti'}`);
}
