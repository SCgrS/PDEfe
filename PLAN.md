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
| bilirkişi ek raporu (UYAP, Word çıktısı), fdsafsd.pdf | Word; karışık gömülü/gömülü olmayan font, Cambria Math, görseller |
| UYAP (iText/JasperReports) dosyaları ×4 | Helvetica/Arial gömülü değil, kodlama yok → standart font eşlemesi; 595x879 sayfa |
| dergipark_3972595_ttk_tbk.pdf | 231 yer imi; **bozuk ToUnicode**: Ġ→İ, ġ→Ş, Ģ→ş (Word 2010 Türkçe hatası) |
| dergipark_5104529_zamanasimi.pdf | 52 sayfa, PDFium |
| PDF32000_2008_yerimli.pdf | 756 sayfa, 22 MB, 823 yer imi → performans ve İçindekiler testi |

## Teknoloji ve dosya yapısı
```
package.json            Electron 44, pdfjs-dist 6, electron-store 11, electron-updater 6, electron-builder 26
src/main/               ana süreç (ESM)
  main.js               tek örnek, pdefe:// protokolü, IPC (pano:icerik: Electron panosundan dosya/görüntü), ayarların pencerelere bildirimi
  pencereler.js         uygulama pencereleri (0.1.19: birden çok): kayıt, odak sırası, kapatma onayı ve Çıkış, dosyanın açılacağı
                        pencere, sekmenin pencereler arasında taşınması, sürüklenen sekmenin önizleme penceresi
  menu.js               Türkçe menü → etkin pencerenin renderer'ına komut kimliği gönderir
  ayarlar.js            electron-store şeması (bütün varsayılanlar, tek seferlik taşımalar)
  cekirdek.js           pdefe-core ile JSON-RPC (stdio, satır başına JSON, ilerleme mesajları)
  pano.js               Paylaş: dosyayı CF_HDROP olarak panoya koyar (PowerShell)
  gelistirme.js         test örneği kancaları (ayrı veri klasörü, ekran dışı pencere/boyut, yerel diyalog kuyruğu); paketlide kapalı
  preload.cjs           contextBridge: cagir / dinle / gonder / dosyaYolu
src/renderer/           arayüz (ES modülleri; derleme adımı yok, pdefe://app/ üzerinden sunulur)
  uygulama.js           giriş: sekmeler, komutlar, kısayollar, açma/kapatma/kaydetme, sürükle-bırak, araç çubuğu sıkıştırma
  goruntuleyici.js      PDF.js: tembel sayfa çizimi, bölgesel çizim (%6400'e kadar), düzenler, zoom, döndürme
  keskinlik.js          keskin çizim: görsel yeniden örnekleme (işçi + önbellek), ince çizgi ızgarası, maske tuvali kırpma
  sekmeler.js           sekme çubuğu, sürükle-sırala (işaretçi olaylarıyla, 0.1.14) ve çubuğun dışına sürükleyerek ayırma (0.1.19),
                        Ctrl+Tab seçici, açık belgeler listesi
  hayalet.html/.js      sürüklenen sekmenin önizleme penceresi (ad + sayfa görüntüsü; ana süreç imlecin altında tutar)
  baslangic.js          başlangıç ekranı: PDF aç, araçlar, altında son açılanlar; sağ altta ad ve sürüm (0.1.8; düzen 0.1.14)
  panel.js              sol panel: Sayfalar (çekirdekten küçük resim), İçindekiler, Yorumlar
  metin.js              seçim (boşluktan sürükleme, okuma sırası, sözcük/paragraf), temiz kopyalama
  arama.js              Bul kutusu: Türkçe duyarlı, tam sözcük, yer imi/yorum, tüm sekmeler, belge başına geçerli eşleşme
  notlar.js             not katmanı: okuma/çizim/etkileşim/balon/simge/araçlar, yazı düzenleyicisi, kaydetme farkı (diff)
  yaziParcalari.js      yazı parçaları (kalın/italik/altı/üstü/renk): işlemler, kanonik biçim, DOM çizme/okuma, seçim ofseti
  aracPenceresi.js/.css Araçlar düğmesinin karolu penceresi
  araclar/              araç pencereleri (kucult, sayfalar, dondur, ayir, gorselBirlestir; birlestir.js 0.1.2'de kaldırıldı);
                        ortak.js: pencere, çıktı satırı, standart kaydetme seçimi, üzerine yazma / kilit soruları
  komutlar.js           komut deseni: KomutYigini (geri al/yinele, kayıt konumu); komut tarifi (tanim): sekme başka pencereye taşınınca
                        yığın tariflerden yeniden kurulur
  durum.js              durum çubuğu
core/                   Python 3.12 (proje içi .venv, uv ile kurulu; PyInstaller ile tek klasör core/dist/pdefe-core/)
  pdefe_core.py         JSON-RPC döngüsü, belge önbelleği, temel yöntemler
  islemler/notlar.py    not yazma: Highlight/Text (referans okuyucu yapısı)/FreeText (gömülü Türkçe yüzler, parçalı /RC), kaydet
  islemler/araclar.py   küçült, sayfa düzenle, ayır, görüntü/PDF birleştir, döndür; geçici dosya + atomik yer değiştirme
  islemler/yapisal.py   sayfa tarifinden belge kurma, anlık kopya, konumsal not eşleme, içerik kutusu
test/                   surucu.mjs (CDP ile uygulamayı sürer; gerçek fare/klavye girdisi; hedefler / hedefSec: birden çok pencere),
                        baslat.ps1 / durdur.ps1, kurulum_bitis.ps1 (ayrı veri klasörlü, ekran dışı test örneği), senaryo*.mjs,
                        incele.py, not_testi.py, ornek_pdf_uret.py (yer tutucu PDF üretir ve PDF özetini verir),
                        gercek_fare.ps1 (+ fare_gonder.ps1, gercek_fare.mjs: görünmeyen masaüstünde Windows fare iletileriyle sekme ayırma),
                        sigdirma_kararli.mjs, sigdirma_rastgele.mjs (sığdırma ve kaydırma çubukları; ekran ölçeği 1, 1,25 ve 1,5'te
                        koşulur: baslat.ps1 -Olcek)
build/                  simge, NSIS, derleme betikleri
```

## Çekirdek protokolü
İstek `{"id", "method", "params"}` → yanıt `{"id", "result"}` / `{"id", "error"}`; uzun işler `{"id", "progress": {"yuzde", "mesaj"}}` gönderir.
Yöntemler: ping, belge_bilgi, kucuk_resim, notlar, not_gorunum, gorsel_kutulari, metin_sec, sayfa_metni, belge_birak,
notlar_kaydet, freetext_stil, baglantilar, form_gorunum (+ araçlar).

