// PDF küçült: mevcut boyut, üç hazır seviye + özel (DPI / JPEG kalitesi), tahminler, ilerleme, sonuç.
// Çekirdek: kucult_tahmin {yol, seviye?, dpi?, kalite?} ve kucult {yol, hedef, seviye, dpi, kalite} (ilerlemeli).
import {
  pencereAc, pencereAcikMi, IslemIlerleme, boyutMetni, farkMetni, kacis, hataMetni, dosyaAdi, klasorAdi, adGovdesi, yolBirlestir,
  bosAdBul, dosyaBoyutu, zamanDamgasi, degisiklikleriSor, geciktir, oge,
} from './ortak.js';

/** Hazır seviyeler. dpi/kalite değerleri yalnızca bilgi amaçlıdır; çekirdek (core/islemler/araclar.py SEVIYELER)
 *  adlandırılmış seviyelerde kendi değerlerini kullanır, bu tablo onunla aynı tutulur. */
export const SEVIYELER = {
  asiri: { ad: 'Aşırı sıkıştırma', aciklama: 'En küçük dosya; görseller belirgin biçimde bulanıklaşır. E-posta ve arşiv için.', dpi: 96, kalite: 45 },
  onerilen: { ad: 'Önerilen sıkıştırma', aciklama: 'İyi kalite, iyi sıkıştırma. Ekranda okuma ve paylaşım için uygundur.', dpi: 150, kalite: 72 },
  dusuk: { ad: 'Düşük sıkıştırma', aciklama: 'Yüksek kalite; yalnızca gereksiz veriler atılır, görseller hafifçe sıkıştırılır.', dpi: 220, kalite: 88 },
};

export class KucultPenceresi {
  constructor(baglam, belge) {
    this.baglam = baglam;
    this.belge = belge;
    this.seviye = 'onerilen';
    this.ozel = { dpi: 120, kalite: 70 };
    this.tahminler = {};
    this.ornekleme = false;          // çekirdek büyük belgede ilk sayfaları örnekleyerek tahmin etti
    this.ozelTahminDestegi = null;   // null: bilinmiyor, false: çekirdek özel seviye tahmini vermiyor
    this.uzerineYaz = false;
    this.ilerleme = new IslemIlerleme();
    this.ozelTahminGeciktir = geciktir(() => this.ozelTahminAl(), 700);
    this.ozelTahminSayac = 0;
    this._kur();
  }

  _kur() {
    const b = this.belge;
    const govde = oge(`<div class="kucult-govde">
      <div class="kucult-boyut"><div class="deger sayi">${boyutMetni(b.boyut)}</div><div class="etiket">${kacis(b.ad)} · ${b.gorunum?.sayfaSayisi || '?'} sayfa · mevcut boyut</div></div>
      <div class="kucult-kartlar" role="radiogroup"></div>
      <div class="arac-aciklama kucult-not" hidden></div>
      <div class="arac-alan kucult-cikti">
        <div class="arac-satir"><span class="arac-etiket" style="margin:0">Çıktı</span></div>
        <div class="arac-satir"><span class="soluk kucult-cikti-yol" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span></div>
        <label><input type="checkbox" class="kucult-uzerine"> Üzerine yaz (özgün dosya önce yedeklenir)</label>
      </div>
      <div class="kucult-sonuc" hidden></div>
    </div>`);
    this.govde = govde;
    this.kartlar = govde.querySelector('.kucult-kartlar');
    for (const [id, s] of Object.entries(SEVIYELER)) this.kartlar.append(this._kart(id, s.ad, s.aciklama));
    this.kartlar.append(this._ozelKart());
    govde.querySelector('.kucult-cikti').append(this.ilerleme.el);
    this.ciktiYolEl = govde.querySelector('.kucult-cikti-yol');
    this.notEl = govde.querySelector('.kucult-not');
    this.uzerineEl = govde.querySelector('.kucult-uzerine');
    this.uzerineEl.addEventListener('change', () => { this.uzerineYaz = this.uzerineEl.checked; this.ciktiYoluYaz(); });
    this.sonucEl = govde.querySelector('.kucult-sonuc');

    this.pencere = pencereAc({
      baslik: 'PDF küçült', govde, genislik: 680, anahtar: 'kucult', sinif: 'kucult-pencere',
      dugmeler: [
        { id: 'kucult', etiket: 'Küçült', birincil: true, tiklama: () => this.kucult() },
        { id: 'kapat', etiket: 'Kapat' },
      ],
      kapatmadanOnce: () => this._kapatmaIzni(),
    });
    this.pencere.el.addEventListener('esc', (e) => { if (this.ilerleme.calisiyor) { e.preventDefault(); this.ilerleme.iptalIste(); } });
    this.seviyeSec('onerilen');
    this.ciktiYoluHazirla();
    this.tahminleriAl();
  }

