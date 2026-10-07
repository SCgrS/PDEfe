# PDEfe — Plan ve Mimari

Windows 11 ve macOS (0.2.0) için sekmeli PDF görüntüleyici ve düzenleyici. Electron (arayüz, PDF.js ile çizim) + PyMuPDF tabanlı
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
  guvenlik.js           0.1.23: dış adres süzgeci, IPC gönderen denetimi, gezinme koruması, dosya yolu ve çekirdek parametre denetimleri
  preload.cjs           contextBridge: cagir / dinle / gonder / dosyaYolu (kanal izin listesi, 0.1.23)
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
  islemler/yazi_tanima.py  0.1.24: görsellerdeki yazının tanınması (Windows.Media.Ocr, pywinrt); kendi iş parçacığı, sayfa önbelleği
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
notlar_kaydet, freetext_stil, baglantilar, form_gorunum, ocr_sayfa (+ araçlar). ocr_sayfa'nın yanıtı tanıma iş parçacığından gelir
(`Ertelenmis`, 0.1.24): işçi beklemeden sıradaki isteğe geçer, yanıtlar istek sırasıyla gelmeyebilir.

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

### Revizyon 0.1.21 (2026-10-01, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı beş istek bildirdi: (1) tek sekme de kapatılınca sekme şeridi kapanmasın, "boş yeni sekme açılmış gibi"
dursun; (2) sekmeler arası geçiş çok sert, sekme komşusunun tam üstüne gelince yer değiştiriyor, %25'ine girince değiştirsin; (3) sekme
genişliği: şimdiki boyut en küçük boyut olsun, az sekmede büyük, çoğalınca küçülsün, en küçüğe inince kayma başlasın; (4) sekmede sağ tık ›
Yolu kopyala'nın altına "PDF'i kopyala"; (5) kopyala düğmesinin (kaydedilmemiş değişiklik) sorusunda "paylaş" değil "kopyala" yazsın.
- [x] **Sekme çubuğu hiç kapanmaz** (uygulama.js açılış sekmeleri bölümü; sekmeler.js `kaldir`, `tekAcilisDurumu`; index.html).
  Önceden açık belge kalmayınca açılış sekmeleri kaldırılıyor, `kaldir` çubuğu gizliyordu (sekmesiz açılış ekranı, uygulamanın ilk
  hâli). Karar: sekmesiz açılış ekranının yerini **belgesiz pencerede tek açılış sekmesi** aldı; kuralları da o ekranınkiler:
  - Pencere açılış sekmesiyle açılır (`baslat`, 'uygulama:hazir'dan önce). Son belge kapanınca yerine o gelir; belge kalmayınca yanındaki
    öteki açılış sekmeleri teke iner (`belgesizseTekSekme`: etkin olan kalır). İkinci öneri "tarayıcıdaki gibi açılış sekmeleri olduğu
    gibi kalsın" idi; seçilmedi, çünkü belgesiz pencerede birden çok boş sekme hiçbir işe yaramaz ve 0.1.13'ün "belge yokken Ctrl+T sekme
    açmaz" kararıyla çelişir (kısayol testi bunu yakaladı).
  - Tek açılış sekmesi kapatılmaz (`baslangicSekmesiniKapat` reddeder; × gizli, `.tek-acilis`; sağ tıkta Kapat devre dışı; orta tık
    etkisiz). `Ctrl+W` o sekmede pencereyi kapatır: önceki sekmesiz açılış ekranındaki davranış. + / `Ctrl+T` yeni sekme açmaz, o sekmeyi
    seçer (`yeniSekme`).
  - Pencerede açılan her belge (arka planda açılan, araç sonrası yeniden açılan dahil: `dosyaAc`) ve başka pencereden gelen sekme
    (`sekmeyiAl`; yeni pencere de açılış sekmesiyle açılır) tek açılış sekmesinin yerini alır (`tekAcilisSekmesi`). Yoksa "Pencereye
    ayır"da yeni pencerede belgenin yanında boş sekme kalırdı.
  - "Sekmesiz pencere" denetimleri "belgesiz pencere" oldu: başka pencereden sürüklenen sekmenin bırakma alanı belgesiz pencerede
    pencerenin tamamı ('sekme:bant', 'sekme:disSurukle'). Son belgesi başka pencereye taşınan pencere eskisi gibi kapanır.
  - Açılış ekranı 34 px kısaldı (çubuk artık orada da): 1280×700'de 10 son açılanla 26 px taşıyordu (senaryo20). 780 px'e dek alçak
    pencerede bölüm arası 22 → 14 px, üst / alt en az boşluk 20 / 28 → 12 / 16 px, imzanın üstü 10 → 4 px (`@media (max-height: 780px)`);
    yüksek pencerede değişmedi. Bölümleri her boyutta sıklaştırmak seçilmedi (geniş ekranda gereksiz).
- [x] **Sürüklerken yer değiştirme eşiği** (sekmeler.js `surukleIzle`, `YER_DEGISTIRME = 0.25`). Önceden sürüklenen sekmenin ortası
  komşunun ortasına varınca yer değişiyordu; eş genişlikte sekmelerde bu, sağ kenarın komşunun sağ kenarına varması, yani sekmenin
  komşusunun tam üstüne gelmesi demek. Artık sağa giderken sağ kenarı, sola giderken sol kenarı komşunun genişliğinin dörtte birine
  girince yer değişir. Gecikme payı (histerezis) eklenmedi: eşik yalnızca sürükleme miktarına bağlı, geri çekince aynı noktada geri
  döner; titreme olmaz. Başka pencereden gelen sekmenin bırakılacağı yer (`birakmaYeri`) ortaya göre kaldı (sürükleme değil, yer seçimi).
- [x] **Sekme genişliği** (stil.css `.sekme`; sekmeler.js `genislikKilitle`). `.sekme { flex: 0 1 220px; width: 220px; min-width: 118px }`:
  liste içeriği kadar geniş (`#sekme-liste { flex: 0 1 auto }`, + son sekmenin yanında), sığmayınca sekmeler birlikte daralır, 118 px'te
  durur, liste kayar. 118 px 0.1.5'ten beri sabit genişlikti; kullanıcının dediği gibi en küçük boyut oldu. En büyük boyut 220 px
  (kullanıcı değer vermedi; tarayıcılarınkine yakın, UYAP adlarının çoğu kısalmadan sığar). 1280 px pencerede 5 sekmeye dek 220 px,
  6–9 sekmede 189–125 px, 10 sekmeden sonra 118 px ve kayma.
  - × ya da orta tıkla kapatırken sekme genişliği o anki genişlikte kilitlenir (`.genislik-kilitli`, `--sekme-kilit`), imleç sekme
    çubuğundan çıkınca ya da sekme eklenince kalkar: sıradaki sekmenin × düğmesi imlecin altına gelir (tarayıcılardaki gibi). Kilit
    olmasa art arda kapatırken her seferinde sekmeler genişleyip × düğmeleri kayardı.
  - Bulunan eski kusur: sekmeler sığmayınca listeyle birlikte ◀ ▶ ve açık belgeler düğmeleri de daralıyordu (flex-shrink; 0.1.20'de de
    kaydırma başlayınca 8 px). Sekme kapanıp sekmeler sığınca bütün sekmeler 8 px sağa kayıyor, × düğmesi imlecin altından çıkıyordu
    (senaryo23 yakaladı). Düğmeler artık daralmaz.
- [x] **PDF'i kopyala** (uygulama.js `pdfKopyala`; index.html, menu.js). Sekmede sağ tık › Yolu kopyala'nın altında; açılış sekmesinde devre
  dışı. Araç çubuğu düğmesiyle aynı iş: kaydedilmemiş değişiklik varsa önce sorulur; sağ tıklanan sekme etkin değilse soru açılmadan önce
  ona geçilir (kapatma sorusundaki gibi hangi belge için sorulduğu görünsün). Komut kimliği `arac.paylas` kaldı (testler ve menü onu
  kullanıyor). Sorudaki "paylaş" sözcükleri "kopyala" oldu; düğmenin ipucu ("PDF'i kopyala: dosyayı panoya kopyalar") ve Araçlar menüsü
  ("PDF'i kopyala (dosyayı panoya)") da: kullanıcı yalnızca soruyu gösterdi, ama aynı işin üç yerde farklı adla görünmemesi için.
