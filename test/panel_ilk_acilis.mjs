// Sol panel (Sayfalar) ilk açılışta gizli (0.2.3, kullanıcı isteği: "ilk yükleme başlangıcında sayfalar kısmı açık olmasın. ilk yüklemede
// varsayılan olarak gizli açılsın. daha sonra nasıl bırakıldıysa ayarı korunsun"). Varsayılan zaten kapalıydı; eski sürümde açık bırakılan
// panel kayıtlı kaldığı için açık geliyordu. 0.2.3 paneli bir kez kapatır (main/ayarlar.js, bayrak solPanelKapatildi), sonra kullanıcının
// bıraktığı gibi kalır. Denetlenenler, her adımda örnek baştan başlatılarak (aynı veri klasörü):
//   1) Eski sürümün ayarı (solPanelAcik: true, bayrak yok): panel kapalı açılır; ayar false, bayrak yazılmış (dosyada da).
//   2) Panel açılır (F4'ün komutu), yeniden başlatılır: açık kalır. Pencereye ayırmayla açılan yeni pencerede de açık.
//   3) "Varsayılanlara dön": paneli ve bayrağı değiştirmez; yeniden başlatınca panel yine açık.
//   4) Panel kapatılır, yeniden başlatılır: kapalı kalır; yeni pencerede de kapalı.
//   5) Temiz veri klasörü (ilk kurulum): panel kapalı, bayrak yazılmış.
// Örnek ekran dışında başlatılır (baslat.ps1), her adımdan sonra durdurulur.
// Kullanım (depo kökünden): node test/panel_ilk_acilis.mjs      ($env:PDEFE_CDP_PORT, varsayılan 9616; veri klasörü
// $env:PANEL_ILK_KLASORU, varsayılan test\cikti\panel_ilk_acilis; iş bitince silinir)      çıkış kodu: hata varsa 1
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PDEFE_CDP_PORT ||= '9616';
const K = process.env.PANEL_ILK_KLASORU || path.join(KOK, 'test', 'cikti', 'panel_ilk_acilis');
const VERI = path.join(K, 'veri'), PDF = path.join(K, 'pdf');
const PYTHON = path.join(KOK, '.venv', 'Scripts', 'python.exe'), URET = path.join(KOK, 'test', 'ornek_pdf_uret.py');
const { evalJs, bekle, hedefler, hedefSec } = await import('./surucu.mjs');
const J = (x) => JSON.stringify(x);

let hata = 0, toplam = 0;
// Ayrıntı yalnızca düşen denetimde yazılır; ayar dosyasından yalnızca panelle ilgili alanlar (dosyada Windows kullanıcı adı da var: yazarAdi)
const kontrol = (ad, kosul, ek = '') => { toplam++; if (!kosul) hata++; console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ek !== '' && !kosul ? ' | ' + (typeof ek === 'string' ? ek : J(ek)) : ''}`); };
const PANEL_ALANLARI = ['solPanelAcik', 'solPanelKapatildi', 'solPanelGenislik', 'tema'];
const ps = (betik, ...a) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', betik), ...a], { encoding: 'utf8' });
const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade).catch(() => null); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
const dosyadaki = () => { try { const j = JSON.parse(fs.readFileSync(path.join(VERI, 'ayarlar.json'), 'utf8')); return Object.fromEntries(PANEL_ALANLARI.map((k) => [k, j[k]])); } catch { return null; } };
const uret = (ad) => { execFileSync(PYTHON, ['-X', 'utf8', URET, path.join(PDF, ad), '2', ad.replace('.pdf', '')]); return path.join(PDF, ad); };

let sid = null;
/** Örneği VERI ile başlatır; ilk pencerenin ayarları yüklenene dek bekler. */
async function baslat() {
  const cikti = ps('baslat.ps1', '-Port', PORT, '-Veri', VERI, '-Boyut', '1280,800');
  sid = /PID=(\d+)/.exec(cikti)?.[1];
  if (!sid) throw new Error('Örnek başlatılamadı: ' + cikti);
  hedefSec(null);
  await kosul('!!window.__pdefe');
}
function durdur() { if (sid) { ps('durdur.ps1', '-SurecId', sid); sid = null; } }
async function yenidenBaslat() { durdur(); await bekle(800); await baslat(); }
/** Seçili penceredeki panel durumu ve ana süreçteki kayıt */
const durum = () => evalJs(`(async () => ({ acik: window.__pdefe.panel.acik, gizli: document.querySelector('#sol-panel').hidden,
  ayar: await window.pdefe.cagir('ayar:al', 'solPanelAcik'), bayrak: await window.pdefe.cagir('ayar:al', 'solPanelKapatildi'),
  rendererAyar: window.__pdefe.ayar().solPanelAcik }))()`);
/** İki belge açıp birini yeni pencereye ayırır; yeni pencerenin panel durumunu döndürür, ilk pencereye döner. */
async function ayrilanPencere() {
  await evalJs(`(async () => { for (const y of ${J([uret('a.pdf'), uret('b.pdf')])}) await window.__pdefe.dosyaAc(y); return true; })()`);
  await kosul(`window.__pdefe.belgeler.size === 2`);
  const once = (await hedefler()).map((h) => h.id);
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === 'b.pdf'); return p.sekmeyiTasi(b.id, { tur: 'yeni' }); })()`);
  let yeni = null;
  for (let i = 0; i < 80 && !yeni; i++) { await bekle(150); yeni = (await hedefler()).find((h) => !once.includes(h.id)); }
  if (!yeni) return null;
  hedefSec(yeni.id);
  await kosul(`!!window.__pdefe && window.__pdefe.aktif()?.ad === 'b.pdf'`);
  const d = await durum();
  hedefSec(once[0]);
  return d;
}