## Temel kararlar
- **Çizim**: PDF.js sayfa içeriğini çizer (annotationMode DISABLE); notların tamamı PDEfe'nin kendi katmanında çizilir
  (vurgu ailesi ve not simgesi SVG/HTML, PDEfe yazıları yerli HTML, diğer türler çekirdekten AP pixmap'i).
  Böylece taşıma/silme/düzenleme anında görünür, PDF.js belgesi değişmez.
- **Kaydetme**: renderer model + komut yığını gerçeği tutar; kaydederken dosyadaki duruma göre ekle/güncelle/sil farkı
  çıkarılır ve çekirdek artımlı (incremental) yazar. Yapısal (sayfa) değişiklikler tam yazımla; kayıttan sonra da
  geri al çalışır (fark tersine uygulanır).
- **FreeText**: Base-14 Helvetica Türkçe glif içermediğinden Windows fontunun (Segoe UI/Arial/Times/Calibri, kalın
  dahil) GID koruyan alt kümesi belgeye bir kez gömülür; görünüm akışı PDEfe üretir; /RC, /DA, /DS ve /PDEfe stil kaydı yazılır.
- **Kopyalama**: okuma sırasındaki seçim parçaları + metin katmanı geometrisi (girinti) → ardından çekirdekten (sözcük
  merkezi kutuda) daha temiz sürüm alınıp pano güncellenir. 0.1.12'den beri her zaman temiz (temiz / ham ayarı kullanıcı isteğiyle kalktı).
- **Arama**: PDF.js metin öğelerinden dizin, `toLocaleLowerCase('tr')` ile İ/ı doğru; bozuk glif düzeltmesi dizine de uygulanır.
- **Marka adı** (0.1.9, kullanıcı isteği: marka / telif kaygısı): başka PDF programlarının adı arayüzde, kodda, yorumlarda, testlerde,
  belgelerde ve sürüm notlarında geçmez. Ölçüm ve karşılaştırmada "referans okuyucu", kullanıcıya dönük metinde sonuç ("keskin",
  "başka PDF okuyucularında da görünür"). Commit öncesi `git grep -niE "ado[b]e|acroba[t]"` boş dönmeli.
- **Ayarlar sekmeleri** (0.1.9; 0.1.12'de kullanıcı isteğiyle birleşti): sekme adı içeriğini söyler. Görünüm, Açılış ve düzen (Belge
  açılışı + Sayfa düzeni, iki alt başlık), Not ve vurgu, Kaydetme, Güncelleme, Hakkında; yeni ayar içeriğine uyan sekmeye girer
  (ayarlarPenceresi.js BOLUMLER, ayarlar.js VARSAYILANLAR aynı sırada; eski kimlikler ESKI_BOLUMLER'le eşlenir).
- **Kaydetmeden çıkış sorusu** (0.1.12, kullanıcı isteği): uygulamanın her yerinde tek biçim, mesajKutusu.js `kaydetmedenCikisSorusu(ad)`:
  '"<ad>" belgesinde kaydedilmemiş değişiklikler var.' / 'Çıkmadan önce kaydetmek ister misiniz?' / Kaydet (Enter) | Kaydetme |
  Vazgeç (Esc). Araçta Kaydet aracın kendi kaydını çalıştırır; yeni bir çıkış sorusu eklerken bunu kullanın.
- **Pencereler** (0.1.19, kullanıcı isteği): her pencere ayrı renderer sürecinde tam bir arayüzdür; çekirdek, ayarlar, uygulama menüsü
  ve tek örnek kilidi ortaktır (main/pencereler.js). Bir belge aynı anda tek pencerede açıktır: pencereler açık dosyalarını ana sürece
  bildirir, açma isteği dosyanın açık olduğu pencereye yönlenir. Sekme pencereler arasında durumu paketlenerek taşınır (PDF.js'in
  elindeki baytlar, sayfa girdileri, not modeli, komut tarifleri); hedef pencere sekmeyi kurup onaylamadan kaynak sekmeyi bırakmaz.
  Yeni bir komut türü eklerken tarifini (`Komut.tanim`) ve komutDisari / komutIceri karşılığını da yazın: tarifsiz komut varsa o
  belgenin geri al geçmişi taşınmaz. Başka pencerelerde de anında etkili olması gereken yeni ayar uygulama.js
  `ayarDisaridanDegisti`'ye eklenir. Ana süreçte "pencere" tekil değildir: isteği gönderen pencere `pencereAl(e)` ile bulunur.

- **Yerleşim ve kaydırma çubukları** (0.1.20): ölçek, görünür boyut ve tuval alanının boyutu kaydırıcının dış boyutundan, çıkacak
  kaydırma çubukları öngörülerek hesaplanır (goruntuleyici.js `gorunumCoz`). Yerleşim hesabında kaydırıcının `clientWidth` /
  `clientHeight` değeri okunmaz: görünür boyut yerleşimin kendi çıkardığı çubuğa bağlıdır, sığdırma ölçeğiyle döngü kurar (görüntü
  titrer); `offsetWidth` de okunmaz (ekran ölçeği 1 değilken kesirli boyutu yuvarlar, alan kutudan taşar). Yerleşimi değiştiren iş
  test/sigdirma_kararli.mjs ve test/sigdirma_rastgele.mjs ile üç ekran ölçeğinde sınanır.

## Durum (2026-09-17)
- [x] Açma/sekme/görüntüleme, düzenler, zoom (görünür alana sığdır dahil), döndürme, sol panel, koyu tema (sayfayı koyulaştır, görselleri koru), son dosya ve kalınan sayfa, Ctrl+Tab seçici; keskin çizim (görsel, ince çizgi, taramada yüksek yakınlaştırma)
- [x] Metin seçme (boşluktan sürükleme, okuma sırası), temiz kopyalama, arama; bağlantılar (iç/dış), form alanları (görüntü)
- [x] Notlar: başka okuyucularda eklenmiş notları gösterme, vurgu/metin notu/not/yazı (seçime göre biçim) ekleme, taşıma, silme, geri al/yinele, artımlı kaydetme; döndürülmüş sayfada yazı dosyadaki yönüyle; yanıt yazma yok (dosyadakiler salt okunur)
- [x] Sayfa tarifi komutları (sil/sırala/döndür/boş sayfa/başka PDF'ten sayfa) ve yapısal kaydetme (anlık kopya), kayıttan sonra geri al
- [x] Ayarlar penceresi, yazdırma (sayfa başına görüntü dosyası, Windows diyaloğu, iptal)
- [x] Araçlar (araç çubuğundaki Araçlar penceresi ve menü): küçült (tahminli), sayfaları düzenle, ayır, görüntü/PDF birleştir (pano dahil), döndür ve kaydet; standart kaydetme seçimi (yeni belge / yedeksiz üzerine yaz); çekirdekte işbirlikçi iptal
- [x] Güncelleme (electron-updater; 0.1.3: 10 açılışta bir denetim, tek tıkla indir + sessiz kur + yeniden aç), kurulum (NSIS, Türkçe, .pdf ilişkilendirme, Varsayılan Programlar kaydı), GitHub Actions, README/CHANGELOG/THIRD_PARTY/LICENSE; paket derlendi ve paketli uygulama çalıştırıldı
- [ ] Kullanıcı doğrulaması (docs/DOGRULAMA.md): notların başka bir PDF okuyucuda görünmesi, kurulum sihirbazı, gerçek yazıcı, Gezgin çift tık; 0.1.2 için 12. bölüm (başka bir okuyucuyla aynı ölçekte kalite, döndürme kısayolları, pano hızı, Windows diyalogları)
- [x] GitHub deposu: SCgrS/PDEfe (özel)
- [ ] Karar bekleyen: README teşekkür bölümü

### Revizyon 0.1.1 (2026-09-16, kullanıcı geri bildirimi)
Ayrıntı: CHANGELOG.md. Kök nedenler ve kararlar:
- [x] Vurgu / not / yazı aracı ilk yüklemede çalışmıyordu: `Goruntuleyici.yukle()` sayfa elemanlarına
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
Ayrıntı: CHANGELOG.md. Kullanıcı referans okuyucuyla karşılaştırarak 34 istek bildirdi; gruplar ayrı dallarda uygulandı,
incelendi, birleştirildi ve birleşik sürüm yeniden doğrulandı. Kök nedenler ve kararlar:
- [x] **Keskin çizim** (keskinlik.js): 0.1.1'in zorladığı `imageSmoothingQuality='high'` küçültmede mip-map karıştırıp JPEG ve
  taramayı, büyütmede kübik yumuşatmayla karekodu yumuşatıyordu; PDF.js'in kendi seçimi (×1,33 üstünde en yakın komşu)
  pikselliydi. Görseller JS'de kutu (küçültme) / alan (büyütme) filtresiyle örneklenir (referans okuyucu yakalamasına en yakın sonuç);
  az renkli küçük görsel her ölçekte keskin, ×4 üstünde Chromium yumuşatması. Eksene paralel 4 px'ten ince çizgi ve
  dikdörtgen piksel ızgarasına oturtulur (referans okuyucunun ince çizgi geliştirme ayarı gibi): Path2D yöntemleri sarılıp yol kaydedilir (yol
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
  Dikey kaydırma çubuğu çıkınca 926 → 914 px yeniden yerleşim fazladan çizim yapıyordu; 0.1.20'de kapandı (yerleşim çubuğu öngörür).
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
  kerning/ligatür kapalı), satır sonu boşlukları çizgisiz. /RC referans okuyucunun biçiminde (p/span, xfa-spacerun), /DS, /Contents;
  /PDEfe kaydı: parçalar (JSON), /RC özeti (md5), Italik, Hiza, KenarRengi. /RC başka programda değişmişse yazı yabancı sayılır
  (AP'den çizilir, /RC ve /DS'den düzenlenir). Kayıttan sonra geri almada özgün kanonik biçim açıkça yazılır. Yön: `yazi.donus`
  dosyadan (AP /Matrix, yoksa /Rotate); çizim sayfa açısı − donus kadar döner, yeni yazı ekrandaki açıyla oluşur.
- [x] **Yazı düzenleyici ve uygulama**: düzenleyici açıkken `duzen.geriAl/yinele` (düğme, menü) düzenleyici geçmişinde çalışır.
  Araçlar, Paylaş, Yazdır, kaydetme, sekme/pencere kapatma ve düzenleyici dışındaki bir girdiye `focusin` önce
  `duzenleyiciBitir(true)` çağırır; Esc (düzenleyicide, biçim çubuğunda ya da başka bir girdide) referans okuyucudaki gibi düzenlemeyi uygular
  (`duzenleyiciEsc`), boş yeni kutu eklenmez, diyalog Esc'i stopPropagation ile düzenleyiciye ulaşmaz; otomatik kayıt düzenleme
  bitene kadar bekler; kaydırmasız düzende tekerlek ve PageUp/PageDown düzenleyiciyi sahipsiz bırakmaz. Açık: hizalama ve
  üstü çizili düğmesi yok (modelde ve çekirdekte var), yazı tipi/boyut kutu düzeyinde; referans okuyucuda oluşturulmuş döndürülmüş FreeText denenmedi.
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
  bloğu atlayan konumu reddeder. Regresyon: `test/secim_bloklar.mjs` (git dışı, yerel örnek belgelerle çalışır; 109 vaka, 65 beklentili; ek PDF'ler iki-sutun, kayik-bosluk,
  asili-girinti git dışında). Açık (0.1.1'de de vardı): sağ tık "Tümünü seç" DOM sırasıyla; iki imza bloklu Word sayfasında sağ
  bloğun satır sonunu aşan sürükleme ters seçebilir; sütun oluğundan ve bloklar arası çapraz sürüklemede sınır durumları; kısa
  satırlı imza bloğunda üç tık tek satır seçer.
- [x] **Gezinme**: ikiSurekli'de `sayfayaGit(gecerli+1)` aynı satırdaki sağ sayfaya gidiyor, `kaydirmaIsle` eşitlikte sol sayfayı
  seçiyordu → önceki/sonraki iki sayfa düzenlerinde çift bazında. Belge sonunda kaydırma sınırı için `sayfayaGit` hedefi
  {no, scrollTop, scrollLeft} saklanır; görünüm kımıldamadıysa hedef geçerli sayılır. Tek kalan son sayfa çift ölçeğinde sol
  sütunda (1 sayfalık belge tam genişlikte kalır). Zoom kuralı: iki sayfaya geçişte ve iki sayfa düzeninde açılışta her zaman
  'sayfa'; teke geçişte `tekSayfaZoomu` (varsayilanZoom sığdırma moduysa o, değilse 'genislik'). Kaydırmasız düzende tekerlek
  kenarda çevirir (bir hareket: 150 ms'den kısa aralıklı olaylar, 60 px; fiziksel tekerlekle denenmedi); aşağı ok / PageDown uzun
  sayfada önce kaydırır (karar: referans okuyucunun tuş davranışı, istek kelimesi kelimesine uygulanmadı). Açık diyalog/araç penceresi, SELECT ve
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
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 1, 10, 12 (Windows diyalogları, gerçek pano, başka bir PDF okuyucuda açma, kısayollar).

### Revizyon 0.1.4 (2026-09-23, kullanıcı geri bildirimi)
Ayrıntı: CHANGELOG.md. Kullanıcı 14 istek bildirdi (ekran görüntüleriyle); araç pencereleri ve sekme / pencere davranışı ayrı dallarda
(r014-araclar, r014-arayuz) yapılıp r014'te birleştirildi. Kök nedenler ve kararlar:
- [x] **"Notlar başka okuyucuda görünmüyor"**: kullanıcının o akşam kaydettiği iki dosyada (Yargıtay ilamı, üst yazı) notlar dosyadaydı, yapı geçerliydi.
  Referans okuyucunun kendi çizim motoruyla (okuyucunun Gezgin önizleme işleyicisi, `test/pdf_onizleme.ps1`: ekranda ama DWM ile
  gizli pencere, PrintWindow) doğrulandı: vurgular, yazılar, not referans okuyucuda görünüyor. Okuyucunun COM otomasyon arayüzü bu kurulumda
  E_NOINTERFACE (ücretsiz okuyucu kipi). Neden: notlar Ctrl+S'ye dek yalnızca bellekteydi. Karar: `otomatikKaydet` varsayılan true, eski ayar dosyalarında
  bir kez true (`otomatikKaydetTasindi`). Otomatik kayıt başarısız olursa (dosya başka bir programda açık, yazmaya kapalı) engelleyici pencere açılmaz:
  bir bildirim, o belgede otomatik kayıt elle kayda dek durur (`b._otoKayitDurdu`).
- [x] **Yazı kalınlığı ve netlik**: kullanıcının yan yana görüntüsünde (solda referans okuyucu, sağdaki şerit onun sağ bölme düğmesi; sağda PDEfe)
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
Ayrıntı: CHANGELOG.md. Kullanıcı 5 istek bildirdi (referans okuyucuyla yan yana ekran görüntüsüyle). Kök nedenler ve kararlar:
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
  Açık: döndürülmüş sayfada küçük yazı soluk; gömülü olmayan barkod yazı tipi (IDAutomationHC39M, UYAP "Taahhütlü No") referans okuyucuda
  kendi yedek yazı tipiyle genişletilmiş, PDEfe'de monospace (Consolas) ile.
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
  EXIF yönlü telefon fotoğrafının "Orijinal"de PNG'ye çevrilip büyümesi 0.1.7'de çözüldü.

### Revizyon 0.1.7 (2026-09-23, kullanıcı isteği)
- [x] **Telefon fotoğrafı**: EXIF yönü 3/6/8 olan JPEG (bu makinede WhatsApp fotoğrafları yön 8) de dokunulmadan gömülür; `EXIF_DONUSU`
  (saat yönünde 180/90/270, Pillow exif_transpose'la denetlendi) kullanıcı döndürmesine eklenip karenin dönüşü olur. Sayfa ölçüsü ve yeniden
  kodlama hep görünen (çevrilmiş) kareden; yeniden kodlanan kare yalnızca kullanıcı döndürmesini taşır (`bayt is ozgun_jpeg` ile ayrılır).
  Aynalı yönler (2, 4, 5, 7) PNG yolunda. PyMuPDF insert_image JPEG'in EXIF yönünü uygulamaz (deneyle). 364 KB fotoğraf: 3,1 MB → 364 KB.
- [x] **"Sağa döndür" ters**: PyMuPDF'in `insert_image(rotate=)`'i saat yönünün tersine; arayüzün dondurme'si saat yönünde (önizleme CSS
  rotate, PDF öğesinde /Rotate). Görseller 0.1.0'dan beri önizlemenin tersine dönüyordu (testler yalnızca ölçüye bakıyordu).
  `_gorsel_sayfasi_ekle` `rotate=(360 - dondurme) % 360`. Test: `test_gorsel_yonu` (köşe işaretleri, 54 vaka).
- [ ] MPO (çok resimli JPEG, bazı kameralar) hâlâ PNG yolunda; bu makinede örneği yok.

### Revizyon 0.1.8 (2026-09-23, kullanıcı geri bildirimi)
Ayrıntı: CHANGELOG.md. Kullanıcı 9 istek bildirdi (referans okuyucuyla yan yana ekran görüntüsü, kurulum son sayfası görüntüsü, karışık boyutlu
birleştirilmiş PDF). Kök nedenler ve kararlar:
- [x] **"Yazılar bulanık"**: ekran görüntüsünün solu PDEfe (renksiz, gri), sağı referans okuyucu (renkli alt piksel; ortadaki ▶ şeridi okuyucunun sol
  bölme düğmesi, 0.1.4'teki görüntünün tersi). Görüntüdeki satırların hepsi kalın (UYAP Times-Bold, gömülü değil → timesbd.ttf); PDEfe
  yarısı test örneğinde %115'te piksel piksel üretildi (mürekkep 269,4 / 270,4). Koyuluk referans okuyucuyla aynı (269,0), fark keskinlikte: ana hat
  çizimi ipuçsuz ve gri, referans okuyucu ipuçlu ClearType. ClearType kalın (Chromium DirectWrite) aynı ölçekte referans okuyucudan %13–17 koyu. Ölçüm:
  Times New Roman Bold ClearType'la ana hattından 8–11 px'te %25, 12 px'te %16, 16 px'te %6 koyu, 20 px üstünde eşit (Georgia, Garamond,
  Palatino, Book Antiqua, Cambria Bold benzer; Arial, Calibri, Segoe UI, Tahoma, Verdana, Trebuchet, Courier Bold ±%7 dalgalı). Karar:
  düz kalın yazı da FontFace ile (ClearType) çizilir, showText sarmalayıcısı globalAlpha'yı yazı tipi × boyut kovası (¼ px) başına bir kez
  ölçülen oranla (ana hat mürekkebi / ClearType mürekkebi, alt sınır 0,85) çarpar. Ölçüm: belgenin o yazı tipindeki gliflerinden en çok 24'ü,
  sayfa tuvaliyle aynı saydamlık kipinde, ekran kartındaki tek bir tuvalin üst yarısına ClearType, alt yarısına ana hat (getPathGenerator);
  tek getImageData. willReadFrequently (işlemci tuvali) ClearType'ı başka karıştırıp %15'e dek yanlış ölçtüğü için kullanılmaz; aynı
  tuvalden iki okuma konsola uyarı yazdırıyordu. Sonuç yazı tipi adı (alt küme öneki atılmış) | kip | kova anahtarıyla belgeler arasında
  saklanır (en çok 4000). Tebligatın dört kalın satırı referans okuyucuyla +2,6 / −0,8 / −2,8 / −0,5 %; 60 belgelik taramada konsol temiz, ilk çizim
  144–703 ms; ölçüm başına ~5 ms (tebligatta 8 kova, ilk açılışta), 200 adımlı yakınlaştırmada takılma ve bellek artışı yok. Taban 0,85:
  referans okuyucu küçük (10,8 px) kalın yazıyı ana hattından %5–9 koyu çiziyor; tam ana hat oranı (0,7'ye dek) 7 pt satırları referans okuyucudan %7–9 açık
  bırakıyordu. Döndürülmüş yazı ana hatla (değişmedi). Açık: %125 ölçekte (0.1.4 ölçümü: referans okuyucu ana hattından %13 açık) denenmedi.
- [x] **Başlangıç ekranı tıklanmıyordu**: `#gorunumler` (boş, position:absolute; inset:0) DOM'da `#baslangic`'ten sonra geldiği için üstteydi
  ve bütün tıklamaları yutuyordu (PDF aç ve son açılanlar hiç çalışmıyordu; belgeyle açılan uygulamada başlangıç ekranı görünmediğinden fark
  edilmemiş). `#baslangic` z-index:1 ve DOM'da sonra. Yeni başlangıç ekranı baslangic.js'te: PDF aç / Görüntü / PDF birleştir kartları
  (data-eylem; uygulama.js'in [data-komut] bağlaması yüklemede çalıştığından kullanılmaz), son açılanlar (×, Delete, sağ tık menüsü; dosyaya
  dokunulmaz), container query ile dar pencerede tek sütun. "Ctrl+O" yazısı kaldırıldı.
- [x] **X bağlantısı iki kez**: Hakkında'daki bağlantının kendi tıklama işleyicisi (kabuk:disAc) ve uygulama.js'in genel `a[href^=http]`
  işleyicisi ikisi de açıyordu. Yerel işleyici kaldırıldı; genel işleyici defaultPrevented olayı atlar.
- [x] **Haftalık güncelleme denetimi**: açılış sayacı (acilisSayaci, sonDenetimAcilisi, sonDenetimSurumu; ayarlar.js'te silinir) yerine
  sonDenetimZamani (ms). Açılışta hiç denetlenmemişse, 7 gün geçtiyse ya da saat geri alınmışsa (son denetim gelecekte) denetlenir; açık kalan
  uygulamada saatte bir bakılır (indirme sürerken / indirilmiş sürüm beklerken bakılmaz). Süreyi sunucudan yanıt alan her denetim (elle
  de) başlatır; ağ hatası başlatmaz. bekleyenGuncelleme kuralı aynı. Ayarlar'da son denetimin tarihi (guncelleme:durum.sonDenetim).
  Birim denemesi (test/guncelleme-e2e/birim.mjs) sahte saatle: 56 denetim.
- [x] **Genişliğe sığdır**: kaydırmalı düzende (surekli, ikiSurekli) ölçek geçerli sayfanın satırına göre hesaplanıyordu (belge en geniş
  sayfada açılınca / sığdırılınca hepsi küçük). Artık `baskinSatir()`: satır genişlikleri sıralanır, genişliği en darının %3 fazlasına dek
  olanlar bir küme; en kalabalık kümenin en geniş satırına sığdırılır (eşitlikte ortancaya yakın, sonra dar olan). Taşan satırda görünüm
  yatayda ortalanır (yerlesimHesapla; genislik ve sayfa kiplerinde). Kaydırmasız düzen ve öteki kipler gösterilen satıra göre. Hız: belge
  açılırken ilk 300 sayfanın boyutu 50'lik paralel isteklerle ilk yerleşimden önce öğrenilir, kalanlar arka planda (sıra sıra bekleniyordu);
  öğrenilmeyen sayfalar öğrenilenlerin en sık boyutunu alır (ilk sayfası farklı büyük belgede ölçek açıldıktan sonra sıçramasın). 1500
  sayfalık karışık belgede açılış 134 ms; kullanıcının 9 sayfalık birleşik PDF'inde baskın genişlik 1014 pt (4 sayfa), açılış 56 ms.
  0.1.2'deki "Açık: 'genislik' sekmeye dönünce geçerli sayfaya göre" maddesi kaydırmalı düzende çözüldü.
- [x] **Birleştir'de alan seçimi**: tek seçim (seciliKimlik) yerine küme; sağ tuşla (satırların üzerinden de) ve sol tuşla boş alandan
  sürükleyerek alan seçimi (sayfalar.js _alanSecimiBagla'nın dikey liste karşılığı: setPointerCapture, kenarda kaydırma, Esc, Ctrl/Shift
  ile ekleme). Windows'ta contextmenu sağ tuş bırakılınca geldiğinden sürüklemeden sonra liste yakalama evresinde yutulur. Ctrl/Shift tık,
  Ctrl+A, Delete; satır düğmeleri ve menü seçiliyse seçilenlerin hepsine; sürükle-sırala seçilenleri blok taşır, yukarı/aşağı bitişikleri
  birlikte kaydırır. Ctrl/Shift ile basış metin seçimini uzatmasın diye mousedown'da engellenir; Ctrl+A liste dinleyicisinde (pencerenin
  kendi Ctrl+A'sından önce).
- [x] **Kurulum son sayfası**: MUI2 onay kutularını 195 × 10 DLU (tek satır) çizer; "… (Windows Ayarlar açılır)" ikinci satıra kayıp
  kesiliyordu. Etiket kısaldı, açıklama MUI_FINISHPAGE_TEXT'te (MUI_FINISHPAGE_TEXT_LARGE: 60 DLU, kutular aşağı). test\kurulum_bitis.ps1:
  installer.nsh'teki bitiş tanımlarıyla küçük kurucu derler, görünmeyen masaüstünde (CreateDesktop) çalıştırıp PrintWindow ile yakalar;
  onay kutusu metninin kesilmesini görüntüden, etiketlerin sığmasını DrawText ile denetler (odak çerçevesi gizlenir). 0.1.7 tanımlarıyla
  "TAŞIYOR", yenisiyle hepsi "SIĞIYOR".
- [x] Testler: Masaüstü\PDF DENEME ve test/pdf'teki örnekler bu makinede yoktu; yerlerine İnenler'den benzerleri kondu (1.5.6098.pdf,
  fdsafsd.pdf yerine bir UYAP üst yazısı, dergipark_* yerine bir makale ve bir bilirkişi raporu, PDF32000 yerine 188 sayfalık taranmış
  dilekçe). senaryo13 60/60, sekme_genislik 18/18, ortu_tiklama 154/155: kalan "Enter (varsayılan Kaydet): kaydedip kapatır" adımı tek
  başına 3 turda da geçiyor (tam koşuda büyük olasılıkla iptal edilen Küçült, 188 sayfalık taramada çekirdeği hâlâ meşgul tutuyordu).
  Gerçek fareyle: Birleştir seçimi 19 denetim (sağ sürükleme, menü, Ctrl/Shift, toplu döndürme, çoklu sıralama, boş alandan seçim, Esc,
  Delete, Ctrl+A), başlangıç ekranı 11 denetim (PDF aç Aç penceresini ister, son açılan açılır, × yalnızca listeden kaldırır, Ctrl+O yok).
  60 belgelik tarama (İnenler, 211 üretici grubundan): konsol temiz. Uzun süren test oturumunda bir kez test örneği hiç çizmez oldu (sayfa
  yenilemesi düzeltmedi); yeni örnekte yinelenmedi, 200 adımlı yakınlaştırma ve 60 belge taramasında da görülmedi.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 17.

### Revizyon 0.1.9 (2026-09-23, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Üç istek: başka PDF programlarının adı hiçbir yerde geçmesin, son açılanları tutmak açılıp kapatılabilsin,
ayarlar sekmelerinin adı içeriğiyle örtüşsün.
- [x] **Marka adı**: iki marka sözcüğü 29 dosyada 232 yerde geçiyordu; 8'i arayüzde (Yazı çizimi seçeneğinin adı, otomatik kaydetme
  açıklaması, kilitli dosya uyarıları, çekirdeğin kilitli dosya iletileri). Hepsi kaldırıldı; ölçüm ve karşılaştırmalarda "referans
  okuyucu". PDEfe'nin yazdığı FreeText /RC'de `xfa:APIVersion` başka bir programın adı ve sürümüydü (PDEfe'nin kaydettiği her dosyaya
  giriyordu): artık `PDEfe:<sürüm>`; sürüm ana süreçten PDEFE_SURUM ortam değişkeniyle gelir (cekirdek.js), yoksa "0". /RC okuyan kod
  APIVersion'a bakmıyor, geri okuma aynı. Varsayılan not sarısının sabiti VARSAYILAN_SARI oldu. Önizleme betiği test/pdf_onizleme.ps1: CLSID'i sabit değil,
  .pdf'nin ShellEx\{8895b1c6-…} kaydından (HKCU Classes, HKCR, ProgID) bulur; -Clsid ile verilebilir. GitHub'daki 0.1.0, 0.1.2, 0.1.4,
  0.1.5 ve 0.1.8 sürüm notları CHANGELOG'un temizlenmiş bölümleriyle yeniden yazıldı (yalnızca "Bu sürümde" bölümü; indirme bağlantısı,
  boyut ve SHA-256 aynı). git geçmişindeki commit mesajlarına dokunulmadı (zorla push gerektirir).
- [x] **Ayarlar sekmeleri**: "Dosya"da varsayılan PDF görüntüleyici, "Notlar"da otomatik kaydetme, "Görünüm"de Döndür düğmesi,
  "Başlangıç"ta sayfa düzeni duruyordu. Yeni düzen (BOLUMLER): Görünüm (tema, koyulaştırma, yazı çizimi), Sayfa düzeni (yakınlaştırma,
  tek / iki sayfa, kaydırma, kapak — önceden ayarlarda yoktu —, Döndür düğmesi), Belge açılışı (varsayılan uygulama, kaldığım sayfa, son
  açılanlar), Notlar, Kaydetme (otomatik kaydetme, araçların çıktı klasörü), Kopyalama, Güncelleme, Hakkında. Eski bölüm kimlikleri
  ('baslangic', 'dosya') yenilerine eşlenir (ESKI_BOLUMLER). 'duzen.ayarlar' komutu isteğe bağlı bölüm kimliği alır.
- [x] **Son açılanları hatırla** (sonAcilanlariHatirla, varsayılan true): kapalıyken sonDosyalaraEkle yazmaz; kapatılınca liste silinir
  (dosya.sonTemizle); menuKur sonDosyalar() null alınca Son açılanlar'ı kurmaz (ayar:koy bu anahtarda menüyü yeniden kurar); başlangıç
  ekranı listele(yollar, { kapali }) ile bilgi satırı ve Ayarlar › Belge açılışı bağlantısı; Aç / Kaydet pencereleri 'dontAddToRecent'
  alır (Electron varsayılanı dosyayı Windows'un son kullanılanlarına ekliyordu; Gezgin'den çift tıklamayla açılanları Windows kendisi
  ekler). **Kaldığım sayfa** (kaldigimSayfadanAc): kapalıyken de sayfaKonumlari (dosya yollarıyla, 300 dosyaya dek) yazılıyordu; artık
  konumlariYaz kapalıyken yazmaz, kapatılınca kayıt silinir. ayarlar.js açılışta kapalı ayarın kalmış kaydını siler (eski sürümden gelen).
- [x] Testler: test/senaryo14.mjs 62/62, iki kez üst üste (sekmeler açık ve koyu temada, kartlar, eski kimlikler; iki anahtar gerçek
  tıklamayla, kapalıyken kayıt yok, açınca yeniden; başlangıç ekranı ve Ayarlar bağlantısı; Dosya menüsü test:menu kancasıyla; Aç
  penceresinin dontAddToRecent'i test diyaloğu kaydından; arayüzde ve menüde marka adı yok). Yeniden başlatmada açılış temizliği
  (kapalı ayarın kalmış konumları ve listesi silindi). araclar_testi 131/131. Test örneğinin çekirdeğiyle yazılan yazı notunda
  `xfa:APIVersion="PDEfe:0.1.9"`; not, test/pdf_onizleme.ps1 ile (gizli pencere) referans okuyucunun önizleyicisinde Türkçe
  karakterleriyle görünüyor. /AP'si silinmiş notu önizleyici hiç çizmediğinden (eski ve yeni üretici adlı iki dosya piksel piksel aynı,
  ikisinde de not yok) /RC'nin üretici adından bağımsız okunduğu bu yolla sınanamadı: DOGRULAMA 18.5. senaryo4 çalıştırılamadı (girdisi
  Masaüstü\PDF DENEME\DENEME PDF (2).pdf bu makinede yok); not kodunda (notlar.js, notlar.py) yorum dışında değişen satır yalnızca
  VARSAYILAN_SARI, URETICI_SURUMU ve kilitli dosya iletisi.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 18.

### Revizyon 0.1.10 (2026-09-24, kullanıcı geri bildirimi)
Ayrıntı: CHANGELOG.md. Kullanıcı: UDF'de girinti ayarı olan paragrafa yapıştırılan metinde gereksiz boşluklar (iki ekran görüntüsü:
1.5.6098.pdf s.15'ten "tehlike … bile," seçimi, UYAP Doküman Editörü'nde girintili ve girintisiz paragrafa yapıştırılmış).
- [x] **Kök neden**: kopyalamada önce renderer'ın metni (secimYapiliMetni → temizMetin; bu seçimde doğru, üç paragraf) panoya
  konuyor, birkaç yüz ms sonra çekirdeğin metni (metin_sec → temizMetin) uzunluk tutunca üzerine yazılıyordu. metin_sec (0.1.0'dan
  kalma) PyMuPDF blok değişiminde boş satır koyuyor, girintiyi bloğun kendi sol kenarına göre ölçüyordu. Bu PDF'te (mevzuat.gov.tr,
  Word çıktısı) her satır ayrı blok: her satırın arasına boş satır girdi, tek satırlık blokta girinti hiç görünmedi, temizMetin her
  satırı ayrı paragraf yaptı. UDF editörü her satır sonunu paragraf yapar: girintili paragrafta her satır girintili ve aralıklı
  başladı, girintiyle taşan "bu" alt satıra düştü; girintisiz paragrafta da satırlar birleşmemişti (göze batmıyordu).
- [x] **Çekirdek** (y_metin_sec): çok satırlı bloklarda davranış aynı. Tek satırlık iki blok arasında boş satır konmaz, satır
  üsttekinin devamı sayılır, koşullar: aynı sütun (sol kenarları aynı: sütunda en az iki satırın başladığı en soldaki x; yatay
  örtüşmeyle ölçülünce girintili satırın altındaki kısa son satır "başka sütun" çıkıyordu), olağan satır aralığı (sayfanın satırdan
  satıra uzaklıklarının ortancası) en çok 1,3 katı, blok numarası 1–3 artıyor (sayfa başlığı / altlığı içerikte ayrı yazılmış:
  bilirkişi raporunda mahkeme adı altlığı blok 0), üstteki satır sütunun sağına en az %80 yaklaşıyor
  (%60'ta ortalanmış başlık, adres, kitap kapağı birleşiyordu), alttaki satır madde imiyle (■ • ➢ ✓, Symbol / Wingdings özel alanı,
  "- ") başlamıyor, iki satırın hiçbirinde içindekiler noktalı dolgusu yok, noktalama ya da sayıyla biten satırdan sonra numaralı
  madde gelmiyor ("Kanunun / 49. maddesi" birleşir), üstteki satır büyük harfli başlık değil. Girinti tek satırlık blokta sütunun sol
  kenarına göre.
- [x] **temizMetin**: satır sonundaki yumuşak tire (U+00AD) glifDuzelt silmeden önce sözcüğü boşluksuz birleştirir (kitaplarda
  "insan lara" çıkıyordu; satırlar birleşince görünür oldu).
- [x] Karşılaştırma: 342 PDF'in (test/pdf, Masaüstü\PDF DENEME, İndirilenler) ilk 6 sayfası ve 1.5.6098 s.14–16, sayfanın tamamı
  seçilmiş gibi: panoya giden metin 687 sayfanın 35'inde değişti, hepsinde paragraf sayısı azaldı (satırlar birleşti). Birleşen
  satır sınırları tek tek okundu: mevzuat, dilekçe, bilirkişi raporu, taranmış yazı, özgeçmiş, kitaplar doğru; kalan kuşkulu tek
  örnek bir kitap künyesinde adres satırının altındaki satıra yapışması. Kurallar eklenmeden önce bulunan yanlışlar (broşürde madde
  imleri, içindekiler, altlık, kitap kapağı, adres satırı) giderildi.
- [x] Testler: test/kopyalama_testi.py 7/7 (sentetik satır başına blok PDF'leri: girintili paragraflar ve ortadan seçim, kısa son
  satır, madde imi / başlık / içindekiler, altlık ve paragraf boşluğu, çok satırlı bloklar değişmedi, yumuşak tire; kullanıcının
  belgesindeki seçim). test/senaryo15.mjs 5/5: test örneğinde gerçek fareyle seçim, sistem panosuna dokunmayan kopyalama olayı;
  renderer metni ve çekirdeğin pano:metin kaydı üç paragraf. araclar_testi 131/131.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 19.

### Revizyon 0.1.11 (2026-09-24, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı: kanundan kopyalanan metinde boşluklar yok; UYAP Doküman Editörü'nde paragraf aralığı 0,4 iken de 0
iken de "…isteyebilirler." ile "C. Zamanaşımı" arasındaki boş satır gelmiyor (iki ekran görüntüsü, 1.5.6098.pdf s.15). Başlıkların
kalınlığı kapsam dışı (kullanıcı kararı: düz metin kalır).
- [x] **Kök neden**: temizMetin paragrafları tek satır sonuyla ayırıyor (0.1.x'te çift satır sonu her paragraf arasına boş paragraf
  koyuyordu), metin_sec de belgedeki boş satırı paragraf arasından ayırmıyordu: boşluk bilgisi hiçbir yerde taşınmıyordu.
- [x] **Ölçüm**: TBK'de (Word çıktısı) boş paragraf bir boşluk karakteri olarak ayrı PyMuPDF bloğudur (get_text("words") vermez);
  satır aralığı 18,24, boş satırlı aralık 36,4–36,5 (2,0 kat). 342 PDF'te sayfanın ortancasına göre oranların dağılımı 2,0'da
  tepe yapıyor, 1,1–1,95 arası sürekli (paragraf aralığı, başlık, tablo). Paragraf aralığı: UYAP'ta 0,4 ≈ 1,65 kat (ekran
  görüntüsünden), bir Word dilekçesinde 1,78–1,82 kat, boş paragraf yok. Sayfanın ortancası yetmedi: TMK s.113 ve s.120'de 1,2
  aralıklı metinde tek aralıklı boş paragraf 1,83 kat; TTK s.55'te aralık sayfa içinde 17,64'ten 16,56'ya iniyor. Bu yüzden yerel
  aralık: üstteki satırın üstündeki ve alttakinin altındaki komşuya uzaklığın küçüğü (benzer boyda ve yatayda örtüşen komşu).
- [x] **Çekirdek** (y_metin_sec): alt alta iki satır arasında boş satır, fark ≥ 1,9 × yerel aralık ya da arada boş paragraf
  (yalnızca boşluktan oluşan satır; get_text("dict", TEXTFLAGS_TEXT), gerekince bir kez) varken fark ≥ 1,7 × min(yerel aralık,
  sayfanın ortancası) (alt alta tek satırlık başlıklarda iki komşu da boş satırla ayrık, yerel aralık boş satırı içerir). Çıktıda
  iki boş satır (paragraf arası ve boş satır). bas_bosluk / son_bosluk: seçimin sayfadaki ilk satırının hemen üstünde, son
  satırının hemen altında sütununda boş paragraf var mı (ortası satırın ortasından en çok 1,3 satır aralığı uzakta). Kanunlarda
  sayfa sonundaki boş paragraf 0,97–1,09 aralık uzakta; UYAP (iText) sayfanın sonuna, paragraf sonraki sayfada sürerken de son
  satırın 1,56–2,25 aralık altına boşluk satırı yazıyor: ilk denemedeki 1,5 penceresi iki dilekçede paragrafı sayfa sonunda böldü.
- [x] **temizMetin**: hamda art arda iki ya da daha çok tamamen boş satır, iki paragrafın arasına bir boş paragraf (en çok bir).
  Yalnızca boşluktan oluşan satır sayılmaz: renderer'ın tarayıcı seçimi yolunda (Tümünü seç) boşluk öğeleri satır olabilir.
  **sayfaMetinleriniBirlestir** (metin.js; uygulama.js kopyalama olayı): sayfaların çekirdek metinleri tek satır sonuyla, önceki
  sayfa son_bosluk ya da sonraki bas_bosluk ise iki boş satırla birleşir.
- [x] **Renderer'ın hızlı metni** (secimYapiliMetni) değişmedi, boş satır taşımaz: PDF.js metin katmanı boş paragraf satırını
  vermiyor ("" ve hasEOL), yalnızca geometriyle ikinci bir kural gerekirdi. Çekirdeğin metni test örneğinde kopyalamadan 14–15 ms
  sonra panoya geçiyor (çekirdek boşken).
- [x] Karşılaştırma: 342 PDF'in ilk 6 sayfası ve üç kanunun tamamı (1423 sayfa, tamamı seçilmiş gibi) ve 459 ardışık sayfa çifti:
  1297 sayfada yalnızca boş satır eklendi (5643), 51 sayfada boş satırın iki yanı artık ayrı paragraf (hepsi önceden yanlış
  birleşiyordu: taraf bilgileri tablosu, tablodan başlığa geçiş, özgeçmiş bölümleri, "zorunlu değildir. d. …"), 75 sayfa aynı.
  Sınırdaki kararlar (1,9–1,95 kat, boş paragraf kuralı) tek tek okundu; bir makale sayfası ve iki UYAP dilekçesi görüntüyle
  karşılaştırıldı: boş satırlar görüntüdekiyle aynı yerde. Kanunlarda TBK 627, TMK 1023, TTK 1515 boş satır; TBK'de 620'si
  1,9–2,1 kat, en küçüğü 1,94; TMK'de 8'i yalnızca boş paragraf kuralıyla.
- [x] Testler: test/kopyalama_testi.py 20/20 (yeni: boş paragraf, yalnızca bir satırlık boşluk, 1,83 kat boş paragraflı ve
  boş paragrafsız, 1,65 kat boşluk karakterli, çift satır aralığı, sayfa geçişi, sayfada süren paragraf, UYAP gibi sayfa sonu
  boşluk satırı, çok satırlı bloklar arasında bir satır boşluk, TBK s.15, TBK s.15→16, TMK s.120; "altlık" vakasında altlığın
  önünde artık boş satır var, "çok satırlı bloklar" vakasının PDF'inde paragraflar arasında bir satırdan büyük boşluk vardı: 8 pt'ye
  indirildi). test/senaryo16.mjs 6/6 (test örneğinde gerçek fareyle aynı sayfada ve sayfa geçişinde; çekirdeğin pano:metin
  kaydında boş paragraf), senaryo15 5/5, araclar_testi 131/131. Test örneğinde kullanıcının TBK'sinin kopyasıyla s.15 ve s.15→16
  seçimleri: boş satır var.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 20.

### Revizyon 0.1.12 (2026-09-27, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı 18 istek bildirdi (beş ekran görüntüsüyle: araç çıktı satırı, not balonu, çıkış sorusu, sayfa kutusu,
döndürme simgesi). Sekme adı soruldu: "Açılış ve düzen". Otomatik kaydetme kullanıcının kendi kurulumunda da kapansın dendi.
- [x] **Pencere kapatma**: `kapatmayaIzinAl({ degismeyenleriKapat })` pencere kapatma isteğinde (pencere:kapatIstegi) önce açık araç
  pencerelerini kapatır (ortak.js `aracPencereleriniKapat`: her pencerenin kapatmadanOnce'u kendi sorusunu sorar; biri açık kalırsa
  kapatma durur), sonra süren kayıtları bekler; kaydedilmemiş değişikliği olan belge varsa değişikliği olmayan sekmeleri soru açılmadan
  kapatır, sonra kalanları tek tek sorar. Vazgeç'te soru açık olan ve sonraki belgeler açık kalır (önceden sorulup "Kaydetme" denenler de:
  uygulama kapanmadıkça değişiklik atılmaz). Güncelleme kurulumu aynı işlevi degismeyenleriKapat olmadan çağırır (araçlar yine sorulur).
  Sekme sağ tık Diğerlerini / Sağdakileri kapat `sekmeleriKapat`: aynı sıra. Önceden araç penceresindeki kaydedilmemiş iş (Sayfaları
  düzenle, dolu birleştirme listesi) pencere X'inde hiç sorulmuyordu.
