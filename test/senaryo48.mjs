// Senaryo 48 (0.3.1, kullanıcı isteği: "Bireysel başvuru formunda açabilir hale getireceğiz. bb formunda sayfa ekleme tuşunun çalışabilir,
// tüm fonksiyonların çalışabilir haline gelmesi lazım"): dinamik (saf) XFA formu. Gerçek fare ve klavye girdisiyle (CDP Input):
//   1) Açılış: XFA kipi (PDF.js'in XFA katmanı), "Sayfa 1 / 1", Türkçe başlık, yazı tipi bilgisayardaki Arial (PDF.js'in yedeği değil),
//      not araçları ve sayfa döndürme soluk, Sıkıştır "XFA formlarında kullanılamaz" der, Sayfalar panelinde küçük resim (düz PDF'ten).
//   2) Alanlar: yazı alanına Türkçe yazı (Tab ile uygulanır), onay kutusu, açılır liste; komutlar "Form: <alanın açıklaması>", "s. 1".
//   3) Satır Ekle: sayfa sayısı 2 ve 3, sayfa numaraları, değerler korunur, görünüm yerinde kalır; sınırda (occur max 3) uyarı, komut yok.
//   4) Son Satırı Sil, Geri al / Yinele (yapı ve değer komutları ters sırayla, değerler yerinde), en az örnekte uyarı.
//   5) Betiği tanınmayan düğme: "işlevi PDEfe'de çalışmıyor", işaretli.
//   6) Görünürlük (presence): "Mesajı Gizle" Mesaj düğmesini gizler, geri alınır.
//   7) Bul: etiketlerde ve alanın değerinde, bütün sayfalarda; vurgu XFA katmanında.
//   8) Kaydet: değerler, örnek sayısı ve görünürlük dosyada (datasets, şablon), kullanım hakları imzası kaldırıldı, MuPDF onarmadan açıyor;
//      yeniden açınca değerler ve sayfalar yerinde, belge temiz.
//   9) "Formu Kaydet" düğmesi Farklı kaydet'i açar; yeni dosyaya yazılır, sekme yeni dosyada.
//  10) Yazdırma: düz PDF'te sayfa sayısı, değerler ve sayfa numaraları var, formun düğmeleri basılmaz; yazdırma penceresi açılır.
//  11) Yakınlaştırınca odaktaki alan ve yazılan metin korunur; kapatırken kaydedilmemiş değişiklik sorulur.
//  12) Sekme başka pencereye taşınır: değerler, sayfa sayısı ve geri al geçmişi (yapı komutu dâhil) taşınır.
//  13) Karma belge (XFA paketli, AcroForm alanlı) XFA kipine girmez, AcroForm yolunda kalır.
//  14) Görünmez e-imzalı form (0.3.1 inceleme): Kaydederken sorulur. İmzayı koru: PDF.js'in artımlı kaydı yazılır (imzalanan baytlar ve
//      kullanım hakları imzası yerinde), seçim hatırlanır. Tamamen sil: baştan yazılır. Vazgeç: dosya değişmez.
//  15) Yeniden kurma sürerken (0.3.1 inceleme): Geri al'ın ardından sekme paketi kurulmanın bitmesini bekler (baytlar ve yığının
//      konumu tutar), düğme işi sürerken sekme taşınmaz, otomatik kayıt dizilim bitince yapılır.
//  16) Kabul sınaması: Tab sayfadaki sırayla (şablondaki sırayla değil), sayfa sonunda sonraki sayfaya; odaktaki düğmede Boşluk; yazısı alana
//      sığmayan alan işaretlenir, söylenir, yazdırma penceresi uyarır.
// Örnek PDF test/xfa_pdf_uret.py ile üretilir (gerçek belge yok): test/cikti/s48/<koşum>/.
// Kullanım (ekran dışı):
//   powershell -File test\baslat.ps1 -Port 9310 -Veri "$env:TEMP\pdefe-s48-9310" -Boyut "1280,900"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9310; node test\surucu.mjs betik test\senaryo48.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,3".
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's48', Date.now().toString(36));
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

/** Kaydedilen XFA dosyasının ölçümü (çekirdeğin paket okuyucusuyla): onarıldı mı, kullanım hakları, datasets'teki değerler ve gruplar. */
const OLC = `
import html, json, re, sys
sys.path.insert(0, r"${path.join(KOK, 'core').replace(/\\/g, '\\\\')}")
import pymupdf
from islemler import xfa
d = pymupdf.open(sys.argv[1])
p = xfa._paketler(d)
veri = html.unescape(d.xref_stream(p["datasets"]).decode("utf-8"))   # PDF.js Türkçe harfleri &#x..; olarak yazar
sablon = d.xref_stream(p["template"]).decode("utf-8")
m = re.search(r'<field name="Mesaj"[^>]*>', sablon)
print(json.dumps({"onarildi": d.is_repaired, "hak": xfa._kullanim_hakki_var(d), "saf": xfa._saf_mi(d, p), "veri": veri,
  "satir": len(re.findall(r"<Satir[ >/]", veri)), "mesaj": m.group(0) if m else None}, ensure_ascii=False))
`;

