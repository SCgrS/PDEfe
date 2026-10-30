// Senaryo 47 (0.3.1, kullanıcı isteği: "tıklayarak işaretleme özelliğini getireceğiz mesela kutucuklu pdfler oluyor onlara"): etkileşimli form
// alanları (AcroForm). Gerçek fare ve klavye girdisiyle (CDP Input):
//   1) Katman: widget başına görünüm ve denetim, denetim görünümün üstünde (aynı kutu), salt okunur / imza / düğme pasif, gizli yok.
//   2) Onay kutusu: tıklayınca görünüm çekirdek beklenmeden değişir (öbür durumun görünümü), Boşluk da değiştirir; komut "Form: onay1", "s. 1".
//   3) Seçenek düğmesi: grupta tek seçili, seçiliye tıklayınca kalkmaz (NoToggleToOff), oklar grupta seçer.
//   4) Yazı alanı: Türkçe yazı, Tab ile uygulanır ve sonraki alana geçer, görünüm çekirdekten gelir (gelene dek denetim görünür), Esc geri
//      alır, Enter uygular, en çok 5 harf, tarak, çok satır (Enter yeni satır). İki widget'lı alanın öbür sayfadaki widget'ı da yeni değerle.
//   5) Açılır liste (klavyeyle), yazılabilir açılır liste, liste kutusu (tıklama), çok seçimli liste (Ctrl ile).
//   6) Tab sırası sayfalar boyunca (salt okunur atlanır, seçenek grubu tek durak, alansız sayfa atlanır, sondan başa), Shift+Tab, sayfa kayar.
//   7) Geri al / Yinele, geri al ▾ listesi ve durum çubuğundaki kaydedilmemiş değişiklikler listesinde "Form: …".
//   8) Kaydet: dosyada değerler (MuPDF ve pdf.js ile yeniden açılarak), görünümde Türkçe yazı (MuPDF), pdf.js'in çizdiği görünümde yazı;
//      kayıttan sonra belge temiz, kapatırken soru yok; yeniden açınca değerler.
//   9) Not aracı seçiliyken alana tıklama not koyar (alan değişmez), araç bırakılınca alan çalışır. Metin seçimi alanın üstünden geçebilir.
//  10) Görünüm döndürme, sayfa döndürme (kayıtla birlikte artımlı), koyu sayfa, %600: denetimler görünümlerle aynı yerde ve çalışır.
//  11) Yapısal kayıt (sayfa silinmiş): değerler sayfayla kopyalanır.
//  12) E-imzalı belge: artımlı kayıt, imzalanan baytlar değişmez (ByteRange'in özeti tutar), dolu alan değişince sorulur ("İmzayı koru").
//  13) XFA'lı karma belge: AcroForm alanları çalışır, kayıtta değer yazılır.
//  14) Sekmenin paketi (başka pencereye taşıma) form değerlerini ve komutlarını taşır; başka pencereye taşınan sekmede geri al çalışır.
//  15) İnceleme düzeltmeleri: En çok uzunluğu olmayan alana 20.000 sınırı (çekirdeğin sınırı), yakınlaştırmanın katman isteği ile
//      alandan çıkmanın görünüm isteği yarışında widget yeni değeri gösterir.
// Örnek PDF'ler test/form_alanlari_pdf_uret.py ile üretilir (betik kendisi çalıştırır; gerçek belge yok): test/cikti/s47/<koşum>/.
// Kullanım (ekran dışı):
//   powershell -File test\baslat.ps1 -Port 9310 -Veri "$env:TEMP\pdefe-s47-9310" -Boyut "1280,900"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9310; node test\surucu.mjs betik test\senaryo47.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,4".
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's47', Date.now().toString(36));   // her koşumda yeni klasör: çekirdek önceki dosyaları açık tutabilir
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));
const TURKCE = 'İĞŞÇÖÜ ığşçöü';

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const olc = (pdf, ...ek) => JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'form_olc.py'), pdf, ...ek], { encoding: 'utf8' }));

// Sayfaya yüklenen yardımcılar (window.__s47)
const YARDIMCI = `window.__s47 = {
  b: () => window.__pdefe.aktif(),
  g: () => window.__pdefe.aktif().gorunum,
  bekle: (ms) => new Promise((c) => setTimeout(c, ms)),
  istekler: [],
  izle() {
    const g = this.g();
    if (g.__s47) return;
    g.__s47 = true;
    const ozgun = g.cekirdek;
    g.cekirdek = async (y, p, ...a) => { if (y === 'form_gorunum') this.istekler.push({ sayfa: p?.sayfa, xrefler: p?.xrefler || null, degerler: (p?.degerler || []).length }); return ozgun(y, p, ...a); };
  },
  /** Ada (ve seçenek düğmesinde açık duruma) göre çizili widget öğesi; sayfa verilirse yalnızca o sayfada. */
  oge(ad, { sayfa = null, acik = null } = {}) {
    const g = this.g();
    for (const s of g.sayfalar) {
      if (sayfa && g.idx(s) + 1 !== sayfa) continue;
      for (const o of s._formOgeler?.values() || []) if (o.a.ad === ad && (acik == null || o.a.acik === acik)) return o;
    }
    return null;
  },
  /** Widget'ı görünür yapar (gerekirse sayfasına gidip katmanını bekler), ortasının pencere koordinatı. */
  async yer(ad, secenek = {}) {
    const g = this.g();
    for (let i = 0; i < 80; i++) {
      let o = this.oge(ad, secenek);
      if (!o && secenek.sayfa) { g.sayfayaGit(secenek.sayfa); await this.bekle(150); continue; }
      if (!o) { await this.bekle(100); continue; }
      // Ortası pencerede görünmeli (kenarlardan uzak; %600'de alan pencereden büyük olabilir)
      const r0 = o.el.getBoundingClientRect(), k = g.kaydirici.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
      if (cy < k.top + 30 || cy > k.bottom - 30 || cx < k.left + 20 || cx > k.right - 30) { o.el.scrollIntoView({ block: 'center', inline: 'center' }); await this.bekle(250); continue; }
      const st = g.kaydirici.scrollTop; await this.bekle(80);
      if (g.kaydirici.scrollTop !== st) continue;
      o = this.oge(ad, secenek);
      const r = o.el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, sol: r.left, ust: Math.max(r.top, k.top + 2) };
    }
    return null;
  },
  deger(ad) { const b = this.b(); for (const k of b.formlar.alanlar.values()) if (k.ad === ad) return b.formlar.simdi(k); return undefined; },
  odak() { const a = document.activeElement; const el = a?.closest?.('.form-alan'); if (!el) return null; const s = this.g().sayfalar.find((x) => x.el.contains(el)); const o = s?._formOgeler?.get(+el.dataset.xref); return o ? o.a.ad + (o.a.tur === 'secenek' ? ':' + o.a.acik : '') + '@' + (this.g().idx(s) + 1) : null; },
  async sakin(ad, secenek = {}) {
    for (let i = 0; i < 100; i++) { const o = this.oge(ad, secenek); if (o && !o.el.classList.contains('bekliyor')) return true; await this.bekle(50); }
    return false;
  },
  /** Widget görünümü ile denetimin kutusu (pencere px): fark en çok kaç px. */
  hiza(o) {
    if (!o || o.img.hidden) return null;
    const a = o.img.getBoundingClientRect(), b = o.el.getBoundingClientRect();
    return Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.right - b.right), Math.abs(a.bottom - b.bottom));
  },
};
true`;

