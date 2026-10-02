// Senaryo 8: araç pencereleri açılıyor mu (PDF Sıkıştırma, sayfaları düzenle, ayır, görüntü/PDF birleştir, döndür), güncelleme denetimi.
import { D } from './test_klasoru.mjs';

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  await evalJs(`(() => { window.__pdefeOtoYanit = { secim: 1 }; return true; })()`);
  console.log('aç:', await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${JSON.stringify(D + 'fdsafsd.pdf')}); await new Promise(r => setTimeout(r, 1000)); return b.ad; })()`));
  const pencereTest = async (komut, ad, sure = 2500) => {
    await evalJs(`window.__pdefe.komutCalistir(${JSON.stringify(komut)})`);
    await bekle(sure);
    const durum = await evalJs(`({ pencere: !!document.querySelector('.arac-pencere'), baslik: document.querySelector('.arac-pencere .baslik, .arac-pencere h2, .arac-pencere .arac-baslik')?.textContent.trim().slice(0, 60), metin: document.querySelector('.arac-pencere')?.textContent.replace(/\\s+/g, ' ').slice(0, 220) })`);
    console.log(komut, '→', durum);
    await ekranGoruntusu(`test/png/s8-${ad}.png`);
    await evalJs(`(() => { const p = document.querySelector('.arac-pencere'); if (!p) return; const btn = [...p.querySelectorAll('button')].find(b => /vazgeç|kapat|iptal/i.test(b.textContent)); if (btn) btn.click(); else p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
    await bekle(400);
    console.log('  kapandı mı:', await evalJs(`!document.querySelector('.arac-pencere')`));
  };
  await pencereTest('arac.kucult', '01-kucult', 4000);
  await pencereTest('arac.sayfalar', '02-sayfalar', 3500);
  await pencereTest('arac.ayir', '03-ayir');
  await pencereTest('arac.gorselBirlestir', '04-gorsel-birlestir');
  await pencereTest('arac.dondurKaydet', '05-dondur');
  console.log('güncelleme denetimi (geliştirme):', await evalJs(`window.pdefe.cagir('guncelleme:denetle')`));
  console.log('bitti');
}
