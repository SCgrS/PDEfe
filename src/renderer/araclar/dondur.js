// Döndür ve kaydet: Tüm sayfalar / Geçerli sayfa / Sayfa aralığı × 90° saat yönü / 90° tersi / 180°; standart kaydetme seçimi
// ("Yeni belge olarak kaydet" | "Üzerine yaz", ortak.js kayitSecimi).
// Çekirdek dondur_kaydet {yol, hedef, sayfalar, derece}: özgün dosyanın hedef klasördeki geçici kopyasına artımlı yazar (e-imzalı
// baytlar, ekler, belge bilgileri korunur), sonra atomik olarak hedefe koyar; yedek alınmaz. Dosya kilitliyse özgün dosya
// değişmez. Üzerine yazılınca açık sekme aynı sayfada yeniden açılır (kaydedilmemiş değişiklik varsa önce sorulur).
import {
  pencereAc, pencereAcikMi, IslemIlerleme, sayfaListesiCoz, belgeTarifi, anaKaynakMi, hataMetni, oge, dosyaAdi, yolAyni, sayiMetni,
  degisiklikleriSor, kayitSecimi, varOlanaYazmaSor, uzerineYazmaHatasi, yazilabilirMi, kilitliHataMi, sekmeyiYenile,
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
          <label class="dondur-yon secili" data-derece="90"><input type="radio" name="dondur-yon" value="90" checked><svg viewBox="0 0 24 24"><path d="M18 11A6.5 6.5 0 1 0 16.6 16" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M18 5v6h-6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span class="ad">90° saat yönü</span></label>
          <label class="dondur-yon" data-derece="270"><input type="radio" name="dondur-yon" value="270"><svg viewBox="0 0 24 24"><path d="M6 11A6.5 6.5 0 1 1 7.4 16" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 5v6h6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span class="ad">90° saat yönü tersi</span></label>
          <label class="dondur-yon" data-derece="180"><input type="radio" name="dondur-yon" value="180"><svg viewBox="0 0 24 24"><path d="M5 9a7 7 0 0 1 14 0M19 15a7 7 0 0 1-14 0" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 9h4V5M9 15H5v4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span class="ad">180°</span></label>
        </div>
      </div>
      <div class="arac-bolum dondur-kayit"><div class="arac-bolum-baslik">Kaydetme</div></div>
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
    // Döndürme eskiden sekmedeki belgeye uygulanıp kaydediliyordu: varsayılan "Üzerine yaz"
    this.kayit = kayitSecimi({ baglam: this.baglam, belge: this.belge, ek: 'döndürülmüş', kip: 'uzerine', diyalogBasligi: 'Döndürülmüş PDF' });
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

  /** Sekmedeki sayfa numaraları dosyadakilerle aynı mı (kaydedilmemiş sayfa silme/sıralama/ekleme yok)? */
  _numaralarDosyaylaAyni() {
    const g = this.belge.gorunum;
    if (!this.belge.degisti || typeof g?.yapisalKirli !== 'function' || !g.yapisalKirli()) return true;
    const tarif = belgeTarifi(this.belge);
    return !g.anlik && tarif.every((t, i) => t.kaynak && anaKaynakMi(this.belge, t.kaynak) && t.sayfa === i + 1)
      && (this.belge.bilgi?.sayfa == null || tarif.length === this.belge.bilgi.sayfa);
  }

  async uygula() {
    if (this.ilerleme.calisiyor || this._suruyor) return;
    this._suruyor = true;
    try {
      while (!this.pencere.kapali && await this._uygulaBir());
    } finally { this._suruyor = false; }
  }

  /** Bir deneme; kilitli dosya sorusunda yeniden denenecekse true döner. */
  async _uygulaBir() {
    const { baglam, belge } = this;
    if (!this.dogrula()) return false;
    this.pencere.hataGoster('');
    const numaralarAyni = this._numaralarDosyaylaAyni();
    if ((await degisiklikleriSor(baglam, belge, 'Döndürme', numaralarAyni ? {} : { yalnizKaydet: true, neden: 'Sayfa düzeninde kaydedilmemiş değişiklik olduğundan sayfa numaraları dosyadakiyle uyuşmuyor.' })) === 'vazgec') return false;
    if (this.pencere.kapali) return false;
    const { sayfalar, hata } = this.secilenSayfalar();
    if (hata || !sayfalar.length) { this.dogrula(); return false; }

    await this.kayit.hazir;
    const hedef = this.kayit.hedef();
    const uzerine = this.kayit.kip() === 'uzerine' || yolAyni(hedef, belge.yol);
    if (uzerine) {
      const erisim = await yazilabilirMi(baglam, belge.yol);
      if (!erisim.okunur || !erisim.yazilir) return this._kilitSorusu(new Error(erisim.okunur ? 'yazılamadı' : 'okunamadı'));
    } else {
      if (!this.kayit.cikti.ad()) { baglam.bildir('Dosya adı girin.'); this.kayit.cikti.odakla(); return false; }
      if (!(await varOlanaYazmaSor(baglam, this.kayit.cikti, hedef))) return false;
    }
    if (this.pencere.kapali) return false;

    const yon = this.derece === 90 ? '90° saat yönünde' : this.derece === 270 ? '90° saat yönünün tersine' : '180°';
    const adet = `${sayiMetni(sayfalar.length)} sayfa`;
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('uygula', { devre: true });
    let kilit = null;
    try {
      await this.ilerleme.calistir(baglam, 'dondur_kaydet', {
        yol: belge.yol, hedef, sayfalar: this.kapsam === 'tum' ? null : sayfalar, derece: this.derece,
      }, { baslangicMesaji: 'Döndürülüyor…' });
      this.ilerleme.gizle();
      await this.pencere.kapat('tamam');
      if (uzerine) {
        const r = await sekmeyiYenile(baglam, belge, { soruAyrintisi: 'Belge diskteki döndürülmüş haliyle yeniden açılırsa bu değişiklikler atılır.' }).catch(() => false);
        baglam.bildir(r ? `${adet} ${yon} döndürüldü ve kaydedildi.` : `${adet} ${yon} döndürüldü ve kaydedildi. Açık sekme dosyanın önceki halini gösteriyor; güncel hali için sekmeyi kapatıp yeniden açın.`, r ? 3500 : 8000);
      } else {
        await baglam.dosyaAc(hedef, { arkaPlanda: false });
        baglam.bildir(`${adet} ${yon} döndürüldü: ${dosyaAdi(hedef)}`, 4000);
      }
    } catch (e) {
      this.ilerleme.gizle();
      if (kilitliHataMi(e)) kilit = e;
      else this.pencere.hataGoster('Döndürme başarısız: ' + hataMetni(e) + (uzerine ? '\nÖzgün dosya değiştirilmedi.' : ''));
    } finally {
      if (!this.pencere.kapali) {
        this.pencere.el.classList.remove('mesgul');
        this.dogrula();
      }
    }
    return kilit && !this.pencere.kapali ? this._kilitSorusu(kilit) : false;
  }

  async _kilitSorusu(e) {
    const secim = await uzerineYazmaHatasi(this.baglam, this.belge, e);
    if (this.pencere.kapali || secim === 'vazgec') return false;
    if (secim === 'yeni') { this.kayit.kipAyarla('yeni'); await this.kayit.adYenile(); }
    return true;
  }
}

export function dondurAc(baglam) {
  const belge = baglam.aktif();
  if (!belge) { baglam.bildir('Önce bir PDF açın.'); return null; }
  if (pencereAcikMi('dondur')) return null;
  return new DondurPenceresi(baglam, belge);
}
