// PDF ayır: sayfa aralıklarına göre / her N sayfada bir / seçili sayfaları çıkart / her sayfayı ayrı dosyaya.
// Çekirdek (core/islemler/araclar.py y_ayir):
//   ayir {yol, hedefKlasor, mod:'aralik'|'herN'|'secili'|'tek', araliklar:"1-3, 5", n, sayfalar:[...], uzerine?} (ilerlemeli)
//   → {dosyalar:[yol, ...], ayrintilar:[{yol, boyut, sayfa}]}
// Dosya adlarını çekirdek belirler: <ad>_<etiket>.pdf; var olan ad üzerine yazılmaz, "(2)", "(3)" eklenir.
// Bu pencere aynı adlandırma kuralını (ayirParcalari) önizleme için burada da uygular.
// Kaydetme: standart seçim (ortak.js kayitSecimi, klasör kipi). "Yeni belge olarak kaydet" (varsayılan) yalnızca klasör satırıdır
// (varsayılan: Ayarlar'daki çıktı klasörü, yoksa Masaüstü). "Üzerine yaz" yalnızca tek dosya üreten ayırmada (seçili sayfalar ya da
// tek aralık) seçilebilir: özgün dosyada yalnızca ayrılan sayfalar kalır, yedek alınmaz, geri alınamaz; çekirdek aynı klasörde geçici
// dosyaya yazıp atomik olarak yerine koyar (kilitli / salt okunur dosya değişmez, kayitSecimi.hataSor sorar), ardından açık sekme
// diskteki yeni haliyle yeniden açılır.
import {
  pencereAc, pencereAcikMi, IslemIlerleme, boyutMetni, kacis, hataMetni, dosyaAdi, adGovdesi, yolBirlestir,
  guvenliAd, sayfaListesiCoz, sayfaAraliklariCoz, degisiklikleriSor, oge, kayitSecimi, kilitliHataMi, ciktiyiAc, sayiMetni,
  numaralarDosyaylaAyni, NUMARA_UYUSMAZ,
} from './ortak.js';

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

