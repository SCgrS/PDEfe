// Sürüklenen sekmenin önizleme penceresi (hayalet.html): içeriği ana süreç gönderir (main/pencereler.js hayaletiGoster).
// { ad: sekmenin adı, onizleme: geçerli sayfanın küçük görüntüsü (data URL; yoksa ''), koyu: koyu tema }
window.pdefe.dinle('hayalet:icerik', (icerik) => {
  document.documentElement.dataset.tema = icerik?.koyu ? 'koyu' : 'acik';
  document.getElementById('ad').textContent = icerik?.ad || '';
  const resim = document.getElementById('onizleme');
  if (icerik?.onizleme) { resim.src = icerik.onizleme; resim.hidden = false; } else { resim.removeAttribute('src'); resim.hidden = true; }
});
