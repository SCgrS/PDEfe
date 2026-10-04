// Başlangıç (karşılama) ekranı: açık belge yokken ve açılış sekmesinde (+ / Ctrl+T) belge alanında görünür. Tek sütun, yukarıdan aşağı:
// büyük PDF aç düğmesi (uygulamanın temel işi; sürükle-bırak bilgisi düğmenin açıklamasında), bütün araçlar (Araçlar penceresindeki
// ARACLAR, aynı sıra ve renklerle) ve "Son açılanlar" başlığının altında kutu içinde son açılan belgeler (en çok 10; geniş pencerede iki
// sütun, kaydırma çubuğu çıkmaz). Uygulamanın adı, "PDF görüntüleyici ve düzenleyici" ve sürüm sağ altta (0.1.14, kullanıcı isteği;
// 0.1.13'te ad üstte, sürükle-bırak ipucu düğmenin altında, son açılanlar sağ sütunda ve 10 belgede kaydırmalıydı). Düğmeler uygulama
// komutlarını çalıştırır: dosya.ac Windows'un Aç penceresi; belge gerektiren araç belge yokken önce Aç penceresini açar, seçilen PDF'le
// açılır (uygulama.js); Görüntü / PDF birleştir belge gerektirmez. Sağ alttaki simgeye ya da ada tıklanınca Ayarlar › Hakkında açılır
// (yardim.hakkinda; 0.1.15, kullanıcı isteği); imza düğme değildir, görünümü değişmez, Tab ile odaklanmaz (klavyeyle: Yardım › PDEfe
// hakkında). Son açılanlar listesinde tıklama ya da Enter belgeyi açar; sağ tık
// Aç / Klasörde göster / Yolu kopyala / Listeden kaldır menüsünü, satırdaki × ve Delete yalnızca listeden kaldırmayı yapar (dosyaya
// dokunulmaz). "Son açılanları hatırla" kapalıyken Son açılanlar bölümü (başlık ve kutu) hiç görünmez (0.1.13, kullanıcı isteği).
// 0.1.8'e dek boş #gorunumler katmanı bu ekranın üstünde kaldığı için PDF aç düğmesi ve son açılanlar tıklanamıyordu (stil.css: z-index).
import { ARACLAR } from './aracPenceresi.js';

const simge = (ic, kutu = 24) => `<svg viewBox="0 0 ${kutu} ${kutu}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic}</svg>`;
const kacis = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Açık klasör ve önündeki sayfa
const AC_IKON = '<path d="M2.75 7.25V18a1.75 1.75 0 0 0 1.75 1.75h15A1.75 1.75 0 0 0 21.25 18V9.5a1.75 1.75 0 0 0-1.75-1.75h-7.1L10.3 5.25H4.5A1.75 1.75 0 0 0 2.75 7v.25z"/><path d="M2.75 11.25h18.5"/>';
// Son açılan belge: sayfa ve kırmızı PDF şeridi (0.1.15'e dek uygulama simgesinde de vardı; 0.1.16'da simge değişti, bu kaldı)
const BELGE_IKON = '<path d="M4.75 2.25h7l3.5 3.5v12H4.75z" fill="var(--arka-yukseltilmis)"/><path d="M11.75 2.25v3.5h3.5"/><rect x="3" y="9.75" width="14" height="4.75" rx="1" fill="#c42b1c" stroke="none"/>';

export class BaslangicEkrani {
  /**
   * @param {object} s
   * @param {HTMLElement} s.kok                 #baslangic
   * @param {(id: string) => void} s.komutCalistir
   * @param {(yol: string) => void} s.ac         son açılan belgeyi açar
   * @param {(yol: string) => void} s.kaldir     yolu son açılanlardan çıkarır (liste yeniden çizilir)
   * @param {() => void} s.temizle              listeyi boşaltır
   * @param {any} s.pdefe                       köprü (menü, kabuk, pano, sürüm)
   * @param {(metin: string) => void} s.bildir
   */
  constructor({ kok, komutCalistir, ac, kaldir, temizle, pdefe, bildir }) {
    Object.assign(this, { kok, komutCalistir, ac, kaldir, temizle, pdefe, bildir });
    const aracKarti = (a) => `
          <button type="button" class="karsilama-arac" data-eylem="${a.komut}" data-renk="${a.renk}" title="${kacis(a.ipucu)}">
            <span class="karsilama-arac-ikon">${simge(a.ikon)}</span>
            <span class="karsilama-metin"><span class="karsilama-arac-ad">${kacis(a.ad)}</span><span class="karsilama-aciklama">${kacis(a.aciklama)}</span></span>
          </button>`;
    // .karsilama ve .karsilama-imza #baslangic ızgarasının satırlarıdır (stil.css): üstteki boşluk alttakinin yarısı, imza en altta
    kok.innerHTML = `
<div class="karsilama">
  <button type="button" class="karsilama-ac" data-eylem="dosya.ac">
    <span class="karsilama-ac-ikon">${simge(AC_IKON)}</span>
    <span class="karsilama-metin"><span class="karsilama-ac-ad">PDF aç</span><span class="karsilama-aciklama">Bilgisayarınızdaki bir ya da birkaç PDF'i seçin veya bu pencereye sürükleyin</span></span>
  </button>
  <section class="karsilama-araclar" aria-label="Araçlar">
    <h2>Araçlar</h2>
    <div class="karsilama-arac-izgara">${ARACLAR.map(aracKarti).join('')}
    </div>
  </section>
  <section class="karsilama-son" aria-label="Son açılanlar">
    <div class="karsilama-son-ust">
      <h2>Son açılanlar</h2>
      <button type="button" class="karsilama-temizle" title="Son açılanlar listesini boşaltır; dosyalar silinmez">Listeyi temizle</button>
    </div>
    <ul id="son-dosyalar"></ul>
  </section>
</div>
<footer class="karsilama-imza" data-eylem="yardim.hakkinda">
  <img class="karsilama-logo" src="../../build/icon.png" alt="" draggable="false">
  <div class="karsilama-baslik">
    <p class="karsilama-ad">PDEfe</p>
    <p class="karsilama-alt">PDF görüntüleyici ve düzenleyici<span class="karsilama-surum"></span></p>
  </div>
</footer>`;
    this.son = kok.querySelector('.karsilama-son');
    this.liste = kok.querySelector('#son-dosyalar');
    this.temizleDugmesi = kok.querySelector('.karsilama-temizle');
    for (const k of kok.querySelectorAll('[data-eylem]')) k.addEventListener('click', () => this.komutCalistir(k.dataset.eylem));
    this.temizleDugmesi.addEventListener('click', () => this.temizle());
    pdefe.cagir('uygulama:bilgi').then((b) => { if (b?.surum) kok.querySelector('.karsilama-surum').textContent = ` · sürüm ${b.surum}`; }).catch(() => {});
  }

