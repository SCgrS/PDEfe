// PDF'in doğrudan açılış hızı ölçümü (0.2.10, kullanıcı isteği: "PDF'leri doğrudan açtığımızda da biraz daha hızlı açılmasını sağlayabilir
// miyiz"). Gezgin'de PDF'e çift tıklamanın iki yolu ölçülür:
//   soğuk: PDEfe kapalıyken "PDEfe.exe <pdf>"; süreç başından pencerenin görünmesine, açılış ekranının (görünüyorsa) ve belgenin ilk
//          sayfasının çizilmesine dek;
//   sıcak: PDEfe açıkken ikinci örnek ("PDEfe.exe <başka pdf>"): ikinci sürecin başından açık PDEfe'nin belgeyi alıp ilk sayfasını
//          çizmesine dek; ikinci sürecin ömrü de (işletim sisteminden).
// Uygulama adımlarını kendisi yazar (ana süreç: src/main/acilisZamanlari.js, 'uygulama:acilisZamanlari'; arayüz: performance.mark 'pdefe:…');
// betik onları CDP ile okur, süreç başlatma anını başlatıcı (test/acilis_baslat.ps1) verir. Paketli sürüm görünmeyen ayrı bir masaüstünde
// çalışır (ekrana pencere çıkmaz, odak çalınmaz); veri klasörü ayrıdır (--user-data-dir; kurulu PDEfe'nin ayarı ve tek örnek kilidi
// paylaşılmaz). Bilgisayarın başka işleri ölçümü oynattığı için iki sürüm karşılaştırılırken ikisi aynı koşuda sırayla (her turda sıra
// değişerek) başlatılır: --exe A,B.
//
// Kullanım (PowerShell ya da Git Bash, depo kökünde):
//   .venv\Scripts\python.exe test\acilis_ornek_uret.py            (örnek PDF'ler; test/cikti/acilis/pdf; yoksa betik kendisi üretir)
//   node test\acilis_hizi.mjs [--exe release\win-unpacked\PDEfe.exe[,<öbür PDEfe.exe>]] [--etiketler önce,sonra]
//                             [--turler kucuk,taranmis,buyuk] [--tekrar 5] [--sicaksiz] [--port 9450] [--cikti test\cikti\acilis\sonuc.json]
//                             [--tema koyu]
// Her türde önce bir ısınma açılışı yapılır (sayılmaz: dosyalar işletim sisteminin ön belleğine girsin, profil kurulsun). Sonuç: her adımın
// ortancası, %90'ı, en azı ve en çoğu (ms). Gerçek "ilk açılış" (bilgisayar yeniden başladıktan sonra, diskten) bu yolla ölçülmez.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (ad, varsayilan) => { const i = process.argv.indexOf('--' + ad); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : varsayilan; };
const bayrak = (ad) => process.argv.includes('--' + ad);
const EXELER = arg('exe', path.join(KOK, 'release', 'win-unpacked', 'PDEfe.exe')).split(',').map((s) => path.resolve(s.trim())).filter(Boolean);
const ETIKETLER = arg('etiketler', EXELER.length > 1 ? 'önce,sonra' : 'ölçüm').split(',').map((s) => s.trim());
const TURLER = arg('turler', 'kucuk,taranmis,buyuk').split(',').map((s) => s.trim()).filter(Boolean);
const TEKRAR = Math.max(1, parseInt(arg('tekrar', '5'), 10) || 5);
const SICAK = !bayrak('sicaksiz');
const PORT = parseInt(arg('port', '9450'), 10);
const CIKTI = arg('cikti', '');
const TEMA = arg('tema', 'koyu');
const ORNEKLER = path.join(KOK, 'test', 'cikti', 'acilis', 'pdf');
const BEKLEME_MS = 30000;

const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
const yuvarla = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x));

