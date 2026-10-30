// Senaryo 52 (0.3.1, kullanıcı: "bu kayıt mekanizmasında hiç sıkıntı olmamalı bireysel başvurunun çünkü çok uzun yazılabiliyor"): XFA formunda kayıp avı. Amaç yazılanı
// kaybettirmek ya da kaydedildi sanılıp kaydedilmemesini sağlamak. Gerçek fare ve klavye (CDP Input), diskteki baytlar kurgusal formla (test/xfa_pdf_uret.py xfa-uzun.pdf, xfa-bicim.pdf).
//   1 Form yeniden dizilirken: Tab alana geçmez, alana yazılamaz, Ctrl+Z ve toplu geri al yığını bozmaz, kapatma işin bitmesini bekler, kayıt beklenir.
//   2 Dosya başka programda değişti: Kayıt sorar, üzerine yazmaz. Farklı kaydet, Üzerine kaydet, Vazgeç. Formu Kaydet (aynı dosya seçilince de), otomatik kayıt, kapatma, sekme taşıma.
//     Kendi kaydından sonra sorulmaz, içeriği aynı dosyaya dokunulması sorulmaz.
//   3 Aynı dosya iki yazımla açılmış: İkinci kayıt öbürünün yazdığını sessizce silmez.
//   4 Zengin metinli değer (başka programın kaydettiği): Başka alan değişip kaydedilince, Ekle'de, yazdırmada, sekme taşımada kaybolmaz. Boşaltılınca geri gelmez.
//   5 PDF.js işçisi durursa: Kayıt askıda kalmaz, pencere kapatılabilir.
//   6 Zor metinler: Kaydet, yeniden aç, Ekle, kaydet. Yazı bayt bayt ya da bilinen sınırla aynı.
//   7 Alan odaktayken: Yakınlaştırma, düzen, kaydırmasız sayfa çevirme, sekme değiştirip dönme, sekme taşıma, IME dizgisi, gerçek tuşlar, Esc, kapatma sorusunda Vazgeç.
//   8 Çekirdek öldürülünce: Kayıttan önce, kayıt sürerken, Ekle sürerken.
//   9 Rastgele işlem dizisi (tohumlu): Yazma, Ekle, Sil, Geri al, Yinele, Kaydet, yakınlaştırma, sekme değişimi, yeniden açma. Her adımda ekran bir modelle, her kayıtta dosya aynı modelle karşılaştırılır.
//  10 Oturum sonu: Alandan çıkılmamış yazı oturumun bitmesini engeller, soru açılır (test/oturum_sonu.ps1, yalnız bu örneğin penceresi).
// Kullanım (ekran dışı):
//   powershell -File test\baslat.ps1 -Port 9620 -Veri "$env:TEMP\pdefe-s52" -Boyut "1280,900"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9620; $env:PDEFE_TEST_PID=<PID>; [$env:BOLUM="1,3"]; node test\surucu.mjs betik test\senaryo52.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's52', Date.now().toString(36));
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));
const TUR = +(process.env.S52_TUR || 60);
const TOHUMLAR = (process.env.S52_TOHUM || '1,2,3').split(',').map(Number);

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)).slice(0, 900) : ''}`);
  return ok;
};
const bilgi = (m) => console.log(`     ${m}`);
const ozet = (y) => createHash('sha256').update(fs.readFileSync(y)).digest('hex');

/** Kaydedilen formun ölçümü (PDF.js'ten değil, dosyanın kendisinden): Onarıldı mı, datasets'in ham metni, yaprak değerler (yol → değerler). */
const OLC = `
import json, sys
import xml.etree.ElementTree as ET
sys.path.insert(0, r"${path.join(KOK, 'core').replace(/\\/g, '\\\\')}")
sys.stdout.reconfigure(encoding="utf-8")
import pymupdf
from islemler import xfa
d = pymupdf.open(sys.argv[1], filetype="pdf")
p = xfa._paketler(d)
ham = d.xref_stream(p["datasets"])
kok = ET.fromstring(ham)
veri = kok.find("{%s}data" % xfa.VERI_NS)
degerler = {}
def yuru(e, yol):
    ad = xfa._yerel(e.tag)
    y = yol + [ad]
    c = list(e)
    if c:
        for x in c: yuru(x, y)
    else:
        degerler.setdefault("/".join(y), []).append(e.text or "")
