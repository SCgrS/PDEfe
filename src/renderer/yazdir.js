// Yazdırma (renderer): PDEfe'nin yazdırma penceresi (yazıcı, kopya, sayfalar, kâğıt, boyut, renk, çift taraflı, notlar ve büyük ön
// izleme) → çekirdekten sayfa görüntüleri (200 dpi JPEG), her biri ayrı IPC iletisiyle ana sürece ('yazdir:sayfaEkle') → küçük HTML
// iskeleti ('yazdir:baslat') → seçilen yazıcı.
//
// 0.2.6: Windows'un yazdırma kutusu açılmaz (ana süreç webContents.print silent:true + deviceName; gerekçe main/yazdir.js'te). Yazıcı ve
// öteki seçimler bu pencerede yapılır, ön izleme basılacak kâğıdı gösterir (yerleşim yazdirYerlesim.js'te, HTML'le aynı işlev). Windows'un
// (macOS'un) yazdırma penceresi alttaki bağlantıyla yedek yol olarak durur.
//
// Sayfalar görüntü olarak basıldığından Türkçe karakterler ve gömülü olmayan fontlar ekranda göründüğü gibi çıkar; yazıcı sürücüsünün font
// eşlemesine bağımlılık yoktur. "Notları yazdır" varsayılan kapalıdır; kapalıyken çekirdek sayfayı get_pixmap(annots=False) ile yalnızca
// içerikten çizer, bu yüzden notlar, damgalar ve form alanları (widget) da basılmaz. Ön izleme de aynı çekirdek yöntemiyle (sayfa_goruntu,
// notlar seçimiyle) çizilir; küçük resim (kucuk_resim) her zaman notlu çizdiği için kullanılmaz.
//
// Görüntüler tek bir HTML dizesinde toplanmaz: her sayfa ana süreçte geçici iş klasörüne dosya olarak yazılır ve HTML yalnızca
// <img src="s0001.jpg"> satırlarından oluşur. Böylece 756 sayfalık belgeler bile V8 dize sınırına (512 MB) ya da IPC ileti sınırına takılmaz.
//
// Hatırlananlar: yazıcı, harmanla, kâğıt, boyut, renk ve çift taraflı kalıcıdır (ayar 'yazdirma'); sayfa seçimi ve "Notları yazdır" yalnızca
// oturum boyunca, kopya sayısı her pencerede 1'den başlar.
//
// Dışa verilen API:
//   yazdir(baglam, belge)                          → Promise<void>
//     baglam = { cekirdek, pdefe, mesajKutusu, bildir, kaydet(belge), ayar?: () => ayarlar }
//     belge  = { yol, ad, degisti, kaydediliyor?, gorunum: { gecerli, sayfaSayisi, yapisalKirli?() } }
//   sayfaAraligiCoz, yazdirmaHtmlOlustur           → yazdirYerlesim.js'ten (saf işlevler, Node'da sınanır)
import { ayarlarPenceresiKapat } from './ayarlarPenceresi.js';
import { ortuTiklamasiBagla } from './ortu.js';
import { MAC, SISTEM } from './platform.js';
import { secilenSayfalar, kagitSec, sayfaYerlesimi, yazdirmaHtmlOlustur, kagitEtiketi, ozetMetni, onizlemeDpi, KAGITLAR, kacis } from './yazdirYerlesim.js';

export { sayfaAraligiCoz, yazdirmaHtmlOlustur } from './yazdirYerlesim.js';

const DPI = 200;                    // yazdırma çözünürlüğü
const JPEG_KALITE = 92;
const ONIZLEME_KALITE = 80;
const ONIZLEME_ONBELLEK = 40;       // ön izleme görüntüsü (sayfa × notlar × dpi); her biri ~50–150 KB
const COK_SAYFA_UYARISI = 150;      // bunun üstünde onay sor (süre ve yazıcı kuyruğu belleği)
const KAYIT_BEKLEME_MS = 30_000;    // süren bir kaydetme için en çok bu kadar beklenir
const EN_FAZLA_KOPYA = 99;

const GEZINME_TUSLARI = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Delete', 'Backspace', 'Enter']);
const ODAKLANABILIR = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Kalıcı seçimlerin (ayar 'yazdirma') geçerli değerleri; ilki varsayılan. */
const SECENEKLER = {
  kagit: ['belge', ...KAGITLAR.map((k) => k.ad)],
  olcek: ['sigdir', 'gercek'],
  renk: ['renkli', 'siyahBeyaz'],
  ciftTarafli: ['yazici', 'tek', 'uzun', 'kisa'],
};
const CIFT_TARAFLI_ADLARI = { yazici: 'Yazıcının ayarı', tek: 'Tek taraflı', uzun: 'Çift taraflı (uzun kenardan çevir)', kisa: 'Çift taraflı (kısa kenardan çevir)' };

/** Oturum boyunca hatırlanan seçimler (pencere başına). */
let sonSecenek = { aralik: 'tumu', aralikMetni: '', notlar: false };
let acikPencere = null;

// ---------------------------------------------------------------- ana akış
/**
 * Etkin belgeyi yazdırır.
 * @param {{ cekirdek: Function, pdefe: any, mesajKutusu: Function, bildir: Function, kaydet: (belge:any)=>Promise<boolean>, ayar?: Function }} baglam
 * @param {{ yol: string, ad: string, degisti: boolean, kaydediliyor?: boolean, gorunum: { gecerli: number, sayfaSayisi: number, yapisalKirli?: Function } }} belge
 */
