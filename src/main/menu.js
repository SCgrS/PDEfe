// Türkçe uygulama menüsü. Her öğe renderer'a bir komut kimliği gönderir; mantık orada.
import { Menu } from 'electron';
import path from 'node:path';

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

  const sablon = [
    {
      label: '&Dosya',
      submenu: [
        { label: 'Aç', accelerator: 'Ctrl+O', click: k('dosya.ac') },
        { label: 'Yeni sekme', accelerator: 'Ctrl+T', click: k('sekme.yeni') },
        ...(sonListe ? [{
          label: 'Son açılanlar',
          submenu: son.length
            ? [...son.map((y) => ({ label: path.basename(y), sublabel: path.dirname(y), click: k('dosya.acYol', y) })),
               { type: 'separator' }, { label: 'Listeyi temizle', click: k('dosya.sonTemizle') }]
            : [{ label: '(boş)', enabled: false }],
        }] : []),
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
        { label: 'Sayfayı sığdır', click: k('gorunum.zoom', 'sayfa') },
        { label: 'Genişliğe sığdır', click: k('gorunum.zoom', 'genislik') },
        { label: 'Görünür alana sığdır', click: k('gorunum.zoom', 'gorunur') },
        { type: 'separator' },
        { label: 'Tek sayfa', type: 'radio', checked: !iki, click: k('gorunum.duzen', 'tek') },
        { label: 'İki sayfa', type: 'radio', checked: iki, click: k('gorunum.duzen', 'iki') },
        { label: 'Kaydırmayı etkinleştir', type: 'checkbox', checked: kaydirma, click: k('gorunum.kaydirma') },
        { label: 'İki sayfalı görünümde kapak sayfasını ayrı göster', type: 'checkbox', checked: !!dz.kapakAyri, click: k('gorunum.kapakAyri') },
        { type: 'separator' },
        // 0.1.13: Ctrl+Shift++ Türkçe Q klavyede basılamıyordu (+ zaten Shift+4); R her düzende aynı tuş. Araç penceresi / diyalog açıkken
        // çalışmaz (uygulama.js menu:komut)
        { label: 'Saat yönünde döndür', accelerator: 'Ctrl+R', click: k('gorunum.dondur', 90) },
        { label: 'Saat yönünün tersine döndür', accelerator: 'Ctrl+Shift+R', click: k('gorunum.dondur', -90) },
        { type: 'separator' },
        { label: 'Sol panel', accelerator: 'F4', click: k('gorunum.solPanel') },
        { label: 'Koyu / açık tema', click: k('gorunum.tema') },
        { type: 'separator' },
        { label: 'Okuma modu', accelerator: 'Ctrl+H', click: k('gorunum.okumaModu') },
        { label: 'Tam ekran', accelerator: 'F11', click: k('gorunum.tamEkran') },
      ],
    },
    {
      label: '&Araçlar',
      submenu: [
        // Sıra araç çubuğundaki Araçlar penceresiyle aynı (renderer/aracPenceresi.js ARACLAR)
        { label: 'PDF küçült', click: k('arac.kucult') },
        { label: 'Sayfaları düzenle', click: k('arac.sayfalar') },
        { label: 'Döndür ve kaydet', click: k('arac.dondurKaydet') },
        { label: 'PDF ayır', click: k('arac.ayir') },
        { label: 'Görüntü / PDF belgeleri birleştirerek PDF oluştur', click: k('arac.gorselBirlestir') },
        { type: 'separator' },
        { label: 'Paylaş (dosyayı panoya kopyala)', click: k('arac.paylas') },
      ],
    },
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
  return Menu.buildFromTemplate(sablon);
}
