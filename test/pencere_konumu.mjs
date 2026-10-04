// Kayıtlı pencere konumu (0.2.1): ikinci ekran çıkarılınca (Mac'te harici ekrandan ayrılınca) kayıtlı konum hiçbir ekranda olmayabilir;
// pencere ekran dışında açılıyor, uygulama açılmamış sanılıyordu. Beklenen: başlık şeridi bağlı bir ekranda görünmüyorsa pencere en yakın
// ekranın çalışma alanına sığdırılır; görünen (kısmen de olsa başlığı görünen) kayıtlı konum değişmez.
// Her durumda veri klasörüne ayarlar.json (kayıtlı pencere) yazılır, örnek görünmeyen masaüstünde gerçek ekran düzeniyle başlatılır
// (baslat_gizli.ps1 -GercekEkran: test konumu verilmez, kişinin ekranına çıkmaz), pencerenin yeri sayfadan okunur, örnek durdurulur.
// Kullanım (depo kökünden): node test/pencere_konumu.mjs      ($env:PDEFE_CDP_PORT, varsayılan 9615; veri klasörü
// $env:PENCERE_KONUMU_KLASORU, varsayılan test\cikti\pencere_konumu; iş bitince silinir)      çıkış kodu: hata varsa 1
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PDEFE_CDP_PORT ||= '9615';
const K = process.env.PENCERE_KONUMU_KLASORU || path.join(KOK, 'test', 'cikti', 'pencere_konumu');
const { evalJs, bekle } = await import('./surucu.mjs');
const J = (x) => JSON.stringify(x);

let hata = 0;
const kontrol = (ad, kosul, ek = '') => { if (!kosul) hata++; console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ek !== '' ? ' | ' + (typeof ek === 'string' ? ek : J(ek)) : ''}`); };
const ps = (betik, ...a) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', betik), ...a], { encoding: 'utf8' });

/** Kayıtlı konumla başlatır; pencerenin yeri ve bulunduğu ekranın çalışma alanı (CSS pikseli = DIP) */
async function ac(kayitli) {
  const veri = path.join(K, 'veri');
  fs.rmSync(veri, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); fs.mkdirSync(veri, { recursive: true });
  fs.writeFileSync(path.join(veri, 'ayarlar.json'), J({ pencere: { ...kayitli, buyutulmus: false } }));
  const cikti = ps('baslat_gizli.ps1', '-Port', PORT, '-Veri', veri, '-GercekEkran');
  const pid = /PID=(\d+)/.exec(cikti)?.[1];
  try {
    await bekle(800);
    return await evalJs(`({ x: screenX, y: screenY, w: outerWidth, h: outerHeight, alan: { x: screen.availLeft, y: screen.availTop, w: screen.availWidth, h: screen.availHeight } })`);
  } finally { if (pid) ps('durdur.ps1', '-SurecId', pid); await bekle(500); }
}
/** Başlık şeridi (üst 30 px) bulunduğu ekranın çalışma alanında en az 100 px genişliğinde görünüyor mu */
const basligiGorunur = (p) => Math.min(p.x + p.w, p.alan.x + p.alan.w) - Math.max(p.x, p.alan.x) >= 100 && p.y >= p.alan.y - 8 && p.y <= p.alan.y + p.alan.h - 40;
const icinde = (p) => p.x >= p.alan.x - 8 && p.y >= p.alan.y - 8 && p.x + p.w <= p.alan.x + p.alan.w + 8 && p.y + p.h <= p.alan.y + p.alan.h + 8;

try {
  fs.mkdirSync(K, { recursive: true });
  // Birincil ekranın kökeni (0, 0): Windows'ta ve macOS'ta birincil ekran hep oradadır
  let p = await ac({ x: 100, y: 120, genislik: 1000, yukseklik: 700 });
  kontrol('Ekrandaki kayıtlı konum değişmez', p && p.x === 100 && p.y === 120 && p.w === 1000, p);
  p = await ac({ x: 20000, y: 100, genislik: 1000, yukseklik: 700 });
  kontrol('Hiçbir ekranda olmayan konum (sağda çıkarılmış ekran): pencere en yakın ekranın çalışma alanına sığar', p && icinde(p) && p.w === 1000, p);
  p = await ac({ x: 200, y: -5000, genislik: 1000, yukseklik: 700 });
  kontrol('Ekranların üstünde kalan konum: pencere çalışma alanına iner', p && icinde(p), p);
  p = await ac({ x: -850, y: 150, genislik: 1000, yukseklik: 700 });
  kontrol('Başlığı kısmen (150 px) görünen konum değişmez', p && p.x === -850 && p.y === 150, p);
  p = await ac({ x: -960, y: 150, genislik: 1000, yukseklik: 700 });
  kontrol('Başlığın yalnızca 40 px\'i görünen konum: pencerenin başlığı görünür olur', p && basligiGorunur(p), p);
} finally {
  try { fs.rmSync(K, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { console.log('Not: ' + K + ' silinemedi.'); }
}
console.log(hata ? `${hata} denetim başarısız.` : 'Bütün denetimler geçti.');
process.exit(hata ? 1 : 0);
