// Yazdırmanın saf işlevlerini Node'da sınar (0.2.6'da genişledi; 0.2.0–0.2.5'te yazdir.js DOM'a bağlı modülleri yüklediği için bu test
// "window is not defined" ile düşüyordu): sayfa aralığı ve seçimi, kâğıt seçimi, sayfanın kâğıt üzerindeki yerleşimi (ön izleme ile basılan
// aynı işlevden), yazdırma HTML'i, ön izleme çözünürlüğü (renderer/yazdirYerlesim.js); yazdırma penceresinin seçeneklerinin Electron'un
// print() seçeneklerine çevrilmesi, yazıcı listesi, varsayılan yazıcı, Windows'un yazıcı durumu ve hata iletileri (main/yazdirSecenek.js).
// Kullanım: node test/yazdir_html_testi.mjs [<goruntuler.json> <cikti.html> [sigdir|gercek]]
//   (isteğe bağlı: sayfa listesinden yazdırma HTML'i yazar; elle bakmak için)
import fs from 'node:fs';
import { sayfaAraligiCoz, secilenSayfalar, kagitSec, sayfaYerlesimi, yazdirmaHtmlOlustur, kagitEtiketi, ozetMetni, onizlemeDpi, GUVENLI_KENAR_MM, PT_MM } from '../src/renderer/yazdirYerlesim.js';
import { secenekleriHazirla, kopyaSayisi, nedenTurkce, varsayilanYaziciCoz, lpstatCoz, yaziciListesiHazirla, yaziciDurumlariniCoz, dosyayaYazarMi } from '../src/main/yazdirSecenek.js';

let hata = 0, tamam = 0;
const esit = (ad, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (ok) tamam++; else hata++; console.log((ok ? 'OK  ' : 'HATA') + ' ' + ad + (ok ? '' : ` → ${JSON.stringify(a)} beklenen ${JSON.stringify(b)}`)); };
const yakin = (ad, a, b, pay = 0.01) => { const ok = Math.abs(a - b) <= pay; if (ok) tamam++; else hata++; console.log((ok ? 'OK  ' : 'HATA') + ' ' + ad + (ok ? '' : ` → ${a} beklenen ${b} (±${pay})`)); };
const dogru = (ad, kosul, ayrinti) => esit(ad + (kosul ? '' : ' ' + JSON.stringify(ayrinti)), !!kosul, true);

// ---------------------------------------------------------------- sayfa aralığı
esit('tek sayfa', sayfaAraligiCoz('3', 10), { sayfalar: [3] });
esit('aralık ve tek', sayfaAraligiCoz('1-3,5', 10), { sayfalar: [1, 2, 3, 5] });
esit('boşluk ve tekrar', sayfaAraligiCoz(' 5, 1 - 3 ,3', 10), { sayfalar: [1, 2, 3, 5] });
esit('açık uçlu', sayfaAraligiCoz('8-', 10), { sayfalar: [8, 9, 10] });
esit('baştan', sayfaAraligiCoz('-2', 10), { sayfalar: [1, 2] });
esit('ters aralık', sayfaAraligiCoz('4-2', 10), { sayfalar: [2, 3, 4] });
esit('uzun tire', sayfaAraligiCoz('1–2', 10), { sayfalar: [1, 2] });
esit('noktalı virgül', sayfaAraligiCoz('1;3', 10), { sayfalar: [1, 3] });
esit('boş', !!sayfaAraligiCoz('', 10).hata, true);
esit('sıfır', !!sayfaAraligiCoz('0', 10).hata, true);
esit('aşan', !!sayfaAraligiCoz('11', 10).hata, true);
esit('harf', !!sayfaAraligiCoz('1a', 10).hata, true);
esit('tek tire', !!sayfaAraligiCoz('-', 10).hata, true);
// Penceredeki seçim
esit('seçim: tümü', secilenSayfalar({ aralik: 'tumu', toplam: 3, gecerli: 2 }), { sayfalar: [1, 2, 3] });
esit('seçim: geçerli', secilenSayfalar({ aralik: 'gecerli', toplam: 3, gecerli: 2 }), { sayfalar: [2] });
esit('seçim: geçerli sınırda', secilenSayfalar({ aralik: 'gecerli', toplam: 3, gecerli: 9 }), { sayfalar: [3] });
esit('seçim: aralık', secilenSayfalar({ aralik: 'aralik', aralikMetni: '2-3', toplam: 3, gecerli: 1 }), { sayfalar: [2, 3] });
esit('seçim: hatalı aralık', !!secilenSayfalar({ aralik: 'aralik', aralikMetni: 'x', toplam: 3, gecerli: 1 }).hata, true);

