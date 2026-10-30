// Ana sürecin Linux yardımcılarının birim denemesi (0.3.1, src/main/linux.js ve pano.js'in Linux yarısı): Electron'suz, her sistemde koşar.
// Menü kaydının Exec kaçışları (boşluk, tırnak, $, %, ters bölü), kaydın metni, fc-match yanıtının okunması ve standart yazı tiplerinin
// seçimi (ölçüleri aynı eş, .ttf / .otf), sistem programlarının ortamı (AppImage'ın kitaplık klasörü çıkar), panoya konan türler, XFA
// formlarının yazı tipi benzerlerinde Linux eşleri (renderer/xfa.css).
// Kullanım (depo kökünden): node test/linux_birim.mjs      çıkış kodu: hata varsa 1
import fs from 'node:fs';
import { execArgumani, masaustuMetni, fcMatchCoz, standartaUygun, standartYaziTipleri, sistemOrtami } from '../src/main/linux.js';
import { linuxPanoOgesi, LINUX_PANO_TURLERI } from '../src/main/pano.js';

let hata = 0;
const kontrol = (ad, kosul, ek = '') => { if (!kosul) hata++; console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ek ? ' | ' + ek : ''}`); };
const J = (x) => JSON.stringify(x);

// ---- Exec kaçışı (freedesktop: tırnak içinde " ` $ \ kaçışlı, % ikilenir, sonra dize kaçışı \ → \\)
kontrol('Exec: boşluklu, Türkçe harfli yol tırnaklı', execArgumani('/home/ali veli/İndirilenler/PDEfe-Linux.AppImage') === '"/home/ali veli/İndirilenler/PDEfe-Linux.AppImage"');
kontrol('Exec: " ` $ kaçışlı (dize kaçışıyla iki ters bölü)', execArgumani('/a/"b"/`c`/$d') === '"/a/\\\\"b\\\\"/\\\\`c\\\\`/\\\\$d"', execArgumani('/a/"b"/`c`/$d'));
kontrol('Exec: % ikilenir', execArgumani('/a/%100.AppImage') === '"/a/%%100.AppImage"');
kontrol('Exec: ters bölü dört ters bölü olur', execArgumani('/a\\b') === '"/a\\\\\\\\b"', execArgumani('/a\\b'));
const metin = masaustuMetni('/home/a b/PDEfe-Linux.AppImage', '/home/a b/.local/share/icons/hicolor/512x512/apps/pdefe.png');
kontrol('kayıt: [Desktop Entry], Exec %F, TryExec, MimeType, Categories, PDEfe işareti', metin.startsWith('[Desktop Entry]\n')
  && metin.includes('\nExec="/home/a b/PDEfe-Linux.AppImage" %F\n') && metin.includes('\nTryExec=/home/a b/PDEfe-Linux.AppImage\n')
  && metin.includes('\nMimeType=application/pdf;\n') && metin.includes('\nCategories=Office;Viewer;\n') && metin.includes('\nX-PDEfe-Kaydi=1\n')
  && metin.includes('\nStartupWMClass=pdefe\n'), metin);
kontrol('kayıt: yolda satır sonu varsa satır bölünmez', !masaustuMetni('/a\nExec=/kotu', 'x').includes('\nExec=/kotu'));

// ---- fc-match ve standart yazı tipleri
const f = fcMatchCoz('/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf\nLiberation Serif\n200\n100\n');
kontrol('fc-match yanıtı', J(f) === J({ dosya: '/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf', aileler: ['liberation serif'], kalin: true, italik: true }), J(f));
kontrol('fc-match: boş yanıt null', fcMatchCoz('') === null && fcMatchCoz('\n\n\n\n') === null);
kontrol('standart: Times için Liberation Serif uygun, DejaVu Serif değil', standartaUygun('Times New Roman', f)
  && !standartaUygun('Times New Roman', { dosya: '/x/DejaVuSerif.ttf', aileler: ['dejavu serif'] }));
kontrol('standart: Nimbus Sans (.otf) Arial için uygun, Type 1 (.pfb) değil', standartaUygun('Arial', { dosya: '/x/NimbusSans-Regular.otf', aileler: ['nimbus sans'] })
  && !standartaUygun('Arial', { dosya: '/x/n019003l.pfb', aileler: ['nimbus sans l'] }));
