# -*- coding: utf-8 -*-
"""uygulama.js, panel.js, main.js, menu.js, ayarlar.js, index.html ve stil.css'e not katmanı entegrasyonunu işler."""
import re

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:70])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

# ---------------------------------------------------------------- uygulama.js
yama("src/renderer/uygulama.js", [
("""import { temizMetin, hamMetin, secimDikdortgenleri, satirlaraBirlestir, paragrafSec, secimHamMetni, secimYapiliMetni } from './metin.js';""",
 """import { temizMetin, hamMetin, secimDikdortgenleri, satirlaraBirlestir, paragrafSec, secimHamMetni, secimYapiliMetni } from './metin.js';
import { NotYoneticisi, VURGU_RENKLERI } from './notlar.js';
import { KomutYigini } from './komutlar.js';"""),

("""  gorunum.addEventListener('metinKatmani', (e) => arama.katmanCizildi(gorunum, e.detail.sayfa));
  metinOlaylariBagla(belge);
""",
 """  gorunum.addEventListener('metinKatmani', (e) => arama.katmanCizildi(gorunum, e.detail.sayfa));
  metinOlaylariBagla(belge);
  belge.yigin = new KomutYigini();
  belge.notlar = new NotYoneticisi({ belge, cekirdek, ayar: () => ayar, yigin: belge.yigin, alan: $('#belge-alani') });
  belge.yigin.addEventListener('degisti', () => kirliGuncelle(belge));
  belge.notlar.addEventListener('degisti', () => { kirliGuncelle(belge); if (aktifId === id) panel.yorumlariYenile(); });
  belge.notlar.addEventListener('arac', (e) => { if (aktifId === id) aracDugmeleriniGuncelle(e.detail.arac); });
"""),

("""    cekirdek('belge_bilgi', { yol }).then((bilgi) => { belge.bilgi = bilgi; }).catch(() => {});
  } catch (e) {""",
 """    cekirdek('belge_bilgi', { yol }).then((bilgi) => { belge.bilgi = bilgi; }).catch(() => {});
    belge.notlar.yukle().catch((e2) => console.warn('Notlar yüklenemedi', e2));
  } catch (e) {"""),

("""function sekmeSec(id) {
  const b = belgeler.get(id);
  if (!b) return;
  if (aktifId && aktifId !== id) {
    const eski = belgeler.get(aktifId);
    if (eski) eski.el.hidden = true;
  }
  aktifId = id;
  b.el.hidden = false;
  sekmeler.aktifYap(id);
  sayfaGoster(b); zoomGoster(b);
  durum.boyutYaz(b.boyut); durum.degisiklikYaz(b.degisti);
  $('#dugme-geri-al').disabled = true; $('#dugme-yinele').disabled = true;
  pdefe.cagir('pencere:baslik', b.ad);
  panel.belgeAyarla(b);
  b.gorunum.boyutDegisti();
  b.gorunum.kaydirici.focus({ preventScroll: true });
  oturumKaydet();
}""",
 """let sekmeSoruAcik = false;
async function sekmeSec(id, secenek = {}) {
  const b = belgeler.get(id);
  if (!b || sekmeSoruAcik) return;
  if (aktifId && aktifId !== id) {
    const eski = belgeler.get(aktifId);
    if (eski) {
      // Ayrılınan sekmede kaydedilmemiş değişiklik varsa sor (ayar açıksa ve bu belge için susturulmadıysa)
      if (eski.degisti && ayar.sekmeDegisimindeSor !== false && !eski.sorma && !secenek.sorma) {
        sekmeSoruAcik = true;
        const { secim, onay } = await mesajKutusu({ mesaj: `"${eski.ad}" belgesinde kaydedilmemiş değişiklikler var.`, ayrinti: 'Değişiklikleri kaydetmek ister misiniz? "Kaydetme" seçerseniz değişiklikler sekmede kalır, yalnızca dosyaya yazılmaz.', dugmeler: ['Kaydet', 'Kaydetme', 'Vazgeç'], varsayilan: 0, iptal: 2, onayKutusu: 'Bu belge için bir daha sorma' });
        sekmeSoruAcik = false;
        if (onay) eski.sorma = true;
        if (secim === 2) return;
        if (secim === 0) await belgeKaydet(eski);
      }
      eski.notlar?.balonKapat(); eski.notlar?.duzenleyiciBitir(true);
      eski.el.hidden = true;
    }
  }
  aktifId = id;
  b.el.hidden = false;
  sekmeler.aktifYap(id);
  sayfaGoster(b); zoomGoster(b);
  durum.boyutYaz(b.boyut); durum.degisiklikYaz(b.degisti);
  geriAlDugmeleriniGuncelle(b);
  aracDugmeleriniGuncelle(b.notlar?.arac || null);
  pdefe.cagir('pencere:baslik', b.ad);
  panel.belgeAyarla(b);
  b.gorunum.boyutDegisti();
  b.gorunum.kaydirici.focus({ preventScroll: true });
  oturumKaydet();
}

function kirliGuncelle(b) {
  b.degisti = !!(b.yigin?.kirli || b.notlar?.kirli);
  sekmeler.guncelle(b.id, { degisti: b.degisti });
  if (aktifId === b.id) { durum.degisiklikYaz(b.degisti); geriAlDugmeleriniGuncelle(b); }
  $('#arac-cubugu [data-komut="dosya.kaydet"]').disabled = !aktif()?.degisti;
  if (ayar.otomatikKaydet && b.degisti) { clearTimeout(b._otoKayit); b._otoKayit = setTimeout(() => { if (b.degisti && belgeler.has(b.id)) belgeKaydet(b, false, true); }, 1500); }
}

function geriAlDugmeleriniGuncelle(b) {
  const g = $('#dugme-geri-al'), y = $('#dugme-yinele');
  const ga = b?.yigin?.geriAlinacak, yi = b?.yigin?.yinelenecek;
  g.disabled = !ga; y.disabled = !yi;
  g.title = ga ? `Geri al: ${ga.ad} (Ctrl+Z)` : 'Geri al (Ctrl+Z)';
  y.title = yi ? `Yinele: ${yi.ad} (Ctrl+Y)` : 'Yinele (Ctrl+Y)';
}

function aracDugmeleriniGuncelle(arac) {
  document.querySelectorAll('#not-araclari [data-arac]').forEach((el) => el.classList.toggle('secili', el.dataset.arac === arac));
}"""),

("""  sayfaKonumuKaydet(b, true);
  belgeler.delete(id);""",
 """  sayfaKonumuKaydet(b, true);
  b.notlar?.yokEt();
  belgeler.delete(id);"""),

("""async function belgeKaydet(b) {
  // Not/sayfa değişiklikleri sonraki aşamada; şimdilik yer tutucu.
  bildir('Kaydetme bu sürümde henüz etkin değil.');
  return false;
}""",
 """/** Belgeyi kaydeder. farkli=true ise yeni yol sorar. Başarılıysa true döner. */
async function belgeKaydet(b, farkli = false, sessiz = false) {
  if (!b || b.kaydediliyor) return false;
  b.notlar?.duzenleyiciBitir(true);
  let hedef = b.yol;
  if (farkli) {
    hedef = await pdefe.cagir('dosya:kaydetDiyalog', { baslik: 'Farklı kaydet', varsayilan: b.yol });
    if (!hedef) return false;
  } else if (!b.degisti) { if (!sessiz) bildir('Kaydedilecek değişiklik yok.'); return true; }
  const islemler = b.notlar ? b.notlar.fark() : [];
  b.kaydediliyor = true;
  durum.mesajYaz('Kaydediliyor…', 0);
  try {
    const r = await cekirdek('notlar_kaydet', { yol: b.yol, hedef, islemler, artimli: true });
    b.notlar?.kaydedildi(r.xrefler);
    b.yigin?.kaydedildi();
    b.boyut = r.boyut;
    if (farkli && !yolAyni(hedef, b.yol)) {
      b.yol = hedef; b.ad = dosyaAdi(hedef);
      sekmeler.guncelle(b.id, { ad: b.ad });
      sekmeler.bul(b.id).yol = hedef; sekmeler.bul(b.id).el.title = hedef;
      pdefe.cagir('pencere:baslik', b.ad);
      sonDosyalaraEkle(hedef);
    }
    kirliGuncelle(b);
    if (aktifId === b.id) durum.boyutYaz(b.boyut);
    durum.mesajYaz(sessiz ? 'Otomatik kaydedildi' : 'Kaydedildi' + (r.artimli ? '' : ' (tam yazım)'));
    panel.yorumlariYenile();
    return true;
  } catch (e) {
    durum.mesajYaz('');
    const kilitli = /açık olabilir|yazılamadı|Permission/i.test(e.message || '');
    const { secim } = await mesajKutusu({ tur: 'error', mesaj: 'Belge kaydedilemedi', ayrinti: (kilitli ? 'Dosya başka bir programda (örneğin bir PDF okuyucu) açık olabilir. Onu kapatıp yeniden deneyin ya da farklı bir adla kaydedin.\\n\\n' : '') + hataMetni(e), dugmeler: kilitli ? ['Farklı kaydet…', 'Vazgeç'] : ['Tamam'], iptal: kilitli ? 1 : 0 });
    if (kilitli && secim === 0) { b.kaydediliyor = false; return belgeKaydet(b, true); }
    return false;
  } finally { b.kaydediliyor = false; }
}"""),

("""  'dosya.kaydet': () => { const b = aktif(); if (b) belgeKaydet(b); },
  'dosya.farkliKaydet': () => { const b = aktif(); if (b) belgeKaydet(b, true); },""",
 """  'dosya.kaydet': () => { const b = aktif(); if (b) belgeKaydet(b); },
  'dosya.farkliKaydet': () => { const b = aktif(); if (b) belgeKaydet(b, true); },
  'not.arac': (arac) => { const b = aktif(); if (b) b.notlar.aracSec(arac); },
  'not.sil': () => aktif()?.notlar.silSecili(),"""),

("""  'duzen.geriAl': () => {}, 'duzen.yinele': () => {},""",
 """  'duzen.geriAl': () => { const b = aktif(); if (!b) return; if (girdideMi()) { document.execCommand('undo'); return; } const k = b.yigin.geriAl(); if (k) durum.mesajYaz('Geri alındı: ' + k.ad); },
  'duzen.yinele': () => { const b = aktif(); if (!b) return; if (girdideMi()) { document.execCommand('redo'); return; } const k = b.yigin.yinele(); if (k) durum.mesajYaz('Yinelendi: ' + k.ad); },"""),

("""document.querySelectorAll('[data-komut]').forEach((el) => el.addEventListener('click', () => komutCalistir(el.dataset.komut, el.dataset.veri)));""",
 """document.querySelectorAll('[data-komut]').forEach((el) => el.addEventListener('click', () => komutCalistir(el.dataset.komut, el.dataset.veri)));
document.querySelectorAll('#not-araclari [data-arac]').forEach((el) => {
  el.addEventListener('click', () => komutCalistir('not.arac', el.dataset.arac));
  if (el.dataset.arac === 'vurgu') el.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const secim = await pdefe.cagir('menu:popup', VURGU_RENKLERI.map((r) => ({ id: r.hex, etiket: r.ad, isaretli: r.hex === ayar.vurguRengi })));
    if (secim) { ayarKoy('vurguRengi', secim); secimCubuguYenile(); }
  });
});
// Seçim mini çubuğu: renk örnekleri + not
function secimCubuguYenile() {
  const c = $('#secim-cubugu');
  c.innerHTML = VURGU_RENKLERI.map((r) => `<button class="renk ${r.hex === ayar.vurguRengi ? 'secili' : ''}" data-renk="${r.hex}" title="${r.ad} vurgu" style="--r:${r.hex}"></button>`).join('') +
    '<span class="ayrac"></span><button class="ikon kucuk" data-islem="not" title="Not ekle"><svg viewBox="0 0 20 20"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4.5A1.5 1.5 0 0 1 3 12.5z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>' +
    '<button class="ikon kucuk" data-islem="kopyala" title="Kopyala"><svg viewBox="0 0 20 20"><rect x="7" y="7" width="9" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-6A1.5 1.5 0 0 0 4 4.5v8A1.5 1.5 0 0 0 5.5 14H7" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>';
  c.querySelectorAll('.renk').forEach((btn) => btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); const b = aktif(); if (!b) return; ayarKoy('vurguRengi', btn.dataset.renk); b.notlar.vurguUygula(btn.dataset.renk); secimCubuguYenile(); }));
  c.querySelector('[data-islem="not"]').addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); aktif()?.notlar.secimeNotKoy(); });
  c.querySelector('[data-islem="kopyala"]').addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); document.execCommand('copy'); aktif()?.notlar.secimCubuguGizle(); });
}
secimCubuguYenile();"""),

("""    if (secim === 'kopyala') document.execCommand('copy');
    else if (secim === 'ara') komutCalistir('duzen.bul', secimHamMetni().trim().split('\\n')[0]);
    else if (secim === 'tumunuSec') tumunuSec();
    else if (secim === 'vurgula' || secim === 'not') window.dispatchEvent(new CustomEvent('not:arac', { detail: { arac: secim, belge, x: e.clientX, y: e.clientY } }));""",
 """    if (secim === 'kopyala') document.execCommand('copy');
    else if (secim === 'ara') komutCalistir('duzen.bul', secimHamMetni().trim().split('\\n')[0]);
    else if (secim === 'tumunuSec') tumunuSec();
    else if (secim === 'vurgula') belge.notlar.vurguUygula(ayar.vurguRengi || VURGU_RENKLERI[0].hex);
    else if (secim === 'not') { if (!(seciliVar && belge.notlar.secimeNotKoy())) belge.notlar.yapiskanNotKoy(+sayfaEl.dataset.sayfa - 1, e); }"""),

# Klavye: Delete, Escape, Ctrl+Z/Y/A (menüde kayıtsız kısayollar)
("""  if (e.key === 'Escape') {
    if (!$('#belge-listesi').hidden) { sekmeler.belgeListesiKapat(); return; }
    if (girdideMi()) { document.activeElement.blur(); aktif()?.gorunum.kaydirici.focus(); return; }
    if (okumaModu) { komutCalistir('gorunum.okumaModu'); return; }
  }
  if (girdideMi()) return;
  const b = aktif();
  if (!b) return;
  const g = b.gorunum;""",
 """  if (e.key === 'Escape') {
    if (!$('#belge-listesi').hidden) { sekmeler.belgeListesiKapat(); return; }
    const n = aktif()?.notlar;
    if (n?.duzenleyici) { n.duzenleyiciBitir(false); return; }
    if (girdideMi()) { document.activeElement.blur(); aktif()?.gorunum.kaydirici.focus(); return; }
    if (n?.arac) { n.aracSec(null); return; }
    if (n?.balon) { n.balonKapat(); return; }
    if (n?.secili) { n.sec(null); return; }
    if (okumaModu) { komutCalistir('gorunum.okumaModu'); return; }
  }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) { if (!girdideMi()) { e.preventDefault(); komutCalistir('duzen.geriAl'); } return; }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'y' || e.key === 'Y')) { if (!girdideMi()) { e.preventDefault(); komutCalistir('duzen.yinele'); } return; }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'a' || e.key === 'A')) { if (!girdideMi()) { e.preventDefault(); tumunuSec(); } return; }
  if (girdideMi()) return;
  const b = aktif();
  if (!b) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { if (b.notlar?.silSecili()) { e.preventDefault(); return; } }
  const g = b.gorunum;"""),

# Pencere kapatma isteği
("""pdefe.dinle('pencere:tamEkran', (acik) => document.body.classList.toggle('tam-ekran', acik));""",
 """pdefe.dinle('pencere:tamEkran', (acik) => document.body.classList.toggle('tam-ekran', acik));
pdefe.dinle('pencere:kapatIstegi', async () => {
  for (const b of [...belgeler.values()]) {
    if (!b.degisti) continue;
    sekmeSec(b.id, { sorma: true });
    const { secim } = await mesajKutusu({ mesaj: `"${b.ad}" belgesinde kaydedilmemiş değişiklikler var.`, ayrinti: 'Çıkmadan önce kaydetmek ister misiniz?', dugmeler: ['Kaydet', 'Kaydetme', 'Vazgeç'], varsayilan: 0, iptal: 2 });
    if (secim === 2) return;
    if (secim === 0 && !(await belgeKaydet(b))) return;
  }
  for (const b of belgeler.values()) sayfaKonumuKaydet(b, true);
  await pdefe.cagir('pencere:kapatOnayla');
});"""),

# Yorumlar panelinden nota gitme
("""panel.addEventListener('notaGit', (e) => { const b = aktif(); if (!b) return; const n = e.detail.not; const s = b.gorunum.sayfalar[n.sayfa - 1]; b.gorunum.sayfayaGit(n.sayfa, { y: Math.max(0, n.rect[1] - 40) }); });""",
 """panel.addEventListener('notaGit', (e) => { const b = aktif(); if (!b) return; const n = e.detail.not; if (n.id && b.notlar) b.notlar.notaGit(n.id); else b.gorunum.sayfayaGit(n.sayfa, { y: Math.max(0, n.rect[1] - 40) }); });"""),

("""arama.addEventListener('notaGit', (e) => { /* not seçimi not modülüyle gelecek */ });""",
 """arama.addEventListener('notaGit', (e) => { const b = e.detail.belge; const n = [...(b.notlar?.notlar.values() || [])].find((x) => x.xref === e.detail.not.xref); if (n) b.notlar.notaGit(n.id); });"""),
])

