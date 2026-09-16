// PDEfe arayüz girişi: sekmeler, komutlar, kısayollar, ayarlar, sürükle-bırak.
import { Goruntuleyici } from './goruntuleyici.js';
import { SekmeCubugu } from './sekmeler.js';
import { SolPanel } from './panel.js';
import { DurumCubugu, boyutMetni } from './durum.js';
import { Arama } from './arama.js';
import { temizMetin, hamMetin, secimDikdortgenleri, satirlaraBirlestir, paragrafSec, secimHamMetni, secimYapiliMetni } from './metin.js';
import { NotYoneticisi, VURGU_RENKLERI } from './notlar.js';
import { KomutYigini } from './komutlar.js';

const $ = (s) => document.querySelector(s);
const pdefe = window.pdefe;

// ---------------------------------------------------------------- durum
let ayar = {};
const belgeler = new Map();     // id → Belge
let aktifId = null;
let sayac = 0;
let sistemKoyu = false;
let okumaModu = false;
let ilerlemeSayac = 0;

const cekirdek = (yontem, params, ilerleme) => {
  const istekId = ++ilerlemeSayac;
  if (ilerleme) ilerlemeDinleyiciler.set(istekId, ilerleme);
  return pdefe.cagir('cekirdek:cagir', yontem, params, istekId).finally(() => ilerlemeDinleyiciler.delete(istekId));
};
const ilerlemeDinleyiciler = new Map();
pdefe.dinle('cekirdek:ilerleme', (istekId, ilerleme) => ilerlemeDinleyiciler.get(istekId)?.(ilerleme));

// ---------------------------------------------------------------- bileşenler
const sekmeler = new SekmeCubugu({
  cubuk: $('#sekme-cubugu'), liste: $('#sekme-liste'), onceki: $('#sekme-onceki'), sonraki: $('#sekme-sonraki'),
  acilir: $('#sekme-acilir'), secici: $('#sekme-secici'), belgeListesi: $('#belge-listesi'),
});
const panel = new SolPanel({
  panel: $('#sol-panel'), tutamac: $('#panel-tutamac'), sayfalar: $('#panel-sayfalar'), icindekiler: $('#panel-icindekiler'),
  yorumlar: $('#panel-yorumlar'), sekmeler: $('#sol-panel .panel-sekmeler'), cekirdek,
});
const durum = new DurumCubugu({
  sayfaKutusu: $('#durum-sayfa-kutusu'), sayfaToplam: $('#durum-sayfa-toplam'), zoom: $('#durum-zoom'), boyut: $('#durum-boyut'),
  degisiklik: $('#durum-degisiklik'), mesaj: $('#durum-mesaj'), onSayfayaGit: (no) => aktif()?.gorunum.sayfayaGit(no),
});

function aktif() { return aktifId ? belgeler.get(aktifId) : null; }

const arama = new Arama({ kutu: $('#bul-kutusu'), belgeAl: aktif, belgeler, sekmeSec: (id) => sekmeSec(id), cekirdek });
arama.addEventListener('yerimineGit', (e) => panel.yerimineGit({ dest: e.detail.oge.dest, title: e.detail.oge.baslik }, e.detail.belge));
arama.addEventListener('notaGit', (e) => { const b = e.detail.belge; const n = [...(b.notlar?.notlar.values() || [])].find((x) => x.xref === e.detail.not.xref); if (n) b.notlar.notaGit(n.id); });

// ---------------------------------------------------------------- ayarlar ve tema
async function ayarlariYukle() {
  ayar = await pdefe.cagir('ayar:al');
  sistemKoyu = await pdefe.cagir('tema:sistemKoyu');
  temaUygula();
  panel.genislikAyarla(ayar.solPanelGenislik || 240);
  if (ayar.solPanelAcik) panel.acKapa(true);
  panel.sekmeSec(ayar.solPanelSekme || 'sayfalar');
}

function ayarKoy(anahtar, deger) { ayar[anahtar] = deger; return pdefe.cagir('ayar:koy', anahtar, deger); }

function koyuMu() { return ayar.tema === 'sistem' ? sistemKoyu : ayar.tema === 'koyu'; }

function temaUygula() {
  document.documentElement.dataset.tema = koyuMu() ? 'koyu' : 'acik';
  for (const b of belgeler.values()) b.gorunum.koyuSayfaAyarla(koyuMu() && ayar.sayfayiKoyulastir);
}

pdefe.dinle('tema:sistem', (koyu) => { sistemKoyu = koyu; temaUygula(); });

