// Ayarlar penceresi: solda bölüm listesi, sağda içerik (Windows 11 Ayarlar havası).
// Her değişiklik anında kaydedilir (baglam.ayarKoy) ve canlı uygulanır (baglam.uygula).
// Bölümler (0.1.12): Görünüm (tema, yazı çizimi), Açılış ve düzen (varsayılan uygulama, kaldığım sayfa, son açılanlar; yakınlaştırma,
// tek/iki sayfa, kaydırma, kapak; 0.2.2'den beri pencereyi kapatırken), Not ve vurgu, Kaydetme (otomatik kaydet, araçların çıktı klasörü), Güncelleme,
// Kısayollar (0.2.4; F1'deki liste, ayar değil), Hakkında.
// Sekme adı içeriğini söylesin: bir ayar eklerken ona göre yerleştirin. 0.1.12'de (kullanıcı isteği) Sayfa düzeni ile Belge açılışı
// birleşti ("Açılış ve düzen"), Notlar'ın adı "Not ve vurgu" oldu, Kopyalama kalktı (kopyalama her zaman temiz metin).
// Sayfa düzeni iki kontrolle (Tek/İki sayfa + Kaydırma) tek bir varsayilanDuzen değerine yazılır:
// 'tek' | 'surekli' | 'iki' | 'ikiSurekli'. Hakkında bölümü yalnızca sürümü ve geliştiriciyi gösterir.
//
// Dışa verilen API:
//   ayarlarPenceresiAc(baglam, secenek?)  → pencere kök öğesi (HTMLElement); zaten açıksa öne getirir.
//     baglam = { ayar: () => ayarlar, ayarKoy(anahtar, deger), uygula(anahtar, deger), pdefe, varsayilanlar, guncelleme?, sonTemizle? }
//     (guncelleme: renderer/guncelleme.js şerit API'si; Güncelleme bölümündeki denetim ve Güncelle düğmesi onu kullanır.
//     sonTemizle: son açılanlar listesini siler; menü ve başlangıç ekranı da güncellenir)
//     secenek = { bolum?: 'gorunum'|'acilis'|'notlar'|'kaydetme'|'guncelleme'|'kisayollar'|'hakkinda', ayar?: anahtar }
//     (eski kimlikler ESKI_BOLUMLER'le eşlenir: 'sayfa', 'baslangic', 'dosya' → 'acilis'; 'kopyalama' → 'gorunum')
//     ayar (0.2.4): bölümdeki o ayarın kartı görünür alana kaydırılır, kısa süre vurgulanır, denetimi odaklanır (kartın data-hedef'i;
//     yakınlaştırma okunun listesindeki "Varsayılanı ayarla" → { bolum: 'acilis', ayar: 'varsayilanZoom' })
//   ayarlarPenceresiKapat()               → açık pencereyi kapatır.
//   ayarlarPenceresiniGuncelle(anahtar)   → ayar dışarıdan değişince açık penceredeki seçim kutusunu günceller (data-ayar işaretli).
//   DURUM_ANAHTARLARI                     → "Varsayılanlara dön" ile sıfırlanmayan durum alanları.
import { ortuTiklamasiBagla } from './ortu.js';
import { mesajKutusu } from './mesajKutusu.js';
import { MAC, SISTEM } from './platform.js';
import { kisayolTablolariHtml } from './kisayolListesi.js';

export const DURUM_ANAHTARLARI = new Set(['sonDosyalar', 'sayfaKonumlari', 'pencere', 'solPanelGenislik', 'solPanelAcik', 'solPanelSekme', 'menuCubugu']);

const VURGU_RENKLERI = [
  { ad: 'Sarı', hex: '#ffd100' }, { ad: 'Kırmızı', hex: '#ff6e6e' }, { ad: 'Turuncu', hex: '#ffb74d' },
  { ad: 'Yeşil', hex: '#7ee787' }, { ad: 'Mavi', hex: '#7cc4ff' }, { ad: 'Pembe', hex: '#ff9ad5' },
];
const YAZI_TIPLERI = MAC ? ['Arial', 'Times New Roman'] : ['Segoe UI', 'Arial', 'Times New Roman', 'Calibri'];   // notlar.js ile aynı

// Açılış ve düzen simgesi başlangıç ekranındaki PDF aç simgesiyle, Kaydetme'ninki araç çubuğundaki düğmeninkiyle aynı
const BOLUMLER = [
  { id: 'gorunum', ad: 'Görünüm', simge: 'M10 3a7 7 0 1 0 0 14V3z' },
  { id: 'acilis', ad: 'Açılış ve düzen', simge: 'M2.5 6.5V15A1.5 1.5 0 0 0 4 16.5h12a1.5 1.5 0 0 0 1.5-1.5V8.5A1.5 1.5 0 0 0 16 7h-5.8L8.5 5H4a1.5 1.5 0 0 0-1.5 1.5zM2.5 9.5h15' },
  { id: 'notlar', ad: 'Not ve vurgu', simge: 'M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4.5A1.5 1.5 0 0 1 3 12.5z' },
  { id: 'kaydetme', ad: 'Kaydetme', simge: 'M4 3h9l3 3v11H4zM7 3v4h5V3M6 17v-5h8v5' },
  { id: 'guncelleme', ad: 'Güncelleme', simge: 'M15 9A5.5 5.5 0 1 0 14 13.5M15 4v5h-5' },
  { id: 'kisayollar', ad: 'Kısayollar', simge: 'M3.5 5.5h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM5.5 8.5h1M9.5 8.5h1M13.5 8.5h1M7 11.5h6' },
  { id: 'hakkinda', ad: 'Hakkında', simge: 'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM10 9v5M10 6.5v.5' },
];
// 0.1.8'e dek 'baslangic' ve 'dosya', 0.1.11'e dek 'sayfa' (Sayfa düzeni) ve 'kopyalama' vardı
const ESKI_BOLUMLER = { baslangic: 'acilis', dosya: 'acilis', sayfa: 'acilis', kopyalama: 'gorunum' };