try {
  fs.rmSync(K, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  fs.mkdirSync(VERI, { recursive: true }); fs.mkdirSync(PDF, { recursive: true });

  // ---------------------------------------------------------------- 1) eski sürümün ayarı: panel açık bırakılmış, bayrak yok
  fs.writeFileSync(path.join(VERI, 'ayarlar.json'), J({ solPanelAcik: true, solPanelGenislik: 300, tema: 'acik' }));
  await baslat();
  let d = await durum();
  kontrol('Eski ayarla (solPanelAcik: true) açılış: panel kapalı, ayar false, bayrak yazıldı', !d.acik && d.gizli && d.ayar === false && d.rendererAyar === false && d.bayrak === true, d);
  let f = dosyadaki();
  kontrol('Dosyada da: solPanelAcik false, solPanelKapatildi true; öteki ayarlar (genişlik, tema) korunmuş', f?.solPanelAcik === false && f?.solPanelKapatildi === true && f?.solPanelGenislik === 300 && f?.tema === 'acik', f);

  // ---------------------------------------------------------------- 2) kullanıcı paneli açar: yeniden açılışta açık kalır
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.solPanel'), true)`); await bekle(300);
  d = await durum();
  kontrol('F4 komutuyla panel açıldı, ayar true yazıldı', d.acik && d.ayar === true, d);
  await yenidenBaslat();
  d = await durum();
  kontrol('Yeniden başlatınca panel açık kalıyor (taşıma bir kez yapıldı)', d.acik && !d.gizli && d.ayar === true && d.bayrak === true, d);
  let y = await ayrilanPencere();
  kontrol('Pencereye ayırmayla açılan yeni pencerede de panel açık', y && y.acik && y.ayar === true, y);

  // ---------------------------------------------------------------- 3) Varsayılanlara dön: panel ve bayrak değişmez
  await evalJs(`(async () => { window.__pdefeOtoYanit = { secim: 0 }; await window.__pdefe.komutCalistir('duzen.ayarlar'); await new Promise((r) => setTimeout(r, 400));
    document.querySelector('.ayarlar-ortusu [data-id="varsayilan"]').click(); await new Promise((r) => setTimeout(r, 600)); delete window.__pdefeOtoYanit;
    document.querySelector('.ayarlar-ortusu [data-id="kapat2"]')?.click(); return true; })()`);
  await bekle(400);
  d = await durum();
  f = dosyadaki();
  kontrol('Varsayılanlara dön: panel açık kaldı, solPanelAcik true, bayrak duruyor; tema varsayılana döndü (soru gerçekten yanıtlandı)', d.acik && d.ayar === true && d.bayrak === true && f?.tema === 'sistem', { d, tema: f?.tema });
  await yenidenBaslat();
  d = await durum();
  kontrol('Varsayılanlara dönüp yeniden başlatınca panel yine açık (bayrak silinmedi, taşıma yinelenmedi)', d.acik && d.ayar === true && d.bayrak === true, d);

  // ---------------------------------------------------------------- 4) kullanıcı paneli kapatır: kapalı kalır
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.solPanel'), true)`); await bekle(300);
  await yenidenBaslat();
  d = await durum();
  kontrol('Kapatılıp yeniden başlatınca panel kapalı', !d.acik && d.gizli && d.ayar === false && d.bayrak === true, d);
  y = await ayrilanPencere();
  kontrol('Pencereye ayırmayla açılan yeni pencerede de panel kapalı', y && !y.acik && y.ayar === false, y);

  // ---------------------------------------------------------------- 5) ilk kurulum: temiz veri klasörü
  durdur(); await bekle(800);
  fs.rmSync(VERI, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); fs.mkdirSync(VERI, { recursive: true });
  await baslat();
  d = await durum();
  f = dosyadaki();
  kontrol('Temiz veri klasöründe (ilk kurulum) panel kapalı; bayrak yazıldı', !d.acik && d.gizli && d.ayar === false && d.bayrak === true && f?.solPanelKapatildi === true, { d, f });
} catch (e) {
  hata++; console.log('HATA  beklenmeyen: ' + (e?.stack || e));
} finally {
  try { durdur(); } catch {}
  await bekle(800);
  try { fs.rmSync(K, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { console.log('Not: ' + K + ' silinemedi.'); }
}
console.log(hata ? `${hata}/${toplam} denetim başarısız.` : `Bütün denetimler geçti (${toplam}).`);
process.exit(hata ? 1 : 0);
