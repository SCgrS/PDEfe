// Senaryo 49 (0.3.1, kullanıcı isteği: Gezgin'de ve Finder'da sağ tıkta "PDEfe ile dönüştür" / "PDEfe ile birleştir"): PDEfe'nin tarafı.
// Sağ tık PDEfe'yi `--donustur <yol> …` ya da `--birlestir <yol> …` ile başlatır (çok dosyada `--dosya-listesi=<%TEMP%\PDEfe\sagtik-*.txt>`;
// main/sagtik.js). Sınanan:
//   A) Açık PDEfe'ye gelen istek (ikinci örnek, 'second-instance'): ana sürecin olayıyla ve GERÇEK ikinci Electron süreciyle (Chromium'un
//      komut satırını açık örneğe iletme yolu). Format Değiştir ve Birleştir dosyalarla, verilen sırayla açılır, sekme açılmaz, açık PDF ilk girdi
//      olmaz. Format Değiştir açıksa dosyalar listesine eklenir. Başka araç (Birleştir) açıksa istek yeni pencerede. Desteklenmeyen ya da
//      olmayan dosya atlanır, hiç dosya kalmazsa araç açılmaz. Liste dosyası okunup silinir; %TEMP%\PDEfe dışındaki ya da başlığı yanlış
//      liste okunmaz, silinmez.
//   B) Kapalı PDEfe'nin açılışı (ilk örnek): test\baslat.ps1 -EkDosya ile ekran dışında yeni örnekler, araç ilk pencerede açılır.
// Girdiler test/cikti/s49/girdi altında üretilir (kurgusal; gerçek belge yok).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9550 -Veri "$env:TEMP\pdefe-s49-9550"        → PID=… yazar
//   $env:PDEFE_CDP_PORT=9550; $env:S49_VERI="$env:TEMP\pdefe-s49-9550"; node test\surucu.mjs betik test\senaryo49.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// B bölümü kendi örneklerini S49_ILK_PORT'ta (varsayılan 9551) açıp kapatır. Yalnızca bir bölüm: $env:BOLUM="A" ya da "B".
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's49');
const GIRDI = path.join(UI, 'girdi');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const ELECTRON = path.join(KOK, 'node_modules', 'electron', 'dist', 'electron.exe');
const PORT = Number(process.env.PDEFE_CDP_PORT || 9550);
const VERI = process.env.S49_VERI || path.join(os.tmpdir(), `pdefe-test-${PORT}`);
const ILK_PORT = Number(process.env.S49_ILK_PORT || 9551);
const LISTE_KLASORU = path.join(os.tmpdir(), 'PDEfe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${!ok && ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

function girdileriUret() {
  fs.rmSync(UI, { recursive: true, force: true });
  fs.mkdirSync(GIRDI, { recursive: true });
  const kod = `
import sys, pymupdf
from PIL import Image
k = sys.argv[1]
def pdf(ad, metin):
    d = pymupdf.open(); s = d.new_page(); s.insert_text((72, 100), metin, fontsize=20); d.save(k + "/" + ad); d.close()
pdf("Dilekçe örneği.pdf", "Kurgusal dilekce")
pdf("Ek 2 - Ali'nin & Veli'nin (son) belgesi.pdf", "Kurgusal ek")
Image.new("RGB", (400, 300), (200, 220, 240)).save(k + "/Tarama örneği.png")
Image.new("RGB", (300, 400), (240, 220, 200)).save(k + "/FOTOĞRAF.JPG", quality=85)
Image.new("L", (400, 560), 255).save(k + "/Tarama.tif", compression="tiff_lzw")
open(k + "/notlar.txt", "w").write("kurgusal")
print("tamam")
`;
  execFileSync(PY, ['-X', 'utf8', '-c', kod, GIRDI], { encoding: 'utf8' });
}
const G = {
  pdf: () => path.join(GIRDI, 'Dilekçe örneği.pdf'),
  pdf2: () => path.join(GIRDI, "Ek 2 - Ali'nin & Veli'nin (son) belgesi.pdf"),
  png: () => path.join(GIRDI, 'Tarama örneği.png'),
  jpg: () => path.join(GIRDI, 'FOTOĞRAF.JPG'),
  tif: () => path.join(GIRDI, 'Tarama.tif'),
  txt: () => path.join(GIRDI, 'notlar.txt'),
};
const ad = (y) => path.basename(y);

// Araçların satırları (Format Değiştir: .donustur-oge, Birleştir: .birlestir-oge; ikisinde de .ad dosyanın adı)
const DURUM = `(() => ({
  donustur: [...document.querySelectorAll('.donustur-pencere .donustur-oge .ad')].map((e) => e.textContent),
  donusturAcik: !!document.querySelector('.donustur-pencere'),
  birlestir: [...document.querySelectorAll('.arac-pencere .birlestir-oge .ad')].map((e) => e.textContent),
  birlestirAcik: !!document.querySelector('.arac-pencere .birlestir-liste'),
  sekmeler: window.__pdefe ? [...window.__pdefe.belgeler.values()].map((b) => b.ad) : null,
  bildirim: document.querySelector('#bildirim')?.textContent || '',
}))()`;

/** Başka bir porttaki örnekte (B bölümü) JS çalıştırır. */
async function portEval(port, kod) {
  const liste = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const h = liste.find((x) => x.type === 'page' && /^pdefe:\/\/app\/src\/renderer\/index\.html/.test(x.url));
  if (!h) throw new Error('pencere yok');
  const ws = new WebSocket(h.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  const r = await new Promise((c) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) c(d); };
    ws.send(J({ id: 1, method: 'Runtime.evaluate', params: { expression: kod, awaitPromise: true, returnByValue: true } }));
  });
  ws.close();
  return r.result?.result?.value;
}

