// Senaryo 15 (0.1.10): temiz kopyalama, her satırı ayrı blok olan belgede (test/kopyalama_testi.py'nin ürettiği
// test/cikti/kopyalama/girintili.pdf): paragrafın ortasından ("tehlike") başka paragrafın içine ("bile,") gerçek fareyle seçim,
// kopyalama. Kopyalama olayı kendi DataTransfer'ıyla tetiklenir (sistem panosuna, yani bilgisayarı kullanan kişinin panosuna
// yazılmaz); renderer'ın metni oradan, çekirdeğin sonradan panoya koyduğu metin test:diyalogKaydi'ndaki pano:metin kaydından
// (uzunluk ve ilk 200 karakter) okunur. İkisi de üç paragraf olmalı: 0.1.9'da çekirdek her satırı ayrı paragraf yapıyordu.
// 0.2.1: ortadan-dolu-satir.pdf'te dolu ve noktayla biten satırın son sözcüklerinden sonraki satırın sonuna seçim: çekirdeğin metni tek
// paragraf olmalı (seçilen parça kısa göründüğü için paragraf noktadan sonra bölünüyordu; çekirdek ilk satırın dolu olduğunu söyler).
// Kullanım: önce .venv\Scripts\python.exe test\kopyalama_testi.py; test örneği (baslat.ps1) açıkken
//   $env:PDEFE_CDP_PORT=9351; node test/surucu.mjs betik test/senaryo15.mjs
// PDF'lerin klasörü: KOPYALAMA_KLASORU (kopyalama_testi.py ile aynı), yoksa test\cikti\kopyalama.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KLASOR = process.env.KOPYALAMA_KLASORU || path.join(KOK, 'test', 'cikti', 'kopyalama');
const PDF = path.join(KLASOR, 'girintili.pdf');
const PDF2 = path.join(KLASOR, 'ortadan-dolu-satir.pdf');
const PNG = path.join(KLASOR, 'png');
const J = (x) => JSON.stringify(x);
const BEKLENEN = [
  'tehlike arzeden bir işletme olduğu kabul edilir. Özellikle, herhangi bir kanunda benzeri tehlikeler arzeden işletmeler için özel bir tehlike sorumluluğu öngörülmüşse, bu da işletme de önemli ölçüde tehlike arzeden işletme sayılır.',
  'Belirli bir tehlike hâli için öngörülen özel sorumluluk hükümleri saklıdır.',
  'Önemli ölçüde tehlike arzeden bir işletmenin bu tür faaliyetine hukuk düzenince izin verilmiş olsa bile,',
];
const BEKLENEN2 = 'sicil müdürlükleri kurulur. Bakanlık il merkezleri dışındaki odalarda da ticaret sicili müdürlükleri kurabileceği gibi';

let hataSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

