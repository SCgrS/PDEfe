# -*- coding: utf-8 -*-
"""notlar.js, uygulama.js ve panel.js: kaynak duyarlı notlar, sayfa tarifi komutu, yapısal kaydetme, bağlantılar."""

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:80])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

# ---------------------------------------------------------------- notlar.js
yama("src/renderer/notlar.js", [
("""import { CSS_BIRIM } from './goruntuleyici.js';""", """import { CSS_BIRIM, yolAnahtari } from './goruntuleyici.js';"""),
("""    this.g.addEventListener('sayfaCizildi', (e) => this.cizSayfa(e.detail.sayfa));""",
 """    this.g.addEventListener('sayfaCizildi', (e) => this.cizSayfa(e.detail.sayfa));
    this.g.addEventListener('sayfalar', () => this.sayfalarDegisti());"""),
# yükleme: kaynak
("""  async yukle() {
    let liste = [];
    try { liste = (await this.cekirdek('notlar', { yol: this.belge.yol })).notlar; } catch (e) { console.warn('Notlar okunamadı', e); }
    this.notlar.clear();
    const xrefIndex = new Map();
    for (const n of liste) {
      if (n.gizli || n.tur === 'Popup' || n.tur === 'Link' || n.tur === 'Widget') continue;
      const not = { ...n, id: yeniId(), yeni: false, silindi: false, yanitlar: [], ustId: null };
      this.notlar.set(not.id, not);
      xrefIndex.set(not.xref, not);
    }
    for (const not of this.notlar.values()) {
      if (not.yanitXref && xrefIndex.has(not.yanitXref)) { const ust = xrefIndex.get(not.yanitXref); ust.yanitlar.push(not.id); not.ustId = ust.id; }
    }
    this.kayitliAnlikGoruntu();
    this.yuklendi = true;
    this.hepsiniCiz();
    this.dispatchEvent(new CustomEvent('yuklendi'));
  }""",
 """  async yukle() {
    this.notlar.clear();
    await this.kaynakYukle(this.belge.yol);
    this.kayitliAnlikGoruntu();
    this.yuklendi = true;
    this.hepsiniCiz();
    this.dispatchEvent(new CustomEvent('yuklendi'));
  }

  /** Bir kaynak dosyanın notlarını modele ekler (başka PDF'ten sayfa eklenince de çağrılır). */
  async kaynakYukle(yol) {
    const k = yolAnahtari(yol);
    if (this.yuklenenKaynaklar?.has(k)) return;
    (this.yuklenenKaynaklar ||= new Set()).add(k);
    let liste = [];
    try { liste = (await this.cekirdek('notlar', { yol })).notlar; } catch (e) { console.warn('Notlar okunamadı', yol, e); return; }
    const xrefIndex = new Map();
    for (const n of liste) {
      if (n.gizli || n.tur === 'Popup' || n.tur === 'Link' || n.tur === 'Widget') continue;
      const not = { ...n, id: yeniId(), yeni: false, silindi: false, yanitlar: [], ustId: null, kaynak: { yol, sayfa: n.sayfa } };
      this.notlar.set(not.id, not);
      xrefIndex.set(not.xref, not);
    }
    for (const not of xrefIndex.values()) {
      if (not.yanitXref && xrefIndex.has(not.yanitXref)) { const ust = xrefIndex.get(not.yanitXref); ust.yanitlar.push(not.id); not.ustId = ust.id; }
    }
    this.sayfalarDegisti(false);
    if (this.yuklendi) { this.kayitliEkle(xrefIndex.values()); this.hepsiniCiz(); }
  }

  kayitliEkle(notlar) { for (const n of notlar) if (!n.silindi) this.kayitli.set(n.id, this.anlik(n)); }

  /** Sayfa listesi değişince (silme/sıralama/ekleme) notların konumlarını yeniden eşler. */
  sayfalarDegisti(ciz = true) {
    const konum = new Map();
    this.g.sayfalar.forEach((s, i) => { if (!s.bos) { const k = yolAnahtari(s.kaynak.yol) + '#' + s.kaynak.sayfa; if (!konum.has(k)) konum.set(k, i + 1); } });
    for (const n of this.notlar.values()) {
      if (!n.kaynak || n.kaynak.bos) continue;   // boş sayfaya eklenen notlar sayfa nesnesini izler (kaynakGirdi)
      const yeniSayfa = konum.get(yolAnahtari(n.kaynak.yol) + '#' + n.kaynak.sayfa);
      n.sayfaYok = !yeniSayfa;
      if (yeniSayfa) n.sayfa = yeniSayfa;
    }
    for (const n of this.notlar.values()) {
      if (n.kaynakGirdi) { const i = this.g.sayfalar.indexOf(n.kaynakGirdi); n.sayfaYok = i < 0; if (i >= 0) n.sayfa = i + 1; }
    }
    if (ciz) { this.balonKapat(); this.hepsiniCiz(); this.degisti(); }
  }

  /** Özgün dosya anlık kopyaya taşındığında not kaynaklarını yeniden adlandırır. */
  kaynakYeniden(eskiYol, yeniYol) {
    const ek = yolAnahtari(eskiYol);
    for (const n of this.notlar.values()) if (n.kaynak && n.kaynak.yol && yolAnahtari(n.kaynak.yol) === ek) n.kaynak = { ...n.kaynak, yol: yeniYol };
    if (this.yuklenenKaynaklar?.has(ek)) { this.yuklenenKaynaklar.delete(ek); this.yuklenenKaynaklar.add(yolAnahtari(yeniYol)); }
  }"""),
("""  anlik(not) {
    const { id, yeni, silindi, yanitlar, ustId, ...gerisi } = not;
    return JSON.stringify(gerisi);
  }""",
 """  anlik(not) {
    const { id, yeni, silindi, yanitlar, ustId, kaynak, kaynakGirdi, sayfaYok, sayfa, ...gerisi } = not;
    return JSON.stringify(gerisi);
  }"""),
("""  liste() {
    return [...this.notlar.values()].filter((n) => !n.silindi && !n.ustId).sort((a, b) => a.sayfa - b.sayfa || a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
  }""",
 """  liste() {
    return [...this.notlar.values()].filter((n) => !n.silindi && !n.ustId && !n.sayfaYok).sort((a, b) => a.sayfa - b.sayfa || a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
  }"""),
# fark: kaynak bilgisi; yapısal modda konumsal eşleme için
("""  fark() {
    const ops = [];
    const sirali = [...this.notlar.values()].sort((a, b) => (a.ustId ? 1 : 0) - (b.ustId ? 1 : 0));   // önce üstler, sonra yanıtlar
    for (const n of sirali) {
      const kay = this.kayitli.get(n.id);
      const not = this.disaAktar(n);
      if (!kay && !n.silindi) ops.push({ islem: 'ekle', id: n.id, not });
      else if (kay && n.silindi) ops.push({ islem: 'sil', id: n.id, not: { xref: n.xref, sayfa: n.sayfa } });
      else if (kay && this.anlik(n) !== kay) ops.push({ islem: 'guncelle', id: n.id, not });
    }
    return ops;
  }""",
 """  fark() {
    const ops = [];
    const sirali = [...this.notlar.values()].sort((a, b) => (a.ustId ? 1 : 0) - (b.ustId ? 1 : 0));   // önce üstler, sonra yanıtlar
    for (const n of sirali) {
      const kay = this.kayitli.get(n.id);
      const not = this.disaAktar(n);
      const kaynak = n.kaynak && n.kaynak.yol ? { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa } : null;
      if (!kay && !n.silindi) { if (!n.sayfaYok) ops.push({ islem: 'ekle', id: n.id, not }); }
      else if (kay && n.silindi) ops.push({ islem: 'sil', id: n.id, xref: n.xref, kaynak, not: { xref: n.xref, sayfa: n.sayfa } });
      else if (kay && this.anlik(n) !== kay) { if (!n.sayfaYok) ops.push({ islem: 'guncelle', id: n.id, xref: n.xref, kaynak, not }); }
    }
    return ops;
  }"""),
("""    if (n.ustId) { const ust = this.notlar.get(n.ustId); if (ust) { if (ust.xref) d.yanitXref = ust.xref; d.yanitId = ust.id; } }
    return d;""",
 """    if (n.ustId) { const ust = this.notlar.get(n.ustId); if (ust) { if (ust.xref) d.yanitXref = ust.xref; d.yanitId = ust.id; if (ust.kaynak && ust.kaynak.yol) d.yanitKaynak = { yol: ust.kaynak.yol, sayfa: ust.kaynak.sayfa }; } }
    return d;"""),
# pixmap: kaynak yol/sayfa
("""        const r = await this.cekirdek('not_gorunum', { yol: this.belge.yol, sayfa: n.sayfa, xref: n.xref, olcek });""",
 """        if (!n.kaynak || !n.kaynak.yol) { el.classList.add('not-bilinmeyen'); return; }
        const r = await this.cekirdek('not_gorunum', { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa, xref: n.xref, olcek });"""),
("""      try { const r = await this.cekirdek('freetext_stil', { yol: this.belge.yol, sayfa: n.sayfa, xref: n.xref }); n.yazi = r.stil; if (!n.icerik) n.icerik = r.icerik; }""",
 """      try { const r = await this.cekirdek('freetext_stil', { yol: n.kaynak.yol, sayfa: n.kaynak.sayfa, xref: n.xref }); n.yazi = r.stil; if (!n.icerik) n.icerik = r.icerik; }"""),
# yeni notlara kaynak ata
("""  ekle(not) {
    not.id = not.id || yeniId(); not.yeni = true; not.silindi = false; not.yanitlar = not.yanitlar || []; not.ustId = not.ustId || null;""",
 """  ekle(not) {
    not.id = not.id || yeniId(); not.yeni = true; not.silindi = false; not.yanitlar = not.yanitlar || []; not.ustId = not.ustId || null;
    if (!not.kaynak) { const s = this.g.sayfalar[not.sayfa - 1]; if (s) { not.kaynak = s.bos ? { bos: true } : { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa }; not.kaynakGirdi = s; } }"""),
])

