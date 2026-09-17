// PDEfe arayüz girişi: sekmeler, komutlar, kısayollar, ayarlar, sürükle-bırak.
import { Goruntuleyici, yolAnahtari } from './goruntuleyici.js';
import { SekmeCubugu } from './sekmeler.js';
import { SolPanel } from './panel.js';
import { DurumCubugu, boyutMetni, sayfaKutusuBagla, sayfaKutusuYaz } from './durum.js';
import { Arama } from './arama.js';
import { temizMetin, hamMetin, secimDikdortgenleri, satirlaraBirlestir, paragrafSec, secimHamMetni, secimYapiliMetni, surukleSecimiBagla } from './metin.js';
import { NotYoneticisi, VURGU_RENKLERI } from './notlar.js';
import { KomutYigini, Komut } from './komutlar.js';
import { ayarlarPenceresiAc, ayarlarPenceresiKapat } from './ayarlarPenceresi.js';
import { aracKomutlari } from './araclar/index.js';
import { AraclarPenceresi } from './aracPenceresi.js';
import { guncellemeSeridiKur } from './guncelleme.js';
import { yazdir } from './yazdir.js';

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
  temaUygula();
  panel.genislikAyarla(ayar.solPanelGenislik || 240);
  if (ayar.solPanelAcik) panel.acKapa(true);
  panel.sekmeSec(ayar.solPanelSekme || 'sayfalar');
}

function ayarKoy(anahtar, deger) { ayar[anahtar] = deger; return pdefe.cagir('ayar:koy', anahtar, deger); }

function koyuMu() { return ayar.tema === 'sistem' ? sistemKoyu : ayar.tema === 'koyu'; }

function temaUygula() {
  document.documentElement.dataset.tema = koyuMu() ? 'koyu' : 'acik';
  $('#dugme-tema').title = koyuMu() ? 'Açık temaya geç' : 'Koyu temaya geç';   // düğme geçilecek temanın simgesini gösterir (ay / güneş)
  for (const b of belgeler.values()) { b.gorunum.koyuSayfaAyarla(koyuMu() && ayar.sayfayiKoyulastir); b.notlar?.hepsiniCiz(); }   // vurgu karışımı koyu sayfaya göre
}

pdefe.dinle('tema:sistem', (koyu) => { sistemKoyu = koyu; temaUygula(); });

