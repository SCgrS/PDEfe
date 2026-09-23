# PDEfe — Plan ve Mimari

Windows 11 için sekmeli PDF görüntüleyici ve düzenleyici. Electron (arayüz, PDF.js ile çizim) + PyMuPDF tabanlı
`pdefe-core` yardımcı süreci (dosyaya dokunan her iş). Arayüz, menüler, mesajlar Türkçe. Geliştirici: x.com/CgrShn.

## Test seti ve tespitler
`C:\Users\<kullanıcı>\Desktop\PDF DENEME` (10 dosya) + `test/pdf` (indirilenler, git dışı):

| Dosya | Zorluk |
|---|---|
| 1.5.6098.pdf (TBK, mevzuat.gov.tr) | 135 sayfa, Word; gömülü olmayan Times New Roman; kopyalamada satır/paragraf birleştirme |
| mevzuat_4721_TMK.pdf, mevzuat_6102_TTK.pdf | büyük kanun PDF'leri (aynı yapı) |
| DENEME PDF (2).pdf (UDF→PDF, iText) | referans okuyucuda eklenmiş 2 vurgu (biri notlu, Popup + AP); gömülü olmayan süslü fontlar (Viner Hand, Vivaldi, Rockwell, Tw Cen) → sistem fontu; UDF'den gelen görseller |
| 2099_83_EK-1_pdf.pdf | yatay sayfa, "Microsoft Print to PDF", CID fontlar, QR görseli |
| 2099_12_BLR_BILIRKISI_EKRAPORU.pdf, fdsafsd.pdf | Word; karışık gömülü/gömülü olmayan font, Cambria Math, görseller |
| UYAP (iText/JasperReports) dosyaları ×4 | Helvetica/Arial gömülü değil, kodlama yok → standart font eşlemesi; 595x879 sayfa |
| dergipark_3972595_ttk_tbk.pdf | 231 yer imi; **bozuk ToUnicode**: Ġ→İ, ġ→Ş, Ģ→ş (Word 2010 Türkçe hatası) |
| dergipark_5104529_zamanasimi.pdf | 52 sayfa, PDFium |
| PDF32000_2008_yerimli.pdf | 756 sayfa, 22 MB, 823 yer imi → performans ve İçindekiler testi |

## Teknoloji ve dosya yapısı
```
package.json            Electron 44, pdfjs-dist 6, electron-store 11, electron-updater 6, electron-builder 26
src/main/               ana süreç (ESM)
  main.js               pencere, tek örnek, pdefe:// protokolü, IPC (pano:icerik: Electron panosundan dosya/görüntü), kapatma onayı
  menu.js               Türkçe menü → renderer'a komut kimliği gönderir
  ayarlar.js            electron-store şeması (bütün varsayılanlar, tek seferlik taşımalar)
  cekirdek.js           pdefe-core ile JSON-RPC (stdio, satır başına JSON, ilerleme mesajları)
  pano.js               Paylaş: dosyayı CF_HDROP olarak panoya koyar (PowerShell)
  gelistirme.js         test örneği kancaları (ayrı veri klasörü, ekran dışı pencere/boyut, yerel diyalog kuyruğu); paketlide kapalı
  preload.cjs           contextBridge: cagir / dinle / gonder / dosyaYolu
src/renderer/           arayüz (ES modülleri; derleme adımı yok, pdefe://app/ üzerinden sunulur)
  uygulama.js           giriş: sekmeler, komutlar, kısayollar, açma/kapatma/kaydetme, sürükle-bırak, araç çubuğu sıkıştırma
  goruntuleyici.js      PDF.js: tembel sayfa çizimi, bölgesel çizim (%6400'e kadar), düzenler, zoom, döndürme
  keskinlik.js          keskin çizim: görsel yeniden örnekleme (işçi + önbellek), ince çizgi ızgarası, maske tuvali kırpma
  sekmeler.js           sekme çubuğu, sürükle-sırala, Ctrl+Tab seçici, açık belgeler listesi
  panel.js              sol panel: Sayfalar (çekirdekten küçük resim), İçindekiler, Yorumlar
  metin.js              seçim (boşluktan sürükleme, okuma sırası, sözcük/paragraf), temiz kopyalama
  arama.js              Bul kutusu: Türkçe duyarlı, tam sözcük, yer imi/yorum, tüm sekmeler, belge başına geçerli eşleşme
  notlar.js             not katmanı: okuma/çizim/etkileşim/balon/simge/araçlar, yazı düzenleyicisi, kaydetme farkı (diff)
  yaziParcalari.js      yazı parçaları (kalın/italik/altı/üstü/renk): işlemler, kanonik biçim, DOM çizme/okuma, seçim ofseti
  aracPenceresi.js/.css Araçlar düğmesinin karolu penceresi
  araclar/              araç pencereleri (kucult, sayfalar, dondur, ayir, gorselBirlestir; birlestir.js 0.1.2'de kaldırıldı);
                        ortak.js: pencere, çıktı satırı, standart kaydetme seçimi, üzerine yazma / kilit soruları
  komutlar.js           komut deseni: KomutYigini (geri al/yinele, kayıt konumu)
  durum.js              durum çubuğu
core/                   Python 3.12 (proje içi .venv, uv ile kurulu; PyInstaller ile pdefe-core.exe)
  pdefe_core.py         JSON-RPC döngüsü, belge önbelleği, temel yöntemler
  islemler/notlar.py    not yazma: Highlight/Text (referans okuyucu yapısı)/FreeText (gömülü Türkçe yüzler, parçalı /RC), kaydet
  islemler/araclar.py   küçült, sayfa düzenle, ayır, görüntü/PDF birleştir, döndür; geçici dosya + atomik yer değiştirme
  islemler/yapisal.py   sayfa tarifinden belge kurma, anlık kopya, konumsal not eşleme, içerik kutusu
test/                   surucu.mjs (CDP ile uygulamayı sürer; gerçek fare/klavye girdisi), baslat.ps1 / durdur.ps1
                        (ayrı veri klasörlü, ekran dışı test örneği), senaryo*.mjs, incele.py, not_testi.py
build/                  simge, NSIS, derleme betikleri
```

## Çekirdek protokolü
İstek `{"id", "method", "params"}` → yanıt `{"id", "result"}` / `{"id", "error"}`; uzun işler `{"id", "progress": {"yuzde", "mesaj"}}` gönderir.
Yöntemler: ping, belge_bilgi, kucuk_resim, notlar, not_gorunum, gorsel_kutulari, metin_sec, sayfa_metni, belge_birak,
notlar_kaydet, freetext_stil, baglantilar, form_gorunum (+ araçlar).

