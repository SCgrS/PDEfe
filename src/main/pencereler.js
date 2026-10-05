// Uygulama pencereleri (0.1.19, kullanıcı isteği: sekme kendi penceresine ayrılabilsin). PDEfe birden çok pencerede çalışır: her
// pencere kendi renderer'ında tam bir arayüzdür (araç çubuğu, sekmeler, sol panel); çekirdek, ayarlar ve uygulama menüsü ortaktır.
// Bu modül pencerelerin kaydını, odak sırasını, kapatma onayını, dosyanın hangi pencerede açılacağını ve bir sekmenin pencereler
// arasında taşınmasını (sürüklerken imleci izleyen önizleme penceresi dahil) yönetir.
//
// Sekme taşıma: kaynak pencere sekmenin bütün durumunu (belge baytları, sayfa düzeni, notlar, geri al yığını, görünüm) bir pakette
// toplar ('sekme:tasi'); hedef pencere paketi açıp onaylayınca ('sekme:al' → 'yanit') kaynak sekmeyi bırakır. Hedef açamazsa sekme
// kaynakta olduğu gibi kalır (kaydedilmemiş değişiklik kaybolmaz).
//
// Renderer'a giden olaylar:
//   'dosya:ac'            [yollar], { yazildi }?     dosyaları aç (yazildi: dosya az önce yeniden yazıldı, açık sekmesi yenilenir)
//   'pencere:kapatIstegi'                            pencere kapatılmak isteniyor (yanıt: 'pencere:kapatOnayla' ya da 'pencere:kapatVazgec')
//   'pencere:izinIste'    istekId                    başka pencere uygulamayı kapatacak (güncelleme kurulumu): kaydedilmemişleri sor → 'yanit'
//   'pencere:izinBitti'                              kurulumdan vazgeçildi ya da kurulum başlatılamadı: izin verirken kilitlenen pencere açılır
//   'sekme:al'            istekId, paket, { x }      taşınan sekmeyi aç (x: bırakılan yerin pencere içi yatay konumu ya da null) → 'yanit'
//   'sekme:bant'          istekId                    sekme bırakılabilecek alan (pencere içi dikdörtgen) → 'yanit'
//   'sekme:disSurukle'    { x, y } | null            başka pencerenin sekmesi bu pencerenin şeridi üzerinde sürükleniyor / ayrıldı
import { BrowserWindow, screen, shell } from 'electron';
import path from 'node:path';
import { disAdresMi } from './guvenlik.js';

const HAZIR_BEKLEME_MS = 20000;      // yeni pencerenin arayüzü bu sürede hazır olmazsa taşıma vazgeçilir
const ISTEK_BEKLEME_MS = 120000;     // renderer'dan beklenen yanıt (büyük belgenin açılması dahil)
const SURUKLEME_ADIMI_MS = 16;       // sürüklenen sekmenin önizlemesi imleci bu aralıkla izler
const CAN_BEKLEME_MS = 3000;         // kaynak pencere bu süre ses vermezse sürükleme bırakılmış sayılır (önizleme ekranda kalmasın)
const HAYALET_OMRU_MS = 30000;       // son sürüklemeden sonra önizleme penceresi bu kadar bekletilir (yeniden kullanılır), sonra yok edilir
const AYIRMA_KAYMASI = 32;           // "Pencereye ayır" ile açılan pencerenin kaynak pencereye göre kayması (px)
// Sekme sürüklemede arayüzün göndermediği değerlerin yerine (px, pencere içeriğine göre): sekmenin tutulduğu nokta (sekme 36 px yüksek;
// 0.2.2'ye dek 30 px, y 14 idi) ve ilk sekmenin yeri (aşağı yukarı 40 px araç çubuğu + #sekme-liste'nin 4 px üst boşluğu; şerit büyüyünce
// değişmedi)
const YEDEK_TUTMA = { x: 40, y: 17 }, YEDEK_SEKME_YERI = { x: 4, y: 45 };
// Önizlemenin başlığı (renderer/hayalet.html, uygulama.js ONIZLEME_BASLIK; 0.2.2'de 30 → 36 px): imleç başlığın içinde, alt kenarından en
// az 8 px yukarıda kalır (sekmenin alt ucundan tutulsa da önizleme imlecin üstünden kaymaz)
const HAYALET_BASLIK = 36, HAYALET_IMLEC_EN_ALT = HAYALET_BASLIK - 8;

/** @typedef {{ pencere: BrowserWindow, wc: Electron.WebContents, id: number, hazir: boolean, hazirSozu: Promise<void>, hazirCoz: () => void,
 *    coktu: boolean, kapatOnayli: boolean, kapatBekleyen: ((kapandi: boolean) => void)|null, bekleyenDosyalar: string[], yollar: Set<string>,
 *    kirli: boolean, kapanisDosyalari: {yollar: string[], anliklar: string[]}|null }} Kayit */

/** @type {Map<number, Kayit>} */
const kayitlar = new Map();   // webContents.id → kayıt
/** @type {Kayit[]} */
let odakSirasi = [];          // en son etkin olan pencere başta (üst üste binen pencerelerde hangisinin önde olduğu buradan)
let bagimli = null;           // kur() ile verilenler
let istekSayac = 0;
const bekleyenIstekler = new Map();   // istekId → { coz, wcId }
let cikisNo = 0;
let cikisSuruyor = false;     // Çıkış (cik) pencereleri sırayla kapatıyor
let surukleme = null;       // süren sekme sürüklemesi (kaynak pencere şeridinin dışında)
let hayalet = null;           // sürüklenen sekmenin önizleme penceresi
let testImlec = null;         // test örneğinde imlecin yeri (gerçek imlece dokunulmaz)

