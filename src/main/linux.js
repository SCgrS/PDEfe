// Linux'a özgü ana süreç yardımcıları (0.3.1, Linux sürümü: AppImage). Windows ve macOS'ta yüklenir ama hiçbir şey yapmaz.
//  - AppImage: AppImage'ın çalışma ortamı dosyanın yerini APPIMAGE'a koyar. Uygulama AppImage'ın bağlandığı geçici klasörden (APPDIR, FUSE)
//    çalışır, o klasör PDEfe kapanınca kalkar: Yeniden başlatma (app.relaunch) ve menü kaydının komutu AppImage dosyasını gösterir.
//  - Sistem programları (fc-match, xdg-mime, lpstat, xclip) AppRun'ın LD_LIBRARY_PATH'e koyduğu APPDIR/usr/lib olmadan çalıştırılır
//    (sistemOrtami; çekirdekteki karşılığı core/islemler/linux.py ortami_temizle).
//  - Standart yazı tipleri (standartYaziTipleri): PDF.js'in gömülü olmayan Times / Helvetica / Courier'si için Windows'ta times.ttf…,
//    macOS'ta Supplemental'daki Times New Roman.ttf… okunur (guvenlik.js). Linux'ta dosyanın adı ve yeri dağıtıma göre değişir: fontconfig'e
//    (fc-match) sorulur, yalnız aynı aile ya da ölçüleri aynı eşi alınır (Liberation, Croscore, URW Nimbus, TeX Gyre). Yoksa PDF.js'in kendi
//    yedeği kalır (renderer/yaziTipleri.js).
//  - Menü kaydı ve varsayılan PDF programı (masaustuKaydiYaz, pdfVarsayilaniOku): AppImage kendini menüye eklemez. Ayarlar'daki "Varsayılan
//    PDF görüntüleyici yap" ~/.local/share/applications/pdefe.desktop kaydını (simgesiyle) yazar ve xdg-mime ile PDF'lerin varsayılan programı
//    yapar. Kayıt PDEfe'nin işaretini taşır (X-PDEfe-Kaydi): AppImage taşınınca açılışta yeni yere çevrilir (masaustuKaydiniTazele).
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LINUX = process.platform === 'linux';

/** AppImage dosyasının tam yolu (AppImage'ın içinden çalışıyorsa); değilse null. */
export function appImageYolu(ortam = process.env) {
  const y = ortam.APPIMAGE;
  return LINUX && typeof y === 'string' && path.isAbsolute(y) && !y.includes('\0') ? y : null;
}

/** app.relaunch seçenekleri: AppImage'da yeniden başlatılan AppImage dosyasıdır (uygulamanın kendi yolu kapanınca kalkan bağlama klasöründe). */
export function yenidenBaslatma(args) {
  const yol = appImageYolu();
  return yol ? { execPath: yol, args } : { args };
}

/** Sistem programlarının ortamı: LD_LIBRARY_PATH'ten AppImage'ın klasörü (APPDIR altı) çıkarılır; boş kalırsa değişken kaldırılır. */
export function sistemOrtami(ortam = process.env) {
  const sonuc = { ...ortam };
  const appdir = ortam.APPDIR ? path.posix.normalize(ortam.APPDIR).replace(/\/+$/, '') : '';
  if (sonuc.LD_LIBRARY_PATH != null && appdir) {
    const kalan = sonuc.LD_LIBRARY_PATH.split(':').filter((k) => k && !(path.posix.normalize(k) === appdir || path.posix.normalize(k).startsWith(appdir + '/')));
    if (kalan.length) sonuc.LD_LIBRARY_PATH = kalan.join(':'); else delete sonuc.LD_LIBRARY_PATH;
  }
  return sonuc;
}

/** Programı çalıştırır: { tamam, cikti, hata }. Program yoksa ya da süre dolarsa tamam false (fırlatmaz). */
export function calistir(komut, args, { zaman = 5000, girdi = null } = {}) {
  return new Promise((coz) => {
    let surec;
    try {
      surec = execFile(komut, args, { timeout: zaman, env: sistemOrtami(), encoding: 'utf8', maxBuffer: 1024 * 1024 }, (hata, cikti, stderr) => {
        coz({ tamam: !hata, cikti: String(cikti || ''), hata: hata ? String(stderr || hata.message || hata).trim() : '' });
      });
    } catch (e) { coz({ tamam: false, cikti: '', hata: e?.message || String(e) }); return; }
    if (girdi != null) { surec.stdin.on('error', () => {}); surec.stdin.end(girdi); }
  });
}

