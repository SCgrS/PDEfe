// Durum çubuğu: sayfa X / Y, yakınlaştırma, dosya boyutu, kaydedilmemiş değişiklik.

export class DurumCubugu {
  constructor({ sayfaKutusu, sayfaToplam, zoom, boyut, degisiklik, mesaj, onSayfayaGit }) {
    this.sayfaKutusu = sayfaKutusu; this.sayfaToplam = sayfaToplam; this.zoom = zoom;
    this.boyut = boyut; this.degisiklik = degisiklik; this.mesaj = mesaj;
    this._mesajZaman = null;
    sayfaKutusu.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { onSayfayaGit(parseInt(sayfaKutusu.value, 10)); sayfaKutusu.blur(); }
      if (e.key === 'Escape') sayfaKutusu.blur();
    });
    sayfaKutusu.addEventListener('focus', () => sayfaKutusu.select());
  }

  sayfa(no, toplam) {
    if (document.activeElement !== this.sayfaKutusu) this.sayfaKutusu.value = toplam ? String(no) : '';
    this.sayfaToplam.textContent = String(toplam || 0);
  }

  zoomYaz(olcek) { this.zoom.textContent = '%' + Math.round(olcek * 100); }

  boyutYaz(bayt) {
    if (bayt == null) { this.boyut.textContent = ''; return; }
    this.boyut.textContent = boyutMetni(bayt);
  }

  degisiklikYaz(var_) { this.degisiklik.hidden = !var_; }

  mesajYaz(metin, sure = 4000) {
    this.mesaj.textContent = metin || '';
    clearTimeout(this._mesajZaman);
    if (metin && sure) this._mesajZaman = setTimeout(() => { this.mesaj.textContent = ''; }, sure);
  }
}

export function boyutMetni(bayt) {
  if (bayt < 1024) return bayt + ' B';
  if (bayt < 1024 * 1024) return (bayt / 1024).toFixed(0) + ' KB';
  return (bayt / (1024 * 1024)).toFixed(2).replace('.', ',') + ' MB';
}
