// macOS paket sınaması (0.2.0): CI'da (GitHub'ın Mac makinesinde) Uygulamalar'a kopyalanmış PDEfe.app'i Finder'daki gibi (open) başlatır;
// imzayı, paketi, Finder'dan PDF açmayı (open-file), sayfa çizimini, sistem yazı tiplerini, çekirdeği, yazı tanımayı, PDF'i kopyala'yı,
// gerçek klavyeyle Mac kısayollarını (System Events; izin yoksa atlanır) ve ⌘Q / Dock'tan çıkışı sınar. Ekran görüntüleri çıktı klasörüne.
// 0.3.1: Yazı notunun Türkçe harfleri (görünümden okunur), yeni özellikler (Linux'la ortak denetimler: test/duman_ortak.mjs; gerçek fare CGEvent'le, gerçek klavye System Events'le, Türkçe yazı CDP'yle: Sistem
// klavyesinde karşılığı olmayan harf System Events'le yazılamaz), sınama yazıcısına gerçek baskı (test/mac_sinama_hazirla.sh kurar, zorunlu değil), Finder'ın Hızlı Eylemleri: PDEfe açılınca kurulur, betik boşluklu ve
// Türkçe adlı dosyalarla açık PDEfe'ye ikinci süreçten verir, kapalıyken PDEfe'yi o araçla açar. Sonuçlar satır satır sonuc.txt'ye (süre aşılsa da kalır).
// Kullanım: node test/mac_duman.mjs <PDEfe.app> <örnek klasörü: not.pdf, taranmis.pdf, test/duman_ornekleri_uret.py'ninkiler> <çıktı klasörü>
// DUMAN_BOLUMLER: Yalnız bu bölümler (virgülle: duman_ortak.mjs'in bölümleri, "Gerçek baskı", "Hızlı Eylem"). PDEFE_BASKI_DOSYASI: Sınama yazıcısının yazdığı dosya.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pdfOlc, yeniOzellikleriSina } from './duman_ortak.mjs';
import { HIZLI_EYLEMLER, hizliEylemBetigi } from '../src/main/sagtik.js';

const [UYGULAMA, ORNEKLER, CIKTI] = process.argv.slice(2).map((p) => p && path.resolve(p));
if (!UYGULAMA || !ORNEKLER || !CIKTI) { console.error('Kullanım: node test/mac_duman.mjs <PDEfe.app> <örnekler> <çıktı>'); process.exit(2); }
process.on('uncaughtException', (e) => { console.error('HATA    beklenmeyen:', e?.stack || e); process.exit(1); });
fs.mkdirSync(CIKTI, { recursive: true });
const PORT = 9333;
const PORT_HIZLI = 9334;
const KIMLIK = 'com.cgrshn.pdefe';
const VERI = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pdefe-duman-')));   // os.tmpdir macOS'ta /var/..., bağlantı: Belge yolu karşılaştırmaları gerçek yolla
const PDF1 = fs.realpathSync(path.join(ORNEKLER, 'not.pdf'));
const TARANMIS = fs.realpathSync(path.join(ORNEKLER, 'taranmis.pdf'));
const KAYIT = path.join(VERI, 'kayit denemesi.pdf');   // boşluklu ad: yazı notu buna kaydedilir
fs.copyFileSync(PDF1, KAYIT);
const BOLUMLER = (process.env.DUMAN_BOLUMLER || '').split(',').map((s) => s.trim()).filter(Boolean);
const secildi = (ad) => !BOLUMLER.length || BOLUMLER.includes(ad);
const SONUC_DOSYASI = path.join(CIKTI, 'sonuc.txt');
fs.rmSync(SONUC_DOSYASI, { force: true });
const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
const satirlar = [];
let hata = 0;

function sonuc(ad, ok, ayrinti = '', zorunlu = true) {
  const durum = ok === null ? 'ATLANDI' : ok ? 'OK' : zorunlu ? 'HATA' : 'UYARI';
  if (ok === false && zorunlu) hata++;
  const satir = `${durum.padEnd(7)} ${ad}${ayrinti ? ' — ' + String(ayrinti).slice(0, 600) : ''}`;
  console.log(satir); satirlar.push(satir);
  fs.appendFileSync(SONUC_DOSYASI, satir + '\n');
}
function calistir(komut, args, secenek = {}) {
  const r = spawnSync(komut, args, { encoding: 'utf8', timeout: 60000, ...secenek });
  return { ok: r.status === 0, cikti: (r.stdout || '').trim(), hata: (r.stderr || '').trim(), kod: r.status };
}
const osascript = (...satir) => calistir('/usr/bin/osascript', satir.flatMap((s) => ['-e', s]));
async function kosul(f, sure = 20000, aralik = 250) {
  const son = Date.now() + sure;
  for (;;) { try { const v = await f(); if (v) return v; } catch { /* yeniden dene */ } if (Date.now() > son) return null; await bekle(aralik); }
}

