// macOS'a özgü renderer kod yolları, Windows'taki test örneğinde (0.2.1): gizli iki çerçevede (iframe) modüller yeniden yüklenir, birinde
// window.pdefe.platform 'darwin', ötekinde 'win32' (her belgenin kendi modül haritası var; platform.js MAC'i yüklenirken okur; yükleme
// test/mac_cerceve.js ile). Her denetim iki çerçevede koşulur: macOS'ta beklenen davranış ve Windows davranışının değişmediği. Uygulamanın
// kendi sayfasına (belgeler, araç pencereleri, ayarlar) dokunulmaz; çerçeveler sonunda kaldırılır.
// Kullanım: powershell -File test\baslat.ps1 -Port <port> -Veri <klasör>; $env:PDEFE_CDP_PORT=<port>; node test\surucu.mjs betik test\mac_renderer.mjs
const J = (x) => JSON.stringify(x);
let hata = 0, tamam = 0;
function sonuc(ad, kosul, ayrinti) {
  if (kosul) tamam++; else hata++;
  console.log(`${kosul ? 'TAMAM' : 'HATA '}  ${ad}${kosul || ayrinti === undefined ? '' : '  — ' + J(ayrinti)}`);
}

// Çerçevede çalışan kodun başı: ortam(mac) → { yukle(modül yolu, src/renderer'a göre), belge, pencere }
const ORTAM = `const ortam = (mac) => { const f = document.querySelector(mac ? '#mac-cerceve' : '#win-cerceve');
    return { yukle: (m) => f.contentWindow.__yukle('pdefe://app/src/renderer/' + m), belge: f.contentDocument, pencere: f.contentWindow }; };`;

