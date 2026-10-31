// Güncelleme şeridi (araç çubuğunun altındaki #guncelleme-seridi).
//
// Kullanım (uygulama.js):
//   import { guncellemeSeridiKur } from './guncelleme.js';
//   const guncelleme = guncellemeSeridiKur({ pdefe, serit: $('#guncelleme-seridi'), bildir, kapatmadanOnce: () => kapatmayaIzinAl() });
//   komutlar['yardim.guncelle'] = () => guncelleme.denetle();
//
// Akış (UDF Resimcisi'ndeki gibi tek düğme):
//   main 'guncelleme:var' (iki günde bir otomatik ya da elle denetim) → "PDEfe x hazır (kullandığınız: y)." [Güncelle] [Sürüm notları] [Daha sonra]
//   Güncelle → 'guncelleme:indir' ("PDEfe x indiriliyor %N. İndirme bitene dek PDEfe'yi kapatmayın.") → "PDEfe x indirildi." ve
//   kapatmadanOnce() (kaydedilmemiş belgeler
//   sorulur) → "PDEfe x kuruluyor" ve 'guncelleme:kur': uygulama kapanır, sihirbazsız kurulur ve yeniden açılır.
//   Soru Vazgeç ile kapatılırsa indirilen paket saklanır: "[Kur ve yeniden başlat]" yeniden indirmeden kurar.
//   Hata → kısa Türkçe ileti ve [Yeniden dene]. Daha sonra → bu oturumda gizlenir (elle denetim yeniden gösterir).

import { MAC } from './platform.js';

const SURUMLER_URL = 'https://github.com/SCgrS/PDEfe/releases';

// 0.3.1 (kullanıcı isteği: "güncelleme şeridini daha büyük ve belirgin yapalım"; üç örnekten C seçildi): Şerit iki satırlı bir kart.
// Solda dairede durum simgesi, üstte kalın başlık (BASLIKLAR), altında eski metin, sağda büyük düğmeler ya da ilerleme çubuğu. Renkler
// temanın vurgusundan, yeni renk değişkeni yok. Dar pencerede düğmeler ve çubuk metnin altına iner. Kartın çevresi 8/10/6 px boşluk.
const SIMGE = (yol) => `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>${yol}</svg>")`;
const STIL = `
#guncelleme-seridi {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "simge baslik sag" "simge metin sag";
  column-gap: 14px; row-gap: 1px; align-items: center; box-sizing: border-box;
  margin: 8px 10px 6px; min-height: 66px; padding: 10px 14px 10px 12px; border-radius: 10px;
  font-size: 14px; font-weight: 400; line-height: 1.35;
  border: 1px solid color-mix(in srgb, var(--vurgu) 80%, #000);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22), 0 1px 3px rgba(0, 0, 0, 0.18);
  position: relative; z-index: 2;
  --serit-simge: ${SIMGE("<path d='M19.5 9.5A8 8 0 0 0 5.2 7.2'/><path d='M4.8 3.6v4.1h4.1'/><path d='M4.5 14.5a8 8 0 0 0 14.3 2.3'/><path d='M19.2 20.4v-4.1h-4.1'/>")};
}
html[data-tema="koyu"] #guncelleme-seridi { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(0, 0, 0, 0.5); border-color: color-mix(in srgb, var(--vurgu) 70%, #fff); }
#guncelleme-seridi[data-asama="indiriliyor"], #guncelleme-seridi[data-asama="tarayicida"] {
  --serit-simge: ${SIMGE("<path d='M12 3.5v11'/><path d='m7 10 5 5 5-5'/><path d='M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5'/>")};
}
#guncelleme-seridi[data-asama="hazir"], #guncelleme-seridi[data-asama="onay"] {
  --serit-simge: ${SIMGE("<circle cx='12' cy='12' r='8.6'/><path d='m8 12.3 2.8 2.8 5.4-5.6'/>")};
}
#guncelleme-seridi[data-asama="hata"] { --serit-simge: ${SIMGE("<path d='M12 3.8 21 19.6H3z'/><path d='M12 9.8v4.4'/><path d='M12 17.1v.1'/>")}; }
#guncelleme-seridi::before { content: ''; grid-area: simge; width: 44px; height: 44px; border-radius: 50%; background: color-mix(in srgb, currentColor 16%, transparent); }
#guncelleme-seridi::after {
  content: ''; grid-area: simge; justify-self: center; align-self: center; width: 24px; height: 24px; background: currentColor;
  -webkit-mask: var(--serit-simge) center / contain no-repeat; mask: var(--serit-simge) center / contain no-repeat;
}
#guncelleme-seridi .baslik { grid-area: baslik; align-self: end; font-size: 17px; font-weight: 700; line-height: 1.25; }
#guncelleme-seridi .metin { grid-area: metin; align-self: start; min-width: 0; }
#guncelleme-seridi .metin b.uyari { font-weight: 700; }
#guncelleme-seridi .dugmeler { grid-area: sag; display: flex; gap: 10px; align-items: center; margin-left: 12px; }
#guncelleme-seridi button { color: inherit; font: inherit; font-size: 15px; cursor: pointer; line-height: 1.2; min-height: 40px; padding: 8px 16px; border-radius: 8px; }
#guncelleme-seridi button:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
#guncelleme-seridi button:disabled { opacity: 0.6; cursor: default; }
#guncelleme-seridi button.birincil-serit {
  background: var(--vurgu-metin); color: var(--vurgu); border-color: var(--vurgu-metin); margin: 0;
  font-size: 16px; font-weight: 700; min-height: 42px; padding: 9px 26px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
}
#guncelleme-seridi button.birincil-serit:hover:not(:disabled) { background: var(--vurgu-metin); filter: brightness(0.94); }
#guncelleme-seridi button.baglanti-dugme { border-color: transparent; font-weight: 500; text-decoration: underline; text-underline-offset: 2px; padding: 8px 8px; }
#guncelleme-seridi .ilerleme {
  grid-area: sag; margin-left: 12px; width: clamp(160px, 26vw, 340px); height: 12px; border-radius: 6px; overflow: hidden;
  background: color-mix(in srgb, currentColor 24%, transparent);
}
#guncelleme-seridi .ilerleme > i { display: block; height: 100%; width: 0; background: currentColor; transition: width .2s; }
/* İndirme metni uzun: 1000 px'ten dar pencerede çubuk metnin altına iner (yoksa metnin son sözcüğü tek başına alt satıra kalıyor) */
@media (max-width: 1000px) {
  #guncelleme-seridi[data-asama="indiriliyor"] { grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "simge baslik" "simge metin" ". sag"; }
  #guncelleme-seridi[data-asama="indiriliyor"] .ilerleme { justify-self: stretch; width: auto; margin: 8px 0 2px; }
}
@media (max-width: 860px) {
  #guncelleme-seridi { grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "simge baslik" "simge metin" ". sag"; row-gap: 2px; }
  #guncelleme-seridi .dugmeler { justify-self: end; margin: 8px 0 0; }
  #guncelleme-seridi .ilerleme { justify-self: stretch; width: auto; margin: 8px 0 2px; }
}
`;

