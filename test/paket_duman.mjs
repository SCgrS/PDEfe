// Paketli sürümün kısa duman sınaması (0.2.3, yayım öncesi): test kancası olmayan release\win-unpacked\PDEfe.exe görünmeyen masaüstünde
// (baslat_gizli.ps1 -Paketli; kişinin ekranına çıkmaz). Yalnızca window.__pdefe, olağan IPC (preload izin listesindeki kanallar) ve gerçek
// Windows kapatma iletisi (test/pencere_kapat.ps1) kullanılır; 0.2.2'deki kısa denetimin (14) üstüne 0.2.3'ün maddeleri. Denetlenenler:
//   1) Sürüm (uygulama:bilgi ve açılış ekranının sağ altı) package.json'daki sürüm.
//   2) Sekme şeridi en üstte, araç çubuğu altında, ikisi 40 px; seçili sekme 36 px, alt kenarı araç çubuğunun üst kenarında, rengi aynı.
//   3) Geri al ile ▾'si tek parça (▾ 13 px), geri alınacak yokken ikisi soluk; Sayfalar paneli ilk açılışta gizli, bayrak ayarlara yazıldı.
//   4) Açılış ekranında PDF aç'ın sağ kenarı Sayfaları düzenle karosunun sağ kenarında; Birleştir önizlemesi 150 px.
//   5) İki belge açılır, çizilir; paketli çekirdeğin küçük resmi taranmış sayfada JPEG, metin sayfasında PNG (PyInstaller paketinde JPEG
//      kodlayıcı var mı).
//   6) Sayfa döndürülünce geri al ▾ listesi "Sayfayı döndür · s. 1" satırıyla açılır, Esc kapatır.
//   7) Gerçek × (SC_CLOSE) ve WM_CLOSE: iki sekmede "Geçerli sekme / Tüm sekmeler / Vazgeç"; Vazgeç; Geçerli sekme → o sekmenin kaydetme
//      sorusu → Kaydetme → yalnızca o sekme kapanır; tek sekmede × sorusuz kapatır, uygulama çıkar (son adım örneği kapatır).
// Kullanım (önce: npm run cekirdek:derle; npx electron-builder --win --dir --publish never):
//   powershell -File test\baslat_gizli.ps1 -Port 9762 -Veri "$env:TEMP\pdefe-paket-9762" -Paketli release\win-unpacked\PDEfe.exe   → PID=… yazar
//     (veri klasörü boş olmalı: panelin ilk açılışı denetlenir)
//   $env:PDEFE_CDP_PORT=9762; $env:PAKET_PID=<PID>; $env:PAKET_VERI="$env:TEMP\pdefe-paket-9762"; node test\surucu.mjs betik test\paket_duman.mjs
// Örnekler test/cikti/paket_duman/<zaman>/pdf altında üretilir (ornek_pdf_uret.py; taranmış sayfa test/cikti/kaydirma/pdf/taranmis.pdf, yoksa
// kaydirma_ornek_uret.py üretir); gerçek belge yok. Ekran görüntüleri …/png altında. Hiçbir şey kaydedilmez.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 'paket_duman', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PDF = path.join(K, 'pdf'), PNG = path.join(K, 'png');
const KAYDIRMA = path.join(KOK, 'test', 'cikti', 'kaydirma', 'pdf');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const PORT = process.env.PDEFE_CDP_PORT;
const PID = process.env.PAKET_PID;
const VERI = process.env.PAKET_VERI;
const SURUM = JSON.parse(fs.readFileSync(path.join(KOK, 'package.json'), 'utf8')).version;
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, tamam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (ok) tamam++; else hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

