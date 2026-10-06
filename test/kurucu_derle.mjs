// Kurucu sınaması (0.2.3): deneme kimliğiyle ("Kurucu Sinama", test/kurucu_sinama.yml) Windows NSIS kurucusu derler. Gerçek PDEfe ile hiçbir
// kayıt, klasör, kısayol ve süreç adı paylaşılmaz; çıktı proje dışındaki bir klasöre yazılır (release\ ve core\dist'e dokunulmaz).
// Kullanım (proje kökünden):
//   node test/kurucu_derle.mjs --surum 90.0.1 --cikti <proje dışı klasör> [--yakala <klasör>] [--dur] [--koru]
//     --yakala  electron-builder'ın makensis betiği ve tanımları <klasör>\kurucu.json, kaldirici.json olarak yazılır (test/kurucu_yakala.cjs)
//     --dur     betik yakalanınca derleme durur, kurucu exe'si üretilmez (test/kurucu_karsilastir.mjs için yeter)
//     --koru    win-unpacked ve .nsis.7z silinmez (varsayılan: yalnızca KurucuSinama-Setup-<sürüm>.exe kalır)
// Sürüm numarası büyük seçilir (90.x): deneme uygulaması yanlışlıkla açılsa bile gerçek bir PDEfe sürümüyle karışmaz.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const proje = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gerek = createRequire(path.join(proje, 'node_modules', 'app-builder-lib', 'package.json'));
const yaml = gerek('js-yaml');

function secenek(ad, varsayilan = null) {
  const i = process.argv.indexOf(`--${ad}`);
  if (i < 0) return varsayilan;
  const deger = process.argv[i + 1];
  return deger == null || deger.startsWith('--') ? true : deger;
}

/** test/kurucu_sinama.yml, electron-builder.yml'den yalnızca bilerek ayrılan alanlarda ayrılmalı (yoksa sınanan kurucu gerçeğinden farklı olur). */
export function yapilandirmaFarklari() {
  const gercek = yaml.load(fs.readFileSync(path.join(proje, 'electron-builder.yml'), 'utf8'));
  const deneme = yaml.load(fs.readFileSync(path.join(proje, 'test', 'kurucu_sinama.yml'), 'utf8'));
  const farklar = [];
  const esit = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const nsisAyrilan = new Set(['shortcutName', 'runAfterFinish', 'include', 'uninstallDisplayName', 'artifactName', 'differentialPackage']);
  for (const k of new Set([...Object.keys(gercek.nsis), ...Object.keys(deneme.nsis)])) {
    if (!nsisAyrilan.has(k) && !esit(gercek.nsis[k], deneme.nsis[k])) farklar.push(`nsis.${k}: ${JSON.stringify(gercek.nsis[k])} ≠ ${JSON.stringify(deneme.nsis[k])}`);
  }
  for (const k of ['target', 'icon', 'requestedExecutionLevel']) {
    if (!esit(gercek.win[k], deneme.win[k])) farklar.push(`win.${k}`);
  }
  const ilisk = (l) => (l || []).map(({ ext, role, icon }) => ({ ext, role, icon }));
  if (!esit(ilisk(gercek.win.fileAssociations), ilisk(deneme.win.fileAssociations))) farklar.push('win.fileAssociations (ext / role / icon)');
  for (const k of ['asar', 'electronLanguages', 'electronFuses', 'files', 'npmRebuild', 'nodeGypRebuild']) {
    if (!esit(gercek[k], deneme[k])) farklar.push(k);
  }
  if (deneme.publish !== null) farklar.push('publish: null olmalı');
  if (deneme.nsis.runAfterFinish !== false) farklar.push('nsis.runAfterFinish: false olmalı');
  if (deneme.appId === gercek.appId || deneme.productName === gercek.productName) farklar.push('appId / productName gerçek PDEfe ile aynı');
  return farklar;
}

/** release\ ve core\dist'in (git dışı) ve git'in gördüğü değişikliklerin durumu: derleme projeye bir şey yazmamalı. */
function projeDurumu() {
  const s = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: proje, encoding: 'utf8' });
  const satirlar = new Set((s.stdout || '').split('\n').filter(Boolean));
  for (const k of ['release', path.join('core', 'dist')]) {
    const tam = path.join(proje, k);
    if (!fs.existsSync(tam)) { satirlar.add(`${k}: yok`); continue; }
    for (const f of fs.readdirSync(tam)) satirlar.add(`${k}\\${f}: ${fs.statSync(path.join(tam, f)).mtimeMs}`);
  }
  return satirlar;
}