## Temel kararlar
- **Çizim**: PDF.js sayfa içeriğini çizer (annotationMode DISABLE); notların tamamı PDEfe'nin kendi katmanında çizilir
  (vurgu ailesi ve yapışkan not simgesi SVG/HTML, PDEfe yazıları yerli HTML, diğer türler çekirdekten AP pixmap'i).
  Böylece taşıma/silme/düzenleme anında görünür, PDF.js belgesi değişmez.
- **Kaydetme**: renderer model + komut yığını gerçeği tutar; kaydederken dosyadaki duruma göre ekle/güncelle/sil farkı
  çıkarılır ve çekirdek artımlı (incremental) yazar. Yapısal (sayfa) değişiklikler tam yazımla; kayıttan sonra da
  geri al çalışır (fark tersine uygulanır).
- **FreeText**: Base-14 Helvetica Türkçe glif içermediğinden Windows fontunun (Segoe UI/Arial/Times/Calibri, kalın
  dahil) GID koruyan alt kümesi belgeye bir kez gömülür; görünüm akışı PDEfe üretir; /RC, /DA, /DS ve /PDEfe stil kaydı yazılır.
- **Kopyalama**: okuma sırasındaki seçim parçaları + metin katmanı geometrisi (girinti) → ardından çekirdekten (sözcük
  merkezi kutuda) daha temiz sürüm alınıp pano güncellenir. Ayar: temiz / ham.
- **Arama**: PDF.js metin öğelerinden dizin, `toLocaleLowerCase('tr')` ile İ/ı doğru; bozuk glif düzeltmesi dizine de uygulanır.

## Durum (2026-09-17)
- [x] Açma/sekme/görüntüleme, düzenler, zoom (görünür alana sığdır dahil), döndürme, sol panel, koyu tema (sayfayı koyulaştır, görselleri koru), son dosya ve kalınan sayfa, Ctrl+Tab seçici; keskin çizim (görsel, ince çizgi, taramada yüksek yakınlaştırma)
- [x] Metin seçme (boşluktan sürükleme, okuma sırası), temiz kopyalama, arama; bağlantılar (iç/dış), form alanları (görüntü)
- [x] Notlar: referans okuyucu notlarını gösterme, vurgu/metin notu/yapışkan not/yazı (seçime göre biçim) ekleme, taşıma, silme, geri al/yinele, artımlı kaydetme; döndürülmüş sayfada yazı dosyadaki yönüyle; yanıt yazma yok (dosyadakiler salt okunur)
- [x] Sayfa tarifi komutları (sil/sırala/döndür/boş sayfa/başka PDF'ten sayfa) ve yapısal kaydetme (anlık kopya), kayıttan sonra geri al
- [x] Ayarlar penceresi, yazdırma (sayfa başına görüntü dosyası, Windows diyaloğu, iptal)
- [x] Araçlar (araç çubuğundaki Araçlar penceresi ve menü): küçült (tahminli), sayfaları düzenle, ayır, görüntü/PDF birleştir (pano dahil), döndür ve kaydet; standart kaydetme seçimi (yeni belge / yedeksiz üzerine yaz); çekirdekte işbirlikçi iptal
- [x] Güncelleme (electron-updater; 0.1.3: 10 açılışta bir denetim, tek tıkla indir + sessiz kur + yeniden aç), kurulum (NSIS, Türkçe, .pdf ilişkilendirme, Varsayılan Programlar kaydı), GitHub Actions, README/CHANGELOG/THIRD_PARTY/LICENSE; paket derlendi ve paketli uygulama çalıştırıldı
- [ ] Kullanıcı doğrulaması (docs/DOGRULAMA.md): referans okuyucuda notlar, kurulum sihirbazı, gerçek yazıcı, Gezgin çift tık; 0.1.2 için 12. bölüm (referans okuyucu ile aynı ölçekte kalite, döndürme kısayolları, pano hızı, Windows diyalogları)
- [x] GitHub deposu: SCgrS/PDEfe (özel)
- [ ] Karar bekleyen: README teşekkür bölümü

### Revizyon 0.1.1 (2026-09-16, kullanıcı geri bildirimi)
Ayrıntı: CHANGELOG.md. Kök nedenler ve kararlar:
- [x] Vurgu / yapışkan not / yazı aracı ilk yüklemede çalışmıyordu: `Goruntuleyici.yukle()` sayfa elemanlarına
  `data-sayfa` vermiyordu (yalnızca `sayfalariAyarla` veriyordu) → `notlar.js sayfaIdx`, `metin.js` seçim
  dikdörtgenleri ve sağ tık "Not ekle" NaN sayfa alıyordu. Mini çubuk mouseup'ta `e.clientX`'e taşındığı için
  fareyi izliyordu, `.sayfa`/`body` `user-select:none` olduğundan boş yere tıklamada seçim kalkmıyordu: çubuk
  artık seçimin altında sabit, başka yere tıklanınca kapanır.
- [x] Bulanık harf: 1231 px tuval 1230.33 px gösteriliyordu (dpr=1'de bile yeniden örnekleme); tuval piksel
  ızgarasına oturtuldu. Pikselli görsel: PDF.js `getImageSmoothingEnabled` büyütmede yumuşatmayı kapatıyordu;
  görseller yüksek kaliteli yumuşatmayla çizilir.
- [x] Sayfa numarası: `sayfayaGit` tek/iki (kaydırmasız) düzende `gecerli`'yi önceden atadığı için 'sayfa'
  olayı gitmiyordu; kutu odaktayken de güncellenir. Komşu sayfalar önceden çizilir; koyu modda koyu yer tutucu.
- [x] Döndür düğmesi görünümü değil belgeyi döndürür (geri alınabilir, belge değişmiş sayılır); kapsam sorusu ve
  `dondurmeKapsami` ayarı ('sor' | 'sayfa' | 'tum'). Sayfa düzeni tek/iki + bağımsız kaydırma, bütün sekmelere
  uygulanır (`varsayilanDuzen`).
- [x] Temiz kopya paragrafları tek `\n` ile ayırır (UDF'ye yapıştırınca boş paragraf oluşuyordu).
- [x] Küçült "Üzerine yaz" yedeği `%APPDATA%\PDEfe\yedek` yerine özgün klasörde `<ad> (yedek).pdf`
  (kullanıcı gizli klasördeki yedeği bulamıyordu); "Önerilen" → "İdeal"; "Özel" seviye kaldırıldı.
- [x] Kaldırılanlar: açık sekmeleri hatırlama (`sekmeleriHatirla`, `acikSekmeler`), sekme değişiminde sorma
  (`sekmeDegisimindeSor`; soru yalnızca sekme/pencere kapatılırken), araç çubuğundaki Aç ve Ayarlar düğmeleri,
  Hakkında'daki logo ve lisans/üçüncü taraf/altyapı bilgisi. "Notları yazdır" varsayılan kapalı.
- [x] Test senaryoları güncellendi (4: `data-sayfa`; 5: Döndür sorusu; 6: sayfa konumu; 9: sekme değişiminde
  soru yok, kapatırken var; 11: küçült yedek yeri). Yeniden çalıştırılmadı.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 1, 6, 9, 10, 11.

### Revizyon 0.1.2 (2026-09-17, kullanıcı geri bildirimi)
Ayrıntı: CHANGELOG.md. Kullanıcı referans okuyucu ile karşılaştırarak 34 istek bildirdi; gruplar ayrı dallarda uygulandı,
incelendi, birleştirildi ve birleşik sürüm yeniden doğrulandı. Kök nedenler ve kararlar:
- [x] **Keskin çizim** (keskinlik.js): 0.1.1'in zorladığı `imageSmoothingQuality='high'` küçültmede mip-map karıştırıp JPEG ve
  taramayı, büyütmede kübik yumuşatmayla karekodu yumuşatıyordu; PDF.js'in kendi seçimi (×1,33 üstünde en yakın komşu)
  pikselliydi. Görseller JS'de kutu (küçültme) / alan (büyütme) filtresiyle örneklenir (referans okuyucu yakalamasına en yakın sonuç);
  az renkli küçük görsel her ölçekte keskin, ×4 üstünde Chromium yumuşatması. Eksene paralel 4 px'ten ince çizgi ve
  dikdörtgen piksel ızgarasına oturtulur (referans okuyucu "ince çizgileri geliştir"): Path2D yöntemleri sarılıp yol kaydedilir (yol
  başına 128, toplam 1M nokta, FinalizationRegistry), kesikli çizgide uçlar içe yuvarlanır ve lineDashOffset telafi edilir.
  Harfler değişmedi: 974 px'te sayfa genişliği 1,536 px/pt ≈ referans okuyucu %100 (110 ppi, 1,528 px/pt), tuval ekrana birebir,
  ClearType metin referans okuyucudan birkaç gri düzeyi farklı; "bulanık" izlenimi gri alt çizgi ve kenarlıktandı. PDEfe %100 =
  1,333 px/pt olduğundan referans okuyucu %100 ~%13 büyük görünür; karşılaştırma aynı ölçekte yapılmalı (PDEfe %100 değiştirilmedi).
- [x] **Keskin çizimin maliyet sınırları**: ana iş parçacığı GPU'dan eşzamanlı okumaz. VideoFrame / ImageBitmap bir Blob
  işçisinde okunur (CPU OffscreenCanvas ile okuma VideoFrame başına paylaşılan bellek bırakıyordu: 40 sayfalık taramada
  870+ MB); 512²'den büyük görsel işçide örneklenir. İşçide tutulan kaynak 32 MB (LRU), örneklenmiş çıktı önbelleği 32 MB,
  ana iş parçacığındaki küçük görsel önbelleği 16 MB, işçide okunan en büyük görsel 16 MP, kuyruk 12, işçi 10 sn boşta
  kapanır; JS örnekleme hedefi en çok 8 MP (büyütmede 3 MP), ana iş parçacığında kaynak en çok 12 MP, bant 1 MP. PDF.js ara
  tuvalleri (maske, yarıya indirme) tembel: son çizim kök görselden örneklenir (kaydı işlemcide oynatmak kaydırma sonunda
  300 ms blokaj yapıyordu). Etkileşim yalnızca gerçek girdiden sayılır (Ctrl'siz tekerlek, touchmove, kaydırma çubuğu,
  kaydırma tuşları); programatik scroll (zoom, sayfayaGit) sayılmaz, tam keskin tuvali olan sayfada hızlı ara çizim
  gösterilmez. Kalanlar: ilk görünümde ~0,3 sn hızlı çizim; uzun kaydırma sonrası renderer ~370–400 MB (işçi kapanınca ~280);
  'hizli' bayrağı global sayaç (fazladan bir yeniden çizim olabilir).
- [x] **Taramada yüksek yakınlaştırma**: PDF.js `_createMaskCanvas` dolgu tuvalini maskenin tam cihaz boyutunda kuruyordu;
  %2400'de 14560×23680 px Chromium sınırını aşıp hiçbir şey çizilmiyor, %1600'de GPU süreci 3,7 GB'a çıkıp geri vermiyordu
  (saf PDF.js'te de aynı). `maskeKirpmaKur` `_createMaskCanvas` ve `paintImageMaskXObject`'i prototipte sarar (ilk çizim
  görevinin `initializeGraphics`'i üzerinden bir kez): dolgu yalnızca hedef tuvalle kesişimi kadar kurulur, büyütme kararı
  bütün dolgu boyutuyla verilir. Dayanılan PDF.js iç adları: `_createMaskCanvas`, `paintImageMaskXObject`, `canvasFactory`,
  `current.patternFill`, `dependencyTracker`, `_internalRenderTask`, `initializeGraphics`; pdfjs-dist yükseltmesinde
  denetlenmeli, adlar yoksa çökmeden eski (yavaş, büyük tuval) yola düşer. Tekrarlı ve desenli maske kırpılmaz.
  `onYuklemeIsle`: görünür sayfa örneklemesi beklenirken ön çizimler bekler (soğuk açılışta keskin çizim ~0,65 → ~0,4 sn).
  Açık: dikey kaydırma çubuğu çıkınca 926 → 914 px yeniden yerleşim fazladan çizim yapıyor.
- [x] **Koyu sayfa**: yer tutucu ve boş tuval #000. `invert + hue-rotate` ClearType saçağını ters tarafa koyuyordu → koyu sayfa
  tuvali alpha:true (gri yumuşatma), çizim kaydında koyu bayrağı. Taramalar ve görseller özgün renkte kalır (tasarım gereği).
- [x] **Vurgu ve arama karışımı**: `.not-highlight rect { mix-blend-mode: multiply }` `.not-katmani` yığın bağlamında yalnızca
  saydam katmanla karışıyordu (%40 sarı normal karışımla harfi zeytine boyuyordu). `.sayfa` isolation, not katmanı yığın
  bağlamı değil, vurgular ayrı `svg.not-vurgular` (multiply); altı/üstü çizili ve dalgalı normal karışımda. Koyulaştırılmış
  sayfada screen; görsel kutularında (özgün renkte çizilen bölge) clipPath ile multiply kopyası, dışı maskeli screen. Arama
  vurgusunda span'ler transform ile ayrı yığın bağlamı olduğundan karışım `.textLayer`'da (multiply; `.koyu-sayfa`'da screen),
  renkler opak. Sınır: tek karışım kipi hem beyaz zemindeki siyah yazıyı hem koyu zemindeki beyaz yazıyı koruyamaz. Seçimdeki
  mavi şerit: PDF.js'in hasEOL `<br>`'leri konumsuz, katmanın (0,0)'ında üst üste; `br::selection` kuralı atlanmıştı.
- [x] **Notlar**: varsayılan #ffd100 / 0.4; eski #ffeb3b bir kez taşınır (`vurguRengiTasindi`, VARSAYILANLAR dışında). Seçili
  metne not = notlu vurgu: /IT /HighlightNote, /Subj "Metinle İlgili Yorum Yap", /Popup (/F 28, /Open false), UUID /NM (PyMuPDF
  her nota "fitz-A0" yazıyordu); çekirdek /IT'yi okur, yeniden yazılan not CreationDate'ini korur; balon ve panelde tür
  "Metin notu". Yanıt ekleme/silme arayüzden kaldırıldı (kayıtta silinen notun silmesi geri alınınca yanıt yeniden 'ekle'
  olarak yazılıyordu); dosyadaki yanıtlar salt okunur, çekirdeğin IRT yazma yolu duruyor. Hover: 120 ms açılış, 250 ms kapanış,
  balona doğru koridor ertelemesi; fare basılıyken ve seçim mini çubuğu açıkken açılmaz. Balon yeri: bu ve komşu sayfalardaki
  notları örtmeyen ilk aday (sağ, alt/üst, satırların altı/üstü, sağa/sola hizalı, 80 px kayma, sayfa dışı, sol), yoksa
  yalnızca kendi notunu örtmeyen ilk yer.
- [x] **Not simgesi yeri (kural)**: vurgunun ilk satırının okuma yönündeki bitişi, simgenin ortası satırın üst kenarında (üst
  simge gibi); boyut satır kalınlığı × 0,65, 12–22 px. Metin katmanıyla çakışma denetlenmez (harfe binebilir; yarı saydam hale
  okunur tutar); yalnızca aynı sayfadaki simgelerle çakışınca okuma yönünde, sığmazsa geri kaydırılır (sayfa listesinde sonra
  gelen not kayar). Önceki "hiçbir yazıya binmesin" kuralı sıkışık metinde satır ortası notların simgesini sağ kenar boşluğuna
  itiyordu; vurgu ucu tercih edildi. Döndürülmüş sayfada okuma yönü viewport açısından alınır, simge dik kalır.
- [x] **Yazı aracı**: Dolgusuz çalışmıyordu, çünkü `querySelector('.arka')` dolgu girdisi yerine önündeki örnek span'ini
  buluyordu; /C dolguya göre yazılır ya da silinir, /IC ve /CL kaldırılır, /BS W kenarlıkla eşlenir. Düzenleyici
  contenteditable, model parçalar (yaziParcalari.js): beforeinput/keydown modele uygulanıp DOM yeniden çizilir, IME için DOM
  okuma yedeği; çift tık seçiminin baş/son boşlukları biçim kararında sayılmaz. Çekirdek düz/kalın/italik/kalın italik Windows
  yüzlerini gömer (yüz başına ~30 KB), AP'yi parça parça çizer; taban çizgisi CSS satır kutusu formülüyle (Calibri 2 pt
  kayıyordu), satır kırma Chromium kurallarıyla (tire sonrası kırılma, boşluk satır sonunda asılı, yerli çizimde
  kerning/ligatür kapalı), satır sonu boşlukları çizgisiz. /RC referans okuyucu biçiminde (p/span, xfa-spacerun), /DS, /Contents;
  /PDEfe kaydı: parçalar (JSON), /RC özeti (md5), Italik, Hiza, KenarRengi. /RC başka programda değişmişse yazı yabancı sayılır
  (AP'den çizilir, /RC ve /DS'den düzenlenir). Kayıttan sonra geri almada özgün kanonik biçim açıkça yazılır. Yön: `yazi.donus`
  dosyadan (AP /Matrix, yoksa /Rotate); çizim sayfa açısı − donus kadar döner, yeni yazı ekrandaki açıyla oluşur.
- [x] **Yazı düzenleyici ve uygulama**: düzenleyici açıkken `duzen.geriAl/yinele` (düğme, menü) düzenleyici geçmişinde çalışır.
  Araçlar, Paylaş, Yazdır, kaydetme, sekme/pencere kapatma ve düzenleyici dışındaki bir girdiye `focusin` önce
  `duzenleyiciBitir(true)` çağırır; Esc (düzenleyicide, biçim çubuğunda ya da başka bir girdide) referans okuyucu gibi düzenlemeyi uygular
  (`duzenleyiciEsc`), boş yeni kutu eklenmez, diyalog Esc'i stopPropagation ile düzenleyiciye ulaşmaz; otomatik kayıt düzenleme
  bitene kadar bekler; kaydırmasız düzende tekerlek ve PageUp/PageDown düzenleyiciyi sahipsiz bırakmaz. Açık: hizalama ve
  üstü çizili düğmesi yok (modelde ve çekirdekte var), yazı tipi/boyut kutu düzeyinde; referans okuyucunun döndürülmüş FreeText'i denenmedi.
- [x] **Metin seçimi**: `.sayfa`/`body` user-select:none olduğundan tarayıcı seçimi yalnızca harfte başlıyor, boşlukta konum
  mutlak konumlu katmanda sayfa başı/sonuna çözülüyordu. `surukleSecimiBagla`: tek basışta preventDefault, konum metin katmanı
  geometrisinden (en yakın satır, karakter kutusunda ikili arama), rAF ile otomatik kaydırma, Shift+tık; çift tıklayıp
  sürüklemede sözcük kipi (`Intl.Segmenter('tr')`). Not ve yazı aracında başlamaz; vurgu aracında başlar (karar: vurgu aracı
  yalnızca seçimle çalışır, referans okuyucunun "Metni vurgula"sı gibi). Çok sayfalı seçimde `girdiBosalt` seçimin kesiştiği metin
  katmanlarını tutar, `metinKatmaniHazirla` aradaki çizilmemiş sayfaların katmanını tuvalsiz kurar.
- [x] **Okuma sırası**: içerik sırasında alt bilgi (Word "Sayfa N / 9", UYAP doğrulama satırı) gövdeden önce geldiği için tek DOM
  aralığı farenin geçmediği satırları kapsıyordu; yalnızca y/x sıralaması da sütunları ve yan yana blokları karıştırdı.
  `okumaSirasi`: içerik sırası esas; içerikte ardışık ve aşağı ilerleyen öğeler koşu, dikeyde örtüşüp bantta yatayda ayrık
  koşular yan yana (sütun, blok, imza), yan yana olmayanlar birim; birimlerde soldaki, sonra tümüyle üstteki önce, bağ yoksa
  içerik sırası (60'tan fazla koşuda tamamen geometrik). `secimKur` seçimi okuma sırasındaki öğe parçalarından kurar; tarayıcı
  seçimi onları kapsayan tek aralıktır (varlık denetimi, copy olayı, ara sayfa katmanlarının tutulması için). Parçalar DOM'da
  tek aralık değilse tarayıcı boyası gizlenir ve CSS Custom Highlight (`::highlight(pdefe-secim)`) boyar; iki yana yaslı
  satırda sözcük aralarında ince boşluk kalır. Kopya, Vurgula, Not ve mini çubuk parçaları metin.js işlevleriyle okur;
  `getSelection().toString()` kapsayan aralığı verir (testlerde metin.js işlevleri okunmalı). Karar: alt bilginin altındaki
  beyaz alana inen seçime alt bilgi girer, gövde ile alt bilgi arasında kalana girmez. Üç tık (`paragrafSatirlari`): dar satır
  arası, benzer yazı boyu, tutarlı satır aralığı; ilk satır girintisi yeni paragraf, asılı girinti aynı paragraf.
  Yan yana bloklar (UYAP tebliğ mazbatası, imza blokları, sütunlar): koşuda 3 satır kalınlığından büyük dikey boşluk (araya başka
  öğe girmişse) yeni koşu açar, ikinci parça ilkinin devamı sayılır; hiçbir birimin kesmediği yatay boşluk sayfayı bantlara ayırır
  (üstteki bant önce: tebligatın iki nüshası). Tek satırlık etiket/değer koşuları (aynı satır kümesi, dar aralık) tek birimin
  satırlarıdır. `enYakinKonum`: fare satırlardan uzaksa `boslukKonumu` (aday: fare hizasındaki birimler, başlanan birim hep aday;
  aşağıda çapanın gerisindeki, yukarıda ilerisindeki adaylar elenir; bloğun son satırının sonu / ilk satırının başı); yan blok
  kuralı fare başlanan satırın bandındayken uygulanmaz (satır sonunun sağı satır sonu), `blokAtlar` farenin üstünden geçmediği
  bloğu atlayan konumu reddeder. Regresyon: `test/secim_bloklar.mjs` (109 vaka, 65 beklentili; ek PDF'ler iki-sutun, kayik-bosluk,
  asili-girinti git dışında). Açık (0.1.1'de de vardı): sağ tık "Tümünü seç" DOM sırasıyla; iki imza bloklu Word sayfasında sağ
  bloğun satır sonunu aşan sürükleme ters seçebilir; sütun oluğundan ve bloklar arası çapraz sürüklemede sınır durumları; kısa
  satırlı imza bloğunda üç tık tek satır seçer.
- [x] **Gezinme**: ikiSurekli'de `sayfayaGit(gecerli+1)` aynı satırdaki sağ sayfaya gidiyor, `kaydirmaIsle` eşitlikte sol sayfayı
  seçiyordu → önceki/sonraki iki sayfa düzenlerinde çift bazında. Belge sonunda kaydırma sınırı için `sayfayaGit` hedefi
  {no, scrollTop, scrollLeft} saklanır; görünüm kımıldamadıysa hedef geçerli sayılır. Tek kalan son sayfa çift ölçeğinde sol
  sütunda (1 sayfalık belge tam genişlikte kalır). Zoom kuralı: iki sayfaya geçişte ve iki sayfa düzeninde açılışta her zaman
  'sayfa'; teke geçişte `tekSayfaZoomu` (varsayilanZoom sığdırma moduysa o, değilse 'genislik'). Kaydırmasız düzende tekerlek
  kenarda çevirir (bir hareket: 150 ms'den kısa aralıklı olaylar, 60 px; fiziksel tekerlekle denenmedi); aşağı ok / PageDown uzun
  sayfada önce kaydırır (karar: referans okuyucu tuşları, istek kelimesi kelimesine uygulanmadı). Açık diyalog/araç penceresi, SELECT ve
  açık belgeler listesinde sayfa çevrilmez. Tek sayfalık belgede döndürme sorusuz. `belgeDurumuYaz` / `zoomKutusuYaz` araç
  çubuğu durumunu sekme değişiminde ve başlangıçta yazar; 'son kullanılan' zoom yalnızca yüklenmiş belgeden kaydedilir.
  Açık: 'genislik' sekmeye dönünce geçerli sayfaya göre yeniden hesaplanır (karışık yönlü belgede diğer sayfalar taşar).
- [x] **Araç çubuğu ve menüler**: `AraclarPenceresi` karoları menüdeki komut kimlikleriyle çalıştırır (`data-arac-komut`;
  `[data-komut]` uygulama.js'te ayrıca tıklamaya bağlı, çift çağrı olurdu); Esc, dışarı tık, düğme, seçim, Ctrl/Alt kısayolu,
  odak kaybı ve menu:komut kapatır. `aracCubuguSigdir`: ölçüme dayalı 4 kademe (`.sikisik-1..4`); ResizeObserver çubukta,
  içerik değişikliği MutationObserver ile (grupları izlemek "ResizeObserver loop" hatası veriyordu); çubuğa birkaç düğmeden
  fazlası eklenirse taşma menüsü gerekir. Üç nokta: etiket, düğme ve yer tutucuda yok; ilerleme/durum metinlerinde
  (Kaydediliyor…, aranıyor…) kalır, sekme adındaki CSS kısaltması etiket sayılmadı. Tema düğmesi durum gösterir (koyu: ay).
  PDF birleştir aracı (menü, `arac.birlestir`, araclar/birlestir.js) kaldırıldı; çekirdek `birlestir` Görüntü / PDF birleştir için duruyor.
- [x] **Araç pencereleri**: pano her çağrıda PowerShell (+Add-Type) başlatıyordu (280–440 ms, kullanıcıda saniyeler), base64
  çekirdeğe taşınıyor, OEM kod sayfası Türkçe yolları bozuyordu. Electron 44 panosunda readImage/readBuffer yok: Gezgin
  CF_HDROP 'text/uri-list', bit eşlem 'image/png' olarak okunur → tek çağrılık `pano:icerik` (görüntü %TEMP%\PDEfe'ye, 24 saatten
  eskiler silinir); eski pano IPC'leri ve çekirdek `pano_gorsel_kaydet` kaldırıldı. ortak.js `kayitSecimi`: her araçta
  varsayılan "Yeni belge olarak kaydet", seçim hatırlanmaz (Küçült'te üzerine yazma geri alınamaz); `denetle` / `hataSor`
  (kilitli, salt okunur, okunamadı ayrımı; "Başka adla kaydet"), `varOlanaYazmaSor`, `ciktiyiAc` (açık sekme aynı sayfada
  yenilenir), çıktı klasörü boşsa Masaüstü. Çekirdek: hedef klasörde geçici dosya + os.replace (yedek yok), uzun işlemden önce
  `dosya_erisim`, küçülmeyen sonuç özgüne yazılmaz, `dondur_kaydet` kopya → artımlı → atomik; boyut tahmininde öğe içerik özeti
  ile yinelenen içerik bir kez sayılır. Döndür ve kaydet "Üzerine yaz": tarif sekmeye uygulanıp normal kayıt yolu (Ctrl+S)
  kullanılır → geri alınabilir, sekme yeniden açılmaz; başka kaydedilmemiş değişiklik varsa "Kaydet ve devam et / Vazgeç".
  İptal çekirdeğe ulaşmıyordu (istek kimliksiz çağrılıyordu). Açık: aynı görselli PDF öğelere farklı kaliteyle eklenince ortak
  nesneler iki kez sayılır; iki araç penceresi üst üste açılabilir.
- [x] **Test örneği yalıtımı**: gelistirme.js (paketli uygulamada okunmaz): `PDEFE_VERI_KLASORU` (userData; ayar ve tek örnek
  kilidi ayrı, kurulu PDEfe ile paralel test örnekleri çakışmaz), `PDEFE_TEST_KONUM` (ekran dışı pencere,
  CalculateNativeWinOcclusion kapalı), `PDEFE_TEST_BOYUT`. Test örneğinde yerel diyaloglar (mesaj kutusu, aç/kaydet/klasör,
  açılır menü) ekrana çıkmaz: yanıt `test:diyalogYanitlari` kuyruğundan ya da varsayılandan gelir, `test:diyalogKaydi` ile
  okunur. test/baslat.ps1 (-Port -Veri -Konum -Boyut -Tema; CDP hazır olunca PID yazar), durdur.ps1 (yalnızca o süreç ağacı),
  surucu.mjs gerçek girdi: `fare`, `tikla`, `surukle`, `tus`, `yaz`. CDP tuş olayı menü hızlandırıcılarını (Ctrl+F/S/G/H,
  Ctrl+Shift+=) tetiklemez, komutla sınanır; küsuratlı koordinatta basış seçim başlatmaz. test/senaryo4.mjs'in yanıt adımı
  (`.yanit-girdi`) artık geçersiz; test/not_testi.py yanıtı çekirdek düzeyinde yazar (çekirdek yolu duruyor).
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 1, 10, 12 (Windows diyalogları, gerçek pano, referans okuyucuda açma, kısayollar).

### Revizyon 0.1.4 (2026-09-23, kullanıcı geri bildirimi)
Ayrıntı: CHANGELOG.md. Kullanıcı 14 istek bildirdi (ekran görüntüleriyle); araç pencereleri ve sekme / pencere davranışı ayrı dallarda
(r014-araclar, r014-arayuz) yapılıp r014'te birleştirildi. Kök nedenler ve kararlar:
- [x] **"Notlar referans okuyucuda görünmüyor"**: kullanıcının o akşam kaydettiği iki dosyada (Yargıtay ilamı, üst yazı) notlar dosyadaydı, yapı geçerliydi.
  Referans okuyucunun kendi çizim motoruyla (Gezgin önizleme işleyicisi "referans okuyucu PDF Preview Handler", `test/pdf_onizleme.ps1`: ekranda ama DWM ile
  gizli pencere, PrintWindow) doğrulandı: vurgular, yazılar, yapışkan not referans okuyucuda görünüyor. Referans okuyucu IAC (AcroExch.PDDoc) bu kurulumda
  E_NOINTERFACE (Reader kipi). Neden: notlar Ctrl+S'ye dek yalnızca bellekteydi. Karar: `otomatikKaydet` varsayılan true, eski ayar dosyalarında
  bir kez true (`otomatikKaydetTasindi`). Otomatik kayıt başarısız olursa (dosya referans okuyucuda açık, yazmaya kapalı) engelleyici pencere açılmaz:
  bir bildirim, o belgede otomatik kayıt elle kayda dek durur (`b._otoKayitDurdu`).
- [x] **Yazı kalınlığı ve netlik**: kullanıcının yan yana görüntüsünde (solda referans okuyucu, sağdaki şerit referans okuyucunun sağ bölme düğmesi; sağda PDEfe)
  iki yarı aynı ölçekte (1,648 cihaz px/pt; büyük olasılıkla %125 Windows ölçeği, PDEfe %99), PDEfe'de UYAP tebligatının Times-Bold satırları
  %19–27 fazla mürekkep, küçük Arial eşit. Test örneğinde `--force-device-scale-factor=1.25` ile aynı koşul kuruldu (PDEfe/referans okuyucu %31, kullanıcıda
  %24). Sentetik kalınlık yok (FontFace "Times New Roman Bold" gerçek yüz); fark Chromium'un DirectWrite çiziminden (ClearType + kontrast):
  `--text-contrast=0` kalını %13'e indiriyor ama küçük Arial'ı referans okuyucudan %23 açık ve renk saçaklı yapıyor, canvas `textRendering` etkisiz,
  `--disable-lcd-text` etkisiz. Karar: glifler ana hatlarından çizilir (PDF.js `disableFontFace`): fazlalık %13 (kullanıcı ölçümüne göre ~%6),
  gri yumuşatma, döndürülmüş sayfada aynı. Gömülü olmayan standart 14 font için PDF.js'in Foxit/Liberation yedeklerinde ş, İ, ğ yok ("Duru ma",
  "Bilirki i"): özel `BinaryDataFactory` Windows'un Times New Roman / Arial / Courier New dosyalarını verir (referans okuyucunun Windows'ta yaptığı gibi).
  Gömülü olmayan standart dışı fontlar (kullanıcının 315 PDF'inin 202'sinde; çoğu UYAP doğrulama satırındaki Consolas, "e-imzalı" Segoe Script,
  "E-İMZA" Myanmar Text, Cambria) ana hat verisi olmadığından Chromium'la çizilir: PDF.js `FontLoader.prototype.bind` sarılıp Windows'taki
  fontları `local()` ile PDF.js'in aile adına bağlanır (yoksa PDF.js genel yedeği). Glif yolları PDF.js 6'da moveTo/lineTo ile kurulduğundan
  keskinlik.js'in ince dikdörtgen oturtmasına giriyordu ('l', 'I', '-' ızgaraya oturtulunca aynı harf farklı kalınlıkta): `metinYolu` ile
  karmaşık işaretlenir. Çizim süresi ölçüldü (TTK, PDF32000, TBK; sayfa başına ~15–20 ms, iki yöntemde aynı). Ayar: Görünüm › Yazı çizimi
  ("Dengeli" / "Windows ClearType"), belgeler yeniden açılınca. Dayanılan PDF.js iç adları: `_transport.fontLoader`, `FontLoader.bind`,
  `FontFaceObject.getPathGenerator`, `compiledGlyphs`; pdfjs-dist yükseltmesinde denetlenmeli (yoksa çökmez, standart dışı fontlar genel yedekle).
  Açık: Tw Cen MT gibi gömülü olmayan bazı fontlarda "ğ" iki yöntemde de bozuk (PDF'in kodlaması; önceden de öyle).
- [x] **Döndürülmüş sayfa**: yan çevrilen sayfada Chromium glifleri döndürülmüş ipuçlarıyla (hinting) çiziyordu; harfler ince, düzensiz. Ana hat
  çizimiyle düzeldi (ayrı bir tuval döndürme gerekmedi).
- [x] **Vurgu çubuğu**: vurgu ailesine tıklama (`pointerDown`, ISARET) `notCubuguAc`: renkler (VURGU_RENKLERI; varsayılan rengi değiştirmez),
  Not ekle / Notu düzenle (kalıcı balon), Kaldır. `degisti()` çubuğu yeniler (renk, geri al, silme). Aynı notun geçici balonu çubuğu örtmesin
  diye açılmaz. Konum seçim çubuğu gibi (görünür parçaların birleşimi, altı / üstü).
- [x] **Koyu sayfada yazı**: koyulaştırılmış sayfa tuvalde invert + hue-rotate ile gösterilirken HTML yazı kutuları özgün renkteydi (siyah yazı
  siyah sayfada). `.koyu-sayfa` altında `.not-freetext`, `.yazi-duzenleyici`, çizim notlarına aynı CSS filtresi; dosya rengi değişmez.
- [x] **Dolgu paleti**: ayrı Dolgusuz (∅) düğmesi kalktı; Dolgu rengi düğmesi palet açar (Dolgusuz, 10 renk, Diğer renk → gizli
  `input[type=color]`.click()). Palet açıkken Esc (`duzenleyiciEsc`) ve dışarı basış yalnızca paleti kapatır.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 13.
- [x] **Sekmeler ve pencereler** (r014-arayuz): `.sekme` 168 px sabit ("(2)TensipZapti (9).pdf" ad alanına sığsın), ipucunda ad ve yol.
  Örtüye tıklama `ortu.js` `ortuTiklamasiBagla` (basış ve bırakış örtünün kendisinde, sol tuş; içeriden dışarı sürükleme kapatmaz):
  araç pencereleri (`Pencere` kurucusu, `kapat(null)` → kapatmadanOnce), Ayarlar, Yazdır (seçenekler ve hazırlık), F1, parola, Ctrl+Tab.
  Mesaj kutuları uygulama içinde (`mesajKutusu.js`; aynı seçenekler / sonuç, iptal varsayılanı yerel kutunun cancelId'si): en üstteki kutu
  tuşları pencere düzeyinde yakalar; açıkken `menu:komut` ve `pencere:kapatIstegi` yok sayılır (yerel kutu pencereyi kilitliyordu).
  Test örneği artık mesaj kutularını kendiliğinden yanıtlamaz: senaryolar `window.__pdefeOtoYanit` (tek yanıt) ya da
  `window.__pdefeYerelKutu = true` (eski yol: test:diyalogYanitlari kuyruğu, test:diyalogKaydi) verir. Ana süreçte 'mesaj:kutu' yalnızca
  bu kanca için duruyor. Önceden var olan hatalar: çubuk dışında biten sekme sürüklemesinde sıra modele yazılmıyordu; `Pencere.kapat`
  soru açıkken başka yoldan kapanınca 'kapandi' iki kez gidiyordu. Testler: test/ortu_tiklama.mjs (155), test/sekme_genislik.mjs (16).
- [x] **Araç pencereleri** (r014-araclar): `kayitSecimi` `geriAlinabilir` (uyarı / bilgi satırı), `klasorKipi` (PDF ayır), 
  `uzerineKullanilabilir(evet, neden)` (devre dışı seçenek, kendiliğinden geri seçilmez), `segmentliSecim.etkin`. Sayfaları düzenle: alan
  seçimi (`_alanSecimiBagla`: setPointerCapture, kenarda hızlanan kaydırma, Esc), Yeni belge çekirdek `sayfalar_uygula` ile (sayfalar
  dosyadaki kayıtlı hallerinden; yapısal kayıttan sonra girdi kimliğiyle eşlenir, kaydedilmemiş düzende önce kaydettirir), Üzerine yaz
  Döndür ve kaydet gibi (geri alınabilir komut + normal kayıt). PDF ayır Üzerine yaz yalnızca tek dosya üreten ayırmada; çekirdek
  `_ayir_uzerine` (önbellek ve kaynak tanıtıcıları kapatılıp os.replace; yazmadan sonra ilerleme bildirilmez, geç iptal yazılmış dosyayı
  yazılmamış göstermesin). Görsel birleştirmede Orijinal boyut kenarsız, sayfa tam pt'ye yuvarlanır ve görsel kutusu sayfa kutusudur
  (`keep_proportion` kapalı, en çok 0,5 pt gerilme). Paylaş karosu kaldırıldı. Testler: test/araclar_testi.py (68), test/senaryo13.mjs (59).
  Açık: insert_pdf Popup ve yanıt notlarını, parça dışına giden bağlantıları taşımaz (yapısal kayıttaki gibi); kenar "mm" etiketli ama pt.

### Revizyon 0.1.5 (2026-09-23, kullanıcı geri bildirimi)
Ayrıntı: CHANGELOG.md. Kullanıcı 5 istek bildirdi (referans okuyucu ile yan yana ekran görüntüsüyle). Kök nedenler ve kararlar:
- [x] **"Bazı yazılarda bulanıklık"**: ekran görüntüsündeki PDEfe yarısı test örneğinde piksel piksel yeniden üretildi (%100 Windows ölçeği,
  PDEfe genişliğe sığdır = 1,1521; ortalama fark 0,04 gri düzeyi), referans okuyucu yarısı aynı ölçekte (1,520 px/pt) hizalanıp ölçüldü. 0.1.4'ün
  ana hat çizimi (ipuçsuz, gri) küçük düz yazıyı soluk çiziyordu: 7 pt Times paragrafı referans okuyucudan %28 açık, 8 pt Arial %8. Referans okuyucu küçük
  yazıyı ipuçlarıyla ve LCD yumuşatmasıyla çiziyor; Chromium'un ClearType'ı aynı ölçekte eşit (+%2, +%4), kalın yazıyı ise +%11 (%125
  ölçekte +%24) koyu çiziyor, ana hat ±%0. Karar: karma çizim. Belge yine disableFontFace ile açılır (işçi her yazı tipinin glif yollarını
  gönderir); FontLoader.bind sarmalayıcısı kalın olmayan (ad: bold/heavy/kalın, büyük harfle Black/Demi; PDF.js bold/black; OS/2
  usWeightClass ≥ 600, PDF.js'in kurduğu "*21*" tablosu sayılmaz) yazı tipinde `disableFontFace`'i nesnede erişimciyle gölgeler: bind
  sırasında false (FontFace kurulur), showText sarmalayıcısının hesapladığı yazı yönü düzse (tuval × metin matrisi × yatay ölçek: a, d > 0,
  b, c ≈ 0; dikey yazı değil) false, değilse true (ana hat). FontFace yüklenemezse PDF.js true yazar, yazı tipi hep ana hatla çizilir.
  showText PDF.js'te numaralı OPS anahtarıyla çağrıldığı için o anahtar da değiştirilir (ilk denemede yalnızca adı sarılmıştı, etkisizdi).
  Ölçüm: paragraf +%2, Arial +%4, kalın ±%0, başlık +%6; 44 sayfalık belgede sayfa başına 36 ms (değişmedi), 43 PDF'lik taramada konsol
  temiz. Döndürülmüş sayfada (90/180/270) yazılar ana hatla (0.1.4 gibi). Ayar değeri 'anaHat' korundu ("Dengeli" = karma).
  Açık: döndürülmüş sayfada küçük yazı soluk; gömülü olmayan barkod yazı tipi (IDAutomationHC39M, UYAP "Taahhütlü No") referans okuyucuda referans okuyucu
  Sans MM ile genişletilmiş, PDEfe'de monospace (Consolas) ile.
- [x] **Dolgu düğmesi yamuk**: `button.ikon.kucuk { width: 26px }` aynı özgüllükteki `.yazi-bicim button.dolgu-dugme { width: auto }`'dan
  sonra geldiği için düğme 26 px kalıyor, esnek kutu örneği 12,3×18'e sıkıştırıyordu. Özgüllük artırıldı, içerik daralmaz.
- [x] **Araçlar penceresi**: ızgara flex-wrap + ortalama (satırda 3, dar pencerede 2); son satır ortalı. `_dikey` sütun sırası yerine
  geometriyle (sonraki satırda yatayda en yakın; eşitlikte aşağıda sağdaki, yukarıda soldaki: aşağı-yukarı geri döner).
- [x] **Sekmeler %30 dar**: 168 → 118 px, yazı 12 px, iç boşluk ve kapat düğmesi küçük; "ustyazi (100).pdf" (12 px'te 84,6 px) sığar,
  "(2)TensipZapti (9).pdf" artık kısalır (0.1.4'ün 168 px kararı kullanıcı isteğiyle değişti).
- [x] **Görüntü birleştir**: yeni görüntü öğesi `sayfaBoyutu: 'orijinal'`; seçenekler "A4'e sığdır" / "Orijinal" ("boyut" sözcüğü kalite
  seçimiyle karışıyordu). Çekirdeğin varsayılanı (alan yoksa "a4") değişmedi, arayüz her zaman gönderir.
- [x] Testler: test/senaryo13.mjs 1 ve 7 (klavye gezinmesi ortalı alt satırla, varsayılan Orijinal), test/sekme_genislik.mjs (118 px). Ayrıca
  goruntuleyici `sayfaBoyutlariniYukle`: belge açılır açılmaz kapatılınca "Transport destroyed" işlenmemiş hata olarak düşüyordu.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 14.

### Revizyon 0.1.6 (2026-09-23, kullanıcı sorusu)
- [x] **Görüntü birleştir'de "Yüksek" > "Orijinal"** (kullanıcıda 3,53 / 3,06 MB): kayıplı seviyeler görseli her durumda yeniden kodluyordu.
  Kaynak JPEG seviyeden düşük kaliteyle kaydedilmişse (UYAP taraması q≈75, telefon fotoğrafı) q90 yeniden kodlama büyütüyor (tarama
  487 → 652 KB; 4:4:4 alt örnekleme de pay ediyordu), az renkli ekran görüntüsünde JPEG PNG'den büyük (0,09 → 0,33 MB). "Orijinal" sayfa
  varsayılanıyla (0.1.5) büyük fotoğraf 300 dpi sayılıp "Yüksek"te hiç küçültülmediği için daha sık görünür oldu. Karar: `_buyutmeyen`
  kayıplı sonucu PDF'e gömülü boyutla özgün gösterimle (dokunulmamış JPEG ya da PNG) karşılaştırır, küçük değilse özgünü gömer. PNG'nin
  gömülü boyutu dosya/Pillow baytından %25 küçük ile %60 büyük arasında: kısayol yok, MuPDF'le ölçülür (`_gomulu_gorsel_boyutu` özetle
  önbellekli; Pillow görseli sözlük anahtarı olamadığından PNG kodu karenin kendisinde, `_pdefe_png`). Kayıplı kaynaktan gelip dokunulmadan
  gömülemeyen görselde (EXIF yönü, CMYK) karşılaştırma yapılmaz. Kaynak JPEG'in alt örneklemesi (get_sampling) yeniden kodlamada korunur.
  PDF öğelerinde MuPDF eşik altındaki JPEG'lere dokunmadığından sorun yoktu. Test: araclar_testi.py `test_kalite_buyutmez` (yapay düz
  çizimler yeniden kodlanınca büyümüyor; belirlenimci Mandelbrot yakın çekimi q60). Tahmin ile çıktı ±1 KB.
  Açık: EXIF yönlü telefon fotoğrafı "Orijinal"de PNG'ye çevrilip çok büyüyor (JPEG döndürülerek olduğu gibi gömülebilir).