// ---------------------------------------------------------------- hazırlık
for (const exe of EXELER) if (!fs.existsSync(exe)) { console.error(`PDEfe bulunamadı: ${exe}\n(npm run cekirdek:derle ve npx electron-builder --win --dir --publish never)`); process.exit(2); }
if (!TURLER.every((t) => fs.existsSync(path.join(ORNEKLER, t + '.pdf')) && fs.existsSync(path.join(ORNEKLER, t + '-2.pdf')))) {
  const py = path.join(KOK, '.venv', 'Scripts', 'python.exe');
  console.log('[hazırlık] örnek PDF\'ler üretiliyor…');
  execFileSync(fs.existsSync(py) ? py : 'python', [path.join(KOK, 'test', 'acilis_ornek_uret.py'), ORNEKLER], { stdio: 'inherit' });
}
// Her sürümün kendi veri klasörü, portu ve görünmeyen masaüstü
const HEDEFLER = EXELER.map((exe, i) => ({ exe, etiket: ETIKETLER[i] || `#${i + 1}`, port: PORT + i, veri: path.join(os.tmpdir(), `pdefe-acilis-${PORT + i}`), masaustu: `PDEfeAcilis${PORT + i}` }));
for (const h of HEDEFLER) {
  fs.rmSync(h.veri, { recursive: true, force: true });
  fs.mkdirSync(h.veri, { recursive: true });
  // İki belgeli pencere kapatılırken "Geçerli sekme / Tüm sekmeler" sorulmasın; ölçüm sırasında güncelleme denetimi ağa çıkmasın
  fs.writeFileSync(path.join(h.veri, 'ayarlar.json'), JSON.stringify({ tema: TEMA, pencereKapatma: 'pencere', otoGuncelle: false }, null, 2));
}

// ---------------------------------------------------------------- başlatıcı (görünmeyen masaüstü)
const baslatici = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'acilis_baslat.ps1')], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const baslaticiSatirlari = readline.createInterface({ input: baslatici.stdout });
const yanitlar = [];
let yanitBekleyen = null;
baslaticiSatirlari.on('line', (s) => { const j = JSON.parse(s); if (yanitBekleyen) { const c = yanitBekleyen; yanitBekleyen = null; c(j); } else yanitlar.push(j); });
const baslaticiYaniti = () => (yanitlar.length ? Promise.resolve(yanitlar.shift()) : new Promise((c) => { yanitBekleyen = c; }));
await baslaticiYaniti();   // {"hazir": true}

async function baslat(h, arguman) {
  baslatici.stdin.write(JSON.stringify({ exe: h.exe, arguman, klasor: path.dirname(h.exe), masaustu: h.masaustu }) + '\n');
  const r = await baslaticiYaniti();
  if (r.hata) throw new Error('Başlatılamadı: ' + r.hata);
  return r;
}
/** Başlatılan sürecin çıkışı { zaman (ms, işletim sisteminden), kod }; sure ms'de çıkmazsa null. Başlatıcı beklerken başka iş almaz. */
async function cikis(pid, sure = 15000) {
  baslatici.stdin.write(JSON.stringify({ cikis: pid, sure }) + '\n');
  const r = await baslaticiYaniti();
  return r.cikis == null ? null : { zaman: r.cikis, kod: r.kod };
}

// ---------------------------------------------------------------- süreçler
// (Süreç listesi burada okunmaz: bu bilgisayarda WMI ve tasklist bir sorguda saniyeler sürüyor. Olağan kapanışta çekirdek girdisi kapanınca
// kendiliğinden çıkar; kapanmayan örnek ağacıyla kapatılır.)
function zorlaKapat(pid) { try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* yok */ } }

// ---------------------------------------------------------------- CDP
async function sayfaBagla(port, sonZaman) {
  let hedef = null;
  while (!hedef) {
    if (Date.now() > sonZaman) throw new Error('CDP sayfası bulunamadı.');
    try {
      const liste = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      hedef = liste.find((h) => h.type === 'page' && /^pdefe:\/\/app\/src\/renderer\/index\.html/.test(h.url));
    } catch { /* henüz yok */ }
    if (!hedef) await bekle(25);
  }
  const ws = new WebSocket(hedef.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0;
  const bekleyen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } };
  const degerlendir = async (ifade) => {
    const r = await new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: ifade, awaitPromise: true, returnByValue: true } })); });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  return { ws, degerlendir };
}

const ISARETLER = `(() => ({
  isaretler: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('pdefe:')).map((m) => ({ ad: m.name.slice(6), t: performance.timeOrigin + m.startTime, no: m.detail ?? null })),
  boyalar: performance.getEntriesByType('paint').map((m) => ({ ad: m.name, t: performance.timeOrigin + m.startTime })),
  koken: performance.timeOrigin,
}))()`;

