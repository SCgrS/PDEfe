// Yazdırma modülünün saf işlevlerini Node'da sınar: sayfaAraligiCoz ve yazdirmaHtmlOlustur.
// Kullanım: node test/yazdir_html_testi.mjs <goruntuler.json> <cikti.html> [sigdir|gercek]
import fs from 'node:fs';
import { sayfaAraligiCoz, yazdirmaHtmlOlustur } from '../src/renderer/yazdir.js';

let hata = 0;
const esit = (ad, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) hata++; console.log((ok ? 'OK  ' : 'HATA') + ' ' + ad + (ok ? '' : ` → ${JSON.stringify(a)} beklenen ${JSON.stringify(b)}`)); };

// ---- sayfa aralığı
esit('tek sayfa', sayfaAraligiCoz('3', 10), { sayfalar: [3] });
esit('aralık ve tek', sayfaAraligiCoz('1-3,5', 10), { sayfalar: [1, 2, 3, 5] });
esit('boşluk ve tekrar', sayfaAraligiCoz(' 5, 1 - 3 ,3', 10), { sayfalar: [1, 2, 3, 5] });
esit('açık uçlu', sayfaAraligiCoz('8-', 10), { sayfalar: [8, 9, 10] });
esit('baştan', sayfaAraligiCoz('-2', 10), { sayfalar: [1, 2] });
esit('ters aralık', sayfaAraligiCoz('4-2', 10), { sayfalar: [2, 3, 4] });
esit('uzun tire', sayfaAraligiCoz('1–2', 10), { sayfalar: [1, 2] });
esit('boş', !!sayfaAraligiCoz('', 10).hata, true);
esit('sıfır', !!sayfaAraligiCoz('0', 10).hata, true);
esit('aşan', !!sayfaAraligiCoz('11', 10).hata, true);
esit('harf', !!sayfaAraligiCoz('1a', 10).hata, true);
esit('tek tire', !!sayfaAraligiCoz('-', 10).hata, true);

// ---- HTML
const [girdi, cikti, mod = 'sigdir'] = process.argv.slice(2);
if (girdi) {
  const sayfalar = JSON.parse(fs.readFileSync(girdi, 'utf8'));
  const { html, sayfaBoyutu, kagit } = yazdirmaHtmlOlustur(sayfalar, { olcek: mod, baslik: 'Deneme' });
  fs.writeFileSync(cikti, html, 'utf8');
  console.log('kağıt:', kagit, 'mikron:', sayfaBoyutu, 'HTML:', (html.length / 1024 / 1024).toFixed(1), 'MB →', cikti);
  const donenler = (html.match(/class="don"/g) || []).length;
  console.log('sayfa div sayısı:', (html.match(/class="sayfa"/g) || []).length, 'döndürülen (yatay):', donenler);
}
// Boş liste hata vermeli
try { yazdirmaHtmlOlustur([], {}); esit('boş liste hata', false, true); } catch { esit('boş liste hata', true, true); }
// Karışık boyut: en sık görülen kâğıt seçilmeli
const karisik = [{ no: 1, veri: 'x', genislikPt: 595.3, yukseklikPt: 841.9 }, { no: 2, veri: 'x', genislikPt: 841.9, yukseklikPt: 595.3 }, { no: 3, veri: 'x', genislikPt: 612, yukseklikPt: 792 }];
const k = yazdirmaHtmlOlustur(karisik, { olcek: 'sigdir' });
esit('karışık: A4 seçildi', k.kagit.ad, 'A4');
esit('karışık: mikron', k.sayfaBoyutu, { genislikMikron: 210000, yukseklikMikron: 297000 });
esit('karışık: yatay döndürüldü', (k.html.match(/class="don"/g) || []).length, 1);

console.log(hata ? `${hata} HATA` : 'BÜTÜN TESTLER GEÇTİ');
process.exit(hata ? 1 : 0);
