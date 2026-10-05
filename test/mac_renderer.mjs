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

  // ---------------------------------------------------------------- Not katmanında Ctrl+tık (notlar.js pointerDown)
  // macOS'ta Ctrl+tık sağ tıktır (Chromium button 0 + ctrlKey iletir, ardından sağ tık menüsü): sol tık gibi işlenmemeli. Windows'ta Ctrl+tık
  // sol tıktır. İşlev, her erişimde hata veren bir nesneyle çağrılır: işlemeye girdiyse "işlendi"
  const ctrlTik = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const mac of [true, false]) {
      const o = ortam(mac), { NotYoneticisi } = await o.yukle('notlar.js');
      const vekil = new Proxy({}, { get: () => { throw new Error('işlendi'); } });
      const dene = (ozellik) => { const hedef = o.belge.createElement('div'); o.belge.body.append(hedef);
        try { NotYoneticisi.prototype.pointerDown.call(vekil, { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: hedef, preventDefault() {}, ...ozellik }); return 'işlenmedi'; }
        catch (h) { return h.message === 'işlendi' ? 'işlendi' : 'hata: ' + h.message; } finally { hedef.remove(); } };
      sonuc[mac ? 'mac' : 'win'] = { ctrl: dene({ ctrlKey: true }), duz: dene({}), sag: dene({ button: 2 }), cmd: dene({ metaKey: true }) };
    }
    return sonuc;
  })()`);
  sonuc('Not katmanı (macOS): Ctrl+tık sol tık gibi işlenmez (sağ tık); düz tık ve ⌘+tık işlenir',
    ctrlTik.mac.ctrl === 'işlenmedi' && ctrlTik.mac.duz === 'işlendi' && ctrlTik.mac.cmd === 'işlendi' && ctrlTik.mac.sag === 'işlenmedi', ctrlTik.mac);
  sonuc('Not katmanı (Windows): Ctrl+tık eskisi gibi sol tık; sağ tık işlenmez',
    ctrlTik.win.ctrl === 'işlendi' && ctrlTik.win.duz === 'işlendi' && ctrlTik.win.sag === 'işlenmedi', ctrlTik.win);

  // ---------------------------------------------------------------- Yazı düzenleyicisinde sekme geçişi (notlar.js belgeKisayoluMu)
  // Düzenleyici ve not balonu belgeye ait kısayolları yutmaz (stopPropagation yok; belgenin tuş işleyicisi işler). macOS'ta ⇧⌘[ / ⇧⌘]
  // (fiziksel tuş) da bunlardan; Windows'ta Ctrl+PageUp/PageDown
  const sekmeTusu = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const mac of [true, false]) {
      const o = ortam(mac), { NotYoneticisi } = await o.yukle('notlar.js');
      const dene = (tus) => { const e = { key: '', code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, durdu: false,
        stopPropagation() { this.durdu = true; }, preventDefault() {}, ...tus };
        NotYoneticisi.prototype.duzenleyiciTus.call({ duzenleyici: null }, e); return e.durdu ? 'yutuldu' : 'belgeye'; };
      sonuc[mac ? 'mac' : 'win'] = {
        sonraki: dene({ key: ']', code: 'BracketRight', metaKey: true, shiftKey: true }),
        onceki: dene({ key: '[', code: 'BracketLeft', metaKey: true, shiftKey: true }),
        trSonraki: dene({ key: 'ü', code: 'BracketRight', metaKey: true, shiftKey: true }),   // Türkçe Q'da aynı fiziksel tuş
        shiftsiz: dene({ key: ']', code: 'BracketRight', metaKey: true }),
        ctrlKoseli: dene({ key: ']', code: 'BracketRight', ctrlKey: true, shiftKey: true }),
        ctrlPgDn: dene({ key: 'PageDown', code: 'PageDown', ctrlKey: true }),
        cmdPgDn: dene({ key: 'PageDown', code: 'PageDown', metaKey: true }),
        harf: dene({ key: 'a', code: 'KeyA' }),
      };
    }
    return sonuc;
  })()`);
  const { ctrlPgDn: _macCtrl, ...macTus } = sekmeTusu.mac;   // macOS'ta ⌃PageDown bu denetimin konusu değil
  sonuc('Yazı düzenleyicisi (macOS): ⇧⌘] / ⇧⌘[ belgeye geçer (sekme değişir), Türkçe klavyede de; ⌘] ve harf yutulur',
    J(macTus) === J({ sonraki: 'belgeye', onceki: 'belgeye', trSonraki: 'belgeye', shiftsiz: 'yutuldu', ctrlKoseli: 'yutuldu', cmdPgDn: 'belgeye', harf: 'yutuldu' }), sekmeTusu.mac);
  sonuc('Yazı düzenleyicisi (Windows): eskisi gibi yalnızca Ctrl+PageDown belgeye geçer',
    J(sekmeTusu.win) === J({ sonraki: 'yutuldu', onceki: 'yutuldu', trSonraki: 'yutuldu', shiftsiz: 'yutuldu', ctrlKoseli: 'yutuldu', ctrlPgDn: 'belgeye', cmdPgDn: 'yutuldu', harf: 'yutuldu' }), sekmeTusu.win);

  // ---------------------------------------------------------------- Araçların yazılamayan dosya sorusu (araclar/ortak.js kayitSecimi.hataSor)
  // macOS'ta dosyaları başka programlar kilitlemez, Gezgin'in Salt okunur özniteliği yoktur: neden yazma / okuma izni ya da Finder'ın Kilitli
  // işareti; ileti Finder › Bilgi Al'ı anlatmalı. Windows metinleri değişmemeli. Her vakada sorunun metni ve düğmeleri kaydedilir (Vazgeç)
  const hataSorusu = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const mac of [true, false]) {
      const o = ortam(mac), { kayitSecimi } = await o.yukle('araclar/ortak.js');
      const sorular = [];
      // Çıktı klasörü ayardan (var): bilinen klasörler sorulmaz (çerçevedeki modül onları önceki bölümde boş yanıtla önbelleğe aldı)
      const baglam = { pdefe: { cagir: async (kanal, yol) => (kanal === 'dosya:varMi' ? yol === '/Volumes/Arsiv' : {}) }, ayar: () => ({ ciktiKlasoru: '/Volumes/Arsiv' }), bildir: () => {},
        mesajKutusu: async (s) => { sorular.push({ mesaj: s.mesaj, ayrinti: s.ayrinti, dugmeler: s.dugmeler }); return { secim: s.dugmeler.length - 1 }; } };
      const k = kayitSecimi({ baglam, belge: { yol: '/Volumes/Arsiv/Belge.pdf', ad: 'Belge.pdf' }, ad: 'Sıkıştırılmış' });
      await k.hazir;
      k.cikti.ayarla('/Volumes/Arsiv', 'Hedef', { elle: true });
      const r = sonuc[mac ? 'mac' : 'win'] = {};
      const sor = async (ad, ileti) => { sorular.length = 0; await k.hataSor(new Error(ileti)); r[ad] = sorular[0] || null; };
      await sor('yeniSaltOkunur', 'Dosya salt okunur');
      await sor('yeniYazilamadi', 'Dosya yazılamadı');
      await sor('okunamadi', 'Dosya okunamadı; başka bir programda açık olabilir: Ek.pdf');
      k.kipAyarla('uzerine');
      await sor('uzerineSaltOkunur', 'Dosya yazılamadı; salt okunur: Belge.pdf');
      await sor('uzerineYazilamadi', 'Dosya yazılamadı');
      k.kipAyarla('yeni'); k.cokluAyarla(true);
      await sor('coklu', 'Dosya yazılamadı');
    }
    return sonuc;
  })()`);
  const PROGRAMDA = 'başka bir programda (örneğin bir PDF okuyucuda) açık olabilir';
  const WIN_AYRINTI = {
    yeniSaltOkunur: 'Aynı adlı var olan dosyanın Salt okunur özniteliği açık; o dosya değiştirilmedi.\n\nSonucu başka bir adla kaydedebilir ya da Salt okunur işaretini kaldırıp yeniden deneyebilirsiniz.',
    yeniYazilamadi: `Aynı adlı var olan dosya ${PROGRAMDA}; o dosya değiştirilmedi.\n\nSonucu başka bir adla kaydedebilir ya da dosyayı kullanan programı kapatıp yeniden deneyebilirsiniz.`,
    okunamadi: `Dosya ${PROGRAMDA}. Hiçbir dosya değiştirilmedi.\n\nDosyayı kullanan programı kapatıp yeniden deneyin.`,
    uzerineSaltOkunur: 'Dosyanın Salt okunur özniteliği açık. Özgün dosya değiştirilmedi.\n\nDosya Gezgini\'nde dosyanın Özellikler penceresinden Salt okunur işaretini kaldırıp yeniden deneyebilir ya da sonucu yeni bir belge olarak kaydedebilirsiniz.',
    uzerineYazilamadi: `Dosya ${PROGRAMDA}. Özgün dosya değiştirilmedi.\n\nDosyayı kullanan programı kapatıp yeniden deneyebilir ya da sonucu yeni bir belge olarak kaydedebilirsiniz.`,
    coklu: `Seçilen klasöre yazılamadı; klasör salt okunur olabilir ya da bir dosya ${PROGRAMDA}. Var olan hiçbir dosya değiştirilmedi.\n\nBaşka bir klasör seçebilir ya da yeniden deneyebilirsiniz.`,
  };
  const winFark = Object.entries(WIN_AYRINTI).filter(([ad, a]) => hataSorusu.win[ad]?.ayrinti !== a).map(([ad]) => ad);
  sonuc('Araç sorusu (Windows): altı durumun açıklaması eskisi gibi', !winFark.length, winFark.map((ad) => ({ ad, ayrinti: hataSorusu.win[ad]?.ayrinti })));
  const macHatali = Object.keys(WIN_AYRINTI).filter((ad) => {
    const m = hataSorusu.mac[ad], w = hataSorusu.win[ad];
    return !m || /Gezgin|Özellikler|başka bir programda|kullanan programı/.test(m.ayrinti) || !/Finder/.test(m.ayrinti) || !/Bilgi Al/.test(m.ayrinti)
      || m.mesaj !== w?.mesaj || J(m.dugmeler) !== J(w?.dugmeler);
  });
  sonuc('Araç sorusu (macOS): altı durumda da Finder › Bilgi Al anlatılıyor, Gezgin / "başka programda açık" yok; başlık ve düğmeler Windows\'takiyle aynı',
    !macHatali.length, macHatali.map((ad) => ({ ad, ...hataSorusu.mac[ad] })));
  const kilitli = ['yeniSaltOkunur', 'yeniYazilamadi', 'uzerineSaltOkunur', 'uzerineYazilamadi'].filter((ad) => !/"Kilitli" işaretini/.test(hataSorusu.mac[ad]?.ayrinti || ''));
  sonuc('Araç sorusu (macOS): yazılamayan dosyada Kilitli işareti ve Paylaşma ve İzinler söyleniyor', !kilitli.length && /Paylaşma ve İzinler/.test(hataSorusu.mac.okunamadi?.ayrinti || ''),
    kilitli.map((ad) => hataSorusu.mac[ad]?.ayrinti));

  // ---------------------------------------------------------------- Ayarlar › Güncelleme (ayarlarPenceresi.js bolumGuncelleme)
  // macOS'ta yeni sürüm tek tıkla kurulmaz: açıklama İndir'i ve Uygulamalar'a sürüklemeyi anlatmalı, "Şimdi denetle"nin çıkardığı düğme
  // şeritteki gibi 'İndir'. Windows'ta metin ve 'Güncelle' düğmesi değişmemeli
  const ayarGuncelleme = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const mac of [true, false]) {
      const o = ortam(mac), m = await o.yukle('ayarlarPenceresi.js');
      const guncelleme = { denetle: async () => ({ durum: 'var', asama: 'var', surum: '9.9.9', mevcut: '0.2.1' }), durum: () => ({ asama: 'var' }), guncelle: () => {} };
      const ortu = m.ayarlarPenceresiAc({ ayar: () => ({}), ayarKoy: () => {}, pdefe: { cagir: async () => null }, guncelleme }, { bolum: 'guncelleme' });
      const aciklama = ortu.querySelector('.ayar-aciklama')?.textContent || '';
      const denetle = [...ortu.querySelectorAll('button')].find((b) => b.textContent === 'Şimdi denetle');
      denetle?.click();
      for (let i = 0; i < 50 && !ortu.querySelector('.ayar-sonuc-var button'); i++) await new Promise((r) => setTimeout(r, 20));
      sonuc[mac ? 'mac' : 'win'] = { aciklama, dugme: ortu.querySelector('.ayar-sonuc-var button')?.textContent || null };
      m.ayarlarPenceresiKapat();
    }
    return sonuc;
  })()`);
  sonuc('Ayarlar › Güncelleme (Windows): açıklama ve "Şimdi denetle"nin düğmesi (Güncelle) eskisi gibi',
    ayarGuncelleme.win.aciklama === 'Haftada bir, açılışta ya da PDEfe açık kalıyorsa gün içinde arka planda yeni sürüme bakılır; internet yoksa sonra yeniden denenir. Yeni sürüm varsa pencerenin üstünde bir şerit görünür; Güncelle\'ye tek tıkla indirilir, kurulur ve PDEfe yeniden açılır.'
    && ayarGuncelleme.win.dugme === 'Güncelle', ayarGuncelleme.win);
  sonuc('Ayarlar › Güncelleme (macOS): açıklama İndir\'i ve Uygulamalar\'a sürüklemeyi anlatıyor ("tek tıkla kurulur" yok), düğme İndir',
    /İndir'e basınca yeni sürüm tarayıcıda iner/.test(ayarGuncelleme.mac.aciklama) && /Uygulamalar klasörüne sürükle/.test(ayarGuncelleme.mac.aciklama)
    && !/tek tıkla|kurulur ve PDEfe yeniden açılır/.test(ayarGuncelleme.mac.aciklama) && ayarGuncelleme.mac.dugme === 'İndir', ayarGuncelleme.mac);

  // ---------------------------------------------------------------- Ayarlar › Açılış ve düzen › Pencereyi kapatırken (0.2.2)
  // Kapatma düğmesi Mac'te pencerenin kırmızı düğmesi (Alt+F4 yok); ⌘W sekmeyi kapatır, ⌘Q çıkar. Windows'ta × ve Alt+F4
  const pencereKarti = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const mac of [true, false]) {
      const o = ortam(mac), m = await o.yukle('ayarlarPenceresi.js');
      const ortu = m.ayarlarPenceresiAc({ ayar: () => ({ pencereKapatma: 'sekme' }), ayarKoy: () => {}, pdefe: { cagir: async () => null } }, { bolum: 'acilis' });
      const k = [...ortu.querySelectorAll('.ayar-kart')].find((x) => x.querySelector('.ayar-baslik')?.textContent === 'Pencereyi kapatırken');
      sonuc[mac ? 'mac' : 'win'] = { aciklama: k?.querySelector('.ayar-aciklama')?.textContent || '', deger: k?.querySelector('select')?.value || null };
      m.ayarlarPenceresiKapat();
    }
    return sonuc;
  })()`);
  sonuc('Ayarlar › Pencereyi kapatırken (Windows): × ve Alt+F4, Ctrl+W; kayıtlı değer gösteriliyor',
    /kapatma düğmesine \(×\) ya da Alt\+F4/.test(pencereKarti.win.aciklama) && /Ctrl\+W/.test(pencereKarti.win.aciklama) && !/⌘|kırmızı/.test(pencereKarti.win.aciklama) && pencereKarti.win.deger === 'sekme', pencereKarti.win);
  sonuc('Ayarlar › Pencereyi kapatırken (macOS): kırmızı kapatma düğmesi, ⌘W ve ⌘Q; Alt+F4 / Ctrl yok',
    /kırmızı kapatma düğmesine/.test(pencereKarti.mac.aciklama) && /⌘W/.test(pencereKarti.mac.aciklama) && /⌘Q/.test(pencereKarti.mac.aciklama) && !/Alt\+F4|Ctrl|×/.test(pencereKarti.mac.aciklama) && pencereKarti.mac.deger === 'sekme', pencereKarti.mac);

  // ---------------------------------------------------------------- Güncelleme şeridi (guncelleme.js)
  // macOS: İndir → paket tarayıcıda iner ('tarayicida'). Şerit önce PDEfe'den çıkmayı (Finder açık uygulamanın yerine koymaz) ve
  // engellenirse Sistem Ayarları › Gizlilik ve Güvenlik › Yine de Aç'ı söylemeli. Windows'ta düğme eskisi gibi Güncelle
  const serit = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const mac of [true, false]) {
      const o = ortam(mac), { guncellemeSeridiKur } = await o.yukle('guncelleme.js');
      const dinleyiciler = {};
      const pdefe = { cagir: async (kanal) => (kanal === 'guncelleme:indir' ? { tamam: true, tarayicida: true } : null), dinle: (kanal, cb) => { dinleyiciler[kanal] = cb; } };
      const el = o.belge.createElement('div'); el.hidden = true; o.belge.body.append(el);
      const g = guncellemeSeridiKur({ pdefe, serit: el, bildir: () => {} });
      dinleyiciler['guncelleme:var']({ surum: '9.9.9', mevcut: '0.2.1' });
      const r = sonuc[mac ? 'mac' : 'win'] = { dugme: el.querySelector('button.birincil-serit')?.textContent || null };
      if (mac) { await g.guncelle(); r.asama = el.dataset.asama; r.metin = el.querySelector('.metin')?.textContent || ''; }
      el.remove();
    }
    return sonuc;
  })()`);
  sonuc('Güncelleme şeridi (Windows): düğme eskisi gibi Güncelle', serit.win.dugme === 'Güncelle', serit.win);
  sonuc('Güncelleme şeridi (macOS): İndir\'den sonra önce PDEfe\'den çıkmayı (⌘Q), Değiştir\'i ve engellenirse Yine de Aç\'ı söylüyor',
    serit.mac.dugme === 'İndir' && serit.mac.asama === 'tarayicida' && /PDEfe'den çıkın \(⌘Q\)/.test(serit.mac.metin) && /\(Değiştir\)/.test(serit.mac.metin)
    && /Sistem Ayarları › Gizlilik ve Güvenlik › Yine de Aç/.test(serit.mac.metin), serit.mac);

  // ---------------------------------------------------------------- Geri al listesi (gecmisListesi.js, 0.2.2)
  // İki sistemde aynı: ↓ boyamayı genişletir, Enter uygular; birincil tuşlu kısayol (macOS ⌘Z, Windows Ctrl+Z) listeyi kapatıp olağan işine
  // bırakılır (tuş belgeye ulaşır: varsayılanı engellenmez); Esc kapatır
  const gecmis = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const mac of [true, false]) {
      const o = ortam(mac), { GecmisListesi } = await o.yukle('gecmisListesi.js'), r = sonuc[mac ? 'mac' : 'win'] = {};
      const tusla = (key, ek = {}) => { const e = new o.pencere.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...ek }); o.belge.activeElement.dispatchEvent(e); return e.defaultPrevented; };
      const dugme = o.belge.createElement('button'); dugme.textContent = '▾'; dugme.style.cssText = 'position:fixed;left:20px;top:20px;width:30px;height:30px'; o.belge.body.append(dugme);
      const l = new GecmisListesi();
      let uygulanan = null;
      const ac = () => l.ac({ kaynak: 'geri', acici: dugme, yon: 'asagi', ogeler: () => [{ ad: 'Not ekle', ayrinti: 's. 3', tiklanir: true }, { ad: 'Sayfayı döndür', ayrinti: 's. 2', tiklanir: true }, { ad: 'Not ekle', ayrinti: 's. 1', tiklanir: true }],
        altYazi: (n) => n + ' işlemi geri al', varsayilanAlt: () => 'Vazgeç', altVazgec: true, uygula: (n) => { uygulanan = n; }, ilkBoyali: true });
      r.acildi = ac() && l.acik === 'geri';
      r.ilk = l.n; tusla('ArrowDown'); r.asagi = l.n; r.alt = l.el.querySelector('.gecmis-alt-yazi').textContent;
      r.satir = [...l.el.querySelectorAll('li')].map((x) => x.textContent);
      tusla('Enter'); r.uygulanan = uygulanan; r.kapandiUygulayinca = l.acik === null;
      ac(); r.kisayolEngellendi = tusla('z', mac ? { metaKey: true } : { ctrlKey: true }); r.kisayolKapatti = l.acik === null;
      ac(); tusla('Escape'); r.escKapatti = l.acik === null;
      l.el.remove(); dugme.remove();
    }
    return sonuc;
  })()`);
  for (const [ad, r] of [['macOS', gecmis.mac], ['Windows', gecmis.win]]) {
    sonuc(`Geri al listesi (${ad}): ↓ ile iki satır, Enter iki adımı uygular; ${ad === 'macOS' ? '⌘Z' : 'Ctrl+Z'} kapatıp kısayola bırakır; Esc kapatır`,
      r.acildi && r.ilk === 1 && r.asagi === 2 && r.alt === '2 işlemi geri al' && r.satir[0] === 'Not ekle · s. 3' && r.uygulanan === 2 && r.kapandiUygulayinca
      && r.kisayolEngellendi === false && r.kisayolKapatti && r.escKapatti, r);
  }

  await evalJs(`(() => { document.querySelector('#mac-cerceve')?.remove(); document.querySelector('#win-cerceve')?.remove(); return true; })()`);
  console.log(`\n${tamam} tamam, ${hata} hata`);
}