- [x] **Araç çıkış soruları**: Sayfaları düzenle (değişiklik) ve Görüntü / PDF birleştir (dolu liste; ad çıktı dosyasının adı) aynı
  soruyu sorar; Kaydet aracın kaydet() / birlestir()'ini çalıştırır, başarılıysa araç pencereyi kendisi 'tamam' ile kapatır (iç içe
  kapat: dış kapat false döner, pencere kapalıdır; aracPencereleriniKapat sonuca pencerenin kapali'sinden bakar). Süren işlem soruları
  ("… sürüyor", İptal et ve kapat / Sürdür) değişmedi.
- [x] **Araç çıktı satırı**: ciktiSecici kutuda uzantısız ad gösterir; ad() / yol() uzantıyla döner, ayarla() ikisini de alır, elle
  yazılan uzantı odak çıkınca silinir. Klasör çipi `<button>`; tıklanınca `kabuk:klasorAc` (shell.openPath; test örneğinde Gezgin açılmaz,
  test diyaloğu kaydına düşer). İpucu "Klasörü aç: <yol>", tam yol `data-klasor`'da (testler çıktı klasörünü oradan denetler).
- [x] **Ayarlar**: "Zaten varsayılan": ana süreç `kabuk:varsayilanMi` reg.exe ile HKCU `…\FileExts\.pdf\UserChoiceLatest\ProgId`
  (Windows 11'in yeni kaydı; varsa geçerli olan) ya da `UserChoice`'taki ProgId'yi okur, PDEfe.pdf ise varsayılan (bu makinede UserChoice
  eski bir programı, UserChoiceLatest PDEfe.pdf'i gösteriyordu). Okunamazsa düğme görünür; pencere odağı dönünce yeniden bakılır.
  Listeyi temizle (baglam.sonTemizle → dosya.sonTemizle: menü ve başlangıç ekranı da). Kopyalama bölümü, radyo kartları ve temizMetin
  kalktı (KALDIRILAN_ANAHTARLAR). otomatikKaydet varsayılanı false; `otomatikKaydetKapatildi` bayrağıyla eski kurulumlarda bir kez false
  (0.1.4'ün tersi yöndeki taşımasının bayrağı otomatikKaydetTasindi silinir). Otomatik kayıt zamanlayıcısı dolunca ayar yeniden okunur.
- [x] **Araç çubuğu**: Ayarlar düğmesi (dişli, `duzen.ayarlar`) Paylaş'ın sağında; Paylaş kopyala simgeli. Sayfa kutusu
  `--basamak` (sayfa sayısının basamağı; yalnızca değişince yazılır, araç çubuğunun MutationObserver'ı stil değişiminde yeniden sığdırır)
  × 1ch + 18 px, en az 30 px, 24 px yükseklik; yakınlaştırma kutusu da 24 px. sikisik-3'te sayfa kutusu ayrıca daralmaz.
- [x] **Döndürme simgesi**: kullanıcının örneği: alttan açık daire (yay 208°'den saat yönünde 125°'ye), yayın ucunda teğet yönünde dolu
  üçgen ok ucu (20'lik kutuda r 6,2, stroke 1,5); saat yönü tersi aynası; 180° yarım yay + dolu uç; Döndür ve kaydet karosunda dolu uç.
  Güncelleme ayar simgesi (yenile) değişmedi.
- [x] **Seçim çubuğu**: tek vurgu düğmesi (alt çizgi `--r` = vurguRengi) + ▾ (`renkler-acik` sınıfı, alt satırda 6 renk; açılınca
  secimCubuguKonumla yeniden yerleştirir) + not + kopyala. Renk seçimi vurgular ve vurguRengi olur. secimCubuguGizle renk satırını kapatır.
- [x] **Sekme okları**: `kaydir` uçta durur (true/false döner), `okDurumu` uçtaki düğmeyi devre dışı bırakır; basılı tutma uca varınca
  kendisi biter (devre dışı düğme mouseup almaz; bırakma pencerede de dinlenir).
- [x] **Not balonu**: `balonTurAdi`: metin notunda "Not:"; Yorumlar panelinde "Metin notu" kaldı.
- [x] Testler (her biri kendi temiz veri klasörlü, ekran dışı test örneğinde): test/senaryo17.mjs 42/42 (yeni; aynı örnekte üst üste de
  geçer), senaryo13 60/60 (çıktı klasörü denetimi çipin data-klasor'undan; araç kapatma sorusunda Kaydetme), ortu_tiklama 155/155 (0.1.8'de
  154/155), senaryo14 hepsi (sekmeler, eski kimlikler 'sayfa' / 'kopyalama' dahil), sekme_genislik 20/20 (uçta durma, tekerlek),
  senaryo15 5/5, senaryo16 6/6, oto_kayit_kilit 7/7 (otomatik kaydı bellekte açar), senaryo18 10/10 (yeni: araç ve sekme kapanınca
  dosyanın bırakılması, dosya adı değiştirilerek ölçülür), araclar_testi 131/131. vurgu_cubugu 11/12: "Kaldır vurguyu siler" 0.1.11
  kodunda da (ayrı çalışma ağacında, aynı PDF'le) aynı biçimde düşüyor; bu sürümün değişikliği değil. senaryo7'nin sekme adı güncellendi.
  kopyalama_testi çalıştırılmadı (metin kodu değişmedi).
- [x] **İnceleme** (üç boyutlu bulucu + her bulguya bağımsız çürütme; 8 bulgu doğrulandı, hepsi düzeltildi): Küçült'ün 'kapandi'da
  başlattığı sekme yenilemesi uygulama kapatılırken beklenmiyordu (iki soru üst üste açılabiliyordu) → Pencere 'kapandi' olayında
  detail.bekle(söz), kapanisIsi; aracPencereleriniKapat bekler. Birleştir'de kapatma sorusundaki Kaydet dosyalar okunurken birleştirmeye
  başlıyordu → birlestir() okuma bitmeden çalışmaz. reg.exe (ve Paylaş'ın powershell.exe'si, önceden de) çıplak adla çalıştırılıyordu:
  süreç çalışma klasörü (çift tıklanan PDF'in klasörü) arama yolunda → System32 tam yolu. ▾ açılınca çubuk genişleyip yeniden
  ortalanıyor, ▾ imlecin altından kayıp ikinci tık Not ekle'ye düşüyordu → renk satırı kapalıyken de genişlikte yer tutar (yükseklik 0,
  görünmez), üstteyken ('ustte') satır yukarı açılır; üstte / altta kararı renk satırı sayılmadan. "x.pdf.pdf" seçilince uzantı iki kez
  siliniyordu → kutuGovde bayrağı. Devre dışı Listeyi temizle soluk değildi; README'de "İstenirse ham kopyalama" kalmıştı;
  test/oto_kayit_kilit.mjs varsayılanı açık bekliyordu (artık bellekte açar).
- [x] **Çekirdeğin belge önbelleği** (önceden de vardı; test/cikti/s17 silinemeyince görüldü, kullanıcı bu sürümde istedi): araçların
  okuttuğu dosyalar (gorsel_bilgi, sayfa_boyutlari, belge_bilgi, kucuk_resim, sayfalar_uygula kaynakları) BelgeOnbellek'te açık kalıyor,
  araç kapanınca belge_birak çağrılmıyordu; araç kapandıktan sonra dosya PDEfe kapanana dek silinemiyor / yeniden adlandırılamıyordu.
  uygulama.js araçlara `aracCekirdek` verir: istekteki okunacak yollar (yol, oge.yol, ogeler[].yol, tarif[].kaynak; hedefler değil)
  kaydedilir; ortak.js `aracPenceresiKapaninca` son araç penceresi kapanınca `aracDosyalariniBirak` → `kullanilmayanlariBirak`:
  açık sekmelerin kullandığı yollar (dosyası, yüklediği dosya, sayfa kaynakları, anlık kopya) dışındakilere belge_birak. Sekme
  kapanınca da sekmenin bütün yolları (başka PDF'ten eklenmiş sayfalarınki dahil) aynı yolla bırakılır (önceden yalnızca b.yol).
  Çekirdek y_belge_birak aynı dosyanın başka yazımla anahtarlanmış girdilerini de bırakır (araç yöntemleri os.path.abspath, sekmeler ham
  yolla açar; pdefe-core.exe yeniden derlendi, derlenmiş exe'de iki yazımla açılıp üçüncüyle bırakılan dosyanın adı değiştirilebildi).
  Çekirdek istekleri tek işçi iş parçacığında sırayla işlendiğinden bırakma süren okumayı kesmez.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 21.

### Revizyon 0.1.13 (2026-09-27, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı 11 istek bildirdi (iki ekran görüntüsüyle: seçim çubuğu, Sayfaları düzenle araç çubuğu). Sorulup yanıtlanan:
"Son açılanlar" kapalıyken kutu tamamen kalksın ("kutucuğu kalsın" yazılmıştı; 0.1.12'de kutu zaten bilgi satırıyla kalıyordu); döndürme
kısayolu Claude'a bırakıldı (Ctrl+R / Ctrl+Shift+R); sürüm 0.1.13 (0.1.12 yayımlanmadan).
- [x] **Adlar**: "Yapışkan not" arayüzde, menüde, Yorumlar panelinde, kodda (notlar.js yapiskanNotKoy → sayfayaNotKoy), testlerde ve belgelerde
  (geçmiş sürüm notları dahil) "Not"; yeni Text notunun /Subj'i çekirdekte 'Not' (başka okuyucuların yorum listesinde görünür). Eski
  tek seferlik yama betiklerinde (test/yama_*.py, test/wf) eski ad kaldı. Araçlardaki "Kaydetme" bölüm başlığı "Kaydet" (ekran okuyucu adı
  "Kayıt biçimi"; kaydetmeden çıkış sorusunun Kaydetme düğmesi ve Ayarlar'ın Kaydetme sekmesi değişmedi), "PDF'ten sayfa ekle" → "PDF ekle".
- [x] **Seçim çubuğu**: renkler ▾'nin altında dikey sütun (`.renk-ac-kap` içinde position:absolute), çubuk 171 → 113 px; sütun çubuk seçimin
  altındaysa aşağı, üstündeyse yukarı, o yönde yer yoksa öteki yöne, ikisine de sığmazsa daha çok yer olana açılır ('renkler-yukari').
- [x] **Açılış sekmesi**: + (`#sekme-yeni`, son sekmenin hemen sağında; `#sekme-liste` artık flex 0 1 auto) ve Ctrl+T açılış sayfasını
  "Yeni sekme" sekmesinde açar. Sekme belge değildir: `baslangicSekmeleri` kümesi, aktifId açılış sekmesi olabilir, aktif() null.
  dosyaAc: açılış sekmesi etkinken önde açılan belge onun yerini alır (sekmeler.ekle once), zaten açık dosyada o sekmeye geçilir ve açılış
  sekmesi kapanır; yükleme başarısızsa açılış sekmesi aynı yere geri gelir; `yenile` seçeneği (araçların sekmeyi diskteki yeni hâliyle
  yeniden açması: ortak.js sekmeyiYenile, küçült) açılış sekmesini tüketmez. Açık belge kalmayınca açılış sekmeleri de kalkar (sekmesiz
  açılış ekranı, uygulamanın ilk hâli); pencere kapatmada değişmeyen sekmelerle birlikte kapanır. Sağ tık menüsünde Klasörde göster / Yolu
  kopyala devre dışı; Ctrl+Tab seçicisinde + simgesi; Açık belgeler listesinde aramaya gitmez. Seçim çubuğu açılış sekmesine geçince gizlenir.
- [x] **Açılış ekranı**: büyük PDF aç (`.karsilama-ac`), altında sürükle-bırak ipucu, beş araç kartı (ARACLAR), sağda Son açılanlar;
  "Son açılanları hatırla" kapalıyken kutu gizli, içerik 640 px ve ortalı (`.karsilama.son-kapali`).
- [x] **Belgesiz araç**: ARACLAR belge:true araçların komutu sarılır: belge yokken Aç penceresi (coklu:false, başlık "<araç>: PDF seçin"),
  açılan belgeyle araç açılır; açılış ekranı kartları, Araçlar penceresi (soluk karo ve "önce bir PDF açın" notu kalktı) ve menü aynı yol.
- [x] **Araç ipuçları**: Pencere.altMetinAyarla ve alt şeritteki ipucu satırları kalktı; F1 penceresi "Kısayollar" (menüde de), üç sütun,
  üçüncüsü Sayfaları düzenle ve Görüntü / PDF birleştir'in fare / tuş kullanımı.
- [x] **Kısayollar** (hepsi gerçek girdiyle sınandı; kullanıcının klavyesi Türkçe Q, 041F): menü hızlandırıcıları sanal tuş koduyla eşlenir,
  Türkçe Q'da VK_OEM_PLUS yok (+ Shift+4, = Shift+0): Ctrl+= ve Ctrl+Shift+= hiç çalışmıyordu. Yakınlaştırma sayfada (uygulama.js
  yakinlastirmaTusu: e.key '+', '=', '-', '_', sayısal + / −, sayısal 0 yalnızca key '0' iken; Shift'li − de uzaklaştırır, döndürmez),
  menüde registerAccelerator:false. Döndürme Ctrl+R / Ctrl+Shift+R (hızlandırıcı). Ctrl+PageUp/PageDown (girdide de) ve Ctrl+←/→ (girdide
  değil) önceki / sonraki sekme, uçta durur. Ctrl+Tab seçicisinde ← → ↑ ↓ Enter Esc; ilk Ctrl+Shift+Tab en eskiye, sonrakiler birer geri.
  Açık pencere varken (ortuAcik: mesaj kutusu, .diyalog-ortusu, .arac-ortusu, .ayarlar-ortusu) Ctrl+Tab, Ctrl+1–9, Ctrl+Z/Y/A, Ctrl+PageUp/
  PageDown arkadaki belgeye gitmez; menu:komut'ta döndürme, sekme ve açma komutları da (ORTU_ACIKKEN_CALISMAYAN; Ctrl+W yazdırılan
  belgeyi kapatıyordu). Yazı düzenleyicisi ve not balonu sekme geçişi ve yakınlaştırma tuşlarını belgeye geçirir (notlar.js
  belgeKisayoluMu). Sayfaları düzenle'nin tuşları araç çubuğundaki düğmeden sonra da (govde dinleyicisi), Birleştir'in Delete / Ctrl+A'sı
  satır düğmesinden sonra da çalışır. Ctrl+F yalnızca metin katmanındaki seçimi alır; Bul kapalıyken gizli girdideki input (başka kutuda
  Ctrl+Z Chromium'un çerçeveye ortak geri alma yığınından onu geri alabilir) aramaz. Sekme çubuğunun her yerinde tekerlek sekme değiştirir.
- [x] **Test altyapısı**: test/baslat_gizli.ps1 test örneğini görünmeyen ayrı bir masaüstünde başlatır; `test:odakla` (yalnızca
  PDEFE_TEST_GIZLI_MASAUSTU=1) pencereyi orada etkinleştirir: menü hızlandırıcıları yalnızca etkin pencerede çalıştığından ekran dışı örnekte
  hiç sınanamıyordu; `test:tusGonder` (webContents.sendInputEvent) tarayıcı sürecinin girdi yolu, etkin pencerede CDP tuşu da menüye
  ulaşır. surucu.mjs `tusHam` (key / code / sanal tuş ayrı: Türkçe Q taklidi).
- [x] Testler: test/kisayol_dosya.mjs 163/163, test/kisayol_gorunum.mjs 117/117 (menü kısayolları görünmeyen masaüstünde), test/kisayol_araclar.mjs 91/91,
  test/senaryo19.mjs 111/111 (yeni); senaryo13, 14 (Son açılanlar kapalıyken kutu gizli), 17, 18 hepsi, ortu_tiklama 155/155, sekme_genislik 20/20,
  vurgu_cubugu (deneme-notlu) hepsi; düzeltmelerden önce: senaryo15 5/5, senaryo16 6/6, oto_kayit_kilit 7/7, araclar_testi 131/131,
  kopyalama_testi 20/20. İlk turda kısayol testleri 7 hata buldu (Ctrl+Shift+Tab art arda en eskiye sıçrıyordu; Ctrl+F sayfa kutusunun
  seçili numarasını arıyordu; Bul kapatılınca bekleyen arama ve başka kutudaki Ctrl+Z gizli aramayı çalıştırıyordu; açık pencerede Ctrl+1–9,
  Ctrl+Tab, Ctrl+Z/Y, Ctrl+W, Ctrl+T arkada çalışıyor, sonra Esc pencereyi kapatmıyordu), araç testleri odak kaybını (düğme devre dışı
  kalınca / satır silinince odak BODY'ye düşüp Esc ve Ctrl+A pencereye gitmiyordu: ortak.js en üstteki pencereye yönlendirir), yeni
  özellik testi pencere kapatmada açılış sekmesini; hepsi düzeltildi. İnceleme (üç boyutlu bulucu + her bulguya bağımsız çürütme):
  11 bulgu doğrulandı, hepsi düzeltildi; reddedilen 3'ten biri (Shift'li − döndürüyordu) yine de kaldırıldı.
- [x] **Vurgu çubuğu ve kalıcı balon** (0.1.12'de de vardı, regresyon testinde görüldü; kullanıcı bu sürümde istedi): notCubuguAc yalnızca
  geçici balonu kapatıyordu; Not ekle'yle açılıp ilk Esc'le açık kalan kalıcı balon (z-index 45) çubuğu (30) örtüyor, Kaldır tıklanamıyordu.
  Artık çubuk açılırken açık balon kapanır (balonKapat metin kutusundan çıkarak notu kaydeder); balon açılınca çubuk zaten kapanıyordu.
  vurgu_cubugu.mjs'e denetim eklendi: deneme-notlu ve PyMuPDF'le üretilen PDF'te 13/13; yazılan not korunuyor.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 22.

### Revizyon 0.1.14 (2026-09-27, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı altı istek bildirdi (üç ekran görüntüsüyle: not balonu başlığı, sürükle-bırak ipucu, sekme sürükleme).
Yorumlanan: "Açılıştaki PDEfe ve bağlı 'PDF görüntüleyici ve düzenleyici · sürüm' yazısı sağ altta" üstteki başlığın tamamı (logo, ad,
alt yazı ve sürüm) olarak alındı; "Not'tan sonra ve tarihten önce düz çizgi" başlığın "Not | Yazar | tarih" diye tek satırda akması olarak.
- [x] **Açılış ekranı** (baslangic.js, stil.css): tek sütun (en çok 1100 px): PDF aç, araçlar (geniş pencerede beşi bir satırda, adlar tek
  satır), "Son açılanlar" başlığı ve Listeyi temizle kutunun dışında, belgeler `#son-dosyalar` kutusunda. Kutunun en çok yüksekliği ve
  kaydırması kalktı (0.1.13'te 420 px, 10 belgede kaydırma çubuğu çıkıyordu); `columns: 2` (yukarıdan aşağı, `break-inside: avoid`),
  kap 560 px'ten darsa tek sütun; boş liste satırı iki sütunu kaplar. Sürükle-bırak ipucu satırı (`.karsilama-ipucu`) kalktı, PDF aç'ın
  açıklaması "… PDF'i seçin veya bu pencereye sürükleyin". `.karsilama-ust`, `.karsilama-govde`, `.karsilama-sol` ve `son-kapali` sınıfı
  kalktı; "Son açılanları hatırla" kapalıyken yalnızca bölüm gizlenir, sütun aynı genişlikte ortada kalır.
- [x] **Dikey yer ve imza**: `#baslangic` ızgara (satırlar `minmax(20px, 1fr) auto minmax(28px, 2fr) auto`): boş yerin üçte biri
  içeriğin üstünde; imza (`.karsilama-imza`: 30 px logo, "PDEfe", "PDF görüntüleyici ve düzenleyici · sürüm") dördüncü satırda sağa
  yaslı. Pencere küçülünce boşluklar en azda kalır; içerik sığmazsa ekran kayar, imza içeriğin altında kalır. 1536×770 (kullanıcının
  %125 ölçekli ekranı) ve 1280×700'de 10 belgeyle kaydırmasız; 1024×640 ve altında (araç adları iki satıra iner) kayar.
- [x] **Not balonu başlığı** (notlar.js balonYenile, panel.js balonTurAdi): "Not:" → "Not"; tür, yazar ve tarih `.ayrac` (1×12 px, soluk)
  ile ayrılır, tarih yazarın yanında, `.esnek` düğmelerden önce. Boş parça ve çizgisi yazılmaz; yanıtlarda da. Yer darsa yalnızca yazar
  kısalır (ipucu tam ad), tarih ve düğmeler daralmaz (flex-shrink: 0). Balon genişliği 300 px kaldı: yazara
  ~78 px (kullanıcının adı ~60 px) düşer.
- [x] **Sekme sürükleme** (sekmeler.js): HTML5 sürükle-bırak (draggable, dragover'da DOM taşıma) yerine işaretçi olayları. Basışta
  surukleHazirla (pencerede yakalama evresinde pointermove / pointerup / pointercancel / keydown, blur); yatayda 5 px'te surukleBaslat:
  sekmelerin liste içeriğine göre konum ve genişlikleri ölçülür, sekme `.tasiniyor` (opak, gölge, z-index), liste `.siralaniyor`
  (ötekilerde 0,15 sn transform geçişi), setPointerCapture. surukleIzle: sekme `translateX` ile imlecin altında (ilk sekmenin solu ile
  son sekmenin sağı arasında); yeni yer j, sürüklenen ortanın öteki ortalara varmasıyla (eşitlik yeter: uca çekilen sekme uçtaki
  sekmenin ortasına ancak varır; katı karşılaştırmada son / ilk yere hiç düşmüyordu, sekme_genislik ilk koşuda buldu); aradakiler bir sekme
  boyu kayar. surukleKaydir: imleç listenin ucundaki 32 px'te ya da dışında liste rAF'ta kayar (uzaklığa göre, en çok 20 px/kare).
  surukleBitir: sekme hedef yuvaya kayar (`.yerlesiyor`), transitionend ya da 220 ms'de geçişsiz olarak sınıflar ve transform'lar kalkar,
  DOM sırası değişir, siralamayiOku. Esc / blur / pointercancel: eski yerlere kayar. Sekme eklenir ya da kapanırsa surukleKes (hemen
  bırakır). Tekerlek sürüklerken sekme değiştirmez. Sınıf adı `.surukleniyor` değil: araclar.css'teki genel `.surukleniyor { opacity: .4 }`
  sekmeyi saydam yapıyordu.
- [x] Testler: test/senaryo20.mjs 38/38 (yeni: beş pencere boyutu, iki tema, not başlığı, sürükleme ortası ölçümü), test/sekme_genislik.mjs
  24/24 (1520 ve 704 px; sürükleme gerçek fare olaylarıyla: ortada sekme imleçte ve çubukta, kayan sekmeler, belge alanında bırakma, en
  sola, en sağa ve kendiliğinden kaydırma, Esc), senaryo19 111/111, senaryo14 hepsi, senaryo17 hepsi (balon başlığı denetimi "Not |
  yazar | tarih"), kisayol_dosya 163/163, kisayol_gorunum 117/117, kisayol_araclar 91/91, ortu_tiklama 155/155, vurgu_cubugu 13/13
  (PyMuPDF'le vurgu eklenmiş PDF).
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 23.

### Revizyon 0.1.15 (2026-09-27, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı iki istek bildirdi (0.1.14 açılış ekranının ekran görüntüsüyle): PDF aç kutusu "sürükleyin"den sonra
kesilsin, çok uzun olmuş, düğme gibi durmuyor; alttaki PDEfe yazısına ve simgesine tıklayınca Ayarlar'daki Hakkında açılsın, ama düğme
ya da kutu izi görünmesin, görüntüsü aynen kalsın.
- [x] **PDF aç genişliği** (stil.css `.karsilama-ac`): `width: 100%` yerine `align-self: flex-start`; düğme yazısı kadar (1100 px'lik
  sütunda 557,6×110 px), sola yaslı, sağdaki boşluk soldaki kadar (25 px). Sütun düğmeden darsa düğme sütun kadar olur, açıklama alt
  satıra iner (`.karsilama-metin` min-width: 0). Gerçek pencerede bu ancak sol panel açıkken olur: en az pencere genişliği 720 px
  (main.js), sol panel kapalıyken sütun ~644 px kalır ve düğme sığar. Test 520 px'i CDP genişlik taklidiyle ölçer.
- [x] **İmza → Hakkında** (baslangic.js): `.karsilama-imza`'ya `data-eylem="yardim.hakkinda"`; yapıcıdaki `[data-eylem]` döngüsü
  tıklamayı Yardım › PDEfe hakkında ile aynı komuta bağlar (Ayarlar açıksa yalnızca Hakkında'ya geçer). Stil değişmedi: çerçeve, zemin,
  :hover / :active / :focus-visible kuralı yok, imleç ok, `user-select: none` zaten vardı. tabindex ve role verilmedi (Tab'da görünmez odak
  olurdu), title verilmedi (ipucu kutusu çıkardı); klavyeyle Yardım › PDEfe hakkında. Tıklama alanı imzanın kutusu: logo, ad, alt yazı
  ve üstündeki 10 px'lik padding.
- [x] **Çift tık örtüyü kapatmaz** (ortu.js ortuTiklamasiBagla, araclar/ortak.js Pencere): bağımsız inceleme buldu. İmzaya (ya da araç
  çubuğundaki dişliye) çift tıklayınca ilk tık Ayarlar'ı açıyor, ikinci tık ortadaki pencerenin dışında kalan örtüye düşüyor ve dışarı
  tıklama sayılıp Ayarlar'ı kapatıyordu (dişlide eskiden beri). Örtünün click'inde `e.detail <= 1` koşulu: çok tıklamanın sonraki
  tıkları kapatmaz; bilerek dışarı tıklamak yeni bir dizidir (detail 1) ve kapatır. senaryo21 hatayı düzeltmeden önce yakaladı (4 HATA).
- [x] Testler: test/senaryo21.mjs 39/39 (yeni; beş pencere boyutu, iki tema, piksel karşılaştırmasıyla üzerine gelme ve basılı tutma,
  gerçek fare olaylarıyla tık ve çift tık, Tab), senaryo20 38/38, senaryo19 111/111, senaryo14 56/56,
  ortu_tiklama 155/155 (örtü kuralı değiştiği için). Sürüm 0.1.15.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 24.

### Revizyon 0.1.16 (2026-09-27, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı yeni simgeyi zip olarak gönderdi (PDEfe-simge.zip: icon.ico, icon.png, icon.svg, png/, BENIOKU.txt;
"9B · Dörtlü Çiçek": lacivert sayfa, altın sarısı dört yapraklı süsleme, kırmızı kıvrık köşe).
- [x] **Simge dosyaları** (build/): icon.ico (16, 20, 24, 32, 40, 48, 64, 96, 128, 256 px; hepsi PNG sıkıştırmalı, 32 bit), icon.png
  (512×512 RGBA), icon.svg (vektör asıl, yeni; `files: build/icon.*` ile pakete de girer, 15 KB). Eski simgenin başka kopyası yoktu
  (git ls-files içinde SHA-256 ve base64 taraması). Yapılandırma zaten bu adları kullanıyordu, değişmedi: electron-builder.yml
  win.icon, fileAssociations icon, nsis.installerIcon / uninstallerIcon → build/icon.ico; main.js BrowserWindow icon → build/icon.png
  (asar içinde); açılış ekranının imzası (baslangic.js) → ../../build/icon.png.
- [x] **Çekirdek** (core/dist/pdefe-core.exe): pdefe-core.spec simgeyi build/icon.ico'dan alır; `node build/cekirdek-derle.mjs` ile
  yeniden derlendi (kod aynı), ping OK. araclar_testi.py kaynakla 131/131, `--exe` ile yeni ve eski çekirdek ikişer kez 130/130. Paket
  derlemesiyle aynı anda koşan ilk `--exe` koşusunda ayir/parcalar bir kez HATA verdi (ilk çağrının bildirdiği boyut ile üzerine
  yazıldıktan sonraki dosya boyutu karşılaştırması); yeniden üretilemedi, kararsız denetim.
- [x] Doğrulama: PDEfe.exe, PDEfe-Setup.exe ve pdefe-core.exe'den 256 / 48 / 32 / 16 px simge çıkarıldı (PrivateExtractIcons), hepsi
  yeni. Açılış ekranının imzası açık ve koyu temada, %100 ve %125 ölçekte görüntülendi. Kurulumdan sonra gerçek sistemde (WMI):
  Uninstall 0.1.16, exe 0.1.16.0, DisplayIcon (uninstallerIcon.ico) ve PDEfe.pdf DefaultIcon (resources\icon.ico) yeni ICO ile aynı
  boyutta. `baslangic.js` BELGE_IKON yorumu güncellendi (son açılanlardaki kırmızı şeritli belge simgesi eski uygulama simgesinden
  geliyordu; kendisi değişmedi). Sürüm 0.1.16.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 25.

### Revizyon 0.1.17 (2026-09-27, kullanıcı isteği)
Kullanıcı simgenin sade sürümünü gönderdi (PDEfe-simge2.zip; BENIOKU aynı): kıvrımlı süslemeler kalktı, ortada dolgulu dört yapraklı
çiçek.
- [x] build/icon.ico (10 boyut, PNG sıkıştırmalı), icon.png (512×512), icon.svg değişti; yapılandırma aynı. pdefe-core.exe yeniden
  derlendi (ping OK), araclar_testi `--exe` 130/130. PDEfe.exe, PDEfe-Setup.exe ve pdefe-core.exe'den çıkarılan simgeler (256 / 48 /
  32 / 16 px) yeni. Kurulumdan sonra (WMI): Uninstall 0.1.17, exe 0.1.17.0, app.asar ve çekirdek derlemeyle aynı boyutta,
  resources\icon.ico ve uninstallerIcon.ico yeni ICO (55 348 bayt). Sürüm 0.1.17.
- [x] **Örnek veriler** (yayımdan önce): test/senaryo1, 3, 4, 5, 7, 8, 9, 10, 11, 12'deki masaüstü yolu `test/test_klasoru.mjs`'e
  taşındı (PDEFE_TEST_PDF_KLASORU ya da os.homedir()\Desktop\PDF DENEME; kişisel yol koda yazılmaz); not_testi.py aynı kuralla, yazarlar
  "Deneme Yazar"; form_pdf_uret.py alanı "Deneme Adı Soyadı"; senaryo9 örnek belge olarak TBK (1.5.6098.pdf); test/wf/tamamla.js'te
  yol %USERPROFILE%; DOGRULAMA 1.7'de yazar adı genelleştirildi. Test ve belgelerdeki dosya adları, mahkeme adları ve esas numaraları
  yer tutucudur (2099_…, DENEME 9. ASLİYE TİCARET MAHKEMESİ). Seçim regresyonu (test/secim_bloklar.mjs) yerel örnek belgelerle çalıştığı
  için git dışındadır.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 25 (0.1.17 simgesiyle).

### Revizyon 0.1.18 (2026-09-27, kullanıcı isteği)
Kullanıcı RAM kullanımının denetlenmesini, kullanımı gözle görülür biçimde etkilemeyen iyileştirmelerin yapılmasını istedi. Ölçüm: ekran
dışı test örneği (test/baslat.ps1) kullanıcının ekranı boyutunda (2560×1400, genişliğe sığdır, %100 ölçek); Görev Yöneticisi "Bellek"
sütunu = süreç ağacının özel çalışma kümesi. İç dağılım CDP memory-infra dökümüyle (Tracing.requestMemoryDump), işçi yığınları
Target.setAutoAttach ile okundu. 0.1.17: boşta ~140 MB, 1 belge ~210–280 MB, 3 belge ~430–490 MB (+ ~680 MB ekran kartı belleği),
hepsi kapanınca ~275 MB. JS sızıntısı yok (sekmeler kapanınca pdf.js işçileri kapanıyor, yığın 3 MB); kapanıştan sonra kalan fazlalık
Chromium ayırıcılarının serbest belleği hemen iade etmemesi.
- [x] **Gizli sekme tuvalleri** (goruntuleyici.js `arkaPlanaAlindi`, uygulama.js `sekmeSec`): sekme gizlenince yalnızca `el.hidden`
  yapılıyordu; gizli sekmede kaydirmaIsle çalışmadığından ön çizilmiş bant ve komşu sayfaların tuvalleri sekme kapanana dek kalıyordu
  (2560 px'te A4 tuvali ~27 MB, sekme başına 3–4). Artık görünür sayfalar (`_gorunurKume`) dışındakiler bırakılır; sekmeye dönünce
  görünür sayfa ilk karede çizili (ölçüldü, ekran görüntüsüyle denetlendi), bant boyutDegisti → kaydirmaIsle ile yeniden çizilir
  (sayfa başına 25–120 ms). Görünür sayfalar kasıtlı tutulur (tamamen bırakmak dönüşte 30–120 ms boş sayfa gösterirdi). 3 sekmede
  tuval 68,5 → 42 MP (canvas 261 → 160 MB), özel bellek 427 → 372 MB; kazanç gizli sekme sayısıyla artar.
- [x] **Küçük resim paneli** (panel.js `belgeUnut`): panel kapalıyken ya da başka panel sekmesindeyken kapanan belgenin küçük
  resimleri alanda, IntersectionObserver geri çağrısı da kapanan belgeyi tutuyordu. Alan o belgeninse gözlemci kesilir, alan boşaltılır.
- [x] **Çekirdek tek klasör** (core/pdefe-core.spec COLLECT, cekirdek.js, cekirdek-derle.mjs, electron-builder.yml, yayim.yml):
  onefile her açılışta ~70 MB'ı %TEMP%\_MEI* altına açıyordu (~0,9 sn) ve `durdur()` önyükleyiciyi `kill()` ile öldürdüğü için
  açılan klasör silinmeden kalıyordu (deneyle doğrulandı; ev bilgisayarında 151 klasör, 10,07 GB — kullanıcı onayıyla silindi).
  Artık resources/pdefe-core/pdefe-core.exe + _internal (77 MB, exe 5,8 MB); çekirdek ikinci açılışta 185 ms'de ping yanıtı veriyor,
  tek süreç (önyükleyici yok). araclar_testi `--exe` 130/130.
- [x] **Çekirdek kapanışı** (cekirdek.js `durdur`): önce yalnızca stdin kapatılır; çekirdek kuyruktaki işi bitirip (pdefe_core.main
  en çok 5 sn bekler) kendiliğinden çıkar. Ana süreç yaşıyorsa 8 sn sonra `kill()`.
- [x] Regresyon: senaryo17 42/42, senaryo18 10/10, sekme_genislik 24/24, senaryo2, senaryo6, senaryo9 beklenen çıktı; küçük resim
  paneli bırakma sınaması OK. Sürüm 0.1.18.
- Bilerek yapılmayanlar (gözle görülür etki ya da küçük kazanç): etkin sekmede boşaltma bandını daraltmak (−3/+4 ekran; geri kaydırmada
  yeniden çizim), koyu sayfa kipindeki ikinci tuval (CSS süzgeci farklı çizer), arama metin önbelleğini Bul kapanınca silmek (yeniden
  aramada büyük belgede saniyeler), tek paylaşılan pdf.js işçisi (belgeler birbirini bekler), MuPDF deposu (çekirdek 30–45 MB, belge
  kapanınca iniyor).

### Revizyon 0.1.19 (2026-09-30, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı iki istek bildirdi: (1) sekme, sekme şeridinin dışına sürüklenince ayrılsın, mekaniği referans
okuyucudaki gibi olsun (marka adı belgelerde geçmesin); (2) sekmenin sağ tık menüsüne "Pencereye ayır" seçeneği. Yorumlanan: 1. maddede
"yeni sekme olarak açsın" yazılmıştı; 2. maddedeki "pencereye ayır … de" ve örnek gösterilen davranış nedeniyle "yeni pencere" olarak
alındı. İstenenin gereği olarak eklenenler: ayrılan sekmenin başka pencerenin çubuğuna bırakılıp takılabilmesi (yoksa ayrılan sekme geri
birleştirilemezdi), ayarların pencerelerde ortak olması, bir dosyanın tek pencerede açık olması, Çıkış'ın bütün pencereleri kapatması.
- [x] **Birden çok pencere** (main/pencereler.js; main.js, menu.js, yazdir.js): 0.1.18'e dek ana süreçte tek `pencere` değişkeni vardı;
  diyalogların sahibi, olayların hedefi, kapatma onayı ve bekleyen dosyalar ona bağlıydı. Artık her pencerenin kaydı var (arayüzü
  hazır mı, kapatma onayı, bekleyen dosyaları, açık dosyaları); IPC işleyicileri isteği gönderen pencereyi `pencereAl(e)` ile bulur,
  menü komutu menünün açıldığı pencereye gider, tema ve güncelleme olayları bütün pencerelere (`herkese`), ayar değişikliği öteki
  pencerelere (`digerlerine`, 'ayar:degisti' → uygulama.js `ayarDisaridanDegisti`: kopyayı günceller, tema / düzen / vurgu rengi / son
  açılanları uygular, geri yazmaz) gider. Çekirdek ortaktır: renderer istek kimlikleri pencere başına sayıldığından ana süreç
  `<pencere>:<istek>` ile ayırır (ilerleme yalnızca isteyen pencereye, iptal yalnızca onun isteğine).
  Odak sırası (`odakSirasi`, pencerenin 'focus' olayı): Gezgin'den açılan dosya en son etkin pencereye gider; üst üste binen
  pencerelerde sekmenin bırakılacağı pencere en öndekidir. Electron pencerelerin ekrandaki sırasını vermediğinden başka bir uygulamanın
  örttüğü PDEfe penceresi görülemez (imleç oradaysa sekme o pencerenin çubuğuna bırakılmış sayılır); kabul edildi.
  - Çekirdek ve yazdırma işi artık pencereden uzun yaşar (0.1.18'de pencere kapanınca uygulama da kapanıyordu). Pencere kapanırken
    çekirdekte açtırdığı dosyaları ve anlık kopyalarını bildirir ('pencere:kapatOnayla'); ana süreç pencere gerçekten kapanınca dosyaları
    bırakır, kopyaları siler (`dosyalariBirak`). Yoksa kapanan pencerenin PDF'leri öteki pencereler açık kaldıkça Gezgin'de silinemez,
    adı değiştirilemezdi (0.1.12'deki hata sınıfı). Hazırlık aşamasındaki yazdırma işi, sahibi pencere kapanınca bırakılır (yazdir.js;
    yoksa öteki pencereler PDEfe kapanana dek "yazdırma sürüyor" alırdı). Çekirdek durdurulduktan sonra gelen istek yazılmaz
    (cekirdek.js `kapaniyor`).
  - Arayüz süreci çöken pencere ('render-process-gone'; ör. bellek yetmedi): hazır sayılmaz (sorusuz kapatılabilir, Çıkış onu da
    kapatır), dosya ve sekme hedefi olmaz, dosya kaydı boşalır, ondan yanıt bekleyen istekler düşer. 0.1.18'de çöken pencere kapatma
    sorusunu yanıtlayamadığı için kapatılamıyordu; birden çok pencerede öteki pencerelerin Çıkış'ını ve güncellemesini de tutardı.
- [x] **Sekmenin taşınması** (uygulama.js sekmePaketi / sekmeyiTasi / sekmeyiAl; goruntuleyici.js, notlar.js durumAl /
  durumdanYukle; komutlar.js): her pencere ayrı süreç olduğundan sekme nesne olarak taşınamaz. Değerlendirilip seçilmeyenler: ikinci
  pencereyi aynı renderer'da açıp DOM'u taşımak (bütün arayüz modülleri tek `document` varsayıyor, ~17 bin satır), sekme başına ayrı
  webContents (tarayıcı mimarisi; arayüzün tamamı yeniden yazılırdı), taşımadan önce kaydetmeyi zorunlu kılmak (kullanıcı kaydetmek
  istemeyebilir; geri al geçmişi yine giderdi). Seçilen: durum paketi. Kaynak pencere açık balonu ve yazı düzenlemesini uygular, süren
  kaydı, sıradaki döndürmeyi ve notların ilk okunmasını bekler, PDF.js belgelerinin baytlarını alır (`getData`), sonra beklemeden
  (model değişemeden) görünümü, not modelini ve geri al yığınını paketler; ana süreç paketi hedefe verir ('sekme:tasi' → 'sekme:al' →
  'yanit'); hedef sekmeyi kurup onaylayınca kaynak sekmeyi bırakır (`belgeyiKaldir` devredildi: anlık kopya silinmez, çekirdekteki
  dosyalar bırakılmaz). Hedef açamazsa (meşgul, hata) sekme kaynakta olduğu gibi kalır ve nedeni bildirilir. Taşıma sürerken kaynak
  pencere girdi almaz (`tasimaSuruyor`: görünmez örtü, tuşlar pencere düzeyinde yutulur, menü komutu ve kapatma isteği yok sayılır),
  taşınan belge kaydedilmez (`b.tasiniyor`).
  - Baytlar diskten yeniden okunmaz: hedef belgeyi kaynağın gördüğü hâliyle açar. Artımlı kayıtla diske işlenmiş döndürme
    (`diskDondurme`) ve anlık kopya hesabı böylece olduğu gibi geçerli kalır; diskten okunsaydı tarifteki göreli açıların hepsi (geri
    al yığınındakiler dahil) yeni tabana göre çevrilmeliydi. 106 MB'lık belge iki IPC atlamasıyla 0,7 sn'de taşındı (yeni pencere
    dahil); ayrı bir aktarım yolu gerekmedi.
  - Geri al yığını işlev tuttuğundan olduğu gibi taşınamaz: her komut kendini yeniden kurmaya yeten bir tarif taşır (`Komut.tanim`).
    Not komutları üç kurucuyla kurulur (notlar.js ekleKomutu / silKomutu / guncelleKomutu; kapattıkları bütün değerler tarifte, ilk
    uygulamadaki tarih dahil), sayfa komutu `sayfaKomutu` ile (eski ve yeni sayfa listeleri). Hedef, tariften aynı kurucularla kurar;
    komut çalıştırılmaz (belge uygulanmış hâliyle gelir). Sayfa girdileri numaralanıp taşınır (listede olmayan, yalnızca yığındaki
    girdiler de; döndürme kopyalarının paylaştığı `kimlik` korunur), notlar kimlikleriyle (kayıtta modelden çıkmış ama yığında duran
    notlar `cikanlar` olarak). Tarifi olmayan komut varsa yığın taşınmaz, belge kaydedilmemiş görünmeye devam eder.
  - `gorunum.hazir` (yukle / durumdanYukle bitti) olmadan sekme taşınmaz; çok sayfalı belgenin sayfa boyutları öğrenilmeden taşındıysa
    hedef öğrenir (`_boyutlarEksik`). Girilen parola pakete girer (hedefte yeniden sorulmaz).
  - Görünüm aynen gelir: arka plandaki sekmenin kaydırıcısı ölçülemediğinden (display: none iken scrollTop 0) sayfa içi konum sekme
    gizlenirken saklanır (`gizlenecek`); "Görünür alana sığdır" ölçeği için sayfaların içerik kutusu pakette gider ve hedef, yerleşimden
    önce geçerli sayfanın nesnesini bekler (yoksa sayfa genişliğine sığdırmaya düşüyordu).
  - Kilitler (iki bağımsız kod incelemesinin bulguları): kaydedilmekte olan belge taşınmaz (kayıt başarısız olursa "Belge kaydedilemedi"
    sorusu taşıma örtüsünün altında kalır, pencere kilitlenirdi); ayrıca kilitliyken açılan mesaj kutusunda örtü çekilir, tuşlar kutuya
    gider. Hedef pencere de sekme kurulurken girdi almaz (yarım kurulmuş sekme kapatılırsa kaynağa ait anlık kopya silinirdi).
    Kapanmakta olan ya da kapatma izni sorulan pencere sekme almaz, vermez (kapatma akışı belgelerin anlık listesini sorar; sonradan
    gelen sekme sorulmadan kapanırdı). Taşınmakta olan sekme kapatılamaz; başka pencerenin aracı o dosyayı yeniden yazdıysa yenileme
    taşıma bitince, dosya hangi penceredeyse orada yapılır.
  - Geç yanıt: hedef sekmeyi kurunca 'yanit' ile bildirir; ana süreç artık beklemiyorsa (120 sn doldu, sekme kaynakta kaldı) 'yanit'
    false döner ve hedef kurduğu sekmeyi kaldırır (belge iki pencerede birden açık kalmaz).
- [x] **Sürükleyerek ayırma** (sekmeler.js, pencereler.js, renderer/hayalet.html): sürükleme artık her yöne 5 px'te başlar, yakalama
  sekmede değil listede (ayrılan sekme görünmez olur; imleç pencerenin dışına çıksa da olaylar gelir). İmleç çubuğun üstünden /
  altından ya da pencerenin yanlarından 24 px'ten çok uzaklaşınca sekme ayrılır (`.ayrildi`: görünmez, sonrakiler yerini kapatır), 12
  px'e yaklaşınca geri takılır (kıyıda gidip gelmesin); sıralarken elin kayması ayırmaz. Dışarıda bırakılan sekme karar verilene dek
  `.askida` (çubukta yer tutmaz). Açılış sekmesi ayrılmaz.
  Önizleme ana süreçte ayrı bir penceredir (çerçevesiz, `focusable: false`, `showInactive`, fare olaylarını geçirir, her zaman üstte,
  opaklık 0,92): pencerenin dışında ve öteki ekranda da görünür; görünmeyen masaüstünde gerçek odakla denendi, kaynak pencere etkin
  kalıyor (odak kaybı sürüklemeyi iptal ederdi). İlk gösterim ~120 ms (süreç başlar), sonrakiler ~30 ms; son sürüklemeden 30 sn sonra
  yok edilir (boşta bellek tutmasın), son uygulama penceresi kapanınca da (gizli pencere uygulamayı açık tutardı). İçeriği kaynak
  pencere üretir: sekmenin adı ve geçerli sayfanın tuvalinden küçük görüntü (ekran görüntüsü alınmaz).
  İmleci ana süreç izler (16 ms; `screen.getCursorScreenPoint`): farklı ölçekli ekranlarda renderer'ın ekran koordinatı güvenilir
  değil; pencere sınırlarıyla aynı birimde. Öteki pencereler bırakma alanlarını bildirir ('sekme:bant': sekme çubuğu ± 6 px; sekmesiz
  pencerede pencerenin tamamı; açık pencere varken yok), imleç oradayken o pencere bırakılacak yeri gösterir ('sekme:disSurukle' →
  `birakmaIsareti`; sekmesiz pencerede "Sekmeyi buraya bırakın" örtüsü). Kaynak pencere yarım saniyede bir ses verir
  ('sekme:surukleCan'); 3 sn ses gelmezse önizleme kalkar (pencere kilitlendiyse ekranda asılı kalmasın), bırakma yine de geçerlidir.
  Bırakınca: başka pencerenin çubuğu → oraya taşınır (pencere öne gelir; kaynakta belge kalmadıysa kaynak kapanır); boş yer → yeni
  pencere, ilk sekmesi imlecin altında, kaynak pencerenin (ekranı kaplamıyorkenki) boyutunda, imlecin ekranındaki çalışma alanına
  sığdırılmış; pencerenin tek sekmesiyse yeni pencere açılmaz, pencere oraya taşınır ('pencere:tasi').
  - Farklı ölçekli ekrana geçişte tek `setBounds` boyutu ölçek oranında bozuyor (görünmeyen masaüstünde ölçüldü: %100 → %150 ekranda
    1280×754 yerine 1920×1131, dönüşte 853×503): yeni pencerede ve 'pencere:tasi'de sınırlar iki kez verilir.
  - Gerçek girdi yolu görünmeyen masaüstünde Win32 fare iletileriyle (PostMessage) denendi (CDP fare olayları tarayıcı sürecinin girdi
    yolunu ve fare yakalamasını atlar): önizleme penceresi gösterilince fare yakalaması ve etkin pencere kaynak pencerede kalıyor
    (GetGUIThreadInfo), 3 sn tutulan sekme ayrılmış kalıyor, bırakınca yakalama kalkıyor, yeni pencere açılıp etkinleşiyor.
- [x] **Pencereye ayır** (sekme sağ tık menüsü): Kapat grubundan sonra, ayrı grupta. Yeni pencere kaynak pencerenin boyutunda, 32 px
  sağında ve aşağısında. Pencerenin tek sekmesinde ve açılış sekmesinde devre dışı.
- [x] **Tek dosya tek pencere**: pencereler açık dosyalarını bildirir ('pencere:belgeler'); `dosyaAc` kendi sekmelerinde bulamazsa ana
  sürece sorar ('pencere:baskaPenceredeAc'): dosya başka pencerede açıksa o pencere öne gelir ve sekmesine geçer. İkinci örnek
  (Gezgin) de aynı kayda bakar. Araç çıktısı başka pencerede açık bir dosyanın üzerine yazıldıysa o pencerenin sekmesi diskteki yeni
  hâliyle yenilenir (`yazildi`; aynı penceredeki `sekmeyiYenile` kuralı).
- [x] **Kapatma, Çıkış, güncelleme**: pencere kapatma isteği yalnızca o pencerenin belgelerini sorar; renderer artık her durumda
  yanıt verir ('pencere:kapatOnayla' ya da 'pencere:kapatVazgec'). Dosya › Çıkış `role: 'quit'` yerine `cik()`: pencereleri en
  öndekinden başlayarak sırayla kapatır, Vazgeç'te durur (her pencerenin sorusu aynı anda açılmasın). Alt+F4 hızlandırıcısı kaydedilmez
  (menüde yazar): tuşu Windows işler, yalnızca etkin pencere kapanır. Güncelleme kurulumundan önce düğmeye basılan pencere kendi
  belgelerini, sonra öteki pencerelerinkini sorar ('pencere:digerlerindenIzinAl' → 'pencere:izinIste'). Kayıtlı pencere konumu en son
  kapatılan pencereninkidir. Son sekmesini kullanıcının kapattığı pencere açık kalır (açılış ekranı; ilk pencerede de böyleydi).
  - İzinle kurulum arasındaki boşluk (inceleme bulgusu): izinler pencere pencere toplanır; izin vermiş pencere açık kalıp değiştirilirse
    (öteki pencerenin sorusu açıkken geri dönüp not eklemek) kurulum onu sormadan kapatırdı. İzin veren pencere girdiye kilitlenir
    (`kurulumKilidi`; taşıma kilidiyle aynı örtü); vazgeçilince, isteyen pencere kapanınca ya da kurulum başlatılamayınca ana süreç
    kilitleri açar ('pencere:izinBitti'). Kurulum uygulamayı 30 sn içinde kapatmazsa ve hata da gelmezse başlatılamamış sayılır
    (guncelleme.js `kur`): kapatma onayı geri alınır, kilitler açılır, şerit hatayı gösterir, yeniden denenebilir.
  - Çıkış sürerken gelen ikinci kapatma isteği (soru açıkken × ya da Çıkış yeniden) yanıtlanmaz, yalnızca soruyu belirginleştirir; yanıtı
    süren akış verir (önceden "vazgeçildi" sayılıp Çıkış yarıda kalıyor, soru yanıtlanınca yalnızca o pencere kapanıyordu). `cik()` her
    adımda o an en öndeki pencereyi alır: çıkış sürerken açılan pencere de kapanır.
- [x] **Test altyapısı**: surucu.mjs `hedefler()` / `hedefSec(id)` (her pencere ayrı CDP hedefi; önizleme penceresi hedef sayılmaz).
  Ekran dışındaki örnekte imleç testten gelir ('test:imlec'), pencere gerçekten etkinleşmediğinden odak sırası 'test:oneAl' ile
  belirlenir; 'test:pencereler', 'test:hayalet', 'test:surukleme', 'test:cik'. Yeni pencereler de ekran dışında açılır (çalışma
  alanına sığdırma test örneğinde atlanır). test/ornek_pdf_uret.py yer tutucu PDF üretir (gerçek belge kullanılmaz) ve PDF özeti verir.
  - Gerçek girdi: test/gercek_fare.ps1 örneği görünmeyen masaüstünde test konumu vermeden başlatır (`baslat_gizli.ps1 -GercekEkran`:
    gerçek ekran düzeni, imleç, odak; test kancaları kapalı) ve aynı masaüstünde çalışan test/fare_gonder.ps1 ile sekmeye Windows
    fare iletileri gönderir; fare yakalamasını ve etkin pencereyi okur. Pencere iletileri yalnızca aynı masaüstündeki süreçler
    arasında gider, bu yüzden yardımcı o masaüstünde başlatılır. Görünmeyen masaüstünde gerçek imlecin yeri (0,0) okunur: bırakılan
    sekmenin penceresi oraya açılır; pencereler arası bırakma bu yolla sınanamaz (senaryo22 imleci testten verir).
- Bilerek yapılmayanlar: pencere menüsü / Yeni pencere komutu (istenmedi; yeni pencere yalnızca sekme ayırarak açılır), sekme ayrılırken
  gerçek pencerenin imleci izlemesi (pencere ve belge her fare hareketinde taşınırdı; önizleme yeterli), açılış sekmesinin ayrılması,
  bir belgenin iki pencerede birden açılması. Yanıt vermeyen (kilitlenmiş ama çökmemiş) arayüz süreci için zaman aşımı yok: o pencere
  0.1.18'deki gibi kapatılamaz.
- [x] **Testler**: test/senaryo22.mjs 101/101 (ekran dışı örnek: pencereler, eş belge karşılaştırmasıyla taşıma, sürükleme, kilitler,
  kapatma / Çıkış, çöken pencere). test/gercek_fare.ps1 9/9 (görünmeyen masaüstü, Windows fare iletileri); aynı sınama yerelde
  paketlenen sürümle (`electron-builder --win --dir`, `-Paketli release\win-unpacked\PDEfe.exe`) 9/9; paketli sürümde kaydedilmemiş
  notlu ve döndürülmüş belge yeni pencereye taşınıp kaydedildi (diskte doğrulandı), pencereler kapanınca süreç kalmadı.
  guncelleme-e2e/birim.mjs geçti (kurulum bekçisi eklendi). İki pencereyle güncelleme kurulumu sahte güncelleyiciyle denendi (soru
  açıkken isteyen pencere kilitli, Vazgeç'te kilit açılıyor, 30 sn sonra bekçi). İkinci örnekle dosya açma (Gezgin çift tık) üç
  durumda denendi. 106 MB'lık belge yeni pencereye 0,7 sn'de taşındı.
  Regresyon (bu klonda gerçek örnek PDF yok; yer tutucu PDF'lerle, 0.1.18'in çalışma ağacıyla yan yana): sekme_genislik 24/24 (1264 ve
  704 px), senaryo14, senaryo18, senaryo19 110/110, senaryo20 38/38, senaryo21 39/39, kisayol_araclar 91/91, kisayol_gorunum 117/117,
  oto_kayit_kilit 7/7, vurgu_cubugu 13/13. senaryo17 (2), kisayol_dosya (7) ve ortu_tiklama (1–2; küçük belgede küçültme soru
  yanıtlanmadan bitiyor) hataları yer tutucu belgelerden: 0.1.18'de de aynı.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 26.

### Revizyon 0.1.20 (2026-09-30, kullanıcı geri bildirimi)
Ayrıntı: CHANGELOG.md. Kullanıcı yatay iki sayfalık bir belgeyi ekranın yarısına yerleştirilmiş pencerede (pencere yerleştirme aracının
yarım ekran bölgesi, 1920×1080 ekran) açınca görüntünün titrediğini, yakınlaştırmanın %81 ile %82 arasında gidip geldiğini bildirdi ve
yerleştirme aracından kuşkulandı. Kök neden ve kararlar:
- [x] **Sığdırma kendi kaydırma çubuğuyla döngüye giriyordu** (goruntuleyici.js). Sığdırma ölçeği kaydırıcının o anki görünür
  boyutundan (clientWidth / clientHeight) alınıyordu; görünür boyut ise yerleşimin çıkardığı kaydırma çubuğuna bağlı. Çubuksuz ölçekte
  içerik aşağı taşıp çubuklu ölçekte sığan belgede: çubuk çıkar → genişlik 12 px daralır → ölçek küçülür → içerik sığar → çubuk kalkar →
  ölçek büyür… ResizeObserver her turda yeniden yerleşim başlatıyordu (60 ms gecikmeyle): saniyede ~16 yerleşim, sayfalar her
  seferinde yeniden çiziliyor. Kullanıcının durumu ölçüldü: görünüm 958×876 px, sayfalar 845×382 pt; %82'de içerik 881 px (taşar),
  %81'de 870 px (sığar); kararsız aralık 870–881 px görünüm yüksekliği. Yerleştirme aracının payı yalnızca pencereyi bu boyuta
  getirmesi: elle aynı boyuta getirilen pencerede de aynı. Test örneğinde aynı boyutta yeniden üretildi (belge olağan yoldan açılınca
  3 sn'de 45 yerleşim). Aralık her sığdırma modunda ve düzende var (tek dikey sayfa da: pencere oranı sayfa oranına yakınken); genişliği
  belgeye göre 10–20 px.
  - Karar: yerleşim kaydırıcının dış boyutundan (çubuklardan etkilenmez) hesaplanır, çıkacak çubukları kendisi öngörür (`gorunumCoz`).
    Sığdırmada önce çubuksuz ölçek denenir; içerik taşıyorsa o çubuk var sayılıp ölçek yeniden hesaplanır; var sayılan çubuk geri
    alınmaz (en çok üç tur: çubuksuz, biri, ikisi). Kararsız aralıkta sonuç çubuklu (küçük) ölçektir ve içerik çubuksuz sığar:
    sayfalar 12 px dar, ortada, kaydırma çubuğu yok. Sonra o ölçekte tarayıcının göstereceği çubuklar `overflow: auto` kuralıyla
    bulunur (önce çubuksuz; biri gerekiyorsa kapladığı yer ötekini de gerektirebilir); görünür boyut ve tuval alanının boyutu ondan
    çıkar. Çubuk kalınlığı stil sayfasından gelir (12 px); her zaman çubuklu bir deneme kutusuyla, cihaz piksel oranı başına bir kez
    ölçülür. Yerleşim artık ilk seferde son hâlindedir: belge açılırken ve elle yakınlaştırmada çubuk çıkınca / kalkınca yapılan ikinci
    yerleşim (ve 6 px'lik yana kayma, fazladan çizim) kalktı.
  - İkinci güvence: ResizeObserver yalnızca kaydırıcının dış boyutu değiştiyse yerleşim başlatır (`kutuDegisti`; son yerleşimin dış
    boyutu `_yerlesimKutusu`). Çubuğun çıkması / kalkması içerik kutusunu değiştirir ama yerleşim gerektirmez. Gizlenip gösterilen
    sekmede dış boyut aynı olsa da yerleşim yenilenir (gizliyken sayfa boyutları öğrenilmiş olabilir); `boyutDegisti`'yi doğrudan
    çağıranlar (sekme seçimi, sol panel, okuma modu, ekran ölçeği) bu süzgece girmez.
  - Değerlendirilip seçilmeyenler: `scrollbar-gutter: stable` (çubuğun yeri hep ayrılır: çubuksuz belgede sağda boş şerit, sayfalar
    ortadan kayık; yatay çubuğu çözmez), kararsız aralıkta içeriği yüksekliğe tam dolduran ara ölçek (pencere yüksekliğiyle sürekli
    değişen ölçek, kazanç en çok 12 px), yalnızca yeniden yerleşimi seyreltmek (titreme yavaşlar, bitmez).
  - Dayanılan tarayıcı davranışı: iki çubuk yalnızca birbirinin kapladığı yer yüzünden gerekiyorsa Chromium ikisini de kaldırır
    (içerik çubuksuz kutuya sığıyor; önceki durumda iki çubuk varken de ölçüldü). Öngörü ile gerçek ayrışırsa döngü yine kurulmaz
    (hesap dış boyuta bağlı), yalnızca gereksiz çubuk görünür; test bunu yakalar.
- [x] **Gereksiz kaydırma çubukları** (doğrulama sırasında bulundu; ikisi de 0.1.19'da vardı, aynı hesabın parçası):
  - İki sayfa düzeni: sığdırılan çiftin iki sayfası da piksel ızgarasına yuvarlanır; eşit genişlikte iki sayfa tek sayıda piksele
    sığdırılınca ikisi de yarım piksel yukarı yuvarlanır, çift tam 1 px taşar. Taşma payı "1 px'ten az"dı (tek sayfanın yuvarlaması
    için yeterli): ekran ölçeği 1'de her iki pencere genişliğinden birinde sığdırılmış çiftin altında yatay çubuk çıkıyordu (12 px
    yükseklik de alarak). Karar: 1 px'e kadar taşma sayılmaz (`tasar`); fazlalığı kenar boşluğu karşılar (16 yerine 15 px), sayfalar
    alandan taşmaz. Sayfa boyutlarına dokunulmadı (çiftin toplamını yuvarlamak iki eş sayfayı farklı genişlikte çizerdi).
  - Kesirli boyut (bağımsız kod incelemesinin bulgusu): ekran ölçeği 1 değilken (%125, %150) kaydırıcının gerçek boyutu CSS pikselinin
    kesri olabilir (951 cihaz pikseli = 760,8 px); offsetWidth / clientWidth bunu 761'e yuvarlar. Yuvarlanmış boyuta kurulan alan
    gerçek kutudan taşar; Chromium yarım cihaz pikselinden büyük taşmada çubuk çıkarır, daha küçüğünde önceden çubuk varsa kaldırmaz.
    0.1.19'da %125'te sığdırılmış uzun belgede her beş pencere genişliğinden birinde yatay çubuk, "Sayfayı sığdır"da iki çubuk
    birden çıkıyordu. Karar: boyut getBoundingClientRect'ten alınır (`disKutu`); taşma gerçek (kesirli) boyuta göre, sığdırma ölçeği
    ve alan tam piksele aşağı yuvarlanmış boyuta göre hesaplanır. Alan taşmayan yönde gerçek kutuyu hiç aşmaz; taşma sayılan fazlalık
    gerçek kutuyu 1 px'ten çok aşar (karar tarayıcının yuvarlamasına kalmaz). Çubuk kalınlığı yukarı yuvarlanır.
  - Bağımsız inceleme (yalnızca okuyan ajan; çalışma ağacındaki işlevleri ayrı bir Chromium sayfasında koşturdu): ilk turda kesirli
    boyut kusurunu buldu; düzeltmeden sonra %100–%200 arasındaki beş ölçekte, tam ve kesirli kutularda, önceki çubuk durumlarının
    hepsinde on binlerce denemede öngörü ile tarayıcının gösterdiği çubuklar aynı. Kalan sınır: Windows'un standart olmayan özel
    ölçeklerinde (%110, %120, %133) çubuk kalınlığı tam piksel değildir (11,3–11,8 px, 12 sayılır); ikinci çubuk öngörülüp çıkmayabilir,
    o zaman sayfalar 6 px ortadan kayık durur (%133'te 20 000 rastgele denemede 2). Çubuk çıkmaz, döngü olmaz; düzeltilmedi.
- [x] **Testler**: test/sigdirma_kararli.mjs (yeni; üretilen yer tutucu belgeler: bildirilen sayfa boyutunda yatay iki sayfa, tek dikey
  sayfa, uzun belge, baskın genişlikten geniş sayfalı karışık belge). Görünümün boyutunu kaydırıcının kenarlarını oynatarak değiştirir:
  kararsız aralığı ölçüp her yüksekliği dener (yerleşim duruluyor, ölçek tek değerde, çubuk yalnızca taşma varken, sayfalar görünür
  alanda ortalı; ölçek kuralı), elle yakınlaştırmada tek yerleşim, iki sayfa düzeninde ardışık 24 genişlik, cihaz pikseli adımlarıyla
  kesirli boyutlar (önceki durumda çubuk varken ve yokken). Üç ekran ölçeğinde koşulur (baslat.ps1 `-Olcek`, yeni:
  `--force-device-scale-factor`). 0.1.19'un koduyla (ayrı çalışma ağacı) 51 denetimin 24'ü (ölçek 1), 27'si (1,25), 25'i (1,5) kalıyor;
  düzeltmeyle üçünde de 51/51.
  - test/sigdirma_rastgele.mjs (yeni): tohumlu rastgele belge / düzen / mod / yakınlaştırma / boyut taraması (7 belge, 420 örnek,
    boyutlar cihaz pikseli adımlarıyla, her örnek öncekinin durumundan başlar; durulma, çubuk–taşma tutarlılığı, ortalama). Bilinen
    sınırları deneyen testin göremediğini arar: iki sayfa düzenindeki 1 px'lik taşmayı bu buldu. Üç ölçekte 420'şer örnek (1,5'te
    üç ayrı tohum) sorunsuz. Bir koşuda tek örnek "durulmadı" verdi; aynı tohumla iki yinelemede ve tek başına yeniden üretilemedi
    (boyut değişiminin yerleşimi geç geldi): durulma ölçütü ilk yerleşimi bekleyecek biçimde düzeltildi.
  - Bir kez ölçülenler: kullanıcının belgesinin kopyasıyla kullanıcının pencere boyutunda 0.1.19 kodu 3 sn'de 45 yerleşim, düzeltme 1.
    Sekme değiştirme, sol panel, okuma modu (gizliyken boyutu değişen sekme gösterilince yeni boyuta yerleşiyor, sayfa korunuyor).
  - Regresyon (düzeltilmiş kodla): kisayol_gorunum 117/117, senaryo22 101/101, senaryo19 111/111 (yer tutucu belgelerle),
    vurgu_cubugu 13/13, kisayol_araclar 91/91.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 27.
