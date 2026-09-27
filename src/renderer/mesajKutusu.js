// Uygulama içi mesaj kutusu: Windows'un yerel mesaj kutusunun (ana süreçte dialog.showMessageBox, 'mesaj:kutu') yerine, aynı seçenekler
// ve aynı sonuçla. Pencerenin içinde açıldığından arka plana tıklamak da (ortu.js) Esc gibi kapatır. Araç penceresi, Ayarlar ya da F1
// açıkken onların üstünde açılır; yalnızca en üstteki kapanır. Açıkken bütün tuşları en üstteki kutu alır: uygulamanın ve alttaki
// pencerelerin kısayolları, belge tuşları ve menü hızlandırıcıları çalışmaz (yerel kutu da pencereyi kilitliyordu). Fareyle açılan
// menü komutları ve pencere kapatma isteği uygulama.js'te bekletilmez, yok sayılır (mesajKutusuAcik, mesajKutusuUyar).
//
//   mesajKutusu({ tur, baslik, mesaj, ayrinti, dugmeler, varsayilan, iptal, onayKutusu }) → Promise<{ secim, onay }>
//     tur        'question' (varsayılan; simgesiz, yerel kutudaki gibi) | 'info' | 'warning' | 'error'
//     mesaj      kalın ana ileti; ayrinti: altındaki açıklama (\n satır sonları korunur, uzun yollar kırılır). İkisi de seçilip kopyalanır.
//     dugmeler   düğme etiketleri, soldan sağa (verilmezse ['Tamam']); varsayilan: açılışta odaklı düğme (Enter), verilmezse 0
//     iptal      Esc'in ve arka plana tıklamanın sonucu; verilmezse düğmeler verildiyse sonuncusu, verilmediyse 0 (yerel kutunun cancelId'si)
//     onayKutusu onay kutusunun etiketi (ör. "Seçeneğimi hatırla"); onay: kutu kapanırken işaretli mi (hangi düğmeyle kapanırsa kapansın)
//     baslik     yerel kutunun pencere başlığıydı; verilirse iletinin üstünde küçük yazılır
//   Klavye: Enter odaklı düğmeye, odak onay kutusundaysa varsayılan düğmeye basar; Tab / Shift+Tab düğmeler ve onay kutusu arasında
//   döner, ← → düğmeler arasında gezer; Esc iptal. Kapanınca odak açılıştaki öğeye döner.
// Test kancası (paketli uygulamada da): window.__pdefeOtoYanit = { secim, onay } verilmişse kutu açılmaz, bu yanıt döner; soru o.son'a yazılır.
// window.__pdefeYerelKutu = true: soru eski yerel kutu yoluyla (ana süreç 'mesaj:kutu'; test örneğinde test:diyalogYanitlari kuyruğu /
// varsayılan yanıt, test:diyalogKaydi) yanıtlanır.
import { ortuTiklamasiBagla } from './ortu.js';

const SIMGELER = {
  info: '<svg viewBox="0 0 32 32"><circle class="dolgu" cx="16" cy="16" r="14"/><path class="cizgi" d="M16 14.5v8M16 9.6v.2"/></svg>',
  warning: '<svg viewBox="0 0 32 32"><path class="dolgu" d="M14.3 4.6a2 2 0 0 1 3.4 0l12.1 21a2 2 0 0 1-1.7 3H3.9a2 2 0 0 1-1.7-3z"/><path class="cizgi" d="M16 11.5v8M16 24.2v.2"/></svg>',
  error: '<svg viewBox="0 0 32 32"><circle class="dolgu" cx="16" cy="16" r="14"/><path class="cizgi" d="m11.2 11.2 9.6 9.6M20.8 11.2l-9.6 9.6"/></svg>',
};

const acikKutular = [];   // açık kutular, en üstteki sonda: { el, uyar }

/** Açık bir mesaj kutusu var mı. */
export function mesajKutusuAcik() { return acikKutular.length > 0; }

/** En üstteki kutuyu kısaca belirginleştirir ve odağı ona verir (kutu açıkken yok sayılan menü komutu ya da pencere kapatma isteğinde). */
export function mesajKutusuUyar() { acikKutular.at(-1)?.uyar(); }

