// Senaryo 38 (0.2.7, kullanıcı istekleri; çekirdekten bağımsız arayüz maddeleri):
//   1) Yazdırma penceresinin alt satırı: Yazdır ve Vazgeç aynı yükseklik ve genişlikte, üst boşluksuz; Windows yazdırma penceresi bağlantısı
//      ve iki düğme aynı dikey hizada; düğmeler mesaj kutusunun düğmeleriyle aynı ölçüde. Ön izleme gezinmesi (◀ n / N ▶) ve "N sayfa" ön
//      izleme alanının ortasında, okların sayıya uzaklığı eşit. Açık ve koyu temada (ekran ölçeği baslat.ps1 -Olcek ile: 1 ve 1.25).
//      Yazdırma penceresi için sahte yazıcılar: $env:PDEFE_TEST_YAZICILAR = "1".
// Girdiler test/ornek_pdf_uret.py ile test/cikti/s38/girdi altında üretilir (gerçek belge yok).
// Kullanım:
//   $env:PDEFE_TEST_YAZICILAR = "1"; powershell -File test\baslat.ps1 -Port 9438 -Veri "$env:TEMP\pdefe-s38-9438" -Boyut "1280,1000" [-Olcek 1.25]
//   $env:PDEFE_CDP_PORT=9438; node test\surucu.mjs betik test\senaryo38.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1". Ekran görüntüleri test/cikti/s38/png altına.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's38');
const GIRDI = path.join(UI, 'girdi');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const yakin = (a, b, pay = 0.5) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= pay;

/** Örnek PDF (sayfa sayısı, başlık); var olanı yeniden üretmez. */
function ornekPdf(ad, sayfa = 2, baslik = 'Deneme belgesi') {
  const yol = path.join(GIRDI, ad);
  if (!fs.existsSync(yol)) execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ornek_pdf_uret.py'), yol, String(sayfa), baslik], { encoding: 'utf8' });
  return yol;
}

/** Sayfada: öğenin kutusu (CSS px) ve hesaplanmış birkaç stil. */
const KUTU = `window.__s38kutu = (e) => { if (typeof e === 'string') e = document.querySelector(e); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return { sol: r.left, sag: r.right, ust: r.top, alt: r.bottom, w: r.width, h: r.height, ortaX: r.left + r.width / 2, ortaY: r.top + r.height / 2,
    ustBosluk: cs.marginTop, kenarRengi: cs.borderTopColor, kenarKalinligi: cs.borderTopWidth, zemin: cs.backgroundColor }; }; true`;

