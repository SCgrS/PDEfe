// Senaryo 51 (0.3.1, kullanıcı: "mavi şeklinde göstermemize gerek yok", "seçtiğim kutucuk çok kalın gözüküyor", "imleç yanıp sönmüyor", "ad soyad
// kısmı ... ortalı duruyor bizimkinde sola yatık"): XFA formunun görünümü ve yazma hissi. Gerçek fare ve klavye (CDP Input), kullanıcının
// gördüğüne bakılır (ekran görüntüsünün pikselleri, düz PDF'in ölçüleri):
//   1) Alanların biçimi şablondaki gibi: Yatay ve dikey hiza, satır aralığı, tam yazı boyu, harf aralığı, paragraf boşlukları, aynı adlı iki alan.
//   2) Zemin: Mavi işaret yok, renksiz dolgu beyaz, renkli dolgu kendi renginde, dolgusuz alan panelin renginde, zemin köşeden taşmaz.
//   3) Odak çerçevesi: Yakınlaştırmadan bağımsız 1 piksel, köşesiz, alanı büyütmez, çerçevesini aşmaz, yazı alanında imleci örtmez. %50, %100, %200.
//      Onay kutusu, seçenek düğmesi, başlıklı alan, düğme. Tab çerçeveyi taşır, alandan çıkınca kalkar.
//   4) İmleç: Boş alanda görünür ve yanıp söner (üç yakınlaştırmada, tek satır, çok satır, ortalı), dolu alanda, hücreli alanda. Bul kutusu, Ayarlar'daki
//      kutu ve düz form alanı (formlar.js) kıyas için.
//   5) Hücreli alan (comb): Her harf hücresinin ortasında, en çok hücre sayısı kadar yazılır, silme ve geri al görünen harfleri günceller, başlıklı alan, Bul.
//   6) Bölüm eklenince yeni örneklerde de aynı biçim, değerler yerinde.
//   7) Yazdırma (düz PDF, PyMuPDF ile ölçülür): Hiza, hücreler, satır aralığı, çerçeve kalınlığı, zemin, odak çerçevesi ve mavi yok.
//   8) Kaydet ve yeniden aç: Biçim ve değerler aynı. Koyu sayfada çerçeve ve imleç görünür.
// Örnek PDF test/xfa_pdf_uret.py ile üretilir (xfa-bicim.pdf, gerçek belge yok): test/cikti/s51/<koşum>/. Görüntüler aynı klasörde.
// Kullanım (imleç yalnızca etkin pencerede yanıp söner: Görünmeyen masaüstü):
//   powershell -File test\baslat_gizli.ps1 -Port 9412 -Veri "$env:TEMP\pdefe-s51" -Boyut "1280,900"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9412; node test\surucu.mjs betik test\senaryo51.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,4".
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's51', Date.now().toString(36));
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));
const MM = 72 / 25.4;
const KATMANLAR = '.gorunum:not([hidden]) .xfaLayer';

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const yakin = (a, b, pay) => Math.abs(a - b) <= pay;

/** PNG çözücü (8 bit RGB / RGBA): Görüntünün piksellerine bakmak için. */
function pngOku(tampon) {
  let p = 8, w = 0, h = 0, renk = 0;
  const dat = [];
  while (p < tampon.length) {
    const u = tampon.readUInt32BE(p), t = tampon.toString('latin1', p + 4, p + 8);
    if (t === 'IHDR') { w = tampon.readUInt32BE(p + 8); h = tampon.readUInt32BE(p + 12); renk = tampon[p + 17]; }
    if (t === 'IDAT') dat.push(tampon.subarray(p + 8, p + 8 + u));
    p += 12 + u;
  }
  const ham = zlib.inflateSync(Buffer.concat(dat));
  const b = renk === 6 ? 4 : 3, st = w * b, v = Buffer.alloc(h * st);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = ham[o++];
    for (let x = 0; x < st; x++) {
      const a = x >= b ? v[y * st + x - b] : 0, c = y ? v[(y - 1) * st + x] : 0, d = y && x >= b ? v[(y - 1) * st + x - b] : 0;
      let k = ham[o++];
      if (f === 1) k += a; else if (f === 2) k += c; else if (f === 3) k += (a + c) >> 1;
      else if (f === 4) { const pa = Math.abs(c - d), pb = Math.abs(a - d), pc = Math.abs(a + c - 2 * d); k += pa <= pb && pa <= pc ? a : pb <= pc ? c : d; }
      v[y * st + x] = k & 255;
    }
  }
  return { w, h, b, v, px: (x, y) => [v[y * st + x * b], v[y * st + x * b + 1], v[y * st + x * b + 2]] };
}

/** Düz PDF'in ölçümü: Alanların yazıları ve çizgileri. */
const OLC_DUZ = `
import json, sys, pymupdf
d = pymupdf.open(sys.argv[1])
sayfalar = []
for p in d:
    satirlar = []
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["text"].strip():
                    satirlar.append({"t": s["text"], "x0": s["bbox"][0], "x1": s["bbox"][2], "y0": s["bbox"][1], "y1": s["bbox"][3], "boy": s["size"], "taban": s["origin"][1], "yazi": s["font"]})
    cizimler = [{"tur": c.get("type"), "w": c.get("width"), "renk": c.get("color"), "dolgu": c.get("fill"), "r": list(c["rect"])} for c in p.get_drawings()]
    sayfalar.append({"g": p.rect.width, "b": p.rect.height, "yazi": satirlar, "cizim": cizimler})
print(json.dumps(sayfalar, ensure_ascii=False))
`;

