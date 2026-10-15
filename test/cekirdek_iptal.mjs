// Çekirdek köprüsünün iptali (src/main/cekirdek.js; 0.2.7 inceleme): istek çekirdeğe gönderilmeden önce, hazırlığı (parametre işlevi: ana
// sürecin denetimi, hedef klasörlerin okunması) ya da çekirdeğin başlatılması sürerken gelen iptal kaybolmaz; istek gönderilmeden iptal
// hatasıyla biter. İptal saklanmaz: bilinmeyen kimliğe gelen iptal sonraki isteği etkilemez. Electron gerekmez; çekirdek proje .venv'iyle.
// Kullanım:  node test\cekirdek_iptal.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cekirdek } from '../src/main/cekirdek.js';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let hata = 0, denetim = 0;
const kontrol = (ad, kosul, ek = '') => { denetim++; if (!kosul) hata++; console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${!kosul && ek !== '' ? ' | ' + JSON.stringify(ek) : ''}`); };
const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
const sonucu = (soz) => soz.then((r) => ({ r }), (e) => ({ e: e?.message || String(e), kod: e?.kod }));

const c = new Cekirdek({ kok: KOK, paketli: false, kaynaklar: '', surum: 'test' });
try {
  // 1) Çekirdek başlarken (ilk çağrı) gelen iptal
  const ilk = sonucu(c.cagir('ping', {}, null, 'p:1'));
  const ilkIptal = await c.iptal('p:1');
  const r1 = await ilk;
  kontrol('Çekirdek başlatılırken gelen iptal: istek iptal hatasıyla biter (-32800), iptal kabul edilir', r1.e === 'İşlem iptal edildi.' && r1.kod === -32800 && ilkIptal === true, { r1, ilkIptal });
  // 2) Hazırlık (parametre işlevi) sürerken gelen iptal: işlev biter, istek çekirdeğe gönderilmez
  let hazirlikBitti = false;
  const ikinci = sonucu(c.cagir('ping', async () => { await bekle(300); hazirlikBitti = true; return {}; }, null, 'p:2'));
  await bekle(50);
  const ikinciIptal = await c.iptal('p:2');
  const r2 = await ikinci;
  kontrol('Hazırlık sürerken gelen iptal: istek iptal hatasıyla biter', r2.e === 'İşlem iptal edildi.' && ikinciIptal === true && hazirlikBitti, { r2, ikinciIptal, hazirlikBitti });
  kontrol('Hazırlanan istek kaydı kalmaz', c.hazirlananlar.size === 0 && c.istekEslemesi.size === 0, { h: c.hazirlananlar.size, e: c.istekEslemesi.size });
  // 3) Aynı kimlikle sonraki istek iptal edilmiş sayılmaz
  const r3 = await sonucu(c.cagir('ping', async () => ({}), null, 'p:2'));
  kontrol('Aynı kimlikle sonraki istek olağan biter', r3.r?.ok === true, r3);
  // 4) Bilinmeyen (bitmiş) kimliğe iptal: false, saklanmaz
  const bos = await c.iptal('p:3');
  const r4 = await sonucu(c.cagir('ping', {}, null, 'p:3'));
  kontrol('Bitmiş ya da bilinmeyen isteğe iptal false döner ve sonraki isteği etkilemez', bos === false && r4.r?.ok === true, { bos, r4 });
  // 5) Hazırlık hatası olduğu gibi döner; kayıt kalmaz
  const r5 = await sonucu(c.cagir('ping', async () => { throw new Error('İzin verilmeyen istek.'); }, null, 'p:5'));
  kontrol('Hazırlık hatası isteği o hatayla bitirir, kayıt kalmaz', r5.e === 'İzin verilmeyen istek.' && c.hazirlananlar.size === 0, r5);
  // 6) Kimliksiz istek: hazırlık işlevi de çalışır
  const r6 = await sonucu(c.cagir('ping', async () => ({})));
  kontrol('Kimliksiz istek (parametre işleviyle) olağan biter', r6.r?.ok === true, r6);
} finally {
  c.durdur();
}
console.log(hata ? `${hata}/${denetim} denetim başarısız.` : `${denetim} denetimin hepsi geçti.`);
process.exitCode = hata ? 1 : 0;
