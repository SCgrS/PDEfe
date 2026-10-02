// Türkçe uygulama menüsü. Her öğe renderer'a bir komut kimliği gönderir; mantık orada.
// macOS'ta (0.2.0) Mac düzeni: ilk menü uygulama menüsüdür (Hakkında, Ayarlar, Gizle, Çık), kısayollar ⌘ ile, Pencere menüsü var. Mac'te
// girdi kutularındaki kes / kopyala / yapıştır / geri al / tümünü seç de menüden gelir (Chromium bu tuşları Mac'te sayfa yerine menüye
// bırakır): Kes, Yapıştır menüde rol olarak durur; Geri al, Yinele, Tümünü seç kaydedilmiş kısayollarıyla komut gönderir, renderer
// odak girdi kutusundaysa kutunun kendi işini yapar (uygulama.js girdiDuzenle). Sayfa kısayolu işlerse (preventDefault) menü çalışmaz.
// Kısayol eşlemesi renderer/platform.js (gösterilen yazılar) ve uygulama.js (sayfadaki tuşlar) ile aynıdır.
import { Menu } from 'electron';
import path from 'node:path';

const MAC = process.platform === 'darwin';

/** sonDosyalar() null dönerse ("Son açılanları hatırla" kapalı) Dosya menüsünde Son açılanlar gösterilmez. komut(id, veri, pencere):
 *  pencere menünün açıldığı (etkin) penceredir; birden çok pencere açıkken komut ona gider. cik(): bütün pencereleri kapatır. */
export function menuKur({ komut, cik, sonDosyalar, duzen }) {
  const k = (id, veri) => (_oge, pencere) => komut(id, veri, pencere);
  const sonListe = sonDosyalar();
  const son = (sonListe || []).slice(0, 10);
  // Sayfa düzeni işaretleri (araç çubuğundaki düzen menüsüyle aynı): ayar değişince menü yeniden kurulur (main.js uygulamaMenusuKur)
  const dz = duzen?.() || {};
  const d = ['tek', 'surekli', 'iki', 'ikiSurekli'].includes(dz.duzen) ? dz.duzen : 'surekli';
  const iki = d === 'iki' || d === 'ikiSurekli', kaydirma = d === 'surekli' || d === 'ikiSurekli';
  return Menu.buildFromTemplate(MAC ? macSablonu({ k, cik, sonListe, son, dz, iki, kaydirma }) : windowsSablonu({ k, cik, sonListe, son, dz, iki, kaydirma }));
}

function sonAcilanlar(k, sonListe, son) {
  return sonListe ? [{
    label: 'Son açılanlar',
    submenu: son.length
      ? [...son.map((y) => ({ label: path.basename(y), sublabel: path.dirname(y), click: k('dosya.acYol', y) })),
         { type: 'separator' }, { label: 'Listeyi temizle', click: k('dosya.sonTemizle') }]
      : [{ label: '(boş)', enabled: false }],
  }] : [];
}

function duzenOgeleri(k, dz, iki, kaydirma) {
  return [
    { label: 'Sayfayı sığdır', click: k('gorunum.zoom', 'sayfa') },
    { label: 'Genişliğe sığdır', click: k('gorunum.zoom', 'genislik') },
    { label: 'Görünür alana sığdır', click: k('gorunum.zoom', 'gorunur') },
    { type: 'separator' },
    { label: 'Tek sayfa', type: 'radio', checked: !iki, click: k('gorunum.duzen', 'tek') },
    { label: 'İki sayfa', type: 'radio', checked: iki, click: k('gorunum.duzen', 'iki') },
    { label: 'Kaydırmayı etkinleştir', type: 'checkbox', checked: kaydirma, click: k('gorunum.kaydirma') },
    { label: 'İki sayfalı görünümde kapak sayfasını ayrı göster', type: 'checkbox', checked: !!dz.kapakAyri, click: k('gorunum.kapakAyri') },
  ];
}

