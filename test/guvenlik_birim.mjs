// Ana süreç güvenlik yardımcılarının (src/main/guvenlik.js) Electron'suz birim denemesi.
//   paketKlasoruMu (0.2.1): macOS'ta kabuk:klasorAc uygulama paketini (.app; klasördür, açılınca uygulama başlar) açmamalı. Uzantıdan, bağlantının
//   gösterdiği yerden ve Contents/Info.plist'ten tanınır; olağan klasörler (adında nokta olanlar dahil) paket sayılmaz. İşlev platformdan
//   bağımsızdır (main.js yalnızca macOS'ta çağırır), bu yüzden Windows'ta da sınanır.
//   cekirdekParametreleri (0.2.6, Format Değiştir): bicim_donustur'da her öğenin hedefi biçimin uzantısıyla, seçenekler bilinen
//   değerler; UYAP Doküman Editörü'nün klasörü ana sürecin ayarından (arayüzün verdiği yok sayılır).
//   UDF'nin yaklaşık çizimi (0.2.6, main/udfYaklasik.js): udfIcerigiDenetle (zip'in merkezî dizini: öğe sayısı, şifre, sıkıştırma yöntemi,
//   content.xml'in tekliği ve beyan edilen açılmış boyutlar; düz XML), udfDosyasiOku, udfYaklasikParametreleri (kanalların parametreleri).
// Kullanım (depo kökünden): node test/guvenlik_birim.mjs   (geçici klasör: $env:GUVENLIK_BIRIM_KLASORU, varsayılan test\cikti\guvenlik_birim;
// iş bitince silinir)      çıkış kodu: hata varsa 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { paketKlasoruMu, cekirdekParametreleri, udfIcerigiDenetle, udfDosyasiOku, udfYaklasikParametreleri, ayarYazimiDenetle, acilacakYollar, aracCiktiKaydi } from '../src/main/guvenlik.js';

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

  // ------------------------------------------------------------ Format Değiştir (0.2.6): cekirdekParametreleri
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
  // 0.2.7: görüntü hedefi (JPG; ad kökü), çakışma seçeneği ("yeni belge olarak kaydet"), İdeal / Düşük tahmini, Birleştir'in UDF'leri
  const jpg = await cekirdekParametreleri('bicim_donustur', { ogeler: [oge('g.jpg', 'gorsel', { dpi: 200 }), { ...oge('h.JPEG', 'gorsel'), cakisma: 'yeniAd' },
    { ...oge('i.tif', 'tiff'), cakisma: 'uzerineYaz' }, oge('j.pdf', 'pdf')] }, K);
  kontrol('bicim_donustur: JPG hedefi (.jpg, .JPEG) ve çözünürlüğü (200) geçer', jpg.ogeler.length === 4 && jpg.ogeler[0].hedefBicim === 'gorsel' && jpg.ogeler[0].secenekler.dpi === 200);
  kontrol('bicim_donustur: cakisma ("yeniAd", "uzerineYaz") geçer; verilmezse alan yok', jpg.ogeler[1].cakisma === 'yeniAd' && jpg.ogeler[2].cakisma === 'uzerineYaz'
    && !('cakisma' in jpg.ogeler[3]));
  await reddedilir('bicim_donustur: bilinmeyen cakisma ("sil") bütün isteği reddeder', 'bicim_donustur', { ogeler: [oge('a.pdf', 'pdf'), { ...oge('b.jpg', 'gorsel'), cakisma: 'sil' }] });
  await reddedilir('bicim_donustur: JPG hedefinde .png reddedilir (yalnızca .jpg / .jpeg)', 'bicim_donustur', { ogeler: [oge('x.png', 'gorsel')] });
  await reddedilir('bicim_donustur: JPG hedefinde .exe reddedilir', 'bicim_donustur', { ogeler: [oge('x.exe', 'gorsel')] });
  await reddedilir('bicim_donustur: JPG çözünürlüğü 72 reddedilir', 'bicim_donustur', { ogeler: [oge('x.jpg', 'gorsel', { dpi: 72 })] });
  const th = await cekirdekParametreleri('donusum_tahmini', { yollar: [path.join(K, 'a.pdf'), path.join(K, 'b.tif')], hedefBicim: 'tiff', renk: 'gri', fazla: 1, hedef: undefined }, K);
  kontrol('donusum_tahmini: yollar, TIFF ve renk geçer; bilinmeyen anahtar atılır', JSON.stringify(th) === JSON.stringify({ yollar: [path.join(K, 'a.pdf'), path.join(K, 'b.tif')], hedefBicim: 'tiff', renk: 'gri' }));
  const th2 = await cekirdekParametreleri('donusum_tahmini', { yollar: path.join(K, 'a.pdf'), hedefBicim: 'gorsel' }, K);
  kontrol('donusum_tahmini: tek yol metni ve JPG (gorsel) hedefi geçer', JSON.stringify(th2) === JSON.stringify({ yollar: [path.join(K, 'a.pdf')], hedefBicim: 'gorsel' }));
  await reddedilir('donusum_tahmini: PDF hedefi reddedilir (yalnızca TIFF ve JPG)', 'donusum_tahmini', { yollar: [path.join(K, 'a.pdf')], hedefBicim: 'pdf' });
  await reddedilir('donusum_tahmini: bilinmeyen renk reddedilir', 'donusum_tahmini', { yollar: [path.join(K, 'a.pdf')], hedefBicim: 'tiff', renk: 'mor' });
  await reddedilir('donusum_tahmini: boş liste reddedilir', 'donusum_tahmini', { yollar: [], hedefBicim: 'tiff' });
  await reddedilir('donusum_tahmini: boş yol reddedilir', 'donusum_tahmini', { yollar: [''], hedefBicim: 'tiff' });
  await reddedilir('donusum_tahmini: 501 yol reddedilir', 'donusum_tahmini', { yollar: Array.from({ length: 501 }, (_, i) => path.join(K, `x${i}.pdf`)), hedefBicim: 'tiff' });
  const gb = await cekirdekParametreleri('gorsel_bilgi', { yol: path.join(K, 'a.udf'), udeYolu: 'C:\\Baska\\Klasor', genislik: 150 }, K, { udeYolu: udeKlasor });
  const br = await cekirdekParametreleri('birlestir', { ogeler: [{ yol: path.join(K, 'a.udf') }], hedef: path.join(K, 'B.pdf'), udeYolu: 'C:\\Baska' }, K, {});
  kontrol('Birleştir (gorsel_bilgi, birlestir): udeYolu ana sürecin ayarından (arayüzünki yok sayılır), öteki parametreler değişmez', gb.udeYolu === udeKlasor && gb.genislik === 150
    && br.udeYolu === null && br.ogeler.length === 1);
  await reddedilir('birlestir: .bat hedefi yine reddedilir', 'birlestir', { ogeler: [{ yol: path.join(K, 'a.udf') }], hedef: path.join(K, 'x.bat') });

  // ------------------------------------------------------------ UDF'nin yaklaşık çizimi (0.2.6): udfIcerigiDenetle
  // En küçük zip yazıcısı: öğe { ad, veri?, yontem? (0 saklama, 8 deflate), bayrak?, beyan? (merkezî dizindeki açılmış boyut), zip64? }
  const zip = (ogeler) => {
    const yereller = [], merkez = [];
    let ofset = 0;
    for (const o of ogeler) {
      const ad = Buffer.from(o.ad, 'utf8'), ham = Buffer.from(o.veri ?? '<template/>', 'utf8');
      const yontem = o.yontem ?? 8, veri = yontem === 8 ? zlib.deflateRawSync(ham) : ham;
      const acik = o.zip64 ? 0xffffffff : (o.beyan ?? ham.length), bayrak = (o.bayrak ?? 0) | 0x800;
      const y = Buffer.alloc(30); y.writeUInt32LE(0x04034b50, 0); y.writeUInt16LE(20, 4); y.writeUInt16LE(bayrak, 6); y.writeUInt16LE(yontem, 8);
      y.writeUInt32LE(veri.length, 18); y.writeUInt32LE(acik, 22); y.writeUInt16LE(ad.length, 26);
      const m = Buffer.alloc(46); m.writeUInt32LE(0x02014b50, 0); m.writeUInt16LE(20, 4); m.writeUInt16LE(20, 6); m.writeUInt16LE(bayrak, 8); m.writeUInt16LE(yontem, 10);
      m.writeUInt32LE(veri.length, 20); m.writeUInt32LE(acik, 24); m.writeUInt16LE(ad.length, 28); m.writeUInt32LE(ofset, 42);
      yereller.push(y, ad, veri); merkez.push(m, ad);
      ofset += 30 + ad.length + veri.length;
    }
    const md = Buffer.concat(merkez), son = Buffer.alloc(22);
    son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(ogeler.length, 8); son.writeUInt16LE(ogeler.length, 10); son.writeUInt32LE(md.length, 12); son.writeUInt32LE(ofset, 16);
    return Buffer.concat([...yereller, md, son]);
  };
  const MB = 1024 * 1024;
  const denetimKodu = (bayt) => { try { return udfIcerigiDenetle(bayt); } catch (e) { return 'hata:' + e.kod; } };
  const icerik = { ad: 'content.xml', veri: '<?xml version="1.0"?><template><content><![CDATA[a\n]]></content><elements/></template>' };
  kontrol('UDF: content.xml\'li zip kabul ("zip")', denetimKodu(zip([icerik, { ad: 'documentproperties.xml' }])) === 'zip');
  kontrol('UDF: saklanmış (sıkıştırılmamış) öğe kabul', denetimKodu(zip([{ ...icerik, yontem: 0 }])) === 'zip');
  kontrol('UDF: baştaki "./" ve büyük harf motorun kuralıyla content.xml sayılır', denetimKodu(zip([{ ...icerik, ad: './Content.XML' }])) === 'zip');
  kontrol('UDF: düz XML (BOM ve boşluktan sonra "<") kabul ("xml")', denetimKodu(Buffer.from('﻿ \r\n<?xml version="1.0"?><template/>', 'utf8')) === 'xml');
  kontrol('UDF: boş dosya reddedilir (bozuk)', denetimKodu(Buffer.alloc(0)) === 'hata:bozuk');
  kontrol('UDF: XML de zip de olmayan bayt reddedilir (bozuk)', denetimKodu(Buffer.from('%PDF-1.7 deneme')) === 'hata:bozuk');
  kontrol('UDF: imzası zip, merkezî dizini olmayan bayt reddedilir (bozuk)', denetimKodu(Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(200, 7)])) === 'hata:bozuk');
  kontrol('UDF: content.xml\'siz paket reddedilir (bozuk)', denetimKodu(zip([{ ad: 'baska.xml' }])) === 'hata:bozuk');
  kontrol('UDF: iki content.xml ("content.xml", "./CONTENT.xml") reddedilir (guvensiz)', denetimKodu(zip([icerik, { ...icerik, ad: './CONTENT.xml' }])) === 'hata:guvensiz');
  kontrol('UDF: 1001 öğeli paket reddedilir (guvensiz)', denetimKodu(zip([icerik, ...Array.from({ length: 1000 }, (_, i) => ({ ad: `e/${i}`, veri: 'x' }))])) === 'hata:guvensiz');
  kontrol('UDF: şifreli öğe reddedilir (parolali)', denetimKodu(zip([{ ...icerik, bayrak: 1 }])) === 'hata:parolali');
  kontrol('UDF: bilinmeyen sıkıştırma (bzip2, 12) reddedilir (bozuk)', denetimKodu(zip([{ ...icerik, yontem: 12 }])) === 'hata:bozuk');
  kontrol('UDF: content.xml\'in beyanı 21 MB: reddedilir (buyuk)', denetimKodu(zip([{ ...icerik, beyan: 21 * MB }])) === 'hata:buyuk');
  kontrol('UDF: öğelerin beyanı toplam 65 MB (zip bombası): reddedilir (guvensiz)', denetimKodu(zip([icerik, ...Array.from({ length: 5 }, (_, i) => ({ ad: `e${i}.bin`, beyan: 13 * MB }))])) === 'hata:guvensiz');
  kontrol('UDF: ZIP64 beyanı (0xFFFFFFFF) reddedilir', /^hata:(buyuk|bozuk)$/.test(denetimKodu(zip([{ ...icerik, zip64: true }]))));
  kontrol('UDF: 41 MB dosya reddedilir (buyuk)', denetimKodu(Buffer.concat([Buffer.from('<x>'), Buffer.alloc(41 * MB, 0x20)])) === 'hata:buyuk');
  kontrol('UDF: 21 MB düz XML reddedilir (buyuk)', denetimKodu(Buffer.concat([Buffer.from('<x>'), Buffer.alloc(21 * MB, 0x20)])) === 'hata:buyuk');
  const udfYolu = path.join(K, 'deneme.udf');
  fs.writeFileSync(udfYolu, zip([icerik]));
  const okunan = await udfDosyasiOku(udfYolu);
  kontrol('udfDosyasiOku: denetimden geçen dosyanın baytları', Buffer.isBuffer(okunan) && okunan.length === fs.statSync(udfYolu).size);
  const okumaKodu = async (y) => { try { await udfDosyasiOku(y); return 'okundu'; } catch (e) { return e.kod; } };
  kontrol('udfDosyasiOku: olmayan dosya "bulunamadi"', (await okumaKodu(path.join(K, 'yok.udf'))) === 'bulunamadi');
  kontrol('udfDosyasiOku: klasör "bozuk"', (await okumaKodu(klasor('Klasor.udf'))) === 'bozuk');
  fs.writeFileSync(path.join(K, 'pdf.udf'), '%PDF-1.7\n');
  kontrol('udfDosyasiOku: içeriği UDF olmayan dosya "bozuk"', (await okumaKodu(path.join(K, 'pdf.udf'))) === 'bozuk');

  // ------------------------------------------------------------ UDF'nin yaklaşık çizimi: kanal parametreleri (udfYaklasikParametreleri)
  const yp = (kanal, p) => { try { return udfYaklasikParametreleri(kanal, p); } catch { return null; } };
  const yoge = (hedef, hedefBicim, ek = {}) => ({ yol: udfYolu, hedef: path.join(K, hedef), hedefBicim, ...ek });
  const b1 = yp('udf:yaklasikBilgi', { yol: udfYolu, genislik: 5000, fazla: 1 });
  kontrol('yaklasikBilgi: mutlak yol, genişlik 1024\'e çekilir, bilinmeyen anahtar atılır', JSON.stringify(b1) === JSON.stringify({ yol: udfYolu, genislik: 1024 }));
  kontrol('yaklasikBilgi: genişlik verilmezse 220', yp('udf:yaklasikBilgi', { yol: udfYolu })?.genislik === 220);
  kontrol('yaklasikBilgi: istek kimliği (iptal için) geçer, -1 / metin reddedilir', yp('udf:yaklasikBilgi', { yol: udfYolu, istekId: 5 })?.istekId === 5
    && yp('udf:yaklasikBilgi', { yol: udfYolu, istekId: -1 }) === null && yp('udf:yaklasikBilgi', { yol: udfYolu, istekId: '5' }) === null);
  kontrol('yaklasikBilgi: göreli yol reddedilir', yp('udf:yaklasikBilgi', { yol: 'deneme.udf' }) === null);
  const d1 = yp('udf:yaklasikDonustur', { ogeler: [yoge('a.pdf', 'pdf'), yoge('b.tif', 'tiff', { secenekler: { dpi: 300, renk: 'renkli', x: 1 } }), yoge('c.docx', 'word')], istekId: 7 });
  kontrol('yaklasikDonustur: PDF / TIFF / Word hedefleri ve istek kimliği geçer; bilinmeyen seçenek atılır', d1?.ogeler?.length === 3 && d1.istekId === 7
    && JSON.stringify(d1.ogeler[1].secenekler) === JSON.stringify({ dpi: 300, renk: 'renkli' }));
  kontrol('yaklasikDonustur: UDF hedefi reddedilir (UDF → UDF yok)', yp('udf:yaklasikDonustur', { ogeler: [yoge('a.udf', 'udf')] }) === null);
  const d2 = yp('udf:yaklasikDonustur', { ogeler: [yoge('a.jpg', 'gorsel', { secenekler: { dpi: 300 }, cakisma: 'yeniAd' }), yoge('b.pdf', 'pdf', { cakisma: 'yeniAd' })] });
  kontrol('yaklasikDonustur (0.2.7): JPG hedefi ve cakisma geçer', d2?.ogeler?.length === 2 && d2.ogeler[0].hedefBicim === 'gorsel' && d2.ogeler[0].cakisma === 'yeniAd' && d2.ogeler[1].cakisma === 'yeniAd');
  kontrol('yaklasikDonustur: bilinmeyen cakisma reddedilir', yp('udf:yaklasikDonustur', { ogeler: [yoge('a.pdf', 'pdf', { cakisma: 1 })] }) === null);
  // udf:yaklasikBirlestir (0.2.7, Birleştir'de UDE yokken): birlestir öğelerinin bilinen alanları, en az bir yaklaşık UDF, hedef mutlak .pdf
  const bh = path.join(K, 'Birlesik.pdf');
  const bo = (yol, ek = {}) => ({ yol: path.join(K, yol), ...ek });
  const b2 = yp('udf:yaklasikBirlestir', { ogeler: [bo('a.udf', { tur: 'udf', yaklasik: true, kalite: 'orta', dondurme: 90, fazla: 1 }), bo('b.jpg', { tur: 'gorsel', sayfaBoyutu: 'a4', kenar: 10 }),
    bo('c.pdf', { tur: 'pdf' })], hedef: bh, genelKalite: 'yuksek', istekId: 9, gecici: 'x' });
  kontrol('yaklasikBirlestir: öğeler, hedef, genel kalite ve istek kimliği geçer; bilinmeyen anahtarlar atılır', b2?.ogeler?.length === 3 && b2.hedef === bh && b2.genelKalite === 'yuksek' && b2.istekId === 9
    && !('gecici' in b2) && JSON.stringify(b2.ogeler[0]) === JSON.stringify({ yol: path.join(K, 'a.udf'), tur: 'udf', kalite: 'orta', dondurme: 90, yaklasik: true }));
  kontrol('yaklasikBirlestir: yaklaşık UDF yoksa reddedilir (çekirdeğin birlestir\'i)', yp('udf:yaklasikBirlestir', { ogeler: [bo('c.pdf', { tur: 'pdf' })], hedef: bh }) === null);
  kontrol('yaklasikBirlestir: UDF olmayan öğede yaklasik reddedilir', yp('udf:yaklasikBirlestir', { ogeler: [bo('a.udf', { tur: 'udf', yaklasik: true }), bo('c.pdf', { tur: 'pdf', yaklasik: true })], hedef: bh }) === null);
  kontrol('yaklasikBirlestir: .bat hedef, göreli hedef ve göreli yol reddedilir', yp('udf:yaklasikBirlestir', { ogeler: [bo('a.udf', { tur: 'udf', yaklasik: true })], hedef: path.join(K, 'x.bat') }) === null
    && yp('udf:yaklasikBirlestir', { ogeler: [bo('a.udf', { tur: 'udf', yaklasik: true })], hedef: 'x.pdf' }) === null
    && yp('udf:yaklasikBirlestir', { ogeler: [{ yol: 'a.udf', tur: 'udf', yaklasik: true }], hedef: bh }) === null);
  kontrol('yaklasikBirlestir: bilinmeyen tür, kalite ve döndürme reddedilir', [{ tur: 'exe' }, { kalite: 'en iyi' }, { dondurme: 45 }]
    .every((ek) => yp('udf:yaklasikBirlestir', { ogeler: [bo('a.udf', { tur: 'udf', yaklasik: true }), bo('b.jpg', ek)], hedef: bh }) === null));
  // 0.2.9: Birleştir'in sayfa boyutu seçimi kalktı (görüntü sayfası A4'e sığar); eski sayfaBoyutu / kenar alanları çekirdeğe geçmez, istek reddedilmez
  const b3 = yp('udf:yaklasikBirlestir', { ogeler: [bo('a.udf', { tur: 'udf', yaklasik: true }), bo('b.jpg', { tur: 'gorsel', sayfaBoyutu: 'A3', kenar: 51 })], hedef: bh });
  kontrol('yaklasikBirlestir (0.2.9): eski sayfaBoyutu ve kenar atılır', b3?.ogeler?.length === 2 && JSON.stringify(b3.ogeler[1]) === JSON.stringify({ yol: path.join(K, 'b.jpg'), tur: 'gorsel' })
    && JSON.stringify(b2?.ogeler?.[1]) === JSON.stringify({ yol: path.join(K, 'b.jpg'), tur: 'gorsel' }), [b3?.ogeler, b2?.ogeler?.[1]]);
  // "Üzerine yaz" (0.2.7 inceleme): hedef listedeki açık PDF'tir; çekirdeğin birlestir'i bütün girdileri okuduktan sonra yazar (kural onunkiyle aynı).
  // Yaklaşık çizilen UDF'nin kendisi hedef olamaz (UDF'nin yerine PDF yazılırdı)
  const uz = yp('udf:yaklasikBirlestir', { ogeler: [bo('Birlesik.PDF', { tur: 'pdf' }), bo('a.udf', { tur: 'udf', yaklasik: true })], hedef: bh });
  kontrol('yaklasikBirlestir: hedef listedeki PDF olabilir (Üzerine yaz)', uz?.hedef === bh && uz.ogeler.length === 2);
  kontrol('yaklasikBirlestir: hedef yaklaşık çizilen UDF olamaz; 501 öğe reddedilir', yp('udf:yaklasikBirlestir', { ogeler: [bo('Birlesik.pdf', { tur: 'udf', yaklasik: true }), bo('c.pdf', { tur: 'pdf' })], hedef: bh }) === null
    && yp('udf:yaklasikBirlestir', { ogeler: Array.from({ length: 501 }, (_, i) => bo(`x${i}.udf`, { tur: 'udf', yaklasik: true })), hedef: bh }) === null);
  kontrol('yaklasikDonustur: .bat hedef reddedilir', yp('udf:yaklasikDonustur', { ogeler: [yoge('a.bat', 'pdf')] }) === null);
  kontrol('yaklasikDonustur: hedef girdinin kendisi olamaz', yp('udf:yaklasikDonustur', { ogeler: [{ yol: path.join(K, 'x.pdf'), hedef: path.join(K, 'X.PDF'), hedefBicim: 'pdf' }] }) === null);
  kontrol('yaklasikDonustur: aynı hedef iki kez reddedilir', yp('udf:yaklasikDonustur', { ogeler: [yoge('a.pdf', 'pdf'), { ...yoge('A.pdf', 'pdf'), yol: path.join(K, 'baska.udf') }] }) === null);
  kontrol('yaklasikDonustur: göreli hedef reddedilir', yp('udf:yaklasikDonustur', { ogeler: [{ yol: udfYolu, hedef: 'a.pdf', hedefBicim: 'pdf' }] }) === null);
  kontrol('yaklasikDonustur: 501 öğe reddedilir', yp('udf:yaklasikDonustur', { ogeler: Array.from({ length: 501 }, (_, i) => yoge(`x${i}.pdf`, 'pdf')) }) === null);
  kontrol('yaklasikDonustur: TIFF çözünürlüğü 250 reddedilir', yp('udf:yaklasikDonustur', { ogeler: [yoge('a.tif', 'tiff', { secenekler: { dpi: 250 } })] }) === null);
  kontrol('yaklasikDonustur: istek kimliği -1 / metin reddedilir', yp('udf:yaklasikDonustur', { ogeler: [yoge('a.pdf', 'pdf')], istekId: -1 }) === null
    && yp('udf:yaklasikDonustur', { ogeler: [yoge('a.pdf', 'pdf')], istekId: '3' }) === null);
  kontrol('yaklasikIptal: istek kimliği gerekir', yp('udf:yaklasikIptal', {}) === null && yp('udf:yaklasikIptal', { istekId: 3 })?.istekId === 3);
  kontrol('bilinmeyen kanal ve dizi parametresi reddedilir', yp('udf:yaklasikKoy', { gecici: udfYolu, hedef: udfYolu }) === null && yp('udf:yaklasikBilgi', [udfYolu]) === null);

  // ------------------------------------------------------------ ayar:koy (0.2.6): arayüzün yazabileceği ayarlar (ayarYazimiDenetle)
  // Yalnızca bilinen üst düzey ayar (VARSAYILANLAR'ın anahtarı); udeYolu yalnızca null. Nesne anahtarı (conf bütün girdilerini yazar) ve
  // noktalı yol ('udeYolu.x' udeYolu'nu nesneye çevirir) reddedilir: çekirdek udeYolu klasöründeki Java'yı çalıştırır
  const VARSAYILAN = { tema: 'sistem', udeYolu: null, yazdirma: {}, sonDosyalar: [] };
  const ayarSonucu = (anahtar, deger) => { try { ayarYazimiDenetle(anahtar, deger, VARSAYILAN); return 'izin'; } catch { return 'red'; } };
  kontrol('ayar:koy: bilinen ayar yazılır (tema, yazdirma nesnesi, sonDosyalar dizisi)', ayarSonucu('tema', 'koyu') === 'izin' && ayarSonucu('yazdirma', { yazici: 'X' }) === 'izin'
    && ayarSonucu('sonDosyalar', []) === 'izin');
  kontrol('ayar:koy: udeYolu yalnızca null (temizleme)', ayarSonucu('udeYolu', null) === 'izin' && ayarSonucu('udeYolu', undefined) === 'izin' && ayarSonucu('udeYolu', 'C:\\x') === 'red'
    && ayarSonucu('udeYolu', '\\\\sunucu\\pay\\UDE') === 'red');
  kontrol('ayar:koy: nesne anahtarı reddedilir ({ udeYolu: … } ve zararsız görünen { tema: … })', ayarSonucu({ udeYolu: '\\\\sunucu\\pay\\UDE' }) === 'red' && ayarSonucu({ tema: 'koyu' }) === 'red');
  kontrol('ayar:koy: noktalı yol reddedilir (udeYolu.x, yazdirma.yazici)', ayarSonucu('udeYolu.x', 'C:\\x') === 'red' && ayarSonucu('yazdirma.yazici', 'X') === 'red');
  kontrol('ayar:koy: bilinmeyen anahtar, dizi, sayı, boş ve __proto__ reddedilir', ['bilinmeyen', '', '__proto__', 'constructor', 'toString'].every((a) => ayarSonucu(a, 1) === 'red')
    && ayarSonucu(['udeYolu'], 'C:\\x') === 'red' && ayarSonucu(5, 1) === 'red' && ayarSonucu(null, 1) === 'red');

  // ------------------------------------------------------------ pencere:yeniPenceredeAc (0.2.7): yeni pencerede açılacak dosyalar
  const yolSonucu = (y) => { try { return acilacakYollar(y); } catch { return 'red'; } };
  const mutlak = path.join(K, 'Belge.pdf');
  kontrol('yeniPenceredeAc: mutlak yollar geçer (kopyası döner)', JSON.stringify(yolSonucu([mutlak, mutlak + '.udf'])) === JSON.stringify([mutlak, mutlak + '.udf']));
  kontrol('yeniPenceredeAc: göreli yol, boş, NUL, dizi olmayan, boş dizi ve 100\'den çok yol reddedilir', yolSonucu(['Belge.pdf']) === 'red' && yolSonucu(['']) === 'red'
    && yolSonucu([mutlak + '\0x']) === 'red' && yolSonucu(mutlak) === 'red' && yolSonucu([]) === 'red' && yolSonucu([5]) === 'red' && yolSonucu(Array(101).fill(mutlak)) === 'red');

  // ------------------------------------------------------------ dosya:varsayilanlaAc (0.2.8): araçların bu oturumda yazdığı çıktı dosyaları
  const kayit = aracCiktiKaydi();
  const y = (ad) => path.join(K, 'Cikti', ad);
  kayit.kaydet('bicim_donustur', null, { sonuclar: [
    { yol: y('a.pdf'), hedef: y('a.udf'), hedefBicim: 'udf' },
    { yol: y('b.pdf'), hedef: y('b.jpg'), hedefBicim: 'gorsel', hedefler: [y('b - Sayfa 1.jpg'), y('b - Sayfa 2.jpg')] },
    { yol: y('c.pdf'), hedef: y('c.docx'), hedefBicim: 'word', hata: 'Dönüştürülemedi.', kod: 'hata' },
    { yol: y('d.udf'), hedef: y('d.pdf'), hedefBicim: 'pdf' },
    { yol: y('e.pdf'), hedef: y('e.tif'), hedefBicim: 'tiff' },
  ] });
  kontrol('varsayilanlaAc: Format Değiştir\'in yazdığı UDF, JPG sayfaları, PDF ve TIFF açılabilir; büyük / küçük harf ayrımsız',
    kayit.acilabilirMi(y('a.udf')) && kayit.acilabilirMi(y('b - Sayfa 1.jpg')) && kayit.acilabilirMi(y('b - Sayfa 2.jpg')) && kayit.acilabilirMi(y('d.pdf'))
    && kayit.acilabilirMi(y('e.tif')) && kayit.acilabilirMi(y('A.UDF')));
  kontrol('varsayilanlaAc: hatalı öğenin hedefi, JPG\'nin kök adı (sayfa dosyaları yazıldı) ve girdiler açılamaz',
    !kayit.acilabilirMi(y('c.docx')) && !kayit.acilabilirMi(y('b.jpg')) && !kayit.acilabilirMi(y('a.pdf')) && !kayit.acilabilirMi(y('d.udf')));
  kayit.kaydet('ayir', null, { dosyalar: [y('Ayrılmış - Sayfa 1-3.pdf'), y('Ayrılmış - Sayfa 4.pdf')] });
  kayit.kaydet('birlestir', { hedef: y('Birleştirilmiş.pdf') }, { boyut: 10, sayfa: 2, yol: y('Birleştirilmiş.pdf') });
  kayit.kaydet('birlestir', { hedef: y('Yolsuz sonuç.pdf') }, { boyut: 10, sayfa: 2 });
  kayit.ekle([y('Yaklaşık.pdf')]);
  kontrol('varsayilanlaAc: Ayır\'ın dosyaları, Birleştir\'in hedefi (sonuçtaki yol, yoksa istekteki hedef) ve ana sürecin yazdığı yaklaşık PDF açılabilir',
    kayit.acilabilirMi(y('Ayrılmış - Sayfa 1-3.pdf')) && kayit.acilabilirMi(y('Ayrılmış - Sayfa 4.pdf')) && kayit.acilabilirMi(y('Birleştirilmiş.pdf'))
    && kayit.acilabilirMi(y('Yolsuz sonuç.pdf')) && kayit.acilabilirMi(y('Yaklaşık.pdf')));
  kayit.kaydet('bicim_donustur', null, { sonuclar: [{ yol: y('x.pdf'), hedef: y('Program.exe') }, { yol: y('x.pdf'), hedef: y('Kısayol.lnk') }, { yol: y('x.pdf'), hedef: 'göreli.pdf' }] });
  kayit.ekle([y('Betik.bat'), 'C:', y('NUL\0.pdf'), 5, null]);
  kayit.kaydet('kucult', { hedef: y('Sıkıştırılmış.pdf') }, { boyut: 1, yol: y('Sıkıştırılmış.pdf') });
  kontrol('varsayilanlaAc: çıktı uzantısı olmayan (.exe, .lnk, .bat), göreli, NUL içeren yol ve başka yöntemlerin (kucult) dosyaları kaydedilmez',
    !kayit.acilabilirMi(y('Program.exe')) && !kayit.acilabilirMi(y('Kısayol.lnk')) && !kayit.acilabilirMi('göreli.pdf') && !kayit.acilabilirMi(y('Betik.bat'))
    && !kayit.acilabilirMi(y('NUL\0.pdf')) && !kayit.acilabilirMi(y('Sıkıştırılmış.pdf')) && !kayit.acilabilirMi(5) && kayit.boyut === 10, `kayıt ${kayit.boyut}`);
  kontrol('varsayilanlaAc: kayıtta olmayan yol (başka klasördeki aynı ad) açılamaz', !kayit.acilabilirMi(path.join(K, 'Baska', 'a.udf')) && !kayit.acilabilirMi(y('f.pdf')));
} finally {
  try { fs.rmSync(K, { recursive: true, force: true }); } catch { console.log('Not: ' + K + ' silinemedi.'); }
}
console.log(hata ? `${hata} denetim başarısız.` : 'Bütün denetimler geçti.');
process.exit(hata ? 1 : 0);
