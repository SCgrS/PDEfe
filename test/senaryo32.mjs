// Senaryo 32 (0.2.4, kullanıcı istekleri): yakınlaştırma okunun listesi (beş sabit değer, "Görünür alana sığdır" yok, "Varsayılanı ayarla"
// Ayarlar'da varsayılan yakınlaştırmayı gösterir), Ctrl+± adımları ve %6400 sınırı değişmedi; Ayarlar'da "Son kullanılan" ve "Görünür alana
// sığdır" yok, eski değer genişliğe sığdır olur; menü çubuğunda "Görünür alana sığdır" yok; açılış ekranının imzası "Sürüm … · Geliştirici:
// x.com/CgrShn" (bağlantı renksiz, altı çizgisiz, tıklanınca tarayıcıda açılır, Hakkında'yı açmaz; ada tıklanınca Hakkında); Hakkında'da
// "Geri bildirimler için:"; Ayarlar'da Hakkında'nın üstünde Kısayollar (F1'deki listenin aynısı).
// Kullanım:
//   powershell -File test\baslat.ps1 -Port 9432 -Veri "%TEMP%\pdefe-s32-9432"      → PID=… yazar
//   $env:PDEFE_CDP_PORT=9432; node test\surucu.mjs betik test\senaryo32.mjs
// Eski ayarın taşınması: başlatmadan önce veri klasörüne ayarlar.json = {"varsayilanZoom":"son","sonZoom":150} yazıp $env:S32_ESKI_AYAR="1".
// Test örneğinde bağlantı tarayıcıda açılmaz: kabuk:disAc test:diyalogKaydi'na düşer.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = path.join(KOK, 'test', 'cikti', 'tanima');
const PDF = path.join(CIKTI, 'taranmis.pdf');
const J = (x) => JSON.stringify(x);

