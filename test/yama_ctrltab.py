# -*- coding: utf-8 -*-
"""Ctrl+Tab: kısa basışta seçici görünmeden en son kullanılan sekmeye geçilir; basılı tutulunca (~220 ms) seçici açılır."""

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:80])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

yama("src/renderer/sekmeler.js", [
("""    this.secici.hidden = false;
  }

  seciciIlerle(yon) {""",
 """    // Kısa basışta (Ctrl hemen bırakılırsa) seçici hiç görünmesin
    this.secici.hidden = true;
    clearTimeout(this._seciciZaman);
    this._seciciZaman = setTimeout(() => { if (this.seciciAcik) this.secici.hidden = false; }, 220);
  }

  seciciIlerle(yon) {"""),
("""  seciciKapat(secilenId = null) {
    if (!this.seciciAcik) return;""",
 """  seciciKapat(secilenId = null) {
    if (!this.seciciAcik) return;
    clearTimeout(this._seciciZaman);"""),
("""    this.seciciIdx = (this.seciciIdx + yon + adaylar.length) % adaylar.length;
    adaylar.forEach((a, k) => a.classList.toggle('secili', k === this.seciciIdx));""",
 """    this.seciciIdx = (this.seciciIdx + yon + adaylar.length) % adaylar.length;
    this.secici.hidden = false;   // ikinci basışta hemen göster
    adaylar.forEach((a, k) => a.classList.toggle('secili', k === this.seciciIdx));"""),
])
