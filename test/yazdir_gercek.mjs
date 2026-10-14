// Gerçek yazdırma (0.2.6): PDEfe'nin yazdırma penceresinden Windows'un yazdırma kutusu açılmadan Microsoft Print to PDF'e yazdırılır, çıktı
// PDF ölçülür. Görünmeyen masaüstündeki test örneğinde (kişinin ekranına hiçbir pencere çıkmaz): "Çıktıyı Farklı Kaydet" kutusunu
// test/yazdir_kaydet.ps1 o masaüstünde bulup doldurur.
//   1) Tümü, belgeye göre kâğıt, sığdır, renkli: 4 sayfa, hepsi A4 dikey; yatay sayfa (2) ve /Rotate 90'lı sayfa (3) döndürülmüş (her sayfanın
//      sağ alt köşesindeki mor karenin kâğıttaki yeri), A5 sayfa (4) A4'e büyütülmüş; notlar basılmamış; renkli
//   2) Siyah beyaz: renkli piksel 0
//   3) Notları yazdır + aralık "1": tek sayfa, notun yeşil dolgusu var
//   4) 2 kopya, aralık "1-2": 4 sayfa, harmanlı sıra (1, 2, 1, 2)
//   5) Kâğıt A5: kâğıt 148 × 210 mm
//   6) Gerçek boyut, kâğıt A4, aralık "4": A5 sayfa A4 kâğıtta büyütülmeden
//   7) Kaydetme kutusunda Vazgeç: dosya yazılmaz, "Yazdırma vazgeçildi."
// Kaydetme kutusunun PDEfe penceresinin önünde açıldığı da yazılır (bilgi; görünmeyen masaüstündeki sıra).
// Kullanım:
//   $env:PDEFE_TEST_GERCEK_YAZDIR = "1"; powershell -File test\baslat_gizli.ps1 -Port 9471 -Veri "$env:TEMP\pdefe-yzg-9471"
//   $env:PDEFE_CDP_PORT = 9471; node test\surucu.mjs betik test\yazdir_gercek.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Çıktılar test/cikti/yzg altına yazılır. Microsoft Print to PDF yoksa betik durur.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 'yzg');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const YAZICI = 'Microsoft Print to PDF';
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const bilgi = (metin) => console.log('     ' + metin);

/** Kaydetme kutusunu görünmeyen masaüstünde bekleyip doldurur (arka planda); söz, yardımcının JSON çıktısıyla çözülür. */
function kutuyuDoldur(yol, { vazgec = false } = {}) {
  return new Promise((coz) => {
    const arg = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'yazdir_kaydet.ps1'), '-Masaustu', `PDEfeTest${PORT}`, '-Yol', yol, '-Bekle', '60'];
    if (vazgec) arg.push('-Vazgec');
    const s = spawn('powershell.exe', arg, { windowsHide: true });
    let cikti = '';
    s.stdout.on('data', (d) => { cikti += d; });
    s.stderr.on('data', (d) => { cikti += d; });
    s.on('close', () => { try { coz(JSON.parse(cikti.trim().split(/\r?\n/).pop())); } catch { coz({ bulundu: false, cikti }); } });
  });
}

/** Dosyanın yazılıp boyutunun durulmasını bekler (yazıcı sürücüsü kuyruktan sonra yazar). */
async function dosyayiBekle(yol, sure = 30000) {
  const t0 = Date.now();
  let onceki = -1;
  while (Date.now() - t0 < sure) {
    await new Promise((c) => setTimeout(c, 500));
    let boyut = -1;
    try { boyut = fs.statSync(yol).size; } catch { /* henüz yok */ }
    if (boyut > 0 && boyut === onceki) {
      try { const f = fs.openSync(yol, 'r+'); fs.closeSync(f); return true; } catch { /* hâlâ yazılıyor */ }
    }
    onceki = boyut;
  }
  return false;
}
const olc = (yol) => JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'yazdir_pdf_olc.py'), yol], { encoding: 'utf8' }));

