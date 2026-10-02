// PDEfe arayüz girişi: sekmeler, komutlar, kısayollar, ayarlar, sürükle-bırak.
import { Goruntuleyici, yolAnahtari, yaziCiziminiAyarla } from './goruntuleyici.js';
import { SekmeCubugu } from './sekmeler.js';
import { SolPanel } from './panel.js';
import { DurumCubugu, boyutMetni, sayfaKutusuBagla, sayfaKutusuYaz } from './durum.js';
import { Arama } from './arama.js';
import { temizMetin, sayfaMetinleriniBirlestir, secimDikdortgenleri, satirlaraBirlestir, paragrafSec, secimHamMetni, secimYapiliMetni, surukleSecimiBagla } from './metin.js';
import { NotYoneticisi, VURGU_RENKLERI } from './notlar.js';
import { KomutYigini, Komut } from './komutlar.js';
import { ayarlarPenceresiAc, ayarlarPenceresiKapat } from './ayarlarPenceresi.js';
import { aracKomutlari, aracPencereleriniKapat, aracPenceresiKapaninca, acikAracPenceresiVar } from './araclar/index.js';
import { sekmeyiYenile } from './araclar/ortak.js';
import { AraclarPenceresi, ARACLAR } from './aracPenceresi.js';
import { guncellemeSeridiKur } from './guncelleme.js';
import { yazdir } from './yazdir.js';
import { ortuTiklamasiBagla } from './ortu.js';
import { mesajKutusu as mesajKutusuAc, mesajKutusuAcik, mesajKutusuUyar, kaydetmedenCikisSorusu } from './mesajKutusu.js';
import { BaslangicEkrani } from './baslangic.js';

const $ = (s) => document.querySelector(s);
const pdefe = window.pdefe;

// ---------------------------------------------------------------- durum
let ayar = {};
let varsayilanlar = {};
const belgeler = new Map();     // id → Belge
let aktifId = null;
let sayac = 0;
let sistemKoyu = false;
let okumaModu = false;
let ilerlemeSayac = 0;

const cekirdek = (yontem, params, ilerleme) => {
  const istekId = ++ilerlemeSayac;
  if (ilerleme) ilerlemeDinleyiciler.set(istekId, ilerleme);
  const soz = pdefe.cagir('cekirdek:cagir', yontem, params, istekId).finally(() => ilerlemeDinleyiciler.delete(istekId));
  soz.istekId = istekId;                                   // araç pencereleri iptal için kullanır
  soz.iptal = () => pdefe.cagir('cekirdek:iptal', istekId);
  return soz;
};
const ilerlemeDinleyiciler = new Map();
pdefe.dinle('cekirdek:ilerleme', (istekId, ilerleme) => ilerlemeDinleyiciler.get(istekId)?.(ilerleme));

// ---------------------------------------------------------------- bileşenler
const sekmeler = new SekmeCubugu({
  cubuk: $('#sekme-cubugu'), liste: $('#sekme-liste'), onceki: $('#sekme-onceki'), sonraki: $('#sekme-sonraki'),
  acilir: $('#sekme-acilir'), secici: $('#sekme-secici'), belgeListesi: $('#belge-listesi'),
  aramaSay: (id, sorgu, secenek) => arama.belgedeSay(belgeler.get(id), sorgu, secenek),   // arama aşağıda kurulur; çağrı anında hazırdır. secenek: { iptal }
  // Sekme çubuğun dışına sürüklenince ayrılabilir mi: yüklenmiş belge sekmesi (açılış sekmesi ayrılmaz), süren taşıma ve açık pencere yok
  ayrilabilir: (id) => { const b = belgeler.get(id); return !!b && !tasimaEngeli(b, { kayitHaric: true }); },
});
const panel = new SolPanel({
  panel: $('#sol-panel'), tutamac: $('#panel-tutamac'), sayfalar: $('#panel-sayfalar'), icindekiler: $('#panel-icindekiler'),
  yorumlar: $('#panel-yorumlar'), sekmeler: $('#sol-panel .panel-sekmeler'), cekirdek,
});
const durum = new DurumCubugu({
  sayfaKutusu: $('#durum-sayfa-kutusu'), sayfaToplam: $('#durum-sayfa-toplam'), zoom: $('#durum-zoom'), boyut: $('#durum-boyut'),
  degisiklik: $('#durum-degisiklik'), mesaj: $('#durum-mesaj'), onSayfayaGit: (no) => aktif()?.gorunum.sayfayaGit(no),
  onBirak: () => aktif()?.gorunum.kaydirici.focus(),
});

function aktif() { return aktifId ? belgeler.get(aktifId) : null; }

const arama = new Arama({ kutu: $('#bul-kutusu'), belgeAl: aktif, belgeler, sekmeSec: (id) => sekmeSec(id), cekirdek });
arama.addEventListener('yerimineGit', (e) => panel.yerimineGit({ dest: e.detail.oge.dest, title: e.detail.oge.baslik }, e.detail.belge));
arama.addEventListener('notaGit', (e) => { const b = e.detail.belge; const n = [...(b.notlar?.notlar.values() || [])].find((x) => x.xref === e.detail.not.xref); if (n) b.notlar.notaGit(n.id); });

// ---------------------------------------------------------------- ayarlar ve tema
async function ayarlariYukle() {
  ayar = await pdefe.cagir('ayar:al');
  varsayilanlar = await pdefe.cagir('ayar:varsayilanlar').catch(() => ({}));
  sistemKoyu = await pdefe.cagir('tema:sistemKoyu');
  yaziCiziminiAyarla(ayar.yaziCizimi !== 'sistem');
  temaUygula();
  menuDugmesiGuncelle();
  panel.genislikAyarla(ayar.solPanelGenislik || 240);
  if (ayar.solPanelAcik) panel.acKapa(true);
  panel.sekmeSec(ayar.solPanelSekme || 'sayfalar');
}

function ayarKoy(anahtar, deger) { ayar[anahtar] = deger; return pdefe.cagir('ayar:koy', anahtar, deger); }

function koyuMu() { return ayar.tema === 'sistem' ? sistemKoyu : ayar.tema === 'koyu'; }

function temaUygula() {
  document.documentElement.dataset.tema = koyuMu() ? 'koyu' : 'acik';
  $('#dugme-tema').title = koyuMu() ? 'Koyu tema açık — açık temaya geç' : 'Açık tema açık — koyu temaya geç';   // düğme şu anki temanın simgesini gösterir (koyu: ay, açık: güneş)
  for (const b of belgeler.values()) { b.gorunum.koyuSayfaAyarla(koyuMu() && ayar.sayfayiKoyulastir); b.notlar?.hepsiniCiz(); }   // vurgu karışımı koyu sayfaya göre
}

pdefe.dinle('tema:sistem', (koyu) => { sistemKoyu = koyu; temaUygula(); });

/** Menü çubuğu düğmesi (0.1.24): basılıyken çubuk görünür. Çubuğu ana süreç gösterir / gizler (ayar:koy → menuCubugunuUygula). */
function menuDugmesiGuncelle() {
  const d = $('#dugme-menu'), acik = !!ayar.menuCubugu;
  d.classList.toggle('secili', acik);
  d.setAttribute('aria-pressed', String(acik));
  d.title = acik ? 'Menü çubuğunu gizle' : 'Menü çubuğunu göster';
}

/** Ayarlar penceresinden gelen değişiklikleri canlı uygular. */
function ayarUygula(anahtar, deger) {
  switch (anahtar) {
    case 'tema': case 'sayfayiKoyulastir': temaUygula(); break;
    case 'vurguRengi': secimCubuguYenile(); break;
    case 'yaziCizimi': yaziCiziminiAyarla(deger !== 'sistem'); break;   // yeni açılan belgelerde
    case 'otomatikKaydet': if (deger) for (const b of belgeler.values()) if (b.degisti) kirliGuncelle(b); break;
    case 'varsayilanDuzen': case 'kapakAyri': duzenEsitle(aktif()); break;   // diğer sekmeler seçildiklerinde eşitlenir
    // Kapatılınca kayıt silinir; açıkken yeni açılan belgeler yeniden eklenir (bkz. sonDosyalaraEkle, konumlariYaz)
    case 'sonAcilanlariHatirla': if (deger) sonDosyalariListele(); else komutCalistir('dosya.sonTemizle'); break;
    case 'kaldigimSayfadanAc': if (!deger) { clearTimeout(_konumZaman); ayarKoy('sayfaKonumlari', {}); } break;
    default: break;   // yazarAdi, yazı tipi vb. ayar nesnesinden okunur; anında etkili
  }
}

// ---------------------------------------------------------------- belge açma / kapatma
/** Sekmenin belge nesnesini, görünümünü, geri al yığınını ve not yöneticisini kurar, olaylarını bağlar. Belge henüz yüklenmez, sekmesi
 *  eklenmez: dosyadan açan (dosyaAc) ve başka pencereden taşınan sekmeyi kuran (sekmeyiAl) çağırır. */
function belgeOlustur(yol) {
  const id = 'b' + (++sayac);
  const el = document.createElement('div');
  el.className = 'gorunum';
  el.hidden = true;
  $('#gorunumler').append(el);
  const gorunum = new Goruntuleyici(el, { dosyaOku: async (y) => (await pdefe.cagir('dosya:oku', y)).veri, cekirdek });
  // diskDondurme: yüklenen dosyaya (gorunum.yol) artımlı kayıtla işlenmiş göreli döndürmeler, kaynak sayfa no → açı (bkz. yapisalTarif)
  const belge = { id, yol, ad: dosyaAdi(yol), el, gorunum, degisti: false, boyut: 0, bilgi: null, diskDondurme: {} };
  belgeler.set(id, belge);
  gorunum.addEventListener('sayfa', (e) => { if (aktifId === id) { sayfaGoster(belge); } sayfaKonumuKaydet(belge); gizlenenNotuBirak(belge); });
  gorunum.addEventListener('zoom', (e) => { if (aktifId === id) zoomGoster(belge); });
  gorunum.addEventListener('metinKatmani', (e) => arama.katmanCizildi(gorunum, e.detail.sayfa));
  gorunum.addEventListener('sayfalar', () => { arama.belgeUnut(gorunum); if (aktifId === id) { sayfaGoster(belge); panel.belgeAyarla(belge); } kirliGuncelle(belge); });
  gorunum.addEventListener('baglanti', (e) => baglantiyaGit(belge, e.detail));
  metinOlaylariBagla(belge);
  belge.yigin = new KomutYigini();
  belge.notlar = new NotYoneticisi({ belge, cekirdek, ayar: () => ayar, yigin: belge.yigin, alan: $('#belge-alani') });
  belge.yigin.addEventListener('degisti', () => kirliGuncelle(belge));
  belge.notlar.addEventListener('degisti', () => { kirliGuncelle(belge); if (aktifId === id) panel.yorumlariYenile(); });
  belge.notlar.addEventListener('arac', (e) => { if (aktifId === id) aracDugmeleriniGuncelle(e.detail.arac); });
  // Yazı düzenleyicisi açılınca, kapanınca ve geçmişi değişince Geri al / Yinele düğmeleri; kapanınca beklettiği otomatik kayıt yeniden kurulur
  belge.notlar.addEventListener('duzenleyici', () => { if (!belge.notlar.duzenleyici && belge.degisti) kirliGuncelle(belge); else if (aktifId === id) geriAlDugmeleriniGuncelle(belge); });
  belge.notlar.addEventListener('uyari', (e) => { if (aktifId === id) bildir(e.detail.metin, 6000); });
  belgeleriBildir();
  return belge;
}

/** Bu pencerenin açık belgelerini ana sürece bildirir (pencereler.js): dosya yalnızca bir pencerede açık olur, Gezgin'den açılan ya da
 *  başka pencerede açılmak istenen dosya açık olduğu pencerede gösterilir. Liste değişince çağrılır. */
let _bildirilenBelgeler = '[]';
function belgeleriBildir() {
  const yollar = [...belgeler.values()].map((b) => b.yol), anahtar = JSON.stringify(yollar);
  if (anahtar === _bildirilenBelgeler) return;
  _bildirilenBelgeler = anahtar;
  pdefe.gonder('pencere:belgeler', yollar);
}

async function dosyaAc(yol, secenek = {}) {
  // Zaten açıksa o sekmeye geç; açılış sekmesinden açılmak istendiyse o sekme kapanır (işi bitti). secenek.yenile: araç sekmeyi
  // diskteki yeni hâliyle yeniden açıyor (ortak.js sekmeyiYenile, küçült): kapanan sekmenin yerine geçici olarak seçilmiş açılış
  // sekmesi tüketilmez
  const acilistan = !secenek.arkaPlanda && !secenek.yenile && baslangicSekmeleri.has(aktifId);
  for (const b of belgeler.values()) if (yolAyni(b.yol, yol)) {
    const bos = acilistan ? aktifId : null;
    sekmeSec(b.id);
    if (bos) baslangicSekmesiniKapat(bos);
    return b;
  }
  // Başka bir pencerede açıksa o pencere öne gelir ve sekmesine geçer; burada ikinci kez açılmaz (iki kopya birbirinin kaydını ezerdi).
  // secenek.yazildi: araç dosyayı az önce yeniden yazdı; öteki penceredeki sekmesi diskteki yeni hâliyle yeniden açılır
  if (!secenek.yenile && await pdefe.cagir('pencere:baskaPenceredeAc', yol, { yazildi: !!secenek.yazildi }).catch(() => false)) return null;
  const varMi = await pdefe.cagir('dosya:varMi', yol);
  if (!varMi) { bildir('Dosya bulunamadı: ' + yol); sonDosyalardanCikar(yol); return null; }

  const belge = belgeOlustur(yol);
  const { id, ad, gorunum } = belge;
  // Açılış sekmesi (+ / Ctrl+T) etkinken önde açılan belge o sekmenin yerini alır (tarayıcıdaki gibi); arka planda açılan sona eklenir.
  // Pencerenin tek sekmesi açılış sekmesiyse her açılan belge onun yerini alır (birden çok açılış sekmesi varsa arka planda açılan sona eklenir)
  const yerine = (acilistan && baslangicSekmeleri.has(aktifId) ? aktifId : null) || tekAcilisSekmesi();
  sekmeler.ekle({ id, ad, yol, once: yerine });
  if (yerine) { baslangicSekmeleri.delete(yerine); sekmeler.kaldir(yerine); aktifId = null; }
  if (!secenek.arkaPlanda || !aktifId) sekmeSec(id);

  try {
    const { veri, boyut } = await pdefe.cagir('dosya:oku', yol);
    belge.boyut = boyut;
    const sonSayfa = ayar.kaldigimSayfadanAc ? (ayar.sayfaKonumlari || {})[yol] : null;
    const zoom = ayar.varsayilanZoom;
    // İki sayfa düzeninde belge her zaman sayfaya sığdırılarak açılır (bkz. Goruntuleyici.duzenAyarla)
    const zoomModu = duzenIkiMi(genelDuzen()) ? 'sayfa' : ['genislik', 'sayfa', 'gercek', 'gorunur'].includes(zoom) ? zoom : 'serbest';
    const olcek = zoom === 'son' ? (ayar.sonZoom || 100) / 100 : (typeof zoom === 'number' ? zoom / 100 : 1);
    gorunum.koyuSayfa = koyuMu() && ayar.sayfayiKoyulastir;
    await gorunum.yukle(veri, {
      yol, duzen: genelDuzen(), kapakAyri: !!ayar.kapakAyri, zoomModu, olcek,
      sayfa: secenek.sayfa || sonSayfa || 1,
      parolaIste: (neden) => parolaSor(ad, neden),
    });
    cekirdek('belge_bilgi', { yol }).then((bilgi) => { belge.bilgi = bilgi; }).catch(() => {});
    // notSozu: notların dosyadan ilk okunması (sekme başka pencereye taşınmadan önce beklenir, bkz. sekmePaketi)
    belge.notSozu = belge.notlar.yukle().catch((e2) => console.warn('Notlar yüklenemedi', e2));
  } catch (e) {
    console.error(e);
    // Açılamadı (bozuk dosya, parola sorusunda Vazgeç): yerini aldığı açılış sekmesi aynı yere geri gelir, kullanıcı orada kalır
    if (yerine && !baslangicSekmeleri.has(yerine) && sekmeler.bul(id)) {
      baslangicSekmeleri.add(yerine);
      sekmeler.ekle({ id: yerine, ad: 'Yeni sekme', yol: '', once: id, baslangic: true });
      if (aktifId === id) sekmeSec(yerine);
    }
    belgeKapat(id, { zorla: true });
    await mesajKutusu({ tur: 'error', mesaj: 'PDF açılamadı', ayrinti: `${ad}\n\n${hataMetni(e)}` });
    return null;
  }
  if (aktifId === id) { duzenEsitle(belge); sayfaGoster(belge); zoomGoster(belge); durum.boyutYaz(belge.boyut); panel.belgeAyarla(belge); arama.sekmeDegisti(); }
  sonDosyalaraEkle(yol);
  return belge;
}

async function sekmeSec(id) {
  const b = belgeler.get(id);
  const bas = baslangicSekmeleri.has(id);
  if (!b && !bas) return;
  if (aktifId && aktifId !== id) {
    const eski = belgeler.get(aktifId);
    if (eski) {
      eski.notlar?.balonKapat(); eski.notlar?.notCubuguKapat(); eski.notlar?.duzenleyiciBitir(true);
      eski.gorunum.gizlenecek();            // sayfa içi konum: arka plandaki sekme başka pencereye taşınırsa orada aynı yerde açılsın
      eski.el.hidden = true;
      eski.gorunum.arkaPlanaAlindi();       // görünür sayfalar dışındaki tuvaller bırakılır (gizli sekme bellek tutmasın)
      eski.notlar?.secimCubuguKonumla();   // görünümü gizlendi: seçim çubuğu da gizlenir (açılış sekmesinde belgenin boyutDegisti'si yok)
    }
  }
  aktifId = id;
  sekmeler.aktifYap(id);
  if (bas) { baslangicGoster(); return; }   // açılış sekmesi: belge alanında açılış ekranı
  $('#baslangic').hidden = true;
  b.el.hidden = false;
  duzenEsitle(b);   // genel düzen/kapak bu sekme arka plandayken değiştiyse şimdi uygula
  belgeDurumuYaz(b);
  pdefe.cagir('pencere:baslik', b.ad);
  panel.belgeAyarla(b);
  b.gorunum.boyutDegisti();
  b.gorunum.kaydirici.focus({ preventScroll: true });
  arama.sekmeDegisti();   // Bul kutusu açıksa sayaç önceki belgenin sonuçlarında kalmasın
}

