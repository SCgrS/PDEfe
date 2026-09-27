// Senaryo 7: ayarlar penceresi ve yazdırma seçenekleri diyaloğu (yazdırma başlatılmaz).
const D = 'C:/Users/Kullanici/Desktop/PDF DENEME/';

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  await evalJs(`(() => { window.__pdefeOtoYanit = { secim: 1 }; return true; })()`);
  console.log('aç:', await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${JSON.stringify(D + '2099_83_EK-1_pdf.pdf')}); await new Promise(r => setTimeout(r, 1000)); return b.ad; })()`));
  // Ayarlar
  await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar')`);
  await bekle(1200);
  console.log('ayarlar:', await evalJs(`({ acik: !!document.querySelector('.ayarlar-pencere'), bolumler: [...document.querySelectorAll('.ayarlar-bolumler button')].map(b => b.textContent.trim()) })`));
  await ekranGoruntusu('test/png/s7-01-ayarlar.png');
  // Not ve vurgu bölümü (0.1.11'e dek "Notlar"), sonra Hakkında
  await evalJs(`[...document.querySelectorAll('.ayarlar-bolumler button')].find(b => b.dataset.bolum === 'notlar')?.click()`);
  await bekle(500);
  await ekranGoruntusu('test/png/s7-02-ayarlar-notlar.png');
  await evalJs(`[...document.querySelectorAll('.ayarlar-bolumler button')].find(b => b.textContent.includes('Hakkında'))?.click()`);
  await bekle(1200);
  console.log('hakkında metni:', await evalJs(`document.querySelector('.ayarlar-icerik')?.textContent.replace(/\\s+/g, ' ').slice(0, 300)`));
  await ekranGoruntusu('test/png/s7-03-hakkinda.png');
  // Tema değiştir (Görünüm) ve canlı uygulanmasını gör
  await evalJs(`[...document.querySelectorAll('.ayarlar-bolumler button')].find(b => b.textContent.includes('Görünüm'))?.click()`);
  await bekle(300);
  console.log('tema kontrolleri:', await evalJs(`[...document.querySelectorAll('.ayarlar-icerik input, .ayarlar-icerik select, .ayarlar-icerik button')].map(e => (e.name || e.id || e.dataset.anahtar || e.dataset.ayar || e.textContent.trim()).slice(0, 30)).slice(0, 12)`));
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await bekle(300);
  console.log('esc sonrası açık mı:', await evalJs(`!!document.querySelector('.ayarlar-pencere')`));
  // Yazdırma seçenekleri diyaloğu
  await evalJs(`window.__pdefe.komutCalistir('dosya.yazdir')`);
  await bekle(1000);
  console.log('yazdır diyaloğu:', await evalJs(`({ diyalog: [...document.querySelectorAll('.diyalog, .yazdir-pencere, [role=dialog]')].map(d => d.className).slice(0, 4), metin: document.body.textContent.includes('Sayfaya sığdır') })`));
  await ekranGoruntusu('test/png/s7-04-yazdir.png');
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await bekle(300);
  console.log('bitti');
}
