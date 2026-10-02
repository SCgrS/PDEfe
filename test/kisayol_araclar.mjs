// Kısayollar — araç pencereleri (0.1.13, kullanıcı isteği): F1 Kısayollar penceresinin üçüncü sütununda ("Sayfaları düzenle",
// "Görüntü / PDF birleştir") yazan her fare ve tuş kullanımı gerçek girdiyle (CDP fare ve tuş olayları) sınanır; bu satırlar 0.1.13'te
// araç pencerelerinin alt şeridinden F1'e taşındı, burada yazılanın gerçekten çalıştığı doğrulanır. Sütundaki satırlar F1 penceresinden
// okunur; sonda her satır için hangi denetimlerin geçtiği (kapsam tablosu) yazılır.
// Ayrıca: araç pencerelerinde alt şeritte ipucu metni (.arac-alt-metin) yok; Sayfaları düzenle'de "PDF ekle" düğmesi var ("PDF'ten sayfa
// ekle" yok) ve test diyaloğuyla seçilen PDF'in sayfalarını ekler; PDF küçült, Sayfaları düzenle, Döndür ve kaydet, PDF ayır (ve Görüntü /
// PDF birleştir) pencerelerinde bölüm başlığı "Kaydet" ("Kaydetme" başlığı yok).
// Görüntü / PDF birleştir'de Ctrl+V sistem panosuna dokunmadan sınanır: açık pencerenin panodanEkle işlevi örnek üzerinde geçici olarak
// sarılıp çağrılar sayılır (asıl işlev çağrılmaz, pano okunmaz; örneğe modülün dinamik içe aktarımıyla, _secimiCiz bir kez sarılarak
// ulaşılır). Girdi kutusundaki Ctrl+V'nin yapıştırma olayı engellenir (kutuya pano içeriği yazılmaz).
// Kullanım: boş veri klasörlü ekran dışı test örneği (baslat.ps1 -Boyut "1280,1000") açıkken  $env:PDEFE_CDP_PORT=9413; node test/surucu.mjs betik test/kisayol_araclar.mjs
// (0.1.25: Birleştir'de Kalite ve Kaydet bölümleri alt alta; 900 px yüksek pencerede dört satırlık listenin altında boş alan kalmıyor)
// Belgeler PyMuPDF / PIL ile test/cikti/ka/<zaman>/pdf altında üretilir; hiçbir şey kaydedilmez (çıktı klasörü yine de test klasörü).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 'ka', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PDF = path.join(K, 'pdf'), PNG = path.join(K, 'png'), CIKTI = path.join(K, 'cikti');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

// F1 satırlarının kapsam anahtarları: "<bölüm> › <tuşlar | ile>"
const S = 'Sayfaları düzenle › ', B = 'Görüntü / PDF birleştir › ';
const S_TIK = S + 'Tıkla', S_CS = S + 'Ctrl+tık / Shift+tık', S_ALAN = S + 'Boş alandan sürükle', S_SUR = S + 'Sayfayı sürükle', S_DEL = S + 'Delete',
  S_CA = S + 'Ctrl+A', S_OK = S + '← → ↑ ↓ | Home / End', S_R = S + 'R / Shift+R', S_ZY = S + 'Ctrl+Z / Ctrl+Y';
const B_TIK = B + 'Tıkla', B_CS = B + 'Ctrl+tık / Shift+tık', B_ALAN = B + 'Sağ tuşla sürükle | Boş alandan sürükle', B_SUR = B + 'Satırı sürükle',
  B_DEL = B + 'Delete', B_CA = B + 'Ctrl+A', B_CV = B + 'Ctrl+V';
const F1_BEKLENEN = [
  ['Sayfaları düzenle'],
  [['Tıkla'], 'Sayfayı seç'], [['Ctrl+tık / Shift+tık'], 'Seçime ekle / aralığı seç'], [['Boş alandan sürükle'], 'Alandaki sayfaları seç'],
  [['Sayfayı sürükle'], 'Sırala (seçiliyse seçilenler birlikte)'], [['Delete'], 'Seçilenleri sil'], [['Ctrl+A'], 'Tümünü seç'],
  [['← → ↑ ↓', 'Home / End'], 'Sayfalar arasında gez (Shift ile seçimi genişlet)'], [['R / Shift+R'], 'Seçilenleri sağa / sola döndür'],
  [['Ctrl+Z / Ctrl+Y'], 'Geri al / yinele'],
  ['Görüntü / PDF birleştir'],
  [['Tıkla'], 'Dosyayı seç'], [['Ctrl+tık / Shift+tık'], 'Seçime ekle / aralığı seç'],
  [['Sağ tuşla sürükle', 'Boş alandan sürükle'], 'Alandaki dosyaları seç'], [['Satırı sürükle'], 'Sırala (seçiliyse seçilenler birlikte)'],
  [['Delete'], 'Seçilenleri çıkar'], [['Ctrl+A'], 'Tümünü seç'], [['Ctrl+V'], 'Panodaki dosyaları ya da görüntüyü ekle'],
];