// ---------------------------------------------------------------- belge açma / kapatma
async function dosyaAc(yol, secenek = {}) {
  // Zaten açıksa o sekmeye geç
  for (const b of belgeler.values()) if (yolAyni(b.yol, yol)) { sekmeSec(b.id); return b; }
  const varMi = await pdefe.cagir('dosya:varMi', yol);
  if (!varMi) { bildir('Dosya bulunamadı: ' + yol); sonDosyalardanCikar(yol); return null; }

  const id = 'b' + (++sayac);
  const ad = dosyaAdi(yol);
  const el = document.createElement('div');
  el.className = 'gorunum';
  el.hidden = true;
  $('#gorunumler').append(el);
  const gorunum = new Goruntuleyici(el);
  const belge = { id, yol, ad, el, gorunum, degisti: false, boyut: 0, bilgi: null, sorma: false };
  belgeler.set(id, belge);
  sekmeler.ekle({ id, ad, yol });
  if (!secenek.arkaPlanda || !aktifId) sekmeSec(id);
  $('#baslangic').hidden = true;

  gorunum.addEventListener('sayfa', (e) => { if (aktifId === id) { sayfaGoster(belge); } sayfaKonumuKaydet(belge); });
  gorunum.addEventListener('zoom', (e) => { if (aktifId === id) zoomGoster(belge); });
  gorunum.addEventListener('metinKatmani', (e) => arama.katmanCizildi(gorunum, e.detail.sayfa));
  metinOlaylariBagla(belge);
  belge.yigin = new KomutYigini();
  belge.notlar = new NotYoneticisi({ belge, cekirdek, ayar: () => ayar, yigin: belge.yigin, alan: $('#belge-alani') });
  belge.yigin.addEventListener('degisti', () => kirliGuncelle(belge));
  belge.notlar.addEventListener('degisti', () => { kirliGuncelle(belge); if (aktifId === id) panel.yorumlariYenile(); });
  belge.notlar.addEventListener('arac', (e) => { if (aktifId === id) aracDugmeleriniGuncelle(e.detail.arac); });

  try {
    const { veri, boyut } = await pdefe.cagir('dosya:oku', yol);
    belge.boyut = boyut;
    const sonSayfa = ayar.kaldigimSayfadanAc ? (ayar.sayfaKonumlari || {})[yol] : null;
    const zoom = ayar.varsayilanZoom;
    const zoomModu = ['genislik', 'sayfa', 'gercek', 'gorunur'].includes(zoom) ? zoom : 'serbest';
    const olcek = zoom === 'son' ? (ayar.sonZoom || 100) / 100 : (typeof zoom === 'number' ? zoom / 100 : 1);
    gorunum.koyuSayfa = koyuMu() && ayar.sayfayiKoyulastir;
    await gorunum.yukle(veri, {
      duzen: ayar.varsayilanDuzen || 'surekli', kapakAyri: !!ayar.kapakAyri, zoomModu, olcek,
      sayfa: secenek.sayfa || sonSayfa || 1,
      parolaIste: (neden) => parolaSor(ad, neden),
    });
    cekirdek('belge_bilgi', { yol }).then((bilgi) => { belge.bilgi = bilgi; }).catch(() => {});
    belge.notlar.yukle().catch((e2) => console.warn('Notlar yüklenemedi', e2));
  } catch (e) {
    console.error(e);
    belgeKapat(id, { zorla: true });
    await mesajKutusu({ tur: 'error', mesaj: 'PDF açılamadı', ayrinti: `${ad}\n\n${hataMetni(e)}` });
    return null;
  }
  if (aktifId === id) { sayfaGoster(belge); zoomGoster(belge); durum.boyutYaz(belge.boyut); panel.belgeAyarla(belge); }
  sonDosyalaraEkle(yol);
  oturumKaydet();
  return belge;
}

let sekmeSoruAcik = false;
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
}

async function belgeKapat(id, secenek = {}) {
  const b = belgeler.get(id);
  if (!b) return true;
  if (b.degisti && !secenek.zorla) {
    const { secim } = await mesajKutusu({ mesaj: `"${b.ad}" belgesinde kaydedilmemiş değişiklikler var.`, ayrinti: 'Kapatmadan önce kaydetmek ister misiniz?', dugmeler: ['Kaydet', 'Kaydetme', 'Vazgeç'], varsayilan: 0, iptal: 2 });
    if (secim === 2) return false;
    if (secim === 0) { const tamam = await belgeKaydet(b); if (!tamam) return false; }
  }
  sayfaKonumuKaydet(b, true);
  b.notlar?.yokEt();
  belgeler.delete(id);
  sekmeler.kaldir(id);
  panel.belgeUnut(id);
  arama.belgeUnut(b.gorunum);
  b.gorunum.yokEt();
  b.el.remove();
  cekirdek('belge_birak', { yol: b.yol }).catch(() => {});
  if (aktifId === id) {
    aktifId = null;
    const sonraki = sekmeler.mru[0] || sekmeler.sekmeler[0]?.id;
    if (sonraki) sekmeSec(sonraki);
    else { baslangicGoster(); }
  }
  oturumKaydet();
  return true;
}

function baslangicGoster() {
  $('#baslangic').hidden = false;
  durum.sayfa(0, 0); durum.zoomYaz(1); durum.boyutYaz(null); durum.degisiklikYaz(false);
  $('#sayfa-kutusu').value = ''; $('#sayfa-toplam').textContent = '/ 0';
  pdefe.cagir('pencere:baslik', '');
  panel.belgeAyarla(null);
  sonDosyalariListele();
}

