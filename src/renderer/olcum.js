// Açılış zamanlarının ölçüm işaretleri (0.2.10, kullanıcı isteği: "PDF'leri doğrudan açtığımızda da biraz daha hızlı açılmasını sağlayabilir
// miyiz"). Arayüz açılışın ve belge açmanın adımlarını performance.mark('pdefe:…') ile yazar; ölçüm betikleri (test/acilis_hizi.mjs,
// test/acilis_davranis.mjs) onları CDP'den okur. İşaretler yalnızca ölçüm istenince yazılır: PDEfe --pdefe-olcum ile başlatıldıysa ana süreç
// bunu pencereye iletir (main/pencereler.js additionalArguments → preload.cjs window.pdefe.olcum). Olağan kullanımda hiç yazılmaz: işaretler
// silinmediği için uzun süre açık kalan pencerede her belge açılışında zaman çizelgesi büyüyordu (0.2.10 inceleme). ilkTema.js (modül değil)
// aynı denetimi kendisi yapar.
export const OLCUM = !!globalThis.pdefe?.olcum;

/** Ölçüm işareti: ad ('pdefe:' öneksiz), no: açılan belgenin numarası (detail; yoksa verilmez). */
export function isaretle(ad, no) {
  if (OLCUM) performance.mark('pdefe:' + ad, no == null ? undefined : { detail: no });
}