/** Ayarlar penceresinden gelen değişiklikleri canlı uygular. */
function ayarUygula(anahtar, deger) {
  switch (anahtar) {
    case 'tema': case 'sayfayiKoyulastir': temaUygula(); break;
    case 'vurguRengi': secimCubuguYenile(); break;
    case 'otomatikKaydet': if (deger) for (const b of belgeler.values()) if (b.degisti) kirliGuncelle(b); break;
    case 'varsayilanDuzen': case 'kapakAyri': duzenEsitle(aktif()); break;   // diğer sekmeler seçildiklerinde eşitlenir
    default: break;   // yazarAdi, yazı tipi, temizMetin vb. ayar nesnesinden okunur; anında etkili
  }
}

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
  const gorunum = new Goruntuleyici(el, { dosyaOku: async (y) => (await pdefe.cagir('dosya:oku', y)).veri, cekirdek });
  // diskDondurme: yüklenen dosyaya (gorunum.yol) artımlı kayıtla işlenmiş göreli döndürmeler, kaynak sayfa no → açı (bkz. yapisalTarif)
  const belge = { id, yol, ad, el, gorunum, degisti: false, boyut: 0, bilgi: null, diskDondurme: {} };
  belgeler.set(id, belge);
  sekmeler.ekle({ id, ad, yol });
  if (!secenek.arkaPlanda || !aktifId) sekmeSec(id);
  $('#baslangic').hidden = true;

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
  belge.notlar.addEventListener('uyari', (e) => { if (aktifId === id) bildir(e.detail.metin, 6000); });

  try {
    const { veri, boyut } = await pdefe.cagir('dosya:oku', yol);
    belge.boyut = boyut;
    const sonSayfa = ayar.kaldigimSayfadanAc ? (ayar.sayfaKonumlari || {})[yol] : null;
    const zoom = ayar.varsayilanZoom;
    const zoomModu = ['genislik', 'sayfa', 'gercek', 'gorunur'].includes(zoom) ? zoom : 'serbest';
    const olcek = zoom === 'son' ? (ayar.sonZoom || 100) / 100 : (typeof zoom === 'number' ? zoom / 100 : 1);
    gorunum.koyuSayfa = koyuMu() && ayar.sayfayiKoyulastir;
    await gorunum.yukle(veri, {
      yol, duzen: genelDuzen(), kapakAyri: !!ayar.kapakAyri, zoomModu, olcek,
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
  if (aktifId === id) { duzenEsitle(belge); sayfaGoster(belge); zoomGoster(belge); durum.boyutYaz(belge.boyut); panel.belgeAyarla(belge); }
  sonDosyalaraEkle(yol);
  return belge;
}

async function sekmeSec(id) {
  const b = belgeler.get(id);
  if (!b) return;
  if (aktifId && aktifId !== id) {
    const eski = belgeler.get(aktifId);
    if (eski) {
      eski.notlar?.balonKapat(); eski.notlar?.duzenleyiciBitir(true);
      eski.el.hidden = true;
    }
  }
  aktifId = id;
  b.el.hidden = false;
  duzenEsitle(b);   // genel düzen/kapak bu sekme arka plandayken değiştiyse şimdi uygula
  sekmeler.aktifYap(id);
  sayfaGoster(b); zoomGoster(b);
  durum.boyutYaz(b.boyut); durum.degisiklikYaz(b.degisti);
  geriAlDugmeleriniGuncelle(b);
  aracDugmeleriniGuncelle(b.notlar?.arac || null);
  pdefe.cagir('pencere:baslik', b.ad);
  panel.belgeAyarla(b);
  b.gorunum.boyutDegisti();
  b.gorunum.kaydirici.focus({ preventScroll: true });
}

function kirliGuncelle(b) {
  b.degisti = !!(b.yigin?.kirli || b.gorunum.yapisalKirli() || (!b.gorunum.anlik && b.notlar?.kirli));
  sekmeler.guncelle(b.id, { degisti: b.degisti });
  if (aktifId === b.id) { durum.degisiklikYaz(b.degisti); geriAlDugmeleriniGuncelle(b); }
  $('#arac-cubugu [data-komut="dosya.kaydet"]').disabled = !aktif()?.degisti;
  if (ayar.otomatikKaydet && b.degisti) { clearTimeout(b._otoKayit); b._otoKayit = setTimeout(() => { if (b.degisti && belgeler.has(b.id)) belgeKaydet(b, false, true); }, 1500); }
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
  // Süren kayıt yarıda kesilmesin (anlık kopya silinir, 'Kaydet' kaydediliyor koruması yüzünden sessizce false dönerdi); bitince degisti yeniden değerlendirilir
  await kayitBitmesiniBekle(b);
  if (!belgeler.has(id)) return true;   // beklerken başka yoldan kapatılmış
  if (b.degisti && !secenek.zorla) {
    const { secim } = await mesajKutusu({ mesaj: `"${b.ad}" belgesinde kaydedilmemiş değişiklikler var.`, ayrinti: 'Kapatmadan önce kaydetmek ister misiniz?', dugmeler: ['Kaydet', 'Kaydetme', 'Vazgeç'], varsayilan: 0, iptal: 2 });
    if (secim === 2) { if (belgeler.has(id)) kirliGuncelle(b); return false; }   // kapatılmadı: otomatik kayıt zamanlayıcısı yeniden kurulsun
    if (secim === 0 && !(await kapatirkenKaydet(b))) return false;
    await kayitBitmesiniBekle(b);   // soru açıkken başlamış olabilecek (otomatik) kayıt
    if (!belgeler.has(id)) return true;
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
  if (b.gorunum.anlik) cekirdek('anlik_sil', { yol: b.gorunum.anlik }).catch(() => {});
  if (aktifId === id) {
    aktifId = null;
    const sonraki = sekmeler.mru[0] || sekmeler.sekmeler[0]?.id;
    if (sonraki) sekmeSec(sonraki);
    else { baslangicGoster(); }
  }
  return true;
}

function baslangicGoster() {
  $('#baslangic').hidden = false;
  durum.sayfa(0, 0); durum.zoomYaz(1); durum.boyutYaz(null); durum.degisiklikYaz(false);
  sayfaKutusuYaz($('#sayfa-kutusu'), ''); $('#sayfa-toplam').textContent = '/ 0';
  pdefe.cagir('pencere:baslik', '');
  panel.belgeAyarla(null);
  sonDosyalariListele();
}

/** Belgeyi kaydeder. farkli=true ise yeni yol sorar. Başarılıysa true döner.
 *  Çağrı sürdükçe (Farklı kaydet diyaloğu ve hata sorusu dahil) b.kaydediliyor true'dur ve b.kayitSozu çağrı bitince çözülür
 *  (hiç reddedilmez); kapatma akışları onu bekler (kayitBitmesiniBekle). Bu arada gelen ikinci kaydetme false döner. */
async function belgeKaydet(b, farkli = false, sessiz = false) {
  if (!b || b.kaydediliyor) return false;
  let bitti;
  b.kaydediliyor = true;
  b.kayitSozu = new Promise((coz) => { bitti = coz; });
  try {
    for (;;) {
      try { return await kayitYaz(b, farkli, sessiz); } catch (e) {
        durum.mesajYaz('');
        const kilitli = /açık olabilir|yazılamadı|okunamadı|Failed to open|Permission|EBUSY|EPERM/i.test(e.message || '');
        const { secim } = await mesajKutusu({ tur: 'error', mesaj: 'Belge kaydedilemedi', ayrinti: (kilitli ? 'Dosya başka bir programda (örneğin bir PDF okuyucu) açık olabilir. Onu kapatıp yeniden deneyin ya da farklı bir adla kaydedin.\n\n' : '') + hataMetni(e), dugmeler: kilitli ? ['Farklı kaydet', 'Vazgeç'] : ['Tamam'], iptal: kilitli ? 1 : 0 });
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
    // Döndürmesi son kayıttakinden farklı sayfaların mutlak açıları notlardan önce uygulanır; aynı dosyaya artımlı yazılır
    const sayfaDondurmeleri = yalnizDondurme ? await sayfaDondurmeleriHesapla(g, tarif, tarifAnligi) : null;
    r = await cekirdek('notlar_kaydet', { yol: b.yol, hedef, islemler, artimli: true, ...(sayfaDondurmeleri ? { sayfaDondurmeleri } : {}) });
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
    sekmeler.guncelle(b.id, { ad: b.ad });
    sekmeler.bul(b.id).yol = hedef; sekmeler.bul(b.id).el.title = hedef;
    pdefe.cagir('pencere:baslik', b.ad);
    sonDosyalaraEkle(hedef);
  }
  kirliGuncelle(b);
  if (aktifId === b.id) durum.boyutYaz(b.boyut);
  durum.mesajYaz(sessiz ? 'Otomatik kaydedildi' : 'Kaydedildi' + (r.artimli ? '' : ' (tam yazım)'));
  cekirdek('belge_birak', { yol: b.yol }).catch(() => {});
  panel.yorumlariYenile();
  return true;
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

let _konumZaman = null;
/** Verilen belgelerin sayfa konumlarını tek yazımda kaydeder (en fazla 300 dosya; en eskiler düşer). */
function konumlariYaz(liste) {
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
  b.yigin.calistir(new Komut(ad, () => g.sayfalariAyarla(yeni), () => g.sayfalariAyarla(eski)));
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
  'sekme.kapat': () => { if (aktifId) belgeKapat(aktifId); else pdefe.cagir('pencere:kapat'); },
  'duzen.geriAl': () => { const b = aktif(); if (!b) return; if (girdideMi()) { document.execCommand('undo'); return; } const k = b.yigin.geriAl(); if (k) durum.mesajYaz('Geri alındı: ' + k.ad); },
  'duzen.yinele': () => { const b = aktif(); if (!b) return; if (girdideMi()) { document.execCommand('redo'); return; } const k = b.yigin.yinele(); if (k) durum.mesajYaz('Yinelendi: ' + k.ad); },
  'duzen.tumunuSec': () => tumunuSec(),
  'duzen.bul': (metin) => { if (aktif()) arama.ac(typeof metin === 'string' ? metin : (secimHamMetni().trim().split('\n')[0] || '')); },
  'duzen.bulSonraki': () => arama.git(1), 'duzen.bulOnceki': () => arama.git(-1),
  'duzen.sayfayaGit': () => { const k = $('#sayfa-kutusu'); k.focus(); k.select(); },
  'duzen.ayarlar': () => ayarlarPenceresiAc({ ayar: () => ayar, ayarKoy, uygula: ayarUygula, pdefe, varsayilanlar, cekirdek }),
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
  'gorunum.okumaModu': () => { okumaModu = !okumaModu; document.body.classList.toggle('okuma-modu', okumaModu); aktif()?.gorunum.boyutDegisti(); },
  'gorunum.tamEkran': () => pdefe.cagir('pencere:tamEkran'),
  'arac.paylas': () => paylas(),
  'arac.kucult': () => bildir('PDF küçültme aracı sonraki aşamada.'),
  'arac.sayfalar': () => bildir('Sayfaları düzenle aracı sonraki aşamada.'),
  'arac.ayir': () => bildir('PDF ayırma aracı sonraki aşamada.'),
  'arac.gorselBirlestir': () => bildir('Görüntü/PDF birleştirme aracı sonraki aşamada.'),
  'arac.dondurKaydet': () => bildir('Döndür ve kaydet sonraki aşamada.'),
  'yardim.kisayollar': () => kisayollarGoster(),
  'yardim.hakkinda': () => ayarlarPenceresiAc({ ayar: () => ayar, ayarKoy, uygula: ayarUygula, pdefe, varsayilanlar, cekirdek }, { bolum: 'hakkinda' }),
};

// Araç pencereleri (küçült, sayfaları düzenle, döndür ve kaydet, ayır, görüntü/PDF birleştir)
try {
  Object.assign(komutlar, aracKomutlari({
    aktif, cekirdek,
    iptal: (istekId) => pdefe.cagir('cekirdek:iptal', istekId),
    dosyaAc, kaydet: (b) => belgeKaydet(b), mesajKutusu, bildir, pdefe,
    belgeKapat: (id, secenek) => belgeKapat(id, secenek),   // küçült "üzerine yaz" sonrası sekmeyi kapatıp yeniden açmak için
    belgeler: () => [...belgeler.values()],                // araç çıktısı açık bir sekmenin dosyasına yazıldıysa o sekmeyi yenilemek için
    ayar: () => ayar, ayarKoy,
    sayfaTarifiUygula: (b, tarif, ad) => sayfaTarifiUygula(b, tarif, ad),
    dosyaYolu: (f) => pdefe.dosyaYolu(f),
  }));
} catch (e) { console.error('Araç komutları bağlanamadı', e); }

// Güncelleme şeridi
let guncelleme = null;
try {
  // Kurulum uygulamayı kapatır: kaydedilmemiş değişiklikler pencere kapatmadaki gibi sorulur; false kurulumu iptal eder
  guncelleme = guncellemeSeridiKur({ pdefe, serit: $('#guncelleme-seridi'), bildir, kapatmadanOnce: () => kapatmayaIzinAl() });
  komutlar['yardim.guncelle'] = () => guncelleme.denetle();
} catch (e) { console.error('Güncelleme şeridi kurulamadı', e); }

function komutCalistir(id, veri) {
  const f = komutlar[id];
  if (!f) { console.warn('Bilinmeyen komut', id); return; }
  try { const r = f(veri); if (r && r.catch) r.catch((e) => { console.error(e); bildir('Hata: ' + hataMetni(e)); }); }
  catch (e) { console.error(e); bildir('Hata: ' + hataMetni(e)); }
}

// Araç çubuğundaki Araçlar düğmesinin penceresi; menüden ya da kısayolla gelen komut onu kapatır
const araclarPenceresi = new AraclarPenceresi({ dugme: $('#dugme-araclar'), komutCalistir: (id) => komutCalistir(id), belgeVar: () => !!aktif() });

pdefe.dinle('menu:komut', (id, veri) => { araclarPenceresi.kapat(); komutCalistir(id, veri); });
pdefe.dinle('dosya:ac', async (yollar) => { for (const y of yollar) await dosyaAc(y); });
pdefe.dinle('pencere:tamEkran', (acik) => document.body.classList.toggle('tam-ekran', acik));
pdefe.dinle('pencere:kapatIstegi', async () => { if (await kapatmayaIzinAl()) await pdefe.cagir('pencere:kapatOnayla'); });

let _kapatmaIzni = null;
/** Uygulama kapanmadan önce (pencere kapatma, güncelleme kurulumu): süren kayıtları bekler, kaydedilmemiş her belge için
 *  Kaydet / Kaydetme / Vazgeç sorar, sonunda sayfa konumlarını yazar. Vazgeç ya da başarısız kayıtta false döner.
 *  Sürerken gelen ikinci istek (ör. ikinci kapatma isteği) aynı sonucu bekler; sorular iki kez açılmaz. */
function kapatmayaIzinAl() {
  if (!_kapatmaIzni) _kapatmaIzni = (async () => {
    for (const b of [...belgeler.values()]) {
      if (!belgeler.has(b.id)) continue;
      await kayitBitmesiniBekle(b);
      if (!b.degisti) continue;
      sekmeSec(b.id);   // hangi belge için sorulduğu görünsün
      const { secim } = await mesajKutusu({ mesaj: `"${b.ad}" belgesinde kaydedilmemiş değişiklikler var.`, ayrinti: 'Çıkmadan önce kaydetmek ister misiniz?', dugmeler: ['Kaydet', 'Kaydetme', 'Vazgeç'], varsayilan: 0, iptal: 2 });
      if (secim === 2 || (secim === 0 && !(await kapatirkenKaydet(b)))) {
        for (const x of belgeler.values()) if (x.degisti) kirliGuncelle(x);   // kapanmıyor: iptal edilen otomatik kayıtlar yeniden kurulsun
        return false;
      }
    }
    // Sorular açıkken başlamış olabilecek kayıtlar da bitsin: kapanışta çekirdek durdurulur, yazma yarıda kalmasın
    for (const b of [...belgeler.values()]) await kayitBitmesiniBekle(b);
    await konumlariKaydetHemen().catch((e) => console.warn('Sayfa konumları yazılamadı', e));   // kapanmayı engellemesin
    return true;
  })().finally(() => { _kapatmaIzni = null; });
  return _kapatmaIzni;
}

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
sekmeler.addEventListener('kapat', (e) => belgeKapat(e.detail.id));
sekmeler.addEventListener('belgedeAra', async (e) => { await sekmeSec(e.detail.id); arama.ac(e.detail.sorgu, { tumSekmeler: true }); });
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
    if (document.querySelector('.ayarlar-ortusu')) { ayarlarPenceresiKapat(); return; }
    if (document.querySelector('.arac-pencere, .diyalog-ortusu')) return;   // pencere kendi Esc'ini işler
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
  // Açık diyalog / araç penceresi (odak pencerenin dışında kalmış olsa da), açılır liste ya da açık belgeler listesi varken belge
  // sayfa çevirmesin, not silinmesin
  if (document.querySelector('.diyalog-ortusu, .arac-ortusu') || !$('#belge-listesi').hidden || document.activeElement?.tagName === 'SELECT') return;
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
      const r = await cekirdek('metin_sec', { yol: s.kaynak.yol, sayfa: s.kaynak.sayfa, kutular });
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
  // Araçlar penceresi açıkken çubuk gizlenmez (pencere düğmeye bağlı; fare karolara inince havada kalırdı)
  document.body.classList.toggle('ust-goster', araclarPenceresi.acik || e.clientY < 6 || (document.body.classList.contains('ust-goster') && e.clientY < 48));
});

// ---------------------------------------------------------------- araç çubuğu: dar pencerede kademeli sıkıştırma
// Sığana kadar sırayla (stil.css .sikisik-1 - 4): ayraç ve boşluklar daralır, Araçlar yalnızca simge olur, düğmeler ve kutular daralır,
// en son Paylaş gizlenir (Araçlar penceresinde ve menüde de var). Gereken genişlik içeriğe (ör. sayfa sayısının basamakları) bağlı olduğundan ölçülür.
const aracCubugu = $('#arac-cubugu');
function aracCubuguSigdir() {
  for (let k = 1; k <= 4; k++) aracCubugu.classList.remove('sikisik-' + k);
  if (!aracCubugu.clientWidth) return;   // okuma modunda gizli
  const sinir = aracCubugu.getBoundingClientRect().right - parseFloat(getComputedStyle(aracCubugu).paddingRight);
  for (let k = 1; k <= 4 && aracCubugu.lastElementChild.getBoundingClientRect().right > sinir + 0.5; k++) aracCubugu.classList.add('sikisik-' + k);
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

// ---------------------------------------------------------------- paylaş
async function paylas() {
  const b = aktif(); if (!b) return;
  if (b.degisti) {
    const { secim } = await mesajKutusu({ mesaj: 'Belgede kaydedilmemiş değişiklikler var.', ayrinti: 'Paylaşmadan önce kaydetmek ister misiniz?', dugmeler: ['Kaydet ve paylaş', 'Kaydetmeden paylaş', 'Vazgeç'], iptal: 2 });
    if (secim === 2) return;
    if (secim === 0 && !(await belgeKaydet(b))) return;
  }
  const r = await pdefe.cagir('pano:dosya', b.yol);
  bildir(r.tamam ? 'Dosya panoya kopyalandı — Ctrl+V veya Yapıştır ile yapıştırabilirsiniz' : 'Panoya kopyalanamadı: ' + r.hata);
}

// ---------------------------------------------------------------- diyaloglar
function mesajKutusu(secenek) {
  if (window.__pdefeOtoYanit) { const o = window.__pdefeOtoYanit; o.son = secenek; console.warn('[test] mesaj kutusu otomatik yanıtlandı:', secenek.mesaj); return Promise.resolve({ secim: o.secim ?? 0, onay: !!o.onay }); }
  return pdefe.cagir('mesaj:kutu', secenek);
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
    ['Ctrl+Tab / Ctrl+Shift+Tab', 'Sekme değiştir (basılı tutunca seçici açılır)'], ['Ctrl+1 – Ctrl+9', 'Sekme seç (9: son sekme)'],
    ['Ctrl+Fare tekerleği, Ctrl++ / Ctrl+−', 'Yakınlaştır / uzaklaştır'], ['Ctrl+0', 'Gerçek boyut'],
    ['Ctrl+Shift++ / Ctrl+Shift+−', 'Döndür'], ['F4', 'Sol panel'], ['Ctrl+H', 'Okuma modu'], ['F11', 'Tam ekran'],
    ['← →', 'Önceki / sonraki sayfa (elle yakınlaştırılmışsa önce yana kaydırır)'], ['PageUp / PageDown', 'Önceki / sonraki sayfa (kaydırma kapalıyken önce bir ekran kaydırır)'],
    ['↑ ↓', 'Kaydır (kaydırma kapalıyken sayfa sonunda sayfayı çevirir)'], ['Home / End', 'İlk / son sayfa'], ['Ctrl+Home / Ctrl+End', 'Belge başı / sonu'],
    ['Shift+Fare tekerleği', 'Yatay kaydırma'], ['Ctrl+A', 'Sayfadaki tüm metni seç'], ['Delete', 'Seçili notu sil'], ['Esc', 'Kapat / vazgeç'],
  ];
  diyalogAc({
    baslik: 'Klavye kısayolları',
    govde: '<table>' + satirlar.map(([k, a]) => `<tr><td><kbd>${k}</kbd></td><td>${a}</td></tr>`).join('') + '</table>',
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
function hataMetni(e) { return ((e && (e.message || String(e))) || 'Bilinmeyen hata').replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
function kacis(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Bağlantılar dış tarayıcıda
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="http"]');
  if (a) { e.preventDefault(); pdefe.cagir('kabuk:disAc', a.href); }
});

// ---------------------------------------------------------------- başlat
(async function baslat() {
  await ayarlariYukle();
  secimCubuguYenile();   // seçim mini çubuğunda kayıtlı vurgu rengi seçili görünsün (çubuk ayarlar yüklenmeden kuruluyor)
  sonDosyalariListele();
  pdefe.gonder('uygulama:hazir');
  window.__pdefe = { belgeler, aktif, dosyaAc, belgeKapat, sekmeSec, komutCalistir, ayar: () => ayar, panel, sekmeler, arama, temizMetin, sayfaTarifiUygula, sayfalariDondur, belgeKaydet };
})();