/** Belgeyi kaydeder. farkli=true ise yeni yol sorar. Başarılıysa true döner. */
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
    const { secim } = await mesajKutusu({ tur: 'error', mesaj: 'Belge kaydedilemedi', ayrinti: (kilitli ? 'Dosya başka bir programda (örneğin bir PDF okuyucu) açık olabilir. Onu kapatıp yeniden deneyin ya da farklı bir adla kaydedin.\n\n' : '') + hataMetni(e), dugmeler: kilitli ? ['Farklı kaydet…', 'Vazgeç'] : ['Tamam'], iptal: kilitli ? 1 : 0 });
    if (kilitli && secim === 0) { b.kaydediliyor = false; return belgeKaydet(b, true); }
    return false;
  } finally { b.kaydediliyor = false; }
}

function sayfaGoster(b) {
  const g = b.gorunum;
  durum.sayfa(g.gecerli, g.sayfaSayisi);
  if (document.activeElement !== $('#sayfa-kutusu')) $('#sayfa-kutusu').value = String(g.gecerli);
  $('#sayfa-toplam').textContent = '/ ' + g.sayfaSayisi;
  panel.gecerliSayfaIsaretle(g.gecerli);
}

function zoomGoster(b) {
  const o = b.gorunum.olcek;
  durum.zoomYaz(o);
  if (document.activeElement !== $('#zoom-kutusu')) $('#zoom-kutusu').value = '%' + Math.round(o * 100);
  if (ayar.varsayilanZoom === 'son') { ayar.sonZoom = Math.round(o * 100); zoomKaydetGecikmeli(); }
}
let _zoomZaman = null;
function zoomKaydetGecikmeli() { clearTimeout(_zoomZaman); _zoomZaman = setTimeout(() => ayarKoy('sonZoom', ayar.sonZoom), 800); }

// ---------------------------------------------------------------- son dosyalar, oturum, sayfa konumu
function sonDosyalaraEkle(yol) {
  const liste = [yol, ...(ayar.sonDosyalar || []).filter((y) => !yolAyni(y, yol))].slice(0, 15);
  ayar.sonDosyalar = liste;
  pdefe.cagir('uygulama:sonDosyalar', liste);
}
function sonDosyalardanCikar(yol) {
  ayar.sonDosyalar = (ayar.sonDosyalar || []).filter((y) => !yolAyni(y, yol));
  pdefe.cagir('uygulama:sonDosyalar', ayar.sonDosyalar);
  sonDosyalariListele();
}
function sonDosyalariListele() {
  const ul = $('#son-dosyalar');
  ul.innerHTML = '';
  for (const y of (ayar.sonDosyalar || []).slice(0, 10)) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="ad"></span><span class="yol"></span>';
    li.querySelector('.ad').textContent = dosyaAdi(y);
    li.querySelector('.yol').textContent = y;
    li.addEventListener('click', () => dosyaAc(y));
    ul.append(li);
  }
  if (!ul.children.length) ul.innerHTML = '<li class="soluk">Henüz yok.</li>';
}

let _oturumZaman = null;
function oturumKaydet() {
  clearTimeout(_oturumZaman);
  _oturumZaman = setTimeout(() => {
    const liste = sekmeler.sekmeler.map((s) => belgeler.get(s.id)).filter(Boolean).map((b) => ({ yol: b.yol, sayfa: b.gorunum.gecerli, aktif: b.id === aktifId }));
    ayarKoy('acikSekmeler', liste);
  }, 300);
}

let _konumZaman = null;
function sayfaKonumuKaydet(b, hemen = false) {
  const yaz = () => {
    const k = ayar.sayfaKonumlari || {};
    delete k[b.yol];
    k[b.yol] = b.gorunum.gecerli;
    const anahtarlar = Object.keys(k);
    if (anahtarlar.length > 300) for (const a of anahtarlar.slice(0, anahtarlar.length - 300)) delete k[a];
    ayarKoy('sayfaKonumlari', k);
  };
  clearTimeout(_konumZaman);
  if (hemen) yaz(); else _konumZaman = setTimeout(yaz, 1000);
}

