// Döndür ve kaydet: Tüm sayfalar / Geçerli sayfa / Sayfa aralığı × 90° saat yönü / 90° tersi / 180°; standart kaydetme seçimi
// ("Yeni belge olarak kaydet" | "Üzerine yaz", ortak.js kayitSecimi; varsayılan her araçta "Yeni belge olarak kaydet").
//  - Üzerine yaz: tarif üretir → baglam.sayfaTarifiUygula(belge, tarif, 'Sayfaları döndür') → baglam.kaydet(belge) (Ctrl+S ile aynı
//    kayıt yolu: yalnızca döndürme değiştiyse artımlı yazılır, e-imzalı baytlar korunur; yedek alınmaz). Döndürme geri alma yığınına
//    girer (Ctrl+Z ile geri alınıp yeniden kaydedilebilir); sekme yeniden açılmaz, geri alma geçmişi ve sekme sırası korunur. Dosya
//    başka programda kilitliyse ya da salt okunursa önceden sorulur, sekmeye dokunulmaz. Sekmede kaydedilmemiş başka değişiklik
//    varsa (kayıt onları da dosyaya yazacağından) Yeni belge ve PDF küçült'teki gibi önce sorulur.
//  - Yeni belge: çekirdek dondur_kaydet {yol, hedef, sayfalar, derece} özgün dosyanın hedef klasördeki geçici kopyasına artımlı yazar
//    (e-imzalı baytlar, ekler, belge bilgileri korunur), sonra atomik olarak hedefe koyar; özgün dosya ve sekme değişmez.
import {
  pencereAc, pencereAcikMi, IslemIlerleme, sayfaListesiCoz, belgeTarifi, tarifDisari, hataMetni, oge, dosyaAdi, sayiMetni,
  degisiklikleriSor, kayitSecimi, kilitliHataMi, ciktiyiAc, numaralarDosyaylaAyni, NUMARA_UYUSMAZ,
} from './ortak.js';

export class DondurPenceresi {
  constructor(baglam, belge) {
    this.baglam = baglam;
    this.belge = belge;
    this.kapsam = 'tum';
    this.derece = 90;
    this.ilerleme = new IslemIlerleme({ iptalEdilebilir: false });
    this._kur();
  }

