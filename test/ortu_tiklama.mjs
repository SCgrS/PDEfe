// Açılır pencerelerin örtüsüne (pencerenin dışına) tıklama: gerçek fare girdisiyle.
//  - Her modal pencere (F1, parola, Ayarlar, Yazdır seçenekleri ve hazırlık, beş araç penceresi, Ctrl+Tab seçicisi): içeride tık,
//    içeriden dışarı sürükleme, örtüde basıp içeride bırakma, sağ ve orta tık kapatmaz; dışarı tık Esc / X ile aynı sonuçla kapatır.
//  - Araç penceresinde işlem sürerken (Küçült) ve uygulanmamış değişiklik varken (Sayfaları düzenle, dolu birleştirme listesi) sorulur;
//    "Sürdür / Düzenlemeye dön" pencereyi açık bırakır.
//  - İç içe: araç penceresinin üstündeki F1 / Ayarlar dışarı tıklamayla kapanır, araç penceresi açık kalır.
//  - Açılır pencereler (açık belgeler listesi, Bul seçenekleri, Araçlar) dışarıda basışla kapanır; nota basış da kapatır.
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

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, surukle, tus }) {
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
    // Önceki çalıştırmadan kalan pencereler kendi kapatma yollarıyla kapanır (araç penceresi kaydı, Ayarlar durumu bozulmasın)
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
  const F1 = '.diyalog-ortusu:not(.ayarlar-ortusu):not(.yazdir-ortusu)';
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
  for (const [id, ad] of [['arac.kucult', 'Küçült'], ['arac.sayfalar', 'Sayfaları düzenle'], ['arac.dondurKaydet', 'Döndür ve kaydet'], ['arac.ayir', 'Ayır'], ['arac.gorselBirlestir', 'Görüntü / PDF birleştir']]) {
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

  // Sayfaları düzenle: uygulanmamış değişiklik varken dışarı tık sorar
  await komut('arac.sayfalar'); await beklet(`document.querySelectorAll('.sayfa-karti').length > 0`); await bekle(500);
  await tikla(...(await evalJs(`__t.merkez('.sayfalar-arac-cubugu [data-komut="tumunuSec"]')`))); await bekle(150);
  await tikla(...(await evalJs(`__t.merkez('.sayfalar-arac-cubugu [data-komut="sagaDondur"]')`))); await bekle(300);
  await yanit(1); await disariTikla(AR);
  denetle('Sayfaları düzenle: değişiklik varken dışarı tık sorar, "Düzenlemeye dön" açık bırakır', (await sonSoru()) === 'Sayfa düzeninde uygulanmamış değişiklikler var.' && await acikMi(AR), await sonSoru());
  await yanit(0); await disariTikla(AR);
  denetle('Sayfaları düzenle: "Kapat" ile kapanır, belge değişmez', !(await acikMi(AR)) && !(await evalJs(`window.__pdefe.aktif().degisti`)));

  // Görüntü / PDF birleştir: dolu liste sorulur
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:acDiyalog', [[${js(B)}]])`);
  await komut('arac.gorselBirlestir'); await beklet(`!!document.querySelector('.birlestir-ekle')`); await bekle(300);
  await tikla(...(await evalJs(`__t.merkez('.birlestir-ekle')`)));
  await beklet(`!document.querySelector('.arac-pencere .bos-mesaj')`); await bekle(500);
  await yanit(1); await disariTikla(AR);
  denetle('Birleştir: dolu listede dışarı tık sorar, "Listeye dön" açık bırakır', (await sonSoru()) === 'Liste boş değil.' && await acikMi(AR), await sonSoru());
  await yanit(0); await disariTikla(AR);
  denetle('Birleştir: "Kapat" ile kapanır', !(await acikMi(AR)));

  // Küçült: işlem sürerken dışarı tık sorar (Sürdür → açık, işlem sürer; İptal et ve kapat → kapanır)
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'buyuk.pdf'); await p.sekmeSec(b.id); return true; })()`);
  await komut('arac.kucult'); await beklet(`!!document.querySelector('.kucult-pencere')`); await bekle(800);
  await tikla(...(await evalJs(`__t.merkez('.arac-pencere .arac-dugmeler .birincil')`)));
  const suruyor = await beklet(`!!document.querySelector('.arac-ilerleme:not([hidden])')`, 5000);
  await yanit(1); await disariTikla(AR);
  const s1 = { soru: await sonSoru(), acik: await acikMi(AR), suruyor: await evalJs(`!!document.querySelector('.arac-ilerleme:not([hidden]) .arac-ilerleme-iptal:not(:disabled)')`) };
  denetle('Küçült: işlem sürerken dışarı tık sorar, "Sürdür" açık bırakır', suruyor && s1.soru === 'Küçültme sürüyor.' && s1.acik, JSON.stringify(s1));
  await ekranGoruntusu('test/png/ortu/kucult-suruyor.png');
  await yanit(0); await disariTikla(AR);
  denetle('Küçült: "İptal et ve kapat" ile kapanır', !(await acikMi(AR)));
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
  await evalJs(`(() => { const b = window.__pdefe.aktif(); const r = b.gorunum.sayfalar[0].el.getBoundingClientRect(); b.notlar.yapiskanNotKoy(0, { clientX: r.left + 120, clientY: r.top + 120 }); b.notlar.balonKapat(); b.notlar.sec(null); return true; })()`);
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

  // ---------------------------------------------------------------- temizlik ve özet
  await evalJs(`(async () => { const p = window.__pdefe; window.__pdefeOtoYanit = { secim: 1 }; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); return true; })()`);
  denetle('Sonda açık örtü kalmadı', !(await evalJs(`document.querySelectorAll('.arac-ortusu, .diyalog-ortusu').length`)));
  // Parolada Vazgeç'in "PDF açılamadı" günlüğü (PDF.js PasswordException) beklenen iletidir
  const hatalar = (await evalJs(`__t.hatalar`)).filter((h) => !/PasswordException|vazgeçildi/.test(h));
  denetle('Renderer: hata yok', !hatalar.length, hatalar.join(' | '));
  console.log(`\n${tamam} tamam, ${hata} hata`);
}
