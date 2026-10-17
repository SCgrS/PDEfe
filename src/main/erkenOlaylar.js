// Uygulama modülü (anaSurec.js) yüklenmeden gelen olaylar (0.2.10). Giriş (main.js) uygulamayı Chromium'un açılışını bekletmeden yükler
// (GPU sürecinin kurulumu ana süreç kodunun yüklenmesiyle aynı anda yürüsün diye); bu arada gelen dosya açma olayları kaybolmasın:
//   'second-instance': PDEfe açılırken Gezgin'de bir PDF'e daha çift tıklandı (ikinci örnek dosyayı bu örneğe iletti);
//   'open-file' (macOS): Finder'da çift tıklanan PDF; uygulama kapalıyken de 'ready'den önce gelir ve hemen preventDefault ister.
// Olaylar giriş yüklenirken dinlenmeye başlar; anaSurec.js erkenOlaylariBagla ile işleyicilerini verince sıradakiler ve sonrakiler onlara gider.
import { zamanYaz } from './acilisZamanlari.js';

const bekleyenler = [];   // [işleyici adı, ...bağımsız değişkenler]
let isleyiciler = null;

function ilet(ad, ...args) {
  if (isleyiciler) isleyiciler[ad](...args);
  else bekleyenler.push([ad, ...args]);
}

/** Olayları dinlemeye başlar (girişte, tek örnek kilidi alındıktan hemen sonra). */
export function erkenOlaylariTut(app) {
  app.on('second-instance', (_e, argv, cwd) => { zamanYaz('ikinciOrnek'); ilet('ikinciOrnek', argv, cwd); });
  app.on('open-file', (e, yol) => { e.preventDefault(); ilet('dosyaAc', yol); });
}

/** İşleyicileri bağlar: { ikinciOrnek(argv, cwd), dosyaAc(yol) }. Bekleyen olaylar geliş sırasıyla hemen işlenir. */
export function erkenOlaylariBagla(h) {
  isleyiciler = h;
  for (const [ad, ...args] of bekleyenler.splice(0)) h[ad](...args);
}
