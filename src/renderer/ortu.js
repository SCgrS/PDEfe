// Uygulama içi açılır pencerelerin örtüsü (pencerenin arkasındaki karartılmış alan): örtüye tıklamak pencereyi Esc ya da Kapat (X)
// ile aynı biçimde kapatır. Kullananlar: Ayarlar, Yazdır (seçenekler ve hazırlık), uygulama.js diyalogları (F1, parola), Ctrl+Tab
// seçicisi. Araç pencereleri (araclar/ortak.js Pencere) aynı kuralı kendi içinde uygular.

/**
 * Örtünün kendisine sol tuşla tıklanınca kapat(e) çağrılır. Basış da bırakış da örtünün kendisinde olmalıdır: pencerenin içinde
 * başlayıp dışarıda biten metin seçimi ya da sürükleme (tarayıcı bu tıklamayı ortak ata öğeye, yani örtüye gönderir), örtüde başlayıp
 * pencerede biten basış, sağ ve orta tık kapatmaz. Örtüler üst üste açıksa (ör. araç penceresinin üstünde F1) tıklamayı en üstteki
 * alır; yalnızca o kapanır. Çok tıklamanın ikinci ve sonraki tıkları (e.detail > 1) da kapatmaz: pencereyi açan düğmeye ya da
 * açılış ekranındaki imzaya çift tıklanınca ilk tık pencereyi açar, ikinci tık pencerenin dışındaki örtüye düşer ve pencere hemen
 * kapanıyordu (0.1.15). Dışarıya bilerek yapılan tıklama yeni bir tıklama dizisidir (detail 1).
 * @param {HTMLElement} ortu
 * @param {(e: MouseEvent) => void} kapat
 */
export function ortuTiklamasiBagla(ortu, kapat) {
  let basildi = false, birakildi = false;
  ortu.addEventListener('pointerdown', (e) => { basildi = e.target === ortu && e.button === 0 && e.isPrimary; birakildi = false; });
  ortu.addEventListener('pointerup', (e) => { birakildi = basildi && e.target === ortu && e.button === 0; });
  ortu.addEventListener('click', (e) => {
    const disari = basildi && birakildi && e.target === ortu && e.button === 0 && e.detail <= 1;
    basildi = birakildi = false;
    if (disari) kapat(e);
  });
}
