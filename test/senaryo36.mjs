// Senaryo 36 (0.2.6, kullanıcı isteği: "metin kutusu kopyala-yapıştır; yapıştırılan düzenlenebilir; tıklanan sayfanın sağ üst köşesinden,
// görüntülemeyi yavaşlatmıyorsa tıklanan yere"): yazı kutusu (FreeText) Ctrl+C / Ctrl+V, sağ tık › Kopyala / Yapıştır, yer kuralı.
//   1) Yazı aracıyla gerçek fareyle yazı yazılır; Ctrl+C (sahte copy olayı) panoya düz metni ve PDEfe'nin özel türünü (JSON) yazar. Metin
//      seçiliyken metin kopyalanır (yazı değil); yazı düzenlenirken copy olayına dokunulmaz.
//   2) Altı sayfa tipinde (A4 dik, A4 yatay, /Rotate 90, /Rotate 270 + kaydırılmış MediaBox, A5, A3) gerçek tık + sahte paste: kutunun sol üstü
//      tıklanan noktada (±1,5 px), boyutu ve eğimi kaynağınki; metnin üzerine tıklama da "tıklanan yer".
//   3) Yer kuralı: tık yokken (yeni sekme), sayfa dışına basılınca, nota basılınca: sayfanın görünen sağ üst köşesi, kenarlardan 18 pt; tıklanan
//      sayfa görünmüyorsa geçerli sayfa; tıklanan nokta görünmüyorsa o sayfanın görünen köşesi. Aynı yere art arda: her kopya 12 pt kayar.
//   4) PDEfe'de döndürülmüş (Ctrl+R) sayfaya ve boş sayfaya yapıştırma; döndürülmüş sayfadaki (eğik) yazının kopyası eğimini korur.
//   5) Başka programın yazısı: biçimi seçilince önceden okunur; okunmadan kopyalanırsa yapıştırırken okunur. Başka pencereden gelen biçimsiz
//      kopya varsayılan biçimle; pano içeriği doğrulanır (bozuk / sınır dışı veri yapıştırılmaz ya da varsayılana döner).
//   6) Yapıştırılan PDEfe'nin yazısıdır: çift tık → düzenleyici → Esc, sürükleyerek taşıma, Delete, Ctrl+Z; yazar ayardaki ad.
//   7) Sayfaları düzenle açıkken, Bul kutusundayken ve yazı düzenlenirken paste not eklemez; panoda PDEfe yazısı yoksa olaya dokunulmaz.
//   8) Sağ tık: yazının üzerinde Kopyala etkin ve o yazıyı kopyalar; Yapıştır Kopyala'nın hemen altında, pano o kopyayı taşıyorsa etkin ve sağ
//      tıklanan yere yapıştırır. F1 "Yazı kutusu" bölümünde Ctrl+C / Ctrl+V.
//   9) Kaydet (yapısal: boş sayfa eklendi) → PyMuPDF: her yazının kutusu (sayfanın ekrandaki yönünde) ve metin yönü (/Matrix) beklenen değerde.
//  10) Ölçüm: basış başına eklenen iş (tikKaydet) mikro saniye olarak.
// Gerçek pano kullanılmaz: CDP ile gerçek Ctrl+C / Ctrl+V kullanıcının panosuna yazar. Kopya ve yapıştırma sahte ClipboardEvent ile (aynı
// DataTransfer), sağ tık › Kopyala'nın document.execCommand('copy')'si sınama süresince sahte copy olayına çevrilir; pano:oku test kuyruğundan.
// Girdiler test/cikti/s36 altında üretilir (test/yazi_kopya_pdf_uret.py).
// Kullanım (iki ölçekte):
//   powershell -File test\baslat.ps1 -Port 9436 -Veri "%TEMP%\pdefe-s36-9436" -Boyut "1280,1000"            → PID=… yazar
//   powershell -File test\baslat.ps1 -Port 9437 -Veri "%TEMP%\pdefe-s36-9437" -Boyut "1280,1000" -Olcek 1.25
//   $env:PDEFE_CDP_PORT=9436; node test\surucu.mjs betik test\senaryo36.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's36', String(process.env.PDEFE_CDP_PORT || 9222));
const PDF = path.join(UI, 'pdf');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const URET = path.join(KOK, 'test', 'yazi_kopya_pdf_uret.py');
const J = (x) => JSON.stringify(x);
const TUR = 'application/x-pdefe-yazi';
const YAZAR = 'Deneme Yazar';

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const yakin = (a, b, t = 1.5) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= t;
const menuMetni = (ogeler) => (ogeler ? ogeler.map((o) => (o.ayirici ? '-' : o.etiket + (o.devre ? ' (devre dışı)' : ''))) : null);

