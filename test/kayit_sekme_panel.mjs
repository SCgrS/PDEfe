// Kayıt, sekme ve sol panel düzeltmeleri (0.2.1, genel kod taraması):
//   1) Yüklenirken kapatılan sekme: dosya okunurken ya da PDF.js belgeyi yüklerken kapatılan sekmenin yükleme görevi bırakılır, dosyaAc
//      açılmamış gibi döner (null), "PDF açılamadı" sorulmaz, dosya son açılanlara eklenmez; çekirdek dosyayı yeniden açmaz (Windows'ta
//      dosyanın adı değiştirilebilir).
//   2) Farklı kaydet'in hedefi başka bir sekmede ya da başka bir PDEfe penceresinde açıksa yazılmaz: soru açılır ("… başka bir sekmede
//      açık" / "… başka bir PDEfe penceresinde açık"), Vazgeç'te kayıt false döner, belge kaydedilmemiş kalır, hedef dosya değişmez;
//      "Başka ad seç" kaydetme penceresini yeniden açar ve seçilen yeni ada kaydedilir. Belgenin kendi dosyasına Farklı kaydet sorusuz.
//   3) Arka plandaki belge Farklı kaydet'le yeni ada kaydedilince pencere başlığı öndeki belgenin kalır (sekmenin adı değişir); öndeki
//      belge yeni ada kaydedilince başlık yeni ad olur; arka plandaki belgeye geçilince başlık onun yeni adı olur.
//   4) Sayfalar panelinin küçük resimleri not kaydından sonra diskteki hâli gösterir (silinen vurgu kalkar, eklenen not görünür); resimler
//      yerinde yenilenir (panel baştan kurulmaz).
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
/** Dosyanın özeti (ornek_pdf_uret.py --ozet): { sayfa, ilkSatir, notlar } */
const ozet = (yol) => JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), '--ozet', yol], { encoding: 'utf8' }));
/** Dosyanın adı değiştirilebiliyor mu (Windows'ta açık tanıtıcısı olan dosyanın adı değiştirilemez); geri eski adına döner. */
const adDegisirMi = (yol) => {
  try { fs.renameSync(yol, yol + '.ad'); fs.renameSync(yol + '.ad', yol); return true; } catch (e) { return e.code || String(e); }
};

