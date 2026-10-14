// Yazdırma penceresi (0.2.6, kullanıcı isteği: yazdırma bazı bilgisayarlarda düzgün çalışmıyor; Windows 11'in yazdırma kutusunda ön izleme
// boş). PDEfe'nin kendi penceresi: yazıcı (sahte liste: PDEFE_TEST_YAZICILAR), kopya, sayfalar, kâğıt, boyut, renk, çift taraflı, notlar ve
// büyük ön izleme; Yazdır'da Windows'un kutusu açılmadan seçilen yazıcıya (test örneğinde yazıcıya gitmez: test:diyalogKaydi 'yazdir:yazdir').
//   1) Yazıcılar: sahte liste, varsayılan ("Lazer Yazıcı (varsayılan)") ön seçili, çevrim dışı yazıcı işaretli (durum arkadan gelir);
//      varsayılan seçenekler (1 kopya, harmanla soluk, belgeye göre kâğıt, sığdır, renkli, yazıcının ayarı, notlar kapalı)
//   2) Ön izleme: kâğıt oranı (A4, A5, Letter), dikey / yatay / /Rotate 90'lı / A5 sayfanın kâğıttaki yeri ve oranı (sığdır, gerçek boyut),
//      gezinme (◀ ▶, Page Up / Page Down, n / N), aralık ("2-3" → 1 / 2 (s. 2), hatalı aralık), kopya özeti, siyah beyaz (gri süzgeç),
//      notlar aç / kapa (ön izlemede notun yeşil dolgusu)
//   3) Yazıcıya göre: çevrim dışı uyarısı, dosyaya yazan yazıcı açıklaması, çift taraflı desteklemeyen yazıcıda çift taraflı seçenekleri soluk;
//      Yazıcı tercihleri (test:diyalogKaydi 'yazdir:tercihler')
//   4) Yazdır: kaydedilen print() seçenekleri (deviceName, copies, collate, color, duplexMode, pageSize; pageRanges / landscape / dpi yok),
//      gizli pencerede yüklenen sayfa sayısı, bildirim; "Yazıcının ayarı"nda duplexMode yok; Windows yazdırma penceresi bağlantısı (silent
//      false, yazıcı ve kopya yok); hata iletisi ("Invalid deviceName" → "Yazıcı bulunamadı …")
//   5) Hatırlama: yazıcı ve seçenekler kalıcı (ayar 'yazdirma'), kopya 1'den başlar, sayfa seçimi ve notlar oturumda; hatırlanan yazıcı
//      kaldırılmışsa varsayılan ve uyarı; hiç yazıcı yoksa Yazdır soluk, Windows penceresi bağlantısı kullanılabilir
// Kullanım:
//   $env:PDEFE_TEST_YAZICILAR = "1"; powershell -File test\baslat.ps1 -Port 9461 -Veri "$env:TEMP\pdefe-yz-9461"
//   $env:PDEFE_CDP_PORT = 9461; node test\surucu.mjs betik test\yazdir_pencere.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Temiz veri klasörüyle başlatın (hatırlanan seçimler). Ekran görüntüleri test/cikti/yzp/png altına yazılır.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 'yzp');
const PNG = path.join(UI, 'png');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const SAHTE = [
  { ad: 'Lazer Yazıcı', varsayilan: true, ciftTarafli: true },
  { ad: 'Microsoft Print to PDF', dosyayaYazar: true },
  { ad: 'Kat 2 Yazıcısı', cevrimDisi: true, ciftTarafli: true },
];

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};
const yakin = (a, b, pay) => Math.abs(a - b) <= pay;

