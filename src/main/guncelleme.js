// Otomatik güncelleme (electron-updater, GitHub Releases: SCgrS/PDEfe → latest.yml + PDEfe-Setup.exe).
//
// Otomatik denetim haftada bir yapılır (0.1.8; önceden 10 açılışta bir): son başarılı denetimden (sonDenetimZamani) bu yana 7 gün
// geçtiyse açılışta, pencere gösterildikten ACILIS_GECIKMESI_MS sonra, arka planda; PDEfe günlerce açık kalırsa saatte bir bakılır ve
// süre dolunca yine denetlenir. Hiç denetlenmemişse (kurulumdan ya da 0.1.7 ve öncesinden sonraki ilk açılış) hemen denetlenir.
// Ağ hatası sessizce geçilir ve süreyi başlatmaz: sunucudan yanıt alınamazsa (ağ yok, sunucu hatası) bir sonraki açılışta ya da en geç
// bir saat sonra yeniden denenir. Ayarlar › Güncelleme'deki otoGuncelle kapalıysa otomatik denetim yapılmaz. Elle denetim (Yardım ›
// Güncellemeleri denetle, Ayarlar) süreye bakmaz; başarılıysa haftalık süre ondan başlar. Saat geri alınmışsa (son denetim gelecekte)
// denetlenir. Süre yalnızca uygulamanın gerçek başlangıcında (tek örnek) izlenir.
// İndirilip kurulmamış sürüm (kaydedilmemiş belge sorusunda Vazgeç, sonra PDEfe kapatıldı) bekleyenGuncelleme'de tutulur: sonraki
// açılışta süreye bakılmadan bir kez denetlenir, şerit yeniden görünür; paket önbellekte olduğundan Güncelle yeniden indirmeden kurar.
// 0.2.5: indirmesi başlayan sürüm de oraya yazılır. İndirme yarıda kalırsa (PDEfe kapatıldı, bağlantı koptu) sonraki açılışta şerit yeniden
// görünür; önceden bir haftalık denetim sırasını bekliyordu. electron-updater yarım indirmeyi sürdürmez: yeniden indirmede baştan başlar
// (önbellekte önceki sürümün kurucusu varsa yalnızca değişen bloklar iner). Yarım kalan geçici dosya ("temp-…") ve kurulmuş sürümün
// önbellekte kalan kurucusu açılışta silinir (önbellekTemizle; değişen blokların karşılaştırıldığı installer.exe ve current.blockmap kalır).
// İndirme sırasında INDIRME_BEKLEME_MS boyunca hiç veri gelmezse (bağlantı hata vermeden donmuş) indirme kesilir ve hata olarak bildirilir:
// Electron'un ağ isteğinde electron-updater'ın zaman aşımı çalışmıyor, şerit "indiriliyor %N"de sonsuza dek kalabiliyordu.
//
// Tek tıkla güncelleme (renderer/guncelleme.js): 'guncelleme:indir' → kaydedilmemiş değişiklikler sorulur → 'guncelleme:kur' →
// quitAndInstall(isSilent=true, isForceRunAfter=true). Bu yardımlı (oneClick: false) NSIS kurucusunda yalnızca bu ikili sessizdir:
// electron-updater kurucuyu "--updated /S --force-run" ile başlatır; sihirbaz penceresi açılmaz, kurulum bitince installSection.nsh
// ("isForceRun ve Silent") PDEfe'yi yeniden başlatır. isSilent=false verilirse /S geçilmez; 0.1.2 ve öncesi böyle çağırıyordu
// ("--updated --force-run"). O sürümlerden geçişte de sihirbaz görünmesin diye build/installer.nsh "--updated" ile başlatılan
// kurucuyu kendisi sessize alır (customInit, SetSilent).
//
// Kullanım (main.js):
//   const guncelleme = guncellemeKur({ app, ipcMain, autoUpdater, pencereyeGonder, ayarAl, ayarKoy, ilkOrnek,
//                                      kapatmayaHazirla: () => kapatmaOnayiAyarla(true), kapatmaIptal: () => kapatmaOnayiAyarla(false) });
//   pencere.once('show', () => guncelleme.pencereGosterildi());   // açılış denetimi ve saatlik bakış buradan başlar
// pencereyeGonder bütün pencerelere gönderir (0.1.19: birden çok pencere; şerit hepsinde görünür). Kurulumdan önce "Güncelle"ye
// basılan pencere kendi belgelerini, sonra öteki pencerelerinkini sorar (renderer kapatmadanOnce, pencereler.js digerlerindenIzinAl).
//
// Renderer'a giden olaylar:
//   'guncelleme:var'      {surum, mevcut, notlar, tarih, elle}   (elle: kullanıcı denetledi; "Daha sonra" ile gizlenmiş şerit yeniden görünür)
//   'guncelleme:ilerleme' {yuzde, aktarilan, toplam, hiz}
//   'guncelleme:hazir'    {surum}
//   'guncelleme:hata'     {mesaj}                                (kurulum başlatılamadı)
// IPC:
//   'guncelleme:denetle' → {durum:'var'|'yok'|'hata', asama?, surum, mevcut, mesaj}   elle denetim
//                          asama (durum 'var' iken): 'var' | 'indiriliyor' (indirme sürüyor) | 'hazir' (indirildi, kurulmayı bekliyor)
//   'guncelleme:indir'   → {tamam, mesaj}                                     indirme bitince (ya da hata verince) döner
//   'guncelleme:kur'     → true|false                                         renderer kapatmaya izin aldıktan sonra çağırır
//   'guncelleme:durum'   → {paketli, surum, denetleniyor, indiriliyor, kuruluyor, bulunan, hazir, sonDenetim}   sonDenetim: ms ya da 0

