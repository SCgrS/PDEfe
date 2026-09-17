// Senaryo 6: form alanları, bağlantılar, görünür alana sığdır, üç tıkla paragraf, sekme kapatma ve sayfa konumu.
const FORM = 'C:/Projeler/PDEfe/test/cikti/form-test.pdf';
const T = 'C:/Projeler/PDEfe/test/pdf/';

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  await evalJs(`(() => { window.__pdefeOtoYanit = { secim: 1 }; return true; })()`);
  console.log('form aç:', await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${JSON.stringify(FORM)}); await new Promise(r => setTimeout(r, 1500)); const s = b.gorunum.sayfalar[0]; return { ad: b.ad, form: !!s.el.querySelector('.form-katmani'), baglanti: s.el.querySelectorAll('.baglanti').length, formYok: s.formYok }; })()`));
  await ekranGoruntusu('test/png/s6-01-form.png');
  // Bağlantıya tıkla → 2. sayfa
  console.log('bağlantı tıkla:', await evalJs(`(async () => { const b = window.__pdefe.aktif(); const a = b.gorunum.sayfalar[0].el.querySelector('.baglanti'); a.click(); await new Promise(r => setTimeout(r, 600)); return { sayfa: b.gorunum.gecerli }; })()`));

  // Büyük belge: PDF spec içindekiler bağlantıları
  console.log('spec:', await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${JSON.stringify(T + 'PDF32000_2008_yerimli.pdf')}); b.gorunum.sayfayaGit(3); await new Promise(r => setTimeout(r, 1800)); const s = b.gorunum.sayfalar[2]; return { baglanti: s.el.querySelectorAll('.baglanti').length }; })()`));
  console.log('spec bağlantı tıkla:', await evalJs(`(async () => { const b = window.__pdefe.aktif(); const a = b.gorunum.sayfalar[2].el.querySelectorAll('.baglanti')[5]; const t = a?.title; a?.click(); await new Promise(r => setTimeout(r, 800)); return { hedef: t, sayfa: b.gorunum.gecerli }; })()`));

  // Görünür alana sığdır (mevzuat, dar metin)
  console.log('görünür alana sığdır:', await evalJs(`(async () => { const p = window.__pdefe; const b = await p.dosyaAc(${JSON.stringify(T + 'mevzuat_6102_TTK.pdf')}); await new Promise(r => setTimeout(r, 1200)); const g = b.gorunum; const once = g.olcek; await g.zoomModuAyarla('gorunur'); await new Promise(r => setTimeout(r, 800)); return { once: +once.toFixed(3), sonra: +g.olcek.toFixed(3), kutu: g.sayfalar[g.gecerli - 1].icerikKutusu?.map(v => +v.toFixed(0)), scrollX: g.kaydirici.scrollLeft }; })()`));
  await ekranGoruntusu('test/png/s6-02-gorunur-sigdir.png');

  // Üç tıkla paragraf seçimi
  console.log('üç tık:', await evalJs(`(async () => { const p = window.__pdefe; const b = p.aktif(); const g = b.gorunum; g.zoomModuAyarla('genislik'); g.sayfayaGit(2); await new Promise(r => setTimeout(r, 1200)); const s = g.sayfalar[1]; const spans = [...s.el.querySelectorAll('.textLayer > span')].filter(x => x.textContent.trim()); const hedef = spans[8]; const k = hedef.getBoundingClientRect(); hedef.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail: 3, clientX: k.left + 5, clientY: k.top + 5, button: 0 })); await new Promise(r => setTimeout(r, 100)); const m = window.getSelection().toString(); return { satirSayisi: m.split('\\n').length, ilk: m.slice(0, 60) }; })()`));

  // Sekme kapatma (değişiklik yok → soru sorulmamalı) ve kalınan sayfanın sayfaKonumlari'na yazılması (açık sekmeleri hatırlama kaldırıldı)
  console.log('kapat:', await evalJs(`(async () => { const p = window.__pdefe; const b = p.aktif(); const ad = b.ad, sayfa = b.gorunum.gecerli, n0 = p.sekmeler.sekmeler.length; window.__pdefeOtoYanit = { secim: 1, son: null }; const kapandi = await p.belgeKapat(b.id); await new Promise(r => setTimeout(r, 500)); const k = (await window.pdefe.cagir('ayar:al', 'sayfaKonumlari')) || {}; const kayit = Object.entries(k).find(([y]) => y.split('/').pop().split('\\\\').pop() === ad); return { once: n0, sonra: p.sekmeler.sekmeler.length, kapandi, soruldu: !!window.__pdefeOtoYanit.son, sayfa, kayitliSayfa: kayit ? kayit[1] : null, konumDogru: !!kayit && kayit[1] === sayfa }; })()`));
  console.log('bitti');
}
