// Senaryo 33 (0.2.5, kullanıcı istekleri): güncelleme şeridi sahte güncelleyiciyle (gelistirme.js) ve açılış ekranının son açılanları.
//   Şerit: indirme sürerken "İndirme bitene dek PDEfe'yi kapatmayın." uyarısı; indirme başlayınca bekleyenGuncelleme yazılır (yarım kalırsa
//   sonraki açılışta şerit yeniden görünür; birim denemesi ve guncelleme-e2e kapsar); donan indirme bekçi tarafından kesilir (Türkçe ileti,
//   Yeniden dene); bağlantı koparsa Türkçe ileti; kaydedilmemiş belge varken indirme bitince sorulur, Vazgeç → "Kur ve yeniden başlat",
//   sonra kurulum (sahte quitAndInstall) bir kez.
//   Son açılanlar: belgenin adı uzantısız (".pdf" / ".PDF" yok; addaki öteki noktalar kalır), simge uygulamanın simgesi (build/icon.svg),
//   ipucunda tam yol.
// Kullanım (sahte güncelleyici yalnızca geliştirme örneğinde, PDEFE_TEST_GUNCELLEME ile):
//   $env:PDEFE_TEST_GUNCELLEME="9.9.9"; powershell -File test\baslat.ps1 -Port 9433 -Veri "%TEMP%\pdefe-s33-9433"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9433; node test\surucu.mjs betik test\senaryo33.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = path.join(KOK, 'test', 'cikti', 's33');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

const SERIT = `(() => { const s = document.querySelector('#guncelleme-seridi');
  return { gizli: s.hidden, asama: s.dataset.asama || '', metin: s.querySelector('.metin')?.textContent || '', kalin: s.querySelector('.metin b.uyari')?.textContent || '',
    dugmeler: [...s.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { ad: b.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 }; }) }; })()`;

