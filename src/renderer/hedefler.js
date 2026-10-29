// PDF hedefleri (0.3.1, kullanıcı isteği: "tıklanabilir sayfa bölmeleri çalışmalı … içindekilere tıklayamıyorum"): sayfalar panelinin
// yer imleri (panel.js) ve sayfadaki iç bağlantılar (uygulama.js baglantiyaGit) aynı yoldan çözülür ve aynı kuralla gösterilir.
// Hedef iki biçimde gelir: açık hedef dizisi [sayfa başvurusu | sayfa dizini, {name: tür}, …parametreler] ya da adlandırılmış hedefin
// adı (PDF 1.1 /Dests sözlüğü ya da PDF 1.2+ Names ağacı; PDF.js getDestination ikisine de bakar). Parametreler PDF kullanıcı uzayındadır
// (y yukarı, sayfanın MediaBox / CropBox başlangıcı sıfır olmayabilir); ekrandaki yere sayfanın o anki görünüm dönüşümüyle (dosyadaki
// /Rotate + kullanıcının döndürmesi + görünüm döndürmesi) çevrilir. Hedef kaynak dosyanın sayfasıdır: sayfa silinmiş, eklenmiş ya da
// sıralanmışsa şimdiki yeri kaynak sayfasından bulunur. Hedefteki yakınlaştırma uygulanmaz (görünüm yakınlaştırması değişmez).
import { CSS_BIRIM, yolAnahtari } from './goruntuleyici.js';

/** PDF.js hedefi (ad ya da açık dizi) → { sayfa: kaynak dosyadaki sayfa (1 tabanlı), tur, p: parametreler } ; çözülemezse null. */
export async function hedefiCoz(pdfBelge, hedef) {
  if (!pdfBelge || hedef == null) return null;
  let dizi = hedef;
  try {
    if (typeof dizi === 'string') dizi = await pdfBelge.getDestination(dizi);
    if (!Array.isArray(dizi) || dizi[0] == null) return null;
    const ilk = dizi[0];
    const idx = typeof ilk === 'object' ? await pdfBelge.getPageIndex(ilk) : Number.isInteger(ilk) ? ilk : -1;
    if (!(idx >= 0 && idx < pdfBelge.numPages)) return null;
    return { sayfa: idx + 1, tur: dizi[1]?.name || 'XYZ', p: dizi.slice(2).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)) };
  } catch (e) {
    console.warn('Hedef çözülemedi', e);
    return null;
  }
}

/** Çekirdeğin açık hedefi ({tur, p, ref}) → PDF.js hedef dizisi (sayfa başvurusu {num, gen} ya da dizin). */
export const cekirdekHedefDizisi = (h) => [Array.isArray(h.ref) ? { num: h.ref[0], gen: h.ref[1] } : h.ref, { name: h.tur }, ...(h.p || [])];

/**
 * Hedefte pencerenin sol üst köşesine gelecek nokta, PDF kullanıcı uzayında [x, y] (view: sayfanın görünen kutusu [x0, y0, x1, y1]);
 * sayfanın başı isteniyorsa null. XYZ: (sol, üst), eksik olan sayfanın kenarı. FitH / FitBH: üst. FitR: kutunun sol üst köşesi.
 * FitV / FitBV: sol (sayfanın üstüyle). Fit / FitB: sayfanın başı.
 */
export function hedefNoktasi(tur, p, view) {
  const [x0, , , y1] = view;
  const sayi = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  switch (tur) {
    case 'XYZ': return sayi(p[0]) == null && sayi(p[1]) == null ? null : [sayi(p[0]) ?? x0, sayi(p[1]) ?? y1];
    case 'FitH': case 'FitBH': return sayi(p[0]) == null ? null : [x0, p[0]];
    case 'FitV': case 'FitBV': return sayi(p[0]) == null ? null : [p[0], y1];
    case 'FitR': {
      const d = p.map(sayi);
      if (d.length < 4 || d.some((v) => v == null)) return null;
      return [Math.min(d[0], d[2]), Math.max(d[1], d[3])];
    }
    default: return null;
  }
}

