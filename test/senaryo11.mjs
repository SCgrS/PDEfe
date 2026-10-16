// Senaryo 11: araç pencereleri uçtan uca — Sıkıştır (0.1.25'e dek küçült), ayır, görüntü/PDF birleştir (panodan), sayfaları düzenle (sil+Uygula), döndür ve kaydet.
// 0.2.9 denetimi: kullanıcının gerçek panosu kullanılmaz. "Panodan ekle"nin pano:icerik'i test kuyruğundan gelir (main.js: { tur: 'gorsel', dosya }
// gerçek panodaki görüntü gibi geçici PNG'ye yazılır); görüntü bu betiğin ürettiği PNG. Sonda %TEMP%\PDEfe'deki "Pano görüntüsü …png" kopyası silinir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { D } from './test_klasoru.mjs';
const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
const K = KOK + '/test/cikti/araclar-ui';
const KOPYA = K + '/arac-test.pdf';
const PY = KOK + '/.venv/Scripts/python.exe';
const BASLANGIC = Date.now();
/** Panodaki görüntünün yerine: betiğin ürettiği PNG (Pillow; gerçek belge yok). */
function panoGorseliUret(yol) {
  execFileSync(PY, ['-I', '-c', 'import sys; from PIL import Image, ImageDraw; im = Image.new("RGB", (640, 420), (245, 245, 240)); '
    + 'd = ImageDraw.Draw(im); d.rectangle((40, 40, 600, 380), outline=(30, 60, 160), width=6); d.text((70, 70), "Pano sinamasi", fill=(20, 20, 20)); '
    + 'im.save(sys.argv[1])', yol]);
  return path.resolve(yol);
}
/** Bu koşuda %TEMP%\PDEfe'ye yazılan "Pano görüntüsü …png" kopyaları silinir (main.js panoGorseliniYaz). */
function panoKopyalariniSil() {
  const k = path.join(os.tmpdir(), 'PDEfe');
  let n = 0;
  for (const ad of (fs.existsSync(k) ? fs.readdirSync(k) : [])) {
    if (!/^Pano görüntüsü .*\.png$/i.test(ad)) continue;
    const y = path.join(k, ad);
    try { if (fs.statSync(y).mtimeMs >= BASLANGIC - 2000) { fs.rmSync(y, { force: true }); n++; } } catch { /* yok say */ }
  }
  return n;
}