/** Arayüzün işaretleri koşulu sağlayana dek (belgenin ilk sayfası çizildi) bekler; sonra biraz daha bekleyip (çekirdek, kare) hepsini döner. */
async function belgeyiBekle(cdp, kosul, sonZaman) {
  for (;;) {
    if (Date.now() > sonZaman) throw new Error('Belgenin ilk sayfası süresinde çizilmedi.');
    let v = null;
    try { v = await cdp.degerlendir(ISARETLER); } catch { /* sayfa yükleniyor */ }
    if (v && kosul(v.isaretler)) {
      await bekle(400);
      const son = await cdp.degerlendir(ISARETLER);
      son.ana = await cdp.degerlendir(`window.pdefe.cagir('uygulama:acilisZamanlari')`);
      return son;
    }
    await bekle(40);
  }
}

// ---------------------------------------------------------------- ölçüm
const ilkIsaret = (liste, ad, no, sonra = -Infinity) => liste.find((m) => m.ad === ad && (no == null || m.no === no) && m.t >= sonra)?.t ?? null;
const anaKayit = (ana, ad, sonra = -Infinity) => ana?.kayitlar?.find((k) => k.ad === ad && k.t >= sonra)?.t ?? null;

/** Soğuk açılışın adımları (ms, süreç başlatmadan). */
function sogukAdimlar(v, t0) {
  const I = v.isaretler, A = v.ana, rel = (t) => (t == null ? null : t - t0);
  const fcp = v.boyalar.find((b) => b.ad === 'first-contentful-paint')?.t ?? null;
  const gosterildi = anaKayit(A, 'gosterildi'), hazir = ilkIsaret(I, 'hazir'), sekme = ilkIsaret(I, 'sekmeAcildi', 1), ilkSayfa = ilkIsaret(I, 'ilkSayfa', 1);
  // Açılış ekranının görünür olduğu an: 0.2.10'dan beri pencere belgeyle açılırken ('belgeBekleniyor') açılış ekranı belgenin sekmesine dek
  // gizlidir, gösterilirse 'acilisEkrani' yazılır; 0.2.9'da arayüz hazır olunca ('hazir') kuruluyordu
  const acilisEkrani = I.some((m) => m.ad === 'belgeBekleniyor') ? ilkIsaret(I, 'acilisEkrani') : hazir;
  return {
    girisModulu: rel(anaKayit(A, 'acilisModulu')),
    anaModul: rel(anaKayit(A, 'anaModul')),
    uygulamaHazir: rel(anaKayit(A, 'hazir')),
    pencereKuruldu: rel(anaKayit(A, 'pencereKuruldu')),
    html: rel(ilkIsaret(I, 'html')),
    moduller: rel(ilkIsaret(I, 'moduller')),
    ayarlar: rel(ilkIsaret(I, 'ayarlar')),
    arayuzHazir: rel(hazir),
    dosyaAc: rel(ilkIsaret(I, 'dosyaAc', 1)),
    sekmeAcildi: rel(sekme),
    dosyaOkundu: rel(ilkIsaret(I, 'dosyaOkundu', 1)),
    pdfAcildi: rel(ilkIsaret(I, 'pdfAcildi', 1)),
    ilkSayfaNesnesi: rel(ilkIsaret(I, 'ilkSayfaNesnesi', 1)),
    boyutlar: rel(ilkIsaret(I, 'boyutlar', 1)),
    ilkSayfa: rel(ilkSayfa),
    ilkSayfaKare: rel(ilkIsaret(I, 'ilkSayfaKare', 1)),
    // İlk sayfanın ekranda görünebildiği an: çizildi ve pencere gösterildi (0.2.10'dan beri ilk sayfa pencere gösterilmeden de çizilebilir)
    ilkSayfaGorunur: ilkSayfa != null && gosterildi != null ? rel(Math.max(ilkSayfa, gosterildi)) : null,
    gosterildi: rel(gosterildi),
    ilkBoya: rel(fcp),
    cekirdekHazir: rel(anaKayit(A, 'cekirdekHazir')),
    // Pencere göründükten sonra açılış ekranının (belgenin sekmesi açılana dek) ekranda kaldığı süre; görünmeden önce geçtiyse 0
    acilisEkraniSuresi: gosterildi != null && sekme != null ? (acilisEkrani != null ? Math.max(0, sekme - Math.max(gosterildi, acilisEkrani)) : 0) : null,
    // Pencere göründükten belgenin ilk sayfası çizilene dek (görünmeden önce çizildiyse 0)
    gorunurBekleme: gosterildi != null && ilkSayfa != null ? Math.max(0, ilkSayfa - gosterildi) : null,
  };
}

