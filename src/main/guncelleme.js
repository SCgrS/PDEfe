// Otomatik güncelleme (electron-updater, GitHub Releases: SCgrS/PDEfe → latest.yml + PDEfe-Setup.exe).
//
// Otomatik denetim 10 açılışta bir yapılır: kurulumdan ya da güncellemeden sonraki ilk açılışta, sonra 11., 21., … açılışta;
// pencere gösterildikten ACILIS_GECIKMESI_MS sonra, arka planda. Ağ hatası sessizce geçilir. Ayarlar › Güncelleme'deki
// otoGuncelle kapalıysa otomatik denetim yapılmaz. Elle denetim (Yardım › Güncellemeleri denetle, Ayarlar) sayaca bakmaz.
// Açılış sayacı yalnızca uygulamanın gerçek başlangıcında artar (pencere yenilemesi ya da ikinci örnekle dosya açma saymaz).
//
// Tek tıkla güncelleme (renderer/guncelleme.js): 'guncelleme:indir' → kaydedilmemiş değişiklikler sorulur → 'guncelleme:kur' →
// quitAndInstall(isSilent=true, isForceRunAfter=true). Bu yardımlı (oneClick: false) NSIS kurucusunda yalnızca bu ikili sessizdir:
// electron-updater kurucuyu "--updated /S --force-run" ile başlatır; sihirbaz penceresi açılmaz, kurulum bitince installSection.nsh
// ("isForceRun ve Silent") PDEfe'yi yeniden başlatır. isSilent=false verilirse /S geçilmez: ilerleme ve bitiş sayfası görünür,
// kullanıcı "Son"a basana dek beklenir ve uygulama kendiliğinden açılmaz.
//
// Kullanım (main.js):
//   const guncelleme = guncellemeKur({ app, ipcMain, autoUpdater, pencereyeGonder, ayarAl, ayarKoy, ilkOrnek,
//                                      kapatmayaHazirla: () => { kapatOnayli = true; }, kapatmaIptal: () => { kapatOnayli = false; } });
//   pencere.once('show', () => guncelleme.pencereGosterildi());
//
// Renderer'a giden olaylar:
//   'guncelleme:var'      {surum, mevcut, notlar, tarih, elle}   (elle: kullanıcı denetledi; "Daha sonra" ile gizlenmiş şerit yeniden görünür)
//   'guncelleme:ilerleme' {yuzde, aktarilan, toplam, hiz}
//   'guncelleme:hazir'    {surum}
//   'guncelleme:hata'     {mesaj}                                (kurulum başlatılamadı)
// IPC:
//   'guncelleme:denetle' → {durum:'var'|'yok'|'hata', surum, mevcut, mesaj}   elle denetim
//   'guncelleme:indir'   → {tamam, mesaj}                                     indirme bitince (ya da hata verince) döner
//   'guncelleme:kur'     → true|false                                         renderer kapatmaya izin aldıktan sonra çağırır
//   'guncelleme:durum'   → {paketli, surum, denetleniyor, indiriliyor, kuruluyor, bulunan, hazir}

const AYAR_OTO = 'otoGuncelle';
// Açılış sayacı ayarları (VARSAYILANLAR'da yok: "Varsayılanlara dön" bunlara dokunmaz)
const AYAR_ACILIS = 'acilisSayaci';              // toplam açılış sayısı; güncellemede sıfırlanmaz
const AYAR_SON_DENETIM = 'sonDenetimAcilisi';    // son otomatik denetimin yapıldığı açılışın sırası
const AYAR_SON_SURUM = 'sonDenetimSurumu';       // son otomatik denetimdeki sürüm; farklıysa bu, kurulum/güncelleme sonrası ilk açılıştır
export const DENETIM_ARALIGI = 10;               // açılış
const ACILIS_GECIKMESI_MS = 6000;                // pencere gösterildikten sonra

/**
 * Bu açılışı sayar ve otomatik denetim sırası gelip gelmediğini döndürür (ayarları değiştirmez; denetim yapılınca
 * denetimYapildi() işaretler). Kurulum ya da güncellemeden sonraki ilk açılışta, sonra her DENETIM_ARALIGI açılışta bir: 1, 11, 21, …
 * Denetim yapılmadan kapanan açılışta sıra bir sonraki açılışa kalır.
 */
