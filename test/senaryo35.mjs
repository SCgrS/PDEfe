// Senaryo 35 (0.2.6, kullanıcı isteği): Sayfaları düzenle'de sayfa kopyalama. "Kartın altında döndür düğmesinin sağına, sil düğmesinin
// soluna kopyala simgesi; basınca sayfa kopyalanır, hemen sağına yapıştırılır"; Ctrl+C / Ctrl+V; sağ tık: kopyala, döndür, sil.
//   1) Kart düğmeleri: Sola döndür, Sağa döndür, Kopyala ("Kopyala (sağına ekler)"), Sil sırasıyla; dördü kartın içine sığar, üst üste
//      binmez. Yeni pencerede pano boştur: boş alana sağ tıkta Yapıştır devre dışı.
//   2) Kopyala düğmesi: seçili olmayan kartta yalnızca o kartın kopyası hemen sağına eklenir, kopya seçili olur ("7 sayfa · 1 seçili ·
//      değişti"), küçük resmi özgününkiyle aynı; seçili kartta seçilenlerin hepsi, sırasıyla, sonuncusunun sağına. Ctrl+Z / Ctrl+Y.
//      Düğme pencerenin panosunu da doldurur (ardından Ctrl+V aynı sayfayı ekler). Döndürülmüş sayfanın kopyası döndürülmüş (rozet,
//      küçük resim), boş sayfanın kopyası boş sayfa.
//   3) Sağ tık: kartta Kopyala, Yapıştır, —, Sola döndür, Sağa döndür, —, Sil; seçili olmayan karta sağ tık yalnızca onu seçer, seçili karta
//      sağ tık seçimi korur ve etiketler "(n)" alır; Kopyala düğmeyle aynı işi yapar, Sağa döndür seçilenlerin hepsini döndürür; bütün
//      sayfalar seçiliyken Sil devre dışı. Boş alanda Yapıştır, —, Tümünü seç; Yapıştır son seçilinin arkasına (seçim yoksa sona) ekler.
//   4) "Yeni belge olarak kaydet": kopyalı düzen yeni dosyaya yazılır (PyMuPDF: sayfa metinlerinin sırası; kopya sayfalarda notlar da
//      var); özgün dosya değişmez.
//   5) "Üzerine yaz": sekmenin sayfa listesinde aynı sayfa iki kez, dosyada 7 sayfa ve iki kopyada da notlar. Özgün sayfadaki not sekmede
//      silinip kaydedilince iki kopyadan da silinir (0.2.6 yapisal.py; önceden kopyada kalıyordu). Ctrl+Z not silmeyi, sonra düzeni geri alır.
// Girdiler test/cikti/s35/<zaman>/pdf altında PyMuPDF ile üretilir (gerçek belge yok); menü seçimi pencerenin test kancasıyla
// (window.__pdefeMenuYaniti), tıklamalar ve tuşlar gerçek fare / tuş olayıyla. Sistem panosuna dokunulmaz.
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9435 -Veri "%TEMP%\pdefe-s35-9435" -Boyut "1280,1000"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9435; node test\surucu.mjs betik test\senaryo35.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = path.join(KOK, 'test', 'cikti', 's35', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PDF = path.join(K, 'pdf'), PNG = path.join(K, 'png'), CIKTI = path.join(K, 'cikti');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

/** Python (proje .venv) çalıştırır; son satırı JSON olarak döner. */
function py(kod) {
  const cikti = execFileSync(PY, ['-X', 'utf8', '-c', 'import json, os\nimport pymupdf\n' + kod], { encoding: 'utf8' });
  return JSON.parse(cikti.trim().split(/\r?\n/).pop());
}

/** Dosyanın sayfa metinleri (ilk satır) ve sayfa başına notlar [tür, içerik]. */
const dosyaOzeti = (yol) => py(`d = pymupdf.open(${J(yol)})
print(json.dumps({"metin": [p.get_text().strip().split("\\n")[0] for p in d], "notlar": [[[a.type[1], a.info.get("content") or ""] for a in p.annots() if a.type[1] != "Popup"] for p in d]}, ensure_ascii=False))`);

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, tus }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(120); } };
  const ss = async (ad) => { await bekle(200); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const merkez = async (sec) => JSON.parse(await evalJs(`(() => { const e = ${sec}; if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify([Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]); })()`));
  const kutuDugmesi = async (metin) => { const m = await merkez(`[...[...document.querySelectorAll('.mesaj-kutusu')].at(-1)?.querySelectorAll('.dugmeler button') || []].find((b) => b.textContent === ${J(metin)})`); if (!m) throw new Error('Düğme yok: ' + metin); await tikla(...m); await bekle(400); };
  const bildirim = () => evalJs(`(() => { const b = document.querySelector('#bildirim'); return b && !b.hidden ? b.textContent : ''; })()`);
  /** Araç pencerelerini uygulamanın kendi yoluyla kapatır (çıkış sorularına Kaydetme), sonra belgeleri. */
  const hepsiniKapat = async () => {
    await evalJs(`(async () => { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) window.__s35Kapatiliyor = m.aracPencereleriniKapat(); return true; })()`);
    for (let i = 0; i < 20 && await evalJs(`import('pdefe://app/src/renderer/araclar/ortak.js').then((m) => m.acikAracPenceresiVar())`); i++) {
      if (await evalJs(`!!document.querySelector('.mesaj-kutusu')`)) await kutuDugmesi('Kaydetme'); else await bekle(200);
    }
    return evalJs(`(async () => { document.querySelectorAll('.diyalog-ortusu').forEach((e) => e.remove()); for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  };
  const ac = async (yol) => {
    await evalJs(`window.__pdefe.dosyaAc(${J(yol)}).then(() => true)`);
    await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi && window.__pdefe.aktif().notlar?.yuklendi`);
    await bekle(300);
  };
  const sayfalariAc = async () => {
    await evalJs(`window.__pdefe.komutCalistir('arac.sayfalar')`);
    await kosul(`!!document.querySelector('.sayfalar-pencere')`);
    await kosul(`document.querySelectorAll('.sayfalar-izgara > .sayfa-karti img').length >= 6`, 15000);
    await bekle(300);
  };

  // ---------------------------------------------------------------- hazırlık
  for (const k of [PDF, PNG, CIKTI]) fs.mkdirSync(k, { recursive: true });
  // Altı sayfa; 2. sayfada vurgu ve not, 4. sayfada başka programın yazdığı yazı kutusu (FreeText). Biri "Yeni belge", biri "Üzerine yaz" için
  const Y = py(`k = ${J(PDF)}
def pdf(ad):
    d = pymupdf.open()
    for i in range(6):
        pg = d.new_page(width=595, height=842)
        pg.insert_text((72, 200), "Sayfa %d" % (i + 1), fontsize=60)
        pg.draw_rect(pymupdf.Rect(60, 60, 535, 782), color=(0.2, 0.4, 0.8), width=4)
    s2 = d[1]
    h = s2.add_highlight_annot(pymupdf.Rect(72, 150, 330, 210)); h.set_info(content="Vurgu 2"); h.update()
    t = s2.add_text_annot((450, 300), "Not 2"); t.update()
    f = d[3].add_freetext_annot(pymupdf.Rect(72, 400, 400, 460), "Yazi 4", fontsize=18); f.update()
    y = os.path.join(k, ad); d.save(y); d.close(); return y
print(json.dumps({"ana": pdf("ana.pdf"), "uzerine": pdf("uzerine.pdf")}))`);
  await tus('Escape');
  await hepsiniKapat();
  await evalJs(`(() => { window.__s35Hatalar = []; if (window.__s35Dinleyici) return true; window.__s35Dinleyici = true;
    addEventListener('error', (e) => window.__s35Hatalar.push('error: ' + e.message)); addEventListener('unhandledrejection', (e) => window.__s35Hatalar.push('reject: ' + (e.reason?.message || e.reason)));
    const ce = console.error; console.error = (...a) => { window.__s35Hatalar.push('console.error: ' + a.map(String).join(' ')); ce.apply(console, a); }; return true; })()`);
  await evalJs(`(async () => { for (const [k, v] of Object.entries({ ciktiKlasoru: ${J(CIKTI)}, otomatikKaydet: false })) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; } return true; })()`);
  // Sayfa tarafı yardımcılar: kart kimliği (kaynak sayfa numarası; boş sayfa 'bos'), durum, konum
  await evalJs(`(() => { window.__s35 = {
    kartId(e) { const m = / — sayfa (\\d+)/.exec(e.title); return m ? m[1] : 'bos'; },
    kartlar() { return [...document.querySelectorAll('.sayfalar-izgara > .sayfa-karti')]; },
    durum() { const k = this.kartlar(); const r = (e) => { const z = e.querySelector('.rozet.dondurme'); return z.hidden ? 0 : parseInt(z.textContent, 10); };
      return { sira: k.map((e) => this.kartId(e)), secili: k.map((e, i) => (e.classList.contains('secili') ? i : -1)).filter((i) => i >= 0), rozet: k.map(r),
        sayac: document.querySelector('.sayfalar-arac-cubugu .sayac')?.textContent, odakta: document.querySelector('.sayfalar-izgara').contains(document.activeElement) }; },
    kart(i) { const e = this.kartlar()[i]; if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect();
      return { x: b.left, y: b.top, r: b.right, b: b.bottom, cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + 40), my: Math.round(b.top + b.height / 2) }; },
    dugme(i, komut) { const e = this.kartlar()[i]?.querySelector('[data-kart-komut="' + komut + '"]'); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; },
    /** İki kartın arasındaki boşluk (ızgaranın kendisi): sağ tık ve tıklama boş alana */
    bosluk() { const k = this.kartlar(); const a = k[0].getBoundingClientRect(), b = k[1].getBoundingClientRect(); const x = Math.round((a.right + b.left) / 2), y = Math.round(a.top + a.height / 2);
      return document.elementFromPoint(x, y) === document.querySelector('.sayfalar-izgara') ? [x, y] : null; },
  }; return true; })()`);
  const durum = () => evalJs(`window.__s35.durum()`);
  const kart = (i) => evalJs(`window.__s35.kart(${i})`);
  const kartTikla = async (i, degistiriciler = []) => { const k = await kart(i); await tikla(k.cx, k.cy, { degistiriciler }); await bekle(100); };
  const kartDugmesi = async (i, komut) => { await kart(i); const m = await evalJs(`window.__s35.dugme(${i}, ${J(komut)})`); if (!m) throw new Error(`Kart düğmesi yok: ${i} ${komut}`); await tikla(...m); await bekle(200); };
  /** Gerçek sağ tık; menü pencerenin test kancasıyla yanıtlanır (secim: seçilen öğenin kimliği, null: hiçbiri). Döner: öğeler ["Kopyala",
   *  "(Yapıştır)" (devre dışı), "—" (ayırıcı) …] ya da menü açılmadıysa null. */
  const sagTik = async (x, y, secim = null) => {
    await evalJs(`(() => { window.__pdefeMenuYaniti = { secim: ${J(secim)}, son: null }; return true; })()`);
    await tikla(x, y, { dugme: 'right' });
    await bekle(300);
    const son = await evalJs(`(() => { const k = window.__pdefeMenuYaniti; delete window.__pdefeMenuYaniti; return k?.son || null; })()`);
    return son && son.map((o) => (o.ayirici ? '—' : o.devre ? `(${o.etiket})` : o.etiket));
  };
  const kartSagTik = async (i, secim = null) => { const k = await kart(i); return sagTik(k.cx, k.cy, secim); };
  const bosSagTik = async (secim = null) => { const p = await evalJs(`window.__s35.bosluk()`); if (!p) throw new Error('Kartlar arasında boş alan bulunamadı'); return sagTik(...p, secim); };
  const geriAl = async (n = 1) => { for (let i = 0; i < n; i++) { await tus('z', ['ctrl']); await bekle(120); } };
  const ayni = (a, b) => J(a) === J(b);
  const ALTI = ['1', '2', '3', '4', '5', '6'];
  const MENU_KART = (ek = '', yapistirDevre = false, silDevre = false) => ['Kopyala' + ek, yapistirDevre ? '(Yapıştır)' : 'Yapıştır', '—', 'Sola döndür' + ek, 'Sağa döndür' + ek, '—', silDevre ? `(Sil${ek})` : 'Sil' + ek];

  // ---------------------------------------------------------------- 1) Kart düğmeleri
  console.log('\n== 1) Kart düğmeleri');
  await ac(Y.ana);
  await sayfalariAc();
  let d = await durum();
  sonuc('Başlangıç: 6 kart, seçim yok', ayni(d.sira, ALTI) && d.secili.length === 0, d);
  const bosMenu = await bosSagTik();
  sonuc('Yeni pencerede pano boş: boş alana sağ tıkta "Yapıştır" devre dışı, "Tümünü seç" etkin', ayni(bosMenu, ['(Yapıştır)', '—', 'Tümünü seç']), bosMenu);
  const kartMenusuBos = await kartSagTik(0);
  sonuc('Pano boşken kartın menüsünde de "Yapıştır" devre dışı', ayni(kartMenusuBos, MENU_KART('', true)), kartMenusuBos);
  const dugmeler = await evalJs(`(() => { const e = window.__s35.kartlar()[0]; const k = e.getBoundingClientRect(); const b = [...e.querySelectorAll('.kart-dugmeler button')];
    const r = b.map((x) => x.getBoundingClientRect()); return { komut: b.map((x) => x.dataset.kartKomut), baslik: b.map((x) => x.title),
      icinde: r.length === 4 && r.every((x) => x.left >= k.left && x.right <= k.right && x.width >= 20), ayrik: r.every((x, i) => !i || x.left >= r[i - 1].right - 0.5),
      gorunur: getComputedStyle(e.querySelector('.kart-dugmeler')).opacity }; })()`);
  sonuc('Kart düğmeleri sırası: Sola döndür, Sağa döndür, Kopyala ("Kopyala (sağına ekler)"), Sil', ayni(dugmeler.komut, ['sola', 'saga', 'kopyala', 'sil'])
    && ayni(dugmeler.baslik, ['Sola döndür', 'Sağa döndür', 'Kopyala (sağına ekler)', 'Sil']), dugmeler);
  sonuc('Dört düğme kartın içine sığar, üst üste binmez (seçili kartta görünür)', dugmeler.icinde && dugmeler.ayrik && dugmeler.gorunur === '1', dugmeler);
  await ss('01-kart-dugmeleri');

  // ---------------------------------------------------------------- 2) Kopyala düğmesi
  console.log('\n== 2) Kopyala düğmesi');
  await kartTikla(0);
  await kartDugmesi(2, 'kopyala');   // 3. sayfa, seçili değil
  await kosul(`window.__s35.kartlar().length === 7`, 3000);
  d = await durum();
  sonuc('Seçili olmayan kartın Kopyala\'sı: kopyası hemen sağına (1 2 3 3 4 5 6), yalnızca kopya seçili, sayaç "7 sayfa · 1 seçili · değişti"',
    ayni(d.sira, ['1', '2', '3', '3', '4', '5', '6']) && ayni(d.secili, [3]) && d.sayac === '7 sayfa · 1 seçili · değişti', d);
  await kosul(`!!window.__s35.kartlar()[3].querySelector('.resim-kutu img')`, 5000);
  const resim = await evalJs(`(() => { const k = window.__s35.kartlar(); const a = k[2].querySelector('.resim-kutu img'), b = k[3].querySelector('.resim-kutu img'); return { ayni: !!a && !!b && a.src === b.src, rozetYeni: !k[3].querySelector('.rozet.yeni').hidden }; })()`);
  sonuc('Kopyanın küçük resmi özgününkiyle aynı (aynı önbellek), "yeni" rozeti yok (aynı belgenin sayfası)', resim.ayni && !resim.rozetYeni, resim);
  await geriAl();
  d = await durum();
  sonuc('Ctrl+Z: kopya kalkar, seçim önceki hâline döner (1), "değişti" yok', ayni(d.sira, ALTI) && ayni(d.secili, [0]) && !/değişti/.test(d.sayac), d);
  await tus('y', ['ctrl']); await bekle(150);
  d = await durum();
  sonuc('Ctrl+Y: kopya geri gelir', ayni(d.sira, ['1', '2', '3', '3', '4', '5', '6']) && ayni(d.secili, [3]), d);
  // Düğme panoyu da doldurur: 6'yı seçip Ctrl+V → 3'ün bir kopyası daha 6'nın arkasına
  await kartTikla(6);
  await tus('v', ['ctrl']); await bekle(200);
  d = await durum();
  sonuc('Kopyala düğmesi pencerenin panosunu da doldurur: ardından Ctrl+V (6 seçili) 3\'ü 6\'nın arkasına ekler', ayni(d.sira, ['1', '2', '3', '3', '4', '5', '6', '3']) && ayni(d.secili, [7]), d);
  await geriAl(2);
  d = await durum();
  if (!ayni(d.sira, ALTI)) throw new Error('Başlangıç düzenine dönülemedi: ' + J(d));
  // Seçili kartta: seçilenlerin hepsi (1, 2), sırasıyla, sonuncusunun sağına
  await kartTikla(0);
  await kartTikla(1, ['shift']);
  await kartDugmesi(1, 'kopyala');
  d = await durum();
  sonuc('Seçili kartın Kopyala\'sı: seçilenler (1, 2) sırasıyla sonuncusunun sağına (1 2 1 2 3 …), kopyalar seçili', ayni(d.sira, ['1', '2', '1', '2', '3', '4', '5', '6'])
    && ayni(d.secili, [2, 3]) && /^8 sayfa · 2 seçili · değişti$/.test(d.sayac), d);
  await geriAl();
  // Döndürülmüş sayfanın kopyası
  await kartTikla(3);
  await tus('r'); await bekle(150);
  await kartDugmesi(3, 'kopyala');
  await kosul(`!!window.__s35.kartlar()[4].querySelector('.resim-kutu img')`, 5000);
  d = await durum();
  const donukResim = await evalJs(`window.__s35.kartlar()[4].querySelector('.resim-kutu img')?.style.transform || ''`);
  sonuc('Döndürülmüş sayfanın (4, 90°) kopyası da 90°: rozet ve dönük küçük resim', ayni(d.sira, ['1', '2', '3', '4', '4', '5', '6']) && ayni(d.rozet, [0, 0, 0, 90, 90, 0, 0])
    && ayni(d.secili, [4]) && donukResim === 'rotate(90deg)', { d, donukResim });
  await ss('02-dondurulmus-kopya');
  await geriAl(2);
  // Boş sayfanın kopyası
  await kartTikla(4);
  await tikla(...(await merkez(`document.querySelector('.sayfalar-arac-cubugu [data-komut="bosEkle"]')`))); await bekle(200);
  await kartDugmesi(5, 'kopyala');
  d = await durum();
  const bosKopya = await evalJs(`(() => { const k = window.__s35.kartlar(); return [5, 6].map((i) => ({ baslik: k[i].title, kaynak: k[i].querySelector('.kaynak').textContent, bos: !!k[i].querySelector('.bos-sayfa') })); })()`);
  sonuc('Boş sayfanın kopyası boş sayfa (1 2 3 4 5 boş boş 6), kopya seçili', ayni(d.sira, ['1', '2', '3', '4', '5', 'bos', 'bos', '6']) && ayni(d.secili, [6])
    && bosKopya.every((b) => b.baslik === 'Boş sayfa' && b.bos && /^boş · 595×842 pt$/.test(b.kaynak)), { d, bosKopya });
  await ss('02-bos-kopya');
  await geriAl(2);
  d = await durum();
  sonuc('Ctrl+Z ile başlangıç düzenine dönüldü', ayni(d.sira, ALTI) && d.rozet.every((x) => x === 0) && !/değişti/.test(d.sayac), d);

  // ---------------------------------------------------------------- 3) Sağ tık menüsü
  console.log('\n== 3) Sağ tık menüsü');
  await kartTikla(0);
  let menu = await kartSagTik(2);
  d = await durum();
  sonuc('Seçili olmayan karta (3) sağ tık: yalnızca o seçilir; menü Kopyala, Yapıştır, —, Sola döndür, Sağa döndür, —, Sil', ayni(menu, MENU_KART()) && ayni(d.secili, [2]), { menu, d });
  await kartTikla(1);
  await kartTikla(3, ['ctrl']);
  menu = await kartSagTik(3);
  d = await durum();
  sonuc('Seçili karta (4; 2 ve 4 seçili) sağ tık: seçim korunur, etiketler "(2)"', ayni(menu, MENU_KART(' (2)')) && ayni(d.secili, [1, 3]), { menu, d });
  menu = await kartSagTik(3, 'kopyala');
  d = await durum();
  sonuc('Sağ tık › Kopyala (2): düğmeyle aynı, 2 ve 4\'ün kopyası 4\'ün hemen sağına, kopyalar seçili', ayni(d.sira, ['1', '2', '3', '4', '2', '4', '5', '6']) && ayni(d.secili, [4, 5]), d);
  menu = await kartSagTik(4, 'saga');
  d = await durum();
  sonuc('Sağ tık › Sağa döndür (2): seçilenlerin (kopyalar) hepsi 90°', ayni(d.rozet, [0, 0, 0, 0, 90, 90, 0, 0]) && ayni(menu, MENU_KART(' (2)')), { menu, d });
  await geriAl(2);
  d = await durum();
  sonuc('Ctrl+Z iki kez: döndürme ve kopyalar geri alınır', ayni(d.sira, ALTI) && d.rozet.every((x) => x === 0), d);
  // Boş alan: tıklama seçimi kaldırır; Yapıştır (pano: 2 ve 4) seçim yokken sona ekler
  const bos = await evalJs(`window.__s35.bosluk()`);
  await tikla(...bos); await bekle(150);
  sonuc('Boş alana tıklama seçimi kaldırır', (await durum()).secili.length === 0);
  menu = await bosSagTik('yapistir');
  d = await durum();
  sonuc('Boş alana sağ tık: Yapıştır, —, Tümünü seç; Yapıştır seçim yokken panodakileri (2, 4) sona ekler', ayni(menu, ['Yapıştır', '—', 'Tümünü seç'])
    && ayni(d.sira, [...ALTI, '2', '4']) && ayni(d.secili, [6, 7]), { menu, d });
  menu = await bosSagTik('tumunuSec');
  d = await durum();
  sonuc('Boş alana sağ tık › Tümünü seç: bütün sayfalar seçili', d.secili.length === 8 && /8 seçili/.test(d.sayac), { menu, d });
  menu = await kartSagTik(0);
  sonuc('Bütün sayfalar seçiliyken kartın menüsünde "Sil (8)" devre dışı', ayni(menu, MENU_KART(' (8)', false, true)), menu);
  menu = await bosSagTik();
  sonuc('Bütün sayfalar seçiliyken boş alanda "Tümünü seç" devre dışı', ayni(menu, ['Yapıştır', '—', '(Tümünü seç)']), menu);
  await ss('03-sag-tik');
  // Kapat: değişiklik var → Kaydetme
  await tus('Escape');
  if (await kosul(`!!document.querySelector('.mesaj-kutusu')`, 1500)) await kutuDugmesi('Kaydetme');
  sonuc('Pencere Esc → Kaydetme ile kapanır, belge değişmedi', await kosul(`!document.querySelector('.sayfalar-pencere')`, 4000) && !(await evalJs(`window.__pdefe.aktif().degisti`)));

  // ---------------------------------------------------------------- 4) Yeni belge olarak kaydet
  console.log('\n== 4) Yeni belge olarak kaydet');
  await sayfalariAc();
  await kartDugmesi(1, 'kopyala');                 // 2. sayfa (vurgu ve not) → 1 2 2 3 4 5 6
  await kartTikla(4);                              // 4. sayfa (yazı kutusu)
  await tus('c', ['ctrl']); await bekle(120);
  await tus('v', ['ctrl']); await bekle(200);      // → 1 2 2 3 4 4 5 6
  d = await durum();
  sonuc('Düzen: 1 2 2 3 4 4 5 6 (düğme ve Ctrl+C / Ctrl+V)', ayni(d.sira, ['1', '2', '2', '3', '4', '4', '5', '6']), d);
  const kayitKip = await evalJs(`document.querySelector('.sayfalar-pencere .arac-kayit-secim button[aria-checked="true"]')?.dataset.id || ''`);
  // Ctrl+C'nin bildirimi görünürken (3 sn) pencerenin alt şeridindeki Kaydet'e tıklanabilir: bildirim tıklamayı almaz (0.2.6; önceden
  // Kaydet'in üstüne düşüp tıklamayı yutuyordu)
  const kaydetUstu = await evalJs(`(() => { const b = document.querySelector('.sayfalar-pencere .arac-dugmeler [data-id="kaydet"]').getBoundingClientRect(); const t = document.querySelector('#bildirim');
    return { bildirim: !t.hidden && /kopyalandı/.test(t.textContent), ust: document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.dataset?.id || '' }; })()`);
  sonuc('Ctrl+C bildirimi görünürken Kaydet tıklanabilir (bildirim tıklamayı almaz)', kaydetUstu.bildirim && kaydetUstu.ust === 'kaydet', kaydetUstu);
  await tikla(...(await merkez(`document.querySelector('.sayfalar-pencere .arac-dugmeler [data-id="kaydet"]')`)));
  const kapandi = await kosul(`!document.querySelector('.sayfalar-pencere')`, 15000);
  await kosul(`window.__pdefe.aktif()?.gorunum?.sayfaSayisi === 8`, 10000);
  await bekle(300);
  const yeniDosyalar = fs.readdirSync(CIKTI).filter((f) => /\.pdf$/i.test(f));
  const yeniOzet = yeniDosyalar.length === 1 ? dosyaOzeti(path.join(CIKTI, yeniDosyalar[0])) : null;
  const sekmeYeni = await evalJs(`({ ad: window.__pdefe.aktif()?.ad, sayfa: window.__pdefe.aktif()?.gorunum?.sayfaSayisi })`);
  sonuc('"Yeni belge olarak kaydet" (varsayılan): pencere kapanır, tek yeni dosya yeni sekmede (8 sayfa)', kayitKip === 'yeni' && kapandi && yeniDosyalar.length === 1 && sekmeYeni.sayfa === 8 && sekmeYeni.ad === yeniDosyalar[0],
    { kayitKip, kapandi, yeniDosyalar, sekmeYeni });
  const NOT2 = [['Highlight', 'Vurgu 2'], ['Text', 'Not 2']], NOT4 = [['FreeText', 'Yazi 4']];
  sonuc('Yeni dosyada sayfa sırası 1 2 2 3 4 4 5 6 (PyMuPDF)', !!yeniOzet && ayni(yeniOzet.metin, ['Sayfa 1', 'Sayfa 2', 'Sayfa 2', 'Sayfa 3', 'Sayfa 4', 'Sayfa 4', 'Sayfa 5', 'Sayfa 6']), yeniOzet?.metin);
  sonuc('Yeni dosyada kopya sayfaların notları da var (2. ve 3. sayfada vurgu + not, 5. ve 6. sayfada yazı kutusu)', !!yeniOzet
    && ayni(yeniOzet.notlar, [[], NOT2, NOT2, [], NOT4, NOT4, [], []]), yeniOzet?.notlar);
  const anaOzet = dosyaOzeti(Y.ana);
  sonuc('Özgün dosya değişmedi (6 sayfa)', ayni(anaOzet.metin, ALTI.map((x) => 'Sayfa ' + x)) && ayni(anaOzet.notlar, [[], NOT2, [], NOT4, [], []]), anaOzet);

  // ---------------------------------------------------------------- 5) Üzerine yaz; kopyalı belgede not silme
  console.log('\n== 5) Üzerine yaz');
  // Önceki bölüm yarıda kaldıysa açık kalan araç penceresi kapatılır (sayfalariAc açık pencereye yeni pencere açmaz)
  await evalJs(`(async () => { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) m.aracPencereleriniKapat(); return true; })()`);
  for (let i = 0; i < 20 && await evalJs(`import('pdefe://app/src/renderer/araclar/ortak.js').then((m) => m.acikAracPenceresiVar())`); i++) {
    if (await evalJs(`!!document.querySelector('.mesaj-kutusu')`)) await kutuDugmesi('Kaydetme'); else await bekle(200);
  }
  await ac(Y.uzerine);
  await sayfalariAc();
  await tikla(...(await merkez(`document.querySelector('.sayfalar-pencere .arac-kayit-secim button[data-id="uzerine"]')`))); await bekle(150);
  menu = await kartSagTik(1, 'kopyala');           // 1 2 2 3 4 5 6
  d = await durum();
  sonuc('Sağ tık › Kopyala ile düzen 1 2 2 3 4 5 6', ayni(d.sira, ['1', '2', '2', '3', '4', '5', '6']), { menu, d });
  await tikla(...(await merkez(`document.querySelector('.sayfalar-pencere .arac-dugmeler [data-id="kaydet"]')`)));
  await kosul(`!document.querySelector('.sayfalar-pencere')`, 15000);
  await kosul(`!window.__pdefe.aktif()?.kaydediliyor && !window.__pdefe.aktif()?.degisti`, 15000);
  await bekle(300);
  const sekme = await evalJs(`(() => { const b = window.__pdefe.aktif(); return { ad: b.ad, sayfalar: b.gorunum.sayfalar.map((s) => s.bos ? 'bos' : s.kaynak.sayfa), degisti: b.degisti,
    anlik: !!b.gorunum.anlik, kopyaNotu: b.notlar.sayfaNotlari(3).length, ozgunNotu: b.notlar.sayfaNotlari(2).length }; })()`);
  const uzBildirim = await bildirim();
  sonuc('Üzerine yaz: sekmenin sayfa listesinde 2. sayfa iki kez (1 2 2 3 4 5 6), belge kaydedilmiş, "Geri almak için Ctrl+Z" bildirimi', ayni(sekme.sayfalar, [1, 2, 2, 3, 4, 5, 6])
    && !sekme.degisti && /Sayfa düzeni uygulandı ve kaydedildi: 7 sayfa/.test(uzBildirim), { sekme, uzBildirim });
  let uzOzet = dosyaOzeti(Y.uzerine);
  sonuc('Dosyada 7 sayfa; 2. ve 3. sayfada vurgu + not', ayni(uzOzet.metin, ['Sayfa 1', 'Sayfa 2', 'Sayfa 2', 'Sayfa 3', 'Sayfa 4', 'Sayfa 5', 'Sayfa 6'])
    && ayni(uzOzet.notlar, [[], NOT2, NOT2, [], NOT4, [], []]), uzOzet);
  console.log(`     bilgi: sekmede kopya sayfanın notları belge yeniden açılınca görünür (2. sayfada ${sekme.ozgunNotu}, 3. sayfada ${sekme.kopyaNotu} not)`);
  // Özgün sayfadaki vurgu sekmede silinip kaydedilir: iki kopyadan da silinmeli
  const sil = await evalJs(`(async () => { const b = window.__pdefe.aktif(); const n = [...b.notlar.notlar.values()].find((x) => x.icerik === 'Vurgu 2' && !x.silindi);
    if (!n) return { yok: true }; b.notlar.sec(n.id); const silindi = b.notlar.silSecili(); const kaydedildi = await window.__pdefe.belgeKaydet(b); return { sayfa: n.sayfa, silindi, kaydedildi, degisti: b.degisti }; })()`);
  uzOzet = dosyaOzeti(Y.uzerine);
  const NOT2_SILINDI = [['Text', 'Not 2']];
  sonuc('Özgün sayfadaki vurgu silinip kaydedilince iki kopyadan da silinir, not kalır (0.2.6; önceden kopyada kalıyordu)', sil.silindi && sil.kaydedildi && !sil.degisti
    && ayni(uzOzet.notlar, [[], NOT2_SILINDI, NOT2_SILINDI, [], NOT4, [], []]), { sil, notlar: uzOzet.notlar });
  // Ctrl+Z: önce not silme, sonra sayfa düzeni geri alınır (kaydedilmemiş)
  await evalJs(`window.__pdefe.komutCalistir('duzen.geriAl')`); await bekle(300);
  const z1 = await evalJs(`(() => { const b = window.__pdefe.aktif(); return { vurgu: [...b.notlar.notlar.values()].some((x) => x.icerik === 'Vurgu 2' && !x.silindi), sayfa: b.gorunum.sayfaSayisi, degisti: b.degisti }; })()`);
  await evalJs(`window.__pdefe.komutCalistir('duzen.geriAl')`);
  await kosul(`window.__pdefe.aktif().gorunum.sayfaSayisi === 6`, 5000);
  const z2 = await evalJs(`(() => { const b = window.__pdefe.aktif(); return { sayfalar: b.gorunum.sayfalar.map((s) => s.kaynak?.sayfa), degisti: b.degisti }; })()`);
  sonuc('Ctrl+Z: önce vurgu geri gelir (7 sayfa), sonra kopya sayfa kalkar (6 sayfa, kaydedilmemiş)', z1.vurgu && z1.sayfa === 7 && z1.degisti && ayni(z2.sayfalar, [1, 2, 3, 4, 5, 6]) && z2.degisti, { z1, z2 });

  // ---------------------------------------------------------------- son
  const hatalar = await evalJs(`window.__s35Hatalar || []`);
  sonuc('Renderer konsolunda hata yok', hatalar.length === 0, hatalar);
  await evalJs(`(() => { delete window.__s35; return true; })()`);
  await hepsiniKapat();
  console.log(`\n${toplam} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}  (çıktılar: ${K})`);
  process.exitCode = hataSayisi ? 1 : 0;
}
