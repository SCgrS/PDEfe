// Senaryo 16 (0.1.11): temiz kopyalamada belgedeki boş satır (kanunda bölüm başlığından önceki boşluk). test/kopyalama_testi.py'nin
// ürettiği PDF'lerde gerçek fareyle seçim, sistem panosuna dokunmayan kopyalama (bkz. senaryo15). Çekirdeğin sonradan panoya koyduğu
// metinde boş satır boş paragraf olmalı ("…isteyebilirler.\n\nC. Zamanaşımı"):
//   1) bos-paragraf.pdf: "bir bedelle … isteyebilirler." satırından "I. Kural" satırına; arada boş paragraf (bir boşluk karakteri)
//   2) sayfa-gecisi.pdf (kısa sayfalar): birinci sayfanın son satırından ikinci sayfanın "I. Kural" satırına; birinci sayfa boş
//      paragrafla bitiyor (renderer sayfaların metnini sayfaMetinleriniBirlestir ile birleştirir)
// Renderer'ın hemen koyduğu metin (metin katmanından) boş satırı taşımaz; yalnızca kaydedilir.
// Kullanım: önce .venv\Scripts\python.exe test\kopyalama_testi.py; test örneği (baslat.ps1) açıkken
//   $env:PDEFE_CDP_PORT=9351; node test/surucu.mjs betik test/senaryo16.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KLASOR = path.join(KOK, 'test', 'cikti', 'kopyalama');
const PNG = path.join(KLASOR, 'png');
const J = (x) => JSON.stringify(x);
const BEKLENEN = 'bir bedelle denkleştirilmesini isteyebilirler.\n\nC. Zamanaşımı\nI. Kural';

let hataSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

export default async function ({ evalJs, ekranGoruntusu, bekle, surukle, tus }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  /** Metin katmanında sözcüğün (içeren satırla bulunur) sol ya da sağ kenarının ekran konumu (CSS px). */
  const sozcukYeri = (satir, sozcuk, uc) => evalJs(`(() => {
    const span = [...document.querySelectorAll('.gorunum:not([hidden]) .textLayer span')].find((s) => s.textContent.includes(${J(satir)}));
    if (!span) return null;
    const dugum = [...span.childNodes].find((n) => n.nodeType === 3 && n.data.includes(${J(sozcuk)})) || span.firstChild;
    const i = dugum.data.indexOf(${J(sozcuk)});
    const r = document.createRange();
    r.setStart(dugum, ${uc === 'son' ? `i + ${J(sozcuk)}.length - 1` : 'i'}); r.setEnd(dugum, ${uc === 'son' ? `i + ${J(sozcuk)}.length` : 'i + 1'});
    const k = r.getBoundingClientRect();
    return { x: ${uc === 'son' ? 'k.right - 0.5' : 'k.left + 0.5'}, y: k.top + k.height / 2, pencere: innerHeight };
  })()`);

  for (const [ad, dosya, sayfaSayisi] of [['Aynı sayfada boş paragraf', 'bos-paragraf.pdf', 1], ['Sayfa geçişinde boş paragraf', 'sayfa-gecisi.pdf', 2]]) {
    const pdf = path.join(KLASOR, dosya);
    if (!fs.existsSync(pdf)) throw new Error('Önce test/kopyalama_testi.py çalıştırılmalı: ' + pdf);
    await tus('Escape');
    await evalJs(`(async () => { for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
    await evalJs(`window.__pdefe.dosyaAc(${J(pdf)}).then(() => true)`);
    // Seçimin uçları: ilk sayfadaki "bir bedelle" satırının başı, son sayfadaki "I. Kural" satırının sonu (metin katmanları kurulmuş olmalı)
    await kosul(`document.querySelectorAll('.gorunum:not([hidden]) .sayfa .textLayer').length >= ${sayfaSayisi} && [...document.querySelectorAll('.gorunum:not([hidden]) .textLayer span')].some((s) => s.textContent.includes('I. Kural'))`);
    await bekle(600);
    // Başlangıç satırı görünümün üstüne: bitiş, pencerenin alt kenarına yaklaşıp otomatik kaydırmayı tetiklemesin (seçim uzardı)
    await evalJs(`(() => { const s = [...document.querySelectorAll('.gorunum:not([hidden]) .textLayer span')].find((x) => x.textContent.includes('bir bedelle')); s?.scrollIntoView({ block: 'start' }); return !!s; })()`);
    await bekle(400);
    const bas = await sozcukYeri('bir bedelle', 'bir', 'bas');
    const son = await sozcukYeri('I. Kural', 'Kural', 'son');
    const gorunur = !!bas && !!son && bas.y > 40 && son.y < son.pencere - 60;
    sonuc(`${ad}: seçim uçları ekranda`, gorunur, { bas, son });
    if (!gorunur) continue;
    await surukle(bas.x, bas.y, son.x, son.y, { adim: 20 });
    await bekle(300);
    await ekranGoruntusu(path.join(PNG, `s16-${dosya.replace('.pdf', '')}.png`));

    await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);   // önceki kayıtları boşalt
    const renderer = await evalJs(`(() => {
      const veri = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: veri, bubbles: true, cancelable: true }));
      return veri.getData('text/plain');
    })()`);
    console.log(`     renderer metni: ${J(renderer)}`);
    // Çekirdeğin metni birkaç yüz ms içinde pano:metin'e gelir (test örneğinde sistem panosu yerine kayda: uzunluk ve ilk 200 karakter)
    let kayit = null;
    for (let t0 = Date.now(); !kayit && Date.now() - t0 < 8000; await bekle(200)) {
      kayit = (await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`)).find((k) => k.kanal === 'pano:metin') || null;
    }
    sonuc(`${ad}: çekirdek metni panoya kondu`, !!kayit, kayit?.secenek);
    if (kayit) sonuc(`${ad}: başlıktan önce boş paragraf`, kayit.secenek.bas === BEKLENEN && kayit.secenek.uzunluk === BEKLENEN.length, J(kayit.secenek.bas));
  }
  console.log(hataSayisi ? `\n${hataSayisi} HATA` : '\nHepsi geçti');
  process.exitCode = hataSayisi ? 1 : 0;
}