// ---------------------------------------------------------------- kâğıt
const A4D = { genislikPt: 595.28, yukseklikPt: 841.89 }, A4Y = { genislikPt: 841.89, yukseklikPt: 595.28 };
const LET = { genislikPt: 612, yukseklikPt: 792 }, A5D = { genislikPt: 419.53, yukseklikPt: 595.28 };
esit('kâğıt: belgeye göre, en sık görülen (dikey + yatay A4 → A4)', kagitSec([A4D, A4Y, LET], 'belge').ad, 'A4');
yakin('kâğıt: A4 genişlik mm', kagitSec([A4D], 'belge').genislikMm, 210, 0.05);
esit('kâğıt: eşitlikte büyük olan (A4 / A5 → A4)', kagitSec([A5D, A4D], 'belge').ad, 'A4');
esit('kâğıt: sabit A3', kagitSec([A4D], 'A3').ad, 'A3');
yakin('kâğıt: A3 yükseklik mm', kagitSec([A4D], 'A3').yukseklikMm, 420, 0.1);
esit('kâğıt: Legal', kagitSec([A4D], 'Legal').ad, 'Legal');
const ozel = kagitSec([{ genislikPt: 612, yukseklikPt: 936 }], 'belge');
esit('kâğıt: standart olmayan (8,5×13 inç) adsız', ozel.ad, null);
esit('kâğıt etiketi: standart olmayan', kagitEtiketi(ozel), '216 × 330 mm');
esit('kâğıt etiketi: A4', kagitEtiketi(kagitSec([A4D], 'belge')), 'A4');
esit('kâğıt: bilinmeyen seçim → belgeye göre', kagitSec([LET], 'B5').ad, 'Letter');
esit('kâğıt: boş liste → A4', kagitSec([], 'belge').ad, 'A4');

// ---------------------------------------------------------------- yerleşim (ön izleme ve HTML ortak)
const a4 = kagitSec([A4D], 'A4');
const y1 = sayfaYerlesimi(A4D, a4, 'sigdir');
esit('yerleşim: dikey A4 dönmez', y1.yatay, false);
yakin('yerleşim: dikey A4 sığdırma ölçeği (210 − 2×4) / 210', y1.olcek, (210 - 2 * GUVENLI_KENAR_MM) / 210, 0.001);
yakin('yerleşim: dikey A4 genişlik 202 mm', y1.genislikMm, 202, 0.05);
const y2 = sayfaYerlesimi(A4Y, a4, 'sigdir');
esit('yerleşim: yatay A4 döndürülür', y2.yatay, true);
yakin('yerleşim: yatay sayfanın kâğıttaki kutusu dikey (202 mm genişlik)', y2.kutuGenislikMm, 202, 0.05);
yakin('yerleşim: yatay sayfanın görüntüsü yatay (genişlik > yükseklik)', y2.genislikMm / y2.yukseklikMm, 841.89 / 595.28, 0.001);
const y3 = sayfaYerlesimi(A5D, a4, 'sigdir');
dogru('yerleşim: A5 sayfa A4 kâğıda sığdırılınca büyür', y3.olcek > 1.3, y3);
const y4 = sayfaYerlesimi(A5D, a4, 'gercek');
esit('yerleşim: gerçek boyutta ölçek 1', y4.olcek, 1);
yakin('yerleşim: gerçek boyutta A5 genişliği 148 mm', y4.genislikMm, 419.53 * PT_MM, 0.01);
const y5 = sayfaYerlesimi({ genislikPt: 1190.55, yukseklikPt: 841.89 }, a4, 'gercek');
dogru('yerleşim: gerçek boyutta A3 yatay A4 kâğıttan taşar (kesilir)', y5.yatay && y5.kutuYukseklikMm > 297, y5);