for c in veri: yuru(c, [])
print(json.dumps({"onarildi": d.is_repaired, "saf": xfa._saf_mi(d, p), "ham": ham.decode("utf-8"), "degerler": degerler}, ensure_ascii=False))
`;
/** Formun veri paketinde bir parçayı başka programın kaydı gibi değiştirir (dosya yerinde değişir). */
const DIS_KAYIT = `
import os, sys
sys.path.insert(0, r"${path.join(KOK, 'core').replace(/\\/g, '\\\\')}")
import pymupdf
from islemler import xfa
d = pymupdf.open(sys.argv[1], filetype="pdf")
p = xfa._paketler(d)
v = d.xref_stream(p["datasets"]).decode("utf-8")
if sys.argv[2] not in v: raise SystemExit("veride yok: " + sys.argv[2])
d.update_stream(p["datasets"], v.replace(sys.argv[2], sys.argv[3], 1).encode("utf-8"))
d.save(sys.argv[1] + ".yeni")
d.close()
os.replace(sys.argv[1] + ".yeni", sys.argv[1])
`;

const YARDIMCI = `window.__s52 = {
  b: () => window.__pdefe.aktif(),
  g: () => window.__pdefe.aktif().gorunum,
  bekle: (ms) => new Promise((c) => setTimeout(c, ms)),
  async durgun() { const b = this.b(); for (let i = 0; i < 600; i++) { if (b && !b.xfa.mesgul && !b.xfa.yapiSuruyor) break; await this.bekle(50); } await b?.xfa.bekle(); await this.bekle(80); return true; },
  async sayfa(n) { const g = this.g(); g.sayfayaGit(n); const s = g.sayfalar[n - 1]; for (let i = 0; i < 100; i++) { const k = s.el.querySelector('.xfaLayer'); if (k) return k; await this.bekle(50); } return null; },
  denetimler(k, ad) { return [...k.querySelectorAll('[xfaname="' + ad + '"]')].map((e) => e.querySelector('input, textarea, select, button')).filter(Boolean); },
  async degerler(adlar) { const g = this.g(), c = {}; for (const ad of adlar) c[ad] = []; for (let n = 1; n <= g.sayfaSayisi; n++) { const k = await this.sayfa(n); if (!k) continue; await this.bekle(25); for (const ad of adlar) { for (const d of this.denetimler(k, ad)) c[ad].push(d.value); } } return c; },
  async yer(ad, i = 0) { const g = this.g(); let say = 0; for (let n = 1; n <= g.sayfaSayisi; n++) { const k = await this.sayfa(n); if (!k) continue; const l = this.denetimler(k, ad); if (i - say < l.length) { const el = l[i - say]; el.scrollIntoView({ block: 'center', inline: 'center' }); await this.bekle(120); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 200), sayfa: n }; } say += l.length; } return null; },
  durum() { const b = this.b(), k = [...document.querySelectorAll('.mesaj-kutusu')].at(-1), bl = document.getElementById('bildirim');
    return { yol: b?.yol, ad: b?.ad, degisti: !!b?.degisti, kaydediliyor: !!b?.kaydediliyor, mesgul: !!b?.xfa?.mesgul, konum: b?.yigin?.konum, kayit: b?.yigin?.kayitKonumu, yigin: b?.yigin?.yigin?.length, sayfa: b?.gorunum?.sayfaSayisi, odak: document.activeElement?.tagName, odakAd: document.activeElement?.closest?.('[xfaname]')?.getAttribute('xfaname') || '',
      mesaj: document.getElementById('durum-mesaj')?.textContent || '', bildirim: bl && !bl.hidden ? bl.textContent : '', belge: window.__pdefe.belgeler.size,
      kutu: k ? { ileti: k.querySelector('.mesaj-ileti')?.textContent, ayrinti: k.querySelector('.mesaj-ayrinti')?.textContent || '', dugmeler: [...k.querySelectorAll('.dugmeler button')].map((x) => x.textContent) } : null }; },
};`;

/** Küçük tohumlu rastgele sayı (test yinelenebilir). */
function rastgeleUret(tohum) {
  let s = (tohum * 2654435761) >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return { n: (k) => Math.floor(r() * k), sec: (l) => l[Math.floor(r() * l.length)], olasi: (p) => r() < p };
}

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, yaz, tus, tusHam, hedefSec, hedefler }) {
  fs.mkdirSync(UI, { recursive: true });
  const oz = JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'xfa_pdf_uret.py'), UI], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  const KLASOR = path.join(UI, 'Şahıs Klasörü');
  fs.mkdirSync(KLASOR, { recursive: true });
  let sayac = 0;
  const kopya = (ad, kaynak = oz.xfaUzun) => { const y = path.join(KLASOR, `${++sayac}-${ad}.pdf`); fs.copyFileSync(kaynak, y); return y; };
  const olcB = path.join(UI, 'olc.py'), disB = path.join(UI, 'dis.py');
  fs.writeFileSync(olcB, OLC); fs.writeFileSync(disB, DIS_KAYIT);
  const olc = (pdf) => JSON.parse(execFileSync(PY, ['-X', 'utf8', '-I', olcB, pdf], { encoding: 'utf8', maxBuffer: 1 << 28 }));
  const disKayit = (pdf, eski, yeni) => execFileSync(PY, ['-X', 'utf8', '-I', disB, pdf, eski, yeni], { encoding: 'utf8' });
  await evalJs(YARDIMCI);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const durum = () => evalJs(`window.__s52.durum()`);
  const durgun = () => evalJs(`window.__s52.durgun()`);
  const kapatHepsini = () => evalJs(`(async () => { delete window.__pdefeOtoYanit; const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const ac = async (yol, kapa = true) => {
    if (kapa) await kapatHepsini();
    await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); for (let i = 0; i < 200 && !document.querySelector('.gorunum:not([hidden]) .xfaLayer'); i++) await window.__s52.bekle(50); b.gorunum.zoomModuAyarla('genislik'); await window.__s52.bekle(300); return true; })()`);
  };
  const tiklaAd = async (ad, i = 0) => { const p = await evalJs(`window.__s52.yer(${J(ad)}, ${i})`); if (!p) throw new Error('Öğe bulunamadı: ' + ad + ' ' + i); await tikla(p.x, p.y); await bekle(80); return p; };
  const alanaYaz = async (ad, i, metin) => { await tiklaAd(ad, i); await tus('a', ['ctrl']); await tus('Delete'); if (metin) await yaz(metin); await bekle(30); };
  const komut = (k, v) => evalJs(`(window.__pdefe.komutCalistir(${J(k)}${v !== undefined ? ', ' + J(v) : ''}), true)`);
  const kayitBitsin = async (ms = 60000) => { await bekle(30); for (const t0 = Date.now(); Date.now() - t0 < ms; await bekle(40)) { const d = await durum(); if (!d.kaydediliyor || d.kutu) return d; } return durum(); };
  const kaydet = async () => { await komut('dosya.kaydet'); return kayitBitsin(); };
  const kutuBekle = async (ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await bekle(50)) { const d = await durum(); if (d.kutu) return d; } return durum(); };
  const kutuBas = async (ad) => {
    const p = await evalJs(`(() => { const d = [...[...document.querySelectorAll('.mesaj-kutusu')].at(-1).querySelectorAll('.dugmeler button')].find((x) => x.textContent === ${J(ad)}); if (!d) return null; const r = d.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!p) throw new Error('Kutu düğmesi yok: ' + ad);
    await tikla(p.x, p.y);
    await bekle(120);
  };
  const dugmeTikla = async (id) => { const r = await evalJs(`(() => { const r = document.getElementById(${J(id)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); await tikla(r.x, r.y); await bekle(120); };
  const yanitla = (kanal, yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', ${J(kanal)}, ${J(yanitlar)})`);
  const geciktir = (ms, yontem = '') => evalJs(`(() => { const x = window.__s52.b().xfa; const o = x.cekirdek; x.cekirdek = async (a, p) => { if (!${J(yontem)} || a === ${J(yontem)}) await window.__s52.bekle(${ms}); return o(a, p); }; return true; })()`);
  const degerler = (adlar) => evalJs(`window.__s52.degerler(${J(adlar)})`);
  const hatalar = async () => (await evalJs(`window.__hatalar.splice(0)`)).filter((x) => !/ResizeObserver/.test(x));
  const goruntu = (ad) => ekranGoruntusu(path.join(UI, `${ad}.png`));
  const v = (y, yol) => olc(y).degerler[yol];

  // ================================================================== 1) form yeniden dizilirken
  if (bolum(1)) {
    const y = kopya('dizilirken');
    await ac(y);
    await alanaYaz('AdSoyad', 0, 'Önceden yazılan');
    await tus('Tab');
    await geciktir(1200);
    await tiklaAd('BEkle', 0);
    let d = await durum();
    sonuc('1 Düğmeye basıldı, form diziliyor', d.mesgul, d);
    await tus('Tab');
    await bekle(60);
    d = await durum();
    sonuc('1 Dizilirken Tab alana geçmez', d.odak === 'BUTTON', d);
    await yaz('kaybolacak yazı');
    await durgun();
    await bekle(100);
    const c1 = await degerler(['AdSoyad', 'BAd', 'BAdres', 'Metin', 'Sehir']);
    sonuc('1 Önceki yazı yerinde, yeni bölüm geldi, yazı başka alana sızmadı', c1.AdSoyad[0] === 'Önceden yazılan' && c1.BAd.length === 2 && !J(c1).includes('kaybolacak'), c1);
    // Alan odaktayken başlayan yapı işi (programdan): Yazı alınmaz
    await tiklaAd('Metin', 0);
    await yaz('kalan yazı');
    await bekle(30);
    await evalJs(`(() => { const x = window.__s52.b().xfa; const k = x._dugmeBul(x._yol(document.querySelector('.gorunum:not([hidden]) [xfaname="BEkle"] button'))); window.__s52.sz = x.yapiDegistir('Deneme', k.eylemler); return true; })()`);
    await bekle(100);
    d = await durum();
    await yaz(' alınmayan');
    await bekle(60);
    const ara = await evalJs(`document.activeElement?.value ?? ''`);
    sonuc('1 Dizilirken odaktaki alana yazılmaz (ekranda da görünmez, kaybolan yazı yok)', d.mesgul && !String(ara).includes('alınmayan'), { d, ara });
    await evalJs(`window.__s52.sz`);
    await durgun();
    const c2 = await degerler(['Metin', 'BAd']);
    sonuc('1 Alanda yazılan, iş başlarken uygulandı, form dizilince yerinde', c2.Metin[0] === 'kalan yazı' && c2.BAd.length === 3, c2);
    // Dizilirken Ctrl+Z: Yığın bozulmaz
    await alanaYaz('Sehir', 0, 'geri alınacak yazı');
    await tus('Tab');
    const once = await durum();
    await tiklaAd('BSil', 0);
    await tus('z', ['ctrl']);
    await bekle(80);
    d = await durum();
    sonuc('1 Dizilirken Ctrl+Z yığını oynatmaz, bildirilir', d.konum === once.konum && /yeniden diziliyor/.test(d.bildirim), { d, once });
    await durgun();
    d = await durum();
    const c3 = await degerler(['Sehir', 'BAd']);
    sonuc('1 Silme tamamlandı, yazı yerinde, komut yığında', d.konum === once.konum + 1 && c3.Sehir[0] === 'geri alınacak yazı' && c3.BAd.length === 2, { d, c3 });
    // Temiz belgede Ekle sürerken sekme kapatılırsa soru çıkar
    await kaydet();
    d = await durum();
    sonuc('1 Kaydedildi, belge temiz', !d.degisti && !d.kutu, d);
    await tiklaAd('MEkle', 0);
    await komut('sekme.kapat');
    d = await kutuBekle();
    sonuc('1 Ekle sürerken sekme kapatma: İş biter, belge kirli olduğu için sorulur', /kaydedilmemiş değişiklikler/.test(d.kutu?.ileti || ''), d);
    if (d.kutu) await kutuBas('Vazgeç');
    await durgun();
    d = await durum();
    sonuc('1 Vazgeç: Sekme açık, yeni bölüm yerinde', d.belge === 1 && d.degisti && (await degerler(['Metin'])).Metin.length === 2, d);
    sonuc('1 Sayfada hata yok', !(await hatalar()).length);
  }

  await kapatHepsini();
  console.log(`\n${denetim} denetim, ${hataSayisi} hata`);
  console.log(hataSayisi ? 'HATALAR VAR' : 'BÜTÜN DENETİMLER GEÇTİ');
  if (hataSayisi) process.exitCode = 1;
}
