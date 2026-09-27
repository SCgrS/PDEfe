// Senaryo 3: metin seçme, temiz kopyalama, arama. node test/surucu.mjs betik test/senaryo3.mjs
import fs from 'node:fs';
import { D } from './test_klasoru.mjs';
const T = 'C:/Projeler/PDEfe/test/pdf/';

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  const ac = (yol) => evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${JSON.stringify(yol)}); return b?.ad; })()`);
  console.log('aç:', await ac(D + '1.5.6098.pdf'));
  await bekle(500);
  // Sayfa 2'ye git, metin katmanı çizilsin
  await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(2)`);
  await bekle(1200);

  // Sayfa 2'nin ilk 14 satırını seç (MADDE 5 paragrafı dahil) ve kopyala
  const secildi = await evalJs(`(() => {
    const g = window.__pdefe.aktif().gorunum; const s = g.sayfalar[1];
    const spans = [...s.el.querySelectorAll('.textLayer > span')].filter(x => x.textContent.trim());
    const r = document.createRange(); r.setStart(spans[0].firstChild, 0); r.setEnd(spans[13].firstChild, spans[13].firstChild.length);
    const sec = window.getSelection(); sec.removeAllRanges(); sec.addRange(r);
    return { spanSayisi: spans.length, ilk: spans[0].textContent.slice(0, 40), son: spans[13].textContent.slice(0, 40) };
  })()`);
  console.log('seçim:', secildi);
  await evalJs(`document.execCommand('copy')`);
  await bekle(1500);
  const pano = await evalJs(`window.pdefe.cagir('pano:oku')`);
  fs.mkdirSync('test/cikti', { recursive: true });
  fs.writeFileSync('test/cikti/kopya-tbk-s2.txt', pano, 'utf8');
  console.log('--- pano (temiz) ---\n' + pano + '\n--- son ---');

  // Ham mod karşılaştırması
  const ham = await evalJs(`window.getSelection().toString()`);
  fs.writeFileSync('test/cikti/kopya-tbk-s2-ham.txt', ham, 'utf8');

  // Bozuk glifli DergiPark belgesi: başlık satırını kopyala
  console.log('aç:', await ac(T + 'dergipark_3972595_ttk_tbk.pdf'));
  await bekle(1200);
  await evalJs(`(() => {
    const g = window.__pdefe.aktif().gorunum; const s = g.sayfalar[0];
    const spans = [...s.el.querySelectorAll('.textLayer > span')].filter(x => x.textContent.trim());
    const r = document.createRange(); r.setStart(spans[0].firstChild, 0); r.setEnd(spans[5].firstChild, spans[5].firstChild.length);
    const sec = window.getSelection(); sec.removeAllRanges(); sec.addRange(r);
  })()`);
  await evalJs(`document.execCommand('copy')`);
  await bekle(1200);
  console.log('--- dergipark pano ---\n' + await evalJs(`window.pdefe.cagir('pano:oku')`) + '\n--- son ---');

  // Arama: "sözleşme" (Türkçe, büyük/küçük duyarsız) TBK'da
  await evalJs(`window.__pdefe.sekmeSec(window.__pdefe.sekmeler.sekmeler.find(s => s.ad.includes('6098')).id)`);
  await bekle(300);
  await evalJs(`window.__pdefe.komutCalistir('duzen.bul', 'SÖZLEŞME')`);
  await bekle(4000);
  console.log('arama SÖZLEŞME:', await evalJs(`({ sayac: document.querySelector('#bul-sayac').textContent, sonuc: window.__pdefe.arama.sonuclar.length, gecerli: window.__pdefe.arama.gecerli, sayfa: window.__pdefe.aktif().gorunum.gecerli, vurgu: document.querySelectorAll('.textLayer .highlight').length })`));
  await ekranGoruntusu('test/png/s3-01-arama.png');
  await evalJs(`window.__pdefe.arama.git(1); window.__pdefe.arama.git(1)`);
  await bekle(800);
  console.log('2 ileri:', await evalJs(`({ sayac: document.querySelector('#bul-sayac').textContent, sayfa: window.__pdefe.aktif().gorunum.gecerli, secili: document.querySelector('.highlight.selected')?.textContent })`));
  // Tam sözcük + "ıslah" → I/ı testi: "Islah" büyük I ile ara
  await evalJs(`(() => { const a = window.__pdefe.arama; a.ayar.tamSozcuk = true; a.ara('MADDE 12', true); })()`);
  await bekle(3000);
  console.log('tam sözcük "MADDE 12":', await evalJs(`({ sayac: document.querySelector('#bul-sayac').textContent, sayfa: window.__pdefe.aktif().gorunum.gecerli })`));
  await ekranGoruntusu('test/png/s3-02-arama-madde12.png');
  // Bozuk glif araması: dergipark'ta "İstanbul" (belgede Ġstanbul yazıyor)
  await evalJs(`(() => { const a = window.__pdefe.arama; a.ayar.tamSozcuk = false; a.ayar.tumSekmeler = true; a.ara('İstanbul', true); })()`);
  await bekle(5000);
  console.log('tüm sekmelerde "İstanbul":', await evalJs(`({ sayac: document.querySelector('#bul-sayac').textContent, belgeler: [...new Set(window.__pdefe.arama.sonuclar.map(s => window.__pdefe.belgeler.get(s.belgeId).ad))] })`));
  await evalJs(`window.__pdefe.arama.kapat()`);
  console.log('bitti');
}
