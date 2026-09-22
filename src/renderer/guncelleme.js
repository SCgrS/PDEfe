// Güncelleme şeridi (araç çubuğunun altındaki #guncelleme-seridi).
//
// Kullanım (uygulama.js):
//   import { guncellemeSeridiKur } from './guncelleme.js';
//   const guncelleme = guncellemeSeridiKur({ pdefe, serit: $('#guncelleme-seridi'), bildir, kapatmadanOnce: () => kapatmayaIzinAl() });
//   komutlar['yardim.guncelle'] = () => guncelleme.denetle();
//
// Akış (UDF Resimcisi'ndeki gibi tek düğme):
//   main 'guncelleme:var' (10 açılışta bir otomatik ya da elle denetim) → "PDEfe x hazır (kullandığınız: y)." [Güncelle] [Sürüm notları] [Daha sonra]
//   Güncelle → 'guncelleme:indir' ("PDEfe x indiriliyor %N") → kapatmadanOnce() (kaydedilmemiş belgeler sorulur) → 'guncelleme:kur':
//   uygulama kapanır, sihirbazsız kurulur ve yeniden açılır.
//   Soru Vazgeç ile kapatılırsa indirilen paket saklanır: "[Kur ve yeniden başlat]" yeniden indirmeden kurar.
//   Hata → kısa Türkçe ileti ve [Yeniden dene]. Daha sonra → bu oturumda gizlenir (elle denetim yeniden gösterir).

const SURUMLER_URL = 'https://github.com/SCgrS/PDEfe/releases';

const STIL = `
#guncelleme-seridi { flex-wrap: wrap; row-gap: 4px; font-size: 13px; min-height: 36px; box-sizing: border-box; }
#guncelleme-seridi .metin { flex: 0 1 auto; min-width: 160px; }
#guncelleme-seridi .dugmeler { display: flex; gap: 6px; align-items: center; margin-left: auto; }
#guncelleme-seridi button { color: inherit; font: inherit; cursor: pointer; line-height: 1.2; }
#guncelleme-seridi button:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
#guncelleme-seridi button:disabled { opacity: 0.6; cursor: default; }
#guncelleme-seridi button.birincil-serit { background: var(--vurgu-metin); color: var(--vurgu); border-color: var(--vurgu-metin); font-weight: 600; padding: 3px 14px; margin: 0; }
#guncelleme-seridi button.birincil-serit:hover:not(:disabled) { background: var(--vurgu-metin); filter: brightness(0.94); }
#guncelleme-seridi button.baglanti-dugme { border-color: transparent; font-weight: 400; text-decoration: underline; text-underline-offset: 2px; padding: 3px 6px; }
#guncelleme-seridi .ilerleme { flex: 1 1 160px; max-width: 360px; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.35); overflow: hidden; }
#guncelleme-seridi .ilerleme > i { display: block; height: 100%; width: 0; background: currentColor; transition: width .2s; }
`;

/** Aşamalar: bos | var | indiriliyor | kuruluyor | hazir (indirildi, kurulum ertelendi) | hata */
const SURUYOR = new Set(['indiriliyor', 'kuruluyor', 'hazir']);

