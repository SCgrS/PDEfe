// PDEfe ana süreç girişi (0.2.10, kullanıcı isteği: "PDF'leri doğrudan açtığımızda da biraz daha hızlı açılmasını sağlayabilir miyiz").
// Uygulamanın kendisi anaSurec.js'tedir; bu modül yalnızca tek örnek kilidini alır ve onu yükler. Ölçülen iki darboğaz (test/acilis_hizi.mjs,
// PLAN.md "Revizyon 0.2.10"):
//  - İkinci örnek: Gezgin'de bir PDF'e çift tıklamak PDEfe açıkken yeni bir PDEfe süreci başlatır; o, dosyayı kilit yoluyla açık PDEfe'ye
//    ('second-instance') iletip çıkmalıdır. 0.2.9'a dek kilit bütün modüller (güncelleyici, ayar deposu, araçlar…) yüklendikten sonra
//    alınıyordu (~130 ms) ve ikinci örnek app.quit()'ten sonra da açılışını sürdürüyordu: 'ready'de pencere kurup çekirdeği (Python)
//    başlatıyor, ~2,3 sn yaşıyor, açık PDEfe'yle işlemciyi paylaşıyordu. Şimdi kilidi alamayan örnek hiçbir şey yüklemeden çıkar.
//  - Soğuk açılış: Electron, giriş modülü (üst düzey await'iyle) bitene dek Chromium'un açılışını bekletir; GPU süreci ancak ondan sonra
//    başlatılıyordu. GPU sürecinin kurulumu (ekran kartı sürücüsü, ~0,4 sn) pencerenin ilk çizimini, dolayısıyla 'ready-to-show'u ve
//    PDF.js'in ekran karesi bekleyen sayfa çizimini belirliyordu. anaSurec.js artık beklenmeden yüklenir: GPU sürecinin kurulumu ana süreç
//    kodunun yüklenmesiyle aynı anda yürür. 'ready'den önce yapılması gerekenler (veri klasörü, protokol ayrıcalıkları) burada yapılır;
//    anaSurec.js yüklenmeden gelen dosya açma olayları erkenOlaylar.js'te bekler.
import './acilisZamanlari.js';   // ilk: açılış zamanları öteki modüllerin yüklenmesinden önce başlar
import { app, protocol } from 'electron';
import './gelistirme.js';        // test örneğinin veri klasörü (PDEFE_VERI_KLASORU) kilitten önce kurulur: kilit veri klasöründedir
import { erkenOlaylariTut } from './erkenOlaylar.js';

if (!app.requestSingleInstanceLock()) {
  app.exit(0);   // dosya açık örneğe iletildi; hazırlık (mesaj döngüsü) başlamadan çıkılır, pencere ve çekirdek kurulmaz
} else {
  // pdefe:// (arayüzün kendi dosyaları; anaSurec.js protokolKur): ayrıcalıklar 'ready'den önce verilmeli
  protocol.registerSchemesAsPrivileged([
    { scheme: 'pdefe', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ]);
  erkenOlaylariTut(app);
  // Beklenmez (yukarıda) ve bir sonraki görevde başlar: giriş modülünün değerlendirmesinin hemen ardından (mikro görev olarak) başlayan
  // dinamik içe aktarma da modül ağacının tamamını Chromium'un açılışından önce yüklüyordu (ölçüldü). setImmediate'in görevi Chromium'un
  // açılış görevlerinden (GPU sürecinin başlatılması dâhil) sonra çalışır. Yüklenemezse Electron'un ana süreç hata kutusu (üst düzey
  // await'teki gibi)
  setImmediate(() => import('./anaSurec.js').catch((e) => process.emit('uncaughtException', e)));
}
