// Sığdırma kararlılığı (0.1.20): sığdırma modlarında yerleşim kendi çıkardığı kaydırma çubuğuyla döngüye girmemeli, gereksiz kaydırma
// çubuğu çıkarmamalı.
//   - Kararsız aralık: çubuksuz ölçekte içerik görünüme sığmıyor, çubuk yer alınca küçülen ölçekte sığıyor (ör. yatay iki sayfalık
//     belge, ekranın yarısını kaplayan pencere). 0.1.19'da bu aralıkta çubuk çıkıp kalkıyor, görüntü durmadan %81 ↔ %82 arasında gidip
//     geliyordu.
//   - İki sayfa düzeni: sığdırılan çiftin iki sayfası da yarım piksel yukarı yuvarlanınca çift 1 px taşıyor, yatay çubuk çıkıyordu.
//   - Kesirli boyutlar: ekran ölçeği 1 değilken görünümün gerçek boyutu CSS pikselinin kesri olabilir; yuvarlanmış boyuta kurulan alan
//     gerçek kutudan taşıp gereksiz çubuk çıkarıyordu.
// Test görünümün boyutunu kaydırıcının sağ / alt kenarını oynatarak değiştirir (pencere boyutu değişmiş gibi ResizeObserver çalışır),
// her boyutta yerleşimin durulduğunu, ölçeğin tek değerde kaldığını ve kaydırma çubuklarının yerleşimin öngördüğü gibi olduğunu ölçer.
// Kullanım (ekran dışındaki örnek yeter; boyutlar 1000×720'lik görünüme göredir, görünüm küçükse aynı oranda küçültülür, en az 600×432):
//   powershell -NoProfile -ExecutionPolicy Bypass -File test\baslat.ps1 -Port 9441 -Veri "%TEMP%\pdefe-sk-9441" [-Olcek 1.25]
//   $env:PDEFE_CDP_PORT=9441; node test\surucu.mjs betik test\sigdirma_kararli.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Üç ekran ölçeğinde de koşulmalı (-Olcek vermeden, -Olcek 1.25, -Olcek 1.5): kesirli boyutlar ancak 1'den farklı ölçekte oluşur,
// iki sayfa düzenindeki 1 px'lik taşma ancak ölçek 1'de.
// Belgeler: .venv'deki PyMuPDF ile test/cikti/sk/<zaman>/pdf altına üretilir (test/pdf'e ve başka dosyaya yazılmaz).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 'sk', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PDF = path.join(K, 'pdf');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, denetimSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetimSayisi++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

// yatay2: iki yatay, basık sayfa (ikisi birden görünüme sığabilir; bildirilen belgenin sayfa boyutu); dikey1: tek A4; dikey12: uzun
// belge; karisik3: baskın genişlikten geniş bir sayfa (genişliğe sığdırmada yana taşar, yatay kaydırma çubuğu çıkar). Sayfalarda
// kenardan içeride çerçeve ve yazı: "Görünür alana sığdır" içerik kutusunu sayfadan dar bulsun.
const BELGELER = ['yatay2.pdf', 'dikey1.pdf', 'dikey12.pdf', 'karisik3.pdf'];
const URET = `
import sys, pymupdf
def uret(ad, boyutlar):
    d = pymupdf.open()
    for i, (w, h) in enumerate(boyutlar):
        p = d.new_page(width=w, height=h)
        p.draw_rect(pymupdf.Rect(50, 50, w - 50, h - 50), color=(0.2, 0.3, 0.6), width=2)
        p.insert_text((70, 100), 'Sayfa %d' % (i + 1), fontsize=28)
    d.save(sys.argv[1] + '/' + ad)
uret('yatay2.pdf', [(845.4, 382.2)] * 2)
uret('dikey1.pdf', [(595, 842)])
uret('dikey12.pdf', [(595, 842)] * 12)
uret('karisik3.pdf', [(600, 300), (850, 300), (600, 300)])
`;