const TABLO = {
  'Times New Roman': ['/f/LiberationSerif', 'Liberation Serif'], Arial: ['/f/LiberationSans', 'Liberation Sans'], 'Courier New': ['/f/DejaVuSansMono', 'DejaVu Sans Mono'],
};
const sahte = async (komut, args) => {
  const [aile, ...oz] = args.at(-1).split(':');
  const [dosya, ad] = TABLO[aile];
  const ek = (oz.includes('weight=bold') ? '-Bold' : '') + (oz.includes('slant=italic') ? '-Italic' : '');
  return { tamam: komut === 'fc-match', cikti: `${dosya}${ek}.ttf\n${ad}\n${oz.includes('weight=bold') ? 200 : 80}\n${oz.includes('slant=italic') ? 100 : 0}\n` };
};
const st = await standartYaziTipleri(sahte);
kontrol('standart yazı tipleri: Times ve Arial\'in dört yüzü bulunur, eşi olmayan Courier yok (PDF.js yedeği)', st['times.ttf'] === '/f/LiberationSerif.ttf'
  && st['timesbi.ttf'] === '/f/LiberationSerif-Bold-Italic.ttf' && st['arialbd.ttf'] === '/f/LiberationSans-Bold.ttf' && Object.keys(st).length === 8 && !st['cour.ttf'], J(st));
const yok = await standartYaziTipleri(async () => ({ tamam: false, cikti: '' }));
kontrol('standart yazı tipleri: fontconfig yoksa boş', J(yok) === '{}', J(yok));

// ---- sistem programlarının ortamı
const o = sistemOrtami({ LD_LIBRARY_PATH: '/tmp/.mount_PDEfe1/usr/lib:/opt/x/lib', APPDIR: '/tmp/.mount_PDEfe1', PATH: '/usr/bin' });
kontrol('ortam: AppImage\'ın kitaplık klasörü çıkar, öbürü ve PATH kalır', o.LD_LIBRARY_PATH === '/opt/x/lib' && o.PATH === '/usr/bin', J(o));
const o2 = sistemOrtami({ LD_LIBRARY_PATH: '/tmp/.mount_PDEfe1/usr/lib', APPDIR: '/tmp/.mount_PDEfe1/' });
kontrol('ortam: yalnız AppImage\'ınki varsa değişken kalkar', !('LD_LIBRARY_PATH' in o2), J(o2));
const o3 = sistemOrtami({ LD_LIBRARY_PATH: '/a' });
kontrol('ortam: AppImage dışında değişmez', o3.LD_LIBRARY_PATH === '/a');

// ---- pano
const p = linuxPanoOgesi('/home/ali veli/Belgeler/Dilekçe.pdf');
const adres = 'file:///home/ali%20veli/Belgeler/Dilek%C3%A7e.pdf';
const beklenen = process.platform === 'win32' ? null : adres;   // pathToFileURL Windows'ta sürücü harfi ekler
kontrol('pano: text/uri-list (CRLF), x-special/gnome-copied-files ("copy" ve adres), düz metin yol',
  p['text/plain'] === '/home/ali veli/Belgeler/Dilekçe.pdf' && /^file:\/\/\/.*Dilek%C3%A7e\.pdf\r\n$/.test(p[LINUX_PANO_TURLERI.uriList])
  && p[LINUX_PANO_TURLERI.gnome] === 'copy\n' + p[LINUX_PANO_TURLERI.uriList].trim() && (!beklenen || p[LINUX_PANO_TURLERI.uriList] === beklenen + '\r\n'), J(p));
kontrol('pano: türler Electron\'un ham tür adıyla', LINUX_PANO_TURLERI.gnome === 'electron application/osclipboard;format="x-special/gnome-copied-files"'
  && LINUX_PANO_TURLERI.uriList === 'electron application/osclipboard;format="text/uri-list"');

// ---- XFA formlarının yazı tipi benzerleri (0.3.1, src/renderer/xfa.css): local() tam adla arar, fontconfig'in Arial → Liberation Sans
// eşleştirmesine uğramaz. Linux'ta Arial ve Times New Roman yoksa ölçüleri aynı eşleri (Liberation, Arimo / Tinos), son çare DejaVu.
// Windows ve macOS'ta önce gelenler (formun yazı tipi, Segoe UI, Arial / Times New Roman) değişmedi
const css = fs.readFileSync(new URL('../src/renderer/xfa.css', import.meta.url), 'utf8');
const kurallar = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => ({
  aile: /font-family:\s*"([^"]+)"/.exec(m[1])?.[1], kalin: /font-weight:\s*700|font-family:\s*"[^"]*Bold"/.test(m[1]), italik: /font-style:\s*italic/.test(m[1]),
  adlar: [...m[1].matchAll(/local\("([^"]+)"\)/g)].map((x) => x[1]),
}));
const eslerYerinde = (k) => {
  const tirnakli = /Minion|Times/.test(k.aile);
  const ek = `${k.kalin ? ' Bold' : ''}${k.italik ? ' Italic' : ''}`;
  const temel = tirnakli ? 'Times New Roman' : 'Arial';
  const esler = tirnakli ? [`Liberation Serif${ek}`, k.kalin ? 'Tinos Bold' : 'Tinos'] : [`Liberation Sans${ek}`, `Arimo${ek || ''}`];
  const sonCare = tirnakli ? `DejaVu Serif${ek}` : `DejaVu Sans${k.kalin ? ' Bold' : ''}${k.italik ? ' Oblique' : ''}`;
  const i = k.adlar.indexOf(temel + ek);
  return i >= 0 && esler.every((e) => k.adlar.indexOf(e) > i) && k.adlar.at(-2) === sonCare;
};
kontrol('XFA yazı tipleri: 15 benzer kuralı (Calibri, Optima, Myriad Pro, Minion Pro, Turkish Times New Roman)', kurallar.length === 15, J(kurallar.map((k) => k.aile)));
kontrol('XFA yazı tipleri: her kuralda Arial / Times New Roman\'dan sonra Liberation ve Arimo / Tinos, en sonda DejaVu', kurallar.every(eslerYerinde),
  J(kurallar.filter((k) => !eslerYerinde(k)).map((k) => [k.aile, k.kalin, k.italik])));
