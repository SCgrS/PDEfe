// Linux paket sınaması (0.3.1): CI'da (GitHub'ın ubuntu-22.04 makinesinde, xvfb-run altında) PDEfe-Linux.AppImage'ı çift tıklanmış gibi
// başlatır; paketi (.desktop, simge, çekirdek, güncelleme kaydı, latest-linux.yml), komut satırından ve menü kaydının adres biçiminden (%U)
// PDF açmayı, tek örneği, sayfa çizimini ve standart yazı tiplerini (fontconfig), çekirdeği (yazı tanıma Linux'ta "desteklenmiyor"), Bul'u,
// Türkçe yazı notunun kaydını, yazdırma penceresini (cups-pdf kuruluysa gerçek yazdırmayı), PDF'i kopyala'yı ve panodan dosya yapıştırmayı
// (xclip), varsayılan PDF programını (menü kaydı + xdg-mime), güncelleme durumunu, LibreOffice'le Word → PDF'i (paketli çekirdekten) ve
// çıkışta çekirdeğin kapanmasını sınar. Ekran görüntüleri ve sonuç çıktı klasörüne.
// Kullanım: xvfb-run -a node test/linux_duman.mjs <PDEfe-Linux.AppImage> <örnek klasörü: not.pdf, taranmis.pdf, [deneme.docx]> <çıktı klasörü>
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [APPIMAGE, ORNEKLER, CIKTI] = process.argv.slice(2).map((p) => p && path.resolve(p));
if (!APPIMAGE || !ORNEKLER || !CIKTI) { console.error('Kullanım: node test/linux_duman.mjs <PDEfe-Linux.AppImage> <örnekler> <çıktı>'); process.exit(2); }
process.on('uncaughtException', (e) => { console.error('HATA    beklenmeyen:', e?.stack || e); process.exit(1); });
fs.mkdirSync(CIKTI, { recursive: true });
const PORT = 9335;
const VERI = fs.mkdtempSync(path.join(os.tmpdir(), 'pdefe-duman-'));
const PDF1 = fs.realpathSync(path.join(ORNEKLER, 'not.pdf'));
const TARANMIS = fs.realpathSync(path.join(ORNEKLER, 'taranmis.pdf'));
const DOCX = fs.existsSync(path.join(ORNEKLER, 'deneme.docx')) ? fs.realpathSync(path.join(ORNEKLER, 'deneme.docx')) : null;
const KAYIT = path.join(VERI, 'kayit denemesi.pdf');   // boşluklu ad: yazı notu buna kaydedilir
fs.copyFileSync(PDF1, KAYIT);
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
  return { ok: r.status === 0, cikti: (r.stdout || '').trim(), hata: (r.stderr || r.error?.message || '').trim(), kod: r.status };
}
const varMi = (komut) => calistir('sh', ['-c', `command -v ${komut}`]).ok;
async function kosul(f, sure = 20000, aralik = 250) {
  const son = Date.now() + sure;
  for (;;) { try { const v = await f(); if (v) return v; } catch { /* yeniden dene */ } if (Date.now() > son) return null; await bekle(aralik); }
}