/** Araç çubuğunda ve durum çubuğunda belgeye bağlı her şeyi (sayfa kutusu ve toplam, yakınlaştırma, boyut, kaydedilmemiş değişiklik,
 *  Kaydet, Geri al / Yinele ve ipuçları, not araçları) etkin sekmeye göre yazar; b yoksa (başlangıç ekranı) ilk duruma döndürür. */
function belgeDurumuYaz(b) {
  if (b) { sayfaGoster(b); zoomGoster(b); }
  else {
    durum.sayfa(0, 0); durum.zoomYaz(1);
    sayfaKutusuYaz($('#sayfa-kutusu'), ''); sayfaKutusuGenislik(0); $('#sayfa-toplam').textContent = '/ 0';
    zoomKutusuYaz(1);
  }
  durum.boyutYaz(b ? b.boyut : null); durum.degisiklikYaz(!!b?.degisti);
  $('#arac-cubugu [data-komut="dosya.kaydet"]').disabled = !b?.degisti;
  geriAlDugmeleriniGuncelle(b);
  aracDugmeleriniGuncelle(b?.notlar?.arac || null);
}

function kirliGuncelle(b) {
  b.degisti = !!(b.yigin?.kirli || b.gorunum.yapisalKirli() || (!b.gorunum.anlik && b.notlar?.kirli));
  sekmeler.guncelle(b.id, { degisti: b.degisti });
  if (aktifId === b.id) { durum.degisiklikYaz(b.degisti); geriAlDugmeleriniGuncelle(b); }
  $('#arac-cubugu [data-komut="dosya.kaydet"]').disabled = !aktif()?.degisti;
  // Yazı düzenlenirken otomatik kayıt beklenir (kayıt düzenlemeyi uygulayıp kutuyu yazarken kapatırdı); düzenleme bitince not
  // değişikliği kirliGuncelle'yi yeniden çağırır. Otomatik kayıt başarısız olduysa (dosya başka programda açık) elle kaydedilene dek durur
  // (Zamanlayıcı dolunca ayar yeniden okunur: arada Ayarlar'dan kapatılmış olabilir)
  // Başka pencereye taşınmakta olan sekme (b.tasiniyor) kaydedilmez: durumu paketlendi, kayıt hedef pencerenin işidir
  if (ayar.otomatikKaydet && b.degisti && !b._otoKayitDurdu && !b.tasiniyor) { clearTimeout(b._otoKayit); b._otoKayit = setTimeout(() => { if (ayar.otomatikKaydet && b.degisti && belgeler.has(b.id) && !b.notlar?.duzenleyici && !b.tasiniyor) belgeKaydet(b, false, true); }, 1500); }
}

/** Kaydırmasız (tek/iki) düzende sayfa çevrilince artık gösterilmeyen sayfadaki not bırakılır: açık yazı düzenleyicisi kaydedilip
 *  kapanır, balon kapanır, seçim kalkar (Delete görünmeyen notu silmesin). Gösterilen satırdaki sayfaların yerleşimi vardır. */
function gizlenenNotuBirak(b) {
  const g = b.gorunum, n = b.notlar;
  if (!n || g.surekli()) return;
  const gizli = (sayfa) => !g.yerlesim[sayfa - 1];
  if (n.duzenleyici && gizli(n.duzenleyici.not.sayfa)) n.duzenleyiciBitir(true);
  if (n.balon && gizli(n.notlar.get(n.balonNotId)?.sayfa)) n.balonKapat();
  if (n.secili && gizli(n.notlar.get(n.secili)?.sayfa)) n.sec(null);
}

function geriAlDugmeleriniGuncelle(b) {
  const g = $('#dugme-geri-al'), y = $('#dugme-yinele');
  // Yazı düzenlenirken düğmeler düzenleyicinin kendi geçmişini gösterir (komut da ona gider; bkz. geriAlYinele)
  const dg = b?.notlar?.duzenleyiciGecmisi();
  const ga = dg ? dg.geri : b?.yigin?.geriAlinacak?.ad, yi = dg ? dg.ileri : b?.yigin?.yinelenecek?.ad;
  g.disabled = !ga; y.disabled = !yi;
  g.title = ga ? `Geri al: ${ga} (Ctrl+Z)` : 'Geri al (Ctrl+Z)';
  y.title = yi ? `Yinele: ${yi} (Ctrl+Y)` : 'Yinele (Ctrl+Y)';
}

function aracDugmeleriniGuncelle(arac) {
  document.querySelectorAll('#not-araclari [data-arac]').forEach((el) => el.classList.toggle('secili', el.dataset.arac === arac));
}

async function belgeKapat(id, secenek = {}) {
  const b = belgeler.get(id);
  if (!b) return true;
  if (b.tasiniyor) return false;      // sekme başka pencereye geçiyor ya da oradan kuruluyor: durumu paketlendi, kapatılmaz
  b.notlar?.duzenleyiciBitir(true);   // açık yazı düzenlemesi uygulanır: yazılan metin kaydetme sorusunda sayılsın
  // Süren kayıt yarıda kesilmesin (anlık kopya silinir, 'Kaydet' kaydediliyor koruması yüzünden sessizce false dönerdi); bitince degisti yeniden değerlendirilir
  await kayitBitmesiniBekle(b);
  if (!belgeler.has(id)) return true;   // beklerken başka yoldan kapatılmış
  if (b.degisti && !secenek.zorla) {
    const { secim } = await mesajKutusu(kaydetmedenCikisSorusu(b.ad));
    if (secim === 2) { if (belgeler.has(id)) kirliGuncelle(b); return false; }   // kapatılmadı: otomatik kayıt zamanlayıcısı yeniden kurulsun
    if (secim === 0 && !(await kapatirkenKaydet(b))) return false;
    await kayitBitmesiniBekle(b);   // soru açıkken başlamış olabilecek (otomatik) kayıt
    if (!belgeler.has(id)) return true;
  }
  sayfaKonumuKaydet(b, true);
  belgeyiKaldir(b);
  return true;
}

/** Sekmeyi ve belgesini sormadan pencereden kaldırır (belgeKapat ve sekme taşıma). devredildi: sekme başka pencereye geçti (ya da oradan
 *  gelip açılamadı): anlık kopya ve çekirdekte açık dosyalar öteki pencerenindir, silinmez ve bırakılmaz. */
function belgeyiKaldir(b, { devredildi = false } = {}) {
  const id = b.id;
  clearTimeout(b._otoKayit); b._otoKayit = null;
  const yollar = sekmeninYollari(b);   // görünüm yok edilmeden: başka PDF'ten eklenmiş sayfaların dosyaları da
  b.notlar?.yokEt();
  belgeler.delete(id);
  sekmeler.kaldir(id);
  panel.belgeUnut(id);
  arama.belgeUnut(b.gorunum);
  b.gorunum.yokEt();
  b.el.remove();
  if (!devredildi) {
    kullanilmayanlariBirak(yollar);
    if (b.gorunum.anlik) cekirdek('anlik_sil', { yol: b.gorunum.anlik }).catch(() => {});
  }
  if (aktifId === id) { aktifId = null; sonrakiSekmeyeGec(); }
  sekmesizKalmasin();
  belgeleriBildir();
}

// ---------------------------------------------------------------- açılış sekmeleri (0.1.13, kullanıcı isteği)
// Sekme çubuğundaki + ya da Ctrl+T tarayıcıdaki gibi açılış sayfasını yeni bir sekmede açar ("Yeni sekme"). Sekme belge değildir
// (belgeler'de yok; aktif() null): belge alanında #baslangic görünür, araç çubuğu açılış ekranındaki gibidir. Oradan önde açılan
// belge sekmenin yerini alır (dosyaAc).
// 0.1.21 (kullanıcı isteği): sekme çubuğu hiç kapanmaz. Pencere bir açılış sekmesiyle açılır, son sekme kapanınca yerine yeni açılış
// sekmesi gelir (yeni boş sekme açılmış gibi). Önceden açık belge kalmayınca açılış sekmeleri kalkıyor, çubuk gizleniyordu. Pencerenin
// tek sekmesi açılış sekmesiyse kapatılmaz (× yok; Ctrl+W pencereyi kapatır), pencerede açılan ya da başka pencereden gelen ilk belge
// onun yerini alır (tekAcilisSekmesi).
// 0.1.22 (kullanıcı isteği): belgesiz pencerede de + / Ctrl+T yeni boş sekme açar; son belge kapanınca yanındaki açılış sekmeleri kalır
// (tarayıcıdaki gibi). 0.1.21'de belgesiz pencerede tek açılış sekmesi kalıyor, + / Ctrl+T yeni sekme açmıyordu.
const baslangicSekmeleri = new Set();
let baslangicSayac = 0;

/** Yeni açılış sekmesi (sona), etkin olur. */
function yeniSekme() {
  const id = 'y' + (++baslangicSayac);
  baslangicSekmeleri.add(id);
  sekmeler.ekle({ id, ad: 'Yeni sekme', yol: '', baslangic: true });
  sekmeSec(id);
}

/** Pencerenin tek sekmesi açılış sekmesiyse onun kimliği, değilse null. */
function tekAcilisSekmesi() {
  const s = sekmeler.sekmeler;
  return s.length === 1 && baslangicSekmeleri.has(s[0].id) ? s[0].id : null;
}

/** Açılış sekmesini kapatır; pencerenin tek sekmesiyse kapatmaz (çubuk boş kalmasın). Kapandıysa true. */
function baslangicSekmesiniKapat(id) {
  if (!baslangicSekmeleri.has(id) || tekAcilisSekmesi() === id) return false;
  baslangicSekmeleri.delete(id);
  sekmeler.kaldir(id);
  if (aktifId === id) { aktifId = null; sonrakiSekmeyeGec(); }
  return true;
}

/** Belge ya da açılış sekmesi kapatır (sekme × düğmesi, orta tık, Ctrl+W, sağ tık menüsü). */
function sekmeKapat(id, secenek) { return baslangicSekmeleri.has(id) ? Promise.resolve(baslangicSekmesiniKapat(id)) : belgeKapat(id, secenek); }

/** Etkin sekme kapandıktan sonra: en son kullanılan sekme; sekme kalmadıysa yeni açılış sekmesi. */
function sonrakiSekmeyeGec() {
  const sonraki = sekmeler.mru[0] || sekmeler.sekmeler[0]?.id;
  if (sonraki) sekmeSec(sonraki); else yeniSekme();
}

/** Sekme çubuğu boş kalmaz: sekme kalmadıysa açılış sekmesi açılır; etkin sekme yoksa sonrakine geçilir. Belgenin yanındaki açılış
 *  sekmeleri belge kapanınca olduğu gibi kalır (0.1.22). */
function sekmesizKalmasin() {
  if (!sekmeler.sekmeler.length) yeniSekme();
  else if (!aktifId) sonrakiSekmeyeGec();
}

// ---------------------------------------------------------------- çekirdeğin belge önbelleği
// Çekirdek okuduğu PDF'leri önbellekte açık tutar; açık tanıtıcı varken Windows'ta dosya silinemez, adı değiştirilemez. Sekme kapanınca
// sekmenin dosyaları (başka PDF'ten eklenmiş sayfalarınkiler dahil), son araç penceresi kapanınca araçların okuttuğu dosyalar (Görüntü /
// PDF birleştir listesi, Sayfaları düzenle'de PDF'ten sayfa ekle…) bırakılır; açık bir sekmenin kullandığı dosya bırakılmaz (0.1.12:
// araç kapandıktan sonra birleştirme listesindeki dosya PDEfe kapanana dek silinemiyordu).
const aracYollari = new Map();   // yolAnahtari → yol: araç pencerelerinin çekirdeğe okuttuğu dosyalar

/** Çekirdek isteğindeki (okunacak) dosya yolları: yol, oge.yol (boyut tahmini), ogeler[].yol (birleştir), tarif[].kaynak. Yazılacak
 *  hedefler (hedef, hedefKlasor) okunmaz, sayılmaz. */
function cekirdekYollari(p) {
  if (!p || typeof p !== 'object') return [];
  const y = [p.yol, p.oge?.yol];
  if (Array.isArray(p.ogeler)) for (const o of p.ogeler) y.push(o?.yol);
  if (Array.isArray(p.tarif)) for (const t of p.tarif) y.push(typeof t?.kaynak === 'string' ? t.kaynak : t?.kaynak?.yol);
  return y.filter((x) => typeof x === 'string' && x);
}

/** Araç pencerelerine verilen çekirdek: okuttuğu dosyaları aracYollari'na yazar (bkz. aracDosyalariniBirak). */
function aracCekirdek(yontem, params, ilerleme) {
  for (const y of cekirdekYollari(params)) aracYollari.set(yolAnahtari(y), y);
  return cekirdek(yontem, params, ilerleme);
}

/** Sekmenin çekirdekte açtırdığı dosyalar: kendi dosyası, yüklediği dosya ve sayfalarının kaynakları (anlık kopya hariç: anlik_sil). */
function sekmeninYollari(b) {
  const g = b.gorunum, anlik = g?.anlik ? yolAnahtari(g.anlik) : null;
  return [b.yol, g?.yol, ...(g?.sayfalar || []).map((s) => s?.kaynak?.yol)].filter((y) => y && yolAnahtari(y) !== anlik);
}

/** Açık sekmelerin kullanmadığı yolları çekirdek önbelleğinden bırakır (istekler sırayla işlenir: süren okumadan sonra bırakılır). */
function kullanilmayanlariBirak(yollar) {
  const kullanilan = new Set();
  for (const x of belgeler.values()) {
    for (const y of sekmeninYollari(x)) kullanilan.add(yolAnahtari(y));
    if (x.gorunum?.anlik) kullanilan.add(yolAnahtari(x.gorunum.anlik));
  }
  const gonderilen = new Set();
  for (const y of yollar) {
    const a = y && yolAnahtari(y);
    if (!a || kullanilan.has(a) || gonderilen.has(a)) continue;
    gonderilen.add(a);
    cekirdek('belge_birak', { yol: y }).catch(() => {});
  }
}

/** Son araç penceresi kapanınca araçların okuttuğu dosyaları bırakır (başka araç penceresi açıkken beklenir). */
function aracDosyalariniBirak() {
  if (acikAracPenceresiVar()) return;
  const yollar = [...aracYollari.values()];
  aracYollari.clear();
  kullanilmayanlariBirak(yollar);
}

/** Pencere kapanınca çekirdekte bırakılacak dosyalar ve silinecek anlık kopyalar. Çekirdek bütün pencerelerin ortağıdır ve son pencere
 *  kapanana dek çalışır: kapanan pencerenin dosyaları önbellekte açık kalırsa öteki pencereler açık oldukça silinemez, adı değiştirilemez.
 *  Ana süreç pencere gerçekten kapandıktan sonra uygular (pencereler.js 'closed'). */
function kapanisDosyalari() {
  const yollar = new Map(), anliklar = new Set();
  for (const b of belgeler.values()) {
    for (const y of sekmeninYollari(b)) yollar.set(yolAnahtari(y), y);
    if (b.gorunum?.anlik) anliklar.add(b.gorunum.anlik);
  }
  for (const [a, y] of aracYollari) yollar.set(a, y);
  return { yollar: [...yollar.values()], anliklar: [...anliklar] };
}

/** Kapatma onaylandı (kaydedilmemiş belgeler soruldu ya da pencerede belge kalmadı): pencere kapanana dek başka pencereden sekme alınmaz.
 *  Pencere kapanmazsa (beklenmez) işaret kendiliğinden kalkar. */
function kapanisiOnayla() {
  _kapaniyor = true;
  setTimeout(() => { _kapaniyor = false; }, 3000);
  return pdefe.cagir('pencere:kapatOnayla', kapanisDosyalari());
}

/** Birden çok sekmeyi kapatır (sekmede sağ tık: Diğerlerini / Sağdakileri kapat), pencere kapatmadaki sırayla: önce değişikliği
 *  olmayanlar, sonra kaydedilmemiş değişikliği olanlar tek tek sorularak. Vazgeç (ya da başarısız kayıt) kalanları açık bırakır. */
async function sekmeleriKapat(idler) {
  for (const id of idler) if (baslangicSekmeleri.has(id)) baslangicSekmesiniKapat(id);   // açılış sekmesinde kaydedilecek bir şey yok
  const liste = idler.map((id) => belgeler.get(id)).filter(Boolean);
  for (const b of liste) b.notlar?.duzenleyiciBitir(true);
  for (const b of liste) if (belgeler.has(b.id)) await kayitBitmesiniBekle(b);   // süren kayıt bitince degisti kesinleşir
  for (const b of liste) if (belgeler.has(b.id) && !b.degisti) await belgeKapat(b.id);
  for (const b of liste) if (belgeler.has(b.id) && !(await belgeKapat(b.id))) break;
  for (const b of liste) if (belgeler.has(b.id) && b.degisti) kirliGuncelle(b);   // bekleme iptal ettiği otomatik kayıtlar yeniden kurulsun
}

function baslangicGoster() {
  $('#baslangic').hidden = false;
  belgeDurumuYaz(null);
  if (arama.acik) arama.kapat();   // aranacak belge kalmadı
  pdefe.cagir('pencere:baslik', '');
  panel.belgeAyarla(null);
  sonDosyalariListele();
}

