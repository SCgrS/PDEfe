// Linux'a özgü renderer kod yolları, Windows'taki test örneğinde (0.3.1, Linux sürümü): test/mac_renderer.mjs'in düzeni. Gizli iki çerçevede
// (iframe) modüller yeniden yüklenir, birinde window.pdefe.platform 'linux', ötekinde 'win32' (her belgenin kendi modül haritası var;
// platform.js LINUX'u yüklenirken okur; yükleme test/mac_cerceve.js ile). Her denetim iki çerçevede koşulur: Linux'ta beklenen davranış ve
// Windows davranışının değişmediği. Linux'ta kısayollar ve davranış Windows'takidir; ayrılanlar sistem adları, yazı notunun yazı tipleri,
// dosya izni iletileri, varsayılan PDF programı, güncelleme (AppImage / tarayıcıdan) ve yazdırma penceresinin metinleri. Uygulamanın kendi
// sayfasına dokunulmaz; çerçeveler sonunda kaldırılır.
// Kullanım: powershell -File test\baslat.ps1 -Port <port> -Veri <klasör>; $env:PDEFE_CDP_PORT=<port>; node test\surucu.mjs betik test\linux_renderer.mjs
const J = (x) => JSON.stringify(x);
let hata = 0, tamam = 0;
function sonuc(ad, kosul, ayrinti) {
  if (kosul) tamam++; else hata++;
  console.log(`${kosul ? 'TAMAM' : 'HATA '}  ${ad}${kosul || ayrinti === undefined ? '' : '  — ' + J(ayrinti)}`);
}

// Çerçevede çalışan kodun başı: ortam(linux) → { yukle(modül yolu, src/renderer'a göre), belge, pencere }
const ORTAM = `const ortam = (linux) => { const f = document.querySelector(linux ? '#linux-cerceve' : '#win-cerceve');
    return { yukle: (m) => f.contentWindow.__yukle('pdefe://app/src/renderer/' + m), belge: f.contentDocument, pencere: f.contentWindow }; };`;

