// Geç iptal (0.2.1): Sıkıştır ve Sayfaları düzenle'de "Kaydediliyor…" aşamasında İptal'e (ya da X › "İptal et ve kapat"a) basılınca
// çekirdek dosyayı yine de yazmış olabilir (Sıkıştır: kayıttan sonraki ilerleme bildiriminde iptal hatası; Sayfaları düzenle: kayıttan
// sonra iptale bakılmaz, sonuç döner). "Yeni belge olarak kaydet"te "zaten var" sorusunda "Üzerine yaz"la onaylanmış var olan hedef
// önceden çöp kutusuna gönderiliyordu (önceki içeriği os.replace ile zaten gitmişti). Artık yalnızca yeni oluşan dosya silinir; var
// olanın yerine yazılmışsa sonuç kalır ve "İptal edilemeden tamamlandı" denir (Birleştir'deki gibi).
// Araç pencereleri uygulamanın kendi sayfasında, gerçek çekirdekle ve gerçek dosyalarla kurulur; yalnızca bağlamın 'dosya:sil' çağrısı
// kaydedilir (çöp kutusuna gerçekten gönderilmez) ve bildirimler toplanır.
// Kullanım: powershell -File test\baslat.ps1 -Port <port> -Veri <klasör>; $env:PDEFE_CDP_PORT=<port>; node test\surucu.mjs betik test\gec_iptal.mjs
// Çıktı klasörü $env:GEC_IPTAL_KLASORU (varsayılan test/cikti/gec_iptal). Belgeler .venv'deki PyMuPDF ile üretilir (gerçek belge yok): 1500
// sayfalık yazılı belge (çekirdeğin "Kaydediliyor…" bildirimi sonuçtan önce gelsin; Sayfaları düzenle'de kayıt birkaç saniye sürer) ve
// "var olan hedef" yerine konan 1 sayfalık belge. İptal "Kaydediliyor…"dan sonra gidince çekirdek dosyayı her durumda yazar (iki araç da
// yazdıktan sonra iptale bakmaz ya da yalnızca bildirimde bakar): sonuç zamanlamaya bağlı değildir.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const K = path.resolve(process.env.GEC_IPTAL_KLASORU || path.join(KOK, 'test', 'cikti', 'gec_iptal'));
const BUYUK = path.join(K, 'buyuk.pdf');
const KUCUK = path.join(K, 'kucuk.pdf');
const J = (x) => JSON.stringify(x);

/** n sayfalık, her sayfasında satir satır yazı olan PDF (yalnızca yerleşik Helvetica; birkaç saniyede üretilir). */
function pdfUret(yol, n, satir) {
  execFileSync(PY, ['-X', 'utf8', '-c', `import sys, pymupdf
d = pymupdf.open()
for i in range(${n}):
    pg = d.new_page(width=595, height=842)
    for s in range(${satir}):
        pg.insert_text((40, 40 + s * 19), "Sayfa %d satir %d: gec iptal sinamasi icin ornek metin %d" % (i + 1, s + 1, (i * 7 + s) % 997), fontsize=10)
d.save(sys.argv[1], garbage=1, deflate=True)`, yol], { encoding: 'utf8' });
}

let hata = 0, tamam = 0;
function sonuc(ad, kosul, ayrinti) {
  if (kosul) tamam++; else hata++;
  console.log(`${kosul ? 'TAMAM' : 'HATA '}  ${ad}${kosul || ayrinti === undefined ? '' : '  — ' + J(ayrinti)}`);
}

