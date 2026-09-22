// Güncelleme uçtan uca testi için ayrı bir deneme uygulaması derler: kurulu PDEfe'ye dokunmayan "PDEfe Guncelleme Testi".
//
// Kullanım (depo kökünden; core/dist/pdefe-core.exe hazır olmalı):
//   node test/guncelleme-e2e/derle.mjs --surum 0.9.0 --cikti test/cikti/g1/e2e/A [--port 9914]
//
// electron-builder.yml okunur, yalnızca şunlar değiştirilir (yapılandırma <cikti>/electron-builder-test.json'a yazılır):
//   appId com.cgrshn.pdefe.guncellemetest, productName "PDEfe Guncelleme Testi", extraMetadata { name: pdefe-guncelleme-testi,
//   productName, version } → kurulum klasörü %LOCALAPPDATA%\Programs\PDEfe Guncelleme Testi, userData %APPDATA%\PDEfe Guncelleme Testi,
//   güncelleme önbelleği %LOCALAPPDATA%\pdefe-guncelleme-testi-updater (gerçek PDEfe'ninki pdefe-updater), kaldırma kaydı başka GUID;
//   win.fileAssociations yok (.pdf / PDEfe.pdf ProgId yazılmaz); nsis.include: build/installer.nsh'in kayıt defterine yazan satırları
//   (WriteReg*, DeleteReg*) ve kabuk bildirimi çıkarılmış kopyası (Software\PDEfe, RegisteredApplications, Classes yazılmaz; sayfalar
//   ve kancalar aynı kalır); masaüstü ve Başlat menüsü kısayolu yok; compression store (hızlı);
//   publish { provider: generic, url: http://127.0.0.1:<port>/ } → app-update.yml yerel sunucuyu gösterir (sunucu.mjs).
// node_modules bir bağlantıysa (git worktree'de junction) electron-builder'ın bağımlılık toplayıcısı (npm ls) paketleri "extraneous"
// sayıp alt bağımlılıkları (conf, builder-util-runtime…) pakete koymuyor; o zaman proje, üretim bağımlılıklarının gerçek kopyasıyla
// <cikti>/../hazirlik klasörüne kurulup oradan derlenir.
// Derlemeden sonra app-update.yml, latest.yml ve asar'daki bağımlılıklar denetlenir; beklenmeyen bir şey varsa hata verir.
//
// Uçtan uca güncelleme testi (bu klasördeki araçlarla; kurulu gerçek PDEfe'ye dokunmaz):
//   1. kayit-goruntusu.ps1 -Cikti once.json            gerçek PDEfe'nin kayıt defteri/dosya izleri (sonda karsilastir.ps1 ile aynı olmalı)
//   2. core/dist/pdefe-core.exe'yi kurulu PDEfe'den kopyala; derle.mjs ile A (0.9.0), B (0.9.1), C (0.9.2) derle
//   3. sunucu.mjs --port 9914 --kok <çıktılar> --gunluk istekler.jsonl --yayinda 0.9.1 [--hiz 30000000]   (arka planda)
//   4. A'yı sessiz kur (PDEfe-Setup.exe /S); %APPDATA%\PDEfe Guncelleme Testi\ayarlar.json'a pencere { x: -2600, … } yaz (ekran dışı)
//   5. uygulama.ps1 -Islem ac|kapat (CDP 9911) ve senaryo.mjs adımları (ADIM=serit|dahaSonra|hataIndir|ertele|kur|ayarlarDenetle);
//      açılış sayacı: sunucu günlüğünde 1. ve 11. açılışta /latest.yml isteği olmalı, 2–10'da olmamalı
//   6. kurulum-izle.ps1 (arka planda) + ADIM=kur: sessiz kurulum (görünür pencere 0), "--updated" ile yeniden açılış, exe sürümü
//   7. gercek-islem.ps1 -Islem kaldir (deneme uygulamasının kaldırıcısı, userData, güncelleme önbelleği); son görüntü ve karşılaştırma
// Kabuk Claude masaüstü uygulamasının (MSIX) kumbarasındaysa kabuktan başlatılan kurucu ve uygulamanın %APPDATA%/%LOCALAPPDATA% ve
// HKCU yazmaları sanallaşır, güncellemeden sonra kurucunun yeniden açtığı uygulama ise gerçek oturumda çalışır (ayarları görmez).
// O durumda 4–7'yi gercek-oturum.ps1 + gercek-islem.ps1 (goruntu|durum|pencereAyarla|ac|kaldir|anahtarZamanlari) ile gerçek oturumda yapın.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import builder from 'electron-builder';
const require = createRequire(import.meta.url);

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (ad, varsayilan) => { const i = process.argv.indexOf('--' + ad); return i > 0 ? process.argv[i + 1] : varsayilan; };
const surum = arg('surum');
const cikti = path.resolve(KOK, arg('cikti', ''));
const port = Number(arg('port', 9914));
if (!/^\d+\.\d+\.\d+$/.test(surum || '') || !arg('cikti')) { console.error('Kullanım: node test/guncelleme-e2e/derle.mjs --surum 0.9.0 --cikti <klasör> [--port 9914]'); process.exit(2); }
if (!fs.existsSync(path.join(KOK, 'core', 'dist', 'pdefe-core.exe'))) { console.error('core/dist/pdefe-core.exe yok.'); process.exit(2); }

