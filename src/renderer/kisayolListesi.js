// Kısayollar listesi: F1'deki Kısayollar penceresi (uygulama.js kisayollarGoster) ve Ayarlar › Kısayollar (0.2.4, kullanıcı isteği:
// "hakkındanın üstüne kısayollar sekmesi olsun") aynı listeyi gösterir; 0.2.3'e dek liste yalnızca uygulama.js'teydi.
// Üç sütun (dar yerde alt alta; stil.css .kisayol-sutunlar): bölüm başlığı tek öğeli dizi; birden çok tuş dizi olarak verilir (tuş kutuları
// arasında satır kırılabilir). Üçüncü sütun araç pencerelerinin fare ve tuş kullanımı: 0.1.13'e dek pencerelerin alt şeridinde yazıyordu
// (kullanıcı isteğiyle buraya taşındı). Tuş adları macOS'ta platform.js tus ile çevrilir (Ctrl → ⌘ …).
import { tus } from './platform.js';

const SUTUNLAR = [[
  ['Dosya ve sekmeler'],
  ['Ctrl+O', 'Aç'], ['Ctrl+T', 'Yeni sekme (açılış sayfası)'], ['Ctrl+S', 'Kaydet'], ['Ctrl+Shift+S', 'Farklı kaydet'], ['Ctrl+P', 'Yazdır'],
  ['Ctrl+W', 'Sekmeyi kapat'], [['Ctrl+PageUp / PageDown', 'Ctrl+← / →'], 'Önceki / sonraki sekme'],
  ['Ctrl+Tab / Ctrl+Shift+Tab', 'Son kullanılan sekmeye geç (basılı tutunca seçici; içinde ← →)'],
  ['Ctrl+1 – Ctrl+9', 'Sekme seç (9: son sekme)'],
  ['Sekmeyi sürükle', 'Sırala; sekme çubuğunun dışına bırakınca belge kendi penceresinde açılır'],
  ['Düzen'],
  ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'], ['Ctrl+F', 'Bul'], ['F3 / Shift+F3', 'Sonraki / önceki eşleşme'],
  ['Ctrl+A', 'Sayfadaki tüm metni seç'], ['Delete', 'Seçili notu sil'], ['Ctrl+,', 'Ayarlar'],
  ['Genel'],
  ['F1', 'Kısayollar'], ['Esc', 'Kapat / vazgeç'],
], [
  ['Gezinme'],
  ['Ctrl+G', 'Sayfaya git'], ['← →', 'Önceki / sonraki sayfa (yakınlaştırılmışsa önce yana kaydırır)'],
  ['PageUp / PageDown', 'Önceki / sonraki sayfa (kaydırma kapalıyken önce bir ekran)'],
  ['↑ ↓', 'Kaydır (kaydırma kapalıyken sayfa sonunda çevirir)'], ['Boşluk / Shift+Boşluk', 'Bir ekran aşağı / yukarı kaydır'],
  ['Home / End', 'İlk / son sayfa'], ['Ctrl+Home / End', 'Belge başı / sonu'], ['Shift+Fare tekerleği', 'Yatay kaydırma'],
  ['Görünüm'],
  [['Ctrl+Fare tekerleği', 'Ctrl++ / Ctrl+−'], 'Yakınlaştır / uzaklaştır'], ['Ctrl+0', 'Gerçek boyut'],
  ['Ctrl+R / Ctrl+Shift+R', 'Geçerli sayfayı saat yönünde / tersine döndür'], ['F4', 'Sol panel'], ['Ctrl+H', 'Okuma modu'], ['F11', 'Tam ekran'],
  ['Yazı kutusu'],
  ['Ctrl+B / I / U', 'Kalın / italik / altı çizili'], ['Esc', 'Düzenlemeyi bitir (yazılan korunur)'],
], [
  ['Sayfaları düzenle'],
  ['Tıkla', 'Sayfayı seç'], ['Ctrl+tık / Shift+tık', 'Seçime ekle / aralığı seç'], ['Boş alandan sürükle', 'Alandaki sayfaları seç'],
  ['Sayfayı sürükle', 'Sırala (seçiliyse seçilenler birlikte)'], ['Delete', 'Seçilenleri sil'], ['Ctrl+A', 'Tümünü seç'],
  [['← → ↑ ↓', 'Home / End'], 'Sayfalar arasında gez (Shift ile seçimi genişlet)'], ['R / Shift+R', 'Seçilenleri sağa / sola döndür'],
  ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'],
  ['Görüntü / PDF birleştir'],
  ['Tıkla', 'Dosyayı seç'], ['Ctrl+tık / Shift+tık', 'Seçime ekle / aralığı seç'],
  [['Sağ tuşla sürükle', 'Boş alandan sürükle'], 'Alandaki dosyaları seç'], ['Satırı sürükle', 'Sırala (seçiliyse seçilenler birlikte)'],
  ['Delete', 'Seçilenleri çıkar'], ['Ctrl+A', 'Tümünü seç'], ['Ctrl+V', 'Panodaki dosyaları ya da görüntüyü ekle'],
]];

/** Kısayol tablolarının HTML'i (<div class="kisayol-sutunlar">, içinde sütun başına <table class="kisayollar">). Metinler sabittir. */
export function kisayolTablolariHtml() {
  const satir = ([k, a]) => (a == null ? `<tr class="bolum"><th colspan="2">${k}</th></tr>`
    : `<tr><td>${[].concat(k).map((t) => `<kbd>${tus(t)}</kbd>`).join(' ')}</td><td>${a}</td></tr>`);
  return '<div class="kisayol-sutunlar">' + SUTUNLAR.map((s) => '<table class="kisayollar">' + s.map(satir).join('') + '</table>').join('') + '</div>';
}
