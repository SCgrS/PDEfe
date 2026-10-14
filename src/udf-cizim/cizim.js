// UDF'nin yaklaşık çizim sayfası (0.2.6; sayfa.html, ana süreç main/udfYaklasik.js). Ana süreç UDF'nin baytlarını base64 dilimleriyle verir
// (udfCizim.parca; dilimler 3 baytın katı, ayrı ayrı çözülür), sonra udfCizim.ciz({ baslik }) belgeyi Drive UDF Okuyucu'nun motoruyla (udf-motoru.js:
// okuma, güvenlik sınırları, DOM'un createElement / textContent ile kurulması) çizer, bütün dilimler ve resimler hazır olunca özetini döner.
// Sayfa boyu, kenarlar, üst / alt bilgi ve sayfa numarası motorun yazdırma CSS'inden (@page, UDF'nin pageFormat'ı); sayfalara bölmeyi
// Chromium yazdırırken kâğıda göre yapar (printToPDF, preferCSSPageSize). Özet yalnızca sayılardan ve kısa kodlardan oluşur: belge metni ana
// sürece dönmez. Hata iletisi motorunki değil, kodu döner (iletileri ana süreç yazar). baslik: PDF'in başlık bilgisi (dosyanın adı; verilmezse
// Chromium sayfanın adresini yazardı).
(() => {
  'use strict';
  const M = globalThis.UDFMotoru;
  let dilimler = [];
  let calisti = false;

  /** base64 dilimini ekler; döner: o ana dek gelen dilim sayısı. */
  function parca(b64) {
    if (calisti || typeof b64 !== 'string') return -1;
    dilimler.push(b64);
    return dilimler.length;
  }

  function baytlar() {
    const parcalar = dilimler.map((d) => {
      const s = atob(d);
      const u = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      return u;
    });
    dilimler = [];
    const toplam = parcalar.reduce((t, p) => t + p.length, 0);
    const u8 = new Uint8Array(toplam);
    let o = 0;
    for (const p of parcalar) { u8.set(p, o); o += p.length; }
    return u8;
  }

  const sayi = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

  async function ciz({ baslik } = {}) {
    if (calisti) return { tamam: false, kod: 'hata' };
    calisti = true;
    try {
      if (typeof baslik === 'string' && baslik.trim()) document.title = baslik.slice(0, 200);
      if (!M) return { tamam: false, kod: 'desteklenmiyor' };
      const model = await M.oku(baytlar());
      // Motorun kendi CSS'i ve belgenin yazdırma CSS'i (@page boyu, kenarlar, üst / alt bilgi); oluşturulan stil sayfası belgenin metnini
      // taşımaz, üst / alt bilgi metinleri motorun cssDize'siyle kaçışlanır
      const genel = new CSSStyleSheet();
      genel.replaceSync(M.CSS);
      const yazdirma = new CSSStyleSheet();
      yazdirma.replaceSync(M.yazdirmaCss(model));
      document.adoptedStyleSheets = [genel, yazdirma];
      const cizim = M.ciz(model);
      document.getElementById('alan').append(cizim.kok);
      await cizim.bitti;
      await cizim.tumunuCiz();
      if (document.fonts?.ready) await document.fonts.ready;
      const s = model.sayfa;
      return {
        tamam: true,
        ozet: {
          bolum: model.bolumler.length, kesildi: model.kesildi ? String(model.kesildi).slice(0, 20) : null, sablon: !!model.sablon,
          resimReddi: model.sayac?.resimReddi | 0, notSayisi: Array.isArray(model.notlar) ? model.notlar.length : 0,
          imza: !!model.imza?.var, hamXml: !!model.ham,
          sayfa: { en: sayi(s.en), boy: sayi(s.boy), sol: sayi(s.sol), sag: sayi(s.sag), ust: sayi(s.ust), alt: sayi(s.alt) },
          gosterilemeyenResim: document.querySelectorAll('.udf-resim.red').length,
        },
      };
    } catch (e) {
      if (e && e.name === 'AbortError') return { tamam: false, kod: 'iptal' };
      const kod = M && e instanceof M.UdfHatasi && typeof e.kod === 'string' ? e.kod.slice(0, 40) : 'hata';
      return { tamam: false, kod };
    }
  }

  Object.defineProperty(window, 'udfCizim', { value: Object.freeze({ parca, ciz }), writable: false, configurable: false });
})();