  /** Son açılanları (en çok 10) çizer. kapali: "Son açılanları hatırla" kapalı; bölüm (başlık ve kutu) hiç görünmez. */
  listele(yollar, { kapali = false } = {}) {
    const ul = this.liste;
    ul.replaceChildren();
    this.son.hidden = kapali;
    if (kapali) return;
    const liste = (yollar || []).slice(0, 10);
    this.temizleDugmesi.hidden = !liste.length;
    if (!liste.length) {
      const li = document.createElement('li');
      li.className = 'karsilama-bos soluk';
      li.textContent = 'Henüz açılan belge yok. Açtığınız belgeler burada listelenir.';
      ul.append(li);
      return;
    }
    for (const yol of liste) {
      // Klasör yolun kendisinden kesilir (araclar/ortak.js klasorAdi gibi): parçalar ters bölüyle birleştiriliyordu, macOS'ta
      // '/Volumes/Arşiv' satırda '\Volumes\Arşiv' görünüyordu (0.2.1). Windows'ta gösterilen metin aynı
      const i = Math.max(yol.lastIndexOf('/'), yol.lastIndexOf('\\'));
      const ad = yol.slice(i + 1), klasor = i >= 0 ? yol.slice(0, i) : '';
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="karsilama-oge"><span class="karsilama-oge-ikon">${simge(BELGE_IKON, 20)}</span><span class="karsilama-oge-metin"><span class="ad"></span><span class="yol"></span></span></button><button type="button" class="karsilama-kaldir" title="Listeden kaldır" aria-label="Listeden kaldır">${simge('<path d="m6 6 8 8M14 6l-8 8"/>', 20)}</button>`;
      const oge = li.querySelector('.karsilama-oge');
      li.querySelector('.ad').textContent = ad;
      li.querySelector('.yol').textContent = klasor;
      oge.title = yol;
      oge.addEventListener('click', () => this.ac(yol));
      oge.addEventListener('keydown', (e) => { if (e.key === 'Delete') { e.preventDefault(); this.kaldirVeOdakla(li, yol); } });
      oge.addEventListener('contextmenu', (e) => { e.preventDefault(); this.menu(li, yol); });
      li.querySelector('.karsilama-kaldir').addEventListener('click', () => this.kaldirVeOdakla(li, yol));
      ul.append(li);
    }
  }

  /** Satırı listeden kaldırır; klavyeyle çalışılıyorsa odak sonraki (yoksa önceki) satıra geçer. */
  kaldirVeOdakla(li, yol) {
    const odakta = li.contains(document.activeElement);
    const komsu = [...this.liste.children].indexOf(li);
    this.kaldir(yol);
    if (!odakta) return;
    const satirlar = this.liste.querySelectorAll('.karsilama-oge');
    (satirlar[Math.min(komsu, satirlar.length - 1)] || this.kok.querySelector('.karsilama-ac'))?.focus();
  }

  async menu(li, yol) {
    const secim = await this.pdefe.cagir('menu:popup', [
      { id: 'ac', etiket: 'Aç' }, { id: 'klasor', etiket: 'Klasörde göster' }, { id: 'yol', etiket: 'Yolu kopyala' },
      { ayirici: true }, { id: 'kaldir', etiket: 'Listeden kaldır' },
    ]);
    if (secim === 'ac') this.ac(yol);
    else if (secim === 'klasor') this.pdefe.cagir('kabuk:klasordeGoster', yol);
    else if (secim === 'yol') { await this.pdefe.cagir('pano:metin', yol); this.bildir('Yol panoya kopyalandı'); }
    else if (secim === 'kaldir') this.kaldirVeOdakla(li, yol);
  }
}