export default async function ({ evalJs, bekle, hedefler, hedefSec }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
  const diyalogKaydi = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const yanitla = (kanal, yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', ${J(kanal)}, ${J(yanitlar)})`);
  const ac = async (yol) => {
    const r = await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); return !!b; })()`);
    await kosul(`(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.yol === ${J(yol)}); return !!b?.gorunum?.hazir && b.notlar?.yuklendi; })()`);
    return r;
  };
  /** Belgede (ada göre) işlem: govde içinde p (window.__pdefe) ve b (belge) kullanılır */
  const belgeIslemi = (ad, govde) => evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${J(ad)}); if (!b) return null; ${govde} })()`);
  const notEkle = (ad, icerik) => belgeIslemi(ad, `b.notlar.ekle({ tur: 'Text', sayfa: 1, rect: [400, 600, 420, 620], icerik: ${J(icerik)}, yazar: 'Deneme Yazar', renk: '#ffd100', opaklik: 1, simge: 'Comment', konu: 'Not' });
    await new Promise((r) => setTimeout(r, 200)); return !!b.degisti;`);
  const sekmeAdlari = () => evalJs(`window.__pdefe.sekmeler.sekmeler.map((s) => s.ad + (s.degisti ? '*' : ''))`);
  // Pencereler: ana süreçteki kimlik (webContents kimliği) → CDP hedefi
  let harita = new Map();
  const pencereleriYenile = async () => {
    const m = new Map();
    for (const h of await hedefler()) { hedefSec(h.id); m.set(await evalJs(`window.pdefe.cagir('pencere:kimlik')`), h.id); }
    harita = m; hedefSec(null);
    return [...m.keys()].sort((a, b) => a - b);
  };
  const P = (kimlik) => hedefSec(kimlik == null ? null : harita.get(kimlik));
  const mesajKutulari = async () => (await diyalogKaydi()).filter((d) => d.kanal === 'mesaj:kutu').map((d) => d.secenek);
  const hatalar = () => evalJs(`(() => { const h = window.__hatalar.slice(); window.__hatalar.length = 0; return h; })()`);
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); await new Promise((r) => setTimeout(r, 300)); return p.belgeler.size; })()`);
  const bolumler = (process.env.BOLUM || '1,2,3,4').split(',').map((s) => s.trim());
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

  // ------------------------------------------------------------ 2) Farklı kaydet'in hedefi başka sekmede / pencerede açık
  if (bolum(2)) {
    console.log('\n== 2) Farklı kaydet\'in hedefi başka sekmede ya da pencerede açık');
    const a = uret('a.pdf', 3, 'A belgesi'), bYol = uret('b.pdf', 2, 'B belgesi', { notlu: true }), yeni = path.join(K, 'a-yeni.pdf');
    const bOnce = ozet(bYol);
    await ac(a); await ac(bYol);
    await evalJs(`window.__pdefe.sekmeSec([...window.__pdefe.belgeler.values()].find((x) => x.ad === 'a.pdf').id)`);
    sonuc('a.pdf\'e not eklendi', await notEkle('a.pdf', 'farklı kaydet notu'));
    await diyalogKaydi(); await hatalar();
    const farkliKaydet = (ad) => belgeIslemi(ad, `return await p.belgeKaydet(b, true);`);

    // a) Aynı penceredeki sekme, Vazgeç. b.pdf çekirdek önbelleğinden bırakılır: Windows'ta da yazılabilir olsun (macOS'ta hep yazılabilir;
    // eski kod b.pdf'in yerine a.pdf'i yazar, b.pdf sekmesi eski içerikle kalırdı)
    await evalJs(`window.pdefe.cagir('cekirdek:cagir', 'belge_birak', { yol: ${J(bYol)} }, 0)`);
    await yanitla('dosya:kaydetDiyalog', [bYol]); await yanitla('mesaj:kutu', [{ secim: 1, onay: false }]);
    let r = await farkliKaydet('a.pdf');
    let kutular = await mesajKutulari();
    sonuc('Hedef başka sekmede açık: kayıt false döndü', r === false, r);
    sonuc('Soru: "b.pdf" PDEfe\'de başka bir sekmede açık', kutular.length === 1 && kutular[0].mesaj === '"b.pdf" PDEfe\'de başka bir sekmede açık.'
      && /önce o sekmeyi kapatın ya da başka bir ad seçin/.test(kutular[0].ayrinti) && J(kutular[0].dugmeler) === J(['Başka ad seç', 'Vazgeç']), kutular);
    sonuc('"Başka bir programda açık olabilir" hatası yok', !kutular.some((k) => /başka bir programda/.test(`${k.mesaj} ${k.ayrinti}`)));
    sonuc('b.pdf değişmedi', J(ozet(bYol)) === J(bOnce), ozet(bYol).ilkSatir);
    sonuc('a.pdf kaydedilmemiş kaldı, sekmeler aynı', J(await sekmeAdlari()) === J(['a.pdf*', 'b.pdf']), await sekmeAdlari());
    sonuc('a.pdf\'in dosyası değişmedi (not yok)', ozet(a).notlar.length === 0);

    // b) "Başka ad seç": kaydetme penceresi yeniden açılır, yeni ada kaydedilir
    await yanitla('dosya:kaydetDiyalog', [bYol, yeni]); await yanitla('mesaj:kutu', [{ secim: 0, onay: false }]);
    r = await farkliKaydet('a.pdf');
    kutular = await mesajKutulari();
    const kayit = (await diyalogKaydi()).filter((d) => d.kanal === 'dosya:kaydetDiyalog');
    sonuc('"Başka ad seç" sonrası yeni ada kaydedildi', r === true && fs.existsSync(yeni) && ozet(yeni).notlar.some((n) => n.icerik === 'farklı kaydet notu'), { r, var: fs.existsSync(yeni) });
    sonuc('Soru bir kez soruldu', kutular.length === 1, kutular.map((k) => k.mesaj));
    sonuc('Sekme yeni adı aldı, b.pdf yerinde', J(await sekmeAdlari()) === J(['a-yeni.pdf', 'b.pdf']), await sekmeAdlari());
    sonuc('b.pdf yine değişmedi', J(ozet(bYol)) === J(bOnce));

    // c) Belgenin kendi dosyasına Farklı kaydet: sorulmaz, kaydedilir
    await notEkle('a-yeni.pdf', 'ikinci not');
    await diyalogKaydi();
    await yanitla('dosya:kaydetDiyalog', [yeni]);
    r = await farkliKaydet('a-yeni.pdf');
    kutular = await mesajKutulari();
    sonuc('Kendi dosyasına Farklı kaydet sorusuz kaydetti', r === true && !kutular.length && ozet(yeni).notlar.length === 2, { r, kutular: kutular.map((k) => k.mesaj) });

    // d) Başka bir PDEfe penceresinde açık: b.pdf yeni pencereye taşınır
    let kimlikler = await pencereleriYenile();
    const P1 = kimlikler[0];
    P(P1);
    sonuc('b.pdf yeni pencereye taşındı', await belgeIslemi('b.pdf', `return await p.sekmeyiTasi(b.id, { tur: 'yeni' });`) === true);
    let P2 = null;
    for (let i = 0; i < 60 && P2 == null; i++) { kimlikler = await pencereleriYenile(); P2 = kimlikler.find((k) => k !== P1) ?? null; if (P2 == null) await bekle(200); }
    if (P2 != null) { P(P2); await kosul(`[...window.__pdefe.belgeler.values()].some((x) => x.ad === 'b.pdf' && x.gorunum.hazir)`); P(P1); }
    await notEkle('a-yeni.pdf', 'üçüncü not');
    await diyalogKaydi();
    await yanitla('dosya:kaydetDiyalog', [bYol]); await yanitla('mesaj:kutu', [{ secim: 1, onay: false }]);
    r = await farkliKaydet('a-yeni.pdf');
    kutular = await mesajKutulari();
    sonuc('Hedef başka pencerede açık: kayıt false döndü', r === false, r);
    sonuc('Soru: "b.pdf" başka bir PDEfe penceresinde açık', kutular.length === 1 && kutular[0].mesaj === '"b.pdf" başka bir PDEfe penceresinde açık.', kutular.map((k) => k.mesaj));
    sonuc('b.pdf (başka pencerede) değişmedi', J(ozet(bYol)) === J(bOnce));
    sonuc('a-yeni.pdf kaydedilmemiş kaldı', J(await sekmeAdlari()) === J(['a-yeni.pdf*']), await sekmeAdlari());
    const h = await hatalar();
    sonuc('Konsolda hata yok', !h.length, h);
    // Temizlik: ikinci pencere kapatılır
    if (P2 != null) {
      P(P2);
      await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`).catch(() => {});
      await evalJs(`window.pdefe.cagir('pencere:kapat')`).catch(() => {});
      for (let i = 0; i < 40 && (await pencereleriYenile()).length > 1; i++) await bekle(200);
    }
    P(null);
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 3) Arka plandaki belgenin Farklı kaydet'i ve pencere başlığı
  if (bolum(3)) {
    console.log('\n== 3) Arka plandaki belge Farklı kaydet\'le kaydedilince pencere başlığı');
    const a = uret('baslik-a.pdf', 2), bYol = uret('baslik-b.pdf', 2), bYeni = path.join(K, 'baslik-b-yeni.pdf'), aYeni = path.join(K, 'baslik-a-yeni.pdf');
    await ac(a); await ac(bYol);
    const kimlik = await evalJs(`window.pdefe.cagir('pencere:kimlik')`);
    const baslik = async () => { await bekle(200); return (await evalJs(`window.pdefe.cagir('test:pencereler')`)).find((p) => p.id === kimlik)?.baslik; };
    await evalJs(`window.__pdefe.sekmeSec([...window.__pdefe.belgeler.values()].find((x) => x.ad === 'baslik-a.pdf').id)`);
    await notEkle('baslik-b.pdf', 'arka plan notu');
    sonuc('Öndeki belge baslik-a.pdf, başlık onun adı', (await baslik()) === 'baslik-a.pdf — PDEfe', await baslik());
    await diyalogKaydi();
    await yanitla('dosya:kaydetDiyalog', [bYeni]);
    const r = await belgeIslemi('baslik-b.pdf', `return await p.belgeKaydet(b, true);`);
    sonuc('Arka plandaki belge yeni ada kaydedildi', r === true && fs.existsSync(bYeni), r);
    sonuc('Sekmenin adı değişti', J(await sekmeAdlari()) === J(['baslik-a.pdf', 'baslik-b-yeni.pdf']), await sekmeAdlari());
    sonuc('Pencere başlığı öndeki belgenin kaldı', (await baslik()) === 'baslik-a.pdf — PDEfe', await baslik());
    sonuc('Öndeki belge değişmedi', await evalJs(`window.__pdefe.aktif()?.ad`) === 'baslik-a.pdf');
    await evalJs(`window.__pdefe.sekmeSec([...window.__pdefe.belgeler.values()].find((x) => x.ad === 'baslik-b-yeni.pdf').id)`);
    sonuc('Arka plandaki belgeye geçilince başlık yeni adı', (await baslik()) === 'baslik-b-yeni.pdf — PDEfe', await baslik());
    // Öndeki belge yeni ada kaydedilince başlık yeni ad (eskisi gibi)
    await evalJs(`window.__pdefe.sekmeSec([...window.__pdefe.belgeler.values()].find((x) => x.ad === 'baslik-a.pdf').id)`);
    await notEkle('baslik-a.pdf', 'ön not');
    await yanitla('dosya:kaydetDiyalog', [aYeni]);
    await belgeIslemi('baslik-a.pdf', `return await p.belgeKaydet(b, true);`);
    sonuc('Öndeki belge yeni ada kaydedilince başlık yeni ad', (await baslik()) === 'baslik-a-yeni.pdf — PDEfe', await baslik());
    const kutular = await mesajKutulari();
    sonuc('Soru açılmadı', !kutular.length, kutular.map((k) => k.mesaj));
    await sekmeleriKapat();
  }

  // ------------------------------------------------------------ 4) Sayfalar panelinin küçük resimleri kayıttan sonra
  if (bolum(4)) {
    console.log('\n== 4) Sayfalar panelinin küçük resimleri kayıttan sonra');
    const yol = uret('kucuk-resim.pdf', 3, 'Küçük resim', { notlu: true });
    await ac(yol);
    await evalJs(`(() => { const p = window.__pdefe; p.panel.acKapa(true); p.panel.sekmeSec('sayfalar'); return true; })()`);
    /** 1. sayfanın küçük resmi: { src, isaret (öğe yeniden kurulmadıysa true), taze (çekirdekten şimdi alınanla aynı mı) } */
    const resim = () => evalJs(`(async () => {
      const alan = document.querySelector('#panel-sayfalar'), el = alan.querySelector('.kucuk-resim[data-sayfa="1"]');
      const img = el?.querySelector('img'); if (!img) return null;
      const g = parseFloat(img.style.width);   // panelin istediği genişlik (alan kurulurken; kaydırma çubuğu sonradan çıkmış olabilir)
      const r = await window.pdefe.cagir('cekirdek:cagir', 'kucuk_resim', { yol: ${J(yol)}, sayfa: 1, genislik: g * Math.min(2, window.devicePixelRatio || 1) }, 0);
      return { src: img.src, isaret: el.__isaret === 1, taze: img.src === 'data:image/png;base64,' + r.png };
    })()`);
    await kosul(`!!document.querySelector('#panel-sayfalar .kucuk-resim[data-sayfa="1"] img')`);
    const r0 = await resim();
    sonuc('Küçük resim yüklendi, kayıtlı vurguyu gösteriyor (diskteki hâl)', r0?.taze === true, r0 && { taze: r0.taze });
    await evalJs(`(() => { document.querySelector('#panel-sayfalar .kucuk-resim[data-sayfa="1"]').__isaret = 1; return true; })()`);
    const kayit = await belgeIslemi('kucuk-resim.pdf', `const n = b.notlar.liste().find((x) => x.tur === 'Highlight'); if (!n) return 'vurgu yok'; b.notlar.sil(n);
      return await p.belgeKaydet(b);`);
    sonuc('Vurgu silinip kaydedildi', kayit === true && !ozet(yol).notlar.some((n) => n.tur === 'Highlight'), kayit);
    await kosul(`(() => { const img = document.querySelector('#panel-sayfalar .kucuk-resim[data-sayfa="1"] img'); return !!img && img.src !== ${J(r0?.src || '')}; })()`, 5000);
    const r1 = await resim();
    sonuc('Küçük resim yenilendi (silinen vurgu kalktı)', r1 && r1.src !== r0?.src && r1.taze === true, r1 && { degisti: r1.src !== r0?.src, taze: r1.taze });
    sonuc('Panel baştan kurulmadı (öğe yerinde)', r1?.isaret === true);
    // Yeni not eklenip kaydedilince de görünür
    await notEkle('kucuk-resim.pdf', 'küçük resim notu');
    await belgeIslemi('kucuk-resim.pdf', `return await p.belgeKaydet(b);`);
    await kosul(`(() => { const img = document.querySelector('#panel-sayfalar .kucuk-resim[data-sayfa="1"] img'); return !!img && img.src !== ${J(r1?.src || '')}; })()`, 5000);
    const r2 = await resim();
    sonuc('Eklenen not kayıttan sonra küçük resimde', r2 && r2.src !== r1?.src && r2.taze === true, r2 && { degisti: r2.src !== r1?.src, taze: r2.taze });
    // Panel Yorumlar'dayken kaydedilince Sayfalar'a dönülünce yenilenir
    await evalJs(`(() => { window.__pdefe.panel.sekmeSec('yorumlar'); return true; })()`);
    await belgeIslemi('kucuk-resim.pdf', `const n = b.notlar.liste().find((x) => x.icerik === 'küçük resim notu'); b.notlar.sil(n); return await p.belgeKaydet(b);`);
    await bekle(500);
    await evalJs(`(() => { window.__pdefe.panel.sekmeSec('sayfalar'); return true; })()`);
    await kosul(`(() => { const img = document.querySelector('#panel-sayfalar .kucuk-resim[data-sayfa="1"] img'); return !!img && img.src !== ${J(r2?.src || '')}; })()`, 5000);
    const r3 = await resim();
    sonuc('Yorumlar\'dayken kaydedilen değişiklik Sayfalar\'a dönünce küçük resimde', r3 && r3.src !== r2?.src && r3.taze === true, r3 && { degisti: r3.src !== r2?.src, taze: r3.taze });
    const h = await hatalar();
    sonuc('Konsolda hata yok', !h.length, h);
    await evalJs(`(() => { window.__pdefe.panel.acKapa(false); return true; })()`);
    await sekmeleriKapat();
  }

  console.log(`\nSonuç: ${tamamSayisi} denetim geçti, ${hataSayisi} hata`);
  if (hataSayisi) process.exitCode = 1;
}
