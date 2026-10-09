// Senaryo 14 (0.1.9; 0.1.12'de güncellendi: Sayfa düzeni ve Belge açılışı "Açılış ve düzen" oldu, Notlar "Not ve vurgu", Kopyalama
// kalktı): Ayarlar sekmeleri (adlar ve sıra, her sekmenin kartları, eski bölüm kimlikleri 'baslangic' / 'dosya' / 'sayfa' / 'kopyalama'),
// Açılış ve düzen'deki "Son açılanları hatırla" ve "Her belgeyi kaldığım sayfadan aç" anahtarları (gerçek tıklamayla: kapatınca kayıt
// silinir, kapalıyken yazılmaz, açınca yeniden tutulur; kapalıyken başlangıç ekranında Son açılanlar kutusu hiç görünmez ve içerik
// ortalanır — 0.1.13, kullanıcı isteği; 0.1.12'ye dek kutuda "hatırlanmıyor" bilgi satırı ve Ayarlar bağlantısı vardı —, açınca kutu
// geri gelir; Dosya menüsündeki Son açılanlar), aynı sekmedeki kapak anahtarı ve arayüzde (ayarlar, başlangıç ekranı, menü) başka PDF
// programlarının adının geçmemesi. Açık ve koyu temada her sekmenin ekran görüntüsü test/cikti/ui14/png altına yazılır.
// Kullanım: boş veri klasörlü test örneği (baslat.ps1) açıkken  $env:PDEFE_CDP_PORT=9341; node test/surucu.mjs betik test/senaryo14.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 'ui14');
const PDF = path.join(UI, 'pdf');
const PNG = path.join(UI, 'png');
const J = (x) => JSON.stringify(x);
const MARKA = /ado[b]e|acroba[t]/i;   // başka PDF programlarının adı (0.1.9'dan beri hiçbir yerde geçmez)

const BEKLENEN = [
  ['gorunum', 'Görünüm', ['Tema', 'Sayfayı da koyulaştır', 'Yazı çizimi']],
  ['acilis', 'Açılış ve düzen', ['Varsayılan PDF görüntüleyici', 'Her belgeyi kaldığım sayfadan aç', 'Son açılanları hatırla',
    'Varsayılan yakınlaştırma', 'Tek ya da iki sayfa', 'Kaydırmayı etkinleştir', 'Kapak sayfasını ayrı göster',
    'Pencereyi kapatırken']],   // 'Döndür düğmesi' 0.1.27'de kaldırıldı; 'Pencereyi kapatırken' 0.2.2
  ['notlar', 'Not ve vurgu', ['Yazar adı', 'Varsayılan vurgu rengi', 'Vurgu opaklığı', 'Yazı tipi', 'Yazı boyutu', 'Yazı rengi', 'Yazı arka planı']],
  ['kaydetme', 'Kaydetme', ['Otomatik kaydet', 'Araçların çıktı klasörü']],
  ['guncelleme', 'Güncelleme', ['Güncellemeleri otomatik denetle (haftada bir)', 'Şimdi denetle']],
  ['kisayollar', 'Kısayollar', []],   // 0.2.4: F1'deki liste (kart değil, tablolar; senaryo32)
  ['hakkinda', 'Hakkında', []],
];

let hataSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, tus }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => { await bekle(300); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const depo = (anahtar) => evalJs(`window.pdefe.cagir('ayar:al', ${J(anahtar)})`);   // ana süreçteki kayıt (ayarlar.json)
  const ayar = (anahtar) => evalJs(`window.__pdefe.ayar()[${J(anahtar)}]`);
  const dosyaMenusu = async () => (await evalJs(`window.pdefe.cagir('test:menu')`))?.find((m) => m.etiket === '&Dosya')?.alt || [];
  const sonAcilanlarMenusu = async () => (await dosyaMenusu()).find((o) => o?.etiket === 'Son açılanlar') || null;
  const sekmeleriKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return window.__pdefe.belgeler.size; })()`);
  const ac = async (yol) => {
    await evalJs(`window.__pdefe.dosyaAc(${J(yol)}).then(() => true)`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
    await bekle(400);
  };
  const ayarlarAc = async (bolum) => {
    await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar'${bolum ? ', ' + J(bolum) : ''})`);
    await kosul(`!!document.querySelector('.ayarlar-ortusu')`);
    await bekle(200);
  };
  const ayarlarKapat = async () => { await evalJs(`document.querySelector('.ayarlar-ortusu [data-id="kapat2"]')?.click()`); await kosul(`!document.querySelector('.ayarlar-ortusu')`); };
  const seciliBolum = () => evalJs(`document.querySelector('.ayarlar-bolumler button.secili')?.dataset.bolum || null`);
  /** Öğenin ortasına gerçek fare tıklaması (CSS pikseli). */
  const ortayaTikla = async (secici) => {
    const r = await evalJs(`(() => { const e = ${secici}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) throw new Error('Tıklanacak öğe yok: ' + secici);
    await tikla(r.x, r.y);
    await bekle(250);
  };
  const bolumTikla = (id) => ortayaTikla(`document.querySelector('.ayarlar-bolumler [data-bolum="${id}"]')`);
  /** Başlığı verilen ayar kartındaki açma/kapama anahtarı (gövdesine tıklanır). */
  const anahtarSecici = (baslik) => `[...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((k) => k.querySelector('.ayar-baslik')?.textContent === ${J(baslik)})?.querySelector('.ayar-anahtar-govde')`;
  const anahtarDurumu = (baslik) => evalJs(`[...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((k) => k.querySelector('.ayar-baslik')?.textContent === ${J(baslik)})?.querySelector('input[role="switch"]')?.checked ?? null`);
  const bolumMetni = () => evalJs(`document.querySelector('.ayarlar-pencere')?.innerText || ''`);

  // ---------------------------------------------------------------- hazırlık
  fs.mkdirSync(PDF, { recursive: true });
  const kaynak = fs.readdirSync(path.join(KOK, 'test', 'pdf')).filter((a) => /\.pdf$/i.test(a)).map((a) => path.join(KOK, 'test', 'pdf', a))
    .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size)[0];
  if (!kaynak) throw new Error('test/pdf altında PDF yok');
  const A = path.join(PDF, 'belge-a.pdf'), B = path.join(PDF, 'belge-b.pdf');
  fs.copyFileSync(kaynak, A); fs.copyFileSync(kaynak, B);
  await tus('Escape');
  await sekmeleriKapat();
  sonuc('Başlangıç: iki anahtar açık (varsayılan)', (await ayar('sonAcilanlariHatirla')) === true && (await ayar('kaldigimSayfadanAc')) === true);

  // ---------------------------------------------------------------- anahtarlar açıkken kayıt tutulur
  await ac(A);
  sonuc('Açık: açılan belge son açılanlara eklenir', (await depo('sonDosyalar'))?.[0] === A, await depo('sonDosyalar'));
  sonuc('Açık: Dosya › Son açılanlar menüde, belgeyle', !!(await sonAcilanlarMenusu())?.alt?.includes('belge-a.pdf'), await sonAcilanlarMenusu());
  await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(3)`);
  await bekle(1600);
  sonuc('Açık: kalınan sayfa yazılır', (await depo('sayfaKonumlari'))?.[A] === 3, await depo('sayfaKonumlari'));
  await sekmeleriKapat();

  // ---------------------------------------------------------------- sekmeler: ad, sıra, kartlar, marka adı yok (açık ve koyu tema)
  await ayarlarAc();
  const adlar = await evalJs(`[...document.querySelectorAll('.ayarlar-bolumler button')].map((b) => [b.dataset.bolum, b.textContent.trim()])`);
  sonuc('Sekmeler ve sırası', J(adlar) === J(BEKLENEN.map(([id, ad]) => [id, ad])), adlar);
  for (const tema of ['acik', 'koyu']) {
    if (await evalJs(`document.documentElement.dataset.tema`) !== tema) {
      await bolumTikla('gorunum');
      await evalJs(`(() => { const s = [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((k) => k.querySelector('.ayar-baslik')?.textContent === 'Tema').querySelector('select'); s.value = ${J(tema)}; s.dispatchEvent(new Event('change')); })()`);
      await kosul(`document.documentElement.dataset.tema === ${J(tema)}`);
    }
    for (const [id, ad, kartlar] of BEKLENEN) {
      await bolumTikla(id);
      const b = await evalJs(`({ secili: document.querySelector('.ayarlar-bolumler button.secili')?.dataset.bolum, h2: document.querySelector('.ayarlar-icerik h2')?.textContent,
        kartlar: [...document.querySelectorAll('.ayarlar-icerik .ayar-kart .ayar-baslik')].map((e) => e.textContent) })`);
      if (tema === 'acik') {
        sonuc(`${ad}: sekme seçildi, başlık`, b.secili === id && b.h2 === ad, b);
        sonuc(`${ad}: kartlar`, J(b.kartlar) === J(kartlar), b.kartlar);
      }
      const metin = await bolumMetni();
      sonuc(`${ad} (${tema}): marka adı geçmiyor`, !MARKA.test(metin));
      await ss(`ayarlar-${id}-${tema}`);
    }
  }
  await bolumTikla('gorunum');
  const cizim = await evalJs(`(() => { const s = [...document.querySelectorAll('.ayarlar-icerik .ayar-kart')].find((k) => k.querySelector('.ayar-baslik')?.textContent === 'Yazı çizimi').querySelector('select'); return { deger: s.value, secenekler: [...s.options].map((o) => o.textContent) }; })()`);
  sonuc('Yazı çizimi: "Dengeli (önerilen)" seçili, ikinci seçenek Windows ClearType', cizim.deger === 'anaHat' && J(cizim.secenekler) === J(['Dengeli (önerilen)', 'Windows ClearType']), cizim);

  // ---------------------------------------------------------------- kapak anahtarı (Açılış ve düzen)
  await bolumTikla('acilis');
  const kapakOnce = await ayar('kapakAyri');
  await ortayaTikla(anahtarSecici('Kapak sayfasını ayrı göster'));
  sonuc('Kapak anahtarı ayarı değiştirir', (await ayar('kapakAyri')) === !kapakOnce && (await depo('kapakAyri')) === !kapakOnce);
  await ortayaTikla(anahtarSecici('Kapak sayfasını ayrı göster'));
  sonuc('Kapak anahtarı geri alındı', (await depo('kapakAyri')) === kapakOnce);

  // ---------------------------------------------------------------- iki anahtarı kapat (gerçek tıklama)
  await bolumTikla('acilis');
  await ortayaTikla(anahtarSecici('Son açılanları hatırla'));
  sonuc('Son açılanlar kapatıldı: anahtar ve ayar', (await anahtarDurumu('Son açılanları hatırla')) === false && (await depo('sonAcilanlariHatirla')) === false);
  sonuc('Kapatınca liste silindi', J(await depo('sonDosyalar')) === '[]' && J(await ayar('sonDosyalar')) === '[]', await depo('sonDosyalar'));
  sonuc('Kapalıyken Dosya menüsünde Son açılanlar yok', !(await sonAcilanlarMenusu()), await dosyaMenusu());
  await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  await evalJs(`window.pdefe.cagir('dosya:acDiyalog', {})`);
  const acKaydi = (await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`)).find((k) => k.kanal === 'dosya:acDiyalog');
  sonuc('Kapalıyken Aç penceresi Windows\'un son kullanılanlarına eklemez (dontAddToRecent)', acKaydi?.secenek?.windowsSonKullanilanlar === false, acKaydi?.secenek);
  await ortayaTikla(anahtarSecici('Her belgeyi kaldığım sayfadan aç'));
  sonuc('Kaldığım sayfa kapatıldı: anahtar ve ayar', (await anahtarDurumu('Her belgeyi kaldığım sayfadan aç')) === false && (await depo('kaldigimSayfadanAc')) === false);
  sonuc('Kapatınca sayfa konumları silindi', J(await depo('sayfaKonumlari')) === '{}', await depo('sayfaKonumlari'));
  await ss('ayarlar-acilis-kapali');
  await ayarlarKapat();

  // ---------------------------------------------------------------- kapalıyken yazılmaz
  await ac(B);
  await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(2)`);
  await bekle(1600);
  sonuc('Kapalı: açılan belge listeye eklenmez', J(await depo('sonDosyalar')) === '[]' && J(await ayar('sonDosyalar')) === '[]', await depo('sonDosyalar'));
  sonuc('Kapalı: sayfa değişince konum yazılmaz', J(await depo('sayfaKonumlari')) === '{}', await depo('sayfaKonumlari'));
  await sekmeleriKapat();
  sonuc('Kapalı: sekme kapanınca da konum yazılmaz', J(await depo('sayfaKonumlari')) === '{}', await depo('sayfaKonumlari'));
  await ac(B);
  sonuc('Kapalı: belge 1. sayfadan açılır', (await evalJs(`window.__pdefe.aktif().gorunum.gecerli`)) === 1);
  await sekmeleriKapat();

  // ---------------------------------------------------------------- başlangıç ekranı: Son açılanlar kutusu gizli, içerik ortada (0.1.13;
  // 0.1.14'ten beri tek sütun: kapalıyken yalnızca Son açılanlar bölümü kalkar, sütun aynı genişlikte ve ortada kalır)
  await kosul(`!document.querySelector('#baslangic').hidden`);
  const baslangicDurumu = () => evalJs(`(() => { const s = document.querySelector('.karsilama-son'), k = document.querySelector('.karsilama'), r = k.getBoundingClientRect(), b = document.querySelector('#baslangic').getBoundingClientRect();
    return { sonGizli: s.hidden && s.getBoundingClientRect().height === 0, baglanti: !!document.querySelector('.karsilama-ayar-baglantisi'),
      ortaFark: Math.round(Math.abs((r.left + r.right) / 2 - (b.left + b.right) / 2)), genislik: Math.round(r.width), pdfAc: !!document.querySelector('.karsilama-ac'),
      araclar: document.querySelectorAll('.karsilama-arac').length, liste: document.querySelector('#son-dosyalar').innerText, tum: document.querySelector('#baslangic').innerText }; })()`);
  const bas = await baslangicDurumu();
  sonuc('Başlangıç ekranı: Son açılanlar kutusu hiç görünmüyor (bilgi satırı / Ayarlar bağlantısı yok), PDF aç ve 5 araç ortada',
    bas.sonGizli && !bas.baglanti && !/Son açılanlar|hatırlanmıyor/.test(bas.tum) && bas.ortaFark <= 10 && bas.pdfAc && bas.araclar === 5, bas);
  sonuc('Başlangıç ekranı: marka adı geçmiyor', !MARKA.test(bas.tum));
  await ss('baslangic-kapali-koyu');
  // 0.1.12'ye dek başlangıç ekranındaki bağlantı Ayarlar › Açılış ve düzen'i açıyordu; bağlantı kutuyla birlikte kalktı, Ayarlar komutla açılır
  await ayarlarAc('acilis');
  sonuc('Ayarlar › Açılış ve düzen açıldı', (await seciliBolum()) === 'acilis', await seciliBolum());

  // ---------------------------------------------------------------- yeniden aç: kayıt yeniden tutulur
  await ortayaTikla(anahtarSecici('Son açılanları hatırla'));
  await ortayaTikla(anahtarSecici('Her belgeyi kaldığım sayfadan aç'));
  sonuc('İki anahtar yeniden açık', (await depo('sonAcilanlariHatirla')) === true && (await depo('kaldigimSayfadanAc')) === true);
  const menu = await sonAcilanlarMenusu();
  sonuc('Açınca Dosya › Son açılanlar geri geldi (boş)', !!menu && J(menu.alt) === J(['(boş)']), menu);
  await evalJs(`window.pdefe.cagir('dosya:acDiyalog', {})`);
  const acKaydi2 = (await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`)).find((k) => k.kanal === 'dosya:acDiyalog');
  sonuc('Açıkken Aç penceresi eskisi gibi (Windows listesine ekler)', acKaydi2?.secenek?.windowsSonKullanilanlar === true, acKaydi2?.secenek);
  await ayarlarKapat();
  const bas2 = await baslangicDurumu();
  sonuc('Açınca başlangıç ekranında Son açılanlar kutusu geri geldi, boş liste iletisiyle (sütun aynı genişlikte)', !bas2.sonGizli && /Henüz açılan belge yok/.test(bas2.liste)
    && /Son açılanlar/.test(bas2.tum) && bas2.genislik === bas.genislik && bas2.ortaFark <= 10, bas2);
  await ac(A);
  await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(2)`);
  await bekle(1600);
  sonuc('Açık: liste yeniden tutulur', J(await depo('sonDosyalar')) === J([A]), await depo('sonDosyalar'));
  sonuc('Açık: kalınan sayfa yeniden yazılır', (await depo('sayfaKonumlari'))?.[A] === 2, await depo('sayfaKonumlari'));
  await sekmeleriKapat();
  await ss('baslangic-acik-koyu');

  // ---------------------------------------------------------------- eski bölüm kimlikleri, menü metni
  await ayarlarAc('dosya');
  sonuc("Eski 'dosya' kimliği Açılış ve düzen'i açar", (await seciliBolum()) === 'acilis');
  await ayarlarKapat();
  for (const [eski, yeni] of [['baslangic', 'acilis'], ['sayfa', 'acilis'], ['kopyalama', 'gorunum']]) {
    await ayarlarAc(eski);
    sonuc(`Eski '${eski}' kimliği '${yeni}' sekmesini açar`, (await seciliBolum()) === yeni, await seciliBolum());
    await ayarlarKapat();
  }
  const menuMetni = J(await evalJs(`window.pdefe.cagir('test:menu')`));
  sonuc('Uygulama menüsünde marka adı geçmiyor', !MARKA.test(menuMetni));

  console.log(hataSayisi ? `\n${hataSayisi} HATA` : '\nHepsi geçti');
  process.exitCode = hataSayisi ? 1 : 0;
}
