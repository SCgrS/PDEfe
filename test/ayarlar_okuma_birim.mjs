// Ayar dosyasının açılışta okunması (src/main/ayarlar.js; 0.2.10 inceleme bulgusu). Ayar deposu (electron-store) açılış bittikten sonra
// yüklenir; o ana dek ayarlar ayarlar.json'un kopyasından okunur. Kopya yalnızca dosya yoksa ya da bozuksa varsayılanlara düşmeli: dosya o an
// okunamıyorsa (başka bir program paylaşımsız açmış) varsayılanlarla açılan arayüz son açılanları ve sayfa konumlarını bu boş kopyadan alıp
// bütünüyle yazdığı için kayıtlı olanlar silinirdi. Beklenen: geçici kilitte kısa aralıklarla yeniden denenip gerçek ayarlar okunur; kilit
// sürerse açılış hatası (kullanıcıya dönük ileti), dosya değişmez.
// Electron gerekmez: 'electron' modülü küçük bir taklitle değiştirilir (node:module registerHooks); electron-store ve conf gerçek. Dosya
// test/kilitle.py ile paylaşımsız açık tutulur (okuma EBUSY).
// Kullanım (depo kökünden): node test\ayarlar_okuma_birim.mjs      çıkış kodu: hata varsa 1
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PY = fs.existsSync(path.join(KOK, '.venv', 'Scripts', 'python.exe')) ? path.join(KOK, '.venv', 'Scripts', 'python.exe') : 'python';
const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'pdefe-ayarlar-birim-'));
let hata = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => { toplam++; if (!kosul) hata++; console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${!kosul && ek !== '' ? ' | ' + (typeof ek === 'string' ? ek : JSON.stringify(ek)) : ''}`); };

// ---------------------------------------------------------------- 'electron' taklidi
globalThis.__electronTaklidi = { veri: '' };
const TAKLIT = path.join(GECICI, 'electron-taklidi.mjs');
fs.writeFileSync(TAKLIT, `const t = globalThis.__electronTaklidi;
export const app = { getPath: (ad) => (ad === 'userData' ? t.veri : ${JSON.stringify(GECICI)}), getVersion: () => '0.0.0', getName: () => 'PDEfe', isPackaged: false };
export const ipcMain = { on() {}, handle() {} };
export const shell = {};
export default { app, ipcMain, shell };
`);
registerHooks({ resolve: (ozel, baglam, sonraki) => (ozel === 'electron' ? { url: pathToFileURL(TAKLIT).href, shortCircuit: true } : sonraki(ozel, baglam)) });

let sayac = 0;
/** Her durumda ayarlar.js'in taze bir örneği (modül durumu: kopya, depo, bekleyen yazımlar) ve kendi veri klasörü. */
async function taze(ayarlar) {
  const veri = path.join(GECICI, `veri-${++sayac}`);
  fs.mkdirSync(veri, { recursive: true });
  if (ayarlar !== undefined) fs.writeFileSync(path.join(veri, 'ayarlar.json'), typeof ayarlar === 'string' ? ayarlar : JSON.stringify(ayarlar, null, 2));
  globalThis.__electronTaklidi.veri = veri;
  const m = await import(pathToFileURL(path.join(KOK, 'src', 'main', 'ayarlar.js')).href + '?durum=' + sayac);
  return { m, veri, dosya: path.join(veri, 'ayarlar.json') };
}
/** Dosyayı sure saniye paylaşımsız açık tutar; kilit alınınca döner (süreç). */
async function kilitle(dosya, sure) {
  const p = spawn(PY, [path.join(KOK, 'test', 'kilitle.py'), dosya, String(sure)], { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
  await new Promise((coz, reddet) => {
    p.stdout.on('data', (d) => { if (/kilitlendi/.test(String(d))) coz(); });
    p.on('exit', () => reddet(new Error('kilitlenemedi')));
  });
  return p;
}
const bitmesi = (p) => new Promise((c) => { if (p.exitCode != null) c(); else p.on('exit', c); });
const ozet = (dosya) => crypto.createHash('sha256').update(fs.readFileSync(dosya)).digest('hex');
const KAYITLI = { tema: 'koyu', sonDosyalar: ['C:\\Ornek\\birinci.pdf', 'C:\\Ornek\\ikinci.pdf'], sayfaKonumlari: { 'C:\\Ornek\\ikinci.pdf': 7 } };
const eskiUyari = console.warn; console.warn = () => {};

try {
  {
    const { m } = await taze();
    kontrol('dosya yok: varsayılanlar (Sistemi izle, son açılan yok)', m.ayarAl('tema') === 'sistem' && m.ayarAl('sonDosyalar').length === 0);
    m.ayarKoy('yaziBoyutu', 14);
    kontrol('dosya yok: yazım depo yüklenene dek bekler', m.bekleyenYazimVar() === true && m.ayarAl('yaziBoyutu') === 14);
  }
  {
    const { m } = await taze('{ bozuk JSON');
    kontrol('bozuk dosya: varsayılanlar (depo da clearInvalidConfig ile böyle başlar)', m.ayarAl('tema') === 'sistem');
  }
  {
    const { m } = await taze({ ...KAYITLI, sonZoom: 150, varsayilanZoom: 'son' });
    kontrol('okunabilen dosya: kayıtlı ayarlar, taşımalar uygulanmış', m.ayarAl('tema') === 'koyu' && m.ayarAl('sonDosyalar').length === 2 && m.ayarAl('varsayilanZoom') === 'genislik' && !('sonZoom' in m.tumAyarlar()));
  }
  {
    // Geçici kilit (virüs tarayıcısı, yedekleme dosyayı bir an paylaşımsız açtı): kısa aralıklarla yeniden denenir, gerçek ayarlar okunur
    const { m, dosya } = await taze(KAYITLI);
    const k = await kilitle(dosya, 0.15);
    let tema = null, son = null, hataMetni = '';
    try { tema = m.ayarAl('tema'); son = m.ayarAl('sonDosyalar'); } catch (e) { hataMetni = e.message; }
    kontrol('geçici kilit: varsayılanlara düşülmedi, kayıtlı ayarlar okundu', tema === 'koyu' && Array.isArray(son) && son.length === 2, { tema, son: son?.length, hataMetni });
    await bitmesi(k);
    try {
      m.ayarKoy('sonDosyalar', ['C:\\Ornek\\ucuncu.pdf', ...KAYITLI.sonDosyalar]);
      const j = JSON.parse(fs.readFileSync(dosya, 'utf8'));
      kontrol('geçici kilit: sonraki yazım listeyi koruyor (dosyada 3 son açılan, sayfa konumu yerinde)', j.sonDosyalar?.length === 3 && j.sayfaKonumlari?.['C:\\Ornek\\ikinci.pdf'] === 7, j);
    } catch (e) { kontrol('geçici kilit: sonraki yazım listeyi koruyor', false, e.message); }
  }
  {
    // Kalıcı kilit: açılış hatası (anaSurec.js "PDEfe açılamadı"), kullanıcıya dönük ileti; dosya değişmez
    const { m, dosya } = await taze(KAYITLI);
    const once = ozet(dosya);
    const k = await kilitle(dosya, 3);
    let deger, hataNesnesi = null;
    const t0 = Date.now();
    try { deger = m.ayarAl('tema'); } catch (e) { hataNesnesi = e; }
    const sure = Date.now() - t0;
    kontrol('kalıcı kilit: varsayılanlar verilmedi, hata fırlatıldı', !!hataNesnesi && deger === undefined, { deger });
    kontrol('kalıcı kilit: kullanıcıya dönük ileti "Ayar dosyası okunamadı" ve neden (EBUSY)', /Ayar dosyası okunamadı/.test(hataNesnesi?.kullaniciIletisi || '') && /EBUSY|EPERM/.test(String(hataNesnesi?.cause?.code || hataNesnesi?.message)), { ileti: hataNesnesi?.kullaniciIletisi, mesaj: hataNesnesi?.message });
    kontrol('kalıcı kilit: kısa sürede vazgeçildi (< 2 sn)', sure < 2000, sure);
    await bitmesi(k);
    kontrol('kalıcı kilit: ayar dosyası değişmedi', ozet(dosya) === once);
  }
} finally {
  console.warn = eskiUyari;
  try { fs.rmSync(GECICI, { recursive: true, force: true }); } catch { /* kullanımda */ }
}
console.log(`\n${toplam - hata}/${toplam} denetim geçti${hata ? `, ${hata} HATA` : ''}`);
process.exit(hata ? 1 : 0);