# ---------------------------------------------------------------- panel.js: Yorumlar modelden
yama("src/renderer/panel.js", [
("""  async yorumlariDoldur() {
    const alan = this.alanlar.yorumlar;
    const b = this.belge;
    if (this._yorumlarHazir === b.id) return;
    this._yorumlarHazir = b.id;
    alan.innerHTML = '<p class="soluk">Yükleniyor…</p>';
    let notlar = [];
    try { notlar = (await this.cekirdek('notlar', { yol: b.yol })).notlar; } catch (e) { alan.innerHTML = '<p class="soluk">Notlar okunamadı.</p>'; return; }
    if (this.belge !== b) return;
    alan.innerHTML = '';
    if (!notlar.length) { alan.innerHTML = '<p class="soluk">Bu belgede yorum yok.</p>'; return; }
    for (const n of notlar) {
      const el = document.createElement('div');
      el.className = 'yorum';
      el.innerHTML = '<div class="ust"><span class="tur"></span><span class="yazar"></span><span class="esnek"></span><span class="sayfa-no"></span></div><div class="icerik"></div>';
      el.querySelector('.tur').textContent = turAdi(n.tur);
      el.querySelector('.yazar').textContent = n.yazar || '';
      el.querySelector(".sayfa-no").textContent = "s. " + n.sayfa + (n.degisim ? ' · ' + tarihBicimle(n.degisim) : '');
      el.querySelector('.icerik').textContent = n.icerik || '';
      if (!n.icerik) el.querySelector('.icerik').remove();
      el.addEventListener('click', () => this.dispatchEvent(new CustomEvent('notaGit', { detail: { not: n } })));
      alan.append(el);
    }
  }""",
 """  yorumlariYenile() { this._yorumlarHazir = null; if (this.acik && this.aktifSekme === 'yorumlar') this.yorumlariDoldur(); }

  async yorumlariDoldur() {
    const alan = this.alanlar.yorumlar;
    const b = this.belge;
    if (this._yorumlarHazir === b.id) return;
    this._yorumlarHazir = b.id;
    let notlar = [];
    if (b.notlar && b.notlar.yuklendi) {
      notlar = b.notlar.liste().map((n) => ({ ...n, yanitlar: b.notlar.yanitlari(n) }));
    } else {
      alan.innerHTML = '<p class="soluk">Yükleniyor…</p>';
      try { notlar = (await this.cekirdek('notlar', { yol: b.yol })).notlar.filter((n) => !n.yanitXref); } catch (e) { alan.innerHTML = '<p class="soluk">Notlar okunamadı.</p>'; return; }
      if (this.belge !== b) return;
    }
    alan.innerHTML = '';
    if (!notlar.length) { alan.innerHTML = '<p class="soluk">Bu belgede yorum yok.</p>'; return; }
    for (const n of notlar) {
      const el = document.createElement('div');
      el.className = 'yorum';
      el.dataset.id = n.id || '';
      el.innerHTML = '<div class="ust"><span class="renk"></span><span class="tur"></span><span class="yazar"></span><span class="esnek"></span><span class="sayfa-no"></span></div><div class="icerik"></div><div class="yanit-sayisi"></div>';
      el.querySelector('.renk').style.background = n.renk || (n.tur === 'FreeText' ? (n.yazi?.renk || '#999') : '#ffd000');
      el.querySelector('.tur').textContent = turAdi(n.tur);
      el.querySelector('.yazar').textContent = n.yazar || '';
      el.querySelector('.sayfa-no').textContent = 's. ' + n.sayfa + (n.degisim ? ' · ' + tarihBicimle(n.degisim) : '');
      el.querySelector('.icerik').textContent = n.icerik || '';
      if (!n.icerik) el.querySelector('.icerik').remove();
      const ys = (n.yanitlar || []).length;
      if (ys) el.querySelector('.yanit-sayisi').textContent = ys + ' yanıt'; else el.querySelector('.yanit-sayisi').remove();
      el.addEventListener('click', () => this.dispatchEvent(new CustomEvent('notaGit', { detail: { not: n } })));
      alan.append(el);
    }
  }"""),
])

