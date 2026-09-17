// Senaryo 5: sayfa düzeni komutları (sil, döndür, boş sayfa, başka PDF'ten sayfa), geri al/yinele, yapısal kaydetme.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const D = 'C:/Users/Kullanici/Desktop/PDF DENEME/';
const KOPYA = 'C:/Projeler/PDEfe/test/cikti/yapisal-test.pdf';
const EK = 'C:/Projeler/PDEfe/test/cikti/deneme-notlu.pdf';   // senaryo4'ün ürettiği notlu dosya

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  fs.copyFileSync(D + 'fdsafsd.pdf', KOPYA);    // 13 sayfa, görselli
  await evalJs(`(() => { window.__pdefeOtoYanit = { secim: 0 }; const a = window.__pdefe.ayar(); a.otomatikKaydet = false; return true; })()`);
  await evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); return true; })()`);
  console.log('aç:', await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${JSON.stringify(KOPYA)}); await new Promise(r => setTimeout(r, 1200)); return { ad: b.ad, sayfa: b.gorunum.sayfaSayisi, notlar: b.notlar.notlar.size }; })()`));

  // Tarif: sayfa 2'yi sil, sayfa 3'ü 90° döndür, 1. sayfadan sonra boş sayfa, sona EK dosyasının 1. sayfasını ekle, 5 ile 4'ün yerini değiştir
  const tarif = await evalJs(`(async () => {
    const p = window.__pdefe; const b = p.aktif(); const g = b.gorunum;
    const t = g.tarif();
    const yeni = [t[0], { kaynak: null, genislik: 595.28, yukseklik: 841.89, dondurme: 0 }, { ...t[2], dondurme: 90 }, t[4], t[3], ...t.slice(5), { kaynak: { yol: ${JSON.stringify(EK)}, sayfa: 1 }, dondurme: 0 }];
    await p.sayfaTarifiUygula(b, yeni, 'Sayfa düzenini uygula');
    await new Promise(r => setTimeout(r, 1500));
    return { sayfa: g.sayfaSayisi, ikinciBos: g.sayfalar[1].bos, ucuncuDondurme: g.sayfalar[2].dondurme, sonKaynak: g.sayfalar[g.sayfaSayisi - 1].kaynak.yol.split('/').pop().split('\\\\').pop(), yapisalKirli: g.yapisalKirli(), degisti: b.degisti, geriAl: document.querySelector('#dugme-geri-al').title, notlar: b.notlar.liste().map(n => n.tur + '@' + n.sayfa) };
  })()`);
  console.log('tarif uygulandı:', tarif);
  await evalJs(`window.__pdefe.komutCalistir('gorunum.solPanel'); window.__pdefe.panel.sekmeSec('sayfalar')`);
  await bekle(2500);
  await ekranGoruntusu('test/png/s5-01-tarif.png');
  await evalJs(`window.__pdefe.aktif().gorunum.sayfayaGit(window.__pdefe.aktif().gorunum.sayfaSayisi)`);
  await bekle(1500);
  await ekranGoruntusu('test/png/s5-02-son-sayfa-ek.png');

  console.log('geri al:', await evalJs(`(() => { const b = window.__pdefe.aktif(); b.yigin.geriAl(); return { sayfa: b.gorunum.sayfaSayisi, yapisalKirli: b.gorunum.yapisalKirli(), degisti: b.degisti }; })()`));
  console.log('yinele:', await evalJs(`(() => { const b = window.__pdefe.aktif(); b.yigin.yinele(); return { sayfa: b.gorunum.sayfaSayisi, yapisalKirli: b.gorunum.yapisalKirli() }; })()`));

  // Döndür komutu (tüm sayfalar 90°) + vurgu ekle (yapısal modda not ekleme)
  console.log('döndür+vurgu:', await evalJs(`(async () => { const p = window.__pdefe; const b = p.aktif(); await p.sayfalariDondur(b, [1], 90, 'Sayfaları döndür'); await new Promise(r => setTimeout(r, 800));
    const g = b.gorunum; g.sayfayaGit(1); await new Promise(r => setTimeout(r, 900));
    const s = g.sayfalar[0]; const spans = [...s.el.querySelectorAll('.textLayer > span')].filter(x => x.textContent.trim());
    if (spans.length > 5) { const r = document.createRange(); r.setStart(spans[4].firstChild, 0); r.setEnd(spans[5].firstChild, spans[5].firstChild.length); const sec = window.getSelection(); sec.removeAllRanges(); sec.addRange(r); b.notlar.vurguUygula('#ff9ad5'); }
    return { dondurme: g.sayfalar[0].dondurme, notlar: b.notlar.liste().map(n => n.tur + '@' + n.sayfa + (n.yeni ? '*' : '')), konum: b.yigin.konum }; })()`));
  await bekle(600);
  await ekranGoruntusu('test/png/s5-03-donuk-vurgu.png');

  // Yapısal kaydet
  console.log('kaydet:', await evalJs(`(async () => { const p = window.__pdefe; const b = p.aktif(); const ok = await p.belgeKaydet(b); await new Promise(r => setTimeout(r, 500)); return { ok, degisti: b.degisti, anlik: !!b.gorunum.anlik, boyut: b.boyut, sayfa: b.gorunum.sayfaSayisi, kaynak1: b.gorunum.sayfalar[0].kaynak.yol.includes('anlik') }; })()`));
  const py = 'C:/Projeler/PDEfe/.venv/Scripts/python.exe';
  const dogrula = () => execFileSync(py, ['-c', `
import pymupdf, sys
sys.stdout.reconfigure(encoding='utf-8')
d = pymupdf.open(r'${KOPYA}')
print('sayfa', d.page_count, 'rot', [p.rotation for p in d], 'toc', len(d.get_toc()))
for i, p in enumerate(d):
    for a in p.annots():
        print(' s', i+1, a.type[1], '|', (a.info.get('content') or '')[:30])
print('ilk sayfa metin var:', len(d[0].get_text()) > 50, '| 2. sayfa boş:', len(d[1].get_text().strip()) == 0)
`], { encoding: 'utf8' });
  console.log(dogrula());

  // Kayıttan sonra geri al (vurgu) → kaydet; geri al (döndürme) → kaydet
  console.log('kayıt sonrası geri al+kaydet:', await evalJs(`(async () => { const p = window.__pdefe; const b = p.aktif(); b.yigin.geriAl(); b.yigin.geriAl(); const ok = await p.belgeKaydet(b); return { ok, degisti: b.degisti, dondurme: b.gorunum.sayfalar[0].dondurme, notlar: b.notlar.liste().length }; })()`));
  console.log(dogrula());
  console.log('yinele ×2 + kaydet:', await evalJs(`(async () => { const p = window.__pdefe; const b = p.aktif(); b.yigin.yinele(); b.yigin.yinele(); const ok = await p.belgeKaydet(b); return { ok, degisti: b.degisti, dondurme: b.gorunum.sayfalar[0].dondurme, notlar: b.notlar.liste().length }; })()`));
  console.log(dogrula());

  // Döndür düğmesi (gorunum.dondur): "Geçerli sayfa / Tüm PDF / Vazgeç" sorusu, "Seçeneğimi hatırla" (dondurmeKapsami),
  // belgeyi geri alınabilir biçimde döndürür ve belge değişmiş sayılır. Her deneme kendi değişikliğini geri alır.
  // kapsam: denemeden önce atanacak dondurmeKapsami (null: dokunma).
  const dondurDene = (secim, onay, kapsam) => evalJs(`(async () => {
    const p = window.__pdefe; const b = p.aktif(); const g = b.gorunum;
    if (${JSON.stringify(kapsam)} !== null) p.ayar().dondurmeKapsami = ${JSON.stringify(kapsam)};
    window.__pdefeOtoYanit = { secim: ${secim}, onay: ${onay}, son: null };
    const once = g.sayfalar.map(s => s.dondurme || 0); const konum = b.yigin.konum; const gecerli = g.gecerli;
    p.komutCalistir('gorunum.dondur', 90); await new Promise(r => setTimeout(r, 1500));
    const s = window.__pdefeOtoYanit.son; const degisen = g.sayfalar.map((x, i) => (x.dondurme || 0) !== once[i] ? i + 1 : 0).filter(Boolean);
    const sonuc = { soruldu: !!s, dugmeler: s?.dugmeler, onayKutusu: s?.onayKutusu, gecerli, degisen: degisen.length > 5 ? degisen.length + ' sayfa' : degisen, degisti: b.degisti, geriAl: document.querySelector('#dugme-geri-al').title, kapsam: p.ayar().dondurmeKapsami };
    if (b.yigin.konum !== konum) { b.yigin.geriAl(); await new Promise(r => setTimeout(r, 800)); sonuc.geriAlSonrasi = { ayni: g.sayfalar.every((x, i) => (x.dondurme || 0) === once[i]), degisti: b.degisti }; }
    return sonuc;
  })()`);
  console.log('döndür → Geçerli sayfa:', await dondurDene(0, false, 'sor'));    // beklenen: soruldu, degisen=[gecerli], degisti=true; geri alınca ayni=true, degisti=false
  console.log('döndür → Tüm PDF:', await dondurDene(1, false, 'sor'));          // beklenen: bütün sayfalar
  console.log('döndür → Vazgeç:', await dondurDene(2, false, 'sor'));           // beklenen: soruldu, degisen=[], geriAlSonrasi yok
  console.log('döndür → hatırla (Geçerli sayfa):', await dondurDene(0, true, 'sor'));   // beklenen: kapsam='sayfa'
  console.log('döndür → hatırlanan seçim:', await dondurDene(2, false, null));  // beklenen: soruldu=false, degisen=[gecerli]
  await evalJs(`(async () => { window.__pdefe.ayar().dondurmeKapsami = 'sor'; await window.pdefe.cagir('ayar:koy', 'dondurmeKapsami', 'sor'); window.__pdefeOtoYanit = { secim: 0 }; return true; })()`);
  // Koyu sayfa modu
  await evalJs(`(() => { const p = window.__pdefe; p.ayar().sayfayiKoyulastir = true; if (document.documentElement.dataset.tema !== 'koyu') p.komutCalistir('gorunum.tema'); p.aktif().gorunum.koyuSayfaAyarla(true); p.aktif().gorunum.sayfayaGit(4); })()`);
  await bekle(2000);
  await ekranGoruntusu('test/png/s5-04-koyu-sayfa.png');
  await evalJs(`(() => { const p = window.__pdefe; p.ayar().sayfayiKoyulastir = false; p.aktif().gorunum.koyuSayfaAyarla(false); p.komutCalistir('gorunum.tema'); })()`);
  console.log('bitti');
}
