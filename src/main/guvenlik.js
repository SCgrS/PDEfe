// Ana süreç güvenlik yardımcıları (0.1.23, güvenlik denetimi). Arayüz (renderer) yalıtılmış çalışır: sandbox, contextIsolation, sıkı
// CSP; PDF içindeki JavaScript çalışmaz. Buradaki denetimler bir katman daha ekler: PDF'i çizen bileşende ileride bir açık çıkıp arayüzde
// kod çalışsa bile ana süreç her dosyayı okuyup silmez, program çalıştırmaz, uygulamanın dışındaki bir sayfaya köprü (preload) açmaz.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAC = process.platform === 'darwin';

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
/** Sistemin yazı tipi klasörleri (renderer/yaziTipleri.js gömülü olmayan standart yazı tiplerini buradan okur): Windows'ta Windows\Fonts;
 *  macOS'ta (0.2.0) sistemle gelen Arial / Times New Roman / Courier New'ün klasörü (Supplemental), sistem ve kullanıcı yazı tipleri. */
export function yaziTipiKlasorleri() {
  if (MAC) return ['/System/Library/Fonts/Supplemental', '/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts')];
  return [path.join(process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows', 'Fonts')];
}

// PDF.js'in gömülü olmayan standart fontları (Times, Helvetica, Courier) yerine okunan sistem fontları: anahtar Windows dosya adı
// (renderer/yaziTipleri.js STANDART_DOSYALAR), değer macOS'taki dosya adı (Supplemental klasöründe)
const MAC_STANDART = {
  'times.ttf': 'Times New Roman.ttf', 'timesbd.ttf': 'Times New Roman Bold.ttf', 'timesi.ttf': 'Times New Roman Italic.ttf',
  'timesbi.ttf': 'Times New Roman Bold Italic.ttf', 'arial.ttf': 'Arial.ttf', 'arialbd.ttf': 'Arial Bold.ttf', 'ariali.ttf': 'Arial Italic.ttf',
  'arialbi.ttf': 'Arial Bold Italic.ttf', 'cour.ttf': 'Courier New.ttf', 'courbd.ttf': 'Courier New Bold.ttf', 'couri.ttf': 'Courier New Italic.ttf',
  'courbi.ttf': 'Courier New Bold Italic.ttf',
};

/** Standart fontların bu sistemdeki tam yolları: { 'times.ttf': '<yol>', … } (uygulama:klasorler → renderer/yaziTipleri.js). */
export function standartYaziTipleri() {
  const [klasor] = yaziTipiKlasorleri();
  return Object.fromEntries(Object.entries(MAC_STANDART).map(([win, mac]) => [win, path.join(klasor, MAC ? mac : win)]));
}

const ayniYol = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Yol sistemin yazı tipi klasörlerinden birinde bir yazı tipi dosyası mı (alt klasör yok). */
export function yaziTipiDosyasiMi(yol) {
  const y = String(yol || '');
  return !!y && /\.(ttf|ttc|otf)$/i.test(y) && yaziTipiKlasorleri().some((k) => ayniYol(path.dirname(path.resolve(y)), k));
}

/** Dosyanın başında (ilk 64 KB; başına e-posta ağ geçidi gibi araçların eklediği başlıklar olabilir) PDF imzası (%PDF-) var mı.
 *  Dosya okunamazsa (yok, başka programda kilitli) hata fırlatır: çağıran olağan okuma hatasını göstersin, "PDF değil" demesin. */
export async function pdfDosyasiMi(yol) {
  const fh = await fs.promises.open(String(yol), 'r');
  try {
    const bas = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fh.read(bas, 0, bas.length, 0);
    return bas.subarray(0, bytesRead).includes('%PDF-');
  } finally { await fh.close().catch(() => {}); }
}

/** Yol, anlık kopya klasöründeki bir anlık kopya mı (çekirdeğin adlandırması: 32 onaltılık karakter + .pdf). */
export function anlikDosyasiMi(yol, anlikKlasor) {
  const y = String(yol || '');
  return !!y && ayniYol(path.dirname(path.resolve(y)), anlikKlasor) && /^[0-9a-f]{32}\.pdf$/i.test(path.basename(y));
}

/** Hedef verilmezse yol'a (açık belgenin kendisine) yazan çekirdek yöntemleri (0.2.1); ayir yalnızca uzerine ile. Bu yöntemler hedefsiz
 *  de denetlenir (main.js cekirdek:cagir). */
export const YOLA_YAZANLAR = new Set(['notlar_kaydet', 'yapisal_kaydet', 'sayfalar_uygula', 'kucult', 'dondur_kaydet', 'ayir']);

/**
 * Çekirdek çağrısının parametreleri (renderer'dan gelir) denetlenir, gerekirse düzeltilir; izin verilmeyen çağrıda hata fırlatır.
 *  - yazılacak dosya (hedef; hedef verilmezse YOLA_YAZANLAR'da yol): çekirdek yalnızca .pdf uzantılı dosyaya ya da zaten var olan bir PDF'in
 *    üzerine (uzantısı başka olsa da: "Tüm dosyalar" süzgeciyle açılıp kaydedilen belge) yazar. PDF baytları .bat/.cmd gibi bir dosyaya
 *    yazılıp çalıştırılmasın: notun /Contents'indeki "&komut&" komut satırında çalışırdı. 0.2.1: önceden yalnızca hedef denetleniyordu;
 *    yapisal_kaydet ve sayfalar_uygula hedefsiz çağrılınca var olması gerekmeyen yol'a yazıyordu.
 *  - yapisal_kaydet: anlık kopyanın klasörünü ana süreç verir (renderer'ın verdiği yok sayılır).
 *  - anlik_sil: yalnızca anlık kopya klasöründeki anlık kopyalar silinir.
 */
export async function cekirdekParametreleri(yontem, params, anlikKlasor) {
  const p = params && typeof params === 'object' && !Array.isArray(params) ? { ...params } : {};
  const yazilacak = p.hedef != null ? p.hedef : (YOLA_YAZANLAR.has(yontem) && (yontem !== 'ayir' || p.uzerine) ? p.yol : null);
  if (yazilacak != null && !/\.pdf$/i.test(String(yazilacak)) && !(await pdfDosyasiMi(yazilacak).catch(() => false))) {
    throw new Error('Yalnızca .pdf uzantılı dosyaya yazılabilir.');
  }
  if (yontem === 'yapisal_kaydet') p.anlikKlasor = anlikKlasor;
  if (yontem === 'anlik_sil' && !anlikDosyasiMi(p.yol, anlikKlasor)) throw new Error('İzin verilmeyen istek.');
  return p;
}