export default async function ({ evalJs, bekle, tikla }) {
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  const serit = () => evalJs(SERIT);
  const bekleSerit = async (f, sure = 15000) => { const t0 = Date.now(); for (;;) { const s = await serit(); if (f(s) || Date.now() - t0 > sure) return s; await bekle(100); } };
  const bas = async (ad) => { const s = await serit(); const d = s.dugmeler.find((b) => b.ad === ad); if (!d) throw new Error(`Düğme yok: ${ad} (${J(s)})`); await tikla(d.x, d.y); };
  const senaryo = (s) => evalJs(`window.pdefe.cagir('test:guncellemeSenaryosu', ${J(s)})`);
  const kayit = () => evalJs(`window.pdefe.cagir('test:guncellemeKaydi')`);
  if (!(await evalJs(`window.pdefe.cagir('test:guncellemeKaydi').then(() => true, () => false)`))) throw new Error('Sahte güncelleyici yok: örneği PDEFE_TEST_GUNCELLEME ile başlatın.');

  // ---------------------------------------------------------------- 1. Son açılanlar
  console.log('— Son açılanlar');
  fs.rmSync(CIKTI, { recursive: true, force: true });
  fs.mkdirSync(CIKTI, { recursive: true });
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), [path.join(KOK, 'test', 'ornek_pdf_uret.py'), path.join(CIKTI, 'Örnek Dilekçe.PDF'), '1'], { stdio: 'ignore' });
  fs.copyFileSync(path.join(CIKTI, 'Örnek Dilekçe.PDF'), path.join(CIKTI, 'karar.v2.pdf'));
  fs.copyFileSync(path.join(CIKTI, 'Örnek Dilekçe.PDF'), path.join(CIKTI, 'taranmis.pdf'));
  for (const ad of ['karar.v2.pdf', 'Örnek Dilekçe.PDF', 'taranmis.pdf']) {
    await evalJs(`window.__pdefe.dosyaAc(${J(path.join(CIKTI, ad))}).then(() => 1)`);
    await kosul(`window.__pdefe.aktif()?.gorunum.hazir`, 10000);
  }
  for (let i = 0; i < 3; i++) { await evalJs(`(window.__pdefe.komutCalistir('sekme.kapat'), 1)`); await bekle(300); }
  await kosul(`document.querySelectorAll('#son-dosyalar .karsilama-oge').length >= 3`, 5000);
  const liste = await evalJs(`[...document.querySelectorAll('#son-dosyalar .karsilama-oge')].slice(0, 3).map((o) => { const i = o.querySelector('.karsilama-oge-ikon img'), r = i?.getBoundingClientRect();
    return { ad: o.querySelector('.ad').textContent, ipucu: o.title, src: i?.getAttribute('src'), yuklendi: !!i && i.complete && i.naturalWidth > 0, w: r?.width, h: r?.height, svg: !!o.querySelector('.karsilama-oge-ikon svg') }; })`);
  sonuc('Adlar uzantısız (".pdf" / ".PDF" yok, addaki öteki noktalar kalır)', J(liste.map((x) => x.ad)) === J(['taranmis', 'Örnek Dilekçe', 'karar.v2']), liste.map((x) => x.ad));
  sonuc('İpucunda tam yol, uzantısıyla', liste[0]?.ipucu === path.join(CIKTI, 'taranmis.pdf') && liste[1]?.ipucu.endsWith('Örnek Dilekçe.PDF'), liste.map((x) => x.ipucu));
  sonuc('Simge uygulamanın simgesi (build/icon.svg), yüklendi, 22 px; eski çizim yok', liste.every((x) => /build\/icon\.svg$/.test(x.src) && x.yuklendi && x.w === 22 && x.h === 22 && !x.svg), liste);

  // ---------------------------------------------------------------- 2. Şerit: indirme sürerken uyarı, bekleyen kaydı
  console.log('— Güncelleme şeridi');
  await senaryo({ surum: '9.9.9', hata: null, sureMs: 6000 });
  await evalJs(`(window.__pdefe.komutCalistir('yardim.guncelle'), 1)`);
  const s0 = await bekleSerit((s) => s.asama === 'var');
  sonuc('Elle denetim: şerit "PDEfe 9.9.9 hazır", Güncelle düğmesi', s0.asama === 'var' && /PDEfe 9\.9\.9 hazır/.test(s0.metin) && s0.dugmeler.some((d) => d.ad === 'Güncelle'), s0);
  await evalJs(`window.pdefe.cagir('ayar:koy', 'bekleyenGuncelleme', '')`);
  // Donan indirme: bekçi (sahte güncelleyicide 3 sn) keser
  await senaryo({ hata: 'donma', sureMs: 2000 });
  await bas('Güncelle');
  const s1 = await bekleSerit((s) => s.asama === 'indiriliyor' && /%[1-9]/.test(s.metin));
  sonuc('İndirme sürerken: "İndirme bitene dek PDEfe\'yi kapatmayın." (kalın)', s1.asama === 'indiriliyor' && /indiriliyor %\d+.*\. İndirme bitene dek PDEfe'yi kapatmayın\.$/.test(s1.metin) && s1.kalin === "İndirme bitene dek PDEfe'yi kapatmayın.", s1);
  sonuc('İndirme başlayınca bekleyenGuncelleme yazıldı (yarım kalırsa sonraki açılışta şerit)', (await evalJs(`window.pdefe.cagir('ayar:al', 'bekleyenGuncelleme')`)) === '9.9.9');
  const t0 = Date.now();
  const s2 = await bekleSerit((s) => s.asama === 'hata', 15000);
  const sure = (Date.now() - t0) / 1000;
  sonuc(`Donan indirme kesildi (${sure.toFixed(1)} sn): Türkçe ileti ve Yeniden dene`, s2.asama === 'hata' && s2.metin === 'Güncelleme indirilemedi. İndirme ilerlemiyor; internet bağlantısını denetleyip yeniden deneyin.'
    && s2.dugmeler.some((d) => d.ad === 'Yeniden dene') && sure < 10, s2);
  sonuc('Sahte güncelleyici iptali gördü', (await kayit()).iptaller === 1, await kayit());
  // Bağlantı koptu
  await senaryo({ hata: 'indirme', sureMs: 1500 });
  await bas('Yeniden dene');
  const s3 = await bekleSerit((s) => s.asama === 'hata' && /Sunucuya/.test(s.metin), 10000);
  sonuc('Bağlantı koptu: "Sunucuya ulaşılamadı; internet bağlantısını denetleyin." ve Yeniden dene', s3.metin === 'Güncelleme indirilemedi. Sunucuya ulaşılamadı; internet bağlantısını denetleyin.' && s3.dugmeler.some((d) => d.ad === 'Yeniden dene'), s3);

  // ---------------------------------------------------------------- 3. Kaydedilmemiş belge: indirme bitince sorulur
  console.log('— Kaydedilmemiş belge');
  const pdf = path.join(CIKTI, 'taranmis.pdf');
  await evalJs(`(async () => { const p = window.__pdefe; const b = await p.dosyaAc(${J(pdf)}); await new Promise((r) => setTimeout(r, 1000)); await p.sayfalariDondur(b, [1], 90, 'Sayfayı döndür'); return 1; })()`);
  sonuc('Belgede kaydedilmemiş değişiklik var', !!(await evalJs(`window.__pdefe.aktif()?.degisti ?? window.__pdefe.aktif()?.gorunum?.degisti ?? true`)));
  await evalJs(`window.__pdefeOtoYanit = { secim: 2 }; true`);   // kaydetme sorusu: Vazgeç
  await senaryo({ hata: null, sureMs: 1500 });
  const once = (await kayit()).kurulumlar.length;
  await bas('Yeniden dene');
  const s4 = await bekleSerit((s) => s.asama === 'hazir' || s.asama === 'hata', 15000);
  const soru = await evalJs(`JSON.stringify(window.__pdefeOtoYanit.son?.mesaj || null)`);
  sonuc('İndirme bitince kaydedilmemiş belge soruldu; Vazgeç → "Kur ve yeniden başlat", kurulum yok', s4.asama === 'hazir' && s4.dugmeler.some((d) => d.ad === 'Kur ve yeniden başlat')
    && soru !== 'null' && (await kayit()).kurulumlar.length === once, { s4, soru });
  await evalJs(`window.__pdefeOtoYanit = { secim: 1 }; true`);   // Kaydetme
  await bas('Kur ve yeniden başlat');
  const s5 = await bekleSerit((s) => s.asama === 'kuruluyor' || s.asama === 'hata', 10000);
  const k = await kayit();
  sonuc('Kur ve yeniden başlat: yeniden indirmeden kurulum bir kez (sessiz, yeniden açılış)', s5.asama === 'kuruluyor' && k.kurulumlar.length === once + 1 && J(k.kurulumlar.at(-1)) === J({ isSilent: true, isForceRunAfter: true }), { s5, k });

  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti`);
  if (hataSayisi) process.exitCode = 1;
}
