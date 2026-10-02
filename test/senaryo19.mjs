// Senaryo 19 (0.1.13, kullanıcı istekleri): "Yapışkan not" adının kalkması (özelliğin adı "Not"; araç ipucu, Düzen menüsü, Yorumlar
// paneli, dosyadaki /Subj), seçim mini çubuğunda renklerin ▾'nin altında dikey sütun olarak açılması (çubuk genişlemez, yan boşluklar
// küçük; altta yer yoksa ya da çubuk seçimin üstündeyse sütun yukarı), Sayfaları düzenle'de "PDF ekle" ve araçlarda "Kaydet" bölüm
// başlığı, sekme çubuğunda + / Ctrl+T ile "Yeni sekme" (açılış sayfası sekmesi; önde açılan belge onun yerini alır, zaten açık dosyada
// o sekmeye geçilir; 0.1.21'den beri sekme çubuğu hiç kapanmaz; 0.1.22'den beri son belge kapanınca açılış sekmeleri kalır, belge
// yokken de Ctrl+T yeni açılış sekmesi açar), açılış ekranında büyük PDF aç düğmesi + sürükle-bırak bilgisi
// (0.1.14'ten beri düğmenin açıklamasında) + beş aracın hepsi + Son açılanlar (0.1.14'ten beri araçların altında; "Son açılanları
// hatırla" kapalıyken kutu hiç yok, içerik ortada; 0.1.14'ün ayrıntılı açılış denetimleri senaryo20'de), belge gerektiren araçların
// belge yokken önce Aç penceresini açması (açılış ekranı kartları, Araçlar penceresi, Araçlar menüsü, açılış sekmesi), araç
// pencerelerinin alt şeridindeki ipucu satırlarının F1 Kısayollar penceresine taşınması. Açık ve koyu temada ekran görüntüleri alınır.
// Menü kısayolları (Ctrl+T, Ctrl+W, Ctrl+S, F1) test:tusGonder ile sınanır: örnek görünmeyen masaüstünde olmalı (baslat_gizli.ps1).
// Kullanım:
//   powershell -File test\baslat_gizli.ps1 -Port 9414 -Veri "%TEMP%\pdefe-s19-9414" -Tema acik      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9414; $env:S19_PID=<PID>; $env:S19_MASAUSTU="PDEfeTest9414"; node test\surucu.mjs betik test\senaryo19.mjs
// S19_PID / S19_MASAUSTU verilirse pencere başlığı görünmeyen masaüstündeki pencereden (Win32, salt okunur) okunur; verilmezse bu
// denetim atlanır. Belgeler test/pdf'ten test/cikti/s19/<zaman>/pdf'e kopyalanır (asıllarına yazılmaz); ekran görüntüleri …/png'de.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 's19', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PDF = path.join(K, 'pdf'), CIKTI = path.join(K, 'cikti'), PNG = path.join(K, 'png');
const PORT = process.env.PDEFE_CDP_PORT || 9222;
const PYTHON = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const bilgi = (s) => console.log(`     · ${s}`);

// ---------------------------------------------------------------- sürekli CDP oturumu: konsol / hata olayları, genişlik taklidi
async function cdpOturumu() {
  const hedefler = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const sayfa = hedefler.find((h) => h.type === 'page' && h.url.startsWith('pdefe://'));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map(), olaylar = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } else if (d.method) olaylar.push(d); };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder, olaylar };
}

/** Görünmeyen masaüstündeki PDEfe penceresinin başlığı (Win32 EnumDesktopWindows + GetWindowText; salt okunur). */
function pencereBasligi() {
  if (!process.env.S19_PID || !process.env.S19_MASAUSTU) return null;
  const ps = `
$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class S19PencereBasligi {
  delegate bool Sayici(IntPtr h, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenDesktop(string ad, int bayrak, bool miras, uint erisim);
  [DllImport("user32.dll")] static extern bool EnumDesktopWindows(IntPtr masa, Sayici f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr masa);
  public static string Oku(string masaustu, int pid) {
    IntPtr masa = OpenDesktop(masaustu, 0, false, 0x0041);
    if (masa == IntPtr.Zero) return "HATA:" + Marshal.GetLastWin32Error();
    var liste = new List<string>();
    EnumDesktopWindows(masa, (h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) { var s = new StringBuilder(512); GetWindowText(h, s, 512); if (s.Length > 0) liste.Add(s.ToString()); } return true; }, IntPtr.Zero);
    CloseDesktop(masa);
    return string.Join("|", liste);
  }
}
"@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[S19PencereBasligi]::Oku($env:S19_MASAUSTU, [int]$env:S19_PID)`;
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) { return 'HATA:' + e.message; }
}

/** PDF'teki notlar (PyMuPDF): [{tur, konu, icerik}] */
function dosyadakiNotlar(yol) {
  const kod = 'import sys, json, pymupdf\nd = pymupdf.open(sys.argv[1])\nprint(json.dumps([{"tur": a.type[1], "konu": a.info.get("subject"), "icerik": a.info.get("content")} for p in d for a in p.annots()], ensure_ascii=False))';
  return JSON.parse(execFileSync(PYTHON, ['-c', kod, yol], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }));
}

