// Otomatik güncelleme (electron-updater, GitHub Releases: CgrShn/PDEfe → latest.yml + PDEfe-Setup.exe).
//
// Kullanım (main.js):
//   import electronUpdater from 'electron-updater';            // CJS paket: varsayılan içe aktarma güvenli
//   const { autoUpdater } = electronUpdater;
//   import { guncellemeKur } from './guncelleme.js';
//   guncellemeKur({ app, ipcMain, autoUpdater, pencereyeGonder, ayarAl, ayarKoy, kapatmayaHazirla: () => { kapatOnayli = true; } });
//
// Renderer'a giden olaylar:
//   'guncelleme:var'      {surum, notlar, tarih}
//   'guncelleme:ilerleme' {yuzde, aktarilan, toplam, hiz}
//   'guncelleme:hazir'    {surum}
//   'guncelleme:hata'     {mesaj}
// IPC:
//   'guncelleme:denetle' → {durum:'var'|'yok'|'hata', surum, mesaj}
//   'guncelleme:indir'   → true|false
//   'guncelleme:kur'     → true|false (renderer oturumu kaydettikten sonra çağırır)
//   'guncelleme:durum'   → {paketli, surum, denetleniyor, indiriliyor, bulunan, hazir}

const AYAR_SON_DENETIM = 'sonGuncellemeDenetimi';   // "YYYY-AA-GG" (yerel gün); aynı gün ikinci otomatik denetim atlanır
const AYAR_OTO = 'otoGuncelle';
const ACILIS_GECIKMESI_MS = 8000;
const DENETIM_ARALIGI_MS = 24 * 60 * 60 * 1000;

function bugun() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

function hataMetni(e) {
  const m = (e && (e.message || String(e))) || 'Bilinmeyen hata';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|net::ERR/i.test(m)) return 'Sunucuya ulaşılamadı (ağ bağlantısını denetleyin).';
  if (/404|Cannot find latest\.yml|No published versions/i.test(m)) return 'Sürüm bilgisi bulunamadı (henüz yayımlanmış sürüm yok).';
  if (/sha512|checksum/i.test(m)) return 'İndirilen dosyanın bütünlüğü doğrulanamadı.';
  return m.split('\n')[0].slice(0, 300);
}

/**
 * Güncelleme sistemini kurar. Paketli değilse IPC kanalları "geliştirme sürümünde güncelleme yok" döndürür.
 * @param {object} p
 * @param {import('electron').App} p.app
 * @param {import('electron').IpcMain} p.ipcMain
 * @param {import('electron-updater').AppUpdater} p.autoUpdater
 * @param {(kanal: string, ...args: any[]) => void} p.pencereyeGonder
 * @param {(anahtar: string) => any} p.ayarAl
 * @param {(anahtar: string, deger: any) => void} p.ayarKoy
 * @param {() => void} [p.kapatmayaHazirla]  quitAndInstall'dan önce çağrılır (main.js'de kapatOnayli = true yapmak için)
 * @returns {{ denetle: (elle?: boolean) => Promise<{durum: string, surum?: string, mesaj?: string}>, durdur: () => void }}
 */