/** Sıcak açılışın adımları (ms, ikinci sürecin başlatılmasından). */
function sicakAdimlar(v, t0, cikis) {
  const I = v.isaretler, A = v.ana, rel = (t) => (t == null ? null : t - t0);
  const ac = I.find((m) => m.ad === 'dosyaAc' && m.t >= t0);
  const no = ac?.no ?? null;
  return {
    ikinciOrnek: rel(anaKayit(A, 'ikinciOrnek', t0)),
    dosyaGonderildi: rel(anaKayit(A, 'dosyaGonderildi', t0)),
    dosyaAc: rel(ac?.t ?? null),
    sekmeAcildi: rel(ilkIsaret(I, 'sekmeAcildi', no, t0)),
    dosyaOkundu: rel(ilkIsaret(I, 'dosyaOkundu', no, t0)),
    pdfAcildi: rel(ilkIsaret(I, 'pdfAcildi', no, t0)),
    ilkSayfaNesnesi: rel(ilkIsaret(I, 'ilkSayfaNesnesi', no, t0)),
    boyutlar: rel(ilkIsaret(I, 'boyutlar', no, t0)),
    ilkSayfa: rel(ilkIsaret(I, 'ilkSayfa', no, t0)),
    ilkSayfaKare: rel(ilkIsaret(I, 'ilkSayfaKare', no, t0)),
    ikinciSurecOmru: rel(cikis),
  };
}

async function birAcilis(h, tur) {
  const pdf = path.join(ORNEKLER, tur + '.pdf'), pdf2 = path.join(ORNEKLER, tur + '-2.pdf');
  const b = await baslat(h, `--remote-debugging-port=${h.port} --user-data-dir="${h.veri}" "${pdf}"`);
  const sonuc = { tur, pid: b.pid };
  try {
    const sonZaman = Date.now() + BEKLEME_MS;
    const cdp = await sayfaBagla(h.port, sonZaman);
    const v = await belgeyiBekle(cdp, (I) => I.some((m) => m.ad === 'ilkSayfa' && m.no === 1), sonZaman);
    sonuc.soguk = sogukAdimlar(v, b.t0);
    // Ham kayıtlar (ms, süreç başlatmadan): ana sürecin ve arayüzün bütün adımları, sonradan ayrıntılı bakmak için
    sonuc.anaKayitlar = (v.ana?.kayitlar || []).map((k) => ({ ad: k.ad, t: yuvarla(k.t - b.t0), ...(k.ek !== undefined ? { ek: k.ek } : {}) }));
    sonuc.arayuzIsaretleri = v.isaretler.map((m) => ({ ad: m.ad, t: yuvarla(m.t - b.t0), no: m.no }));
    if (SICAK) {
      await bekle(1500);   // açılışın arkasından gelen işler (çekirdek, küçük resimler) dinsin
      const b2 = await baslat(h, `--user-data-dir="${h.veri}" "${pdf2}"`);
      const v2 = await belgeyiBekle(cdp, (I) => I.some((m) => m.ad === 'ilkSayfa' && m.t >= b2.t0), Date.now() + BEKLEME_MS);
      const c2 = await cikis(b2.pid);
      if (c2 == null) zorlaKapat(b2.pid);
      else if (c2.kod !== 0) console.warn(`  (ikinci örneğin çıkış kodu ${c2.kod})`);
      sonuc.sicak = sicakAdimlar(v2, b2.t0, c2?.zaman ?? null);
      sonuc.ikinciCikisKodu = c2?.kod ?? null;
    }
    // Kapat: pencere olağan yoldan kapanır (kaydedilmemiş değişiklik yok; ayarlar ve son açılanlar yazılır)
    cdp.degerlendir(`window.pdefe.cagir('pencere:kapat'), true`).catch(() => {});
    const kapandi = await cikis(b.pid);
    try { cdp.ws.close(); } catch { /* kapandı */ }
    if (kapandi == null) { console.warn('  (olağan kapanmadı, zorla kapatılıyor)'); zorlaKapat(b.pid); }
    else if (kapandi.kod !== 0) console.warn(`  (çıkış kodu ${kapandi.kod})`);
    await bekle(500);   // çekirdek ve yardımcı süreçler çıksın
  } catch (e) {
    zorlaKapat(b.pid);
    throw e;
  }
  return sonuc;
}

