// PDF küçült: mevcut boyut, üç hazır seviye (aşırı / ideal / düşük), tahminler, standart kaydetme seçimi, ilerleme, sonuç.
// Çekirdek: kucult_tahmin {yol, seviyeler} ve kucult {yol, hedef, seviye, dpi, kalite, kuculmezseYazma} (ilerlemeli).
// "Üzerine yaz": yedek alınmaz. Çekirdek sonucu özgün dosyanın klasöründe geçici dosyaya yazıp atomik olarak yerine koyar;
// sonuç özgünden küçük değilse özgün dosyaya dokunmaz (yedek olmadığından büyüyen sonuç geri alınamazdı). Dosya başka
// programda kilitliyse ya da salt okunursa özgün dosya değişmez ve "Yeni belge olarak kaydet" önerilir (ortak.js kayitSecimi.hataSor).
import {
  pencereAc, pencereAcikMi, IslemIlerleme, boyutMetni, farkMetni, kacis, hataMetni, dosyaAdi, dosyaBoyutu,
  degisiklikleriSor, oge, kayitSecimi, kilitliHataMi, sekmeyiYenile, ciktiyiAc,
} from './ortak.js';

/** Hazır seviyeler. dpi/kalite değerleri yalnızca bilgi amaçlıdır ve arayüzde gösterilmez (kartlarda ad, sade açıklama ve
 *  tahmini boyut; Görüntü / PDF birleştir'deki gibi teknik ayrıntı yok); çekirdek (core/islemler/araclar.py SEVIYELER)
 *  adlandırılmış seviyelerde kendi değerlerini kullanır, bu tablo onunla aynı tutulur. Kimlikler çekirdekle ortaktır. */
export const SEVIYELER = {
  asiri: { ad: 'Aşırı sıkıştırma', aciklama: 'En küçük dosya; görseller belirgin biçimde bulanıklaşır. E-posta ve arşiv için.', dpi: 96, kalite: 45 },
  onerilen: { ad: 'İdeal sıkıştırma', aciklama: 'İyi kalite, iyi sıkıştırma. Ekranda okuma ve paylaşım için uygundur.', dpi: 150, kalite: 72 },
  dusuk: { ad: 'Düşük sıkıştırma', aciklama: 'Yüksek kalite; yalnızca gereksiz veriler atılır, görseller hafifçe sıkıştırılır.', dpi: 220, kalite: 88 },
};

export class KucultPenceresi {
  constructor(baglam, belge) {
    this.baglam = baglam;
    this.belge = belge;
    this.mevcutBoyut = belge.boyut;   // diskteki güncel boyut: üzerine yazmadan sonra sonuçla güncellenir (kıyas ve tahminler buna göre)
    this.seviye = 'onerilen';
    this.tahminler = {};
    this.ornekleme = false;          // çekirdek büyük belgede ilk sayfaları örnekleyerek tahmin etti
    this.tahminlerEski = false;      // üzerine yazmadan sonra tahminler eski boyuta göre; seviye seçilince yeniden hesaplanır
    this.sekmeBayat = false;         // üzerine yazıldı, açık sekme dosyanın önceki halini (eski xref'leri) tutuyor: pencere kapanınca yenilenir
    this.ilerleme = new IslemIlerleme();
    this._kur();
  }