export default async function ({ evalJs, ekranGoruntusu, bekle, surukle, tus }) {
  for (const p of [PDF, PDF2]) if (!fs.existsSync(p)) throw new Error('Önce test/kopyalama_testi.py çalıştırılmalı: ' + p);
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  await tus('Escape');
  await evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  await evalJs(`window.__pdefe.dosyaAc(${J(PDF)}).then(() => true)`);
  await kosul(`!!document.querySelector('.gorunum:not([hidden]) .sayfa .textLayer span')`);
  await bekle(600);

  /** Metin katmanında sözcüğün (içeren satırla bulunur) sol ya da sağ kenarının ekran konumu (CSS px). */
  const sozcukYeri = (satir, sozcuk, uc) => evalJs(`(() => {
    const span = [...document.querySelectorAll('.gorunum:not([hidden]) .textLayer span')].find((s) => s.textContent.includes(${J(satir)}));
    if (!span) return null;
    const dugum = [...span.childNodes].find((n) => n.nodeType === 3 && n.data.includes(${J(sozcuk)})) || span.firstChild;
    const i = dugum.data.indexOf(${J(sozcuk)});
    const r = document.createRange();
    r.setStart(dugum, ${uc === 'son' ? `i + ${J(sozcuk)}.length - 1` : 'i'}); r.setEnd(dugum, ${uc === 'son' ? `i + ${J(sozcuk)}.length` : 'i + 1'});
    const k = r.getBoundingClientRect();
    return { x: ${uc === 'son' ? 'k.right - 0.5' : 'k.left + 0.5'}, y: k.top + k.height / 2 };
  })()`);
  const bas = await sozcukYeri('olduğu kabul edilir', 'tehlike', 'bas');
  const son = await sozcukYeri('verilmiş olsa bile,', 'bile,', 'son');
  sonuc('Seçim uçları bulundu', !!bas && !!son, { bas, son });
  if (!bas || !son) { process.exitCode = 1; return; }
  await surukle(bas.x, bas.y, son.x, son.y, { adim: 20 });
  await bekle(300);
  await ekranGoruntusu(path.join(PNG, 's15-secim.png'));

  await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);   // önceki kayıtları boşalt
  const renderer = await evalJs(`(() => {
    const veri = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: veri, bubbles: true, cancelable: true }));
    return veri.getData('text/plain');
  })()`);
  sonuc('Renderer metni üç paragraf', J(renderer.split('\n')) === J(BEKLENEN), renderer);
  // Çekirdeğin daha temiz sürümü birkaç yüz ms içinde pano:metin'e gelir (test örneğinde sistem panosu yerine kayda)
  let kayit = null;
  for (let t0 = Date.now(); !kayit && Date.now() - t0 < 8000; await bekle(200)) {
    kayit = (await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`)).find((k) => k.kanal === 'pano:metin') || null;
  }
  const beklenenMetin = BEKLENEN.join('\n');
  sonuc('Çekirdek metni panoya kondu', !!kayit, kayit?.secenek);
  if (kayit) {
    sonuc('Çekirdek metni aynı uzunlukta (satırlar birleşik)', kayit.secenek.uzunluk === beklenenMetin.length, { uzunluk: kayit.secenek.uzunluk, beklenen: beklenenMetin.length });
    sonuc('Çekirdek metninin başı birleşik paragraf (ilk 200 karakterde satır sonu yok)', kayit.secenek.bas === beklenenMetin.slice(0, 200), kayit.secenek.bas);
  }

  // ---------------------------------------------------------------- 0.2.1: satırın ortasından başlayan seçim, dolu ilk satır
  await evalJs(`(() => { getSelection().removeAllRanges(); return true; })()`);
  await evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  await evalJs(`window.__pdefe.dosyaAc(${J(PDF2)}).then(() => true)`);
  await kosul(`!!document.querySelector('.gorunum:not([hidden]) .sayfa .textLayer span') && [...document.querySelectorAll('.gorunum:not([hidden]) .textLayer span')].some((s) => s.textContent.includes('kurabileceği gibi'))`);
  await bekle(600);
  const bas2 = await sozcukYeri('yapılarak sicil müdürlükleri kurulur', 'sicil', 'bas');
  const son2 = await sozcukYeri('kurabileceği gibi', 'gibi', 'son');
  sonuc('Ortadan seçim: uçlar bulundu', !!bas2 && !!son2, { bas2, son2 });
  if (bas2 && son2) {
    await surukle(bas2.x, bas2.y, son2.x, son2.y, { adim: 20 });
    await bekle(300);
    await ekranGoruntusu(path.join(PNG, 's15-ortadan-secim.png'));
    await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
    // Renderer'ın hızlı metni satırın sayfadaki uzunluğunu bilmez (iki paragraf olabilir); yalnızca kaydedilir
    const renderer2 = await evalJs(`(() => {
      const veri = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: veri, bubbles: true, cancelable: true }));
      return veri.getData('text/plain');
    })()`);
    console.log('     renderer metni: ' + J(renderer2));
    let kayit2 = null;
    for (let t0 = Date.now(); !kayit2 && Date.now() - t0 < 8000; await bekle(200)) {
      kayit2 = (await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`)).find((k) => k.kanal === 'pano:metin') || null;
    }
    sonuc('Ortadan seçim: çekirdek metni panoya kondu', !!kayit2, kayit2?.secenek);
    if (kayit2) sonuc('Ortadan seçim: çekirdek metni tek paragraf (noktadan sonra bölünmedi)', kayit2.secenek.bas === BEKLENEN2 && kayit2.secenek.uzunluk === BEKLENEN2.length, kayit2.secenek.bas);
  }
  console.log(hataSayisi ? `\n${hataSayisi} HATA` : '\nHepsi geçti');
  process.exitCode = hataSayisi ? 1 : 0;
}