  _kur() {
    const g = this.belge.gorunum;
    const toplam = g?.sayfaSayisi || 0;
    const gecerli = g?.gecerli || 1;
    const govde = oge(`<div class="dondur-govde">
      <div class="arac-bolum">
        <div class="arac-bolum-baslik">Hangi sayfalar?</div>
        <div class="arac-secenek-liste">
          <label><input type="radio" name="dondur-kapsam" value="tum" checked> Tüm sayfalar <span class="soluk">(${sayiMetni(toplam)} sayfa)</span></label>
          <label><input type="radio" name="dondur-kapsam" value="gecerli"> Geçerli sayfa <span class="soluk">(${gecerli}. sayfa)</span></label>
          <label><input type="radio" name="dondur-kapsam" value="aralik"> Sayfa aralığı</label>
          <div class="ic"><input type="text" class="arac-girdi dondur-aralik" placeholder="örn. 1-3, 5, 8-10" spellcheck="false" aria-label="Sayfa aralığı"><span class="arac-aciklama dondur-aralik-hata"></span></div>
        </div>
      </div>
      <div class="arac-bolum">
        <div class="arac-bolum-baslik">Yön</div>
        <div class="dondur-yonler" role="radiogroup" aria-label="Yön">
          <label class="dondur-yon secili" data-derece="90"><input type="radio" name="dondur-yon" value="90" checked><svg viewBox="0 0 20 20"><path d="M6.9 15.8A6.2 6.2 0 1 1 14.9 13.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M17.2 15.5 12.6 12.3 13.2 16.4z" fill="currentColor"/></svg><span class="ad">90° saat yönü</span></label>
          <label class="dondur-yon" data-derece="270"><input type="radio" name="dondur-yon" value="270"><svg viewBox="0 0 20 20"><path d="M13.1 15.8A6.2 6.2 0 1 0 5.1 13.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2.8 15.5 7.4 12.3 6.8 16.4z" fill="currentColor"/></svg><span class="ad">90° saat yönü tersi</span></label>
          <label class="dondur-yon" data-derece="180"><input type="radio" name="dondur-yon" value="180"><svg viewBox="0 0 20 20"><path d="M3 11.9A6 6 0 0 1 15 11.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12.2 11.9h5.6L15 15.1z" fill="currentColor"/></svg><span class="ad">180°</span></label>
        </div>
      </div>
      <div class="arac-bolum dondur-kayit"><div class="arac-bolum-baslik">Kaydet</div></div>
    </div>`);
    this.govde = govde;
    this.aralikEl = govde.querySelector('.dondur-aralik');
    this.aralikHata = govde.querySelector('.dondur-aralik-hata');
    const kapsamSec = (deger, odakla) => {
      const r = govde.querySelector(`input[name="dondur-kapsam"][value="${deger}"]`);
      if (!r.checked) r.checked = true;
      this.kapsam = deger;
      if (odakla && deger === 'aralik') { this.aralikEl.focus(); this.aralikEl.select(); }
      this.dogrula();
    };
    for (const r of govde.querySelectorAll('input[name="dondur-kapsam"]')) r.addEventListener('change', () => kapsamSec(r.value, true));
    // Aralık kutusu her zaman yazılabilir: tıklayınca ya da yazınca "Sayfa aralığı" seçilir (Tab ile üzerinden geçmek seçimi değiştirmez)
    this.aralikEl.addEventListener('pointerdown', () => { if (this.kapsam !== 'aralik') kapsamSec('aralik', false); });
    this.aralikEl.addEventListener('input', () => { if (this.kapsam !== 'aralik') kapsamSec('aralik', false); else this.dogrula(); });
    this.aralikEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.uygula(); } });
    for (const y of govde.querySelectorAll('.dondur-yon')) {
      y.querySelector('input').addEventListener('change', () => {
        this.derece = +y.dataset.derece;
        for (const o of govde.querySelectorAll('.dondur-yon')) o.classList.toggle('secili', o === y);
      });
    }
    // Üzerine yaz: döndürme sekmeye geri alınabilir komut olarak uygulanıp kaydedilir (Ctrl+Z)
    this.kayit = kayitSecimi({ baglam: this.baglam, belge: this.belge, ad: 'Döndürülmüş', diyalogBasligi: 'Döndürülmüş PDF', geriAlinabilir: true });
    govde.querySelector('.dondur-kayit').append(this.kayit.el);
    this.pencere = pencereAc({
      baslik: 'Döndür ve kaydet', govde, genislik: 540, anahtar: 'dondur', sinif: 'dondur-pencere',
      dugmeler: [{ id: 'uygula', etiket: 'Döndür ve kaydet', birincil: true, tiklama: () => this.uygula() }],
      kapatmadanOnce: () => !this.ilerleme.calisiyor,
    });
    this.pencere.govde.append(this.ilerleme.el);
    // Ok tuşları radyo grubunda gezinsin
    govde.addEventListener('keydown', (e) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && e.target.type === 'radio') e.stopPropagation(); });
  }

  secilenSayfalar() {
    const g = this.belge.gorunum;
    const toplam = g?.sayfaSayisi || 0;
    if (this.kapsam === 'tum') { const s = []; for (let i = 1; i <= toplam; i++) s.push(i); return { sayfalar: s, hata: null }; }
    if (this.kapsam === 'gecerli') return { sayfalar: [g?.gecerli || 1], hata: null };
    return sayfaListesiCoz(this.aralikEl.value, toplam);
  }

  dogrula() {
    const { sayfalar, hata } = this.secilenSayfalar();
    this.aralikHata.textContent = this.kapsam === 'aralik' ? (hata || `${sayfalar.length} sayfa`) : '';
    this.aralikHata.classList.toggle('hata-metin', this.kapsam === 'aralik' && !!hata);
    this.aralikEl.classList.toggle('hatali', this.kapsam === 'aralik' && !!hata);
    this.pencere?.dugmeAyarla('uygula', { devre: !!hata || !sayfalar.length });
    return !hata && sayfalar.length > 0;
  }

  async uygula() {
    if (this.ilerleme.calisiyor || this._suruyor) return;
    this._suruyor = true;
    try {
      while (!this.pencere.kapali && await this._uygulaBir());
    } finally { this._suruyor = false; }
  }

  /** Bir deneme; kilitli / salt okunur dosya sorusunda yeniden denenecekse true döner. */
  async _uygulaBir() {
    const { baglam, belge } = this;
    if (!this.dogrula()) return false;
    this.pencere.hataGoster('');
    // Önce kaydetme seçiminin denetimi: yazılacak dosya kilitli ya da salt okunursa sekmeye de dosyaya da dokunulmadan sorulur
    const denetim = await this.kayit.denetle();
    if (this.pencere.kapali || denetim === 'vazgec') return false;
    if (denetim instanceof Error) return this.kayit.hataSor(denetim);
    const { sayfalar, hata } = this.secilenSayfalar();
    if (hata || !sayfalar.length) { this.dogrula(); return false; }
    const yon = this.derece === 90 ? '90° saat yönünde' : this.derece === 270 ? '90° saat yönünün tersine' : '180°';
    const adet = `${sayiMetni(sayfalar.length)} sayfa`;
    if (this.kayit.uzerineMi()) return this._sekmedeUygula(sayfalar, yon, adet);

    if ((await degisiklikleriSor(baglam, belge, 'Döndürme', numaralarDosyaylaAyni(belge) ? {} : { yalnizKaydet: true, neden: NUMARA_UYUSMAZ })) === 'vazgec') return false;
    if (this.pencere.kapali) return false;
    const hedef = this.kayit.hedef();
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('uygula', { devre: true });
    let kilit = null;
    try {
      await this.ilerleme.calistir(baglam, 'dondur_kaydet', {
        yol: belge.yol, hedef, sayfalar: this.kapsam === 'tum' ? null : sayfalar, derece: this.derece,
      }, { baslangicMesaji: 'Döndürülüyor…' });
      this.ilerleme.gizle();
      await this.pencere.kapat('tamam');
      // Var olan (bir sekmede açık) dosyanın üzerine yazıldıysa o sekme yeni haliyle yeniden açılır, yoksa yeni sekmede açılır
      await ciktiyiAc(baglam, hedef, { cikti: this.kayit.cikti, soruAyrintisi: 'Belge diskteki yeni haliyle yeniden açılırsa bu değişiklikler atılır.' });
      baglam.bildir(`${adet} ${yon} döndürüldü: ${dosyaAdi(hedef)}`, 4000);
    } catch (e) {
      this.ilerleme.gizle();
      if (kilitliHataMi(e)) kilit = e;
      else this.pencere.hataGoster('Döndürme başarısız: ' + hataMetni(e));
    } finally {
      if (!this.pencere.kapali) {
        this.pencere.el.classList.remove('mesgul');
        this.dogrula();
      }
    }
    // Soru yazılamayan dosyayı (özgün dosya okunamadı ya da yeni belge hedefi kilitli) adıyla söyler
    return kilit && !this.pencere.kapali ? this.kayit.hataSor(kilit) : false;
  }

  /**
   * Üzerine yaz: döndürme sekmedeki belgeye geri alınabilir komut olarak uygulanır ve belge kaydedilir (Ctrl+S ile aynı yol).
   * Sekmede kaydedilmemiş başka değişiklik (ör. sayfa silme/sıralama) varsa Yeni belge ve PDF küçült'teki gibi önce sorulur
   * (ortak degisiklikleriSor: Kaydet ve devam et | Vazgeç); sormadan dosyaya yazılmaz. Kayıt başarısız olursa belgeKaydet kendi
   * sorusunu gösterir; döndürme sekmede kalır.
   */
  async _sekmedeUygula(sayfalar, yon, adet) {
    const { baglam, belge } = this;
    if (belge.kaydediliyor) { baglam.bildir('Kaydediliyor, lütfen bekleyin.'); return false; }
    if (!belge.gorunum?.sayfaSayisi || (belge.el && !belge.el.isConnected)) { this.pencere.hataGoster('Belge açık değil ya da henüz yüklenmedi.'); return false; }
    if ((await degisiklikleriSor(baglam, belge, 'Döndürme', {
      yalnizKaydet: true,
      aciklama: 'Üzerine yazarken döndürme belgeye uygulanır ve belge kaydedilir; bu değişiklikler de dosyaya yazılır.',
    })) === 'vazgec') return false;
    if (this.pencere.kapali) return false;
    // "Kaydet ve devam et" belgeyi yeniden yüklemiş olabilir: sayfa sayısı ve seçim yeniden denetlenir
    if (!belge.gorunum?.sayfaSayisi || (belge.el && !belge.el.isConnected)) { this.pencere.hataGoster('Belge açık değil ya da henüz yüklenmedi.'); return false; }
    if (!this.dogrula()) return false;
    ({ sayfalar } = this.secilenSayfalar());
    adet = `${sayiMetni(sayfalar.length)} sayfa`;
    const secili = new Set(sayfalar);
    // Tarif: yalnızca seçilen sayfaların ek döndürmesine (dosyadaki /Rotate'e ek) derece eklenir; diğerleri olduğu gibi kalır
    // (sekmede uygulanmış ama kaydedilmemiş bir döndürme varsa o korunur).
    const tarif = tarifDisari(belgeTarifi(belge).map((t, i) => (secili.has(i + 1)
      ? { ...t, dondurme: (((t.dondurme || 0) + this.derece) % 360 + 360) % 360 }
      : t)));
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('uygula', { devre: true });
    try {
      if (typeof baglam.sayfaTarifiUygula !== 'function') throw new Error('Sayfa düzeni komutu (sayfaTarifiUygula) bağlanmamış.');
      await baglam.sayfaTarifiUygula(belge, tarif, this.kapsam === 'tum' ? 'Tüm sayfaları döndür' : sayfalar.length === 1 ? 'Sayfayı döndür' : 'Sayfaları döndür');
    } catch (e) {
      this.pencere.hataGoster('Döndürme başarısız: ' + hataMetni(e));
      return false;
    } finally {
      if (!this.pencere.kapali) {
        this.pencere.el.classList.remove('mesgul');
        this.dogrula();
      }
    }
    await this.pencere.kapat('tamam');
    const kaydedildi = await baglam.kaydet(belge);
    baglam.bildir(kaydedildi ? `${adet} ${yon} döndürüldü ve kaydedildi.` : `${adet} ${yon} döndürüldü; kaydedilmedi.`, kaydedildi ? 3500 : 6000);
    return false;
  }
}

export function dondurAc(baglam) {
  const belge = baglam.aktif();
  if (!belge) { baglam.bildir('Önce bir PDF açın.'); return null; }
  if (pencereAcikMi('dondur')) return null;
  return new DondurPenceresi(baglam, belge);
}
