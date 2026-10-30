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
//  11 Gerçek kısayollar (yalnız görünmeyen masaüstünde, BOLUM=11): Ctrl+S, Ctrl+Z, Ctrl+P, Ctrl+W, pencere kapatma.
//  12 Kullanım hakları imzalı form: İmza kalır, açılan baytlar değişmez, ara taslaklar dosyaya girmez, dosya kayıtla büyümez, bölüm ekleme, ikinci oturum, Farklı kaydet, sekme taşıma.
//  13 Odak almadan gelen yazı (başka programdan sürükleyip bırakma): Alana girer, belge kirli olur, kayıt alır.
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

  // ================================================================== 2) dosya başka programda değişti
  if (bolum(2)) {
    const SORU = 'Dosya başka bir programda değişmiş';
    const DIS = '<Metin>Başka programda yazılan uzun yazı</Metin>';
    const hazirla = async (ad) => {
      const y = kopya(ad);
      await ac(y);
      await alanaYaz('AdSoyad', 0, 'PDEfe yazısı');
      await tus('Tab');
      disKayit(y, '<Metin/>', DIS);
      return y;
    };
    // Vazgeç
    let y = await hazirla('dis-vazgec');
    let once = ozet(y);
    let d = await kaydet();
    await goruntu('2-soru');
    sonuc('2 Kayıt yazmaz, sorar: Farklı kaydet (birincil), Üzerine kaydet, Vazgeç', d.kutu?.ileti === SORU && J(d.kutu.dugmeler) === J(['Farklı kaydet', 'Üzerine kaydet', 'Vazgeç']) && !/\[Errno|\\\\/.test(d.kutu.ayrinti), d);
    sonuc('2 Soru açıkken dosya aynı, öbür programın yazısı yerinde', ozet(y) === once && v(y, 'form1/Bolum/Metin')[0] === 'Başka programda yazılan uzun yazı');
    await kutuBas('Vazgeç');
    d = await durum();
    sonuc('2 Vazgeç: Belge kirli, yazı yerinde, dosya aynı', d.degisti && !d.kutu && ozet(y) === once && (await degerler(['AdSoyad'])).AdSoyad[0] === 'PDEfe yazısı', d);
    // Farklı kaydet
    const yeni = path.join(KLASOR, 'farklı adla.pdf');
    await yanitla('dosya:kaydetDiyalog', [yeni]);
    d = await kaydet();
    await kutuBas('Farklı kaydet');
    d = await kayitBitsin();
    await bekle(100);
    sonuc('2 Farklı kaydet: Sekme yeni dosyada, temiz, kaydedildi denir', !d.kutu && !d.degisti && d.yol === yeni && /kaydedildi/.test(d.bildirim), d);
    sonuc('2 Farklı kaydet: Yeni dosyada PDEfe yazısı, eski dosya aynı', v(yeni, 'form1/Baslik/AdSoyad')[0] === 'PDEfe yazısı' && ozet(y) === once);
    await alanaYaz('Sehir', 0, 'Yeni dosyada devam');
    d = await kaydet();
    sonuc('2 Yeni dosyada sonraki kayıt sormaz', !d.kutu && !d.degisti && v(yeni, 'form1/Baslik/Sehir')[0] === 'Yeni dosyada devam', d);
    // Üzerine kaydet
    y = await hazirla('dis-uzerine');
    d = await kaydet();
    await kutuBas('Üzerine kaydet');
    d = await kayitBitsin();
    await bekle(100);
    sonuc('2 Üzerine kaydet: Yazar, temiz', !d.kutu && !d.degisti && v(y, 'form1/Baslik/AdSoyad')[0] === 'PDEfe yazısı', d);
    await alanaYaz('Sehir', 0, 'Sonraki');
    d = await kaydet();
    sonuc('2 Üzerine kaydet sonrası kayıt sormaz', !d.kutu && !d.degisti && v(y, 'form1/Baslik/Sehir')[0] === 'Sonraki', d);
    // Üzerine kaydet seçimi yalnız o kayıt için
    disKayit(y, '<Metin/>', DIS);
    await alanaYaz('Sehir', 0, 'Yine');
    d = await kaydet();
    sonuc('2 Yeni dış kayıt yine sorulur', d.kutu?.ileti === SORU, d);
    await kutuBas('Vazgeç');
    // Formu Kaydet: Kaydetme penceresinde aynı dosya seçilince de
    y = await hazirla('dis-formu-kaydet');
    once = ozet(y);
    await yanitla('dosya:kaydetDiyalog', [y]);
    await tiklaAd('Kaydet', 0);
    d = await kutuBekle();
    sonuc('2 Formu Kaydet, aynı dosya: Sorulur, dosya aynı', d.kutu?.ileti === SORU && ozet(y) === once, d);
    await kutuBas('Vazgeç');
    // Başka dosya seçilirse sorulmaz (kullanıcı o dosyayı kaydetme penceresinde onayladı)
    const baska = kopya('dis-baska-hedef');
    await yanitla('dosya:kaydetDiyalog', [baska]);
    await tiklaAd('Kaydet', 0);
    d = await kayitBitsin();
    await bekle(100);
    sonuc('2 Formu Kaydet, başka dosya: Sormaz, yazar', !d.kutu && d.yol === baska && !d.degisti && v(baska, 'form1/Baslik/AdSoyad')[0] === 'PDEfe yazısı', d);
    // Kapatma
    y = await hazirla('dis-kapatma');
    once = ozet(y);
    await komut('sekme.kapat');
    d = await kutuBekle();
    await kutuBas('Kaydet');
    d = await kutuBekle();
    sonuc('2 Kapatma sorusunda Kaydet: Değişmiş sorusu çıkar', d.kutu?.ileti === SORU && ozet(y) === once, d);
    await kutuBas('Vazgeç');
    await bekle(200);
    d = await durum();
    sonuc('2 Vazgeç: Sekme açık, yazı yerinde, dosya aynı', d.belge === 1 && d.degisti && ozet(y) === once && (await degerler(['AdSoyad'])).AdSoyad[0] === 'PDEfe yazısı', d);
    // Otomatik kayıt
    y = kopya('dis-otomatik');
    await ac(y);
    await evalJs(`(window.__pdefe.ayar().otomatikKaydet = true, true)`);
    await alanaYaz('AdSoyad', 0, 'Otomatik ilk');
    await tus('Tab');
    for (let i = 0; i < 80 && (await durum()).degisti; i++) await bekle(100);
    sonuc('2 Otomatik kayıt olağan çalışıyor', !(await durum()).degisti && v(y, 'form1/Baslik/AdSoyad')[0] === 'Otomatik ilk');
    disKayit(y, '<Metin/>', DIS);
    once = ozet(y);
    await alanaYaz('Sehir', 0, 'Otomatik ikinci');
    await tus('Tab');
    await bekle(2600);
    d = await durum();
    sonuc('2 Otomatik kayıt: Pencere yok, yazmaz, kirli, durum çubuğunda ve bildirimde söylenir', !d.kutu && d.degisti && ozet(y) === once && /değişmiş/.test(d.mesaj) && /değişmiş/.test(d.bildirim), d);
    d = await kaydet();
    sonuc('2 Otomatik kayıt durduktan sonra Ctrl+S sorar', d.kutu?.ileti === SORU, d);
    await kutuBas('Üzerine kaydet');
    d = await kayitBitsin();
    await bekle(100);
    sonuc('2 Üzerine kaydet: Yazar, otomatik kayıt olağana döner', !d.kutu && !d.degisti && v(y, 'form1/Baslik/Sehir')[0] === 'Otomatik ikinci', d);
    await alanaYaz('Sehir', 0, 'Otomatik üçüncü');
    await tus('Tab');
    for (let i = 0; i < 80 && (await durum()).degisti; i++) await bekle(100);
    sonuc('2 Sonraki otomatik kayıt yazar', !(await durum()).degisti && v(y, 'form1/Baslik/Sehir')[0] === 'Otomatik üçüncü');
    await evalJs(`(window.__pdefe.ayar().otomatikKaydet = false, true)`);
    // Kendi kaydı, dokunulmuş dosya, silinmiş dosya
    y = kopya('dis-kendi');
    await ac(y);
    let soruYok = true;
    for (let i = 0; i < 5; i++) { await alanaYaz('AdSoyad', 0, `Kendi kaydı ${i}`); d = await kaydet(); if (d.kutu) soruYok = false; }
    sonuc('2 Kendi kaydından sonra sormaz (5 kez)', soruYok && v(y, 'form1/Baslik/AdSoyad')[0] === 'Kendi kaydı 4', d);
    const simdi = new Date(Date.now() + 5000);
    fs.utimesSync(y, simdi, simdi);
    await alanaYaz('AdSoyad', 0, 'Dokunulduktan sonra');
    d = await kaydet();
    sonuc('2 Değişme zamanı değişti, içerik aynı: Sormaz', !d.kutu && v(y, 'form1/Baslik/AdSoyad')[0] === 'Dokunulduktan sonra', d);
    fs.rmSync(y);
    await alanaYaz('AdSoyad', 0, 'Silindikten sonra');
    d = await kaydet();
    sonuc('2 Dosya silinmiş: Sormaz, yazar', !d.kutu && fs.existsSync(y) && v(y, 'form1/Baslik/AdSoyad')[0] === 'Silindikten sonra', d);
    // Bölüm eklenip dış kayıt: Baytlar değişti, soru yine doğru dosyaya göre
    y = await hazirla('dis-ekle');
    await tiklaAd('BEkle', 0);
    await durgun();
    once = ozet(y);
    d = await kaydet();
    sonuc('2 Bölüm eklendikten sonra da sorulur', d.kutu?.ileti === SORU && ozet(y) === once, d);
    await kutuBas('Vazgeç');
    // Sekme taşınınca: Damga da taşınır
    y = await hazirla('dis-tasima');
    once = ozet(y);
    const oncekiler = (await hedefler()).map((h) => h.id);
    await evalJs(`(async () => { await window.__pdefe.sekmeyiTasi(window.__s52.b().id, { tur: 'yeni' }); return true; })()`);
    let yeniP = null;
    for (let i = 0; i < 50 && !yeniP; i++) { await bekle(200); yeniP = (await hedefler()).find((h) => !oncekiler.includes(h.id)); }
    sonuc('2 Sekme yeni pencereye taşındı', !!yeniP);
    if (yeniP) {
      hedefSec(yeniP.id);
      await bekle(1200);
      await evalJs(YARDIMCI);
      await evalJs(`(async () => { for (let i = 0; i < 80; i++) { if (document.querySelector('.gorunum:not([hidden]) .xfaLayer')) return true; await window.__s52.bekle(100); } return false; })()`);
      d = await kaydet();
      sonuc('2 Taşınan sekmede de sorulur, dosya aynı', d.kutu?.ileti === SORU && ozet(y) === once, d);
      await kutuBas('Üzerine kaydet');
      d = await kayitBitsin();
      await bekle(100);
      sonuc('2 Taşınan sekmede Üzerine kaydet yazar', !d.kutu && !d.degisti && v(y, 'form1/Baslik/AdSoyad')[0] === 'PDEfe yazısı', d);
      await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); setTimeout(() => window.close(), 200); return true; })()`).catch(() => {});
      hedefSec(null);
      await bekle(800);
      await evalJs(YARDIMCI);
    }
    sonuc('2 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 3) aynı dosya iki yazımla
  if (bolum(3)) {
    const y = kopya('iki yazim');
    const y2 = y.replace(`${path.sep}cikti${path.sep}`, `${path.sep}..${path.sep}test${path.sep}cikti${path.sep}`);
    await ac(y);
    await ac(y2, false);
    const n = await evalJs(`window.__pdefe.belgeler.size`);
    bilgi(`Aynı dosya farklı yazımla ${n} sekmede açıldı`);
    await alanaYaz('AdSoyad', 0, 'İkinci sekmenin yazısı');
    let d = await kaydet();
    sonuc('3 İkinci sekme kaydetti', !d.kutu && v(y, 'form1/Baslik/AdSoyad')[0] === 'İkinci sekmenin yazısı', d);
    if (n === 2) {
      await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.yol === ${J(y)}); await p.sekmeSec(b.id); return true; })()`);
      await bekle(200);
      await alanaYaz('Sehir', 0, 'Birinci sekmenin yazısı');
      const once = ozet(y);
      d = await kaydet();
      sonuc('3 Birinci sekmenin kaydı öbürünün yazısını silmez, sorar', d.kutu?.ileti === 'Dosya başka bir programda değişmiş' && ozet(y) === once && v(y, 'form1/Baslik/AdSoyad')[0] === 'İkinci sekmenin yazısı', d);
      if (d.kutu) await kutuBas('Vazgeç');
    }
  }

  // ================================================================== 4) zengin metinli değer
  if (bolum(4)) {
    const ZENGIN = '<CokOrtali xfa:contentType="text/html"><body xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/" xfa:APIVersion="Deneme:1.0" xfa:spec="2.1"><p style="font-weight:bold">Zengin birinci paragraf</p><p>Zengin ikinci paragraf</p></body></CokOrtali>';
    const BEK = 'Zengin birinci paragraf\nZengin ikinci paragraf';
    const hazirla = async (ad) => { const y = kopya(ad, oz.xfaBicim); disKayit(y, '<CokOrtali/>', ZENGIN); await ac(y); return y; };
    let y = await hazirla('zengin');
    sonuc('4 Açılışta zengin değer görünür', (await degerler(['CokOrtali'])).CokOrtali[0] === BEK, await degerler(['CokOrtali']));
    // Başka alan değişir, kaydedilir, yeniden açılır
    await alanaYaz('Solda', 0, 'Başka alan');
    await tus('Tab');
    let d = await kaydet();
    let o = olc(y);
    bilgi(`dosyadaki değer: ${o.ham.match(/<CokOrtali[\s\S]*?<\/CokOrtali>/)?.[0]}`);
    sonuc('4 Kayıt: Zengin değer XHTML ad alanıyla dosyada', !d.kutu && /<CokOrtali[^>]*contentType="text\/html"[^>]*><body xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/.test(o.ham) && o.ham.includes('Zengin ikinci paragraf') && !o.onarildi, o.ham.slice(0, 600));
    await ac(y);
    sonuc('4 Yeniden açınca zengin değer görünür, öbür alan da', J(await degerler(['CokOrtali', 'Solda'])) === J({ CokOrtali: [BEK], Solda: ['Başka alan'] }), await degerler(['CokOrtali', 'Solda']));
    // İkinci tur: Kaydet, aç, kaydet
    await alanaYaz('Solda', 0, 'İkinci tur');
    await tus('Tab');
    await kaydet();
    await ac(y);
    sonuc('4 İki kayıttan sonra da görünür', (await degerler(['CokOrtali'])).CokOrtali[0] === BEK);
    // Bölüm ekleme ve geri alma
    await tiklaAd('BicimEkle', 0);
    await durgun();
    sonuc('4 Bölüm Ekle: Zengin değer yerinde', (await degerler(['CokOrtali'])).CokOrtali[0] === BEK && (await degerler(['YOrtali'])).YOrtali.length === 2, await degerler(['CokOrtali', 'YOrtali']));
    await dugmeTikla('dugme-geri-al');
    await durgun();
    sonuc('4 Geri al: Zengin değer yerinde', (await degerler(['CokOrtali'])).CokOrtali[0] === BEK && (await degerler(['YOrtali'])).YOrtali.length === 1);
    // Yazdırma: Düz PDF'te yazı var
    const duz = await evalJs(`(async () => (await window.__s52.b().xfa.duzPdf()).yol)()`);
    const metin = execFileSync(PY, ['-X', 'utf8', '-I', '-c', 'import sys, pymupdf; sys.stdout.reconfigure(encoding="utf-8"); d = pymupdf.open(sys.argv[1]); print(" ".join(p.get_text() for p in d))', duz], { encoding: 'utf8' });
    sonuc('4 Yazdırma: Düz PDF\'te zengin değer var', metin.includes('Zengin birinci') && metin.includes('Zengin ikinci'), metin.slice(0, 300));
    // Sekme taşıma
    const oncekiler = (await hedefler()).map((h) => h.id);
    await evalJs(`(async () => { await window.__pdefe.sekmeyiTasi(window.__s52.b().id, { tur: 'yeni' }); return true; })()`);
    let yeniP = null;
    for (let i = 0; i < 50 && !yeniP; i++) { await bekle(200); yeniP = (await hedefler()).find((h) => !oncekiler.includes(h.id)); }
    if (sonuc('4 Sekme yeni pencereye taşındı', !!yeniP)) {
      hedefSec(yeniP.id);
      await bekle(1200);
      await evalJs(YARDIMCI);
      await evalJs(`(async () => { for (let i = 0; i < 80; i++) { if (document.querySelector('.gorunum:not([hidden]) .xfaLayer')) return true; await window.__s52.bekle(100); } return false; })()`);
      sonuc('4 Taşınan sekmede zengin değer görünür', (await degerler(['CokOrtali'])).CokOrtali[0] === BEK, await degerler(['CokOrtali']));
      await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); setTimeout(() => window.close(), 200); return true; })()`).catch(() => {});
      hedefSec(null);
      await bekle(800);
      await evalJs(YARDIMCI);
    }
    // Alanın kendisi düzenlenir
    y = await hazirla('zengin-duzenle');
    await alanaYaz('CokOrtali', 0, 'Düz yazıyla değişti');
    await tus('Tab');
    d = await kaydet();
    o = olc(y);
    sonuc('4 Zengin alan düzenlendi: Düz metin, eski yazı dosyada yok', !d.kutu && o.degerler['form1/Bicim/CokOrtali'][0] === 'Düz yazıyla değişti' && !o.ham.includes('Zengin birinci'), o.ham.slice(0, 500));
    await ac(y);
    sonuc('4 Yeniden açınca düz yazı', (await degerler(['CokOrtali'])).CokOrtali[0] === 'Düz yazıyla değişti');
    // Alan boşaltılır: Eski yazı geri gelmez
    y = await hazirla('zengin-bosalt');
    await alanaYaz('CokOrtali', 0, '');
    await tus('Tab');
    d = await kaydet();
    o = olc(y);
    sonuc('4 Boşaltıldı: Yazı dosyada yok, yer tutucu boşluk yok', !d.kutu && !o.ham.includes('Zengin') && /<CokOrtali(\/>|><\/CokOrtali>)/.test(o.ham), o.ham.slice(0, 500));
    await ac(y);
    sonuc('4 Boşaltıldı: Yeniden açınca boş, belge temiz', (await degerler(['CokOrtali'])).CokOrtali[0] === '' && !(await durum()).degisti);
    // Geri alınabilir
    y = await hazirla('zengin-geri');
    await alanaYaz('CokOrtali', 0, '');
    await tus('Tab');
    await dugmeTikla('dugme-geri-al');
    await durgun();
    sonuc('4 Boşaltma geri alındı: Yazı yerinde', (await degerler(['CokOrtali'])).CokOrtali[0] === BEK, await degerler(['CokOrtali']));
    d = await kaydet();
    o = olc(y);
    sonuc('4 Geri aldıktan sonra kayıt', o.ham.includes('Zengin birinci'), o.ham.slice(0, 500));
    // Zengin değersiz formda boş değer gerçekten boş, boşluk konmaz
    y = kopya('zengin-yok', oz.xfaBicim);
    await ac(y);
    await alanaYaz('Solda', 0, 'Yazı');
    await tus('Tab');
    await kaydet();
    await alanaYaz('Solda', 0, '');
    await tus('Tab');
    await kaydet();
    o = olc(y);
    sonuc('4 Zengin değersiz form: Boş değer boş', /<Solda\/>/.test(o.ham), o.ham.slice(0, 300));
    sonuc('4 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 5) PDF.js işçisi durursa
  if (bolum(5)) {
    const y = kopya('isci');
    await ac(y);
    await alanaYaz('AdSoyad', 0, 'İşçi ölünce yazılan');
    const once = ozet(y);
    await evalJs(`(() => { const g = window.__s52.g(); g.xfaBaytSuresi = 1500; g.yuklemeGorevi._worker.port.terminate(); return true; })()`);
    let d = await kaydet();
    d = await kutuBekle(5000);
    await goruntu('5-isci');
    sonuc('5 Kayıt askıda kalmaz: Pencere, Yeniden dene ve Vazgeç', d.kutu?.ileti === 'Belge kaydedilemedi' && J(d.kutu.dugmeler) === J(['Yeniden dene', 'Vazgeç']) && /hazırlanamadı/.test(d.kutu.ayrinti), d);
    sonuc('5 Dosya aynı', ozet(y) === once);
    await kutuBas('Vazgeç');
    d = await durum();
    sonuc('5 Vazgeç: Kirli, yazı alanda', d.degisti && !d.kaydediliyor && (await evalJs(`document.querySelector('.gorunum:not([hidden]) [xfaname="AdSoyad"] input').value`)) === 'İşçi ölünce yazılan', d);
    await komut('sekme.kapat');
    d = await kutuBekle();
    sonuc('5 Kapatma sorusu "Son kayıt yapılamadı" der', /Son kayıt yapılamadı/.test(d.kutu?.ayrinti || ''), d);
    await kutuBas('Kaydetme');
    await bekle(400);
    d = await durum();
    sonuc('5 Kaydetme: Sekme kapanabilir, pencere askıda kalmaz', d.belge === 0, d);
    await hatalar();
  }

  // ================================================================== 6) zor metinler
  if (bolum(6)) {
    const harfler = (s) => String(s ?? '').replace(/[\s ﻿]/gu, '');
    const ZOR = {
      'tek satır': 'tek satır',
      'iki satır': 'iki\nsatır',
      'başta boş satır': '\n\nbaşta iki boş satır',
      'sonda boş satır': 'sonda boş satır\n\n',
      'ortada boş satır': 'ortada\n\n\nüç satır sonu',
      sekme: 'sekme\tiçinde\t\tiki',
      'satır ayırıcı': 'satır ayırıcı sonra',
      'paragraf ayırıcı': 'paragraf ayırıcı sonra',
      'sıfır genişlik': 'sıfır genişlik​ve‍ birleştirici',
      'NEL ve DEL': 'NEL\u0085karakteri ve DEL\u007f',
      'XML işaretleri': '< > & " \' ]]> <!-- --> &amp; &#xA; &#10; <b>x</b> <?pi?> %PDF endstream',
      'vekil çift': 'vekil 😀👩‍⚖️𝒜 ve 日本語',
      'yalnız boşluk satırı': 'yalnız boşluk satırı\n   \nsonra',
      'sağdan sola': 'ٱلْعَرَبِيَّة ve עברית',
      'baş ve son boşluk': '   baş ve son boşluk   ',
      'çift boşluk': 'çift  boşluk   üç    dört',
      uzun: 'çokuzunsözcük'.repeat(4000),
      'NBSP ve BOM': '﻿ NBSP başta ve ortada',
    };
    for (const [ad, m] of Object.entries(ZOR)) {
      const y = kopya('zor');
      await ac(y);
      await alanaYaz('Metin', 0, m);
      const dom0 = await evalJs(`document.querySelector('.gorunum:not([hidden]) [xfaname="Metin"] textarea').value`);
      let d = await kaydet();
      const o1 = v(y, 'form1/Bolum/Metin')?.[0];
      await ac(y);
      const dom1 = (await degerler(['Metin'])).Metin[0];
      await tiklaAd('MEkle', 0);
      await durgun();
      const dom2 = (await degerler(['Metin'])).Metin[0];
      await tiklaAd('AdSoyad', 0);
      await yaz('x');
      await tus('Tab');
      await kaydet();
      const o2 = v(y, 'form1/Bolum/Metin')?.[0];
      await ac(y);
      const c3 = await degerler(['Metin']);
      const h = harfler(dom0);
      sonuc(`6 ${ad}: Kayıt, açılış, Ekle, ikinci kayıt: Yazı aynı (bilinen sınır: Boşluk ve satır sonu)`, !d.kutu && !d.degisti && harfler(o1) === h && harfler(dom1) === h && harfler(dom2) === h && harfler(o2) === h && harfler(c3.Metin[0]) === h && c3.Metin.length === 2,
        { dom0: dom0.slice(0, 40), o1: String(o1).slice(0, 40), dom1: String(dom1).slice(0, 40), dom2: String(dom2).slice(0, 40), o2: String(o2).slice(0, 40), c3: String(c3.Metin[0]).slice(0, 40), n: c3.Metin.length, d: d.kutu });
    }
    // Yarım vekil, denetim karakteri, kod dışı karakter: Temizlenir, kalan yazı yerinde, XML geçerli
    const y = kopya('zor-denetim');
    await ac(y);
    await alanaYaz('Metin', 0, 'yarım \ud83d son \u0001\u0007 sayfa\u000csonu ￾ bitti');
    const d = await kaydet();
    const o = olc(y);
    sonuc('6 Denetim karakterleri: Dosyanın XML\'i geçerli, yazı yerinde', !d.kutu && !o.onarildi && /yarım .* son .*sayfa\nsonu .*bitti/s.test(o.degerler['form1/Bolum/Metin'][0]), o.degerler['form1/Bolum/Metin']);
    // Yazı dışı denetimler: Onay kutusu, seçenek düğmesi kaydedilir, yeniden açınca yerinde
    const y6 = kopya('secim', oz.xfaBicim);
    await ac(y6);
    const sec = (ad) => evalJs(`(() => { const e = document.querySelector('.gorunum:not([hidden]) [xfaname="${ad}"] input'); return { c: e.checked, v: e.value }; })()`);
    await tiklaAd('Onay', 0);
    await tiklaAd('SecimB', 0);
    await bekle(60);
    const d6 = await kaydet();
    const ds = olc(y6).ham;
    sonuc('6 Onay kutusu ve seçenek düğmesi dosyada', !d6.kutu && !d6.degisti && /<Onay>[^<]+<\/Onay>/.test(ds) && /<Secim>[^<]+<\/Secim>/.test(ds), { d6, ds: ds.slice(0, 500) });
    await ac(y6);
    const s1 = await sec('Onay'), s2 = await sec('SecimB'), s3 = await sec('SecimA');
    sonuc('6 Yeniden açınca işaretler yerinde', s1.c && s2.c && !s3.c, { s1, s2, s3 });
    await tiklaAd('BicimEkle', 0);
    await durgun();
    sonuc('6 Bölüm ekleyince işaretler yerinde', (await sec('Onay')).c && (await sec('SecimB')).c);
    sonuc('6 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 7) alan odaktayken
  if (bolum(7)) {
    const metinAlan = () => evalJs(`document.querySelector('.gorunum:not([hidden]) [xfaname="Metin"] textarea')?.value`);
    const cdp = async (method, params = {}) => { const h = (await hedefler())[0]; const ws = new WebSocket(h.webSocketDebuggerUrl); await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; }); const s = await new Promise((c) => { ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id === 1) c(x); }; ws.send(J({ id: 1, method, params })); }); ws.close(); return s; };
    // Yakınlaştırma
    let y = kopya('odak-zoom');
    await ac(y);
    await tiklaAd('Metin', 0);
    await yaz('Bir');
    await komut('gorunum.yakinlastir'); await bekle(400);
    let d = await durum();
    sonuc('7 Yakınlaştırınca alan odakta, yazı yerinde, kirli', d.odak === 'TEXTAREA' && d.degisti && (await metinAlan()) === 'Bir', d);
    await yaz(' iki');
    await komut('gorunum.zoom', 'sayfa'); await bekle(400);
    await yaz(' üç');
    await komut('gorunum.zoom', 'gercek'); await bekle(400);
    await yaz(' dört');
    await goruntu('7-zoom');
    d = await kaydet();
    sonuc('7 Yakınlaştırmalar arasında yazılanların hepsi dosyada, imleç yerinde', !d.kutu && !d.degisti && d.odak === 'TEXTAREA' && v(y, 'form1/Bolum/Metin')[0] === 'Bir iki üç dört', { d, x: v(y, 'form1/Bolum/Metin') });
    // Sayfa düzeni
    for (const duzen of ['iki', 'tek']) {
      await tiklaAd('Metin', 0);
      await yaz(` ${duzen}`);
      await komut('gorunum.duzen', duzen); await bekle(500);
      d = await kaydet();
      sonuc(`7 Düzen ${duzen}: Yazı dosyada`, !d.kutu && !d.degisti && v(y, 'form1/Bolum/Metin')[0].endsWith(` ${duzen}`), { d, x: v(y, 'form1/Bolum/Metin') });
    }
    // Kaydırmasız düzende sayfa çevirme: Alan gizlenir, yazı uygulanır
    y = kopya('odak-cevirme');
    await ac(y);
    await tiklaAd('MEkle', 0);
    await durgun();
    await komut('gorunum.kaydirma'); await bekle(500);
    await tiklaAd('Sehir', 0);
    await yaz('Çevirmeden önce');
    await komut('gorunum.sonrakiSayfa'); await bekle(600);
    d = await durum();
    sonuc('7 Kaydırmasız düzende sayfa çevrilince kirli kalır', d.degisti, d);
    d = await kaydet();
    sonuc('7 Kaydırmasız düzende kayıt yazıyı alır', !d.kutu && v(y, 'form1/Baslik/Sehir')[0] === 'Çevirmeden önce', { d, x: v(y, 'form1/Baslik/Sehir') });
    await komut('gorunum.kaydirma'); await bekle(300);
    // Sekme değiştirip dönme
    const y1 = kopya('odak-sekme-1'), y2 = kopya('odak-sekme-2');
    await ac(y1); await ac(y2, false);
    const sec = (yol) => evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.yol === ${J(yol)}); await p.sekmeSec(b.id); return true; })()`);
    await sec(y1); await bekle(300);
    await alanaYaz('Metin', 0, 'Sekme değişmeden yazılan');
    await sec(y2); await bekle(400);
    d = await evalJs(`[...window.__pdefe.belgeler.values()].map((b) => [b.yol === ${J(y1)}, b.degisti])`);
    sonuc('7 Öbür sekmeye geçince ilk sekme kirli', d.find((x) => x[0])[1] === true && d.find((x) => !x[0])[1] === false, d);
    await sec(y1); await bekle(400);
    sonuc('7 Dönünce yazı yerinde', (await degerler(['Metin'])).Metin[0] === 'Sekme değişmeden yazılan');
    d = await kaydet();
    sonuc('7 Kayıt yazıyı alır', !d.kutu && !d.degisti && v(y1, 'form1/Bolum/Metin')[0] === 'Sekme değişmeden yazılan', d);
    // Sekmeyi yeni pencereye taşıma: Yazı ve geri al geçmişi
    y = kopya('odak-tasi');
    await ac(y);
    await alanaYaz('Sehir', 0, 'Önceki adım'); await tus('Tab');
    await alanaYaz('Metin', 0, 'Taşınırken alanda kalan yazı');
    const oncekiler = (await hedefler()).map((h) => h.id);
    await evalJs(`(async () => { await window.__pdefe.sekmeyiTasi(window.__s52.b().id, { tur: 'yeni' }); return true; })()`);
    let yeniP = null;
    for (let i = 0; i < 50 && !yeniP; i++) { await bekle(200); yeniP = (await hedefler()).find((h) => !oncekiler.includes(h.id)); }
    if (sonuc('7 Sekme taşındı', !!yeniP)) {
      hedefSec(yeniP.id);
      await bekle(1200);
      await evalJs(YARDIMCI);
      await evalJs(`(async () => { for (let i = 0; i < 80; i++) { if (document.querySelector('.gorunum:not([hidden]) .xfaLayer')) return true; await window.__s52.bekle(100); } return false; })()`);
      d = await durum();
      sonuc('7 Hedef pencerede yazı, kirli, iki komut', d.degisti && d.konum === 2 && (await degerler(['Metin'])).Metin[0] === 'Taşınırken alanda kalan yazı', d);
      await dugmeTikla('dugme-geri-al');
      await durgun();
      sonuc('7 Hedef pencerede Geri al: Son yazı gider, önceki kalır', (await degerler(['Metin'])).Metin[0] === '' && (await degerler(['Sehir'])).Sehir[0] === 'Önceki adım');
      await dugmeTikla('dugme-yinele');
      await durgun();
      d = await kaydet();
      sonuc('7 Hedef pencerede kayıt yazıyı alır', !d.kutu && !d.degisti && v(y, 'form1/Bolum/Metin')[0] === 'Taşınırken alanda kalan yazı' && v(y, 'form1/Baslik/Sehir')[0] === 'Önceki adım', d);
      await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); setTimeout(() => window.close(), 200); return true; })()`).catch(() => {});
      hedefSec(null);
      await bekle(800);
      await evalJs(YARDIMCI);
    }
    // Aynı dosyayı ikinci kez açma: Sekmesi seçilir, yazı yerinde
    y = kopya('odak-ikinci-kez');
    await ac(y);
    await alanaYaz('Metin', 0, 'İkinci kez açılmadan yazılan');
    await ac(y, false);
    d = await durum();
    sonuc('7 Aynı dosyayı ikinci kez açma: Yeni sekme yok, yazı yerinde, kirli', d.belge === 1 && d.degisti && (await degerler(['Metin'])).Metin[0] === 'İkinci kez açılmadan yazılan', d);
    // IME dizgisi sürerken kayıt
    y = kopya('odak-ime');
    await ac(y);
    await tiklaAd('Metin', 0);
    await yaz('başlangıç ');
    await cdp('Input.imeSetComposition', { text: 'şe', selectionStart: 2, selectionEnd: 2 });
    await bekle(60);
    d = await kaydet();
    const ara = v(y, 'form1/Bolum/Metin')[0];
    await cdp('Input.imeSetComposition', { text: 'şey', selectionStart: 3, selectionEnd: 3 });
    await cdp('Input.insertText', { text: 'şey' });
    await bekle(80);
    const d2 = await durum();
    sonuc('7 IME dizgisi sürerken kayıt yazıyı almaz sanılmaz: Dizgi bitince belge yine kirli', !d.kutu && ara === 'başlangıç şe' && d2.degisti, { ara, d2 });
    d = await kaydet();
    sonuc('7 Dizgi bitince kayıt tam yazıyı alır', !d.kutu && !d.degisti && v(y, 'form1/Bolum/Metin')[0] === 'başlangıç şey', v(y, 'form1/Bolum/Metin'));
    // Gerçek tuşlar: Kısayollara gitmez
    y = kopya('odak-tuslar');
    await ac(y);
    await tiklaAd('Metin', 0);
    for (const t of ['a', ' ', 'b', 'c', 'f', 'h', 'n', '1', '0', '+', '-']) await tus(t);
    await tusHam({ key: 'ş', code: 'Semicolon', vk: 0xBA });
    await tusHam({ key: 'ı', code: 'KeyI', vk: 0x49 });
    sonuc('7 Gerçek tuşlar alana yazar', (await metinAlan()) === 'a bcfhn10+-şı', await metinAlan());
    await tus('Escape');
    await bekle(60);
    d = await durum();
    sonuc('7 Esc yazıyı silmez, kirli', d.degisti && (await metinAlan()) === 'a bcfhn10+-şı', d);
    // Kapatma sorusunda Vazgeç: Odak alana döner, yazmaya devam
    await komut('sekme.kapat');
    d = await kutuBekle();
    sonuc('7 Alan odaktayken sekme kapatma: Soru', /kaydedilmemiş değişiklikler/.test(d.kutu?.ileti || ''), d);
    await kutuBas('Vazgeç');
    await bekle(120);
    await yaz(' sonra');
    await bekle(60);
    sonuc('7 Vazgeç: Odak alanda, yazmaya devam', (await metinAlan()) === 'a bcfhn10+-şı sonra', await metinAlan());
    // Yazdırma penceresi açılıp kapanınca yazı yerinde
    await komut('dosya.yazdir');
    for (let i = 0; i < 100 && !(await evalJs(`!!document.querySelector('.yazdir-pencere, #yazdir-pencere, .yazdir')`)); i++) await bekle(100);
    await tus('Escape');
    await bekle(400);
    d = await kaydet();
    sonuc('7 Yazdırmadan sonra kayıt yazıyı alır', !d.kutu && !d.degisti && v(y, 'form1/Bolum/Metin')[0] === 'a bcfhn10+-şı sonra', { d, x: v(y, 'form1/Bolum/Metin') });
    sonuc('7 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 8) çekirdek öldürülünce
  if (bolum(8)) {
    const PID = process.env.PDEFE_TEST_PID;
    const oldur = () => execFileSync('powershell', ['-NoProfile', '-Command', `
      $h = Get-CimInstance Win32_Process; $set = @(${PID}); for ($i = 0; $i -lt 6; $i++) { $set += ($h | Where-Object { $set -contains $_.ParentProcessId } | ForEach-Object ProcessId); $set = $set | Select-Object -Unique };
      $h | Where-Object { ($set -contains $_.ProcessId) -and $_.Name -eq 'python.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }`], { encoding: 'utf8' }).trim();
    const y = kopya('cekirdek');
    await ac(y);
    await alanaYaz('AdSoyad', 0, 'Çekirdek ölmeden yazıldı');
    sonuc('8 Çekirdek bulundu, öldürüldü', !!oldur());
    await bekle(300);
    let d = await kaydet();
    if (d.kutu) { await kutuBas('Yeniden dene'); d = await kayitBitsin(); }
    await bekle(200);
    sonuc('8 Kayıttan önce öldü: Kayıt yine yazar', !d.kutu && !d.degisti && v(y, 'form1/Baslik/AdSoyad')[0] === 'Çekirdek ölmeden yazıldı', d);
    // Kayıt sürerken
    await alanaYaz('Sehir', 0, 'Kayıt sürerken ölecek');
    await geciktir(400, 'xfa_kaydet');
    const once = ozet(y);
    await komut('dosya.kaydet');
    await bekle(100);
    oldur();
    d = await kayitBitsin();
    await bekle(200);
    d = await durum();
    if (d.kutu) {
      sonuc('8 Kayıt sürerken öldü: Pencere, ham hata yok, dosya aynı ya da tam yazılmış', !/\[Errno|Traceback|\\\\/.test(d.kutu.ayrinti) && (ozet(y) === once || v(y, 'form1/Baslik/Sehir')[0] === 'Kayıt sürerken ölecek'), d);
      await kutuBas('Yeniden dene');
      d = await kayitBitsin();
      await bekle(200);
    }
    sonuc('8 Kayıt sürerken öldü: Sonunda yazı dosyada, temiz', !d.kutu && !d.degisti && v(y, 'form1/Baslik/Sehir')[0] === 'Kayıt sürerken ölecek', d);
    // Ekle sürerken
    await alanaYaz('Metin', 0, 'Ekle sürerken korunacak');
    await tus('Tab');
    await geciktir(300, 'xfa_degistir');
    await tiklaAd('MEkle', 0);
    oldur();
    await durgun();
    await bekle(300);
    d = await durum();
    const c = await degerler(['Metin']);
    sonuc('8 Ekle sürerken öldü: Yazı yerinde, form çalışıyor', c.Metin[0] === 'Ekle sürerken korunacak' && d.kutu === null, { c, d });
    if (c.Metin.length === 1) { await tiklaAd('MEkle', 0); await durgun(); }
    sonuc('8 Yeniden denenen Ekle çalışır', (await degerler(['Metin'])).Metin.length === 2);
    d = await kaydet();
    sonuc('8 Kayıt yazıyı ve bölümü alır', !d.kutu && !d.degisti && v(y, 'form1/Bolum/Metin')[0] === 'Ekle sürerken korunacak' && v(y, 'form1/Bolum/Metin').length === 2, d);
    await hatalar();
  }

  // ================================================================== 9) rastgele işlem dizisi, modelle karşılaştırma
  if (bolum(9)) {
    const ALANLAR = ['AdSoyad', 'Sehir', 'BAd', 'BAdres', 'Metin'];
    const normal = (s) => String(s ?? '').replace(/(^|\n) (?=\n)/g, '$1');   // boş satır dosyada bir boşluklu satırdır (xfa.js veriDegeri)
    for (const tohum of TOHUMLAR) {
      const r = rastgeleUret(tohum);
      const y = kopya(`rastgele-${tohum}`), y2 = kopya(`rastgele-${tohum}-ikinci`);
      await ac(y);
      let m = { AdSoyad: '', Sehir: '', B: [['', '']], M: [''] };
      const kopyala = (s) => JSON.parse(J(s));
      let gecmis = [], ileri = [], kayitli = kopyala(m), kayitKonum = 0, bekleyen = null;
      const degistir = (f) => { gecmis.push(kopyala(m)); ileri = []; f(m); };
      const domBeklenen = () => ({ AdSoyad: [m.AdSoyad], Sehir: [m.Sehir], BAd: m.B.map((x) => x[0]), BAdres: m.B.map((x) => x[1]), Metin: m.M });
      const dosyaBeklenen = (s) => ({ AdSoyad: s.AdSoyad, Sehir: s.Sehir, BAd: s.B.map((x) => x[0]), BAdres: s.B.map((x) => x[1]), Metin: s.M });
      const metinUret = (cok) => {
        const sozcuk = () => r.sec(['mahkeme', 'başvurucu', 'ığşçöü', 'İĞŞÇÖÜ', 'hak', 'ihlal', '< > &', '"tırnak"', '😀', '12345', 'yargılama']);
        let s = Array.from({ length: 1 + r.n(6) }, sozcuk).join(' ');
        if (cok && r.olasi(0.4)) s += '\n' + Array.from({ length: 1 + r.n(5) }, sozcuk).join(' ');
        if (cok && r.olasi(0.2)) s += '\n\n' + Array.from({ length: 1 + r.n(5) }, sozcuk).join(' ');
        if (cok && r.olasi(0.1)) { const parca = s + '\n'; s = parca.repeat(Math.ceil(8000 / parca.length)).trimEnd(); }
        return s;
      };
      const izler = [];
      let bozuk = false;
      for (let i = 0; i < TUR && !bozuk; i++) {
        const secenek = r.n(100);
        let is = '';
        if (secenek < 40) {
          const hedefler_ = [['AdSoyad', 0, false], ['Sehir', 0, false], ...m.B.flatMap((_, k) => [['BAd', k, false], ['BAdres', k, true]]), ...m.M.map((_, k) => ['Metin', k, true])];
          const [ad, k, cok] = r.sec(hedefler_);
          const metin = r.olasi(0.1) ? '' : metinUret(cok);
          const onceki = ad === 'AdSoyad' ? m.AdSoyad : ad === 'Sehir' ? m.Sehir : ad === 'BAd' ? m.B[k][0] : ad === 'BAdres' ? m.B[k][1] : m.M[k];
          if (bekleyen === `${ad}:${k}`) { await tus('Tab'); await bekle(20); bekleyen = null; }
          await alanaYaz(ad, k, metin);
          is = `yaz ${ad}[${k}] (${metin.length})`;
          if (metin !== onceki) {
            degistir((s) => { if (ad === 'AdSoyad') s.AdSoyad = metin; else if (ad === 'Sehir') s.Sehir = metin; else if (ad === 'BAd') s.B[k][0] = metin; else if (ad === 'BAdres') s.B[k][1] = metin; else s.M[k] = metin; });
            if (r.olasi(0.7)) { await tus('Tab'); await bekle(20); } else bekleyen = `${ad}:${k}`;
          } else { await tus('Tab'); await bekle(20); }
        } else if (secenek < 50) {
          if (m.B.length < 4) { await tiklaAd('BEkle', r.n(m.B.length)); bekleyen = null; await durgun(); degistir((s) => s.B.push(['', ''])); is = 'BEkle'; }
        } else if (secenek < 58) {
          await tiklaAd('BSil', r.n(m.B.length)); bekleyen = null; await durgun();
          if (m.B.length > 1) degistir((s) => s.B.pop());
          is = 'BSil';
        } else if (secenek < 66) {
          if (m.M.length < 4) { await tiklaAd('MEkle', r.n(m.M.length)); bekleyen = null; await durgun(); degistir((s) => s.M.push('')); is = 'MEkle'; }
        } else if (secenek < 72) {
          await tiklaAd('MSil', r.n(m.M.length)); bekleyen = null; await durgun();
          if (m.M.length > 1) degistir((s) => s.M.pop());
          is = 'MSil';
        } else if (secenek < 80) {
          if (gecmis.length) { await dugmeTikla('dugme-geri-al'); bekleyen = null; await durgun(); ileri.push(kopyala(m)); m = gecmis.pop(); is = 'geri al'; }
        } else if (secenek < 85) {
          if (ileri.length) {
            if (bekleyen) { await tus('Tab'); await bekle(20); bekleyen = null; }
            await dugmeTikla('dugme-yinele'); await durgun(); gecmis.push(kopyala(m)); m = ileri.pop(); is = 'yinele';
          }
        } else if (secenek < 91) {
          const d = await kaydet();
          bekleyen = null;
          is = 'kaydet';
          kayitli = kopyala(m); kayitKonum = gecmis.length;
          await bekle(50);
          const o = olc(y);
          const dosya = { AdSoyad: o.degerler['form1/Baslik/AdSoyad'][0], Sehir: o.degerler['form1/Baslik/Sehir'][0], BAd: o.degerler['form1/Basvurucu/BAd'], BAdres: o.degerler['form1/Basvurucu/BAdres'], Metin: o.degerler['form1/Bolum/Metin'] };
          const bek = dosyaBeklenen(m);
          const esit = (a, b) => Array.isArray(a) ? a.length === b.length && a.every((x, j) => normal(x) === normal(b[j])) : normal(a) === normal(b);
          if (d.kutu || d.degisti || o.onarildi || !o.saf || !Object.keys(bek).every((a) => esit(dosya[a], bek[a]))) { bozuk = !sonuc(`9 tohum ${tohum} adım ${i}: Kayıt ile dosya model gibi`, false, { d, dosya, bek, izler: izler.slice(-8) }); }
        } else if (secenek < 94) {
          await komut(r.olasi(0.5) ? 'gorunum.yakinlastir' : 'gorunum.uzaklastir'); await bekle(200); is = 'yakınlaştır';
        } else if (secenek < 97) {
          if (bekleyen) { await tus('Tab'); await bekle(20); bekleyen = null; }
          await ac(y2, false); await bekle(150);
          await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.yol === ${J(y)}); await p.sekmeSec(b.id); return true; })()`);
          await bekle(200); is = 'sekme değiştir';
        } else {
          // Kapatıp yeniden açma: Kirliyse soru (Kaydetme ya da Kaydet)
          await bekle(30);
          const d0 = await durum();
          is = 'yeniden aç';
          if (d0.degisti) {
            await komut('sekme.kapat');
            const d = await kutuBekle();
            const kaydetSec = r.olasi(0.5);
            await kutuBas(kaydetSec ? 'Kaydet' : 'Kaydetme');
            await bekle(300);
            for (let t = 0; t < 100 && (await evalJs(`[...window.__pdefe.belgeler.values()].some((b) => b.yol === ${J(y)})`)); t++) await bekle(100);
            if (kaydetSec) kayitli = kopyala(m); else m = kopyala(kayitli);
            is += kaydetSec ? ' (Kaydet)' : ' (Kaydetme)';
            if (!d.kutu) sonuc(`9 tohum ${tohum} adım ${i}: Kirli belgede soru`, false, d);
          } else {
            await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.yol === ${J(y)}); if (b) await p.belgeKapat(b.id); return true; })()`);
            m = kopyala(kayitli);   // temizse dosyadaki hâldir
          }
          bekleyen = null;
          await ac(y, false);
          gecmis = []; ileri = []; kayitKonum = 0;
        }
        if (!is) continue;
        izler.push(`${i}:${is}`);
        if (bozuk) break;
        await bekle(30);
        const dom = await degerler(ALANLAR);
        const bek = domBeklenen();
        const esit = ALANLAR.every((a) => dom[a].length === bek[a].length && dom[a].every((x, j) => normal(x) === normal(bek[a][j])));
        if (!esit) { bozuk = !sonuc(`9 tohum ${tohum} adım ${i} (${is}): Ekran model gibi`, false, { dom, bek, izler: izler.slice(-10), durum: await durum(), yigin: await evalJs(`window.__s52.b().yigin.yigin.map((k) => k.ad)`), gecmis: gecmis.length }); await goruntu(`9-tohum${tohum}-adim${i}`); }
        const d = await durum();
        if (!bekleyen && !bozuk) {
          if (d.konum !== gecmis.length) { bozuk = !sonuc(`9 tohum ${tohum} adım ${i} (${is}): Geri al yığını model gibi`, false, { konum: d.konum, model: gecmis.length, izler: izler.slice(-10) }); }
          else if (d.degisti !== (gecmis.length !== kayitKonum && J(m) !== '')) {
            if (d.degisti !== (d.konum !== d.kayit)) bozuk = !sonuc(`9 tohum ${tohum} adım ${i} (${is}): Kirli işareti yığınla tutarlı`, false, d);
          }
        }
      }
      if (!bozuk) {
        // Son: Kaydet, kapat, aç: Dosya ve ekran son modelle aynı
        await kaydet();
        await ac(y);
        const dom = await degerler(ALANLAR), bek = domBeklenen();
        const esit = ALANLAR.every((a) => dom[a].length === bek[a].length && dom[a].every((x, j) => normal(x).trim() === normal(bek[a][j]).trim()));
        sonuc(`9 tohum ${tohum}: ${izler.length} adım, son kayıt ve yeniden açılış model gibi`, esit, { dom, bek, izler: izler.slice(-10) });
      }
      bilgi(`tohum ${tohum}: ${izler.join(', ').slice(0, 500)}`);
      await kapatHepsini();
    }
    sonuc('9 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 10) oturum sonu
  if (bolum(10)) {
    const PID = process.env.PDEFE_TEST_PID;
    const ileti = () => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'oturum_sonu.ps1'), '-SurecId', String(PID)], { encoding: 'utf8' }).split(/\r?\n/).filter((s) => s.trim().startsWith('{')).map((s) => JSON.parse(s));
    const y = kopya('oturum');
    await ac(y);
    await tiklaAd('AdSoyad', 0);
    let r = ileti();
    sonuc('10 Yazı yokken oturum sonu engellenmez', r.length === 1 && r[0].sonuc === 1, r);
    await yaz('Oturum kapanırken alanda kalan yazı');
    await bekle(300);
    r = ileti();
    sonuc('10 Alandan çıkılmamış yazı oturum sonunu engeller', r.length === 1 && r[0].sonuc === 0, r);
    let d = await kutuBekle();
    sonuc('10 Kaydetme sorusu açılır', /kaydedilmemiş değişiklikler/.test(d.kutu?.ileti || ''), d);
    await kutuBas('Vazgeç');
    await bekle(400);
    d = await durum();
    sonuc('10 Vazgeç: Yazı yerinde, kirli', d.degisti && d.belge === 1 && (await degerler(['AdSoyad'])).AdSoyad[0] === 'Oturum kapanırken alanda kalan yazı', d);
  }

  // ================================================================== 12) kullanım hakları imzalı form: İmza kalır, dosya büyümez
  if (bolum(12)) {
    const y = kopya('hakli', oz.xfaHakli);
    const ilk = fs.readFileSync(y);
    const olcHak = (pdf) => JSON.parse(execFileSync(PY, ['-X', 'utf8', '-I', '-c', `
import json, re, sys
sys.path.insert(0, r"${path.join(KOK, 'core').replace(/\\/g, '\\\\')}")
import pymupdf
from islemler import xfa
b = open(sys.argv[1], "rb").read()
d = pymupdf.open(stream=b, filetype="pdf")
print(json.dumps({"hak": xfa.notlar.kullanim_hakki_var(d), "son": xfa._hak_bolumu_sonu(d, b), "onarildi": d.is_repaired, "eof": b.count(b"%%EOF")}))
`, pdf], { encoding: 'utf8' }));
    await ac(y);
    const BIR = 'Birinci taslakta yazılan gizli cümle', IKI = 'İkinci hâl';
    await alanaYaz('Metin', 0, BIR);
    let d = await kaydet();
    let o = olcHak(y);
    let bayt = fs.readFileSync(y);
    sonuc('12 Kayıt: Açılan baytlar değişmedi, imza yerinde, onarılmadan açılıyor, temiz', !d.kutu && !d.degisti && bayt.subarray(0, ilk.length).equals(ilk) && o.hak && o.son && !o.onarildi && v(y, 'form1/Bolum/Metin')[0] === BIR, { d, o });
    const boy1 = bayt.length;
    await alanaYaz('Metin', 0, IKI);
    d = await kaydet();
    bayt = fs.readFileSync(y);
    o = olcHak(y);
    sonuc('12 İkinci kayıt: Yine tek artımlı bölüm, ilk taslak dosyada yok', !d.kutu && bayt.subarray(0, ilk.length).equals(ilk) && o.eof === 2 && v(y, 'form1/Bolum/Metin')[0] === IKI && bayt.length <= boy1 + 200, { o, boy1, boy: bayt.length });
    // Bölüm ekleme: Zincir yazılmaz
    await tiklaAd('MEkle', 0); await durgun();
    await tiklaAd('BEkle', 0); await durgun();
    await tiklaAd('BEkle', 0); await durgun();
    await alanaYaz('Metin', 1, 'Yeni bölümün yazısı');
    d = await kaydet();
    bayt = fs.readFileSync(y);
    o = olcHak(y);
    sonuc('12 Bölüm eklendikten sonra: İmza yerinde, tek artımlı bölüm, değerler dosyada', !d.kutu && !d.degisti && bayt.subarray(0, ilk.length).equals(ilk) && o.hak && o.eof === 2 && !o.onarildi && J(v(y, 'form1/Bolum/Metin')) === J([IKI, 'Yeni bölümün yazısı']) && v(y, 'form1/Basvurucu/BAd').length === 3, { o, m: v(y, 'form1/Bolum/Metin') });
    await ac(y);
    const c = await degerler(['Metin', 'BAd']);
    sonuc('12 Yeniden açınca değerler ve bölümler yerinde, temiz', J(c.Metin) === J([IKI, 'Yeni bölümün yazısı']) && c.BAd.length === 3 && !(await durum()).degisti, c);
    // İkinci oturum: Açılan dosyanın üstüne
    const iki = fs.readFileSync(y);
    await alanaYaz('Sehir', 0, 'İkinci oturum');
    d = await kaydet();
    bayt = fs.readFileSync(y);
    o = olcHak(y);
    sonuc('12 İkinci oturum: Önceki kaydın baytları değişmedi, imza yerinde', !d.kutu && bayt.subarray(0, iki.length).equals(iki) && o.hak && o.eof === 3 && v(y, 'form1/Baslik/Sehir')[0] === 'İkinci oturum', o);
    // 30 kayıt: Dosya büyümez
    const once = fs.statSync(y).size;
    for (let i = 0; i < 30; i++) { await alanaYaz('Sehir', 0, `Kayıt ${String(i).padStart(2, '0')}`); await kaydet(); }
    const sonra = fs.statSync(y).size;
    sonuc('12 Aynı oturumda 30 kayıt: Dosya büyümez', sonra <= once + 200 && v(y, 'form1/Baslik/Sehir')[0] === 'Kayıt 29', { once, sonra });
    // Farklı kaydet: Yeni dosyada da imza
    const yeni = path.join(KLASOR, 'hakli farklı.pdf');
    await yanitla('dosya:kaydetDiyalog', [yeni]);
    await alanaYaz('Sehir', 0, 'Farklı adla');
    await komut('dosya.farkliKaydet');
    d = await kayitBitsin();
    await bekle(120);
    o = olcHak(yeni);
    sonuc('12 Farklı kaydet: Yeni dosyada imza ve değer', !d.kutu && d.yol === yeni && o.hak && o.son && v(yeni, 'form1/Baslik/Sehir')[0] === 'Farklı adla', { d, o });
    // Sekme taşıma: Taban taşınır
    const oncekiler = (await hedefler()).map((h) => h.id);
    const y3 = kopya('hakli-tasi', oz.xfaHakli), ilk3 = fs.readFileSync(y3);
    await ac(y3);
    await alanaYaz('Metin', 0, 'Taşınmadan önce');
    await tus('Tab');
    await evalJs(`(async () => { await window.__pdefe.sekmeyiTasi(window.__s52.b().id, { tur: 'yeni' }); return true; })()`);
    let yeniP = null;
    for (let i = 0; i < 50 && !yeniP; i++) { await bekle(200); yeniP = (await hedefler()).find((h) => !oncekiler.includes(h.id)); }
    if (sonuc('12 Sekme taşındı', !!yeniP)) {
      hedefSec(yeniP.id);
      await bekle(1200);
      await evalJs(YARDIMCI);
      await evalJs(`(async () => { for (let i = 0; i < 80; i++) { if (document.querySelector('.gorunum:not([hidden]) .xfaLayer')) return true; await window.__s52.bekle(100); } return false; })()`);
      d = await kaydet();
      o = olcHak(y3);
      sonuc('12 Taşınan sekmede kayıt: İmza yerinde, tek artımlı bölüm', !d.kutu && !d.degisti && fs.readFileSync(y3).subarray(0, ilk3.length).equals(ilk3) && o.eof === 2 && v(y3, 'form1/Bolum/Metin')[0] === 'Taşınmadan önce', { d, o });
      await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); setTimeout(() => window.close(), 200); return true; })()`).catch(() => {});
      hedefSec(null);
      await bekle(800);
      await evalJs(YARDIMCI);
    }
    // İmzası biçimce yanlış form (kurgusal xfa.pdf): Baştan yazılır, imza kalkar
    const y4 = kopya('hakli-degil', oz.xfa);
    await ac(y4);
    await alanaYaz('AdSoyad', 0, 'Yazı');
    d = await kaydet();
    o = olcHak(y4);
    sonuc('12 Baytlarla tutmayan imza: Baştan yazılır, imza kalkar', !d.kutu && !o.hak && !o.onarildi, o);
    sonuc('12 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 13) odak almadan gelen yazı: Sürükleyip bırakma
  if (bolum(13)) {
    const cdpBirak = async (x, y, metin) => {
      const h = (await hedefler())[0];
      const ws = new WebSocket(h.webSocketDebuggerUrl);
      await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
      let no = 0;
      const gonder = (method, params) => new Promise((c) => { const i = ++no; const f = (m) => { const v = JSON.parse(m.data); if (v.id === i) { ws.removeEventListener('message', f); c(v); } }; ws.addEventListener('message', f); ws.send(J({ id: i, method, params })); });
      const data = { items: [{ mimeType: 'text/plain', data: metin }], dragOperationsMask: 3 };
      await gonder('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
      await gonder('Input.dispatchDragEvent', { type: 'dragOver', x, y, data });
      const r = await gonder('Input.dispatchDragEvent', { type: 'drop', x, y, data });
      ws.close();
      return r;
    };
    const alanDegeri = (ad, i = 0) => evalJs(`window.__s52.denetimler(document.querySelector('.gorunum:not([hidden])'), ${J(ad)})[${i}]?.value`);
    // Odaksız alana bırakma
    let y = kopya('birak');
    await ac(y);
    await tiklaAd('Sehir', 0);
    await tus('Tab');
    let p = await evalJs(`window.__s52.yer('Metin', 0)`);
    const r = await cdpBirak(p.x, p.y, 'Başka programdan sürüklenen yazı');
    await bekle(200);
    let d = await durum();
    bilgi(`bırakma: ${J(r.error || 'hata yok')}, alan: ${await alanDegeri('Metin')}, odak: ${d.odak}/${d.odakAd}`);
    sonuc('13 Bırakılan yazı alanda', (await alanDegeri('Metin')) === 'Başka programdan sürüklenen yazı', await alanDegeri('Metin'));
    sonuc('13 Bırakınca belge kirli', d.degisti, d);
    await tiklaAd('Sehir', 0);
    await bekle(60);
    d = await durum();
    sonuc('13 Başka alana geçince belge kirli, geri alınabilir', d.degisti && d.konum >= 1, d);
    d = await kaydet();
    sonuc('13 Kayıt bırakılan yazıyı alır', !d.kutu && !d.degisti && v(y, 'form1/Bolum/Metin')[0] === 'Başka programdan sürüklenen yazı', { d, x: v(y, 'form1/Bolum/Metin') });
    // Alanda yazı dururken başka alana bırakma: İkisi de kalır
    y = kopya('birak-iki');
    await ac(y);
    await tiklaAd('Sehir', 0);
    await yaz('Şehre yazılan');
    await tiklaAd('Sehir', 0);
    p = await evalJs(`window.__s52.yer('Metin', 0)`);
    await cdpBirak(p.x, p.y, 'Yanına bırakılan');
    await bekle(200);
    d = await kaydet();
    sonuc('13 Alanda yazı dururken bırakma: İkisi de dosyada', !d.kutu && !d.degisti && v(y, 'form1/Baslik/Sehir')[0] === 'Şehre yazılan' && v(y, 'form1/Bolum/Metin')[0] === 'Yanına bırakılan', { d, s: v(y, 'form1/Baslik/Sehir'), m: v(y, 'form1/Bolum/Metin') });
    // Bırakılan yazı kapatma sorusunu çıkarır
    y = kopya('birak-kapat');
    await ac(y);
    p = await evalJs(`window.__s52.yer('Metin', 0)`);
    await cdpBirak(p.x, p.y, 'Kapatılırken sorulacak yazı');
    await bekle(200);
    await komut('sekme.kapat');
    d = await kutuBekle(3000);
    sonuc('13 Bırakılan yazı: Kapatırken sorulur', /kaydedilmemiş değişiklikler/.test(d.kutu?.ileti || ''), d);
    if (d.kutu) await kutuBas('Kaydetme');
    sonuc('13 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 11) gerçek kısayollar (yalnız görünmeyen masaüstünde: baslat_gizli.ps1, BOLUM=11; son adım örneği kapatır)
  if (BOLUMLER.includes('11')) {
    await evalJs(`window.pdefe.cagir('test:odakla')`);
    const G = (olaylar) => evalJs(`window.pdefe.cagir('test:tusGonder', ${J(olaylar)})`);
    const tusG = async (keyCode, mods = [], sonra = 300) => { await G([{ type: 'keyDown', keyCode, modifiers: mods }, { type: 'keyUp', keyCode, modifiers: mods }]); await bekle(sonra); };
    const metinAlan = () => evalJs(`document.querySelector('.gorunum:not([hidden]) [xfaname="Metin"] textarea')?.value`);
    const y = kopya('kisayol');
    await ac(y);
    await tiklaAd('Metin', 0);
    await yaz('Ctrl+S ile kaydedilen');
    await tusG('S', ['control']);
    let d = await kayitBitsin();
    await bekle(150);
    d = await durum();
    sonuc('11 Ctrl+S: Alandan çıkmadan yazı dosyada, imleç alanda, kaydedildi denir', !d.kutu && !d.degisti && d.odak === 'TEXTAREA' && /kaydedildi/.test(d.bildirim) && v(y, 'form1/Bolum/Metin')[0] === 'Ctrl+S ile kaydedilen', d);
    await yaz(' ve devam');
    await bekle(60);
    await tusG('Z', ['control']);
    await bekle(60);
    bilgi(`Ctrl+Z sonrası alan: ${await metinAlan()}`);
    await tusG('Y', ['control']);
    await bekle(60);
    await tusG('P', ['control'], 900);
    d = await durum();
    sonuc('11 Ctrl+P: Soru çıkmaz (yazı düz PDF\'e girer)', !d.kutu, d);
    await tusG('Escape', [], 400);
    await tusG('W', ['control'], 400);
    d = await kutuBekle();
    sonuc('11 Ctrl+W: Kaydetme sorusu', /kaydedilmemiş değişiklikler/.test(d.kutu?.ileti || ''), d);
    await kutuBas('Vazgeç');
    await bekle(200);
    d = await durum();
    sonuc('11 Vazgeç: Sekme açık', d.belge === 1 && d.degisti, d);
    // Pencere kapatma (X ve Alt+F4'ün yolu), alanda yazı
    await tiklaAd('Sehir', 0);
    await yaz('Pencere kapatılırken alanda');
    await evalJs(`(window.close(), true)`);
    d = await kutuBekle();
    sonuc('11 Pencere kapatma: Kaydetme sorusu', /kaydedilmemiş değişiklikler/.test(d.kutu?.ileti || ''), d);
    await kutuBas('Kaydet');
    await bekle(1500);
    sonuc('11 Kaydet: Alandaki yazı dosyada', v(y, 'form1/Baslik/Sehir')[0] === 'Pencere kapatılırken alanda', v(y, 'form1/Baslik/Sehir'));
    console.log(`\n${denetim} denetim, ${hataSayisi} hata`);
    console.log(hataSayisi ? 'HATALAR VAR' : 'BÜTÜN DENETİMLER GEÇTİ');
    if (hataSayisi) process.exitCode = 1;
    return;
  }

  await kapatHepsini();
  console.log(`\n${denetim} denetim, ${hataSayisi} hata`);
  console.log(hataSayisi ? 'HATALAR VAR' : 'BÜTÜN DENETİMLER GEÇTİ');
  if (hataSayisi) process.exitCode = 1;
}