const YARDIMCI = `window.__s48 = {
  b: () => window.__pdefe.aktif(),
  g: () => window.__pdefe.aktif().gorunum,
  bekle: (ms) => new Promise((c) => setTimeout(c, ms)),
  /** Bekleyen yeniden kurma ve değer işleri bitene dek. */
  async durgun() {
    const b = this.b();
    for (let i = 0; i < 200; i++) { if (b && !b.xfa.mesgul) break; await this.bekle(50); }
    await b?.xfa._kuyruk;
    await this.bekle(80);
    return true;
  },
  /** XFA katmanında ad yolu ad olan alanın denetimi (i'inci örnek). */
  denetim(ad, i = 0) {
    const el = document.querySelectorAll('.gorunum:not([hidden]) .xfaLayer [xfaname="' + ad + '"]')[i];
    return el?.querySelector('input, textarea, select, button') || null;
  },
  /** Öğeyi görünür yapar (gerekirse sayfasına gidip katmanını bekler), ortasının pencere koordinatı. */
  async yer(ad, i = 0, sayfa = null) {
    const g = this.g();
    for (let k = 0; k < 80; k++) {
      const el = this.denetim(ad, i);
      if (!el) { if (sayfa) g.sayfayaGit(sayfa); await this.bekle(120); continue; }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      await this.bekle(200);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  },
  numaralar() { return [...document.querySelectorAll('.gorunum:not([hidden]) .xfaLayer [xfaname="Numara"]')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()); },
  yigin() { return this.b().yigin.yigin.slice(0, this.b().yigin.konum).map((k) => k.ad + (k.ayrinti ? ' ' + k.ayrinti : '')); },
  bildirim() { const e = document.getElementById('bildirim'); return e && !e.hidden ? e.textContent : ''; },
};`;

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, yaz, tus, hedefSec }) {
  fs.mkdirSync(UI, { recursive: true });
  const ozet = JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'xfa_pdf_uret.py'), UI], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  const kopya = (ad) => { const y = path.join(UI, ad); fs.copyFileSync(ozet.xfa, y); return y; };
  const olcBetik = path.join(UI, 'olc.py');
  fs.writeFileSync(olcBetik, OLC);
  const olc = (pdf) => JSON.parse(execFileSync(PY, ['-X', 'utf8', '-I', olcBetik, pdf], { encoding: 'utf8' }));
  await evalJs(YARDIMCI);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const s48 = (kod) => evalJs(`(() => { const H = window.__s48; return ${kod}; })()`);
  const kapatHepsini = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const ac = async (yol) => {
    await kapatHepsini();
    await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); for (let i = 0; i < 100 && !document.querySelector('.gorunum:not([hidden]) .xfaLayer'); i++) await window.__s48.bekle(100); b.gorunum.zoomModuAyarla('genislik'); await window.__s48.bekle(400); return true; })()`);
  };
  const tiklaAd = async (ad, i = 0, sayfa = null) => {
    const p = await evalJs(`window.__s48.yer(${J(ad)}, ${i}, ${J(sayfa)})`);
    if (!p) throw new Error('Öğe bulunamadı: ' + ad);
    await tikla(p.x, p.y);
    await bekle(150);
  };
  const durgun = () => evalJs(`window.__s48.durgun()`);
  const deger = (ad, i = 0) => s48(`(() => { const d = H.denetim(${J(ad)}, ${i}); return d ? (d.type === 'checkbox' ? d.checked : d.value) : null; })()`);
  const sayfaSayisi = () => s48(`H.g().sayfaSayisi`);
  const yanitla = (kanal, yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', ${J(kanal)}, ${J(yanitlar)})`);

  // ------------------------------------------------------------ 1) açılış
  if (bolum(1)) {
    const yol = kopya('acilis.pdf');
    await ac(yol);
    const r = await s48(`({ xfa: H.g().xfa, sayfa: H.g().sayfaSayisi, katman: !!document.querySelector('.gorunum:not([hidden]) .xfaLayer'), numara: H.numaralar(),
      baslik: [...document.querySelectorAll('.xfaLayer [data-xm]')].some((e) => e.textContent.includes(${J(TURKCE)})), degisti: H.b().degisti,
      aile: getComputedStyle(H.denetim('AdSoyad')).fontFamily, pdfjsYazi: [...document.fonts].filter((f) => /^"/.test(f.family)).length,
      dugmeler: [...document.querySelectorAll('#not-araclari [data-arac], #arac-cubugu [data-komut="gorunum.dondur"]')].map((e) => e.disabled && /XFA formlarında kullanılamaz/.test(e.title)) })`);
    sonuc('1) XFA kipinde açıldı: 1 sayfa, XFA katmanı, belge temiz', r.xfa && r.sayfa === 1 && r.katman && !r.degisti, r);
    sonuc('1) Alt bilgide "Sayfa 1 / 1"', J(r.numara) === J(['Sayfa 1 / 1']), r.numara);
    sonuc('1) Türkçe başlık katmanda', r.baslik);
    sonuc('1) Yazı tipi bilgisayardaki Arial, PDF.js yazı tipi kurulmadı', /Arial/.test(r.aile) && r.pdfjsYazi === 0, { aile: r.aile, pdfjs: r.pdfjsYazi });
    sonuc('1) Not araçları ve sayfa döndürme soluk, ipucu "XFA formlarında kullanılamaz"', r.dugmeler.length === 4 && r.dugmeler.every(Boolean), r.dugmeler);
    await evalJs(`(window.__pdefe.komutCalistir('arac.kucult'), true)`);
    await bekle(150);
    sonuc('1) Sıkıştır: "XFA formlarında kullanılamaz."', (await s48(`H.bildirim()`)) === 'XFA formlarında kullanılamaz.');
    const kr = await evalJs(`(async () => { const p = window.__pdefe.panel; if (!p.acik) window.__pdefe.komutCalistir('gorunum.solPanel'); for (let i = 0; i < 80; i++) { if (document.querySelector('.kucuk-resim img')) return true; await window.__s48.bekle(100); } return false; })()`);
    sonuc('1) Sayfalar panelinde küçük resim (formun düz PDF\'inden)', kr);
    await evalJs(`(() => { if (window.__pdefe.panel.acik) window.__pdefe.komutCalistir('gorunum.solPanel'); return true; })()`);
  }

  // ------------------------------------------------------------ 2) alanlar
  const yol2 = kopya('alanlar.pdf');
  if (bolum(2) || bolum(3) || bolum(4) || bolum(5) || bolum(6) || bolum(7) || bolum(8) || bolum(10)) {
    await ac(yol2);
    await tiklaAd('AdSoyad');
    await yaz(TURKCE);
    await tus('Tab');
    await bekle(200);
    await tiklaAd('Onay');
    await bekle(150);
    await tiklaAd('Sehir');
    await bekle(150);
    await tus('Escape');
    await evalJs(`(() => { const d = window.__s48.denetim('Sehir'); d.focus(); return true; })()`);
    await tus('ArrowDown');
    await tus('Tab');
    await bekle(250);
    const r = await s48(`({ ad: H.denetim('AdSoyad').value, onay: H.denetim('Onay').checked, sehir: H.denetim('Sehir').value, yigin: H.yigin(), degisti: H.b().degisti })`);
    sonuc('2) Yazı alanına Türkçe yazı, onay kutusu, açılır liste', r.ad === TURKCE && r.onay && !!r.sehir, r);
    sonuc('2) Komutlar "Form: <alanın açıklaması ya da etiketi>", "s. 1"', J(r.yigin) === J(['Form: Adı ve soyadı s. 1', 'Form: Bilgilerin doğruluğunu onaylıyorum s. 1', 'Form: Şehir s. 1']) && r.degisti, r.yigin);
  }

  // ------------------------------------------------------------ 3) Satır Ekle
  if (bolum(3) || bolum(4) || bolum(7) || bolum(8) || bolum(10)) {
    await evalJs(`(window.__s48.g().sayfayaGit(1), true)`);
    const t0 = Date.now();
    await tiklaAd('SatirEkle', 0);
    await durgun();
    const sure = Date.now() - t0;
    const r = await s48(`({ sayfa: H.g().sayfaSayisi, son: H.yigin().at(-1), ad: H.denetim('AdSoyad')?.value, gecerli: H.g().gecerli })`);
    sonuc('3) Satır Ekle: 2 sayfa, komut "Form: Satır Ekle", yazılan değer yerinde, görünüm 1. sayfada', r.sayfa === 2 && r.son === 'Form: Satır Ekle' && r.ad === TURKCE && r.gecerli === 1, r);
    console.log(`     Satır Ekle süresi: ${sure} ms`);
    await evalJs(`(async () => { const g = window.__s48.g(); g.sayfayaGit(2); await window.__s48.bekle(500); return true; })()`);
    sonuc('3) Sayfa numaraları "Sayfa 1 / 2", "Sayfa 2 / 2"', J(await s48(`H.numaralar()`)) === J(['Sayfa 1 / 2', 'Sayfa 2 / 2']), await s48(`H.numaralar()`));
    await tiklaAd('Aciklama', 1, 2);
    await yaz('Birinci satır\nİkinci satır');
    await tus('Tab');
    await bekle(200);
    sonuc('3) İkinci satırın çok satırlı alanı', (await deger('Aciklama', 1)) === 'Birinci satır\nİkinci satır', await deger('Aciklama', 1));
    await tiklaAd('SatirEkle', 1, 2);
    await durgun();
    sonuc('3) İkinci Satır Ekle: 3 sayfa', (await sayfaSayisi()) === 3, await sayfaSayisi());
    const yiginOnce = await s48(`H.yigin().length`);
    await tiklaAd('SatirEkle', 2, 3);
    await durgun();
    sonuc('3) Sınırda (en çok 3): uyarı, sayfa sayısı ve komutlar değişmedi',
      (await s48(`H.bildirim()`)) === 'Bu bölüm en çok 3 kez eklenebilir.' && (await sayfaSayisi()) === 3 && (await s48(`H.yigin().length`)) === yiginOnce,
      { bildirim: await s48(`H.bildirim()`), sayfa: await sayfaSayisi() });
  }

  // ------------------------------------------------------------ 4) Son Satırı Sil, Geri al / Yinele
  if (bolum(4) || bolum(8) || bolum(10)) {
    await tiklaAd('SatirSil', 2, 3);
    await durgun();
    sonuc('4) Son Satırı Sil: 2 sayfa, ikinci satırın değeri yerinde', (await sayfaSayisi()) === 2 && (await deger('Aciklama', 1)) === 'Birinci satır\nİkinci satır' && (await s48(`H.yigin().at(-1)`)) === 'Form: Son Satırı Sil',
      { sayfa: await sayfaSayisi(), deger: await deger('Aciklama', 1) });
    const geri = async () => { await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), true)`); await durgun(); };
    const ileri = async () => { await evalJs(`(window.__pdefe.komutCalistir('duzen.yinele'), true)`); await durgun(); };
    await geri();
    sonuc('4) Geri al: 3 sayfa', (await sayfaSayisi()) === 3);
    await geri();   // ikinci Satır Ekle
    await geri();   // Açıklama değeri
    sonuc('4) Geri al: 2 sayfa, ikinci satırın açıklaması boş', (await sayfaSayisi()) === 2 && (await deger('Aciklama', 1)) === '', await deger('Aciklama', 1));
    await geri();   // ilk Satır Ekle
    await geri(); await geri(); await geri();   // açılır liste, onay kutusu, ad
    sonuc('4) Bütün adımlar geri alındı: 1 sayfa, alanlar boş, belge temiz', (await sayfaSayisi()) === 1 && (await deger('AdSoyad')) === '' && !(await deger('Onay')) && !(await s48(`H.b().degisti`)),
      { sayfa: await sayfaSayisi(), ad: await deger('AdSoyad'), onay: await deger('Onay') });
    for (let i = 0; i < 7; i++) await ileri();
    sonuc('4) Yinele: 2 sayfa, değerler yerinde', (await sayfaSayisi()) === 2 && (await deger('AdSoyad')) === TURKCE && (await deger('Onay')) === true && (await deger('Aciklama', 1)) === 'Birinci satır\nİkinci satır',
      { sayfa: await sayfaSayisi(), ad: await deger('AdSoyad'), aciklama: await deger('Aciklama', 1) });
    // En az örnekte uyarı: ayrı bir belgede tek satır varken Sil
    const yolMin = kopya('enaz.pdf');
    const etkin = await s48(`H.b().id`);
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(yolMin)}); for (let i = 0; i < 100 && !document.querySelector('.gorunum:not([hidden]) .xfaLayer'); i++) await window.__s48.bekle(100); return true; })()`);
    await tiklaAd('SatirSil', 0);
    await durgun();
    sonuc('4) En az örnekte Sil: "Bu bölümün son örneği silinemez.", komut yok', (await s48(`H.bildirim()`)) === 'Bu bölümün son örneği silinemez.' && (await s48(`H.yigin().length`)) === 0 && (await sayfaSayisi()) === 1);
    await evalJs(`(async () => { await window.__pdefe.belgeKapat(window.__s48.b().id, { zorla: true }); await window.__pdefe.sekmeSec(${J(etkin)}); await window.__s48.bekle(300); return true; })()`);
  }

  // ------------------------------------------------------------ 5) tanınmayan düğme
  if (bolum(5)) {
    await tiklaAd('Mesaj', 0);
    await bekle(150);
    const r = await s48(`({ bildirim: H.bildirim(), isaret: H.denetim('Mesaj').classList.contains('xfa-desteklenmiyor'), ipucu: H.denetim('Mesaj').title })`);
    sonuc('5) Tanınmayan betikli düğme: "işlevi PDEfe\'de çalışmıyor", işaretli', /"Mesaj" düğmesinin işlevi PDEfe'de çalışmıyor\./.test(r.bildirim) && r.isaret && /çalışmıyor/.test(r.ipucu), r);
  }

  // ------------------------------------------------------------ 6) görünürlük
  if (bolum(6) || bolum(8)) {
    const gorunur = () => s48(`(() => { const d = H.denetim('Mesaj'); if (!d) return false; const r = d.getBoundingClientRect(); let e = d; while (e && !e.classList?.contains('xfaLayer')) { const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') return false; e = e.parentElement; } return r.width > 0; })()`);
    sonuc('6) Mesaj düğmesi görünür', await gorunur());
    await tiklaAd('Gizle', 0);
    await durgun();
    sonuc('6) "Mesajı Gizle": Mesaj gizlendi, komut "Form: Mesajı Gizle"', !(await gorunur()) && (await s48(`H.yigin().at(-1)`)) === 'Form: Mesajı Gizle', await s48(`H.yigin().at(-1)`));
    await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), true)`); await durgun();
    sonuc('6) Geri al: Mesaj yeniden görünür', await gorunur());
    await evalJs(`(window.__pdefe.komutCalistir('duzen.yinele'), true)`); await durgun();
    sonuc('6) Yinele: Mesaj gizli', !(await gorunur()));
  }

  // ------------------------------------------------------------ 7) Bul
  if (bolum(7)) {
    const ara = async (metin) => {
      await evalJs(`(() => { window.__pdefe.komutCalistir('duzen.bul'); const g = document.getElementById('bul-girdi'); g.value = ''; g.focus(); return true; })()`);
      await yaz(metin);
      await bekle(1200);
      return s48(`({ sayac: document.getElementById('bul-sayac').textContent, vurgu: document.querySelectorAll('.xfaLayer .highlight').length, alanda: document.querySelectorAll('.xfa-alan-metni .highlight').length, secili: document.querySelectorAll('.xfaLayer .highlight.selected').length })`);
    };
    const a = await ara('doğruluğunu');
    sonuc('7) Bul etikette: 1 / 1, seçili vurgu XFA katmanında', a.sayac === '1 / 1' && a.secili === 1, a);
    const b = await ara('Birinci satır');
    sonuc('7) Bul alanın değerinde (2. sayfa): 1 / 1, vurgu alanın üstünde', b.sayac === '1 / 1' && b.alanda === 1, b);
    const c = await ara('açıklama');
    sonuc('7) Bul bütün sayfalarda: her satırın "Açıklama" etiketi (2)', /\/ 2$/.test(c.sayac), c);
    await tus('Escape');
  }

  // ------------------------------------------------------------ 8) Kaydet
  if (bolum(8)) {
    const r = await evalJs(`(async () => { const b = window.__s48.b(); const ok = await window.__pdefe.belgeKaydet(b); return { ok, degisti: b.degisti }; })()`);
    sonuc('8) Kaydedildi, belge temiz', r.ok && !r.degisti, r);
    const o = olc(yol2);
    sonuc('8) MuPDF onarmadan açıyor, saf XFA, kullanım hakları imzası kaldırıldı', !o.onarildi && o.saf && !o.hak, { onarildi: o.onarildi, saf: o.saf, hak: o.hak });
    sonuc('8) Veride değerler (Türkçe) ve 2 satır grubu', o.veri.includes('Birinci satır') && o.veri.includes(TURKCE) && o.satir === 2, { satir: o.satir });
    sonuc('8) Şablonda Mesaj gizli (presence="hidden")', /presence="hidden"/.test(o.mesaj || ''), o.mesaj);
    await ac(yol2);
    const r2 = await s48(`({ sayfa: H.g().sayfaSayisi, ad: H.denetim('AdSoyad').value, onay: H.denetim('Onay').checked, degisti: H.b().degisti })`);
    sonuc('8) Yeniden açınca: 2 sayfa, değerler yerinde, belge temiz', r2.sayfa === 2 && r2.ad === TURKCE && r2.onay && !r2.degisti, r2);
    sonuc('8) Yeniden açınca ikinci satırın açıklaması', (await deger('Aciklama', 1)) === 'Birinci satır\nİkinci satır' || await (async () => { await evalJs(`(window.__s48.g().sayfayaGit(2), true)`); await bekle(500); return (await deger('Aciklama', 1)) === 'Birinci satır\nİkinci satır'; })());
  }

  // ------------------------------------------------------------ 9) Formu Kaydet düğmesi
  if (bolum(9)) {
    const yol9 = kopya('dugme.pdf'), hedef9 = path.join(UI, 'dugme-farkli.pdf');
    await ac(yol9);
    await tiklaAd('AdSoyad');
    await yaz('Farklı');
    await tus('Tab');
    await yanitla('dosya:kaydetDiyalog', [hedef9]);
    await tiklaAd('Kaydet', 0);
    const r = await evalJs(`(async () => { const b = window.__s48.b(); for (let i = 0; i < 100 && (b.kaydediliyor || b.degisti); i++) await window.__s48.bekle(100); return { yol: b.yol, degisti: b.degisti }; })()`);
    sonuc('9) "Formu Kaydet": Farklı kaydet ile yeni dosyaya yazıldı, sekme yeni dosyada', fs.existsSync(hedef9) && r.yol.toLowerCase() === hedef9.toLowerCase() && !r.degisti, r);
    sonuc('9) Yeni dosyada değer, kullanım hakları imzası yok', (() => { const o = olc(hedef9); return o.veri.includes('Farkl') && !o.hak; })());
  }

  // ------------------------------------------------------------ 10) yazdırma (düz PDF)
  if (bolum(10)) {
    if (bolum(8)) await ac(yol2);   // 8'de kaydedilen form (9 başka belgeyi açtı)
    const r = await evalJs(`(async () => { const b = window.__s48.b(); const d = await b.xfa.duzPdf(); return { yol: d.yol, sayfa: d.sayfa, gs: b.gorunum.sayfaSayisi }; })()`);
    const olcDuz = JSON.parse(execFileSync(PY, ['-X', 'utf8', '-I', '-c', 'import json,sys,pymupdf\nd=pymupdf.open(sys.argv[1])\nprint(json.dumps({"sayfa":d.page_count,"metin":"\\n".join(p.get_text() for p in d),"boyut":[[round(p.rect.width),round(p.rect.height)] for p in d]},ensure_ascii=False))', r.yol], { encoding: 'utf8' }));
    sonuc('10) Düz PDF: sayfa sayısı formunki, A4', olcDuz.sayfa === r.gs && olcDuz.boyut.every(([w, h]) => Math.abs(w - 595) <= 2 && Math.abs(h - 842) <= 2), { duz: olcDuz.sayfa, gorunum: r.gs, boyut: olcDuz.boyut });
    sonuc('10) Düz PDF\'te değerler ve sayfa numaraları', olcDuz.metin.includes(TURKCE) && olcDuz.metin.includes('Birinci satır') && olcDuz.metin.includes(`Sayfa 1 / ${r.gs}`), olcDuz.metin.slice(0, 300));
    sonuc('10) Formun düğmeleri basılmaz', !/Satır Ekle|Formu Kaydet/.test(olcDuz.metin));
    await evalJs(`(window.__pdefe.komutCalistir('dosya.yazdir'), true)`);
    const p = await evalJs(`(async () => { for (let i = 0; i < 100; i++) { const d = document.querySelector('.yazdir-diyalog'); if (d) return { toplam: d.textContent.match(/(\\d+) sayfa/)?.[1] || d.textContent.slice(0, 120) }; await window.__s48.bekle(100); } return null; })()`);
    sonuc('10) Yazdırma penceresi açıldı', !!p, p);
    await evalJs(`(() => { const d = document.querySelector('.yazdir-diyalog'); const v = d && [...d.querySelectorAll('button')].find((b) => /Vazgeç|İptal/.test(b.textContent)); v?.click(); return !!v; })()`);
    await bekle(300);
  }

  // ------------------------------------------------------------ 11) odak, yakınlaştırma, kapatma sorusu
  if (bolum(11)) {
    const yol11 = kopya('odak.pdf');
    await ac(yol11);
    await tiklaAd('AdSoyad');
    await yaz('Yazılıyor');
    await evalJs(`(async () => { window.__s48.g().yakinlastir(1); await window.__s48.bekle(700); return true; })()`);
    const r = await s48(`({ odak: document.activeElement === H.denetim('AdSoyad'), deger: H.denetim('AdSoyad')?.value, kirli: H.b().xfa.duzenleniyor() })`);
    sonuc('11) Yakınlaştırınca odaktaki alan ve yazılan metin korundu, düzenleme sürüyor', r.odak && r.deger === 'Yazılıyor' && r.kirli, r);
    const k = await evalJs(`(async () => { const o = { secim: 2 }; window.__pdefeOtoYanit = o; const b = window.__s48.b(); const kapandi = await window.__pdefe.belgeKapat(b.id); delete window.__pdefeOtoYanit; return { kapandi, soru: o.son?.mesaj || null, komut: b.yigin.geriAlinacak?.ad }; })()`);
    sonuc('11) Kapatırken kaydedilmemiş değişiklik soruldu (Vazgeç: sekme açık), yazılan metin komut oldu', !k.kapandi && !!k.soru && k.komut === 'Form: Adı ve soyadı', k);
  }

  // ------------------------------------------------------------ 12) sekme taşıma
  if (bolum(12)) {
    const yol12 = kopya('tasi.pdf');
    await ac(yol12);
    await tiklaAd('AdSoyad');
    await yaz('Taşınan');
    await tus('Tab');
    await tiklaAd('SatirEkle', 0);
    await durgun();
    const paket = await s48(`(async () => { const p = await window.__pdefe.sekmePaketi(H.b()); return { yigin: p.yigin && p.yigin.komutlar.map((k) => k.tur + ':' + k.ad), xfa: p.gorunum.xfa }; })()`);
    sonuc('12) Sekme paketi XFA komutlarını taşır', J(paket.yigin) === J(['xfa.deger:Form: Adı ve soyadı', 'xfa.yapi:Form: Satır Ekle']) && paket.xfa, paket);
    const once = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT}/json`)).json()).filter((h) => h.type === 'page' && /index\.html/.test(h.url)).map((h) => h.id);
    await s48(`(async () => { await window.__pdefe.sekmeyiTasi(H.b().id, { tur: 'yeni' }); return true; })()`);
    let yeni = null;
    for (let i = 0; i < 50 && !yeni; i++) {
      await bekle(200);
      yeni = (await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT}/json`)).json()).find((x) => x.type === 'page' && /index\.html/.test(x.url) && !once.includes(x.id)) || null;
    }
    sonuc('12) Sekme yeni pencereye taşındı', !!yeni);
    if (yeni) {
      hedefSec(yeni.id);
      await bekle(1500);
      await evalJs(YARDIMCI);
      await evalJs(`(async () => { for (let i = 0; i < 80; i++) { if (document.querySelector('.gorunum:not([hidden]) .xfaLayer')) return true; await window.__s48.bekle(100); } return false; })()`);
      const r = await s48(`({ xfa: H.g().xfa, sayfa: H.g().sayfaSayisi, ad: H.denetim('AdSoyad')?.value, degisti: H.b().degisti, yigin: H.yigin() })`);
      sonuc('12) Yeni pencerede XFA kipi, 2 sayfa, değer, kaydedilmemiş durum, geri al geçmişi', r.xfa && r.sayfa === 2 && r.ad === 'Taşınan' && r.degisti && r.yigin.length === 2, r);
      await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), true)`); await durgun();
      sonuc('12) Yeni pencerede Geri al: 1 sayfa, değer yerinde', (await sayfaSayisi()) === 1 && (await deger('AdSoyad')) === 'Taşınan');
      await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); setTimeout(() => window.close(), 200); return true; })()`).catch(() => {});
      hedefSec(null);
      await bekle(800);
      await evalJs(YARDIMCI);
    }
  }

  // ------------------------------------------------------------ 13) karma belge
  if (bolum(13)) {
    const FORM = path.join(UI, 'form');
    execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'form_alanlari_pdf_uret.py'), FORM], { encoding: 'utf8' });
    await kapatHepsini();
    await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(path.join(FORM, 'karma.pdf'))}); for (let i = 0; i < 100; i++) { if (window.__s48.g()?.sayfalar?.[0]?._formOgeler?.size) break; await window.__s48.bekle(100); } return true; })()`);
    const r = await s48(`({ xfa: H.g().xfa, alan: H.g().sayfalar[0]._formOgeler?.size || 0, katman: !!document.querySelector('.gorunum:not([hidden]) .xfaLayer') })`);
    sonuc('13) Karma belge XFA kipine girmedi, AcroForm alanları kuruldu', !r.xfa && r.alan > 0 && !r.katman, r);
  }

  // ------------------------------------------------------------ 14) e-imzalı form (0.3.1 inceleme)
  if (bolum(14)) {
    const imzaliKopya = (ad) => { const y = path.join(UI, ad); fs.copyFileSync(ozet.xfaImzali, y); return y; };
    const ozgun = fs.readFileSync(ozet.xfaImzali);
    // Sahte imza: /Contents imzalanan baytların SHA-256'sı (test/xfa_pdf_uret.py imzali_xfa); UR3'ün [0 0 0 0]'ı değil
    const br = [...ozgun.toString('latin1').matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].map((m) => m.slice(1).map(Number)).find((v) => v[1]);
    const { createHash } = await import('node:crypto');
    const imzaTutuyor = (veri) => {
      const [, a, b, c] = br;
      return veri.length >= b + c && veri.subarray(a + 1, a + 65).toString('latin1') === createHash('sha256').update(Buffer.concat([veri.subarray(0, a), veri.subarray(b, b + c)])).digest('hex');
    };
    const kaydetYanitla = (secim) => evalJs(`(async () => { const o = { secim: ${secim} }; window.__pdefeOtoYanit = o; const b = window.__s48.b(); const ok = await window.__pdefe.belgeKaydet(b); delete window.__pdefeOtoYanit; return { ok, degisti: b.degisti, soru: o.son?.mesaj || null }; })()`);
    const yolK = imzaliKopya('imzali-koru.pdf');
    await ac(yolK);
    const r0 = await s48(`({ xfa: H.g().xfa, eImzali: !!H.g().xfaBilgi?.eImzali })`);
    sonuc('14) Görünmez e-imzalı form XFA kipinde açıldı, e-imzalı tanındı', r0.xfa && r0.eImzali, r0);
    await tiklaAd('AdSoyad');
    await yaz(TURKCE);
    await tus('Tab');
    await bekle(200);
    await tiklaAd('SatirEkle', 0);
    await durgun();
    const r1 = await kaydetYanitla(0);
    const k1 = fs.readFileSync(yolK), o1 = olc(yolK);
    sonuc('14) Kaydet: "Bu form e-imzalı." soruldu, İmzayı koru: imza tutuyor, özgün baytlar yerinde, kullanım hakları imzası kaldı',
      r1.ok && !r1.degisti && r1.soru === 'Bu form e-imzalı.' && imzaTutuyor(k1) && k1.subarray(0, ozgun.length).equals(ozgun) && o1.hak && !o1.onarildi,
      { ...r1, imza: imzaTutuyor(k1), onek: k1.subarray(0, ozgun.length).equals(ozgun), hak: o1.hak, onarildi: o1.onarildi });
    sonuc('14) İmza korunarak kaydedilen veride değer ve 2 satır grubu', o1.veri.includes(TURKCE) && o1.satir === 2, { satir: o1.satir });
    await tiklaAd('AdSoyad');
    await tus('End');
    await yaz(' 2');
    await tus('Tab');
    await bekle(200);
    const r2 = await kaydetYanitla(2);
    sonuc('14) İkinci kayıt: soru yeniden sorulmadı (seçim hatırlandı), imza tutuyor', r2.ok && !r2.soru && imzaTutuyor(fs.readFileSync(yolK)) && olc(yolK).veri.includes(TURKCE + ' 2'), r2);
    const yolT = imzaliKopya('imzali-temiz.pdf');
    await ac(yolT);
    await tiklaAd('AdSoyad');
    await yaz(TURKCE);
    await tus('Tab');
    await bekle(200);
    const r3 = await kaydetYanitla(1);
    const o3 = olc(yolT);
    sonuc('14) Tamamen sil: form baştan yazıldı (imza tutmuyor), kullanım hakları imzası kaldırıldı, değer yerinde',
      r3.ok && r3.soru === 'Bu form e-imzalı.' && !imzaTutuyor(fs.readFileSync(yolT)) && !o3.hak && o3.veri.includes(TURKCE), { ...r3, hak: o3.hak });
    const yolV = imzaliKopya('imzali-vazgec.pdf');
    await ac(yolV);
    await tiklaAd('AdSoyad');
    await yaz('x');
    await tus('Tab');
    await bekle(200);
    const r4 = await kaydetYanitla(2);
    sonuc('14) Vazgeç: kaydedilmedi, dosya değişmedi', !r4.ok && r4.degisti && fs.readFileSync(yolV).equals(ozgun), r4);
  }

  // ------------------------------------------------------------ 15) yeniden kurma sürerken sekme paketi ve otomatik kayıt (0.3.1 inceleme)
  if (bolum(15)) {
    const yol15 = kopya('inceleme15.pdf');
    await ac(yol15);
    await tiklaAd('SatirEkle', 0);
    await durgun();
    // Geri al'ın hemen ardından paket: Formun yeniden kurulması beklenir, paketteki baytlar ile yığının konumu birbirini tutar
    const p = await s48(`(async () => {
      window.__pdefe.komutCalistir('duzen.geriAl');
      const paket = await window.__pdefe.sekmePaketi(H.b());
      const veri = paket.gorunum.belgeler.find((x) => x.ana).veri;
      let s = ''; for (let i = 0; i < veri.length; i += 8192) s += String.fromCharCode(...veri.subarray(i, i + 8192));
      return { konum: paket.yigin.konum, b64: btoa(s) };
    })()`);
    const paketYol = path.join(UI, 'paket15.pdf');
    fs.writeFileSync(paketYol, Buffer.from(p.b64, 'base64'));
    const op = olc(paketYol);
    sonuc('15) Geri al sürerken sekme paketi: yığının konumu 0, paketteki formda 1 satır grubu', p.konum === 0 && op.satir === 1, { konum: p.konum, satir: op.satir });
    await durgun();
    // Düğme işi sürerken taşıma reddedilir
    const t = await s48(`(async () => {
      const b = H.b(); b.xfa._mesgulKoy(true);
      const tasindi = await window.__pdefe.sekmeyiTasi(b.id, { tur: 'yeni' });
      const bildirim = H.bildirim(); b.xfa._mesgulKoy(false);
      return { tasindi, bildirim };
    })()`);
    sonuc('15) Form yeniden dizilirken sekme taşınmaz: "Form yeniden diziliyor. Bitince yeniden deneyin."', !t.tasindi && t.bildirim === 'Form yeniden diziliyor. Bitince yeniden deneyin.', t);
    // Otomatik kayıt: Zamanlayıcı dolarken form yeniden diziliyorsa kayıt ertelenir, dizilim bitince yapılır
    await evalJs(`(() => { window.__pdefe.ayar().otomatikKaydet = true; return true; })()`);
    await tiklaAd('AdSoyad');
    await yaz('Oto');
    await tus('Tab');
    await s48(`(() => { const b = H.b(); b.xfa._mesgulKoy(true); setTimeout(() => b.xfa._mesgulKoy(false), 2500); return true; })()`);
    await bekle(2000);
    const o1 = await s48(`({ degisti: H.b().degisti })`);
    await bekle(2500);
    const o2 = await s48(`({ degisti: H.b().degisti })`);
    await evalJs(`(() => { window.__pdefe.ayar().otomatikKaydet = false; return true; })()`);
    sonuc('15) Otomatik kayıt dizilim sürerken ertelendi, bitince kaydedildi', o1.degisti && !o2.degisti && olc(yol15).veri.includes('Oto'), { o1, o2 });
  }

  // ------------------------------------------------------------ 16) Tab sırası, Boşluk, sığmayan yazı (0.3.1 kabul sınaması)
  if (bolum(16)) {
    const yol16 = kopya('tab.pdf');
    await ac(yol16);
    await evalJs(`(window.__s48.odakAdi = () => { const e = document.activeElement; if (!e?.closest?.('.xfaLayer')) return null; return e.closest('[xfaname]')?.getAttribute('xfaname') || e.tagName; }, true)`);
    const odak = () => evalJs(`window.__s48.odakAdi()`);
    // Şablonda düğmeler sağdan sola (Satır Ekle, Son Satırı Sil, Kaydet, Mesaj, Gizle), sekme sırası tanımlı değil: Tab sayfadaki yere göre
    await tiklaAd('AdSoyad');
    const ileri = [];
    for (let i = 0; i < 9; i++) { await tus('Tab'); await bekle(60); ileri.push(await odak()); }
    const BEKLENEN_SIRA = ['Onay', 'Sehir', 'Aciklama', 'SatirSil', 'SatirEkle', 'Gizle', 'Mesaj', 'Kaydet', 'AdSoyad'];
    sonuc('16) Tab sayfadaki sırayla (satır satır, soldan sağa), sonda başa döner', J(ileri) === J(BEKLENEN_SIRA), ileri);
    const geri = [];
    for (let i = 0; i < 3; i++) { await tus('Tab', ['shift']); await bekle(60); geri.push(await odak()); }
    sonuc('16) Shift+Tab geriye (baştan sona döner)', J(geri) === J(['Kaydet', 'Mesaj', 'Gizle']), geri);
    // Boşluk ve Enter düğmede: Sayfa kaymaz, düğme çalışır
    await evalJs(`(() => { window.__s48.denetim('SatirEkle', 0).focus(); return true; })()`);
    const st0 = await s48(`H.g().kaydirici.scrollTop`);
    await tus(' ');
    await durgun();
    sonuc('16) Odaktaki düğmede Boşluk düğmeye basar (2 sayfa), sayfa aşağı kaymaz', (await sayfaSayisi()) === 2 && (await s48(`H.g().kaydirici.scrollTop`)) === st0, { n: await sayfaSayisi(), st0, st: await s48(`H.g().kaydirici.scrollTop`) });
    // Sayfa sonunda Tab: Sonraki sayfanın ilk denetimi (katmanı kurulmamışsa kurulur, görünür olur)
    await evalJs(`(async () => { const g = window.__s48.g(); g.zoomAyarla(3, null, 'serbest'); await window.__s48.bekle(600); g.sayfayaGit(1); await window.__s48.bekle(400);
      for (const s of g.sayfalar.slice(1)) g.girdiBosalt(s, true); window.__s48.denetim('SatirEkle', 0).focus(); return true; })()`);
    await bekle(100);
    await tus('Tab');
    const g2 = await evalJs(`(async () => { for (let i = 0; i < 60 && window.__s48.odakAdi() !== 'Aciklama'; i++) await window.__s48.bekle(50); const e = document.activeElement, g = window.__s48.g();
      const r = e.getBoundingClientRect(), k = g.kaydirici.getBoundingClientRect(); return { ad: window.__s48.odakAdi(), sayfa: g.sayfalar.findIndex((s) => s.el.contains(e)) + 1, gorunur: r.bottom > k.top && r.top < k.bottom }; })()`);
    sonuc('16) Sayfa sonunda Tab: Sonraki sayfanın ilk denetimi, katmanı beklenir, görünür', g2.ad === 'Aciklama' && g2.sayfa === 2 && g2.gorunur, g2);
    await evalJs(`(async () => { const g = window.__s48.g(); await g.zoomModuAyarla('genislik'); await window.__s48.bekle(500); g.sayfayaGit(1); await window.__s48.bekle(400); return true; })()`);
    // Sığmayan yazı
    const satirlar = Array.from({ length: 80 }, (_, i) => `Uzun açıklama satırı ${i + 1}`).join('\n');
    const tasma = () => s48(`(() => { const d = H.denetim('Aciklama', 0); return { sinif: d.classList.contains('xfa-tasiyor'), st: d.scrollTop, bildirim: H.bildirim(), uz: d.value.length }; })()`);
    await tiklaAd('Aciklama', 0);
    await yaz('Kısa yazı');
    sonuc('16) Kısa yazı: Alan işaretlenmez', !(await tasma()).sinif, await tasma());
    await tus('a', ['ctrl']);
    await yaz(satirlar);
    await bekle(150);
    const t1 = await tasma();
    sonuc('16) Uzun yazı: Alan işaretlendi, sığmadığı söylendi', t1.sinif && /sığmıyor/.test(t1.bildirim) && t1.st > 0, t1);
    await tus('Tab');
    await bekle(200);
    const t2 = await tasma();
    sonuc('16) Alandan çıkınca yazının başı görünür, işaret kalır', t2.sinif && t2.st === 0, t2);
    // Yazdırma penceresi
    await evalJs(`(window.__pdefe.komutCalistir('dosya.yazdir'), true)`);
    const u = await evalJs(`(async () => { for (let i = 0; i < 100 && !document.querySelector('.yazdir-diyalog'); i++) await window.__s48.bekle(100); await window.__s48.bekle(300); const e = document.querySelector('.yazdir-uyari'); return e && !e.hidden ? e.textContent : ''; })()`);
    sonuc('16) Yazdırma penceresi sığmayan alanı söyler', u === '1 alandaki yazı alana sığmıyor. Sığmayan kısım basılmaz.', u);
    await tus('Escape');
    await bekle(400);
    // Geri alınınca işaret kalkar, yazdırma uyarısı yok
    await evalJs(`(() => { window.__s48.g().kaydirici.focus(); window.__pdefe.komutCalistir('duzen.geriAl'); return true; })()`);
    await durgun();
    await bekle(200);
    const t3 = await tasma();
    sonuc('16) Geri alınınca işaret kalktı', !t3.sinif && t3.uz < 20, t3);
    await evalJs(`(window.__pdefe.komutCalistir('dosya.yazdir'), true)`);
    const u2 = await evalJs(`(async () => { for (let i = 0; i < 100 && !document.querySelector('.yazdir-diyalog'); i++) await window.__s48.bekle(100); await window.__s48.bekle(300); const e = document.querySelector('.yazdir-uyari'); return e && !e.hidden ? e.textContent : ''; })()`);
    sonuc('16) Sığan yazıda yazdırma uyarısı yok', u2 === '', u2);
    await tus('Escape');
    await bekle(300);
    // Tek satırlık alan: Genişliği aşan yazı, kısa yazı
    await tiklaAd('AdSoyad');
    await tus('a', ['ctrl']);
    await yaz('Kısa ad');
    sonuc('16) Tek satırda kısa yazı işaretlenmez', !(await s48(`H.denetim('AdSoyad').classList.contains('xfa-tasiyor')`)));
    await tus('a', ['ctrl']);
    await yaz('Çok uzun bir ad soyad yazısı '.repeat(12));
    sonuc('16) Tek satırda genişliği aşan yazı işaretlenir', await s48(`H.denetim('AdSoyad').classList.contains('xfa-tasiyor')`));
    await tus('Tab');
    // Boş satır: Yeniden dizilince, kaydedip yeniden açınca kalır (PDF.js değerin boş satırlarını atar)
    await tiklaAd('Aciklama', 0);
    await tus('a', ['ctrl']);
    await yaz('Birinci paragraf\n\nİkinci paragraf');
    await tus('Tab');
    await tiklaAd('SatirSil', 1, 2);
    await durgun();
    const satirSayisi = async () => ((await deger('Aciklama', 0)) || '').split('\n').length;
    sonuc('16) Boş satır: Düğmeden sonra (yeniden dizim) kaldı', (await satirSayisi()) === 3 && (await sayfaSayisi()) === 1, await deger('Aciklama', 0));
    await evalJs(`(async () => { const b = window.__s48.b(); await window.__pdefe.belgeKaydet(b); return true; })()`);
    await ac(yol16);
    sonuc('16) Boş satır: Kaydedip yeniden açınca kaldı', (await satirSayisi()) === 3, await deger('Aciklama', 0));
  }

  const hatalar = await evalJs(`(window.__hatalar || []).slice(0, 8)`).catch(() => []);
  sonuc('Sayfada hata yok', !hatalar?.length, hatalar);
  await kapatHepsini().catch(() => {});
  console.log(hataSayisi ? `${hataSayisi} HATA / ${denetim}` : `BÜTÜN DENETİMLER GEÇTİ (${denetim})`);
}