/** Kaydetmeden çıkma sorusu (0.1.12, kullanıcı isteği: uygulamadaki bütün çıkış soruları aynı biçimde): sekme ve pencere kapatma,
 *  araç pencereleri. secim: 0 Kaydet (Enter), 1 Kaydetme, 2 Vazgeç (Esc, arka plana tıklama). ad: dosya adı, uzantısıyla. */
export function kaydetmedenCikisSorusu(ad) {
  return { mesaj: `"${ad}" belgesinde kaydedilmemiş değişiklikler var.`, ayrinti: 'Çıkmadan önce kaydetmek ister misiniz?', dugmeler: ['Kaydet', 'Kaydetme', 'Vazgeç'], varsayilan: 0, iptal: 2 };
}

export function mesajKutusu(secenek = {}) {
  if (window.__pdefeOtoYanit) {
    const o = window.__pdefeOtoYanit; o.son = secenek;
    console.warn('[test] mesaj kutusu otomatik yanıtlandı:', secenek.mesaj);
    return Promise.resolve({ secim: o.secim ?? 0, onay: !!o.onay });
  }
  // Test kancası: eski yerel kutu yolu (ana süreçte 'mesaj:kutu'). Test örneğinde yanıt test:diyalogYanitlari kuyruğundan ya da
  // varsayılandan gelir, soru test:diyalogKaydi'na yazılır (bu kuyrukla yazılmış senaryolar, ör. test/senaryo13.mjs)
  if (window.__pdefeYerelKutu) return window.pdefe.cagir('mesaj:kutu', secenek);
  return new Promise((coz) => {
    const etiketler = secenek.dugmeler?.length ? secenek.dugmeler : ['Tamam'];
    const iptal = secenek.iptal ?? (secenek.dugmeler ? secenek.dugmeler.length - 1 : 0);
    const varsayilan = Number.isInteger(secenek.varsayilan) && secenek.varsayilan >= 0 && secenek.varsayilan < etiketler.length ? secenek.varsayilan : 0;
    const tur = SIMGELER[secenek.tur] ? secenek.tur : 'question';
    const oncekiOdak = document.activeElement;

    const ortu = document.createElement('div');
    ortu.className = 'diyalog-ortusu mesaj-ortusu';
    ortu.innerHTML = `<div class="diyalog mesaj-kutusu" role="alertdialog" aria-modal="true" tabindex="-1" data-tur="${tur}">
      <div class="mesaj-govde">${tur !== 'question' ? `<span class="mesaj-simge" aria-hidden="true">${SIMGELER[tur]}</span>` : ''}
        <div class="mesaj-metin"><div class="mesaj-pencere-basligi" hidden></div><div class="mesaj-ileti"></div><div class="mesaj-ayrinti" hidden></div></div>
      </div>
      <div class="dugmeler"></div>
    </div>`;
    const el = ortu.firstElementChild;
    const ileti = el.querySelector('.mesaj-ileti'), ayrinti = el.querySelector('.mesaj-ayrinti'), pBaslik = el.querySelector('.mesaj-pencere-basligi');
    ileti.textContent = secenek.mesaj ?? '';
    ileti.id = 'mesaj-ileti-' + (acikKutular.length + 1); el.setAttribute('aria-labelledby', ileti.id);
    if (secenek.ayrinti) { ayrinti.textContent = secenek.ayrinti; ayrinti.hidden = false; ayrinti.id = ileti.id + '-ayrinti'; el.setAttribute('aria-describedby', ayrinti.id); }
    if (secenek.baslik && secenek.baslik !== 'PDEfe') { pBaslik.textContent = secenek.baslik; pBaslik.hidden = false; }
    const alt = el.querySelector('.dugmeler');
    let onay = null;
    if (secenek.onayKutusu) {
      const l = document.createElement('label');
      l.className = 'mesaj-onay';
      l.innerHTML = '<input type="checkbox"><span></span>';
      l.querySelector('span').textContent = secenek.onayKutusu;
      onay = l.querySelector('input');
      alt.append(l);
    }
    const dugmeler = etiketler.map((etiket, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i === varsayilan ? 'birincil' : 'ikincil';
      b.textContent = etiket;
      b.addEventListener('click', () => kapat(i));
      alt.append(b);
      return b;
    });
    const odaklanabilir = () => [onay, ...dugmeler].filter(Boolean);

    const kutu = {
      el,
      uyar: () => {
        el.classList.remove('dikkat'); void el.offsetWidth; el.classList.add('dikkat');
        if (!el.contains(document.activeElement)) dugmeler[varsayilan].focus();
      },
    };
    let kapandi = false;
    function kapat(secim) {
      if (kapandi) return;
      kapandi = true;
      window.removeEventListener('keydown', tus, true);
      window.removeEventListener('keyup', tus, true);
      ortu.remove();
      acikKutular.splice(acikKutular.indexOf(kutu), 1);
      try { if (oncekiOdak && oncekiOdak !== document.body && oncekiOdak.isConnected) oncekiOdak.focus({ preventScroll: true }); } catch { /* yok say */ }
      coz({ secim, onay: !!onay?.checked });
    }

    // Tuşlar pencere düzeyinde yakalama evresinde alınır: odak nerede olursa olsun (alttaki pencerede, belgede) yalnızca en üstteki kutu
    // işler; olay ilerlemez, uygulama ve menü kısayolları çalışmaz. Düğmenin Enter / Boşluk'la, onay kutusunun Boşluk'la kendi davranışı
    // ve seçili iletinin kopyalanması (Ctrl+C) korunur.
    function tus(e) {
      if (acikKutular.at(-1) !== kutu) return;
      e.stopPropagation();
      if (e.type !== 'keydown') return;
      const hedef = e.target, icerde = hedef instanceof Node && el.contains(hedef), dugmede = icerde && hedef.tagName === 'BUTTON';
      const ctrl = (e.ctrlKey || e.metaKey) && !e.altKey;
      if (e.key === 'Escape') { e.preventDefault(); kapat(iptal); return; }
      // Enter odaklı düğmeye (odak onay kutusunda ya da dışarıdaysa varsayılana) basar. Basılı tutulan tuşun yinelemesi yanıt sayılmaz:
      // kutuyu açan Enter (ör. sekmenin × düğmesinde) basılı kalınca kutuyu kendiliğinden yanıtlamasın
      if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) (dugmede ? hedef : dugmeler[varsayilan]).click(); return; }
      if (e.key === ' ' && icerde && (dugmede || hedef === onay)) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        const liste = odaklanabilir(), i = liste.indexOf(document.activeElement);
        liste[i < 0 ? (e.shiftKey ? liste.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + liste.length) % liste.length].focus();
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const i = dugmeler.indexOf(document.activeElement);
        if (i >= 0) dugmeler[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + dugmeler.length) % dugmeler.length].focus();
        return;
      }
      if (ctrl && (e.key === 'c' || e.key === 'C' || e.key === 'Insert')) return;
      e.preventDefault();
      if (ctrl && (e.key === 'a' || e.key === 'A')) {   // yalnızca iletinin metni (arkadaki belgenin bütün metni değil)
        const s = window.getSelection(), r = document.createRange();
        r.selectNodeContents(el.querySelector('.mesaj-metin')); s.removeAllRanges(); s.addRange(r);
      }
    }

    ortuTiklamasiBagla(ortu, () => kapat(iptal));
    // Arka plana basış odağı kutudan almaz; içerideki metne basış odağı kutunun kendisine verir (tabindex -1)
    ortu.addEventListener('mousedown', (e) => { if (e.target === ortu) e.preventDefault(); });
    // Kutu açıkken bırakılan dosya belge açmasın (yerel kutu da pencereyi kilitliyordu): olaylar uygulamanın sürükle-bırak dinleyicilerine
    // ulaşmaz, dragover kabul edilmediğinden bırakma olmaz
    for (const t of ['dragenter', 'dragover', 'dragleave', 'drop']) ortu.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'drop') e.preventDefault(); });
    window.addEventListener('keydown', tus, true);
    window.addEventListener('keyup', tus, true);
    acikKutular.push(kutu);
    document.body.append(ortu);
    dugmeler[varsayilan].focus({ preventScroll: true });
  });
}