export function acilisiSay({ ayarAl, ayarKoy, surum }) {
  const sayi = (anahtar) => { const n = Number(ayarAl(anahtar)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  const sayac = sayi(AYAR_ACILIS) + 1;
  ayarKoy(AYAR_ACILIS, sayac);
  const son = sayi(AYAR_SON_DENETIM);
  const denetlenecek = ayarAl(AYAR_SON_SURUM) !== surum || !son || son > sayac || sayac - son >= DENETIM_ARALIGI;
  return {
    sayac, denetlenecek,
    denetimYapildi: () => { ayarKoy(AYAR_SON_DENETIM, sayac); ayarKoy(AYAR_SON_SURUM, surum); },
  };
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

/** Kısa Türkçe hata metni. indirme: kurulum dosyası indirilirken (404 başka anlama gelir). */
function hataMetni(e, indirme = false) {
  const m = (e && (e.message || String(e))) || '';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EAI_AGAIN|socket hang up|net::ERR/i.test(m)) return 'Sunucuya ulaşılamadı; internet bağlantısını denetleyin.';
  if (/sha512|checksum/i.test(m)) return 'İndirilen dosyanın bütünlüğü doğrulanamadı.';
  if (/ENOSPC/i.test(m)) return 'Diskte yeterli boş yer yok.';
  if (/\b404\b|Cannot find latest\.yml|No published versions|Cannot find channel/i.test(m)) return indirme ? 'Kurulum dosyası sunucuda bulunamadı.' : 'Sürüm bilgisi bulunamadı (henüz yayımlanmış sürüm yok).';
  if (/HttpError: 5\d\d/i.test(m)) return 'Sunucu şu an yanıt vermiyor; biraz sonra yeniden deneyin.';
  return m.split('\n')[0].slice(0, 200) || 'Bilinmeyen hata';
}

/**
 * Güncelleme sistemini kurar. Etkin değilse (geliştirme sürümü) IPC kanalları "geliştirme sürümünde güncelleme yok" döndürür.
 * @param {object} p
 * @param {import('electron').App} p.app
 * @param {import('electron').IpcMain} p.ipcMain
 * @param {import('electron-updater').AppUpdater} p.autoUpdater
 * @param {boolean} [p.etkin]  varsayılan app.isPackaged (geliştirme örneğinde sahte güncelleyiciyle true verilir, bkz. gelistirme.js)
 * @param {boolean} [p.ilkOrnek]  tek örnek kilidi bu süreçte: açılış yalnızca o zaman sayılır
 * @param {(kanal: string, ...args: any[]) => void} p.pencereyeGonder
 * @param {(anahtar: string) => any} p.ayarAl
 * @param {(anahtar: string, deger: any) => void} p.ayarKoy
 * @param {() => void} [p.kapatmayaHazirla]  quitAndInstall'dan önce çağrılır (main.js'de kapatOnayli = true)
 * @param {() => void} [p.kapatmaIptal]      kurulum başlatılamazsa çağrılır (kapatOnayli = false: pencere kapatma yine sorar)
 * @returns {{ denetle: (elle?: boolean) => Promise<object>, pencereGosterildi: () => void, durdur: () => void }}
 */
export function guncellemeKur({ app, ipcMain, autoUpdater, etkin = !!app?.isPackaged, ilkOrnek = true, pencereyeGonder, ayarAl, ayarKoy, kapatmayaHazirla, kapatmaIptal }) {
  const mevcut = app?.getVersion?.() || '';
  const gelistirmeSonucu = { durum: 'hata', mevcut, mesaj: 'Geliştirme sürümünde güncelleme yok.' };

  if (!etkin || !autoUpdater) {
    ipcMain.handle('guncelleme:denetle', () => gelistirmeSonucu);
    ipcMain.handle('guncelleme:indir', () => ({ tamam: false, mesaj: gelistirmeSonucu.mesaj }));
    ipcMain.handle('guncelleme:kur', () => false);
    ipcMain.handle('guncelleme:durum', () => ({ paketli: false, surum: mevcut, denetleniyor: false, indiriliyor: false, kuruluyor: false, bulunan: null, hazir: null }));
    return { denetle: async () => gelistirmeSonucu, pencereGosterildi() {}, durdur() {} };
  }

  const durum = { denetleniyor: false, indiriliyor: false, kuruluyor: false, bulunan: null, hazir: null, indirme: null };
  let zamanlayici = null;

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
    pencereyeGonder('guncelleme:ilerleme', {
      yuzde: Math.max(0, Math.min(100, Math.floor(p.percent || 0))),
      aktarilan: p.transferred || 0, toplam: p.total || 0, hiz: p.bytesPerSecond || 0,
    });
  });
  autoUpdater.on('update-downloaded', (bilgi) => {
    durum.hazir = { surum: bilgi.version };
    pencereyeGonder('guncelleme:hazir', durum.hazir);
  });
  autoUpdater.on('error', (e) => {
    durum.denetleniyor = false;
    // Denetim ve indirme hataları söz reddiyle de gelir (denetle / indir sonucunda döner; otomatik denetimdeki ağ hatası
    // gösterilmez). Buradan yalnızca kurulum başlatılamadığında (quitAndInstall → dispatchError) bildirilir.
    if (durum.kuruluyor) {
      durum.kuruluyor = false;
      try { kapatmaIptal?.(); } catch (h) { console.error('[güncelleme] kapatmaIptal:', h); }
      pencereyeGonder('guncelleme:hata', { mesaj: 'Güncelleme kurulamadı: ' + hataMetni(e) });
    }
  });

  // ---- denetim
  async function denetle(elle = false) {
    if (durum.hazir) return { durum: 'var', surum: durum.hazir.surum, mevcut, mesaj: `PDEfe ${durum.hazir.surum} indirildi, kurulmayı bekliyor.` };
    if (durum.indiriliyor && durum.bulunan) return { durum: 'var', surum: durum.bulunan.surum, mevcut, mesaj: `PDEfe ${durum.bulunan.surum} indiriliyor.` };
    try {
      const sonuc = await autoUpdater.checkForUpdates();
      if (!sonuc) return { durum: 'hata', mevcut, mesaj: 'Güncelleme denetimi bu ortamda kullanılamıyor.' };
      const bilgi = sonuc.updateInfo || {};
      if (sonuc.isUpdateAvailable) {
        durum.bulunan = { surum: bilgi.version, notlar: notlariDuzlestir(bilgi.releaseNotes), tarih: bilgi.releaseDate || '' };
        pencereyeGonder('guncelleme:var', { ...durum.bulunan, mevcut, elle });
        return { durum: 'var', surum: bilgi.version, mevcut, mesaj: `PDEfe ${bilgi.version} hazır (kullandığınız: ${mevcut}).` };
      }
      durum.bulunan = null;
      return { durum: 'yok', surum: mevcut, mevcut, mesaj: `PDEfe güncel (${mevcut}).` };
    } catch (e) {
      durum.denetleniyor = false;
      if (!elle) console.warn('[güncelleme] otomatik denetim:', hataMetni(e));
      return { durum: 'hata', mevcut, mesaj: hataMetni(e) };
    }
  }

  /** Bulunan sürümü indirir; bitince (ya da hata verince) sonuç döner. İndirilmiş paket varsa hemen döner. */
  async function indir() {
    if (durum.hazir) return { tamam: true };
    if (!durum.indirme) {
      if (!durum.bulunan) {
        const s = await denetle(true);
        if (s.durum !== 'var') return { tamam: false, mesaj: s.durum === 'yok' ? s.mesaj : (s.mesaj || 'Güncelleme bulunamadı.') };
        if (durum.hazir) return { tamam: true };
      }
      if (!durum.indirme) {
        durum.indiriliyor = true;
        durum.indirme = autoUpdater.downloadUpdate()
          .then(() => ({ tamam: true }))
          .catch((e) => { console.error('[güncelleme] indirme:', e?.message || e); return { tamam: false, mesaj: hataMetni(e, true) }; })
          .finally(() => { durum.indiriliyor = false; durum.indirme = null; });
      }
    }
    return durum.indirme;
  }

  function kur() {
    if (!durum.hazir) return false;
    if (durum.kuruluyor) return true;
    durum.kuruluyor = true;
    try { kapatmayaHazirla?.(); } catch (e) { console.error('[güncelleme] kapatmayaHazirla:', e); }
    // Sessiz kurulum ve yeniden başlatma: bkz. başlık. Kurulum başlatılamazsa electron-updater 'error' olayını verir (yukarıda).
    setImmediate(() => {
      try { autoUpdater.quitAndInstall(true, true); }
      catch (e) { autoUpdater.emit?.('error', e); }
    });
    return true;
  }

  // ---- IPC
  ipcMain.handle('guncelleme:denetle', () => denetle(true));
  ipcMain.handle('guncelleme:indir', () => indir());
  ipcMain.handle('guncelleme:kur', () => kur());
  ipcMain.handle('guncelleme:durum', () => ({
    paketli: true, surum: mevcut, denetleniyor: durum.denetleniyor, indiriliyor: durum.indiriliyor, kuruluyor: durum.kuruluyor,
    bulunan: durum.bulunan, hazir: durum.hazir,
  }));

  // ---- açılış sayacı: 10 açılışta bir otomatik denetim
  let acilis = null;
  if (ilkOrnek) {
    try { acilis = acilisiSay({ ayarAl, ayarKoy, surum: mevcut }); }
    catch (e) { console.error('[güncelleme] açılış sayılamadı:', e); }
  }

  /** Ana pencere ilk kez gösterildi: sırası gelen açılışta otomatik denetimi zamanlar. */
  function pencereGosterildi() {
    if (!acilis?.denetlenecek || zamanlayici) return;
    zamanlayici = setTimeout(() => {
      if (ayarAl(AYAR_OTO) === false) return;   // kapalı: sıra, açıldığı ilk açılışa kalır
      try { acilis.denetimYapildi(); } catch (e) { console.error('[güncelleme] sayaç yazılamadı:', e); }
      denetle(false).catch((e) => console.error('[güncelleme] otomatik denetim:', e));
    }, ACILIS_GECIKMESI_MS);
    zamanlayici.unref?.();
  }

  function durdur() { clearTimeout(zamanlayici); }
  app.on('before-quit', durdur);

  return { denetle, pencereGosterildi, durdur };
}
