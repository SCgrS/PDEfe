// PDF ayır: sayfa aralıklarına göre / her N sayfada bir / seçili sayfaları çıkart / her sayfayı ayrı dosyaya.
// Çekirdek (core/islemler/araclar.py y_ayir):
//   ayir {yol, hedefKlasor, mod:'aralik'|'herN'|'secili'|'tek', araliklar:"1-3, 5", n, sayfalar:[...]} (ilerlemeli)
//   → {dosyalar:[yol, ...]}
// Dosya adlarını çekirdek belirler: <ad>_<etiket>.pdf; var olan ad üzerine yazılmaz, "(2)", "(3)" eklenir.
// Bu pencere aynı adlandırma kuralını (ayirParcalari) önizleme için burada da uygular.
import {
  pencereAc, pencereAcikMi, IslemIlerleme, boyutMetni, kacis, hataMetni, dosyaAdi, klasorAdi, adGovdesi, yolBirlestir,
  guvenliAd, sayfaListesiCoz, sayfaAraliklariCoz, degisiklikleriSor, oge,
} from './ortak.js';

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
    const ayar = baglam.ayar?.() || {};
    this.klasor = ayar.ciktiKlasoru || klasorAdi(belge.yol);
    this.ilerleme = new IslemIlerleme();
    this._kur();
  }

  _kur() {
    const b = this.belge;
    const govde = oge(`<div class="ayir-govde">
      <div class="arac-bilgi"><b>${kacis(b.ad)}</b> · ${this.toplam} sayfa · ${kacis(boyutMetni(b.boyut))}</div>
      <div class="arac-alan">
        <span class="arac-etiket" style="margin:0">Nasıl ayrılsın?</span>
        <div class="arac-secenek-liste">
          <label><input type="radio" name="ayir-mod" value="aralik" checked> Sayfa aralıklarına göre <span class="soluk">(her aralık ayrı dosya)</span></label>
          <div class="ic"><input type="text" class="arac-girdi ayir-aralik" placeholder="örn. 1-3, 4-10, 11" style="width:260px" data-ilk-odak><span class="arac-aciklama">"-3" baştan 3'e, "8-" 8'den sona</span></div>
          <label><input type="radio" name="ayir-mod" value="herN"> Her <input type="number" class="arac-girdi kucuk ayir-n" min="1" max="${Math.max(1, this.toplam - 1)}" value="${Math.min(10, Math.max(1, this.toplam - 1))}" disabled> sayfada bir yeni dosya</label>
          <label><input type="radio" name="ayir-mod" value="secili"> Seçili sayfaları çıkart <span class="soluk">(tek dosya)</span></label>
          <div class="ic"><input type="text" class="arac-girdi ayir-secili" placeholder="örn. 2, 5, 7-9" style="width:260px" disabled></div>
          <label><input type="radio" name="ayir-mod" value="tek"> Her sayfayı ayrı dosyaya kaydet <span class="soluk">(${this.toplam} dosya)</span></label>
        </div>
      </div>
      <div class="arac-alan ayir-cikti-alani">
        <label class="arac-etiket" style="margin:0">Çıktı</label>
        <div class="arac-satir"><span style="width:80px">Klasör</span><div class="ayir-klasor" style="flex:1"><span class="yol ayir-klasor-yol"></span><button class="ikincil ayir-klasor-sec">Seç…</button></div></div>
        <div class="ayir-onizleme"></div>
        <div class="arac-aciklama">Dosya adları <b>${kacis(adGovdesi(b.yol))}_…pdf</b> biçiminde verilir; var olan dosyaların üzerine yazılmaz, ada "(2)" eklenir.</div>
      </div>
      <div class="ayir-sonuc" hidden></div>
    </div>`);
    this.govde = govde;
    this.aralikEl = govde.querySelector('.ayir-aralik');
    this.nEl = govde.querySelector('.ayir-n');
    this.seciliEl = govde.querySelector('.ayir-secili');
    this.onizleme = govde.querySelector('.ayir-onizleme');
    this.sonucEl = govde.querySelector('.ayir-sonuc');
    this.klasorYol = govde.querySelector('.ayir-klasor-yol');
    this.klasorYaz();
    govde.querySelector('.ayir-cikti-alani').append(this.ilerleme.el);

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
    govde.querySelector('.ayir-klasor-sec').addEventListener('click', async () => {
      const k = await this.baglam.pdefe.cagir('dosya:klasorSec', { baslik: 'Çıktı klasörü', varsayilan: this.klasor });
      if (k && !this.pencere.kapali) { this.klasor = k; this.klasorYaz(); this.onizle(); }
    });
    govde.addEventListener('keydown', (e) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && e.target.type === 'radio') e.stopPropagation(); });

    this.pencere = pencereAc({
      baslik: 'PDF ayır', govde, genislik: 660, anahtar: 'ayir', sinif: 'ayir-pencere',
      dugmeler: [
        { id: 'ayir', etiket: 'Ayır', birincil: true, tiklama: () => this.ayir() },
        { id: 'kapat', etiket: 'Kapat' },
      ],
      kapatmadanOnce: () => this._kapatmaIzni(),
    });
    this.pencere.el.addEventListener('esc', (e) => { if (this.ilerleme.calisiyor) { e.preventDefault(); this.ilerleme.iptalIste(); } });
    this.onizle();
  }

  async _kapatmaIzni() {
    if (!this.ilerleme.calisiyor) return true;
    const { secim } = await this.baglam.mesajKutusu({ mesaj: 'Ayırma sürüyor.', ayrinti: 'Pencereyi kapatırsanız işlem iptal edilir; oluşmuş dosyalar kalır.', dugmeler: ['İptal et ve kapat', 'Sürdür'], varsayilan: 1, iptal: 1 });
    if (secim !== 0) return false;
    this.ilerleme.iptalIste();
    return true;
  }

  klasorYaz() { this.klasorYol.textContent = this.klasor; this.klasorYol.title = this.klasor; }

  /** Seçilen moda göre parçaları hesaplar: {parcalar:[{ad, sayfalar}], params, hata} */
  parcalariHesapla() {
    return ayirParcalari({ mod: this.mod, aralikMetni: this.aralikEl.value, n: this.nEl.value, seciliMetni: this.seciliEl.value }, this.toplam, adGovdesi(this.belge.yol));
  }

  onizle() {
    const { parcalar, hata } = this.parcalariHesapla();
    const girdi = { aralik: this.aralikEl, secili: this.seciliEl, herN: this.nEl }[this.mod];
    for (const g of [this.aralikEl, this.seciliEl, this.nEl]) g.classList.remove('hatali');
    if (hata) {
      girdi?.classList.add('hatali');
      this.onizleme.innerHTML = `<span class="hata-metin">${kacis(hata)}</span>`;
      this.pencere?.dugmeAyarla('ayir', { devre: true });
      return;
    }
    const enFazla = 12;
    const satirlar = parcalar.slice(0, enFazla).map((p) => `<li>${kacis(p.ad)} <span class="soluk">(${p.sayfalar.length} sayfa${p.sayfalar.length <= 12 ? ': ' + kacis(kisaListe(p.sayfalar)) : ''})</span></li>`);
    if (parcalar.length > enFazla) satirlar.push(`<li>… ve ${parcalar.length - enFazla} dosya daha</li>`);
    this.onizleme.innerHTML = `<b>${parcalar.length} dosya</b> oluşturulacak:<ul>${satirlar.join('')}</ul>`;
    this.pencere?.dugmeAyarla('ayir', { devre: false });
  }

  async ayir() {
    const { baglam, belge } = this;
    if (this.ilerleme.calisiyor) return;
    const { parcalar, params, hata } = this.parcalariHesapla();
    if (hata || !params) { this.onizle(); return; }
    this.pencere.hataGoster('');
    this.sonucEl.hidden = true;
    if ((await degisiklikleriSor(baglam, belge, 'Ayırma')) === 'vazgec') return;
    if (this.pencere.kapali) return;
    if (!this.klasor) {
      const k = await baglam.pdefe.cagir('dosya:klasorSec', { baslik: 'Çıktı klasörü' });
      if (!k || this.pencere.kapali) return;
      this.klasor = k; this.klasorYaz();
    }
    // Aynı adlı dosya varsa çekirdek "(2)" ekler; kullanıcı bilsin
    const varOlanlar = [];
    for (const p of parcalar.slice(0, 200)) { if (await baglam.pdefe.cagir('dosya:varMi', yolBirlestir(this.klasor, p.ad))) varOlanlar.push(p.ad); }
    if (this.pencere.kapali) return;
    if (varOlanlar.length) {
      const { secim } = await baglam.mesajKutusu({ mesaj: `${varOlanlar.length} dosya zaten var.`, ayrinti: varOlanlar.slice(0, 8).join('\n') + (varOlanlar.length > 8 ? '\n…' : '') + '\n\nVar olanlar korunur; yeni dosyaların adına "(2)" eklenir. Devam edilsin mi?', dugmeler: ['Devam et', 'Vazgeç'], varsayilan: 0, iptal: 1 });
      if (secim !== 0 || this.pencere.kapali) return;
    }
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('ayir', { devre: true });
    this.pencere.dugmeAyarla('kapat', { devre: true });
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
        this.pencere.dugmeAyarla('kapat', { devre: false });
      }
    }
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
    this.sonucEl.innerHTML = `<div><b>${dosyalar.length} dosya oluşturuldu</b> · toplam ${kacis(boyutMetni(toplam))}</div>
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