/**
 * Çekirdeğin verdiği iç bağlantının (goruntuleyici ekKatmanlar; kaynakYol: bağlantının bulunduğu dosya) çözülmüş hedefi
 * {sayfa, tur, p}; çözülemezse null. Açık hedefin sayfasını PyMuPDF çözer (çözemediyse PDF.js, sayfa başvurusundan). Adlandırılmış hedef
 * PDF.js ile çözülür: PyMuPDF onun türünü (Fit, FitH…) vermez; PDF.js bulamazsa PyMuPDF'in sayfası (sayfanın başı). Sonuç bağlantıda
 * saklanır (kaynak dosyanın hedefi değişmez; ipucu ve tıklama aynı sonucu kullanır).
 */
export function baglantiHedefi(g, l, kaynakYol) {
  if (l._hedef) return l._hedef;
  l._hedef = (async () => {
    if (l.hedef && l.sayfa) return { sayfa: l.sayfa, tur: l.hedef.tur, p: l.hedef.p || [] };
    if (l.hedef || l.ad) {
      let h = null;
      try { h = await hedefiCoz(await g.belgeAl(kaynakYol), l.hedef ? cekirdekHedefDizisi(l.hedef) : l.ad); } catch { h = null; }
      if (h) return h;
    }
    return l.sayfa ? { sayfa: l.sayfa, tur: 'Fit', p: [] } : null;
  })();
  return l._hedef;
}

/** Adlandırılmış eylemin (NextPage…) gideceği gösterilen sayfa (1 tabanlı; no: bağlantının bulunduğu sayfa, n: sayfa sayısı); belge
 *  sınırının dışındaysa ya da eylem bilinmiyorsa null. */
export function eylemSayfasi(eylem, no, n) {
  const hedef = { NextPage: no + 1, PrevPage: no - 1, FirstPage: 1, LastPage: n }[eylem];
  return hedef >= 1 && hedef <= n ? hedef : null;
}

/** Kaynak dosyanın (yol) sayfasının (1 tabanlı) görünümdeki indeksi; yoksa -1. */
export function gosterilenIndeks(g, yol, sayfa) {
  const k = yolAnahtari(yol);
  return g.sayfalar.findIndex((s) => !s.bos && yolAnahtari(s.kaynak.yol) === k && s.kaynak.sayfa === sayfa);
}

/**
 * Çözülmüş hedefin ({sayfa, tur, p}; sayfa kaynak dosya yol'un sayfası) görünümdeki yeri: { no: gösterilen sayfa (1 tabanlı), y, x }
 * (sayfayaGit'in secenek.y / x'i: gösterilen sayfanın sol üstünden pt; ikisi de yoksa sayfanın başı). Sayfa bu belgede yoksa null.
 */
export async function hedefKonumu(g, yol, h) {
  let i = gosterilenIndeks(g, yol, h.sayfa);
  if (i < 0) return null;
  const s = g.sayfalar[i];
  let konum = {};
  try {
    const pdfSayfa = await g.sayfaAl(i);
    const nokta = hedefNoktasi(h.tur, h.p || [], pdfSayfa.view);
    if (nokta) {
      const [x, y] = g.sayfaGorunumu(s, 1, pdfSayfa).convertToViewportPoint(nokta[0], nokta[1]);
      konum = { y: Math.max(0, y), x: Math.max(0, x) };
    }
  } catch (e) { console.warn('Hedefin konumu hesaplanamadı', e); }
  i = g.idx(s);   // sayfa beklenirken düzen değişmiş olabilir
  if (i < 0) return null;
  // Yatayda hedef noktası zaten görünüyorsa yatay kaydırma değişmez; görünmüyorsa nokta sol kenara gelir (sayfayaGit secenek.x).
  // Sayfa genişliğine sığdırılmış görünümde de geniş (yatay ya da döndürülmüş) bir sayfa yatay kaydırma açar: her bağlantıda görünümün
  // yana kayması okumayı bölüyordu (deneme belgesinde döndürülmüş sayfaya giden bağlantıdan sonra öbür sayfalar sola kaymış kalıyordu)
  const yer = g.yerlesim?.[i], kd = g.kaydirici;
  if (konum.x != null && yer && kd) {
    const hx = yer.x + konum.x * g.olcek * CSS_BIRIM;
    if (hx >= kd.scrollLeft && hx <= kd.scrollLeft + kd.clientWidth - 32) delete konum.x;
  }
  return { no: i + 1, ...konum };
}
