// macOS güncelleme denetimi (0.2.0). Apple geliştirici kimliğiyle imzalanmamış Mac uygulaması kendini güncelleyemez (Squirrel.Mac yeni
// paketin imzasını eskisininkiyle karşılaştırır): electron-updater yerine GitHub'ın sürüm akışından (releases.atom; electron-updater'ın
// GitHub sağlayıcısının da okuduğu akış) en son sürüm okunur. Bulunan sürüm şeritte gösterilir; "İndir" yeni Mac paketini (PDEfe-Mac.dmg)
// tarayıcıda indirir, kullanıcı PDEfe'yi Uygulamalar klasörüne sürükler (guncelleme.js tarayiciIndir, renderer/guncelleme.js).
// guncellemeKur'a autoUpdater yerine verilir: electron-updater'ın kullanılan arayüzü (olaylar, checkForUpdates) kadarı.
import { EventEmitter } from 'node:events';
import { net, shell } from 'electron';

export const DEPO_URL = 'https://github.com/SCgrS/PDEfe';
export const MAC_PAKETI = 'PDEfe-Mac.dmg';

/** "1.2.10" > "1.2.9": sayısal bölümler soldan karşılaştırılır (ön ek v ve sürüm sonrası -… yok sayılır). */
export function surumKarsilastir(a, b) {
  const p = (s) => String(s || '').replace(/^v/i, '').split('-')[0].split('.').map((x) => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const f = (x[i] || 0) - (y[i] || 0); if (f) return Math.sign(f); }
  return 0;
}

const varlikCoz = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** releases.atom'un ilk girdisi (en son yayımlanan sürüm): { version, releaseNotes (HTML), releaseDate }; girdi yoksa null. */
export function akistanSurum(xml) {
  const giris = /<entry>([\s\S]*?)<\/entry>/.exec(String(xml || ''))?.[1];
  if (!giris) return null;
  const version = /\/releases\/tag\/v?([^"<\s]+)"/.exec(giris)?.[1];
  if (!version) return null;
  return {
    version: decodeURIComponent(version),
    releaseNotes: varlikCoz(/<content[^>]*>([\s\S]*?)<\/content>/.exec(giris)?.[1] || ''),
    releaseDate: /<updated>([^<]+)<\/updated>/.exec(giris)?.[1] || '',
  };
}

export class MacGuncelleyici extends EventEmitter {
  constructor(mevcut) {
    super();
    this.mevcut = mevcut;
    // electron-updater'ın ayarları (guncellemeKur yazar; burada anlamı yok)
    this.autoDownload = false; this.autoInstallOnAppQuit = false; this.allowPrerelease = false; this.allowDowngrade = false; this.logger = null;
  }

  async checkForUpdates() {
    this.emit('checking-for-update');
    try {
      const yanit = await net.fetch(`${DEPO_URL}/releases.atom`, { cache: 'no-store', headers: { accept: 'application/atom+xml' } });
      if (!yanit.ok) throw Object.assign(new Error(`${yanit.status} ${yanit.statusText}`), { statusCode: yanit.status });
      const bilgi = akistanSurum(await yanit.text());
      if (!bilgi) throw Object.assign(new Error('No published versions on GitHub'), { code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' });
      const isUpdateAvailable = surumKarsilastir(bilgi.version, this.mevcut) > 0;
      this.emit(isUpdateAvailable ? 'update-available' : 'update-not-available', bilgi);
      return { isUpdateAvailable, updateInfo: bilgi };
    } catch (e) {
      this.emit('error', e);
      throw e;
    }
  }

  downloadUpdate() { return Promise.reject(new Error('macOS: güncelleme tarayıcıda indirilir (tarayiciIndir).')); }

  quitAndInstall() { /* macOS'ta kullanılmaz */ }
}

/** Sürümün Mac paketini varsayılan tarayıcıda indirir; tarayıcı açıldıysa true. */
export function tarayicidaIndir(surum) {
  return shell.openExternal(`${DEPO_URL}/releases/download/v${encodeURIComponent(surum)}/${MAC_PAKETI}`).then(() => true, () => false);
}