function araclarMenusu(k) {
  return {
    label: MAC ? 'Araçlar' : '&Araçlar',
    submenu: [
      // Sıra araç çubuğundaki Araçlar penceresiyle aynı (renderer/aracPenceresi.js ARACLAR)
      { label: 'Sıkıştır', click: k('arac.kucult') },
      { label: 'Sayfaları düzenle', click: k('arac.sayfalar') },
      { label: 'Döndür', click: k('arac.dondurKaydet') },
      { label: 'Ayır', click: k('arac.ayir') },
      { label: 'Görüntü / PDF belgeleri birleştirerek PDF oluştur', click: k('arac.gorselBirlestir') },
      { type: 'separator' },
      { label: 'PDF\'i kopyala (dosyayı panoya)', click: k('arac.paylas') },
    ],
  };
}

function windowsSablonu({ k, cik, sonListe, son, dz, iki, kaydirma }) {
  return [
    {
      label: '&Dosya',
      submenu: [
        { label: 'Aç', accelerator: 'Ctrl+O', click: k('dosya.ac') },
        { label: 'Yeni sekme', accelerator: 'Ctrl+T', click: k('sekme.yeni') },
        ...sonAcilanlar(k, sonListe, son),
        { type: 'separator' },
        { label: 'Kaydet', accelerator: 'Ctrl+S', click: k('dosya.kaydet') },
        { label: 'Farklı kaydet', accelerator: 'Ctrl+Shift+S', click: k('dosya.farkliKaydet') },
        { type: 'separator' },
        { label: 'Sekmeyi kapat', accelerator: 'Ctrl+W', click: k('sekme.kapat') },
        // Sekme geçişi sayfada işlenir (uygulama.js; Ctrl+← / Ctrl+→ de): hızlandırıcı yalnızca menüde yazar
        { label: 'Sonraki sekme', accelerator: 'Ctrl+PageDown', registerAccelerator: false, click: k('sekme.sonraki') },
        { label: 'Önceki sekme', accelerator: 'Ctrl+PageUp', registerAccelerator: false, click: k('sekme.onceki') },
        { label: 'Klasörde göster', click: k('dosya.klasordeGoster') },
        { type: 'separator' },
        { label: 'Yazdır', accelerator: 'Ctrl+P', click: k('dosya.yazdir') },
        { type: 'separator' },
        // Çıkış bütün pencereleri sırayla kapatır (her biri kaydedilmemiş belgelerini sorar). Alt+F4 Windows'taki gibi yalnızca etkin
        // pencereyi kapatır (hızlandırıcı kaydedilmez, tuşu Windows işler); tek pencere açıkken ikisi aynıdır
        { label: 'Çıkış', accelerator: 'Alt+F4', registerAccelerator: false, click: () => cik() },
      ],
    },
    {
      label: 'Dü&zen',
      submenu: [
        { label: 'Geri al', accelerator: 'Ctrl+Z', registerAccelerator: false, click: k('duzen.geriAl') },
        { label: 'Yinele', accelerator: 'Ctrl+Y', registerAccelerator: false, click: k('duzen.yinele') },
        { type: 'separator' },
        { label: 'Kopyala', accelerator: 'Ctrl+C', role: 'copy' },
        { label: 'Tümünü seç', accelerator: 'Ctrl+A', registerAccelerator: false, click: k('duzen.tumunuSec') },
        { type: 'separator' },
        { label: 'Not', click: k('not.arac', 'not') },
        { label: 'Vurgu', click: k('not.arac', 'vurgu') },
        { label: 'Yazı', click: k('not.arac', 'yazi') },
        { label: 'Seçili notu sil', accelerator: 'Delete', registerAccelerator: false, click: k('not.sil') },
        { type: 'separator' },
        { label: 'Bul', accelerator: 'Ctrl+F', click: k('duzen.bul') },
        { label: 'Sonrakini bul', accelerator: 'F3', click: k('duzen.bulSonraki') },
        { label: 'Öncekini bul', accelerator: 'Shift+F3', click: k('duzen.bulOnceki') },
        { label: 'Sayfaya git', accelerator: 'Ctrl+G', click: k('duzen.sayfayaGit') },
        { type: 'separator' },
        { label: 'Ayarlar', accelerator: 'Ctrl+,', click: k('duzen.ayarlar') },
      ],
    },
    {
      label: '&Görünüm',
      submenu: [
        // Yakınlaştırma tuşları sayfada işlenir (uygulama.js yakinlastirmaTusu): hızlandırıcı sanal tuş koduyla eşlenir, Türkçe Q klavyede
        // "=" tuşu (VK_OEM_PLUS) yok ve + Shift+4'tür; Ctrl+= hiç çalışmıyordu. Burada yalnızca menüde yazar.
        { label: 'Yakınlaştır', accelerator: 'Ctrl+Plus', registerAccelerator: false, click: k('gorunum.yakinlastir') },
        { label: 'Uzaklaştır', accelerator: 'Ctrl+-', registerAccelerator: false, click: k('gorunum.uzaklastir') },
        { label: 'Gerçek boyut (%100)', accelerator: 'Ctrl+0', click: k('gorunum.zoom', 'gercek') },
        ...duzenOgeleri(k, dz, iki, kaydirma),
        { type: 'separator' },
        // 0.1.13: Ctrl+Shift++ Türkçe Q klavyede basılamıyordu (+ zaten Shift+4); R her düzende aynı tuş. Araç penceresi / diyalog açıkken
        // çalışmaz (uygulama.js menu:komut). 0.1.27: yalnızca geçerli sayfa döner, sorulmaz (bütün sayfalar ya da aralık: Araçlar › Döndür)
        { label: 'Sayfayı saat yönünde döndür', accelerator: 'Ctrl+R', click: k('gorunum.dondur', 90) },
        { label: 'Sayfayı saat yönünün tersine döndür', accelerator: 'Ctrl+Shift+R', click: k('gorunum.dondur', -90) },
        { type: 'separator' },
        { label: 'Sol panel', accelerator: 'F4', click: k('gorunum.solPanel') },
        { label: 'Koyu / açık tema', click: k('gorunum.tema') },
        { type: 'separator' },
        { label: 'Okuma modu', accelerator: 'Ctrl+H', click: k('gorunum.okumaModu') },
        { label: 'Tam ekran', accelerator: 'F11', click: k('gorunum.tamEkran') },
      ],
    },
    araclarMenusu(k),
    {
      label: '&Yardım',
      submenu: [
        { label: 'Kısayollar', accelerator: 'F1', click: k('yardim.kisayollar') },
        { label: 'Güncellemeleri denetle', click: k('yardim.guncelle') },
        { type: 'separator' },
        { label: 'Geliştirici araçları', accelerator: 'Ctrl+Shift+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'PDEfe hakkında', click: k('yardim.hakkinda') },
      ],
    },
  ];
}

function macSablonu({ k, cik, sonListe, son, dz, iki, kaydirma }) {
  return [
    {
      label: 'PDEfe',   // macOS uygulama menüsü (başlığı uygulamanın adıdır)
      submenu: [
        { label: 'PDEfe hakkında', click: k('yardim.hakkinda') },
        { label: 'Güncellemeleri denetle…', click: k('yardim.guncelle') },
        { type: 'separator' },
        { label: 'Ayarlar…', accelerator: 'Cmd+,', click: k('duzen.ayarlar') },
        { type: 'separator' },
        { label: 'Hizmetler', role: 'services' },
        { type: 'separator' },
        { label: 'PDEfe\'yi gizle', role: 'hide' },
        { label: 'Diğerlerini gizle', role: 'hideOthers' },
        { label: 'Tümünü göster', role: 'unhide' },
        { type: 'separator' },
        // ⌘Q bütün pencereleri sırayla kapatır (her biri kaydedilmemiş belgelerini sorar); Dock'tan Çık da aynı yoldan (main.js before-quit)
        { label: 'PDEfe\'den çık', accelerator: 'Cmd+Q', click: () => cik() },
      ],
    },
    {
      label: 'Dosya',
      submenu: [
        { label: 'Aç…', accelerator: 'Cmd+O', click: k('dosya.ac') },
        { label: 'Yeni sekme', accelerator: 'Cmd+T', click: k('sekme.yeni') },
        ...sonAcilanlar(k, sonListe, son),
        { type: 'separator' },
        { label: 'Kaydet', accelerator: 'Cmd+S', click: k('dosya.kaydet') },
        { label: 'Farklı kaydet…', accelerator: 'Shift+Cmd+S', click: k('dosya.farkliKaydet') },
        { type: 'separator' },
        { label: 'Sekmeyi kapat', accelerator: 'Cmd+W', click: k('sekme.kapat') },
        // Sekme geçişi sayfada işlenir (uygulama.js; fiziksel tuşla, Türkçe klavyede de): hızlandırıcı yalnızca menüde yazar
        { label: 'Sonraki sekme', accelerator: 'Shift+Cmd+]', registerAccelerator: false, click: k('sekme.sonraki') },
        { label: 'Önceki sekme', accelerator: 'Shift+Cmd+[', registerAccelerator: false, click: k('sekme.onceki') },
        { label: 'Finder\'da göster', click: k('dosya.klasordeGoster') },
        { type: 'separator' },
        { label: 'Yazdır…', accelerator: 'Cmd+P', click: k('dosya.yazdir') },
      ],
    },
    {
      label: 'Düzen',
      submenu: [
        { label: 'Geri al', accelerator: 'Cmd+Z', click: k('duzen.geriAl') },
        { label: 'Yinele', accelerator: 'Shift+Cmd+Z', click: k('duzen.yinele') },
        { type: 'separator' },
        { label: 'Kes', accelerator: 'Cmd+X', role: 'cut' },
        { label: 'Kopyala', accelerator: 'Cmd+C', role: 'copy' },
        { label: 'Yapıştır', accelerator: 'Cmd+V', role: 'paste' },
        { label: 'Tümünü seç', accelerator: 'Cmd+A', click: k('duzen.tumunuSec') },
        { type: 'separator' },
        { label: 'Not', click: k('not.arac', 'not') },
        { label: 'Vurgu', click: k('not.arac', 'vurgu') },
        { label: 'Yazı', click: k('not.arac', 'yazi') },
        { label: 'Seçili notu sil', accelerator: 'Backspace', registerAccelerator: false, click: k('not.sil') },
        { type: 'separator' },
        { label: 'Bul', accelerator: 'Cmd+F', click: k('duzen.bul') },
        { label: 'Sonrakini bul', accelerator: 'Cmd+G', click: k('duzen.bulSonraki') },
        { label: 'Öncekini bul', accelerator: 'Shift+Cmd+G', click: k('duzen.bulOnceki') },
        { label: 'Sayfaya git…', accelerator: 'Alt+Cmd+G', click: k('duzen.sayfayaGit') },
      ],
    },
    {
      label: 'Görünüm',
      submenu: [
        { label: 'Yakınlaştır', accelerator: 'Cmd+Plus', registerAccelerator: false, click: k('gorunum.yakinlastir') },
        { label: 'Uzaklaştır', accelerator: 'Cmd+-', registerAccelerator: false, click: k('gorunum.uzaklastir') },
        { label: 'Gerçek boyut (%100)', accelerator: 'Cmd+0', click: k('gorunum.zoom', 'gercek') },
        ...duzenOgeleri(k, dz, iki, kaydirma),
        { type: 'separator' },
        { label: 'Sayfayı saat yönünde döndür', accelerator: 'Cmd+R', click: k('gorunum.dondur', 90) },
        { label: 'Sayfayı saat yönünün tersine döndür', accelerator: 'Shift+Cmd+R', click: k('gorunum.dondur', -90) },
        { type: 'separator' },
        { label: 'Sol panel', accelerator: 'Ctrl+Cmd+S', click: k('gorunum.solPanel') },
        { label: 'Koyu / açık tema', click: k('gorunum.tema') },
        { type: 'separator' },
        // ⌘H macOS'ta uygulamayı gizler: okuma modu ⇧⌘H
        { label: 'Okuma modu', accelerator: 'Shift+Cmd+H', click: k('gorunum.okumaModu') },
        { label: 'Tam ekran', accelerator: 'Ctrl+Cmd+F', click: k('gorunum.tamEkran') },
      ],
    },
    araclarMenusu(k),
    {
      label: 'Pencere',
      role: 'windowMenu',   // macOS açık pencereleri bu menünün sonuna ekler
      submenu: [
        { label: 'Küçült', role: 'minimize' },
        { label: 'Büyüt', role: 'zoom' },
        { type: 'separator' },
        { label: 'Tümünü öne getir', role: 'front' },
      ],
    },
    {
      label: 'Yardım',
      role: 'help',
      submenu: [
        { label: 'Kısayollar', accelerator: 'F1', click: k('yardim.kisayollar') },
        { type: 'separator' },
        { label: 'Geliştirici araçları', accelerator: 'Alt+Cmd+I', role: 'toggleDevTools' },
      ],
    },
  ];
}