// ---------------------------------------------------------------- sekmeyi başka pencereye taşıma (0.1.19, kullanıcı isteği)
// Sekme kendi penceresine ayrılır (sekmede sağ tık › Pencereye ayır; sekmeyi sekme çubuğunun dışına sürükleyip bırakmak) ya da başka bir
// PDEfe penceresinin sekme çubuğuna bırakılır. Her pencere ayrı bir renderer sürecidir: sekme nesne olarak taşınamaz, durumu paketlenir
// (sekmePaketi: belge baytları, sayfa düzeni, notlar, geri al yığını, görünüm). Ana süreç paketi hedef pencereye verir ('sekme:tasi',
// main/pencereler.js), hedef sekmeyi kurup onaylar (sekmeyiAl), bu pencere sekmeyi ancak o zaman bırakır (belgeyiKaldir devredildi).
// Kaydedilmemiş değişiklikler ve geri al geçmişi sekmeyle birlikte gider; hedef açamazsa sekme burada olduğu gibi kalır.
// Taşıma sürerken (tasimaSuruyor: bu pencereden sekme gidiyor ya da bu pencereye sekme kuruluyor) pencere girdi almaz: paketlenen durum
// ile sekme arasında fark oluşmasın, yarım kurulmuş sekme kapatılmasın.
let tasimaSuruyor = false;
let tasimaSozu = null;          // süren taşıma bitince çözülür (tasimaBitmesiniBekle)
// Güncelleme kurulumu bütün pencereleri kapatır: kapatmaya izin veren pencere kurulum başlayana (ya da vazgeçilene) dek girdi almaz;
// yoksa izinden sonra yapılan değişiklik sorulmadan kaybolurdu (öteki pencerenin sorusu açıkken bu pencereye dönüp not eklemek).
let kurulumKilidi = false;
let _kapanis = false;           // pencere kapatma isteği işleniyor (kaydedilmemiş belge soruları dahil)
let _kapaniyor = false;         // kapatma onaylandı, pencere kapanmak üzere
const girdiKilitli = () => tasimaSuruyor || kurulumKilidi;
const tasimaOrtusu = document.createElement('div');
tasimaOrtusu.id = 'tasima-ortusu'; tasimaOrtusu.hidden = true;
document.body.append(tasimaOrtusu);
const kilitOrtusunuGuncelle = () => { tasimaOrtusu.hidden = !girdiKilitli(); };
function kurulumKilidiKoy(deger) { kurulumKilidi = !!deger; kilitOrtusunuGuncelle(); }
// Pencere düzeyinde yakalama evresinde ilk dinleyici: kilitliyken hiçbir tuş uygulamaya, belgeye ya da açık kutuya gitmez. Mesaj kutusu
// açıksa (beklenmeyen bir hata sorusu) tuşlar ona gider, örtü de çekilir (stil.css): soru yanıtsız kalıp pencereyi kilitlemesin
for (const tur of ['keydown', 'keyup', 'keypress']) window.addEventListener(tur, (e) => { if (girdiKilitli() && !mesajKutusuAcik()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

/** Süren sekme taşıması (giden ya da gelen) varsa bitmesini bekler. */
async function tasimaBitmesiniBekle() { while (tasimaSozu) await tasimaSozu; }
/** Taşımayı başlatır (pencere girdiye kilitlenir); dönen işlev taşıma bitince çağrılır. */
function tasimaBaslat() {
  let bitti;
  const soz = new Promise((coz) => { bitti = coz; });
  tasimaSuruyor = true; tasimaSozu = soz; kilitOrtusunuGuncelle();
  return () => { tasimaSuruyor = false; if (tasimaSozu === soz) tasimaSozu = null; kilitOrtusunuGuncelle(); bitti(); };
}
/** Pencere kapanıyor ya da kapatmak için izin soruluyor mu (kapatma isteği, güncelleme kurulumu): bu sırada sekme alınmaz, verilmez. */
const kapanisSuruyor = () => _kapanis || _kapaniyor || !!_kapatmaIzni;

/** Sekme şu an başka pencereye taşınamıyorsa nedeni (kullanıcıya bildirilir), taşınabiliyorsa ''. b: belge (açılış sekmesinde yok).
 *  kayitHaric: süren kayda bakılmaz (sürükleme başında: kayıt sekme bırakılana dek biter; bırakılınca sekmeyiTasi bekler). */
function tasimaEngeli(b, { kayitHaric = false } = {}) {
  if (!b) return 'Açılış sekmesi pencereye ayrılamaz.';
  if (tasimaSuruyor || b.tasiniyor) return 'Bir sekme taşınıyor; bitince yeniden deneyin.';
  if (!belgeler.has(b.id) || !b.gorunum.hazir) return 'Belge henüz açılıyor; açılınca yeniden deneyin.';
  // Kilit altında süren kayıt beklenmez: başarısız olursa sorusu (Belge kaydedilemedi) taşıma kilidinin altında kalırdı
  if (b.kaydediliyor && !kayitHaric) return 'Belge kaydediliyor; bitince yeniden deneyin.';
  if (kurulumKilidi || kapanisSuruyor()) return 'Pencere kapanmak üzere; sekme taşınamaz.';
  if (ortuAcik()) return 'Önce açık pencereyi kapatın.';
  return '';
}

/** Komutun başka pencereye taşınabilen tarifi (nesneler yerine numara ve kimlikler); tarifi yoksa null. */
function komutDisari(b, k, girdiNo) {
  const t = k.tanim;
  if (t?.tur === 'sayfalar') return { tur: 'sayfalar', ad: k.ad, eski: t.eski.map(girdiNo), yeni: t.yeni.map(girdiNo) };
  return b.notlar.komutDisari(k);
}

/** Taşınan tariften komutu bu pencerenin nesneleriyle kurar (çalıştırmaz); tarif eksikse null. */
function komutIceri(b, veri, girdiAl, notBul) {
  if (veri?.tur === 'sayfalar') {
    const eski = (veri.eski || []).map(girdiAl), yeni = (veri.yeni || []).map(girdiAl);
    return eski.every(Boolean) && yeni.every(Boolean) ? sayfaKomutu(b, veri.ad, eski, yeni) : null;
  }
  return b.notlar.komutIceri(veri, notBul);
}

/** Sekmenin bütün durumu (başka pencerede sekmeyiAl ile kurulur). Açık not balonu ve yazı düzenlemesi önce uygulanır, süren kayıt ve
 *  bekleyen döndürme beklenir. */
async function sekmePaketi(b) {
  const g = b.gorunum, n = b.notlar;
  n.balonKapat(); n.notCubuguKapat(); n.duzenleyiciBitir(true);   // yazılan metin pakete girsin; seçili araç ve seçim taşınmaz
  await kayitBitmesiniBekle(b);                                     // süren kayıt bitsin; bekleyen otomatik kayıt iptal
  await (b._dondurme || Promise.resolve()).catch(() => {});          // sırada bekleyen döndürme
  await b.notSozu;                                                  // notların dosyadan ilk okunması
  if (!belgeler.has(b.id) || !g.hazir) throw new Error('Belge kapatıldı.');
  const { durum: gorunum, girdiNo } = await g.durumAl();
  if (!belgeler.has(b.id) || !g.hazir) throw new Error('Belge kapatıldı.');   // baytlar alınırken kapatılmış
  // Buradan sonra beklenmez: görünüm, notlar ve geri al yığını aynı andaki durumdan paketlenir
  const komutlar = b.yigin.yigin.map((k) => komutDisari(b, k, girdiNo));
  return {
    surum: 1, yol: b.yol, ad: b.ad, boyut: b.boyut, diskDondurme: { ...b.diskDondurme }, otoKayitDurdu: !!b._otoKayitDurdu, degisti: !!b.degisti,
    gorunum,
    notlar: n.durumAl(girdiNo, b.yigin.yigin.flatMap((k) => n.komutNotlari(k))),
    // Tarifi olmayan komut varsa geri al geçmişi taşınmaz (belge ve kaydedilmemiş değişiklikler yine taşınır)
    yigin: komutlar.every(Boolean) ? { komutlar, konum: b.yigin.konum, kayitKonumu: b.yigin.kayitKonumu } : null,
  };
}

/**
 * Sekmeyi başka pencereye taşır. hedef: { tur: 'yeni' } (yeni pencere, bu pencerenin yanında) | { tur: 'yeni', nokta, tutma, sekmeYeri }
 * (sekmenin bırakıldığı yerde) | { tur: 'pencere', pencere, x } (var olan pencere; x: sekme çubuğunda bırakıldığı yer). Döner: taşındı mı.
 */
async function sekmeyiTasi(id, hedef) {
  let b = belgeler.get(id);
  // Süren kayıt pencere kilitlenmeden önce beklenir: başarısız olursa sorusu yanıtlanabilsin. Beklerken sekme kapatılmış olabilir
  if (b?.kaydediliyor && b.kayitSozu && !girdiKilitli()) { await b.kayitSozu; b = belgeler.get(id); if (!b) return false; }
  const engel = tasimaEngeli(b);
  if (engel) { bildir(engel); return false; }
  const bitti = tasimaBaslat();
  b.tasiniyor = true;
  try {
    const paket = await sekmePaketi(b);
    const r = await pdefe.cagir('sekme:tasi', paket, hedef);
    if (!r?.tamam) throw new Error(r?.hata || 'Hedef pencere sekmeyi açamadı.');
    belgeyiKaldir(b, { devredildi: true });
    // Son belgesi başka bir pencereye taşınan pencere kapanır (açılış sekmeleri tek başına pencereyi açık tutmaz)
    if (hedef?.tur === 'pencere' && !belgeler.size) kapanisiOnayla();
    return true;
  } catch (e) {
    console.error('Sekme taşınamadı', e);
    b.tasiniyor = false;
    if (belgeler.has(b.id)) kirliGuncelle(b);   // beklerken iptal edilen otomatik kayıt yeniden kurulsun
    bildir('Sekme taşınamadı: ' + hataMetni(e), 6000);
    return false;
  } finally { bitti(); }
}

/** Başka pencereden taşınan sekmeyi kurar (sekmePaketi'nin verdiği paket). x: sekme çubuğunda bırakıldığı yer (pencere içi; yoksa sona
 *  eklenir). onayla: sekme kurulunca ana sürece bildirir; false dönerse ana süreç artık beklemiyordur (süresi doldu, sekme kaynak
 *  pencerede kaldı) ve burada kurulan sekme kaldırılır. Açılamazsa hata fırlatır; sekme kaynak pencerede kalır. Kurulurken pencere
 *  girdi almaz (yarım kurulmuş sekme kapatılırsa anlık kopyası silinirdi; o kopya taşıma bitene dek kaynak pencerenindir). */
async function sekmeyiAl(paket, { x = null } = {}, onayla = null) {
  if (!paket || paket.surum !== 1 || !paket.yol || !paket.gorunum) throw new Error('Sekme verisi okunamadı.');
  if (girdiKilitli() || ortuAcik()) throw new Error('Hedef pencere meşgul.');
  if (kapanisSuruyor()) throw new Error('Hedef pencere kapanıyor.');
  for (const b of belgeler.values()) if (yolAyni(b.yol, paket.yol)) throw new Error('Belge hedef pencerede zaten açık.');
  const bitti = tasimaBaslat();
  let belge = null;
  try {
    const once = x != null ? sekmeler.birakmaYeri(x) : null;
    belge = belgeOlustur(paket.yol);
    const { id, gorunum } = belge;
    belge.tasiniyor = true;   // kurulana dek kaydedilmez, kapatılmaz
    if (paket.ad) belge.ad = paket.ad;
    belge.boyut = paket.boyut || 0; belge.diskDondurme = { ...(paket.diskDondurme || {}) }; belge._otoKayitDurdu = !!paket.otoKayitDurdu;
    belge.notSozu = Promise.resolve();
    // Pencerenin tek sekmesi açılış sekmesiyse (yeni açılan pencere dahil) onun yerini alır; açılamazsa belgeyiKaldir yenisini açar.
    // Birden çok açılış sekmesi varsa (0.1.22) onlar kalır, sekme bırakıldığı yere eklenir
    const bos = tekAcilisSekmesi();
    sekmeler.ekle({ id, ad: belge.ad, yol: belge.yol, once });
    if (bos) { baslangicSekmeleri.delete(bos); sekmeler.kaldir(bos); if (aktifId === bos) aktifId = null; }
    sekmeSec(id);
    gorunum.koyuSayfa = koyuMu() && ayar.sayfayiKoyulastir;
    const girdiAl = await gorunum.durumdanYukle(paket.gorunum, { duzen: genelDuzen(), kapakAyri: !!ayar.kapakAyri });
    if (!girdiAl || !belgeler.has(id)) throw new Error('Sekme açılırken kapatıldı.');
    const notBul = belge.notlar.durumdanYukle(paket.notlar || {}, girdiAl);
    const y = paket.yigin;
    const komutlar = y ? y.komutlar.map((v) => komutIceri(belge, v, girdiAl, notBul)) : null;
    // Geri al geçmişi kurulamadıysa boş yığın: belge kaydedilmemiş değişiklik taşıyorsa kayıt konumu yok (-1), belge kirli kalır
    if (komutlar && komutlar.every(Boolean)) belge.yigin.durumKoy(komutlar, y.konum, y.kayitKonumu);
    else belge.yigin.durumKoy([], 0, paket.degisti ? -1 : 0);
    if (onayla && !(await onayla())) throw new Error('Sekme zamanında açılamadı.');
    if (!belgeler.has(id)) throw new Error('Sekme açılırken kapatıldı.');
    belge.tasiniyor = false;
    cekirdek('belge_bilgi', { yol: belge.yol }).then((bilgi) => { belge.bilgi = bilgi; }).catch(() => {});
    kirliGuncelle(belge);
    if (aktifId === id) { sayfaGoster(belge); zoomGoster(belge); durum.boyutYaz(belge.boyut); panel.belgeAyarla(belge); arama.sekmeDegisti(); }
    return belge;
  } catch (e) {
    if (belge && belgeler.has(belge.id)) belgeyiKaldir(belge, { devredildi: true });   // anlık kopya ve dosyalar kaynak pencerenindir
    throw e;
  } finally { bitti(); }
}

// Sürükleyerek ayırma (sekmeler.js): sekme çubuğun dışına çıkınca ('ayrildi') imleci izleyen önizleme gösterilir. Önizleme ana süreçte
// ayrı, odak almayan küçük bir penceredir (pencereler.js, hayalet.html): pencerenin dışında, başka ekranda da görünür; imleci ve altındaki
// pencereyi ana süreç izler. Bu pencere yalnızca sürüklemenin sürdüğünü bildirir ('sekme:surukleCan'; ses kesilirse önizleme kalkar).
const ONIZLEME_GENISLIK = 240, ONIZLEME_BASLIK = 30, ONIZLEME_EN_YUKSEK = 300;
let _surukleCan = null;
const surukleCaniDurdur = () => { clearInterval(_surukleCan); _surukleCan = null; };

/** Önizleme penceresinin boyutu ve görüntüsü: geçerli sayfanın ekranda görünen kısmından başlayan küçük görüntü (sayfa henüz
 *  çizilmediyse yalnızca başlık). Döner: { genislik, yukseklik, onizleme (data URL ya da '') }. */
function sekmeOnizlemesi(b) {
  const bos = { genislik: ONIZLEME_GENISLIK, yukseklik: ONIZLEME_BASLIK, onizleme: '' };
  try {
    const g = b.gorunum, s = g.sayfalar[g.gecerli - 1], kaynak = s?.canvas, c = s?.cizim, yer = g.yerlesim[g.gecerli - 1];
    if (!kaynak?.width || !kaynak.height || !c?.bolge?.w || !c.bolge.h) return bos;
    const G = ONIZLEME_GENISLIK, kat = 2;                        // görüntü iki kat çözünürlükte (yüksek ölçekli ekranda da net)
    const h = Math.max(40, Math.min(ONIZLEME_EN_YUKSEK, Math.round(G * kaynak.height / kaynak.width)));
    const tuvalPx = kaynak.height / c.bolge.h;                   // tuval pikseli / sayfa içi CSS px
    // Sayfanın görünen kısmının üstü (sayfa içi CSS px) → tuvaldeki satır; görüntü oradan başlar
    const ust = yer ? Math.max(0, g.kaydirici.scrollTop - yer.y) : 0;
    const kaynakH = Math.min(kaynak.height, (h / G) * kaynak.width);
    const sy = Math.max(0, Math.min(kaynak.height - kaynakH, (ust - c.bolge.y) * tuvalPx));
    const tuval = document.createElement('canvas');
    tuval.width = G * kat; tuval.height = h * kat;
    const ctx = tuval.getContext('2d');
    ctx.fillStyle = g.koyuSayfa ? '#000' : '#fff';
    ctx.fillRect(0, 0, tuval.width, tuval.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(kaynak, 0, sy, kaynak.width, kaynakH, 0, 0, tuval.width, tuval.height);
    const onizleme = tuval.toDataURL('image/jpeg', 0.85);
    tuval.width = 0; tuval.height = 0;
    return { genislik: G, yukseklik: ONIZLEME_BASLIK + h, onizleme };
  } catch (e) { console.warn('Sekme önizlemesi üretilemedi', e); return bos; }
}

let _surukleYeri = null;   // { tutma, sekmeYeri }: sekmenin tutulduğu nokta ve yeni pencerede ilk sekmenin duracağı yer (pencere içi)
sekmeler.addEventListener('ayrildi', (e) => {
  const b = belgeler.get(e.detail.id);
  if (!b) return;
  const liste = $('#sekme-liste').getBoundingClientRect();
  _surukleYeri = { tutma: e.detail.tutma, sekmeYeri: { x: Math.round(liste.left + 2), y: Math.round(liste.top + 4) } };
  pdefe.gonder('sekme:surukleBasla', { ad: b.ad, koyu: koyuMu(), ...sekmeOnizlemesi(b), ..._surukleYeri });
  surukleCaniDurdur();
  _surukleCan = setInterval(() => pdefe.gonder('sekme:surukleCan'), 500);
});
sekmeler.addEventListener('geriTakildi', () => { surukleCaniDurdur(); pdefe.gonder('sekme:surukleIptal'); });
// Sekme çubuğun dışında bırakıldı: başka bir pencerenin sekme çubuğuna bırakıldıysa oraya, boş yere bırakıldıysa orada açılan yeni
// pencereye taşınır. Pencerenin tek sekmesi boş yere bırakılınca yeni pencere açılmaz, pencerenin kendisi oraya gider.
sekmeler.addEventListener('disariBirakildi', async (e) => {
  surukleCaniDurdur();
  const id = e.detail.id;
  let tasindi = false;
  try {
    const hedef = await pdefe.cagir('sekme:surukleBitti', _surukleYeri);
    if (hedef?.tur === 'pencere') tasindi = await sekmeyiTasi(id, hedef);
    else if (hedef?.tur === 'yeni') {
      if (sekmeler.sekmeler.length < 2) await pdefe.cagir('pencere:tasi', hedef);
      else tasindi = await sekmeyiTasi(id, hedef);
    }
  } catch (h) { console.error('Sekme bırakılamadı', h); }
  if (!tasindi) { sekmeler.askidanCikar(id); pdefe.gonder('sekme:surukleIptal'); }   // sekme çubukta yerinde; önizleme kalkar
});
// Başka pencerenin sekmesi bu pencerenin üstünde sürükleniyor. 'sekme:bant': sekmenin bırakılabileceği alan (pencere içi): sekme çubuğu
// (biraz payla); belgesiz pencerede (yalnızca açılış sekmeleri, bir ya da birkaç) pencerenin tamamı; açık pencere ya da süren taşıma varken yok.
pdefe.dinle('sekme:bant', (istekId) => {
  let bant = null;
  if (!girdiKilitli() && !ortuAcik() && !kapanisSuruyor()) {
    const r = $('#sekme-cubugu').getBoundingClientRect();
    if (!belgeler.size) bant = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    else if (r.width && r.height) bant = { x: r.left, y: r.top - 6, w: r.width, h: r.height + 12 };
  }
  pdefe.cagir('yanit', istekId, bant).catch(() => {});
});
// { x, y }: imleç bırakma alanında (bırakılacak yerin işareti gösterilir); null: alandan çıktı ya da sürükleme bitti
pdefe.dinle('sekme:disSurukle', (nokta) => {
  const ortu = $('#surukle-ortusu');
  if (!nokta) { sekmeler.birakmaIsareti(null); if (ortu.dataset.sekme) { delete ortu.dataset.sekme; ortu.hidden = true; ortu.firstElementChild.textContent = 'PDF\'i bırakın'; } return; }
  if (belgeler.size) sekmeler.birakmaIsareti(nokta.x);
  else { ortu.dataset.sekme = '1'; ortu.firstElementChild.textContent = 'Sekmeyi buraya bırakın'; ortu.hidden = false; }
});

/** Açık sekmesinin dosyası başka bir pencerede yeniden yazıldı (araç çıktısı): sekme diskteki yeni hâliyle yeniden açılır; kaydedilmemiş
 *  değişikliği varsa önce sorulur (araclar/ortak.js sekmeyiYenile). */
async function yazilanSekmeyiYenile(b) {
  await sekmeSec(b.id);
  const r = await sekmeyiYenile({ mesajKutusu, dosyaAc, belgeKapat: (id, s) => belgeKapat(id, s) }, b,
    { soruAyrintisi: 'Dosya başka bir pencerede yeniden yazıldı. Belge diskteki yeni haliyle yeniden açılırsa bu değişiklikler atılır.' }).catch(() => false);
  if (!r) bildir(`"${b.ad}" sekmesi dosyanın önceki halini gösteriyor; notlarda değişiklik yapmadan önce sekmeyi kapatıp yeniden açın.`, 8000);
}

/** Başka bir pencerede değişen ayarı bu pencereye uygular (ana süreç 'ayar:degisti' ile bildirir). Ayarlar bütün pencerelerde ortaktır;
 *  ayarUygula'nın tersine buradan ana sürece geri yazılmaz (değiştiren pencere yazdı). */
function ayarDisaridanDegisti(anahtar, deger) {
  ayar[anahtar] = deger;
  switch (anahtar) {
    case 'tema': case 'sayfayiKoyulastir': temaUygula(); break;
    case 'vurguRengi': secimCubuguYenile(); break;
    case 'yaziCizimi': yaziCiziminiAyarla(deger !== 'sistem'); break;
    case 'otomatikKaydet': if (deger) for (const b of belgeler.values()) if (b.degisti) kirliGuncelle(b); break;
    case 'varsayilanDuzen': case 'kapakAyri': duzenEsitle(aktif()); break;
    case 'sonDosyalar': case 'sonAcilanlariHatirla': sonDosyalariListele(); break;
    case 'kaldigimSayfadanAc': if (!deger) clearTimeout(_konumZaman); break;
    case 'menuCubugu': menuDugmesiGuncelle(); break;
    default: break;   // panel genişliği, son yakınlaştırma, sayfa konumları vb.: yalnızca kopya güncellenir
  }
}

/** Belgeyi kaydeder. farkli=true ise yeni yol sorar. Başarılıysa true döner.
 *  Çağrı sürdükçe (Farklı kaydet diyaloğu ve hata sorusu dahil) b.kaydediliyor true'dur ve b.kayitSozu çağrı bitince çözülür
 *  (hiç reddedilmez); kapatma akışları onu bekler (kayitBitmesiniBekle). Bu arada gelen ikinci kaydetme false döner. */
async function belgeKaydet(b, farkli = false, sessiz = false) {
  if (!b || b.kaydediliyor || b.tasiniyor) return false;   // tasiniyor: sekme başka pencereye geçiyor (bkz. sekmeyiTasi)
  let bitti;
  b.kaydediliyor = true;
  b.kayitSozu = new Promise((coz) => { bitti = coz; });
  try {
    for (;;) {
      try {
        const sonuc = await kayitYaz(b, farkli, sessiz);
        if (sonuc && !sessiz) b._otoKayitDurdu = false;   // elle kayıt başarılı: otomatik kayıt yeniden çalışır
        return sonuc;
      } catch (e) {
        durum.mesajYaz('');
        // Otomatik kayıt başarısız: her değişiklikte engelleyici hata penceresi açılmasın; bir kez bildirilir, otomatik kayıt elle
        // kaydedilene dek durur (değişiklikler PDEfe'de kalır, sekme kaydedilmemiş görünür)
        if (sessiz && !farkli) {
          b._otoKayitDurdu = true;
          console.warn('Otomatik kayıt başarısız', b.yol, e);
          bildir(`"${b.ad}" otomatik kaydedilemedi: dosya başka bir programda (örneğin bir PDF okuyucuda) açık olabilir. Değişiklikler PDEfe'de duruyor; o programı kapatıp Ctrl+S ile kaydedin.`, 9000);
          return false;
        }
        const kilitli = /açık olabilir|yazılamadı|okunamadı|Failed to open|Permission|EBUSY|EPERM/i.test(e.message || '');
        const { secim } = await mesajKutusu({ tur: 'error', mesaj: 'Belge kaydedilemedi', ayrinti: (kilitli ? 'Dosya başka bir programda (örneğin bir PDF okuyucuda) açık olabilir. Onu kapatıp yeniden deneyin ya da farklı bir adla kaydedin.\n\n' : '') + hataMetni(e), dugmeler: kilitli ? ['Farklı kaydet', 'Vazgeç'] : ['Tamam'], iptal: kilitli ? 1 : 0 });
        if (!kilitli || secim !== 0) return false;
        farkli = true; sessiz = false;   // 'Farklı kaydet' aynı kaydın içinde: bekleyen kapatma akışı araya girmez
      }
    }
  } finally { b.kaydediliyor = false; bitti(); }
}

/** belgeKaydet'in yazma adımı; hata fırlatır. Vazgeçilirse false, yazılırsa (ya da yazılacak değişiklik yoksa) true. */
async function kayitYaz(b, farkli, sessiz) {
  b.notlar?.duzenleyiciBitir(true);
  let hedef = b.yol;
  if (farkli) {
    hedef = await pdefe.cagir('dosya:kaydetDiyalog', { baslik: 'Farklı kaydet', varsayilan: b.yol });
    if (!hedef) return false;
  } else if (!b.degisti) { if (!sessiz) bildir('Kaydedilecek değişiklik yok.'); return true; }
  const islemler = b.notlar ? b.notlar.fark() : [];
  // Gönderilen durum şimdi saptanır: kayıt sürerken yapılan değişiklikler (ör. yeni not) kayıt bitince kaydedilmiş sayılmasın
  const yiginKonumu = b.yigin?.konum, yiginKomutu = b.yigin?.geriAlinacak, notAnligi = b.notlar?.kayitAnligi();
  const g = b.gorunum;
  const tarif = g.tarif(), tarifAnligi = g.tarifJson();
  const yapisal = g.yapisalKirli() || !!g.anlik;
  // Yalnızca döndürme değiştiyse belge baştan kurulmaz (yapısal kayıt e-imzayı geçersiz kılar; ekler, sayfa etiketleri, açılış eylemi kaybolur)
  const yalnizDondurme = yapisal && dondurmeYalnizMi(b, tarif);
  durum.mesajYaz('Kaydediliyor…', 0);
  let r;
  if (yapisal && !yalnizDondurme) {
    const anlikKlasor = (await pdefe.cagir('uygulama:veriKlasoru')) + '\\anlik';
    r = await cekirdek('yapisal_kaydet', { yol: b.yol, hedef, tarif: yapisalTarif(b, tarif), anlikKlasor, anlik: g.anlik, islemler }, (i) => durum.mesajYaz(`Kaydediliyor… %${i.yuzde} ${i.mesaj || ''}`, 0));
    if (r.anlik && !g.anlik) { g.anlik = r.anlik; g.kaynakYeniden(b.yol, r.anlik); b.notlar?.kaynakYeniden(b.yol, r.anlik); }
    // Yapısal modda notların kayıtlı temeli anlık kopyadaki durumdur; yalnızca konumlar güncellenir
    g.yapisalKaydedildi();
    b.yigin?.kaydedildi(yiginKonumu, yiginKomutu);
    b.boyut = r.boyut;
  } else {
    // Kayıtlı bir not silindi ya da değiştiyse belge temiz (baştan) yazılır: artımlı kayıtta eski hâli dosyada kalırdı (temizKayitKarari)
    // (Farklı kaydet'te aynı dosya seçilirse de: çekirdek aynı dosyaya artımlı yazar)
    const temiz = yolAyni(hedef, b.yol) && islemler.some((op) => op.islem === 'sil' || op.islem === 'guncelle') ? await temizKayitKarari(b, sessiz) : false;
    if (temiz === null) { durum.mesajYaz(''); return false; }
    // Döndürmesi son kayıttakinden farklı sayfaların mutlak açıları notlardan önce uygulanır; aynı dosyaya artımlı yazılır
    const sayfaDondurmeleri = yalnizDondurme ? await sayfaDondurmeleriHesapla(g, tarif, tarifAnligi) : null;
    r = await cekirdek('notlar_kaydet', { yol: b.yol, hedef, islemler, artimli: true, ...(temiz ? { temiz: true } : {}), ...(sayfaDondurmeleri ? { sayfaDondurmeleri } : {}) });
    if (yalnizDondurme) {
      g.yapisalKaydedildi();
      if (g.tarifJson() !== tarifAnligi) g.kayitliTarif = tarifAnligi;   // kayıt sürerken yapılan sayfa değişikliği kirli kalsın
    }
    // Yüklenen dosyaya yazıldıysa diskteki /Rotate artık taban + gönderilen tarifteki göreli açı
    if (g.yol && yolAyni(hedef, g.yol)) {
      for (const t of tarif) if (t.kaynak && yolAyni(t.kaynak.yol, g.yol)) b.diskDondurme[t.kaynak.sayfa] = t.dondurme || 0;
    } else if (g.yol && g.kayitliTarif != null && yolAyni(b.yol, g.yol) && dondurmeYalnizMi(b, tarif)) {
      // Farklı kaydet yüklenen dosyanın sayfalarını aynı sırayla başka dosyaya yazdı: görünüm ve notlar yeni dosyaya bağlanır. Yoksa sonraki
      // yapısal kayıt hedefi eski dosyadan anlık kopyasız kurar ve kaydedilmiş sayılan notları siler. garbage=1 xref'leri korur; yeni dosyada
      // /Rotate = taban + tarifteki göreli açı. Sayfa yapısı yüklenen dosyanınkinden farklıysa (yapısal Farklı kaydet'ten sonra) eşlenmez.
      const eski = g.yol, kayitli = JSON.parse(g.kayitliTarif), ek = yolAnahtari(eski) + '#', yk = yolAnahtari(hedef) + '#';
      b.diskDondurme = {};
      for (const t of tarif) if (t.kaynak && yolAyni(t.kaynak.yol, eski)) b.diskDondurme[t.kaynak.sayfa] = t.dondurme || 0;
      g.kaynakYeniden(eski, hedef); b.notlar?.kaynakYeniden(eski, hedef); g.yol = hedef;
      // kaynakYeniden kayitliTarif'e şimdiki tarifi yazar; kayıt sürerken yapılan sayfa değişikliği kirli kalsın
      g.kayitliTarif = JSON.stringify(kayitli.map(([k, d]) => [typeof k === 'string' && k.startsWith(ek) ? yk + k.slice(ek.length) : k, d]));
    }
    b.notlar?.kaydedildi(r.xrefler, notAnligi);
    b.yigin?.kaydedildi(yiginKonumu, yiginKomutu);
    b.boyut = r.boyut;
  }
  if (farkli && !yolAyni(hedef, b.yol)) {
    b.yol = hedef; b.ad = dosyaAdi(hedef);
    sekmeler.guncelle(b.id, { ad: b.ad, yol: hedef });
    pdefe.cagir('pencere:baslik', b.ad);
    sonDosyalaraEkle(hedef);
    belgeleriBildir();   // yol değişti: dosyanın hangi pencerede açık olduğu kaydı
  }
  kirliGuncelle(b);
  if (aktifId === b.id) durum.boyutYaz(b.boyut);
  durum.mesajYaz(sessiz ? 'Otomatik kaydedildi' : 'Kaydedildi' + (r.artimli ? '' : ' (tam yazım)'));
  cekirdek('belge_birak', { yol: b.yol }).catch(() => {});
  panel.yorumlariYenile();
  return true;
}

/**
 * Kayıtlı bir not silinip ya da değişip aynı dosyaya kaydedilirken belge temiz (baştan) mı yazılsın (0.1.23, güvenlik denetimi).
 * Artımlı kayıt değişikliği dosyanın sonuna ekler: notun eski hâli dosyanın önceki bölümünde kalır, ekranda görünmez ama uygun bir
 * araçla okunabilir. Temiz yazım eski hâlleri siler. E-imzalı belgede (PDF'e gömülü imza; çekirdek imza_durumu) temiz yazım imzayı
 * geçersiz kılar: sorulur, seçim belge kapanana dek hatırlanır; otomatik kayıtta sorulmaz, imza korunur.
 * Döner: true (temiz yaz) | false (artımlı) | null (Vazgeç).
 */
async function temizKayitKarari(b, sessiz) {
  let imzali;
  try { imzali = !!(await cekirdek('imza_durumu', { yol: b.yol })).imzali; } catch { return false; }   // bilinmiyorsa imza korunur
  if (!imzali) return true;
  if (b.imzaSecimi) return b.imzaSecimi === 'temiz';
  if (sessiz) return false;
  const { secim } = await mesajKutusu({
    tur: 'warning', mesaj: 'Bu belge e-imzalı.',
    ayrinti: 'Silinen ya da değiştirilen notun eski hâli, e-imzayı korumak için dosyanın içinde kalır: ekranda görünmez ama uygun bir araçla okunabilir.\n\nEski hâli tamamen silmek için belge baştan yazılır; o zaman e-imza geçersiz görünür.',
    dugmeler: ['İmzayı koru', 'Tamamen sil', 'Vazgeç'], varsayilan: 0, iptal: 2,
  });
  if (secim !== 0 && secim !== 1) return null;
  b.imzaSecimi = secim === 1 ? 'temiz' : 'koru';
  return secim === 1;
}

/** Kaydedilmemiş sayfa değişikliği yalnızca döndürme mi: anlık kopya yok; sayfalar sekmenin dosyasının sayfaları, eksiksiz,
 *  özgün sırada ve boş sayfa eklenmemiş. */
function dondurmeYalnizMi(b, tarif) {
  const g = b.gorunum, anahtar = yolAnahtari(b.yol);
  return !g.anlik && !!g.belge && tarif.length === g.belge.numPages
    && tarif.every((t, i) => !!t.kaynak && yolAnahtari(t.kaynak.yol) === anahtar && t.kaynak.sayfa === i + 1);
}

/** notlar_kaydet için { '<1-tabanlı sayfa>': mutlak açı }: yalnızca döndürmesi son kayıttakinden (g.kayitliTarif) farklı sayfalar.
 *  Mutlak açı = belgenin yüklendiği andaki /Rotate (tabanDondurme) + görünümdeki göreli döndürme. */
async function sayfaDondurmeleriHesapla(g, tarif, tarifAnligi) {
  let kayitli = [];
  try { kayitli = JSON.parse(g.kayitliTarif || '[]'); } catch { /* bütün sayfalar değişmiş sayılır */ }
  const guncel = JSON.parse(tarifAnligi), sonuc = {};
  await Promise.all(tarif.map(async (t, i) => {
    const k = kayitli[i];
    if (Array.isArray(k) && k[0] === guncel[i][0] && (k[1] || 0) === (guncel[i][1] || 0)) return;
    sonuc[i + 1] = (((await g.tabanDondurme(i)) + (t.dondurme || 0)) % 360 + 360) % 360;
  }));
  return sonuc;
}

/** Yapısal kayda gönderilen tarif. Çekirdek tarifteki açıyı kaynak sayfanın diskteki /Rotate'ine EKLER; yüklenen dosyaya daha önce
 *  artımlı kayıtla işlenmiş döndürme (b.diskDondurme) o dosyadan ya da onun anlık kopyasından gelen sayfalarda iki kez sayılmasın. */
function yapisalTarif(b, tarif) {
  const d = b.diskDondurme, g = b.gorunum;
  if (!d || !Object.keys(d).length) return tarif;
  const anahtarlar = new Set([yolAnahtari(g.yol), g.anlik ? yolAnahtari(g.anlik) : null]);
  return tarif.map((t) => (t.kaynak && d[t.kaynak.sayfa] && anahtarlar.has(yolAnahtari(t.kaynak.yol))
    ? { ...t, dondurme: (((t.dondurme || 0) - d[t.kaynak.sayfa]) % 360 + 360) % 360 } : t));
}

/** Belgede süren kaydın bitmesini bekler (beklerken durum çubuğunda 'Kaydediliyor…') ve bekleyen otomatik kaydı iptal eder.
 *  Kapatma akışları kullanır: kayıt yarıda kesilmez, bittikten sonra degisti yeniden değerlendirilir. */
async function kayitBitmesiniBekle(b) {
  clearTimeout(b._otoKayit); b._otoKayit = null;
  if (!b.kaydediliyor) return;
  while (b.kaydediliyor) { durum.mesajYaz('Kaydediliyor…', 0); await b.kayitSozu; }
  if (durum.mesaj?.textContent === 'Kaydediliyor…') durum.mesajYaz('');   // kayıt kendi sonucunu yazmadıysa (ör. Farklı kaydet'ten vazgeçildi)
  if (belgeler.has(b.id)) kirliGuncelle(b);
  clearTimeout(b._otoKayit); b._otoKayit = null;   // kirliGuncelle otomatik kaydı yeniden kurmuş olabilir
}

/** Kapatma sorusunda 'Kaydet': araya giren kaydı bekler; belge hâlâ kirliyse kaydeder. Başarılıysa true. */
async function kapatirkenKaydet(b) {
  await kayitBitmesiniBekle(b);
  return !b.degisti || belgeKaydet(b);
}

function sayfaGoster(b) {
  const g = b.gorunum;
  durum.sayfa(g.gecerli, g.sayfaSayisi);
  sayfaKutusuYaz($('#sayfa-kutusu'), String(g.gecerli));
  sayfaKutusuGenislik(g.sayfaSayisi);
  $('#sayfa-toplam').textContent = '/ ' + g.sayfaSayisi;
  panel.gecerliSayfaIsaretle(g.gecerli);
}

/** Araç çubuğundaki sayfa kutusu sayfa sayısının basamağı kadar geniştir (stil.css --basamak). Yalnızca değişince yazılır: kutunun stil
 *  değişikliği araç çubuğunu yeniden sığdırır (aracCubuguSigdir'in MutationObserver'ı). */
function sayfaKutusuGenislik(toplam) {
  const k = $('#sayfa-kutusu'), n = String(Math.max(1, String(toplam || 0).length));
  if (k.dataset.basamak !== n) { k.dataset.basamak = n; k.style.setProperty('--basamak', n); }
}

function zoomGoster(b) {
  const o = b.gorunum.olcek;
  durum.zoomYaz(o);
  if (document.activeElement !== $('#zoom-kutusu')) zoomKutusuYaz(o);   // kullanıcı kutuda yazarken üzerine yazılmaz
  // Yüklenmemiş görünümün ölçeği (yeni sekme seçilirken %100) son kullanılan sayılmaz: belge onunla açılırdı
  if (ayar.varsayilanZoom === 'son' && b.gorunum.belge) { ayar.sonZoom = Math.round(o * 100); zoomKaydetGecikmeli(); }
}
/** Yakınlaştırma kutusuna ölçeği Türkçe yüzde biçiminde ('%150') yazar. */
function zoomKutusuYaz(olcek) { $('#zoom-kutusu').value = '%' + Math.round(olcek * 100); }
let _zoomZaman = null;
function zoomKaydetGecikmeli() { clearTimeout(_zoomZaman); _zoomZaman = setTimeout(() => ayarKoy('sonZoom', ayar.sonZoom), 800); }

// ---------------------------------------------------------------- son dosyalar, oturum, sayfa konumu
// "Son açılanları hatırla" ve "Her belgeyi kaldığım sayfadan aç" kapalıyken bu kayıtlar hiç yazılmaz (Ayarlar › Açılış ve düzen).
function sonDosyalaraEkle(yol) {
  if (ayar.sonAcilanlariHatirla === false) return;
  const liste = [yol, ...(ayar.sonDosyalar || []).filter((y) => !yolAyni(y, yol))].slice(0, 15);
  ayar.sonDosyalar = liste;
  pdefe.cagir('uygulama:sonDosyalar', liste);
}
function sonDosyalardanCikar(yol) {
  ayar.sonDosyalar = (ayar.sonDosyalar || []).filter((y) => !yolAyni(y, yol));
  pdefe.cagir('uygulama:sonDosyalar', ayar.sonDosyalar);
  sonDosyalariListele();
}
function sonDosyalariListele() { baslangic.listele(ayar.sonDosyalar || [], { kapali: ayar.sonAcilanlariHatirla === false }); }

let _konumZaman = null;
/** Verilen belgelerin sayfa konumlarını tek yazımda kaydeder (en fazla 300 dosya; en eskiler düşer). */
function konumlariYaz(liste) {
  if (ayar.kaldigimSayfadanAc === false) return Promise.resolve();
  const k = ayar.sayfaKonumlari || {};
  for (const b of liste) { delete k[b.yol]; k[b.yol] = b.gorunum.gecerli; }
  const anahtarlar = Object.keys(k);
  if (anahtarlar.length > 300) for (const a of anahtarlar.slice(0, anahtarlar.length - 300)) delete k[a];
  return ayarKoy('sayfaKonumlari', k);
}
function sayfaKonumuKaydet(b, hemen = false) {
  clearTimeout(_konumZaman);
  if (hemen) return konumlariYaz([b]);
  _konumZaman = setTimeout(() => konumlariYaz([b]), 1000);
}
/** Açık belgelerin sayfa konumlarını beklemeden yazar; güncelleme kurulumu ve pencere kapatma öncesi. */
function konumlariKaydetHemen() {
  clearTimeout(_konumZaman);
  return konumlariYaz([...belgeler.values()]);
}

// ---------------------------------------------------------------- genel düzen
// Düzen = sayfa sayısı ('tek'|'iki') × kaydırma (açık/kapalı). Uyumluluk için ayarda ve görüntüleyicide eski dört değerle saklanır.
const DUZENLER = ['tek', 'surekli', 'iki', 'ikiSurekli'];
const duzenIkiMi = (d) => d === 'iki' || d === 'ikiSurekli';
const duzenKaydirmaMi = (d) => d === 'surekli' || d === 'ikiSurekli';
const duzenAdi = (iki, kaydirma) => (iki ? (kaydirma ? 'ikiSurekli' : 'iki') : (kaydirma ? 'surekli' : 'tek'));
function genelDuzen() { return DUZENLER.includes(ayar.varsayilanDuzen) ? ayar.varsayilanDuzen : 'surekli'; }
/** Şu an görünen düzen ve kapak: etkin (yüklenmiş) belgeninki, yoksa ayardaki. */
function gorunenDuzen() { const g = aktif()?.gorunum; return g?.belge ? g.duzen : genelDuzen(); }
function gorunenKapak() { const g = aktif()?.gorunum; return g?.belge ? !!g.kapakAyri : !!ayar.kapakAyri; }

/** Belgenin düzenini/kapak ayarını genel ayara eşitler (yüklenmemiş belgeye dokunmaz; yükleme ayarı kendisi alır). */
function duzenEsitle(b) {
  if (!b || !b.gorunum.belge) return;
  const d = genelDuzen(), kapak = !!ayar.kapakAyri;
  if (b.gorunum.duzen !== d || b.gorunum.kapakAyri !== kapak) b.gorunum.duzenAyarla(d, kapak, tekSayfaZoomu());
}

/** İki sayfalıdan tek sayfalıya geçişte yakınlaştırma: Başlangıç'taki varsayılan yakınlaştırma bir sığdırma seçeneğiyse o (belge
 *  açılışıyla tutarlı), değilse (son kullanılan, gerçek boyut, yüzde) genişliğe sığdır. */
function tekSayfaZoomu() { return ['genislik', 'sayfa', 'gorunur'].includes(ayar.varsayilanZoom) ? ayar.varsayilanZoom : 'genislik'; }

/** Genel düzeni kaydeder; etkin sekmeye hemen, diğerlerine seçildiklerinde uygulanır. */
function duzenDegistir(duzen, kapakAyri = !!ayar.kapakAyri) {
  if (!DUZENLER.includes(duzen)) return;
  if (ayar.varsayilanDuzen !== duzen) ayarKoy('varsayilanDuzen', duzen);
  if (!!ayar.kapakAyri !== kapakAyri) ayarKoy('kapakAyri', kapakAyri);
  duzenEsitle(aktif());
}

// ---------------------------------------------------------------- sayfa düzeni komutları
/** Tarifi geri alınabilir bir komut olarak uygular. tarif: [{kaynak:{yol,sayfa}, dondurme} | {kaynak:null, genislik, yukseklik}] */
async function sayfaTarifiUygula(b, tarif, ad = 'Sayfa düzenini uygula') {
  const g = b.gorunum;
  b.notlar?.duzenleyiciBitir(true);
  const eski = [...g.sayfalar];
  const yeni = await g.tarifHazirla(tarif);
  // Yeni kaynak dosyaların notlarını yükle
  for (const t of tarif) if (t.kaynak && t.kaynak.yol && yolAnahtari(t.kaynak.yol) !== yolAnahtari(b.yol) && (!g.anlik || yolAnahtari(t.kaynak.yol) !== yolAnahtari(g.anlik))) await b.notlar?.kaynakYukle(t.kaynak.yol);
  b.yigin.calistir(sayfaKomutu(b, ad, eski, yeni));
}

/** Sayfa listesini değiştiren komut (geri al / yinele). Tarifi (eski ve yeni sayfa listeleri) sekme başka pencereye taşınınca geri al
 *  yığınının orada yeniden kurulmasını sağlar (komutDisari / komutIceri). */
function sayfaKomutu(b, ad, eski, yeni) {
  const g = b.gorunum;
  return new Komut(ad, () => g.sayfalariAyarla(yeni), () => g.sayfalariAyarla(eski), { tur: 'sayfalar', eski, yeni });
}

/** Tek sayfa ya da tüm sayfaları kalıcı döndürme komutu. */
function sayfalariDondur(b, sayfalar, derece, ad = 'Sayfaları döndür') {
  const tarif = b.gorunum.tarif().map((t, i) => (!sayfalar || sayfalar.includes(i + 1) ? { ...t, dondurme: ((t.dondurme || 0) + derece + 360) % 360 } : t));
  return sayfaTarifiUygula(b, tarif, ad);
}

/** Belge döndürülebilir mi: sekme açık, belge yüklenmiş (yoksa tarif boştur ve geri al bütün sayfaları siler) ve kayıt sürmüyor
 *  (kayıt bitince o anki durum kaydedilmiş sayılır; arada yapılan döndürme kaybolurdu). */
function dondurulebilir(b) {
  if (!belgeler.has(b.id) || !b.gorunum.belge || !b.gorunum.sayfaSayisi) return false;
  if (b.kaydediliyor) { bildir('Kaydediliyor, lütfen bekleyin.'); return false; }
  return true;
}

/** Döndürme komutu: kapsamı ayardan alır ya da sorar; belgeyi geri alınabilir biçimde döndürür (belge kirlenir, kapatırken kaydetme sorulur).
 *  Tek sayfalık belgede geçerli sayfa ile tüm PDF aynıdır: sorulmaz, sayfa hemen döner (ayar değişmez). */
async function dondur(derece) {
  const b = aktif(); if (!b || !dondurulebilir(b)) return;
  let kapsam = ayar.dondurmeKapsami;
  if (kapsam !== 'sayfa' && kapsam !== 'tum' && b.gorunum.sayfaSayisi > 1) {
    const { secim, onay } = await mesajKutusu({ mesaj: 'Neyi döndürmek istiyorsunuz?', dugmeler: ['Geçerli sayfa', 'Tüm PDF', 'Vazgeç'], varsayilan: 0, iptal: 2, onayKutusu: 'Seçeneğimi hatırla' });
    if (secim !== 0 && secim !== 1) return;
    kapsam = secim === 1 ? 'tum' : 'sayfa';
    if (onay) ayarKoy('dondurmeKapsami', kapsam);
  }
  // Hızlı art arda basışlarda her döndürme bir öncekinin tarifi üzerine kurulsun; sıra gelince yeniden denetle (soru açıkken sekme kapatılmış ya da kayıt başlamış olabilir)
  const is = (b._dondurme || Promise.resolve()).catch(() => {}).then(() => (!dondurulebilir(b) ? undefined : kapsam === 'tum'
    ? sayfalariDondur(b, null, derece, 'Tüm sayfaları döndür')
    : sayfalariDondur(b, [b.gorunum.gecerli], derece, 'Sayfayı döndür')));
  b._dondurme = is;
  return is;
}

/** PDF'teki dış bağlantı (0.1.23, güvenlik denetimi): yalnızca web ve e-posta adresleri, tam adres gösterilip sorulduktan sonra açılır.
 *  Başka türler (file:, search-ms:, uygulama adresleri) Windows'ta program çalıştırabildiği ya da uzak ağ paylaşımına bağlanabildiği
 *  için açılmaz; ana süreç de yalnızca bu türleri açar (main/guvenlik.js). "Bu belgede yeniden sorma" belge kapanana dek geçerli. */
const DIS_BAGLANTI_TURLERI = ['http:', 'https:', 'mailto:'];
async function disBaglantiAc(b, adres) {
  let tur = '';
  try { tur = new URL(adres).protocol; } catch { /* geçersiz adres */ }
  if (!DIS_BAGLANTI_TURLERI.includes(tur)) {
    await mesajKutusu({ tur: 'warning', mesaj: 'Bu bağlantı açılmadı.', ayrinti: `Güvenlik nedeniyle yalnızca web ve e-posta adresleri açılır.\n\n${adres}` });
    return;
  }
  if (!b.disBaglantiIzni) {
    const { secim, onay } = await mesajKutusu({
      mesaj: tur === 'mailto:' ? 'E-posta uygulaması açılsın mı?' : 'Bağlantı tarayıcıda açılsın mı?', ayrinti: adres,
      dugmeler: ['Aç', 'Vazgeç'], varsayilan: 0, iptal: 1, onayKutusu: 'Bu belgede yeniden sorma',
    });
    if (secim !== 0) return;
    if (onay) b.disBaglantiIzni = true;
  }
  pdefe.cagir('kabuk:disAc', adres).catch(() => {});
}

function baglantiyaGit(b, l) {
  const g = b.gorunum;
  if (l.uri) { disBaglantiAc(b, l.uri); return; }
  if (l.sayfa) {
    // Bağlantının hedefi kaynak dosyadaki sayfa; geçerli konumunu bul
    const i = g.sayfalar.findIndex((s) => !s.bos && yolAnahtari(s.kaynak.yol) === yolAnahtari(l.kaynakYol) && s.kaynak.sayfa === l.sayfa);
    if (i >= 0) { g.sayfayaGit(i + 1, { y: l.y != null ? l.y : undefined }); g.kaydirici.focus(); }
    else bildir('Bağlantının hedef sayfası bu belgede yok.');
  }
}

/** Geri al (geri=true) / yinele: yazı düzenlenirken düzenleyicinin metnini (araç çubuğu düğmesi odağı alsa da, Düzen menüsünden de),
 *  başka bir girdi kutusundaysa onun metnini, yoksa belgeyi. */
function geriAlYinele(geri) {
  const b = aktif(); if (!b) return;
  const n = b.notlar, d = n?.duzenleyici, odak = document.activeElement;
  if (girdideMi() && !(d && (odak === d.el || d.bicim.contains(odak)))) { document.execCommand(geri ? 'undo' : 'redo'); return; }
  if (d) { if (geri) n.duzenleyiciGeriAl(); else n.duzenleyiciYinele(); return; }
  const k = geri ? b.yigin.geriAl() : b.yigin.yinele();
  if (k) durum.mesajYaz((geri ? 'Geri alındı: ' : 'Yinelendi: ') + k.ad);
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
  'dosya.yazdir': () => { const b = aktif(); if (!b) { bildir('Yazdırılacak belge yok.'); return; } return yazdir({ cekirdek, pdefe, mesajKutusu, bildir, kaydet: (belge) => belgeKaydet(belge) }, b); },
  // Pencerenin tek sekmesi açılış sekmesiyse (kapatılmaz) Ctrl+W pencereyi kapatır
  'sekme.kapat': () => { if (aktifId && tekAcilisSekmesi() !== aktifId) sekmeKapat(aktifId); else pdefe.cagir('pencere:kapat'); },
  'sekme.yeni': () => yeniSekme(),
  'sekme.sonraki': () => sekmeGec(1), 'sekme.onceki': () => sekmeGec(-1),
  'duzen.geriAl': () => geriAlYinele(true),
  'duzen.yinele': () => geriAlYinele(false),
  'duzen.tumunuSec': () => tumunuSec(),
  'duzen.bul': (metin) => { if (aktif()) arama.ac(typeof metin === 'string' ? metin : (belgeSecimMetni().trim().split('\n')[0] || '')); },
  'duzen.bulSonraki': () => arama.git(1), 'duzen.bulOnceki': () => arama.git(-1),
  'duzen.sayfayaGit': () => { const k = $('#sayfa-kutusu'); k.focus(); k.select(); },
  // bolum: açılacak sekme (ör. başlangıç ekranındaki "Ayarlar › Açılış ve düzen" bağlantısı); menüden ve araç çubuğundan gelmez
  'duzen.ayarlar': (bolum) => ayarlarPenceresiAc(ayarlarBaglami(), typeof bolum === 'string' ? { bolum } : {}),
  'gorunum.yakinlastir': () => aktif()?.gorunum.yakinlastir(1),
  'gorunum.uzaklastir': () => aktif()?.gorunum.yakinlastir(-1),
  'gorunum.zoom': (mod) => { const b = aktif(); if (!b) return; if (mod === 'gercek') b.gorunum.zoomAyarla(1, null, 'serbest'); else b.gorunum.zoomModuAyarla(mod); },
  // 'tek'/'iki' kaydırma durumunu korur; eski dört değer ('surekli', 'ikiSurekli' dahil) olduğu gibi uygulanır
  'gorunum.duzen': (d) => duzenDegistir(d === 'tek' || d === 'iki' ? duzenAdi(d === 'iki', duzenKaydirmaMi(gorunenDuzen())) : d, gorunenKapak()),
  'gorunum.kaydirma': () => { const d = gorunenDuzen(); duzenDegistir(duzenAdi(duzenIkiMi(d), !duzenKaydirmaMi(d)), gorunenKapak()); },
  'gorunum.kapakAyri': () => duzenDegistir(gorunenDuzen(), !gorunenKapak()),
  'gorunum.dondur': (derece) => dondur(+derece || 90),
  'gorunum.oncekiSayfa': () => aktif()?.gorunum.oncekiSayfa(),
  'gorunum.sonrakiSayfa': () => aktif()?.gorunum.sonrakiSayfa(),
  'gorunum.solPanel': () => { panel.acKapa(); ayarKoy('solPanelAcik', panel.acik); },
  'gorunum.tema': () => { const yeni = koyuMu() ? 'acik' : 'koyu'; ayarKoy('tema', yeni); temaUygula(); },
  'gorunum.menuCubugu': () => { ayarKoy('menuCubugu', !ayar.menuCubugu); menuDugmesiGuncelle(); },
  'gorunum.okumaModu': () => { okumaModu = !okumaModu; document.body.classList.toggle('okuma-modu', okumaModu); aktif()?.gorunum.boyutDegisti(); },
  'gorunum.tamEkran': () => pdefe.cagir('pencere:tamEkran'),
  'arac.paylas': () => pdfKopyala(),
  'arac.kucult': () => bildir('Sıkıştır aracı sonraki aşamada.'),
  'arac.sayfalar': () => bildir('Sayfaları düzenle aracı sonraki aşamada.'),
  'arac.ayir': () => bildir('Ayır aracı sonraki aşamada.'),
  'arac.gorselBirlestir': () => bildir('Görüntü/PDF birleştirme aracı sonraki aşamada.'),
  'arac.dondurKaydet': () => bildir('Döndür ve kaydet sonraki aşamada.'),
  'yardim.kisayollar': () => kisayollarGoster(),
  'yardim.hakkinda': () => ayarlarPenceresiAc(ayarlarBaglami(), { bolum: 'hakkinda' }),
};

/** Ayarlar penceresinin bağlamı (ayarlarPenceresi.js). sonTemizle: Açılış ve düzen › Listeyi temizle (menü ve başlangıç ekranı da güncellenir). */
function ayarlarBaglami() {
  return { ayar: () => ayar, ayarKoy, uygula: ayarUygula, pdefe, varsayilanlar, cekirdek, guncelleme, sonTemizle: () => komutCalistir('dosya.sonTemizle') };
}

// Araç pencereleri (Sıkıştır, sayfaları düzenle, döndür ve kaydet, ayır, görüntü/PDF birleştir)
try {
  // cekirdek: araçların okuttuğu dosyalar kaydedilir, son araç penceresi kapanınca bırakılır (aracDosyalariniBirak)
  aracPenceresiKapaninca(aracDosyalariniBirak);
  Object.assign(komutlar, aracKomutlari({
    aktif, cekirdek: aracCekirdek,
    iptal: (istekId) => pdefe.cagir('cekirdek:iptal', istekId),
    dosyaAc, kaydet: (b) => belgeKaydet(b), mesajKutusu, bildir, pdefe,
    belgeKapat: (id, secenek) => belgeKapat(id, secenek),   // sıkıştırma "üzerine yaz" sonrası sekmeyi kapatıp yeniden açmak için
    belgeler: () => [...belgeler.values()],                // araç çıktısı açık bir sekmenin dosyasına yazıldıysa o sekmeyi yenilemek için
    ayar: () => ayar, ayarKoy,
    sayfaTarifiUygula: (b, tarif, ad) => sayfaTarifiUygula(b, tarif, ad),
    dosyaYolu: (f) => pdefe.dosyaYolu(f),
  }));
} catch (e) { console.error('Araç komutları bağlanamadı', e); }

// Açık belge gerektiren araçlar (ARACLAR belge: true; Görüntü / PDF birleştir gerektirmez) belge yokken (açılış ekranı ya da açılış
// sekmesi) önce Aç penceresini açar; seçilen PDF açılır ve araç o belgeyle açılır (0.1.13, kullanıcı isteği; önceden "Önce bir PDF açın"
// bildirimi ve Araçlar penceresinde soluk karo). Açılış ekranındaki karolar, Araçlar penceresi ve Araçlar menüsü aynı yoldan gelir.
for (const a of ARACLAR.filter((x) => x.belge)) {
  const ac = komutlar[a.komut];
  if (!ac) continue;
  komutlar[a.komut] = async (veri) => {
    if (!aktif()) {
      const yollar = await pdefe.cagir('dosya:acDiyalog', { coklu: false, baslik: `${a.ad}: PDF seçin` });
      if (!yollar?.length) return null;
      const b = await dosyaAc(yollar[0]);
      if (!b || aktif() !== b) return null;   // açılamadı ya da açılırken başka sekmeye geçildi
    }
    return ac(veri);
  };
}

// Güncelleme şeridi
let guncelleme = null;
try {
  // Kurulum uygulamayı kapatır: kaydedilmemiş değişiklikler pencere kapatmadaki gibi sorulur; Vazgeç (false) kurulumu erteler,
  // indirilen sürüm saklanır ve şeritte "Kur ve yeniden başlat" kalır
  // Kurulum bütün pencereleri kapatır: önce bu pencerenin, sonra öteki pencerelerin kaydedilmemiş belgeleri sorulur (her biri kendi
  // penceresinde; ana süreç sırayla öne getirir). İzin veren pencere kurulum başlayana dek girdi almaz (kurulumKilidi): öteki pencerenin
  // sorusu açıkken bu pencerede yapılacak değişiklik sorulmadan kaybolurdu. Vazgeçilirse ya da kurulum başlatılamazsa kilit açılır
  // ('pencere:izinBitti'; kurulamadi: şerit 'guncelleme:kur' başarısız olunca çağırır).
  const kurulumIzniAl = async () => {
    await tasimaBitmesiniBekle();
    if (kurulumKilidi || _kapaniyor) return false;   // başka pencerenin başlattığı kurulum için izin verildi ya da pencere kapanıyor
    if (!(await kapatmayaIzinAl())) return false;
    kurulumKilidiKoy(true);
    let izin = false;
    try { izin = !!(await pdefe.cagir('pencere:digerlerindenIzinAl')); } catch (e) { console.error(e); }
    if (!izin) kurulumKilidiKoy(false);
    return izin;
  };
  guncelleme = guncellemeSeridiKur({ pdefe, serit: $('#guncelleme-seridi'), bildir, kapatmadanOnce: kurulumIzniAl, kurulamadi: () => pdefe.cagir('pencere:izinBirak').catch(() => {}) });
  komutlar['yardim.guncelle'] = () => guncelleme.denetle();
} catch (e) { console.error('Güncelleme şeridi kurulamadı', e); }

// Bu komutlar önce açık yazı düzenlemesini uygular (PDF okuyucularında da araç çubuğuna / menüye gitmek düzenlemeyi bitirir): araç, paylaş, yazdır
// ve kaydet dosyadaki eski hâlle değil yazılan metinle çalışsın, belge değişmiş sayılsın; araç kapanınca basılan Esc metni atmasın.
const DUZENLEMEYI_UYGULAYAN = /^(arac\.|dosya\.(kaydet|farkliKaydet|yazdir)$|sekme\.kapat$)/;

function komutCalistir(id, veri) {
  const f = komutlar[id];
  if (!f) { console.warn('Bilinmeyen komut', id); return; }
  if (DUZENLEMEYI_UYGULAYAN.test(id)) aktif()?.notlar?.duzenleyiciBitir(true);
  try { const r = f(veri); if (r && r.catch) r.catch((e) => { console.error(e); bildir('Hata: ' + hataMetni(e)); }); }
  catch (e) { console.error(e); bildir('Hata: ' + hataMetni(e)); }
}

// Araç çubuğundaki Araçlar düğmesinin penceresi; menüden ya da kısayolla gelen komut onu kapatır
const araclarPenceresi = new AraclarPenceresi({ dugme: $('#dugme-araclar'), komutCalistir: (id) => komutCalistir(id) });

// Başlangıç ekranı: PDF aç ve Görüntü / PDF birleştir kartları, son açılanlar
const baslangic = new BaslangicEkrani({
  kok: $('#baslangic'), komutCalistir: (id, veri) => komutCalistir(id, veri), ac: (yol) => dosyaAc(yol), kaldir: (yol) => sonDosyalardanCikar(yol),
  temizle: () => komutCalistir('dosya.sonTemizle'), pdefe, bildir,
});

// Mesaj kutusu açıkken fareyle seçilen menü komutu ve pencere kapatma yok sayılır (yerel kutu pencereyi kilitliyordu): soru yanıtlanmadan
// başka iş başlamasın, aynı belge için ikinci soru açılmasın. Klavye kısayollarını kutu kendisi alır.
// Araç penceresi, diyalog (F1, yazdır, parola) ya da Ayarlar açıkken arkadaki belgeyi ya da sekmeleri değiştiren komutlar (Ctrl+R, Ctrl+T,
// Ctrl+W, Ctrl+O hızlandırıcıları da) çalışmaz: araç kendi tarifini kaydederken arkada yapılan döndürmeyi ezerdi, Ctrl+W yazdırılmakta olan
// belgeyi kapatıyordu (sayfada işlenen Ctrl+PageUp/PageDown, Ctrl+Tab, Ctrl+1–9, Ctrl+Z aynı kuralla: ortuAcik)
const ORTU_ACIKKEN_CALISMAYAN = new Set(['gorunum.dondur', 'sekme.yeni', 'sekme.sonraki', 'sekme.onceki', 'sekme.kapat', 'dosya.ac', 'dosya.acYol', 'duzen.geriAl', 'duzen.yinele']);
pdefe.dinle('menu:komut', (id, veri) => {
  if (mesajKutusuAcik()) { mesajKutusuUyar(); return; }
  if (girdiKilitli()) return;   // sekme taşınırken ya da güncelleme kurulumu beklenirken pencere girdi almaz
  if (ORTU_ACIKKEN_CALISMAYAN.has(id) && (acikAracPenceresiVar() || document.querySelector('.diyalog-ortusu, .ayarlar-ortusu'))) return;
  araclarPenceresi.kapat(); komutCalistir(id, veri);
});
// secenek.yazildi: dosya başka bir pencerede (araç çıktısı olarak) yeniden yazıldı; burada açık sekmesi diskteki yeni hâliyle yenilenir
pdefe.dinle('dosya:ac', async (yollar, secenek) => {
  // Taşınmakta olan sekme yenilenmez, kapatılmaz: taşıma bitince dosya hangi penceredeyse orada işlenir (dosyaAc öteki pencereye sorar)
  await tasimaBitmesiniBekle();
  for (const y of yollar) {
    const acik = secenek?.yazildi ? [...belgeler.values()].find((b) => yolAyni(b.yol, y)) : null;
    if (acik) await yazilanSekmeyiYenile(acik); else await dosyaAc(y, { yazildi: !!secenek?.yazildi });
  }
});
pdefe.dinle('pencere:tamEkran', (acik) => document.body.classList.toggle('tam-ekran', acik));
// Kapatma isteği yanıtsız bırakılmaz: Dosya › Çıkış pencereleri sırayla kapatır, vazgeçilen pencerede durur ('pencere:kapatVazgec').
// Kapatma akışı sürerken gelen ikinci istek (× yeniden, Alt+F4, Çıkış) yalnızca açık soruyu gösterir; yanıtı süren akış verir (yoksa
// ikinci istek "vazgeçildi" der, Çıkış yarıda kalırdı).
pdefe.dinle('pencere:kapatIstegi', async () => {
  if (_kapanis) { if (mesajKutusuAcik()) mesajKutusuUyar(); return; }
  if (mesajKutusuAcik() || girdiKilitli()) { if (mesajKutusuAcik()) mesajKutusuUyar(); pdefe.cagir('pencere:kapatVazgec'); return; }
  _kapanis = true;
  let izin = false;
  try { izin = await kapatmayaIzinAl({ degismeyenleriKapat: true }); }
  catch (e) { console.error(e); }
  finally { _kapanis = false; }
  if (izin) await kapanisiOnayla(); else pdefe.cagir('pencere:kapatVazgec');
});
// Başka bir pencere uygulamayı kapatacak (güncelleme kurulumu): bu pencerenin kaydedilmemiş belgeleri sorulur. İzin veren pencere
// kurulum başlayana dek girdi almaz (kurulumKilidi); vazgeçilirse ya da kurulum başlatılamazsa 'pencere:izinBitti' kilidi açar.
pdefe.dinle('pencere:izinIste', async (istekId) => {
  let izin = kurulumKilidi;   // bu turda zaten izin verdi
  try {
    if (izin) { /* yeniden sorulmaz */ }
    else if (mesajKutusuAcik()) mesajKutusuUyar();
    else if (!tasimaSuruyor && !_kapanis && !_kapaniyor) { izin = await kapatmayaIzinAl(); if (izin) kurulumKilidiKoy(true); }
  } catch (e) { console.error(e); izin = false; }
  pdefe.cagir('yanit', istekId, izin).catch(() => {});
});
pdefe.dinle('pencere:izinBitti', () => kurulumKilidiKoy(false));
pdefe.dinle('ayar:degisti', ayarDisaridanDegisti);
// Başka pencereden taşınan sekme (ana süreç yanıtı bekler: hedef açamazsa sekme kaynak pencerede kalır). 'yanit' false dönerse ana
// süreç artık beklemiyordur (sekmeyiAl kurduğu sekmeyi kaldırır)
pdefe.dinle('sekme:al', async (istekId, paket, secenek) => {
  try { await sekmeyiAl(paket, secenek || {}, () => pdefe.cagir('yanit', istekId, { tamam: true }).catch(() => false)); }
  catch (e) {
    console.error('Taşınan sekme açılamadı', e);
    pdefe.cagir('yanit', istekId, { tamam: false, hata: hataMetni(e) }).catch(() => {});
  }
});

let _kapatmaIzni = null;
/** Uygulama kapanmadan önce (pencere kapatma, güncelleme kurulumu): açık araç penceresi varsa önce onun sorusu (kaydedilmemiş iş,
 *  süren işlem), sonra süren kayıtları bekler, kaydedilmemiş her belge için Kaydet / Kaydetme / Vazgeç sorar, sonunda sayfa konumlarını
 *  yazar. Vazgeç ya da başarısız kayıtta false döner. degismeyenleriKapat (pencere kapatma; 0.1.12, kullanıcı isteği): kaydedilmemiş
 *  değişikliği olan belge varsa sorulardan önce değişikliği olmayan sekmeler kapatılır, yalnızca sorulacaklar kalır (Vazgeç'te onlar
 *  açık kalır). Sürerken gelen ikinci istek (ör. ikinci kapatma isteği) aynı sonucu bekler; sorular iki kez açılmaz. */
function kapatmayaIzinAl({ degismeyenleriKapat = false } = {}) {
  if (!_kapatmaIzni) _kapatmaIzni = (async () => {
    // Araç penceresi belgenin önünde açıktır ve belgeye bağlıdır (Sayfaları düzenle kaydederken sekmeye yazabilir): önce o
    if (!(await aracPencereleriniKapat())) return false;
    for (const b of belgeler.values()) b.notlar?.duzenleyiciBitir(true);   // açık yazı düzenlemesi kaydetme sorusunda sayılsın
    const vazgecildi = () => { for (const x of belgeler.values()) if (x.degisti) kirliGuncelle(x); return false; };   // kapanmıyor: iptal edilen otomatik kayıtlar yeniden kurulsun
    for (const b of [...belgeler.values()]) if (belgeler.has(b.id)) await kayitBitmesiniBekle(b);
    if (degismeyenleriKapat && [...belgeler.values()].some((b) => b.degisti)) {
      for (const id of [...baslangicSekmeleri]) baslangicSekmesiniKapat(id);
      for (const b of [...belgeler.values()]) if (belgeler.has(b.id) && !b.degisti) await belgeKapat(b.id);
    }
    for (const b of [...belgeler.values()]) {
      if (!belgeler.has(b.id)) continue;
      await kayitBitmesiniBekle(b);
      if (!b.degisti) continue;
      sekmeSec(b.id);   // hangi belge için sorulduğu görünsün
      const { secim } = await mesajKutusu(kaydetmedenCikisSorusu(b.ad));
      if (secim === 2 || (secim === 0 && !(await kapatirkenKaydet(b)))) return vazgecildi();
    }
    // Sorular açıkken başlamış olabilecek kayıtlar da bitsin: kapanışta çekirdek durdurulur, yazma yarıda kalmasın
    for (const b of [...belgeler.values()]) await kayitBitmesiniBekle(b);
    await konumlariKaydetHemen().catch((e) => console.warn('Sayfa konumları yazılamadı', e));   // kapanmayı engellemesin
    return true;
  })().finally(() => { _kapatmaIzni = null; });
  return _kapatmaIzni;
}

document.querySelectorAll('[data-komut]').forEach((el) => el.addEventListener('click', () => komutCalistir(el.dataset.komut, el.dataset.veri)));
// Yazı düzenlenirken Geri al / Yinele düğmesine basmak odağı ve seçimi düzenleyicide bırakır. Pasif düğmede mousedown gelmez ve odak
// gövdeye geçer: basılınca odak düzenleyicideyse hemen geri verilir (imleç kaybolup yazılanlar başka yere gitmesin)
for (const d of [$('#dugme-geri-al'), $('#dugme-yinele')]) {
  d.addEventListener('mousedown', (e) => { if (aktif()?.notlar?.duzenleyici) e.preventDefault(); });
  d.addEventListener('pointerdown', () => {
    const n = aktif()?.notlar, ed = n?.duzenleyici;
    if (ed && document.activeElement === ed.el) setTimeout(() => { if (n.duzenleyici === ed) n.duzenleyiciOdakla(); }, 0);
  });
}
// Araçlar düğmesi (fare ya da klavyeyle açma) açık yazı düzenlemesini uygular; pencere kendi dinleyicisinden önce (yakalama evresi)
$('#dugme-araclar').addEventListener('pointerdown', (e) => { if (e.button === 0) aktif()?.notlar?.duzenleyiciBitir(true); }, true);
$('#dugme-araclar').addEventListener('keydown', (e) => { if (['Enter', ' ', 'ArrowDown'].includes(e.key)) aktif()?.notlar?.duzenleyiciBitir(true); }, true);
// Yazı düzenlenirken düzenleyici ve biçim çubuğu dışındaki bir girdiye geçmek (sayfa / yakınlaştırma kutusu, Bul, panel) düzenlemeyi
// uygular (PDF okuyucularında da başka yere gitmek düzenlemeyi bitirir): o girdide basılan Esc yazıyı sessizce atmasın, Geri al düğmesi ve menüsü
// girdideyken düzenleyicinin geçmişini gösterip girdinin metnini geri almasın
document.addEventListener('focusin', (e) => {
  const n = aktif()?.notlar, d = n?.duzenleyici, t = e.target;
  // Düzenlerken açılan mesaj kutusunun onay kutusu da girdidir; soru geçicidir, Vazgeç'te düzenleme sürer
  if (!d || d.el.contains(t) || d.bicim.contains(t) || t.closest?.('.mesaj-kutusu')) return;
  if (girdideMi(t) || t.tagName === 'SELECT') n.duzenleyiciBitir(true);
});
document.querySelectorAll('#not-araclari [data-arac]').forEach((el) => {
  el.addEventListener('click', () => komutCalistir('not.arac', el.dataset.arac));
  if (el.dataset.arac === 'vurgu') el.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const secim = await pdefe.cagir('menu:popup', VURGU_RENKLERI.map((r) => ({ id: r.hex, etiket: r.ad, isaretli: r.hex === ayar.vurguRengi })));
    if (secim) { ayarKoy('vurguRengi', secim); secimCubuguYenile(); }
  });
});
// Seçim mini çubuğu (0.1.12, kullanıcı isteği): tek vurgu düğmesi (altındaki çizgi varsayılan renk) + ▾ renkler + not + kopyala.
// Renkler ▾ ile açılır: ▾'nin altında (çubuk seçimin üstündeyse ya da altta yer yoksa üstünde) dikey bir sütun (0.1.13, kullanıcı
// isteği: yatay renk satırı çubuğu genişletiyordu, çubuk kapalıyken de o genişlikte duruyordu); sütun çubuğun boyutunu değiştirmez.
// Seçilen renkle vurgulanır ve o renk değiştirilene dek varsayılan olur (vurguRengi). Açık sütun çubuk gizlenince kapanır (notlar.js
// secimCubuguGizle 'renkler-acik' sınıfını kaldırır). Düğmeler mousedown'da çalışır ve varsayılanı engeller: metin seçimi ve odak yerinde kalır.
const VURGU_SVG = '<svg viewBox="0 0 20 20"><path d="m5 13 8-8 2 2-8 8H5z" fill="none" stroke="currentColor" stroke-width="1.4"/><path class="renk-cizgi" d="M3 17h14" stroke-width="2.4"/></svg>';
function secimCubuguYenile() {
  const c = $('#secim-cubugu');
  const renk = ayar.vurguRengi || VURGU_RENKLERI[0].hex;
  const renkAdi = VURGU_RENKLERI.find((r) => r.hex === renk)?.ad || 'varsayılan renk';
  c.classList.remove('renkler-acik', 'renkler-yukari');
  c.innerHTML = '<div class="secim-ana">' +
    `<button class="ikon kucuk vurgu-dugme" data-islem="vurgu" title="Vurgula (${renkAdi})" style="--r:${renk}">${VURGU_SVG}</button>` +
    '<span class="renk-ac-kap"><button class="ikon kucuk renk-ac" data-islem="renkler" title="Vurgu rengini seç" aria-expanded="false"><svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>' +
    '<div class="secim-renkler" role="radiogroup" aria-label="Vurgu rengi">' +
    VURGU_RENKLERI.map((r) => `<button class="renk ${r.hex === renk ? 'secili' : ''}" data-renk="${r.hex}" title="${r.ad}" role="radio" aria-checked="${r.hex === renk}" style="--r:${r.hex}"></button>`).join('') +
    '</div></span>' +
    '<span class="ayrac"></span><button class="ikon kucuk" data-islem="not" title="Not ekle"><svg viewBox="0 0 20 20"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4.5A1.5 1.5 0 0 1 3 12.5z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>' +
    '<button class="ikon kucuk" data-islem="kopyala" title="Kopyala"><svg viewBox="0 0 20 20"><rect x="7" y="7" width="9" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-6A1.5 1.5 0 0 0 4 4.5v8A1.5 1.5 0 0 0 5.5 14H7" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>' +
    '</div>';
  const bas = (sec, f) => c.querySelectorAll(sec).forEach((btn) => btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.button === 0) f(btn); }));
  bas('[data-islem="vurgu"]', () => aktif()?.notlar.vurguUygula(renk));
  bas('[data-islem="renkler"]', (btn) => {
    const acik = c.classList.toggle('renkler-acik');
    btn.setAttribute('aria-expanded', String(acik));
    aktif()?.notlar.secimCubuguKonumla();   // sütunun açılacağı yön (altta / üstte yer) çubuğun konumuna göre
  });
  bas('.renk', (btn) => { const b = aktif(); if (!b) return; ayarKoy('vurguRengi', btn.dataset.renk); b.notlar.vurguUygula(btn.dataset.renk); secimCubuguYenile(); });
  bas('[data-islem="not"]', () => aktif()?.notlar.secimeNotKoy());
  bas('[data-islem="kopyala"]', () => { document.execCommand('copy'); aktif()?.notlar.secimCubuguGizle(); });
}
secimCubuguYenile();

