// UDF (UYAP Doküman Formatı) okuma ve çizim motoru.
//
// legaluga-uyap-ui projesinin src/extension/udf.js dosyasından türetildi (commit 1a659c4233; MIT lisansı,
// Copyright (c) 2026 Hasan İmer Akın; tam metin LISANSLAR.txt'te). Zip, kodlama, XML güvenliği, resim, stil zinciri ve
// şablon verisi bölümleri büyük ölçüde korunuyor. Değişenler: sıkıştırılmamış content.xml, asılı girinti (Hanging),
// sekme durağı hizası ve öncüsü, UYAP liste numaraları, tablo kenarlık türleri ve satır düzeyinde sütun genişlikleri,
// üst/alt bilgide sayfa aralığı ve sayfa numarası, notlar (comments.xml), belge özellikleri, e-imza özeti denetimi,
// yazdırma CSS'i. Kurallar belgeler/UDF-SARTNAMESI.md'de.
//
// Belge içeriği hiçbir zaman HTML olarak işlenmez: görünüm yalnız createElement, textContent ve tek tek verilen CSS
// özellikleriyle kurulur; XML düğümleri sayfaya taşınmaz. Motor ağ isteği yapmaz.
(() => {
  'use strict';
  if (globalThis.UDFMotoru) return;

  const MiB = 1024 * 1024;
  const SINIR = Object.freeze({
    paket: 40 * MiB,          // .udf dosyası
    girdi: 1000,              // zip merkezî dizinindeki girdi
    icerik: 20 * MiB,         // açılmış content.xml (beyan ve fiilî sayaç)
    ekDosya: 5 * MiB,         // comments.xml, documentproperties.xml, sign.sgn
    derinlik: 32,             // tablo → hücre → tablo iç içeliği
    blok: 30000,              // paragraf + tablo + resim
    parca: 200000,
    hucre: 50000,
    gezinti: 1000000,         // XML'de dolaşılan öğe (bilinmeyenler dahil)
    veriSatiri: 5000,         // şablon belgede çoğaltılan satır
    veriGezinti: 2000000,     // şablon verisinde alan aramaları
    stil: 1000,
    stilZinciri: 16,
    resim: 200,
    resimBayt: 10 * MiB,
    resimToplamBayt: 40 * MiB,
    resimKenar: 10000,
    resimPiksel: 40e6,
    resimToplamPiksel: 100e6,
    sure: 8000,               // okuma ve model kurma için ms
    sutun: 64,
    kaplama: 64,
    durak: 64,                // paragraf başına sekme durağı
    not: 500,
    bolum: 2000               // açık sayfa sonuyla ayrılan bölüm
  });

  const ILETI = {
    zip: 'Dosya açılamadı: bozuk ya da UDF değil.',
    'content-xml-yok': 'UDF paketinde belge içeriği (content.xml) yok.',
    xml: 'Belge içeriği okunamadı (XML bozuk).',
    dtd: 'Belge güvenlik nedeniyle gösterilmedi (izin verilmeyen XML tanımı).',
    boyut: 'Belge görüntüleyicinin sınırından büyük; dosyayı indirip UYAP Doküman Editörü ile açın.',
    belirsiz: 'Paket birden çok içerik dosyası taşıyor; güvenlik nedeniyle gösterilmedi.',
    desteklenmiyor: 'Tarayıcınız bu belgeyi açamıyor; Chrome’u güncelleyin.',
    sure: 'Belge zamanında hazırlanamadı; dosyayı indirip UYAP Doküman Editörü ile açın.',
    bos: 'Dosya boş.'
  };

  // kod: kısa neden; ayrinti yalnız teknik bilgidir (belge metni taşımaz), günlüğe yazılabilir.
  class UdfHatasi extends Error {
    constructor(kod, ayrinti = '') {
      super(ILETI[kod] || ILETI.zip);
      this.name = 'UdfHatasi';
      this.kod = kod;
      this.ayrinti = ayrinti;
    }
  }
  const hata = (kod, ayrinti) => new UdfHatasi(kod, ayrinti);
  const iptalMi = signal => !!(signal && signal.aborted);
  const iptalDenetle = signal => { if (iptalMi(signal)) throw new DOMException('Belge okuma iptal edildi.', 'AbortError'); };
  const bekle = () => new Promise(r => setTimeout(r, 0));

  // ---------------------------------------------------------------- zip
  const CRC_TABLO = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = CRC_TABLO[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const zipMi = u8 => u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;

  // Boyut ve CRC yalnız merkezî dizinden alınır: UYAP'ın Java tabanlı editörü DEFLATE girdileri veri tanımlayıcılı
  // yazar ve yerel başlıkta bu alanlar 0'dır.
  function zipGirdileri(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 22 || dv.getUint32(0, true) !== 0x04034b50) throw hata('zip', 'imza yok');
    let eocd = -1;
    for (let i = u8.length - 22, alt = Math.max(0, u8.length - 22 - 65535); i >= alt; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw hata('zip', 'dizin sonu yok');
    if (dv.getUint16(eocd + 4, true) || dv.getUint16(eocd + 6, true)) throw hata('zip', 'çok parçalı');
    const adet = dv.getUint16(eocd + 10, true);
    const mdBoyut = dv.getUint32(eocd + 12, true);
    const mdOfset = dv.getUint32(eocd + 16, true);
    if (adet === 0xffff || mdOfset === 0xffffffff || mdBoyut === 0xffffffff) throw hata('zip', 'ZIP64');
    if (adet > SINIR.girdi) throw hata('zip', 'girdi sınırı');
    if (mdOfset + mdBoyut > eocd) throw hata('zip', 'dizin taşıyor');
    const girdiler = [];
    let p = mdOfset;
    const son = mdOfset + mdBoyut;
    for (let k = 0; k < adet; k++) {
      if (p + 46 > son || dv.getUint32(p, true) !== 0x02014b50) throw hata('zip', 'dizin bozuk');
      const adUz = dv.getUint16(p + 28, true), ekUz = dv.getUint16(p + 30, true), notUz = dv.getUint16(p + 32, true);
      if (p + 46 + adUz + ekUz + notUz > son) throw hata('zip', 'dizin bozuk');
      const bayrak = dv.getUint16(p + 8, true);
      girdiler.push({
        bayrak, yontem: dv.getUint16(p + 10, true), crc: dv.getUint32(p + 16, true),
        sik: dv.getUint32(p + 20, true), acik: dv.getUint32(p + 24, true), yerel: dv.getUint32(p + 42, true),
        ad: new TextDecoder(bayrak & 0x800 ? 'utf-8' : 'windows-1252').decode(u8.subarray(p + 46, p + 46 + adUz)),
        mdOfset
      });
      p += 46 + adUz + ekUz + notUz;
    }
    return girdiler;
  }

  async function girdiAc(u8, g, ust, signal) {
    if (g.bayrak & 1) throw hata('zip', 'şifreli');
    if (g.acik > ust) throw hata('boyut', `beyan ${g.acik} bayt`);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (g.yerel + 30 > u8.length || dv.getUint32(g.yerel, true) !== 0x04034b50) throw hata('zip', 'yerel başlık yok');
    const bas = g.yerel + 30 + dv.getUint16(g.yerel + 26, true) + dv.getUint16(g.yerel + 28, true);
    if (bas + g.sik > Math.min(u8.length, g.mdOfset)) throw hata('zip', 'veri taşıyor');
    const ham = u8.subarray(bas, bas + g.sik);
    let cikti;
    if (g.yontem === 0) {
      if (g.sik !== g.acik) throw hata('zip', 'saklanmış girdi boyutu');
      cikti = ham.slice();
    } else if (g.yontem === 8) {
      // Açılan bayt sayılır: yalancı başlıkta beyanı ya da üst sınırı aşan akış durdurulur (zip bombası).
      const sinir = Math.min(g.acik, ust);
      const okuyucu = new Blob([ham]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const parcalar = [];
      let toplam = 0;
      try {
        for (;;) {
          if (iptalMi(signal)) { okuyucu.cancel().catch(() => {}); iptalDenetle(signal); }
          const { done, value } = await okuyucu.read();
          if (done) break;
          toplam += value.length;
          if (toplam > sinir) {
            okuyucu.cancel().catch(() => {});
            throw hata('boyut', 'açılan veri beyanı aştı');
          }
          parcalar.push(value);
        }
      } catch (e) {
        if (e instanceof UdfHatasi || (e && e.name === 'AbortError')) throw e;
        throw hata('zip', 'açılamadı');
      }
      if (toplam !== g.acik) throw hata('zip', 'boyut beyanla tutmuyor');
      cikti = new Uint8Array(toplam);
      let o = 0;
      for (const c of parcalar) { cikti.set(c, o); o += c.length; }
    } else throw hata('zip', `sıkıştırma ${g.yontem}`);
    if (crc32(cikti) !== g.crc) throw hata('zip', 'CRC-32');
    return cikti;
  }

  // ---------------------------------------------------------------- kodlama ve XML
  function metneCevir(b) {
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { metin: new TextDecoder('utf-8').decode(b), kodlama: 'utf-8' };
    if (b[0] === 0xff && b[1] === 0xfe) return { metin: new TextDecoder('utf-16le').decode(b), kodlama: 'utf-16le' };
    if (b[0] === 0xfe && b[1] === 0xff) return { metin: new TextDecoder('utf-16be').decode(b), kodlama: 'utf-16be' };
    const bas = new TextDecoder('windows-1252').decode(b.subarray(0, 256));
    const m = /^\s*<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._-]{1,40})["']/.exec(bas);
    for (const k of [m && m[1], 'utf-8', 'windows-1254']) {
      if (!k) continue;
      try { return { metin: new TextDecoder(k, { fatal: true }).decode(b), kodlama: k.toLowerCase() }; } catch { /* sonraki aday */ }
    }
    return { metin: new TextDecoder('windows-1254').decode(b), kodlama: 'windows-1254' };
  }

  // Sıkıştırılmamış UDF: zip yerine doğrudan content.xml (Drive'da "XML" diye görünen dosyalar).
  function xmlMi(u8) {
    if ((u8[0] === 0xff && u8[1] === 0xfe) || (u8[0] === 0xfe && u8[1] === 0xff)) return true;
    let i = u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf ? 3 : 0;
    while (i < u8.length && i < 4096 && (u8[i] === 0x20 || u8[i] === 0x09 || u8[i] === 0x0a || u8[i] === 0x0d)) i++;
    return u8[i] === 0x3c;
  }

  // DTD ve varlık tanımı meşru UDF'de yoktur; tarayıcının XML çözücüsü iç varlıkları açtığı için önsözde görülen
  // tanım baştan reddedilir. Yalnız önsöze bakılır: metin havuzunda "<!DOCTYPE" yazan belge reddedilmez.
  function xmlCozumle(metin) {
    // Önsözdeki yorum ve işleme talimatları atlanır; içlerindeki "<harf" denetimi erken bitirmesin.
    const atla = /\s*(?:<!--[\s\S]*?-->|<\?[\s\S]*?\?>)/y;
    let i = metin.charCodeAt(0) === 0xfeff ? 1 : 0;
    atla.lastIndex = i;
    while (atla.exec(metin)) i = atla.lastIndex;
    // Aradaki bütün boşluğu kendisi tüketen yapışkan ifade: uzun boşlukla atlatılamaz.
    const dtd = /\s*<!(?:DOCTYPE|ENTITY)/iy;
    dtd.lastIndex = i;
    if (dtd.test(metin)) throw hata('dtd');
    const doc = new DOMParser().parseFromString(metin, 'application/xml');
    if (doc.getElementsByTagNameNS('*', 'parsererror').length) throw hata('xml', 'parsererror');
    if (doc.doctype) throw hata('dtd');   // önsöz denetimi nasıl atlatılırsa atlatılsın
    return doc;
  }

  const ad = el => (el.localName || '').toLowerCase();
  const cocuklar = (el, a) => Array.from(el.children).filter(c => ad(c) === a);
  const cocuk = (el, a) => { if (el) for (const c of el.children) if (ad(c) === a) return c; return null; };
  function oz(el, a) {
    if (!el || !el.getAttribute) return null;
    const v = el.getAttribute(a);
    if (v !== null) return v;
    const k = a.toLowerCase();
    for (const x of el.attributes) if (x.localName.toLowerCase() === k) return x.value;
    return null;
  }
  const tamsayi = v => (/^-?\d{1,10}$/.test(String(v == null ? '' : v).trim()) ? Number(String(v).trim()) : NaN);
  // Editör Java double değerlerini 15+ ondalık basamakla da yazar. Uzunluğu sınırlı gramer bu değerleri korur;
  // NaN/Infinity ve keyfi metin kabul edilmez.
  const sayi = v => {
    const text = String(v == null ? '' : v).trim();
    if (text.length > 64 || !/^-?\d{1,9}(\.\d{1,18})?([eE][+-]?\d{1,3})?$/.test(text)) return NaN;
    const n = Number(text); return Number.isFinite(n) ? n : NaN;
  };
  const kistir = (v, a, b) => Math.min(b, Math.max(a, v));
  const mantik = v => { const s = String(v == null ? '' : v).trim().toLowerCase(); return s === 'true' || s === '1' ? true : s === 'false' || s === '0' ? false : undefined; };
  const kisa = (v, n) => String(v == null ? '' : v).slice(0, n);

  // Java rengi işaretli 32 bit ARGB tamsayıdır (-16777216 siyah); işaretsiz yazım da görülür. Alfa 0 saydamdır.
  function renk(v) {
    const n = tamsayi(v);
    if (!Number.isFinite(n) || n < -2147483648 || n > 0xffffffff) return null;
    const u = n >>> 0;
    return [(u >>> 16) & 255, (u >>> 8) & 255, u & 255, (u >>> 24) & 255];
  }

  // ---------------------------------------------------------------- resim
  function resimBaslik(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52) {
      return { tur: 'image/png', g: dv.getUint32(16), y: dv.getUint32(20) };
    }
    if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { tur: 'image/gif', g: dv.getUint16(6, true), y: dv.getUint16(8, true) };
    if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) {
      const eski = dv.getUint32(14, true) === 12;   // OS/2 başlığı: 16 bitlik boyutlar
      return eski ? { tur: 'image/bmp', g: dv.getUint16(18, true), y: dv.getUint16(20, true) }
        : { tur: 'image/bmp', g: Math.abs(dv.getInt32(18, true)), y: Math.abs(dv.getInt32(22, true)) };
    }
    if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) { o++; continue; }
        const m = b[o + 1];
        if (m === 0xff) { o++; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { tur: 'image/jpeg', y: (b[o + 5] << 8) | b[o + 6], g: (b[o + 7] << 8) | b[o + 8] };
        o += 2 + ((b[o + 2] << 8) | b[o + 3]);
      }
    }
    return null;
  }

  // Yalnız sıkı base64 ve bilinen raster imzası kabul edilir; boyut başlıktan okunur, çok büyük resim çözülmez.
  function resimBilgi(veri, s) {
    if (++s.resimSayisi > SINIR.resim) return { red: 'sinir' };
    let v = String(veri == null ? '' : veri);
    if (/^\s*data:/i.test(v)) { const i = v.indexOf(','); v = i > 0 ? v.slice(i + 1) : ''; }
    v = v.replace(/\s+/g, '');
    if (!v || v.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return { red: 'bicim' };
    const tahmin = v.length / 4 * 3;
    if (tahmin > SINIR.resimBayt || s.resimBayt + tahmin > SINIR.resimToplamBayt) return { red: 'buyuk' };
    let bayt;
    try {
      const ikili = atob(v);
      bayt = new Uint8Array(ikili.length);
      for (let i = 0; i < ikili.length; i++) bayt[i] = ikili.charCodeAt(i);
    } catch { return { red: 'bicim' }; }
    s.resimBayt += bayt.length;
    const b = resimBaslik(bayt);
    if (!b) return { red: 'bicim' };
    if (!(b.g > 0 && b.y > 0) || b.g > SINIR.resimKenar || b.y > SINIR.resimKenar || b.g * b.y > SINIR.resimPiksel
      || s.resimPiksel + b.g * b.y > SINIR.resimToplamPiksel) return { red: 'buyuk', g: b.g, y: b.y };
    s.resimPiksel += b.g * b.y;
    // Baytlar tek bir Blob'da tutulur (gösterim ve arka plan karosu ondan okunur; ayrı bir dizi kopyası kalmaz).
    return { tur: b.tur, g: b.g, y: b.y, blob: new Blob([bayt], { type: b.tur }) };
  }

  // width/height punto; biri yoksa oran korunur, hiçbiri yoksa UDE'nin kuralıyla 1 piksel = 1 punto alınır.
  // Metin alanına sığdırılır.
  function resimOlcu(el, r, enCok, boyCok) {
    let en = sayi(oz(el, 'width')), boy = sayi(oz(el, 'height'));
    const gecerli = v => Number.isFinite(v) && v > 0;
    const dEn = r.g > 0 ? r.g : 72, dBoy = r.y > 0 ? r.y : 72;
    if (!gecerli(en) && !gecerli(boy)) { en = dEn; boy = dBoy; }
    else if (!gecerli(en)) en = boy * dEn / dBoy;
    else if (!gecerli(boy)) boy = en * dBoy / dEn;
    const k = Math.min(1, enCok / en, boyCok / boy);
    return { en: Math.max(1, en * k), boy: Math.max(1, boy * k) };
  }

  // ---------------------------------------------------------------- stil
  const YAZI_VARSAYILAN = Object.freeze({
    aile: 'Times New Roman', punto: 12, kalin: false, italik: false, alti: false, ustu: false,
    ustSimge: false, altSimge: false, renk: null, zemin: null
  });

  function yaziOz(el) {
    const o = {};
    const aile = oz(el, 'family');
    if (aile) o.aile = aile;
    const p = sayi(oz(el, 'size'));
    if (Number.isFinite(p) && p >= 1 && p <= 400) o.punto = kistir(p, 4, 96);
    for (const [k, a] of [['kalin', 'bold'], ['italik', 'italic'], ['alti', 'underline'], ['ustu', 'strikethrough'],
      ['ustSimge', 'superscript'], ['altSimge', 'subscript']]) {
      const v = mantik(oz(el, a));
      if (v !== undefined) o[k] = v;
    }
    const fg = renk(oz(el, 'foreground'));
    if (fg) o.renk = fg;
    const bg = renk(oz(el, 'background'));
    if (bg) o.zemin = bg;
    return o;
  }

  function stilCozucu(stylesEl) {
    const tablo = new Map();
    let n = 0;
    if (stylesEl) {
      for (const s of stylesEl.children) {
        if (ad(s) !== 'style') continue;
        if (++n > SINIR.stil) break;
        const isim = String(oz(s, 'name') || '').toLowerCase();
        if (!isim || tablo.has(isim)) continue;
        tablo.set(isim, { ust: String(oz(s, 'resolver') || oz(s, 'parent') || '').toLowerCase(), yazi: yaziOz(s) });
      }
    }
    const onbellek = new Map();
    // Zincir en üstten alta doğru uygulanır; döngü ve tanımsız üst güvenle durdurulur. "default" Swing arayüzünün
    // stilidir (Dialog 12), metne taban yapılmaz.
    function zincir(isim) {
      const k = String(isim || '').toLowerCase();
      if (!k) return null;
      if (onbellek.has(k)) return onbellek.get(k);
      const halkalar = [];
      const gorulen = new Set();
      for (let a = k; a && halkalar.length < SINIR.stilZinciri && !gorulen.has(a);) {
        gorulen.add(a);
        const s = tablo.get(a);
        if (!s) break;
        if (a !== 'default') halkalar.push(s.yazi);
        a = s.ust;
      }
      const sonuc = halkalar.length ? Object.assign({}, ...halkalar.reverse()) : null;
      onbellek.set(k, sonuc);
      return sonuc;
    }
    return { zincir };
  }

  // ---------------------------------------------------------------- şablon + veri
  // UYAP'ın ürettiği form evrakında havuzda alan adları durur; değerler kökteki <data> ağacındadır.
  // Kapsam: aranacak düğümler + dış kapsam. Tekrarlı satır (dataRow) örneklerinin içine yalnız o satırın kapsamında inilir.
  const veriSatiriMi = el => String(oz(el, 'rowType') || '').toLowerCase() === 'datarow' && !!oz(el, 'rowName');

  function veriBaglayici(s) {
    function tara(dugumler, ziyaret) {
      const yigin = [...dugumler].reverse();
      while (yigin.length) {
        if (++s.veriGezinti > SINIR.veriGezinti) { s.kesildi = s.kesildi || 'oge'; return; }
        const el = yigin.pop();
        if (veriSatiriMi(el)) { ziyaret(el, true); continue; }
        if (ziyaret(el, false) === false) continue;
        for (let i = el.children.length - 1; i >= 0; i--) yigin.push(el.children[i]);
      }
    }
    function yapraklar(dugumler, anahtar) {
      const degerler = [];
      tara(dugumler, (el, satir) => {
        if (satir) return;
        if (!el.children.length && ad(el) === anahtar) {
          const t = el.textContent;
          if (t.trim() && !degerler.includes(t)) degerler.push(t);
        }
      });
      return degerler;
    }
    function gruplar(dugumler, anahtar) {
      const bulunan = [];
      tara(dugumler, (el, satir) => {
        if (satir) return;
        if (ad(el) === anahtar) { bulunan.push(el); return false; }
      });
      return bulunan;
    }
    function coz(kapsam, alan, grup) {
      for (let k = kapsam; k; k = k.ust) {
        if (grup) {
          const g = gruplar(k.dugumler, grup);
          if (!g.length) continue;
          const d = alan ? yapraklar(g.flatMap(x => [...x.children]), alan) : [];
          return { grupVar: true, grupDolu: g.some(x => x.textContent.trim()), deger: d.length ? d.join('\n') : undefined };
        }
        const d = yapraklar(k.dugumler, alan);
        if (d.length) return { deger: d.join('\n') };
      }
      return { grupVar: false };
    }
    function satirOrnekleri(kapsam, satirAdi) {
      for (let k = kapsam; k; k = k.ust) {
        const bulunan = [];
        tara(k.dugumler, (el, satir) => { if (satir && String(oz(el, 'rowName')).toLowerCase() === satirAdi) bulunan.push(el); });
        if (bulunan.length) return bulunan;
      }
      return [];
    }
    return { coz, satirOrnekleri };
  }

  // Alan değerindeki HTML kalıntısı düz metne çevrilir; sonuç yalnız metin düğümü olarak kullanılır.
  const htmlsiz = v => v.replace(/\r\n?/g, '\n').replace(/<\s*br\b[^>]*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|tr|table|li)\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .split('\n').map(x => x.trim()).filter(Boolean).join('\n');

  // ---------------------------------------------------------------- listeler
  // NumberType: NUMBER_TYPE_<NUMBER|CHAR_SMALL|CHAR_BIG|ROMAN_SMALL|ROMAN_BIG>_<DOT|PARANTHESE|D_PARANTHESE|TRE>.
  // "PARENTHESIS" yazımı da tanınır. Harfli liste 29 harfli Türk alfabesiyle sayılır; z'den sonra aa, bb…
  const TURK_ABECE = 'abcçdefgğhıijklmnoöprsştuüvyz';
  function harfNumara(n) {
    const k = (n - 1) % TURK_ABECE.length;
    return TURK_ABECE[k].repeat(Math.min(10, Math.floor((n - 1) / TURK_ABECE.length) + 1));
  }
  function romen(n) {
    const t = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let s = '';
    for (const [d, h] of t) while (n >= d) { s += h; n -= d; }
    return s;
  }
  function numaraYaz(n, tur) {
    const t = String(tur || '').toUpperCase().replace(/PARENTHESIS/g, 'PARANTHESE');
    const m = /(NUMBER|CHAR_SMALL|CHAR_BIG|ROMAN_SMALL|ROMAN_BIG)_(D_PARANTHESE|PARANTHESE|DOT|TRE)$/.exec(t);
    const govdeTur = m ? m[1] : 'NUMBER', ek = m ? m[2] : 'DOT';
    let g;
    if (govdeTur === 'CHAR_SMALL') g = harfNumara(n);
    else if (govdeTur === 'CHAR_BIG') g = harfNumara(n).toLocaleUpperCase('tr');
    else if (govdeTur === 'ROMAN_SMALL') g = romen(Math.min(n, 3999));
    else if (govdeTur === 'ROMAN_BIG') g = romen(Math.min(n, 3999)).toUpperCase();
    else g = String(n);
    return ek === 'D_PARANTHESE' ? `(${g})` : ek === 'PARANTHESE' ? `${g})` : ek === 'TRE' ? `${g}-` : `${g}.`;
  }
  const MADDE_ISARETI = { ELLIPSE: '•', RECTANGLE: '▪', RECTANGLE_D: '▫', ARROW: '➢', DIAMOND: '◆', DIAMOND_2: '◊', TRIANGLE: '►' };
  function maddeIsareti(tur) {
    const m = /BULLET_TYPE_([A-Z_0-9]+)$/.exec(String(tur || '').toUpperCase());
    return (m && MADDE_ISARETI[m[1]]) || '•';
  }
  // ListLevel ≥ 2 olan kalemde Editör NumberType/BulletType'a bakmaz; SecListTypeLevel<N> ya da varsayılan kullanılır.
  const ALT_NUMARA = { 2: 'NUMBER_TYPE_CHAR_SMALL_DOT', 3: 'NUMBER_TYPE_ROMAN_SMALL_DOT', 4: 'NUMBER_TYPE_NUMBER_D_PARANTHESE', 5: 'NUMBER_TYPE_CHAR_SMALL_D_PARANTHESE', 6: 'NUMBER_TYPE_ROMAN_SMALL_D_PARANTHESE' };
  const ALT_MADDE = { 2: 'BULLET_TYPE_RECTANGLE', 3: 'BULLET_TYPE_RECTANGLE_D' };

  // ---------------------------------------------------------------- sayfa
  // mediaSizeName kodları Editör motorunda ölçülmüş tabloya göre (şartname §4). paperOrientation: 1 dikey, 0 ve 2 yatay.
  const KAGIT = {
    1: [595.28, 841.89], A4: [595.28, 841.89], 2: [419.53, 595.28], A5: [419.53, 595.28], 3: [612, 792], LETTER: [612, 792],
    4: [515.91, 728.5], B5: [515.91, 728.5], 5: [612, 1008], LEGAL: [612, 1008], 6: [522, 756], EXECUTIVE: [522, 756]
  };
  function sayfaAyari(props) {
    const pf = cocuk(props, 'pageformat');
    const kod = String(oz(pf, 'mediaSizeName') || '1').trim().toUpperCase();
    let [en, boy] = KAGIT[kod] || KAGIT[1];
    const yon = String(oz(pf, 'paperOrientation') || '1').trim().toLowerCase();
    if (yon === '0' || yon === '2' || yon === 'landscape') [en, boy] = [boy, en];
    const kenar = (a, vars, olcu) => { const v = sayi(oz(pf, a)); return Number.isFinite(v) && v >= 0 ? Math.min(v, olcu * 0.4) : vars; };
    const pay = a => { const v = sayi(oz(pf, a)); return Number.isFinite(v) && v >= 0 ? Math.min(v, 200) : null; };
    return {
      en, boy, sol: kenar('leftMargin', 42.52, en), sag: kenar('rightMargin', 28.35, en),
      ust: kenar('topMargin', 42.52, boy), alt: kenar('bottomMargin', 14.17, boy),
      ustPay: pay('headerFOffset'), altPay: pay('footerFOffset')
    };
  }

  // pageNumber-spec="BSP32_<n>" bit kümesi: 8 numara göster, 32 ortala, 64 sağa (ikisi yoksa sola), 2048 "sayfa/toplam".
  function sayfaNoAyari(el) {
    const m = /^BSP\d*_(\d{1,9})$/i.exec(String(oz(el, 'pageNumber-spec') || '').trim());
    if (!m) return null;
    const n = Number(m[1]);
    if (!(n & 8)) return null;
    const p = sayi(oz(el, 'pageNumber-fontSize'));
    return {
      hiza: n & 32 ? 'center' : n & 64 ? 'right' : 'left', toplam: !!(n & 2048),
      on: kisa(oz(el, 'pageNumber-foreStr'), 100), son: kisa(oz(el, 'pageNumber-afterStr'), 100),
      ayrac: oz(el, 'pageNumber-seperator') == null ? '/' : kisa(oz(el, 'pageNumber-seperator'), 20),
      baslangic: tamsayi(oz(el, 'pageNumber-pageStartNumStr')) > 0 ? tamsayi(oz(el, 'pageNumber-pageStartNumStr')) : 1,
      stil: {
        aile: kisa(oz(el, 'pageNumber-fontFace'), 64) || 'Times New Roman', punto: Number.isFinite(p) ? kistir(p, 4, 72) : 11,
        kalin: mantik(oz(el, 'pageNumber-fontBold')) === true, italik: mantik(oz(el, 'pageNumber-fontItalic')) === true,
        renk: renk(oz(el, 'pageNumber-color'))
      }
    };
  }

  // ---------------------------------------------------------------- notlar, özellikler, imza
  const xmlVarlikCoz = s => s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos);/gi, (m, v) => {
    const k = v.toLowerCase();
    if (k[0] === '#') {
      const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k];
  });

  // documentproperties.xml Java Properties XML'idir ve DOCTYPE taşır; DOMParser'a verilmeden düzenli ifadeyle okunur.
  function ozellikleriOku(bayt) {
    const { metin } = metneCevir(bayt);
    const d = {};
    const re = /<entry\s+key\s*=\s*["']([^"'<>]{1,64})["']\s*>([^<]{0,1000})<\/entry>/g;
    let m, n = 0;
    while ((m = re.exec(metin)) && n++ < 100) d[m[1].toLowerCase()] = xmlVarlikCoz(m[2]).trim();
    return { dogrulamaKodu: d.uyapdogrulamakodu || null, sicil: d.uyapsicil || null };
  }

  // comments.xml: <comment strtOffs endOffs time usr> + paragraflar; ofsetler ana belgenin havuzuna, notun metni
  // kendi havuzuna bağlıdır.
  function notlariOku(bayt) {
    const doc = xmlCozumle(metneCevir(bayt).metin);
    const kok = doc.documentElement;
    const havuz = (cocuk(kok, 'content') || { textContent: '' }).textContent;
    const govde = cocuk(kok, 'elements');
    const notlar = [];
    if (!govde) return notlar;
    for (const c of govde.children) {
      if (ad(c) !== 'comment') continue;
      if (notlar.length >= SINIR.not) break;
      const bas = tamsayi(oz(c, 'strtOffs')), son = tamsayi(oz(c, 'endOffs'));
      if (!Number.isInteger(bas) || !Number.isInteger(son) || bas < 0 || son <= bas) continue;
      let metin = '';
      for (const y of c.getElementsByTagName('*')) {
        const a = tamsayi(oz(y, 'startOffset')), u = tamsayi(oz(y, 'length'));
        if (Number.isInteger(a) && Number.isInteger(u) && a >= 0 && u > 0) metin += havuz.slice(a, a + u);
        if (metin.length > 20000) break;
      }
      const zaman = /^\d{1,15}$/.test(String(oz(c, 'time') || '').trim()) ? Number(oz(c, 'time')) : null;
      notlar.push({
        sira: notlar.length + 1, bas, son, metin: metin.replace(/\u200b/g, '').replace(/\s+$/, '').slice(0, 20000),
        kim: kisa(oz(c, 'usr'), 200).trim(), zaman
      });
    }
    return notlar;
  }

  // sign.sgn ayrık CMS imzasıdır; imzalı öznitelikteki messageDigest ham content.xml baytlarının özetidir.
  // Burada yalnız bu özet karşılaştırılır; sertifika ve imza doğrulanmaz.
  const OID_MESAJ_OZETI = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x04];
  function derUzunluk(b, i) {
    const ilk = b[i];
    if (ilk < 0x80) return { uz: ilk, sonraki: i + 1 };
    const n = ilk & 0x7f;
    if (n < 1 || n > 3) return null;
    let uz = 0;
    for (let k = 1; k <= n; k++) uz = uz * 256 + b[i + k];
    return { uz, sonraki: i + 1 + n };
  }
  function mesajOzetleri(b) {
    const bulunan = [];
    for (let i = 0; i + OID_MESAJ_OZETI.length < b.length && bulunan.length < 8; i++) {
      let esit = true;
      for (let k = 0; k < OID_MESAJ_OZETI.length; k++) if (b[i + k] !== OID_MESAJ_OZETI[k]) { esit = false; break; }
      if (!esit) continue;
      let j = i + OID_MESAJ_OZETI.length;
      if (b[j] !== 0x31) continue;
      const kume = derUzunluk(b, j + 1);
      if (!kume) continue;
      j = kume.sonraki;
      if (b[j] !== 0x04) continue;
      const dize = derUzunluk(b, j + 1);
      if (!dize || dize.sonraki + dize.uz > b.length) continue;
      bulunan.push(b.subarray(dize.sonraki, dize.sonraki + dize.uz));
    }
    return bulunan;
  }
  const OZET_ALGORITMASI = { 20: 'SHA-1', 32: 'SHA-256', 48: 'SHA-384', 64: 'SHA-512' };
  async function imzaDenetle(icerik, imza) {
    const sonuc = { var: true, durum: 'bilinmiyor' };
    try {
      const ozetler = mesajOzetleri(imza);
      const subtle = globalThis.crypto && globalThis.crypto.subtle;
      if (!ozetler.length || !subtle) return sonuc;
      // Zaman damgası (ES-T) ve karşı imza kendi messageDigest'lerini taşır; içerikle tutan bir özet yeter.
      let tutan = null, tutmayan = null;
      for (const o of ozetler) {
        const alg = OZET_ALGORITMASI[o.length];
        if (!alg) continue;
        const h = new Uint8Array(await subtle.digest(alg, icerik));
        let ayni = h.length === o.length;
        for (let i = 0; ayni && i < h.length; i++) if (h[i] !== o[i]) ayni = false;
        if (ayni) { tutan = alg; break; }
        if (!tutmayan) tutmayan = alg;
      }
      if (tutan) { sonuc.durum = 'tutarli'; sonuc.algoritma = tutan; }
      else if (tutmayan) { sonuc.durum = 'tutarsiz'; sonuc.algoritma = tutmayan; }
    } catch { /* bilinmiyor */ }
    return sonuc;
  }

  // ---------------------------------------------------------------- model
  const HIZA = { 0: 'left', left: 'left', 1: 'center', center: 'center', 2: 'right', right: 'right', 3: 'justify', justify: 'justify', justified: 'justify' };
  function hizaOku(v) {
    const s = String(v == null ? '0' : v).trim().toLowerCase();
    if (HIZA[s]) return HIZA[s];
    const n = sayi(s);
    return Number.isFinite(n) ? HIZA[String(Math.round(n))] || 'left' : 'left';
  }

  function modelKur(doc, { baslangic, signal, notlar = [] }) {
    const kok = doc.documentElement;
    const havuz = (cocuk(kok, 'content') || { textContent: '' }).textContent;
    const govde = cocuk(kok, 'elements');
    if (!govde) throw hata('xml', 'elements yok');
    const props = cocuk(kok, 'properties');
    const veri = cocuk(kok, 'data');
    const sayfa = sayfaAyari(props);
    const metinEn = Math.max(72, sayfa.en - sayfa.sol - sayfa.sag);
    const metinBoy = Math.max(72, sayfa.boy - sayfa.ust - sayfa.alt);
    const { zincir } = stilCozucu(cocuk(kok, 'styles'));
    const taban = Object.freeze({ ...YAZI_VARSAYILAN, ...(zincir(oz(govde, 'resolver') || 'hvl-default') || zincir('hvl-default') || {}) });
    const s = {
      kokAdi: ad(kok), paragraf: 0, tablo: 0, resimSayisi: 0, resimBayt: 0, resimPiksel: 0, resimReddi: 0, sayfaSonu: 0,
      blok: 0, parca: 0, hucre: 0, gezinti: 0, veriSatiri: 0, veriGezinti: 0, ofsetSorunu: 0, bilinmeyen: 0, kesildi: null,
      header: null, footer: null, dur: false
    };
    const bag = veri ? veriBaglayici(s) : null;
    const kokKapsam = veri ? { dugumler: [...veri.children], ust: null } : null;
    const listeler = new Map();   // ListId (ya da adsız liste) → düzey sayaçları
    let oncekiListe = null;
    const notAraliklari = veri ? [] : notlar.filter(n => n.bas < havuz.length).sort((a, b) => a.bas - b.bas);

    const zamanDenetle = () => {
      if ((s.gezinti & 255) !== 0) return;
      iptalDenetle(signal);
      if (performance.now() - baslangic > SINIR.sure) { s.kesildi = s.kesildi || 'sure'; s.dur = true; }
    };

    const aralik = el => {
      const a = tamsayi(oz(el, 'startOffset')), u = tamsayi(oz(el, 'length'));
      if (u === 0 && a >= 0) return null;   // UDE boş parça da yazar (length="0")
      if (!Number.isInteger(a) || !Number.isInteger(u) || a < 0 || u <= 0 || a >= havuz.length) { s.ofsetSorunu++; return null; }
      if (a + u > havuz.length) s.ofsetSorunu++;
      return { a, b: Math.min(a + u, havuz.length) };
    };

    // Şablon belgede parçanın metni: alan ise veriden, gruba bağlı düz metinse grup doluysa. Yer tutucu adı hiç gösterilmez.
    function sablonMetni(c, kapsam) {
      const r = aralik(c);
      const ham = r ? havuz.slice(r.a, r.b) : '';
      const alan = String(oz(c, 'fieldName') || '').toLowerCase();
      const grup = String(oz(c, 'fieldGroupName') || '').toLowerCase();
      const sonSatir = ham.endsWith('\n') ? '\n' : '';
      if (!alan) {
        if (!grup) return ham;
        return bag.coz(kapsam, '', grup).grupDolu ? ham : sonSatir;
      }
      if (alan === 'auto') return sonSatir;
      if (alan === 'eol') return (!grup || bag.coz(kapsam, 'eol', grup).grupVar ? '\n' : '') + sonSatir;
      if (alan === 'ceol') {
        const x = grup ? bag.coz(kapsam, 'ceol', grup) : {};
        return (String(x.deger || '').trim().toLowerCase() === 'true' ? '\n' : '') + sonSatir;
      }
      const x = bag.coz(kapsam, alan, grup);
      return (x.deger === undefined ? '' : htmlsiz(x.deger)) + sonSatir;
    }

    // Modele eklenen her parça (sekme ve not bölmeleri dahil) parça sınırına sayılır; süre ya da öğe sınırı aşılınca durulur.
    // Süre dolması kesilme nedeninden ayrı tutulur: önce 'derinlik' ya da 'veri-satiri' yazılmış olsa da durulur.
    const durdu = () => s.dur || s.kesildi === 'oge' || s.kesildi === 'sure';
    function parcaEkle(cikti, x) {
      if (durdu()) return false;
      if (++s.parca > SINIR.parca) { s.kesildi = s.kesildi || 'oge'; return false; }
      cikti.push(x);
      return true;
    }
    // Yaprağın metni not sınırlarında ve sekmelerde parçalanır. U+200B (boş paragraf işareti) atılır.
    function metinEkle(cikti, yazi, stil, notlarIcin) {
      const t = yazi.replace(/\u200b/g, '');
      for (let bas = 0; ;) {
        const j = t.indexOf('\t', bas);
        const k = j < 0 ? t.slice(bas) : t.slice(bas, j);
        if (k && !parcaEkle(cikti, { t: 'metin', yazi: k, stil, notlar: notlarIcin })) return;
        if (j < 0 || !parcaEkle(cikti, { t: 'sekme', stil, notlar: notlarIcin })) return;
        bas = j + 1;
      }
    }
    function yaprakEkle(cikti, c, kapsam, stil, bosIse) {
      if (kapsam) { metinEkle(cikti, sablonMetni(c, kapsam), stil, null); return; }
      const r = aralik(c);
      if (!r) { if (bosIse) metinEkle(cikti, bosIse, stil, null); return; }
      if (!notAraliklari.length) { metinEkle(cikti, havuz.slice(r.a, r.b), stil, null); return; }
      const sinirlar = new Set([r.a, r.b]);
      const ilgili = [];
      for (const n of notAraliklari) {
        if (n.bas >= r.b) break;
        if (n.son <= r.a) continue;
        ilgili.push(n);
        if (n.bas > r.a) sinirlar.add(n.bas);
        if (n.son < r.b) sinirlar.add(n.son);
      }
      if (!ilgili.length) { metinEkle(cikti, havuz.slice(r.a, r.b), stil, null); return; }
      const sirali = [...sinirlar].sort((x, y) => x - y);
      for (let i = 0; i + 1 < sirali.length && !durdu(); i++) {
        const x = sirali[i], y = sirali[i + 1];
        const ns = ilgili.filter(n => n.bas <= x && n.son >= y).map(n => n.sira);
        metinEkle(cikti, havuz.slice(x, y), stil, ns.length ? ns : null);
      }
    }

    function listeBilgisi(p, pStil) {
      const madde = mantik(oz(p, 'Bulleted')) === true, numara = mantik(oz(p, 'Numbered')) === true;
      if (!madde && !numara) { oncekiListe = null; return null; }
      const tur = madde ? 'madde' : 'numara';
      const ham = tamsayi(oz(p, 'ListLevel'));
      const duzey = Number.isFinite(ham) && ham >= 1 ? Math.min(ham, 9) : 1;
      const id = oz(p, 'ListId');
      // ListId yoksa ardışık aynı türdeki maddeler tek liste sayılır.
      const anahtar = id != null && id !== '' ? 'id:' + id : (oncekiListe && oncekiListe.startsWith('anon:' + tur) ? oncekiListe : `anon:${tur}:${s.paragraf}`);
      oncekiListe = anahtar;
      if (!listeler.has(anahtar)) listeler.set(anahtar, new Array(11).fill(0));
      const sayac = listeler.get(anahtar);
      const verilen = tamsayi(oz(p, 'NumberSetted'));
      if (Number.isFinite(verilen) && verilen >= 0) sayac[duzey] = Math.min(verilen, 1e6);
      sayac[duzey]++;
      for (let i = duzey + 1; i < sayac.length; i++) sayac[i] = 0;
      let turAdi;
      if (duzey === 1) turAdi = oz(p, madde ? 'BulletType' : 'NumberType') || oz(p, 'SecListTypeLevel1');
      else turAdi = oz(p, 'SecListTypeLevel' + duzey) || (madde ? ALT_MADDE[duzey] : ALT_NUMARA[duzey]);
      turAdi = String(turAdi || (madde ? 'BULLET_TYPE_ELLIPSE' : 'NUMBER_TYPE_NUMBER_DOT')).toUpperCase();
      const maddeMi = /^BULLET_TYPE/.test(turAdi) || (madde && !/^NUMBER_TYPE/.test(turAdi));
      return { tur: maddeMi ? 'madde' : 'numara', duzey, isaret: maddeMi ? maddeIsareti(turAdi) : numaraYaz(sayac[duzey], turAdi), stil: pStil };
    }

    function stilIcin(el, tabanStil) {
      const r = oz(el, 'resolver') || oz(el, 'style');
      const z = r ? zincir(r) : null;
      const temel = z ? { ...taban, ...z } : tabanStil;
      const kendi = yaziOz(el);
      return Object.keys(kendi).length ? { ...temel, ...kendi } : temel;
    }

    function durakOku(p) {
      return String(oz(p, 'TabSet') || '').split(',').slice(0, SINIR.durak).map(x => {
        const [k, h, o] = x.split(':');
        const hiza = tamsayi(h), oncu = tamsayi(o);
        return { konum: sayi(k), hiza: [0, 1, 2, 4, 5].includes(hiza) ? hiza : 0, oncu: oncu >= 0 && oncu <= 5 ? oncu : 0 };
      }).filter(d => Number.isFinite(d.konum) && d.konum > 0 && d.konum <= 4000).sort((a, b) => a.konum - b.konum);
    }

    function paragraf(p, kapsam) {
      s.paragraf++;
      const pStil = stilIcin(p, taban);
      const liste = listeBilgisi(p, pStil);
      const sol = kistir(sayi(oz(p, 'LeftIndent')) || 0, 0, metinEn * 0.9);
      const asili = kistir(sayi(oz(p, 'Hanging')) || 0, 0, metinEn * 0.9);
      const ilk = kistir(sayi(oz(p, 'FirstLineIndent')) || 0, -sol, metinEn * 0.9);
      const bosluk = (...adlar) => { for (const a of adlar) { const v = sayi(oz(p, a)); if (Number.isFinite(v)) return kistir(v, 0, 144); } return 0; };
      const model = {
        t: 'p', hiza: hizaOku(oz(p, 'Alignment')),
        sol, asili, ilk, sag: kistir(sayi(oz(p, 'RightIndent')) || sayi(oz(p, 'RightIdent')) || 0, 0, metinEn * 0.9),
        once: bosluk('SpaceAbove', 'SpaceBefore'), sonra: bosluk('SpaceBelow', 'SpaceAfter'),
        aralik: kistir(sayi(oz(p, 'LineSpacing')) || 0, 0, 3),
        duraklar: durakOku(p), liste, stil: pStil, parcalar: []
      };
      const icTablolar = [];
      const yapraklar = [...p.children];
      for (let i = 0; i < yapraklar.length; i++) {
        const c = yapraklar[i];
        if (++s.gezinti > SINIR.gezinti) { s.kesildi = s.kesildi || 'oge'; break; }
        zamanDenetle();
        if (durdu()) break;
        const a = ad(c);
        if (a === 'table') { icTablolar.push(c); continue; }
        if (a === 'tab') { parcaEkle(model.parcalar, { t: 'sekme', stil: stilIcin(c, pStil), notlar: null }); continue; }
        if (a === 'br' || a === 'linebreak' || a === 'newline') { parcaEkle(model.parcalar, { t: 'metin', yazi: '\n', stil: pStil, notlar: null }); continue; }
        if (a === 'image' || a === 'barcode') {
          const r = resimBilgi(oz(c, 'imageData') || oz(c, 'data'), s);
          if (r.red) s.resimReddi++;
          parcaEkle(model.parcalar, { t: 'resim', r, ...resimOlcu(c, r, metinEn, metinBoy) });
          continue;
        }
        if (a === 'space') { yaprakEkle(model.parcalar, c, kapsam, stilIcin(c, pStil), ' '); continue; }
        // content, field ve adı bilinmeyen ama havuzu gösteren öğeler metindir; böylece metin kaybolmaz. Yaprakları
        // saran tanınmayan öğenin içine inilir.
        if (a === 'content' || a === 'field' || oz(c, 'startOffset') != null) {
          if (a !== 'content' && a !== 'field') s.bilinmeyen++;
          yaprakEkle(model.parcalar, c, kapsam, stilIcin(c, pStil));
        } else if (c.children.length) {
          s.bilinmeyen++;
          if (yapraklar.length + c.children.length > SINIR.parca) { s.kesildi = s.kesildi || 'oge'; break; }
          // Büyük diziyi tek seferde yaymak yığını taşırır; dilimlerle eklenir.
          const ek = Array.from(c.children);
          for (let j = 0; j < ek.length; j += 10000) yapraklar.splice(i + 1 + j, 0, ...ek.slice(j, j + 10000));
        } else s.bilinmeyen++;
      }
      // Paragrafın son parçası paragraf sonu "\n"ini de kapsar; o satır sonu gösterilmez.
      for (let i = model.parcalar.length - 1; i >= 0; i--) {
        const x = model.parcalar[i];
        if (x.t !== 'metin') break;
        if (x.yazi.endsWith('\n')) { x.yazi = x.yazi.slice(0, -1); if (!x.yazi) model.parcalar.splice(i, 1); }
        break;
      }
      if (liste) {
        const ilkMetin = model.parcalar.find(x => x.t === 'metin');
        if (ilkMetin) liste.stil = ilkMetin.stil;
      }
      return { model, icTablolar };
    }

    // Kenarlık türü: borderCell bütün çizgiler, borderTable dış çerçeve, borderRow dış çerçeve + yatay çizgiler,
    // borderNone çizgi yok. Hücredeki border özniteliği o hücre için tablonunkini ezer.
    const KENAR = { bordercell: 'hucre', bordertable: 'tablo', borderrow: 'satir', bordernone: 'yok', none: 'yok', false: 'yok', 0: 'yok', '': 'yok' };
    const kenarTuru = (v, vars) => v == null ? vars : (KENAR[String(v).trim().toLowerCase()] || 'hucre');
    const agirlikOku = v => String(v || '').split(',').filter(x => x.trim()).slice(0, SINIR.sutun)
      .map(x => { const n = sayi(x); return Number.isFinite(n) && n > 0 ? Math.min(n, 1e6) : 1; });

    function tablo(t, d, kapsam) {
      s.tablo++;
      const tAgirlik = agirlikOku(oz(t, 'columnSpans'));
      const kalin = sayi(oz(t, 'borderWidth'));
      const kRenk = renk(oz(t, 'borderColor'));
      const model = {
        t: 'tablo', kenar: kenarTuru(oz(t, 'border'), 'hucre'),
        kenarKalin: Number.isFinite(kalin) && kalin > 0 ? Math.min(kalin, 6) : 0.75,
        kenarRenk: kRenk && kRenk[3] !== 0 ? kRenk : [0, 0, 0, 255],
        satirlar: [], sutunlar: []
      };
      const hamSatirlar = [];
      for (const r of cocuklar(t, 'row')) {
        if (durdu()) break;
        if (++s.gezinti > SINIR.gezinti) { s.kesildi = s.kesildi || 'oge'; break; }
        zamanDenetle();
        const ornekler = kapsam && veriSatiriMi(r) ? bag.satirOrnekleri(kapsam, String(oz(r, 'rowName')).toLowerCase()) : [];
        const kapsamlar = ornekler.length ? ornekler.map(o => ({ dugumler: [...o.children], ust: kapsam })) : [kapsam];
        const rAgirlik = agirlikOku(oz(r, 'columnSpans'));
        const yukseklik = sayi(oz(r, 'height'));
        for (const k of kapsamlar) {
          if (ornekler.length && ++s.veriSatiri > SINIR.veriSatiri) { s.kesildi = s.kesildi || 'veri-satiri'; break; }
          const hucreler = [];
          for (const h of cocuklar(r, 'cell')) {
            if (++s.hucre > SINIR.hucre) { s.kesildi = s.kesildi || 'oge'; break; }
            const dikeyAd = String(oz(h, 'vAlign') || oz(h, 'align') || '').toLowerCase();
            const zemin = renk(oz(h, 'fillColor') || oz(h, 'bgColor') || oz(h, 'cellColor'));
            hucreler.push({
              cs: kistir(tamsayi(oz(h, 'colspan')) || 1, 1, SINIR.kaplama),
              rs: kistir(tamsayi(oz(h, 'rowspan')) || 1, 1, SINIR.kaplama),
              kenar: kenarTuru(oz(h, 'border'), null),
              zemin: zemin && zemin[3] !== 0 ? zemin : null,
              dikey: /center|middle/.test(dikeyAd) ? 'middle' : /bottom/.test(dikeyAd) ? 'bottom' : 'top',
              bloklar: bloklar(h, d + 1, k)
            });
          }
          hamSatirlar.push({ hucreler, rAgirlik, yukseklik: Number.isFinite(yukseklik) && yukseklik > 2 ? Math.min(yukseklik, 2000) : 0 });
        }
      }
      // Sütun ızgarası: tablonun columnSpans'ı (yoksa eşit) taban alınır; kendi columnSpans'ı hücre sayısına eşit olan
      // satır (Editör'ün yatay birleştirmesi) kendi sınırlarını ekler. Tablodan az hücreli satır (şartname §11) kendi
      // içinde bölünür: tablonun columnSpans'ı hücre sayısına eşitse ona, değilse eşit. Her hücre sınırları arasındaki
      // ızgara sütunlarını kaplar.
      const tabanSutun = kistir(hamSatirlar.reduce((m, r) => Math.max(m, r.hucreler.reduce((a, h) => a + h.cs, 0)), Math.max(tAgirlik.length, 1)), 1, SINIR.sutun);
      const ort = tAgirlik.length ? tAgirlik.reduce((a, b) => a + b, 0) / tAgirlik.length : 1;
      const tabanW = Array.from({ length: tabanSutun }, (_, i) => tAgirlik[i] || ort);
      const tabanToplam = tabanW.reduce((a, b) => a + b, 0);
      const tabanSinir = [0];
      for (const w of tabanW) tabanSinir.push(tabanSinir[tabanSinir.length - 1] + w / tabanToplam);
      const yuvarla = v => Math.round(v * 10000) / 10000;
      const tumSinirlar = new Set(tabanSinir.map(yuvarla));
      let sarkan = [];   // üst satırlardan sarkan rowspan'ların kalan satır sayıları
      for (const r of hamSatirlar) {
        const n = r.hucreler.length;
        const ortulu = sarkan.length > 0;
        sarkan = sarkan.map(k => k - 1).filter(k => k > 0);
        for (const h of r.hucreler) if (h.rs > 1) sarkan.push(h.rs - 1);
        const csToplam = r.hucreler.reduce((a, h) => a + h.cs, 0);
        const bol = w => {
          const top = w.reduce((a, b) => a + b, 0);
          let x = 0;
          r.sinirlar = [0];
          for (const v of w) { x += v / top; r.sinirlar.push(yuvarla(x)); }
        };
        if (n && r.rAgirlik.length === n && r.hucreler.every(h => h.cs === 1)) bol(r.rAgirlik);
        else if (n && !ortulu && csToplam < tabanSutun) bol(tAgirlik.length === n && r.hucreler.every(h => h.cs === 1) ? tAgirlik : r.hucreler.map(h => h.cs));
        else {
          let k = 0;
          r.sinirlar = [0];
          for (const h of r.hucreler) { k = Math.min(k + h.cs, tabanSutun); r.sinirlar.push(yuvarla(tabanSinir[k])); }
        }
        for (const x of r.sinirlar) tumSinirlar.add(x);
      }
      const izgara = [...tumSinirlar].filter(x => x >= 0 && x <= 1).sort((a, b) => a - b).slice(0, SINIR.sutun + 1);
      if (izgara[izgara.length - 1] !== 1) izgara.push(1);
      for (let i = 0; i + 1 < izgara.length; i++) model.sutunlar.push(Math.max(0, izgara[i + 1] - izgara[i]));
      const sutunNo = x => { let i = izgara.indexOf(x); if (i < 0) i = izgara.findIndex(g => g >= x); return i < 0 ? izgara.length - 1 : i; };
      for (const r of hamSatirlar) {
        const satir = [];
        r.hucreler.forEach((h, i) => {
          const a = sutunNo(r.sinirlar[i]), b = sutunNo(r.sinirlar[i + 1] == null ? 1 : r.sinirlar[i + 1]);
          satir.push({ ...h, cs: Math.max(1, b - a), sutun: a });
        });
        model.satirlar.push({ hucreler: satir, yukseklik: r.yukseklik });
      }
      return model;
    }

    function blokResim(c) {
      const r = resimBilgi(oz(c, 'imageData') || oz(c, 'data'), s);
      if (r.red) s.resimReddi++;
      return { t: 'resim', r, ...resimOlcu(c, r, metinEn, metinBoy) };
    }

    const gorunurMetinVar = b => b.t !== 'p' || b.parcalar.some(x => x.t === 'resim' || (x.t === 'metin' && x.yazi.trim()));

    // Blok listesi. Açık sayfa sonları yalnız en üst düzeyde bölüm ayırır (bolumler verildiğinde).
    function bloklar(el, d, kapsam, bolumler) {
      const out = [];
      if (bolumler) bolumler.push(out);
      if (d > SINIR.derinlik) { s.kesildi = s.kesildi || 'derinlik'; return out; }
      let hedef = out;
      for (const c of el.children) {
        if (durdu()) break;
        if (++s.gezinti > SINIR.gezinti) { s.kesildi = s.kesildi || 'oge'; break; }
        zamanDenetle();
        const a = ad(c);
        if (a === 'page-break' || a === 'pagebreak') {
          s.sayfaSonu++;
          if (bolumler) { hedef = []; bolumler.push(hedef); }
          // İçteki paragraf havuzu tüketir; Editör yalnız metni varsa onu yeni sayfanın başına koyar.
          for (const b of bloklar(c, d + 1, kapsam)) if (gorunurMetinVar(b)) hedef.push(b);
          continue;
        }
        if (a === 'header' || a === 'footer') {
          // Birden çok varsa Editör sonuncusunu alır.
          if (bolumler && d === 0) {
            const bas = tamsayi(oz(c, 'startPage')), bitis = tamsayi(oz(c, 'stopPage'));
            s[a] = { bloklar: bloklar(c, d + 1, kapsam), bas: bas > 0 ? bas : 1, bitis: bitis > 0 ? bitis : null, sayfaNo: sayfaNoAyari(c) };
          }
          continue;
        }
        if (a !== 'paragraph' && a !== 'table' && a !== 'image') {
          // Tanınmayan sarmalayıcının içindeki bloklar sırayla işlenir; paragrafsız yaprak kendi paragrafı sayılır.
          if (oz(c, 'startOffset') != null) {
            s.bilinmeyen++;
            const sahte = doc.createElement('paragraph');
            sahte.append(c.cloneNode(false));
            const { model } = paragraf(sahte, kapsam);
            hedef.push(model);
          } else if (c.children.length && d + 1 <= SINIR.derinlik) {
            s.bilinmeyen++;
            for (const b of bloklar(c, d + 1, kapsam)) hedef.push(b);
          } else s.bilinmeyen++;
          continue;
        }
        if (++s.blok > SINIR.blok) { s.kesildi = s.kesildi || 'oge'; break; }
        if (a === 'paragraph') {
          const { model, icTablolar } = paragraf(c, kapsam);
          hedef.push(model);
          for (const t of icTablolar) {
            if (d + 1 > SINIR.derinlik) { s.kesildi = s.kesildi || 'derinlik'; break; }
            hedef.push(tablo(t, d + 1, kapsam));
          }
        } else if (a === 'table') {
          if (d + 1 > SINIR.derinlik) { s.kesildi = s.kesildi || 'derinlik'; continue; }
          hedef.push(tablo(c, d + 1, kapsam));
        } else hedef.push(blokResim(c));
      }
      return out;
    }

    const bolumler = [];
    bloklar(govde, 0, kokKapsam, bolumler);

    // Üst/alt bilgi her bölümde yeniden çizilir: bölüm sayısı, bölüm × üst/alt bilgi maliyeti blok, hücre, parça ve
    // resim bütçesine sığacak biçimde (ve en çok SINIR.bolum) kesilir.
    const maliyet = (liste, m) => {
      for (const b of liste) {
        m.blok++;
        if (b.t === 'p') { m.parca += b.parcalar.length; for (const x of b.parcalar) if (x.t === 'resim') m.resim++; }
        else if (b.t === 'resim') m.resim++;
        else if (b.t === 'tablo') for (const r of b.satirlar) for (const h of r.hucreler) { m.hucre++; maliyet(h.bloklar, m); }
      }
      return m;
    };
    const ekM = maliyet([...(s.header ? s.header.bloklar : []), ...(s.footer ? s.footer.bloklar : [])], { blok: 0, hucre: 0, parca: 0, resim: 0 });
    const payi = (sinir, n) => (n ? Math.floor(sinir / n) : Infinity);
    const enCokBolum = Math.max(1, Math.min(SINIR.bolum, payi(SINIR.blok, ekM.blok), payi(SINIR.hucre, ekM.hucre),
      payi(SINIR.parca, ekM.parca), payi(SINIR.resim, ekM.resim)));
    if (bolumler.length > enCokBolum) { bolumler.length = enCokBolum; s.kesildi = s.kesildi || 'oge'; }

    let filigran = null;
    const bg = cocuk(props, 'bgimage');
    if (bg && oz(bg, 'bgImageData')) {
      const r = resimBilgi(oz(bg, 'bgImageData'), s);
      const pay = a => { const v = sayi(oz(bg, a)); return v > 0 ? Math.min(v, 300) : 0; };
      if (!r.red) filigran = {
        r, soluk: mantik(oz(bg, 'bgImageWatermark')) === true,
        sol: pay('bgImageLeftMargin'), ust: pay('bgImageUpMargin'), sag: pay('bgImageRigtMargin') || pay('bgImageRightMargin'), alt: pay('bgImageBottomMargin')
      };
    }
    return {
      sayfa, metinEn, taban, bolumler, ust: s.header, alt: s.footer, filigran,
      sablon: !!veri, kesildi: s.kesildi, kokAdi: s.kokAdi, bicimSurumu: kisa(oz(kok, 'format_id'), 16) || null,
      notlar: veri ? [] : notlar,
      sayac: { paragraf: s.paragraf, tablo: s.tablo, resim: s.resimSayisi, resimReddi: s.resimReddi, sayfaSonu: s.sayfaSonu, ofsetSorunu: s.ofsetSorunu, bilinmeyen: s.bilinmeyen, veriSatiri: s.veriSatiri, blok: s.blok }
    };
  }

  function baytlaraCevir(girdi) {
    if (ArrayBuffer.isView(girdi)) return Promise.resolve(new Uint8Array(girdi.buffer, girdi.byteOffset, girdi.byteLength));
    if (Object.prototype.toString.call(girdi) === '[object ArrayBuffer]') return Promise.resolve(new Uint8Array(girdi));
    if (girdi && typeof girdi.arrayBuffer === 'function') {
      if (girdi.size > SINIR.paket) throw hata('boyut', 'paket');
      return girdi.arrayBuffer().then(b => new Uint8Array(b));
    }
    throw hata('zip', 'girdi türü');
  }

  // Dosyayı (Blob, ArrayBuffer ya da Uint8Array) okur ve düz JS modeli döndürür; XML belgesine ait hiçbir düğüm
  // modelde kalmaz.
  async function oku(girdi, { signal } = {}) {
    const baslangic = performance.now();
    const u8 = await baytlaraCevir(girdi);
    iptalDenetle(signal);
    if (!u8.length) throw hata('bos');
    if (u8.length > SINIR.paket) throw hata('boyut', 'paket');
    let icerikBayt, girdiler = [], ozellikler = null, notlar = [], imza = null, ham = false;
    if (zipMi(u8)) {
      try { new DecompressionStream('deflate-raw'); } catch { throw hata('desteklenmiyor'); }
      girdiler = zipGirdileri(u8);
      const bul = isim => girdiler.filter(g => g.ad.replace(/^(\.?\/)+/, '').toLowerCase() === isim);
      const icerik = bul('content.xml');
      if (!icerik.length) throw hata('content-xml-yok');
      if (icerik.length > 1) throw hata('belirsiz');
      icerikBayt = await girdiAc(u8, icerik[0], SINIR.icerik, signal);
      iptalDenetle(signal);
      // Ek dosyalar belgeyi göstermek için gerekmez; bozuksa yok sayılır.
      const ek = async isim => { const g = bul(isim); if (g.length !== 1) return null; try { return await girdiAc(u8, g[0], SINIR.ekDosya, signal); } catch (e) { if (e && e.name === 'AbortError') throw e; return null; } };
      const ozBayt = await ek('documentproperties.xml');
      if (ozBayt) try { ozellikler = ozellikleriOku(ozBayt); } catch { ozellikler = null; }
      const notBayt = await ek('comments.xml');
      if (notBayt) try { notlar = notlariOku(notBayt); } catch { notlar = []; }
      const imzaBayt = await ek('sign.sgn');
      if (imzaBayt) imza = await imzaDenetle(icerikBayt, imzaBayt);
      else if (girdiler.some(g => /(^|\/)sign\.sgn$/i.test(g.ad))) imza = { var: true, durum: 'bilinmiyor' };
    } else if (xmlMi(u8)) {
      if (u8.length > SINIR.icerik) throw hata('boyut', 'xml');
      icerikBayt = u8;
      ham = true;
    } else throw hata('zip', 'imza yok');
    const { metin, kodlama } = metneCevir(icerikBayt);
    const xml = xmlCozumle(metin);
    if (ad(xml.documentElement) !== 'template' && !cocuk(xml.documentElement, 'elements')) throw hata('xml', 'kök');
    const model = modelKur(xml, { baslangic, signal, notlar });
    model.kodlama = kodlama;
    model.ham = ham;
    model.imza = imza;
    model.ozellikler = ozellikler;
    model.girdiSayisi = girdiler.length;
    model.sure = Math.round(performance.now() - baslangic);
    return model;
  }

  // ---------------------------------------------------------------- çizim
  // Java'nın mantıksal yazı tipleri eşlenir; öteki adlar yalnız harf, rakam, boşluk, nokta, alt çizgi ve tireden
  // oluşuyorsa tırnak içinde kullanılır.
  const MANTIKSAL = { dialog: 'sans-serif', sansserif: 'sans-serif', serif: 'serif', monospaced: 'monospace', dialoginput: 'monospace' };
  function aileListesi(a) {
    const isim = String(a || '').trim();
    const m = MANTIKSAL[isim.toLowerCase()];
    if (m) return m === 'monospace' ? '"Courier New", monospace' : m === 'sans-serif' ? 'Arial, sans-serif' : '"Times New Roman", serif';
    if (/^[\p{L}\p{N} ._-]{1,64}$/u.test(isim)) return `"${isim}", "Times New Roman", serif`;
    return '"Times New Roman", serif';
  }
  const rgb = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  const pt = v => `${Math.round(v * 100) / 100}pt`;
  const beyazMi = c => c && c[0] === 255 && c[1] === 255 && c[2] === 255;
  const saydamMi = c => c && c[3] === 0;
  const ONCU = { 1: 'dotted', 2: 'dashed', 3: 'solid', 4: 'solid', 5: 'double' };

  function ciz(model, { signal, belge = globalThis.document } = {}) {
    const E = (etiket, sinif) => { const e = belge.createElement(etiket); if (sinif) e.className = sinif; return e; };
    const { sayfa, taban } = model;
    const tabanAile = aileListesi(taban.aile);
    let olcum = null;
    try { olcum = belge.createElement('canvas').getContext('2d'); } catch { olcum = null; }
    let bitti = false;

    const kok = E('div', 'udf');
    kok.setAttribute('role', 'document');
    kok.setAttribute('aria-label', 'UDF belgesi');
    kok.lang = 'tr';

    // Parçanın biçimi paragraf ya da sayfa tabanından farklıysa tek tek CSS özelliği olarak verilir.
    function bicimle(e, st, ust) {
      if (st.aile !== ust.aile) e.style.setProperty('font-family', aileListesi(st.aile));
      if (st.punto !== ust.punto) e.style.setProperty('font-size', pt(st.punto));
      if (st.kalin !== ust.kalin) e.style.setProperty('font-weight', st.kalin ? '700' : '400');
      if (st.italik !== ust.italik) e.style.setProperty('font-style', st.italik ? 'italic' : 'normal');
      const cizgi = [st.alti && 'underline', st.ustu && 'line-through'].filter(Boolean).join(' ');
      const ustCizgi = [ust.alti && 'underline', ust.ustu && 'line-through'].filter(Boolean).join(' ');
      if (cizgi !== ustCizgi) e.style.setProperty('text-decoration-line', cizgi || 'none');
      const r = st.renk && !saydamMi(st.renk) ? rgb(st.renk) : '', ur = ust.renk && !saydamMi(ust.renk) ? rgb(ust.renk) : '';
      if (r !== ur) e.style.setProperty('color', r || 'rgb(0, 0, 0)');
      if (st.zemin && !beyazMi(st.zemin) && !saydamMi(st.zemin) && st.zemin !== ust.zemin) e.style.setProperty('background-color', rgb(st.zemin));
      if ((st.ustSimge || st.altSimge) && !(ust.ustSimge || ust.altSimge)) {
        e.style.setProperty('vertical-align', st.ustSimge ? 'super' : 'sub');
        e.style.setProperty('font-size', pt(st.punto * 0.7));
      }
    }
    const fontKisa = st => `${st.italik ? 'italic ' : ''}${st.kalin ? '700 ' : ''}${st.punto}pt ${aileListesi(st.aile)}`;
    const genislikPt = (metin, st) => {
      if (!metin) return 0;
      if (!olcum) return metin.length * st.punto * 0.5;
      olcum.font = fontKisa(st);
      return olcum.measureText(metin).width * 0.75;
    };

    // Resimler <img> olarak gösterilir; her resim için tek blob adresi (üst bilgideki antet her bölümde aynı adresi
    // kullanır). Tarayıcı resmi ekrana gelince çözer, ekrandan çıkanı ve belge kapanınca hepsini bırakır; yazdırırken
    // resim kendi çözünürlüğüyle basılır. 0.3.2'ye dek resimler en az 2× tuvallere çiziliyor, açılışta hepsi çiziliyor
    // ve bırakılmıyordu: 40 resimli belgede ~1 GB GPU belleği (bağımsız ölçüm, 2026-10-07). Boyut ve piksel sınırları
    // çözülmeden önce başlıktan denetlenir (resimBilgi).
    const resimAdresleri = new Map();   // modeldeki resim → blob adresi
    function resimAdresi(r) {
      let u = resimAdresleri.get(r);
      if (!u) { u = URL.createObjectURL(r.blob); resimAdresleri.set(r, u); }
      return u;
    }
    // <img>, başlığı sağlam ama verisi bozuk resmi hata vermeden boş gösterir (decode() de başarılı döner). Yüklenen her
    // resim bir kez, sırayla tam çözülerek doğrulanır (aynı anda tek bitmap, hemen bırakılır); bozuksa yerine uyarı
    // yazısı çıkar, yazdırırken de basılır (bağımsız gözden geçirme, 2026-10-07).
    const dogrulamalar = new Map();   // modeldeki resim → Promise<boolean>
    let dogrulamaSirasi = Promise.resolve();
    function resimDogrula(r) {
      let p = dogrulamalar.get(r);
      if (!p) {
        p = dogrulamaSirasi = dogrulamaSirasi.then(() => (bitti === 'birakildi' || typeof createImageBitmap !== 'function')
          ? true : createImageBitmap(r.blob).then(b => { b.close(); return true; }, () => false));
        dogrulamalar.set(r, p);
      }
      return p;
    }
    const resimKutulari = [];   // [kutu, r]: yazdırmadan önce hepsi doğrulanır
    const kutuyuDogrula = (kutu, r) => resimDogrula(r).then(saglam => { if (!saglam && bitti !== 'birakildi') resimGosterilemedi(kutu); });
    function resimGosterilemedi(kutu, metin = '[Resim gösterilemedi]') {
      kutu.classList.add('red');
      kutu.textContent = metin;
      return kutu;
    }
    function resimKutusu(r, en, boy) {
      const kutu = E('span', 'udf-resim');
      if (r.red) {
        kutu.style.setProperty('min-width', pt(en));
        kutu.style.setProperty('min-height', pt(boy));
        return resimGosterilemedi(kutu, r.red === 'buyuk' ? '[Resim gösterilemedi: çok büyük]' : '[Resim gösterilemedi]');
      }
      kutu.style.setProperty('width', pt(en));
      kutu.style.setProperty('aspect-ratio', `${Math.round(en * 100) / 100} / ${Math.round(boy * 100) / 100}`);
      const resim = E('img');
      resim.alt = 'Belgedeki resim';
      resim.decoding = 'async';
      resim.draggable = false;
      resim.addEventListener('load', () => kutuyuDogrula(kutu, r), { once: true });
      resimKutulari.push([kutu, r]);
      resim.addEventListener('error', () => { if (bitti !== 'birakildi') resimGosterilemedi(kutu); }, { once: true });
      try { resim.src = resimAdresi(r); } catch { return resimGosterilemedi(kutu); }
      kutu.append(resim);
      return kutu;
    }

    // Arka plan resmi (antet ya da filigran) bir kez, tek sayfalık bir karoya (paylar ve solukluk işlenmiş) çizilir; karo
    // ekranda bölümün arka planında her sayfa boyunda yinelenir, yazdırırken her basılı sayfada tekrarlanan sabit öğedir.
    let filigranUrl = null;
    let filigranHazir = Promise.resolve();
    const sayfaDivleri = [];
    if (model.filigran && typeof createImageBitmap === 'function') {
      const f = model.filigran;
      filigranHazir = createImageBitmap(f.r.blob).then(async bmp => {
        try {
          if (bitti === 'birakildi') return;
          const k = 2 / 0.75, tv = belge.createElement('canvas');
          tv.width = Math.max(1, Math.round(sayfa.en * k)); tv.height = Math.max(1, Math.round(sayfa.boy * k));
          const ctx = tv.getContext('2d');
          if (f.soluk) ctx.globalAlpha = 0.15;
          ctx.drawImage(bmp, f.sol * k, f.ust * k, Math.max(1, (sayfa.en - f.sol - f.sag) * k), Math.max(1, (sayfa.boy - f.ust - f.alt) * k));
          const blob = await new Promise(c => tv.toBlob(c));
          tv.width = tv.height = 0;
          if (!blob || bitti === 'birakildi') return;
          filigranUrl = URL.createObjectURL(blob);
          for (const e of [...sayfaDivleri, ...kok.querySelectorAll('.udf-filigran-baski')]) e.style.setProperty('background-image', `url("${filigranUrl}")`);
          // Yazdırırken kenar boşluklarına düşen kısmı @page arka planı basar (yazdirmaCss); değer kök öğede durmalı.
          belge.documentElement.style.setProperty('--udf-filigran', `url("${filigranUrl}")`);
        } finally { bmp.close(); }
      }).catch(() => {});
      const baski = E('div', 'udf-filigran-baski');
      baski.setAttribute('aria-hidden', 'true');
      baski.style.setProperty('background-size', `${pt(sayfa.en)} ${pt(sayfa.boy)}`);
      kok.append(baski);
    }

    const notSinifi = (e, notlar) => {
      if (!notlar) return;
      e.classList.add('udf-notlu');
      e.dataset.not = notlar.join(' ');
      const metinler = notlar.map(n => model.notlar[n - 1]).filter(Boolean).map(n => `Not ${n.sira}: ${n.metin || '(boş)'}`);
      if (metinler.length) e.title = metinler.join('\n').slice(0, 2000);
    };

    // Sekme durağı paragrafın sol girintisine görelidir. Durak hizası: 0 sola, 1 sağa, 2 ortaya, 4 ondalık.
    // Sekme, sonraki durağa kadar boşluk bırakan satır içi bir kutuyla çizilir; konum yazı genişliği ölçülerek izlenir.
    function sekmeSonrasiGenislik(p, i, hiza) {
      let w = 0;
      for (let k = i + 1; k < p.parcalar.length; k++) {
        const c = p.parcalar[k];
        if (c.t === 'sekme') break;
        if (c.t === 'resim') { w += c.en; continue; }
        const satir = c.yazi.split('\n')[0];
        if (hiza === 4) {
          const ayrac = satir.search(/[.,]/);
          if (ayrac >= 0) return w + genislikPt(satir.slice(0, ayrac), c.stil);
        }
        w += genislikPt(satir, c.stil);
        if (c.yazi.includes('\n')) break;
      }
      return w;
    }

    function paragrafCiz(p) {
      const d = E('div', 'udf-p');
      const st = d.style;
      if (p.hiza !== 'left') st.setProperty('text-align', p.hiza);
      if (p.sol + p.asili) st.setProperty('padding-left', pt(p.sol + p.asili));
      if (p.ilk - p.asili) st.setProperty('text-indent', pt(p.ilk - p.asili));
      if (p.sag) st.setProperty('padding-right', pt(p.sag));
      if (p.once) st.setProperty('padding-top', pt(p.once));
      if (p.sonra) st.setProperty('padding-bottom', pt(p.sonra));
      if (p.aralik) st.setProperty('line-height', String(Math.round(1.15 * (1 + p.aralik) * 1000) / 1000));
      bicimle(d, p.stil, taban);
      if (p.liste) {
        // Numara metnin başlangıcının ~6 punto soluna sağa yaslı, madde işareti ~18 punto soluna konur.
        const bas = p.sol + p.ilk;
        const im = E('span', 'udf-isaret');
        im.textContent = p.liste.isaret;
        im.setAttribute('aria-hidden', 'true');
        bicimle(im, { ...p.liste.stil, alti: false, ustu: false, zemin: null }, p.stil);
        if (p.liste.tur === 'numara') im.style.setProperty('right', `calc(100% - ${pt(Math.max(0, bas - 6))})`);
        else im.style.setProperty('left', pt(Math.max(0, bas - 18)));
        im.style.setProperty('top', pt(p.once));
        d.append(im);
      }
      let x = p.ilk;
      let bos = true;
      for (let i = 0; i < p.parcalar.length; i++) {
        const c = p.parcalar[i];
        if (c.t === 'metin') {
          const sp = E('span');
          sp.textContent = c.yazi;
          bicimle(sp, c.stil, p.stil);
          notSinifi(sp, c.notlar);
          d.append(sp);
          if (c.yazi.trim()) bos = false;
          const satirlar = c.yazi.split('\n');
          if (satirlar.length > 1) x = p.asili;
          x += genislikPt(satirlar[satirlar.length - 1], c.stil);
        } else if (c.t === 'sekme') {
          // TabSet'te ileride durak yoksa Swing'in varsayılanı: her 72 puntoda bir (gerçek belgelerde boşlukla yapılan
          // hizalamalar bu aralığa göre tutuyor).
          let durak = p.duraklar.find(v => v.konum > x + 0.01);
          if (!durak) durak = { konum: (Math.floor(x / 72 + 0.0001) + 1) * 72, hiza: 0, oncu: 0 };
          let hedef = durak.konum;
          if (durak.hiza === 1 || durak.hiza === 2 || durak.hiza === 4) {
            const w = sekmeSonrasiGenislik(p, i, durak.hiza);
            hedef = durak.hiza === 2 ? durak.konum - w / 2 : durak.konum - w;
          }
          const genislik = Math.max(0, hedef - x);
          const sp = E('span', 'udf-sekme');
          sp.setAttribute('aria-hidden', 'true');
          sp.style.setProperty('width', pt(genislik));
          bicimle(sp, { ...c.stil, alti: false, ustu: false }, p.stil);
          const oncu = ONCU[durak.oncu] || (c.stil.alti ? 'solid' : null);
          if (oncu) {
            sp.style.setProperty('border-bottom-style', oncu);
            sp.style.setProperty('border-bottom-width', durak.oncu === 4 ? '2px' : durak.oncu === 5 ? '3px' : '1px');
          }
          notSinifi(sp, c.notlar);
          d.append(sp);
          x += genislik;
        } else if (c.t === 'resim') {
          d.append(resimKutusu(c.r, c.en, c.boy));
          x += c.en;
          bos = false;
        }
      }
      if (bos && !p.parcalar.some(c => c.t === 'sekme')) {
        const sp = E('span');
        sp.textContent = '\u00a0';
        d.append(sp);
      }
      return d;
    }

    function tabloCiz(t) {
      const tb = E('table', 'udf-tablo');
      const cg = E('colgroup');
      for (const w of t.sutunlar) {
        const col = E('col');
        col.style.setProperty('width', `${Math.max(0, Math.round(w * 1000000) / 10000)}%`);
        cg.append(col);
      }
      tb.append(cg);
      const govde = E('tbody');
      const sonSatir = t.satirlar.length - 1, sonSutun = t.sutunlar.length - 1;
      const cizgi = `${pt(t.kenarKalin)} solid ${rgb(t.kenarRenk)}`;
      // Hücrenin görünen sütunu tarayıcının tablo yerleşimindeki gibi bulunur: üstteki rowspan'ların kapattığı sütunlar atlanır.
      const dolu = [];
      t.satirlar.forEach((satir, ri) => {
        const tr = E('tr');
        if (satir.yukseklik) tr.style.setProperty('height', pt(satir.yukseklik));
        const kapali = dolu[ri] || new Set();
        let sutunSayaci = 0;
        for (const h of satir.hucreler) {
          while (kapali.has(sutunSayaci)) sutunSayaci++;
          const sutun = sutunSayaci;
          for (let r = 1; r < h.rs && ri + r <= sonSatir; r++) {
            const d = dolu[ri + r] || (dolu[ri + r] = new Set());
            for (let c = 0; c < h.cs; c++) d.add(sutun + c);
          }
          sutunSayaci += h.cs;
          const td = E('td');
          td.colSpan = h.cs;
          td.rowSpan = h.rs;
          const tur = h.kenar || t.kenar;
          const ilkS = ri === 0, sonS = ri + h.rs - 1 >= sonSatir, ilkK = sutun === 0, sonK = sutun + h.cs - 1 >= sonSutun;
          const kenarlar = tur === 'hucre' ? [true, true, true, true]
            : tur === 'tablo' ? [ilkS, sonK, sonS, ilkK]
              : tur === 'satir' ? [true, sonK, true, ilkK] : [false, false, false, false];
          ['top', 'right', 'bottom', 'left'].forEach((y, k) => { if (kenarlar[k]) td.style.setProperty(`border-${y}`, cizgi); });
          if (h.zemin && !beyazMi(h.zemin)) td.style.setProperty('background-color', rgb(h.zemin));
          if (h.dikey !== 'top') td.style.setProperty('vertical-align', h.dikey);
          for (const b of h.bloklar) td.append(blokCiz(b));
          tr.append(td);
        }
        govde.append(tr);
      });
      tb.append(govde);
      return tb;
    }

    function blokCiz(b) {
      if (b.t === 'p') return paragrafCiz(b);
      if (b.t === 'tablo') return tabloCiz(b);
      const d = E('div', 'udf-blokresim');
      d.append(resimKutusu(b.r, b.en, b.boy));
      return d;
    }

    // Ekranda sayfalar yalnız açık sayfa sonlarında bölünür; üst/alt bilgi, bölümün sırası sayfa aralığındaysa
    // çizilir (ilk bölüm 1. sayfadır). Yazdırırken üst/alt bilgiyi ve sayfa numarasını yazdirmaCss() verir.
    const aralikta = (ek, no) => ek && ek.bas <= no && (ek.bitis == null || no <= ek.bitis);
    function ekBilgi(ek, sinif) {
      // Yalnız metinden oluşan üst/alt bilgi yazdırırken sayfa kenar kutularıyla her sayfaya basılır; resim ya da
      // tablo içereni (ör. büro anteti) kenar kutusuna sığmaz, bölümün başında/sonunda akışın içinde basılır.
      const d = E('div', sinif + (ekMetinMi(ek) ? '' : ' akista'));
      d.setAttribute('aria-label', sinif === 'udf-ust' ? 'Üst bilgi' : 'Alt bilgi');
      for (const b of ek.bloklar) d.append(blokCiz(b));
      return d;
    }

    function sayfaDiv() {
      const s = E('div', 'udf-sayfa');
      sayfaDivleri.push(s);
      const st = s.style;
      st.setProperty('width', pt(sayfa.en));
      st.setProperty('min-height', pt(sayfa.boy));
      st.setProperty('padding', `${pt(sayfa.ust)} ${pt(sayfa.sag)} ${pt(sayfa.alt)} ${pt(sayfa.sol)}`);
      st.setProperty('font-family', tabanAile);
      st.setProperty('font-size', pt(taban.punto));
      if (taban.kalin) st.setProperty('font-weight', '700');
      if (taban.italik) st.setProperty('font-style', 'italic');
      if (taban.renk && !saydamMi(taban.renk)) st.setProperty('color', rgb(taban.renk));
      if (model.filigran) {
        st.setProperty('background-size', `${pt(sayfa.en)} ${pt(sayfa.boy)}`);
        st.setProperty('background-repeat', 'repeat-y');
        if (filigranUrl) st.setProperty('background-image', `url("${filigranUrl}")`);
      }
      return s;
    }
    const ekDolu = ek => !!ek && ek.bloklar.some(b => b.t !== 'p' || b.parcalar.length);

    // Uzun belge dilimlerle eklenir: ilk dilim hemen görünür, kalanlar sırayla; ekran dışındaki dilimler
    // content-visibility ile ucuzlar.
    const DILIM = 200;
    const isler = [];
    model.bolumler.forEach((bloklar, i) => {
      const sd = sayfaDiv();
      isler.push(() => {
        if (aralikta(model.ust, i + 1) && ekDolu(model.ust)) sd.append(ekBilgi(model.ust, 'udf-ust'));
        kok.append(sd);
      });
      for (let j = 0; j < bloklar.length; j += DILIM) {
        isler.push(() => {
          const dl = E('div', 'udf-dilim');
          for (const b of bloklar.slice(j, j + DILIM)) dl.append(blokCiz(b));
          sd.append(dl);
        });
      }
      isler.push(() => { if (aralikta(model.alt, i + 1) && ekDolu(model.alt)) sd.append(ekBilgi(model.alt, 'udf-alt')); });
    });
    if (model.kesildi) {
      isler.push(() => {
        const n = E('div', 'udf-not');
        n.textContent = model.kesildi === 'sure'
          ? 'Belgenin hazırlanması uzun sürdü; ilk bölüm gösteriliyor. Tamamı için dosyayı indirip UYAP Doküman Editörü ile açın.'
          : 'Belge çok uzun ya da karmaşık; ilk bölüm gösteriliyor. Tamamı için dosyayı indirip UYAP Doküman Editörü ile açın.';
        kok.append(n);
      });
    }

    // İlk dilimler eşzamanlı çizilir; gerisi denetimi sayfaya bırakarak eklenir. Bitince iş listesi boşaltılır (her iş
    // modelin bir parçasını tutuyor).
    let sira = 0;
    const t0 = performance.now();
    while (sira < isler.length && (sira < 3 || performance.now() - t0 < 30)) isler[sira++]();
    const bitis = (async () => {
      try {
        while (sira < isler.length) {
          await bekle();
          if (iptalMi(signal) || bitti === 'birakildi') return false;
          const t = performance.now();
          while (sira < isler.length && performance.now() - t < 12) isler[sira++]();
        }
        bitti = true;
        return true;
      } finally { isler.length = 0; }
    })();

    // Yazdırmadan önce: bütün dilimler eklenmiş, resimler çözülmüş ve arka plan resmi hazır olmalı (boş resim basılmasın).
    async function tumunuCiz() {
      await bitis;
      const resimler = [...kok.querySelectorAll('.udf-resim img')].map(i => (typeof i.decode === 'function' ? i.decode() : null));
      await Promise.allSettled([...resimler, filigranHazir]);
      // Bozuk resim boş değil, uyarı yazısıyla basılsın: yüklenme olayı gelmemiş olanlar da doğrulanır.
      await Promise.allSettled(resimKutulari.map(([kutu, r]) => kutuyuDogrula(kutu, r)));
    }

    return {
      kok,
      bitti: bitis,
      tumunuCiz,
      dogalEn: Math.ceil(sayfa.en / 0.75),
      birak() {
        bitti = 'birakildi';
        for (const i of kok.querySelectorAll('.udf-resim img')) i.removeAttribute('src');
        for (const u of resimAdresleri.values()) URL.revokeObjectURL(u);
        resimAdresleri.clear();
        resimKutulari.length = 0;
        dogrulamalar.clear();
        if (filigranUrl) { belge.documentElement.style.removeProperty('--udf-filigran'); URL.revokeObjectURL(filigranUrl); filigranUrl = null; }
      },
      ozet: {
        tur: 'UDF', bolum: model.bolumler.length, sablon: model.sablon, kesildi: model.kesildi,
        resimReddi: model.sayac.resimReddi, sayac: model.sayac, sure: model.sure, kodlama: model.kodlama, ham: !!model.ham,
        notSayisi: model.notlar.length, imza: model.imza, ozellikler: model.ozellikler, bicimSurumu: model.bicimSurumu
      }
    };
  }

  // ---------------------------------------------------------------- yazdırma
  // Kenar kutusu yalnız "her sayfa", "2. sayfadan itibaren" ve "yalnız 1. sayfa" aralıklarını basabilir (Chrome
  // @page :nth() desteklemez); öteki aralıklar ekrandaki gibi bölüm sırasına göre akışın içinde basılır.
  const kenarAraligi = ek => (ek.bitis == null ? ek.bas <= 2 : ek.bas === 1 && ek.bitis === 1);
  const metinParagrafi = b => b.t === 'p' && b.parcalar.every(c => c.t !== 'resim');
  // Kenar kutusuna yalnız metin ve yalnız metin içeren yerleşim tablosu sığar.
  const ekMetinMi = ek => !!ek && kenarAraligi(ek) && ek.bloklar.every(b => metinParagrafi(b) ||
    (b.t === 'tablo' && b.satirlar.every(r => r.hucreler.every(h => h.bloklar.every(metinParagrafi)))));

  // CSS dizesi: ters bölü, tırnak ve denetim karakterleri kaçışlanır; satır sonu \A olur (white-space: pre ile).
  const cssDize = v => '"' + String(v).replace(/[\\"]/g, m => '\\' + m)
    .replace(/\n/g, '\\A ').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, c => `\\${c.charCodeAt(0).toString(16)} `) + '"';

  function ekBilgiMetinleri(ek) {
    // Paragraflar hizasına göre üç kutuya dağıtılır; sola yaslı satırda sekmeden sonrası sağ kutuya gider. Yerleşim
    // tablosunun tek hücreli satırı düz paragraf gibi (kendi hizasıyla) işlenir; çok hücreli satırda ilk hücre sola,
    // son hücre sağa, aradakiler ortaya gider.
    const kutular = { left: [], center: [], right: [] };
    let stil = null;
    const duz = p => p.parcalar.map(c => c.t === 'metin' ? c.yazi : c.t === 'sekme' ? ' ' : '').join('').trim();
    const paragrafEkle = b => {
      if (b.t !== 'p') return;
      let sol = '', sag = '', sekmeGordu = false;
      for (const c of b.parcalar) {
        if (c.t === 'sekme') { if (sekmeGordu) sag += ' '; sekmeGordu = true; continue; }
        if (c.t !== 'metin') continue;
        if (!stil && c.yazi.trim()) stil = c.stil;
        if (sekmeGordu) sag += c.yazi; else sol += c.yazi;
      }
      sol = sol.replace(/\s+$/, ''); sag = sag.trim();
      if (!sol && !sag) return;
      const hiza = b.hiza === 'center' || b.hiza === 'right' ? b.hiza : 'left';
      if (hiza === 'left') { if (sol) kutular.left.push(sol); if (sag) kutular.right.push(sag); }
      else kutular[hiza].push([sol, sag].filter(Boolean).join(' '));
    };
    for (const b of ek.bloklar) {
      if (b.t !== 'tablo') { paragrafEkle(b); continue; }
      for (const r of b.satirlar) {
        const n = r.hucreler.length;
        r.hucreler.forEach((h, i) => {
          if (n === 1) { h.bloklar.forEach(paragrafEkle); return; }
          const m = h.bloklar.filter(x => x.t === 'p').map(duz).filter(Boolean).join('\n');
          if (!m) return;
          if (!stil) stil = (h.bloklar.flatMap(p => p.parcalar || []).find(c => c.t === 'metin' && c.yazi.trim()) || {}).stil || null;
          kutular[i === 0 ? 'left' : i === n - 1 ? 'right' : 'center'].push(m);
        });
      }
    }
    return { kutular, stil };
  }

  function yaziKurali(st) {
    if (!st) return '';
    return `font-family: ${aileListesi(st.aile)}; font-size: ${pt(st.punto)}; font-weight: ${st.kalin ? 700 : 400}; font-style: ${st.italik ? 'italic' : 'normal'};` +
      (st.renk && !saydamMi(st.renk) ? ` color: ${rgb(st.renk)};` : '');
  }

  // Sayfa boyutu ve kenar boşlukları pageFormat'tan; üst/alt bilgi ve sayfa numarası sayfa kenar kutularıyla
  // (@top-*, @bottom-*) basılır. startPage 2 ise ilk sayfada, stopPage 1 ise ilk sayfadan sonra gösterilmez.
  function yazdirmaCss(model) {
    const s = model.sayfa;
    // Kenar kutusu kenar boşluğunun içinde durur: üst/alt bilgi varken boşluk en az 24 punto ve kutudaki satırlar
    // sığacak kadar büyütülür; yoksa kutu gövdenin üstüne basılır.
    const kenar = { ust: s.ust, alt: s.alt };
    const satirlar = [];
    const yer = { ust: 'top', alt: 'bottom' };
    for (const tur of ['ust', 'alt']) {
      const ek = model[tur];
      if (!ek || !kenarAraligi(ek)) continue;
      const { kutular, stil } = ekMetinMi(ek) ? ekBilgiMetinleri(ek) : { kutular: { left: [], center: [], right: [] }, stil: null };
      const icerik = { left: kutular.left.join('\n'), center: kutular.center.join('\n'), right: kutular.right.join('\n') };
      // Chrome sayfa sayacını kaydıramaz; başlangıç numarası 1 değilse numara basılmaz.
      const no = tur === 'alt' && ek.sayfaNo && ek.sayfaNo.baslangic === 1 ? ek.sayfaNo : null;
      const kurallar = [];
      for (const hiza of ['left', 'center', 'right']) {
        const parcalar = [];
        if (icerik[hiza]) parcalar.push(cssDize(icerik[hiza] + (no && no.hiza === hiza ? '\n' : '')));
        if (no && no.hiza === hiza) {
          if (no.on) parcalar.push(cssDize(no.on));
          parcalar.push('counter(page)');
          if (no.toplam) parcalar.push(cssDize(no.ayrac), 'counter(pages)');
          if (no.son) parcalar.push(cssDize(no.son));
        }
        if (!parcalar.length) continue;
        const pay = tur === 'ust' ? s.ustPay : s.altPay;
        const payPt = kistir(tur === 'ust' ? (pay == null ? 20 : pay) : (pay == null ? 14 : pay / 2), 4, Math.max(4, Math.max(s[tur], 24) - 16));
        const dikey = tur === 'ust' ? `vertical-align: top; padding-top: ${pt(payPt)};` : `vertical-align: bottom; padding-bottom: ${pt(payPt)};`;
        const yaziStili = no && no.hiza === hiza && !icerik[hiza] ? no.stil : (stil || model.taban);
        const satirSayisi = (icerik[hiza] ? icerik[hiza].split('\n').length : 0) + (no && no.hiza === hiza ? 1 : 0);
        kenar[tur] = Math.max(kenar[tur], 24, Math.min(s.boy * 0.4, payPt + satirSayisi * ((yaziStili && yaziStili.punto) || 12) * 1.2 + 4));
        kurallar.push(`@${yer[tur]}-${hiza} { content: ${parcalar.join(' ')}; white-space: pre; text-align: ${hiza}; ${dikey} ${yaziKurali(yaziStili)} }`);
      }
      if (!kurallar.length) continue;
      const bos = ['left', 'center', 'right'].map(h => `@${yer[tur]}-${h} { content: none; }`).join(' ');
      if (ek.bitis === 1) satirlar.push(`@page :first { ${kurallar.join(' ')} }`);
      else {
        satirlar.push(`@page { ${kurallar.join(' ')} }`);
        if (ek.bas >= 2) satirlar.push(`@page :first { ${bos} }`);
      }
    }
    satirlar.unshift(`@page { size: ${pt(s.en)} ${pt(s.boy)}; margin: ${pt(kenar.ust)} ${pt(s.sag)} ${pt(kenar.alt)} ${pt(s.sol)}; }`);
    // Arka plan karosu yazdırırken sayfa alanına sabitlenir; sayfanın kendisine hizalanması için kenar payı kadar kaydırılır.
    if (model.filigran) {
      satirlar.push(`.udf-gorunum .udf-filigran-baski { background-size: ${pt(s.en)} ${pt(s.boy)}; background-position: ${pt(-s.sol)} ${pt(-kenar.ust)}; }`);
      // Kenar boşluklarına düşen kısım (yalnız "Arka plan grafikleri" açıkken basılır).
      satirlar.push(`@page { background-image: var(--udf-filigran, none); background-size: ${pt(s.en)} ${pt(s.boy)}; background-position: ${pt(-s.sol)} ${pt(-kenar.ust)}; background-repeat: no-repeat; }`);
    }
    return satirlar.join('\n');
  }

  const CSS = `
.udf-gorunum .udf{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px 8px 32px;width:max-content;min-width:100%;box-sizing:border-box}
.udf-gorunum .udf-sayfa{position:relative;box-sizing:border-box;background:#fff;color:#000;box-shadow:0 1px 3px rgba(16,24,40,.18),0 4px 12px rgba(16,24,40,.08);line-height:1.15;font-kerning:normal;text-rendering:optimizeLegibility;color-scheme:light;overflow-wrap:anywhere}
.udf-gorunum .udf-dilim{content-visibility:auto;contain-intrinsic-size:auto 800px;position:relative}
.udf-gorunum .udf-p{position:relative;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.udf-gorunum .udf-isaret{position:absolute;white-space:pre;text-indent:0}
.udf-gorunum .udf-sekme{display:inline-block;height:1em;vertical-align:baseline;text-indent:0}
.udf-gorunum .udf-tablo{table-layout:fixed;width:100%;border-collapse:collapse;margin:0}
.udf-gorunum .udf-tablo td{padding:0 1pt;vertical-align:top;overflow-wrap:anywhere}
.udf-gorunum .udf-resim{display:inline-block;vertical-align:bottom;max-width:100%;text-indent:0}
.udf-gorunum .udf-resim img{display:block;width:100%;height:100%}
.udf-gorunum .udf-resim.red{display:inline-flex;align-items:center;justify-content:center;border:1px dashed #98a2b3;color:#475467;font:9pt/1.2 "Segoe UI",system-ui,sans-serif;font-style:normal;font-weight:400;text-align:center;box-sizing:border-box;padding:2px 4px;white-space:normal}
.udf-gorunum .udf-blokresim{line-height:0}
.udf-gorunum .udf-filigran-baski{display:none}
.udf-gorunum .udf-ust,.udf-gorunum .udf-alt{color:#667085}
.udf-gorunum .udf-ust{border-bottom:1px dashed #d0d5dd;margin-bottom:6pt;padding-bottom:2pt}
.udf-gorunum .udf-alt{border-top:1px dashed #d0d5dd;margin-top:6pt;padding-top:2pt}
.udf-gorunum .udf-notlu{background-color:rgba(255,213,79,.45);border-bottom:1px solid rgba(214,158,0,.9);cursor:help}
.udf-gorunum .udf-notlu.secili{background-color:rgba(255,171,0,.6)}
.udf-gorunum .udf-not{max-width:600px;padding:10px 12px;border-radius:8px;background:#fff4e5;color:#7a4b00;font:13px/1.45 "Segoe UI",system-ui,sans-serif}
@media print{
.udf-gorunum .udf{display:block;padding:0;gap:0;width:auto;min-width:0;zoom:1!important;position:relative;z-index:0}
.udf-gorunum .udf-sayfa{width:auto!important;min-height:0!important;padding:0!important;box-shadow:none;break-after:page;background:none!important}
.udf-gorunum .udf-filigran-baski{display:block;position:fixed;inset:0;z-index:-1;background-repeat:no-repeat;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.udf-gorunum .udf-sayfa:last-child{break-after:auto}
.udf-gorunum .udf-dilim{content-visibility:visible;contain-intrinsic-size:none}
.udf-gorunum .udf-ust:not(.akista),.udf-gorunum .udf-alt:not(.akista),.udf-gorunum .udf-not{display:none}
.udf-gorunum .udf-ust,.udf-gorunum .udf-alt{color:inherit;border:0}
.udf-gorunum .udf-notlu{background:none;border-bottom:0}
.udf-gorunum .udf-tablo tr{break-inside:avoid}
}
`;

  globalThis.UDFMotoru = Object.freeze({ oku, ciz, yazdirmaCss, UdfHatasi, SINIR, ILETI, CSS, numaraYaz, cssDize });
})();