// ---------------------------------------------------------------- komutlar
const komutlar = {
  'dosya.ac': async () => { const yollar = await pdefe.cagir('dosya:acDiyalog'); for (const y of yollar) await dosyaAc(y); },
  'dosya.acYol': (yol) => dosyaAc(yol),
  'dosya.sonTemizle': () => { ayar.sonDosyalar = []; pdefe.cagir('uygulama:sonDosyalar', []); sonDosyalariListele(); },
  'dosya.kaydet': () => { const b = aktif(); if (b) belgeKaydet(b); },
  'dosya.farkliKaydet': () => { const b = aktif(); if (b) belgeKaydet(b, true); },
  'not.arac': (arac) => { const b = aktif(); if (b) b.notlar.aracSec(arac); },
  'not.sil': () => aktif()?.notlar.silSecili(),
  'dosya.klasordeGoster': () => { const b = aktif(); if (b) pdefe.cagir('kabuk:klasordeGoster', b.yol); },
  'dosya.yazdir': () => bildir('Yazdırma bir sonraki aşamada eklenecek.'),
  'sekme.kapat': () => { if (aktifId) belgeKapat(aktifId); else pdefe.cagir('pencere:kapat'); },
  'duzen.geriAl': () => { const b = aktif(); if (!b) return; if (girdideMi()) { document.execCommand('undo'); return; } const k = b.yigin.geriAl(); if (k) durum.mesajYaz('Geri alındı: ' + k.ad); },
  'duzen.yinele': () => { const b = aktif(); if (!b) return; if (girdideMi()) { document.execCommand('redo'); return; } const k = b.yigin.yinele(); if (k) durum.mesajYaz('Yinelendi: ' + k.ad); },
  'duzen.tumunuSec': () => tumunuSec(),
  'duzen.bul': (metin) => { if (aktif()) arama.ac(typeof metin === 'string' ? metin : (secimHamMetni().trim().split('\n')[0] || '')); },
  'duzen.bulSonraki': () => arama.git(1), 'duzen.bulOnceki': () => arama.git(-1),
  'duzen.sayfayaGit': () => { const k = $('#sayfa-kutusu'); k.focus(); k.select(); },
  'duzen.ayarlar': () => bildir('Ayarlar penceresi bir sonraki aşamada eklenecek.'),
  'gorunum.yakinlastir': () => aktif()?.gorunum.yakinlastir(1),
  'gorunum.uzaklastir': () => aktif()?.gorunum.yakinlastir(-1),
  'gorunum.zoom': (mod) => { const b = aktif(); if (!b) return; if (mod === 'gercek') b.gorunum.zoomAyarla(1, null, 'serbest'); else b.gorunum.zoomModuAyarla(mod); },
  'gorunum.duzen': (d) => { const b = aktif(); if (b) { b.gorunum.duzenAyarla(d); } },
  'gorunum.kapakAyri': () => { const b = aktif(); if (b) b.gorunum.duzenAyarla(b.gorunum.duzen, !b.gorunum.kapakAyri); },
  'gorunum.dondur': (derece) => aktif()?.gorunum.dondur(+derece || 90),
  'gorunum.oncekiSayfa': () => aktif()?.gorunum.oncekiSayfa(),
  'gorunum.sonrakiSayfa': () => aktif()?.gorunum.sonrakiSayfa(),
  'gorunum.solPanel': () => { panel.acKapa(); ayarKoy('solPanelAcik', panel.acik); },
  'gorunum.tema': () => { const yeni = koyuMu() ? 'acik' : 'koyu'; ayarKoy('tema', yeni); temaUygula(); },
  'gorunum.okumaModu': () => { okumaModu = !okumaModu; document.body.classList.toggle('okuma-modu', okumaModu); aktif()?.gorunum.boyutDegisti(); },
  'gorunum.tamEkran': () => pdefe.cagir('pencere:tamEkran'),
  'arac.paylas': () => paylas(),
  'arac.kucult': () => bildir('PDF küçültme aracı sonraki aşamada.'),
  'arac.sayfalar': () => bildir('Sayfaları düzenle aracı sonraki aşamada.'),
  'arac.ayir': () => bildir('PDF ayırma aracı sonraki aşamada.'),
  'arac.birlestir': () => bildir('PDF birleştirme aracı sonraki aşamada.'),
  'arac.gorselBirlestir': () => bildir('Görüntü/PDF birleştirme aracı sonraki aşamada.'),
  'arac.dondurKaydet': () => bildir('Döndür ve kaydet sonraki aşamada.'),
  'yardim.kisayollar': () => kisayollarGoster(),
  'yardim.guncelle': () => bildir('Güncelleme denetimi sonraki aşamada.'),
  'yardim.hakkinda': () => hakkindaGoster(),
};

function komutCalistir(id, veri) {
  const f = komutlar[id];
  if (!f) { console.warn('Bilinmeyen komut', id); return; }
  try { const r = f(veri); if (r && r.catch) r.catch((e) => { console.error(e); bildir('Hata: ' + hataMetni(e)); }); }
  catch (e) { console.error(e); bildir('Hata: ' + hataMetni(e)); }
}

pdefe.dinle('menu:komut', (id, veri) => komutCalistir(id, veri));
pdefe.dinle('dosya:ac', async (yollar) => { for (const y of yollar) await dosyaAc(y); });
pdefe.dinle('pencere:tamEkran', (acik) => document.body.classList.toggle('tam-ekran', acik));
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
});

document.querySelectorAll('[data-komut]').forEach((el) => el.addEventListener('click', () => komutCalistir(el.dataset.komut, el.dataset.veri)));
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
secimCubuguYenile();