function istatistik(degerler) {
  const d = degerler.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!d.length) return null;
  const yuzde = (p) => d[Math.min(d.length - 1, Math.ceil((p / 100) * d.length) - 1)];
  const orta = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;
  return { ortanca: yuvarla(orta), y90: yuvarla(yuzde(90)), enAz: yuvarla(d[0]), enCok: yuvarla(d[d.length - 1]), n: d.length };
}

/** Bir türün bir yolunun (soğuk / sıcak) tablosu: her sürüm için ortanca ve %90; iki sürümde ortanca farkı. */
function tablo(baslik, olcumlerHedefe) {
  const adlar = [...new Set(HEDEFLER.flatMap((h) => Object.keys(olcumlerHedefe[h.etiket][0] || {})))];
  console.log(`\n${baslik}`);
  let ust = '  adım'.padEnd(22);
  for (const h of HEDEFLER) ust += `${h.etiket} ortanca`.padStart(16) + '%90'.padStart(7);
  if (HEDEFLER.length === 2) ust += 'fark'.padStart(8);
  console.log(ust);
  const ozet = {};
  for (const ad of adlar) {
    let satir = `  ${ad}`.padEnd(22);
    const s = HEDEFLER.map((h) => istatistik(olcumlerHedefe[h.etiket].map((o) => o?.[ad])));
    s.forEach((x, i) => { satir += String(x?.ortanca ?? '-').padStart(16) + String(x?.y90 ?? '-').padStart(7); (ozet[HEDEFLER[i].etiket] ||= {})[ad] = x; });
    if (HEDEFLER.length === 2 && s[0] && s[1]) satir += String(s[1].ortanca - s[0].ortanca).padStart(8);
    console.log(satir);
  }
  return ozet;
}

const sonuclar = { hedefler: HEDEFLER.map(({ exe, etiket }) => ({ exe, etiket })), tarih: new Date().toISOString(), tekrar: TEKRAR, turler: {} };
try {
  for (const tur of TURLER) {
    for (const h of HEDEFLER) { console.log(`[${tur}] ${h.etiket}: ısınma…`); await birAcilis(h, tur); }
    const olcumler = Object.fromEntries(HEDEFLER.map((h) => [h.etiket, []]));
    for (let i = 0; i < TEKRAR; i++) {
      const sira = i % 2 ? [...HEDEFLER].reverse() : HEDEFLER;   // sıra her turda değişir (ilk açılanın üstlendiği yük dengelensin)
      for (const h of sira) {
        const r = await birAcilis(h, tur);
        olcumler[h.etiket].push(r);
        console.log(`[${tur}] ${h.etiket} ${i + 1}/${TEKRAR}: soğuk ilk sayfa ${yuvarla(r.soguk.ilkSayfa)} ms (görünme ${yuvarla(r.soguk.gosterildi)})` + (r.sicak ? `, sıcak ilk sayfa ${yuvarla(r.sicak.ilkSayfa)} ms` : ''));
      }
    }
    sonuclar.turler[tur] = {
      ham: olcumler,
      soguk: tablo(`${tur} — soğuk açılış (PDEfe kapalıyken), ms`, Object.fromEntries(HEDEFLER.map((h) => [h.etiket, olcumler[h.etiket].map((o) => o.soguk)]))),
      ...(SICAK ? { sicak: tablo(`${tur} — sıcak açılış (PDEfe açıkken, ikinci örnek), ms`, Object.fromEntries(HEDEFLER.map((h) => [h.etiket, olcumler[h.etiket].map((o) => o.sicak)]))) } : {}),
    };
  }
} finally {
  baslatici.stdin.end('\n');
  for (const h of HEDEFLER) { try { fs.rmSync(h.veri, { recursive: true, force: true }); } catch (e) { console.warn('Veri klasörü silinemedi:', h.veri, e.message); } }
}
if (CIKTI) { fs.mkdirSync(path.dirname(path.resolve(CIKTI)), { recursive: true }); fs.writeFileSync(CIKTI, JSON.stringify(sonuclar, null, 2)); console.log(`\nSonuç: ${CIKTI}`); }
