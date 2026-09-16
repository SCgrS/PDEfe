// PDF birleştir: gorselBirlestir.js'deki BirlestirmePenceresi'nin yalnızca PDF kabul eden hali.
// Liste (Dosya ekle / sürükle-bırak / Ctrl+V ile Gezgin'den kopyalanan PDF'ler), sıralama, ad/sayfa/boyut, çıktı adı/yeri.
import { pencereAcikMi } from './ortak.js';
import { BirlestirmePenceresi } from './gorselBirlestir.js';

export class BirlestirPenceresi extends BirlestirmePenceresi {
  constructor(baglam, { ilkDosyalar = [] } = {}) {
    super(baglam, { yalnizPdf: true, baslik: 'PDF birleştir', anahtar: 'birlestir', ilkDosyalar });
  }
}

/**
 * Pencereyi açar. Etkin belge varsa listeye ilk öğe olarak eklenir (kullanıcı çıkarabilir).
 * @param {object} baglam
 * @param {string[]} [ilkDosyalar] önceden eklenecek yollar (verilmezse etkin belge)
 */
export function birlestirAc(baglam, ilkDosyalar) {
  if (pencereAcikMi('birlestir')) return null;
  const dosyalar = Array.isArray(ilkDosyalar) ? ilkDosyalar : (baglam.aktif()?.yol ? [baglam.aktif().yol] : []);
  return new BirlestirPenceresi(baglam, { ilkDosyalar: dosyalar });
}