kontrol('XFA yazı tipleri: Optima ve Myriad Pro\'da önce formun yazı tipi, sonra Segoe UI (Windows\'ta sıra değişmedi)', kurallar.filter((k) => /Optima|Myriad/.test(k.aile))
  .every((k) => k.adlar.findIndex((a) => /^Segoe ?UI/.test(a)) > 0 && k.adlar.findIndex((a) => /^Segoe ?UI/.test(a)) < k.adlar.findIndex((a) => /^Arial/.test(a))));

// ---- 0.3.1 inceleme: Panonun yedek programları (xclip, wl-copy) çatallanır, arka plandaki süreç çıktı akışlarını açık tutar. calistir'in
// execFile'ı akışların kapanmasını beklediği için her kopyalamada süre (5 sn) dolana dek bekliyordu. Sahte program: girdiyi dosyaya yazar, akışlarını
// devralan bir alt süreci arka planda bırakıp hemen çıkar (Node ile, her sistemde)
{
  const os = await import('node:os');
  const path = await import('node:path');
  const { calistir, calistirArkada } = await import('../src/main/linux.js');
  const klasor = fs.mkdtempSync(path.join(os.tmpdir(), 'pdefe-pano-'));
  const cikti = path.join(klasor, 'pano.txt');
  const betik = path.join(klasor, 'sahte-xclip.cjs');
  fs.writeFileSync(betik, [
    "const fs = require('fs'), { spawn } = require('child_process');",
    'let girdi = "";',
    "process.stdin.on('data', (p) => { girdi += p; });",
    "process.stdin.on('end', () => {",
    '  fs.writeFileSync(process.argv[2], girdi);',
    "  spawn(process.execPath, ['-e', 'setTimeout(() => {}, 4000)'], { stdio: 'inherit', detached: true }).unref();",
    '  process.exit(0);',
    '});',
  ].join('\n'));
  let t = Date.now();
  const yeni = await calistirArkada(process.execPath, [betik, cikti], { girdi: 'copy\nfile:///a.pdf', zaman: 3000 });
  const yeniSure = Date.now() - t;
  kontrol('Pano programı çatallanınca calistirArkada hemen döner, tamam, girdi verildi', yeni.tamam && yeniSure < 2000 && fs.readFileSync(cikti, 'utf8') === 'copy\nfile:///a.pdf', `${yeniSure} ms ${J(yeni)}`);
  t = Date.now();
  const eski = await calistir(process.execPath, [betik, cikti], { girdi: 'x', zaman: 3000 });
  // Ön süreç 0 ile çıktığı için execFile süre dolunca da başarı der: Kullanıcı her kopyalamada süre kadar bekliyordu
  kontrol('(karşılaştırma) calistir arka plandaki sürecin akışlarını süre dolana dek bekliyor', Date.now() - t >= 2500, `${Date.now() - t} ms ${J(eski)}`);
  const yok = await calistirArkada(path.join(klasor, 'olmayan-program'), [], { girdi: 'x', zaman: 3000 });
  kontrol('Olmayan program: tamam değil, fırlatmaz', !yok.tamam && !!yok.hata, J(yok));
  const kod = await calistirArkada(process.execPath, ['-e', 'process.exit(3)'], { zaman: 3000 });
  kontrol('Sıfırdan farklı çıkış kodu: tamam değil', !kod.tamam, J(kod));
  setTimeout(() => { try { fs.rmSync(klasor, { recursive: true, force: true }); } catch { /* arka plandaki sahte süreç */ } }, 100).unref();
}

console.log(hata ? `${hata} denetim başarısız.` : 'Bütün denetimler geçti.');
process.exit(hata ? 1 : 0);