function boyutMetni(b) {
  if (!b || b <= 0) return '';
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function hataMetni(e) { return (e && (e.message || String(e))) || 'bilinmeyen hata'; }

/**
 * @param {object} p
 * @param {any} p.pdefe                     window.pdefe köprüsü (cagir / dinle)
 * @param {HTMLElement} p.serit             #guncelleme-seridi
 * @param {(metin: string, sure?: number) => void} p.bildir
 * @param {() => (boolean|void|Promise<boolean|void>)} [p.kapatmadanOnce]  kurmadan önce kaydedilmemiş değişiklikleri sorar; false kurulumu erteler
 * @returns {{ denetle: (secenek?: {bildirim?: boolean}) => Promise<{durum: string, surum?: string, mevcut?: string, mesaj?: string}>,
 *            guncelle: () => Promise<boolean>, gizle: () => void, durum: () => object }}
 */
export function guncellemeSeridiKur({ pdefe, serit, bildir, kapatmadanOnce }) {
  if (!serit) throw new Error('Güncelleme şeridi öğesi (#guncelleme-seridi) bulunamadı.');
  if (!document.getElementById('guncelleme-stil')) {
    const s = document.createElement('style');
    s.id = 'guncelleme-stil'; s.textContent = STIL;
    document.head.append(s);
  }
  serit.setAttribute('role', 'status');

  const durum = { asama: 'bos', surum: '', mevcut: '', yuzde: 0, aktarilan: 0, toplam: 0, hata: '', kapatildi: false, indirildi: false };
  let akis = null;   // süren Güncelle işlemi (Promise)

  function dugme(etiket, tiklama, { sinif = '', baslik = '' } = {}) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = etiket; if (sinif) b.className = sinif; if (baslik) b.title = baslik;
    b.addEventListener('click', tiklama);
    return b;
  }
  const dahaSonra = () => dugme('Daha sonra', () => { durum.kapatildi = true; gizle(); }, { sinif: 'baglanti-dugme', baslik: 'Bu oturumda bir daha gösterme' });
  const kullandiginiz = () => (durum.mevcut ? ` (kullandığınız: ${durum.mevcut})` : '');

  function ciz() {
    serit.replaceChildren();
    if (durum.asama === 'bos' || (durum.kapatildi && !akis)) { serit.hidden = true; return; }
    const metin = document.createElement('span'); metin.className = 'metin';
    const dugmeler = document.createElement('span'); dugmeler.className = 'dugmeler';
    serit.dataset.asama = durum.asama;

    if (durum.asama === 'var') {
      metin.textContent = `PDEfe ${durum.surum} hazır${kullandiginiz()}.`;
      dugmeler.append(
        dugme('Güncelle', () => guncelle(), { sinif: 'birincil-serit', baslik: 'İndir, kur ve PDEfe\'yi yeniden başlat' }),
        dugme('Sürüm notları', () => pdefe.cagir('kabuk:disAc', `${SURUMLER_URL}/tag/v${durum.surum}`).catch(() => {}), { sinif: 'baglanti-dugme', baslik: 'GitHub sürüm sayfasını aç' }),
        dahaSonra(),
      );
      serit.append(metin, dugmeler);
    } else if (durum.asama === 'indiriliyor') {
      const ek = durum.toplam ? ` (${boyutMetni(durum.aktarilan)} / ${boyutMetni(durum.toplam)})` : '';
      metin.textContent = `PDEfe ${durum.surum} indiriliyor %${durum.yuzde}${ek}`;
      const cubuk = document.createElement('span'); cubuk.className = 'ilerleme';
      cubuk.setAttribute('role', 'progressbar'); cubuk.setAttribute('aria-valuemin', '0'); cubuk.setAttribute('aria-valuemax', '100'); cubuk.setAttribute('aria-valuenow', String(durum.yuzde));
      const ic = document.createElement('i'); ic.style.width = `${durum.yuzde}%`; cubuk.append(ic);
      serit.append(metin, cubuk);
    } else if (durum.asama === 'kuruluyor') {
      metin.textContent = `PDEfe ${durum.surum} kuruluyor; uygulama kapanıp yeniden açılacak.`;
      serit.append(metin);
    } else if (durum.asama === 'hazir') {
      metin.textContent = `PDEfe ${durum.surum} indirildi${kullandiginiz()}. Kurmak için PDEfe kapanıp yeniden açılacak.`;
      dugmeler.append(dugme('Kur ve yeniden başlat', () => guncelle(), { sinif: 'birincil-serit' }), dahaSonra());
      serit.append(metin, dugmeler);
    } else if (durum.asama === 'hata') {
      metin.textContent = durum.hata;
      dugmeler.append(dugme('Yeniden dene', () => guncelle(), { sinif: 'birincil-serit' }), dahaSonra());
      serit.append(metin, dugmeler);
    }
    serit.hidden = false;
  }

  function gizle() { serit.hidden = true; serit.replaceChildren(); }
  function asama(yeni, ek = {}) { Object.assign(durum, ek); durum.asama = yeni; ciz(); }

  /** Tek tık: indir (gerekirse), kaydedilmemiş değişiklikleri sor, kur ve yeniden başlat. Kurulum başladıysa true. */
  function guncelle() {
    if (akis) return akis;
    durum.kapatildi = false;
    akis = (async () => {
      try {
        if (!durum.indirildi) {   // indirilmiş paket (Vazgeç ya da kurulum hatasından sonra) yeniden indirilmez
          asama('indiriliyor', { yuzde: 0, aktarilan: 0, toplam: 0, hata: '' });
          const r = await pdefe.cagir('guncelleme:indir');
          if (!r?.tamam) { asama('hata', { hata: `Güncelleme indirilemedi. ${r?.mesaj || 'İndirme tamamlanamadı.'}` }); return false; }
        }
        asama('kuruluyor');
        if (kapatmadanOnce && (await kapatmadanOnce()) === false) {
          asama('hazir');
          bildir('Güncelleme ertelendi; indirilen sürüm saklandı.', 4000);
          return false;
        }
        if (!(await pdefe.cagir('guncelleme:kur'))) { asama('hata', { hata: 'Güncelleme kurulamadı: indirilen kurulum dosyası bulunamadı.' }); return false; }
        return true;
      } catch (e) {
        asama('hata', { hata: 'Güncellenemedi: ' + hataMetni(e) });
        return false;
      }
    })().finally(() => { akis = null; });
    return akis;
  }

  // ---- ana süreçten gelen olaylar
  pdefe.dinle('guncelleme:var', (b) => {
    if (b?.mevcut) durum.mevcut = b.mevcut;
    if (akis || SURUYOR.has(durum.asama)) return;
    if (b?.elle) durum.kapatildi = false;
    asama('var', { surum: b?.surum || durum.surum });
  });
  pdefe.dinle('guncelleme:ilerleme', (p) => {
    if (durum.asama !== 'indiriliyor') return;
    durum.yuzde = p?.yuzde ?? 0; durum.aktarilan = p?.aktarilan ?? 0; durum.toplam = p?.toplam ?? 0;
    ciz();
  });
  pdefe.dinle('guncelleme:hazir', (b) => {
    durum.surum = b?.surum || durum.surum; durum.indirildi = true;
    if (!akis) asama('hazir');   // Güncelle süreci kendisi devam eder
  });
  pdefe.dinle('guncelleme:hata', (b) => { asama('hata', { hata: b?.mesaj || 'Güncelleme kurulamadı.' }); });

  // Pencere yenilendiyse ya da denetim renderer hazır olmadan bittiyse: ana süreçteki durumu al
  pdefe.cagir('guncelleme:durum').then((d) => {
    if (!d) return;
    durum.mevcut = d.surum || durum.mevcut;
    if (akis || durum.asama !== 'bos') return;
    if (d.hazir) asama('hazir', { surum: d.hazir.surum, indirildi: true });
    else if (d.bulunan) asama('var', { surum: d.bulunan.surum });
  }).catch(() => {});

  /** Elle denetim (Yardım › Güncellemeleri denetle, Ayarlar › Güncelleme): sayaca bakmaz; yeni sürüm varsa şerit ("Daha sonra" ile
   *  gizlenmiş olsa da) görünür. bildirim: false iken sonuç yalnızca döndürülür (Ayarlar kendisi yazar). */
  async function denetle({ bildirim = true } = {}) {
    if (bildirim) bildir('Güncellemeler denetleniyor', 2000);
    let sonuc;
    try { sonuc = await pdefe.cagir('guncelleme:denetle'); }
    catch (e) { sonuc = { durum: 'hata', mesaj: hataMetni(e) }; }
    if (sonuc?.mevcut) durum.mevcut = sonuc.mevcut;
    if (sonuc?.durum === 'var') {
      durum.kapatildi = false;
      if (!akis && !SURUYOR.has(durum.asama)) durum.asama = 'var';
      if (!akis && durum.asama === 'var') durum.surum = sonuc.surum || durum.surum;
      ciz();
    } else if (bildirim) {
      bildir(sonuc?.mesaj || (sonuc?.durum === 'yok' ? 'PDEfe güncel.' : 'Güncellemeler denetlenemedi.'), sonuc?.durum === 'yok' ? 4000 : 6000);
    }
    return sonuc;
  }

  return { denetle, guncelle, gizle, durum: () => ({ ...durum, suruyor: !!akis }) };
}
