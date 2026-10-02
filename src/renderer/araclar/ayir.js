// Ayır (0.1.26'ya dek "PDF ayır"): sayfa aralıklarına göre (Ayrı ayrı dosya | Tek dosya) ya da her sayfayı ayrı dosyaya. 0.1.25
// (kullanıcı isteği): "Her N sayfada bir" ve "Seçili sayfaları çıkart" kaldırıldı (seçili sayfaları çıkarmak "Tek dosya"dır); dosya adı
// öteki araçlardaki gibi Kaydet bölümünde yazılır, varsayılanı "Ayrılmış".
// Çekirdek (core/islemler/araclar.py y_ayir):
//   ayir {yol, klasor, parcalar:[{ad:'Ayrılmış - Sayfa 1-3.pdf', sayfalar:[1,2,3]}], uzerineYaz} (ilerlemeli)
//     → {dosyalar:[yol, ...], ayrintilar:[{yol, boyut, sayfa}]}; uzerineYaz false iken var olan dosyanın üzerine yazılmaz, ada "(2)" eklenir
//   ayir {yol, sayfalar:[...], uzerine:true} → özgün dosyada yalnızca o sayfalar kalır
// Dosya adlarını bu pencere verir (ayirParcalari): tek dosyada Kaydet'teki ad olduğu gibi ("Ayrılmış.pdf"), birden çok dosyada sayfa
// numarasıyla ("Ayrılmış - Sayfa 1-3.pdf"; 0.1.25'e dek "<özgün ad>_1-3.pdf").
// Kaydetme: standart seçim (ortak.js kayitSecimi). Tek dosyada öteki araçlar gibidir: var olan dosyanın üzerine yazmadan önce sorulur;
// "Üzerine yaz"da özgün dosyada yalnızca ayrılan sayfalar kalır (yedek alınmaz, geri alınamaz; çekirdek aynı klasörde geçici dosyaya
// yazıp atomik olarak yerine koyar, kilitli / salt okunur dosya değişmez ve kayitSecimi.hataSor sorar), ardından açık sekme diskteki
// yeni haliyle yeniden açılır. Birden çok dosyada "Üzerine yaz" seçilemez; var olan dosyaların üzerine yazılmaz, ada "(2)" eklenir
// (önce sorulur).
import {
  pencereAc, pencereAcikMi, IslemIlerleme, boyutMetni, kacis, hataMetni, dosyaAdi, adGovdesi, yolBirlestir, guvenliAd,
  sayfaAraliklariCoz, degisiklikleriSor, oge, kayitSecimi, kilitliHataMi, ciktiyiAc, sayiMetni, segmentliSecim, acikBelge,
  sekmeyiYenile, numaralarDosyaylaAyni, NUMARA_UYUSMAZ,
} from './ortak.js';

const VARSAYILAN_AD = 'Ayrılmış';
const COKLU_DOSYA_NEDENI = 'Birden çok dosya üreten ayırmada yalnızca yeni belge olarak kaydedilir.';

/** [1,2,3,5] → [[1,3],[5,5]] (sıralı, tekrarsız). Çekirdekteki _sayfa_listesini_gruplara ile aynı. */
export function sayfaGruplari(sayfalar) {
  const gruplar = [];
  for (const s of [...new Set(sayfalar)].sort((a, b) => a - b)) {
    if (gruplar.length && s === gruplar[gruplar.length - 1][1] + 1) gruplar[gruplar.length - 1][1] = s;
    else gruplar.push([s, s]);
  }
  return gruplar;
}

/** 1,2,3,5,6 → "1-3, 5-6" */
function kisaListe(sayfalar) {
  return sayfaGruplari(sayfalar).map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(', ');
}

/** Birden çok dosyada bir dosyanın adı: "<ad> - Sayfa 1-3.pdf", tek sayfada "<ad> - Sayfa 5.pdf". */
function parcaAdi(ad, bas, son) { return `${ad} - Sayfa ${bas === son ? bas : `${bas}-${son}`}.pdf`; }

