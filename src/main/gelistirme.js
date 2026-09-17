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

/**
 * Test örneğinde (PDEFE_TEST_KONUM verilmiş) yerel diyaloglar (mesaj kutusu, aç/kaydet/klasör, açılır menü) gösterilmez: pencere ekran
 * dışında olsa da Windows bunları görünen ekrana açar ve bilgisayarı kullanan kişiyi rahatsız eder. Yanıt, testin önceden kuyruğa
 * koyduğu değerden (test:diyalogYanitlari) ya da varsayılandan gelir; her diyalog test:diyalogKaydi ile okunur.
 * Döner: test örneği değilse null, yoksa (kanal, secenek, varsayilanYanit) => yanıt.
 */
export function testDiyalogKur(ipcMain) {
  if (TEST.konum.length !== 2) return null;
  const kuyruk = new Map();   // kanal → [yanıt, …]
  let kayit = [];
  ipcMain.handle('test:diyalogYanitlari', (_e, kanal, yanitlar) => { kuyruk.set(kanal, [...(kuyruk.get(kanal) || []), ...yanitlar]); return true; });
  ipcMain.handle('test:diyalogKaydi', () => { const k = kayit; kayit = []; return k; });
  return (kanal, secenek, varsayilanYanit) => {
    const bekleyen = kuyruk.get(kanal);
    const yanit = bekleyen?.length ? bekleyen.shift() : varsayilanYanit;
    kayit.push({ kanal, secenek, yanit });
    console.log('[test diyaloğu]', kanal, JSON.stringify(secenek)?.slice(0, 300), '→', JSON.stringify(yanit));
    return yanit;
  };
}

if (TEST.veri) {
  fs.mkdirSync(TEST.veri, { recursive: true });
  app.setPath('userData', TEST.veri);
}
if (TEST.konum.length === 2) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