// Araç çubuğu kutuları
sayfaKutusuBagla($('#sayfa-kutusu'), {
  gecerli: () => { const b = aktif(); return b ? String(b.gorunum.gecerli) : ''; },
  git: (no) => aktif()?.gorunum.sayfayaGit(no),
  birak: () => aktif()?.gorunum.kaydirici.focus(),
});
$('#zoom-kutusu').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const v = parseFloat(String(e.target.value).replace('%', '').replace(',', '.'));
    if (v > 0) aktif()?.gorunum.zoomAyarla(v / 100);
    e.target.blur(); aktif()?.gorunum.kaydirici.focus();
  }
  if (e.key === 'Escape') { e.target.blur(); aktif()?.gorunum.kaydirici.focus(); }
});
$('#zoom-kutusu').addEventListener('focus', (e) => e.target.select());
// Odak çıkınca (Enter, Esc, başka yere tıklama, sekme değişimi) kutu etkin belgenin ölçeğini '%N' olarak gösterir: yazılan '150' ya da geçersiz metin kalmaz
$('#zoom-kutusu').addEventListener('blur', () => zoomKutusuYaz(aktif()?.gorunum.olcek ?? 1));
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
  const d = gorunenDuzen();
  const secim = await pdefe.cagir('menu:popup', [
    { id: 'tek', etiket: 'Tek sayfa', isaretli: !duzenIkiMi(d) },
    { id: 'iki', etiket: 'İki sayfa', isaretli: duzenIkiMi(d) },
    { ayirici: true },
    { id: 'kaydirma', etiket: 'Kaydırmayı etkinleştir', isaretli: duzenKaydirmaMi(d) },
    { ayirici: true },
    { id: 'kapak', etiket: 'İki sayfalı görünümde kapak sayfasını ayrı göster', isaretli: gorunenKapak() },
  ]);
  if (!secim) return;
  if (secim === 'kapak') komutCalistir('gorunum.kapakAyri');
  else if (secim === 'kaydirma') komutCalistir('gorunum.kaydirma');
  else komutCalistir('gorunum.duzen', secim);
});

