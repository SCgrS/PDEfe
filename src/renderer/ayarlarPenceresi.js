// Ayarlar penceresi: solda bölüm listesi, sağda içerik (Windows 11 Ayarlar havası).
// Her değişiklik anında kaydedilir (baglam.ayarKoy) ve canlı uygulanır (baglam.uygula).
// Sayfa düzeni iki kontrolle (Tek/İki sayfa + Kaydırma) tek bir varsayilanDuzen değerine yazılır:
// 'tek' | 'surekli' | 'iki' | 'ikiSurekli'. Hakkında bölümü yalnızca sürümü ve geliştiriciyi gösterir.
//
// Dışa verilen API:
//   ayarlarPenceresiAc(baglam, secenek?)  → pencere kök öğesi (HTMLElement); zaten açıksa öne getirir.
//     baglam = { ayar: () => ayarlar, ayarKoy(anahtar, deger), uygula(anahtar, deger), pdefe, varsayilanlar, guncelleme? }
//     (guncelleme: renderer/guncelleme.js şerit API'si; Güncelleme bölümündeki denetim ve Güncelle düğmesi onu kullanır)
//     secenek = { bolum?: 'gorunum'|'baslangic'|'notlar'|'kopyalama'|'guncelleme'|'dosya'|'hakkinda' }
//   ayarlarPenceresiKapat()               → açık pencereyi kapatır.
//   DURUM_ANAHTARLARI                     → "Varsayılanlara dön" ile sıfırlanmayan durum alanları.

export const DURUM_ANAHTARLARI = new Set(['sonDosyalar', 'sayfaKonumlari', 'pencere', 'solPanelGenislik', 'solPanelAcik', 'solPanelSekme', 'sonZoom']);

const VURGU_RENKLERI = [
  { ad: 'Sarı', hex: '#ffd100' }, { ad: 'Kırmızı', hex: '#ff6e6e' }, { ad: 'Turuncu', hex: '#ffb74d' },
  { ad: 'Yeşil', hex: '#7ee787' }, { ad: 'Mavi', hex: '#7cc4ff' }, { ad: 'Pembe', hex: '#ff9ad5' },
];
const YAZI_TIPLERI = ['Segoe UI', 'Arial', 'Times New Roman', 'Calibri'];

const BOLUMLER = [
  { id: 'gorunum', ad: 'Görünüm', simge: 'M10 3a7 7 0 1 0 0 14V3z' },
  { id: 'baslangic', ad: 'Başlangıç', simge: 'M4 10h12M11 5l5 5-5 5' },
  { id: 'notlar', ad: 'Notlar', simge: 'M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4.5A1.5 1.5 0 0 1 3 12.5z' },
  { id: 'kopyalama', ad: 'Kopyalama', simge: 'M7 7h9v10H7zM13 7V4H4v9h3' },
  { id: 'guncelleme', ad: 'Güncelleme', simge: 'M15 9A5.5 5.5 0 1 0 14 13.5M15 4v5h-5' },
  { id: 'dosya', ad: 'Dosya', simge: 'M4 3h9l3 3v11H4zM13 3v3h3' },
  { id: 'hakkinda', ad: 'Hakkında', simge: 'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM10 9v5M10 6.5v.5' },
];

const GEZINME_TUSLARI = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Delete', 'Backspace', 'Enter']);

let acik = null;   // { ortu, baglam, bolum, icerik }

