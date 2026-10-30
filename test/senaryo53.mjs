// Senaryo 53 (0.3.1, kullanıcı: "sonsuza kadar aynı sayfaya yazılabiliyor", "bu metin çıktı alınmak üzere tasarlanmış unutma"): XFA formunda alana yalnız kâğıda sığan yazı girer.
// Gerçek klavye ve fare (CDP Input). Kurgusal form test/xfa_pdf_uret.py xfa-sinir.pdf. Beklenen satır sayısı şablondan okunmaz: SINIR_ALANLARI'ndaki ölçülerden floor(iç yükseklik / satır aralığı).
//   1  Her çok satırlı alanda Enter basılı tutma (tekrarlı tuş olayları), harf ve Boşluk basılı tutma: Satır sayısı beklenen, kaydırma yok.
//   2  Her alana 100.000 karakter yapıştırma ve tek seferde uzun yazı (dikte gibi): Sığan kısım girer, uyarı kaç karakter alınmadığını doğru ve bir kez söyler, sözcük ortasından kesilmez.
//   3  Yakınlaştırma (%50, %100, %200), koyu sayfa, sekme değişimi: Aynı sınır. Ekran ölçeği (%100, %125, %150) test/senaryo53_kos.ps1: Her ölçekte aynı yazı, S53_OLCEK_DIZIN'de karşılaştırılır.
//   4  Sınırda: Silme, seçip değiştirme, ortaya yapıştırma, geri al, yinele, kaydet, kapat, aç. Değerler aynı.
//   5  Düz PDF: Sığan yazının son satırı kâğıtta (PyMuPDF ve görüntü), satır sayısı aynı, yazdırma uyarısı yok.
//   6  Dosyada zaten sığmayan değer: Silinmez, kaydedilirken korunur, kırmızı çerçeve, bir kez bildirim, kaydırılabilir, yeni yazı girmez, silinir, sığınca normal. Yazdırma penceresi söyler.
//   7  Karakter sınırı (maxChars, hücreli alan): Fazlası uyarıyla. Düz form alanı (MaxLen, tarak).
//   8  Sağ tık: Gerçek sağ tık, menünün öğeleri ve her seçeneğin işi (XFA ve düz form, salt okunur). Menü ve pano test kancasından: Kullanıcının panosuna dokunulmaz.
//   9  Düz form alanında mavi işaret yok: Zemin saydam, odakta 1 ekran pikseli köşesiz çerçeve, imleç I ve el. Yazdırmaya girmez.
//  10  Bileşim (IME), sürükleyip bırakma, bölüm ekleme ve yeniden dizilme, salt okunur alan, tekerlek, yazıyla büyüyen alan (sınır yok, kâğıtta tamamı).
//  11  Gerçek sağ tık menüsü (test kancasız örnekte, görünmeyen masaüstünde, test/menu_yakala.ps1): Menünün görüntüsü, öğelerin etkinliği, Tümünü seç, Yapıştır. Pano yalnız okunur: Kes ve Kopyala burada basılmaz (8. bölümde kancayla).
//  12  Geri al ve yinele alanın kendi geçmişinden: Başka alana gitmez, komut yığınından geri alınan yazı katlanmaz, reddedilen bileşimin taşan hâline dönülmez, alandan çıkınca belge değişmiş sayılır. XFA ve düz form.
//  13  Alanlar arası gerçek sürükleme (tarayıcının sürüklemesi yakalanır: Sürükleme sistemi görünmeyen masaüstünde çalışmaz): Sığmayan yazıda kaynak yerinde kalır, sığan yazı taşınır, aynı alanda taşıma.
//  14  Sayı alanı: Yalnız kâğıda aynen çıkacak yazı girer (PDF.js değeri sayıya çevirir).
// Bütün koşum: powershell -File test\senaryo53_kos.ps1 (test kancalı örnek, ekran ölçeği %125 ve %150, kancasız örnek). Tek koşum (imleç ve odak için görünmeyen masaüstü, taze örnek: Yanıt kuyruğu ana süreçte):
//   powershell -File test\baslat_gizli.ps1 -Port 9510 -Veri "$env:TEMP\pdefe-s53" -Boyut "1280,1000"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9510; [$env:BOLUM="1,4"]; node test\surucu.mjs betik test\senaryo53.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's53', Date.now().toString(36));
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => (n === 11 ? BOLUMLER.includes('11') : !BOLUMLER.length || BOLUMLER.includes(String(n)));
const MM = 72 / 25.4;
const KATMAN = '.gorunum:not([hidden]) .xfaLayer';

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)).slice(0, 900) : ''}`);
  return ok;
};
const bilgi = (m) => console.log(`     ${m}`);

// Şablondaki ölçüler (test/xfa_pdf_uret.py SINIR_SABLON): Alan yüksekliği ve kenar boşluğu mm, satır aralığı pt (null: kendiliğinden, yazı boyundan), üst boşluk ve başlık payı.
const COK_SATIRLI = [
  { ad: 'IkiSatir', h: 15.875, kenar: 1, aralik: 15, beklenen: 2 },
  { ad: 'UcSatir', h: 20, kenar: 1, aralik: 15, beklenen: 3 },
  { ad: 'Kendi', h: 30, kenar: 1, aralik: null },
  { ad: 'Yasli', h: 20, kenar: 1, aralik: 15, beklenen: 3 },
  { ad: 'DikeyOrta', h: 20, kenar: 1, aralik: 15, beklenen: 3 },
  { ad: 'Bosluklu', h: 25, kenar: 1, aralik: 15, ust: 4, beklenen: 4 },
  { ad: 'UstBaslikli', h: 25, kenar: 1, aralik: 15, baslik: 6, beklenen: 3 },
  { ad: 'AcikCok', h: 20, kenar: 1, aralik: 15, beklenen: 3 },
  { ad: 'Sinirli200', h: 8, kenar: 0, aralik: null },
  { ad: 'YCok', h: 15.875, kenar: 1, aralik: 15, beklenen: 2 },
];
const TEK_SATIRLI = ['AcikTek', 'TekKapali', 'YanBaslikli', 'TekSagda', 'Sayi', 'Tarih', 'YTek'];

const YARDIMCI = `window.__s53 = {
  b: () => window.__pdefe.aktif(),
  g: () => window.__pdefe.aktif().gorunum,
  bekle: (ms) => new Promise((c) => setTimeout(c, ms)),
  async durgun() { const b = this.b(); for (let i = 0; i < 400; i++) { if (b && !b.xfa.mesgul && !b.xfa.yapiSuruyor) break; await this.bekle(50); } await b?.xfa.bekle(); await this.bekle(80); return true; },
  alan(ad, i = 0) { return document.querySelectorAll('${KATMAN} [xfaname="' + ad + '"]')[i] || null; },
  denetim(ad, i = 0) { return this.alan(ad, i)?.querySelector('input, textarea, select, button') || null; },
  async yer(ad, i = 0) {
    for (let k = 0; k < 80; k++) {
      const el = this.denetim(ad, i);
      if (!el) { await this.bekle(80); continue; }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      await this.bekle(120);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 30), l: r.left, t: r.top, w: r.width, h: r.height };
    }
    return null;
  },
  /** Alandaki yazının gerçek satır sayısı (üretim aynasından bağımsız: Alanın kopyası aynı yerde, yüksekliği 0). */
  satirlar(el) {
    const k = el.cloneNode(false);
    k.value = el.value;
    const st = getComputedStyle(el);
    k.style.setProperty('field-sizing', 'fixed'); k.style.height = '0'; k.style.minHeight = '0'; k.style.maxHeight = 'none'; k.style.flex = '0 0 auto'; k.style.position = 'absolute'; k.style.visibility = 'hidden'; k.style.width = st.width;
    k.style.paddingTop = k.style.paddingBottom = '0';
    k.removeAttribute('data-xv'); k.removeAttribute('data-xa');
    el.parentElement.append(k);
    const n = k.scrollHeight / parseFloat(st.lineHeight);
    k.remove();
    return Math.round(n);
  },
  durum(ad, i = 0) {
    const el = this.denetim(ad, i), st = getComputedStyle(el), bl = document.getElementById('bildirim');
    return { uz: el.value.length, deger: el.value, sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth, st: el.scrollTop, sl: el.scrollLeft, tasiyor: el.classList.contains('xfa-tasiyor'), lh: parseFloat(st.lineHeight), h: parseFloat(st.height), satir: el.tagName === 'TEXTAREA' ? this.satirlar(el) : 1, tasma: st.overflowY, cubuk: el.offsetWidth - el.clientWidth, odak: document.activeElement === el, bildirim: bl && !bl.hidden ? bl.textContent : '' };
  },
  /** Alanın kâğıttaki iç yüksekliği: Satır sınırının bağımsız hesabı (dikey ortalıda denetim yazı kadardır, alan kutusu sayılır). */
  icYukseklik(ad, i = 0) { const el = this.denetim(ad, i), st = getComputedStyle(el); const fs = st.fieldSizing === 'content' ? parseFloat(getComputedStyle(el.parentElement).height) : parseFloat(st.height); return fs - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom); },
  /** Gerçek yapıştırma olayı (pano test kancasından değil, olayın içinde: Kullanıcının panosuna dokunulmaz). */
  yapistir(metin, el = document.activeElement) { const dt = new DataTransfer(); dt.setData('text/plain', metin); const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }); el.dispatchEvent(e); return e.defaultPrevented; },
  /** Bildirim şeridine her yazılan (alanSiniri.js ve sağ tık aynı şeridi kullanır): Kaç kez söylendi. */
  bildirimleriIzle() { if (!window.__bildirimIzi) { const el = document.getElementById('bildirim'); window.__bildirimIzi = new MutationObserver(() => { (window.__bildirimler ||= []).push(el.textContent); }); window.__bildirimIzi.observe(el, { childList: true, characterData: true, subtree: true }); } window.__bildirimler = []; return true; },
  async bildirimler() { await this.bekle(0); const l = window.__bildirimler || []; window.__bildirimler = []; return l; },
};`;

const OLC_DUZ = `
import json, sys, pymupdf
d = pymupdf.open(sys.argv[1])
s = []
for p in d:
    satirlar = []
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = "".join(x["text"] for x in l["spans"])
            if t.strip():
                satirlar.append({"t": t, "x0": l["bbox"][0], "x1": l["bbox"][2], "y0": l["bbox"][1], "y1": l["bbox"][3], "taban": l["spans"][0]["origin"][1]})
    s.append({"g": p.rect.width, "b": p.rect.height, "satir": satirlar, "cizim": [[c["rect"].x0, c["rect"].y0, c["rect"].x1, c["rect"].y1] for c in p.get_drawings() if c.get("color")]})
    if len(sys.argv) > 2:
        p.get_pixmap(dpi=110).save(sys.argv[2] + "-" + str(p.number + 1) + ".png")
print(json.dumps(s, ensure_ascii=False))
`;
const OLC_VERI = `
import json, sys
import xml.etree.ElementTree as ET
sys.path.insert(0, r"${path.join(KOK, 'core').replace(/\\/g, '\\\\')}")
sys.stdout.reconfigure(encoding="utf-8")
import pymupdf
from islemler import xfa
d = pymupdf.open(sys.argv[1], filetype="pdf")
p = xfa._paketler(d)
kok = ET.fromstring(d.xref_stream(p["datasets"]))
veri = kok.find("{%s}data" % xfa.VERI_NS)
c = {}
def yuru(e):
    ad = xfa._yerel(e.tag)
    k = list(e)
    if k:
        for x in k: yuru(x)
    else:
        c.setdefault(ad, []).append(e.text or "")
