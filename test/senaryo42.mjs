// Senaryo 42 (0.2.8, kullanıcı isteği: "Tüm araçlar için: dosyanın kaydedileceği yeri bir kez değiştirince hep aynı yere kaydetsin, tekrar
// değiştirilene kadar"): araçların çıktı klasörü.
//   0) 0.2.9 denetimi: test örneğinde Masaüstü, Belgeler ve İndirilenler veri klasörünün altında; gerçek Masaüstü'ne yeni dosya düşmez.
//   1) Varsayılan: Ayarlar'daki "Araçların çıktı klasörü" boşken araçlar Masaüstü'nü önerir. Değiştir'de vazgeçmek ya da yalnızca adı değiştirmek
//      (klasör aynı) ayarı değiştirmez.
//   2) Tek dosyalı araçta (Sıkıştır) Değiştir › kaydetme penceresinde başka klasör seçilince o klasör ayara yazılır (bu pencerenin kopyası ve ana
//      süreç); sonra açılan araçlar (Döndür, Sayfaları düzenle) o klasörü önerir.
//   3) Birden çok dosyada (Format Değiştir, klasör seçme penceresi) seçilen klasör de ayara yazılır; Ayır ve Birleştir onu önerir.
//   4) Ayarlar › Kaydetme: kart seçilen klasörü gösterir, açıklama yeni davranışı anlatır.
//   5) Klasör silinince araçlar Masaüstü'ne düşer (ayar silinmez); Ayarlar kartı klasörün bulunamadığını söyler. Yeniden seçilince düzelir.
//      Klasör yokken yalnızca adı değiştiren Değiştir (klasör aracın önerdiği Masaüstü) ayarı değiştirmez; klasör geri gelince yine kullanılır.
//   6) Klasör seçilmemişken (varsayılan klasör bilinmiyor) işlemden önce sorulan klasör de ayara yazılır.
//   7) Ayardaki klasör ulaşılamayan bir ağ paylaşımında (sunucu kapalı, VPN yok; Windows'un yanıtı 20–40 sn sürer): denetim sürerken ana süreç
//      yanıt verir (uygulama donmaz); araç ve Ayarlar kartı kısa sürede Masaüstü'ne düşer. Yanıt vermeyen adres özel ağ aralığındandır
//      (10.255.255.x); her çalıştırmada başka adres seçilir (Windows olumsuz sonucu kısa süre önbellekte tutar).
//   8) Bu pencerede Ayarlar › Kaydetme açıkken başka bir pencerede (araçta Değiştir) klasör değişince kart yeni klasörü gösterir; ayar orada
//      boşaltılınca kart "Masaüstü"nü gösterir, Temizle soluk (0.2.8 inceleme; önceden kart eski yolu göstermeye devam ediyordu).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9442 -Veri "$env:TEMP\pdefe-s42-9442"
//   $env:PDEFE_CDP_PORT=9442; node test\surucu.mjs betik test\senaryo42.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Girdiler test/ornek_pdf_uret.py ile test/cikti/s42 altında üretilir; araçlar çalıştırılmaz (yalnızca Kaydet bölümü ve ayar sınanır).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's42', Date.now().toString(36));
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const ayni = (a, b) => String(a || '').replace(/[\\/]+$/, '').toLowerCase() === String(b || '').replace(/[\\/]+$/, '').toLowerCase();

