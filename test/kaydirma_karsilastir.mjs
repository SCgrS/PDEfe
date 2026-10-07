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
  // Sayfalar paneli (panel açık senaryolar): görünen hücrenin resimsiz kaldığı süre, resimsiz giren hücreler ve bekleyişleri, çekirdekten
  // istenen küçük resimler ve istek başına süre, sürükleme bırakılınca görünenlerin dolması
  ['panel boş hücre·sn', (o) => (o.panel.giren ? o.panel.bosHucreSn : null), 3],
  ['panel giren hücre', (o) => (o.panel.giren ? o.panel.giren : null), 1],
  ['panel resimsiz giren', (o) => (o.panel.giren ? o.panel.bosGiren : null), 1],
  ['panel bekleme ortanca ms', (o) => (o.panel.giren ? o.panel.bekleme.ortanca : null), 0],
  ['panel bekleme en çok ms', (o) => (o.panel.giren ? o.panel.bekleme.enFazla : null), 0],
  ['küçük resim isteği', (o) => o.cekirdek?.['panel:kucuk_resim']?.n ?? null, 1],
  ['küçük resim gecikme ort.', (o) => o.cekirdek?.['panel:kucuk_resim']?.ortanca ?? null, 0],
  ['küçük resim gecikme en', (o) => o.cekirdek?.['panel:kucuk_resim']?.enFazla ?? null, 0],
  ['bırakınca dolma ms', (o) => o.ek?.birakincaDolmaMs ?? null, 0],
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
// panel-bellek senaryosu: belge başına tekrarların ortalaması
const pbBelgeler = [...new Set(veriler.flatMap((v) => (v.panelBellek || []).map((b) => b.belge)))];
for (const belge of pbBelgeler) {
  console.log(`\npanel-bellek / ${belge}`);
  const g = veriler.map((v) => (v.panelBellek || []).filter((b) => b.belge === belge));
  for (const [ad, al, b] of [
    ['hızlı sürükleme istek', (x) => x.hizli.istek.n, 1], ['hızlı gecikme ortanca ms', (x) => x.hizli.istek.ortanca, 0],
    ['hızlı gecikme en çok ms', (x) => x.hizli.istek.enFazla, 0], ['hızlı boş hücre·sn', (x) => x.hizli.panelBosHucreSn, 3],
    ['hızlıdan sonra önbellek MB', (x) => x.hizli.mb, 1], ['başa dönüş istek', (x) => x.yavas.istek.n, 1],
    ['sonda önbellek MB', (x) => x.yavas.mb, 1], ['sonda önbellek kayıt', (x) => x.yavas.kayit, 1],
    ['süreç ağacı MB', (x) => x.bellekMB, 1], ['panel kapalıyken MB', (x) => x.tabanMB ?? null, 1], ['panelin payı MB', (x) => x.panelMB ?? null, 1],
    ['JS yığını MB', (x) => x.jsYiginMB, 1],
  ]) console.log(`  ${ad.padEnd(26)} ${g.map((x) => yaz(ort(x.map(al)), b).padStart(9)).join('  →')}`);
}
