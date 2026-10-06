// Kurucu sınaması (0.2.3): build/installer.nsh değişince uygulama içi güncelleme (--updated /S) ve sessiz kurulum (/S) yollarının derlenmiş
// hâli değişmedi mi? electron-builder'ın ürettiği aynı NSIS betiği (deneme derlemesinden yakalanır, test/kurucu_yakala.cjs) iki kez derlenir:
// önceki sürümün build/installer.nsh'iyle (varsayılan: son etiket) ve çalışma ağacındakiyle. makensis -V4 günlüğünden işlev / bölüm gövdeleri
// (çözülmüş yönergeler) satır satır karşılaştırılır:
//   - kurucu: sessiz kipte çalışan kod: .onInit, bütün bölümler (install), .onInstSuccess / .onInstFailed ve bunların Call ettiği işlevler
//     (uninstallOldVersion, handleUninstallResult, setInstallSectionSpaceRequired …). Sayfa işlevleri sessiz kipte hiç çağrılmaz.
//   - kaldırıcı: bütün işlevler ve bölümler.
// İki derlemede de kayıt adları installer.nsh'in kendi (gerçek) değerleridir: deneme sarmalayıcısı (test/kurucu_sinama.nsh) atlanır, installer.nsh
// doğrudan içeri alınır; runAfterFinish gerçek yapılandırmadaki gibi açıktır (HIDE_RUN_AFTER_FINISH tanımlanmaz). Exe'ler çalıştırılmaz, silinir.
// Kullanım (proje kökünden): node test/kurucu_karsilastir.mjs [--ref v0.2.2] [--yakalama <klasör>] [--nsh <yol>] [--ayrinti]
//   --yakalama  test/kurucu_derle.mjs --yakala ile önceden yakalanmış kurucu.json / kaldirici.json (yoksa durdurulan bir deneme derlemesi yapılır)
//   --nsh       çalışma ağacındaki yerine bu installer.nsh (karşılaştırmanın farkı yakaladığını sınamak için)
// Çıkış: 0 aynı, 1 fark var, 2 hata.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { kurucuDerle } from './kurucu_derle.mjs';

const proje = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gerek = createRequire(path.join(proje, 'node_modules', 'app-builder-lib', 'package.json'));
const { nsisEscapeString } = gerek('./out/targets/nsis/nsisScriptGenerator.js');

function secenek(ad, varsayilan = null) {
  const i = process.argv.indexOf(`--${ad}`);
  if (i < 0) return varsayilan;
  const deger = process.argv[i + 1];
  return deger == null || deger.startsWith('--') ? true : deger;
}
const ayrinti = !!secenek('ayrinti', false);