/**
 * Arka planda kalan programı çalıştırır (pano: xclip, wl-copy): { tamam, hata }. Bu programlar panoyu tutmak için çatallanır, ön süreç hemen
 * çıkar. calistir'in execFile'ı ise çıktı akışlarının kapanmasını bekler, arka plandaki süreç devraldığı akışları açık tuttuğu için her
 * kopyalama süre (5 sn) dolana dek bekliyordu (0.3.1 inceleme). Burada çıktı akışları bağlanmaz, ön süreç çıkınca döner (çıkış kodu 0: tamam).
 */
export function calistirArkada(komut, args, { zaman = 5000, girdi = null, olustur = spawn } = {}) {
  return new Promise((coz) => {
    let surec, zamanlayici = null, bitti = false;
    const bitir = (r) => { if (bitti) return; bitti = true; clearTimeout(zamanlayici); coz(r); };
    try { surec = olustur(komut, args, { env: sistemOrtami(), stdio: ['pipe', 'ignore', 'ignore'] }); } catch (e) { coz({ tamam: false, hata: e?.message || String(e) }); return; }
    zamanlayici = setTimeout(() => { try { surec.kill(); } catch { /* çıkmış */ } bitir({ tamam: false, hata: 'Süre doldu.' }); }, zaman);
    surec.on('error', (e) => bitir({ tamam: false, hata: e?.message || String(e) }));
    surec.on('exit', (kod, sinyal) => bitir({ tamam: kod === 0, hata: kod === 0 ? '' : `Çıkış kodu ${kod ?? sinyal}.` }));
    surec.stdin.on('error', () => {});
    surec.stdin.end(girdi ?? undefined);
  });
}

// ---------------------------------------------------------------- yazı tipleri
/** Sistem yazı tiplerinin kökleri (fontconfig'in varsayılan klasörleri; alt klasörleri de). */
export function yaziTipiKokleri() {
  const veri = process.env.XDG_DATA_HOME && path.isAbsolute(process.env.XDG_DATA_HOME) ? process.env.XDG_DATA_HOME : path.join(os.homedir(), '.local', 'share');
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(veri, 'fonts'), path.join(os.homedir(), '.fonts')];
}

// Windows dosya adı (renderer/yaziTipleri.js STANDART_DOSYALAR) → [aile, kalın, italik]
const STANDART = {
  'times.ttf': ['Times New Roman', false, false], 'timesbd.ttf': ['Times New Roman', true, false], 'timesi.ttf': ['Times New Roman', false, true],
  'timesbi.ttf': ['Times New Roman', true, true], 'arial.ttf': ['Arial', false, false], 'arialbd.ttf': ['Arial', true, false],
  'ariali.ttf': ['Arial', false, true], 'arialbi.ttf': ['Arial', true, true], 'cour.ttf': ['Courier New', false, false],
  'courbd.ttf': ['Courier New', true, false], 'couri.ttf': ['Courier New', false, true], 'courbi.ttf': ['Courier New', true, true],
};
// Ölçüleri aynı tutulan eşler (küçük harf): PDF.js gömülü olmayan yazıyı PDF'teki genişliklerle dizer, yalnız harflerin çizimi bu dosyadan
export const METRIK_ESLERI = {
  'times new roman': ['times new roman', 'liberation serif', 'tinos', 'nimbus roman', 'nimbus roman no9 l', 'tex gyre termes', 'times'],
  arial: ['arial', 'liberation sans', 'arimo', 'nimbus sans', 'nimbus sans l', 'tex gyre heros', 'helvetica'],
  'courier new': ['courier new', 'liberation mono', 'cousine', 'nimbus mono ps', 'nimbus mono l', 'tex gyre cursor', 'courier'],
};