const GEZINME_TUSLARI = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Delete', 'Backspace', 'Enter']);

let acik = null;   // { ortu, baglam, bolum, icerik }

// ---------------------------------------------------------------- açma / kapatma
export function ayarlarPenceresiAc(baglam, secenek = {}) {
  if (!baglam || typeof baglam.ayar !== 'function' || typeof baglam.ayarKoy !== 'function') throw new Error('ayarlarPenceresiAc: baglam.ayar ve baglam.ayarKoy gerekli.');
  stilYukle();
  if (acik) {
    if (secenek.bolum) bolumSec(secenek.bolum);
    acik.ortu.querySelector('.ayarlar-bolumler button.secili')?.focus();
    if (secenek.ayar) ayaraGit(secenek.ayar);
    return acik.ortu;
  }
  const ortu = document.createElement('div');
  ortu.className = 'diyalog-ortusu ayarlar-ortusu';
  ortu.innerHTML = `
<div class="ayarlar-pencere" role="dialog" aria-label="Ayarlar">
  <div class="ayarlar-ust">
    <span class="ayarlar-baslik">Ayarlar</span>
    <button class="ikon" data-id="kapat" title="Kapat (Esc)"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.6"/></svg></button>
  </div>
  <div class="ayarlar-govde">
    <nav class="ayarlar-bolumler"></nav>
    <div class="ayarlar-icerik" tabindex="-1"></div>
  </div>
  <div class="ayarlar-alt">
    <button class="ikincil" data-id="varsayilan">Varsayılanlara dön</button>
    <span class="esnek"></span>
    <button class="birincil" data-id="kapat2">Kapat</button>
  </div>
</div>`;
  const nav = ortu.querySelector('.ayarlar-bolumler');
  for (const b of BOLUMLER) {
    const btn = document.createElement('button');
    btn.dataset.bolum = b.id;
    btn.setAttribute('aria-label', b.ad);
    btn.innerHTML = `<svg viewBox="0 0 20 20"><path d="${b.simge}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span>`;
    btn.querySelector('span').textContent = b.ad;
    btn.addEventListener('click', () => bolumSec(b.id));
    nav.append(btn);
  }
  ortu.querySelector('[data-id="kapat"]').addEventListener('click', ayarlarPenceresiKapat);
  ortu.querySelector('[data-id="kapat2"]').addEventListener('click', ayarlarPenceresiKapat);
  ortuTiklamasiBagla(ortu, ayarlarPenceresiKapat);   // pencerenin dışına tıklamak da kapatır (Esc gibi; yazılmakta olan metin kaydedilir)
  ortu.querySelector('[data-id="varsayilan"]').addEventListener('click', () => varsayilanlaraDon().catch((e) => console.error(e)));
  ortu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (e.target.tagName === 'INPUT' && e.target.type === 'text' && e.target.dataset.degisti === '1') { e.target.blur(); return; } ayarlarPenceresiKapat(); return; }
    // Gezinme tuşları uygulamanın belge kısayollarına (sayfa çevirme, not silme…) ulaşmasın
    if (GEZINME_TUSLARI.has(e.key)) e.stopPropagation();
  });
  // Bölümler arasında Ctrl+Tab gibi kısayolları uygulamaya bırakma; yalnızca ok tuşlarıyla bölüm listesinde dolaş
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = BOLUMLER.findIndex((b) => b.id === acik?.bolum);
    const y = (i + (e.key === 'ArrowDown' ? 1 : -1) + BOLUMLER.length) % BOLUMLER.length;
    bolumSec(BOLUMLER[y].id);
    nav.querySelector(`[data-bolum="${BOLUMLER[y].id}"]`)?.focus();
  });
  document.body.append(ortu);
  acik = { ortu, baglam, bolum: null, icerik: ortu.querySelector('.ayarlar-icerik') };
  bolumSec(secenek.bolum || 'gorunum');
  nav.querySelector('button.secili')?.focus();
  if (secenek.ayar) ayaraGit(secenek.ayar);
  return ortu;
}

/** Açık bölümde ayarın kartını (data-hedef) gösterir: ortaya kaydırır, kısa süre vurgular, denetimini odaklar. Kart yoksa bir şey yapmaz. */
function ayaraGit(anahtar) {
  const kartEl = acik?.icerik.querySelector(`.ayar-kart[data-hedef="${CSS.escape(anahtar)}"]`);
  if (!kartEl) return;
  kartEl.scrollIntoView({ block: 'center' });
  kartEl.classList.remove('ayar-kart-vurgu');
  void kartEl.offsetWidth;   // aynı kart art arda istenince canlandırma yeniden başlasın
  kartEl.classList.add('ayar-kart-vurgu');
  kartEl.addEventListener('animationend', () => kartEl.classList.remove('ayar-kart-vurgu'), { once: true });
  kartEl.querySelector('.ayar-kontrol select, .ayar-kontrol input, .ayar-kontrol button')?.focus({ preventScroll: true });
}

export function ayarlarPenceresiKapat() {
  if (!acik) return;
  // Bekleyen metin girdisi varsa (yazar adı) hemen yaz
  for (const g of acik.ortu.querySelectorAll('input[data-degisti="1"]')) g.dispatchEvent(new Event('change'));
  acik.ortu.remove();
  acik = null;
}

