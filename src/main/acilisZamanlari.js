// Açılış zaman çizelgesi (0.2.10, kullanıcı isteği: "PDF'leri doğrudan açtığımızda da biraz daha hızlı açılmasını sağlayabilir miyiz").
// Ana süreç açılışın ve belge açmanın adımlarını (uygulama hazır, pencere kuruldu, gösterildi, arayüz hazır, dosya gönderildi, ikinci örnek,
// çekirdek hazır) duvar saatiyle (ms, yüksek çözünürlüklü) yazar; arayüz kendi adımlarını performance.mark ile ('pdefe:…') yazar. Ölçüm
// betiği (test/acilis_hizi.mjs) ikisini 'uygulama:acilisZamanlari' kanalından ve CDP'den okur; paketli sürümde de çalışır (test değişkenleri
// paketli uygulamada okunmaz). Kişisel veri yok: yalnızca adım adları ve zamanlar. En çok EN_FAZLA kayıt tutulur (uzun oturumda ikinci
// örnekle açılan her belge birkaç kayıt ekler; eskiler düşer).
// Bu modül hiçbir şey içe aktarmaz: giriş modülü (main.js) onu ilk iş yükler, süreç başındaki zamanlar öteki modüllerin yüklenmesini beklemez.
const EN_FAZLA = 300;
const kayitlar = [];

/** Şimdiki zaman, duvar saati (ms; performance.timeOrigin + now: Date.now'dan ince, arayüzün performance zamanlarıyla aynı ölçekte). */
export const simdi = () => performance.timeOrigin + performance.now();

/** Adımı yazar. ek: küçük, kişisel veri içermeyen bilgi (pencere kimliği, dosya sayısı). */
export function zamanYaz(ad, ek = undefined) {
  kayitlar.push(ek === undefined ? { ad, t: simdi() } : { ad, t: simdi(), ek });
  if (kayitlar.length > EN_FAZLA) kayitlar.splice(0, kayitlar.length - EN_FAZLA);
}

/** Ölçüm betiği için: Node'un süreç başı zamanları (performance.nodeTiming, timeOrigin'e göre ms) ve yazılan adımlar. */
export function zamanlariAl() {
  const n = performance.nodeTiming || {};
  return {
    kok: performance.timeOrigin,
    node: { nodeStart: n.nodeStart, v8Start: n.v8Start, environment: n.environment, bootstrapComplete: n.bootstrapComplete },
    kayitlar: kayitlar.slice(),
  };
}

zamanYaz('acilisModulu');
