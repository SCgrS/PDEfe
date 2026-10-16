// Açılış teması (0.2.10): index.html'in head'inde, stillerden ve uygulama.js'ten önce yüklenen sıradan (modül olmayan) betik. Modül
// betikleri ertelenir; uygulama.js temayı ayarları ana süreçten IPC ile sorup öğrendiği için ilk kareler html'deki varsayılan açık temayla
// çiziliyordu (kullanıcı şikâyeti: koyu temada açılışta PDF aç ve araç karoları bir an açık gri, yazıları okunmuyordu). Ana süreç etkin
// temayı pencereyi kurarken verir (pencereler.js additionalArguments → preload.cjs window.pdefe.ilkTema); bu betik onu sayfa çizilmeden
// html'e koyar. Geçişler html'deki 'tema-uygulaniyor' sınıfıyla kapalıdır; sınıfı uygulama.js tema yerleşince kaldırır (temaUygula).
(() => {
  const tema = window.pdefe && window.pdefe.ilkTema;
  if (tema === 'koyu' || tema === 'acik') document.documentElement.dataset.tema = tema;
})();
