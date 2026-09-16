// Yazdırma (renderer): seçenek penceresi → çekirdekten sayfa görüntüleri (200 dpi JPEG) →
// yazdırma HTML'i → ana süreç ('yazdir:baslat') → Windows yazdırma diyaloğu.
//
// Sayfalar görüntü olarak basıldığından Türkçe karakterler, gömülü olmayan fontlar ve notlar
// ekranda göründüğü gibi çıkar; yazıcı sürücüsünün font eşlemesine bağımlılık yoktur.
//
// Dışa verilen API:
//   yazdir(baglam, belge)                          → Promise<void>
//   sayfaAraligiCoz(metin, toplam)                 → { sayfalar: number[] } | { hata: string }
//   yazdirmaHtmlOlustur(sayfalar, secenek)         → { html, sayfaBoyutu: { genislikMikron, yukseklikMikron }, kagit: { genislikMm, yukseklikMm } }
// Son ikisi saf işlevdir (DOM kullanmaz), Node'da sınanabilir.

const PT_MM = 25.4 / 72;            // 1 pt = 0,352778 mm
const PT_MIKRON = 25400 / 72;       // 1 pt = 352,778 mikron
const DPI = 200;                    // yazdırma çözünürlüğü
const JPEG_KALITE = 92;
const GUVENLI_KENAR_MM = 4;         // "Sayfaya sığdır" için yazıcıların basamadığı kenar payı
const COK_SAYFA_UYARISI = 150;      // bunun üstünde onay sor (bellek ve süre)

const KAGIT_ADLARI = [
  { ad: 'A4', g: 595.276, y: 841.89 }, { ad: 'A3', g: 841.89, y: 1190.55 }, { ad: 'A5', g: 419.528, y: 595.276 },
  { ad: 'Letter', g: 612, y: 792 }, { ad: 'Legal', g: 612, y: 1008 }, { ad: 'Tabloid', g: 792, y: 1224 },
];

const GEZINME_TUSLARI = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Delete', 'Backspace', 'Enter']);

/** Oturum boyunca hatırlanan son seçenekler. */
let sonSecenek = { aralik: 'tumu', aralikMetni: '', olcek: 'sigdir', ciftTarafli: 'tek', notlar: true };
let acikPencere = null;

// ---------------------------------------------------------------- ana akış
/**
 * Etkin belgeyi yazdırır.
 * @param {{ cekirdek: Function, pdefe: any, mesajKutusu: Function, bildir: Function, kaydet: (belge:any)=>Promise<boolean> }} baglam
 * @param {{ yol: string, ad: string, degisti: boolean, gorunum: { gecerli: number, sayfaSayisi: number } }} belge
 */
