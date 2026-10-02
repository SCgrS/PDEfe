// macOS paket sınaması (0.2.0): CI'da (GitHub'ın Mac makinesinde) Uygulamalar'a kopyalanmış PDEfe.app'i Finder'daki gibi (open) başlatır;
// imzayı, paketi, Finder'dan PDF açmayı (open-file), sayfa çizimini, sistem yazı tiplerini, çekirdeği, yazı tanımayı, PDF'i kopyala'yı,
// gerçek klavyeyle Mac kısayollarını (System Events; izin yoksa atlanır) ve ⌘Q / Dock'tan çıkışı sınar. Ekran görüntüleri çıktı klasörüne.
// Kullanım: node test/mac_duman.mjs <PDEfe.app> <örnek PDF klasörü: not.pdf, taranmis.pdf> <çıktı klasörü>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [UYGULAMA, ORNEKLER, CIKTI] = process.argv.slice(2).map((p) => p && path.resolve(p));
if (!UYGULAMA || !ORNEKLER || !CIKTI) { console.error('Kullanım: node test/mac_duman.mjs <PDEfe.app> <örnekler> <çıktı>'); process.exit(2); }
fs.mkdirSync(CIKTI, { recursive: true });
const PORT = 9333;
const KIMLIK = 'com.cgrshn.pdefe';
const VERI = fs.mkdtempSync(path.join(os.tmpdir(), 'pdefe-duman-'));
const PDF1 = fs.realpathSync(path.join(ORNEKLER, 'not.pdf'));
const TARANMIS = fs.realpathSync(path.join(ORNEKLER, 'taranmis.pdf'));
const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
const satirlar = [];
let hata = 0;

function sonuc(ad, ok, ayrinti = '', zorunlu = true) {
  const durum = ok === null ? 'ATLANDI' : ok ? 'OK' : zorunlu ? 'HATA' : 'UYARI';
  if (ok === false && zorunlu) hata++;
  const satir = `${durum.padEnd(7)} ${ad}${ayrinti ? ' — ' + String(ayrinti).slice(0, 600) : ''}`;
  console.log(satir); satirlar.push(satir);
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
async function baglan() {
  const hedef = await kosul(async () => {
    const liste = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    return liste.find((h) => h.type === 'page' && /^pdefe:\/\/app\/src\/renderer\/index\.html/.test(h.url));
  }, 90000, 500);
  if (!hedef) throw new Error('PDEfe penceresi CDP üzerinden bulunamadı.');
  ws = new WebSocket(hedef.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
}
function gonder(method, params = {}) {
  return new Promise((c) => { const id = ++sayac; bekleyen.set(id, c); ws.send(JSON.stringify({ id, method, params })); });
}
async function degerlendir(ifade) {
  const r = await gonder('Runtime.evaluate', { expression: ifade, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}
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
const ocr = await degerlendir(`window.pdefe.cagir('cekirdek:cagir', 'ocr_sayfa', { yol: ${JSON.stringify(TARANMIS)}, sayfa: 1 }).then((r) => JSON.stringify(r)).catch((e) => 'hata: ' + e.message)`);
let taninan = '';
try { const r = JSON.parse(ocr); taninan = (r.satirlar || []).map((s) => s.map((w) => w[0]).join(' ')).join(' / '); if (r.desteklenmiyor) taninan = 'desteklenmiyor'; } catch { taninan = ocr; }
const beklenenler = ['DENEME', 'Borçlu', 'müzekkere', 'yazılmıştır', 'Şirketin', 'görülmüştür', 'İstanbul,', 'Müdür'];
const bulunan = beklenenler.filter((s) => taninan.normalize('NFC').includes(s.normalize('NFC')));
sonuc('paketli çekirdekte yazı tanıma', taninan.length > 40 && taninan !== 'desteklenmiyor', taninan);
sonuc(`Türkçe tanıma (${bulunan.length}/${beklenenler.length} sözcük)`, bulunan.length >= 6, `bulunamayan: ${beklenenler.filter((s) => !bulunan.includes(s)).join(', ')}`, false);

// ---------------------------------------------------------------- 5) PDF'i kopyala (panoya dosya)
const pano = await degerlendir(`window.pdefe.cagir('pano:dosya', ${JSON.stringify(PDF1)}).then((r) => JSON.stringify(r))`);
const panodaki = osascript('POSIX path of (the clipboard as «class furl»)');
let panoYolu = '';
try { panoYolu = fs.realpathSync(panodaki.cikti); } catch { /* panoda dosya yok */ }
sonuc('PDF\'i kopyala: dosya panoda (Finder\'da ⌘V ile yapıştırılır)', /"tamam":true/.test(pano) && panoYolu === PDF1, `${pano} → ${panodaki.cikti || panodaki.hata}`);

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
  const secim = await degerlendir('window.getSelection().toString().length');
  sonuc('⌘A belgede sayfanın metnini seçer', secim > 50, secim);
  const olcek0 = await degerlendir('window.__pdefe.aktif().gorunum.olcek');
  tus('0', 'command');   // gerçek boyut (menü)
  await bekle(800);
  const olcek1 = await degerlendir('window.__pdefe.aktif().gorunum.olcek');
  sonuc('⌘0 gerçek boyut (menü kısayolu)', Math.abs(olcek1 - 1) < 0.01 || olcek0 === 1, `${olcek0} → ${olcek1}`, false);
  await ekranGoruntusu('kisayollar.png');
}

// ---------------------------------------------------------------- 7) çıkış: Dock'tan / ⌘Q gibi (uygulamaya çıkış isteği)
// Dock'tan Çık ve ⌘Q uygulamaya çıkış isteği (quit Apple olayı) gönderir. AppleScript'in uygulamayı yönetme izni yoksa aynı çıkış yolu
// (before-quit → pencereler sırayla kapanır) SIGTERM ile denenir
const kapat = osascript(`tell application id "${KIMLIK}" to quit`);
let cikisYolu = 'quit olayı';
if (!kapat.ok) { cikisYolu = 'SIGTERM (AppleScript izni yok: ' + kapat.hata.slice(0, 80) + ')'; calistir('/usr/bin/pkill', ['-TERM', '-x', 'PDEfe']); }
const kapandi = await kosul(() => !calistir('/usr/bin/pgrep', ['-x', 'PDEfe']).ok, 20000, 500);
sonuc('çıkış isteğiyle kapandı (kaydedilmemiş belge yok)', !!kapandi, cikisYolu);
try { ws?.close(); } catch { /* kapandı */ }

fs.writeFileSync(path.join(CIKTI, 'sonuc.txt'), satirlar.join('\n') + '\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### macOS sınaması (${os.arch()}, macOS ${calistir('/usr/bin/sw_vers', ['-productVersion']).cikti})\n\n\`\`\`\n${satirlar.join('\n')}\n\`\`\`\n`);
}
console.log(hata ? `\n${hata} zorunlu denetim başarısız.` : '\nBütün zorunlu denetimler geçti.');
process.exit(hata ? 1 : 0);
