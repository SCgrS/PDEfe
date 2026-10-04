// Kayıt, sekme ve sol panel düzeltmeleri (0.2.1, genel kod taraması):
//   1) Yüklenirken kapatılan sekme: dosya okunurken ya da PDF.js belgeyi yüklerken kapatılan sekmenin yükleme görevi bırakılır, dosyaAc
//      açılmamış gibi döner (null), "PDF açılamadı" sorulmaz, dosya son açılanlara eklenmez; çekirdek dosyayı yeniden açmaz (Windows'ta
//      dosyanın adı değiştirilebilir).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9621      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9621; node test\surucu.mjs betik test\kayit_sekme_panel.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bir bölüm: $env:BOLUM="1" (virgülle birden çok). Örnek PDF'lerin klasörü $env:KAYIT_SEKME_KLASORU (varsayılan
// test\cikti\kayit_sekme\<zaman>; iş bitince silinir). Gerçek belge kullanılmaz (ornek_pdf_uret.py).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = process.env.KAYIT_SEKME_KLASORU
  ? path.join(process.env.KAYIT_SEKME_KLASORU, new Date().toISOString().replace(/\D/g, '').slice(0, 14))
  : path.join(KOK, 'test', 'cikti', 'kayit_sekme', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, tamamSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (ok) tamamSayisi++; else hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

/** Örnek PDF üretir (K altında); yolu döner. */
const uret = (ad, sayfa, baslik = ad.replace(/\.pdf$/, ''), { notlu = false } = {}) => {
  const yol = path.join(K, ad);
  fs.rmSync(yol, { force: true });
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yol, String(sayfa), baslik, ...(notlu ? ['--notlu'] : [])], { encoding: 'utf8' });
  return yol;
};
/** Dosyanın adı değiştirilebiliyor mu (Windows'ta açık tanıtıcısı olan dosyanın adı değiştirilemez); geri eski adına döner. */
const adDegisirMi = (yol) => {
  try { fs.renameSync(yol, yol + '.ad'); fs.renameSync(yol + '.ad', yol); return true; } catch (e) { return e.code || String(e); }
};