// ---------------------------------------------------------------- açma / kapatma
export function ayarlarPenceresiAc(baglam, secenek = {}) {
  if (!baglam || typeof baglam.ayar !== 'function' || typeof baglam.ayarKoy !== 'function') throw new Error('ayarlarPenceresiAc: baglam.ayar ve baglam.ayarKoy gerekli.');
  stilYukle();
  if (acik) {
    if (secenek.bolum) bolumSec(secenek.bolum);
    acik.ortu.querySelector('.ayarlar-bolumler button.secili')?.focus();
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
  return ortu;
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
  if (!BOLUMLER.some((b) => b.id === id)) id = 'gorunum';
  acik.bolum = id;
  acik.ortu.querySelectorAll('.ayarlar-bolumler button').forEach((b) => b.classList.toggle('secili', b.dataset.bolum === id));
  const icerik = acik.icerik;
  icerik.innerHTML = '';
  icerik.scrollTop = 0;
  const baslik = document.createElement('h2');
  baslik.textContent = BOLUMLER.find((b) => b.id === id).ad;
  icerik.append(baslik);
  const ciz = { gorunum: bolumGorunum, baslangic: bolumBaslangic, notlar: bolumNotlar, kopyalama: bolumKopyalama, guncelleme: bolumGuncelleme, dosya: bolumDosya, hakkinda: bolumHakkinda }[id];
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
  const { pdefe, varsayilanlar } = acik.baglam;
  if (!varsayilanlar || typeof varsayilanlar !== 'object') { await pdefe.cagir('mesaj:kutu', { tur: 'warning', mesaj: 'Varsayılan değerler bulunamadı.' }); return; }
  const { secim } = await pdefe.cagir('mesaj:kutu', {
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
    baslik: 'Tema', aciklama: 'Uygulama arayüzünün rengi. "Sistemi izle" Windows ayarını kullanır.',
    kontrol: secimKutusu(a.tema ?? 'sistem', [['acik', 'Açık'], ['koyu', 'Koyu'], ['sistem', 'Sistemi izle']], (v) => degistir('tema', v)),
  }));
  k.append(kart({
    baslik: 'Sayfayı da koyulaştır', aciklama: 'Koyu temada belge sayfaları da koyulaştırılır; görseller olduğu gibi kalır. Yazdırma ve kaydetme etkilenmez.',
    kontrol: anahtar(!!a.sayfayiKoyulastir, (v) => degistir('sayfayiKoyulastir', v)),
  }));
  k.append(kart({
    baslik: 'Döndür düğmesi', aciklama: 'Araç çubuğundaki Döndür düğmesinin neyi döndüreceği. Döndürürken "Seçeneğimi hatırla" ile kaydedilen tercih burada değiştirilir.',
    kontrol: secimKutusu(a.dondurmeKapsami ?? 'sor', [['sor', 'Her seferinde sor'], ['sayfa', 'Geçerli sayfa'], ['tum', 'Tüm PDF']], (v) => degistir('dondurmeKapsami', v)),
  }));
}

/** Birleşik düzen değeri ↔ (iki sayfa, kaydırma) çifti. Bilinmeyen değer 'surekli' sayılır. */
function duzenCoz(d) { return { iki: d === 'iki' || d === 'ikiSurekli', kaydir: d !== 'tek' && d !== 'iki' }; }
function duzenBirlestir(iki, kaydir) { return iki ? (kaydir ? 'ikiSurekli' : 'iki') : (kaydir ? 'surekli' : 'tek'); }

