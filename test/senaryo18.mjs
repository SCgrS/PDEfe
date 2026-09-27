// Senaryo 18 (0.1.12): çekirdeğin belge önbelleği araç kapanınca bırakılır. Araç penceresinin okuttuğu dosya (Görüntü / PDF birleştir
// listesi, Sayfaları düzenle'de PDF'ten sayfa ekle) araç açıkken çekirdekte açıktır (Windows'ta adı değiştirilemez); son araç penceresi
// kapanınca bırakılır. Açık bir sekmenin dosyası bırakılmaz; sekme kapanınca bırakılır. Dosyanın açık olup olmadığı adını değiştirmeyi
// deneyerek ölçülür (değiştirilebildiyse geri alınır).
// Kullanım: boş veri klasörlü test örneği (baslat.ps1) açıkken  $env:PDEFE_CDP_PORT=9381; node test/surucu.mjs betik test/senaryo18.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Her çalıştırma kendi klasöründe (önceki çalıştırmanın dosyası bir test örneğinde açık kalmış olabilir)
const K = path.join(KOK, 'test', 'cikti', 's18', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const J = (x) => JSON.stringify(x);

let hataSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

/** Dosya çekirdekte açık mı: adı değiştirilemiyorsa açıktır (değiştirilebildiyse eski adına döndürülür). */
function acikMi(yol) {
  const gecici = yol + '.yeniad';
  try { fs.renameSync(yol, gecici); } catch { return true; }
  fs.renameSync(gecici, yol);
  return false;
}

export default async function ({ evalJs, bekle, tus }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
  const ac = (yol) => evalJs(`window.__pdefe.dosyaAc(${J(yol)}).then(() => new Promise((r) => setTimeout(() => r(true), 800)))`);
  const kapat = (ad) => evalJs(`(async () => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.ad === ${J(ad)}); if (b) await window.__pdefe.belgeKapat(b.id, { zorla: true }); await new Promise((r) => setTimeout(r, 600)); return true; })()`);
  const aracKapat = async () => {
    // Kaydedilmemiş iş sorusu (Kaydet | Kaydetme | Vazgeç): Kaydetme
    await evalJs(`(window.__pdefeOtoYanit = { secim: 1 }, true)`);
    await tus('Escape');
    await kosul(`!document.querySelector('.arac-ortusu')`, 5000);
    await evalJs(`(delete window.__pdefeOtoYanit, true)`);
    await bekle(800);   // belge_birak çekirdekte sırasını bekler
  };

  fs.mkdirSync(K, { recursive: true });
  const kaynak = fs.readdirSync(path.join(KOK, 'test', 'pdf')).filter((a) => /\.pdf$/i.test(a)).map((a) => path.join(KOK, 'test', 'pdf', a))
    .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size)[0];
  if (!kaynak) throw new Error('test/pdf altında PDF yok');
  const A = path.join(K, 'sekme.pdf'), X = path.join(K, 'liste.pdf'), Y = path.join(K, 'eklenen.pdf');
  for (const y of [A, X, Y]) fs.copyFileSync(kaynak, y);
  await tus('Escape');
  await evalJs(`(async () => { document.querySelectorAll('.arac-ortusu').forEach((e) => e.remove()); for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  await evalJs(`(() => { window.__s18Hatalar = []; addEventListener('error', (e) => window.__s18Hatalar.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__s18Hatalar.push(String(e.reason?.message || e.reason))); return true; })()`);
  await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'ciktiKlasoru', ${J(K)}); window.__pdefe.ayar().ciktiKlasoru = ${J(K)}; return true; })()`);

  // ---------------------------------------------------------------- Görüntü / PDF birleştir: liste dosyası
  await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir', [${J(X)}])`);
  await kosul(`document.querySelectorAll('.birlestir-oge').length === 1 && !document.querySelector('.birlestir-oge.yukleniyor')`);
  await bekle(500);
  sonuc('Birleştir açıkken listedeki dosya çekirdekte açık (kök neden)', acikMi(X));
  await aracKapat();
  sonuc('Birleştir kapanınca listedeki dosya bırakılır (adı değiştirilebilir)', !acikMi(X));

  // ---------------------------------------------------------------- sekmede açık dosya araç kapanınca bırakılmaz, sekme kapanınca bırakılır
  await ac(A);
  await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir', [${J(A)}])`);
  await kosul(`document.querySelectorAll('.birlestir-oge').length === 1 && !document.querySelector('.birlestir-oge.yukleniyor')`);
  await bekle(500);
  await aracKapat();
  sonuc('Sekmede açık dosya araç kapanınca bırakılmaz (sekme kullanıyor)', acikMi(A));
  await kapat('sekme.pdf');
  sonuc('Sekme kapanınca dosyası bırakılır', !acikMi(A));

  // ---------------------------------------------------------------- Sayfaları düzenle: PDF'ten sayfa ekle
  await ac(A);
  await evalJs(`window.__pdefe.komutCalistir('arac.sayfalar')`);
  await kosul(`document.querySelectorAll('.sayfa-karti').length > 0`);
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:acDiyalog', [[${J(Y)}]])`);
  const once = await evalJs(`document.querySelectorAll('.sayfa-karti').length`);
  await evalJs(`document.querySelector('.sayfalar-arac-cubugu [data-komut="pdfEkle"]').click()`);
  await kosul(`document.querySelectorAll('.sayfa-karti').length > ${once}`);
  await bekle(1500);   // eklenen sayfaların küçük resimleri
  sonuc('Sayfaları düzenle: PDF\'ten eklenen dosya araç açıkken çekirdekte açık', acikMi(Y));
  await aracKapat();
  sonuc('Sayfaları düzenle kapanınca (Kaydetme) eklenen dosya bırakılır', !acikMi(Y));
  sonuc('Sekmenin kendi dosyası açık kalır', acikMi(A));

  // ---------------------------------------------------------------- iki araç penceresi yok; ikinci araçta aynı dosya yeniden okunur
  await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir', [${J(X)}])`);
  const yeniden = await kosul(`document.querySelectorAll('.birlestir-oge').length === 1 && !document.querySelector('.birlestir-oge.yukleniyor') && document.querySelector('.birlestir-oge .hata')?.hidden === true && !!document.querySelector('.birlestir-oge img, .birlestir-oge canvas')`);
  sonuc('Bırakılan dosya yeniden eklenince okunur (önbellek yeniden açar)', !!yeniden);
  await aracKapat();
  sonuc('İkinci kapanışta da bırakılır', !acikMi(X));

  const hatalar = await evalJs(`JSON.stringify(window.__s18Hatalar || [])`);
  sonuc('Konsolda hata yok', hatalar === '[]', hatalar);
  await kapat('sekme.pdf');
  console.log(hataSayisi ? `\n${hataSayisi} HATA` : '\nHepsi geçti');
  process.exitCode = hataSayisi ? 1 : 0;
}