export function guncellemeKur({ app, ipcMain, autoUpdater, pencereyeGonder, ayarAl, ayarKoy, kapatmayaHazirla }) {
  const paketli = !!app?.isPackaged;
  const gelistirmeSonucu = { durum: 'hata', mesaj: 'Geliştirme sürümünde güncelleme yok' };

  if (!paketli || !autoUpdater) {
    ipcMain.handle('guncelleme:denetle', () => gelistirmeSonucu);
    ipcMain.handle('guncelleme:indir', () => false);
    ipcMain.handle('guncelleme:kur', () => false);
    ipcMain.handle('guncelleme:durum', () => ({ paketli: false, surum: app?.getVersion?.() || '', denetleniyor: false, indiriliyor: false, bulunan: null, hazir: null }));
    return { denetle: async () => gelistirmeSonucu, durdur() {} };
  }

  const durum = { denetleniyor: false, indiriliyor: false, bulunan: null, hazir: null, sonIstekElle: false };
  const zamanlayicilar = [];

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
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
  autoUpdater.on('update-available', (bilgi) => {
    durum.denetleniyor = false;
    durum.bulunan = { surum: bilgi.version, notlar: notlariDuzlestir(bilgi.releaseNotes), tarih: bilgi.releaseDate || '' };
    pencereyeGonder('guncelleme:var', durum.bulunan);
  });
  autoUpdater.on('update-not-available', () => { durum.denetleniyor = false; durum.bulunan = null; });
  autoUpdater.on('download-progress', (p) => {
    durum.indiriliyor = true;
    pencereyeGonder('guncelleme:ilerleme', {
      yuzde: Math.max(0, Math.min(100, Math.round(p.percent || 0))),
      aktarilan: p.transferred || 0, toplam: p.total || 0, hiz: p.bytesPerSecond || 0,
    });
  });
  autoUpdater.on('update-downloaded', (bilgi) => {
    durum.indiriliyor = false;
    durum.hazir = { surum: bilgi.version };
    pencereyeGonder('guncelleme:hazir', durum.hazir);
  });
  autoUpdater.on('update-cancelled', () => { durum.indiriliyor = false; });
  autoUpdater.on('error', (e) => {
    const indiriyordu = durum.indiriliyor;
    durum.denetleniyor = false; durum.indiriliyor = false;
    // electron-updater hatayı hem 'error' olayıyla verir hem de checkForUpdates/downloadUpdate sözünü reddeder.
    // Denetim hataları denetle() üzerinden (sonuç nesnesiyle) döner; otomatik denetimdeki ağ hataları kullanıcıya
    // gösterilmez. Yalnızca indirme sırasındaki hatalar buradan tek bir 'guncelleme:hata' olayıyla bildirilir.
    if (indiriyordu) pencereyeGonder('guncelleme:hata', { mesaj: hataMetni(e) });
  });

  // ---- denetim
  async function denetle(elle = false) {
    durum.sonIstekElle = elle;
    if (durum.hazir) return { durum: 'var', surum: durum.hazir.surum, mesaj: 'Güncelleme indirildi, kurulmayı bekliyor.' };
    if (!elle) {
      if (ayarAl(AYAR_OTO) === false) return { durum: 'yok', mesaj: 'Otomatik denetim kapalı.' };
      if (ayarAl(AYAR_SON_DENETIM) === bugun()) return { durum: 'yok', mesaj: 'Bugün zaten denetlendi.' };
    }
    try {
      const sonuc = await autoUpdater.checkForUpdates();
      if (!elle) ayarKoy(AYAR_SON_DENETIM, bugun());
      if (!sonuc) return { durum: 'hata', mesaj: 'Güncelleme denetimi bu ortamda kullanılamıyor.' };
      const surum = sonuc.updateInfo?.version;
      if (sonuc.isUpdateAvailable) return { durum: 'var', surum, mesaj: `PDEfe ${surum} hazır.` };
      return { durum: 'yok', surum, mesaj: `PDEfe güncel (${app.getVersion()}).` };
    } catch (e) {
      durum.denetleniyor = false;
      return { durum: 'hata', mesaj: hataMetni(e) };
    }
  }

  async function indir() {
    if (durum.hazir) { pencereyeGonder('guncelleme:hazir', durum.hazir); return true; }
    if (durum.indiriliyor) return true;
    if (!durum.bulunan) {
      const s = await denetle(true);
      if (s.durum !== 'var') { pencereyeGonder('guncelleme:hata', { mesaj: s.mesaj || 'Güncelleme bulunamadı.' }); return false; }
      if (durum.hazir) return true;
    }
    durum.indiriliyor = true;
    durum.sonIstekElle = true;
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (e) {
      // 'error' olay dinleyicisi (yukarıda) hatayı zaten renderer'a gönderdi; burada yalnızca durum sıfırlanır.
      durum.indiriliyor = false;
      console.error('[güncelleme] indirme:', hataMetni(e));
      return false;
    }
  }

  function kur() {
    if (!durum.hazir) return false;
    try { kapatmayaHazirla?.(); } catch (e) { console.error('[güncelleme] kapatmayaHazirla:', e); }
    // isSilent=false: NSIS sihirbazı gösterilmez ama /S ile sessiz kurulur; isForceRunAfter=true: kurulum bitince PDEfe açılır.
    setImmediate(() => {
      try { autoUpdater.quitAndInstall(false, true); }
      catch (e) { pencereyeGonder('guncelleme:hata', { mesaj: hataMetni(e) }); }
    });
    return true;
  }

  // ---- IPC
  ipcMain.handle('guncelleme:denetle', () => denetle(true));
  ipcMain.handle('guncelleme:indir', () => indir());
  ipcMain.handle('guncelleme:kur', () => kur());
  ipcMain.handle('guncelleme:durum', () => ({
    paketli: true, surum: app.getVersion(), denetleniyor: durum.denetleniyor, indiriliyor: durum.indiriliyor,
    bulunan: durum.bulunan, hazir: durum.hazir,
  }));

  // ---- zamanlama: açılıştan 8 s sonra, sonra her 24 saatte bir (ayar otoGuncelle açıkken)
  const otomatik = () => denetle(false).catch((e) => console.error('[güncelleme] otomatik denetim:', e));
  const ilk = setTimeout(otomatik, ACILIS_GECIKMESI_MS);
  const aralik = setInterval(otomatik, DENETIM_ARALIGI_MS);
  ilk.unref?.(); aralik.unref?.();
  zamanlayicilar.push(ilk, aralik);

  function durdur() {
    for (const z of zamanlayicilar) { clearTimeout(z); clearInterval(z); }
    zamanlayicilar.length = 0;
  }
  app.on('before-quit', durdur);

  return { denetle, durdur };
}