/** Çekirdekteki _aralik_etiketi: en çok 4 grup "1-3_5_8-9", fazlası "secili_<n>sayfa". */
function aralikEtiketi(gruplar) {
  const parcalar = gruplar.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`));
  if (parcalar.length > 4) return `secili_${gruplar.reduce((t, [a, b]) => t + (b - a + 1), 0)}sayfa`;
  return parcalar.join('_');
}

/**
 * Seçilen moda göre oluşacak parçaları ve çekirdeğe gidecek parametreleri hesaplar.
 * @param {{mod:string, aralikMetni?:string, n?:number|string, seciliMetni?:string}} girdi
 * @param {number} toplam belgedeki sayfa sayısı
 * @param {string} govde dosya adı gövdesi (uzantısız)
 * @returns {{parcalar:Array<{ad:string, sayfalar:number[]}>, params:object|null, hata:string|null}}
 */
export function ayirParcalari(girdi, toplam, govde) {
  const ad = guvenliAd(govde);
  const dosyaAd = (etiket) => guvenliAd(`${ad}_${etiket}`) + '.pdf';
  if (!(toplam >= 1)) return { parcalar: [], params: null, hata: 'Belgenin sayfa sayısı bilinmiyor.' };
  const mod = girdi.mod;
  if (mod === 'aralik') {
    const { araliklar, hata } = sayfaAraliklariCoz(girdi.aralikMetni, toplam);
    if (hata) return { parcalar: [], params: null, hata };
    const parcalar = araliklar.map((a) => ({ ad: dosyaAd(a.bas === a.son ? `sayfa_${a.bas}` : `${a.bas}-${a.son}`), sayfalar: a.sayfalar }));
    return { parcalar, params: { mod: 'aralik', araliklar: String(girdi.aralikMetni || '').trim() }, hata: null };
  }
  if (mod === 'herN') {
    const n = parseInt(girdi.n, 10);
    if (!(n >= 1)) return { parcalar: [], params: null, hata: 'Bölüm uzunluğu en az 1 olmalı.' };
    if (n >= toplam) return { parcalar: [], params: null, hata: `Belgede ${toplam} sayfa var; her ${n} sayfada bir ayırmak tek dosya üretir. Daha küçük bir sayı girin.` };
    const parcalar = [];
    for (let bas = 1, k = 1; bas <= toplam; bas += n, k++) {
      const sayfalar = [];
      for (let s = bas; s <= Math.min(bas + n - 1, toplam); s++) sayfalar.push(s);
      parcalar.push({ ad: dosyaAd(`bolum_${k}`), sayfalar });
    }
    return { parcalar, params: { mod: 'herN', n }, hata: null };
  }
  if (mod === 'secili') {
    const { sayfalar, hata } = sayfaListesiCoz(girdi.seciliMetni, toplam);
    if (hata) return { parcalar: [], params: null, hata };
    const gruplar = sayfaGruplari(sayfalar);
    const etiket = gruplar.length === 1 && gruplar[0][0] === gruplar[0][1] ? `sayfa_${gruplar[0][0]}` : aralikEtiketi(gruplar);
    return { parcalar: [{ ad: dosyaAd(etiket), sayfalar }], params: { mod: 'secili', sayfalar }, hata: null };
  }
  if (mod === 'tek') {
    const parcalar = [];
    for (let s = 1; s <= toplam; s++) parcalar.push({ ad: dosyaAd(`sayfa_${s}`), sayfalar: [s] });
    return { parcalar, params: { mod: 'tek' }, hata: null };
  }
  return { parcalar: [], params: null, hata: 'Bilinmeyen ayırma modu.' };
}

export class AyirPenceresi {
  constructor(baglam, belge) {
    this.baglam = baglam;
    this.belge = belge;
    this.toplam = belge.gorunum?.sayfaSayisi || belge.bilgi?.sayfa || 0;
    this.mod = 'aralik';
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
          <label><input type="radio" name="ayir-mod" value="aralik" checked> Sayfa aralıklarına göre <span class="soluk">(her aralık ayrı dosya)</span></label>
          <div class="ic"><input type="text" class="arac-girdi ayir-aralik" placeholder="örn. 1-3, 4-10, 11" style="width:260px" spellcheck="false" data-ilk-odak><span class="arac-aciklama">"-3" baştan 3'e, "8-" 8'den sona</span></div>
          <label><input type="radio" name="ayir-mod" value="herN"> Her <input type="number" class="arac-girdi kucuk ayir-n" min="1" max="${Math.max(1, this.toplam - 1)}" value="${Math.min(10, Math.max(1, this.toplam - 1))}" disabled> sayfada bir yeni dosya</label>
          <label><input type="radio" name="ayir-mod" value="secili"> Seçili sayfaları çıkart <span class="soluk">(tek dosya)</span></label>
          <div class="ic"><input type="text" class="arac-girdi ayir-secili" placeholder="örn. 2, 5, 7-9" style="width:260px" spellcheck="false" disabled></div>
          <label><input type="radio" name="ayir-mod" value="tek"> Her sayfayı ayrı dosyaya kaydet <span class="soluk">(${sayiMetni(this.toplam)} dosya)</span></label>
        </div>
      </div>
      <div class="arac-bolum ayir-cikti-alani">
        <div class="arac-bolum-baslik">Kaydet</div>
        <div class="ayir-onizleme"></div>
        <div class="arac-aciklama ayir-adlar">Dosya adları <b>${kacis(adGovdesi(b.yol))}_1-3.pdf</b> biçiminde verilir; var olan dosyaların üzerine yazılmaz, ada "(2)" eklenir.</div>
      </div>
      <div class="ayir-sonuc" hidden></div>
    </div>`);
    this.govde = govde;
    this.aralikEl = govde.querySelector('.ayir-aralik');
    this.nEl = govde.querySelector('.ayir-n');
    this.seciliEl = govde.querySelector('.ayir-secili');
    this.onizleme = govde.querySelector('.ayir-onizleme');
    this.adlarEl = govde.querySelector('.ayir-adlar');
    this.sonucEl = govde.querySelector('.ayir-sonuc');
    // Yeni belge: yalnızca klasör (adları çekirdek verir); üzerine yaz geri alınamaz (uyarı)
    this.kayit = kayitSecimi({ baglam: this.baglam, belge: b, klasorKipi: true, diyalogBasligi: 'Ayrılan dosyaların kaydedileceği klasör' });
    govde.querySelector('.ayir-cikti-alani .arac-bolum-baslik').after(this.kayit.el);
    this.kayit.onDegisti(() => this.onizle());

    for (const r of govde.querySelectorAll('input[name="ayir-mod"]')) {
      r.addEventListener('change', () => {
        this.mod = r.value;
        this.aralikEl.disabled = this.mod !== 'aralik';
        this.nEl.disabled = this.mod !== 'herN';
        this.seciliEl.disabled = this.mod !== 'secili';
        const odak = { aralik: this.aralikEl, herN: this.nEl, secili: this.seciliEl }[this.mod];
        if (odak) { odak.focus(); odak.select?.(); }
        this.onizle();
      });
    }
    for (const g of [this.aralikEl, this.nEl, this.seciliEl]) {
      g.addEventListener('input', () => this.onizle());
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.ayir(); } });
    }
    govde.addEventListener('keydown', (e) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && e.target.type === 'radio') e.stopPropagation(); });

    this.pencere = pencereAc({
      baslik: 'PDF ayır', govde, genislik: 660, anahtar: 'ayir', sinif: 'ayir-pencere',
      dugmeler: [{ id: 'ayir', etiket: 'Ayır', birincil: true, tiklama: () => this.ayir() }],
      kapatmadanOnce: () => this._kapatmaIzni(),
    });
    this.pencere.govde.append(this.ilerleme.el);   // gövdenin doğrudan çocuğu: meşgulken soluklaşmaz, İptal tıklanabilir
    this.pencere.el.addEventListener('esc', (e) => { if (this.ilerleme.calisiyor) { e.preventDefault(); this.ilerleme.iptalIste(); } });
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

  /** Seçilen moda göre parçaları hesaplar: {parcalar:[{ad, sayfalar}], params, hata} */
  parcalariHesapla() {
    return ayirParcalari({ mod: this.mod, aralikMetni: this.aralikEl.value, n: this.nEl.value, seciliMetni: this.seciliEl.value }, this.toplam, adGovdesi(this.belge.yol));
  }

  onizle() {
    const { parcalar, hata } = this.parcalariHesapla();
    // "Üzerine yaz" yalnızca tek dosya üreten ayırmada: seçili sayfalar ya da tek aralık (aralık yazılırken hatalıyken değişmez)
    this.kayit.uzerineKullanilabilir(this.mod === 'secili' || (this.mod === 'aralik' && (!!hata || parcalar.length === 1)), COKLU_DOSYA_NEDENI);
    const uzerine = this.kayit.uzerineMi();
    this.adlarEl.hidden = uzerine;
    const girdi = { aralik: this.aralikEl, secili: this.seciliEl, herN: this.nEl }[this.mod];
    for (const g of [this.aralikEl, this.seciliEl, this.nEl]) g.classList.remove('hatali');
    if (hata) {
      // Henüz bir şey yazılmamış kutu hata sayılmaz: yalnızca yol gösterilir
      const bos = girdi && girdi !== this.nEl && !girdi.value.trim();
      girdi?.classList.toggle('hatali', !bos);
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

  /** Ayırır; kilitli / salt okunur dosya sorusunda "Yeniden dene" ya da "Yeni belge olarak kaydet" seçilirse yeniden çalışır. */
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
    const { parcalar, params, hata } = this.parcalariHesapla();
    if (hata || !params) { this.onizle(); return false; }
    this.pencere.hataGoster('');
    this.sonucEl.hidden = true;
    const uzerine = this.kayit.uzerineMi();
    // Sayfa numaraları sekmedeki gibidir: sekmede kaydedilmemiş sayfa silme / sıralama varsa dosyadakilerle uyuşmaz, önce kaydedilmeli
    // (üzerine yazmada yanlış sayfalar geri alınamaz biçimde kalırdı)
    const secenek = numaralarDosyaylaAyni(belge) ? {} : { yalnizKaydet: true, neden: NUMARA_UYUSMAZ };
    if (uzerine) secenek.aciklama = 'Ayırma dosyadaki kayıtlı sürüm üzerinde çalışır; üzerine yazıldıktan sonra belge yeni haliyle yeniden açılır ve kaydedilmemiş değişiklikler atılır.';
    if ((await degisiklikleriSor(baglam, belge, 'Ayırma', secenek)) === 'vazgec') return false;
    if (this.pencere.kapali) return false;
    if (uzerine) return this._uzerineYaz(parcalar[0], params);
    await this.kayit.hazir;
    if (!this.klasor) {
      const k = await baglam.pdefe.cagir('dosya:klasorSec', { baslik: 'Ayrılan dosyaların kaydedileceği klasör' });
      if (!k || this.pencere.kapali) return false;
      this.kayit.cikti.ayarla(k);
    }
    // Aynı adlı dosya varsa çekirdek "(2)" ekler; kullanıcı bilsin
    const varOlanlar = [];
    for (const p of parcalar.slice(0, 200)) { if (await baglam.pdefe.cagir('dosya:varMi', yolBirlestir(this.klasor, p.ad))) varOlanlar.push(p.ad); }
    if (this.pencere.kapali) return false;
    if (varOlanlar.length) {
      const { secim } = await baglam.mesajKutusu({ mesaj: `${varOlanlar.length} dosya zaten var.`, ayrinti: varOlanlar.slice(0, 8).join('\n') + (varOlanlar.length > 8 ? `\nve ${varOlanlar.length - 8} dosya daha` : '') + '\n\nVar olanlar korunur; yeni dosyaların adına "(2)" eklenir. Devam edilsin mi?', dugmeler: ['Devam et', 'Vazgeç'], varsayilan: 0, iptal: 1 });
      if (secim !== 0 || this.pencere.kapali) return false;
    }
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('ayir', { devre: true });
    try {
      const sonuc = await this.ilerleme.calistir(baglam, 'ayir', { yol: belge.yol, hedefKlasor: this.klasor, ...params }, { baslangicMesaji: 'Ayrılıyor…' });
      await this.sonucGoster(this.dosyalariOku(sonuc, parcalar));
    } catch (e) {
      this.ilerleme.gizle();
      if (e.iptal) {
        baglam.bildir('Ayırma iptal edildi.');
        if (e.sonuc) await this.sonucGoster(this.dosyalariOku(e.sonuc, parcalar));
      } else this.pencere.hataGoster('Ayırma başarısız: ' + hataMetni(e));
    } finally {
      if (!this.pencere.kapali) {
        this.pencere.el.classList.remove('mesgul');
        this.pencere.dugmeAyarla('ayir', { devre: false });
      }
    }
    return false;
  }

  /**
   * Üzerine yaz: özgün dosyada yalnızca ayrılan sayfalar kalır (yedek yok, geri alınamaz; ada "(2)" eklenmez). Özgün dosya kilitli ya da
   * salt okunursa önceden sorulur (kayitSecimi.denetle / hataSor: Yeni belge olarak kaydet | Yeniden dene | Vazgeç); çekirdek de
   * yazamazsa dosya değişmez ve aynı soru sorulur. Başarıda pencere kapanır, açık sekme diskteki yeni haliyle yeniden açılır
   * (kaydedilmemiş değişiklik varsa ciktiyiAc önce sorar). Döner: yeniden denenecekse true.
   */
  async _uzerineYaz(parca, params) {
    const { baglam, belge } = this;
    const denetim = await this.kayit.denetle();
    if (this.pencere.kapali || denetim === 'vazgec') return false;
    if (denetim instanceof Error) return this.kayit.hataSor(denetim);
    const yol = belge.yol;
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('ayir', { devre: true });
    let kilit = null, sonuc = null;
    try {
      sonuc = await this.ilerleme.calistir(baglam, 'ayir', { yol, ...params, uzerine: true }, { baslangicMesaji: 'Ayrılıyor…' });
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
    this.sonucEl.innerHTML = `<div title="${kacis(this.klasor)}"><b>${dosyalar.length} dosya oluşturuldu</b> · toplam ${kacis(boyutMetni(toplam))}</div>
      <ul>${dosyalar.map((d, i) => `<li><a data-i="${i}" title="Yeni sekmede aç">${kacis(dosyaAdi(d.yol))}</a><span class="soluk">${d.sayfa ? d.sayfa + ' sayfa' : ''}</span><span class="boyut">${kacis(boyutMetni(d.boyut))}</span></li>`).join('')}</ul>
      <div class="arac-satir" style="margin-top:6px">
        <button class="ikincil ayir-goster">Klasörde göster</button>
        <button class="ikincil ayir-ilk-ac">İlkini yeni sekmede aç</button>
        <label><input type="checkbox" class="ayir-hepsi-ac"> Hepsini aç</label>
      </div>`;
    this.sonucEl.querySelector('.ayir-goster').addEventListener('click', () => baglam.pdefe.cagir('kabuk:klasordeGoster', dosyalar[0].yol));
    this.sonucEl.querySelectorAll('a[data-i]').forEach((a) => a.addEventListener('click', () => baglam.dosyaAc(dosyalar[+a.dataset.i].yol, { arkaPlanda: true })));
    this.sonucEl.querySelector('.ayir-ilk-ac').addEventListener('click', async () => {
      const hepsi = this.sonucEl.querySelector('.ayir-hepsi-ac').checked;
      await this.pencere.kapat('tamam');
      if (hepsi) { for (const d of dosyalar.slice(0, 50)) await baglam.dosyaAc(d.yol, { arkaPlanda: true }); if (dosyalar.length > 50) baglam.bildir('İlk 50 dosya açıldı.'); }
      else await baglam.dosyaAc(dosyalar[0].yol, { arkaPlanda: false });
    });
    baglam.bildir(`${dosyalar.length} dosya oluşturuldu.`);
  }
}

function kisaListe(sayfalar) {
  // 1,2,3,5,6 → "1-3, 5-6"
  return sayfaGruplari(sayfalar).map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(', ');
}

export function ayirAc(baglam) {
  const belge = baglam.aktif();
  if (!belge) { baglam.bildir('Önce bir PDF açın.'); return null; }
  if (pencereAcikMi('ayir')) return null;
  return new AyirPenceresi(baglam, belge);
}
