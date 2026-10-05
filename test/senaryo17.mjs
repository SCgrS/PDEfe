// Senaryo 17 (0.1.12, kullanıcı istekleri): pencere kapatmada değişmeyen sekmelerin önce kapanması ve yalnızca değişenlerin sorulması,
// araç penceresi açıkken pencere kapatma (önce aracın sorusu; 0.2.2'den beri birden çok sekmede ondan da önce "Geçerli sekme / Tüm
// sekmeler" sorulur, burada Tüm sekmeler seçilir; ayrıntısı senaryo29'da), bütün kaydetmeden çıkış sorularının tek biçimi (Kaydet | Kaydetme |
// Vazgeç; araçta Kaydet aracın kendi kaydı), araç çıktısında uzantısız ad ve Gezgin'de açılan klasör çipi, sekme ◀ ▶ uçta durması,
// Ayarlar düğmesi ve kopyala simgeli Paylaş, Ayarlar'da "Açılış ve düzen" / "Not ve vurgu" / Kopyalama'nın kalkması / Zaten varsayılan /
// Listeyi temizle / otomatik kaydetmenin varsayılan kapalı olması, seçim çubuğunda tek vurgu düğmesi ve ▾ renkler, not balonunda "Not" (0.1.14: "Not | yazar | tarih"),
// basamağa göre sayfa kutusu, yeni döndürme simgeleri, eski temizMetin=false ayarına rağmen temiz kopya.
// Kullanım: boş veri klasörlü test örneği (baslat.ps1) açıkken  $env:PDEFE_CDP_PORT=9371; node test/surucu.mjs betik test/senaryo17.mjs
// Belgeler test/pdf'ten test/cikti/s17/pdf'e kopyalanır (asıllarına yazılmaz); araç çıktıları test/cikti/s17/cikti'ya gider.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Her çalıştırma kendi klasöründe: test örneğinin çekirdeği araçlara eklenen dosyaları önbellekte açık tutabilir (silinemez)
const K = path.join(KOK, 'test', 'cikti', 's17', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const PDF = path.join(K, 'pdf'), CIKTI = path.join(K, 'cikti'), PNG = path.join(K, 'png');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};

