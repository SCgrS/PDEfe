// Çekirdek süreci ölürken gelen istekler (0.2.1): süreç öldükten sonra 'exit' işlenene dek geçen kısa aralıkta stdin'e yazılan istek
// EPIPE ile düşer. Akışta hata dinleyicisi yokken bu ana süreçte yakalanmamış istisna oluyordu (Electron hata kutusu açar, ana süreç
// donar). Beklenen: istisna yok, bekleyen istekler "beklenmedik biçimde kapandı" ile reddedilir, sonraki çağrı çekirdeği yeniden başlatır.
// Electron'suz: gerçek Cekirdek sınıfı. Çekirdek, paketli sürümdeki gibi doğrudan çocuk süreçtir (.venv'in python.exe'si ara başlatıcıdır,
// onu öldürmek asıl Python'u hemen öldürmez): venv'in temel Python'u, PYTHONPATH .venv'in paketleri.
// Kullanım (depo kökünden): node test/cekirdek_kopma.mjs      çıkış kodu: hata varsa 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cekirdek } from '../src/main/cekirdek.js';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const ev = /^\s*home\s*=\s*(.+?)\s*$/m.exec(fs.readFileSync(path.join(KOK, '.venv', 'pyvenv.cfg'), 'utf8'))?.[1];
const python = windows ? path.join(ev, 'python.exe') : path.join(ev, 'python3');
process.env.PYTHONPATH = windows ? path.join(KOK, '.venv', 'Lib', 'site-packages')
  : fs.readdirSync(path.join(KOK, '.venv', 'lib')).map((d) => path.join(KOK, '.venv', 'lib', d, 'site-packages'))[0];

let hata = 0;
const kontrol = (ad, kosul, ek = '') => { if (!kosul) hata++; console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ek ? ' | ' + ek : ''}`); };
const yakalanmamis = [];
process.on('uncaughtException', (e) => { yakalanmamis.push(`${e.code || ''} ${e.message}`.trim()); });

const c = new Cekirdek({ kok: KOK, paketli: false, kaynaklar: '', surum: '0.0.0' });
c.komut = () => ({ cmd: python, args: ['-X', 'utf8', path.join(KOK, 'core', 'pdefe_core.py')] });
const eskiHata = console.error; console.error = () => {};   // çekirdeğin "çıktı, kod" iletileri
try {
  for (let tur = 1; tur <= 3; tur++) {
    await c.baslat();
    const p = c.surec;
    let cikti = false;
    p.once('exit', () => { cikti = true; });
    p.kill();
    // Süreç ölürken ('exit' gelene dek) her milisaniyede bir istek: boru kapandıktan sonraki yazım EPIPE verir
    const istekler = [];
    while (!cikti && istekler.length < 2000) {
      const istek = c.cagir('ping', {});
      istek.catch(() => {});   // ret sonra allSettled'da okunur (işlenmemiş ret sayılmasın)
      istekler.push(istek);
      await new Promise((r) => setTimeout(r, 1));
    }
    const sonuclar = await Promise.allSettled(istekler);
    await new Promise((r) => setTimeout(r, 300));
    const red = sonuclar.filter((s) => s.status === 'rejected').map((s) => s.reason?.message);
    kontrol(`${tur}. tur: yakalanmamış istisna yok`, !yakalanmamis.length, yakalanmamis.join('; '));
    kontrol(`${tur}. tur: ölürken gelen istekler reddedildi ya da yeniden başlayan çekirdekte yanıtlandı`,
      sonuclar.every((s) => s.status === 'fulfilled' || /beklenmedik biçimde kapandı/.test(s.reason?.message)),
      `${sonuclar.length} istek, ${red.length} ret` + (red.some((m) => !/beklenmedik/.test(m)) ? ': ' + red.join('; ') : ''));
    yakalanmamis.length = 0;
  }
  const yanit = await c.cagir('ping', {});
  kontrol('sonraki çağrı çekirdeği yeniden başlatır', !!yanit, JSON.stringify(yanit));
} finally {
  console.error = eskiHata;
  c.durdur();
  setTimeout(() => process.exit(hata ? 1 : 0), 500);
}