/**
 * Seçilen biçime göre oluşacak dosyaları hesaplar.
 * @param {{mod:'aralik'|'herSayfa', dosyaKipi?:'ayri'|'tek', aralikMetni?:string}} girdi
 *   aralik + ayri: her aralık ayrı dosya (tek aralık yazıldıysa tek dosya); aralik + tek: yazılan sayfaların hepsi tek dosyada (sıralı,
 *   tekrarsız); herSayfa: her sayfa ayrı dosya
 * @param {number} toplam belgedeki sayfa sayısı
 * @param {string} ad Kaydet bölümündeki dosya adı, uzantısız
 * @returns {{parcalar:Array<{ad:string, sayfalar:number[]}>, hata:string|null}} tek dosyada ad olduğu gibi, birden çok dosyada sayfa
 *   numarasıyla
 */
export function ayirParcalari(girdi, toplam, ad) {
  const temel = guvenliAd(ad);
  if (!(toplam >= 1)) return { parcalar: [], hata: 'Belgenin sayfa sayısı bilinmiyor.' };
  if (girdi.mod === 'aralik') {
    const { araliklar, hata } = sayfaAraliklariCoz(girdi.aralikMetni, toplam);
    if (hata) return { parcalar: [], hata };
    if (girdi.dosyaKipi === 'tek' || araliklar.length === 1) {
      const sayfalar = [...new Set(araliklar.flatMap((a) => a.sayfalar))].sort((a, b) => a - b);
      return { parcalar: [{ ad: `${temel}.pdf`, sayfalar }], hata: null };
    }
    return { parcalar: araliklar.map((a) => ({ ad: parcaAdi(temel, a.bas, a.son), sayfalar: a.sayfalar })), hata: null };
  }
  if (girdi.mod === 'herSayfa') {
    if (toplam === 1) return { parcalar: [{ ad: `${temel}.pdf`, sayfalar: [1] }], hata: null };
    const parcalar = [];
    for (let s = 1; s <= toplam; s++) parcalar.push({ ad: parcaAdi(temel, s, s), sayfalar: [s] });
    return { parcalar, hata: null };
  }
  return { parcalar: [], hata: 'Bilinmeyen ayırma biçimi.' };
}

export class AyirPenceresi {
  constructor(baglam, belge) {
    this.baglam = baglam;
    this.belge = belge;
    this.toplam = belge.gorunum?.sayfaSayisi || belge.bilgi?.sayfa || 0;
    this.mod = 'aralik';
    this.dosyaKipi = 'ayri';
    this.ilerleme = new IslemIlerleme();
    this._kur();
  }

  get klasor() { return this.kayit.cikti.klasor(); }