const dugmeTikla = (desen) => `(() => { const w = [...document.querySelectorAll('.arac-pencere')].pop(); if (!w) return 'pencere yok'; const b = [...w.querySelectorAll('button')].find(x => ${desen}.test(x.textContent.trim())); if (!b) return 'düğme yok: ' + [...w.querySelectorAll('button')].map(x => x.textContent.trim()).filter(Boolean).join('|'); b.click(); return 'tıklandı: ' + b.textContent.trim(); })()`;

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  fs.rmSync(K, { recursive: true, force: true }); fs.mkdirSync(K, { recursive: true });
  fs.copyFileSync(D + 'fdsafsd.pdf', KOPYA);
  await evalJs(`(async () => { const p = window.__pdefe; window.__pdefeOtoYanit = { secim: 0 }; const a = p.ayar(); a.otomatikKaydet = false; a.ciktiKlasoru = ${JSON.stringify(K.replace(/\//g, '\\\\'))}; document.querySelectorAll('.arac-pencere').forEach(e => e.remove()); for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); await p.dosyaAc(${JSON.stringify(KOPYA)}); await new Promise(r => setTimeout(r, 1000)); return true; })()`);
  const sekmeler = () => evalJs(`window.__pdefe.sekmeler.sekmeler.map(s => s.ad)`);

  // 1) Küçült (varsayılan seviye: İdeal sıkıştırma; "Özel" kartı olmamalı) → yeni sekme
  await evalJs(`window.__pdefe.komutCalistir('arac.kucult')`); await bekle(4000);
  console.log('küçült kartları:', await evalJs(`[...document.querySelectorAll('.arac-pencere .kucult-kart')].map(k => (k.classList.contains('secili') ? '*' : '') + (k.querySelector('.ad')?.textContent || k.dataset.seviye))`));
  console.log('sıkıştır:', await evalJs(dugmeTikla('/^Sıkıştır$/')));
  await bekle(8000);
  console.log('  sekmeler:', await sekmeler(), 'çıktılar:', fs.readdirSync(K));
  // Açık kalan araç pencerelerini X ile kapat (Kapat düğmesi yok; yalnızca DOM'dan silmek pencere kaydını bırakır, aynı araç yeniden açılmaz)
  const pencereleriKapat = () => evalJs(`(async () => { for (const w of [...document.querySelectorAll('.arac-pencere')]) w.querySelector('.arac-kapat')?.click(); await new Promise(r => setTimeout(r, 300)); document.querySelectorAll('.arac-pencere').forEach(e => e.remove()); return true; })()`);
  await pencereleriKapat();

  // 1b) Küçült "Üzerine yaz" (standart kaydetme seçimi): yedek alınmaz, dosya doğrudan (geçici dosya + atomik yer değiştirme) güncellenir
  const ozgunBoyut = fs.statSync(KOPYA).size;
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find(x => x.ad === 'arac-test.pdf'); await p.sekmeSec(b.id); window.__pdefeOtoYanit = { secim: 0, son: null }; p.komutCalistir('arac.kucult'); return true; })()`); await bekle(4000);
  console.log('üzerine yaz seçimi:', await evalJs(`(() => { const w = [...document.querySelectorAll('.arac-pencere')].pop(); const d = w?.querySelector('.arac-kayit-secim button[data-id="uzerine"]'); if (!d) return 'seçim yok'; d.click(); return w.querySelector('.arac-kayit-uzerine').textContent.trim(); })()`));
  console.log('sıkıştır (üzerine yaz):', await evalJs(dugmeTikla('/^Sıkıştır$/')));
  await bekle(9000);
  const yedekler = fs.readdirSync(K).filter(f => /\(yedek|pdefe-tmp/i.test(f));
  console.log('  üzerine yazma:', { yedekVeGeciciDosyalar: yedekler, beklenen: [], ozgunBoyut, yeniBoyut: fs.statSync(KOPYA).size }, '| sekmeler:', await sekmeler());
  await ekranGoruntusu('test/png/s11-01b-kucult-uzerine-yaz.png');
  await pencereleriKapat();
  await evalJs(`(() => { window.__pdefeOtoYanit = { secim: 0 }; return true; })()`);

  // 2) Ayır: her sayfayı ayrı dosyaya (0.1.25: "her N sayfada bir" kaldırıldı) → çıktı klasörüne
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find(x => x.ad === 'arac-test.pdf'); await p.sekmeSec(b.id); p.komutCalistir('arac.ayir'); })()`); await bekle(2000);
  console.log('ayır pencere metni:', await evalJs(`document.querySelector('.arac-pencere')?.textContent.replace(/\\s+/g, ' ').slice(0, 260)`));
  await evalJs(`document.querySelector('.arac-pencere input[name="ayir-mod"][value="herSayfa"]')?.click()`);
  console.log('ayır:', await evalJs(dugmeTikla('/^Ayır$/')));
  await bekle(6000);
  console.log('  çıktılar:', fs.readdirSync(K), 'pencere metni:', await evalJs(`document.querySelector('.arac-pencere')?.textContent.replace(/\\s+/g, ' ').slice(0, 200)`));
  await ekranGoruntusu('test/png/s11-02-ayir.png');
  await evalJs(`document.querySelectorAll('.arac-pencere').forEach(e => e.remove())`);

  // 3) Birleştir: panodaki görsel + geçerli PDF
  const panoPng = panoGorseliUret(K + '/pano-gorseli.png');
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'pano:icerik', [{ tur: 'gorsel', dosya: ${JSON.stringify(panoPng)} }])`);
  await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir')`); await bekle(1500);
  console.log('panodan ekle:', await evalJs(dugmeTikla('/Panodan ekle/')));
  await bekle(3000);
  console.log('dosya ekle (aktif PDF):', await evalJs(`(async () => { const w = document.querySelector('.arac-pencere'); const kart = w.querySelectorAll('.birlestir-kart, .kart, [class*=kart]').length; return { kartSayisi: kart, metin: w.textContent.replace(/\\s+/g, ' ').slice(0, 300) }; })()`));
  await ekranGoruntusu('test/png/s11-03-gorsel-birlestir.png');
  console.log('birleştir:', await evalJs(dugmeTikla('/^Birleştir$/')));
  await bekle(7000);
  console.log('  sekmeler:', await sekmeler(), 'çıktılar:', fs.readdirSync(K));
  await evalJs(`document.querySelectorAll('.arac-pencere').forEach(e => e.remove())`);

  // 4) Sayfaları düzenle: ilk kartı seç, sil, Uygula
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find(x => x.ad === 'arac-test.pdf'); await p.sekmeSec(b.id); p.komutCalistir('arac.sayfalar'); })()`); await bekle(3000);
  console.log('kart sil:', await evalJs(`(() => { const w = document.querySelector('.arac-pencere'); const kart = w.querySelector('[data-kimlik], .kart, .sayfa-kart'); if (!kart) return 'kart yok'; kart.click(); const sil = [...w.querySelectorAll('button')].find(b => /Seçilenleri sil/.test(b.title || b.textContent)); sil?.click(); return 'silindi: ' + !!sil; })()`));
  await bekle(500);
  console.log('uygula:', await evalJs(dugmeTikla('/^Uygula$/')));
  await bekle(2500);
  console.log('  sayfa sayısı:', await evalJs(`({ sayfa: window.__pdefe.aktif().gorunum.sayfaSayisi, kirli: window.__pdefe.aktif().gorunum.yapisalKirli(), geriAl: document.querySelector('#dugme-geri-al').title })`));

  // 5) Döndür (tüm sayfalar 90°, "Üzerine yaz") → döndürme sekmeye geri alınabilir komut olarak uygulanır ve belge (sayfa silmeyle birlikte) kaydedilir
  await evalJs(`window.__pdefe.komutCalistir('arac.dondurKaydet')`); await bekle(1500);
  await evalJs(`[...document.querySelectorAll('.arac-pencere')].pop()?.querySelector('.arac-kayit-secim button[data-id="uzerine"]')?.click()`);
  console.log('döndür:', await evalJs(dugmeTikla('/^Döndür$/')));
  await bekle(6000);
  console.log('  durum:', await evalJs(`({ dondurme: window.__pdefe.aktif().gorunum.sayfalar[0].dondurme, degisti: window.__pdefe.aktif().degisti, sayfa: window.__pdefe.aktif().gorunum.sayfaSayisi, geriAl: document.querySelector('#dugme-geri-al').title })`));
  console.log(execFileSync(PY, ['-c', `import pymupdf,sys; sys.stdout.reconfigure(encoding='utf-8'); d=pymupdf.open(r'${KOPYA}'); print('dosya: sayfa', d.page_count, 'rot', [p.rotation for p in d][:5])`], { encoding: 'utf8' }));
  await ekranGoruntusu('test/png/s11-05-son.png');
  console.log('pano görüntüsü kopyası silindi:', panoKopyalariniSil());
  console.log('bitti');
}