// Araç çubuğu kutuları
$('#sayfa-kutusu').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { aktif()?.gorunum.sayfayaGit(parseInt(e.target.value, 10)); e.target.blur(); aktif()?.gorunum.kaydirici.focus(); }
  if (e.key === 'Escape') { e.target.blur(); aktif()?.gorunum.kaydirici.focus(); }
});
$('#sayfa-kutusu').addEventListener('focus', (e) => e.target.select());
$('#zoom-kutusu').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const v = parseFloat(String(e.target.value).replace('%', '').replace(',', '.'));
    if (v > 0) aktif()?.gorunum.zoomAyarla(v / 100);
    e.target.blur(); aktif()?.gorunum.kaydirici.focus();
  }
  if (e.key === 'Escape') { e.target.blur(); aktif()?.gorunum.kaydirici.focus(); }
});
$('#zoom-kutusu').addEventListener('focus', (e) => e.target.select());
$('#dugme-zoom-secenek').addEventListener('click', async () => {
  const b = aktif(); if (!b) return;
  const mod = b.gorunum.zoomModu;
  const secim = await pdefe.cagir('menu:popup', [
    { id: 'gercek', etiket: 'Gerçek boyut (%100)', isaretli: mod === 'serbest' && Math.abs(b.gorunum.olcek - 1) < 0.001 },
    { id: 'sayfa', etiket: 'Sayfayı sığdır', isaretli: mod === 'sayfa' },
    { id: 'genislik', etiket: 'Genişliğe sığdır', isaretli: mod === 'genislik' },
    { id: 'gorunur', etiket: 'Görünür alana sığdır', isaretli: mod === 'gorunur' },
    { ayirici: true },
    ...[25, 50, 75, 100, 125, 150, 200, 300, 400, 800, 1600, 3200, 6400].map((y) => ({ id: 'y' + y, etiket: '%' + y })),
  ]);
  if (!secim) return;
  if (secim.startsWith('y')) b.gorunum.zoomAyarla(parseInt(secim.slice(1), 10) / 100);
  else komutCalistir('gorunum.zoom', secim);
});
$('#dugme-duzen').addEventListener('click', async () => {
  const b = aktif(); if (!b) return;
  const d = b.gorunum.duzen;
  const secim = await pdefe.cagir('menu:popup', [
    { id: 'tek', etiket: 'Tek sayfa', isaretli: d === 'tek' },
    { id: 'surekli', etiket: 'Kaydırmayı etkinleştir', isaretli: d === 'surekli' },
    { id: 'iki', etiket: 'İki sayfa', isaretli: d === 'iki' },
    { id: 'ikiSurekli', etiket: 'İki sayfa kaydırma', isaretli: d === 'ikiSurekli' },
    { ayirici: true },
    { id: 'kapak', etiket: 'İki sayfalı görünümde kapak sayfasını ayrı göster', isaretli: b.gorunum.kapakAyri },
  ]);
  if (!secim) return;
  if (secim === 'kapak') komutCalistir('gorunum.kapakAyri');
  else { komutCalistir('gorunum.duzen', secim); ayarKoy('varsayilanDuzen', secim); }
});

// Sekme olayları
sekmeler.addEventListener('sec', (e) => sekmeSec(e.detail.id));
sekmeler.addEventListener('kapat', (e) => belgeKapat(e.detail.id));
sekmeler.addEventListener('siralandi', () => oturumKaydet());
sekmeler.addEventListener('sagTik', async (e) => {
  const id = e.detail.id; const b = belgeler.get(id); if (!b) return;
  const secim = await pdefe.cagir('menu:popup', [
    { id: 'kapat', etiket: 'Kapat' }, { id: 'digerleri', etiket: 'Diğerlerini kapat', devre: belgeler.size < 2 },
    { id: 'sagdakiler', etiket: 'Sağdakileri kapat', devre: sekmeler.sekmeler.findIndex((s) => s.id === id) >= sekmeler.sekmeler.length - 1 },
    { ayirici: true }, { id: 'klasor', etiket: 'Klasörde göster' }, { id: 'yol', etiket: 'Yolu kopyala' },
  ]);
  if (secim === 'kapat') belgeKapat(id);
  else if (secim === 'digerleri') for (const s of [...sekmeler.sekmeler]) { if (s.id !== id && !(await belgeKapat(s.id))) break; }
  else if (secim === 'sagdakiler') { const i = sekmeler.sekmeler.findIndex((s) => s.id === id); for (const s of [...sekmeler.sekmeler].slice(i + 1)) { if (!(await belgeKapat(s.id))) break; } }
  else if (secim === 'klasor') pdefe.cagir('kabuk:klasordeGoster', b.yol);
  else if (secim === 'yol') { await pdefe.cagir('pano:metin', b.yol); bildir('Yol panoya kopyalandı'); }
});

// Panel olayları
panel.addEventListener('sayfayaGit', (e) => { const b = aktif(); if (b) { b.gorunum.sayfayaGit(e.detail.sayfa, { y: e.detail.y }); b.gorunum.kaydirici.focus(); } });
panel.addEventListener('notaGit', (e) => { const b = aktif(); if (!b) return; const n = e.detail.not; if (n.id && b.notlar) b.notlar.notaGit(n.id); else b.gorunum.sayfayaGit(n.sayfa, { y: Math.max(0, n.rect[1] - 40) }); });
panel.addEventListener('genislik', (e) => ayarKoy('solPanelGenislik', Math.round(e.detail.genislik)));
panel.addEventListener('sekme', (e) => ayarKoy('solPanelSekme', e.detail.sekme));
panel.addEventListener('durum', () => aktif()?.gorunum.boyutDegisti());

// ---------------------------------------------------------------- klavye
function girdideMi() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}