  _kur() {
    const b = this.belge;
    const govde = oge(`<div class="ayir-govde">
      <div class="arac-bilgi"><b>${kacis(b.ad)}</b> · ${sayiMetni(this.toplam)} sayfa · ${kacis(boyutMetni(b.boyut))}</div>
      <div class="arac-bolum">
        <div class="arac-bolum-baslik">Nasıl ayrılsın?</div>
        <div class="arac-secenek-liste">
          <div class="ayir-aralik-satiri"><label><input type="radio" name="ayir-mod" value="aralik" checked> Sayfa aralıklarına göre</label><span class="ayir-dosya-kipi"></span></div>
          <div class="ic"><input type="text" class="arac-girdi ayir-aralik" placeholder="örn. 1-3, 4-10, 11" style="width:260px" spellcheck="false" aria-label="Sayfalar" data-ilk-odak><span class="arac-aciklama">"-3" baştan 3'e, "8-" 8'den sona</span></div>
          <label><input type="radio" name="ayir-mod" value="herSayfa"> Her sayfayı ayrı dosyaya kaydet <span class="soluk">(${sayiMetni(this.toplam)} dosya)</span></label>
        </div>
      </div>
      <div class="arac-bolum ayir-cikti-alani">
        <div class="arac-bolum-baslik">Kaydet</div>
        <div class="ayir-onizleme"></div>
        <div class="arac-aciklama ayir-adlar" hidden>Var olan dosyaların üzerine yazılmaz; aynı adlı dosya varsa ada "(2)" eklenir.</div>
      </div>
      <div class="ayir-sonuc" hidden></div>
    </div>`);
    this.govde = govde;
    this.aralikEl = govde.querySelector('.ayir-aralik');
    this.onizleme = govde.querySelector('.ayir-onizleme');
    this.adlarEl = govde.querySelector('.ayir-adlar');
    this.sonucEl = govde.querySelector('.ayir-sonuc');
    // "Sayfa aralıklarına göre"nin yanında dosya sayısı (0.1.25, kullanıcı isteği; seçeneklerde "aralık" sözcüğü geçmez)
    this.kipSecim = segmentliSecim({
      etiket: 'Dosya sayısı', deger: this.dosyaKipi, sinif: 'ayir-dosya-kipi-secim',
      secenekler: [
        { id: 'ayri', etiket: 'Ayrı ayrı dosya', baslik: 'Yazılanların her biri ayrı bir dosya olur (örn. 1-3, 4-10: iki dosya)' },
        { id: 'tek', etiket: 'Tek dosya', baslik: 'Yazılan sayfaların hepsi tek bir dosyada toplanır (örn. 1-3, 7: dört sayfalık bir dosya)' },
      ],
      degisti: (id) => { this.dosyaKipi = id; if (this.mod !== 'aralik') this._modSec('aralik', false); else this.onizle(); },
    });
    govde.querySelector('.ayir-dosya-kipi').replaceWith(this.kipSecim.el);
    // Seçili seçeneğe tıklamak da "Sayfa aralıklarına göre"yi seçer
    this.kipSecim.el.addEventListener('click', () => { if (this.mod !== 'aralik') this._modSec('aralik', false); });
    this.kayit = kayitSecimi({ baglam: this.baglam, belge: b, ad: VARSAYILAN_AD, diyalogBasligi: 'Ayrılan PDF' });
    govde.querySelector('.ayir-cikti-alani .arac-bolum-baslik').after(this.kayit.el);
    this.kayit.onDegisti(() => this.onizle());

    for (const r of govde.querySelectorAll('input[name="ayir-mod"]')) r.addEventListener('change', () => this._modSec(r.value, true));
    // Kutu her zaman yazılabilir: tıklayınca ya da yazınca "Sayfa aralıklarına göre" seçilir (Döndür ve kaydet'teki gibi)
    this.aralikEl.addEventListener('pointerdown', () => { if (this.mod !== 'aralik') this._modSec('aralik', false); });
    this.aralikEl.addEventListener('input', () => { if (this.mod !== 'aralik') this._modSec('aralik', false); else this.onizle(); });
    this.aralikEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.ayir(); } });
    govde.addEventListener('keydown', (e) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && e.target.type === 'radio') e.stopPropagation(); });

    this.pencere = pencereAc({
      baslik: 'Ayır', govde, genislik: 660, anahtar: 'ayir', sinif: 'ayir-pencere',
      dugmeler: [{ id: 'ayir', etiket: 'Ayır', birincil: true, tiklama: () => this.ayir() }],
      kapatmadanOnce: () => this._kapatmaIzni(),
    });
    this.pencere.govde.append(this.ilerleme.el);   // gövdenin doğrudan çocuğu: meşgulken soluklaşmaz, İptal tıklanabilir
    this.pencere.el.addEventListener('esc', (e) => { if (this.ilerleme.calisiyor) { e.preventDefault(); this.ilerleme.iptalIste(); } });
    this.onizle();
  }

  /** Ayırma biçimini seçer; odakla: aralık seçilince kutuya geçilir. */
  _modSec(mod, odakla) {
    const r = this.govde.querySelector(`input[name="ayir-mod"][value="${mod}"]`);
    if (!r.checked) r.checked = true;
    this.mod = mod;
    if (odakla && mod === 'aralik') { this.aralikEl.focus(); this.aralikEl.select(); }
    this.onizle();
  }

  async _kapatmaIzni() {
    if (!this.ilerleme.calisiyor) return true;
    const ayrinti = this.kayit.uzerineMi()
      ? 'Pencereyi kapatırsanız işlem iptal edilir; dosyaya henüz yazılmadıysa özgün dosya değişmez.'
      : 'Pencereyi kapatırsanız işlem iptal edilir; oluşmuş dosyalar kalır.';
    const { secim } = await this.baglam.mesajKutusu({ mesaj: 'Ayırma sürüyor.', ayrinti, dugmeler: ['İptal et ve kapat', 'Sürdür'], varsayilan: 1, iptal: 1 });
    if (secim !== 0) return false;
    this.ilerleme.iptalIste();
    return true;
  }

  /** Seçilen biçime ve Kaydet'teki ada göre dosyaları hesaplar: {parcalar:[{ad, sayfalar}], hata} */
  parcalariHesapla() {
    const ad = adGovdesi(this.kayit.cikti.ad()) || VARSAYILAN_AD;
    return ayirParcalari({ mod: this.mod, dosyaKipi: this.dosyaKipi, aralikMetni: this.aralikEl.value }, this.toplam, ad);
  }

  onizle() {
    let { parcalar, hata } = this.parcalariHesapla();
    // Tek dosya mı: "Üzerine yaz" yalnızca tek dosyada; ayrı ayrı dosyada aralık yazılırken (hatalıyken) önceki durum korunur
    let tek;
    if (this.mod === 'herSayfa') tek = this.toplam <= 1;
    else if (this.dosyaKipi === 'tek') tek = true;
    else { tek = hata ? (this._sonTek ?? true) : parcalar.length === 1; this._sonTek = tek; }
    this.kayit.cokluAyarla(!tek);
    this.kayit.uzerineKullanilabilir(tek, COKLU_DOSYA_NEDENI);
    // cokluAyarla varsayılan adı yeniden önermiş olabilir ("Ayrılmış (2)" → "Ayrılmış"): dosya adları güncel adla
    ({ parcalar, hata } = this.parcalariHesapla());
    const uzerine = this.kayit.uzerineMi();
    this.adlarEl.hidden = uzerine || tek;
    this.aralikEl.classList.remove('hatali');
    if (hata) {
      // Henüz bir şey yazılmamış kutu hata sayılmaz: yalnızca yol gösterilir
      const bos = this.mod === 'aralik' && !this.aralikEl.value.trim();
      this.aralikEl.classList.toggle('hatali', this.mod === 'aralik' && !bos);
      this.onizleme.innerHTML = bos ? `<span>${kacis(hata)}</span>` : `<span class="hata-metin">${kacis(hata)}</span>`;
      this.pencere?.dugmeAyarla('ayir', { devre: true });
      return;
    }
    if (uzerine) {
      // Geri alınamaz: özgün dosyada nelerin kalacağı açıkça yazılır
      const p = parcalar[0], ad = kacis(dosyaAdi(this.belge.yol)), kalan = this.toplam - p.sayfalar.length;
      this.onizleme.innerHTML = kalan > 0
        ? `<b>"${ad}"</b> dosyasında yalnızca ${sayiMetni(p.sayfalar.length)} sayfa kalır <span class="soluk">(${kacis(kisaListe(p.sayfalar))})</span>; diğer ${sayiMetni(kalan)} sayfa silinir.`
        : `Bütün sayfalar seçili: <b>"${ad}"</b> aynı sayfalarla yeniden yazılır.`;
      this.pencere?.dugmeAyarla('ayir', { devre: false });
      return;
    }
    const enFazla = 12;
    const satirlar = parcalar.slice(0, enFazla).map((p) => `<li>${kacis(p.ad)} <span class="soluk">(${p.sayfalar.length} sayfa${p.sayfalar.length <= 12 ? ': ' + kacis(kisaListe(p.sayfalar)) : ''})</span></li>`);
    if (parcalar.length > enFazla) satirlar.push(`<li>ve ${sayiMetni(parcalar.length - enFazla)} dosya daha</li>`);
    this.onizleme.innerHTML = `<b>${parcalar.length} dosya</b> oluşturulacak:<ul>${satirlar.join('')}</ul>`;
    this.pencere?.dugmeAyarla('ayir', { devre: false });
  }

  /** Ayırır; kilitli / salt okunur dosya sorusunda "Yeniden dene", "Yeni belge olarak kaydet" ya da "Başka adla kaydet" seçilirse yeniden çalışır. */
  async ayir() {
    if (this.ilerleme.calisiyor || this._suruyor) return;
    this._suruyor = true;
    try {
      while (!this.pencere.kapali && await this._ayirBir());
    } finally { this._suruyor = false; }
  }

  /** Bir ayırma denemesi; yeniden denenecekse true döner. */
  async _ayirBir() {
    const { baglam, belge } = this;
    if (this.parcalariHesapla().hata) { this.onizle(); return false; }
    this.pencere.hataGoster('');
    this.sonucEl.hidden = true;
    // Sayfa numaraları sekmedeki gibidir: sekmede kaydedilmemiş sayfa silme / sıralama varsa dosyadakilerle uyuşmaz, önce kaydedilmeli
    // (üzerine yazmada yanlış sayfalar geri alınamaz biçimde kalırdı)
    const secenek = numaralarDosyaylaAyni(belge) ? {} : { yalnizKaydet: true, neden: NUMARA_UYUSMAZ };
    if (this.kayit.uzerineMi()) secenek.aciklama = 'Ayırma dosyadaki kayıtlı sürüm üzerinde çalışır; üzerine yazıldıktan sonra belge yeni haliyle yeniden açılır ve kaydedilmemiş değişiklikler atılır.';
    if ((await degisiklikleriSor(baglam, belge, 'Ayırma', secenek)) === 'vazgec') return false;
    if (this.pencere.kapali) return false;
    // Ad ve klasör; tek dosyada var olan dosya sorusu; yazılacak dosya (üzerine yazmada özgün dosya) kilitli ya da salt okunursa şimdi
    const denetim = await this.kayit.denetle();
    if (this.pencere.kapali || denetim === 'vazgec') return false;
    if (denetim instanceof Error) return this.kayit.hataSor(denetim);
    const { parcalar, hata } = this.parcalariHesapla();   // ad denetimde değişmiş olabilir
    if (hata || !parcalar.length) { this.onizle(); return false; }
    if (this.kayit.uzerineMi()) return this._uzerineYaz(parcalar[0]);
    const klasor = this.klasor;
    const coklu = parcalar.length > 1;
    if (coklu) {
      // Aynı adlı dosya varsa çekirdek "(2)" ekler; kullanıcı bilsin
      const varOlanlar = [];
      for (const p of parcalar.slice(0, 200)) { if (await baglam.pdefe.cagir('dosya:varMi', yolBirlestir(klasor, p.ad))) varOlanlar.push(p.ad); }
      if (this.pencere.kapali) return false;
      if (varOlanlar.length) {
        const { secim } = await baglam.mesajKutusu({ mesaj: `${varOlanlar.length} dosya zaten var.`, ayrinti: varOlanlar.slice(0, 8).join('\n') + (varOlanlar.length > 8 ? `\nve ${varOlanlar.length - 8} dosya daha` : '') + '\n\nVar olanlar korunur; yeni dosyaların adına "(2)" eklenir. Devam edilsin mi?', dugmeler: ['Devam et', 'Vazgeç'], varsayilan: 0, iptal: 1 });
        if (secim !== 0 || this.pencere.kapali) return false;
      }
    }
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('ayir', { devre: true });
    let kilit = null;
    try {
      // Tek dosyada var olan dosyanın üzerine yazılması denetimde sorulup onaylandı (uzerineYaz); birden çok dosyada ada "(2)" eklenir
      const params = { yol: belge.yol, klasor, parcalar: parcalar.map((p) => ({ ad: p.ad, sayfalar: p.sayfalar })), uzerineYaz: !coklu };
      const sonuc = await this.ilerleme.calistir(baglam, 'ayir', params, { baslangicMesaji: 'Ayrılıyor…' });
      const dosyalar = this.dosyalariOku(sonuc, parcalar);
      if (!coklu) await this._acikSekmeyiYenile(dosyalar[0]?.yol);
      await this.sonucGoster(dosyalar);
    } catch (e) {
      this.ilerleme.gizle();
      if (e.iptal) {
        // Çekirdek son dosyayı yazdıktan sonra iptale bakmaz: sonuç geldiyse hepsi yazılmıştır
        baglam.bildir(e.sonuc ? 'İptal edilemeden tamamlandı.' : 'Ayırma iptal edildi.');
        if (e.sonuc) {
          const dosyalar = this.dosyalariOku(e.sonuc, parcalar);
          if (!coklu) await this._acikSekmeyiYenile(dosyalar[0]?.yol);
          await this.sonucGoster(dosyalar);
        }
      } else if (kilitliHataMi(e)) kilit = e;
      else this.pencere.hataGoster('Ayırma başarısız: ' + hataMetni(e));
    } finally {
      if (!this.pencere.kapali) {
        this.pencere.el.classList.remove('mesgul');
        this.pencere.dugmeAyarla('ayir', { devre: false });
      }
    }
    // Soru yazılamayan dosyayı (tek dosyada var olan hedef) ya da klasörü söyler; seçime göre adı değiştirir
    return kilit && !this.pencere.kapali ? this.kayit.hataSor(kilit) : false;
  }

  /** Tek dosya PDEfe'de açık bir dosyanın yerine yazıldıysa (denetimde onaylandı) o sekme diskteki yeni haliyle yeniden açılır; dosya başka
   *  bir PDEfe penceresinde açıksa oradaki sekme (öteki araçlardaki ciktiyiAc gibi). */
  async _acikSekmeyiYenile(yol) {
    const acik = yol ? acikBelge(this.baglam, yol) : null;
    if (!acik) {
      if (yol) await this.baglam.pdefe.cagir('pencere:baskaPenceredeAc', yol, { yazildi: true }).catch(() => false);
      return;
    }
    const r = await sekmeyiYenile(this.baglam, acik, {
      soruAyrintisi: 'Belge diskteki yeni haliyle yeniden açılırsa bu değişiklikler atılır.', sormadan: !!this.kayit.cikti.onaylandi?.(yol),
    }).catch(() => false);
    if (!r) this.baglam.bildir(`"${acik.ad}" sekmesi dosyanın önceki halini gösteriyor; notlarda değişiklik yapmadan önce sekmeyi kapatıp yeniden açın.`, 8000);
  }

  /**
   * Üzerine yaz: özgün dosyada yalnızca ayrılan sayfalar kalır (yedek yok, geri alınamaz; ada "(2)" eklenmez). Özgün dosya kilitli ya da
   * salt okunursa önceden sorulmuştur (kayitSecimi.denetle); çekirdek de yazamazsa dosya değişmez ve aynı soru sorulur. Başarıda pencere
   * kapanır, açık sekme diskteki yeni haliyle yeniden açılır (kaydedilmemiş değişiklik varsa ciktiyiAc önce sorar). Döner: yeniden
   * denenecekse true.
   */
  async _uzerineYaz(parca) {
    const { baglam, belge } = this;
    const yol = belge.yol;
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('ayir', { devre: true });
    let kilit = null, sonuc = null;
    try {
      sonuc = await this.ilerleme.calistir(baglam, 'ayir', { yol, sayfalar: parca.sayfalar, uzerine: true }, { baslangicMesaji: 'Ayrılıyor…' });
    } catch (e) {
      this.ilerleme.gizle();
      // Çekirdek yer değiştirmeden sonra iptali denetlemez: sonuç geldiyse dosya yazılmıştır, gelmediyse özgün dosya değişmemiştir
      if (e.iptal && e.sonuc) sonuc = e.sonuc;
      else if (e.iptal) baglam.bildir('Ayırma iptal edildi. Özgün dosya değiştirilmedi.');
      else if (kilitliHataMi(e)) kilit = e;
      else this.pencere.hataGoster('Ayırma başarısız: ' + hataMetni(e) + '\nÖzgün dosya değiştirilmedi.');
    } finally {
      if (!this.pencere.kapali) {
        this.pencere.el.classList.remove('mesgul');
        this.pencere.dugmeAyarla('ayir', { devre: false });
      }
    }
    if (kilit) return !this.pencere.kapali && this.kayit.hataSor(kilit);
    if (!sonuc) return false;
    this.ilerleme.gizle();
    const n = sonuc.ayrintilar?.[0]?.sayfa ?? parca.sayfalar.length;
    await this.pencere.kapat('tamam');
    // Sekme dosyanın önceki halini (eski xref'leri) tutuyor: diskteki yeni haliyle yeniden açılır
    await ciktiyiAc(baglam, yol, { soruAyrintisi: 'Belge diskteki yeni haliyle (yalnızca ayrılan sayfalar) yeniden açılırsa bu değişiklikler atılır.' });
    baglam.bildir(`"${dosyaAdi(yol)}" üzerine yazıldı: ${sayiMetni(n)} sayfa kaldı.`, 5000);
    return false;
  }

  /** Çekirdek sonucunu {yol, boyut, sayfa} listesine çevirir: ayrintilar:[{yol,boyut,sayfa}] varsa o, yoksa dosyalar:[yol]. */
  dosyalariOku(sonuc, parcalar) {
    const ham = Array.isArray(sonuc?.ayrintilar) && sonuc.ayrintilar.length ? sonuc.ayrintilar : (Array.isArray(sonuc?.dosyalar) ? sonuc.dosyalar : []);
    return ham.map((d, i) => (typeof d === 'string'
      ? { yol: d, boyut: null, sayfa: parcalar[i]?.sayfalar.length }
      : { yol: d.yol, boyut: d.boyut ?? null, sayfa: d.sayfa ?? parcalar[i]?.sayfalar.length }));
  }

  async sonucGoster(dosyalar) {
    const { baglam } = this;
    this.ilerleme.gizle();
    this.sonucEl.hidden = false;
    this.sonucEl.className = 'ayir-sonuc arac-basari arac-sonuc-liste';
    if (!dosyalar.length) { this.sonucEl.className = 'ayir-sonuc arac-uyari'; this.sonucEl.textContent = 'Hiç dosya oluşmadı.'; return; }
    // Boyutu gelmeyenleri dosya sisteminden sor
    for (const d of dosyalar) if (d.boyut == null) { try { const b = await baglam.pdefe.cagir('dosya:bilgi', d.yol); if (b?.var) d.boyut = b.boyut; } catch { /* yok say */ } }
    if (this.pencere.kapali) return;
    const toplam = dosyalar.reduce((t, d) => t + (d.boyut || 0), 0);
    const tek = dosyalar.length === 1;
    this.sonucEl.innerHTML = `<div title="${kacis(this.klasor)}"><b>${dosyalar.length} dosya oluşturuldu</b> · toplam ${kacis(boyutMetni(toplam))}</div>
      <ul>${dosyalar.map((d, i) => `<li><a data-i="${i}" title="Yeni sekmede aç">${kacis(dosyaAdi(d.yol))}</a><span class="soluk">${d.sayfa ? d.sayfa + ' sayfa' : ''}</span><span class="boyut">${kacis(boyutMetni(d.boyut))}</span></li>`).join('')}</ul>
      <div class="arac-satir" style="margin-top:6px">
        <button class="ikincil ayir-goster">Klasörde göster</button>
        <button class="ikincil ayir-ilk-ac">${tek ? 'Yeni sekmede aç' : 'İlkini yeni sekmede aç'}</button>
        ${tek ? '' : '<label><input type="checkbox" class="ayir-hepsi-ac"> Hepsini aç</label>'}
      </div>`;
    this.sonucEl.querySelector('.ayir-goster').addEventListener('click', () => baglam.pdefe.cagir('kabuk:klasordeGoster', dosyalar[0].yol));
    this.sonucEl.querySelectorAll('a[data-i]').forEach((a) => a.addEventListener('click', () => baglam.dosyaAc(dosyalar[+a.dataset.i].yol, { arkaPlanda: true })));
    this.sonucEl.querySelector('.ayir-ilk-ac').addEventListener('click', async () => {
      const hepsi = !!this.sonucEl.querySelector('.ayir-hepsi-ac')?.checked;
      await this.pencere.kapat('tamam');
      if (hepsi) { for (const d of dosyalar.slice(0, 50)) await baglam.dosyaAc(d.yol, { arkaPlanda: true }); if (dosyalar.length > 50) baglam.bildir('İlk 50 dosya açıldı.'); }
      else await baglam.dosyaAc(dosyalar[0].yol, { arkaPlanda: false });
    });
    baglam.bildir(`${dosyalar.length} dosya oluşturuldu.`);
  }
}

export function ayirAc(baglam) {
  const belge = baglam.aktif();
  if (!belge) { baglam.bildir('Önce bir PDF açın.'); return null; }
  if (pencereAcikMi('ayir')) return null;
  return new AyirPenceresi(baglam, belge);
}
