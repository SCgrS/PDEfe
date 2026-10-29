// Senaryo 45 (0.3.1, kullanıcı isteği: "tıklanabilir sayfa bölmeleri çalışmalı … içindekilere tıklayamıyorum"): iç bağlantılar ve yer imleri.
//   1) İçindekiler sayfasındaki her hedef biçimi (GoTo eylemi + XYZ, /Dest dizisi, Fit, FitH, FitV, FitR, FitB, FitBH, FitBV, Names ağacı,
//      /Dests sözlüğü, GoTo eylemi + ad, "/" ile başlayan ad, döndürülmüş sayfa, kaydırılmış MediaBox, NextPage) gerçek fare tıklamasıyla:
//      doğru sayfa ve hedef noktası pencerenin üstünde (sayfayaGit'in 8 px payıyla; Fit türlerinde sayfanın başı). Bağlantı el imleçli,
//      ipucu "Sayfa N". GoToR ve Launch açılmaz (bildirim), olmayan ad "bulunamadı" der. 2. sayfadaki PrevPage / FirstPage / LastPage /
//      NextPage. Döndürülmüş (/Rotate 90) sayfadaki bağlantının kutusu döndürülmüş sayfada doğru yerde ve tıklanır.
//   2) Kullanıcının döndürdüğü hedef sayfa (90°): XYZ noktası döndürülmüş görünümde pencerenin üstünde.
//   3) Sayfa düzeni değişmiş belge: 2. sayfa silinmiş, sonra sıra ters çevrilmiş; hedef kaynak sayfasının şimdiki yerine gider, NextPage
//      gösterilen sayfaya göre (son sayfada kımıldamaz), ipucu şimdiki numarayı söyler; hedef sayfa silinince "bu belgede yok".
//   4) Sayfalar panelinin yer imleri (İçindekiler): adlandırılmış hedef, kaydırılmış kutu, döndürülmüş sayfa, GoTo eylemiyle FitH.
//   5) PyMuPDF'in çözemediği hedef (sayfasız ad, sayfasız açık hedef: sayfa başvurusu ya da dizin) PDF.js ile çözülür.
//   6) Yakınlaştırılmış görünümde XYZ'nin sol koordinatı pencerenin solunda (16 px payıyla).
// Örnek PDF test/ic_baglanti_pdf_uret.py ile üretilir (betik kendisi çalıştırır; gerçek belge yok): test/cikti/s45/ic_baglantilar-<koşum>.pdf.
// Kullanım (ekran dışı):
//   powershell -File test\baslat.ps1 -Port 9300 -Veri "$env:TEMP\pdefe-s45-9300" -Boyut "1280,900"   → PID=… yazar
//   $env:PDEFE_CDP_PORT=9300; node test\surucu.mjs betik test\senaryo45.mjs
//   powershell -File test\durdur.ps1 -SurecId <PID>
// Yalnızca bazı bölümler: $env:BOLUM="1,3".
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(KOK, 'test', 'cikti', 's45');
// Her koşumda yeni ad: çekirdek önceki koşumun dosyasını açık tutabilir (önbellek), üzerine yazılamaz
const PDF = path.join(UI, `ic_baglantilar-${Date.now().toString(36)}.pdf`);
const PY = path.join(KOK, '.venv', 'Scripts', 'python.exe');
const J = (x) => JSON.stringify(x);
const BOLUMLER = (process.env.BOLUM || '').split(',').map((s) => s.trim()).filter(Boolean);
const bolum = (n) => !BOLUMLER.length || BOLUMLER.includes(String(n));
const DIS_DOSYA = 'Bu bağlantı başka bir dosyayı ya da programı açtığı için güvenlik nedeniyle açılmadı.';
const PAY = 8;          // sayfayaGit: hedefin üstünde bırakılan pay (px)
const SOL_PAY = 16;     // sayfayaGit: secenek.x'in solunda bırakılan pay (px)

let hataSayisi = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

