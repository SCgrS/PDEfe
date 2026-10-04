// Ana süreç güvenlik yardımcılarının (src/main/guvenlik.js) Electron'suz birim denemesi.
//   paketKlasoruMu (0.2.1): macOS'ta kabuk:klasorAc uygulama paketini (.app; klasördür, açılınca uygulama başlar) açmamalı. Uzantıdan, bağlantının
//   gösterdiği yerden ve Contents/Info.plist'ten tanınır; olağan klasörler (adında nokta olanlar dahil) paket sayılmaz. İşlev platformdan
//   bağımsızdır (main.js yalnızca macOS'ta çağırır), bu yüzden Windows'ta da sınanır.
// Kullanım (depo kökünden): node test/guvenlik_birim.mjs   (geçici klasör: $env:GUVENLIK_BIRIM_KLASORU, varsayılan test\cikti\guvenlik_birim;
// iş bitince silinir)      çıkış kodu: hata varsa 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paketKlasoruMu } from '../src/main/guvenlik.js';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = process.env.GUVENLIK_BIRIM_KLASORU || path.join(KOK, 'test', 'cikti', 'guvenlik_birim');
let hata = 0;
const kontrol = (ad, kosul, ek = '') => { if (!kosul) hata++; console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ek ? ' | ' + ek : ''}`); };
const klasor = (...p) => { const y = path.join(K, ...p); fs.mkdirSync(y, { recursive: true }); return y; };

try {
  fs.rmSync(K, { recursive: true, force: true }); fs.mkdirSync(K, { recursive: true });
  const uygulama = klasor('Uygulamalar', 'Terminal.app');
  fs.mkdirSync(path.join(uygulama, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(uygulama, 'Contents', 'Info.plist'), '<plist/>');
  kontrol('.app paketi', await paketKlasoruMu(uygulama));
  kontrol('.app paketi, sonda bölü işaretiyle', await paketKlasoruMu(uygulama + '/'));
  kontrol('büyük harfli uzantı (.APP)', await paketKlasoruMu(klasor('Deneme.APP')));
  for (const u of ['bundle', 'framework', 'plugin', 'prefPane', 'workflow', 'pkg']) kontrol(`.${u} paketi`, await paketKlasoruMu(klasor('Eklenti.' + u)));
  const uzantisiz = klasor('Uzantisiz Uygulama');
  fs.mkdirSync(path.join(uzantisiz, 'Contents'), { recursive: true });
  fs.writeFileSync(path.join(uzantisiz, 'Contents', 'Info.plist'), '<plist/>');
  kontrol('uzantısız ama Contents/Info.plist taşıyan paket', await paketKlasoruMu(uzantisiz));
  const baglanti = path.join(K, 'Kısayol');
  fs.symlinkSync(uygulama, baglanti, 'junction');   // Windows'ta yönetici izni istemeyen bağlantı; macOS'ta olağan sembolik bağlantı
  kontrol('pakete giden bağlantı (adı uzantısız)', await paketKlasoruMu(baglanti));
  kontrol('paketin içindeki olağan klasör paket değil', !(await paketKlasoruMu(path.join(uygulama, 'Contents', 'MacOS'))));
  kontrol('olağan klasör paket değil', !(await paketKlasoruMu(klasor('Belgeler', 'Dilekçeler'))));
  kontrol('adında nokta olan klasör paket değil', !(await paketKlasoruMu(klasor('Dosya 2026.10'))));
  kontrol('adı ".app" ile biten olmayan klasör (Uygulama apps) paket değil', !(await paketKlasoruMu(klasor('Uygulama apps'))));
  kontrol('olmayan yol paket değil', !(await paketKlasoruMu(path.join(K, 'yok'))));
} finally {
  try { fs.rmSync(K, { recursive: true, force: true }); } catch { console.log('Not: ' + K + ' silinemedi.'); }
}
console.log(hata ? `${hata} denetim başarısız.` : 'Bütün denetimler geçti.');
process.exit(hata ? 1 : 0);