/** fc-match'in yanıtı ("dosya\naile1,aile2\nağırlık\neğim\n") → { dosya, aileler, kalin, italik } ya da null. */
export function fcMatchCoz(cikti) {
  const s = String(cikti || '').split('\n');
  if (s.length < 4 || !s[0].trim()) return null;
  const sayi = (x) => Number((/-?\d+(?:\.\d+)?/.exec(x) || [0])[0]);
  return { dosya: s[0].trim(), aileler: s[1].split(',').map((a) => a.trim().toLowerCase()).filter(Boolean), kalin: sayi(s[2]) >= 180, italik: sayi(s[3]) > 0 };
}

/** Bulunan yazı tipi bu aile için uygun mu: aynı aile ya da eşi, .ttf / .otf. */
export function standartaUygun(aile, f) {
  const esler = METRIK_ESLERI[String(aile).toLowerCase()] || [String(aile).toLowerCase()];
  return !!f && /\.(ttf|otf)$/i.test(f.dosya) && f.aileler.some((a) => esler.includes(a));
}

let standartSozu = null;
const bulunanYaziTipleri = new Set();   // fc-match'in verdiği dosyalar: kök klasörlerin dışında olsalar da okunabilir (izinliYaziTipiMi)

/** Standart yazı tiplerinin Linux'taki dosyaları: { 'times.ttf': '<yol>', … } (bulunamayan anahtar yok). Bir kez sorulur (12 fc-match, paralel). */
export function standartYaziTipleri(calistirici = calistir) {
  if (!LINUX && calistirici === calistir) return Promise.resolve({});
  if (standartSozu && calistirici === calistir) return standartSozu;
  const soz = Promise.all(Object.entries(STANDART).map(async ([win, [aile, kalin, italik]]) => {
    const r = await calistirici('fc-match', ['-f', '%{file}\\n%{family}\\n%{weight}\\n%{slant}\\n', `${aile}:weight=${kalin ? 'bold' : 'regular'}:slant=${italik ? 'italic' : 'roman'}`]);
    const f = r.tamam ? fcMatchCoz(r.cikti) : null;
    return standartaUygun(aile, f) ? [win, f.dosya] : null;
  })).then((liste) => {
    const sonuc = Object.fromEntries(liste.filter(Boolean));
    for (const y of Object.values(sonuc)) bulunanYaziTipleri.add(path.resolve(y));
    return sonuc;
  }).catch(() => ({}));
  if (calistirici === calistir) standartSozu = soz;
  return soz;
}

/** Yol bir sistem yazı tipi dosyası mı (Linux): yazı tipi köklerinin altında (alt klasörler de) ya da fc-match'in verdiği dosya. */
export function izinliYaziTipiMi(yol) {
  if (!LINUX) return false;
  const y = path.resolve(String(yol || ''));
  if (!/\.(ttf|ttc|otf)$/i.test(y)) return false;
  return bulunanYaziTipleri.has(y) || yaziTipiKokleri().some((k) => y.startsWith(path.resolve(k) + path.sep));
}

// ---------------------------------------------------------------- menü kaydı ve varsayılan PDF programı
const MASAUSTU_ADI = 'pdefe.desktop';   // electron-builder.yml linux.executableName, package.json desktopName
const ISARET = 'X-PDEfe-Kaydi=1';
const veriKlasoru = () => (process.env.XDG_DATA_HOME && path.isAbsolute(process.env.XDG_DATA_HOME) ? process.env.XDG_DATA_HOME : path.join(os.homedir(), '.local', 'share'));
export const masaustuDosyasi = () => path.join(veriKlasoru(), 'applications', MASAUSTU_ADI);
const simgeDosyasi = () => path.join(veriKlasoru(), 'icons', 'hicolor', '512x512', 'apps', 'pdefe.png');

