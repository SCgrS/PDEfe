// Açılır pencerelerin örtüsüne (pencerenin dışına) tıklama: gerçek fare girdisiyle.
//  - Her modal pencere (F1, parola, Ayarlar, Yazdır seçenekleri ve hazırlık, beş araç penceresi, Ctrl+Tab seçicisi): içeride tık,
//    içeriden dışarı sürükleme, örtüde basıp içeride bırakma, sağ ve orta tık kapatmaz; dışarı tık Esc / X ile aynı sonuçla kapatır.
//  - Araç penceresinde işlem sürerken (Küçült) ve kaydedilmemiş değişiklik varken (Sayfaları düzenle, dolu birleştirme listesi) sorulur;
//    "Sürdür" / "Vazgeç" pencereyi açık bırakır (0.1.12: kaydedilmemiş değişiklik sorusu uygulamanın bütün çıkış sorularıyla aynı:
//    "<ad>" belgesinde kaydedilmemiş değişiklikler var. / Çıkmadan önce kaydetmek ister misiniz? / Kaydet | Kaydetme | Vazgeç).
//  - İç içe: araç penceresinin üstündeki F1 / Ayarlar dışarı tıklamayla kapanır, araç penceresi açık kalır.
//  - Açılır pencereler (açık belgeler listesi, Bul seçenekleri, Araçlar) dışarıda basışla kapanır; nota basış da kapatır.
//  - Uygulama içi mesaj kutusu (otomatik yanıt kapalı): sekme kapatma sorusu (Kaydet / Kaydetme / Vazgeç: tık, Enter, Esc, dışarı tık;
//    Tab, ← →), kutu açıkken belge ve uygulama tuşları, araç penceresinin / Ayarlar'ın / F1'in üstünde yalnızca kutunun kapanması,
//    Küçült sürerken soru, onay kutulu soru (0.1.27'ye dek döndürme sorusu; Döndür düğmesi artık sormuyor), yazı düzenlenirken açılan
//    soru, üst üste kutular.
// Kullanım: powershell -File test\baslat.ps1 -Port 9321 -Veri <klasör>; $env:PDEFE_CDP_PORT=9321; node test\surucu.mjs betik test\ortu_tiklama.mjs
// Belgeler test/pdf'ten test/cikti/ortu'ya kopyalanır (asıllarına yazılmaz); araç çıktıları da oraya gider.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const K = path.resolve('test/cikti/ortu');
const A = path.join(K, 'ustyazi (85).pdf');
const B = path.join(K, '(2)TensipZapti (9).pdf');
const BUYUK = path.join(K, 'buyuk.pdf');
const PAROLALI = path.join(K, 'parolali.pdf');
const js = (d) => JSON.stringify(d);

