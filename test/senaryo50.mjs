// Senaryo 50 (0.3.1, kullanıcı: "en alttaki formu kaydet butonuna basınca ve aynı adla kaydedip kapatmaya çalışınca tuhaf şeyler oluyor. kaydetmiyor o buton galiba. ... bu kayıt
// mekanizmasında hiç sıkıntı olmamalı bireysel başvurunun çünkü çok uzun yazılabiliyor"): XFA formunun kayıt mekanizması. Gerçek fare ve klavye (CDP Input), ağır senaryolar.
// Form kurgusal (test/xfa_pdf_uret.py, xfa-uzun.pdf), yazılar kurgusal. Çıktı: test/cikti/s50/<koşum>/.
//
// İki kipte koşulur (ikisini de test/senaryo50_kos.ps1 başlatır):
//  S50_KIP=yerel: Görünmeyen masaüstünde test kancasız örnek (baslat_gizli.ps1 -GercekEkran): GERÇEK Windows kaydetme penceresi UI Automation ve pencere iletisiyle sürülür
//    (test/yerel_pencere_sur.ps1). Boşluklu, parantezli, Türkçe harfli yol. Bölümler:
//    y1 Formu Kaydet: Önerilen ad ve klasör, aynı ad, "değiştirilsin mi" Evet: Dosya değişti, değer dosyada, bildirim, belge temiz.
//    y2 Kilitli dosya (yalnız okuma paylaşımlı): Anlaşılır pencere (Yeniden dene, Farklı kaydet, Vazgeç), ham hata yok, özgün dosya aynı, Yeniden dene kaydetme penceresini açmaz,
//       kilit kalkınca kaydeder.
//    y3 Kilitli dosya (hiç paylaşımsız), Farklı kaydet: Gerçek pencereyle yeni ad, sekme yeni dosyada, eski dosya aynı.
//    y4 Vazgeç, yazılanlar duruyor. Kaydetme penceresinde İptal ve Hayır: Yazılmaz, hata yok. Kapatma sorusu "Son kayıt yapılamadı" der, kapatmada Kaydet başarısızsa pencere kapanmaz.
//    y5 Alandan çıkmadan pencere kapatma (Alt+F4 ve X'in yolu): Soru çıkar, Kaydet yazılanı dosyaya yazar, pencere kapanır.
//  S50_KIP=kancali (varsayılan; ekran dışı, baslat.ps1): Kaydetme penceresi test kuyruğundan, uygulamanın kendi soruları gerçek fareyle.
//    1 Uzun yazı: 20 Başvurucu, 20 Bölüm (her biri 200.000 karakter: Satır sonu, boş satır, sekme, < > & " ', Türkçe harfler, emoji, çok uzun sözcük). Kaydet, kapat, aç:
//      Değerler dosyanın datasets'inde ve yeniden açınca DOM'da karakteri karakterine. Kayıt süresi, yazma gecikmesi, dosya boyutu. Doluyken bölüm ekleme.
//    2 30 kez üst üste kaydet: Dosya büyümez, her kayıttan sonra MuPDF onarmadan ve PDF.js (ikinci sekme) açar.
//    3 Kaydet, yazmaya devam, geri al, yinele, yine kaydet. Farklı kaydet: Sekme yeni dosyada, eski dosya aynı.
//    4 Yarışlar: Düğmeye iki kez hızlı basma, Ekle sürerken kaydetme, kayıt sürerken pencere kapatma, kayıt sürerken yazma.
//    5 Hata benzetimi (arayüz; dosya düzeyi test/xfa_testi.py): Disk dolu, doğrulama, çekirdek çöküşü: Pencere, ham hata yok, kirli, yazılanlar yerinde, Yeniden dene.
//    6 Salt okunur dosya, salt okunur klasör, silinmiş dosya, taşınmış klasör, 260 karakteri aşan yol.
//    7 Otomatik kayıt kilitliyken: Pencere yok, kaydedildi denmez, bir kez bildirim, durum çubuğu, kilit kalkınca kendiliğinden kaydeder. Alandan çıkmadan yazılan da.
//    8 Odaktaki alanda yazılmış, çıkılmamış yazı: Kaydet komutu, Formu Kaydet, sekme kapatma sorusu, kirli işareti yazarken.
//    9 Öbür belgeler aynı pencereyle: Not, form alanı, sayfa düzeni (yapısal kayıt): Kilitliyken pencere, Yeniden dene.
//   10 PDEfe'nin kendi kilidi yok (Restart Manager): Form açıkken, Ekle sonrası, küçük resim ve düz PDF sonrası, kayıt sonrası.
//   11 Yapıştırılan denetim karakterleri (sayfa sonu): Dosyanın XML'i geçerli, Ekle çalışır.
//   12 Veriye yazılamayan değer (benzetim): Kullanıcı görür, belge kirli kalır.
// Kullanım: powershell -File test\senaryo50_kos.ps1 [-Bolum "1,3"] (bölüm seçimi $env:BOLUM)
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's50', Date.now().toString(36));
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const KIP = process.env.S50_KIP || 'kancali';
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)).slice(0, 700) : ''}`);
  return ok;
};
const bilgi = (m) => console.log(`     ${m}`);
const ozet = (y) => createHash('sha256').update(fs.readFileSync(y)).digest('hex');
const hamHataVar = (s) => /\[(Errno|WinError) |code=\d+|Traceback|\\\\|PermissionError|OSError/.test(s || '');

/** Kaydedilen formun ölçümü: Onarıldı mı, datasets'teki yaprak değerler (yol → değerler), XML geçerli. Değerler PDF.js'ten değil, dosyanın kendisinden. */
const OLC = `
import json, sys
import xml.etree.ElementTree as ET
sys.path.insert(0, r"${path.join(KOK, 'core').replace(/\\/g, '\\\\')}")
sys.stdout.reconfigure(encoding="utf-8")
import pymupdf
from islemler import xfa
d = pymupdf.open(sys.argv[1], filetype="pdf")
p = xfa._paketler(d)
kok = ET.fromstring(d.xref_stream(p["datasets"]))
veri = kok.find("{%s}data" % xfa.VERI_NS)
degerler = {}
def yuru(e, yol):
    ad = xfa._yerel(e.tag)
    y = yol + [ad]
    c = list(e)
    if c:
        for x in c: yuru(x, y)
    else:
        degerler.setdefault("/".join(y), []).append(e.text or "")
