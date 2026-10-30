// Sağ tık menüsünün kabuk eklentisini derler (0.3.1): sagtik/ (Rust, windows-rs), cargo build --release --locked, çıktıyı
// sagtik/dist/PDEfeSagTik.dll'e kopyalar (electron-builder.yml win.extraResources), dışa açtığı işlevleri ve bağımlılıklarını denetler.
// Yalnız Windows'ta; başka sistemde hiçbir şey yapmaz (macOS'ta Hızlı Eylemleri PDEfe kendisi kurar: src/main/sagtik.js).
//
// Kullanım:  node build/sagtik-derle.mjs [--sina]
//   --sina   ardından sınamalar: cargo test --release (birim testleri ve tests/dll.rs; kayıt defterine yazmaz, Gezgin'e dokunmaz)
// Gerekenler: Rust (rustup, x86_64-pc-windows-msvc) ve Visual Studio Build Tools'un C++ bağlayıcısı. GitHub'ın Windows makinesinde hazır.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAGTIK = path.join(KOK, 'sagtik');
const CIKTI = path.join(SAGTIK, 'dist', 'PDEfeSagTik.dll');
const DERLENEN = path.join(SAGTIK, 'target', 'release', 'pdefe_sagtik.dll');
const argv = new Set(process.argv.slice(2));

function cargoYolu() {
  const ev = path.join(os.homedir(), '.cargo', 'bin', 'cargo.exe');
  return fs.existsSync(ev) ? ev : 'cargo';
}

function calistir(cmd, args) {
  return new Promise((coz, reddet) => {
    const p = spawn(cmd, args, { cwd: SAGTIK, stdio: 'inherit', windowsHide: true });
    p.on('error', reddet);
    p.on('exit', (kod) => (kod === 0 ? coz() : reddet(new Error(`${path.basename(cmd)} ${args[0]} çıkış kodu ${kod}`))));
  });
}

/** PE dosyasının dışa açtığı adlar ve içe aldığı DLL'ler (dumpbin'siz, başlıkları okuyarak). */
export function peOzeti(bayt) {
  const u32 = (o) => bayt.readUInt32LE(o), u16 = (o) => bayt.readUInt16LE(o);
  const pe = u32(0x3c);
  if (bayt.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('PE değil');
  const makine = u16(pe + 4), bolumSayisi = u16(pe + 6), secenekBoyu = u16(pe + 20);
  const sec = pe + 24;
  const pe32arti = u16(sec) === 0x20b;
  const dizinler = sec + (pe32arti ? 112 : 96);
  const bolumler = [];
  for (let i = 0; i < bolumSayisi; i++) {
    const b = sec + secenekBoyu + i * 40;
    bolumler.push({ va: u32(b + 12), boy: u32(b + 8), ham: u32(b + 20) });
  }
  const dosyada = (rva) => { const b = bolumler.find((x) => rva >= x.va && rva < x.va + Math.max(x.boy, 1)); return b ? rva - b.va + b.ham : -1; };
  const ad = (rva) => { const o = dosyada(rva); let s = ''; for (let i = o; i >= 0 && bayt[i]; i++) s += String.fromCharCode(bayt[i]); return s; };
  const disa = [];
  const ed = u32(dizinler);
  if (ed) {
    const o = dosyada(ed), n = u32(o + 24), adlar = dosyada(u32(o + 32));
    for (let i = 0; i < n; i++) disa.push(ad(u32(adlar + i * 4)));
  }
  const ice = [];
  const id = u32(dizinler + 8);
  if (id) {
    for (let o = dosyada(id); u32(o + 12); o += 20) ice.push(ad(u32(o + 12)).toLowerCase());
  }
  return { makine, disa, ice };
}

/** Gezgin'in içinde yüklenecek DLL: yalnızca iki COM girişi dışa açık, yalnızca Windows'un kendi DLL'lerine bağlı (C çalışma kitaplığı gömülü). */
export function dllDenetle(yol) {
  const o = peOzeti(fs.readFileSync(yol));
  const hatalar = [];
  if (o.makine !== 0x8664) hatalar.push(`x64 değil (makine 0x${o.makine.toString(16)})`);
  if (JSON.stringify([...o.disa].sort()) !== JSON.stringify(['DllCanUnloadNow', 'DllGetClassObject'])) hatalar.push(`dışa açılanlar: ${o.disa.join(', ')}`);
  const izinli = /^(kernel32|user32|ntdll|shlwapi|shell32|ole32|oleaut32|combase|advapi32|api-ms-win-[a-z0-9-]+)\.dll$/;
  const yabanci = o.ice.filter((d) => !izinli.test(d));
  if (yabanci.length) hatalar.push(`Windows dışı bağımlılık: ${yabanci.join(', ')} (vcruntime ise .cargo/config.toml crt-static)`);
  return { ...o, hatalar };
}

async function ana() {
  if (process.platform !== 'win32') { console.log('[sağ tık] yalnızca Windows\'ta derlenir, atlandı'); return; }
  const cargo = cargoYolu();
  const t0 = Date.now();
  await calistir(cargo, ['build', '--release', '--locked']);
  fs.mkdirSync(path.dirname(CIKTI), { recursive: true });
  fs.copyFileSync(DERLENEN, CIKTI);
  const d = dllDenetle(CIKTI);
  console.log(`[sağ tık] ${CIKTI}: ${(fs.statSync(CIKTI).size / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s; dışa: ${d.disa.join(', ')}; bağımlılık: ${d.ice.join(', ')}`);
  if (d.hatalar.length) throw new Error('DLL denetimi: ' + d.hatalar.join('; '));
  if (argv.has('--sina')) await calistir(cargo, ['test', '--release', '--locked']);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ana().catch((e) => { console.error(`[sağ tık] HATA: ${e.message}`); process.exit(1); });
}