  _kur() {
    const b = this.belge;
    const govde = oge(`<div class="kucult-govde">
      <div class="kucult-boyut"><div class="deger sayi">${boyutMetni(b.boyut)}</div><div class="etiket">${kacis(b.ad)} · ${b.gorunum?.sayfaSayisi || '?'} sayfa · mevcut boyut</div></div>
      <div class="arac-bolum">
        <div class="arac-bolum-baslik">Sıkıştırma</div>
        <div class="kucult-kartlar" role="radiogroup" aria-label="Sıkıştırma"></div>
        <div class="arac-aciklama kucult-not" hidden></div>
      </div>
      <div class="arac-bolum kucult-kayit"><div class="arac-bolum-baslik">Kaydet</div></div>
      <div class="kucult-sonuc" hidden></div>
    </div>`);
    this.govde = govde;
    this.boyutEl = govde.querySelector('.kucult-boyut .deger');
    this.kartlar = govde.querySelector('.kucult-kartlar');
    for (const [id, s] of Object.entries(SEVIYELER)) this.kartlar.append(this._kart(id, s.ad, s.aciklama));
    this.notEl = govde.querySelector('.kucult-not');
    this.kayit = kayitSecimi({ baglam: this.baglam, belge: b, ek: 'küçültülmüş', kip: 'yeni', diyalogBasligi: 'Küçültülmüş PDF' });
    govde.querySelector('.kucult-kayit').append(this.kayit.el);
    this.sonucEl = govde.querySelector('.kucult-sonuc');

    this.pencere = pencereAc({
      baslik: 'PDF küçült', govde, genislik: 700, anahtar: 'kucult', sinif: 'kucult-pencere',
      dugmeler: [{ id: 'kucult', etiket: 'Küçült', birincil: true, tiklama: () => this.kucult() }],
      kapatmadanOnce: () => this._kapatmaIzni(),
    });
    this.pencere.govde.append(this.ilerleme.el);   // gövdenin doğrudan çocuğu: meşgulken soluklaşmaz, İptal tıklanabilir
    this.pencere.el.addEventListener('esc', (e) => { if (this.ilerleme.calisiyor) { e.preventDefault(); this.ilerleme.iptalIste(); } });
    // Bayat sekme (sonraki kayıt eski xref'lerle hata verir ya da başka notu değiştirir) pencere nasıl kapanırsa kapansın (X, Esc)
    // diskteki haliyle yeniden açılır; 'kapandi' kapatmadanOnce izin verdikten sonra gelir. İş detail.bekle ile bildirilir: uygulama
    // kapanırken (aracPencereleriniKapat) bitmesi beklenir
    this.pencere.el.addEventListener('kapandi', (e) => {
      if (!this.sekmeBayat) return;
      e.detail?.bekle?.((async () => {
        const sonuc = await sekmeyiYenile(this.baglam, this.belge, { soruAyrintisi: 'Belge diskteki küçültülmüş haliyle yeniden açılırsa bu değişiklikler atılır.' }).catch(() => false);
        if (sonuc) this.sekmeBayat = false;
        else this.baglam.bildir('Açık sekme dosyanın küçültülmeden önceki halini gösteriyor; notlarda değişiklik yapmadan önce sekmeyi kapatıp yeniden açın.', 8000);
      })());
    });
    this.seviyeSec('onerilen');
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
    k.addEventListener('click', () => this._tahminleriTazele());
    return k;
  }

  seviyeSec(id) {
    if (!SEVIYELER[id]) id = 'onerilen';
    this.seviye = id;
    for (const k of this.kartlar.querySelectorAll('.kucult-kart')) {
      const secili = k.dataset.seviye === id;
      k.classList.toggle('secili', secili);
      k.querySelector('input[type=radio]').checked = secili;
    }
  }

  /** Üzerine yazmadan sonra kullanıcı yeniden seviye seçerse tahminleri yeni boyuta göre bir kez hesaplar. */
  _tahminleriTazele() {
    if (!this.tahminlerEski || this.ilerleme.calisiyor || this.pencere.kapali) return;
    this.tahminlerEski = false;
    this.notEl.hidden = true;
    for (const id of Object.keys(SEVIYELER)) this._tahminYaz(id, null);
    this.tahminleriAl();
  }