const yolAnahtari = (yol) => String(yol || '').replace(/\//g, '\\').toLowerCase();
const hataMetni = (h) => (h && (h.message || String(h))) || 'Bilinmeyen hata';
const icinde = (r, p) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
const canli = (k) => !!k && !k.pencere.isDestroyed() && !k.wc.isDestroyed();

/** Test örneği ekran dışında mı (PDEFE_TEST_KONUM): pencereler görünen ekrana taşınmaz, odak alınmaz, imleç testten gelir. */
const ekranDisi = () => bagimli.TEST.konum.length === 2;
/** Pencere gerçekten etkinleştirilebilir mi: olağan çalışmada ve görünmeyen masaüstündeki test örneğinde (kişinin odağı etkilenmez). */
const odakAlinir = () => !ekranDisi() || process.env.PDEFE_TEST_GIZLI_MASAUSTU === '1';

// ---------------------------------------------------------------- kayıt ve gönderme
export function kayitAl(e) { return kayitlar.get((e?.sender || e)?.id) || null; }
/** Olayı gönderen pencere (diyalogların sahibi); kayıtlı değilse (önizleme, yazdırma penceresi) en son etkin pencere. */
export function pencereAl(e) { return kayitAl(e)?.pencere || etkinPencere(); }
/** En son etkin olan pencere (arayüz süreci çökmüş pencere sayılmaz: dosya açamaz, diyalog sahibi olamaz). */
export function etkinKayit() { return odakSirasi.find((k) => canli(k) && !k.coktu) || null; }
export function etkinPencere() { return etkinKayit()?.pencere || null; }
export function pencereSayisi() { return kayitlar.size; }

function gonder(k, kanal, ...args) { if (canli(k) && !k.coktu) k.wc.send(kanal, ...args); }
/** Bütün pencerelere gönderir (tema, güncelleme olayları). */
export function herkese(kanal, ...args) { for (const k of kayitlar.values()) gonder(k, kanal, ...args); }
/** Göndereni dışındaki pencerelere gönderir (ayar değişikliği: gönderen zaten uyguladı). */
export function digerlerine(e, kanal, ...args) { const id = (e?.sender || e)?.id; for (const k of kayitlar.values()) if (k.id !== id) gonder(k, kanal, ...args); }

function oneAl(k) { odakSirasi = [k, ...odakSirasi.filter((x) => x !== k)]; }

/** Pencereyi öne getirir (simge durumundaysa açar). Ekran dışındaki test örneğinde yalnızca odak sırası güncellenir. */
export function odakla(k) {
  if (!canli(k)) return;
  oneAl(k);
  if (!odakAlinir()) return;
  if (k.pencere.isMinimized()) k.pencere.restore();
  if (!k.pencere.isVisible()) return;
  k.pencere.focus();
}

/** Renderer'a soru gönderir; yanıt 'yanit' kanalından gelir. Pencere kapanırsa, arayüz süreci çökerse ya da süre dolarsa reddedilir. */
function rendererdanIste(k, kanal, ...args) {
  return new Promise((coz, reddet) => {
    if (!canli(k) || k.coktu) { reddet(new Error('Pencere kapandı.')); return; }
    const id = ++istekSayac;
    const bitir = (f, deger) => {
      if (!bekleyenIstekler.delete(id)) return;
      clearTimeout(zaman);
      if (!k.wc.isDestroyed()) { k.wc.removeListener('destroyed', kapandi); k.wc.removeListener('render-process-gone', kapandi); }
      f(deger);
    };
    const kapandi = () => bitir(reddet, new Error('Pencere kapandı.'));
    const zaman = setTimeout(() => bitir(reddet, new Error('Pencere yanıt vermedi.')), ISTEK_BEKLEME_MS);
    bekleyenIstekler.set(id, { coz: (deger) => bitir(coz, deger), wcId: k.id });
    k.wc.once('destroyed', kapandi);
    k.wc.once('render-process-gone', kapandi);
    k.wc.send(kanal, id, ...args);
  });
}

// ---------------------------------------------------------------- menü çubuğu
/** Menü çubuğunu (Dosya, Düzen…) gösterir ya da gizler (0.1.24, kullanıcı isteği: varsayılan gizli, araç çubuğundaki düğmeyle açılır,
 *  seçim hatırlanır). Gizliyken Windows'taki gibi tek başına basılan Alt çubuğu geçici gösterir (Alt+D gibi menü kısayolları da çalışır);
 *  menünün Ctrl kısayolları her iki durumda da çalışır. */
function menuCubuguKur(pencere, goster) {
  try { pencere.setAutoHideMenuBar(!goster); pencere.setMenuBarVisibility(!!goster); } catch { /* pencere kapandı */ }
}

/** Menü çubuğu ayarı bütün pencerelerde ortaktır (main.js ayar:koy). */
export function menuCubugunuUygula(goster) { for (const k of kayitlar.values()) if (canli(k)) menuCubuguKur(k.pencere, goster); }

// ---------------------------------------------------------------- pencere oluşturma
/**
 * Yeni uygulama penceresi. sinirlar verilmezse kayıtlı pencere konumu ve boyutu (test örneğinde PDEFE_TEST_KONUM / BOYUT) kullanılır.
 * goster: false ise pencere gizli kurulur (taşınan sekme açılınca pencereyiGoster ile gösterilir). dosyalar: arayüz hazır olunca açılır.
 * @returns {Kayit}
 */
export function pencereOlustur({ sinirlar = null, goster = true, dosyalar = [] } = {}) {
  const { TEST, KOK, onYukleme, ayarAl, ayarKoy, temaKoyuMu } = bagimli;
  let buyut = false;
  const verilen = sinirlar;
  if (!sinirlar) {
    const kayitli = ayarAl('pencere') || {};
    const ekran = screen.getPrimaryDisplay().workAreaSize;
    sinirlar = {
      width: TEST.boyut.length === 2 ? TEST.boyut[0] : Math.min(kayitli.genislik || 1280, ekran.width),
      height: TEST.boyut.length === 2 ? TEST.boyut[1] : Math.min(kayitli.yukseklik || 860, ekran.height),
      x: TEST.konum.length === 2 ? TEST.konum[0] : kayitli.x, y: TEST.konum.length === 2 ? TEST.konum[1] : kayitli.y,
    };
    buyut = !!kayitli.buyutulmus;
    // Kayıtlı konumun başlık şeridi bağlı bir ekranda görünmüyorsa (ikinci ekran çıkarıldı, Mac harici ekrandan ayrıldı) pencere en yakın
    // ekranın çalışma alanına sığdırılır: Electron konumu denetlemez, pencere ekran dışında açılıp uygulama açılmamış sanılıyordu (0.2.1)
    if (!ekranDisi() && Number.isFinite(sinirlar.x) && Number.isFinite(sinirlar.y) && !basligiGorunur(sinirlar)) {
      Object.assign(sinirlar, sigdir(sinirlar, { x: Math.round(sinirlar.x + sinirlar.width / 2), y: Math.round(sinirlar.y + 15) }));
    }
  }
  const menuGorunur = !!ayarAl('menuCubugu');
  const pencere = new BrowserWindow({
    ...sinirlar,
    minWidth: 720, minHeight: 480,
    show: false,
    title: 'PDEfe',
    backgroundColor: temaKoyuMu() ? '#1c1c1c' : '#f3f3f3',
    autoHideMenuBar: !menuGorunur,   // gizliyken Alt tuşu geçici gösterir (menuCubuguKur)
    icon: path.join(KOK, 'build', 'icon.png'),
    webPreferences: {
      preload: onYukleme,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  menuCubuguKur(pencere, menuGorunur);
  /** @type {Kayit} */
  const k = { pencere, wc: pencere.webContents, id: pencere.webContents.id, hazir: false, hazirSozu: null, hazirCoz: null, coktu: false,
    kapatOnayli: false, kapatBekleyen: null, bekleyenDosyalar: [...dosyalar], yollar: new Set(), kirli: false, kapanisDosyalari: null };
  k.hazirSozu = new Promise((coz) => { k.hazirCoz = coz; });
  kayitlar.set(k.id, k);
  odakSirasi.push(k);   // gösterilince / etkinleşince öne geçer
  // Başka ölçekli ekranda (ör. %125 dizüstü ekranı + %100 monitör) açılan pencerenin boyutu kurulurken kayabiliyor: sınırlar bir kez daha verilir
  if (verilen) { try { pencere.setBounds(verilen); } catch { /* pencere bu arada kapandıysa */ } }

  pencere.loadURL('pdefe://app/src/renderer/index.html');
  if (goster) pencere.once('ready-to-show', () => pencereyiGoster(k, buyut));
  // Haftalık güncelleme denetimi ilk pencere göründükten birkaç saniye sonra başlar (yinelenen çağrıyı kendisi yok sayar)
  pencere.once('show', () => bagimli.pencereGosterildi?.());
  pencere.on('focus', () => oneAl(k));
  pencere.on('close', (e) => {
    if (!k.kapatOnayli && k.hazir) {
      e.preventDefault();
      gonder(k, 'pencere:kapatIstegi');
      return;
    }
    // Açılışta kullanılacak konum ve boyut: en son kapatılan pencereninki
    const s = pencere.getNormalBounds();
    ayarKoy('pencere', { x: s.x, y: s.y, genislik: s.width, yukseklik: s.height, buyutulmus: pencere.isMaximized() });
  });
  // Windows'ta oturum kapatma, yeniden başlatma ve kapatma pencerelere 'close' değil bu olayı verir (app 'before-quit' de gelmez): Windows
  // yanıtı hemen ister. Penceredeki kaydedilmemiş değişiklik ('pencere:kirli') varsa oturumun bitmesi engellenir ve Çıkış gibi pencereler
  // sırayla kapatılıp sorulur; olay her pencereye ayrı gelir, Çıkış bir kez başlar. Değişiklik yoksa engellenmez (0.2.1). Zorunlu (kritik)
  // kapanış engellenemez
  pencere.on('query-session-end', (e) => {
    if (!k.hazir || k.kapatOnayli || !k.kirli) return;
    e.preventDefault();
    if (!cikisSuruyor) cik();
  });
  pencere.on('closed', () => {
    kayitlar.delete(k.id);
    odakSirasi = odakSirasi.filter((x) => x !== k);
    // Çekirdek bütün pencerelerin ortağıdır ve son pencere kapanana dek çalışır: kapanan pencerenin dosyaları önbellekte açık kalırsa
    // öteki pencereler açık oldukça Gezgin'de silinemez, adı değiştirilemez (0.1.18'e dek pencere kapanınca çekirdek de kapanıyordu)
    if (k.kapanisDosyalari) { try { bagimli.dosyalariBirak?.(k.kapanisDosyalari); } catch (e) { console.error('[pencere] dosyalar bırakılamadı:', e); } }
    const bekleyen = k.kapatBekleyen; k.kapatBekleyen = null; bekleyen?.(true);
    if (surukleme && (surukleme.kaynak === k || surukleme.hedef === k)) { if (surukleme.kaynak === k) { suruklemeyiBitir(); hayaletiGizle(); } else surukleme.hedef = null; }
    surukleme?.bantlar.delete(k);
    if (!kayitlar.size) hayaletiYokEt();   // gizli önizleme penceresi uygulamayı açık tutmasın (window-all-closed)
  });
  // Arayüz süreci çökerse (ör. bellek yetmedi) pencere kapatma sorusunu yanıtlayamaz: sorusuz kapatılabilsin (hazir değil), öteki
  // pencereler ondan yanıt beklemesin, dosya ve sekme ona gönderilmesin
  pencere.webContents.on('render-process-gone', () => {
    try { bagimli.dosyalariBirak?.({ yollar: [...k.yollar], anliklar: [] }); } catch { /* yalnızca önbellek */ }
    k.hazir = false; k.coktu = true; k.yollar = new Set();
    surukleme?.bantlar.delete(k);
    if (k.kapatBekleyen) setImmediate(() => { if (canli(k)) k.pencere.close(); });   // Çıkış bu pencerenin yanıtını bekliyordu
  });
  pencere.on('enter-full-screen', () => gonder(k, 'pencere:tamEkran', true));
  pencere.on('leave-full-screen', () => gonder(k, 'pencere:tamEkran', false));

  // Dış bağlantılar tarayıcıda açılsın (yalnızca web ve e-posta adresleri, guvenlik.js)
  pencere.webContents.setWindowOpenHandler(({ url }) => {
    if (disAdresMi(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  return k;
}

function pencereyiGoster(k, buyut = false) {
  if (!canli(k)) return;
  if (buyut && !ekranDisi()) k.pencere.maximize();
  if (ekranDisi()) k.pencere.showInactive(); else k.pencere.show();
  oneAl(k);
}

// ---------------------------------------------------------------- dosya açma
/**
 * Dosyaları (komut satırı, ikinci örnek, Gezgin çift tık) açar: bir pencerede zaten açık olan dosya o pencerede gösterilir, ötekiler
 * en son etkin pencerede açılır. Arayüzü henüz hazır olmayan pencerede hazır olunca. Döner: son dosyanın açıldığı pencerenin kaydı.
 */
export function dosyalariAc(dosyalar) {
  const gruplar = new Map();
  let son = null;
  for (const yol of dosyalar) {
    const a = yolAnahtari(yol);
    const k = [...kayitlar.values()].find((x) => canli(x) && x.yollar.has(a)) || etkinKayit();
    if (!k) continue;
    if (!gruplar.has(k)) gruplar.set(k, []);
    gruplar.get(k).push(yol);
    son = k;
  }
  for (const [k, yollar] of gruplar) {
    if (k.hazir) gonder(k, 'dosya:ac', yollar); else k.bekleyenDosyalar.push(...yollar);
  }
  return son;
}

// ---------------------------------------------------------------- kapatma
/** Pencereyi kapatmayı ister; kapandıysa true, kullanıcı vazgeçtiyse (kaydedilmemiş belge sorusu) false. */
function kapatmayiIste(k) {
  return new Promise((coz) => {
    const onceki = k.kapatBekleyen; k.kapatBekleyen = null; onceki?.(false);
    if (!canli(k)) { coz(true); return; }
    k.kapatBekleyen = coz;
    if (k.hazir && !k.kapatOnayli) odakla(k);   // soru bu pencerede açılır
    k.pencere.close();
  });
}

/** Dosya › Çıkış: pencereler en öndekinden başlayarak sırayla kapatılır; birinde vazgeçilirse o ve sonrakiler açık kalır. Her adımda
 *  o an en öndeki pencere alınır: çıkış sürerken açılan pencere (soru açıkken başka pencereden ayrılan sekme) de kapatılır. */
export async function cik() {
  const no = ++cikisNo;
  cikisSuruyor = true;
  try {
    for (;;) {
      const k = odakSirasi.find(canli);
      if (!k || no !== cikisNo) return;
      if (!(await kapatmayiIste(k))) return;
    }
  } finally { if (no === cikisNo) cikisSuruyor = false; }
}

/**
 * Güncelleme kurulumu uygulamayı kapatır: pencerelerin kapatma onayı önceden verilir (renderer kaydedilmemişleri sormuş, izin veren
 * pencereler girdiye kilitlenmiştir: izinden sonra yapılan değişiklik sorulmadan kaybolmasın). Onay geri alınınca (kurulum
 * başlatılamadı) pencereler kilidi açar ('pencere:izinBitti').
 */
export function kapatmaOnayiAyarla(deger) {
  for (const k of kayitlar.values()) k.kapatOnayli = !!deger;
  if (!deger) herkese('pencere:izinBitti');
}

// ---------------------------------------------------------------- yeni pencerenin yeri
function calismaAlani(nokta) { return screen.getDisplayNearestPoint(nokta).workArea; }

/** Pencerenin başlık şeridi bağlı bir ekranın çalışma alanında görünüyor mu: en az 100 px genişliğinde, üst kenarı alanın içinde (Windows'un
 *  görünmeyen 8 px'lik çerçevesi payıyla). Kısmen ekran dışında duran pencere tutulup çekilebildiği için yerinde bırakılır. */
function basligiGorunur(s) {
  return screen.getAllDisplays().some(({ workArea: a }) => Math.min(s.x + s.width, a.x + a.width) - Math.max(s.x, a.x) >= 100
    && s.y >= a.y - 8 && s.y <= a.y + a.height - 40);
}

/** Sınırları noktanın ekranındaki çalışma alanına sığdırır: pencere alandan büyük olmaz, tamamı görünür. Test örneği ekran dışında kalır. */
function sigdir(s, nokta) {
  if (ekranDisi()) return { x: Math.round(s.x), y: Math.round(s.y), width: Math.round(s.width), height: Math.round(s.height) };
  const a = calismaAlani(nokta);
  const width = Math.round(Math.min(s.width, a.width)), height = Math.round(Math.min(s.height, a.height));
  return {
    x: Math.round(Math.max(a.x, Math.min(a.x + a.width - width, s.x))),
    y: Math.round(Math.max(a.y, Math.min(a.y + a.height - height, s.y))),
    width, height,
  };
}

/**
 * Sekmenin bırakıldığı yerde açılacak pencerenin sınırları: kaynak pencerenin (ekranı kaplamıyorkenki) boyutunda; pencerenin ilk sekmesi
 * imlecin altına, sekmenin tutulduğu noktaya gelir. hedef: { nokta: ekran noktası, tutma: sekme içindeki tutma noktası, sekmeYeri: ilk
 * sekmenin pencere içeriğindeki yeri }.
 */
function birakmaSinirlari(kaynak, hedef) {
  const p = kaynak.pencere, normal = p.getNormalBounds(), dis = p.getBounds(), ic = p.getContentBounds();
  const tutma = hedef.tutma || YEDEK_TUTMA, yer = hedef.sekmeYeri || YEDEK_SEKME_YERI;
  return sigdir({
    x: hedef.nokta.x - (ic.x - dis.x) - yer.x - tutma.x,
    y: hedef.nokta.y - (ic.y - dis.y) - yer.y - tutma.y,
    width: normal.width, height: normal.height,
  }, hedef.nokta);
}

/** "Pencereye ayır" ile açılacak pencerenin sınırları: kaynak pencerenin boyutunda, ondan biraz aşağıda ve sağda. */
function ayirmaSinirlari(kaynak) {
  const n = kaynak.pencere.getNormalBounds();
  const s = { x: n.x + AYIRMA_KAYMASI, y: n.y + AYIRMA_KAYMASI, width: n.width, height: n.height };
  return sigdir(s, { x: Math.round(s.x + s.width / 2), y: Math.round(s.y + s.height / 2) });
}

// ---------------------------------------------------------------- sekme sürükleme: imleç, hedef, önizleme
/** İmlecin ekrandaki yeri. Ekran dışındaki test örneğinde test verir (test:imlec); verilmemişse test penceresinin yakınında bir nokta. */
function imlec() {
  if (testImlec) return testImlec;
  if (ekranDisi()) return { x: bagimli.TEST.konum[0] + 400, y: bagimli.TEST.konum[1] + 300 };
  return screen.getCursorScreenPoint();
}

/**
 * İmlecin altındaki pencerenin sekme bırakma alanı: { k, x, y } (x, y: o pencerenin içeriğine göre) ya da null. Pencereler odak sırasıyla
 * taranır (öndeki pencere arkadakini örter); imleç kaynak pencerenin üstündeyse hedef yoktur (kaynak kendi şeridini kendisi izler).
 */
function hedefBul(s, p) {
  for (const k of odakSirasi) {
    if (!canli(k) || !k.pencere.isVisible() || k.pencere.isMinimized()) continue;
    if (!icinde(k.pencere.getBounds(), p)) continue;
    if (k === s.kaynak) return null;
    const bant = s.bantlar.get(k);
    if (!bant) return null;
    const ic = k.pencere.getContentBounds();
    const x = p.x - ic.x, y = p.y - ic.y;
    return x >= bant.x && x <= bant.x + bant.w && y >= bant.y && y <= bant.y + bant.h ? { k, x, y } : null;
  }
  return null;
}

function suruklemeAdimi(s) {
  if (surukleme !== s) return;
  if (!canli(s.kaynak) || Date.now() - s.sonCan > CAN_BEKLEME_MS) { suruklemeyiBitir(); hayaletiGizle(); return; }
  const p = imlec();
  hayaletiKonumla(p, s);
  const h = hedefBul(s, p);
  if (s.hedef && s.hedef !== h?.k) gonder(s.hedef, 'sekme:disSurukle', null);
  if (h && (s.hedef !== h.k || s.sonX !== h.x)) gonder(h.k, 'sekme:disSurukle', { x: h.x, y: h.y });
  s.hedef = h?.k || null; s.sonX = h?.x ?? null;
}

/** Süren sürüklemeyi bırakır: imleç izlenmez, hedef penceredeki bırakma işareti kalkar. Önizleme penceresine dokunmaz. */
function suruklemeyiBitir() {
  const s = surukleme;
  if (!s) return;
  surukleme = null;
  clearInterval(s.zaman);
  if (s.hedef) gonder(s.hedef, 'sekme:disSurukle', null);
}

/** Önizleme penceresi: çerçevesiz, odak almayan, fare olaylarını geçiren, her zaman üstte küçük pencere (renderer/hayalet.html). */
function hayaletiGoster(veri, s) {
  const w = Math.max(160, Math.min(320, Math.round(veri.genislik) || 240)), h = Math.max(HAYALET_BASLIK, Math.min(400, Math.round(veri.yukseklik) || 200));
  if (!hayalet || hayalet.pencere.isDestroyed()) {
    const pencere = new BrowserWindow({
      width: w, height: h, show: false, frame: false, thickFrame: false, resizable: false, movable: false, minimizable: false,
      maximizable: false, fullscreenable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
      backgroundColor: veri.koyu ? '#2b2b2b' : '#ffffff',
      webPreferences: { preload: bagimli.onYukleme, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false },
    });
    pencere.removeMenu();
    pencere.setIgnoreMouseEvents(true);
    pencere.setOpacity(0.92);
    const hy = { pencere, hazir: null, gorunur: false, boyut: { w, h }, icerik: null, gizleZaman: null, yokEtZaman: null, konum: null };
    hy.hazir = new Promise((coz) => pencere.webContents.once('did-finish-load', coz));
    pencere.on('closed', () => { if (hayalet === hy) hayalet = null; });
    pencere.loadURL('pdefe://app/src/renderer/hayalet.html');
    hayalet = hy;
  }
  const hy = hayalet;
  clearTimeout(hy.gizleZaman); clearTimeout(hy.yokEtZaman);
  hy.boyut = { w, h }; hy.konum = null;
  hy.icerik = { ad: String(veri.ad || ''), onizleme: !!veri.onizleme, koyu: !!veri.koyu };
  hy.hazir.then(() => {
    if (hayalet !== hy || surukleme !== s || hy.pencere.isDestroyed()) return;
    hy.pencere.webContents.send('hayalet:icerik', { ad: String(veri.ad || ''), onizleme: veri.onizleme || '', koyu: !!veri.koyu });
    hayaletiKonumla(imlec(), s);
    hy.pencere.showInactive();
    hy.gorunur = true;
  });
}

/** Önizlemeyi imlece göre konumlar: sekme, tutulduğu noktadan imlecin altında durur. */
function hayaletiKonumla(p, s) {
  const hy = hayalet;
  if (!hy || hy.pencere.isDestroyed()) return;
  const x = Math.round(p.x - Math.min(s.tutma.x, hy.boyut.w - 24)), y = Math.round(p.y - Math.min(s.tutma.y, HAYALET_IMLEC_EN_ALT));
  if (hy.konum && hy.konum.x === x && hy.konum.y === y) return;
  hy.konum = { x, y };
  hy.pencere.setBounds({ x, y, width: hy.boyut.w, height: hy.boyut.h });
}

function hayaletiGizle() {
  const hy = hayalet;
  if (!hy || hy.pencere.isDestroyed()) return;
  clearTimeout(hy.gizleZaman); clearTimeout(hy.yokEtZaman);
  if (hy.gorunur || hy.pencere.isVisible()) hy.pencere.hide();
  hy.gorunur = false; hy.konum = null;
  // Pencere yeniden kullanılır: sonraki sürüklemenin ilk karesinde önceki sekmenin adı ve görüntüsü görünmesin
  hy.pencere.webContents.send('hayalet:icerik', { ad: '', onizleme: '', koyu: !!hy.icerik?.koyu });
  hy.yokEtZaman = setTimeout(() => { if (hayalet === hy && !surukleme) hayaletiYokEt(); }, HAYALET_OMRU_MS);
  hy.yokEtZaman.unref?.();
}

function hayaletiYokEt() {
  const hy = hayalet;
  hayalet = null;
  if (!hy) return;
  clearTimeout(hy.gizleZaman); clearTimeout(hy.yokEtZaman);
  if (!hy.pencere.isDestroyed()) hy.pencere.destroy();
}

// ---------------------------------------------------------------- kurulum (IPC)
/**
 * @param {object} b
 * @param {Electron.IpcMain} b.ipcMain
 * @param {string} b.KOK                 uygulama kökü (simge)
 * @param {string} b.onYukleme           preload.cjs yolu
 * @param {{konum: number[], boyut: number[]}} b.TEST   gelistirme.js
 * @param {(anahtar: string) => any} b.ayarAl
 * @param {(anahtar: string, deger: any) => void} b.ayarKoy
 * @param {() => boolean} b.temaKoyuMu
 * @param {() => void} [b.pencereGosterildi]   bir pencere ilk kez gösterilince (haftalık güncelleme denetimi)
 * @param {(d: {yollar: string[], anliklar: string[]}) => void} [b.dosyalariBirak]   kapanan pencerenin çekirdekte açık dosyaları bırakılır,
 *   anlık kopyaları silinir
 */
export function pencereleriKur(b) {
  bagimli = b;
  const { ipcMain } = b;

  ipcMain.on('uygulama:hazir', (e) => {
    const k = kayitAl(e);
    if (!k) return;
    k.hazir = true; k.coktu = false; k.kirli = false; k.hazirCoz();
    if (k.bekleyenDosyalar.length) { gonder(k, 'dosya:ac', k.bekleyenDosyalar); k.bekleyenDosyalar = []; }
  });
  // Döner: yanıt bekleniyor muydu. Süresi dolmuş isteğin yanıtı false alır ('sekme:al': kaynak pencere sekmeyi geri almıştır, hedef de
  // kurduğu sekmeyi kaldırır; belge iki pencerede birden açık kalmaz)
  ipcMain.handle('yanit', (e, id, sonuc) => {
    const bekleyen = bekleyenIstekler.get(id);
    if (!bekleyen || bekleyen.wcId !== e.sender.id) return false;
    bekleyen.coz(sonuc);
    return true;
  });

  // Pencerenin açık belgeleri: dosya yalnızca bir pencerede açık olur (aynı dosyanın iki kopyası birbirinin kaydını ezerdi)
  ipcMain.on('pencere:belgeler', (e, yollar) => { const k = kayitAl(e); if (k) k.yollar = new Set((Array.isArray(yollar) ? yollar : []).map(yolAnahtari)); });
  // Pencerede kaydedilmemiş değişiklik var mı (renderer durum değiştikçe bildirir): oturum sonunda soru gerekip gerekmediği ('query-session-end')
  ipcMain.on('pencere:kirli', (e, kirli) => { const k = kayitAl(e); if (k) k.kirli = !!kirli; });
  ipcMain.handle('pencere:kimlik', (e) => e.sender.id);
  ipcMain.handle('pencere:sayi', () => kayitlar.size);
  // Dosya başka bir pencerede açıksa o pencere öne gelir ve sekmesine geçer; true dönerse isteyen pencere dosyayı açmaz
  ipcMain.handle('pencere:baskaPenceredeAc', (e, yol, secenek) => {
    const a = yolAnahtari(yol);
    const k = [...kayitlar.values()].find((x) => x.id !== e.sender.id && canli(x) && x.hazir && x.yollar.has(a));
    if (!k) return false;
    gonder(k, 'dosya:ac', [yol], { yazildi: !!secenek?.yazildi });
    odakla(k);
    return true;
  });
  // Dosya başka bir pencerede açık mı (0.2.1; salt okunur, pencereye dokunmaz): Farklı kaydet başka pencerede açık belgenin üzerine yazmaz
  // (renderer/uygulama.js kayitYaz)
  ipcMain.handle('pencere:baskaPenceredeAcikMi', (e, yol) => {
    const a = yolAnahtari(yol);
    return [...kayitlar.values()].some((x) => x.id !== e.sender.id && canli(x) && x.yollar.has(a));
  });

  ipcMain.handle('pencere:tamEkran', (e, deger) => {
    const p = kayitAl(e)?.pencere;
    if (!p) return false;
    const yeni = deger ?? !p.isFullScreen();
    p.setFullScreen(yeni);
    return yeni;
  });
  ipcMain.handle('pencere:baslik', (e, baslik) => { kayitAl(e)?.pencere.setTitle(baslik ? `${baslik} — PDEfe` : 'PDEfe'); return true; });
  ipcMain.handle('pencere:kapat', (e) => { kayitAl(e)?.pencere.close(); return true; });
  // dosyalar: { yollar, anliklar }: pencerenin çekirdekte açtırdığı dosyalar ve anlık kopyaları; pencere kapanınca bırakılır / silinir
  ipcMain.handle('pencere:kapatOnayla', (e, dosyalar) => {
    const k = kayitAl(e);
    if (k) { k.kapanisDosyalari = dosyalar || null; k.kapatOnayli = true; k.pencere.close(); }
    return true;
  });
  // Kapatma isteği yanıtsız kalmasın: kullanıcı Vazgeç dedi ya da pencere meşgul (açık soru, süren sekme taşıma)
  ipcMain.handle('pencere:kapatVazgec', (e) => {
    const k = kayitAl(e);
    const bekleyen = k?.kapatBekleyen;
    if (bekleyen) { k.kapatBekleyen = null; bekleyen(false); }
    return true;
  });
  // Güncelleme kurulumu bütün pencereleri kapatır: isteyen pencere kendi belgelerini sordu, öteki pencereler sırayla sorar
  ipcMain.handle('pencere:digerlerindenIzinAl', async (e) => {
    const isteyen = kayitAl(e);
    let sonuc = true;
    for (const k of [...odakSirasi]) {
      if (k === isteyen || !canli(k) || !k.hazir) continue;
      odakla(k);
      let izin = true;
      try { izin = await rendererdanIste(k, 'pencere:izinIste'); } catch { izin = !canli(k); }   // pencere bu arada kapandıysa engel değil
      if (!izin) { sonuc = false; break; }
    }
    // İzin veren pencere kurulum başlayana dek girdi almaz (renderer kilitler: izinden sonra yapılan değişiklik sorulmadan
    // kaybolmasın). Vazgeçildiyse ya da isteyen pencere bu arada kapandıysa kilitler açılır
    if (!sonuc || !canli(isteyen)) { herkese('pencere:izinBitti'); sonuc = false; }
    if (canli(isteyen)) odakla(isteyen);
    return sonuc;
  });
  // Kurulum izni alındıktan sonra kurulum başlatılamadı (renderer bildirir): izin verirken kilitlenen pencereler açılır
  ipcMain.handle('pencere:izinBirak', () => { herkese('pencere:izinBitti'); return true; });
  // Tek sekmeli pencerenin sekmesi boş yere bırakıldı: yeni pencere açılmaz, pencere bırakılan yere taşınır
  ipcMain.handle('pencere:tasi', (e, hedef) => {
    const k = kayitAl(e);
    if (!surukleme) hayaletiGizle();
    if (!k || !hedef?.nokta || k.pencere.isFullScreen()) return false;
    const s = birakmaSinirlari(k, hedef);
    if (k.pencere.isMaximized()) k.pencere.unmaximize();
    k.pencere.setBounds(s);
    // Farklı ölçekli ekrana geçerken ilk çağrı boyutu ölçek oranında bozuyor (ölçüldü: %100 → %150 ekranda 1280×754 yerine 1920×1131,
    // dönüşte 853×503): pencere artık hedef ekranda, sınırlar bir kez daha verilir
    k.pencere.setBounds(s);
    return true;
  });

  // ---- sekme sürükleme (kaynak pencerenin sekme şeridi dışında)
  // { ad, onizleme (data URL), koyu, genislik, yukseklik, tutma: {x, y}, sekmeYeri: {x, y} }
  ipcMain.on('sekme:surukleBasla', (e, veri) => {
    const kaynak = kayitAl(e);
    if (!kaynak || !veri) return;
    suruklemeyiBitir();
    const s = surukleme = {
      kaynak, bantlar: new Map(), hedef: null, sonX: null, sonCan: Date.now(), zaman: null,
      tutma: { x: +veri.tutma?.x || YEDEK_TUTMA.x, y: +veri.tutma?.y || YEDEK_TUTMA.y },
      sekmeYeri: { x: +veri.sekmeYeri?.x || YEDEK_SEKME_YERI.x, y: +veri.sekmeYeri?.y || YEDEK_SEKME_YERI.y },
    };
    hayaletiGoster(veri, s);
    for (const k of kayitlar.values()) {
      if (k === kaynak || !canli(k) || !k.hazir) continue;
      rendererdanIste(k, 'sekme:bant').then((bant) => { if (surukleme === s && bant) s.bantlar.set(k, bant); }).catch(() => {});
    }
    s.zaman = setInterval(() => suruklemeAdimi(s), SURUKLEME_ADIMI_MS);
    suruklemeAdimi(s);
  });
  ipcMain.on('sekme:surukleCan', (e) => { if (surukleme?.kaynak.id === e.sender.id) surukleme.sonCan = Date.now(); });
  // Sekme şeride geri döndü, sürükleme bırakıldı (Esc, pencere odağı kaybetti) ya da dışarıda bırakılan sekme taşınamadı: önizleme kalkar
  ipcMain.on('sekme:surukleIptal', (e) => {
    if (surukleme && surukleme.kaynak.id !== e.sender.id) return;   // başka pencerenin süren sürüklemesi
    suruklemeyiBitir(); hayaletiGizle();
  });
  /** Sekme şeridin dışında bırakıldı ({ tutma, sekmeYeri }: 'sekme:surukleBasla'daki gibi). Döner: { tur: 'pencere', pencere, x } (başka
   *  pencerenin şeridine bırakıldı) | { tur: 'yeni', nokta, tutma, sekmeYeri } (boş yere: yeni pencere). Önizleme, yeni pencere
   *  açılana dek bırakılan yerde durur. Sürükleme ana süreçte bırakılmışsa (kaynak pencere uzun süre ses vermedi) bırakma yine de
   *  geçerlidir: imlecin olduğu yerde yeni pencere. */
  ipcMain.handle('sekme:surukleBitti', (e, veri) => {
    const p = imlec();
    const s = surukleme && surukleme.kaynak.id === e.sender.id ? surukleme : null;
    const tutma = s?.tutma || { x: +veri?.tutma?.x || YEDEK_TUTMA.x, y: +veri?.tutma?.y || YEDEK_TUTMA.y };
    const sekmeYeri = s?.sekmeYeri || { x: +veri?.sekmeYeri?.x || YEDEK_SEKME_YERI.x, y: +veri?.sekmeYeri?.y || YEDEK_SEKME_YERI.y };
    const h = s ? hedefBul(s, p) : null;
    if (s) suruklemeyiBitir();
    if (h) { hayaletiGizle(); return { tur: 'pencere', pencere: h.k.id, x: h.x }; }
    if (hayalet) { clearTimeout(hayalet.gizleZaman); hayalet.gizleZaman = setTimeout(hayaletiGizle, 8000); hayalet.gizleZaman.unref?.(); }
    return { tur: 'yeni', nokta: p, tutma, sekmeYeri };
  });

  /**
   * Sekmeyi başka pencereye taşır. hedef: { tur: 'pencere', pencere, x } (var olan pencere) | { tur: 'yeni', nokta?, tutma?, sekmeYeri? }
   * (yeni pencere; nokta yoksa kaynak pencerenin yanında). Döner: { tamam, hata?, pencere?, yeni? }; tamam değilse sekme kaynakta kalır.
   */
  ipcMain.handle('sekme:tasi', async (e, paket, hedef) => {
    const kaynak = kayitAl(e);
    let k = null, yeni = false;
    try {
      if (!kaynak) throw new Error('Pencere bulunamadı.');
      if (hedef?.tur === 'pencere') {
        k = kayitlar.get(hedef.pencere) || null;
        if (!canli(k) || k === kaynak) throw new Error('Hedef pencere kapanmış.');
      } else {
        yeni = true;
        k = pencereOlustur({ sinirlar: hedef?.nokta ? birakmaSinirlari(kaynak, hedef) : ayirmaSinirlari(kaynak), goster: false });
      }
      let zaman = null;
      await Promise.race([k.hazirSozu, new Promise((_c, reddet) => { zaman = setTimeout(() => reddet(new Error('Yeni pencere açılamadı.')), HAZIR_BEKLEME_MS); })]).finally(() => clearTimeout(zaman));
      const r = await rendererdanIste(k, 'sekme:al', paket, { x: hedef?.tur === 'pencere' ? hedef.x ?? null : null });
      if (!r?.tamam) throw new Error(r?.hata || 'Sekme hedef pencerede açılamadı.');
      if (yeni) pencereyiGoster(k);
      odakla(k);
      return { tamam: true, pencere: k.id, yeni };
    } catch (h) {
      if (yeni && canli(k)) { k.kapatOnayli = true; k.pencere.destroy(); }
      return { tamam: false, hata: hataMetni(h) };
    } finally { if (!surukleme) hayaletiGizle(); }   // bu arada başlamış bir sürüklemenin önizlemesi kalkmasın
  });

  // ---- test kancaları (yalnızca ekran dışındaki test örneğinde)
  if (ekranDisi()) {
    ipcMain.handle('test:imlec', (_e, nokta) => { testImlec = nokta ? { x: Math.round(nokta.x), y: Math.round(nokta.y) } : null; return true; });
    ipcMain.handle('test:pencereler', () => odakSirasi.filter(canli).map((k) => ({
      id: k.id, sinirlar: k.pencere.getBounds(), icerik: k.pencere.getContentBounds(), gorunur: k.pencere.isVisible(), baslik: k.pencere.getTitle(),
      yollar: [...k.yollar], hazir: k.hazir,
    })));
    ipcMain.handle('test:hayalet', () => (hayalet && !hayalet.pencere.isDestroyed()
      ? { gorunur: hayalet.pencere.isVisible(), sinirlar: hayalet.pencere.getBounds(), icerik: hayalet.icerik } : null));
    ipcMain.handle('test:surukleme', () => (surukleme ? { kaynak: surukleme.kaynak.id, hedef: surukleme.hedef?.id ?? null, bantlar: [...surukleme.bantlar].map(([k, bant]) => ({ id: k.id, bant })) } : null));
    ipcMain.handle('test:cik', () => { cik(); return true; });
    // Ekran dışındaki örnekte pencere gerçekten etkinleşmez: test, hangi pencerenin önde olduğunu (odak sırası) bununla belirler
    ipcMain.handle('test:oneAl', (e) => { const k = kayitAl(e); if (k) oneAl(k); return odakSirasi.filter(canli).map((x) => x.id); });
  }
}
