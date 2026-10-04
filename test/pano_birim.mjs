// Panoya koşullu metin yazımı (src/main/pano.js panoyaMetinYaz; 0.2.1): kopyalamadan sonra çekirdeğin temiz metni, pano hâlâ kopyalanan
// metni taşıyorsa yazılır. Electron 44'te clipboard.readText / writeText Promise döndürür (electron.d.ts); önceki kod sonucu beklemeden
// karşılaştırdığı için temiz metin panoya hiç yazılmıyordu. Gerçek panoya dokunulmaz: Electron'unki gibi Promise döndüren sahte pano.
// Kullanım (depo kökünden): node test/pano_birim.mjs      çıkış kodu: hata varsa 1
import { panoyaMetinYaz } from '../src/main/pano.js';

let hata = 0;
const kontrol = (ad, kosul, ek = '') => { if (!kosul) hata++; console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ek ? ' | ' + ek : ''}`); };

/** Electron 44 clipboard'unun metin yarısı gibi: readText / writeText Promise döner (sonuç bir sonraki turda) */
function sahtePano(icerik, { okumaHatasi = false, yazmaHatasi = false } = {}) {
  const p = { icerik, yazilan: [] };
  p.readText = () => new Promise((coz, reddet) => setTimeout(() => (okumaHatasi ? reddet(new Error('okunamadı')) : coz(p.icerik)), 1));
  p.writeText = (m) => new Promise((coz, reddet) => setTimeout(() => { if (yazmaHatasi) { reddet(new Error('yazılamadı')); return; } p.icerik = m; p.yazilan.push(m); coz(); }, 1));
  return p;
}
const eskiHata = console.error; console.error = () => {};   // panoyaMetinYaz'ın hata günlüğü

{
  const p = sahtePano('Türk Borçlar\r\nKanunu');
  const r = await panoyaMetinYaz(p, 'Türk Borçlar Kanunu', 'Türk Borçlar\nKanunu');
  kontrol('pano hâlâ kopyalanan metinde (satır sonları farklı): temiz metin yazılır', r === true && p.icerik === 'Türk Borçlar Kanunu', JSON.stringify(p.yazilan));
}
{
  const p = sahtePano('başka bir yerde kopyalanan');
  const r = await panoyaMetinYaz(p, 'Türk Borçlar Kanunu', 'Türk Borçlar\nKanunu');
  kontrol('bu arada başka bir şey kopyalanmış: yazılmaz', r === false && p.yazilan.length === 0 && p.icerik === 'başka bir yerde kopyalanan');
}
{
  const p = sahtePano('eski');
  const r = await panoyaMetinYaz(p, 'C:\\Belgeler\\deneme.pdf');
  kontrol('koşulsuz (Yolu kopyala): yazılır', r === true && p.icerik === 'C:\\Belgeler\\deneme.pdf');
}
{
  const p = sahtePano('', {});
  const r = await panoyaMetinYaz(p, '', '');
  kontrol('boş metin koşulu boş panoyla eşleşir (null değil)', r === true && p.yazilan.length === 1);
}
{
  const p = sahtePano('x', { okumaHatasi: true });
  const r = await panoyaMetinYaz(p, 'temiz', 'x');
  kontrol('pano okunamadı: yazılmaz, false', r === false && p.yazilan.length === 0);
  const p2 = sahtePano('x', { yazmaHatasi: true });
  kontrol('pano yazılamadı: false', (await panoyaMetinYaz(p2, 'temiz', 'x')) === false);
}
console.error = eskiHata;
console.log(hata ? `${hata} denetim başarısız.` : 'Bütün denetimler geçti.');
process.exit(hata ? 1 : 0);