# ---------------------------------------------------------------- main.js: kapatma onayı
yama("src/main/main.js", [
("""let rendererHazir = false;""", """let rendererHazir = false;
let kapatOnayli = false;"""),
("""  pencere.on('close', () => {
    if (!pencere) return;
    const b = pencere.getNormalBounds();""",
 """  pencere.on('close', (e) => {
    if (!pencere) return;
    if (!kapatOnayli && rendererHazir) {
      e.preventDefault();
      pencereyeGonder('pencere:kapatIstegi');
      return;
    }
    const b = pencere.getNormalBounds();"""),
("""  ipcMain.handle('pencere:kapat', () => { pencere?.close(); return true; });""",
 """  ipcMain.handle('pencere:kapat', () => { pencere?.close(); return true; });
  ipcMain.handle('pencere:kapatOnayla', () => { kapatOnayli = true; pencere?.close(); return true; });"""),
])

# ---------------------------------------------------------------- menu.js: Ctrl+Z/Y/A yalnızca gösterim (girdi alanlarında yerli davranış kalsın)
yama("src/main/menu.js", [
("""        { label: 'Geri al', accelerator: 'Ctrl+Z', click: k('duzen.geriAl') },
        { label: 'Yinele', accelerator: 'Ctrl+Y', click: k('duzen.yinele') },""",
 """        { label: 'Geri al', accelerator: 'Ctrl+Z', registerAccelerator: false, click: k('duzen.geriAl') },
        { label: 'Yinele', accelerator: 'Ctrl+Y', registerAccelerator: false, click: k('duzen.yinele') },"""),
("""        { label: 'Tümünü seç', accelerator: 'Ctrl+A', click: k('duzen.tumunuSec') },""",
 """        { label: 'Tümünü seç', accelerator: 'Ctrl+A', registerAccelerator: false, click: k('duzen.tumunuSec') },
        { type: 'separator' },
        { label: 'Yapışkan not', click: k('not.arac', 'not') },
        { label: 'Vurgu', click: k('not.arac', 'vurgu') },
        { label: 'Yazı', click: k('not.arac', 'yazi') },
        { label: 'Seçili notu sil', accelerator: 'Delete', registerAccelerator: false, click: k('not.sil') },"""),
])

