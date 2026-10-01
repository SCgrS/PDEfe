// Ana süreç güvenlik yardımcıları (0.1.23, güvenlik denetimi). Arayüz (renderer) yalıtılmış çalışır: sandbox, contextIsolation, sıkı
// CSP; PDF içindeki JavaScript çalışmaz. Buradaki denetimler bir katman daha ekler: PDF'i çizen bileşende ileride bir açık çıkıp arayüzde
// kod çalışsa bile ana süreç her dosyayı okuyup silmez, program çalıştırmaz, uygulamanın dışındaki bir sayfaya köprü (preload) açmaz.
import fs from 'node:fs';
import path from 'node:path';

/** Dışarıda (tarayıcıda, e-posta uygulamasında) açılabilecek adres türleri. shell.openExternal adresi Windows'ta ShellExecute'a verir:
 *  file:, search-ms:, ms-…: gibi türler program çalıştırabilir, uzak ağ paylaşımına bağlanıp Windows oturumunun parola özetini
 *  gönderebilir. PDF'teki bağlantılar güvenilmeyen girdidir. */
const DIS_TURLER = new Set(['http:', 'https:', 'mailto:']);

/** Adres dışarıda açılabilir mi (yalnızca http, https, mailto; büyük/küçük harf fark etmez). */
export function disAdresMi(adres) {
  try { return DIS_TURLER.has(new URL(String(adres)).protocol); } catch { return false; }
}

// ---------------------------------------------------------------- IPC: yalnızca uygulamanın kendi sayfaları
const UYGULAMA_KOKU = 'pdefe://app/';

/** IPC isteği uygulamanın kendi sayfasından mı geldi (pdefe://app/…; çerçevesi kapanmış istek sayılmaz). */
export function uygulamaSayfasiMi(e) {
  try { return String(e?.senderFrame?.url || '').startsWith(UYGULAMA_KOKU); } catch { return false; }
}

/** ipcMain'in yerine geçen sarmalayıcı (handle / on): uygulamanın sayfası dışından gelen istek işlenmez, handle reddedilir. Bütün
 *  modüllere ipcMain yerine bu verilir (main.js). */
export function guvenliIpc(ipcMain) {
  return {
    handle(kanal, isleyici) {
      ipcMain.handle(kanal, (e, ...a) => {
        if (!uygulamaSayfasiMi(e)) throw new Error('İzin verilmeyen istek.');
        return isleyici(e, ...a);
      });
    },
    on(kanal, dinleyici) {
      ipcMain.on(kanal, (e, ...a) => { if (uygulamaSayfasiMi(e)) dinleyici(e, ...a); });
    },
  };
}

/** Bütün webContents'lerde uygulama dışına gezinme ve gömülü sayfa (webview) engellenir. Yazdırma penceresi geçici HTML'i ana süreçten
 *  loadFile ile yükler (bu bir gezinme olayı değildir); sayfanın kendisi başka yere gidemez. Bir sayfa (bağlantı, form, location)
 *  pdefe://app/ dışına gitmeye kalkarsa durdurulur: önyükleme köprüsü (preload) başka bir sayfaya açılmasın. */
export function gezinmeKorumasiKur(app) {
  app.on('web-contents-created', (_e, wc) => {
    const engelle = (olay, url) => { if (!String(url || '').startsWith(UYGULAMA_KOKU)) olay.preventDefault(); };
    wc.on('will-navigate', (olay, url) => engelle(olay, url));
    wc.on('will-frame-navigate', (olay) => engelle(olay, olay.url));
    wc.on('will-redirect', (olay, url) => engelle(olay, url));
    wc.on('will-attach-webview', (olay) => olay.preventDefault());
  });
}

// ---------------------------------------------------------------- dosya yolları
/** Windows yazı tipi klasörü (renderer/yaziTipleri.js gömülü olmayan standart yazı tiplerini buradan okur). */
export function yaziTipiKlasoru() {
  return path.join(process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows', 'Fonts');
}

const ayniYol = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Yol Windows yazı tipi klasöründe bir yazı tipi dosyası mı (alt klasör yok). */
export function yaziTipiDosyasiMi(yol) {
  const y = String(yol || '');
  return !!y && ayniYol(path.dirname(path.resolve(y)), yaziTipiKlasoru()) && /\.(ttf|ttc|otf)$/i.test(y);
}

/** Dosyanın başında (ilk 1024 bayt) PDF imzası (%PDF-) var mı. Okunamazsa false. */
export async function pdfDosyasiMi(yol) {
  let fh = null;
  try {
    fh = await fs.promises.open(String(yol), 'r');
    const bas = Buffer.alloc(1024);
    const { bytesRead } = await fh.read(bas, 0, bas.length, 0);
    return bas.subarray(0, bytesRead).includes('%PDF-');
  } catch { return false; } finally { await fh?.close().catch(() => {}); }
}

/** Yol, anlık kopya klasöründeki bir anlık kopya mı (çekirdeğin adlandırması: 32 onaltılık karakter + .pdf). */
export function anlikDosyasiMi(yol, anlikKlasor) {
  const y = String(yol || '');
  return !!y && ayniYol(path.dirname(path.resolve(y)), anlikKlasor) && /^[0-9a-f]{32}\.pdf$/i.test(path.basename(y));
}

/**
 * Çekirdek çağrısının parametreleri (renderer'dan gelir) denetlenir, gerekirse düzeltilir; izin verilmeyen çağrıda hata fırlatır.
 *  - hedef: çekirdeğin yazdığı dosya yalnızca .pdf uzantılı olabilir (PDF baytları .bat/.cmd gibi bir dosyaya yazılıp çalıştırılmasın).
 *  - yapisal_kaydet: anlık kopyanın klasörünü ana süreç verir (renderer'ın verdiği yok sayılır).
 *  - anlik_sil: yalnızca anlık kopya klasöründeki anlık kopyalar silinir.
 */
export function cekirdekParametreleri(yontem, params, anlikKlasor) {
  const p = params && typeof params === 'object' && !Array.isArray(params) ? { ...params } : {};
  if (p.hedef != null && !/\.pdf$/i.test(String(p.hedef))) throw new Error('Yalnızca .pdf uzantılı dosyaya yazılabilir.');
  if (yontem === 'yapisal_kaydet') p.anlikKlasor = anlikKlasor;
  if (yontem === 'anlik_sil' && !anlikDosyasiMi(p.yol, anlikKlasor)) throw new Error('İzin verilmeyen istek.');
  return p;
}