/** Testin kendi hesabı: PDF kullanıcı uzayındaki nokta (px, py) → döndürülmüş, görünen sayfanın sol üstünden pt [X, Y]
 *  (view: [x0, y0, x1, y1], r: ekrandaki mutlak döndürme, saat yönünde). */
function gorunenNokta(px, py, view, r) {
  const [x0, y0, x1, y1] = view;
  switch (((r % 360) + 360) % 360) {
    case 90: return [py - y0, px - x0];
    case 180: return [x1 - px, py - y0];
    case 270: return [y1 - py, x1 - px];
    default: return [px - x0, y1 - py];
  }
}

// Sayfaya yüklenen yardımcılar (window.__s45)
const YARDIMCI = `window.__s45 = {
  g: () => window.__pdefe.aktif().gorunum,
  bildirimler: [],
  async hazir(no, adet) {
    const g = this.g();
    for (let i = 0; i < 100; i++) {
      const s = g.sayfalar[no - 1];
      if (s && s.el.querySelectorAll('.baglanti').length >= adet) return true;
      await new Promise((c) => setTimeout(c, 100));
    }
    return false;
  },
  /** no. sayfanın k. bağlantısı pencerede görünsün; ortasının pencere koordinatı (CSS px). Katman yeniden çizilebildiği için öğe her
   *  ölçümde yeniden aranır; o noktada gerçekten bağlantı varsa döner (yoksa bekleyip yeniden dener). */
  async gorunurYap(no, k) {
    const g = this.g();
    const bekle = (ms) => new Promise((c) => setTimeout(c, ms));
    let son = null;
    for (let deneme = 0; deneme < 30; deneme++) {
      const st = g.kaydirici.scrollTop;
      await bekle(120);
      if (g.kaydirici.scrollTop !== st) { son = ['kayiyor', st, g.kaydirici.scrollTop]; continue; }   // kaydırma sürüyor
      const el = g.sayfalar[no - 1].el.querySelectorAll('.baglanti')[k];
      if (!el) { son = ['oge yok']; await bekle(100); continue; }
      const kr = g.kaydirici.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.top < kr.top + 40 || r.bottom > kr.bottom - 40) { son = ['disarida', r.top, r.bottom, kr.top, kr.bottom, st]; g.kaydirici.scrollTop += (r.top + r.height / 2) - (kr.top + kr.height / 2); continue; }
      if (r.left < kr.left + 4 || r.left + 60 > kr.right - 20) { son = ['yanda', r.left, kr.left]; g.kaydirici.scrollLeft += r.left - kr.left - 40; continue; }
      const x = Math.round(r.left + Math.min(40, r.width / 2)), y = Math.round(r.top + r.height / 2);
      const ust = document.elementFromPoint(x, y);
      if (!ust || !ust.classList.contains('baglanti')) {
        const yol = []; for (let n = ust; n && yol.length < 5; n = n.parentElement) yol.push(n.tagName + '.' + n.className + '#' + n.id);
        son = ['ustte', x, y, yol, el.isConnected, r.left, r.top, r.width, r.height]; continue;
      }
      return { x, y, title: el.title, imlec: getComputedStyle(el).cursor };
    }
    console.warn('gorunurYap', JSON.stringify(son));
    window.__s45.sonHata = son;
    return null;
  },
  /** Geçerli sayfa, görünen sayfa (no) ve onun Y pt yüksekliğinin pencerenin üstüne uzaklığı (px); X verilirse solundan uzaklığı. */
  async konum(no, Y, X) {
    const g = this.g();
    const s = g.sayfalar[no - 1];
    const p = await g.sayfaAl(no - 1);
    const kr = g.kaydirici.getBoundingClientRect(), sr = s.el.getBoundingClientRect();
    const k = g.olcek * 96 / 72;
    const kd = g.kaydirici;
    return {
      gecerli: g.gecerli, view: [...p.view], dondurme: g.toplamDondurme(s),
      ust: Y == null ? null : sr.top + Y * k - kr.top, sol: X == null ? null : sr.left + X * k - kr.left,
      altSinir: kd.scrollTop >= kd.scrollHeight - kd.clientHeight - 1, sagKaydirilabilir: kd.scrollWidth > kd.clientWidth + 1,
      sagSinir: kd.scrollLeft >= kd.scrollWidth - kd.clientWidth - 1, solSinir: kd.scrollLeft <= 0,
      scrollTop: kd.scrollTop, scrollLeft: kd.scrollLeft,
    };
  },
};
new MutationObserver(() => { const t = document.querySelector('#bildirim')?.textContent; if (t && !document.querySelector('#bildirim').hidden) window.__s45.bildirimler.push(t); })
  .observe(document.querySelector('#bildirim'), { childList: true, characterData: true, subtree: true, attributes: true });
1`;