/** Gerçek ikinci Electron süreci (Gezgin'in sağ tık DLL'inin başlattığı gibi): açık örneğin veri klasörüyle, kilidi alamayıp çıkar. */
function ikinciSurec(argumanlar) {
  return new Promise((coz) => {
    const t0 = Date.now();
    const p = spawn(ELECTRON, ['.', ...argumanlar], {
      cwd: KOK, windowsHide: true, stdio: 'ignore',
      env: { ...process.env, PDEFE_VERI_KLASORU: VERI, PDEFE_TEST_KONUM: '-2600,0', PDEFE_TEST_BOYUT: '1280,900' },
    });
    const zaman = setTimeout(() => { try { p.kill(); } catch { /* */ } coz({ kod: 'zaman aşımı', sure: Date.now() - t0 }); }, 20000);
    p.on('exit', (kod) => { clearTimeout(zaman); coz({ kod, sure: Date.now() - t0 }); });
  });
}

function listeYaz(klasor, adi, satirlar) {
  fs.mkdirSync(klasor, { recursive: true });
  const y = path.join(klasor, adi);
  fs.writeFileSync(y, satirlar.join('\n') + '\n', 'utf8');
  return y;
}

export default async function ({ evalJs, bekle, hedefler, hedefSec }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const durum = () => evalJs(DURUM);
  const araclariKapat = async () => {
    // Birleştir dosya listesiyle kapanırken "kaydedilmemiş değişiklikler" sorar: 1 = Kaydetme (mesajKutusu.js kaydetmedenCikisSorusu)
    await evalJs(`(async () => { window.__pdefeOtoYanit = { secim: 1 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); }
      finally { delete window.__pdefeOtoYanit; } return true; })()`);
    await bekle(300);
  };
  const sekmeleriKapat = () => evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return window.__pdefe.belgeler.size; })()`);
  /** Ana sürecin 'second-instance' olayı (test:uygulamaOlayi; argv'nin başına program adı eklenir). */
  const ikinci = (argv) => evalJs(`window.pdefe.cagir('test:uygulamaOlayi', 'second-instance', ${J(argv)})`);
  const satirlarBekle = async (alan, sayi, sure = 15000) => {
    await kosul(`(${DURUM}).${alan}.length >= ${sayi}`, sure);
    await bekle(400);
    return durum();
  };

  girdileriUret();
  const bolum = (process.env.BOLUM || 'A,B').toUpperCase();

  if (bolum.includes('A')) {
    console.log('— A: açık PDEfe\'ye gelen istek (ikinci örnek)');
    await araclariKapat(); await sekmeleriKapat();
    // Açık bir PDF: sağ tık isteğinde ilk girdi olmamalı
    await evalJs(`window.__pdefe.dosyaAc(${J(G.pdf2())}).then(() => true)`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
    let d = await durum();
    const sekmeOnce = d.sekmeler;

    await ikinci(['--donustur', G.pdf(), G.png()]);
    d = await satirlarBekle('donustur', 2);
    sonuc('--donustur (2 dosya): Format Değiştir verilen dosyalarla, sırayla; açık PDF girdi değil', d.donusturAcik && J(d.donustur) === J([ad(G.pdf()), ad(G.png())]), d);
    sonuc('--donustur: yeni sekme açılmadı (PDF de araçta)', J(d.sekmeler) === J(sekmeOnce), d.sekmeler);

    await ikinci(['--donustur', G.jpg()]);
    d = await satirlarBekle('donustur', 3);
    sonuc('Format Değiştir açıkken --donustur: dosya listeye eklenir', J(d.donustur) === J([ad(G.pdf()), ad(G.png()), ad(G.jpg())]), d.donustur);
    await araclariKapat();

    // Açık sekme bir XFA formuyken (benzetim: görünümün xfa işareti): Format Değiştir verilen dosyalarla yine açılır ("XFA formlarında
    // kullanılamaz" yalnızca dosyasız açılışta)
    await evalJs(`(() => { window.__pdefe.aktif().gorunum.xfa = true; return true; })()`);
    await ikinci(['--donustur', G.png()]);
    d = await satirlarBekle('donustur', 1);
    sonuc('Açık sekme XFA formuyken --donustur: araç dosyayla açılır', J(d.donustur) === J([ad(G.png())]) && !/XFA/.test(d.bildirim), d);
    await araclariKapat();
    await evalJs(`window.__pdefe.komutCalistir('arac.donustur'), true`);
    await bekle(600);
    d = await durum();
    sonuc('XFA formunda dosyasız Format Değiştir eskisi gibi kapalı', !d.donusturAcik && /XFA formlarında kullanılamaz/.test(d.bildirim), d);
    await evalJs(`(() => { window.__pdefe.aktif().gorunum.xfa = false; return true; })()`);
    await araclariKapat();

    await ikinci(['--birlestir', G.png(), G.pdf2(), G.pdf()]);
    d = await satirlarBekle('birlestir', 3);
    sonuc('--birlestir (3 dosya): Birleştir verilen sırayla (PNG, adı tırnaklı ve & işaretli PDF, PDF)', d.birlestirAcik && J(d.birlestir) === J([ad(G.png()), ad(G.pdf2()), ad(G.pdf())]), d);
    sonuc('--birlestir: yeni sekme açılmadı', J(d.sekmeler) === J(sekmeOnce), d.sekmeler);

    // Birleştir açıkken yeni istek: yeni pencerede (açık Birleştir'in listesine karışmaz)
    const oncekiHedefler = (await hedefler()).map((h) => h.id);
    await ikinci(['--birlestir', G.tif(), G.jpg()]);
    let yeni = null;
    for (let i = 0; i < 60 && !yeni; i++) { await bekle(250); yeni = (await hedefler()).find((h) => !oncekiHedefler.includes(h.id)); }
    if (yeni) {
      hedefSec(yeni.id);
      await kosul(`!!window.__pdefe`, 15000);
      const dy = await satirlarBekle('birlestir', 2);
      sonuc('Birleştir açıkken --birlestir: yeni pencerede Birleştir, verilen sırayla', J(dy.birlestir) === J([ad(G.tif()), ad(G.jpg())]), dy);
      await araclariKapat();
      await evalJs('window.close(), true').catch(() => {});
      hedefSec(null);
      await bekle(800);
      d = await durum();
      sonuc('İlk pencerenin Birleştir listesi değişmedi', J(d.birlestir) === J([ad(G.png()), ad(G.pdf2()), ad(G.pdf())]), d.birlestir);
    } else {
      sonuc('Birleştir açıkken --birlestir: yeni pencere açıldı', false);
    }
    await araclariKapat();

    // Desteklenmeyen ve olmayan dosyalar atlanır
    await ikinci(['--donustur', G.txt(), G.pdf(), path.join(GIRDI, 'olmayan.pdf')]);
    d = await satirlarBekle('donustur', 1);
    sonuc('--donustur: .txt ve olmayan dosya atlanır, PDF araçta', J(d.donustur) === J([ad(G.pdf())]), d.donustur);
    await araclariKapat();
    await ikinci(['--birlestir', G.txt(), path.join(GIRDI, 'olmayan.pdf')]);
    await bekle(1500);
    d = await durum();
    sonuc('Uygun dosya kalmazsa araç açılmaz, sekme açılmaz', !d.donusturAcik && !d.birlestirAcik && J(d.sekmeler) === J(sekmeOnce), d);

    // Liste dosyası (%TEMP%\PDEfe\sagtik-*.txt): okunur, silinir
    const liste = listeYaz(LISTE_KLASORU, `sagtik-49-${Date.now()}-1.txt`, ['pdefe-dosya-listesi-1', G.pdf(), G.png(), G.pdf2()]);
    await ikinci(['--birlestir', `--dosya-listesi=${liste}`]);
    d = await satirlarBekle('birlestir', 3);
    sonuc('--dosya-listesi: Birleştir listedeki dosyalarla, sırayla', J(d.birlestir) === J([ad(G.pdf()), ad(G.png()), ad(G.pdf2())]), d.birlestir);
    sonuc('Liste dosyası okunduktan sonra silindi', !fs.existsSync(liste), liste);
    await araclariKapat();
    // %TEMP%\PDEfe dışındaki liste ve başlığı yanlış liste: okunmaz, silinmez
    const disarida = listeYaz(UI, `sagtik-49-${Date.now()}-2.txt`, ['pdefe-dosya-listesi-1', G.pdf()]);
    const basliksiz = listeYaz(LISTE_KLASORU, `sagtik-49-${Date.now()}-3.txt`, ['baska-bir-baslik', G.pdf()]);
    const adiYanlis = listeYaz(LISTE_KLASORU, `liste-49-${Date.now()}.txt`, ['pdefe-dosya-listesi-1', G.pdf()]);
    await ikinci(['--donustur', `--dosya-listesi=${disarida}`, `--dosya-listesi=${basliksiz}`, `--dosya-listesi=${adiYanlis}`]);
    await bekle(1500);
    d = await durum();
    sonuc('Başka klasördeki, başlığı ya da adı yanlış liste okunmaz (araç açılmaz)', !d.donusturAcik, d);
    sonuc('O listeler silinmedi', fs.existsSync(disarida) && fs.existsSync(basliksiz) && fs.existsSync(adiYanlis));
    for (const y of [disarida, basliksiz, adiYanlis]) fs.rmSync(y, { force: true });

    // Gerçek ikinci süreç: Chromium'un tek örnek yolu komut satırını açık örneğe iletir
    await araclariKapat();
    let r = await ikinciSurec(['--birlestir', G.pdf2(), G.tif(), G.png()]);
    d = await satirlarBekle('birlestir', 3);
    sonuc(`Gerçek ikinci süreç (--birlestir): çıktı (kod ${r.kod}, ${r.sure} ms), açık örnekte Birleştir verilen sırayla`, r.kod === 0 && J(d.birlestir) === J([ad(G.pdf2()), ad(G.tif()), ad(G.png())]), { r, d: d.birlestir });
    sonuc('Gerçek ikinci süreç: yeni pencere açılmadı', (await hedefler()).length === 1, (await hedefler()).length);
    await araclariKapat();
    const liste2 = listeYaz(LISTE_KLASORU, `sagtik-49-${Date.now()}-4.txt`, ['pdefe-dosya-listesi-1', G.jpg(), G.pdf()]);
    r = await ikinciSurec(['--donustur', `--dosya-listesi=${liste2}`]);
    d = await satirlarBekle('donustur', 2);
    sonuc(`Gerçek ikinci süreç (--donustur --dosya-listesi): kod ${r.kod}, Format Değiştir listedeki sırayla, liste silindi`, r.kod === 0 && J(d.donustur) === J([ad(G.jpg()), ad(G.pdf())]) && !fs.existsSync(liste2), { r, d: d.donustur });
    await araclariKapat();
    // Anahtarsız komut satırı eskisi gibi: PDF sekmede
    r = await ikinciSurec([G.pdf()]);
    await kosul(`[...window.__pdefe.belgeler.values()].some((b) => b.ad === ${J(ad(G.pdf()))})`, 15000);
    d = await durum();
    sonuc('Anahtarsız ikinci süreç: PDF eskisi gibi sekmede açılır, araç açılmaz', d.sekmeler.includes(ad(G.pdf())) && !d.donusturAcik && !d.birlestirAcik, d);
    await sekmeleriKapat();
  }

  if (bolum.includes('B')) {
    console.log('— B: kapalı PDEfe sağ tıkla açılır (ilk örnek, test\\baslat.ps1 -EkDosya)');
    for (const [arac, dosyalar, alan] of [['--donustur', [G.png(), G.pdf2(), G.tif()], 'donustur'], ['--birlestir', [G.pdf(), G.jpg()], 'birlestir']]) {
      const veri = path.join(os.tmpdir(), `pdefe-s49-ilk-${ILK_PORT}`);
      fs.rmSync(veri, { recursive: true, force: true });
      const ek = path.join(UI, `ek-${alan}.txt`);
      fs.writeFileSync(ek, [arac, ...dosyalar].join('\n'), 'utf8');
      const s = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'baslat.ps1'), '-Port', String(ILK_PORT), '-Veri', veri, '-EkDosya', ek], { encoding: 'utf8', windowsHide: true });
      const pid = /PID=(\d+)/.exec(s.stdout || '')?.[1];
      if (!pid) { sonuc(`İlk örnek ${arac}: başlatıldı`, false, (s.stdout || '') + (s.stderr || '')); continue; }
      try {
        let d = null;
        for (let i = 0; i < 80; i++) {
          d = await portEval(ILK_PORT, DURUM).catch(() => null);
          if (d && d[alan].length >= dosyalar.length) break;
          await bekle(250);
        }
        await bekle(500);
        d = await portEval(ILK_PORT, DURUM);
        sonuc(`İlk örnek ${arac} (${dosyalar.length} dosya): araç ilk pencerede, verilen sırayla, sekme yok`, J(d[alan]) === J(dosyalar.map(ad)) && d.sekmeler.length === 0, d);
        const baslangic = await portEval(ILK_PORT, `!document.querySelector('#baslangic').hidden`);
        sonuc(`İlk örnek ${arac}: aracın arkasında açılış ekranı`, baslangic === true, baslangic);
      } finally {
        spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'durdur.ps1'), '-SurecId', pid], { windowsHide: true });
        await bekle(1500);
        fs.rmSync(veri, { recursive: true, force: true, maxRetries: 5 });
      }
    }
  }

  console.log(`\n${denetim} denetim, ${hataSayisi} hata`);
  if (hataSayisi) process.exitCode = 1;
}
