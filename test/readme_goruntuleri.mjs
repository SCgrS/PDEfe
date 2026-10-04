// README ekran görüntüleri: örnek belgelerle (test/readme_ornek_uret.py) uygulamayı sürer, görüntüleri test/cikti/readme/png'ye yazar;
// README'ye girecekler oradan docs/ altına kopyalanır. Kişisel veri yoktur: yazar adı kurgusal, belgeler kanun metni ve kurgusal dilekçe,
// belgelerin klasörü kullanıcı adı içermez (açılış ekranındaki son açılanlar listesinde görünür).
// Kullanım:
//   .venv\Scripts\python.exe test\readme_ornek_uret.py "C:\Users\Public\Documents\PDEfe Örnek"
//   powershell -File test\baslat.ps1 -Port 9431 -Boyut "1280,800" -Olcek 1 -Tema acik      → PID=… yazar (temiz veri klasörüyle)
//   $env:PDEFE_CDP_PORT=9431; $env:README_ORNEK="C:\Users\Public\Documents\PDEfe Örnek"; node test\surucu.mjs betik test\readme_goruntuleri.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı görüntüler: $env:GORUNTU="ana,notlar" (adlar aşağıdaki GORUNTULER'de).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG = path.join(KOK, 'test', 'cikti', 'readme', 'png');
const ORNEK = process.env.README_ORNEK || 'C:\\Users\\Public\\Documents\\PDEfe Örnek';
const J = (x) => JSON.stringify(x);
const Y = (ad) => path.join(ORNEK, ad);
const DILEKCE = 'Dava dilekçesi.pdf', TMK = 'Türk Medeni Kanunu.pdf', TTK = 'Türk Ticaret Kanunu.pdf', TARANMIS = 'Taranmış dilekçe.pdf';

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, surukle, yaz, tus }) {
  const istenen = process.env.GORUNTU ? process.env.GORUNTU.split(',').map((s) => s.trim()) : null;
  const iste = (ad) => !istenen || istenen.includes(ad);
  fs.mkdirSync(PNG, { recursive: true });
  const kosul = async (ifade, sure = 15000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => {
    await evalJs(`document.querySelector('#bildirim')?.setAttribute('hidden', ''); true`);
    await bekle(600);
    await ekranGoruntusu(path.join(PNG, `ekran-${ad}.png`));
    console.log('görüntü:', ad);
  };
  const komut = (k, ...a) => evalJs(`(window.__pdefe.komutCalistir(${J(k)}${a.map((x) => ', ' + J(x)).join('')}), true)`);
  const ayarKoy = (anahtar, deger) => evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', ${J(anahtar)}, ${J(deger)}); window.__pdefe.ayar()[${J(anahtar)}] = ${J(deger)}; return true; })()`);
  const hepsiniKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true });
    for (const s of [...p.sekmeler.sekmeler]) p.sekmeler.dispatchEvent(new CustomEvent('kapat', { detail: { id: s.id } })); await new Promise((r) => setTimeout(r, 400)); return true; })()`);
  const ac = async (ad) => {
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(Y(ad))}); return true; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(400);
  };
  const sec = async (ad) => {
    await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${J(ad)}); await p.sekmeSec(b.id); return true; })()`);
    await bekle(500);
  };
  const sayfayaGit = async (no, y = 0) => {
    await evalJs(`(window.__pdefe.aktif().gorunum.sayfayaGit(${no}, { y: ${y}, aninda: true }), true)`);
    await kosul(`window.__pdefe.aktif().gorunum.gecerli === ${no}`, 4000);
    await bekle(900);
  };
  const panel = async (acik, sekme) => {
    const simdi = await evalJs(`!document.querySelector('#sol-panel').hidden`);
    if (simdi !== acik) await komut('gorunum.solPanel');
    if (acik && sekme) await evalJs(`(window.__pdefe.panel.sekmeSec(${J(sekme)}), true)`);
    await bekle(700);
  };
  const aracKapat = async () => {
    await evalJs(`document.querySelector('.arac-pencere .arac-kapat')?.click(); true`);
    await kosul(`!document.querySelector('.arac-ortusu')`, 5000);
    await bekle(300);
  };
  const esc = async () => { await tus('Escape'); await bekle(400); };
  /** Açık soruları (kaydetmeden), araç pencerelerini, diyalogları ve Ayarlar'ı kapatır; Bul kutusu da kapanır */
  const hepsiniTemizle = async () => {
    for (let i = 0; i < 12; i++) {
      const durum = await evalJs(`(() => {
        const kutu = document.querySelector('.mesaj-kutusu');
        if (kutu) { const d = [...kutu.querySelectorAll('button')]; const b = d.find((x) => /^Kaydetme/.test(x.textContent.trim())) || d.find((x) => /Vazgeç|Tamam|Kapat/.test(x.textContent)); b?.click(); return 'soru'; }
        const arac = document.querySelector('.arac-pencere .arac-kapat'); if (arac) { arac.click(); return 'arac'; }
        if (document.querySelector('.diyalog-ortusu, .ayarlar-ortusu')) return 'diyalog';
        return '';
      })()`);
      if (durum === 'diyalog') await esc();
      else if (!durum) break;
      await bekle(500);
    }
    await evalJs(`(window.__pdefe.arama.kapat(), document.querySelector('#belge-listesi')?.setAttribute('hidden', ''), true)`);
    await bekle(300);
  };
  /** Sayfadaki metni görünümün üstünden ust px aşağıda kalacak biçimde kaydırır */
  const metneKaydir = async (sayfa, metin, ust = 30) => {
    const k = await evalJs(`window.__rg.metinKutusu(${sayfa}, ${J(metin)})`);
    if (!k) { console.log('metin yok:', metin); return; }
    await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; g.kaydirici.scrollTop += ${k.y} - g.kaydirici.getBoundingClientRect().top - ${ust}; return true; })()`);
    await bekle(900);
  };
  // Metin katmanında bas … son aralığını seçer (sayfa görünür ve metin katmanı çizilmiş olmalı)
  await evalJs(`(() => { window.__rg = {
    metinSec(sayfa, bas, son) {
      const g = window.__pdefe.aktif().gorunum; const kat = g.sayfalar[sayfa - 1].el.querySelector('.textLayer'); if (!kat) return false;
      const yur = document.createTreeWalker(kat, NodeFilter.SHOW_TEXT); const d = []; let m = '';
      for (let n; (n = yur.nextNode());) { d.push([n, m.length]); m += n.data; }
      const i = m.indexOf(bas); if (i < 0) return false; const j = m.indexOf(son, i); if (j < 0) return false; const k = j + son.length;
      const bul = (o) => { for (let x = d.length - 1; x >= 0; x--) if (d[x][1] <= o) return [d[x][0], o - d[x][1]]; return null; };
      const [n1, o1] = bul(i), [n2, o2] = bul(k - 1); const r = document.createRange(); r.setStart(n1, o1); r.setEnd(n2, o2 + 1);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true;
    },
    metinKutusu(sayfa, metin) {
      const g = window.__pdefe.aktif().gorunum; const kat = g.sayfalar[sayfa - 1].el.querySelector('.textLayer'); if (!kat) return null;
      const yur = document.createTreeWalker(kat, NodeFilter.SHOW_TEXT); let n;
      while ((n = yur.nextNode())) { const i = n.data.indexOf(metin); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + metin.length); const b = r.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom }; } }
      return null;
    },
  }; return true; })()`);

  // ------------------------------------------------------------ hazırlık
  await hepsiniKapat();
  await ayarKoy('yazarAdi', 'Av. Örnek Yazar');
  await ayarKoy('otomatikKaydet', false);
  await ayarKoy('solPanelGenislik', 250);
  await evalJs(`(window.__pdefe.ayar().otoGuncelle = false, true)`);
  await evalJs(`(window.pdefe.cagir('ayar:koy', 'otoGuncelle', false), true)`);

  // ------------------------------------------------------------ açılış ekranı (son açılanlarla)
  for (const ad of [TTK, TARANMIS, TMK, DILEKCE]) await ac(ad);
  await hepsiniKapat();
  await kosul(`!document.querySelector('#baslangic').hidden`, 5000);
  if (iste('acilis')) await ss('acilis');

  // ------------------------------------------------------------ ana pencere: sekmeler, İçindekiler
  for (const ad of [DILEKCE, TMK, TTK, TARANMIS]) await ac(ad);
  await sec(TMK);
  await komut('gorunum.zoom', 'genislik'); await bekle(500);
  await panel(true, 'icindekiler');
  await sayfayaGit(23, 0);
  await metneKaydir(23, 'İKİNCİ KİTAP', 40);
  if (iste('ana')) await ss('ana');

  // ------------------------------------------------------------ notlar: vurgu, metinle ilgili yorum, not, yazı; Yorumlar paneli ve balon
  await sec(TMK);
  await sayfayaGit(1, 0);
  await metneKaydir(1, 'BAŞLANGIÇ', 20);
  const notlar = await evalJs(`(async () => {
    const b = window.__pdefe.aktif(), n = b.notlar, rg = window.__rg, sonuc = [];
    if (rg.metinSec(1, 'Kanun, sözüyle', 'uygulanır.')) sonuc.push(n.vurguUygula('#ffd100'));
    if (rg.metinSec(1, 'Herkes, haklarını', 'zorundadır.')) { const v = n.secimdenVurgular('#7ee07e', { notlu: true }); if (v[0]) { n.guncelle(v[0], { icerik: 'Dürüstlük kuralı: TBK m. 2 ile birlikte değerlendirilecek.' }, 'Not'); sonuc.push(true); } }
    if (rg.metinSec(1, 'Hâkim, karar verirken', 'yararlanır.')) sonuc.push(n.vurguUygula('#8ecbff'));
    await new Promise((r) => setTimeout(r, 300));
    return sonuc;
  })()`);
  const notKonumu = await evalJs(`(() => { const k = window.__rg.metinKutusu(1, 'Bir hukuki ilişkide'); if (!k) return null; const g = window.__pdefe.aktif().gorunum; return k; })()`);
  // Not: sağ tık › Not ekle'nin yolu (sayfayaNotKoy): sağ boşlukta, Madde 1 satırının hizasında; balona yazılır, Esc kapatır
  const notYeri = await evalJs(`(() => { const k = window.__rg.metinKutusu(1, 'Madde 1'); const r = window.__pdefe.aktif().gorunum.sayfalar[0].el.getBoundingClientRect();
    return [Math.round(r.right - 62), Math.round(k.y - 4)]; })()`);
  await evalJs(`(window.__pdefe.aktif().notlar.sayfayaNotKoy(0, { clientX: ${notYeri[0]}, clientY: ${notYeri[1]} }), true)`);
  await bekle(500);
  await yaz('Yürürlük maddesine bakılacak (m. 1030).'); await bekle(300);
  await esc(); await esc();
  // Yazı notu: yazı aracıyla sayfaya tıklayıp yaz, Esc ile bitir (renkli yazı, açık sarı dolgu: sayfa yazısından ayrılsın)
  await ayarKoy('yaziRengi', '#b42318'); await ayarKoy('yaziArka', '#fff4c2');
  await evalJs(`(window.__pdefe.aktif().notlar.aracSec('yazi'), true)`);
  const yk = await evalJs(`window.__rg.metinKutusu(1, 'iddiasında bulunamaz')`);
  const yaziYeri = await evalJs(`(() => { const r = window.__pdefe.aktif().gorunum.sayfalar[0].el.getBoundingClientRect(); return [Math.round(r.left + r.width * 0.12), ${Math.round(yk ? yk.b + 36 : 600)}]; })()`);
  await tikla(yaziYeri[0], yaziYeri[1]); await bekle(400);
  await yaz('Müvekkile özet gönderilecek'); await bekle(200);
  await esc(); await esc();
  await evalJs(`(window.__pdefe.aktif().notlar.aracSec(null), true)`);
  await panel(true, 'yorumlar');
  console.log('notlar:', J(notlar), J(notKonumu));
  if (iste('notlar')) await ss('notlar');
  await esc();

  // ------------------------------------------------------------ yazı kutusu düzenleme (biçim çubuğu)
  await sec(DILEKCE);
  await panel(true, 'sayfalar');
  await komut('gorunum.zoom', 'genislik'); await bekle(400);
  await sayfayaGit(1, 0);
  await evalJs(`(window.__pdefe.aktif().notlar.aracSec('yazi'), true)`);
  const yaziYeri2 = await evalJs(`(() => { const r = window.__pdefe.aktif().gorunum.sayfalar[0].el.getBoundingClientRect(); return [Math.round(r.left + r.width * 0.55), Math.round(r.top + r.height * 0.05)]; })()`);
  await tikla(yaziYeri2[0], yaziYeri2[1]); await bekle(400);
  await yaz('Ön inceleme duruşması: 12.11.2026 saat 10.30'); await bekle(200);
  // "12.11.2026" kalın: düzenleyicide seç, Ctrl+B
  await evalJs(`(() => { const d = window.__pdefe.aktif().notlar.duzenleyici; if (!d) return false; const yur = document.createTreeWalker(d.el, NodeFilter.SHOW_TEXT); let n;
    while ((n = yur.nextNode())) { const i = n.data.indexOf('12.11.2026'); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, n.data.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; } } return false; })()`);
  await tus('b', ['ctrl']); await bekle(300);
  if (iste('yazi')) await ss('yazi');
  await esc(); await esc();
  await evalJs(`(window.__pdefe.aktif().notlar.aracSec(null), true)`);

  // ------------------------------------------------------------ seçim çubuğu (gerçek fareyle seçim)
  await sec(TTK);
  await panel(false);
  await komut('gorunum.zoom', 'genislik'); await bekle(400);
  await sayfayaGit(1, 250);
  const k1 = await evalJs(`window.__rg.metinKutusu(1, 'Türk Ticaret Kanunu, 22')`);
  const k2 = await evalJs(`window.__rg.metinKutusu(1, 'ticari hükümlerdir')`);
  console.log('seçim kutuları', J(k1), J(k2));
  if (k1 && k2) {
    await surukle(Math.round(k1.x + 1), Math.round((k1.y + k1.b) / 2), Math.round(k2.r - 1), Math.round((k2.y + k2.b) / 2), { adim: 16, araMs: 20 });
    await bekle(700);
  }
  if (iste('secim')) await ss('secim');
  await evalJs(`(getSelection().removeAllRanges(), true)`);

  // ------------------------------------------------------------ Bul: Türkçe arama
  await komut('duzen.bul', 'zamanaşımı');
  await kosul(`!document.querySelector('#bul-kutusu').hidden`, 4000);
  await bekle(2500);
  if (iste('arama')) await ss('arama');
  await evalJs(`(window.__pdefe.arama.kapat(), true)`); await bekle(300);
  // Açık belgeler listesi: tüm belgelerde ara
  await evalJs(`(document.querySelector('#sekme-acilir').click(), true)`); await bekle(500);
  await evalJs(`(() => { const g = document.querySelector('#belge-listesi input'); if (!g) return false; g.focus(); g.value = 'faiz'; g.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await bekle(3500);
  if (iste('belge-listesi')) await ss('belge-listesi');
  await esc(); await hepsiniTemizle();

  // ------------------------------------------------------------ taranmış belgede seçim (yazı tanıma)
  await sec(TARANMIS);
  await panel(false);
  await komut('gorunum.zoom', 'genislik'); await bekle(400);
  await sayfayaGit(1, 0);
  await bekle(3000);   // tanıma
  await kosul(`!!window.__rg.metinKutusu(1, 'üstlenmiştir')`, 15000);
  await metneKaydir(1, 'AÇIKLAMALAR', 140);
  const t1 = await evalJs(`window.__rg.metinKutusu(1, 'Müvekkil')`), t2 = await evalJs(`window.__rg.metinKutusu(1, 'üstlenmiştir')`);
  console.log('tanıma kutuları', J(t1), J(t2));
  if (t1 && t2) await surukle(Math.round(t1.x - 30), Math.round((t1.y + t1.b) / 2), Math.round(t2.r + 6), Math.round((t2.y + t2.b) / 2), { adim: 16, araMs: 25 });
  await bekle(900);
  if (iste('tarama')) await ss('tarama');
  await evalJs(`(getSelection().removeAllRanges(), true)`);

  // ------------------------------------------------------------ Araçlar
  await sec(DILEKCE);
  await evalJs(`(document.querySelector('#dugme-araclar').click(), true)`); await bekle(700);
  if (iste('araclar')) await ss('araclar');
  await esc(); await hepsiniTemizle();

  // Sıkıştır (taranmış belge: görselli, seviyeler arasında fark görünür)
  await sec(TARANMIS);
  await komut('arac.kucult'); await kosul(`!!document.querySelector('.arac-pencere')`, 5000);
  await bekle(6000);   // boyut tahminleri
  if (iste('sikistir')) await ss('sikistir');
  await hepsiniTemizle();

  // Görüntü / PDF birleştir (açık dilekçe + görseller + taranmış)
  await sec(DILEKCE);
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:acDiyalog', [${J([Y('Makbuz.png'), Y('Dilekçe sayfa 2.jpg'), Y(TARANMIS)])}])`);
  await komut('arac.gorselBirlestir'); await kosul(`!!document.querySelector('.arac-pencere')`, 5000);
  await bekle(800);
  await evalJs(`(() => { const d = [...document.querySelectorAll('.arac-pencere button')].find((x) => /Dosya ekle|Ekle/.test(x.textContent)); d?.click(); return !!d; })()`);
  await bekle(5000);
  await evalJs(`(document.querySelector('.birlestir-liste').scrollTop = 0, document.activeElement?.blur(), true)`); await bekle(400);
  if (iste('birlestir')) await ss('birlestir');
  await hepsiniTemizle();

  // Sayfaları düzenle (TMK)
  await sec(TMK);
  await komut('arac.sayfalar'); await kosul(`!!document.querySelector('.arac-pencere')`, 5000);
  await bekle(5000);
  if (iste('sayfalar')) await ss('sayfalar');
  await hepsiniTemizle();

  // Ayır (TTK)
  await sec(TTK);
  await komut('arac.ayir'); await kosul(`!!document.querySelector('.arac-pencere')`, 5000);
  await bekle(1000);
  await evalJs(`(() => { const g = [...document.querySelectorAll('.arac-pencere input[type="text"]')].find((x) => /1-3/.test(x.placeholder || '')); g?.focus(); return !!g; })()`);
  await yaz('1-24, 25-120, 121-'); await bekle(1200);
  if (iste('ayir')) await ss('ayir');
  await hepsiniTemizle();

  // ------------------------------------------------------------ Ayarlar, Yazdır, Kısayollar
  await sec(TMK);
  await komut('duzen.ayarlar'); await bekle(1000);
  if (iste('ayarlar')) await ss('ayarlar');
  await hepsiniTemizle();
  await komut('dosya.yazdir'); await bekle(1200);
  await evalJs(`(() => { const b = [...document.querySelectorAll('.mesaj-kutusu button')].find((x) => /Kaydetmeden/.test(x.textContent)); b?.click(); return !!b; })()`);
  await bekle(2500);
  if (iste('yazdir')) await ss('yazdir');
  await hepsiniTemizle();
  await komut('yardim.kisayollar'); await bekle(1000);
  if (iste('kisayollar')) await ss('kisayollar');
  await hepsiniTemizle();

  // ------------------------------------------------------------ koyu mod, iki sayfa, sayfa koyulaştırılmış
  await sec(TMK);
  await panel(false);
  await ayarKoy('sayfayiKoyulastir', true);
  await komut('gorunum.tema'); await bekle(800);
  await komut('gorunum.duzen', 'iki'); await bekle(800);
  await komut('gorunum.zoom', 'genislik'); await bekle(800);
  await sayfayaGit(2, 0);
  if (iste('koyu')) await ss('koyu');
  await komut('gorunum.duzen', 'surekli'); await bekle(500);
  await komut('gorunum.tema'); await ayarKoy('sayfayiKoyulastir', false);

  await hepsiniKapat();
  const hatalar = await evalJs(`window.__hatalar || []`);
  console.log('bitti', J(hatalar));
}