export async function yazdir(baglam, belge) {
  const { cekirdek, pdefe, mesajKutusu, bildir } = baglam;
  if (!belge) { bildir?.('Yazdırılacak belge yok.'); return; }
  if (acikPencere) { acikPencere.querySelector('button, input')?.focus(); return; }
  stilYukle();

  // 1) Kaydedilmemiş değişiklik: yazdırma dosyadaki halden yapılır
  if (belge.degisti) {
    const { secim } = await mesajKutusu({
      mesaj: 'Yazdırmadan önce kaydedilsin mi?',
      ayrinti: `"${belge.ad}" belgesinde kaydedilmemiş değişiklikler var. Yazdırma, dosyanın diskteki halinden yapılır; kaydetmezseniz yeni notlar çıktıda görünmez.`,
      dugmeler: ['Kaydet ve yazdır', 'Kaydetmeden yazdır', 'Vazgeç'], varsayilan: 0, iptal: 2,
    });
    if (secim === 2) return;
    if (secim === 0) {
      const tamam = await baglam.kaydet(belge);
      if (!tamam) return;
    }
  }

  const toplam = belge.gorunum?.sayfaSayisi || 0;
  if (!toplam) { bildir?.('Belgede yazdırılacak sayfa yok.'); return; }

  // 2) Seçenekler
  const secenek = await secenekPenceresi(belge, toplam);
  if (!secenek) return;
  sonSecenek = { ...secenek, aralikMetni: secenek.aralikMetni };

  const sayfaNolari = secenek.sayfalar;
  if (sayfaNolari.length > COK_SAYFA_UYARISI) {
    const { secim } = await mesajKutusu({
      mesaj: `${sayfaNolari.length} sayfa yazdırılacak.`,
      ayrinti: 'Bu kadar sayfanın hazırlanması uzun sürebilir ve çok bellek kullanır. Devam edilsin mi?',
      dugmeler: ['Devam', 'Vazgeç'], varsayilan: 0, iptal: 1,
    });
    if (secim !== 0) return;
  }

  // 3) Görüntüleri al (ilerleme + iptal)
  const ilerleme = ilerlemePenceresi(`"${belge.ad}" yazdırmaya hazırlanıyor`);
  const sayfalar = [];
  try {
    for (let i = 0; i < sayfaNolari.length; i++) {
      if (ilerleme.iptal) { ilerleme.kapat(); bildir?.('Yazdırma vazgeçildi.'); return; }
      const no = sayfaNolari[i];
      ilerleme.guncelle((i / sayfaNolari.length) * 100, `Sayfa ${no} hazırlanıyor (${i + 1}/${sayfaNolari.length})`);
      const r = await cekirdek('sayfa_goruntu', { yol: belge.yol, sayfa: no, dpi: DPI, notlar: !!secenek.notlar, bicim: 'jpeg', kalite: JPEG_KALITE });
      if (!r || !r.veri) throw new Error(`Sayfa ${no} görüntüsü alınamadı.`);
      sayfalar.push({ no, veri: r.veri, bicim: r.bicim || 'jpeg', genislikPt: r.genislikPt, yukseklikPt: r.yukseklikPt, genislik: r.genislik, yukseklik: r.yukseklik });
    }
    if (ilerleme.iptal) { ilerleme.kapat(); bildir?.('Yazdırma vazgeçildi.'); return; }
    ilerleme.guncelle(100, 'Yazdırma diyaloğu açılıyor…');
    ilerleme.iptalKapat();

    // 4) HTML kur, ana sürece gönder
    const { html, sayfaBoyutu } = yazdirmaHtmlOlustur(sayfalar, { olcek: secenek.olcek, baslik: belge.ad });
    const sonuc = await pdefe.cagir('yazdir:baslat', { html, secenekler: { ciftTarafli: secenek.ciftTarafli, sayfaBoyutu } });
    ilerleme.kapat();
    if (sonuc?.basarili) bildir?.(`Yazıcıya gönderildi: ${sayfalar.length} sayfa`);
    else if (sonuc?.iptal) bildir?.('Yazdırma vazgeçildi.');
    else await mesajKutusu({ tur: 'error', mesaj: 'Yazdırılamadı', ayrinti: sonuc?.hata || 'Bilinmeyen hata' });
  } catch (e) {
    ilerleme.kapat();
    console.error('Yazdırma hatası', e);
    await mesajKutusu({ tur: 'error', mesaj: 'Yazdırılamadı', ayrinti: hataMetni(e) });
  }
}

// ---------------------------------------------------------------- sayfa aralığı
/**
 * "1-3,5, 8-" biçimindeki aralık metnini sayfa listesine çevirir (sıralı, tekrarsız).
 * Hatalıysa { hata } döner.
 */