// ---------------------------------------------------------------- yazdırma HTML'i
try { yazdirmaHtmlOlustur([], {}); esit('boş liste hata', false, true); } catch { esit('boş liste hata', true, true); }
const karisik = [{ no: 1, veri: 'x', genislikPt: 595.3, yukseklikPt: 841.9 }, { no: 2, veri: 'x', genislikPt: 841.9, yukseklikPt: 595.3 }, { no: 3, veri: 'x', genislikPt: 612, yukseklikPt: 792 }];
const k = yazdirmaHtmlOlustur(karisik, { olcek: 'sigdir' });
esit('HTML karışık: A4 seçildi', k.kagit.ad, 'A4');
esit('HTML karışık: standart kâğıt adıyla gönderilir', k.sayfaBoyutu, 'A4');
esit('HTML karışık: yatay döndürüldü', (k.html.match(/class="don"/g) || []).length, 1);
esit('HTML karışık: 3 sayfa kutusu', (k.html.match(/class="sayfa"/g) || []).length, 3);
dogru('HTML: @page A4', /@page \{ size: 210\.0\d\dmm 297\.0\d\dmm; margin: 0; \}/.test(k.html), k.html.slice(0, 400));
const k3 = yazdirmaHtmlOlustur(karisik, { olcek: 'sigdir', kagit: 'A3' });
esit('HTML A3 seçimi', k3.sayfaBoyutu, 'A3');
dogru('HTML A3: @page 297×420', /@page \{ size: (296\.9|297\.0)\d\dmm (419\.9|420\.0)\d\dmm;/.test(k3.html), k3.html.match(/@page[^}]*\}/)?.[0]);
const ko = yazdirmaHtmlOlustur([{ no: 1, veri: 'x', genislikPt: 612, yukseklikPt: 936 }], {});
esit('HTML standart olmayan kâğıt mikronla', ko.sayfaBoyutu, { genislikMikron: 215900, yukseklikMikron: 330200 });
const kg = yazdirmaHtmlOlustur([{ no: 1, kaynak: 's0001.jpg', genislikPt: 419.53, yukseklikPt: 595.28 }], { olcek: 'gercek', kagit: 'A4' });
dogru('HTML gerçek boyut: A5 sayfa 148 mm', /width:148\.0\d\dmm/.test(kg.html), kg.html.match(/<img[^>]*>/)?.[0]);
dogru('HTML: göreli görüntü dosyası', /src="s0001\.jpg"/.test(kg.html), '');
try { yazdirmaHtmlOlustur([{ no: 1, kaynak: '../x.jpg', genislikPt: 1, yukseklikPt: 1 }]); esit('HTML: klasör dışı dosya adı reddedilir', false, true); } catch { esit('HTML: klasör dışı dosya adı reddedilir', true, true); }
dogru('HTML: başlık kaçışlı', yazdirmaHtmlOlustur(karisik, { baslik: 'a<b>' }).html.includes('<title>a&lt;b&gt; — PDEfe</title>'), '');

// ---------------------------------------------------------------- özet ve ön izleme çözünürlüğü
esit('özet: tek kopya', ozetMetni(3, 1), '3 sayfa');
esit('özet: iki kopya', ozetMetni(3, 2), '3 sayfa × 2 kopya');
const dpi1 = onizlemeDpi({ sayfa: A4D, kagit: a4, olcek: 'sigdir', kagitPikselGenislik: 380, ekranOlcegi: 1 });
dogru('ön izleme dpi: 380 px genişlikte A4 için 40–56 arası, 8\'in katı', dpi1 >= 40 && dpi1 <= 56 && dpi1 % 8 === 0, dpi1);
const dpi2 = onizlemeDpi({ sayfa: A4D, kagit: a4, olcek: 'sigdir', kagitPikselGenislik: 380, ekranOlcegi: 2 });
dogru('ön izleme dpi: ekran ölçeği 2 iken yaklaşık iki katı', dpi2 >= dpi1 * 1.8 && dpi2 <= dpi1 * 2.2, { dpi1, dpi2 });
esit('ön izleme dpi: alt sınır 24', onizlemeDpi({ sayfa: A4D, kagit: a4, olcek: 'sigdir', kagitPikselGenislik: 10 }), 24);
esit('ön izleme dpi: üst sınır 200', onizlemeDpi({ sayfa: A4D, kagit: a4, olcek: 'sigdir', kagitPikselGenislik: 5000, ekranOlcegi: 2 }), 200);