const AYAR_OTO = 'otoGuncelle';
// Denetim zamanı ayarları (VARSAYILANLAR'da yok: "Varsayılanlara dön" bunlara dokunmaz). 0.1.7'ye dek kullanılan açılış sayacı
// (acilisSayaci, sonDenetimAcilisi, sonDenetimSurumu) ayarlar.js'te eski dosyalardan silinir.
export const AYAR_SON_DENETIM = 'sonDenetimZamani';   // son başarılı (sunucudan yanıt alınan) denetimin zamanı, ms
// İndirilmeye başlanmış (0.2.5) ya da indirilip kurulmamış sürüm ('' yok): sonraki açılışta süreye bakılmadan denetlenir
const AYAR_BEKLEYEN = 'bekleyenGuncelleme';
export const DENETIM_ARALIGI_MS = 7 * 24 * 3600 * 1000;   // haftada bir
const BAKIS_ARALIGI_MS = 3600 * 1000;            // açık kalan PDEfe'de sürenin dolup dolmadığına saatte bir bakılır
const ACILIS_GECIKMESI_MS = 6000;                // pencere gösterildikten sonra
const KURULUM_BEKLEME_MS = 30000;                // kurulum bu sürede uygulamayı kapatmazsa başlatılamamış sayılır
const INDIRME_BEKLEME_MS = 60000;                // indirme bu süre hiç ilerlemezse kesilir (0.2.5)
const TEMIZLIK_YENIDEN_MS = [3000, 10000, 30000]; // açılış temizliğinde silinemeyen dosya bu aralıklarla yeniden denenir (0.2.5)
export const DONMUS_INDIRME = 'İndirme ilerlemiyor; internet bağlantısını denetleyip yeniden deneyin.';

/** Son başarılı denetimin zamanı (ms); hiç yoksa ya da bozuksa 0. */
function sonDenetim(ayarAl) { const n = Number(ayarAl(AYAR_SON_DENETIM)); return Number.isFinite(n) && n > 0 ? n : 0; }

/** Haftalık otomatik denetimin sırası geldi mi: hiç denetlenmemiş, son denetimden bu yana DENETIM_ARALIGI_MS geçmiş ya da saat geri alınmış. */
export function sirasiGeldiMi(ayarAl, simdi = Date.now()) {
  const son = sonDenetim(ayarAl);
  return !son || son > simdi || simdi - son >= DENETIM_ARALIGI_MS;
}

/**
 * Açılışta otomatik denetim gerekip gerekmediğini döndürür (ayarları değiştirmez; bekleyen sürüm kurulmuşsa yalnızca onun kaydı silinir):
 * haftalık sıra geldiyse (sirasiGeldiMi) ya da bekleyen (indirmesi başlamış ya da indirilip kurulmamış) sürüm varsa. Süreyi, sunucudan yanıt
 * alan denetim başlatır (sonDenetimZamani); sunucuya ulaşılamayan açılışta süre başlamaz, sonraki açılışta (ya da saatlik bakışta) yeniden
 * denenir. kuruldu: bekleyen sürüm bu açılışın sürümü (güncelleme kurulmuş; önbellekteki kurucusu silinebilir).
 */