export default async function (surucu) {
  // S19_IZ=1: her sürücü çağrısı süresiyle stderr'e yazılır (takılan adımı bulmak için)
  const iz = process.env.S19_IZ ? (ad, f) => async (...a) => { const t0 = Date.now(); const k = J(a).slice(0, 140); console.error(`[iz] > ${ad} ${k}`); try { return await f(...a); } finally { console.error(`[iz] < ${ad} ${Date.now() - t0} ms`); } } : (_ad, f) => f;
  const { bekle } = surucu;
  const [evalJs, ekranGoruntusu, fare, tikla, surukle, tus, yaz] = ['evalJs', 'ekranGoruntusu', 'fare', 'tikla', 'surukle', 'tus', 'yaz'].map((ad) => iz(ad, surucu[ad]));
  const cdp = await cdpOturumu();
  await cdp.gonder('Runtime.enable'); await cdp.gonder('Log.enable'); await cdp.gonder('Page.enable');
  const baslangicZamani = Date.now();

  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
  const pngler = [];
  const ss = async (ad) => { await bekle(300); const d = path.join(PNG, ad + '.png'); await ekranGoruntusu(d); pngler.push(d); };
  const koyuMu = () => evalJs(`document.documentElement.dataset.tema === 'koyu'`);
  const temaDegistir = async () => { await evalJs(`window.__pdefe.komutCalistir('gorunum.tema')`); await bekle(500); };
  /** Açık temada ve koyu temada ekran görüntüsü (sonra açık temaya döner). */
  const ssIki = async (ad) => { if (await koyuMu()) await temaDegistir(); await ss(ad + '-acik'); await temaDegistir(); await ss(ad + '-koyu'); await temaDegistir(); };
  /** Genişlik taklidi (Emulation): ölçüm ve ekran görüntüsü aynı oturumda. */
  const genislikTaklit = async (w) => { if (w) await cdp.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: 795, deviceScaleFactor: 0, mobile: false }); else await cdp.gonder('Emulation.clearDeviceMetricsOverride'); await bekle(400); };
  const ssCdp = async (ad) => { await bekle(300); const r = await cdp.gonder('Page.captureScreenshot', { format: 'png' }); const d = path.join(PNG, ad + '.png'); fs.mkdirSync(PNG, { recursive: true }); fs.writeFileSync(d, Buffer.from(r.result.data, 'base64')); pngler.push(d); };

  const q = (s) => `document.querySelector(${J(s)})`;
  const merkez = async (ifade) => JSON.parse(await evalJs(`(() => { const e = ${ifade}; if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`));
  const tikl = async (ifade, secenek) => { const m = await merkez(ifade); if (!m) throw new Error('Öğe yok: ' + ifade); await tikla(m[0], m[1], secenek); };
  const sagTikl = async (ifade) => { const m = await merkez(ifade); if (!m) throw new Error('Öğe yok: ' + ifade); await fare([{ tur: 'hareket', x: m[0], y: m[1] }, { tur: 'bas', x: m[0], y: m[1], dugme: 'right' }, { tur: 'birak', x: m[0], y: m[1], dugme: 'right' }]); };
  const odakla = () => evalJs(`window.pdefe.cagir('test:odakla')`);
  const tusOlaylari = (olaylar) => evalJs(`window.pdefe.cagir('test:tusGonder', ${J(olaylar)})`);
  /** Menü hızlandırıcısı (tarayıcı sürecinin girdi yolu): keyCode Electron adı, modifiers ['control', 'shift']. */
  const menuTus = async (keyCode, modifiers = []) => { await odakla(); await tusOlaylari([{ type: 'keyDown', keyCode, modifiers }, { type: 'keyUp', keyCode, modifiers }]); await bekle(450); };
  const kayit = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const acYaniti = (yol) => evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:acDiyalog', [${J([yol])}])`);
  const ac = (ad, secenek) => evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ad))}${secenek ? ', ' + J(secenek) : ''}).then((b) => new Promise((r) => setTimeout(() => r(!!b), 600)))`);
  const kapat = (ad) => evalJs(`(async () => { const b = [...window.__pdefe.belgeler.values()].find((x) => x.ad === ${J(ad)}); if (b) await window.__pdefe.belgeKapat(b.id, { zorla: true }); return !!b; })()`);
  const hepsiniKapat = () => evalJs(`(async () => { document.querySelectorAll('.arac-ortusu, .diyalog-ortusu').forEach((e) => e.remove()); for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  const kirlet = (ad) => evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${J(ad)}); await p.sayfalariDondur(b, [1], 90, 'Sayfayı döndür'); await new Promise((r) => setTimeout(r, 300)); return b.degisti; })()`);
  const durum = () => evalJs(`(() => { const s = window.__pdefe.sekmeler, a = s.bul(s.aktifId); return {
    adlar: s.sekmeler.map((x) => (x.baslangic ? '+' : x.ad)), idler: s.sekmeler.map((x) => x.id), aktif: a ? (a.baslangic ? '+' : a.ad) : null, aktifId: s.aktifId,
    belge: window.__pdefe.aktif()?.ad ?? null, cubukGizli: document.querySelector('#sekme-cubugu').hidden, acilisGorunur: !document.querySelector('#baslangic').hidden,
    gorunurBelgeler: [...document.querySelectorAll('#gorunumler > .gorunum')].filter((e) => !e.hidden).length }; })()`);
  const yapiskanVar = () => evalJs(`(() => { const m = document.documentElement.outerHTML.match(/.{0,60}yap[ıi]ş?kan.{0,40}/i); return m ? m[0] : null; })()`);
  const yapiskanKayit = [];
  const yapiskanDenetle = async (yer) => { const v = await yapiskanVar(); if (v) yapiskanKayit.push({ yer, v }); };

  // ---------------------------------------------------------------- hazırlık
  for (const k of [PDF, CIKTI, PNG]) fs.mkdirSync(k, { recursive: true });
  const kaynaklar = fs.readdirSync(path.join(KOK, 'test', 'pdf')).filter((a) => /\.pdf$/i.test(a)).map((a) => path.join(KOK, 'test', 'pdf', a))
    .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size);
  if (!kaynaklar.length) throw new Error('test/pdf altında PDF yok');
  const kucuk = kaynaklar[0];
  const kucukAdlar = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'kucult', 'sayfalar', 'dondur', 'ayir', 'arac-pencere', 'arac-menu', 'arac-sekme', 'not'];
  for (const ad of kucukAdlar) fs.copyFileSync(kucuk, path.join(PDF, ad + '.pdf'));
  fs.copyFileSync(kaynaklar.find((y) => /6102_TTK/i.test(y)) || kaynaklar.at(-1), path.join(PDF, 'buyuk.pdf'));

  await evalJs(`window.pdefe.cagir('test:odakla')`);
  await tus('Escape');
  await hepsiniKapat();
  await evalJs(`(() => { window.__s19Hatalar = []; addEventListener('error', (e) => window.__s19Hatalar.push('error: ' + String(e.message))); addEventListener('unhandledrejection', (e) => window.__s19Hatalar.push('unhandledrejection: ' + String(e.reason?.message || e.reason))); return true; })()`);
  await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'ciktiKlasoru', ${J(CIKTI)}); window.__pdefe.ayar().ciktiKlasoru = ${J(CIKTI)}; await window.pdefe.cagir('test:diyalogKaydi'); return true; })()`);
  if (await koyuMu()) await temaDegistir();
  // Önceki çalıştırmadan kalan durum: Son açılanları hatırla açık, liste boş, varsayılan vurgu rengi Sarı (Ayarlar'dan: seçim çubuğu
  // yeniden çizilsin)
  await evalJs(`(async () => { const a = window.__pdefe.ayar(); if (a.sonAcilanlariHatirla === false) { a.sonAcilanlariHatirla = true; await window.pdefe.cagir('ayar:koy', 'sonAcilanlariHatirla', true); } window.__pdefe.komutCalistir('dosya.sonTemizle'); return true; })()`);
  await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'notlar')`); await kosul(`!!document.querySelector('.ayar-renk[data-renk="#ffd100"]')`);
  await evalJs(`(() => { document.querySelector('.ayar-renk[data-renk="#ffd100"]').click(); document.querySelector('.ayarlar-ortusu [data-id="kapat2"]').click(); return true; })()`);
  await bekle(300);
  if ((await evalJs(`window.__pdefe.ayar().vurguRengi`)) !== '#ffd100') bilgi('varsayılan vurgu rengi Sarı yapılamadı');

  try {
    // ================================================================ (a) açılış ekranı
    await ac('a.pdf'); await ac('b.pdf'); await kapat('a.pdf'); await kapat('b.pdf');
    let d = await durum();
    // 0.1.21: sekme çubuğu hiç kapanmaz; belge kalmayınca açılış sekmesi (önceden çubuk gizleniyordu)
    sonuc('Belge yokken: sekme çubuğu görünür, tek sekme açılış sekmesi, açılış ekranı görünür', !d.cubukGizli && d.acilisGorunur && J(d.adlar) === J(['+']) && d.aktif === '+', d);

    const olc = () => evalJs(`(() => {
      const r = (e) => { if (!e) return null; const k = e.getBoundingClientRect(); return { l: Math.round(k.left * 10) / 10, t: Math.round(k.top * 10) / 10, r: Math.round(k.right * 10) / 10, b: Math.round(k.bottom * 10) / 10, w: Math.round(k.width * 10) / 10, h: Math.round(k.height * 10) / 10 }; };
      const bas = document.querySelector('#baslangic'), k = document.querySelector('.karsilama'), br = bas.getBoundingClientRect();
      const son = document.querySelector('.karsilama-son'), ip = document.querySelector('.karsilama-ac .karsilama-aciklama');
      const alanSag = br.left + bas.clientWidth;
      const bloklar = [...bas.querySelectorAll('.karsilama, .karsilama-imza, .karsilama-ac, .karsilama-araclar, .karsilama-arac, .karsilama-arac *, .karsilama-son, .karsilama-son-ust')];
      const tasan = bloklar.filter((e) => { const x = e.getBoundingClientRect(); return x.width > 0 && (x.right > alanSag + 0.5 || x.left < br.left - 0.5); }).map((e) => e.className || e.tagName).slice(0, 6);
      const kartTasan = [...document.querySelectorAll('.karsilama-arac')].filter((c) => { const ck = c.getBoundingClientRect(); return [...c.querySelectorAll('*')].some((e) => { const x = e.getBoundingClientRect(); return x.width > 0 && (x.right > ck.right + 0.5 || x.bottom > ck.bottom + 0.5); }); }).map((c) => c.dataset.eylem);
      return { gen: innerWidth, alan: { l: br.left, w: bas.clientWidth, scrollW: bas.scrollWidth }, docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        karsilama: r(k), imza: r(document.querySelector('.karsilama-imza')), eskiIpucu: !!document.querySelector('.karsilama-ipucu'), ac: r(document.querySelector('.karsilama-ac')),
        acAd: document.querySelector('.karsilama-ac-ad')?.textContent, acYazi: parseFloat(getComputedStyle(document.querySelector('.karsilama-ac-ad')).fontSize),
        aracYazi: parseFloat(getComputedStyle(document.querySelector('.karsilama-arac-ad')).fontSize),
        ipucu: r(ip), ipucuMetin: ip?.textContent.trim(), araclar: r(document.querySelector('.karsilama-araclar')), araclarBaslik: document.querySelector('.karsilama-araclar h2')?.textContent,
        kartlar: [...document.querySelectorAll('.karsilama-arac')].map((e) => ({ eylem: e.dataset.eylem, ad: e.querySelector('.karsilama-arac-ad')?.textContent, ...r(e) })),
        son: r(son), sonHidden: son.hidden, sonDisplay: getComputedStyle(son).display, sonBaslik: son.querySelector('h2')?.textContent, sonOgeler: [...son.querySelectorAll('.karsilama-oge .ad')].map((e) => e.textContent),
        gorunurMetin: bas.innerText, tasan, kartTasan };
    })()`);
    const ARACLAR_SIRA = await evalJs(`import('./aracPenceresi.js').then((m) => m.ARACLAR.map((a) => [a.komut, a.ad])).catch(() => null)`);
    const beklenenSira = ARACLAR_SIRA || [['arac.kucult', 'Sıkıştır'], ['arac.sayfalar', 'Sayfaları düzenle'], ['arac.dondurKaydet', 'Döndür'], ['arac.ayir', 'Ayır'], ['arac.gorselBirlestir', 'Görüntü / PDF birleştir']];
    if (!ARACLAR_SIRA) bilgi('ARACLAR modülü içe aktarılamadı; beklenen sıra elle yazıldı');

    for (const gen of [1280, 700]) {
      await genislikTaklit(gen);
      const o = await olc();
      const enYuksek = Math.max(...o.kartlar.map((c) => c.h)), enGenis = Math.max(...o.kartlar.map((c) => c.w)), kartAlan = Math.max(...o.kartlar.map((c) => c.w * c.h));
      sonuc(`[${gen}px] PDF aç düğmesi araç kartlarından belirgin büyük (yükseklik ≥ 1.3× en yüksek kart, alan ≥ 2.5×, en az kart kadar geniş, yazı büyük)`,
        o.acAd === 'PDF aç' && o.ac.h >= 1.3 * enYuksek && o.ac.w * o.ac.h >= 2.5 * kartAlan && o.ac.w >= enGenis && o.acYazi > o.aracYazi,
        { ac: o.ac, enYuksek, enGenis, oran: +(o.ac.h / enYuksek).toFixed(2), alanOrani: +((o.ac.w * o.ac.h) / kartAlan).toFixed(2), acYazi: o.acYazi, aracYazi: o.aracYazi });
      bilgi(`${gen}px: PDF aç ${o.ac.w}×${o.ac.h}, en büyük kart ${enGenis}×${enYuksek}`);
      // 0.1.14: sürükle-bırak bilgisi ayrı satır değil, PDF aç düğmesinin açıklamasında
      sonuc(`[${gen}px] Sürükle-bırak bilgisi PDF aç düğmesinin içinde (ayrı ipucu satırı yok)`,
        o.ipucuMetin === "Bilgisayarınızdaki bir ya da birkaç PDF'i seçin veya bu pencereye sürükleyin" && !o.eskiIpucu && o.ipucu.t >= o.ac.t && o.ipucu.b <= o.ac.b && o.ipucu.r <= o.ac.r,
        { ac: o.ac, ipucu: o.ipucu, metin: o.ipucuMetin, eskiIpucu: o.eskiIpucu });
      const sira = o.kartlar.map((c) => [c.eylem, c.ad]);
      const gorselSira = [...o.kartlar].sort((x, y) => (Math.abs(x.t - y.t) > 2 ? x.t - y.t : x.l - y.l)).map((c) => c.eylem);
      sonuc(`[${gen}px] Beş araç kartı ARACLAR sırasıyla (DOM ve görsel sıra)`, J(sira) === J(beklenenSira) && J(gorselSira) === J(beklenenSira.map((x) => x[0])) && o.araclarBaslik === 'Araçlar', { sira, gorselSira });
      sonuc(`[${gen}px] Son açılanlar kutusu görünür, iki belge listeli`, !o.sonHidden && o.sonDisplay !== 'none' && o.sonBaslik === 'Son açılanlar' && J(o.sonOgeler) === J(['b.pdf', 'a.pdf']), { sonHidden: o.sonHidden, sonDisplay: o.sonDisplay, sonOgeler: o.sonOgeler });
      // 0.1.14: tek sütun, Son açılanlar araçların altında (0.1.13'te geniş pencerede sağ sütundaydı)
      sonuc(`[${gen}px] Son açılanlar araçların altında, aynı sütunda; karşılama ortada`, o.son.t >= o.araclar.b && Math.abs(o.son.l - o.karsilama.l) < 2 && Math.abs(o.son.w - o.karsilama.w) < 2
        && Math.abs((o.karsilama.l - o.alan.l) - (o.alan.l + o.alan.w - o.karsilama.r)) < 2, { son: o.son, araclar: o.araclar, karsilama: o.karsilama, alan: o.alan });
      sonuc(`[${gen}px] Düzen taşmıyor (yatay kaydırma yok, bloklar ve kart içerikleri sığıyor)`, o.alan.scrollW <= o.alan.w && o.docScroll <= 0 && !o.tasan.length && !o.kartTasan.length, { alan: o.alan, docScroll: o.docScroll, tasan: o.tasan, kartTasan: o.kartTasan });
      await ssCdp(`a-acilis-${gen}-acik`);
      if (gen === 700) { await temaDegistir(); await ssCdp(`a-acilis-${gen}-koyu`); await temaDegistir(); }
    }
    await genislikTaklit(0);
    await ssIki('a-acilis');
    await yapiskanDenetle('açılış ekranı');

    // "Son açılanları hatırla" Ayarlar'dan gerçek tıklamayla kapatılır
    const hatirlaKarti = `[...document.querySelectorAll('.ayar-kart')].find((k) => k.querySelector('.ayar-baslik')?.textContent === 'Son açılanları hatırla')`;
    await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'acilis')`); await kosul(`!!(${hatirlaKarti})`); await bekle(300);
    await tikl(`${hatirlaKarti}.querySelector('.ayar-anahtar-govde') || ${hatirlaKarti}.querySelector('.ayar-anahtar')`); await bekle(400);
    const kapaliAyar = await evalJs(`({ ayar: window.__pdefe.ayar().sonAcilanlariHatirla, girdi: ${hatirlaKarti}.querySelector('input').checked, durum: ${hatirlaKarti}.querySelector('.ayar-anahtar-durum')?.textContent })`);
    await tikl(q('.ayarlar-ortusu [data-id="kapat2"]')); await kosul(`!document.querySelector('.ayarlar-ortusu')`, 4000); await bekle(300);
    sonuc('Ayarlar: "Son açılanları hatırla" gerçek tıklamayla kapandı', kapaliAyar.ayar === false && kapaliAyar.girdi === false, kapaliAyar);
    for (const gen of [1280, 700]) {
      await genislikTaklit(gen);
      const o = await olc();
      const bosluk = [o.karsilama.l - o.alan.l, o.alan.l + o.alan.w - o.karsilama.r];
      sonuc(`[${gen}px] Kapalıyken Son açılanlar kutusu tamamen gizli (hidden, görünür metin yok)`, o.sonHidden && o.sonDisplay === 'none' && !o.son.w && !/Son açılanlar|hatırlanmıyor/.test(o.gorunurMetin),
        { sonHidden: o.sonHidden, sonDisplay: o.sonDisplay, son: o.son, metinde: /Son açılanlar|hatırlanmıyor/.test(o.gorunurMetin) });
      sonuc(`[${gen}px] Kapalıyken içerik ortada (iki yan boşluk eşit)`, Math.abs(bosluk[0] - bosluk[1]) < 2, { bosluk, karsilama: o.karsilama });
      sonuc(`[${gen}px] Kapalıyken düzen taşmıyor`, o.alan.scrollW <= o.alan.w && o.docScroll <= 0 && !o.tasan.length && !o.kartTasan.length, { alan: o.alan, tasan: o.tasan, kartTasan: o.kartTasan });
      await ssCdp(`a-son-kapali-${gen}-acik`);
    }
    await genislikTaklit(0);
    await ssIki('a-son-kapali');
    const menuKapali = (await evalJs(`window.pdefe.cagir('test:menu')`))?.find((m) => m.etiket === '&Dosya')?.alt?.some((o) => o?.etiket === 'Son açılanlar');
    bilgi(`hatırla kapalıyken Dosya menüsünde "Son açılanlar": ${menuKapali ? 'var' : 'yok'}`);

    // Yeniden açılır: kutu geri gelir
    await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'acilis')`); await kosul(`!!(${hatirlaKarti})`); await bekle(300);
    await tikl(`${hatirlaKarti}.querySelector('.ayar-anahtar-govde') || ${hatirlaKarti}.querySelector('.ayar-anahtar')`); await bekle(400);
    const acikAyar = await evalJs(`window.__pdefe.ayar().sonAcilanlariHatirla`);
    await tikl(q('.ayarlar-ortusu [data-id="kapat2"]')); await kosul(`!document.querySelector('.ayarlar-ortusu')`, 4000); await bekle(300);
    {
      const o = await olc();
      sonuc('Yeniden açılınca Son açılanlar kutusu geri gelir (liste kapanırken silindiği için boş satır)', acikAyar === true && !o.sonHidden && o.sonDisplay !== 'none' && o.son.w > 0 && o.son.t >= o.araclar.b && /Henüz açılan belge yok/.test(o.gorunurMetin),
        { acikAyar, sonHidden: o.sonHidden, son: o.son });
    }

    // Son açılanlar listesi (b için): a, b, c, d, e açılıp kapanır → listede
    for (const ad of ['e.pdf']) { await ac(ad); await kapat(ad); }

    // ================================================================ (b) yeni sekme
    await ac('a.pdf'); await ac('b.pdf');
    sonuc('b.pdf kirletildi (Kaydet etkin)', (await kirlet('b.pdf')) && !(await evalJs(`document.querySelector('#arac-cubugu [data-komut="dosya.kaydet"]').disabled`)));
    const artiKonum = await evalJs(`(() => { const s = window.__pdefe.sekmeler.sekmeler.at(-1).el.getBoundingClientRect(), p = document.querySelector('#sekme-yeni').getBoundingClientRect(), sonraki = document.querySelector('#sekme-sonraki').getBoundingClientRect();
      return { sekmeSag: s.right, artiSol: p.left, artiSag: p.right, dikeyOrtak: Math.min(s.bottom, p.bottom) - Math.max(s.top, p.top), sonrakiSol: sonraki.left, baslik: document.querySelector('#sekme-yeni').title, komut: document.querySelector('#sekme-yeni').dataset.komut }; })()`);
    sonuc('+ düğmesi son sekmenin hemen sağında (0–6 px), aynı satırda, ◀ ▶ öncesinde; "Yeni sekme (Ctrl+T)"', artiKonum.artiSol - artiKonum.sekmeSag >= 0 && artiKonum.artiSol - artiKonum.sekmeSag <= 6 && artiKonum.dikeyOrtak > 10 && artiKonum.artiSag <= artiKonum.sonrakiSol && artiKonum.baslik === 'Yeni sekme (Ctrl+T)' && artiKonum.komut === 'sekme.yeni', artiKonum);
    const baslikB = pencereBasligi();
    await tikl(q('#sekme-yeni')); await bekle(500);
    d = await durum();
    const arac1 = await evalJs(`({ sayfaKutusu: document.querySelector('#sayfa-kutusu').value, toplam: document.querySelector('#sayfa-toplam').textContent, kaydet: document.querySelector('#arac-cubugu [data-komut="dosya.kaydet"]').disabled,
      sinif: window.__pdefe.sekmeler.sekmeler.at(-1).el.className, sekmeAd: window.__pdefe.sekmeler.sekmeler.at(-1).el.querySelector('.ad').textContent, ipucu: window.__pdefe.sekmeler.sekmeler.at(-1).el.title })`);
    sonuc('+ tıklanınca "Yeni sekme" açılır ve etkin olur, açılış ekranı görünür, belge görünümleri gizli',
      J(d.adlar) === J(['a.pdf', 'b.pdf', '+']) && d.aktif === '+' && d.belge === null && d.acilisGorunur && d.gorunurBelgeler === 0 && arac1.sekmeAd === 'Yeni sekme' && /baslangic-sekmesi/.test(arac1.sinif) && /aktif/.test(arac1.sinif), { d, arac1 });
    sonuc('Açılış sekmesinde araç çubuğu belgesiz: sayfa kutusu boş, "/ 0", Kaydet devre dışı', arac1.sayfaKutusu === '' && arac1.toplam === '/ 0' && arac1.kaydet === true, arac1);
    const baslikY = pencereBasligi();
    if (baslikY == null) bilgi('S19_PID / S19_MASAUSTU verilmedi: pencere başlığı denetlenmedi');
    else sonuc('Pencere başlığı sade: "PDEfe" (belge sekmesinde "b.pdf — PDEfe" idi)', baslikY === 'PDEfe' && baslikB === 'b.pdf — PDEfe', { once: baslikB, sonra: baslikY });
    await ssIki('b-yeni-sekme');
    await yapiskanDenetle('açılış sekmesi');

    // Belge sekmesine dönüş ve geri
    await tikl(`window.__pdefe.sekmeler.sekmeler.find((s) => s.ad === 'a.pdf').el.querySelector('.ad')`); await bekle(400);
    d = await durum();
    const arac2 = await evalJs(`({ sayfaKutusu: document.querySelector('#sayfa-kutusu').value, toplam: document.querySelector('#sayfa-toplam').textContent })`);
    const baslikA = pencereBasligi();
    sonuc('Belge sekmesine dönülünce araç çubuğu belgeyi gösterir, açılış ekranı gizlenir', d.aktif === 'a.pdf' && d.belge === 'a.pdf' && !d.acilisGorunur && arac2.sayfaKutusu === '1' && arac2.toplam !== '/ 0' && (baslikA == null || baslikA === 'a.pdf — PDEfe'), { d, arac2, baslikA });
    await tikl(`window.__pdefe.sekmeler.sekmeler.find((s) => s.baslangic).el.querySelector('.ad')`); await bekle(400);
    sonuc('Açılış sekmesine tıklayınca yine açılış ekranı', (await durum()).aktif === '+' && (await durum()).acilisGorunur);

    // Birden çok açılış sekmesi: Ctrl+T (menü hızlandırıcısı) açılış sekmesindeyken
    await menuTus('T', ['control']);
    d = await durum();
    sonuc('Ctrl+T (menü kısayolu) açılış sekmesindeyken ikinci "Yeni sekme" açar, o etkin', J(d.adlar) === J(['a.pdf', 'b.pdf', '+', '+']) && d.aktifId === d.idler[3] && d.idler[2] !== d.idler[3] && d.acilisGorunur, d);
    await ss('b-iki-acilis-sekmesi-acik');
    // × ile kapat (etkin olan ikinci)
    const ikinciId = d.idler[3], birinciId = d.idler[2];
    await tikl(`window.__pdefe.sekmeler.bul(${J(ikinciId)}).el.querySelector('.kapat')`); await bekle(400);
    d = await durum();
    sonuc('Açılış sekmesi × ile kapanır; önceki açılış sekmesi etkin olur', J(d.adlar) === J(['a.pdf', 'b.pdf', '+']) && d.aktifId === birinciId && d.acilisGorunur, d);

    // Sağ tık menüsü
    await kayit();
    await sagTikl(`window.__pdefe.sekmeler.bul(${J(birinciId)}).el.querySelector('.ad')`); await bekle(400);
    const menuY = (await kayit()).filter((k) => k.kanal === 'menu:popup').at(-1)?.secenek || [];
    await sagTikl(`window.__pdefe.sekmeler.sekmeler.find((s) => s.ad === 'a.pdf').el.querySelector('.ad')`); await bekle(400);
    const menuA = (await kayit()).filter((k) => k.kanal === 'menu:popup').at(-1)?.secenek || [];
    const ogeDurum = (m) => Object.fromEntries(m.filter((o) => o.id).map((o) => [o.id, o.devre ? 'devre' : 'etkin']));
    // 0.1.19: Pencereye ayır (açılış sekmesinde devre dışı; belge sekmesinde, pencerede başka sekme varken etkin)
    sonuc('Açılış sekmesinde sağ tık: Klasörde göster / Yolu kopyala / Pencereye ayır devre dışı, Kapat ve Diğerlerini kapat etkin', J(ogeDurum(menuY)) === J({ kapat: 'etkin', digerleri: 'etkin', sagdakiler: 'devre', ayir: 'devre', klasor: 'devre', yol: 'devre', pdf: 'devre' }) && menuY.find((o) => o.id === 'klasor')?.etiket === 'Klasörde göster' && menuY.find((o) => o.id === 'yol')?.etiket === 'Yolu kopyala', menuY);
    sonuc('Belge sekmesinde sağ tık: Klasörde göster / Yolu kopyala / Pencereye ayır etkin', ogeDurum(menuA).klasor === 'etkin' && ogeDurum(menuA).yol === 'etkin' && ogeDurum(menuA).ayir === 'etkin', menuA);
    // Sağ tık menüsünden Kapat (açılış sekmesi) — test yanıtıyla; sonra yeniden aç
    await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'menu:popup', ['kapat'])`);
    await sagTikl(`window.__pdefe.sekmeler.bul(${J(birinciId)}).el.querySelector('.ad')`); await bekle(500);
    d = await durum();
    sonuc('Sağ tık › Kapat açılış sekmesini kapatır (belgelere dokunmaz)', J(d.adlar) === J(['a.pdf', 'b.pdf']) && d.belge !== null, d);
    await tikl(q('#sekme-yeni')); await bekle(400);

    // Açık belgeler listesi
    await tikl(`window.__pdefe.sekmeler.sekmeler.find((s) => s.ad === 'a.pdf').el.querySelector('.ad')`); await bekle(300);
    await tikl(q('#sekme-acilir')); await bekle(300);
    const liste1 = await evalJs(`[...document.querySelectorAll('#belge-listesi li')].map((li) => [li.querySelector('.ad').textContent, li.querySelector('.yol').textContent, li.classList.contains('aktif')])`);
    sonuc('Açık belgeler listesinde açılış sekmesi ("Yeni sekme", yolsuz) da var', liste1.length === 3 && J(liste1[2]) === J(['Yeni sekme', '', false]) && liste1[1][0] === '• b.pdf', liste1);
    await yaz('ticaret'); await bekle(400);
    await kosul(`[...document.querySelectorAll('#belge-listesi li .rozet')].every((r) => !r.hidden && /eşleşme$/.test(r.textContent))`, 12000);
    const liste2 = await evalJs(`[...document.querySelectorAll('#belge-listesi li')].map((li) => [li.querySelector('.ad').textContent, li.querySelector('.rozet').textContent])`);
    sonuc('Listede arama açılış sekmesiyle hatasız (Yeni sekme "0 eşleşme")', liste2.length === 3 && liste2.some((x) => x[0] === 'Yeni sekme' && x[1] === '0 eşleşme') && liste2.every((x) => /eşleşme$/.test(x[1])), liste2);
    await tus('Escape'); await bekle(200);
    await tikl(q('#sekme-acilir')); await bekle(300);
    await tikl(`[...document.querySelectorAll('#belge-listesi li')].find((li) => li.querySelector('.ad').textContent === 'Yeni sekme')`); await bekle(400);
    d = await durum();
    sonuc('Listede "Yeni sekme" satırı seçilince açılış sekmesine geçilir', d.aktif === '+' && d.acilisGorunur && (await evalJs(`document.querySelector('#belge-listesi').hidden`)), d);

    // Ctrl+Tab seçicisi (Ctrl basılı: Tab, →, bırak)
    await odakla();
    const mru0 = await evalJs(`window.__pdefe.sekmeler.mru.map((id) => { const s = window.__pdefe.sekmeler.bul(id); return s.baslangic ? '+' : s.ad; })`);
    await tusOlaylari([{ type: 'keyDown', keyCode: 'Control', modifiers: ['control'] }, { type: 'keyDown', keyCode: 'Tab', modifiers: ['control'] }, { type: 'keyUp', keyCode: 'Tab', modifiers: ['control'] }]);
    await bekle(450);
    const secici = () => evalJs(`({ acik: window.__pdefe.sekmeler.seciciAcik, gorunur: !document.querySelector('#sekme-secici').hidden, adaylar: [...document.querySelectorAll('#sekme-secici .aday')].map((a) => a.querySelector('.ad').textContent),
      secili: [...document.querySelectorAll('#sekme-secici .aday')].findIndex((a) => a.classList.contains('secili')), resimsiz: [...document.querySelectorAll('#sekme-secici .aday')].filter((a) => a.querySelector('.bos')).map((a) => a.querySelector('.ad').textContent) })`);
    const s1 = await secici();
    await ss('b-ctrl-tab-secici-acik');
    await tusOlaylari([{ type: 'keyDown', keyCode: 'Right', modifiers: ['control'] }, { type: 'keyUp', keyCode: 'Right', modifiers: ['control'] }]); await bekle(200);
    const s2 = await secici();
    await tusOlaylari([{ type: 'keyUp', keyCode: 'Control', modifiers: [] }]); await bekle(500);
    d = await durum();
    const beklenenAdaylar = mru0.map((x) => (x === '+' ? 'Yeni sekme' : x));
    sonuc('Ctrl+Tab seçicisi açılış sekmesiyle açılır (MRU sırası, açılış sekmesi küçük resimsiz)', s1.acik && s1.gorunur && J(s1.adaylar) === J(beklenenAdaylar) && s1.secili === 1 && s1.resimsiz.includes('Yeni sekme'), { s1, mru0 });
    sonuc('Seçicide → sonraki adaya geçer; Ctrl bırakılınca o sekme seçilir', s2.secili === 2 && !(await evalJs(`window.__pdefe.sekmeler.seciciAcik`)) && d.aktif === mru0[2], { s2, d, mru0 });
    // Esc ile vazgeç
    const onceAktif = d.aktifId;
    await odakla();
    await tusOlaylari([{ type: 'keyDown', keyCode: 'Control', modifiers: ['control'] }, { type: 'keyDown', keyCode: 'Tab', modifiers: ['control'] }, { type: 'keyUp', keyCode: 'Tab', modifiers: ['control'] },
      { type: 'keyDown', keyCode: 'Escape', modifiers: ['control'] }, { type: 'keyUp', keyCode: 'Escape', modifiers: ['control'] }, { type: 'keyUp', keyCode: 'Control', modifiers: [] }]);
    await bekle(400);
    sonuc('Seçicide Esc: sekme değişmeden kapanır', (await durum()).aktifId === onceAktif && !(await evalJs(`window.__pdefe.sekmeler.seciciAcik`)));
    // Ctrl+PageDown / Ctrl+→ açılış sekmesini de gezer (sayfada işlenir; CDP tuşu)
    await evalJs(`window.__pdefe.sekmeSec(window.__pdefe.sekmeler.sekmeler[0].id)`); await bekle(300);
    const gezinti = [];
    for (let i = 0; i < 3; i++) { await tus('PageDown', ['ctrl']); await bekle(250); gezinti.push((await durum()).aktif); }
    await tus('ArrowLeft', ['ctrl']); await bekle(250); gezinti.push((await durum()).aktif);
    sonuc('Ctrl+PageDown açılış sekmesine de geçer, uçta durur; Ctrl+← geri döner', J(gezinti) === J(['b.pdf', '+', '+', 'b.pdf']), gezinti);

    // Açılış sekmesinden açılan belge onun yerini alır: arkaplanda açılan d sona eklenir → [a, b, +, d]
    const artiId = (await durum()).idler[2];
    await evalJs(`window.__pdefe.sekmeSec(${J(artiId)})`); await bekle(300);
    await ac('d.pdf', { arkaPlanda: true });
    d = await durum();
    sonuc('Açılış sekmesindeyken arka planda açılan belge sona eklenir, açılış sekmesi etkin kalır', J(d.adlar) === J(['a.pdf', 'b.pdf', '+', 'd.pdf']) && d.aktif === '+', d);
    await kayit();
    await acYaniti(path.join(PDF, 'c.pdf'));
    await tikl(q('.karsilama-ac')); await kosul(`window.__pdefe.aktif()?.ad === 'c.pdf'`, 8000); await bekle(500);
    d = await durum();
    const kayitC = (await kayit()).filter((k) => k.kanal === 'dosya:acDiyalog');
    sonuc('Açılış sekmesinde PDF aç (Aç penceresi) → belge açılış sekmesinin yerini alır (aynı sıra)', J(d.adlar) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']) && d.aktif === 'c.pdf' && !d.acilisGorunur && kayitC.length === 1, { d, kayitC });
    sonuc('Açılış sekmesi kimliği kalmadı (sekme listesinde açılış sekmesi yok)', !d.idler.includes(artiId), d.idler);
    // Son açılanlardan tıklama (e.pdf açık değil)
    await menuTus('T', ['control']);
    d = await durum();
    sonuc('Ctrl+T belge sekmesindeyken sona "Yeni sekme" ekler', J(d.adlar) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', '+']) && d.aktif === '+', d);
    const eYol = path.join(PDF, 'e.pdf');
    const sonListe = await evalJs(`[...document.querySelectorAll('#son-dosyalar .karsilama-oge')].map((e) => e.title)`);
    await tikl(`[...document.querySelectorAll('#son-dosyalar .karsilama-oge')].find((e) => e.title === ${J(eYol)})`);
    await kosul(`window.__pdefe.aktif()?.ad === 'e.pdf'`, 8000); await bekle(500);
    d = await durum();
    sonuc('Açılış sekmesinde Son açılanlar satırına tıklama → belge sekmenin yerini alır', sonListe.includes(eYol) && J(d.adlar) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf']) && d.aktif === 'e.pdf', { d, sonListe });
    // Ortadaki açılış sekmesi: [.., e, +, f] → dosyaAc(g) → [.., e, g, f]  (sürükle-bırak da dosyaAc'ı çağırır)
    await menuTus('T', ['control']);
    await ac('f.pdf', { arkaPlanda: true });
    d = await durum();
    const oncekiSira = d.adlar;
    await ac('g.pdf');
    d = await durum();
    sonuc('Ortadaki açılış sekmesinden dosyaAc (sürükle-bırak yolu) → aynı konumda belge', J(oncekiSira) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf', '+', 'f.pdf']) && J(d.adlar) === J(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf', 'g.pdf', 'f.pdf']) && d.aktif === 'g.pdf', { oncekiSira, sonra: d.adlar });
    // Zaten açık dosya: o sekmeye geçilir, açılış sekmesi kapanır
    await menuTus('T', ['control']);
    await ac('a.pdf');
    d = await durum();
    sonuc('Açılış sekmesinden zaten açık dosya (dosyaAc) → o sekmeye geçilir, açılış sekmesi kapanır', d.aktif === 'a.pdf' && !d.adlar.includes('+') && d.adlar.length === 7, d);
    await menuTus('T', ['control']);
    const cYol = path.join(PDF, 'c.pdf');
    await tikl(`[...document.querySelectorAll('#son-dosyalar .karsilama-oge')].find((e) => e.title === ${J(cYol)})`); await bekle(600);
    d = await durum();
    sonuc('Açılış sekmesinde Son açılanlardan zaten açık dosya → o sekmeye geçilir, açılış sekmesi kapanır', d.aktif === 'c.pdf' && !d.adlar.includes('+') && d.adlar.length === 7, d);
    await menuTus('T', ['control']);
    await kayit(); await acYaniti(path.join(PDF, 'd.pdf'));
    await tikl(q('.karsilama-ac')); await bekle(700);
    d = await durum();
    sonuc('Açılış sekmesinde PDF aç ile zaten açık dosya → o sekmeye geçilir, açılış sekmesi kapanır', d.aktif === 'd.pdf' && !d.adlar.includes('+') && d.adlar.length === 7, d);
    // Ctrl+W (menü) açılış sekmesini kapatır
    await menuTus('T', ['control']);
    const onceW = await durum();
    await menuTus('W', ['control']);
    d = await durum();
    sonuc('Ctrl+W (menü kısayolu) açılış sekmesini kapatır, önceki sekmeye dönülür', onceW.aktif === '+' && !d.adlar.includes('+') && d.adlar.length === 7 && d.aktif === 'd.pdf', { onceW, d });
    // Son belge kapanınca açılış sekmeleri kalır (0.1.22, kullanıcı isteği; 0.1.21'de teke iniyordu, önceden hepsi kalkıyor, sekme çubuğu
    // gizleniyordu)
    await menuTus('T', ['control']);
    await menuTus('T', ['control']);
    for (const ad of ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf', 'f.pdf']) await kapat(ad);
    d = await durum();
    sonuc('Bir belge kalmışken açılış sekmeleri duruyor', J(d.adlar) === J(['g.pdf', '+', '+']), d);
    const etkinArti = d.aktifId;
    await kapat('g.pdf'); await bekle(300);
    d = await durum();
    const baslikBos = pencereBasligi();
    sonuc('Son belge kapanınca açılış sekmeleri kalır: sekme çubuğu görünür, etkin olan değişmez, açılış ekranı', J(d.adlar) === J(['+', '+']) && d.aktifId === etkinArti && !d.cubukGizli && d.acilisGorunur && d.aktif === '+' && d.belge === null && (baslikBos == null || baslikBos === 'PDEfe'), { d, baslikBos });
    await menuTus('T', ['control']);
    d = await durum();
    sonuc('Belge yokken Ctrl+T (menü kısayolu) yeni açılış sekmesi açar, o etkin', J(d.adlar) === J(['+', '+', '+']) && d.aktifId === d.idler[2] && !d.idler.slice(0, 2).includes(d.aktifId) && !d.cubukGizli && d.acilisGorunur, d);
    await menuTus('W', ['control']); await menuTus('W', ['control']);
    d = await durum();
    sonuc('Belge yokken Ctrl+W açılış sekmelerini birer birer kapatır, pencere açık kalır, tek açılış sekmesi', J(d.adlar) === J(['+']) && !d.cubukGizli && d.acilisGorunur, d);

    // Sekmeler sığmayınca: + sağda sabit (▶ öncesi), liste kayar, etkin açılış sekmesi görünür
    for (const ad of kucukAdlar) await evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ad + '.pdf'))}).then(() => true)`);
    await bekle(800); await menuTus('T', ['control']);
    const cok = await evalJs(`(() => { const l = document.querySelector('#sekme-liste'), r = (e) => { const k = e.getBoundingClientRect(); return [k.left, k.right]; };
      return { sekme: window.__pdefe.sekmeler.sekmeler.length, tasiyor: l.scrollWidth > l.clientWidth, liste: r(l), arti: r(document.querySelector('#sekme-yeni')), sonraki: r(document.querySelector('#sekme-sonraki')),
        aktif: r(window.__pdefe.sekmeler.bul(window.__pdefe.sekmeler.aktifId).el), aktifAcilis: !!window.__pdefe.sekmeler.bul(window.__pdefe.sekmeler.aktifId)?.baslangic }; })()`);
    sonuc('Sekmeler sığmayınca + sağda sabit (listenin hemen sağı, ▶ öncesi), liste kayar, etkin açılış sekmesi görünür', cok.tasiyor && cok.aktifAcilis && cok.arti[0] >= cok.liste[1] - 0.5 && cok.arti[0] - cok.liste[1] <= 6 && cok.arti[1] <= cok.sonraki[0] + 0.5 && cok.aktif[0] >= cok.liste[0] - 0.5 && cok.aktif[1] <= cok.liste[1] + 0.5, cok);
    await ss('b-cok-sekme-acik');
    await hepsiniKapat(); await bekle(300);

    // Pencere kapatma (0.1.12 kuralı): değişikliği olmayan sekmeler soru açılmadan kapanır, yalnızca sorulacak belgeler kalır. Açılış
    // sekmesinde kaydedilecek bir şey yok: o da kapanmalı
    await ac('a.pdf'); await ac('b.pdf'); await kirlet('b.pdf');
    await menuTus('T', ['control']);
    const onceKapat = (await durum()).adlar;
    await evalJs(`window.pdefe.cagir('test:olayGonder', 'pencere:kapatIstegi')`);
    await kosul(`!!document.querySelector('.mesaj-kutusu')`, 6000); await bekle(300);
    d = await durum();
    const soruK = await evalJs(`document.querySelector('.mesaj-kutusu .mesaj-ileti')?.textContent`);
    sonuc('Pencere kapatma: soru "b.pdf" için; değişmeyen a.pdf soru öncesi kapandı', soruK === '"b.pdf" belgesinde kaydedilmemiş değişiklikler var.' && !d.adlar.includes('a.pdf'), { onceKapat, sonra: d.adlar, soruK });
    sonuc('Pencere kapatma: açılış sekmesi de değişmeyen sekme gibi soru öncesi kapanır (yalnızca sorulacak belge kalır)', J(d.adlar) === J(['b.pdf']), { onceKapat, sonra: d.adlar });
    await tikl(`[...document.querySelectorAll('.mesaj-kutusu .dugmeler button')].find((b) => b.textContent === 'Vazgeç')`); await bekle(400);
    d = await durum();
    sonuc('Pencere kapatma sorusunda Vazgeç: uygulama açık, değişen belge duruyor', d.adlar.includes('b.pdf') && !(await evalJs(`!!document.querySelector('.mesaj-kutusu')`)), d);
    await hepsiniKapat(); await bekle(300);

    // ================================================================ (c) belgesiz araç akışı
    const ARAC = {
      'arac.kucult': { ad: 'Sıkıştır', sinif: 'kucult-pencere', dosya: 'kucult.pdf' },
      'arac.sayfalar': { ad: 'Sayfaları düzenle', sinif: 'sayfalar-pencere', dosya: 'sayfalar.pdf' },
      'arac.dondurKaydet': { ad: 'Döndür', sinif: 'dondur-pencere', dosya: 'dondur.pdf' },
      'arac.ayir': { ad: 'Ayır', sinif: 'ayir-pencere', dosya: 'ayir.pdf' },
    };
    const pencereBilgi = () => evalJs(`(() => { const p = document.querySelector('.arac-pencere'); if (!p) return null; const dg = p.querySelector('.arac-dugmeler');
      return { sinif: p.className, baslik: p.querySelector('.arac-baslik-metin')?.textContent, metin: p.innerText + ' ' + [...p.querySelectorAll('input')].map((i) => i.value).join(' '),
        altMetin: !!p.querySelector('.arac-alt-metin'), solMetin: p.querySelector('.arac-dugmeler-sol')?.innerText.trim(), dugmelerMetin: dg?.innerText.replace(/\\s+/g, ' ').trim(),
        bolumBasliklari: [...p.querySelectorAll('.arac-bolum-baslik')].map((e) => e.textContent.trim()), pdfEkle: p.querySelector('[data-komut="pdfEkle"]')?.textContent }; })()`);
    const aracKapat = async () => {
      await tikl(q('.arac-ortusu .arac-kapat')); await bekle(400);
      if (await evalJs(`!!document.querySelector('.mesaj-kutusu')`)) { bilgi('araç kapatılırken soru: ' + J(await evalJs(`document.querySelector('.mesaj-kutusu').innerText`))); await tus('Escape'); }
      await kosul(`!document.querySelector('.arac-ortusu')`, 8000); await bekle(300);
    };
    const ipucuYok = (p) => !p.altMetin && !/Tıkla|Delete|sürükle|Ctrl|Shift|·/.test(p.dugmelerMetin || '') && !/Tıkla|Delete|·/.test(p.solMetin || '');
    const aracSonucu = async (komut, yer, dosya) => {
      const a = ARAC[komut];
      const acildi = await kosul(`!!document.querySelector('.arac-pencere.${a.sinif}')`, 15000);
      await bekle(900);
      const dd = await durum(), p = await pencereBilgi(), kk = (await kayit()).filter((k) => k.kanal === 'dosya:acDiyalog');
      const govde = dosya.replace(/\.pdf$/, '');
      return { acildi, dd, p, kk, govde, ok: !!acildi && dd.belge === dosya && p?.metin.includes(govde) && kk.length === 1 && kk[0].secenek?.coklu === false && kk[0].secenek?.baslik === `${a.ad}: PDF seçin` };
    };

    // Açılış ekranı kartları
    for (const [komut, a] of Object.entries(ARAC)) {
      await kayit();
      await tikl(q(`.karsilama-arac[data-eylem="${komut}"]`)); await bekle(800);
      const kk = (await kayit()).filter((k) => k.kanal === 'dosya:acDiyalog');
      const bos = { pencere: await evalJs(`!!document.querySelector('.arac-ortusu')`), belge: await evalJs(`window.__pdefe.belgeler.size`), d: await durum() };
      sonuc(`Açılış kartı "${a.ad}", belge yok → Aç penceresi ("${a.ad}: PDF seçin", tek dosya); vazgeçilince hiçbir şey açılmaz`,
        kk.length === 1 && kk[0].secenek?.baslik === `${a.ad}: PDF seçin` && kk[0].secenek?.coklu === false && J(kk[0].yanit) === '[]' && !bos.pencere && bos.belge === 0 && J(bos.d.adlar) === J(['+']) && bos.d.acilisGorunur, { kk, bos });
      await acYaniti(path.join(PDF, a.dosya));
      await tikl(q(`.karsilama-arac[data-eylem="${komut}"]`));
      const r = await aracSonucu(komut, 'kart', a.dosya);
      sonuc(`Açılış kartı "${a.ad}" → seçilen PDF açılır, araç o belgeyle açılır`, r.ok && J(r.dd.adlar) === J([a.dosya]), { acildi: r.acildi, d: r.dd, baslik: r.p?.baslik, kk: r.kk, metindeAd: r.p?.metin.includes(r.govde) });
      if (r.p) {
        sonuc(`"${a.ad}" penceresinin alt şeridinde ipucu metni yok`, ipucuYok(r.p), { dugmeler: r.p.dugmelerMetin, sol: r.p.solMetin, altMetin: r.p.altMetin });
        sonuc(`"${a.ad}" bölüm başlığı "Kaydet" (Kaydetme yok)`, r.p.bolumBasliklari.includes('Kaydet') && !r.p.bolumBasliklari.includes('Kaydetme'), r.p.bolumBasliklari);
        if (komut === 'arac.sayfalar') sonuc('Sayfaları düzenle: "PDF ekle" düğmesi (eski "PDF\'ten sayfa ekle" yok)', r.p.pdfEkle === 'PDF ekle' && !/PDF'ten sayfa ekle/.test(r.p.metin), r.p.pdfEkle);
        if (komut === 'arac.sayfalar') await ssIki('c-sayfalari-duzenle');
        if (komut === 'arac.kucult') await ss('c-kucult-acik');
        await yapiskanDenetle(a.ad + ' penceresi');
        await aracKapat();
      }
      await hepsiniKapat(); await bekle(300);
    }

    // Araçlar penceresi (belge yok)
    await tikl(q('#dugme-araclar')); await kosul(`!document.querySelector('.araclar-penceresi').hidden`, 3000); await bekle(300);
    const karolar = await evalJs(`(() => { const p = document.querySelector('.araclar-penceresi'); return { karolar: [...p.querySelectorAll('.araclar-karo')].map((k) => ({ komut: k.dataset.aracKomut, ariaDisabled: k.getAttribute('aria-disabled'), disabled: k.disabled, opaklik: getComputedStyle(k).opacity, tabIndex: k.tabIndex, title: k.title })), not: !!p.querySelector('.araclar-not'), metin: p.innerText }; })()`);
    sonuc('Araçlar penceresi belge yokken: beş karo, hiçbiri soluk / aria-disabled değil, "önce bir PDF açın" notu yok',
      karolar.karolar.length === 5 && karolar.karolar.every((k) => k.ariaDisabled !== 'true' && !k.disabled && +k.opaklik === 1 && k.tabIndex === 0 && k.title && !/önce bir PDF/.test(k.title)) && !karolar.not && !/önce bir PDF/i.test(karolar.metin), karolar);
    await ssIki('c-araclar-penceresi-belgesiz');
    if (await evalJs(`document.querySelector('.araclar-penceresi').hidden`)) { await tikl(q('#dugme-araclar')); await bekle(300); }
    await kayit();
    await tikl(q('.araclar-karo[data-arac-komut="arac.ayir"]')); await bekle(800);
    let kk = (await kayit()).filter((k) => k.kanal === 'dosya:acDiyalog');
    sonuc('Araçlar penceresi › Ayır, belge yok → Aç penceresi; vazgeçilince hiçbir şey açılmaz, Araçlar penceresi kapanır',
      kk.length === 1 && kk[0].secenek?.baslik === 'Ayır: PDF seçin' && !(await evalJs(`!!document.querySelector('.arac-ortusu')`)) && (await evalJs(`window.__pdefe.belgeler.size`)) === 0 && (await evalJs(`document.querySelector('.araclar-penceresi').hidden`)), kk);
    await tikl(q('#dugme-araclar')); await kosul(`!document.querySelector('.araclar-penceresi').hidden`, 3000); await bekle(300);
    await acYaniti(path.join(PDF, 'arac-pencere.pdf'));
    await tikl(q('.araclar-karo[data-arac-komut="arac.dondurKaydet"]'));
    let r = await aracSonucu('arac.dondurKaydet', 'pencere', 'arac-pencere.pdf');
    sonuc('Araçlar penceresi › Döndür → Aç penceresi → PDF açılır → araç o belgeyle açılır', r.ok, { acildi: r.acildi, d: r.dd, kk: r.kk });
    if (r.p) await aracKapat();
    await hepsiniKapat(); await bekle(300);

    // Araçlar menüsü (fareyle seçilen menü komutu)
    const menu = await evalJs(`window.pdefe.cagir('test:menu')`);
    const aracMenu = menu.find((m) => /Araçlar/.test(m.etiket))?.alt || [];
    bilgi('Araçlar menüsü: ' + J(aracMenu));
    await kayit();
    await evalJs(`window.pdefe.cagir('test:olayGonder', 'menu:komut', 'arac.kucult')`); await bekle(800);
    kk = (await kayit()).filter((k) => k.kanal === 'dosya:acDiyalog');
    sonuc('Araçlar menüsü › Sıkıştır, belge yok → Aç penceresi; vazgeçilince hiçbir şey açılmaz', kk.length === 1 && kk[0].secenek?.baslik === 'Sıkıştır: PDF seçin' && kk[0].secenek?.coklu === false && !(await evalJs(`!!document.querySelector('.arac-ortusu')`)) && (await evalJs(`window.__pdefe.belgeler.size`)) === 0, kk);
    await acYaniti(path.join(PDF, 'arac-menu.pdf'));
    await evalJs(`window.pdefe.cagir('test:olayGonder', 'menu:komut', 'arac.sayfalar')`);
    r = await aracSonucu('arac.sayfalar', 'menu', 'arac-menu.pdf');
    sonuc('Araçlar menüsü › Sayfaları düzenle → Aç penceresi → PDF açılır → araç o belgeyle açılır', r.ok, { acildi: r.acildi, d: r.dd, kk: r.kk, baslik: r.p?.baslik });
    if (r.p) await aracKapat();

    // Açılış sekmesinde (belge açık, açılış sekmesi etkin)
    await menuTus('T', ['control']);
    d = await durum();
    await kayit();
    await tikl(q('.karsilama-arac[data-eylem="arac.kucult"]')); await bekle(800);
    kk = (await kayit()).filter((k) => k.kanal === 'dosya:acDiyalog');
    const d2 = await durum();
    sonuc('Açılış sekmesinde belge gerektiren araç → Aç penceresi; vazgeçilince açılış sekmesi yerinde, araç açılmaz',
      J(d.adlar) === J(['arac-menu.pdf', '+']) && kk.length === 1 && kk[0].secenek?.baslik === 'Sıkıştır: PDF seçin' && J(d2.adlar) === J(['arac-menu.pdf', '+']) && d2.aktif === '+' && !(await evalJs(`!!document.querySelector('.arac-ortusu')`)), { d, d2, kk });
    await acYaniti(path.join(PDF, 'arac-sekme.pdf'));
    await tikl(q('.karsilama-arac[data-eylem="arac.ayir"]'));
    r = await aracSonucu('arac.ayir', 'sekme', 'arac-sekme.pdf');
    sonuc('Açılış sekmesinde Ayır → seçilen PDF açılış sekmesinin yerine açılır, araç o belgeyle açılır', r.ok && J(r.dd.adlar) === J(['arac-menu.pdf', 'arac-sekme.pdf']), { d: r.dd, kk: r.kk });
    if (r.p) await aracKapat();
    // Açılış sekmesinde zaten açık dosya seçilirse: o sekmeye geçilir, araç o belgeyle açılır
    await menuTus('T', ['control']);
    await kayit(); await acYaniti(path.join(PDF, 'arac-menu.pdf'));
    await tikl(q('.karsilama-arac[data-eylem="arac.dondurKaydet"]'));
    r = await aracSonucu('arac.dondurKaydet', 'sekme2', 'arac-menu.pdf');
    sonuc('Açılış sekmesinde araç + zaten açık dosya → o sekmeye geçilir, açılış sekmesi kapanır, araç o belgeyle açılır', r.ok && J(r.dd.adlar) === J(['arac-menu.pdf', 'arac-sekme.pdf']), { d: r.dd, kk: r.kk });
    if (r.p) await aracKapat();
    await hepsiniKapat(); await bekle(300);

    // Görüntü / PDF birleştir: belge gerektirmez, Aç penceresi olmadan açılır
    await kayit();
    await tikl(q('.karsilama-arac[data-eylem="arac.gorselBirlestir"]'));
    const birlestirAcildi = await kosul(`!!document.querySelector('.arac-pencere.birlestir-pencere')`, 8000); await bekle(700);
    kk = (await kayit()).filter((k) => k.kanal === 'dosya:acDiyalog');
    const pb = await pencereBilgi();
    sonuc('Görüntü / PDF birleştir kartı: Aç penceresi olmadan araç açılır, belge açılmaz', !!birlestirAcildi && kk.length === 0 && (await evalJs(`window.__pdefe.belgeler.size`)) === 0, { birlestirAcildi, kk });
    if (pb) {
      sonuc('Görüntü / PDF birleştir alt şeridinde ipucu metni yok', ipucuYok(pb), { dugmeler: pb.dugmelerMetin, sol: pb.solMetin, altMetin: pb.altMetin });
      sonuc('Görüntü / PDF birleştir bölüm başlığı "Kaydet"', pb.bolumBasliklari.includes('Kaydet') && !pb.bolumBasliklari.includes('Kaydetme'), pb.bolumBasliklari);
      await ssIki('c-birlestir');
      await aracKapat();
    }
    // Birleştir'e bir dosya ekleyip alt şeride yeniden bak (liste doluyken ipucu gelmesin)
    await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir', [${J(path.join(PDF, 'a.pdf'))}])`);
    await kosul(`document.querySelectorAll('.birlestir-oge').length > 0`, 8000); await bekle(600);
    const pb2 = await pencereBilgi();
    sonuc('Görüntü / PDF birleştir (liste dolu) alt şeridinde de ipucu yok', pb2 && ipucuYok(pb2), pb2 && { dugmeler: pb2.dugmelerMetin, sol: pb2.solMetin });
    if (pb2) { await tikl(q('.arac-ortusu .arac-kapat')); await bekle(500); if (await evalJs(`!!document.querySelector('.mesaj-kutusu')`)) { const m = await merkez(`[...document.querySelectorAll('.mesaj-kutusu .dugmeler button')].find((b) => b.textContent === 'Kaydetme')`); if (m) await tikla(...m); } await kosul(`!document.querySelector('.arac-ortusu')`, 8000); }
    await hepsiniKapat(); await bekle(300);

    // ================================================================ (f) F1 Kısayollar penceresi (menü hızlandırıcısı)
    await menuTus('F1');
    const f1 = await evalJs(`(() => { const d = document.querySelector('.diyalog-ortusu .diyalog'); if (!d) return null; const tablolar = [...d.querySelectorAll('.kisayol-sutunlar > table')];
      return { baslik: d.querySelector('.baslik').textContent, sutun: tablolar.length, ustler: tablolar.map((t) => Math.round(t.getBoundingClientRect().top)),
        bolumler: tablolar.map((t) => [...t.querySelectorAll('tr.bolum th')].map((e) => e.textContent)), metin: d.innerText,
        tasma: d.querySelector('.govde').scrollWidth - d.querySelector('.govde').clientWidth, dikeyTasma: d.querySelector('.govde').scrollHeight - d.querySelector('.govde').clientHeight, diyalogSag: d.getBoundingClientRect().right, gen: innerWidth, diyalogSayisi: document.querySelectorAll('.diyalog-ortusu').length }; })()`);
    sonuc('F1 (menü kısayolu) "Kısayollar" penceresini bir kez açar', f1?.baslik === 'Kısayollar' && f1.diyalogSayisi === 1, f1 && { baslik: f1.baslik, sayi: f1.diyalogSayisi });
    sonuc('Kısayollar: üçüncü sütunda "Sayfaları düzenle" ve "Görüntü / PDF birleştir" bölümleri', f1?.sutun === 3 && J(f1.bolumler[2]) === J(['Sayfaları düzenle', 'Görüntü / PDF birleştir']), f1?.bolumler);
    sonuc('Kısayollar: araç ipuçlarının içeriği (Tıkla / Delete / Ctrl+V…) ve Ctrl+T burada', f1 && /Seçilenleri sil/.test(f1.metin) && /Seçilenleri çıkar/.test(f1.metin) && /Panodaki dosyaları/.test(f1.metin) && /Ctrl\+T/.test(f1.metin) && !/Klavye kısayolları/.test(f1.metin), f1 && f1.metin.slice(0, 200));
    sonuc('Kısayollar: 1264 px pencerede üç sütun yan yana, taşma yok', f1 && new Set(f1.ustler).size === 1 && f1.tasma <= 0 && f1.diyalogSag <= f1.gen, f1 && { ustler: f1.ustler, tasma: f1.tasma, sag: f1.diyalogSag, gen: f1.gen });
    if (f1?.dikeyTasma > 0) bilgi(`Kısayollar penceresi ${f1.gen}×795 px pencerede dikey kaydırmalı (${f1.dikeyTasma} px taşan içerik; Yazı kutusu / Genel bölümleri aşağıda)`);
    await ssIki('f-kisayollar');
    await yapiskanDenetle('Kısayollar penceresi');
    await tikl(`[...document.querySelectorAll('.diyalog-ortusu .dugmeler button')].find((b) => b.textContent === 'Tamam')`); await bekle(300);

    // ================================================================ (e) adlar: menü, Not aracı, dosyadaki konu, Yorumlar paneli
    const menuMetni = J(await evalJs(`window.pdefe.cagir('test:menu')`));
    const menuYapi = await evalJs(`window.pdefe.cagir('test:menu')`);
    const altMenu = (ad) => menuYapi.find((m) => m.etiket?.replace('&', '') === ad)?.alt || [];   // etiketlerde erişim harfi (Dü&zen)
    const duzenMenu = altMenu('Düzen'), yardimMenu = altMenu('Yardım'), dosyaMenu = altMenu('Dosya');
    sonuc('Menüde "Yapışkan" hiç geçmiyor; Düzen › Not var, Yardım › Kısayollar, Dosya › Yeni sekme', !/yap[ıi]şkan/i.test(menuMetni) && duzenMenu.includes('Not') && yardimMenu.includes('Kısayollar') && dosyaMenu.includes('Yeni sekme'), { duzenMenu, yardimMenu, dosyaMenu });
    await ac('not.pdf');
    const notDugme = await evalJs(`(() => { const b = document.querySelector('#not-araclari [data-arac="not"]'); return { title: b.title, aria: b.getAttribute('aria-label') }; })()`);
    sonuc('Not aracının ipucu "Not"', notDugme.title === 'Not', notDugme);
    await tikl(q('#not-araclari [data-arac="not"]')); await bekle(300);
    const notYeri = await evalJs(`(() => { const s = window.__pdefe.aktif().gorunum.sayfalar[0].el.getBoundingClientRect(); return [s.left + 30, s.top + 30]; })()`);
    await tikla(notYeri[0], notYeri[1]); await bekle(600);
    const balon = await evalJs(`({ tur: document.querySelector('.not-balonu .tur')?.textContent, odak: document.activeElement?.tagName })`);
    await yaz('S19 deneme notu'); await bekle(300);
    sonuc('Not aracıyla konan notun balonunda tür "Not"', balon.tur === 'Not' && balon.odak === 'TEXTAREA', balon);
    await ss('e-not-balonu-acik');
    await tus('Escape'); await bekle(400);
    const notlar1 = await evalJs(`[...window.__pdefe.aktif().notlar.notlar.values()].filter((n) => !n.silindi).map((n) => ({ tur: n.tur, konu: n.konu, icerik: n.icerik }))`);
    sonuc('Yeni not bellekte: Text, konu "Not", içerik yazıldı', notlar1.length === 1 && notlar1[0].tur === 'Text' && notlar1[0].konu === 'Not' && notlar1[0].icerik === 'S19 deneme notu', notlar1);
    await evalJs(`(() => { window.__pdefe.panel.acKapa(true); window.__pdefe.panel.sekmeSec('yorumlar'); return true; })()`); await bekle(600);
    const yorum = await evalJs(`[...document.querySelectorAll('#panel-yorumlar .yorum')].map((y) => ({ tur: y.querySelector('.tur').textContent, icerik: y.querySelector('.icerik')?.textContent }))`);
    sonuc('Yorumlar panelinde türü "Not"', yorum.length === 1 && yorum[0].tur === 'Not' && yorum[0].icerik === 'S19 deneme notu', yorum);
    await ssIki('e-yorumlar-paneli');
    await yapiskanDenetle('Yorumlar paneli');
    await menuTus('S', ['control']);
    await kosul(`!window.__pdefe.aktif()?.degisti`, 10000); await bekle(500);
    const kaydedildi = !(await evalJs(`window.__pdefe.aktif().degisti`));
    let dosyadaki = [];
    try { dosyadaki = dosyadakiNotlar(path.join(PDF, 'not.pdf')); } catch (e) { dosyadaki = [{ hata: String(e.message).slice(0, 200) }]; }
    sonuc('Ctrl+S (menü kısayolu) kaydeder; dosyada Text notunun /Subj "Not"', kaydedildi && dosyadaki.length === 1 && dosyadaki[0].tur === 'Text' && dosyadaki[0].konu === 'Not' && dosyadaki[0].icerik === 'S19 deneme notu', { kaydedildi, dosyadaki });
    await evalJs(`(() => { window.__pdefe.panel.acKapa(false); return true; })()`);
    // Yeniden açınca panel ve balon yine "Not" (dosyadan okunan konu)
    await kapat('not.pdf'); await ac('not.pdf');
    await evalJs(`(() => { window.__pdefe.panel.acKapa(true); window.__pdefe.panel.sekmeSec('yorumlar'); return true; })()`); await bekle(800);
    const yorum2 = await evalJs(`[...document.querySelectorAll('#panel-yorumlar .yorum')].map((y) => y.querySelector('.tur').textContent)`);
    sonuc('Dosyadan yeniden açılınca Yorumlar panelinde yine "Not"', J(yorum2) === J(['Not']), yorum2);
    await evalJs(`(() => { window.__pdefe.panel.acKapa(false); return true; })()`);
    await kapat('not.pdf');

    // ================================================================ (d) seçim çubuğu
    await ac('buyuk.pdf');
    await evalJs(`(() => { window.__pdefe.aktif().gorunum.zoomAyarla(1.5); return true; })()`); await bekle(1500);
    const satirBul = (aralik, ustPay) => evalJs(`(() => {
      const b = window.__pdefe.aktif(), kay = b.gorunum.kaydirici, kk = kay.getBoundingClientRect();
      const ust = kk.top, alt = kk.top + kay.clientHeight, sol = kk.left, sag = kk.left + kay.clientWidth;
      const s = [...b.el.querySelectorAll('.textLayer span')].filter((e) => { const r = e.getBoundingClientRect(); const u = alt - r.bottom;
        if (!(e.textContent.trim().length > 14 && r.width > 140 && r.height > 8 && r.left > sol + 20 && r.right < sag - 20 && r.top > ust + ${ustPay} && u >= ${aralik[0]} && u <= ${aralik[1]}) || e.dataset.s19) return false;
        // İki ucu da açıkta olmalı (vurgunun ya da başka bir notun altında değil)
        const y = r.top + r.height / 2, a1 = document.elementFromPoint(r.left + 3, y), a2 = document.elementFromPoint(r.right - 3, y);
        return (a1 === e || e.contains(a1)) && (a2 === e || e.contains(a2)); });
      if (!s.length) return null; s[0].dataset.s19 = '1'; const r = s[0].getBoundingClientRect(); return [r.left + 3, r.top + r.height / 2, r.right - 3, alt - r.bottom];
    })()`);
    const satirGetir = async (aralik, ustPay = 150) => {
      for (let i = 0; i < 60; i++) {
        const s = await satirBul(aralik, ustPay);
        if (s) return s;
        await evalJs(`(() => { window.__pdefe.aktif().gorunum.kaydirici.scrollTop += 29; return true; })()`); await bekle(220);
      }
      return null;
    };
    const cubukOlc = () => evalJs(`(() => { const c = document.querySelector('#secim-cubugu'); const r = (e) => { const k = e.getBoundingClientRect(); return { l: k.left, t: k.top, r: k.right, b: k.bottom, w: k.width, h: k.height }; };
      const ana = [...c.querySelectorAll('.secim-ana button:not(.renk)')].filter((b) => b.getBoundingClientRect().width > 0);
      const renkler = c.querySelector('.secim-renkler'); const kay = window.__pdefe.aktif().gorunum.kaydirici, kk = kay.getBoundingClientRect();
      return { gizli: c.hidden, cubuk: r(c), sol: ana[0].getBoundingClientRect().left - c.getBoundingClientRect().left, sag: c.getBoundingClientRect().right - ana.at(-1).getBoundingClientRect().right,
        ok: r(c.querySelector('[data-islem="renkler"]')), acik: c.classList.contains('renkler-acik'), yukari: c.classList.contains('renkler-yukari'), ustte: c.classList.contains('ustte'),
        renklerDisplay: getComputedStyle(renkler).display, renklerKutu: r(renkler), renkKutulari: [...renkler.querySelectorAll('.renk')].map((e) => ({ renk: e.dataset.renk, ...r(e) })),
        alan: { t: kk.top, b: kk.top + kay.clientHeight, l: kk.left, r: kk.left + kay.clientWidth }, secimVar: !getSelection().isCollapsed, aria: c.querySelector('[data-islem="renkler"]').getAttribute('aria-expanded') }; })()`);
    const dikeySutun = (o) => {
      const k = o.renkKutulari;
      return k.length === 6 && k.every((x) => x.h > 0 && Math.abs((x.l + x.r) / 2 - (k[0].l + k[0].r) / 2) < 1) && k.every((x, i) => i === 0 || x.t >= k[i - 1].b - 0.5) && o.renklerKutu.w < o.renklerKutu.h;
    };
    const icinde = (o) => o.renklerKutu.t >= o.alan.t - 0.5 && o.renklerKutu.b <= o.alan.b + 0.5 && o.renklerKutu.l >= o.alan.l - 0.5 && o.renklerKutu.r <= o.alan.r + 0.5;

    // 1) orta satır: çubuk altında, sütun aşağı
    let satir = await satirGetir([260, 100000]);
    if (!satir) throw new Error('Seçilecek satır bulunamadı (orta)');
    await surukle(satir[0], satir[1], satir[2], satir[1]); await bekle(500);
    const c1 = await cubukOlc();
    sonuc('Seçim çubuğu görünür, genişliği ≤ 120 px, sol/sağ boşluk küçük (≤ 4 px kenarlık dahil)', !c1.gizli && c1.cubuk.w <= 120 && c1.sol <= 4 && c1.sag <= 4, { w: c1.cubuk.w, h: c1.cubuk.h, sol: c1.sol, sag: c1.sag });
    sonuc('Renk sütunu kapalı (display none), ▾ aria-expanded false', !c1.acik && c1.renklerDisplay === 'none' && c1.aria === 'false', { acik: c1.acik, display: c1.renklerDisplay });
    bilgi(`seçim çubuğu ${c1.cubuk.w.toFixed(1)}×${c1.cubuk.h.toFixed(1)} px, sol ${c1.sol.toFixed(1)} px, sağ ${c1.sag.toFixed(1)} px (kenarlık dahil)`);
    await ss('d-secim-cubugu-acik');
    await tikla((c1.ok.l + c1.ok.r) / 2, (c1.ok.t + c1.ok.b) / 2); await bekle(400);
    const c2 = await cubukOlc();
    sonuc('▾: çubuğun boyutu ve konumu değişmez, ▾ yerinde', Math.abs(c2.cubuk.l - c1.cubuk.l) < 0.5 && Math.abs(c2.cubuk.t - c1.cubuk.t) < 0.5 && Math.abs(c2.cubuk.w - c1.cubuk.w) < 0.5 && Math.abs(c2.cubuk.h - c1.cubuk.h) < 0.5 && Math.abs(c2.ok.l - c1.ok.l) < 0.5 && Math.abs(c2.ok.t - c1.ok.t) < 0.5, { once: c1.cubuk, sonra: c2.cubuk });
    sonuc('▾: 6 renk ▾\'nin altında dikey sütunda (üst üste, sütun eni < boyu), seçim korunur', c2.acik && !c2.yukari && c2.renklerDisplay !== 'none' && dikeySutun(c2) && c2.renklerKutu.t >= c2.ok.b && Math.abs((c2.renklerKutu.l + c2.renklerKutu.r) / 2 - (c2.ok.l + c2.ok.r) / 2) < 2 && c2.secimVar && c2.aria === 'true',
      { sutun: c2.renklerKutu, ok: c2.ok, renkler: c2.renkKutulari.map((x) => [Math.round(x.l), Math.round(x.t)]) });
    sonuc('Aşağı açılan sütun görünür alanda', icinde(c2), { sutun: c2.renklerKutu, alan: c2.alan });
    await ss('d-secim-renkler-asagi-acik');
    // Renge tıkla: vurgular ve varsayılan olur
    const mavi = c2.renkKutulari.find((x) => x.renk === '#7cc4ff');
    await tikla((mavi.l + mavi.r) / 2, (mavi.t + mavi.b) / 2); await bekle(600);
    const c3 = await evalJs(`({ renk: window.__pdefe.ayar().vurguRengi, notlar: [...window.__pdefe.aktif().notlar.notlar.values()].filter((n) => !n.silindi).map((n) => n.tur + ' ' + n.renk) })`);
    c3.depo = await evalJs(`window.pdefe.cagir('ayar:al', 'vurguRengi')`);
    sonuc('Sütundaki renge tıklayınca vurgular ve o renk varsayılan olur (Mavi)', c3.renk === '#7cc4ff' && c3.depo === '#7cc4ff' && J(c3.notlar) === J(['Highlight #7cc4ff']), c3);
    // Yeni seçimde sütun kapalı
    satir = await satirGetir([260, 100000], 200);
    await surukle(satir[0], satir[1], satir[2], satir[1]); await bekle(500);
    const c4 = await cubukOlc();
    const cizgi = await evalJs(`getComputedStyle(document.querySelector('#secim-cubugu .renk-cizgi')).stroke`);
    sonuc('Yeni seçimde renk sütunu kapalı, vurgu düğmesi yeni varsayılan (Mavi)', !c4.gizli && !c4.acik && c4.renklerDisplay === 'none' && cizgi === 'rgb(124, 196, 255)', { acik: c4.acik, display: c4.renklerDisplay, cizgi });

    // 2) seçim görünür alanın dibinde: çubuk seçimin üstünde, sütun yukarı
    await evalJs(`(() => { getSelection().removeAllRanges(); window.__pdefe.aktif().notlar.secimCubuguGizle(); return true; })()`);
    satir = await satirGetir([12, 40], 260);
    if (!satir) throw new Error('Seçilecek satır bulunamadı (dip)');
    await surukle(satir[0], satir[1], satir[2], satir[1]); await bekle(500);
    const c5 = await cubukOlc();
    await tikla((c5.ok.l + c5.ok.r) / 2, (c5.ok.t + c5.ok.b) / 2); await bekle(400);
    const c6 = await cubukOlc();
    sonuc('Seçim alanın dibindeyken çubuk seçimin üstünde; ▾ sütunu yukarı açar (▾\'nin üstünde, dikey)', c5.ustte && c6.acik && c6.yukari && dikeySutun(c6) && c6.renklerKutu.b <= c6.ok.t + 0.5 && Math.abs(c6.cubuk.t - c5.cubuk.t) < 0.5,
      { dipUzaklik: satir[3], ustte: c5.ustte, yukari: c6.yukari, sutun: c6.renklerKutu, ok: c6.ok });
    sonuc('Yukarı açılan sütun görünür alanda kalır', icinde(c6), { sutun: c6.renklerKutu, alan: c6.alan });
    await ss('d-secim-renkler-yukari-ustte-acik');
    // 3) çubuk seçimin altında ama altta sütuna yer yok: sütun yukarı
    await evalJs(`(() => { getSelection().removeAllRanges(); window.__pdefe.aktif().notlar.secimCubuguGizle(); return true; })()`);
    satir = await satirGetir([75, 150], 260);
    if (!satir) throw new Error('Seçilecek satır bulunamadı (alta yakın)');
    await surukle(satir[0], satir[1], satir[2], satir[1]); await bekle(500);
    const c7 = await cubukOlc();
    await tikla((c7.ok.l + c7.ok.r) / 2, (c7.ok.t + c7.ok.b) / 2); await bekle(400);
    const c8 = await cubukOlc();
    sonuc('Çubuk seçimin altında, altta yer yokken sütun yukarı açılır ve görünür alanda kalır', !c7.ustte && c8.acik && c8.yukari && dikeySutun(c8) && c8.renklerKutu.b <= c8.ok.t + 0.5 && icinde(c8) && Math.abs(c8.cubuk.t - c7.cubuk.t) < 0.5,
      { dipUzaklik: satir[3], ustte: c7.ustte, yukari: c8.yukari, sutun: c8.renklerKutu, alan: c8.alan });
    await ss('d-secim-renkler-yukari-altta-yer-yok-acik');
    // ▾ ikinci tık sütunu kapatır
    await tikla((c8.ok.l + c8.ok.r) / 2, (c8.ok.t + c8.ok.b) / 2); await bekle(300);
    const c9 = await cubukOlc();
    sonuc('▾ ikinci tık sütunu kapatır, çubuk yerinde', !c9.acik && c9.renklerDisplay === 'none' && Math.abs(c9.cubuk.t - c8.cubuk.t) < 0.5 && !c9.gizli, { acik: c9.acik, display: c9.renklerDisplay });
    // Koyu tema: seçim + sütun
    await evalJs(`(() => { getSelection().removeAllRanges(); window.__pdefe.aktif().notlar.secimCubuguGizle(); return true; })()`);
    await temaDegistir(); await bekle(800);
    satir = await satirGetir([260, 100000], 200);
    if (satir) {
      await surukle(satir[0], satir[1], satir[2], satir[1]); await bekle(500);
      const k1 = await cubukOlc();
      await tikla((k1.ok.l + k1.ok.r) / 2, (k1.ok.t + k1.ok.b) / 2); await bekle(400);
      const k2 = await cubukOlc();
      sonuc('Koyu temada da sütun ▾\'nin altında dikey açılır', k2.acik && dikeySutun(k2) && !k2.yukari && icinde(k2), { sutun: k2.renklerKutu });
      await ss('d-secim-renkler-asagi-koyu');
    }
    await evalJs(`(() => { getSelection().removeAllRanges(); window.__pdefe.aktif()?.notlar.secimCubuguGizle(); return true; })()`);
    await temaDegistir();
    await yapiskanDenetle('belge + seçim çubuğu');
    await hepsiniKapat();

    // ================================================================ (e) "Yapışkan" arayüzde yok (toplu)
    sonuc('Arayüzde (DOM metni ve title\'lar) "Yapışkan" hiç geçmiyor (açılış, açılış sekmesi, araç pencereleri, Kısayollar, Yorumlar, belge)', !yapiskanKayit.length, yapiskanKayit);
  } catch (e) {
    sonuc('Senaryo beklenmedik biçimde durdu', false, String(e?.stack || e).slice(0, 600));
  } finally {
    // ---------------------------------------------------------------- konsol ve window hataları
    await genislikTaklit(0).catch(() => {});
    const pencereHatalari = JSON.parse(await evalJs(`JSON.stringify(window.__s19Hatalar || [])`));
    const konsolHatalari = [], uyarilar = [];
    for (const o of cdp.olaylar) {
      if (o.method === 'Runtime.exceptionThrown' && o.params.timestamp >= baslangicZamani) konsolHatalari.push('istisna: ' + (o.params.exceptionDetails.exception?.description || o.params.exceptionDetails.text).slice(0, 300));
      else if (o.method === 'Runtime.consoleAPICalled' && o.params.timestamp >= baslangicZamani) {
        const metin = o.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300);
        if (o.params.type === 'error' || o.params.type === 'assert') konsolHatalari.push('console.error: ' + metin);
        else if (o.params.type === 'warning') uyarilar.push(metin);
      } else if (o.method === 'Log.entryAdded' && o.params.entry.timestamp >= baslangicZamani && o.params.entry.level === 'error') konsolHatalari.push('log: ' + o.params.entry.text.slice(0, 300));
    }
    if (uyarilar.length) bilgi('console.warn: ' + J(uyarilar.slice(0, 8)));
    sonuc('Konsolda ve window\'da (error / unhandledrejection) hata yok', !pencereHatalari.length && !konsolHatalari.length, { pencereHatalari, konsolHatalari: konsolHatalari.slice(0, 10) });
    await hepsiniKapat().catch(() => {});
    cdp.ws.close();
    console.log('\nEkran görüntüleri: ' + PNG);
    console.log(`\n${toplam - hataSayisi}/${toplam} geçti` + (hataSayisi ? `, ${hataSayisi} HATA` : ' — hepsi geçti'));
    process.exitCode = hataSayisi ? 1 : 0;
  }
}