// ---------------------------------------------------------------- print() seçenekleri
const YASAK = ['pageRanges', 'landscape', 'dpi', 'usePrinterDefaultPageSize'];
const yasakYok = (s) => YASAK.every((a) => !(a in s));
const s0 = secenekleriHazirla({ yazici: 'Lazer Yazıcı', sayfaBoyutu: 'A4' });
esit('seçenek: varsayılan', s0, { silent: true, printBackground: true, margins: { marginType: 'none' }, color: true, deviceName: 'Lazer Yazıcı', copies: 1, collate: true, pageSize: 'A4' });
dogru('seçenek: pageRanges / landscape / dpi hiç yok', yasakYok(s0), s0);
esit('seçenek: "Yazıcının ayarı" → duplexMode gönderilmez', 'duplexMode' in secenekleriHazirla({ ciftTarafli: 'yazici' }), false);
esit('seçenek: tek taraflı → simplex', secenekleriHazirla({ ciftTarafli: 'tek' }).duplexMode, 'simplex');
esit('seçenek: uzun kenar → longEdge', secenekleriHazirla({ ciftTarafli: 'uzun' }).duplexMode, 'longEdge');
esit('seçenek: kısa kenar → shortEdge', secenekleriHazirla({ ciftTarafli: 'kisa' }).duplexMode, 'shortEdge');
esit('seçenek: siyah beyaz → color false', secenekleriHazirla({ renk: 'siyahBeyaz' }).color, false);
esit('seçenek: 2 kopya harmansız', (({ copies, collate }) => ({ copies, collate }))(secenekleriHazirla({ kopya: 2, harmanla: false })), { copies: 2, collate: false });
esit('seçenek: kopya sınırı 99', secenekleriHazirla({ kopya: 150 }).copies, 99);
esit('seçenek: geçersiz kopya → 1', kopyaSayisi('abc'), 1);
esit('seçenek: kesirli kopya aşağı', kopyaSayisi(2.7), 2);
esit('seçenek: standart olmayan kâğıt mikronla', secenekleriHazirla({ sayfaBoyutu: { genislikMikron: 215900, yukseklikMikron: 330200 } }).pageSize, { width: 215900, height: 330200 });
esit('seçenek: çok küçük kâğıt 30 mm\'ye', secenekleriHazirla({ sayfaBoyutu: { genislikMikron: 100, yukseklikMikron: 100 } }).pageSize, { width: 30000, height: 30000 });
esit('seçenek: bilinmeyen kâğıt → A4', secenekleriHazirla({ sayfaBoyutu: 'B5' }).pageSize, 'A4');
const sp = secenekleriHazirla({ yazici: 'Lazer Yazıcı', kopya: 3, harmanla: false, ciftTarafli: 'uzun', sayfaBoyutu: 'A4', sistemPenceresi: true });
esit('seçenek: Windows penceresi (yedek yol): silent false, yazıcı ve kopya orada seçilir', sp, { silent: false, printBackground: true, margins: { marginType: 'none' }, color: true, duplexMode: 'longEdge', pageSize: 'A4' });
dogru('seçenek: Windows penceresinde de yasaklar yok', yasakYok(sp), sp);