document.addEventListener('keydown', (e) => {
  // Ctrl+Tab seçici
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    if (belgeler.size < 2) return;
    if (!sekmeler.seciciAcik) sekmeler.seciciAc((id) => kucukResimAl(belgeler.get(id)));
    else sekmeler.seciciIlerle(e.shiftKey ? -1 : 1);
    if (e.shiftKey && sekmeler.seciciIdx === 1) { /* ilk Shift+Tab geriye gider */ sekmeler.seciciIlerle(-2); }
    return;
  }
  if (sekmeler.seciciAcik) { if (e.key === 'Escape') { sekmeler.seciciAcik = false; sekmeler.secici.hidden = true; } return; }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
    const i = e.key === '9' ? sekmeler.sekmeler.length - 1 : parseInt(e.key, 10) - 1;
    const s = sekmeler.sekmeler[i];
    if (s) { e.preventDefault(); sekmeSec(s.id); }
    return;
  }
  if (e.key === 'Escape') {
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
  const g = b.gorunum;
  const satir = 48;
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); g.dikeyKaydir(satir); break;
    case 'ArrowUp': e.preventDefault(); g.dikeyKaydir(-satir); break;
    case 'ArrowRight': if (!e.ctrlKey) { e.preventDefault(); g.sonrakiSayfa(); } break;
    case 'ArrowLeft': if (!e.ctrlKey) { e.preventDefault(); g.oncekiSayfa(); } break;
    case 'PageDown': e.preventDefault(); if (g.surekli()) g.sonrakiSayfa(); else g.dikeyKaydir(g.kaydirici.clientHeight - 40); break;
    case 'PageUp': e.preventDefault(); if (g.surekli()) g.oncekiSayfa(); else g.dikeyKaydir(-(g.kaydirici.clientHeight - 40)); break;
    case 'Home': e.preventDefault(); if (e.ctrlKey) g.belgeBasi(); else g.sayfayaGit(1); break;
    case 'End': e.preventDefault(); if (e.ctrlKey) g.belgeSonu(); else g.sayfayaGit(g.sayfaSayisi); break;
    case ' ': e.preventDefault(); g.dikeyKaydir((e.shiftKey ? -1 : 1) * (g.kaydirici.clientHeight - 40)); break;
    default: break;
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Control' && sekmeler.seciciAcik) sekmeler.seciciKapat();
});
window.addEventListener('blur', () => { if (sekmeler.seciciAcik) sekmeler.seciciKapat(); });

async function kucukResimAl(b) {
  if (!b) return null;
  try { const r = await cekirdek('kucuk_resim', { yol: b.yol, sayfa: 1, genislik: 220 }); return 'data:image/png;base64,' + r.png; }
  catch { return null; }
}

function tumunuSec() {
  const b = aktif(); if (!b) return;
  const g = b.gorunum;
  const katman = g.sayfalar[g.gecerli - 1]?.el.querySelector('.textLayer');
  if (!katman) return;
  const sec = window.getSelection(); const r = document.createRange();
  r.selectNodeContents(katman); sec.removeAllRanges(); sec.addRange(r);
}

// ---------------------------------------------------------------- metin: sağ tık, üç tık, kopyalama
function metinOlaylariBagla(belge) {
  const alan = belge.gorunum.alan;
  alan.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.detail !== 3) return;
    const span = e.target.closest('.textLayer span');
    if (span && paragrafSec(span)) e.preventDefault();
  });
  alan.addEventListener('contextmenu', async (e) => {
    const katman = e.target.closest('.textLayer');
    const sayfaEl = e.target.closest('.sayfa');
    if (!sayfaEl) return;
    e.preventDefault();
    const sec = window.getSelection();
    const seciliVar = sec && !sec.isCollapsed && katman;
    const secim = await pdefe.cagir('menu:popup', [
      { id: 'kopyala', etiket: 'Kopyala', devre: !seciliVar },
      { id: 'vurgula', etiket: 'Vurgula', devre: !seciliVar },
      { id: 'not', etiket: 'Not ekle' },
      { id: 'ara', etiket: 'Ara', devre: !seciliVar },
      { ayirici: true },
      { id: 'tumunuSec', etiket: 'Tümünü seç' },
    ]);
    if (secim === 'kopyala') document.execCommand('copy');
    else if (secim === 'ara') komutCalistir('duzen.bul', secimHamMetni().trim().split('\n')[0]);
    else if (secim === 'tumunuSec') tumunuSec();
    else if (secim === 'vurgula') belge.notlar.vurguUygula(ayar.vurguRengi || VURGU_RENKLERI[0].hex);
    else if (secim === 'not') { if (!(seciliVar && belge.notlar.secimeNotKoy())) belge.notlar.yapiskanNotKoy(+sayfaEl.dataset.sayfa - 1, e); }
  });
}

