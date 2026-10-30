// Format Değiştir ve Birleştir'in ofis motorlarıyla kullanıcının gördüğü (0.3.1): Gerçek dönüştürme, kurgusal belge, gerçek fare olayları.
// Motor, örneği başlatmadan önce PDEFE_OFIS_MOTORU ile seçilir (ayrı örnek, motor başına bir kez):
//   $env:PDEFE_OFIS_MOTORU='libreoffice'; powershell -File test\baslat.ps1 -Port 9551 -Veri "$env:TEMP\pdefe-ofis-9551" -Boyut "1280,1000"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9551; $env:OFIS_BEKLENEN='libreoffice'; node test\surucu.mjs betik test\ofis_motor_arayuz.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// OFIS_BEKLENEN: word | wps | libreoffice (dönüştürür, sonuçta program adı) · wps-kilitli (kurulum kilidi: Hata, ne yapılacağı söylenir, WPS başlamaz) · yok (hedef soluk, neden).
// Ekran görüntüleri test/cikti/ofis_ui/<beklenen> altına.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BEKLENEN = process.env.OFIS_BEKLENEN || 'libreoffice';
const UI = path.join(KOK, 'test', 'cikti', 'ofis_ui', BEKLENEN);
const GIRDI = path.join(UI, 'girdi'), CIKTI = path.join(UI, 'cikti'), PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const ADLAR = { word: 'Word', wps: 'WPS Office', 'wps-kilitli': 'WPS Office', libreoffice: 'LibreOffice' };

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(150);
    }
  };
  const ss = async (ad) => { await bekle(300); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const tikSecici = async (secici) => {
    const r = await evalJs(`(() => { const e = document.querySelector(${J(secici)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) return false;
    await tikla(r.x, r.y);
    await bekle(250);
    return true;
  };
  const bildirimler = () => evalJs(`window.__ofisB.slice()`);
  const satir = () => evalJs(`(() => { const e = document.querySelector('.donustur-pencere .donustur-oge'); if (!e) return null; const k = e.querySelector('.kalite');
    return { tur: e.dataset.tur, ozet: e.querySelector('.ozet').textContent,
      hedefler: [...e.querySelectorAll('.donustur-hedef-secim > button')].map((b) => ({ id: b.dataset.id, secili: b.classList.contains('secili'), devre: b.disabled, ipucu: b.title })),
      kalite: k.hidden ? '' : k.querySelector('.metin').textContent, neden: e.querySelector('.neden').hidden ? '' : e.querySelector('.neden').textContent,
      hata: e.querySelector('.hata').hidden ? '' : e.querySelector('.hata').textContent }; })()`);

  fs.rmSync(UI, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  for (const k of [GIRDI, CIKTI, PNG]) fs.mkdirSync(k, { recursive: true });
  const docx = path.join(GIRDI, 'İş Bankası dilekçe ÇĞİÖŞÜ.docx');
  const pdfGirdi = path.join(GIRDI, 'ek.pdf');
  execFileSync(PY, ['-X', 'utf8', '-c', `
import sys
sys.path.insert(0, ${J(path.join(KOK, 'test'))}); sys.path.insert(0, ${J(path.join(KOK, 'core'))})
import word_donusum_testi as W
W.docx_yaz(${J(docx)}, [("Başlık %d Çığöşü" % (i + 1), W.paragraflar(70 + i, 5)) for i in range(2)])
W.sentetik_pdf(${J(pdfGirdi)}, sayfa=1)
`], { encoding: 'utf8' });

  await evalJs(`(async () => {
    window.__ofisB = [];
    new MutationObserver(() => { const t = document.querySelector('#bildirim')?.textContent; if (t && window.__ofisB.at(-1) !== t) window.__ofisB.push(t); })
      .observe(document.querySelector('#bildirim'), { childList: true, characterData: true, subtree: true });
    for (const [k, v] of Object.entries({ ciktiKlasoru: ${J(CIKTI)}, otomatikKaydet: false, donusturme: {} })) { await window.pdefe.cagir('ayar:koy', k, v); window.__pdefe.ayar()[k] = v; }
    window.__pdefeYerelKutu = true;
    return true;
  })()`);

  const yet = await evalJs(`window.pdefe.cagir('cekirdek:cagir', 'donusum_yetenekleri', {}, null)`);
  console.log(`     yetenek: ${J({ var: yet?.word?.var, motor: yet?.word?.motor, not: yet?.word?.not, neden: yet?.word?.neden })}`);

  // ------------------------------------------------------------ Format Değiştir
  await evalJs(`window.__pdefe.komutCalistir('arac.donustur', ${J([docx])})`);
  await kosul(`!!document.querySelector('.donustur-pencere')`, 5000);
  await kosul(`!document.querySelector('.donustur-oge.yukleniyor')`, 20000);
  await bekle(400);
  const s = await satir();
  await ss('01-satir');
  const pdfHedef = s?.hedefler?.find((h) => h.id === 'pdf');

  if (BEKLENEN === 'yok') {
    sonuc('Satır: Word belgesi tanındı', s?.tur === 'word', s);
    sonuc('PDF hedefi soluk, ipucunda gerekenler', pdfHedef?.devre === true && /Word/.test(pdfHedef.ipucu) && /WPS Office/.test(pdfHedef.ipucu) && /LibreOffice/.test(pdfHedef.ipucu), pdfHedef);
    sonuc('Metinde noktalı virgül yok', !/;/.test(`${pdfHedef?.ipucu} ${s?.neden}`), { p: pdfHedef?.ipucu, n: s?.neden });
    sonuc('Dönüştür düğmesi soluk', await evalJs(`document.querySelector('.donustur-pencere .arac-dugmeler .birincil').disabled`));
  } else {
    const ad = ADLAR[BEKLENEN];
    sonuc('Satır: Word belgesi, PDF hedefi açık ve seçili', s?.tur === 'word' && pdfHedef?.devre === false && pdfHedef?.secili === true, s);
    if (BEKLENEN === 'word') sonuc('Word\'le not yok', !/LibreOffice|WPS/.test(s?.kalite || ''), s?.kalite);
    else if (BEKLENEN === 'wps-kilitli') sonuc('Not: WPS Office', /WPS Office/.test(s?.kalite || '') || !s?.kalite, s?.kalite);
    else sonuc(`Hedef notunda program adı: ${ad}`, new RegExp(ad).test(s?.kalite || '') && !/;/.test(s?.kalite || ''), s?.kalite);
    await tikSecici('.donustur-pencere .arac-dugmeler .birincil');
    await kosul(`!document.querySelector('.donustur-pencere') || !document.querySelector('.donustur-sonuc')?.hidden || !!document.querySelector('.donustur-pencere .arac-hata:not([hidden])') || !!document.querySelector('.mesaj-kutusu, .soru-kutusu, .mesaj-ortusu')`, 60000);
    await bekle(600);
    await ss('02-sonuc');
    const hedef = path.join(CIKTI, 'İş Bankası dilekçe ÇĞİÖŞÜ.pdf');
    if (BEKLENEN === 'wps-kilitli') {
      const m = await evalJs(`[document.querySelector('.donustur-sonuc')?.innerText, document.querySelector('.donustur-pencere .arac-hata')?.innerText, document.querySelector('.mesaj-kutusu, .soru-kutusu, .mesaj-ortusu')?.innerText, document.querySelector('.donustur-oge .hata')?.textContent].filter(Boolean).join(' | ')`);
      const ipucu = await evalJs(`[...document.querySelectorAll('.donustur-sonuc [title]')].map((e) => e.title).join(' ')`);
      console.log(`     ileti: ${m} | ${ipucu}`);
      sonuc('Hata: WPS güncelleniyor, ne yapılacağı söyleniyor, ham kod yok', /güncelleniyor/.test(m + ipucu) && !/0x|;|süreci bulunamadı/.test(m + ipucu), m + ipucu);
      sonuc('Dosya yazılmadı', !fs.existsSync(hedef));
    } else {
      const b = await bildirimler();
      console.log(`     bildirim: ${J(b)}`);
      sonuc('PDF yazıldı, sekmede açıldı', fs.existsSync(hedef) && path.resolve(await evalJs(`window.__pdefe.aktif()?.yol`) || '') === path.resolve(hedef), hedef);
      if (BEKLENEN === 'word') sonuc('Bildirimde uyarı yok', b.some((t) => /^Format değiştirildi/.test(t)) && !b.some((t) => /LibreOffice|WPS/.test(t)), b);
      else sonuc(`Bildirimde hangi programla: ${ad}`, b.some((t) => new RegExp(`${ad} ile dönüştürüldü`).test(t) && !/;/.test(t)), b);
      await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`, 8000);
      await bekle(800);
      await ss('03-pdf-sekmede');
    }
  }
  await evalJs(`(async () => { window.__pdefeOtoYanit = { secim: 0 }; try { const m = await import('pdefe://app/src/renderer/araclar/ortak.js'); if (m.acikAracPenceresiVar()) await m.aracPencereleriniKapat(); } catch (e) { console.warn(e); } finally { delete window.__pdefeOtoYanit; } return true; })()`);
  await kosul(`!document.querySelector('.arac-ortusu')`, 4000);

  // ------------------------------------------------------------ Ayarlar: Hangi program
  await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'kaydetme')`);
  await kosul(`[...document.querySelectorAll('.ayar-baslik')].some((e) => e.textContent === 'Word belgeleri')`, 4000);
  await kosul(`(() => { const k = [...document.querySelectorAll('.ayar-kart')].find((e) => e.querySelector('.ayar-baslik')?.textContent === 'Word belgeleri'); return k && !/Aranıyor/.test(k.querySelector('.ayar-ude-durum').textContent); })()`, 6000);
  const kartMetni = await evalJs(`(() => { const k = [...document.querySelectorAll('.ayar-kart')].find((e) => e.querySelector('.ayar-baslik')?.textContent === 'Word belgeleri'); if (k) k.scrollIntoView({ block: 'center' }); return k?.innerText || ''; })()`);
  console.log(`     Ayarlar: ${String(kartMetni).replace(/\n+/g, ' | ')}`);
  sonuc('Ayarlar: "Word belgeleri" kartı, sıra anlatılıyor, noktalı virgül yok', /Microsoft Word, WPS Office, LibreOffice/.test(kartMetni) && !/;/.test(kartMetni), kartMetni);
  if (BEKLENEN === 'yok') sonuc('Ayarlar: Program bulunamadı', /hiçbiri bulunamadı/.test(kartMetni), kartMetni);
  else sonuc(`Ayarlar: Kullanılacak program yazıyor`, /Kullanılacak program: /.test(kartMetni), kartMetni);
  await ss('04-ayarlar');
  await evalJs(`(document.querySelector('.ayarlar-ortusu [data-id="kapat2"]')?.click(), true)`);
  await bekle(300);

  // ------------------------------------------------------------ Birleştir: Word + PDF
  if (BEKLENEN !== 'yok' && BEKLENEN !== 'wps-kilitli') {
    await evalJs(`window.__ofisB.length = 0`);
    await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir', ${J([docx, pdfGirdi])})`);
    const var_ = await kosul(`!!document.querySelector('.birlestir-govde')`, 5000);
    sonuc('Birleştir açıldı', !!var_);
    await kosul(`document.querySelectorAll('.birlestir-govde .birlestir-oge').length === 2`, 15000);
    await bekle(800);
    await ss('05-birlestir');
    await tikSecici('.birlestir-pencere .arac-dugmeler .birincil, .arac-dugmeler .birincil');
    await kosul(`!document.querySelector('.birlestir-govde')`, 120000);
    await bekle(800);
    const b = await bildirimler();
    console.log(`     bildirim: ${J(b)}`);
    if (BEKLENEN !== 'word') sonuc('Birleştir: Bildirimde hangi programla', b.some((t) => new RegExp(`${ADLAR[BEKLENEN]} ile dönüştürüldü`).test(t)), b);
    else sonuc('Birleştir: Bildirim', b.some((t) => /Birleştirildi/.test(t)), b);
    await ss('06-birlestir-sonuc');
  }
  console.log(`\nSonuç: ${denetim - hataSayisi}/${denetim} geçti${hataSayisi ? `, ${hataSayisi} HATA` : ''}.`);
  return hataSayisi ? 1 : 0;
}