export default async function ({ evalJs, ekranGoruntusu, bekle, tus }) {
  if (!PORT || !PID || !VERI) throw new Error('PDEFE_CDP_PORT, PAKET_PID ve PAKET_VERI verilmeli (kullanım dosyanın başında).');
  fs.mkdirSync(PDF, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  for (const ad of ['a', 'b']) execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), path.join(PDF, `${ad}.pdf`), '3', `Belge ${ad}`]);
  if (!fs.existsSync(path.join(KAYDIRMA, 'taranmis.pdf'))) execFileSync(PY, [path.join(KOK, 'test', 'kaydirma_ornek_uret.py'), KAYDIRMA], { stdio: 'inherit' });
  const TARANMIS = path.join(KAYDIRMA, 'taranmis.pdf');

  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { let v; try { v = await evalJs(ifade); } catch { v = null; } if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  const KUTU = `(() => { const k = [...document.querySelectorAll('.mesaj-kutusu')].at(-1); if (!k) return null;
    return { ileti: k.querySelector('.mesaj-ileti')?.textContent, dugmeler: [...k.querySelectorAll('.dugmeler button')].map((b) => b.textContent) }; })()`;
  const kutuBekle = async (sure = 8000) => { const t0 = Date.now(); for (;;) { const k = await evalJs(KUTU); if (k || Date.now() - t0 > sure) return k; await bekle(100); } };
  const kutuDugmesi = (metin) => evalJs(`(() => { const b = [...[...document.querySelectorAll('.mesaj-kutusu')].at(-1)?.querySelectorAll('.dugmeler button') || []]
    .find((x) => x.textContent === ${J(metin)}); if (!b) return false; b.click(); return true; })()`);
  const pencereKapat = (ileti) => {
    try {
      return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'pencere_kapat.ps1'), '-Port', String(PORT), '-SurecNo', String(PID), '-Ileti', ileti]).toString('utf8').trim();
    } catch (e) { return 'HATA ' + e.message; }
  };
  const sekmeAdlari = () => evalJs(`window.__pdefe.sekmeler.sekmeler.map((s) => s.ad)`);

  // 1) Sürüm ve açılış ekranı
  await kosul(`!!window.__pdefe && !document.querySelector('#baslangic').hidden`);
  const bilgi = await evalJs(`window.pdefe.cagir('uygulama:bilgi')`);
  sonuc(`Uygulama sürümü ${SURUM}`, bilgi?.surum === SURUM, bilgi?.surum);
  await kosul(`(document.querySelector('.karsilama-surum')?.textContent || '').includes(${J(SURUM)})`, 5000);
  const imza = await evalJs(`document.querySelector('.karsilama-surum')?.textContent || ''`);
  sonuc(`Açılış ekranında "sürüm ${SURUM}"`, imza === ` · sürüm ${SURUM}`, imza);
  await ekranGoruntusu(path.join(PNG, '1-acilis.png'));

  // 2) Şeritler
  const serit = await evalJs(`(() => { const r = (s) => { const k = document.querySelector(s).getBoundingClientRect(); return { t: k.top, b: k.bottom, h: k.height }; };
    return { sekme: r('#sekme-cubugu'), arac: r('#arac-cubugu'), aktif: r('.sekme.aktif'), aktifBg: getComputedStyle(document.querySelector('.sekme.aktif')).backgroundColor,
      aracBg: getComputedStyle(document.querySelector('#arac-cubugu')).backgroundColor, sira: [...document.querySelector('#uygulama').children].map((e) => e.id).filter(Boolean).slice(0, 2) }; })()`);
  sonuc('Sekme şeridi en üstte, araç çubuğu altında (ikisi 40 px)', serit.sekme.t === 0 && serit.sekme.h === 40 && Math.abs(serit.arac.t - 40) < 0.01 && serit.arac.h === 40
    && J(serit.sira) === J(['sekme-cubugu', 'arac-cubugu']), serit);
  sonuc('Seçili sekme 36 px, araç çubuğuyla aynı renk ve bitişik', serit.aktif.h === 36 && Math.abs(serit.aktif.b - serit.arac.t) < 0.01 && serit.aktifBg === serit.aracBg, serit);

  // 3) Geri al bölünmüş düğmesi; Sayfalar paneli ilk açılışta gizli
  const geri = await evalJs(`(() => { const g = document.querySelector('#dugme-geri-al'), o = document.querySelector('#dugme-geri-al-liste');
    return { kap: g.parentElement.classList.contains('bolunmus') && o.parentElement === g.parentElement, w: o.getBoundingClientRect().width, gd: g.disabled, od: o.disabled }; })()`);
  sonuc('Geri al ile ▾ tek parça (▾ 13 px), geri alınacak yokken ikisi soluk', geri.kap && Math.abs(geri.w - 13) < 0.01 && geri.gd && geri.od, geri);
  const panel = await evalJs(`({ acik: window.__pdefe.panel.acik, gizli: document.querySelector('#sol-panel').hidden })`);
  let ayarlar = {};
  try { ayarlar = JSON.parse(fs.readFileSync(path.join(VERI, 'ayarlar.json'), 'utf8')); } catch { /* yazılmamış */ }
  sonuc('Sayfalar paneli ilk açılışta gizli, bayrak yazıldı', panel.acik === false && ayarlar.solPanelKapatildi === true && ayarlar.solPanelAcik === false,
    { panel, solPanelAcik: ayarlar.solPanelAcik, bayrak: ayarlar.solPanelKapatildi });

  // 4) Açılış ekranının hizası; Birleştir önizlemesinin kutusu (araclar.css index.html'de yüklü)
  const hiza = await evalJs(`(() => { const a = document.querySelector('.karsilama-ac').getBoundingClientRect(), karo = [...document.querySelectorAll('.karsilama-arac')][1];
    const d = document.createElement('div'); d.className = 'birlestir-pencere'; d.style.display = 'none'; document.body.appendChild(d);
    const v = getComputedStyle(d).getPropertyValue('--birlestir-resim').trim(); d.remove();
    return { fark: Math.abs(a.right - karo.getBoundingClientRect().right), birlestir: v, karo: karo.textContent.trim().slice(0, 17) }; })()`);
  sonuc('PDF aç ile Sayfaları düzenle aynı hizada bitiyor', hiza.fark <= 0.05 && hiza.karo === 'Sayfaları düzenle', hiza);
  sonuc('Birleştir önizlemesi 150 px', hiza.birlestir === '150px', hiza.birlestir);

  // 5) Belgeler; paketli çekirdeğin küçük resim biçimi
  const ac = (yol) => evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); for (let i = 0; i < 200 && b && !b.gorunum.hazir; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 400)); return !!b; })()`);
  await ac(path.join(PDF, 'a.pdf')); await ac(path.join(PDF, 'b.pdf'));
  const cizim = await kosul(`(() => { const b = window.__pdefe.aktif(); const s = b?.gorunum?.sayfalar?.[0]; return s?.canvas && s.canvas.width > 0 ? { ad: b.ad, sayfa: b.gorunum.sayfalar.length, w: s.canvas.width } : null; })()`);
  const adlar = await sekmeAdlari();
  sonuc('İki belge açıldı, etkin belgenin ilk sayfası çizildi', J(adlar) === J(['a.pdf', 'b.pdf']) && cizim?.ad === 'b.pdf' && cizim.sayfa === 3, { adlar, cizim });
  const resim = await evalJs(`(async () => { const al = (yol) => window.pdefe.cagir('cekirdek:cagir', 'kucuk_resim', { yol, sayfa: 1, genislik: 256 }, 'duman-' + Math.random());
    const t = await al(${J(TARANMIS)}), m = await al(${J(path.join(PDF, 'a.pdf'))});
    return { t: { bicim: t.bicim, g: t.genislik, bas: String(t.veri).slice(0, 4) }, m: { bicim: m.bicim, g: m.genislik, bas: String(m.veri).slice(0, 4) } }; })()`);
  sonuc('Paketli çekirdek: taranmış sayfanın küçük resmi JPEG, metin sayfasınınki PNG',
    resim.t.bicim === 'jpeg' && resim.t.bas === '/9j/' && resim.m.bicim === 'png' && resim.m.bas === 'iVBO', resim);

  // 6) Geri al listesi
  await evalJs(`(async () => { const p = window.__pdefe; await p.sayfalariDondur(p.aktif(), [1], 90, 'Sayfayı döndür'); await new Promise((r) => setTimeout(r, 300)); return true; })()`);
  await evalJs(`(document.querySelector('#dugme-geri-al-liste').click(), 1)`);
  const liste = await kosul(`(() => { const l = document.querySelector('.gecmis-listesi'); if (!l || l.hidden) return null; return [...l.querySelectorAll('.gecmis-ogeler > li')].map((li) => li.textContent.trim()); })()`, 4000);
  sonuc('Geri al ▾ listesi açılıyor, döndürme adımı listede', Array.isArray(liste) && liste.length === 1 && /Sayfayı döndür/.test(liste[0]) && /s\. 1/.test(liste[0]), liste);
  await ekranGoruntusu(path.join(PNG, '2-geri-al-listesi.png'));
  await tus('Escape');
  sonuc('Esc listeyi kapatır', !!(await kosul(`(() => { const l = document.querySelector('.gecmis-listesi'); return !l || l.hidden; })()`, 3000)));

  // 7) Gerçek kapatma iletileri
  let r = pencereKapat('sistem');
  let k = await kutuBekle();
  sonuc('× (SC_CLOSE): "Geçerli sekme / Tüm sekmeler / Vazgeç" sorusu', /^TAMAM/.test(r) && k?.ileti === 'Bu pencerede 2 sekme açık.'
    && J(k?.dugmeler) === J(['Geçerli sekme', 'Tüm sekmeler', 'Vazgeç']), { r, k });
  await ekranGoruntusu(path.join(PNG, '3-kapatma-sorusu.png'));
  await kutuDugmesi('Vazgeç');
  await kosul(`!document.querySelector('.mesaj-kutusu')`, 4000);
  sonuc('Vazgeç: iki sekme yerinde', J(await sekmeAdlari()) === J(['a.pdf', 'b.pdf']));
  r = pencereKapat('kapat');
  k = await kutuBekle();
  sonuc('WM_CLOSE: aynı soru', /^TAMAM/.test(r) && k?.ileti === 'Bu pencerede 2 sekme açık.', { r, k });
  await kutuDugmesi('Geçerli sekme');
  await bekle(400);
  k = await kutuBekle();
  sonuc('Geçerli sekme: önce o sekmenin kaydetme sorusu', k?.ileti === '"b.pdf" belgesinde kaydedilmemiş değişiklikler var.' && J(k?.dugmeler) === J(['Kaydet', 'Kaydetme', 'Vazgeç']), k);
  await kutuDugmesi('Kaydetme');
  await kosul(`window.__pdefe.sekmeler.sekmeler.length === 1`, 5000);
  sonuc('Kaydetme: yalnızca geçerli sekme kapandı, pencere açık', J(await sekmeAdlari()) === J(['a.pdf']));
  r = pencereKapat('sistem');
  let cikti = false;
  for (let i = 0; i < 50 && !cikti; i++) { await bekle(200); try { process.kill(+PID, 0); } catch { cikti = true; } }
  sonuc('Tek sekmede × sorusuz kapatır, uygulama çıkar', /^TAMAM/.test(r) && cikti, r);

  console.log(`\n${tamam + hataSayisi} denetim, ${tamam} geçti, ${hataSayisi} hata  (ekran görüntüleri: ${PNG})`);
  fs.rmSync(PDF, { recursive: true, force: true });
  process.exitCode = hataSayisi ? 1 : 0;
}
