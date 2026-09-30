// Sığdırma ve kaydırma çubukları, rastgele tarama (0.1.20): rastgele belge / düzen / mod / yakınlaştırma / görünüm boyutu örneklerinde
// yerleşimin durulduğunu, kaydırma çubuklarının yalnızca taşma varken çıktığını ve sayfaların görünür alanda ortalı durduğunu ölçer.
// sigdirma_kararli.mjs bilinen sınırları tek tek dener; bu tarama bilinmeyenleri arar (iki sayfa düzenindeki 1 px'lik taşmayı bu buldu).
// Yerleşim hesabına (goruntuleyici.js gorunumCoz, satirlariOlc, sigdirOlcek) dokunan her işten sonra üç ekran ölçeğinde koşulmalı.
// Boyutlar cihaz pikseli adımlarıyla verilir (ekran ölçeği 1 değilse CSS pikselinin kesirleri); her örnek bir öncekinin durumundan
// (çubuklu ya da çubuksuz) başlar. Rastgele sayılar tohumdan üretilir: aynı tohum aynı örnekleri verir.
// Kullanım (ekran dışındaki örnek yeter):
//   powershell -NoProfile -ExecutionPolicy Bypass -File test\baslat.ps1 -Port 9444 -Veri "%TEMP%\pdefe-sr-9444" [-Olcek 1.25]
//   $env:PDEFE_CDP_PORT=9444; [$env:SR_ADET=420; $env:SR_TOHUM=2026;] node test\surucu.mjs betik test\sigdirma_rastgele.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Belgeler: .venv'deki PyMuPDF ile test/cikti/sr/<zaman>/pdf altına üretilir (test/pdf'e ve başka dosyaya yazılmaz).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(KOK, 'test', 'cikti', 'sr', new Date().toISOString().replace(/\D/g, '').slice(0, 14), 'pdf');
const ADET = +(process.env.SR_ADET || 420), TOHUM = +(process.env.SR_TOHUM || 2026);
const J = (x) => JSON.stringify(x);

