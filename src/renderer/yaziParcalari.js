// Yazı (FreeText) zengin metni: karakter düzeyinde kalın / italik / altı çizili / üstü çizili ve renk.
// Model: parçalar (run) dizisi [{ metin, kalin?, italik?, alti?, ustu?, renk? }]. Yalnızca etkin nitelikler yazılır; renk kutunun
// varsayılan renginden farklıysa tutulur. Düz metin (/Contents) parçaların birleşimidir, satır sonu '\n'.
// Çekirdekteki (core/islemler/notlar.py) _parca_stili / _parcalari_uydur / freetext_stil_kanonik ile aynı kurallar.

export const BICIMLER = ['kalin', 'italik', 'alti', 'ustu'];
export const HIZA_CSS = { sol: 'left', orta: 'center', sag: 'right' };
/** [çapa, odak] → [baş, son] */
export const sirala = (s) => (s[0] <= s[1] ? [s[0], s[1]] : [s[1], s[0]]);

/** Parçanın biçimi (metin hariç), sabit anahtar sırasıyla; varsayilanRenk'e eşit renk yazılmaz. */
export function stilAl(p, varsayilanRenk = null) {
  const s = {};
  for (const k of BICIMLER) if (p?.[k]) s[k] = true;
  const renk = p?.renk ? String(p.renk).toLowerCase() : null;
  if (renk && /^#[0-9a-f]{6}$/.test(renk) && renk !== varsayilanRenk) s.renk = renk;
  return s;
}
const stilAnahtari = (s) => BICIMLER.map((k) => (s[k] ? 1 : 0)).join('') + (s.renk || '');
export const stilEsit = (a, b) => stilAnahtari(a || {}) === stilAnahtari(b || {});

/** Parçaları karakter düzeyine açar: { metin, stiller } (her UTF-16 birimine bir stil). */
function ac(parcalar, varsayilanRenk = null) {
  let metin = '';
  const stiller = [];
  for (const p of parcalar || []) {
    const m = String(p?.metin ?? '');
    if (!m) continue;
    const s = stilAl(p, varsayilanRenk);
    metin += m;
    for (let i = 0; i < m.length; i++) stiller.push(s);
  }
  return { metin, stiller };
}

/** Karakter düzeyinden parçalara: bitişik aynı stiller tek parça. */
function topla(metin, stiller) {
  const sonuc = [];
  let onceki = null;
  for (let i = 0; i < metin.length; i++) {
    const s = stiller[i] || {};
    const a = stilAnahtari(s);
    if (onceki && onceki.a === a) onceki.p.metin += metin[i];
    else { onceki = { a, p: { metin: metin[i], ...s } }; sonuc.push(onceki.p); }
  }
  return sonuc;
}

export const duzMetin = (parcalar) => (parcalar || []).map((p) => p?.metin ?? '').join('');
export const normallestir = (parcalar, varsayilanRenk = null) => { const { metin, stiller } = ac(parcalar, varsayilanRenk); return topla(metin, stiller); };

/** [a, b) aralığındaki bütün karakterlerde biçim var mı (Word gibi satır sonları sayılmaz; aralık yalnızca satır sonuysa onlar). */
export function hepsindeMi(parcalar, a, b, anahtar) {
  const { metin, stiller } = ac(parcalar);
  const son = Math.min(b, metin.length);
  let sayilan = 0;
  for (let i = Math.max(0, a); i < son; i++) { if (metin[i] === '\n') continue; sayilan++; if (!stiller[i][anahtar]) return false; }
  if (sayilan) return true;
  if (son <= a) return false;
  for (let i = Math.max(0, a); i < son; i++) if (!stiller[i][anahtar]) return false;
  return true;
}

/** [a, b) aralığında biçimi açar / kapatır; anahtar 'renk' ise deger renk ya da null. */
export function stilDegistir(parcalar, a, b, anahtar, deger) {
  const { metin, stiller } = ac(parcalar);
  for (let i = Math.max(0, a); i < Math.min(b, metin.length); i++) {
    const s = { ...stiller[i] };
    if (deger) s[anahtar] = anahtar === 'renk' ? deger : true; else delete s[anahtar];
    stiller[i] = stilAl(s);
  }
  return topla(metin, stiller);
}

/** [a, b) aralığını verilen stildeki metinle değiştirir. */
export function metinDegistir(parcalar, a, b, yeni, stil) {
  const { metin, stiller } = ac(parcalar);
  const s = stilAl(stil);
  const eklenen = String(yeni ?? '');
  const st = stiller.slice(0, a);
  for (let i = 0; i < eklenen.length; i++) st.push(s);
  return topla(metin.slice(0, a) + eklenen + metin.slice(b), st.concat(stiller.slice(b)));
}

/** Konumdaki karakterin stili: yazılacak metin için (Word gibi) imleçten önceki karakterin, en baştaysa ilk karakterin stili. */
export function stilKonumda(parcalar, ofset, onceki = true) {
  const { metin, stiller } = ac(parcalar);
  if (!metin.length) return {};
  const i = onceki && ofset > 0 ? Math.min(ofset, metin.length) - 1 : Math.min(Math.max(0, ofset), metin.length - 1);
  return { ...stiller[i] };
}

/**
 * Parçaları değişmiş düz metne uydurur (ör. içerik yorum balonundan değişti): ortak baş ve son korunur; eski orta bölüm yenisinin
 * içinde duruyorsa (başa ve sona birlikte ekleme) o da biçimiyle korunur, eklenenler komşu karakterin biçimini alır; yoksa değişen
 * bölüm önündeki karakterin biçimini alır.
 */
export function uzlastir(parcalar, yeniMetin, varsayilanRenk = null) {
  const { metin, stiller } = ac(parcalar, varsayilanRenk);
  const yeni = String(yeniMetin ?? '');
  if (metin === yeni) return topla(metin, stiller);
  const n = Math.min(metin.length, yeni.length);
  let bas = 0;
  while (bas < n && metin[bas] === yeni[bas]) bas++;
  let son = 0;
  while (son < n - bas && metin[metin.length - 1 - son] === yeni[yeni.length - 1 - son]) son++;
  const eskiOrta = metin.slice(bas, metin.length - son), yeniOrta = yeni.slice(bas, yeni.length - son);
  const st = stiller.slice(0, bas);
  const k = eskiOrta ? yeniOrta.indexOf(eskiOrta) : -1;
  if (k >= 0) {
    const onceki = stiller[bas - 1] || stiller[bas];
    const sonraki = stiller[metin.length - son - 1];
    for (let i = 0; i < k; i++) st.push(onceki);
    for (let i = bas; i < metin.length - son; i++) st.push(stiller[i]);
    for (let i = k + eskiOrta.length; i < yeniOrta.length; i++) st.push(sonraki);
  } else {
    const orta = stiller[bas - 1] || stiller[0] || {};
    for (let i = 0; i < yeniOrta.length; i++) st.push(orta);
  }
  return topla(yeni, st.concat(stiller.slice(metin.length - son)));
}

/**
 * Yazı biçiminin kanonik biçimi (karşılaştırma ve kayıt için sabit anahtar sırası):
 * { tip, boyut, renk, arka, kenarlik, [kenarlikRengi], [hiza], parcalar }. Parçası olmayan eski (0.1.1) kaydın kutu düzeyindeki
 * kalin / italik / altiCizili bayrakları tek parçaya çevrilir; parçalar metinle uyuşmuyorsa (ör. içerik balondan değişti) uydurulur.
 */
export function yaziKanonik(yazi, icerik) {
  const y = yazi || {};
  const metin = String(icerik ?? '');
  const renk = String(y.renk || '#000000').toLowerCase();
  const kaynak = Array.isArray(y.parcalar) ? y.parcalar : [{ metin, kalin: !!y.kalin, italik: !!y.italik, alti: !!y.altiCizili }];
  const k = { tip: y.tip || 'Segoe UI', boyut: +y.boyut || 12, renk, arka: y.arka ? String(y.arka).toLowerCase() : null, kenarlik: !!y.kenarlik };
  if (y.kenarlikRengi) k.kenarlikRengi = String(y.kenarlikRengi).toLowerCase();
  if (y.hiza === 'orta' || y.hiza === 'sag') k.hiza = y.hiza;
  k.parcalar = uzlastir(kaynak, metin, renk);
  return k;
}

// ------------------------------------------------------------ DOM
/** Parçaları elemana çizer (parça başına span). Metin satır sonuyla bitiyorsa son boş satır için yer tutucu <br>. */
export function parcalariCiz(el, parcalar) {
  const cocuklar = [];
  for (const p of parcalar || []) {
    if (!p?.metin) continue;
    const s = document.createElement('span');
    if (p.kalin) s.style.fontWeight = '700';
    if (p.italik) s.style.fontStyle = 'italic';
    const cizgi = [p.alti && 'underline', p.ustu && 'line-through'].filter(Boolean).join(' ');
    if (cizgi) s.style.textDecorationLine = cizgi;
    if (p.renk) s.style.color = p.renk;
    s.textContent = p.metin;
    cocuklar.push(s);
  }
  if (duzMetin(parcalar).endsWith('\n')) cocuklar.push(document.createElement('br'));
  el.replaceChildren(...cocuklar);
}

/**
 * Satır sonundaki boşlukların altı / üstü çizgisini kaldırır: çekirdek kaydedilen görünümde satır sonu boşluklarını çizgide saymaz
 * (Word gibi), tarayıcı ise sarma yerinde asılı kalan boşlukların da altını çizer. Eleman belgede ve dizilmişken çağrılır: çizgili
 * parçadaki boşluk dizisinin ardından satır sonu, metin sonu ya da sonraki satırda başlayan karakter geliyorsa dizi çizgisiz ayrı
 * span'a alınır. Metin, ofsetler ve satır kırılımı değişmez.
 */
export function sonBosluklariCizgisizYap(el) {
  if (!el.isConnected || !el.querySelector('span[style*="text-decoration"]')) return;
  const dugumler = [];
  let metin = '';
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) { dugumler.push({ t, bas: metin.length }); metin += t.data; }
  const dugumde = (g) => dugumler.find((x) => g >= x.bas && g < x.bas + x.t.data.length);
  const kutu = (g, ilk) => {
    const x = dugumde(g); if (!x) return null;
    const r = document.createRange();
    r.setStart(x.t, g - x.bas); r.setEnd(x.t, g - x.bas + 1);
    const q = r.getClientRects();
    return q.length ? q[ilk ? 0 : q.length - 1] : null;
  };
  const esik = (parseFloat(getComputedStyle(el).fontSize) || 12) * 0.6;   // yarım satır (satır yüksekliği 1.2)
  const araliklar = [];
  for (let g = 0; g < metin.length; g++) {
    if (metin[g] !== ' ') continue;
    let e = g;
    while (e < metin.length && metin[e] === ' ') e++;
    const cizgili = dugumler.some((x) => x.bas < e && x.bas + x.t.data.length > g && x.t.parentElement !== el && x.t.parentElement.style.textDecorationLine);
    if (cizgili) {
      let sonda = e === metin.length || metin[e] === '\n';
      if (!sonda) {
        // Dizinin satırı: önündeki karakterden (asılı boşluğun kutusu olmayabilir)
        const once = g > 0 && metin[g - 1] !== '\n' ? kutu(g - 1, false) : kutu(g, false);
        const sonra = kutu(e, true);
        sonda = !!(once && sonra && sonra.top - once.top > esik);
      }
      if (sonda) araliklar.push([g, e]);
    }
    g = e;
  }
  if (!araliklar.length) return;
  for (const { t, bas } of dugumler) {
    const span = t.parentElement;
    if (span === el || !span.style.textDecorationLine) continue;
    const son = bas + t.data.length;
    const kesitler = araliklar.filter(([a, b]) => a < son && b > bas);
    if (!kesitler.length) continue;
    const yeni = [];
    const ekle = (a, b, cizgisiz) => {
      if (b <= a) return;
      const s = span.cloneNode(false);
      if (cizgisiz) s.style.textDecorationLine = '';
      s.textContent = metin.slice(a, b);
      yeni.push(s);
    };
    let i = bas;
    for (const [a, b] of kesitler) { const x = Math.max(a, bas), y = Math.min(b, son); ekle(i, x, false); ekle(x, y, true); i = y; }
    ekle(i, son, false);
    span.replaceWith(...yeni);
  }
}