document.addEventListener('copy', (e) => {
  const sec = window.getSelection();
  if (!sec || sec.isCollapsed || !sec.anchorNode) return;
  const katman = (sec.anchorNode.nodeType === 1 ? sec.anchorNode : sec.anchorNode.parentElement)?.closest('.textLayer');
  if (!katman) return;
  e.preventDefault();
  const ham = ayar.temizMetin === false ? secimHamMetni() : (secimYapiliMetni() || secimHamMetni());
  const metin = ayar.temizMetin === false ? hamMetin(ham) : temizMetin(ham);
  e.clipboardData.setData('text/plain', metin);
  if (ayar.temizMetin === false) return;
  // Çekirdekten (PyMuPDF) daha temiz bir sürüm iste; hazır olunca panoyu güncelle
  const b = aktif();
  if (!b) return;
  const satirlar = satirlaraBirlestir(secimDikdortgenleri());
  if (!satirlar.size) return;
  (async () => {
    const parcalar = [];
    for (const [sayfa, liste] of [...satirlar.entries()].sort((a, b2) => a[0] - b2[0])) {
      const g = b.gorunum;
      const kutular = [];
      for (const l of liste) {
        const [x0, y0] = await g.pikselToPdf(sayfa - 1, l.x0, l.y);
        const [x1, y1] = await g.pikselToPdf(sayfa - 1, l.x1, l.y + l.h);
        // PDF koordinatı alt-sol kökenli; PyMuPDF üst-sol ister
        const yuk = g.sayfalar[sayfa - 1].pt.h;
        kutular.push([Math.min(x0, x1) - 1, yuk - Math.max(y0, y1) - 1, Math.max(x0, x1) + 1, yuk - Math.min(y0, y1) + 1]);
      }
      const r = await cekirdek('metin_sec', { yol: b.yol, sayfa, kutular });
      if (r.metin.trim()) parcalar.push(r.metin);
    }
    const cekirdekMetin = temizMetin(parcalar.join('\n'));
    // Çekirdek sürümü anlamlı biçimde farklı ve boş değilse panoyu güncelle
    if (cekirdekMetin && cekirdekMetin.length >= metin.length * 0.5 && cekirdekMetin.length <= metin.length * 1.5 + 40) await pdefe.cagir('pano:metin', cekirdekMetin);
  })().catch((err) => console.warn('Temiz kopya alınamadı', err));
});