function git(...arg) {
  const s = spawnSync('git', arg, { cwd: proje, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (s.status !== 0) throw new Error(`git ${arg.join(' ')}: ${s.stderr}`);
  return s.stdout;
}

/** Yakalanan betiği verilen installer.nsh ile -V4 derler, günlüğü döner. */
function derle(kayit, nsh, gecici, ad) {
  const satirlar = kayit.script.split('\n');
  const sarmalayici = satirlar.findIndex((s) => /^!include ".*[\\/]test[\\/]kurucu_sinama\.nsh"$/.test(s.trim()));
  if (sarmalayici < 0) throw new Error(`${kayit.tur}: betikte test\\kurucu_sinama.nsh içermesi yok`);
  satirlar[sarmalayici] = `!include "${nsh}"`;
  const yerTutucu = path.join(gecici, 'yer-tutucu.bin');
  fs.writeFileSync(yerTutucu, 'x');
  const tanimlar = { ...kayit.defines };
  delete tanimlar.HIDE_RUN_AFTER_FINISH;   // gerçek yapılandırma: runAfterFinish true
  for (const k of ['APP_64', 'APP_32', 'APP_ARM64', 'UNINSTALLER_OUT_FILE']) if (k in tanimlar) tanimlar[k] = yerTutucu;
  const cikis = path.join(gecici, `${ad}.exe`);
  const komutlar = { ...kayit.commands, OutFile: `"${cikis}"`, SetCompress: 'off' };
  const arg = ['-WX', '-INPUTCHARSET', 'UTF8', '-V4', '-DLOGICLIB_VERBOSITY=4'];
  for (const [k, v] of Object.entries(tanimlar)) arg.push(v == null ? `-D${k}` : `-D${k}=${nsisEscapeString(String(v))}`);
  for (const [k, v] of Object.entries(komutlar)) {
    for (const c of Array.isArray(v) ? v : [v]) arg.push(`-X${k} ${c}`);
  }
  arg.push('-');
  const s = spawnSync(kayit.makensis.path, arg, {
    input: satirlar.join('\n'), cwd: kayit.sablonKlasoru, encoding: 'utf8', maxBuffer: 1 << 28,
    env: { ...process.env, ...(kayit.makensis.env || {}) },
  });
  fs.rmSync(cikis, { force: true });
  fs.writeFileSync(path.join(gecici, `${ad}.log`), `${s.stdout || ''}\n${s.stderr || ''}`);
  if (s.status !== 0) throw new Error(`${ad}: makensis çıkış ${s.status}; günlük ${path.join(gecici, `${ad}.log`)}\n${(s.stderr || s.stdout || '').slice(-1500)}`);
  return s.stdout;
}

/** -V4 günlüğünden işlev / bölüm gövdeleri ve sayfa listesi. Önişlemci satırları atılır; sayaçtan gelen etiket numaraları silinir. */
function cozumle(gunluk, diller) {
  const govdeler = new Map();
  const sayfalar = [];
  let ad = null;
  for (const satir of gunluk.split(/\r?\n/)) {
    const f = satir.match(/^(Function|Section): "([^"]+)"/);
    if (f) { ad = f[2]; govdeler.set(ad, []); continue; }
    if (/^(FunctionEnd|SectionEnd)\b/.test(satir)) { ad = null; continue; }
    if (/^(Page|UninstPage|PageEx|PageCallbacks)\b/.test(satir)) sayfalar.push(satir.replace(/_\d+(\.\d+)+/g, '_N'));
    if (!ad || /^(!|\s*$|warning|Processing|Processed)/.test(satir)) continue;
    govdeler.get(ad).push(satir.replace(/_LogicLib_([A-Za-z]*)_\d+/g, '_LogicLib_$1_N').replace(/_\d+(\.\d+)+/g, '_N'));
  }
  return { govdeler, sayfalar, diller };
}

/** Kaynaktaki LangString tanımları (betiğe gömülü electron-builder iletileri, sonra installer.nsh'teki customHeader); son tanım geçerlidir. */
function dilTablosu(betik, nsh) {
  const tablo = new Map();
  for (const metin of [betik, fs.readFileSync(nsh, 'utf8')]) {
    for (const m of metin.matchAll(/^\s*LangString\s+(\S+)\s+(\d+|\$\{LANG_\w+\})\s+"(.*)"\s*$/gm)) {
      tablo.set(`${m[1]} ${m[2] === '${LANG_TURKISH}' ? '1055' : m[2]}`, m[3]);
    }
  }
  return tablo;
}

/** Sessiz kipte çalışan kod: giriş noktaları (.onInit, bölümler, .onInstSuccess / .onInstFailed) ve Call ettikleri (geçişli). */
function sessizKapanis(govdeler, bolumler) {
  const kuyruk = [...govdeler.keys()].filter((a) => ['.onInit', '.onInstSuccess', '.onInstFailed'].includes(a) || bolumler.has(a));
  const gorulen = new Set();
  while (kuyruk.length) {
    const a = kuyruk.shift();
    if (gorulen.has(a) || !govdeler.has(a)) continue;
    gorulen.add(a);
    for (const s of govdeler.get(a)) {
      const c = s.match(/^Call "([^":][^"]*)"/);
      if (c) kuyruk.push(c[1]);
    }
  }
  return gorulen;
}

function bolumAdlari(gunluk) {
  return new Set([...gunluk.matchAll(/^Section: "([^"]+)"/gm)].map((m) => m[1]));
}

function karsilastir(baslik, eski, yeni, adlar) {
  let fark = 0;
  console.log(`${baslik}: ${adlar.length} işlev / bölüm`);
  for (const a of adlar) {
    const ea = eski.govdeler.get(a), eb = yeni.govdeler.get(a);
    if (!ea || !eb) { fark++; console.log(`  FARKLI ${a}: ${!ea ? 'önceki derlemede yok' : 'yeni derlemede yok'}`); continue; }
    const farklar = [];
    for (let i = 0; i < Math.max(ea.length, eb.length); i++) if (ea[i] !== eb[i]) farklar.push(i);
    if (farklar.length) {
      fark++;
      console.log(`  FARKLI ${a}: önceki ${ea.length}, yeni ${eb.length} satır`);
      for (const i of farklar.slice(0, 8)) console.log(`    ${i}: önceki «${ea[i] ?? ''}» | yeni «${eb[i] ?? ''}»`);
    } else if (ayrinti) {
      console.log(`  AYNI   ${a} (${ea.length} satır)`);
    }
  }
  if (!fark) console.log(`  hepsi AYNI (${adlar.reduce((t, a) => t + eski.govdeler.get(a).length, 0)} satır)`);
  return fark;
}

function bilgi(baslik, eski, yeni, karsilastirilan) {
  const yalnizEski = [...eski.govdeler.keys()].filter((a) => !yeni.govdeler.has(a));
  const yalnizYeni = [...yeni.govdeler.keys()].filter((a) => !eski.govdeler.has(a));
  const degisen = [...yeni.govdeler.keys()].filter((a) => !karsilastirilan.includes(a) && eski.govdeler.has(a)
    && eski.govdeler.get(a).join('\n') !== yeni.govdeler.get(a).join('\n'));
  if (yalnizEski.length) console.log(`  bilgi (${baslik}): yalnızca öncekinde: ${yalnizEski.join(', ')}`);
  if (yalnizYeni.length) console.log(`  bilgi (${baslik}): yalnızca yenide: ${yalnizYeni.join(', ')}`);
  if (degisen.length) console.log(`  bilgi (${baslik}): gövdesi değişen (karşılaştırma dışı): ${degisen.join(', ')}`);
  if (eski.sayfalar.join('\n') !== yeni.sayfalar.join('\n')) {
    console.log(`  bilgi (${baslik}): sayfa listesi değişti`);
    console.log(`    önceki: ${eski.sayfalar.join(' | ')}`);
    console.log(`    yeni:   ${yeni.sayfalar.join(' | ')}`);
  }
  const dilFark = [...new Set([...eski.diller.keys(), ...yeni.diller.keys()])].filter((k) => eski.diller.get(k) !== yeni.diller.get(k));
  for (const k of dilFark) console.log(`  bilgi (${baslik}): LangString ${k}: «${eski.diller.get(k) ?? '-'}» → «${yeni.diller.get(k) ?? '-'}»`);
}

try {
  const ref = secenek('ref') && secenek('ref') !== true ? secenek('ref') : git('describe', '--tags', '--abbrev=0').trim();
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'pdefe-kurucu-kars-'));
  let yakalama = secenek('yakalama');
  if (!yakalama || yakalama === true) {
    yakalama = path.join(gecici, 'betik');
    kurucuDerle({ surum: '90.0.1', cikti: path.join(gecici, 'derleme'), yakala: yakalama, dur: true, sessiz: true });
  }
  const eskiNsh = path.join(gecici, `installer-${ref.replace(/[^\w.-]/g, '_')}.nsh`);
  fs.writeFileSync(eskiNsh, git('show', `${ref}:build/installer.nsh`));
  const nshSecenegi = secenek('nsh');
  const yeniNsh = nshSecenegi && nshSecenegi !== true ? path.resolve(nshSecenegi) : path.join(proje, 'build', 'installer.nsh');
  console.log(`önceki: ${ref}:build/installer.nsh · yeni: ${nshSecenegi ? yeniNsh : 'çalışma ağacındaki build/installer.nsh'}`);
  let fark = 0;
  for (const tur of ['kurucu', 'kaldirici']) {
    const kayit = JSON.parse(fs.readFileSync(path.join(yakalama, `${tur}.json`), 'utf8'));
    const g1 = derle(kayit, eskiNsh, gecici, `${tur}-onceki`);
    const g2 = derle(kayit, yeniNsh, gecici, `${tur}-yeni`);
    const eski = cozumle(g1, dilTablosu(kayit.script, eskiNsh)), yeni = cozumle(g2, dilTablosu(kayit.script, yeniNsh));
    const bolumler = new Set([...bolumAdlari(g1), ...bolumAdlari(g2)]);
    let adlar;
    if (tur === 'kurucu') {
      adlar = [...new Set([...sessizKapanis(eski.govdeler, bolumler), ...sessizKapanis(yeni.govdeler, bolumler)])];
      fark += karsilastir('kurucu, sessiz kipte çalışan kod (.onInit, bölümler ve çağırdıkları)', eski, yeni, adlar);
    } else {
      adlar = [...new Set([...eski.govdeler.keys(), ...yeni.govdeler.keys()])];
      fark += karsilastir('kaldırıcı, bütün işlevler ve bölümler', eski, yeni, adlar);
    }
    bilgi(tur, eski, yeni, adlar);
  }
  fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5 });
  console.log(fark ? `SONUÇ: ${fark} FARK` : 'SONUÇ: sessiz kurulum, uygulama içi güncelleme ve kaldırıcı değişmedi');
  process.exit(fark ? 1 : 0);
} catch (h) {
  console.error(`HATA ${h.message}`);
  process.exit(2);
}