let hata = 0, tamam = 0;
function denetle(ad, kosul, ayrinti = '') {
  if (kosul) tamam++; else hata++;
  console.log(`${kosul ? 'TAMAM' : 'HATA '}  ${ad}${ayrinti ? '  — ' + ayrinti : ''}`);
}

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, surukle, tus, yaz }) {
  fs.mkdirSync(K, { recursive: true });
  const kopyala = (kaynak, hedef) => { if (!fs.existsSync(hedef)) fs.copyFileSync(path.resolve('test/pdf', kaynak), hedef); };
  kopyala('dergipark_5104529_zamanasimi.pdf', A);
  kopyala('dergipark_3972595_ttk_tbk.pdf', B);
  kopyala('PDF32000_2008_yerimli.pdf', BUYUK);
  if (!fs.existsSync(PAROLALI)) {
    execFileSync(path.resolve('.venv/Scripts/python.exe'), ['-c', `import pymupdf; d = pymupdf.open(${js(A)}); d.save(${js(PAROLALI)}, encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw='deneme', owner_pw='sahip')`]);
  }

  // Sayfa içi yardımcılar: örtü durumu, örtüde (pencerenin dışında) ve pencerenin içinde (başlık metni) tıklanacak nokta, hata toplama
  await evalJs(`(() => {
    const p = window.__pdefe;
    window.__t = {
      hatalar: [],
      acik(secici) { return [...document.querySelectorAll(secici)].filter((e) => !e.hidden).length; },
      noktalar(secici, icSecici) {
        const ortu = [...document.querySelectorAll(secici)].filter((e) => !e.hidden).pop(); if (!ortu) return null;
        const W = innerWidth, H = innerHeight;
        const dis = [[12, H >> 1], [W - 12, H >> 1], [W >> 1, 12], [W >> 1, H - 12], [12, 12], [W - 12, H - 12]].find(([x, y]) => document.elementFromPoint(x, y) === ortu);
        const ic = icSecici && ortu.querySelector(icSecici); const r = ic?.getBoundingClientRect();
        return { dis, ic: r ? [Math.round(r.left + Math.min(24, r.width / 2)), Math.round(r.top + r.height / 2)] : null };
      },
      merkez(secici) { const e = [...document.querySelectorAll(secici)].filter((x) => x.offsetParent).pop(); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; },
      async bekle(kosul, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (kosul()) return true; await new Promise((r) => setTimeout(r, 50)); } return !!kosul(); },
    };
    addEventListener('error', (e) => __t.hatalar.push('error: ' + e.message));
    addEventListener('unhandledrejection', (e) => __t.hatalar.push('unhandledrejection: ' + (e.reason?.message || e.reason)));
    const ce = console.error.bind(console); console.error = (...a) => { __t.hatalar.push('console.error: ' + a.map(String).join(' ')); ce(...a); };
    const a = p.ayar(); a.ciktiKlasoru = ${js(K)}; a.otomatikKaydet = false;   // araç çıktıları Masaüstü'ne değil test klasörüne
    // Önceki çalıştırmadan kalan pencereler kendi kapatma yollarıyla kapanır (araç penceresi kaydı, Ayarlar durumu bozulmasın); önce
    // mesaj kutuları (Esc'i en üstteki kutu alır)
    for (let i = 0; i < 10 && document.querySelector('.mesaj-ortusu'); i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.__pdefeOtoYanit = { secim: 0 };
    document.querySelectorAll('.arac-ortusu .arac-kapat, .ayarlar-pencere [data-id="kapat"], .yazdir-diyalog [data-id="iptal"]').forEach((d) => d.click());
    document.querySelectorAll('.diyalog-ortusu').forEach((o) => o.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    window.__pdefeOtoYanit = { secim: 1 };
    return true;
  })()`);
  await evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); await p.dosyaAc(${js(B)}); await p.dosyaAc(${js(A)}); await new Promise((r) => setTimeout(r, 1500)); return p.aktif().ad; })()`);

  const nokta = (secici, ic) => evalJs(`__t.noktalar(${js(secici)}, ${js(ic)})`);
  const acikMi = (secici) => evalJs(`__t.acik(${js(secici)}) > 0`);
  const yanit = (secim) => evalJs(`(window.__pdefeOtoYanit = { secim: ${secim} }, true)`);
  const sonSoru = () => evalJs(`window.__pdefeOtoYanit?.son?.mesaj || null`);
  const komut = (id) => evalJs(`(window.__pdefe.komutCalistir(${js(id)}), true)`);
  const beklet = (kosul, ms) => evalJs(`__t.bekle(() => (${kosul}), ${ms || 8000})`);

  /** İçeride tık, içeriden dışarı sürükleme, dışarıda basıp içeride bırakma, sağ / orta tık: hiçbiri kapatmamalı. */
  async function kapatmayanlar(ad, secici, ic) {
    const n = await nokta(secici, ic);
    if (!n?.dis || !n?.ic) { denetle(`${ad}: tıklama noktaları`, false, JSON.stringify(n)); return n; }
    await tikla(...n.ic); await bekle(250);
    denetle(`${ad}: pencerenin içine tık kapatmaz`, await acikMi(secici));
    await surukle(...n.ic, ...n.dis); await bekle(250);
    denetle(`${ad}: içeriden dışarı sürükleme (seçim) kapatmaz`, await acikMi(secici));
    await surukle(...n.dis, ...n.ic); await bekle(250);
    denetle(`${ad}: dışarıda basıp içeride bırakma kapatmaz`, await acikMi(secici));
    await tikla(...n.dis, { dugme: 'right' }); await bekle(250);
    denetle(`${ad}: dışarıya sağ tık kapatmaz`, await acikMi(secici));
    await tikla(...n.dis, { dugme: 'middle' }); await bekle(250);
    denetle(`${ad}: dışarıya orta tık kapatmaz`, await acikMi(secici));
    return n;
  }
  async function disariTikla(secici) { const n = await nokta(secici, null); if (n?.dis) await tikla(...n.dis); await bekle(350); return n; }

  // ---------------------------------------------------------------- F1: klavye kısayolları
  const F1 = '.diyalog-ortusu:not(.ayarlar-ortusu):not(.yazdir-ortusu):not(.mesaj-ortusu)';
  await komut('yardim.kisayollar'); await bekle(300);
  await kapatmayanlar('F1', F1, '.diyalog .govde th');
  await ekranGoruntusu('test/png/ortu/f1-acik.png');
  await disariTikla(F1);
  denetle('F1: dışarı tık kapatır', !(await acikMi(F1)));
  await komut('yardim.kisayollar'); await bekle(300); await tus('Escape'); await bekle(200);
  denetle('F1: Esc kapatır', !(await acikMi(F1)));
  await komut('yardim.kisayollar'); await bekle(300); await tikla(...(await evalJs(`__t.merkez('.diyalog [data-id="tamam"]')`))); await bekle(200);
  denetle('F1: Tamam kapatır', !(await acikMi(F1)));

  // ---------------------------------------------------------------- parola sorusu: dışarı tık = Vazgeç (Esc)
  for (const yol of ['dışarı tık', 'Esc']) {
    await yanit(0);
    await evalJs(`(window.__acilis = window.__pdefe.dosyaAc(${js(PAROLALI)}), true)`);
    const geldi = await beklet(`!!document.querySelector('#parola-girdi')`);
    denetle(`parola (${yol}): soru açıldı`, geldi);
    if (yol === 'dışarı tık') { await kapatmayanlar('parola', F1, '.diyalog .baslik'); await disariTikla(F1); } else { await tus('Escape'); await bekle(300); }
    const sonuc = await evalJs(`(async () => { const b = await window.__acilis; return { acildi: !!b, soru: window.__pdefeOtoYanit.son?.mesaj, ayrinti: window.__pdefeOtoYanit.son?.ayrinti?.split('\\n').pop(), sekmeler: window.__pdefe.sekmeler.sekmeler.length, pencere: !!document.querySelector('#parola-girdi') }; })()`);
    denetle(`parola (${yol}): kapandı, belge açılmadı (Vazgeç)`, !sonuc.pencere && !sonuc.acildi && sonuc.sekmeler === 2, JSON.stringify(sonuc));
  }

  // ---------------------------------------------------------------- Ayarlar
  const AY = '.ayarlar-ortusu';
  await komut('duzen.ayarlar'); await bekle(400);
  await kapatmayanlar('Ayarlar', AY, '.ayarlar-baslik');
  await disariTikla(AY);
  denetle('Ayarlar: dışarı tık kapatır', !(await acikMi(AY)));
  // Yazılmakta olan yazar adı dışarı tıklayınca da kaydedilir (Kapat gibi)
  const eskiYazar = await evalJs(`window.__pdefe.ayar().yazarAdi`);
  await evalJs(`(window.__pdefe.komutCalistir('duzen.ayarlar'), document.querySelector('.ayarlar-bolumler [data-bolum="notlar"]').click(), true)`); await bekle(300);
  await tikla(...(await evalJs(`__t.merkez('.ayarlar-icerik input.ayar-metin')`)));
  await evalJs(`(() => { document.querySelector('.ayarlar-icerik input.ayar-metin').select(); document.execCommand('insertText', false, 'Deneme Yazar'); return true; })()`);
  await disariTikla(AY);
  denetle('Ayarlar: dışarı tıklayınca yazılan yazar adı kaydedilir', !(await acikMi(AY)) && (await evalJs(`window.__pdefe.ayar().yazarAdi`)) === 'Deneme Yazar');
  await evalJs(`window.pdefe.cagir('ayar:koy', 'yazarAdi', ${js(eskiYazar)}).then(() => { window.__pdefe.ayar().yazarAdi = ${js(eskiYazar)}; return true; })`);
  await komut('duzen.ayarlar'); await bekle(300); await tus('Escape'); await bekle(200);
  denetle('Ayarlar: Esc kapatır', !(await acikMi(AY)));
  await komut('duzen.ayarlar'); await bekle(300); await tikla(...(await evalJs(`__t.merkez('.ayarlar-pencere [data-id="kapat"]')`))); await bekle(200);
  denetle('Ayarlar: X kapatır', !(await acikMi(AY)));

  // ---------------------------------------------------------------- Yazdır: seçenek penceresi
  const YZ = '.yazdir-ortusu';
  const yazdirAc = async () => { await komut('dosya.yazdir'); return beklet(`!!document.querySelector('.yazdir-diyalog')`); };
  denetle('Yazdır: seçenek penceresi açıldı', await yazdirAc());
  await kapatmayanlar('Yazdır', YZ, '.yazdir-diyalog .baslik');
  await ekranGoruntusu('test/png/ortu/yazdir-acik.png');
  await disariTikla(YZ);
  denetle('Yazdır: dışarı tık kapatır (Vazgeç: iş başlamaz)', !(await acikMi(YZ)) && !(await evalJs(`window.pdefe.cagir('yazdir:durum')`)).suruyor);
  await yazdirAc(); await tus('Escape'); await bekle(200);
  denetle('Yazdır: Esc kapatır', !(await acikMi(YZ)));
  await yazdirAc(); await tikla(...(await evalJs(`__t.merkez('.yazdir-diyalog [data-id="iptal"]')`))); await bekle(200);
  denetle('Yazdır: Vazgeç kapatır', !(await acikMi(YZ)));

  // ---------------------------------------------------------------- Yazdır: hazırlık (756 sayfa ~2 dk sürer; Windows diyaloğuna varmadan kesilir)
  await evalJs(`(async () => { await window.__pdefe.dosyaAc(${js(BUYUK)}); await new Promise((r) => setTimeout(r, 1200)); return true; })()`);
  for (const yol of ['dışarı tık', 'Esc']) {
    await yanit(0);   // "756 sayfa yazdırılacak. Devam edilsin mi?" → Devam
    await yazdirAc();
    await evalJs(`(() => { document.querySelector('.yazdir-diyalog [name="aralik"][value="tumu"]').checked = true; return true; })()`);
    await tikla(...(await evalJs(`__t.merkez('.yazdir-diyalog [data-id="yazdir"]')`)));
    const hazirlik = await beklet(`!!document.querySelector('.yazdir-ilerleme') && /Sayfa \\d+ hazırlanıyor/.test(document.querySelector('.yazdir-mesaj')?.textContent || '')`);
    denetle(`Yazdır hazırlık (${yol}): hazırlık başladı`, hazirlik);
    if (yol === 'dışarı tık') { await kapatmayanlar('Yazdır hazırlık', YZ, '.yazdir-ilerleme .baslik'); await ekranGoruntusu('test/png/ortu/yazdir-hazirlik.png'); await disariTikla(YZ); } else { await tus('Escape'); }
    const bitti = await beklet(`!document.querySelector('.yazdir-ortusu')`, 10000);
    const is = await evalJs(`window.pdefe.cagir('yazdir:durum')`);
    if (!bitti) await evalJs(`(document.querySelector('.yazdir-ilerleme [data-id="iptal"]')?.click(), true)`);   // güvenlik: Windows diyaloğuna varmasın
    denetle(`Yazdır hazırlık (${yol}): Vazgeç gibi durdu, iş kalmadı`, bitti && !is.suruyor, JSON.stringify(is));
  }

  // ---------------------------------------------------------------- araç pencereleri
  const AR = '.arac-ortusu';
  for (const [id, ad] of [['arac.kucult', 'Sıkıştırma'], ['arac.sayfalar', 'Sayfaları düzenle'], ['arac.dondurKaydet', 'Döndür'], ['arac.ayir', 'Ayır'], ['arac.gorselBirlestir', 'Görüntü / PDF birleştir']]) {
    await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'ustyazi (85).pdf'); await p.sekmeSec(b.id); return true; })()`);
    await komut(id); await beklet(`!!document.querySelector('.arac-pencere')`); await bekle(600);
    await kapatmayanlar(ad, AR, '.arac-baslik-metin');
    if (id === 'arac.kucult') await ekranGoruntusu('test/png/ortu/arac-kucult.png');
    await disariTikla(AR);
    denetle(`${ad}: dışarı tık kapatır`, !(await acikMi(AR)));
    await komut(id); await beklet(`!!document.querySelector('.arac-pencere')`); await bekle(400); await tus('Escape'); await bekle(300);
    denetle(`${ad}: Esc kapatır`, !(await acikMi(AR)));
    await komut(id); await beklet(`!!document.querySelector('.arac-pencere')`); await bekle(400); await tikla(...(await evalJs(`__t.merkez('.arac-pencere .arac-kapat')`))); await bekle(300);
    denetle(`${ad}: X kapatır`, !(await acikMi(AR)));
  }

  // Sayfaları düzenle: kaydedilmemiş değişiklik varken dışarı tık sorar
  await komut('arac.sayfalar'); await beklet(`document.querySelectorAll('.sayfa-karti').length > 0`); await bekle(500);
  await tikla(...(await evalJs(`__t.merkez('.sayfalar-arac-cubugu [data-komut="tumunuSec"]')`))); await bekle(150);
  await tikla(...(await evalJs(`__t.merkez('.sayfalar-arac-cubugu [data-komut="sagaDondur"]')`))); await bekle(300);
  await yanit(2); await disariTikla(AR);
  const sayfalarSoru = `"${await evalJs(`window.__pdefe.aktif().ad`)}" belgesinde kaydedilmemiş değişiklikler var.`;
  denetle('Sayfaları düzenle: değişiklik varken dışarı tık sorar, "Vazgeç" açık bırakır', (await sonSoru()) === sayfalarSoru && await acikMi(AR), await sonSoru());
  await yanit(1); await disariTikla(AR);
  denetle('Sayfaları düzenle: "Kaydetme" ile kapanır, belge değişmez', !(await acikMi(AR)) && !(await evalJs(`window.__pdefe.aktif().degisti`)));

  // Görüntü / PDF birleştir: dolu liste sorulur
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:acDiyalog', [[${js(B)}]])`);
  await komut('arac.gorselBirlestir'); await beklet(`!!document.querySelector('.birlestir-ekle')`); await bekle(300);
  await tikla(...(await evalJs(`__t.merkez('.birlestir-ekle')`)));
  await beklet(`!document.querySelector('.arac-pencere .bos-mesaj')`); await bekle(500);
  await yanit(2); await disariTikla(AR);
  denetle('Birleştir: dolu listede dışarı tık sorar, "Vazgeç" açık bırakır', /^"Birleştirilmiş( \(\d+\))?\.pdf" belgesinde kaydedilmemiş değişiklikler var\.$/.test(await sonSoru()) && await acikMi(AR), await sonSoru());
  await yanit(1); await disariTikla(AR);
  denetle('Birleştir: "Kaydetme" ile kapanır', !(await acikMi(AR)));

  // Küçült: işlem sürerken dışarı tık sorar (Sürdür → açık, işlem sürer; İptal et ve kapat → kapanır)
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'buyuk.pdf'); await p.sekmeSec(b.id); return true; })()`);
  await komut('arac.kucult'); await beklet(`!!document.querySelector('.kucult-pencere')`); await bekle(800);
  await tikla(...(await evalJs(`__t.merkez('.arac-pencere .arac-dugmeler .birincil')`)));
  const suruyor = await beklet(`!!document.querySelector('.arac-ilerleme:not([hidden])')`, 5000);
  await yanit(1); await disariTikla(AR);
  const s1 = { soru: await sonSoru(), acik: await acikMi(AR), suruyor: await evalJs(`!!document.querySelector('.arac-ilerleme:not([hidden]) .arac-ilerleme-iptal:not(:disabled)')`) };
  denetle('Sıkıştırma: işlem sürerken dışarı tık sorar, "Sürdür" açık bırakır', suruyor && s1.soru === 'Sıkıştırma sürüyor.' && s1.acik, JSON.stringify(s1));
  await ekranGoruntusu('test/png/ortu/kucult-suruyor.png');
  await yanit(0); await disariTikla(AR);
  denetle('Sıkıştırma: "İptal et ve kapat" ile kapanır', !(await acikMi(AR)));
  await bekle(1500);

  // ---------------------------------------------------------------- iç içe: araç penceresinin üstünde F1 ve Ayarlar
  await komut('arac.ayir'); await beklet(`!!document.querySelector('.arac-pencere')`); await bekle(400);
  await komut('yardim.kisayollar'); await bekle(300);
  await disariTikla(F1);
  denetle('İç içe: F1 dışarı tıkla kapanır, araç penceresi açık kalır', !(await acikMi(F1)) && await acikMi(AR));
  await komut('duzen.ayarlar'); await bekle(300);
  await disariTikla(AY);
  denetle('İç içe: Ayarlar dışarı tıkla kapanır, araç penceresi açık kalır', !(await acikMi(AY)) && await acikMi(AR));
  await disariTikla(AR);
  denetle('İç içe: ardından araç penceresi dışarı tıkla kapanır', !(await acikMi(AR)));

  // ---------------------------------------------------------------- Ctrl+Tab seçicisi
  const aktifAd = () => evalJs(`window.__pdefe.aktif().ad`);
  await evalJs(`(async () => { const p = window.__pdefe; await p.sekmeSec([...p.belgeler.values()].find((x) => x.ad === 'ustyazi (85).pdf').id); return true; })()`);
  const once = await aktifAd();
  await tus('Tab', ['ctrl']); await bekle(500);
  denetle('Ctrl+Tab: seçici açık', await evalJs(`!document.querySelector('#sekme-secici').hidden`));
  await ekranGoruntusu('test/png/ortu/ctrl-tab.png');
  const sn = await evalJs(`(() => { const k = document.querySelector('#sekme-secici .kutu-ic').getBoundingClientRect(); return [Math.round(k.left + 5), Math.round(k.top + 5)]; })()`);
  await tikla(...sn, { degistiriciler: ['ctrl'] }); await bekle(200);
  denetle('Ctrl+Tab: kutunun içine tık kapatmaz', await evalJs(`!document.querySelector('#sekme-secici').hidden`));
  await tikla(12, 400, { dugme: 'right', degistiriciler: ['ctrl'] }); await bekle(200);
  denetle('Ctrl+Tab: arka plana sağ tık kapatmaz', await evalJs(`!document.querySelector('#sekme-secici').hidden`));
  await tikla(12, 400, { degistiriciler: ['ctrl'] }); await bekle(200);
  denetle('Ctrl+Tab: arka plana tık kapatır', await evalJs(`document.querySelector('#sekme-secici').hidden && !window.__pdefe.sekmeler.seciciAcik`));
  await tus('Control'); await bekle(300);
  denetle('Ctrl+Tab: arka plana tıklayıp Ctrl bırakılınca sekme değişmez (Esc gibi)', (await aktifAd()) === once, await aktifAd());
  await tus('Tab', ['ctrl']); await bekle(400); await tus('Escape'); await tus('Control'); await bekle(300);
  denetle('Ctrl+Tab: Esc sekme değiştirmeden kapatır', (await aktifAd()) === once && await evalJs(`document.querySelector('#sekme-secici').hidden`));
  await tus('Tab', ['ctrl']); await bekle(400); await tus('Control'); await bekle(500);
  denetle('Ctrl+Tab: Ctrl bırakılınca önceki sekmeye geçer', (await aktifAd()) !== once, `${once} → ${await aktifAd()}`);

  // ---------------------------------------------------------------- açılır pencereler (modal olmayan)
  await evalJs(`(async () => { const p = window.__pdefe; await p.sekmeSec([...p.belgeler.values()].find((x) => x.ad === 'ustyazi (85).pdf').id); await new Promise((r) => setTimeout(r, 500)); return true; })()`);
  const sayfa = await evalJs(`(() => { const r = window.__pdefe.aktif().gorunum.kaydirici.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + 200)]; })()`);
  const listeAcik = () => evalJs(`!document.querySelector('#belge-listesi').hidden`);
  await tikla(...(await evalJs(`__t.merkez('#sekme-acilir')`))); await bekle(200);
  denetle('Açık belgeler: düğmeyle açılır', await listeAcik());
  await tikla(...(await evalJs(`__t.merkez('#belge-listesi input')`))); await bekle(150);
  denetle('Açık belgeler: içeride tık kapatmaz', await listeAcik());
  await tikla(...sayfa); await bekle(200);
  denetle('Açık belgeler: sayfaya tık kapatır', !(await listeAcik()));
  await tikla(...(await evalJs(`__t.merkez('#sekme-acilir')`))); await bekle(150);
  await tikla(...(await evalJs(`__t.merkez('#sekme-acilir')`))); await bekle(150);
  denetle('Açık belgeler: düğmeye yeniden basış kapatır', !(await listeAcik()));
  // Nota basış (notlar.js basışı işleyip mousedown'ı engeller) da kapatır
  await evalJs(`(() => { const b = window.__pdefe.aktif(); const r = b.gorunum.sayfalar[0].el.getBoundingClientRect(); b.notlar.sayfayaNotKoy(0, { clientX: r.left + 120, clientY: r.top + 120 }); b.notlar.balonKapat(); b.notlar.sec(null); return true; })()`);
  await bekle(300);
  const notNok = await evalJs(`__t.merkez('.not-oge[data-id]')`);
  await tikla(...(await evalJs(`__t.merkez('#sekme-acilir')`))); await bekle(150);
  await tikla(...notNok); await bekle(200);
  denetle('Açık belgeler: nota basış kapatır', !(await listeAcik()), JSON.stringify(notNok));
  await evalJs(`(() => { const b = window.__pdefe.aktif(); b.notlar.balonKapat(); b.notlar.sec(null); return true; })()`);
  await tikla(...(await evalJs(`__t.merkez('#sekme-acilir')`))); await bekle(150);
  const digerSekme = await evalJs(`__t.merkez('.sekme:not(.aktif) .ad')`);
  await tikla(...digerSekme); await bekle(400);
  denetle('Açık belgeler: sekmeye tık listeyi kapatır ve sekmeyi seçer', !(await listeAcik()) && (await aktifAd()) !== 'ustyazi (85).pdf', await aktifAd());

  // Bul seçenekleri
  await evalJs(`(async () => { const p = window.__pdefe; await p.sekmeSec([...p.belgeler.values()].find((x) => x.ad === 'ustyazi (85).pdf').id); p.komutCalistir('duzen.bul', 'zaman'); return true; })()`); await bekle(400);
  const menuAcik = () => evalJs(`!document.querySelector('#bul-ayar-menu').hidden`);
  await tikla(...(await evalJs(`__t.merkez('#bul-ayar')`))); await bekle(150);
  denetle('Bul seçenekleri: düğmeyle açılır', await menuAcik());
  await tikla(...(await evalJs(`(() => { const r = document.querySelector('#bul-ayar-menu hr').getBoundingClientRect(); return [Math.round(r.left + 20), Math.round(r.top)]; })()`))); await bekle(150);
  denetle('Bul seçenekleri: içeride tık kapatmaz', await menuAcik());
  await tikla(...notNok); await bekle(200);
  denetle('Bul seçenekleri: nota basış kapatır', !(await menuAcik()));
  await tikla(...(await evalJs(`__t.merkez('#bul-ayar')`))); await bekle(150);
  await tikla(...sayfa); await bekle(200);
  denetle('Bul seçenekleri: sayfaya tık kapatır', !(await menuAcik()));
  await evalJs(`(window.__pdefe.arama.kapat(), true)`);

  // Araçlar düğmesinin penceresi (değişmedi; tutarlılık). Karolar sayfanın üst yarısını örter: pencerenin dışındaki bir yere tıklanır
  await tikla(...(await evalJs(`__t.merkez('#dugme-araclar')`))); await bekle(200);
  denetle('Araçlar penceresi: düğmeyle açılır', await evalJs(`!document.querySelector('#araclar-penceresi').hidden`));
  const disNokta = await evalJs(`(() => { const r = window.__pdefe.aktif().gorunum.kaydirici.getBoundingClientRect(), a = document.querySelector('#araclar-penceresi').getBoundingClientRect(); const n = [Math.round(r.left + 40), Math.round(r.bottom - 40)]; return n[1] > a.bottom || n[0] < a.left ? n : null; })()`);
  await tikla(...disNokta); await bekle(200);
  denetle('Araçlar penceresi: dışarıya (sayfaya) tık kapatır, araç açılmaz', await evalJs(`document.querySelector('#araclar-penceresi').hidden && !document.querySelector('.arac-ortusu')`), js(disNokta));

  // Pencere.kapat: dışarı tıklamanın sorusu açıkken araç pencereyi kendisi kapatırsa (işlem bitti, 'tamam') 'kapandi' bir kez gider
  const yaris = await evalJs(`(async () => {
    const { pencereAc } = await import('./araclar/ortak.js');
    let izinVer; const soru = new Promise((c) => { izinVer = c; });
    const p = pencereAc({ baslik: 'Deneme', govde: '<p>deneme</p>', kapatmadanOnce: (_p, sonuc) => (sonuc === 'tamam' ? true : soru) });
    let kapandi = 0; p.el.addEventListener('kapandi', () => kapandi++);
    const kullanici = p.kapat(null);           // soru açık (bekliyor)
    const arac = await p.kapat('tamam');       // bu arada araç kapattı
    izinVer(true);                             // kullanıcı "İptal et ve kapat" dedi
    return { arac, kullanici: await kullanici, kapandi, sonuc: await p.sonuc, ortu: !!document.querySelector('.arac-ortusu') };
  })()`);
  denetle('Pencere.kapat: soru açıkken başka yoldan kapanınca "kapandi" bir kez gider', yaris.arac === true && yaris.kullanici === false && yaris.kapandi === 1 && yaris.sonuc === 'tamam' && !yaris.ortu, js(yaris));

  // ================================================================ uygulama içi mesaj kutusu (otomatik yanıt kapalı, gerçek girdi)
  await evalJs(`(delete window.__pdefeOtoYanit, true)`);
  const tema = await evalJs(`document.documentElement.dataset.tema`);
  const MK = '.mesaj-ortusu';
  const kutuAcik = () => acikMi(MK);
  const kutuBekle = () => beklet(`!!document.querySelector('.mesaj-kutusu')`, 5000);
  const kutuBilgi = () => evalJs(`(() => {
    const k = [...document.querySelectorAll('.mesaj-kutusu')].pop(); if (!k) return null;
    const a = document.activeElement, ay = k.querySelector('.mesaj-ayrinti');
    return { ileti: k.querySelector('.mesaj-ileti').textContent, ayrinti: ay.hidden ? null : ay.textContent, dugmeler: [...k.querySelectorAll('.dugmeler button')].map((b) => b.textContent),
      odak: !a ? null : a.tagName === 'BUTTON' ? a.textContent : a.type === 'checkbox' ? 'onay kutusu' : a.className || a.tagName, tur: k.dataset.tur, onay: k.querySelector('.mesaj-onay input')?.checked ?? null, sayi: document.querySelectorAll('.mesaj-kutusu').length };
  })()`);
  const kutuDugmesi = (etiket) => evalJs(`(() => { const k = [...document.querySelectorAll('.mesaj-kutusu')].pop(); const b = [...k.querySelectorAll('.dugmeler button')].find((x) => x.textContent === ${js(etiket)}); const r = b.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  const sekmeyeGec = (ad) => evalJs(`(async () => { const p = window.__pdefe; await p.sekmeSec([...p.belgeler.values()].find((x) => x.ad === ${js(ad)}).id); await new Promise((r) => setTimeout(r, 500)); return true; })()`);

  // ---------------------------------------------------------------- sekme kapatma: Kaydet / Kaydetme / Vazgeç (tık, Enter, Esc, dışarı tık)
  const KAPAT = path.join(K, 'kapatma.pdf');
  fs.copyFileSync(path.resolve('test/pdf', 'dergipark_5104529_zamanasimi.pdf'), KAPAT);   // her çalıştırmada temiz kopya (Kaydet yazar)
  const ilkDurum = (() => { const s = fs.statSync(KAPAT); return `${s.size}:${s.mtimeMs}`; })();
  const dosyaDurum = () => { const s = fs.statSync(KAPAT); return `${s.size}:${s.mtimeMs}`; };
  const kirlet = () => evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'kapatma.pdf') || await p.dosyaAc(${js(KAPAT)}); await p.sekmeSec(b.id); await new Promise((r) => setTimeout(r, 900)); await p.sayfalariDondur(b, [1], 90, 'Sayfayı döndür'); await new Promise((r) => setTimeout(r, 300)); return b.degisti; })()`);
  const sekmeX = () => evalJs(`(() => { const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === 'kapatma.pdf'); const r = s.el.querySelector('.kapat').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  const sekmeVar = () => evalJs(`window.__pdefe.sekmeler.sekmeler.some((x) => x.ad === 'kapatma.pdf')`);
  denetle('Mesaj kutusu: deneme belgesi değişti', await kirlet());
  await tikla(...(await sekmeX())); await kutuBekle();
  let kb = await kutuBilgi();
  denetle('Sekme kapatma sorusu uygulama içinde açıldı, odak Kaydet\'te', /kaydedilmemiş değişiklikler var/.test(kb?.ileti) && kb.ayrinti === 'Çıkmadan önce kaydetmek ister misiniz?' && js(kb.dugmeler) === js(['Kaydet', 'Kaydetme', 'Vazgeç']) && kb.odak === 'Kaydet' && kb.tur === 'question', js(kb));
  await ekranGoruntusu(`test/png/ortu/mesaj-sekme-kapat-${tema}.png`);
  await kapatmayanlar('Mesaj kutusu', MK, '.mesaj-ileti');
  const sayfaOnce = await evalJs(`window.__pdefe.aktif().gorunum.gecerli`);
  await tus('End'); await tus('PageDown'); await tus('Delete'); await tus('1', ['ctrl']); await bekle(400);
  denetle('Kutu açıkken belge tuşları ve Ctrl+1 çalışmaz, kutu açık kalır', (await evalJs(`window.__pdefe.aktif().gorunum.gecerli`)) === sayfaOnce && (await evalJs(`window.__pdefe.aktif().ad`)) === 'kapatma.pdf' && await kutuAcik());
  await disariTikla(MK);
  denetle('Sekme kapatma: dışarı tık = Vazgeç (sekme açık, değişiklik duruyor), odak × düğmesine döner', !(await kutuAcik()) && await sekmeVar() && await evalJs(`window.__pdefe.aktif().degisti`) && await evalJs(`!!document.activeElement?.closest('.sekme .kapat')`));
  await tikla(...(await sekmeX())); await kutuBekle(); await tus('Escape'); await bekle(300);
  denetle('Sekme kapatma: Esc = Vazgeç', !(await kutuAcik()) && await sekmeVar());
  await tikla(...(await sekmeX())); await kutuBekle();
  const odaklar = [];
  for (const t of [[], [], [], ['shift'], ['shift']]) { await tus('Tab', t); odaklar.push((await kutuBilgi()).odak); }
  await tus('ArrowRight'); odaklar.push((await kutuBilgi()).odak); await tus('ArrowLeft'); odaklar.push((await kutuBilgi()).odak);
  denetle('Tab / Shift+Tab ve ← → düğmeler arasında döner', js(odaklar) === js(['Kaydetme', 'Vazgeç', 'Kaydet', 'Vazgeç', 'Kaydetme', 'Vazgeç', 'Kaydetme']), js(odaklar));
  await tus('Tab'); await tus('Enter'); await bekle(300);
  denetle('Enter odaklı düğmeye basar (Vazgeç: sekme açık)', !(await kutuAcik()) && await sekmeVar());
  await tikla(...(await sekmeX())); await kutuBekle();
  await tikla(...(await kutuDugmesi('Kaydetme'))); await beklet(`!window.__pdefe.sekmeler.sekmeler.some((x) => x.ad === 'kapatma.pdf')`, 5000);
  denetle('Kaydetme (tık): sekme kapanır, dosya değişmez', !(await sekmeVar()) && dosyaDurum() === ilkDurum);
  await kirlet();
  await tikla(...(await sekmeX())); await kutuBekle(); await tus('Enter');
  await beklet(`!window.__pdefe.sekmeler.sekmeler.some((x) => x.ad === 'kapatma.pdf')`, 10000);
  denetle('Enter (varsayılan Kaydet): kaydedip kapatır, dosya değişti', !(await sekmeVar()) && dosyaDurum() !== ilkDurum && !(await kutuAcik()));

  // ---------------------------------------------------------------- araç penceresinin üstünde araç sorusu (Sayfaları düzenle)
  await sekmeyeGec('(2)TensipZapti (9).pdf');
  await komut('arac.sayfalar'); await beklet(`document.querySelectorAll('.sayfa-karti').length > 0`); await bekle(500);
  await tikla(...(await evalJs(`__t.merkez('.sayfalar-arac-cubugu [data-komut="tumunuSec"]')`))); await bekle(150);
  await tikla(...(await evalJs(`__t.merkez('.sayfalar-arac-cubugu [data-komut="sagaDondur"]')`))); await bekle(300);
  const kartlar = await evalJs(`document.querySelectorAll('.sayfa-karti').length`);
  await disariTikla(AR); await kutuBekle();
  kb = await kutuBilgi();
  const ustte = await evalJs(`document.elementFromPoint(12, innerHeight >> 1)?.classList.contains('mesaj-ortusu')`);
  denetle('Araç sorusu araç penceresinin üstünde açıldı (odak varsayılan "Kaydet")', kb?.ileti === '"(2)TensipZapti (9).pdf" belgesinde kaydedilmemiş değişiklikler var.' && kb.ayrinti === 'Çıkmadan önce kaydetmek ister misiniz?' && js(kb.dugmeler) === js(['Kaydet', 'Kaydetme', 'Vazgeç']) && kb.odak === 'Kaydet' && ustte && await acikMi(AR), js(kb));
  await ekranGoruntusu(`test/png/ortu/mesaj-arac-ustunde-${tema}.png`);
  await tus('Delete'); await tus('a', ['ctrl']); await bekle(250);
  denetle('Kutu açıkken tuşlar araç penceresine gitmez (Delete sayfa silmez)', (await evalJs(`document.querySelectorAll('.sayfa-karti').length`)) === kartlar && await kutuAcik());
  await disariTikla(MK);
  denetle('Kutunun dışına tık yalnızca kutuyu kapatır (Vazgeç), odak araç penceresine döner', !(await kutuAcik()) && await acikMi(AR) && await evalJs(`!!document.activeElement?.closest('.arac-pencere')`));
  await tus('Escape'); await kutuBekle();
  denetle('Araç penceresinde Esc soruyu yeniden açar', await kutuAcik());
  await tus('Escape'); await bekle(300);
  denetle('Kutuda Esc yalnızca kutuyu kapatır', !(await kutuAcik()) && await acikMi(AR));
  await tikla(...(await evalJs(`__t.merkez('.arac-pencere .arac-kapat')`))); await kutuBekle();
  await tikla(...(await kutuDugmesi('Kaydetme'))); await bekle(400);
  denetle('"Kaydetme" (tık): kutu ve araç penceresi kapanır, belge değişmez', !(await kutuAcik()) && !(await acikMi(AR)) && !(await evalJs(`window.__pdefe.aktif().degisti`)));

  // ---------------------------------------------------------------- Küçült sürerken (gerçek kutu)
  await sekmeyeGec('buyuk.pdf');
  await komut('arac.kucult'); await beklet(`!!document.querySelector('.kucult-pencere')`); await bekle(800);
  await tikla(...(await evalJs(`__t.merkez('.arac-pencere .arac-dugmeler .birincil')`)));
  await beklet(`!!document.querySelector('.arac-ilerleme:not([hidden])')`, 5000);
  await disariTikla(AR); await kutuBekle();
  kb = await kutuBilgi();
  await tus('Enter'); await bekle(400);
  denetle('Sıkıştırma sürerken: soru, Enter = varsayılan "Sürdür" (pencere açık, işlem sürüyor)', kb?.ileti === 'Sıkıştırma sürüyor.' && kb.odak === 'Sürdür' && !(await kutuAcik()) && await acikMi(AR) && await evalJs(`!!document.querySelector('.arac-ilerleme:not([hidden]) .arac-ilerleme-iptal:not(:disabled)')`), js(kb));
  await disariTikla(AR); await kutuBekle();
  await tikla(...(await kutuDugmesi('İptal et ve kapat'))); await bekle(400);
  denetle('Sıkıştırma: "İptal et ve kapat" (tık) pencereyi kapatır', !(await kutuAcik()) && !(await acikMi(AR)));
  await bekle(1500);

  // ---------------------------------------------------------------- onay kutulu soru (dış bağlantı sorusundaki "Bu belgede yeniden sorma")
  // 0.1.27'ye dek döndürme sorusuyla ("Seçeneğimi hatırla") sınanıyordu; Döndür düğmesi artık sormuyor. Kutu window.__pdefe.mesajKutusu
  // ile açılır, yanıtı window.__oy'a yazılır (hiçbir bağlantı açılmaz).
  await sekmeyeGec('(2)TensipZapti (9).pdf');
  const donmeler = () => evalJs(`JSON.stringify(window.__pdefe.aktif().gorunum.tarif().map((t) => t.dondurme || 0))`);
  const donmeOnce = await donmeler();
  const onayliSor = async () => { await evalJs(`(window.__oy = null, window.__pdefe.mesajKutusu({ mesaj: 'Bağlantı tarayıcıda açılsın mı?', ayrinti: 'https://ornek.test/', dugmeler: ['Aç', 'Vazgeç'], varsayilan: 0, iptal: 1, onayKutusu: 'Bu belgede yeniden sorma' }).then((y) => { window.__oy = y; }), true)`); return kutuBekle(); };
  const oy = () => evalJs(`window.__oy`);
  await onayliSor();
  kb = await kutuBilgi();
  denetle('Onay kutulu soru: kutu işaretsiz, odak varsayılan düğmede ("Aç")', kb?.ileti === 'Bağlantı tarayıcıda açılsın mı?' && js(kb.dugmeler) === js(['Aç', 'Vazgeç']) && kb.onay === false && kb.odak === 'Aç', js(kb));
  await ekranGoruntusu(`test/png/ortu/mesaj-onayli-${tema}.png`);
  await disariTikla(MK); await bekle(150);
  let oyDegeri = await oy();
  denetle('Onay kutulu soru: dışarı tık = Vazgeç', !(await kutuAcik()) && oyDegeri?.secim === 1 && oyDegeri.onay === false, js(oyDegeri));
  await onayliSor();
  await tikla(...(await evalJs(`__t.merkez('.mesaj-kutusu .mesaj-onay input')`))); await bekle(150);
  const isaretli = (await kutuBilgi()).onay;
  await tus('Escape'); await bekle(300);
  oyDegeri = await oy();
  denetle('Onay kutulu soru: kutu işaretliyken Esc = Vazgeç (işaret yanıtta)', isaretli === true && !(await kutuAcik()) && oyDegeri?.secim === 1 && oyDegeri.onay === true, js(oyDegeri));
  await onayliSor();
  const yol2 = [];
  for (const t of [[], []]) { await tus('Tab', t); yol2.push((await kutuBilgi()).odak); }
  await tus(' '); await bekle(100); const bosluk = (await kutuBilgi()).onay;
  await tus('Tab', ['shift']); await tus('Tab', ['shift']); yol2.push((await kutuBilgi()).odak);
  await tus('Enter'); await bekle(300);
  oyDegeri = await oy();
  denetle('Onay kutulu soru: Tab onay kutusuna gelir, Boşluk işaretler, Enter odaktaki düğmeyi ("Aç") seçer', js(yol2) === js(['Vazgeç', 'onay kutusu', 'Aç']) && bosluk === true && oyDegeri?.secim === 0 && oyDegeri.onay === true, `${js(yol2)} bosluk=${bosluk} yanit=${js(oyDegeri)}`);
  // Döndür düğmesi sormaz (0.1.27): yalnızca geçerli sayfa döner; geri alınır
  const gecerliSayfa = await evalJs(`window.__pdefe.aktif().gorunum.gecerli`);
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.dondur', 90), true)`); await bekle(700);
  const donmeSonra = JSON.parse(await donmeler());
  denetle('Döndür düğmesi: soru açılmaz, yalnızca geçerli sayfa döner', !(await kutuAcik()) && donmeSonra.every((d, i) => d === (JSON.parse(donmeOnce)[i] + (i === gecerliSayfa - 1 ? 90 : 0)) % 360), js({ donmeSonra, gecerliSayfa }));
  await komut('duzen.geriAl'); await bekle(400);
  denetle('Döndürme geri alındı', (await donmeler()) === donmeOnce);

  // ---------------------------------------------------------------- yazı düzenlenirken açılan soru: Esc yalnızca soruyu kapatır
  await evalJs(`(window.__pdefe.aktif().notlar.aracSec('yazi'), true)`);
  const yaziNok = await evalJs(`(() => { const r = window.__pdefe.aktif().gorunum.sayfalar[0].el.getBoundingClientRect(); return [Math.round(r.left + 120), Math.round(r.top + 160)]; })()`);
  await tikla(...yaziNok); await bekle(400);
  await yaz('Deneme yazı');
  const duzenleyici = () => evalJs(`(() => { const d = window.__pdefe.aktif().notlar.duzenleyici; return d ? { odakta: document.activeElement === d.el, metin: d.el.textContent } : null; })()`);
  const d0 = await duzenleyici();
  await onayliSor();
  for (let i = 0; i < 2; i++) await tus('Tab');   // onay kutusu da bir girdi: odak ona geçince düzenleme bitmemeli
  const d1 = await duzenleyici(), odak1 = (await kutuBilgi()).odak;
  await tus('Escape'); await bekle(300);
  const d2 = await duzenleyici();
  denetle('Yazı düzenlenirken soru: onay kutusu ve Esc düzenlemeyi bitirmez, kapanınca imleç yazıya döner', d0?.odakta && d0.metin === 'Deneme yazı' && odak1 === 'onay kutusu' && d1 && !(await kutuAcik()) && d2?.odakta && d2.metin === 'Deneme yazı' && (await oy())?.secim === 1, js({ d0, d1, odak1, d2 }));
  await tus('Escape'); await bekle(400);
  const yazi = await evalJs(`(() => { const n = window.__pdefe.aktif().notlar; return { duzenleyici: !!n.duzenleyici, yazi: [...n.notlar.values()].some((x) => x.tur === 'FreeText' && !x.silindi && ((x.icerik || '').includes('Deneme yazı') || JSON.stringify(x.yazi || {}).includes('Deneme yazı'))) }; })()`);
  denetle('Ardından Esc düzenlemeyi uygular (yazı eklendi)', !yazi.duzenleyici && yazi.yazi, js(yazi));
  await komut('duzen.geriAl'); await bekle(300);

  // ---------------------------------------------------------------- kutu açıkken menü komutu ve pencere kapatma isteği yok sayılır
  // (ana süreçten gelen olay test:olayGonder ile taklit edilir; CDP tuşu menü hızlandırıcısını tetiklemez)
  await evalJs(`(window.__k = window.__pdefe.mesajKutusu({ mesaj: 'Menü denemesi', dugmeler: ['Tamam', 'Vazgeç'] }), true)`); await kutuBekle();
  await evalJs(`window.pdefe.cagir('test:olayGonder', 'menu:komut', 'yardim.kisayollar')`); await bekle(300);
  const dikkat = await evalJs(`document.querySelector('.mesaj-kutusu')?.classList.contains('dikkat')`);
  denetle('Kutu açıkken menü komutu yok sayılır (F1 açılmaz), kutu belirginleşir', !(await acikMi(F1)) && dikkat && await kutuAcik());
  await evalJs(`window.pdefe.cagir('test:olayGonder', 'pencere:kapatIstegi')`); await bekle(600);
  kb = await kutuBilgi();
  denetle('Kutu açıkken pencere kapatma isteği yok sayılır (ikinci soru açılmaz)', kb?.sayi === 1 && kb.ileti === 'Menü denemesi', js(kb));
  await tus('Escape'); await bekle(200);
  denetle('Kutu Esc ile Vazgeç döner', (await evalJs(`window.__k`)).secim === 1 && !(await kutuAcik()));
  await evalJs(`window.pdefe.cagir('test:olayGonder', 'menu:komut', 'yardim.kisayollar')`); await bekle(300);
  denetle('Kutu kapanınca menü komutu çalışır (F1 açılır)', await acikMi(F1));
  await tus('Escape'); await bekle(200);

  // ---------------------------------------------------------------- Ayarlar ve F1 üstünde, üst üste kutular, iptal varsayılanları
  await komut('duzen.ayarlar'); await beklet(`!!document.querySelector('.ayarlar-ortusu')`);
  const temaOnce = await evalJs(`window.__pdefe.ayar().tema`);
  await tikla(...(await evalJs(`__t.merkez('.ayarlar-pencere [data-id="varsayilan"]')`))); await kutuBekle();
  kb = await kutuBilgi();
  await ekranGoruntusu(`test/png/ortu/mesaj-ayarlar-ustunde-${tema}.png`);
  await disariTikla(MK);
  denetle('Ayarlar üstünde "Varsayılanlara dön": dışarı tık yalnızca soruyu kapatır (Vazgeç), ayarlar değişmez', kb?.ileti === 'Bütün ayarlar varsayılan değerlere döndürülsün mü?' && kb.odak === 'Vazgeç' && !(await kutuAcik()) && await acikMi(AY) && (await evalJs(`window.__pdefe.ayar().tema`)) === temaOnce, js(kb));
  await tikla(...(await evalJs(`__t.merkez('.ayarlar-pencere [data-id="varsayilan"]')`))); await kutuBekle();
  await tus('Escape'); await bekle(250);
  denetle('Ayarlar üstünde: kutuda Esc Ayarlar\'ı kapatmaz', !(await kutuAcik()) && await acikMi(AY));
  await tus('Escape'); await bekle(250);
  denetle('Ardından Esc Ayarlar\'ı kapatır', !(await acikMi(AY)));

  await komut('yardim.kisayollar'); await bekle(300);
  await evalJs(`(window.__k = window.__pdefe.mesajKutusu({ mesaj: 'F1 üstünde kutu', dugmeler: ['Tamam', 'Vazgeç'] }), true)`); await kutuBekle();
  await disariTikla(MK);
  denetle('F1 üstünde kutu: dışarı tık yalnızca kutuyu kapatır', (await evalJs(`window.__k`)).secim === 1 && await acikMi(F1));
  await tus('Escape'); await bekle(250);
  denetle('Ardından Esc F1\'i kapatır', !(await acikMi(F1)));

  await evalJs(`(window.__k1 = window.__pdefe.mesajKutusu({ mesaj: 'Birinci', dugmeler: ['Evet', 'Hayır'] }), window.__k2 = window.__pdefe.mesajKutusu({ tur: 'error', mesaj: 'İkinci', dugmeler: ['Yeniden dene', 'Tamam', 'Vazgeç'], iptal: 1 }), true)`); await bekle(300);
  await disariTikla(MK);
  const ustUste = await evalJs(`(async () => ({ ikinci: await window.__k2, kalan: document.querySelectorAll('.mesaj-kutusu').length, kalanIleti: document.querySelector('.mesaj-ileti')?.textContent }))()`);
  await tus('Escape'); await bekle(250);
  denetle('Üst üste kutular: dışarı tık üsttekini verilen iptal ile kapatır, Esc alttakini son düğmeyle (iptal verilmedi)', ustUste.ikinci.secim === 1 && ustUste.kalan === 1 && ustUste.kalanIleti === 'Birinci' && (await evalJs(`window.__k1`)).secim === 1 && !(await kutuAcik()), js(ustUste));
  await evalJs(`(window.__k = window.__pdefe.mesajKutusu({ mesaj: 'Düğmesiz' }), true)`); await kutuBekle();
  kb = await kutuBilgi(); await tus('Escape'); await bekle(200);
  denetle('Düğme verilmezse "Tamam", Esc 0 döner', js(kb.dugmeler) === js(['Tamam']) && (await evalJs(`window.__k`)).secim === 0);
  await evalJs(`(window.__pdefeOtoYanit = { secim: 1 }, true)`);

  // ---------------------------------------------------------------- temizlik ve özet
  await evalJs(`(async () => { const p = window.__pdefe; window.__pdefeOtoYanit = { secim: 1 }; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); return true; })()`);
  denetle('Sonda açık örtü kalmadı', !(await evalJs(`document.querySelectorAll('.arac-ortusu, .diyalog-ortusu').length`)));
  // Parolada Vazgeç'in "PDF açılamadı" günlüğü (PDF.js PasswordException) beklenen iletidir
  const hatalar = (await evalJs(`__t.hatalar`)).filter((h) => !/PasswordException|vazgeçildi/.test(h));
  denetle('Renderer: hata yok', !hatalar.length, hatalar.join(' | '));
  console.log(`\n${tamam} tamam, ${hata} hata`);
}