export default async function ({ evalJs, bekle }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  fs.mkdirSync(UI, { recursive: true });
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const ORNEK = path.join(UI, `ornek-${Date.now().toString(36)}.pdf`);
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'yazdir_ornek_uret.py'), ORNEK], { encoding: 'utf8' });
  await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(ORNEK)}); return true; })()`);
  await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
  await bekle(500);

  /** Pencereyi açar, seçenekleri koyar, yazdırır; kaydetme kutusunu doldurur. Döner: { kutu, dosya, olcu, bildirim } */
  let sayac = 0;
  const yazdir = async (ad, secenek, { vazgec = false } = {}) => {
    const cikti = path.join(UI, `${++sayac}-${ad}.pdf`);
    fs.rmSync(cikti, { force: true });
    await evalJs(`(window.__pdefe.komutCalistir('dosya.yazdir'), true)`);
    await kosul(`!!document.querySelector('.yazdir-diyalog') && [...document.querySelector('[name="yazici"]').options].some((o) => o.value === ${J(YAZICI)})`, 10000);
    await bekle(1800);   // yazıcı durumu (Win32_Printer) gelsin
    const kuruldu = await evalJs(`(() => {
      const o = document.querySelector('.yazdir-diyalog'), s = ${J(secenek)}, al = (n) => o.querySelector('[name="' + n + '"]');
      const radyo = (n, v) => { const r = o.querySelector('[name="' + n + '"][value="' + v + '"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); };
      al('yazici').value = ${J(YAZICI)}; al('yazici').dispatchEvent(new Event('change', { bubbles: true }));
      if (al('yazici').value !== ${J(YAZICI)}) return false;
      al('kopya').value = String(s.kopya || 1); al('kopya').dispatchEvent(new Event('input', { bubbles: true }));
      al('harmanla').checked = s.harmanla !== false;
      if (s.aralik) { radyo('aralik', 'aralik'); al('aralikMetni').value = s.aralik; } else radyo('aralik', 'tumu');
      al('kagit').value = s.kagit || 'belge'; al('kagit').dispatchEvent(new Event('change', { bubbles: true }));
      radyo('olcek', s.olcek || 'sigdir'); radyo('renk', s.renk || 'renkli');
      al('ciftTarafli').value = 'yazici';
      al('notlar').checked = !!s.notlar;
      return true;
    })()`);
    if (!kuruldu) return { kuruldu };
    const kutuSozu = kutuyuDoldur(cikti, { vazgec });
    await evalJs(`(document.querySelector('.yazdir-diyalog [data-id="yazdir"]').click(), true)`);
    const kutu = await kutuSozu;
    const bitti = await kosul(`!document.querySelector('.yazdir-ortusu')`, 30000);
    const bildirim = await evalJs(`document.querySelector('#bildirim')?.textContent || ''`);
    const dosya = vazgec ? fs.existsSync(cikti) : await dosyayiBekle(cikti);
    return { kuruldu, kutu, bitti, bildirim, dosya, olcu: dosya && !vazgec ? olc(cikti) : null };
  };

  const yazicilar = await evalJs(`window.pdefe.cagir('yazdir:yazicilar')`);
  if (!yazicilar?.yazicilar?.some((y) => y.ad === YAZICI)) { sonuc(`"${YAZICI}" yazıcısı var`, false, yazicilar); console.log(`${hataSayisi} HATA / ${toplam}`); return; }

  const A4 = (s) => Math.abs(s.g - 595.3) <= 1.5 && Math.abs(s.y - 841.9) <= 1.5;
  const koseler = (s) => (s.morYer ? `${s.morYer[1] > 0.5 ? 'alt' : 'üst'}-${s.morYer[0] > 0.5 ? 'sağ' : 'sol'}` : null);

  // ------------------------------------------------------------ 1) varsayılan seçenekler
  const r1 = await yazdir('tumu', {});
  sonuc('1) Kaydetme kutusu görünmeyen masaüstünde açıldı ve dolduruldu (Windows yazdırma kutusu açılmadan)', r1.kutu?.bulundu && r1.kutu.sonuc === 'kaydedildi', r1.kutu);
  bilgi(`kutu: "${r1.kutu?.baslik}", sahipsiz: ${r1.kutu?.sahipsiz}, PDEfe penceresinin önünde: ${r1.kutu?.ustte} (sıra ${r1.kutu?.kutuSirasi} / ${r1.kutu?.pdefeSirasi})`);
  sonuc('1) Çıktı dosyası yazıldı, pencere kapandı', r1.dosya && r1.bitti, r1);
  sonuc('1) Bildirim: yazıcıya gönderildi, 4 sayfa', /"Microsoft Print to PDF" yazıcısına gönderildi: 4 sayfa$/.test(r1.bildirim), r1.bildirim);
  const s1 = r1.olcu?.sayfalar || [];
  sonuc('1) 4 sayfa, hepsi A4 dikey', r1.olcu?.sayfa === 4 && s1.every(A4), s1.map((s) => [s.g, s.y]));
  sonuc('1) Döndürme: dikey sayfa olduğu gibi, yatay ve /Rotate 90\'lı sayfa dikey kâğıda döndürülmüş, A5 olduğu gibi (mor kare: alt-sağ, alt-sol, üst-sol, alt-sağ)',
    J(s1.map(koseler)) === J(['alt-sağ', 'alt-sol', 'üst-sol', 'alt-sağ']), s1.map((s) => s.morYer));
  sonuc('1) A5 sayfa A4 kâğıda sığdırılınca büyüdü (mor kare dikey A4 sayfadakinden büyük)', s1[3]?.mor > s1[0]?.mor * 1.5, s1.map((s) => s.mor));
  sonuc('1) Renkli: kırmızı / mavi kutu renkli; notlar basılmadı (yeşil dolgu yok)', s1[0]?.renkli > 500 && s1[0]?.mavi > 100 && s1[0]?.yesil === 0, s1[0]);

  // ------------------------------------------------------------ 2) siyah beyaz
  const r2 = await yazdir('siyah-beyaz', { renk: 'siyahBeyaz', aralik: '1' });
  const s2 = r2.olcu?.sayfalar || [];
  sonuc('2) Siyah beyaz: tek sayfa, renkli piksel 0', r2.olcu?.sayfa === 1 && s2[0]?.renkli === 0, s2[0] || r2);

  // ------------------------------------------------------------ 3) notları yazdır
  const r3 = await yazdir('notlar', { notlar: true, aralik: '1' });
  const s3 = r3.olcu?.sayfalar || [];
  sonuc('3) Notları yazdır: notun yeşil dolgusu basıldı', r3.olcu?.sayfa === 1 && s3[0]?.yesil > 500, s3[0] || r3);

  // ------------------------------------------------------------ 4) iki kopya
  const r4 = await yazdir('2-kopya', { kopya: 2, aralik: '1-2' });
  const s4 = r4.olcu?.sayfalar || [];
  sonuc('4) 2 kopya: 4 sayfa (2 × 2), sıra 1, 2, 1, 2', r4.olcu?.sayfa === 4 && s4[0].ozet === s4[2].ozet && s4[1].ozet === s4[3].ozet && s4[0].ozet !== s4[1].ozet, s4.map((s) => s.ozet));
  sonuc('4) Bildirim: 2 sayfa × 2 kopya', /2 sayfa × 2 kopya$/.test(r4.bildirim), r4.bildirim);

  // ------------------------------------------------------------ 5) A5 kâğıt
  const r5 = await yazdir('a5', { kagit: 'A5', aralik: '1' });
  const s5 = r5.olcu?.sayfalar || [];
  sonuc('5) Kâğıt A5: 148 × 210 mm (419,5 × 595,3 pt)', r5.olcu?.sayfa === 1 && Math.abs(s5[0].g - 419.5) <= 1.5 && Math.abs(s5[0].y - 595.3) <= 1.5, s5[0] || r5);

  // ------------------------------------------------------------ 6) gerçek boyut
  const r6 = await yazdir('gercek-boyut', { olcek: 'gercek', aralik: '4', kagit: 'A4' });   // belgeye göre olsaydı tek seçilen sayfa A5 olduğu için kâğıt A5
  const s6 = r6.olcu?.sayfalar || [];
  sonuc('6) Gerçek boyut: A5 sayfa A4 kâğıtta büyütülmeden (mor kare sığdırılandan küçük, kaynaktakine yakın)', r6.olcu?.sayfa === 1 && A4(s6[0]) && s6[0].mor < s1[3]?.mor * 0.7, { gercek: s6[0], sigdir: s1[3]?.mor });

  // ------------------------------------------------------------ 7) kaydetme kutusunda Vazgeç
  const r7 = await yazdir('vazgec', { aralik: '1' }, { vazgec: true });
  sonuc('7) Kaydetme kutusunda Vazgeç: dosya yok, "Yazdırma vazgeçildi.", iş bitti', r7.kutu?.sonuc === 'vazgecildi' && !r7.dosya && r7.bildirim === 'Yazdırma vazgeçildi.' && r7.bitti
    && !(await evalJs(`window.pdefe.cagir('yazdir:durum')`)).suruyor, r7);
  const hatalar = await evalJs(`(window.__hatalar || []).slice(0, 5)`);
  sonuc('Sayfada hata yok', !hatalar?.length, hatalar);

  console.log(hataSayisi ? `${hataSayisi} HATA / ${toplam}` : `BÜTÜN DENETİMLER GEÇTİ (${toplam})`);
}
