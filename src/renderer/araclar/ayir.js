// PDF ayır: sayfa aralıklarına göre / her N sayfada bir / seçili sayfaları çıkart / her sayfa ayrı dosya.
// Parçalar JS'de hesaplanır; çekirdek: ayir {yol, klasor, parcalar:[{ad, sayfalar:[...]}]} (ilerlemeli) → {dosyalar:[{yol, boyut, sayfa}|yol]}.
import {
  pencereAc, pencereAcikMi, IslemIlerleme, boyutMetni, kacis, hataMetni, dosyaAdi, klasorAdi, adGovdesi, yolBirlestir,
  guvenliAd, sayfaListesiCoz, sayfaAraliklariCoz, degisiklikleriSor, oge,
} from './ortak.js';

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
          <div class="ic"><input type="text" class="arac-girdi ayir-aralik" placeholder="örn. 1-3, 4-10, 11" style="width:260px" data-ilk-odak></div>
          <label><input type="radio" name="ayir-mod" value="herN"> Her <input type="number" class="arac-girdi kucuk ayir-n" min="1" max="${Math.max(1, this.toplam)}" value="${Math.min(10, Math.max(1, this.toplam))}" disabled> sayfada bir yeni dosya</label>
          <label><input type="radio" name="ayir-mod" value="secili"> Seçili sayfaları çıkart <span class="soluk">(tek dosya)</span></label>
          <div class="ic"><input type="text" class="arac-girdi ayir-secili" placeholder="örn. 2, 5, 7-9" style="width:260px" disabled></div>
          <label><input type="radio" name="ayir-mod" value="hersayfa"> Her sayfayı ayrı dosyaya kaydet <span class="soluk">(${this.toplam} dosya)</span></label>
        </div>
      </div>
      <div class="arac-alan">
        <label class="arac-etiket" style="margin:0">Çıktı</label>
        <div class="arac-satir"><span style="width:80px">Klasör</span><div class="ayir-klasor" style="flex:1"><span class="yol ayir-klasor-yol"></span><button class="ikincil ayir-klasor-sec">Seç…</button></div></div>
        <div class="arac-satir"><span style="width:80px">Ad öneki</span><input type="text" class="arac-girdi ayir-onek" style="flex:1" spellcheck="false"></div>
        <div class="ayir-onizleme"></div>
      </div>
      <div class="ayir-sonuc" hidden></div>
    </div>`);
    this.govde = govde;
    this.aralikEl = govde.querySelector('.ayir-aralik');
    this.nEl = govde.querySelector('.ayir-n');
    this.seciliEl = govde.querySelector('.ayir-secili');
    this.onekEl = govde.querySelector('.ayir-onek');
    this.onizleme = govde.querySelector('.ayir-onizleme');
    this.sonucEl = govde.querySelector('.ayir-sonuc');
    this.klasorYol = govde.querySelector('.ayir-klasor-yol');
    this.onekEl.value = adGovdesi(b.yol);
    this.klasorYaz();
    govde.querySelector('.arac-alan:last-of-type').append(this.ilerleme.el);

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
    for (const g of [this.aralikEl, this.nEl, this.seciliEl, this.onekEl]) {
      g.addEventListener('input', () => this.onizle());
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.ayir(); } });
    }
    govde.querySelector('.ayir-klasor-sec').addEventListener('click', async () => {
      const k = await this.baglam.pdefe.cagir('dosya:klasorSec', { baslik: 'Çıktı klasörü', varsayilan: this.klasor });
      if (k) { this.klasor = k; this.klasorYaz(); this.onizle(); }
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

  /** Seçilen moda göre parçaları hesaplar: {parcalar:[{ad, sayfalar}], hata} */
  parcalariHesapla() {
    const toplam = this.toplam;
    const onek = guvenliAd(this.onekEl.value.trim() || adGovdesi(this.belge.yol));
    if (!toplam) return { parcalar: [], hata: 'Belgenin sayfa sayısı bilinmiyor.' };
    const pad = (n, gen) => String(n).padStart(gen, '0');
    if (this.mod === 'aralik') {
      const { araliklar, hata } = sayfaAraliklariCoz(this.aralikEl.value, toplam);
      if (hata) return { parcalar: [], hata };
      return { parcalar: araliklar.map((a) => ({ ad: `${onek}_s${a.bas}${a.son !== a.bas ? '-' + a.son : ''}.pdf`, sayfalar: a.sayfalar })), hata: null };
    }
    if (this.mod === 'herN') {
      const n = parseInt(this.nEl.value, 10);
      if (!(n >= 1)) return { parcalar: [], hata: 'Sayfa sayısı en az 1 olmalı.' };
      if (n >= toplam) return { parcalar: [], hata: `Belgede ${toplam} sayfa var; her ${n} sayfada bir ayırmak tek dosya üretir.` };
      const parcalar = [];
      const adet = Math.ceil(toplam / n);
      const gen = String(adet).length;
      for (let i = 0, k = 1; i < toplam; i += n, k++) {
        const sayfalar = [];
        for (let s = i + 1; s <= Math.min(i + n, toplam); s++) sayfalar.push(s);
        parcalar.push({ ad: `${onek}_${pad(k, gen)}.pdf`, sayfalar });
      }
      return { parcalar, hata: null };
    }
    if (this.mod === 'secili') {
      const { sayfalar, hata } = sayfaListesiCoz(this.seciliEl.value, toplam);
      if (hata) return { parcalar: [], hata };
      return { parcalar: [{ ad: `${onek}_secili.pdf`, sayfalar }], hata: null };
    }
    // her sayfa ayrı
    const gen = String(toplam).length;
    const parcalar = [];
    for (let s = 1; s <= toplam; s++) parcalar.push({ ad: `${onek}_s${pad(s, gen)}.pdf`, sayfalar: [s] });
    return { parcalar, hata: null };
  }

  onizle() {
    const { parcalar, hata } = this.parcalariHesapla();
    const girdi = { aralik: this.aralikEl, secili: this.seciliEl, herN: this.nEl }[this.mod];
    for (const g of [this.aralikEl, this.seciliEl, this.nEl]) g.classList.remove('hatali');
    if (hata) {
      girdi?.classList.add('hatali');
      this.onizleme.innerHTML = `<span style="color:#d13438">${kacis(hata)}</span>`;
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
    const { parcalar, hata } = this.parcalariHesapla();
    if (hata) { this.onizle(); return; }
    this.pencere.hataGoster('');
    this.sonucEl.hidden = true;
    if ((await degisiklikleriSor(baglam, belge, 'Ayırma')) === 'vazgec') return;
    if (this.pencere.kapali) return;
    // Var olan dosyalar
    const varOlanlar = [];
    for (const p of parcalar) { if (await baglam.pdefe.cagir('dosya:varMi', yolBirlestir(this.klasor, p.ad))) varOlanlar.push(p.ad); }
    if (varOlanlar.length) {
      const { secim } = await baglam.mesajKutusu({ mesaj: `${varOlanlar.length} dosya zaten var.`, ayrinti: varOlanlar.slice(0, 8).join('\n') + (varOlanlar.length > 8 ? '\n…' : '') + '\n\nÜzerine yazılsın mı?', dugmeler: ['Üzerine yaz', 'Vazgeç'], varsayilan: 1, iptal: 1 });
      if (secim !== 0) return;
    }
    this.pencere.el.classList.add('mesgul');
    this.pencere.dugmeAyarla('ayir', { devre: true });
    this.pencere.dugmeAyarla('kapat', { devre: true });
    try {
      const sonuc = await this.ilerleme.calistir(baglam, 'ayir', { yol: belge.yol, klasor: this.klasor, parcalar, mod: this.mod }, { baslangicMesaji: 'Ayrılıyor…' });
      await this.sonucGoster(this.dosyalariOku(sonuc, parcalar));
    } catch (e) {
      this.ilerleme.gizle();
      if (e.iptal) {
        baglam.bildir('Ayırma iptal edildi.');
        if (e.sonuc) await this.sonucGoster(this.dosyalariOku(e.sonuc, parcalar));
      } else this.pencere.hataGoster('Ayırma başarısız: ' + hataMetni(e));
    } finally {
      this.pencere.el.classList.remove('mesgul');
      this.pencere.dugmeAyarla('ayir', { devre: false });
      this.pencere.dugmeAyarla('kapat', { devre: false });
    }
  }

  /** Çekirdek sonucunu {yol, boyut, sayfa} listesine çevirir (dize listesi de kabul edilir). */
  dosyalariOku(sonuc, parcalar) {
    const ham = sonuc?.dosyalar || sonuc?.sonuclar || [];
    return ham.map((d, i) => (typeof d === 'string' ? { yol: d, boyut: null, sayfa: parcalar[i]?.sayfalar.length } : { yol: d.yol, boyut: d.boyut ?? null, sayfa: d.sayfa ?? parcalar[i]?.sayfalar.length }));
  }

  async sonucGoster(dosyalar) {
    const { baglam } = this;
    this.ilerleme.gizle();
    this.sonucEl.hidden = false;
    this.sonucEl.className = 'ayir-sonuc arac-basari arac-sonuc-liste';
    if (!dosyalar.length) { this.sonucEl.className = 'ayir-sonuc arac-uyari'; this.sonucEl.textContent = 'Hiç dosya oluşmadı.'; return; }
    // Boyutu gelmeyenleri sor
    for (const d of dosyalar) if (d.boyut == null) { try { const b = await baglam.pdefe.cagir('dosya:bilgi', d.yol); if (b?.var) d.boyut = b.boyut; } catch { /* yok say */ } }
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
  const p = [];
  let bas = sayfalar[0], son = sayfalar[0];
  for (let i = 1; i <= sayfalar.length; i++) {
    if (i < sayfalar.length && sayfalar[i] === son + 1) { son = sayfalar[i]; continue; }
    p.push(bas === son ? String(bas) : `${bas}-${son}`);
    bas = son = sayfalar[i];
  }
  return p.join(', ');
}

export function ayirAc(baglam) {
  const belge = baglam.aktif();
  if (!belge) { baglam.bildir('Önce bir PDF açın.'); return null; }
  if (pencereAcikMi('ayir')) return null;
  return new AyirPenceresi(baglam, belge);
}