/** Sayfada çalışan yardımcılar (window.__yz) */
const YARDIMCI = `window.__yz = {
  o: () => document.querySelector('.yazdir-diyalog'),
  al: (n) => document.querySelector('.yazdir-diyalog [name="' + n + '"]'),
  radyo(n, v) { const r = document.querySelector('.yazdir-diyalog [name="' + n + '"][value="' + v + '"]'); r.click(); },
  sec(n, v) { const s = this.al(n); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); },
  durum() {
    const o = this.o(); if (!o) return null;
    const q = (s) => o.querySelector(s), g = q('.yazdir-onizleme-sayfa'), k = q('.yazdir-kagit');
    const gr = g.getBoundingClientRect(), kr = k.getBoundingClientRect();
    return {
      yazicilar: [...this.al('yazici').options].map((x) => x.textContent), yazici: this.al('yazici').value, yaziciDevre: this.al('yazici').disabled,
      bilgi: q('.yazdir-yazici-bilgi').textContent, bilgiUyari: q('.yazdir-yazici-bilgi').classList.contains('uyari'), tercihDevre: q('[data-id="tercihler"]').disabled,
      kopya: this.al('kopya').value, harmanla: this.al('harmanla').checked, harmanlaDevre: this.al('harmanla').disabled,
      aralik: o.querySelector('[name="aralik"]:checked')?.value, aralikMetni: this.al('aralikMetni').value,
      kagit: this.al('kagit').value, kagitBelge: this.al('kagit').options[0].textContent,
      olcek: o.querySelector('[name="olcek"]:checked')?.value, renk: o.querySelector('[name="renk"]:checked')?.value,
      cift: this.al('ciftTarafli').value, ciftDevre: [...this.al('ciftTarafli').options].filter((x) => x.disabled).map((x) => x.value), ciftBilgi: q('.yazdir-cift-bilgi').hidden ? '' : q('.yazdir-cift-bilgi').textContent,
      notlar: this.al('notlar').checked,
      sayfaNo: q('.yazdir-sayfa-no').textContent, ozet: q('.yazdir-ozet').textContent, onceki: q('[data-id="onceki"]').disabled, sonraki: q('[data-id="sonraki"]').disabled,
      onizlemeDurum: q('.yazdir-onizleme-durum').hidden ? '' : q('.yazdir-onizleme-durum').textContent, kagitGizli: k.hidden,
      kagitOlcu: [kr.width, kr.height], gorselKutu: [gr.width, gr.height], gorselMerkez: [gr.left + gr.width / 2 - kr.left - kr.width / 2, gr.top + gr.height / 2 - kr.top - kr.height / 2],
      dogal: [g.naturalWidth, g.naturalHeight], no: g.dataset.no, don: g.classList.contains('don'), gri: k.classList.contains('gri'), suzgec: getComputedStyle(g).filter,
      yukleniyor: g.classList.contains('yukleniyor'), src: (g.getAttribute('src') || '').length, yazdirDevre: q('[data-id="yazdir"]').disabled,
      sistem: q('[data-id="sistem"]').textContent,
    };
  },
  /** Ön izleme görüntüsünde notun yeşil dolgusunun piksel sayısı */
  yesil() {
    const g = document.querySelector('.yazdir-onizleme-sayfa'); if (!g?.naturalWidth) return -1;
    const c = document.createElement('canvas'); c.width = g.naturalWidth; c.height = g.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(g, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 40 && d[i + 1] > d[i + 2] + 40) n++;
    return n;
  },
};
true`;

