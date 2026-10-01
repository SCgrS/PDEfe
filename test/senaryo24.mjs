// Senaryo 24 (0.1.23, güvenlik denetimi): PDF'teki dış bağlantılar yalnızca web ve e-posta adresiyse ve sorulduktan sonra açılır.
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9424 -Veri "%TEMP%\pdefe-s24-9424"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9424; node test\surucu.mjs betik test\senaryo24.mjs
// Örnek PDF'ler test/guvenlik_pdf_uret.py ile test/cikti/guvenlik altına üretilir (betik kendisi çalıştırır). Hiçbir bağlantı gerçekten
// açılmaz: sorular window.__pdefeOtoYanit ile "Vazgeç" yanıtlanır.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = path.join(KOK, 'test', 'cikti', 'guvenlik');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

export default async function ({ evalJs, bekle }) {
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), [path.join(KOK, 'test', 'guvenlik_pdf_uret.py'), CIKTI], { stdio: 'inherit' });

  // ---------------------------------------------------------------- 1. PDF'teki dış bağlantılar
  console.log('— PDF bağlantıları');
  const baglantili = path.join(CIKTI, 'baglantili.pdf');
  await evalJs(`window.__pdefe.dosyaAc(${J(baglantili)}).then(() => 1)`);
  sonuc('bağlantılar çizildi', await kosul(`document.querySelectorAll('.gorunum:not([hidden]) .baglanti').length >= 4`),
    await evalJs(`document.querySelectorAll('.gorunum:not([hidden]) .baglanti').length`));
  /** Bağlantıya tıklar (soru Vazgeç ile yanıtlanır); sorulan kutuyu döndürür ({ mesaj, ayrinti, dugmeler, onayKutusu }) ya da null. */
  const tikla = (uri, yanit = { secim: 1 }) => evalJs(`(async () => {
    window.__pdefeOtoYanit = ${J(yanit)};
    const el = [...document.querySelectorAll('.gorunum:not([hidden]) .baglanti')].find((a) => a.title === ${J(uri)});
    if (!el) return 'yok';
    el.click();
    await new Promise((c) => setTimeout(c, 300));
    const son = window.__pdefeOtoYanit.son || null;
    delete window.__pdefeOtoYanit;
    return son && { mesaj: son.mesaj, ayrinti: son.ayrinti, dugmeler: son.dugmeler, onayKutusu: son.onayKutusu };
  })()`);

  let s = await tikla('https://ornek.invalid/belge');
  sonuc('https: açmadan önce sorulur', s?.mesaj === 'Bağlantı tarayıcıda açılsın mı?', s);
  sonuc('https: soruda tam adres görünür', s?.ayrinti === 'https://ornek.invalid/belge', s);
  sonuc('https: Aç / Vazgeç ve "Bu belgede yeniden sorma"', J(s?.dugmeler) === J(['Aç', 'Vazgeç']) && s?.onayKutusu === 'Bu belgede yeniden sorma', s);
  s = await tikla('mailto:kisi@ornek.invalid');
  sonuc('mailto: e-posta sorusu', s?.mesaj === 'E-posta uygulaması açılsın mı?' && s?.ayrinti === 'mailto:kisi@ornek.invalid', s);
  s = await tikla('FILE:///C:/Windows/System32/calc.exe');
  sonuc('büyük harfli FILE: açılmaz, uyarı verilir', s?.mesaj === 'Bu bağlantı açılmadı.' && s?.ayrinti.includes('FILE:///C:/Windows/System32/calc.exe'), s);
  const searchMs = await evalJs(`[...document.querySelectorAll('.gorunum:not([hidden]) .baglanti')].map((a) => a.title).find((t) => t.startsWith('search-ms:'))`);
  s = await tikla(searchMs);
  sonuc('search-ms: açılmaz, uyarı verilir', s?.mesaj === 'Bu bağlantı açılmadı.', s);
  // "Bu belgede yeniden sorma" işaretlenip Vazgeç denirse izin verilmez (Vazgeç); Aç denmeden işaret kalıcı olmaz
  await tikla('https://ornek.invalid/belge', { secim: 1, onay: true });
  s = await tikla('https://ornek.invalid/belge');
  sonuc('Vazgeç ile işaretlenen "yeniden sorma" izin vermez', s?.mesaj === 'Bağlantı tarayıcıda açılsın mı?', s);
  await evalJs(`(async () => { const b = window.__pdefe.aktif(); if (b) await window.__pdefe.belgeKapat(b.id); return 1; })()`).catch(() => {});

  // ---------------------------------------------------------------- 2. Arayüz köprüsü ve ana süreç denetimleri
  console.log('— Köprü ve ana süreç');
  /** Kanal çağrısının sonucu: { ok, deger } ya da { hata } (hata iletisinin "Error invoking remote method" öneki atılır). */
  const cagir = (kanal, ...args) => evalJs(`window.pdefe.cagir(${J(kanal)}, ...${J(args)}).then((d) => ({ ok: true, deger: d && d.veri ? { bayt: d.veri.length ?? d.veri.byteLength } : d }), (e) => ({ hata: String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }))`);
  const fs = await import('node:fs');
  const dosyaYaz = (ad, icerik) => { const y = path.join(CIKTI, ad); fs.writeFileSync(y, icerik); return y; };
  let r = await cagir('dosya:kopyala', baglantili, path.join(CIKTI, 'kopya.pdf'));
  sonuc('kaldırılan dosya:kopyala kanalı kullanılamaz', /İzin verilmeyen kanal/.test(r.hata || ''), r);
  r = await evalJs(`(() => { try { window.pdefe.gonder('bilinmeyen:kanal'); return 'gitti'; } catch (e) { return e.message; } })()`);
  sonuc('listede olmayan kanala gönderilemez', /İzin verilmeyen kanal/.test(r), r);
  r = await evalJs(`(() => { try { window.pdefe.dinle('bilinmeyen:kanal', () => {}); return 'dinlendi'; } catch (e) { return e.message; } })()`);
  sonuc('listede olmayan kanal dinlenemez', /İzin verilmeyen kanal/.test(r), r);
  r = await cagir('dosya:oku', baglantili);
  sonuc('dosya:oku PDF okur', r.ok && r.deger?.bayt > 0, r);
  const metinDosyasi = dosyaYaz('gizli.txt', 'kişisel veri');
  r = await cagir('dosya:oku', metinDosyasi);
  sonuc('dosya:oku PDF olmayan dosyayı okumaz', r.hata === 'Bu dosya bir PDF belgesi değil.', r);
  const sahtePdf = dosyaYaz('sahte.pdf', 'PDF değil, yalnızca adı .pdf');
  r = await cagir('dosya:oku', sahtePdf);
  sonuc('dosya:oku adı .pdf olan ama PDF olmayan dosyayı okumaz', r.hata === 'Bu dosya bir PDF belgesi değil.', r);
  r = await cagir('dosya:oku', path.join(CIKTI, 'yok-boyle-bir-dosya.pdf'));
  sonuc('dosya:oku olmayan dosyada okuma hatası verir ("PDF değil" demez)', /ENOENT/.test(r.hata || ''), r);
  const yazitipi = await evalJs(`window.pdefe.cagir('uygulama:klasorler').then((k) => k.yaziTipleri)`);
  r = await cagir('dosya:oku', path.join(yazitipi, 'arial.ttf'));
  sonuc('dosya:oku Windows yazı tipini okur', r.ok && r.deger?.bayt > 0, r);
  r = await cagir('dosya:oku', path.join(yazitipi, '..', 'win.ini'));
  sonuc('dosya:oku yazı tipi klasörünün dışına çıkmaz', !!r.hata, r);
  r = await cagir('kabuk:klasorAc', metinDosyasi);
  sonuc('kabuk:klasorAc dosya açmaz', r.ok && r.deger === false, r);
  r = await cagir('kabuk:klasorAc', CIKTI);
  sonuc('kabuk:klasorAc klasörü açar (test örneğinde kayda düşer)', r.ok && r.deger === true, r);
  r = await cagir('dosya:sil', metinDosyasi);
  sonuc('dosya:sil .pdf olmayanı silmez', r.ok && r.deger === false && fs.existsSync(metinDosyasi), r);
  r = await cagir('pano:dosya', metinDosyasi);
  sonuc('pano:dosya PDF olmayanı panoya koymaz', r.ok && r.deger?.tamam === false, r);
  r = await cagir('cekirdek:cagir', 'anlik_sil', { yol: sahtePdf });
  sonuc('anlik_sil anlık kopya olmayan dosyayı silmez', /İzin verilmeyen istek/.test(r.hata || '') && fs.existsSync(sahtePdf), r);
  r = await cagir('cekirdek:cagir', 'notlar_kaydet', { yol: baglantili, hedef: path.join(CIKTI, 'cikti.bat'), islemler: [] });
  sonuc('çekirdek .pdf dışında bir dosyaya yazmaz', r.hata === 'Yalnızca .pdf uzantılı dosyaya yazılabilir.' && !fs.existsSync(path.join(CIKTI, 'cikti.bat')), r);
  // Gezinme: sayfa uygulamanın dışına gidemez; window.open yalnızca web adresini dışarıda açar (burada file: denenir, hiçbir şey açılmaz)
  const pencereSayisi = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT || 9222}/json`)).json()).filter((h) => h.type === 'page').length;
  await evalJs(`(window.open('file:///C:/'), 1)`);
  await evalJs(`(location.href = 'https://ornek.invalid/', 1)`).catch(() => {});
  await bekle(1500);
  r = await evalJs('location.href');
  sonuc('sayfa uygulama dışına gezinemez', String(r).startsWith('pdefe://app/'), r);
  const sonra = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT || 9222}/json`)).json()).filter((h) => h.type === 'page').length;
  sonuc('window.open yeni pencere açmaz', sonra === pencereSayisi, { once: pencereSayisi, sonra });
  r = await evalJs(`document.querySelector('meta[http-equiv="Content-Security-Policy"]').content`);
  sonuc("CSP: object-src 'none', base-uri 'none', form-action 'none'", /object-src 'none'/.test(r) && /base-uri 'none'/.test(r) && /form-action 'none'/.test(r), r);
  for (const ad of ['gizli.txt', 'sahte.pdf']) fs.rmSync(path.join(CIKTI, ad), { force: true });

  // ---------------------------------------------------------------- 3. Silinen not dosyada iz bırakmaz
  console.log('— Silinen notun izi');
  const GIZLI = 'GIZLI-NOT-METNI-4711';
  const icindeMi = (yol) => fs.readFileSync(yol).includes(Buffer.from(GIZLI));
  /** Belgeyi açar, tek notunu siler ve kaydeder; yanit verilirse sorulan kutu otomatik yanıtlanır. Döner: { kaydedildi, soru, durum }. */
  const notuSilKaydet = (yol, yanit = null) => evalJs(`(async () => {
    const p = window.__pdefe;
    await p.dosyaAc(${J(yol)});
    const b = p.aktif();
    for (let i = 0; i < 80 && !(b.notlar && b.notlar.notlar.size); i++) await new Promise((c) => setTimeout(c, 100));
    const n = [...b.notlar.notlar.values()].find((x) => !x.silindi);
    if (!n) return { hata: 'not yüklenmedi' };
    b.notlar.sil(n);
    ${yanit ? `window.__pdefeOtoYanit = ${J(yanit)};` : 'delete window.__pdefeOtoYanit;'}
    const kaydedildi = await p.belgeKaydet(b);
    const soru = window.__pdefeOtoYanit?.son?.mesaj || null;
    delete window.__pdefeOtoYanit;
    const durum = document.querySelector('#durum-mesaj')?.textContent || '';
    await p.belgeKapat(b.id);
    return { kaydedildi, soru, durum };
  })()`);
  const notlu = path.join(CIKTI, 'notlu.pdf');
  sonuc('örnek belgede notun metni var', icindeMi(notlu));
  r = await notuSilKaydet(notlu);
  sonuc('imzasız belge: soru sorulmadan kaydedilir', r.kaydedildi === true && !r.soru, r);
  sonuc('imzasız belge: silinen notun metni dosyada kalmaz', !icindeMi(notlu));
  sonuc('imzasız belge: durum çubuğu "tam yazım" der', /tam yazım/.test(r.durum), r);
  const koru = path.join(CIKTI, 'notlu-imzali-koru.pdf');
  r = await notuSilKaydet(koru, { secim: 0 });
  sonuc('e-imzalı belge: sorulur', r.soru === 'Bu belge e-imzalı.', r);
  sonuc('e-imzalı belge, "İmzayı koru": kaydedilir, eski metin imza için kalır', r.kaydedildi === true && icindeMi(koru), r);
  const sil = path.join(CIKTI, 'notlu-imzali-sil.pdf');
  r = await notuSilKaydet(sil, { secim: 1 });
  sonuc('e-imzalı belge, "Tamamen sil": eski metin kalmaz', r.kaydedildi === true && !icindeMi(sil), r);
  // Uzantısı .pdf olmayan PDF ("Tüm dosyalar" süzgeciyle açılan) de kaydedilir: çekirdek var olan PDF'in üzerine yazabilir
  const uzantisiz = path.join(CIKTI, 'notlu-uzantisiz');
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), [path.join(KOK, 'test', 'guvenlik_pdf_uret.py'), CIKTI], { stdio: 'ignore' });   // notlu.pdf yeniden (not geri gelsin)
  fs.copyFileSync(path.join(CIKTI, 'notlu.pdf'), uzantisiz);
  r = await notuSilKaydet(uzantisiz);
  sonuc('uzantısı .pdf olmayan PDF kaydedilir, eski metin kalmaz', r.kaydedildi === true && !icindeMi(uzantisiz), r);
  // Farklı kaydet'te aynı dosya seçilirse de temiz yazılır
  const farkliAyni = path.join(CIKTI, 'notlu.pdf');
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:kaydetDiyalog', [${J(farkliAyni)}])`);
  r = await evalJs(`(async () => {
    const p = window.__pdefe;
    await p.dosyaAc(${J(farkliAyni)});
    const b = p.aktif();
    for (let i = 0; i < 80 && !(b.notlar && b.notlar.notlar.size); i++) await new Promise((c) => setTimeout(c, 100));
    const n = [...b.notlar.notlar.values()].find((x) => !x.silindi);
    if (!n) return { hata: 'not yüklenmedi' };
    b.notlar.sil(n);
    const kaydedildi = await p.belgeKaydet(b, true);
    await p.belgeKapat(b.id);
    return { kaydedildi };
  })()`);
  sonuc('Farklı kaydet ile aynı dosya: eski metin kalmaz', r.kaydedildi === true && !icindeMi(farkliAyni), r);
  fs.rmSync(uzantisiz, { force: true });

  // ---------------------------------------------------------------- 4. Pano ve hatırlanan sayfalar
  console.log('— Pano ve hatırlanan sayfalar');
  // Kopyalamadan sonra gelen temiz metin yalnızca pano hâlâ o metni taşıyorsa yazılır (koşullu); test örneğinde sistem panosuna yazılmaz
  const metinliPdf = path.join(KOK, 'test', 'pdf', 'dergipark_3972595_ttk_tbk.pdf');
  if (fs.existsSync(metinliPdf)) {
    await evalJs(`window.__pdefe.dosyaAc(${J(metinliPdf)}).then(() => 1)`);
    await kosul(`!!document.querySelector('.gorunum:not([hidden]) .textLayer span')`, 15000);
    await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
    const kopya = await evalJs(`(() => {
      const spanlar = [...document.querySelectorAll('.gorunum:not([hidden]) .textLayer span')].filter((s) => s.textContent.trim().length > 3).slice(0, 4);
      if (spanlar.length < 2) return null;
      const r = document.createRange(); r.setStart(spanlar[0].firstChild, 0); r.setEnd(spanlar.at(-1).firstChild, spanlar.at(-1).firstChild.length);
      const sec = getSelection(); sec.removeAllRanges(); sec.addRange(r);
      const veri = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: veri, bubbles: true, cancelable: true }));
      return veri.getData('text/plain');
    })()`);
    let kayit = null;
    for (let t0 = Date.now(); !kayit && Date.now() - t0 < 8000; await bekle(200)) kayit = (await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`)).find((k) => k.kanal === 'pano:metin') || null;
    sonuc('kopyalama: temiz metin panoya koşullu yazılır', !!kopya && kayit?.secenek?.kosullu === true, { kopya, kayit });
    await evalJs(`(async () => { getSelection().removeAllRanges(); const b = window.__pdefe.aktif(); if (b) await window.__pdefe.belgeKapat(b.id); return 1; })()`);
  } else console.log(`     · ${metinliPdf} yok; kopyalama denetimi atlandı`);
  // Ayarlar › Açılış ve düzen › Hatırlanan sayfaları temizle
  await evalJs(`window.pdefe.cagir('ayar:koy', 'sayfaKonumlari', { 'C:\\\\Deneme\\\\dava.pdf': 3 }).then(() => window.__pdefe.ayar().sayfaKonumlari = { 'C:\\\\Deneme\\\\dava.pdf': 3 })`);
  await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'acilis'), 1`);
  await kosul(`[...document.querySelectorAll('button')].some((b) => b.textContent === 'Hatırlanan sayfaları temizle')`);
  const dugme = `[...document.querySelectorAll('button')].find((b) => b.textContent === 'Hatırlanan sayfaları temizle')`;
  sonuc('"Hatırlanan sayfaları temizle" düğmesi var ve kayıt varken etkin', await evalJs(`!!${dugme} && !${dugme}.disabled`));
  await evalJs(`${dugme}.click(), 1`);
  await bekle(300);
  r = await evalJs(`window.pdefe.cagir('ayar:al', 'sayfaKonumlari')`);
  sonuc('temizleyince hatırlanan sayfalar silinir, düğme devre dışı kalır', J(r) === '{}' && await evalJs(`${dugme}.disabled`), r);
  await evalJs(`(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), 1)`);

  console.log(`\nSonuç: ${toplam - hataSayisi}/${toplam} geçti${hataSayisi ? `, ${hataSayisi} HATA` : ''}.`);
  if (hataSayisi) process.exitCode = 1;
}