for x in veri: yuru(x)
print(json.dumps(c, ensure_ascii=False))
`;

/** Uzun deneme yazısı: Paragraflar, Türkçe harfler, satır sonları. */
function uzunYazi(boy) {
  const S = 'Mahkemece verilen kararın gerekçesi hukuka uygun değildir ve başvurucunun iddiaları incelenmemiştir. Şikâyet konusu işlem İĞŞÇÖÜ ığşçöü bakımından değerlendirilmelidir.';
  let s = '', i = 0;
  while (s.length < boy) { s += `${++i}. ${S}${i % 3 ? ' ' : '\n'}`; }
  return s.slice(0, boy);
}

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, fare, yaz, tus, tusHam, hedefler }) {
  process.on('unhandledRejection', (e) => { console.error(e); process.exit(1); });
  fs.mkdirSync(UI, { recursive: true });
  const oz = JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'xfa_pdf_uret.py'), UI], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'form_alanlari_pdf_uret.py'), UI], { encoding: 'utf8' });
  let sayac = 0;
  const kopya = (ad, kaynak = oz.xfaSinir) => { const y = path.join(UI, `${++sayac}-${ad}.pdf`); fs.copyFileSync(kaynak, y); return y; };
  const duzB = path.join(UI, 'olc-duz.py'), veriB = path.join(UI, 'olc-veri.py');
  fs.writeFileSync(duzB, OLC_DUZ); fs.writeFileSync(veriB, OLC_VERI);
  const duzOlc = (pdf, resim) => JSON.parse(execFileSync(PY, ['-X', 'utf8', '-I', duzB, pdf, ...(resim ? [resim] : [])], { encoding: 'utf8', maxBuffer: 1 << 28 }));
  const veriOlc = (pdf) => JSON.parse(execFileSync(PY, ['-X', 'utf8', '-I', veriB, pdf], { encoding: 'utf8', maxBuffer: 1 << 28 }));
  await evalJs(YARDIMCI);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const KANCALI = process.env.S53_KANCASIZ !== '1';   // kancasız örnekte (11. bölüm) test:* kanalları yok
  const odakla = () => (KANCALI ? evalJs(`window.pdefe.cagir('test:odakla')`) : null);
  await odakla();
  const dpr = await evalJs('devicePixelRatio');
  bilgi(`ekran ölçeği ${dpr}`);

  // CDP (tekrarlı tuş olayları, bırakma, IME): Tek bağlantı
  const hedef = (await hedefler())[0];
  const ws = new WebSocket(hedef.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let no = 0;
  const bekleyen = new Map();
  const olaylar = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } else if (d.method) olaylar.push(d); };
  const cdp = (method, params = {}) => new Promise((c) => { const i = ++no; bekleyen.set(i, c); ws.send(J({ id: i, method, params })); });

  /** Tuş basılı tutulur: Tekrarlı keyDown (autoRepeat), sonunda keyUp. */
  const tusTut = async (key, code, vk, metin, kez) => {
    for (let i = 0; i < kez; i++) await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: metin, unmodifiedText: metin, autoRepeat: i > 0 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  const enterTut = (kez) => tusTut('Enter', 'Enter', 13, '\r', kez);
  const harfTut = (h, kez) => tusTut(h, 'Key' + h.toUpperCase(), h.toUpperCase().charCodeAt(0), h, kez);
  const boslukTut = (kez) => tusTut(' ', 'Space', 32, ' ', kez);

  const kapatHepsini = () => evalJs(`(async () => { delete window.__pdefeOtoYanit; const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  const ac = async (yol, { z = 1, kapa = true, katman = KATMAN } = {}) => {
    if (kapa) await kapatHepsini();
    await evalJs(`(async () => { const b = await window.__pdefe.dosyaAc(${J(yol)}); for (let i = 0; i < 200 && !document.querySelector(${J(katman)}); i++) await window.__s53.bekle(50); b.gorunum.zoomAyarla(${z}); await window.__s53.bekle(500); return true; })()`);
    await odakla();
  };
  const yakinlastir = async (z) => { await evalJs(`(window.__s53.g().zoomAyarla(${z}), true)`); await bekle(500); };
  const yer = (ad, i = 0) => evalJs(`window.__s53.yer(${J(ad)}, ${i})`);
  const tiklaAd = async (ad, i = 0) => { const p = await yer(ad, i); if (!p) throw new Error('Öğe bulunamadı: ' + ad); await tikla(p.x, p.y); await bekle(60); return p; };
  const d53 = (ad, i = 0) => evalJs(`window.__s53.durum(${J(ad)}, ${i})`);
  const yapistir = (metin) => evalJs(`window.__s53.yapistir(${J(metin)})`);
  const icYukseklik = (ad, i = 0) => evalJs(`window.__s53.icYukseklik(${J(ad)}, ${i})`);
  const bosalt = async (ad, i = 0) => { await tiklaAd(ad, i); await tus('a', ['ctrl']); await tus('Delete'); await bekle(20); };
  const bildirimler = () => evalJs(`window.__s53.bildirimler()`);
  const izle = () => evalJs(`window.__s53.bildirimleriIzle()`);
  const hatalar = async () => (await evalJs(`window.__hatalar.splice(0)`)).filter((x) => !/ResizeObserver/.test(x));
  const goruntu = (ad, kirp) => ekranGoruntusu(path.join(UI, `${ad}.png`), kirp);
  const komut = (k) => evalJs(`(window.__pdefe.komutCalistir(${J(k)}), true)`);
  const kayitBitsin = async () => { await bekle(30); for (const t0 = Date.now(); Date.now() - t0 < 30000; await bekle(40)) { if (!(await evalJs(`!!window.__s53.b().kaydediliyor`))) break; } await bekle(120); };
  const kaydet = async () => { await komut('dosya.kaydet'); await kayitBitsin(); };
  const sinirTamam = (d, n) => d.satir === n && d.sh <= d.ch && d.st === 0 && d.cubuk === 0;
  /** Beklenen satır (şablonun ölçülerinden, kendiliğinden satır aralığında alanın hesaplanan aralığıyla). */
  const beklenenSatir = (a, lh) => {
    const ic = (a.h - 2 * a.kenar - (a.baslik || 0)) * MM - (a.ust || 0);
    return Math.max(1, Math.floor((ic + 0.02) / (a.aralik || lh)));
  };

  // ================================================================== 1) Enter, harf ve Boşluk basılı tutma
  if (bolum(1)) {
    const y = kopya('enter');
    await ac(y);
    for (const a of COK_SATIRLI) {
      await tiklaAd(a.ad);
      await enterTut(40);
      await bekle(20);
      const d = await d53(a.ad);
      const b = beklenenSatir(a, d.lh);
      if (a.beklenen) sonuc(`1 ${a.ad}: Şablondan hesaplanan beklenen ${a.beklenen} satır`, b === a.beklenen, b);
      sonuc(`1 ${a.ad}: Enter basılı: ${b} satır, kaydırma ve çubuk yok`, sinirTamam(d, b) && d.deger.split('\n').length === b && !d.tasiyor, { b, ...d, deger: undefined });
      await bosalt(a.ad);
    }
    // Harf basılı: Çok satırlı (yazma durur, kaydırma yok), tek satırlı
    await tiklaAd('IkiSatir');
    await harfTut('x', 400);
    let d = await d53('IkiSatir');
    bilgi(`IkiSatir x basılı: ${d.uz} harf, ${d.satir} satır`);
    sonuc('1 IkiSatir: Harf basılı: Yazma durur, 2 satır, kaydırma yok', sinirTamam(d, 2) && d.uz > 100 && d.uz < 400, { ...d, deger: undefined });
    await goruntu('1-iki-satir-dolu');
    await bosalt('IkiSatir');
    for (const ad of TEK_SATIRLI) {
      await tiklaAd(ad);
      if (ad === 'Sayi') await tusTut('1', 'Digit1', 49, '1', 150); else await harfTut('x', 150);   // sayı alanı yalnız sayı alır (14. bölüm)
      d = await d53(ad);
      bilgi(`${ad} x basılı: ${d.uz} harf, genişlik ${d.sw}/${d.cw}`);
      sonuc(`1 ${ad}: Harf basılı: Yazma durur, genişliği geçmez, kaymaz`, d.uz > 5 && d.uz < 150 && d.sw <= d.cw && d.sl === 0 && !d.tasiyor, { ...d, deger: undefined });
      await tiklaAd('IkiSatir');
    }
    // Boşluk basılı: Satır sonunda asılı kalan boşluk sonsuza dek girmez
    await bosalt('IkiSatir');
    await tiklaAd('IkiSatir');
    await boslukTut(600);
    d = await d53('IkiSatir');
    bilgi(`IkiSatir Boşluk basılı: ${d.uz} boşluk`);
    sonuc('1 IkiSatir: Boşluk basılı: Yazma durur', d.uz < 600 && d.sh <= d.ch && d.st === 0, { ...d, deger: undefined });
    await bosalt('IkiSatir');
    // Yazıdan sonra Enter: Son satırda Enter girmez
    await tiklaAd('IkiSatir');
    await yaz('Birinci satır');
    await enterTut(1);
    await yaz('İkinci satır');
    await enterTut(5);
    d = await d53('IkiSatir');
    sonuc('1 IkiSatir: Yazıdan sonra Enter: Üçüncü satır açılmaz', d.deger === 'Birinci satır\nİkinci satır' && sinirTamam(d, 2), { ...d });
    sonuc('1 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 2) 100.000 karakter yapıştırma
  if (bolum(2)) {
    const y = kopya('yapistir');
    await ac(y);
    await izle();
    const UZUN = uzunYazi(100000);
    const say = (s) => Array.from(s).length;
    for (const a of COK_SATIRLI) {
      await tiklaAd(a.ad);
      const t0 = Date.now();
      const iptal = await yapistir(UZUN);
      const sure = Date.now() - t0;
      await bekle(20);
      const d = await d53(a.ad);
      const b = beklenenSatir(a, d.lh);
      const bl = await bildirimler();
      const alinmayan = say(UZUN) - say(d.deger);
      const beklenenUyari = `Yazının tamamı bu alana sığmadı. ${alinmayan.toLocaleString('tr-TR')} karakter alınmadı.`;
      sonuc(`2 ${a.ad}: 100.000 karakter: En çok ${b} satır, kaydırma yok, yazı olay durdurularak girer`, iptal && d.satir <= b && d.sh <= d.ch && d.st === 0 && d.uz > 0 && !d.tasiyor, { b, ...d, deger: undefined });
      sonuc(`2 ${a.ad}: Uyarı bir kez, alınmayan sayı doğru`, bl.length === 1 && bl[0] === beklenenUyari, { bl, beklenenUyari });
      sonuc(`2 ${a.ad}: Yazının başı aynı, sözcük ortasından kesilmez`, UZUN.startsWith(d.deger) && /\s/.test(UZUN[d.uz] ?? ' '), { son: d.deger.slice(-20), sonraki: UZUN.slice(d.uz, d.uz + 10) });
      // Bir sonraki sözcük sığmıyordu: Yazı neredeyse tam dolu (son satırda boşluk bir sözcükten fazla değil)
      sonuc(`2 ${a.ad}: Yapıştırma ${sure} ms (1,5 sn altında)`, sure < 1500, sure);
      await bosalt(a.ad);
    }
    for (const ad of TEK_SATIRLI) {
      await tiklaAd(ad);
      await yapistir(UZUN);
      await bekle(20);
      const d = await d53(ad);
      const bl = await bildirimler();
      // Sayı alanı yazıyı hiç almaz (14. bölüm)
      sonuc(`2 ${ad}: 100.000 karakter: Genişliği geçmez, kaymaz, uyarı bir kez`, (ad === 'Sayi' ? d.uz === 0 : d.uz > 0) && d.sw <= d.cw && d.sl === 0 && !d.tasiyor && bl.length === 1 && /karakter alınmadı\.$/.test(bl[0]), { ...d, deger: undefined, bl });
    }
    // Tek seferde gelen uzun yazı (dikte, CDP Input.insertText): Aynı yol
    await tiklaAd('UcSatir');
    await yaz(UZUN.slice(0, 5000));
    await bekle(30);
    let d = await d53('UcSatir');
    let bl = await bildirimler();
    sonuc('2 Tek seferde gelen uzun yazı: Sığan kısım, uyarı bir kez, 3 satır', d.satir === 3 && d.sh <= d.ch && UZUN.startsWith(d.deger) && bl.length === 1 && bl[0].includes((say(UZUN.slice(0, 5000)) - say(d.deger)).toLocaleString('tr-TR')), { ...d, deger: undefined, bl });
    await bosalt('UcSatir');
    // Sığan yazı: Uyarı yok, olduğu gibi
    await tiklaAd('UcSatir');
    await yapistir('Sığan kısa yazı\nikinci satır');
    d = await d53('UcSatir');
    bl = await bildirimler();
    sonuc('2 Sığan yazı: Uyarı yok, yazı aynı', d.deger === 'Sığan kısa yazı\nikinci satır' && !bl.length, { d: d.deger, bl });
    // Satır sonları ve denetim karakterleri: Sayfa sonu satır sonu sayılır, ölçü yazılacak hâlle
    await bosalt('UcSatir');
    await tiklaAd('UcSatir');
    await yapistir('A\r\nB\fC\u0001D\vE\nF');
    d = await d53('UcSatir');
    bl = await bildirimler();
    sonuc('2 Windows satır sonu, sayfa sonu, denetim karakteri: 3 satır sınırına göre, kalanı söylenir', d.deger === 'A\nB\nC D' && d.satir === 3 && bl.length === 1 && bl[0].includes(' 4 karakter'), { d: d.deger, bl });
    // Satır ve paragraf ayırıcı, NEL: Metin kutusu tek satırda gösterir, PDF.js formu dizerken satıra böler: Ölçü satır sonuyla, ekranda sığan kâğıtta kesilmez
    await bosalt('UcSatir');
    await tiklaAd('UcSatir');
    await yapistir('Bir\u2028iki\u2029uc\u0085dort');
    d = await d53('UcSatir');
    bl = await bildirimler();
    sonuc('2 Satır ve paragraf ayırıcı, NEL: Satır sonu sayılır, 3 satır sınırı, kalanı söylenir', d.deger === 'Bir\niki\nuc' && d.satir === 3 && bl.length === 1 && bl[0].includes(' 5 karakter'), { d: d.deger, bl });
    await bosalt('TekKapali');
    await tiklaAd('TekKapali');
    await yapistir('tek\u2028satır\u2029alan\u0085yazı');
    d = await d53('TekKapali');
    sonuc('2 Tek satırlık alanda ayırıcılar boşluk', d.deger === 'tek satır alan yazı', d.deger);
    await bildirimler();
    // Boşluksuz uzun sözcük: Sığdığı yerden
    await bosalt('IkiSatir');
    await tiklaAd('IkiSatir');
    await yapistir('çokuzunsözcük'.repeat(500));
    d = await d53('IkiSatir');
    await bildirimler();
    sonuc('2 Boşluksuz uzun sözcük: Alan dolar, 2 satır', d.uz > 100 && sinirTamam(d, 2), { ...d, deger: undefined });
    // Çok büyük yazı: Bekletmez
    await bosalt('IkiSatir');
    await tiklaAd('IkiSatir');
    const t1 = Date.now();
    await evalJs(`window.__s53.yapistir('mahkeme '.repeat(375000))`);
    const sure = Date.now() - t1;
    d = await d53('IkiSatir');
    bl = await bildirimler();
    sonuc(`2 3 milyon karakter: ${sure} ms (3 sn altında), sığan kısım`, sure < 3000 && sinirTamam(d, 2) && bl.length === 1, { sure, ...d, deger: undefined, bl });
    await goruntu('2-yapistir');
    sonuc('2 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 3) yakınlaştırma, ekran ölçeği, koyu sayfa, sekme
  if (bolum(3)) {
    const y = kopya('olcek');
    await ac(y);
    await izle();
    const UZUN = uzunYazi(6000);
    const ALANLAR = ['IkiSatir', 'UcSatir', 'Kendi', 'Yasli', 'DikeyOrta', 'Bosluklu', 'UstBaslikli', 'AcikCok', 'Sinirli200', 'TekKapali', 'YanBaslikli', 'TekSagda', 'YCok'];
    const dene = async () => {
      const c = {};
      for (const ad of ALANLAR) {
        await bosalt(ad);
        await tiklaAd(ad);
        await yapistir(UZUN);
        await bekle(10);
        const d = await d53(ad);
        c[ad] = d.deger;
        if (d.sh > d.ch || d.sw > d.cw || d.st || d.sl) sonuc(`3 ${ad}: Taşma yok`, false, { ...d, deger: undefined });
      }
      await bildirimler();
      return c;
    };
    const taban = await dene();
    for (const z of [0.5, 2]) {
      await yakinlastir(z);
      sonuc(`3 Yakınlaştırma %${z * 100}: Aynı sınır, aynı yazı`, J(await dene()) === J(taban));
      await goruntu(`3-yakin-${z * 100}`);
    }
    await yakinlastir(1);
    // Koyu sayfa
    await evalJs(`(window.__s53.g().koyuSayfaAyarla(true), true)`);
    await bekle(400);
    const koyuMu = await evalJs(`window.__s53.g().kok.classList.contains('koyu-sayfa')`);
    sonuc('3 Koyu sayfa: Aynı sınır, aynı yazı', koyuMu && J(await dene()) === J(taban), { koyuMu });
    await goruntu('3-koyu');
    await evalJs(`(window.__s53.g().koyuSayfaAyarla(false), true)`);
    await bekle(400);
    // Sekme değişimi: Başka sekmeye geçip dönünce
    const y2 = kopya('olcek-ikinci', oz.xfaBicim);
    await ac(y2, { kapa: false });
    await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.yol.endsWith('olcek.pdf')); p.sekmeSec(b.id); for (let i = 0; i < 40 && window.__s53.b() !== b; i++) await window.__s53.bekle(50); await window.__s53.bekle(300); return true; })()`);
    sonuc('3 Sekme değişimi: Aynı sınır, aynı yazı', (await evalJs(`window.__s53.b().yol.endsWith('olcek.pdf')`)) && J(await dene()) === J(taban));
    // Arka planda açılan sekmede sığmayan değer: Sekme görününce işaretlenir (çizilmemiş alanın ölçüsü yok)
    const y3 = kopya('olcek-arka');
    await evalJs(`(async () => { const p = window.__pdefe; const aktif = window.__s53.b(); const b = await p.dosyaAc(${J(y3)}); for (let i = 0; i < 200 && !b.gorunum.alan.querySelector('.xfaLayer'); i++) await window.__s53.bekle(50); p.sekmeSec(aktif.id); await window.__s53.bekle(200); b.gorunum.zoomAyarla(0.75); await window.__s53.bekle(400); window.__arka = b; return true; })()`);
    await evalJs(`(async () => { const p = window.__pdefe; p.sekmeSec(window.__arka.id); await window.__s53.bekle(600); return true; })()`);
    sonuc('3 Arka plandaki sekme görününce sığmayan alan işaretli', (await d53('DiskCok')).tasiyor);
    // Ekran ölçeği: Her ölçeğin yazıları dosyaya, ilk ölçekle karşılaştırılır (test/senaryo53_kos.ps1)
    const dizin = process.env.S53_OLCEK_DIZIN;
    if (dizin) {
      fs.mkdirSync(dizin, { recursive: true });
      fs.writeFileSync(path.join(dizin, `sinir-${dpr}.json`), J(taban));
      for (const f of fs.readdirSync(dizin)) {
        const o = JSON.parse(fs.readFileSync(path.join(dizin, f), 'utf8'));
        const farkli = ALANLAR.filter((a) => o[a] !== taban[a]);
        sonuc(`3 Ekran ölçeği ${dpr}: ${f} ile aynı yazı`, !farkli.length, farkli.map((a) => [a, o[a]?.length, taban[a]?.length]));
      }
    }
    sonuc('3 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 4) sınırda düzenleme, geri al, kaydet, aç
  if (bolum(4)) {
    const y = kopya('sinirda');
    await ac(y);
    await izle();
    const UZUN = uzunYazi(3000);
    await tiklaAd('IkiSatir');
    await yapistir(UZUN);
    await bekle(20);
    const dolu = await d53('IkiSatir');
    await bildirimler();
    sonuc('4 Alan dolu: 2 satır', sinirTamam(dolu, 2), { ...dolu, deger: undefined });
    // Sonda harf: Girmez. Silince yer açılır
    await tus('End', ['ctrl']);
    await harfTut('m', 200);
    let d = await d53('IkiSatir');
    const dolduktan = d.uz;
    sonuc('4 Dolu alanda harf: Sığmayan girmez, uyarı yok', sinirTamam(d, 2) && !(await bildirimler()).length, { ...d, deger: undefined });
    for (let i = 0; i < 30; i++) await tus('Backspace');
    d = await d53('IkiSatir');
    sonuc('4 Silme serbest', d.uz === dolduktan - 30, [d.uz, dolduktan]);
    await harfTut('m', 200);
    d = await d53('IkiSatir');
    sonuc('4 Silince yeniden yazılır, sınıra dek', sinirTamam(d, 2) && d.uz > dolduktan - 30, { ...d, deger: undefined });
    // Seçip değiştirme: Seçimin yerine sığan girer
    await evalJs(`(() => { const e = window.__s53.denetim('IkiSatir'); e.setSelectionRange(10, 40); return true; })()`);
    const once = await d53('IkiSatir');
    await yaz('KISA');
    d = await d53('IkiSatir');
    sonuc('4 Seçip yazma: Seçimin yerine', d.deger === once.deger.slice(0, 10) + 'KISA' + once.deger.slice(40) && d.satir <= 2, { d: d.deger.slice(0, 60) });
    // Ortaya yapıştırma: Sonrası korunur, taşmaz, kalanı söylenir
    await bosalt('IkiSatir');
    await tiklaAd('IkiSatir');
    const BAS = 'Baştaki yazı. ', SON = 'Sondaki yazı korunmalı.';
    await yaz(BAS + SON);
    await evalJs(`(() => { const e = window.__s53.denetim('IkiSatir'); e.setSelectionRange(${BAS.length}, ${BAS.length}); return true; })()`);
    await yapistir(UZUN);
    await bekle(20);
    d = await d53('IkiSatir');
    let bl = await bildirimler();
    const girdi = d.uz - BAS.length - SON.length;
    sonuc('4 Ortaya yapıştırma: Sonraki yazı yerinde, 2 satır, sığan kısım seçimin yerinde', d.deger.startsWith(BAS + UZUN.slice(0, girdi)) && d.deger.endsWith(SON) && sinirTamam(d, 2) && girdi > 20, { d: d.deger, girdi });
    sonuc('4 Ortaya yapıştırma: Uyarı bir kez, alınmayan sayı doğru', bl.length === 1 && bl[0] === `Yazının tamamı bu alana sığmadı. ${(Array.from(UZUN).length - girdi).toLocaleString('tr-TR')} karakter alınmadı.`, { bl, girdi });
    const ortaDeger = d.deger;
    // Geri al, yinele: Tarayıcının geçmişi tek adımda
    await tus('z', ['ctrl']);
    await bekle(30);
    d = await d53('IkiSatir');
    sonuc('4 Geri al: Yapıştırmadan önceki hâl (tek adım)', d.deger === BAS + SON, d.deger);
    await tus('y', ['ctrl']);
    await bekle(30);
    d = await d53('IkiSatir');
    sonuc('4 Yinele: Sığan kısım aynı', d.deger === ortaDeger && sinirTamam(d, 2), d.deger);
    // Birkaç alan doldurulur, kaydet, kapat, aç
    const beklenen = { IkiSatir: ortaDeger };
    for (const ad of ['UcSatir', 'Kendi', 'DikeyOrta', 'TekKapali', 'Sinirli75', 'Hucre11']) {
      await tiklaAd(ad);
      await yapistir(ad === 'Hucre11' ? '12345678901234' : UZUN);
      await bekle(20);
      beklenen[ad] = (await d53(ad)).deger;
    }
    await bildirimler();
    await tus('Tab');
    await kaydet();
    const disk = veriOlc(y);
    for (const [ad, v] of Object.entries(beklenen)) sonuc(`4 Kayıt: ${ad} dosyada aynı`, disk[ad]?.[0] === v, { v, disk: disk[ad]?.[0] });
    await ac(y);
    for (const [ad, v] of Object.entries(beklenen)) {
      const k = await d53(ad);
      sonuc(`4 Yeniden açınca: ${ad} aynı, sığıyor, işaret yok`, k.deger === v && k.sh <= k.ch && k.sw <= k.cw && !k.tasiyor, { ...k, v });
    }
    sonuc('4 Yeniden açınca belge temiz', !(await evalJs(`!!window.__s53.b().degisti`)));
    await goruntu('4-acilis');
    sonuc('4 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 5) düz PDF: Sığan yazının son satırı kâğıtta
  if (bolum(5)) {
    const y = kopya('duz');
    await ac(y);
    await izle();
    const UZUN = uzunYazi(6000);
    const alanlar = [...COK_SATIRLI.map((a) => a.ad), 'TekKapali', 'YanBaslikli', 'TekSagda', 'AcikTek', 'Sinirli75'];   // Yerleşim değeri olmayan yazıyla büyüyen alanı içermez
    const degerler = {};
    for (const ad of alanlar) {
      await tiklaAd(ad);
      await yapistir(UZUN);
      await bekle(10);
      degerler[ad] = await d53(ad);
    }
    await bildirimler();
    await tus('Tab');
    // Ekrandaki yerler: Sayfanın pt'si
    const kutular = await evalJs(`(() => { const g = window.__s53.g(); const c = {}; const sy = g.sayfalar[0].el.getBoundingClientRect(); const o = sy.width / g.sayfalar[0].pdfSayfa.view[2]; for (const ad of ${J(alanlar)}) { const el = window.__s53.denetim(ad); const r = el.getBoundingClientRect(); c[ad] = { x0: (r.left - sy.left) / o, y0: (r.top - sy.top) / o, x1: (r.right - sy.left) / o, y1: (r.bottom - sy.top) / o }; } return c; })()`);
    const duz = await evalJs(`(async () => { const d = await window.__s53.b().xfa.duzPdf(); return { yol: d.yol, sayfa: d.sayfa, tasan: d.tasan }; })()`);
    const kopyaDuz = path.join(UI, 'duz.pdf');
    fs.copyFileSync(duz.yol, kopyaDuz);
    const sayfalar = duzOlc(kopyaDuz, path.join(UI, 'duz'));
    bilgi(`düz PDF: ${duz.sayfa} sayfa, sığmayan alan ${duz.tasan} (dosyadaki üç sığmayan değer)`);
    sonuc('5 Düz PDF: Yalnız dosyadaki sığmayan üç değer sayılır', duz.tasan === 3, duz);
    const sy = sayfalar[0];
    for (const ad of alanlar) {
      const k = kutular[ad], d = degerler[ad];
      const icinde = sy.satir.filter((s) => s.x0 >= k.x0 - 1 && s.x1 <= k.x1 + 2 && (s.y0 + s.y1) / 2 >= k.y0 - 1 && (s.y0 + s.y1) / 2 <= k.y1 + 1);
      const metin = icinde.map((s) => s.t.trim()).join(' ').replace(/\s+/g, ' ').trim();
      const son = d.deger.trim().split(/\s+/).at(-1);
      const ekranda = d.deger.replace(/\s+/g, ' ').trim();
      const basilan = icinde.length ? Math.max(...icinde.map((s) => s.y1)) : 0;
      sonuc(`5 ${ad}: Kâğıtta yazının tamamı, son sözcük dâhil`, metin === ekranda && metin.endsWith(son), { metin: metin.slice(-60), ekranda: ekranda.slice(-60), uz: [metin.length, ekranda.length] });
      sonuc(`5 ${ad}: Son satır kutunun içinde, ${icinde.length} satır (ekranda ${d.satir})`, basilan <= k.y1 + 0.5 && icinde.length === d.satir, { basilan, kutu: k, satir: icinde.length, ekran: d.satir });
    }
    // Çerçeve kâğıtta bütün: Kat kat büyük kurulan çerçeve (xfaHtml.js ince) sayfanın altını geçip bölünüyor, uzun alanın yan çizgileri yarıda kesiliyordu (100 mm'lik alan)
    const yukseklikler = sayfalar.flatMap((x) => x.cizim.map((c) => c[3] - c[1]));
    bilgi(`çizim yükseklikleri: ${J(sayfalar.map((x) => x.cizim.map((c) => Math.round(c[3] - c[1])).filter((h) => h > 40)))}`);
    sonuc('5 Uzun alanın çerçevesi kâğıtta bütün (100 mm)', yukseklikler.some((h) => Math.abs(h - 100 * MM) < 2), yukseklikler.filter((h) => h > 40).map(Math.round));
    // Yazdırma penceresi: Yalnız dosyadaki sığmayan değerler için uyarı
    await komut('dosya.yazdir');
    const u = await evalJs(`(async () => { for (let i = 0; i < 100 && !document.querySelector('.yazdir-diyalog'); i++) await window.__s53.bekle(100); await window.__s53.bekle(300); const e = document.querySelector('.yazdir-uyari'); return e && !e.hidden ? e.textContent : ''; })()`);
    sonuc('5 Yazdırma penceresi: Yalnız dosyada sığmayan alanları söyler', u === '3 alandaki yazı alana sığmıyor. Sığmayan kısım basılmaz.', u);
    await tus('Escape');
    await bekle(300);
    sonuc('5 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 6) dosyada zaten sığmayan değer
  if (bolum(6)) {
    const y = kopya('disk');
    const ozgun = veriOlc(y);
    await ac(y);
    await evalJs(`new Promise((c) => setTimeout(c, 200))`);
    let d = await d53('DiskCok');
    const bl0 = await evalJs(`document.getElementById('bildirim').hidden ? '' : document.getElementById('bildirim').textContent`);
    sonuc('6 Açılış: Yazı silinmedi, kırmızı çerçeve, kaydırılabilir', d.deger === ozgun.DiskCok[0] && d.tasiyor && d.tasma === 'auto' && d.sh > d.ch, { ...d, deger: undefined });
    sonuc('6 Açılış: Bir kez bildirim', /sığmıyor/.test(bl0), bl0);
    const tek = await d53('DiskTek');
    sonuc('6 Tek satır: Yazı silinmedi, kırmızı çerçeve', tek.deger === ozgun.DiskTek[0] && tek.tasiyor, { ...tek, deger: undefined });
    sonuc('6 Kaydırması açık alan da aynı', (await d53('DiskUzun')).tasiyor);
    sonuc('6 Sığan alan işaretli değil, salt okunur işaretsiz', !(await d53('IkiSatir')).tasiyor && !(await d53('SaltOkunur')).tasiyor);
    await goruntu('6-disk');
    await izle();
    // Tekerlekle okunur
    const p = await yer('DiskCok');
    await fare([{ tur: 'hareket', x: p.x, y: p.y }, { tur: 'tekerlek', x: p.x, y: p.y, deltaY: 120, bekle: 200 }]);
    d = await d53('DiskCok');
    sonuc('6 Tekerlekle kayar: Okunabilir', d.st > 0, d.st);
    // Yazı girmez, silinir
    await tikla(p.x, p.y);
    await bekle(60);
    const uz0 = (await d53('DiskCok')).uz;
    await tus('x');
    await yaz('y');
    await yapistir('yapıştırılan');
    await enterTut(2);
    await bekle(30);
    d = await d53('DiskCok');
    const bl = await bildirimler();
    sonuc('6 Yeni yazı girmez (harf, dikte, yapıştırma, Enter)', d.uz === uz0, d.uz);
    sonuc('6 Neden girmediği söylenir', bl.some((m) => /sığmıyor/.test(m)) && bl.some((m) => /alınmadı/.test(m)), bl);
    await tus('Backspace');
    await tus('Delete');
    d = await d53('DiskCok');
    sonuc('6 Silinebilir', d.uz === uz0 - 2 || d.uz === uz0 - 1, [d.uz, uz0]);
    await tus('z', ['ctrl']); await tus('z', ['ctrl']);
    await bekle(30);
    d = await d53('DiskCok');
    sonuc('6 Geri al: Yazı geri gelir', d.uz === uz0, [d.uz, uz0]);
    // Başka alan değişip kaydedilince sığmayan yazı korunur
    await tiklaAd('IkiSatir');
    await yaz('Başka alan');
    await tus('Tab');
    await kaydet();
    let disk = veriOlc(y);
    sonuc('6 Kayıt: Sığmayan yazı dosyada eksiksiz', disk.DiskCok[0] === ozgun.DiskCok[0] && disk.DiskTek[0] === ozgun.DiskTek[0] && disk.DiskUzun[0] === ozgun.DiskUzun[0] && disk.IkiSatir[0] === 'Başka alan', { uz: [disk.DiskCok[0].length, ozgun.DiskCok[0].length] });
    // Yazdırma penceresi
    await komut('dosya.yazdir');
    const u = await evalJs(`(async () => { for (let i = 0; i < 100 && !document.querySelector('.yazdir-diyalog'); i++) await window.__s53.bekle(100); await window.__s53.bekle(300); const e = document.querySelector('.yazdir-uyari'); return e && !e.hidden ? e.textContent : ''; })()`);
    sonuc('6 Yazdırma penceresi: 3 alan sığmıyor', u === '3 alandaki yazı alana sığmıyor. Sığmayan kısım basılmaz.', u);
    await tus('Escape');
    await bekle(300);
    // Sığacak kadar silinince normal hâl
    await tiklaAd('DiskCok');
    await evalJs(`(() => { const e = window.__s53.denetim('DiskCok'); e.scrollTop = 100; e.setSelectionRange(60, e.value.length); return true; })()`);
    await tus('Delete');
    await bekle(40);
    d = await d53('DiskCok');
    sonuc('6 Sığacak kadar silinince: İşaret kalkar, kaydırılamaz, yazı başta', !d.tasiyor && d.tasma === 'hidden' && d.st === 0 && d.sh <= d.ch && d.uz === 60, { ...d, deger: undefined });
    await harfTut('x', 400);
    d = await d53('DiskCok');
    sonuc('6 Sonra yazı sınıra dek girer', sinirTamam(d, 2) && d.uz > 60, { ...d, deger: undefined });
    await tus('Tab');
    // Tek satırda da
    await tiklaAd('DiskTek');
    await evalJs(`(() => { const e = window.__s53.denetim('DiskTek'); e.setSelectionRange(10, e.value.length); return true; })()`);
    await tus('Delete');
    d = await d53('DiskTek');
    sonuc('6 Tek satır: Sığınca işaret kalkar', !d.tasiyor && d.uz === 10, { ...d, deger: undefined });
    await tus('Tab');
    await kaydet();
    disk = veriOlc(y);
    await ac(y);
    sonuc('6 Kısaltılan alanlar yeniden açınca işaretsiz', !(await d53('DiskCok')).tasiyor && !(await d53('DiskTek')).tasiyor && (await d53('DiskUzun')).tasiyor);
    sonuc('6 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 7) karakter sınırı: XFA maxChars, hücreli alan, düz form alanı
  if (bolum(7)) {
    const y = kopya('karakter');
    await ac(y);
    await izle();
    await tiklaAd('Sinirli75');
    const CUMLE = 'Karakter sınırı olan alana yazılan cümle sözcüklerden oluşur ve yetmiş beş karakteri geçer, fazlası alınmaz.';
    await yapistir(CUMLE);
    let d = await d53('Sinirli75');
    let bl = await bildirimler();
    sonuc('7 maxChars 75: En çok 75 karakter, sözcük sınırında', d.uz <= 75 && d.uz > 60 && CUMLE.startsWith(d.deger) && /\s/.test(CUMLE[d.uz]), d.deger);
    sonuc('7 maxChars 75: Uyarı alınmayan sayıyla', bl.length === 1 && bl[0] === `Yazının tamamı bu alana sığmadı. ${(CUMLE.length - d.uz).toLocaleString('tr-TR')} karakter alınmadı.`, bl);
    await bosalt('Sinirli75');
    await tiklaAd('Sinirli75');
    await harfTut('a', 100);
    d = await d53('Sinirli75');
    sonuc('7 maxChars 75: Yazarken 75\'te durur, uyarı yok', d.uz === 75 && !(await bildirimler()).length, d.uz);
    // Hücreli alanlar: Harf hücrede kesilir
    for (const [ad, n] of [['Hucre10', 10], ['Hucre11', 11], ['Hucre16', 16]]) {
      await tiklaAd(ad);
      await yapistir('1234 5678 9012 3456 7890');
      d = await d53(ad);
      bl = await bildirimler();
      const gorunen = await evalJs(`[...window.__s53.alan(${J(ad)}).querySelectorAll('.xfa-comb-hucre')].map((h) => h.textContent).join('')`);
      sonuc(`7 ${ad}: Hücre sayısı kadar, kalanı söylenir, hücreler dolu`, d.uz === n && gorunen === d.deger && bl.length === 1 && bl[0].includes(` ${24 - n} karakter`), { d: d.deger, gorunen, bl });
    }
    await tiklaAd('Hucre10');
    await tus('a', ['ctrl']);
    await tus('Delete');
    await harfTut('1', 30);
    d = await d53('Hucre10');
    sonuc('7 Hücreli alan: Yazarken hücre sayısında durur, uyarı yok', d.uz === 10 && !(await bildirimler()).length, d.uz);
    // Düz form alanı: MaxLen, tarak
    const duz = path.join(UI, 'alanlar.pdf');
    await ac(duz, { katman: '.gorunum:not([hidden]) .form-alan[data-tur="metin"]' });
    await evalJs(`(() => { const f = window.__s53.b().formlar; (window.__dbl ||= []).length = 0; return true; })()`);
    const formDurum = (i) => evalJs(`(async () => { const g = window.__s53.g(); const s = g.sayfalar[0]; const o = [...s._formOgeler.values()].find((x) => x.a.ad === ${J(i)}); return { uz: o.denetim.value.length, deger: o.denetim.value, bildirim: document.getElementById('bildirim').hidden ? '' : document.getElementById('bildirim').textContent }; })()`);
    const formTikla = async (ad) => { const p = await evalJs(`(async () => { const g = window.__s53.g(); const s = g.sayfalar[0]; for (let i = 0; i < 80 && !s._formOgeler?.size; i++) await window.__s53.bekle(50); const o = [...s._formOgeler.values()].find((x) => x.a.ad === ${J(ad)}); o.el.scrollIntoView({ block: 'center' }); await window.__s53.bekle(150); const r = o.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); await tikla(p.x, p.y); await bekle(100); return p; };
    await formTikla('kisa');
    await yapistir('Beşten uzun yazı');
    let f = await formDurum('kisa');
    sonuc('7 Düz form alanı MaxLen 5: En çok 5, kalanı söylenir', f.uz <= 5 && f.uz > 0 && 'Beşten uzun yazı'.startsWith(f.deger) && f.bildirim === `Yazının tamamı bu alana sığmadı. ${16 - f.uz} karakter alınmadı.`, f);
    await tus('Tab');
    await formTikla('tc');
    await tus('a', ['ctrl']);
    await tus('Delete');
    await yapistir('12345678901234');
    f = await formDurum('tc');
    sonuc('7 Tarak alan 11 hücre: Hanede kesilir, 3 karakter alınmadı', f.deger === '12345678901' && f.bildirim === 'Yazının tamamı bu alana sığmadı. 3 karakter alınmadı.', f);
    await tus('Tab');
    await formTikla('ad');
    await tus('a', ['ctrl']);
    await tus('Delete');
    await yapistir('Sınırsız alana yazı sığar');
    f = await formDurum('ad');
    sonuc('7 Sınırı olmayan düz form alanı: Yazı girer', f.deger === 'Sınırsız alana yazı sığar', f);
    await tus('Tab');
    await bekle(100);
    sonuc('7 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 8) sağ tık: Kes, Kopyala, Yapıştır (menü ve pano test kancasından: Kullanıcının panosuna dokunulmaz)
  if (bolum(8)) {
    const y = kopya('sagtik');
    await ac(y);
    await izle();
    const kayit = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
    const yanitla = (kanal, yanitlar) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', ${J(kanal)}, ${J(yanitlar)})`);
    /** Gerçek sağ tık: pano ve menünün yanıtı kuyrukta. Döner: Menünün öğeleri (id → devre), panoya yazılanlar. */
    const sagTik = async (ad, { pano = '', secim = null, i = 0, nokta = null } = {}) => {
      await kayit();
      await yanitla('pano:oku', [pano]);
      await yanitla('menu:popup', [secim]);
      const p = nokta || await yer(ad, i);
      await tikla(p.x, p.y, { dugme: 'right' });
      await bekle(250);
      const k = await kayit();
      const m = k.filter((x) => x.kanal === 'menu:popup').at(-1)?.secenek || [];
      return { menu: Object.fromEntries(m.filter((o) => o.id).map((o) => [o.id, !o.devre])), sira: m.map((o) => o.id || '-'), yazilan: k.filter((x) => x.kanal === 'pano:metin').map((x) => x.secenek) };
    };
    const sec = (ad, a, b) => evalJs(`(() => { const e = window.__s53.denetim(${J(ad)}); e.focus(); e.setSelectionRange(${a}, ${b}); return true; })()`);
    const metin = 'Kopyalanacak yazı burada';
    await tiklaAd('UcSatir');
    await yaz(metin);
    // Seçim yok, pano boş: Kes ve Kopyala soluk, Yapıştır soluk
    let m = await sagTik('UcSatir');
    sonuc('8 Menü sırası: Kes, Kopyala, Yapıştır, ayırıcı, Tümünü seç, ayırıcı, Kaydet, Yazdır', J(m.sira) === J(['kes', 'kopyala', 'yapistir', '-', 'tumunuSec', '-', 'kaydet', 'yazdir']), m.sira);
    sonuc('8 Seçim yok, pano boş: Kes, Kopyala, Yapıştır kapalı, Tümünü seç açık', !m.menu.kes && !m.menu.kopyala && !m.menu.yapistir && m.menu.tumunuSec, m.menu);
    // Panoda yazı: Yapıştır açık
    m = await sagTik('UcSatir', { pano: 'x' });
    sonuc('8 Panoda yazı: Yapıştır açık', m.menu.yapistir, m.menu);
    // Seçim var (sağ tık seçimin üstünde): Kes ve Kopyala açık. Odak ve seçim korunur
    await sec('UcSatir', 0, 11);
    const kr = await evalJs(`(() => { const e = window.__s53.denetim('UcSatir'); const r = e.getBoundingClientRect(); const o = r.width / e.offsetWidth; return { x: r.left + 15 * o, y: r.top + 7 * o }; })()`);
    m = await sagTik('UcSatir', { nokta: kr });
    sonuc('8 Seçim var: Kes ve Kopyala açık', m.menu.kes && m.menu.kopyala, m);
    // Kopyala
    await sec('UcSatir', 0, 11);
    m = await sagTik('UcSatir', { nokta: kr, secim: 'kopyala' });
    sonuc('8 Kopyala: Seçili yazı panoya (test kancası), alan değişmez', m.yazilan.at(-1)?.bas === 'Kopyalanaca' && (await d53('UcSatir')).deger === metin, m);
    // Kes
    await sec('UcSatir', 0, 12);
    m = await sagTik('UcSatir', { nokta: kr, secim: 'kes' });
    let d = await d53('UcSatir');
    sonuc('8 Kes: Panoya ve alandan', m.yazilan.at(-1)?.bas === 'Kopyalanacak' && d.deger === metin.slice(12), { m, d: d.deger });
    await tus('z', ['ctrl']);
    await bekle(30);
    sonuc('8 Kes: Geri alınır', (await d53('UcSatir')).deger === metin, (await d53('UcSatir')).deger);
    // Çok satırlı yazıda Windows satır sonu
    await sec('UcSatir', 0, 0);
    await yapistir('A\nB');
    await sec('UcSatir', 0, 3);
    m = await sagTik('UcSatir', { nokta: kr, secim: 'kopyala' });
    sonuc('8 Kopyala: Panoda Windows satır sonu', m.yazilan.at(-1)?.bas === 'A\r\nB', m.yazilan);
    // Tümünü seç
    await sagTik('UcSatir', { secim: 'tumunuSec' });
    const secim = await evalJs(`(() => { const e = window.__s53.denetim('UcSatir'); return [e.selectionStart, e.selectionEnd, e.value.length, document.activeElement === e]; })()`);
    sonuc('8 Tümünü seç: Alanın yazısı seçili, odak alanda', secim[0] === 0 && secim[1] === secim[2] && secim[3], secim);
    // Yapıştır: Sınırdan geçer, uyarı
    await bosalt('IkiSatir');
    await bildirimler();
    m = await sagTik('IkiSatir', { pano: uzunYazi(3000), secim: 'yapistir' });
    d = await d53('IkiSatir');
    let bl = await bildirimler();
    sonuc('8 Yapıştır: Sığan kısım girer, 2 satır, uyarı bir kez', sinirTamam(d, 2) && d.uz > 100 && bl.length === 1 && /alınmadı\.$/.test(bl[0]), { ...d, deger: undefined, bl });
    await tus('z', ['ctrl']);
    await bekle(30);
    sonuc('8 Yapıştır: Geri alınır', (await d53('IkiSatir')).deger === '', (await d53('IkiSatir')).deger);
    await bosalt('Hucre11');
    await sagTik('Hucre11', { pano: '123456789012', secim: 'yapistir' });
    d = await d53('Hucre11');
    bl = await bildirimler();
    sonuc('8 Hücreli alana Yapıştır: Hücre sayısı, uyarı', d.deger === '12345678901' && bl.length === 1 && bl[0].includes(' 1 karakter'), { d: d.deger, bl });
    // Salt okunur alan
    m = await sagTik('SaltOkunur', { pano: 'x' });
    sonuc('8 Salt okunur: Yapıştır ve Kes kapalı', !m.menu.yapistir && !m.menu.kes && m.menu.tumunuSec, m.menu);
    await evalJs(`(() => { const e = window.__s53.denetim('SaltOkunur'); e.focus(); e.setSelectionRange(0, 4); return true; })()`);
    const kr2 = await evalJs(`(() => { const e = window.__s53.denetim('SaltOkunur'); const r = e.getBoundingClientRect(); const o = r.width / e.offsetWidth; return { x: r.left + 8 * o, y: r.top + r.height / 2 }; })()`);
    m = await sagTik('SaltOkunur', { pano: 'x', nokta: kr2 });
    sonuc('8 Salt okunur, seçim var: Kopyala açık, Kes kapalı', m.menu.kopyala && !m.menu.kes && !m.menu.yapistir, m.menu);
    // Sayfanın boş yerinde sayfanın menüsü (değişmedi)
    const bosYer = await evalJs(`(() => { const s = window.__s53.g().sayfalar[0].el.getBoundingClientRect(), r = window.__s53.denetim('SaltOkunur').getBoundingClientRect(); return { x: s.left + 6, y: r.top + r.height / 2 }; })()`);
    await kayit();
    await tikla(bosYer.x, bosYer.y, { dugme: 'right' });
    await bekle(250);
    const sayfaMenu = (await kayit()).filter((x) => x.kanal === 'menu:popup').at(-1)?.secenek || [];
    sonuc('8 Alanın dışında sayfanın menüsü', sayfaMenu.some((o) => o.id === 'vurgula'), sayfaMenu.map((o) => o.id));
    // Kaydet menüden
    await tiklaAd('UcSatir');
    await yaz('Menüden kaydet');
    await sagTik('UcSatir', { secim: 'kaydet' });
    await kayitBitsin();
    sonuc('8 Kaydet menüden: Alandan çıkılmamış yazı dosyada', (veriOlc(y).UcSatir?.[0] || '').includes('Menüden kaydet'), veriOlc(y).UcSatir);
    // Düz form alanı
    const duz = path.join(UI, 'alanlar.pdf');
    await ac(duz, { katman: '.gorunum:not([hidden]) .form-alan[data-tur="metin"]' });
    const formYer = (ad) => evalJs(`(async () => { const g = window.__s53.g(); const s = g.sayfalar[0]; for (let i = 0; i < 80 && !s._formOgeler?.size; i++) await window.__s53.bekle(50); const o = [...s._formOgeler.values()].find((x) => x.a.ad === ${J(ad)}); o.el.scrollIntoView({ block: 'center' }); await window.__s53.bekle(150); const r = o.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const formDeger = (ad) => evalJs(`(() => { const s = window.__s53.g().sayfalar[0]; const o = [...s._formOgeler.values()].find((x) => x.a.ad === ${J(ad)}); return o.denetim.value; })()`);
    let p = await formYer('kisa');
    m = await sagTik('', { nokta: p, pano: 'abc' });
    sonuc('8 Düz form alanı: Menü açılır, Yapıştır açık, seçim yok', J(m.sira.slice(0, 3)) === J(['kes', 'kopyala', 'yapistir']) && m.menu.yapistir && !m.menu.kes, m);
    await sagTik('', { nokta: p, pano: 'Beşten uzun yazı', secim: 'yapistir' });
    let v = await formDeger('kisa');
    const blDuz = await evalJs(`document.getElementById('bildirim').hidden ? '' : document.getElementById('bildirim').textContent`);
    sonuc('8 Düz form alanı Yapıştır: MaxLen, uyarı', v.length <= 5 && v.length > 0 && blDuz.includes('alınmadı'), { v, blDuz });
    await evalJs(`(() => { const e = document.activeElement; e.select(); return e.tagName; })()`);
    m = await sagTik('', { nokta: p, secim: 'kopyala' });
    sonuc('8 Düz form alanı Kopyala: Panoya (test kancası)', m.yazilan.at(-1)?.bas === v, { m, v });
    await evalJs(`(() => { document.activeElement.select(); return true; })()`);
    m = await sagTik('', { nokta: p, secim: 'kes' });
    sonuc('8 Düz form alanı Kes: Panoya, alan boş', m.yazilan.at(-1)?.bas === v && (await formDeger('kisa')) === '', { m });
    // Onay kutusunda menü yok
    const onay = await evalJs(`(() => { const s = window.__s53.g().sayfalar[0]; const o = [...s._formOgeler.values()].find((x) => x.a.tur === 'onay'); o.el.scrollIntoView({ block: 'center' }); const r = o.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await bekle(200);
    await kayit();
    await tikla(onay.x, onay.y, { dugme: 'right' });
    await bekle(200);
    sonuc('8 Düz form onay kutusunda menü açılmaz', !(await kayit()).some((x) => x.kanal === 'menu:popup'));
    sonuc('8 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 9) düz form alanında mavi işaret yok
  if (bolum(9)) {
    const duz = path.join(UI, 'alanlar.pdf');
    await ac(duz, { katman: '.gorunum:not([hidden]) .form-alan[data-tur="metin"]' });
    const o = (ad, tur = null) => `(() => { const s = window.__s53.g().sayfalar[0]; return [...s._formOgeler.values()].find((x) => ${tur ? `x.a.tur === ${J(tur)}` : `x.a.ad === ${J(ad)}`}); })()`;
    const st = (ifade) => evalJs(`(() => { const a = ${ifade}; const c = getComputedStyle(a.el); return { zemin: c.backgroundColor, resim: c.backgroundImage, golge: c.boxShadow, cizgi: c.outlineStyle, kalin: parseFloat(c.outlineWidth), ara: parseFloat(c.outlineOffset), imlec: c.cursor, denetimImlec: a.denetim ? getComputedStyle(a.denetim).cursor : null }; })()`);
    const yerO = (ifade) => evalJs(`(async () => { const a = ${ifade}; a.el.scrollIntoView({ block: 'center' }); await window.__s53.bekle(150); const r = a.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    const p = await yerO(o('ad'));
    await fare([{ tur: 'hareket', x: 5, y: 5 }]);
    let s = await st(o('ad'));
    sonuc('9 Yazı alanı: Zemin saydam, gölge yok, imleç I', s.zemin === 'rgba(0, 0, 0, 0)' && s.golge === 'none' && (s.imlec === 'text' || s.denetimImlec === 'text'), s);
    await goruntu('9-alanlar', { x: p.l - 40, y: p.t - 40, width: p.w + 80, height: 300 });
    // Üstüne gelince de işaret yok
    await fare([{ tur: 'hareket', x: p.x, y: p.y }]);
    await bekle(100);
    s = await st(o('ad'));
    sonuc('9 Üstüne gelince işaret yok', s.zemin === 'rgba(0, 0, 0, 0)' && s.golge === 'none', s);
    const onay = await st(o(null, 'onay'));
    sonuc('9 Onay kutusu: Zemin saydam, el imleci', onay.zemin === 'rgba(0, 0, 0, 0)' && onay.imlec === 'pointer', onay);
    // Odakta 1 ekran pikseli köşesiz çerçeve
    await tikla(p.x, p.y);
    await bekle(120);
    s = await st(o('ad'));
    bilgi(`odak: ${J(s)}, ekran ölçeği ${dpr}`);
    sonuc('9 Odakta 1 ekran pikseli köşesiz çerçeve, gölge yok', s.cizgi === 'solid' && Math.abs(s.kalin * dpr - 1) < 0.34 && s.golge === 'none', s);
    await goruntu('9-odak', { x: p.l - 12, y: p.t - 12, width: p.w + 24, height: p.h + 24 });
    // Görüntü: Çerçevenin dışında mavi yok
    // Odak onay kutusunda da
    const po = await yerO(o(null, 'onay'));
    await tikla(po.x, po.y);
    await bekle(120);
    const so = await st(o(null, 'onay'));
    sonuc('9 Onay kutusu odakta: İnce çerçeve', so.cizgi === 'solid' && so.golge === 'none', so);
    await tikla(po.x, po.y);
    await bekle(120);
    sonuc('9 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 10) bileşim, bırakma, bölüm ekleme, salt okunur, tekerlek, sayı ve tarih
  if (bolum(10)) {
    const y = kopya('diger');
    await ac(y);
    await izle();
    const UZUN = uzunYazi(3000);
    // Bileşim (IME): Sığan bileşim girer
    await tiklaAd('IkiSatir');
    await cdp('Input.imeSetComposition', { text: 'ş', selectionStart: 1, selectionEnd: 1 });
    await cdp('Input.imeSetComposition', { text: 'şe', selectionStart: 2, selectionEnd: 2 });
    await cdp('Input.insertText', { text: 'şey' });
    await bekle(30);
    sonuc('10 Bileşim: Sığan yazı girer', (await d53('IkiSatir')).deger === 'şey', (await d53('IkiSatir')).deger);
    // Dolu alanda bileşim: Son sığan hâle döner
    await tus('a', ['ctrl']);
    await yapistir(UZUN);
    await tus('End', ['ctrl']);
    await bekle(20);
    const dolu = (await d53('IkiSatir')).deger;
    await bildirimler();
    await cdp('Input.imeSetComposition', { text: uzunYazi(400), selectionStart: 400, selectionEnd: 400 });
    await cdp('Input.insertText', { text: uzunYazi(400) });
    await bekle(60);
    let d = await d53('IkiSatir');
    sonuc('10 Dolu alanda bileşim: Son sığan hâl', d.deger === dolu && sinirTamam(d, 2), { uz: d.uz, dolu: dolu.length, tasma: d.sh });
    sonuc('10 Bileşim alınmayınca söylenir', (await bildirimler()).some((m) => /alınmadı/.test(m)));
    await bosalt('IkiSatir');
    // Sürükleyip bırakma: Sığan kısım, uyarı, bırakılan yerde
    const birak = async (x, yy, metin) => {
      const data = { items: [{ mimeType: 'text/plain', data: metin }], dragOperationsMask: 3 };
      await cdp('Input.dispatchDragEvent', { type: 'dragEnter', x, y: yy, data });
      await cdp('Input.dispatchDragEvent', { type: 'dragOver', x, y: yy, data });
      await cdp('Input.dispatchDragEvent', { type: 'drop', x, y: yy, data });
      await bekle(120);
    };
    let p = await yer('UcSatir');
    await birak(p.x, p.y, UZUN);
    d = await d53('UcSatir');
    let bl = await bildirimler();
    sonuc('10 Bırakma: Sığan kısım girer, 3 satır, uyarı bir kez', d.satir === 3 && d.sh <= d.ch && UZUN.startsWith(d.deger) && bl.length === 1 && /alınmadı\.$/.test(bl[0]), { ...d, deger: undefined, bl });
    p = await yer('TekKapali');
    await birak(p.x, p.y, 'Kısa yazı');
    d = await d53('TekKapali');
    sonuc('10 Bırakma: Sığan yazı olduğu gibi, uyarı yok', d.deger === 'Kısa yazı' && !(await bildirimler()).length, d.deger);
    p = await yer('TekSagda');
    await birak(p.x, p.y, UZUN);
    d = await d53('TekSagda');
    bl = await bildirimler();
    sonuc('10 Tek satıra uzun bırakma: Genişliği geçmez', d.uz > 0 && d.sw <= d.cw && bl.length === 1, { ...d, deger: undefined, bl });
    // Yazıyla büyüyen alan (şablonda yüksekliği yok): Sınır yok, kâğıtta büyür, yazı eksiksiz
    const BUYUK = ('Büyüyen alana yazılan yazı. '.repeat(12) + 'SONSOZCUK').trim();   // sayfanın altını geçmeyecek kadar: PDF.js alanı sayfaya bölmez
    await tiklaAd('Buyuyen');
    await yapistir(BUYUK);
    await bekle(20);
    d = await d53('Buyuyen');
    sonuc('10 Yazıyla büyüyen alan: Yazının tamamı girer, uyarı ve işaret yok', d.deger === BUYUK && !d.tasiyor && !(await bildirimler()).length, { ...d, deger: undefined });
    await enterTut(3);
    sonuc('10 Yazıyla büyüyen alan: Enter girer', (await d53('Buyuyen')).deger === BUYUK + '\n\n\n');
    await tus('Backspace'); await tus('Backspace'); await tus('Backspace');
    await tus('Tab');
    const bd = await evalJs(`(async () => { const d = await window.__s53.b().xfa.duzPdf(); return { yol: d.yol, tasan: d.tasan }; })()`);
    const bk = path.join(UI, 'buyuyen.pdf');
    fs.copyFileSync(bd.yol, bk);
    const bs = duzOlc(bk, path.join(UI, 'buyuyen')).flatMap((x) => x.satir.map((l) => l.t)).join(' ').replace(/\s+/g, ' ');
    sonuc('10 Yazıyla büyüyen alan: Kâğıtta son sözcük dâhil, sığmıyor sayılmaz', bs.includes(BUYUK.replace(/\s+/g, ' ')) && bd.tasan === 3, { tasan: bd.tasan, son: bs.includes('SONSOZCUK') });
    // Salt okunur: Yapıştırılmaz
    await tiklaAd('SaltOkunur');
    await yapistir('Yazılmamalı');
    await harfTut('x', 3);
    await enterTut(1);
    sonuc('10 Salt okunur: Yapıştırma ve yazma girmez', (await d53('SaltOkunur')).deger === 'Salt okunur yazı', (await d53('SaltOkunur')).deger);
    // Tekerlek: Dolu alanda alan kaymaz (sayfa kayabilir)
    await tiklaAd('UcSatir');
    const pt = await yer('UcSatir');
    await fare([{ tur: 'hareket', x: pt.x, y: pt.y }, { tur: 'tekerlek', x: pt.x, y: pt.y, deltaY: 240, bekle: 200 }]);
    d = await d53('UcSatir');
    sonuc('10 Tekerlek: Sığan alan kaymaz', d.st === 0, d.st);
    // İmleç sonda: Ctrl+End, oklar alanı kaydırmaz
    await tiklaAd('UcSatir');
    await tus('End', ['ctrl']);
    d = await d53('UcSatir');
    sonuc('10 Ctrl+End: Alan kaymaz', d.st === 0, d.st);
    // Bölüm ekle: Yeni örnekte de sınır, eskisi yerinde, geri al
    await tiklaAd('YCok');
    await yapistir(UZUN);
    await bekle(20);
    const ilkYCok = (await d53('YCok')).deger;
    await bildirimler();
    await tus('Tab');
    const say0 = await evalJs(`window.__s53.g().sayfaSayisi`);
    await tiklaAd('SinirEkle');
    await evalJs(`window.__s53.durgun()`);
    await bekle(300);
    const adet = await evalJs(`document.querySelectorAll('${KATMAN} [xfaname="YCok"]').length`);
    bilgi(`bölüm eklendi: ${adet} YCok görünür, ${say0} → ${await evalJs(`window.__s53.g().sayfaSayisi`)} sayfa`);
    sonuc('10 Bölüm eklendi', adet >= 2, adet);
    d = await d53('YCok', 0);
    sonuc('10 Yeniden dizilince eski yazı yerinde, sığıyor', d.deger === ilkYCok && d.sh <= d.ch && !d.tasiyor, { ...d, deger: undefined });
    await tiklaAd('YCok', 1);
    await enterTut(10);
    d = await d53('YCok', 1);
    sonuc('10 Yeni örnekte de sınır: Enter 2 satırda durur', d.deger.split('\n').length === 2 && d.sh <= d.ch && d.st === 0, { ...d, deger: undefined });
    await tus('a', ['ctrl']);
    await yapistir(UZUN);
    await bekle(20);
    d = await d53('YCok', 1);
    sonuc('10 Yeni örneğe yapıştırma: 2 satır', sinirTamam(d, 2), { ...d, deger: undefined });
    await bildirimler();
    await tiklaAd('IkiSatir');
    await yapistir(UZUN);
    await tus('Tab');
    await evalJs(`(() => { window.__s53.g().kaydirici.focus(); window.__pdefe.komutCalistir('duzen.geriAl'); return true; })()`);
    await evalJs(`window.__s53.durgun()`);
    sonuc('10 Komut yığınından geri al: Alan boş', (await d53('IkiSatir')).deger === '', (await d53('IkiSatir')).deger);
    await evalJs(`(() => { window.__pdefe.komutCalistir('duzen.yinele'); return true; })()`);
    await evalJs(`window.__s53.durgun()`);
    d = await d53('IkiSatir');
    sonuc('10 Komut yığınından yinele: Sığan yazı, işaret yok', d.uz > 100 && sinirTamam(d, 2) && !d.tasiyor, { ...d, deger: undefined });
    // Kaydet, aç: Hepsi sığıyor
    await kaydet();
    await ac(y);
    d = await d53('YCok', 0);
    sonuc('10 Kaydedip açınca bölümler yerinde, sığıyor', d.deger === ilkYCok && !d.tasiyor && d.sh <= d.ch, { ...d, deger: undefined });
    await goruntu('10-son');
    sonuc('10 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 11) gerçek sağ tık menüsü (kancasız örnek, görünmeyen masaüstü)
  if (bolum(11)) {
    const masa = process.env.S53_MASA, surec = process.env.S53_SUREC;
    const y = kopya('gercek-menu');
    await ac(y);
    /** Yardımcı menüyü bekler, gerçek sağ tık, yardımcının yazdığı öğeler. sec: Basılacak öğenin adı (boşsa Esc). */
    const gercekMenu = async (ad, adi, sec = '', nokta = null) => {
      const cikti = path.join(UI, `menu-${adi}.json`), resim = path.join(UI, `menu-${adi}.png`);
      const ps = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const komut = `"${ps}" -NoProfile -ExecutionPolicy Bypass -File "${path.join(KOK, 'test', 'menu_yakala.ps1')}" -SurecNo ${surec} -Cikti "${cikti}" -Goruntu "${resim}"${sec ? ` -Sec "${sec}"` : ''}`;
      execFileSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'masaustunde_baslat.ps1'), '-Masaustu', masa, '-Komut', komut, '-Klasor', KOK], { encoding: 'utf8' });
      await bekle(1200);   // PowerShell ve UI Automation yüklenir
      const p = nokta || await yer(ad);
      await tikla(p.x, p.y, { dugme: 'right' });
      for (let i = 0; i < 80 && !(fs.existsSync(cikti) && (sec ? JSON.parse(fs.readFileSync(cikti, 'utf8')).basildi || JSON.parse(fs.readFileSync(cikti, 'utf8')).hata : JSON.parse(fs.readFileSync(cikti, 'utf8')).ogeler?.length || JSON.parse(fs.readFileSync(cikti, 'utf8')).hata)); i++) await bekle(150);
      await bekle(500);
      const r = fs.existsSync(cikti) ? JSON.parse(fs.readFileSync(cikti, 'utf8')) : { hata: 'çıktı yok' };
      r.etkin = Object.fromEntries((r.ogeler || []).map((o) => [o.ad, o.etkin]));
      return r;
    };
    await tiklaAd('UcSatir');
    await yaz('Sağ tıkla seçilecek yazı');
    await bekle(100);
    let m = await gercekMenu('UcSatir', 'secimsiz');
    bilgi(`menü penceresi: ${m.sinif}, öğeler: ${J(m.ogeler)}`);
    sonuc('11 Gerçek sağ tık: Menü açıldı, öğeler Kes, Kopyala, Yapıştır, Tümünü seç, Kaydet, Yazdır', m.bulundu && ['Kes', 'Kopyala', 'Yapıştır', 'Tümünü seç', 'Kaydet', 'Yazdır'].every((a) => a in m.etkin) && !('Vurgula' in m.etkin), m);
    sonuc('11 Seçim yok: Kes ve Kopyala soluk, Tümünü seç açık', m.etkin['Kes'] === false && m.etkin['Kopyala'] === false && m.etkin['Tümünü seç'] === true, m.etkin);
    const panoVar = !!(await evalJs(`window.pdefe.cagir('pano:oku').then((m) => !!m)`));
    sonuc('11 Yapıştır panodaki yazıya göre', m.etkin['Yapıştır'] === panoVar, { m: m.etkin, panoVar });
    // Seçim varken gerçek sağ tık: Seçim korunur, Kes ve Kopyala açık
    await evalJs(`(() => { const e = window.__s53.denetim('UcSatir'); e.focus(); e.setSelectionRange(0, 8); return true; })()`);
    const kr = await evalJs(`(() => { const e = window.__s53.denetim('UcSatir'); const r = e.getBoundingClientRect(); const o = r.width / e.offsetWidth; return { x: r.left + 12 * o, y: r.top + 7 * o }; })()`);
    m = await gercekMenu('UcSatir', 'secili', '', kr);
    sonuc('11 Seçim varken: Kes ve Kopyala açık', m.etkin['Kes'] === true && m.etkin['Kopyala'] === true, m.etkin);
    sonuc('11 Seçim varken: Sağ tık seçimi korur', (await evalJs(`(() => { const e = window.__s53.denetim('UcSatir'); return e.selectionEnd - e.selectionStart; })()`)) === 8);
    // Tümünü seç menüden
    await evalJs(`(() => { const e = window.__s53.denetim('UcSatir'); e.setSelectionRange(3, 3); return true; })()`);
    m = await gercekMenu('UcSatir', 'tumunu', 'Tümünü seç', kr);
    const secim = await evalJs(`(() => { const e = window.__s53.denetim('UcSatir'); return [e.selectionStart, e.selectionEnd, e.value.length, document.activeElement === e]; })()`);
    sonuc('11 Tümünü seç menüden: Yazı seçili, odak alanda', m.basildi === 'Tümünü seç' && secim[0] === 0 && secim[1] === secim[2] && secim[3], { m, secim });
    // Yapıştır menüden (pano yalnız okunur, içeriği çıktıya yazılmaz). Panoda yazı yoksa soluk: Sınanamaz
    if (panoVar) {
      await bosalt('IkiSatir');
      const pIki = await yer('IkiSatir');
      m = await gercekMenu('IkiSatir', 'yapistir', 'Yapıştır', pIki);
      await bekle(300);
      const d = await d53('IkiSatir');
      sonuc('11 Yapıştır menüden: Panodaki yazı alana girer, sınırı geçmez', m.basildi === 'Yapıştır' && d.uz > 0 && d.sh <= d.ch && d.st === 0, { ...d, deger: undefined, basildi: m.basildi });
      await bosalt('IkiSatir');
    } else bilgi('panoda yazı yok: Yapıştır menüden sınanmadı');
    // Düz form alanı
    const duz = path.join(UI, 'alanlar.pdf');
    await ac(duz, { katman: '.gorunum:not([hidden]) .form-alan[data-tur="metin"]' });
    const pf = await evalJs(`(async () => { const s = window.__s53.g().sayfalar[0]; for (let i = 0; i < 80 && !s._formOgeler?.size; i++) await window.__s53.bekle(50); const o = [...s._formOgeler.values()].find((x) => x.a.ad === 'ad'); o.el.scrollIntoView({ block: 'center' }); await window.__s53.bekle(200); const r = o.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await tikla(pf.x, pf.y);
    await yaz('Düz form');
    await bekle(100);
    m = await gercekMenu('', 'duz-form', '', pf);
    sonuc('11 Düz form alanı: Gerçek menü açıldı', m.bulundu && 'Kes' in m.etkin && 'Yapıştır' in m.etkin && m.etkin['Tümünü seç'] === true, m);
    sonuc('11 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 12) geri al ve yinele: Alanın kendi geçmişi
  if (bolum(12)) {
    const y = kopya('gecmis');
    await ac(y);
    await izle();
    const degerler = async (...a) => Object.fromEntries(await Promise.all(a.map(async (ad) => [ad, (await d53(ad)).deger])));
    const odakAdi = () => evalJs(`document.activeElement?.closest?.('[xfaname]')?.getAttribute('xfaname') || ''`);
    const kirli = () => evalJs(`!!window.__s53.b().degisti`);
    // Başka alana gitmez (tarayıcının geçmişi çerçeve başına tektir: Yazı silinir, imleç oraya gider)
    await tiklaAd('IkiSatir'); await yaz('birinci'); await tus('Tab');
    await tiklaAd('UcSatir'); await yaz('ikinci'); await tus('Tab');
    await tiklaAd('TekKapali');
    await tus('z', ['ctrl']); await bekle(30);
    let v = await degerler('IkiSatir', 'UcSatir', 'TekKapali');
    sonuc('12 Boş alanda Ctrl+Z: Başka alanın yazısı silinmez, imleç yerinde', v.IkiSatir === 'birinci' && v.UcSatir === 'ikinci' && v.TekKapali === '' && (await odakAdi()) === 'TekKapali', { v, odak: await odakAdi() });
    await tus('y', ['ctrl']); await bekle(30);
    v = await degerler('IkiSatir', 'UcSatir', 'TekKapali');
    sonuc('12 Boş alanda Ctrl+Y: Yazılar aynı', v.IkiSatir === 'birinci' && v.UcSatir === 'ikinci' && v.TekKapali === '', v);
    // Komut yığınından geri al ve yinele, sonra başka alanda Ctrl+Z, Ctrl+Y: Yazı katlanmaz (programın yazdığı değer tarayıcının adımlarını bayat bırakıyordu)
    const KATLANAN = 'Katlanmamalı';
    await tiklaAd('TekKapali'); await yapistir(KATLANAN); await tus('Tab'); await bekle(30);
    await evalJs(`(() => { document.activeElement?.blur?.(); window.__s53.g().kaydirici.focus(); window.__pdefe.komutCalistir('duzen.geriAl'); return true; })()`);
    await evalJs(`window.__s53.durgun()`);
    sonuc('12 Komut yığınından geri al: Alan boş', (await d53('TekKapali')).deger === '', (await d53('TekKapali')).deger);
    await evalJs(`(window.__pdefe.komutCalistir('duzen.yinele'), true)`);
    await evalJs(`window.__s53.durgun()`);
    await tiklaAd('IkiSatir');
    await tus('End', ['ctrl']);
    for (const t of ['z', 'y', 'y', 'z', 'z', 'y']) { await tus(t, ['ctrl']); await bekle(15); }
    v = await degerler('TekKapali', 'UcSatir');
    sonuc('12 Komut yığınından sonra başka alanda Ctrl+Z, Ctrl+Y dizisi: Yazı katlanmaz, öbür alanlar aynı', v.TekKapali === KATLANAN && v.UcSatir === 'ikinci', v);
    await tiklaAd('TekKapali');
    for (const t of ['z', 'y', 'y', 'z', 'y']) { await tus(t, ['ctrl']); await bekle(15); }
    sonuc('12 Aynı alanda bayat adım yok: Yazı katlanmaz', (await d53('TekKapali')).deger === KATLANAN, (await d53('TekKapali')).deger);
    await bosalt('IkiSatir');
    // Kendi geçmişi: Yazma, yapıştırma, silme adım adım geri gelir, yinelenir
    await tiklaAd('IkiSatir');
    await yaz('Bir');
    await bekle(1600);   // yazma adımları birleşmesin
    await yapistir(' iki');
    await tus('Backspace');
    let d = await d53('IkiSatir');
    sonuc('12 Hazırlık', d.deger === 'Bir ik', d.deger);
    await tus('z', ['ctrl']); await bekle(15);
    sonuc('12 Geri al 1: Silme', (await d53('IkiSatir')).deger === 'Bir iki', (await d53('IkiSatir')).deger);
    await tus('z', ['ctrl']); await bekle(15);
    sonuc('12 Geri al 2: Yapıştırma', (await d53('IkiSatir')).deger === 'Bir', (await d53('IkiSatir')).deger);
    await tus('z', ['ctrl']); await bekle(15);
    sonuc('12 Geri al 3: Yazma', (await d53('IkiSatir')).deger === '', (await d53('IkiSatir')).deger);
    await tus('y', ['ctrl']); await bekle(15); await tus('y', ['ctrl']); await bekle(15);
    sonuc('12 Yinele 2 kez', (await d53('IkiSatir')).deger === 'Bir iki', (await d53('IkiSatir')).deger);
    await tus('z', ['ctrl']); await bekle(15);
    await tus('z', ['ctrl', 'shift']); await bekle(15);
    sonuc('12 Ctrl+Shift+Z: Yinele', (await d53('IkiSatir')).deger === 'Bir iki', (await d53('IkiSatir')).deger);
    await tus('Backspace');
    await harfTut('x', 3);
    await tus('y', ['ctrl']); await bekle(15);
    sonuc('12 Yeni yazıdan sonra yinele boş', (await d53('IkiSatir')).deger === 'Bir ikxxx', (await d53('IkiSatir')).deger);
    // Art arda yazma tek adım
    await tus('z', ['ctrl']); await bekle(15);
    sonuc('12 Art arda yazılan harfler tek adım', (await d53('IkiSatir')).deger === 'Bir ik', (await d53('IkiSatir')).deger);
    // Depo aynı (kaydedilecek olan), komut menüden de
    d = await d53('IkiSatir');
    const depo = () => evalJs(`(() => { const e = window.__s53.denetim('IkiSatir'); return window.__s53.g().belge.annotationStorage.getRawValue(e.dataset.xv)?.value ?? null; })()`);
    sonuc('12 Geri al değeri depoya da yazar', (await depo()) === d.deger, await depo());
    await evalJs(`(window.__pdefe.komutCalistir('duzen.geriAl'), true)`); await bekle(30);
    sonuc('12 Düzen menüsünden geri al alanda: Kendi geçmişi', (await d53('IkiSatir')).deger === 'Bir iki', (await d53('IkiSatir')).deger);
    await evalJs(`(window.__pdefe.komutCalistir('duzen.yinele'), true)`); await bekle(30);
    sonuc('12 Düzen menüsünden yinele alanda', (await d53('IkiSatir')).deger === 'Bir ik', (await d53('IkiSatir')).deger);
    // Gerçek tuş yolu (tarayıcı sürecinin girdisi, menüye de ulaşır): Ctrl+Z ve Ctrl+Y alanda kalır
    const gercekTus = async (k) => { await evalJs(`window.pdefe.cagir('test:tusGonder', ${J([{ type: 'keyDown', keyCode: k, modifiers: ['control'] }, { type: 'keyUp', keyCode: k, modifiers: ['control'] }])})`); await bekle(60); };
    const once = (await d53('UcSatir')).deger;
    await gercekTus('Z');
    sonuc('12 Gerçek Ctrl+Z: Alanın kendi yazısı, öbür alan aynı', (await d53('IkiSatir')).deger === 'Bir iki' && (await d53('UcSatir')).deger === once, (await d53('IkiSatir')).deger);
    await gercekTus('Y');
    sonuc('12 Gerçek Ctrl+Y', (await d53('IkiSatir')).deger === 'Bir ik', (await d53('IkiSatir')).deger);
    // Alandan çıkınca belge değişmiş sayılır: Son değişiklik geri al olsa da (tarayıcı change olayı vermez)
    await tus('Tab'); await bekle(30);
    await kaydet();
    sonuc('12 Kaydet: Temiz', !(await kirli()) && veriOlc(y).IkiSatir?.[0] === 'Bir ik', veriOlc(y).IkiSatir);
    await tiklaAd('IkiSatir');
    await tus('z', ['ctrl']); await bekle(15);
    await tus('Tab'); await bekle(30);
    sonuc('12 Yalnız geri al yapılmış alandan çıkınca belge değişmiş', await kirli(), await kirli());
    const yazi = (await d53('IkiSatir')).deger;
    await kaydet();
    sonuc('12 Geri alınan yazı dosyada', (veriOlc(y).IkiSatir?.[0] ?? '') === yazi && yazi !== 'Bir ik', { d: veriOlc(y).IkiSatir, yazi });
    // Bileşim: Reddedilen taşan hâl geçmişte yok, bileşim sürerken kırmızı işaret ve bildirim yok
    const UZUN = uzunYazi(3000);
    await bosalt('IkiSatir');
    await tiklaAd('IkiSatir');
    await yapistir(UZUN);
    await tus('End', ['ctrl']);
    await bekle(20);
    const dolu = (await d53('IkiSatir')).deger;
    await bildirimler();
    const BILESIM = 'bileşim yazısı '.repeat(30);
    await cdp('Input.imeSetComposition', { text: BILESIM, selectionStart: 400, selectionEnd: 400 });
    await bekle(30);
    sonuc('12 Bileşim sürerken: Kırmızı işaret yok', !(await d53('IkiSatir')).tasiyor, (await d53('IkiSatir')).uz);
    await cdp('Input.insertText', { text: BILESIM });
    await bekle(50);
    d = await d53('IkiSatir');
    let bl = await bildirimler();
    sonuc('12 Bileşim bitti: Son sığan hâl, depoda da, tek bildirim', d.deger === dolu && sinirTamam(d, 2) && bl.length === 1 && /alınmadı\.$/.test(bl[0]) && (await depo()) === dolu, { uz: d.uz, dolu: dolu.length, bl, depo: (await depo())?.length });
    await tus('z', ['ctrl']); await bekle(15);
    d = await d53('IkiSatir');
    sonuc('12 Bileşimden sonra geri al: Taşan hâl yok, yapıştırmadan önceki hâl', d.deger === '' && !d.tasiyor, { uz: d.uz, tasiyor: d.tasiyor });
    await tus('y', ['ctrl']); await bekle(15);
    d = await d53('IkiSatir');
    sonuc('12 Bileşimden sonra yinele: Taşan hâl yok, dolu hâl', d.deger === dolu && !d.tasiyor, { uz: d.uz, tasiyor: d.tasiyor });
    await tus('y', ['ctrl']); await bekle(15);
    d = await d53('IkiSatir');
    sonuc('12 Bileşimden sonra ikinci yinele: Yazı aynı', d.deger === dolu && !d.tasiyor, { uz: d.uz, tasiyor: d.tasiyor });
    await bildirimler();
    // Dosyada sığmayan yazı: Silinir, geri alınır, geri alınan hâl yine işaretli, yazı aynı
    await tiklaAd('DiskCok');
    const disk0 = (await d53('DiskCok')).deger;
    await tus('Backspace'); await tus('Backspace');
    await tus('z', ['ctrl']); await bekle(15);
    d = await d53('DiskCok');
    sonuc('12 Dosyadaki sığmayan yazı: Silme geri alınır, işaret kalır', d.deger === disk0 && d.tasiyor, { uz: d.uz, disk: disk0.length });
    await tus('Tab');
    // Bölüm eklenince eski geçmiş düşer
    await tiklaAd('YCok'); await yaz('Bölüm yazısı'); await tus('Tab'); await bekle(20);
    await tiklaAd('SinirEkle'); await evalJs(`window.__s53.durgun()`); await bekle(250);
    await tiklaAd('YCok');
    for (const t of ['z', 'y', 'z']) { await tus(t, ['ctrl']); await bekle(15); }
    sonuc('12 Form yeniden dizilince eski adımlar yok: Yazı aynı', (await d53('YCok')).deger === 'Bölüm yazısı', (await d53('YCok')).deger);
    await tus('Tab');
    // Düz form alanı
    const duz = path.join(UI, 'alanlar.pdf');
    await ac(duz, { katman: '.gorunum:not([hidden]) .form-alan[data-tur="metin"]' });
    const fYer = (ad) => evalJs(`(async () => { const s = window.__s53.g().sayfalar[0]; for (let i = 0; i < 80 && !s._formOgeler?.size; i++) await window.__s53.bekle(50); const o = [...s._formOgeler.values()].find((x) => x.a.ad === ${J(ad)}); o.el.scrollIntoView({ block: 'center' }); await window.__s53.bekle(120); const r = o.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const fDeger = (ad) => evalJs(`[...window.__s53.g().sayfalar[0]._formOgeler.values()].find((x) => x.a.ad === ${J(ad)}).denetim.value`);
    let p = await fYer('ad'); await tikla(p.x, p.y); await bekle(60);
    await tus('a', ['ctrl']); await yaz('Düz birinci'); await tus('Tab'); await bekle(60);
    p = await fYer('kisa'); await tikla(p.x, p.y); await bekle(60);
    await tus('z', ['ctrl']); await bekle(20);
    sonuc('12 Düz form: Başka alanda Ctrl+Z birinci alanı silmez', (await fDeger('ad')) === 'Düz birinci', await fDeger('ad'));
    await yaz('abc');
    await tus('z', ['ctrl']); await bekle(20);
    sonuc('12 Düz form: Kendi yazısı geri alınır', (await fDeger('kisa')) === '', await fDeger('kisa'));
    await tus('y', ['ctrl']); await bekle(20);
    sonuc('12 Düz form: Yinelenir', (await fDeger('kisa')) === 'abc', await fDeger('kisa'));
    await tus('Tab'); await bekle(60);
    sonuc('12 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 13) alanlar arası sürükleme
  if (bolum(13)) {
    const y = kopya('surukle');
    await ac(y);
    await izle();
    const UZUN = uzunYazi(3000);
    await cdp('Input.setInterceptDrags', { enabled: true });
    /** Seçili yazı fareyle sürüklenir, tarayıcının sürüklemesi yakalanıp aynı veriyle bırakılır. */
    const tasi = async (x1, y1, x2, y2) => {
      olaylar.length = 0;
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1, button: 'none', buttons: 0 });
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 });
      await bekle(30);
      for (let i = 1; i <= 8; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / 8, y: y1 + ((y2 - y1) * i) / 8, button: 'left', buttons: 1 }); await bekle(15); }
      await bekle(60);
      const o = olaylar.find((e) => e.method === 'Input.dragIntercepted');
      if (o) {
        const data = o.params.data;
        await cdp('Input.dispatchDragEvent', { type: 'dragEnter', x: x2, y: y2, data });
        await cdp('Input.dispatchDragEvent', { type: 'dragOver', x: x2, y: y2, data });
        await bekle(20);
        await cdp('Input.dispatchDragEvent', { type: 'drop', x: x2, y: y2, data });
        await bekle(120);
      }
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 });
      await bekle(60);
      return !!o;
    };
    const metniSec = (ad, a, b) => evalJs(`(async () => { const e = window.__s53.denetim(${J(ad)}); e.focus(); e.setSelectionRange(${a}, ${b}); e.scrollIntoView({ block: 'center' }); await window.__s53.bekle(80); const r = e.getBoundingClientRect(); const o = r.width / e.offsetWidth; return { x: r.left + (parseFloat(getComputedStyle(e).paddingLeft) + 12) * o, y: r.top + (parseFloat(getComputedStyle(e).paddingTop) + 7) * o }; })()`);
    const yerSur = (ad) => evalJs(`(() => { const e = window.__s53.denetim(${J(ad)}); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, sol: r.left + 3, ust: r.top + 8 }; })()`);
    // Hedef dolu: Kaynak yerinde kalır, sığan kısım girer, uyarı
    await tiklaAd('IkiSatir');
    await yapistir(UZUN);
    await bekle(20);
    const dolu = (await d53('IkiSatir')).deger;
    await bildirimler();
    const KAYNAK = 'Sürüklenecek yazı burada duruyor ve kaybolmamalı';
    await tiklaAd('UcSatir');
    await yaz(KAYNAK);
    let k = await metniSec('UcSatir', 0, KAYNAK.length);
    let h = await yerSur('IkiSatir');
    const oldu = await tasi(k.x, k.y, h.x, h.y);
    sonuc('13 Tarayıcının sürüklemesi başladı', oldu);
    let sa = await d53('UcSatir'), sb = await d53('IkiSatir'), bl = await bildirimler();
    const giren = sb.deger.length - dolu.length;
    sonuc('13 Dolu alana sürükleme: Kaynak yerinde kalır', sa.deger === KAYNAK, sa.deger);
    sonuc('13 Dolu alana sürükleme: Hedef taşmaz, önceki yazısı yerinde', sinirTamam(sb, 2) && !sb.tasiyor && sb.uz >= dolu.length, { ...sb, deger: undefined });
    sonuc('13 Dolu alana sürükleme: Uyarı bir kez, sayı doğru', bl.length === 1 && bl[0] === `Yazının tamamı bu alana sığmadı. ${Array.from(KAYNAK).length - giren} karakter alınmadı.`, { bl, giren });
    // Sığmayan yazı bırakılan yere girer
    await bosalt('Hucre10');
    await bosalt('IkiSatir');
    await tiklaAd('IkiSatir');
    await yapistir(UZUN);
    await bekle(20);
    await tus('End', ['ctrl']);
    for (let i = 0; i < 12; i++) await tus('Backspace');
    const kisalmis = (await d53('IkiSatir')).deger;
    await bildirimler();
    k = await metniSec('UcSatir', 0, KAYNAK.length);
    h = await yerSur('IkiSatir');
    await tasi(k.x, k.y, h.sol, h.ust);
    sb = await d53('IkiSatir');
    await bildirimler();
    sonuc('13 Kısmi bırakma: Bırakılan yerde (satırın başı), sonrası aynı', sb.deger.endsWith(kisalmis) && sb.uz > kisalmis.length && sinirTamam(sb, 2), { bas: sb.deger.slice(0, 20), uz: [sb.uz, kisalmis.length] });
    sonuc('13 Kısmi bırakma: Kaynak yerinde', (await d53('UcSatir')).deger === KAYNAK, (await d53('UcSatir')).deger);
    // Hücreli alana
    k = await metniSec('UcSatir', 0, KAYNAK.length);
    h = await yerSur('Hucre10');
    await tasi(k.x, k.y, h.x, h.y);
    sa = await d53('UcSatir'); sb = await d53('Hucre10'); bl = await bildirimler();
    sonuc('13 Hücreli alana: Kaynak yerinde, hücre sayısı kadar', sa.deger === KAYNAK && Array.from(sb.deger).length === 10 && KAYNAK.startsWith(sb.deger) && bl.length === 1, { a: sa.deger, h: sb.deger, bl });
    // Sığan yazı: Taşınır
    await bosalt('TekKapali');
    k = await metniSec('UcSatir', 0, 11);
    h = await yerSur('TekKapali');
    await tasi(k.x, k.y, h.x, h.y);
    sa = await d53('UcSatir'); sb = await d53('TekKapali');
    sonuc('13 Sığan yazı: Taşınır, uyarı yok', sa.deger === KAYNAK.slice(11) && sb.deger === KAYNAK.slice(0, 11) && !(await bildirimler()).length, { a: sa.deger, t: sb.deger });
    // Aynı alanda taşıma: Yazı aynı kalır (sıra değişir), tek geri al
    await bosalt('UcSatir');
    await tiklaAd('UcSatir');
    await yaz('Bir iki uc dort');
    k = await metniSec('UcSatir', 0, 3);
    const son = await evalJs(`(() => { const e = window.__s53.denetim('UcSatir'); const r = e.getBoundingClientRect(); const o = r.width / e.offsetWidth; return { x: r.left + 100 * o, y: r.top + (parseFloat(getComputedStyle(e).paddingTop) + 7) * o }; })()`);
    await tasi(k.x, k.y, son.x, son.y);
    sa = await d53('UcSatir');
    const harfler = (t) => Array.from(t.replace(/ /g, '')).sort().join('');
    sonuc('13 Aynı alanda taşıma: Harfler aynı, sözcük yer değiştirdi', harfler(sa.deger) === harfler('Bir iki uc dort') && sa.deger !== 'Bir iki uc dort' && !(await bildirimler()).length, sa.deger);
    await tus('z', ['ctrl']); await bekle(20);
    sonuc('13 Aynı alanda taşıma: Tek geri al', (await d53('UcSatir')).deger === 'Bir iki uc dort', (await d53('UcSatir')).deger);
    // Kaynağı olmayan bırakma (başka programdan): Eskisi gibi sığan kısım
    await bosalt('UcSatir');
    const data = { items: [{ mimeType: 'text/plain', data: UZUN }], dragOperationsMask: 3 };
    h = await yerSur('UcSatir');
    for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp('Input.dispatchDragEvent', { type, x: h.x, y: h.y, data });
    await bekle(120);
    sa = await d53('UcSatir'); bl = await bildirimler();
    sonuc('13 Dışarıdan bırakma: Sığan kısım, 3 satır, uyarı bir kez', sa.satir === 3 && sa.sh <= sa.ch && UZUN.startsWith(sa.deger) && bl.length === 1, { ...sa, deger: undefined, bl });
    await cdp('Input.setInterceptDrags', { enabled: false });
    sonuc('13 Sayfada hata yok', !(await hatalar()).length);
  }

  // ================================================================== 14) sayı alanı
  if (bolum(14)) {
    const y = kopya('sayi');
    await ac(y);
    await izle();
    await tiklaAd('Sayi');
    await yaz('abc');
    let d = await d53('Sayi');
    sonuc('14 Sayı alanı: Harf girmez', d.deger === '', d.deger);
    await bildirimler();
    await yapistir('12,50');
    d = await d53('Sayi');
    let bl = await bildirimler();
    sonuc('14 Virgüllü yapıştırma: Hiç girmez (12 başka bir sayıdır), söylenir', d.deger === '' && bl.length === 1 && bl[0].includes(' 5 karakter'), { d: d.deger, bl });
    await tus('a', ['ctrl']); await tus('Delete');
    for (const [h, vk] of [['-', 189], ['1', 49], ['2', 50], ['.', 190], ['5', 53], ['a', 65]]) await tusHam({ key: h, code: '', vk });
    d = await d53('Sayi');
    sonuc('14 Tuşla: Eksi, sayı, nokta girer, harf girmez', d.deger === '-12.5', d.deger);
    await tus('Tab');
    await bosalt('Sayi');
    await tiklaAd('Sayi');
    await yapistir('1234567890123456789');
    d = await d53('Sayi');
    await bildirimler();
    sonuc('14 15 haneden fazlası girmez: Kâğıtta bozulurdu', d.deger === '', d.deger);
    await yapistir('123456789012345');
    d = await d53('Sayi');
    sonuc('14 15 hane girer', d.deger === '123456789012345' && !(await bildirimler()).length, d.deger);
    await tus('Tab');
    await tiklaAd('Tarih');
    await yaz('30.10.2026');
    await tus('Tab');
    await bekle(30);
    const dz = await evalJs(`(async () => { const r = await window.__s53.b().xfa.duzPdf(); return { yol: r.yol }; })()`);
    const kd = path.join(UI, 'sayi-duz.pdf');
    fs.copyFileSync(dz.yol, kd);
    const metin = duzOlc(kd).flatMap((x) => x.satir.map((l) => l.t)).join(' ');
    sonuc('14 Kâğıtta sayı aynı, tarih aynı', metin.includes('123456789012345') && metin.includes('30.10.2026'), metin.slice(0, 200));
    await kaydet();
    await ac(y);
    sonuc('14 Yeniden açınca aynı', (await d53('Sayi')).deger === '123456789012345' && (await d53('Tarih')).deger === '30.10.2026', [(await d53('Sayi')).deger, (await d53('Tarih')).deger]);
    sonuc('14 Sayfada hata yok', !(await hatalar()).length);
  }

  ws.close();
  await kapatHepsini();
  console.log(`\n${denetim} denetim, ${hataSayisi} hata`);
  if (hataSayisi) process.exitCode = 1;
}