/** Deneme kurucusunu derler; { exe, yakalama } döner. */
export function kurucuDerle({ surum, cikti, yakala = null, dur = false, koru = false, sessiz = false }) {
  if (!/^\d+\.\d+\.\d+$/.test(String(surum))) throw new Error(`sürüm x.y.z olmalı: ${surum}`);
  const ciktiTam = path.resolve(String(cikti));
  if ((ciktiTam + path.sep).toLowerCase().startsWith((proje + path.sep).toLowerCase())) {
    throw new Error(`çıktı klasörü proje dışında olmalı (release\\ ve core\\dist'e dokunulmaz): ${ciktiTam}`);
  }
  const farklar = yapilandirmaFarklari();
  if (farklar.length) throw new Error(`test/kurucu_sinama.yml electron-builder.yml'den ayrılmış:\n  ${farklar.join('\n  ')}`);
  fs.mkdirSync(ciktiTam, { recursive: true });
  const once = projeDurumu();
  const ortam = { ...process.env };
  delete ortam.PDEFE_KURUCU_YAKALA;
  delete ortam.PDEFE_KURUCU_YAKALA_DUR;
  if (yakala) ortam.PDEFE_KURUCU_YAKALA = path.resolve(String(yakala));
  if (dur) ortam.PDEFE_KURUCU_YAKALA_DUR = '1';
  const arg = ['--require', path.join(proje, 'test', 'kurucu_yakala.cjs'), path.join(proje, 'node_modules', 'electron-builder', 'cli.js'),
    '--win', 'nsis', '--x64', '--publish', 'never', '--config', path.join('test', 'kurucu_sinama.yml'),
    `-c.extraMetadata.version=${surum}`, `-c.directories.output=${ciktiTam}`];
  const bas = Date.now();
  const s = spawnSync(process.execPath, arg, { cwd: proje, env: ortam, encoding: 'utf8', maxBuffer: 1 << 26 });
  const gunluk = `${s.stdout || ''}\n${s.stderr || ''}`;
  fs.writeFileSync(path.join(ciktiTam, `derleme-${surum}.log`), gunluk);
  // Aynı çalışma ağacında başka bir iş de dosya değiştirebilir: git'in gördüğü yeni değişiklik yalnızca uyarıdır, release\ ve core\dist hatadır
  const yeni = [...projeDurumu()].filter((x) => !once.has(x));
  const korunan = yeni.filter((x) => /^(release|core\\dist)[\\:]/.test(x));
  if (korunan.length) throw new Error(`derleme release\\ ya da core\\dist'i değiştirdi:\n  ${korunan.join('\n  ')}`);
  if (yeni.length && !sessiz) console.log(`UYARI derleme sırasında çalışma ağacında yeni değişiklik görüldü (başka bir iş olabilir):\n  ${yeni.join('\n  ')}`);
  const exe = path.join(ciktiTam, `KurucuSinama-Setup-${surum}.exe`);
  if (dur) {
    // Durdurulan derlemede bu ad, kaldırıcıyı yazan ara exe'dir (BUILD_UNINSTALLER), kurucu değil: karışmasın diye silinir
    fs.rmSync(exe, { force: true });
    const kurucuJson = yakala && path.join(path.resolve(String(yakala)), 'kurucu.json');
    if (!kurucuJson || !fs.existsSync(kurucuJson) || !/PDEFE_KURUCU_YAKALANDI/.test(gunluk)) {
      throw new Error(`betik yakalanamadı (çıkış ${s.status}); günlük: ${path.join(ciktiTam, `derleme-${surum}.log`)}`);
    }
  } else if (s.status !== 0 || !fs.existsSync(exe)) {
    throw new Error(`derleme başarısız (çıkış ${s.status}); günlük: ${path.join(ciktiTam, `derleme-${surum}.log`)}`);
  }
  if (!koru) {
    fs.rmSync(path.join(ciktiTam, 'win-unpacked'), { recursive: true, force: true, maxRetries: 5 });
    for (const f of fs.readdirSync(ciktiTam)) {
      if (/\.nsis\.7z$|__uninstaller\.exe$/i.test(f)) fs.rmSync(path.join(ciktiTam, f), { force: true });
    }
  }
  if (!sessiz) console.log(`${dur ? 'betik yakalandı' : exe} (${((Date.now() - bas) / 1000).toFixed(0)} sn)`);
  return { exe: dur ? null : exe, yakalama: yakala ? path.resolve(String(yakala)) : null };
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    const surum = secenek('surum');
    const cikti = secenek('cikti');
    if (!surum || !cikti || surum === true || cikti === true) {
      console.error('Kullanım: node test/kurucu_derle.mjs --surum 90.0.1 --cikti <proje dışı klasör> [--yakala <klasör>] [--dur] [--koru]');
      process.exit(2);
    }
    const yakala = secenek('yakala');
    kurucuDerle({ surum, cikti, yakala: yakala === true ? null : yakala, dur: !!secenek('dur', false), koru: !!secenek('koru', false) });
  } catch (h) {
    console.error(`HATA ${h.message}`);
    process.exit(1);
  }
}