export default async function ({ evalJs, bekle, tikla }) {
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  fs.mkdirSync(UI, { recursive: true });
  const ozet = JSON.parse(execFileSync(PY, ['-X', 'utf8', path.join(KOK, 'test', 'ic_baglanti_pdf_uret.py'), PDF], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  const satir = (anahtar) => ozet.satirlar.find((s) => s.anahtar === anahtar);
  const sira = (anahtar) => { const s = satir(anahtar); return ozet.satirlar.filter((t) => t.sayfa === s.sayfa).indexOf(s); };

  let acikYol = PDF, kopyaNo = 0;
  const ac = async () => {
    await evalJs(`(() => { const p = window.__pdefe.panel; if (p.acik) window.__pdefe.komutCalistir('gorunum.solPanel'); return 1; })()`);
    await evalJs(`(async () => { for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true }).catch(() => {}); return 1; })()`).catch(() => {});
    // Her bölüm üretilen belgenin yeni bir kopyasını açar: 3. bölüm belgeyi kaydeder, PDEfe dosyanın son sayfasını hatırlar
    acikYol = PDF.replace(/\.pdf$/, `-${++kopyaNo}.pdf`);
    fs.copyFileSync(PDF, acikYol);
    await evalJs(`window.__pdefe.dosyaAc(${J(acikYol)}).then(() => 1)`);
    await kosul(`window.__pdefe.aktif()?.gorunum.sayfalar.length === ${ozet.sayfa}`);
    await evalJs(YARDIMCI);
    await evalJs(`window.__s45.g().sayfayaGit(1)`);
  };

  /** Görünen sayfa no'daki bağlantıya (anahtar, ya da [sayfa no, sıra]) gerçek fareyle tıklar; tıklamadan önceki ipucu ve imleç. */
  const baglantiyaTikla = async (no, k) => {
    await evalJs(`window.__s45.g().sayfayaGit(${no})`);
    sonuc(`  sayfa ${no}: bağlantı katmanı çizildi`, await evalJs(`window.__s45.hazir(${no}, ${k + 1})`));
    const yer = await evalJs(`window.__s45.gorunurYap(${no}, ${k})`);
    if (!yer) { console.log('     · bağlantı görünür yapılamadı:', J(await evalJs('window.__s45.sonHata'))); return null; }
    await evalJs(`window.__s45.bildirimler.length = 0`);
    await tikla(yer.x, yer.y);
    await bekle(500);
    return yer;
  };

  /** Hedefte beklenen Y (ve X) pt: ozet.hedefler[anahtar] → testin kendi hesabıyla görünen noktası. */
  const beklenen = async (gosterilen, h) => {
    const k = await evalJs(`window.__s45.konum(${gosterilen})`);
    if (h.sol == null && h.ust == null) return { Y: 0, X: null, dondurme: k.dondurme };
    const [x0, , , y1] = k.view;
    const [X, Y] = gorunenNokta(h.sol ?? x0, h.ust ?? y1, k.view, k.dondurme);
    return { Y, X: h.sol != null ? X : null, dondurme: k.dondurme };
  };

  /** Hedefe varıldı mı: geçerli sayfa ve hedef noktasının pencerenin üstüne uzaklığı (PAY; aşağıda kaydırma sınırına dayandıysa aşağıda). */
  const hedefteMi = async (ad, gosterilen, h, { solDenetle = false } = {}) => {
    await kosul(`window.__s45.g().gecerli === ${gosterilen}`, 3000);
    const b = await beklenen(gosterilen, h);
    const k = await evalJs(`window.__s45.konum(${gosterilen}, ${b.Y}, ${b.X == null ? 'null' : b.X})`);
    const ustOk = Math.abs(k.ust - PAY) <= 2 || (k.altSinir && k.ust > PAY);
    sonuc(`${ad}: sayfa ${gosterilen}${b.dondurme ? ` (${b.dondurme}°)` : ''}, hedef noktası pencerenin üstünde`, k.gecerli === gosterilen && ustOk,
      { gecerli: k.gecerli, ust: k.ust, Y: b.Y, altSinir: k.altSinir });
    if (solDenetle && b.X != null) {
      const solOk = !k.sagKaydirilabilir || Math.abs(k.sol - SOL_PAY) <= 2 || (k.sagSinir && k.sol > SOL_PAY) || (k.solSinir && k.sol < SOL_PAY);
      sonuc(`${ad}: sol koordinatı pencerenin solunda`, k.sagKaydirilabilir && solOk, { sol: k.sol, X: b.X, kaydirilabilir: k.sagKaydirilabilir });
    }
    return k;
  };

  await ac();

  // ---------------------------------------------------------------- 1. İçindekiler ve 2. sayfadaki eylemler
  if (bolum(1)) {
    console.log('— 1. Hedef biçimleri');
    await evalJs(`window.__s45.hazir(1, ${ozet.satirlar.filter((s) => s.sayfa === 1).length})`);
    const ipuclari = await kosul(`(() => { const t = [...window.__s45.g().sayfalar[0].el.querySelectorAll('.baglanti')].map((a) => a.title); return t.every((x, i) => x || i < 0) && t; })()`, 3000)
      || await evalJs(`[...window.__s45.g().sayfalar[0].el.querySelectorAll('.baglanti')].map((a) => a.title)`);
    const ipucu = (a) => ipuclari[sira(a)];
    sonuc('ipucu: açık hedef "Sayfa 3"', ipucu('xyz') === 'Sayfa 3', ipucu('xyz'));
    sonuc('ipucu: adlandırılmış hedef "Sayfa 12"', ipucu('ad-agac') === 'Sayfa 12', ipucu('ad-agac'));
    sonuc('ipucu: /Dests sözlüğü "Sayfa 13"', ipucu('ad-sozluk') === 'Sayfa 13', ipucu('ad-sozluk'));
    sonuc('ipucu: NextPage "Sayfa 2"', ipucu('sonraki') === 'Sayfa 2', ipucu('sonraki'));
    sonuc('ipucu: GoToR açılmaz', ipucu('gotor') === 'Başka bir dosya ya da program (açılmaz)', ipucu('gotor'));
    sonuc('ipucu: olmayan ad', ipucu('yok') === 'Hedef bu belgede bulunamadı', ipucu('yok'));
    for (const a of ['xyz', 'dest-xyz', 'fit', 'fith', 'fitv', 'fitr', 'fitb', 'fitbh', 'fitbv', 'ad-agac', 'ad-sozluk', 'ad-eylem', 'ad-egik', 'donuk', 'kayik', 'sonraki']) {
      const h = ozet.hedefler[a];
      const yer = await baglantiyaTikla(1, sira(a));
      if (!sonuc(`${a}: bağlantı bulundu`, !!yer)) continue;
      if (a === 'xyz') sonuc('bağlantının üstünde el imleci', yer.imlec === 'pointer', yer.imlec);
      await hedefteMi(a, h.sayfa, h);
    }
    for (const a of ['gotor', 'launch']) {
      await baglantiyaTikla(1, sira(a));
      const b = await evalJs(`window.__s45.bildirimler.slice()`);
      const k = await evalJs(`window.__s45.konum(1)`);
      sonuc(`${a}: açılmadı, bildirim verildi, sayfa değişmedi`, b.includes(DIS_DOSYA) && k.gecerli === 1, { b, gecerli: k.gecerli });
    }
    await baglantiyaTikla(1, sira('yok'));
    let b = await evalJs(`window.__s45.bildirimler.slice()`);
    sonuc('olmayan ad: "bulunamadı" bildirimi', b.includes('Bağlantının hedefi bu belgede bulunamadı.'), b);
    // 2. sayfa: adlandırılmış eylemler
    await evalJs(`window.__s45.hazir(2, 4)`);
    const ip2 = await evalJs(`[...window.__s45.g().sayfalar[1].el.querySelectorAll('.baglanti')].map((a) => a.title)`);
    sonuc('2. sayfa ipuçları: Sayfa 1, 1, 16, 3', J(ip2) === J(['Sayfa 1', 'Sayfa 1', 'Sayfa 16', 'Sayfa 3']), ip2);
    for (const a of ['onceki', 'ilk', 'son', 'sonraki2']) {
      const yer = await baglantiyaTikla(2, sira(a));
      if (!sonuc(`${a}: bağlantı bulundu`, !!yer)) continue;
      await hedefteMi(a, ozet.hedefler[a].sayfa, ozet.hedefler[a]);
    }
    // Döndürülmüş (/Rotate 90) sayfadaki bağlantının kutusu: döndürülmemiş kutu (72, 100, 300, 140) → kullanıcı uzayı [72, 702, 300, 742]
    const d = ozet.donuk;
    await evalJs(`window.__s45.g().sayfayaGit(${d})`);
    await evalJs(`window.__s45.hazir(${d}, 1)`);
    const kutu = await evalJs(`(() => { const g = window.__s45.g(); const s = g.sayfalar[${d - 1}]; const a = s.el.querySelector('.baglanti').getBoundingClientRect(), r = s.el.getBoundingClientRect(); const k = g.olcek * 96 / 72; return { sol: (a.left - r.left) / k, ust: (a.top - r.top) / k, gen: a.width / k, yuk: a.height / k, dondurme: g.toplamDondurme(s) }; })()`);
    const [ax, ay] = gorunenNokta(72, 742, [0, 0, 595, 842], 90), [bx, by] = gorunenNokta(300, 702, [0, 0, 595, 842], 90);
    const bek = { sol: Math.min(ax, bx), ust: Math.min(ay, by), gen: Math.abs(bx - ax), yuk: Math.abs(by - ay) };
    sonuc('döndürülmüş sayfada bağlantı kutusu doğru yerde', kutu.dondurme === 90 && ['sol', 'ust', 'gen', 'yuk'].every((k) => Math.abs(kutu[k] - bek[k]) < 1.5), { kutu, bek });
    const yer = await baglantiyaTikla(d, 0);
    if (sonuc('döndürülmüş sayfadaki bağlantı bulundu', !!yer)) await hedefteMi('döndürülmüş sayfadan geri', 1, ozet.hedefler.geri);
  }

  // ---------------------------------------------------------------- 2. Kullanıcının döndürdüğü hedef sayfa
  if (bolum(2)) {
    console.log('— 2. Döndürülmüş hedef sayfa');
    await ac();
    await evalJs(`window.__pdefe.sayfalariDondur(window.__pdefe.aktif(), [3], 90).then(() => 1)`);
    await kosul(`window.__s45.g().toplamDondurme(window.__s45.g().sayfalar[2]) === 90`, 3000);
    await baglantiyaTikla(1, sira('xyz'));
    await hedefteMi('xyz, hedef sayfa 90° döndürülmüş', 3, ozet.hedefler.xyz);
    await evalJs(`window.__pdefe.sayfalariDondur(window.__pdefe.aktif(), [3], 90).then(() => 1)`);
    await kosul(`window.__s45.g().toplamDondurme(window.__s45.g().sayfalar[2]) === 180`, 3000);
    await baglantiyaTikla(1, sira('fith'));
    await hedefteMi('fith (sayfa 6 döndürülmemiş, sayfa 3 180°)', 6, ozet.hedefler.fith);
    await baglantiyaTikla(1, sira('xyz'));
    await hedefteMi('xyz, hedef sayfa 180° döndürülmüş', 3, ozet.hedefler.xyz);
  }

  // ---------------------------------------------------------------- 3. Sayfa düzeni değişmiş belge
  if (bolum(3)) {
    console.log('— 3. Sayfa düzeni değişmiş belge');
    await ac();
    // 2. sayfa silinir: kaynak 3 → gösterilen 2
    await evalJs(`(async () => { const b = window.__pdefe.aktif(); await window.__pdefe.sayfaTarifiUygula(b, b.gorunum.tarif().filter((t, i) => i !== 1)); return 1; })()`);
    await kosul(`window.__s45.g().sayfalar.length === ${ozet.sayfa - 1}`, 3000);
    /** no. sayfanın bağlantılarının ipuçları (üstüne gelme olayıyla yenilenir; katman yeniden çizilebildiği için koşul sağlanana dek). */
    const ipuclari = async (no, kosulu) => {
      let ip = [];
      for (let i = 0; i < 30; i++) {
        if (i % 5 === 0) await evalJs(`window.__s45.g().sayfayaGit(${no})`);
        await evalJs(`window.__s45.hazir(${no}, 5)`);
        await evalJs(`[...window.__s45.g().sayfalar[${no - 1}].el.querySelectorAll('.baglanti')].forEach((a) => a.dispatchEvent(new PointerEvent('pointerenter')))`);
        await bekle(200);
        ip = await evalJs(`[...window.__s45.g().sayfalar[${no - 1}].el.querySelectorAll('.baglanti')].map((a) => a.title)`);
        if (kosulu(ip)) break;
      }
      return ip;
    };
    let ip = await ipuclari(1, (t) => t[sira('xyz')] === 'Sayfa 2' && t[sira('fit')] === 'Sayfa 4');
    sonuc('2. sayfa silinince ipucu şimdiki numara: xyz "Sayfa 2", fit "Sayfa 4"', ip[sira('xyz')] === 'Sayfa 2' && ip[sira('fit')] === 'Sayfa 4', [ip[sira('xyz')], ip[sira('fit')]]);
    await baglantiyaTikla(1, sira('xyz'));
    await hedefteMi('xyz (kaynak 3 → gösterilen 2)', 2, ozet.hedefler.xyz);
    await baglantiyaTikla(1, sira('sonraki'));
    await hedefteMi('NextPage gösterilen sayfaya göre (1 → 2)', 2, ozet.hedefler.sonraki);
    await baglantiyaTikla(1, sira('ad-agac'));
    await hedefteMi('ad-agac (kaynak 12 → gösterilen 11)', 11, ozet.hedefler['ad-agac']);
    // Yapısal kayıttan (Üzerine yaz) sonra sayfaların kaynağı anlık kopya: hedefler yine bulunur
    const kayit = await evalJs(`window.__pdefe.belgeKaydet(window.__pdefe.aktif())`);
    sonuc('sayfası silinmiş belge kaydedildi (yapısal)', kayit === true, kayit);
    await baglantiyaTikla(1, sira('ad-sozluk'));
    await hedefteMi('kayıttan sonra ad-sozluk (kaynak 13 → gösterilen 12)', 12, ozet.hedefler['ad-sozluk']);
    await baglantiyaTikla(1, sira('kayik'));
    await hedefteMi('kayıttan sonra kayik (kaynak 16 → gösterilen 15)', 15, ozet.hedefler.kayik);
    // Sıra ters: [16, 15, …, 4, 3, 1]; içindekiler gösterilen 15'te
    await evalJs(`(async () => { const b = window.__pdefe.aktif(); await window.__pdefe.sayfaTarifiUygula(b, b.gorunum.tarif().reverse()); return 1; })()`);
    await bekle(400);
    const n = ozet.sayfa - 1;
    sonuc('sıra ters çevrildi (içindekiler son sayfada)', await evalJs(`window.__s45.g().sayfalar[${n - 1}].kaynak.sayfa === 1`));
    await baglantiyaTikla(n, sira('xyz'));
    await hedefteMi('xyz (kaynak 3 → gösterilen 14)', 14, ozet.hedefler.xyz);
    await baglantiyaTikla(n, sira('fit'));
    await hedefteMi('fit (kaynak 5 → gösterilen 12)', 12, ozet.hedefler.fit);
    const once = await baglantiyaTikla(n, sira('sonraki'));
    const k1 = await evalJs(`window.__s45.konum(${n})`);
    sonuc('NextPage son sayfada kımıldamaz', !!once && k1.gecerli === n, k1.gecerli);
    // Hedef sayfa (kaynak 3) silinir
    await evalJs(`(async () => { const b = window.__pdefe.aktif(); await window.__pdefe.sayfaTarifiUygula(b, b.gorunum.tarif().filter((t) => t.kaynak?.sayfa !== 3)); return 1; })()`);
    await bekle(400);
    const m = n - 1;
    await baglantiyaTikla(m, sira('xyz'));
    const b = await evalJs(`window.__s45.bildirimler.slice()`);
    sonuc('hedef sayfa silinince "bu belgede yok" bildirimi', b.includes('Bağlantının hedef sayfası bu belgede yok.'), b);
    ip = await ipuclari(m, (t) => t[sira('xyz')] === 'Hedef sayfa bu belgede yok');
    sonuc('silinen hedefin ipucu', ip[sira('xyz')] === 'Hedef sayfa bu belgede yok', ip[sira('xyz')]);
  }

  // ---------------------------------------------------------------- 4. Yer imleri
  if (bolum(4)) {
    console.log('— 4. Yer imleri');
    await ac();
    await evalJs(`(() => { const p = window.__pdefe.panel; if (!p.acik) window.__pdefe.komutCalistir('gorunum.solPanel'); p.sekmeSec('icindekiler'); return 1; })()`);
    sonuc('yer imleri listelendi', await kosul(`document.querySelectorAll('#panel-icindekiler .satir').length === ${ozet.yerImleri.length}`, 5000),
      await evalJs(`document.querySelectorAll('#panel-icindekiler .satir').length`));
    for (const [i, y] of ozet.yerImleri.entries()) {
      await evalJs(`window.__s45.g().sayfayaGit(1)`);
      await bekle(200);
      const r = await evalJs(`(() => { const el = document.querySelectorAll('#panel-icindekiler .satir')[${i}]; el.scrollIntoView({ block: 'nearest' }); const r = el.querySelector('.baslik').getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2), t: el.textContent }; })()`);
      await tikla(r.x, r.y);
      await bekle(500);
      await hedefteMi(`yer imi "${y.baslik}"`, ozet.hedefler[y.anahtar].sayfa, ozet.hedefler[y.anahtar]);
    }
    await evalJs(`(() => { const p = window.__pdefe.panel; p.sekmeSec('sayfalar'); return 1; })()`);
  }

  // ---------------------------------------------------------------- 5. PyMuPDF'in çözemediği hedef: PDF.js
  if (bolum(5)) {
    console.log('— 5. PDF.js ile çözülen hedefler');
    await ac();
    const gonder = (detay) => evalJs(`(() => { window.__s45.g().sayfayaGit(1); window.__s45.g().dispatchEvent(new CustomEvent('baglanti', { detail: { ...${J(detay)}, kaynakYol: ${J(acikYol)}, sayfaNo: 1 } })); return 1; })()`);
    const x = ozet.sayfaXrefleri;
    const durumlar = [
      ['sayfasız ad (Names ağacı)', { ad: 'bolum-a' }, 'ad-agac'],
      ['sayfasız ad (/Dests sözlüğü)', { ad: 'bolumB' }, 'ad-sozluk'],
      ['sayfasız açık hedef (sayfa başvurusu)', { hedef: { tur: 'FitH', p: [600], ref: [x[5], 0] } }, 'fith'],
      ['sayfasız açık hedef (sayfa dizini)', { hedef: { tur: 'XYZ', p: [0, 700, 0], ref: ozet.kayik - 1 } }, 'kayik'],
    ];
    for (const [ad, detay, anahtar] of durumlar) {
      await gonder(detay);
      await bekle(500);
      await hedefteMi(ad, ozet.hedefler[anahtar].sayfa, ozet.hedefler[anahtar]);
    }
    await evalJs(`window.__s45.bildirimler.length = 0`);
    await gonder({ ad: 'boyle-bir-ad-yok' });
    await bekle(500);
    const b = await evalJs(`window.__s45.bildirimler.slice()`);
    sonuc('çözülemeyen ad: bildirim', b.includes('Bağlantının hedefi bu belgede bulunamadı.'), b);
  }

  // ---------------------------------------------------------------- 6. Yakınlaştırılmış görünümde sol koordinatı
  if (bolum(6)) {
    console.log('— 6. Yakınlaştırılmış görünüm');
    await ac();
    await evalJs(`window.__s45.g().zoomAyarla(3)`);
    await bekle(800);
    // Hedefin sol koordinatı (x 72) görünmüyor: sağa kaydırılmış görünümde tıklanınca nokta sol kenara gelir. Bağlantı sayfanın x 72..420
    // aralığında; tıklanabilsin diye görünüm bağlantının sağ ucuna kaydırılır
    await evalJs(`(() => { const g = window.__s45.g(); g.sayfayaGit(1); return 1; })()`);
    await bekle(400);
    await evalJs(`window.__s45.g().sayfayaGit(1)`);
    // Bağlantının dikeyde görünmesi gorunurYap'la, sonra görünüm sayfanın x 200 pt'sine kaydırılır; tıklama bağlantının görünen sağ
    // bölümüne (gorunurYap yatayda kaydırıp x 72'yi görünür yapardı)
    const dikey = await evalJs(`window.__s45.gorunurYap(1, ${sira('xyz')})`);
    const yer = dikey && await evalJs(`(async () => { const g = window.__s45.g(); const k = g.olcek * 96 / 72; g.kaydirici.scrollLeft = g.yerlesim[0].x + 200 * k; await new Promise((c) => setTimeout(c, 300)); const kr = g.kaydirici.getBoundingClientRect(); const el = g.sayfalar[0].el.querySelectorAll('.baglanti')[${sira('xyz')}]; const r = el.getBoundingClientRect(); const x = Math.round(kr.left + 100), y = Math.round(r.top + r.height / 2); return document.elementFromPoint(x, y)?.classList.contains('baglanti') ? { x, y } : null; })()`);
    if (sonuc('%300: sağa kaydırılmış görünümde bağlantı bulundu', !!yer)) {
      await tikla(yer.x, yer.y);
      await bekle(500);
      await hedefteMi('xyz %300, sol koordinatı görünmüyordu', 3, ozet.hedefler.xyz, { solDenetle: true });
    }
    // Sol koordinatı görünüyorsa yatay kaydırma değişmez
    await evalJs(`(() => { const g = window.__s45.g(); g.sayfayaGit(1); g.kaydirici.scrollLeft = 0; return 1; })()`);
    await bekle(400);
    const once = await baglantiyaTikla(1, sira('xyz'));
    const sl0 = once ? await evalJs(`window.__s45.g().kaydirici.scrollLeft`) : null;
    const k = await hedefteMi('xyz %300, sol koordinatı görünüyordu', 3, ozet.hedefler.xyz);
    sonuc('xyz %300: görünen sol koordinatında yatay kaydırma değişmedi', k.scrollLeft === sl0 && k.sagKaydirilabilir, { once: sl0, sonra: k.scrollLeft });
    await evalJs(`window.__s45.g().zoomModuAyarla('genislik')`);
  }

  await evalJs(`(async () => { for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true }).catch(() => {}); return 1; })()`).catch(() => {});
  console.log(`\nSenaryo 45: ${denetim - hataSayisi}/${denetim} OK, ${hataSayisi} HATA`);
  process.exitCode = hataSayisi ? 1 : 0;
}