for c in veri: yuru(c, [])
print(json.dumps({"onarildi": d.is_repaired, "hak": xfa.notlar.kullanim_hakki_var(d), "saf": xfa._saf_mi(d, p), "degerler": degerler}, ensure_ascii=False))
`;
const RM = `
import json, sys
sys.path.insert(0, r"${path.join(KOK, 'core').replace(/\\/g, '\\\\')}")
sys.stdout.reconfigure(encoding="utf-8")
from islemler import notlar
print(json.dumps(notlar.kilit_sahipleri(sys.argv[1]), ensure_ascii=False))
`;

/** Formdaki yazıların Türkçe kurgusal metni: Satır sonları, boş satırlar, sekme, işaretler, emoji, çok uzun sözcük. Baş ve son boşluk yok: PDF.js değeri okurken kırpar. */
function uzunMetin(no, boy) {
  const satirlar = [
    `Bölüm ${no}: Başvurucu, adil yargılanma hakkının ihlal edildiğini ileri sürmektedir.`,
    'ĞÜŞİÖÇ ğüşıöç İi Iı âîû',
    '< > & " \' &amp; <b>kalın değil</b> ]]> <!-- yorum --> <!ENTITY x "y"> endstream endobj %PDF-1.7',
    '',
    'Sekmeli\tsütun\tyazısı\t\tiki sekme',
    '😀 emoji 👩‍⚖️ ⚖️ 𝒜 ve 日本語',
    '',
    '',
    '    Başında boşluk olan paragraf',
    'Sonunda boşluk olan satır   ',
    'Uzun bir paragraf: ' + 'Mahkemece verilen kararın gerekçesi hukuka uygun değildir ve başvurucunun iddiaları incelenmemiştir. '.repeat(8),
  ];
  // Yinelenmeyen sözcükler: Dosya boyutu gerçek yazınınkine yakın çıksın (yinelenen yazı çok iyi sıkışır)
  const SOZCUK = 'mahkeme başvurucu karar gerekçe hak ihlal yargılama süre dosya dava tanık bilirkişi ceza hukuk özel kamu görevli tutanak tebligat itiraz ret kabul esas içtihat madde fıkra'.split(' ');
  let tohum = 12345 + no * 7919;
  const rastgele = (n) => { tohum = (tohum * 1103515245 + 12345) & 0x7fffffff; return tohum % n; };
  let s = '', i = 0;
  while (s.length < boy) {
    s += satirlar[i % satirlar.length] + '\n'; i++;
    if (i === 25) s += 'çokuzunsözcük'.repeat(800) + '\n';
    let p = '';
    for (let k = 0; k < 60; k++) p += SOZCUK[rastgele(SOZCUK.length)] + rastgele(1000) + ' ';
    s += p.trimEnd() + '\n';
  }
  return s.slice(0, boy).trimEnd().replace(/[\uD800-\uDBFF]$/, '') + ` son${no}`;
}
/** Metnin veri paketindeki hâli (xfa.js veriDegeri): Boş satıra bir boşluk (PDF.js okurken boş satırları atar). */
const veriHali = (s) => s.replace(/(^|\n)(?=\n)/g, '$1 ');

const YARDIMCI = `window.__s50 = {
  b: () => window.__pdefe.aktif(),
  g: () => window.__pdefe.aktif().gorunum,
  bekle: (ms) => new Promise((c) => setTimeout(c, ms)),
  async durgun() { const b = this.b(); for (let i = 0; i < 400; i++) { if (b && !b.xfa.mesgul) break; await this.bekle(50); } await b?.xfa.bekle(); await this.bekle(80); return true; },
  katman: () => document.querySelector('.gorunum:not([hidden]) .xfaLayer'),
  /** Sayfaya gider, katmanı bekler. */
  async sayfa(n) { const g = this.g(); g.sayfayaGit(n); const s = g.sayfalar[n - 1]; for (let i = 0; i < 100; i++) { const k = s.el.querySelector('.xfaLayer'); if (k) return k; await this.bekle(50); } return null; },
  denetimler(k, ad) { return [...k.querySelectorAll('[xfaname="' + ad + '"]')].map((e) => e.querySelector('input, textarea, select, button')).filter(Boolean); },
  /** Formdaki bütün ad alanlarının değerleri, sayfa sırasıyla (DOM'dan, kullanıcının gördüğü). */
  async degerler(adlar) { const g = this.g(), c = {}; for (let n = 1; n <= g.sayfaSayisi; n++) { const k = await this.sayfa(n); if (!k) continue; await this.bekle(30); for (const ad of adlar) { for (const d of this.denetimler(k, ad)) (c[ad] ||= []).push(d.value); } } return c; },
  /** ad alanının i'inci örneği (bütün sayfalarda sırayla): Görünür yapar, ortasının koordinatı. */
  async yer(ad, i = 0) { const g = this.g(); let say = 0; for (let n = 1; n <= g.sayfaSayisi; n++) { const k = await this.sayfa(n); if (!k) continue; const l = this.denetimler(k, ad); if (i - say < l.length) { const el = l[i - say]; el.scrollIntoView({ block: 'center', inline: 'center' }); await this.bekle(180); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 200), sayfa: n }; } say += l.length; } return null; },
  durum() { const b = this.b(), k = [...document.querySelectorAll('.mesaj-kutusu')].at(-1), bl = document.getElementById('bildirim');
    return { yol: b?.yol, ad: b?.ad, degisti: !!b?.degisti, kaydediliyor: !!b?.kaydediliyor, konum: b?.yigin?.konum, kayit: b?.yigin?.kayitKonumu, sayfa: b?.gorunum?.sayfaSayisi, odak: document.activeElement?.tagName,
      mesaj: document.getElementById('durum-mesaj')?.textContent || '', bildirim: bl && !bl.hidden ? bl.textContent : '', kaydetSoluk: document.querySelector('#arac-cubugu [data-komut="dosya.kaydet"]')?.disabled,
      sekmeKirli: !!document.querySelector('.sekme.etkin.degisti, .sekme.aktif.degisti, .sekme.secili.degisti'), kutu: k ? { ileti: k.querySelector('.mesaj-ileti')?.textContent, ayrinti: k.querySelector('.mesaj-ayrinti')?.textContent || '', dugmeler: [...k.querySelectorAll('.dugmeler button')].map((x) => x.textContent), varsayilan: k.querySelector('.dugmeler button.birincil')?.textContent } : null }; },
};`;

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, yaz, tus, fare }) {
  fs.mkdirSync(UI, { recursive: true });
  const ozetler = JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'xfa_pdf_uret.py'), UI], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  const KLASOR = path.join(UI, 'Şahıs Klasörü');
  fs.mkdirSync(KLASOR, { recursive: true });
  const kopya = (ad, kaynak = ozetler.xfaUzun) => { const y = path.join(KLASOR, ad); fs.copyFileSync(kaynak, y); return y; };
  const olcB = path.join(UI, 'olc.py'), rmB = path.join(UI, 'rm.py');
  fs.writeFileSync(olcB, OLC); fs.writeFileSync(rmB, RM);
  const olc = (pdf) => JSON.parse(execFileSync(PY, ['-X', 'utf8', '-I', olcB, pdf], { encoding: 'utf8', maxBuffer: 1 << 28 }));
  const kilitSahipleri = (y) => JSON.parse(execFileSync(PY, ['-X', 'utf8', '-I', rmB, y], { encoding: 'utf8' }));
  await evalJs(YARDIMCI);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const H = (kod) => evalJs(`(() => { const H = window.__s50; return ${kod}; })()`);
  const durum = () => evalJs(`window.__s50.durum()`);
  const durgun = () => evalJs(`window.__s50.durgun()`);
  const kapatHepsini = () => evalJs(`(async () => { delete window.__pdefeOtoYanit; const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const ac = async (yol) => {
    await kapatHepsini();
    await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); for (let i = 0; i < 200 && !document.querySelector('.gorunum:not([hidden]) .xfaLayer'); i++) await window.__s50.bekle(50); b.gorunum.zoomModuAyarla('genislik'); await window.__s50.bekle(350); return true; })()`);
  };
  const tiklaAd = async (ad, i = 0) => {
    const p = await evalJs(`window.__s50.yer(${J(ad)}, ${i})`);
    if (!p) throw new Error('Öğe bulunamadı: ' + ad + ' ' + i);
    await tikla(p.x, p.y);
    await bekle(120);
    return p;
  };
  /** Alana (i'inci örnek) tıklar, var olan yazıyı siler, metni yazar (alandan çıkmaz). */
  // Alana sığmayan yazı artık elle girilemez (senaryo53). Bu sınamanın konusu kaydın yolu: Dosyada duran sığmayan yazı da kaybolmamalı: Sığan kısmı alınınca kalanıyla değer doğrudan konur
  const alanaYaz = async (ad, i, metin) => { await tiklaAd(ad, i); await tus('a', ['ctrl']); await tus('Delete'); await yaz(metin); await evalJs(`(() => { const e = document.activeElement, m = ${J(metin)}; if (e.value !== m.replace(/\\r\\n?/g, '\\n')) { e.value = m; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } return e.value.length; })()`); await bekle(40); };
  const kutuBekle = async (ms = 15000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await bekle(60)) { const d = await durum(); if (d.kutu) return d; } return durum(); };
  const kutuBas = async (ad) => {
    const p = await evalJs(`(() => { const d = [...[...document.querySelectorAll('.mesaj-kutusu')].at(-1).querySelectorAll('.dugmeler button')].find((x) => x.textContent === ${J(ad)}); if (!d) return null; const r = d.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!p) throw new Error('Kutu düğmesi yok: ' + ad);
    await tikla(p.x, p.y);
    await bekle(100);
  };
  const kayitBitsin = async (ms = 60000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await bekle(50)) { const d = await durum(); if (!d.kaydediliyor || d.kutu) return d; } return durum(); };
  const kaydetKomutu = async () => { await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`); await bekle(30); return kayitBitsin(); };
  const kilitle = async (yol, paylasim = 1) => {
    const p = spawn(PY, ['-X', 'utf8', '-I', path.join(KOK, 'test', 'kilit_tut.py'), yol, String(paylasim)], { stdio: ['pipe', 'pipe', 'inherit'] });
    const ilk = await new Promise((c) => p.stdout.once('data', (v) => c(String(v).trim())));
    if (ilk !== 'kilitlendi') throw new Error('Kilit alınamadı: ' + ilk);
    return { birak: async () => { p.stdin.end(); await new Promise((c) => p.once('exit', c)); } };
  };
  const goruntu = (ad) => ekranGoruntusu(path.join(UI, `${ad}.png`));
  const hatalar = async () => { const h = await evalJs(`window.__hatalar.splice(0)`); return h.filter((x) => !/ResizeObserver/.test(x)); };
  const yanitla = (kanal, yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', ${J(kanal)}, ${J(yanitlar)})`);
  const kirliDegil = (d) => !d.degisti && d.konum === d.kayit;

  // ==================================================================================== gerçek kaydetme penceresi
  if (KIP === 'yerel') {
    const MASA = process.env.S50_MASA, SUREC = process.env.S50_SUREC;
    /** Kaydetme penceresini süren yardımcıyı görünmeyen masaüstünde başlatır. Döner: Bitince adımların çıktısını veren işlev. */
    const yerel = (adimlar) => {
      const cikti = path.join(UI, `yerel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`);
      const ps = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const komut = `"${ps}" -STA -NoProfile -ExecutionPolicy Bypass -File "${path.join(KOK, 'test', 'yerel_pencere_sur.ps1')}" -SurecNo ${SUREC} -Cikti "${cikti}" -Adimlar "${adimlar}"`;
      execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'masaustunde_baslat.ps1'), '-Masaustu', MASA, '-Komut', komut], { encoding: 'utf8' });
      return async () => {
        for (let i = 0; i < 300; i++) {
          await bekle(150);
          if (fs.existsSync(cikti)) { const m = fs.readFileSync(cikti, 'utf8'); if (m.includes('BITTI')) return m.trim(); }
        }
        return 'ZAMAN AŞIMI ' + (fs.existsSync(cikti) ? fs.readFileSync(cikti, 'utf8') : '');
      };
    };
    /** Son sayfadaki Formu Kaydet'e gerçek fareyle basar, kaydetme penceresini adimlar'la sürer. */
    const formuKaydet = async (adimlar) => { const bitti = yerel(adimlar); await tiklaAd('Kaydet', 0); const m = await bitti(); return m; };

    if (bolum('y1')) {
      const yol = kopya('_ornek form (1).pdf'), once = ozet(yol);
      await ac(yol);
      await alanaYaz('AdSoyad', 0, 'Kurgusal Başvurucu Çiğdem');
      const m = await formuKaydet(`bak|ad=${yol}|evet`);
      const d = await kayitBitsin();
      await bekle(250);
      const son = await durum();
      await goruntu('y1-kaydedildi');
      sonuc('y1 Kaydetme penceresi açık dosyanın adı ve klasörüyle açıldı', /OK bak baslik='Farklı kaydet' ad='_ornek form \(1\)(\.pdf)?'/.test(m), m);
      sonuc('y1 "Değiştirilsin mi" soruldu, Evet', /OK evet .*zaten var/s.test(m), m);
      sonuc('y1 Belge temiz, yol aynı, görünür onay', !d.kutu && kirliDegil(son) && son.ad === '_ornek form (1).pdf' && /kaydedildi/.test(son.bildirim) && son.mesaj === 'Kaydedildi', son);
      const o = olc(yol);
      sonuc('y1 Dosya değişti, değer dosyada, MuPDF onarmadan açıyor, kullanım hakkı kalktı', ozet(yol) !== once && o.degerler['form1/Baslik/AdSoyad']?.[0] === 'Kurgusal Başvurucu Çiğdem' && !o.onarildi && !o.hak && o.saf, o);
      sonuc('y1 Klasörde geçici dosya yok', fs.readdirSync(KLASOR).every((a) => !a.endsWith('.tmp') && !a.includes('pdefe-tmp')), fs.readdirSync(KLASOR));
      sonuc('y1 Kendi kilidi yok', !kilitSahipleri(yol).length, kilitSahipleri(yol));
    }
    if (bolum('y2')) {
      const yol = kopya('kilitli (2) ğüş.pdf'), kilit = await kilitle(yol, 1), once = ozet(yol);
      await ac(yol);
      await alanaYaz('AdSoyad', 0, 'Kilitliyken yazılan');
      await tiklaAd('Sehir', 0); await yaz('Ankara'); await tus('Tab');
      const m = await formuKaydet(`ad=${yol}|evet`);
      let d = await kutuBekle(20000);
      await goruntu('y2-kilitli');
      sonuc('y2 Pencere: Belge kaydedilemedi, üç düğme, Yeniden dene birincil', d.kutu?.ileti === 'Belge kaydedilemedi' && J(d.kutu.dugmeler) === J(['Yeniden dene', 'Farklı kaydet', 'Vazgeç']) && d.kutu.varsayilan === 'Yeniden dene', { d, m });
      sonuc('y2 Kilitleyen programın adı söyleniyor, ham hata ve yol yok', /Dosya "Python" programında açık/.test(d.kutu?.ayrinti) && !hamHataVar(d.kutu?.ayrinti) && !d.kutu?.ayrinti.includes(KLASOR), d.kutu);
      sonuc('y2 Yazılanlar duruyor deniyor, özgün dosya aynı, geçici dosya yok', /yazdıklarınız PDEfe'de duruyor/.test(d.kutu?.ayrinti) && ozet(yol) === once && fs.readdirSync(KLASOR).every((a) => !a.endsWith('.tmp')), fs.readdirSync(KLASOR));
      // Yeniden dene, kilit sürüyor: Yine aynı pencere, kaydetme penceresi açılmaz
      await kutuBas('Yeniden dene');
      await bekle(300);
      d = await kutuBekle(20000);
      sonuc('y2 Yeniden dene (kilit sürüyor): Aynı pencere, dosya aynı', d.kutu?.ileti === 'Belge kaydedilemedi' && ozet(yol) === once && d.degisti, d);
      await kilit.birak();
      await kutuBas('Yeniden dene');
      d = await kayitBitsin();
      await bekle(200);
      const son = await durum();
      await goruntu('y2-yeniden-dene-basarili');
      sonuc('y2 Kilit kalkınca Yeniden dene kaydetti, pencere kapandı, belge temiz', !son.kutu && kirliDegil(son) && /kaydedildi/.test(son.bildirim), son);
      const o = olc(yol);
      sonuc('y2 Yazılanlar dosyada', o.degerler['form1/Baslik/AdSoyad']?.[0] === 'Kilitliyken yazılan' && o.degerler['form1/Baslik/Sehir']?.[0] === 'Ankara', o.degerler);
    }
    if (bolum('y3')) {
      const yol = kopya('kilitli paylasimsiz.pdf'), yeni = path.join(KLASOR, 'yeni ad (kopya) ğ.pdf');
      await ac(yol);
      const once = ozet(yol), kilit = await kilitle(yol, 0);
      await alanaYaz('AdSoyad', 0, 'Başka ada kaydedilecek');
      await formuKaydet(`ad=${yol}|evet`);
      let d = await kutuBekle(20000);
      sonuc('y3 Paylaşımsız kilit: Pencere üç düğmeli', J(d.kutu?.dugmeler) === J(['Yeniden dene', 'Farklı kaydet', 'Vazgeç']), d);
      const bitti = yerel(`bak|ad=${yeni}`);
      await kutuBas('Farklı kaydet');
      const m = await bitti();
      d = await kayitBitsin();
      await bekle(200);
      const son = await durum();
      sonuc('y3 Farklı kaydet: Gerçek pencere, sekme yeni dosyada, belge temiz', /OK bak/.test(m) && !son.kutu && kirliDegil(son) && son.ad === path.basename(yeni) && son.yol.toLowerCase() === yeni.toLowerCase(), { son, m });
      await kilit.birak();
      sonuc('y3 Eski dosya aynı, değer yeni dosyada', ozet(yol) === once && olc(yeni).degerler['form1/Baslik/AdSoyad']?.[0] === 'Başka ada kaydedilecek');
      await alanaYaz('AdSoyad', 0, 'Yeni dosyaya ikinci kayıt');
      await kaydetKomutu();
      sonuc('y3 Sonraki kayıt yeni dosyaya', olc(yeni).degerler['form1/Baslik/AdSoyad']?.[0] === 'Yeni dosyaya ikinci kayıt' && ozet(yol) === once);
    }
    if (bolum('y4')) {
      const yol = kopya('vazgec.pdf'), once = ozet(yol);
      await ac(yol);
      await alanaYaz('AdSoyad', 0, 'Vazgeçilecek yazı');
      // İptal ve Hayır
      let m = await formuKaydet('iptal');
      let d = await kayitBitsin();
      await bekle(200);
      sonuc('y4 Kaydetme penceresinde İptal: Yazılmadı, hata yok, kirli', /OK iptal/.test(m) && !d.kutu && d.degisti && ozet(yol) === once, { d, m });
      m = await formuKaydet(`ad=${yol}|hayir|iptal`);
      d = await kayitBitsin();
      await bekle(200);
      sonuc('y4 "Değiştirilsin mi" Hayır: Yazılmadı, hata yok, kirli', /OK hayir/.test(m) && !d.kutu && d.degisti && ozet(yol) === once, { d, m });
      // Kilit, Vazgeç, geri al yığını ve yazılanlar
      const kilit = await kilitle(yol, 1);
      const konum = d.konum;
      await formuKaydet(`ad=${yol}|evet`);
      d = await kutuBekle(20000);
      await kutuBas('Vazgeç');
      d = await kayitBitsin();
      await bekle(150);
      const deger = await H(`H.denetimler(H.katman(), 'AdSoyad')[0]?.value`);
      sonuc('y4 Vazgeç: Yol aynı, kirli, geri al yığını yerinde, yazı alanda, dosya aynı', d.yol.toLowerCase() === yol.toLowerCase() && d.degisti && d.konum === konum && !d.kutu && ozet(yol) === once, { d, konum });
      if (deger != null) sonuc('y4 Vazgeç: Yazı alanda duruyor', deger === 'Vazgeçilecek yazı', deger);
      // Kapatma sorusu
      await evalJs(`(window.pdefe.cagir('pencere:kapat'), true)`);
      d = await kutuBekle();
      await goruntu('y4-kapatma-sorusu');
      sonuc('y4 Kapatma sorusu "Son kayıt yapılamadı" diyor', /Son kayıt yapılamadı\. Kaydetmezseniz yazdıklarınız kaybolur\./.test(d.kutu?.ayrinti) && J(d.kutu?.dugmeler) === J(['Kaydet', 'Kaydetme', 'Vazgeç']), d.kutu);
      await kutuBas('Kaydet');
      await bekle(200);
      d = await kutuBekle(20000);
      sonuc('y4 Kapatmada Kaydet başarısız: Hata penceresi, pencere açık', d.kutu?.ileti === 'Belge kaydedilemedi' && (await H(`!!H.b()`)), d.kutu);
      await kutuBas('Vazgeç');
      await bekle(400);
      d = await durum();
      sonuc('y4 Vazgeç: Pencere kapanmadı, yazılanlar yerinde, kirli', !d.kutu && d.degisti && d.ad === 'vazgec.pdf', d);
      await kilit.birak();
      await evalJs(`(window.pdefe.cagir('pencere:kapat'), true)`);
      d = await kutuBekle();
      await kutuBas('Kaydet');
      for (const t0 = Date.now(); Date.now() - t0 < 8000; await bekle(100)) { const t = await H(`H.b() ? H.durum() : null`).catch(() => null); if (!t || (!t.degisti && !t.kaydediliyor)) break; }
      sonuc('y4 Kilit kalkınca kapatmada Kaydet yazdı', olc(yol).degerler['form1/Baslik/AdSoyad']?.[0] === 'Vazgeçilecek yazı');
      // Pencere kapandı: Örnek bitti, y5 ayrı koşulur (senaryo50_kos.ps1)
      return son();
    }
    if (bolum('y5')) {
      const yol = kopya('kapatma.pdf');
      await ac(yol);
      await tiklaAd('AdSoyad', 0);
      await yaz('Alandan çıkılmadı, yazı kaybolmamalı');
      const d0 = await durum();
      sonuc('y5 Yazarken belge kirli görünür, Kaydet düğmesi etkin, alan odakta', d0.degisti && !d0.kaydetSoluk && d0.odak === 'INPUT', d0);
      await evalJs(`(window.pdefe.cagir('pencere:kapat'), true)`);
      const d = await kutuBekle();
      sonuc('y5 Pencere kapatılırken soru çıktı', /kaydedilmemiş/.test(d.kutu?.ileti), d.kutu);
      await kutuBas('Kaydet');
      for (const t0 = Date.now(); Date.now() - t0 < 8000; await bekle(100)) { try { await evalJs('1'); } catch { break; } }
      sonuc('y5 Pencere kapandı, yazı dosyada', olc(yol).degerler['form1/Baslik/AdSoyad']?.[0] === 'Alandan çıkılmadı, yazı kaybolmamalı');
      return son();
    }
    return son();
  }

  function son() {
    console.log(`\n${denetim} denetim, ${hataSayisi} hata`);
    if (hataSayisi) process.exitCode = 1;
    return undefined;
  }

  // ==================================================================================== 1) uzun yazı
  if (bolum(1)) {
    const yol = kopya('uzun.pdf');
    await ac(yol);
    const BAS = 20, BOL = 20, BOY = 200000;
    // Bölümler (kullanıcı gibi düğmeyle): 19 Başvurucu, 19 Bölüm
    for (let i = 1; i < BAS; i++) { await tiklaAd('BEkle', 0); await durgun(); }
    for (let i = 1; i < BOL; i++) { await tiklaAd('MEkle', 0); await durgun(); }
    let d = await durum();
    bilgi(`sayfa: ${d.sayfa}`);
    sonuc('1) 20 Başvurucu, 20 Bölüm eklendi', olcSayi(await H(`H.degerler(['BAd', 'Metin'])`), BAS, BOL), d);
    function olcSayi(v, a, b) { return v.BAd?.length === a && v.Metin?.length === b; }
    const metinler = [], adlar = [], adresler = [];
    await alanaYaz('AdSoyad', 0, 'Kurgusal Başvurucu İĞŞÇÖÜ ığşçöü < > & " \'');
    for (let i = 0; i < BAS; i++) {
      adlar.push(`Başvurucu ${i + 1} Çağdaş Öğüt`); adresler.push(uzunMetin(1000 + i, 5000));
      await alanaYaz('BAd', i, adlar[i]);
      await alanaYaz('BAdres', i, adresler[i]);
    }
    const yazT0 = Date.now();
    for (let i = 0; i < BOL; i++) {
      metinler.push(uzunMetin(i + 1, BOY));
      await alanaYaz('Metin', i, metinler[i]);
    }
    bilgi(`yazı girişi: ${((Date.now() - yazT0) / 1000).toFixed(1)} sn (${BOL} × ${BOY} karakter)`);
    // Yazma gecikmesi: Dolu 200.000 karakterlik alanda tuş (CDP'nin yanıtı işlenince gelir)
    await tiklaAd('Metin', BOL - 1); await tus('End', ['ctrl']);
    const sureler = [];
    // Bir sonraki kare de sayılır: Yazının ekrana gelmesi
    const KARE = `new Promise((c) => requestAnimationFrame(() => setTimeout(c, 0)))`;
    // Sığmayan alanda harf girmez: Ölçü harfin reddi ve kare (alan yazıyı değiştirmez)
    for (let i = 0; i < 20; i++) { const t = performance.now(); await tus('x'); await evalJs(KARE); sureler.push(performance.now() - t); }
    sureler.sort((a, b) => a - b);
    bilgi(`tuş gecikmesi (20 tuş, ortanca / en çok): ${sureler[10].toFixed(0)} / ${sureler[19].toFixed(0)} ms`);
    sonuc('1) Dolu alanda yazma gecikmesi ortanca 150 ms altında', sureler[10] < 150, sureler);
    // Kaydet
    const t0 = Date.now();
    d = await kaydetKomutu();
    const kayitSn = (Date.now() - t0) / 1000;
    await bekle(100);
    d = await durum();
    await goruntu('1-uzun-kaydedildi');
    const boyut = fs.statSync(yol).size;
    bilgi(`kayıt süresi: ${kayitSn.toFixed(2)} sn, dosya: ${(boyut / 1048576).toFixed(2)} MB`);
    sonuc('1) Kaydedildi, belge temiz, 30 sn altında', !d.kutu && kirliDegil(d) && kayitSn < 30, d);
    const o = olc(yol);
    const fark = (al, ver) => { const i = [...Array(Math.min(al.length, ver.length)).keys()].find((k) => al[k] !== ver[k]); return { uzunluk: [al.length, ver.length], ilkFark: i, al: i != null ? al.slice(Math.max(0, i - 20), i + 30) : '', ver: i != null ? ver.slice(Math.max(0, i - 20), i + 30) : '' }; };
    const metinVeri = o.degerler['form1/Bolum/Metin'] || [], adresVeri = o.degerler['form1/Basvurucu/BAdres'] || [], adVeri = o.degerler['form1/Basvurucu/BAd'] || [];
    sonuc('1) Dosya: Onarılmadan açılıyor, saf XFA', !o.onarildi && o.saf);
    sonuc('1) Dosya: Başlık alanı karakteri karakterine', o.degerler['form1/Baslik/AdSoyad']?.[0] === 'Kurgusal Başvurucu İĞŞÇÖÜ ığşçöü < > & " \'', o.degerler['form1/Baslik/AdSoyad']);
    const dosyaFark = metinler.map((m, i) => (metinVeri[i] === veriHali(m) ? -1 : i)).filter((i) => i >= 0);
    sonuc('1) Dosya: 20 × 200.000 karakter karakteri karakterine (boş satırda bir boşluk)', metinVeri.length === BOL && !dosyaFark.length, dosyaFark.length ? fark(metinVeri[dosyaFark[0]], veriHali(metinler[dosyaFark[0]])) : metinVeri.length);
    const adresFark = adresler.map((m, i) => (adresVeri[i] === veriHali(m) ? -1 : i)).filter((i) => i >= 0);
    sonuc('1) Dosya: 20 adres ve 20 ad aynı', adresVeri.length === BAS && !adresFark.length && J(adVeri) === J(adlar), adresFark.length ? fark(adresVeri[adresFark[0]], veriHali(adresler[adresFark[0]])) : adVeri);
    // Kapat, aç: DOM
    const t1 = Date.now();
    await ac(yol);
    bilgi(`yeniden açılış: ${((Date.now() - t1) / 1000).toFixed(2)} sn`);
    const v = await H(`H.degerler(['AdSoyad', 'BAd', 'BAdres', 'Metin'])`);
    const domFark = metinler.map((m, i) => (v.Metin?.[i] === veriHali(m) ? -1 : i)).filter((i) => i >= 0);
    sonuc('1) Yeniden açınca DOM: 20 × 200.000 karakter aynı', v.Metin?.length === BOL && !domFark.length, domFark.length ? fark(v.Metin[domFark[0]], veriHali(metinler[domFark[0]])) : v.Metin?.length);
    sonuc('1) Yeniden açınca DOM: Adresler, adlar, başlık aynı', J(v.BAd) === J(adlar) && adresler.every((m, i) => v.BAdres?.[i] === veriHali(m)) && v.AdSoyad?.[0] === 'Kurgusal Başvurucu İĞŞÇÖÜ ığşçöü < > & " \'', { ad: v.BAd?.slice(0, 2) });
    d = await durum();
    sonuc('1) Yeniden açınca belge temiz', !d.degisti, d);
    // Doluyken bölüm silme ve ekleme: Değerler yerinde
    const t2 = Date.now();
    await tiklaAd('MSil', 0); await durgun();
    bilgi(`dolu formda Bölüm Sil: ${((Date.now() - t2) / 1000).toFixed(2)} sn`);
    const t3 = Date.now();
    await tiklaAd('MEkle', 0); await durgun();
    bilgi(`dolu formda Bölüm Ekle: ${((Date.now() - t3) / 1000).toFixed(2)} sn`);
    const v2 = await H(`H.degerler(['Metin'])`);
    sonuc('1) Doluyken Sil ve Ekle: İlk 19 bölüm yerinde, yeni bölüm boş', v2.Metin?.length === BOL && metinler.slice(0, BOL - 1).every((m, i) => v2.Metin[i] === veriHali(m)) && v2.Metin[BOL - 1] === '', v2.Metin?.map((m) => m.length));
    d = await kaydetKomutu();
    const o2 = olc(yol);
    sonuc('1) Yeniden kaydet: Dosyada 19 dolu, 1 boş bölüm', metinler.slice(0, BOL - 1).every((m, i) => o2.degerler['form1/Bolum/Metin'][i] === veriHali(m)) && o2.degerler['form1/Bolum/Metin'][BOL - 1] === '' && !o2.onarildi);
    await kapatHepsini();
  }

  // ==================================================================================== 2) 30 kez üst üste
  if (bolum(2)) {
    const yol = kopya('otuz.pdf');
    await ac(yol);
    const taban = uzunMetin(7, 20000);
    await alanaYaz('Metin', 0, taban);
    const boylar = [];
    let bozuk = 0, pdfjsBozuk = 0;
    for (let i = 1; i <= 30; i++) {
      await alanaYaz('AdSoyad', 0, `Kayıt ${i}`);
      const d = await kaydetKomutu();
      if (d.kutu || d.degisti) { sonuc(`2) ${i}. kayıt`, false, d); break; }
      boylar.push(fs.statSync(yol).size);
      const o = olc(yol);
      if (o.onarildi || !o.saf || o.degerler['form1/Baslik/AdSoyad']?.[0] !== `Kayıt ${i}` || o.degerler['form1/Bolum/Metin']?.[0] !== veriHali(taban)) bozuk++;
      // PDF.js: Kopyası ikinci sekmede açılır, değerler okunur
      const kopyaYol = path.join(KLASOR, `otuz-kopya-${i % 3}.pdf`);
      fs.copyFileSync(yol, kopyaYol);
      const r = await evalJs(`(async () => { const p = window.__pdefe, ilk = p.aktif().id; const b = await p.dosyaAc(${J(kopyaYol)}); for (let k = 0; k < 100 && !b.gorunum.el?.querySelector?.('.xfaLayer') && !document.querySelector('.gorunum:not([hidden]) .xfaLayer [xfaname="AdSoyad"]'); k++) await window.__s50.bekle(50); const de = document.querySelector('.gorunum:not([hidden]) .xfaLayer [xfaname="AdSoyad"] input')?.value; await p.belgeKapat(b.id, { zorla: true }); await p.sekmeSec(ilk); return de; })()`);
      if (r !== `Kayıt ${i}`) pdfjsBozuk++;
    }
    bilgi(`boyutlar: ilk ${boylar[0]}, son ${boylar.at(-1)} bayt`);
    sonuc('2) 30 kayıt: MuPDF onarmadan açıyor, değerler doğru', boylar.length === 30 && !bozuk, { bozuk, kayit: boylar.length });
    sonuc('2) 30 kayıt: PDF.js her kayıttan sonra açıyor', !pdfjsBozuk, pdfjsBozuk);
    sonuc('2) 30 kayıtta dosya büyümedi', boylar.at(-1) <= boylar[0] + 512, boylar);
    await kapatHepsini();
  }

  // ==================================================================================== 3) geri al, yinele, Farklı kaydet
  if (bolum(3)) {
    const yol = kopya('gerial.pdf');
    await ac(yol);
    await alanaYaz('AdSoyad', 0, 'Birinci'); await tus('Tab');
    await kaydetKomutu();
    let d = await durum();
    sonuc('3) Kayıt: Temiz', kirliDegil(d), d);
    await alanaYaz('AdSoyad', 0, 'İkinci');
    d = await durum();
    sonuc('3) Kayıttan sonra yazmaya devam: Hemen kirli', d.degisti && !d.kaydetSoluk, d);
    await tus('Tab');
    await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), true)`).catch(() => {});
    await evalJs(`(window.__pdefe.aktif().yigin.geriAl(), true)`).catch(() => {});
    await durgun();
    await bekle(100);
    let v = await H(`H.denetimler(H.katman(), 'AdSoyad')[0].value`);
    d = await durum();
    sonuc('3) Geri al: "Birinci", kayıtlı konumda temiz', v === 'Birinci' && !d.degisti, { v, d });
    await evalJs(`(window.__pdefe.aktif().yigin.yinele(), true)`);
    await durgun();
    v = await H(`H.denetimler(H.katman(), 'AdSoyad')[0].value`);
    d = await durum();
    sonuc('3) Yinele: "İkinci", kirli', v === 'İkinci' && d.degisti, { v, d });
    d = await kaydetKomutu();
    sonuc('3) Yeniden kaydet: Dosyada "İkinci"', olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'İkinci' && kirliDegil(await durum()));
    await evalJs(`(window.__pdefe.aktif().yigin.geriAl(), true)`);
    await durgun();
    d = await durum();
    sonuc('3) Kayıttan sonra geri al: Kirli', d.degisti, d);
    await kaydetKomutu();
    sonuc('3) Geri alınmış hâl kaydedildi: Dosyada "Birinci"', olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'Birinci' && kirliDegil(await durum()));
    // Yapı komutu: Ekle, kaydet, geri al, kaydet
    await tiklaAd('MEkle', 0); await durgun();
    await kaydetKomutu();
    sonuc('3) Ekle + kaydet: Dosyada iki bölüm', olc(yol).degerler['form1/Bolum/Metin'].length === 2);
    await evalJs(`(window.__pdefe.aktif().yigin.geriAl(), true)`);
    await durgun();
    await kaydetKomutu();
    sonuc('3) Geri al + kaydet: Dosyada bir bölüm, değer yerinde', olc(yol).degerler['form1/Bolum/Metin'].length === 1 && olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'Birinci');
    // Farklı kaydet
    const once = ozet(yol), yeni = path.join(KLASOR, 'farkli (yeni).pdf');
    await alanaYaz('AdSoyad', 0, 'Farklı kaydedilen');
    await yanitla('dosya:kaydetDiyalog', [yeni]);
    await evalJs(`(window.__pdefe.komutCalistir('dosya.farkliKaydet'), true)`);
    await bekle(100);
    d = await kayitBitsin();
    await bekle(100);
    d = await durum();
    sonuc('3) Farklı kaydet: Sekme yeni dosyada, temiz, eski dosya aynı', d.ad === 'farkli (yeni).pdf' && kirliDegil(d) && ozet(yol) === once && olc(yeni).degerler['form1/Baslik/AdSoyad'][0] === 'Farklı kaydedilen', d);
    await alanaYaz('AdSoyad', 0, 'Yeni dosyada yazı');
    await kaydetKomutu();
    sonuc('3) Sonraki kayıt yeni dosyaya, eski dosya yine aynı', olc(yeni).degerler['form1/Baslik/AdSoyad'][0] === 'Yeni dosyada yazı' && ozet(yol) === once);
    await kapatHepsini();
  }

  // ==================================================================================== 4) yarışlar
  if (bolum(4)) {
    // Düğmeye iki kez hızlı basma: Tek pencere, tek kayıt
    let yol = kopya('yaris1.pdf');
    await ac(yol);
    await alanaYaz('AdSoyad', 0, 'İki tıklama');
    const hedef = path.join(KLASOR, 'yaris1-hedef.pdf');
    await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);   // önceki bölümlerin kaydı silinir
    await yanitla('dosya:kaydetDiyalog', [hedef]);
    const p = await evalJs(`window.__s50.yer('Kaydet', 0)`);
    await fare([{ tur: 'hareket', x: p.x, y: p.y }, { tur: 'bas', x: p.x, y: p.y }, { tur: 'birak', x: p.x, y: p.y }, { tur: 'bas', x: p.x, y: p.y, tiklama: 2 }, { tur: 'birak', x: p.x, y: p.y, tiklama: 2 }]);
    await bekle(200);
    let d = await kayitBitsin();
    await bekle(250);
    d = await durum();
    const kay = await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
    sonuc('4) Formu Kaydet iki kez: Tek kaydetme penceresi, hata yok, temiz', kay.filter((k) => k.kanal === 'dosya:kaydetDiyalog').length === 1 && !d.kutu && kirliDegil(d) && fs.existsSync(hedef), { kay, d });
    // Ekle sürerken kaydetme: Hata yok, kaydedilen dosya bozuk değil, sonuç tutarlı
    yol = kopya('yaris2.pdf');
    await ac(yol);
    await alanaYaz('AdSoyad', 0, 'Ekle sürerken');
    await tus('Tab');
    const e = await evalJs(`window.__s50.yer('MEkle', 0)`);
    await tikla(e.x, e.y);
    await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
    await durgun();
    d = await kayitBitsin();
    await durgun();
    await bekle(200);
    d = await durum();
    sonuc('4) Ekle sürerken kaydet: Hata penceresi yok', !d.kutu, d);
    let o = olc(yol);
    const oSayi = o.degerler['form1/Bolum/Metin']?.length;
    sonuc('4) Ekle sürerken kaydet: Dosya sağlam, değer dosyada, yapı ve kirli işareti tutarlı', !o.onarildi && o.degerler['form1/Baslik/AdSoyad'][0] === 'Ekle sürerken' && ((oSayi === 2 && !d.degisti) || (oSayi === 1 && d.degisti)), { oSayi, d });
    await kaydetKomutu();
    sonuc('4) Sonraki kayıtta iki bölüm dosyada', olc(yol).degerler['form1/Bolum/Metin'].length === 2);
    // Kayıt sürerken yazma: Yazılan kaybolmaz, belge kirli kalır (çekirdeğin yanıtı 800 ms geciktirilir: Kayıt sürerken yazılabilsin)
    yol = kopya('yaris3.pdf');
    await ac(yol);
    const buyuk = uzunMetin(3, 200000);
    await alanaYaz('Metin', 0, buyuk);
    await alanaYaz('AdSoyad', 0, 'A');
    await evalJs(`(() => { const x = window.__s50.b().xfa, c = x.cekirdek; x.cekirdek = async (y, p) => { if (y === 'xfa_kaydet') await window.__s50.bekle(800); return c(y, p); }; return true; })()`);
    await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
    await yaz('B');   // kayıt başladı, alan odakta
    d = await durum();
    const surerken = d.kaydediliyor;
    await yaz('C');
    d = await kayitBitsin();
    await bekle(120);
    d = await durum();
    v3(await H(`H.denetimler(H.katman(), 'AdSoyad')[0]?.value`), d, surerken);
    function v3(v, st, sr) {
      bilgi(`kayıt sürerken yazıldı mı: ${sr}, alan: ${v}`);
      sonuc('4) Kayıt sürerken yazılan alanda duruyor, belge kirli', v === 'ABC' && st.degisti && !st.kutu, { v, st });
    }
    await kaydetKomutu();
    d = await durum();
    sonuc('4) Yeniden kaydet: "ABC" dosyada, temiz', olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'ABC' && kirliDegil(d), d);
    // Kayıt sürerken sekme kapatma: Kayıt bitmesi beklenir, kaydedilir; soru yok (değişiklik kalmadı)
    await alanaYaz('AdSoyad', 0, 'Kapatılıyor');
    const r = await evalJs(`(async () => { const p = window.__pdefe, b = p.aktif(); window.__pdefeOtoYanit = { secim: 2 }; const k = p.belgeKaydet(b); const kapandi = await p.belgeKapat(b.id); await k; const soru = window.__pdefeOtoYanit.son?.mesaj || null; delete window.__pdefeOtoYanit; return { kapandi, soru }; })()`);
    sonuc('4) Kayıt sürerken sekme kapatma: Kayıt bitti, soru yok, sekme kapandı', r.kapandi && !r.soru && olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'Kapatılıyor' && olc(yol).degerler['form1/Bolum/Metin'][0] === veriHali(buyuk), r);
    await kapatHepsini();
  }

  // ==================================================================================== 5) hata benzetimi (arayüz)
  if (bolum(5)) {
    const yol = kopya('hata.pdf');
    await ac(yol);
    await alanaYaz('AdSoyad', 0, 'Hata benzetimi');
    const once = ozet(yol);
    /** Çekirdeğin xfa_kaydet yanıtı bir kez hata olur (ileti). */
    const hataKoy = (ileti, kez = 1) => evalJs(`(() => { const x = window.__s50.b().xfa, c = x._cekirdekAsil || (x._cekirdekAsil = x.cekirdek); let k = ${kez}; x.cekirdek = (y, p) => { if (y === 'xfa_kaydet' && k-- > 0) return Promise.reject(new Error(${J(ileti)})); return c(y, p); }; return true; })()`);
    const VAKALAR = [
      ['Dosya yazılamadı, diskte yer kalmadı.', /Diskte yer kalmadı/, ['Yeniden dene', 'Farklı kaydet', 'Vazgeç']],
      ['Dosya yazılamadı, yazılan kopya doğrulanamadı.', /doğrulanamadı/, ['Yeniden dene', 'Farklı kaydet', 'Vazgeç']],
      ['Dosya yazılamadı, bu konuma yazma izni yok.', /yazma izni yok/, ['Farklı kaydet', 'Yeniden dene', 'Vazgeç']],
      ['Dosya yazılamadı, klasör bulunamadı.', /klasörü bulunamadı/, ['Farklı kaydet', 'Yeniden dene', 'Vazgeç']],
      ['Çekirdek süreç beklenmedik biçimde kapandı.', /Dosya yazılamadı/, ['Yeniden dene', 'Farklı kaydet', 'Vazgeç']],
      ["Dosya yazılamadı. ([Errno 28] No space: 'D:\\\\Belgeler\\\\a.pdf')", /Dosya yazılamadı/, ['Yeniden dene', 'Farklı kaydet', 'Vazgeç']],
    ];
    for (const [ileti, metin, dugmeler] of VAKALAR) {
      await hataKoy(ileti);
      await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
      const d = await kutuBekle();
      sonuc(`5) "${ileti.slice(0, 44)}": Pencere, düğmeler, ham hata yok, dosya aynı`, d.kutu?.ileti === 'Belge kaydedilemedi' && metin.test(d.kutu.ayrinti) && J(d.kutu.dugmeler) === J(dugmeler) && !hamHataVar(d.kutu.ayrinti) && ozet(yol) === once && d.degisti, d.kutu);
      await kutuBas('Vazgeç');
      await kayitBitsin();
      await bekle(50);
      const s = await durum();
      const v = await H(`H.denetimler(H.katman(), 'AdSoyad')[0]?.value`);
      sonuc('5) Vazgeç: Kirli, yazı alanda', s.degisti && v === 'Hata benzetimi' && !s.kutu && !s.kaydediliyor, { s, v });
    }
    // Yeniden dene geçici hatadan sonra başarılı
    await hataKoy('Dosya yazılamadı, diskte yer kalmadı.');
    await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
    await kutuBekle();
    await kutuBas('Yeniden dene');
    await kayitBitsin();
    await bekle(100);
    const s = await durum();
    sonuc('5) Yeniden dene: Başarılı, pencere kapandı, temiz, dosyada', !s.kutu && kirliDegil(s) && olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'Hata benzetimi', s);
    // Kapatma sorusu: Başarılı kayıttan sonra olağan metin
    await alanaYaz('AdSoyad', 0, 'Yine yazı');
    const k = await evalJs(`(async () => { const o = { secim: 2 }; window.__pdefeOtoYanit = o; const b = window.__s50.b(); await window.__pdefe.belgeKapat(b.id); delete window.__pdefeOtoYanit; return o.son?.ayrinti; })()`);
    sonuc('5) Başarılı kayıttan sonra kapatma sorusunda "Son kayıt yapılamadı" yok', k === 'Çıkmadan önce kaydetmek ister misiniz?', k);
    await kapatHepsini();
  }

  // ==================================================================================== 6) dosya durumları
  if (bolum(6)) {
    // Salt okunur dosya
    let yol = kopya('salt-okunur.pdf');
    await ac(yol);
    fs.chmodSync(yol, 0o444);
    let once = ozet(yol);
    await alanaYaz('AdSoyad', 0, 'Salt okunur');
    const t0 = Date.now();
    await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
    let d = await kutuBekle();
    bilgi(`salt okunur pencere süresi: ${Date.now() - t0} ms`);
    sonuc('6) Salt okunur dosya: Anlaşılır pencere, dosya aynı, beklemeden', /salt okunur/.test(d.kutu?.ayrinti) && J(d.kutu?.dugmeler) === J(['Farklı kaydet', 'Yeniden dene', 'Vazgeç']) && ozet(yol) === once && !hamHataVar(d.kutu?.ayrinti) && Date.now() - t0 < 2500, d.kutu);
    let yeni = path.join(KLASOR, 'salt-okunur-kopya.pdf');
    await yanitla('dosya:kaydetDiyalog', [yeni]);
    await kutuBas('Farklı kaydet');
    await kayitBitsin();
    await bekle(100);
    d = await durum();
    sonuc('6) Salt okunur dosya: Farklı kaydet başarılı', d.ad === 'salt-okunur-kopya.pdf' && kirliDegil(d) && olc(yeni).degerler['form1/Baslik/AdSoyad'][0] === 'Salt okunur', d);
    fs.chmodSync(yol, 0o644);
    await kapatHepsini();
    // Salt okunur klasör (yazma izni kaldırılır)
    const kapali = path.join(KLASOR, 'kapali klasör');
    fs.mkdirSync(kapali, { recursive: true });
    yol = path.join(kapali, 'izinsiz.pdf');
    fs.copyFileSync(ozetler.xfaUzun, yol);
    await ac(yol);
    const kullanici = execFileSync('whoami', { encoding: 'utf8' }).trim();
    execFileSync('icacls', [kapali, '/deny', `${kullanici}:(OI)(CI)(WD,AD,DC,WDAC)`], { stdio: 'ignore' });
    try {
      once = ozet(yol);
      await alanaYaz('AdSoyad', 0, 'İzinsiz klasör');
      await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
      d = await kutuBekle();
      sonuc('6) Yazılamayan klasör: Yazma izni penceresi, dosya aynı, geçici dosya yok', /yazma izni yok/.test(d.kutu?.ayrinti) && ozet(yol) === once && !hamHataVar(d.kutu?.ayrinti) && fs.readdirSync(kapali).length === 1, d.kutu);
      await kutuBas('Vazgeç');
      await kayitBitsin();
    } finally { execFileSync('icacls', [kapali, '/remove:d', kullanici], { stdio: 'ignore' }); }
    await kapatHepsini();
    // Silinmiş dosya: Yeniden yazılır
    yol = kopya('silinen.pdf');
    await ac(yol);
    fs.rmSync(yol);
    await alanaYaz('AdSoyad', 0, 'Silinen dosya');
    d = await kaydetKomutu();
    await bekle(100);
    d = await durum();
    sonuc('6) Silinmiş dosya: Yeniden yazıldı, temiz', !d.kutu && kirliDegil(d) && fs.existsSync(yol) && olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'Silinen dosya', d);
    await kapatHepsini();
    // Taşınmış klasör
    const tasinacak = path.join(KLASOR, 'tasinacak');
    fs.mkdirSync(tasinacak, { recursive: true });
    yol = path.join(tasinacak, 'tasinan.pdf');
    fs.copyFileSync(ozetler.xfaUzun, yol);
    await ac(yol);
    fs.renameSync(tasinacak, tasinacak + '-yeni');
    await alanaYaz('AdSoyad', 0, 'Taşınan dosya');
    await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
    d = await kutuBekle();
    sonuc('6) Taşınmış klasör: Klasör bulunamadı penceresi, Farklı kaydet önde', /klasörü bulunamadı/.test(d.kutu?.ayrinti) && d.kutu?.varsayilan === 'Farklı kaydet' && !hamHataVar(d.kutu?.ayrinti) && !fs.existsSync(tasinacak), d.kutu);
    yeni = path.join(KLASOR, 'tasinan-kurtarilan.pdf');
    await yanitla('dosya:kaydetDiyalog', [yeni]);
    await kutuBas('Farklı kaydet');
    await kayitBitsin();
    await bekle(100);
    d = await durum();
    sonuc('6) Taşınmış klasör: Farklı kaydet yazıyı kurtardı', kirliDegil(d) && olc(yeni).degerler['form1/Baslik/AdSoyad'][0] === 'Taşınan dosya', d);
    await kapatHepsini();
    // 260 karakteri aşan yol
    let uzunKlasor = KLASOR;
    while (uzunKlasor.length < 280) uzunKlasor = path.join(uzunKlasor, 'uzun klasör adı ğüş');
    const onekli = (y) => '\\\\?\\' + y;
    fs.mkdirSync(onekli(uzunKlasor), { recursive: true });
    const uzunHedef = path.join(uzunKlasor, 'uzun yol (1).pdf');
    yol = kopya('kisa-yol.pdf');
    await ac(yol);
    await alanaYaz('AdSoyad', 0, 'Uzun yol');
    await yanitla('dosya:kaydetDiyalog', [uzunHedef]);
    await evalJs(`(window.__pdefe.komutCalistir('dosya.farkliKaydet'), true)`);
    await bekle(100);
    d = await kayitBitsin();
    await bekle(100);
    d = await durum();
    bilgi(`uzun yol: ${uzunHedef.length} karakter`);
    const yazildi = fs.existsSync(onekli(uzunHedef));
    sonuc('6) 260 karakteri aşan yol: Yazıldı ya da anlaşılır pencere, ham hata yok', yazildi ? kirliDegil(d) : !!d.kutu && !hamHataVar(d.kutu.ayrinti), { yazildi, d });
    if (yazildi) {
      fs.copyFileSync(onekli(uzunHedef), path.join(KLASOR, 'uzun-okunan.pdf'));
      sonuc('6) 260 karakteri aşan yol: Değer dosyada', olc(path.join(KLASOR, 'uzun-okunan.pdf')).degerler['form1/Baslik/AdSoyad'][0] === 'Uzun yol');
      await alanaYaz('AdSoyad', 0, 'Uzun yola ikinci kayıt');
      await kaydetKomutu();
      fs.copyFileSync(onekli(uzunHedef), path.join(KLASOR, 'uzun-okunan.pdf'));
      sonuc('6) 260 karakteri aşan yol: İkinci kayıt yerine kondu, geçici dosya yok', olc(path.join(KLASOR, 'uzun-okunan.pdf')).degerler['form1/Baslik/AdSoyad'][0] === 'Uzun yola ikinci kayıt' && fs.readdirSync(onekli(uzunKlasor)).length === 1, fs.readdirSync(onekli(uzunKlasor)));
      // Sekmeyi kapatıp uzun yoldan yeniden açma
      await kapatHepsini();
      await evalJs(`(async () => { window.__s50.acilis = null; try { const b = await window.__pdefe.dosyaAc(${J(uzunHedef)}); for (let i = 0; i < 100 && !document.querySelector('.gorunum:not([hidden]) .xfaLayer'); i++) await window.__s50.bekle(50); window.__s50.acilis = b ? 'tamam' : 'yok'; } catch (e) { window.__s50.acilis = e.message; } return true; })()`);
      const uzunAcilis = await evalJs(`({ a: window.__s50.acilis, xfa: !!window.__pdefe.aktif()?.gorunum?.xfa, kutu: document.querySelector('.mesaj-kutusu')?.textContent || '' })`);
      bilgi(`uzun yoldan açılış: ${J(uzunAcilis)}`);
      const uzunKutu = await durum();
      if (uzunKutu.kutu) { await kutuBas(uzunKutu.kutu.dugmeler.at(-1)); await bekle(100); }
      sonuc('6) 260 karakteri aşan yoldan açılış: Form açıldı ya da ham hata gösterilmedi', uzunAcilis.xfa || !hamHataVar(uzunAcilis.kutu), uzunAcilis);
    } else if (d.kutu) { await kutuBas('Vazgeç'); await kayitBitsin(); }
    await kapatHepsini();
    fs.rmSync(onekli(path.join(KLASOR, 'uzun klasör adı ğüş')), { recursive: true, force: true });   // Gezgin'in ve betiklerin silemediği uzun yol kalmasın
  }

  // ==================================================================================== 7) otomatik kayıt
  if (bolum(7)) {
    const yol = kopya('oto.pdf');
    await evalJs(`(async () => { window.__pdefe.ayar().otomatikKaydet = true; return true; })()`);   // yalnızca bellekte
    try {
      await ac(yol);
      const once = ozet(yol);
      const kilit = await kilitle(yol, 1);
      await alanaYaz('AdSoyad', 0, 'Otomatik');
      await tus('Tab');
      let d;
      for (const t0 = Date.now(); Date.now() - t0 < 12000; await bekle(100)) { d = await durum(); if (/otomatik kaydedilemedi/.test(d.mesaj)) break; }
      await goruntu('7-oto-kilitli');
      sonuc('7) Kilitli: Pencere yok, durum çubuğunda görünür, kaydedildi denmez', !d.kutu && /otomatik kaydedilemedi/.test(d.mesaj) && !/kaydedildi/i.test(d.mesaj) && d.degisti, d);
      sonuc('7) Kilitli: Bir kez bildirim, dosya aynı', /otomatik kaydedilemedi/.test(d.bildirim) && ozet(yol) === once && !hamHataVar(d.bildirim), d.bildirim);
      // Bildirim kapanır, yeni değişiklik yeni bildirim açmaz
      await evalJs(`(document.getElementById('bildirim').hidden = true, true)`);
      await alanaYaz('AdSoyad', 0, 'Otomatik iki');
      await tus('Tab');
      await bekle(2500);
      d = await durum();
      sonuc('7) Kilitli: Yeni değişiklik pencere ve yeni bildirim açmaz', !d.kutu && !d.bildirim && d.degisti, d);
      await kilit.birak();
      for (const t0 = Date.now(); Date.now() - t0 < 25000; await bekle(200)) { d = await durum(); if (!d.degisti) break; }
      sonuc('7) Kilit kalkınca kendiliğinden kaydetti', !d.degisti && !d.kutu && olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'Otomatik iki', d);
      // Alandan çıkmadan yazılan da
      await tiklaAd('Metin', 0);
      await yaz('Alandan çıkmadan yazılan uzun yazı');
      for (const t0 = Date.now(); Date.now() - t0 < 8000; await bekle(100)) { d = await durum(); if (!d.degisti) break; }
      const odak = await H(`document.activeElement?.tagName`);
      sonuc('7) Alandan çıkmadan yazılan otomatik kaydedildi, imleç alanda', !d.degisti && odak === 'TEXTAREA' && olc(yol).degerler['form1/Bolum/Metin'][0] === 'Alandan çıkmadan yazılan uzun yazı', { d, odak });
      await yaz(' devam');
      const v = await H(`document.activeElement?.value`);
      sonuc('7) Otomatik kayıttan sonra yazı sürüyor', v === 'Alandan çıkmadan yazılan uzun yazı devam', v);
      await bekle(2500);
      sonuc('7) Devamı da kaydedildi', olc(yol).degerler['form1/Bolum/Metin'][0] === 'Alandan çıkmadan yazılan uzun yazı devam');
    } finally { await evalJs(`(window.__pdefe.ayar().otomatikKaydet = false, true)`); }
    await kapatHepsini();
  }

  // ==================================================================================== 8) odaktaki alan
  if (bolum(8)) {
    let yol = kopya('odak1.pdf');
    await ac(yol);
    await tiklaAd('Metin', 0);
    await yaz('Odakta yazı');
    let d = await durum();
    sonuc('8) Yazarken: Kirli, Kaydet etkin, sekmede işaret', d.degisti && !d.kaydetSoluk, d);
    await kaydetKomutu();
    await bekle(60);
    d = await durum();
    sonuc('8) Kaydet komutu odaktaki yazıyı kaydetti, odak alanda, temiz', olc(yol).degerler['form1/Bolum/Metin'][0] === 'Odakta yazı' && kirliDegil(d) && d.odak === 'TEXTAREA', d);
    await yaz(' ikinci');
    d = await durum();
    sonuc('8) Kayıttan sonra yazınca yine kirli', d.degisti, d);
    await tus('Backspace'); for (let i = 1; i < 7; i++) await tus('Backspace');
    d = await durum();
    sonuc('8) Yazılan silinip eski hâline dönünce temiz', !d.degisti, d);
    // Formu Kaydet: Alan odaktayken düğmeye basılır
    yol = kopya('odak2.pdf');
    await ac(yol);
    await tiklaAd('AdSoyad', 0);
    await yaz('Düğmeyle');
    const hedef = path.join(KLASOR, 'odak2-hedef.pdf');
    await yanitla('dosya:kaydetDiyalog', [hedef]);
    await tiklaAd('Kaydet', 0);
    await kayitBitsin();
    await bekle(100);
    sonuc('8) Formu Kaydet odaktaki yazıyı kaydetti', olc(hedef).degerler['form1/Baslik/AdSoyad'][0] === 'Düğmeyle' && kirliDegil(await durum()));
    // Sekme kapatma: × gerçek fareyle
    yol = kopya('odak3.pdf');
    await ac(yol);
    await tiklaAd('AdSoyad', 0);
    await yaz('Sekme kapatılıyor');
    const x = await evalJs(`(() => { const s = [...document.querySelectorAll('#sekme-liste .sekme, #sekme-liste > *')].find((e) => e.textContent.includes('odak3')); const k = s?.querySelector('.kapat, button'); const r = k?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
    if (x) {
      await tikla(x.x, x.y);
      d = await kutuBekle();
      sonuc('8) Sekme × : Soru çıktı', /kaydedilmemiş/.test(d.kutu?.ileti), d.kutu);
      await kutuBas('Kaydet');
      for (const t0 = Date.now(); Date.now() - t0 < 6000; await bekle(50)) { if (!(await H(`[...window.__pdefe.belgeler.values()].some((b) => b.ad === 'odak3.pdf')`))) break; }
      sonuc('8) Sekme × : Kaydet yazıyı dosyaya yazdı, sekme kapandı', olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'Sekme kapatılıyor');
    } else sonuc('8) Sekme × bulunamadı', false);
    // İki form yan sekmede: Yazılan yalnız kendi sekmesini kirletir, sekme değiştirince uygulanır, kayıt yalnız kendi dosyasına
    const birinci = kopya('iki-sekme-1.pdf'), ikinci = kopya('iki-sekme-2.pdf');
    await ac(birinci);
    await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(ikinci)}); for (let i = 0; i < 100 && !window.__s50.b().gorunum.xfa; i++) await window.__s50.bekle(50); await window.__s50.bekle(400); b.gorunum.zoomModuAyarla('genislik'); await window.__s50.bekle(300); return true; })()`);
    await tiklaAd('AdSoyad', 0);
    await yaz('İkinci sekmede yazı');
    const ikiSekme = () => evalJs(`[...window.__pdefe.belgeler.values()].map((b) => [b.ad, !!b.degisti])`);
    let sekmeler = await ikiSekme();
    sonuc('8) İki sekme: Yazılan yalnız kendi sekmesini kirletir', J(sekmeler) === J([['iki-sekme-1.pdf', false], ['iki-sekme-2.pdf', true]]), sekmeler);
    const once1 = ozet(birinci);
    await kaydetKomutu();
    sonuc('8) İki sekme: Kayıt yalnız kendi dosyasına', ozet(birinci) === once1 && olc(ikinci).degerler['form1/Baslik/AdSoyad'][0] === 'İkinci sekmede yazı');
    await kapatHepsini();
  }

  // ==================================================================================== 9) öbür belgeler
  if (bolum(9)) {
    const adKopya = (ad) => { const y = path.join(KLASOR, ad); execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), y, '3', 'Deneme belge'], { stdio: 'ignore' }); return y; };
    // Not
    let yol = adKopya('not-kilit.pdf');
    await evalJs(`(async () => { delete window.__pdefeOtoYanit; const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); await p.dosyaAc(${J(yol)}); await window.__s50.bekle(500); return true; })()`);
    let kilit = await kilitle(yol, 1);
    let once = ozet(yol);
    await evalJs(`(() => { const n = window.__pdefe.aktif().notlar; const s = n.g.sayfalar[0].pdfSayfa.view; n.ekle({ tur: 'Highlight', sayfa: 1, rect: [60, s[3] - 120, 300, s[3] - 100], quadKutular: [[60, s[3] - 120, 300, s[3] - 100]], quads: null, icerik: '', yazar: 'Test', renk: '#ffd100', opaklik: 0.4, konu: 'Vurgu' }); return 1; })()`);
    await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
    let d = await kutuBekle(20000);
    await goruntu('9-not-kilitli');
    sonuc('9) Not: Kilitliyken aynı pencere, ham hata yok, dosya aynı', d.kutu?.ileti === 'Belge kaydedilemedi' && J(d.kutu.dugmeler) === J(['Yeniden dene', 'Farklı kaydet', 'Vazgeç']) && !hamHataVar(d.kutu.ayrinti) && /değişiklikler PDEfe'de duruyor/.test(d.kutu.ayrinti) && ozet(yol) === once, d.kutu);
    await kilit.birak();
    await kutuBas('Yeniden dene');
    await kayitBitsin();
    await bekle(100);
    d = await durum();
    sonuc('9) Not: Yeniden dene kaydetti', !d.kutu && !d.degisti && ozet(yol) !== once, d);
    // Form alanı
    execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'form_alanlari_pdf_uret.py'), UI], { stdio: 'ignore' });
    yol = path.join(KLASOR, 'form-kilit.pdf');
    fs.copyFileSync(path.join(UI, 'alanlar.pdf'), yol);
    await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); await p.dosyaAc(${J(yol)}); await window.__s50.bekle(700); return true; })()`);
    const alan = await evalJs(`(() => { const el = [...document.querySelectorAll('.gorunum:not([hidden]) input[type=text], .gorunum:not([hidden]) textarea')].find((x) => x.getClientRects().length); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (alan) {
      kilit = await kilitle(yol, 1);
      once = ozet(yol);
      await tikla(alan.x, alan.y); await yaz('Kilitli form alanı'); await tus('Tab');
      await bekle(150);
      await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
      d = await kutuBekle(20000);
      sonuc('9) Form alanı: Kilitliyken aynı pencere, dosya aynı', d.kutu?.ileti === 'Belge kaydedilemedi' && d.kutu.dugmeler[0] === 'Yeniden dene' && !hamHataVar(d.kutu.ayrinti) && ozet(yol) === once, d.kutu);
      await kilit.birak();
      await kutuBas('Yeniden dene');
      await kayitBitsin();
      await bekle(100);
      d = await durum();
      sonuc('9) Form alanı: Yeniden dene kaydetti', !d.kutu && !d.degisti && ozet(yol) !== once, d);
    } else sonuc('9) Form alanı bulunamadı', false);
    // Sayfa düzeni (yapısal kayıt)
    yol = adKopya('yapisal-kilit.pdf');
    await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); await p.dosyaAc(${J(yol)}); await window.__s50.bekle(500); return true; })()`);
    kilit = await kilitle(yol, 1);
    once = ozet(yol);
    await evalJs(`(async () => { const b = window.__pdefe.aktif(), g = b.gorunum; const t = g.tarif().slice(1); await window.__pdefe.sayfaTarifiUygula(b, t, 'Sayfa sil'); await window.__s50.bekle(300); return true; })()`).catch((e) => bilgi('tarif: ' + e.message));
    d = await durum();
    if (d.degisti) {
      await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
      d = await kutuBekle(20000);
      sonuc('9) Sayfa düzeni: Kilitliyken aynı pencere, ham hata yok, dosya aynı', d.kutu?.ileti === 'Belge kaydedilemedi' && d.kutu.dugmeler[0] === 'Yeniden dene' && !hamHataVar(d.kutu.ayrinti) && ozet(yol) === once, d.kutu);
      await kilit.birak();
      await kutuBas('Yeniden dene');
      await kayitBitsin();
      await bekle(100);
      d = await durum();
      sonuc('9) Sayfa düzeni: Yeniden dene kaydetti', !d.kutu && !d.degisti && ozet(yol) !== once, d);
    } else { await kilit.birak(); bilgi('sayfa düzeni değiştirilemedi, atlandı'); }
    await kapatHepsini();
    sonuc('9) Konsolda hata yok', !(await hatalar()).length);
  }

  // ==================================================================================== 10) PDEfe'nin kendi kilidi
  if (bolum(10)) {
    const yol = kopya('kendi-kilit.pdf');
    await ac(yol);
    const kim = (y) => kilitSahipleri(y).map((s) => s.ad);
    sonuc('10) Form açıkken dosya kilitli değil', !kim(yol).length, kim(yol));
    await alanaYaz('AdSoyad', 0, 'Kilit yok');
    sonuc('10) Yazarken kilit yok', !kim(yol).length, kim(yol));
    await tiklaAd('MEkle', 0); await durgun();
    sonuc('10) Ekle sonrası kilit yok', !kim(yol).length, kim(yol));
    await evalJs(`(async () => { await window.__s50.b().xfa.duzPdf(); return true; })()`);
    sonuc('10) Düz PDF sonrası kilit yok', !kim(yol).length, kim(yol));
    await evalJs(`(async () => { window.__pdefe.panel.acKapa(true); await window.__s50.bekle(1200); return true; })()`).catch(() => {});
    sonuc('10) Panel açıkken kilit yok', !kim(yol).length, kim(yol));
    // Başka bir program dosyayı yazmaya açabiliyor
    const fd = fs.openSync(yol, 'r+'); fs.closeSync(fd);
    fs.renameSync(yol, yol + '.ad'); fs.renameSync(yol + '.ad', yol);
    sonuc('10) Dosya başka programdan yeniden adlandırılabiliyor', true);
    for (let i = 0; i < 5; i++) { await alanaYaz('AdSoyad', 0, 'Kilit yok ' + i); const d = await kaydetKomutu(); if (d.kutu) { sonuc('10) Üst üste kayıt', false, d); break; } }
    sonuc('10) Beş kayıt, kilit yok, değer dosyada', !kim(yol).length && olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'Kilit yok 4', kim(yol));
    const yeni10 = path.join(KLASOR, 'kendi-kilit-yeni.pdf');
    await alanaYaz('AdSoyad', 0, 'Yeni dosya');
    await yanitla('dosya:kaydetDiyalog', [yeni10]);
    await evalJs(`(window.__pdefe.komutCalistir('dosya.farkliKaydet'), true)`);
    await bekle(100);
    await kayitBitsin();
    await bekle(300);
    sonuc('10) Farklı kaydet sonrası yeni dosyada ve eskisinde kilit yok', !kim(yeni10).length && !kim(yol).length, [kim(yeni10), kim(yol)]);
    await kapatHepsini();
  }

  // ==================================================================================== 11) denetim karakterleri
  if (bolum(11)) {
    const yol = kopya('denetim.pdf');
    await ac(yol);
    await tiklaAd('Metin', 0);
    await yaz('Birinci sayfa\fİkinci sayfa\vDikey\u0001Kontrol\u001fSon');
    await tus('Tab');
    await tiklaAd('MEkle', 0); await durgun();
    let d = await durum();
    sonuc('11) Yapıştırılan denetim karakterleriyle Ekle çalıştı', !d.kutu && d.sayfa >= 2 && !/yapılamadı|dizilemedi/.test(d.bildirim), d);
    d = await kaydetKomutu();
    const o = olc(yol);
    sonuc('11) Dosyanın XML\'i geçerli, yazı duruyor, denetim karakteri yok', !o.onarildi && /Birinci sayfa\s+İkinci sayfa\s+Dikey Kontrol Son/.test(o.degerler['form1/Bolum/Metin'][0]) && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(o.degerler['form1/Bolum/Metin'][0]), o.degerler['form1/Bolum/Metin']);
    await kapatHepsini();
  }

  // ==================================================================================== 12) veriye yazılamayan değer
  if (bolum(12)) {
    const yol = kopya('eksik.pdf');
    await ac(yol);
    await alanaYaz('AdSoyad', 0, 'Bağlı alan');
    await evalJs(`(() => { const x = window.__s50.b().xfa, a = x._beklenenDegerler.bind(x); x._beklenenDegerler = () => [...a(), 'Veri düğümü olmayan alanın yazısı']; return true; })()`);
    await evalJs(`(window.__pdefe.komutCalistir('dosya.kaydet'), true)`);
    const d = await kutuBekle();
    await goruntu('12-eksik');
    sonuc('12) Yazılamayan alan: Uyarı', /1 alanın yazısı dosyaya yazılamadı/.test(d.kutu?.ileti), d.kutu);
    await kutuBas('Tamam');
    await kayitBitsin();
    const s = await durum();
    sonuc('12) Belge kirli kalır, öbür alan dosyada', s.degisti && olc(yol).degerler['form1/Baslik/AdSoyad'][0] === 'Bağlı alan', s);
    const k = await evalJs(`(async () => { const o = { secim: 2 }; window.__pdefeOtoYanit = o; const b = window.__s50.b(); await window.__pdefe.belgeKapat(b.id); delete window.__pdefeOtoYanit; return o.son?.ayrinti; })()`);
    sonuc('12) Kapatma sorusu söylüyor', /Son kayıt yapılamadı/.test(k), k);
    await kapatHepsini();
  }

  const h = await hatalar();
  sonuc('Konsolda yakalanmamış hata yok', !h.length, h);
  son();
}