export function acilisDenetimi({ ayarAl, ayarKoy, surum, simdi = Date.now() }) {
  let bekleyen = String(ayarAl(AYAR_BEKLEYEN) || ''), kuruldu = false;
  if (bekleyen && bekleyen === surum) { ayarKoy(AYAR_BEKLEYEN, ''); bekleyen = ''; kuruldu = true; }   // bekleyen sürüm kuruldu
  return { denetlenecek: !!bekleyen || sirasiGeldiMi(ayarAl, simdi), bekleyen, kuruldu };
}

/**
 * Güncelleme önbelleğinin bekleyen kısmını temizler (0.2.5; açılışta, indirme başlamadan): yarım kalmış indirmenin geçici dosyaları
 * ("temp-…", "0-temp-…") her zaman, kurulmuş sürümün kurucusu (kuruldu) bütün bekleyen klasörüyle. Yarım dosya sürdürülemez (electron-updater
 * baştan indirir) ve bir sonraki indirmeye dek ~140 MB yer tutuyordu; kurulan sürümün kurucusu da bir sonraki güncellemeye dek kalıyordu.
 * Değişen blokların karşılaştırıldığı önbellek kökü (installer.exe, current.blockmap) silinmez. electron-updater'ın önbellek yardımcısı
 * (getOrCreateDownloadHelper) yoksa (macOS güncelleyicisi, sahte güncelleyici) bir şey yapılmaz. Döner: { silinen, kalan } (adlar; kalan:
 * silinemeyenler, ör. güncellemeden sonraki ilk açılışta henüz kapanmamış kurucunun kilitli dosyası; çağıran yeniden dener).
 */
export async function onbellekTemizle(autoUpdater, { kuruldu = false, fsp = null } = {}) {
  const sonuc = { silinen: [], kalan: [] };
  if (typeof autoUpdater?.getOrCreateDownloadHelper !== 'function') return sonuc;
  const yardimci = await autoUpdater.getOrCreateDownloadHelper();
  const klasor = yardimci?.cacheDirForPendingUpdate;
  if (!klasor) return sonuc;
  const fs = fsp || (await import('node:fs/promises'));
  const path = await import('node:path');
  let adlar = [];
  try { adlar = await fs.readdir(klasor); } catch { return sonuc; }   // klasör yok: hiç indirilmemiş
  for (const ad of kuruldu ? adlar : adlar.filter((a) => /^(\d+-)?temp-/i.test(a))) {
    try { await fs.rm(path.join(klasor, ad), { recursive: true, force: true }); sonuc.silinen.push(ad); }
    catch (e) { sonuc.kalan.push(ad); console.warn('[güncelleme] önbellekten silinemedi:', ad, e?.code || e?.message || e); }
  }
  return sonuc;
}