export async function yazdir(baglam, belge) {
  const { cekirdek, pdefe, mesajKutusu, bildir } = baglam;
  if (!belge) { bildir?.('Yazdırılacak belge yok.'); return; }
  if (acikPencere) { acikPencere.querySelector('button, input')?.focus(); return; }
  // Ayarlar penceresi açıkken (Ctrl+P menü kısayolu örtüyü aşar) diyaloglar onun altında kalmasın
  try { ayarlarPenceresiKapat(); } catch { /* önemsiz */ }
  stilYukle();

  // 0) Süren bir kaydetme (otomatik kaydet) varsa bitmesini bekle: yarım yazılmış dosya okunmasın
  if (!(await kaydetmeyiBekle(belge))) { bildir?.('Kaydetme bitmediği için yazdırılamadı; biraz sonra yeniden deneyin.'); return; }

  // 1) Dosya diskte mi? (yazdırma dosyadaki hâlden yapılır)
  let diskteVar = true;
  try { diskteVar = await pdefe.cagir('dosya:varMi', belge.yol); } catch { diskteVar = true; /* denetlenemedi; çekirdek hatası yakalanır */ }
  if (!diskteVar) {
    await mesajKutusu({ tur: 'error', mesaj: 'Yazdırılamadı', ayrinti: `"${belge.ad}" dosyası diskte bulunamadı; taşınmış ya da silinmiş olabilir. Önce "Farklı kaydet" ile yeni bir konuma kaydedin.` });
    return;
  }

  // 2) Kaydedilmemiş değişiklik: yazdırma dosyadaki hâlden yapılır
  if (belge.degisti) {
    const yapisal = yapisalKirliMi(belge);
    const otomatik = !yapisal && !!baglam.ayar?.()?.otomatikKaydet;
    let secim;
    if (otomatik) {
      secim = 0;   // otomatik kaydet açık: zaten kaydedilecek, sormadan kaydet
    } else if (yapisal) {
      ({ secim } = await mesajKutusu({
        mesaj: 'Yazdırmadan önce kaydedilmesi gerekiyor',
        ayrinti: `"${belge.ad}" belgesinde sayfa yapısı değişti (sayfa ekleme, silme, sıralama ya da döndürme). Yazdırma dosyanın diskteki hâlinden yapılır; kaydetmeden yazdırılırsa eski sayfa düzeni basılır.`,
        dugmeler: ['Kaydet ve yazdır', 'Vazgeç'], varsayilan: 0, iptal: 1,
      }));
      if (secim !== 0) return;
    } else {
      ({ secim } = await mesajKutusu({
        mesaj: 'Yazdırmadan önce kaydedilsin mi?',
        ayrinti: `"${belge.ad}" belgesinde kaydedilmemiş değişiklikler var. Yazdırma, dosyanın diskteki hâlinden yapılır; kaydetmezseniz yeni notlar çıktıda görünmez.`,
        dugmeler: ['Kaydet ve yazdır', 'Kaydetmeden yazdır', 'Vazgeç'], varsayilan: 0, iptal: 2,
      }));
      if (secim === 2) return;
    }
    if (secim === 0) {
      if (!(await kaydetmeyiBekle(belge))) { bildir?.('Kaydetme bitmediği için yazdırılamadı.'); return; }
      const tamam = await baglam.kaydet(belge);
      if (!tamam) return;
      if (!(await kaydetmeyiBekle(belge))) { bildir?.('Kaydetme bitmediği için yazdırılamadı.'); return; }
    }
  }

  // 3) Sayfa sayısı ve ölçüleri DİSKTEKİ dosyadan (görünümle farklı olabilir). Ölçüler ön izlemenin ve "Belgeye göre" kâğıdın içindir;
  //    okunamazsa sayfa sayısı belge bilgisinden, ölçüler ön izleme görüntülerinden gelir
  let toplam = 0;
  const boyutlar = new Map();   // sayfa no → { genislikPt, yukseklikPt } (döndürme uygulanmış)
  try {
    const r = await cekirdek('sayfa_boyutlari', { yol: belge.yol });
    toplam = Number(r?.sayfa) || 0;
    (r?.sayfalar || []).forEach((s, i) => boyutlar.set(i + 1, { genislikPt: Number(s.genislik), yukseklikPt: Number(s.yukseklik) }));
  } catch {
    try {
      const bilgi = await cekirdek('belge_bilgi', { yol: belge.yol });
      toplam = Number(bilgi?.sayfa) || 0;
    } catch (e) {
      await mesajKutusu({ tur: 'error', mesaj: 'Yazdırılamadı', ayrinti: 'Belge bilgisi okunamadı: ' + cekirdekHataMetni(e) });
      return;
    }
  }
  if (!toplam) { bildir?.('Belgede yazdırılacak sayfa yok.'); return; }
  const gorunumSayisi = Number(belge.gorunum?.sayfaSayisi) || toplam;
  const gecerli = Math.min(Math.max(1, Number(belge.gorunum?.gecerli) || 1), toplam);
  const uyari = gorunumSayisi !== toplam
    ? `Görünümde ${gorunumSayisi} sayfa var, dosyada ${toplam}. Yazdırma dosyadaki sayfa düzeniyle yapılır.`
    : '';

  // 4) Seçenekler
  let kayitli = {};
  try { kayitli = (await pdefe.cagir('ayar:al', 'yazdirma')) || {}; } catch { kayitli = {}; }
  const secenek = await secenekPenceresi(baglam, belge, { toplam, gecerli, uyari, gecerliDevre: gorunumSayisi !== toplam, boyutlar, kayitli });
  if (!secenek) return;
  sonSecenek = { aralik: secenek.aralik, aralikMetni: secenek.aralikMetni, notlar: secenek.notlar };
  if (!secenek.sistemPenceresi) {
    const kayit = { yazici: secenek.yazici, harmanla: secenek.harmanla, kagit: secenek.kagit, olcek: secenek.olcek, renk: secenek.renk, ciftTarafli: secenek.ciftTarafli };
    pdefe.cagir('ayar:koy', 'yazdirma', kayit).catch(() => {});
    try { const a = baglam.ayar?.(); if (a) a.yazdirma = kayit; } catch { /* önemsiz */ }
  }

  const sayfaNolari = secenek.sayfalar;
  if (sayfaNolari.length > COK_SAYFA_UYARISI) {
    const { secim } = await mesajKutusu({
      mesaj: `${sayfaNolari.length} sayfa yazdırılacak.`,
      ayrinti: `Hazırlık yaklaşık ${Math.ceil(sayfaNolari.length / 6)} saniye sürer ve yazıcı kuyruğu çok bellek kullanır. Devam edilsin mi?`,
      dugmeler: ['Devam', 'Vazgeç'], varsayilan: 0, iptal: 1,
    });
    if (secim !== 0) return;
  }

  // 5) Görüntüleri al, sayfa sayfa ana sürece yaz (ilerleme + iptal)
  const ilerleme = ilerlemePenceresi(`"${belge.ad}" yazdırmaya hazırlanıyor`);
  let is = null;
  const vazgec = async (mesaj = 'Yazdırma vazgeçildi.') => {
    ilerleme.kapat();
    if (is) await pdefe.cagir('yazdir:iptal', { is }).catch(() => {});
    is = null;
    if (mesaj) bildir?.(mesaj);
  };
  try {
    const hazirlik = await pdefe.cagir('yazdir:hazirla');
    if (!hazirlik?.basarili || !hazirlik.is) throw new Error(hazirlik?.hata || 'Yazdırma işi başlatılamadı.');
    is = hazirlik.is;
    if (ilerleme.iptal) { await vazgec(); return; }

    const sayfalar = [];
    let toplamBayt = 0;
    for (let i = 0; i < sayfaNolari.length; i++) {
      if (ilerleme.iptal) { await vazgec(); return; }
      const no = sayfaNolari[i];
      ilerleme.guncelle((i / sayfaNolari.length) * 100, `Sayfa ${no} hazırlanıyor (${i + 1}/${sayfaNolari.length}${toplamBayt ? ' · ' + mb(toplamBayt) + ' MB' : ''})`);
      let r;
      try {
        r = await cekirdek('sayfa_goruntu', { yol: belge.yol, sayfa: no, dpi: DPI, notlar: !!secenek.notlar, bicim: 'jpeg', kalite: JPEG_KALITE });
      } catch (e) {
        if (ilerleme.iptal) { await vazgec(); return; }
        throw new Error(`Sayfa ${no} hazırlanamadı: ${cekirdekHataMetni(e)}`);
      }
      if (!r || !r.veri) throw new Error(`Sayfa ${no} görüntüsü alınamadı.`);
      if (ilerleme.iptal) { await vazgec(); return; }
      const yazim = await pdefe.cagir('yazdir:sayfaEkle', { is, sira: i + 1, veri: r.veri, bicim: r.bicim || 'jpeg' });
      if (!yazim?.basarili) throw new Error(yazim?.hata || `Sayfa ${no} geçici klasöre yazılamadı.`);
      toplamBayt = yazim.toplamBayt || toplamBayt;
      sayfalar.push({ no, kaynak: yazim.dosya, bicim: r.bicim || 'jpeg', genislikPt: r.genislikPt, yukseklikPt: r.yukseklikPt, genislik: r.genislik, yukseklik: r.yukseklik });
    }
    if (ilerleme.iptal) { await vazgec(); return; }

    // 6) HTML iskeletini kur, ana sürece gönder; Vazgeç artık işi (ya da Windows'un penceresini) kapatır
    const { html, sayfaBoyutu } = yazdirmaHtmlOlustur(sayfalar, { olcek: secenek.olcek, kagit: secenek.kagit, baslik: belge.ad });
    const ozet = ozetMetni(sayfalar.length, secenek.sistemPenceresi ? 1 : secenek.kopya);
    let asamaMetni;
    if (secenek.sistemPenceresi) asamaMetni = `${SISTEM} yazdırma penceresi açılıyor… (${sayfalar.length} sayfa, ${mb(toplamBayt)} MB)`;
    else if (secenek.dosyayaYazar) asamaMetni = `"${secenek.yaziciAdi}" çıktıyı dosyaya kaydeder: kaydedileceği yer soruluyor. "Çıktıyı Farklı Kaydet" penceresi görünmüyorsa görev çubuğuna bakın.`;
    else asamaMetni = `"${secenek.yaziciAdi}" yazıcısına gönderiliyor… (${ozet}, ${mb(toplamBayt)} MB)`;
    ilerleme.guncelle(100, asamaMetni);
    const isId = is;
    ilerleme.diyalogAsamasi(() => pdefe.cagir('yazdir:iptal', { is: isId }).catch(() => {}));
    const sonuc = await pdefe.cagir('yazdir:baslat', {
      is, html,
      secenekler: { yazici: secenek.yazici, kopya: secenek.kopya, harmanla: secenek.harmanla, renk: secenek.renk, ciftTarafli: secenek.ciftTarafli, sayfaBoyutu, sistemPenceresi: !!secenek.sistemPenceresi },
    });
    is = null;   // ana süreç işi bitirdi ve klasörü sildi
    ilerleme.kapat();
    if (sonuc?.basarili) {
      if (secenek.sistemPenceresi) bildir?.(`Yazıcıya gönderildi: ${sayfalar.length} sayfa`);
      else bildir?.(`"${secenek.yaziciAdi}" yazıcısına gönderildi: ${ozet}${secenek.cevrimDisi ? ' (yazıcı çevrim dışı görünüyor; iş, yazıcı açılınca basılır)' : ''}`);
    } else if (sonuc?.iptal || ilerleme.iptal) bildir?.('Yazdırma vazgeçildi.');
    else await mesajKutusu({ tur: 'error', mesaj: 'Yazdırılamadı', ayrinti: sonuc?.hata || 'Bilinmeyen hata' });
  } catch (e) {
    const iptaldi = ilerleme.iptal;
    await vazgec(null);
    if (iptaldi) { bildir?.('Yazdırma vazgeçildi.'); return; }
    console.error('Yazdırma hatası', e);
    await mesajKutusu({ tur: 'error', mesaj: 'Yazdırılamadı', ayrinti: hataMetni(e) });
  }
}

