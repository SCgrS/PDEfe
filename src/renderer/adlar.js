// Belge adlarının gösterimi. Belgenin adı (belge.ad, sekme modelindeki ad) dosyanın uzantılı adıdır; ekranda bazı yerlerde ".pdf" gösterilmez:
// Son açılanlar (0.2.5, kullanıcı isteği) ve 0.2.6'dan beri (kullanıcı isteği: sekmelerdeki ".pdf" yazısı kalksın) sekme, Ctrl+Tab seçicisi,
// Açık belgeler listesi ve sürüklenen sekmenin ön izlemesi. Pencere başlığı, mesaj kutuları, yazdırma penceresi ve Dosya › Son açılanlar
// menüsü uzantılı adı gösterir; ipuçlarında tam ad ve yol.

/** Dosya adı ".pdf" uzantısı olmadan (büyük / küçük harf fark etmez): "Dilekçe.PDF" → "Dilekçe", "karar.v2.pdf" → "karar.v2" (addaki öteki
 *  noktalar kalır). Uzantısı başka olan ad olduğu gibi döner; uzantı atılınca boş kalan ad (".pdf") da. */
export const uzantisiz = (ad) => (typeof ad === 'string' && ad.replace(/\.pdf$/i, '')) || ad;