/** freedesktop Exec argümanı: çift tırnak içinde " ` $ \ kaçışlı, % ikilenir; sonra dize kaçışı (\ → \\, satır sonu yok). */
export function execArgumani(s) {
  const tirnakli = '"' + String(s).replace(/["`$\\]/g, (c) => '\\' + c).replace(/%/g, '%%') + '"';
  return tirnakli.replace(/\\/g, '\\\\');
}

/** Menü kaydının metni (AppImage dosyası ve simge yolu). */
export function masaustuMetni(exe, simge) {
  const duz = (s) => String(s).replace(/[\r\n]/g, ' ');
  return [
    '[Desktop Entry]', 'Type=Application', 'Name=PDEfe', 'GenericName=PDF görüntüleyici', 'Comment=PDF görüntüleyici ve düzenleyici',
    `Exec=${execArgumani(duz(exe))} %F`, `TryExec=${duz(exe)}`, `Icon=${duz(simge)}`, 'Terminal=false', 'Categories=Office;Viewer;',
    'MimeType=application/pdf;', 'Keywords=pdf;belge;udf;uyap;', 'StartupWMClass=pdefe', ISARET, '',
  ].join('\n');
}

/** Dosyayı yanındaki geçici dosyadan yerine koyar (yarım yazılmış kayıt kalmasın). */
async function yaz(yol, veri) {
  await fs.promises.mkdir(path.dirname(yol), { recursive: true });
  const gecici = `${yol}.${process.pid}.tmp`;
  await fs.promises.writeFile(gecici, veri, { mode: 0o644 });
  await fs.promises.rename(gecici, yol);
}

/** Menü kaydını (simgesiyle) yazar ve PDEfe'yi PDF'lerin varsayılan programı yapar. Yalnız AppImage'da. simge: PNG baytları.
 *  Döner: { tamam, hata? }. */
export async function masaustuKaydiYaz({ simge, varsayilan = true } = {}) {
  const exe = appImageYolu();
  if (!exe) return { tamam: false, hata: 'PDEfe bir AppImage dosyasından çalışmıyor.' };
  try {
    if (simge) await yaz(simgeDosyasi(), simge);
    await yaz(masaustuDosyasi(), masaustuMetni(exe, simge ? simgeDosyasi() : 'pdefe'));
  } catch (e) { return { tamam: false, hata: 'Menü kaydı yazılamadı: ' + (e?.message || e) }; }
  await calistir('update-desktop-database', [path.dirname(masaustuDosyasi())]);   // yoksa da olur: masaüstleri klasörü kendileri izler
  if (!varsayilan) return { tamam: true };
  const r = await calistir('xdg-mime', ['default', MASAUSTU_ADI, 'application/pdf']);
  return r.tamam ? { tamam: true } : { tamam: false, hata: 'Varsayılan program ayarlanamadı (xdg-mime): ' + (r.hata || 'bulunamadı') };
}

/** .pdf'nin varsayılan programı PDEfe mi: { varsayilan: true | false | null (okunamadı), progId: kayıt adı }. AppImage araçlarının yazdığı
 *  kayıtlar da sayılır (AppImageLauncher: appimagekit_<özet>-pdefe.desktop). */
export async function pdfVarsayilaniOku() {
  const r = await calistir('xdg-mime', ['query', 'default', 'application/pdf']);
  if (!r.tamam) return { varsayilan: null, progId: null };
  const ad = r.cikti.trim();
  return { varsayilan: ad ? /(^|[-_])pdefe\.desktop$/i.test(ad) : false, progId: ad || null };
}

/** Açılışta: PDEfe'nin yazdığı menü kaydı başka bir AppImage yolunu gösteriyorsa (dosya taşındı) şimdiki yola çevrilir. Kayıt yoksa ya da PDEfe
 *  yazmadıysa dokunulmaz. Döner: yenilendiyse true. */
export async function masaustuKaydiniTazele() {
  const exe = appImageYolu();
  if (!exe) return false;
  let metin;
  try { metin = await fs.promises.readFile(masaustuDosyasi(), 'utf8'); } catch { return false; }
  if (!metin.includes(ISARET) || metin.includes(`\nTryExec=${exe}\n`)) return false;
  const simge = /\nIcon=(.*)\n/.exec(metin)?.[1] || 'pdefe';
  try { await yaz(masaustuDosyasi(), masaustuMetni(exe, simge)); } catch { return false; }
  await calistir('update-desktop-database', [path.dirname(masaustuDosyasi())]);
  return true;
}
