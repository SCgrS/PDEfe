// Kaydırma ölçümünün sayfa tarafı (test/kaydirma_olcum.mjs CDP Runtime.evaluate ile yükler; uygulamanın kaynağına dokunmaz).
// Etkin sekmenin Goruntuleyici örneğinin yöntemleri ÖRNEK düzeyinde sarılır (prototip değişmez):
//   cizimUygula  → sayfaya ilk tuval (önizleme / hızlı / keskin) geldiği an
//   kaydirmaIsle → görünür sayfa kümesinin değiştiği an (sayfa görünür alana girdi / çıktı)
//   tuvalCiz     → her PDF.js çiziminin süresi ve piksel sayısı
//   metinKatmaniCiz, cekirdek (görünüm, panel, notlar) → süreler
// requestAnimationFrame örnekleyicisi her karede görünür alanın ne kadarının boş (tuvalsiz) ya da bulanık (önizleme / hızlı çizim)
// olduğunu alanla ağırlıklandırıp zamanla toplar ("sn·ekran"); Sayfalar panelinde görünen hücrelerin resimsiz kaldığı süreyi de.
// Bölgesel çizimde (çok büyük sayfa) görünen kısmın tuvalin dışında kalanı da boş sayılır.
(() => {
  if (window.__olc) { window.__olc.calis = false; window.__olc.pio?.disconnect(); }   // önceki koşum: yeniden kurulur (bağlı görünüm kapanmış olur)
  const O = window.__olc = {
    etiket: '', calis: false, sonKare: 0,
    sayfa: new Map(), bitenler: [], panel: new Map(), panelBiten: [],
    cizim: [], metin: [], cekirdek: [], uzunGorev: [], cekirdekBekleyen: 0,
    kareler: 0, uzunKare: 0, kareMax: 0, bosAlan: 0, bulanikAlan: 0, maxBos: 0, bosKareSayisi: 0, panelBosHucreSure: 0,
    zaman: [],
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (O.calis) O.uzunGorev.push({ t: e.startTime, d: e.duration }); })
      .observe({ type: 'longtask', buffered: false });
  } catch { /* desteklenmiyor */ }

  const keskinMi = (cz) => !!cz && !cz.onizleme && !cz.hizli;
  const tv = (s) => !!s.canvas;
  const pikselOrani = () => window.devicePixelRatio || 1;
  O.kayitAc = (s, now) => {
    const k = { no: s.no, gir: now, bosGirdi: !tv(s), bulanikGirdi: !!tv(s) && !keskinMi(s.cizim), ilk: tv(s) ? now : null,
      keskin: tv(s) && keskinMi(s.cizim) ? now : null, enFazla: 0,
      durum: !tv(s) ? 'bos' : s.cizim?.onizleme ? 'onizleme' : s.cizim?.hizli ? 'hizli' : 'keskin' };
    O.sayfa.set(s, k);
    return k;
  };

  O.bagla = () => {
    const b = window.__pdefe.aktif(), g = b.gorunum;
    if (g.__olcO === O) { O.g = g; return 'bagli'; }
    const P = Object.getPrototypeOf(g);   // sarmalar prototipi çağırır: önceki koşumun sarmalının üstüne yeniden kurmak güvenli
    g.__olcO = O; O.g = g;
    g.cizimUygula = function (s, c, cz) {
      const r = P.cizimUygula.call(this, s, c, cz);
      const k = O.sayfa.get(s), now = performance.now();
      if (k) { if (k.ilk == null) k.ilk = now; if (keskinMi(cz) && k.keskin == null) k.keskin = now; }
      if (O.calis) O.uygulanan.push({ no: s.no, t: now - O.t0, onizleme: !!cz.onizleme, hizli: !!cz.hizli, gorunur: this._gorunurKume.has(s) });
      return r;
    };
    g.kaydirmaIsle = function (...a) {
      const r = P.kaydirmaIsle.apply(this, a);
      if (O.calis) {
        const now = performance.now(), yeni = this._gorunurKume;
        for (const s of yeni) if (!O.sayfa.has(s)) O.kayitAc(s, now);
        for (const [s, k] of O.sayfa) if (!yeni.has(s)) { k.cik = now; O.bitenler.push(k); O.sayfa.delete(s); }
      }
      return r;
    };
    g.tuvalCiz = async function (s, pdfSayfa, olcek, dondurme, oran, bolge, koyu) {
      const t = performance.now();
      const gorunur = this._gorunurKume.has(s);
      const r = await P.tuvalCiz.call(this, s, pdfSayfa, olcek, dondurme, oran, bolge, koyu);
      if (O.calis) O.cizim.push({ no: s.no, bas: t - O.t0, sure: performance.now() - t, mp: +((bolge.w * oran) * (bolge.h * oran) / 1e6).toFixed(2), iptal: !r, hizli: !!r?.hizli,
        gorunur, onizleme: oran < pikselOrani() - 1e-6 });
      return r;
    };
    g.metinKatmaniCiz = async function (i, ...a) {
      const t = performance.now();
      try { return await P.metinKatmaniCiz.call(this, i, ...a); } finally { if (O.calis) O.metin.push({ no: i + 1, sure: performance.now() - t }); }
    };
    const sar = (nesne, kim) => {
      if (!nesne || typeof nesne.cekirdek !== 'function' || nesne.cekirdek.__olc === O) return;
      const ozgun = nesne.cekirdek.__ozgun || nesne.cekirdek;
      const f = (y, p, ...a) => {
        const t = performance.now(), pr = ozgun(y, p, ...a);
        O.cekirdekBekleyen++;
        const bitti = () => { O.cekirdekBekleyen--; if (O.calis) O.cekirdek.push({ kim, y, bas: t - O.t0, sure: performance.now() - t }); };
        Promise.resolve(pr).then(bitti, bitti);
        return pr;
      };
      f.__olc = O; f.__ozgun = ozgun;
      nesne.cekirdek = f;
    };
    sar(g, 'gorunum'); sar(window.__pdefe.panel, 'panel'); sar(b.notlar, 'notlar');
    return 'bagli';
  };

  /** Sayfalar paneli: görünen hücrenin girişi / çıkışı (IntersectionObserver, kök panel alanı), resmin geldiği an örnekleyicide. */
  O.panelBagla = () => {
    const alan = document.querySelector('#panel-sayfalar');
    O.pio?.disconnect();
    O.panel.clear();
    O.pio = new IntersectionObserver((gs) => {
      const now = performance.now();
      for (const e of gs) {
        const el = e.target;
        let k = O.panel.get(el);
        if (e.isIntersecting) {
          if (!k && O.calis) {
            const resimli = !!el.querySelector('img');
            k = { no: +el.dataset.sayfa, gir: now, resimli, resim: resimli ? now : null };
            O.panel.set(el, k);
          }
        } else if (k) { k.cik = now; O.panelBiten.push(k); O.panel.delete(el); }
      }
    }, { root: alan, threshold: 0 });
    for (const el of alan.querySelectorAll('.kucuk-resim')) O.pio.observe(el);
    return alan.children.length;
  };

  const kare = (t) => {
    if (!O.calis) return;
    const g = O.g, k = g.kaydirici;
    const dt = O.sonKare ? t - O.sonKare : 0;
    O.sonKare = t;
    O.kareler++;
    if (dt > 50) O.uzunKare++;
    if (dt > O.kareMax) O.kareMax = dt;
    const vt = k.scrollTop, vh = k.clientHeight, vl = k.scrollLeft, vw = k.clientWidth;
    if (O.sonVt !== vt) { O.sonVt = vt; O.sonKaydirma = t; }
    let bos = 0, bulanik = 0;
    if (vw && vh) {
      for (const s of g._gorunurKume) {
        const i = g.idx(s), y = g.yerlesim[i];
        if (!y) continue;
        const gy = Math.max(0, Math.min(y.y + y.h, vt + vh) - Math.max(y.y, vt));
        const gx = Math.max(0, Math.min(y.x + y.w, vl + vw) - Math.max(y.x, vl));
        const a = (gx * gy) / (vw * vh);
        if (!tv(s)) bos += a;
        else {
          // Bölgesel çizimde tuval sayfanın yalnızca bir kısmını kaplar: görünen kısmın tuvalin dışında kalanı da boştur (sayfanın beyaz zemini)
          let kapsanan = a;
          const c = s.cizim;
          if (c && !c.tam && c.bolge) {
            const kx = s.boyut ? s.boyut.w / c.w : 1, ky = s.boyut ? s.boyut.h / c.h : 1, b = c.bolge;
            const x0 = Math.max(vl - y.x, b.x * kx), x1 = Math.min(vl + vw - y.x, (b.x + b.w) * kx);
            const y0 = Math.max(vt - y.y, b.y * ky), y1 = Math.min(vt + vh - y.y, (b.y + b.h) * ky);
            kapsanan = (Math.max(0, x1 - x0) * Math.max(0, y1 - y0)) / (vw * vh);
            if (kapsanan > a) kapsanan = a;
            bos += a - kapsanan;
          }
          if (!keskinMi(c)) bulanik += kapsanan;
        }
        const kk = O.sayfa.get(s);
        if (kk && a > kk.enFazla) kk.enFazla = a;
      }
    }
    O.bosAlan += bos * dt; O.bulanikAlan += bulanik * dt;
    if (bos > 0.002) O.bosKareSayisi++;
    if (bos > O.maxBos) O.maxBos = bos;
    if (O.zamanKaydi) O.zaman.push([Math.round(t - O.t0), Math.round(vt), +bos.toFixed(3), +bulanik.toFixed(3)]);
    // Panel: görünen resimsiz hücreler
    let pb = 0;
    for (const [el, pk] of O.panel) {
      if (pk.resim == null) { if (el.querySelector('img')) pk.resim = t; else pb++; }
    }
    O.panelBosHucreSure += pb * dt;
    requestAnimationFrame(kare);
  };

  /** Ölçümü başlatır: sayaçlar sıfırlanır, o an görünen sayfalar (ve panel hücreleri) "girmiş" sayılır. */
  O.basla = (etiket, { zamanKaydi = false } = {}) => {
    O.etiket = etiket; O.calis = true; O.t0 = performance.now(); O.sonKare = 0; O.zamanKaydi = zamanKaydi; O.zaman = [];
    O.sonVt = O.g.kaydirici.scrollTop; O.sonKaydirma = performance.now(); O.sayfa.clear(); O.bitenler = []; O.panelBiten = []; O.cizim = []; O.metin = []; O.cekirdek = []; O.uzunGorev = [];
    O.uygulanan = [];
    O.kareler = 0; O.uzunKare = 0; O.kareMax = 0; O.bosAlan = 0; O.bulanikAlan = 0; O.maxBos = 0; O.bosKareSayisi = 0; O.panelBosHucreSure = 0;
    const now = performance.now();
    for (const s of O.g._gorunurKume) O.kayitAc(s, now);
    if (O.pio) { const alan = document.querySelector('#panel-sayfalar'); O.pio.disconnect(); O.panel.clear(); for (const el of alan.querySelectorAll('.kucuk-resim')) O.pio.observe(el); }
    requestAnimationFrame(kare);
    return true;
  };

  /** Ölçümü bitirir ve özetler (süreler ms). */
  O.bitir = () => {
    O.calis = false;
    const now = performance.now();
    for (const [, k] of O.sayfa) { k.cik = now; k.sonda = true; O.bitenler.push(k); }
    O.sayfa.clear();
    for (const [, k] of O.panel) { k.cik = now; O.panelBiten.push(k); }
    O.panel.clear();
    const sure = now - O.t0;
    const yuzde = (d, p) => { if (!d.length) return null; const a = [...d].sort((x, y) => x - y); return Math.round(a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))]); };
    const ozet = (d) => ({ n: d.length, ort: d.length ? Math.round(d.reduce((t, x) => t + x, 0) / d.length) : null, ortanca: yuzde(d, 0.5), p90: yuzde(d, 0.9), enFazla: d.length ? Math.round(Math.max(...d)) : null });
    // Görünür alanın en az %5'ini kaplamış sayfalar
    const sayfalar = O.bitenler.filter((k) => k.enFazla >= 0.05);
    const bosGiren = sayfalar.filter((k) => k.bosGirdi);
    const bekleme = bosGiren.map((k) => (k.ilk ?? k.cik) - k.gir);
    const keskinBekleme = sayfalar.filter((k) => k.keskin == null || k.keskin > k.gir).map((k) => (k.keskin ?? k.cik) - k.gir);
    const panel = O.panelBiten;
    const panelBos = panel.filter((k) => !k.resimli);
    const panelBekleme = panelBos.map((k) => (k.resim ?? k.cik) - k.gir);
    const ck = {};
    for (const c of O.cekirdek) { const a = (ck[c.kim + ':' + c.y] ||= []); a.push(c.sure); }
    const cizimGorunur = O.cizim.filter((c) => c.gorunur).map((c) => c.sure), cizimDiger = O.cizim.filter((c) => !c.gorunur).map((c) => c.sure);
    const toplam = (d) => Math.round(d.reduce((t, x) => t + x, 0));
    return {
      etiket: O.etiket, sureMs: Math.round(sure), dpr: devicePixelRatio,
      ana: {
        girenSayfa: sayfalar.length, bosGiren: bosGiren.length, hazirGiren: sayfalar.length - bosGiren.length,
        girisDurumu: sayfalar.reduce((t, k) => { t[k.durum] = (t[k.durum] || 0) + 1; return t; }, {}),
        bekleme: ozet(bekleme), cizilmedenCikan: bosGiren.filter((k) => k.ilk == null).length,
        keskinBekleme: ozet(keskinBekleme),
        // Kaydırma durduğunda görünen ve o an keskin olmayan sayfaların, son kaydırma karesinden keskin çizime dek süresi
        durunca: ozet(O.bitenler.filter((k) => k.sonda && k.enFazla >= 0.05 && k.keskin != null && k.keskin > O.sonKaydirma).map((k) => k.keskin - O.sonKaydirma)),
        durunca_keskinOlmayan: O.bitenler.filter((k) => k.sonda && k.enFazla >= 0.05 && k.keskin == null).length,
        bosAlanSn: +(O.bosAlan / 1000).toFixed(3), bulanikAlanSn: +(O.bulanikAlan / 1000).toFixed(3), enFazlaBosOran: +O.maxBos.toFixed(3),
        bosKare: O.bosKareSayisi,
        enUzunBekleyenler: bosGiren.map((k) => ({ no: k.no, ms: Math.round((k.ilk ?? k.cik) - k.gir), kaplama: +k.enFazla.toFixed(2), cizildi: k.ilk != null }))
          .sort((a, b) => b.ms - a.ms).slice(0, 6),
      },
      kare: { sayi: O.kareler, uzun50: O.uzunKare, enUzun: Math.round(O.kareMax) },
      uzunGorev: { sayi: O.uzunGorev.length, toplam: Math.round(O.uzunGorev.reduce((t, e) => t + e.d, 0)), enUzun: Math.round(Math.max(0, ...O.uzunGorev.map((e) => e.d))) },
      cizim: { gorunur: ozet(cizimGorunur), diger: ozet(cizimDiger), iptal: O.cizim.filter((c) => c.iptal).length, hizli: O.cizim.filter((c) => c.hizli).length,
        onizleme: O.cizim.filter((c) => c.onizleme).length, onizlemeGorunmeyen: O.cizim.filter((c) => c.onizleme && !c.gorunur).length,
        toplamMs: toplam(O.cizim.map((c) => c.sure)), mpOrt: O.cizim.length ? +(O.cizim.reduce((t, c) => t + c.mp, 0) / O.cizim.length).toFixed(2) : 0 },
      metin: ozet(O.metin.map((m) => m.sure)),
      cekirdek: Object.fromEntries(Object.entries(ck).map(([k, v]) => [k, ozet(v)])),
      panel: { giren: panel.length, bosGiren: panelBos.length, bekleme: ozet(panelBekleme), resimsizCikan: panelBos.filter((k) => k.resim == null).length,
        bosHucreSn: +(O.panelBosHucreSure / 1000).toFixed(3) },
      zaman: O.zamanKaydi ? O.zaman : undefined,
      cizimler: O.cizim.slice(0, 400).map((c) => [c.no, Math.round(c.bas), Math.round(c.sure), c.mp, c.gorunur ? 1 : 0, c.hizli ? 1 : 0, c.iptal ? 1 : 0, c.onizleme ? 1 : 0]),
      sayfaKayitlari: O.bitenler.filter((k) => k.enFazla >= 0.05).slice(0, 200).map((k) => [k.no, Math.round(k.gir - O.t0), k.durum, k.ilk == null ? null : Math.round(k.ilk - k.gir), k.keskin == null ? null : Math.round(k.keskin - k.gir), Math.round(k.cik - k.gir)]),
    };
  };

  /** Çizim ve çekirdek işi bitti mi (görünür sayfalar çizildi, planlı / süren çizim yok, işçi örneklemesi ve çekirdek istekleri boşta). */
  O.durgunMu = async () => {
    const k = await import('./keskinlik.js');
    const g = O.g;
    if (k.okumaSuruyor() || O.cekirdekBekleyen > 0) return false;
    for (const s of g.sayfalar) if (s.hedef || s._planli) return false;
    for (const s of g._gorunurKume) if (!tv(s)) return false;
    const alan = document.querySelector('#panel-sayfalar');
    if (!document.querySelector('#sol-panel').hidden && alan.clientHeight) {
      const ar = alan.getBoundingClientRect();
      for (const el of alan.children) { const r = el.getBoundingClientRect(); if (r.bottom > ar.top && r.top < ar.bottom && !el.querySelector('img')) return false; }
    }
    return true;
  };

  /** Bütün açık belgelerin tuvalleri: sayı ve toplam piksel (MP); bellek ölçümünün iç dağılımı. */
  O.tuvaller = () => {
    let sayi = 0, mp = 0;
    for (const b of window.__pdefe.belgeler.values()) for (const s of b.gorunum?.sayfalar || []) {
      for (const c of new Set([s.canvas, s.hamCanvas].filter(Boolean))) { sayi++; mp += c.width * c.height / 1e6; }
    }
    return { sayi, mp: +mp.toFixed(1) };
  };
  return 'kuruldu';
})()