export default async function ({ evalJs }) {
  const kur = await evalJs(`(async () => {
    const sonuc = {};
    for (const [id, platform] of [['mac-cerceve', 'darwin'], ['win-cerceve', 'win32']]) {
      document.querySelector('#' + id)?.remove();
      const f = document.createElement('iframe'); f.id = id; f.style.cssText = 'position:fixed;left:-4000px;top:0;width:900px;height:700px;border:0';
      document.body.append(f);
      f.contentWindow.pdefe = { platform, cagir: async () => null, on: () => {}, gonder: () => {}, dosyaYolu: () => '' };
      const s = f.contentDocument.createElement('script'); s.type = 'module'; s.src = 'pdefe://app/test/mac_cerceve.js';
      const yuklendi = new Promise((c, r) => { s.onload = c; s.onerror = () => r(new Error('mac_cerceve.js yüklenemedi')); });
      f.contentDocument.head.append(s); await yuklendi;
      sonuc[platform] = (await f.contentWindow.__yukle('pdefe://app/src/renderer/platform.js')).MAC;
    }
    return sonuc;
  })()`);
  sonuc('çerçevelerde platform.js: darwin\'de MAC = true, win32\'de false', kur.darwin === true && kur.win32 === false, kur);

  // ---------------------------------------------------------------- Başlangıç ekranı, Son açılanlar (baslangic.js)
  // Klasör satırı yolun kendisinden kesilir; macOS'ta eğik bölülü yol ('/Volumes/…') ters bölüyle ('\\Volumes\\…') yazılıyordu
  const son = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const mac of [true, false]) {
      const o = ortam(mac), { BaslangicEkrani } = await o.yukle('baslangic.js');
      const kok = o.belge.createElement('div'); o.belge.body.append(kok);
      const kaldirilan = [];
      const b = new BaslangicEkrani({ kok, komutCalistir: () => {}, ac: () => {}, kaldir: (y) => kaldirilan.push(y), temizle: () => {}, pdefe: { cagir: async () => null }, bildir: () => {} });
      b.listele(['/Volumes/Arsiv/Belgeler/Dilekce.pdf', 'C:\\\\Belgeler\\\\Dosyalar\\\\Tebligat.pdf', '\\\\\\\\sunucu\\\\paylasim\\\\ek.pdf', '/kok.pdf']);
      sonuc[mac ? 'mac' : 'win'] = [...kok.querySelectorAll('.karsilama-oge')].map((e) => ({ ad: e.querySelector('.ad').textContent, yol: e.querySelector('.yol').textContent, ipucu: e.title }));
      kok.remove();
    }
    return sonuc;
  })()`);
  const BEKLENEN = [
    { ad: 'Dilekce.pdf', yol: '/Volumes/Arsiv/Belgeler', ipucu: '/Volumes/Arsiv/Belgeler/Dilekce.pdf' },
    { ad: 'Tebligat.pdf', yol: 'C:\\Belgeler\\Dosyalar', ipucu: 'C:\\Belgeler\\Dosyalar\\Tebligat.pdf' },
    { ad: 'ek.pdf', yol: '\\\\sunucu\\paylasim', ipucu: '\\\\sunucu\\paylasim\\ek.pdf' },
    { ad: 'kok.pdf', yol: '', ipucu: '/kok.pdf' },
  ];
  sonuc('Son açılanlar (macOS): klasör satırı eğik bölüyle (/Volumes/Arsiv/Belgeler)', J(son.mac) === J(BEKLENEN), son.mac);
  sonuc('Son açılanlar (Windows): klasör satırı eskisi gibi (C:\\Belgeler\\Dosyalar, \\\\sunucu\\paylasim)', J(son.win) === J(BEKLENEN), son.win);

  // ---------------------------------------------------------------- ⌫ (Backspace) seçilenleri / satırı çıkarır (macOS)
  // Mac klavyesinin ⌫ tuşu 'Backspace' üretir ('Delete' ancak fn+⌫); F1 › Kısayollar Mac'te bu işi ⌫ ile gösteriyor. Windows'ta Backspace
  // eskisi gibi bir şey yapmaz, Delete iki sistemde de çıkarır
  const sil = await evalJs(`(async () => { ${ORTAM}
    const tusla = (o, el, key) => { const e = new o.pencere.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
    const sonuc = {};
    for (const mac of [true, false]) {
      const o = ortam(mac), r = sonuc[mac ? 'mac' : 'win'] = {};
      // Başlangıç ekranının Son açılanlar satırı
      const { BaslangicEkrani } = await o.yukle('baslangic.js');
      const kok = o.belge.createElement('div'); o.belge.body.append(kok);
      const kaldirilan = [];
      const b = new BaslangicEkrani({ kok, komutCalistir: () => {}, ac: () => {}, kaldir: (y) => kaldirilan.push(y), temizle: () => {}, pdefe: { cagir: async () => null }, bildir: () => {} });
      b.listele(['C:\\\\a\\\\bir.pdf', 'C:\\\\a\\\\iki.pdf']);
      const satirlar = kok.querySelectorAll('.karsilama-oge');
      r.sonBackspace = tusla(o, satirlar[0], 'Backspace') ? [...kaldirilan] : 'işlenmedi';
      kaldirilan.length = 0;
      r.sonDelete = tusla(o, satirlar[1], 'Delete') ? [...kaldirilan] : 'işlenmedi';
      kok.remove();
      // Görüntü / PDF birleştir listesi: seçili satırlar (sil yerine kayıt tutulur)
      const { BirlestirmePenceresi } = await o.yukle('araclar/gorselBirlestir.js');
      const baglam = { pdefe: o.pencere.pdefe, ayar: () => ({}), cekirdek: { cagir: async () => null }, belgeler: new Map(), bildir: () => {}, mesajKutusu: async () => ({ secim: 1 }) };
      const p = new BirlestirmePenceresi(baglam, {});
      const silinen = [];
      p.sil = (k) => silinen.push(k); p._secilenler = () => [7];
      p.secim = new Set([7]);
      r.birlestirBackspace = tusla(o, p.liste, 'Backspace') ? silinen.splice(0) : 'işlenmedi';
      r.birlestirDelete = tusla(o, p.liste, 'Delete') ? silinen.splice(0) : 'işlenmedi';
      const girdi = o.belge.createElement('input'); p.liste.append(girdi);
      r.birlestirGirdide = tusla(o, girdi, 'Backspace') ? silinen.splice(0) : 'işlenmedi';
      for (const el of o.belge.querySelectorAll('.arac-ortusu')) el.remove();
    }
    return sonuc;
  })()`);
  sonuc('Son açılanlar satırında ⌫ (macOS) satırı listeden kaldırır', J(sil.mac.sonBackspace) === J(['C:\\a\\bir.pdf']), sil.mac);
  sonuc('Son açılanlar satırında Backspace (Windows) bir şey yapmaz, Delete iki sistemde de kaldırır',
    sil.win.sonBackspace === 'işlenmedi' && J(sil.win.sonDelete) === J(['C:\\a\\iki.pdf']) && J(sil.mac.sonDelete) === J(['C:\\a\\iki.pdf']), sil);
  sonuc('Birleştir listesinde ⌫ (macOS) seçilenleri çıkarır', J(sil.mac.birlestirBackspace) === J([[7]]), sil.mac);
  sonuc('Birleştir listesinde Backspace (Windows) bir şey yapmaz, Delete iki sistemde de çıkarır',
    sil.win.birlestirBackspace === 'işlenmedi' && J(sil.win.birlestirDelete) === J([[7]]) && J(sil.mac.birlestirDelete) === J([[7]]), sil);
  sonuc('Birleştir listesindeki girdi kutusunda ⌫ kutunun kendisinde kalır (satır çıkarılmaz)', sil.mac.birlestirGirdide === 'işlenmedi' && sil.win.birlestirGirdide === 'işlenmedi', sil);

  await evalJs(`(() => { document.querySelector('#mac-cerceve')?.remove(); document.querySelector('#win-cerceve')?.remove(); return true; })()`);
  console.log(`\n${tamam} tamam, ${hata} hata`);
}