const rgbHex = (c) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
  return m ? '#' + m.slice(1, 4).map((v) => (+v).toString(16).padStart(2, '0')).join('') : null;
};

/**
 * Düzenleyicinin DOM'unu parçalara okur (yalnızca tarayıcının kendi değiştirdiği durumlar için yedek yol: IME birleştirmesi vb.).
 * Stil hesaplanmış stilden; son yaprak <br> yer tutucudur, blok öğeler satır başlatır.
 */
export function domdanOku(el, varsayilanRenk) {
  const yapraklar = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let d = w.nextNode(); d; d = w.nextNode()) {
    if (d.nodeType === 3 || d.nodeName === 'BR') yapraklar.push(d);
    else if (/^(DIV|P|LI)$/.test(d.nodeName)) yapraklar.push({ blok: d });
  }
  let metin = '';
  const stiller = [];
  const stilBul = (e) => {
    const cs = getComputedStyle(e);
    const s = {};
    if ((parseInt(cs.fontWeight, 10) || 400) >= 600) s.kalin = true;
    if (cs.fontStyle !== 'normal') s.italik = true;
    for (let x = e; x && x !== el.parentNode; x = x.parentElement) {
      const c = getComputedStyle(x).textDecorationLine || '';
      if (c.includes('underline')) s.alti = true;
      if (c.includes('line-through')) s.ustu = true;
      if (x === el) break;
    }
    const r = rgbHex(cs.color);
    if (r && r !== varsayilanRenk) s.renk = r;
    return stilAl(s, varsayilanRenk);
  };
  yapraklar.forEach((y, i) => {
    if (y.blok) { if (metin && !metin.endsWith('\n')) { metin += '\n'; stiller.push(stiller[stiller.length - 1] || {}); } return; }
    if (y.nodeType === 3) { const s = stilBul(y.parentElement); metin += y.data; for (let k = 0; k < y.data.length; k++) stiller.push(s); return; }
    if (i === yapraklar.length - 1) return;   // sondaki <br>: yer tutucu
    metin += '\n'; stiller.push(stilBul(y.parentElement));
  });
  return topla(metin, stiller);
}