// ---------------------------------------------------------------- CDP
let ws = null, sayac = 0;
const bekleyen = new Map();
async function baglan(port = PORT) {
  const hedef = await kosul(async () => {
    const liste = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    return liste.find((h) => h.type === 'page' && /^pdefe:\/\/app\/src\/renderer\/index\.html/.test(h.url));
  }, 90000, 500);
  if (!hedef) throw new Error('PDEfe penceresi CDP üzerinden bulunamadı.');
  ws = new WebSocket(hedef.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
}
function gonder(method, params = {}) {
  return new Promise((c) => {
    const id = ++sayac;
    const z = setTimeout(() => { bekleyen.delete(id); c({ error: { message: `${method} yanıt vermedi` } }); }, 150000);   // açık kalan yerel menü sınamayı sonsuza dek durdurmasın
    bekleyen.set(id, (d) => { clearTimeout(z); c(d); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function degerlendir(ifade) {
  const r = await gonder('Runtime.evaluate', { expression: ifade, awaitPromise: true, returnByValue: true });
  if (r.error) throw new Error(r.error.message);
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}
const cagir = (kanal, ...a) => degerlendir(`window.pdefe.cagir(${a.length ? [JSON.stringify(kanal), ...a.map((x) => JSON.stringify(x))].join(', ') : JSON.stringify(kanal)}).then((r) => JSON.stringify(r ?? null)).catch((e) => JSON.stringify({ istisna: e.message }))`).then((s) => JSON.parse(s));
async function ekranGoruntusu(ad) {
  try {
    const r = await gonder('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) fs.writeFileSync(path.join(CIKTI, ad), Buffer.from(r.result.data, 'base64'));
  } catch { /* yalnızca bilgi */ }
  calistir('/usr/sbin/screencapture', ['-x', path.join(CIKTI, 'ekran-' + ad)]);
}

// ---------------------------------------------------------------- 1) paket ve imza
{
  const imza = calistir('/usr/bin/codesign', ['-dv', '--verbose=2', UYGULAMA]);
  sonuc('yerinde (ad-hoc) imzalı', /Signature=adhoc/.test(imza.hata), imza.hata.split('\n').filter((s) => /Signature|Identifier|Format/.test(s)).join(' | '));
  const dogrula = calistir('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', UYGULAMA]);
  sonuc('imza bütün (codesign --verify --deep --strict)', dogrula.ok, dogrula.hata.split('\n').slice(-3).join(' | '));
  const mimari = calistir('/usr/bin/lipo', ['-archs', path.join(UYGULAMA, 'Contents/MacOS/PDEfe')]);
  sonuc('evrensel uygulama (x86_64 + arm64)', /x86_64/.test(mimari.cikti) && /arm64/.test(mimari.cikti), mimari.cikti);
  for (const m of ['arm64', 'x64']) {
    const cekirdek = path.join(UYGULAMA, `Contents/Resources/pdefe-core-${m}/pdefe-core`);
    const a = fs.existsSync(cekirdek) ? calistir('/usr/bin/lipo', ['-archs', cekirdek]).cikti : '';
    sonuc(`çekirdek ${m}`, a.includes(m === 'x64' ? 'x86_64' : 'arm64'), a || 'yok');
  }
  const belgeTurleri = calistir('/usr/bin/plutil', ['-extract', 'CFBundleDocumentTypes', 'json', '-o', '-', path.join(UYGULAMA, 'Contents/Info.plist')]);
  sonuc('PDF belge türü kayıtlı (Birlikte aç)', /"CFBundleTypeExtensions":\["pdf"\]/.test(belgeTurleri.cikti.replace(/\s/g, '')), belgeTurleri.cikti);
  // En düşük macOS (0.2.1): Electron 44 en az macOS 13 Ventura ister; Info.plist'teki değer daha düşükse macOS 12 uygulamayı açmaya
  // kalkar. Electron Framework'ün derlendiği en düşük sürüm (LC_BUILD_VERSION minos) de karşılaştırılır: Electron yükseltilince uyarır
  const enDusuk = calistir('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', path.join(UYGULAMA, 'Contents/Info.plist')]).cikti;
  const cerceve = path.join(UYGULAMA, 'Contents/Frameworks/Electron Framework.framework/Electron Framework');
  const minos = (calistir('/usr/bin/otool', ['-arch', 'arm64', '-l', cerceve]).cikti.match(/\bminos\s+(\d+(?:\.\d+)*)/) || [])[1] || '';
  const surumParcalari = (s) => s.split('.').map(Number).concat(0, 0).slice(0, 3);
  const enAzinda = (a, b) => { const x = surumParcalari(a), y = surumParcalari(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return true; };
  sonuc('en düşük macOS sürümü (LSMinimumSystemVersion) 13 ya da üstü', /^\d+(\.\d+)*$/.test(enDusuk) && enAzinda(enDusuk, '13.0'), enDusuk || 'yok');
  sonuc('en düşük macOS sürümü Electron Framework\'ünkinden düşük değil', minos ? /^\d+(\.\d+)*$/.test(enDusuk) && enAzinda(enDusuk, minos) : null,
    `Info.plist ${enDusuk || 'yok'} · Electron Framework ${minos || 'okunamadı'}`, false);
  const spctl = calistir('/usr/sbin/spctl', ['--assess', '--type', 'execute', '-vv', UYGULAMA]);
  sonuc('Gatekeeper değerlendirmesi (imzasız: ilk açılışta "Yine de Aç" gerekir)', null, (spctl.cikti + ' ' + spctl.hata).trim());
}

// ---------------------------------------------------------------- 2) Finder'daki gibi başlat, Finder'dan PDF aç
const acilis = Date.now();
const basla = calistir('/usr/bin/open', ['-a', UYGULAMA, '--args', `--remote-debugging-port=${PORT}`, `--user-data-dir=${VERI}`]);
sonuc('open -a ile başladı', basla.ok, basla.hata);
await baglan();
await kosul(() => degerlendir('!!window.__pdefe'), 30000);
sonuc('pencere açıldı', true, `${((Date.now() - acilis) / 1000).toFixed(1)} sn`);
await gonder('Runtime.enable');
const platform = await degerlendir('window.pdefe.platform + " / " + document.documentElement.dataset.platform');
sonuc('arayüz macOS kipinde', platform === 'darwin / mac', platform);

const ac = calistir('/usr/bin/open', ['-a', UYGULAMA, PDF1]);
const acildi = await kosul(() => degerlendir(`[...window.__pdefe.belgeler.values()].some((b) => b.yol === ${JSON.stringify(PDF1)})`), 30000);
sonuc('Finder\'dan açılan PDF (open-file) sekmede', !!acildi && ac.ok, ac.hata);
const surecler = calistir('/usr/bin/pgrep', ['-x', 'PDEfe']).cikti.split('\n').filter(Boolean);
sonuc('tek örnek (ikinci PDEfe açılmadı)', surecler.length === 1, surecler.join(','));

// ---------------------------------------------------------------- 3) sayfa çizimi ve sistem yazı tipleri
const murekkep = await kosul(() => degerlendir(`(() => {
  const t = [...document.querySelectorAll('canvas')].filter((c) => c.width > 200 && c.height > 200 && c.offsetParent).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!t) return 0;
  const k = document.createElement('canvas'); k.width = t.width; k.height = t.height;
  const x = k.getContext('2d'); x.drawImage(t, 0, 0);
  const d = x.getImageData(0, 0, k.width, k.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i] < 128 && d[i + 3] > 0) n++;
  return n;
})()`), 30000, 500);
sonuc('sayfa çizildi (koyu piksel var)', murekkep > 100, murekkep);
const yaziTipleri = await degerlendir(`window.pdefe.cagir('uygulama:klasorler').then((k) => k.yaziTipiDosyalari)`);
for (const ad of ['times.ttf', 'arialbd.ttf', 'cour.ttf']) {
  const yol = yaziTipleri?.[ad];
  const boyut = yol ? await degerlendir(`window.pdefe.cagir('dosya:oku', ${JSON.stringify(yol)}).then((r) => r.boyut).catch((e) => 'hata: ' + e.message)`) : 0;
  sonuc(`standart yazı tipi okunuyor: ${ad} → ${yol ? path.basename(yol) : '?'}`, typeof boyut === 'number' && boyut > 50000, boyut);
}
await ekranGoruntusu('belge.png');

// ---------------------------------------------------------------- 4) çekirdek ve yazı tanıma
const ping = await degerlendir(`window.pdefe.cagir('cekirdek:cagir', 'ping', {}).then((r) => JSON.stringify(r)).catch((e) => 'hata: ' + e.message)`);
sonuc('çekirdek yanıt veriyor', /"ok":true/.test(ping), ping);
// Evrensel uygulama: Bu makinenin mimarisinde açıldı (mac-sina: Intel ve Apple işlemcili), çekirdek de aynı mimarinin klasöründen
const cekirdekSureci = calistir('/bin/ps', ['-axo', 'command']).cikti.split('\n').filter((s) => /pdefe-core-(arm64|x64)\/pdefe-core/.test(s));
sonuc(`evrensel uygulama bu makinenin mimarisinde (${os.arch()}): çekirdek pdefe-core-${os.arch()}`, cekirdekSureci.length >= 1 && cekirdekSureci.every((s) => s.includes(`pdefe-core-${os.arch()}/`)), cekirdekSureci.join(' | '));
const ocr = await degerlendir(`window.pdefe.cagir('cekirdek:cagir', 'ocr_sayfa', { yol: ${JSON.stringify(TARANMIS)}, sayfa: 1 }).then((r) => JSON.stringify(r)).catch((e) => 'hata: ' + e.message)`);
let taninan = '';
try { const r = JSON.parse(ocr); taninan = (r.satirlar || []).map((s) => s.map((w) => w[0]).join(' ')).join(' / '); if (r.desteklenmiyor) taninan = 'desteklenmiyor'; } catch { taninan = ocr; }
const beklenenler = ['DENEME', 'Borçlu', 'müzekkere', 'yazılmıştır', 'Şirketin', 'görülmüştür', 'İstanbul,', 'Müdür'];
const bulunan = beklenenler.filter((s) => taninan.normalize('NFC').includes(s.normalize('NFC')));
sonuc('paketli çekirdekte yazı tanıma', taninan.length > 40 && taninan !== 'desteklenmiyor', taninan);
sonuc(`Türkçe tanıma (${bulunan.length}/${beklenenler.length} sözcük)`, bulunan.length >= 6, `bulunamayan: ${beklenenler.filter((s) => !bulunan.includes(s)).join(', ')}`, false);

// ---------------------------------------------------------------- 5) PDF'i kopyala (panoya dosya)
// Finder'ın yapıştırdığı türler: public.file-url ve NSFilenamesPboardType. Pano AppKit'ten okunur (JavaScript for Automation; izin istemez).
// Üç kez (araya başka bir metin kopyalanarak): yazan süreç kapandıktan sonra pano boş kalmamalı (0.2.0 yayım derlemesinde bir kez kalmıştı)
for (let deneme = 1; deneme <= 3; deneme++) {
  calistir('/usr/bin/osascript', ['-e', 'set the clipboard to "araya giren metin"']);
  const pano = await degerlendir(`window.pdefe.cagir('pano:dosya', ${JSON.stringify(PDF1)}).then((r) => JSON.stringify(r))`);
  await bekle(300);
  const panodaki = calistir('/usr/bin/osascript', ['-l', 'JavaScript', '-e', [
    "ObjC.import('AppKit');",
    'var p = $.NSPasteboard.generalPasteboard;',
    "JSON.stringify({ turler: ObjC.deepUnwrap(p.types), url: ObjC.unwrap(p.stringForType('public.file-url')), yollar: ObjC.deepUnwrap(p.propertyListForType('NSFilenamesPboardType')) })",
  ].join('\n')]);
  let panoYolu = '', yollar = [];
  try { const j = JSON.parse(panodaki.cikti); panoYolu = fs.realpathSync(decodeURIComponent(new URL(j.url).pathname)); yollar = j.yollar || []; } catch { /* panoda dosya yok */ }
  sonuc(`PDF'i kopyala: dosya panoda (Finder'da ⌘V ile yapıştırılır), deneme ${deneme}`, /"tamam":true/.test(pano) && panoYolu === PDF1 && yollar.length === 1,
    `${pano} → ${panodaki.cikti || panodaki.hata}`);
}

// ---------------------------------------------------------------- 6) gerçek klavye: Mac kısayolları (menü ve sayfa)
const tus = (karakter, ...degistirici) => osascript(`tell application "System Events" to keystroke "${karakter}"${degistirici.length ? ` using {${degistirici.map((d) => d + ' down').join(', ')}}` : ''}`);
const tusKodu = (kod, ...degistirici) => osascript(`tell application "System Events" to key code ${kod}${degistirici.length ? ` using {${degistirici.map((d) => d + ' down').join(', ')}}` : ''}`);
calistir('/usr/bin/open', ['-a', UYGULAMA]);   // öne getir (AppleScript izni gerektirmez)
await bekle(1500);
const deneme = tus('f', 'command');
if (!deneme.ok) {
  sonuc('klavye kısayolları (System Events izni yok)', null, deneme.hata);
} else {
  sonuc('⌘F Bul\'u açar', !!(await kosul(() => degerlendir('window.__pdefe.arama.acik && document.activeElement?.id === "bul-girdi"'), 5000)));
  tus('Satir');
  await bekle(800);
  sonuc('Bul kutusuna yazıldı', (await degerlendir('document.querySelector("#bul-girdi").value')) === 'Satir');
  tus('a', 'command');
  await bekle(400);
  sonuc('⌘A girdi kutusunun metnini seçer (menü → kutu)', await degerlendir('(() => { const g = document.querySelector("#bul-girdi"); return g.selectionStart === 0 && g.selectionEnd === g.value.length && g.value.length > 0; })()'));
  tusKodu(51);   // sil (⌫)
  await bekle(300);
  tus('z', 'command');
  await bekle(600);
  sonuc('⌘Z girdi kutusunda geri alır (menü → kutu)', (await degerlendir('document.querySelector("#bul-girdi").value')) === 'Satir', await degerlendir('document.querySelector("#bul-girdi").value'));
  tusKodu(53);   // Esc
  await bekle(500);
  sonuc('Esc Bul\'u kapatır', await degerlendir('!window.__pdefe.arama.acik'));
  const sekme0 = await degerlendir('window.__pdefe.sekmeler.sekmeler.length');
  tus('t', 'command');
  const sekme1 = await kosul(async () => { const n = await degerlendir('window.__pdefe.sekmeler.sekmeler.length'); return n > sekme0 ? n : 0; }, 5000);
  sonuc('⌘T yeni sekme', !!sekme1, `${sekme0} → ${sekme1}`);
  tus('w', 'command');
  const sekme2 = await kosul(async () => { const n = await degerlendir('window.__pdefe.sekmeler.sekmeler.length'); return n === sekme0 ? n : 0; }, 5000);
  sonuc('⌘W sekmeyi kapatır', !!sekme2, `→ ${sekme2}`);
  await degerlendir('document.activeElement?.blur?.(); window.__pdefe.aktif()?.gorunum.kaydirici.focus(); true');
  tus('a', 'command');
  await bekle(500);
  // 0.2.6: ⌘A belgenin bütün sayfalarını seçer; tarayıcı seçimi geçerli sayfanın metnidir (çapa; tumSecim.js)
  const secim = await degerlendir('({ uzunluk: window.getSelection().toString().length, tum: !!window.__pdefe.tumSecim?.gecerli() })');
  sonuc('⌘A belgenin bütün sayfalarını seçer (çapa: geçerli sayfanın metni)', secim?.uzunluk > 50 && secim?.tum, JSON.stringify(secim));
  const olcek0 = await degerlendir('window.__pdefe.aktif().gorunum.olcek');
  tus('0', 'command');   // gerçek boyut (menü)
  await bekle(800);
  const olcek1 = await degerlendir('window.__pdefe.aktif().gorunum.olcek');
  sonuc('⌘0 gerçek boyut (menü kısayolu)', Math.abs(olcek1 - 1) < 0.01 || olcek0 === 1, `${olcek0} → ${olcek1}`, false);
  await ekranGoruntusu('kisayollar.png');
}

// ---------------------------------------------------------------- 6b) Türkçe yazı notu, kaydet (sistemin yazı tipi gömülür)
const METIN = 'Şişli İcra Dairesi: ığüşöç İĞÜŞÖÇ';
const kayit = await degerlendir(`(async () => {
  await window.__pdefe.dosyaAc(${JSON.stringify(KAYIT)});
  const b = await (async () => { for (let i = 0; i < 100; i++) { const x = [...window.__pdefe.belgeler.values()].find((y) => y.yol === ${JSON.stringify(KAYIT)}); if (x?.notlar && x.gorunum?.sayfalar?.length) return x; await new Promise((c) => setTimeout(c, 100)); } return null; })();
  if (!b) return { hata: 'belge açılmadı' };
  b.notlar.ekle({ tur: 'FreeText', sayfa: 1, rect: [72, 640, 420, 680], icerik: ${JSON.stringify(METIN)}, yazar: 'Deneme Yazar', renk: null, opaklik: 1,
    yazi: { ...b.notlar.varsayilanYazi(), donus: 0 }, konu: 'Yazı' });
  const tip = b.notlar.varsayilanYazi().tip;
  const sonuc = await window.__pdefe.belgeKaydet(b);
  return { sonuc, tip, degisti: b.degisti };
})()`).catch((e) => ({ hata: e.message }));
const notlar = await cagir('cekirdek:cagir', 'notlar', { yol: KAYIT });
const yazi = (notlar?.notlar || notlar || []).find?.((n) => n.tur === 'FreeText');
sonuc('yazı notu (varsayılan Arial) kaydedildi, Türkçe metin dosyada', kayit?.tip === 'Arial' && kayit?.degisti === false && yazi?.icerik === METIN, JSON.stringify({ kayit, yazi: yazi?.icerik }));
// Notun görünümü: Sayfa metninde yok (çekirdeğin sayfa_metni yalnız sayfa içeriğini okur). Görünümden PyMuPDF'le okunur (linux_cekirdek_testi.py B bölümü gibi), görüntüsü çıktıda
const gorunum = pdfOlc('not', KAYIT, path.join(CIKTI, 'not-kayitli'));
const notG = gorunum.notlar.find((n) => n.icerik === METIN);
sonuc('notun görünümünde Türkçe harfler (gömülü yazı tipi, görünümden okundu)', String(notG?.gorunum || '').normalize('NFC').includes(METIN.normalize('NFC')), JSON.stringify(gorunum.notlar));
sonuc('notun görünümünün yazı tipi Arial', (notG?.fontlar || []).some((f) => /Arial/i.test(f)), JSON.stringify(notG?.fontlar));
await ekranGoruntusu('not.png');

// ---------------------------------------------------------------- 6c) 0.3.1'in yeni özellikleri (Linux'la ortak denetimler: test/duman_ortak.mjs)
// Tuş kodları: Tab 48, Return 36, ok tuşları, Esc 53, sil (ileri) 117, sil (geri) 51
const TUS = { Tab: 48, Return: 36, Down: 125, Up: 126, Escape: 53, Delete: 117, BackSpace: 51 };
const odakla = async (ms = 400) => { calistir('/usr/bin/open', ['-a', UYGULAMA]); await bekle(ms); };
const FARE = { left: [1, 2, 0], right: [3, 4, 1] };   // kCGEvent...MouseDown, ...MouseUp, kCGMouseButton...
/** Gerçek fare: CGEvent (JavaScript for Automation, osascript). Hareket (5), bas, bırak. Tıklama sayısı (kCGMouseEventClickState: 1) verilmezse tarayıcı click olayı üretmez. */
const fareGonder = (x, y, dugme = 'left') => {
  const [bas, birak, no] = FARE[dugme];
  return calistir('/usr/bin/osascript', ['-l', 'JavaScript', '-e', [
    "ObjC.import('CoreGraphics');",
    `var p = { x: ${x}, y: ${y} };`,
    'function olay(tur, dugme) { var e = $.CGEventCreateMouseEvent(null, tur, p, dugme); $.CGEventSetIntegerValueField(e, 1, 1); $.CGEventPost(0, e); }',
    'olay(5, 0);', 'delay(0.05);', `olay(${bas}, ${no});`, 'delay(0.05);', `olay(${birak}, ${no});`, "'tamam';",
  ].join('\n')]);
};
const fareTasi = (x, y) => calistir('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `ObjC.import('CoreGraphics'); $.CGEventPost(0, $.CGEventCreateMouseEvent(null, 5, { x: ${x}, y: ${y} }, 0)); 'tamam';`]);
const pencereKonumu = () => degerlendir('({ sx: screenX, sy: screenY, gi: innerWidth, yi: innerHeight, yd: outerHeight, eg: screen.width, ey: screen.height, o: devicePixelRatio })');
/** Gerçek fare çalışıyor mu (izin, koordinat): Sayfaya gerçek bir tıklama, sayfanın gördüğü noktadan ekran ile sayfa arasındaki fark. Çalışmıyorsa tıklamalar CDP'yle sürer. */
async function fareyiDene() {
  await odakla(800);
  await degerlendir(`(window.__fareIzi = null, addEventListener('mousedown', (e) => { window.__fareIzi = { x: e.clientX, y: e.clientY }; }, { capture: true, once: true }), true)`);
  const h = await pencereKonumu();
  const x = Math.round(h.gi / 2), y = Math.round(h.yi / 2);
  const r = fareGonder(h.sx + x, h.sy + (h.yd - h.yi) + y);
  const iz = await kosul(() => degerlendir('window.__fareIzi'), 3000, 100);
  if (!iz) return { neden: r.hata || 'sayfaya olay gelmedi', h };
  return { dx: x - iz.x, dy: y - iz.y, h };
}
const fare = await fareyiDene();
sonuc('gerçek fare (CGEvent, olmazsa tıklamalar CDP\'yle sürer)', fare.neden ? null : true, JSON.stringify(fare));
const klavyeVar = deneme.ok;
sonuc('gerçek klavye (System Events, olmazsa tuşlar CDP\'yle sürer)', klavyeVar ? true : null, deneme.hata);
const tirnakla = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const gercekGirdi = {
  ...(klavyeVar ? {
    gercekTus: async (...tuslar) => { for (const t of tuslar) tusKodu(TUS[t]); await bekle(120); },
    gercekTekrar: async (t, kez) => { osascript('tell application "System Events"', `repeat ${kez} times`, `key code ${TUS[t]}`, 'delay 0.03', 'end repeat', 'end tell'); await bekle(120); },
    gercekYazLatin: async (metin) => { calistir('/usr/bin/osascript', ['-e', `tell application "System Events" to keystroke "${tirnakla(metin.slice(0, 400))}"`], { timeout: 150000 }); await bekle(200); },
    kisayol: async (harf, { shift = false } = {}) => { tus(harf, 'command', ...(shift ? ['shift'] : [])); await bekle(200); },
    menuTus: async (...tuslar) => { for (const t of tuslar) { tusKodu(TUS[t]); await bekle(150); } },
    gercekOdak: () => odakla(),
  } : {}),
  ...(fare.neden ? {} : {
    gercekTikla: async (x, y, { dugme = 'left' } = {}) => {
      const h = await pencereKonumu();
      const px = Math.round(h.sx + x + fare.dx), py = Math.round(h.sy + (h.yd - h.yi) + y + fare.dy);
      if (px < 1 || py < 1 || px >= h.eg - 1 || py >= h.ey - 1) return false;   // pencere ekrandan büyük: Bu tıklama CDP'yle
      if (!fareGonder(px, py, dugme).ok) return false;
      await bekle(120);
      // Menü imlecin altında açılır, ilk öğe fareyle seçili görünür (görüntü: menu-kok.png): Ok tuşu ondan sonrakine geçerdi. İmleç çekilince ok tuşu ilk açık öğeden başlar (Linux'taki gibi)
      if (dugme === 'right') { await bekle(450); fareTasi(h.sx + 4, h.sy + 4); await bekle(100); }
      return true;
    },
  }),
};
await yeniOzellikleriSina({
  sonuc, kosul, bekle, degerlendir, gonder, cagir, ekranGoruntusu, ORNEKLER, CIKTI, VERI, platform: 'darwin', port: PORT, sonBelge: KAYIT, bolumler: BOLUMLER, ...gercekGirdi,
  ekranKok: (ad) => calistir('/usr/sbin/screencapture', ['-x', path.join(CIKTI, ad)]),
  formYazisi: 'Arial',
  duzYazisi: 'Arial|Times|Optima',
  // Optima macOS'ta var, kendisi çizilir (xfa.css). Calibri ve Myriad Pro yok (Office ya da Creative Cloud kuruluysa kendileri, sınama makinesinde yok), Minion Pro yok
  yaziTipleri: { Calibri: /^(Calibri|Arial)$/, Optima: /^Optima$/, 'Myriad Pro': /^Arial$/, 'Minion Pro': /^Times New Roman$/, 'Turkish Times New Roman': /^Times New Roman$/ },
});
await degerlendir('document.activeElement?.blur?.(); true').catch(() => {});
await ekranGoruntusu('ozellikler-son.png');

// ---------------------------------------------------------------- 6d) gerçek baskı: Sınama yazıcısı dosyaya yazar (test/mac_sinama_hazirla.sh; kurulamadıysa atlanır). Sessiz yazdırmanın, yazıcı listesinin ve kâğıdın gerçek Mac'teki ilk denemesi (zorunlu değil)
// Çıktı Genel PostScript sürücüsünden: Kâğıt ve sayfa sayısı PostScript'in başlığından. Süzgeçsiz kuyruk olmaz: Electron'un deviceName doğrulaması onu reddeder, cupsGetNamedDest bulsa da (ölçüldü: "Invalid deviceName")
const BASKI = process.env.PDEFE_BASKI_DOSYASI;
function psOlc(yol) {
  const metin = fs.readFileSync(yol, 'latin1');
  const k = /^%%(?:PageBoundingBox|BoundingBox|HiResBoundingBox):\s*0(?:\.0+)? 0(?:\.0+)? (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/m.exec(metin) || /^%%DocumentMedia:\s*\S+ (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/m.exec(metin) || /\/PageSize\s*\[\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\]/.exec(metin);
  return { sayfa: (metin.match(/^%%Page: /gm) || []).length, g: k ? +k[1] : 0, b: k ? +k[2] : 0, bas: metin.slice(0, 60).replace(/\s+/g, ' '), baslik: (metin.match(/^%%(?:Pages|BoundingBox|PageBoundingBox|DocumentMedia):.*$/gm) || []).slice(0, 6).join(' | ') };
}
if (secildi('Gerçek baskı')) {
  if (!BASKI) sonuc('Gerçek baskı', null, 'sınama yazıcısı kurulamadı');
  else {
    const baskiDene = async (ad, ornek, sayfaBeklenen) => {
      const y = path.join(VERI, `baski-${ornek}`);
      fs.copyFileSync(path.join(ORNEKLER, ornek), y);
      await degerlendir(`window.__pdefe.dosyaAc(${JSON.stringify(y)}).then(() => true)`);
      await bekle(1200);
      await degerlendir(`(window.__pdefe.komutCalistir('dosya.yazdir'), true)`);
      const hazir = await kosul(() => degerlendir(`(() => { const d = document.querySelector('.yazdir-diyalog'), r = d?.querySelector('.yazdir-onizleme-sayfa'); return d && r?.naturalWidth > 0 && d.querySelector('[name=yazici]').options.length > 0 && !d.querySelector('[data-id=yazdir]').disabled ? { yazici: d.querySelector('[name=yazici]').value, kagit: d.querySelector('[name=kagit]').value } : null; })()`), 20000);
      sonuc(`Gerçek baskı ${ad}: Yazıcı listede, Yazdır etkin`, !!hazir, JSON.stringify(hazir), false);
      if (!hazir) { await degerlendir(`document.querySelector('.yazdir-diyalog [data-id=iptal]')?.click(), true`); return; }
      await ekranGoruntusu(`baski-${ad}-pencere.png`);
      fs.rmSync(BASKI, { force: true });
      await degerlendir(`document.querySelector('.yazdir-diyalog [data-id=yazdir]').click(), true`);
      const kutuMetni = () => degerlendir(`document.querySelector('.mesaj-kutusu')?.textContent || ''`);
      const geldi = await kosul(async () => (fs.existsSync(BASKI) && fs.statSync(BASKI).size > 0) || (await kutuMetni()), 60000, 1000);
      await bekle(2500);
      const kuyruk = calistir('/usr/bin/lpstat', ['-W', 'all', '-o']).cikti.split('\n').slice(-3).join(' | ');
      const kutu = await kutuMetni();
      if (kutu) {
        await ekranGoruntusu(`baski-${ad}-hata.png`);
        await degerlendir(`document.querySelector('.mesaj-kutusu button')?.click(), true`);
      }
      if (!geldi || kutu) { sonuc(`Gerçek baskı ${ad}: Yazıcıya ulaştı`, false, `${String(kutu || 'dosya yok').replace(/\s+/g, ' ')} · kuyruk: ${kuyruk}`, false); return; }
      const kopya = path.join(CIKTI, `baski-${ad}.ps`);
      fs.copyFileSync(BASKI, kopya);
      const s = psOlc(kopya);
      sonuc(`Gerçek baskı ${ad}: ${sayfaBeklenen} sayfa A4 (595 × 842 pt)`, s.sayfa === sayfaBeklenen && Math.abs(s.g - 595) <= 3 && Math.abs(s.b - 842) <= 3, JSON.stringify(s), false);
    };
    try {
      sonuc('Gerçek baskı: Yazıcı listesi (bilgi)', null, JSON.stringify(await cagir('yazdir:yazicilar')));
      await baskiDene('a5', 'a5.pdf', 1);
      await kosul(() => degerlendir(`!document.querySelector('.yazdir-ortusu')`), 15000);
      await baskiDene('xfa', 'xfa.pdf', 1);
      const kalan = await kosul(() => degerlendir(`!document.querySelector('.yazdir-ortusu')`), 15000);
      sonuc('Gerçek baskı: Yazdırma penceresi kapandı', !!kalan, '', false);
      if (!kalan) await degerlendir(`document.querySelector('.yazdir-diyalog [data-id=iptal]')?.click(), true`);
    } catch (e) { sonuc('Gerçek baskı: Sınama yarıda kesildi', false, e.message, false); }
    await degerlendir(`(async () => { for (const b of [...window.__pdefe.belgeler.values()]) if (b.yol.includes('/baski-')) await window.__pdefe.belgeKapat(b.id, { zorla: true }); return true; })()`).catch(() => {});
  }
}

// ---------------------------------------------------------------- 7) çıkış: Dock'tan / ⌘Q gibi (uygulamaya çıkış isteği)
// Dock'tan Çık ve ⌘Q uygulamaya çıkış isteği (quit Apple olayı) gönderir. AppleScript'in uygulamayı yönetme izni yoksa aynı çıkış yolu
// (before-quit → pencereler sırayla kapanır) SIGTERM ile denenir
const kapat = osascript(`tell application id "${KIMLIK}" to quit`);
let cikisYolu = 'quit olayı';
if (!kapat.ok) { cikisYolu = 'SIGTERM (AppleScript izni yok: ' + kapat.hata.slice(0, 80) + ')'; calistir('/usr/bin/pkill', ['-TERM', '-x', 'PDEfe']); }
const pdefeKapandi = (sure = 20000) => kosul(() => !calistir('/usr/bin/pgrep', ['-x', 'PDEfe']).ok, sure, 500);
const kapandi = await pdefeKapandi();
sonuc('çıkış isteğiyle kapandı (kaydedilmemiş belge yok)', !!kapandi, cikisYolu);
try { ws?.close(); } catch { /* kapandı */ }
if (!kapandi) { await ekranGoruntusu('cikis-kapanmadi.png'); calistir('/usr/bin/pkill', ['-KILL', '-x', 'PDEfe']); await pdefeKapandi(5000); }
sonuc('çekirdek de kapandı (artık süreç yok)', !!(await kosul(() => !calistir('/usr/bin/pgrep', ['-f', 'pdefe-core-(arm64|x64)/pdefe-core']).ok, 10000, 500)));

// ---------------------------------------------------------------- 8) Finder'ın Hızlı Eylemleri: PDEfe'nin kurduğu paketler, gerçek betik, ikinci süreç (src/main/sagtik.js)
// Tek örnek kilidi veri klasörüne bağlı: Hızlı Eylem PDEfe'yi --user-data-dir'siz başlatır. Bu bölümde PDEfe de varsayılan veri klasörüyle açılır, gerçekteki gibi
if (secildi('Hızlı Eylem')) {
  const servisler = path.join(os.homedir(), 'Library', 'Services');
  sonuc('Hızlı Eylem: Başka veri klasörlü örnek kurmadı (sınama örneği dokunmaz)', !HIZLI_EYLEMLER.some((e) => fs.existsSync(path.join(servisler, `${e.ad}.workflow`))));
  const basla2 = calistir('/usr/bin/open', ['-a', UYGULAMA, '--args', `--remote-debugging-port=${PORT_HIZLI}`]);
  sonuc('Hızlı Eylem: PDEfe varsayılan veri klasörüyle açıldı', basla2.ok, basla2.hata);
  await baglan(PORT_HIZLI);
  await kosul(() => degerlendir('!!window.__pdefe'), 30000);
  await gonder('Runtime.enable');
  const betikler = {};
  for (const e of HIZLI_EYLEMLER) {
    const k = path.join(servisler, `${e.ad}.workflow`, 'Contents');
    // PDEfe pencere göründükten 8 sn sonra kurar (anaSurec.js sagTikBakimi)
    sonuc(`Hızlı Eylem ${e.ad}: PDEfe açılınca ~/Library/Services'e kuruldu`, !!(await kosul(() => fs.existsSync(path.join(k, 'document.wflow')) && fs.existsSync(path.join(k, 'Info.plist')), 30000, 500)), k);
    const lint = calistir('/usr/bin/plutil', ['-lint', path.join(k, 'Info.plist'), path.join(k, 'document.wflow')]);
    sonuc(`Hızlı Eylem ${e.ad}: plist geçerli (plutil -lint)`, lint.ok, lint.cikti + lint.hata);
    const betik = calistir('/usr/bin/plutil', ['-extract', 'actions.0.action.ActionParameters.COMMAND_STRING', 'raw', '-o', '-', path.join(k, 'document.wflow')]);
    betikler[e.anahtar] = betik.cikti;
    sonuc(`Hızlı Eylem ${e.ad}: Betik bu uygulamanın yolunu taşıyor`, betik.ok && betik.cikti.trim() === hizliEylemBetigi(e, UYGULAMA).trim(), betik.hata || betik.cikti.split('\n')[1]);
  }
  const hizmetler = calistir('/System/Library/CoreServices/pbs', ['-dump_pboard']).cikti;
  sonuc('Hızlı Eylem: Hizmetler listesinde ikisi de (bilgi: Liste gecikmeli yenilenebilir)', HIZLI_EYLEMLER.every((e) => hizmetler.includes(e.ad)) ? true : null, HIZLI_EYLEMLER.filter((e) => hizmetler.includes(e.ad)).map((e) => e.ad).join(', ') || 'görünmedi');

  const k = path.join(VERI, 'Deneme Klasörü ğ');
  fs.mkdirSync(k, { recursive: true });
  const dosya = (ad) => { const y = path.join(k, ad); fs.copyFileSync(PDF1, y); return y; };
  // Boşluk, Türkçe harf, tırnak, &, $ ve Finder'ın verdiği ayrışık (NFD) ad. Uygunsuz tür atlanır
  const a = dosya('Dilekçe örneği ş.pdf'), b = dosya("Ali'nin & $HOME belgesi İĞ.pdf"), c = dosya('Çıktı ğüş.pdf'.normalize('NFD'));
  const uygunsuz = path.join(k, 'not.txt');
  fs.writeFileSync(uygunsuz, 'x');
  const betikCalistir = (anahtar, dosyalar, sure = 30000) => spawnSync('/bin/sh', ['-c', betikler[anahtar], 'sh', ...dosyalar], { encoding: 'utf8', timeout: sure });
  const adlar = (l) => l.map((y) => path.basename(y).normalize('NFC'));
  const liste = (sinif) => degerlendir(`[...document.querySelectorAll('.${sinif}-oge .ad')].map((e) => e.textContent.normalize('NFC'))`);
  const araclariKapat = () => degerlendir(`(async () => { window.__pdefeOtoYanit = { secim: 1 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); } finally { delete window.__pdefeOtoYanit; } return true; })()`);
  const surecSayisi = () => calistir('/usr/bin/pgrep', ['-x', 'PDEfe']).cikti.split('\n').filter(Boolean).length;
  const tekSurec = () => kosul(() => surecSayisi() === 1, 15000, 500);

  await bekle(1500);
  const sekme0 = await degerlendir('window.__pdefe.belgeler.size');

  // Açık PDEfe: Yeni süreç dosyaları ona verip çıkar
  let r = betikCalistir('--donustur', [a, uygunsuz, b, c]);
  sonuc('Hızlı Eylem dönüştür: Betik çalıştı', r.status === 0, `${r.status} ${r.stderr || ''}`);
  let gelen = await kosul(async () => { const l = await liste('donustur'); return l.length >= 3 ? l : null; }, 30000, 300);
  sonuc('Hızlı Eylem dönüştür: Format Değiştir boşluklu ve Türkçe adlı dosyalarla, sırayla açıldı, uygunsuz tür atlandı', JSON.stringify(gelen) === JSON.stringify(adlar([a, b, c])), JSON.stringify(gelen));
  sonuc('Hızlı Eylem dönüştür: İkinci süreç çıktı, tek örnek', !!(await tekSurec()), `${surecSayisi()} süreç`);
  sonuc('Hızlı Eylem dönüştür: Dosyalar sekmede açılmadı', (await degerlendir('window.__pdefe.belgeler.size')) === sekme0);
  await ekranGoruntusu('hizli-donustur.png');
  await araclariKapat();
  await bekle(500);
  r = betikCalistir('--birlestir', [c, a]);
  gelen = await kosul(async () => { const l = await liste('birlestir'); return l.length >= 2 ? l : null; }, 30000, 300);
  sonuc('Hızlı Eylem birleştir: Birleştir dosyalarla, seçim sırasıyla açıldı', r.status === 0 && JSON.stringify(gelen) === JSON.stringify(adlar([c, a])), JSON.stringify(gelen));
  sonuc('Hızlı Eylem birleştir: Tek örnek', !!(await tekSurec()), `${surecSayisi()} süreç`);
  await ekranGoruntusu('hizli-birlestir.png');
  await araclariKapat();
  await bekle(500);
  r = betikCalistir('--birlestir', [uygunsuz], 6000);   // ileti kutusu yanıt bekler
  calistir('/usr/sbin/screencapture', ['-x', path.join(CIKTI, 'hizli-uygunsuz.png')]);
  const ileti = calistir('/usr/bin/pgrep', ['-f', 'osascript.*display alert']).cikti;
  sonuc('Hızlı Eylem: Uygun dosya yoksa PDEfe\'ye bir şey gitmez', (await liste('birlestir')).length === 0, `betik ${r.status ?? 'sürdü (ileti kutusu bekliyor)'} · ${ileti ? 'ileti kutusu açık' : 'ileti kutusu yok'}`);
  calistir('/usr/bin/pkill', ['-f', 'osascript.*display alert']);

  // Automator'ın kendisi iş akışını çalıştırıyor mu (Finder'ın menüsü de bunu çağırır). Girdi metin olarak gidebilir: Sonucu zorunlu değil
  const paket = path.join(servisler, `${HIZLI_EYLEMLER.find((e) => e.anahtar === '--donustur').ad}.workflow`);
  const oto = spawnSync('/usr/bin/automator', ['-i', a, paket], { encoding: 'utf8', timeout: 60000 });
  gelen = await kosul(async () => { const l = await liste('donustur'); return l.length ? l : null; }, 15000, 300);
  sonuc('Hızlı Eylem: Automator iş akışını çalıştırdı, dosya araçta (bilgi)', JSON.stringify(gelen) === JSON.stringify(adlar([a])) ? true : null, `automator ${oto.status} ${(oto.stderr || '').slice(0, 200)} · ${JSON.stringify(gelen)}`);
  await araclariKapat();
  await bekle(300);
  await degerlendir(`document.activeElement?.blur?.(); true`);
  const kapat2 = osascript(`tell application id "${KIMLIK}" to quit`);
  if (!kapat2.ok) calistir('/usr/bin/pkill', ['-TERM', '-x', 'PDEfe']);
  try { ws?.close(); } catch { /* kapandı */ }
  sonuc('Hızlı Eylem: PDEfe kapandı', !!(await pdefeKapandi()));
  if (surecSayisi()) { calistir('/usr/bin/pkill', ['-KILL', '-x', 'PDEfe']); await pdefeKapandi(5000); }

  // Kapalı PDEfe: Betik onu başlatır, araç dosyalarla açılır (hata ayıklama kapısı yok: Süreç, pencere sayısı ve görüntü)
  r = betikCalistir('--birlestir', [a, b]);
  sonuc('Hızlı Eylem kapalıyken: Betik PDEfe\'yi başlattı', r.status === 0 && !!(await kosul(() => surecSayisi() === 1, 30000, 500)), `${r.status} ${r.stderr || ''}`);
  await bekle(7000);
  const pencereler = osascript('tell application "System Events" to count windows of process "PDEfe"');
  sonuc('Hızlı Eylem kapalıyken: Pencere açıldı (görüntü: hizli-kapaliyken.png)', pencereler.ok ? +pencereler.cikti >= 1 : null, pencereler.cikti || pencereler.hata, false);
  calistir('/usr/sbin/screencapture', ['-x', path.join(CIKTI, 'hizli-kapaliyken.png')]);
  calistir('/usr/bin/pkill', ['-TERM', '-x', 'PDEfe']);
  if (!(await pdefeKapandi(8000))) calistir('/usr/bin/pkill', ['-KILL', '-x', 'PDEfe']);
}

fs.writeFileSync(SONUC_DOSYASI, satirlar.join('\n') + '\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### macOS sınaması (${os.arch()}, macOS ${calistir('/usr/bin/sw_vers', ['-productVersion']).cikti})\n\n\`\`\`\n${satirlar.join('\n')}\n\`\`\`\n`);
}
console.log(hata ? `\n${hata} zorunlu denetim başarısız.` : '\nBütün zorunlu denetimler geçti.');
process.exit(hata ? 1 : 0);