export function sayfaAraligiCoz(metin, toplam) {
  const t = String(metin || '').replace(/\s+/g, '').replace(/;/g, ',').replace(/–|—/g, '-');
  if (!t) return { hata: 'Sayfa aralığı boş. Örnek: 1-3,5' };
  const kume = new Set();
  for (const parca of t.split(',')) {
    if (!parca) continue;
    const m = /^(\d*)-(\d*)$/.exec(parca);
    let bas, son;
    if (m) {
      if (!m[1] && !m[2]) return { hata: `Geçersiz aralık: "${parca}"` };
      bas = m[1] ? parseInt(m[1], 10) : 1;
      son = m[2] ? parseInt(m[2], 10) : toplam;
    } else if (/^\d+$/.test(parca)) {
      bas = son = parseInt(parca, 10);
    } else {
      return { hata: `Geçersiz ifade: "${parca}". Örnek: 1-3,5` };
    }
    if (bas < 1 || son < 1) return { hata: 'Sayfa numaraları 1\'den başlar.' };
    if (bas > toplam || son > toplam) return { hata: `Belgede ${toplam} sayfa var; ${Math.max(bas, son)} numaralı sayfa yok.` };
    if (bas > son) [bas, son] = [son, bas];
    for (let i = bas; i <= son; i++) kume.add(i);
  }
  if (!kume.size) return { hata: 'Yazdırılacak sayfa seçilmedi.' };
  return { sayfalar: [...kume].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------- yazdırma HTML'i
/**
 * Yazdırma belgesini kurar.
 *
 * Kâğıt: seçilen sayfalar arasında en sık görülen (dikey yönelimli) boyut tek kâğıt boyutu olarak
 * kullanılır; Windows yazdırma işinde kâğıt boyutu tektir ve sürücüler sayfa başına yön değişimini
 * güvenilir biçimde desteklemez. Yatay sayfalar (g > y) kâğıt üzerinde 90° döndürülerek basılır
 * (referans okuyucunun "otomatik döndür" davranışı). Böylece karışık yönlü belgeler de tek işte, kesilmeden çıkar.
 *
 * "sigdir": görüntü, kâğıda (GUVENLI_KENAR_MM payıyla) oranı korunarak sığdırılır.
 * "gercek": görüntü PDF'teki pt boyutlarıyla basılır, kâğıt ortasına yerleşir; taşan kısım kesilir.
 *
 * @param {Array<{no:number, veri:string, bicim:string, genislikPt:number, yukseklikPt:number}>} sayfalar
 * @param {{ olcek: 'sigdir'|'gercek', baslik?: string }} secenek
 */
export function yazdirmaHtmlOlustur(sayfalar, secenek = {}) {
  if (!Array.isArray(sayfalar) || !sayfalar.length) throw new Error('Yazdırılacak sayfa yok.');
  const olcekModu = secenek.olcek === 'gercek' ? 'gercek' : 'sigdir';
  const kagit = kagitSec(sayfalar);
  const KG = kagit.genislikMm, KY = kagit.yukseklikMm;
  const mm = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

  const parcalar = [];
  for (const s of sayfalar) {
    const g = Number(s.genislikPt) || 595.276, y = Number(s.yukseklikPt) || 841.89;
    const yatay = g > y;
    // Kâğıt üzerindeki kaplama kutusu (döndürülmüşse en/boy yer değiştirir)
    const kutuG = (yatay ? y : g) * PT_MM, kutuY = (yatay ? g : y) * PT_MM;
    let olcek = 1;
    if (olcekModu === 'sigdir') {
      olcek = Math.min((KG - 2 * GUVENLI_KENAR_MM) / kutuG, (KY - 2 * GUVENLI_KENAR_MM) / kutuY);
      if (!Number.isFinite(olcek) || olcek <= 0) olcek = 1;
    }
    const imgG = g * PT_MM * olcek, imgY = y * PT_MM * olcek;
    const mime = s.bicim === 'png' ? 'image/png' : 'image/jpeg';
    parcalar.push(
      `<div class="sayfa" data-no="${s.no}"><img class="${yatay ? 'don' : ''}" alt="Sayfa ${s.no}" style="width:${mm(imgG)}mm;height:${mm(imgY)}mm" src="data:${mime};base64,${s.veri}"></div>`,
    );
  }

  const baslik = kacis(secenek.baslik ? `${secenek.baslik} — PDEfe` : 'PDEfe yazdırma');
  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';">
<style>
@page { size: ${mm(KG)}mm ${mm(KY)}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { width: ${mm(KG)}mm; }
.sayfa { position: relative; width: ${mm(KG)}mm; height: ${mm(KY)}mm; overflow: hidden; break-after: page; page-break-after: always; break-inside: avoid; }
.sayfa:last-child { break-after: auto; page-break-after: auto; }
.sayfa img { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: block; image-rendering: auto; }
.sayfa img.don { transform: translate(-50%, -50%) rotate(90deg); }
@media screen { body { background: #888; } .sayfa { margin: 8mm auto; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.4); } }
@media print { html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
${parcalar.join('\n')}
</body></html>`;

  return {
    html,
    sayfaBoyutu: { genislikMikron: Math.round(kagit.genislikPt * PT_MIKRON), yukseklikMikron: Math.round(kagit.yukseklikPt * PT_MIKRON) },
    kagit: { genislikMm: KG, yukseklikMm: KY, ad: kagit.ad },
  };
}

/** Seçilen sayfalar arasında en sık görülen dikey (portre) boyutu kâğıt olarak seçer. */
function kagitSec(sayfalar) {
  const sayim = new Map();
  for (const s of sayfalar) {
    const g = Number(s.genislikPt) || 595.276, y = Number(s.yukseklikPt) || 841.89;
    const kisa = Math.min(g, y), uzun = Math.max(g, y);
    const anahtar = `${Math.round(kisa * 2) / 2}x${Math.round(uzun * 2) / 2}`;
    const k = sayim.get(anahtar) || { kisa, uzun, adet: 0 };
    k.adet++;
    sayim.set(anahtar, k);
  }
  // En çok tekrar eden; eşitlikte daha büyük olan (küçük sayfalar büyük kâğıda sığar, tersi kesilir)
  let secili = null;
  for (const k of sayim.values()) {
    if (!secili || k.adet > secili.adet || (k.adet === secili.adet && k.kisa * k.uzun > secili.kisa * secili.uzun)) secili = k;
  }
  // Standart kâğıda çok yakınsa (±2 pt) tam standart ölçüyü kullan: sürücü bilinen boyutu daha iyi tanır
  let ad = null, kisa = secili.kisa, uzun = secili.uzun;
  for (const k of KAGIT_ADLARI) {
    if (Math.abs(k.g - kisa) <= 2 && Math.abs(k.y - uzun) <= 2) { ad = k.ad; kisa = k.g; uzun = k.y; break; }
  }
  return { ad, genislikPt: kisa, yukseklikPt: uzun, genislikMm: kisa * PT_MM, yukseklikMm: uzun * PT_MM };
}

// ---------------------------------------------------------------- seçenek penceresi
function secenekPenceresi(belge, toplam) {
  return new Promise((coz) => {
    const gecerli = belge.gorunum?.gecerli || 1;
    const ortu = document.createElement('div');
    ortu.className = 'diyalog-ortusu';
    ortu.innerHTML = `
<div class="diyalog yazdir-diyalog" role="dialog" aria-label="Yazdır">
  <div class="baslik">Yazdır</div>
  <div class="govde">
    <div class="yazdir-belge" title="${kacis(belge.yol || '')}">${kacis(belge.ad || '')} <span class="soluk">· ${toplam} sayfa</span></div>
    <fieldset class="yazdir-grup">
      <legend>Sayfalar</legend>
      <label><input type="radio" name="aralik" value="tumu"> Tümü</label>
      <label><input type="radio" name="aralik" value="gecerli"> Geçerli sayfa <span class="soluk">(${gecerli})</span></label>
      <label class="yazdir-aralik"><input type="radio" name="aralik" value="aralik"> Aralık: <input type="text" name="aralikMetni" class="kutu" placeholder="1-3,5" spellcheck="false"></label>
      <div class="yazdir-hata" hidden></div>
    </fieldset>
    <fieldset class="yazdir-grup">
      <legend>Boyut</legend>
      <label><input type="radio" name="olcek" value="sigdir"> Sayfaya sığdır</label>
      <label><input type="radio" name="olcek" value="gercek"> Gerçek boyut</label>
    </fieldset>
    <fieldset class="yazdir-grup">
      <legend>Çift taraflı</legend>
      <label><input type="radio" name="ciftTarafli" value="tek"> Tek taraflı</label>
      <label><input type="radio" name="ciftTarafli" value="uzun"> Çift taraflı (uzun kenardan çevir)</label>
      <label><input type="radio" name="ciftTarafli" value="kisa"> Çift taraflı (kısa kenardan çevir)</label>
    </fieldset>
    <label class="yazdir-notlar"><input type="checkbox" name="notlar"> Notları yazdır</label>
    <p class="soluk yazdir-aciklama">Yazıcı, kopya sayısı ve kâğıt kaynağı bir sonraki adımda Windows yazdırma penceresinden seçilir. Sayfalar görüntü olarak basılır; Türkçe karakterler ve notlar ekranda göründüğü gibi çıkar.</p>
  </div>
  <div class="dugmeler"><button class="birincil" data-id="yazdir">Yazdır…</button><button class="ikincil" data-id="iptal">Vazgeç</button></div>
</div>`;
    const sec = (ad) => ortu.querySelector(`[name="${ad}"]`);
    const radyoKoy = (ad, deger) => { const el = ortu.querySelector(`[name="${ad}"][value="${deger}"]`) || ortu.querySelector(`[name="${ad}"]`); if (el) el.checked = true; };
    radyoKoy('aralik', sonSecenek.aralik);
    radyoKoy('olcek', sonSecenek.olcek);
    radyoKoy('ciftTarafli', sonSecenek.ciftTarafli);
    sec('notlar').checked = sonSecenek.notlar !== false;
    const aralikGirdi = sec('aralikMetni');
    aralikGirdi.value = sonSecenek.aralikMetni || '';
    const hataEl = ortu.querySelector('.yazdir-hata');

    // Aralık kutusuna yazınca "Aralık" seçilsin
    aralikGirdi.addEventListener('focus', () => { radyoKoy('aralik', 'aralik'); });
    aralikGirdi.addEventListener('input', () => { radyoKoy('aralik', 'aralik'); hataEl.hidden = true; });
    ortu.querySelectorAll('[name="aralik"]').forEach((r) => r.addEventListener('change', () => { hataEl.hidden = true; }));

    const kapat = (sonuc) => { ortu.remove(); acikPencere = null; coz(sonuc); };
    const onayla = () => {
      const aralik = ortu.querySelector('[name="aralik"]:checked')?.value || 'tumu';
      let sayfalar;
      if (aralik === 'tumu') sayfalar = Array.from({ length: toplam }, (_, i) => i + 1);
      else if (aralik === 'gecerli') sayfalar = [Math.min(Math.max(1, gecerli), toplam)];
      else {
        const r = sayfaAraligiCoz(aralikGirdi.value, toplam);
        if (r.hata) { hataEl.textContent = r.hata; hataEl.hidden = false; aralikGirdi.focus(); aralikGirdi.select(); return; }
        sayfalar = r.sayfalar;
      }
      kapat({
        aralik, aralikMetni: aralikGirdi.value.trim(), sayfalar,
        olcek: ortu.querySelector('[name="olcek"]:checked')?.value || 'sigdir',
        ciftTarafli: ortu.querySelector('[name="ciftTarafli"]:checked')?.value || 'tek',
        notlar: sec('notlar').checked,
      });
    };
    ortu.querySelector('[data-id="yazdir"]').addEventListener('click', onayla);
    ortu.querySelector('[data-id="iptal"]').addEventListener('click', () => kapat(null));
    ortu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); kapat(null); return; }
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); onayla(); }
      if (GEZINME_TUSLARI.has(e.key)) e.stopPropagation();   // belge kısayollarına sızmasın
    });
    ortu.addEventListener('mousedown', (e) => { if (e.target === ortu) { /* dış tık: kapatma, odak diyalogda kalsın */ e.preventDefault(); } });
    document.body.append(ortu);
    acikPencere = ortu;
    ortu.querySelector('[data-id="yazdir"]').focus();
  });
}

// ---------------------------------------------------------------- ilerleme penceresi
function ilerlemePenceresi(baslik) {
  const ortu = document.createElement('div');
  ortu.className = 'diyalog-ortusu';
  ortu.innerHTML = `
<div class="diyalog yazdir-ilerleme" role="dialog" aria-label="Yazdırma hazırlanıyor">
  <div class="baslik"></div>
  <div class="govde">
    <div class="yazdir-cubuk"><div class="yazdir-cubuk-ic" style="width:0%"></div></div>
    <div class="yazdir-mesaj soluk">Başlıyor…</div>
  </div>
  <div class="dugmeler"><button class="ikincil" data-id="iptal">Vazgeç</button></div>
</div>`;
  ortu.querySelector('.baslik').textContent = baslik;
  const cubuk = ortu.querySelector('.yazdir-cubuk-ic');
  const mesaj = ortu.querySelector('.yazdir-mesaj');
  const iptalDugme = ortu.querySelector('[data-id="iptal"]');
  const durum = {
    iptal: false,
    guncelle(yuzde, metin) { cubuk.style.width = Math.max(0, Math.min(100, yuzde)).toFixed(1) + '%'; if (metin != null) mesaj.textContent = metin; },
    iptalKapat() { iptalDugme.disabled = true; },
    kapat() { ortu.remove(); if (acikPencere === ortu) acikPencere = null; },
  };
  iptalDugme.addEventListener('click', () => { durum.iptal = true; iptalDugme.disabled = true; mesaj.textContent = 'Vazgeçiliyor…'; });
  ortu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (!iptalDugme.disabled) iptalDugme.click(); return; }
    if (GEZINME_TUSLARI.has(e.key)) e.stopPropagation();
  });
  document.body.append(ortu);
  acikPencere = ortu;
  iptalDugme.focus();
  return durum;
}

// ---------------------------------------------------------------- yardımcılar
/** ayarlar.css'i (yazdırma ve ayarlar penceresi stilleri) bir kez sayfaya ekler. */
function stilYukle() {
  if (typeof document === 'undefined' || document.getElementById('pdefe-ayarlar-stil')) return;
  const link = document.createElement('link');
  link.id = 'pdefe-ayarlar-stil';
  link.rel = 'stylesheet';
  link.href = new URL('./ayarlar.css', import.meta.url).href;
  document.head.append(link);
}

function kacis(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hataMetni(e) { return (e && (e.message || String(e))) || 'Bilinmeyen hata'; }