/** Kartın üstündeki kalın başlık (0.3.1), aşamaya göre. Altındaki metin eskisi gibi. */
const BASLIKLAR = {
  var: 'Güncelleme var', indiriliyor: 'Güncelleme indiriliyor', onay: 'Güncelleme indirildi', kuruluyor: 'Güncelleme kuruluyor',
  hazir: 'Güncelleme kurulmaya hazır', tarayicida: 'Güncelleme tarayıcıda iniyor', hata: 'Güncelleme yapılamadı',
};

/** Aşamalar: bos | var | indiriliyor | onay (indirildi, kaydedilmemiş belgeler soruluyor) | kuruluyor | hazir (indirildi, kurulum
 *  ertelendi) | hata */
const SURUYOR = new Set(['indiriliyor', 'onay', 'kuruluyor', 'hazir']);

/** Beklenmeyen hata (ör. IPC çağrısı düştü): ayrıntı günlüğe, kullanıcıya kısa Türkçe ileti. */
const BEKLENMEYEN_HATA = 'Beklenmeyen bir hata oluştu. Biraz sonra yeniden deneyin.';

function boyutMetni(b) {
  if (!b || b <= 0) return '';
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * @param {object} p
 * @param {any} p.pdefe                     window.pdefe köprüsü (cagir / dinle)
 * @param {HTMLElement} p.serit             #guncelleme-seridi
 * @param {(metin: string, sure?: number) => void} p.bildir
 * @param {() => (boolean|void|Promise<boolean|void>)} [p.kapatmadanOnce]  kurmadan önce kaydedilmemiş değişiklikleri sorar; false kurulumu erteler
 * @param {() => void} [p.kurulamadi]        kapatmadanOnce izin verdikten sonra kurulum başlatılamadıysa çağrılır
 * @returns {{ denetle: (secenek?: {bildirim?: boolean}) => Promise<{durum: string, surum?: string, mevcut?: string, mesaj?: string}>,
 *            guncelle: () => Promise<boolean>, gizle: () => void, durum: () => object }}
 */
export function guncellemeSeridiKur({ pdefe, serit, bildir, kapatmadanOnce, kurulamadi }) {
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
        // macOS (0.2.0): yeni sürümün Mac paketi tarayıcıda iner, kullanıcı Uygulamalar klasörüne sürükler (main/macGuncelleme.js)
        // Linux (0.3.1): AppImage dışında çalışan PDEfe de tarayıcıdan indirir (ana süreç tarayicida bildirir)
        MAC || durum.tarayicida ? dugme('İndir', () => guncelle(), { sinif: 'birincil-serit', baslik: 'Yeni sürümü tarayıcıda indir' })
          : dugme('Güncelle', () => guncelle(), { sinif: 'birincil-serit', baslik: 'İndir, kur ve PDEfe\'yi yeniden başlat' }),
        dugme('Sürüm notları', () => pdefe.cagir('kabuk:disAc', `${SURUMLER_URL}/tag/v${durum.surum}`).catch(() => {}), { sinif: 'baglanti-dugme', baslik: 'GitHub sürüm sayfasını aç' }),
        dahaSonra(),
      );
      serit.append(metin, dugmeler);
    } else if (durum.asama === 'indiriliyor') {
      // 0.2.5 (kullanıcı isteği): indirme sürerken kapatılırsa yarım kalır, sonraki indirme baştan başlar (main/guncelleme.js başlığı)
      const ek = durum.toplam ? ` (${boyutMetni(durum.aktarilan)} / ${boyutMetni(durum.toplam)})` : '';
      metin.textContent = `PDEfe ${durum.surum} indiriliyor %${durum.yuzde}${ek}. `;
      const uyari = document.createElement('b'); uyari.className = 'uyari'; uyari.textContent = 'İndirme bitene dek PDEfe\'yi kapatmayın.';
      metin.append(uyari);
      const cubuk = document.createElement('span'); cubuk.className = 'ilerleme';
      cubuk.setAttribute('role', 'progressbar'); cubuk.setAttribute('aria-valuemin', '0'); cubuk.setAttribute('aria-valuemax', '100'); cubuk.setAttribute('aria-valuenow', String(durum.yuzde));
      const ic = document.createElement('i'); ic.style.width = `${durum.yuzde}%`; cubuk.append(ic);
      serit.append(metin, cubuk);
    } else if (durum.asama === 'onay') {
      // Kaydedilmemiş belge sorusu açıkken: karar verilmeden "kuruluyor" denmez
      metin.textContent = `PDEfe ${durum.surum} indirildi.`;
      serit.append(metin);
    } else if (durum.asama === 'kuruluyor') {
      metin.textContent = `PDEfe ${durum.surum} kuruluyor. Uygulama kapanıp yeniden açılacak.`;
      serit.append(metin);
    } else if (durum.asama === 'hazir') {
      metin.textContent = `PDEfe ${durum.surum} indirildi${kullandiginiz()}. Kurmak için PDEfe kapanıp yeniden açılacak.`;
      dugmeler.append(dugme('Kur ve yeniden başlat', () => guncelle(), { sinif: 'birincil-serit' }), dahaSonra());
      serit.append(metin, dugmeler);
    } else if (durum.asama === 'tarayicida') {
      // macOS (ve 0.3.1'den beri AppImage dışındaki Linux). Önce çıkılmalı (0.2.1): Finder açık uygulamanın yerine yenisini koymaz ("kullanımda"); yeni sürüm yerinde imzalı ve
      // karantinalı indiği için macOS ilk açılışta yeniden engelleyebilir (README "macOS" 3. adım)
      metin.textContent = MAC ? `PDEfe ${durum.surum} tarayıcıda iniyor. PDEfe'den çıkın (⌘Q), inen PDEfe-Mac dosyasını açıp PDEfe'yi Uygulamalar klasörüne sürükleyin (Değiştir), sonra PDEfe'yi açın. macOS açmayı engellerse: Sistem Ayarları › Gizlilik ve Güvenlik › Yine de Aç.`
        // Linux (0.3.1), AppImage dışında: yeni AppImage eskisinin yerine elle konur
        : `PDEfe ${durum.surum} tarayıcıda iniyor. PDEfe'den çıkın, inen PDEfe-Linux.AppImage dosyasını eskisinin yerine koyup çalıştırma izni verin (Özellikler › İzinler ya da chmod +x), sonra PDEfe'yi açın.`;
      dugmeler.append(dugme('Tamam', () => { durum.kapatildi = true; gizle(); }, { sinif: 'birincil-serit' }));
      serit.append(metin, dugmeler);
    } else if (durum.asama === 'hata') {
      metin.textContent = durum.hata;
      dugmeler.append(dugme('Yeniden dene', () => guncelle(), { sinif: 'birincil-serit' }), dahaSonra());
      serit.append(metin, dugmeler);
    }
    const baslik = document.createElement('strong'); baslik.className = 'baslik'; baslik.textContent = BASLIKLAR[durum.asama] || '';
    serit.prepend(baslik);
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
          if (!MAC && !durum.tarayicida) asama('indiriliyor', { yuzde: 0, aktarilan: 0, toplam: 0, hata: '' });   // macOS (Linux'ta AppImage dışı): tarayıcıda iner
          const r = await pdefe.cagir('guncelleme:indir');
          if (!r?.tamam) { asama('hata', { hata: `Güncelleme indirilemedi. ${r?.mesaj || 'İndirme tamamlanamadı.'}` }); return false; }
          if (r.tarayicida) { asama('tarayicida'); return false; }   // macOS: kurulum kullanıcıda
        }
        asama('onay');
        if (kapatmadanOnce && (await kapatmadanOnce()) === false) {
          asama('hazir');
          bildir('Güncelleme ertelendi. İndirilen sürüm saklandı.', 4000);
          return false;
        }
        asama('kuruluyor');
        // Kurulum başlamadıysa kapatmaya izin verirken girdiye kilitlenen pencereler açılır (kurulamadi; uygulama.js kurulumKilidi)
        let kuruldu = false;
        try { kuruldu = !!(await pdefe.cagir('guncelleme:kur')); } finally { if (!kuruldu) { try { kurulamadi?.(); } catch { /* yok say */ } } }
        if (!kuruldu) { asama('hata', { hata: 'Güncelleme kurulamadı. İndirilen kurulum dosyası bulunamadı.' }); return false; }
        return true;
      } catch (e) {
        console.error('[güncelleme]', e);
        asama('hata', { hata: 'Güncellenemedi. ' + BEKLENMEYEN_HATA });
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
    if (b?.tarayicida) durum.tarayicida = true;
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
    if (d.tarayicida) durum.tarayicida = true;
    if (akis || durum.asama !== 'bos') return;
    if (d.hazir) asama('hazir', { surum: d.hazir.surum, indirildi: true });
    else if (d.bulunan) asama('var', { surum: d.bulunan.surum });
  }).catch(() => {});

  /** Elle denetim (Yardım › Güncellemeleri denetle, Ayarlar › Güncelleme): otomatik denetimin süresine bakmaz; yeni sürüm varsa şerit ("Daha sonra" ile
   *  gizlenmiş olsa da) görünür. bildirim: false iken sonuç yalnızca döndürülür (Ayarlar kendisi yazar). */
  async function denetle({ bildirim = true } = {}) {
    if (bildirim) bildir('Güncellemeler denetleniyor', 2000);
    let sonuc;
    try { sonuc = await pdefe.cagir('guncelleme:denetle'); }
    catch (e) { console.error('[güncelleme] denetim:', e); sonuc = { durum: 'hata', mesaj: BEKLENMEYEN_HATA }; }
    if (sonuc?.mevcut) durum.mevcut = sonuc.mevcut;
    if (sonuc?.durum === 'var') {
      durum.kapatildi = false;
      if (!akis && !SURUYOR.has(durum.asama)) {
        // Ana süreçte indirilmiş paket varsa (ör. kurulum hatasından sonra) şerit doğrudan "Kur ve yeniden başlat"
        if (sonuc.asama === 'hazir') Object.assign(durum, { asama: 'hazir', indirildi: true, surum: sonuc.surum || durum.surum });
        else Object.assign(durum, { asama: 'var', surum: sonuc.surum || durum.surum });
      }
      ciz();
    } else if (bildirim) {
      bildir(sonuc?.mesaj || (sonuc?.durum === 'yok' ? 'PDEfe güncel.' : 'Güncellemeler denetlenemedi.'), sonuc?.durum === 'yok' ? 4000 : 6000);
    }
    return sonuc;
  }

  return { denetle, guncelle, gizle, durum: () => ({ ...durum, suruyor: !!akis }) };
}
