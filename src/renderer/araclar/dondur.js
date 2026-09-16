// Döndür ve kaydet: Tüm sayfalar / Geçerli sayfa / Sayfa aralığı × 90° saat yönü / 90° tersi / 180°.
// Tarif üretir → baglam.sayfaTarifiUygula(belge, tarif, 'Sayfaları döndür') → baglam.kaydet(belge).
import { pencereAc, pencereAcikMi, sayfaListesiCoz, belgeTarifi, tarifDisari, hataMetni, oge } from './ortak.js';

export class DondurPenceresi {
  constructor(baglam, belge) {
    this.baglam = baglam;
    this.belge = belge;
    this.kapsam = 'tum';
    this.derece = 90;
    this._kur();
  }

  _kur() {
    const g = this.belge.gorunum;
    const toplam = g?.sayfaSayisi || 0;
    const gecerli = g?.gecerli || 1;
    const govde = oge(`<div class="dondur-govde">
      <div class="arac-alan">
        <span class="arac-etiket" style="margin:0">Hangi sayfalar?</span>
        <div class="arac-secenek-liste">
          <label><input type="radio" name="dondur-kapsam" value="tum" checked> Tüm sayfalar <span class="soluk">(${toplam})</span></label>
          <label><input type="radio" name="dondur-kapsam" value="gecerli"> Geçerli sayfa <span class="soluk">(${gecerli})</span></label>
          <label><input type="radio" name="dondur-kapsam" value="aralik"> Sayfa aralığı</label>
          <div class="ic"><input type="text" class="arac-girdi dondur-aralik" placeholder="örn. 1-3, 5, 8-10" style="width:220px" disabled><span class="arac-aciklama dondur-aralik-hata"></span></div>
        </div>
      </div>
      <div class="arac-alan">
        <span class="arac-etiket" style="margin:0">Yön</span>
        <div class="dondur-yonler" role="radiogroup">
          <label class="dondur-yon secili" data-derece="90"><input type="radio" name="dondur-yon" value="90" checked><svg viewBox="0 0 24 24"><path d="M18 11A6.5 6.5 0 1 0 16.6 16" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M18 5v6h-6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span class="ad">90° saat yönü</span></label>
          <label class="dondur-yon" data-derece="270"><input type="radio" name="dondur-yon" value="270"><svg viewBox="0 0 24 24"><path d="M6 11A6.5 6.5 0 1 1 7.4 16" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 5v6h6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span class="ad">90° saat yönü tersi</span></label>
          <label class="dondur-yon" data-derece="180"><input type="radio" name="dondur-yon" value="180"><svg viewBox="0 0 24 24"><path d="M5 9a7 7 0 0 1 14 0M19 15a7 7 0 0 1-14 0" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 9h4V5M9 15H5v4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span class="ad">180°</span></label>
        </div>
      </div>
      <div class="arac-aciklama">Döndürme dosyaya yazılır (kalıcı). Görünümü geçici olarak döndürmek için araç çubuğundaki döndür düğmesini kullanın.</div>
    </div>`);
    this.govde = govde;
    this.aralikEl = govde.querySelector('.dondur-aralik');
    this.aralikHata = govde.querySelector('.dondur-aralik-hata');
    for (const r of govde.querySelectorAll('input[name="dondur-kapsam"]')) {
      r.addEventListener('change', () => {
        this.kapsam = r.value;
        this.aralikEl.disabled = this.kapsam !== 'aralik';
        if (this.kapsam === 'aralik') { this.aralikEl.focus(); this.aralikEl.select(); }
        this.dogrula();
      });
    }
    this.aralikEl.addEventListener('input', () => this.dogrula());
    this.aralikEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.uygula(); } });
    for (const y of govde.querySelectorAll('.dondur-yon')) {
      y.querySelector('input').addEventListener('change', () => {
        this.derece = +y.dataset.derece;
        for (const o of govde.querySelectorAll('.dondur-yon')) o.classList.toggle('secili', o === y);
      });
    }
    this.pencere = pencereAc({
      baslik: 'Döndür ve kaydet', govde, genislik: 440, anahtar: 'dondur', sinif: 'dondur-pencere',
      dugmeler: [
        { id: 'uygula', etiket: 'Döndür ve kaydet', birincil: true, tiklama: () => this.uygula() },
        { id: 'iptal', etiket: 'Vazgeç' },
      ],
    });
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
    this.aralikEl.classList.toggle('hatali', this.kapsam === 'aralik' && !!hata);
    this.pencere.dugmeAyarla('uygula', { devre: !!hata || !sayfalar.length });
    return !hata && sayfalar.length > 0;
  }

  async uygula() {
    const { baglam, belge } = this;
    if (!this.dogrula()) return;
    const { sayfalar } = this.secilenSayfalar();
    const secili = new Set(sayfalar);
    // Tarif: yalnızca seçilen sayfaların ek döndürmesine (dosyadaki /Rotate'e ek) derece eklenir; diğerleri olduğu gibi kalır
    // (sekmede uygulanmış ama kaydedilmemiş bir döndürme varsa o korunur).
    const tarif = tarifDisari(belgeTarifi(belge).map((t, i) => (secili.has(i + 1)
      ? { ...t, dondurme: (((t.dondurme || 0) + this.derece) % 360 + 360) % 360 }
      : t)));
    this.pencere.dugmeAyarla('uygula', { devre: true, etiket: 'Döndürülüyor…' });
    this.pencere.hataGoster('');
    try {
      if (typeof baglam.sayfaTarifiUygula !== 'function') throw new Error('Sayfa düzeni komutu (sayfaTarifiUygula) henüz bağlanmamış.');
      await baglam.sayfaTarifiUygula(belge, tarif, 'Sayfaları döndür');
      const kaydedildi = await baglam.kaydet(belge);
      await this.pencere.kapat('tamam');
      const yon = this.derece === 90 ? '90° saat yönünde' : this.derece === 270 ? '90° saat yönünün tersine' : '180°';
      baglam.bildir(kaydedildi ? `${sayfalar.length} sayfa ${yon} döndürüldü ve kaydedildi.` : `${sayfalar.length} sayfa döndürüldü; kaydedilmedi.`);
    } catch (e) {
      this.pencere.dugmeAyarla('uygula', { devre: false, etiket: 'Döndür ve kaydet' });
      this.pencere.hataGoster('Döndürme başarısız: ' + hataMetni(e));
    }
  }
}

export function dondurAc(baglam) {
  const belge = baglam.aktif();
  if (!belge) { baglam.bildir('Önce bir PDF açın.'); return null; }
  if (pencereAcikMi('dondur')) return null;
  return new DondurPenceresi(baglam, belge);
}