- [x] **Testler**: test/senaryo23.mjs (yeni, 42 denetim): açılış sekmesi kuralları (açılış, kapatma, belge açma / kapama, arka planda
  açma, Pencereye ayır ile yeni pencere, belgesiz pencereye taşıma, Ctrl+W), genişlik (1–14 belge: eşit genişlik, 220 px, daralma,
  kayma yalnızca 118 px'te), gerçek fare olaylarıyla × ve orta tıkla kapatırken kilit, sürükleme eşiği (%18'de değişmez, %32'de değişir,
  iki yönde, iki sekme öteye), PDF'i kopyala menüsü, soru metni ve düğmeleri, ipucu ve menü adı.
  - Eski davranışı bekleyen denetimler güncellendi: senaryo19 (belge yokken çubuk gizli, son belge kapanınca açılış sekmeleri kalkar;
    sağ tık menüsünde PDF'i kopyala), kisayol_dosya (başlangıçta sekme yok), senaryo22 (sekmesiz pencere; sağ tık menüsü), senaryo20 ve
    sekme_genislik (sürükleme hedefi eski eşiğe göre hedefin sağ ucundaydı; artık hedef sekmenin tutma noktası: her genişlikte hedefe
    girer, sonrakine girmez; alçak penceredeki en az boşluklar).
  - Regresyon (yer tutucu belgelerle): senaryo23 42/42, senaryo22 101/101, senaryo19 110/110, senaryo20 38/38, kisayol_dosya 163/163,
    kisayol_gorunum 117/117, senaryo21 39/39, senaryo14, sekme_genislik 24/24 (720 px), gercek_fare (Windows fare iletileri) hepsi geçti.
    ortu_tiklama bu bilgisayarda olmayan yer imli örnek PDF'i istediği için koşulmadı (sekmelerle ilgisi yok).
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 28.

### Revizyon 0.1.22 (2026-10-01, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı: "tüm sekmeler kapandığında ekstra yeni boş sekmeler ekleyemiyorum, bunu düzeltelim".
- [x] **Belgesiz pencerede de yeni boş sekme** (uygulama.js `yeniSekme`, `sekmesizKalmasin`). Kök neden: 0.1.21'de belgesiz pencere "tek
  açılış sekmesi" kuralıyla sekmesiz açılış ekranının yerine konmuştu; `yeniSekme` pencerenin tek sekmesi açılış sekmesiyse yenisini
  açmıyor, o sekmeyi seçiyordu (0.1.13'ün "belge yokken Ctrl+T sekme açmaz" kararını sürdürmek için). Kullanıcının isteği bu kararı
  kaldırır: + / Ctrl+T her zaman yeni açılış sekmesi açar. 0.1.21'de seçilmeyen "tarayıcıdaki gibi açılış sekmeleri olduğu gibi kalsın"
  yolu seçildi; kurallar:
  - Son belge kapanınca yanındaki açılış sekmeleri kalır (`belgesizseTekSekme` → `sekmesizKalmasin`: yalnızca sekme kalmadıysa açılış
    sekmesi açar). Teke indirmek kullanıcının az önce açtığı boş sekmeleri silerdi.
  - Pencerenin tek sekmesi açılış sekmesiyse kurallar 0.1.21'deki gibi: kapatılmaz (× gizli, Kapat devre dışı), Ctrl+W pencereyi kapatır,
    açılan ya da başka pencereden gelen ilk belge onun yerini alır (`tekAcilisSekmesi`). Birden çok açılış sekmesinde her biri kapatılabilir.
  - Birden çok açılış sekmesi varken: etkin açılış sekmesinden açılan belge yalnızca onun yerini alır (0.1.13 kuralı); arka planda açılan
    ya da başka pencereden taşınan belge yanlarına eklenir (yerini alacak tek sekme yok, hangisinin silineceği belirsiz).
  - Değişmeyen: son belgesi başka pencereye taşınan pencere, açılış sekmeleri olsa da kapanır (boş sekmenin taşıdığı bir şey yok;
    0.1.21'deki gibi). Belgesiz pencerenin bırakma alanı pencerenin tamamı.
- [x] **Testler**: senaryo23 (42 → 53): + düğmesine gerçek fare tıklaması (CDP), Ctrl+T, sağ tık menüsü, Ctrl+W ve × ile açılış sekmelerini
  kapatma, iki açılış sekmesinden belge açma / kapama, belgeler kapanınca açılış sekmelerinin kalması, arka planda açma, iki açılış
  sekmeli belgesiz pencereye sekme taşıma. Eski davranışı bekleyen denetimler güncellendi: senaryo19 (son belge kapanınca açılış
  sekmeleri kalır; belge yokken Ctrl+T açar, Ctrl+W kapatır), kisayol_dosya (belge yokken Ctrl+T ikinci sekme açar, Ctrl+W onu kapatır).
  - Regresyon (yer tutucu belgelerle): senaryo23 53/53, kisayol_dosya 164/164, senaryo19 112/112, senaryo20 38/38 (son üçü görünmeyen
    masaüstünde), senaryo22 101/101, sekme_genislik 24/24 (720 px). senaryo22 görünmeyen masaüstündeki örnekte (`baslat_gizli.ps1`)
    koşulunca "ikinci örnek" denetimlerinden 3'ü düşüyor (ikinci örnek o masaüstündeki örneği bulamıyor); kendi kullanımındaki gibi
    `baslat.ps1` ile hepsi geçti.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 29.

### Revizyon 0.1.23 (2026-10-01, güvenlik ve kişisel veri denetimi)
Ayrıntı: CHANGELOG.md. Kullanıcı PDEfe'nin kişisel veri ve güvenlik açısından denetlenmesini istedi; denetim (ana süreç, arayüz, çekirdek,
kurulum, güncelleme, depo geçmişi) önerilerinden "yazar adı" dışındakilerin hepsini onayladı ("3 numara hariç bütün önerilerini
yapabilirsin"). Yazar adı (varsayılan Windows kullanıcı adı, notun /T alanına gider) değişmedi; kullanıcı Ayarlar › Not ve vurgu'dan
bakacak.
- [x] **PDF bağlantıları** (main/guvenlik.js `disAdresMi`, uygulama.js `disBaglantiAc`). Kök neden: PDF'teki /URI tek tıkla, süzgeçsiz ve
  sorusuz `shell.openExternal`'a gidiyordu. PyMuPDF yalnızca küçük harfli `file:`'ı LINK_LAUNCH sayıyor; `FILE:///…exe`, `search-ms:`,
  `ms-…:` LINK_URI olarak geçiyordu (bellekte üretilen PDF'le sınandı). Windows'ta ShellExecute bunlarla program çalıştırabilir, uzak
  paylaşıma bağlanıp NTLM özetini gönderebilir. Karar: yalnızca http / https / mailto (ana süreç `kabuk:disAc` ve `setWindowOpenHandler`
  de bakar); PDF bağlantısında tam adres gösterilip sorulur, "Bu belgede yeniden sorma" belge kapanana dek. Çekirdekte süzülmedi (adres
  ipucunda görünsün; karar arayüzde ve ana süreçte).
- [x] **Köprü ve ana süreç** (preload.cjs izin listesi; guvenlik.js `guvenliIpc`, `gezinmeKorumasiKur`, `cekirdekParametreleri`,
  `pdfDosyasiMi`, `yaziTipiDosyasiMi`, `anlikDosyasiMi`). Bugün XSS bulunmadı (PDF'ten gelen her dize textContent / `kacis` ile giriyor,
  CSP sıkı, PDF JavaScript'i çalışmıyor); değişiklik önleyici: PDF.js'te ileride bir açık çıkıp arayüzde kod çalışırsa köprü her dosyayı
  okuyup silebiliyor (`dosya:oku`, `dosya:sil` → kalıcı `unlink` yedeği, `dosya:kopyala`), `kabuk:klasorAc` (`shell.openPath`) exe
  çalıştırabiliyordu. Kararlar:
  - IPC yalnızca `pdefe://app/` çerçevesinden (`guvenliIpc`; bütün modüllere ipcMain yerine verilir, main.js `ipcKur(ipc)`).
  - `dosya:oku` yalnızca başında `%PDF-` olan dosyalar ve Windows yazı tipi klasöründeki .ttf/.ttc/.otf (yaziTipleri.js). Uzantıya değil
    imzaya bakılır: "Tüm dosyalar" süzgeciyle açılan uzantısız PDF de açılır.
  - `dosya:sil` yalnızca .pdf ve yalnızca Geri Dönüşüm Kutusu (kalıcı silme yedeği kalktı; kucult.js "gönderilemedi" der).
    `dosya:kopyala` kaldırıldı (kullanılmıyordu). `kabuk:klasorAc` yalnızca klasör. `pano:dosya` yalnızca PDF.
  - Çekirdek: `hedef` yalnızca .pdf (PDF baytları .bat/.cmd'ye yazılırsa notun `/Contents`'indeki `&komut&` çalışabilirdi); yapısal kaydın
    anlık kopya klasörünü ana süreç verir; `anlik_sil` yalnızca anlık kopya (ana süreç klasör + ad, çekirdek ad + "anlik" klasörü).
    Farklı kaydet'te PDF süzgeciyle başka uzantı yazılırsa `.pdf` eklenir (meşru yol hep .pdf'le biter).
  - `will-navigate`, `will-frame-navigate`, `will-redirect` uygulama dışına gidemez; webview eklenemez. CSP: `object-src`, `base-uri`,
    `form-action` 'none'.
  - Seçilmeyen: kanal başına ayrı preload işlevleri (bütün arayüzü değiştirirdi; izin listesi + ana süreç denetimi aynı korumayı verir).
- [x] **Silinen notun izi** (notlar.py `y_notlar_kaydet` `temiz`, `y_imza_durumu`; uygulama.js `temizKayitKarari`). Kök neden: Kaydet her
  zaman artımlı; kayıtlı not silinince / değişince eski hâli dosyanın önceki bölümünde kalıyordu (sınandı). Karar: o durumda belge baştan
  yazılır (garbage=1 xref'leri korur; aynı dosyaya yazımda şifreleme PDF_ENCRYPT_KEEP). PDF'e gömülü e-imza varsa (/SigFlags, değerli imza
  alanı ya da /ByteRange) baştan yazım imzayı bozar: İmzayı koru / Tamamen sil / Vazgeç sorulur, seçim belge kapanana dek; otomatik
  kayıtta sorulmaz, imza korunur (otomatik kayıt varsayılan kapalı). İndirilenler'deki 200 UYAP PDF'inin hiçbirinde PDF'e gömülü imza
  yok (yalnızca sayıldı): soru pratikte çıkmaz. Not ekleme ve yalnızca döndürme yine artımlı (e-imza ve hız).
- [x] **Pano ve geçici dosyalar** (main.js `pano:metin` `yalnizcaPanodaysa`, `geciciKopyalariSil`; ayarlarPenceresi.js). Kopyalamadan sonra
  gelen temiz metin yalnızca pano hâlâ o kopyalamanın metnini taşıyorsa yazılır (satır sonları eşitlenir: Blink Windows'ta \n'i \r\n
  yazar). Pano görüntüleri ve yazdırma iş klasörleri kurulu PDEfe'nin açılışında, pano görüntüleri kapanışında da silinir; yalnızca
  varsayılan veri klasörüyle çalışan paketli örnekte (%TEMP%\PDEfe bütün örneklerin ortağı: test örneği kullanıcının açık PDEfe'sinin
  dosyasını silmesin). Ayarlar › Açılış ve düzen'e "Hatırlanan sayfaları temizle". Seçilmeyen: anlık kopyaları %LOCALAPPDATA%'ya almak
  (veri klasörü ayrı örnekler aynı klasörü paylaşır, açılış temizliği başka örneğin açık belgesinin kopyasını silerdi).
- [x] **Kötü niyetli PDF** (pdefe_core.py `olcek_sinirla` / `EN_FAZLA_PIKSEL` 64 milyon; notlar.py `_pdefe_fontu_mu`;
  `pymupdf.set_messages(stream=sys.stderr)`). Not görünümü, yazdırma görüntüsü, küçük resim, form görünümü ve araçların küçük resmi dev
  kutu / sayfada ölçeği küçültür. /PDEfeFonts kaydındaki font yalnızca PDEfe'nin alt kümesiyle bayt bayt aynıysa (Type0/Identity-H,
  CIDToGIDMap yok ya da /Identity) yeniden kullanılır; değilse yeniden gömülür, sayfada aynı adlı kaynak varsa benzersiz adla. Bunun
  için alt küme kararlı yapıldı (`TTFont(recalcTimestamp=False)`; önceden head.modified her üretimde değişiyordu). Önceki sürümlerin
  gömdüğü fontta bir kez, başka bilgisayarın farklı sürüm Windows fontunda o bilgisayarda her kayıtta yeniden gömülür (~50 KB). MuPDF iletileri JSON kanalına
  (stdout) karışıyordu (bozuk akışlı PDF'te sınandı).
- [x] **Bağımsız inceleme** (iki salt okunur ajan: ana süreç / arayüz, çekirdek) gerçek hatalar buldu, düzeltildi:
  - Çekirdek belgeleri uzantıya göre açıyordu (metin, HTML, SVG, EPUB): `sayfa_metni` gibi çağrılarla `dosya:oku` kısıtı aşılırdı.
    Önbellek, `belge_ac_yazmak_icin` ve araçların `_pdf_ac`'ı `filetype="pdf"`.
  - Temiz yazım `os.replace` ile "internetten indirildi" işaretini (Zone.Identifier), izinleri ve oluşturma tarihini siliyordu:
    notlar.py `dosyayi_yerine_koy` (ReplaceFileW, kısa kilitlerde yeniden dener). Araçların ve yapısal kaydın üzerine yazması
    (araclar.py `_kaydet_sinirli`, yapisal.py `_degistir`) 0.1.22'deki gibi `os.replace`: dokunulmadı.
  - Onarılmış dosyaya not kaydı tamamen başarısızdı (0.1.22'de de; MuPDF FzErrorArgument yakalanmıyordu): `is_repaired` ise tam yazım.
    Aynı dosyaya her tam yazımda şifreleme korunur (yedek yol önceden düşürüyordu).
  - Etiketli PDF'te yapı ağacı (OBJR) silinen notu gösterdiği için garbage nesneyi atmıyor, metin kalıyordu: `not_sil` silinen
    nesneleri boşaltır.
  - Yazdırmada dpi tamsayıya yuvarlanınca dev sayfada (/UserUnit) sınır aşılıyordu: ölçek matrisle, çözünürlük bilgisi `set_dpi`.
  - İmza araması parça parça; okunamazsa hata (arayüz imzayı korur).
  - Uzantısı .pdf olmayan PDF kaydedilemiyordu (`cekirdekParametreleri` var olan PDF'in üzerine yazmaya izin verir); kilitli dosyada
    "PDF değil" deniyordu (`pdfDosyasiMi` okuma hatasını fırlatır); Farklı kaydet'te aynı dosya seçilince temiz yazım atlanıyordu;
    `.pdf` eki eklenen ad varsa Windows'un sorusu atlanıyordu (ana süreç sorar).
  - Bilerek yapılmayan: otomatik kayıtta da temiz yazım (büyük taranmış belgede yavaş; otomatik kayıt varsayılan kapalı, kullanıcı
    kapattı). Yazı tipi ev ve ofisin Windows font sürümleri farklıysa belge bilgisayar her değiştiğinde yeniden gömülür (~50 KB).
- [x] **Electron 44.5.1 ve sigortalar** (package.json, electron-builder.yml `electronFuses`): RunAsNode, NODE_OPTIONS, --inspect kapalı;
  OnlyLoadAppFromAsar ve EmbeddedAsarIntegrityValidation açık (electron-builder Windows exe'ye asar özetini yazar). Yerel pakette sınandı:
  sigortalar okundu, `gercek_fare.ps1 -Paketli` 9/9, app.asar'ı bir bayt değiştirilmiş kopya açılmadı.
  grantFileProtocolExtraPrivileges değişmedi (yazdırma penceresi file:// ile yükler).
- [x] **Testler**: senaryo24 (38: bağlantılar, köprü, silinen not, pano, ayar), test/guvenlik_testi.py (36: temiz kayıt, internetten indirildi
  işareti, onarılmış dosya, etiketli PDF, şifre, imza algılama, anlık silme, piksel sınırı, yazı tipi kaydı, çekirdek kanalı), test/guvenlik_pdf_uret.py.
  - Regresyon (son hâl, Electron 44.5.1; Masaüstü\PDF DENEME örnekleri bu bilgisayarda yok, yer tutucularla): senaryo24 38/38,
    senaryo23 53/53, senaryo19 111/111, senaryo20 38/38, senaryo21 39/39, kisayol_dosya 164/164, kisayol_gorunum 117/117, kisayol_araclar
    91/91, ortu_tiklama 155/155, sekme_genislik 24/24, sigdirma_kararli 51/51; senaryo1, 3, 5–8, 10–18, 22 geçti. senaryo2, 4, 9,
    vurgu_cubugu, oto_kayit_kilit 0.1.22'nin çalışma ağacında da aynı hatayla düşüyor (eski testler, örnek belgeye bağlı); senaryo19'un
    111'i 0.1.22'de de 111 (notlardaki 112 ortama bağlı). not_testi ve araclar_testi 0.1.22 ile aynı (yer tutucularla araclar 114/120,
    aynı 6 hata). Testlerin "Panodan ekle" adımı gerçek panodaki görüntüyü kullanıp %TEMP%\PDEfe'ye kopyasını bırakıyor: silindi.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 30.

### Revizyon 0.1.24 (2026-10-02, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı (evde, üç madde): "pdf resimlerdeki seçebildiği harf kelimeleri seçebilmek istiyorum"; menü çubuğu
varsayılan olarak gizli olsun, kopyalama simgesinin yanındaki bir işaretle açılıp gizlensin, PDEfe bu ayarı hatırlasın; "soldaki kaydırma
şeridini biraz genişletmek lazım" (sorulunca: "sağdaki kaydırma şeyini kastetmiştim", yani belgenin kaydırma çubuğu).
- [x] **Görsellerdeki yazı** (core/islemler/yazi_tanima.py; goruntuleyici.js `tanimaIste`, `tanimaOgeleri`; pdefe_core.py `Ertelenmis`,
  `y_metin_sec`).
  - Tanıyıcı Windows.Media.Ocr (Python'dan pywinrt 3.2.1). Gerekçe: Windows 10/11'de yerleşik, Türkçe dil paketiyle gelir (bu bilgisayarda
    "tr" var), çevrim dışı, model dosyası dağıtılmaz, hızlı: A4 216 dpi ~0,15 sn; İndirilenler'deki gerçek taranmış UYAP sayfalarında
    (yalnızca sayılar okundu) en uzunu 0,39 sn, sayfa başına 17–75 satır. Seçilmeyen: Tesseract (PyMuPDF'in tanıması da onu ister; kurulum
    ve ~15 MB Türkçe model), tesseract.js (WASM, yavaş, model dağıtımı), PowerShell'den WinRT (her sayfada süreç), .NET yardımcı exe
    (çalışma zamanı ya da ~60 MB).
  - Tanınan bölgeler: sayfadaki görsellerin birleşik kutuları; 1000 pt²'den küçükler (simge, madde imi, logo) atlanır, görseller sayfanın
    %60'ını kaplıyorsa bütün sayfa. Kutusunun en az %15'ini sayfanın sözcükleri kaplayan görsel tanınmaz (başka programla tanınmış tarama:
    görünmez yazı; antet görselinin üstüne yazılmış belge). Tanınan sözcüklerden sayfanın bir sözcüğüyle (küçüğünün alanının) %30'undan
    çok örtüşenler atılır: taranmış evraka eklenmiş e-imza satırı iki kez seçilmesin.
  - Bölge ekrandaki düzlemde (/Rotate uygulanmış) gri çizilir: tanıyıcı yazıyı okuyucunun gördüğü gibi dik görür; sonuç PyMuPDF'in
    düzlemine (döndürülmemiş, görünür kutunun üst-sol kökenli) çevrilir. Tanıyıcının ölçtüğü eğim 1°'den azsa sözcük kutuları satırın
    üst ve alt kenarına eşitlenir (seçim vurgusu satırda düz). Ters (180°) taranmış yazı tanınmaz.
  - Türkçe tanıyıcı rakamların arasındaki 1 ve 0'ı harf okuyabiliyor ("01.ıo.2026"): en az iki rakamlı sözcükte, önünde rakam ya da
    . / - (veya sözcük başı), ardında rakam ya da . / - olan rakama benzer harf dizisi (o O ı l I i |) rakam yapılır. Ekler ("1990'lı",
    "15'i", "80li") çevrilmez (ilk sürümdeki "harfler rakamlardan az" kuralı onları bozuyordu; incelemede bulundu).
  - İş parçacıkları: çizim işçide (PyMuPDF iş parçacığı güvenli değil), tanıma `yazi-tanima` iş parçacığında. Yöntem `Ertelenmis`
    döndürür, `_istek_isle` yanıtı oradan yazdırır: tanıma sürerken küçük resimler ve kopyalama beklemez (sınandı: tanımadan sonra
    gönderilen küçük resim isteği önce yanıtlandı). Sonuç (yol, değişme zamanı, boyut, sayfa) anahtarıyla 400 sayfalık önbellekte.
    Tanıyıcı yoksa (dil paketi, pywinrt) `desteklenmiyor` döner, arayüz o pencerede bir daha istemez.
  - Arayüz: metin katmanı kurulunca sayfa için `ocr_sayfa` istenir; aynı anda tek istek, sıradaki geçerli sayfaya en yakın bekleyen;
    katmanı boşaltılan (kaydırılıp geçilen) sayfa kuyruktan düşer. Sözcükler PDF.js metin öğesine çevrilir ve PDF'in öğelerinden sonra
    eklenir: Bul'un vurgusu öğe sırasıyla eşlendiğinden PDF'in öğeleri yerinde kalmalı. Sonuç gelince katman yeniden kurulur (katmanda
    seçim varsa seçim kalkana dek beklenir); sonra yakınlaştırma ya da kaydırmayla yeniden kurulurken girdideki sonuç kullanılır.
  - Öğe = sözcük + ardındaki boşluk, genişliği sözcüğün kendi genişliği. Ayrı boşluk öğesi de sonraki sözcüğe dek uzanan öğe de seçim
    vurgusunu sonraki sözcüğün başında iki kat koyulaştırıyordu (ekran görüntüsüyle bulundu): Chromium her mutlak konumlu öğenin sonuna
    satır sonu vurgusu çiziyor; öğe sözcükte bitince o vurgu sözcük arasındaki boşluğa düşer.
  - Kopyalama: `metin_sec` tanınan sözcükleri yalnızca seçim onlardan birine değiyorsa sayfanın sözcüklerine katar (yalnızca PDF metni
    seçilmişken sayfanın sol kenarı ve sütunlar kenardaki bir kaşenin yazısından etkilenmesin: her satır girintili, ayrı paragraf
    çıkıyordu). Her satır ayrı bloktur, alt alta tam satırlar "satır başına blok" kuralıyla paragrafta birleşir. Önbellekte yoksa ve
    seçim tanınacak bir bölgeye değiyorsa tanır ve bekler; değmiyorsa beklemez.
  - Bul tanınan yazıyı aramaz (bilerek): tanıma yalnızca görünen sayfalarda yapılıyor; aranan sözcük tanınmış sayfada bulunup henüz
    tanınmamışta bulunmazdı. Bütün belgede aramak için arka planda tanıma ileride düşünülebilir.
  - Tanınan yazı belgeye yazılmaz (görünmez yazı katmanı eklenmez): dosya değişmez, e-imza bozulmaz.
- [x] **Döndürülmüş sayfada kopya sırası** (pdefe_core.py `y_metin_sec`, `_bos_paragraflar`). Kök neden: sözcükler ve seçim kutuları
  döndürülmemiş düzlemde; /Rotate 90 sayfada ekranda düz okunan yazı orada dikeydir, satırlar y'ye göre sıralanınca karışıyordu (PDF
  metniyle de sınandı: "Üçüncü, Birinci, İkinci"; çekirdeğin metni uzunluğu tuttuğu için panoya o geçiyordu). Karar (`_metin_duzlemi`):
  PDF metninin satırlarının çoğu ekranda soldan sağa okunuyorsa (ya da sayfada yalnızca tanınan yazı varsa) sözcükler, kutular ve boş
  paragraflar ekrandaki düzleme çevrilir; satırlar döndürülmemiş düzlemde soldan sağa okunuyorsa (sayfa ekranda yan duruyor) 0.1.23'teki
  gibi kalır (ilk sürüm her döndürülmüş sayfayı çeviriyor, yan duran sayfada sırayı tersine çeviriyordu; incelemede bulundu).
  Döndürülmemiş sayfada değişiklik yok.
- [x] **Menü çubuğu** (ayar `menuCubugu`, varsayılan false; pencereler.js `menuCubuguKur`, `menuCubugunuUygula`; uygulama.js
  `menuDugmesiGuncelle`; index.html `#dugme-menu`). Düğme kopyala düğmesinin solunda: kopyala, Ayarlar ve tema düğmelerinin yeri
  değişmez. Basılıyken çubuk görünür. Gizliyken `autoHideMenuBar`: tek başına Alt çubuğu geçici gösterir (Windows'taki gibi; Alt+D gibi
  menü harfleri de çalışır; test örneğinde sınandı); Ctrl kısayolları her iki durumda çalışır (gizliyken `Ctrl+,` sınandı). Dar pencerede
  araç çubuğu sıkışırken menü düğmesi kopyala düğmesinden önce gizlenir (yeni kademe `sikisik-4`; kopyala `sikisik-5`): yoksa 720–748 px
  pencerelerde kopyala düğmesi gizleniyordu (gerileme denetiminde ölçüldü). Ayar bütün pencerelerde ortak (ana süreç `ayar:koy`'da bütün
  pencerelere uygular); "Varsayılanlara dön" ona dokunmaz (DURUM_ANAHTARLARI, sol panel gibi görünüm durumu). Eski sürümden gelen
  kullanıcıda da gizli açılır ("varsayılan olarak gizli olsun"). Seçilmeyen: Görünüm menüsüne ayrıca öğe (istenmedi).
- [x] **Kaydırma çubuğu** (stil.css `.kaydirici::-webkit-scrollbar` 16 px, tutamak 6 → 10 px). Yalnızca belge görünümü; panellerdeki ve
  pencerelerdeki çubuklar 12 px kaldı. Sığdırma hesabı kalınlığı ölçüm kutusundan okur (`cubukKalinligi`): kutuya `.kaydirma-olcer`
  sınıfı verildi, aynı kuralı alır.
- [x] **Paket**: pywinrt PyInstaller'da açıkça toplanır (`collect_submodules("winrt")`, `collect_dynamic_libs("winrt")`: msvcp140.dll);
  çekirdek klasörü ~80 MB (+~1 MB). CI paket listesine winrt-* 3.2.1. Paketli çekirdek bu bilgisayarda sınandı (örnek PDF'te sonuçlar
  kaynaktakiyle aynı).
- [x] **Testler**: senaryo25 (28: menü çubuğu varsayılanı, düğme, içerik alanı, yeniden yükleme, ayar; çubuk kalınlığı ve sığdırma;
  taranmış, yan çevrilmiş, görselsiz, önceden tanınmış ve karışık sayfa; sözcüklerin yeri, fareyle seçim, kopya, çekirdeğin temiz metni,
  katman yeniden kurulunca, Bul), test/tanima_pdf_uret.py (örnek PDF), test/tanima_testi.py (19: rakam kuralı, kenardaki kaşe, iki tür
  döndürülmüş sayfa, 4000 görselli ve büyük sayfa, çıkışta bekleyen yanıt; incelemenin bulgularını kapsar).
  - Regresyon (yer tutucusuz; Masaüstü\PDF DENEME bu bilgisayarda yok): senaryo23 53/53, senaryo24 38/38, senaryo21 39/39, kisayol_gorunum
    117/117, kisayol_araclar 91/91 (ilk koşum hatasız kesildi, temiz örnekte geçti), ortu_tiklama 155/155, sekme_genislik 24/24 (720 px;
    son hâlle yeniden), sigdirma_kararli 51/51 (ölçek 1, 1,25, 1,5), sigdirma_rastgele 420 örnekte 0 sorun (1 ve 1,5), senaryo19 112/112,
    senaryo20 38/38, kisayol_dosya 164/164, senaryo22 101/101, kopyalama_testi 17/17 (1.5.6098.pdf vakaları atlandı), guvenlik_testi 36/36.
    Pano kullanan senaryo3, 11, 12 koşulmadı.
- [x] **Bağımsız inceleme** (salt okunur ajan) gerçek hatalar buldu, düzeltildi ve kopyalarıyla yeniden sınandı:
  - Yalnızca PDF metni seçilince kenardaki kaşenin tanınan yazısı kopyayı bozuyordu; rakam kuralı ekleri bozuyordu; döndürülmüş ama yazısı
    yan duran sayfada kopya sırası tersine dönüyordu (yukarıda).
  - Kötü niyetli PDF: görsel kutularını birleştirme kutu sayısının küpüyle uzuyordu (800 kutu 5,6 sn; ~14 KB'lık PDF'le dakikalar). 60'tan
    çok görsel kutusu birleştirilmez, sayfa tek bölge (4000 görselli sayfa 0,13 sn). Piksel sınırı bölge başınaydı (30 bölgede ~600 MB):
    sayfa başına 20 milyon piksel, ölçek ortak küçülür.
  - Tek / iki sayfa düzeninde ön çizilen sonraki sayfanın tanınan yazısı gösterilince eklenmiyordu (`yerlesim` yerine `yerAl`).
  - Tanıma iş parçacığı yanıt yazarken hata alırsa ölüyordu (bütün tanıma istekleri yanıtsız kalırdı): yanıt yazımı da korunur. Çıkışta
    süren WinRT işi kapanan yorumlayıcıya girip çökebilirdi: sıradaki tanımalar en çok 10 sn beklenir, süreç `os._exit` ile sonlanır
    (yanıt da yazılır; sınandı). Aynı sayfa için ikinci tanıma işi önbellekteki sonucu kullanır.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 31.

### Revizyon 0.1.25 (2026-10-02, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı (ofiste, maddeler): PDF ayır'da "sayfa aralıklarına göre"nin yanına "ayrı ayrı dosya" ve "tek dosya"
seçenekleri ("aralık" sözcüğü bu iki seçenekte geçmesin; kullanıcı ayrıca açıkladı), "her … sayfada bir yeni dosya" ve "seçili sayfaları
çıkart" kalksın, dosya adı birleştirmedeki gibi verilsin, "Ayrılmış" yazsın; PDEfe'nin verdiği adlar baş harfi büyük ve "Birleşik" gibi
Türkçe harfli olsun; bir PDF açıkken birleştir açılınca o PDF listenin başında olsun; PDF ayır'da dosya adı yeri yok, bütün araçlar
standart olsun; "PDF küçült"ün adı "PDF Sıkıştırma", araçtaki "Sıkıştırma" başlığı "Sıkıştırma seçenekleri"; varsayılan ad parantezsiz,
doğrudan "Sıkıştırılmış", aynı şekilde "Düzenlenmiş"; bütün araçlarda Kaydet başlığının altı ekran görüntüsündeki (PDF küçült'ün Kaydet
bölümü) düzende; görüntülerden metin çekerken sözcükleri ve rakamları daha iyi tanısın; "üzerine yaz'ı seçince kayıt yeri ve kayıt
isimlendirmesi kayboluyor". Plan sunuldu; iki soru soruldu: birden çok dosyada adlar sayfa numarasıyla ("Ayrılmış - Sayfa 1-3.pdf",
önerilen) mı sıra numarasıyla mı → sayfa numarasıyla; Birleştir'de "Üzerine yaz" → "eğer açık belgede araç açılıp da açık belge
çıkartılmamışsa üzerine yaz gelsin".
- [x] **Kaydet bölümü** (ortak.js `kayitSecimi`, `sabitCiktiSatiri`; araclar.css). Bütün araçlarda başlık "Kaydet", altında sırayla bölümlü
  seçim, kısıt satırı, dosya satırı, not. Sayfaları düzenle'de seçim ile dosya satırı yan yana bir şeritti; Birleştir'de başlıklar solda,
  denetimler sağda bir ızgaraydı ve "Üzerine yaz" yoktu (Kalite bölümü de başlığı üstte oldu: pencerenin içinde iki düzen olmasın).
  Birleştir'in listesi ~90 px kısaldı (1080p ekranda ~6 satır görünür; kisayol_araclar 900 px yerine 1000 px yüksek pencerede koşulur).
- [x] **"Üzerine yaz"da satır kaybolmuyor.** Kök neden: `goster()` yeni belge satırını gizleyip yalnızca notu gösteriyordu; kullanıcı
  "kayboluyor" diye bildirdi. Karar: yerinde üzerine yazılacak dosyanın adı (uzantısız) ve klasörü aynı düzende soluk durur; ad kutusu ve
  Değiştir devre dışı, klasör çipi Gezgin'de açar. Yeni belge satırının değeri korunur, geri dönünce yerinde. Seçilmeyen: aynı kutuyu
  devre dışı bırakıp yeni belge adını göstermek (yanlış dosyayı gösterirdi), Değiştir'e basınca yeni belgeye geçmek (beklenmedik).
- [x] **Önerilen adlar.** `kayitSecimi` `ek` yerine `ad` alır: "Sıkıştırılmış", "Düzenlenmiş", "Döndürülmüş", "Ayrılmış", "Birleşik"
  (0.1.24'e dek "<özgün ad> (küçültülmüş)", "birlesik"). Kullanıcı "direkt Sıkıştırılmış diye isim öner" dedi: özgün ad öneriye girmez.
  Klasörde varsa "(2)"… (`bosAdBul`). Boş ad yedeği "belge" yerine "Belge" (renderer `guvenliAd`; çekirdekte ad artık zorunlu).
- [x] **PDF ayır** (ayir.js, çekirdek `y_ayir`). Kipler: `aralik` + dosya sayısı (`ayri` | `tek`, "Sayfa aralıklarına göre"nin yanında
  bölümlü seçim) ve `herSayfa`. `herN` ve `secili` kalktı (seçili sayfalar = tek dosya; sayfalar sıralı ve tekrarsız, eski seçili gibi).
  Aralık kutusu ve dosya sayısı seçimi her zaman kullanılabilir, tıklanınca "Sayfa aralıklarına göre" seçilir (Döndür ve kaydet'teki gibi).
  Adları arayüz verir: tek dosyada Kaydet'teki ad olduğu gibi ("Ayrılmış.pdf"; tek aralık yazılınca "Ayrı ayrı" da tek dosyadır),
  birden çok dosyada "<ad> - Sayfa 1-3.pdf" / "<ad> - Sayfa 5.pdf" (parantez yok: "(2)" eki ve sayfa numarası karışmasın; " - " Windows'un
  kopya adlarındaki ayraç). `kayitSecimi.cokluAyarla`: birden çok dosyada ad ortak baştır, varsayılana "(2)" eklenmez, var olan dosyalar
  için araç sorar ve çekirdek "(2)" ekler (uzerineYaz false), "Üzerine yaz" seçilemez. Tek dosya öteki araçlar gibidir: var olan dosyanın
  üzerine yazmadan önce sorulur, PDEfe'de açıksa sekmesi yenilenir. Sonuç penceresi kaldı (bir dosyada "Yeni sekmede aç").
  Çekirdek: istek `{yol, klasor, parcalar:[{ad, sayfalar}], uzerineYaz}` ya da `{yol, sayfalar, uzerine}`; ad zorunlu, kip tabanlı
  istekler ve "<ad>_1-3" adları kalktı; çıktı özgün dosyanın kendisi olamaz (bunun yolu "Üzerine yaz").
- [x] **Birleştir** (gorselBirlestir.js). `gorselBirlestirAc` etkin belgeyi listenin başına koyar ve "Üzerine yaz"ın hedefi yapar (verilen
  dosya listesiyle açılırsa hedef yalnızca o listedeyse). "Üzerine yaz" o belge listedeyken seçilebilir (`_uzerineDurumu`, her çizimde);
  çıkarılınca yeni belgeye geçer, nedeni yazar; geri eklenince yeniden seçilebilir. Belgesiz açılan araçta hiç seçilemez. Birleştirmeden
  önce listedeki PDF'lerden PDEfe'de kaydedilmemiş değişiklikle açık olanlar sorulur (birleştirme diskteki sürümle yapılır). Kilitli /
  salt okunur hedefte öteki araçların sorusu ve yeniden deneme (`kayitSecimi.hataSor`; önceden yalnızca hata şeridi). Çekirdek: hedef
  listedeki bir PDF olabilir (kaynaklar ekledikten sonra kapatılır, geçici dosya + os.replace); yazdıktan sonra ilerleme bildirilmez
  (geç gelen iptal yazılmış dosyayı yazılmamış gösterip yeni belgeyi silmesin / üzerine yazılan sekmeyi bayat bırakmasın).
- [x] **PDF Sıkıştırma.** Kullanıcının yazdığı gibi "PDF Sıkıştırma" (menüde öteki araçlar küçük harfle; ad bilerek böyle). Düğme
  "Sıkıştır", iletiler "Sıkıştırma …"; komut kimliği (`arac.kucult`), sınıf ve dosya adları değişmedi.
- [x] **Yazı tanıma: sözcükler ve rakamlar** (core/islemler/yazi_tanima.py `_hazirla`, `_dogal_olcek`). Önce ölçüldü (ayrı ölçüm ajanı;
  belge içeriği yazdırılmadı, yalnızca oranlar): İnenler'deki 1100 PDF'ten 703'ü tarandı; metni olan 66 sayfa (66 ayrı belge, 21 396
  sözcük, 2 315'i rakamlı) taranmış gibi görüntüye çevrildi (C1 200 dpi gri JPEG, C2 150 dpi bulanık + 0,5° eğik, C3 200 dpi tek bit,
  C4 300 dpi gürültülü, C5 100 dpi), metin katmanı doğru kabul edildi; 50 gerçek taranmış sayfada (doğru bilinmediğinden) sözlük isabeti
  ve akla yatkın sayı oranı. Ölçümler: sözcük, rakamlı sözcük ve karakter F1; süre ve bellek. Gerçek taramalar: kendi çözünürlüğü
  yüzdelik 10/25/50/75/90 = 72/96/150/200/300 dpi (%47'si 150 dpi'ın altında), 372/373'ü 8 bit (JPEG 210, Flate 162), tek bitlik faks
  türü yok denecek kadar az.
  - Kök neden: MuPDF görseli kendi çözünürlüğünün 2 katı ve üstüne büyütürken en yakın komşu örnekliyor (1,99 kat yumuşak, 2,00 kat
    basamaklı ölçüldü); 216 dpi'da 108 dpi ve altındaki taramalar (gerçek taramaların %14'ü) basamaklı harflerle tanınıyordu.
  - Karar: hedef 300 dpi; görsel kendi çözünürlüğünün 1,95 katından çok büyütülecekse kendi çözünürlüğünde çizilir, büyütmeyi Pillow
    Lanczos'la yapar (`BLOKLU_BUYUTME`; bölgeye en çok alanıyla düşen görselin `transform`'undan; çizimin yatay / dikey ölçeği ayrı
    tutulur, koordinatlar büyütülmüş görüntüye göre çevrilir; hedef boyut doğrudan çizimin boyutuyla aynı, sayfa başına 20 milyon piksel
    sınırı korunur). Benzetimde 216 dpi'a göre sözcük F1 +0,8 ile +1,1 puan (C1, C2, C4), rakamlı sözcük F1 +2 ile +3 puan; 100 dpi'da
    sözcük +9,5, rakam +13,6 puan (66 sayfanın 63'ünde daha iyi). Gerçek taramalarda sözlük isabeti +%0,8, akla yatkın sayı +%5,5
    (200 dpi'lık 31 sayfada sayı +%9,7). Bedeli: sayfa başına süre ortalama +%23 (386 → 474 ms), en çok ~+31 MB bellek.
  - Seçilmeyen (ölçüldü): koruma olmadan 300 dpi (145 dpi taramalarda isabet −%9: basamaklı büyütme), 400 dpi, kendi çözünürlüğünde
    tanıma (−1,3 ile −4,5 puan), Otsu / uyarlamalı eşikleme, ortanca süzgeç, keskinleştirme (düşük çözünürlükte −4,5 puan), kontrast ve
    gama (yalnızca 100 dpi'da küçük kazanç, gerçek taramada yok). Rakam düzeltmesi aynı kaldı: bütün koşullarda 27 sözcüğü değiştirdi,
    3'ünü düzeltti, hiçbirini bozmadı; S→5, B→8, Z→2, g→9 gibi yeni kurallar 0–6 düzeltip 7–11 bozdu (bu karışıklıklar neredeyse hiç
    görülmedi; kaçan rakamların çoğu tanıyıcının bitişik okuduğu ya da hiç okumadığı sözcükler).
  - Ölçüm betikleri depoya girmedi (oturumun geçici klasöründe; belge adları ve içerikleri yazılmadan çalışır).
  - Doğrulama: ölçüm betiğinin "V0" yolu çekirdeğin `_hazirla`'sını çağırır; yeni çekirdekle yeniden koşulup önerilen yolla
    karşılaştırıldı: C1, C3, C4'te 66 sayfanın hepsinde birebir aynı, C2 ve C5'te fark gürültü düzeyinde (ortalama sözcük F1 farkı +0,02
    ve −0,3 puan; hedef boyut doğrudan çizimin boyutu olduğundan görüntüler birkaç piksel farklı). Aynı ölçüyle (sayfa ortalaması) beş
    koşulun ortalaması: sözcük F1 0,868 → 0,892, rakamlı sözcük F1 0,727 → 0,766; gerçek taramalarda sözlük isabeti +%0,8, akla yatkın
    sayı +%5,2. İlk denemede hedef boyut kaba ölçekteki yuvarlamanın büyütülmesiyle hesaplanıyordu: tanima_testi'nin 30 görselli büyük
    sayfasında 20 milyon piksel sınırı %2,5 aşıldı; hedef boyut doğrudan çizimin boyutuna eşitlendi.
- [x] **Testler**: senaryo26 (yeni, 55: adlar ve PDF Sıkıştırma; beş araçta Kaydet düzeni ve konumları, üzerine yazma satırı; PDF ayır
  seçenekleri, önizleme, diskteki çıktılar, "(2)", tek dosyada üzerine yazma; Birleştir'de açık PDF, üzerine yazma, belgesiz araç,
  "Birleşik (2)"; Sıkıştırılmış / Döndürülmüş; 6. bölüm incelemenin bulguları). Güncellenen: araclar_testi (ayır yeni istek biçimi, son
  dosyadan sonra ilerleme yok, birleştir/üzerine), senaryo13, 17, 19, kisayol_araclar (açık PDF listenin başında; 1000 px yüksek pencere),
  ortu_tiklama, eski senaryo 11, 12 (günlük çıktılı).
  - Koşulanlar (ofis; Masaüstü\PDF DENEME yok, test/pdf ve test/cikti/ui/pdf'te yer tutucular): senaryo26 55/55, senaryo13 64/65 + 3. bölüm
    135 sayfalık yer tutucuyla 16/16 (30 sayfalıkta otomatik kaydırma denetimi 20'den az kart seçebiliyor), incelemeden sonra 6-7. bölüm
    17/17; senaryo17 40/42 (2 hata yer tutucudan: çok basamaklı sayfa kutusu, tek tık vurgu), ortu_tiklama 154/155 (aşağıda),
    kisayol_araclar 92/92 (incelemeden sonra yeniden), senaryo19 112/112, senaryo25 28/28, tanima_testi 19/19, araclar_testi'nin ayır ve
    birleştir/üzerine bölümleri yer tutucularla 19/19. Paketli sürüm bu bilgisayarda sınanmadı (PyInstaller yok); kurulumdan sonra
    gercek_fare.ps1 -Paketli.
- [x] **Bağımsız inceleme** (salt okunur ajan) gerçek hatalar buldu, düzeltildi ve senaryo26'nın 6. bölümüyle sınandı:
  - Birleştir: açık PDF listede okunamadıysa (ör. parolalı: PDF.js açar, çekirdek açamaz) "Üzerine yaz" açık kalıyordu; "Atla ve devam
    et" ile PDF yedeksiz olarak yalnızca öteki dosyalarla yer değiştirirdi. Artık okunamayınca seçilemez (her öğe okununca da bakılır),
    birleştirmede ayrıca denetlenir.
  - Ad kutusuna açık belgenin adı yazılınca `uzerineMi` bunu üzerine yazma sayıyor (0.1.24'te de "Değiştir'de özgün dosya seçilirse
    üzerine yazma" kuralıydı), `denetle` ise "zaten var"ı sormuyordu; Birleştir'de açık PDF listeden çıkarılmışken (seçenek devre dışıyken)
    bile sessizce yerine yazılabiliyordu. Artık üzerine yazma seçilebiliyorsa önce "zaten var" sorulur (PDF ayır'da da: sayfalar geri
    alınamaz biçimde silinirdi); seçilemiyorsa aynı ad olağan yeni belge hedefidir; Birleştir'de listedeki bir dosyanın (okunamayan dahil)
    yerine hiç yazılmaz ve bu sorudan önce söylenir.
  - PDF ayır: birden çok dosyaya geçince önerilen ad ("Ayrılmış (2)" → "Ayrılmış") eşzamanlı değişip iç içe çizilen önizlemenin üstüne
    eski adlı önizleme çiziliyordu; ad ayarlandıktan sonra parçalar yeniden hesaplanır.
  - Birleştirmede çekirdeğin yazdıktan sonra iptale bakmaması (bu sürümde) geç iptalde onaylanmış var olan hedefi çöp kutusuna
    gönderirdi; artık yalnızca yeni oluşan dosya silinir, var olanın yerine yazılmışsa sonuç kalır ve sekmesi yenilenir. Ayırmada da
    çekirdek son dosyadan sonra iptale bakmaz (ilerleme her dosyadan önce); tek dosyada açık sekme yenilenir, başka PDEfe penceresindeki
    sekme de (`pencere:baskaPenceredeAc` yazildi).
  - Küçükler: okunamadı sorusu çekirdeğin bildirdiği dosyayı adıyla söyler (Birleştir'de listedeki herhangi bir dosya olabilir); parolalı
    belgede ayırmanın üzerine yazması "parolayla korunuyor" der; çekirdekte boş ad yedeği "Belge"; eski yorum.
  - Bulunup değişmeyen: sekmeyi kapatırken kaydetme (ortu_tiklama'nın bir denetimi) yer tutucu belgeyle düşüyor, araçlarla ilgisiz.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 32.

### Revizyon 0.1.26 (2026-10-02, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı 0.1.25'i kurduktan sonra: "birleştir aracı biraz daha yukarıdan biraz daha aşağıda olsun ki arkasındaki
sekmeler şeridini görebilelim. oradan doğrulama yapmak isteyebiliriz. doğru dosyada mıyız diye"; Birleştir'in varsayılan adı
"Birleştirilmiş" olsun; ardından "PDF Sıkıştır olsun aracın ismi" ve "Hatta PDF kelimesini de kaldıralım. Sıkıştır, Ayır olsun araçların
ismi".
- [x] **Araç adları** "Sıkıştır" ve "Ayır" (menu.js, aracPenceresi.js `ARACLAR`: Araçlar penceresi, açılış ekranı ve "<ad>: PDF seçin"
  diyaloğu; kucult.js ve ayir.js pencere başlıkları; Ayarlar'daki çıktı klasörü açıklaması; README; yorumlar). Sıkıştır'ın düğmesi de
  "Sıkıştır" (başlık ile düğme aynı; kullanıcının istediği ad). "Sıkıştırma seçenekleri" başlığı ve "Sıkıştırma sürüyor." gibi iletiler
  kaldı. Komut kimlikleri (`arac.kucult`, `arac.ayir`), sınıf ve dosya adları değişmedi. "Görüntü / PDF birleştir" ve "PDF'i kopyala"ya
  dokunulmadı (istek iki araç içindi).
- [x] **Birleştir penceresinin yeri** (ortak.js `pencereAc({ seritAlti })`, `Pencere._seritAltinaYerlestir`; araclar.css
  `.arac-ortusu.serit-alti`). Pencere ortada değil, sekme şeridinin 8 px altında başlar; yüksekliği eskisi gibi 88vh, sığmazsa altta
  12 px kalacak kadar kısalır. Örtü şeridi de karartır (pencere kipli kalır; şeride tıklamak pencerenin dışına tıklamaktır, sekme
  değiştirmez): sekmeler okunur ama araç açıkken etkin belge değişmez. Şerit gizliyse (okuma kipi) ya da altında 480 px'ten az yer
  kalıyorsa pencere ortalanır. Konum şeridin ve araç çubuğunun boyutu değişince (ResizeObserver: okuma kipi, menü çubuğu) ve pencere
  boyutlanınca yeniden hesaplanır. Yalnızca Birleştir'de (kullanıcı onu istedi); Sayfaları düzenle de 88vh ve şeridi kapatıyor, istenirse
  aynı seçenekle açılır.
- [x] **Birleştir'in önerdiği ad "Birleştirilmiş"** (0.1.25'te "Birleşik"); klasörde varsa "Birleştirilmiş (2)".
- [x] **Testler**: senaryo26 1. bölüm (Sıkıştır ve Ayır adları Araçlar penceresinde, menüde, açılış ekranında ve pencere başlıklarında;
  "PDF" ile başlayan araç adı yok) ve 4. bölüm (pencere şeridin altında, etkin sekmenin üstünde yalnızca örtü var, yükseklik; okuma
  kipinde ve şerit uzatılıp yer kalmayınca ortada, geri dönünce yine şeridin altında; "Birleştirilmiş (2)"). Güncellenen: senaryo19,
  kisayol_araclar, senaryo13, 17, ortu_tiklama (adlar ve "Birleştirilmiş").
  - Koşulanlar (ofis; test/pdf'te yer tutucular): senaryo26 60/60, kisayol_araclar 92/92, ortu_tiklama 155/155, senaryo19 112/112,
    senaryo17 41/42 (tek tık vurgu, 0.1.25'teki gibi yer tutucudan). ortu_tiklama'nın "büyük" belgesi 40 sayfalık metin yer tutucusuyla
    sıkıştırma "işlem sürerken" denetimlerinden önce bitiyordu; 300 sayfa ve 60 büyük görselli yer tutucuyla (27 MB) hepsi geçti,
    0.1.25'te düşen "kaydedip kapatır" denetimi de.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 33.

### Revizyon 0.1.27 (2026-10-02, kullanıcı isteği)
Ayrıntı: CHANGELOG.md. Kullanıcı 0.1.26 kurulduktan sonra: "döndür ve kaydet yazmasın, yalnızca Döndür yazsın. açıklamasında da sayfaları
döndürür. yazsın. sayfaları düzenle'nin açıklaması da: Sıralar, siler, döndürür, sayfa ekler yazalım. sayfa düzenle aracı da yine
birleştirme aracında olduğu gibi sekme şeridinin altında açılsın arkadan görebilelim. döndürme tuşunda seçenek sormayı bırakalım.
varsayılan olarak sadece geçerli sayfayı döndürsün. ayarlardaki seçeneği de kaldıralım. döndürme aracını kullanabilir insanlar."
- [x] **"Döndür"** (menu.js, aracPenceresi.js `ARACLAR`, dondur.js başlık ve birincil düğme; Ayarlar'daki çıktı klasörü açıklaması, README,
  yorumlar). Düğme de "Döndür": öteki araçlarda düğme aracın adıyla aynı (Sıkıştır, Ayır, Birleştir) ve kaydetmenin nereye yapılacağı
  Kaydet bölümünde yazıyor. Açıklama "Sayfaları döndürür"; Sayfaları düzenle'nin açıklaması "Sıralar, siler, döndürür, sayfa ekler" (ikisi
  de öteki karolar gibi sonda noktasız). Karonun ipucu (fareyle üzerinde durunca) aynı kaldı. Komut kimliği `arac.dondurKaydet` değişmedi.
- [x] **Sayfaları düzenle sekme şeridinin altında**: `pencereAc({ seritAlti: true })` (0.1.26'daki Birleştir seçeneği; 88vh, sığmazsa
  kısalır, okuma kipinde ortada).
- [x] **Döndür düğmesi sormaz** (uygulama.js `dondur`). Soru ve "Seçeneğimi hatırla" kalktı; düğme ve Ctrl+R / Ctrl+Shift+R yalnızca
  geçerli sayfayı döndürür. `dondurmeKapsami` varsayılanlardan çıktı ve `KALDIRILAN_ANAHTARLAR`'a eklendi (eski yapılandırma dosyasından
  açılışta silinir; renderer da okumaz, kalmış bir "Tüm PDF" tercihi uygulanmaz). Ayarlar › Açılış ve düzen'deki "Döndür düğmesi" kartı
  kalktı. Etiketler davranışı söylesin diye: düğmenin ipucu "Sayfayı döndür (Ctrl+R)", Görünüm menüsünde "Sayfayı saat yönünde döndür" /
  "Sayfayı saat yönünün tersine döndür", F1'de "Geçerli sayfayı saat yönünde / tersine döndür" (kullanıcı ayrıca istemedi; araç "Döndür"
  adını alınca düğmeyle karışmasın diye).
  - Yazı kutusu düzenlenirken Ctrl+R: soru eskiden önce açılıyordu, şimdi döndürme hemen olur. Denendi: düzenleme uygulanır (yazı not
    olarak kalır), sayfa döner, Ctrl+Z önce döndürmeyi sonra yazıyı geri alır; ayrı bir önlem gerekmedi.
  - Onay kutulu soru (mesajKutusu `onayKutusu`) artık yalnızca dış bağlantı sorusunda ("Bu belgede yeniden sorma"); ortu_tiklama onu
    döndürme sorusu yerine `window.__pdefe.mesajKutusu` ile sınıyor.
- [x] **Testler**: senaryo27 (yeni, 20). Güncellenen: kisayol_gorunum, ortu_tiklama, senaryo14, senaryo13, 19, kisayol_araclar, eski
  senaryo1, 5, 11.
  - Koşulanlar (ofis; test/pdf ve test/cikti/ui/pdf'te yer tutucular): senaryo27 20/20 (eski ayarlı veri klasörüyle), kisayol_gorunum
    115/115 (görünmeyen masaüstü, gerçek Ctrl+R), senaryo19 112/112, ortu_tiklama 156/156, kisayol_araclar 92/92, senaryo14 56/56, senaryo13
    65/65, senaryo26 60/60.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 34.

### Revizyon 0.2.0 (2026-10-02, kullanıcı isteği: macOS)
Ayrıntı: CHANGELOG.md. Kullanıcı: "pdefe uygulamamı macos'e uygun hale getirmek istiyorum. yine linki en başta olsun oradan indirebilsinler."
Plan onaylandı; Apple geliştirici hesabı (yıllık 99 $) şimdilik yok (kullanıcı kararı). Bu bilgisayarda Mac yok: Mac'te derleme ve sınama
GitHub Actions'ın Mac makinelerinde (macos-15 Apple işlemcili, macos-15-intel, macos-26), kullanıcı onayıyla `macos` dalından elle
çalıştırmayla yapıldı.
- [x] **Tek indirme bağlantısı, evrensel DMG** (`PDEfe-Mac.dmg`; README'nin ve sürüm gövdesinin en üstünde Windows bağlantısının altında).
  Apple işlemcili ve Intel Mac'te aynı dosya: kullanıcının işlemcisini bilmesi gerekmesin. Bedeli boyut: DMG ~289 MB, kurulu uygulama
  ~660 MB (Electron iki mimari + iki çekirdek). Seçilmeyen: iki ayrı DMG (~150 MB; iki bağlantı, "hangisi benim" sorusu).
  - Python çekirdeği tek dosyada birleştirilemez (PyMuPDF / Pillow tekerlekleri mimariye özgü, universal2 yok): iki mimarinin PyInstaller
    çıktısı ayrı Mac'lerde derlenip `pdefe-core-arm64` / `pdefe-core-x64` olarak ikisi de pakete girer; `cekirdek.js` `process.arch`'a
    göre seçer (Rosetta'yla çalışan uygulama x64 çekirdeği). İki ara pakette aynı dosyalar olduğundan @electron/universal onları lipo'lamaz:
    `x64ArchFiles` kuralı (`{**,**/.*/**}`: minimatch'te `**` Pillow'un `.dylibs` klasörüne girmiyordu, ilk derleme bu yüzden düştü).
  - macOS en düşük 13 Ventura (Electron 44; 0.2.0'da yanlışlıkla 12 yazıyordu, 0.2.1'de düzeltildi: electron-builder.yml minimumSystemVersion "13.0").
- [x] **İmza**: yerinde (ad-hoc, `identity: "-"`), `hardenedRuntime: false` (yerinde imzada kitaplık doğrulaması çekirdeğin kitaplıklarını
  reddeder), noter onayı yok. Apple işlemcili Mac imzasız kodu hiç çalıştırmaz; yerinde imzalı uygulama ilk açılışta (ve her yeni sürümde yeniden) Sistem
  Ayarları › Gizlilik ve Güvenlik › "Yine de Aç" ister (macOS 15'ten beri sağ tık › Aç yolu yok). CI'da `codesign --verify --deep --strict`
  geçiyor, `spctl` "rejected" (beklenen).
- [x] **Güncelleme**: Squirrel.Mac yeni paketin imzasını eskisininkiyle karşılaştırdığından imzasız uygulama kendini güncelleyemez.
  `macGuncelleme.js` electron-updater'ın yerine geçer (aynı olay arayüzü): GitHub'ın `releases.atom` akışından en son sürüm; şeritte
  "İndir" `releases/download/vX/PDEfe-Mac.dmg`'yi tarayıcıda açar, şerit "Uygulamalar'a sürükleyin" der (`guncelleme.js` `tarayiciIndir`).
  electron-updater macOS'ta hiç yüklenmez (`autoUpdater` erişimi MacUpdater'ı kurar). Apple hesabı alınırsa: kimlik + noter onayı + zip
  hedefi + electron-updater'a dönüş.
- [x] **Mac menüsü** (`menu.js` `macSablonu`; Windows şablonu birebir aynı kaldı, karşılaştırmayla doğrulandı): uygulama menüsü (Hakkında,
  Güncellemeleri denetle, Ayarlar ⌘,, Hizmetler, Gizle, Çık ⌘Q), Pencere ve Yardım rolleri. Chromium Mac'te ⌘C/⌘V/⌘X/⌘Z/⌘A'yı sayfaya değil
  menüye bırakır (editing_behavior'da Mac için yok): Kes / Kopyala / Yapıştır rol, Geri al / Yinele / Tümünü seç kaydedilmiş kısayollu komut;
  sayfa tuşu işlerse (preventDefault) menü çalışmaz, işlemezse (girdi kutusu) menü komutu gelir ve renderer kutunun kendi işini yapar
  (`uygulama.js macGirdiKomutu`: execCommand undo / redo / selectAll; yazı notu düzenleyicisi kendi geçmişini tutar).
- [x] **Kısayollar** (`renderer/platform.js`): `birincil(e)` (Windows Ctrl, Mac ⌘ ve Ctrl'siz: Mac'te Ctrl+tık sağ tıktır), `tus()` Windows
  yazımını Mac'e çevirir (ipuçları bir MutationObserver'la, Kısayollar penceresi, bildirimler). Mac'te başka tuşa oturanlar: ⇧⌘Z yinele, ⇧⌘[ /
  ⇧⌘] (fiziksel tuş, `e.code`: Türkçe klavyede [ ] başka yerde) ve ⌥⌘← / → sekme, ⌘↑ / ⌘↓ belge başı / sonu, ⌥⌘G sayfaya git, ⌘G / ⇧⌘G
  eşleşme, ⌃⌘S sol panel, ⇧⌘H okuma modu (⌘H uygulamayı gizler), ⌃⌘F tam ekran, ⌥⌘I geliştirici araçları. ⌃Tab seçici aynı (Ctrl).
  Dokunmatik yüzeyde kıstırma Ctrl'li küçük tekerlek adımı gelir: adım 0,01 katsayıyla, olay başına en çok e^±0,5.
- [x] **Finder**: `open-file` (uygulama kapalıyken de; hazır olmadan gelenler ilk pencereye), `activate`, Dock'tan / oturum kapanışında
  çıkış `before-quit` → Çıkış gibi pencereler sırayla (Electron'un kendi çıkışı ilk kapatma sorusunda durur). Son pencere kapanınca
  uygulama Mac'te de kapanır (belge uygulaması; Dock'ta boş kalmasın, çekirdeğin yaşam döngüsü değişmesin). PDF ilişkisi uzantıyla
  (`fileAssociations` ext pdf, Editor, Alternate): PDF'in sistem tür kimliğinde marka adı geçtiği için LSItemContentTypes kullanılmadı.
  Varsayılan uygulamayı uygulama okuyup değiştiremez (Electron API'si yok): Ayarlar yalnızca Bilgi Al yolunu anlatır.
- [x] **Yazı tipleri**: standart 14 font yerine `/System/Library/Fonts/Supplemental`'daki Times New Roman / Arial / Courier New (ana süreç
  `standartYaziTipleri` yolu verir, `guvenlik.js` okumaya izin verdiği klasörler). Yazı notu: Mac'te Arial ve Times New Roman; Segoe UI ve
  Calibri yok, çekirdek o ailelerde Arial gömer, arayüz de Arial'le gösterir (`yaziTipiCss`). Arial ve Times'ın Mac kopyalarında hhea ile
  usWin ölçüleri aynı: satır yerleşimi Windows'takiyle uyuşur. ClearType yerine Mac'in çizimi ("macOS çizimi" seçeneği; "Dengeli"nin kalın
  yazı ölçümü gri yumuşatmada da çalışır).
- [x] **Kaydetme** (`notlar._ozellikleri_aktar`): Windows'taki ReplaceFileW'nin Mac karşılığı: hedefin izinleri (copymode) ve genişletilmiş
  öznitelikleri / erişim listesi (libSystem `copyfile` COPYFILE_XATTR | COPYFILE_ACL; değişme zamanı aktarılmaz) yeni dosyaya, sonra
  os.replace. Araçların ve yapısal kaydın yerine koyması da aynı yoldan.
- [x] **PDF'i kopyala**: NSPasteboard `writeObjects:@[NSURL]` (JavaScript for Automation; izin istemez). İlk deneme AppleScript'in "set the
  clipboard to POSIX file"ıydı: panoya Finder'ın yapıştıramadığı veri koyuyordu (CI'da panodaki tür okunarak bulundu).
- [x] **Yazı tanıma** (`yazi_tanima._AppleTaniyici`): Vision `VNRecognizeTextRequest` (doğru kip), sözcük kutuları `boundingBoxForRange`,
  eğim satırın üst kenarından; Windows tanıyıcısının sonuç biçimine çevrilir. Ölçüm (taranmış örnek, 200 dpi; Windows'ta 35/35):
  macOS 15'te tanıyıcının dilleri arasında Türkçe yok; sözcüklerin %57–60'ı, Türkçe harflilerin %21–26'sı doğru (ş ğ ı İ → s g i I; ç ö ü
  çoğunlukla doğru). Türkçe yokken dil düzeltmesi kapalı (İngilizce sözlük sözcükleri bozmasın). macOS 26'da Türkçe var: paketli
  uygulamada Türkçe harfli 8 sözcüğün 8'i doğru ("İCRA" → "iCRA" dışında). Türkçesiz macOS için Türkçe harf düzeltme (sözlükle ş ğ ı
  İ'yi geri koyma) düşünüldü, kullanıcıya soruldu.
- [x] **Sistem adları**: Ayarlar (tema, yazı çizimi, varsayılan uygulama), yazdırma ("macOS yazdırma penceresi"), Birleştir'in boş liste metni
  ("Finder'dan"), yazıcı yok hatası. Menü çubuğu düğmesi Mac'te gizli.
- [x] **CI** (`yayim.yml`): taslak (ubuntu) → Windows ve iki mimarinin çekirdeği paralel → evrensel DMG + Apple işlemcili Mac'te kurulum
  sınaması → yayım (ubuntu; iki paket de hazırsa; biri düşerse sürüm taslak kalır, README bağlantıları önceki tam sürümü verir). Elle
  çalıştırmada `platform` (hepsi / windows / mac), `cekirdek_calismasi` (önceki çalışmanın çekirdekleri; `actions: read` izni) ve Intel +
  macOS 26 sınaması. Ölçülen süre: Mac çekirdekleri ~1,5'er dk, DMG + sınama ~2,5 dk. Gizli depoda Mac dakikası 10 kat sayılır ve iş başına yukarı yuvarlanır: bir sürüm ~70 Mac + ~10 Windows faturalı dakika (ücretsiz hesapta aylık 2.000).
- [x] **Testler**: `test/mac_cekirdek_testi.py` (kaynaktan; Windows'ta da koşar: 9/9, Mac'te 12/12), `test/mac_duman.mjs` (paket: imza,
  evrensel, iki çekirdek, PDF türü, open -a ile açılış, Finder'dan PDF, tek örnek, çizim, sistem yazı tipleri, çekirdek, tanıma, pano,
  System Events'le gerçek klavye ⌘F / ⌘A / ⌘Z / Esc / ⌘T / ⌘W / ⌘A / ⌘0, quit olayıyla çıkış). Windows regresyonu (bu bilgisayar):
  kisayol_dosya 164/164, kisayol_gorunum 115/115, kisayol_araclar 92/92, senaryo25 28/28, senaryo27 hepsi, senaryo23 53/53, ortu_tiklama 156/156, senaryo19 111/111; paketli
  Windows sürümü `gercek_fare.ps1 -Paketli` 9/9 (çekirdek `win.extraResources`'tan pakette).
- [ ] Gerçek bir Mac'te elle deneme: docs/DOGRULAMA.md 35.

### Revizyon 0.2.1 (2026-10-03 – 10-05, kullanıcı istekleri: sağ tık Kaydet; genel kod taraması, README, ekran görüntüleri)
Ayrıntı: CHANGELOG.md. Kullanıcı: "pdfefe'de sağ tık'a "kaydet" butonu ekleyelim."
- [x] **Hangi menü**: istek menüyü adlandırmıyor; PDEfe'nin belgeyle ilgili iki sağ tık menüsü var (belge sayfası, sekme), ikisine de kondu
  (raporda söylendi). Araç pencerelerindeki listelerin, açılış ekranındaki son dosyaların ve vurgu düğmesinin menüleri belge kaydetmeyle
  ilgisiz; dokunulmadı.
- [x] **Yer**: belge menüsünde en altta, Tümünü seç'ten ayraçla ayrı: ilk sıradaki Kopyala alışkanlıkla seçilirken yanlışlıkla kaydedilmesin.
  Sekme menüsünde Kapat grubundan sonra, ayraçlar arasında (Pencereye ayır'dan önce). Kısayol yazılmadı: menüdeki öteki öğelerde de yok
  (`menu:popup` hızlandırıcı göstermiyor).
- [x] **Devre dışı koşulu** (`kaydedilecekVar`): araç çubuğundaki Kaydet düğmesi gibi kaydedilmemiş değişiklik yoksa. Ek olarak değişiklik
  taşıyan açık yazı düzenlemesi sayılır (`notlar.duzenleyiciDegisti`: duzenleyiciBitir'in karşılaştırması; yeni kutuda boş olmayan metin,
  kayıtlı yazıda metin, biçim ya da kutu farkı): yeni yazı kutusu düzenleme bitince not olur, o ana dek `degisti` false (senaryo28'de
  ölçüldü); kayitYaz önce düzenlemeyi bitirir. Boş yeni kutu ya da değiştirilmeden açılmış yazı sayılmaz (ilk sürümde sayılıyordu: Kaydet
  etkin görünüp "Kaydedilecek değişiklik yok" diyordu; bağımsız inceleme buldu). Kaydı süren ya da başka pencereye taşınan sekmede devre
  dışı (belgeKaydet o zaman sessizce bir şey yapmaz). Araç çubuğundaki Kaydet düğmesi yazı yazılırken eskisi gibi soluk kalır (önceden de
  öyleydi; düğmeyi düzenleyiciye bağlamak sekme işaretini ve durum çubuğunu da gerektirirdi, istenmedi).
- [x] **Etkin olmayan sekme**: `belgeKaydet(b, …, { oneAl: true })` sorusuz kayıtta sekmeye geçmeden kaydeder (birden çok sekme
  kapatılırken kaydetme de böyle çalışıyordu). Soru açılacaksa (temizKayitKarari'nın e-imza sorusu, belgeKaydet'in "Belge kaydedilemedi"
  sorusu) soru açılmadan hemen önce belgenin sekmesine geçilir (`soruIcinOneAl`, PDF'i kopyala gibi): iki soru da belgenin adını vermiyor,
  öndeki başka belgenin üstünde açılınca kullanıcı onu o belge için sanabilirdi ("Tamamen sil" e-imzayı geçersiz kılar; bağımsız inceleme
  buldu). Kapatma akışlarında `oneAl` yok: ilk soru (kaydetmedenCikisSorusu) belgenin adını verir, davranış değişmedi. Menü açıkken sekme
  kapatılmış ya da başka pencereye taşınmışsa (`belgeler.has`) bir şey yapılmaz.
- [x] **Bağımsız inceleme** (iki salt okunur ajan: doğruluk / tutarlılık; 7 bulgu, her biri karşıt doğrulamayla): ikisi gerçek, yukarıda
  düzeltildi. Elenen beş: biri yazı kutusu bulgusunun eşi (yine de düzeltildi); ötekiler bu değişiklikten önce de vardı ya da kusur
  değildi: arka plandaki sekme kilitli dosya sonrası Farklı kaydet'le kaydedilince pencere başlığının o belgenin adı olması (iki bulgu;
  kayitYaz koşulsuz `pencere:baslik`, kapatma akışında da oluyordu; sekme menüsünden kayıtta artık önce sekmeye geçildiği için bu yolda
  doğru), okuma kipinde kayıttan sonra görünür bildirim olmaması (Ctrl+S'te de böyle), arka plandaki sekme kaydedilince durum çubuğunda
  "Kaydedildi" yazması (kayıt doğru, sekmenin işareti de kalkar).
- [x] **Testler**: senaryo28 (yeni: menüdeki yer, devre dışı koşulları, sayfadan / yazı düzenlenirken / kayıtlı yazı değişince / etkin
  olmayan sekmeden kayıt, e-imza ve salt okunur dosyada sorunun belgenin sekmesinde açılması, dosyadaki notlar). Güncellenen: senaryo19 ve
  senaryo22 (sekme menüsünün öğe listesi). Koşulanlar (ev, ekran dışı / görünmeyen masaüstü): senaryo28 38/38, senaryo22 101/101, senaryo23
  53/53, senaryo17 42/42, senaryo19 112/112, senaryo24 38/38, ortu_tiklama 156/156, kisayol_dosya 164/164.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 36.

#### 0.2.1: genel kod taraması (2026-10-03 – 10-05, kullanıcı isteği)
Kullanıcı: "şimdi kodları genel olarak tara, bir yanlışlık görürsen düzelt. mac'te de kullanılacağını unutma. daha sonra kodlarla readme'yi
karşılaştır ve denetle. readmedeki eksik kısımları düzelt eklenmesi gereken kısımları ekle. uygulamadan güncel fotoğraflar koy bol bol."
- [x] **Tarama**: kod 8 bölümde (ana süreç, çekirdek, uygulama/sekmeler, notlar/panel, görüntüleme/metin, araçlar/pencereler, paketleme/CI,
  bütün kodda macOS merceği) salt okunur ajanlarla tarandı; her bölümün bulgularını ayrı bir ajan çürütmeye çalıştı. 43 onaylı bulgu,
  yinelenenler birleşince 33 düzeltme. Düzeltmeler 7 grupta sırayla yapıldı, her biri ayrı commit ve değişiklik öncesi kodda düşen bir
  sınamayla. Önemlileri ve kararları:
  - **Yapısal kayıtta not eşlemesi** (`yapisal.py`): hedef not her işlemde kaynak sıradaki indeksle o anki listede aranıyordu; aynı sayfada
    bir not silinince sonraki işlem komşu nota uygulanıyordu (veri kaybı). Kaynak xref → yeni xref eşlemesi işlemlerden önce kurulur, yanıt
    (IRT) notları kaynak listesinden çıkarılır; uzunluk tutmazsa o sayfadaki işlemler atlanır (yanlış nota dokunmaktansa). Yanıtların
    yapısal kayıtta kaybolması (Açık) değişmedi.
  - **Windows oturum sonu** (`pencereler.js`): Electron oturum sonunda `close` ve `before-quit` vermiyor; `query-session-end`'de pencere
    kirliyse kapanış engellenir ve olağan Çıkış akışı (`cik()`, bir kez) başlar. Ana süreç kirliliği önceden bilmeli (preventDefault
    eşzamanlı): renderer `pencere:kirli` ile bildirir (değişmiş belge ya da açık yazı kutusu; araç pencerelerinin kaydedilmemiş işi sayılmaz).
  - **Temiz kopya panoya** (`main.js` `pano:metin`, `pano.js panoyaMetinYaz`): Electron 44'te `clipboard.readText()` Promise döndürüyor;
    0.1.23'teki Electron yükseltmesinden beri "pano hâlâ bu metni mi taşıyor" karşılaştırması hep yanlıştı, temiz metin hiç yazılmıyordu.
  - **Farklı kaydet hedefi açıksa** (`uygulama.js hedefAcikMi`, salt okunur IPC `pencere:baskaPenceredeAcikMi`): çekirdeğe yazılmadan
    "Başka ad seç / Vazgeç" sorusu. Yazıp açık sekmeyi yenilemek seçilmedi (sekmenin kaydedilmemiş durumu kaybolurdu).
  - **Geç iptal** (`kucult.js`, `sayfalar.js`): kayıttan sonra gelen iptal, onaylanmış var olan hedefi çöpe atıyordu; artık yalnızca yeni
    oluşan dosya silinir, yazılmış sonuç kalır ("İptal edilemeden tamamlandı", Birleştir'deki desen).
  - **Yazı notu dağarcığı** (`notlar.py DAGARCIK`): Latin Genişletilmiş-A, genel noktalama, oklar ve matematik işaretleri eklendi; dışında
    kalan karakter "?" çizilir ve ölçülür. Alt küme değişince var olan belgelerde font bir kez yeniden gömülür (~23 KB, /PDEfeFonts
    düzeniyle; eski notlar kendi font nesneleriyle çizilir).
  - **Köşe noktalı notlar** (Ink / Line / Polygon / PolyLine): taşıma kayıtta köşe noktaları kaydırılarak yazılır (`not_guncelle`); MuPDF
    yazamazsa sessiz başarı yerine hata. Var olan nitelikleri yeniden yazan çağrıların başka programın görünümünü MuPDF'inkiyle değiştirmesi
    (0.2.1 öncesinden) değişmedi; takip.
  - **Temiz kopya**: çekirdeğin `metin_sec`'i `ilk_dolu` da döndürür, `temizMetin(ham, { ilkDolu })` ortadan başlayan seçimin dolu ilk
    satırını kısa saymaz; kesme işaretli kısaltma başlık sayılmaz; tire kuralı âîû'yu ve rakam-tire-rakam aralığını kapsar (41.199 seçimlik
    karşılaştırmada değişenlerin hepsi doğru yönde).
  - **macOS**: yazma izni olmayan / Kilitli dosya (`notlar.yazma_izni_yok`, `SaltOkunurHatasi`) yazılmaz; iletiler Finder'a göre; en düşük
    sürüm 13; güncelleme metinleri; ⌫, Ctrl+tık, ⇧⌘[ ], ölü tuş, `/` yolları; `kabuk:klasorAc` paketleri açmaz; `will-quit`.
  - Ötekiler: ekran dışı pencere konumu (`sigdir` en yakın ekrana), yüklenirken kapatılan sekme (`AbortController`, görev `destroy`),
    9+ kaynaklı Sayfaları düzenle (kaynaklar taze açılır), çekirdek stdin `error`, çekirdeğin hedefsiz yazan yöntemlerde de yalnızca
    PDF'e yazması (`guvenlik.js YOLA_YAZANLAR`), İçindekiler'in kaynak sayfa eşlemesi, küçük resimlerin kayıttan sonra yenilenmesi,
    Ctrl+Tab seçicisi, dokunmatik yüzey tekerleği (Windows fare çentiği eski davranışta), pencere başlığı.
- [x] **README denetimi** (salt okunur ajan, kodla satır satır): 14 yanlış (macOS 12 → 13, Yazdır'da olmayan "kâğıt boyutu", Mac
  güncelleme adımları, "görünen metinde" düzeltme, Mac'te menü çubuğu / Çıkış / Ayarlar farkları, standart yazı tipi adları, Birleştir'in
  belge gerektirmediği, geçici klasörler, yazar adının varsayılanı) ve 23 eksik (sayfa ve sekme sağ tık menüleri, seçim ayrıntıları,
  yazı kutusu biçim çubuğu, vurgu renkleri, Bul seçenekleri, yakınlaştırma aralığı, okuma modu, durum çubuğu, formlar, Hakkında, PDF'i
  kopyala sorusu, araç ayrıntıları, koyu mod düğmesi, anlık kopya ve dosya öznitelikleri, e-imza, eksik kısayollar, Mac kullanım farkları,
  Windows'ta Türkçe tanıyıcı yoksa, Geliştirme'deki sürümler ve yayım kuralları). README yeniden düzenlendi: "Ne yapar" alt başlıklara
  bölündü, görüntüler anlattıkları özelliğin altında. Denetimin bulduğu kod kusuru: Birleştir HEIC'i desteklenir gösteriyordu ama
  pillow_heif pakette yok; HEIC listeden çıktı (pakete eklemek seçilmedi: üç platformda yeni ikili bağımlılık).
  - Bilerek değiştirilmeyen: `pdf-lib` package.json'da ve THIRD_PARTY'de duruyor ama kodda kullanılmıyor; pakete girdiği için README'deki
    satırı kaldı. Bağımlılığı kaldırmak ayrı iş.
- [x] **Ekran görüntüleri**: 17 görüntü (`docs/ekran-*.png`, 1280×800, açık tema, Windows, toplam ~2,4 MB) `test/readme_goruntuleri.mjs`
  ile, `test/readme_ornek_uret.py`'nin ürettiği örneklerle (kamuya açık kanun metinleri yer imi eklenmiş kopyalar, kurgusal dilekçe ve
  taranmış hâli, kurgusal makbuz; `C:\Users\Public\Documents\PDEfe Örnek`: açılış ekranındaki yol kullanıcı adı içermesin) ve kurgusal yazar
  adıyla ("Av. Örnek Yazar"). Kanun metinleri yerelde `test/pdf`'te (git dışı); yoksa o görüntüler eksik kalır. Görüntüleri yenilemek için
  betiğin başındaki kullanım satırları.
- [x] **Son regresyon** (ev, bütün düzeltmelerden sonra HEAD; ekran dışı / görünmeyen masaüstü; 31 takım, 1.437 denetim, 0 hata): senaryo28 38, senaryo22 101, senaryo23 53, senaryo17 42, senaryo24 38, senaryo26 60, senaryo15 9, senaryo16 6, senaryo25 28, senaryo19 112, ortu_tiklama 156, kisayol_dosya 164, kisayol_gorunum 115, kisayol_araclar 92, sekme_genislik 35, kayit_sekme_panel 61, gec_iptal 20, mac_renderer 19, yazi_ime 8, oturum_sonu 25, pencere_konumu 5; pano_birim 6, guvenlik_birim 16, cekirdek_kopma 7, guncelleme birim 62; guvenlik_testi 43, mac_cekirdek_testi 14, kopyalama_testi 26, yapisal_esleme_testi 8, kose_notu_testi 49, tanima_testi 19. Paketli sürüm (npm run cekirdek:derle + electron-builder --dir): çekirdek ping, gercek_fare -Paketli 9/9. Koşulmayanlar: araclar_testi (bu bilgisayarda Masaüstü örnekleri yok; gruplar yer tutucuyla 116/122, kalan 6 hata yer tutucudan ve değişiklik öncesi kodda da aynı), senaryo13/14/27 (gruplar koştu: 65, 56, 20).
- Açık / takip: macOS değişiklikleri Mac'te koşulmadı (`test/mac_renderer.mjs` Mac renderer yollarını Windows'ta `darwin` çerçevesinde
  sınar; çekirdeğin Mac dalları `os.name` benzetimiyle); yayımdan önce `gh workflow run yayim.yml -f platform=mac` önerilir (mac_duman'a
  LSMinimumSystemVersion denetimi eklendi). CI macOS 13 / 14'te sınamıyor (en düşük sürüm artık 13). v0.2.0 sürüm sayfasının gövdesi hâlâ
  "macOS 12" ve "(bir kez)" diyor (`gh release edit` yayım adımıdır, onay ister). Yazı kutusu tutamaçları sağ tıkla da sürükleniyor;
  Mac'te yazı düzenleyicisi ⌃PageUp/PageDown'u yutuyor; yapısal kayıttan sonra küçük resimler anlık kopyadan çizilir; parola sorusu
  açıkken sekme kapatılırsa soru açık kalır; yeni testler: yapisal_esleme_testi, kose_notu_testi, kayit_sekme_panel, gec_iptal, oturum_sonu,
  pencere_konumu, cekirdek_kopma, pano_birim, guvenlik_birim, mac_renderer (+ mac_cerceve.js), yazi_ime.

### Revizyon 0.2.2 (2026-10-05 – 10-06, kullanıcı istekleri: kaydedilmemiş değişiklikler, büyük önizleme, kapatma sorusu, boyutlar)
Ayrıntı: CHANGELOG.md. Kullanıcının istekleri (kendi sözleriyle):
1. "kaydedilmemiş öğeleri göstersin işlemlerin ne olduğunu listelesin"
2. "araçlardaki dosyaların, görüntülerin boyutu büyük olsun ki görebilelim içeriğini, sayfa boyutları daha büyük, iyi gözüksün araçlarda"
3. "iki sekme açıkken pencere kapatınca geçerli sekme mi tüm sekmeler mi diye sorsun. kaydet sorusuyla çakışmasın. önce geçerli sekme mi tüm
   sekmeler mi sorusu sorulsun. iki pencere açıkken de sorun çıkmasın. tekrar sorma butonu ekleyelim. ayarlardan değiştirilebilelim"
4. "sağdaki kaydırma şeridini biraz daha büyültelim"
5. "açılış ekranında sağ alttaki simge ve yazıyı büyütelim. büyütmeden önce ne kadar büyüyeceğine ilişkin bana görsellerle soru sor"
6. "sekme şeridini birazcık daha genişletelim, çok ince şu an. bununla eşit olacak şekilde araçlar şeridini de genişletelim, simgeler de buna
   uygun olarak büyüsün"
7. Ekran görüntüsüyle: "pdefe sağ penceresi sıkıştırıldığında sayfalar da sıkışsın (tam görüntüleme bozulmadan küçülsün) ve mavi işaret düzgün
   olsun. genişletildiğinde sayfalar da büyüsün". Görüntüdeki panel soldaki Sayfalar paneliydi; "sağ pencere" böyle yorumlandı (raporda söylendi).

Sorular ve yanıtlar: imza için uygulamadan alınmış dört boyutlu görsel (A şimdiki, B 1,3×, C 1,6×, D 2×) → "C olsun ama simge ile yazılar birbirine
daha yakın olsun", aralık 5 px görselle gösterildi; şerit için dört görsel (şimdiki 34, 40, 44, 48 px) → B, 40 px; kaydedilmemiş işlemlerin listesi
nerede (kaydet sorusunda / sekme ipucunda / Kaydet düğmesi ipucunda önerildi) → kullanıcı: "alttaki kaydedilmemiş değişiklikler yazısının yanına yeni
bir simge ekleyelim, yazıyla aynı renk olsun. bir de geri al simgesinin yanına bir ok işareti çıkartalım, geri alınma adımlarını oradan görelim,
Word'deki gibi olsun mekaniği ve görüntüsü; aşağıdakinin mekaniği de benzer olabilir". Plan onaylandı ("onaylıyorum"). İş beş grupta sırayla yapıldı
(aynı çalışma ağacı, madde başına commit: bb523e9…d8e3841), ardından bağımsız inceleme ve düzeltmeleri (d3cd25d…9b76052), README ve görüntüler.
- [x] **Kaydedilmemiş değişiklikler ve geri al listesi** (`src/renderer/gecmisListesi.js`, `Komut.ayrinti`). Yerel menü (`menu:popup`; yakınlaştırma ve
  düzen ▾'leri) satır boyayamıyor, alt yazı gösteremiyor, birden çok adım seçtiremiyor: sayfanın kendi bileşeni yazıldı (GecmisListesi; Araçlar
  penceresinin deseni: dışarı basış, belge düzeyinde yakalama evresinde tuş, blur / resize'da kapanma). İki liste aynı bileşenden, aynı anda biri açık.
  - Geri al'ın ▾'si (`#dugme-geri-al-liste`, 21 px, −2 px kenarla Geri al'a bitişik bölünmüş düğme, geri alınacak yokken soluk) düğmenin altında, sol
    kenarı Geri al'la hizalı. Durum çubuğundaki `#durum-degisiklik` (yazı + aynı renkte liste simgesi) listesi yukarı açılır, sağ kenarı yazıyla
    hizalı, başlıklı, altta Kaydet (Ctrl+S'in `dosya.kaydet`'i; liste kayıttan önce kapanır). En çok pencere yüksekliğinin %60'ı, uzun liste kendi
    içinde kayar; satır sayısı sınırsız (50 satır sınandı).
  - Mekanik (Word): satırlar en yenisi üstte "ad · ayrıntı"; fare satıra gelince en üstten o satıra kadar boyanır, alt yazı "N işlemi geri al" (her
    sayıda aynı biçim; durum listesinde "N değişikliği geri al"); boyama yokken geri al listesinde "Vazgeç" (tıklanınca kapatır, Word'deki Cancel
    gibi), durum listesinde "N değişiklik". Tıklama `topluGeriAl`: KomutYigini.geriAl n kez, durum çubuğuna tek ileti ("Geri alındı: 3 işlem");
    açık pencere (mesaj kutusu, araç, Ayarlar) ya da pencere kilidi varken yapılmaz; kayıt sürerken listeden geri alınmaz ("Kaydediliyor, lütfen
    bekleyin."; tek adımlık Ctrl+Z eskisi gibi). Liste açılırken açık yazı düzenlemesi uygulanır (yazı listede en üstte bir adım olur).
  - Klavye: ▾ ve durum yazısında Enter, Boşluk (▾'de ↓ da) keydown'da işlenir (Boşluk belgeyi kaydırdığı için tıklamaya ulaşmıyordu; Araçlar
    düğmesindeki gibi), klavyeyle açılan listede ilk satır boyalı; ↑ ↓, Home / End, Page Up / Down (10 satır) boyamayı değiştirir, Enter uygular, Esc
    kapatır, Tab Kaydet'e geçer. Açıkken belge kısayolları belgeye ulaşmaz; Ctrl / Alt / ⌘'li tuşlar ve F tuşları listeyi kapatıp olağan işine
    bırakılır (Ctrl+Z açık listede de geri alır). Kapanma: dışarı tıklama, sekme değişimi, menü komutu, pencere odağının kaybı, boyut değişimi;
    belge değişince (kirliGuncelle) açık liste yeniden çizilir, satır kalmazsa kapanır. Okuma kipinde geri al listesi açıkken araç çubuğu gizlenmez.
  - Satır ayrıntısı: Komut'un isteğe bağlı beşinci alanı (testler ve ipucu adı karşılaştırdığı için ad değişmedi), komut kurulurken bir kez yazılır,
    işlemin yapıldığı andaki sayfayı söyler. Not komutlarında notun sayfası ("s. 3"; başka sayfaya götüren düzenlemede "s. 2 → 3",
    `notlar.js notKomutuAyrintisi`). Sayfa komutlarında eski ve yeni sayfa listelerinin farkı (`komutlar.js sayfaFarki`, sayfalar girdi kimliğiyle
    eşlenir): yalnızca döndürmeyse döndürülen sayfalar ("s. 3–4"; dörtten çok parça "s. 1, 3, 5 … (9 sayfa)"), yapısal değişiklikte ve "Sayfa
    düzenini uygula"da özet ("2 sayfa silindi, 1 sayfa eklendi, sıra değişti, 1 sayfa döndürüldü"; silme ve ekleme tek başına "sıra değişti"
    sayılmaz). Sekme başka pencereye taşınırken ayrıntı da taşınır (komutDisari / komutIceri). Seçilmeyen: notun bugünkü sayfasını canlı göstermek
    (geri alınmış / silinmiş notlarda ve taşınan sekmede tutarsızlaşıyordu).
  - Durum listesinin üç durumu (KomutYigini konum / kayitKonumu): kayıttan sonra yapılanlar (`yigin.slice(kayitKonumu, konum)`, tıklanabilir: geri al
    yığınının tepesi); kaydedip geri alınanlar (konum < kayitKonumu: "(geri alındı)", soluk, tıklanamaz, alt yazı "Kaydedince dosyadan da kalkar");
    kayıt konumu yok (−1) ya da yığında fark yok ama belge değişmiş (geçmişi taşınamamış sekme): net farktan (kayitliTarif ↔ tarifJson,
    `notlar.fark()`), tıklanamaz; anlık (yapısal) kayıt kipinde yalnızca sayfa farkı (fark() kaydedilmiş notları da değişmiş gösterir); hiçbir şey
    çıkmazsa tek açıklama satırı.
  - Bağımsız incelemede düzeltilenler: listeyi açan Enter / Boşluk basılı tutulunca tuş yinelemesi bir adımı sessizce geri alıyordu (yinelenen
    basış yok sayılır, mesajKutusu.js'teki gibi); etkin sekme pencere kapatma yoluyla kapanınca liste açık kalıp kapanan belgenin adımlarını
    gösteriyor, tuşları yutuyordu (veri değişmiyordu; belgeyiKaldir aktifId'yi önce boşaltıyor, sekmeSec listeyi yalnızca aktifId doluyken
    kapatıyordu): liste sekmeSec'te aktifId boşken de, belgeyiKaldir'de, pencere:kapatIstegi'nin ve kapatmayaIzinAl'ın başında kapanır; ekran
    okuyucu boyanan satırı duymuyordu: odak role=listbox olan ul'de, satırlar kimlikli, aria-activedescendant son boyalı satır,
    aria-multiselectable, alt yazı aria-live=polite (görünüm değişmedi; NVDA ile denenmedi).
  - Araç çubuğu: ▾ +19 px; 1280 px'te sıkışma yok (269 px boş, önce 290), 1000 px'te 1. kademe (önce yok), 760 px'te 4. (önce 3.), 720 px'te 5.
    (PDF'i kopyala gizlenir, Araçlar menüsünde var; önce 4.), 704 px'te 6. (36 px boş); 4 basamaklı sayfa sayısında 720 px'te ve Mac'te 0 px boş.
  - Seçilmeyenler: Yinele'ye ok (istenmedi), Word gibi 100 satır sınırı, kapatma sorusuna değişiklik listesi (harita önerisiydi, istenmedi), satırın
    üstüne gelince ilgili sayfaya gitmek (Word'de yok).
- [x] **Araçlarda büyük önizleme.** Kök neden: boyutlar koda gömülüydü (Sayfaları düzenle'de kutu 150 px, ızgara minmax(170px), boş sayfa ve hata
  yer tutucusu JS'te 150 / 110 px; Birleştir'de satır sütunu ve kutu 64 px, yer tutucu 46 × 60), çözünürlük ekran ölçeğinden bağımsızdı (kucuk_resim
  hep 160 px, gorsel_bilgi 144 px): dikey A4 160 × 226 çizilip 106 × 150'ye küçültülüyor, yatay sayfa %125'te 188 cihaz pikseline gerilip
  bulanıklaşıyordu.
  - Kutu tek CSS değişkeninde: `.sayfalar-pencere --kart-resim: 220px`, `.birlestir-pencere --birlestir-resim: 120px`; ızgara sütunu
    calc(var + 20px), resim sınırları, boş sayfa ve yer tutucular (Birleştir: kutunun %72 × %94'ü, 86 × 113) bundan türer; JS değeri getComputedStyle
    ile okur (sayfalar.js `_kutuOlcusu`, gorselBirlestir.js `_kucukResimGenisligi`).
  - Sayfaları düzenle penceresi 980 px yerine `min(1320px, 94vw)`; 88vh, şeridin altında açılma ve 1000 px altındaki 94vw korundu. 1280 px pencerede
    4 sütun, kart 278 × 268 (önce 5 sütun, 178 × 198), 1536 ve 1920 px'te 5; 1280 × 800'de görünen satır 1,8 → 1,4.
  - Çözünürlük (`_resimGenisligi`): kutu × min(2, dpr) × (yatayda 1, dikeyde en / boy), en çok 600 px (`KART_RESIM_EN_FAZLA`); diske artımlı
    işlenmiş çeyrek tur (`_diskDondurme`) oranı çevirir. Ekrandaki boyut çekirdeğin döndürdüğü resmin oranından (uzun kenar = kutu): tahmin yalnızca
    keskinliği etkiler. Önbellek anahtarı "yol|sayfa|genişlik". Birleştir: max(144, ceil(120 × min(2, dpr))) (%100 144, %125 150, %150 180, %200 240;
    çekirdek 1024'te keser); küçük görsel büyütülmez.
  - Büyük kartlarla ortaya çıkan eski kusur: `_sutunSayisi` sütun sayısını kart genişliğinden bölmeyle buluyordu; 1fr kartlar kesirli (277,53 px),
    1280 px'te 3,9996 → 4 sütunda 3 sayılıyor, ↑ ↓ 3 kart atlıyordu. Artık gridTemplateColumns'tan.
  - Ekran ölçeği değişince (bağımsız inceleme): yeni ölçek için düşük kalan kartlar yeniden istenir, eski resim yenisi çözülene dek kalır, geç gelen
    eski istek yenisini ezmez. Birleştir'in önizlemesi dosya bilgisiyle bir kez alınır, yeniden istenmez (en az 144 px).
  - Ölçümler: çekirdek (756 sayfalık belgeden 84 sayfa), küçük resim başına 160 px 3,6 ms / 13,4 KB; %100 dikey A4 156 px 3,5 ms / 12,8 KB; %125
    194 px 4,2 ms / 18,5 KB; %150 233 px 5,1 ms / 24,1 KB; %200 311 px 6,3 ms / 34,9 KB (en kötü 1,75 kat). gorsel_bilgi 144 → 240 px: PDF'in 1.
    sayfası 8,8 → 5,8 ms (gürültü), PNG 21,5 → 19,3 ms, JPEG 25,9 → 34,6 ms. Arayüz (%125, 1280 × 900): açılışta görünen kartlar 127–309 → 100–274
    ms, ortaya atlama aynı, hızlı kaydırmadan sonra görünenler ortanca ~300 → ~100 ms (büyük kartta kaydırılan piksel başına daha az resim). Bellek:
    base64 önbellek sayfa başına ~13 KB → %125'te ~18, %200'de ~35 KB (756 sayfa %200'de ~26 MB), pencere kapanınca bırakılır. Çekirdek değişmedi.
  - Seçilmeyenler: çekirdeğe JPEG ya da görünen alanı öne alan kuyruk (ölçümde gerek çıkmadı), Küçük / Orta / Büyük seçimi ya da Ctrl+tekerlek
    (istenmedi), kartı pencere yüksekliğine göre küçültmek ("büyük olsun"la çelişir), Birleştir penceresini büyütmek (satırlar 81 → 134 px; 1280 ×
    800'de liste ~2 satır, önce 3,5; en az yükseklik 160 px bir satırı tam gösterir), panelin kucukResimIstegi yardımcısı (kutu sabit; araçlar
    panele bağlı olmasın). Sıkıştır, Ayır, Döndür değişmedi.
- [x] **Pencere kapatma sorusu** (`uygulama.js kapatmaKapsami`, `gecerliSekmeyiKapat`). Soru 'pencere:kapatIstegi' işleyicisinde, `_kapanis`
  kurulduktan sonra, kapatmayaIzinAl'dan önce sorulur: güncelleme kurulumunun izni (kurulumIzniAl, pencere:izinIste) de kapatmayaIzinAl'ı kullanır,
  orada sorulmamalı. Kapsam ve kaydetme soruları aynı akışta sırayla açılır (testte aynı anda açık kutu en çok 1, MutationObserver).
  - Ön koşul, ana süreç Çıkış'ı bildirir: pencereler.js close olayı isteği `{ cikis: !!k.kapatBekleyen }` ile gönderir (kapatBekleyen yalnızca
    kapatmayiIste'de: Dosya › Çıkış, ⌘Q, Dock › Çık, Windows query-session-end, test:cik). Olmasaydı Çıkış'ta ve oturum sonunda da sorulur, "yalnızca
    geçerli sekme" hatırlanmışsa Çıkış her pencerede bir sekme kapatıp dururdu. Güncelleme kurulumu (kapatOnayli) bu isteği üretmez. Preload kanal
    listesi değişmedi.
  - Koşullar: 2+ sekme (açılış sekmeleri dahil) ve en az bir belge; tek sekmede (kapatılamaz) ve yalnızca açılış sekmeleri varken sorulmaz. Soru:
    "Bu pencerede N sekme açık." / "Yalnızca geçerli sekme ("ad") mi kapatılsın, yoksa bu pencere bütün sekmeleriyle mi?" (+ kaydedilmemiş varsa
    "Kaydedilmemiş değişiklikler ardından sorulur."); Geçerli sekme / Tüm sekmeler (varsayılan, Enter) / Vazgeç (Esc); "Bir daha sorma".
  - Geçerli sekme: kapanan, soru açılırken etkin olan sekmedir (`_kapsamHedefi`; soru açıkken Gezgin'den açılan dosya etkin sekmeyi değiştirebilir,
    kullanıcının görmediği sekme kapanmasın). Önce aracPencereleriniKapat (biri açık kalırsa durulur); yazdırma, parola ya da Kısayollar penceresi
    açıksa sekme kapatılmaz, "Önce açık pencereyi kapatın." (Ctrl+W kuralı; Ayarlar açık kalabilir); sonra sekmeKapat(id): kaydetme sorusu burada,
    Vazgeç sekmeyi açık bırakır. Her durumda pencere:kapatVazgec.
  - Yarış: soru açıkken cikis gelirse mesajKutusu'na eklenen `denetim.yanitla` soruyu "Tüm sekmeler" olarak kapatır (Çıkış takılmaz, oturum sonu
    engelli kalmaz; "Bir daha sorma" yazılmaz); Geçerli sekmenin araç / kaydetme sorusu açıkken Çıkış gelirse sekme kapanınca pencerenin geri kalanı
    da kapatılır, orada Vazgeç Çıkış'ı durdurur (Çıkış'taki kaydetme sorusunda Vazgeç gibi); ikinci olağan × yalnızca kutuyu belirginleştirir; soru
    açıkken sekme alınmaz, verilmez (kapanisSuruyor).
  - Güncelleme izni (bağımsız inceleme): izin süren kaydı ya da kaydetme sorusunu beklerken × basılınca kapsam sorusu araya giriyor, sorular üst
    üste açılıyor, aynı belge iki kez soruluyordu. Düzeltme: pencere:kapatIstegi `_kapatmaIzni` sürerken kapsam sormadan aynı izni bekler (0.2.1'deki
    gibi); kurulumIzniAl kapatmanın kapsam sorusu ya da "Geçerli sekme" evresindeyse kurulumu erteler (şeritte "Kur ve yeniden başlat" kalır);
    gecerliSekmeyiKapat kurulum kilidindeyken çalışmaz.
  - Ayar `pencereKapatma`: 'sor' (varsayılan) | 'sekme' | 'pencere' (main/ayarlar.js; bilinmeyen değer 'sor'; DURUM_ANAHTARLARI'nda değil,
    Varsayılanlara dön 'sor'a döndürür). "Bir daha sorma" yalnızca Geçerli sekme / Tüm sekmeler seçilince yazılır (Vazgeç'te ve soruyu Çıkış
    kapattığında değil), ayarKoy beklenir, öteki pencerelere 'ayar:degisti' ile geçer; açık Ayarlar kartı `ayarlarPenceresiniGuncelle` ile güncellenir
    (data-ayar işaretli seçim kutuları). Kart Ayarlar › Açılış ve düzen'de yeni "Pencere" alt başlığında (yeni bölüm açılmadı, bölüm listesi aynı);
    açıklama platforma göre (Windows: ×, Alt+F4, Ctrl+W; Mac: kırmızı düğme, ⌘W, ⌘Q). Mac: kırmızı düğme close olayıdır (sorulur), ⌘W sekmeyi kapatır,
    ⌘Q Çıkış'tır (sorulmaz).
  - Bilerek kabul edilen: Windows görev çubuğundaki "Tüm pencereleri kapat" her pencereye ayrı WM_CLOSE gönderir, cikis taşımaz: her pencere kendi
    sorusunu aynı anda sorar (kaydetme soruları da böyle); ayırmak zamanlamaya dayalı tahmin gerektirirdi.
  - Seçilmeyenler: soruyu kapatmayaIzinAl'a koymak (güncelleme izninde de sorardı), global `cikisSuruyor` bayrağı (pencereye özgü değil, Çıkış
    sürerken başka pencerede basılan ×'i de Çıkış sayardı), soru açıkken gelen Çıkış'ı yok saymak ("Geçerli sekme"de kapatVazgec Çıkış'ı durdurur,
    oturum sonu engelli kalırdı).
- [x] **Kaydırma çubuğu 16 → 20 px** (stil.css `.kaydirici`, `.kaydirma-olcer`; saydam kenar 3 px → görünen tutamak 14 px, köşe yarıçapı 10 px;
  panellerin çubukları 12 px kaldı). 20 px %125 / %150 / %175'te tam cihaz pikseline düşer (25, 30, 35; 18 px %125'te 22,5). Sığdırma
  (goruntuleyici.js `cubukKalinligi`) kalınlığı ölçüm kutusundan okur, JS değişmedi; sığdırma testleri üç ölçekte "çubuk 20 px" ölçtü. Chromium uzun
  belgede tutamağı en kısa 17 px'e (görünen 11) indiriyor, 20 px'lik çubukta 14 × 11'lik yatık bir hap oluyordu: `::-webkit-scrollbar-thumb:vertical`
  min-height, `:horizontal` min-width 28 px (görünen 22; planda yoktu). Yatay ve dikey çubuk birlikteyken sağ alt köşedeki beyaz kare (0.2.1'de de
  vardı; geri al grubunun bildirdiği): genel `::-webkit-scrollbar-corner` saydam; açık ve koyu temada ekran görüntüsünden piksel denetimi.
- [x] **Açılış ekranı imzası** (C + "daha yakın"): simge 30 → 50 px, ad 14 → 22, alt yazı 11 → 16 px, simge ile yazı arası 9 → 5 px. İmza ~32 → 50
  px uzayıp sekme şeridi 6 px yükselince 1280 × 700'de 10 son belgeyle 8 px taşıyordu: seçilen ölçüler küçültülmedi (seçilmeyen yol: alçak pencerede
  imzayı küçültmek), alçak pencerede boşluklar daraltıldı (bölümler arası 14 → 12, alt boşluk en az 16 → 12, imzanın üst dolgusu 4 → 0; 14 px).
  Bağımsız incelemede iki kusur: dar içerik alanında (720 px pencere, 432 px panel) imza sola taşıp 122 px kırpılıyordu → `.karsilama-imza`
  justify-self: safe end, max-width: 100%, min-width: 0, alt yazı dar alanda satır kırar (geniş alanda tek satır, görünüm aynı); 780 px eşiğinin hemen
  üstünde sıkı boşluklar birden kalkınca 10 son belgeyle ~54 px'e dek kayma → eşik 860 px (kullanıcının pencereleri 1536 × 770 ve tam ekran 1920 ×
  ~1000 etkilenmiyor; akışkan boşluk clamp / vh seçilmedi: aynı sonuç, daha karmaşık kod).
- [x] **Sekme şeridi ve araç çubuğu 40 px** (B). `--sekme-yukseklik` 34 → 40 (= `--arac-yukseklik`); sekme calc(var − 4px) = 36, bırakma çizgisi
  − 6px = 34; sekme yazısı 12 → 13 px, × 18 → 20 (simgesi 13 → 15), değişiklik noktası 16 → 18; şeridin ◀ ▶ + ve açık belgeler düğmeleri 28 → 30 px,
  simgeler 22 px (+ simgesi bilerek 22 px: öngörüntüde öyle görünüyordu ve kullanıcı o görseli seçti; büyük bulunursa tek satırla 18). Araç
  çubuğunda button.ikon 34 px, simgeler 22, `.acilir` 21, Araçlar oku 15, sayfa ve yakınlaştırma kutuları 24 → 28 px; kurallar `#arac-cubugu` /
  `#sekme-cubugu` ile sınırlı (Bul, notlar, araç pencereleri ve Ayarlar değişmedi; testle).
  - Sekmenin en dar genişliği 118 → 128 px (planda yoktu): 13 px yazıyla "ustyazi (85).pdf" 118 px'te kısalıyordu (ad alanı 83, ad 86,8 px); 128'de
    "ustyazi (100).pdf" de sığar. Dar pencerede şerit kaymadan önce sığan sekme ~%8 az.
  - Yükseklik sabitleri: ONIZLEME_BASLIK 30 → 36, hayalet.html #baslik 35 px; pencereler.js YEDEK_TUTMA {40, 17}, HAYALET_BASLIK 36,
    HAYALET_IMLEC_EN_ALT 28, önizleme penceresinin en az yüksekliği 36; sekmeYeri.y (+4, #sekme-liste'nin dolgusu) ve okuma kipindeki clientY < 48
    (araç çubuğu 40 kaldı) değişmedi.
  - Dar pencere: 6. sıkışma kademesi (düğmeler 26 px, simgeler 20, ok 16; yakınlaştırma kutusu %6400 sığsın diye daralmaz; ~40 px açar). Ölçüm (410
    sayfa, ▾'den önce): pencere içi 704 px 1–5. kademe (15 px boş), 720 px 1–4 (2), 760 px 1–3 (13), 900 px 1–2 (28), 1000 px ve üstü yok; 4 basamaklı
    sayfa sayısında 704 px'te 0.2.1'de de yalnızca 1 px pay kalıyordu. Windows'ta en dar pencerenin içi 704 px, Mac'te 720. Seçilmeyenler: 3.
    kademede düğmeleri 30 px tutmak (720 px'te taşardı), okuma kipi eşiğini ölçüye bağlamak.
- [x] **Sayfalar panelinin küçük resimleri panel genişliğine uyar** (`panel.js`, `stil.css`). Kök neden: sayfalariDoldur küçük resim genişliğini
  alan kurulurken bir kez (alan.clientWidth − 28) hesaplayıp satır içi px yazıyordu; tutamaç yalnızca panelin genişliğini değiştiriyor,
  ResizeObserver yoktu, `_sayfalarHazir` erken dönüşü alanı yeniden kurmuyordu. Daralınca resim (align-items: center) hücrenin iki yanına taşıyor:
  sol kırpılıyor, sağ yatay çubuk çıkarıyordu; mavi çerçeve hücreye outline olduğundan resmin içinden geçiyordu (140 px'te hücre içi 100 px, resim
  211 px). Sekme değiştirip dönünce düzeliyor, F4 ile kapatıp açınca düzelmiyordu.
  - Boyut CSS'ten: resim, yer tutucu ve döndürülen resmin kutusu hücre içinin tam genişliğinde (width: 100%), yükseklik doğal orandan ya da satır içi
    aspect-ratio'dan; döndürülen resim kutunun ortasında translate(−50%, −50%) rotate(d), 90 / 270°'de en ve boy yüzdeyle. Satır içinde px yok,
    sürüklerken JS çalışmadan her karede uyar. `#panel-sayfalar` scrollbar-gutter: stable ve overflow-x: hidden (dikey çubuk genişliği değiştirip
    döngü kuramaz). ResizeObserver hiçbir boyut yazmaz ("loop" hatası çıkamaz), yalnızca kaydırma yerini düzeltir ve çözünürlük denetimini planlar.
  - Çözünürlük `kucukResimIstegi(css, dpr, oran)`: hücre × min(2, dpr) × oran (ekranda 90 / 270° döndürülmüşse en / boy; diske işlenmiş döndürme
    hesaba katılır), 64 cihaz pikseline yukarı, en çok 1200. 0.2.1'deki bir kusuru da giderir: ekranda 90° döndürülen yatay sayfa az çözünürlükle
    isteniyordu. Genişlik 250 ms değişmeyince düşük kalanlar IntersectionObserver'a yeniden verilir (görünenler hemen; eski resim yenisi gelene dek
    kalır; daralınca yeniden istenmez; istek sıra numarası geç gelen eski yanıtın yenisini ezmesini önler). Ölçek 1'de 140 / 240 / 480 px → 128 / 256 /
    448; 1264 px'lik pencerede 60vw için 768.
  - Önbellek: anahtar eskisi gibi yol#sayfa#disk, değer { src, istenen } (kademe anahtarda değil: aynı sayfanın birkaç çözünürlüğü birikmesin,
    daraltınca büyüğü kullanılsın). Kaydırma yeri: tarayıcının kaydırma çapası geçerli sayfayı alanın dışına itebiliyordu; panel kendi çapasını tutar
    (geçerli sayfa görünüyorsa ortası aynı oranda, görünmüyorsa üstteki sayfanın aynı noktası).
  - Sekme başlıkları: 140 px'te üç başlık sığmıyordu (166 px; "Yorumlar" belge alanının altına taşıyordu) → `#sol-panel` container-type: inline-size;
    190 px'ten darda yazı 11 px, iç boşluk 1 px, genişlik içeriğe göre, sığmazsa üç nokta (12 px yazıyla 167 px yeter; fark macOS yazı tipi payı).
  - Bağımsız incelemede: ekran ölçeği değişince (pencere %150 ekrana) küçük resimler yeniden istenmiyordu (0.2.1'de de) → ölçeğe bağlı ortam sorgusu
    dinlenir (goruntuleyici.js dprDinle gibi), sayfalarBoyutlandi genişlikle birlikte ölçeği de karşılaştırır (panel kapalıyken değişen ölçek, panel
    açılınca işlenir). Panel en genişken uzun belge kaydırılınca önbellek büyüyüp belge kapanana dek kalıyordu (410 sayfada ~86 MB data URL, süreç
    ağacı +151 MB) → toplam 48 MB sınır (data URL karakteri); aşılınca en uzun süredir kullanılmayanlar sınırın %90'ına inene dek bırakılır: önce
    panelde gösterilmeyen belgelerinkiler, sonra hiçbir hücrede olmayanlar, en son görünen alandan iki alan yüksekliğinden uzak hücrelerinkiler
    (hücre yer tutucuya döner, göründükçe yeniden istenir); görünen ve yakın hücrelere dokunulmaz. Varsayılan 240 px'te yüzlerce sayfa sınırın
    altında. Ölçüm (410 sayfa, 758 px panel, ölçek 1, baştan sona): önbellek 46 MB / 218 sayfa (önce 86 MB / 410), JS yığını 98 → 62 MB, süreç ağacı
    376 MB (inceleyicinin ölçümünde önce 518; 240 px panelde 367). Seçilmeyen: blob URL (ikili veri zaten ayrıca tutuluyor, kazanç küçük), 1200 px
    sınırını düşürmek (en geniş panelde keskinlik görünür biçimde azalırdı).
  - Seçilmeyenler: ResizeObserver ile tek CSS değişkeni (--kucuk-g) yazmak (yüzde ve aspect-ratio aynısını JS'siz verir), döndürülmüş resmi tuvalde
    bir kez döndürmek (ek tuval / blob ve bellek yönetimi), cqw / cqh (contain: size gerekir), mavi çerçeveyi resme almak (görünüm değişmesin),
    başlıkları her genişlikte içeriğe göre boyutlamak (240 px'te eşit genişlik bozulur). Ölçüm: 756 sayfada panel genişliği değişince yerleşim
    ortancası 2,1 → 3,2 ms (en uzun 4,5 → 6,2).
- [x] **Bağımsız inceleme** (iki salt okunur inceleyici: arayüz / mantık; 9 bulgu, hepsi doğrulandı ve gerçekti, her biri önce düşen bir test
  denetimiyle düzeltildi; commit'ler d3cd25d…9b76052). Bulgular yukarıda maddelerinde: bayat geri al listesi (iki inceleyici ayrı ayrı), yinelenen
  Enter / Boşluk, ekran okuyucu; güncelleme izni sürerken kapsam sorusu; imzanın kırpılması, 780 px eşiği; ekran ölçeği (panel ve Sayfaları
  düzenle); küçük resim önbelleği. Bilinen işler de kapandı: senaryo17'nin sayfa kutusu beklentisi 28 px (yakınlaştırma kutusuyla eşitlik de
  denetleniyor); kaydırma çubuğu köşesi; senaryo26'nın ana depodaki EPERM çöküşü (fs.rmSync'in maxRetries'ı yalnızca recursive silmede geçerli,
  hiç yeniden denenmiyordu → `dosyaSil` yardımcısı EPERM / EBUSY'de 10 kez 300 ms; uygulama koduna dokunulmadı).
- [x] **Testler** (yeni): serit_olculeri (24; eski kodda 10 denetimi düşer), panel_kucuk_resim (93), arac_onizleme (21), senaryo29 (ekran dışı 58;
  görünmeyen masaüstünde `S29_GIZLI=1`, test/pencere_kapat.ps1 ile gerçek SC_CLOSE / WM_CLOSE 61), senaryo30 (81). Güncellenen: senaryo13, 14, 17,
  19, 20, 21, 23, 25, 26, sekme_genislik, kisayol_araclar, kayit_sekme_panel, oturum_sonu, mac_renderer.
- [x] **Son regresyon** (ev, 2026-10-06, HEAD 9b76052: 0.2.2'nin 8 commit'i ve 8 düzeltmesi; ekran dışı / görünmeyen masaüstü; 46 takım, 55 koşu,
  2.449 denetim, 0 hata): 0.2.1 listesi 31 takım, 1.445 denetim (0.2.1'de 1.437; senaryo17 43, senaryo25 30, mac_renderer 23, oturum_sonu 27
  0.2.2'nin denetimleriyle büyüdü; senaryo15 8: dosya 0.2.1'den beri aynı, en çok 8 denetim var, 0.2.1'deki 9 sayım hatasıydı): senaryo28 38,
  senaryo22 101, senaryo23 53, senaryo17 43, senaryo24 38, senaryo26 60, senaryo15 8, senaryo16 6, senaryo25 30, senaryo19 112, ortu_tiklama 156,
  kisayol_dosya 164, kisayol_gorunum 115, kisayol_araclar 92, sekme_genislik 35, kayit_sekme_panel 61, gec_iptal 20, mac_renderer 23, yazi_ime 8,
  oturum_sonu 27, pencere_konumu 5; pano_birim 6, guvenlik_birim 16, cekirdek_kopma 7, guncelleme birim 62; guvenlik_testi 43, mac_cekirdek_testi
  14, kopyalama_testi 26, yapisal_esleme_testi 8, kose_notu_testi 49, tanima_testi 19. 0.2.2'nin testleri: serit_olculeri 24, panel_kucuk_resim 93
  (%100 / %125 / %150), arac_onizleme 21 (üç ölçekte), senaryo29 58 (ekran dışı) ve 61 (görünmeyen masaüstü), senaryo30 81; sigdirma_kararli 51 ve
  sigdirma_rastgele 7 (420 örnek, 0 sorunlu) üç ölçekte; ek olarak senaryo20 50, senaryo21 40, senaryo13 65, senaryo14 56, senaryo18 10, senaryo27
  20 (eski ayarla). senaryo21'in ilk koşusu görünmeyen masaüstünde ekran görüntüsü alınırken bir kez takıldı (yanıt gelmedi, o ana dek hata yoktu);
  iki yeniden koşu 40/40, uygulama kusuru değil. Paketli sürüm (npm run cekirdek:derle + electron-builder --dir): çekirdek ping, gercek_fare
  -Paketli 9/9, test kancası olmadan kısa denetim 14/14 (araç çubuğu ve şerit 40 px, sekme 36 px, ▾ listesi, iki sekmede WM_CLOSE / SC_CLOSE'un
  sekme sorusu, Vazgeç, Geçerli sekme, tek sekmede sorusuz kapanma). Koşulmayanlar: araclar_testi (bu bilgisayarda Masaüstü örnekleri yok, 0.2.1'de
  de koşulmadı), eski senaryo1–12, guncelleme-e2e/senaryo.mjs (kurulu deneme uygulaması ister), Mac CI.
- [x] **README ve ekran görüntüleri**: README 0.2.2'nin koduyla karşılaştırıldı; kapatma sorusu ve Ayarlar kartı, geri al listesi, kaydedilmemiş
  değişiklikler listesi, sol panelin genişliğe uyması, araçlardaki büyük önizlemeler eklendi; Alt+F4'ü anlatan iki yer düzeltildi. 17 görüntü yeni
  arayüzle yenilendi (Ayarlar görüntüsü artık Açılış ve düzen'in sonunu, Pencereyi kapatırken'i gösteriyor), 3 yeni: `ekran-kapatma`,
  `ekran-geri-al` ve `ekran-kaydedilmemis` (iki liste okunaklı kalsın diye kırpılmış; `test/surucu.mjs` ekranGoruntusu isteğe bağlı kırpma
  bölgesi alır). 20 görüntü, ~2,5 MB. Açılış ekranı görüntüsü sürüm 0.2.2'yi göstersin diye package.json önce yükseltildi.
- Açık / takip:
  - Açılış ekranı: 900 × 790'da 6 px, sol panel açıkken 1280 × 700'de 13 px kaydırma kaldı (0.2.1'de 1 px; araç kartlarının açıklaması iki satıra
    kırılıyor); kullanıcının koşulu (1280 × 700, panel kapalı) ve gerçek pencereleri sığıyor. Sıkı kipte alt boşluk birkaç piksel daha daraltılabilir
    (görünür değişiklik olduğu için yapılmadı).
  - Küçük resim önbelleği sınırı olağan kullanımda devreye girmez; çok uzun belgede panel en genişken sınır aşılırsa başa dönünce uzak sayfalar kısa
    süre yer tutucu gösterip yeniden yüklenir (0.2.1'de yoktu; sürüm notunda ve kullanıcıya söylenir). Ölçüm yalnızca metin PDF'iyle; taranmış UYAP
    sayfalarında PNG büyük olduğundan sınıra daha erken varılır. 1200 cihaz pikseli üst sınırı 2560 px ekranda panel en genişken (~1500 px) hafif
    yumuşak gösterebilir (test penceresi ekrandan büyük olamadığı için ölçülemedi).
  - Birleştir'in 120 px önizlemesi ekran ölçeği değişince yeniden istenmez (%150'de 180 px gerekirdi, hafif yumuşak kalabilir; pencere yeniden
    açılınca düzelir). Birleştir'de satırlar 134 px: %125 ekranda (~780 px yüksek pencere) listede ~2 dosya görünür; kullanıcı sıkışık bulursa Kalite /
    Kaydet bölümleri sıkılaştırılabilir ya da kutu 100 px'e indirilebilir.
  - Gerçek ekranlar arası taşıma (ofisteki %150 ikinci ekran), gerçek klavyede Enter / Boşluk ve gerçek fareyle liste, NVDA gibi bir ekran okuyucu
    denenmedi (ölçek değişimi CDP Emulation'la, girdi CDP olaylarıyla). Güncelleme kurulumu uçtan uca koşulmadı (guncelleme-e2e/senaryo.mjs kurulu
    deneme uygulaması ister; izin isteği test:olayGonder ile, süren kayıt taklit edildi).
  - Mac: değişikliklerin hepsi renderer'da; mac_renderer 23/23, Mac CI (platform=mac) koşulmadı. Gerçek Mac'te SF yazı tipiyle imza ve sekme
    yazısının ölçüsü, Sayfalar paneli başlıklarının 140 px'te üç noktaya düşüp düşmediği görülmedi; yayımdan önce `platform=mac` sınaması önerilir.
  - Planda olmayan, raporda söylenen küçük kararlar: + simgesi 22 px, sekmenin en dar genişliği 128 px, kaydırma tutamağının en kısa boyu 28 px; 720
    px pencerede PDF'i kopyala düğmesi artık gizleniyor (Araçlar menüsünde).
  - senaryo21'in ekran görüntüsü çağrısı görünmeyen masaüstünde yeniden takılırsa teste zaman aşımı konabilir. 0.2.1 son regresyonundaki senaryo15 9
    yerine 8 olmalıydı (0.2.1 toplamı 1.437 bir fazla).
  - Gözlem (doğrulanmadı, panelle ilgisiz): döndürülmüş yatay sayfası olan belgede genişliğe sığdır kipinde belge alanında yatay kaydırma çubuğu
    görüldü; muhtemelen sığdırmanın geçerli dikey sayfaya göre yapılmasından, eski davranış olabilir.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 37.

### Revizyon 0.2.3 (2026-10-07, kullanıcı istekleri: şeritlerin yeri, geri al, Sayfalar paneli, kaydırma hızı, Birleştir, kurucu, simge, açılış ekranı)
Ayrıntı: CHANGELOG.md. Kullanıcının istekleri (kendi sözleriyle):
1. "geri alınacak adım butonu geri al butonunun bir parçası gibi durmalı, biraz daha küçük olmalı. wordde öyle."
2. "araç şeridi ile sekme şeridinin yerini değiştirelim."
3. "seçili sekmenin seçili olduğunu gösteren renk ile araç çubuğunun rengi eşit olsun. seçili sekme ile araç çubuğu arasında herhangi bir çizgi
   olmasın. sekmenin parçasıymış gibi olsun."
4. "ilk yükleme başlangıcında sayfalar kısmı açık olmasın. ilk yüklemede varsayılan olarak gizli açılsın. daha sonra nasıl bırakıldıysa ayarı
   korunsun."
5. "sayfaları kaydırırken daha hızlı yüklensin. hafif geç yükleniyor gibi oluyor orada performans iyileştirmeleri yapabilisek yapalım."
6. "birleştirme aracında yüklenenlerin ön izlemesini biraz daha büyük görelim."
7. "uygulama yüklerken uygulamanın yüklü olup olmadığını yeni sürüm olup olmaıdğını fark etsin ve ona göre seçekenler sunup yükleme yapsın."
8. "uygulama logusunu değiştirsin." (kullanıcının verdiği simge paketiyle: "Tek Su Dalgası")
9. "ana ekrandaki PDF aç butonu biraz daha küçük olsun ve bitim sınırı sayfaları düzenle aracının bitim sınırıyla eşitlensin."

Plan onaylandı. Kullanıcıya söylenen yorumlar: 3. maddede araç çubuğu seçili sekmenin rengini aldı (açık temada beyaz; önceki gri değil); 6. maddede
önizleme 120 → 150 px; simge paketinin talimatı "sürüm yükseltme" diyordu, simge revizyonun parçası olduğu için sürüm 0.2.3'e yükseltildi. README
görüntülerinin ara sürümünü görünce kullanıcı "koyu mod fotoğraflar da koyabilirsin" dedi. İş gruplar hâlinde yapıldı (aynı çalışma ağacı, madde
başına commit; kurucu grubu arayüz gruplarıyla yan yana): simge 16f8f81; kurucu 9b1696e…76b7e92 ve ek dbca9b9, 0ca9dbf; şeritler ve geri al bfe14af,
add7806; açılış ekranı, Birleştir, panel dbad771…5c8583d; ana görünümde kaydırma e53730f…dfefbc0; Sayfalar panelinde kaydırma d8e6133, 7d3d8ad. Ardından
iki bağımsız inceleme (görüntüleyici / kurucu, salt okunur) ve düzeltmeleri (a4d931d…2382f98), README ve görüntüler (5aae1e7).
- [x] **Yeni simge** (8. madde; `build/icon.ico`, `icon.png`, `icon.svg`). Paket olduğu gibi alındı (paketin talimatı: yeniden çizme, ICO boyutlarını
  yeniden üretme): ICO paketteki (9 boyut 16–256, hepsi PNG girişli 32 bit; eskisinde 96 px de vardı), `icon.png` paketin 512 px'liği (depo düzeni
  512; Mac .icns bundan), `icon.svg` paketteki (betik, dış bağlantı, üst veri yok). Üç dosyada üst veri yok. Yapılandırma aynı adları kullandığı
  için değişmedi (electron-builder.yml, pencereler.js, baslangic.js, pdefe-core.spec, kurulum_bitis.ps1); eski simgenin başka kopyası yok (SHA-256
  ile bütün izlenen dosyalar). Ölçüm: ICO 55.348 → 47.136 bayt, PNG 86.019 → 73.627, SVG 10.170 → 14.103. Seçilmeyenler: 96 px'i üretip eklemek
  (talimat yasaklıyor; %150'de Windows 128'i küçültür), Mac için paketin 1024 px'liği (depo düzeni; Retina'da yumuşak görünürse tek satırla).
- [x] **Sekme şeridi üstte, araç çubuğu altında, seçili sekme araç çubuğuyla tek parça** (2. ve 3. madde; `index.html`, `stil.css`,
  `araclar/ortak.js`, `main/pencereler.js`). Kök neden (3. madde): 0.2.2'de araç çubuğunun zemini `--arka` (#f3f3f3) idi; sekme şeridinin 1 px'lik
  alt çizgisi seçili sekmenin altından da geçiyordu: onu örtmesi gereken `.sekme.aktif::after`'ı #sekme-liste'nin overflow-y: hidden'ı kırpıyordu
  (%125'te sekmenin altında 0,8 CSS px'lik #d9d9d9 satır ölçüldü).
  - #sekme-cubugu #arac-cubugu'nun önüne alındı; #guncelleme-seridi araç çubuğunun ardında kaldı (artık onun altında). Araç çubuğunun zemini
    `--sekme-aktif` (açık #ffffff, koyu #2b2b2b); şeridin alt çizgisi ve `.sekme.aktif::after` kalktı, seçili sekmenin üst ve yan ince kenarı
    duruyor, altı açık. Sekme 36 px + üst boşluk 4 px = şerit 40 px: seçili sekmenin alt kenarı araç çubuğunun üst kenarıyla aynı cihaz pikseli
    sınırında (%100 40, %125 50, %150 60).
  - #belge-listesi top: var(--sekme-yukseklik): Açık belgeler listesi düğmesinin hemen altında açılır, araç çubuğunun sağ ucunu örter (tarayıcılardaki
    gibi). `_seritAltinaYerlestir`: Birleştir ve Sayfaları düzenle'nin üstü sekme şeridi, araç çubuğu ve görünürse güncelleme şeridinin en altına
    göre (+8 px; güncelleme şeridi yokken eskisi gibi 88 px, varken 124); ResizeObserver güncelleme şeridini de izler; okuma kipinde ortada.
    YEDEK_SEKME_YERI.y 45 → 4 (yalnızca yedek; asıl değeri renderer gönderir). Sekme sürükleme, bırakma alanı, hayalet pencere, aracCubuguSigdir ve
    okuma kipinin clientY eşikleri konumları DOM'dan ölçtüğü için değişmedi.
  - Seçilmeyenler: seçili sekme dışında şeridin altına çizgi bırakmak (renk farkı yetiyor), araç çubuğundaki kutuları gri yapmak (istenmedi),
    belge listesini iki şeridin altında bırakmak (düğmesinden kopuk görünürdü).
  - Ölçüm: üç ölçekte, iki temada, seçili sekmenin üç sütununda sınırın 6 px üstünden 3 px altına dek her satır araç çubuğu renginde (0.2.2'de
    çizgi satırı vardı). Test: `test/serit_birlesim.mjs` (59; kendi PNG çözücüsüyle piksel sayar; 0.2.2'de sıra, renk ve çizgi denetimleri düşer).
- [x] **Geri al bölünmüş düğmesi** (1. madde; `index.html` `<span class="bolunmus">`, `stil.css`). Kimlikler, ipuçları ve aria değişmedi. Dış
  köşeler yuvarlak (6 px), iç köşeler düz; ▾ 21 → 13 px, oku 10 birimlik çizgi (Word 365'teki gibi çizgi ok, dolu üçgen değil); eski margin-left:
  −2px kalktı. İmleç düğmenin üstündeyken iki yarı `--hover`, üzerinde olunan yarı `--basili`; basılan yarı ve liste açıkken ▾ `--yari-basili`;
  ayırıcı ▾'nin ::before'u (1 px, üstten ve alttan 8 px içeride, %22 metin rengi) yalnızca üstündeyken ya da liste açıkken, iki yarı da devre
  dışıysa görünmez. Sıkışma kademelerinde ▾ 3. kademeden 12, 6. kademede 11 px. Yakınlaştırmanın ▾'si 21 px kaldı.
  - Seçilmeyen: kap kullanmadan :has (.grup'ta Yinele de var, kurallar karışırdı).
  - Ölçüm (serit_olculeri, 410 sayfa; araç çubuğunda boş yer önce → sonra): 1280 px 269 → 277; 1000 px 1. kademe 43 → 50; 760 px 1–4. kademe 25 →
    1–3. kademe 1; 720 px 14 → 19; 704 px 1–6. kademe 36 → 1–5. kademe 3 (Windows'un en dar penceresinde düğmeler artık 26 değil 28 px); 4
    basamaklı sayfa sayısında 720 px'te ve Mac'te 0 → 5 px. Piksel (%100, açık tema, zeminden uzaklık): imleç Geri al'deyken Geri al 78, ayırıcı 186,
    ▾ 45; ▾'deyken 45 / 210 / 78 (koyu: 78 / 171 / 51, 51 / 192 / 78). Test: `test/geri_al_bolunmus.mjs` (%100 41, %125 / %150 37; 0.2.2'de 27
    denetim düşer).
- [x] **Açılış ekranında PDF aç** (9. madde; `stil.css`, `baslangic.js`). Kök neden: 0.1.15'ten beri düğme yazısı kadar genişti (1100 px sütunda
  557,6 × 110 px), sağ kenarı hiçbir şeye bağlı değildi; araç ızgarası `repeat(auto-fill, minmax(185px, 1fr))` olduğundan Sayfaları düzenle'nin sağ
  kenarı pencereyle değişiyor. Karar: düğme kendi satırında (`.karsilama-ac-satir`), satır araç ızgarasının sütun şablonunu kullanır
  (`.karsilama`'daki `--karsilama-sutunlar` / `--karsilama-aralik`; aynı genişlikte iki ızgaranın sütunları aynıdır); düğme `grid-column: span 2`,
  `grid-auto-columns: 0` ile ızgara tek sütuna inince örtük ikinci sütun 0 px, düğme tam genişlik; JS ölçümü yok. Ölçüler: iç boşluk 22/24 → 16/20,
  simge kutusu 64 → 52 (köşe 12), simge 36 → 30, ad 20 → 18, aralık 18 → 16 px; açıklama 13 px kaldı, geniş düğmede iki satır; yükseklik 110 → 93,7 px.
  - Seçilmeyenler: JS / ResizeObserver ile ölçmek; `.karsilama`'yı subgrid yapmak (alçak penceredeki gap kuralıyla çakışırdı); 185 / 8 sabitlerine
    bağlı container query ya da CSS round() (kırılgan).
  - Ölçüm: 87 durum (704–2560 px; panel kapalı, 240 px, geniş) × üç ölçek, sağ kenar farkı en çok 0,000 px; ızgaranın 1–5 sütunlu hâlleri. Yan kazanç
    (10 son belgeyle): 0.2.2'den kalan kaymalar kalktı, sol panel açık 1280 × 700'de 13 → 0 px, 900 × 790'da 6 → 0. Test: `test/acilis_hizasi.mjs`
    (10; aralık 1 px bozulunca düşer); senaryo19'un eşikleri 1,3 → 1,2 kat (yükseklik) ve 2,5 → 2,4 kat (alan), senaryo21'in "yazısı kadar"
    denetimleri sağ kenar denetimine döndü, senaryo20'ye iki durum eklendi.
- [x] **Birleştir önizlemesi 120 → 150 px** (6. madde; `araclar.css --birlestir-resim`, `gorselBirlestir.js KUTU_VARSAYILAN`). İstenen çözünürlük
  max(144, ceil(150 × min(2, dpr))): %100 150, %125 188, %150 225, %200 300 px (144 alt sınırı artık devreye girmiyor). Satır 134 → 164 px; ad, özet,
  Kalite, Sayfa ve düğmeler önizlemeyle dikeyde ortalı; dar pencerede taşma yok. Bedel, görünen satır: 1280 × 800 2,36 → 1,94; 1280 × 1000 3,64 →
  3,00; 1536 × 770 2,14 → 1,76; 1280 × 700 1,64 → 1,35; 720 × 700 1,41 → 1,16. Seçilmeyenler: pencereyi uzatmak ya da Kalite / Kaydet'i sıkılaştırmak
  (istenmedi; açık konu), satır yüksekliğini önizlemeden ayırmak. Testler: arac_onizleme (22, üç ölçekte; satır hizası eklendi), kisayol_araclar
  (boş alan denetiminde düğme şeridi de gizleniyor: dört satır 690 px, liste 663 px'ti; gevşetilmedi).
- [x] **Sayfalar paneli ilk açılışta gizli** (4. madde; `main/ayarlar.js`). Kök neden: `solPanelAcik`'in varsayılanı zaten false; eski kurulumda
  açık bırakılan panel "açık" diye kayıtlı kaldığı için her açılışta açık geliyordu. Karar: vurguRengiTasindi / otomatikKaydetKapatildi düzeninde
  tek seferlik taşıma: `solPanelKapatildi` bayrağı yoksa solPanelAcik=false yazılır, bayrak konur. Bayrak VARSAYILANLAR'da değil (Varsayılanlara dön
  dokunmaz); DURUM_ANAHTARLARI değişmedi. Taşıma ana süreçte, ilk pencereden önce; Pencereye ayır'la açılan pencereler aynı kaydı okur.
  Seçilmeyenler: her açılışta kapatmak ("nasıl bırakıldıysa korunsun"a aykırı), sürüm numarasına bağlı taşıma (bayrak düzeni yerleşik), taşımayı
  renderer'da yapmak (her pencere ayrı yapardı). Test: `test/panel_ilk_acilis.mjs` (10; bayrak varken kayıtlı açık panel açık gelir).
- [x] **Ana görünümde kaydırırken sayfalar hızlı ve net** (5. madde; `goruntuleyici.js`, `keskinlik.js`). Kök nedenler (ölçümle):
  1. Aynı ölçekteki yeniden çizimin 120 ms'lik beklemesi her kaydırma olayında yeniden kuruluyordu, kaydırma sürdükçe hiç dolmuyordu: yüksek
     yakınlaştırmada (%600, sayfanın yalnızca görünen kısmı çizilir) kaydırırken görünen alanın ~%90'ı beyaz kalıyordu.
  2. Büyük görseller (logo, kaşe, karekod, tarama) kaydırırken önce yumuşak çiziliyor, keskin örnekleme işçide yapılıyordu; keskin yeniden çizim
     yalnızca görünür sayfalarda ve kaydırma durunca geliyordu: önden çizilen sayfalar ekrana bulanık girip durduktan ~0,45 sn sonra netleşiyordu
     (logolu belgede 5 sayfanın 4'ü). Kullanıcının "hafif geç yükleniyor gibi" dediği bu.
  3. 6 MP'yi aşan her ilk çizimde önce düşük çözünürlüklü önizleme, sonra asıl görüntü çiziliyordu; 2560 px %125 ekranda genişliğe sığdırılmış her
     sayfa 6,7 MP olduğu için görünmeyen sayfalar dahil her sayfaya uyuyordu (iki kat çizim, net görüntü 15–80 ms gecikmeli).
  4. Bölgesel çizimin payı ve önden çizme bandı kaydırma yönüne bakmıyordu.
  - Kararlar: ölçek aynıysa yeniden çizim beklemeden (0 ms) yapılır, bekleyen plan sıfırlanmaz (kısma); ölçek değişince (yakınlaştırma sürerken,
    döndürme, koyu sayfa) eskisi gibi son adımdan 120 ms sonra (ortak denetim `ayniGorunumMu`). `keskinlik.js` çizim sırasında işçiden örnekleme
    istendiyse çizimi "keskinleşir" işaretler; görünmeyen (bant / komşu) sayfa işçi bitince kaydırma sürerken de keskin yeniden çizilir
    (keskinHazir → onYuklemeIsle). Görünür sayfa bilerek kaydırma bitince yenilenir (yeni giren sayfanın çizimiyle yarışmasın); ara tuvalden hızlı
    çizilen sayfa kaydırırken yeniden çizilmez. Önizleme yalnızca çizim başlarken görünen sayfada ve 12 MP'yi aşan bölgesel çizimde
    (`ONIZLEME_ESIGI`, 4K ekran benzeri). Bölgesel çizimde payın %90'ı kaydırma yönüne (`BOLGE_ONDE`; bölgenin boyutu, yani bellek aynı; sayfaya
    gidince ve yakınlaştırınca yön bilinmez, eşit). Önden çizme bandı görünümün ortasından yönde 2, geride 1 ekran, boşaltma sınırı yönde 4,
    geride 3 ekran; yön bilinmiyorsa eskisi gibi eşit; toplam alan aynı (0.1.18'deki "bandı daraltma" kararına uyuldu). Yön yalnızca kullanıcı
    girdisinden izlenir (`yonIzle`), programatik kaydırmada sıfırlanır (`yonSifirla`).
  - Seçilmeyenler: çizim önceliği / eşzamanlı çizim sınırı (orta risk; plan, hedef, bayat ve okuma koşullarıyla iç içe), bant sayfasının metin
    katmanını ve çekirdek isteklerini ertelemek (küçük kazanç, Bul vurgusu ve bağlantı katmanı riski), ETKILESIM_MS 250 → 150 (bundan sonra kazancı
    küçük, kısa duraklamada boşa çizim), alt önizleme tuvali (görünen sayfa başına ~6 MB).
  - Ölçüm yöntemi: `test/kaydirma_olcum.mjs` (+ `kaydirma_olcum_sayfa.js`, `kaydirma_karsilastir.mjs`, `kaydirma_ornek_uret.py`, `surec_bellegi.ps1`):
    gerçek CDP girdisiyle senaryolar (tekerlek, yukarı, PageDown, kaydırma çubuğu sürükleme, sayfaya atlama, %600), "sn·ekran" = görünen alanın boş
    ya da bulanık kaldığı süre, alanla ağırlıklı. Önce = 5c8583d'nin çalışma ağacı (arayüz aynı); iki bağımsız takım, senaryo başına 4 tekrar, makine
    boşta, gözcü süreçle; belgeler metin 410, logolu-karekodlu 60, taranmış 40 sayfa (üretilmiş).
  - Ev ekranı (1800 × 1050, %125), 4 tekrar ortalaması: logolu belgede bulanık alan hızlı tekerlek 2,75 → 0 (bulanık giren sayfa 4/5 → 0), yukarı 3,21
    → 0 (durunca keskinleşme 444 → 1 ms), PageDown 1,52 → 0, sürükleme 2,29 → 0; %600 tekerlekte boş alan metin 1,618 → 0,044, logolu 1,621 → 0,035,
    taranmış 1,617 → 0,034, yukarı 1,30–1,36 → 0,032–0,038; metinde sayfaya atlama keskin 44 → 24 ms, çizim 24 → 12; sürükleme boş 2,04 → 1,36, çizim
    süresi 3548 → 1801 ms, iptal 11 → 0; tekerlek ve PageDown'da çizim sayısı yarıya indi. Ofis ekranı (1900 × 1000, %100): logolu bulanık 2,77 / 3,24 /
    1,78 / 2,43 → 0; %600 boş 1,61–1,66 → 0,021–0,026. 4× yavaş işlemci: %600 boş metin 1,62 → 0,11, logolu 1,63 → 0,045; sürüklemede durunca
    740 → 293 ms, 50 ms'yi aşan kare 26,3 → 10,3. Bellek (3 belge, hızlı tekerlek, çöp toplamadan sonra süreç ağacı): ev 481,0 → 450,1 MB, ofis
    455,5 → 441,9 MB (yönlü boşaltma geride kalan tuvali bir azaltıyor). Bedel: kaydırırken daha çok çizim (%600'de 1,8 sn'de 1–2 yerine 11–14,
    +200–290 ms işlemci; ofiste logolu belgede 3 sn'de 4,5 → 8).
  - Test: `test/kaydirma_cizim.mjs` (ekran ölçeğinden bağımsız: yakınlaştırılmış tam çizim her ölçekte 19 MP; ev, ofis ve %150'de 25/25; 0.2.2'de
    1.–3. bölümde 9 HATA, 4. bölüm çöker).
- [x] **Sayfalar panelinde kaydırırken hızlı yükleme** (5. madde; `panel.js`, `core/pdefe_core.py`).
  - Kök neden 1: IntersectionObserver hücre göründüğü anda isteği doğrudan çekirdeğe gönderiyordu (sıra, öncelik, iptal yok); çekirdek tek iş
    parçacığında geliş sırasıyla işler. Hızla gezinince geçilen her hücrenin isteği birikiyor, varılan yer onların hepsi üretilene dek boş kalıyordu
    (410 sayfa, 480 px panel, bırakınca: istek gecikmesi ortancası 754 ms, en çok 1,43 sn; görünenlerin dolması ~1,1 sn).
  - Karar 1, istek kuyruğu (`_kuyruk`): çekirdekte aynı anda en çok 2 istek (KUYRUK_ESZAMANLI; biri işlenirken öteki bekler, çekirdek boşta kalmaz);
    sıra gönderilirken seçilir: görünen hücreler önce, sonra görünen alana en yakın; kaydırma yönünün tersindekilerin uzaklığı 2 katıyla
    (GERI_AGIRLIK); görünen alandan 2 alan yüksekliğinden uzak hücrenin isteği gönderilmez, hücre gözlemciye geri verilir (DUSME_ALANI); panel
    kapalıysa, başka panel sekmesi seçiliyse ya da alan 0 yükseklikteyse bekleyenlerin hepsi geri verilir. Gözlemcinin payı 300 px → bir alan
    yüksekliği; önbellekte yeterli resim varsa hücre kuyruğa girmez (`_hucreGorundu`); istenen genişlik gönderme anında okunur; yer çekirdeğin yanıtı
    gelince boşalır. Seçilmeyenler: yöne göre değişen rootMargin (gözlemciyi yeniden kurmak gerekirdi), çekirdekte iptal (en çok 2 istek varken
    gereksiz), aynı kaynak sayfanın isteklerini birleştirmek (nadir), başarısız isteği yeniden denemek (sonsuz deneme riski).
  - Kök neden 2 ve karar 2: her küçük resim PNG'ydi; taranmış sayfanın (kâğıt dokusu) PNG'si büyük ve yavaştı. `kucuk_resim_bicimi`: sayfanın
    görselleri birlikte 0,5 MP'ye ulaşmıyorsa (get_images, içerik okunmadan) PNG; ulaşıyorsa çizilen görsellerin (get_image_info, döndürülmemiş
    sayfa dikdörtgeniyle) kapladığı alan sayfanın %25'iyse JPEG (kalite 85), değilse PNG. Yanıt {veri, bicim, genislik, yukseklik} (eski 'png' alanı
    kalktı; `kucukResimAdresi`; Sayfaları düzenle ve Ctrl+Tab seçicisi de kullanır; Birleştir'in gorsel_bilgi'si etkilenmez).
  - Ölçüt için ölçüm (12 tür üretilmiş sayfa, 256 / 320 / 576 px, JPEG / PNG boy oranı): kâğıt dokulu gri, temiz renkli, 100 dpi, yazı katmanlı ve
    boş tarama 0,11–0,30; metin + %29 fotoğraf 0,22–0,26; siyah-beyaz tarama 0,44–0,62; metin + %8 fotoğraf 0,61–0,70; logolu ve karekodlu evrak
    1,9–3,4; çizim 1,1–1,4; sayfayı kaplayan küçük zemin görseli 0,5–1,37; saf metin 0,72–0,96 ama harflerin çevresinde kusur. Seçilmeyenler: her
    sayfa JPEG (metinde kusur, logoluda 2–3 kat büyük), iki biçimi de kodlayıp küçüğünü seçmek (pahalı olan PNG kodlaması), zlib örneklemesi (boş
    taranmış sayfada yanılır), yalnızca "≥ 1 MP görsel" (100 dpi tarama 0,97 MP), %8 fotoğraflı sayfayı JPEG yapmak. Bilinen sınır: satır içi
    (inline) görselli tarama kaynak listesinde görünmez, PNG kalır.
  - Ölçüm, çekirdek (20 sayfa ortalaması): taranmış 256 px 19,2 → 6,1 ms, 102 → 28 KB; 320 px 25,0 → 9,4 ms, 168 → 46 KB; 576 px 84,5 → 32,9 ms, 551 →
    167 KB; siyah-beyaz 576 px 23,3 → 29,5 ms, 242 → 151 KB; fotoğraflı 576 px 20,2 → 23,1 ms, 521 → 117 KB; metin, logolu, orta fotoğraflı değişmedi;
    PSNR 36–41 dB. Arayüz (önce → yalnız kuyruk → son, 2 tekrar): ev metin, 480 px panel: gecikme ortancası 754 → 35 → 36 ms, bırakınca dolma 1090 ms →
    ≤ 0, boş hücre·sn 9,13 → 4,99 → 5,65; 240 px 2,39 → 0,24 → 0,22; taranmış: resimsiz giren hücre 21 → 0, atlamada gecikme 97 → 49 → 31 ms; ofis metin
    189 → 26 → 26 ms. Panelin bellek payı: ev taranmış 122,9 → 98,1 MB, ofis taranmış 123,4 → 86,6, metin değişmedi; taranmışta önbellek ev 21,6 →
    6,6 MB.
  - Testler: `test/panel_kuyruk.mjs` (42, iki ölçekte), `test/kucuk_resim_testi.py` (50); `kaydirma_olcum.mjs`'e panel-bellek senaryosu,
    `kayit_sekme_panel.mjs` yeni yanıt.
- [x] **Kurucu, kurulu PDEfe'yi tanıyor** (7. madde; `build/installer.nsh`, yalnızca NSIS; Mac etkilenmez). Kök neden: electron-builder'ın
  sihirbazında sürüm karşılaştırması yok; kurulu olduğunun tek ipucu "Kimler için" sayfasındaki yanlış çevrilmiş etiketti; elle çalıştırmada
  lisans, kip, klasör ve Ek görevler sayfalarının hepsi geliyordu; eski sürüme dönüşte uyarı yoktu; masaüstü kutusu her seferinde işaretliydi
  (silinen kısayol geri geliyordu).
  - Kurulu sürüm sayfası customWelcomePage'de (ilk sayfa), yalnızca arayüzlü kurucuda ve bu kullanıcıya kurulu PDEfe bulunursa. HKCU
    Uninstall\<GUID>'den DisplayVersion ve InstallLocation; program exe'si yoksa "bozuk". Eski: Güncelle (önerilen) / Seçenekleri değiştirerek kur /
    Kaldır; aynı ya da bozuk: Onar / Kaldır; daha yeni: Vazgeç (önerilen, Quit) / Eski sürüme dön; sürüm okunamazsa "bilinmiyor": Onar / Kaldır.
    İleri düğmesinin yazısı seçime göre (Güncelle, Onar, Kaldır, Kapat, Kur; "Eski sürümü kur" 84 px'ti, 75 px'lik düğmeye sığmadı); düğme yazılarına
    kısayol harfi konmadı (seçeneklerin ve "< &Geri"nin kısayollarıyla çakışıyordu).
  - Lisans ve klasör sayfalarının atlanması: isUpdated tanımı customWelcomePage'in sonundan customPageAfterChangeDir'in başına dek çevrilir, arada
    yalnızca electron-builder'ın iki atlama işlevi derlenir (-V4 derlemede izlendi); Ek görevler kip denetimiyle atlanır. Masaüstü kısayolunun
    bugünkü durumu sayfadan çıkarken okunur (ShortcutName + $DESKTOP). Kaldır: UninstallString Exec edilir, kurucu kapanır.
  - "Kimler için kurulsun?" kalktı: customInstallMode yalnızca $installMode CurrentUser iken isForceCurrentInstall. Yönetici olarak "herkes için"
    kurulmuş PDEfe bulunursa güvenli yol: sayfa gösterilmez, sihirbaz ve kip sayfası bugünkü gibi ("(must run as admin)" eki Türkçe).
  - Sınamada bulunan: kurulu değilken lisans sayfasında "< Geri" görünüyor, basılınca sihirbaz kapanıyordu (NSIS atlanan ilk sayfanın da önüne
    gidiyor): bu durumda Geri gizli (0.2.2'deki gibi).
  - Türkçe iletiler customHeader'da (LangString ${LANG_TURKISH}, uyarı 6030 push / pop): İngilizce kalan uninstallFailed, decompressionFailed,
    appClosing; yanlış ya da bozuk appRunning, appCannotBeClosed ("Yeniden Dene" Türkçe Windows'tan okundu), areYouSureToUninstall, kip sayfası. Ek
    (dbca9b9, 0ca9dbf): eski sürüm durumuna da Kaldır (planda üç seçenek vardı; açıklamalar tek satır, "PDEfe açık" uyarısıyla en alt 218 / 228 px);
    lisans düğmesi MUI_LICENSEPAGE_BUTTON "&Kabul et" (NSIS'in "Kabul Ediyorum"u 84 px, düğme 75) ve alt metni; NSIS 3.0.4 Turkish.nsh'in yazım
    hataları ("kadırılımı", "Kaldırım işlemeni", "programlari", "Litfen", "Tamamlandır", "'bitir'e", "şeçiniz") dil dosyasındaki koşullarla üzerine
    yazılarak (sıra yakalanan betikte doğrulandı: sayfalar → MUI_LANGUAGE → customHeader).
  - Seçilmeyenler: customCheckAppRunning (güncelleme yolundaki bekle-kapat da değişirdi), göreli sayfa atlaması (sayfa sayısı yanlışsa kurulum
    sayfası atlanabilirdi), Güncelle'de keepShortcuts (isUpdated'ı kurulum bölümüne taşımak sessiz kodu değiştirirdi), kurucunun kendini --updated
    ile yeniden başlatması (arayüz olmaz, PDEfe sorusuz kapanırdı), customRemoveFiles ve customUnWelcomePage (kaldırıcıyı değiştirirdi), NSIS
    önbelleğindeki dil dosyasını yamamak (CI'da yeniden üretilemez), arayüzlü kurucuyu WMI ile başlatmak (WinstationDesktop uygulanmıyor).
  - Sınama düzeni (gerçek PDEfe'ye dokunmadan): `test/kurucu_sinama.yml` / `.nsh` "Kurucu Sinama" deneme kimliği (gerçek appId, exe, kısayol, paket
    adı ya da ProgId'le derlenirse !error); `kurucu_yakala.cjs` + `kurucu_derle.mjs` deneme derlemesi (90.x, proje dışına) ve betik yakalama;
    `kurucu_karsilastir.mjs`: son etiketin (v0.2.2) installer.nsh'iyle çalışma ağacındakini aynı betikle -WX -V4 derleyip sessiz kipte çalışan kodu
    (.onInit, install bölümü ve çağırdıkları: 8 işlev, 869 satır) ve kaldırıcıyı (12 işlev, 1070 satır) satır satır karşılaştırır (her commit'ten
    sonra 0 fark); `kurucu_surucu.cs` görünmeyen masaüstü sürücüsü (CreateProcess lpDesktop, PrintWindow, metin sığma ölçüsü);
    `kurulum_surum.ps1` 1. düzey sayfa sınaması (installer.nsh electron-builder'ın gerçek sayfalarıyla; son hâliyle 88 TAMAM); `kurucu_akis.ps1`
    2. düzey tam akış (deneme kurucuları 90.0.1 / 90.0.2: kurulu değil, tam sihirbaz, Seçenekleri değiştirerek, Güncelle, /S, Onar, Kaldır,
    --no-desktop-shortcut, Vazgeç, Eski sürüme dön, --updated /S, bozuk; ön ve son görüntüde gerçek PDEfe'nin 27 değeri aynı, denemeden iz yok;
    76b7e92'de 45 TAMAM). Ölçülen: paket içinden çalışan kurucunun HKCU yazımları paketin sanal kovanına gider, Programs\ ve Başlat menüsü yazımları
    gerçek klasörlere.
- [x] **Bağımsız inceleme** (iki salt okunur inceleyici: görüntüleyici / kurucu; 10 bulgu, 9'u gerçek çıktı ve önce düşen bir sınamayla düzeltildi,
  1'i bir sınamanın koşulmamış olması; commit'ler a4d931d, 54903f7, 2382f98).
  - Form alanlı belgede yüksek yakınlaştırmada kaydırınca çekirdek tıkanıyordu (orta): sayfaCiz her çizimden sonra ekKatmanlar'ı (form_gorunum:
    tam sayfa RGBA PNG, bağlantı katmanı) çağırıyor ve 'sayfaCizildi' gönderiyordu (not katmanı baştan); 0.2.3'te aynı ölçekteki yeniden çizim
    beklemesiz geldiği için kaydırma boyunca onlarca kez (formlu.pdf, %600: 19 çizim, 17 form_gorunum; kaydırma bitince küçük resim isteği 5957
    ms, 0.2.2'de 384). Düzeltme: `s._katmanAnahtari` = ölçek|döndürme|dpr|koyu, ek katmanlar ve sayfaCizildi yalnızca anahtar değişince;
    girdiBosalt sıfırlar. Sonra 0 form isteği, küçük resim isteği 4–11 ms.
  - "keskinleşir" işareti pencerenin genel sayacından türüyordu (düşük; inceleme kanıtlayamamıştı): eşzamanlı çizimde (fotoğraflı A ile metinli B
    birlikte) B 3 denemenin 2'sinde boşuna yeniden çiziliyordu. Düzeltme: `cizimGoreviHazirla` her görevin _nextBound'unu sarar, hizli() ve iste()
    o görevin sayacını (`gorevSayaci`) artırır; sarılamazsa genel sayaç. Seçilmeyen: iste()'de yalnızca yeni istekte saymak (başka sayfanın
    kuyruğa koyduğu ortak görsel de keskinleşecek sayılmalı). Sonra 0/3.
  - Deneme kurucusunun korumaları .pdf ProgId'sini denetlemiyordu (orta): ProgId gerçeğiyle aynı yazılırsa deneme gerçek PDEfe'nin PDF kaydının
    üzerine yazar, kaldırırken silerdi. `kurucu_derle.mjs` ProgId'nin gerçeğinden farklı (harf ayırmadan) ve PDEFE_PROGID ile aynı olduğunu
    denetler, nsh'te ayrıca !error; `kurucu_akis.ps1`'in temizliği .pdf varsayılanı deneme ProgId'sinde kalmışsa ön görüntüdeki değeri geri yazar
    (yalnızca paket görünümüne). Yeni `test/kurucu_koruma.mjs` (6; önce 1/6).
  - Boş (çizilmemiş) görüntü "SIĞIYOR" sayılıyordu (koşumda 16 görüntünün 7'si boştu): BosAlan, boşsa RedrawWindow ve 10 kez dek artan beklemeyle
    yeniden yakalama (6. denemeden sonra PW_RENDERFULLCONTENT'siz), yine boşsa HATA; tek satırlık seçenekte metin alandan genişse TAŞIYOR.
  - "Kısayollarınız korunur" sözü elle güncellemede görev çubuğu sabitlemesi için doğru olmayabilir (eski kaldırıcı --keep-shortcuts'sız
    WinShell::UninstShortcut / UninstAppUserModelId çağırır): açıklamalar "masaüstü kısayolu korunur" oldu (kanıtlanabilen); gerçek görev
    çubuğunda denenmedi (DOGRULAMA 38).
  - "PDEfe açık" denetimi süreç adına bakıyordu (kurucu PDEfe.exe adıyla kaydedilince kendini, başka klasördeki PDEfe.exe'yi de buluyordu):
    `pdefeAcikMi` electron-builder'ın kapatma ölçütüyle, yolu kurulu klasörle başlayan süreç (Toolhelp + QueryFullProcessImageNameW + GetLongPathNameW,
    harf ayırmadan; kurucunun kendisi ve başka kullanıcının süreci sayılmaz). Seçilmeyen: PowerShell + Get-CimInstance (bu bilgisayarda 10,9–12 sn;
    sayfa o kadar geç açılırdı).
  - Sayısal olmayan DisplayVersion "daha yeni sürüm kurulu" sayılıyordu (8 biçimin 6'sı): `pdefeSurumCekirdegi` "-" / "+"tan önceki çekirdeği alır,
    yalnızca rakam ve nokta; çekirdeği aynı ön sürüm eski sayılır (0.2.3-beta.1 < 0.2.3); okunamazsa "bilinmiyor".
  - Kaldırıcı InstallLocation'dan başka yerdeyken "bulunamadı" deniyordu: kaldırıcı UninstallString'in tırnak içindeki yolunda aranır (GetInQuotes
    gibi); iletiden işe yaramayan Windows Ayarlar önerisi çıktı ("Güncelle'yi / Onar'ı seçip yeniden kurun…").
  - Ek görevler sayfası "İleri'ye basın" diyordu, düğmenin adı Kur: "Kur'a basın".
  - İnceleyicilerin sorun bulmadığı alanlar (özet): panel kuyruğunun bütün yolları, küçük resim biçiminin /Rotate'li sayfada doğru olması ve bütün
    tüketicileri, bant / boşaltma toplamlarının yönden bağımsızlığı, sonsuz yeniden çizim ve iptal fırtınası olmaması, bellek, şeritler ve bölünmüş
    düğme, açılış ızgarası, ICO biçimi, panel bayrağı; kurucuda sessiz yollar (0 fark), isUpdated çevirisinin sızmaması, sürüm karşılaştırması,
    kayıt okuma, Geri / İptal, masaüstü kısayolu, uygulama içi güncelleme.
- [x] **Testler** (yeni): serit_birlesim (59, üç ölçekte), geri_al_bolunmus (41), acilis_hizasi (10, üç ölçekte), panel_ilk_acilis (10), panel_kuyruk
  (42), kucuk_resim_testi.py (50), kaydirma_cizim (35: 6. ve 7. bölüm form alanlı ve eşzamanlı çizim; ev, ofis, %150), kaydirma_olcum / _karsilastir
  (ölçüm), kurulum_surum.ps1 (88), kurucu_akis.ps1, kurucu_karsilastir.mjs, kurucu_koruma.mjs (6); örnekler kaydirma_ornek_uret.py (formlu.pdf,
  karma.pdf). Güncellenen: serit_olculeri (25), senaryo19, 20, 21, 26, 27, arac_onizleme, kisayol_araclar, kayit_sekme_panel. Grupların regresyonunda
  (ekran dışı / görünmeyen masaüstü, kendi portlarında) geçenler: sigdirma_kararli 51 ve sigdirma_rastgele (420 örnek) üç ölçekte, kisayol_gorunum
  115, kisayol_dosya 164, kisayol_araclar 92, senaryo13 65, 14 56, 17 43, 18 10, 19 113, 20 52, 21 37, 22 101, 23 53, 25 30, 26 62, 27 19 (eski
  ayarla 20), 29 58 / 61, 30 81, senaryo6 ve 28 (hepsi), senaryo1 (yer tutucularla), ortu_tiklama 156, sekme_genislik 35, panel_kucuk_resim
  93 (üç ölçekte), kayit_sekme_panel 61, arac_onizleme 22, gec_iptal 20, mac_renderer 23, yazi_dolgu_koyu, gercek_fare (kaynaktan) 9/9,
  tanima_testi 19, guvenlik_testi 43, kurulum_bitis 4/4. Bilinen: vurgu_cubugu'nun "görünür bir vurgu var" denetimi 0.2.2'de de düşüyor; araclar_testi yer tutucularla 117/122 (aynı 5 hata değişiklik
  öncesinde de); panel_kucuk_resim bir koşuda %100'de 1 HATA verdi, iki yeniden koşu 93/0 (kararsız).
- [x] **README ve ekran görüntüleri**: README kodla karşılaştırıldı; şeritlerin yeri ve seçili sekme, bölünmüş geri al, açılış ekranındaki hiza ve
  yeni simge, Sayfalar panelinin ilk açılışı ve hızlı yüklemesi, akıcı kaydırma, Birleştir ve Sayfaları düzenle'nin yeri, kurulumda kurulu sürüm
  sayfası (Güncelleme ve Kaldırma bölümlerinde de) ve kurucu sınamaları yazıldı. 19 görüntü yeni düzenle yenilendi (ekran-kaydedilmemis bayt bayt
  aynı çıktı), 4 yeni: kullanıcının isteğiyle ana görünüm, açılış ekranı ve Birleştir koyu temada (`ekran-*-koyu`, açık temadakilerle yan yana) ve
  `ekran-kurulum` (kurulum_surum.ps1'in eski sürüm görüntüsü, yalnızca PDEfe adı ve sürümler). `test/readme_goruntuleri.mjs` koyu tema görüntülerini de
  üretir (ana görünüm için belgeler kaydedilmeden kapatılıp aynı sırayla açılır; açılış ekranındaki son açılanlar aynı sırada). 24 görüntü, 2,7 MB.
  Açılış ekranı görüntüsü sürüm 0.2.3'ü göstersin diye package.json önce yükseltildi (son commit'te).
- [ ] **Yayım öncesi** (bu revizyonda koşulmadı): paketli derleme (npm run cekirdek:derle + electron-builder --dir; çekirdek ping, taranmış sayfada
  kucuk_resim'in bicim'i 'jpeg', PDEfe.exe / PDEfe-Setup.exe / pdefe-core.exe'den simge çıkarma, gercek_fare -Paketli), `test/kurucu_akis.ps1` baştan
  sona (ek ve düzeltme gruplarının adımları: eski sürümde Kaldır D3 / D4, A1'de "Kabul et", .pdf varsayılanını geri yazma, yeni metinler, yol ile
  "açık PDEfe" denetimi), Mac CI (`platform=mac`; değişiklikler renderer ve çekirdekte platformdan bağımsız, mac_renderer 23/23).
- Açık / takip:
  - Görev çubuğu sabitlemesinin elle Güncelle'de kalkıp kalkmadığı gerçek Windows'ta denenmedi; kalkıyorsa sessiz yolu değiştirmeden önlenemez,
    ancak uyarı metni eklenebilir (Güncelle açıklaması tek satır, yer yok).
  - Kurucu dosyası PDEfe.exe adıyla kaydedilip PDEfe gerçekten açıkken çalıştırılırsa sayfa doğru biçimde "açık" der, ama electron-builder bu
    adda kurucuda açık PDEfe'yi aramıyor ve kapatmıyor: "kurulum onu kapatır" sözü o durumda doğru değil (kurulum "dosya kullanımda" iletisiyle
    durur). Önlemek customCheckAppRunning gerektirir (güncelleme yolunu da değiştirir).
  - Şablonlara gömülü İngilizce yazılar kaldı ("Waiting for \"PDEfe\" to close.", "File is busy, aborting", "Uninstall was not successful…" vb.);
    yalnızca customCheckAppRunning / customRemoveFiles ya da şablon değişikliğiyle. Dil dosyasından dokunulmayan iki metin: lisans sayfasındaki
    "'page down' tuşuna" ve kurucunun bitiş başlığı "PDEfe Kurulum sihirbazı tamamlanıyor.".
  - Ölçüm (bulgu değil): electron-builder'ın kendi "uygulama açık mı" denetimi (PowerShell + Get-CimInstance) bu bilgisayarda 10,9–12 sn; 0.2.2
    kurulumunun 46 sn sürmesinin bir nedeni olabilir.
  - Kaydırma: 410 sayfalık metinde kaydırma çubuğunu hızla sürüklerken sayfalar yine boş giriyor (ev 2,04 → 1,36, 4× işlemcide 3,88 → 2,57 sn·ekran;
    çözümü çizim önceliği, bilerek dışarıda); yavaş bilgisayarda %600'de görünen alanın ~%6–7'si beyaz kalabiliyor (alt önizleme tuvali gerekir);
    %600'de hızlı çizilmiş görünür sayfa kaydırma bitene dek keskinleşmiyor (bilerek). Ölçümler üretilmiş örneklerle; 4K'daki önizleme yolu yalnızca
    benzetildi; kullanıcının gerçek ekranında elle denenmedi.
  - Panel: çok hızlı sürüklemede geçilen hücrelerin çoğu boş geçer (istek başına ~35 ms, en çok 2 eşzamanlı), bırakınca görünenler hemen doluyor; hata
    veren istek yeniden denenmez (0.2.2'deki gibi); orta boy fotoğraflı (< %25) ve satır içi görselli taramalar PNG kalır; siyah-beyaz taramada 576
    px'te JPEG biraz yavaş (23 → 30 ms) ama %38 küçük. Yön ağırlığı ve paylar ölçümle seçildi; 4× işlemciyle panel senaryoları koşulmadı.
  - Birleştir'de satırlar 164 px, 1280 × 700'de listede ~1,35 satır (DOGRULAMA 38'de soruluyor); önizleme ekran ölçeği değişince yeniden istenmez
    (0.2.2'den); okunamayan PDF'in satırında çekirdeğin İngilizce ham iletisi tam yolla görünüyor (0.2.2'de de; kapsam dışı gözlem).
  - Simge: ICO'da 96 px yok (%150'de orta simge 128'den küçültülür, Gezgin'de bakılmalı); Mac .icns 512 px'ten (Retina'da yumuşaksa mac.icon için
    paketin 1024'lüğü).
  - Ekran ölçekleri `--force-device-scale-factor` ile denendi; bölünmüş düğmenin 1 px'lik ayırıcısı kesirli ölçekte iki cihaz pikseline yayılabilir
    (%125 / %150 görüntülerinde düzgün). Liste fareyle açılıp Esc ile kapatılınca odak halkası 13 px'lik okun çevresinde (0.2.2'den, koyu temada
    belirgin; değiştirilmedi).
  - Toplu koşularda iki geçici kesinti yeniden koşuda çıkmadı: test sürücüsü (node) iletisiz 0xC0000409 ile kesildi (senaryo29 görünmeyen masaüstü,
    ortu_tiklama), senaryo22'nin çökme taklidinde bir kez zamanlama hatası.
  - Notlara (ortak/notlar/pdefe.md) girecekler: kaydırma ölçüm düzeni (kaydirma_olcum, sn·ekran), kaydirma_cizim'in 6. ve 7. bölümü ve formlu / karma
    örnekleri, kurucu sınama düzeni (kurulum_surum'un 8b / 8c / 9b / 11 / 11b / 11c / 12 durumları, kurucu_akis'in D3 / D4 adımları, kurucu_koruma,
    görüntünün yeniden çizdirilerek alınması), WMI'nin masaüstünü uygulamaması ve bu bilgisayardaki yavaşlığı.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 38.
