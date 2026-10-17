// PDEfe açılamadı (0.2.10 inceleme). Giriş (main.js) tek örnek kilidini uygulama modülünü (anaSurec.js) yüklemeden önce alır. Modül
// yüklenemezse (bozuk kurulum, ileride yanlış adlı bir içe aktarma) ya da açılış ilk pencereden önce hata verirse (ayar dosyası okunamadı…)
// Electron'un varsayılan davranışı (hata kutusu, süreç açık kalır) penceresiz bir süreç bırakıyordu: kilidi tuttuğu için Gezgin'de çift
// tıklanan her PDF ona iletilip sessizce kayboluyor, PDEfe Görev Yöneticisi'nden kapatılana dek "açılmıyor"du. Burada kilit bırakılır,
// hata kutusu gösterilir, Tamam'dan sonra süreç çıkar.
import { app, dialog } from 'electron';
import { TEST } from './gelistirme.js';

let gosterildi = false;

/** Açılışı sürdüremeyen hata: tek örnek kilidini bırakır, "PDEfe açılamadı" kutusunu gösterir, çıkar (kod 1). e.kullaniciIletisi
 *  varsa kutunun ilk satırı odur (ör. ayarlar.js: ayar dosyası okunamadı), yoksa genel ileti; altında hatanın ayrıntısı. */
export function acilisHatasi(e) {
  if (gosterildi) return;
  gosterildi = true;
  console.error('[PDEfe] açılamadı:', e);
  // Kutu açıkken Gezgin'de çift tıklanan PDF bu sürece iletilip kaybolmasın: yeni süreç ilk örnek olur, açılmayı kendisi dener
  try { app.releaseSingleInstanceLock(); } catch { /* kilit yok */ }
  const ozet = e?.kullaniciIletisi || 'PDEfe başlatılırken bir hata oluştu. PDEfe\'yi yeniden açmayı deneyin; sorun sürerse PDEfe\'yi yeniden kurun.';
  // Ekran dışındaki test örneğinde (PDEFE_TEST_KONUM) kutu gösterilmez: Windows onu görünen ekrana açardı (gelistirme.js testDiyalogKur gibi)
  if (TEST.konum.length !== 2) {
    // showErrorBox 'ready'den önce de güvenli; kutu kapanana dek bekler
    const neden = e?.cause ? `\n\nNeden:\n${String(e.cause?.stack || e.cause)}` : '';
    try { dialog.showErrorBox('PDEfe açılamadı', `${ozet}\n\nAyrıntı:\n${String(e?.stack || e)}${neden}`); } catch { /* gösterilemedi */ }
  }
  app.exit(1);
}
