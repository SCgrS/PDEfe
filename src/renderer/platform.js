// İşletim sistemi farkları (0.2.0, macOS desteği). Arayüz Windows'ta önceki gibidir; macOS'ta kısayolların birincil tuşu ⌘ (Command),
// kısayol yazıları Mac simgeleriyle (⇧⌘S) gösterilir, sistem adları (Windows / macOS, Gezgin / Finder) ona göre yazılır.
// Kısayol eşlemesi ana süreçteki Mac menüsüyle (main/menu.js) ve sayfadaki tuş işleyicileriyle (uygulama.js) aynıdır: değiştirirken üçünü birden.

export const MAC = window.pdefe?.platform === 'darwin';
export const SISTEM = MAC ? 'macOS' : 'Windows';
export const DOSYA_YONETICISI = MAC ? 'Finder' : 'Gezgin';

/** Kısayolun birincil değiştirici tuşu basılı mı: Windows'ta Ctrl, macOS'ta ⌘ (Ctrl'siz; Mac'te Ctrl+tık sağ tıktır). */
export function birincil(e) { return MAC ? !!e.metaKey && !e.ctrlKey : !!e.ctrlKey; }

// Windows yazımı → macOS kısayolu: Mac'te başka tuşa oturan kısayollar (menu.js'teki Mac menüsüyle aynı). Uzunlar önce.
const MAC_KISAYOLLARI = [
  ['Ctrl+PageUp / PageDown', '⇧⌘[ / ⇧⌘]'], ['Ctrl+PageUp/PageDown', '⇧⌘[ / ⇧⌘]'], ['Ctrl+PageUp', '⇧⌘['], ['Ctrl+PageDown', '⇧⌘]'],
  ['Ctrl+Tab / Ctrl+Shift+Tab', '⌃Tab / ⌃⇧Tab'], ['Ctrl+Shift+Tab', '⌃⇧Tab'], ['Ctrl+Tab', '⌃Tab'],
  ['Ctrl+← / →', '⌥⌘← / →'], ['Ctrl+Home / End', '⌘↑ / ⌘↓'],
  ['Ctrl+Z / Ctrl+Y', '⌘Z / ⇧⌘Z'], ['Ctrl+Y', '⇧⌘Z'],
  ['Ctrl+Fare tekerleği', '⌘+Fare tekerleği / kıstırma'],
  ['Ctrl+tık', '⌘+tık'], ['Shift+tık', '⇧+tık'], ['Shift+Fare tekerleği', '⇧+Fare tekerleği'],
  ['Ctrl+Shift+I', '⌥⌘I'], ['Ctrl+H', '⇧⌘H'], ['Ctrl+G', '⌥⌘G'],
  ['Alt+F4', '⌘Q'], ['Shift+F3', '⇧⌘G'], ['F3', '⌘G'], ['F11', '⌃⌘F'], ['F4', '⌃⌘S'], ['Delete', '⌫'],
];
const DEGISTIRICI = /\b((?:Ctrl|Alt|Shift)\+)+(?=\S)/g;

/**
 * Windows biçiminde yazılmış kısayol metni ("Ctrl+Shift+S", "Kaydet (Ctrl+S)", "F3 / Shift+F3"): Windows'ta olduğu gibi döner, macOS'ta
 * Mac kısayoluyla ("⇧⌘S"). Değiştiriciler Mac sırasıyla (⌃⌥⇧⌘) birleşir; Ctrl → ⌘ (birincil tuş). Dönüştürülmüş metin yeniden
 * verilirse değişmez (title gözlemcisi aynı metni ikinci kez yazmasın).
 */
export function tus(metin) {
  let s = String(metin ?? '');
  if (!MAC || !/Ctrl|Alt\+|Shift\+|F3|F4|F11|Delete/.test(s)) return s;
  for (const [win, mac] of MAC_KISAYOLLARI) {
    // Sözcük sınırında (ör. "F3" "F30" içinde, "Delete" "Deleted" içinde eşleşmesin)
    s = s.replace(new RegExp(`(^|[^\\w+])${win.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'g'), (_m, on) => on + mac);
  }
  return s.replace(DEGISTIRICI, (m) => (m.includes('Alt+') ? '⌥' : '') + (m.includes('Shift+') ? '⇧' : '') + (m.includes('Ctrl+') ? '⌘' : ''));
}

/** macOS'ta sayfadaki bütün ipuçlarını (title) Mac kısayollarına çevirir; sonradan eklenen ve değişen ipuçları da (gözlemci). */
export function ipuclariniCevir(kok = document.documentElement) {
  if (!MAC) return;
  const cevir = (el) => { const t = el.getAttribute('title'); if (t) { const y = tus(t); if (y !== t) el.setAttribute('title', y); } };
  for (const el of kok.querySelectorAll('[title]')) cevir(el);
  new MutationObserver((kayitlar) => {
    for (const k of kayitlar) {
      if (k.type === 'attributes') { if (k.target.nodeType === 1) cevir(k.target); continue; }
      for (const d of k.addedNodes) {
        if (d.nodeType !== 1) continue;
        if (d.hasAttribute('title')) cevir(d);
        for (const el of d.querySelectorAll('[title]')) cevir(el);
      }
    }
  }).observe(kok, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
}