// ---------------------------------------------------------------- yazıcılar
const REG = '\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows\r\n    Device    REG_SZ    Microsoft Print to PDF,winspool,Ne01:\r\n\r\n';
esit('varsayılan yazıcı: kayıt defteri', varsayilanYaziciCoz(REG), 'Microsoft Print to PDF');
esit('varsayılan yazıcı: ağ yazıcısı', varsayilanYaziciCoz('    Device    REG_SZ    \\\\sunucu\\Kat 2,winspool,Ne03:'), '\\\\sunucu\\Kat 2');
esit('varsayılan yazıcı: değer yok', varsayilanYaziciCoz('ERROR: The system was unable to find the specified registry key or value.'), null);
esit('varsayılan yazıcı (macOS): lpstat', lpstatCoz('system default destination: Lazer_Yazici\n'), 'Lazer_Yazici');
esit('varsayılan yazıcı (macOS): yok', lpstatCoz('no system default destination\n'), null);
const liste = yaziciListesiHazirla([{ name: 'Şube', displayName: 'Şube' }, { name: 'Lazer Yazıcı', displayName: 'Lazer Yazıcı' }, { name: 'Bina_X', displayName: 'Bina X' }, { name: 'Lazer Yazıcı', displayName: 'Lazer Yazıcı' }, { name: '' }], 'Lazer Yazıcı');
esit('yazıcı listesi: tekrarsız, Türkçe sıralı, varsayılan işaretli', liste, [
  { ad: 'Bina_X', gorunenAd: 'Bina X', varsayilan: false }, { ad: 'Lazer Yazıcı', gorunenAd: 'Lazer Yazıcı', varsayilan: true }, { ad: 'Şube', gorunenAd: 'Şube', varsayilan: false },
]);
const WMI = '﻿[{"Name":"Lazer Yazıcı","Default":true,"WorkOffline":false,"PrinterStatus":3,"ExtendedPrinterStatus":2,"PortName":"USB001","CapabilityDescriptions":["Copies","Color","Duplex","Collate"]},'
  + '{"Name":"Microsoft Print to PDF","Default":false,"WorkOffline":false,"PrinterStatus":3,"PortName":"PORTPROMPT:","CapabilityDescriptions":["Copies","Color"]},'
  + '{"Name":"Kat 2","Default":false,"WorkOffline":true,"PrinterStatus":7,"PortName":"WSD-1","CapabilityDescriptions":null}]';
esit('Win32_Printer: durumlar', yaziciDurumlariniCoz(WMI), {
  'Lazer Yazıcı': { cevrimDisi: false, ciftTarafli: true, dosyayaYazar: false, varsayilan: true },
  'Microsoft Print to PDF': { cevrimDisi: false, ciftTarafli: false, dosyayaYazar: true, varsayilan: false },
  'Kat 2': { cevrimDisi: true, ciftTarafli: false, dosyayaYazar: false, varsayilan: false },
});
esit('Win32_Printer: tek yazıcı (dizi değil)', Object.keys(yaziciDurumlariniCoz('{"Name":"Tek","CapabilityDescriptions":"Duplex"}')), ['Tek']);
esit('Win32_Printer: tek yeteneği metin olarak', yaziciDurumlariniCoz('{"Name":"Tek","CapabilityDescriptions":"Duplex"}').Tek.ciftTarafli, true);
esit('Win32_Printer: bozuk çıktı', yaziciDurumlariniCoz('<hata>'), {});
esit('Win32_Printer: boş çıktı', yaziciDurumlariniCoz(''), {});
esit('dosyaya yazan yazıcı adı', [dosyayaYazarMi('Microsoft Print to PDF'), dosyayaYazarMi('Microsoft XPS Document Writer'), dosyayaYazarMi('Lazer Yazıcı')], [true, true, false]);

// ---------------------------------------------------------------- hata iletileri
dogru('hata: Invalid deviceName → yazıcı bulunamadı', /^Yazıcı bulunamadı \(kaldırılmış ya da adı değişmiş olabilir\)/.test(nedenTurkce('Invalid deviceName provided')), nedenTurkce('Invalid deviceName provided'));
dogru('hata: yazıcı yok (Windows)', /Windows Ayarlar/.test(nedenTurkce('No printers available', 'win32')), '');
dogru('hata: yazıcı yok (macOS)', /Sistem Ayarları/.test(nedenTurkce('No printers available', 'darwin')), '');
dogru('hata: bilinmeyen ileti olduğu gibi', /yazıcı yanıtı: tuhaf/.test(nedenTurkce('tuhaf')), '');

// ---------------------------------------------------------------- isteğe bağlı: HTML dosyası
const [girdi, cikti, mod = 'sigdir'] = process.argv.slice(2);
if (girdi) {
  const sayfalar = JSON.parse(fs.readFileSync(girdi, 'utf8'));
  const { html, sayfaBoyutu, kagit } = yazdirmaHtmlOlustur(sayfalar, { olcek: mod, baslik: 'Deneme' });
  fs.writeFileSync(cikti, html, 'utf8');
  console.log('kâğıt:', kagit, 'boyut:', sayfaBoyutu, 'HTML:', (html.length / 1024 / 1024).toFixed(1), 'MB →', cikti);
}

console.log(hata ? `${hata} HATA (${tamam} geçti)` : `BÜTÜN TESTLER GEÇTİ (${tamam})`);
process.exit(hata ? 1 : 0);
