// Ana süreç güvenlik yardımcılarının (src/main/guvenlik.js) Electron'suz birim denemesi.
//   paketKlasoruMu (0.2.1): macOS'ta kabuk:klasorAc uygulama paketini (.app; klasördür, açılınca uygulama başlar) açmamalı. Uzantıdan, bağlantının
//   gösterdiği yerden ve Contents/Info.plist'ten tanınır; olağan klasörler (adında nokta olanlar dahil) paket sayılmaz. İşlev platformdan
//   bağımsızdır (main.js yalnızca macOS'ta çağırır), bu yüzden Windows'ta da sınanır.
//   cekirdekParametreleri (0.2.6, Dosya Formatını Değiştir): bicim_donustur'da her öğenin hedefi biçimin uzantısıyla, seçenekler bilinen
//   değerler; UYAP Doküman Editörü'nün klasörü ana sürecin ayarından (arayüzün verdiği yok sayılır).
// Kullanım (depo kökünden): node test/guvenlik_birim.mjs   (geçici klasör: $env:GUVENLIK_BIRIM_KLASORU, varsayılan test\cikti\guvenlik_birim;
// iş bitince silinir)      çıkış kodu: hata varsa 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paketKlasoruMu, cekirdekParametreleri } from '../src/main/guvenlik.js';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = process.env.GUVENLIK_BIRIM_KLASORU || path.join(KOK, 'test', 'cikti', 'guvenlik_birim');
let hata = 0;
const kontrol = (ad, kosul, ek = '') => { if (!kosul) hata++; console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ek ? ' | ' + ek : ''}`); };
const klasor = (...p) => { const y = path.join(K, ...p); fs.mkdirSync(y, { recursive: true }); return y; };

try {
  fs.rmSync(K, { recursive: true, force: true }); fs.mkdirSync(K, { recursive: true });
  const uygulama = klasor('Uygulamalar', 'Terminal.app');
  fs.mkdirSync(path.join(uygulama, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(uygulama, 'Contents', 'Info.plist'), '<plist/>');
  kontrol('.app paketi', await paketKlasoruMu(uygulama));
  kontrol('.app paketi, sonda bölü işaretiyle', await paketKlasoruMu(uygulama + '/'));
  kontrol('büyük harfli uzantı (.APP)', await paketKlasoruMu(klasor('Deneme.APP')));
  for (const u of ['bundle', 'framework', 'plugin', 'prefPane', 'workflow', 'pkg']) kontrol(`.${u} paketi`, await paketKlasoruMu(klasor('Eklenti.' + u)));
  const uzantisiz = klasor('Uzantisiz Uygulama');
  fs.mkdirSync(path.join(uzantisiz, 'Contents'), { recursive: true });
  fs.writeFileSync(path.join(uzantisiz, 'Contents', 'Info.plist'), '<plist/>');
  kontrol('uzantısız ama Contents/Info.plist taşıyan paket', await paketKlasoruMu(uzantisiz));
  const baglanti = path.join(K, 'Kısayol');
  fs.symlinkSync(uygulama, baglanti, 'junction');   // Windows'ta yönetici izni istemeyen bağlantı; macOS'ta olağan sembolik bağlantı
  kontrol('pakete giden bağlantı (adı uzantısız)', await paketKlasoruMu(baglanti));
  kontrol('paketin içindeki olağan klasör paket değil', !(await paketKlasoruMu(path.join(uygulama, 'Contents', 'MacOS'))));
  kontrol('olağan klasör paket değil', !(await paketKlasoruMu(klasor('Belgeler', 'Dilekçeler'))));
  kontrol('adında nokta olan klasör paket değil', !(await paketKlasoruMu(klasor('Dosya 2026.10'))));
  kontrol('adı ".app" ile biten olmayan klasör (Uygulama apps) paket değil', !(await paketKlasoruMu(klasor('Uygulama apps'))));
  kontrol('olmayan yol paket değil', !(await paketKlasoruMu(path.join(K, 'yok'))));

  // ------------------------------------------------------------ Dosya Formatını Değiştir (0.2.6): cekirdekParametreleri
  // Her öğenin hedefi biçimin uzantısıyla (pdf → .pdf, udf → .udf, tiff → .tif / .tiff, word → .docx); .bat / .cmd / .exe ve uyuşmazlık
  // reddedilir; seçenekler yalnızca bilinen değerler; UYAP Doküman Editörü'nün klasörü arayüzün verdiği değil ana sürecin ayarındaki
  const reddedilir = async (ad, yontem, p, ana) => {
    let hataVar = false;
    try { await cekirdekParametreleri(yontem, p, K, ana); } catch { hataVar = true; }
    kontrol(ad, hataVar);
  };
  const oge = (hedef, hedefBicim, secenekler) => ({ yol: path.join(K, 'girdi.udf'), hedef: path.join(K, hedef), hedefBicim, ...(secenekler ? { secenekler } : {}) });
  const kabul = await cekirdekParametreleri('bicim_donustur', { ogeler: [oge('a.pdf', 'pdf'), oge('b.udf', 'udf'), oge('c.tif', 'tiff', { dpi: 300, renk: 'gri' }),
    oge('d.TIFF', 'tiff'), oge('e.docx', 'word'), oge('f.pdf', 'pdf', { kip: 'otomatik', bilinmeyen: 1 })] }, K);
  kontrol('bicim_donustur: .pdf / .udf / .tif / .TIFF / .docx hedefleri biçimleriyle kabul', kabul.ogeler.length === 6);
  kontrol('bicim_donustur: TIFF seçenekleri (300 dpi, gri) geçer', JSON.stringify(kabul.ogeler[2].secenekler) === JSON.stringify({ dpi: 300, renk: 'gri' }));
  kontrol('bicim_donustur: bilinmeyen seçenek anahtarı atılır, kip kalır', JSON.stringify(kabul.ogeler[5].secenekler) === JSON.stringify({ kip: 'otomatik' }));
  await reddedilir('bicim_donustur: .bat hedef (PDF biçiminde) reddedilir', 'bicim_donustur', { ogeler: [oge('x.bat', 'pdf')] });
  await reddedilir('bicim_donustur: .exe hedef (UDF biçiminde) reddedilir', 'bicim_donustur', { ogeler: [oge('x.exe', 'udf')] });
  await reddedilir('bicim_donustur: biçimle uyuşmayan uzantı (UDF biçiminde .pdf) reddedilir', 'bicim_donustur', { ogeler: [oge('x.pdf', 'udf')] });
  await reddedilir('bicim_donustur: Word hedefi .doc reddedilir (yalnızca .docx)', 'bicim_donustur', { ogeler: [oge('x.doc', 'word')] });
  await reddedilir('bicim_donustur: öğelerin birinde .cmd varsa bütün istek reddedilir', 'bicim_donustur', { ogeler: [oge('a.pdf', 'pdf'), oge('b.cmd', 'tiff'), oge('c.udf', 'udf')] });
  await reddedilir('bicim_donustur: bilinmeyen biçim (__proto__) reddedilir', 'bicim_donustur', { ogeler: [oge('x.pdf', '__proto__')] });
  await reddedilir('bicim_donustur: TIFF çözünürlüğü 250 reddedilir', 'bicim_donustur', { ogeler: [oge('x.tif', 'tiff', { dpi: 250 })] });
  await reddedilir('bicim_donustur: TIFF rengi "mor" reddedilir', 'bicim_donustur', { ogeler: [oge('x.tif', 'tiff', { renk: 'mor' })] });
  await reddedilir('bicim_donustur: UDF kipi "kabuk" reddedilir', 'bicim_donustur', { ogeler: [oge('x.pdf', 'pdf', { kip: 'kabuk' })] });
  await reddedilir('bicim_donustur: boş öğe listesi reddedilir', 'bicim_donustur', { ogeler: [] });
  await reddedilir('bicim_donustur: 501 öğe reddedilir', 'bicim_donustur', { ogeler: Array.from({ length: 501 }, (_, i) => oge(`x${i}.pdf`, 'pdf')) });
  await reddedilir('bicim_donustur: hedefsiz öğe reddedilir', 'bicim_donustur', { ogeler: [{ yol: path.join(K, 'a.udf'), hedefBicim: 'pdf' }] });
  const udeKlasor = klasor('UYAP Kelime Islemci');
  const ude1 = await cekirdekParametreleri('donusum_yetenekleri', { udeYolu: 'C:\\Baska\\Klasor' }, K, { udeYolu: udeKlasor });
  kontrol('udeYolu: arayüzün verdiği yok sayılır, ana sürecin ayarındaki var olan klasör geçer', ude1.udeYolu === udeKlasor);
  const ude2 = await cekirdekParametreleri('bicim_donustur', { ogeler: [oge('a.pdf', 'pdf')], udeYolu: udeKlasor }, K, { udeYolu: path.join(K, 'olmayan') });
  kontrol('udeYolu: ayardaki klasör yoksa null (çekirdek kendisi arar); arayüzün verdiği kullanılmaz', ude2.udeYolu === null);
  const ude3 = await cekirdekParametreleri('donusum_bilgi', { yol: path.join(K, 'a.udf'), udeYolu: udeKlasor, genislik: 5000, onizleme: 'evet' }, K, {});
  kontrol('donusum_bilgi: ayar yokken udeYolu null; genişlik 1024\'e çekilir; ön izleme yalnızca true', ude3.udeYolu === null && ude3.genislik === 1024 && ude3.onizleme === false);
  const ude4 = await cekirdekParametreleri('donusum_bilgi', { yol: path.join(K, 'a.udf') }, K, {});
  kontrol('donusum_bilgi: ön izleme verilmezse açık (çekirdeğin varsayılanı)', ude4.onizleme === true);
  await reddedilir('donusum_bilgi: yolsuz istek reddedilir', 'donusum_bilgi', {});
  await reddedilir('eski kural değişmedi: Sıkıştır\'ın .bat hedefi reddedilir', 'kucult', { yol: path.join(K, 'a.pdf'), hedef: path.join(K, 'x.bat') });
} finally {
  try { fs.rmSync(K, { recursive: true, force: true }); } catch { console.log('Not: ' + K + ' silinemedi.'); }
}
console.log(hata ? `${hata} denetim başarısız.` : 'Bütün denetimler geçti.');
process.exit(hata ? 1 : 0);