// Sayfadaki yardımcılar (window.__s36): sahte pano olayları, yazı listesi, kutular
const YARDIMCI = `(() => { window.__s36 = {
  b: () => window.__pdefe.aktif(),
  n: () => window.__pdefe.aktif().notlar,
  kopyala(hedef = document) { const dt = new DataTransfer(); const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true });
    hedef.dispatchEvent(ev); this.dt = dt; return { onlendi: ev.defaultPrevented, metin: dt.getData('text/plain'), json: dt.getData('${TUR}'), turler: [...dt.types] }; },
  yapistir(dt = this.dt, hedef = document) { const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); hedef.dispatchEvent(ev); return ev.defaultPrevented; },
  dtYap(veri) { const dt = new DataTransfer(); for (const [k, v] of Object.entries(veri)) dt.setData(k, v); return dt; },
  yazilar() { return [...this.n().notlar.values()].filter((x) => x.tur === 'FreeText' && !x.silindi).map((x) => ({ id: x.id, sayfa: x.sayfa, icerik: x.icerik, yazi: x.yazi || null, yazar: x.yazar, xref: x.xref || null })); },
  ptPx() { return this.n().ptPx(); },
  kutu(id) { const el = document.querySelector('.not-oge[data-id="' + id + '"]'); if (!el) return null; const r = el.getBoundingClientRect(), n = this.n().notlar.get(id), s = this.b().gorunum.sayfalar[n.sayfa - 1].el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, sx: r.left - s.left, sy: r.top - s.top, tr: el.style.transform, egim: this.n().yaziEgimi(n.sayfa - 1, n.yazi), sayfa: n.sayfa, k: this.ptPx() }; },
  sayfa(i) { const g = this.b().gorunum, s = g.sayfalar[i - 1], k = g.kaydirici, kk = k.getBoundingClientRect(), r = s.el.getBoundingClientRect();
    const gl = kk.left + k.clientLeft, gt = kk.top + k.clientTop;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, gl, gt, gr: gl + k.clientWidth, gb: gt + k.clientHeight }; },
  // Sayfanın görünen bölümünde, kesirlerle verilen nokta (istemci px, tam sayı)
  nokta(i, fx, fy) { const s = this.sayfa(i); const t = Math.max(s.t, s.gt), b = Math.min(s.b, s.gb), l = Math.max(s.l, s.gl), r = Math.min(s.r, s.gr);
    return [Math.round(l + (r - l) * fx), Math.round(t + (b - t) * fy)]; },
}; return true; })()`;

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, yaz, tus, fare, surukle }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const diyalogKaydi = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const kuyruk = (kanal, yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', ${J(kanal)}, ${J(yanitlar)})`);
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return p.belgeler.size; })()`);
  const ac = async (yol) => {
    const r = await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); return !!b; })()`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(500);
    return r;
  };
  const S = (ifade) => evalJs(`window.__s36.${ifade}`);
  const git = async (n) => { await evalJs(`(window.__pdefe.aktif().gorunum.sayfayaGit(${n}, { aninda: true }), 1)`); await bekle(700); };
  const yazilar = () => S('yazilar()');
  const sayi = async () => (await yazilar()).length;
  const secili = () => evalJs(`window.__s36.n().secili`);
  /** Sahte paste; eklenen yeni yazı (seçili olur) ya da null */
  const yapistir = async (dtIfade = 'undefined', hedef = 'document') => {
    const once = await sayi();
    const onlendi = await evalJs(`window.__s36.yapistir(${dtIfade}, ${hedef})`);
    await bekle(350);
    const sonra = await yazilar();
    const yeni = sonra.length > once ? sonra.find((x) => x.id === (sonra.at(-1).id)) : null;
    const id = yeni ? await secili() : null;
    return { onlendi, eklendi: sonra.length - once, id, not: id ? sonra.find((x) => x.id === id) : null, kutu: id ? await S(`kutu(${J(id)})`) : null };
  };
  const bolumler = (process.env.BOLUM || '1,2,3,4,5,6,7,8,9,10').split(',').map((s) => s.trim());
  const bolum = (n) => bolumler.includes(String(n));

  // ------------------------------------------------------------ hazırlık
  await sekmeleriKapat();
  await bekle(400);
  fs.rmSync(UI, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  fs.mkdirSync(PDF, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  const belge = path.join(PDF, 'yazi-kopya.pdf'), ikinci = path.join(PDF, 'ikinci.pdf');
  execFileSync(PY, ['-X', 'utf8', URET, 'uret', belge], { encoding: 'utf8' });
  fs.copyFileSync(belge, ikinci);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); const ce = console.error; console.error = (...a) => { window.__hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; } return true; })()`);
  await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'otomatikKaydet', false); const a = window.__pdefe.ayar(); a.otomatikKaydet = false; a.yazarAdi = ${J(YAZAR)};
    a.yaziBoyutu = 16; a.yaziRengi = '#c00000'; a.yaziArka = '#fff7c2'; a.yaziTipi = 'Times New Roman'; return true; })()`);
  await evalJs(`(() => { window.__pdefeYerelKutu = true; return true; })()`);
  await evalJs(YARDIMCI);
  await diyalogKaydi();
  await ac(belge);
  const olcekBilgisi = await evalJs(`({ dpr: window.devicePixelRatio, ptPx: window.__s36.ptPx() })`);
  console.log(`Ölçek: devicePixelRatio ${olcekBilgisi.dpr}, 1 pt = ${olcekBilgisi.ptPx.toFixed(3)} CSS px`);
  const PT = olcekBilgisi.ptPx;

  // Kaynak yazı (gerçek fare, 1. sayfa): yazı aracıyla tık, yaz, Esc. Biçim ayardan (Times 16, koyu kırmızı, açık sarı dolgu)
  await git(1);
  await evalJs(`(window.__s36.n().aracSec('yazi'), true)`);
  await tikla(...(await S('nokta(1, 0.12, 0.55)'))); await bekle(400);
  await yaz('Kopyalanacak yazı kutusu');
  await tus('Escape'); await bekle(400);
  const kaynakId = await secili();
  const kaynak = (await yazilar()).find((x) => x.id === kaynakId);
  const kaynakKutu = await S(`kutu(${J(kaynakId)})`);
  sonuc('Kaynak yazı gerçek fareyle yazıldı ve seçili (Times 16, #c00000, dolgu #fff7c2)', kaynak?.icerik === 'Kopyalanacak yazı kutusu' && kaynak?.yazi?.tip === 'Times New Roman'
    && kaynak.yazi.boyut === 16 && kaynak.yazi.renk === '#c00000' && kaynak.yazi.arka === '#fff7c2' && !!kaynakKutu, { kaynak, kaynakKutu });
  // Yapıştırılanların biçimi kopyadan gelmeli, ayardan değil: varsayılan biçim değiştirilir
  await evalJs(`(() => { const a = window.__pdefe.ayar(); a.yaziBoyutu = 12; a.yaziRengi = '#000000'; a.yaziArka = null; a.yaziTipi = 'Arial'; return true; })()`);
  const KW = kaynakKutu.w / PT, KH = kaynakKutu.h / PT;   // kaynağın ekrandaki boyutu, pt (yakınlaştırma değişebilir: karşılaştırma pt cinsinden)
  /** Yapıştırılan yazının kaynağın kopyası olduğu: metin, biçim, boyut, eğim, yazar, PDEfe yazısı (n.yazi) */
  const kopyaMi = (r, egim = 0, w = KW, h = KH) => !!r.not && !!r.kutu && r.not.icerik === 'Kopyalanacak yazı kutusu' && r.not.yazi?.tip === 'Times New Roman' && r.not.yazi.boyut === 16
    && r.not.yazi.renk === '#c00000' && r.not.yazi.arka === '#fff7c2' && yakin(r.kutu.w, w * r.kutu.k) && yakin(r.kutu.h, h * r.kutu.k) && r.kutu.egim === egim && r.not.yazar === YAZAR && !r.not.xref;
  const beklenenler = [];   // kayıttan sonra dosyada aranacak yapıştırılmış yazılar: { id }

  // ------------------------------------------------------------ 1) Kopyala
  let kopya = null;
  if (bolum(1) || true) {
    console.log('\n== 1) Ctrl+C: seçili yazı kutusu');
    kopya = await S('kopyala()');
    let veri = null; try { veri = JSON.parse(kopya.json); } catch { /* */ }
    sonuc('copy olayı engellendi; panoda düz metin ve PDEfe yazısı (özel tür)', kopya.onlendi && kopya.metin === 'Kopyalanacak yazı kutusu' && kopya.turler.includes(TUR), kopya);
    sonuc('Kopyanın verisi: metin, biçim (yazı tipi, boyut, renk, dolgu), eğim 0, kutu pt cinsinden kaynağın ekrandaki boyutu; dosya yolu yok',
      veri && veri.metin === 'Kopyalanacak yazı kutusu' && veri.yazi?.tip === 'Times New Roman' && veri.yazi.boyut === 16 && veri.yazi.renk === '#c00000' && veri.yazi.arka === '#fff7c2'
      && veri.egim === 0 && yakin(veri.wPt, KW, 0.01) && yakin(veri.hPt, KH, 0.01) && !('kaynak' in veri) && !('donus' in veri.yazi) && typeof veri.kimlik === 'string', veri);
    const bildirim = await evalJs(`(() => { const b = document.querySelector('#bildirim'); return b && !b.hidden ? b.textContent : null; })()`);
    sonuc('Bildirim: "Yazı kutusu kopyalandı; tıkladığınız yere Ctrl+V ile yapıştırılır."', bildirim === 'Yazı kutusu kopyalandı; tıkladığınız yere Ctrl+V ile yapıştırılır.', bildirim);
    // Metin seçiliyken metin kopyalanır (yazı seçili olsa da)
    const metinKopyasi = await evalJs(`(() => { const n = window.__s36.n(); n.sec(${J(kaynakId)}); const sp = window.__s36.b().gorunum.sayfalar[0].el.querySelector('.textLayer span[role="presentation"]');
      const r = document.createRange(); r.selectNodeContents(sp); getSelection().removeAllRanges(); getSelection().addRange(r);
      const dt = new DataTransfer(); const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }); document.dispatchEvent(ev);
      const sonuc = { metin: dt.getData('text/plain'), yazi: dt.getData('${TUR}'), secilen: sp.textContent }; getSelection().removeAllRanges(); return sonuc; })()`);
    sonuc('Metin seçiliyken Ctrl+C metni kopyalar (yazı kutusu değil)', metinKopyasi.metin && metinKopyasi.metin.startsWith('Sayfa 1') && !metinKopyasi.yazi, metinKopyasi);
    // Yazı düzenlenirken copy olayına dokunulmaz (düzenleyicinin kendi kopyası)
    const duzenlerken = await evalJs(`(async () => { const n = window.__s36.n(); n.yaziDuzenle(n.notlar.get(${J(kaynakId)})); await new Promise((r) => setTimeout(r, 300));
      const acik = !!n.duzenleyici; const k = window.__s36.kopyala(n.duzenleyici?.el || document); n.duzenleyiciBitir(false); n.sec(${J(kaynakId)}); return { acik, onlendi: k.onlendi, yazi: k.json }; })()`);
    sonuc('Yazı düzenlenirken copy olayı düzenleyicinin (PDEfe yazısı panoya yazılmaz)', duzenlerken.acik && !duzenlerken.onlendi && !duzenlerken.yazi, duzenlerken);
    kopya = await S('kopyala()');   // pano yeniden kaynak yazı
  }

  // ------------------------------------------------------------ 2) Altı sayfa tipi: gerçek tık + yapıştır
  // fx, fy: sayfanın görünen bölümünde boş bir yer (metin satırları döndürülmemiş sayfanın sol üstünde)
  const SAYFALAR = [
    { no: 1, ad: 'A4 dik', fx: 0.15, fy: 0.85 }, { no: 2, ad: 'A4 yatay', fx: 0.6, fy: 0.7 }, { no: 3, ad: '/Rotate 90', fx: 0.3, fy: 0.8 },
    { no: 4, ad: '/Rotate 270, kaydırılmış MediaBox', fx: 0.6, fy: 0.25 }, { no: 5, ad: 'A5', fx: 0.15, fy: 0.75 }, { no: 6, ad: 'A3', fx: 0.4, fy: 0.75 },
  ];
  if (bolum(2)) {
    console.log('\n== 2) Altı sayfa tipinde tıklanan yere yapıştırma');
    for (const s of SAYFALAR) {
      await git(s.no);
      const p = await S(`nokta(${s.no}, ${s.fx}, ${s.fy})`);
      const ustunde = await evalJs(`(() => { const e = document.elementFromPoint(${p[0]}, ${p[1]}); return { sayfa: e?.closest('.sayfa')?.dataset.sayfa || null, not: !!e?.closest('[data-id]') }; })()`);
      await tikla(...p); await bekle(250);
      const r = await yapistir();
      if (r.id) beklenenler.push({ id: r.id });
      sonuc(`${s.ad} (s. ${s.no}): tıklanan noktaya yapıştırıldı (sol üst ±1,5 px), boyut, biçim ve eğim kaynağınki, yazar ayardaki`, ustunde.sayfa === String(s.no) && !ustunde.not
        && r.onlendi && r.eklendi === 1 && r.not?.sayfa === s.no && yakin(r.kutu?.x, p[0]) && yakin(r.kutu?.y, p[1]) && kopyaMi(r) && r.kutu.tr === '', { p, ustunde, r });
    }
    await git(4); await ss('02-rotate270');
    // Metnin üzerine tıklama da "tıklanan yer": A5'in ilk satırı
    await git(5);
    const satir = await evalJs(`(() => { const sp = [...window.__s36.b().gorunum.sayfalar[4].el.querySelectorAll('.textLayer span[role="presentation"]')].find((x) => x.textContent.startsWith('Satır 2'));
      const r = sp.getBoundingClientRect(); return [Math.round(r.left + 30), Math.round(r.top + r.height / 2)]; })()`);
    await tikla(...satir); await bekle(250);
    const r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    sonuc('Metnin üzerine tıklanınca da kutunun sol üstü tıklanan yerde (A5, 2. satır)', r.eklendi === 1 && yakin(r.kutu?.x, satir[0]) && yakin(r.kutu?.y, satir[1]) && kopyaMi(r), { satir, r });
    await ss('02-a5-metin');
  }

  // ------------------------------------------------------------ 3) Yer kuralı ve kayma
  if (bolum(3)) {
    console.log('\n== 3) Sağ üst köşe (18 pt), kayma (12 pt)');
    // sira: aynı köşeye kaçıncı kopya (her biri 12 pt sola ve aşağı)
    const koseBekle = async (no, r, sira = 0) => {
      const s = await S(`sayfa(${no})`), k = await S('ptPx()');
      const sag = Math.min(s.r, s.gr) - (18 + 12 * sira) * k, ust = Math.max(s.t, s.gt) + (18 + 12 * sira) * k;
      return { tamam: r.eklendi === 1 && r.not?.sayfa === no && yakin(r.kutu?.r, sag) && yakin(r.kutu?.y, ust) && kopyaMi(r), sag, ust, r };
    };
    // Aynı yere art arda: A3'e tık, üç kez yapıştır → 0, 12, 24 pt (sağa-aşağı)
    await git(6);
    const p = await S('nokta(6, 0.35, 0.3)');
    await tikla(...p); await bekle(250);
    const ucu = [];
    for (let k = 0; k < 3; k++) { const r = await yapistir(); ucu.push(r); if (r.id) beklenenler.push({ id: r.id }); }
    sonuc('Aynı yere art arda üç kez: her kopya 12 pt sağa ve aşağı kayar', ucu.every((r, k) => r.eklendi === 1 && yakin(r.kutu?.x, p[0] + 12 * r.kutu.k * k) && yakin(r.kutu?.y, p[1] + 12 * r.kutu.k * k) && kopyaMi(r)),
      ucu.map((r) => [r.kutu?.x, r.kutu?.y]));
    await ss('03-kayma');
    // Nota basılınca: o sayfanın görünen sağ üst köşesi (kaynak yazıya tıklanır: seçilir)
    await git(1);
    const kk = await S(`kutu(${J(kaynakId)})`);
    await tikla(Math.round(kk.x + kk.w / 2), Math.round(kk.y + kk.h / 2)); await bekle(250);
    sonuc('Kaynak yazıya tıklanınca seçilir', (await secili()) === kaynakId);
    let r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    let k = await koseBekle(1, r);
    sonuc('Nota basılmışken: sayfanın görünen sağ üst köşesi, sağ ve üst kenardan 18 pt', k.tamam, k);
    r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    k = await koseBekle(1, r, 1);
    sonuc('Köşeye art arda: ikinci kopya 12 pt sola ve aşağı', k.tamam, k);
    await ss('03-kose');
    // Sayfa dışına basılınca (1. sayfanın solundaki gri alan): geçerli sayfanın köşesi
    const s1 = await S('sayfa(1)');
    const disari = [Math.round((s1.gl + s1.l) / 2), Math.round(s1.t + 200)];
    const disHedef = await evalJs(`(() => { const e = document.elementFromPoint(${disari[0]}, ${disari[1]}); return { sayfa: !!e?.closest('.sayfa'), alanda: !!e?.closest('.belge-gorunumu, #belge-alani') }; })()`);
    await tikla(...disari); await bekle(250);
    r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    k = await koseBekle(1, r, 2);
    sonuc('Sayfa dışına (gri alana) basılınca: geçerli sayfanın sağ üst köşesi (aynı köşenin üçüncü kopyası: 24 pt kaymış)', !disHedef.sayfa && k.tamam, { disHedef, k });
    // Tıklanan sayfa görünmüyorsa geçerli sayfanın köşesi: 5. sayfaya tık, 1. sayfaya git
    await git(5);
    await tikla(...(await S('nokta(5, 0.5, 0.9)'))); await bekle(250);
    await git(1);
    r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    k = await koseBekle(1, r, 3);
    sonuc('Tıklanan sayfa (5) görünmüyorken: geçerli sayfanın (1) köşesi (dördüncü kopya: 36 pt)', k.tamam, k);
    // Tıklanan nokta görünmüyor ama sayfa görünüyor: o sayfanın görünen bölümünün köşesi (A3'ün altına tık, yukarı kaydır)
    await git(6);
    const s6 = await S('sayfa(6)');
    const alt = [Math.round(s6.l + s6.w * 0.5), Math.round(Math.min(s6.b, s6.gb) - 40)];
    await tikla(...alt); await bekle(250);
    await evalJs(`(() => { const g = window.__s36.b().gorunum; g.kaydirici.scrollTop -= Math.round(g.kaydirici.clientHeight * 0.6); return 1; })()`); await bekle(500);
    r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    k = await koseBekle(6, r);
    sonuc('Tıklanan nokta görünmüyor, sayfası görünüyor: o sayfanın görünen sağ üst köşesi', k.tamam, k);
    // Tık yokken: yeni sekmede (bu belgede hiç basılmadı) geçerli sayfanın köşesi; kopya başka sekmeden
    await ac(ikinci);
    await git(1);
    r = await yapistir();
    k = await koseBekle(1, r);
    sonuc('Tık yokken (başka sekmeye, hiç basılmamış belge): geçerli sayfanın sağ üst köşesi', k.tamam && (await evalJs(`window.__s36.b().ad`)) === 'ikinci.pdf', k);
    await ss('03-yeni-sekme');
    await evalJs(`(async () => { await window.__pdefe.belgeKapat(window.__s36.b().id, { zorla: true }); return 1; })()`); await bekle(500);
    await kosul(`window.__s36.b()?.ad === 'yazi-kopya.pdf'`);
  }

  // ------------------------------------------------------------ 4) Döndürülmüş ve boş sayfa
  if (bolum(4)) {
    console.log('\n== 4) PDEfe\'de döndürülmüş sayfa (Ctrl+R), boş sayfa, eğik yazının kopyası');
    await git(2);
    await evalJs(`window.__pdefe.komutCalistir('gorunum.dondur', 90)`);
    await kosul(`window.__s36.b().gorunum.tarif()[1]?.dondurme === 90`, 3000); await bekle(500);
    await git(2);
    let p = await S('nokta(2, 0.25, 0.4)');
    await tikla(...p); await bekle(250);
    let r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    sonuc('Ctrl+R ile döndürülmüş A4 yatay (s. 2): tıklanan yer, boyut ve eğim kaynağınki', r.eklendi === 1 && r.not?.sayfa === 2 && yakin(r.kutu?.x, p[0]) && yakin(r.kutu?.y, p[1]) && kopyaMi(r)
      && r.not.yazi.donus === 90, { p, r });
    // Boş sayfa (Sayfaları düzenle'nin "Boş sayfa"sı gibi tarifle; A4)
    await evalJs(`(async () => { const b = window.__s36.b(); await window.__pdefe.sayfaTarifiUygula(b, [...b.gorunum.tarif(), { kaynak: null, genislik: 595, yukseklik: 842, dondurme: 0 }], 'Boş sayfa ekle'); return 1; })()`);
    await kosul(`window.__s36.b().gorunum.sayfaSayisi === 7`, 4000);
    await git(7);
    p = await S('nokta(7, 0.3, 0.3)');
    await tikla(...p); await bekle(250);
    r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    sonuc('Boş sayfa (s. 7): tıklanan yer, boyut ve eğim kaynağınki', r.eklendi === 1 && r.not?.sayfa === 7 && yakin(r.kutu?.x, p[0]) && yakin(r.kutu?.y, p[1]) && kopyaMi(r), { p, r });
    // Eğik yazının kopyası: 1. sayfa döndürülür, üstündeki kaynak yazı sayfayla birlikte döner (eğim 90); kopyası 5. sayfaya eğimiyle
    await git(1);
    await evalJs(`window.__pdefe.komutCalistir('gorunum.dondur', 90)`);
    await kosul(`window.__s36.b().gorunum.tarif()[0]?.dondurme === 90`, 3000); await bekle(500);
    await git(1);
    const egik = await S(`kutu(${J(kaynakId)})`);
    await evalJs(`(window.__s36.n().sec(${J(kaynakId)}), 1)`);
    const egikKopya = await S('kopyala()');
    let ev = null; try { ev = JSON.parse(egikKopya.json); } catch { /* */ }
    await git(5);
    p = await S('nokta(5, 0.2, 0.5)');
    await tikla(...p); await bekle(250);
    r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    sonuc('Döndürülmüş sayfadaki yazı (eğim 90) kopyalanır, 5. sayfada aynı eğim ve ekrandaki boyutla, sol üstü tıklanan yerde', egik?.egim === 90 && ev?.egim === 90
      && r.eklendi === 1 && r.kutu?.egim === 90 && /rotate\(90deg\)/.test(r.kutu?.tr || '') && yakin(r.kutu?.w, egik.w / egik.k * r.kutu.k) && yakin(r.kutu?.h, egik.h / egik.k * r.kutu.k) && yakin(r.kutu?.x, p[0]) && yakin(r.kutu?.y, p[1])
      && r.not?.yazi?.donus === 270, { egik, ev, r });
    await ss('04-egik-kopya');
    // Pano yeniden düz (eğimsiz) bir kopya taşısın: 5. sayfaya 2. bölümde yapıştırılan yazı
    await evalJs(`(() => { const n = window.__s36.n(); const y = window.__s36.yazilar().find((x) => x.sayfa === 5 && x.icerik === 'Kopyalanacak yazı kutusu' && !x.yazi?.donus); n.sec(y.id); window.__s36.kopyala(); return 1; })()`);
  }

  // ------------------------------------------------------------ 5) Başka programın yazısı, başka pencereden gelen kopya, doğrulama
  if (bolum(5)) {
    console.log('\n== 5) Başka programın yazısı; doğrulama');
    await git(1);
    const yabanci = (await yazilar()).find((x) => x.icerik === 'Dosyadaki yazi kutusu');
    const dosyaStili = await evalJs(`(async () => { const n = window.__s36.n().notlar.get(${J(yabanci.id)}); return (await window.pdefe.cagir('cekirdek:cagir', 'freetext_stil', { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa, xref: n.xref }, 1)).stil; })()`);
    const yk = await S(`kutu(${J(yabanci.id)})`);
    // (a) Seçilince biçim önceden okunur: gerçek tık, sonra kopya
    await tikla(Math.round(yk.x + yk.w / 2), Math.round(yk.y + yk.h / 2)); await bekle(600);
    const hazirKopya = await S('kopyala()');
    let hv = null; try { hv = JSON.parse(hazirKopya.json); } catch { /* */ }
    sonuc('Başka programın yazısı seçilince biçimi okunur: kopyada dosyadaki biçim (yazı tipi, boyut, renk, dolgu)', (await secili()) === yabanci.id && hv?.yazi?.boyut === dosyaStili?.boyut
      && hv.yazi.renk === dosyaStili.renk && hv.yazi.arka === dosyaStili.arka && hv.yazi.tip === dosyaStili.tip && hv.metin === 'Dosyadaki yazi kutusu', { hv, dosyaStili });
    await git(6);
    let p = await S('nokta(6, 0.05, 0.5)');
    await tikla(...p); await bekle(250);
    let r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    const yabanciMi = (r2) => r2.not?.icerik === 'Dosyadaki yazi kutusu' && r2.not.yazi?.boyut === dosyaStili.boyut && r2.not.yazi.renk === dosyaStili.renk && r2.not.yazi.arka === dosyaStili.arka
      && yakin(r2.kutu?.w, yk.w / yk.k * r2.kutu.k) && yakin(r2.kutu?.h, yk.h / yk.k * r2.kutu.k) && r2.not.yazar === YAZAR && !r2.not.xref;
    sonuc('Yapıştırılan, PDEfe\'nin kendi yazısı (n.yazi) olarak dosyadaki biçim ve ekrandaki boyutla; yazar ayardaki', r.eklendi === 1 && yabanciMi(r) && yakin(r.kutu.x, p[0]) && yakin(r.kutu.y, p[1]), { r, yk });
    // (b) Biçim okunmadan kopyalanırsa (seçimle aynı anda): kopyada biçim yok, yapıştırırken dosyadan okunur
    await git(1);
    const hemen = await evalJs(`(() => { const n = window.__s36.n(); n._yaziStilleri = new WeakMap(); n.sec(${J(yabanci.id)}); const k = window.__s36.kopyala(); return k.json; })()`);
    let bv = null; try { bv = JSON.parse(hemen); } catch { /* */ }
    await git(6);
    p = await S('nokta(6, 0.15, 0.5)');
    await tikla(...p); await bekle(250);
    r = await yapistir();
    if (r.id) beklenenler.push({ id: r.id });
    sonuc('Biçim okunmadan kopyalanınca (kopyada biçim yok, yol da yok) yapıştırırken dosyadan okunur', bv && bv.yazi === null && !('kaynak' in bv) && r.eklendi === 1 && yabanciMi(r), { bv, r });
    // (c) Başka pencereden gelen biçimsiz kopya (bu pencerenin kopyası değil): varsayılan biçimle (ayardaki Arial 12)
    const disVeri = { ...bv, kimlik: 'baska-pencere' };
    p = await S('nokta(6, 0.25, 0.5)');
    await tikla(...p); await bekle(250);
    r = await yapistir(`window.__s36.dtYap({ 'text/plain': 'x', '${TUR}': ${J(J(disVeri))} })`);
    if (r.id) beklenenler.push({ id: r.id });
    sonuc('Başka pencereden biçimsiz kopya: varsayılan biçimle (Arial 12), tıklanan yere; eğim kaynak sayfanın açısı (90; dosyada metin yönü yok sayılır)', bv?.egim === 90
      && r.eklendi === 1 && r.not?.yazi?.tip === 'Arial' && r.not.yazi.boyut === 12 && yakin(r.kutu?.x, p[0]) && yakin(r.kutu?.y, p[1]) && r.kutu.egim === 90, { bv, r });
    // (d) Doğrulama: sınır dışı ve bozuk veriler (5. sayfanın boş yerine, her deneme geri alınır)
    const temel = { metin: 'Doğrulama', wPt: 120, hPt: 30, yazi: { tip: 'Arial', boyut: 12, renk: '#000000', arka: null, kenarlik: false }, egim: 0, opaklik: 1 };
    await git(5);
    const dene = async (ad, veri, eklenmeli, denetim = () => true) => {
      p = await S('nokta(5, 0.55, 0.85)');
      await tikla(...p); await bekle(200);
      const r2 = await yapistir(`window.__s36.dtYap({ 'text/plain': 'x', '${TUR}': ${J(typeof veri === 'string' ? veri : J(veri))} })`);
      if (r2.id) await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), 1)`);
      await bekle(200);
      sonuc(ad, eklenmeli ? r2.eklendi === 1 && r2.onlendi && denetim(r2) : r2.eklendi === 0 && !r2.onlendi, r2.not || r2);
    };
    await dene('Doğrulama: 20.000 karakteri aşan metin yapıştırılmaz (olaya dokunulmaz)', { ...temel, metin: 'a'.repeat(20001) }, false);
    await dene('Doğrulama: boş metin yapıştırılmaz', { ...temel, metin: '   ' }, false);
    await dene('Doğrulama: 14.400 pt\'yi aşan kutu yapıştırılmaz', { ...temel, wPt: 20000 }, false);
    await dene('Doğrulama: bozuk JSON yapıştırılmaz', '{"metin": "x", ', false);
    await dene('Doğrulama: dizi yapıştırılmaz', '[1, 2]', false);
    await dene('Doğrulama: bilinmeyen yazı tipi → varsayılan, boyut 500 → 200, renk "red" → siyah, dolgu "javascript:" → yok',
      { ...temel, yazi: { tip: 'Comic Sans MS', boyut: 500, renk: 'red', arka: 'javascript:alert(1)', kenarlik: 'evet', parcalar: [{ metin: 'Doğrulama', renk: 'url(x)', kalin: true }] } }, true,
      (r2) => r2.not.yazi.tip === 'Arial' && r2.not.yazi.boyut === 200 && r2.not.yazi.renk === '#000000' && r2.not.yazi.arka === null && r2.not.yazi.kenarlik === false
        && r2.not.yazi.parcalar.length === 1 && r2.not.yazi.parcalar[0].kalin === true && !r2.not.yazi.parcalar[0].renk);
    await dene('Doğrulama: boyut 1 → 4, opaklık 7 → 1, eğim 45 → 0 ya da 90 (çeyrek dönüş)', { ...temel, yazi: { ...temel.yazi, boyut: 1 }, opaklik: 7, egim: 45 }, true,
      (r2) => r2.not.yazi.boyut === 4 && [0, 90].includes(r2.kutu.egim));
    // Panoda PDEfe yazısı yok: olaya dokunulmaz (eski davranış)
    const sade = await yapistir(`window.__s36.dtYap({ 'text/plain': 'yalnızca metin' })`);
    sonuc('Panoda yalnızca düz metin: not eklenmez, paste olayı engellenmez', sade.eklendi === 0 && !sade.onlendi, sade);
    // Pano yeniden kaynak yazının kopyası
    await evalJs(`(() => { const n = window.__s36.n(); const y = window.__s36.yazilar().find((x) => x.sayfa === 5 && x.icerik === 'Kopyalanacak yazı kutusu' && !x.yazi?.donus); n.sec(y.id); window.__s36.kopyala(); return 1; })()`);
  }

  // ------------------------------------------------------------ 6) Yapıştırılan PDEfe'nin yazısı: düzenle, taşı, sil, geri al
  if (bolum(6)) {
    console.log('\n== 6) Yapıştırılan yazı: çift tık düzenle, taşı, Delete, Ctrl+Z');
    await git(3);
    const p = await S('nokta(3, 0.55, 0.55)');
    await tikla(...p); await bekle(250);
    const r = await yapistir();
    const id = r.id;
    sonuc('Yapıştırıldı (s. 3)', r.eklendi === 1 && kopyaMi(r), r);
    const k = await S(`kutu(${J(id)})`);
    await tikla(Math.round(k.x + k.w / 2), Math.round(k.y + k.h / 2), { tiklama: 2 }); await bekle(500);
    const ed = await evalJs(`(() => { const d = window.__s36.n().duzenleyici; return d ? { id: d.not.id, metin: d.el.textContent, odak: d.el.contains(document.activeElement) || document.activeElement === d.el } : null; })()`);
    sonuc('Çift tık: yazı düzenleyicisi o yazıyla açılır (metin ve odak düzenleyicide)', ed?.id === id && ed.metin === 'Kopyalanacak yazı kutusu' && ed.odak, ed);
    // Düzenlerken paste not eklemez: düzenleyicinin kendi yapıştırması panodaki düz metni imlecin yerine yazar
    const once = await sayi();
    await evalJs(`window.__s36.yapistir(undefined, window.__s36.n().duzenleyici.el)`); await bekle(300);
    const edMetin = await evalJs(`window.__s36.n().duzenleyici?.el.textContent ?? null`);
    sonuc('Yazı düzenlenirken paste yeni yazı eklemez; düzenleyici panodaki düz metni yazar', (await sayi()) === once && (edMetin || '').split('Kopyalanacak').length === 3, edMetin);
    await tus('End'); await yaz(' (düzenlendi)');
    await tus('Escape'); await bekle(400);
    const duzenli = (await yazilar()).find((x) => x.id === id);
    sonuc('Esc: düzenleme uygulanır, düzenleyici kapanır, yazı seçili kalır', duzenli?.icerik === edMetin + ' (düzenlendi)' && !(await evalJs(`!!window.__s36.n().duzenleyici`)) && (await secili()) === id, duzenli);
    await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), 1)`); await bekle(300);
    sonuc('Geri al: düzenleme geri alınır, yapıştırılan kalır', (await yazilar()).find((x) => x.id === id)?.icerik === 'Kopyalanacak yazı kutusu');
    // Taşıma (gerçek sürükleme)
    const k2 = await S(`kutu(${J(id)})`);
    await surukle(Math.round(k2.x + 20), Math.round(k2.y + k2.h / 2), Math.round(k2.x + 80), Math.round(k2.y + k2.h / 2 + 50)); await bekle(400);
    const k3 = await S(`kutu(${J(id)})`);
    sonuc('Sürükleyerek taşınır (60, 50 px)', yakin(k3?.x - k2.x, 60, 2) && yakin(k3?.y - k2.y, 50, 2), { k2, k3 });
    await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), 1)`); await bekle(300);
    // Delete ve Ctrl+Z (gerçek tuşlar; panoya dokunmaz)
    await evalJs(`(window.__s36.n().sec(${J(id)}), window.__s36.b().gorunum.kaydirici.focus(), 1)`);
    const sil0 = await sayi();
    await tus('Delete'); await bekle(300);
    const sil1 = await sayi();
    await tus('z', ['ctrl']); await bekle(300);
    const sil2 = await sayi();
    await tus('z', ['ctrl']); await bekle(300);
    const sil3 = await sayi();
    sonuc('Delete siler; Ctrl+Z silmeyi, ikinci Ctrl+Z yapıştırmayı geri alır', sil1 === sil0 - 1 && sil2 === sil0 && sil3 === sil0 - 1 && !(await yazilar()).some((x) => x.id === id), { sil0, sil1, sil2, sil3 });
    const geriListe = await evalJs(`window.__s36.b().yigin.geriAlinacak?.ad ?? null`);
    await tus('y', ['ctrl']); await bekle(300);
    const yinele = (await yazilar()).some((x) => x.id === id);
    sonuc('Ctrl+Y yapıştırmayı yineler; geri al listesinde adı "Yazı yapıştır"', yinele && (await evalJs(`window.__s36.b().yigin.geriAlinacak?.ad`)) === 'Yazı yapıştır', { geriListe, yinele });
    beklenenler.push({ id });
  }

  // ------------------------------------------------------------ 7) Paste'in not eklemediği yerler
  if (bolum(7)) {
    console.log('\n== 7) Sayfaları düzenle, Bul kutusu');
    await git(1);
    await tikla(...(await S('nokta(1, 0.5, 0.5)'))); await bekle(200);
    await evalJs(`window.__pdefe.komutCalistir('arac.sayfalar')`);
    await kosul(`!!document.querySelector('.arac-ortusu .sayfalar-izgara, .arac-ortusu')`, 6000); await bekle(800);
    let once = await sayi();
    const onlendiS = await evalJs(`window.__s36.yapistir()`); await bekle(300);
    sonuc('Sayfaları düzenle açıkken paste belgeye yazı eklemez (olaya dokunulmaz)', (await sayi()) === once && !onlendiS, { onlendiS });
    await evalJs(`document.querySelector('.arac-pencere .arac-kapat')?.click()`);
    await kosul(`!document.querySelector('.arac-ortusu')`, 4000); await bekle(400);
    // Görüntü / PDF birleştir'in Ctrl+V'si ("Panodan ekle") kendi tuşudur: belgenin paste dinleyicisi açık pencerede olaya dokunmaz
    await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir')`);
    await kosul(`!!document.querySelector('.arac-ortusu')`, 6000); await bekle(800);
    once = await sayi();
    const listeOnce = await evalJs(`document.querySelectorAll('.arac-pencere .birlestir-oge').length`);
    const onlendiB = await evalJs(`window.__s36.yapistir(undefined, document.querySelector('.arac-pencere') || document)`); await bekle(300);
    const listeSonra = await evalJs(`document.querySelectorAll('.arac-pencere .birlestir-oge').length`);
    sonuc('Görüntü / PDF birleştir açıkken paste belgeye yazı eklemez, pencerenin listesi değişmez', (await sayi()) === once && !onlendiB && listeSonra === listeOnce, { onlendiB, listeOnce, listeSonra });
    if (listeSonra) await kuyruk('mesaj:kutu', [{ secim: 1, onay: false }]);   // listede açık belge var: "kaydedilsin mi?" → Kaydetme
    await evalJs(`document.querySelector('.arac-pencere .arac-kapat')?.click()`);
    await kosul(`!document.querySelector('.arac-ortusu')`, 4000); await bekle(400);
    await evalJs(`(window.__pdefe.komutCalistir('duzen.bul', 'yazı'), 1)`); await bekle(400);
    once = await sayi();
    const bul = await evalJs(`(() => { const g = document.querySelector('#bul-girdi'); g.focus(); return { odak: document.activeElement === g, onlendi: window.__s36.yapistir(undefined, g) }; })()`); await bekle(300);
    sonuc('Bul kutusundayken paste yazı eklemez (girdinin kendi yapıştırması)', bul.odak && !bul.onlendi && (await sayi()) === once, bul);
    await tus('Escape'); await bekle(300);
  }

  // ------------------------------------------------------------ 8) Sağ tık menüsü ve F1
  if (bolum(8)) {
    console.log('\n== 8) Sağ tık › Kopyala / Yapıştır, F1');
    await evalJs(`(() => { const orj = document.execCommand.bind(document); window.__s36.orjExec = orj;
      document.execCommand = (k, ...a) => { if (k === 'copy') { window.__s36.kopyala(); return true; } return orj(k, ...a); }; return 1; })()`);
    const sagTik = async (x, y, secim = null, pano = null) => {
      await diyalogKaydi();
      if (pano != null) await kuyruk('pano:oku', [pano]);
      await kuyruk('menu:popup', [secim]);
      await tikla(x, y, { dugme: 'right' }); await bekle(500);
      const kayit = await diyalogKaydi();
      return { menu: kayit.filter((d) => d.kanal === 'menu:popup').at(-1)?.secenek || null, panoOkundu: kayit.some((d) => d.kanal === 'pano:oku') };
    };
    await git(1);
    // Yazının üzerinde: Kopyala etkin, Yapıştır hemen altında; Kopyala o yazıyı kopyalar ve seçer
    await evalJs(`(window.__s36.n().sec(null), 1)`);
    const kk = await S(`kutu(${J(kaynakId)})`);
    let m = await sagTik(Math.round(kk.x + kk.w / 2), Math.round(kk.y + kk.h / 2), 'kopyala', 'başka bir şey');
    const mm = menuMetni(m.menu);
    const menuKopya = await evalJs(`(() => { const dt = window.__s36.dt; return { metin: dt.getData('text/plain'), json: dt.getData('${TUR}') }; })()`);
    sonuc('Yazının üzerinde sağ tık: Kopyala etkin (ilk), Yapıştır hemen altında; son grup Tümünü seç / Kaydet / Yazdır yerinde', mm?.[0] === 'Kopyala' && /^Yapıştır/.test(mm?.[1] || '')
      && mm.at(-1) === 'Yazdır' && mm.at(-3) === '-' && mm.at(-4) === 'Tümünü seç', mm);
    sonuc('Pano başka metin taşıyorken Yapıştır soluk', mm?.[1] === 'Yapıştır (devre dışı)', mm);
    sonuc('Sağ tık › Kopyala o yazıyı kopyalar ve seçer', menuKopya.metin === 'Kopyalanacak yazı kutusu' && JSON.parse(menuKopya.json || 'null')?.egim === 90 && (await secili()) === kaynakId, menuKopya);
    // Boş yerde: metin seçili değilken Kopyala soluk; pano kopyayı taşıyorsa Yapıştır etkin ve sağ tıklanan yere yapıştırır (/Rotate 270
    // sayfası: eğim 90'lık kopyanın metin yönü 180 olur)
    await git(4);
    const p = await S('nokta(4, 0.8, 0.6)');
    await evalJs(`(window.__s36.n().sec(null), 1)`);
    const once = await sayi();
    m = await sagTik(p[0], p[1], 'yapistir', 'Kopyalanacak yazı kutusu');
    const m2 = menuMetni(m.menu);
    await bekle(300);
    const sonra = await yazilar(), yeniId = await secili(), yeniKutu = yeniId ? await S(`kutu(${J(yeniId)})`) : null;
    if (yeniId) beklenenler.push({ id: yeniId });
    sonuc('Boş yerde sağ tık: Kopyala soluk, Yapıştır etkin (pano bu kopyayı taşıyor; pano:oku sorulur)', m2?.[0] === 'Kopyala (devre dışı)' && m2?.[1] === 'Yapıştır' && m.panoOkundu, m2);
    sonuc('Sağ tık › Yapıştır sağ tıklanan yere (eğik kopya: eğim 90, /Rotate 270 sayfada metin yönü 180)', sonra.length === once + 1 && yakin(yeniKutu?.x, p[0]) && yakin(yeniKutu?.y, p[1])
      && yeniKutu?.egim === 90 && sonra.find((x) => x.id === yeniId)?.yazi?.donus === 180, { p, yeniKutu });
    await evalJs(`(() => { document.execCommand = window.__s36.orjExec; return 1; })()`);
    // F1
    await evalJs(`(window.__pdefe.komutCalistir('yardim.kisayollar'), 1)`); await bekle(400);
    const f1 = await evalJs(`(() => { const o = [...document.querySelectorAll('.diyalog-ortusu')].at(-1); if (!o) return null; let ad = null; const b = {};
      for (const tr of o.querySelectorAll('table.kisayollar tr')) { if (tr.classList.contains('bolum')) { ad = tr.textContent.trim(); b[ad] = []; continue; } if (ad) b[ad].push([[...tr.cells[0].querySelectorAll('kbd')].map((k) => k.textContent).join(' | '), tr.cells[1]?.textContent]); }
      return b['Yazı kutusu'] || null; })()`);
    sonuc('F1 "Yazı kutusu": Ctrl+C / Ctrl+V — Seçili yazı kutusunu kopyala / tıklanan yere yapıştır', J(f1?.at(-1)) === J(['Ctrl+C / Ctrl+V', 'Seçili yazı kutusunu kopyala / tıklanan yere yapıştır']), f1);
    await tus('Escape'); await bekle(300);
  }

  // ------------------------------------------------------------ 9) Kayıt ve PyMuPDF ile denetim
  if (bolum(9)) {
    console.log('\n== 9) Kaydet, PyMuPDF ile kutu ve metin yönü');
    const model = await evalJs(`(async () => { const b = window.__s36.b(), n = b.notlar, g = b.gorunum, k = n.ptPx(); const liste = [];
      for (const x of n.notlar.values()) { if (x.tur !== 'FreeText' || x.silindi || !x.yazi) continue; const i = x.sayfa - 1; await g.sayfaAl(i);
        const r = n.rectToPx(i, x.rect); liste.push({ id: x.id, sayfa: x.sayfa, ekran: [r.x / k, r.y / k, (r.x + r.w) / k, (r.y + r.h) / k], donus: x.yazi.donus || 0, egim: n.yaziEgimi(i, x.yazi), aci: n.sayfaAcisi(i), metin: x.icerik, tip: x.yazi.tip, boyut: x.yazi.boyut }); }
      return liste; })()`);
    await evalJs(`(async () => { await window.__pdefe.belgeKaydet(window.__s36.b()); return 1; })()`);
    await kosul(`(() => { const b = window.__s36.b(); return b && !b.degisti && !b.kaydediliyor; })()`, 15000);
    await bekle(500);
    const sorular = (await diyalogKaydi()).filter((d) => d.kanal === 'mesaj:kutu');
    sonuc('Kaydedildi (soru sorulmadı)', !(await evalJs(`window.__s36.b().degisti`)) && sorular.length === 0, sorular);
    const dosya = JSON.parse(execFileSync(PY, ['-X', 'utf8', URET, 'olc', belge], { encoding: 'utf8' }));
    const eslesme = model.map((m) => {
      const aday = dosya.filter((d) => d.sayfa === m.sayfa && d.pdefe).sort((a, b) => Math.hypot(a.ekran[0] - m.ekran[0], a.ekran[1] - m.ekran[1]) - Math.hypot(b.ekran[0] - m.ekran[0], b.ekran[1] - m.ekran[1]))[0];
      const ok = !!aday && m.ekran.every((v, j) => yakin(v, aday.ekran[j], 1)) && aday.donus === m.donus && aday.aci === m.aci && (aday.aci - aday.donus + 360) % 360 === m.egim
        && aday.metin === m.metin && aday.tip === m.tip && aday.boyut === m.boyut && aday.yazar === YAZAR;
      return { ok, m, aday };
    });
    const yapistirilanlar = beklenenler.filter((b) => model.some((m) => m.id === b.id));
    sonuc(`Dosyada her yazı (${model.length}; yapıştırılan ${yapistirilanlar.length}) beklenen sayfada, ekrandaki kutusu (±1 pt), metin yönü (/Matrix = açı − eğim), yazı tipi, boyut, yazar`,
      eslesme.length > 0 && eslesme.every((e) => e.ok) && yapistirilanlar.length >= 15, eslesme.filter((e) => !e.ok).slice(0, 4));
    const donusler = [...new Set(model.map((m) => m.donus))].sort((a, b) => a - b);
    sonuc('Metin yönleri dört açıyı da kapsıyor (0, 90, 180, 270): döndürülmüş, yatay, kaydırılmış MediaBox\'lı sayfalar', J(donusler) === J([0, 90, 180, 270]), donusler);
    const yabanciDosyada = dosya.find((d) => d.metin === 'Dosyadaki yazi kutusu' && !d.pdefe);
    sonuc('Başka programın yazısı dosyada değişmeden duruyor (PDEfe kaydı yok)', !!yabanciDosyada, dosya.filter((d) => !d.pdefe));
  }

  // ------------------------------------------------------------ 10) Ölçüm: basış başına eklenen iş
  if (bolum(10)) {
    console.log('\n== 10) Ölçüm');
    const olcum = await evalJs(`(() => { const n = window.__s36.n(), g = window.__s36.b().gorunum, s = g.sayfalar[g.gecerli - 1], sp = s.el.querySelector('.textLayer span') || s.el;
      const r = sp.getBoundingClientRect(), e = { target: sp, clientX: r.left + 2, clientY: r.top + 2 };
      for (let i = 0; i < 200; i++) n.tikKaydet(e);
      const N = 5000, t0 = performance.now(); for (let i = 0; i < N; i++) n.tikKaydet(e); const t = (performance.now() - t0) / N;
      return { mikroSaniye: Math.round(t * 1000 * 10) / 10 }; })()`);
    console.log(`  tikKaydet (basış başına): ${olcum.mikroSaniye} µs`);
    sonuc('Basış başına eklenen iş 50 µs altında (fare hareketi izlenmez)', olcum.mikroSaniye < 50, olcum);
  }

  const hatalar = await evalJs(`window.__hatalar || []`);
  sonuc('Sayfada hata yok', hatalar.length === 0, hatalar);
  await sekmeleriKapat();
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti, ${hataSayisi} hata`);
  if (hataSayisi) process.exitCode = 1;
}
