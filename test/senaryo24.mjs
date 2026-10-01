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
  sonuc('dosya:oku olmayan dosyada "bulunamadı" der', /^Dosya bulunamadı/.test(r.hata || ''), r);
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

  console.log(`\nSonuç: ${toplam - hataSayisi}/${toplam} geçti${hataSayisi ? `, ${hataSayisi} HATA` : ''}.`);
  if (hataSayisi) process.exitCode = 1;
}
