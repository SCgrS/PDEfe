// test/kaydirma_olcum.mjs çıktılarını karşılaştırır: belge ve senaryo başına, tekrarların ortalaması (önce → sonra).
// Kullanım: node test\kaydirma_karsilastir.mjs <önce.json> <sonra.json> [<üçüncü.json> …]
import fs from 'node:fs';
import path from 'node:path';

const dosyalar = process.argv.slice(2);
if (!dosyalar.length) { console.error('Kullanım: node test/kaydirma_karsilastir.mjs <önce.json> <sonra.json>'); process.exit(1); }
const veriler = dosyalar.map((d) => JSON.parse(fs.readFileSync(d, 'utf8')));
const ort = (d) => { const a = d.filter((x) => x != null && Number.isFinite(x)); return a.length ? a.reduce((t, x) => t + x, 0) / a.length : null; };
const yaz = (v, basamak = 0) => (v == null ? '-' : v.toFixed(basamak));

const OLCULER = [
  ['boş sn·ekran', (o) => o.ana.bosAlanSn, 3],
  ['bulanık sn·ekran', (o) => o.ana.bulanikAlanSn, 3],
  ['ilk görüntü ortanca ms', (o) => o.ana.bekleme.ortanca, 0],
  ['ilk görüntü en çok ms', (o) => o.ana.bekleme.enFazla, 0],
  ['keskin ortanca ms', (o) => o.ana.keskinBekleme.ortanca, 0],
  ['keskin en çok ms', (o) => o.ana.keskinBekleme.enFazla, 0],
  ['durunca keskin ms', (o) => o.ana.durunca.ortanca, 0],
  ['boş giren', (o) => o.ana.girisDurumu.bos || 0, 1],
  ['bulanık giren', (o) => (o.ana.girisDurumu.hizli || 0) + (o.ana.girisDurumu.onizleme || 0), 1],
  ['giren', (o) => o.ana.girenSayfa, 1],
  ['kare > 50 ms', (o) => o.kare.uzun50, 1],
  ['çizim sayısı', (o) => o.cizimler.length, 1],
  ['çizim toplam ms', (o) => o.cizim.toplamMs, 0],
  ['önizleme (görünmeyen)', (o) => o.cizim.onizlemeGorunmeyen ?? null, 1],
  ['önizleme (hepsi)', (o) => o.cizim.onizleme ?? null, 1],
  ['iptal', (o) => o.cizim.iptal, 1],
];

const anahtarlar = [];
for (const v of veriler) for (const o of v.sonuclar) { const k = `${o.belge || v.belge || ''}|${o.etiket}`; if (!anahtarlar.includes(k)) anahtarlar.push(k); }
console.log('Dosyalar:', dosyalar.map((d) => path.basename(d)).join('  →  '));
for (const k of anahtarlar) {
  const [belge, etiket] = k.split('|');
  const gruplar = veriler.map((v) => v.sonuclar.filter((o) => (o.belge || v.belge || '') === belge && o.etiket === etiket));
  console.log(`\n${belge} / ${etiket} (tekrar: ${gruplar.map((g) => g.length).join(' / ')})`);
  for (const [ad, al, b] of OLCULER) {
    const degerler = gruplar.map((g) => ort(g.map(al)));
    if (degerler.every((x) => x == null)) continue;
    console.log(`  ${ad.padEnd(24)} ${degerler.map((x) => yaz(x, b).padStart(9)).join('  →')}`);
  }
}
for (const [i, v] of veriler.entries()) {
  if (!v.bellek?.length) continue;
  console.log(`\nbellek (${path.basename(dosyalar[i])}): ${v.bellek.map((b) => `${b.bellekMB} MB, tuval ${b.tuval.sayi} / ${b.tuval.mp} MP`).join(' | ')}; ortalama ${yaz(ort(v.bellek.map((b) => b.bellekMB)), 1)} MB`);
}