  async _kapatmaIzni() {
    if (!this.ilerleme.calisiyor) return true;
    const { secim } = await this.baglam.mesajKutusu({ mesaj: 'Küçültme sürüyor.', ayrinti: 'Pencereyi kapatırsanız işlem iptal edilir.', dugmeler: ['İptal et ve kapat', 'Sürdür'], varsayilan: 1, iptal: 1 });
    if (secim !== 0) return false;
    this.ilerleme.iptalIste();
    return true;
  }

  _kart(id, ad, aciklama) {
    const k = oge(`<label class="kucult-kart" data-seviye="${id}"><input type="radio" name="kucult-seviye" value="${id}"><span class="ad">${kacis(ad)}</span><span class="aciklama">${kacis(aciklama)}</span><span class="tahmin bekliyor">hesaplanıyor…</span></label>`);
    k.querySelector('input').addEventListener('change', () => this.seviyeSec(id));
    return k;
  }

  _ozelKart() {
    const k = oge(`<label class="kucult-kart kucult-ozel" data-seviye="ozel"><input type="radio" name="kucult-seviye" value="ozel"><span class="ad">Özel</span><span class="aciklama">Görsel çözünürlüğünü (DPI) ve JPEG kalitesini kendiniz seçin.</span>
      <div class="surguler">
        <span>Çözünürlük</span><input type="range" class="dpi" min="50" max="300" step="1"><span class="deger dpi-deger"></span>
        <span>JPEG kalitesi</span><input type="range" class="kalite" min="20" max="95" step="1"><span class="deger kalite-deger"></span>
      </div><span class="tahmin soluk">tahmin için Özel'i seçin</span></label>`);
    const dpi = k.querySelector('.dpi'), kalite = k.querySelector('.kalite');
    dpi.value = this.ozel.dpi; kalite.value = this.ozel.kalite;
    const yaz = () => { k.querySelector('.dpi-deger').textContent = dpi.value + ' DPI'; k.querySelector('.kalite-deger').textContent = '%' + kalite.value; };
    yaz();
    const degisti = () => {
      this.ozel = { dpi: +dpi.value, kalite: +kalite.value };
      yaz();
      if (this.seviye !== 'ozel') { k.querySelector('input[type=radio]').checked = true; this.seviyeSec('ozel'); }
      else { this._tahminYaz('ozel', null, 'hesaplanıyor…'); this.ozelTahminGeciktir(); }
    };
    dpi.addEventListener('input', degisti); kalite.addEventListener('input', degisti);
    // Sürgüde ok tuşları pencere odak döngüsüne takılmasın
    for (const s of [dpi, kalite]) s.addEventListener('keydown', (e) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) e.stopPropagation(); });
    k.querySelector('input[type=radio]').addEventListener('change', () => this.seviyeSec('ozel'));
    return k;
  }

  seviyeSec(id) {
    this.seviye = id;
    for (const k of this.kartlar.querySelectorAll('.kucult-kart')) {
      const secili = k.dataset.seviye === id;
      k.classList.toggle('secili', secili);
      k.querySelector('input[type=radio]').checked = secili;
    }
    if (id === 'ozel' && this.tahminler.ozel === undefined) { this._tahminYaz('ozel', null, 'hesaplanıyor…'); this.ozelTahminGeciktir(); }
  }

  /** Kart altındaki tahmin metni. boyut null + mesaj: bekleme/bilgi; hata: kırmızı; soluk: bilgi notu. */
  _tahminYaz(id, boyut, mesaj, hata, soluk = false) {
    const el = this.kartlar.querySelector(`.kucult-kart[data-seviye="${id}"] .tahmin`);
    if (!el) return;
    el.classList.remove('bekliyor', 'hata', 'soluk');
    if (hata) { el.classList.add('hata'); el.textContent = hata; return; }
    if (boyut == null) { el.classList.add(soluk ? 'soluk' : 'bekliyor'); el.textContent = mesaj || 'hesaplanıyor…'; return; }
    el.innerHTML = `<b>${kacis(boyutMetni(boyut))}</b> · ${kacis(farkMetni(this.belge.boyut, boyut))}${this.ornekleme ? ' <span class="soluk" title="Büyük belge: ilk sayfalar örneklenerek tahmin edildi">≈</span>' : ''}`;
  }

  /**
   * kucult_tahmin sonucunu okur. Çekirdek biçimi: {mevcut, seviyeler:{asiri|onerilen|dusuk:{boyut, yuzde, dpi, kalite}}, tahmin:bool, sure}.
   * Esneklik için {seviyeler:{id: sayı}} ve {id: sayı|{boyut}} de kabul edilir. Bulunamazsa null.
   */
  static tahminOku(sonuc, id) {
    if (!sonuc || typeof sonuc !== 'object') return null;
    const kaynak = sonuc.seviyeler?.[id] ?? sonuc.tahminler?.[id] ?? sonuc[id];
    if (kaynak == null) return null;
    if (typeof kaynak === 'number') return Number.isFinite(kaynak) ? kaynak : null;
    if (typeof kaynak === 'object') { const b = kaynak.boyut; return typeof b === 'number' && Number.isFinite(b) ? b : null; }
    return null;
  }

  async tahminleriAl() {
    try {
      // Adlandırılmış seviyeler için çekirdek kendi dpi/kalite tablosunu kullanır (seviyeler:{ad:true});
      // yanıttaki dpi/kalite kart açıklamasına yazılır, böylece arayüz çekirdekle uyumlu kalır.
      const sonuc = await this.baglam.cekirdek('kucult_tahmin', { yol: this.belge.yol, seviyeler: Object.fromEntries(Object.keys(SEVIYELER).map((k) => [k, true])) });
      if (this.pencere.kapali) return;
      this.ornekleme = sonuc?.tahmin === true;
      let eksik = 0;
      for (const id of Object.keys(SEVIYELER)) {
        const b = KucultPenceresi.tahminOku(sonuc, id);
        this.tahminler[id] = b;
        if (b == null) { eksik++; this._tahminYaz(id, null, null, 'tahmin alınamadı'); }
        else this._tahminYaz(id, b);
        const s = sonuc?.seviyeler?.[id];
        if (s && typeof s === 'object' && s.dpi && s.kalite) {
          const ac = this.kartlar.querySelector(`.kucult-kart[data-seviye="${id}"] .aciklama`);
          if (ac) ac.textContent = `${SEVIYELER[id].aciklama} (${s.dpi} DPI, JPEG %${s.kalite})`;
        }
      }
      const notlar = [];
      if (this.ornekleme) notlar.push('Büyük belge: tahminler ilk sayfalar örneklenerek hesaplandı (≈); gerçek sonuç biraz farklı olabilir.');
      if (eksik) notlar.push('Bazı seviyeler için tahmin alınamadı; küçültme yine de yapılabilir.');
      this.notEl.hidden = !notlar.length;
      this.notEl.textContent = notlar.join(' ');
    } catch (e) {
      if (this.pencere.kapali) return;
      for (const id of Object.keys(SEVIYELER)) this._tahminYaz(id, null, null, 'tahmin alınamadı');
      this.pencere.hataGoster('Boyut tahmini alınamadı: ' + hataMetni(e));
    }
  }

  /**
   * Özel seviye tahmini. Çekirdeğin şimdiki sürümü yalnızca üç hazır seviyeyi ölçer; seviyeler:{ozel:{dpi,kalite}}
   * gönderilir, yanıtta seviyeler.ozel yoksa "tahmin yok" notu gösterilir (çekirdek desteklerse kendiliğinden çalışır).
   */
  async ozelTahminAl() {
    if (this.ozelTahminDestegi === false) { this._ozelTahminYok(); return; }
    const sayac = ++this.ozelTahminSayac;
    const { dpi, kalite } = this.ozel;
    try {
      const sonuc = await this.baglam.cekirdek('kucult_tahmin', { yol: this.belge.yol, dpi, kalite, seviyeler: { ozel: { dpi, kalite } } });
      if (this.pencere.kapali || sayac !== this.ozelTahminSayac) return;
      const b = KucultPenceresi.tahminOku(sonuc, 'ozel');
      if (b == null) { this.ozelTahminDestegi = false; this._ozelTahminYok(); return; }
      this.ozelTahminDestegi = true;
      this.tahminler.ozel = b;
      this._tahminYaz('ozel', b);
    } catch (e) {
      if (this.pencere.kapali || sayac !== this.ozelTahminSayac) return;
      this._tahminYaz('ozel', null, null, 'tahmin alınamadı: ' + hataMetni(e));
    }
  }

  _ozelTahminYok() {
    this.tahminler.ozel = null;
    this._tahminYaz('ozel', null, 'Özel ayar için önceden tahmin yapılmaz; sonuç boyutu küçültme bitince gösterilir.', null, true);
  }

  async ciktiYoluHazirla() {
    const klasor = klasorAdi(this.belge.yol);
    let ad = adGovdesi(this.belge.yol) + '_kucuk.pdf';
    try { ad = await bosAdBul(this.baglam.pdefe, klasor, ad); } catch { /* varsayılan ad */ }
    this.ciktiKlasor = klasor;
    this.ciktiAd = ad;
    this.ciktiYoluYaz();
  }

  ciktiYoluYaz() {
    if (this.uzerineYaz) { this.ciktiYolEl.textContent = this.belge.yol; this.ciktiYolEl.title = 'Özgün dosyanın üzerine yazılır'; }
    else { this.ciktiYolEl.textContent = yolBirlestir(this.ciktiKlasor || '', this.ciktiAd || '…'); this.ciktiYolEl.title = this.ciktiYolEl.textContent; }
  }

  secilenParametreler() {
    if (this.seviye === 'ozel') return { seviye: 'ozel', dpi: this.ozel.dpi, kalite: this.ozel.kalite };
    const s = SEVIYELER[this.seviye];
    return { seviye: this.seviye, dpi: s.dpi, kalite: s.kalite };
  }

  async kucult() {
    const { baglam, belge } = this;
    if (this.ilerleme.calisiyor) return;
    this.pencere.hataGoster('');
    this.sonucEl.hidden = true;
    if ((await degisiklikleriSor(baglam, belge, 'Küçültme')) === 'vazgec') return;
    if (this.pencere.kapali) return;

    let hedef;
    if (this.uzerineYaz) {
      const { secim } = await baglam.mesajKutusu({ tur: 'warning', mesaj: 'Özgün dosyanın üzerine yazılacak.', ayrinti: `${belge.yol}\n\nÖnce veri klasöründe bir yedek alınır. Devam edilsin mi?`, dugmeler: ['Üzerine yaz', 'Vazgeç'], varsayilan: 0, iptal: 1 });
      if (secim !== 0) return;
      hedef = belge.yol;
    } else {
      if (!this.ciktiAd) await this.ciktiYoluHazirla();
      hedef = yolBirlestir(this.ciktiKlasor, this.ciktiAd);
      if (await baglam.pdefe.cagir('dosya:varMi', hedef)) {
        const { secim } = await baglam.mesajKutusu({ mesaj: `"${this.ciktiAd}" zaten var.`, ayrinti: 'Üzerine yazılsın mı?', dugmeler: ['Üzerine yaz', 'Vazgeç'], varsayilan: 1, iptal: 1 });
        if (secim !== 0) return;
      }
    }

    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('kucult', { devre: true });
    this.pencere.dugmeAyarla('kapat', { devre: true });
    let yedek = null;
    try {
      if (this.uzerineYaz) {
        const veriKlasoru = await baglam.pdefe.cagir('uygulama:veriKlasoru');
        yedek = yolBirlestir(yolBirlestir(veriKlasoru, 'yedek'), `${zamanDamgasi()}_${belge.ad}`);
        await baglam.pdefe.cagir('dosya:kopyala', belge.yol, yedek);
        baglam.bildir('Yedek alındı: ' + yedek, 5000);
      }
      const p = this.secilenParametreler();
      // Çekirdek (kucult): geçici dosyaya yazıp os.replace ile hedefe taşır; hedef == yol (üzerine yazma) desteklenir.
      // Sonuç: {boyut, oncekiBoyut, yuzde, uyari, dpi, kalite}
      const sonuc = await this.ilerleme.calistir(baglam, 'kucult', { yol: belge.yol, hedef, ...p }, { baslangicMesaji: 'Küçültülüyor…' });
      const yeniBoyut = sonuc?.boyut ?? await dosyaBoyutu(baglam.pdefe, hedef);
      await this.sonucGoster(hedef, yeniBoyut, yedek);
    } catch (e) {
      if (e.iptal) {
        this.ilerleme.gizle();
        // İş yine de bittiyse (iptal geç ulaştı) ve yeni dosya oluştuysa çöp kutusuna gönder
        if (!this.uzerineYaz && e.sonuc) { try { await baglam.pdefe.cagir('dosya:sil', hedef); } catch { /* yok say */ } }
        baglam.bildir('Küçültme iptal edildi.');
      } else {
        this.ilerleme.gizle();
        this.pencere.hataGoster('Küçültme başarısız: ' + hataMetni(e) + (yedek ? `\nYedek: ${yedek}` : ''));
      }
    } finally {
      this.pencere.el.classList.remove('mesgul');
      this.pencere.dugmeAyarla('kucult', { devre: false });
      this.pencere.dugmeAyarla('kapat', { devre: false });
    }
  }

  async sonucGoster(yol, yeniBoyut, yedek) {
    const { baglam, belge } = this;
    const eski = belge.boyut;
    const buyuk = yeniBoyut != null && eski && yeniBoyut >= eski;
    this.sonucEl.hidden = false;
    this.sonucEl.className = 'kucult-sonuc ' + (buyuk ? 'arac-uyari' : 'arac-basari');
    this.sonucEl.innerHTML = `<div><b>${buyuk ? 'Dosya küçülmedi.' : 'Küçültme tamamlandı.'}</b> ${kacis(boyutMetni(eski))} → <b>${kacis(boyutMetni(yeniBoyut))}</b> (${kacis(farkMetni(eski, yeniBoyut))})</div>
      <div class="soluk" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${kacis(yol)}">${kacis(yol)}</div>
      ${buyuk ? '<div>Belge zaten sıkıştırılmış olabilir ya da görsel içermiyor olabilir. Daha güçlü bir seviye deneyebilir ya da sonucu silebilirsiniz.</div>' : ''}
      ${yedek ? `<div class="soluk">Yedek: ${kacis(yedek)}</div>` : ''}
      <div class="arac-satir" style="margin-top:4px">
        <button class="ikincil kucult-ac">Yeni sekmede aç</button>
        <button class="ikincil kucult-goster">Klasörde göster</button>
        ${buyuk && !this.uzerineYaz ? '<button class="ikincil kucult-sil">Sonucu sil</button>' : ''}
      </div>`;
    this.ilerleme.gizle();
    const ac = async () => {
      if (this.uzerineYaz) {
        // Sekme eski veriyi tutuyor: kapatıp yeniden aç (proje sahibi belgeKapat sağlarsa)
        if (typeof baglam.belgeKapat === 'function') { await baglam.belgeKapat(belge.id, { zorla: true }); }
        else { baglam.bildir('Dosya güncellendi; sekmeyi kapatıp yeniden açın.', 5000); this.pencere.kapat('tamam'); return; }
      }
      await this.pencere.kapat('tamam');
      await baglam.dosyaAc(yol, { arkaPlanda: false });
    };
    this.sonucEl.querySelector('.kucult-ac').addEventListener('click', ac);
    this.sonucEl.querySelector('.kucult-goster').addEventListener('click', () => baglam.pdefe.cagir('kabuk:klasordeGoster', yol));
    this.sonucEl.querySelector('.kucult-sil')?.addEventListener('click', async () => {
      await baglam.pdefe.cagir('dosya:sil', yol);
      baglam.bildir('Sonuç dosyası çöp kutusuna gönderildi.');
      this.sonucEl.hidden = true;
    });
    if (!buyuk) {
      // Başarılı sonuçta doğrudan yeni sekmede aç
      await ac();
    }
  }
}

export function kucultAc(baglam) {
  const belge = baglam.aktif();
  if (!belge) { baglam.bildir('Önce bir PDF açın.'); return null; }
  if (pencereAcikMi('kucult')) return null;
  return new KucultPenceresi(baglam, belge);
}