// Sekme olayları
sekmeler.addEventListener('sec', (e) => sekmeSec(e.detail.id));
sekmeler.addEventListener('kapat', (e) => sekmeKapat(e.detail.id));
sekmeler.addEventListener('belgedeAra', async (e) => { await sekmeSec(e.detail.id); arama.ac(e.detail.sorgu, { tumSekmeler: true }); });
sekmeler.addEventListener('sagTik', async (e) => {
  // Açılış sekmesinde (dosyası yok) Klasörde göster / Yolu kopyala / PDF'i kopyala devre dışı; pencerenin tek sekmesi açılış sekmesiyse
  // Kapat da (o sekme kapatılmaz)
  const id = e.detail.id; const b = belgeler.get(id); if (!b && !baslangicSekmeleri.has(id)) return;
  // Pencereye ayır (0.1.19, kullanıcı isteği): sekme kendi penceresinde açılır. Pencerenin tek sekmesinde (ayrılacak başka sekme yok)
  // ve açılış sekmesinde devre dışı
  const secim = await pdefe.cagir('menu:popup', [
    { id: 'kapat', etiket: 'Kapat', devre: tekAcilisSekmesi() === id }, { id: 'digerleri', etiket: 'Diğerlerini kapat', devre: sekmeler.sekmeler.length < 2 },
    { id: 'sagdakiler', etiket: 'Sağdakileri kapat', devre: sekmeler.sekmeler.findIndex((s) => s.id === id) >= sekmeler.sekmeler.length - 1 },
    { ayirici: true }, { id: 'ayir', etiket: 'Pencereye ayır', devre: !b || sekmeler.sekmeler.length < 2 },
    { ayirici: true }, { id: 'klasor', etiket: 'Klasörde göster', devre: !b }, { id: 'yol', etiket: 'Yolu kopyala', devre: !b },
    { id: 'pdf', etiket: 'PDF\'i kopyala', devre: !b },   // 0.1.21 (kullanıcı isteği): dosyanın kendisi panoya (araç çubuğundaki kopyala düğmesi gibi)
  ]);
  if (secim === 'ayir') { if (belgeler.has(id) && sekmeler.sekmeler.length > 1) await sekmeyiTasi(id, { tur: 'yeni' }); return; }
  if (secim === 'kapat') sekmeKapat(id);
  else if (secim === 'digerleri') await sekmeleriKapat(sekmeler.sekmeler.filter((s) => s.id !== id).map((s) => s.id));
  else if (secim === 'sagdakiler') { const i = sekmeler.sekmeler.findIndex((s) => s.id === id); await sekmeleriKapat(sekmeler.sekmeler.slice(i + 1).map((s) => s.id)); }
  else if (secim === 'klasor' && b) pdefe.cagir('kabuk:klasordeGoster', b.yol);
  else if (secim === 'yol' && b) { await pdefe.cagir('pano:metin', b.yol); bildir('Yol panoya kopyalandı'); }
  else if (secim === 'pdf' && b) await pdfKopyala(b);
});

