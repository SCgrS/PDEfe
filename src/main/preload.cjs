// Renderer'a dar ve güvenli bir köprü sunar. 0.1.23 (güvenlik denetimi): yalnızca aşağıdaki kanallar kullanılabilir; ana süreç de
// isteğin uygulamanın kendi sayfasından geldiğini denetler (main/guvenlik.js). Yeni bir IPC kanalı eklerken buraya da yazın.
// "test:" kanallarını ana süreç yalnızca geliştirme sürümünün test örneğinde kurar (main/gelistirme.js, main/pencereler.js).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const CAGRILAR = new Set([
  'ayar:al', 'ayar:koy', 'ayar:udeKlasoruSec', 'ayar:varsayilanlar', 'tema:sistemKoyu',
  'cekirdek:cagir', 'cekirdek:iptal',
  'dosya:acDiyalog', 'dosya:kaydetDiyalog', 'dosya:klasorSec', 'dosya:oku', 'dosya:bilgi', 'dosya:varMi', 'dosya:sil', 'dosya:varsayilanlaAc',
  'guncelleme:denetle', 'guncelleme:durum', 'guncelleme:indir', 'guncelleme:kur',
  'kabuk:disAc', 'kabuk:klasorAc', 'kabuk:klasordeGoster', 'kabuk:varsayilanMi', 'kabuk:varsayilanUygulamalar',
  'menu:popup', 'mesaj:kutu',
  'pano:dosya', 'pano:icerik', 'pano:metin', 'pano:oku',
  'pencere:baskaPenceredeAc', 'pencere:baskaPenceredeAcikMi', 'pencere:baslik', 'pencere:digerlerindenIzinAl', 'pencere:izinBirak', 'pencere:kapat',
  'pencere:kapatOnayla', 'pencere:kapatVazgec', 'pencere:kimlik', 'pencere:sayi', 'pencere:tamEkran', 'pencere:tasi', 'pencere:yeniPenceredeAc',
  'sekme:surukleBitti', 'sekme:tasi',
  'udf:yaklasikBilgi', 'udf:yaklasikDonustur', 'udf:yaklasikBirlestir', 'udf:yaklasikIptal',
  'uygulama:acilisZamanlari', 'uygulama:bilgi', 'uygulama:geciciKlasor', 'uygulama:klasorler', 'uygulama:sonDosyalar', 'uygulama:veriKlasoru',
  'yanit',
  'yazdir:hazirla', 'yazdir:sayfaEkle', 'yazdir:baslat', 'yazdir:iptal', 'yazdir:durum', 'yazdir:yazicilar', 'yazdir:yaziciDurumu', 'yazdir:tercihler',
]);
const GONDERIMLER = new Set(['uygulama:hazir', 'pencere:belgeler', 'pencere:kirli', 'sekme:surukleBasla', 'sekme:surukleCan', 'sekme:surukleIptal', 'hayalet:kare']);
const DINLEMELER = new Set([
  'ayar:degisti', 'cekirdek:ilerleme', 'dosya:ac', 'hayalet:icerik', 'hayalet:kareler', 'menu:komut', 'tema:sistem',
  'guncelleme:var', 'guncelleme:ilerleme', 'guncelleme:hazir', 'guncelleme:hata',
  'pencere:izinIste', 'pencere:izinBitti', 'pencere:kapatIstegi', 'pencere:tamEkran',
  'sekme:al', 'sekme:bant', 'sekme:disSurukle',
  'udf:yaklasikIlerleme',
]);
const testMi = (kanal) => typeof kanal === 'string' && kanal.startsWith('test:');
const izinYok = (kanal) => new Error(`İzin verilmeyen kanal: ${kanal}`);
// Açılış teması (0.2.10): ana süreç pencereyi kurarken etkin temayı komut satırıyla verir (pencereler.js additionalArguments). Arayüz
// renderer/ilkTema.js ile onu ilk çizimden önce html'e koyar; ayarlar IPC ile gelince (uygulama.js temaUygula) aynı tema yeniden uygulanır
const TEMA_ON_EKI = '--pdefe-tema=';
const ilkTema = (process.argv || []).find((a) => typeof a === 'string' && a.startsWith(TEMA_ON_EKI))?.slice(TEMA_ON_EKI.length);
// Pencere bir belgeyle açılıyor (0.2.10, pencereler.js): açılış ekranı belge gelene dek gizli kalır (renderer/ilkTema.js)
const ilkBelgeBekleniyor = (process.argv || []).includes('--pdefe-acilis-belgesi');
// Açılış zamanlarının ölçümü istendi (0.2.10, --pdefe-olcum; pencereler.js): arayüz ölçüm işaretlerini yalnızca o zaman yazar (renderer/olcum.js)
const olcum = (process.argv || []).includes('--pdefe-olcum');

contextBridge.exposeInMainWorld('pdefe', {
  cagir: (kanal, ...args) => (CAGRILAR.has(kanal) || testMi(kanal) ? ipcRenderer.invoke(kanal, ...args) : Promise.reject(izinYok(kanal))),
  gonder: (kanal, ...args) => { if (!GONDERIMLER.has(kanal)) throw izinYok(kanal); ipcRenderer.send(kanal, ...args); },
  dinle: (kanal, cb) => {
    if (!DINLEMELER.has(kanal)) throw izinYok(kanal);
    const f = (_e, ...a) => cb(...a);
    ipcRenderer.on(kanal, f);
    return () => ipcRenderer.removeListener(kanal, f);
  },
  dosyaYolu: (dosya) => webUtils.getPathForFile(dosya),
  // İşletim sistemi (0.2.0): 'win32' | 'darwin'. Arayüz macOS'ta kısayolları ⌘ ile işler ve gösterir (renderer/platform.js)
  platform: process.platform,
  // 'koyu' | 'acik' | null (komut satırında yoksa; arayüz o zaman ayarları bekler)
  ilkTema: ilkTema === 'koyu' || ilkTema === 'acik' ? ilkTema : null,
  ilkBelgeBekleniyor,
  olcum,
});