/** Görünümde kaydedilmemiş yapısal değişiklik (sayfa ekleme/silme/sıralama) var mı? */
function yapisalKirliMi(belge) {
  try { return typeof belge.gorunum?.yapisalKirli === 'function' && !!belge.gorunum.yapisalKirli(); } catch { return false; }
}

/** belge.kaydediliyor düşene kadar bekler; zaman aşımında false döner. */
async function kaydetmeyiBekle(belge) {
  const baslangic = Date.now();
  while (belge.kaydediliyor) {
    if (Date.now() - baslangic > KAYIT_BEKLEME_MS) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

// ---------------------------------------------------------------- yazdırma penceresi
const OK_SOL = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const OK_SAG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

/** Kayıtlı değer geçerliyse o, değilse varsayılan (listenin ilki). */
function gecerliDeger(ad, deger) { return SECENEKLER[ad].includes(deger) ? deger : SECENEKLER[ad][0]; }

/**
 * Yazdırma penceresi. Yazdır'la { aralik, aralikMetni, sayfalar, yazici, yaziciAdi, kopya, harmanla, kagit, olcek, renk, ciftTarafli,
 * notlar, sistemPenceresi, dosyayaYazar, cevrimDisi }, Vazgeç / Esc / dışarı tıklamayla null döner.
 */
function secenekPenceresi(baglam, belge, { toplam, gecerli, uyari, gecerliDevre, boyutlar, kayitli }) {
  const { pdefe, cekirdek } = baglam;
  return new Promise((coz) => {
    const ortu = document.createElement('div');
    ortu.className = 'diyalog-ortusu yazdir-ortusu';
    const kagitSecenekleri = SECENEKLER.kagit.map((k) => `<option value="${k}">${k === 'belge' ? 'Belgeye göre' : k}</option>`).join('');
    const ciftSecenekleri = SECENEKLER.ciftTarafli.map((k) => `<option value="${k}">${CIFT_TARAFLI_ADLARI[k]}</option>`).join('');
    const tercihEtiketi = MAC ? 'Yazıcı ayarları' : 'Yazıcı tercihleri';
    const tercihIpucu = MAC ? 'Sistem Ayarları › Yazıcılar ve Tarayıcılar bölümünü açar.'
      : 'Yazıcının kendi ayarları (kâğıt kaynağı, baskı kalitesi, toner tasarrufu…). Orada yapılan değişiklik bu yazıcının varsayılanı olur; buradaki kâğıt, renk, kopya ve çift taraflı seçimi yine geçerlidir.';
    ortu.innerHTML = `
<div class="diyalog yazdir-diyalog" role="dialog" aria-modal="true" aria-label="Yazdır">
  <div class="baslik">Yazdır</div>
  <div class="govde yazdir-govde">
    <div class="yazdir-sol">
      <div class="yazdir-belge" title="${kacis(belge.yol || '')}">${kacis(belge.ad || '')} <span class="soluk">· ${toplam} sayfa</span></div>
      <div class="yazdir-uyari" hidden></div>
      <div class="yazdir-satir">
        <label class="yazdir-etiket" for="yazdir-yazici">Yazıcı</label>
        <select id="yazdir-yazici" name="yazici" class="ayar-secim yazdir-secim"><option value="">Yazıcılar okunuyor…</option></select>
      </div>
      <div class="yazdir-yazici-alt">
        <span class="yazdir-yazici-bilgi soluk"></span>
        <button type="button" class="ikincil yazdir-tercih" data-id="tercihler" title="${kacis(tercihIpucu)}" disabled>${tercihEtiketi}</button>
      </div>
      <div class="yazdir-satir">
        <label class="yazdir-etiket" for="yazdir-kopya">Kopya</label>
        <div class="yazdir-yanyana">
          <input id="yazdir-kopya" type="number" name="kopya" class="kutu ayar-sayi yazdir-kopya" min="1" max="${EN_FAZLA_KOPYA}" step="1" value="1">
          <label class="yazdir-harmanla" title="Birden çok kopyada her kopya baştan sona sırayla basılır (1, 2, 3, 1, 2, 3)"><input type="checkbox" name="harmanla"> Harmanla</label>
        </div>
      </div>
      <fieldset class="yazdir-grup">
        <legend>Sayfalar</legend>
        <label><input type="radio" name="aralik" value="tumu"> Tümü</label>
        <label><input type="radio" name="aralik" value="gecerli"> Geçerli sayfa <span class="soluk">(${gecerli})</span></label>
        <label class="yazdir-aralik"><input type="radio" name="aralik" value="aralik"> Aralık: <input type="text" name="aralikMetni" class="kutu" placeholder="1-3,5" spellcheck="false"></label>
        <div class="yazdir-hata" hidden></div>
      </fieldset>
      <div class="yazdir-satir">
        <label class="yazdir-etiket" for="yazdir-kagit">Kâğıt</label>
        <select id="yazdir-kagit" name="kagit" class="ayar-secim yazdir-secim">${kagitSecenekleri}</select>
      </div>
      <div class="yazdir-satir">
        <span class="yazdir-etiket">Boyut</span>
        <div class="yazdir-radyolar"><label><input type="radio" name="olcek" value="sigdir"> Sayfaya sığdır</label><label><input type="radio" name="olcek" value="gercek"> Gerçek boyut</label></div>
      </div>
      <div class="yazdir-satir">
        <span class="yazdir-etiket">Renk</span>
        <div class="yazdir-radyolar"><label><input type="radio" name="renk" value="renkli"> Renkli</label><label><input type="radio" name="renk" value="siyahBeyaz"> Siyah beyaz</label></div>
      </div>
      <div class="yazdir-satir">
        <label class="yazdir-etiket" for="yazdir-cift">Çift taraflı</label>
        <select id="yazdir-cift" name="ciftTarafli" class="ayar-secim yazdir-secim">${ciftSecenekleri}</select>
      </div>
      <div class="yazdir-cift-bilgi soluk" hidden></div>
      <label class="yazdir-notlar"><input type="checkbox" name="notlar"> Notları yazdır</label>
      <p class="soluk yazdir-aciklama">Sayfalar görüntü olarak basılır; Türkçe karakterler ekranda göründüğü gibi çıkar. "Notları yazdır" kapalıyken notlar, damgalar ve form alanları basılmaz.</p>
    </div>
    <div class="yazdir-onizleme" aria-label="Ön izleme">
      <div class="yazdir-onizleme-alan"><div class="yazdir-kagit"><img class="yazdir-onizleme-sayfa" alt="" draggable="false"></div><div class="yazdir-onizleme-durum soluk" hidden></div></div>
      <div class="yazdir-gezinme">
        <button type="button" class="yazdir-ok" data-id="onceki" title="Önceki sayfa (Page Up)" aria-label="Önceki sayfa">${OK_SOL}</button>
        <span class="yazdir-sayfa-no">–</span>
        <button type="button" class="yazdir-ok" data-id="sonraki" title="Sonraki sayfa (Page Down)" aria-label="Sonraki sayfa">${OK_SAG}</button>
      </div>
      <div class="yazdir-ozet soluk"></div>
    </div>
  </div>
  <div class="dugmeler yazdir-dugmeler">
    <button type="button" class="yazdir-sistem" data-id="sistem" title="Yazıcı, kopya, renk ve çift taraflı ${kacis(SISTEM)}'un penceresinde seçilir; buradaki sayfa seçimi, kâğıt ve boyut geçerlidir.">${kacis(SISTEM)} yazdırma penceresiyle yazdır</button>
    <span class="yazdir-bosluk"></span>
    <button class="birincil" data-id="yazdir">Yazdır</button><button class="ikincil" data-id="iptal">Vazgeç</button>
  </div>
</div>`;
    const sec = (ad) => ortu.querySelector(`[name="${ad}"]`);
    const secili = (ad) => ortu.querySelector(`[name="${ad}"]:checked`)?.value;
    const radyoKoy = (ad, deger) => { const el = ortu.querySelector(`[name="${ad}"][value="${deger}"]:not([disabled])`) || ortu.querySelector(`[name="${ad}"]:not([disabled])`); if (el) el.checked = true; };
    if (uyari) { const u = ortu.querySelector('.yazdir-uyari'); u.textContent = uyari; u.hidden = false; }
    if (gecerliDevre) {
      // Görünüm ile dosya farklıysa "geçerli sayfa" güvenilir değil
      const g = ortu.querySelector('[name="aralik"][value="gecerli"]');
      g.disabled = true; g.closest('label').classList.add('devre'); g.closest('label').title = 'Görünümdeki sayfa numarası dosyadakiyle eşleşmiyor olabilir.';
    }
    radyoKoy('aralik', sonSecenek.aralik);
    radyoKoy('olcek', gecerliDeger('olcek', kayitli.olcek));
    radyoKoy('renk', gecerliDeger('renk', kayitli.renk));
    sec('kagit').value = gecerliDeger('kagit', kayitli.kagit);
    sec('ciftTarafli').value = gecerliDeger('ciftTarafli', kayitli.ciftTarafli);
    sec('harmanla').checked = kayitli.harmanla !== false;
    sec('notlar').checked = sonSecenek.notlar === true;   // varsayılan kapalı; oturumda açılırsa hatırlanır
    const aralikGirdi = sec('aralikMetni');
    aralikGirdi.value = sonSecenek.aralikMetni || '';
    const hataEl = ortu.querySelector('.yazdir-hata');
    const yaziciSec = sec('yazici'), kopyaGirdi = sec('kopya'), harmanla = sec('harmanla'), ciftSec = sec('ciftTarafli');
    const yaziciBilgi = ortu.querySelector('.yazdir-yazici-bilgi'), ciftBilgi = ortu.querySelector('.yazdir-cift-bilgi');
    const tercihDugme = ortu.querySelector('[data-id="tercihler"]'), yazdirDugme = ortu.querySelector('[data-id="yazdir"]');
    let kapandi = false;

    // ---------------------------------------------------------- yazıcılar
    // Liste pencere açılırken istenir (Electron'un listesi + varsayılan yazıcı); durum (çevrim dışı, çift taraflı, dosyaya yazar) Windows'ta
    // ~1 sn sonra arkadan gelir. Liste gelmeden Yazdır'a basılırsa liste beklenir.
    let yazicilar = null, durumlar = {}, kayitliBulunamadi = null, yaziciElleSecildi = false;
    const yaziciAl = (ad) => (yazicilar || []).find((y) => y.ad === ad) || null;
    const yaziciEtiketi = (y) => `${y.gorunenAd}${y.varsayilan || durumlar[y.ad]?.varsayilan ? ' (varsayılan)' : ''}${durumlar[y.ad]?.cevrimDisi ? ' (çevrim dışı)' : ''}`;
    const yaziciListesiniYaz = () => {
      const deger = yaziciSec.value;
      yaziciSec.innerHTML = '';
      if (!yazicilar.length) {
        yaziciSec.append(new Option('Yazıcı bulunamadı', ''));
        yaziciSec.disabled = true;
        return;
      }
      for (const y of yazicilar) yaziciSec.append(new Option(yaziciEtiketi(y), y.ad));
      yaziciSec.disabled = false;
      if (deger && yaziciAl(deger)) yaziciSec.value = deger;
    };
    const yaziciBilgisiniYaz = () => {
      const ad = yaziciSec.value, d = durumlar[ad] || {};
      let metin = '', tur = '';
      if (yazicilar && !yazicilar.length) {
        metin = MAC ? 'Kurulu yazıcı yok. Sistem Ayarları › Yazıcılar ve Tarayıcılar bölümünden bir yazıcı ekleyin.'
          : 'Kurulu yazıcı yok. Windows Ayarlar › Yazıcılar ve tarayıcılar bölümünden bir yazıcı ekleyin.';
        tur = 'uyari';
      } else if (d.cevrimDisi) { metin = 'Yazıcı çevrim dışı görünüyor; iş, yazıcı açılınca basılır.'; tur = 'uyari'; }
      else if (d.dosyayaYazar) metin = 'Bu yazıcı çıktıyı dosyaya kaydeder; Yazdır\'a basınca kaydedileceği yer sorulur.';
      else if (kayitliBulunamadi && !yaziciElleSecildi) { metin = `Son kullanılan yazıcı ("${kayitliBulunamadi}") bulunamadı; ${yaziciAl(ad)?.varsayilan ? 'varsayılan yazıcı' : 'başka bir yazıcı'} seçildi.`; tur = 'uyari'; }
      yaziciBilgi.textContent = metin;
      yaziciBilgi.classList.toggle('uyari', tur === 'uyari');
      tercihDugme.disabled = !ad;
      // Çift taraflı: yazıcı desteklemiyorsa (Windows'un bildirdiği yetenek) iki çift taraflı seçeneği soluk
      const destekYok = d.ciftTarafli === false;
      for (const o of ciftSec.options) if (o.value === 'uzun' || o.value === 'kisa') o.disabled = destekYok;
      if (destekYok && (ciftSec.value === 'uzun' || ciftSec.value === 'kisa')) ciftSec.value = 'yazici';
      ciftBilgi.textContent = destekYok ? 'Bu yazıcı çift taraflı basmayı desteklemiyor görünüyor.' : '';
      ciftBilgi.hidden = !destekYok;
      const odakYazdirda = document.activeElement === yazdirDugme;
      yazdirDugme.disabled = !!yazicilar && !yazicilar.length;
      // Soluklaşan düğme odağı bırakır (odak sayfaya düşer, Esc pencereye ulaşmaz): odak Windows penceresi bağlantısına
      if (yazdirDugme.disabled && (odakYazdirda || !ortu.contains(document.activeElement))) ortu.querySelector('[data-id="sistem"]').focus();
    };
    const yazicilarHazir = pdefe.cagir('yazdir:yazicilar').catch(() => ({ yazicilar: [] })).then((r) => {
      if (kapandi) return;
      yazicilar = Array.isArray(r?.yazicilar) ? r.yazicilar : [];
      yaziciListesiniYaz();
      const istenen = kayitli.yazici && yaziciAl(kayitli.yazici) ? kayitli.yazici : null;
      if (kayitli.yazici && !istenen) kayitliBulunamadi = kayitli.yazici;
      const secim = istenen || (r?.varsayilan && yaziciAl(r.varsayilan) ? r.varsayilan : yazicilar[0]?.ad) || '';
      if (secim) yaziciSec.value = secim;
      yaziciBilgisiniYaz();
    });
    pdefe.cagir('yazdir:yaziciDurumu').catch(() => ({ durumlar: {} })).then(async (r) => {
      await yazicilarHazir;
      if (kapandi || !yazicilar?.length) return;
      durumlar = r?.durumlar || {};
      // Varsayılan Electron'un listesinden ya da kayıt defterinden okunamadıysa Windows'un bildirdiği; kullanıcı yazıcıyı seçmediyse ona geçilir
      if (!yazicilar.some((y) => y.varsayilan)) {
        const v = yazicilar.find((y) => durumlar[y.ad]?.varsayilan);
        if (v) { v.varsayilan = true; if (!yaziciElleSecildi && !(kayitli.yazici && yaziciAl(kayitli.yazici))) yaziciSec.value = v.ad; }
      }
      yaziciListesiniYaz();
      yaziciBilgisiniYaz();
    });
    yaziciSec.addEventListener('change', () => { yaziciElleSecildi = true; yaziciBilgisiniYaz(); });
    tercihDugme.addEventListener('click', async () => {
      const ad = yaziciSec.value;
      if (!ad) return;
      const r = await pdefe.cagir('yazdir:tercihler', { yazici: ad }).catch((e) => ({ basarili: false, hata: hataMetni(e) }));
      if (!r?.basarili && !kapandi) { yaziciBilgi.textContent = r?.hata || 'Yazıcı tercihleri açılamadı.'; yaziciBilgi.classList.add('uyari'); }
    });

    // ---------------------------------------------------------- kopya
    const kopyaDegeri = () => { const n = Math.floor(Number(kopyaGirdi.value)); return Number.isFinite(n) && n >= 1 ? Math.min(EN_FAZLA_KOPYA, n) : 1; };
    const kopyaGuncelle = () => { harmanla.disabled = kopyaDegeri() <= 1; harmanla.closest('label').classList.toggle('devre', harmanla.disabled); ozetYaz(); };
    kopyaGirdi.addEventListener('input', kopyaGuncelle);
    kopyaGirdi.addEventListener('change', () => { kopyaGirdi.value = String(kopyaDegeri()); kopyaGuncelle(); });

    // ---------------------------------------------------------- sayfa seçimi
    let sayfalar = [], secimHatasi = null, indeks = 0;
    const secimiGuncelle = () => {
      const r = secilenSayfalar({ aralik: secili('aralik') || 'tumu', aralikMetni: aralikGirdi.value, toplam, gecerli });
      const onceki = sayfalar[indeks];
      sayfalar = r.sayfalar || [];
      secimHatasi = r.hata || null;
      const yeni = sayfalar.indexOf(onceki);
      indeks = yeni >= 0 ? yeni : 0;
      kagitEtiketiniYaz();
      onizlemeCiz();
    };
    let secimZamani = null;
    // Aralık kutusuna yazınca "Aralık" seçilsin
    aralikGirdi.addEventListener('focus', () => { if (secili('aralik') !== 'aralik') { radyoKoy('aralik', 'aralik'); secimiGuncelle(); } });
    aralikGirdi.addEventListener('input', () => {
      radyoKoy('aralik', 'aralik'); hataEl.hidden = true;
      clearTimeout(secimZamani); secimZamani = setTimeout(secimiGuncelle, 200);
    });
    ortu.querySelectorAll('[name="aralik"]').forEach((r) => r.addEventListener('change', () => { hataEl.hidden = true; secimiGuncelle(); }));

    // ---------------------------------------------------------- kâğıt, boyut, renk, notlar
    const secilenBoyutlar = () => {
      const liste = [];
      for (const no of sayfalar) { const b = boyutlar.get(no); if (b) liste.push(b); }
      return liste;
    };
    const kagitAl = () => kagitSec(secilenBoyutlar(), sec('kagit').value);
    const kagitEtiketiniYaz = () => {
      const o = sec('kagit').querySelector('option[value="belge"]');
      const boy = secilenBoyutlar();
      o.textContent = boy.length ? `Belgeye göre (${kagitEtiketi(kagitSec(boy, 'belge'))})` : 'Belgeye göre';
    };
    sec('kagit').addEventListener('change', onizlemeCiz);
    ortu.querySelectorAll('[name="olcek"], [name="renk"]').forEach((r) => r.addEventListener('change', onizlemeCiz));
    sec('notlar').addEventListener('change', onizlemeCiz);

    // ---------------------------------------------------------- ön izleme
    const alan = ortu.querySelector('.yazdir-onizleme-alan'), kagitEl = ortu.querySelector('.yazdir-kagit'), gorsel = ortu.querySelector('.yazdir-onizleme-sayfa');
    const durumEl = ortu.querySelector('.yazdir-onizleme-durum'), sayfaNo = ortu.querySelector('.yazdir-sayfa-no'), ozetEl = ortu.querySelector('.yazdir-ozet');
    const onceki = ortu.querySelector('[data-id="onceki"]'), sonraki = ortu.querySelector('[data-id="sonraki"]');
    const onbellek = new Map();   // "no|notlar|dpi" → { url, genislikPt, yukseklikPt }
    const bekleyen = new Map();   // aynı görüntü için ikinci istek yapılmaz
    let sira = 0;
    function ozetYaz() {
      ozetEl.textContent = secimHatasi ? '' : ozetMetni(sayfalar.length, kopyaDegeri());
    }
    function onizlemeCiz() {
      if (kapandi) return;
      ozetYaz();
      const n = sayfalar.length;
      onceki.disabled = !n || indeks <= 0;
      sonraki.disabled = !n || indeks >= n - 1;
      if (secimHatasi || !n) {
        sayfaNo.textContent = '–'; sayfaNo.title = '';
        kagitEl.hidden = true;
        durumEl.textContent = secimHatasi || 'Yazdırılacak sayfa yok.'; durumEl.hidden = false;
        return;
      }
      const no = sayfalar[indeks];
      sayfaNo.textContent = `${indeks + 1} / ${n}` + (secili('aralik') === 'tumu' ? '' : ` (s. ${no})`);
      sayfaNo.title = `Belgenin ${no}. sayfası`;
      const kagit = kagitAl();
      const olcek = secili('olcek') || 'sigdir';
      // Kâğıt, alana oranı korunarak sığar (ekranda kâğıdın gölgesi için birkaç piksel pay)
      const W = Math.max(40, alan.clientWidth - 24), H = Math.max(40, alan.clientHeight - 24);
      const oran = kagit.genislikMm / kagit.yukseklikMm;
      let kh = H, kw = kh * oran;
      if (kw > W) { kw = W; kh = kw / oran; }
      kagitEl.hidden = false;
      kagitEl.style.width = `${Math.round(kw)}px`; kagitEl.style.height = `${Math.round(kh)}px`;
      kagitEl.classList.toggle('gri', secili('renk') === 'siyahBeyaz');
      kagitEl.dataset.kagit = kagitEtiketi(kagit);
      const boyut = boyutlar.get(no) || null;
      const yer = sayfaYerlesimi(boyut || {}, kagit, olcek);
      gorsel.classList.toggle('don', yer.yatay);
      gorsel.style.width = `${(yer.genislikMm / kagit.genislikMm) * 100}%`;
      gorsel.style.height = `${(yer.yukseklikMm / kagit.yukseklikMm) * 100}%`;
      const notlar = !!sec('notlar').checked;
      const dpi = onizlemeDpi({ sayfa: boyut || {}, kagit, olcek, kagitPikselGenislik: kw, ekranOlcegi: window.devicePixelRatio || 1 });
      const anahtar = `${no}|${notlar ? 1 : 0}|${dpi}`;
      gorsel.dataset.no = String(no); gorsel.dataset.notlar = notlar ? '1' : '0';
      const hazir = onbellek.get(anahtar);
      if (hazir) {
        onbellek.delete(anahtar); onbellek.set(anahtar, hazir);   // en son kullanılan sona
        if (gorsel.dataset.anahtar !== anahtar) { gorsel.src = hazir.url; gorsel.dataset.anahtar = anahtar; }
        gorsel.classList.remove('yukleniyor');
        durumEl.hidden = true;
        return;
      }
      gorsel.classList.add('yukleniyor');
      const benim = ++sira;
      let soz = bekleyen.get(anahtar);
      if (!soz) {
        soz = cekirdek('sayfa_goruntu', { yol: belge.yol, sayfa: no, dpi, notlar, bicim: 'jpeg', kalite: ONIZLEME_KALITE }).then((r) => {
          if (!r?.veri) throw new Error('Görüntü alınamadı.');
          const k = { url: `data:image/${r.bicim === 'png' ? 'png' : 'jpeg'};base64,${r.veri}`, genislikPt: r.genislikPt, yukseklikPt: r.yukseklikPt };
          onbellek.set(anahtar, k);
          while (onbellek.size > ONIZLEME_ONBELLEK) onbellek.delete(onbellek.keys().next().value);
          if (Number(r.genislikPt) > 0 && Number(r.yukseklikPt) > 0 && !boyutlar.has(no)) { boyutlar.set(no, { genislikPt: Number(r.genislikPt), yukseklikPt: Number(r.yukseklikPt) }); kagitEtiketiniYaz(); }
          return k;
        }).finally(() => bekleyen.delete(anahtar));
        bekleyen.set(anahtar, soz);
      }
      soz.then(() => { if (benim === sira) onizlemeCiz(); }).catch((e) => {
        if (benim !== sira || kapandi) return;
        durumEl.textContent = 'Ön izleme çizilemedi: ' + cekirdekHataMetni(e); durumEl.hidden = false;
      });
    }
    const git = (fark) => { const yeni = Math.min(Math.max(0, indeks + fark), sayfalar.length - 1); if (yeni !== indeks && yeni >= 0) { indeks = yeni; onizlemeCiz(); } };
    onceki.addEventListener('click', () => git(-1));
    sonraki.addEventListener('click', () => git(1));
    const gozlemci = new ResizeObserver(() => onizlemeCiz());

    // ---------------------------------------------------------- Yazdır / Vazgeç
    const kapat = (sonuc) => {
      if (kapandi) return;
      kapandi = true;
      clearTimeout(secimZamani);
      gozlemci.disconnect();
      ortu.remove();
      if (acikPencere === ortu) acikPencere = null;
      coz(sonuc);
    };
    let onaylaniyor = false;
    const onayla = async ({ sistemPenceresi = false } = {}) => {
      if (onaylaniyor || kapandi) return;
      const aralik = secili('aralik') || 'tumu';
      const r = secilenSayfalar({ aralik, aralikMetni: aralikGirdi.value, toplam, gecerli });
      if (r.hata) { hataEl.textContent = r.hata; hataEl.hidden = false; aralikGirdi.focus(); aralikGirdi.select(); return; }
      onaylaniyor = true;
      try {
        if (!sistemPenceresi) {
          await yazicilarHazir;
          if (kapandi) return;
          if (!yazicilar?.length || !yaziciSec.value) { yaziciBilgisiniYaz(); yaziciSec.focus(); return; }
        }
        const ad = yaziciSec.value, y = yaziciAl(ad), d = durumlar[ad] || {};
        kapat({
          aralik, aralikMetni: aralikGirdi.value.trim(), sayfalar: r.sayfalar,
          yazici: ad, yaziciAdi: y?.gorunenAd || ad, kopya: kopyaDegeri(), harmanla: harmanla.checked,
          kagit: sec('kagit').value, olcek: secili('olcek') || 'sigdir', renk: secili('renk') || 'renkli', ciftTarafli: ciftSec.value || 'yazici',
          notlar: sec('notlar').checked, sistemPenceresi, dosyayaYazar: !!d.dosyayaYazar, cevrimDisi: !!d.cevrimDisi,
        });
      } finally { onaylaniyor = false; }
    };
    yazdirDugme.addEventListener('click', () => onayla());
    ortu.querySelector('[data-id="sistem"]').addEventListener('click', () => onayla({ sistemPenceresi: true }));
    ortu.querySelector('[data-id="iptal"]').addEventListener('click', () => kapat(null));
    ortu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); kapat(null); return; }
      if (e.key === 'Tab') { odakTuzagi(ortu, e); return; }
      if ((e.key === 'PageUp' || e.key === 'PageDown') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); git(e.key === 'PageDown' ? 1 : -1); return; }
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') { e.preventDefault(); onayla(); }
      if (GEZINME_TUSLARI.has(e.key)) e.stopPropagation();   // belge kısayollarına sızmasın
    });
    // Dışarı tıklamak Vazgeç / Esc gibi kapatır; basış odağı diyalogdan almaz
    ortu.addEventListener('mousedown', (e) => { if (e.target === ortu) e.preventDefault(); });
    ortuTiklamasiBagla(ortu, () => kapat(null));
    document.body.append(ortu);
    acikPencere = ortu;
    kopyaGuncelle();
    secimiGuncelle();
    gozlemci.observe(alan);
    yazdirDugme.focus();
  });
}