// Panel olayları
panel.addEventListener('sayfayaGit', (e) => { const b = aktif(); if (b) { b.gorunum.sayfayaGit(e.detail.sayfa, { y: e.detail.y }); b.gorunum.kaydirici.focus(); } });
panel.addEventListener('notaGit', (e) => { const b = aktif(); if (!b) return; const n = e.detail.not; if (n.id && b.notlar) b.notlar.notaGit(n.id); else b.gorunum.sayfayaGit(n.sayfa, { y: Math.max(0, n.rect[1] - 40) }); });
panel.addEventListener('genislik', (e) => ayarKoy('solPanelGenislik', Math.round(e.detail.genislik)));
panel.addEventListener('sekme', (e) => ayarKoy('solPanelSekme', e.detail.sekme));
panel.addEventListener('durum', () => aktif()?.gorunum.boyutDegisti());

// ---------------------------------------------------------------- klavye
function girdideMi(a = document.activeElement) {
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}

/**
 * Yakınlaştırma tuşu (Ctrl, Alt'sız; AltGr = Ctrl+Alt kısayol değildir): 'yakin' | 'uzak' | 'gercek' | null. Tuşun ürettiği karaktere
 * (e.key) göre: Türkçe Q'da + Shift+4 ve = Shift+0'dır, "=" tuşu (VK_OEM_PLUS) yoktur; menü hızlandırıcısı sanal tuş koduyla eşlendiği
 * için Ctrl+= orada hiç çalışmıyordu. Ctrl++ (Shift'li ya da Shift'siz, sayısal + dahil) yakınlaştırır, Ctrl+− (Shift'li de: Türkçe Q'da
 * + için basılı tutulan Shift'le − gelebilir, döndürmez) uzaklaştırır, Ctrl+sayısal 0 gerçek boyut (NumLock kapalıyken o tuş Insert'tir:
 * Ctrl+Ins kopyalar). Döndürme yalnızca Ctrl+R / Ctrl+Shift+R (menü).
 */
