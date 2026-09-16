// Güncelleme şeridi (araç çubuğunun altındaki #guncelleme-seridi).
//
// Kullanım (uygulama.js):
//   import { guncellemeSeridiKur } from './guncelleme.js';
//   const guncelleme = guncellemeSeridiKur({ pdefe, serit: $('#guncelleme-seridi'), bildir, kapatmadanOnce: oturumuKaydet });
//   komutlar['yardim.guncelle'] = () => guncelleme.denetle();
//
// Akış: main 'guncelleme:var' gönderir → şerit "PDEfe x.y.z hazır — [Güncellemeyi yükle] [Sürüm notları] [×]"
//       yükle → 'guncelleme:indir' → 'guncelleme:ilerleme' ile çubuk "İndiriliyor %42"
//       'guncelleme:hazir' → "[Şimdi yeniden başlat ve kur]" → kapatmadanOnce() → 'guncelleme:kur'
//       × → bu oturumda bir daha gösterilmez (elle denetim yine gösterir). Hata → bildir().

const SURUMLER_URL = 'https://github.com/CgrShn/PDEfe/releases';

const STIL = `
#guncelleme-seridi { flex-wrap: wrap; font-size: 13px; }
#guncelleme-seridi .metin { flex: 1 1 auto; min-width: 160px; }
#guncelleme-seridi .dugmeler { display: flex; gap: 6px; align-items: center; }
#guncelleme-seridi button { color: inherit; font: inherit; cursor: pointer; line-height: 1.2; }
#guncelleme-seridi button:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
#guncelleme-seridi button:disabled { opacity: 0.6; cursor: default; }
#guncelleme-seridi button.kapat { border: none; width: 24px; height: 24px; padding: 0; font-size: 16px; border-radius: 50%; }
#guncelleme-seridi .ilerleme { flex: 1 1 160px; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.35); overflow: hidden; }
#guncelleme-seridi .ilerleme > i { display: block; height: 100%; width: 0; background: currentColor; transition: width .2s; }
#guncelleme-seridi details { font-weight: 400; flex-basis: 100%; }
#guncelleme-seridi details summary { cursor: pointer; }
#guncelleme-seridi details pre { white-space: pre-wrap; margin: 6px 0 2px; max-height: 160px; overflow: auto; font: inherit; }
`;