const TEST_URUN = 'PDEfe Guncelleme Testi';
const TEST_AD = 'pdefe-guncelleme-testi';
const TEST_APPID = 'com.cgrshn.pdefe.guncellemetest';

fs.mkdirSync(cikti, { recursive: true });

// Kayıt defterine yazmayan kurulum eklentisi
const nsh = fs.readFileSync(path.join(KOK, 'build', 'installer.nsh'), 'utf8')
  .split(/\r?\n/).filter((s) => !/\b(WriteReg\w*|DeleteReg\w*)\b|SHChangeNotify/.test(s)).join('\r\n');
if (/WriteReg|DeleteReg/.test(nsh)) throw new Error('Süzülmüş installer.nsh hâlâ kayıt defterine yazıyor.');
const nshYolu = path.join(cikti, 'installer-test.nsh');
fs.writeFileSync(nshYolu, nsh, 'utf8');

const c = yaml.load(fs.readFileSync(path.join(KOK, 'electron-builder.yml'), 'utf8'));
c.appId = TEST_APPID;
c.productName = TEST_URUN;
c.extraMetadata = { name: TEST_AD, productName: TEST_URUN, version: surum };
c.compression = 'store';
c.directories = { ...c.directories, output: cikti };
delete c.win.fileAssociations;
c.win.publish = { provider: 'generic', url: `http://127.0.0.1:${port}/` };
c.nsis = {
  ...c.nsis,
  include: nshYolu,
  createDesktopShortcut: false,
  createStartMenuShortcut: false,
  shortcutName: TEST_URUN,
  uninstallDisplayName: TEST_URUN,
};