function bolumSec(id) {
  if (!acik) return;
  id = ESKI_BOLUMLER[id] || id;
  if (!BOLUMLER.some((b) => b.id === id)) id = 'gorunum';
  acik.bolum = id;
  acik.ortu.querySelectorAll('.ayarlar-bolumler button').forEach((b) => b.classList.toggle('secili', b.dataset.bolum === id));
  const icerik = acik.icerik;
  icerik.innerHTML = '';
  icerik.scrollTop = 0;
  const baslik = document.createElement('h2');
  baslik.textContent = BOLUMLER.find((b) => b.id === id).ad;
  icerik.append(baslik);
  const ciz = { gorunum: bolumGorunum, acilis: bolumAcilisVeDuzen, notlar: bolumNotlar, kaydetme: bolumKaydetme, guncelleme: bolumGuncelleme, kisayollar: bolumKisayollar, hakkinda: bolumHakkinda }[id];
  try { ciz(icerik); } catch (e) { console.error('Ayar bölümü çizilemedi', e); icerik.append(el('p', { class: 'soluk' }, 'Bu bölüm yüklenemedi: ' + hataMetni(e))); }
}

// ---------------------------------------------------------------- değer okuma / yazma
function ayarlar() { return acik?.baglam.ayar() || {}; }
function degistir(anahtar, deger) {
  if (!acik) return;
  try { acik.baglam.ayarKoy(anahtar, deger); } catch (e) { console.error('Ayar kaydedilemedi', anahtar, e); }
  try { acik.baglam.uygula?.(anahtar, deger); } catch (e) { console.error('Ayar uygulanamadı', anahtar, e); }
}

async function varsayilanlaraDon() {
  if (!acik) return;
  const { varsayilanlar } = acik.baglam;
  // Uygulama içi mesaj kutusu Ayarlar'ın üstünde açılır; dışına tıklamak ya da Esc yalnızca soruyu kapatır (Vazgeç)
  if (!varsayilanlar || typeof varsayilanlar !== 'object') { await mesajKutusu({ tur: 'warning', mesaj: 'Varsayılan değerler bulunamadı.' }); return; }
  const { secim } = await mesajKutusu({
    mesaj: 'Bütün ayarlar varsayılan değerlere döndürülsün mü?',
    ayrinti: 'Son açılan dosyalar, sayfa konumları ve pencere yerleşimi korunur.',
    dugmeler: ['Varsayılanlara dön', 'Vazgeç'], varsayilan: 1, iptal: 1,
  });
  if (secim !== 0 || !acik) return;
  for (const [anahtar, deger] of Object.entries(varsayilanlar)) {
    if (DURUM_ANAHTARLARI.has(anahtar)) continue;
    degistir(anahtar, deger == null ? deger : JSON.parse(JSON.stringify(deger)));
  }
  bolumSec(acik.bolum);
}

// ---------------------------------------------------------------- bölümler
function bolumGorunum(k) {
  const a = ayarlar();
  k.append(kart({
    baslik: 'Tema', aciklama: `Uygulama arayüzünün rengi. "Sistemi izle" ${SISTEM} ayarını kullanır.`,
    kontrol: secimKutusu(a.tema ?? 'sistem', [['acik', 'Açık'], ['koyu', 'Koyu'], ['sistem', 'Sistemi izle']], (v) => degistir('tema', v)),
  }));
  k.append(kart({
    baslik: 'Sayfayı da koyulaştır', aciklama: 'Koyu temada belge sayfaları da koyulaştırılır; görseller olduğu gibi kalır. Yazdırma ve kaydetme etkilenmez.',
    kontrol: anahtar(!!a.sayfayiKoyulastir, (v) => degistir('sayfayiKoyulastir', v)),
  }));
  k.append(kart({
    baslik: 'Yazı çizimi', aciklama: MAC
      ? 'Dengeli: yazılar keskin, kalın yazılar fazla koyulaşmadan çizilir; döndürülmüş sayfada harfler bozulmaz. macOS çizimi: bütün yazılar doğrudan macOS\'un çizimiyle; kalın yazılar daha koyu görünür. Değişiklik belgeler yeniden açılınca uygulanır.'
      : 'Dengeli: yazılar keskin, kalın yazılar fazla koyulaşmadan çizilir; döndürülmüş sayfada harfler bozulmaz. Windows ClearType: bütün yazılar doğrudan Windows\'un çizimiyle; kalın yazılar daha koyu görünür. Değişiklik belgeler yeniden açılınca uygulanır.',
    kontrol: secimKutusu(a.yaziCizimi ?? 'anaHat', [['anaHat', 'Dengeli (önerilen)'], ['sistem', MAC ? 'macOS çizimi' : 'Windows ClearType']], (v) => degistir('yaziCizimi', v)),
  }));
}

/** Birleşik düzen değeri ↔ (iki sayfa, kaydırma) çifti. Bilinmeyen değer 'surekli' sayılır. */
function duzenCoz(d) { return { iki: d === 'iki' || d === 'ikiSurekli', kaydir: d !== 'tek' && d !== 'iki' }; }
function duzenBirlestir(iki, kaydir) { return iki ? (kaydir ? 'ikiSurekli' : 'iki') : (kaydir ? 'surekli' : 'tek'); }

/** Açılış ve düzen (0.1.12'de Belge açılışı ile Sayfa düzeni birleşti): önce belgenin açılışı, sonra sayfaların dizilişi, en sonda
 *  pencere (0.2.2: kapatma düğmesinin davranışı; yeni bir bölüm açılmadı, bölüm listesi aynı kaldı). */
function bolumAcilisVeDuzen(k) {
  k.append(el('h3', {}, 'Belge açılışı'));
  acilisKartlari(k);
  k.append(el('h3', {}, 'Sayfa düzeni'));
  sayfaDuzeniKartlari(k);
  k.append(el('h3', {}, 'Pencere'));
  pencereKartlari(k);
}

