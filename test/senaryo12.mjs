// Senaryo 12: ayır (aralık girerek) ve görüntü/PDF birleştir (panodaki görsel + PDF dosyası).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { D } from './test_klasoru.mjs';
const K = 'C:/Projeler/PDEfe/test/cikti/araclar-ui';
const KOPYA = K + '/arac-test.pdf';
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

  // Görüntü/PDF birleştir: panodaki görsel + PDF (dosya diyaloğu yerine sürükle-bırak taklidi zor; Panodan ekle ile görsel, ardından pencereye PDF'yi 'dosyalar' arayüzü varsa ekle)
  execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('C:\\Projeler\\PDEfe\\test\\png\\s4-04-uc-not.png'); [System.Windows.Forms.Clipboard]::SetImage($img)`]);
  await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir')`); await bekle(1200);
  console.log('panodan ekle:', await evalJs(dugmeTikla('/Panodan ekle/')));
  await bekle(4000);
  console.log('kartlar:', await evalJs(`(() => { const w = document.querySelector('.arac-pencere'); return { kart: w.querySelectorAll('[class*=kart]').length, metin: w.textContent.replace(/\\s+/g, ' ').slice(0, 360) }; })()`));
  // Gezgin'den kopyalanmış dosya taklidi: PDF'yi dosya panosuna koy ve yeniden Panodan ekle
  await evalJs(`window.pdefe.cagir('pano:dosya', ${JSON.stringify(KOPYA)})`);
  console.log('panodan ekle (dosya):', await evalJs(dugmeTikla('/Panodan ekle/')));
  await bekle(4000);
  console.log('kartlar:', await evalJs(`(() => { const w = document.querySelector('.arac-pencere'); return { kart: w.querySelectorAll('[class*=kart]').length, toplam: w.querySelector('.toplam')?.textContent }; })()`));
  await ekranGoruntusu('test/png/s12-02-gorsel-birlestir.png');
  console.log('birleştir:', await evalJs(dugmeTikla('/^Birleştir$/')));
  await bekle(8000);
  console.log('  sekmeler:', await evalJs(`window.__pdefe.sekmeler.sekmeler.map(s => s.ad)`), 'çıktılar:', fs.readdirSync(K).filter(f => /birlesik/i.test(f)));
  const py = 'C:/Projeler/PDEfe/.venv/Scripts/python.exe';
  const cikti = fs.readdirSync(K).find(f => /birlesik/i.test(f));
  if (cikti) console.log(execFileSync(py, ['-c', `import pymupdf,sys; sys.stdout.reconfigure(encoding='utf-8'); d=pymupdf.open(r'${K}/${cikti}'); print('birlesik: sayfa', d.page_count, 'ilk sayfa görsel:', len(d[0].get_images()), 'boyut', d[0].rect)`], { encoding: 'utf8' }));
  await evalJs(`document.querySelectorAll('.arac-pencere').forEach(e => e.remove())`);
  console.log('bitti');
}
