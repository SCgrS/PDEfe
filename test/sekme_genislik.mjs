// Sabit genişlikli sekmeler: her sekme aynı genişlikte, uzun ad üç noktayla kısalır, ipucunda tam ad ve yol; etkin sekme görünür
// kaydırılır; ◀ ▶, Ctrl+1–9, sürükleyerek sıralama (CDP sürükleme yakalama: işletim sisteminin sürükleme döngüsü açılmaz),
// Ctrl+Tab seçicisi, açık belgeler listesi ve Farklı kaydet sonrası ipucu. Ekran görüntüleri test/png/sekme altına.
// Kullanım: powershell -File test\baslat.ps1 -Port 9321 -Veri <klasör> [-Boyut "720,700"] [-Tema koyu]; $env:PDEFE_CDP_PORT=9321
//           node test\surucu.mjs betik test\sekme_genislik.mjs   (PDEFE_EK: ekran görüntüsü adlarına ek, ör. "dar-koyu")
import fs from 'node:fs';
import path from 'node:path';

const K = path.resolve('test/cikti/sekmeler');
const ADLAR = [
  'ustyazi (85).pdf', '(2)TensipZapti (9).pdf', 'a.pdf', 'Bilirkişi Raporu - Ek 1 - Hesap Tablosu ve Açıklamalar (son hali).pdf',
  '2099_12_BLR_BILIRKISI_EKRAPORU.pdf', 'İcra Emri (Örnek 7) düzeltilmiş.pdf', 'ustyazi (86).pdf', '(3)DurusmaZapti (12).pdf',
  'TBK.pdf', 'Tebligat Mazbatası - Ağustos 2026.pdf', 'Karar_2026_1234_Esas_2025_987.pdf', 'ek.pdf',
];
const KAYNAKLAR = ['dergipark_5104529_zamanasimi.pdf', 'dergipark_3972595_ttk_tbk.pdf'];
const EK = process.env.PDEFE_EK ? '-' + process.env.PDEFE_EK : '';
const js = (d) => JSON.stringify(d);

let hata = 0, tamam = 0;
function denetle(ad, kosul, ayrinti = '') {
  if (kosul) tamam++; else hata++;
  console.log(`${kosul ? 'TAMAM' : 'HATA '}  ${ad}${ayrinti ? '  — ' + ayrinti : ''}`);
}