function boyutMetni(b) {
  if (!b || b <= 0) return '';
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * @param {object} p
 * @param {any} p.pdefe                     window.pdefe köprüsü (cagir / dinle)
 * @param {HTMLElement} p.serit             #guncelleme-seridi
 * @param {(metin: string, sure?: number) => void} p.bildir
 * @param {() => (void|Promise<any>)} [p.kapatmadanOnce]  kurmadan önce oturumu kaydeder; false döndürürse kurulum iptal
 * @returns {{ denetle: () => Promise<{durum: string, surum?: string, mesaj?: string}>, gizle: () => void }}
 */
export function guncellemeSeridiKur({ pdefe, serit, bildir, kapatmadanOnce }) {
  if (!serit) throw new Error('Güncelleme şeridi öğesi (#guncelleme-seridi) bulunamadı.');
  if (!document.getElementById('guncelleme-stil')) {
    const s = document.createElement('style');
    s.id = 'guncelleme-stil'; s.textContent = STIL;
    document.head.append(s);
  }

  const durum = { asama: 'bos', surum: null, notlar: '', yuzde: 0, aktarilan: 0, toplam: 0, kapatildi: false, kuruluyor: false };
  const dinleyiciler = [];

  function temizle() { serit.replaceChildren(); }

  function dugme(etiket, tiklama, { sinif = '', baslik = '', devre = false } = {}) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = etiket; if (sinif) b.className = sinif; if (baslik) b.title = baslik;
    b.disabled = devre;
    b.addEventListener('click', tiklama);
    return b;
  }

  function kapatDugmesi() {
    return dugme('×', () => { durum.kapatildi = true; gizle(); }, { sinif: 'kapat', baslik: 'Bu oturumda bir daha gösterme' });
  }

  function notlarOgesi() {
    if (!durum.notlar) return null;
    const d = document.createElement('details');
    const s = document.createElement('summary'); s.textContent = 'Sürüm notları';
    const p = document.createElement('pre'); p.textContent = durum.notlar;
    d.append(s, p);
    return d;
  }

  function ciz() {
    temizle();
    if (durum.asama === 'bos') { serit.hidden = true; return; }
    const metin = document.createElement('span'); metin.className = 'metin';
    const dugmeler = document.createElement('span'); dugmeler.className = 'dugmeler';

    if (durum.asama === 'var') {
      metin.textContent = `PDEfe ${durum.surum} hazır — yeni sürümü şimdi yükleyebilirsiniz.`;
      dugmeler.append(
        dugme('Güncellemeyi yükle', indir),
        dugme('Sürüm notları', () => pdefe.cagir('kabuk:disAc', `${SURUMLER_URL}/tag/v${durum.surum}`), { baslik: 'GitHub sürüm sayfasını aç' }),
        kapatDugmesi(),
      );
      serit.append(metin, dugmeler);
      const n = notlarOgesi(); if (n) serit.append(n);
    } else if (durum.asama === 'indiriliyor') {
      const ek = durum.toplam ? ` (${boyutMetni(durum.aktarilan)} / ${boyutMetni(durum.toplam)})` : '';
      metin.textContent = `PDEfe ${durum.surum} indiriliyor %${durum.yuzde}${ek}`;
      const cubuk = document.createElement('span'); cubuk.className = 'ilerleme';
      cubuk.setAttribute('role', 'progressbar'); cubuk.setAttribute('aria-valuenow', String(durum.yuzde));
      const ic = document.createElement('i'); ic.style.width = `${durum.yuzde}%`; cubuk.append(ic);
      dugmeler.append(kapatDugmesi());
      serit.append(metin, cubuk, dugmeler);
    } else if (durum.asama === 'hazir') {
      metin.textContent = `PDEfe ${durum.surum} indirildi. Kurmak için uygulamanın yeniden başlatılması gerekiyor.`;
      dugmeler.append(
        dugme(durum.kuruluyor ? 'Yeniden başlatılıyor…' : 'Şimdi yeniden başlat ve kur', kur, { devre: durum.kuruluyor }),
        kapatDugmesi(),
      );
      serit.append(metin, dugmeler);
    }
    serit.hidden = false;
  }

  function gizle() { serit.hidden = true; temizle(); }

  async function indir() {
    if (durum.asama === 'hazir') { ciz(); return; }
    durum.asama = 'indiriliyor'; durum.yuzde = 0; durum.aktarilan = 0; durum.toplam = 0; durum.kapatildi = false;
    ciz();
    try {
      const tamam = await pdefe.cagir('guncelleme:indir');
      if (!tamam && durum.asama === 'indiriliyor') { durum.asama = 'var'; ciz(); }
    } catch (e) {
      bildir('Güncelleme indirilemedi: ' + (e?.message || e), 6000);
      durum.asama = 'var'; ciz();
    }
  }

  async function kur() {
    if (durum.kuruluyor) return;
    durum.kuruluyor = true; ciz();
    try {
      if (kapatmadanOnce) {
        const r = await kapatmadanOnce();
        if (r === false) { durum.kuruluyor = false; ciz(); return; }
      }
      const tamam = await pdefe.cagir('guncelleme:kur');
      if (!tamam) { bildir('Güncelleme kurulamadı: indirilmiş paket bulunamadı.', 6000); durum.kuruluyor = false; durum.asama = 'var'; ciz(); }
    } catch (e) {
      bildir('Güncelleme kurulamadı: ' + (e?.message || e), 6000);
      durum.kuruluyor = false; ciz();
    }
  }

  // ---- ana süreçten gelen olaylar
  dinleyiciler.push(pdefe.dinle('guncelleme:var', (b) => {
    durum.surum = b?.surum || ''; durum.notlar = b?.notlar || '';
    if (durum.asama === 'indiriliyor' || durum.asama === 'hazir') return;
    durum.asama = 'var';
    if (durum.kapatildi) return;      // × ile kapatıldı: elle denetimde denetle() yeniden gösterir
    ciz();
  }));
  dinleyiciler.push(pdefe.dinle('guncelleme:ilerleme', (p) => {
    durum.asama = 'indiriliyor';
    durum.yuzde = p?.yuzde ?? 0; durum.aktarilan = p?.aktarilan ?? 0; durum.toplam = p?.toplam ?? 0;
    if (!durum.kapatildi) ciz();
  }));
  dinleyiciler.push(pdefe.dinle('guncelleme:hazir', (b) => {
    durum.asama = 'hazir'; durum.surum = b?.surum || durum.surum; durum.kuruluyor = false;
    durum.kapatildi = false;          // indirme bitti: kullanıcı kapatmış olsa da kurma seçeneğini bir kez göster
    ciz();
  }));
  dinleyiciler.push(pdefe.dinle('guncelleme:hata', (b) => {
    bildir('Güncelleme hatası: ' + (b?.mesaj || 'bilinmeyen hata'), 6000);
    if (durum.asama === 'indiriliyor') { durum.asama = 'var'; if (!durum.kapatildi) ciz(); }
  }));

  /** Elle denetim (Yardım → Güncellemeleri denetle). Şerit kapatılmış olsa da sonucu gösterir. */
  async function denetle() {
    bildir('Güncelleme denetleniyor…', 2000);
    let sonuc;
    try { sonuc = await pdefe.cagir('guncelleme:denetle'); }
    catch (e) { sonuc = { durum: 'hata', mesaj: e?.message || String(e) }; }
    if (sonuc?.durum === 'var') {
      durum.kapatildi = false;
      durum.surum = sonuc.surum || durum.surum;
      if (durum.asama === 'bos') durum.asama = 'var';
      ciz();
      bildir(`PDEfe ${sonuc.surum} hazır.`, 4000);
    } else if (sonuc?.durum === 'yok') {
      bildir(sonuc.mesaj || 'PDEfe güncel.', 4000);
    } else {
      bildir(sonuc?.mesaj || 'Güncelleme denetlenemedi.', 6000);
    }
    return sonuc;
  }

  return { denetle, gizle };
}