let hataSayisi = 0, denetimSayisi = 0;
const kapsam = new Map();   // F1 anahtarı → [true|false, …]
const sonuc = (ad, ok, ayrinti = '', f1 = []) => {
  denetimSayisi++;
  if (!ok) hataSayisi++;
  for (const a of [].concat(f1)) { if (!kapsam.has(a)) kapsam.set(a, []); kapsam.get(a).push(!!ok); }
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

/** Python (proje .venv) çalıştırır; son satırı JSON olarak döner. */
function py(kod) {
  const cikti = execFileSync(PY, ['-X', 'utf8', '-c', 'import json, os\nimport pymupdf\n' + kod], { encoding: 'utf8' });
  return JSON.parse(cikti.trim().split(/\r?\n/).pop());
}

export default async function ({ evalJs, ekranGoruntusu, bekle, fare, tikla, surukle, tus }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(120); } };
  const ss = async (ad) => { await bekle(200); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const merkez = async (sec) => JSON.parse(await evalJs(`(() => { const e = ${sec}; if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify([Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]); })()`));
  const diyalogKaydi = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const acYaniti = (yollar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:acDiyalog', ${J([yollar])})`);
  const kutuDugmesi = async (metin) => { const m = await merkez(`[...[...document.querySelectorAll('.mesaj-kutusu')].at(-1)?.querySelectorAll('.dugmeler button') || []].find((b) => b.textContent === ${J(metin)})`); if (!m) throw new Error('Düğme yok: ' + metin); await tikla(...m); await bekle(400); };
  /** Araç pencerelerini uygulamanın kendi yoluyla kapatır (ortak.js aracPencereleriniKapat; DOM'dan silmek açık pencere kaydında bayat
   *  girdi bırakır, araç bir daha açılmaz), çıkış sorularına Kaydetme der; sonra diyalogları ve sekmeleri kapatır. */
  const hepsiniKapat = async () => {
    await evalJs(`(async () => { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) window.__kaKapatiliyor = m.aracPencereleriniKapat(); return true; })()`);
    for (let i = 0; i < 20 && await evalJs(`import('pdefe://app/src/renderer/araclar/ortak.js').then((m) => m.acikAracPenceresiVar())`); i++) {
      if (await evalJs(`!!document.querySelector('.mesaj-kutusu')`)) await kutuDugmesi('Kaydetme'); else await bekle(200);
    }
    return evalJs(`(async () => { document.querySelectorAll('.diyalog-ortusu').forEach((e) => e.remove()); for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  };
  const ac = async (yol) => {
    await evalJs(`window.__pdefe.dosyaAc(${J(yol)}).then(() => true)`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(300);
  };
  const bildirim = () => evalJs(`(() => { const b = document.querySelector('#bildirim'); return b && !b.hidden ? b.textContent : ''; })()`);
  /** Araç penceresinin çerçeve denetimi: alt şeritte ipucu yok, bölüm başlıkları (Kaydet var, Kaydetme yok). */
  const cerceve = (sinif) => evalJs(`(() => { const p = document.querySelector('.${sinif}'); if (!p) return null; return {
    altMetin: document.querySelectorAll('.arac-alt-metin').length, sol: p.querySelector('.arac-dugmeler-sol')?.textContent.trim() ?? null,
    serit: [...p.querySelectorAll('.arac-dugmeler > *')].map((e) => e.textContent.trim()).filter(Boolean),
    basliklar: [...p.querySelectorAll('.arac-bolum-baslik')].map((e) => e.textContent.trim()), kaydetmeGorunur: /\\bKaydetme\\b/.test(p.innerText),
    ipucuSatiri: /Tıkla:|Delete:|sürükle:/i.test(p.innerText) }; })()`);
  const cerceveDenetle = (ad, c) => {
    sonuc(`${ad}: alt şeritte ipucu metni yok (.arac-alt-metin yok, sol köşe boş, "Tıkla: … · Delete: …" satırı yok)`, !!c && c.altMetin === 0 && c.sol === '' && !c.ipucuSatiri, c);
    sonuc(`${ad}: bölüm başlığı "Kaydet", "Kaydetme" başlığı ve görünen "Kaydetme" metni yok`, !!c && c.basliklar.includes('Kaydet') && !c.basliklar.includes('Kaydetme') && !c.kaydetmeGorunur, c);
  };

  // ---------------------------------------------------------------- hazırlık
  for (const k of [PDF, PNG, CIKTI]) fs.mkdirSync(k, { recursive: true });
  const Y = py(`from PIL import Image, ImageDraw
k = ${J(PDF)}
def pdf(ad, n, onek):
    d = pymupdf.open()
    for i in range(n):
        pg = d.new_page(width=595, height=842)
        pg.insert_text((72, 200), "%s %d" % (onek, i + 1), fontsize=72)
        pg.draw_rect(pymupdf.Rect(60, 60, 535, 782), color=(0.2, 0.4, 0.8), width=4)
    y = os.path.join(k, ad); d.save(y); d.close(); return y
def png(ad, renk, boyut):
    y = os.path.join(k, ad); im = Image.new("RGB", boyut, renk); ImageDraw.Draw(im).rectangle((20, 20, boyut[0] - 21, boyut[1] - 21), outline=(0, 0, 0), width=6); im.save(y); return y
print(json.dumps({"ana": pdf("ana.pdf", 12, "Sayfa"), "ek": pdf("ek.pdf", 3, "Ek"), "bir": pdf("bir.pdf", 2, "Bir"), "dort": pdf("dort.pdf", 1, "Dort"),
                  "iki": png("iki.png", (230, 120, 60), (400, 300)), "uc": png("uc.png", (60, 160, 90), (300, 400))}))`);
  await tus('Escape');
  await hepsiniKapat();
  // Yarıda kalmış bir çalıştırmadan kuyrukta kalan Aç penceresi yanıtlarını boşalt (test diyaloğu: kuyruk boşsa [] döner)
  for (let i = 0; i < 20 && (await evalJs(`window.pdefe.cagir('dosya:acDiyalog', { baslik: 'test kuyruğu boşaltma' })`))?.length; i++);
  // Hata toplayıcı (aynı örnekte yeniden çalıştırmada dinleyiciler bir kez kurulur, liste sıfırlanır)
  await evalJs(`(() => { window.__kaHatalar = []; if (window.__kaDinleyici) return true; window.__kaDinleyici = true;
    addEventListener('error', (e) => window.__kaHatalar.push('error: ' + e.message)); addEventListener('unhandledrejection', (e) => window.__kaHatalar.push('reject: ' + (e.reason?.message || e.reason)));
    const ce = console.error; console.error = (...a) => { window.__kaHatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; return true; })()`);
  await evalJs(`(async () => { for (const [k, v] of Object.entries({ ciktiKlasoru: ${J(CIKTI)}, otomatikKaydet: false })) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; } return true; })()`);
  await diyalogKaydi();
  // Sayfa tarafı yardımcılar: kart / satır kimliği (kaynak sayfa ya da dosya adı), durum okuma, konum ölçme (görünmüyorsa görünüme kaydırır)
  await evalJs(`(() => { window.__ka = {
    kartId(e) { const m = /^(.*?) — sayfa (\\d+)/.exec(e.title); return m ? (m[1] === 'ana.pdf' ? m[2] : m[1].replace(/\\.pdf$/i, '') + ':' + m[2]) : 'bos'; },
    kartlar() { return [...document.querySelectorAll('.sayfalar-izgara > .sayfa-karti')]; },
    sDurum() { const k = this.kartlar(); const id = (e) => this.kartId(e); const r = (e) => { const z = e.querySelector('.rozet.dondurme'); return z.hidden ? 0 : parseInt(z.textContent, 10); };
      return { sira: k.map(id), secili: k.filter((e) => e.classList.contains('secili')).map(id), odak: k.filter((e) => e.classList.contains('odak')).map(id)[0] ?? null,
        rozet: Object.fromEntries(k.map((e) => [id(e), r(e)])), sayac: document.querySelector('.sayfalar-arac-cubugu .sayac')?.textContent,
        odakta: document.activeElement === document.querySelector('.sayfalar-izgara') }; },
    konum(e, kaydir) { if (!e) return null; const kap = e.parentElement; if (kaydir) e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(), r = kap.getBoundingClientRect();
      return { x: b.left, y: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + 40), my: Math.round(b.top + b.height / 2), gorunur: b.top >= r.top && b.bottom <= r.bottom }; },
    kart(id, kaydir) { return this.konum(this.kartlar().find((e) => this.kartId(e) === id), kaydir); },
    satirlar() { return [...document.querySelectorAll('.birlestir-liste > .birlestir-oge')]; },
    bDurum() { const s = this.satirlar(); const ad = (e) => e.querySelector('.ad').textContent; return { sira: s.map(ad), secili: s.filter((e) => e.classList.contains('secili')).map(ad),
      odakta: document.activeElement === document.querySelector('.birlestir-liste'), metinSecimi: getSelection().toString() }; },
    satir(ad) { const e = this.satirlar().find((x) => x.querySelector('.ad').textContent === ad); if (!e) return null; const k = this.konum(e);
      const p = (s) => { const b = e.querySelector(s).getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; };
      return { ...k, resim: p('.resim'), tutamac: p('.birlestir-tutamac') }; },
  }; return true; })()`);
  const sDurum = () => evalJs(`window.__ka.sDurum()`);
  const sKart = async (id) => { let k = await evalJs(`window.__ka.kart(${J(id)}, false)`); if (k && !k.gorunur) { k = await evalJs(`window.__ka.kart(${J(id)}, true)`); await bekle(100); } if (!k) throw new Error('Kart yok: ' + id); return k; };
  const sTikla = async (id, degistiriciler = []) => { const k = await sKart(id); await tikla(k.cx, k.cy, { degistiriciler }); await bekle(80); };
  const bDurum = () => evalJs(`window.__ka.bDurum()`);
  const bSatir = async (ad) => { const s = await evalJs(`window.__ka.satir(${J(ad)})`); if (!s) throw new Error('Satır yok: ' + ad); return s; };
  const bTikla = async (ad, degistiriciler = []) => { const s = await bSatir(ad); await tikla(...s.resim, { degistiriciler }); await bekle(80); };
  const ayni = (a, b) => J(a) === J(b);
  const bir = (n) => Array.from({ length: n }, (_, i) => String(i + 1));

  // ---------------------------------------------------------------- 0) F1 Kısayollar: üçüncü sütun
  console.log('\n== 0) F1 Kısayollar penceresi');
  await evalJs(`window.__pdefe.komutCalistir('yardim.kisayollar')`);
  await kosul(`!!document.querySelector('.diyalog-ortusu table.kisayollar')`);
  const f1 = await evalJs(`(() => { const d = document.querySelector('.diyalog-ortusu'); const t = d.querySelectorAll('table.kisayollar');
    return { baslik: d.querySelector('.baslik').textContent, sutun: t.length, satirlar: t[2] ? [...t[2].rows].map((r) => r.classList.contains('bolum') ? [r.textContent.trim()] : [[...r.cells[0].querySelectorAll('kbd')].map((k) => k.textContent), r.cells[1].textContent]) : [] }; })()`);
  sonuc('F1 penceresinin başlığı "Kısayollar", üç sütun', f1.baslik === 'Kısayollar' && f1.sutun === 3, { baslik: f1.baslik, sutun: f1.sutun });
  sonuc('Üçüncü sütun: Sayfaları düzenle ve Görüntü / PDF birleştir satırları (sınanan liste)', ayni(f1.satirlar, F1_BEKLENEN), f1.satirlar);
  await ss('00-f1-kisayollar');
  await tus('Escape');
  sonuc('F1 penceresi Esc ile kapanır', await kosul(`!document.querySelector('.diyalog-ortusu')`, 2000));

  // ---------------------------------------------------------------- 1) Sayfaları düzenle
  console.log('\n== 1) Sayfaları düzenle');
  await ac(Y.ana);
  const belgeSayfa = () => evalJs(`({ sayfa: window.__pdefe.aktif().gorunum.gecerli, ust: window.__pdefe.aktif().gorunum.kaydirici.scrollTop, degisti: window.__pdefe.aktif().degisti })`);
  const belgeOnce = await belgeSayfa();
  await evalJs(`window.__pdefe.komutCalistir('arac.sayfalar')`);
  await kosul(`!!document.querySelector('.sayfalar-pencere')`);
  await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 10`, 15000);
  await bekle(300);
  cerceveDenetle('Sayfaları düzenle', await cerceve('sayfalar-pencere'));
  const dugmeler = await evalJs(`(() => { const p = document.querySelector('.sayfalar-pencere'); const e = p.querySelector('[data-komut="pdfEkle"]'); return { pdfEkle: e?.textContent.trim(), ipucu: e?.title, eski: p.innerText.includes("PDF'ten sayfa ekle") || [...p.querySelectorAll('[title]')].some((x) => x.title.includes("PDF'ten sayfa ekle")) }; })()`);
  sonuc('"PDF ekle" düğmesi var, "PDF\'ten sayfa ekle" yazısı yok', dugmeler.pdfEkle === 'PDF ekle' && !dugmeler.eski, dugmeler);
  let d = await sDurum();
  sonuc('Başlangıç: 12 kart, seçim yok, odak ızgarada', ayni(d.sira, bir(12)) && d.secili.length === 0 && d.odakta, d);
  const C = await evalJs(`(() => { const k = window.__ka.kartlar(); const t = k[0].getBoundingClientRect().top; return k.filter((e) => Math.abs(e.getBoundingClientRect().top - t) < 2).length; })()`);
  console.log(`     ızgarada ${C} sütun`);

  // Tıkla
  await sTikla('3');
  d = await sDurum();
  sonuc('Tıkla: yalnızca tıklanan sayfa seçili, odak onda, sayaç "12 sayfa · 1 seçili"', ayni(d.secili, ['3']) && d.odak === '3' && d.sayac === '12 sayfa · 1 seçili' && d.odakta, d, S_TIK);
  await sTikla('7');
  d = await sDurum();
  sonuc('Tıkla (başka sayfa): seçim onunla değişir', ayni(d.secili, ['7']), d, S_TIK);
  await ss('01-sayfalar-tikla');
  // Ctrl+tık / Shift+tık
  await sTikla('3');
  await sTikla('5', ['ctrl']);
  d = await sDurum();
  sonuc('Ctrl+tık: seçime ekler (3, 5)', ayni(d.secili, ['3', '5']) && d.odak === '5', d, S_CS);
  await sTikla('9', ['ctrl']);
  d = await sDurum();
  sonuc('Ctrl+tık: bir tane daha ekler (3, 5, 9)', ayni(d.secili, ['3', '5', '9']), d, S_CS);
  await sTikla('3', ['ctrl']);
  d = await sDurum();
  sonuc('Ctrl+tık seçili sayfada: seçimden çıkarır (5, 9)', ayni(d.secili, ['5', '9']), d, S_CS);
  await sTikla('2');
  await sTikla('6', ['shift']);
  d = await sDurum();
  sonuc('Shift+tık: çapadan (2) tıklanana (6) aralık', ayni(d.secili, ['2', '3', '4', '5', '6']), d, S_CS);
  await sTikla('1', ['shift']);
  d = await sDurum();
  sonuc('Shift+tık geriye: çapa (2) korunur, aralık 1-2', ayni(d.secili, ['1', '2']), d, S_CS);
  await ss('01-sayfalar-ctrl-shift');

  // Boş alandan sürükle (alan seçimi)
  await evalJs(`document.querySelector('.sayfalar-izgara').scrollTop = 0`); await bekle(100);
  await sTikla('10');
  const iz = await evalJs(`(() => { const r = document.querySelector('.sayfalar-izgara').getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; })()`);
  const bx = Math.round(iz.x + 6), by = Math.round(iz.y + 6);
  const k7 = await sKart('7');
  const tumKartlar = await evalJs(`window.__ka.kartlar().map((e) => ({ id: window.__ka.kartId(e), ...window.__ka.konum(e) }))`);
  const kesisen = (x0, y0, x1, y1) => tumKartlar.filter((k) => k.x < Math.max(x0, x1) && k.r > Math.min(x0, x1) && k.y < Math.max(y0, y1) && k.b > Math.min(y0, y1)).map((k) => k.id);
  const adimlar = [{ tur: 'hareket', x: bx, y: by }, { tur: 'bas', x: bx, y: by, bekle: 30 }];
  for (let i = 1; i <= 10; i++) adimlar.push({ tur: 'hareket', x: Math.round(bx + (k7.cx - bx) * i / 10), y: Math.round(by + (k7.my - by) * i / 10), bekle: 20 });
  await fare(adimlar);
  const canli = await evalJs(`({ dikdortgen: !!document.querySelector('.sayfalar-alan-secimi'), secili: window.__ka.sDurum().secili })`);
  await ss('01-sayfalar-alan-secimi');
  await fare([{ tur: 'birak', x: k7.cx, y: k7.my }]);
  await bekle(150);
  d = await sDurum();
  const alanBeklenen = kesisen(bx, by, k7.cx, k7.my);
  sonuc('Boş alandan sürükle: sürerken dikdörtgen ve canlı seçim', canli.dikdortgen && ayni(canli.secili, alanBeklenen), { canli, alanBeklenen }, S_ALAN);
  sonuc('Boş alandan sürükle: bırakınca alandaki sayfalar seçili, önceki seçim (10) yerini bırakır, dikdörtgen kalkar', ayni(d.secili, alanBeklenen) && alanBeklenen.length === 4 && !d.secili.includes('10')
    && !(await evalJs(`!!document.querySelector('.sayfalar-alan-secimi')`)), { secili: d.secili, alanBeklenen }, S_ALAN);

  // Sayfayı sürükle (sırala)
  const tasiModel = (sira, tasinan, hedef, sonra = true) => { const kalan = sira.filter((x) => !tasinan.includes(x)); const i = kalan.indexOf(hedef) + (sonra ? 1 : 0); return [...kalan.slice(0, i), ...sira.filter((x) => tasinan.includes(x)), ...kalan.slice(i)]; };
  const kartSurukle = async (id, hedef) => { const a = await sKart(id), h = await sKart(hedef); await surukle(a.cx, a.cy, Math.round(h.cx + h.w * 0.3), h.my); await bekle(250); };
  await sTikla('1');
  await kartSurukle('4', '7');
  d = await sDurum();
  let beklenenSira = tasiModel(bir(12), ['4'], '7');
  sonuc('Sayfayı sürükle (seçili değil): yalnızca o sayfa taşınır (4 → 7\'nin arkası), taşınan seçili olur', ayni(d.sira, beklenenSira) && ayni(d.secili, ['4']), { sira: d.sira, secili: d.secili, beklenenSira }, S_SUR);
  sonuc('Sıralama sonrası sayaç "değişti" der', /değişti/.test(d.sayac), d.sayac, S_SUR);
  await tus('z', ['ctrl']); await bekle(150);
  d = await sDurum();
  sonuc('Ctrl+Z: sıralamayı geri alır (seçim önceki haline döner)', ayni(d.sira, bir(12)) && ayni(d.secili, ['1']) && !/değişti/.test(d.sayac), d, S_ZY);
  await tus('y', ['ctrl']); await bekle(150);
  d = await sDurum();
  sonuc('Ctrl+Y: sıralamayı yineler', ayni(d.sira, beklenenSira), d.sira, S_ZY);
  await tus('z', ['ctrl']); await bekle(150);
  await sTikla('1');
  await sTikla('3', ['ctrl']);
  await kartSurukle('1', '8');
  d = await sDurum();
  beklenenSira = tasiModel(bir(12), ['1', '3'], '8');
  sonuc('Sayfayı sürükle (seçili): seçilenler (1, 3) birlikte ve sırasıyla taşınır', ayni(d.sira, beklenenSira) && ayni(d.secili, ['1', '3']), { sira: d.sira, beklenenSira, secili: d.secili }, S_SUR);
  await ss('01-sayfalar-grup-surukleme');
  await sTikla('6');
  await kartSurukle('6', '2');
  const beklenenSira2 = tasiModel(beklenenSira, ['6'], '2');
  d = await sDurum();
  sonuc('Sayfayı sürükle geriye (6 → 2\'nin arkası)', ayni(d.sira, beklenenSira2), { sira: d.sira, beklenenSira2 }, S_SUR);
  await tus('z', ['ctrl']); await tus('z', ['ctrl']); await bekle(150);
  d = await sDurum();
  sonuc('Ctrl+Z iki kez: iki sıralama da geri alınır', ayni(d.sira, bir(12)), d.sira, S_ZY);
  await tus('z', ['ctrl']); await bekle(100);
  sonuc('Geri alınacak şey kalmayınca Ctrl+Z bir şey yapmaz (hata yok)', ayni((await sDurum()).sira, bir(12)), '', S_ZY);

  // Delete
  await sTikla('2');
  await tus('Delete'); await bekle(150);
  d = await sDurum();
  sonuc('Delete: seçili sayfa silinir (11 sayfa), odak yerine gelen sayfada', ayni(d.sira, bir(12).filter((x) => x !== '2')) && d.odak === '3' && /^11 sayfa/.test(d.sayac), d, S_DEL);
  await sTikla('1');
  await sTikla('4', ['ctrl']);
  await tus('Delete'); await bekle(150);
  d = await sDurum();
  sonuc('Delete (birden çok seçili: 1, 4): seçilenlerin hepsi silinir (9 sayfa)', ayni(d.sira, bir(12).filter((x) => !['1', '2', '4'].includes(x))) && /^9 sayfa/.test(d.sayac), d, S_DEL);
  await tus('z', ['ctrl']); await bekle(120);
  d = await sDurum();
  sonuc('Ctrl+Z: son silme geri gelir (1 ve 4)', ayni(d.sira, bir(12).filter((x) => x !== '2')), d.sira, S_ZY);
  await tus('z', ['ctrl']); await bekle(120);
  sonuc('Ctrl+Z: ilk silme de geri gelir (12 sayfa)', ayni((await sDurum()).sira, bir(12)), '', S_ZY);

  // Ctrl+A
  await sTikla('5');
  await tus('a', ['ctrl']); await bekle(120);
  d = await sDurum();
  const metinSecimi = await evalJs(`getSelection().toString()`);
  sonuc('Ctrl+A: bütün sayfalar seçili ("12 sayfa · 12 seçili"), pencere metni seçilmez', ayni(d.secili, bir(12)) && d.sayac === '12 sayfa · 12 seçili' && metinSecimi === '', { d, metinSecimi }, S_CA);
  await tus('Delete'); await bekle(150);
  d = await sDurum();
  sonuc('Hepsi seçiliyken Delete: silmez ("Bütün sayfalar silinemez" bildirimi)', d.sira.length === 12 && /Bütün sayfalar silinemez/.test(await bildirim()), { sayi: d.sira.length, bildirim: await bildirim() }, S_DEL);

  // ← → ↑ ↓ / Home / End (Shift ile genişlet)
  await sTikla('1');
  const okAdim = async (ad, degistiriciler, secBekl, odakBekl) => { await tus(ad, degistiriciler); await bekle(90); const x = await sDurum(); return { ad: (degistiriciler.length ? degistiriciler.join('+') + '+' : '') + ad, ok: ayni(x.secili, secBekl) && x.odak === odakBekl, secili: x.secili, odak: x.odak }; };
  const oklar = [];
  oklar.push(await okAdim('ArrowRight', [], ['2'], '2'));
  oklar.push(await okAdim('ArrowDown', [], [String(2 + C)], String(2 + C)));
  oklar.push(await okAdim('ArrowLeft', [], [String(1 + C)], String(1 + C)));
  oklar.push(await okAdim('ArrowUp', [], ['1'], '1'));
  oklar.push(await okAdim('ArrowLeft', [], ['1'], '1'));        // uçta durur
  oklar.push(await okAdim('End', [], ['12'], '12'));
  oklar.push(await okAdim('ArrowRight', [], ['12'], '12'));     // uçta durur
  oklar.push(await okAdim('Home', [], ['1'], '1'));
  sonuc('← → ↑ ↓ / Home / End: odak ve seçim sayfalar arasında gezer (↑ ↓ bir satır, uçlarda durur)', oklar.every((o) => o.ok), oklar.filter((o) => !o.ok), S_OK);
  const kaydirma = await evalJs(`(async () => { const iz = document.querySelector('.sayfalar-izgara'); return iz.scrollTop; })()`);
  await tus('End'); await bekle(250);
  const sonGorunur = await evalJs(`(() => { const e = window.__ka.kartlar().at(-1); const b = e.getBoundingClientRect(), r = document.querySelector('.sayfalar-izgara').getBoundingClientRect(); return { ust: document.querySelector('.sayfalar-izgara').scrollTop, gorunur: b.top >= r.top - 1 && b.bottom <= r.bottom + 1 }; })()`);
  sonuc('End: son sayfa görünüme kaydırılır', sonGorunur.gorunur && sonGorunur.ust > kaydirma, sonGorunur, S_OK);
  await tus('Home'); await bekle(250);
  await sTikla('2');
  const shift = [];
  shift.push(await okAdim('ArrowRight', ['shift'], ['2', '3'], '3'));
  shift.push(await okAdim('ArrowRight', ['shift'], ['2', '3', '4'], '4'));
  shift.push(await okAdim('ArrowDown', ['shift'], bir(4 + C).slice(1), String(4 + C)));
  shift.push(await okAdim('ArrowLeft', ['shift'], bir(3 + C).slice(1), String(3 + C)));
  shift.push(await okAdim('ArrowUp', ['shift'], ['2', '3'], '3'));
  shift.push(await okAdim('End', ['shift'], bir(12).slice(1), '12'));
  shift.push(await okAdim('Home', ['shift'], ['1', '2'], '1'));
  sonuc('Shift + ← → ↑ ↓ / Home / End: seçim çapadan (2) genişler', shift.every((o) => o.ok), shift.filter((o) => !o.ok), S_OK);
  const belgeArada = await belgeSayfa();
  sonuc('Araç penceresindeki tuşlar belgeye gitmez (sayfa, kaydırma, değişiklik yok)', belgeArada.sayfa === belgeOnce.sayfa && belgeArada.ust === belgeOnce.ust && !belgeArada.degisti, { belgeOnce, belgeArada });

  // R / Shift+R
  await tus('Home'); await bekle(150);
  await sTikla('1'); await sTikla('2', ['shift']);
  const rozet = async () => { const x = await sDurum(); return [x.rozet['1'], x.rozet['2'], x.rozet['3']]; };
  const img = () => evalJs(`window.__ka.kartlar().slice(0, 3).map((e) => e.querySelector('.resim-kutu img')?.style.transform || '')`);
  await tus('r'); await bekle(150);
  const r1 = await rozet(), i1 = await img();
  sonuc('R: seçilenler (1, 2) sağa (90°) döner; seçili olmayan (3) değişmez; küçük resim döner', ayni(r1, [90, 90, 0]) && ayni(i1, ['rotate(90deg)', 'rotate(90deg)', '']), { r1, i1 }, S_R);
  await tus('R', ['shift']); await bekle(150);
  const r2 = await rozet();
  sonuc('Shift+R: seçilenler sola döner (0°)', ayni(r2, [0, 0, 0]), r2, S_R);
  await tus('R', ['shift']); await bekle(150);
  const r3 = await rozet();
  sonuc('Shift+R bir kez daha: 270°', ayni(r3, [270, 270, 0]), r3, S_R);
  await tus('z', ['ctrl']); await bekle(120);
  const z1 = await rozet();
  await tus('z', ['ctrl']); await bekle(120);
  const z2 = await rozet();
  await tus('y', ['ctrl']); await bekle(120);
  const y1 = await rozet();
  await tus('y', ['ctrl']); await bekle(120);
  const y2 = await rozet();
  await tus('y', ['ctrl']); await bekle(120);
  const y3 = await rozet();
  sonuc('Ctrl+Z / Ctrl+Y döndürmeleri adım adım geri alır / yineler (0 → 90 → 0 → 270; fazladan Ctrl+Y bir şey yapmaz)', ayni([z1, z2, y1, y2, y3], [[0, 0, 0], [90, 90, 0], [0, 0, 0], [270, 270, 0], [270, 270, 0]]), { z1, z2, y1, y2, y3 }, S_ZY);
  await ss('01-sayfalar-dondurme');
  await tus('z', ['ctrl']); await tus('z', ['ctrl']); await tus('z', ['ctrl']); await bekle(150);
  d = await sDurum();
  sonuc('Ctrl+Z ile başlangıç düzenine dönüldü (değişiklik yok)', ayni(d.sira, bir(12)) && Object.values(d.rozet).every((x) => x === 0) && !/değişti/.test(d.sayac), d, S_ZY);
  sonuc('Araç penceresindeki Ctrl+Z / Ctrl+Y belgeye gitmez (belge değişmedi)', !(await belgeSayfa()).degisti);
  // Karşılaştırma: kartın kendi düğmesi ızgaranın içindedir; odak o düğmede kalsa da tuş ızgaranın dinleyicisine ulaşır
  await sTikla('1');
  await tikla(...(await merkez(`window.__ka.kartlar().find((e) => window.__ka.kartId(e) === '1').querySelector('[data-kart-komut="saga"]')`))); await bekle(150);
  const kartOdak = await evalJs(`document.activeElement?.dataset?.kartKomut || document.activeElement?.className || ''`);
  const kd0 = (await sDurum()).rozet['1'];
  await tus('z', ['ctrl']); await bekle(150);
  const kd1 = (await sDurum()).rozet['1'];
  sonuc('Kartın kendi "Sağa döndür" düğmesinden sonra (odak kart düğmesinde) Ctrl+Z döndürmeyi geri alır', kd0 === 90 && kd1 === 0, { kartOdak, kd0, kd1 }, S_ZY);
  if (kd1 !== 0) { await sTikla('1'); await tus('z', ['ctrl']); await bekle(150); }
  // Araç çubuğundaki bir düğmeye (burada "Seçilenleri sağa döndür") tıklandıktan sonra odak o düğmede kalır: ızgaranın kısayolları
  // (ızgaranın keydown dinleyicisi) çalışıyor mu? Her tuşun etkisi ayrı ölçülür (Ctrl+Z → döndürme geri alınır, R → yeniden döner,
  // → → odak kayar, Delete → sayfa silinir, Ctrl+A → hepsi seçilir)
  await sTikla('1');
  await tikla(...(await merkez(`document.querySelector('.sayfalar-arac-cubugu [data-komut="sagaDondur"]')`))); await bekle(150);
  const cubukOdak = await evalJs(`document.activeElement?.dataset?.komut || document.activeElement?.className || document.activeElement?.tagName`);
  const cubukTus = {};
  let o0 = await sDurum();
  await tus('z', ['ctrl']); await bekle(150);
  let o1 = await sDurum();
  cubukTus['Ctrl+Z'] = o0.rozet['1'] === 90 && o1.rozet['1'] === 0;
  await tus('r'); await bekle(150);
  o0 = o1; o1 = await sDurum();
  cubukTus.R = o1.rozet['1'] !== o0.rozet['1'];
  await tus('ArrowRight'); await bekle(120);
  o0 = o1; o1 = await sDurum();
  cubukTus['→'] = o1.odak !== o0.odak;
  await tus('Delete'); await bekle(150);
  o0 = o1; o1 = await sDurum();
  cubukTus.Delete = o1.sira.length !== o0.sira.length;
  await tus('a', ['ctrl']); await bekle(120);
  o0 = o1; o1 = await sDurum();
  cubukTus['Ctrl+A'] = o1.secili.length === o1.sira.length;
  const cubukMetin = await evalJs(`getSelection().toString().length`);
  sonuc('Araç çubuğundaki düğmeye tıkladıktan sonra (odak düğmede) ızgara kısayolları çalışır (Ctrl+Z, R, →, Delete, Ctrl+A)', Object.values(cubukTus).every(Boolean),
    { odak: cubukOdak, calisan: cubukTus, ctrlAPencereMetniniSecti: cubukMetin > 0 });
  await sTikla('1');
  for (let i = 0; i < 6; i++) await tus('z', ['ctrl']);
  await bekle(150);
  d = await sDurum();
  if (!ayni(d.sira, bir(12)) || !Object.values(d.rozet).every((x) => x === 0)) throw new Error('Sayfaları düzenle başlangıç düzenine dönmedi: ' + J(d));

  // PDF ekle
  await diyalogKaydi();
  await sTikla('2');
  await tikla(...(await merkez(`document.querySelector('.sayfalar-arac-cubugu [data-komut="pdfEkle"]')`)));
  await bekle(600);
  d = await sDurum();
  const vazgecKaydi = (await diyalogKaydi()).filter((x) => x.kanal === 'dosya:acDiyalog');
  sonuc('PDF ekle, Aç penceresinde vazgeçilince: hiçbir şey eklenmez', ayni(d.sira, bir(12)) && vazgecKaydi.length === 1, { sira: d.sira, vazgecKaydi });
  await acYaniti([Y.ek]);
  await tikla(...(await merkez(`document.querySelector('.sayfalar-arac-cubugu [data-komut="pdfEkle"]')`)));
  await kosul(`window.__ka.kartlar().length === 15`, 8000);
  await bekle(300);
  d = await sDurum();
  const ekKaydi = (await diyalogKaydi()).filter((x) => x.kanal === 'dosya:acDiyalog');
  const ekKart = await evalJs(`(() => { const e = window.__ka.kartlar()[2]; return { yeni: !e.querySelector('.rozet.yeni').hidden, kaynak: e.querySelector('.kaynak').hidden ? '' : e.querySelector('.kaynak').textContent }; })()`);
  sonuc('PDF ekle: seçilen PDF\'in 3 sayfası seçili sayfanın (2) arkasına eklenir, eklenenler seçili', ayni(d.sira, ['1', '2', 'ek:1', 'ek:2', 'ek:3', ...bir(12).slice(2)]) && ayni(d.secili, ['ek:1', 'ek:2', 'ek:3']) && /^15 sayfa/.test(d.sayac), d);
  sonuc('PDF ekle: eklenen kartta "yeni" rozeti ve "ek.pdf · s. 1" kaynağı; bildirim "3 sayfa eklendi."', ekKart.yeni && ekKart.kaynak === 'ek.pdf · s. 1' && /3 sayfa eklendi/.test(await bildirim()), { ekKart, bildirim: await bildirim() });
  sonuc('PDF ekle: Aç penceresi PDF süzgeçli, çoklu seçimli ("Sayfaları eklenecek PDF")', ekKaydi.length === 1 && ekKaydi[0].secenek?.baslik === 'Sayfaları eklenecek PDF' && ekKaydi[0].secenek?.coklu === true
    && J(ekKaydi[0].secenek?.filtreler || []).includes('pdf'), ekKaydi.map((x) => x.secenek));
  await ss('01-sayfalar-pdf-ekle');
  await sTikla('1');   // odak "PDF ekle" düğmesinden ızgaraya
  await tus('z', ['ctrl']); await bekle(150);
  sonuc('Ctrl+Z: eklenen sayfalar geri alınır', ayni((await sDurum()).sira, bir(12)), '', S_ZY);
  // Kapat (değişiklik yok: soru sorulmaz; olursa Kaydetme)
  await tus('Escape');
  if (await kosul(`!!document.querySelector('.mesaj-kutusu')`, 800)) await kutuDugmesi('Kaydetme');
  sonuc('Sayfaları düzenle Esc ile kapanır (değişiklik kalmadı)', await kosul(`!document.querySelector('.sayfalar-pencere')`, 4000));

  // ---------------------------------------------------------------- 2) Görüntü / PDF birleştir
  console.log('\n== 2) Görüntü / PDF birleştir');
  await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir')`);
  await kosul(`!!document.querySelector('.birlestir-pencere')`);
  await bekle(300);
  cerceveDenetle('Görüntü / PDF birleştir', await cerceve('birlestir-pencere'));
  // 0.1.25: açık PDF (ana.pdf) listenin başında gelir; bu bölümün sınamaları dört dosyalık listeyle yapılır, ana.pdf çıkarılır
  await kosul(`window.__ka.satirlar().length === 1 && !document.querySelector('.birlestir-oge.yukleniyor')`, 8000);
  const acikIlk = (await bDurum()).sira;
  sonuc('Açık PDF listenin başında (0.1.25)', ayni(acikIlk, ['ana.pdf']), acikIlk);
  await evalJs(`document.querySelector('.birlestir-oge [data-komut="sil"]').click()`);
  await kosul(`window.__ka.satirlar().length === 0`, 3000);
  await diyalogKaydi();
  const dosyalar = [Y.bir, Y.iki, Y.uc, Y.dort];
  await acYaniti(dosyalar);
  await tikla(...(await merkez(`document.querySelector('.birlestir-ekle')`)));
  await kosul(`window.__ka.satirlar().length === 4 && !document.querySelector('.birlestir-oge.yukleniyor')`, 15000);
  await bekle(400);
  const bKaydi = (await diyalogKaydi()).filter((x) => x.kanal === 'dosya:acDiyalog');
  let b = await bDurum();
  sonuc('Dosya ekle (test diyaloğu): 4 dosya listede, sırasıyla', ayni(b.sira, ['bir.pdf', 'iki.png', 'uc.png', 'dort.pdf']) && bKaydi.length === 1 && bKaydi[0].secenek?.coklu === true, { sira: b.sira, kayit: bKaydi.map((x) => x.secenek?.baslik) });
  // Açık pencerenin örneği: _secimiCiz bir kez sarılır (ilk tıklamada örnek alınır), sonra eski haline döner
  await evalJs(`(async () => { const m = await import('pdefe://app/src/renderer/araclar/gorselBirlestir.js'); const P = m.BirlestirmePenceresi.prototype; const asil = P._secimiCiz;
    window.__kaGeri = () => { P._secimiCiz = asil; }; P._secimiCiz = function (...a) { window.__kaOrnek = this; return asil.apply(this, a); }; return true; })()`);

  // Tıkla
  await bTikla('iki.png');
  await evalJs(`(() => { window.__kaGeri(); delete window.__kaGeri; return true; })()`);
  b = await bDurum();
  sonuc('Tıkla: yalnızca tıklanan satır seçili, liste odakta', ayni(b.secili, ['iki.png']) && b.odakta, b, B_TIK);
  const ornekVar = await evalJs(`!!window.__kaOrnek && window.__kaOrnek.pencere.el === document.querySelector('.birlestir-pencere')`);
  await bTikla('dort.pdf');
  b = await bDurum();
  sonuc('Tıkla (başka satır): seçim onunla değişir', ayni(b.secili, ['dort.pdf']), b, B_TIK);
  // Ctrl+tık / Shift+tık
  await bTikla('iki.png');
  await bTikla('dort.pdf', ['ctrl']);
  b = await bDurum();
  sonuc('Ctrl+tık: seçime ekler (iki, dort); metin seçilmez', ayni(b.secili, ['iki.png', 'dort.pdf']) && b.metinSecimi === '', b, B_CS);
  await bTikla('iki.png', ['ctrl']);
  b = await bDurum();
  sonuc('Ctrl+tık seçili satırda: seçimden çıkarır (dort)', ayni(b.secili, ['dort.pdf']), b, B_CS);
  await bTikla('bir.pdf');
  await bTikla('uc.png', ['shift']);
  b = await bDurum();
  sonuc('Shift+tık: çapadan (bir) tıklanana (uc) aralık; metin seçilmez', ayni(b.secili, ['bir.pdf', 'iki.png', 'uc.png']) && b.metinSecimi === '', b, B_CS);
  await bTikla('dort.pdf', ['shift']);
  b = await bDurum();
  sonuc('Shift+tık: çapa korunur, aralık bir → dort', ayni(b.secili, ['bir.pdf', 'iki.png', 'uc.png', 'dort.pdf']), b, B_CS);
  await ss('02-birlestir-ctrl-shift');

  // Sağ tuşla sürükle (satırların üzerinden)
  await bTikla('dort.pdf');
  await diyalogKaydi();
  let s1 = await bSatir('bir.pdf'), s3 = await bSatir('uc.png');
  const sag = [{ tur: 'hareket', x: s1.resim[0], y: s1.resim[1] }, { tur: 'bas', x: s1.resim[0], y: s1.resim[1], dugme: 'right', bekle: 30 }];
  for (let i = 1; i <= 10; i++) sag.push({ tur: 'hareket', x: s1.resim[0] + 30 * i / 10, y: Math.round(s1.resim[1] + (s3.resim[1] - s1.resim[1]) * i / 10), dugme: 'right', bekle: 20 });
  await fare(sag);
  const sagCanli = await evalJs(`({ dikdortgen: !!document.querySelector('.birlestir-alan-secimi'), secili: window.__ka.bDurum().secili })`);
  await ss('02-birlestir-sag-surukleme');
  await fare([{ tur: 'birak', x: s1.resim[0] + 30, y: s3.resim[1], dugme: 'right' }]);
  await bekle(350);
  b = await bDurum();
  const sagMenu = (await diyalogKaydi()).filter((x) => x.kanal === 'menu:popup');
  sonuc('Sağ tuşla sürükle: sürerken dikdörtgen ve canlı seçim (bir, iki, uc)', sagCanli.dikdortgen && ayni(sagCanli.secili, ['bir.pdf', 'iki.png', 'uc.png']), sagCanli, B_ALAN);
  sonuc('Sağ tuşla sürükle: bırakınca alandaki satırlar seçili, önceki seçim (dort) yerini bırakır, dikdörtgen kalkar', ayni(b.secili, ['bir.pdf', 'iki.png', 'uc.png'])
    && !(await evalJs(`!!document.querySelector('.birlestir-alan-secimi')`)), b, B_ALAN);
  sonuc('Sağ tuşla sürüklemeden sonra sağ tık menüsü açılmaz', sagMenu.length === 0, sagMenu.map((x) => x.secenek), B_ALAN);
  await bekle(700);
  await tikla(...(await bSatir('bir.pdf')).resim, { dugme: 'right' });
  await bekle(400);
  const kontrolMenu = (await diyalogKaydi()).filter((x) => x.kanal === 'menu:popup');
  b = await bDurum();
  sonuc('Karşılaştırma: kıpırdamadan sağ tık menüyü açar (Yapıştır … Listeden çıkar (3)), seçili satırda seçim korunur', kontrolMenu.length === 1
    && J(kontrolMenu[0].secenek).includes('Yapıştır') && J(kontrolMenu[0].secenek).includes('Listeden çıkar (3)') && ayni(b.secili, ['bir.pdf', 'iki.png', 'uc.png']), { menu: kontrolMenu.map((x) => x.secenek), secili: b.secili });

  // Boş alandan sürükle (sol tuş)
  await bTikla('bir.pdf');
  const li = await evalJs(`(() => { const l = document.querySelector('.birlestir-liste'); const r = l.getBoundingClientRect(); const s = window.__ka.satirlar().at(-1).getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, ch: l.clientHeight, sh: l.scrollHeight, sonAlt: s.bottom }; })()`);
  const bosY = Math.round(li.sonAlt + Math.min(40, (li.b - li.sonAlt) / 2));
  sonuc('Listenin altında boş alan var (son satırın altı)', li.b - li.sonAlt > 20, li);
  s3 = await bSatir('uc.png');
  await surukle(Math.round(li.x + 60), bosY, Math.round(li.x + 260), s3.my);
  await bekle(200);
  b = await bDurum();
  sonuc('Boş alandan sürükle: alandaki satırlar (uc, dort) seçili, önceki seçim (bir) yerini bırakır', ayni(b.secili, ['uc.png', 'dort.pdf']), { secili: b.secili, bosY, li }, B_ALAN);
  await tikla(Math.round(li.x + 60), bosY);
  await bekle(120);
  sonuc('Boş alana tıklama seçimi kaldırır', (await bDurum()).secili.length === 0, '', B_TIK);

  // Satırı sürükle (sırala)
  const satirSurukle = async (ad, hedef) => { const a = await bSatir(ad), h = await bSatir(hedef); await surukle(...a.tutamac, a.tutamac[0], Math.round(h.my + h.h * 0.25)); await bekle(300); };
  await bTikla('bir.pdf');
  await satirSurukle('uc.png', 'dort.pdf');
  b = await bDurum();
  let bBek = tasiModel(['bir.pdf', 'iki.png', 'uc.png', 'dort.pdf'], ['uc.png'], 'dort.pdf');
  sonuc('Satırı sürükle (seçili değil): yalnızca o satır taşınır (uc → dort\'un altı), taşınan seçili olur', ayni(b.sira, bBek) && ayni(b.secili, ['uc.png']), { sira: b.sira, bBek, secili: b.secili }, B_SUR);
  await bTikla('bir.pdf');
  await bTikla('iki.png', ['ctrl']);
  await satirSurukle('bir.pdf', b.sira.at(-1));
  const once = b.sira;
  b = await bDurum();
  bBek = tasiModel(once, ['bir.pdf', 'iki.png'], once.at(-1));
  sonuc('Satırı sürükle (seçili): seçilenler (bir, iki) birlikte ve sırasıyla taşınır', ayni(b.sira, bBek) && ayni(b.secili, ['bir.pdf', 'iki.png']), { sira: b.sira, bBek, secili: b.secili }, B_SUR);
  const siraNo = await evalJs(`window.__ka.satirlar().map((e) => e.querySelector('.sira').textContent)`);
  sonuc('Sıralamadan sonra sıra numaraları 1-4', ayni(siraNo, ['1', '2', '3', '4']), siraNo, B_SUR);
  await bTikla('dort.pdf');
  await satirSurukle('dort.pdf', b.sira[0]);
  const once2 = b.sira;
  b = await bDurum();
  sonuc('Satırı sürükle yukarı (dort → ilk satırın altı)', ayni(b.sira, tasiModel(once2, ['dort.pdf'], once2[0])), { sira: b.sira }, B_SUR);
  await ss('02-birlestir-siralama');

  // Ctrl+A
  await bTikla(b.sira[1]);
  await tus('a', ['ctrl']); await bekle(120);
  b = await bDurum();
  sonuc('Ctrl+A: bütün satırlar seçili, pencere metni seçilmez', ayni(b.secili, b.sira) && b.secili.length === 4 && b.metinSecimi === '', b, B_CA);

  // Ctrl+V: panodanEkle örnek üzerinde sarılır (asıl işlev ve pano çağrılmaz)
  sonuc('Açık pencerenin örneğine ulaşıldı (Ctrl+V denetimi için)', ornekVar);
  await evalJs(`(() => { window.__kaPano = []; const o = window.__kaOrnek; o.panodanEkle = function () { window.__kaPano.push(document.activeElement?.className || document.activeElement?.tagName); return Promise.resolve(); }; return true; })()`);
  await bTikla(b.sira[0]);
  await tus('v', ['ctrl']); await bekle(150);
  const cv1 = await evalJs(`window.__kaPano.slice()`);
  sonuc('Ctrl+V (odak listede): panodanEkle bir kez çağrılır', cv1.length === 1 && /birlestir-liste/.test(cv1[0]), cv1, B_CV);
  await evalJs(`document.querySelector('.birlestir-ekle').focus()`);
  await tus('v', ['ctrl']); await bekle(150);
  const cv2 = await evalJs(`window.__kaPano.slice()`);
  sonuc('Ctrl+V (odak pencerenin bir düğmesinde): panodanEkle çağrılır', cv2.length === 2, cv2, B_CV);
  await evalJs(`(() => { const g = document.querySelector('.birlestir-pencere .arac-kayit-yeni .arac-cikti-ad'); window.__kaEskiAd = g.value; window.__kaYapistir = 0; window.__kaYapistirEngel = (e) => { window.__kaYapistir++; e.preventDefault(); }; g.addEventListener('paste', window.__kaYapistirEngel); g.focus(); return true; })()`);
  await tus('v', ['ctrl']); await bekle(150);
  const cv3 = await evalJs(`(() => { const g = document.querySelector('.birlestir-pencere .arac-kayit-yeni .arac-cikti-ad'); g.removeEventListener('paste', window.__kaYapistirEngel); const r = { pano: window.__kaPano.length, yapistir: window.__kaYapistir, ad: g.value, eski: window.__kaEskiAd }; return r; })()`);
  sonuc('Ctrl+V (odak dosya adı kutusunda): panodanEkle çağrılmaz (kutunun olağan yapıştırması)', cv3.pano === 2 && cv3.ad === cv3.eski, cv3, B_CV);
  if (cv3.yapistir !== 1) console.log(`     bilgi: kutuda yapıştırma olayı ${cv3.yapistir} kez geldi (CDP tuşunda düzenleme komutu)`);
  const panoSonra = await bDurum();
  await evalJs(`(() => { delete window.__kaOrnek.panodanEkle; return typeof window.__kaOrnek.panodanEkle === 'function' && !Object.prototype.hasOwnProperty.call(window.__kaOrnek, 'panodanEkle'); })()`);
  sonuc('Ctrl+V denetimi listeyi değiştirmedi (pano okunmadı), sarma kaldırıldı', panoSonra.sira.length === 4 && await evalJs(`!Object.prototype.hasOwnProperty.call(window.__kaOrnek, 'panodanEkle')`), panoSonra.sira);
  const menuYapistir = await evalJs(`(() => { const s = document.querySelector('.birlestir-yapistir'); return { ipucu: s.title, metin: s.textContent.trim() }; })()`);
  sonuc('"Panodan ekle" düğmesinin ipucunda Ctrl+V yazıyor', /Ctrl\+V/.test(menuYapistir.ipucu), menuYapistir, B_CV);

  // Delete
  b = await bDurum();
  const ikinci = b.sira[1], ucuncu = b.sira[2];
  await bTikla(ikinci);
  await tus('Delete'); await bekle(150);
  const b2 = await bDurum();
  sonuc('Delete: seçili satır listeden çıkar, seçim yerine gelen satıra geçer', ayni(b2.sira, b.sira.filter((x) => x !== ikinci)) && ayni(b2.secili, [ucuncu]) && b2.odakta, { once: b.sira, sonra: b2 }, B_DEL);
  await bTikla(b2.sira[0]);
  await bTikla(b2.sira[1], ['shift']);
  await tus('Delete'); await bekle(150);
  const b3 = await bDurum();
  sonuc('Delete (birden çok seçili): seçilenlerin hepsi çıkar (1 satır kalır)', ayni(b3.sira, [b2.sira[2]]) && ayni(b3.secili, [b2.sira[2]]), b3, B_DEL);
  const ozet = await evalJs(`document.querySelector('.birlestir-ozet').textContent`);
  sonuc('Özet satırı güncellenir ("1 dosya · …")', /^1 dosya/.test(ozet), ozet, B_DEL);
  await evalJs(`document.querySelector('.birlestir-ekle').focus()`);
  await tus('Delete'); await bekle(120);
  sonuc('Delete odak listede değilken satır çıkarmaz', (await bDurum()).sira.length === 1, '', B_DEL);
  await ss('02-birlestir-delete');
  // Satırın kendi düğmesine (Sağa döndür) tıklandıktan sonra odak o düğmede (listenin içinde) kalır: Ctrl+A / Delete çalışıyor mu?
  // (Sayfaları düzenle'de kartın düğmesinden sonra ızgara kısayolları çalışır; burada liste dinleyicisi e.target === liste ister)
  const kalan = (await bDurum()).sira;
  await acYaniti(dosyalar.filter((y) => !kalan.includes(path.basename(y))).slice(0, 2));   // adlar tekil kalsın (satır adla bulunur)
  await tikla(...(await merkez(`document.querySelector('.birlestir-ekle')`)));
  await kosul(`window.__ka.satirlar().length === 3 && !document.querySelector('.birlestir-oge.yukleniyor')`, 15000);
  await bekle(300);
  b = await bDurum();
  const hedefSatir = b.sira[1];
  await bTikla(hedefSatir);
  await tikla(...(await merkez(`window.__ka.satirlar().find((e) => e.querySelector('.ad').textContent === ${J(hedefSatir)}).querySelector('[data-komut="saga"]')`)));
  await bekle(150);
  const satirOdak = await evalJs(`({ odak: document.activeElement?.dataset?.komut, listede: document.querySelector('.birlestir-liste').contains(document.activeElement), donmus: /90° döndürülmüş/.test(window.__ka.satirlar().find((e) => e.querySelector('.ad').textContent === ${J(hedefSatir)}).querySelector('.ozet').textContent) })`);
  const satirTus = {};
  await tus('a', ['ctrl']); await bekle(120);
  const sa = await bDurum();
  satirTus['Ctrl+A'] = sa.secili.length === sa.sira.length;
  await tus('Delete'); await bekle(150);
  const sdl = await bDurum();
  satirTus.Delete = sdl.sira.length < sa.sira.length;
  sonuc('Satırın kendi düğmesine tıkladıktan sonra (odak satırdaki düğmede) Ctrl+A ve Delete çalışır', Object.values(satirTus).every(Boolean),
    { odak: satirOdak, calisan: satirTus, ctrlAPencereMetniniSecti: sa.metinSecimi.length > 0, satirlar: sdl.sira });
  await evalJs(`getSelection().removeAllRanges()`);
  // Kapat: liste dolu → çıkış sorusu → Kaydetme; hiçbir dosya yazılmaz
  await tus('Escape');
  if (await kosul(`!!document.querySelector('.mesaj-kutusu')`, 2000)) await kutuDugmesi('Kaydetme');
  sonuc('Görüntü / PDF birleştir Esc → Kaydetme ile kapanır, çıktı klasörüne dosya yazılmadı', await kosul(`!document.querySelector('.birlestir-pencere')`, 4000) && fs.readdirSync(CIKTI).length === 0, fs.readdirSync(CIKTI));

  // ---------------------------------------------------------------- 3) Diğer araç pencereleri: alt şerit ve "Kaydet" başlığı
  console.log('\n== 3) PDF küçült, Döndür ve kaydet, PDF ayır');
  for (const [komut, sinif, ad] of [['arac.kucult', 'kucult-pencere', 'PDF küçült'], ['arac.dondurKaydet', 'dondur-pencere', 'Döndür ve kaydet'], ['arac.ayir', 'ayir-pencere', 'PDF ayır']]) {
    await evalJs(`window.__pdefe.komutCalistir(${J(komut)})`);
    await kosul(`!!document.querySelector('.${sinif}')`);
    await bekle(500);
    cerceveDenetle(ad, await cerceve(sinif));
    await ss('03-' + sinif);
    await tikla(...(await merkez(`document.querySelector('.${sinif} .arac-kapat')`)));
    if (await kosul(`!!document.querySelector('.mesaj-kutusu')`, 600)) await kutuDugmesi('Kaydetme');
    sonuc(`${ad} penceresi kapanır`, await kosul(`!document.querySelector('.${sinif}')`, 4000));
  }

  // ---------------------------------------------------------------- son
  const hatalar = await evalJs(`window.__kaHatalar || []`);
  sonuc('Renderer konsolunda hata yok', hatalar.length === 0, hatalar);
  await evalJs(`(() => { delete window.__kaOrnek; delete window.__kaPano; delete window.__ka; return true; })()`);
  await hepsiniKapat();

  console.log('\n== F1 üçüncü sütun kapsamı (satır → denetim sonucu)');
  let bolum = '';
  for (const r of f1.satirlar) {
    if (r.length === 1) { bolum = r[0]; console.log(`  ${bolum}`); continue; }
    const anahtar = `${bolum} › ${r[0].join(' | ')}`;
    const v = kapsam.get(anahtar) || [];
    const durum = !v.length ? 'SINANMADI' : v.every(Boolean) ? `OK (${v.length} denetim)` : `HATA (${v.filter((x) => !x).length}/${v.length} denetim)`;
    if (!v.length) hataSayisi++;
    console.log(`    ${r[0].join(' ; ').padEnd(42)} ${r[1].padEnd(48)} ${durum}`);
  }
  console.log(`\n${denetimSayisi} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}  (ekran görüntüleri: ${PNG})`);
  process.exitCode = hataSayisi ? 1 : 0;
}