export default async function ({ evalJs, ekranGoruntusu, bekle }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await evalJs(ifade); } catch { v = null; }
      if (v || Date.now() - t0 > sure) return v;
      await bekle(120);
    }
  };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  fs.mkdirSync(GIRDI, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  await evalJs(KUTU);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  const olcek = await evalJs('devicePixelRatio');
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); return true; })()`);
  // Görünüm › Koyu tema komutu açık ↔ koyu arasında geçer
  const temaAyarla = async (tema) => { if ((await evalJs('document.documentElement.dataset.tema')) !== tema) await evalJs(`(window.__pdefe.komutCalistir('gorunum.tema'), true)`); await bekle(300); return evalJs('document.documentElement.dataset.tema'); };

  // ------------------------------------------------------------ 1) Yazdırma penceresinin alt satırı ve ön izleme gezinmesi
  if (bolum(1)) {
    console.log(`\n== 1) Yazdırma penceresi: düğmeler ve gezinme (ölçek ${olcek})`);
    const yazicilar = await evalJs(`window.pdefe.cagir('yazdir:yazicilar').then((r) => (r?.yazicilar || []).length).catch(() => -1)`);
    if (yazicilar <= 0) console.log('ATLANDI 1) — sahte yazıcı yok: örneği $env:PDEFE_TEST_YAZICILAR = "1" ile başlatın');
    else {
      await sekmeleriKapat();
      const pdf = ornekPdf('yazdir.pdf', 3, 'Yazdırma örneği');
      await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(pdf)}); return true; })()`);
      await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
      // Mesaj kutusunun düğmeleri (karşılaştırma ölçüsü)
      await evalJs(`(window.__s38mk = window.__pdefe.mesajKutusu({ mesaj: 'Ölçü', dugmeler: ['Tamam', 'Vazgeç'], varsayilan: 0, iptal: 1 }), true)`);
      await kosul(`!!document.querySelector('.mesaj-kutusu .dugmeler button')`);
      const mk = await evalJs(`[...document.querySelectorAll('.mesaj-kutusu .dugmeler button')].map((b) => window.__s38kutu(b))`);
      await evalJs(`(document.querySelectorAll('.mesaj-kutusu .dugmeler button')[1].click(), true)`);
      await kosul(`!document.querySelector('.mesaj-kutusu')`);
      for (const tema of ['acik', 'koyu']) {
        sonuc(`[${tema}] Tema uygulandı`, (await temaAyarla(tema)) === tema);
        await evalJs(`(window.__pdefe.komutCalistir('dosya.yazdir'), true)`);
        await kosul(`!!document.querySelector('.yazdir-diyalog') && !document.querySelector('.yazdir-diyalog [name="yazici"]').disabled`, 8000);
        await kosul(`(() => { const g = document.querySelector('.yazdir-onizleme-sayfa'); return g && g.naturalWidth > 0 && !g.classList.contains('yukleniyor'); })()`, 10000);
        await bekle(400);
        const d = await evalJs(`(() => { const k = window.__s38kutu, q = (s) => document.querySelector('.yazdir-diyalog ' + s);
          return { yazdir: k(q('[data-id="yazdir"]')), iptal: k(q('[data-id="iptal"]')), sistem: k(q('[data-id="sistem"]')), alan: k(q('.yazdir-onizleme-alan')),
            onceki: k(q('[data-id="onceki"]')), no: k(q('.yazdir-sayfa-no')), sonraki: k(q('[data-id="sonraki"]')), ozet: k(q('.yazdir-ozet')),
            noMetin: q('.yazdir-sayfa-no').textContent, ozetMetin: q('.yazdir-ozet').textContent }; })()`);
        await ss(`01-yazdir-${tema}-${String(olcek).replace('.', '_')}`);
        const t = `[${tema}, ${olcek}] `;
        sonuc(t + '1) Yazdır ve Vazgeç aynı yükseklik ve genişlikte', yakin(d.yazdir.h, d.iptal.h) && yakin(d.yazdir.w, d.iptal.w), { yazdir: [d.yazdir.w, d.yazdir.h], iptal: [d.iptal.w, d.iptal.h] });
        sonuc(t + '1) Yazdır üst boşluksuz, iki düğme aynı satır hizasında (üst ve alt kenar)', d.yazdir.ustBosluk === '0px' && yakin(d.yazdir.ust, d.iptal.ust) && yakin(d.yazdir.alt, d.iptal.alt), { yazdir: d.yazdir, iptal: d.iptal });
        sonuc(t + '1) Windows yazdırma penceresi bağlantısı düğmelerle aynı dikey hizada', yakin(d.sistem.ortaY, d.yazdir.ortaY, 1), { sistem: d.sistem.ortaY, yazdir: d.yazdir.ortaY });
        sonuc(t + '1) Düğmeler mesaj kutusunun düğmeleriyle aynı ölçüde', yakin(d.yazdir.h, mk[0].h) && yakin(d.iptal.h, mk[1].h) && yakin(d.yazdir.w, mk[0].w, 1), { yazdir: [d.yazdir.w, d.yazdir.h], mesajKutusu: mk.map((x) => [x.w, x.h]) });
        sonuc(t + '1) Vazgeç\'in kenarı görünür, Yazdır\'ınki saydam (ölçü aynı)', parseFloat(d.iptal.kenarKalinligi) > 0 && d.yazdir.kenarKalinligi === d.iptal.kenarKalinligi && d.iptal.kenarRengi !== d.iptal.zemin && /rgba\(0, 0, 0, 0\)|transparent/.test(d.yazdir.kenarRengi), { iptal: [d.iptal.kenarRengi, d.iptal.zemin], yazdir: d.yazdir.kenarRengi });
        const gezinmeOrta = (d.onceki.sol + d.sonraki.sag) / 2;
        sonuc(t + '1) Ön izleme gezinmesi (◀ n / N ▶) ön izleme alanının ortasında', yakin(gezinmeOrta, d.alan.ortaX, 1) && yakin(d.no.ortaX, d.alan.ortaX, 1), { gezinmeOrta, no: d.no.ortaX, alan: d.alan.ortaX });
        sonuc(t + '1) Okların sayfa numarasına uzaklığı eşit', yakin(d.no.sol - d.onceki.sag, d.sonraki.sol - d.no.sag), [d.no.sol - d.onceki.sag, d.sonraki.sol - d.no.sag]);
        sonuc(t + '1) "N sayfa" özeti ön izleme alanının ortasında, gezinmenin altında', yakin(d.ozet.ortaX, d.alan.ortaX, 1) && d.ozet.ust >= d.onceki.alt && d.noMetin === '1 / 3' && d.ozetMetin === '3 sayfa', { ozet: d.ozet.ortaX, alan: d.alan.ortaX, no: d.noMetin, ozetMetin: d.ozetMetin });
        await evalJs(`(document.querySelector('.yazdir-diyalog [data-id="iptal"]').click(), true)`);
        await kosul(`!document.querySelector('.yazdir-ortusu')`);
      }
      await sekmeleriKapat();
    }
  }

  const hatalar = await evalJs('window.__hatalar || []');
  sonuc('Renderer konsolunda hata yok', !hatalar.length, hatalar);
  console.log(`\n${denetim} denetim; ${hataSayisi ? hataSayisi + ' HATA' : 'hepsi geçti'}  (ekran görüntüleri: ${PNG})`);
  if (hataSayisi) process.exitCode = 1;
}