export default async function ({ evalJs, bekle }) {
  fs.mkdirSync(K, { recursive: true });
  if (!fs.existsSync(BUYUK)) pdfUret(BUYUK, 1500, 15);
  if (!fs.existsSync(KUCUK)) pdfUret(KUCUK, 1, 5);

  // Sayfa içi yardımcılar: araç penceresine verilen bağlam (gerçek çekirdek, dosya:sil ve bildirimler kaydedilir)
  await evalJs(`(async () => {
    const p = window.__pdefe, k = window.pdefe;
    for (let i = 0; i < 10 && document.querySelector('.mesaj-ortusu'); i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const ortak = await import('pdefe://app/src/renderer/araclar/ortak.js');
    if (ortak.acikAracPenceresiVar()) await ortak.aracPencereleriniKapat();
    for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true });
    const a = p.ayar(); a.ciktiKlasoru = ${J(K)}; a.otomatikKaydet = false;
    if (!window.__gi) {
      const dinleyiciler = new Map();
      k.dinle('cekirdek:ilerleme', (id, il) => dinleyiciler.get(id)?.(il));
      let sayac = 900000;   // uygulamanın kendi istek kimlikleriyle karışmasın
      window.__gi = {
        kayit: { silinen: [], bildirimler: [] },
        baglam() {
          const kayit = this.kayit;
          const cekirdek = (yontem, params, ilerleme) => {
            const istekId = ++sayac;
            if (ilerleme) dinleyiciler.set(istekId, ilerleme);
            const soz = k.cagir('cekirdek:cagir', yontem, params, istekId).finally(() => dinleyiciler.delete(istekId));
            soz.istekId = istekId;
            soz.iptal = () => k.cagir('cekirdek:iptal', istekId);
            return soz;
          };
          const pdefe = {
            platform: k.platform,
            cagir: (kanal, ...ek) => (kanal === 'dosya:sil' ? (kayit.silinen.push(ek[0]), Promise.resolve(true)) : k.cagir(kanal, ...ek)),
            dinle: (kanal, cb) => k.dinle(kanal, cb),
            dosyaYolu: (f) => k.dosyaYolu(f),
          };
          return {
            aktif: p.aktif, cekirdek, iptal: (id) => k.cagir('cekirdek:iptal', id), dosyaAc: p.dosyaAc, kaydet: (b) => p.belgeKaydet(b),
            mesajKutusu: p.mesajKutusu, bildir: (m) => { kayit.bildirimler.push(m); }, pdefe, ayar: p.ayar, ayarKoy: () => {},
            sayfaTarifiUygula: p.sayfaTarifiUygula, belgeKapat: p.belgeKapat, belgeler: () => [...p.belgeler.values()],
            dosyaYolu: (f) => k.dosyaYolu(f),
          };
        },
      };
    }
    return true;
  })()`);
  const ac = (yol) => evalJs(`(async () => { const p = window.__pdefe; const b = await p.dosyaAc(${J(yol)}); for (let i = 0; i < 100 && !b?.gorunum?.sayfaSayisi; i++) await new Promise((r) => setTimeout(r, 100)); return b?.gorunum?.sayfaSayisi || 0; })()`);
  const sekmeleriKapat = () => evalJs(`(async () => { const p = window.__pdefe; for (const s of [...p.sekmeler.sekmeler]) await p.belgeKapat(s.id, { zorla: true }); return true; })()`);

  /**
   * Bir araç denemesi: pencere kurulur, kaydetme hedefi K/<hedefAd>.pdf yapılır ("zaten var" sorusu Üzerine yaz), işlem başlatılır;
   * ilerleme "Kaydediliyor…" deyince İptal (ya da X › İptal et ve kapat). Döner: { kaydediliyor, silinen, bildirimler, pencereKapali, ... }
   */
  const dene = (arac, hedefAd, { kapatarak = false } = {}) => evalJs(`(async () => {
    const kayit = window.__gi.kayit; kayit.silinen = []; kayit.bildirimler = [];
    const baglam = window.__gi.baglam();
    const arac = ${J(arac)};
    const m = await import('pdefe://app/src/renderer/araclar/' + (arac === 'kucult' ? 'kucult.js' : 'sayfalar.js'));
    const w = arac === 'kucult' ? new m.KucultPenceresi(baglam, baglam.aktif()) : new m.SayfalarPenceresi(baglam, baglam.aktif());
    await w.kayit.hazir;
    w.kayit.cikti.ayarla(${J(K)}, ${J(hedefAd)}, { elle: true });
    if (arac === 'sayfalar') w.dondur([w.kartlar[0].kimlik], 90);   // değişiklik olmadan kaydedilmez
    window.__pdefeOtoYanit = { secim: 0 };   // "zaten var" → Üzerine yaz; X sorusu → İptal et ve kapat
    let kaydediliyor = false, iptalAni = null;
    const t0 = performance.now();
    // Çekirdeğin "Kaydediliyor…" bildirimi (Sıkıştır %88, Sayfaları düzenle %85; Sayfaları düzenle'nin başlangıç iletisi de "Kaydediliyor…")
    const gozcu = new MutationObserver(() => {
      const yuzde = parseInt(w.ilerleme.yuzdeEl.textContent.replace('%', ''), 10);
      if (kaydediliyor || w.ilerleme.mesajEl.textContent !== 'Kaydediliyor…' || !(yuzde >= 85)) return;
      kaydediliyor = true; iptalAni = Math.round(performance.now() - t0);
      if (${kapatarak}) w.pencere.kapat(); else w.ilerleme.iptalDugmesi.click();
    });
    gozcu.observe(w.ilerleme.el, { childList: true, characterData: true, subtree: true });
    try { await (arac === 'kucult' ? w.kucult() : w.kaydet()); } finally { gozcu.disconnect(); }
    const sure = Math.round(performance.now() - t0);
    for (let i = 0; i < 50 && !w.pencere.kapali && w.sonucEl?.hidden !== false; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 800));   // sonucu açma (ciktiyiAc) bitsin
    const sonucMetni = w.sonucEl && !w.sonucEl.hidden ? w.sonucEl.textContent.replace(/\\s+/g, ' ').trim() : '';
    if (!w.pencere.kapali) await w.pencere.kapat('tamam');
    window.__pdefeOtoYanit = { secim: 1 };
    const sekmeler = [...window.__pdefe.belgeler.values()].map((b) => b.ad);
    return { kaydediliyor, iptalAni, sure, silinen: kayit.silinen, bildirimler: kayit.bildirimler, sonucMetni, sekmeler };
  })()`);

  const durumu = (yol) => (fs.existsSync(yol) ? fs.statSync(yol).size : null);
  const yollar = [];
  const hazirla = (ad, varOlan) => {
    const yol = path.join(K, ad + '.pdf');
    yollar.push(yol);
    try { fs.rmSync(yol, { force: true }); } catch { /* yok say */ }
    if (varOlan) fs.copyFileSync(KUCUK, yol);
    return yol;
  };

  const vakalar = [
    { arac: 'kucult', ad: 'Var-olan-sikistir', varOlan: true, bitti: 'Sıkıştırma iptal edildi.' },
    { arac: 'kucult', ad: 'Var-olan-sikistir-X', varOlan: true, kapatarak: true, bitti: 'Sıkıştırma iptal edildi.' },
    { arac: 'kucult', ad: 'Yeni-sikistir', varOlan: false, bitti: 'Sıkıştırma iptal edildi.' },
    { arac: 'sayfalar', ad: 'Var-olan-sayfalar', varOlan: true, bitti: 'Kaydetme iptal edildi.' },
    { arac: 'sayfalar', ad: 'Var-olan-sayfalar-X', varOlan: true, kapatarak: true, bitti: 'Kaydetme iptal edildi.' },
    { arac: 'sayfalar', ad: 'Yeni-sayfalar', varOlan: false, bitti: 'Kaydetme iptal edildi.' },
  ];
  const secilen = (process.env.GEC_IPTAL_VAKA || '').split(',').filter(Boolean);
  for (const v of vakalar) {
    if (secilen.length && !secilen.includes(v.ad)) continue;
    const ad = `${v.arac === 'kucult' ? 'Sıkıştır' : 'Sayfaları düzenle'} · ${v.varOlan ? 'var olan hedef (Üzerine yaz onaylı)' : 'yeni hedef'}${v.kapatarak ? ' · X › İptal et ve kapat' : ''}`;
    await sekmeleriKapat();
    const sayfa = await ac(BUYUK);
    if (!sayfa) { sonuc(`${ad}: büyük belge açıldı`, false, sayfa); continue; }
    const hedef = hazirla(v.ad, v.varOlan);
    const once = durumu(hedef);
    const r = await dene(v.arac, v.ad, { kapatarak: v.kapatarak });
    const sonra = durumu(hedef);
    const silindi = r.silinen.some((y) => path.resolve(y) === hedef);
    const gecIptal = r.bildirimler.some((m) => m.startsWith('İptal edilemeden tamamlandı'));
    const iptal = r.bildirimler.some((m) => m.startsWith(v.bitti));
    sonuc(`${ad}: "Kaydediliyor…" aşamasında iptal istendi`, r.kaydediliyor, r);
    if (!r.kaydediliyor) continue;
    if (v.varOlan) {
      // Çekirdek dosyayı yazdı (iptal kayıttan sonra ulaştı): sonuç yerinde kalır, çöp kutusuna gönderilmez
      const yazildi = sonra != null && sonra !== once;
      sonuc(`${ad}: var olan hedef çöp kutusuna gönderilmedi, yeni içerik yerinde (${once} → ${sonra} B)`, !silindi && yazildi, { silinen: r.silinen, once, sonra });
      sonuc(`${ad}: "İptal edilemeden tamamlandı: \\"${v.ad}.pdf\\" üzerine yazıldı." bildirimi, "iptal edildi" denmedi`,
        r.bildirimler.includes(`İptal edilemeden tamamlandı: "${v.ad}.pdf" üzerine yazıldı.`) && !iptal, r.bildirimler);
      sonuc(`${ad}: sonuç PDEfe'de açıldı`, r.sekmeler.includes(`${v.ad}.pdf`), r.sekmeler);
    } else if (sonra != null) {
      // Yeni dosya oluştu (iptal geç ulaştı): yarım iş bırakılmaz, çöp kutusuna gönderilir; "iptal edildi"
      sonuc(`${ad}: iptal geç ulaştı, yeni oluşan dosya çöp kutusuna gönderildi ve "iptal edildi" denildi`, silindi && iptal && !gecIptal, { silinen: r.silinen, bildirimler: r.bildirimler });
    } else {
      // İptal kayıttan önce ulaştı: dosya hiç oluşmadı
      sonuc(`${ad}: iptal kayıttan önce ulaştı, dosya oluşmadı ve "iptal edildi" denildi`, !silindi && iptal && !gecIptal, { silinen: r.silinen, bildirimler: r.bildirimler });
    }
  }

  await sekmeleriKapat();
  await evalJs(`(window.__pdefeOtoYanit = null, true)`);
  for (const y of yollar) { try { fs.rmSync(y, { force: true }); } catch { /* yok say */ } }
  console.log(`\n${tamam} tamam, ${hata} hata`);
}