// GitHub sürüm notları HTML gelir (atom akışındaki <content>); düz metne indirger.
function notlariDuzlestir(notlar) {
  if (!notlar) return '';
  if (Array.isArray(notlar)) {
    return notlar.map((n) => `${n.version ? n.version + '\n' : ''}${notlariDuzlestir(n.note)}`).join('\n\n');
  }
  return String(notlar)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Kısa Türkçe hata metni (şeritte ve Ayarlar'da gösterilir). electron-updater'ın İngilizce iletisi arayüze çıkmaz; ayrıntıyı
 * çağıran günlüğe yazar. Önce hata kodu (ERR_UPDATER_*, HttpError.statusCode), sonra ileti metni tanınır; tanınmayan hata için
 * genel bir ileti döner. indirme: kurulum dosyası indirilirken (404 başka anlama gelir).
 */
export function hataMetni(e, indirme = false) {
  const m = (e && (e.message || String(e))) || '';
  const kod = String(e?.code || '');
  const http = Number(e?.statusCode) || Number(/^(\d{3}) /.exec(m)?.[1]) || 0;
  if (/^ERR_UPDATER_(NO_PUBLISHED_VERSIONS|LATEST_VERSION_NOT_FOUND|CHANNEL_FILE_NOT_FOUND)$/.test(kod)) return 'Sürüm bilgisi bulunamadı (henüz yayımlanmış sürüm yok).';
  if (/^ERR_UPDATER_(INVALID_RELEASE_FEED|INVALID_UPDATE_INFO|NO_FILES_PROVIDED|NO_CHECKSUM)$/.test(kod)) return 'Sürüm bilgisi okunamadı.';
  if (kod === 'ERR_UPDATER_INVALID_SIGNATURE') return 'Kurulum dosyasının imzası doğrulanamadı.';
  if (kod === 'ERR_UPDATER_ASSET_NOT_FOUND' || kod === 'ERR_UPDATER_ZIP_FILE_NOT_FOUND') return 'Kurulum dosyası sunucuda bulunamadı.';
  if (kod === 'ERR_CHECKSUM_MISMATCH' || /checksum mismatch/i.test(m)) return 'İndirilen dosyanın bütünlüğü doğrulanamadı.';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|socket hang up|net::ERR/i.test(`${kod} ${m}`)) return 'Sunucuya ulaşılamadı; internet bağlantısını denetleyin.';
  if (/ENOSPC/i.test(`${kod} ${m}`)) return 'Diskte yeterli boş yer yok.';
  if (/No update filepath provided|No valid update available/i.test(m)) return 'İndirilen kurulum dosyası bulunamadı.';
  if (/\bspawn\b|EACCES|EPERM|EBUSY/i.test(`${kod} ${m}`)) return 'Kurulum dosyası başlatılamadı.';
  if (kod === 'PDEFE_KURULUM_BASLAMADI') return 'Kurulum başlamadı; yeniden deneyin.';   // kur(): uygulama beklenen sürede kapanmadı
  if (http === 404) return indirme ? 'Kurulum dosyası sunucuda bulunamadı.' : 'Sürüm bilgisi bulunamadı (henüz yayımlanmış sürüm yok).';
  if (http === 403 || http === 429) return 'Sunucu isteği şu an kabul etmiyor; biraz sonra yeniden deneyin.';
  if (http >= 500 && http <= 599) return 'Sunucu şu an yanıt vermiyor; biraz sonra yeniden deneyin.';
  return 'Beklenmeyen bir hata oluştu; biraz sonra yeniden deneyin.';
}

/** Hatanın ilk satırı (günlük için; kısa). */
const hataAyrintisi = (e) => String((e && (e.stack || e.message)) || e).split('\n')[0].slice(0, 300);

/**
 * Güncelleme sistemini kurar. Etkin değilse (geliştirme sürümü) IPC kanalları "geliştirme sürümünde güncelleme yok" döndürür.
 * @param {object} p
 * @param {import('electron').App} p.app
 * @param {import('electron').IpcMain} p.ipcMain
 * @param {import('electron-updater').AppUpdater} p.autoUpdater
 * @param {boolean} [p.etkin]  varsayılan app.isPackaged (geliştirme örneğinde sahte güncelleyiciyle true verilir, bkz. gelistirme.js)
 * @param {boolean} [p.ilkOrnek]  tek örnek kilidi bu süreçte: otomatik denetim yalnızca o zaman yapılır
 * @param {(kanal: string, ...args: any[]) => void} p.pencereyeGonder
 * @param {(anahtar: string) => any} p.ayarAl
 * @param {(anahtar: string, deger: any) => void} p.ayarKoy
 * @param {() => void} [p.kapatmayaHazirla]  quitAndInstall'dan önce çağrılır (pencerelerin kapatma onayı verilir: yeniden sormazlar)
 * @param {() => void} [p.kapatmaIptal]      kurulum başlatılamazsa çağrılır (onay geri alınır: pencere kapatma yine sorar)
 * @param {(surum: string) => Promise<boolean>} [p.tarayiciIndir]  verilirse (macOS, 0.2.0: imzasız uygulama kendini güncelleyemez) indirme
 *   bulunan sürümün paketini tarayıcıda açar; 'guncelleme:indir' { tamam, tarayicida: true } döner, kurulum kullanıcıya kalır
 * @param {number} [p.acilisGecikmesiMs]      otomatik denetimin pencere gösterildikten sonraki gecikmesi (birim denemesi kısaltır)
 * @param {number} [p.bakisAraligiMs]         açık kalan uygulamada haftalık sıranın denetlendiği aralık (birim denemesi kısaltır)
 * @param {number} [p.kurulumBeklemeMs]       kurulum uygulamayı bu sürede kapatmazsa başlatılamamış sayılır (birim denemesi kısaltır)
 * @param {Function} [p.IptalJetonu]           electron-updater'ın CancellationToken sınıfı (0.2.5): donmuş indirmeyi kesmek için; yoksa kesilmez
 * @param {number} [p.indirmeBeklemeMs]       indirme bu süre hiç ilerlemezse kesilir (birim denemesi kısaltır)
 * @param {number[]} [p.temizlikYeniden]      açılış temizliğinde silinemeyen dosyanın yeniden deneme aralıkları, ms (birim denemesi kısaltır)
 * @param {object} [p.temizlikFs]             temizliğin dosya işlemleri (readdir, rm; birim denemesi kilitli dosyayı taklit eder); yoksa node:fs/promises
 * @param {() => number} [p.saat]              şimdiki zaman, ms (birim denemesi haftayı ileri sarar)
 * @returns {{ denetle: (elle?: boolean) => Promise<object>, pencereGosterildi: () => void, durdur: () => void, temizlik: Promise<string[]> }}
 */
export function guncellemeKur({ app, ipcMain, autoUpdater, etkin = !!app?.isPackaged, ilkOrnek = true, pencereyeGonder, ayarAl, ayarKoy, kapatmayaHazirla, kapatmaIptal,
  tarayiciIndir = null, acilisGecikmesiMs = ACILIS_GECIKMESI_MS, bakisAraligiMs = BAKIS_ARALIGI_MS, kurulumBeklemeMs = KURULUM_BEKLEME_MS,
  IptalJetonu = null, indirmeBeklemeMs = INDIRME_BEKLEME_MS, temizlikYeniden = TEMIZLIK_YENIDEN_MS, temizlikFs = null, saat = Date.now }) {
  const mevcut = app?.getVersion?.() || '';
  const gelistirmeSonucu = { durum: 'hata', mevcut, mesaj: 'Geliştirme sürümünde güncelleme yok.' };

  if (!etkin || !autoUpdater) {
    ipcMain.handle('guncelleme:denetle', () => gelistirmeSonucu);
    ipcMain.handle('guncelleme:indir', () => ({ tamam: false, mesaj: gelistirmeSonucu.mesaj }));
    ipcMain.handle('guncelleme:kur', () => false);
    ipcMain.handle('guncelleme:durum', () => ({ paketli: false, surum: mevcut, denetleniyor: false, indiriliyor: false, kuruluyor: false, bulunan: null, hazir: null, sonDenetim: 0 }));
    return { denetle: async () => gelistirmeSonucu, pencereGosterildi() {}, durdur() {}, temizlik: Promise.resolve([]) };
  }

  // sonIlerleme: indirmenin son ilerlediği an (bekçi); jeton: süren indirmenin iptal jetonu; donduKesildi: bekçi indirmeyi kesti
  const durum = { denetleniyor: false, indiriliyor: false, kuruluyor: false, bulunan: null, hazir: null, indirme: null, sonIlerleme: 0, jeton: null, donduKesildi: false };
  let zamanlayici = null, bakis = null, otomatikSuruyor = false;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;   // yalnızca kullanıcı "Güncelle"ye basınca kurulur
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = {
    info: (...a) => console.log('[güncelleme]', ...a),
    warn: (...a) => console.warn('[güncelleme]', ...a),
    error: (...a) => console.error('[güncelleme]', ...a),
    debug: (...a) => console.debug('[güncelleme]', ...a),
  };

  // ---- olaylar
  autoUpdater.on('checking-for-update', () => { durum.denetleniyor = true; });
  autoUpdater.on('update-available', () => { durum.denetleniyor = false; });
  autoUpdater.on('update-not-available', () => { durum.denetleniyor = false; });
  autoUpdater.on('download-progress', (p) => {
    durum.sonIlerleme = saat();
    pencereyeGonder('guncelleme:ilerleme', {
      yuzde: Math.max(0, Math.min(100, Math.floor(p.percent || 0))),
      aktarilan: p.transferred || 0, toplam: p.total || 0, hiz: p.bytesPerSecond || 0,
    });
  });
  autoUpdater.on('update-downloaded', (bilgi) => {
    durum.hazir = { surum: bilgi.version };
    // Kurulum ertelenip PDEfe kapatılırsa sonraki açılışta süreye bakılmadan denetlensin (bkz. başlık); kurulunca acilisDenetimi siler
    try { ayarKoy(AYAR_BEKLEYEN, String(bilgi.version || '')); } catch (e) { console.error('[güncelleme] bekleyen sürüm yazılamadı:', e); }
    pencereyeGonder('guncelleme:hazir', durum.hazir);
  });
  autoUpdater.on('error', (e) => {
    durum.denetleniyor = false;
    // Denetim ve indirme hataları söz reddiyle de gelir (denetle / indir sonucunda döner; otomatik denetimdeki ağ hatası
    // gösterilmez). Buradan yalnızca kurulum başlatılamadığında (quitAndInstall → dispatchError) bildirilir.
    if (durum.kuruluyor) {
      durum.kuruluyor = false;
      console.error('[güncelleme] kurulum başlatılamadı:', hataAyrintisi(e));
      try { kapatmaIptal?.(); } catch (h) { console.error('[güncelleme] kapatmaIptal:', h); }
      pencereyeGonder('guncelleme:hata', { mesaj: 'Güncelleme kurulamadı. ' + hataMetni(e) });
    }
  });

  // ---- denetim
  /** Sunucudan yanıt alınan (yeni sürüm var ya da güncel) denetim haftalık süreyi başlatır; otomatik ya da elle, fark etmez. */
  const denetimYapildi = () => { if (ilkOrnek) { try { ayarKoy(AYAR_SON_DENETIM, saat()); } catch (e) { console.error('[güncelleme] denetim zamanı yazılamadı:', e); } } };

  /** Döner: {durum:'var'|'yok'|'hata', asama?, surum, mevcut, mesaj, sunucu?}; sunucu: bu çağrıda sunucudan yanıt alındı. */
  async function denetle(elle = false) {
    if (durum.hazir) return { durum: 'var', asama: 'hazir', surum: durum.hazir.surum, mevcut, mesaj: `PDEfe ${durum.hazir.surum} indirildi, kurulmayı bekliyor.` };
    if (durum.indiriliyor && durum.bulunan) return { durum: 'var', asama: 'indiriliyor', surum: durum.bulunan.surum, mevcut, mesaj: `PDEfe ${durum.bulunan.surum} indiriliyor.` };
    try {
      const sonuc = await autoUpdater.checkForUpdates();
      if (!sonuc) return { durum: 'hata', mevcut, mesaj: 'Güncelleme denetimi bu ortamda kullanılamıyor.' };
      denetimYapildi();
      const bilgi = sonuc.updateInfo || {};
      if (sonuc.isUpdateAvailable) {
        durum.bulunan = { surum: bilgi.version, notlar: notlariDuzlestir(bilgi.releaseNotes), tarih: bilgi.releaseDate || '' };
        pencereyeGonder('guncelleme:var', { ...durum.bulunan, mevcut, elle });
        return { durum: 'var', asama: 'var', surum: bilgi.version, mevcut, mesaj: `PDEfe ${bilgi.version} hazır (kullandığınız: ${mevcut}).`, sunucu: true };
      }
      durum.bulunan = null;
      return { durum: 'yok', surum: mevcut, mevcut, mesaj: `PDEfe güncel (${mevcut}).`, sunucu: true };
    } catch (e) {
      durum.denetleniyor = false;
      console.warn(`[güncelleme] ${elle ? 'elle' : 'otomatik'} denetim:`, hataAyrintisi(e));
      return { durum: 'hata', mevcut, mesaj: hataMetni(e) };
    }
  }

  /** Bulunan sürümü indirir; bitince (ya da hata verince) sonuç döner. İndirilmiş paket varsa hemen döner. */
  async function indir() {
    if (tarayiciIndir) {
      if (!durum.bulunan) {
        const s = await denetle(true);
        if (s.durum !== 'var') return { tamam: false, mesaj: s.durum === 'yok' ? s.mesaj : (s.mesaj || 'Güncelleme bulunamadı.') };
      }
      return (await tarayiciIndir(durum.bulunan.surum)) ? { tamam: true, tarayicida: true } : { tamam: false, mesaj: 'Tarayıcı açılamadı.' };
    }
    if (durum.hazir) return { tamam: true };
    if (!durum.indirme) {
      if (!durum.bulunan) {
        const s = await denetle(true);
        if (s.durum !== 'var') return { tamam: false, mesaj: s.durum === 'yok' ? s.mesaj : (s.mesaj || 'Güncelleme bulunamadı.') };
        if (durum.hazir) return { tamam: true };
      }
      if (!durum.indirme) {
        durum.indiriliyor = true;
        durum.donduKesildi = false;
        // Yarıda kalırsa sonraki açılışta şerit yeniden görünsün (bkz. başlık); indirme bitince update-downloaded aynı kaydı yazar
        try { if (durum.bulunan?.surum) ayarKoy(AYAR_BEKLEYEN, String(durum.bulunan.surum)); } catch (e) { console.error('[güncelleme] bekleyen sürüm yazılamadı:', e); }
        durum.jeton = IptalJetonu ? new IptalJetonu() : null;
        let bekci = null;
        durum.indirme = (async () => {
          await ilkTemizlik;   // açılıştaki önbellek temizliği indirmenin geçici dosyasına dokunmasın (yeniden denemeler indirme sürerken durur)
          durum.sonIlerleme = saat();
          if (durum.jeton && indirmeBeklemeMs > 0) {
            bekci = setInterval(() => {
              if (durum.indiriliyor && !durum.donduKesildi && saat() - durum.sonIlerleme >= indirmeBeklemeMs) {
                console.warn(`[güncelleme] indirme ${Math.round(indirmeBeklemeMs / 1000)} sn ilerlemedi; kesiliyor`);
                durum.donduKesildi = true;
                try { durum.jeton.cancel(); } catch (e) { console.error('[güncelleme] indirme kesilemedi:', e); }
              }
            }, Math.min(5000, Math.max(50, Math.floor(indirmeBeklemeMs / 4))));
            bekci.unref?.();
          }
          await (durum.jeton ? autoUpdater.downloadUpdate(durum.jeton) : autoUpdater.downloadUpdate());
          return { tamam: true };
        })()
          .catch((e) => {
            console.error('[güncelleme] indirme:', hataAyrintisi(e));
            return { tamam: false, mesaj: durum.donduKesildi ? DONMUS_INDIRME : hataMetni(e, true) };
          })
          .finally(() => { clearInterval(bekci); durum.indiriliyor = false; durum.indirme = null; durum.jeton = null; });
      }
    }
    return durum.indirme;
  }

  let kurulumNo = 0;
  function kur() {
    if (!durum.hazir) return false;
    if (durum.kuruluyor) return true;
    durum.kuruluyor = true;
    const deneme = ++kurulumNo;
    try { kapatmayaHazirla?.(); } catch (e) { console.error('[güncelleme] kapatmayaHazirla:', e); }
    // Sessiz kurulum ve yeniden başlatma: bkz. başlık. Kurulum başlatılamazsa electron-updater 'error' olayını verir (yukarıda).
    setImmediate(() => {
      try { autoUpdater.quitAndInstall(true, true); }
      catch (e) { autoUpdater.emit?.('error', e); }
    });
    // Kurulum uygulamayı kapatır. Kapanmadıysa ve hata da gelmediyse başlatılamamıştır: aynı yoldan bildirilir (kapatmaIptal: kapatma
    // onayı geri alınır, izin verirken girdiye kilitlenen pencereler açılır; 0.1.19)
    const zaman = setTimeout(() => {
      if (durum.kuruluyor && deneme === kurulumNo) autoUpdater.emit?.('error', Object.assign(new Error('Kurulum uygulamayı kapatmadı.'), { code: 'PDEFE_KURULUM_BASLAMADI' }));
    }, kurulumBeklemeMs);
    zaman.unref?.();
    return true;
  }

  // ---- IPC
  ipcMain.handle('guncelleme:denetle', () => denetle(true));
  ipcMain.handle('guncelleme:indir', () => indir());
  ipcMain.handle('guncelleme:kur', () => kur());
  ipcMain.handle('guncelleme:durum', () => ({
    paketli: true, surum: mevcut, denetleniyor: durum.denetleniyor, indiriliyor: durum.indiriliyor, kuruluyor: durum.kuruluyor,
    bulunan: durum.bulunan, hazir: durum.hazir, sonDenetim: sonDenetim(ayarAl),
  }));

  // ---- haftalık otomatik denetim: açılışta sırası geldiyse (ya da bekleyen sürüm varsa), açık kalan uygulamada saatte bir bakılarak
  let acilis = null;
  if (ilkOrnek) {
    try { acilis = acilisDenetimi({ ayarAl, ayarKoy, surum: mevcut, simdi: saat() }); }
    catch (e) { console.error('[güncelleme] açılış denetimi hazırlanamadı:', e); }
  }
  // 0.2.5: yarım indirmenin geçici dosyası ve kurulmuş sürümün kurucusu önbellekten silinir (onbellekTemizle). İndirme ilk geçişi bekler
  // (ilkTemizlik). Silinemeyen kalırsa (güncellemeden sonraki ilk açılışta kurucu bir an daha çalışıyor olabilir: dosyası kilitli)
  // temizlikYeniden aralıklarıyla yeniden denenir; bu arada indirme başladıysa ya da paket indirildiyse dokunulmaz (yeni indirmenin dosyaları)
  const kuruldu = !!acilis?.kuruldu;
  const silinenler = [];
  const gecis = () => onbellekTemizle(autoUpdater, { kuruldu, fsp: temizlikFs }).then((r) => { silinenler.push(...r.silinen); return r; });
  const ilkTemizlik = ilkOrnek ? gecis().catch((e) => { console.warn('[güncelleme] önbellek temizlenemedi:', e?.message || e); return { silinen: [], kalan: [] }; })
    : Promise.resolve({ silinen: [], kalan: [] });
  const temizlik = ilkTemizlik.then(async (r) => {
    for (const ms of temizlikYeniden) {
      if (!r.kalan.length || durum.indiriliyor || durum.indirme || durum.hazir) break;
      await new Promise((c) => setTimeout(c, ms));
      if (durum.indiriliyor || durum.indirme || durum.hazir) break;
      r = await gecis().catch(() => r);
    }
    if (silinenler.length) console.log('[güncelleme] önbellekten silindi:', silinenler.join(', '));
    if (r.kalan.length) console.warn('[güncelleme] önbellekte kaldı:', r.kalan.join(', '));
    return [...silinenler];
  }).catch(() => [...silinenler]);

  /** Otomatik denetim (otoGuncelle açıksa). Sunucuya ulaşılamazsa süre başlamaz: sonraki açılışta ya da saatlik bakışta yeniden denenir. */
  async function otomatikDenetle(bekleyenHatirlatma = false) {
    if (otomatikSuruyor || ayarAl(AYAR_OTO) === false) return;   // kapalı: süre, açıldıktan sonraki ilk bakışa kalır
    otomatikSuruyor = true;
    try {
      const sonuc = await denetle(false).catch((e) => ({ durum: 'hata', mesaj: hataAyrintisi(e) }));
      // Bekleyen sürüm için tek hatırlatma yapıldı (şerit gösterildi ya da artık güncelleme yok). Bu oturumda yeniden indirildiyse
      // (update-downloaded kaydı yeniden yazdı) kalsın.
      if (sonuc?.sunucu && bekleyenHatirlatma && !durum.hazir) ayarKoy(AYAR_BEKLEYEN, '');
    } catch (e) { console.error('[güncelleme] otomatik denetim:', e); }
    finally { otomatikSuruyor = false; }
  }

  /** Ana pencere ilk kez gösterildi: sırası gelmişse otomatik denetimi zamanlar, saatlik bakışı başlatır. */
  function pencereGosterildi() {
    if (!acilis || zamanlayici || bakis) return;
    if (acilis.denetlenecek) {
      zamanlayici = setTimeout(() => { zamanlayici = null; otomatikDenetle(!!acilis.bekleyen); }, acilisGecikmesiMs);
      zamanlayici.unref?.();
    }
    // İndirme sürerken ya da indirilmiş sürüm kurulmayı beklerken denetlenmez (şerit zaten görünür)
    bakis = setInterval(() => { if (!zamanlayici && !durum.hazir && !durum.indiriliyor && sirasiGeldiMi(ayarAl, saat())) otomatikDenetle(); }, bakisAraligiMs);
    bakis.unref?.();
  }

  function durdur() { clearTimeout(zamanlayici); clearInterval(bakis); zamanlayici = null; bakis = null; }
  // will-quit: çıkış gerçekten sürüyor (bütün pencereler kapandı). before-quit değil: macOS'ta Dock › Çık ve oturum kapatma before-quit
  // olarak gelir, main.js onu engelleyip pencereleri sorar; Vazgeç denince uygulama açık kalır, denetim de sürmeli (0.2.1)
  app.on('will-quit', durdur);

  return { denetle, pencereGosterildi, durdur, temizlik };
}
