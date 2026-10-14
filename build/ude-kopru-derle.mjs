// UDE köprüsünün derleme betiği (0.2.6): core/ude_kopru/src/pdefe/UdeKopru.java → core/ude_kopru/ude-kopru.jar (Java 8 bayt kodu).
// Jar depoya girer: CI'ın ve paketlemenin Java'ya ihtiyacı yok (electron-builder.yml extraResources onu resources/ude-kopru/'ya koyar).
// Köprünün derleme bağımlılığı yok: UYAP Doküman Editörü'nün ve iText'in sınıflarına yalnızca yansımayla erişir.
// Jar'ın içine kaynak dosyanın SHA-256 özeti yazılır (pdefe/kaynak.sha256; satır sonları LF'ye çevrilerek: Windows'taki CRLF çalışma ağacı
// ile Mac / CI'daki LF aynı özeti versin); test/udf_donusum_testi.py jar'ın kaynakla tutarlı olduğunu bu özetle denetler.
//
// Kullanım:  node build/ude-kopru-derle.mjs [--denetle] [--zorla]
//   --denetle  derlemez; jar'daki özet kaynağınkiyle aynı mı (değilse çıkış kodu 1)
//   --zorla    özet aynı olsa da yeniden derler
// Derleyici: PDEFE_JAVAC, JAVA_HOME, Android Studio'nun jbr'si ya da PATH'teki javac (JDK 9+ ise --release 8, JDK 8 ise -source/-target 8).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KLASOR = path.join(KOK, 'core', 'ude_kopru');
const KAYNAK = path.join(KLASOR, 'src', 'pdefe', 'UdeKopru.java');
const JAR = path.join(KLASOR, 'ude-kopru.jar');
const OZET_ADI = 'pdefe/kaynak.sha256';
const WINDOWS = process.platform === 'win32';
const EXE = WINDOWS ? '.exe' : '';
const argv = new Set(process.argv.slice(2));

function kaynakOzeti() {
  const metin = fs.readFileSync(KAYNAK, 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(metin, 'utf8').digest('hex');
}

/** Jar'daki (zip) bir öğenin içeriği; yoksa null. Merkezî dizinden okunur (yalnızca saklanmış ve deflate). */
function jarOgesi(jar, ad) {
  const b = fs.readFileSync(jar);
  let son = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { son = i; break; }
  }
  if (son < 0) return null;
  const sayi = b.readUInt16LE(son + 10);
  let p = b.readUInt32LE(son + 16);
  for (let k = 0; k < sayi; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) return null;
    const yontem = b.readUInt16LE(p + 10);
    const sikisik = b.readUInt32LE(p + 20);
    const adUz = b.readUInt16LE(p + 28), ekUz = b.readUInt16LE(p + 30), yorumUz = b.readUInt16LE(p + 32);
    const yerel = b.readUInt32LE(p + 42);
    const oAd = b.toString('utf8', p + 46, p + 46 + adUz);
    if (oAd === ad) {
      const veriBas = yerel + 30 + b.readUInt16LE(yerel + 26) + b.readUInt16LE(yerel + 28);
      const veri = b.subarray(veriBas, veriBas + sikisik);
      return yontem === 0 ? veri : yontem === 8 ? zlib.inflateRawSync(veri) : null;
    }
    p += 46 + adUz + ekUz + yorumUz;
  }
  return null;
}

function jarOzeti() {
  if (!fs.existsSync(JAR)) return null;
  const v = jarOgesi(JAR, OZET_ADI);
  return v ? v.toString('utf8').trim() : null;
}

function javacBul() {
  const adaylar = [];
  if (process.env.PDEFE_JAVAC) adaylar.push(process.env.PDEFE_JAVAC);
  if (process.env.JAVA_HOME) adaylar.push(path.join(process.env.JAVA_HOME, 'bin', 'javac' + EXE));
  if (WINDOWS) {
    for (const pf of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      adaylar.push(path.join(pf, 'Android', 'Android Studio', 'jbr', 'bin', 'javac.exe'));
    }
  } else if (process.platform === 'darwin') {
    adaylar.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/javac');
  }
  for (const a of adaylar) if (a && fs.existsSync(a)) return a;
  const r = spawnSync(WINDOWS ? 'where' : 'which', ['javac'], { encoding: 'utf8' });
  const ilk = (r.stdout || '').split(/\r?\n/).find((s) => s.trim());
  if (r.status === 0 && ilk) return ilk.trim();
  throw new Error('javac bulunamadı. Bir JDK kurun ya da PDEFE_JAVAC ile javac yolunu verin (JDK 9+ ise --release 8 kullanılır).');
}