export default async function ({ evalJs, ekranGoruntusu, bekle, tikla, surukle, tus }) {
  const kosul = async (ifade, sure = 10000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(150); } };
  const ss = async (ad) => { await bekle(250); await ekranGoruntusu(path.join(PNG, ad + '.png')); };
  const merkez = async (sec) => JSON.parse(await evalJs(`(() => { const e = ${sec}; if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`));
  const q = (s) => `document.querySelector(${J(s)})`;
  const sekmeler = () => evalJs(`[...window.__pdefe.belgeler.values()].map((b) => b.ad + (b.degisti ? '*' : ''))`);
  const kutu = () => evalJs(`(() => { const k = [...document.querySelectorAll('.mesaj-kutusu')].at(-1); return k ? { ileti: k.querySelector('.mesaj-ileti')?.textContent, ayrinti: k.querySelector('.mesaj-ayrinti')?.textContent, dugmeler: [...k.querySelectorAll('.dugmeler button')].map((b) => b.textContent), odak: document.activeElement?.textContent } : null; })()`);
  const kutuDugmesi = async (metin) => { const m = await merkez(`[...[...document.querySelectorAll('.mesaj-kutusu')].at(-1)?.querySelectorAll('.dugmeler button') || []].find((b) => b.textContent === ${J(metin)})`); if (!m) throw new Error('Düğme yok: ' + metin); await tikla(...m); await bekle(400); };
  const soruBekle = () => kosul(`!!document.querySelector('.mesaj-kutusu')`, 6000);
  const ac = (ad) => evalJs(`window.__pdefe.dosyaAc(${J(path.join(PDF, ad))}).then(() => new Promise((r) => setTimeout(() => r(true), 700)))`);
  const kirlet = (ad) => evalJs(`(async () => { const p = window.__pdefe; const b = [...p.belgeler.values()].find((x) => x.ad === ${J(ad)}); await p.sayfalariDondur(b, [1], 90, 'Sayfayı döndür'); await new Promise((r) => setTimeout(r, 300)); return b.degisti; })()`);
  const hepsiniKapat = () => evalJs(`(async () => { document.querySelectorAll('.arac-ortusu').forEach((e) => e.remove()); for (const id of [...window.__pdefe.belgeler.keys()]) await window.__pdefe.belgeKapat(id, { zorla: true }); return true; })()`);
  const kapatIstegi = () => evalJs(`window.pdefe.cagir('test:olayGonder', 'pencere:kapatIstegi')`);

  // ---------------------------------------------------------------- hazırlık
  for (const k of [PDF, CIKTI, PNG]) fs.mkdirSync(k, { recursive: true });
  const kaynaklar = fs.readdirSync(path.join(KOK, 'test', 'pdf')).filter((a) => /\.pdf$/i.test(a)).map((a) => path.join(KOK, 'test', 'pdf', a))
    .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size);
  if (!kaynaklar.length) throw new Error('test/pdf altında PDF yok');
  for (const ad of ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']) fs.copyFileSync(kaynaklar[0], path.join(PDF, ad));
  fs.copyFileSync(kaynaklar.find((y) => /6102_TTK/i.test(y)) || kaynaklar.at(-1), path.join(PDF, 'buyuk.pdf'));
  await tus('Escape');
  await hepsiniKapat();
  await evalJs(`(() => { window.__s17Hatalar = []; addEventListener('error', (e) => window.__s17Hatalar.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__s17Hatalar.push(String(e.reason?.message || e.reason))); return true; })()`);
  await evalJs(`(async () => { await window.pdefe.cagir('ayar:koy', 'ciktiKlasoru', ${J(CIKTI)}); window.__pdefe.ayar().ciktiKlasoru = ${J(CIKTI)}; await window.pdefe.cagir('test:diyalogKaydi'); return true; })()`);

  // ---------------------------------------------------------------- 7) otomatik kaydetme varsayılan kapalı (yeni veri klasörü)
  sonuc('Otomatik kaydetme ilk açılışta kapalı (ayar ve depo)', (await evalJs(`window.__pdefe.ayar().otomatikKaydet`)) === false && (await evalJs(`window.pdefe.cagir('ayar:al', 'otomatikKaydet')`)) === false);
  sonuc('Kopyalama ayarı (temizMetin) depoda yok', (await evalJs(`window.pdefe.cagir('ayar:al', 'temizMetin')`)) === undefined);

  // ---------------------------------------------------------------- 4, 5) araç çubuğu: Ayarlar düğmesi Paylaş'ın yanında, Paylaş kopyala simgeli
  const cubuk = await evalJs(`(() => { const p = document.querySelector('[data-komut="arac.paylas"]'), a = document.querySelector('#dugme-ayarlar'); return { yan: p?.nextElementSibling === a, komut: a?.dataset.komut, paylasRect: !!p?.querySelector('svg rect'), paylasEskiOk: /M10 3v10/.test(p?.innerHTML || '') }; })()`);
  sonuc('Ayarlar düğmesi Paylaş\'ın hemen sağında, duzen.ayarlar', cubuk.yan && cubuk.komut === 'duzen.ayarlar', cubuk);
  sonuc('Paylaş kopyala simgeli (eski yukarı ok yok)', cubuk.paylasRect && !cubuk.paylasEskiOk, cubuk);
  await tikla(...(await merkez(q('#dugme-ayarlar'))));
  sonuc('Ayarlar düğmesi Ayarlar penceresini açar', !!(await kosul(`!!document.querySelector('.ayarlar-ortusu')`)));

  // ---------------------------------------------------------------- 10, 11, 9) Ayarlar sekmeleri
  const bolumler = await evalJs(`[...document.querySelectorAll('.ayarlar-bolumler button')].map((b) => [b.dataset.bolum, b.textContent.trim()])`);
  sonuc('Sekmeler: Görünüm, Açılış ve düzen, Not ve vurgu, Kaydetme, Güncelleme, Hakkında (Kopyalama yok)',
    J(bolumler) === J([['gorunum', 'Görünüm'], ['acilis', 'Açılış ve düzen'], ['notlar', 'Not ve vurgu'], ['kaydetme', 'Kaydetme'], ['guncelleme', 'Güncelleme'], ['hakkinda', 'Hakkında']]), bolumler);
  await tikla(...(await merkez(q('.ayarlar-bolumler [data-bolum="acilis"]')))); await bekle(400);
  const acilis = await evalJs(`({ h2: document.querySelector('.ayarlar-icerik h2')?.textContent, h3: [...document.querySelectorAll('.ayarlar-icerik h3')].map((e) => e.textContent),
    dugme: !document.querySelector('.ayarlar-icerik .ayar-kart button.ikincil')?.hidden, zaten: !document.querySelector('.ayar-zaten-varsayilan')?.hidden })`);
  sonuc('Açılış ve düzen: Belge açılışı, Sayfa düzeni ve Pencere (0.2.2) alt başlıkları', acilis.h2 === 'Açılış ve düzen' && J(acilis.h3) === J(['Belge açılışı', 'Sayfa düzeni', 'Pencere']), acilis);
  sonuc('Varsayılan okunamayınca (test örneği) "Varsayılan PDF görüntüleyici yap" düğmesi görünür, tik yok', acilis.dugme && !acilis.zaten, acilis);
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'kabuk:varsayilanMi', [{ varsayilan: true, progId: 'PDEfe.pdf' }]).then(() => { window.dispatchEvent(new Event('focus')); return true; })`);
  await bekle(500);
  const zaten = await evalJs(`(() => { const k = [...document.querySelectorAll('.ayar-kart')].find((x) => x.querySelector('.ayar-baslik')?.textContent === 'Varsayılan PDF görüntüleyici'); return { tik: !k.querySelector('.ayar-zaten-varsayilan').hidden, metin: k.querySelector('.ayar-zaten-varsayilan').textContent, dugmeGizli: k.querySelector('button').hidden, renk: getComputedStyle(k.querySelector('.ayar-zaten-varsayilan')).color }; })()`);
  sonuc('PDEfe varsayılansa yeşil tik ve "Zaten varsayılan", düğme gizli', zaten.tik && zaten.metin === 'Zaten varsayılan' && zaten.dugmeGizli && /rgb\(15, 123, 15\)|rgb\(108, 203, 95\)/.test(zaten.renk), zaten);
  await ss('ayarlar-zaten-varsayilan');
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'kabuk:varsayilanMi', [{ varsayilan: false, progId: 'Baska.Uygulama' }]).then(() => { window.dispatchEvent(new Event('focus')); return true; })`);
  await bekle(500);
  sonuc('Başka uygulama seçilince (odak dönüşü) düğme geri gelir', await evalJs(`!document.querySelector('.ayar-zaten-varsayilan').hidden === false && !document.querySelector('.ayarlar-icerik .ayar-kart button.ikincil').hidden`));
  await evalJs(`document.querySelector('.ayarlar-ortusu [data-id="kapat2"]').click()`);

  // Önceki çalıştırmadan kalan durum (aynı test örneğinde yeniden çalıştırma): varsayılan vurgu rengi Sarı (Ayarlar'dan, seçim çubuğu
  // yeniden çizilsin), son açılanlar boş
  await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'notlar')`); await kosul(`!!document.querySelector('.ayar-renk[data-renk="#ffd100"]')`);
  await evalJs(`(() => { document.querySelector('.ayar-renk[data-renk="#ffd100"]').click(); document.querySelector('.ayarlar-ortusu [data-id="kapat2"]').click(); window.__pdefe.komutCalistir('dosya.sonTemizle'); return true; })()`);
  await bekle(300);

  // ---------------------------------------------------------------- 8) Listeyi temizle
  await ac('a.pdf'); await ac('b.pdf');
  sonuc('Son açılanlarda iki belge', (await evalJs(`window.pdefe.cagir('ayar:al', 'sonDosyalar')`))?.length === 2);
  await evalJs(`window.__pdefe.komutCalistir('duzen.ayarlar', 'acilis')`); await kosul(`!!document.querySelector('.ayarlar-ortusu')`); await bekle(300);
  const temizle = `[...document.querySelectorAll('.ayarlar-icerik button')].find((b) => b.textContent === 'Listeyi temizle')`;
  const tKart = await evalJs(`(() => { const b = ${temizle}; return { var: !!b, devre: b?.disabled, kart: b?.closest('.ayar-kart')?.querySelector('.ayar-baslik')?.textContent, altta: !!b?.closest('.ayar-kart-alt') }; })()`);
  sonuc('"Listeyi temizle" Son açılanları hatırla kartının altında, liste doluyken etkin', tKart.var && !tKart.devre && tKart.kart === 'Son açılanları hatırla' && tKart.altta, tKart);
  await tikla(...(await merkez(temizle))); await bekle(400);
  const menu = (await evalJs(`window.pdefe.cagir('test:menu')`))?.find((m) => m.etiket === '&Dosya')?.alt?.find((o) => o?.etiket === 'Son açılanlar');
  sonuc('Listeyi temizle: liste boş, düğme devre dışı, menü "(boş)", anahtar açık kalır', J(await evalJs(`window.pdefe.cagir('ayar:al', 'sonDosyalar')`)) === '[]' && await evalJs(`${temizle}.disabled`) && J(menu?.alt) === J(['(boş)']) && (await evalJs(`window.__pdefe.ayar().sonAcilanlariHatirla`)) === true, menu);
  await evalJs(`document.querySelector('.ayarlar-ortusu [data-id="kapat2"]').click()`);

  // ---------------------------------------------------------------- 17) sayfa kutusu basamağa göre
  const kutuGen = await evalJs(`document.querySelector('#sayfa-kutusu').getBoundingClientRect().width`);
  await ac('buyuk.pdf');
  const kutuGen2 = await evalJs(`({ g: document.querySelector('#sayfa-kutusu').getBoundingClientRect().width, h: document.querySelector('#sayfa-kutusu').getBoundingClientRect().height, toplam: document.querySelector('#sayfa-toplam').textContent })`);
  sonuc('Sayfa kutusu küçük (≤ 42 px, 24 px yükseklik) ve çok basamaklı belgede genişler', kutuGen <= 34 && kutuGen2.g > kutuGen && kutuGen2.g <= 42 && Math.round(kutuGen2.h) === 24, { kutuGen, kutuGen2 });

  // ---------------------------------------------------------------- 18) döndürme simgeleri
  const simge = await evalJs(`(() => { const d = document.querySelector('[data-komut="gorunum.dondur"] svg'); return { yay: d.querySelector('path')?.getAttribute('d'), dolu: d.querySelectorAll('path')[1]?.getAttribute('fill') }; })()`);
  sonuc('Döndür simgesi: alttan açık yay + dolu ok ucu', /A6\.2 6\.2 0 1 1/.test(simge.yay) && simge.dolu === 'currentColor', simge);

  // ---------------------------------------------------------------- 16) seçim çubuğu
  await evalJs(`(() => { const g = window.__pdefe.aktif().gorunum; g.zoomAyarla(1.5); return true; })()`); await bekle(1200);
  const satir = await evalJs(`(() => { const s = [...window.__pdefe.aktif().gorunum.sayfalar[0].el.querySelectorAll('.textLayer span')].filter((e) => e.textContent.trim().length > 12 && e.getBoundingClientRect().width > 120 && e.getBoundingClientRect().top > 150 && e.getBoundingClientRect().bottom < innerHeight - 200); const r = s[0].getBoundingClientRect(); return [r.left + 3, r.top + r.height / 2, r.right - 3]; })()`);
  await surukle(satir[0], satir[1], satir[2], satir[1]); await bekle(400);
  const c1 = await evalJs(`(() => { const c = document.querySelector('#secim-cubugu'); return { gorunur: !c.hidden, renkSayisi: [...c.querySelectorAll('.renk')].filter((r) => getComputedStyle(r).visibility === 'visible' && r.getBoundingClientRect().height > 0 && c.querySelector('.secim-renkler').getBoundingClientRect().height > 0).length, vurgu: !!c.querySelector('[data-islem="vurgu"]'), ok: !!c.querySelector('[data-islem="renkler"]'), not: !!c.querySelector('[data-islem="not"]'), kopyala: !!c.querySelector('[data-islem="kopyala"]'), cizgi: getComputedStyle(c.querySelector('.renk-cizgi')).stroke }; })()`);
  sonuc('Seçim çubuğu: tek vurgu düğmesi + ▾ + not + kopyala, renkler gizli, çizgi varsayılan sarı', c1.gorunur && c1.renkSayisi === 0 && c1.vurgu && c1.ok && c1.not && c1.kopyala && c1.cizgi === 'rgb(255, 209, 0)', c1);
  await ss('secim-cubugu');
  const okOnce = await merkez(q('#secim-cubugu [data-islem="renkler"]'));
  await tikla(...okOnce); await bekle(300);
  const okSonra = await merkez(q('#secim-cubugu [data-islem="renkler"]'));
  sonuc('▾ açılınca çubuk kaymaz: ▾ imlecin altında kalır', Math.abs(okOnce[0] - okSonra[0]) < 1 && Math.abs(okOnce[1] - okSonra[1]) < 1, { okOnce, okSonra });
  const c2 = await evalJs(`({ renkSayisi: [...document.querySelectorAll('#secim-cubugu .renk')].filter((r) => getComputedStyle(r).visibility === 'visible' && document.querySelector('#secim-cubugu .secim-renkler').getBoundingClientRect().height > 0).length, secimVar: !getSelection().isCollapsed, acik: document.querySelector('#secim-cubugu').classList.contains('renkler-acik') })`);
  sonuc('▾: altı renk açılır, metin seçimi korunur', c2.renkSayisi === 6 && c2.secimVar && c2.acik, c2);
  await ss('secim-renkler');
  await tikla(...(await merkez(q('#secim-cubugu .renk[data-renk="#7cc4ff"]')))); await bekle(500);
  const c3 = await evalJs(`({ renk: window.__pdefe.ayar().vurguRengi, depo: null, notlar: [...window.__pdefe.aktif().notlar.notlar.values()].filter((n) => !n.silindi).map((n) => n.tur + ' ' + n.renk) })`);
  c3.depo = await evalJs(`window.pdefe.cagir('ayar:al', 'vurguRengi')`);
  sonuc('Renk seçimi vurgular ve o renk varsayılan olur (Mavi)', c3.renk === '#7cc4ff' && c3.depo === '#7cc4ff' && J(c3.notlar) === J(['Highlight #7cc4ff']), c3);
  const satir2 = [satir[0], satir[1] + 60, satir[2]];
  await surukle(satir2[0], satir2[1], satir2[2], satir2[1]); await bekle(400);
  const c4 = await evalJs(`({ acik: document.querySelector('#secim-cubugu').classList.contains('renkler-acik'), cizgi: getComputedStyle(document.querySelector('#secim-cubugu .renk-cizgi')).stroke, baslik: document.querySelector('#secim-cubugu [data-islem="vurgu"]').title })`);
  sonuc('Yeni seçimde renkler kapalı, vurgu düğmesi yeni varsayılanı gösterir', !c4.acik && c4.cizgi === 'rgb(124, 196, 255)' && c4.baslik === 'Vurgula (Mavi)', c4);
  await tikla(...(await merkez(q('#secim-cubugu [data-islem="vurgu"]')))); await bekle(500);
  sonuc('Tek tık vurgu varsayılan renkle', J(await evalJs(`[...window.__pdefe.aktif().notlar.notlar.values()].filter((n) => !n.silindi).map((n) => n.renk)`)) === J(['#7cc4ff', '#7cc4ff']));

  // ---------------------------------------------------------------- temiz kopya: eski temizMetin=false ayarı yok sayılır
  await surukle(satir2[0], satir2[1] + 60, satir2[2], satir2[1] + 60); await bekle(300);
  const kopya = await evalJs(`(() => { window.__pdefe.ayar().temizMetin = false; const dt = new DataTransfer(); const e = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }); document.dispatchEvent(e); return { engellendi: e.defaultPrevented, metin: dt.getData('text/plain') }; })()`);
  sonuc('Kopyalama her zaman temiz metin (eski temizMetin=false ayarına rağmen)', kopya.engellendi && kopya.metin.length > 0 && !/\n$/.test(kopya.metin), kopya);
  await evalJs(`(() => { delete window.__pdefe.ayar().temizMetin; getSelection().removeAllRanges(); window.__pdefe.aktif().notlar.secimCubuguGizle(); return true; })()`);

  // ---------------------------------------------------------------- 12) not balonu "Not" (0.1.12'de "Not:"; 0.1.14'ten beri iki nokta
  // yerine tür, yazar ve tarih arasında ince dikey çizgi: "Not | Yazar | tarih")
  await surukle(satir2[0], satir2[1] + 120, satir2[2], satir2[1] + 120); await bekle(400);
  await tikla(...(await merkez(q('#secim-cubugu [data-islem="not"]')))); await bekle(500);
  const balon = await evalJs(`({ tur: document.querySelector('.not-balonu .tur')?.textContent, sira: [...document.querySelector('.not-balonu .ust').children].map((e) => e.className).filter((c) => /^(tur|yazar|tarih|ayrac)$/.test(c)) })`);
  sonuc('Metin notunun balonunda "Not | yazar | tarih"', balon.tur === 'Not' && J(balon.sira) === J(['tur', 'ayrac', 'yazar', 'ayrac', 'tarih']), balon);
  await evalJs(`(() => { const t = document.querySelector('.not-balonu textarea'); t.value = 'Deneme'; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await ss('not-balonu');
  await tus('Escape'); await bekle(300);

  // ---------------------------------------------------------------- 3) sekme okları uçta durur (burada kısa; ayrıntı sekme_genislik)
  const oklar = await evalJs(`(() => { const s = window.__pdefe.sekmeler; window.__pdefe.sekmeSec(s.sekmeler[0].id); const ilk = [document.querySelector('#sekme-onceki').disabled, s.kaydir(-1)]; window.__pdefe.sekmeSec(s.sekmeler.at(-1).id); const son = [document.querySelector('#sekme-sonraki').disabled, s.kaydir(1), s.aktifId === s.sekmeler.at(-1).id]; return { ilk, son }; })()`);
  sonuc('Sekme okları: ilk sekmede ◀, son sekmede ▶ devre dışı; kaydırma uçta durur', J(oklar) === J({ ilk: [true, false], son: [true, false, true] }), oklar);
  await evalJs(`window.__pdefe.belgeKapat([...window.__pdefe.belgeler.values()].find((b) => b.ad === 'buyuk.pdf').id, { zorla: true })`);   // vurgular ve not: kaydedilmez

  // ---------------------------------------------------------------- 2, 13, 14) Sayfaları düzenle: uzantısız ad, klasör çipi, çıkış sorusu
  await evalJs(`window.__pdefe.sekmeSec([...window.__pdefe.belgeler.values()].find((b) => b.ad === 'a.pdf').id)`); await bekle(500);
  await evalJs(`window.__pdefe.komutCalistir('arac.sayfalar')`); await kosul(`document.querySelectorAll('.sayfa-karti').length > 0`); await bekle(600);
  const cikti = await evalJs(`({ ad: document.querySelector('.arac-cikti-ad').value, cip: document.querySelector('.arac-klasor-cip').tagName, ipucu: document.querySelector('.arac-klasor-cip').title })`);
  sonuc('Kaydetme adı uzantısız: "Düzenlenmiş" (0.1.25; klasörde varsa "(2)"…)', /^Düzenlenmiş( \(\d+\))?$/.test(cikti.ad), cikti);
  await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  await tikla(...(await merkez(q('.arac-klasor-cip')))); await bekle(300);
  const cipKaydi = (await evalJs(`window.pdefe.cagir('test:diyalogKaydi')`)).filter((k) => k.kanal === 'kabuk:klasorAc');
  sonuc('Klasör çipi düğme; tıklanınca klasör Gezgin\'de açılır (kabuk:klasorAc, çıktı klasörü)', cikti.cip === 'BUTTON' && cipKaydi.length === 1 && cipKaydi[0].secenek.klasor === CIKTI && cikti.ipucu === 'Klasörü aç: ' + CIKTI, { cikti, cipKaydi });
  await evalJs(`(() => { const g = document.querySelector('.arac-cikti-ad'); g.focus(); g.value = 'x.PDF'; g.dispatchEvent(new Event('input')); g.blur(); return true; })()`);
  sonuc('Elle yazılan uzantı odak çıkınca silinir', (await evalJs(`document.querySelector('.arac-cikti-ad').value`)) === 'x');
  // Adı ".pdf.pdf" ile biten dosya (Değiştir diyaloğunda seçilmiş gibi): uzantı yalnızca bir kez silinir
  await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'dosya:kaydetDiyalog', [${J(path.join(CIKTI, 'dilekce.pdf.pdf'))}])`);
  await tikla(...(await merkez(q('.arac-cikti-degistir')))); await bekle(400);
  const cift = await evalJs(`document.querySelector('.arac-cikti-ad').value`);
  sonuc('"dilekce.pdf.pdf" seçilince kutuda "dilekce.pdf" (uzantı bir kez silinir)', cift === 'dilekce.pdf', cift);
  await evalJs(`(() => { const g = document.querySelector('.arac-cikti-ad'); g.value = 'düzen'; g.dispatchEvent(new Event('input')); g.blur(); return true; })()`);
  await tikla(...(await merkez(q('.sayfa-karti')))); await tikla(...(await merkez(q('.sayfalar-arac-cubugu [data-komut="sagaDondur"]')))); await bekle(300);
  await tus('Escape'); await soruBekle();
  let k = await kutu();
  sonuc('Araç çıkış sorusu: "a.pdf" belgesinde kaydedilmemiş değişiklikler var. / Çıkmadan önce… / Kaydet | Kaydetme | Vazgeç, odak Kaydet',
    k?.ileti === '"a.pdf" belgesinde kaydedilmemiş değişiklikler var.' && k.ayrinti === 'Çıkmadan önce kaydetmek ister misiniz?' && J(k.dugmeler) === J(['Kaydet', 'Kaydetme', 'Vazgeç']) && k.odak === 'Kaydet', k);
  await ss('arac-cikis-sorusu');
  await kutuDugmesi('Vazgeç');
  sonuc('Vazgeç: araç penceresi açık, değişiklik duruyor', await evalJs(`!!document.querySelector('.sayfalar-pencere') && /değişti/.test(document.querySelector('.sayfalar-arac-cubugu .sayac').textContent)`));
  await tus('Escape'); await soruBekle(); await kutuDugmesi('Kaydet');
  await kosul(`!document.querySelector('.sayfalar-pencere')`, 15000); await bekle(800);
  sonuc('Kaydet: aracın kaydı (yeni belge "düzen.pdf") yazılır, pencere kapanır, çıktı açılır', fs.existsSync(path.join(CIKTI, 'düzen.pdf')) && (await sekmeler()).includes('düzen.pdf'), { dosyalar: fs.readdirSync(CIKTI), sekmeler: await sekmeler() });
  await evalJs(`window.__pdefe.sekmeSec([...window.__pdefe.belgeler.values()].find((b) => b.ad === 'a.pdf').id)`); await bekle(400);
  await evalJs(`window.__pdefe.komutCalistir('arac.sayfalar')`); await kosul(`document.querySelectorAll('.sayfa-karti').length > 0`); await bekle(600);
  await tikla(...(await merkez(q('.sayfa-karti')))); await tikla(...(await merkez(q('.sayfalar-arac-cubugu [data-komut="sagaDondur"]')))); await bekle(300);
  await tus('Escape'); await soruBekle(); await kutuDugmesi('Kaydetme');
  sonuc('Kaydetme: pencere kapanır, dosya yazılmaz, belge değişmez', !(await evalJs(`!!document.querySelector('.sayfalar-pencere')`)) && fs.readdirSync(CIKTI).length === 1 && !(await evalJs(`window.__pdefe.aktif().degisti`)));

  // ---------------------------------------------------------------- 14) sekme kapatma sorusu aynı biçimde
  await kirlet('b.pdf');
  await tikla(...(await merkez(`window.__pdefe.sekmeler.sekmeler.find((s) => s.ad === 'b.pdf').el.querySelector('.kapat')`))); await soruBekle();
  k = await kutu();
  sonuc('Sekme kapatma sorusu: aynı biçim ("Çıkmadan önce kaydetmek ister misiniz?")', k?.ileti === '"b.pdf" belgesinde kaydedilmemiş değişiklikler var.' && k.ayrinti === 'Çıkmadan önce kaydetmek ister misiniz?' && J(k.dugmeler) === J(['Kaydet', 'Kaydetme', 'Vazgeç']), k);
  await kutuDugmesi('Vazgeç');

  // ---------------------------------------------------------------- 1) pencere kapatma: değişmeyenler önce kapanır, sonra soru
  await ac('c.pdf'); await ac('d.pdf');
  await kirlet('d.pdf');
  const once = await sekmeler();
  // 0.2.2: birden çok sekmede önce "Geçerli sekme / Tüm sekmeler" sorulur (sekmelere dokunulmadan); Tüm sekmeler bugünkü akış
  await kapatIstegi(); await soruBekle();
  k = await kutu();
  sonuc('Pencere kapatma (0.2.2): önce "Geçerli sekme / Tüm sekmeler / Vazgeç" sorusu, sekmelere henüz dokunulmadı', /^Bu pencerede \d+ sekme açık\.$/.test(k?.ileti || '') && J(k.dugmeler) === J(['Geçerli sekme', 'Tüm sekmeler', 'Vazgeç']) && J(await sekmeler()) === J(once), k);
  await kutuDugmesi('Tüm sekmeler'); await soruBekle();
  const sonra = await sekmeler(); k = await kutu();
  sonuc('Pencere kapatma: değişikliği olmayan sekmeler soru açılmadan kapandı, yalnızca değişenler kaldı', J(sonra) === J(['b.pdf*', 'd.pdf*']), { once, sonra });
  sonuc('Pencere kapatma sorusu ilk değişen belge için, fotoğraftaki biçimde', k?.ileti === '"b.pdf" belgesinde kaydedilmemiş değişiklikler var.' && k.ayrinti === 'Çıkmadan önce kaydetmek ister misiniz?' && J(k.dugmeler) === J(['Kaydet', 'Kaydetme', 'Vazgeç']), k);
  await ss('pencere-kapatma-sorusu');
  await kutuDugmesi('Vazgeç');
  sonuc('Vazgeç: değişen sekmeler açık, uygulama açık', J(await sekmeler()) === J(['b.pdf*', 'd.pdf*']) && !(await kutu()));

  // ---------------------------------------------------------------- 15) araç penceresi açıkken pencere kapatma: önce aracın sorusu
  await evalJs(`window.__pdefe.komutCalistir('arac.gorselBirlestir', [${J(path.join(PDF, 'c.pdf'))}])`);
  await kosul(`document.querySelectorAll('.birlestir-oge').length > 0`); await bekle(800);
  const birlestirAd = await evalJs(`document.querySelector('.birlestir-pencere .arac-kayit-yeni .arac-cikti-ad').value`);
  await kapatIstegi(); await soruBekle(); await kutuDugmesi('Tüm sekmeler'); await soruBekle();   // 0.2.2: önce kapsam sorusu
  k = await kutu();
  sonuc('Araç açıkken pencere kapatma: önce aracın sorusu ("Birleştirilmiş.pdf"; 0.1.25), sekmelere dokunulmadı', /^Birleştirilmiş( \(\d+\))?$/.test(birlestirAd) && k?.ileti === `"${birlestirAd}.pdf" belgesinde kaydedilmemiş değişiklikler var.` && J(await sekmeler()) === J(['b.pdf*', 'd.pdf*']), { k, birlestirAd });
  await kutuDugmesi('Vazgeç');
  sonuc('Aracın sorusunda Vazgeç: araç ve sekmeler açık, uygulama kapanmadı', await evalJs(`!!document.querySelector('.birlestir-pencere')`) && J(await sekmeler()) === J(['b.pdf*', 'd.pdf*']));
  await kapatIstegi(); await soruBekle(); await kutuDugmesi('Tüm sekmeler'); await soruBekle(); await kutuDugmesi('Kaydetme');
  await soruBekle();
  k = await kutu();
  sonuc('Aracın sorusunda Kaydetme: araç kapanır, sıra belgelerin sorusuna gelir', !(await evalJs(`!!document.querySelector('.birlestir-pencere')`)) && k?.ileti === '"b.pdf" belgesinde kaydedilmemiş değişiklikler var.', k);
  await kutuDugmesi('Vazgeç');

  // ---------------------------------------------------------------- 1) sağ tık: Diğerlerini kapat — değişmeyen önce kapanır
  await ac('a.pdf');
  await evalJs(`(async () => { await window.pdefe.cagir('test:diyalogYanitlari', 'menu:popup', ['digerleri']); const s = window.__pdefe.sekmeler.sekmeler.find((x) => x.ad === 'd.pdf'); window.__pdefe.sekmeler.dispatchEvent(new CustomEvent('sagTik', { detail: { id: s.id } })); return true; })()`);
  await soruBekle();
  const digerleri = await sekmeler(); k = await kutu();
  sonuc('Diğerlerini kapat: değişmeyen (a) önce kapandı, değişen b soruldu', J(digerleri) === J(['b.pdf*', 'd.pdf*']) && k?.ileti === '"b.pdf" belgesinde kaydedilmemiş değişiklikler var.', { digerleri, k });
  await kutuDugmesi('Kaydetme');
  await kosul(`window.__pdefe.belgeler.size === 1`, 5000);
  sonuc('Kaydetme: b kapandı, d kaldı', J(await sekmeler()) === J(['d.pdf*']));

  sonuc('Konsolda hata yok', J(await evalJs(`JSON.stringify(window.__s17Hatalar || [])`)) === J('[]'));
  await hepsiniKapat();
  console.log(hataSayisi ? `\n${hataSayisi} HATA` : '\nHepsi geçti');
  process.exitCode = hataSayisi ? 1 : 0;
}