# ---------------------------------------------------------------- uygulama.js
yama("src/renderer/uygulama.js", [
("""import { KomutYigini } from './komutlar.js';""", """import { KomutYigini, Komut } from './komutlar.js';"""),
("""  const gorunum = new Goruntuleyici(el);""",
 """  const gorunum = new Goruntuleyici(el, { dosyaOku: async (y) => (await pdefe.cagir('dosya:oku', y)).veri, cekirdek });"""),
("""    await gorunum.yukle(veri, {
      duzen: ayar.varsayilanDuzen || 'surekli', kapakAyri: !!ayar.kapakAyri, zoomModu, olcek,""",
 """    await gorunum.yukle(veri, {
      yol, duzen: ayar.varsayilanDuzen || 'surekli', kapakAyri: !!ayar.kapakAyri, zoomModu, olcek,"""),
("""  gorunum.addEventListener('metinKatmani', (e) => arama.katmanCizildi(gorunum, e.detail.sayfa));
  metinOlaylariBagla(belge);""",
 """  gorunum.addEventListener('metinKatmani', (e) => arama.katmanCizildi(gorunum, e.detail.sayfa));
  gorunum.addEventListener('sayfalar', () => { arama.belgeUnut(gorunum); if (aktifId === id) { sayfaGoster(belge); panel.belgeAyarla(belge); } kirliGuncelle(belge); oturumKaydet(); });
  gorunum.addEventListener('baglanti', (e) => baglantiyaGit(belge, e.detail));
  metinOlaylariBagla(belge);"""),
("""function kirliGuncelle(b) {
  b.degisti = !!(b.yigin?.kirli || b.notlar?.kirli);""",
 """function kirliGuncelle(b) {
  b.degisti = !!(b.yigin?.kirli || b.gorunum.yapisalKirli() || (!b.gorunum.anlik && b.notlar?.kirli));"""),
# belgeKapat: anlık kopyayı sil
("""  cekirdek('belge_birak', { yol: b.yol }).catch(() => {});
  if (aktifId === id) {""",
 """  cekirdek('belge_birak', { yol: b.yol }).catch(() => {});
  if (b.gorunum.anlik) cekirdek('anlik_sil', { yol: b.gorunum.anlik }).catch(() => {});
  if (aktifId === id) {"""),
# belgeKaydet: yapısal yol
("""  const islemler = b.notlar ? b.notlar.fark() : [];
  b.kaydediliyor = true;
  durum.mesajYaz('Kaydediliyor…', 0);
  try {
    const r = await cekirdek('notlar_kaydet', { yol: b.yol, hedef, islemler, artimli: true });
    b.notlar?.kaydedildi(r.xrefler);
    b.yigin?.kaydedildi();
    b.boyut = r.boyut;""",
 """  const islemler = b.notlar ? b.notlar.fark() : [];
  const g = b.gorunum;
  const yapisal = g.yapisalKirli() || !!g.anlik;
  b.kaydediliyor = true;
  durum.mesajYaz('Kaydediliyor…', 0);
  try {
    let r;
    if (yapisal) {
      const anlikKlasor = (await pdefe.cagir('uygulama:veriKlasoru')) + '\\\\anlik';
      r = await cekirdek('yapisal_kaydet', { yol: b.yol, hedef, tarif: g.tarif(), anlikKlasor, anlik: g.anlik, islemler }, (i) => durum.mesajYaz(`Kaydediliyor… %${i.yuzde} ${i.mesaj || ''}`, 0));
      if (r.anlik && !g.anlik) { g.anlik = r.anlik; g.kaynakYeniden(b.yol, r.anlik); b.notlar?.kaynakYeniden(b.yol, r.anlik); }
      // Yapısal modda notların kayıtlı temeli anlık kopyadaki durumdur; yalnızca konumlar güncellenir
      g.yapisalKaydedildi();
      b.yigin?.kaydedildi();
      b.boyut = r.boyut;
    } else {
      r = await cekirdek('notlar_kaydet', { yol: b.yol, hedef, islemler, artimli: true });
      b.notlar?.kaydedildi(r.xrefler);
      b.yigin?.kaydedildi();
      b.boyut = r.boyut;
    }"""),
("""    durum.mesajYaz(sessiz ? 'Otomatik kaydedildi' : 'Kaydedildi' + (r.artimli ? '' : ' (tam yazım)'));""",
 """    durum.mesajYaz(sessiz ? 'Otomatik kaydedildi' : 'Kaydedildi' + (r.artimli ? '' : ' (tam yazım)'));
    cekirdek('belge_birak', { yol: b.yol }).catch(() => {});"""),
# sayfa tarifi komutu + bağlantı
("""// ---------------------------------------------------------------- komutlar
const komutlar = {""",
 """// ---------------------------------------------------------------- sayfa düzeni komutları
/** Tarifi geri alınabilir bir komut olarak uygular. tarif: [{kaynak:{yol,sayfa}, dondurme} | {kaynak:null, genislik, yukseklik}] */
async function sayfaTarifiUygula(b, tarif, ad = 'Sayfa düzenini uygula') {
  const g = b.gorunum;
  b.notlar?.duzenleyiciBitir(true);
  const eski = [...g.sayfalar];
  const yeni = await g.tarifHazirla(tarif);
  // Yeni kaynak dosyaların notlarını yükle
  for (const t of tarif) if (t.kaynak && t.kaynak.yol && yolAnahtari(t.kaynak.yol) !== yolAnahtari(b.yol) && (!g.anlik || yolAnahtari(t.kaynak.yol) !== yolAnahtari(g.anlik))) await b.notlar?.kaynakYukle(t.kaynak.yol);
  b.yigin.calistir(new Komut(ad, () => g.sayfalariAyarla(yeni), () => g.sayfalariAyarla(eski)));
}

/** Tek sayfa ya da tüm sayfaları kalıcı döndürme komutu. */
function sayfalariDondur(b, sayfalar, derece, ad = 'Sayfaları döndür') {
  const tarif = b.gorunum.tarif().map((t, i) => (!sayfalar || sayfalar.includes(i + 1) ? { ...t, dondurme: ((t.dondurme || 0) + derece + 360) % 360 } : t));
  return sayfaTarifiUygula(b, tarif, ad);
}

function baglantiyaGit(b, l) {
  const g = b.gorunum;
  if (l.uri) { pdefe.cagir('kabuk:disAc', l.uri); return; }
  if (l.sayfa) {
    // Bağlantının hedefi kaynak dosyadaki sayfa; geçerli konumunu bul
    const i = g.sayfalar.findIndex((s) => !s.bos && yolAnahtari(s.kaynak.yol) === yolAnahtari(l.kaynakYol) && s.kaynak.sayfa === l.sayfa);
    if (i >= 0) { g.sayfayaGit(i + 1, { y: l.y != null ? l.y : undefined }); g.kaydirici.focus(); }
    else bildir('Bağlantının hedef sayfası bu belgede yok.');
  }
}

// ---------------------------------------------------------------- komutlar
const komutlar = {"""),
("""  window.__pdefe = { belgeler, aktif, dosyaAc, belgeKapat, sekmeSec, komutCalistir, ayar: () => ayar, panel, sekmeler, arama, temizMetin };""",
 """  window.__pdefe = { belgeler, aktif, dosyaAc, belgeKapat, sekmeSec, komutCalistir, ayar: () => ayar, panel, sekmeler, arama, temizMetin, sayfaTarifiUygula, sayfalariDondur, belgeKaydet };"""),
("""import { Goruntuleyici } from './goruntuleyici.js';""", """import { Goruntuleyici, yolAnahtari } from './goruntuleyici.js';"""),
])