let hataSayisi = 0, toplam = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  toplam++;
  if (!ok) hataSayisi++;
  console.log(`${ok ? 'OK  ' : 'HATA'} ${ad}${ayrinti !== '' && !ok ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
  return ok;
};

export default async function ({ evalJs, bekle, tikla }) {
  const kosul = async (ifade, sure = 8000) => { const t0 = Date.now(); for (;;) { const v = await evalJs(ifade); if (v || Date.now() - t0 > sure) return v; await bekle(100); } };
  const kutu = (secici) => evalJs(`(() => { const e = document.querySelector(${J(secici)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const ayarlarAcik = () => evalJs(`!!document.querySelector('.ayarlar-pencere')`);
  const ayarlarKapat = async () => { await evalJs(`document.querySelector('.ayarlar-pencere [data-id="kapat"]')?.click(), 1`); await kosul(`!document.querySelector('.ayarlar-pencere')`, 3000); };
  const kayit = () => evalJs(`window.pdefe.cagir('test:diyalogKaydi')`);
  execFileSync(path.join(KOK, '.venv', 'Scripts', 'python.exe'), [path.join(KOK, 'test', 'tanima_pdf_uret.py'), CIKTI], { stdio: 'inherit' });
  await kosul(`!!window.__pdefe && !!document.querySelector('.karsilama-imza')`, 10000);

  // ---------------------------------------------------------------- 1. Ayarların taşınması ve sürümün kaydı
  console.log('— Ayarlar');
  const vz = await evalJs(`window.pdefe.cagir('ayar:al', 'varsayilanZoom')`), sz = await evalJs(`window.pdefe.cagir('ayar:al', 'sonZoom')`);
  if (process.env.S32_ESKI_AYAR) sonuc('Eski "Son kullanılan" ayarı genişliğe sığdır oldu, sonZoom kaydı silindi', vz === 'genislik' && sz == null, { vz, sz });
  else sonuc('Varsayılan yakınlaştırma genişliğe sığdır, sonZoom kaydı yok', vz === 'genislik' && sz == null, { vz, sz });

  // ---------------------------------------------------------------- 2. Açılış ekranının imzası
  console.log('— Açılış ekranının imzası');
  await kosul(`/Sürüm \\d/.test(document.querySelector('.karsilama-surum')?.textContent || '')`, 5000);
  const surum = await evalJs(`window.pdefe.cagir('uygulama:bilgi').then((b) => b.surum)`);
  const imza = await evalJs(`(() => { const i = document.querySelector('.karsilama-imza'), a = i.querySelector('a'), alt = i.querySelector('.karsilama-alt');
    const sa = getComputedStyle(a), sp = getComputedStyle(alt);
    return { metin: i.innerText.replace(/\\s+/g, ' ').trim(), href: a?.getAttribute('href'), baglantiMetni: a?.textContent, renk: sa.color, altRenk: sp.color, cizgi: sa.textDecorationLine,
      tab: a?.tabIndex, eski: i.innerText.includes('görüntüleyici') }; })()`);
  sonuc(`İmza: "PDEfe Sürüm ${surum} · Geliştirici: x.com/CgrShn"`, imza.metin === `PDEfe Sürüm ${surum} · Geliştirici: x.com/CgrShn` && !imza.eski, imza);
  sonuc('Bağlantı x.com/CgrShn, alt yazıyla aynı renkte, altı çizgisiz, Tab ile odaklanmaz', imza.href === 'https://x.com/CgrShn' && imza.baglantiMetni === 'x.com/CgrShn'
    && imza.renk === imza.altRenk && imza.cizgi === 'none' && imza.tab === -1, imza);
  const bag = await kutu('.karsilama-imza a');
  await kayit();
  await tikla(bag.x, bag.y);
  await bekle(500);
  const k1 = await kayit();
  const dis = k1.filter((x) => x.kanal === 'kabuk:disAc');
  sonuc('Bağlantıya tıklayınca tarayıcıda açılır (x.com/CgrShn), Hakkında açılmaz', dis.length === 1 && dis[0].secenek?.url === 'https://x.com/CgrShn' && !(await ayarlarAcik()), { dis, ayarlar: await ayarlarAcik() });
  const ad = await kutu('.karsilama-ad');
  await tikla(ad.x, ad.y);
  await kosul(`!!document.querySelector('.ayarlar-pencere')`, 3000);
  const secili = await evalJs(`document.querySelector('.ayarlar-bolumler button.secili')?.dataset.bolum`);
  sonuc('Ada tıklayınca Ayarlar › Hakkında açılır', secili === 'hakkinda', secili);
  const hakkinda = await evalJs(`[...document.querySelectorAll('.ayar-hakkinda-satir')].map((e) => e.textContent.trim())`);
  sonuc('Hakkında: "Geri bildirimler için: x.com/CgrShn", "Geliştirici" yok', hakkinda.includes('Geri bildirimler için: x.com/CgrShn') && !hakkinda.some((s) => s.includes('Geliştirici')), hakkinda);
  await ayarlarKapat();
  const surumKutu = await kutu('.karsilama-surum');
  await tikla(surumKutu.x, surumKutu.y);
  await kosul(`!!document.querySelector('.ayarlar-pencere')`, 3000);
  sonuc('Sürüme tıklayınca da Hakkında açılır', (await evalJs(`document.querySelector('.ayarlar-bolumler button.secili')?.dataset.bolum`)) === 'hakkinda');

  // ---------------------------------------------------------------- 3. Kısayollar bölümü
  console.log('— Kısayollar');
  const bolumler = await evalJs(`[...document.querySelectorAll('.ayarlar-bolumler button')].map((b) => b.dataset.bolum)`);
  sonuc('Bölümler: … Güncelleme, Kısayollar, Hakkında', J(bolumler.slice(-3)) === J(['guncelleme', 'kisayollar', 'hakkinda']), bolumler);
  await evalJs(`document.querySelector('.ayarlar-bolumler button[data-bolum="kisayollar"]').click(), 1`);
  await bekle(200);
  const satirlar = (kok) => `[...document.querySelectorAll('${kok} .kisayollar tr')].map((t) => [...t.cells].map((c) => c.textContent.trim()).join(' ').replace(/\\s+/g, ' '))`;
  const ayarSatirlari = await evalJs(satirlar('.ayarlar-icerik'));
  const ks = await evalJs(`({ baslik: document.querySelector('.ayarlar-icerik h2')?.textContent, tablo: document.querySelectorAll('.ayarlar-icerik .kisayollar').length,
    tasma: (() => { const i = document.querySelector('.ayarlar-icerik'); return i.scrollWidth - i.clientWidth; })() })`);
  sonuc('Kısayollar bölümü: başlık, üç tablo, yatay taşma yok', ks.baslik === 'Kısayollar' && ks.tablo === 3 && ks.tasma <= 0, ks);
  sonuc('Kısayollar: Aç, Kaydet, Bul, Ayarlar satırları var', ['Ctrl+O Aç', 'Ctrl+S Kaydet', 'Ctrl+F Bul', 'Ctrl+, Ayarlar'].every((s) => ayarSatirlari.includes(s)), ayarSatirlari.slice(0, 8));
  await ayarlarKapat();
  await evalJs(`(window.__pdefe.komutCalistir('yardim.kisayollar'), 1)`);
  await kosul(`!!document.querySelector('.diyalog .kisayollar')`, 3000);
  const f1Satirlari = await evalJs(satirlar('.diyalog'));
  sonuc(`F1 penceresi eskisi gibi, Ayarlar'dakiyle aynı ${f1Satirlari.length} satır`, f1Satirlari.length > 40 && J(f1Satirlari) === J(ayarSatirlari), { f1: f1Satirlari.length, ayar: ayarSatirlari.length });
  await evalJs(`document.querySelector('.diyalog button.birincil')?.click(), 1`);
  await kosul(`!document.querySelector('.diyalog .kisayollar')`, 3000);

  // ---------------------------------------------------------------- 4. Yakınlaştırma okunun listesi
  console.log('— Yakınlaştırma listesi');
  await evalJs(`window.__pdefe.dosyaAc(${J(PDF)}).then(() => 1)`);
  await kosul(`window.__pdefe.aktif()?.gorunum.hazir`, 10000);
  await bekle(300);
  const ok = await kutu('#dugme-zoom-secenek');
  const listeAc = async (yanit) => { await evalJs(`window.pdefe.cagir('test:diyalogYanitlari', 'menu:popup', [${J(yanit)}])`); await kayit(); await tikla(ok.x, ok.y); await bekle(400); };
  await listeAc(null);
  const ogeler = (await kayit()).filter((x) => x.kanal === 'menu:popup').at(-1)?.secenek || [];
  const ozet = ogeler.map((o) => (o.ayirici ? '—' : o.etiket));
  sonuc('Liste: Gerçek boyut, Sayfayı sığdır, Genişliğe sığdır, —, Varsayılanı ayarla, —, %25 %50 %100 %400 %1000',
    J(ozet) === J(['Gerçek boyut (%100)', 'Sayfayı sığdır', 'Genişliğe sığdır', '—', 'Varsayılanı ayarla', '—', '%25', '%50', '%100', '%400', '%1000']), ozet);
  sonuc('Listede "Görünür alana sığdır" yok', !ozet.some((s) => /Görünür/.test(s)), ozet);
  for (const [id, olcek] of [['y1000', 10], ['y25', 0.25], ['y400', 4]]) {
    await listeAc(id);
    const o = await evalJs('window.__pdefe.aktif().gorunum.olcek');
    sonuc(`Listeden %${Math.round(olcek * 100)} seçilince yakınlaştırma %${Math.round(olcek * 100)}`, Math.abs(o - olcek) < 0.001, o);
  }
  // Ctrl+± adımları ve sınır değişmedi: %4800'den bir adım %6400, sonra yine %6400
  const adim = await evalJs(`(async () => { const g = window.__pdefe.aktif().gorunum; await g.zoomAyarla(48); await g.yakinlastir(1); const a = g.olcek; await g.yakinlastir(1); const b = g.olcek;
    await g.zoomAyarla(1); await g.yakinlastir(1); const c = g.olcek; return [a, b, c]; })()`);
  sonuc('Ctrl+± adımları değişmedi: %4800 → %6400 → %6400, %100 → %110', J(adim) === J([64, 64, 1.1]), adim);
  await evalJs(`(window.__pdefe.komutCalistir('gorunum.zoom', 'genislik'), 1)`);
  await bekle(300);

  // "Varsayılanı ayarla": Ayarlar › Açılış ve düzen, varsayılan yakınlaştırmanın kartı görünür, vurgulu, seçim kutusu odakta
  await listeAc('varsayilan');
  await kosul(`!!document.querySelector('.ayarlar-pencere')`, 3000);
  const git = await evalJs(`(() => { const k = document.querySelector('.ayar-kart[data-hedef="varsayilanZoom"]'), i = document.querySelector('.ayarlar-icerik');
    if (!k) return null; const r = k.getBoundingClientRect(), ir = i.getBoundingClientRect();
    return { bolum: document.querySelector('.ayarlar-bolumler button.secili')?.dataset.bolum, vurgu: k.classList.contains('ayar-kart-vurgu'), odak: k.contains(document.activeElement) && document.activeElement.tagName,
      gorunur: r.top >= ir.top - 0.5 && r.bottom <= ir.bottom + 0.5, baslik: k.querySelector('.ayar-baslik')?.textContent,
      secenekler: [...k.querySelectorAll('select option')].map((o) => o.textContent), aciklama: k.querySelector('.ayar-aciklama')?.textContent }; })()`);
  sonuc('"Varsayılanı ayarla": Açılış ve düzen açılır, "Varsayılan yakınlaştırma" görünür ve vurgulu, seçim kutusu odakta',
    git && git.bolum === 'acilis' && git.vurgu && git.odak === 'SELECT' && git.gorunur && git.baslik === 'Varsayılan yakınlaştırma', git);
  sonuc('Varsayılan yakınlaştırmanın seçenekleri: Genişliğe sığdır, Sayfayı sığdır, Gerçek boyut, Yüzde',
    git && J(git.secenekler) === J(['Genişliğe sığdır', 'Sayfayı sığdır', 'Gerçek boyut', 'Yüzde']) && !/Son kullanılan|Görünür/.test(git.aciklama), git);
  await bekle(1800);
  sonuc('Vurgu kısa sürede kalkar', !(await evalJs(`document.querySelector('.ayar-kart[data-hedef="varsayilanZoom"]')?.classList.contains('ayar-kart-vurgu')`)));
  await ayarlarKapat();

  // ---------------------------------------------------------------- 5. Menü çubuğu
  console.log('— Menü çubuğu');
  const menu = J(await evalJs(`window.pdefe.cagir('test:menu')`));
  sonuc('Menü çubuğunda "Görünür alana sığdır" yok, "Genişliğe sığdır" var', !menu.includes('Görünür alana') && menu.includes('Genişliğe sığdır'), menu.slice(0, 300));

  await evalJs(`window.__pdefe.komutCalistir('sekme.kapat'), 1`);
  console.log(`\n${toplam - hataSayisi}/${toplam} denetim geçti`);
  if (hataSayisi) process.exitCode = 1;
}
