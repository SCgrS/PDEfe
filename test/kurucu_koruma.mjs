// Kurucu sınamasının deneme kimliği korumaları (0.2.3, bağımsız incelemenin bulgusu): test/kurucu_derle.mjs'in yapılandırma denetimi
// (yapilandirmaFarklari) .pdf ProgId'sini de yakalamalı. Deneme yapılandırmasında (test/kurucu_sinama.yml) fileAssociations.name gerçek
// PDEfe'ninkiyle (PDEfe.pdf) aynı yapılırsa deneme kurucusu gerçek ProgId'nin açma komutunun üzerine yazar, kaldırıcısı onu silerdi; önceden
// denetim yalnızca ext / role / icon'a bakıyordu ve derleme durmuyordu. Dosyalara yazılmaz: fs.readFileSync yalnızca bu süreçte değiştirilir.
// Kullanım (proje kökünden; derleme yapılmaz, birkaç saniye):  node test/kurucu_koruma.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const proje = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ymlYol = path.join(proje, 'test', 'kurucu_sinama.yml');
const nshYol = path.join(proje, 'test', 'kurucu_sinama.nsh');
const ymlProgId = (yeni) => (m) => m.replace(/^(\s*name:\s*)KurucuSinama\.pdf\s*$/m, `$1${yeni}`);
const nshProgId = (yeni) => (m) => m.replace('!define PDEFE_PROGID "KurucuSinama.pdf"', `!define PDEFE_PROGID "${yeni}"`);
const durumlar = [
  ['bugünkü dosyalar: fark yok', {}, false],
  ['yml ProgId gerçek PDEfe.pdf', { [ymlYol]: ymlProgId('PDEfe.pdf') }, true],
  ['yml ProgId pdefe.PDF (kayıt defteri harf ayırmaz)', { [ymlYol]: ymlProgId('pdefe.PDF') }, true],
  ['yml ProgId nsh\'tekinden farklı (Baska.pdf)', { [ymlYol]: ymlProgId('Baska.pdf') }, true],
  ['nsh PDEFE_PROGID gerçek PDEfe.pdf', { [nshYol]: nshProgId('PDEfe.pdf') }, true],
  ['yml ve nsh birlikte PDEfe.pdf', { [ymlYol]: ymlProgId('PDEfe.pdf'), [nshYol]: nshProgId('PDEfe.pdf') }, true],
];

const { yapilandirmaFarklari } = await import(pathToFileURL(path.join(proje, 'test', 'kurucu_derle.mjs')).href);
const ozgun = fs.readFileSync;
let hata = 0;
for (const [ad, degisim, farkBeklenir] of durumlar) {
  fs.readFileSync = function (yol, ...arg) {
    const m = ozgun.call(this, yol, ...arg);
    for (const [hedef, f] of Object.entries(degisim)) {
      if (path.resolve(String(yol)).toLowerCase() !== hedef.toLowerCase()) continue;
      const y = f(String(m));
      if (y === String(m)) throw new Error(`sınama dosyası beklenen satırı içermiyor (${path.basename(hedef)}): ${ad}`);
      return y;
    }
    return m;
  };
  let farklar;
  try { farklar = yapilandirmaFarklari(); } finally { fs.readFileSync = ozgun; }
  const ok = farkBeklenir ? farklar.some((f) => /ProgId|PDEFE_PROGID/.test(f)) : farklar.length === 0;
  if (!ok) hata++;
  console.log(`${ok ? 'TAMAM' : 'HATA '} ${ad}${farklar.length ? ' — ' + farklar.join(' | ') : ''}`);
}
console.log(`\n${durumlar.length} denetim, ${hata} hata`);
process.exitCode = hata ? 1 : 0;