// Sayfada çalışır: görünümü W × H yapar, yerleşimin durulmasını bekler, durumu ölçer.
const SAYFA_KODU = `
  window.__sk = (() => {
    const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
    const g = () => window.__pdefe.aktif().gorunum;
    // Kaydırıcının gerçek boyutu tam W × H olur (üst öğenin gerçek, kesirli olabilen boyutundan hesaplanan kenar boşluklarıyla)
    const boyut = (W, H) => { const k = g().kaydirici, u = k.parentElement.getBoundingClientRect(); k.style.right = (u.width - W) + 'px'; k.style.bottom = (u.height - H) + 'px'; };
    // W × H: kaydırıcının dış boyutu (tam sayıya yuvarlanmış); cw × ch: görünür boyut (çubuklar düşülmüş); gw: gerçek (kesirli) görünür
    // genişlik; sw × sh: kaydırılan içerik; alanW × alanH: yerleşimin tuval alanına verdiği boyut; sol / sag: sayfaların alandaki uçları
    const olc = () => { const v = g(), k = v.kaydirici, a = v.alan, yerler = v.yerlesim.filter(Boolean), kr = k.getBoundingClientRect();
      return { olcek: v.olcek, W: k.offsetWidth, H: k.offsetHeight, cw: k.clientWidth, ch: k.clientHeight, sw: k.scrollWidth, sh: k.scrollHeight,
        gw: kr.width - (k.offsetWidth - k.clientWidth), gercek: [+kr.width.toFixed(3), +kr.height.toFixed(3)],
        alanW: parseFloat(a.style.width), alanH: parseFloat(a.style.height), sol: Math.min(...yerler.map((y) => y.x)), sag: Math.max(...yerler.map((y) => y.x + y.w)) }; };
    const say = (v) => { const s = { n: 0 }; s.isle = () => s.n++; v.addEventListener('yerlesim', s.isle); s.birak = () => v.removeEventListener('yerlesim', s.isle); return s; };
    // Durulma: boyut değişince gelen yerleşimden sonra 150 ms yerleşim yok (400 ms'de hiç yerleşim gelmediyse değişecek bir şey yoktur).
    // En çok 'sure' ms beklenir; durulmadıysa false.
    const durul = async (sure = 1500) => { const s = say(g()), t0 = performance.now(); let n = 0, son = t0;
      try { for (;;) { await bekle(20); const simdi = performance.now();
        if (s.n !== n) { n = s.n; son = simdi; }
        if (n ? simdi - son >= 150 : simdi - t0 >= 400) return true;
        if (simdi - t0 > sure) return false; } } finally { s.birak(); } };
    // Gözlem: 'sure' ms boyunca yerleşim olayları ve görülen ölçekler
    const gozle = async (sure) => { const v = g(), s = say(v), olcekler = new Set(), t0 = performance.now();
      while (performance.now() - t0 < sure) { olcekler.add(v.olcek); await bekle(10); }
      s.birak(); return { olay: s.n, olcekler: [...olcekler] }; };
    const dene = async (W, H, sure) => { boyut(W, H); const duruldu = await durul(); const gz = await gozle(sure); return { ...olc(), duruldu, ...gz }; };
    return { boyut, olc, durul, gozle, bekle, say,
      temizle: () => { const k = g().kaydirici; k.style.right = ''; k.style.bottom = ''; },
      async tara(W, basH, sonH, sure) { const r = []; for (let H = basH; H <= sonH; H++) r.push(await dene(W, H, sure)); return r; },
      async taraGenislik(basW, sonW, H, sure) { const r = []; for (let W = basW; W <= sonW; W++) r.push(await dene(W, H, sure)); return r; },
      // Kesirli boyutlar: W ve H cihaz pikseli adımlarıyla büyür (ekran ölçeği 1 değilse CSS pikselinin kesirleri). Her boyutta önce
      // 'once' modu (null: çubuksuz durum, en küçük ölçek), sonra 'mod' kurulur: önceki durumun çubukları sonucu etkilememeli.
      async kesirli(duzen, once, mod, W0, H0) { const v = g(), d = devicePixelRatio, r = [];
        for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) {
          boyut(W0 + i / d, H0 + (7 * j) / d);
          v.duzenAyarla(duzen, false);
          if (once) await v.zoomModuAyarla(once); else v.zoomAyarla(0.25);
          await bekle(140);
          await v.zoomModuAyarla(mod); await bekle(200);
          const gz = await gozle(140);
          r.push({ ...olc(), ...gz });
        }
        return r; } };
  })(); true`;

