// Açılış teması (0.2.10): index.html'in head'inde, stillerden ve uygulama.js'ten önce yüklenen sıradan (modül olmayan) betik. Modül
// betikleri ertelenir; uygulama.js temayı ayarları ana süreçten IPC ile sorup öğrendiği için ilk kareler html'deki varsayılan açık temayla
// çiziliyordu (kullanıcı şikâyeti: koyu temada açılışta PDF aç ve araç karoları bir an açık gri, yazıları okunmuyordu). Ana süreç etkin
// temayı pencereyi kurarken verir (pencereler.js additionalArguments → preload.cjs window.pdefe.ilkTema); bu betik onu sayfa çizilmeden
// html'e koyar. Geçişler html'deki 'tema-uygulaniyor' sınıfıyla kapalıdır; sınıfı uygulama.js tema yerleşince kaldırır (temaUygula).
(() => {
  // Açılış zamanları (0.2.10, olcum.js): yalnızca ölçüm istenince (--pdefe-olcum); sayfanın başı
  const olcum = !!(window.pdefe && window.pdefe.olcum);
  if (olcum) performance.mark('pdefe:html');
  const tema = window.pdefe && window.pdefe.ilkTema;
  if (tema === 'koyu' || tema === 'acik') document.documentElement.dataset.tema = tema;
  // 0.2.10: pencere Gezgin'de çift tıklanan bir belgeyle açılıyor; açılış ekranı belgenin sekmesi açılana dek gizli (stil.css, uygulama.js
  // acilisBeklemesiniBitir). Pencere artık arayüz hazır olmadan da görünebiliyor; açılış ekranı bir an görünüp belgeye dönmesin
  if (window.pdefe && window.pdefe.ilkBelgeBekleniyor) {
    document.documentElement.classList.add('belge-bekleniyor');
    if (olcum) performance.mark('pdefe:belgeBekleniyor');
  }
})();