// Pencereyi kapatırken (0.2.2, kullanıcı isteği: "ayarlardan değiştirilebilelim"): birden çok sekmeli pencerenin kapatma düğmesi. Sorudaki
// "Bir daha sorma" da bu ayarı yazar; ayar pencerenin dışından değişince kart ayarlarPenceresiniGuncelle ile güncellenir
const PENCERE_KAPATMA_ACIKLAMASI = MAC
  ? 'Pencerede birden çok sekme açıkken pencerenin kırmızı kapatma düğmesine basılınca ne olacağı. Her seferinde sor: geçerli sekmenin mi, bütün sekmelerin mi kapatılacağı sorulur. Kaydedilmemiş değişiklikler her durumda sorulur. ⌘W yalnızca geçerli sekmeyi kapatır, ⌘Q PDEfe\'den çıkar.'
  : 'Pencerede birden çok sekme açıkken pencerenin kapatma düğmesine (×) ya da Alt+F4\'e basılınca ne olacağı. Her seferinde sor: geçerli sekmenin mi, bütün sekmelerin mi kapatılacağı sorulur. Kaydedilmemiş değişiklikler her durumda sorulur. Ctrl+W yalnızca geçerli sekmeyi kapatır.';

function pencereKartlari(k) {
  const a = ayarlar();
  // Bilinmeyen değer (elle değiştirilmiş ayar dosyası) ilk seçenek, yani "Her seferinde sor" görünür: uygulama da onu öyle sayar
  const secim = secimKutusu(a.pencereKapatma ?? 'sor', [['sor', 'Her seferinde sor'], ['sekme', 'Yalnızca geçerli sekmeyi kapat'], ['pencere', 'Bütün sekmeleri kapat']],
    (v) => degistir('pencereKapatma', v));
  secim.dataset.ayar = 'pencereKapatma';
  k.append(kart({ baslik: 'Pencereyi kapatırken', aciklama: PENCERE_KAPATMA_ACIKLAMASI, kontrol: secim }));
}

/** Ayar Ayarlar penceresinin dışından değişti (0.2.2: pencere kapatma sorusundaki "Bir daha sorma", başka pencerenin Ayarlar'ı): açık
 *  penceredeki seçim kutusu güncel değeri göstersin (yoksa bölüm yeniden çizilene dek eskisini gösterirdi). Yalnızca data-ayar işaretli
 *  seçim kutuları; değer seçeneklerde yoksa ilk seçenek. */
export function ayarlarPenceresiniGuncelle(anahtar) {
  if (!acik) return;
  for (const s of acik.icerik.querySelectorAll('select[data-ayar]')) {
    if (s.dataset.ayar !== anahtar) continue;
    const deger = String(ayarlar()[anahtar] ?? '');
    s.value = deger;
    if (s.value !== deger && s.options.length) s.value = s.options[0].value;
  }
}

function sayfaDuzeniKartlari(k) {
  const a = ayarlar();
  // Yakınlaştırma: 'genislik' | 'sayfa' | 'gercek' | sayı (yüzde). "Son kullanılan" ('son') ve "Görünür alana sığdır" ('gorunur') 0.2.4'te
  // kalktı (kullanıcı isteği); eski değer main/ayarlar.js'te genişliğe sığdır olur
  const zoomDegeri = a.varsayilanZoom;
  const zoomSayi = typeof zoomDegeri === 'number';
  const yuzde = el('input', { type: 'number', class: 'kutu ayar-sayi', min: '10', max: '6400', step: '5', value: String(zoomSayi ? zoomDegeri : 100), title: 'Yüzde' });
  yuzde.hidden = !zoomSayi;
  const yuzdeYaz = () => { const v = Math.round(parseFloat(yuzde.value)); if (v >= 10 && v <= 6400) degistir('varsayilanZoom', v); else yuzde.value = String(typeof ayarlar().varsayilanZoom === 'number' ? ayarlar().varsayilanZoom : 100); };
  yuzde.addEventListener('change', yuzdeYaz);
  const zoomSecim = secimKutusu(zoomSayi ? 'yuzde' : (zoomDegeri || 'genislik'), [
    ['genislik', 'Genişliğe sığdır'], ['sayfa', 'Sayfayı sığdır'], ['gercek', 'Gerçek boyut'], ['yuzde', 'Yüzde'],
  ], (v) => { yuzde.hidden = v !== 'yuzde'; if (v === 'yuzde') { yuzdeYaz(); yuzde.focus(); yuzde.select(); } else degistir('varsayilanZoom', v); });
  const zoomKarti = kart({
    baslik: 'Varsayılan yakınlaştırma', aciklama: 'Tek sayfa düzeninde belge açıldığında uygulanacak yakınlaştırma. İki sayfadan tek sayfaya geçerken de kullanılır; Gerçek boyut ya da yüzde seçiliyse tek sayfa genişliğe sığdırılır. İki sayfa düzeninde her zaman Sayfayı sığdır kullanılır.',
    kontrol: el('div', { class: 'ayar-yanyana' }, [zoomSecim, yuzde]),
  });
  zoomKarti.dataset.hedef = 'varsayilanZoom';   // yakınlaştırma okunun "Varsayılanı ayarla"sı buraya gelir (ayaraGit)
  k.append(zoomKarti);
  // Sayfa düzeni: iki kontrol tek bir varsayilanDuzen değerine yazar; diğerinin güncel değeri ayarlardan okunur
  const duzen = duzenCoz(a.varsayilanDuzen ?? 'surekli');
  k.append(kart({
    baslik: 'Tek ya da iki sayfa', aciklama: 'Sayfalar tek tek ya da yan yana ikişer gösterilir. Bütün sekmelerde kullanılır; araç çubuğundaki Sayfa düzeni düğmesinden de değiştirilebilir.',
    kontrol: secimKutusu(duzen.iki ? 'iki' : 'tek', [['tek', 'Tek sayfa'], ['iki', 'İki sayfa']], (v) => degistir('varsayilanDuzen', duzenBirlestir(v === 'iki', duzenCoz(ayarlar().varsayilanDuzen ?? 'surekli').kaydir))),
  }));
  k.append(kart({
    baslik: 'Kaydırmayı etkinleştir', aciklama: 'Sayfalar alt alta kesintisiz kaydırılır; kapalıysa sayfa sayfa çevrilir. Bütün sekmelerde kullanılır; araç çubuğundan da değiştirilebilir.',
    kontrol: anahtar(duzen.kaydir, (v) => degistir('varsayilanDuzen', duzenBirlestir(duzenCoz(ayarlar().varsayilanDuzen ?? 'surekli').iki, v))),
  }));
  k.append(kart({
    baslik: 'Kapak sayfasını ayrı göster', aciklama: 'İki sayfa düzeninde ilk sayfa tek başına durur, sonraki sayfalar basılı kitaptaki gibi ikişer yan yana gelir. Araç çubuğundan da değiştirilebilir.',
    kontrol: anahtar(!!a.kapakAyri, (v) => degistir('kapakAyri', v)),
  }));
  // "Döndür düğmesi" (Her seferinde sor / Geçerli sayfa / Tüm PDF) 0.1.27'de kaldırıldı: düğme yalnızca geçerli sayfayı döndürür
}

