// Sürüklenen sekmenin önizleme penceresi (hayalet.html): içeriği ana süreç gönderir (main/pencereler.js hayaletiGoster).
// { ad: sekmenin adı, onizleme: geçerli sayfanın küçük görüntüsü (data URL; yoksa ''), koyu: koyu tema }
window.pdefe.dinle('hayalet:icerik', (icerik) => {
  document.documentElement.dataset.tema = icerik?.koyu ? 'koyu' : 'acik';
  document.getElementById('ad').textContent = icerik?.ad || '';
  const resim = document.getElementById('onizleme');
  if (icerik?.onizleme) { resim.src = icerik.onizleme; resim.hidden = false; } else { resim.removeAttribute('src'); resim.hidden = true; }
});

// Ekran kareleri (0.2.7): sürükleme sürerken her ekran karesinde ana sürece 'hayalet:kare' gider, ana süreç imlecin yerini okuyup pencereyi
// taşır. Böylece ön izleme ekran tazelemesiyle aynı düzende kayar (ana süreçteki zamanlayıcı Windows'ta ~31 ms'de bir çalışıyordu). İçerik
// bir kez çizilir; kareler yalnızca zamanlama içindir.
let kareler = false;
const kare = () => {
  if (!kareler) return;
  window.pdefe.gonder('hayalet:kare');
  requestAnimationFrame(kare);
};
window.pdefe.dinle('hayalet:kareler', (acik) => {
  const onceki = kareler;
  kareler = !!acik;
  if (kareler && !onceki) requestAnimationFrame(kare);
});
