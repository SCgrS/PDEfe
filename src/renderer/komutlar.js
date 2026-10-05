// Evrensel geri al / yinele: komut deseni. Her sekmenin kendi yığını vardır.
// Her değişiklik bir Komut nesnesidir: {ad, uygula(), geriAl()}.
// Sekme başka pencereye taşınınca (0.1.19) geri al geçmişi de taşınır: işlevler taşınamadığından her komut kendisini yeniden kurmaya
// yeten bir tarif (tanim: { tur, … }) taşır; hedef pencere komutu tariften aynı kodla kurar (notlar.js komutIceri, uygulama.js).
// ayrinti (0.2.2, geri al listeleri: gecmisListesi.js): adın yanında gösterilen kısa bilgi, isteğe bağlı; not komutlarında notun sayfası
// ("s. 3"), döndürmede döndürülen sayfalar ("s. 3–4"), sayfa düzeninde farkın özeti ("1 sayfa silindi, sıra değişti"). Komut kurulurken
// yazılır, sonradan değişmez (işlemin yapıldığı andaki sayfa); sekme taşınınca tarifle birlikte taşınır. Geri al ipucu ve durum çubuğunun
// "Geri alındı: …" iletisi yalnızca adı kullanır (testler adı karşılaştırır).

export class Komut {
  constructor(ad, uygula, geriAl, tanim = null, ayrinti = '') { this.ad = ad; this._uygula = uygula; this._geriAl = geriAl; this.tanim = tanim; this.ayrinti = ayrinti || ''; }
  uygula() { return this._uygula(); }
  geriAl() { return this._geriAl(); }
}

/** Sayfa numaralarını kısa yazar (geri al listelerinin ayrıntısı): [3] → "s. 3", [2, 3, 4, 7] → "s. 2–4, 7"; dörtten çok parçada ilk üçü
 *  ve sayfa sayısı ("s. 1, 3, 5 … (9 sayfa)"). Numara yoksa ''. */
export function sayfaListesi(nolar) {
  const s = [...new Set(nolar)].filter(Number.isInteger).sort((a, b) => a - b);
  if (!s.length) return '';
  const parcalar = [];
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parcalar.push(j > i ? `${s[i]}–${s[j]}` : String(s[i]));
    i = j + 1;
  }
  return 's. ' + (parcalar.length > 4 ? `${parcalar.slice(0, 3).join(', ')} … (${s.length} sayfa)` : parcalar.join(', '));
}

/**
 * İki sayfa listesinin farkı (geri al listelerinin ayrıntısı). anahtar(x): sayfanın kimliği (aynı anahtar birden çok kez geçebilir; sırayla
 * eşlenir), dondurme(x): açısı. Döner: { silinen, eklenen, siraDegisti, dondurulen: yeni listedeki 1-tabanlı numaralar, yalnizDondurme }.
 * Sıra, iki listede de bulunan sayfaların göreli sırasıdır: silme ve ekleme tek başına sırayı değiştirmiş sayılmaz.
 */
export function sayfaFarki(eski, yeni, anahtar, dondurme) {
  const havuz = new Map();
  eski.forEach((x, i) => { const k = anahtar(x); if (!havuz.has(k)) havuz.set(k, []); havuz.get(k).push(i); });
  let eklenen = 0, onceki = -1, siraDegisti = false;
  const dondurulen = [];
  yeni.forEach((x, j) => {
    const i = havuz.get(anahtar(x))?.shift();
    if (i === undefined) { eklenen++; return; }
    if (i < onceki) siraDegisti = true;
    onceki = i;
    if ((dondurme(eski[i]) || 0) !== (dondurme(x) || 0)) dondurulen.push(j + 1);
  });
  let silinen = 0;
  for (const kalan of havuz.values()) silinen += kalan.length;
  return { silinen, eklenen, siraDegisti, dondurulen, yalnizDondurme: !silinen && !eklenen && !siraDegisti && dondurulen.length > 0 };
}

/** sayfaFarki'nın sözle özeti: "2 sayfa silindi, 1 sayfa eklendi, sıra değişti, 1 sayfa döndürüldü"; fark yoksa ''. */
export function sayfaFarkiOzeti(f) {
  const p = [];
  if (f.silinen) p.push(`${f.silinen} sayfa silindi`);
  if (f.eklenen) p.push(`${f.eklenen} sayfa eklendi`);
  if (f.siraDegisti) p.push('sıra değişti');
  if (f.dondurulen.length) p.push(`${f.dondurulen.length} sayfa döndürüldü`);
  return p.join(', ');
}

export class KomutYigini extends EventTarget {
  constructor() {
    super();
    this.yigin = [];
    this.konum = 0;          // sonraki yinelenecek komutun indeksi
    this.kayitKonumu = 0;    // dosyaya son yazılan durumun konumu
  }

  /** Komutu çalıştırır ve yığına ekler (yinele dalını keser). */
  calistir(komut) {
    komut.uygula();
    // Kaydedilen durum kesilecek yinele dalındaysa artık ulaşılamaz: belge temiz görünmemeli (-1 hiçbir konuma eşit değil)
    if (this.kayitKonumu > this.konum) this.kayitKonumu = -1;
    this.yigin.length = this.konum;
    this.yigin.push(komut);
    this.konum++;
    this.bildir();
    return komut;
  }

  geriAl() {
    if (this.konum === 0) return null;
    const k = this.yigin[--this.konum];
    k.geriAl();
    this.bildir();
    return k;
  }

  yinele() {
    if (this.konum >= this.yigin.length) return null;
    const k = this.yigin[this.konum++];
    k.uygula();
    this.bildir();
    return k;
  }

  get geriAlinacak() { return this.konum > 0 ? this.yigin[this.konum - 1] : null; }
  get yinelenecek() { return this.konum < this.yigin.length ? this.yigin[this.konum] : null; }
  get kirli() { return this.konum !== this.kayitKonumu; }

  /**
   * konum, komut: dosyaya yazılan durumun konumu ve o konumdaki son komut (geriAlinacak), kayıt başında alınır. Kayıt sürerken
   * geri alınıp yeni komut çalıştırıldıysa yığın kesilmiştir: o konumda başka komut (ya da hiç komut) vardır, durum dosyadakiyle
   * aynı değildir → kayıt konumu yok (-1, belge kirli kalır). Konum 0 her dalda özgün durumdur.
   */
  kaydedildi(konum = this.konum, komut = this.geriAlinacak) {
    this.kayitKonumu = konum >= 0 && konum <= this.yigin.length && (konum === 0 || this.yigin[konum - 1] === komut) ? konum : -1;
    this.bildir();
  }
  temizle() { this.yigin = []; this.konum = 0; this.kayitKonumu = 0; this.bildir(); }
  /** Yığını başka pencereden taşınan komutlarla kurar. Komutlar çalıştırılmaz: belge, komutların uygulanmış hâliyle gelir. */
  durumKoy(komutlar, konum, kayitKonumu) {
    this.yigin = komutlar;
    this.konum = Math.max(0, Math.min(konum, komutlar.length));
    this.kayitKonumu = Number.isInteger(kayitKonumu) ? kayitKonumu : -1;
    this.bildir();
  }
  bildir() { this.dispatchEvent(new CustomEvent('degisti')); }
}