const YARDIMCI = `window.__s51 = {
  b: () => window.__pdefe.aktif(),
  g: () => window.__pdefe.aktif().gorunum,
  bekle: (ms) => new Promise((c) => setTimeout(c, ms)),
  async durgun() { const b = this.b(); for (let i = 0; i < 200; i++) { if (b && !b.xfa.mesgul) break; await this.bekle(50); } await b?.xfa._kuyruk; await this.bekle(80); return true; },
  alan(ad, i = 0) { return document.querySelectorAll('${KATMANLAR} [xfaname="' + ad + '"]')[i] || null; },
  denetim(ad, i = 0) { return this.alan(ad, i)?.querySelector('input, textarea, select, button') || null; },
  /** Öğeyi görünür yapar, kutusu (pencere px). */
  async yer(ad, i = 0) {
    for (let k = 0; k < 60; k++) {
      const el = this.denetim(ad, i);
      if (!el) { await this.bekle(100); continue; }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      await this.bekle(180);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height };
    }
    return null;
  },
  stil(ad, i = 0) {
    const el = this.denetim(ad, i), st = getComputedStyle(el), a = this.alan(ad, i), w = el.closest('.xfaWrapper');
    return { hiza: st.textAlign, satir: st.lineHeight, boy: parseFloat(st.fontSize), harf: st.letterSpacing, sonHiza: st.textAlignLast, yuk: el.offsetHeight, ust: el.offsetTop, gen: el.offsetWidth,
      pad: [st.paddingTop, st.paddingRight, st.paddingBottom, st.paddingLeft].map(parseFloat), alanYuk: a.clientHeight, alanPad: [getComputedStyle(a).paddingTop, getComputedStyle(a).paddingBottom].map(parseFloat),
      resim: st.backgroundImage, zemin: w && getComputedStyle(w).backgroundColor, yaricap: w && getComputedStyle(w).borderTopLeftRadius, maxlen: el.getAttribute('maxlength') };
  },
  odak() {
    const c = document.querySelector('${KATMANLAR} .xfa-odak');
    if (!c) return null;
    const r = c.getBoundingClientRect(), st = getComputedStyle(c), kap = c.parentElement, rk = kap.getBoundingClientRect();
    const sinir = kap.querySelector(':scope > .xfaBorder'), rs = sinir && sinir.getBoundingClientRect();
    const el = document.activeElement, re = el.getBoundingClientRect();
    const olcek = rk.width / kap.offsetWidth;
    return { x: r.left, y: r.top, g: r.width, b: r.height, kal: parseFloat(st.borderTopWidth) * (r.width / c.offsetWidth) * devicePixelRatio / Math.max(1, Math.floor(devicePixelRatio)), yaricap: st.borderTopLeftRadius,
      sinir: rs && [rs.left, rs.top, rs.right, rs.bottom], el: [re.left, re.top, re.right, re.bottom], cizgi: getComputedStyle(el).outlineStyle, olcek, r: sinir ? parseFloat(getComputedStyle(sinir).borderTopLeftRadius) / 8 * olcek : 0, etiket: el.tagName };
  },
};`;

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, yaz, tus }) {
  process.on('unhandledRejection', (e) => { console.error(e); process.exit(1); });
  fs.mkdirSync(UI, { recursive: true });
  const ozet = JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'xfa_pdf_uret.py'), UI], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  const kopya = (ad) => { const y = path.join(UI, ad); fs.copyFileSync(ozet.xfaBicim, y); return y; };
  const olcBetik = path.join(UI, 'olc.py');
  fs.writeFileSync(olcBetik, OLC_DUZ);
  await evalJs(YARDIMCI);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const od = await evalJs(`window.pdefe.cagir('test:odakla')`);
  const s51 = (kod) => evalJs(`(() => { const H = window.__s51; return ${kod}; })()`);
  const kapatHepsini = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const ac = async (yol, z = 1) => {
    await kapatHepsini();
    await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); for (let i = 0; i < 100 && !document.querySelector('${KATMANLAR}'); i++) await window.__s51.bekle(100); b.gorunum.zoomAyarla(${z}); await window.__s51.bekle(500); return true; })()`);
    await evalJs(`window.pdefe.cagir('test:odakla')`);
  };
  const yakinlastir = async (z) => { await evalJs(`(window.__s51.g().zoomAyarla(${z}), true)`); await bekle(500); };
  const yer = (ad, i = 0) => evalJs(`window.__s51.yer(${J(ad)}, ${i})`);
  const tiklaAd = async (ad, i = 0, sol = null) => {
    const p = await yer(ad, i);
    if (!p) throw new Error('Öğe bulunamadı: ' + ad);
    await tikla(sol == null ? p.x : p.l + sol, p.y);
    await bekle(120);
    return p;
  };
  const doldur = async (ad, deger, i = 0) => { await tiklaAd(ad, i); await tus('a', ['ctrl']); await yaz(deger); await tus('Tab'); await bekle(40); };
  const bosalt = () => evalJs(`(document.activeElement?.blur?.(), true)`);
  const goruntu = async (ad, kirp) => pngOku(fs.readFileSync(await ekranGoruntusu(path.join(UI, ad + '.png'), kirp)));

  /** İmleci ölçer: kirp bölgesinin görüntüsü art arda alınır. Döner: { degisim (kaç kez değişti), aralik (ms), kutu (değişen piksellerin kutusu), koyu (o kutudaki en koyu piksel) }. */
  async function imlecOlc(ad, kirp, sure = 2600) {
    const kl = path.join(UI, 'imlec-' + ad);
    fs.mkdirSync(kl, { recursive: true });
    const kareler = [], t0 = Date.now();
    for (let i = 0; Date.now() - t0 < sure; i++) {
      const dosya = await ekranGoruntusu(path.join(kl, `k${String(i).padStart(2, '0')}.png`), kirp);
      const b = fs.readFileSync(dosya);
      kareler.push({ t: Date.now() - t0, ozet: createHash('md5').update(b).digest('hex'), dosya });
      await bekle(5);
    }
    const degisimler = [];
    for (let i = 1; i < kareler.length; i++) if (kareler[i].ozet !== kareler[i - 1].ozet) degisimler.push(i);
    if (!degisimler.length) return { degisim: 0, kare: kareler.length };
    const a = pngOku(fs.readFileSync(kareler[0].dosya)), b = pngOku(fs.readFileSync(kareler[degisimler[0]].dosya));
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, koyu = 255;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const p = a.px(x, y), q = b.px(x, y);
      if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 24) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        koyu = Math.min(koyu, p[1], q[1]);
      }
    }
    const ar = degisimler.slice(1).map((d, i) => kareler[d].t - kareler[degisimler[i]].t);
    return { degisim: degisimler.length, kare: kareler.length, aralik: ar.length ? Math.round(ar.reduce((t, x) => t + x, 0) / ar.length) : 0, kutu: [x0, y0, x1, y1], koyu };
  }
  const imlecTamam = (o, z) => o.degisim >= 3 && o.aralik > 300 && o.aralik < 800 && o.kutu[2] - o.kutu[0] <= 4 * Math.max(z, 1) + 2 && o.kutu[3] - o.kutu[1] >= 7 * z && o.koyu < 150;

  sonuc('Pencere görünmeyen masaüstünde etkin (imleç yalnızca etkin pencerede yanıp söner)', od?.odak === true && od?.gizliMasaustu === true, od);

  // ------------------------------------------------------------ 1) alanların biçimi
  if (bolum(1)) {
    await ac(kopya('bicim.pdf'));
    const bilgi = await s51(`H.g().xfaBilgi.alanlar`);
    sonuc('1) Çekirdek alanların biçimini verir', bilgi?.length > 15 && bilgi.some((a) => a.metin?.comb === 11) && bilgi.filter((a) => a.yol.at(-1) === 'Cift').length === 2, bilgi?.length);
    const st = {};
    for (const ad of ['Solda', 'Ortali', 'Sagda', 'Ustte', 'Altta', 'CokSatir', 'CokOrtali', 'CokIki', 'CokDikey', 'Bosluklu', 'Harfli', 'Baslikli']) st[ad] = await s51(`H.stil(${J(ad)})`);
    sonuc('1) Ortalı alan', st.Ortali.hiza === 'center', st.Ortali);
    sonuc('1) Sağa hizalı alan', st.Sagda.hiza === 'right', st.Sagda);
    sonuc('1) Hizasız alan solda', ['left', 'start'].includes(st.Solda.hiza), st.Solda);
    sonuc('1) Çok satırlı ortalı alan (imza bölümündeki Ad Soyad gibi)', st.CokOrtali.hiza === 'center', st.CokOrtali);
    sonuc('1) İki yana yaslı çok satırlı alan', st.CokIki.hiza === 'justify', st.CokIki);
    sonuc('1) Satır aralığı 15pt (katman birimi)', st.CokSatir.satir === '15px' && st.CokIki.satir === '15px', [st.CokSatir.satir, st.CokIki.satir]);
    sonuc('1) Yazı boyu tam şablondaki (PDF.js\'in 0,99 çarpanı yok)', st.Solda.boy === 10 && st.CokSatir.boy === 10 && st.Harfli.boy === 9 && st.CokDikey.boy === 10, [st.Solda.boy, st.Harfli.boy]);
    sonuc('1) Harf aralığı şablondaki', ['0px', 'normal'].includes(st.Solda.harf) && st.Harfli.harf === '1px', [st.Solda.harf, st.Harfli.harf]);
    sonuc('1) Paragraf boşlukları', st.Bosluklu.pad[3] === 10 && st.Bosluklu.pad[1] === 5 && st.Bosluklu.pad[0] === 4, st.Bosluklu.pad);
    // Dikey hiza: Tek satırda yazı üstte, altta, ortada. Çok satırda ortada
    const dikey = await s51(`(() => { const r = (ad) => { const e = H.denetim(ad).getBoundingClientRect(), a = H.alan(ad).getBoundingClientRect(); return { ust: e.top - a.top, alt: a.bottom - e.bottom, e: e.height }; }; return { ustte: r('Ustte'), altta: r('Altta'), dikey: r('CokDikey'), orta: r('Ortali') }; })()`);
    sonuc('1) Dikey hiza yok: Yazı alanın üstünde, kenar boşluğu kadar (belirtimin varsayılanı)', dikey.ustte.ust < dikey.ustte.alt - 5, dikey.ustte);
    sonuc('1) Dikey hiza alt: Yazı alanın altında, kenar boşluğu kadar', dikey.altta.alt < dikey.altta.ust - 5, dikey.altta);
    sonuc('1) Çok satırlı, dikey ortalı alan: Tek satır yazı ortada', yakin(dikey.dikey.ust, dikey.dikey.alt, 1.5), dikey.dikey);
    await tiklaAd('CokDikey');
    await yaz('Dikey ortada');
    const dk = await s51(`(() => { const e = H.denetim('CokDikey').getBoundingClientRect(), a = H.alan('CokDikey').getBoundingClientRect(); return { ust: e.top - a.top, alt: a.bottom - e.bottom }; })()`);
    sonuc('1) Yazınca da ortada', yakin(dk.ust, dk.alt, 1.5), dk);
    await tus('Tab');
    // Aynı adlı iki alan (şablonda kardeş)
    const cift = await s51(`[H.stil('Cift', 0).hiza, H.stil('Cift', 1).hiza]`);
    sonuc('1) Aynı adlı iki alan kendi hizasında (yerinden ayırt edilir)', J(cift) === J(['center', 'right']), cift);
    // Yazı gerçekten ortada mı: Yazının görüntüdeki yeri
    await doldur('Ortali', 'Ortada');
    await bosalt();
    await bekle(100);
    const p = await yer('Ortali');
    const g = await goruntu('ortali', { x: p.l, y: p.t, width: p.w, height: p.h });
    let x0 = 1e9, x1 = -1;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.px(x, y)[1] < 120) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    sonuc('1) Görüntüde yazı alanın ortasında', x1 > x0 && yakin((x0 + x1) / 2, g.w / 2, 3), { x0, x1, g: g.w });
  }

  // ------------------------------------------------------------ 2) zemin
  if (bolum(2)) {
    await ac(kopya('zemin.pdf'));
    await bosalt();
    const st = await s51(`Object.fromEntries(['Solda', 'Renkli', 'Zeminsiz', 'CokSatir', 'Hucreli'].map((a) => [a, H.stil(a)]))`);
    sonuc('2) Alanların üstünde mavi işaret yok', Object.values(st).every((x) => x.resim === 'none'), Object.values(st).map((x) => x.resim.slice(0, 20)));
    sonuc('2) Renksiz dolgu beyaz', st.Solda.zemin === 'rgb(255, 255, 255)', st.Solda.zemin);
    sonuc('2) Renkli dolgu kendi renginde', st.Renkli.zemin === 'rgb(255, 250, 200)', st.Renkli.zemin);
    sonuc('2) Dolgusuz alanda zemin yok', st.Zeminsiz.zemin === 'rgba(0, 0, 0, 0)', st.Zeminsiz.zemin);
    sonuc('2) Zemin çerçevenin köşesiyle aynı yuvarlaklıkta', parseFloat(st.Solda.yaricap) > 5 && parseFloat(st.Renkli.yaricap) > 5, [st.Solda.yaricap, st.Renkli.yaricap]);
    const renkAl = async (ad) => { const p = await yer(ad); const g = await goruntu('zemin-' + ad, { x: p.l, y: p.t, width: p.w, height: p.h }); return g.px(Math.round(g.w * 0.7), Math.round(g.h / 2)); };
    const beyaz = await renkAl('Solda'), sari = await renkAl('Renkli'), gri = await renkAl('Zeminsiz');
    sonuc('2) Görüntüde: Boş alan beyaz, renkli alan sarı, dolgusuz alan panel rengi (mavi değil)', J(beyaz) === J([255, 255, 255]) && J(sari) === J([255, 250, 200]) && J(gri) === J([229, 229, 229]), { beyaz, sari, gri });
  }

  // ------------------------------------------------------------ 3) odak çerçevesi
  if (bolum(3)) {
    await ac(kopya('odak.pdf'));
    for (const z of [0.5, 1, 2]) {
      await yakinlastir(z);
      for (const ad of ['Solda', 'CokSatir', 'Ortali', 'Hucreli']) {
        const once = await s51(`(() => { const e = H.denetim(${J(ad)}); return { g: e.offsetWidth, b: e.offsetHeight, wg: e.closest('.xfaWrapper').offsetWidth, wb: e.closest('.xfaWrapper').offsetHeight }; })()`);
        const p = await tiklaAd(ad);
        const o = await s51(`H.odak()`);
        const sonra = await s51(`(() => { const e = H.denetim(${J(ad)}); return { g: e.offsetWidth, b: e.offsetHeight, wg: e.closest('.xfaWrapper').offsetWidth, wb: e.closest('.xfaWrapper').offsetHeight }; })()`);
        const et = `3) %${z * 100} ${ad}:`;
        if (!sonuc(`${et} Odak çerçevesi var, tarayıcının halkası yok`, !!o && o.cizgi === 'none', o)) continue;
        sonuc(`${et} Kalınlık 1 ekran pikseli, köşesiz`, yakin(o.kal, 1, 0.02) && o.yaricap === '0px', { kal: o.kal, y: o.yaricap });
        sonuc(`${et} Alanın boyu değişmedi`, J(once) === J(sonra), { once, sonra });
        const [sl, st, sr, sb] = o.sinir, ic = o.r * (1 - Math.SQRT1_2) - 0.1;
        sonuc(`${et} Çerçevesini ve yuvarlak köşesini aşmaz`, o.x >= sl + ic && o.y >= st + ic && o.x + o.g <= sr - ic && o.y + o.b <= sb - ic, { o: [o.x, o.y, o.x + o.g, o.y + o.b], s: o.sinir, ic });
        if (z >= 1) sonuc(`${et} Yazı alanının kenarına binmez (imleci örtmez)`, o.x + 1 <= o.el[0] + 0.01, { cizgi: o.x + 1, alan: o.el[0] });
        await ekranGoruntusu(path.join(UI, `odak-${ad}-z${z * 100}.png`), { x: Math.max(0, p.l - 14), y: Math.max(0, p.t - 14), width: Math.min(p.w + 28, 620), height: Math.min(p.h + 28, 180) });
      }
      await tus('Tab');
      sonuc(`3) %${z * 100} Tab: Çerçeve sonraki alana geçti, tek çerçeve`, (await s51(`document.querySelectorAll('${KATMANLAR} .xfa-odak').length`)) === 1 && (await s51(`document.activeElement.closest('.xfaLayer') && document.querySelector('${KATMANLAR} .xfa-odak').parentElement.contains(document.activeElement)`)));
      await bosalt();
      await bekle(50);
      sonuc(`3) %${z * 100} Alandan çıkınca çerçeve kalkar`, (await s51(`document.querySelectorAll('${KATMANLAR} .xfa-odak').length`)) === 0);
    }
    await yakinlastir(1);
    // Onay kutusu, seçenek düğmesi: İşaretin çevresinde, kare
    for (const ad of ['Onay', 'SecimA']) {
      const p = await yer(ad);
      await evalJs(`(window.__s51.denetim(${J(ad)}).focus(), true)`);
      await bekle(80);
      const o = await s51(`H.odak()`);
      sonuc(`3) ${ad}: İnce çerçeve işaretin çevresinde, kare`, !!o && yakin(o.kal, 1, 0.02) && yakin(o.g, o.b, 1) && o.g < 30, o);
      await ekranGoruntusu(path.join(UI, `odak-${ad}.png`), { x: Math.max(0, p.l - 14), y: Math.max(0, p.t - 14), width: 120, height: 60 });
    }
    // Başlıklı alan: Yalnızca denetimin çevresinde, düğme de ince
    await tiklaAd('Baslikli');
    const ob = await s51(`H.odak()`);
    sonuc('3) Başlıklı alan: Çerçeve denetimin çevresinde (başlığı içine almaz)', !!ob && ob.x >= ob.el[0] - 3 && ob.x + ob.g <= ob.el[2] + 3, ob);
    await bosalt();
    await evalJs(`(window.__s51.denetim('BicimEkle').focus(), true)`);
    await bekle(60);
    const od2 = await s51(`H.odak()`);
    sonuc('3) Düğme: İnce çerçeve', !!od2 && yakin(od2.kal, 1, 0.02) && od2.cizgi === 'none', od2);
    await bosalt();
    // Görüntüde: Kalın siyah halka yok (odaklı alanda sol kenardan içeri: yalnız 1 koyu sütun)
    await tiklaAd('Solda');
    await tus('End');
    const p = await yer('Solda');
    const kisa = await evalJs(`(window.__s51.odak())`);
    const g = await goruntu('odak-piksel', { x: Math.floor(kisa.x) - 3, y: Math.floor(p.y), width: 12, height: 1 });
    let koyu = 0;
    for (let x = 0; x < g.w; x++) if (g.px(x, 0)[1] < 110) koyu++;
    sonuc('3) Görüntüde çerçevenin sol çizgisi ince (en çok 2 koyu piksel)', koyu >= 1 && koyu <= 2, { koyu, sat: Array.from({ length: g.w }, (_, x) => g.px(x, 0)[1]) });
    await bosalt();
  }

  // ------------------------------------------------------------ 4) imleç
  if (bolum(4)) {
    await ac(kopya('imlec.pdf'));
    for (const z of [0.5, 1, 2]) {
      await yakinlastir(z);
      for (const ad of ['Solda', 'CokSatir', 'Ortali', 'Sagda', 'CokOrtali']) {
        const p = await tiklaAd(ad, 0, 12);
        await bekle(60);
        const q = await yer(ad);
        const o = await imlecOlc(`${ad}-z${z * 100}`, { x: Math.max(0, q.l - 6), y: Math.max(0, q.t - 4), width: Math.min(q.w + 12, 1000), height: Math.min(q.h + 8, 60 * z + 20) });
        sonuc(`4) %${z * 100} Boş ${ad}: İmleç görünür ve yanıp söner`, imlecTamam(o, z), o);
        await bosalt();
      }
    }
    await yakinlastir(1);
    // Dolu alanda tıklayınca, yazarken, ok tuşundan sonra
    await tiklaAd('Solda', 0, 20);
    await yaz('Kurgu deneme yazısı');
    const y1 = await yer('Solda');
    const kirp = { x: y1.l - 4, y: y1.t - 4, width: y1.w + 8, height: y1.h + 8 };
    sonuc('4) Yazdıktan sonra yanıp söner', imlecTamam(await imlecOlc('yazi', kirp), 1));
    await tikla(y1.l + 40, y1.y);
    await bekle(60);
    const o2 = await imlecOlc('dolu-tiklama', kirp);
    sonuc('4) Dolu alanda fareyle tıklayınca yanıp söner', imlecTamam(o2, 1), o2);
    await tus('ArrowRight');
    sonuc('4) Ok tuşundan sonra yanıp söner', imlecTamam(await imlecOlc('ok', kirp), 1));
    await tus('Tab');
    // Hücreli alan: Boş ve dolu
    await tiklaAd('Hucreli', 0, 6);
    const h = await yer('Hucreli');
    const kh = { x: h.l - 6, y: h.t - 4, width: h.w + 12, height: h.h + 8 };
    const o3 = await imlecOlc('hucreli-bos', kh);
    sonuc('4) Boş hücreli alanda imleç görünür ve yanıp söner', imlecTamam(o3, 1), o3);
    await yaz('123');
    const o4 = await imlecOlc('hucreli-dolu', kh);
    sonuc('4) Hücreli alanda yazdıktan sonra yanıp söner', imlecTamam(o4, 1), o4);
    await tus('Tab');
    await bosalt();
    // Kıyas: Bul kutusu, Ayarlar'daki kutu
    await tus('f', ['ctrl']);
    await bekle(300);
    const bul = await evalJs(`(() => { const el = document.getElementById('bul-girdi'); const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    await tikla(bul.l + 15, bul.t + bul.h / 2);
    await bekle(60);
    const ob = await imlecOlc('bul', { x: bul.l - 2, y: bul.t - 2, width: 80, height: bul.h + 4 });
    sonuc('4) Kıyas: Bul kutusunda yanıp söner', imlecTamam(ob, 1), ob);
    await tus('Escape');
    await evalJs(`(window.__pdefe.komutCalistir('duzen.ayarlar'), document.querySelector('.ayarlar-bolumler [data-bolum="notlar"]')?.click(), true)`);
    await bekle(400);
    const ay = await evalJs(`(() => { const el = [...document.querySelectorAll('.ayarlar-pencere input[type="text"], .ayarlar-pencere input:not([type])')].find((e) => e.getClientRects().length); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    if (sonuc('4) Kıyas: Ayarlar\'da yazı kutusu bulundu', !!ay, ay)) {
      await tikla(ay.l + 15, ay.t + ay.h / 2);
      await bekle(60);
      const oa = await imlecOlc('ayarlar', { x: ay.l - 2, y: ay.t - 2, width: 100, height: ay.h + 4 });
      sonuc('4) Kıyas: Ayarlar\'daki kutuda yanıp söner', imlecTamam(oa, 1), oa);
    }
    await evalJs(`(document.querySelector('.ayarlar-pencere [data-id="kapat"]')?.click(), true)`);
    await bekle(250);
    // Kıyas: Düz form alanı (formlar.js)
    execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'form_alanlari_pdf_uret.py'), UI], { encoding: 'utf8' });
    const duzForm = path.join(UI, 'alanlar.pdf');
    await kapatHepsini();
    await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(duzForm)}); for (let i = 0; i < 100 && !document.querySelector('.gorunum:not([hidden]) .form-alan[data-tur="metin"]'); i++) await window.__s51.bekle(100); b.gorunum.zoomAyarla(1); await window.__s51.bekle(500); return true; })()`);
    await evalJs(`window.pdefe.cagir('test:odakla')`);
    const fa = await evalJs(`(() => { const el = document.querySelector('.gorunum:not([hidden]) .form-alan[data-tur="metin"]'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    await bekle(200);
    const fb = await evalJs(`(() => { const el = document.querySelector('.gorunum:not([hidden]) .form-alan[data-tur="metin"]'); const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    await tikla(fb.l + 8, fb.t + fb.h / 2);
    await bekle(120);
    const of = await imlecOlc('duz-form', { x: fb.l - 3, y: fb.t - 3, width: Math.min(fb.w + 6, 300), height: fb.h + 6 });
    sonuc('4) Kıyas: Düz form alanında (formlar.js) yanıp söner', imlecTamam(of, 1), of);
    console.log('    (kıyas) imleç değişim aralığı ms: bul', ob.aralik, 'düz form', of.aralik);
  }

  // ------------------------------------------------------------ 5) hücreli alan
  if (bolum(5)) {
    await ac(kopya('hucreli.pdf'));
    await tiklaAd('Hucreli', 0, 6);
    await yaz('1234567890123');    // 13 harf, 11 hücre
    await bekle(60);
    const hucreler = (ad, i = 0) => s51(`(() => { const el = H.denetim(${J(ad)}, ${i}); const r = el.getBoundingClientRect(); const n = +el.dataset.xfaComb; return { n, deger: el.value, l: r.left, g: r.width, ls: getComputedStyle(el).letterSpacing, renk: getComputedStyle(el).color, imlec: getComputedStyle(el).caretColor,
      harfler: [...el.parentElement.querySelectorAll(':scope > .xfa-comb-katman > .xfa-comb-hucre')].map((h) => { const rg = document.createRange(); rg.selectNodeContents(h); const q = rg.getBoundingClientRect(); return { t: h.textContent, orta: q.left + q.width / 2 }; }) }; })()`);
    const h = await hucreler('Hucreli');
    sonuc('5) En çok hücre sayısı kadar yazılır', h.deger === '12345678901', h.deger);
    sonuc('5) Görünen harfler hücrelerde', J(h.harfler.map((x) => x.t).join('')) === J('12345678901'), h.harfler);
    sonuc('5) Her harf hücresinin ortasında', h.harfler.every((x, i) => yakin(x.orta, h.l + ((i + 0.5) * h.g) / h.n, 1)), { l: h.l, g: h.g, harfler: h.harfler });
    sonuc('5) input\'un yazısı görünmez, imleci görünür', h.renk === 'rgba(0, 0, 0, 0)' && h.imlec === 'rgb(0, 0, 0)', { renk: h.renk, imlec: h.imlec });
    await tus('Backspace');
    await tus('Backspace');
    await bekle(40);
    const h2 = await hucreler('Hucreli');
    sonuc('5) Silme görünen harfleri günceller', h2.harfler.map((x) => x.t).join('') === '123456789', h2.harfler.map((x) => x.t));
    await tus('Tab');
    await bosalt();    // odak bir alandayken Geri al o alanın kendi geçmişine gider
    await bekle(100);
    await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), true)`);
    await bekle(200);
    const h3 = await hucreler('Hucreli');
    sonuc('5) Geri al görünen harfleri günceller', h3.deger === '' && h3.harfler.every((x) => x.t === ''), h3.deger);
    await evalJs(`(window.__pdefe.komutCalistir('duzen.yinele'), true)`);
    await bekle(200);
    const h4 = await hucreler('Hucreli');
    sonuc('5) Yinele görünen harfleri günceller', h4.harfler.map((x) => x.t).join('') === '123456789', h4.deger);
    // Genişlikleri farklı harfler: Hücre ortasında kalır, birikmez
    await doldur('HucreliHarf', 'WiWiŞğİı');
    const hh = await hucreler('HucreliHarf');
    sonuc('5) Genişlikleri farklı harfler de hücrelerinin ortasında', hh.harfler.every((x, i) => yakin(x.orta, hh.l + ((i + 0.5) * hh.g) / hh.n, 1)), hh);
    await tiklaAd('HucreliHarf', 0, 6);
    await tus('Home');
    await tus('ArrowRight');
    await tus('ArrowRight');
    await tus('ArrowRight');
    const imlecYeri = await s51(`H.denetim('HucreliHarf').selectionStart`);
    sonuc('5) Ok tuşları hücre hücre gider', imlecYeri === 3, imlecYeri);
    await tus('Tab');
    // Başlıklı hücreli alan: Hücreler başlığın altına girmez
    await doldur('BaslikliHucre', '123456');
    const hb = await hucreler('BaslikliHucre');
    const baslik = await s51(`H.alan('BaslikliHucre').querySelector('.xfaCaption').getBoundingClientRect().right`);
    sonuc('5) Başlıklı hücreli alan: Harfler denetimin hücrelerinde, başlığın altına girmez', hb.harfler.every((x, i) => yakin(x.orta, hb.l + ((i + 0.5) * hb.g) / hb.n, 1.5)) && hb.harfler[0].orta > baslik && hb.l >= baslik - 1, { hb, baslik });
    // Bul: Hücreli alanın değerini bulur
    await bosalt();
    await tus('f', ['ctrl']);
    await bekle(300);
    await yaz('12345');
    await bekle(700);
    const bulS = await evalJs(`(() => { const e = document.querySelector('#bul-sayac, .bul-sayac'); const v = document.querySelector('${KATMANLAR} .xfa-alan-metni .highlight'); return { sayac: e?.textContent || '', vurgu: !!v }; })()`);
    sonuc('5) Bul hücreli alanın değerini bulur, vurgu alanın üstünde', bulS.vurgu, bulS);
    await tus('Escape');
    await bekle(100);
    await ekranGoruntusu(path.join(UI, 'hucreli.png'));
  }

  // ------------------------------------------------------------ 6) yeni bölüm
  if (bolum(6)) {
    await ac(kopya('bolum.pdf'));
    await doldur('YOrtali', 'Birinci örnek');
    await doldur('YHucreli', '12345');
    await doldur('Ortali', 'Üstteki ortalı');
    await tiklaAd('BicimEkle');
    await evalJs(`window.__s51.durgun()`);
    await bekle(400);
    const r = await s51(`(() => { const a = document.querySelectorAll('${KATMANLAR} [xfaname="YOrtali"]'); return { sayi: a.length }; })()`);
    const sayfa = await s51(`H.g().sayfaSayisi`);
    if (r.sayi < 2) { await evalJs(`(window.__s51.g().sayfayaGit(${sayfa}), true)`); await bekle(900); }
    const y = await s51(`(() => { const hep = [...document.querySelectorAll('${KATMANLAR} [xfaname="YOrtali"]')]; const i = hep.length - 1; return { sayi: hep.length, son: H.stil('YOrtali', i).hiza, cok: H.stil('YCok', i).hiza, satir: H.stil('YCok', i).satir, comb: H.denetim('YHucreli', i)?.dataset.xfaComb, deger: H.denetim('YOrtali', 0)?.value, harf: H.denetim('YHucreli', 0)?.parentElement.querySelector('.xfa-comb-hucre')?.textContent }; })()`);
    sonuc('6) Bölüm eklendi: Yeni örnekte aynı hiza, satır aralığı ve hücreler', y.son === 'center' && y.cok === 'center' && y.satir === '15px' && y.comb === '5', y);
    await evalJs(`(window.__s51.g().sayfayaGit(1), true)`);
    await bekle(700);
    const y2 = await s51(`({ deger: H.denetim('YOrtali', 0)?.value, harf: [...H.denetim('YHucreli', 0).parentElement.querySelectorAll('.xfa-comb-hucre')].map((h) => h.textContent).join(''), ortali: H.denetim('Ortali').value })`);
    sonuc('6) Yeniden dizilince değerler ve hücrelerdeki harfler yerinde', y2.deger === 'Birinci örnek' && y2.harf === '12345' && y2.ortali === 'Üstteki ortalı', y2);
  }

  // ------------------------------------------------------------ 7) yazdırma, 8) kaydet
  if (bolum(7) || bolum(8)) {
    const yol = kopya('duz.pdf');
    await ac(yol);
    const DEGER = { Solda: 'Solda yazı', Ortali: 'Ortalı yazı', Sagda: 'Sağda yazı', Ustte: 'Üstte', Altta: 'Altta', Hucreli: '12345678901', CokOrtali: 'Kurgu Ad\nKurgu Soyad', CokSatir: 'Birinci satır\nİkinci satır\nÜçüncü satır\nDördüncü satır', Renkli: 'Renkli', Zeminsiz: 'Zeminsiz', CokDikey: 'Dikey ortalı', BaslikliHucre: '123456' };
    for (const [ad, d] of Object.entries(DEGER)) await doldur(ad, d);
    // Odak bir alandayken yazdırılır: Çerçeve kâğıda girmez
    await tiklaAd('Solda');
    const duz = await evalJs(`(async () => { const b = window.__s51.b(); const d = await b.xfa.duzPdf(); return { yol: d.yol, sayfa: d.sayfa, tasan: d.tasan }; })()`);
    const kopyaDuz = path.join(UI, 'duz-cikti.pdf');
    fs.copyFileSync(duz.yol, kopyaDuz);
    const olc = (p) => JSON.parse(execFileSync(PY, ['-X', 'utf8', '-I', olcBetik, p], { encoding: 'utf8' }));
    const sayfalar = olc(kopyaDuz);
    if (bolum(7)) {
      const s = sayfalar[0];
      const bul = (t) => s.yazi.filter((y) => y.t.includes(t));
      const ALANLAR = { Solda: [5, 3, 80, 8], Ortali: [90, 3, 80, 8], Sagda: [5, 13, 80, 8], Ustte: [90, 13, 40, 14], Altta: [133, 13, 37, 14], Hucreli: [5, 23, 80, 8], CokSatir: [5, 39, 165, 31.75], CokOrtali: [5, 73, 80, 30], CokDikey: [5, 105, 80, 8] };
      // Alanın kutusu sayfada (pt): contentArea 15 mm + alt form + alan, PDF.js'in pt'yi px saymasının ölçeğiyle (printToPDF 96 → 72: 1 katman px = 1 pt)
      const kutu = (ad) => { const [x, y, w, h] = ALANLAR[ad]; return { x0: (15 + x) * MM, y0: (15 + y) * MM, x1: (15 + x + w) * MM, y1: (15 + y + h) * MM }; };
      const ortali = bul('Ortalı yazı')[0], sagda = bul('Sağda yazı')[0], solda = bul('Solda yazı')[0];
      const ko = kutu('Ortali'), ks = kutu('Sagda'), kl = kutu('Solda');
      sonuc('7) Yazdırma: Ortalı alan ortada', !!ortali && yakin((ortali.x0 + ortali.x1) / 2, (ko.x0 + ko.x1) / 2, 1.5), { ortali, ko });
      sonuc('7) Yazdırma: Sağa hizalı alan sağda (kenar boşluğu 1 mm)', !!sagda && yakin(sagda.x1, ks.x1 - MM, 1.5), { sagda, ks });
      sonuc('7) Yazdırma: Hizasız alan solda (kenar boşluğu 1 mm)', !!solda && yakin(solda.x0, kl.x0 + MM, 1.5), { solda, kl });
      const a1 = bul('Kurgu Ad')[0], a2 = bul('Kurgu Soyad')[0], kc = kutu('CokOrtali');
      sonuc('7) Yazdırma: Çok satırlı ortalı alan (Ad Soyad gibi) ortada', !!a1 && !!a2 && yakin((a1.x0 + a1.x1) / 2, (kc.x0 + kc.x1) / 2, 1.5) && yakin((a2.x0 + a2.x1) / 2, (kc.x0 + kc.x1) / 2, 1.5), { a1, a2, kc });
      const satirlar = ['Birinci satır', 'İkinci satır', 'Üçüncü satır', 'Dördüncü satır'].map((t) => bul(t)[0]);
      sonuc('7) Yazdırma: Satır aralığı 15pt', satirlar.every(Boolean) && satirlar.slice(1).every((y, i) => yakin(y.taban - satirlar[i].taban, 15, 0.3)), satirlar.map((y) => y?.taban));
      sonuc('7) Yazdırma: Yazı boyu tam (10pt)', !!solda && yakin(solda.boy, 10, 0.02), solda?.boy);
      const ku = kutu('Ustte'), kalt = kutu('Altta'), ust = bul('Üstte')[0], alt = bul('Altta')[0];
      sonuc('7) Yazdırma: Dikey hiza üst ve alt', !!ust && !!alt && ust.y0 < ku.y0 + MM + 3 && alt.y1 > kalt.y1 - MM - 3, { ust, ku, alt, kalt });
      const kd = kutu('CokDikey'), dk = bul('Dikey ortalı')[0];
      sonuc('7) Yazdırma: Dikey ortalı çok satırlı alan ortada', !!dk && yakin((dk.y0 + dk.y1) / 2, (kd.y0 + kd.y1) / 2, 1.5), { dk, kd });
      // Hücreler: Her rakam kendi hücresinin ortasında
      const kh = kutu('Hucreli'), hg = (kh.x1 - kh.x0 - 2 * MM) / 11;
      const rakamlar = s.yazi.filter((y) => /^[0-9]$/.test(y.t.trim()) && y.y0 > kh.y0 - 1 && y.y1 < kh.y1 + 1);
      sonuc('7) Yazdırma: Hücreli alanda 11 rakam, her biri hücresinin ortasında', rakamlar.length === 11 && rakamlar.sort((a, b) => a.x0 - b.x0).every((y, i) => yakin((y.x0 + y.x1) / 2, kh.x0 + MM + (i + 0.5) * hg, 1)), { sayi: rakamlar.length, ilk: rakamlar[0], kh, hg });
      // Çerçeveler: Şablondaki gibi 0,5pt (yuvarlanmış 1 piksel değil)
      const cizgiler = s.cizim.filter((c) => c.renk && c.w != null && c.w > 0 && c.r[2] - c.r[0] > 100);
      const dolguCizgi = s.cizim.filter((c) => c.dolgu && !c.renk);
      const kal = (() => { const y = kl; const hedef = s.cizim.filter((c) => Math.abs(c.r[0] - y.x0) < 2 && Math.abs(c.r[1] - y.y0) < 2 && Math.abs(c.r[2] - y.x1) < 2 && Math.abs(c.r[3] - y.y1) < 2); return hedef; })();
      sonuc('7) Yazdırma: Alan çerçevesi 0,5pt', kal.some((c) => (c.renk && c.w != null && yakin(c.w, 0.5, 0.08)) || (c.dolgu && !c.renk)) && !kal.some((c) => c.renk && c.w > 0.8), kal.map((c) => ({ w: c.w, r: c.renk, d: c.dolgu })));
      // Mavi yok: Hiçbir dolgunun maviliği baskın değil. Odak çerçevesi yok: Siyah 1 px'lik dikdörtgen yok
      const mavi = s.cizim.filter((c) => c.dolgu && c.dolgu[2] > c.dolgu[0] + 0.05 && c.dolgu[2] > c.dolgu[1] + 0.05);
      sonuc('7) Yazdırma: Mavi zemin yok', mavi.length === 0, mavi.slice(0, 3));
      const siyah = s.cizim.filter((c) => c.renk && Math.max(...c.renk) < 0.1 && c.r[2] - c.r[0] > 40 && c.r[3] - c.r[1] > 10);
      sonuc('7) Yazdırma: Odak çerçevesi kâğıda girmez', siyah.length === 0, siyah.slice(0, 3));
      const zemin = await (async () => { const png = path.join(UI, 'duz-sayfa.png'); execFileSync(PY, ['-X', 'utf8', '-I', '-c', 'import sys,pymupdf\nd=pymupdf.open(sys.argv[1])\nd[0].get_pixmap(dpi=144).save(sys.argv[2])', kopyaDuz, png]); return pngOku(fs.readFileSync(png)); })();
      const nokta = (ad) => { const k = kutu(ad); return zemin.px(Math.round(((k.x0 + k.x1) / 2) * 2), Math.round((k.y0 + 1.6) * 2)); };
      sonuc('7) Yazdırma: Renksiz dolgu beyaz, kâğıtta da', J(nokta('Hucreli')) === J([255, 255, 255]) && J(nokta('Solda')) === J([255, 255, 255]), [nokta('Hucreli'), nokta('Solda')]);
    }
    if (bolum(8)) {
      await tus('Tab');
      await evalJs(`(async () => { const b = window.__s51.b(); await window.__pdefe.belgeKaydet(b); for (let i = 0; i < 100 && (b.kaydediliyor || b.degisti); i++) await window.__s51.bekle(100); return true; })()`);
      await ac(yol);
      const r = await s51(`({ degisti: H.b().degisti, ortali: H.denetim('Ortali').value, hiza: H.stil('Ortali').hiza, kok: H.stil('CokOrtali').hiza, harf: [...H.denetim('Hucreli').parentElement.querySelectorAll('.xfa-comb-hucre')].map((h) => h.textContent).join(''), cok: H.denetim('CokSatir').value })`);
      sonuc('8) Kaydedip yeniden açınca biçim ve değerler aynı', !r.degisti && r.ortali === 'Ortalı yazı' && r.hiza === 'center' && r.kok === 'center' && r.harf === '12345678901' && r.cok.split('\n').length === 4, r);
      // Koyu sayfa: Çerçeve ve imleç görünür
      await s51(`(H.g().koyuSayfaAyarla(true), true)`);
      await bekle(600);
      const koyu = await s51(`H.g().koyuSayfa`);
      await tiklaAd('Solda', 0, 150);
      const p = await yer('Solda');
      const o = await s51(`H.odak()`);
      sonuc('8) Koyu sayfa: Çerçeve 1 piksel', koyu === true && !!o && yakin(o.kal, 1, 0.02), { koyu, o });
      const oi = await imlecOlc('koyu', { x: p.l - 4, y: p.t - 4, width: p.w + 8, height: p.h + 8 });
      sonuc('8) Koyu sayfa: İmleç yanıp söner', oi.degisim >= 3, oi);
      await ekranGoruntusu(path.join(UI, 'koyu.png'));
      await s51(`(H.g().koyuSayfaAyarla(false), true)`);
      await bekle(300);
    }
  }

  const hatalar = await evalJs(`(window.__hatalar || []).slice(0, 8)`).catch(() => []);
  sonuc('Sayfada hata yok', !hatalar?.length, hatalar);
  await kapatHepsini().catch(() => {});
  console.log('Görüntüler: ' + UI);
  console.log(hataSayisi ? `${hataSayisi} HATA / ${denetim}` : `BÜTÜN DENETİMLER GEÇTİ (${denetim})`);
}
