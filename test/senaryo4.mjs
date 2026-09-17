// Senaryo 4: notlar — referans okuyucu notlarını gösterme, vurgu/yapışkan not/yazı ekleme, geri al/yinele, kaydetme.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const D = 'C:/Users/Kullanici/Desktop/PDF DENEME/';
const KOPYA = 'C:/Projeler/PDEfe/test/cikti/deneme-notlu.pdf';

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  fs.mkdirSync('test/cikti', { recursive: true });
  fs.copyFileSync(D + 'DENEME PDF (2).pdf', KOPYA);
  await evalJs(`(() => { const a = window.__pdefe.ayar(); a.otomatikKaydet = false; return true; })()`);
  // Diğer sekmeleri kapat, kopyayı aç
  await evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); return p.sekmeler.sekmeler.length; })()`);
  // dataSayfa: ilk yüklemede her .sayfa elemanında data-sayfa olmalı (yoksa vurgu, yapışkan not ve yazı aracı NaN sayfaya düşer)
  console.log('aç:', await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${JSON.stringify(KOPYA)}); await new Promise(r => setTimeout(r, 1500)); return { ad: b.ad, notSayisi: b.notlar.notlar.size, cizili: b.gorunum.sayfalar.filter(s => s.canvas).length, svgGrup: document.querySelectorAll('.not-isaretler g').length, dataSayfa: b.gorunum.sayfalar.every((s, i) => s.el.dataset.sayfa === String(i + 1)) }; })()`));
  await ekranGoruntusu('test/png/s4-01-dis-notlar.png');

  // Referans okuyucu vurgusunun balonunu aç
  await evalJs(`(() => { const b = window.__pdefe.aktif(); const n = b.notlar.liste()[0]; b.notlar.notaGit(n.id); return n.icerik; })()`);
  await bekle(800);
  console.log('balon:', await evalJs(`({ var: !!document.querySelector('.not-balonu'), metin: document.querySelector('.not-balonu textarea')?.value, yazar: document.querySelector('.not-balonu .yazar')?.textContent })`));
  await ekranGoruntusu('test/png/s4-02-balon.png');
  await evalJs(`window.__pdefe.aktif().notlar.balonKapat()`);

  // 1) Seçimden vurgu (sayfa 1, 3. ve 4. satır)
  const vurgu = await evalJs(`(() => {
    const b = window.__pdefe.aktif(); const g = b.gorunum; const s = g.sayfalar[0];
    const spans = [...s.el.querySelectorAll('.textLayer > span')].filter(x => x.textContent.trim());
    const r = document.createRange(); r.setStart(spans[2].firstChild, 0); r.setEnd(spans[3].firstChild, spans[3].firstChild.length);
    const sec = window.getSelection(); sec.removeAllRanges(); sec.addRange(r);
    const ok = b.notlar.vurguUygula('#7cc4ff');
    const n = b.notlar.liste().find(x => x.yeni);
    return { ok, sayfa: n?.sayfa, quads: n?.quadKutular?.length, rect: n?.rect?.map(v => +v.toFixed(1)), degisti: b.degisti, geriAl: document.querySelector('#dugme-geri-al').title };
  })()`);
  console.log('vurgu:', vurgu);

  // 2) Yapışkan not: sayfa 1'de (300, 400) piksele
  console.log('yapışkan:', await evalJs(`(() => {
    const b = window.__pdefe.aktif(); const s = b.gorunum.sayfalar[0]; const k = s.el.getBoundingClientRect();
    b.notlar.yapiskanNotKoy(0, { clientX: k.left + 300, clientY: k.top + 400 });
    const ta = document.querySelector('.not-balonu textarea.icerik'); ta.value = 'PDEfe yapışkan notu: şğıİçöü'; ta.dispatchEvent(new Event('blur'));
    const n = b.notlar.liste().find(x => x.tur === 'Text' && x.yeni);
    return { icerik: n?.icerik, rect: n?.rect?.map(v => +v.toFixed(1)), balon: !!document.querySelector('.not-balonu') };
  })()`));
  // Yanıt ekle
  console.log('yanıt:', await evalJs(`(() => { const g = document.querySelector('.not-balonu .yanit-girdi'); g.value = 'Yanıt metni ğüş'; g.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); const b = window.__pdefe.aktif(); const n = b.notlar.liste().find(x => x.tur === 'Text' && x.yeni); return { yanitSayisi: b.notlar.yanitlari(n).length, balonYanit: document.querySelectorAll('.not-balonu .yanit').length }; })()`));
  await ekranGoruntusu('test/png/s4-03-yapiskan-balon.png');
  await evalJs(`window.__pdefe.aktif().notlar.balonKapat()`);

  // 3) Yazı: sayfa 1'de (80, 500) → düzenleyici → metin → bitir
  console.log('yazı:', await evalJs(`(async () => {
    const b = window.__pdefe.aktif(); const s = b.gorunum.sayfalar[0]; const k = s.el.getBoundingClientRect();
    b.notlar.aracSec('yazi');
    b.notlar.yaziBaslat(0, { clientX: k.left + 80, clientY: k.top + 500 });
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: k.left + 80, clientY: k.top + 500 }));
    await new Promise(r => setTimeout(r, 100));
    const d = b.notlar.duzenleyici; if (!d) return 'düzenleyici yok';
    d.el.value = 'PDEfe serbest metni: İğneada, Şişli, Çorum — ğüşıöç'; d.yazi.arka = '#fff59d'; d.yazi.kenarlik = true; d.yazi.boyut = 13;
    b.notlar.duzenleyiciBitir(true);
    const n = b.notlar.liste().find(x => x.tur === 'FreeText');
    return { icerik: n?.icerik, yazi: n?.yazi, rect: n?.rect?.map(v => +v.toFixed(1)), yerli: !!document.querySelector('.not-freetext-yerli') };
  })()`));
  await bekle(300);
  await ekranGoruntusu('test/png/s4-04-uc-not.png');

  // 4) Geri al / yinele
  console.log('geri al ×2:', await evalJs(`(() => { const b = window.__pdefe.aktif(); b.yigin.geriAl(); b.yigin.geriAl(); return { adet: b.notlar.liste().length, yeni: b.notlar.liste().filter(n => n.yeni).length, konum: b.yigin.konum, degisti: b.degisti, yerli: !!document.querySelector('.not-freetext-yerli') }; })()`));
  console.log('yinele ×2:', await evalJs(`(() => { const b = window.__pdefe.aktif(); b.yigin.yinele(); b.yigin.yinele(); return { adet: b.notlar.liste().length, konum: b.yigin.konum, yerli: !!document.querySelector('.not-freetext-yerli') }; })()`));

  // 5) referans okuyucu vurgusunu sil, sonra geri al
  console.log('sil+geri al:', await evalJs(`(() => { const b = window.__pdefe.aktif(); const n = b.notlar.liste()[0]; b.notlar.sec(n.id); const ok = b.notlar.silSecili(); const sonra = b.notlar.liste().length; b.yigin.geriAl(); return { ok, sonra, geriAlSonrasi: b.notlar.liste().length, fark: b.notlar.fark().map(o => o.islem + ':' + o.not.tur) }; })()`));

  // 6) Kaydet (Ctrl+S)
  console.log('kaydet:', await evalJs(`(async () => { const b = window.__pdefe.aktif(); window.__pdefe.komutCalistir('dosya.kaydet'); await new Promise(r => setTimeout(r, 2500)); return { degisti: b.degisti, boyut: b.boyut, fark: b.notlar.fark().length, kirli: b.yigin.kirli }; })()`));
  await ekranGoruntusu('test/png/s4-05-kaydedildi.png');

  // 7) Kaydettikten sonra geri al → tekrar kaydet (silme artımlı yazılmalı)
  console.log('kayıt sonrası geri al:', await evalJs(`(async () => { const b = window.__pdefe.aktif(); b.yigin.geriAl(); const f1 = b.notlar.fark().map(o => o.islem); window.__pdefe.komutCalistir('dosya.kaydet'); await new Promise(r => setTimeout(r, 2000)); return { fark1: f1, degisti: b.degisti, adet: b.notlar.liste().length }; })()`));
  console.log('yinele → kaydet:', await evalJs(`(async () => { const b = window.__pdefe.aktif(); b.yigin.yinele(); const f1 = b.notlar.fark().map(o => o.islem); window.__pdefe.komutCalistir('dosya.kaydet'); await new Promise(r => setTimeout(r, 2000)); return { fark1: f1, degisti: b.degisti, adet: b.notlar.liste().length }; })()`));

  // Doğrulama: PyMuPDF ile oku ve çiz
  const py = 'C:/Projeler/PDEfe/.venv/Scripts/python.exe';
  const out = execFileSync(py, ['-c', `
import pymupdf, sys
sys.stdout.reconfigure(encoding='utf-8')
d = pymupdf.open(r'${KOPYA}')
for a in d[0].annots():
    print(a.type[1], '|', a.info.get('title'), '|', a.info.get('content'), '| irt', a.irt_xref, '| AP', d.xref_get_key(a.xref, 'AP/N')[0])
pix = d[0].get_pixmap(dpi=90, clip=pymupdf.Rect(30, 30, 565, 700), annots=True); pix.save('test/cikti/deneme-notlu.png')
print('sayfa', d.page_count, 'boyut', __import__('os').path.getsize(r'${KOPYA}'))
`], { encoding: 'utf8' });
  console.log(out);
  console.log('bitti');
}