// Proje klasörü: node_modules gerçek klasörse depo kökü, bağlantıysa hazırlık kopyası
let proje = KOK;
const nmGercek = fs.realpathSync(path.join(KOK, 'node_modules'));
if (path.resolve(nmGercek).toLowerCase() !== path.resolve(KOK, 'node_modules').toLowerCase()) {
  proje = path.join(path.dirname(cikti), 'hazirlik');
  console.log('node_modules bağlantı →', nmGercek, '; hazırlık klasörü:', proje);
  for (const ad of ['src', 'build']) { fs.rmSync(path.join(proje, ad), { recursive: true, force: true }); fs.cpSync(path.join(KOK, ad), path.join(proje, ad), { recursive: true }); }
  for (const ad of ['package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY.md', 'core/dist/pdefe-core.exe']) {
    fs.mkdirSync(path.dirname(path.join(proje, ad)), { recursive: true });
    fs.copyFileSync(path.join(KOK, ad), path.join(proje, ad));
  }
  // Üretim bağımlılıkları (npm ls, gerçek node_modules'ün bulunduğu depoda)
  let liste;
  try { liste = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: path.dirname(nmGercek), encoding: 'utf8', shell: true }); }
  catch (e) { liste = e.stdout || ''; }
  const paketler = liste.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && path.resolve(s).toLowerCase().startsWith(nmGercek.toLowerCase() + path.sep));
  if (paketler.length < 5) throw new Error('Üretim bağımlılıkları okunamadı:\n' + liste);
  const hedefNm = path.join(proje, 'node_modules');
  fs.rmSync(hedefNm, { recursive: true, force: true });
  for (const p of paketler) {
    const hedef = path.join(hedefNm, path.relative(nmGercek, p));
    if (!fs.existsSync(hedef)) fs.cpSync(p, hedef, { recursive: true });
  }
  console.log('üretim bağımlılıkları kopyalandı:', paketler.length);
  c.electronVersion = require(path.join(KOK, 'node_modules', 'electron', 'package.json')).version;
}

const yapilandirma = path.join(cikti, 'electron-builder-test.json');
fs.writeFileSync(yapilandirma, JSON.stringify(c, null, 2), 'utf8');
console.log('yapılandırma:', yapilandirma);

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
await builder.build({
  projectDir: proje,
  config: yapilandirma,
  targets: builder.Platform.WINDOWS.createTarget(['nsis'], builder.Arch.x64),
  publish: 'never',
});

// Denetim
const exe = path.join(cikti, 'win-unpacked', `${TEST_URUN}.exe`);
const guncellemeYml = yaml.load(fs.readFileSync(path.join(cikti, 'win-unpacked', 'resources', 'app-update.yml'), 'utf8'));
const latest = yaml.load(fs.readFileSync(path.join(cikti, 'latest.yml'), 'utf8'));
const hatalar = [];
if (!fs.existsSync(exe)) hatalar.push('exe yok: ' + exe);
if (guncellemeYml.provider !== 'generic' || guncellemeYml.url !== `http://127.0.0.1:${port}/`) hatalar.push('app-update.yml yerel sunucuyu göstermiyor');
if (guncellemeYml.updaterCacheDirName !== `${TEST_AD}-updater`) hatalar.push('updaterCacheDirName beklenmedik: ' + guncellemeYml.updaterCacheDirName);
if (latest.version !== surum) hatalar.push('latest.yml sürümü ' + latest.version);
if (!fs.existsSync(path.join(cikti, 'PDEfe-Setup.exe.blockmap'))) hatalar.push('blockmap yok');
// Paketteki bağımlılıklar: electron-store → conf, electron-updater → builder-util-runtime vb. eksikse uygulama açılmaz
const asar = require(path.join(KOK, 'node_modules', '@electron', 'asar'));
const asarDosyalari = asar.listPackage(path.join(cikti, 'win-unpacked', 'resources', 'app.asar')).map((s) => s.replace(/\\/g, '/'));
for (const p of ['conf', 'builder-util-runtime', 'fs-extra', 'js-yaml', 'lazy-val', 'semver', 'electron-store', 'electron-updater', 'pdf-lib', 'pdfjs-dist']) {
  if (!asarDosyalari.includes(`/node_modules/${p}/package.json`)) hatalar.push('pakette eksik bağımlılık: ' + p);
}
if (hatalar.length) { console.error('DENETİM BAŞARISIZ:\n  ' + hatalar.join('\n  ')); process.exit(1); }
console.log('app-update.yml:', JSON.stringify(guncellemeYml));
console.log('latest.yml:', latest.version, latest.path, latest.files?.[0]?.size);