function bolumBaslangic(k) {
  const a = ayarlar();
  // Yakınlaştırma: 'son' | 'genislik' | 'sayfa' | 'gercek' | 'gorunur' | sayı (yüzde)
  const zoomDegeri = a.varsayilanZoom;
  const zoomSayi = typeof zoomDegeri === 'number';
  const yuzde = el('input', { type: 'number', class: 'kutu ayar-sayi', min: '10', max: '6400', step: '5', value: String(zoomSayi ? zoomDegeri : (a.sonZoom || 100)), title: 'Yüzde' });
  yuzde.hidden = !zoomSayi;
  const yuzdeYaz = () => { const v = Math.round(parseFloat(yuzde.value)); if (v >= 10 && v <= 6400) degistir('varsayilanZoom', v); else yuzde.value = String(typeof ayarlar().varsayilanZoom === 'number' ? ayarlar().varsayilanZoom : 100); };
  yuzde.addEventListener('change', yuzdeYaz);
  const zoomSecim = secimKutusu(zoomSayi ? 'yuzde' : (zoomDegeri || 'genislik'), [
    ['son', 'Son kullanılan'], ['genislik', 'Genişliğe sığdır'], ['sayfa', 'Sayfayı sığdır'], ['gercek', 'Gerçek boyut'], ['gorunur', 'Görünür alana sığdır'], ['yuzde', 'Yüzde'],
  ], (v) => { yuzde.hidden = v !== 'yuzde'; if (v === 'yuzde') { yuzdeYaz(); yuzde.focus(); yuzde.select(); } else degistir('varsayilanZoom', v); });
  k.append(kart({
    baslik: 'Varsayılan yakınlaştırma', aciklama: 'Tek sayfa düzeninde belge açıldığında uygulanacak yakınlaştırma. İki sayfadan tek sayfaya geçerken de kullanılır; Son kullanılan, Gerçek boyut ya da yüzde seçiliyse tek sayfa genişliğe sığdırılır. İki sayfa düzeninde her zaman Sayfayı sığdır kullanılır.',
    kontrol: el('div', { class: 'ayar-yanyana' }, [zoomSecim, yuzde]),
  }));
  // Sayfa düzeni: iki kontrol tek bir varsayilanDuzen değerine yazar; diğerinin güncel değeri ayarlardan okunur
  const duzen = duzenCoz(a.varsayilanDuzen ?? 'surekli');
  k.append(kart({
    baslik: 'Sayfa düzeni', aciklama: 'Bütün sekmelerde kullanılır; araç çubuğundan da değiştirilebilir.',
    kontrol: secimKutusu(duzen.iki ? 'iki' : 'tek', [['tek', 'Tek sayfa'], ['iki', 'İki sayfa']], (v) => degistir('varsayilanDuzen', duzenBirlestir(v === 'iki', duzenCoz(ayarlar().varsayilanDuzen ?? 'surekli').kaydir))),
  }));
  k.append(kart({
    baslik: 'Kaydırmayı etkinleştir', aciklama: 'Sayfalar alt alta kesintisiz kaydırılır; kapalıysa sayfa sayfa çevrilir. Bütün sekmelerde kullanılır; araç çubuğundan da değiştirilebilir.',
    kontrol: anahtar(duzen.kaydir, (v) => degistir('varsayilanDuzen', duzenBirlestir(duzenCoz(ayarlar().varsayilanDuzen ?? 'surekli').iki, v))),
  }));
  k.append(kart({
    baslik: 'Her belgeyi kaldığım sayfadan aç', aciklama: 'Son bakılan sayfa dosya yoluna göre hatırlanır.',
    kontrol: anahtar(a.kaldigimSayfadanAc !== false, (v) => degistir('kaldigimSayfadanAc', v)),
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

  k.append(el('h3', {}, 'Yazı (FreeText) varsayılanları'));
  k.append(kart({
    baslik: 'Yazı tipi', aciklama: 'Belgeye gömülür; Türkçe karakterler korunur.',
    kontrol: secimKutusu(YAZI_TIPLERI.includes(a.yaziTipi) ? a.yaziTipi : 'Segoe UI', YAZI_TIPLERI.map((t) => [t, t]), (v) => degistir('yaziTipi', v)),
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

  k.append(el('h3', {}, 'Kaydetme'));
  k.append(kart({
    baslik: 'Otomatik kaydet', aciklama: 'Not değişiklikleri kısa bir gecikmeyle dosyaya yazılır. Geri al yine çalışır.',
    kontrol: anahtar(!!a.otomatikKaydet, (v) => degistir('otomatikKaydet', v)),
  }));
}

function bolumKopyalama(k) {
  const a = ayarlar();
  const temiz = a.temizMetin !== false;
  k.append(radyoKartlari('temizMetin', temiz ? 'temiz' : 'ham', [
    { id: 'temiz', baslik: 'Temiz metin (varsayılan)', aciklama: 'Satır sonları paragrafa göre birleştirilir, tireyle bölünmüş sözcükler onarılır, girintiler ve bozuk Türkçe karakterler (Ġ→İ gibi) düzeltilir. Word ya da UYAP\'a yapıştırmak için uygundur.' },
    { id: 'ham', baslik: 'Düzeni koru (ham)', aciklama: 'Metin PDF\'teki satır yapısıyla, olduğu gibi kopyalanır. Tablo ya da liste düzenini korumak istediğinizde kullanın.' },
  ], (v) => degistir('temizMetin', v === 'temiz')));
}

function bolumGuncelleme(k) {
  const a = ayarlar();
  k.append(kart({
    baslik: 'Açılışta güncellemeleri denetle (10 açılışta bir)',
    aciklama: 'Kurulumdan ya da güncellemeden sonraki ilk açılışta, sonra her 10 açılışta bir arka planda yeni sürüme bakılır. Yeni sürüm varsa pencerenin üstünde bir şerit görünür; Güncelle\'ye tek tıkla indirilir, kurulur ve PDEfe yeniden açılır.',
    kontrol: anahtar(a.otoGuncelle !== false, (v) => degistir('otoGuncelle', v)),
  }));
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
        sonuc.className = 'ayar-sonuc ayar-sonuc-var';
        sonuc.replaceChildren(el('span', {}, `PDEfe ${r.surum || ''} hazır${r.mevcut ? ` (kullandığınız: ${r.mevcut})` : ''}. `));
        if (guncelleme) {
          const g = el('button', { class: 'ikincil', type: 'button' }, 'Güncelle');
          g.addEventListener('click', () => { ayarlarPenceresiKapat(); guncelleme.guncelle(); });
          sonuc.append(g);
        }
      } else if (r.durum === 'yok') { sonuc.className = 'ayar-sonuc soluk'; sonuc.replaceChildren(r.mesaj || `PDEfe güncel${r.surum ? ` (${r.surum})` : ''}.`); }
      else { sonuc.className = 'ayar-sonuc ayar-sonuc-hata'; sonuc.replaceChildren('Denetlenemedi: ' + (r.mesaj || 'bilinmeyen hata')); }
    } catch (e) {
      sonuc.className = 'ayar-sonuc ayar-sonuc-hata';
      sonuc.replaceChildren(/No handler registered/i.test(hataMetni(e)) ? 'Güncelleme denetimi bu sürümde kullanılamıyor.' : 'Denetlenemedi: ' + hataMetni(e));
    } finally { dugme.disabled = false; }
  });
  k.append(kart({ baslik: 'Şimdi denetle', aciklama: 'GitHub\'daki PDEfe sürümlerine hemen bakılır.', kontrol: dugme }));
  k.append(sonuc);
}

function bolumDosya(k) {
  const a = ayarlar();
  const varsayilanDugme = el('button', { class: 'ikincil', type: 'button' }, 'Varsayılan PDF görüntüleyici yap');
  varsayilanDugme.addEventListener('click', () => acik.baglam.pdefe.cagir('kabuk:varsayilanUygulamalar').catch((e) => console.error(e)));
  k.append(kart({
    baslik: 'Varsayılan PDF görüntüleyici', aciklama: 'Windows "Varsayılan Uygulamalar" sayfası açılır; .pdf satırında PDEfe\'yi seçin. Kurulumsuz (geliştirme) çalıştırmada PDEfe listede görünmeyebilir.',
    kontrol: varsayilanDugme,
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
    baslik: 'Çıktı klasörü', aciklama: 'Araçların (küçült, ayır, birleştir, döndür) yeni belge olarak kaydettiği dosyaların varsayılan klasörü. Boşsa Masaüstü kullanılır.',
    kontrol: el('div', { class: 'ayar-yanyana' }, [sec, temizle]), alt: yolEl,
  }));
}

function bolumHakkinda(k) {
  const { pdefe } = acik.baglam;
  const surumEl = el('span', {}, '…');
  const gelistirici = el('a', { href: 'https://x.com/CgrShn' }, 'x.com/CgrShn');
  gelistirici.addEventListener('click', (e) => { e.preventDefault(); pdefe.cagir('kabuk:disAc', 'https://x.com/CgrShn').catch(() => {}); });
  k.append(el('div', { class: 'ayar-hakkinda' }, [
    el('div', { class: 'ayar-hakkinda-satir' }, ['Sürüm ', surumEl]),
    el('div', { class: 'ayar-hakkinda-satir' }, ['Geliştirici: ', gelistirici]),
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

function radyoKartlari(ad, secili, secenekler, onDegis) {
  const grup = el('div', { class: 'ayar-radyo-grubu', role: 'radiogroup' });
  for (const s of secenekler) {
    const lbl = el('label', { class: 'ayar-kart ayar-radyo-kart' });
    const g = el('input', { type: 'radio', name: 'ayar-' + ad, value: s.id });
    g.checked = s.id === secili;
    g.addEventListener('change', () => { if (g.checked) { onDegis(s.id); grup.querySelectorAll('.ayar-radyo-kart').forEach((x) => x.classList.toggle('secili', x.contains(g))); } });
    lbl.classList.toggle('secili', g.checked);
    lbl.append(g, el('div', { class: 'ayar-etiket' }, [el('div', { class: 'ayar-baslik' }, s.baslik), el('div', { class: 'ayar-aciklama' }, s.aciklama)]));
    grup.append(lbl);
  }
  return grup;
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
