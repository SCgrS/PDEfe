// Senaryo 12: ayır (aralık girerek) ve görüntü/PDF birleştir (panodaki görsel + PDF dosyası).
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
const dugmeTikla = (desen) => `(() => { const w = [...document.querySelectorAll('.arac-pencere')].pop(); if (!w) return 'pencere yok'; const b = [...w.querySelectorAll('button')].find(x => ${desen}.test(x.textContent.trim())); if (!b) return 'düğme yok'; b.click(); return 'tıklandı: ' + b.textContent.trim(); })()`;

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  fs.mkdirSync(K, { recursive: true });
  if (!fs.existsSync(KOPYA)) fs.copyFileSync(D + 'fdsafsd.pdf', KOPYA);
  await evalJs(`(async () => { const p = window.__pdefe; window.__pdefeOtoYanit = { secim: 0 }; const a = p.ayar(); a.ciktiKlasoru = ${JSON.stringify(K.replace(/\//g, '\\\\'))}; document.querySelectorAll('.arac-pencere').forEach(e => e.remove()); const b = [...p.belgeler.values()].find(x => x.ad === 'arac-test.pdf') || await p.dosyaAc(${JSON.stringify(KOPYA)}); await p.sekmeSec(b.id); await new Promise(r => setTimeout(r, 800)); return true; })()`);

  // Ayır: aralık gir
  await evalJs(`window.__pdefe.komutCalistir('arac.ayir')`); await bekle(1500);
  await evalJs(`(() => { const w = document.querySelector('.arac-pencere'); const g = w.querySelector('input[type=text]'); g.value = '1-3, 4-12'; g.dispatchEvent(new Event('input', { bubbles: true })); g.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  console.log('ayır:', await evalJs(dugmeTikla('/^Ayır$/')));
  await bekle(5000);
  console.log('  çıktılar:', fs.readdirSync(K).filter(f => f.startsWith('Ayrılmış')), '| pencere:', await evalJs(`document.querySelector('.arac-pencere')?.textContent.replace(/\\s+/g, ' ').slice(-220)`));
  await ekranGoruntusu('test/png/s12-01-ayir-sonuc.png');
  await evalJs(`document.querySelectorAll('.arac-pencere').forEach(e => e.remove())`);

  // Birleştir: panodaki görsel + PDF (dosya diyaloğu yerine sürükle-bırak taklidi zor; Panodan ekle ile görsel, ardından pencereye PDF'yi 'dosyalar' arayüzü varsa ekle)
  const panoPng = panoGorseliUret(K + '/pano-gorseli.png');
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'pano:icerik', [{ tur: 'gorsel', dosya: ${JSON.stringify(panoPng)} }])`);
  await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir')`); await bekle(1200);
  console.log('panodan ekle:', await evalJs(dugmeTikla('/Panodan ekle/')));
  await bekle(4000);
  console.log('kartlar:', await evalJs(`(() => { const w = document.querySelector('.arac-pencere'); return { kart: w.querySelectorAll('[class*=kart]').length, metin: w.textContent.replace(/\\s+/g, ' ').slice(0, 360) }; })()`));
  // Gezgin'den kopyalanmış dosya taklidi: panoda dosya listesi (test kuyruğu; gerçek panoya yazılmaz) ve yeniden Panodan ekle
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'pano:icerik', [{ tur: 'dosyalar', dosyalar: [${JSON.stringify(path.resolve(KOPYA))}] }])`);
  console.log('panodan ekle (dosya):', await evalJs(dugmeTikla('/Panodan ekle/')));
  await bekle(4000);
  console.log('kartlar:', await evalJs(`(() => { const w = document.querySelector('.arac-pencere'); return { kart: w.querySelectorAll('[class*=kart]').length, toplam: w.querySelector('.toplam')?.textContent }; })()`));
  await ekranGoruntusu('test/png/s12-02-gorsel-birlestir.png');
  console.log('birleştir:', await evalJs(dugmeTikla('/^Birleştir$/')));
  await bekle(8000);
  console.log('  sekmeler:', await evalJs(`window.__pdefe.sekmeler.sekmeler.map(s => s.ad)`), 'çıktılar:', fs.readdirSync(K).filter(f => /birleşik/i.test(f)));
  const cikti = fs.readdirSync(K).find(f => /birleşik/i.test(f));
  if (cikti) console.log(execFileSync(PY, ['-c', `import pymupdf,sys; sys.stdout.reconfigure(encoding='utf-8'); d=pymupdf.open(r'${K}/${cikti}'); print('birlesik: sayfa', d.page_count, 'ilk sayfa görsel:', len(d[0].get_images()), 'boyut', d[0].rect)`], { encoding: 'utf8' }));
  await evalJs(`document.querySelectorAll('.arac-pencere').forEach(e => e.remove())`);
  console.log('pano görüntüsü kopyası silindi:', panoKopyalariniSil());
  console.log('bitti');
}
