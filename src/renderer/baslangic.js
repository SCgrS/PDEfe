// Başlangıç (karşılama) ekranı: açık belge yokken belge alanında görünür. Solda iki eylem kartı (PDF aç, Görüntü / PDF birleştir),
// sağda son açılan belgeler. Kartlar uygulama komutlarını çalıştırır (dosya.ac: Windows'un Aç penceresi; arac.gorselBirlestir: araç
// penceresi, açık belge gerektirmez). Son açılanlar listesinde tıklama ya da Enter belgeyi açar; sağ tık Aç / Klasörde göster /
// Yolu kopyala / Listeden kaldır menüsünü, satırdaki × ve Delete yalnızca listeden kaldırmayı yapar (dosyaya dokunulmaz).
// "Son açılanları hatırla" kapalıyken liste yerine bunu söyleyen bir satır ve Ayarlar › Açılış ve düzen bağlantısı görünür.
// 0.1.8'e dek boş #gorunumler katmanı bu ekranın üstünde kaldığı için PDF aç düğmesi ve son açılanlar tıklanamıyordu (stil.css: z-index).
import { ARACLAR } from './aracPenceresi.js';

const simge = (ic, kutu = 24) => `<svg viewBox="0 0 ${kutu} ${kutu}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic}</svg>`;

// Açık klasör ve önündeki sayfa
const AC_IKON = '<path d="M2.75 7.25V18a1.75 1.75 0 0 0 1.75 1.75h15A1.75 1.75 0 0 0 21.25 18V9.5a1.75 1.75 0 0 0-1.75-1.75h-7.1L10.3 5.25H4.5A1.75 1.75 0 0 0 2.75 7v.25z"/><path d="M2.75 11.25h18.5"/>';
// Son açılan belge: sayfa ve PDEfe simgesindeki gibi kırmızı şerit
const BELGE_IKON = '<path d="M4.75 2.25h7l3.5 3.5v12H4.75z" fill="var(--arka-yukseltilmis)"/><path d="M11.75 2.25v3.5h3.5"/><rect x="3" y="9.75" width="14" height="4.75" rx="1" fill="#c42b1c" stroke="none"/>';
const IPUCU_IKON = '<path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 14.5v2h12v-2"/>';

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
    const birlestir = ARACLAR.find((a) => a.komut === 'arac.gorselBirlestir');
    kok.innerHTML = `
<div class="karsilama">
  <header class="karsilama-ust">
    <img class="karsilama-logo" src="../../build/icon.png" alt="" draggable="false">
    <div class="karsilama-baslik">
      <h1>PDEfe</h1>
      <p class="soluk">PDF görüntüleyici ve düzenleyici<span class="karsilama-surum"></span></p>
    </div>
  </header>
  <div class="karsilama-govde">
    <div class="karsilama-eylemler">
      <button type="button" class="karsilama-kart" data-eylem="dosya.ac" data-renk="mavi">
        <span class="karsilama-ikon">${simge(AC_IKON)}</span>
        <span class="karsilama-metin"><span class="karsilama-ad">PDF aç</span><span class="karsilama-aciklama">Bilgisayarınızdaki bir ya da birkaç PDF'i seçin</span></span>
      </button>
      <button type="button" class="karsilama-kart" data-eylem="arac.gorselBirlestir" data-renk="pembe">
        <span class="karsilama-ikon">${simge(birlestir?.ikon || '')}</span>
        <span class="karsilama-metin"><span class="karsilama-ad">${birlestir?.ad || 'Görüntü / PDF birleştir'}</span><span class="karsilama-aciklama">Fotoğraf, taranmış belge ve PDF'lerden tek PDF oluşturun</span></span>
      </button>
    </div>
    <section class="karsilama-son" aria-label="Son açılanlar">
      <div class="karsilama-son-ust">
        <h2>Son açılanlar</h2>
        <button type="button" class="karsilama-temizle" title="Son açılanlar listesini boşaltır; dosyalar silinmez">Listeyi temizle</button>
      </div>
      <ul id="son-dosyalar"></ul>
    </section>
  </div>
  <p class="karsilama-ipucu">${simge(IPUCU_IKON, 20)}<span>PDF'leri bu pencereye sürükleyip bırakarak da açabilirsiniz.</span></p>
</div>`;
    this.liste = kok.querySelector('#son-dosyalar');
    this.temizleDugmesi = kok.querySelector('.karsilama-temizle');
    for (const k of kok.querySelectorAll('.karsilama-kart')) k.addEventListener('click', () => this.komutCalistir(k.dataset.eylem));
    this.temizleDugmesi.addEventListener('click', () => this.temizle());
    pdefe.cagir('uygulama:bilgi').then((b) => { if (b?.surum) kok.querySelector('.karsilama-surum').textContent = ` · sürüm ${b.surum}`; }).catch(() => {});
  }

  /** Son açılanları (en çok 10) çizer. kapali: "Son açılanları hatırla" kapalı; liste yerine bilgi satırı. */
  listele(yollar, { kapali = false } = {}) {
    const ul = this.liste;
    ul.replaceChildren();
    const liste = kapali ? [] : (yollar || []).slice(0, 10);
    this.temizleDugmesi.hidden = !liste.length;
    if (kapali) {
      const li = document.createElement('li');
      li.className = 'karsilama-bos soluk';
      const ayarlar = document.createElement('button');
      ayarlar.type = 'button';
      ayarlar.className = 'karsilama-ayar-baglantisi';
      ayarlar.textContent = 'Ayarlar › Açılış ve düzen';
      ayarlar.addEventListener('click', () => this.komutCalistir('duzen.ayarlar', 'acilis'));
      li.append('Son açılan belgeler hatırlanmıyor. Açmak için: ', ayarlar);
      ul.append(li);
      return;
    }
    if (!liste.length) {
      const li = document.createElement('li');
      li.className = 'karsilama-bos soluk';
      li.textContent = 'Henüz açılan belge yok. Açtığınız belgeler burada listelenir.';
      ul.append(li);
      return;
    }
    for (const yol of liste) {
      const parca = yol.split(/[\\/]/);
      const ad = parca.pop(), klasor = parca.join('\\');
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
    (satirlar[Math.min(komsu, satirlar.length - 1)] || this.kok.querySelector('.karsilama-kart'))?.focus();
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