/** surucu.mjs'teki gibi CDP bağlantısı; sürükle-bırakı Input.setInterceptDrags ile yakalamak için ham komut gerekir. */
async function cdp() {
  const hedefler = await (await fetch(`http://127.0.0.1:${process.env.PDEFE_CDP_PORT || 9222}/json`)).json();
  const sayfa = hedefler.find((h) => h.type === 'page' && h.url.startsWith('pdefe://'));
  const ws = new WebSocket(sayfa.webSocketDebuggerUrl);
  await new Promise((c, r) => { ws.onopen = c; ws.onerror = r; });
  let id = 0; const bekleyen = new Map(); const dinleyiciler = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bekleyen.has(d.id)) { bekleyen.get(d.id)(d); bekleyen.delete(d.id); } else if (d.method) dinleyiciler.forEach((f) => f(d)); };
  const gonder = (method, params = {}) => new Promise((c) => { const i = ++id; bekleyen.set(i, c); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, gonder, dinle: (f) => dinleyiciler.push(f) };
}

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, tus }) {
  fs.mkdirSync(K, { recursive: true });
  ADLAR.forEach((ad, i) => { const h = path.join(K, ad); if (!fs.existsSync(h)) fs.copyFileSync(path.resolve('test/pdf', KAYNAKLAR[i % 2]), h); });
  await evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); for (const ad of ${js(ADLAR)}) await p.dosyaAc(${js(K + path.sep)} + ad); await new Promise((r) => setTimeout(r, 1500)); return true; })()`);

  const olc = () => evalJs(`(() => {
    const liste = document.querySelector('#sekme-liste'), lr = liste.getBoundingClientRect();
    const sekmeler = [...document.querySelectorAll('.sekme')].map((s) => { const a = s.querySelector('.ad'), r = s.getBoundingClientRect();
      return { ad: a.textContent, g: r.width, kisaldi: a.scrollWidth > a.clientWidth, ipucu: s.title, gorunur: r.left >= lr.left - 0.5 && r.right <= lr.right + 0.5, aktif: s.classList.contains('aktif') }; });
    return { sekmeler, genislik: innerWidth, tema: document.documentElement.dataset.tema, ustTasma: getComputedStyle(document.querySelector('.sekme .ad')).textOverflow };
  })()`);
  let o = await olc();
  const genislikler = new Set(o.sekmeler.map((s) => Math.round(s.g)));
  denetle(`${o.sekmeler.length} sekmenin genişliği aynı`, genislikler.size === 1, [...genislikler].join(', ') + ' px');
  const kisa = (ad) => o.sekmeler.find((s) => s.ad === ad);
  denetle('"ustyazi (85).pdf" ve "(2)TensipZapti (9).pdf" tam görünür', !kisa('ustyazi (85).pdf').kisaldi && !kisa('(2)TensipZapti (9).pdf').kisaldi);
  denetle('uzun ad üç noktayla kısalır', kisa('Bilirkişi Raporu - Ek 1 - Hesap Tablosu ve Açıklamalar (son hali).pdf').kisaldi && o.ustTasma === 'ellipsis');
  denetle('ipucu: tam ad + yol', o.sekmeler.every((s) => s.ipucu === `${s.ad}\n${K}${path.sep}${s.ad}`), js(o.sekmeler[3].ipucu));
  denetle('etkin (son açılan) sekme görünür', o.sekmeler.find((s) => s.aktif)?.gorunur);
  await ekranGoruntusu(`test/png/sekme/sekmeler-12${EK}.png`);

  // Ctrl+1 / Ctrl+9: etkin sekme kaydırılıp görünür olur
  await tus('1', ['ctrl']); await bekle(400); o = await olc();
  denetle('Ctrl+1: ilk sekme etkin ve görünür', o.sekmeler[0].aktif && o.sekmeler[0].gorunur);
  await tus('9', ['ctrl']); await bekle(400); o = await olc();
  denetle('Ctrl+9: son sekme etkin ve görünür', o.sekmeler.at(-1).aktif && o.sekmeler.at(-1).gorunur);
  // ▶ ve ◀ düğmeleri (basış: bir sonraki / önceki sekme)
  await tus('1', ['ctrl']); await bekle(300);
  const sonraki = await evalJs(`(() => { const r = document.querySelector('#sekme-sonraki').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  const onceki = await evalJs(`(() => { const r = document.querySelector('#sekme-onceki').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  for (let i = 0; i < 6; i++) { await tikla(...sonraki); await bekle(150); }
  o = await olc();
  denetle('▶ altı kez: 7. sekme etkin ve görünür', o.sekmeler[6].aktif && o.sekmeler[6].gorunur, o.sekmeler.find((s) => s.aktif)?.ad);
  await tikla(...onceki); await bekle(300); o = await olc();
  denetle('◀: 6. sekme etkin ve görünür', o.sekmeler[5].aktif && o.sekmeler[5].gorunur);

  // Sürükleyerek sıralama. Fare basılıp sürüklenir; tarayıcının başlattığı sürükleme CDP'de yakalanır (Input.setInterceptDrags: işletim
  // sisteminin sürükleme döngüsü açılmaz, gerçek fareye dokunulmaz), sürükleme olayları Input.dispatchDragEvent ile verilir.
  // disari: bırakma sekme çubuğunun dışında (belge alanında) olur.
  async function surukleBirak(kaynak, hedef, { disari = false } = {}) {
    await tus('1', ['ctrl']); await bekle(400);   // dar pencerede de ilk sekmeler görünsün
    const { ws, gonder, dinle } = await cdp();
    let veri = null;
    dinle((d) => { if (d.method === 'Input.dragIntercepted') veri = d.params.data; });
    await gonder('Input.setInterceptDrags', { enabled: true });
    const k = await evalJs(`[...document.querySelectorAll('.sekme')].map((s) => { const r = s.getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2), sag: Math.round(r.right - 20) }; })`);
    const [a, b] = [k[kaynak], k[hedef]];
    await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y, button: 'none' });
    await gonder('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) await gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + ((b.sag - a.x) * i) / 10, y: a.y, button: 'left', buttons: 1 });
    await bekle(200);
    const son = disari ? { x: b.sag, y: 400 } : { x: b.sag, y: b.y };
    if (veri) {
      await gonder('Input.dispatchDragEvent', { type: 'dragEnter', x: b.sag, y: b.y, data: veri });
      await gonder('Input.dispatchDragEvent', { type: 'dragOver', x: b.sag, y: b.y, data: veri });   // sekme yerinde taşınır
      await gonder('Input.dispatchDragEvent', { type: 'dragOver', x: son.x, y: son.y, data: veri });  // fare artık taşınan sekmenin (ya da belgenin) üstünde
      await gonder('Input.dispatchDragEvent', { type: 'drop', x: son.x, y: son.y, data: veri });
    }
    await gonder('Input.dispatchMouseEvent', { type: 'mouseReleased', x: son.x, y: son.y, button: 'left', buttons: 0, clickCount: 1 });
    await gonder('Input.setInterceptDrags', { enabled: false });
    ws.close();
    await bekle(300);
    return { yakalandi: !!veri, model: await evalJs(`window.__pdefe.sekmeler.sekmeler.map((s) => s.ad)`), dom: await evalJs(`[...document.querySelectorAll('.sekme .ad')].map((a) => a.textContent)`) };
  }
  // 1. sekmeyi 3. sekmenin sağ yarısına bırak → yeni sıra 2, 3, 1, …
  let r = await surukleBirak(0, 2);
  denetle('sürükle-bırak: 1. sekme 3.nün arkasına taşındı (model ve DOM)', r.yakalandi && js(r.model.slice(0, 3)) === js([ADLAR[1], ADLAR[2], ADLAR[0]]) && js(r.dom) === js(r.model), js(r.model.slice(0, 3)));
  denetle('sürükle-bırak: sürükleme işareti kalmadı', !(await evalJs(`!!document.querySelector('.sekme.surukleniyor')`)));
  // Çubuğun dışında bırakınca da görünen sıra geçerli (önceden DOM taşınıp model eski sırada kalıyordu: Ctrl+1 başka sekmeyi seçerdi)
  r = await surukleBirak(0, 1, { disari: true });
  denetle('sürükle-bırak (dışarıda bırakma): model DOM sırasıyla aynı', r.yakalandi && js(r.dom) === js(r.model) && js(r.model.slice(0, 3)) === js([ADLAR[2], ADLAR[1], ADLAR[0]]), js(r.model.slice(0, 3)));
  await tus('1', ['ctrl']); await bekle(300);
  denetle('sürükle-bırak sonrası Ctrl+1: görünen ilk sekme seçilir', (await evalJs(`window.__pdefe.aktif().ad`)) === r.dom[0]);

  // Ctrl+Tab seçicisi ve açık belgeler listesi (uzun adlar)
  await tus('Tab', ['ctrl']); await bekle(600);
  await ekranGoruntusu(`test/png/sekme/ctrl-tab${EK}.png`);
  await tus('Escape'); await tus('Control'); await bekle(200);
  await tikla(...(await evalJs(`(() => { const r = document.querySelector('#sekme-acilir').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`)));
  await bekle(300);
  denetle('açık belgeler listesi açıldı', await evalJs(`!document.querySelector('#belge-listesi').hidden && document.querySelectorAll('#belge-listesi li').length === ${ADLAR.length}`));
  await ekranGoruntusu(`test/png/sekme/belge-listesi${EK}.png`);
  await tus('Escape'); await bekle(200);

  // Değişiklik noktası: sekme genişliği değişmez, ad biraz daha kısalır
  await evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${js(ADLAR[1])}); await p.sekmeSec(b.id); p.sekmeler.guncelle(b.id, { degisti: true }); return true; })()`);
  await bekle(200); o = await olc();
  denetle('değişiklik noktalı sekme aynı genişlikte', Math.round(o.sekmeler.find((s) => s.ad === ADLAR[1]).g) === [...genislikler][0]);
  await ekranGoruntusu(`test/png/sekme/degisti${EK}.png`);
  await evalJs(`(() => { const p = window.__pdefe; p.sekmeler.guncelle(p.aktif().id, { degisti: false }); return true; })()`);

  // Farklı kaydet: sekme adı ve ipucu yeni dosyaya göre
  const yeni = path.join(K, 'farkli kaydedilen uzun bir belge adı (1).pdf');
  if (fs.existsSync(yeni)) fs.unlinkSync(yeni);
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:kaydetDiyalog', [${js(yeni)}])`);
  const kayit = await evalJs(`(async () => { const p = window.__pdefe; const ok = await p.belgeKaydet(p.aktif(), true); const s = p.sekmeler.bul(p.aktif().id); return { ok, ad: s.ad, yol: s.yol, ipucu: s.el.title, dom: s.el.querySelector('.ad').textContent }; })()`);
  denetle('Farklı kaydet: sekme adı, yolu ve ipucu güncellendi', kayit.ok && kayit.ad === path.basename(yeni) && kayit.yol === yeni && kayit.ipucu === `${path.basename(yeni)}\n${yeni}` && kayit.dom === kayit.ad, js(kayit));

  await evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); return true; })()`);
  console.log(`\n${tamam} tamam, ${hata} hata (pencere genişliği ${o.genislik} px, tema ${o.tema})`);
}