export default async function ({ evalJs, bekle }) {
  const G = 'window.__pdefe.aktif().gorunum';
  const hepsiniKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  const ac = async (ad) => { await hepsiniKapat(); await evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ad))}).then(() => new Promise((r) => setTimeout(() => r(true), 800)))`); };
  // Düzen ve sığdırma modu doğrudan görünümde ayarlanır (genel düzen ayarı değişmesin)
  const kur = async (duzen, mod) => { await evalJs(`(async () => { const g = ${G}; g.duzenAyarla(${J(duzen)}, false); await g.zoomModuAyarla(${J(mod)}); return true; })()`); await bekle(250); };
  const dikeyCubuk = (s) => s.cw < s.W, yatayCubuk = (s) => s.ch < s.H;

  // ---------------------------------------------------------------- hazırlık
  fs.mkdirSync(PDF, { recursive: true });
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), ['-c', URET, PDF.replace(/\\/g, '/')], { stdio: 'pipe' });
  for (const ad of BELGELER) if (!fs.existsSync(path.join(PDF, ad))) throw new Error('Deneme PDF\'i üretilemedi: ' + ad);
  await hepsiniKapat();
  await evalJs(`(() => { window.__skHatalar = []; addEventListener('error', (e) => window.__skHatalar.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__skHatalar.push(String(e.reason?.message || e.reason))); return true; })()`);
  await evalJs(`(async () => { if (window.__pdefe.panel.acik) window.__pdefe.panel.acKapa(false); return true; })()`);
  await evalJs(SAYFA_KODU);

  await ac('yatay2.pdf');
  const alan = await evalJs(`(() => { const u = ${G}.kaydirici.parentElement; return { w: u.clientWidth, h: u.clientHeight, dpr: devicePixelRatio }; })()`);
  // Boyutlar 1000×720'lik görünüme göre; görünüm küçükse (yüksek ekran ölçeği, küçük pencere) aynı oranda küçültülür
  const oran = Math.min(1, (alan.w - 1) / 1000, (alan.h - 1) / 720);
  const B = (px) => Math.round(px * oran);
  const YUKSEK = B(720), ALCAK = 90;
  if (!sonuc(`Görünüm alanı yeterli (${alan.w}×${alan.h}, ekran ölçeği ${alan.dpr}; en az 600×432)`, oran >= 0.6, alan)) { process.exitCode = 1; return; }

  /**
   * Açık belge için W genişliğinde kararsız aralığı bulur ve tarar. c1: içerik sığacak kadar yüksek görünümde içerik yüksekliği (dikey
   * çubuk yok), c2: alçak görünümde (dikey çubuk var; çubuk ölçeği küçültüyorsa c2 < c1). Aralığın 4 px altından 16 px üstüne (yatay
   * çubuğun kapladığı yer dahil) her yükseklik denenir; aralik verilirse o yükseklikler (ölçeği yüksekliğe de bağlı olan "Sayfaya
   * sığdır"da alçak görünümün içerik yüksekliği aralığın ucu değildir). Döner: { s1, s2, c1, c2, cubuk, bas, son, satirlar }.
   */
  const aralikTara = async (ad, W, aralik = null) => {
    const uc = async (H) => { await evalJs(`(async () => { __sk.boyut(${W}, ${H}); await __sk.durul(); return true; })()`); return evalJs(`__sk.olc()`); };
    const yuksek = await uc(YUKSEK), alcak = await uc(ALCAK);
    const c1 = yuksek.alanH, c2 = alcak.alanH;
    if (!sonuc(`${ad}, genişlik ${W}: içerik ${YUKSEK} px yükseklikte çubuksuz sığıyor, ${ALCAK} px'te sığmıyor (tarama anlamlı)`, !dikeyCubuk(yuksek) && dikeyCubuk(alcak), { yuksek, alcak })) return null;
    const [bas, son] = aralik || [Math.max(ALCAK + 10, Math.floor(Math.min(c1, c2)) - 4), Math.min(YUKSEK, Math.ceil(Math.max(c1, c2)) + 16)];
    const satirlar = await evalJs(`__sk.tara(${W}, ${bas}, ${son}, 200)`);
    const kararsiz = satirlar.filter((r) => !r.duruldu || r.olay > 0 || r.olcekler.length > 1);
    sonuc(`  ${bas}–${son} px yüksekliklerin (${satirlar.length}) hepsinde yerleşim duruluyor, ölçek tek değerde`, kararsiz.length === 0,
      kararsiz.slice(0, 4).map((r) => `${r.H}: ${r.duruldu ? '' : 'durulmadı, '}${r.olay} yerleşim, %${r.olcekler.map((o) => (o * 100).toFixed(1)).join('/%')}`).join('; ') + (kararsiz.length > 4 ? ` … (${kararsiz.length} yükseklik)` : ''));
    // Kaydırma çubuğu ancak o yönde taşma varsa; taşmayan içerikte alan görünür genişliği kaplar (gerçek genişliği aşmadan, en çok
    // 1 px dar) ve iki yandaki boşluk eşit (yerleşimin öngördüğü görünür boyut gerçekle aynı: sayfalar görünür alanın ortasında)
    const tutarsiz = satirlar.filter((r) => (r.sw > r.cw) !== yatayCubuk(r) || (r.sh > r.ch) !== dikeyCubuk(r) || (r.sw <= r.cw && !(r.alanW <= r.gw + 1e-6 && r.gw - r.alanW < 1)) || Math.abs(r.sol - (r.alanW - r.sag)) > 1);
    sonuc('  kaydırma çubukları yalnızca taşma varken, sayfalar görünür alanda ortalı', tutarsiz.length === 0,
      tutarsiz.slice(0, 3).map((r) => J({ H: r.H, cw: r.cw, ch: r.ch, gw: r.gw, sw: r.sw, sh: r.sh, alanW: r.alanW, alanH: r.alanH, sol: r.sol, sag: r.sag })).join('; ') + (tutarsiz.length > 3 ? ` … (${tutarsiz.length} yükseklik)` : ''));
    return { s1: yuksek.olcek, s2: alcak.olcek, c1, c2, cubuk: alcak.W - alcak.cw, bas, son, satirlar };
  };

  // ---------------------------------------------------------------- 1. Yatay iki sayfa, genişliğe sığdır (bildirilen durum)
  const genislikAraligi = {};   // genişlik → taranan yükseklik aralığı
  for (const W of [B(760), B(600)]) {
    await kur('surekli', 'genislik');
    const r = await aralikTara('Yatay iki sayfa, kaydırmalı, genişliğe sığdır', W);
    if (!r) continue;
    genislikAraligi[W] = [r.bas, r.son];
    sonuc(`  dikey çubuk ölçeği küçültüyor (çubuk ${r.cubuk} px; çubuksuz %${(r.s1 * 100).toFixed(2)}, çubuklu %${(r.s2 * 100).toFixed(2)})`, r.cubuk > 0 && r.s2 < r.s1 && r.c2 < r.c1, { s1: r.s1, s2: r.s2, c1: r.c1, c2: r.c2, cubuk: r.cubuk });
    // Kural: çubuksuz ölçekte içerik sığıyorsa (1 px'e kadar taşma sayılmaz, kenar boşluğu karşılar) o ölçek; sığmıyorsa çubuklu
    // ölçek. Çubuklu ölçekte içerik sığıyorsa çubuk çıkmaz (sayfalar çubuk kadar dar, ortada).
    const sigar = (icerik, H) => icerik - H <= 1;
    const yanlis = r.satirlar.filter((s) => Math.abs(s.olcek - (sigar(r.c1, s.H) ? r.s1 : r.s2)) > 1e-9);
    sonuc('  ölçek kuralı: içerik çubuksuz sığıyorsa büyük ölçek, sığmıyorsa çubuklu (küçük) ölçek', yanlis.length === 0, yanlis.slice(0, 4).map((s) => `${s.H}: %${(s.olcek * 100).toFixed(2)}`).join('; '));
    const arada = r.satirlar.filter((s) => !sigar(r.c1, s.H) && sigar(r.c2, s.H));
    sonuc(`  kararsız aralıkta (${arada.length} yükseklik) kaydırma çubuğu yok`, arada.length >= 8 && arada.every((s) => !dikeyCubuk(s) && !yatayCubuk(s) && s.sh <= s.ch && s.sw <= s.cw), arada.slice(0, 3).map((s) => J({ H: s.H, cw: s.cw, ch: s.ch, sh: s.sh })).join('; '));
    const altinda = r.satirlar.filter((s) => !sigar(r.c2, s.H));
    sonuc('  aralığın altında dikey çubuk var, yatay çubuk yok', altinda.length > 0 && altinda.every((s) => dikeyCubuk(s) && !yatayCubuk(s)), altinda.slice(0, 3).map((s) => J({ H: s.H, cw: s.cw, ch: s.ch })).join('; '));
  }

  // ---------------------------------------------------------------- 2. Aynı belge, öteki düzenler ve modlar
  // Sayfayı sığdır bu yüksekliklerde genişliğe göre sığdırır (sayfa basık): kararsız aralık genişliğe sığdırdakiyle aynı
  for (const [duzen, mod, ad, W, aralik] of [
    ['surekli', 'sayfa', 'Yatay iki sayfa, kaydırmalı, sayfayı sığdır', B(760), genislikAraligi[B(760)]],
    ['surekli', 'gorunur', 'Yatay iki sayfa, kaydırmalı, görünür alana sığdır', B(600)],
    ['ikiSurekli', 'genislik', 'Yatay iki sayfa, iki sayfa kaydırmalı, genişliğe sığdır', B(1000)],
    ['tek', 'genislik', 'Yatay iki sayfa, kaydırmasız, genişliğe sığdır', B(760)],
  ]) {
    await kur(duzen, mod);
    await aralikTara(ad, W, aralik);
  }
  // "Sayfayı sığdır"da tek sayfa her boyutta tam sığar: çubuk hiç çıkmaz
  await kur('tek', 'sayfa');
  const tekSayfa = await evalJs(`__sk.tara(${B(760)}, ${B(300)}, ${B(300) + 30}, 200)`);
  sonuc(`Yatay iki sayfa, kaydırmasız, sayfayı sığdır: ${B(300)}–${B(300) + 30} px yüksekliklerde yerleşim duruluyor, hiç kaydırma çubuğu yok`,
    tekSayfa.every((s) => s.duruldu && s.olay === 0 && s.olcekler.length === 1 && !dikeyCubuk(s) && !yatayCubuk(s)), tekSayfa.filter((s) => !(s.duruldu && s.olay === 0 && !dikeyCubuk(s) && !yatayCubuk(s))).slice(0, 3).map((s) => J({ H: s.H, olay: s.olay, cw: s.cw, ch: s.ch })).join('; '));

  // ---------------------------------------------------------------- 3. Tek dikey sayfa (pencere oranı sayfa oranına yakınken aynı aralık)
  await ac('dikey1.pdf');
  for (const [duzen, mod, ad, W] of [['surekli', 'genislik', 'Tek dikey sayfa, genişliğe sığdır', B(500)], ['surekli', 'gorunur', 'Tek dikey sayfa, görünür alana sığdır', B(420)], ['iki', 'genislik', 'Tek dikey sayfa, iki sayfa düzeni, genişliğe sığdır', B(500)]]) {
    await kur(duzen, mod);
    await aralikTara(ad, W);
  }

  // ---------------------------------------------------------------- 4. Baskın genişlikten geniş sayfa: yatay çubuk da var
  await ac('karisik3.pdf');
  await kur('surekli', 'genislik');
  const karisik = await aralikTara('Karışık üç sayfa, kaydırmalı, genişliğe sığdır', B(450));
  if (karisik) sonuc('  geniş sayfa yana taşıyor: yatay çubuk her yükseklikte var', karisik.satirlar.every((s) => s.sw > s.cw && yatayCubuk(s)), karisik.satirlar.filter((s) => !(s.sw > s.cw && yatayCubuk(s))).slice(0, 3).map((s) => J({ H: s.H, sw: s.sw, cw: s.cw, ch: s.ch })).join('; '));

  // ---------------------------------------------------------------- 5. Elle yakınlaştırma: çubuk çıkınca / kalkınca tek yerleşim
  await ac('yatay2.pdf');
  await kur('surekli', 'genislik');
  await evalJs(`(async () => { __sk.boyut(${B(760)}, ${B(500)}); await __sk.durul(); return true; })()`);
  const elle = [];
  for (const o of [0.5, 1.2, 0.4, 2, 0.25]) {
    const r = await evalJs(`(async () => { const g = ${G}, s = __sk.say(g); g.zoomAyarla(${o}); const hemen = __sk.olc(); await __sk.bekle(400); s.birak(); return { olay: s.n, hemen, sonra: __sk.olc() }; })()`);
    elle.push({ o, olay: r.olay, ayni: J(r.hemen) === J(r.sonra), sol: r.sonra.sol, bosluk: r.sonra.alanW - r.sonra.sag, dikey: dikeyCubuk(r.sonra), yatay: yatayCubuk(r.sonra) });
  }
  sonuc('Elle yakınlaştırmada yerleşim ilk seferde son hâlinde (çubuk çıkınca / kalkınca ikinci yerleşim yok, sayfalar kaymıyor)',
    elle.every((e) => e.olay === 1 && e.ayni && Math.abs(e.sol - e.bosluk) <= 1) && elle.some((e) => e.dikey && e.yatay) && elle.some((e) => !e.dikey && !e.yatay), elle);

  // ---------------------------------------------------------------- 6. İki sayfa düzeni: yuvarlama çifti 1 px taşırınca yatay çubuk çıkmaz
  // Sığdırılan çiftin iki sayfası da piksel ızgarasına yuvarlanır: eşit genişlikte iki sayfa, tek sayıda piksele sığdırılınca ikisi de
  // yukarı yuvarlanır ve çift 1 px taşar (ekran ölçeği 1'de her iki genişlikten birinde). Bu taşmayı kenar boşluğu karşılar.
  for (const [duzen, mod, ad] of [['ikiSurekli', 'genislik', 'iki sayfa kaydırmalı, genişliğe sığdır'], ['iki', 'sayfa', 'iki sayfa, sayfayı sığdır']]) {
    await kur(duzen, mod);
    const cift = await evalJs(`__sk.taraGenislik(${B(880)}, ${B(880) + 23}, ${B(600)}, 120)`);
    const tasan = cift.filter((s) => !s.duruldu || s.olay > 0 || s.sw > s.cw || dikeyCubuk(s) || yatayCubuk(s));
    sonuc(`Yatay iki sayfa, ${ad}: ${B(880)}–${B(880) + 23} px genişliklerin hiçbirinde çift yana taşmıyor, kaydırma çubuğu yok`, tasan.length === 0,
      tasan.slice(0, 4).map((s) => J({ W: s.W, cw: s.cw, ch: s.ch, sw: s.sw, olay: s.olay })).join('; ') + (tasan.length > 4 ? ` … (${tasan.length} genişlik)` : ''));
  }

  // ---------------------------------------------------------------- 7. Kesirli boyutlar: gerçek kutudan taşan alan gereksiz çubuk çıkarmaz
  // Görünüm cihaz pikseli adımlarıyla büyütülür (ekran ölçeği 1,25'te 0,8 px'lik adımlar). Beklenen: "Sayfayı sığdır"da tek sayfada hiç
  // çubuk yok (önceki durumda çubuk olsa da olmasa da); genişliğe sığdırılan uzun belgede dikey çubuk var, yatay çubuk yok.
  const kesirliDene = async (ad, duzen, once, mod, beklenen) => {
    const r = await evalJs(`__sk.kesirli(${J(duzen)}, ${J(once)}, ${J(mod)}, ${B(640)}, ${B(520)})`);
    const kotu = r.filter((s) => s.olay > 0 || s.olcekler.length > 1 || yatayCubuk(s) || (beklenen === 'hicbiri' ? dikeyCubuk(s) : !dikeyCubuk(s)));
    sonuc(`${ad}: cihaz pikseli adımlarıyla 24 boyutta ${beklenen === 'hicbiri' ? 'hiç kaydırma çubuğu yok' : 'dikey çubuk var, yatay çubuk yok'}`, kotu.length === 0,
      kotu.slice(0, 4).map((s) => J({ boyut: s.gercek, dikey: dikeyCubuk(s), yatay: yatayCubuk(s), olay: s.olay, alan: [s.alanW, s.alanH] })).join('; ') + (kotu.length > 4 ? ` … (${kotu.length} boyut)` : ''));
  };
  await ac('dikey1.pdf');
  await kesirliDene('Tek dikey sayfa, kaydırmasız: "Genişliğe sığdır"dan (dikey çubuk varken) "Sayfayı sığdır"a', 'tek', 'genislik', 'sayfa', 'hicbiri');
  await kesirliDene('Tek dikey sayfa, kaydırmasız: çubuksuz durumdan "Sayfayı sığdır"a', 'tek', null, 'sayfa', 'hicbiri');
  await kesirliDene('Tek dikey sayfa, iki sayfa düzeni: "Genişliğe sığdır"dan "Sayfayı sığdır"a', 'iki', 'genislik', 'sayfa', 'hicbiri');
  await ac('dikey12.pdf');
  await kesirliDene('Uzun belge, kaydırmalı: çubuksuz durumdan "Genişliğe sığdır"a', 'surekli', null, 'genislik', 'dikey');
  await kesirliDene('Uzun belge, kaydırmalı: "Sayfayı sığdır"dan "Genişliğe sığdır"a', 'surekli', 'sayfa', 'genislik', 'dikey');
  await kesirliDene('Uzun belge, iki sayfa kaydırmalı: çubuksuz durumdan "Genişliğe sığdır"a', 'ikiSurekli', null, 'genislik', 'dikey');

  // ---------------------------------------------------------------- son
  await evalJs(`(() => { __sk.temizle(); delete window.__sk; return true; })()`);
  const hatalar = await evalJs(`JSON.stringify(window.__skHatalar || [])`);
  sonuc('Konsolda yakalanmamış hata yok', hatalar === '[]', hatalar);
  await hepsiniKapat();
  console.log(`\n${denetimSayisi} denetim, ${denetimSayisi - hataSayisi} geçti` + (hataSayisi ? `, ${hataSayisi} HATA` : ' — hepsi geçti'));
  process.exitCode = hataSayisi ? 1 : 0;
}