// Sayfalarda kenardan içeride çerçeve ve yazı: "Görünür alana sığdır" içerik kutusunu sayfadan dar bulsun.
const BELGELER = ['yatay2.pdf', 'dikey1.pdf', 'karisik3.pdf', 'dikey12.pdf', 'karisik6.pdf', 'yatay1.pdf', 'kucuk3.pdf'];
const KARISIK = ['karisik3.pdf', 'karisik6.pdf'];   // baskın genişlikten geniş sayfası olanlar: genişliğe sığdırmada yana taşar
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
uret('karisik3.pdf', [(600, 300), (850, 300), (600, 300)])
uret('dikey12.pdf', [(595, 842)] * 12)
uret('karisik6.pdf', [(595, 842), (595, 842), (1191, 842), (420, 595), (595, 842), (842, 595)])
uret('yatay1.pdf', [(842, 300)])
uret('kucuk3.pdf', [(300, 200)] * 3)
`;

export default async function ({ evalJs }) {
  const hepsiniKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  fs.mkdirSync(PDF, { recursive: true });
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), ['-c', URET, PDF.replace(/\\/g, '/')], { stdio: 'pipe' });
  await hepsiniKapat();
  await evalJs(`(async () => { if (window.__pdefe.panel.acik) window.__pdefe.panel.acKapa(false); return true; })()`);
  console.log(`ekran ölçeği ${await evalJs('devicePixelRatio')}, ${ADET} örnek, tohum ${TOHUM}`);

  let toplam = 0, sorunlu = 0;
  const ornekSorunlar = [], turler = {};
  let s = TOHUM;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (const ad of BELGELER) {
    await evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ad))}).then(() => new Promise((r) => setTimeout(() => r(true), 700)))`);
    const alan = await evalJs(`(() => { const u = window.__pdefe.aktif().gorunum.kaydirici.parentElement; return { w: u.clientWidth, h: u.clientHeight }; })()`);
    const ornekler = [];
    for (let i = 0; i < Math.ceil(ADET / BELGELER.length); i++) {
      ornekler.push({ duzen: ['surekli', 'tek', 'ikiSurekli', 'iki'][Math.floor(rnd() * 4)], kapak: rnd() < 0.3, mod: ['genislik', 'sayfa', 'gorunur', 'serbest'][Math.floor(rnd() * 4)],
        olcek: +(0.25 + rnd() * 1.5).toFixed(2), W: Math.round(260 + rnd() * (alan.w - 270)), H: Math.round(90 + rnd() * (alan.h - 100)), fw: Math.floor(rnd() * 8), fh: Math.floor(rnd() * 8), sayfa: 1 + Math.floor(rnd() * 12) });
    }
    const r = await evalJs(`(async () => {
      const g = window.__pdefe.aktif().gorunum, k = g.kaydirici, ust = k.parentElement, a = g.alan, dpr = devicePixelRatio;
      const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
      const sonuclar = [];
      let onceki = null;   // sorunlu örneğin kaydına bir önceki örnek de yazılır (örnek öncekinin durumundan başlar)
      for (const o of ${J(ornekler)}) {
        let n = 0; const say = () => n++; g.addEventListener('yerlesim', say);
        g.duzenAyarla(o.duzen, o.kapak);
        if (o.mod === 'serbest') g.zoomAyarla(o.olcek); else await g.zoomModuAyarla(o.mod);
        g.sayfayaGit(Math.min(o.sayfa, g.sayfaSayisi));
        // Kaydırıcının gerçek boyutu W + fw cihaz pikseli × H + fh cihaz pikseli olur (üst öğenin gerçek boyutundan hesaplanan boşluklarla)
        const u = ust.getBoundingClientRect();
        k.style.right = (u.width - (o.W + o.fw / dpr)) + 'px'; k.style.bottom = (u.height - (o.H + o.fh / dpr)) + 'px';
        // Durulma: boyut değişince gelen yerleşimden sonra 170 ms sessizlik (400 ms'de hiç yerleşim gelmediyse değişecek bir şey
        // yoktur; en çok 1500 ms), ardından 180 ms daha yerleşim olmamalı
        const t0 = performance.now(), n0 = n; let son = t0, m = n, duruldu = false;
        for (;;) { await bekle(20); const simdi = performance.now(); if (n !== m) { m = n; son = simdi; }
          if (n !== n0 ? simdi - son >= 170 : simdi - t0 >= 400) { duruldu = true; break; } if (simdi - t0 > 1500) break; }
        const n1 = n; await bekle(180); const sonraki = n - n1;
        g.removeEventListener('yerlesim', say);
        const yerler = g.yerlesim.filter(Boolean), alanW = parseFloat(a.style.width), alanH = parseFloat(a.style.height), kr = k.getBoundingClientRect();
        const sol = Math.min(...yerler.map((y) => y.x)), sag = Math.max(...yerler.map((y) => y.x + y.w));
        // W × H: dış boyut (yuvarlanmış); cw × ch: görünür boyut; gw × gh: gerçek (kesirli) görünür boyut; sw × sh: kaydırılan içerik
        const d = { W: k.offsetWidth, H: k.offsetHeight, gercek: [+kr.width.toFixed(3), +kr.height.toFixed(3)], cw: k.clientWidth, ch: k.clientHeight, sw: k.scrollWidth, sh: k.scrollHeight, alanW, alanH, sol, sag,
          gw: kr.width - (k.offsetWidth - k.clientWidth), gh: kr.height - (k.offsetHeight - k.clientHeight), olcek: +g.olcek.toFixed(4), mod: g.zoomModu, duzen: g.duzen, yerlesimSayisi: n1 };
        const sorun = [];
        if (!duruldu) sorun.push('durulmadı (1,5 sn boyunca yerleşim sürdü)');
        else if (sonraki) sorun.push('durulduktan sonra ' + sonraki + ' yerleşim daha');
        if ((d.sw > d.cw) !== (d.ch < d.H)) sorun.push('yatay çubuk / taşma uyumsuz');
        if ((d.sh > d.ch) !== (d.cw < d.W)) sorun.push('dikey çubuk / taşma uyumsuz');
        if (d.sw <= d.cw && !(alanW <= d.gw + 1e-6 && d.gw - alanW < 1)) sorun.push('alan görünür genişlikte değil');
        if (d.sh <= d.ch && alanH > d.gh + 1e-6) sorun.push('alan görünür yükseklikten büyük');
        // İki sayfa düzeninde tek sayfalık satır (ayrı kapak, tek kalan son sayfa) sütununda durur: ortalı olması beklenmez
        if (Math.abs(sol - (alanW - sag)) > 1 && !(g.ikili() && yerler.length === 1)) sorun.push('sayfalar ortalı değil');
        // Sığdırılan satır görünür alana sığar (ölçek alt sınıra dayanmadıkça)
        if (o.mod === 'sayfa' && !g.surekli() && g.olcek > 0.2501 && (d.sw > d.cw || d.sh > d.ch)) sorun.push('sığdırılan sayfa taşıyor');
        if (o.mod === 'genislik' && g.olcek > 0.2501 && d.sw > d.cw && !${J(KARISIK.includes(ad))}) sorun.push('genişliğe sığdırılan sayfa yana taşıyor');
        if (sorun.length) sonuclar.push({ sorun, o, onceki, d });
        onceki = o;
      }
      k.style.right = ''; k.style.bottom = '';
      return { adet: ${ornekler.length}, sonuclar };
    })()`);
    toplam += r.adet; sorunlu += r.sonuclar.length;
    ornekSorunlar.push(...r.sonuclar.map((x) => ({ ad, ...x })));
    for (const x of r.sonuclar) for (const t of x.sorun) turler[t] = (turler[t] || 0) + 1;
    console.log(`${r.sonuclar.length ? 'HATA' : 'OK  '} ${ad}: ${r.adet} örnek, ${r.sonuclar.length} sorunlu`);
    await hepsiniKapat();
  }
  for (const h of ornekSorunlar.slice(0, 10)) console.log(J(h));
  if (sorunlu) console.log('sorun türleri:', J(turler));
  console.log(`\n${toplam} örnek, ${sorunlu} sorunlu` + (sorunlu ? '' : ' — hepsi geçti'));
  process.exitCode = sorunlu ? 1 : 0;
}
