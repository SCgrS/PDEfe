// PDF küçült: mevcut boyut, üç hazır seviye (aşırı / ideal / düşük), tahminler, ilerleme, sonuç.
// Çekirdek: kucult_tahmin {yol, seviyeler} ve kucult {yol, hedef, seviye, dpi, kalite} (ilerlemeli).
// "Üzerine yaz": özgün dosya önce AYNI KLASÖRE "<ad gövdesi> (yedek).pdf" adıyla kopyalanır (ad doluysa
// "… (yedek) (2).pdf"); yedek alınamaz ya da doğrulanamazsa üzerine yazılmaz.
import {
  pencereAc, pencereAcikMi, IslemIlerleme, boyutMetni, farkMetni, kacis, hataMetni, dosyaAdi, klasorAdi, adGovdesi, yolBirlestir,
  bosAdBul, dosyaBoyutu, degisiklikleriSor, oge,
} from './ortak.js';

/** Hazır seviyeler. dpi/kalite değerleri yalnızca bilgi amaçlıdır; çekirdek (core/islemler/araclar.py SEVIYELER)
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
    this.uzerineYaz = false;
    this.sekmeBayat = false;         // üzerine yazıldı, açık sekme dosyanın önceki halini (eski xref'leri) tutuyor: pencere kapanınca yenilenir
    this.ilerleme = new IslemIlerleme();
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
        <label><input type="checkbox" class="kucult-uzerine"> Üzerine yaz (özgün dosya aynı klasöre yedeklenir)</label>
      </div>
      <div class="kucult-sonuc" hidden></div>
    </div>`);
    this.govde = govde;
    this.boyutEl = govde.querySelector('.kucult-boyut .deger');
    this.kartlar = govde.querySelector('.kucult-kartlar');
    for (const [id, s] of Object.entries(SEVIYELER)) this.kartlar.append(this._kart(id, s.ad, s.aciklama));
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
    // Bayat sekme (sonraki kayıt eski xref'lerle hata verir ya da başka notu değiştirir) pencere nasıl kapanırsa kapansın (Kapat, X, Esc)
    // diskteki haliyle yeniden açılır; 'kapandi' kapatmadanOnce izin verdikten sonra gelir
    this.pencere.el.addEventListener('kapandi', async () => {
      if (!this.sekmeBayat) return;
      const sonuc = await this._bayatSekmeyiKapat().catch(() => false);
      if (sonuc === 'kapatildi') await this.baglam.dosyaAc(this.belge.yol, { arkaPlanda: false });
      else if (!sonuc) this.baglam.bildir('Açık sekme dosyanın küçültülmeden önceki halini gösteriyor; notlarda değişiklik yapmadan önce sekmeyi kapatıp yeniden açın.', 8000);
    });
    this.seviyeSec('onerilen');
    this.ciktiYoluHazirla();
    this.tahminleriAl();
  }

  /**
   * Üzerine yazılan dosyanın bayat sekmesini kapatır; kaydedilmemiş değişiklik varsa sorar. Döner: 'kapatildi', 'yok' (sekme zaten
   * kapatılmış) ya da false (vazgeçildi/kapatılamadı). Sekme kapanınca ya da yoksa sekmeBayat temizlenir.
   */
  async _bayatSekmeyiKapat() {
    const { baglam, belge } = this;
    if (belge.el && !belge.el.isConnected) { this.sekmeBayat = false; return 'yok'; }
    if (belge.degisti) {
      const { secim } = await baglam.mesajKutusu({ tur: 'warning', mesaj: `"${belge.ad}" belgesinde kaydedilmemiş değişiklikler var.`, ayrinti: 'Belge diskteki küçültülmüş haliyle yeniden açılırsa bu değişiklikler atılır.', dugmeler: ['Değişiklikleri at ve yeniden aç', 'Vazgeç'], varsayilan: 1, iptal: 1 });
      if (secim !== 0) return false;
    }
    if (!(await baglam.belgeKapat(belge.id, { zorla: true }))) return false;
    this.sekmeBayat = false;
    return 'kapatildi';
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

  async ciktiYoluHazirla() {
    const klasor = klasorAdi(this.belge.yol);
    let ad = adGovdesi(this.belge.yol) + '_kucuk.pdf';
    try { ad = await bosAdBul(this.baglam.pdefe, klasor, ad); } catch { /* varsayılan ad */ }
    this.ciktiKlasor = klasor;
    this.ciktiAd = ad;
    this.ciktiYoluYaz();
  }

  ciktiYoluYaz() {
    if (this.uzerineYaz) { this.ciktiYolEl.textContent = this.belge.yol; this.ciktiYolEl.title = `Özgün dosyanın üzerine yazılır; önce aynı klasöre "${adGovdesi(this.belge.yol)} (yedek).pdf" adıyla yedeği alınır`; }
    else { this.ciktiYolEl.textContent = yolBirlestir(this.ciktiKlasor || '', this.ciktiAd || '…'); this.ciktiYolEl.title = this.ciktiYolEl.textContent; }
  }

  secilenParametreler() {
    const s = SEVIYELER[this.seviye] || SEVIYELER.onerilen;
    return { seviye: SEVIYELER[this.seviye] ? this.seviye : 'onerilen', dpi: s.dpi, kalite: s.kalite };
  }

  /** Özgün dosyanın klasöründe boş bir yedek yolu: "<ad gövdesi> (yedek).pdf", doluysa "… (yedek) (2).pdf" … */
  async yedekYoluBul() {
    const klasor = klasorAdi(this.belge.yol);
    const ad = await bosAdBul(this.baglam.pdefe, klasor, `${adGovdesi(this.belge.yol)} (yedek).pdf`);
    return yolBirlestir(klasor, ad);
  }

  /** Özgün dosyayı aynı klasöre kopyalar ve boyutunu doğrular; yedek yolunu döner. Başarısızsa e.yedekHatasi = true fırlatır. */
  async yedekAl() {
    const { pdefe } = this.baglam;
    let yedek = null;
    try {
      yedek = await this.yedekYoluBul();   // onaydan bu yana ad alınmış olabilir: yeniden bak
      await pdefe.cagir('dosya:kopyala', this.belge.yol, yedek);
      const [ozgunBoyut, yedekBoyut] = await Promise.all([dosyaBoyutu(pdefe, this.belge.yol), dosyaBoyutu(pdefe, yedek)]);
      if (yedekBoyut == null) throw new Error('yedek dosyası oluşmadı');
      if (ozgunBoyut != null && ozgunBoyut !== yedekBoyut) {
        try { await pdefe.cagir('dosya:sil', yedek); } catch { /* yok say */ }
        throw new Error('yedek dosyası eksik yazıldı');
      }
      return yedek;
    } catch (e) {
      const h = new Error(`Yedek alınamadığı için dosyanın üzerine yazılmadı: ${hataMetni(e)}${yedek ? `\n(${yedek})` : ''}`);
      h.yedekHatasi = true;
      throw h;
    }
  }

  async kucult() {
    const { baglam, belge } = this;
    if (this.ilerleme.calisiyor) return;
    this.pencere.hataGoster('');
    this.sonucEl.hidden = true;
    // Bayat sekmenin değişiklikleri kaydettirilmez: eski xref'lerle küçültülmüş dosyaya yazılırdı (pencere kapanınca atılıp atılmayacağı sorulur)
    if (!this.sekmeBayat && (await degisiklikleriSor(baglam, belge, 'Küçültme')) === 'vazgec') return;
    if (this.pencere.kapali) return;

    const uzerine = this.uzerineYaz;
    let hedef;
    if (uzerine) {
      let yedekAday;
      try { yedekAday = await this.yedekYoluBul(); } catch (e) { this.pencere.hataGoster('Yedek adı belirlenemediği için dosyanın üzerine yazılmadı: ' + hataMetni(e)); return; }
      const { secim } = await baglam.mesajKutusu({ tur: 'warning', mesaj: 'Özgün dosyanın üzerine yazılacak.', ayrinti: `${belge.yol}\n\nÖnce aynı klasöre yedek alınır: ${dosyaAdi(yedekAday)}. Devam edilsin mi?`, dugmeler: ['Üzerine yaz', 'Vazgeç'], varsayilan: 0, iptal: 1 });
      if (secim !== 0 || this.pencere.kapali) return;
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
    let yedek = null, hedefOnce = null;
    try {
      if (uzerine) {
        yedek = await this.yedekAl();   // hata fırlatırsa küçültme hiç başlamaz
        baglam.bildir('Yedek alındı: ' + yedek, 8000);
      }
      // Hedefin işlem öncesi durumu: iptal geç ulaşırsa dosyanın yazılıp yazılmadığı buna bakılarak anlaşılır
      hedefOnce = await baglam.pdefe.cagir('dosya:bilgi', hedef).catch(() => null);
      const p = this.secilenParametreler();
      // Çekirdek (kucult): geçici dosyaya yazıp os.replace ile hedefe taşır; hedef == yol (üzerine yazma) desteklenir.
      // Sonuç: {boyut, oncekiBoyut, yuzde, uyari, dpi, kalite}
      const sonuc = await this.ilerleme.calistir(baglam, 'kucult', { yol: belge.yol, hedef, ...p }, { baslangicMesaji: 'Küçültülüyor…' });
      const yeniBoyut = sonuc?.boyut ?? await dosyaBoyutu(baglam.pdefe, hedef);
      await this.sonucGoster(hedef, yeniBoyut, yedek, uzerine);
    } catch (e) {
      this.ilerleme.gizle();
      // Çekirdek kaydettikten (os.replace) sonra iptal ya da hata fırlatmış olabilir; sonuç gelmez: diske bak.
      // degismedi yalnızca diskte doğrulanınca true olur (bilgi alınamazsa hedef değişmiş sayılır, yedek korunur).
      let simdi = null;
      if (hedefOnce && !e.sonuc) simdi = await baglam.pdefe.cagir('dosya:bilgi', hedef).catch(() => null);
      const degismedi = !!simdi && simdi.var === hedefOnce.var && (!simdi.var || (simdi.degisim === hedefOnce.degisim && simdi.boyut === hedefOnce.boyut));
      if (e.iptal && simdi?.var && !degismedi) e.sonuc = { boyut: simdi.boyut };
      // Üzerine yazılmadıysa (özgün dosya değişmedi) yedek gereksiz: çöp kutusuna gönder. Dosya değiştiyse (e.sonuc) yedek kalır.
      let yedekSilindi = false;
      if (uzerine && yedek && !e.sonuc && degismedi) {
        yedekSilindi = await baglam.pdefe.cagir('dosya:sil', yedek).catch(() => false) === true;
        if (yedekSilindi) yedek = null;
      }
      const yedekNotu = yedekSilindi ? 'Özgün dosya değişmedi; alınan yedek çöp kutusuna gönderildi.' : '';
      if (e.iptal && uzerine && e.sonuc) {
        // İptal geç ulaştı ve dosyanın üzerine yazıldı: sonucu yedekle birlikte göster
        await this.sonucGoster(hedef, e.sonuc.boyut ?? await dosyaBoyutu(baglam.pdefe, hedef), yedek, uzerine);
      } else if (e.iptal) {
        // İş yine de bittiyse (iptal geç ulaştı) ve yeni dosya oluştuysa çöp kutusuna gönder
        if (!uzerine && e.sonuc) { try { await baglam.pdefe.cagir('dosya:sil', hedef); } catch { /* yok say */ } }
        baglam.bildir('Küçültme iptal edildi.' + (yedekNotu ? ' ' + yedekNotu : yedek ? ' Yedek: ' + yedek : ''), yedek || yedekNotu ? 8000 : 3000);
      } else if (e.yedekHatasi) {
        this.pencere.hataGoster(e.message);
      } else {
        this.pencere.hataGoster('Küçültme başarısız: ' + hataMetni(e) + (yedek ? `\nÖzgün dosyanın yedeği: ${yedek}` : yedekNotu ? `\n${yedekNotu}` : ''));
      }
    } finally {
      this.pencere.el.classList.remove('mesgul');
      this.pencere.dugmeAyarla('kucult', { devre: false });
      this.pencere.dugmeAyarla('kapat', { devre: false });
    }
  }

  async sonucGoster(yol, yeniBoyut, yedek, uzerine = this.uzerineYaz) {
    const { baglam, belge } = this;
    const eski = this.mevcutBoyut;
    const buyuk = yeniBoyut != null && eski && yeniBoyut >= eski;
    // Üzerine yazmada açık sekme eski veriyi tutuyor: kapatıp yeniden açmak için proje sahibinin belgeKapat vermesi gerekir
    const yenidenAcilabilir = uzerine && typeof baglam.belgeKapat === 'function';
    if (uzerine) {
      this.sekmeBayat = yenidenAcilabilir;
      // Diskteki dosya değişti; pencere açık kaldığından sonraki küçültmenin kıyası yeni boyuta göre yapılsın. Tahminler hemen
      // yeniden hesaplanmaz (çekirdeği uzun süre meşgul eder, çoğu kez gereksiz): kullanıcı yeniden seviye seçerse hesaplanır.
      this.mevcutBoyut = yeniBoyut;
      this.boyutEl.textContent = boyutMetni(yeniBoyut);
      this.tahminlerEski = true;
      for (const id of Object.keys(SEVIYELER)) this._tahminYaz(id, null, 'yeniden küçültmek için seçin');
      this.notEl.hidden = false;
      this.notEl.textContent = 'Dosya küçültüldü; tahminler önceki boyuta göreydi. Yeniden küçültmek isterseniz bir seviye seçtiğinizde yeni boyuta göre hesaplanır.';
    }
    this.sonucEl.hidden = false;
    this.sonucEl.className = 'kucult-sonuc ' + (buyuk ? 'arac-uyari' : 'arac-basari');
    this.sonucEl.innerHTML = `<div><b>${buyuk ? 'Dosya küçülmedi.' : 'Küçültme tamamlandı.'}</b> ${kacis(boyutMetni(eski))} → <b>${kacis(boyutMetni(yeniBoyut))}</b> (${kacis(farkMetni(eski, yeniBoyut))})</div>
      <div class="soluk kucult-sonuc-yol" title="${kacis(yol)}">${kacis(yol)}</div>
      ${buyuk ? '<div>Belge zaten sıkıştırılmış olabilir ya da görsel içermiyor olabilir. Daha güçlü bir seviye deneyebilir ya da sonucu silebilirsiniz.</div>' : ''}
      ${yedek ? `<div class="kucult-yedek">Özgün dosyanın yedeği: <span class="kucult-yedek-yol">${kacis(yedek)}</span></div>` : ''}
      ${uzerine ? `<div class="soluk">Açık sekme dosyanın önceki halini gösteriyor; ${yenidenAcilabilir ? 'pencere kapanınca güncel haliyle yeniden açılır.' : 'güncel hali için sekmeyi kapatıp yeniden açın.'}</div>` : ''}
      <div class="arac-satir" style="margin-top:4px">
        ${!uzerine ? '<button class="ikincil kucult-ac">Yeni sekmede aç</button>' : yenidenAcilabilir ? '<button class="ikincil kucult-ac">Belgeyi yeniden aç</button>' : ''}
        <button class="ikincil kucult-goster">Klasörde göster</button>
        ${yedek ? '<button class="ikincil kucult-yedek-goster">Yedeği klasörde göster</button>' : ''}
        ${buyuk && !uzerine ? '<button class="ikincil kucult-sil">Sonucu sil</button>' : ''}
      </div>`;
    this.ilerleme.gizle();
    const ac = async () => {
      // Üzerine yazmada bayat sekme önce kapatılır (kirliyse sorulur); sekmeBayat temizlendiği için pencerenin kapanışı yeniden açmaz
      if (uzerine && (!yenidenAcilabilir || !(await this._bayatSekmeyiKapat()))) return;
      await this.pencere.kapat('tamam');
      await baglam.dosyaAc(yol, { arkaPlanda: false });
    };
    this.sonucEl.querySelector('.kucult-ac')?.addEventListener('click', ac);
    this.sonucEl.querySelector('.kucult-goster').addEventListener('click', () => baglam.pdefe.cagir('kabuk:klasordeGoster', yol));
    this.sonucEl.querySelector('.kucult-yedek-goster')?.addEventListener('click', () => baglam.pdefe.cagir('kabuk:klasordeGoster', yedek));
    this.sonucEl.querySelector('.kucult-sil')?.addEventListener('click', async () => {
      await baglam.pdefe.cagir('dosya:sil', yol);
      baglam.bildir('Sonuç dosyası çöp kutusuna gönderildi.');
      this.sonucEl.hidden = true;
    });
    if (yedek) {
      // Yedeğin yeri görünür kalsın: pencere kendiliğinden kapanmaz, bildirimde de yol yazılır
      baglam.bildir(`${buyuk ? 'Dosya küçülmedi' : 'Küçültme tamamlandı'}. Özgün dosyanın yedeği: ${yedek}${uzerine ? (yenidenAcilabilir ? '. Açık sekme pencere kapanınca güncel haliyle yeniden açılır.' : '. Güncel hali için sekmeyi kapatıp yeniden açın.') : ''}`, 8000);
      this.sonucEl.querySelector('.kucult-yedek-goster')?.focus();
    } else if (!buyuk) {
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