function calistir(komut, args, secenek = {}) {
  const r = spawnSync(komut, args, { encoding: 'utf8', windowsHide: true, ...secenek });
  if (r.error) throw r.error;
  return r;
}

function derle() {
  const javac = javacBul();
  const bin = path.dirname(javac);
  const surumMetni = (calistir(javac, ['-version']).stderr || '') + (calistir(javac, ['-version']).stdout || '');
  const m = /javac\s+(\d+)(?:\.(\d+))?/.exec(surumMetni);
  if (!m) throw new Error(`javac sürümü okunamadı: ${surumMetni.trim()}`);
  const ana = Number(m[1]) === 1 ? Number(m[2]) : Number(m[1]);
  if (ana < 8) throw new Error(`javac ${ana} eski; en az JDK 8 gerekir.`);
  const hedef = ana >= 9 ? ['--release', '8'] : ['-source', '8', '-target', '8'];
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'pdefe-ude-kopru-'));
  try {
    const siniflar = path.join(gecici, 'siniflar');
    fs.mkdirSync(siniflar, { recursive: true });
    console.log(`[ude-kopru] ${javac} (JDK ${ana}) ${hedef.join(' ')}`);
    const r = calistir(javac, [...hedef, '-encoding', 'UTF-8', '-g:source,lines', '-Xlint:-options', '-nowarn', '-d', siniflar, KAYNAK]);
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    if (r.status !== 0) throw new Error(`javac çıkış kodu ${r.status}`);
    fs.writeFileSync(path.join(siniflar, ...OZET_ADI.split('/')), kaynakOzeti() + '\n');
    const jarAraci = path.join(bin, 'jar' + EXE);
    if (!fs.existsSync(jarAraci)) throw new Error(`jar aracı yok: ${jarAraci}`);
    const yeni = path.join(gecici, 'ude-kopru.jar');
    // JDK 17+: --date sabit zaman damgası (yeniden derlemede jar baytları değişmesin); eski JDK'da yok
    const tarih = ana >= 17 ? ['--date=2026-01-01T00:00:00Z'] : [];
    const j = calistir(jarAraci, ['--create', '--file', yeni, '--main-class', 'pdefe.UdeKopru', ...tarih, '-C', siniflar, '.']);
    if (j.status !== 0) {
      process.stderr.write(j.stderr || '');
      throw new Error(`jar çıkış kodu ${j.status}`);
    }
    fs.copyFileSync(yeni, JAR);
  } finally {
    fs.rmSync(gecici, { recursive: true, force: true });
  }
  console.log(`[ude-kopru] ${path.relative(KOK, JAR)}: ${fs.statSync(JAR).size} bayt`);
}

try {
  const kaynak = kaynakOzeti();
  if (argv.has('--denetle')) {
    const jar = jarOzeti();
    if (jar !== kaynak) {
      console.error(`[ude-kopru] jar kaynakla tutarsız (jar: ${jar || 'yok'}, kaynak: ${kaynak}). "npm run ude-kopru:derle" çalıştırın.`);
      process.exit(1);
    }
    console.log('[ude-kopru] jar kaynakla tutarlı.');
  } else if (!argv.has('--zorla') && jarOzeti() === kaynak) {
    console.log('[ude-kopru] jar güncel (kaynak değişmedi); yeniden derlemek için --zorla.');
  } else {
    derle();
    if (jarOzeti() !== kaynak) throw new Error('derlenen jar\'da kaynak özeti yok');
  }
} catch (e) {
  console.error(`[ude-kopru] HATA: ${e.message}`);
  process.exit(1);
}