const VARSAYILAN_ACIKLAMA = MAC
  // macOS (0.2.0): varsayılan uygulama Finder'dan seçilir; uygulama bunu okuyamaz, düğme yok (main.js kabuk:varsayilanMi)
  ? 'PDF dosyalarına çift tıklayınca PDEfe\'de açılsın: Finder\'da bir PDF\'e sağ tıklayıp Bilgi Al\'ı seçin, "Birlikte aç" listesinden PDEfe\'yi seçin ve "Tümünü Değiştir"e basın.'
  : 'PDF dosyalarına çift tıklayınca PDEfe\'de açılsın. Windows "Varsayılan Uygulamalar" sayfası açılır; .pdf satırında PDEfe\'yi seçin. Kurulumsuz (geliştirme) çalıştırmada PDEfe listede görünmeyebilir.';
const TIK_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="m6.3 10.2 2.5 2.5 5-5.2"/></svg>';

function acilisKartlari(k) {
  const a = ayarlar();
  const { pdefe } = acik.baglam;
  // Varsayılan PDF görüntüleyici: PDEfe zaten varsayılansa düğme yerine yeşil tik ve "Zaten varsayılan" (0.1.12, kullanıcı isteği).
  // Windows'un kaydı ana süreçte okunur (kabuk:varsayilanMi); okunamazsa düğme görünür. Windows Ayarlar'dan PDEfe'ye dönülünce
  // (pencere odağı) yeniden bakılır: orada yapılan seçim bölüm açıkken de görünsün
  const varsayilanDugme = el('button', { class: 'ikincil', type: 'button' }, 'Varsayılan PDF görüntüleyici yap');
  varsayilanDugme.hidden = true;
  varsayilanDugme.addEventListener('click', () => pdefe.cagir('kabuk:varsayilanUygulamalar').catch((e) => console.error(e)));
  const zaten = el('span', { class: 'ayar-zaten-varsayilan', role: 'status' });
  zaten.innerHTML = TIK_SVG;
  zaten.append(el('span', {}, 'Zaten varsayılan'));
  zaten.hidden = true;
  const varsayilanKart = kart({
    baslik: 'Varsayılan PDF görüntüleyici', aciklama: VARSAYILAN_ACIKLAMA,
    kontrol: el('div', { class: 'ayar-yanyana' }, [zaten, varsayilanDugme]),
  });
  const aciklamaEl = varsayilanKart.querySelector('.ayar-aciklama');
  let soruluyor = false;
  const varsayilanYenile = async () => {
    if (!varsayilanKart.isConnected) { window.removeEventListener('focus', varsayilanYenile); return; }
    if (soruluyor) return;
    soruluyor = true;
    let r = null;
    try { r = await pdefe.cagir('kabuk:varsayilanMi'); } catch (e) { console.warn('Varsayılan uygulama okunamadı', e); } finally { soruluyor = false; }
    if (!varsayilanKart.isConnected) return;
    const evet = r?.varsayilan === true;
    zaten.hidden = !evet;
    varsayilanDugme.hidden = evet || MAC;
    aciklamaEl.textContent = evet ? 'PDF dosyalarına çift tıklayınca PDEfe\'de açılıyor. Başka bir uygulama seçilirse burada yeniden varsayılan yapılabilir.' : VARSAYILAN_ACIKLAMA;
  };
  k.append(varsayilanKart);   // önce eklenir: varsayilanYenile sayfada olmayan kartı kapanmış bölüm sayıp dinlemeyi bırakır
  window.addEventListener('focus', varsayilanYenile);
  varsayilanYenile();
  // Hatırlanan sayfalar: altında temizleme düğmesi (0.1.23, güvenlik denetimi: kayıt dosya yollarını tutar, yol adında kişi adı olabilir);
  // kayıt boşken devre dışı. Kapatmak da kaydı siler
  const konumTemizle = el('button', { class: 'ikincil', type: 'button' }, 'Hatırlanan sayfaları temizle');
  const konumYenile = () => { konumTemizle.disabled = !Object.keys(ayarlar().sayfaKonumlari || {}).length; };
  konumTemizle.addEventListener('click', () => { degistir('sayfaKonumlari', {}); konumYenile(); });
  konumYenile();
  k.append(kart({
    baslik: 'Her belgeyi kaldığım sayfadan aç', aciklama: 'Her belgede son bakılan sayfa, dosya yoluyla birlikte hatırlanır. Kapatılınca hatırlanan sayfalar silinir, yenileri tutulmaz.',
    kontrol: anahtar(a.kaldigimSayfadanAc !== false, (v) => { degistir('kaldigimSayfadanAc', v); konumYenile(); }),
    alt: konumTemizle,
  }));
  // Son açılanlar: altında listeyi temizleme düğmesi (0.1.12, kullanıcı isteği); liste boşken devre dışı. Kapatmak da listeyi siler
  const temizle = el('button', { class: 'ikincil', type: 'button' }, 'Listeyi temizle');
  const temizleYenile = () => { temizle.disabled = !(ayarlar().sonDosyalar || []).length; };
  temizle.addEventListener('click', () => {
    const b = acik?.baglam;
    if (!b) return;
    if (typeof b.sonTemizle === 'function') b.sonTemizle();
    else degistir('sonDosyalar', []);
    temizleYenile();
  });
  temizleYenile();
  k.append(kart({
    baslik: 'Son açılanları hatırla', aciklama: 'Açtığınız belgeler başlangıç ekranında ve Dosya › Son açılanlar menüsünde listelenir. Kapatılınca liste silinir, yeni açılan belgeler eklenmez.',
    kontrol: anahtar(a.sonAcilanlariHatirla !== false, (v) => { degistir('sonAcilanlariHatirla', v); temizleYenile(); }),
    alt: temizle,
  }));
}

