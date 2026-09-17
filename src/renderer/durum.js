// Durum çubuğu: sayfa X / Y, yakınlaştırma, dosya boyutu, kaydedilmemiş değişiklik.

export class DurumCubugu {
  constructor({ sayfaKutusu, sayfaToplam, zoom, boyut, degisiklik, mesaj, onSayfayaGit, onBirak }) {
    this.sayfaKutusu = sayfaKutusu; this.sayfaToplam = sayfaToplam; this.zoom = zoom;
    this.boyut = boyut; this.degisiklik = degisiklik; this.mesaj = mesaj;
    this._mesajZaman = null;
    this._no = 0; this._toplam = 0;
    sayfaKutusuBagla(sayfaKutusu, { gecerli: () => (this._toplam ? String(this._no) : ''), git: onSayfayaGit, birak: onBirak });
  }

  sayfa(no, toplam) {
    this._no = no; this._toplam = toplam || 0;
    sayfaKutusuYaz(this.sayfaKutusu, toplam ? String(no) : '');
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

/**
 * Sayfa numarası kutusu (araç çubuğu ve durum çubuğu): her zaman geçerli sayfayı gösterir; yalnızca kullanıcı odaklanıp
 * gerçekten yazmaya başladıysa (input) üzerine yazılmaz. Enter sayfaya gider; Esc ve odak kaybı geçerli sayfaya döndürür.
 * gecerli() → gösterilecek metin; git(no) → sayfaya git; birak() → odağı belgeye ver (isteğe bağlı).
 */
export function sayfaKutusuBagla(kutu, { gecerli, git, birak }) {
  kutu.yaziliyor = false;
  const geriDon = () => { kutu.yaziliyor = false; sayfaKutusuYaz(kutu, gecerli()); };
  kutu.addEventListener('focus', () => { kutu.yaziliyor = false; kutu.select(); });
  kutu.addEventListener('input', () => { kutu.yaziliyor = true; });
  kutu.addEventListener('blur', geriDon);
  kutu.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const no = parseInt(kutu.value, 10); kutu.yaziliyor = false; if (!Number.isNaN(no)) git?.(no); kutu.blur(); birak?.(); }
    else if (e.key === 'Escape') { geriDon(); kutu.blur(); birak?.(); }
  });
}

/** Kutuya geçerli sayfayı yazar; kullanıcı yazıyorsa dokunmaz. Kutunun tamamı seçiliyse seçimi korur (yazınca yerine geçsin). */
export function sayfaKutusuYaz(kutu, deger) {
  if (kutu.yaziliyor || kutu.value === deger) return;
  const tumuSecili = document.activeElement === kutu && kutu.selectionStart === 0 && kutu.selectionEnd === kutu.value.length;
  kutu.value = deger;
  if (tumuSecili) kutu.select();
}

export function boyutMetni(bayt) {
  if (bayt < 1024) return bayt + ' B';
  if (bayt < 1024 * 1024) return (bayt / 1024).toFixed(0) + ' KB';
  return (bayt / (1024 * 1024)).toFixed(2).replace('.', ',') + ' MB';
}
