// Senaryo 1: çoklu belge, büyük belge, düzenler, yakınlaştırma, panel. node test/surucu.mjs betik test/senaryo1.mjs
import { D } from './test_klasoru.mjs';
const T = 'C:/Projeler/PDEfe/test/pdf/';

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  const ac = async (yol) => evalJs(`(async () => { const t0 = performance.now(); const b = await window.__pdefe.dosyaAc(${JSON.stringify(yol)}); return { ad: b?.ad, sayfa: b?.gorunum.sayfaSayisi, ms: Math.round(performance.now() - t0) }; })()`);
  const durum = () => evalJs(`(() => { const b = window.__pdefe.aktif(); return { ad: b.ad, sayfa: b.gorunum.gecerli, olcek: +b.gorunum.olcek.toFixed(3), mod: b.gorunum.zoomModu, duzen: b.gorunum.duzen, cizili: b.gorunum.sayfalar.filter(s=>s.canvas).length, metin: b.gorunum.sayfalar.filter(s=>s.textLayer).length, gorunur: b.gorunum.gorunurSayfalar() }; })()`);
  // Düzen ve tema komutları ayarı kalıcı yazar: test sonunda eski değerler geri yazılır. otomatikKaydet yalnızca bellekte kapatılır (döndürülen büyük belge diske yazılmasın).
  const eskiAyar = await evalJs(`(() => { const a = window.__pdefe.ayar(); return { varsayilanDuzen: a.varsayilanDuzen, kapakAyri: !!a.kapakAyri, tema: a.tema, otomatikKaydet: !!a.otomatikKaydet }; })()`);
  await evalJs(`(() => { window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);

  console.log('aç DENEME PDF (2):', await ac(D + 'DENEME PDF (2).pdf'));
  console.log('aç PDF32000 (756 sayfa, 22 MB):', await ac(T + 'PDF32000_2008_yerimli.pdf'));
  console.log('aç dergipark (yer imli):', await ac(T + 'dergipark_3972595_ttk_tbk.pdf'));
  console.log('aç tekrar DENEME (aynı sekmeye geçmeli):', await ac(D + 'DENEME PDF (2).pdf'));
  console.log('sekmeler:', await evalJs('window.__pdefe.sekmeler.sekmeler.map(s=>s.ad)'));
  await bekle(500);
  await ekranGoruntusu('test/png/s1-01-deneme.png');

  // Büyük belgeye geç, sayfa 400'e git
  await evalJs(`window.__pdefe.sekmeSec(window.__pdefe.sekmeler.sekmeler[1].id)`);
  await bekle(300);
  const t0 = Date.now();
  await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(400)`);
  await bekle(600);
  console.log('sayfa 400:', await durum(), 'süre ms:', Date.now() - t0);
  await ekranGoruntusu('test/png/s1-02-buyuk-400.png');

  // Hızlı kaydırma: 40 adım
  await evalJs(`(async () => { const k = window.__pdefe.aktif().gorunum.kaydirici; for (let i = 0; i < 40; i++) { k.scrollTop += 900; await new Promise(r => setTimeout(r, 30)); } })()`);
  await bekle(800);
  console.log('kaydırma sonrası:', await durum());

  // Sol panel: içindekiler
  await evalJs(`window.__pdefe.komutCalistir('gorunum.solPanel'); window.__pdefe.panel.sekmeSec('icindekiler')`);
  await bekle(1500);
  console.log('yer imi sayısı:', await evalJs(`document.querySelectorAll('#panel-icindekiler li').length`));
  // İlk yer imine tıkla
  await evalJs(`document.querySelector('#panel-icindekiler .yerimi > li:nth-child(5) .satir')?.click()`);
  await bekle(800);
  console.log('yer imi sonrası:', await durum());
  await ekranGoruntusu('test/png/s1-03-icindekiler.png');

  // Sayfalar paneli
  await evalJs(`window.__pdefe.panel.sekmeSec('sayfalar')`);
  await bekle(2500);
  console.log('küçük resim sayısı (yüklü):', await evalJs(`document.querySelectorAll('#panel-sayfalar img').length`));
  await ekranGoruntusu('test/png/s1-04-sayfalar.png');

  // İki sayfa kaydırma düzeni + kapak ayrı
  await evalJs(`window.__pdefe.komutCalistir('gorunum.duzen', 'ikiSurekli'); window.__pdefe.komutCalistir('gorunum.zoom', 'sayfa')`);
  await bekle(1200);
  console.log('iki sayfa:', await durum());
  await ekranGoruntusu('test/png/s1-05-iki-sayfa.png');

  // Tek sayfa düzeni (kaydırma kapalı; 'tek' kaydırma durumunu koruduğundan önce kaydırma kapatılır), geçerli sayfayı döndür.
  // "Neyi döndürmek istiyorsunuz?" sorusu otomatik "Geçerli sayfa" yanıtlanır (soru dondur() içinde eşzamanlı sorulur; yanıtlayıcı hemen kaldırılır).
  const dondurme = await evalJs(`(() => { const p = window.__pdefe, b = p.aktif(); p.komutCalistir('gorunum.kaydirma'); p.komutCalistir('gorunum.duzen', 'tek');
    const konum = b.yigin.konum; window.__pdefeOtoYanit = { secim: 0, onay: false, son: null };
    try { p.komutCalistir('gorunum.dondur', 90); return { konum, soru: window.__pdefeOtoYanit.son?.mesaj || null }; } finally { delete window.__pdefeOtoYanit; } })()`);
  await bekle(1200);
  console.log('tek sayfa döndürülmüş:', await durum(), dondurme);   // beklenen: duzen='tek'
  await ekranGoruntusu('test/png/s1-06-tek-dondur.png');
  // Döndürmeyi geri al (belge değişmemiş sayılmalı), sürekli düzene dön
  console.log('döndürme geri alındı:', await evalJs(`(async () => { const p = window.__pdefe, b = p.aktif(); await b._dondurme?.catch(() => {}); const k = b.yigin.konum > ${dondurme?.konum ?? 0} ? b.yigin.geriAl() : null; p.komutCalistir('gorunum.duzen', 'surekli'); return { geriAlinan: k?.ad || null, degisti: b.degisti, yapisalKirli: b.gorunum.yapisalKirli(), duzen: b.gorunum.duzen }; })()`));   // beklenen: degisti=false

  // Aşırı yakınlaştırma (%3200) — bölgesel çizim
  await evalJs(`window.__pdefe.aktif().gorunum.zoomAyarla(32)`);
  await bekle(1500);
  console.log('%3200:', await durum(), await evalJs(`(() => { const b = window.__pdefe.aktif(); const s = b.gorunum.sayfalar.find(s=>s.canvas); return s ? { tuval: [s.canvas.width, s.canvas.height], tam: s.cizim.tam } : null; })()`));
  await ekranGoruntusu('test/png/s1-07-zoom3200.png');
  await evalJs(`window.__pdefe.komutCalistir('gorunum.zoom', 'genislik')`);

  // Ctrl+Tab seçici
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))`);
  await bekle(1200);
  await ekranGoruntusu('test/png/s1-08-ctrl-tab.png');
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))`);
  await bekle(300);
  console.log('Ctrl+Tab sonrası aktif:', await evalJs('window.__pdefe.aktif().ad'));

  // Koyu tema
  await evalJs(`window.__pdefe.komutCalistir('gorunum.tema')`);
  await bekle(600);
  await ekranGoruntusu('test/png/s1-09-koyu.png');
  await evalJs(`window.__pdefe.komutCalistir('gorunum.tema')`);

  // Ayarları geri yaz (tema 'sistem' iken iki kez değiştirmek onu 'acik'/'koyu' olarak bırakır); etkin sekmenin düzenini de eşitle
  console.log('ayarlar geri yazıldı:', await evalJs(`(async () => { const p = window.__pdefe, a = p.ayar(), eski = ${JSON.stringify(eskiAyar)};
    for (const [k, v] of Object.entries(eski || {})) { if (v === undefined || v === null) continue; a[k] = v; await window.pdefe.cagir('ayar:koy', k, v); }
    const g = p.aktif()?.gorunum, d = ['tek', 'surekli', 'iki', 'ikiSurekli'].includes(a.varsayilanDuzen) ? a.varsayilanDuzen : 'surekli';
    if (g?.belge && (g.duzen !== d || !!g.kapakAyri !== !!a.kapakAyri)) g.duzenAyarla(d, !!a.kapakAyri);
    return { varsayilanDuzen: a.varsayilanDuzen, kapakAyri: a.kapakAyri, tema: a.tema, otomatikKaydet: a.otomatikKaydet }; })()`));
  console.log('bitti');
}