// ---------------------------------------------------------------- 1) paket
const appimageOrtami = { ...process.env };
{
  const st = fs.statSync(APPIMAGE);
  sonuc('AppImage çalıştırılabilir', (st.mode & 0o111) !== 0, `${(st.size / 1048576).toFixed(1)} MB`);
  const yml = path.join(path.dirname(APPIMAGE), 'latest-linux.yml');
  const ymlMetni = fs.existsSync(yml) ? fs.readFileSync(yml, 'utf8') : '';
  sonuc('latest-linux.yml: PDEfe-Linux.AppImage, sha512, gömülü blockmap', /url: PDEfe-Linux\.AppImage/.test(ymlMetni) && /sha512:/.test(ymlMetni) && /blockMapSize:/.test(ymlMetni),
    ymlMetni.replace(/\s+/g, ' ').slice(0, 300));
  const acik = fs.mkdtempSync(path.join(os.tmpdir(), 'pdefe-acik-'));
  const ac = calistir(APPIMAGE, ['--appimage-extract'], { cwd: acik, timeout: 180000 });
  const kok = path.join(acik, 'squashfs-root');
  sonuc('AppImage açılıyor (--appimage-extract)', ac.ok && fs.existsSync(kok), ac.hata.slice(-300));
  const masaustu = fs.existsSync(path.join(kok, 'pdefe.desktop')) ? fs.readFileSync(path.join(kok, 'pdefe.desktop'), 'utf8') : '';
  sonuc('.desktop: pdefe.desktop, PDF türü, Office;Viewer;, adres biçimi (%U), simge', /^MimeType=application\/pdf;$/m.test(masaustu) && /^Categories=Office;Viewer;$/m.test(masaustu)
    && /^Exec=AppRun.* %U$/m.test(masaustu) && /^Icon=pdefe$/m.test(masaustu) && /^StartupWMClass=pdefe$/m.test(masaustu), masaustu.replace(/\n/g, ' | '));
  sonuc('simge (hicolor 512×512)', fs.existsSync(path.join(kok, 'usr/share/icons/hicolor/512x512/apps/pdefe.png')));
  const cekirdek = path.join(kok, 'resources/pdefe-core/pdefe-core');
  sonuc('çekirdek pakette ve çalıştırılabilir', fs.existsSync(cekirdek) && (fs.statSync(cekirdek).mode & 0o111) !== 0);
  const ldd = fs.existsSync(cekirdek) ? calistir('ldd', [cekirdek]) : { cikti: '' };
  sonuc('çekirdeğin kitaplıkları bulunuyor (ldd)', !/not found/.test(ldd.cikti), ldd.cikti.split('\n').filter((s) => /not found/.test(s)).join(' | '));
  const guncelleme = path.join(kok, 'resources/app-update.yml');
  const g = fs.existsSync(guncelleme) ? fs.readFileSync(guncelleme, 'utf8') : '';
  sonuc('app-update.yml (electron-updater): GitHub, SCgrS/PDEfe', /provider: github/.test(g) && /owner: SCgrS/.test(g) && /repo: PDEfe/.test(g), g.replace(/\n/g, ' | '));
  for (const f of ['resources/ude-kopru/ude-kopru.jar', 'resources/LICENSE.txt', 'resources/THIRD_PARTY.md']) sonuc(`pakette ${f}`, fs.existsSync(path.join(kok, f)));
  // En yüksek glibc sürümü (bilgi): AppImage bu sürümden eski dağıtımlarda açılmaz
  const glibc = (dosya) => (calistir('sh', ['-c', `objdump -T "${dosya}" 2>/dev/null | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1`]).cikti || '?');
  const libpython = calistir('sh', ['-c', `ls "${path.join(kok, 'resources/pdefe-core/_internal')}"/libpython3*.so* 2>/dev/null | head -1`]).cikti;
  sonuc('en yüksek glibc sürümü (bilgi)', null, `pdefe ${glibc(path.join(kok, 'pdefe'))} · pdefe-core ${glibc(cekirdek)}${libpython ? ' · libpython ' + glibc(libpython) : ''}`);
  fs.rmSync(acik, { recursive: true, force: true });
  // FUSE: AppImage bağlanabiliyor mu (durağan çalışma ortamı fusermount3 ister); bağlanamazsa açılmış hâlden çalıştırılır (APPIMAGE_EXTRACT_AND_RUN)
  const surum = calistir(APPIMAGE, ['--appimage-version'], { timeout: 30000 });
  const fuse = calistir('sh', ['-c', `timeout 60 "${APPIMAGE}" --appimage-mount & P=$!; sleep 4; ls "$(ls -d /tmp/.mount_* 2>/dev/null | head -1)" >/dev/null 2>&1; R=$?; kill $P 2>/dev/null; exit $R`]);
  sonuc('AppImage FUSE ile bağlanıyor (çift tıklamadaki yol)', fuse.ok, `${surum.cikti || surum.hata}`.slice(0, 200), false);
  if (!fuse.ok) appimageOrtami.APPIMAGE_EXTRACT_AND_RUN = '1';
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
const cagir = (kanal, ...a) => degerlendir(`window.pdefe.cagir(${a.length ? [JSON.stringify(kanal), ...a.map((x) => JSON.stringify(x))].join(', ') : JSON.stringify(kanal)}).then((r) => JSON.stringify(r ?? null)).catch((e) => JSON.stringify({ istisna: e.message }))`).then((s) => JSON.parse(s));
async function ekranGoruntusu(ad) {
  try { const r = await gonder('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) fs.writeFileSync(path.join(CIKTI, ad), Buffer.from(r.result.data, 'base64')); } catch { /* yalnızca bilgi */ }
}
async function tus(key, code, vk, modifiers = 0) {
  for (const type of ['rawKeyDown', 'keyUp']) await gonder('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
}
const anaSurecler = () => calistir('pgrep', ['-a', '-f', `remote-debugging-port=${PORT}`]).cikti.split('\n').filter((s) => s && !/--type=/.test(s) && !/pgrep/.test(s));

// ---------------------------------------------------------------- 2) başlat (komut satırındaki PDF'le), tek örnek, menünün adres biçimi
const acilis = Date.now();
const surec = spawn(APPIMAGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${VERI}`, PDF1], { env: appimageOrtami, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let gunluk = '';
surec.stdout.on('data', (d) => { gunluk += d; }); surec.stderr.on('data', (d) => { gunluk += d; });
await baglan();
await kosul(() => degerlendir('!!window.__pdefe'), 30000);
sonuc('pencere açıldı', true, `${((Date.now() - acilis) / 1000).toFixed(1)} sn`);
await gonder('Runtime.enable');
const platform = await degerlendir('window.pdefe.platform + " / " + document.documentElement.dataset.platform');
sonuc('arayüz Linux kipinde (görünüm Windows\'taki gibi)', platform === 'linux / windows', platform);
const acildi = await kosul(() => degerlendir(`[...window.__pdefe.belgeler.values()].some((b) => b.yol === ${JSON.stringify(PDF1)})`), 30000);
sonuc('komut satırındaki PDF sekmede', !!acildi);
const ikinci = spawnSync(APPIMAGE, [`--user-data-dir=${VERI}`, pathToFileURL(TARANMIS).href], { env: appimageOrtami, timeout: 60000, encoding: 'utf8' });
const ikinciAcildi = await kosul(() => degerlendir(`[...window.__pdefe.belgeler.values()].some((b) => b.yol === ${JSON.stringify(TARANMIS)})`), 30000);
sonuc('ikinci örnek: menünün adres biçimindeki (file://) PDF açık PDEfe\'de açıldı, ikinci süreç çıktı', !!ikinciAcildi && ikinci.status === 0, `çıkış ${ikinci.status} ${ikinci.error?.message || ''}`);
sonuc('tek örnek (bir ana süreç)', anaSurecler().length === 1, anaSurecler().join(' || '));

// ---------------------------------------------------------------- 3) sayfa çizimi ve standart yazı tipleri
await degerlendir(`(() => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.yol === ${JSON.stringify(PDF1)}); if (b) window.__pdefe.sekmeSec(b.id); return true; })()`);
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
const klasorler = await cagir('uygulama:klasorler');
for (const ad of ['times.ttf', 'arialbd.ttf', 'cour.ttf']) {
  const yol = klasorler?.yaziTipiDosyalari?.[ad];
  const r = yol ? await cagir('dosya:oku', yol) : null;
  sonuc(`standart yazı tipi (fontconfig): ${ad} → ${yol ? path.basename(yol) : 'yok'}`, !!r?.boyut && r.boyut > 50000, r?.istisna || r?.boyut || '', ad !== 'cour.ttf');
}
await ekranGoruntusu('belge.png');

// ---------------------------------------------------------------- 4) çekirdek, yazı tanıma
const ping = await cagir('cekirdek:cagir', 'ping', {});
sonuc('çekirdek yanıt veriyor', ping?.ok === true, JSON.stringify(ping));
const ocr = await cagir('cekirdek:cagir', 'ocr_sayfa', { yol: TARANMIS, sayfa: 1 });
sonuc('yazı tanıma Linux\'ta "desteklenmiyor" (çekirdek düşmez)', ocr?.desteklenmiyor === true, JSON.stringify(ocr).slice(0, 200));

// ---------------------------------------------------------------- 5) Bul (Ctrl+F menü kısayolu: gerçek klavye, xdotool; yoksa CDP)
// Ctrl+F menünün hızlandırıcısıdır: CDP'nin sayfaya verdiği tuş menüye ulaşmayabilir. xdotool X sunucusuna (Xvfb) gerçek tuş gönderir
const pencere = varMi('xdotool') ? (calistir('xdotool', ['search', '--onlyvisible', '--name', 'PDEfe']).cikti.split('\n')[0]
  || calistir('xdotool', ['search', '--onlyvisible', '--class', 'pdefe']).cikti.split('\n')[0]) : '';
const klavye = async (xdo, cdp) => { if (pencere) calistir('xdotool', ['windowfocus', '--sync', pencere, ...xdo]); else await cdp(); };
await degerlendir('document.activeElement?.blur?.(); window.__pdefe.aktif()?.gorunum?.kaydirici?.focus?.(); true');
await klavye(['key', '--clearmodifiers', 'ctrl+f'], () => tus('f', 'KeyF', 70, 2));
let bulAcik = await kosul(() => degerlendir('window.__pdefe.arama.acik && document.activeElement?.id === "bul-girdi"'), 5000);
sonuc(`Ctrl+F Bul'u açar (${pencere ? 'gerçek klavye, xdotool' : 'CDP'})`, !!bulAcik, '', !!pencere);
if (!bulAcik) { await degerlendir(`window.__pdefe.komutCalistir('duzen.bul'); true`); bulAcik = await kosul(() => degerlendir('window.__pdefe.arama.acik'), 5000); }
await klavye(['type', '--delay', '40', 'deneme'], () => gonder('Input.insertText', { text: 'deneme' }));
const sayacMetni = await kosul(async () => { const s = await degerlendir('document.querySelector("#bul-sayac")?.textContent || ""'); return /\d/.test(s) && !/aranıyor/.test(s) ? s : null; }, 15000);
sonuc('Bul eşleşme buluyor', !!sayacMetni && !/^0/.test(sayacMetni), `${sayacMetni} · kutuda: ${await degerlendir('document.querySelector("#bul-girdi")?.value')}`);
await klavye(['key', 'Escape'], () => tus('Escape', 'Escape', 27));
sonuc('Esc Bul\'u kapatır', !!(await kosul(() => degerlendir('!window.__pdefe.arama.acik'), 3000)));

// ---------------------------------------------------------------- 6) Türkçe yazı notu, kaydet (fontconfig'in yazı tipi gömülür)
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
const gorunum = await cagir('cekirdek:cagir', 'sayfa_metni', { yol: KAYIT, sayfa: 1 });
sonuc('notun görünümünde Türkçe harfler (gömülü yazı tipi)', String(gorunum?.metin || '').normalize('NFC').includes(METIN.normalize('NFC')) || null,
  String(gorunum?.metin || '').slice(-120), false);
await ekranGoruntusu('not.png');

// ---------------------------------------------------------------- 7) yazdırma penceresi (cups-pdf kuruluysa gerçek yazdırma)
await degerlendir(`window.__pdefe.komutCalistir('dosya.yazdir'); true`);
const diyalog = await kosul(() => degerlendir('!!document.querySelector(".yazdir-diyalog")'), 15000);
sonuc('yazdırma penceresi açılıyor', !!diyalog);
const yazicilar = await kosul(() => degerlendir('(() => { const s = document.querySelector(".yazdir-diyalog [name=yazici]"); const b = document.querySelector(".yazdir-yazici-bilgi")?.textContent || ""; return s && (s.options.length || /yazıcı yok/i.test(b)) ? { liste: [...s.options].map((o) => o.textContent), bilgi: b, sistem: document.querySelector(".yazdir-diyalog [data-id=sistem]")?.textContent } : null; })()'), 15000);
sonuc('yazıcı listesi (CUPS) okunuyor, "Linux yazdırma penceresiyle yazdır"', !!yazicilar && yazicilar.sistem === 'Linux yazdırma penceresiyle yazdır', JSON.stringify(yazicilar));
await ekranGoruntusu('yazdir.png');
const pdfKlasoru = path.join(os.homedir(), 'PDF');
if (yazicilar?.liste?.length && varMi('lpstat')) {
  const once = fs.existsSync(pdfKlasoru) ? fs.readdirSync(pdfKlasoru).length : 0;
  await degerlendir('document.querySelector(".yazdir-diyalog [data-id=yazdir]").click(); true');
  const basildi = await kosul(() => fs.existsSync(pdfKlasoru) && fs.readdirSync(pdfKlasoru).length > once, 60000, 1000);
  sonuc('gerçek yazdırma (cups-pdf): ~/PDF\'e dosya yazıldı', !!basildi, fs.existsSync(pdfKlasoru) ? fs.readdirSync(pdfKlasoru).join(', ') : 'klasör yok', false);
} else {
  await degerlendir('document.querySelector(".yazdir-diyalog [data-id=iptal]")?.click(); true');
  sonuc('gerçek yazdırma', null, 'yazıcı yok');
}
await kosul(() => degerlendir('!document.querySelector(".yazdir-ortusu")'), 10000);

// ---------------------------------------------------------------- 8) PDF'i kopyala ve panodan dosya (xclip)
if (varMi('xclip')) {
  const p = await cagir('pano:dosya', PDF1);
  await bekle(300);
  const turler = calistir('xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o'], { timeout: 10000 }).cikti;
  const gnome = calistir('xclip', ['-selection', 'clipboard', '-t', 'x-special/gnome-copied-files', '-o'], { timeout: 10000 }).cikti;
  const uri = calistir('xclip', ['-selection', 'clipboard', '-t', 'text/uri-list', '-o'], { timeout: 10000 }).cikti;
  sonuc('PDF\'i kopyala: panoda x-special/gnome-copied-files ("copy" ve adres)', p?.tamam === true && gnome === `copy\n${pathToFileURL(PDF1).href}`, `${JSON.stringify(p)} · türler: ${turler.replace(/\n/g, ' ')} · ${JSON.stringify(gnome)}`);
  sonuc('PDF\'i kopyala: panoda text/uri-list (KDE, tarayıcılar)', uri.trim() === pathToFileURL(PDF1).href, JSON.stringify(uri), false);
  const koy = spawnSync('xclip', ['-selection', 'clipboard', '-t', 'text/uri-list', '-i'], { input: pathToFileURL(TARANMIS).href + '\r\n', timeout: 10000 });
  await bekle(300);
  const icerik = await cagir('pano:icerik');
  sonuc('panodan dosya yapıştırma (dosya yöneticisinden kopyalanan, text/uri-list)', koy.status === 0 && icerik?.tur === 'dosyalar' && icerik.dosyalar?.[0] === TARANMIS, JSON.stringify(icerik), false);
} else sonuc('pano (xclip yok)', null);

// ---------------------------------------------------------------- 9) varsayılan PDF programı (menü kaydı + xdg-mime)
if (varMi('xdg-mime')) {
  const once = await cagir('kabuk:varsayilanMi');
  const yap = await cagir('kabuk:varsayilanUygulamalar');
  const sonra = await cagir('kabuk:varsayilanMi');
  const kayitDosyasi = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'applications/pdefe.desktop');
  const metin = fs.existsSync(kayitDosyasi) ? fs.readFileSync(kayitDosyasi, 'utf8') : '';
  sonuc('varsayılan PDF programı: menü kaydı AppImage\'ı gösteriyor, xdg-mime PDEfe diyor', yap?.tamam === true && sonra?.varsayilan === true
    && metin.includes(`\nTryExec=${APPIMAGE}\n`) && /\nMimeType=application\/pdf;\n/.test(metin), JSON.stringify({ once, yap, sonra }), !appimageOrtami.APPIMAGE_EXTRACT_AND_RUN);
} else sonuc('varsayılan PDF programı (xdg-mime yok)', null);

// ---------------------------------------------------------------- 10) güncelleme
const durum = await cagir('guncelleme:durum');
sonuc('güncelleme: AppImage\'da electron-updater (tarayıcıdan değil)', durum?.paketli === true && !durum.tarayicida, JSON.stringify(durum));
const denetim = await cagir('guncelleme:denetle');
sonuc('güncelleme denetimi Türkçe sonuç veriyor (bilgi: yayımdaki latest-linux.yml\'e bağlı)', null, JSON.stringify(denetim));

// ---------------------------------------------------------------- 11) Word → PDF (LibreOffice, paketli çekirdekten)
const yetenek = await cagir('cekirdek:cagir', 'donusum_yetenekleri', {});
const lo = varMi('soffice') || varMi('libreoffice');
sonuc(`Word yeteneği: ${lo ? 'LibreOffice bulundu' : 'LibreOffice yok, neden LibreOffice\'i söylüyor'}`, lo ? yetenek?.word?.motor === 'libreoffice'
  : yetenek?.word?.var === false && /LibreOffice gerekir/.test(yetenek?.word?.neden || ''), JSON.stringify(yetenek?.word));
if (lo && DOCX) {
  const hedef = path.join(VERI, 'deneme.pdf');
  const r = await cagir('cekirdek:cagir', 'bicim_donustur', { ogeler: [{ yol: DOCX, hedef, hedefBicim: 'pdf' }] });
  const metin = fs.existsSync(hedef) ? (await cagir('cekirdek:cagir', 'sayfa_metni', { yol: hedef, sayfa: 1 }))?.metin || '' : '';
  sonuc('Word → PDF (LibreOffice, AppImage içindeki çekirdekten başlatıldı)', r?.basarili === 1 && /ığşİÇÖÜ/.test(String(metin).normalize('NFC')), JSON.stringify(r).slice(0, 300) + ' · ' + metin.slice(0, 80));
}

// ---------------------------------------------------------------- 12) çıkış: SIGTERM (oturum kapanışı gibi), çekirdek de kapanır
await ekranGoruntusu('son.png');
for (const s of anaSurecler()) { const pid = Number(s.split(' ')[0]); try { process.kill(pid, 'SIGTERM'); } catch { /* kapandı */ } }
const kapandi = await kosul(() => !anaSurecler().length, 20000, 500);
sonuc('SIGTERM ile kapandı', !!kapandi, anaSurecler().join(' || '));
const cekirdekKaldi = await kosul(() => !calistir('pgrep', ['-f', 'resources/pdefe-core/pdefe-core']).ok, 10000, 500);
sonuc('çekirdek de kapandı (artık süreç yok)', !!cekirdekKaldi);
try { ws?.close(); } catch { /* kapandı */ }
for (const s of anaSurecler()) { try { process.kill(Number(s.split(' ')[0]), 'SIGKILL'); } catch { /* yok */ } }
calistir('pkill', ['-f', 'xclip -selection clipboard']);
fs.writeFileSync(path.join(CIKTI, 'gunluk.txt'), gunluk);

fs.writeFileSync(path.join(CIKTI, 'sonuc.txt'), satirlar.join('\n') + '\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  const dagitim = calistir('sh', ['-c', '. /etc/os-release && echo "$PRETTY_NAME"']).cikti;
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Linux sınaması (${os.arch()}, ${dagitim})\n\n\`\`\`\n${satirlar.join('\n')}\n\`\`\`\n`);
}
console.log(hata ? `\n${hata} zorunlu denetim başarısız.` : '\nBütün zorunlu denetimler geçti.');
process.exit(hata ? 1 : 0);