export default async function ({ evalJs, ekranGoruntusu, bekle, tus }) {
  const kosul = async (ifade, sure = 10000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evalJs(ifade);
      if (v || Date.now() - t0 > sure) return v;
      await bekle(120);
    }
  };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const kayit = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  const durum = () => evalJs('window.__yz.durum()');
  /** Ön izleme görüntüsü yüklenene dek bekler (yeni istek de dâhil) */
  const goruntu = async () => { await bekle(150); return kosul(`(() => { const d = window.__yz.durum(); return d && !d.yukleniyor && d.dogal[0] > 0; })()`, 10000); };
  const ac = async () => {
    await evalJs(`(window.__pdefe.komutCalistir('dosya.yazdir'), true)`);
    await kosul(`!!window.__yz.o() && !window.__yz.al('yazici').disabled || (window.__yz.o() && window.__yz.al('yazici').options[0]?.textContent === 'Yazıcı bulunamadı')`, 8000);
    await bekle(700);   // yazıcı durumu (sahte: 400 ms) gelsin
    await goruntu();
  };
  const kapat = async () => { await evalJs(`(document.querySelector('.yazdir-diyalog [data-id="iptal"]')?.click(), true)`); await bekle(200); };
  const yazdir = async (dugme = 'yazdir') => {
    await kayit();
    await evalJs(`(document.querySelector('.yazdir-diyalog [data-id="${dugme}"]').click(), true)`);
    await kosul(`!document.querySelector('.yazdir-ortusu')`, 15000);
    await bekle(200);
    return { kayit: (await kayit()).filter((k) => k.kanal === 'yazdir:yazdir'), bildirim: await evalJs(`document.querySelector('#bildirim')?.textContent || ''`) };
  };

  // ------------------------------------------------------------ hazırlık
  fs.mkdirSync(UI, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  const ORNEK = path.join(UI, `ornek-${Date.now().toString(36)}.pdf`);
  execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'yazdir_ornek_uret.py'), ORNEK], { encoding: 'utf8' });
  await evalJs(YARDIMCI);
  await evalJs(`(() => { if (!window.__hatalar) { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push('error: ' + e.message)); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('reject: ' + (e.reason?.message || e.reason))); } return true; })()`);
  await evalJs(`(async () => { const p = window.__pdefe; for (const id of [...p.belgeler.keys()]) await p.belgeKapat(id, { zorla: true }); await window.pdefe.cagir('ayar:koy', 'yazdirma', {}); await window.pdefe.cagir('test:yazicilar', ${J(SAHTE)}); return true; })()`);
  await evalJs(`(async () => { await window.__pdefe.dosyaAc(${J(ORNEK)}); return true; })()`);
  await kosul(`!!window.__pdefe.aktif()?.gorunum?.sayfaSayisi`);
  await bekle(500);
  await kayit();

  // ------------------------------------------------------------ 1) yazıcılar ve varsayılan seçenekler
  await ac();
  let d = await durum();
  await ss('01-pencere');
  sonuc('1) Pencere: başlık "Yazdır", belge adı ve sayfa sayısı', /ornek-.*\.pdf · 4 sayfa/.test(await evalJs(`document.querySelector('.yazdir-belge').textContent`)), await evalJs(`document.querySelector('.yazdir-belge').textContent`));
  sonuc('1) Yazıcılar: sahte liste sıralı, varsayılan ve çevrim dışı işaretli', J(d.yazicilar) === J(['Kat 2 Yazıcısı (çevrim dışı)', 'Lazer Yazıcı (varsayılan)', 'Microsoft Print to PDF']), d.yazicilar);
  sonuc('1) Varsayılan yazıcı ön seçili, Yazıcı tercihleri etkin', d.yazici === 'Lazer Yazıcı' && !d.tercihDevre && d.bilgi === '', d);
  sonuc('1) Varsayılan seçenekler: 1 kopya (harmanla soluk), Tümü, belgeye göre (A4), sığdır, renkli, yazıcının ayarı, notlar kapalı',
    d.kopya === '1' && d.harmanlaDevre && d.harmanla && d.aralik === 'tumu' && d.kagit === 'belge' && d.kagitBelge === 'Belgeye göre (A4)' && d.olcek === 'sigdir' && d.renk === 'renkli' && d.cift === 'yazici' && !d.notlar, d);
  sonuc('1) Windows yazdırma penceresi bağlantısı', d.sistem === 'Windows yazdırma penceresiyle yazdır', d.sistem);
  sonuc('1) Sayfa 1 / 4, ◀ soluk, ▶ etkin, özet "4 sayfa"', d.sayfaNo === '1 / 4' && d.onceki && !d.sonraki && d.ozet === '4 sayfa', d);

  // ------------------------------------------------------------ 2) ön izleme
  const A4 = 210 / 297;
  sonuc('2) Kâğıt A4 dikey oranında', yakin(d.kagitOlcu[0] / d.kagitOlcu[1], A4, 0.01), d.kagitOlcu);
  sonuc('2) Dikey A4 sayfa: dönmez, kâğıdın ortasında, kenar payıyla sığdırılmış ((210 − 8) / 210)', !d.don && yakin(d.gorselKutu[0] / d.kagitOlcu[0], 202 / 210, 0.01)
    && yakin(d.gorselKutu[0] / d.gorselKutu[1], 595 / 842, 0.01) && Math.abs(d.gorselMerkez[0]) < 1 && Math.abs(d.gorselMerkez[1]) < 1, d);
  sonuc('2) Ön izleme görüntüsü keskin: doğal genişliği kutunun ekran pikselinden az değil', d.dogal[0] >= d.gorselKutu[0] * (await evalJs('devicePixelRatio')) - 1, { dogal: d.dogal, kutu: d.gorselKutu });
  await tus('PageDown'); await goruntu(); d = await durum();
  sonuc('2) Page Down: 2 / 4; yatay sayfa 90° döndürülmüş, kâğıtta dikey kutu, görüntüsü yatay', d.sayfaNo === '2 / 4' && d.no === '2' && d.don
    && yakin(d.gorselKutu[0] / d.gorselKutu[1], 595 / 842, 0.01) && d.dogal[0] > d.dogal[1], d);
  await ss('02-yatay');
  await evalJs(`(document.querySelector('.yazdir-diyalog [data-id="sonraki"]').click(), true)`); await goruntu(); d = await durum();
  sonuc('2) ▶: 3 / 4; /Rotate 90\'lı sayfa (görünen ölçüsü yatay) döndürülmüş', d.sayfaNo === '3 / 4' && d.no === '3' && d.don && d.dogal[0] > d.dogal[1], d);
  await evalJs(`(document.querySelector('.yazdir-diyalog [data-id="sonraki"]').click(), true)`); await goruntu(); d = await durum();
  sonuc('2) 4 / 4 (▶ soluk); A5 sayfa A4 kâğıda sığdırılınca büyür (kâğıt genişliğinin %96\'sı)', d.sayfaNo === '4 / 4' && d.sonraki && !d.onceki && !d.don && yakin(d.gorselKutu[0] / d.kagitOlcu[0], 202 / 210, 0.01), d);
  await evalJs(`(window.__yz.radyo('olcek', 'gercek'), true)`); await goruntu(); d = await durum();
  sonuc('2) Gerçek boyut: A5 sayfa A4 kâğıtta 148 / 210 genişlikte', yakin(d.gorselKutu[0] / d.kagitOlcu[0], 420 / 595.28, 0.01), d);
  await ss('03-gercek-boyut');
  await evalJs(`(window.__yz.sec('kagit', 'A5'), true)`); await goruntu(); d = await durum();
  sonuc('2) Kâğıt A5: oran aynı (√2), gerçek boyutta A5 sayfa kâğıdı doldurur', yakin(d.kagitOlcu[0] / d.kagitOlcu[1], 148 / 210, 0.01) && yakin(d.gorselKutu[0] / d.kagitOlcu[0], 1, 0.02), d);
  await evalJs(`(window.__yz.sec('kagit', 'Letter'), true)`); await goruntu(); d = await durum();
  sonuc('2) Kâğıt Letter: 612 / 792 oranında', yakin(d.kagitOlcu[0] / d.kagitOlcu[1], 612 / 792, 0.01), d.kagitOlcu);
  await evalJs(`(window.__yz.sec('kagit', 'belge'), window.__yz.radyo('olcek', 'sigdir'), true)`);
  await tus('PageUp'); await tus('PageUp'); await tus('PageUp'); await goruntu(); d = await durum();
  sonuc('2) Page Up: 1 / 4', d.sayfaNo === '1 / 4' && d.no === '1', d.sayfaNo);
  // Aralık
  await evalJs(`(() => { window.__yz.radyo('aralik', 'aralik'); const a = window.__yz.al('aralikMetni'); a.value = '2-3'; a.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await bekle(400); await goruntu(); d = await durum();
  sonuc('2) Aralık "2-3": 1 / 2 (s. 2), özet "2 sayfa", belgeye göre kâğıt A4', d.sayfaNo === '1 / 2 (s. 2)' && d.no === '2' && d.ozet === '2 sayfa' && d.kagitBelge === 'Belgeye göre (A4)', d);
  await evalJs(`(() => { const a = window.__yz.al('aralikMetni'); a.value = '9'; a.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await bekle(400); d = await durum();
  sonuc('2) Hatalı aralık: ön izlemede hata, kâğıt gizli, sayfa "–"', /4 sayfa var; 9 numaralı sayfa yok/.test(d.onizlemeDurum) && d.kagitGizli && d.sayfaNo === '–' && d.ozet === '', d);
  await evalJs(`(() => { const a = window.__yz.al('aralikMetni'); a.value = '4'; a.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await bekle(400); await goruntu(); d = await durum();
  sonuc('2) Aralık "4" (tek A5 sayfa): belgeye göre kâğıt A5', d.kagitBelge === 'Belgeye göre (A5)' && yakin(d.kagitOlcu[0] / d.kagitOlcu[1], 148 / 210, 0.01) && d.sayfaNo === '1 / 1 (s. 4)', d);
  await evalJs(`(() => { window.__yz.radyo('aralik', 'tumu'); return true; })()`); await goruntu();
  // Kopya özeti, harmanla
  await evalJs(`(() => { const k = window.__yz.al('kopya'); k.value = '2'; k.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); d = await durum();
  sonuc('2) 2 kopya: özet "4 sayfa × 2 kopya", Harmanla etkin', d.ozet === '4 sayfa × 2 kopya' && !d.harmanlaDevre, d);
  await evalJs(`(() => { const k = window.__yz.al('kopya'); k.value = '250'; k.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); d = await durum();
  sonuc('2) Kopya en çok 99', d.kopya === '99' && d.ozet === '4 sayfa × 99 kopya', d.kopya);
  await evalJs(`(() => { const k = window.__yz.al('kopya'); k.value = '2'; k.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  // Siyah beyaz, notlar
  await evalJs(`(window.__yz.radyo('renk', 'siyahBeyaz'), true)`); d = await durum();
  sonuc('2) Siyah beyaz: ön izleme gri', d.gri && d.suzgec === 'grayscale(1)', d);
  await evalJs(`(window.__yz.radyo('renk', 'renkli'), true)`);
  for (let i = 0; i < 4; i++) await tus('PageUp');
  await goruntu();
  sonuc('2) Notlu sayfaya dönüldü (1 / 4)', (await durum()).sayfaNo === '1 / 4');
  const yesilYok = await evalJs('window.__yz.yesil()');
  await evalJs(`(window.__yz.al('notlar').click(), true)`); await goruntu();
  const yesilVar = await evalJs('window.__yz.yesil()');
  sonuc('2) Notlar kapalıyken ön izlemede not yok, açılınca notun yeşil dolgusu görünür', yesilYok === 0 && yesilVar > 200, { yesilYok, yesilVar });
  await ss('04-notlar');
  await evalJs(`(window.__yz.al('notlar').click(), true)`); await goruntu();
  sonuc('2) Notlar yeniden kapatılınca önbellekteki notsuz görüntü', (await evalJs('window.__yz.yesil()')) === 0);

  // ------------------------------------------------------------ 3) yazıcıya göre
  await evalJs(`(window.__yz.sec('ciftTarafli', 'uzun'), window.__yz.sec('yazici', 'Kat 2 Yazıcısı'), true)`); d = await durum();
  sonuc('3) Çevrim dışı yazıcı: uyarı', /çevrim dışı görünüyor/.test(d.bilgi) && d.bilgiUyari && d.cift === 'uzun' && !d.ciftDevre.length, d);
  await evalJs(`(window.__yz.sec('yazici', 'Microsoft Print to PDF'), true)`); d = await durum();
  sonuc('3) Dosyaya yazan yazıcı: açıklama; çift taraflı desteklemiyor: iki seçenek soluk, "Yazıcının ayarı"na döner',
    /dosyaya kaydeder/.test(d.bilgi) && J(d.ciftDevre) === J(['uzun', 'kisa']) && d.cift === 'yazici' && /desteklemiyor/.test(d.ciftBilgi), d);
  await ss('05-dosyaya-yazan');
  await evalJs(`(window.__yz.sec('yazici', 'Lazer Yazıcı'), true)`); d = await durum();
  sonuc('3) Çift taraflı basan yazıcıya dönünce seçenekler etkin', !d.ciftDevre.length && d.ciftBilgi === '' && d.bilgi === '', d);
  await kayit();
  await evalJs(`(document.querySelector('.yazdir-diyalog [data-id="tercihler"]').click(), true)`); await bekle(400);
  const tercih = (await kayit()).filter((k) => k.kanal === 'yazdir:tercihler');
  sonuc('3) Yazıcı tercihleri: seçili yazıcının tercihleri istenir (test örneğinde açılmaz)', tercih.length === 1 && tercih[0].secenek.yazici === 'Lazer Yazıcı', tercih);

  // ------------------------------------------------------------ 4) Yazdır
  await evalJs(`(() => { window.__yz.sec('ciftTarafli', 'uzun'); window.__yz.radyo('renk', 'siyahBeyaz'); window.__yz.al('harmanla').checked = false;
    window.__yz.radyo('aralik', 'aralik'); const a = window.__yz.al('aralikMetni'); a.value = '2-3'; a.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await bekle(300);
  let y = await yazdir();
  const s = y.kayit[0]?.secenek?.secenek || {};
  sonuc('4) Yazdır: Windows kutusu yerine seçilen yazıcıya sessiz yazdırma (deviceName Lazer Yazıcı, 2 kopya, harmansız, siyah beyaz, uzun kenar, A4)',
    y.kayit.length === 1 && J(s) === J({ silent: true, printBackground: true, margins: { marginType: 'none' }, color: false, deviceName: 'Lazer Yazıcı', copies: 2, collate: false, duplexMode: 'longEdge', pageSize: 'A4' }), y.kayit);
  sonuc('4) pageRanges / landscape / dpi gönderilmez', !['pageRanges', 'landscape', 'dpi'].some((a) => a in s), s);
  sonuc('4) Gizli pencerede seçilen 2 sayfa yüklendi (A4 kâğıt)', J(y.kayit[0]?.secenek?.sayfa) === J({ sayfa: 2, gorsel: 2, kagit: '@page { size: 210mm 297mm; margin: 0px; }' }), y.kayit[0]?.secenek?.sayfa);
  sonuc('4) Bildirim: "Lazer Yazıcı" yazıcısına gönderildi: 2 sayfa × 2 kopya', y.bildirim === '"Lazer Yazıcı" yazıcısına gönderildi: 2 sayfa × 2 kopya', y.bildirim);
  const kayitli = await evalJs(`window.pdefe.cagir('ayar:al', 'yazdirma')`);
  sonuc('4) Kalıcı seçimler yazıldı (yazıcı, harmanla, kâğıt, boyut, renk, çift taraflı)', J(kayitli) === J({ yazici: 'Lazer Yazıcı', harmanla: false, kagit: 'belge', olcek: 'sigdir', renk: 'siyahBeyaz', ciftTarafli: 'uzun' }), kayitli);

  // ------------------------------------------------------------ 5) hatırlama
  await ac(); d = await durum();
  sonuc('5) Yeniden açılınca: yazıcı, harmanla, renk, çift taraflı hatırlandı; kopya 1; sayfa seçimi "2-3" (oturum); notlar kapalı',
    d.yazici === 'Lazer Yazıcı' && !d.harmanla && d.renk === 'siyahBeyaz' && d.cift === 'uzun' && d.kopya === '1' && d.aralik === 'aralik' && d.aralikMetni === '2-3' && !d.notlar && d.ozet === '2 sayfa', d);
  await evalJs(`(() => { window.__yz.sec('yazici', 'Kat 2 Yazıcısı'); window.__yz.sec('ciftTarafli', 'yazici'); window.__yz.radyo('renk', 'renkli'); window.__yz.radyo('aralik', 'tumu'); return true; })()`);
  y = await yazdir();
  const s2 = y.kayit[0]?.secenek?.secenek || {};
  sonuc('5) "Yazıcının ayarı": duplexMode gönderilmez; renkli; 4 sayfa', y.kayit.length === 1 && !('duplexMode' in s2) && s2.color === true && s2.deviceName === 'Kat 2 Yazıcısı' && y.kayit[0].secenek.sayfaSayisi === 4, y.kayit);
  sonuc('5) Çevrim dışı yazıcıda bildirim kuyruğu söyler', /yazıcı çevrim dışı görünüyor; iş, yazıcı açılınca basılır/.test(y.bildirim), y.bildirim);
  // Hatırlanan yazıcı kaldırılmış
  await evalJs(`window.pdefe.cagir('test:yazicilar', ${J(SAHTE.filter((x) => x.ad !== 'Kat 2 Yazıcısı'))})`);
  await ac(); d = await durum();
  sonuc('5) Hatırlanan yazıcı kaldırılmış: varsayılan seçili, uyarı', d.yazici === 'Lazer Yazıcı' && /Son kullanılan yazıcı \("Kat 2 Yazıcısı"\) bulunamadı; varsayılan yazıcı seçildi/.test(d.bilgi) && d.bilgiUyari, d);
  // Yazdırma hatası: yazıcı tam o sırada kaldırıldı
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'yazdir:yazdir', [{ basarili: false, neden: 'Invalid deviceName provided' }])`);
  await evalJs(`(window.__pdefeOtoYanit = { secim: 0, onay: false }, true)`);
  y = await yazdir();
  const soru = await evalJs(`(() => { const o = window.__pdefeOtoYanit; delete window.__pdefeOtoYanit; return o?.son || null; })()`);
  sonuc('5) "Invalid deviceName" → "Yazıcı bulunamadı (kaldırılmış ya da adı değişmiş olabilir)"', soru?.mesaj === 'Yazdırılamadı' && /^Yazıcı bulunamadı \(kaldırılmış ya da adı değişmiş olabilir\)/.test(soru?.ayrinti || ''), soru);
  // Windows yazdırma penceresi (yedek yol)
  await ac();
  await evalJs(`(() => { const k = window.__yz.al('kopya'); k.value = '3'; k.dispatchEvent(new Event('input', { bubbles: true })); window.__yz.sec('ciftTarafli', 'kisa'); return true; })()`);
  y = await yazdir('sistem');
  const s3 = y.kayit[0]?.secenek?.secenek || {};
  sonuc('5) Windows yazdırma penceresiyle: silent false, yazıcı ve kopya Windows\'un penceresinde (deviceName / copies yok)',
    y.kayit.length === 1 && s3.silent === false && !('deviceName' in s3) && !('copies' in s3) && s3.duplexMode === 'shortEdge' && s3.pageSize === 'A4' && y.bildirim === 'Yazıcıya gönderildi: 4 sayfa', { s3, b: y.bildirim });
  // Hiç yazıcı yok
  await evalJs(`window.pdefe.cagir('test:yazicilar', [])`);
  await ac(); d = await durum();
  await ss('06-yazici-yok');
  sonuc('5) Yazıcı yok: "Yazıcı bulunamadı", Yazdır soluk, açıklama; Windows penceresi bağlantısı kullanılabilir', d.yaziciDevre && d.yazicilar[0] === 'Yazıcı bulunamadı' && d.yazdirDevre && /Kurulu yazıcı yok/.test(d.bilgi) && d.tercihDevre, d);
  await tus('Escape'); await bekle(200);
  sonuc('5) Esc kapatır, iş yok', !(await evalJs(`!!document.querySelector('.yazdir-ortusu')`)) && !(await evalJs(`window.pdefe.cagir('yazdir:durum')`)).suruyor);
  await evalJs(`window.pdefe.cagir('test:yazicilar', ${J(SAHTE)})`);
  await evalJs(`window.pdefe.cagir('ayar:koy', 'yazdirma', {})`);

  const hatalar = await evalJs(`(window.__hatalar || []).slice(0, 5)`);
  sonuc('Sayfada hata yok', !hatalar?.length, hatalar);
  console.log(hataSayisi ? `${hataSayisi} HATA / ${toplam}` : `BÜTÜN DENETİMLER GEÇTİ (${toplam})`);
}