function yakinlastirmaTusu(e) {
  if (!e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.code === 'NumpadAdd' || e.key === '+' || e.key === '=') return 'yakin';
  if (e.code === 'NumpadSubtract' || e.key === '-' || e.key === '_') return 'uzak';
  if (e.code === 'Numpad0' && e.key === '0') return 'gercek';
  return null;
}

/** Önceki / sonraki sekmeye (sekme çubuğundaki sırayla) geçer; ilk / son sekmede durur (◀ ▶ gibi). */
function sekmeGec(yon) { sekmeler.kaydir(yon); }

/** Belgenin önünde açık bir pencere (mesaj kutusu, Kısayollar / Yazdır / parola diyaloğu, Ayarlar, araç penceresi) var mı: varken sekme
 *  değiştiren ve arkadaki belgeyi değiştiren kısayollar çalışmaz (0.1.13 kısayol testi: Ctrl+1–9, Ctrl+Tab, Ctrl+Z arkada çalışıyordu). */
function ortuAcik() { return mesajKutusuAcik() || !!document.querySelector('.diyalog-ortusu, .arac-ortusu, .ayarlar-ortusu'); }

document.addEventListener('keydown', (e) => {
  // Ctrl+Tab seçici
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    if (sekmeler.sekmeler.length < 2 || (!sekmeler.seciciAcik && ortuAcik())) return;
    const yeniAcildi = !sekmeler.seciciAcik;
    if (yeniAcildi) sekmeler.seciciAc((id) => kucukResimAl(belgeler.get(id)));
    else sekmeler.seciciIlerle(e.shiftKey ? -1 : 1);
    if (yeniAcildi && e.shiftKey) sekmeler.seciciIlerle(-2);   // ilk Ctrl+Shift+Tab en eski sekmeye gider; sonrakiler birer geri
    return;
  }
  // Seçici açıkken (Ctrl basılı): ← → (↑ ↓) adaylar arasında gezer, Enter seçer, Esc vazgeçer; başka tuş belgeye gitmez
  if (sekmeler.seciciAcik) {
    e.preventDefault();
    if (e.key === 'Escape') sekmeler.seciciIptal();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') sekmeler.seciciIlerle(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') sekmeler.seciciIlerle(-1);
    else if (e.key === 'Enter') sekmeler.seciciKapat();
    return;
  }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
    if (ortuAcik()) return;
    const i = e.key === '9' ? sekmeler.sekmeler.length - 1 : parseInt(e.key, 10) - 1;
    const s = sekmeler.sekmeler[i];
    if (s) { e.preventDefault(); sekmeSec(s.id); }
    return;
  }
  // Ctrl+PageUp / Ctrl+PageDown: önceki / sonraki sekme (tarayıcılardaki gibi; 0.1.12'ye dek sayfa çeviriyordu). Girdi kutusunda da
  if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
    e.preventDefault();
    if (!mesajKutusuAcik() && !document.querySelector('.diyalog-ortusu, .arac-ortusu, .ayarlar-ortusu')) sekmeGec(e.key === 'PageDown' ? 1 : -1);
    return;
  }
  // Yakınlaştırma tuşları (menüde yalnızca yazar; bkz. yakinlastirmaTusu). Yazı düzenleyicisi ve not balonu bu tuşları geçirir (notlar.js belgeKisayoluMu)
  const yt = yakinlastirmaTusu(e);
  if (yt != null) {
    e.preventDefault();
    if (mesajKutusuAcik() || document.querySelector('.diyalog-ortusu, .ayarlar-ortusu')) return;
    if (yt === 'yakin') komutCalistir('gorunum.yakinlastir');
    else if (yt === 'uzak') komutCalistir('gorunum.uzaklastir');
    else komutCalistir('gorunum.zoom', 'gercek');
    return;
  }
  if (e.key === 'Escape') {
    if (!$('#belge-listesi').hidden) { sekmeler.belgeListesiKapat(); return; }
    if (document.querySelector('.ayarlar-ortusu')) { ayarlarPenceresiKapat(); return; }
    if (document.querySelector('.arac-pencere, .diyalog-ortusu')) return;   // pencere kendi Esc'ini işler
    const n = aktif()?.notlar;
    // Odak düzenleyicinin dışındayken (belge, araç çubuğu düğmesi) basılan Esc de düzenlemeyi uygulayıp bitirir. Başka bir girdideki
    // Esc (Bul, sayfa kutusu) o girdinindir (odak girdiye geçerken düzenleme zaten uygulanır)
    if (n?.duzenleyici && !(girdideMi(e.target) && !n.duzenleyici.el.contains(e.target))) { n.duzenleyiciEsc(); return; }
    if (girdideMi()) { document.activeElement.blur(); aktif()?.gorunum.kaydirici.focus(); return; }
    if (n?.arac) { n.aracSec(null); return; }
    if (n?.notCubuguId) { n.notCubuguKapat(); return; }
    if (n?.balon) { n.balonKapat(); return; }
    if (n?.secili) { n.sec(null); return; }
    if (okumaModu) { komutCalistir('gorunum.okumaModu'); return; }
  }
  // Girdi kutusunda tarayıcının kendi geri alma / tümünü seçmesi; açık pencere varken arkadaki belgeye gitmez
  if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) { if (!girdideMi()) { e.preventDefault(); if (!ortuAcik()) komutCalistir('duzen.geriAl'); } return; }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'y' || e.key === 'Y')) { if (!girdideMi()) { e.preventDefault(); if (!ortuAcik()) komutCalistir('duzen.yinele'); } return; }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'a' || e.key === 'A')) { if (!girdideMi()) { e.preventDefault(); if (!ortuAcik()) tumunuSec(); } return; }
  if (girdideMi()) return;
  // Açık diyalog / araç penceresi (odak pencerenin dışında kalmış olsa da), açılır liste ya da açık belgeler listesi varken belge
  // sayfa çevirmesin, not silinmesin
  if (document.querySelector('.diyalog-ortusu, .arac-ortusu') || !$('#belge-listesi').hidden || document.activeElement?.tagName === 'SELECT') return;
  // Ctrl+← / Ctrl+→: önceki / sonraki sekme (girdi kutusunda sözcük atlama kalır: yukarıda girdideMi). Açılış sekmesinde de
  if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); sekmeGec(e.key === 'ArrowRight' ? 1 : -1); return; }
  const b = aktif();
  if (!b) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { if (b.notlar?.silSecili()) { e.preventDefault(); return; } }
  const g = b.gorunum;
  const satir = 48;
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); g.dikeyKaydir(satir); break;
    case 'ArrowUp': e.preventDefault(); g.dikeyKaydir(-satir); break;
    case 'ArrowRight': if (!e.ctrlKey) { e.preventDefault(); g.yatayOk(1, satir); } break;
    case 'ArrowLeft': if (!e.ctrlKey) { e.preventDefault(); g.yatayOk(-1, satir); } break;
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

