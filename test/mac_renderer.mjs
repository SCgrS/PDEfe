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

  await evalJs(`(() => { document.querySelector('#mac-cerceve')?.remove(); document.querySelector('#win-cerceve')?.remove(); return true; })()`);
  console.log(`\n${tamam} tamam, ${hata} hata`);
}
