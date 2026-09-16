// pdefe-core.exe derleme betiği: .venv içindeki PyInstaller ile core/pdefe-core.spec'i derler,
// çıktıyı core/dist/pdefe-core.exe'ye koyar, exe'yi başlatıp "ping" ile doğrular, süre ve boyutu yazar.
//
// Kullanım:  node build/cekirdek-derle.mjs [--temiz] [--atla-derleme]
//   --temiz         PyInstaller önbelleğini temizler (--clean)
//   --atla-derleme  Yalnızca var olan exe'yi sınar
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PYINSTALLER = path.join(KOK, '.venv', 'Scripts', 'pyinstaller.exe');
const SPEC = path.join(KOK, 'core', 'pdefe-core.spec');
const DIST = path.join(KOK, 'core', 'dist');
const WORK = path.join(KOK, 'build', 'pyinstaller-work');
const EXE = path.join(DIST, 'pdefe-core.exe');

const argv = new Set(process.argv.slice(2));

function mb(b) { return (b / 1048576).toFixed(2) + ' MB'; }

function calistir(cmd, args, secenekler = {}) {
  return new Promise((coz, reddet) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...secenekler });
    p.stdout.on('data', (d) => process.stdout.write(d));
    p.stderr.on('data', (d) => process.stderr.write(d));
    p.on('error', reddet);
    p.on('exit', (kod) => (kod === 0 ? coz() : reddet(new Error(`${path.basename(cmd)} çıkış kodu ${kod}`))));
  });
}

async function derle() {
  if (!fs.existsSync(PYINSTALLER)) {
    throw new Error(`PyInstaller bulunamadı: ${PYINSTALLER}\n.venv içine kurun: .venv\\Scripts\\python.exe -m pip install pyinstaller pyinstaller-hooks-contrib`);
  }
  if (!fs.existsSync(SPEC)) throw new Error(`Spec dosyası yok: ${SPEC}`);
  fs.mkdirSync(DIST, { recursive: true });
  fs.mkdirSync(WORK, { recursive: true });
  const args = ['--noconfirm', '--distpath', DIST, '--workpath', WORK];
  if (argv.has('--temiz')) args.push('--clean');
  args.push(SPEC);
  console.log(`[derle] ${PYINSTALLER} ${args.join(' ')}`);
  const t0 = Date.now();
  await calistir(PYINSTALLER, args, { cwd: KOK, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  console.log(`[derle] tamamlandı: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (!fs.existsSync(EXE)) throw new Error(`Derleme bitti ama exe yok: ${EXE}`);
}

function klasorBoyutu(klasor) {
  let toplam = 0;
  for (const ad of fs.readdirSync(klasor)) {
    const yol = path.join(klasor, ad);
    const st = fs.statSync(yol);
    toplam += st.isDirectory() ? klasorBoyutu(yol) : st.size;
  }
  return toplam;
}

/** exe'yi başlatır, stdin'e ping yazar, yanıtı bekler; {yanit, baslatmaMs, pingMs} döner. */
function sina(exe, zamanAsimiMs = 60000) {
  return new Promise((coz, reddet) => {
    const t0 = Date.now();
    const p = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' } });
    let stderr = '';
    let bitti = false;
    const zamanlayici = setTimeout(() => {
      if (bitti) return;
      bitti = true;
      p.kill();
      reddet(new Error(`Zaman aşımı: ${zamanAsimiMs} ms içinde ping yanıtı gelmedi.\n${stderr}`));
    }, zamanAsimiMs);
    p.on('error', (e) => { if (!bitti) { bitti = true; clearTimeout(zamanlayici); reddet(e); } });
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('exit', (kod) => {
      if (!bitti) { bitti = true; clearTimeout(zamanlayici); reddet(new Error(`exe yanıt vermeden kapandı (kod ${kod}).\n${stderr}`)); }
    });
    const rl = readline.createInterface({ input: p.stdout });
    const tGonder = Date.now();
    rl.on('line', (satir) => {
      if (bitti) return;
      let msg;
      try { msg = JSON.parse(satir); } catch { return; }
      if (msg.id !== 1) return;
      bitti = true;
      clearTimeout(zamanlayici);
      const sonuc = { yanit: msg, baslatmaMs: Date.now() - t0, pingMs: Date.now() - tGonder, stderr };
      p.stdin.end();
      setTimeout(() => { try { p.kill(); } catch {} }, 2000);
      if (msg.error) reddet(new Error(`ping hata döndürdü: ${JSON.stringify(msg.error)}`));
      else coz(sonuc);
    });
    p.stdin.write(JSON.stringify({ id: 1, method: 'ping', params: {} }) + '\n');
  });
}

async function ana() {
  if (!argv.has('--atla-derleme')) await derle();
  else console.log('[derle] atlandı (--atla-derleme)');

  const exeBoyut = fs.statSync(EXE).size;
  console.log(`[çıktı] ${EXE}  (${mb(exeBoyut)}); dist klasörü toplam ${mb(klasorBoyutu(DIST))}`);

  console.log('[sına] exe başlatılıyor ve ping gönderiliyor…');
  const s = await sina(EXE);
  const r = s.yanit.result || {};
  if (!r.ok) throw new Error(`Beklenmedik ping yanıtı: ${JSON.stringify(s.yanit)}`);
  console.log(`[sına] ping OK — çekirdek ${r.surum}, PyMuPDF ${r.pymupdf}; başlatma+yanıt ${s.baslatmaMs} ms`);
  if (s.stderr.trim()) console.log(`[sına] stderr:\n${s.stderr.trim()}`);
  // İkinci başlatma (onefile açılımı önbellekli değil; gerçekçi süre için tekrar ölç)
  const s2 = await sina(EXE);
  console.log(`[sına] ikinci başlatma+yanıt ${s2.baslatmaMs} ms`);
  console.log('[tamam] pdefe-core.exe çalışıyor.');
}

ana().catch((e) => {
  console.error('[hata]', e.message);
  process.exit(1);
});
