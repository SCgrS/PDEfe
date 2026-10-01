// Ana süreç güvenlik yardımcıları (0.1.23, güvenlik denetimi).

/** Dışarıda (tarayıcıda, e-posta uygulamasında) açılabilecek adres türleri. shell.openExternal adresi Windows'ta ShellExecute'a verir:
 *  file:, search-ms:, ms-…: gibi türler program çalıştırabilir, uzak ağ paylaşımına bağlanıp Windows oturumunun parola özetini
 *  gönderebilir. PDF'teki bağlantılar güvenilmeyen girdidir. */
const DIS_TURLER = new Set(['http:', 'https:', 'mailto:']);

/** Adres dışarıda açılabilir mi (yalnızca http, https, mailto; büyük/küçük harf fark etmez). */
export function disAdresMi(adres) {
  try { return DIS_TURLER.has(new URL(String(adres)).protocol); } catch { return false; }
}
