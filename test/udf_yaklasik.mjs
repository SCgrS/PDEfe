// UYAP Doküman Editörü (UDE) yokken UDF'nin yaklaşık çizimi (0.2.6; src/main/udfYaklasik.js, src/udf-cizim, araclar/donustur.js).
//   1) Kanal: UDF → PDF gizli pencerede çizilir; sayfa boyu ve kenarlar UDF'nin pageFormat'ından (A4, yatay, sol ve sağ kenarı farklı; yatay
//      sayfada kenarlar UYAP Doküman Editörü'ndeki gibi döndürülür), alt bilgideki sayfa numarası, UYAP erişim satırı (webID) her sayfanın
//      altında, metin, yazı tipleri gömülü, PDF'in başlığı dosyanın adı; UDF → TIFF (yaklaşık PDF çekirdeğe); motorun notları uyarıda
//      (yorumlar, kesilen kısım); geçici dosya kalmaz.
//   2) Kötü niyetli ya da bozuk belge (40 MB üstü, zip bombası, beyanı büyük paket, 1500 öğe, iki içerik, dış varlık, milyar gülüş, parolalı,
//      UDF olmayan, boş): her biri kendi hatasıyla döner, çıktı yazılmaz; ana süreç ve arayüz çökmez, hiçbir iletişim kutusu açılmaz, gizli
//      çizim sayfası kalmaz. "]]>" ve betik / HTML benzeri yazı yazı olarak çizilir, betik çalışmaz.
//   3) İptal: dönüştürme sürerken udf:yaklasikIptal; hiçbir dosya ve geçici dosya kalmaz.
//   4) Küçük resim kanalı (udf:yaklasikBilgi): PNG ve sayfa sayısı.
//   5) Araç: UDF satırında hedefler seçilebilir, "görünüm yaklaşık" uyarısı ve "UYAP Doküman Editörü'nün yerini göster" bağlantısı, küçük
//      resim yaklaşık çizimden; tek UDF → PDF sekmede açılır, bildirimde uyarı; birden çok dosyada UDF → TIFF ve UDF → PDF, açılamayan belge
//      hatasıyla, sonuç listesinde uyarı; editör bulunduğu hâlde çekirdek "desteklenmiyor" derse yaklaşık çizimle yeniden denenir; İptal.
//      Ayarlar › Kaydetme › UYAP Doküman Editörü: durumun son satırı yaklaşık çizimi söyler.
// UDE kurulu bilgisayarda "UDE yok" benzetimi: çekirdeğe PDEFE_UDE_YOK=1 (geliştirme sürümü, core/islemler/udf.py ude_bul). Girdiler
// test/udf_yaklasik_uret.py ile test/cikti/udf_yaklasik/girdi altında üretilir (gerçek belge yok); çıktılar test/cikti/udf_yaklasik/cikti.
// Kullanım (PowerShell; görünmeyen masaüstü: iletişim kutusu açılsa bile kişinin ekranına çıkmaz, sayılır):
//   $env:PDEFE_UDE_YOK="1"; powershell -ExecutionPolicy Bypass -File test\baslat_gizli.ps1 -Port 9481 -Veri "$env:TEMP\pdefe-uy-9481" -Boyut "1280,1000"
//   $env:PDEFE_CDP_PORT=9481; $env:UY_MASAUSTU="PDEfeTest9481"; node test\surucu.mjs betik test\udf_yaklasik.mjs
//   powershell -ExecutionPolicy Bypass -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,5". Ekran görüntüleri test/cikti/udf_yaklasik/png altına.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 'udf_yaklasik');
const GIRDI = path.join(UI, 'girdi');
const CIKTI = path.join(UI, 'cikti');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const PORT = process.env.PDEFE_CDP_PORT || '9222';
const MASAUSTU = process.env.UY_MASAUSTU || '';
const J = (x) => JSON.stringify(x);
const UYARI = 'UYAP Doküman Editörü bulunamadı; görünüm yaklaşık (satır ve sayfa kırılımları editördekinden farklı olabilir).';

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

function py(kod) {
  const on = 'import sys, json, os\nimport pymupdf\nfrom PIL import Image\n';
  const cikti = execFileSync(PY, ['-X', 'utf8', '-c', on + kod], { encoding: 'utf8' });
  return JSON.parse(cikti.trim().split(/\r?\n/).pop());
}
const pdfOzeti = (yol) => py(`d = pymupdf.open(${J(yol)}, filetype="pdf")
xs = [sp["bbox"][0] for b in d[0].get_text("dict")["blocks"] for l in b.get("lines", []) for sp in l["spans"] if sp["text"].strip()]
fontlar = [f for p in d for f in p.get_fonts(full=True)]
print(json.dumps({"sayfa": d.page_count, "olcu": [[round(p.rect.width, 1), round(p.rect.height, 1)] for p in d], "metin": [p.get_text() for p in d],
  "solX": round(min(xs), 1) if xs else None, "font": len(fontlar), "gomulu": sum(1 for f in fontlar if f[1] not in ("n/a", "")), "baslik": d.metadata.get("title")}, ensure_ascii=False))`);
const tiffOzeti = (yol) => py(`im = Image.open(${J(yol)})\nprint(json.dumps({"sayfa": im.n_frames, "dpi": [round(float(x)) for x in im.info.get("dpi", (0, 0))], "kip": im.mode}))`);
const A4 = (o) => Math.abs(o[0] - 595.3) <= 1.5 && Math.abs(o[1] - 841.9) <= 1.5;
const A4Yatay = (o) => Math.abs(o[0] - 841.9) <= 1.5 && Math.abs(o[1] - 595.3) <= 1.5;

