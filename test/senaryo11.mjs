// Senaryo 11: araç pencereleri uçtan uca — küçült, ayır, PDF birleştir, görüntü/PDF birleştir (panodan), sayfaları düzenle (sil+Uygula), döndür ve kaydet.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const D = 'C:/Users/Kullanici/Desktop/PDF DENEME/';
const K = 'C:/Projeler/PDEfe/test/cikti/araclar-ui';
const KOPYA = K + '/arac-test.pdf';

const dugmeTikla = (desen) => `(() => { const w = [...document.querySelectorAll('.arac-pencere')].pop(); if (!w) return 'pencere yok'; const b = [...w.querySelectorAll('button')].find(x => ${desen}.test(x.textContent.trim())); if (!b) return 'düğme yok: ' + [...w.querySelectorAll('button')].map(x => x.textContent.trim()).filter(Boolean).join('|'); b.click(); return 'tıklandı: ' + b.textContent.trim(); })()`;

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  fs.rmSync(K, { recursive: true, force: true }); fs.mkdirSync(K, { recursive: true });
  fs.copyFileSync(D + 'fdsafsd.pdf', KOPYA);
  await evalJs(`(async () => { const p = window.__pdefe; window.__pdefeOtoYanit = { secim: 0 }; const a = p.ayar(); a.otomatikKaydet = false; a.ciktiKlasoru = ${JSON.stringify(K.replace(/\//g, '\\\\'))}; document.querySelectorAll('.arac-pencere').forEach(e => e.remove()); for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); await p.dosyaAc(${JSON.stringify(KOPYA)}); await new Promise(r => setTimeout(r, 1000)); return true; })()`);
  const sekmeler = () => evalJs(`window.__pdefe.sekmeler.sekmeler.map(s => s.ad)`);

  // 1) Küçült (varsayılan seviye: İdeal sıkıştırma; "Özel" kartı olmamalı) → yeni sekme
  await evalJs(`window.__pdefe.komutCalistir('arac.kucult')`); await bekle(4000);
  console.log('küçült kartları:', await evalJs(`[...document.querySelectorAll('.arac-pencere .kucult-kart')].map(k => (k.classList.contains('secili') ? '*' : '') + (k.querySelector('.ad')?.textContent || k.dataset.seviye))`));
  console.log('küçült:', await evalJs(dugmeTikla('/^Küçült$/')));
  await bekle(8000);
  console.log('  sekmeler:', await sekmeler(), 'çıktılar:', fs.readdirSync(K));
  // Açık kalan araç pencerelerini Kapat düğmesiyle kapat (yalnızca DOM'dan silmek pencere kaydını bırakır, aynı araç yeniden açılmaz)
  const pencereleriKapat = () => evalJs(`(async () => { for (const w of [...document.querySelectorAll('.arac-pencere')]) { [...w.querySelectorAll('button')].find(x => x.textContent.trim() === 'Kapat')?.click(); } await new Promise(r => setTimeout(r, 300)); document.querySelectorAll('.arac-pencere').forEach(e => e.remove()); return true; })()`);
  await pencereleriKapat();

  // 1b) Küçült "Üzerine yaz": yedek özgün dosyanın klasörüne "<ad> (yedek).pdf" olarak alınmalı (veri klasörüne değil)
  const ozgunBoyut = fs.statSync(KOPYA).size;
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find(x => x.ad === 'arac-test.pdf'); await p.sekmeSec(b.id); window.__pdefeOtoYanit = { secim: 0, son: null }; p.komutCalistir('arac.kucult'); return true; })()`); await bekle(4000);
  console.log('üzerine yaz kutusu:', await evalJs(`(() => { const w = [...document.querySelectorAll('.arac-pencere')].pop(); const k = w?.querySelector('.kucult-uzerine'); if (!k) return 'kutu yok'; k.checked = true; k.dispatchEvent(new Event('change', { bubbles: true })); return { etiket: k.parentElement.textContent.trim(), cikti: w.querySelector('.kucult-cikti-yol')?.textContent }; })()`));
  console.log('küçült (üzerine yaz):', await evalJs(dugmeTikla('/^Küçült$/')));
  await bekle(9000);
  const yedekler = fs.readdirSync(K).filter(f => /\(yedek/i.test(f));
  console.log('  yedek:', { yedekler, beklenen: 'arac-test (yedek).pdf', ozgunBoyut, yedekBoyut: yedekler[0] ? fs.statSync(K + '/' + yedekler[0]).size : null, yeniBoyut: fs.statSync(KOPYA).size },
    '| soru:', await evalJs(`window.__pdefeOtoYanit.son?.ayrinti?.replace(/\\s+/g, ' ').slice(0, 200)`), '| sekmeler:', await sekmeler());
  await ekranGoruntusu('test/png/s11-01b-kucult-uzerine-yaz.png');
  await pencereleriKapat();
  await evalJs(`(() => { window.__pdefeOtoYanit = { secim: 0 }; return true; })()`);

  // 2) Ayır: her N sayfada bir (varsayılan mod ne ise) → çıktı klasörüne
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find(x => x.ad === 'arac-test.pdf'); await p.sekmeSec(b.id); p.komutCalistir('arac.ayir'); })()`); await bekle(2000);
  console.log('ayır pencere metni:', await evalJs(`document.querySelector('.arac-pencere')?.textContent.replace(/\\s+/g, ' ').slice(0, 260)`));
  await evalJs(`(() => { const w = document.querySelector('.arac-pencere'); const r = [...w.querySelectorAll('input[type=radio]')]; const herN = r.find(x => /herN|her/i.test(x.value + x.parentElement.textContent)); if (herN) { herN.click(); } const n = w.querySelector('input[type=number]'); if (n) { n.value = 5; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  console.log('ayır:', await evalJs(dugmeTikla('/^Ayır$/')));
  await bekle(6000);
  console.log('  çıktılar:', fs.readdirSync(K), 'pencere metni:', await evalJs(`document.querySelector('.arac-pencere')?.textContent.replace(/\\s+/g, ' ').slice(0, 200)`));
  await ekranGoruntusu('test/png/s11-02-ayir.png');
  await evalJs(`document.querySelectorAll('.arac-pencere').forEach(e => e.remove())`);

  // 3) Görüntü/PDF birleştir: panodaki görsel + geçerli PDF
  execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('C:\\Projeler\\PDEfe\\test\\png\\s4-04-uc-not.png'); [System.Windows.Forms.Clipboard]::SetImage($img)`]);
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

  // 5) Döndür ve kaydet (tüm sayfalar 90°) → dosyaya yazılmalı
  await evalJs(`window.__pdefe.komutCalistir('arac.dondurKaydet')`); await bekle(1500);
  console.log('döndür:', await evalJs(dugmeTikla('/^Döndür ve kaydet$/')));
  await bekle(6000);
  console.log('  durum:', await evalJs(`({ dondurme: window.__pdefe.aktif().gorunum.sayfalar[0].dondurme, degisti: window.__pdefe.aktif().degisti, sayfa: window.__pdefe.aktif().gorunum.sayfaSayisi })`));
  const py = 'C:/Projeler/PDEfe/.venv/Scripts/python.exe';
  console.log(execFileSync(py, ['-c', `import pymupdf,sys; sys.stdout.reconfigure(encoding='utf-8'); d=pymupdf.open(r'${KOPYA}'); print('dosya: sayfa', d.page_count, 'rot', [p.rotation for p in d][:5])`], { encoding: 'utf8' }));
  await ekranGoruntusu('test/png/s11-05-son.png');
  console.log('bitti');
}
