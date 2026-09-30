// Evrensel geri al / yinele: komut deseni. Her sekmenin kendi yığını vardır.
// Her değişiklik bir Komut nesnesidir: {ad, uygula(), geriAl()}.
// Sekme başka pencereye taşınınca (0.1.19) geri al geçmişi de taşınır: işlevler taşınamadığından her komut kendisini yeniden kurmaya
// yeten bir tarif (tanim: { tur, … }) taşır; hedef pencere komutu tariften aynı kodla kurar (notlar.js komutIceri, uygulama.js).

export class Komut {
  constructor(ad, uygula, geriAl, tanim = null) { this.ad = ad; this._uygula = uygula; this._geriAl = geriAl; this.tanim = tanim; }
  uygula() { return this._uygula(); }
  geriAl() { return this._geriAl(); }
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