/** Bu örneğin açtığı iletişim kutuları (test/hata_kutusu_say.ps1; görünmeyen masaüstünde UY_MASAUSTU ile). */
function kutular() {
  const arg = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'hata_kutusu_say.ps1')];
  if (MASAUSTU) arg.push('-Masaustu', MASAUSTU);
  try { return JSON.parse(execFileSync('powershell.exe', arg, { encoding: 'utf8' }).trim().split(/\r?\n/).pop()); } catch (e) { return { sayi: -1, hata: String(e.message || e) }; }
}
/** Ana süreç (CDP portuyla başlatılan electron.exe) yaşıyor mu. */
function anaSurecYasiyor() {
  const k = `(Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='PDEfe.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${PORT}*' -and $_.CommandLine -notlike '*--type=*' } | Measure-Object).Count`;
  try { return Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', k], { encoding: 'utf8' }).trim()) > 0; } catch { return false; }
}
/** CDP'de açık sayfalar (gizli çizim sayfası pdefe://udf-cizim/ iş bitince kalmamalı). */
async function sayfalar() { try { return (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).map((h) => h.url); } catch { return []; } }
const geciciler = () => {
  const k = path.join(process.env.TEMP || '', 'PDEfe');
  const t = fs.existsSync(k) ? fs.readdirSync(k).filter((a) => /^udf-yaklasik-/.test(a)) : [];
  return [...t, ...(fs.existsSync(CIKTI) ? fs.readdirSync(CIKTI).filter((a) => /pdefe-tmp/i.test(a)) : [])];
};

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => { await bekle(250); try { await ekranGoruntusu(path.join(PNG, ad + '.png')); } catch { /* görünmeyen masaüstünde alınamayabilir */ } };
  const cagir = (kanal, p) => evalJs(`window.pdefe.cagir(${J(kanal)}, ${J(p)}).then((r) => ({ r }), (e) => ({ e: String(e?.message || e) }))`);
  const bildirimler = () => evalJs(`window.__uyb.splice(0)`);
  const tikSecici = async (secici) => {
    const r = await evalJs(`(() => { const e = ${secici.startsWith('[') || secici.startsWith('document') ? secici : `document.querySelector(${J(secici)})`}; if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) return false;
    await tikla(r.x, r.y);
    await bekle(250);
    return true;
  };
  const A = 'window.__uy.m.acikDonusturPenceresi()';
  const pencereKapat = async () => {
    await evalJs(`(async () => { window.__pdefeOtoYanit = { secim: 0 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); }
      finally { delete window.__pdefeOtoYanit; } return true; })()`);
    return kosul(`!document.querySelector('.arac-ortusu')`, 5000);
  };
  const sekmeleriKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return window.__pdefe.belgeler.size; })()`);
  const aracAc = async (yollar = [], sure = 20000) => {
    await evalJs(`window.__pdefe.komutCalistir('arac.donustur', ${J(yollar)})`);
    await kosul(`!!document.querySelector('.donustur-pencere')`, 5000);
    await kosul(`!document.querySelector('.donustur-oge.yukleniyor')`, sure);
    await bekle(300);
  };
  const satirlar = () => evalJs(`[...document.querySelectorAll('.donustur-pencere .donustur-oge')].map((e) => ({
    ad: e.querySelector('.ad').textContent, tur: e.dataset.tur, ozet: e.querySelector('.ozet').textContent,
    hedefler: [...e.querySelectorAll('.donustur-hedef-secim > button')].map((b) => ({ id: b.dataset.id, secili: b.classList.contains('secili'), devre: b.disabled, ipucu: b.title })),
    neden: e.querySelector('.neden').hidden ? '' : (e.querySelector('.neden .metin')?.textContent || ''), nedenYaklasik: e.querySelector('.neden').classList.contains('yaklasik'),
    bag: e.querySelector('.neden:not([hidden]) [data-komut="ude"]')?.textContent || '',
    uyari: e.querySelector('.uyari').hidden ? '' : e.querySelector('.uyari').textContent, hata: e.querySelector('.hata').hidden ? '' : e.querySelector('.hata').textContent,
    resim: e.querySelector('.resim img') ? 'img' : (e.querySelector('.resim .yer')?.textContent || '') }))`);
  const hedefTikla = (ad, bicim) => tikSecici(`[...document.querySelectorAll('.donustur-oge')].find((e) => e.querySelector('.ad').textContent === ${J(ad)}).querySelector('.donustur-hedef-secim > button[data-id="${bicim}"]')`);
  const donusturVeBekle = async (sure = 90000) => {
    await tikSecici('.donustur-pencere .arac-dugmeler .birincil');
    await kosul(`!document.querySelector('.donustur-pencere') || !document.querySelector('.donustur-sonuc')?.hidden || !!document.querySelector('.donustur-pencere .arac-hata:not(:empty)')`, sure);
    await bekle(500);
  };
  const ciktilar = () => (fs.existsSync(CIKTI) ? fs.readdirSync(CIKTI).sort() : []);
  const bolumler = (process.env.BOLUM || '1,2,3,4,5').split(',').map((s) => s.trim());
  const bolum = (n) => bolumler.includes(String(n));

  // ------------------------------------------------------------ hazırlık
  await pencereKapat();
  await sekmeleriKapat();
  fs.mkdirSync(PNG, { recursive: true });
  fs.rmSync(CIKTI, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); fs.mkdirSync(CIKTI, { recursive: true });
  const G = JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'udf_yaklasik_uret.py'), GIRDI], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  await evalJs(`(async () => {
    window.__uy = { m: await import('pdefe://app/src/renderer/araclar/donustur.js') };
    window.__uyb = [];
    if (!window.__uyGozlem) {
      window.__uyGozlem = new MutationObserver(() => { const t = document.querySelector('#bildirim')?.textContent; if (t && window.__uyb.at(-1) !== t) window.__uyb.push(t); });
      window.__uyGozlem.observe(document.querySelector('#bildirim'), { childList: true, characterData: true, subtree: true });
      window.__uyHatalar = [];
      addEventListener('error', (e) => window.__uyHatalar.push('error: ' + e.message));
      addEventListener('unhandledrejection', (e) => window.__uyHatalar.push('reject: ' + (e.reason?.message || e.reason)));
    }
    for (const [k, v] of Object.entries({ ciktiKlasoru: ${J(CIKTI)}, otomatikKaydet: false, donusturme: {} })) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; }
    await window.pdefe.cagir('ayar:koy', 'udeYolu', null); window.__pdefe.ayar().udeYolu = null;
    window.__pdefeYerelKutu = true;
    return true;
  })()`);
  const YET = await evalJs(`window.pdefe.cagir('cekirdek:cagir', 'donusum_yetenekleri', {}, null)`);
  if (YET?.udf?.var !== false) {
    sonuc('Ön koşul: UYAP Doküman Editörü bulunamıyor (PDEFE_UDE_YOK=1 ile başlatın)', false, YET?.udf);
    console.log(`\n${denetim - hataSayisi}/${denetim} denetim geçti.`);
    process.exitCode = 1;
    return;
  }
  const TIFF_VAR = !!YET?.donusumler?.['pdf>tiff']?.var, WORD_VAR = !!YET?.donusumler?.['pdf>word']?.var;
  console.log(`     UYAP Doküman Editörü: yok (${YET.udf.neden}); PDF → TIFF: ${TIFF_VAR ? 'var' : 'yok'}; PDF → Word: ${WORD_VAR ? 'var' : 'yok'}; kutu: ${J(kutular())}`);

  // ------------------------------------------------------------ 1) Kanal: olağan belgeler
  if (bolum(1)) {
    console.log('\n== 1) UDF → PDF / TIFF (kanal)');
    const adlar = ['kenar_farkli', 'yatay', 'tablolu', 'duz_xml', 'uzun', 'ozel_metin', 'yorumlu', 'ic_ice_tablo', 'saydam_antet', 'yatay_kenar', 'erisimli'];
    const ogeler = adlar.map((a) => ({ yol: path.join(GIRDI, a + '.udf'), hedef: path.join(CIKTI, a + '.pdf'), hedefBicim: 'pdf' }));
    if (TIFF_VAR) ogeler.push({ yol: G.kenar, hedef: path.join(CIKTI, 'kenar_farkli.tif'), hedefBicim: 'tiff', secenekler: { dpi: 200, renk: 'sb' } });
    const t0 = Date.now();
    const r = await cagir('udf:yaklasikDonustur', { ogeler, istekId: 101 });
    const sure = Date.now() - t0;
    const S = Object.fromEntries((r.r?.sonuclar || []).map((s) => [path.basename(s.hedef), s]));
    sonuc(`Bütün öğeler dönüştürüldü (${ogeler.length} öğe, ${sure} ms), sonuçlarda yaklasik: true ve kaynakTur udf`, r.r?.basarili === ogeler.length
      && Object.values(S).every((s) => s.yaklasik === true && s.kaynakTur === 'udf' && s.boyut > 1000), r.e || r.r);
    const k = pdfOzeti(path.join(CIKTI, 'kenar_farkli.pdf'));
    sonuc('Sol ve sağ kenarı farklı belge: A4, 2 sayfa, yazı sol kenardan (85 pt) başlıyor, başlık metinde', k.sayfa === 2 && k.olcu.every(A4) && k.solX >= 83 && k.solX <= 88
      && /SOL VE SAĞ KENARI FARKLI BELGE/.test(k.metin[0]), { sayfa: k.sayfa, olcu: k.olcu, solX: k.solX });
    sonuc('Alt bilgideki sayfa numarası her sayfada ("1/2", "2/2")', /(^|\n)1\/2(\n|$)/.test(k.metin[0]) && /(^|\n)2\/2(\n|$)/.test(k.metin[1]), k.metin.map((m) => m.slice(0, 40)));
    sonuc('Yazı tiplerinin hepsi gömülü; PDF\'in başlığı dosyanın adı', k.font > 0 && k.gomulu === k.font && k.baslik === 'kenar_farkli', { font: k.font, gomulu: k.gomulu, baslik: k.baslik });
    const y = pdfOzeti(path.join(CIKTI, 'yatay.pdf'));
    sonuc('Yatay sayfa: 842 × 595', y.olcu.length >= 1 && y.olcu.every(A4Yatay), y.olcu);
    const yk = py(`d = pymupdf.open(${J(path.join(CIKTI, 'yatay_kenar.pdf'))}, filetype="pdf")
bb = [l["bbox"] for b in d[0].get_text("dict")["blocks"] for l in b.get("lines", [])]
print(json.dumps({"olcu": [round(d[0].rect.width, 1), round(d[0].rect.height, 1)], "sol": round(min(x[0] for x in bb), 1), "ust": round(min(x[1] for x in bb), 1)}))`);
    sonuc('Dört kenarı farklı yatay sayfa: kenarlar UYAP Doküman Editörü\'ndeki gibi döndürülür (sol = kâğıdın alt kenarı 28 pt, üst = sol kenarı 85 pt)',
      A4Yatay(yk.olcu) && Math.abs(yk.sol - 28.35) <= 3 && Math.abs(yk.ust - 85.04) <= 3, yk);
    const ERISIM = 'UYAP Bilişim Sistemindeki bu dokümana http://vatandas.uyap.gov.tr adresinden AbC1dEf - gHiJkLm - NoP2qRs - TuVwXy= ile erişebilirsiniz.';
    const er = py(`d = pymupdf.open(${J(path.join(CIKTI, 'erisimli.pdf'))}, filetype="pdf")
out = []
for p in d:
    sat = [(l["bbox"][1], " ".join("".join(s["text"] for s in l["spans"]).split())) for b in p.get_text("dict")["blocks"] for l in b.get("lines", [])]
    out.append([[round(y, 1), t] for y, t in sat if "vatandas.uyap.gov.tr" in t])
print(json.dumps({"sayfa": d.page_count, "satirlar": out}, ensure_ascii=False))`);
    sonuc('UYAP erişim kimliği (webID): her sayfanın en altında erişim satırı (sayfa numarasıyla birlikte)', er.sayfa >= 2 && er.satirlar.every((s) => s.length === 1 && s[0][1] === ERISIM && s[0][0] > 820)
      && /(^|\n)1\/\d+(\n|$)/.test(pdfOzeti(path.join(CIKTI, 'erisimli.pdf')).metin[0]), er);
    const u = pdfOzeti(path.join(CIKTI, 'uzun.pdf'));
    sonuc('Uzun belge kâğıda göre sayfalara bölünür (birden çok sayfa, son paragraf metinde)', u.sayfa >= 2 && S['uzun.pdf']?.sayfa === u.sayfa && /Paragraf 110:/.test(u.metin.join('\n')), { sayfa: u.sayfa, sonucSayfa: S['uzun.pdf']?.sayfa });
    const x = pdfOzeti(path.join(CIKTI, 'duz_xml.pdf'));
    sonuc('Düz XML (zip\'siz) UDF çizilir', x.sayfa === 1 && /Deneme belgesinin paragrafı/.test(x.metin[0]), x.metin[0]?.slice(0, 80));
    const o = pdfOzeti(path.join(CIKTI, 'ozel_metin.pdf'));
    sonuc('"]]>" ve betik / HTML benzeri yazı yazı olarak çizilir; betik çalışmaz (PDF\'in başlığı değişmedi)', /CDATA sonu \]\]> geçiyor; sonrası da okunmalı\./.test(o.metin[0])
      && o.metin[0].includes('<script>document.title') && o.metin[0].includes('onerror="alert(1)"') && o.metin[0].includes('&amp;') && o.baslik === 'ozel_metin', o);
    sonuc('Yorumlu belgede uyarı: yorumlar PDF\'e alınmadı', /yorumlar \(açıklama notları\) PDF'e alınmadı/.test(S['yorumlu.pdf']?.uyari || ''), S['yorumlu.pdf']);
    sonuc('100 kat iç içe tablo: çizilir, uyarıda "bir kısmı çizilemedi"', S['ic_ice_tablo.pdf'] && !S['ic_ice_tablo.pdf'].hata && /bir kısmı çizilemedi/.test(S['ic_ice_tablo.pdf'].uyari || ''), S['ic_ice_tablo.pdf']);
    const t = pdfOzeti(path.join(CIKTI, 'tablolu.pdf'));
    sonuc('Tablolu belge: hücre metinleri', /Hücre 1-1 deneme/.test(t.metin[0]) && /Hücre 3-3 deneme/.test(t.metin[0]), t.metin[0]?.slice(0, 120));
    if (TIFF_VAR) {
      const ti = tiffOzeti(path.join(CIKTI, 'kenar_farkli.tif'));
      sonuc('UDF → TIFF (yaklaşık PDF çekirdeğe): 2 sayfa, 200 dpi, siyah beyaz', ti.sayfa === 2 && J(ti.dpi) === J([200, 200]) && ti.kip === '1' && S['kenar_farkli.tif']?.sayfa === 2, { ti, s: S['kenar_farkli.tif'] });
    }
    sonuc('Geçici dosya kalmadı (%TEMP%\\PDEfe\\udf-yaklasik-*, hedef klasöründe *.pdefe-tmp.pdf)', !geciciler().length, geciciler());
    sonuc('Gizli çizim sayfası kalmadı', !(await sayfalar()).some((u2) => /udf-cizim/.test(u2)), await sayfalar());
  }

  // ------------------------------------------------------------ 2) Kötü niyetli ya da bozuk belgeler
  if (bolum(2)) {
    console.log('\n== 2) Kötü niyetli ya da bozuk belgeler');
    const beklenen = {
      cok_buyuk: 'buyuk', bomba: 'buyuk', beyanli: 'buyuk', cok_ogeli: 'guvensiz', iki_icerik: 'guvensiz', dis_varlik: 'guvensiz', milyar: 'guvensiz',
      parolali: 'parolali', udf_degil: 'bozuk', bos: 'bozuk',
    };
    const anahtarlar = Object.keys(beklenen);
    const ogeler = anahtarlar.map((a) => ({ yol: G[a], hedef: path.join(CIKTI, 'kotu-' + a + '.pdf'), hedefBicim: 'pdf' }));
    const t0 = Date.now();
    const r = await cagir('udf:yaklasikDonustur', { ogeler, istekId: 201 });
    const rs = r.r?.sonuclar || [];
    sonuc(`İstek tamamlandı (${Date.now() - t0} ms), hepsi hatalı, hiçbiri yazılmadı`, r.r?.hatali === ogeler.length && !ciktilar().some((a) => a.startsWith('kotu-')), r.e || rs);
    anahtarlar.forEach((a, i) => sonuc(`  ${path.basename(G[a])}: kod "${beklenen[a]}" (${rs[i]?.hata || '-'})`, rs[i]?.kod === beklenen[a] && !!rs[i]?.hata, rs[i]));
    // Aynı belgeler TIFF hedefiyle (zincir yolu) ve küçük resim kanalıyla
    if (TIFF_VAR) {
      const r2 = await cagir('udf:yaklasikDonustur', { ogeler: [{ yol: G.bomba, hedef: path.join(CIKTI, 'kotu-bomba.tif'), hedefBicim: 'tiff' }, { yol: G.dis_varlik, hedef: path.join(CIKTI, 'kotu-dis.tif'), hedefBicim: 'tiff' }], istekId: 202 });
      sonuc('TIFF hedefinde de hata ve çıktı yok', r2.r?.hatali === 2 && !ciktilar().some((a) => a.startsWith('kotu-')), r2.e || r2.r);
    }
    const b1 = await cagir('udf:yaklasikBilgi', { yol: G.milyar, genislik: 160 });
    const b2 = await cagir('udf:yaklasikBilgi', { yol: G.bomba, genislik: 160 });
    sonuc('Küçük resim kanalı kötü belgede anlaşılır hatayla reddeder', /güvenlik nedeniyle/.test(b1.e || '') && /sınırından büyük/.test(b2.e || ''), { b1, b2 });
    const kanal = await cagir('udf:yaklasikDonustur', { ogeler: [{ yol: G.kenar, hedef: path.join(CIKTI, 'x.bat'), hedefBicim: 'pdf' }] });
    sonuc('Kanal .bat hedefini reddeder', !!kanal.e && !fs.existsSync(path.join(CIKTI, 'x.bat')), kanal);
    const yasiyor = anaSurecYasiyor(), arayuz = await evalJs('1 + 1'), k = kutular();
    sonuc('Ana süreç ve arayüz çökmedi; hiçbir iletişim kutusu açılmadı', yasiyor && arayuz === 2 && k.sayi === 0, { yasiyor, arayuz, k });
    sonuc('Gizli çizim sayfası ve geçici dosya kalmadı', !(await sayfalar()).some((u2) => /udf-cizim/.test(u2)) && !geciciler().length, { sayfalar: await sayfalar(), gecici: geciciler() });
  }

  // ------------------------------------------------------------ 3) İptal
  if (bolum(3)) {
    console.log('\n== 3) İptal');
    // Çizim sürerken hedef klasörde geçici dosya durmaz (0.2.6 incelemesi: çizim hedefin yanına yapılıyordu, çökmede kalıyordu): geçici PDF
    // %TEMP%\PDEfe'de, hedefin yanına yalnızca yerine koyarken kopyalanır
    const cizimOgeleri = Array.from({ length: 3 }, (_, i) => ({ yol: G.uzun, hedef: path.join(CIKTI, `sirada-${i + 1}.pdf`), hedefBicim: 'pdf' }));
    await evalJs(`(() => { window.__uyFaz = ''; window.__uyFazDinle ||= window.pdefe.dinle('udf:yaklasikIlerleme', (id, p) => { if (id === 302) window.__uyFaz = p?.mesaj || ''; });
      window.__uyCizim = window.pdefe.cagir('udf:yaklasikDonustur', { ogeler: ${J(cizimOgeleri)}, istekId: 302 }).then((r) => (window.__uyCizimSonuc = r), (e) => (window.__uyCizimSonuc = { e: String(e?.message || e) }));
      window.__uyCizimSonuc = null; return true; })()`);
    let cizerkenGecici = 0, yoklama = 0;
    for (let t0 = Date.now(); Date.now() - t0 < 120000; yoklama++) {
      const durum = await evalJs(`({ bitti: !!window.__uyCizimSonuc, faz: window.__uyFaz })`);
      if (durum.bitti) break;
      if (!/Kaydediliyor/.test(durum.faz) && fs.readdirSync(CIKTI).some((a) => /^sirada-.*pdefe-tmp/i.test(a))) cizerkenGecici++;
      await bekle(40);
    }
    const cizimSonuc = await evalJs('window.__uyCizimSonuc');
    sonuc('Çizim sürerken hedef klasörde geçici dosya yok; üç PDF yazıldı, geçici dosya kalmadı', cizerkenGecici === 0 && yoklama > 3 && cizimSonuc?.basarili === 3
      && cizimOgeleri.every((o) => fs.existsSync(o.hedef)) && !geciciler().length, { cizerkenGecici, yoklama, basarili: cizimSonuc?.basarili, e: cizimSonuc?.e, gecici: geciciler() });
    for (const o of cizimOgeleri) fs.rmSync(o.hedef, { force: true });
    const ogeler = Array.from({ length: 12 }, (_, i) => ({ yol: G.uzun, hedef: path.join(CIKTI, `iptal-${i + 1}.pdf`), hedefBicim: 'pdf' }));
    const r = await evalJs(`(async () => { const s = window.pdefe.cagir('udf:yaklasikDonustur', { ogeler: ${J(ogeler)}, istekId: 301 });
      await new Promise((c) => setTimeout(c, 250)); const ip = await window.pdefe.cagir('udf:yaklasikIptal', { istekId: 301 }); return { ip, r: await s }; })()`);
    await bekle(500);
    sonuc('Süren dönüştürme iptal edilir: { iptal: true }, hiçbir dosya ve geçici dosya kalmaz', r.ip === true && r.r?.iptal === true && !ciktilar().some((a) => a.startsWith('iptal-')) && !geciciler().length,
      { r, dosyalar: ciktilar().filter((a) => a.startsWith('iptal-')), gecici: geciciler() });
    sonuc('Bilinmeyen istek kimliğinin iptali false', (await cagir('udf:yaklasikIptal', { istekId: 999 })).r === false);
  }

  // ------------------------------------------------------------ 4) Küçük resim kanalı
  if (bolum(4)) {
    console.log('\n== 4) Küçük resim (udf:yaklasikBilgi)');
    const b = await cagir('udf:yaklasikBilgi', { yol: G.kenar, genislik: 240 });
    sonuc('PNG (240 px genişlik), sayfa sayısı 2, sayfa ölçüsü A4', typeof b.r?.png === 'string' && b.r.png.length > 1000 && b.r.pngGenislik === 240 && b.r.sayfa === 2 && A4([b.r.genislik, b.r.yukseklik]), b.e || { ...b.r, png: b.r?.png?.length });
    const t0 = Date.now();
    const b2 = await cagir('udf:yaklasikBilgi', { yol: G.kenar, genislik: 240 });
    sonuc('Aynı dosyanın ikinci isteği ön bellekten (hızlı, aynı sonuç)', b2.r?.png === b.r?.png && Date.now() - t0 < 300, Date.now() - t0);
    sonuc('Geçici dosya kalmadı', !geciciler().length, geciciler());
    // İstek kimlikli küçük resimler udf:yaklasikIptal ile iptal edilir: sıradakiler çizilmez (0.2.6 incelemesi: araç kapansa da sürüyordu;
    // dosya da sırası gelince okunur)
    const kopyalar = Array.from({ length: 6 }, (_, i) => { const y = path.join(GIRDI, `kucuk-resim-${i + 1}.udf`); fs.copyFileSync(G.uzun, y); return y; });
    const ip = await evalJs(`(async () => {
      const istekler = ${J(kopyalar)}.map((yol, i) => window.pdefe.cagir('udf:yaklasikBilgi', { yol, genislik: 200, istekId: 400 + i })
        .then(() => 'bitti', (e) => (/ptal edildi/.test(String(e?.message || e)) ? 'iptal' : 'hata: ' + (e?.message || e))));
      await new Promise((c) => setTimeout(c, 300));
      const t0 = performance.now();
      const ip = await Promise.all(${J(kopyalar)}.map((_, i) => window.pdefe.cagir('udf:yaklasikIptal', { istekId: 400 + i })));
      const sonuclar = await Promise.all(istekler);
      return { ip, sonuclar, ms: Math.round(performance.now() - t0) };
    })()`);
    await bekle(400);
    // İlki iptalden önce bitmiş olabilir (kısa belge); sıradakilerin hepsi iptal
    const iptalOlan = ip.sonuclar.filter((x) => x === 'iptal').length;
    sonuc('Küçük resim istekleri istek kimliğiyle iptal edilir: sıradakiler "iptal" döner, kısa sürede; geçici dosya kalmaz', iptalOlan >= 5
      && ip.sonuclar.every((x, i) => x === 'bitti' || (x === 'iptal' && ip.ip[i] === true)) && ip.ms < 5000 && !geciciler().length, { ...ip, gecici: geciciler() });
    // Araç: satırların küçük resimleri çizilirken pencere kapatılınca hepsi iptal edilir
    // (gizli çizim pencereleri CDP'den sayılır: kapatmadan sonra en çok o an çizilmekte olan bir tanesi görünür, sıradakiler hiç açılmaz)
    const bekleyen = await evalJs(`(async () => {
      window.__pdefe.komutCalistir('arac.donustur', ${J(kopyalar)});
      const bek = () => (window.__uy.m.acikDonusturPenceresi()?.ogeler || []).filter((o) => o.onizleniyor).length;
      for (let i = 0; i < 100 && bek() < 4; i++) await new Promise((c) => setTimeout(c, 50));
      const n = bek();
      const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); await m.aracPencereleriniKapat();
      return n;
    })()`);
    const cizimPencereleri = new Set();
    for (let t0 = Date.now(); Date.now() - t0 < 4000;) {
      try { for (const h of await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) if (/udf-cizim/.test(h.url)) cizimPencereleri.add(h.id); } catch { /* yok say */ }
      await bekle(60);
    }
    sonuc('Araç kapatılınca sıradaki küçük resimler çizilmez (iptal): en çok bir çizim penceresi görünür', bekleyen >= 4 && cizimPencereleri.size <= 1,
      { bekleyen, cizimPenceresi: cizimPencereleri.size });
    await pencereKapat();
    for (const y of kopyalar) fs.rmSync(y, { force: true });
  }

  // ------------------------------------------------------------ 5) Araç
  if (bolum(5)) {
    console.log('\n== 5) Format Değiştir aracı');
    await sekmeleriKapat();
    fs.rmSync(CIKTI, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); fs.mkdirSync(CIKTI, { recursive: true });
    await bildirimler();
    await aracAc([G.kenar, G.uzun]);
    await kosul(`[...document.querySelectorAll('.donustur-oge')].every((e) => e.querySelector('.resim img'))`, 15000);
    let S = await satirlar();
    const s = Object.fromEntries(S.map((x) => [x.ad, x]));
    const k = s['kenar_farkli.udf'];
    const h = (x, id) => x?.hedefler.find((y) => y.id === id);
    sonuc('UDF satırı: PDF hedefi seçili ve seçilebilir, ipucunda "görünüm yaklaşık"', k?.tur === 'udf' && h(k, 'pdf')?.secili && !h(k, 'pdf').devre && /görünüm yaklaşık/.test(h(k, 'pdf').ipucu), k);
    sonuc(`TIFF hedefi ${TIFF_VAR ? 'seçilebilir' : 'soluk'}, Word hedefi ${WORD_VAR ? 'seçilebilir' : 'soluk (nedeni ipucunda)'}`, !!h(k, 'tiff') && h(k, 'tiff').devre === !TIFF_VAR && !!h(k, 'word')
      && h(k, 'word').devre === !WORD_VAR && (WORD_VAR || !!h(k, 'word').ipucu), k?.hedefler);
    sonuc('Satırda yaklaşık uyarısı (uyarı rengiyle) ve "UYAP Doküman Editörü\'nün yerini göster" bağlantısı', k?.neden === UYARI && k.nedenYaklasik && k.bag === 'UYAP Doküman Editörü\'nün yerini göster', k);
    sonuc('Küçük resim ve sayfa sayısı yaklaşık çizimden ("UDF · 2 sayfa")', k?.resim === 'img' && /^UDF · 2 sayfa/.test(k.ozet) && s['uzun.udf']?.resim === 'img' && /sayfa/.test(s['uzun.udf'].ozet), S.map((x) => [x.ad, x.resim, x.ozet]));
    sonuc('Dönüştür düğmesi etkin', !(await evalJs(`document.querySelector('.donustur-pencere .arac-dugmeler .birincil').disabled`)));
    await ss('05-satirlar');
    await pencereKapat();

    // Tek UDF → PDF: sekmede açılır, bildirimde uyarı
    await aracAc([G.kenar]);
    await bildirimler();
    await donusturVeBekle();
    const hedef1 = path.join(CIKTI, 'kenar_farkli (2).pdf');
    const hedef0 = path.join(CIKTI, 'kenar_farkli.pdf');
    const hedef = fs.existsSync(hedef1) ? hedef1 : hedef0;
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`, 10000);
    const aktif = await evalJs(`window.__pdefe.aktif()?.yol || ''`);
    const bl = await bildirimler();
    const p1 = fs.existsSync(hedef) ? pdfOzeti(hedef) : null;
    sonuc('Tek UDF → PDF: pencere kapanır, PDF sekmede açılır (A4, 2 sayfa)', !(await evalJs(`!!document.querySelector('.donustur-pencere')`)) && path.resolve(aktif || '.') === path.resolve(hedef)
      && p1?.sayfa === 2 && p1.olcu.every(A4), { aktif, hedef, p1: p1 && { sayfa: p1.sayfa, olcu: p1.olcu } });
    sonuc('Bildirimde "görünüm yaklaşık" uyarısı', bl.some((b) => b.startsWith('Dönüştürüldü: ') && b.includes(UYARI)), bl);
    await sekmeleriKapat();

    // Birden çok dosya: UDF → TIFF, UDF → PDF ve açılamayan belge; sonuç listesinde uyarı
    await aracAc([G.uzun, G.tablo, G.dis_varlik]);
    await kosul(`(() => { const e = [...document.querySelectorAll('.donustur-oge')].find((x) => x.querySelector('.ad').textContent === 'dis_varlik.udf'); return e && !e.querySelector('.resim.onizleniyor'); })()`, 15000);
    S = await satirlar();
    const dv = S.find((x) => x.ad === 'dis_varlik.udf');
    sonuc('Açılamayan belgenin satırında nedeni ("Belge açılamadı: … güvenlik nedeniyle …")', /Belge açılamadı: .*güvenlik nedeniyle/.test(dv?.uyari || ''), dv);
    if (TIFF_VAR) await hedefTikla('uzun.udf', 'tiff');
    await evalJs(`window.__pdefeOtoYanit = { secim: 0 }`);   // "dönüştürülemiyor" sorusu çıkarsa: Atla ve devam et
    await donusturVeBekle();
    await evalJs(`delete window.__pdefeOtoYanit`);
    const sonucMetni = await evalJs(`document.querySelector('.donustur-sonuc')?.hidden === false ? document.querySelector('.donustur-sonuc').innerText : ''`);
    const uzunHedef = path.join(CIKTI, TIFF_VAR ? 'uzun.tif' : 'uzun.pdf');
    sonuc(`Birden çok dosya: ${TIFF_VAR ? 'UDF → TIFF ve ' : ''}UDF → PDF yazıldı, açılamayan belge hatasıyla sonuç listesinde`, fs.existsSync(uzunHedef) && fs.existsSync(path.join(CIKTI, 'tablolu.pdf'))
      && /2 dosya dönüştürüldü/.test(sonucMetni) && /dis_varlik\.udf/.test(sonucMetni) && /güvenlik nedeniyle/.test(sonucMetni), sonucMetni);
    sonuc('Sonuç listesindeki her dönüştürülen dosyada "görünüm yaklaşık" uyarısı', (sonucMetni.match(/görünüm yaklaşık/g) || []).length === 2, sonucMetni);
    if (TIFF_VAR) { const ti = tiffOzeti(uzunHedef); sonuc('UDF → TIFF: birden çok sayfa, 200 dpi', ti.sayfa >= 2 && J(ti.dpi) === J([200, 200]), ti); }
    await ss('05-sonuc');
    await pencereKapat();

    // Editör bulunduğu hâlde çekirdek "desteklenmiyor" derse: yaklaşık çizimle yeniden denenir (benzetim: arayüzün yetenekleri editör var der)
    await aracAc([G.yorumlu]);
    await evalJs(`(() => { const a = ${A}; a.yetenekler = { ...(a.yetenekler || {}), udf: { var: true, ude: { var: true, yol: 'C:\\\\Uyap' } } };
      for (const o of a.ogeler) if (o.tur === 'udf') { for (const b of ['pdf', 'word', 'tiff']) o.hedefler.set(b, { bicim: b, var: true }); o.hedefBicim = 'pdf'; a._ogeCiz(o); }
      a._durumGuncelle(); return true; })()`);
    S = await satirlar();
    sonuc('Benzetim: satırda yaklaşık uyarısı yok (çekirdeğe gidecek)', S[0]?.neden === '' && !S[0].nedenYaklasik, S[0]);
    await bildirimler();
    await donusturVeBekle();
    const bl2 = await bildirimler();
    const yh = path.join(CIKTI, 'yorumlu.pdf');
    sonuc('Çekirdek "desteklenmiyor" dedi: PDF yaklaşık çizimle yazıldı, bildirimde çekirdeğin nedeni ve "görünüm yaklaşık"', fs.existsSync(yh)
      && bl2.some((b) => b.includes('Bu bilgisayarda UYAP Doküman Editörü bulunamadı; görünüm yaklaşık') && b.includes('yorumlar')), bl2);
    await sekmeleriKapat();
    await pencereKapat();

    // İptal (araç): çok sayıda UDF; İptal'e hemen basılır
    const kopyalar = [];
    for (let i = 1; i <= 10; i++) { const y = path.join(GIRDI, `iptal ${i}.udf`); fs.copyFileSync(G.uzun, y); kopyalar.push(y); }
    await aracAc(kopyalar, 30000);
    await bildirimler();
    await tikSecici('.donustur-pencere .arac-dugmeler .birincil');
    await kosul(`!document.querySelector('.donustur-pencere .arac-ilerleme')?.hidden`, 5000);
    await bekle(150);
    await tikSecici('.donustur-pencere .arac-ilerleme-iptal');
    await kosul(`!document.querySelector('.donustur-pencere .arac-ilerleme') || document.querySelector('.donustur-pencere .arac-ilerleme').hidden`, 30000);
    await bekle(800);
    const bl3 = await bildirimler();
    // Satırların küçük resimleri (yaklaşık çizim, sırada dönüştürmenin arkasında) iptalden sonra da çizilir: geçici dosyaları onlar bitince silinir
    await kosul(`!document.querySelector('.donustur-oge .resim.onizleniyor')`, 30000);
    for (let i = 0; i < 40 && geciciler().length; i++) await bekle(250);
    sonuc('Araçta İptal: "hiçbir dosya kaydedilmedi", klasörde iptal dosyası ve geçici dosya yok', bl3.some((b) => /iptal edildi/.test(b)) && !ciktilar().some((a) => /^iptal \d+/.test(a)) && !geciciler().length,
      { bl3, dosyalar: ciktilar(), gecici: geciciler() });
    await pencereKapat();
    for (const y of kopyalar) fs.rmSync(y, { force: true });

    // Ayarlar › Kaydetme › UYAP Doküman Editörü
    await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'kaydetme')`);
    const KART = `document.querySelector('.ayarlar-ortusu .ayar-kart[data-hedef="udeYolu"]')`;
    await kosul(`!!${KART} && !${KART}.querySelector('.ayar-ude-durum').textContent.includes('Aranıyor')`, 15000);
    const kd = await evalJs(`(() => { const k = ${KART}; return { aciklama: k.querySelector('.ayar-aciklama').textContent, durum: [...k.querySelectorAll('.ayar-ude-durum > div')].map((d) => d.textContent) }; })()`);
    sonuc('Ayarlar: durumda neden ve "yaklaşık çizimiyle" satırı; açıklamada yaklaşık çizim', kd.durum[0] === YET.udf.neden && /yaklaşık çizimiyle \(satır ve sayfa kırılımları/.test(kd.durum.at(-1) || '')
      && /Editör yoksa UDF'ler PDEfe'nin yaklaşık çizimiyle dönüştürülür\./.test(kd.aciklama), kd);
    await ss('05-ayarlar');
    await evalJs(`(async () => { const m = await import('pdefe://app/src/renderer/ayarlarPenceresi.js'); m.ayarlarPenceresiKapat(); return true; })()`);
  }

  // ------------------------------------------------------------ son denetim
  console.log('\n== Son denetim');
  const hatalar = await evalJs(`window.__uyHatalar.splice(0)`);
  sonuc('Arayüzde yakalanmamış hata yok', !hatalar.length, hatalar);
  const k = kutular();
  sonuc('Hiçbir iletişim kutusu açılmadı; ana süreç yaşıyor', k.sayi === 0 && anaSurecYasiyor(), k);
  sonuc('Gizli çizim sayfası ve geçici dosya kalmadı', !(await sayfalar()).some((u) => /udf-cizim/.test(u)) && !geciciler().length, { sayfalar: await sayfalar(), gecici: geciciler() });
  console.log(`\n${denetim - hataSayisi}/${denetim} denetim geçti.`);
  if (hataSayisi) process.exitCode = 1;
}