# ---------------------------------------------------------------- panel.js: kaynak duyarlı küçük resimler
yama("src/renderer/panel.js", [
("""      el.innerHTML = `<div class="bos" style="width:${genislik}px;height:${Math.round(genislik * oran)}px"></div><span class="no">${no}</span>`;""",
 """      const d = ((s.dondurme || 0) % 360 + 360) % 360;
      const gw = d % 180 === 0 ? genislik : Math.round(genislik / oran), gh = d % 180 === 0 ? Math.round(genislik * oran) : genislik;
      el.innerHTML = `<div class="bos" style="width:${gw}px;height:${gh}px"></div><span class="no">${no}</span>`;
      el.dataset.dondurme = String(d);"""),
("""  async kucukResimYukle(b, no, genislik, el, onbellek) {
    try {
      let src = onbellek.get(no);
      if (!src) {
        const r = await this.cekirdek('kucuk_resim', { yol: b.yol, sayfa: no, genislik: genislik * Math.min(2, window.devicePixelRatio || 1) });
        src = 'data:image/png;base64,' + r.png;
        onbellek.set(no, src);
      }
      if (!el.isConnected) return;
      const img = document.createElement('img');
      img.width = genislik; img.src = src; img.draggable = false;
      el.querySelector('.bos')?.replaceWith(img);
    } catch (e) { console.warn('Küçük resim alınamadı', no, e.message); }
  }""",
 """  async kucukResimYukle(b, no, genislik, el, onbellek) {
    try {
      const s = b.gorunum.sayfalar[no - 1];
      if (!s) return;
      if (s.bos) { el.querySelector('.bos')?.classList.add('bos-sayfa'); return; }
      const anahtar = (s.kaynak.yol + '#' + s.kaynak.sayfa).toLowerCase();
      let src = onbellek.get(anahtar);
      if (!src) {
        const r = await this.cekirdek('kucuk_resim', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, genislik: genislik * Math.min(2, window.devicePixelRatio || 1) });
        src = 'data:image/png;base64,' + r.png;
        onbellek.set(anahtar, src);
      }
      if (!el.isConnected) return;
      const d = +el.dataset.dondurme || 0;
      const img = document.createElement('img');
      img.src = src; img.draggable = false;
      if (d % 180 === 0) img.style.width = genislik + 'px'; else img.style.height = genislik + 'px';
      if (d) { img.style.transform = `rotate(${d}deg)`; const sarmal = document.createElement('div'); sarmal.className = 'donuk'; sarmal.style.width = el.querySelector('.bos').style.width; sarmal.style.height = el.querySelector('.bos').style.height; sarmal.append(img); el.querySelector('.bos')?.replaceWith(sarmal); }
      else el.querySelector('.bos')?.replaceWith(img);
    } catch (e) { console.warn('Küçük resim alınamadı', no, e.message); }
  }"""),
])

css = open("src/renderer/stil.css", encoding="utf-8").read()
css += """
.kucuk-resim .donuk { display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: var(--sayfa-golge); background: #fff; }
.kucuk-resim .bos.bos-sayfa { background: #fff; }
"""
open("src/renderer/stil.css", "w", encoding="utf-8").write(css)
print("stil.css")