  /** Kart altındaki tahmin metni. boyut null + mesaj: bekleme; hata: kırmızı. */
  _tahminYaz(id, boyut, mesaj, hata) {
    const el = this.kartlar.querySelector(`.kucult-kart[data-seviye="${id}"] .tahmin`);
    if (!el) return;
    el.classList.remove('bekliyor', 'hata');
    if (hata) { el.classList.add('hata'); el.textContent = hata; return; }
    if (boyut == null) { el.classList.add('bekliyor'); el.textContent = mesaj || 'hesaplanıyor…'; return; }
    el.innerHTML = `<b>${kacis(boyutMetni(boyut))}</b> · ${kacis(farkMetni(this.mevcutBoyut, boyut))}${this.ornekleme ? ' <span class="soluk" title="Büyük belge: ilk sayfalar örneklenerek tahmin edildi">≈</span>' : ''}`;
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
      // Adlandırılmış seviyeler için çekirdek kendi dpi/kalite tablosunu kullanır (seviyeler:{ad:true}); yanıttaki dpi/kalite gösterilmez
      const sonuc = await this.baglam.cekirdek('kucult_tahmin', { yol: this.belge.yol, seviyeler: Object.fromEntries(Object.keys(SEVIYELER).map((k) => [k, true])) });
      if (this.pencere.kapali) return;
      this.ornekleme = sonuc?.tahmin === true;
      let eksik = 0;
      for (const id of Object.keys(SEVIYELER)) {
        const b = KucultPenceresi.tahminOku(sonuc, id);
        this.tahminler[id] = b;
        if (b == null) { eksik++; this._tahminYaz(id, null, null, 'tahmin alınamadı'); }
        else this._tahminYaz(id, b);
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

  secilenParametreler() {
    const s = SEVIYELER[this.seviye] || SEVIYELER.onerilen;
    return { seviye: SEVIYELER[this.seviye] ? this.seviye : 'onerilen', dpi: s.dpi, kalite: s.kalite };
  }

  /** Küçültür; kilitli dosya sorusunda "Yeniden dene" ya da "Yeni belge olarak kaydet" seçilirse yeniden çalışır. */
  async kucult() {
    if (this.ilerleme.calisiyor || this._suruyor) return;
    this._suruyor = true;
    try {
      while (!this.pencere.kapali && await this._kucultBir());
    } finally { this._suruyor = false; }
  }

  /** Bir küçültme denemesi. Yeniden denenecekse true döner. */
  async _kucultBir() {
    const { baglam, belge } = this;
    this.pencere.hataGoster('');
    this.sonucEl.hidden = true;
    // Bayat sekmenin değişiklikleri kaydettirilmez: eski xref'lerle küçültülmüş dosyaya yazılırdı (pencere kapanınca atılıp atılmayacağı sorulur)
    if (!this.sekmeBayat && (await degisiklikleriSor(baglam, belge, 'Küçültme')) === 'vazgec') return false;
    if (this.pencere.kapali) return false;

    // Uzun işlemden önce: ad, var olan dosya sorusu; yazılacak dosya başka programda kilitliyse ya da salt okunursa şimdi söyle
    const denetim = await this.kayit.denetle();
    if (this.pencere.kapali || denetim === 'vazgec') return false;
    if (denetim instanceof Error) return this.kayit.hataSor(denetim);
    const hedef = this.kayit.hedef();
    const uzerine = this.kayit.uzerineMi();   // Değiştir ile özgün dosyanın kendisi seçildiyse de üzerine yazmadır

    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('kucult', { devre: true });
    let hedefOnce = null;
    let yeniden = false;
    try {
      // Hedefin işlem öncesi durumu: iptal geç ulaşırsa dosyanın yazılıp yazılmadığı buna bakılarak anlaşılır
      hedefOnce = await baglam.pdefe.cagir('dosya:bilgi', hedef).catch(() => null);
      const p = this.secilenParametreler();
      // Sonuç: {boyut, oncekiBoyut, yuzde, uyari, dpi, kalite, yazilmadi}
      const sonuc = await this.ilerleme.calistir(baglam, 'kucult', { yol: belge.yol, hedef, ...p, kuculmezseYazma: uzerine }, { baslangicMesaji: 'Küçültülüyor…' });
      await this.sonucGoster(hedef, sonuc?.boyut ?? await dosyaBoyutu(baglam.pdefe, hedef), uzerine, !!sonuc?.yazilmadi);
    } catch (e) {
      this.ilerleme.gizle();
      // Çekirdek kaydettikten (os.replace) sonra iptal ya da hata fırlatmış olabilir; sonuç gelmez: diske bak.
      let simdi = null;
      if (hedefOnce && !e.sonuc) simdi = await baglam.pdefe.cagir('dosya:bilgi', hedef).catch(() => null);
      const degismedi = !!simdi && simdi.var === hedefOnce.var && (!simdi.var || (simdi.degisim === hedefOnce.degisim && simdi.boyut === hedefOnce.boyut));
      if (e.iptal && simdi?.var && !degismedi) e.sonuc = { boyut: simdi.boyut };
      if (e.iptal && uzerine && e.sonuc && !e.sonuc.yazilmadi) {
        // İptal geç ulaştı ve dosyanın üzerine yazıldı (yedek yok, geri alınamaz): sonucu göster
        await this.sonucGoster(hedef, e.sonuc.boyut ?? await dosyaBoyutu(baglam.pdefe, hedef), uzerine, false);
      } else if (e.iptal) {
        // İş yine de bittiyse (iptal geç ulaştı) ve yeni dosya oluştuysa çöp kutusuna gönder
        if (!uzerine && e.sonuc) { try { await baglam.pdefe.cagir('dosya:sil', hedef); } catch { /* yok say */ } }
        baglam.bildir('Küçültme iptal edildi.' + (uzerine ? ' Özgün dosya değiştirilmedi.' : ''));
      } else if (kilitliHataMi(e)) {
        yeniden = true;   // soru finally'den sonra (düğmeler yeniden etkin) sorulur
        this._sonHata = e;
      } else {
        this.pencere.hataGoster('Küçültme başarısız: ' + hataMetni(e) + (uzerine ? '\nÖzgün dosya değiştirilmedi.' : ''));
      }
    } finally {
      this.pencere.el.classList.remove('mesgul');
      this.pencere.dugmeAyarla('kucult', { devre: false });
    }
    // Kilit/salt okunur sorusu yazılamayan dosyayı (özgün ya da yeni belge) adıyla söyler; seçime göre kaydetme seçimini değiştirir
    return yeniden && !this.pencere.kapali ? this.kayit.hataSor(this._sonHata) : false;
  }

  async sonucGoster(yol, yeniBoyut, uzerine, yazilmadi = false) {
    const { baglam } = this;
    const eski = this.mevcutBoyut;
    const buyuk = yazilmadi || (yeniBoyut != null && eski && yeniBoyut >= eski);
    const fark = `${kacis(boyutMetni(eski))} → <b>${kacis(boyutMetni(yeniBoyut))}</b> (${kacis(farkMetni(eski, yeniBoyut))})`;
    this.ilerleme.gizle();
    this.sonucEl.hidden = false;
    this.sonucEl.className = 'kucult-sonuc ' + (buyuk ? 'arac-uyari' : 'arac-basari');
    if (uzerine && yazilmadi) {
      // Çekirdek küçülmeyen sonucu yazmadı: özgün dosya olduğu gibi duruyor, sekme bayat değil
      this.sonucEl.innerHTML = `<div><b>Dosya küçülmedi; özgün dosya değiştirilmedi.</b></div>
        <div>Bu seviyeyle ulaşılan boyut: ${fark}. Belge zaten sıkıştırılmış olabilir ya da görsel içermiyor olabilir; daha güçlü bir seviye deneyebilirsiniz.</div>`;
      return;
    }
    if (uzerine) {
      this.sekmeBayat = typeof baglam.belgeKapat === 'function';
      // Diskteki dosya değişti; pencere açık kalırsa sonraki küçültmenin kıyası yeni boyuta göre yapılsın. Tahminler hemen
      // yeniden hesaplanmaz (çekirdeği uzun süre meşgul eder, çoğu kez gereksiz): kullanıcı yeniden seviye seçerse hesaplanır.
      this.mevcutBoyut = yeniBoyut;
      this.boyutEl.textContent = boyutMetni(yeniBoyut);
      this.tahminlerEski = true;
      for (const id of Object.keys(SEVIYELER)) this._tahminYaz(id, null, 'yeniden küçültmek için seçin');
      this.notEl.hidden = false;
      this.notEl.textContent = 'Dosya küçültüldü; tahminler önceki boyuta göreydi. Yeniden küçültmek isterseniz bir seviye seçtiğinizde yeni boyuta göre hesaplanır.';
    }
    this.sonucEl.innerHTML = `<div><b>${buyuk ? 'Dosya küçülmedi.' : 'Küçültme tamamlandı.'}</b> ${fark}</div>
      <div class="soluk kucult-sonuc-yol" title="${kacis(yol)}">${kacis(yol)}</div>
      ${buyuk ? '<div>Belge zaten sıkıştırılmış olabilir ya da görsel içermiyor olabilir. Daha güçlü bir seviye deneyebilir ya da sonucu silebilirsiniz.</div>' : ''}
      ${uzerine ? `<div class="soluk">Açık sekme dosyanın önceki halini gösteriyor; ${this.sekmeBayat ? 'pencere kapanınca güncel haliyle yeniden açılır.' : 'güncel hali için sekmeyi kapatıp yeniden açın.'}</div>` : ''}
      <div class="arac-satir kucult-sonuc-dugmeler">
        ${!uzerine ? '<button class="ikincil kucult-ac">Yeni sekmede aç</button>' : this.sekmeBayat ? '<button class="ikincil kucult-ac">Belgeyi yeniden aç</button>' : ''}
        <button class="ikincil kucult-goster">Klasörde göster</button>
        ${buyuk && !uzerine ? '<button class="ikincil kucult-sil">Sonucu sil</button>' : ''}
      </div>`;
    const ozet = `${dosyaAdi(yol)}: ${boyutMetni(eski)} → ${boyutMetni(yeniBoyut)} (${farkMetni(eski, yeniBoyut)})`;
    const ac = async () => {
      if (uzerine) {
        // Bayat sekme önce kapatılıp aynı sayfada yeniden açılır (kirliyse sorulur); sekmeBayat temizlendiği için pencerenin kapanışı yeniden açmaz
        if (!this.sekmeBayat) return;
        const sayfa = this.belge.gorunum?.gecerli || 1;
        const r = await sekmeyiYenile(baglam, this.belge, { ac: false, soruAyrintisi: 'Belge diskteki küçültülmüş haliyle yeniden açılırsa bu değişiklikler atılır.' });
        if (!r) return;
        this.sekmeBayat = false;
        await this.pencere.kapat('tamam');
        await baglam.dosyaAc(yol, { arkaPlanda: false, sayfa, yenile: true });   // yenile: açılış sekmesinin yerine açılmaz
        baglam.bildir(`Küçültüldü ve kaydedildi · ${ozet}`, 5000);
        return;
      }
      await this.pencere.kapat('tamam');
      // Var olan (bir sekmede açık) dosyanın üzerine yazıldıysa o sekme yeni haliyle yeniden açılır
      await ciktiyiAc(baglam, yol, { cikti: this.kayit.cikti, soruAyrintisi: 'Belge diskteki yeni haliyle yeniden açılırsa bu değişiklikler atılır.' });
      baglam.bildir(`Küçültüldü · ${ozet}`, 5000);
    };
    this.sonucEl.querySelector('.kucult-ac')?.addEventListener('click', ac);
    this.sonucEl.querySelector('.kucult-goster').addEventListener('click', () => baglam.pdefe.cagir('kabuk:klasordeGoster', yol));
    this.sonucEl.querySelector('.kucult-sil')?.addEventListener('click', async () => {
      if (!(await baglam.pdefe.cagir('dosya:sil', yol).catch(() => false))) { baglam.bildir('Sonuç dosyası çöp kutusuna gönderilemedi.'); return; }
      baglam.bildir('Sonuç dosyası çöp kutusuna gönderildi.');
      this.sonucEl.hidden = true;
      this.kayit.adYenile();
    });
    // Başarılı sonuçta doğrudan açılır: yeni belge yeni sekmede, üzerine yazılan belge kendi sekmesinde
    if (!buyuk) await ac();
  }
}

export function kucultAc(baglam) {
  const belge = baglam.aktif();
  if (!belge) { baglam.bildir('Önce bir PDF açın.'); return null; }
  if (pencereAcikMi('kucult')) return null;
  return new KucultPenceresi(baglam, belge);
}
