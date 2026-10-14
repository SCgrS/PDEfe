// Yazdırmanın ana süreç tarafındaki saf işlevleri (0.2.6): yazdırma penceresinin seçeneklerini Electron'un webContents.print()
// biçimine çevirir, yazıcı listesini ve varsayılan yazıcıyı hazırlar, Windows'un yazıcı durumunu (Win32_Printer) çözer, Chromium'un
// İngilizce hata iletilerini Türkçeye çevirir. Electron'u içe aktarmaz: Node'da sınanır (test/yazdir_html_testi.mjs).
//
// Gönderilmeyen seçenekler bilerek yoktur:
//   pageRanges  Chromium'da sessiz yazdırmada işi iptal ediyor ("Print job canceled"); sayfa seçimini PDEfe kendisi yapar (yalnızca
//               seçilen sayfalar HTML'e girer).
//   landscape   yatay sayfayı PDEfe dikey kâğıda döndürerek koyar (renderer/yazdirYerlesim.js); yön verilirse ikinci kez döner.
//   dpi         yazıcının kendi çözünürlüğü kalsın.
//   duplexMode  "Yazıcının ayarı" seçiliyken gönderilmez: Electron'un varsayılanı (kUnknownDuplexMode) yazıcının kendi ayarını korur.

export const CIFT_TARAFLI = { tek: 'simplex', uzun: 'longEdge', kisa: 'shortEdge' };
const STANDART_BOYUTLAR = new Set(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid']);
export const EN_FAZLA_KOPYA = 99;

/**
 * Yazdırma penceresinin seçenekleri → webContents.print() seçenekleri.
 * @param {{ yazici?: string, kopya?: number, harmanla?: boolean, renk?: 'renkli'|'siyahBeyaz', ciftTarafli?: 'yazici'|'tek'|'uzun'|'kisa',
 *   sayfaBoyutu?: string|{ genislikMikron:number, yukseklikMikron:number }, sistemPenceresi?: boolean }} s
 *   sistemPenceresi: Windows'un (macOS'un) yazdırma penceresi açılır (yedek yol; yazıcı ve kopya orada seçilir)
 */
export function secenekleriHazirla(s = {}) {
  const sistem = !!s.sistemPenceresi;
  const secenek = {
    silent: !sistem,
    printBackground: true,
    margins: { marginType: 'none' },
    color: s.renk !== 'siyahBeyaz',     // verilmezse Electron renkli basar; siyah beyaz ancak açıkça istenince
  };
  if (!sistem) {
    if (s.yazici) secenek.deviceName = String(s.yazici);
    secenek.copies = kopyaSayisi(s.kopya);
    secenek.collate = s.harmanla !== false;
  }
  const cift = CIFT_TARAFLI[s.ciftTarafli];
  if (cift) secenek.duplexMode = cift;
  secenek.pageSize = sayfaBoyutu(s.sayfaBoyutu);
  return secenek;
}

/** 1–99 arası tam sayı (geçersizse 1). */
export function kopyaSayisi(deger) {
  const n = Math.floor(Number(deger));
  return Number.isFinite(n) && n >= 1 ? Math.min(EN_FAZLA_KOPYA, n) : 1;
}

function sayfaBoyutu(b) {
  if (typeof b === 'string' && STANDART_BOYUTLAR.has(b)) return b;
  if (b && Number.isFinite(b.genislikMikron) && Number.isFinite(b.yukseklikMikron) && b.genislikMikron > 0 && b.yukseklikMikron > 0) {
    // Electron mikron ister; tam sayıya yuvarla. Çok küçük değerler sürücüde hata verir; 30 mm altına inme.
    return { width: Math.max(30_000, Math.round(b.genislikMikron)), height: Math.max(30_000, Math.round(b.yukseklikMikron)) };
  }
  return 'A4';
}

// ---------------------------------------------------------------- yazıcılar
/** Windows'ta varsayılan yazıcı: `reg query "HKCU\…\Windows NT\CurrentVersion\Windows" /v Device` çıktısındaki "Ad,winspool,Ne01:". */
export function varsayilanYaziciCoz(regCikti) {
  const m = /^\s*Device\s+REG_\w+\s+(.+?)\s*$/im.exec(String(regCikti || ''));
  if (!m) return null;
  const ad = m[1].split(',')[0].trim();   // yazıcı adında virgül olamaz
  return ad || null;
}

/** macOS'ta varsayılan yazıcı: `LANG=C lpstat -d` → "system default destination: Ad" ("no system default destination" → null). */
export function lpstatCoz(cikti) {
  const m = /system default destination:\s*(\S.*?)\s*$/im.exec(String(cikti || ''));
  return m ? m[1] : null;
}

/**
 * Electron'un yazıcı listesi (getPrintersAsync: { name, displayName }) → [{ ad, gorunenAd, varsayilan }]. Ad yazdırmada kullanılan
 * addır (Windows'ta yazıcının adı, macOS'ta CUPS kuyruğunun adı), görünen ad pencerede yazılır. Görünen ada göre sıralı (Türkçe).
 */
export function yaziciListesiHazirla(yazicilar, varsayilanAd) {
  const liste = [];
  const gorulen = new Set();
  for (const y of Array.isArray(yazicilar) ? yazicilar : []) {
    const ad = String(y?.name || '').trim();
    if (!ad || gorulen.has(ad)) continue;
    gorulen.add(ad);
    liste.push({ ad, gorunenAd: String(y.displayName || ad), varsayilan: !!varsayilanAd && ad === varsayilanAd });
  }
  liste.sort((a, b) => a.gorunenAd.localeCompare(b.gorunenAd, 'tr', { sensitivity: 'base' }));
  return liste;
}

/**
 * Windows'un yazıcı durumu: PowerShell `Get-CimInstance Win32_Printer | Select-Object Name, Default, WorkOffline, PrinterStatus,
 * ExtendedPrinterStatus, PortName, CapabilityDescriptions | ConvertTo-Json` çıktısı → { <ad>: { cevrimDisi, ciftTarafli, dosyayaYazar,
 * varsayilan } }. ciftTarafli: yetenek listesinde "Duplex" var mı. dosyayaYazar: bağlantı noktası PORTPROMPT: / FILE: (Microsoft Print to
 * PDF, XPS: yazdırırken kaydedilecek dosya sorulur). Çözülemezse {}.
 */
export function yaziciDurumlariniCoz(json) {
  let veri;
  try { veri = typeof json === 'string' ? JSON.parse(json.replace(/^﻿/, '') || 'null') : json; } catch { return {}; }
  if (!veri) return {};
  const sonuc = {};
  for (const y of Array.isArray(veri) ? veri : [veri]) {
    const ad = String(y?.Name || '').trim();
    if (!ad) continue;
    const yetenekler = Array.isArray(y.CapabilityDescriptions) ? y.CapabilityDescriptions.map(String) : (y.CapabilityDescriptions ? [String(y.CapabilityDescriptions)] : []);
    sonuc[ad] = {
      cevrimDisi: y.WorkOffline === true || Number(y.PrinterStatus) === 7 || Number(y.ExtendedPrinterStatus) === 7,
      ciftTarafli: yetenekler.some((x) => /^duplex$/i.test(x.trim())),
      dosyayaYazar: /^(PORTPROMPT|FILE):?$/i.test(String(y.PortName || '').trim()),
      varsayilan: y.Default === true,
    };
  }
  return sonuc;
}

/** Bağlantı noktası bilinmeyen yazıcıda dosyaya yazan Windows yazıcıları (adları Türkçe Windows'ta da İngilizce). */
export function dosyayaYazarMi(ad) { return /^Microsoft (Print to PDF|XPS Document Writer)$/i.test(String(ad || '').trim()); }

// ---------------------------------------------------------------- hata iletileri
/** Electron/Chromium'un İngilizce yazdırma hatalarını Türkçeye çevirir. */
export function nedenTurkce(neden, platform = process.platform) {
  if (!neden) return 'Yazdırma başarısız oldu.';
  if (/invalid device ?name/i.test(neden)) return 'Yazıcı bulunamadı (kaldırılmış ya da adı değişmiş olabilir). Yazdırma penceresinden başka bir yazıcı seçin.';
  if (/no printers|printer not found|no valid printers|printer_not_found/i.test(neden)) {
    return platform === 'darwin' ? 'Kurulu yazıcı bulunamadı. Sistem Ayarları > Yazıcılar ve Tarayıcılar bölümünden bir yazıcı ekleyin.'
      : 'Kurulu yazıcı bulunamadı. Windows Ayarlar > Yazıcılar ve tarayıcılar bölümünden bir yazıcı ekleyin.';
  }
  if (/invalid printer settings|invalid settings|invalid_settings/i.test(neden)) return 'Yazıcı ayarları geçersiz. Kâğıt boyutu ya da çift taraflı seçeneği bu yazıcıda desteklenmiyor olabilir.';
  if (/print job failed|^failed$/i.test(neden)) return 'Yazdırma işi başarısız oldu. Yazıcının açık ve bağlı olduğundan emin olun.';
  if (/failed to print|printing failed/i.test(neden)) return 'Yazdırma işi başarısız oldu. Yazıcının açık ve bağlı olduğundan emin olun.';
  if (/access denied|permission/i.test(neden)) return 'Yazıcıya erişim izni verilmedi.';
  if (/out of memory|oom/i.test(neden)) return 'Yazdırma için yeterli bellek yok. Daha az sayfa seçin.';
  return `Yazdırma başarısız oldu (yazıcı yanıtı: ${neden}).`;
}