// ---------------------------------------------------------------- sürükle-bırak
let surukleSayac = 0;
window.addEventListener('dragenter', (e) => { if (dosyaVarMi(e)) { surukleSayac++; $('#surukle-ortusu').hidden = false; } });
window.addEventListener('dragleave', () => { if (surukleSayac > 0 && --surukleSayac === 0) $('#surukle-ortusu').hidden = true; });
window.addEventListener('dragover', (e) => { if (dosyaVarMi(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
window.addEventListener('drop', async (e) => {
  surukleSayac = 0; $('#surukle-ortusu').hidden = true;
  if (!dosyaVarMi(e)) return;
  e.preventDefault();
  const yollar = [...e.dataTransfer.files].map((f) => pdefe.dosyaYolu(f)).filter((y) => /\.pdf$/i.test(y));
  for (const y of yollar) await dosyaAc(y);
});
function dosyaVarMi(e) { return e.dataTransfer && [...e.dataTransfer.types].includes('Files'); }

// ---------------------------------------------------------------- okuma modu: üstten fareyle araç çubuğu
document.addEventListener('mousemove', (e) => {
  if (!okumaModu) return;
  document.body.classList.toggle('ust-goster', e.clientY < 6 || (document.body.classList.contains('ust-goster') && e.clientY < 48));
});

// ---------------------------------------------------------------- paylaş
async function paylas() {
  const b = aktif(); if (!b) return;
  if (b.degisti) {
    const { secim } = await mesajKutusu({ mesaj: 'Belgede kaydedilmemiş değişiklikler var.', ayrinti: 'Paylaşmadan önce kaydetmek ister misiniz?', dugmeler: ['Kaydet ve paylaş', 'Kaydetmeden paylaş', 'Vazgeç'], iptal: 2 });
    if (secim === 2) return;
    if (secim === 0 && !(await belgeKaydet(b))) return;
  }
  const r = await pdefe.cagir('pano:dosya', b.yol);
  bildir(r.tamam ? 'Dosya panoya kopyalandı — Ctrl+V ile yapıştırabilirsiniz' : 'Panoya kopyalanamadı: ' + r.hata);
}

// ---------------------------------------------------------------- diyaloglar
function mesajKutusu(secenek) { return pdefe.cagir('mesaj:kutu', secenek); }

async function parolaSor(ad, neden) {
  return new Promise((coz, reddet) => {
    const ortu = diyalogAc({
      baslik: 'Parola gerekli',
      govde: `<p>"${kacis(ad)}" belgesi parola korumalı.${neden === 2 ? ' <b>Parola yanlış.</b>' : ''}</p><input type="password" id="parola-girdi" style="width:100%;height:30px;padding:0 8px;border:1px solid var(--kenar);border-radius:4px;background:var(--arka)">`,
      dugmeler: [{ id: 'tamam', etiket: 'Aç', birincil: true }, { id: 'iptal', etiket: 'Vazgeç' }],
      onSecim: (id) => { if (id === 'tamam') coz(ortu.querySelector('#parola-girdi').value); else reddet(new Error('vazgeçildi')); },
    });
    const g = ortu.querySelector('#parola-girdi');
    g.focus();
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') ortu.querySelector('[data-id="tamam"]').click(); });
  });
}

function diyalogAc({ baslik, govde, dugmeler, onSecim, genislik }) {
  const ortu = document.createElement('div');
  ortu.className = 'diyalog-ortusu';
  ortu.innerHTML = `<div class="diyalog" ${genislik ? `style="width:${genislik}px"` : ''}><div class="baslik"></div><div class="govde"></div><div class="dugmeler"></div></div>`;
  ortu.querySelector('.baslik').textContent = baslik;
  ortu.querySelector('.govde').innerHTML = govde;
  const d = ortu.querySelector('.dugmeler');
  for (const b of dugmeler) {
    const btn = document.createElement('button');
    btn.className = b.birincil ? 'birincil' : 'ikincil';
    btn.style.marginTop = '0';
    btn.textContent = b.etiket; btn.dataset.id = b.id;
    btn.addEventListener('click', () => { ortu.remove(); onSecim?.(b.id); });
    d.append(btn);
  }
  ortu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ortu.remove(); onSecim?.(null); } });
  document.body.append(ortu);
  (ortu.querySelector('.birincil') || ortu.querySelector('button'))?.focus();
  return ortu;
}

function kisayollarGoster() {
  const satirlar = [
    ['Ctrl+O', 'Aç'], ['Ctrl+S', 'Kaydet'], ['Ctrl+Shift+S', 'Farklı kaydet'], ['Ctrl+W', 'Sekmeyi kapat'], ['Ctrl+P', 'Yazdır'],
    ['Ctrl+F', 'Bul'], ['F3 / Shift+F3', 'Sonraki / önceki eşleşme'], ['Ctrl+G', 'Sayfaya git'], ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'],
    ['Ctrl+Tab / Ctrl+Shift+Tab', 'Sekme değiştir (basılı tutunca seçici açılır)'], ['Ctrl+1…9', 'Sekme seç (9: son sekme)'],
    ['Ctrl+Fare tekerleği, Ctrl++ / Ctrl+−', 'Yakınlaştır / uzaklaştır'], ['Ctrl+0', 'Gerçek boyut'],
    ['Ctrl+Shift++ / Ctrl+Shift+−', 'Görünümü döndür'], ['F4', 'Sol panel'], ['Ctrl+H', 'Okuma modu'], ['F11', 'Tam ekran'],
    ['← → / PageUp PageDown', 'Önceki / sonraki sayfa'], ['↑ ↓', 'Kaydır'], ['Home / End', 'İlk / son sayfa'], ['Ctrl+Home / Ctrl+End', 'Belge başı / sonu'],
    ['Shift+Fare tekerleği', 'Yatay kaydırma'], ['Ctrl+A', 'Sayfadaki tüm metni seç'], ['Delete', 'Seçili notu sil'], ['Esc', 'Kapat / vazgeç'],
  ];
  diyalogAc({
    baslik: 'Klavye kısayolları',
    govde: '<table>' + satirlar.map(([k, a]) => `<tr><td><kbd>${k}</kbd></td><td>${a}</td></tr>`).join('') + '</table>',
    dugmeler: [{ id: 'tamam', etiket: 'Tamam', birincil: true }],
  });
}

async function hakkindaGoster() {
  const b = await pdefe.cagir('uygulama:bilgi');
  let cek = '';
  try { const p = await cekirdek('ping', {}); cek = `PyMuPDF ${p.pymupdf}`; } catch { cek = 'çekirdek çalışmıyor'; }
  diyalogAc({
    baslik: 'PDEfe hakkında',
    govde: `<p><b>PDEfe</b> — sürüm ${b.surum}</p><p>Geliştirici: <a href="https://x.com/CgrShn" target="_blank">x.com/CgrShn</a></p>
      <p class="soluk">Electron ${b.electron} · Chromium ${b.chrome} · ${cek}</p>
      <p class="soluk">Bu yazılım AGPL-3.0 lisansıyla dağıtılır. PDF.js (Mozilla), PyMuPDF/MuPDF (Artifex) ve diğer açık kaynak projeleri kullanır.</p>`,
    dugmeler: [{ id: 'tamam', etiket: 'Tamam', birincil: true }],
  });
}

// ---------------------------------------------------------------- yardımcılar
let _bildirimZaman = null;
export function bildir(metin, sure = 3000) {
  const el = $('#bildirim');
  el.textContent = metin; el.hidden = false;
  clearTimeout(_bildirimZaman);
  _bildirimZaman = setTimeout(() => { el.hidden = true; }, sure);
}
function dosyaAdi(yol) { return yol.split(/[\\/]/).pop(); }
function yolAyni(a, b) { return a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase(); }
function hataMetni(e) { return (e && (e.message || String(e))) || 'Bilinmeyen hata'; }
function kacis(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Bağlantılar dış tarayıcıda
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="http"]');
  if (a) { e.preventDefault(); pdefe.cagir('kabuk:disAc', a.href); }
});

// ---------------------------------------------------------------- başlat
(async function baslat() {
  await ayarlariYukle();
  sonDosyalariListele();
  // Önceki oturumu geri getir
  if (ayar.sekmeleriHatirla && Array.isArray(ayar.acikSekmeler) && ayar.acikSekmeler.length) {
    let aktifYol = null;
    for (const s of ayar.acikSekmeler) {
      if (s.aktif) aktifYol = s.yol;
      await dosyaAc(s.yol, { arkaPlanda: true, sayfa: s.sayfa });
    }
    if (aktifYol) { const b = [...belgeler.values()].find((x) => yolAyni(x.yol, aktifYol)); if (b) sekmeSec(b.id); }
  }
  pdefe.gonder('uygulama:hazir');
  window.__pdefe = { belgeler, aktif, dosyaAc, belgeKapat, sekmeSec, komutCalistir, ayar: () => ayar, panel, sekmeler, arama, temizMetin };
})();