function bolumNotlar(k) {
  const a = ayarlar();
  k.append(kart({
    baslik: 'Yazar adı', aciklama: 'Yeni notlara yazılır.',
    kontrol: metinKutusu(a.yazarAdi ?? '', (v) => degistir('yazarAdi', v.trim() || (acik?.baglam.varsayilanlar?.yazarAdi ?? 'Kullanıcı')), { genislik: 220, yerTutucu: 'Ad Soyad' }),
  }));
  // Vurgu rengi
  const renkler = el('div', { class: 'ayar-renkler', role: 'radiogroup', 'aria-label': 'Vurgu rengi' });
  const renkYenile = () => { const s = ayarlar().vurguRengi; renkler.querySelectorAll('button').forEach((b) => { b.classList.toggle('secili', b.dataset.renk === s); b.setAttribute('aria-checked', b.dataset.renk === s ? 'true' : 'false'); }); };
  for (const r of VURGU_RENKLERI) {
    const b = el('button', { class: 'ayar-renk', type: 'button', role: 'radio', title: r.ad, 'data-renk': r.hex, style: `--r:${r.hex}` });
    b.addEventListener('click', () => { degistir('vurguRengi', r.hex); renkYenile(); });
    renkler.append(b);
  }
  renkYenile();
  k.append(kart({ baslik: 'Varsayılan vurgu rengi', kontrol: renkler }));
  // Opaklık
  const opaklik = Math.min(1, Math.max(0.1, Number(a.vurguOpaklik ?? 0.4)));
  const opaklikEtiket = el('span', { class: 'ayar-deger' }, `%${Math.round(opaklik * 100)}`);
  const opaklikSurgu = el('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: String(opaklik), class: 'ayar-surgu' });
  opaklikSurgu.addEventListener('input', () => { opaklikEtiket.textContent = `%${Math.round(parseFloat(opaklikSurgu.value) * 100)}`; });
  opaklikSurgu.addEventListener('change', () => degistir('vurguOpaklik', Math.round(parseFloat(opaklikSurgu.value) * 100) / 100));
  k.append(kart({ baslik: 'Vurgu opaklığı', aciklama: 'Yeni vurguların saydamlığı (0,1–1).', kontrol: el('div', { class: 'ayar-yanyana' }, [opaklikSurgu, opaklikEtiket]) }));

  k.append(el('h3', {}, 'Yazı aracı'));
  k.append(kart({
    baslik: 'Yazı tipi', aciklama: 'Belgeye gömülür; Türkçe karakterler korunur.',
    kontrol: secimKutusu(YAZI_TIPLERI.includes(a.yaziTipi) ? a.yaziTipi : YAZI_TIPLERI[0], YAZI_TIPLERI.map((t) => [t, t]), (v) => degistir('yaziTipi', v)),
  }));
  const boyut = el('input', { type: 'number', class: 'kutu ayar-sayi', min: '6', max: '72', step: '1', value: String(a.yaziBoyutu ?? 12) });
  boyut.addEventListener('change', () => { const v = Math.round(parseFloat(boyut.value)); if (v >= 6 && v <= 72) degistir('yaziBoyutu', v); else boyut.value = String(ayarlar().yaziBoyutu ?? 12); });
  k.append(kart({ baslik: 'Yazı boyutu', aciklama: 'Punto (6–72).', kontrol: boyut }));
  k.append(kart({ baslik: 'Yazı rengi', kontrol: renkKutusu(a.yaziRengi || '#000000', (v) => degistir('yaziRengi', v)) }));
  // Arka plan: null = dolgusuz
  const arkaRenk = renkKutusu(a.yaziArka || '#ffffff', (v) => degistir('yaziArka', v));
  const dolgusuz = el('label', { class: 'ayar-onay' }, [el('input', { type: 'checkbox' }), el('span', {}, 'Dolgusuz')]);
  const dolgusuzKutu = dolgusuz.querySelector('input');
  dolgusuzKutu.checked = !a.yaziArka;
  arkaRenk.disabled = dolgusuzKutu.checked;
  dolgusuzKutu.addEventListener('change', () => { arkaRenk.disabled = dolgusuzKutu.checked; degistir('yaziArka', dolgusuzKutu.checked ? null : arkaRenk.value); });
  k.append(kart({ baslik: 'Yazı arka planı', kontrol: el('div', { class: 'ayar-yanyana' }, [dolgusuz, arkaRenk]) }));
}

function bolumKaydetme(k) {
  const a = ayarlar();
  k.append(kart({
    baslik: 'Otomatik kaydet', aciklama: 'Notlar ve döndürme kısa bir gecikmeyle dosyaya yazılır; dosya başka bir programda (UYAP ya da başka bir PDF okuyucu) açıldığında değişiklikler görünür. Geri al yine çalışır.',
    kontrol: anahtar(!!a.otomatikKaydet, (v) => degistir('otomatikKaydet', v)),
  }));
  const yolEl = el('div', { class: 'ayar-yol' }, a.ciktiKlasoru || 'Masaüstü');
  yolEl.classList.toggle('soluk', !a.ciktiKlasoru);
  const sec = el('button', { class: 'ikincil', type: 'button' }, 'Seç');
  const temizle = el('button', { class: 'ikincil', type: 'button' }, 'Temizle');
  temizle.disabled = !a.ciktiKlasoru;
  sec.addEventListener('click', async () => {
    const yol = await acik.baglam.pdefe.cagir('dosya:klasorSec', { baslik: 'Çıktı klasörü seç', varsayilan: ayarlar().ciktiKlasoru || undefined });
    if (!yol || !acik) return;
    degistir('ciktiKlasoru', yol); yolEl.textContent = yol; yolEl.classList.remove('soluk'); temizle.disabled = false;
  });
  temizle.addEventListener('click', () => { degistir('ciktiKlasoru', ''); yolEl.textContent = 'Masaüstü'; yolEl.classList.add('soluk'); temizle.disabled = true; });
  k.append(kart({
    baslik: 'Araçların çıktı klasörü', aciklama: 'Araçların (Sıkıştır, Sayfaları düzenle, Döndür, Ayır, Görüntü / PDF birleştir) yeni belge olarak kaydettiği dosyalar için önerilen klasör; araç penceresinde değiştirilebilir. Boşsa Masaüstü kullanılır.',
    kontrol: el('div', { class: 'ayar-yanyana' }, [sec, temizle]), alt: yolEl,
  }));
}

function bolumGuncelleme(k) {
  const a = ayarlar();
  const sonDenetim = el('div', { class: 'soluk' }, '');
  k.append(kart({
    baslik: 'Güncellemeleri otomatik denetle (haftada bir)',
    // macOS (0.2.1): yeni sürüm tek tıkla kurulmaz; şeritteki İndir paketi tarayıcıda indirir, kurulum kullanıcıda (renderer/guncelleme.js)
    aciklama: 'Haftada bir, açılışta ya da PDEfe açık kalıyorsa gün içinde arka planda yeni sürüme bakılır; internet yoksa sonra yeniden denenir. ' + (MAC
      ? 'Yeni sürüm varsa pencerenin üstünde bir şerit görünür; İndir\'e basınca yeni sürüm tarayıcıda iner, PDEfe\'den çıkıp inen dosyadaki PDEfe\'yi Uygulamalar klasörüne sürükleyerek kurarsınız.'
      : 'Yeni sürüm varsa pencerenin üstünde bir şerit görünür; Güncelle\'ye tek tıkla indirilir, kurulur ve PDEfe yeniden açılır.'),
    kontrol: anahtar(a.otoGuncelle !== false, (v) => degistir('otoGuncelle', v)),
    alt: sonDenetim,
  }));
  const sonDenetimYaz = () => {
    const pdefe = acik?.baglam.pdefe;
    if (!pdefe) return;
    pdefe.cagir('guncelleme:durum').then((d) => {
      const t = Number(d?.sonDenetim) || 0;
      sonDenetim.textContent = t ? `Son denetim: ${new Date(t).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })}` : 'Henüz denetlenmedi.';
    }).catch(() => {});
  };
  sonDenetimYaz();
  const sonuc = el('div', { class: 'ayar-sonuc soluk' }, '');
  const dugme = el('button', { class: 'ikincil', type: 'button' }, 'Şimdi denetle');
  dugme.addEventListener('click', async () => {
    const { pdefe, guncelleme } = acik.baglam;
    dugme.disabled = true; sonuc.className = 'ayar-sonuc soluk'; sonuc.replaceChildren('Denetleniyor');
    try {
      // Güncelleme şeridi kuruluysa onun üzerinden: yeni sürüm varsa şerit de görünür (menüdeki denetimle aynı)
      const r = guncelleme ? await guncelleme.denetle({ bildirim: false }) : await pdefe.cagir('guncelleme:denetle');
      if (!r || typeof r !== 'object') throw new Error('Beklenmeyen yanıt');
      if (r.durum === 'var') {
        // Şeritle aynı aşama: indirme sürüyorsa (ya da kurulum başlıyorsa) düğme yok; indirilmiş paket varsa "Kur ve yeniden başlat"
        const serit = guncelleme?.durum?.().asama;
        const asama = ['indiriliyor', 'onay', 'kuruluyor'].includes(serit) ? 'indiriliyor' : (r.asama || 'var');
        sonuc.className = 'ayar-sonuc ayar-sonuc-var';
        const metin = asama === 'var' || !r.mesaj ? `PDEfe ${r.surum || ''} hazır${r.mevcut ? ` (kullandığınız: ${r.mevcut})` : ''}.` : r.mesaj;
        sonuc.replaceChildren(el('span', {}, metin + ' '));
        if (guncelleme && asama !== 'indiriliyor') {
          // macOS'ta şeritteki gibi 'İndir' (paket tarayıcıda iner; 'hazir' aşaması Mac'te oluşmaz)
          const g = el('button', { class: 'ikincil', type: 'button' }, asama === 'hazir' ? 'Kur ve yeniden başlat' : MAC ? 'İndir' : 'Güncelle');
          g.addEventListener('click', () => { ayarlarPenceresiKapat(); guncelleme.guncelle(); });
          sonuc.append(g);
        }
      } else if (r.durum === 'yok') { sonuc.className = 'ayar-sonuc soluk'; sonuc.replaceChildren(r.mesaj || `PDEfe güncel${r.surum ? ` (${r.surum})` : ''}.`); }
      else { sonuc.className = 'ayar-sonuc ayar-sonuc-hata'; sonuc.replaceChildren('Denetlenemedi. ' + (r.mesaj || 'Beklenmeyen bir hata oluştu; biraz sonra yeniden deneyin.')); }
      sonDenetimYaz();
    } catch (e) {
      console.error('Güncelleme denetimi', e);
      sonuc.className = 'ayar-sonuc ayar-sonuc-hata';
      sonuc.replaceChildren(/No handler registered/i.test(hataMetni(e)) ? 'Güncelleme denetimi bu sürümde kullanılamıyor.' : 'Denetlenemedi. Beklenmeyen bir hata oluştu; biraz sonra yeniden deneyin.');
    } finally { dugme.disabled = false; }
  });
  k.append(kart({ baslik: 'Şimdi denetle', aciklama: 'GitHub\'daki PDEfe sürümlerine hemen bakılır.', kontrol: dugme }));
  k.append(sonuc);
}

/** Kısayollar (0.2.4, kullanıcı isteği): F1'deki listenin aynısı (kisayolListesi.js); ayar değil, yalnızca gösterir. */
function bolumKisayollar(k) {
  const kap = el('div', { class: 'ayar-kisayollar' });
  kap.innerHTML = kisayolTablolariHtml();   // sabit metin
  k.append(kap);
}

function bolumHakkinda(k) {
  const { pdefe } = acik.baglam;
  const surumEl = el('span', {}, '…');
  // Tarayıcıda açılması uygulama.js'teki genel bağlantı dinleyicisinde (burada da açılınca profil iki sekmede açılıyordu)
  const gelistirici = el('a', { href: 'https://x.com/CgrShn' }, 'x.com/CgrShn');
  k.append(el('div', { class: 'ayar-hakkinda' }, [
    el('div', { class: 'ayar-hakkinda-satir' }, ['Sürüm ', surumEl]),
    el('div', { class: 'ayar-hakkinda-satir' }, ['Geri bildirimler için: ', gelistirici]),   // 0.2.4'e dek "Geliştirici:" (kullanıcı isteği)
  ]));
  pdefe.cagir('uygulama:bilgi')
    .then((b) => { surumEl.textContent = b?.surum || '?'; })
    .catch((e) => { console.warn(e); surumEl.textContent = '?'; });
}

// ---------------------------------------------------------------- kontrol yapıcılar
/** Ayar kartı: solda başlık + açıklama, sağda kontrol; isteğe bağlı alt satır. */
function kart({ baslik, aciklama, kontrol, alt }) {
  const k = el('div', { class: 'ayar-kart' });
  const ust = el('div', { class: 'ayar-kart-ust' });
  const etiket = el('div', { class: 'ayar-etiket' }, [el('div', { class: 'ayar-baslik' }, baslik)]);
  if (aciklama) etiket.append(el('div', { class: 'ayar-aciklama' }, aciklama));
  ust.append(etiket);
  if (kontrol) ust.append(el('div', { class: 'ayar-kontrol' }, [kontrol]));
  k.append(ust);
  if (alt) k.append(el('div', { class: 'ayar-kart-alt' }, [alt]));
  return k;
}

/** Windows 11 tarzı açma/kapama anahtarı. */
function anahtar(deger, onDegis) {
  const lbl = el('label', { class: 'ayar-anahtar' });
  const g = el('input', { type: 'checkbox', role: 'switch' });
  g.checked = !!deger;
  const durum = el('span', { class: 'ayar-anahtar-durum' }, g.checked ? 'Açık' : 'Kapalı');
  g.addEventListener('change', () => { durum.textContent = g.checked ? 'Açık' : 'Kapalı'; onDegis(g.checked); });
  lbl.append(durum, g, el('span', { class: 'ayar-anahtar-govde' }));
  return lbl;
}

function secimKutusu(deger, secenekler, onDegis) {
  const s = el('select', { class: 'ayar-secim' });
  for (const [v, ad] of secenekler) s.append(el('option', { value: v }, ad));
  s.value = String(deger);
  if (s.value !== String(deger) && secenekler.length) s.value = secenekler[0][0];
  s.addEventListener('change', () => onDegis(s.value));
  return s;
}

/** Metin kutusu: Enter ya da odak kaybında yazar; yazarken data-degisti işareti. */
function metinKutusu(deger, onDegis, { genislik = 200, yerTutucu = '' } = {}) {
  const g = el('input', { type: 'text', class: 'kutu ayar-metin', value: deger, placeholder: yerTutucu, spellcheck: 'false', style: `width:${genislik}px` });
  let son = deger;
  g.addEventListener('input', () => { g.dataset.degisti = g.value !== son ? '1' : ''; });
  g.addEventListener('change', () => { if (g.value === son) { g.dataset.degisti = ''; return; } son = g.value; g.dataset.degisti = ''; onDegis(g.value); });
  g.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); g.blur(); } });
  return g;
}

