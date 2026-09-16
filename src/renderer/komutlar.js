// Evrensel geri al / yinele: komut deseni. Her sekmenin kendi yığını vardır.
// Her değişiklik bir Komut nesnesidir: {ad, uygula(), geriAl()}.

export class Komut {
  constructor(ad, uygula, geriAl) { this.ad = ad; this._uygula = uygula; this._geriAl = geriAl; }
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

  kaydedildi() { this.kayitKonumu = this.konum; this.bildir(); }
  temizle() { this.yigin = []; this.konum = 0; this.kayitKonumu = 0; this.bildir(); }
  bildir() { this.dispatchEvent(new CustomEvent('degisti')); }
}