/** Belgedeki (metin katmanındaki) seçimin metni; seçim başka yerdeyse (ör. sayfa kutusunun odakta seçtiği numara) boş. */
function belgeSecimMetni() {
  const d = window.getSelection()?.anchorNode;
  return (d?.nodeType === 1 ? d : d?.parentElement)?.closest('.textLayer') ? secimHamMetni() : '';
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
  surukleSecimiBagla(belge.gorunum, { aracAl: () => belge.notlar?.arac });   // boşluktan da sürükleyerek seçim
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
    else if (secim === 'not') { if (!(seciliVar && belge.notlar.secimeNotKoy())) belge.notlar.sayfayaNotKoy(+sayfaEl.dataset.sayfa - 1, e); }
  });
}

document.addEventListener('copy', (e) => {
  const sec = window.getSelection();
  if (!sec || sec.isCollapsed || !sec.anchorNode) return;
  const katman = (sec.anchorNode.nodeType === 1 ? sec.anchorNode : sec.anchorNode.parentElement)?.closest('.textLayer');
  if (!katman) return;
  e.preventDefault();
  // Kopyalama her zaman temiz metin (0.1.12: Kopyalama ayarı, "Düzeni koru (ham)" seçeneğiyle birlikte kalktı)
  const metin = temizMetin(secimYapiliMetni() || secimHamMetni());
  e.clipboardData.setData('text/plain', metin);
  // Çekirdekten (PyMuPDF) daha temiz bir sürüm iste; hazır olunca panoyu güncelle
  const b = aktif();
  if (!b) return;
  const satirlar = satirlaraBirlestir(secimDikdortgenleri());
  if (!satirlar.size) return;
  (async () => {
    const sonuclar = [];
    for (const [sayfa, liste] of [...satirlar.entries()].sort((a, b2) => a[0] - b2[0])) {
      const g = b.gorunum;
      const s = g.sayfalar[sayfa - 1];
      if (!s || s.bos) continue;   // boş sayfanın metni yok
      // PyMuPDF sözcükleri döndürülmemiş, görünür kutunun (view) üst-sol kökenli koordinatındadır. pt.h taban /Rotate'i içerir
      // (90/270'te genişlikle yer değiştirir), kullanılmaz: view[0]/view[3] (notlar.js pxToPdf gibi)
      const view = (await g.sayfaAl(sayfa - 1)).view;
      const kutular = [];
      for (const l of liste) {
        const [x0, y0] = await g.pikselToPdf(sayfa - 1, l.x0, l.y);
        const [x1, y1] = await g.pikselToPdf(sayfa - 1, l.x1, l.y + l.h);
        kutular.push([Math.min(x0, x1) - view[0] - 1, view[3] - Math.max(y0, y1) - 1, Math.max(x0, x1) - view[0] + 1, view[3] - Math.min(y0, y1) + 1]);
      }
      // Ekrandaki sıra değil girdinin kaynağı: sayfa silinmiş/sıralanmış/eklenmişse b.yol'un aynı numaralı sayfası başka sayfadır.
      // Kaynak istek anında okunur (kayıt kaynakYeniden ile anlık kopyaya çevirmiş olabilir)
      sonuclar.push(await cekirdek('metin_sec', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, kutular }));
    }
    // Sayfa geçişinde boş paragraf varsa (bölüm arası sayfa sonuna denk gelmiş) araya boş satır
    const cekirdekMetin = temizMetin(sayfaMetinleriniBirlestir(sonuclar));
    // Çekirdek sürümü anlamlı biçimde farklı ve boş değilse panoyu güncelle. Yalnızca pano hâlâ bu kopyalamanın metnini taşıyorsa
    // (0.1.23, güvenlik denetimi): bu arada başka bir yerde kopyalanan metnin yerine belge metni geçmesin, yanlış yere yapıştırılmasın
    if (cekirdekMetin && cekirdekMetin.length >= metin.length * 0.5 && cekirdekMetin.length <= metin.length * 1.5 + 40) await pdefe.cagir('pano:metin', cekirdekMetin, { yalnizcaPanodaysa: metin });
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
  // Araçlar penceresi açıkken çubuk gizlenmez (pencere düğmeye bağlı; fare karolara inince havada kalırdı)
  document.body.classList.toggle('ust-goster', araclarPenceresi.acik || e.clientY < 6 || (document.body.classList.contains('ust-goster') && e.clientY < 48));
});

// ---------------------------------------------------------------- araç çubuğu: dar pencerede kademeli sıkıştırma
// Sığana kadar sırayla (stil.css .sikisik-1 - 5): ayraç ve boşluklar daralır, Araçlar yalnızca simge olur, düğmeler ve kutular daralır,
// menü çubuğu düğmesi gizlenir (Alt menüyü yine gösterir; 0.1.24), en son PDF'i kopyala gizlenir (Araçlar menüsünde de var). Gereken genişlik içeriğe
// (ör. sayfa sayısının basamakları) bağlı olduğundan ölçülür.
const aracCubugu = $('#arac-cubugu');
function aracCubuguSigdir() {
  for (let k = 1; k <= 5; k++) aracCubugu.classList.remove('sikisik-' + k);
  if (!aracCubugu.clientWidth) return;   // okuma modunda gizli
  const sinir = aracCubugu.getBoundingClientRect().right - parseFloat(getComputedStyle(aracCubugu).paddingRight);
  for (let k = 1; k <= 5 && aracCubugu.lastElementChild.getBoundingClientRect().right > sinir + 0.5; k++) aracCubugu.classList.add('sikisik-' + k);
}
// Pencere genişliği ve okuma modunda görünme için çubuğun kendi boyutu izlenir (sıkıştırma onu değiştirmez; grupları izlemek
// ResizeObserver döngü hatası verirdi). İçerik değişimi (öğe ekleme/gizleme, sayfa sayısı) MutationObserver ile çizimden önce yakalanır.
new ResizeObserver(aracCubuguSigdir).observe(aracCubugu);
let aracCubuguToplam = null;
new MutationObserver((kayitlar) => {
  const toplam = $('#sayfa-toplam')?.textContent;
  if (toplam === aracCubuguToplam && kayitlar.every((k) => k.target.id === 'sayfa-toplam')) return;   // her sayfa değişiminde yazılır
  aracCubuguToplam = toplam;
  aracCubuguSigdir();
}).observe(aracCubugu, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'style'] });

// ---------------------------------------------------------------- PDF'i kopyala
// Belgeyi dosya olarak panoya koyar (Gezgin'e, e-postaya, UYAP'a yapıştırılır): araç çubuğundaki kopyala düğmesi, Araçlar menüsü ve
// sekmede sağ tık › PDF'i kopyala (0.1.21). Komutun kimliği eskisi gibi 'arac.paylas'; 0.1.21'e dek arayüzde adı "Paylaş"tı (kullanıcı
// isteğiyle "kopyala" oldu). b: kopyalanacak belge (verilmezse etkin sekme). Kaydedilmemiş değişiklik varsa önce sorulur; sağ tıklanan
// sekme etkin değilse soru açılmadan önce ona geçilir (hangi belge için sorulduğu görünsün).
async function pdfKopyala(b = aktif()) {
  if (!b || !belgeler.has(b.id)) return;
  b.notlar?.duzenleyiciBitir(true);   // sağ tık menüsünden: açık yazı düzenlemesi kopyaya girsin (komutlarda DUZENLEMEYI_UYGULAYAN yapar)
  if (b.degisti) {
    if (aktifId !== b.id) await sekmeSec(b.id);
    const { secim } = await mesajKutusu({ mesaj: 'Belgede kaydedilmemiş değişiklikler var.', ayrinti: 'Kopyalamadan önce kaydetmek ister misiniz?', dugmeler: ['Kaydet ve kopyala', 'Kaydetmeden kopyala', 'Vazgeç'], iptal: 2 });
    if (secim === 2 || !belgeler.has(b.id)) return;
    if (secim === 0 && !(await belgeKaydet(b))) return;
  }
  const r = await pdefe.cagir('pano:dosya', b.yol);
  bildir(r.tamam ? 'Dosya panoya kopyalandı — Ctrl+V veya Yapıştır ile yapıştırabilirsiniz' : 'Panoya kopyalanamadı: ' + r.hata);
}

// ---------------------------------------------------------------- diyaloglar
/** Uygulama içi mesaj kutusu (mesajKutusu.js; yerel kutuyla aynı seçenekler ve sonuç: { secim, onay }). Yazı düzenlenirken açıldıysa
 *  (ör. döndürme sorusu) kapanınca imleç ve seçim düzenleyiciye döner; kutudaki Esc düzenlemeyi bitirmez (tuşu kutu alır). */
function mesajKutusu(secenek) {
  const n = aktif()?.notlar, ed = n?.duzenleyici, oncekiOdak = document.activeElement;
  return mesajKutusuAc(secenek).then((r) => { if (ed && n.duzenleyici === ed && oncekiOdak === ed.el) n.duzenleyiciOdakla(); return r; });
}

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
    btn.addEventListener('click', () => { kapat(); onSecim?.(b.id); });
    d.append(btn);
  }
  // Yazı düzenlenirken açıldıysa (F1) kapanınca imleç düzenleyiciye döner; Esc yalnızca pencereyi kapatır (genel Esc işleyicisi pencere
  // kalkmış olarak görüp düzenlemeyi de bitirmesin, seçimi / aracı bırakmasın)
  const n = aktif()?.notlar, ed = n?.duzenleyici, oncekiOdak = document.activeElement;
  const kapat = () => { ortu.remove(); if (ed && n.duzenleyici === ed && oncekiOdak === ed.el) n.duzenleyiciOdakla(); };
  ortu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); kapat(); onSecim?.(null); } });
  ortuTiklamasiBagla(ortu, () => { kapat(); onSecim?.(null); });   // pencerenin dışına tıklamak Esc gibi (parola: Vazgeç)
  document.body.append(ortu);
  (ortu.querySelector('.birincil') || ortu.querySelector('button'))?.focus();
  return ortu;
}

function kisayollarGoster() {
  // Üç sütun (dar pencerede alt alta): bölüm başlığı tek öğeli dizi; birden çok tuş dizi olarak verilir (tuş kutuları arasında satır kırılabilir).
  // Üçüncü sütun araç pencerelerinin fare ve tuş kullanımı: 0.1.13'e dek pencerelerin alt şeridinde yazıyordu (kullanıcı isteğiyle buraya taşındı).
  const sutunlar = [[
    ['Dosya ve sekmeler'],
    ['Ctrl+O', 'Aç'], ['Ctrl+T', 'Yeni sekme (açılış sayfası)'], ['Ctrl+S', 'Kaydet'], ['Ctrl+Shift+S', 'Farklı kaydet'], ['Ctrl+P', 'Yazdır'],
    ['Ctrl+W', 'Sekmeyi kapat'], [['Ctrl+PageUp / PageDown', 'Ctrl+← / →'], 'Önceki / sonraki sekme'],
    ['Ctrl+Tab / Ctrl+Shift+Tab', 'Son kullanılan sekmeye geç (basılı tutunca seçici; içinde ← →)'],
    ['Ctrl+1 – Ctrl+9', 'Sekme seç (9: son sekme)'],
    ['Sekmeyi sürükle', 'Sırala; sekme çubuğunun dışına bırakınca belge kendi penceresinde açılır'],
    ['Düzen'],
    ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'], ['Ctrl+F', 'Bul'], ['F3 / Shift+F3', 'Sonraki / önceki eşleşme'],
    ['Ctrl+A', 'Sayfadaki tüm metni seç'], ['Delete', 'Seçili notu sil'], ['Ctrl+,', 'Ayarlar'],
    ['Genel'],
    ['F1', 'Kısayollar'], ['Esc', 'Kapat / vazgeç'],
  ], [
    ['Gezinme'],
    ['Ctrl+G', 'Sayfaya git'], ['← →', 'Önceki / sonraki sayfa (yakınlaştırılmışsa önce yana kaydırır)'],
    ['PageUp / PageDown', 'Önceki / sonraki sayfa (kaydırma kapalıyken önce bir ekran)'],
    ['↑ ↓', 'Kaydır (kaydırma kapalıyken sayfa sonunda çevirir)'], ['Boşluk / Shift+Boşluk', 'Bir ekran aşağı / yukarı kaydır'],
    ['Home / End', 'İlk / son sayfa'], ['Ctrl+Home / End', 'Belge başı / sonu'], ['Shift+Fare tekerleği', 'Yatay kaydırma'],
    ['Görünüm'],
    [['Ctrl+Fare tekerleği', 'Ctrl++ / Ctrl+−'], 'Yakınlaştır / uzaklaştır'], ['Ctrl+0', 'Gerçek boyut'],
    ['Ctrl+R / Ctrl+Shift+R', 'Saat yönünde / tersine döndür'], ['F4', 'Sol panel'], ['Ctrl+H', 'Okuma modu'], ['F11', 'Tam ekran'],
    ['Yazı kutusu'],
    ['Ctrl+B / I / U', 'Kalın / italik / altı çizili'], ['Esc', 'Düzenlemeyi bitir (yazılan korunur)'],
  ], [
    ['Sayfaları düzenle'],
    ['Tıkla', 'Sayfayı seç'], ['Ctrl+tık / Shift+tık', 'Seçime ekle / aralığı seç'], ['Boş alandan sürükle', 'Alandaki sayfaları seç'],
    ['Sayfayı sürükle', 'Sırala (seçiliyse seçilenler birlikte)'], ['Delete', 'Seçilenleri sil'], ['Ctrl+A', 'Tümünü seç'],
    [['← → ↑ ↓', 'Home / End'], 'Sayfalar arasında gez (Shift ile seçimi genişlet)'], ['R / Shift+R', 'Seçilenleri sağa / sola döndür'],
    ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'],
    ['Görüntü / PDF birleştir'],
    ['Tıkla', 'Dosyayı seç'], ['Ctrl+tık / Shift+tık', 'Seçime ekle / aralığı seç'],
    [['Sağ tuşla sürükle', 'Boş alandan sürükle'], 'Alandaki dosyaları seç'], ['Satırı sürükle', 'Sırala (seçiliyse seçilenler birlikte)'],
    ['Delete', 'Seçilenleri çıkar'], ['Ctrl+A', 'Tümünü seç'], ['Ctrl+V', 'Panodaki dosyaları ya da görüntüyü ekle'],
  ]];
  const satir = ([k, a]) => (a == null ? `<tr class="bolum"><th colspan="2">${k}</th></tr>`
    : `<tr><td>${[].concat(k).map((t) => `<kbd>${t}</kbd>`).join(' ')}</td><td>${a}</td></tr>`);
  diyalogAc({
    baslik: 'Kısayollar',
    govde: '<div class="kisayol-sutunlar">' + sutunlar.map((s) => '<table class="kisayollar">' + s.map(satir).join('') + '</table>').join('') + '</div>',
    dugmeler: [{ id: 'tamam', etiket: 'Tamam', birincil: true }],
    genislik: 1180,
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
function hataMetni(e) { return ((e && (e.message || String(e))) || 'Bilinmeyen hata').replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
function kacis(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Bağlantılar dış tarayıcıda, bir kez: kendi tıklama işleyicisi bağlantıyı açmış (varsayılanı engellemiş) öğe yeniden açılmaz
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="http"]');
  if (!a || e.defaultPrevented) return;
  e.preventDefault();
  pdefe.cagir('kabuk:disAc', a.href).catch(() => {});
});

// ---------------------------------------------------------------- başlat
(async function baslat() {
  await ayarlariYukle();
  secimCubuguYenile();   // seçim mini çubuğunda kayıtlı vurgu rengi seçili görünsün (çubuk ayarlar yüklenmeden kuruluyor)
  // Pencere açılış sekmesiyle açılır (0.1.21): sekme çubuğu hiç kapanmaz. Açılırken verilen ya da başka pencereden gelen belge bu sekmenin
  // yerini alır (ana süreç belge göndermeden önce 'uygulama:hazir'ı bekler). Açılış sayfası son açılanları da listeler
  yeniSekme();
  pdefe.gonder('pencere:belgeler', []);   // arayüz yeniden yüklendiyse ana süreçteki açık belge kaydı bayat kalmasın
  pdefe.gonder('uygulama:hazir');
  window.__pdefe = { belgeler, aktif, dosyaAc, belgeKapat, sekmeSec, komutCalistir, ayar: () => ayar, panel, sekmeler, arama, temizMetin, sayfaTarifiUygula, sayfalariDondur, belgeKaydet, mesajKutusu, sekmeyiTasi, sekmePaketi, tasimaSuruyor: () => tasimaSuruyor, kilitli: () => girdiKilitli() };
})();