export default async function ({ evalJs }) {
  const kur = await evalJs(`(async () => {
    const sonuc = {};
    for (const [id, platform] of [['linux-cerceve', 'linux'], ['win-cerceve', 'win32']]) {
      document.querySelector('#' + id)?.remove();
      const f = document.createElement('iframe'); f.id = id; f.style.cssText = 'position:fixed;left:-4000px;top:0;width:900px;height:700px;border:0';
      document.body.append(f);
      f.contentWindow.pdefe = { platform, cagir: async () => null, on: () => {}, gonder: () => {}, dosyaYolu: () => '' };
      const s = f.contentDocument.createElement('script'); s.type = 'module'; s.src = 'pdefe://app/test/mac_cerceve.js';
      const yuklendi = new Promise((c, r) => { s.onload = c; s.onerror = () => r(new Error('mac_cerceve.js yüklenemedi')); });
      f.contentDocument.head.append(s); await yuklendi;
      const p = await f.contentWindow.__yukle('pdefe://app/src/renderer/platform.js');
      sonuc[platform] = { LINUX: p.LINUX, MAC: p.MAC, SISTEM: p.SISTEM, DOSYA_YONETICISI: p.DOSYA_YONETICISI, ortak: p.YALNIZ_ORTAK_YAZI_TIPLERI,
        tus: p.tus('Farklı kaydet (Ctrl+Shift+S) · F3 / Shift+F3 · Delete'), ctrl: p.birincil({ ctrlKey: true }), meta: p.birincil({ metaKey: true }) };
    }
    return sonuc;
  })()`);
  sonuc('platform.js (Linux): LINUX, MAC değil, SISTEM "Linux", dosya yöneticisi, yalnız ortak yazı tipleri',
    kur.linux?.LINUX === true && kur.linux.MAC === false && kur.linux.SISTEM === 'Linux' && kur.linux.DOSYA_YONETICISI === 'dosya yöneticisi' && kur.linux.ortak === true, kur.linux);
  sonuc('platform.js (Windows): eskisi gibi (SISTEM "Windows", Gezgin), Linux değil', kur.win32?.LINUX === false && kur.win32.MAC === false && kur.win32.SISTEM === 'Windows'
    && kur.win32.DOSYA_YONETICISI === 'Gezgin' && kur.win32.ortak === false, kur.win32);
  sonuc('Kısayollar Linux\'ta Windows\'taki gibi: Ctrl birincil tuş, yazım çevrilmez', kur.linux.tus === 'Farklı kaydet (Ctrl+Shift+S) · F3 / Shift+F3 · Delete'
    && kur.linux.tus === kur.win32.tus && kur.linux.ctrl === true && kur.linux.meta === false, { linux: kur.linux, win: kur.win32 });

  // ---------------------------------------------------------------- Yazı notunun yazı tipleri (notlar.js)
  // Linux'ta Segoe UI ve Calibri yok: listede Arial ve Times New Roman (çekirdek de onları gömer: core/islemler/linux.py), varsayılan Arial
  const yazi = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const linux of [true, false]) {
      const o = ortam(linux), m = await o.yukle('notlar.js');
      sonuc[linux ? 'linux' : 'win'] = m.YAZI_TIPLERI;
    }
    return sonuc;
  })()`);
  sonuc('Yazı notu (Linux): Arial ve Times New Roman', J(yazi.linux) === J(['Arial', 'Times New Roman']), yazi.linux);
  sonuc('Yazı notu (Windows): dört aile eskisi gibi', J(yazi.win) === J(['Segoe UI', 'Arial', 'Times New Roman', 'Calibri']), yazi.win);

  // ---------------------------------------------------------------- Araçların yazılamayan dosya sorusu (araclar/ortak.js kayitSecimi.hataSor)
  // Linux'ta dosyaları başka programlar kilitlemez, Gezgin'in Salt okunur özniteliği yoktur: neden okuma / yazma iznidir, ileti dosya
  // yöneticisinin Özellikler › İzinler bölümünü anlatır. Windows metinleri değişmemeli (test/mac_renderer.mjs'teki beklentilerle aynı)
  const hataSorusu = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const linux of [true, false]) {
      const o = ortam(linux), { kayitSecimi } = await o.yukle('araclar/ortak.js');
      const sorular = [];
      const baglam = { pdefe: { cagir: async (kanal, yol) => (kanal === 'dosya:varMi' ? yol === '/home/kullanici/Belgeler' : {}) }, ayar: () => ({ ciktiKlasoru: '/home/kullanici/Belgeler' }), bildir: () => {},
        mesajKutusu: async (s) => { sorular.push({ mesaj: s.mesaj, ayrinti: s.ayrinti, dugmeler: s.dugmeler }); return { secim: s.dugmeler.length - 1 }; } };
      const k = kayitSecimi({ baglam, belge: { yol: '/home/kullanici/Belgeler/Belge.pdf', ad: 'Belge.pdf' }, ad: 'Sıkıştırılmış' });
      await k.hazir;
      k.cikti.ayarla('/home/kullanici/Belgeler', 'Hedef', { elle: true });
      const r = sonuc[linux ? 'linux' : 'win'] = {};
      const sor = async (ad, ileti) => { sorular.length = 0; await k.hataSor(new Error(ileti)); r[ad] = sorular[0] || null; };
      await sor('yeniSaltOkunur', 'Dosya salt okunur');
      await sor('yeniYazilamadi', 'Dosya yazılamadı');
      await sor('okunamadi', 'Dosya okunamadı, başka bir programda açık olabilir: Ek.pdf');
      k.kipAyarla('uzerine');
      await sor('uzerineSaltOkunur', 'Dosya yazılamadı, salt okunur: Belge.pdf');
      await sor('uzerineYazilamadi', 'Dosya yazılamadı');
      k.kipAyarla('yeni'); k.cokluAyarla(true);
      await sor('coklu', 'Dosya yazılamadı');
    }
    return sonuc;
  })()`);
  const PROGRAMDA = 'başka bir programda (örneğin bir PDF okuyucuda) açık olabilir';
  const WIN_AYRINTI = {
    yeniSaltOkunur: 'Aynı adlı var olan dosyanın Salt okunur özniteliği açık, o dosya değiştirilmedi.\n\nSonucu başka bir adla kaydedebilir ya da Salt okunur işaretini kaldırıp yeniden deneyebilirsiniz.',
    yeniYazilamadi: `Aynı adlı var olan dosya ${PROGRAMDA}, o dosya değiştirilmedi.\n\nSonucu başka bir adla kaydedebilir ya da dosyayı kullanan programı kapatıp yeniden deneyebilirsiniz.`,
    okunamadi: `Dosya ${PROGRAMDA}. Hiçbir dosya değiştirilmedi.\n\nDosyayı kullanan programı kapatıp yeniden deneyin.`,
    uzerineSaltOkunur: 'Dosyanın Salt okunur özniteliği açık. Özgün dosya değiştirilmedi.\n\nDosya Gezgini\'nde dosyanın Özellikler penceresinden Salt okunur işaretini kaldırıp yeniden deneyebilir ya da sonucu yeni bir belge olarak kaydedebilirsiniz.',
    uzerineYazilamadi: `Dosya ${PROGRAMDA}. Özgün dosya değiştirilmedi.\n\nDosyayı kullanan programı kapatıp yeniden deneyebilir ya da sonucu yeni bir belge olarak kaydedebilirsiniz.`,
    coklu: `Seçilen klasöre yazılamadı. Klasör salt okunur olabilir ya da bir dosya ${PROGRAMDA}. Var olan hiçbir dosya değiştirilmedi.\n\nBaşka bir klasör seçebilir ya da yeniden deneyebilirsiniz.`,
  };
  const winFark = Object.entries(WIN_AYRINTI).filter(([ad, a]) => hataSorusu.win[ad]?.ayrinti !== a).map(([ad]) => ad);
  sonuc('Araç sorusu (Windows): altı durumun açıklaması eskisi gibi', !winFark.length, winFark.map((ad) => ({ ad, ayrinti: hataSorusu.win[ad]?.ayrinti })));
  const linuxHatali = Object.keys(WIN_AYRINTI).filter((ad) => {
    const l = hataSorusu.linux[ad], w = hataSorusu.win[ad];
    return !l || /Gezgin|Finder|Bilgi Al|Salt okunur özniteliği|başka bir programda|kullanan programı|;/.test(l.ayrinti) || !/Özellikler › İzinler/.test(l.ayrinti)
      || !/izni/.test(l.ayrinti) || l.mesaj !== w?.mesaj || J(l.dugmeler) !== J(w?.dugmeler);
  });
  sonuc('Araç sorusu (Linux): altı durumda da izin ve dosya yöneticisinin Özellikler › İzinler bölümü, Gezgin / Finder / "başka programda açık" ve noktalı virgül yok; başlık ve düğmeler aynı',
    !linuxHatali.length, linuxHatali.map((ad) => ({ ad, ...hataSorusu.linux[ad] })));

  // ---------------------------------------------------------------- Birleştir: boş liste metni (araclar/gorselBirlestir.js)
  const bos = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const linux of [true, false]) {
      const o = ortam(linux), { BirlestirmePenceresi } = await o.yukle('araclar/gorselBirlestir.js');
      const baglam = { pdefe: o.pencere.pdefe, ayar: () => ({}), cekirdek: { cagir: async () => null }, belgeler: new Map(), bildir: () => {}, mesajKutusu: async () => ({ secim: 1 }) };
      const p = new BirlestirmePenceresi(baglam, {});
      p.ciz?.();
      sonuc[linux ? 'linux' : 'win'] = p.liste.querySelector('.bos-mesaj')?.textContent || null;
      for (const el of o.belge.querySelectorAll('.arac-ortusu')) el.remove();
    }
    return sonuc;
  })()`);
  sonuc('Birleştir boş liste (Linux): "Dosya yöneticisinden kopyalanan"', /Dosya yöneticisinden kopyalanan dosyaları/.test(bos.linux || '') && !/Gezgin/.test(bos.linux || ''), bos.linux);
  sonuc('Birleştir boş liste (Windows): "Gezgin\'den kopyalanan" eskisi gibi', /Gezgin'den kopyalanan dosyaları/.test(bos.win || ''), bos.win);

  // ---------------------------------------------------------------- Ayarlar › Görünüm (yazı çizimi) ve › Güncelleme
  const ayarlar = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const linux of [true, false]) {
      const o = ortam(linux), m = await o.yukle('ayarlarPenceresi.js');
      const r = sonuc[linux ? 'linux' : 'win'] = {};
      let ortu = m.ayarlarPenceresiAc({ ayar: () => ({}), ayarKoy: () => {}, pdefe: { cagir: async () => null } }, { bolum: 'gorunum' });
      const cizim = [...ortu.querySelectorAll('.ayar-kart')].find((x) => x.querySelector('.ayar-baslik')?.textContent === 'Yazı çizimi');
      r.cizim = { aciklama: cizim?.querySelector('.ayar-aciklama')?.textContent || '', secenekler: [...(cizim?.querySelectorAll('option') || [])].map((x) => x.textContent) };
      m.ayarlarPenceresiKapat();
      for (const tarayicida of [false, true]) {
        const guncelleme = { denetle: async () => ({ durum: 'var', asama: 'var', surum: '9.9.9', mevcut: '0.3.1' }), durum: () => ({ asama: 'var', tarayicida }), guncelle: () => {} };
        ortu = m.ayarlarPenceresiAc({ ayar: () => ({}), ayarKoy: () => {}, pdefe: { cagir: async () => null }, guncelleme }, { bolum: 'guncelleme' });
        const aciklama = ortu.querySelector('.ayar-aciklama')?.textContent || '';
        [...ortu.querySelectorAll('button')].find((b) => b.textContent === 'Şimdi denetle')?.click();
        for (let i = 0; i < 50 && !ortu.querySelector('.ayar-sonuc-var button'); i++) await new Promise((c) => setTimeout(c, 20));
        r[tarayicida ? 'tarayicida' : 'appimage'] = { aciklama, dugme: ortu.querySelector('.ayar-sonuc-var button')?.textContent || null };
        m.ayarlarPenceresiKapat();
      }
    }
    return sonuc;
  })()`);
  sonuc('Ayarlar › Yazı çizimi (Linux): "Linux çizimi", Windows / ClearType yok, noktalı virgül yok',
    ayarlar.linux.cizim.secenekler.includes('Linux çizimi') && !/Windows|ClearType|;/.test(ayarlar.linux.cizim.aciklama + ayarlar.linux.cizim.secenekler.join(' ')), ayarlar.linux.cizim);
  sonuc('Ayarlar › Yazı çizimi (Windows): "Windows ClearType" eskisi gibi', ayarlar.win.cizim.secenekler.includes('Windows ClearType') && /Windows ClearType: bütün yazılar/.test(ayarlar.win.cizim.aciklama), ayarlar.win.cizim);
  sonuc('Ayarlar › Güncelleme (Linux, AppImage): açıklama AppImage dosyasının yenisiyle değiştiğini söylüyor, düğme Güncelle',
    /AppImage dosyası yenisiyle değişir ve PDEfe yeniden açılır/.test(ayarlar.linux.appimage.aciklama) && !/;/.test(ayarlar.linux.appimage.aciklama.split('denenir. ')[1] || ';')
    && ayarlar.linux.appimage.dugme === 'Güncelle', ayarlar.linux.appimage);
  sonuc('Ayarlar › Güncelleme (Linux, AppImage dışında): düğme İndir', ayarlar.linux.tarayicida.dugme === 'İndir', ayarlar.linux.tarayicida);
  sonuc('Ayarlar › Güncelleme (Windows): açıklama ve düğme (Güncelle) eskisi gibi',
    ayarlar.win.appimage.aciklama === 'İki günde bir, açılışta ya da PDEfe açık kalıyorsa gün içinde arka planda yeni sürüme bakılır; internet yoksa sonra yeniden denenir. Yeni sürüm varsa pencerenin üstünde bir şerit görünür; Güncelle\'ye tek tıkla indirilir, kurulur ve PDEfe yeniden açılır.'
    && ayarlar.win.appimage.dugme === 'Güncelle', ayarlar.win.appimage);

  // ---------------------------------------------------------------- Ayarlar › Açılış ve düzen › Varsayılan PDF görüntüleyici
  // Linux'ta düğme PDEfe'nin kendisinde biter (menü kaydı + xdg-mime): tıklayınca sonuç hemen yeniden okunur, "Zaten varsayılan" görünür;
  // yapılamazsa açıklamanın yerine neden yazar. Windows'ta tıklama yalnız Windows Ayarlar'ı açar (yeniden okuma pencere odağında)
  const varsayilan = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const linux of [true, false]) {
      const o = ortam(linux), m = await o.yukle('ayarlarPenceresi.js');
      for (const basari of linux ? [true, false] : [true]) {
        const cagrilar = [];
        let varsayilanMi = false;
        const pdefe = { cagir: async (k) => {
          cagrilar.push(k);
          if (k === 'kabuk:varsayilanMi') return { varsayilan: varsayilanMi, progId: varsayilanMi ? 'pdefe.desktop' : 'org.gnome.Evince.desktop' };
          if (k === 'kabuk:varsayilanUygulamalar') { if (linux && basari) varsayilanMi = true; return linux ? (basari ? { tamam: true } : { tamam: false, hata: 'xdg-mime bulunamadı' }) : undefined; }
          return null;
        } };
        const ortu = m.ayarlarPenceresiAc({ ayar: () => ({}), ayarKoy: () => {}, pdefe }, { bolum: 'acilis' });
        const kart = [...ortu.querySelectorAll('.ayar-kart')].find((x) => x.querySelector('.ayar-baslik')?.textContent === 'Varsayılan PDF görüntüleyici');
        await new Promise((c) => setTimeout(c, 60));
        const dugme = [...kart.querySelectorAll('button')].find((b) => b.textContent === 'Varsayılan PDF görüntüleyici yap');
        const once = { aciklama: kart.querySelector('.ayar-aciklama').textContent, dugmeGorunur: !!dugme && !dugme.hidden };
        dugme?.click();
        await new Promise((c) => setTimeout(c, 120));
        sonuc[(linux ? 'linux' : 'win') + (basari ? '' : 'Hata')] = { once, cagrilar, zaten: !kart.querySelector('.ayar-zaten-varsayilan').hidden,
          sonra: kart.querySelector('.ayar-aciklama').textContent };
        m.ayarlarPenceresiKapat();
      }
    }
    return sonuc;
  })()`);
  sonuc('Varsayılan PDF (Linux): açıklama menüye eklemeyi anlatıyor, düğme görünür; tıklayınca yapılır ve hemen "Zaten varsayılan"',
    /uygulama menüsüne ekler/.test(varsayilan.linux.once.aciklama) && !/Windows|;/.test(varsayilan.linux.once.aciklama) && varsayilan.linux.once.dugmeGorunur
    && varsayilan.linux.cagrilar.filter((k) => k === 'kabuk:varsayilanMi').length === 2 && varsayilan.linux.zaten === true, varsayilan.linux);
  sonuc('Varsayılan PDF (Linux): yapılamazsa açıklamada neden', varsayilan.linuxHata.sonra === 'Varsayılan yapılamadı. xdg-mime bulunamadı' && varsayilan.linuxHata.zaten === false, varsayilan.linuxHata);
  sonuc('Varsayılan PDF (Windows): açıklama ve tıklama eskisi gibi (Windows Ayarlar, hemen yeniden okunmaz)',
    /Windows "Varsayılan Uygulamalar" sayfası açılır/.test(varsayilan.win.once.aciklama) && varsayilan.win.once.dugmeGorunur
    && varsayilan.win.cagrilar.filter((k) => k === 'kabuk:varsayilanMi').length === 1 && varsayilan.win.cagrilar.includes('kabuk:varsayilanUygulamalar'), varsayilan.win);

  // ---------------------------------------------------------------- Güncelleme şeridi (guncelleme.js)
  // AppImage'da Windows'taki gibi Güncelle (indir, kur, yeniden başlat). AppImage dışında ana süreç tarayicida bildirir: İndir → tarayıcıda iner,
  // şerit yeni AppImage'ı eskisinin yerine koymayı ve çalıştırma iznini söyler (⌘Q, Uygulamalar, macOS yok). Windows'ta değişmedi
  const serit = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const [ad, linux, tarayicida] of [['linuxAppImage', true, false], ['linuxTarayici', true, true], ['win', false, false]]) {
      const o = ortam(linux), { guncellemeSeridiKur } = await o.yukle('guncelleme.js');
      const dinleyiciler = {}, asamalar = [];
      const pdefe = { cagir: async (kanal) => (kanal === 'guncelleme:indir' ? (tarayicida ? { tamam: true, tarayicida: true } : { tamam: false, mesaj: 'deneme' }) : null),
        dinle: (kanal, cb) => { dinleyiciler[kanal] = cb; } };
      const el = o.belge.createElement('div'); el.hidden = true; o.belge.body.append(el);
      new o.pencere.MutationObserver(() => { if (el.dataset.asama && asamalar.at(-1) !== el.dataset.asama) asamalar.push(el.dataset.asama); }).observe(el, { attributes: true, attributeFilter: ['data-asama'] });
      const g = guncellemeSeridiKur({ pdefe, serit: el, bildir: () => {} });
      dinleyiciler['guncelleme:var']({ surum: '9.9.9', mevcut: '0.3.1', ...(tarayicida ? { tarayicida: true } : {}) });
      const r = sonuc[ad] = { dugme: el.querySelector('button.birincil-serit')?.textContent || null };
      await g.guncelle();
      await new Promise((c) => setTimeout(c, 30));
      r.asama = el.dataset.asama; r.asamalar = asamalar; r.metin = el.querySelector('.metin')?.textContent || '';
      el.remove();
    }
    return sonuc;
  })()`);
  sonuc('Güncelleme şeridi (Linux, AppImage): Güncelle, indirme şeridi Windows\'taki gibi', serit.linuxAppImage.dugme === 'Güncelle' && serit.linuxAppImage.asamalar.includes('indiriliyor'), serit.linuxAppImage);
  sonuc('Güncelleme şeridi (Linux, AppImage dışında): İndir, indiriliyor aşaması yok, metin PDEfe-Linux.AppImage ve çalıştırma iznini söylüyor (⌘Q / Uygulamalar / macOS yok)',
    serit.linuxTarayici.dugme === 'İndir' && serit.linuxTarayici.asama === 'tarayicida' && !serit.linuxTarayici.asamalar.includes('indiriliyor')
    && /PDEfe-Linux\.AppImage dosyasını eskisinin yerine koyup çalıştırma izni verin/.test(serit.linuxTarayici.metin) && /chmod \+x/.test(serit.linuxTarayici.metin)
    && !/⌘|Uygulamalar|macOS|;/.test(serit.linuxTarayici.metin), serit.linuxTarayici);
  sonuc('Güncelleme şeridi (Windows): Güncelle, indirme şeridi eskisi gibi', serit.win.dugme === 'Güncelle' && serit.win.asamalar.includes('indiriliyor'), serit.win);

  // ---------------------------------------------------------------- Yazdırma penceresi (yazdir.js)
  // Linux'ta "Yazıcı ayarları" (CUPS'ın yazıcı sayfası; main/yazdir.js), yedek yol "Linux yazdırma penceresiyle yazdır"; yazıcı yokken iletide
  // Windows Ayarlar yok. Windows'ta değişmedi
  const yazdirPenceresi = await evalJs(`(async () => { ${ORTAM}
    const sonuc = {};
    for (const [ad, linux, yazicisiz] of [['linux', true, false], ['linuxYazicisiz', true, true], ['win', false, false], ['winYazicisiz', false, true]]) {
      const o = ortam(linux), { yazdir } = await o.yukle('yazdir.js');
      const pdefe = { cagir: async (k) => {
        if (k === 'dosya:varMi') return true;
        if (k === 'ayar:al') return {};
        if (k === 'yazdir:yazicilar') return yazicisiz ? { yazicilar: [], varsayilan: null } : { yazicilar: [{ ad: 'Lazer_Yazici', gorunenAd: 'Lazer Yazıcı', varsayilan: true }], varsayilan: 'Lazer_Yazici' };
        if (k === 'yazdir:yaziciDurumu') return { durumlar: {} };
        return null;
      } };
      const cekirdek = async (y) => (y === 'sayfa_boyutlari' ? { sayfa: 1, sayfalar: [{ genislik: 595, yukseklik: 842 }] }
        : y === 'sayfa_goruntu' ? { veri: 'AAAA', bicim: 'jpeg', genislikPt: 595, yukseklikPt: 842 } : null);
      yazdir({ cekirdek, pdefe, mesajKutusu: async () => ({ secim: 0 }), bildir: () => {}, kaydet: async () => true },
        { yol: '/home/kullanici/Belge.pdf', ad: 'Belge.pdf', degisti: false, gorunum: { gecerli: 1, sayfaSayisi: 1 } });
      const b = o.belge, t0 = Date.now();
      const hazir = () => yazicisiz ? /yazıcı yok/i.test(b.querySelector('.yazdir-diyalog')?.textContent || '') : !!b.querySelector('.yazdir-diyalog [name="yazici"]')?.value;
      while (Date.now() - t0 < 5000 && !hazir()) await new Promise((c) => setTimeout(c, 50));
      const tercih = b.querySelector('.yazdir-diyalog [data-id="tercihler"]');
      sonuc[ad] = { tercih: tercih?.textContent, tercihIpucu: tercih?.title, sistem: b.querySelector('.yazdir-diyalog [data-id="sistem"]')?.textContent,
        metin: b.querySelector('.yazdir-diyalog')?.textContent || '' };
      b.querySelector('.yazdir-diyalog [data-id="iptal"]')?.click();
      await new Promise((c) => setTimeout(c, 100));
      for (const el of b.querySelectorAll('.yazdir-ortusu')) el.remove();
    }
    return sonuc;
  })()`);
  sonuc('Yazdırma penceresi (Linux): "Yazıcı ayarları" (CUPS sayfası), "Linux yazdırma penceresiyle yazdır"', yazdirPenceresi.linux.tercih === 'Yazıcı ayarları'
    && /CUPS sayfasını/.test(yazdirPenceresi.linux.tercihIpucu || '') && yazdirPenceresi.linux.sistem === 'Linux yazdırma penceresiyle yazdır', { ...yazdirPenceresi.linux, metin: undefined });
  sonuc('Yazdırma penceresi (Linux, yazıcı yok): ileti sistem ayarlarının Yazıcılar bölümünü söylüyor, Windows yok',
    /Kurulu yazıcı yok\. Sistem ayarlarının Yazıcılar bölümünden bir yazıcı ekleyin\./.test(yazdirPenceresi.linuxYazicisiz.metin) && !/Windows Ayarlar/.test(yazdirPenceresi.linuxYazicisiz.metin),
    yazdirPenceresi.linuxYazicisiz.metin.slice(0, 300));
  sonuc('Yazdırma penceresi (Windows): "Yazıcı tercihleri", "Windows yazdırma penceresiyle yazdır", yazıcı yokken Windows Ayarlar eskisi gibi',
    yazdirPenceresi.win.tercih === 'Yazıcı tercihleri' && yazdirPenceresi.win.sistem === 'Windows yazdırma penceresiyle yazdır'
    && /Windows Ayarlar › Yazıcılar ve tarayıcılar/.test(yazdirPenceresi.winYazicisiz.metin), { ...yazdirPenceresi.win, metin: undefined });

  await evalJs(`(() => { document.querySelector('#linux-cerceve')?.remove(); document.querySelector('#win-cerceve')?.remove(); return true; })()`);
  console.log(`\n${tamam} tamam, ${hata} hata`);
}