export default async function ({ evalJs, bekle, tikla, yaz, tus, surukle, hedefSec }) {
  fs.mkdirSync(UI, { recursive: true });
  const ozet = JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'form_alanlari_pdf_uret.py'), UI], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  const kopya = (ad, kaynak = 'alanlar.pdf') => { const y = path.join(UI, ad); fs.copyFileSync(path.join(UI, kaynak), y); return y; };
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.stack || e.reason))); const ow = console.warn; console.warn = (...a) => { if (String(a[0]).startsWith('Form')) window.__hatalar.push('warn: ' + a.map(String).join(' ')); ow(...a); }; } return true; })()`);
  await evalJs(YARDIMCI);
  const kapatHepsini = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const ac = async (yol) => {
    await kapatHepsini();
    // Kalınan sayfadan açılabilir (son açılanlar): 1. sayfaya gidilip katmanı beklenir
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(yol)}); window.__s47.g().sayfayaGit(1); for (let i = 0; i < 100; i++) { const s = window.__s47.g()?.sayfalar?.[0]; if (s?._formOgeler?.size) break; await window.__s47.bekle(100); } window.__s47.izle(); window.__s47.istekler.length = 0; return true; })()`);
    await bekle(400);
  };
  const s47 = (ifade) => evalJs(`(async () => { const H = window.__s47; return ${ifade}; })()`);
  const yer = (ad, secenek = {}) => s47(`await H.yer(${J(ad)}, ${J(secenek)})`);
  const deger = (ad) => s47(`H.deger(${J(ad)})`);
  const odak = () => s47('H.odak()');
  const tiklaAlan = async (ad, secenek = {}, tik = {}) => { const p = await yer(ad, secenek); if (!p) return false; await tikla(p.x + (tik.dx || 0), p.y + (tik.dy || 0), tik); await bekle(120); return p; };

  const ALANLAR = kopya('alanlar-1.pdf');
  // ------------------------------------------------------------ 1) katman
  if (bolum(1) || bolum(2) || bolum(3) || bolum(4) || bolum(5) || bolum(6) || bolum(7) || bolum(8)) await ac(ALANLAR);
  if (bolum(1)) {
    const k = await s47(`(() => { const s = H.g().sayfalar[0], o = [...s._formOgeler.values()];
      return { katman: s.el.querySelectorAll(':scope > .form-katmani').length, sayi: o.length, gorunum: o.filter((x) => !x.img.hidden).length,
        hiza: Math.max(...o.map((x) => H.hiza(x) ?? 99)), pasif: o.filter((x) => x.el.classList.contains('pasif')).map((x) => x.a.ad),
        notAltinda: s.el.querySelector('.form-katmani').nextElementSibling === s.notKatmani, zIndex: getComputedStyle(s.el.querySelector('.form-katmani')).zIndex,
        imlec: { metin: getComputedStyle(o.find((x) => x.a.ad === 'ad').el).cursor, onay: getComputedStyle(o.find((x) => x.a.ad === 'onay1').el).cursor } }; })()`);
    sonuc('1) Sayfada tek form katmanı, 20 widget, hepsinin görünümü var', k.katman === 1 && k.sayi === 20 && k.gorunum === 20, k);
    sonuc('1) Denetimler görünümlerle aynı kutuda (en çok 2 px)', k.hiza <= 2, k.hiza);
    sonuc('1) Salt okunur, imza ve düğme pasif', J(k.pasif.sort()) === J(['gonder', 'imza', 'salt']), k.pasif);
    sonuc('1) Katman notların altında, metnin üstünde (z-index 3); imleç yazıda metin, onayda el', k.notAltinda && k.zIndex === '3' && k.imlec.metin === 'text' && k.imlec.onay === 'pointer', k);
    // Salt okunur alana tıklama bir şey değiştirmez
    await tiklaAlan('salt');
    sonuc('1) Salt okunur alana tıklama: değer ve odak değişmedi', (await deger('salt')) === 'Sabit' && !(await odak()));
  }

  // ------------------------------------------------------------ 2) onay kutusu
  if (bolum(2)) {
    await s47('(H.istekler.length = 0, true)');
    const once = await s47(`(() => { const o = H.oge('onay1'); return { src: o.img.src, diger: 'data:image/png;base64,' + o.gorunum.diger.png }; })()`);
    const p = await yer('onay1');
    await tikla(p.x, p.y);
    const hemen = await s47(`(() => { const o = H.oge('onay1'); return { src: o.img.src, aria: o.el.getAttribute('aria-checked'), istek: H.istekler.length }; })()`);
    sonuc('2) Tıklayınca görünüm hemen öbür durumun görünümü, çekirdeğe istek yok', hemen.src === once.diger && hemen.istek === 0, { istek: hemen.istek, ayni: hemen.src === once.diger });
    sonuc('2) Değer Yes, aria-checked true', (await deger('onay1')) === 'Yes' && hemen.aria === 'true');
    const komut = await s47(`(() => { const k = H.b().yigin.geriAlinacak; return { ad: k?.ad, ayrinti: k?.ayrinti }; })()`);
    sonuc('2) Komut "Form: onay1", ayrıntı "s. 1"', komut.ad === 'Form: onay1' && komut.ayrinti === 's. 1', komut);
    await tus(' ');
    await bekle(100);
    sonuc('2) Boşluk: kalktı (Off), görünüm ilk hâline döndü', (await deger('onay1')) === 'Off' && (await s47(`H.oge('onay1').img.src`)) === once.src);
    await tiklaAlan('onay2');
    sonuc('2) İkinci onay kutusu (açık durumu "Evet")', (await deger('onay2')) === 'Evet');
    sonuc('2) Belge değişti, Kaydet etkin', await s47(`H.b().degisti && !document.querySelector('#arac-cubugu [data-komut="dosya.kaydet"]').disabled`));
  }

  // ------------------------------------------------------------ 3) seçenek düğmesi
  if (bolum(3)) {
    await tiklaAlan('secim', { acik: 'B' });
    let d = await s47(`['A', 'B', 'C'].map((x) => H.oge('secim', { acik: x }).el.getAttribute('aria-checked'))`);
    sonuc('3) B seçildi, A ve C seçili değil', (await deger('secim')) === 'B' && J(d) === J(['false', 'true', 'false']), d);
    await tiklaAlan('secim', { acik: 'B' });
    sonuc('3) Seçiliye tıklayınca kalkmaz (NoToggleToOff)', (await deger('secim')) === 'B');
    await tus('ArrowRight');
    await bekle(150);
    sonuc('3) Sağ ok: C seçili ve odakta', (await deger('secim')) === 'C' && (await odak()) === 'secim:C@1', await odak());
    const gorunumler = await s47(`['A', 'B', 'C'].map((x) => H.oge('secim', { acik: x }).gorunum.durum)`);
    sonuc('3) Görünümler: yalnızca C açık', J(gorunumler) === J(['Off', 'Off', 'C']), gorunumler);
    await tus('z', ['ctrl']);
    await bekle(150);
    sonuc('3) Ctrl+Z (odak düğmede): B\'ye döndü', (await deger('secim')) === 'B');
  }

  // ------------------------------------------------------------ 4) yazı alanları
  if (bolum(4)) {
    await tiklaAlan('ad', { sayfa: 1 });
    sonuc('4) Yazı alanına tıklayınca denetim odakta, düzenleniyor (görünüm gizli)', await s47(`(() => { const o = H.oge('ad', { sayfa: 1 }); return document.activeElement === o.denetim && o.el.classList.contains('duzenleniyor') && getComputedStyle(o.img).visibility === 'hidden'; })()`));
    await yaz(TURKCE);
    await bekle(100);
    sonuc('4) Yazarken komut yok (değer uygulanmadı)', (await deger('ad')) === '' && !(await s47(`H.b().yigin.geriAlinacak?.ad === 'Form: ad'`)));
    await s47('(H.istekler.length = 0, true)');
    const srcOnce = await s47(`H.oge('ad', { sayfa: 1 }).img.src`);
    await tus('Tab');
    const hemen = await s47(`(() => { const o = H.oge('ad', { sayfa: 1 }); return { duzen: o.el.classList.contains('duzenleniyor'), bekliyor: o.el.classList.contains('bekliyor') }; })()`);
    await s47(`H.sakin('ad', { sayfa: 1 })`);
    const sonra = await s47(`(() => { const o = H.oge('ad', { sayfa: 1 }); return { src: o.img.src, duzen: o.el.classList.contains('duzenleniyor'), istek: H.istekler.filter((r) => r.xrefler).length }; })()`);
    sonuc('4) Tab: değer uygulandı (Türkçe)', (await deger('ad')) === TURKCE, await deger('ad'));
    sonuc('4) Tab: sonraki alan (unvan) odakta', (await odak()) === 'unvan@1', await odak());
    sonuc('4) Görünüm gelene dek denetim görünür kaldı, sonra yeni görünüm', hemen.duzen && sonra.src !== srcOnce && !sonra.duzen && sonra.istek >= 1, { hemen, istek: sonra.istek });
    // Escape geri alır
    await yaz('Hakim');
    await tus('Escape');
    await bekle(150);
    sonuc('4) Esc: yazılan atıldı, değer değişmedi, odak belgede', (await deger('unvan')) === 'Avukat' && !(await odak()));
    // Enter uygular
    await tiklaAlan('baslik');
    await yaz('Orta başlık');
    await tus('Enter');
    await bekle(150);
    sonuc('4) Enter: uygulandı', (await deger('baslik')) === 'Orta başlık');
    // En çok 5 harf
    await tiklaAlan('kisa');
    await yaz('abcdefgh');
    await tus('Tab');
    await bekle(150);
    sonuc('4) En çok 5 harf', (await deger('kisa')) === 'abcde', await deger('kisa'));
    // Tarak: harf aralığı hücre genişliği, 11 hane
    await tiklaAlan('tc');
    await yaz('123456789012345');
    const tarak = await s47(`(() => { const o = H.oge('tc'); return { ls: parseFloat(getComputedStyle(o.denetim).letterSpacing), max: o.denetim.maxLength }; })()`);
    await tus('Tab');
    await bekle(150);
    sonuc('4) Tarak: 11 hane, harf aralığı var', (await deger('tc')) === '12345678901' && tarak.max === 11 && tarak.ls > 5, tarak);
    // Çok satır: Enter yeni satır
    await tiklaAlan('aciklama');
    await yaz('Birinci satır');
    await yaz(String.fromCharCode(10));   // Enter'ın yazdığı satır sonu (CDP'nin Enter tuşu metin üretmez)
    await yaz('İkinci satır');
    await tus('Tab');
    await bekle(200);
    sonuc('4) Çok satır: Enter yeni satır', (await deger('aciklama')) === 'Birinci satır\nİkinci satır', await deger('aciklama'));
    // İki widget'lı alan: 3. sayfadaki widget aynı değeri gösterir (görünüm bekleyen değerle)
    const ucuncu = await s47(`(async () => { H.g().sayfayaGit(3); for (let i = 0; i < 60; i++) { const o = H.oge('ad', { sayfa: 3 }); if (o && !o.img.hidden) { await H.sakin('ad', { sayfa: 3 }); return { var: true, istek: H.istekler.filter((r) => r.sayfa === 3).map((r) => r.degerler) }; } await H.bekle(100); } return { var: false }; })()`);
    const p3 = await yer('ad', { sayfa: 3 });
    await tikla(p3.x, p3.y);
    await bekle(100);
    const d3 = await s47(`H.oge('ad', { sayfa: 3 }).denetim.value`);
    await tus('Escape');
    sonuc('4) İkinci widget (3. sayfa): görünüm bekleyen değerlerle istendi, denetim aynı değeri gösterir', ucuncu.var && ucuncu.istek.some((n) => n >= 1) && d3 === TURKCE, { ucuncu, d3 });
  }

  // ------------------------------------------------------------ 5) listeler
  if (bolum(5)) {
    await tiklaAlan('ilce');
    await yaz('Ümraniye');
    await tus('Tab');
    await bekle(150);
    sonuc('5) Yazılabilir açılır liste: serbest değer', (await deger('ilce')) === 'Ümraniye', await deger('ilce'));
    // Açılır liste: Shift+Tab ile odaklanıp ↓
    await tiklaAlan('ilce');
    await tus('Tab', ['shift']);
    await bekle(150);
    const il = await odak();
    await tus('ArrowDown');
    await bekle(200);
    sonuc('5) Açılır liste: Shift+Tab ile odakta, ↓ sonraki seçenek (34)', il === 'il@1' && (await deger('il')) === '34', { il, deger: await deger('il') });
    await s47(`H.sakin('il')`);
    // Liste kutusu: odaklanınca satırlar örtüde, 3. satıra tıklama
    const p = await yer('liste');
    await tikla(p.x, p.ust + 3);
    await bekle(150);
    const satir = await s47(`(() => { const o = H.oge('liste'); const r = o.liste?.querySelector('[data-i="2"]')?.getBoundingClientRect(); return r ? { x: r.left + 10, y: r.top + r.height / 2, h: r.height } : null; })()`);
    sonuc('5) Liste kutusu odakta, satırlar görünür (satır yüksekliği görünümünkü)', !!satir && Math.abs(satir.h - 11 * 1.15 * (await s47(`H.oge('liste').ptPx`))) < 1, satir);
    if (satir) { await tikla(satir.x, satir.y); await bekle(150); }
    sonuc('5) Liste kutusu: tıklanan satır seçildi (Üç)', J(await deger('liste')) === J(['Üç']), await deger('liste'));
    await tus('ArrowDown');
    await bekle(100);
    sonuc('5) Liste kutusu: ↓ sonraki (Dört)', J(await deger('liste')) === J(['Dört']), await deger('liste'));
    const pc = await yer('coklu');
    await tikla(pc.x, pc.ust + 3);
    await bekle(150);
    const satirlar = await s47(`[0, 2].map((i) => { const r = H.oge('coklu').liste.querySelector('[data-i="' + i + '"]').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 }; })`);
    await tikla(satirlar[0].x, satirlar[0].y);
    await tikla(satirlar[1].x, satirlar[1].y, { degistiriciler: ['ctrl'] });
    await bekle(150);
    sonuc('5) Çok seçimli liste: Ctrl ile iki seçim', J(await deger('coklu')) === J(['Kırmızı', 'Mavi']), await deger('coklu'));
    await tus('Escape');
    await bekle(150);
    sonuc('5) Esc: liste örtüsü kapandı', await s47(`!H.oge('coklu').liste`));
  }

  // ------------------------------------------------------------ 6) Tab sırası
  if (bolum(6)) {
    await s47(`(H.g().sayfayaGit(1), true)`);
    await tiklaAlan('ad', { sayfa: 1 });
    const sira = [await odak()];
    for (let i = 0; i < 20; i++) { await tus('Tab'); await bekle(i >= 14 ? 350 : 120); sira.push(await odak()); }
    const beklenen = ['ad@1', 'unvan@1', 'baslik@1', 'tc@1', 'kisa@1', 'uzun@1', 'oto@1', 'aciklama@1', 'onay1@1', 'onay2@1', `secim:${(await deger('secim')) === 'Off' ? 'A' : await deger('secim')}@1`,
      'il@1', 'ilce@1', 'liste@1', 'coklu@1', 'donuk_metin@2', 'donuk_onay@2', 'ad@3', 'yan@3', 'son@5', 'ad@1'];
    sonuc('6) Tab sırası: sayfalar boyunca (salt okunur ve alansız sayfa atlanır, grup tek durak, sondan başa döner)', J(sira.slice(0, beklenen.length)) === J(beklenen), sira);
    await tus('Tab', ['shift']);
    await s47(`(async () => { for (let i = 0; i < 60 && H.odak() !== 'son@5'; i++) await H.bekle(100); return true; })()`);   // sayfa çizilip katmanı kurulana dek

    sonuc('6) Shift+Tab: son alana (5. sayfa), sayfa kaydı', (await odak()) === 'son@5' && (await s47('H.g().gecerli')) === 5, { odak: await odak(), gecerli: await s47('H.g().gecerli') });
    await tus('Escape');
  }

  // ------------------------------------------------------------ 7) geri al listeleri
  if (bolum(7)) {
    await s47(`(H.g().sayfayaGit(1), true)`);
    const once = await s47(`H.b().yigin.yigin.length`);
    await tiklaAlan('onay1');
    const ad1 = await deger('onay1');
    await s47(`(document.activeElement.blur(), H.g().kaydirici.focus(), true)`);
    await tus('z', ['ctrl']);
    await bekle(100);
    const geri = await deger('onay1');
    await tus('y', ['ctrl']);
    await bekle(100);
    sonuc('7) Ctrl+Z / Ctrl+Y onay kutusunu geri alır ve yineler', geri !== ad1 && (await deger('onay1')) === ad1, { ad1, geri });
    await s47(`(document.querySelector('#dugme-geri-al-liste').click(), true)`);
    await bekle(300);
    const liste = await s47(`[...document.querySelectorAll('.gecmis-listesi li, .gecmis-liste li, [class*="gecmis"] li')].map((li) => li.textContent.trim()).slice(0, 30)`);
    sonuc('7) Geri al ▾ listesinde "Form: …" adımları', liste.some((t) => t.includes('Form: onay1')) && liste.some((t) => t.includes('Form: ad')), liste);
    await tus('Escape');
    await bekle(150);
    await s47(`(document.querySelector('#durum-degisiklik').click(), true)`);
    await bekle(300);
    const liste2 = await s47(`[...document.querySelectorAll('.gecmis-listesi li')].map((li) => li.textContent.trim()).slice(0, 30)`);
    sonuc('7) Durum çubuğundaki kaydedilmemiş değişiklikler listesinde "Form: onay1 · s. 1"', liste2.some((t) => t.includes('Form: onay1') && t.includes('s. 1')), liste2);
    await tus('Escape');
    await bekle(150);
    sonuc('7) Yığında form komutları', (await s47(`H.b().yigin.yigin.length`)) >= once);
  }

  // ------------------------------------------------------------ 8) kaydet
  if (bolum(8)) {
    // Bölüm 4 ve 5 koşmadıysa değerleri burada koy
    if (!(await deger('ad'))) {
      await tiklaAlan('ad', { sayfa: 1 }); await yaz(TURKCE); await tus('Tab'); await bekle(200);
      await tiklaAlan('onay1');
    }
    // Odaktaki yazı uygulanmadan kaydet (Ctrl+S'nin komutu: CDP tuşu menü kısayoluna ulaşmaz): yazılan da kaydedilmeli
    await tiklaAlan('son', { sayfa: 5 });
    await yaz('Odakta kaldı');
    const boyOnce = fs.statSync(ALANLAR).size, ilk = fs.readFileSync(ALANLAR);
    // Dosyada dolu olan bir alan (il: 06) değiştiyse belge temiz (baştan) yazılır: eski değer dosyanın önceki bölümünde kalmasın (0.1.23 kuralı)
    const temiz = await s47(`H.b().formlar.eskiDegerKalir()`);
    await s47(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
    const kaydedildi = await s47(`(async () => { for (let i = 0; i < 100; i++) { if (!H.b().degisti && !H.b().kaydediliyor) return true; await H.bekle(100); } return false; })()`);
    sonuc('8) Kaydet: kaydedildi, belge temiz, odak alanda kaldı', kaydedildi && (await odak()) === 'son@5', await s47(`({ degisti: H.b().degisti, fark: H.b().formlar.fark(), odak: H.odak() })`));
    const beklenen = await s47(`Object.fromEntries([...H.b().formlar.alanlar.values()].map((k) => [k.ad, H.b().formlar.simdi(k)]))`);
    sonuc('8) Odaktaki yazı kayıttan önce uygulandı', beklenen.son === 'Odakta kaldı', beklenen.son);
    await tus('Escape');
    const son = fs.readFileSync(ALANLAR);
    if (temiz) sonuc('8) Dolu alan değiştiği için temiz (baştan) yazım', !son.subarray(0, ilk.length).equals(ilk) && (await s47(`document.querySelector('#durum-mesaj, .durum-mesaj')?.textContent || ''`)).includes('tam yazım'));
    else sonuc('8) Artımlı kayıt (dosyanın başı aynen)', son.length > boyOnce && son.subarray(0, ilk.length).equals(ilk));
    const m = olc(ALANLAR);
    const esit = (a, b) => J(Array.isArray(a) ? a : a == null || a === '' ? [] : [a]) === J(Array.isArray(b) ? b : b == null || b === '' ? [] : [b]);
    const farklar = Object.entries(beklenen).filter(([ad, v]) => !esit(m.alanlar[ad], v) && !(typeof v === 'string' && m.alanlar[ad] === v));
    sonuc('8) MuPDF ile yeniden açınca bütün değerler aynı', !farklar.length, { farklar, mupdf: m.alanlar });
    sonuc('8) Görünümde Türkçe yazı (MuPDF, widget\'lar sayfaya işlenince)', m.metin.includes(TURKCE), m.metin.slice(0, 300));
    // pdf.js ile: alan değerleri ve görünümün çizimi (annotationMode ENABLE)
    const pj = await s47(`(async () => {
      const pdfjs = await import('../../node_modules/pdfjs-dist/build/pdf.min.mjs');
      const { veri } = await window.pdefe.cagir('dosya:oku', ${J(ALANLAR)});
      const gorev = pdfjs.getDocument({ data: veri, enableXfa: false, isEvalSupported: false }), doc = await gorev.promise;
      const p = await doc.getPage(1), an = await p.getAnnotations();
      const degerler = {}; for (const a of an) if (a.fieldName && !(a.fieldName in degerler)) degerler[a.fieldName] = a.fieldValue ?? a.buttonValue;
      const vp = p.getViewport({ scale: 2 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await p.render({ canvasContext: c.getContext('2d'), viewport: vp, annotationMode: pdfjs.AnnotationMode.ENABLE }).promise;
      const a = an.find((x) => x.fieldName === 'ad'), [x0, y0] = vp.convertToViewportPoint(a.rect[0], a.rect[1]), [x1, y1] = vp.convertToViewportPoint(a.rect[2], a.rect[3]);
      const d = c.getContext('2d').getImageData(Math.min(x0, x1) + 4, Math.min(y0, y1) + 4, Math.abs(x1 - x0) - 8, Math.abs(y1 - y0) - 8).data;
      let koyu = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 480) koyu++;
      await gorev.destroy();
      return { degerler, koyu };
    })()`);
    sonuc('8) pdf.js: alan değerleri', pj.degerler.ad === TURKCE && pj.degerler.onay1 === beklenen.onay1, pj.degerler);
    const ad = ozet.alanlar.find((o) => o.ad === 'ad');
    const mur = olc(ALANLAR, '--murekkep', '1', '174,74,466,88').murekkep;
    sonuc('8) pdf.js görünümü çiziyor: "ad" alanında yazı (MuPDF çizimine yakın)', pj.koyu > 150 && mur > 150 && pj.koyu > mur * 0.5 && pj.koyu < mur * 2, { pdfjs: pj.koyu, mupdf: mur, ad: ad.xref });
    // Kapatırken soru yok, yeniden açınca değerler
    await evalJs(`window.__pdefeOtoYanit = { secim: 2 }; true`);
    await s47(`(async () => { await window.__pdefe.belgeKapat(H.b().id); return true; })()`);
    const soru = await evalJs(`window.__pdefeOtoYanit.son?.mesaj || null`);
    await evalJs(`delete window.__pdefeOtoYanit; true`);
    sonuc('8) Kayıttan sonra kapatırken kaydetme sorusu yok', !soru, soru);
    await ac(ALANLAR);
    await yer('ad', { sayfa: 1 });
    const yeni = await s47(`({ ad: H.oge('ad', { sayfa: 1 }).kayit.kayitli, onay1: H.oge('onay1').kayit.kayitli, degisti: H.b().degisti })`);
    sonuc('8) Yeniden açınca değerler dosyadan', yeni.ad === TURKCE && yeni.onay1 === beklenen.onay1 && !yeni.degisti, yeni);
  }

  // ------------------------------------------------------------ 9) not aracı ve metin seçimi
  if (bolum(9)) {
    await ac(kopya('alanlar-9.pdf'));
    const notOnce = await s47(`H.b().notlar.liste().length`);
    const p9 = await yer('onay2');
    await s47(`(H.b().notlar.aracSec('not'), true)`);
    const sinif = await s47(`H.g().kok.classList.contains('form-arac') && getComputedStyle(H.oge('onay2').el).pointerEvents === 'none'`);
    await tikla(p9.x, p9.y);
    await bekle(300);
    const r9 = await s47(`({ not: H.b().notlar.liste().length, onay2: H.deger('onay2') })`);
    sonuc('9) Not aracı seçiliyken alanlar tıklamayı almaz; tıklama not koyar, alan değişmez', sinif && r9.not === notOnce + 1 && r9.onay2 === 'Off', { sinif, r9 });
    await tus('Escape'); await tus('Escape');
    await s47(`(document.activeElement?.blur?.(), H.b().notlar.arac && H.b().notlar.aracSec(null), true)`);
    await tiklaAlan('onay1');   // onay2'nin üstünde artık not simgesi var
    sonuc('9) Araç bırakılınca alan çalışır', (await deger('onay1')) === 'Yes' && !(await s47(`H.g().kok.classList.contains('form-arac')`)));
    // Metin seçimi etiketten başlayıp alanın üstünden geçer
    await yer('ad', { sayfa: 1 });
    const e = await s47(`(() => { const s = H.g().sayfalar[0]; const sp = [...s.el.querySelectorAll('.textLayer span')].find((x) => x.textContent === 'Ad'); const r = sp.getBoundingClientRect(); const o = H.oge('ad', { sayfa: 1 }).el.getBoundingClientRect(); return { x: r.left + 1, y: r.top + r.height / 2, x2: o.right - 10, y2: o.bottom + 40 }; })()`);
    await surukle(e.x, e.y, e.x2, e.y2);
    await bekle(200);
    const secim = await evalJs(`window.getSelection().toString().length`);
    sonuc('9) Etiketten başlayan metin seçimi alanın üstünden geçer', secim > 2 && (await deger('ad')) === '' && !(await odak()), { secim, odak: await odak() });
    await evalJs(`(window.getSelection().removeAllRanges(), true)`);
  }

  // ------------------------------------------------------------ 10) döndürme, koyu sayfa, %600
  if (bolum(10)) {
    const yol10 = kopya('alanlar-10.pdf');
    await ac(yol10);
    const hizaSayfa = (no) => s47(`(async () => { for (let i = 0; i < 60; i++) { const s = H.g().sayfalar[${no - 1}]; if (s._formOgeler?.size && [...s._formOgeler.values()].every((o) => !o.img.hidden)) break; await H.bekle(100); } const s = H.g().sayfalar[${no - 1}]; return Math.max(...[...(s._formOgeler?.values() || [])].map((o) => H.hiza(o) ?? 99)); })()`);
    await s47(`(H.g().sayfayaGit(2), true)`);
    sonuc('10) /Rotate 90\'lı sayfa: denetimler görünümlerle aynı yerde', (await hizaSayfa(2)) <= 2, await hizaSayfa(2));
    // /MK /R 90 alan: denetim alanın yönünde (saat yönünde 270°), yazılan uygulanır
    await s47(`(H.g().sayfayaGit(3), true)`);
    const h3 = await hizaSayfa(3);
    await tiklaAlan('yan', { sayfa: 3 });
    const yan = await s47(`(() => { const o = H.oge('yan', { sayfa: 3 }), r = o.denetim.getBoundingClientRect(), e = o.el.getBoundingClientRect(); return { egim: o.egim, donuk: getComputedStyle(o.denetim).transform !== 'none', ayni: Math.abs(r.width - e.width) < 2 && Math.abs(r.height - e.height) < 2 }; })()`);
    await yaz('Yan yazı');
    await tus('Tab');
    await bekle(200);
    sonuc('10) /MK /R 90 alan: yerinde, denetim 270° döndürülmüş, yazı uygulanır', h3 <= 2 && yan.egim === 270 && yan.donuk && yan.ayni && (await deger('yan')) === 'Yan yazı', { h3, yan });
    await s47(`(H.g().dondur(90), true)`);
    await bekle(800);
    await s47(`(H.g().sayfayaGit(1), true)`);
    sonuc('10) Görünüm 90° döndürülünce 1. sayfada aynı yerde', (await hizaSayfa(1)) <= 2, await hizaSayfa(1));
    const egim = await s47(`({ ad: H.oge('ad', { sayfa: 1 })?.egim, donuk: null })`);
    await tiklaAlan('onay1');
    sonuc('10) Döndürülmüş görünümde onay kutusu tıklanır; yazının yönü 90°', (await deger('onay1')) === 'Yes' && egim.ad === 90, egim);
    await tiklaAlan('ad', { sayfa: 1 });
    await yaz('Dönük');
    await tus('Tab');
    await bekle(200);
    sonuc('10) Döndürülmüş görünümde yazı', (await deger('ad')) === 'Dönük');
    await s47(`(H.g().dondur(270), true)`);
    await bekle(600);
    // Koyu sayfa
    await s47(`(H.g().koyuSayfaAyarla(true), true)`);
    await bekle(800);
    const koyu = await s47(`getComputedStyle(H.g().sayfalar[0].el.querySelector('.form-katmani')).filter`);
    sonuc('10) Koyu sayfada form katmanı sayfayla birlikte ters çevrilir', /invert\(1\)/.test(koyu), koyu);
    await s47(`(H.g().koyuSayfaAyarla(false), true)`);
    // %600
    await s47(`(H.g().zoomAyarla(6), true)`);
    await bekle(1500);
    sonuc('10) %600: denetimler görünümlerle aynı yerde (en çok 3 px)', (await hizaSayfa(1)) <= 3, await hizaSayfa(1));
    await tiklaAlan('baslik');
    await yaz('Altı yüz');
    await tus('Tab');
    await bekle(300);
    sonuc('10) %600: yazı alanı çalışır', (await deger('baslik')) === 'Altı yüz');
    await s47(`(window.__pdefe.komutCalistir('gorunum.zoom', 'genislik'), true)`);
    await bekle(800);
    // Sayfa döndürme + form değeri: artımlı kayıt, sayfa /Rotate'i ve değerler
    await s47(`(async () => { await window.__pdefe.sayfalariDondur(H.b(), [1], 90); return true; })()`);
    await bekle(800);
    const ilk10 = fs.readFileSync(yol10);
    await s47(`(async () => { await window.__pdefe.belgeKaydet(H.b()); return true; })()`);
    const son10 = fs.readFileSync(yol10);
    const m10 = olc(yol10);
    sonuc('10) Sayfa döndürülüp kaydedilince: artımlı, değerler yazıldı', son10.subarray(0, ilk10.length).equals(ilk10) && m10.alanlar.ad === 'Dönük' && m10.alanlar.baslik === 'Altı yüz' && m10.alanlar.onay1 === 'Yes', m10.alanlar);
    await s47(`(H.g().sayfayaGit(1), true)`);
    sonuc('10) Kayıttan sonra döndürülmüş sayfada denetimler yerinde', (await hizaSayfa(1)) <= 2, await hizaSayfa(1));
  }

  // ------------------------------------------------------------ 11) yapısal kayıt
  if (bolum(11)) {
    const yol11 = kopya('alanlar-11.pdf');
    await ac(yol11);
    await s47(`(async () => { const b = H.b(); const t = b.gorunum.tarif().filter((_, i) => i !== 3); await window.__pdefe.sayfaTarifiUygula(b, t, 'Sayfa sil'); return true; })()`);
    await bekle(600);
    await tiklaAlan('unvan');
    await tus('End');
    await yaz(' Şube');
    await tus('Tab');
    await bekle(200);
    await tiklaAlan('son', { sayfa: 4 });
    await yaz('Yapısal');
    await tus('Tab');
    await bekle(200);
    await s47(`(async () => { await window.__pdefe.belgeKaydet(H.b()); return true; })()`);
    const m11 = olc(yol11);
    sonuc('11) Sayfa silinip kaydedilince (yapısal): 4 sayfa, değerler sayfalarla kopyalandı', m11.sayfa === 4 && m11.alanlar.unvan === 'Avukat Şube' && m11.alanlar.son === 'Yapısal' && m11.metin.includes('Avukat Şube'), { sayfa: m11.sayfa, alanlar: m11.alanlar });
    await tiklaAlan('onay1');
    await s47(`(async () => { await window.__pdefe.belgeKaydet(H.b()); return true; })()`);
    const m11b = olc(yol11);
    sonuc('11) Yapısal kayıttan sonra yeni değişiklik ve ikinci kayıt: önceki değerler kalır', m11b.alanlar.onay1 === 'Yes' && m11b.alanlar.unvan === 'Avukat Şube' && m11b.alanlar.son === 'Yapısal', m11b.alanlar);
  }

  // ------------------------------------------------------------ 12) e-imzalı belge
  if (bolum(12)) {
    const yol12 = kopya('imzali-12.pdf', 'imzali.pdf');
    await ac(yol12);
    const ilk = fs.readFileSync(yol12);
    const br = ilk.toString('latin1').match(/\/ByteRange\s*\[\s*0\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    const [a, b2, c] = br.slice(1).map(Number);
    const ozetTut = (veri) => createHash('sha256').update(Buffer.concat([ilk.subarray(0, a), ilk.subarray(b2, b2 + c)])).digest('hex') === veri.subarray(a + 1, a + 65).toString('latin1');
    sonuc('12) Örnek: ByteRange\'in özeti tutuyor', ozetTut(ilk));
    await tiklaAlan('not');
    await yaz(TURKCE);
    await tus('Tab');
    await bekle(150);
    await tiklaAlan('kabul');
    await evalJs(`window.__pdefeOtoYanit = { secim: 0 }; true`);
    await s47(`(async () => { await window.__pdefe.belgeKaydet(H.b()); return true; })()`);
    const soru1 = await evalJs(`window.__pdefeOtoYanit.son?.mesaj || null`);
    const son = fs.readFileSync(yol12);
    sonuc('12) Boş alanı doldurunca soru yok, artımlı kayıt, imzalanan baytlar aynı, özet tutuyor', !soru1 && son.subarray(0, ilk.length).equals(ilk) && ozetTut(son), soru1);
    const m12 = olc(yol12);
    sonuc('12) Değerler', m12.alanlar.not === TURKCE && m12.alanlar.kabul === 'Yes', m12.alanlar);
    await evalJs(`window.__pdefeOtoYanit = { secim: 0 }; true`);
    await tiklaAlan('not');
    await tus('End');
    await yaz(' ek');
    await tus('Tab');
    await bekle(150);
    await s47(`(async () => { await window.__pdefe.belgeKaydet(H.b()); return true; })()`);
    const soru2 = await evalJs(`window.__pdefeOtoYanit.son?.mesaj || null`);
    await evalJs(`delete window.__pdefeOtoYanit; true`);
    const son2 = fs.readFileSync(yol12);
    sonuc('12) Dolu alan değişince "Bu belge e-imzalı." sorulur; İmzayı koru: artımlı, imza baytları aynı', soru2 === 'Bu belge e-imzalı.' && son2.subarray(0, ilk.length).equals(ilk) && ozetTut(son2) && olc(yol12).alanlar.not === TURKCE + ' ek', soru2);
  }

  // ------------------------------------------------------------ 13) XFA'lı karma belge
  if (bolum(13)) {
    const yol13 = kopya('karma-13.pdf', 'karma.pdf');
    await ac(yol13);
    sonuc('13) Karma belge: alanlar katmanda', (await s47(`H.g().sayfalar[0]._formOgeler.size`)) === 2);
    await tiklaAlan('kisi');
    await s47(`(document.activeElement.select(), true)`);
    await yaz('Yeni kişi');
    await tus('Tab');
    await bekle(150);
    await evalJs(`window.__pdefeOtoYanit = { secim: 1 }; true`);   // dolu alan değişti: temiz yazım (imzasız belgede sorulmaz)
    await s47(`(async () => { await window.__pdefe.belgeKaydet(H.b()); return true; })()`);
    await evalJs(`delete window.__pdefeOtoYanit; true`);
    const m13 = olc(yol13);
    sonuc('13) Kayıtta değer yazıldı, XFA paketi kaldırıldı', m13.alanlar.kisi === 'Yeni kişi' && !m13.xfa, m13);
  }

  // ------------------------------------------------------------ 14) sekme taşıma
  if (bolum(14)) {
    const yol14 = kopya('alanlar-14.pdf');
    await ac(yol14);
    await tiklaAlan('onay1');
    await tiklaAlan('ad', { sayfa: 1 });
    await yaz('Taşınan');
    await tus('Tab');
    await bekle(200);
    const paket = await s47(`(async () => { const p = await window.__pdefe.sekmePaketi(H.b()); return { yigin: p.yigin && p.yigin.komutlar.map((k) => k.tur + ':' + k.ad), formlar: p.formlar.alanlar.filter((k) => 'deger' in k).map((k) => k.ad + '=' + k.deger) }; })()`);
    sonuc('14) Sekme paketi form komutlarını ve değerlerini taşır', J(paket.yigin) === J(['form.deger:Form: onay1', 'form.deger:Form: ad']) && paket.formlar.includes('onay1=Yes') && paket.formlar.includes('ad=Taşınan'), paket);
    const once = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT}/json`)).json()).filter((h) => h.type === 'page' && /index\.html/.test(h.url)).map((h) => h.id);
    await s47(`(async () => { await window.__pdefe.sekmeyiTasi(H.b().id, { tur: 'yeni' }); return true; })()`);
    let yeniHedef = null;
    for (let i = 0; i < 50 && !yeniHedef; i++) {
      await bekle(200);
      const h = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT}/json`)).json()).filter((x) => x.type === 'page' && /index\.html/.test(x.url) && !once.includes(x.id));
      yeniHedef = h[0] || null;
    }
    sonuc('14) Sekme yeni pencereye taşındı', !!yeniHedef);
    if (yeniHedef) {
      hedefSec(yeniHedef.id);
      await bekle(1500);
      await evalJs(YARDIMCI);
      await evalJs(`(async () => { for (let i = 0; i < 60; i++) { if (window.__pdefe.aktif()?.gorunum?.sayfalar?.[0]?._formOgeler?.size) return true; await new Promise((c) => setTimeout(c, 100)); } return false; })()`);
      const r14 = await s47(`({ ad: H.deger('ad'), onay1: H.deger('onay1'), degisti: H.b().degisti, yigin: H.b().yigin.yigin.map((k) => k.ad), img: !H.oge('onay1').img.hidden })`);
      sonuc('14) Yeni pencerede değerler, kaydedilmemiş durum ve geri al geçmişi', r14.ad === 'Taşınan' && r14.onay1 === 'Yes' && r14.degisti && J(r14.yigin) === J(['Form: onay1', 'Form: ad']), r14);
      await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), true)`);
      await bekle(300);
      sonuc('14) Yeni pencerede Geri al: "ad" eski değerine döndü', (await deger('ad')) === '', await deger('ad'));
      await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); setTimeout(() => window.close(), 200); return true; })()`).catch(() => {});
      hedefSec(null);
      await bekle(800);
    }
  }

  // ------------------------------------------------------------ 15) inceleme düzeltmeleri (0.3.1)
  if (bolum(15)) {
    const yol15 = kopya('alanlar-15.pdf');
    await ac(yol15);
    // En çok uzunluğu olmayan alana çekirdeğin sınırı (20.000) konur, daha uzun değer kesilir: Form istekleri hata vermez
    const u = await s47(`(async () => {
      const f = H.b().formlar, o = H.oge('aciklama'), k = H.oge('kisa');
      o.denetim.focus(); o.denetim.value = 'x'.repeat(20005); f.uygula(o); o.denetim.blur();
      await H.bekle(300);
      let hata = '';
      try { await H.g().cekirdek('form_gorunum', { yol: H.b().yol, sayfa: 1, olcek: 1, dondurme: 0, degerler: f.bekleyenler(H.b().yol), xrefler: [o.a.xref] }); } catch (e) { hata = String(e?.message || e); }
      return { sinir: o.denetim.maxLength, kisa: k.denetim.maxLength, uzunluk: (H.deger('aciklama') || '').length, hata };
    })()`);
    sonuc('15) Uzunluk sınırı: en çok uzunluğu olmayan alanda 20.000, "kisa"da 5, uzun değer kesildi, görünüm alınabiliyor', u.sinir === 20000 && u.kisa === 5 && u.uzunluk === 20000 && !u.hata, u);
    await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), true)`);
    await bekle(300);
    // Yarış: Yakınlaştırınca giden katman isteği (eski değerle) alandan Tab ile çıktıktan sonra dönüyor. Önceden widget eski değeri gösteriyordu
    // (yeni görünüm isteği anahtar değiştiği için atılıyordu). Katman isteğinin yanıtı 800 ms geciktirilir
    await tiklaAlan('ad', { sayfa: 1 });
    await yaz('Yarış');
    await s47(`(() => {
      const g = H.g(), asil = g.cekirdek;
      H._asil = asil;
      g.cekirdek = (yontem, p, ...r) => { const s = asil.call(g, yontem, p, ...r); return yontem === 'form_gorunum' && !p.xrefler && !p.alanlar ? s.then((x) => new Promise((c) => setTimeout(() => c(x), 800))) : s; };
      g.zoomAyarla(g.olcek * 1.25);
      return true;
    })()`);
    await bekle(150);
    await tus('Tab');
    await bekle(2500);
    const y = await s47(`(async () => {
      const g = H.g(); g.cekirdek = H._asil;
      const o = H.oge('ad', { sayfa: 1 }), s = o.s, c = s.cizim, f = H.b().formlar;
      const r = await g.cekirdek('form_gorunum', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, olcek: Math.min(6, c.olcek * (96 / 72) * (window.devicePixelRatio || 1)), dondurme: c.dondurme,
        degerler: f.bekleyenler(s.kaynak.yol), xrefler: [o.a.xref] });
      const bek = r.widgetlar.find((w) => w.xref === o.a.xref);
      return { deger: H.deger('ad'), ayni: !!bek && bek.png === o.gorunum?.png, anahtar: s._formAnahtar, olcek: c.olcek, bekliyor: o.el.classList.contains('bekliyor') };
    })()`);
    sonuc('15) Yakınlaştırma ile alan değişikliği yarışı: widget yeni değerin görünümünü gösteriyor (yeni ölçekte)', y.deger === 'Yarış' && y.ayni && !y.bekliyor, y);
  }

  const hatalar = await evalJs(`(window.__hatalar || []).slice(0, 8)`).catch(() => []);
  sonuc('Sayfada hata yok', !hatalar?.length, hatalar);
  await kapatHepsini().catch(() => {});
  console.log(hataSayisi ? `${hataSayisi} HATA / ${denetim}` : `BÜTÜN DENETİMLER GEÇTİ (${denetim})`);
}