function renkKutusu(deger, onDegis) {
  const g = el('input', { type: 'color', class: 'ayar-renk-girdi', value: /^#[0-9a-f]{6}$/i.test(deger) ? deger : '#000000' });
  g.addEventListener('change', () => onDegis(g.value));
  return g;
}

// ---------------------------------------------------------------- yardımcılar
function el(etiket, ozellikler = {}, cocuklar = null) {
  const e = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellikler)) {
    if (v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'value' && (etiket === 'input' || etiket === 'select' || etiket === 'option')) e.value = v;
    else e.setAttribute(k, v);
  }
  if (cocuklar != null) {
    for (const c of Array.isArray(cocuklar) ? cocuklar : [cocuklar]) {
      if (c == null) continue;
      e.append(typeof c === 'string' ? document.createTextNode(c) : c);
    }
  }
  return e;
}

/** ayarlar.css'i bir kez sayfaya ekler (index.html'e ayrıca bağlanmasına gerek yok). */
function stilYukle() {
  if (document.getElementById('pdefe-ayarlar-stil')) return;
  const link = document.createElement('link');
  link.id = 'pdefe-ayarlar-stil';
  link.rel = 'stylesheet';
  link.href = new URL('./ayarlar.css', import.meta.url).href;
  document.head.append(link);
}

function hataMetni(e) { return (e && (e.message || String(e))) || 'Bilinmeyen hata'; }