export default async function ({ evalJs, bekle }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
  const diyalogKaydi = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const mesajKutulari = async () => (await diyalogKaydi()).filter((d) => d.kanal === 'mesaj:kutu').map((d) => d.secenek);
  const hatalar = () => evalJs(`(() => { const h = window.__hatalar.slice(); window.__hatalar.length = 0; return h; })()`);
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); await new Promise((r) => setTimeout(r, 300)); return p.belgeler.size; })()`);
  const bolumler = (process.env.BOLUM || '1').split(',').map((s) => s.trim());
  const bolum = (n) => bolumler.includes(String(n));

  // ------------------------------------------------------------ hazırlık
  fs.mkdirSync(K, { recursive: true });
  await sekmeleriKapat();
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); const ce = console.error; console.error = (...a) => { window.__hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; } return true; })()`);
  await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'otomatikKaydet', false); window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);
  await evalJs(`(() => { window.__pdefeYerelKutu = true; return true; })()`);   // sorular ana süreçteki test kuyruğuna (diyalog kaydında görünür)
  await diyalogKaydi(); await hatalar();

  // ------------------------------------------------------------ 1) Yüklenirken kapatılan sekme
  if (bolum(1)) {
    console.log('\n== 1) Yüklenirken kapatılan sekme');
    /** Dosyayı açar; sekme belirince (asama 'oku': hemen, dosya okunurken; 'gorev': PDF.js yükleme görevi kurulunca) kapatır. */
    const acKapat = (yol, asama) => evalJs(`(async () => {
      const p = window.__pdefe, yol = ${J(yol)};
      const sonOnce = JSON.stringify(p.ayar().sonDosyalar || []);
      const soz = p.dosyaAc(yol);
      const bul = () => [...p.belgeler.values()].find((x) => x.yol === yol);
      let b = null;
      for (let i = 0; i < 3000 && !b; i++) { b = bul(); if (!b) await new Promise((r) => setTimeout(r, 1)); }
      if (!b) return { hata: 'sekme açılmadı' };
      if (${J(asama)} === 'gorev') for (let i = 0; i < 3000 && !b.gorunum.yuklemeGorevi; i++) await new Promise((r) => setTimeout(r, 1));
      const g = b.gorunum, gorev = g.yuklemeGorevi, yuklenmisti = !!g.belge;
      await p.belgeKapat(b.id, { zorla: true });
      const t0 = performance.now();
      const donus = await Promise.race([soz, new Promise((r) => setTimeout(() => r('zaman aşımı'), 8000))]);
      const sure = Math.round(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 1500));   // eski kodda notlar ve belge bilgisi bu arada çekirdekten istenirdi
      return {
        donus: donus === null ? null : donus === 'zaman aşımı' ? donus : 'belge', sure, yuklenmisti,
        gorevVardi: !!gorev, gorevBirakildi: gorev ? gorev.destroyed === true : null,
        belgeKurulmadi: !g.belge && g.belgeler.size === 0, belgeSayisi: p.belgeler.size,
        sekmeler: p.sekmeler.sekmeler.map((s) => s.ad),
        sonDosyalarAyni: JSON.stringify(p.ayar().sonDosyalar || []) === sonOnce,
      };
    })()`);

    const buyuk1 = uret('buyuk-oku.pdf', 400), buyuk2 = uret('buyuk-gorev.pdf', 400);
    for (const [yol, asama, ad] of [[buyuk1, 'oku', 'dosya okunurken'], [buyuk2, 'gorev', 'PDF.js yüklerken']]) {
      const r = await acKapat(yol, asama);
      sonuc(`${ad} kapatıldı: dosyaAc açılmamış gibi döndü (null)`, r && r.donus === null, r);
      if (asama === 'gorev') sonuc('PDF.js yükleme görevi kurulmuştu ve bırakıldı', r?.gorevVardi && r.gorevBirakildi === true, r);
      sonuc(`${ad}: yok edilen görünümde belge kurulmadı`, r?.belgeKurulmadi === true, r);
      sonuc(`${ad}: sekme kalmadı (yalnızca açılış sekmesi)`, r?.belgeSayisi === 0 && r.sekmeler.length === 1 && r.sekmeler[0] === 'Yeni sekme', r?.sekmeler);
      sonuc(`${ad}: dosya son açılanlara eklenmedi`, r?.sonDosyalarAyni === true);
      const kutular = await mesajKutulari();
      sonuc(`${ad}: "PDF açılamadı" sorulmadı`, !kutular.length, kutular.map((k) => k.mesaj));
      const h = await hatalar();
      sonuc(`${ad}: konsolda hata yok`, !h.length, h);
      if (process.platform === 'win32') sonuc(`${ad}: çekirdek dosyayı açık tutmuyor (adı değiştirilebiliyor)`, adDegisirMi(yol) === true, adDegisirMi(yol));
    }
    // Yüklenirken kapatılan sekmeden sonra sıradaki dosyalar açılır (bırakılan görevin sözü asılı kalıp dosyaAc'ı bekletmez)
    const c = uret('sonraki.pdf', 2);
    const r = await evalJs(`(async () => { const p = window.__pdefe; const b = await Promise.race([p.dosyaAc(${J(c)}), new Promise((r) => setTimeout(() => r('zaman aşımı'), 8000))]); return b && b !== 'zaman aşımı' ? { ad: b.ad, sayfa: b.gorunum.sayfaSayisi } : b; })()`);
    sonuc('Ardından açılan belge olağan açıldı', r?.ad === 'sonraki.pdf' && r.sayfa === 2, r);
    await sekmeleriKapat();
  }

  console.log(`\nSonuç: ${tamamSayisi} denetim geçti, ${hataSayisi} hata`);
  if (hataSayisi) process.exitCode = 1;
}