// ---------------------------------------------------------------- ilerleme penceresi
/**
 * İki aşamalı ilerleme penceresi:
 *  - hazırlık: Vazgeç → durum.iptal = true (döngü sonraki adımda durur, iş klasörü silinir)
 *  - yazdırma: diyalogAsamasi(cb) sonrası Vazgeç → cb() (ana süreç gizli pencereyi yok eder; iş ya da Windows'un penceresi kapanır)
 */
function ilerlemePenceresi(baslik) {
  const ortu = document.createElement('div');
  ortu.className = 'diyalog-ortusu yazdir-ortusu';
  ortu.innerHTML = `
<div class="diyalog yazdir-ilerleme" role="dialog" aria-modal="true" aria-label="Yazdırma hazırlanıyor">
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
  let diyalogIptal = null;
  const durum = {
    iptal: false,
    guncelle(yuzde, metin) { cubuk.style.width = Math.max(0, Math.min(100, yuzde)).toFixed(1) + '%'; if (metin != null) mesaj.textContent = metin; },
    /** Yazdırma aşaması: Vazgeç düğmesi ana süreçteki işi iptal eder. */
    diyalogAsamasi(cb) { diyalogIptal = cb; iptalDugme.disabled = false; iptalDugme.textContent = 'Vazgeç'; },
    kapat() { ortu.remove(); if (acikPencere === ortu) acikPencere = null; },
  };
  iptalDugme.addEventListener('click', () => {
    durum.iptal = true;
    iptalDugme.disabled = true;
    mesaj.textContent = 'Vazgeçiliyor…';
    if (diyalogIptal) { const cb = diyalogIptal; diyalogIptal = null; Promise.resolve().then(cb).catch(() => {}); }
  });
  ortu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (!iptalDugme.disabled) iptalDugme.click(); return; }
    if (e.key === 'Tab') { odakTuzagi(ortu, e); return; }
    if (GEZINME_TUSLARI.has(e.key)) e.stopPropagation();
  });
  // Dışarı tıklamak Esc gibi Vazgeç'e basar (hazırlıkta döngü durur, yazdırma aşamasında iş / Windows'un penceresi kapanır); basış odağı almaz
  ortu.addEventListener('mousedown', (e) => { if (e.target === ortu) e.preventDefault(); });
  ortuTiklamasiBagla(ortu, () => { if (!iptalDugme.disabled) iptalDugme.click(); });
  document.body.append(ortu);
  acikPencere = ortu;
  iptalDugme.focus();
  return durum;
}

// ---------------------------------------------------------------- yardımcılar
/** Tab/Shift+Tab odağı diyalog içinde döndürür (basit odak tuzağı). */
function odakTuzagi(kok, e) {
  const ogeler = [...kok.querySelectorAll(ODAKLANABILIR)].filter((o) => !o.hidden && o.offsetParent !== null);
  if (!ogeler.length) { e.preventDefault(); return; }
  const ilk = ogeler[0], son = ogeler[ogeler.length - 1];
  const etkin = document.activeElement;
  if (e.shiftKey && (etkin === ilk || !kok.contains(etkin))) { e.preventDefault(); son.focus(); }
  else if (!e.shiftKey && (etkin === son || !kok.contains(etkin))) { e.preventDefault(); ilk.focus(); }
}

/** ayarlar.css'i (yazdırma ve ayarlar penceresi stilleri) bir kez sayfaya ekler. */
function stilYukle() {
  if (typeof document === 'undefined' || document.getElementById('pdefe-ayarlar-stil')) return;
  const link = document.createElement('link');
  link.id = 'pdefe-ayarlar-stil';
  link.rel = 'stylesheet';
  link.href = new URL('./ayarlar.css', import.meta.url).href;
  document.head.append(link);
}

function mb(bayt) { return (bayt / 1024 / 1024).toFixed(1).replace('.', ','); }

/** IPC sarmalayıcısının eklediği "Error invoking remote method…" önekini atar. */
function hataMetni(e) {
  return ((e && (e.message || String(e))) || 'Bilinmeyen hata').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

/** Çekirdek (PyMuPDF) hatalarını kullanıcıya Türkçe açıklar. */
function cekirdekHataMetni(e) {
  const m = hataMetni(e);
  if (/İşlem iptal edildi/i.test(m)) return 'işlem iptal edildi.';
  if (/FileNotFoundError|WinError 2\b|WinError 3\b|No such file|bulunam/i.test(m)) return 'dosya diskte bulunamadı; taşınmış ya da silinmiş olabilir. Önce "Farklı kaydet" yapın.';
  if (/PermissionError|WinError 32\b|WinError 5\b|Permission denied|erişim engellendi|başka bir işlem/i.test(m)) return 'dosyaya erişilemedi; başka bir program tarafından kilitlenmiş olabilir.';
  if (/not in document|IndexError|out of range|page number/i.test(m)) return 'sayfa dosyada yok; dosya değişmiş olabilir. Belgeyi yeniden açıp deneyin.';
  if (/cannot open|no objects found|not a PDF|Failed to open|FileDataError|damaged|broken/i.test(m)) return 'dosya açılamadı ya da bozuk.';
  if (/Çekirdek çalışmıyor|Çekirdek süreç/i.test(m)) return 'PDF çekirdeği çalışmıyor. Uygulamayı yeniden başlatın.';
  if (/MemoryError|out of memory/i.test(m)) return 'yeterli bellek yok. Daha az sayfa seçin.';
  return m;
}
