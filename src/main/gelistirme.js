// Geliştirme/test kancaları. main.js'te ayarlar.js'ten ÖNCE içe aktarılır: electron-store veri klasörünü kurulurken okur.
//   PDEFE_VERI_KLASORU  userData (ayarlar, tek örnek kilidi, önbellekler) bu klasöre alınır; kurulu PDEfe ile test
//                       örnekleri birbirinin ayarını ve kilidini paylaşmaz, aynı anda birden çok test örneği çalışabilir.
//   PDEFE_TEST_KONUM    "x,y": pencere bu konumda açılır (ör. "-3000,0" ekran dışı). Windows pencere örtülme hesabı
//                       kapatılır; ekran dışındaki pencere çizmeye ve CDP ekran görüntüsü vermeye devam eder.
//   PDEFE_TEST_BOYUT    "genişlik,yükseklik": pencere boyutu (kayıtlı boyut yerine).
// Paketli uygulamada hiçbiri okunmaz.
import { app } from 'electron';
import fs from 'node:fs';

export const TEST = !app.isPackaged ? {
  veri: process.env.PDEFE_VERI_KLASORU || '',
  konum: (process.env.PDEFE_TEST_KONUM || '').split(',').map(Number).filter(Number.isFinite),
  boyut: (process.env.PDEFE_TEST_BOYUT || '').split(',').map(Number).filter((n) => n > 0),
} : { veri: '', konum: [], boyut: [] };

if (TEST.veri) {
  fs.mkdirSync(TEST.veri, { recursive: true });
  app.setPath('userData', TEST.veri);
}
if (TEST.konum.length === 2) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