# ---------------------------------------------------------------- ayarlar.js: yazı varsayılanları
yama("src/main/ayarlar.js", [
("""  yaziTipi: 'Segoe UI',
  yaziBoyutu: 12,""", """  yaziTipi: 'Segoe UI',
  yaziBoyutu: 12,
  yaziRengi: '#000000',
  yaziArka: null,"""),
])

# ---------------------------------------------------------------- index.html: seçim çubuğu
yama("src/renderer/index.html", [
("""        <div id="bul-kutusu" hidden></div>""", """        <div id="bul-kutusu" hidden></div>
        <div id="secim-cubugu" hidden></div>"""),
])

# ---------------------------------------------------------------- stil.css: not katmanı
css = open("src/renderer/stil.css", encoding="utf-8").read()
css += """
/* ---------- Not katmanı ---------- */
.sayfa .not-katmani { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: visible; }
.not-isaretler { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.not-isaretler g { pointer-events: auto; cursor: pointer; }
.not-isaretler .not-highlight rect { mix-blend-mode: multiply; }
.not-isaretler g.not-secili rect, .not-isaretler g.not-secili path { outline: none; }
.not-isaretler g.not-secili { filter: drop-shadow(0 0 2px var(--vurgu)) drop-shadow(0 0 1px var(--vurgu)); }
.not-oge { position: absolute; pointer-events: auto; cursor: pointer; box-sizing: border-box; }
.not-oge img { width: 100%; height: 100%; display: block; pointer-events: none; }
.not-text svg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.35)); }
.not-oge.not-secili { outline: 2px solid var(--vurgu); outline-offset: 2px; border-radius: 2px; }
.not-freetext-yerli { white-space: pre-wrap; word-wrap: break-word; overflow: hidden; cursor: default; user-select: none; }
.not-bilinmeyen { border: 1px dashed rgba(128,128,128,0.6); font-size: 10px; color: var(--metin-soluk); display: flex; align-items: center; justify-content: center; }
.arac-not .sayfa, .arac-yazi .sayfa { cursor: crosshair; }
.arac-not .textLayer span, .arac-yazi .textLayer span { cursor: crosshair; }
.arac-vurgu .textLayer span { cursor: text; }
.yazi-cizim { position: absolute; border: 1px dashed var(--vurgu); background: rgba(0,103,192,0.06); z-index: 5; pointer-events: none; }
.yazi-duzenleyici {
  position: absolute; z-index: 6; box-sizing: border-box; resize: none; outline: none; overflow: hidden; white-space: pre-wrap; word-wrap: break-word;
  font: inherit; margin: 0;
}
.yazi-tutamac { position: absolute; z-index: 7; width: 12px; height: 12px; border-radius: 50%; background: var(--vurgu); cursor: move; border: 2px solid #fff; box-shadow: 0 0 2px rgba(0,0,0,.5); }
.yazi-boyut { position: absolute; z-index: 7; width: 10px; height: 10px; background: #fff; border: 2px solid var(--vurgu); cursor: nwse-resize; }
.yazi-bicim {
  position: absolute; z-index: 40; display: flex; align-items: center; gap: 4px; padding: 4px 6px;
  background: var(--arka-yukseltilmis); border: 1px solid var(--kenar); border-radius: 8px; box-shadow: var(--golge);
}
.yazi-bicim select, .yazi-bicim input[type="number"] { height: 26px; border: 1px solid var(--kenar); border-radius: 4px; background: var(--arka); color: var(--metin); padding: 0 4px; font: inherit; }
.yazi-bicim input[type="number"] { width: 52px; }
.yazi-bicim .renk-etiket { position: relative; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; }
.yazi-bicim .renk-etiket input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.yazi-bicim .ornek { width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--kenar); display: block; background-image: linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%); background-size: 8px 8px; background-position: 0 0,4px 4px; }
.yazi-bicim .ornek:not(.arka) { background-image: none; }
button.ikon.kucuk { width: 26px; height: 26px; }
button.ikon.kucuk svg { width: 16px; height: 16px; }

/* Not balonu */
.not-balonu {
  position: absolute; z-index: 45; background: var(--arka-yukseltilmis); border: 1px solid var(--kenar); border-radius: 10px;
  box-shadow: var(--golge); display: flex; flex-direction: column; overflow: hidden; user-select: text; font-size: 12px;
}
.not-balonu.gecici { pointer-events: auto; }
.not-balonu .ust { display: flex; align-items: center; gap: 6px; padding: 6px 8px; background: var(--arka); border-bottom: 1px solid var(--kenar); }
.not-balonu .ust .renk { width: 10px; height: 10px; border-radius: 50%; background: var(--not-renk); border: 1px solid rgba(0,0,0,.25); flex-shrink: 0; }
.not-balonu .ust .tur { font-weight: 600; }
.not-balonu .ust .yazar { color: var(--metin-soluk); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.not-balonu .ust .tarih { color: var(--metin-soluk); font-size: 11px; white-space: nowrap; }
.not-balonu textarea.icerik { border: none; outline: none; resize: none; background: transparent; padding: 8px; min-height: 64px; max-height: 220px; font: inherit; color: var(--metin); }
.not-balonu .yanitlar { max-height: 200px; overflow: auto; }
.not-balonu .yanit { border-top: 1px solid var(--kenar); padding: 6px 8px 6px 18px; position: relative; }
.not-balonu .yanit::before { content: ''; position: absolute; left: 9px; top: 10px; bottom: 8px; width: 2px; background: var(--kenar); border-radius: 1px; }
.not-balonu .yanit .ust { padding: 0 0 3px; background: transparent; border: none; }
.not-balonu .yanit .metin { white-space: pre-wrap; word-break: break-word; }
.not-balonu .yanit-kutusu { display: flex; gap: 6px; padding: 6px 8px; border-top: 1px solid var(--kenar); }
.not-balonu .yanit-girdi { flex: 1; height: 26px; border: 1px solid var(--kenar); border-radius: 4px; background: var(--arka); color: var(--metin); padding: 0 6px; outline: none; font: inherit; }
.not-balonu .yanit-girdi:focus { border-color: var(--vurgu); }
.not-balonu button.ikincil { padding: 3px 10px; }

/* Seçim mini çubuğu */
#secim-cubugu {
  position: absolute; z-index: 30; display: flex; align-items: center; gap: 4px; padding: 4px 6px;
  background: var(--arka-yukseltilmis); border: 1px solid var(--kenar); border-radius: 8px; box-shadow: var(--golge);
}
#secim-cubugu .renk { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; background: var(--r); cursor: pointer; padding: 0; }
#secim-cubugu .renk:hover { transform: scale(1.12); }
#secim-cubugu .renk.secili { border-color: var(--metin); }
#secim-cubugu .ayrac { height: 16px; }

/* Yorumlar paneli ek */
.yorum .ust .renk { width: 9px; height: 9px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,.25); flex-shrink: 0; align-self: center; }
.yorum .yanit-sayisi { font-size: 11px; color: var(--vurgu); margin-top: 2px; }
"""
open("src/renderer/stil.css", "w", encoding="utf-8").write(css)
print("stil.css eklendi")