export default async function ({ evalJs, bekle, hedefler, hedefSec }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await evalJs(ifade); } catch { v = null; }
      if (v || Date.now() - t0 > sure) return v;
      await bekle(120);
    }
  };
  fs.mkdirSync(UI, { recursive: true });
  const pdf = path.join(UI, 'belge.pdf'), pdf2 = path.join(UI, 'ikinci.pdf');
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), pdf, '3', 'Çıktı klasörü örneği'], { encoding: 'utf8' });
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), pdf2, '1', 'İkinci örnek'], { encoding: 'utf8' });
  const A = path.join(UI, 'Klasör A'), B = path.join(UI, 'Klasör B'), C = path.join(UI, 'Klasör C');
  for (const k of [A, B, C]) fs.mkdirSync(k, { recursive: true });
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const ayarYaz = (k, v) => evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', ${J(k)}, ${J(v)}); window.__pdefe.ayar()[${J(k)}] = ${J(v)}; return true; })()`);
  const ayarlar = () => evalJs(`(async () => ({ pencere: window.__pdefe.ayar().ciktiKlasoru, ana: await window.pdefe.cagir('ayar:al', 'ciktiKlasoru') }))()`);
  // Araç pencereleri kapatılırken soru açılırsa (Birleştir'de liste dolu: "kaydedilmemiş değişiklikler var") "Kaydetme" (1) seçilir: araçlar
  // çalıştırılmaz, Masaüstü'ne ya da test klasörlerine dosya yazılmaz
  const araclariKapat = () => evalJs(`(async () => { const eski = window.__pdefeOtoYanit; window.__pdefeOtoYanit = { secim: 1 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); } finally { window.__pdefeOtoYanit = eski; } return true; })()`);
  const yanitla = (kanal, yanit) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', ${J(kanal)}, [${J(yanit)}])`);
  /** Aracın Kaydet bölümündeki klasör çipinin tam yolu (araç önerdiği klasörü yazana dek beklenir). */
  const klasor = async (sinif) => {
    await kosul(`!!document.querySelector('.${sinif} .arac-kayit-yeni .arac-klasor-cip')?.dataset.klasor`, 8000);
    await bekle(150);
    return evalJs(`document.querySelector('.${sinif} .arac-kayit-yeni .arac-klasor-cip')?.dataset.klasor || ''`);
  };
  const degistir = async (sinif) => { await evalJs(`(document.querySelector('.${sinif} .arac-kayit-yeni .arac-cikti-degistir').click(), true)`); await bekle(500); };
  const aracAc = async (komut, sinif, veri) => {
    await evalJs(`(window.__pdefe.komutCalistir(${J(komut)}${veri ? ', ' + J(veri) : ''}), true)`);
    await kosul(`!!document.querySelector('.${sinif}')`, 8000);
    return klasor(sinif);
  };
  // notBekle (ms): kartın "bulunamadı" notu o süre içinde çıkana dek beklenir (7: ağ klasörü)
  const ayarlarKarti = async ({ notBekle = 0 } = {}) => {
    await evalJs(`(window.__pdefe.komutCalistir('duzen.ayarlar', 'kaydetme'), true)`);
    await kosul(`!!document.querySelector('.ayarlar-ortusu')`);
    await bekle(500);
    if (notBekle) await kosul(`(() => { const n = [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((x) => x.querySelector('.ayar-baslik')?.textContent === 'Araçların çıktı klasörü')?.querySelector('.ayar-yol-not'); return !!n && !n.hidden; })()`, notBekle);
    const k = await evalJs(`(() => { const k = [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((x) => x.querySelector('.ayar-baslik')?.textContent === 'Araçların çıktı klasörü');
      return k ? { aciklama: k.querySelector('.ayar-aciklama')?.textContent || '', yol: k.querySelector('.ayar-yol')?.firstChild?.textContent || '', soluk: k.querySelector('.ayar-yol')?.classList.contains('soluk'),
        not: (() => { const n = k.querySelector('.ayar-yol-not'); return n && !n.hidden && n.getBoundingClientRect().height > 0 ? n.textContent : ''; })() } : null; })()`);
    await evalJs(`(document.querySelector('.ayarlar-ortusu [data-id="kapat2"]')?.click(), true)`);
    await kosul(`!document.querySelector('.ayarlar-ortusu')`);
    return k;
  };

  // Hazırlık: açık belgeler kapanır, ayar boş (Masaüstü), belge açılır
  await araclariKapat();
  await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  await ayarYaz('ciktiKlasoru', '');
  await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const bilinen = await evalJs(`window.pdefe.cagir('uygulama:klasorler')`);
  const MASAUSTU = bilinen?.masaustu || '';
  const masaustuOnce = MASAUSTU ? fs.readdirSync(MASAUSTU) : [];
  // 0.2.9 denetimi: test örneğinde Masaüstü, Belgeler ve İndirilenler veri klasörünün altında (gelistirme.js): araçlar hangi sırayla
  // çalışırsa çalışsın gerçek Masaüstü'ne yazamaz. Gerçek Masaüstü de baştan sona sayılır
  const veri = await evalJs(`window.pdefe.cagir('uygulama:veriKlasoru')`);
  const altinda = (y) => !!y && !!veri && path.resolve(y).toLowerCase().startsWith(path.join(path.resolve(veri), 'test-klasorleri').toLowerCase() + path.sep);
  sonuc('0) Test örneğinde Masaüstü, Belgeler ve İndirilenler veri klasörünün altında (gerçek klasörler değil)',
    altinda(bilinen?.masaustu) && altinda(bilinen?.belgeler) && altinda(bilinen?.indirilenler),
    { masaustu: altinda(bilinen?.masaustu), belgeler: altinda(bilinen?.belgeler), indirilenler: altinda(bilinen?.indirilenler) });
  const GERCEK_MASAUSTU = path.join(os.homedir(), 'Desktop');
  const gercekOnce = fs.existsSync(GERCEK_MASAUSTU) ? fs.readdirSync(GERCEK_MASAUSTU) : [];
  await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(pdf)}); return true; })()`);
  await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
  await bekle(400);

  // ------------------------------------------------------------ 1) Varsayılan: Masaüstü; vazgeç ve yalnızca ad değişince ayar değişmez
  console.log('\n== 1) Varsayılan klasör Masaüstü; Değiştir\'de vazgeçmek ya da yalnızca adı değiştirmek ayarı değiştirmez');
  let k = await aracAc('arac.kucult', 'kucult-pencere');
  sonuc('1) Ayar boşken Sıkıştır Masaüstü\'nü öneriyor', !!MASAUSTU && ayni(k, MASAUSTU), { k, MASAUSTU });
  await yanitla('dosya:kaydetDiyalog', null);
  await degistir('kucult-pencere');
  let a = await ayarlar();
  sonuc('1) Değiştir › Vazgeç: ayar boş kaldı, klasör aynı', a.pencere === '' && a.ana === '' && ayni(await klasor('kucult-pencere'), MASAUSTU), a);
  await yanitla('dosya:kaydetDiyalog', path.join(MASAUSTU, 'Başka ad.pdf'));
  await degistir('kucult-pencere');
  a = await ayarlar();
  sonuc('1) Değiştir\'de yalnızca ad değişti (klasör Masaüstü): ayar boş kaldı', a.pencere === '' && a.ana === ''
    && (await evalJs(`document.querySelector('.kucult-pencere .arac-kayit-yeni .arac-cikti-ad').value`)) === 'Başka ad', a);
  await araclariKapat();

  // ------------------------------------------------------------ 2) Tek dosya: kaydetme penceresinde seçilen klasör ayara yazılır
  console.log('\n== 2) Sıkıştır\'da Değiştir ile başka klasör: ayara yazılır, sonraki araçlar onu önerir');
  await aracAc('arac.kucult', 'kucult-pencere');
  await yanitla('dosya:kaydetDiyalog', path.join(A, 'Sıkıştırılmış.pdf'));
  await degistir('kucult-pencere');
  a = await ayarlar();
  sonuc('2) Sıkıştır › Değiştir › "Klasör A": ayar bu pencerede ve ana süreçte "Klasör A"', ayni(a.pencere, A) && ayni(a.ana, A), a);
  sonuc('2) Sıkıştır\'ın klasörü "Klasör A"', ayni(await klasor('kucult-pencere'), A));
  await araclariKapat();
  k = await aracAc('arac.dondurKaydet', 'dondur-pencere');
  sonuc('2) Sonra açılan Döndür "Klasör A"yı öneriyor', ayni(k, A), k);
  await araclariKapat();
  k = await aracAc('arac.sayfalar', 'sayfalar-pencere');
  sonuc('2) Sayfaları düzenle de "Klasör A"yı öneriyor', ayni(k, A), k);
  await araclariKapat();
  k = await aracAc('arac.kucult', 'kucult-pencere');
  sonuc('2) Sıkıştır yeniden açılınca "Klasör A"', ayni(k, A), k);
  await araclariKapat();

  // ------------------------------------------------------------ 3) Birden çok dosya: klasör seçme penceresi
  console.log('\n== 3) Format Değiştir\'de birden çok dosyada seçilen klasör ayara yazılır; Ayır ve Birleştir onu önerir');
  await evalJs(`(async () => { window.__s42d = await import('pdefe://app/src/renderer/araclar/donustur.js'); return true; })()`);
  const D = 'window.__s42d.acikDonusturPenceresi()';
  k = await aracAc('arac.donustur', 'donustur-pencere', [pdf, pdf2]);
  await kosul(`!!${D} && ${D}.ogeler.length === 2 && !${D}.ogeler.some((o) => o.yukleniyor)`, 15000);
  await bekle(300);
  sonuc('3) Format Değiştir (iki dosya) "Klasör A"yı öneriyor', ayni(await klasor('donustur-pencere'), A));
  await yanitla('dosya:klasorSec', B);
  await degistir('donustur-pencere');
  a = await ayarlar();
  sonuc('3) Format Değiştir › Değiştir › "Klasör B" (klasör seçme penceresi): ayar "Klasör B"', ayni(a.pencere, B) && ayni(a.ana, B) && ayni(await klasor('donustur-pencere'), B), a);
  await araclariKapat();
  k = await aracAc('arac.ayir', 'ayir-pencere');
  sonuc('3) Ayır "Klasör B"yi öneriyor', ayni(k, B), k);
  await araclariKapat();
  k = await aracAc('arac.gorselBirlestir', 'birlestir-pencere');
  sonuc('3) Birleştir "Klasör B"yi öneriyor', ayni(k, B), k);
  await araclariKapat();

  // ------------------------------------------------------------ 4) Ayarlar › Kaydetme
  console.log('\n== 4) Ayarlar › Kaydetme: kart seçilen klasörü gösterir, açıklama yeni davranışı anlatır');
  let kart = await ayarlarKarti();
  sonuc('4) Kart "Klasör B"yi gösteriyor (soluk değil, not yok)', kart && ayni(kart.yol, B) && !kart.soluk && !kart.not, kart);
  sonuc('4) Açıklama: Değiştir ile seçilen klasör buraya yazılır, sonraki kayıtlarda bütün araçlar kullanır; yoksa Masaüstü',
    /Değiştir/.test(kart?.aciklama) && /bütün araçlar/.test(kart?.aciklama) && /Masaüstü/.test(kart?.aciklama) && !/önerilen klasör; araç penceresinde değiştirilebilir/.test(kart?.aciklama), kart?.aciklama);

  // ------------------------------------------------------------ 5) Klasör silinince Masaüstü
  console.log('\n== 5) Klasör silinince araçlar Masaüstü\'ne düşer; Ayarlar kartı söyler; yeniden seçilince düzelir');
  fs.rmSync(B, { recursive: true, force: true });
  k = await aracAc('arac.kucult', 'kucult-pencere');
  a = await ayarlar();
  sonuc('5) "Klasör B" silindi: Sıkıştır Masaüstü\'nü öneriyor, ayar silinmedi', ayni(k, MASAUSTU) && ayni(a.ana, B), { k, a });
  await araclariKapat();
  kart = await ayarlarKarti();
  sonuc('5) Ayarlar kartı: yol duruyor, altında "bulunamadı; yerine Masaüstü kullanılır" notu', kart && ayni(kart.yol, B) && /bulunamadı/.test(kart.not) && /Masaüstü/.test(kart.not), kart);
  await aracAc('arac.kucult', 'kucult-pencere');
  await yanitla('dosya:kaydetDiyalog', path.join(C, 'Sıkıştırılmış.pdf'));
  await degistir('kucult-pencere');
  a = await ayarlar();
  sonuc('5) Yeni klasör ("Klasör C") seçilince ayar düzeldi', ayni(a.pencere, C) && ayni(a.ana, C), a);
  await araclariKapat();
  kart = await ayarlarKarti();
  sonuc('5) Ayarlar kartı "Klasör C"yi notsuz gösteriyor', kart && ayni(kart.yol, C) && !kart.not, kart);
  // Ayardaki klasör yokken (araç Masaüstü'nü öneriyor) Değiştir'de yalnızca ad değişirse (klasör aracın önerdiği Masaüstü) ayar değişmez:
  // klasör geri gelince (çıkarılabilir disk yeniden takıldı) araçlar yine onu önerir (0.2.8 inceleme; önceden ayar Masaüstü oluyordu)
  fs.rmSync(C, { recursive: true, force: true });
  k = await aracAc('arac.kucult', 'kucult-pencere');
  await yanitla('dosya:kaydetDiyalog', path.join(MASAUSTU, 'Başka ad.pdf'));
  await degistir('kucult-pencere');
  a = await ayarlar();
  sonuc('5) Ayardaki klasör yokken yalnızca ad değişti (klasör önerilen Masaüstü): ayar "Klasör C" kaldı', ayni(k, MASAUSTU) && ayni(a.pencere, C) && ayni(a.ana, C)
    && (await evalJs(`document.querySelector('.kucult-pencere .arac-kayit-yeni .arac-cikti-ad').value`)) === 'Başka ad', { k, a });
  await araclariKapat();
  fs.mkdirSync(C, { recursive: true });
  k = await aracAc('arac.kucult', 'kucult-pencere');
  sonuc('5) "Klasör C" geri gelince Sıkıştır yine onu öneriyor', ayni(k, C), k);
  await araclariKapat();

  // ------------------------------------------------------------ 6) İşlemden önce sorulan klasör
  console.log('\n== 6) Klasör seçilmemişken işlemden önce sorulan klasör de ayara yazılır');
  fs.mkdirSync(B, { recursive: true });
  // Varsayılan klasör bilinmiyormuş gibi (kayıt seçimi aracın dışında kurulur): klasör boşaltılır, denetle klasör seçme penceresini açar
  await yanitla('dosya:klasorSec', B);
  const d6 = await evalJs(`(async () => {
    const ortak = await import('pdefe://app/src/renderer/araclar/ortak.js');
    const baglam = { pdefe: window.pdefe, ayar: () => window.__pdefe.ayar(), ayarKoy: (a, d) => { window.__pdefe.ayar()[a] = d; return window.pdefe.cagir('ayar:koy', a, d); },
      bildir: () => {}, mesajKutusu: async () => ({ secim: 0 }) };
    const kayit = ortak.kayitSecimi({ baglam, belge: null, ad: 'Deneme' });
    await kayit.hazir;
    kayit.cikti.ayarla('', null);
    const s = await kayit.denetle();
    return { s, klasor: kayit.cikti.klasor() };
  })()`);
  a = await ayarlar();
  sonuc('6) Klasör sorulup "Klasör B" seçildi: işlem sürer, ayar "Klasör B"', d6.s === 'devam' && ayni(d6.klasor, B) && ayni(a.ana, B) && ayni(a.pencere, B), { d6, a });

  // ------------------------------------------------------------ 7) Ağdaki klasöre ulaşılamıyor
  console.log('\n== 7) Ayardaki klasör ulaşılamayan bir ağ paylaşımında: uygulama donmaz, araç ve Ayarlar kartı kısa sürede Masaüstü\'ne düşer');
  const kullanilan = new Set();
  const agYolu = () => {
    let x;
    do x = 2 + Math.floor(Math.random() * 250); while (kullanilan.has(x));
    kullanilan.add(x);
    return `\\\\10.255.255.${x}\\paylasim\\Ciktilar`;
  };
  // Ana süreç denetim sürerken yanıt veriyor mu: denetim başladıktan 50 ms sonra gönderilen küçük isteğin (ayar:al) süresi. Denetimin kendisi
  // beklenmez (20–40 sn sürer)
  const AG1 = agYolu();
  const yanitSuresi = await evalJs(`(async () => {
    window.pdefe.cagir('dosya:varMi', ${J(AG1)}).catch(() => {});
    await new Promise((c) => setTimeout(c, 50));
    const t0 = performance.now();
    await window.pdefe.cagir('ayar:al', 'tema');
    return Math.round(performance.now() - t0);
  })()`);
  sonuc('7) Ağ yolu denetlenirken ana süreç yanıt veriyor (küçük istek 500 ms\'den kısa)', yanitSuresi < 500, yanitSuresi);
  const AG2 = agYolu();
  await ayarYaz('ciktiKlasoru', AG2);
  const t7 = Date.now();
  k = await aracAc('arac.kucult', 'kucult-pencere');
  const sure7 = Date.now() - t7;
  a = await ayarlar();
  sonuc('7) Sıkıştır 4 sn içinde Masaüstü\'nü öneriyor; ayar silinmedi', ayni(k, MASAUSTU) && sure7 < 4000 && ayni(a.ana, AG2), { k, sure7, a });
  await yanitla('dosya:kaydetDiyalog', path.join(MASAUSTU, 'Ağ denemesi.pdf'));
  await degistir('kucult-pencere');
  a = await ayarlar();
  sonuc('7) Yalnızca adı değiştiren Değiştir ağ klasörü ayarını değiştirmiyor', ayni(a.pencere, AG2) && ayni(a.ana, AG2), a);
  await araclariKapat();
  const AG3 = agYolu();
  await ayarYaz('ciktiKlasoru', AG3);
  const t7b = Date.now();
  kart = await ayarlarKarti({ notBekle: 4000 });
  const sure7b = Date.now() - t7b;
  sonuc('7) Ayarlar kartı yolu gösteriyor, 4 sn içinde "bulunamadı; yerine Masaüstü kullanılır" notu', kart && ayni(kart.yol, AG3) && /bulunamadı/.test(kart.not) && sure7b < 5000, { kart, sure7b });

  // ------------------------------------------------------------ 8) Başka pencerede değişen klasör, bu penceredeki açık Ayarlar kartında
  console.log('\n== 8) Başka pencerede klasör değişince bu penceredeki açık Ayarlar kartı yeni klasörü gösterir');
  // Komutlar bu pencereye gitsin: CDP listesinin ilki yeni pencere açılınca değişebilir
  const ilkHedef = (await hedefler())[0].id;
  hedefSec(ilkHedef);
  const ilkKimlik = await evalJs(`window.pdefe.cagir('pencere:kimlik')`);
  await ayarYaz('ciktiKlasoru', A);
  await evalJs(`(window.__pdefe.komutCalistir('duzen.ayarlar', 'kaydetme'), true)`);
  await kosul(`!!document.querySelector('.ayarlar-ortusu')`);
  await bekle(500);
  const kartOku = () => evalJs(`(() => { const k = [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((x) => x.querySelector('.ayar-baslik')?.textContent === 'Araçların çıktı klasörü');
    if (!k) return null; const n = k.querySelector('.ayar-yol-not'); const temizle = [...k.querySelectorAll('button')].find((b) => b.textContent === 'Temizle');
    return { yol: k.querySelector('.ayar-yol')?.firstChild?.textContent || '', soluk: k.querySelector('.ayar-yol')?.classList.contains('soluk'), not: n && !n.hidden ? n.textContent : '', temizleSoluk: !!temizle?.disabled }; })()`);
  let k8 = await kartOku();
  sonuc('8) Bu pencerede Ayarlar kartı "Klasör A"yı gösteriyor', k8 && ayni(k8.yol, A) && !k8.soluk && !k8.not, k8);
  // İkinci pencere (ikinci.pdf ile); hazır olunca orada Sıkıştır › Değiştir › "Klasör C"
  await evalJs(`window.pdefe.cagir('pencere:yeniPenceredeAc', [${J(pdf2)}])`);
  let ikinciHedef = null;
  for (let i = 0; i < 80 && !ikinciHedef; i++) {
    for (const h of await hedefler()) {
      if (h.id === ilkHedef) continue;
      hedefSec(h.id);
      try { if (await evalJs(`!!window.__pdefe?.aktif()?.gorunum?.sayfaSayisi`)) ikinciHedef = h.id; } catch { /* yükleniyor */ }
    }
    if (!ikinciHedef) await bekle(250);
  }
  sonuc('8) İkinci pencere açıldı, ikinci belge yüklü', !!ikinciHedef);
  if (ikinciHedef) {
    hedefSec(ikinciHedef);
    await aracAc('arac.kucult', 'kucult-pencere');
    await yanitla('dosya:kaydetDiyalog', path.join(C, 'Sıkıştırılmış.pdf'));
    await degistir('kucult-pencere');
    await araclariKapat();
    hedefSec(ilkHedef);
    await kosul(`window.__pdefe.ayar().ciktiKlasoru === ${J(C)}`, 4000);
    await bekle(300);
    k8 = await kartOku();
    a = await ayarlar();
    sonuc('8) Öbür pencerede Değiştir › "Klasör C": bu penceredeki açık kart "Klasör C"yi gösteriyor', k8 && ayni(k8.yol, C) && !k8.soluk && !k8.not && !k8.temizleSoluk && ayni(a.pencere, C), { k8, a });
    // Öbür pencerede ayar boşaltılınca (Ayarlar'daki Temizle'nin yazdığı) kart "Masaüstü"nü soluk gösterir, Temizle soluk
    hedefSec(ikinciHedef);
    await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'ciktiKlasoru', ''); window.__pdefe.ayar().ciktiKlasoru = ''; return true; })()`);
    hedefSec(ilkHedef);
    await kosul(`window.__pdefe.ayar().ciktiKlasoru === ''`, 4000);
    await bekle(300);
    k8 = await kartOku();
    sonuc('8) Öbür pencerede ayar boşaltıldı: kart "Masaüstü" (soluk), Temizle soluk', k8 && k8.yol === 'Masaüstü' && k8.soluk && k8.temizleSoluk && !k8.not, k8);
    // İkinci pencere kapanır (kaydedilmemiş değişiklik yok)
    hedefSec(ikinciHedef);
    try { await evalJs(`(window.pdefe.cagir('pencere:kapatOnayla', null), true)`); } catch { /* kapandı */ }
    await bekle(800);
  }
  hedefSec(ilkHedef);
  sonuc('8) Komutlar yine ilk pencereye gidiyor', (await evalJs(`window.pdefe.cagir('pencere:kimlik')`)) === ilkKimlik);
  await evalJs(`(document.querySelector('.ayarlar-ortusu [data-id="kapat2"]')?.click(), true)`);
  await kosul(`!document.querySelector('.ayarlar-ortusu')`);

  // Temizlik: ayar boş, belgeler kapalı
  await ayarYaz('ciktiKlasoru', '');
  await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const masaustuSonra = MASAUSTU ? fs.readdirSync(MASAUSTU) : [];
  sonuc('Masaüstü\'ne dosya yazılmadı (araçlar çalıştırılmadı)', masaustuSonra.length === masaustuOnce.length && masaustuSonra.every((x) => masaustuOnce.includes(x)), masaustuSonra.filter((x) => !masaustuOnce.includes(x)).length);
  const gercekSonra = fs.existsSync(GERCEK_MASAUSTU) ? fs.readdirSync(GERCEK_MASAUSTU) : [];
  sonuc('Gerçek Masaüstü\'nde yeni dosya yok', gercekSonra.every((x) => gercekOnce.includes(x)), gercekSonra.filter((x) => !gercekOnce.includes(x)).length);
  const hatalar = await evalJs(`(window.__hatalar || []).slice(0, 5)`);
  sonuc('Sayfada hata yok', !hatalar?.length, hatalar);
  console.log(hataSayisi ? `\n${hataSayisi} HATA / ${denetim}` : `\nBÜTÜN DENETİMLER GEÇTİ (${denetim})`);
  if (hataSayisi) process.exitCode = 1;
}