/** Eleman içindeki (düğüm, ofset) konumunun metin ofseti (kanonik DOM'da metin yalnızca metin düğümlerinde). */
export function ofsetAl(el, dugum, ofset) {
  try {
    const r = document.createRange();
    r.setStart(el, 0);
    r.setEnd(dugum, ofset);
    return r.toString().length;
  } catch { return 0; }
}

/** Seçimin eleman içindeki [çapa, odak] ofsetleri; seçim eleman dışındaysa null. */
export function secimAl(el) {
  const s = window.getSelection();
  if (!s || !s.rangeCount || !el.contains(s.anchorNode) || !el.contains(s.focusNode)) return null;
  return [ofsetAl(el, s.anchorNode, s.anchorOffset), ofsetAl(el, s.focusNode, s.focusOffset)];
}

/** Metin ofsetinin DOM konumu. Satır sonundan hemen sonrası bir sonraki satırın başına (ya da sondaki <br>'in önüne) konur. */
export function konumBul(el, ofset) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let kalan = Math.max(0, ofset);
  let son = null;
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const n = t.data.length;
    if (kalan <= n) {
      if (kalan === n && n && t.data[n - 1] === '\n') { kalan = 0; son = t; continue; }
      return [t, kalan];
    }
    kalan -= n;
    son = t;
  }
  if (son && son.data.endsWith('\n') && el.lastChild?.nodeName === 'BR') return [el, el.childNodes.length - 1];
  return son ? [son, son.data.length] : [el, 0];
}

/** Seçimi ofsetlerle kurar (yön korunur). */
export function secimKoy(el, capa, odak = capa) {
  const [an, ao] = konumBul(el, capa);
  const [fn, fo] = konumBul(el, odak);
  window.getSelection()?.setBaseAndExtent(an, ao, fn, fo);
}
