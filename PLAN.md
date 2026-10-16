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
  yazdir.js             yazdırma (0.2.6: Windows'un kutusu açılmadan seçilen yazıcıya; yazıcı listesi, durumu ve tercihleri);
                        yazdirSecenek.js: pencerenin seçeneklerinden Electron'un yazdırma seçeneklerine (saf işlev)
  udfYaklasik.js        0.2.6: UYAP Doküman Editörü yokken UDF'nin yaklaşık çizimi (gizli, yalıtılmış pencere + printToPDF)
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
  araclar/              araç pencereleri (kucult, sayfalar, dondur, ayir, gorselBirlestir, donustur 0.2.6; birlestir.js 0.1.2'de kaldırıldı);
                        ortak.js: pencere, çıktı satırı, standart kaydetme seçimi, üzerine yazma / kilit soruları
  komutlar.js           komut deseni: KomutYigini (geri al/yinele, kayıt konumu); komut tarifi (tanim): sekme başka pencereye taşınınca
                        yığın tariflerden yeniden kurulur
  durum.js              durum çubuğu
  adlar.js              0.2.6: gösterilen ad (sondaki .pdf atılır: sekme, seçici, Açık belgeler, son açılanlar)
  tumSecim.js           0.2.6: Ctrl+A ile belgenin bütün sayfalarının metni (sanal seçim, arka planda hazırlanan kopya)
  yazdir.js             yazdırma penceresi (0.2.6: yazıcı seçimi, ön izleme); yazdirYerlesim.js: sayfanın kâğıttaki yeri (saf işlev)
src/udf-cizim/          0.2.6: UDF çizim motoru (Drive UDF Okuyucu'nun kopyası, iki PDEfe değişikliğiyle) ve yaklaşık çizimin sayfası
core/                   Python 3.12 (proje içi .venv, uv ile kurulu; PyInstaller ile tek klasör core/dist/pdefe-core/)
  pdefe_core.py         JSON-RPC döngüsü, belge önbelleği, temel yöntemler
  islemler/notlar.py    not yazma: Highlight/Text (referans okuyucu yapısı)/FreeText (gömülü Türkçe yüzler, parçalı /RC), kaydet
  islemler/araclar.py   küçült, sayfa düzenle, ayır, görüntü/PDF birleştir, döndür; geçici dosya + atomik yer değiştirme
  islemler/yapisal.py   sayfa tarifinden belge kurma, anlık kopya, konumsal not eşleme, içerik kutusu
  islemler/yazi_tanima.py  0.1.24: görsellerdeki yazının tanınması (Windows.Media.Ocr, pywinrt); kendi iş parçacığı, sayfa önbelleği
  islemler/donustur.py  0.2.6: Dosya Formatını Değiştir'in çatısı (içerikten tür, toplu dönüştürme, iptal, PDF üzerinden zincir) ve TIFF ↔ PDF
  islemler/udf.py       0.2.6: UDF → PDF, UYAP Doküman Editörü'nün sayfalayıcısıyla (ude_kopru/ude-kopru.jar: Java 8, yalnızca yansıma)
  islemler/udf_yaz.py   0.2.6: PDF → UDF (düzenlenebilir; editörün ölçülmüş yerleşim modeli)
  islemler/word.py      0.2.6: Word → PDF (görünmez ayrı Word örneği, iş nesnesi; yoksa LibreOffice)
  islemler/pdf_word.py  0.2.6: PDF → Word (ucuncu/pdf2docx: pdf2docx 0.5.13, opencv'siz, PDEfe değişiklikleriyle)
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
- [x] **Son sınama** (belgelerden sonra, 0.2.3 sürümüyle): tam regresyon 59 takım, 3.123 denetim; ilk geçişte tek hata kaydirma_cizim'in ön koşulu
  (60 tekerlek olayından 53'ü sayfaya ulaştı; uygulama doğru, 3 yeniden koşu 35/35; test gevşetilmedi). Eski testler (senaryo1–10, oto_kayit_kilit,
  araclar_testi yer tutucularla 117/122) a2a9b50'yle aynı sonuç, gerileme yok; senaryo3, 11, 12 (gerçek pano) ve guncelleme-e2e/senaryo koşulmadı.
  Paket: `npm run cekirdek:derle` (ping ok), `electron-builder --dir`, `gercek_fare -Paketli` 9/9, yeni `test/paket_duman.mjs` 18/18 (sürüm, şeritler,
  bölünmüş geri al, panelin ilk açılışı, PDF aç hizası, Birleştir 150 px, paketli çekirdekte taranmış sayfa JPEG / metin sayfası PNG, kapatma sorusu).
  Gerçek yapılandırmayla kurucu (LZMA, 136.161.282 bayt, sürüm 0.2.3; çalıştırılmadı). PDEfe.exe, PDEfe-Setup.exe, kaldırıcı ve pdefe-core.exe'den
  çıkarılan 256 / 48 / 32 / 16 px simgelerin 16'sı da yeni simge (eskisiyle ortalama fark 53–59, yenisiyle 0,01–0,11). `test/kurucu_akis.ps1` baştan
  sona 16 adım, 56 TAMAM, 0 HATA; gerçek PDEfe'nin 27 değeri önce ve sonra aynı, deneme kopyasından iz yok.
- [ ] **Mac CI** (`platform=mac`; dal gönderme onayı gerekir; değişiklikler renderer ve çekirdekte platformdan bağımsız, mac_renderer 23/23). Yayım
  derlemesi Mac DMG'yi de sınar.
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

### Revizyon 0.2.4 (2026-10-09, kullanıcı istekleri: yan ya da ters taranmış sayfada yazı seçme; yakınlaştırma listesi, Ayarlar, imza)
Ayrıntı: CHANGELOG.md. Kullanıcı (ofiste): "pdefe uygulamam … belgesindeki metinleri okuyamıyor ancak [çevrim içi bir PDF yazı tanıma
hizmetine] yükleyip indirdiğim belgeyi okuyabiliyor. neden okuyamıyor?" İnceleme (kod değişmeden) ve öneriden sonra kullanıcı sordu: "döndürme
işlemini kullanıcı görecek mi arka planda mı yapılacak?" → arka planda; "Onaylıyorum, 0.2.4 olarak hazırla".
- [x] **Kök neden.** Belge tek sayfalık taranmış görüntü: yatay bir tablo dik sayfaya yan yatırılmış (yazı aşağıdan yukarı okunuyor), sayfada
  /Rotate yok. Windows.Media.Ocr yalnızca yataya yakın yazıyı okur: sayfa olduğu gibi 0 satır, 90° çevrilince 60 satırın hepsi doğru (çekirdeğin
  tanıma yolu belgenin kopyasında değiştirilmeden koşuldu). Hizmetin çıktısı sayfaya görünmez bir yazı katmanı (GlyphLessFont) ekliyor; PDEfe'de
  seçim o katmandan geliyordu, ama hizmet de yazıyı ters yönde okumuştu (katmandaki metin anlamsız: başlık "LLIAIS WINONYV …"). PDEfe'nin kendi
  tanıyıcısı o dosyada da 0 satır buluyordu. 0.1.24'te bilinen sınır olarak yazılmıştı ("Ters (180°) taranmış yazı tanınmaz"; yan da).
- [x] **Yazının yönü** (core/islemler/yazi_tanima.py `_yonlu_tani`, `_makul`, `_cevir`, `_geri_cevir`). Her tanıma bölgesi önce olduğu gibi
  tanınır. Sonuçta en az 8 makul sözcük varsa ve sözcüklerin en az %70'i makulse (`YON_YETERLI`, `YON_ORAN`) yazı dik sayılır, başka yön denenmez.
  Değilse çizim 90°, 270° ve 180° (saat yönünde; `YON_DENEME`) çevrilip (Pillow `transpose`) yeniden tanınır; net puanı (makul eksi makul olmayan
  sözcük) dik okunuşunkinden en az 3 fazla, makul sözcüğü en az 3 olan en yüksek puanlı yön seçilir (`YON_FARK`, `YON_EN_AZ`); çevrilen okunuş
  yeterliyse öteki yönler denenmez. Makul sözcük (`_MAKUL`): küçük harfli, baş harfi büyük ya da büyük harfli Türkçe harfli sözcük (kesmeyle ekli
  de), kısaltma ("T.C."), sayı; baştaki / sondaki tırnak, ayraç ve noktalama sayılmaz. Sözlük değil biçim kuralı: ters okunan yazı ("NISYA
  EJeIsnp") çoğunlukla harf / rakam / büyük-küçük harf karışıktır; yan duran yazıdan tanıyıcı ya hiç satır ya da birkaç kısa parça bulur.
  Çevrilmiş çizimde okunan sözcük köşeleri çevrilmemiş çizime, oradan eskisi gibi PyMuPDF düzlemine çevrilir; renderer'a giden biçim aynı
  (sözcük başına sol üst, sol alt, sağ üst köşe), sözcükler yazıyla birlikte dikey ya da ters durur. Sayfa, dosya ve ekran değişmez.
- [x] **Ölçüm** (betikler depoda değil, oturumun geçici klasöründe; belge adı ve metni yazılmadan yalnızca sayılar). Kullanıcının indirdiği 1159
  PDF'ten belge başına bir sayfa: 60 metinli sayfa taranmış gibi görüntüye çevrildi (150 dpi gri JPEG), 100 gerçek taranmış sayfa; her sayfanın
  tanıma bölgesi dört yönde tanındı, kural her gerçek yön için benzetildi (160 × 4 = 640 durum; 153 sayfada dik okunuşta en az 5 makul sözcük).
  - Dik okunuşta makul oranı (en az 10 sözcüklü sayfalar) en az 0,66, yüzdelik 5 / 50 = 0,75 / 0,87. Ters okunuşta en çok 0,59 (ortanca 0,37)
    ama sözcük sayısı dik okunuşun %50–80'i; yan okunuşta çoğunlukla 0–40 sözcük, makul sözcüğü 8'i geçen ve oranı 0,7'yi aşan yan okunuş yok.
  - Seçilen kural 640 durumun hiçbirinde yanılmadı. Dik sayfaların 12'sinde / 160'ında (az yazılı ya da kötü taranmış) öteki yönler de denendi:
    sayfa başına ortalama +0,05 sn, en çok +1,9 sn. Tanıma süresi: dik sayfa ortalama 0,35 sn; yazısı aşağıdan yukarı okunan sayfa 0,70 sn (en çok
    2,5), yukarıdan aşağı 1,14 sn (en çok 3,7), ters 1,44 sn (en çok 5,3). 100 gerçek taramanın birinin de yan taranmış olduğu çıktı (dik okunuşta
    0, 90° çevrilince 125 makul sözcük); kural onu çevirdi.
  - Seçilmeyen kurallar (ölçüldü): makul sözcük sayısıyla seçmek (ilk deneme; dik okunuştan 2 kat ve 5 fazla) ters sayfalarda 4–7 kez yanıldı:
    ters okunuş çok sözcük verir. Oran eşiği 0,6 yan okunuşu (8 / 12) yeterli sayıp 1–3 kez yanıldı. Eşik 0,65 + en az 10 sözcük de yanılmadı
    ama yan okunuşun en yüksek oranına (0,67) yakın.
- [x] **Kopyanın sırası** (pdefe_core.py `_metin_duzlemi`, `_dondurme_matrisi`; yazi_tanima.py `satir_yonleri`). Tanınan satırların yazı yönü
  önbellekte tutulur (döndürülmemiş düzlemde birim vektör). Seçim tanınan yazıya değince `_metin_duzlemi` dört düzlemi de aday alır ve PDF
  metninin ve tanınan yazının satırlarından en çoğunun soldan sağa okunduğu düzlemi seçer (eşitlikte sayfanın kendi döndürmesi, sonra döndürülmemiş);
  değmezse eskisi gibi yalnızca iki aday (`taninan` verilmezse davranış birebir aynı). Öteki düzlemlerin matrisi PyMuPDF'in kuralıyla görünür
  kutunun boyutundan kurulur (testte dört açıda `rotation_matrix`'le karşılaştırıldı).
- [x] **Ekrandaki seçim**: renderer değişmedi. `tanimaOgeleri` öğenin dönüşümünü sözcüğün yazı yönünden kurar; PDF.js öğeye `--rotate` verir;
  metin.js'in okuma sırasındaki seçimi sayfanın ana yönünü öğelerin çoğunluğundan alır (`sayfaModeli`, `okumaKutusu` 90 / 180 / 270). Belgenin
  kopyasıyla test örneğinde: 145 sözcük, hepsi 270°, açılış + tanıma 1,3 sn, başlık fareyle iki yakınlaştırmada tam seçildi. (İlk denemede
  seçim yanlış göründü: sınama betiğinin sürüklemeye başladığı nokta pencerenin dışındaydı; başlık görünür alana kaydırılınca doğru.)
- [x] **Sınırlar** (bilerek): dik okunan sayfanın kenarındaki dikey kısa şerit (kaşe, barkod yazısı) tanınmaz (sayfa yeterli okunduğu için öteki
  yönler denenmez). Aynı sayfada farklı yönde iki görsel bölge kendi yönünde tanınır, ama kopyada sayfanın düzlemi çoğunluğa göre seçilir. Eğik
  (ör. 45°) yazı ve Bul'da tanınan yazı (0.1.24'ten beri aranmaz) değişmedi.
- [x] **Seçilmeyen yollar**: sayfayı gerçekten döndürmek (kullanıcı arka planda istedi; dosya değişir, kaydetmek gerekir, e-imza bozulabilir);
  yön kestirimi için ayrı model (Tesseract OSD: ek bağımlılık ve model dosyası); her bölgeyi her zaman dört yönde tanımak (dik sayfada 4 kat süre);
  yönü küçültülmüş görüntüyle yoklamak (küçük yazıda yanılma riski, ölçülmedi); sözlükle puanlamak (PDEfe'de sözlük yok, biçim kuralı yetti).
- [x] **Testler**: tanima_testi 19 → 61 (makul sözcük kuralı 17, çevirme ve geri çevirme 3, üç yönde kopya sırası / satır yönü / "T.C."nin yeri /
  sözcük sayısı 12, yazısız görsel, az sözcüklü dik kaşe, dik taranmış sayfa, düzlem 2, döndürme matrisleri 4; ilk koşuda "T.C." makul sayılmıyordu:
  sondaki nokta atılınca kısaltma kalıbı tutmuyordu, kalıp düzeltildi); test/tanima_pdf_uret.py yan.pdf'i de üretir (üç yönde yan / ters
  taranmış sayfa, yazısız görsel, dik kaşe; `yan_nokta`); senaryo31 (yeni, 25: sözcükler katmanda, yerinde ve yazıyla aynı yönde, çekirdeğin
  kopyası, aşağıdan yukarı okunan sayfada gerçek fare sürüklemesiyle seçim ve kopya, çekirdeğin temiz metni (uzunluğuyla: test günlüğündeki `bas`
  ilk 200 karakterdir), ekranda Ctrl+R ile döndürünce sözcükler dik ve kopya aynı, geri alma, yazısız görsel, dik kaşe, sayfa döndürülmedi; %100
  ve %125 ekran ölçeğinde 25/25). Regresyon (ofis): senaryo25 30/30 (ilk koşuda menü çubuğu denetimi bir kez düştü, yeni örnekte geçti; tanımayla ilgisiz),
  kopyalama_testi 22/22. Paketli sürüm bu bilgisayarda sınanmadı (PyInstaller yok); yeni bağımlılık yok (Pillow zaten paketli), çekirdek
  modülleri aynı.

İkinci istek listesi (aynı gün, üç ekran görüntüsüyle: yakınlaştırma okunun listesi, açılış ekranının imzası, Ayarlar'ın bölüm listesi):
"1) fotosunu attığım yerde max 5 sabit zoom değeri olsun çok uzun liste. … 2) … görünür alana sığdırın altında varsayılanı ayarla diye bir buton
olsun. basınca ayarları açıp ilgili ayarı getirsin. 3) açılış zoom ayarlardan son kullanılan'ı kaldıralım. 4) her iki ayardan da görünür alana
sığdır seçeneğini kaldıralım. 5) … "PDF görüntüleyici ve düzenleyici" yazısını ve küçük noktayı kaldıralım. "Sürüm … [nokta] Geliştirici:
x.com/CgrShn" yazsın. linke tıklanabilir olsun ama link renkli altı çizili falan olmasın. diğer tıklanabilirler aynı kalsın hakkındaya
yönlendirsin. 6) hakkındadaki geliştirici kelimesi yerine Geri bildirimler için: yazalım. 7) … hakkındanın üstüne kısayollar sekmesi olsun".
Beş değer sorulunca (ilk yorum "en büyük yakınlaştırma %1000" idi) kullanıcı düzeltti: "elle yakınlaştırma 6400'de kalabilir … sadece küçük
yakınlaştırma oku altında çıkan seçenekleri değiştireceğiz", değerler "25 50 100 400 1000"; Ctrl+± ayarına dokunulmayacak.
- [x] **Yakınlaştırma okunun listesi** (uygulama.js `ZOOM_LISTESI`): Gerçek boyut (%100), Sayfayı sığdır, Genişliğe sığdır, ayırıcı, "Varsayılanı
  ayarla", ayırıcı, %25 %50 %100 %400 %1000 ("Gerçek boyut (%100)" ile %100 ikisi de var: kullanıcının değerleri). `EN_BUYUK` (%6400) ve
  `ZOOM_ADIMLARI` değişmedi. "Varsayılanı ayarla" kipler gibi işaretli olmasın diye iki ayırıcı arasında (kullanıcı "altında" dedi).
- [x] **"Varsayılanı ayarla"** (ayarlarPenceresi.js `ayaraGit`, seçenek `ayar`): Ayarlar › Açılış ve düzen; kartın `data-hedef`'i
  (varsayilanZoom) ortaya kaydırılır, kenarı 1,6 sn vurgu renginde yanıp söner (ayarlar.css `.ayar-kart-vurgu`), seçim kutusu odaklanır.
  Seçim kutusuna `data-ayar` verilmedi: `ayarlarPenceresiniGuncelle` sayıyı (yüzde) seçeneklerde bulamayıp ilk seçeneği gösterirdi.
- [x] **"Son kullanılan" ve "Görünür alana sığdır" kalktı**: Ayarlar'ın seçim kutusundan, okun listesinden ve menü çubuğundaki Görünüm menüsünden
  (menu.js; kullanıcı iki yeri saydı, üçüncüsü tutarlılık için, raporda söylendi). `sonZoom` kaydı ve kaydı yazan kod (`zoomKaydetGecikmeli`)
  kalktı; main/ayarlar.js açılışta 'son' / 'gorunur' değerini 'genislik' yapar, `sonZoom`'u siler (KALDIRILAN_ANAHTARLAR). Görünümdeki 'gorunur'
  kipi (goruntuleyici.js, çekirdeğin `icerik_kutusu`'su) bilerek kaldı: pencereler arası taşınan sekmenin durumu ve testler (senaryo22,
  sigdirma_*) kullanıyor; arayüzden artık ulaşılmıyor. Belge açılırken bilinmeyen yakınlaştırma değeri genişliğe sığdır sayılır.
- [x] **Açılış ekranının imzası** (baslangic.js, stil.css `.karsilama-baglanti`): "PDEfe" ve altında "Sürüm 0.2.4 · Geliştirici: x.com/CgrShn".
  Bağlantı `<a href>` (renk inherit, çizgisiz, üstüne gelince de), uygulama.js'teki genel bağlantı dinleyicisiyle tarayıcıda açılır; imzanın
  tıklama işleyicisi bağlantıdan gelen tıklamada Hakkında'yı açmaz. İmzanın öteki yerleri (simge, ad, sürüm) eskisi gibi Hakkında. Bağlantı
  `tabindex="-1"`: imza 0.1.15'ten beri Tab ile odaklanmıyor (klavyeyle Yardım › PDEfe hakkında).
- [x] **Hakkında**: "Geri bildirimler için: x.com/CgrShn".
- [x] **Kısayollar bölümü** (yeni kisayolListesi.js; ayarlarPenceresi.js `bolumKisayollar`): liste uygulama.js `kisayollarGoster`'dan taşındı, F1
  penceresi ve Ayarlar aynı listeyi gösterir (testte satır satır karşılaştırıldı). Bölüm dar olduğundan sütunlar alt alta; tuşlar F1'deki gibi
  kutulu (stil.css). Simge klavye. F1 değişmedi.
- [x] **Test örneğinde dış bağlantı** (main.js `kabuk:disAc`): test örneğinde tarayıcı açılmaz, istek test:diyalogKaydi'na düşer (bağlantıya
  gerçek fareyle tıklayan senaryo32 için; kullanıcının tarayıcısında x.com açılmasın).
- [x] **Testler**: senaryo32 (yeni, 21: imza metni ve bağlantının görünüşü, bağlantıya tıklayınca dış açma ve Hakkında'nın açılmaması, ada ve
  sürüme tıklayınca Hakkında, "Geri bildirimler için", bölüm sırası, Kısayollar = F1, okun listesi ve seçimi, Ctrl+± adımları ve %6400, "Varsayılanı
  ayarla", seçenekler, vurgunun kalkması, menü çubuğu, ayarın taşınması; ayrıca eski 'son' ve 'gorunur' ayarıyla başlatılan iki örnekte 21/21).
  Güncellenen: senaryo14 (bölümler; hepsi geçti), senaryo17 (bölümler; yer tutucudan bilinen 2 düşüş: sayfa kutusu, tek tık vurgu),
  senaryo20 (imza; 52/52), senaryo21 (imza; 37/37). Regresyon: kisayol_gorunum 115/115, senaryo27, senaryo25 30/30, senaryo31 25/25. Görünüş açık
  ve koyu temada ekran görüntüsüyle denetlendi (imza, Kısayollar, vurgulu kart). README'deki ekran görüntüleri yenilenmedi (imzada ve Ayarlar'ın
  bölüm listesinde eski hâl; test/readme_goruntuleri.mjs evdeki örnek PDF'lerle).
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 39.

### Revizyon 0.2.5 (2026-10-09, kullanıcı istekleri: güncelleme şeridi ve indirmenin yarıda kalması; son açılanlar)
Ayrıntı: CHANGELOG.md. Kullanıcı (ofiste, 0.2.4'ü uygulama içinden kurduktan sonra): "güncelleme yüklenirken pdefe'yi kapatmayın yazsın o şeritte.
bir de indirme devam ederken kapatınca ne oluyor, veri kaydediyor mu bakar mısın birkaç kez kapattım indirme yarımken bu pc'ye. veya indiren
kişinin interneti kesintiye falan uğrarsa ne oluyor veya kaydedilmemiş öğe varsa ne oluyor? bu hususları inceleyip testlerini yapıp soracağın
bir şey yoksa eksiklik bulursan düzeltelim. son açılanlar kısmındaki pdf'lerdeki simge de uygulamanın simgesi olsun. ayrıca buradaki evraklarda
.pdf diye yazmasına gerek yok." "Yüklenirken" indirme sayıldı: kurulum sırasında PDEfe zaten kendisi kapanıyor.
- [x] **İnceleme (electron-updater 6.8.9).** İndirme `pending/temp-PDEfe-Setup.exe`'ye yazılır, bitince adı değişir; yarım indirme sürdürülmez:
  sonraki indirme geçici dosyayı silip baştan başlar (`createTempUpdateFile`). Hata ya da iptalde electron-updater bekleyen klasörünü kendisi
  boşaltır; PDEfe kapatılınca (süreç biter) yarım dosya kalır. Kurucu kendini önbelleğin köküne (`installer.exe`) kopyalar: sonraki güncellemede
  yalnızca değişen bloklar iner (GitHub'daki blok haritalarından: 0.2.1→0.2.2 8 MB / %6, 0.2.2→0.2.3 71 MB / %55, 0.2.3→0.2.4 95 MB / %73;
  çekirdek ya da simge değişince çok). Bu bilgisayarda (WMI, gerçek disk) 0.2.4 kurulmuş, yarım dosya kalmamıştı (sonraki tam indirme silmişti),
  ama bekleyen klasöründe kurulmuş 0.2.4'ün kurucusu (137 MB) duruyordu; bir sonraki güncellemeye dek kalıyordu.
- [x] **Eksikler ve düzeltmeler** (main/guncelleme.js, renderer/guncelleme.js, main.js):
  - İndirme yarıda kalınca şerit bir hafta görünmüyordu: denetim zamanı indirmeden önce yazıldığı için sonraki açılış denetlemiyordu.
    `bekleyenGuncelleme` artık indirme başlarken yazılır (önceden yalnızca indirme bitince): sonraki açılışta süreye bakılmadan bir kez denetlenir.
  - Donmuş bağlantıda indirme sonsuza dek "%N"de kalabiliyordu: builder-util-runtime'ın zaman aşımı `request.on('socket')` ile kuruluyor, Electron'un
    `net` isteği bu olayı vermiyor. Bekçi: `download-progress` 60 sn gelmezse (`INDIRME_BEKLEME_MS`) indirme `CancellationToken` ile kesilir, ileti
    `DONMUS_INDIRME`. Jeton sınıfını electron-updater dışa vermiyor; main.js onu electron-updater'ın kendi bağımlılığından alır (`iptalJetonuSinifi`,
    aynı sınıf olsun). macOS ve sahte güncelleyicide jetonsuz (sahte güncelleyicinin kendi küçük jetonu ve `donma` senaryosu var, 3 sn).
  - Önbellek temizliği (`onbellekTemizle`, açılışta, tek örnekte): yarım indirmenin "temp-…" dosyaları her açılışta, bekleyen sürüm bu açılışın
    sürümüyse (`acilisDenetimi` → `kuruldu`) bütün bekleyen klasörü. Kök (`installer.exe`, `current.blockmap`) kalır. Güncellemeden sonraki ilk
    açılışta kurucu bir an daha çalışıyor olabilir (dosyası kilitli): silinemeyen 3, 10, 30 sn sonra yeniden denenir; bu arada indirme başladıysa
    dokunulmaz. İndirme ilk geçişi bekler. electron-updater'ın `getOrCreateDownloadHelper`'ı kullanılır (yoksa bir şey yapılmaz).
  - Şerit: "PDEfe x indiriliyor %N (… / …). **İndirme bitene dek PDEfe'yi kapatmayın.**" (kalın).
  - Kaydedilmemiş belge: değişiklik gerekmedi; indirme bitince sorulur, Vazgeç → "Kur ve yeniden başlat" (yeniden indirmeden), uygulama kapatılırsa
    kurulmaz (autoInstallOnAppQuit false), sonraki açılışta şerit.
  - Seçilmeyen: yarım indirmeyi sürdürmek (electron-updater desteklemiyor, değişen blok indirmesi zaten kısaltıyor), indirme sürerken kapatmayı
    soruyla engellemek (Çıkış ve oturum sonu soru sormaz, 0.2.2; kullanıcı yazı istedi), kurulum aşamasına da "kapatmayın" (PDEfe kendisi kapanıyor).
- [x] **Son açılanlar** (baslangic.js `BELGE_SIMGESI`, `uzantisiz`): simge build/icon.svg (22 px keskin; imzadaki büyük simge icon.png), ad sondaki
  ".pdf" (büyük-küçük harf fark etmez) olmadan, ipucunda tam yol. Dosya › Son açılanlar menüsü ve sekmeler değişmedi (istek açılış ekranı içindi).
- [x] **Sınama**:
  - Birim (test/guncelleme-e2e/birim.mjs) 83: indirme başlayınca bekleyen kaydı ve sonraki açılışta şerit, bağlantı kopunca bekleyen kalır ve Yeniden
    dene, donmuş indirmenin kesilmesi, yavaş ama ilerleyen indirmenin kesilmemesi, jetonsuz eski yol, önbellek temizliği (yarım dosyalar / kurulmuş
    sürüm / kök kalır / ikinci örnek / yardımcı yok / klasör yok), kilitli dosyada yeniden deneme ve bırakma, indirme sürerken yeniden denememe.
  - senaryo33 (yeni, 12; sahte güncelleyiciyle geliştirme örneği): son açılanlar (uzantısız adlar, ".PDF", addaki noktalar, simge, ipucu), şeritteki
    uyarı, bekleyen kaydı, donan indirme (3,7 sn), bağlantı kopması, kaydedilmemiş belge → Vazgeç → Kur ve yeniden başlat → tek kurulum.
  - Uçtan uca (guncelleme-e2e; deneme uygulaması 0.9.0 → 0.9.1, gerçek electron-updater, yerel sunucu 2,5 MB/sn; sunucuya `/__kes` ve `/__dur`
    eklendi, senaryo.mjs'e `yarimKapat`, `seritBekle`, `kesinti`, `donma`): %20'de kapatınca 39 MB yarım dosya ve bekleyen kaydı kaldı; yeniden
    açılınca şerit 4,4 sn'de geldi (son denetim 40 sn önceydi), yarım dosya silindi. Donmada bekçi 64 sn'de kesti. Kesintide ileti hemen, Yeniden dene
    baştan indirip bitirdi, kaydedilmemiş belge soruldu, Vazgeç → hazır. Kurulum yapıldı (0.9.1, --updated ile yeniden açıldı); kurulumdan sonraki
    açılış taklit edilince bekleyen klasörü boşaldı, kök kaldı.
  - Deneme düzeninde öğrenilen: (1) değişen blok indirmesi 0.9.0→0.9.1'de 1,2 MB'tı (kurucu kendini önbelleğe kopyalıyor), yarıda kesmek için
    önbellekteki installer.exe silinmeli; (2) uygulama ekran dışı pencereyi (-2600) ekrana çekiyor, deneme uygulaması görünmeyen masaüstünde
    açılmalı (`baslat_gizli.ps1 -Paketli`; ilk denemede pencere kullanıcının ekranında göründü); (3) Claude'un kabuğunda önbellek klasörü sanal,
    kurucunun yeniden açtığı uygulama gerçek oturumda: kurulumdan sonraki temizlik o yüzden aynı görünümde taklitle sınandı.
  - Regresyon: senaryo19 112/112, senaryo20 52/52, mac_renderer 23/23 (son açılanların adı uzantısız beklendi), senaryo25 / 31 / 32 bu sürümde
    değişmeyen kodda.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 40.

### Revizyon 0.2.6 (2026-10-14 – 10-15, kullanıcı istekleri: Yazdır düğmesi ve yazdırma penceresi; Dosya Formatını Değiştir; Sayfaları düzenle'de kopyalama; Ctrl+A; sekme adları; yazı kutusu kopyala-yapıştır)
Ayrıntı: CHANGELOG.md. Kullanıcının yedi maddelik isteği (özet): (1) Kaydet'in yanına Yazdır düğmesi, sağ tık menüsüne Yazdır; (2) yazdırma bazı
bilgisayarlarda düzgün çalışmıyor (Windows 11'in yazdırma kutusunda ön izleme yok); (3) yeni araç "Dosya Formatını Değiştir" (ad harfiyen bu): UDF ↔
PDF, TIFF ↔ PDF, Word ↔ PDF, gerçeğine olabildiğince yakın; PDF → UDF'te resim tabanlı ile düzenlenebilir arasında soruldu, kullanıcı yalnızca
düzenlenebiliri seçti; (4) Sayfaları düzenle'de kartın altında döndürmenin sağına, silmenin soluna kopyala simgesi (kopya hemen sağına), Ctrl+C /
Ctrl+V, sağ tıkta kopyala, döndür, sil; (5) "Ctrl+A açık tüm sayfalardaki metni seçsin"; (6) "Sekmelerdeki .pdf yazısı kalksın"; (7) yazı kutusu
kopyala-yapıştır, yapıştırılan düzenlenebilir olsun; yeri tıklanan sayfanın sağ üst köşesi, tıklama noktasını izlemek görüntülemeyi yavaşlatmıyorsa
tıklanan yer; farklı sayfa tipleriyle denensin. Gönderme, etiket ve sürüm yayımı yok: bu revizyon yalnızca yerel commit'ler.
Düzen: salt okunur keşif (arayüz, sayfa / not, yazdırma, araç çerçevesi, UDF, TIFF / Word); iki şerit aynı çalışma ağacında sırayla (arayüz A1–A5;
çekirdek B1–B3); aracın arayüzü (C1); UYAP Doküman Editörü yokken yaklaşık UDF (C2); bağımsız inceleme ve düzeltme turu; belgeler. Her grup küçük
commit'ler, önce düşen testlerle. Ölçümlerde gerçek belgeler yalnızca kopyalarıyla ve yalnızca sayılarıyla kullanıldı; kopyalar iş bitince silindi.
Electron yalnızca ekran dışındaki (`test/baslat.ps1`) ya da görünmeyen masaüstündeki (`test/baslat_gizli.ps1`) örnekte başlatıldı: önceki bir
denemenin deney betiği olağan masaüstünde başlatılınca kullanıcının ekranında Electron'un hata kutusu açılmıştı (yolu file:// URL'sinden pathname ile
çeviriyordu).

#### 0.2.6: Yazdır düğmesi, sağ tık menülerinde Yazdır, sekme adlarında ".pdf" yok (madde 1 ve 6)
- [x] **Durum.** Yazdırma komutu vardı (`dosya.yazdir` → yazdir.js; Ctrl+P, Dosya › Yazdır, Mac'te Yazdır… ⌘P); araç çubuğunda ve sağ tık menülerinde
  yoktu. Sekme adı belgenin dosya adı (`belge.ad`, uzantılı); 0.2.5'te yalnızca açılış ekranının Son açılanlar listesi uzantısız yapılmıştı.
- [x] **Araç çubuğu** (index.html, uygulama.js `belgeDurumuYaz`): Kaydet'in hemen sağında, aynı grupta Yazdır (`data-komut="dosya.yazdir"`, ipucu
  "Yazdır (Ctrl+P)", Mac'te ⌘P), simge Kaydet'le aynı çizgi stilinde yazıcı. Açılış sekmesinde soluk, belgede her zaman etkin: kaydedilmemiş
  değişikliği `yazdir()` kendisi sorar. Tıklama komut yolundan (`komutCalistir`): açık yazı düzenlemesi önce uygulanır, açık seçenek penceresi ikinci
  kez açılmaz.
- [x] **Menüler**: belge sayfasında son grup "Kaydet, Yazdır"; sekmede Kaydet'in hemen altında. Açılış sekmesinde ve başka pencereye taşınan sekmede
  devre dışı. Arka plandaki sekmeden seçilince önce o sekmeye geçilir (`soruIcinOneAl` → `sekmeSec`, `belgeyiYazdir`): yazdırma penceresi ve kaydetme
  sorusu hangi belge için açıldığı görünsün (0.2.1'de Kaydet'teki gerekçe). Etiket üç noktasız "Yazdır" (Mac menüsündeki "Yazdır…" değişmedi).
- [x] **Şerit sığdırma** (stil.css): Yazdır (34 px; 6. kademede 26 px) en dar pencerede (Windows'ta içi 704 px) 4 basamaklı sayfa sayısıyla araç
  çubuğunu 0,7 px taşırıyordu (serit_olculeri'nin eşiği 0,5 px); 6. kademede ayraçların kenar boşluğu 2 → 1 px (`#arac-cubugu.sikisik-6 > .ayrac`),
  hiçbir düğme gizlenmedi. Kademeler erkene kaydı: 900 px'te düğmeler 28 px (0.2.5'te 34), 760 px'te menü çubuğu düğmesi gizli, 704 px 6. kademe
  (geri_al_bolunmus'un sınırları 800 / 740 / 704; 0.2.5'te 760 / 704 / 660).
- [x] **Sekme adı** (yeni src/renderer/adlar.js `uzantisiz`; sekmeler.js, uygulama.js, baslangic.js): sondaki ".pdf" (büyük / küçük harf fark etmez)
  yalnızca gösterilen addan atılır: sekme, Ctrl+Tab seçicisi, Açık belgeler listesi, sürüklenen sekmenin ön izlemesi. "karar.v2.pdf" → "karar.v2";
  ".pdf" ve "rapor.pdf.yedek" olduğu gibi. Model adı (`belge.ad`, `s.ad`) uzantılı kaldı; ipucu (tam ad + yol), pencere başlığı, sorular, yazdırma
  penceresi ve Dosya › Son açılanlar menüsü uzantılı (istek sekmeler içindi; kullanıcıya söylendi). Son açılanlar (0.2.5) da ortak işlevi kullanıyor.
- [x] **Seçilmeyen yollar**: 7. sıkışma kademesi (Sayfa düzeni düğmesini gizlemek: görünür bir düğme kaybolurdu); Yazdır'ı değişiklik yokken soluk
  yapmak (yazdırma değişiklikten bağımsız); menüden `yazdir()`'ı doğrudan çağırmak (açık yazı düzenlemesi uygulanmazdı); sekme adını modelde uzantısız
  tutmak (ipucu, başlık, sorular ve testler uzantılı ada dayanıyor); pencere başlığını da uzantısız yapmak (görev çubuğu ve Alt+Tab tam adı
  göstersin).
- [x] **Testler**: senaryo34 (yeni, 41: düğmenin yeri, ölçüsü, ipucu, solukluk, yazdırma penceresinin açılması, ikinci basış, yazı düzenlemesi, iki
  menü, taşınan ve arka plandaki sekme, sekme adları); 0.2.5'in kodunda (git worktree + node_modules / .venv bağlantısı) dört bölümde düşüyor, şimdi
  41/41 (%100 ve %125). Güncellenen ve geçen: senaryo28, senaryo22 101/101, senaryo19 113/113, senaryo20 52/52, senaryo23 53/53, serit_olculeri 25/25,
  geri_al_bolunmus 41/41, mac_renderer (⌘P), sekme_genislik 38/38, kisayol_dosya 164/164, panel_kuyruk 42/42.

#### 0.2.6: yazdırma PDEfe'nin kendi penceresinde (madde 2)
- [x] **Kök neden.** Seçenek penceresinden sonra `webContents.print({ silent: false })` Windows'un yazdırma kutusunu açıyordu. Chromium bu yolda
  `PrintDlgEx` çağırır; Windows 11 22H2'den beri Win32 uygulamalarının bu çağrısı birleşik (modern) kutuya gider ve o kutudaki ön izleme yalnızca
  WinRT PrintManager kullanan uygulamalarda çalışır (Win32'de, ör. Notepad++'ta da hep boş): Electron'da o alanı dolduracak API yok, PDEfe'nin
  düzeltebileceği bir hata değil. Aynı kutu uygulamanın verdiği kâğıdı, yönü ve çift taraflıyı yok sayabiliyor (yazıcının varsayılanı A5 iken A4 sayfa
  0,7 ölçekle basıldı), çift taraflı seçimi kutuya geçmiyor, sayfa seçimi iki kez yapılıyordu (PDEfe'nin seçtiği sayfalardan sonra kutuda yeniden
  aralık yazılınca boş iş). "Bazı bilgisayarlar": Windows 10, Windows 11 21H2, bazı uzak masaüstü oturumları ve `PreferLegacyPrintDialog=1` olanlarda
  eski kutu çıkıyor.
- [x] **Karar: Windows'un kutusu hiç açılmaz** (main/yazdir.js): `webContents.print({ silent: true, deviceName, copies, collate, color, duplexMode?,
  pageSize, margins: none, printBackground })`. `pageRanges` (sessiz yazdırmada Chromium işi iptal ediyor: "Print job canceled"), `landscape` (yatay
  sayfayı PDEfe döndürür) ve `dpi` gönderilmez; "Yazıcının ayarı"nda `duplexMode` da gönderilmez (yazıcının ayarı korunur). Kâğıt standartsa adıyla
  (`'A4'`), değilse mikronla. Eşleme saf modülde (main/yazdirSecenek.js `secenekleriHazirla`; Electron'u içe aktarmaz, Node'da sınanır).
- [x] **Pencere** (renderer/yazdir.js, ayarlar.css; iki sütun, en dar pencerede sol sütun kayar). Solda Yazıcı ("(varsayılan)", "(çevrim dışı)";
  açıklama satırı; Yazıcı tercihleri), Kopya 1–99 ve Harmanla (1 kopyada soluk), Sayfalar (Tümü / Geçerli / Aralık), Kâğıt ("Belgeye göre": seçilen
  sayfaların en sık boyutu; A4, A3, A5, Letter, Legal), Boyut (Sayfaya sığdır / Gerçek boyut), Renk (Renkli / Siyah beyaz; TDK'ya göre ayrı ve kısa
  çizgisiz), Çift taraflı (Yazıcının ayarı / Tek taraflı / uzun kenar / kısa kenar), Notları yazdır. Sağda büyük ön izleme (beyaz kâğıt, temadan
  bağımsız; sayfa basılacağı yerde ve yönde), ◀ n / N ▶ (Page Up / Page Down), özet "3 sayfa × 2 kopya", hatalı aralıkta ön izlemede hata yazısı.
  Altta "Windows yazdırma penceresiyle yazdır" (macOS'ta "macOS …"; eski `silent:false` yolu: yazıcı ve kopya orada seçilir, sayfa seçimi, kâğıt ve
  boyut PDEfe'ninki), Yazdır, Vazgeç.
- [x] **Yazıcılar** (yeni kanallar, preload izin listesi + `guvenliIpc`): `yazdir:yazicilar` (isteği gönderen pencerenin `getPrintersAsync()`'i +
  varsayılan yazıcı: Windows'ta kayıt defterinden reg.exe'nin tam yoluyla, macOS'ta `LANG=C lpstat -d`; Electron'un listesinde varsayılan bilgisi
  yok), `yazdir:yaziciDurumu` (Windows'ta PowerShell `Get-CimInstance Win32_Printer`, pencere açıldıktan sonra arkadan ~1,3 sn, 15 sn önbellek: çevrim
  dışı, çift taraflı, dosyaya yazan), `yazdir:tercihler` (System32\rundll32.exe `printui.dll,PrintUIEntry /e /n <ad>`, kabuksuz, ad listeden
  doğrulanır; macOS'ta Sistem Ayarları › Yazıcılar ve Tarayıcılar). Çift taraflı basmayan yazıcıda iki seçenek soluk ve "Yazıcının ayarı"na döner;
  çevrim dışıda uyarı (iş kuyrukta bekler); dosyaya yazanda "kaydedileceği yer sorulur". macOS'ta durum okunmaz (seçenekler hep açık); yazıcı CUPS
  kuyruğunun adıyla gönderilir, pencerede görünen adı yazılır.
- [x] **Yazıcı tercihleri**: yazıcının kendi "Yazdırma tercihleri" penceresi (ayrı süreç); orada yapılan değişiklik o yazıcının kullanıcıya ait
  varsayılanı olur ve sessiz yazdırma onu temel alır (tepsi, kalite, toner tasarrufu); PDEfe'nin kâğıt, renk, kopya ve çift taraflı seçimi onun üstüne
  yazılır (ipucunda söylenir).
- [x] **Ön izleme**: çekirdeğin `sayfa_goruntu`'su (notlar seçimiyle; `kucuk_resim` hep notlu çizer), çözünürlük kâğıdın ekrandaki pikselinden
  (`onizlemeDpi`: ekran ölçeği dâhil, 24–200 dpi), JPEG; 40 görüntülük önbellek, aynı görüntü için ikinci istek yok, hızlı gezinmede eski yanıtlar
  sıra sayacıyla çizilmez; siyah beyaz CSS `grayscale(1)`. Sayfa ölçüleri pencere açılmadan `sayfa_boyutlari` ile (756 sayfada 88 ms). Yerleşim saf
  işlevde (renderer/yazdirYerlesim.js `sayfaYerlesimi`) ve yazdırma HTML'i de onu kullanır: pencerede görülen, kâğıda çıkanın küçüğüdür.
- [x] **Hatırlama**: yazıcı, harmanla, kâğıt, boyut, renk, çift taraflı kalıcı (ayar `yazdirma`, `DURUM_ANAHTARLARI`'nda: Varsayılanlara dön silmez);
  kopya her pencerede 1'den başlar, sayfa seçimi ve "Notları yazdır" yalnızca oturumda: bir sonraki yazdırmada kendiliğinden 5 kopya ya da notlar
  basılmasın (isteğin "kalıcı hatırlansın" kısmı böyle yorumlandı, kullanıcıya söylendi). Hatırlanan yazıcı kaldırılmışsa varsayılan seçilir ve "Son
  kullanılan yazıcı (…) bulunamadı"; hiç yazıcı yoksa Yazdır soluk, odak Windows penceresi bağlantısına geçer (soluklaşan düğme odağı bırakıyor, Esc
  pencereye ulaşmıyordu).
- [x] **İlerleme ve bildirim**: "\"Lazer Yazıcı\" yazıcısına gönderiliyor… (3 sayfa × 2 kopya, 1,2 MB)"; dosyaya yazan yazıcıda kaydedileceği yerin
  sorulduğu ve "Çıktıyı Farklı Kaydet" penceresi görünmüyorsa görev çubuğuna bakılacağı; bitince "gönderildi" (çevrim dışıysa "iş, yazıcı açılınca
  basılır"). Kutusuz sessiz yazdırmadan sonra odağa dokunulmaz. `nedenTurkce`: "Invalid deviceName provided" → "Yazıcı bulunamadı (kaldırılmış ya da
  adı değişmiş olabilir). …".
- [x] **Yanında düzeltilen**: `uygulama.js` `yazdir()` çağrısına ayar verilmiyordu: "otomatik kaydet açıkken sormadan kaydet" dalı hiç çalışmıyordu.
  `test/yazdir_html_testi.mjs` 0.2.0'dan beri "window is not defined" ile düşüyordu (yazdir.js DOM'a bağlı modülleri yüklüyor): saf işlevler DOM'suz
  modüllere taşındı, test onarıldı ve genişledi.
- [x] **Test örneği yazıcıya gitmez** (gelistirme.js `testDiyalog`): print çağrısı ve tercihler `test:diyalogKaydi`'na düşer, yanıtı test kuyruğundan;
  `PDEFE_TEST_YAZICILAR` ("1": yerleşik sahte liste — çift taraflı basan varsayılan "Lazer Yazıcı" (0.2.9 denetimine dek ofisteki yazıcının model adıydı), dosyaya yazan "Microsoft Print to PDF", çevrim
  dışı bir yazıcı —, ya da JSON) ve `test:yazicilar` sahte liste verir (README görüntüsünde bilgisayarın yazıcı adları olmasın);
  `PDEFE_TEST_GERCEK_YAZDIR=1` yalnızca görünmeyen masaüstündeki örnekte gerçek yazdırmayı açar.
- [x] **Seçilmeyen yollar**: "Çıktıyı Farklı Kaydet" kutusunu öne getirmek (Electron'da yabancı pencereye erişim yok; her yazdırmada PowerShell +
  Add-Type, ~2 sn; görünmeyen masaüstünde kutu sahipsiz ama PDEfe'nin önünde açıldı, gerçek ekranda denenmedi: DOGRULAMA); belgelenmemiş `mediaSize` +
  `vendor_id` ile kâğıt kimliği (DMPAPER; Electron'un iç ayrıntısı, sürümle bozulabilir; belgelenen `pageSize` kaldı, ofisteki yazıcıda denenecek); ön izlemede
  `kucuk_resim`; kopya, aralık ve notları kalıcı hatırlamak; Harmanla'yı yalnızca kopya > 1 iken göstermek (pencere zıplamasın, soluk); renk ve
  harmanlama yeteneğine göre seçenek kapatmak (istenmedi); yatay sayfanın dönme yönünü değiştirmek (0.1.x'ten beri saat yönünde; /Rotate 90'lı dikey
  sayfa kâğıtta ters görünür, ön izleme artık bunu gösteriyor: ayrı karar).
- [x] **Ölçüm** (ev, Windows 11 25H2): yazıcı listesi + varsayılan 26 ms, Win32_Printer 1,3–1,5 sn. Görünmeyen masaüstünde Microsoft Print to PDF'e
  gerçek yazdırma (PyMuPDF ölçümü): karışık 4 sayfa (A4 dikey, A4 yatay, /Rotate 90'lı A4, A5) → 4 sayfa A4 dikey, yatay ve döndürülmüş sayfa kâğıda
  döndürülmüş, A5 sığdırılınca büyüdü; siyah beyazda renkli piksel 0; notlar açıkken notun dolgusu var, kapalıyken yok; 2 kopya → 4 sayfa, sıra 1, 2,
  1, 2; kâğıt A5 → 419,5 × 595,3 pt; gerçek boyutta A5 sayfa A4'te büyütülmeden; kaydetme kutusunda Vazgeç → dosya yok, "Yazdırma vazgeçildi.". Ön
  izleme 1280 × 900 pencerede kâğıt 318 × 450 px.
- [x] **Testler**: yazdir_html_testi 90/90; yazdir_pencere (yeni, sahte yazıcılar, temiz veri klasörü) 43/43 %100 ve %125 (önceki commit'te
  `test:yazicilar` yok, ilk adımda düşüyor); yazdir_gercek (yeni, görünmeyen masaüstü; `test/yazdir_kaydet.ps1` kaydetme kutusunu o masaüstünde
  doldurur: kutunun alt pencereleri yalnızca o masaüstüne bağlı iş parçacığından görünüyor; `yazdir_ornek_uret.py`, `yazdir_pdf_olc.py`) 15/15;
  mac_renderer 28/28 (macOS'ta "Yazıcı ayarları", "macOS yazdırma penceresiyle yazdır", kuyruk adı); senaryo34 41/41, ortu_tiklama 156/156,
  kisayol_dosya 164/164, senaryo22 101/101.

#### 0.2.6: Ctrl+A belgenin bütün sayfalarındaki metni seçer (madde 5)
- [x] **Yorum** (kullanıcıya söylendi): etkin belgenin bütün sayfaları; bütün sekmelerdeki belgeler değil.
- [x] **Kök neden.** `tumunuSec()` (uygulama.js) yalnızca geçerli sayfanın metin katmanını seçiyordu; katmanlar yalnızca görünür sayfalarda ve
  yakınlarında kurulur, uzaktakiler boşaltılır. Bütün katmanları kurup DOM'da seçmek ölçüldü: 410 sayfalık TTK'da 55,5 sn, 37.381 öğe; seçim varken
  hiçbir katman boşaltılmıyor.
- [x] **Sanal "bütün belge" seçimi** (yeni src/renderer/tumSecim.js): geçerli sayfanın tamamlanmış katmanı DOM'da seçilir (çapa: tarayıcının kopyala
  olayı, sağ tık menüsü ve klavye bir seçim görür; katman yoksa kurulması en çok 3 sn beklenir, boş sayfada görünür alanda katmanı olan ilk sayfa),
  görünüm köküne `tum-secili` sınıfı. CSS bütün katmanların öğelerini seçim renginde boyar: sonradan kurulan katmanlar, tanınan (OCR) sözcükler,
  koyulaştırılmış sayfa dâhil; çapa sayfası iki kat koyulaşmaz. Seçim `selectionchange` (tarayıcı seçimi çapadan farklıysa), sayfa alanına sol tık,
  Esc, sekme değişimi, belgenin kapanması / taşınması, sayfa listesinin değişmesi (sil, sırala, döndür, ekle) ve görünüm düzeninin değişmesiyle
  kalkar.
- [x] **Kopya** (`TumSecim.kopyala`, copy işleyicisinin başında): Ctrl+A anında arka planda, sayfa sayfa sırayla: görselli sayfada önce `ocr_sayfa`
  (ertelenen istek, işçiyi tutmaz), sonra sayfayı kaplayan tek kutuyla `metin_sec`; ardından `sayfaMetinleriniBirlestir` + `temizMetin`: paragraf
  kuralı olağan kopyanınki, çekirdek değişmedi. Sonuçlar sayfa girdisine bağlı önbellekte. Kopyalama geldiğinde hazır değilse pano boşaltılır (eski
  içerik yapıştırılıp bütün belge sanılmasın), "Metin hazırlanıyor (N/M)… Durdurmak için Esc", hazır olunca `pano:metin` + `yalnizcaPanodaysa: ''`
  (0.1.23 kuralı: bu arada başka bir şey kopyalandıysa ezilmez, "… panoya yazılmadı" bildirimi), sonra "Belgenin metni kopyalandı (N sayfa)".
  Kopyalaması istenmiş hazırlık seçim kalksa da biter; Esc ve belgenin kapanması durdurur. Tanıyıcı yoksa yalnızca PDF metni.
- [x] **Sağ tık ve Bul**: bütün belge seçiliyken Kopyala her yerde etkin, Vurgula ve Ara soluk (yalnızca çapa sayfasına uygulanırlardı), Not ekle
  tıklanan yere. macOS'ta sağ tık seçimin dışındaki sözcüğü seçer: sağ tuşa bütün belge seçiliyken basıldıysa çapa yeniden kurulur; Ctrl+tık sağ tık
  sayılır. Ctrl+F seçimden doldurmaz; seçim çubuğu gizlenir. Kısayollar'da "Ctrl+A Belgedeki tüm metni seç" (macOS'ta ⌘A).
- [x] **temizMetin** (metin.js; sonuç aynı): en uzun satır `Math.max(...dizi)` yayılımıyla aranıyordu, ~125 bin satırdan sonra "Maximum call stack
  size exceeded": döngüye çevrildi. Satır sonu tiresi bütün paragrafta düzenli ifadeyle aranıyordu: süre satır sayısının karesiyle artıyordu (200 bin
  satırlık tek paragraf 2 dakikada bitmedi); paragrafın son iki karakteri ayrıca tutuluyor, 0,9 sn.
- [x] **Seçilmeyen yollar**: bütün katmanları DOM'da kurmak (55 sn ve bellek); bütün belgeyi tek çekirdek isteğiyle almak (tek işçinin kuyruğunu ~6 sn
  tıkardı); çekirdekte `metin_sec`'e `tum: true` (kaplayan kutu aynı sonucu veriyor, ölçüldü); hazırlığı Ctrl+C anında başlatmak (her kopyada
  bekletirdi); hazır değilken panoya yer tutucu yazı (erken yapıştırılırsa belgeye girerdi); Vurgula'yı bütün belgeye uygulamak (binlerce vurgu notu);
  temizMetin'i Worker'da çalıştırmak (TTK'da 68 ms); macOS'ta sağ tuşun varsayılanını engellemek (Chromium sözcüğü menü olayında seçiyor).
- [x] **Ölçüm** (ekran dışı örnek, test/pdf'teki kamuya açık kanun metinleri): TTK 410 sayfada hazır olmaya 5,1–5,9 sn; hazırlık sürerken olay
  döngüsünde en uzun boşluk 54–82 ms, çekirdeğe ping 5–20 ms; bütün metin 962.132 karakter (çekirdeğin get_text'iyle %0,16 fark); bütün belge yolu ile
  tek sayfanın olağan kopyası 3 belgede 9 sayfada birebir; kaydırınca DOM'da 2–8 katman (yalnızca çapa tutuluyor); temizMetin 200 bin satır 906 ms
  (0.2.5'te RangeError).
- [x] **Testler**: tum_secim (yeni, 52; sistem panosu kullanılmaz: sahte copy olayı, çekirdeğin metni `test:diyalogKaydi`'nda) 52/52 %100 ve %125
  (önceki commit'te 13/48); kopyalama_testi 31/31 (yeni 200 bin satır denetimi eski metin.js'te RangeError ile düşüyor); mac_renderer 30/30;
  görünmeyen masaüstünde kisayol_dosya 164/164, kisayol_gorunum 115/115, senaryo19 112/112; senaryo25 30/30, senaryo31 25/25, senaryo15, 16, 17, 28
  geçti, senaryo34 41/41, senaryo24 38/38. mac_duman güncellendi (⌘A; yalnızca Mac CI'da koşar).

#### 0.2.6: Sayfaları düzenle'de kopyala düğmesi, Ctrl+C / Ctrl+V, sağ tık menüsü (madde 4)
- [x] **Yorumlar** (kullanıcıya söylendi): menüdeki Kopyala düğmeyle aynı işi yapar (kopya hemen sağına) ve sayfayı pencerenin panosuna da alır;
  menüye Yapıştır da kondu (pano boşken soluk); "döndür" menüde iki öğe (Sola / Sağa döndür); birden çok sayfa seçiliyken kopyalar sırasıyla
  sonuncusunun sağına (1, 2 seçili → 1 2 1 2), her kopya kendi özgününün yanına gitmez; Ctrl+C / Ctrl+V sistem panosunu kullanmaz, pano pencere
  kapanınca biter.
- [x] **Durum.** Aynı sayfanın düzende iki kez geçmesi zaten destekleniyordu ("PDF ekle" ile aynı dosya): kart modeli, tarif, `tarifHazirla`, küçük
  resim önbelleği ve çekirdeğin `sayfalar_uygula`'sı. Kopya kart `{...k, kimlik: yeni}`: sekme indeksi, kaynak ve döndürme korunur.
- [x] **Kart düğmesi** (`_kartOlustur`): Sola döndür, Sağa döndür, Kopyala, Sil; simge araç çubuğundaki "PDF'i kopyala"nınki, ipucu "Kopyala (sağına
  ekler)"; 220 px kartta dört 24 px düğme sığar (%100 ve %125). **Model** (sayfalar.js): `kopyala` (kartların kopyalama anındaki anlık görüntüsü),
  `yapistir` (geri alınır, eklenenler seçili), `cogalt` (kopyala + son hedefin hemen sağına); pano pencere örneğine bağlı, geri al yığınına girmez;
  boş sayfanın kopyası boş sayfa.
- [x] **Klavye** (`_tus`): Ctrl+C / Ctrl+V (macOS'ta ⌘; harf klavye düzeninden bağımsız, Ctrl+Alt = AltGr kısayol değil), ikisinde de
  `preventDefault`: 0.2.5 kodunda tuşlar arkadaki belgenin `copy` / `paste` dinleyicisine ulaşıyordu (testte 2 copy, 4 paste olayı; arkadaki belgede
  seçili metin varsa o panoya yazılırdı), şimdi 0. Bildirimler "N sayfa kopyalandı; eklemek için Ctrl+V." ve "Yapıştırılacak sayfa yok; …". Dosya adı
  kutusunda olağan kopyala / yapıştır. F1'de "Ctrl+C / Ctrl+V — Seçilenleri kopyala / seçili sayfanın arkasına yapıştır".
- [x] **Sağ tık** (`pencere.baglamMenusuEkle`; Birleştir'in deseni): kartta Kopyala, Yapıştır, —, Sola döndür, Sağa döndür, —, Sil (bütün sayfaları
  silecekse soluk); çok seçimde etiketlerde "(n)"; seçili olmayan karta sağ tık yalnızca onu seçer. Boş alanda Yapıştır, —, Tümünü seç. Kayıt sürerken
  menü açılmaz.
- [x] **Kopya sayfalarda notlar** (core/islemler/yapisal.py, seçenek D): "Üzerine yaz"dan sonra yapısal kayıt bir notu silerken ya da değiştirirken
  yalnızca kaynak sayfanın ilk kopyasına dokunuyordu (`konum.setdefault`): silinen not kopya sayfada kalıyordu (0.1.23'ün "silinen not dosyada
  kalmasın" ilkesine ters; kopyalamadan önce de "PDF ekle" ile aynı dosyada oluyordu). `konum` artık kaynak sayfa başına konum listesi; not eşlemesi
  her kopya için ayrı; silme ve güncelleme her kopyaya; kopya sayfaya eklenen yanıt, üst notun o sayfadaki kopyasına bağlanır.
- [x] **Bulunan ikinci kusur** (önceden vardı): ekranın altında 3 sn görünen bildirim (`#bildirim`) araç penceresinin alt şeridine denk geliyor ve
  tıklamayı alıyordu (pencere içi 961 px: bildirim 888–921 px, Sayfaları düzenle'nin Kaydet'i 886–919 px; bildirim görünürken Kaydet'e tıklamak bir
  şey yapmıyordu). `pointer-events: none` (bildirimde düğme ya da bağlantı yok).
- [x] **Seçilmeyen yollar**: C: kopyalar çekirdekte notsuz, renderer notları kopyaya yeni not olarak çoğaltır (sayfa ve not komutlarını tek komutta
  birleştirmek gerekirdi; damga, çizim gibi türler kaybolurdu); B: notsuz kopya (ön izleme ile sonuç tutmazdı); sistem panosu (kart sekmedeki sayfayı
  sekme indeksiyle gösterir, başka belgede anlamı yok; kullanıcının panosundaki metni silerdi); her kopyayı kendi özgününün yanına koymak; araç
  çubuğunda kopyala düğmesi (istenmedi); copy / paste olay dinleyicisi (macOS'ta ⌘V'nin menü rolüyle ikinci kez yapıştırma riski); bildirimi
  pencerenin içine taşımak.
- [x] **Testler**: yapisal_esleme_testi 13/13 (5 yeni kopya sayfa durumu; düzeltmeden önce 4 HATA); senaryo35 (yeni, 37: kart düğmeleri, kopyala
  düğmesi, döndürülmüş ve boş sayfanın kopyası, sağ tık, "Yeni belge" ve "Üzerine yaz" kaydı PyMuPDF ölçümüyle, özgündeki notun silinmesi iki kopyada,
  Ctrl+Z, bildirim görünürken Kaydet) %100 ve %125 37/37 (0.2.5 kodunda ilk bölümde düşüyor); görünmeyen masaüstünde gerçek Ctrl+C / Ctrl+V
  tarayıcının girdi yolundan (`S35_GIZLI=1`; Windows menüsünün Düzen › Kopyala hızlandırıcısı çalışmadı, copy / paste olayı doğmadı) 38/38;
  kisayol_araclar 99/99 (0.2.5 kodunda 8 HATA); mac_renderer 32/32; gec_iptal 20/20, kayit_sekme_panel 61/61, senaryo17, 18, 26, 27, ortu_tiklama
  156/156, senaryo19 113/113, arac_onizleme 22/22 geçti. senaryo13'ün 7 HATA'sı 0.2.5 kodunda birebir aynı (eski test). Her takım temiz örnekte
  koşulmalı: art arda koşulan testlerden biri yarıda çökerse soru kuyruğu dolu kalır, sonrakiler yanlış düşer.

#### 0.2.6: yazı kutusu kopyala-yapıştır; yapıştırılan kutu tıklanan yere gelir (madde 7)
- [x] **Yorumlar** (kullanıcıya söylendi): tıklama noktasını izlemek görüntülemeyi yavaşlatmıyor (aşağıda): kutu son tıklanan yere gelir. Sağ üst köşe
  yedek kural: hiç tıklanmamışsa, sayfanın dışına (gri alana) ya da bir notun üzerine (ör. kopyalamak için yazının kendisine) tıklanmışsa, tıklanan
  yer ekranda görünmüyorsa; köşe sayfanın ekranda görünen bölümünün köşesi (sayfa büyütülüp kaydırılmışsa da kutu görünür yere gelir), kenarlardan 18
  pt içeride. Art arda yapıştırılan her kopya 12 pt kayar (tıklanan yerde sağa-aşağı, köşede sola-aşağı), sayfaya sığmayan kutu içeri itilir.
  Kopyalarken bildirim: "Yazı kutusu kopyalandı; tıkladığınız yere Ctrl+V ile yapıştırılır." (macOS'ta ⌘V; eklendi, istenmezse kaldırılır). Ctrl+V
  başka sekmede ve başka PDEfe penceresinde de yapıştırır, Word'e düz metin gider; sağ tık › Yapıştır yalnızca kopyalanan penceredeki menüde etkin.
- [x] **Kök neden / durum.** 0.2.5'te yazı kutusu kopyalanamıyordu: belgenin `copy` dinleyicisi yalnızca metin seçimini işliyordu, `paste` dinleyicisi
  yoktu. Koordinat dönüşümü hazırdı (`yaziBaslat`'ın `pxRectToPdf`'i: döndürülmüş, yatay ve MediaBox'ı kaydırılmış sayfalar), metin yönü kuralı da
  (ekrandaki eğim = sayfanın açısı − `donus`). Keşifteki deney: düzenlenemez öğe odaktayken Ctrl+C / Ctrl+V, Windows menüsünün Düzen › Kopyala'sı ve
  macOS'un menü rolleri `copy` / `paste` olayı doğuruyor: tuş değil DOM olayları dinlendi.
- [x] **Kopya verisi** (notlar.js `yaziKopyaVerisi`): kanonik biçim, ekrandaki eğim, ekrandaki kutu (pt), opaklık; panoya düz metin ve PDEfe'nin özel
  türü `application/x-pdefe-yazi` (JSON, `surum`, `kimlik`); dosya yolu yazılmaz. Başka programın yazısının biçimi (görünümü dosyada) önceden okunur:
  not seçilince ve sağ tık menüsü açılınca `freetext_stil` (copy olayı eş zamanlı), nota bağlı WeakMap'te (not nesnesine yazılsaydı belge kirli
  görünürdü); henüz okunmadıysa yapıştırırken okunur. **Copy dinleyicisinde sıra**: sağ tık › Kopyala'nın hedefi → bütün belge seçimi (madde 5) →
  metin seçimi → seçili yazı kutusu (düzenlenmiyorken; girdi kutusunda, açık pencerede, sekme taşınırken değil): metin seçimi her zaman önce.
- [x] **Paste dinleyicisi** (yeni, `document`): girdi kutusunda (Bul, sayfa kutusu, not balonu), açık pencerede (araç pencereleri dâhil: Sayfaları
  düzenle'nin ve Birleştir'in Ctrl+V'si kendi tuşlarıdır), yazı düzenlenirken, sekme taşınırken ve panoda PDEfe yazısı yokken olaya dokunulmaz.
  **Doğrulama** (`yaziVerisiDogrula`; pano içeriği güvenilmez): metin boşsa ya da 20.000 karakteri, kutu 14.400 pt'yi aşıyorsa yapıştırılmaz; yazı
  tipi bilinen dört aileden biri (değilse varsayılan), boyut 4–200 pt'ye sınırlanır, renkler `#rrggbb`, opaklık 0,05–1, eğim çeyrek dönüşe yuvarlanır.
- [x] **Yapıştırma** (`yaziYapistir`): kutu `pxRectToPdf` ile, `donus = (sayfa açısı − eğim + 360) % 360`: döndürülmüş ve yatay sayfaya yapıştırınca
  metin ekranda aynı yönde; `ekle(not, 'Yazı yapıştır')`. Yazar ayardaki ad, tarih yeni; kaynağın xref'i, yanıtları, kilidi ve açıklama çizgisi
  kopyalanmaz.
- [x] **Yer kuralı** (`tikKaydet`, `tikYeri`, `yapistirmaYeri`): her basışta (sağ tık ve macOS'ta Ctrl+tık dâhil) sayfa girdisinin kalıcı kimliği,
  sayfa içi PDF noktası (px değil: arada yakınlaştırma ya da döndürme olsa da doğru yer) ve notun üzerine basılıp basılmadığı. Vurgunun kendisi "notun
  üzerinde" sayılmaz (altındaki metne basılmıştır). Kayıt `pointerDown`'dan ayrı adım: `pointerDown` sağ tıkı ve macOS'un Ctrl+tıkını yine işlemez
  (mac_renderer'daki 0.2.1 denetimi değişmedi).
- [x] **Sağ tık**: Kopyala'nın hemen altında Yapıştır (bu pencerede kopyalanan kutu var ve `pano:oku` metni onunla aynıysa etkin; sağ tıklanan yere);
  yazının üzerinde Kopyala o yazıyı seçip kopyalar. Ana süreç: test örneğinde `pano:oku` sistem panosunu okumaz, test kuyruğundan yanıtlanır; yeni
  kanal yok. F1 "Yazı kutusu": "Ctrl+C / Ctrl+V — Seçili yazı kutusunu kopyala / tıklanan yere yapıştır".
- [x] **Seçilmeyen yollar**: hep sağ üst köşe (ölçümde basış başına ~2–3 µs); fare hareketini (pointermove) izleyip imlecin son yerine (kaydırma ve
  çizim yoluna iş eklerdi); kopyayı yalnızca pencere içi panoda tutmak (madde 4'teki gibi; Word'e, başka sekme ve pencereye gitmezdi); kopyaya dosya
  yolu yazmak (yapıştırma çekirdeğe panodan gelen yolu açtırırdı); copy dinleyicisinde açık araç penceresi varken arkadaki seçili metni engellemek
  (`preventDefault` + boş veri Chromium'da kullanıcının panosunu boşaltabilir); yazı tipini yalnızca o sistemin listesinden kabul etmek (Windows'tan
  Mac'e kopyalanan Segoe UI reddedilirdi).
- [x] **Ölçüm**: `tikKaydet` (bir `closest`, bir `getBoundingClientRect`, PDF.js görünüm dönüşümü) 5.000 çağrının ortalaması %100 ve %125'te 2,1–3,1
  µs; `pointermove` dinleyicisi eklenmedi, kaydırma, çizim ve yerleşim koduna dokunulmadı.
- [x] **Testler**: senaryo36 (yeni, 59) ve `test/yazi_kopya_pdf_uret.py` (A4 dik, A4 yatay, /Rotate 90, /Rotate 270 + kaydırılmış MediaBox, A5, A3; 1.
  sayfada başka programın yazısı; `olc` kipi kayıttan sonra kutuları PyMuPDF'le çekirdekten bağımsız ölçer): %100 ve %125 59/59; önceki kodda 1–3.
  bölümlerde 17 HATA, 4. bölümde durma. Gerçek sistem panosu kullanılmadı. mac_renderer 34/34; senaryo27 19/19, senaryo28 38/38, senaryo34 41/41,
  tum_secim 52/52, yazi_ime 8/8, yazi_dolgu_koyu 13/13, kisayol_gorunum 115/115.

#### 0.2.6: Dosya Formatını Değiştir: dönüştürme çekirdeği ve TIFF ↔ PDF (madde 3)
- [x] **Kök nedenler (bugünkü durum).** Görüntü / PDF birleştir'in "Orijinal" boyutu her görseli 72 dpi sayıyordu (uzun kenarı 2500 pikseli geçerse
  300): İndirilenler'deki 13 benzersiz TIFF'in 11'inde çözünürlük etiketi yok; etiketsiz 200 dpi A4 tarama 1653 × 2338 pt (58 × 82 cm), 250 dpi elle
  tarama 441 × 709 pt oluyordu (MuPDF'in kendi dönüştürmesi 96 dpi varsayıyor). MuPDF'in yolları 1 bit sayfayı Flate'e çeviriyor, G4'ü korumuyor; UYAP
  taramaları 8 satırlık şeritli G4 (olduğu gibi kopyalanamaz). Birleştir çok sayfalı TIFF'in bütün karelerini birlikte çözüyordu (147 sayfada tepe
  1,16 GB; dört düzeyli boyut tahmini 1,17 GB). Çekirdekte ertelenmiş istekte iptal bayrağı işçi Ertelenmis'i döndürür döndürmez siliniyordu: iş
  başlamadan gelen iptal kayboluyor, iptal edilen iş "iptal edildi" (-32800) yerine boş iletili genel hata (-32000) dönüyordu. PyMuPDF iş parçacığı
  güvenli değil.
- [x] **Yeni modül** `core/islemler/donustur.py` (`islemler/__init__.py`'de araclar'dan sonra; spec'in gizli listesinde): `donusum_yetenekleri`,
  `donusum_bilgi {yol, genislik}` (tür içerikten, uzantıdan değil: `%PDF-`, TIFF / BigTIFF, zip'te docx / docm / odt / UDF, OLE2'de doc ve parolalı
  docx, rtf, düz XML UDF; ön izleme yalnızca PDF (MuPDF) ve TIFF (Pillow); UDF / Word baytı ne MuPDF'e ne arayüze gider), `bicim_donustur {ogeler:
  [{yol, hedef, hedefBicim, secenekler}]}` (ertelenmiş, ayrı dönüştürme iş parçacığında). Parametre hatası (uzantı biçimle eşleşmiyor, aynı hedef iki
  kez, hedef bir kaynağın kendisi, bilinmeyen biçim) bütün isteği reddeder; içerik hatası yalnızca o öğenin sonucuna kodla (bulunamadi, kilitli,
  salt_okunur, parolali, bozuk, taninmadi, desteklenmiyor, guvensiz, buyuk, zaman_asimi, bellek…; kilitli / salt okunur iletisi arayüzün
  `hataSor`'unun tanıdığı metni içerir).
- [x] **Güvenlik**: MuPDF'e yalnızca içeriği PDF olan dosya `filetype="pdf"` ile; TIFF Pillow'la (kare başına piksel sınırı); zip girdi önce
  `zip_denetle` (öğe sayısı 10.000, açılmış toplam 300 MB, 1 MB'tan büyük öğede oran 200) ve içerik `zip_oku` ile sınırlı açılır (bildirilen boyutu
  yalan zip bombasına karşı); hedefin uzantısı biçimle eşleşmeli.
- [x] **Yazım düzeni**: her öğe hedefin klasöründe geçici dosyaya (`<hedef>.<pid>-<sıra>.pdefe-tmp<uzantı>`; uzantı doğru: Word gibi dış programlar ad
  değiştirmesin), BÜTÜN öğeler bitince sırayla yerine konur. İptal o ana dek gelirse hiçbir hedef değişmez, geçici dosya kalmaz; yerine koyma
  başlayınca iptale bakılmaz (Birleştir / Ayır'daki "geç gelen iptal yazılmış dosyayı yazılmamış göstermesin" kuralı). PDF olmayan → PDF olmayan (ör.
  Word → UDF) geçici PDF üzerinden iki adım. Dönüştürücü kaydı (UDF ve Word modülleri için) `donusturucu_kaydet(kaynak, hedef, islev, hazir)`; bağlam:
  `mupdf()` kilidi, `denetle()`, `gecici_klasor()`, `dis_surec()` (penceresiz; iptalde ve süre dolunca süreç ağacıyla öldürülür); `hazir()`
  yapılamayan hedefi nedeniyle bildirir.
- [x] **İş parçacıkları** (pdefe_core.py): dönüştürmeler tek dönüştürme iş parçacığında sırayla; `mupdf_kilidi` (RLock): işçi her isteği, dönüştürme
  her MuPDF adımını (sayfa başına) bu kilitle yapar; Pillow ve dış süreç kilitsiz: dönüştürme sürerken küçük resim, kopyalama, ping yanıtlanır
  (sınandı). İptal bayrağı iş bitene dek durur ve -32800'e çevrilir. Çekirdek kapanırken süren dönüştürme 2 sn beklenir, bitmezse iptal edilip
  temizlenir.
- [x] **TIFF → PDF**: çözünürlük etiketi geçerliyse (inç / cm, 50–1200 dpi) o; yoksa uzun kenar A4'ün uzun kenarına (11,69 inç) oturtulur, standart
  değere (100, 150, 200, 240, 250, 300, 400, 600) %3 yakınsa ona yuvarlanır; etiketsiz karelerde dosya başına TEK değer (ortanca: elle beslenen
  taramada sayfaların gerçek ölçüsü kalsın). 1 bit sayfa: tek şerit G4 ile Flate'ten (düzey 6) sayfa başına küçüğü, XObject elle (`/CCITTFaxDecode /K
  -1 /BlackIs1 true`; ters verilince sayfa negatif çıkar, MuPDF'te ve pdf.js'te sınandı). Gri ve renkli sayfa kayıpsız PNG yolu. Kareler sırayla,
  bellekte bir kare; yön etiketi bir kez uygulanır (Pillow 12 kendisi uyguluyor).
- [x] **PDF → TIFF**: tek dosyada çok sayfa. Seçenekler 200 | 300 dpi, siyah beyaz | gri | renkli; varsayılan 200 dpi siyah beyaz (sabit eşik 160,
  titreşimsiz, G4; UYAP'ın kendi TIFF'leri gibi), gri ve renkli LZW, dpi etiketli. Sayfayı tek görsel kaplıyorsa (%95; taranmış evrak) görselin kendi
  çözünürlüğünde çizilir (50–600 dpi): pikseller yeniden örneklenmez, 300 seçilse de 200 dpi tarama 200 kalır. MuPDF ön belleği 8 sayfada bir
  boşaltılır.
- [x] **Birleştir** (araclar.py): "Orijinal"de yalnızca TIFF karesi aynı çözünürlük kuralıyla (`_gorsel_sayfa_olcusu`); JPEG / PNG ve ötekiler eski
  kural (72 dpi etiketli telefon fotoğrafı gerilemesin); "A4'e sığdır" değişmedi. Çok sayfalı TIFF kare kare çözülür, boyut tahmininin ön belleğinde 1
  bit kareler paketli. Sıkıştırma değişmedi (Birleştir'de G4 yok; ayrı karar).
- [x] **Seçilmeyen yollar**: `pymupdf.open(tif).convert_to_pdf()` (96 dpi, G4'ü Flate'e çeviriyor, TIFF'i MuPDF'e vermek 0.1.23 kuralına aykırı);
  Pillow'un PDF yazıcısı (renkli LZW sayfayı JPEG'e çeviriyor: kayıplı, 35 → 151 KB); yalnızca G4 (gürültülü 250 dpi taramada Flate %30 küçük) ya da
  yalnızca Flate (13 dosyada %24 büyük); zlib düzey 9 (%6 küçük, 10 kat yavaş); siyah beyazda Floyd–Steinberg titreşimi (okunurluğu düşürüyor, dosyayı
  iki katına çıkarıyor); dönüştürmeyi işçide eş zamanlı yapmak (bütün pencerelerin küçük resim ve kopyalama istekleri beklerdi); toplu işte öğeyi
  bitince hemen yerine koymak (iptalde yarısı yazılmış olurdu); etiketsiz karelerde sayfa başına dpi.
- [x] **Ölçüm** (İndirilenler'deki 13 benzersiz TIFF'in kopyaları; yalnızca sayılar, kopyalar silindi): 400/400 sayfa kayıpsız; gidiş-dönüşte 1 bit
  sayfalar 399/399 birebir; toplam 38,7 MB TIFF → 24,7 MB PDF (−%36; bugünkü Birleştir 30,6 MB, yanlış ölçülerle); sayfalar A4 (595 × 841–842),
  Letter, 147 sayfalık tarama 593 × 852–854 (taranan kâğıt A4'ten uzun), elle taramalar gerçek ölçüde; 147 sayfa 3,6 sn. Birleştir "Orijinal" aynı
  ölçüleri veriyor (13/13). Sentetik 150 sayfa: TIFF → PDF tepe 70 MB, 5,1 sn; PDF → TIFF tepe 95 MB (ön bellek boşaltılmadan 321 MB); Birleştir tepe
  1.169 → 139 MB, boyut tahmini 1.168 → 136 MB. 200 dpi siyah beyaz TIFF'te yazı tanıma sözcük F1 0,976.
- [x] **Testler**: donustur_testi (yeni; yalnızca üretilmiş girdiler; `--exe` paketli çekirdekle, `--hizli` 150 sayfayı atlar) 108/108, paketli 91/91;
  iptal bayrağı denetimlerinin 3/5'i eski pdefe_core'da düşüyor; guvenlik_testi 47/47 (dönüştürme bölümü); araclar_testi birlestir/tiff 8/8 (eski
  kodda 3/8), toplam 137/139 (iki kucult_tahmin süre denetimi yer tutucu belgeyle eski kodda da düşüyor); tanima_testi 61/61, kucuk_resim_testi 50/50,
  kose_notu_testi 49/49, yapisal_esleme_testi, mac_cekirdek_testi 14/14; `npm run cekirdek:derle` geçti.

#### 0.2.6: UDF ↔ PDF (madde 3)
- [x] **İstek ayrıntısı.** UYAP Doküman Editörü'nün (UDE) "PDF olarak kaydet"i bazı UDF'leri kötü kaydediyor, "Yazdır → PDF" düzgün.
- [x] **Kök nedenler.** UDE'nin "PDF olarak kaydet"i (iText 2.1.7; yalnızca sabit havuzundaki atıflara bakıldı, bayt kodu çözülmedi): (1) sayfa
  genişliğini "2 × sol kenar + yazı alanı" alıyor (`PageFormat.getWidth()` doğru): sol ve sağ kenarı farklı belgede sayfa A4 olmuyor
  (İndirilenler'deki 277 zip UDF'nin 26'sı), sol kenar küçükse sağ taraf kırpılıyor; (2) yazı tiplerini gömmüyor: başka okuyucular yerine başka yazı
  tipi koyuyor, iki yana yaslı satırlar bozuluyor; (3) saydam antetin saydam piksellerinin %96,9'u RGB 0,0,0: UDE resmi saydamlığı hesaba katmadan
  küçültünce kenarda yarı saydam koyu pikseller kalıyor (gri çerçeve). "Yazdır → PDF" aynı sayfalayıcıyı (Printable) yazıcıya çiziyor: satır kırılımı
  iki yolda aynı, bozukluk yalnızca çizim katmanında. Ayrıca: UDE sayfa numarasını glif dizisiyle çiziyor, iText bunu şekil yazıyor (görünür ama
  seçilemez, aranamaz); yorumlu UDF pencere dışında açılamıyordu (yorum vurgulayıcısı yalnızca editörün penceresinde kuruluyor: ClassCastException);
  PyMuPDF'in find_tables'ı ilk çağrıda standart çıktıya öneri yazdırıp çekirdeğin JSON kanalını bozuyordu (paketli çekirdekle bulundu).
- [x] **UDF → PDF: Java köprüsü** (`core/ude_kopru/src/pdefe/UdeKopru.java` → `ude-kopru.jar`, Java 8 bayt kodu, ~28 KB; `npm run ude-kopru:derle`,
  `build/ude-kopru-derle.mjs`; jar depoda, CI'ın Java'ya ihtiyacı yok, içinde kaynağın SHA-256'sı; electron-builder.yml Windows ve macOS için
  `resources/ude-kopru/`). UDE'nin ve iText'in sınıflarına yalnızca yansımayla erişir (derleme bağımlılığı yok, test denetler); UDE'nin karartılmış
  yöntemleri adla değil imzayla bulunur. UDE ve iText jar'ları depoya ve pakete girmez (THIRD_PARTY.md'ye not).
- [x] **PDF kipi** (birincil): sayfa sayfa iText `PdfTemplate.createGraphics(W, H, FontMapper)` + `Printable.print`; sayfa boyu PageFormat'tan; yazı
  tipi eşleyicisi süreç başına bir kez: Windows'un ve kullanıcının yazı tipi klasörleri (macOS'ta sistem, kullanıcı ve Word'ün klasörleri), hepsi
  Identity-H ve gömülü; ad bulunamazsa ailenin biçemli adı, aile, Java'nın mantıksal yazı tipinin karşılığı (Dialog / SansSerif → Arial, Serif → Times
  New Roman, Monospaced → Courier New), son olarak Arial (iText'in kendi yedeği gömülmeyen Helvetica Cp1252 idi: 45 belgenin ikisinde Türkçe harfler
  düşüyordu). Saydam resimler yüklemeden önce beyaza düzleştirilir. Çizim yüzeyi `MetinGrafik` ile sarılır: glif dizisinin karakterleri yazı tipinden
  geri bulunursa drawString (sayfa numarası yazı olur). **Yazıcı kipi** (yedek, yalnızca Windows): UDE'nin iText'i yoksa ya da çizemezse aynı
  sayfalayıcı Java'nın PrinterJob'ıyla "Microsoft Print to PDF"e, pencere açmadan, kırpma alanı sayfaya genişletilerek; sonuçta uyarı (Java bu yolda
  bazı belgeleri resme çeviriyor).
- [x] **Süreç (oturum)**: bir JVM birden çok belgeyi çizer (standart girdiden satır başına iş, yollar UTF-8: Java 8'in komut satırı ANSI kod
  sayfasıyla okunur; Java, jar ve geçici klasör yolları o kod sayfasına sığmazsa 8.3 kısa adlarıyla); çıktı satır başına JSON. Boşta 45 sn, 60 belge
  ya da ölümcül hatada yenilenir; iptalde ve süre dolunca (180 sn + 20 sn/MB) öldürülür; girdisi kapanınca kendisi çıkar. `CREATE_NO_WINDOW`,
  `java.awt.headless=true`, geçici `user.home` ve `java.io.tmpdir` (kullanıcının `.uki` ve `.sertifikadeposu` klasörlerine dokunulmaz, sınandı),
  `JAVA_TOOL_OPTIONS` / `_JAVA_OPTIONS` / `JDK_JAVA_OPTIONS` / `CLASSPATH` temizlenir, -Xmx 2 GB (32 bit Java'da 1 GB).
- [x] **UDE'yi ve Java'yı bulmak**: ayardaki yol (istek parametresi `udeYolu`: klasör, exe, .ini, macOS'ta .app) önce; sonra `.udf`'nin ProgID
  kayıtları ve açma komutunun exe'si, Uninstall kaydı, bilinen kurulum klasörü; macOS'ta /Applications ve ~/Applications'taki UYAP uygulaması. Sınıf
  yolu UDE'nin .ini dosyasındaki "Class Path"ten; sürüm exe'nin dosya sürümünden. Java: UDE klasöründeki jre, Java 8 kurulumları, JAVA_HOME, kayıt
  defteri, PATH; macOS'ta Java eklentisinin JRE'si ve JavaVirtualMachines (`/usr/bin/java` çağrılmaz: Java yoksa kurulum penceresi açar). 15'ten
  büyükler elenir (UDE Java 16+ ile çalışmıyor; Java 25'le satırlar 1 pt kayıyordu); önce 8. Bulunan ön bellekte, bulunamayan 30 sn sonra yeniden
  aranır.
- [x] **Yöntemler**: `donusum_yetenekleri.udf` (UDE ve Java'nın yolu, sürümü, nereden bulunduğu, kip); `donusum_bilgi` UDF için sayfa boyu ve kenarlar
  (UDE'siz), e-imza bilgisi ve UDE ile sayfa sayısı ve ön izleme (ayrı iş parçacığında, ertelenmiş yanıt, ön bellekli); `bicim_donustur` UDF → PDF
  kipi otomatik | pdf | yazici. Yorumlu UDF'de yorumlar yüklemeden önce çıkarılır (yazdırılan sayfanın parçası değil), sonuçta uyarı; e-imza taşınmaz
  (uyarı).
- [x] **PDF → UDF** (`core/islemler/udf_yaz.py`, UDE gerekmez; yalnızca düzenlenebilir, kullanıcının seçimi): keşif prototipinin üretim koduna
  çevrilmiş, büyük ölçüde yeniden yazılmış hâli. Yazı katmanı satırlara (taban çizgisi ±1,5 pt), satırlar paragraflara; sayfa sınırında süren paragraf
  tek paragraf. Yazı ailesi PDF yazı tipi adından (19 aile; bilinmeyen ad bu bilgisayarda kuruluysa ölçüleri dosyasından), boyut tam punto (UDE
  "10.5"i okuyamıyor, 12 sayıyor), kalın / italik / renk, altı çizili (ince yatay çizgiden).
- [x] **UDE'nin yerleşim modeli** (köprüyle ölçüldü: 17 yazı tipi × 6–28 punto × kalın / düz × iki metin = 391 çizim; ayrıca girinti, kenar, sayfa
  sonu, tablo denemeleri): satır kutusu K = ⌊hhea yüksekliği × punto⌋ + 1 (391/391 tuttu); taban çizgisi kutunun tepesinden sabit; LineSpacing satıra
  2 × ⌊LS × K / 2⌋ ekler, yarısı üstte (24/24); paragraflar arası, SpaceAbove / Below (tam puntoya aşağı), yazının x'i (⌊leftMargin⌋ + 1 + girinti),
  gövdenin ilk taban çizgisi, sayfaya sığma ve üst / alt bilginin yerleri formülle. Kaynağın konumları bu modelle geri çözülür: kenarlar (varsa
  yuvarlak cm / inç değeri), girintiler, LineSpacing, SpaceAbove. Alt kenar ve sayfa sonları (`_sayfala`): bütün sayfalarda son satır sığacak, dolu
  sayfalarda sonraki sayfanın ilk satırı sığmayacak tam sayı aranır; tutmayan dolu sayfa paragraf sonunda bitiyorsa oraya sayfa sonu.
- [x] **Üst / alt bilgi, resim, tablo, tarama**: sayfaların %60'ında aynı yerde aynı metin üst / alt bilgi (ilk sayfada yoksa `startPage="2"`); sayfa
  numarası ("n", "n/N", ön ek / son ekli) UDE'nin kendi numarası (`pageNumber-spec`; yazı tipi, boyutu, rengi numaranın kendisinden). Satır içi
  resimler ve kendi satırındaki resimler; sayfanın %85'ini kaplayan görsel ilk sayfada zemin resmi (antet; payları tam sayı: UDE ondalığı okuyamıyor).
  Yazıyla üst üste binen ya da yazı satırlarının yanında duran resim (imza, kaşe, doğrulama kodu) alınmaz: UDE'de resim yalnızca satır içinde
  durabiliyor; sonuçta sayısıyla söylenir. Sayfada en az üç yatay ve üç dikey çizgi varsa PyMuPDF find_tables; en az 2 × 2 çizgili tablo UDF tablosu
  (sütun genişlikleri, birleşik hücre, hücre girintisi; UDE tabloyu yazı alanının genişliğine yayıyor). Taranmış sayfa (yazı < 3 karakter, görsel ≥
  %50) yazı tanımayla satırlara; tanıyıcı yoksa sayfanın resmi, uyarı. Döndürülmüş yazı (filigran, kenar notu) alınmaz.
- [x] **UDF kuralları**: format 1.8, tek CDATA; "]]>" araya U+200B ile (UDE "]]>" içeren belgeyi açamıyor), BMP dışı karakter U+FFFD, XML'de geçersiz
  denetim karakterleri atılır; ofsetler UTF-16 birimi ve belge sırasıyla; `paperOrientation` 0 = yatay (prototipte 2 yazılıyordu); kâğıt UDE'nin
  kodlarından en yakını.
- [x] **Seçilmeyen yollar**: kendi UDF çizicimiz (Swing'in satır kırma kuralları, alanlar, tablolar, listeler baştan yazılmak zorunda kalırdı, birebir
  olmazdı; yalnızca UDE yokken yaklaşık çizim: aşağıda); yazıcı yolu birincil (45 belgenin 16'sını tümüyle resme çevirdi, bir belgede alt bilgi
  kırpıldı, 89 sn); iText'e derleme bağımlılığı (FontMapper arayüzü için Proxy yetti); UDE'nin kendi yazı tipi eşleyicisi (gömmüyor); belge başına
  ayrı JVM (ilk belge ~3 sn, oturumla sonrakiler 0,2–1,5 sn); resim tabanlı PDF → UDF (kullanıcı seçmedi); her sayfa sonuna sayfa sonu öğesi (araya
  yazı eklenince yarım boş sayfa); sayfa sınırında paragrafı bölmek (ilk parçanın son satırı iki yana yaslanmaz); yanında yazı duran resmi satır içine
  almak (yazıyı resmin yüksekliği kadar iterdi; çizgisiz tabloyla kurmak sonraki iş); find_tables'ı `contextlib.redirect_stdout` ile susturmak
  (sys.stdout süreç geneli, işçinin yanıtı kaybolurdu).
- [x] **Ölçüm** (gerçek belgelerin kopyaları, yalnızca sayılar; kopyalar silindi): kullanıcının örnek dilekçesi (4 sayfa) kendi "Yazdır → PDF"
  çıktısıyla: 149 satırın 149'u aynı yerde, fark en çok 0,08 pt, sözcük benzerliği 1,000, A4, yazı tipleri 17/17 gömülü, SMask yok (köprünün ilk
  sürümünde 145/149: sayfa numaraları şekildi); UDE'nin "PDF olarak kaydet"i: 623,6 × 841,9 pt, 0/13 gömülü, 4 SMask. 45 belgelik derlem (7 antetli,
  10 kenarları farklı, 12 tablolu, 4 düz XML, 6 resimli) 45/45, 17,6 sn, 154 sayfanın hepsi A4, 641/641 yazı tipi gömülü. İndirilenler'deki 317
  benzersiz UDF 316/317 (biri bozuk zip), 114 sn (belge başına ~0,36 sn). PDF → UDF → UDE'de PDF (yerleşim modelinin sınaması): 45 belgede UDE 45'ini
  açtı, sayfa sayısı aynı 45/45 (prototip 30), sıralı sözcük benzerliği ≥ 0,99 31 (23), ≥ 0,95 45 (38), ortalama 0,991 (0,975); 316 belgede UDE
  316'sını açtı, sayfa sayısı aynı 305, yazılı 312 belgenin sözcük torbası F1'i ≥ 0,99 304 (sıralı benzerliği düşük belgelerde fark okuma sırası: yan
  yana sütunlar, üst bilgi); PDF → UDF 316 belge 25,6 sn. Sentetik "Word benzeri" dilekçe: sayfa sayısı aynı, sözcük 0,998, sayfa numarası UDE'nin
  numarası, 9 × 3 tablo UDE'de 9 × 3 tablo; taranmış sayfa yazı tanımayla sözcük 0,987.
- [x] **Testler**: udf_donusum_testi (yeni; UDE ya da Java yoksa UDE gerektirenler "ATLANDI"; `--exe` paketli çekirdekle; `PDEFE_UDF_DERLEM` /
  `PDEFE_UDF_ORNEK` ile gerçek belgeler, yalnızca sayılar) 93/93, paketli 84/84: jar–kaynak tutarlılığı ve Java 8 bayt kodu, yansımadan başka erişim
  yok; 6 sentetik UDF'de sayfa boyu, gömülü yazı tipi, SMask, sol kenar, sayfa numarasının yazı olması ve yorumlu UDF (eski jar'la düşüyor), gri
  çerçeve yok, ön izleme, yazıcı yoluyla satır konumları ≤ 0,5 pt (0,08), açılamayan UDF yalnızca kendi öğesinde hata, iptal, zaman aşımı, UDE yokken
  anlaşılır neden; PDF → UDF'te yapı, sayfa numarası, kenarlar, "]]>", emoji, yatay, tablo, UDE'nin açması, taranmış sayfa, JSON kanalı (eski kodla
  düşüyor); `.uki` / `.sertifikadeposu` değişmedi. donustur_testi --hizli 105/105, guvenlik_testi 47/47, mac_cekirdek_testi 14/14, tanima_testi 61/61.
  `npx electron-builder --win --dir`: jar `resources/ude-kopru/` altında, paketli çekirdek onu ortam değişkeni olmadan buldu.

#### 0.2.6: Word ↔ PDF (madde 3)
- [x] **İstek ayrıntısı.** Word ↔ PDF gerçeğine olabildiğince yakın, Word → PDF çevrim içi dönüştürme hizmetleri kadar sağlıklı; UDF ↔ Word de (PDF
  üzerinden).
- [x] **Word → PDF** (core/islemler/word.py): Windows'ta Word'ün kendisi (`ExportAsFixedFormat`: baskı için iyileştir, bütün belge, belge içeriği,
  başlıklardan yer imi, etiketli PDF, gömülemeyen yazı tipi bit eşlem; PDF/A değil): Word belgesinin "gerçeği" Word'ün kendi dizgisi. `IncludeDocProps
  = False`: belgenin yazar adı, şirketi ve başlığı PDF'e geçmez (PDF'i UYAP'a ya da karşı tarafa gönderen kullanıcı bunu beklemez; sınamada yazar ve
  başlık boş).
- [x] **Kullanıcının Word'üne dokunmamak**: kayıt defterinden algılama (başlatmadan); ayrı STA iş parçacığında `CoCreateInstance(LOCAL_SERVER)`, her
  zaman yeni süreç, `GetActiveObject` hiç; süreç Caption'a verilen benzersiz etiketle `FindWindowW("OpusApp")` ile bulunur ve `KILL_ON_JOB_CLOSE` iş
  nesnesine bağlanır (bağlanamazsa belge Word'e verilmez); belge açılmadan önce `AutomationSecurity = 3` (makrolar kapalı), DisplayAlerts = 0, Visible
  = False, ScreenUpdating = False; `Options.*` değiştirilmez. Documents.Open: ConfirmConversions = False, salt okunur, AddToRecentFiles = False,
  uydurma parola, görünmez. Girdi önce geçici klasöre doğru uzantıyla kopyalanır (yalnızca içerik: Korumalı Görünüm açılmaz). Toplu işte tek Word
  örneği; 5 sn boş kalınca Quit (15 sn'de kapanmazsa iş nesnesiyle); kullanıcının Gezgin'den açtığı belge bizim örneğe düştüyse örnek kapatılmaz,
  ayarlar geri alınır, iş nesnesinden KILL_ON_JOB_CLOSE kaldırılır. Süre: başlatma 45 sn, belge 60 sn + sayfa başına 2 sn; iptal ve süre aşımında
  yalnızca bizim Word sürecimiz sonlandırılır. Parolalı .docx Word başlatılmadan reddedilir. Geç bağlama kendi `IDispatch.Invoke` sarmalayıcımızla:
  `comtypes.client` içe aktarılınca paketli uygulamada program klasörüne ya da %TEMP%'e önbellek klasörü yazıyor.
- [x] **Word yoksa LibreOffice** (`soffice --headless --convert-to pdf`, PDEfe'nin geçici profili, resimleri küçültmeyen süzgeç seçenekleri); macOS'ta
  Word otomasyonu yok: yalnızca LibreOffice; ikisi de yoksa yetenek kapalı ("Word ya da LibreOffice gerekir"). Bu bilgisayarda LibreOffice yok: yol
  sınanmadı. Arayüz sınaması için geliştirmede `PDEFE_WORD_YOK=1`.
- [x] **PDF → Word** (core/islemler/pdf_word.py, core/ucuncu/pdf2docx): pdf2docx 0.5.13 (MIT; LICENSE yanında; komut satırı ve tkinter arayüzü
  alınmadı; artık Artifex'in bakımında değil, kaynağın depoya alınmasını destekliyor). Değişiklikler kodda "PDEfe:" notuyla (liste
  core/ucuncu/__init__.py): opencv kaldırıldı (kontur ağacı satır koşularından birleşim-bul'la, sıra OpenCV'nin gezintisiyle aynı; gri ton cvtColor'ın
  tam sayı katsayıları; döndürme Pillow); `import fitz` → `import pymupdf as fitz` (fitz kısayolu içe aktarılınca standart çıktıya uyarı basıyor:
  çekirdeğin JSON kanalı); PyMuPDF sürüm denetimindeki SystemExit ve `logging.basicConfig` (kök günlükçü) kaldırıldı; PDF `filetype="pdf"` ile; print
  → günlükçü; yorumlardaki iki marka adı kaldırıldı. Akış Converter.convert'in aynısı ama adım adım: her sayfa adımı MuPDF kilidinin içinde, sayfa
  sayfa ilerleme ve iptal; hatalı sayfa atlanır (uyarı); taranmış sayfa resim olarak aktarılır ("metni Word'de düzenlenemez" uyarısı).
- [x] **Kök neden (yeni bulundu): Windows'ta numpy'nin OpenBLAS DLL'i** ilk yüklenişinde sürecin girdi tutamacını sorguluyor; ana iş parçacığı o
  borudan eş zamanlı okurken sorgu okuma bitene dek bekliyor: numpy dönüştürme iş parçacığında ilk kez yüklenince PDF → Word ana süreçten yeni satır
  gelene dek donuyordu (modül içi sınamada görünmez). SetStdHandle(NUL) işe yaramadı. Karar: `pdefe_core.main` girdiyi okumadan önce
  `pdf_word.onden_yukle()` OpenBLAS DLL'ini yükler, `OPENBLAS_NUM_THREADS=1`.
- [x] **Zincir**: Word → UDF = Word → PDF + PDF → UDF; UDF → Word = UDF → PDF + PDF → Word (çatının planı, ek kod yok).
- [x] **Paket**: .venv'e comtypes 1.4.17, python-docx 1.2.0, lxml 6.1.3, numpy 2.5.4; spec'te yeni modüller, `ucuncu` ve `docx` alt modülleri, docx
  şablonları (veri dosyası), comtypes (yalnızca Windows), numpy (dışlaması kalktı), cv2 dışlandı. `.github/workflows/yayim.yml`: Windows çekirdek
  işinin paket listesine python-docx, lxml, numpy, comtypes; Mac'inkine python-docx, lxml, numpy. THIRD_PARTY.md: pdf2docx (değiştirildiği notuyla),
  python-docx, lxml (libxml2, libxslt, zlib, iconv), numpy (OpenBLAS, libgfortran), comtypes; Word ve LibreOffice dağıtılmaz. Çekirdek klasörü 116,3
  MB; kurucuya etki tahmini ~+9,5 MB (LZMA), diskte ~+38 MB.
- [x] **Seçilmeyen yollar**: Word'ün kendi PDF açması (PDF Reflow) PDF → Word için (UYAP PDF'inde sayfaları resme çeviriyor, konumlu metinde
  sözcüklerin %19'unu kaybediyordu); pdf2docx'i opencv'yle almak (kurucuya ~+41 MB); PowerShell ile Word (iş nesnesi kurulamaz, PDEfe çökerse Word
  açık kalırdı); Word sürecini önce / sonra süreç farkından bulmak (aynı anda başka Word açılabilir; yalnızca tek yeni WINWORD varsa yedek);
  `comtypes.client.CreateObject` (önbellek klasörü yazımı); kontur için scipy.ndimage (+30 MB).
- [x] **Ölçüm**: Word → PDF (Word 16; sentetik 3 sayfalık docx / rtf / odt ve uzantısı .pdf olan docx): 3 → 3 sayfa, yazı tipleri gömülü, sözcük geri
  çağırma 1,00, 3 yer imi, etiketli, yazar / başlık yok; 4 belge tek Word örneğiyle 2,1 sn (Word'ün başlaması dâhil). Çekirdek öldürülünce boştaki
  Word 0,6 sn'de kapandı; 400 sayfalık belgede çevirme sırasında iptal 2,6 sn, yalnızca bizim Word'ümüz sonlandı, hedef ve geçici dosya yok. PDF →
  Word (keşif yöntemi: docx Word'le PDF'e, özgünle karşılaştırma): 13 PDF'te özgün pdf2docx ile PDEfe'ninki aynı docx'i verdi; döndürülmüş görselli
  PDF'te PDEfe daha doğru (90° ve 180° görselde ortalama piksel farkı özgünde 2,2 / 4,5, PDEfe'de 0,0). Kontur ağacı 400 rastgele görüntüde OpenCV 5.0
  findContours(RETR_TREE) ile düzey, kutu ve sıra birebir.
- [x] **Testler**: word_donusum_testi (yeni; Word yoksa Word denetimleri "ATLANDI") modül 75/76 (düşen: "Bölüm N" başlıklı belgenin Word → UDF → Word
  zinciri; düzeltme turunda giderildi), `--exe` 57/57; donustur_testi 105/105 ve --exe 91/91 (iki beklenti güncellendi), udf_donusum_testi 93/93,
  guvenlik_testi 47/47, tanima_testi 61/61, mac_cekirdek_testi 14/14.

#### 0.2.6: Dosya Formatını Değiştir'in penceresi, açma yolları, Ayarlar (madde 3)
- [x] **Araç** (`src/renderer/araclar/donustur.js`, komut `arac.donustur`): `ARACLAR`'da 6. karo (ad "Dosya Formatını Değiştir", açıklama "PDF ↔ UDF,
  Word, TIFF", ipucu uzun hâli, yeni renk turkuaz: açık #00766c, koyu #4fd1c5); açılış ekranı, Araçlar penceresi (3 + 3), Araçlar menüsü (Windows ve
  Mac aynı, Birleştir'in altında). Belge yokken boş listeyle açılır, Aç penceresi açılmaz; açık bir PDF varsa ilk girdi odur (Birleştir'deki gibi).
  Pencere Birleştir düzeninde, sekme şeridinin altında. Açıklama kısa tutuldu: "PDF, UDF, Word ve TIFF arasında dönüştürür" açılış ekranında kartı iki
  satıra indirip 91 px yapıyordu (ötekiler 74 px; acilis_hizasi'nin "PDF aç kartlardan yüksek" denetimi düştü); şimdi 75 px.
- [x] **Girdiler**: Dosya ekle (ilk süzgeç "Desteklenen dosyalar": pdf, udf, tif, tiff, doc, docx, rtf, odt; sonra türlerin süzgeçleri ve Tüm
  dosyalar; çoklu seçim), pencereye sürükle-bırak; aynı dosya ikinci kez eklenmez. Tür çekirdeğin `donusum_bilgi`'sinden (içerikten): tanınmayan dosya
  satırda "Dosyanın biçimi tanınmadı…" hatasıyla durur; uzantısı içeriğiyle uyuşmayan dosyada uyarı.
- [x] **Satır**: küçük resim (yoksa türün adı yer tutucuda: UDF kırmızı, Word mavi); ad (ipucunda yol); "TÜR · N sayfa · boyut"; Hedef bölümlü seçimi
  (PDF | UDF | Word | TIFF, kendi türü hariç; yapılamayan soluk, nedeni ipucunda; seçili hedef yapılamıyorsa satırda nedeni); ×; sağ tık (Klasörde
  göster / Finder'da göster, Listeden çıkar). UDF satırında UDE bulunamadıysa "UYAP Doküman Editörü'nün yerini göster" (ana sürecin klasör seçme
  penceresi). UDF'nin ön izlemesi (UDE ile, ilk belgede birkaç saniye) ikinci bir `donusum_bilgi { onizleme: true }` isteğiyle sonradan gelir: tür ve
  hedefler hemen görünür, Dönüştür ön izlemeyi beklemez.
- [x] **Varsayılan hedef**: o türün son seçilen hedefi (kalıcı: ayar `donusturme.hedefler`, `DURUM_ANAHTARLARI`'nda), ilk kez PDF girdide UDF,
  ötekilerde PDF; yapılamıyorsa sıradaki yapılabilen. **TIFF seçenekleri** yalnızca TIFF hedefli satır varken: Çözünürlük 200 / 300 dpi, Renk Siyah
  beyaz / Gri / Renkli; bütün TIFF hedeflerine; "Taranmış sayfalar kendi çözünürlüğünde kalır."; PDEfe açık kaldıkça hatırlanır, kalıcı değil.
- [x] **Kaydet** (`ortak.js` `kayitSecimi` genelleştirildi; öteki araçların davranışı değişmedi): `uzanti` parametresi, `uzantiAyarla` / `adAyarla` /
  `klasorKipi`; Değiştir'in süzgeci biçime göre (PDF belgesi, UDF belgesi, TIFF görüntüsü, Word belgesi); klasör kipinde ad kutusu gizli. Tek dosyada
  klasör + ad (girdinin adı + yeni uzantı, klasörde varsa "(2)"; hedef değişince uzantı değişir, elle yazılan ad kalır); birden çok dosyada yalnızca
  klasör, adlar girdilerin adı; var olan dosyanın, listedeki bir dosyanın ya da aynı istekteki başka bir hedefin adı "(2)", "(3)" alır. "Üzerine yaz"
  soluk: "Dönüştürülen dosya her zaman yeni dosya olarak kaydedilir." `hataSor` kilitli dosyanın adını uzantıdan bağımsız yakalar, örnek program
  dosyanın türüne göre ("UYAP Doküman Editörü'nde", "Word'de").
- [x] **Dönüştürme ve sonuç**: `bicim_donustur` IslemIlerleme ile (ilerleme ve İptal; Esc de iptal); dönüştürülemeyen satır varsa "N dosya
  dönüştürülemiyor. … Öteki dosyalar dönüştürülsün mü?" (Atla ve devam et | Vazgeç); listedeki PDF PDEfe'de kaydedilmemiş değişiklikle açıksa önce
  sorulur. Geç gelen iptalde (sonuç döndükten sonra) yeni oluşan dosyalar çöp kutusuna, onaylanıp üzerine yazılan dosya kalır, "İptal edilemeden
  tamamlandı" (Birleştir'deki kural); sürerken × "Dönüştürme sürüyor." (İptal et ve kapat | Sürdür). Tek çıktı PDF ise sekmede açılır, pencere
  kapanır, bildirimde ad, sayfa, boyut ve varsa çekirdeğin uyarısı (9 sn); öbür durumlarda pencerede sonuç listesi (Ayır'daki gibi; PDF'ler için Aç,
  Klasörde göster). Listeyi temizle, dosya ekleme, satır çıkarma ve hedef değiştirme sonuç listesini kaldırır.
- [x] **Ana süreç denetimi** (`guvenlik.js` `donusumParametreleri`; `main.js` cekirdek:cagir bu üç yöntemi her zaman denetler): `bicim_donustur`'da en
  çok 500 öğe, yol ve hedef dolu metin, `hedefBicim` bilinen biçim (`hasOwnProperty`; `__proto__` reddedilir), hedefin uzantısı biçimle eşleşmeli (pdf
  → .pdf, udf → .udf, tiff → .tif / .tiff, word → .docx); .bat / .cmd / .exe ve uyuşmazlık bütün isteği reddeder; seçeneklerde yalnızca dpi 200 | 300,
  renk sb | gri | renkli, kip otomatik | pdf | yazici. `kaydetDiyalog`: yazılan adın uzantısı süzgeçlerinkinden biri değilse ilk süzgecin uzantısı
  eklenir (önceden yalnızca PDF'te .pdf). Test örneğinde `kabuk:klasordeGoster` Gezgin'i açmaz.
- [x] **Şartnameden sapma: `udeYolu` ana sürecin ayarından** (gerekçe). Şartname "udeYolu null ya da var olan klasör, doğrulanır" diyordu. Çekirdek bu
  klasördeki Java'yı (UDE'nin `jre`'si) ve jar'ları çalıştırır; arayüzde kod çalışsa bile ana süreç program çalıştırmamalı (0.1.23'ün güvenlik
  kuralı). Bu yüzden arayüzün verdiği `udeYolu` yok sayılır, ana sürecin ayarındaki klasör (var olan klasörse; yoksa null: çekirdek kendisi arar)
  verilir; ayar yalnızca ana sürecin klasör seçme penceresinden yazılır (`ayar:udeKlasoruSec`: seçilen klasörde çekirdek UDE'yi bulursa; bulamazsa
  ayar değişmez, `{kaydedildi: false, neden}`), `ayar:koy` udeYolu'nu yalnızca null yapabilir (düzeltme turunda sıkılaştırıldı).
- [x] **Açma yolları**: komut satırı (Gezgin'de "Birlikte aç", PDEfe'nin simgesine bırakma, ikinci örnek), macOS `open-file`, ana pencereye
  sürükle-bırak, Ctrl+O / ⌘O ve açılış ekranının PDF aç'ı: .pdf sekmede (eskisi gibi); .udf, .tif, .tiff, .doc, .docx, .rtf, .odt aracı o dosyalarla
  açar, araç açıksa listesine ekler (`uygulama.js` `acilacaklariAyir` / `yollariAc`). Ctrl+O'nun süzgeci aracınkiyle aynı. Bırakma örtüsünün yazısı
  "PDF'i bırakın" → "Dosyaları bırakın". Windows dosya ilişkisi eklenmedi (.udf UDE'nin).
- [x] **Ayarlar › Kaydetme**: "Dosya Formatını Değiştir" başlığı altında "UYAP Doküman Editörü" kartı: Otomatik bul (ayarı temizler) / Klasörü seç…
  (ana sürecin penceresi; macOS'ta paketin içi gezilebilir: `treatPackageAsDirectory`); altında bulunan editörün yolu ve sürümü ("kendiliğinden
  bulundu", "seçtiğiniz klasör" ya da "seçtiğiniz klasörde bulunamadı, kendiliğinden bulundu"), Java'nın sürümü, bulunamazsa nedeni. Çıktı klasörü
  kartının açıklamasında yeni araç.
- [x] **Seçilmeyen yollar**: UDF / TIFF / Word'ü doğrudan sekmede açmak (her sekme diskteki bir PDF'e bağlı: kayıt, son açılanlar, taşıma; büyük
  değişiklik); satırdaki "yerini göster" bağlantısının Ayarlar'ı açması (araç penceresinin üstünde Ayarlar; doğrudan klasör seçimi aynı ana süreç
  yolu); bütün satırların hedefini birlikte değiştiren üst seçim (son seçimin hatırlanması aynı işi görüyor); TIFF seçeneklerini kalıcı hatırlamak
  (bir kez 300 dpi renkli seçilince sonraki UYAP yüklemeleri büyük dosya olurdu); Word'ün ön izlemesi; kapatırken "kaydedilmemiş iş" sorusu (listeyi
  yeniden kurmak ucuz; yalnızca süren dönüştürmede sorulur).
- [x] **Ölçüm**: UDE bu bilgisayarda bulundu (sürüm 5.4.20, Java 1.8.0_361). Açılış ekranı kartları: yeni kart 75,2 px, ötekiler 74,4 px (1280 ve 1920
  px); PDF aç 93,7 px.
- [x] **Testler**: senaryo37 (yeni; baslat.ps1; diyaloglar test kuyruğundan; girdiler `test/donustur_arayuz_uret.py`) 59/59 %100 (1280 × 1000) ve %125
  (1280 × 800); PDF → Word gerçek dönüşümü `$env:S37_WORD="1"` ile isteğe bağlı. Önceki kodda düşüyor: araçtan önceki commit'te hazırlıkta (modül
  yok), aracın commit'inde 8. bölüm 6/6 HATA (bırakma, Ctrl+O, komut satırı), açma yollarının commit'inde 9. bölüm (Ayarlar kartı yok). guvenlik_birim
  21 yeni durum (eski guvenlik.js'le 18'i düşüyor). mac_renderer 37/37, senaryo26 63/63, senaryo27 19/19, ortu_tiklama 164/164, kisayol_araclar
  102/102, arac_onizleme 24/24 üç ölçekte, acilis_hizasi 10/10, serit_olculeri 25/25, senaryo19 112/112 (görünmeyen masaüstü; "Altı araç"), gec_iptal
  20/20, senaryo22 101/101, kisayol_dosya 164/164, senaryo29 58/58.

#### 0.2.6: UYAP Doküman Editörü yokken UDF → PDF yaklaşık çizimle (madde 3)
- [x] **İstek / durum.** UDF → PDF'in birincil yolu UDE'nin kendi sayfalayıcısı; UDE (ya da çalıştığı Java, ya da köprü) yoksa da UDF
  dönüştürülebilsin: kullanıcının kendi Drive UDF Okuyucu motoruyla yaklaşık çizim, açık uyarıyla. UDE kurulu değilken `udf>pdf` (ve onun üzerinden
  `udf>tiff`, `udf>word`) hiç yapılamıyordu. Kullanım sınırında kesilen önceki deneme `guvenlik.js`'e içerik denetimini ve `src/udf-cizim/`'e motorun
  kopyasını bırakmıştı; ana süreç modülü, kanallar, araç bağlantısı, test ve lisans bildirimi yoktu.
- [x] **Mimari** (`src/main/udfYaklasik.js`): .udf'yi ana süreç kendisi okur ve denetler (`guvenlik.js` `udfDosyasiOku` / `udfIcerigiDenetle`: 40 MB
  dosya; zip'in merkezî dizini: en çok 1000 öğe, şifreli öğe yok, yalnızca saklama / deflate, tek content.xml, content.xml'in beyanı ≤ 20 MB, bütün
  öğelerin beyanı ≤ 64 MB; düz XML ≤ 20 MB); `dosya:oku` değişmedi. Gizli (show: false), yalıtılmış (sandbox), Node erişimi ve ön yükleme betiği
  olmayan, `disableDialogs`'lu pencere ayrı bellek içi oturumda `pdefe://udf-cizim/sayfa.html`'i yükler; o oturumun protokol işleyicisi yalnızca üç
  dosyayı verir (CSP üst bilgisiyle), izin isteği, indirme, pencere açma, gezinme reddedilir, `webRequest` yalnızca kendi dosyalarına ve blob:'a izin
  verir. Baytlar 3 MB'lık base64 dilimleriyle `executeJavaScript` üzerinden; sayfa (`cizim.js`) motorla DOM'u kurar, yalnızca sayılardan oluşan özet
  döner (belge metni ana sürece dönmez), `printToPDF({ preferCSSPageSize })`. Süre sınırları (yükleme 20 sn, çizim 60 sn + 6 sn/MB, PDF 120 sn), çökme
  / yanıt vermeme / iptal yarışında pencere her durumda yok edilir. Çizimler sırayla; dönüştürme bekleyen küçük resimlerin önüne geçer.
- [x] **Kanallar** (preload izin listesi + `guvenliIpc`; parametreler `guvenlik.js` `udfYaklasikParametreleri`): `udf:yaklasikBilgi {yol, genislik,
  istekId?}` (küçük resim: yaklaşık PDF'in ilk sayfası, ön bellekli), `udf:yaklasikDonustur {ogeler, istekId}` (ilerleme `udf:yaklasikIlerleme`),
  `udf:yaklasikIptal {istekId}`. **Şartnameden sapma** (gerekçe): önceki denemenin taslağı `udf:yaklasikCiz / Koy / Birak` ile geçici dosya yolunu
  arayüze veriyordu; geçici yol arayüze hiç verilmesin, ana süreç arayüzden gelen bir yolu "geçici" diye taşımasın diye çizim, zincirleme ve yerine
  koyma tek kanalda ana süreçte. Öğe denetimi `bicim_donustur`'unkiyle aynı; hedef biçim yalnızca pdf / tiff / word.
- [x] **Yazım düzeni**: önce bütün öğeler geçici PDF'e (%TEMP%\PDEfe; düzeltme turundan beri PDF hedefi için de), sonra TIFF / Word hedefleri
  çekirdeğin `bicim_donustur`'una (çağrı arayüzünkiler gibi denetlenir; çekirdek kendi hedeflerini yerine koyar), sonra PDF hedefleri hedefin yanına
  kopyalanıp aynı klasörde ad değiştirilerek. İptal yerine koymadan önce gelirse hiçbir dosya yok; çekirdek bitirdikten sonra gelirse onun yazdıkları
  sonuçta, PDF hedefleri yazılmaz. Kilitli / salt okunur hedef çizimden önce denetlenir. Bir günden eski geçici PDF'ler açılışta, canlı olanlar
  kapanışta silinir.
- [x] **Araç** (`donustur.js`): `yetenekler.udf.var === false` (editör, Java ya da köprü yok) iken UDF satırının PDF hedefi ve PDF → TIFF / Word
  yapılabiliyorsa TIFF / Word hedefi seçilebilir (satıra özgü neden — bozuk, güvensiz paket — varsa değil). Satırda uyarı rengiyle "UYAP Doküman
  Editörü bulunamadı; görünüm yaklaşık (satır ve sayfa kırılımları editördekinden farklı olabilir)." ve "UYAP Doküman Editörü'nün yerini göster";
  hedef düğmesinin ipucunda "görünüm yaklaşık"; küçük resim ve sayfa sayısı yaklaşık çizimden. Dönüştürme `_karmaDonustur`: çekirdek öğeleri
  `bicim_donustur`'a, yaklaşık öğeler ana sürece, tek ilerleme ve İptal. Editör bulunduğu hâlde çekirdek bir UDF'yi "desteklenmiyor" diye
  dönüştüremezse o öğe yaklaşık çizimle yeniden denenir. Sonuçta aynı uyarı + motorun notları (yorumlar alınmadı, e-imza taşınmaz, resim çizilemedi).
  **Uyarı metninde sapma** (gerekçe): görev "satır kırılımları UDE'den farklı olabilir" diyordu; kullanıcı "UDE" kısaltmasını bilmeyebilir ve sayfa
  kırılımları da farklı olabiliyor. Ayarlar'daki kartta editörle yapılamıyorsa "UDF'ler yine dönüştürülür: PDEfe'nin yaklaşık çizimiyle (…)".
- [x] **Motorun kopyası** (`src/udf-cizim/udf-motoru.js`, Drive UDF Okuyucu 0.3.2) iki yerde değişti ("PDEfe değişikliği" yorumları; LICENSE.txt ve
  THIRD_PARTY.md), ikisi de UDE'nin kendi çizimiyle ölçülerek: (1) yatay sayfada kenarlar Java'nın PageFormat'ı gibi döndürülür (pageFormat'taki
  kenarlar kâğıdın dikey hâline göre): önceden dört kenarı farklı yatay belgede yazı alanı ~56 pt kayıyordu, şimdi ±1,5 pt; (2) UYAP erişim satırı:
  `<webID>` taşıyan belgede UDE her sayfanın en altına "UYAP Bilişim Sistemindeki bu dokümana … adresinden <kimlik> ile erişebilirsiniz." basıyor (45
  gerçek belgenin 18'inde var; yaklaşık PDF'te eksikti); `@bottom-center` kenar kutusunda 7 pt. `sayfa.html`'de yazı aralığı (kerning) ve bitişik
  harfler kapalı (UDE'nin Java çizimi uygulamıyor): aynı satır oranı %83 → %89. Geliştirme sürümünde `PDEFE_UDE_YOK=1` UDE'yi bulunmamış sayar
  (paketli çekirdek okumaz).
- [x] **Seçilmeyen yollar**: geçici dosyayı arayüze veren `Koy` / `Birak` kanalları; baytları protokolden `fetch` ile vermek (CSP'de `connect-src`
  açmak gerekirdi); sayfayı ana oturumda `pdefe://app/` altında açmak (uygulamanın kökeniyle aynı köken; ayrı oturum seçildi); `file://` + `loadFile`;
  erişim satırını `position: fixed` öğeyle (Chromium yazdırırken kırpıyor, denendi) ya da `footerTemplate` ile basmak; UDE'nin görünmez filigranını
  taklit etmek (`documentproperties.xml` taşıyan belgede kişinin sicil numarası %2 saydamlıkla her sayfaya döşeniyor; görünüme etkisi yok, kişinin
  sicilini görünmez biçimde PDF'e gömmek istenmeyebilir); her belge için yeni pencere yerine pencereyi yeniden kullanmak (fark pencere başına ~0,2
  sn).
- [x] **Ölçüm** (UDE 5.4.20'nin köprü çizimiyle yaklaşık PDF; gerçek belgelerden yalnızca sayılar): sentetik 8 belgede sayfa sayısı 8/8 (77 sayfalık
  belge dâhil), sözcük benzerliği ortanca 1,000 (en düşük 0,9985), aynı satır oranı ortanca %100. İndirilenler'deki 350 UDF'den sabit tohumla seçilen
  45'inin kopyası (iş bitince silindi): sayfa sayısı aynı 41/45 (4'ünde son sayfaya 1–6 satır taşıyor), sözcük benzerliği ortanca 1,000, ≥ 0,99: 34, ≥
  0,95: 40 (değişikliklerden önce 26 / 35); aynı satır oranı ortanca %89,3 (önce %83,3); çok sayfalı ve sayfa sayısı aynı 16 belgede sayfaların ilk
  satırı aynı ortanca %100; 45 belge UDE 10,3 sn, yaklaşık 16,0 sn. Kalan farkın kaynağı satır yüksekliği: UDE Java'nın tam sayıya yuvarlanmış yazı
  tipi ölçüleriyle çiziyor (Times New Roman 11 pt → 13 pt), motor CSS satır yüksekliğiyle; uzun belgede birikip sayfa taşmasına yol açıyor.
- [x] **Testler** (görünmeyen masaüstü; electron yalnızca baslat_gizli.ps1 ile): udf_yaklasik (yeni, `$env:PDEFE_UDE_YOK="1"`; girdiler
  `test/udf_yaklasik_uret.py`, gerçek belge yok) 55/55: kanal (A4, yatay, kenarları farklı, alt bilgide sayfa numarası, erişim satırı, gömülü yazı
  tipleri, "]]>" ve betik / HTML yazısı yazı olarak ve betik çalışmadan, UDF → TIFF), kötü niyetli 10 belge (40 MB üstü, zip bombası, beyanı büyük,
  1500 öğe, iki içerik, dış varlık, milyar gülüş, parolalı, UDF olmayan, boş: her biri kendi koduyla, çıktı yok, ana süreç ve arayüz çökmedi,
  `test/hata_kutusu_say.ps1` ile iletişim kutusu 0, gizli sayfa ve geçici dosya kalmadı), iptal, küçük resim, araç. Altyapı commit'inin ağacında 5.
  bölüm 10 denetimde düşüp durdu; yatay kenar ve erişim satırı motor değişikliğinden önce tutmuyordu. guvenlik_birim 72/72 (37 yeni); senaryo37 54/54
  (8. bölüm hariç: ikinci örneği node'dan olağan masaüstünde başlatıyor, ekran kuralı gereği koşulmadı); mac_renderer 37/37, kisayol_araclar 102/102.

#### 0.2.6: bağımsız inceleme ve düzeltme turu
Her bulgu önce yeniden üretildi ya da kod izlendi; gerçekse önce düşen test, sonra düzeltme, sonra ilgili eski testler.
- [x] **`ayar:koy`'daki udeYolu koruması nesne anahtarıyla aşılıyordu** (kritik): arayüz `ayar:koy` kanalına `{ udeYolu: … }` nesnesi ya da
  `'udeYolu.x'` gibi noktalı yol verince koruma (`anahtar === 'udeYolu'`) atlanıyor, electron-store yazıyordu; çekirdek o klasördeki
  `jre\bin\java.exe`'yi çalıştırırdı. Karar: izin listesi (`guvenlik.js` `ayarYazimiDenetle`): anahtar metin, noktasız ve `VARSAYILANLAR`'ın kendi
  anahtarı; udeYolu yalnızca null; arayüzün yazdığı bütün anahtarlar VARSAYILANLAR'da, ana sürecin kendi yazdıkları (bekleyen güncelleme, son denetim
  zamanı, taşıma bayrakları) artık arayüzden yazılamaz; test örneği için `test:ayarKoy`. Seçilmeyen: kara liste (başka bir electron-store davranışı
  yine kapı bırakırdı).
- [x] **UDF zip bombası köprüde**: content.xml'i 900 bayt diye beyan eden, gerçekte 400 MB açılan .udf; Java'nın ZipInputStream'i öğeyi beyana
  bakmadan açıyor, Python'un zipfile'ı merkezî dizindeki boyut kadar: ikisi aynı dosyayı farklı görüyordu (OutOfMemoryError → yazıcı yolu → ikinci
  yükleme). Karar: zip UDF köprüye hiç verilmez; öğeler Python'la sınırlı açılıp geçici klasörde aynı adla yeniden paketlenir (`udf._kopru_girdisi`,
  dönüştürme ve ön izleme), iş bitince silinir; OutOfMemory içeren hata yazıcı yoluna geçirilmez. Bomba 0,8 sn'de "UYAP Doküman Editörü belgeyi
  açamadı"; olağan UDF'de kopya bayt bayt aynı. Seçilmeyen: köprüde öğe başına okuma sınırı (jar yeniden derlenir, UDE'nin kendi okuyucusunu korumaz).
- [x] **PDF → UDF: sayfa başındaki "Bölüm N" başlıkları sayfa numarası sanılıyordu**: rakamı her sayfada değişen satır üst bölgede de kabul ediliyor,
  numara her zaman alt bilgiye yazılıyordu; alt bilgi uzaklığı sayfanın tepesinden ölçülünce gövde alanı ters dönüyor, UDE yerleşimde takılıyordu (60
  sn'de yanıt vermedi). Karar: sayfa numarası yalnızca alt bölgede (sayfanın son %16'sı) ve alt bilgiden aranır; üstteki "Bölüm 1" ya da "Sayfa 2" üst
  bilgisi gövdede, kendi sayfasının başında kalır. Seçilmeyen: numarayı UDE'nin üst bilgisine koymak (UDE'nin sayfa numarası alanı yalnızca alt
  bilgide); "Bölüm" gibi sözcükleri kara listeye almak.
- [x] **PDF → UDF: yazısının hepsi tabloda olan belge** "çevrilecek yazı bulunamadı" diyordu (boşluk denetimi tabloları saymıyordu): denetime tablolar
  katıldı, gövde yoksa yazı alanı tabloların kutusu. **İki parçaya bölünen "]]>"** (ör. "a]]" düz + "> sonu" kalın) CDATA'yı kapatıyor, XML bozuluyor,
  sonuç yine başarılı görünüyordu: yazıcı havuzun son iki karakterini tutar, sınırda "]]>" oluşacaksa yeni parçanın başına sıfır genişlikli boşluk.
- [x] **Kaydet penceresinde seçilen "ad.tiff" "ad.tif" olarak yazılıyordu** (`ciktiSecici` seçilen addaki uzantıyı desenle silip aracın uzantısını
  ekliyordu): Değiştir'den dönen ad aynı biçimin öbür yazımıysa çıktının uzantısı o olur (kutuya elle yazılan ".tiff" eskisi gibi .tif'e döner). **Çok
  dosyada klasör değiştirilip tek dosyaya dönülünce ad başka girdinin adı kalıyordu**: klasör seçimi adı "elle" saymaz.
- [x] **Kopya sayfa özgünün önüne konunca notlar kopyaya geçiyordu**: notlar.js dosya notunu kaynağın ilk geçişine, `tarifHazirla` var olan girdiyi
  tarifteki ilk geçişe bağlıyordu. Karar: dosyadan gelen not ilk eşlendiği girdiyi kimliğiyle izler (`n.girdiKimlik`; anlık görüntüye ve kayıt
  karşılaştırmasına girmez, sekme taşınırken taşınan numarasıyla gider); Sayfaları düzenle'nin tarifi aynı sekme sayfasının en eski kartına (özgün;
  kopyalar büyük kimlikle doğar) girdinin kimliğini koyar. Kalan bilinen sınır: oturumda kopya sayfanın kendisi notsuz görünür (tam çözüm not
  katmanının çizim ve tıklama düzenini değiştirir, bu turda yapılmadı).
- [x] **macOS 13'te PDF → Word numpy'yi yükleyemeyebilirdi** (Mac'te çalıştırılamadı): numpy 2.5.4'ün cp312 tekerlekleri macosx_10_13_x86_64,
  11_0_arm64, 14_0_arm64, 14_0_x86_64; pip macOS 15 koşucusunda 14_0'ı seçer. Karar: iş akışında numpy `pip download --platform macosx_13_0_$(uname
  -m) --only-binary=:all:` ile; çekirdek derlendikten sonra `build/mac_minos_denetle.py core/dist/pdefe-core --en-cok 13.0`: 13.0'ı aşan Mach-O
  dosyası varsa adları yazılır, derleme durur. Seçilmeyen: MACOSX_DEPLOYMENT_TARGET (tekerlek seçimini etkilemez); denetimi yalnızca uyarı yapmak.
- [x] **Dönüştürme kanalları**: `dosya:sil` her yerdeki .udf / .tif / .tiff / .docx'i çöpe atabiliyordu: ana süreç bu oturumda `bicim_donustur`'un
  oluşturduğu, istekten önce var olmayan PDF dışı hedefleri kaydeder, `dosya:sil` PDF dışı dosyayı yalnızca bunlardan biriyse çöpe atar. Yapılmayan:
  var olan PDF dışı hedefin üzerine yazmayı ana süreçte onaya bağlamak (araç kendi penceresinde soruyor; ana süreç doğrulayamaz, ikinci bir Windows
  sorusu gerekirdi; aynı tehdit modelinde .pdf'in üzerine yazma 0.1.x'ten beri açık).
- [x] **Yaklaşık küçük resimler** sıraya girmeden belleğe okunuyor, araç kapanınca sürüyordu (eski kodda altı istek iptal edilemedi, araç kapanınca
  altı gizli çizim penceresi açıldı): dosya sırası gelince okunur, küçük resim de istek kimliği alır ve iptal edilir. **Yaklaşık PDF'in geçici dosyası
  hedef klasörde kalıyordu** (çizim sürerken 14 yoklamanın 9'unda): çizim %TEMP%\PDEfe'ye, yerine koyarken hedefin yanına kopyalanıp aynı klasörde ad
  değiştirme (kopya hedef klasörün izinlerini alır; %TEMP%'ten taşınan dosya paylaşılan klasörde başkasınca okunamayabilirdi).
- [x] **Çekirdek çökünce köprünün JVM'i sürüyor, hedefin yanında .pdefe-tmp kalıyordu**: Windows'ta JVM de Word'deki gibi `KILL_ON_JOB_CLOSE` iş
  nesnesine bağlanır; donustur.py hedef klasörlere açtığı her geçici dosyayı `<TEMP>/pdefe-donustur-kayit/<pid>.txt`'ye yazar, çekirdek açılışta pid'i
  çalışmayanların kayıttaki dosyalarını (yalnızca geçici dosya kalıbındakileri) siler; bağlamın geçici klasörü `pdefe-donustur-<pid>-*`, ölü
  pid'lerinki ve bir günden eskiler açılışta silinir (B3'ün açık konusu kapandı). macOS'ta iş nesnesi yok: yetim JVM o anki belgeyi bitirip çıkar.
- [x] **PDF → Word: kontur ağacı MuPDF kilidinin içinde saniyelerce sürüyordu** (20 × 30 ayrık daireli sayfa: dönüştürme 2,7 sn, işçinin kilit
  beklemesi 2,5 sn; her dış bölge için sayfa boyunda dizi): ağaç yalnızca bölgenin kırpığında (`bolge_agaci`; ağaç, kutular ve sıra aynı): 0,4 sn,
  kilit beklemesi 0,1 sn.
- [x] **Değerlendirilip değiştirilmeyenler**: ayardaki UDE klasörü geçersizse çekirdeğin kendiliğinden aramaya düşmesi (bilinçli: UDE güncellemesi
  yeni klasöre kurarsa dönüştürme sürer, Ayarlar "kendiliğinden bulundu" der; güvenlik açısından boş ayarla aynı); araç penceresi açıkken Düzen ›
  Kopyala'nın arkadaki seçili metni kopyalaması (panoyu boşaltmadan çözülemiyor; yalnızca menü fareyle seçilince); Word'de iptal ya da süre aşımında
  bizim görünmez Word sürecimizin bütünüyle öldürülmesi (o sırada kullanıcının Gezgin'den açtığı bir belgenin bu örneğe düşmesi olasılığı düşük;
  kullanıcının Word'üyle sınanmadı).
- [x] **Testler**: guvenlik_birim 77/77 (5 yeni; önce içe aktarma hatasıyla düştü), senaryo37 63/63 (3. bölümde gerçek kanalla nesne anahtarı /
  noktalı yol / bilinmeyen ayar; 5. bölümde .tiff ve klasör kipi, eski kodla 2 HATA; 7. bölümde dönüştürmenin oluşturmadığı dosyaların `dosya:sil`
  reddi), senaryo33 12/12, senaryo29 58/58, panel_ilk_acilis 10/10; udf_donusum_testi 120/120 (zip bombası, `bolumlu_pdf`, `yalniz_tablo_pdf`,
  `bolunmus_cdata_pdf`, yetim JVM: eski kodla düşüyor), donustur_testi 108/108, word_donusum_testi 80/80 (`test_bolge_agaci`: 360 rastgele bölgede
  eski yolla aynı); senaryo35 41/41 (5b: kopya öne konunca not özgünde; eski kodla HATA), senaryo22 101/101, kayit_sekme_panel 61/61, gec_iptal 20/20,
  kisayol_araclar 102/102, senaryo26; udf_yaklasik 58/58; mac_minos_testi 12/12 (Windows'ta üretilmiş Mach-O dosyalarıyla; iş akışı js-yaml ile
  ayrıştırıldı).

#### 0.2.6: belgeler
- [x] Sürüm 0.2.6 (package.json, package-lock.json); CHANGELOG; docs/DOGRULAMA.md 41; README: Öne çıkanlar, Açılış ekranı, Sekmeler, Metin seçme
  (Ctrl+A), Notlar (yazı kutusu kopyala-yapıştır), Araçlar (Sayfaları düzenle'de kopyalama, Dosya Formatını Değiştir ve gereksinimleri), Yazdırma,
  Ayarlar, Verileriniz; ekran görüntüleri yenilendi (araç çubuğunda Yazdır, sekmeler ".pdf"siz, yeni yazdırma penceresi, Sayfaları düzenle'nin dört
  düğmeli kartı, altı araç), yeni `docs/ekran-donustur.png` (sentetik girdilerle).
- [x] **Ekran görüntüleri** (`README_OLCEK=2`, temiz veri klasörü, kurgusal yazar adı, belgeler `C:\Users\Public\Documents\PDEfe Örnek`'te;
  hepsine tek tek bakıldı): `test/readme_ornek_uret.py` Dosya Formatını Değiştir için kurgusal UDF, taranmış evrak (dilekçenin sayfaları 200 dpi
  siyah beyaz TIFF) ve Word belgesi de üretir (sınamaların üreticileriyle); `test/readme_goruntuleri.mjs` aracı açık dilekçe ve bu üç dosyayla
  çeker (UDF'nin küçük resmi UYAP Doküman Editörü'yle), Sayfaları düzenle'de fare ikinci kartın üstünde (dört düğme görünür). Yazdırma
  penceresinin ön izlemesi açılıştaki ekran ölçeğinde istendiği için iki kat görüntüde bulanıktı: çekim sırasında sayfa değiştirilip geri
  gelinerek yeni ölçekte yeniden istenir. Kısayollar listesi uzadığından 1280 × 800'de alt satırlar kesiliyordu: bu görüntü 1280 × 900
  pencerede çekildi. geri-al ve kaydedilmemis iki kat piksel olduğu için README'de genişlikleri yazıldı. Bilinen: yazı kutusu görüntüsünde
  kutu dilekçenin başlığının üstüne biniyor (0.2.5'teki görüntüde de); Birleştir'de önerilen ad "Birleştirilmiş (2)" (görüntünün çekildiği
  bilgisayarın Masaüstü'nde aynı adlı dosya var).
- [ ] **Açık konular**:
  - Gerçek yazıcı (ofisteki yazıcı: kâğıt ve tepsi, çift taraflının yönü, harmansız kopya, Yazıcı tercihleri), "Çıktıyı Farklı Kaydet" penceresinin
    gerçek ekranda PDEfe'nin önünde açılması, gerçek sistem panosu (Ctrl+A kopyası, yazı kutusu iki pencere arasında ve Word'e; Chromium'un iptal
    edilen copy olayında panoyu boşalttığı varsayımı), kullanıcının açık Word'ü ve UDE'siyle birlikte kullanım, kurulu (paketli) sürüm denenmedi:
    DOGRULAMA 41.
  - Gerçek Mac'te hiçbiri denenmedi (yalnızca mac_renderer'ın darwin çerçevesi): yazıcı listesi ve varsayılan yazıcı, Yazıcı ayarları, sessiz yazdırma
    (Mac'te yazıcı durumu okunmuyor); ⌘A / ⌘C / ⌘V; open-file ile UDF / TIFF / Word; UDE'nin jar klasörü ve Java'nın bulunması (CI'da UDE yok, testler
    atlar); yaklaşık çizim; PDF → Word'ün macOS 13'te açılması. Kurucu ve Mac paketi derlenmedi, CI koşulmadı (gönderme yok): ilk Mac derlemesinde
    numpy tekerleğinin adı ve `mac_minos_denetle` günlüğüne bakılmalı.
  - Yazdırma: /Rotate 90'lı dikey sayfa kâğıtta ters çıkar (0.1.x'ten beri; ön izleme gösteriyor), yön kuralını değiştirmek ayrı karar. Yazdırma
    penceresi açıkken pencere başka ölçekli bir ekrana taşınırsa ön izleme yeniden istenmez (sayfa değiştirilene dek bulanık kalabilir;
    README görüntüsü çekilirken görüldü).
  - Ctrl+A: çapa sayfasının tanınan sözcükleri bütün belge seçiliyken katmana sonradan eklenmiyor (kopyaya giriyor, ekranda boyanmamış görünebilir);
    çok büyük belgede temizMetin hazırlığın sonunda bir kez eş zamanlı (10 MB'ta ~0,9 sn); Ctrl+A anında hazırlık kopyalanmasa da başlıyor (TTK'da ~5
    sn çekirdek işi); tanıyıcı yokken yolu test örneğinde sınanamadı.
  - Sayfaları düzenle: "Üzerine yaz"dan sonra açık sekmede kopya sayfanın notları belge yeniden açılana dek görünmez (dosyada var); tam çözüm not
    katmanının kopyalara salt okunur yansı çizmesi (C seçeneği). Düzen menüsündeki Kopyala fareyle seçilirse sayfaları kopyalamaz (yalnızca tuşlar).
  - Yazı kutusu: biçimi okunmadan (seçimle aynı anda) kopyalanan başka program yazısı başka PDEfe penceresinde varsayılan biçimle yapıştırılır; sağ
    tık › Yapıştır başka pencerede kopyalanan kutu için soluk (Ctrl+V çalışır); açıklama çizgili (callout) yazının çizgisi kopyalanmaz; test örneğinde
    `pano:oku` sistem panosunu okumadığı için eski `test/senaryo3.mjs` boş metin görür.
  - TIFF: etiketsiz A5 ya da Letter tarama A4 sayılır; 72 dpi etiketli büyük TIFF (fotoğraf) büyük sayfa olur; JPEG sıkıştırmalı renkli TIFF kayıpsız
    PNG yoluyla gömülür (PDF TIFF'ten büyük çıkabilir); Birleştir'de çok sayfalı TIFF öğesinin içinde ilerleme ve iptal yok, dört düzeyli boyut
    tahmini 150 sayfada hâlâ ~18 sn.
  - UDF → PDF: UDE güncellenip sınıf ya da yöntem imzaları değişirse "desteklenmiyor" (araç yaklaşık çizimle yeniden dener; iText yoksa Windows'ta
    yazıcı yedeği); UDE'nin günlüğüne bazı belgelerde IllegalStateException yazılıyor (çıktı tam); ilk belge ~3 sn, boştaki JVM 45 sn açık kalır
    (~150–250 MB).
  - PDF → UDF: yanında yazı duran resim (imza bloğu) alınmıyor (çizgisiz tabloyla kurmak sonraki iş); tablo UDE'de yazı alanına yayılıyor; filigran
    alınmıyor; ilk sayfası tabloyla başlayan belgede üst kenar ilk paragraftan; Word'ün 13,8 pt satır adımı UDE'de 14 olur (uzun belgede birkaç satır
    kayabilir); Word'den gelen PDF'lerle ölçüm yalnızca sentetik belgelerle (Word benzeri PDF'ler ve Word'ün dışa aktardığı sentetik docx'ler)
    yapıldı.
  - Yaklaşık çizim: paketli sürümde (app.asar içinden `pdefe://udf-cizim/`) denenmedi; satır yüksekliği farkı (45 belgenin 4'ünde bir sayfa fazla);
    erişim satırı tek yazı tipiyle (UDE kimliği 10 pt Consolas'la basıyor); yatay sayfa kenarı ve erişim satırı düzeltmeleri kullanıcının Drive UDF
    Okuyucu eklentisinde de yok (o depoya dokunulmadı).
  - Word: LibreOffice yolu sınanmadı (süreci iş nesnesine bağlanmıyor, PDEfe çökerse açık kalabilir; PDF'e belge özellikleri geçebilir); .docm
    makrosunun çalışmadığı makrolu belgeyle sınanmadı (Word'de VBA erişim güveni ayarını değiştirmek gerekirdi; yerine AutomationSecurity'nin belge
    açılmadan 3 olduğu okundu); izlenen değişiklikli ve yorumlu belgede sonuç denetlenmedi.
  - Dönüştürme kanalları: var olan PDF dışı hedefin üzerine yazmayı ana süreç onaya bağlamıyor (araç soruyor).
  - (Çözüldü, kullanıcı kararı: "6 tanesi toplam iki satır olsun, 2 2 2 şeklinde; hafif büyüt butonlarını; son açılanları da 2 2 2'nin
    toplam uzunluğuna uydur, hafif daralabilir") Açılış ekranında araçlar artık her genişlikte üç sütun × iki satır (alan 600 px'ten darsa iki,
    400 px'ten darsa tek sütun; container query). Sütun 1100 → 820 px; son açılanlar aynı sütunda, aynı genişlikte. Karolar: iç boşluk
    10/12 → 13/15 px, simge kutusu 38 → 42, simge 24 → 26, ad 13 → 14 px, açıklama 12 → 12,5 px. PDF aç yine iki sütun kaplar, sağ kenarı
    Sayfaları düzenle'nin sağ kenarında (acilis_hizasi). İki satır ve büyük karolarla 1280×700'de 10 belgeyle 62 px taşıyordu: alçak pencerede
    (≤ 860 px) bölümler arası 12 → 8, başlık–kutu 8 → 6, karoların üst / alt iç boşluğu 9 px, son açılan satırı 46 → 38 px; senaryo20 52/52.
    Beklentisi eski üç test güncellendi: senaryo13 (6 karo, 3 + 3 klavye yolu), senaryo14 (6 araç, Kaydetme'de UYAP Doküman Editörü kartı),
    paket_duman (0.2.4'ten beri imza "Sürüm X · ").
  - senaryo37'nin 8. bölümü ikinci örneği olağan masaüstünde başlatıyor: ekran kuralı gereği koşulmadı; görünmeyen masaüstüne taşınmalı.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 41.

### Revizyon 0.2.7 (2026-10-15 – 10-16, kullanıcı istekleri: araç adları; Birleştir'e UDF ve Word; Format Değiştir'de görüntü ↔ PDF; antetli UDF; yazdırma ve sonuç düğmeleri; "zaten var" sorusunda yeni ad; araç açıkken yeni pencere; sekme sürükleme; kısayol simgeleri)
Ayrıntı: CHANGELOG.md. Kullanıcının 14 maddelik isteği (bir Word belgesi ve dört ekran görüntüsü; özet): (1) yazdırma penceresinde düğmeler
boyutta ve yerde uyumsuz; (2) "Görüntü PDF Birleştir"in adı "Birleştir" olsun, görüntülerin yanında UDF, Word ve TIF bırakılınca da doğrudan tek
birleşik PDF çıksın, açıklaması ona göre; (3) "Dosya formatını değiştirin"in adı "Format Değiştir" olsun, kapsamı görüntüleri de PDF'e alacak
biçimde genişlesin (soruldu, kullanıcı iki yönü seçti: görüntü → PDF, ve PDF üzerinden UDF / Word / TIFF; PDF → her sayfa ayrı JPG); (4)
"sadece antetli" UDF'ler PDF'e boş çıkıyor (örnekler Masaüstü'nde); (5) dönüştürmeden sonra yeni bir şey eklenmedikçe ya da bir ayar
değişmedikçe Dönüştür yeniden etkin olmasın; (6) tek sonuçta yazılar ve düğme ortalı; (7) çok sonuçta Aç düğmeleri sabit yerde, kilobayt ve
sayfa bilgisi gereksiz; (8) TIFF çözünürlüğü "İdeal" / "Düşük" olsun, 300 dpi standart, yanlarında Birleştir'deki gibi yaklaşık MB (karar: İdeal
300, Düşük 200 dpi, UYAP'ın kendi TIFF'leri gibi); (9) "Belgedeki e-imza PDF'e taşınmaz" uyarısı kalksın; (10) kalitesi düşebilecek
dönüştürmede satırın altında uyarı ("UDF seçiliyken Word'e tıklandığı anda", "TIF → Word"); (11) araç penceresi açıkken açılan belge arkada
açılıyor, yeni pencerede açılsın; (12) "zaten var" sorusunda "yeni belge olarak da kaydet" seçeneği, yeni belge "(1)" ekiyle; (13) şeritten
çıkarılan sekmenin küçük penceresi kasıyor, daha akışkan olsun; (14) kısayol simgelerinde sağ alttaki küçük ok yerine ortada yeşil ok çıkıyor,
PDEfe'den mi? Gönderme, etiket ve sürüm yayımı yok: bu revizyon yalnızca yerel commit'ler (0.2.6 da asıl depoya gönderilmedi).
Düzen: dört grup aynı çalışma ağacında: çekirdek (madde 2, 3, 4, 8, 9, 10 ve 12'nin çekirdek tarafı), kısayol araştırması (madde 14, salt
okunur), çekirdekten bağımsız arayüz (madde 1, 2 ve 3'ün adları, 5, 6–7, 11, 12, 13), çekirdeğe bağlı arayüz (madde 2, 3, 8, 9, 10 ve ana
sürecin güvenlik denetimleri); sonra bağımsız inceleme ve düzeltme turu; belgeler. Her madde ayrı commit'ler, önce düşen testlerle. Gerçek
belgeler yalnızca kopyalarıyla (scratch, nötr adlarla) ve yalnızca sayılarıyla kullanıldı; kopyalar iş bitince silindi. Electron yalnızca ekran
dışındaki (`test/baslat.ps1`) ya da görünmeyen masaüstündeki (`test/baslat_gizli.ps1`) örnekte başlatıldı; kullanıcının açık PDEfe'sine,
Word'üne ve UYAP Doküman Editörü'ne dokunulmadı.

#### 0.2.7: araç adları "Birleştir" ve "Format Değiştir" (madde 2 ve 3)
- [x] **Karar** (aracPenceresi.js ARACLAR, menu.js araclarMenusu, araç pencerelerinin başlıkları, ayarlarPenceresi.js, Kısayollar listesi): Araçlar
  penceresi ve açılış ekranının karoları, Araçlar menüsü (Windows ve Mac aynı), pencere başlıkları, Ayarlar › Kaydetme (çıktı klasörünün
  açıklaması, "Format Değiştir" başlığı), `F1` / Ayarlar › Kısayollar'ın bölüm başlığı. Birleştir'in karo açıklaması "Dosyaları tek PDF'te
  birleştirir" (eski "Dosyalardan tek PDF oluşturur" kadar kısa: karo tek satır kalır), ipucu "PDF, görüntü, UDF, Word ve TIFF dosyalarını
  birleştirerek tek bir PDF oluşturur"; menüde de öbür araçlar gibi yalnızca kısa ad (önceden "Görüntü / PDF belgeleri birleştirerek PDF
  oluştur"). Format Değiştir'in açıklaması "PDF ↔ UDF, Word, TIFF, JPG" (madde 3'ün JPG hedefiyle).
- [x] **Değişmeyenler**: komut kimlikleri (`arac.gorselBirlestir`, `arac.donustur`), dosya adları ve CSS sınıfları; kod yorumlarındaki eski adlar
  (0.2.6 geçmişi).
- [x] **Ölçüm**: açılış ekranı 1280 px'te karolar 267 × 84 / 267 × 70 px (birinci satır "Sayfaları düzenle"nin iki satırlık açıklaması yüzünden 84,
  değişmedi); Araçlar penceresinde 200 × 130 / 200 × 114; yeni açıklama tek satır.
- [x] **Testler**: adları denetleyen 17 test dosyası yeni adlara çevrildi; senaryo37 1. bölüm 8/8.

#### 0.2.7: yazdırma penceresinin düğmeleri (madde 1)
- [x] **Ölçüm ve kök neden** (önce, koyu tema, %100): Yazdır 67 × 33 px, üst kenarı 692,5; Vazgeç 70 × 31, üst kenarı 687,5; bağlantının ortası 703,
  Yazdır'ın ortası 709. Genel `button.birincil` kuralı (margin-top 12 px, iç boşluk 8 / 16, kenarsız) yazdırma penceresinde geçersiz kılınmamıştı;
  mesaj kutusu kendi kuralıyla (en az 88 px, 6 / 16, 1 px kenar) düzeltiyordu, `.diyalog` pencereleri değil.
- [x] **Karar** (stil.css): `.diyalog .dugmeler button.birincil / ikincil` için mesaj kutusunun düzeni; bütün `.diyalog` pencerelerine uygulanır
  (yazdırma, yazdırma ilerlemesi, parola sorusu, Kısayollar'ın Tamam'ı): aynı sorun parola sorusunda da vardı (orada yalnızca üst boşluk elle
  sıfırlanmıştı). Ön izleme gezinmesi (◀ n / N ▶ ve "N sayfa") ölçüldü, zaten ortalı (ok aralıkları 10 / 10 px); değişmedi.
- [x] **Seçilmeyen yol**: yalnızca yazdırma penceresine özel kural (parola sorusunda sorun kalırdı).
- [x] **Testler**: senaryo38 1. bölüm: açık / koyu tema, %100 ve %125 (19 + 19 denetim); eski CSS ile 10 denetim düşüyordu.

#### 0.2.7: yalnızca antetli UDF'ler boş PDF'e dönüşüyordu (madde 4)
- [x] **Yeniden üretme**: Masaüstü'ndeki 1.448 baytlık boş PDF'lerin kaynakları (antetli UDF'ler, Masaüstü ve İndirilenler; 7 kopya): üçü her
  zaman 1.448 baytlık PDF verdi (antet bölgesinde koyu piksel 0; köprünün Java2D çiziminde, yani UDE'nin yazdırma yolunda 2.246), ikisinde antet
  kısmen görünüyordu (koyu piksel 715 / 1.674: yalnızca en koyu renk). PDF'teki resim `/CCITTFaxDecode`, 1256 × 132, 41 bayt, bütünüyle beyaz.
- [x] **Kök neden**: antetler 4 bitlik paletli PNG (12 ya da 6 gri ton). Java'nın ImageIO'su 1, 2 ve 4 bitlik paletli PNG'yi `TYPE_BYTE_BINARY`
  okuyor; UDE'nin PDF kitaplığı iText 2.1.7 `Image.getInstance(java.awt.Image, Color)` böyle bir resmi her zaman 1 bitlik siyah beyaza çeviriyor
  (`forceBW`) ve pikselin beyaz olacağına `(rgb & 0x888) != 0` ile karar veriyor: 93, 110, 127 grisi beyaza düşüyor. Boş gövde, üst bilgi,
  arka plan resmi, kırpma ilgisiz: gövdesi dolu belgede de antet kayboluyordu (kullanıcı antetsiz belgede görmediği için "sadece antetli" dedi).
  8 bitlik paletli ve RGB antetler etkilenmiyordu.
- [x] **Karar** (core/ude_kopru): köprünün iText'e çizdiren sarmalayıcısı (`MetinGrafik`) bütün `drawImage` / `drawRenderedImage` çağrılarında
  `TYPE_BYTE_BINARY` olan ve paletinde siyah ve beyazdan başka renk bulunan resmi aynı boyda `TYPE_INT_RGB` (saydamsa ARGB) kopyaya çevirir;
  kopya özgün resme `WeakHashMap` ile bağlı (üst bilgide her sayfada aynı nesne, bir kez çevrilir). iText onu kayıpsız Flate yazar. Yalnızca siyah
  beyaz 1 bitlik resim olduğu gibi kalır (G4 küçük ve doğru). jar yeniden derlendi (`--release 8`).
- [x] **Seçilmeyen yollar**: content.xml'deki resmi önceden 8 bit RGB PNG'ye çevirmek (UDE'nin belge modelini değiştirir, yalnızca imageData /
  bgImageData'yı kapsar, iText'e başka yoldan gelen resmi kapsamaz); Python'da (Pillow) yeniden kodlamak (aynı nedenler); yazıcı yoluna geçmek
  (bazı belgeleri resme çeviriyor).
- [x] **Ölçüm**: aynı antetin RGB ve 4 bit paletli UDF'lerinin PDF'leri arasında 150 dpi'de ortalama renk farkı 0,13 / 255 (önce 3,8); boş çıkan
  üç belge 1.448 → 20.453 bayt, antet bölgesinde koyu piksel 0 → 935 (RGB kopyası 944); 6 renkli antet 715 → 848, filtre CCITT → Flate.
- [x] **Yaklaşık çizim** (UDE yokken, src/udf-cizim): Chromium paletli PNG'yi doğru çiziyor; 4 bitlik paletli antetli, gövdesi boş UDF RGB
  kopyasıyla birebir (antet bölgesinde koyu piksel 27.039 / 27.039, ortalama fark 0).
- [x] **Testler**: udf_donusum_testi `test_paletli_antet` (kurgusal 4 bitlik paletli antet, gövdesi boş; aynı antetin RGB kopyası; siyah beyaz 1
  bitlik antet): eski jar'la 3/6 HATA, yeni jar'la 6/6; udf_yaklasik 1. bölüm 23/23.

#### 0.2.7: e-imza uyarısı (madde 9)
- [x] **Karar**: udf.py'de iki uyarı kalktı: `_udf_pdf` sonucundaki "Belgedeki e-imza PDF'e taşınmaz." ve satır bilgisinin "Belge e-imzalı; imza
  dönüştürülen dosyaya taşınmaz."; bilgi alanı `imzali` duruyor. Zincirler (UDF → TIFF / Word / JPG) aynı dönüştürücüden geçtiği için onlarda da
  yok. UDE yokken yaklaşık çizimin kendi özeti (`udfYaklasik.js` ozetUyarisi) de artık söylemiyor. Öteki uyarılar (yorumlar alınmadı, yazıcı yolu,
  resim çizilemedi) değişmedi.
- [x] **Testler**: udf_donusum_testi `test_imza_uyarisi` (kurgusal imzalı UDF, `sign.sgn`): eski kodla 0/2, yeni 2/2; udf_yaklasik 1. bölümde imzalı
  belge (eski kodla HATA).

#### 0.2.7: Format Değiştir'de görüntü ↔ PDF ve JPG hedefi (madde 3)
- [x] **Tür** (core/islemler/donustur.py): `tur_bul` görüntüyü içerikten tanır (`_gorsel_imzasi`): tür `gorsel`, alt tür jpeg | png | gif | bmp |
  webp | avif | heif. TIFF ayrı tür kaldı. BMP'de "BM"den sonra bilgi başlığının boyutuna da bakılır ("BM" ile başlayan düz metin görüntü
  sayılmaz); HEIF / AVIF ISO BMFF `ftyp` markalarından. Pakette HEIC açıcısı (pillow-heif) yok: HEIC'in hedefleri yapılamaz, nedeni satırda.
- [x] **Görüntü → PDF** (`_gorsel_pdf`): tek sayfa, görüntü sayfayı kenardan kenara kaplar. Sayfa ölçüsü (`gorsel_sayfa_olcusu`): dpi etiketi 100–1200
  ise o (72 ve 96 fotoğraf makinesinin ve ekran görüntüsünün varsayılanı, sayılmaz); değilse TIFF'in A4 kuralı (`tiff_dpi_coz`: uzun kenar A4'ün
  uzun kenarı, standart değere %3 yakınsa ona; 50 dpi'den az çıkarsa 72 dpi). EXIF yönü uygulanır. Gömme: dokunulmadan gömülebilen JPEG'in
  baytları olduğu gibi, yön PDF'te döndürülür (Birleştir'in kuralı); öteki kayıplı kaynak (kayıplı WEBP, AVIF, CMYK ya da aynalı JPEG) JPEG kalite
  92; kayıpsız kaynak PNG. Hareketli GIF / WEBP'de ilk kare, uyarıyla. Görüntü → UDF / Word / TIFF çatının zinciriyle (PDF üzerinden): UDF'te
  yazı tanımayla satırlar (0.2.6 kuralı); Word'de (pdf2docx) görüntü resim olarak geçer, yazı tanıma yok.
- [x] **PDF → JPG** (`_pdf_gorsel`; hedef biçim `gorsel`): sayfa başına JPEG kalite 90, dpi etiketli, notlar dâhil; İdeal 300 / Düşük 200 dpi
  (varsayılan 300). Tek görselden oluşan (taranmış) sayfa seçilenden düşük çözünürlükteyse kendi çözünürlüğünde (büyütmek yalnızca dosyayı
  büyütür); seçilenden yüksekse seçilene küçültülür (TIFF'ten farkı: kullanıcı boyut seçiyor). UDF / Word / TIFF → JPG zincirle.
- [x] **Çok dosyalı hedefin çatısı**: dönüştürücü geçici klasöre (`<hedef>.<pid>-<sıra>.pdefe-tmp`, çökme kaydında) 1.jpg, 2.jpg… yazar; yerine
  koyarken adlar (`sayfa_adlari`): tek sayfada hedefin kendisi, çok sayfada "<ad> - Sayfa n.jpg" (Ayır'ın deyişi). Önce bütün sayfa dosyalarının
  yazılabilirliği denetlenir (biri kilitliyse hiçbiri değişmez). Sonuçta `hedefler` (bütün dosyalar), `boyut` toplam.
- [x] **Çakışma** (madde 12'nin çekirdek tarafı): öğede `cakisma: 'uzerineYaz'` (varsayılan) | `'yeniAd'`; yeniAd'da hedef (JPG'de sayfa
  dosyalarından biri) varsa ilk boş "(1)", "(2)"… (`bos_ad`; ad "(n)" ile bitiyorsa n + 1'den, yalnızca 1–3 basamak: "Rapor (2023)" yıl), JPG'de
  bütün sayfalar aynı kökte. Ad yerine koyma anında seçilir; sonuçta `hedef` yazılan ad, `istenenHedef` istenen ad (değiştiyse).
- [x] **Arayüz** (src/renderer/araclar/donustur.js): Dosya ekle süzgecine JPG, JPEG, PNG, BMP, GIF, WEBP ("Görüntüler" süzgeci); ana pencereye
  bırakma, `Ctrl+O`, "Birlikte aç" / Finder (main.js ACILAN_UZANTILAR) görüntüyü Format Değiştir'e verir (0.2.6'nın "PDF dışı belge Format
  Değiştir'i açar" kuralı; Birleştir'e değil). HEIC / HEIF / AVIF süzgeçte yok ama bırakılırsa satır nedeni söyler. Satırda tür "Görüntü (JPG)",
  özet "2.480 × 3.508 piksel · 270 KB", hedefler PDF | UDF | Word | TIFF, varsayılan PDF. JPG hedefi BICIMLER'in sonunda "JPG": tek girdide ad
  kutusu kalır, ad dosyaların ortak başı (Ayır'ın düzeni, "(2)" eklenmez), altında not (tek sayfada "Görüntü "X.jpg" adıyla kaydedilir.", çok
  sayfada "Her sayfa ayrı bir JPG dosyası olur: …"). Seçenekler TIFF ya da JPG hedefi varken ("TIFF seçenekleri" / "JPG seçenekleri" / "TIFF ve
  JPG seçenekleri"; renk yalnızca TIFF'te). Sonuçta oluşan her dosya bir satır, başlık "Dosya dönüştürüldü · 2 görüntü dosyası"; Klasörde göster
  ilk dosyayı seçer; geç iptalde bütün sayfa dosyaları çöpe (var olup üzerine yazılanlar kalır). Kaydetme süzgeci "JPG görüntüsü"; kilitli dosya
  sorusunda "bir görüntü programında".
- [x] **Ana süreç** (guvenlik.js, main.js, udfYaklasik.js): `HEDEF_UZANTILARI.gorsel` (.jpg, .jpeg); `donusumOgesi` `cakisma`'yı geçirir (başka değer
  bütün isteği reddeder); `dosya:sil`'in "bu oturumda oluşturulan PDF dışı dosyalar" kaydı artık sonuçtan: istekten önce hedef klasörlerindeki
  PDF dışı dosyalar okunur, sonuçtaki `hedef` / `hedefler`'den önceden olmayanlar kaydedilir (sayfa dosyaları ve "(1)" adı ancak sonuçta belli).
  UDE yokken UDF → JPG yaklaşık çizimin zincirinde.
- [x] **Şartnameden sapma** (gerekçeli): hedefin adı "Görüntü" değil "JPG": hedef seçiminde PDF | UDF | Word | TIFF | JPG biçim adları yan yana,
  TIFF de bir görüntü biçimi olduğu için "Görüntü" iki seçeneği karıştırırdı. Girdi satırındaki tür "Görüntü (JPG)". Görüntü → Word'de yazı
  tanıma yok (pdf2docx taranmış sayfayı resim aktarır); kalite notu bunu söyler.
- [x] **Seçilmeyen yollar**: Birleştir'in "Orijinal" boyut kuralı (72 dpi: telefon fotoğrafı 56 × 42 inçlik sayfa olurdu); görüntüyü A4 sayfaya
  kenar boşluklu oturtmak (fotoğrafta bant kalır); kayıplı kaynağı kayıpsız PNG gömmek (12 MP fotoğrafta 15–25 MB); sayfa adlarında sıfır doldurma
  ("Sayfa 01"; Gezgin doğal sıralıyor); JPG'yi yalnızca klasör kipinde istemek (tek girdide ad seçilemezdi); "zaten var"ı yalnızca "<ad>.jpg" için
  sormak (çok sayfada o dosya hiç yazılmaz); çok dosyalı sonucu tek satır + "N dosya" göstermek.
- [x] **Ölçüm**: A4 300 dpi'de JPG 2481 × 3508 piksel, 200 dpi'de 1654 × 2339.
- [x] **Testler**: donustur_testi `test_gorsel_imza`, `test_gorsel_pdf` (12 durumun sayfa ölçüsü, dpi kaynağı, gömme biçimi; PNG piksel, JPEG bayt
  eşitliği; EXIF yönü; TIFF / UDF / Word zinciri), `test_pdf_jpg`, `test_cakisma` 10/10 (eski kodla 11 HATA + istisna); senaryo39 (yeni) 1–3, 5, 6.
  bölümler 29/29 (eski donustur.js'le 1. ve 3. bölüm düşüyor); guvenlik_birim'e 17 denetim; udf_yaklasik (UDF → JPG, "(1)" adı); mac_renderer
  (JPG sonucunda "Finder'da göster", kilitli JPG sorusu macOS'ta Finder) 39/39.

#### 0.2.7: Birleştir'e UDF ve Word (madde 2)
- [x] **Durum**: görüntü (JPG, PNG, BMP, GIF, WEBP) ve TIFF Birleştir'de zaten vardı; UDF ve Word "desteklenmeyen tür" diye atlanıyordu.
- [x] **Çekirdek** (core/islemler/araclar.py `birlestir`): öğenin türü önce içerikten (`donustur.tur_bul`), okunamazsa uzantıdan: pdf | gorsel |
  udf | word. UDF / Word öğesi varsa yanıt ertelenir: dönüştürme iş parçacığında (Word'ün COM'u ve UDE köprüsünün oturumu orada) her belge
  `donustur.pdf_e_cevir` ile geçici PDF'e (`pdefe-donustur-<pid>-…`; iş bitince, çökmede sonraki çekirdek siler), ilerlemenin %0–60'ı "<ad>
  PDF'e çevriliyor (j/k)"; sonra MuPDF kilidiyle olağan birleştirme (%60–100). Sıra korunur, öğenin döndürme ve kalite seçimi dönüştürülen PDF'e
  uygulanır. Belge PDF'e çevrilemezse istek "<ad>: <neden>" iletisiyle reddedilir, hedef yazılmaz; dönüştürücünün uyarıları sonucun `uyari`'sında
  belgenin adıyla. Belgesiz istek eskisi gibi işçide eş zamanlı. Birleştir'in belge dönüştürmesi UDE'nin ayardaki klasörünü de alır
  (`donustur._ayarlari_uygula`; ana süreç `gorsel_bilgi` ve `birlestir`'e `udeYolu`'nu kendi ayarından verir, arayüzünkü yok sayılır).
- [x] **`gorsel_bilgi` / `boyut_tahmini`**: UDF / Word için `donusum_bilgi`'nin yanıtı + `pdfeCevrilebilir` ve `neden`; `onizleme: false` ile UDE'yi
  beklemeden hızlı yanıt, sonra UDF'nin ön izlemesi. Boyut tahmininde UDF / Word `tahminYok` (dönüştürmeden kestirilemiyor; toplama girmez).
- [x] **Arayüz** (gorselBirlestir.js): süzgeç "Desteklenen dosyalar" (PDF, görüntüler, TIFF, UDF, DOC, DOCX, DOCM, RTF, ODT) + "UDF belgeleri", "Word
  belgeleri"; sürükle-bırak ve pano aynı kabul. Ana pencereye bırakılan PDF dışı belge yine Format Değiştir'i açar. Word'ün küçük resmi yok: Format
  Değiştir'deki mavi "DOCX" yer tutucusu; özet "en az N sayfa", kalite düğmelerinde toplam "≥" ve ipucunda not. UDE yokken satır yaklaşık çizimle
  (küçük resim `udf:yaklasikBilgi`, satırda "görünüm yaklaşık"); birleştirmede yeni kanal `udf:yaklasikBirlestir` (ana süreç UDF'leri %TEMP%'te
  geçici PDF'e çizer, yollar arayüze verilmez, sonra çekirdeğin `birlestir`'i; iptal `udf:yaklasikIptal`): preload izin listesi, `guvenliIpc`,
  guvenlik.js `udfYaklasikParametreleri`. Yaklaşık çizim istek kimlikleri Format Değiştir'le ortak sayaçtan (iki araç birbirinin işini iptal
  etmesin). Word (ya da LibreOffice) yoksa satır soluk, "PDF'e çevrilemiyor: <neden>"; Birleştir'e basınca "Bir dosya birleştirilemiyor." (Atla ve
  devam et | Vazgeç).
- [x] **Seçilmeyen yollar**: Birleştir'in TIFF yolunu Format Değiştir'in TIFF → PDF'iyle değiştirmek (kalite seçenekleri ve boyut tahmini görsel
  yoluna bağlı); UDF / Word'ü işçide eş zamanlı çevirmek (UDE / Word saniyeler sürer, bütün pencerelerin küçük resimleri beklerdi; Word'ün COM'u
  dönüştürme iş parçacığına bağlı); boyut tahmininde belgeyi dönüştürmek; UDE yokken UDF'yi satırda engellemek (Format Değiştir yaklaşık çiziyor);
  geçici PDF yolunu arayüze vermek (0.2.6'nın "geçici yollar arayüze verilmez" kuralı); Word'süz satırı listeye hiç almamak (kullanıcı neden
  eklenmediğini görmezdi).
- [x] **Testler**: araclar_testi `test_birlestir_belgeler` 12/12 (yer tutucu ev klasörüyle; kurgusal UDF ve docx; PDF + UDF + BMP + Word → 6 sayfa
  sırayla, ilerleme, yazı tipleri gömülü, geçici PDF'ler silindi, iptal, UDE yok benzetimi); senaryo39 8. bölüm üç düzende: UDE ve Word var 12/12;
  `S39_WORD=1` ile UDF + PDF × 2 + TIFF × 2 + Word + JPG = 7 sayfa doğru sırayla 12/12; `PDEFE_UDE_YOK=1` + `PDEFE_WORD_YOK=1` 13/13; guvenlik_birim'e
  yeni kanalın 6 denetimi. Word'ün kendi görünmez örneği kullanıldı.

#### 0.2.7: İdeal / Düşük ve yaklaşık boyut (madde 8)
- [x] **Çekirdek**: `VARSAYILAN_TIFF_DPI = 300` ("İdeal"; 0.2.6'da 200); 200 dpi ("Düşük") seçenek; seçenek kümesi (200 | 300) ve taranmış sayfanın
  kendi çözünürlüğünde kalması değişmedi. Yeni `donusum_tahmini {yollar, hedefBicim: tiff | gorsel, renk?}` → ertelenmiş `{ideal, dusuk, sayfa,
  tahmin, eksik, ogeler, sure}`: dönüştürücünün kendi çizim ve kodlama işlevleri (`_tiff_sayfasi`, `_jpg_sayfasi`) örnek sayfaları bellekte kodlar,
  toplam sayfaya oranlanır (en çok 5 örnek, gri / renkli TIFF'te 3, eşit aralıklı); taranmış sayfa iki çözünürlükte bir kez çizilir. UDF / Word
  `tahminYok`. Ön bellek (yol, değişme zamanı, boyut, hedef, renk; 128 kayıt); ayrı tahmin iş parçacığı (süren dönüştürme beklemez), MuPDF
  adımları kilitle; iptal edilebilir.
- [x] **Arayüz**: düğmeler "İdeal" (300, varsayılan) / "Düşük" (200); ekranda ve ipuçlarında "dpi" yok (düğme kimlikleri '300' / '200' kaldı). JPG
  hedefinde aynı iki seçenek. Yanlarında Birleştir'in biçimi: "İdeal · 1,03 MB" (hesaplanırken "hesaplanıyor…"); dosyalar, hedefler ya da renk
  değişince 200 ms gecikmeyle, önceki istek iptal. UDF / Word varsa "≥" ve ipucunda not; yalnızca onlar varsa sayı yok. guvenlik.js
  `DONUSUM_YONTEMLERI`: `yollar` 1–500 dolu metin, `hedefBicim` tiff | gorsel, renk bilinen.
- [x] **Seçilmeyen yollar**: bütün belgeyi kodlamak (150 sayfalık gri TIFF'te saniyeler); UDF / Word için sayfa başına ortalama bayt varsayımı
  (yanlış güven verirdi); boyutu dpi oranının karesiyle ölçeklemek (siyah beyaz G4'te 300 / 200 = 1,51, kare oranı 2,25); tahmini her düğmeye
  ayrı istekle almak.
- [x] **Ölçüm**: 3 sayfalı PDF → siyah beyaz TIFF tahmini 207.080 / 137.312, gerçek 207.088 / 137.328 bayt (0,15 sn); JPG birebir; 24 sayfada 5
  örnekle %1,3 sapma (0,23 sn), ikinci istek ön bellekten 1 ms. Arayüzde 2 sayfalı PDF → gri TIFF İdeal tahmini 1,03 MB, gerçek 1.075.216 bayt.
- [x] **Testler**: donustur_testi `test_pdf_tiff` (varsayılan 300; eski kodla 3 HATA) ve `test_tahmin` 14/14; senaryo39 4. bölüm 8/8 (eski kodla
  istisna); senaryo37'de seçeneklerin adı; udf_yaklasik'te UDF → TIFF'in varsayılanı 300.

#### 0.2.7: kalitesi düşebilecek dönüştürmenin notu (madde 10)
- [x] **Karar**: çekirdekte `KALITE_NOTLARI` ("kaynak>hedef" → kısa not; `donusum_yetenekleri.donusumler[k].kalite` ve satırın
  `hedefler[].kalite`'si): UDF / PDF → Word "Sayfa düzeni Word'de birebir korunmayabilir."; TIFF → Word "Taranmış sayfalar Word'e resim olarak
  geçer; yazıları düzenlenemez."; görüntü → Word "Görüntü Word'e resim olarak geçer; yazısı düzenlenemez."; PDF / Word → UDF "Satır ve sayfa
  düzeni UDF'de kayabilir; imza, kaşe gibi resimler alınmayabilir."; TIFF / görüntü → UDF "Yazılar görüntüden tanınarak çıkarılır; harf
  yanlışları ve düzen kayması olabilir."; Word kaynağı LibreOffice'le çevrilecekse ek not. Notsuz: UDF → PDF / TIFF / JPG (UDE'nin kendi çizimi),
  Word → PDF / TIFF / JPG (Word'ün kendisi), TIFF / görüntü → PDF (kayıpsız), PDF → TIFF / JPG (sayfanın birebir resmi). Arayüzde hedef seçiminin
  altında `.kalite` (bilgi simgesi, satırın özetiyle aynı soluk renk; uyarı renginde değil), hedefe tıklanınca hemen; yapılamayan hedefte not
  yerine neden.
- [x] **Seçilmeyen yollar**: tanıyıcının varlığına göre değişen not (tanıyıcı yalnızca tanıma iş parçacığında kurulabiliyor; yoksa sonuçtaki uyarı
  söylüyor); PDF → TIFF / JPG'ye "yazı seçilemez" notu (istenen sonuç; gürültü olurdu).
- [x] **Testler**: donustur_testi `test_kalite_notlari` (notlu 8 yön, notsuz 6 yön); senaryo39 7. bölüm 7/7.

#### 0.2.7: Dönüştür, dönüştürmeden sonra soluk (madde 5)
- [x] **Kök neden**: `_durumGuncelle` düğmeyi yalnızca "dönüştürülecek dosya var mı / okunuyor mu / sürüyor mu"ya göre ayarlıyordu; dönüştürme
  bitince yeniden etkinleşiyor, ikinci basış aynı dosyaları "(2)" adıyla yeniden üretiyordu.
- [x] **Karar**: "imza" (dönüştürülecek dosyalar ve hedefleri, TIFF / JPG seçenekleri, kayıt biçimi, hedef dosya / klasör). En az bir dosya
  dönüştürülünce `_sonImza` = imza; imza aynıysa düğme soluk. Açık kullanıcı eylemleri (dosya ekle, çıkar, listeyi temizle, satırın hedefi, TIFF /
  JPG seçeneği) `_sonImza`'yı siler (aynı dosyayı temizleyip yeniden eklemek de "yeni bir şey"); Kaydet bölümündeki değişiklik imzayla
  karşılaştırılır (kod içinden gelen ad önerileri yanlışlıkla etkinleştirmesin; ad eski hâline dönerse yine soluk). Hiçbir dosya
  dönüştürülemediyse düğme etkin kalır. İşlemden sonra penceresi açık kalan öbür araçlara da: Ayır (imza: biçim, dosya sayısı, boşluksuz aralık,
  kayıt biçimi, hedef) ve dosya küçülmediğinde Sıkıştır (seviye, kayıt biçimi, hedef; seviye kartına tıklamak, seçili olana da, etkinleştirir).
  Döndür, Sayfaları düzenle ve Birleştir işlem bitince kapanıyor.
- [x] **Testler**: senaryo38 4. bölüm 21 denetim (gerçek PDF → TIFF; soluk düğmeye tıklamak ikinci dosya üretmez; her değişiklik ve geri dönüşü;
  Ayır; Sıkıştır); senaryo26 güncellendi (aynı ayırmayı yinelemek için pencere yeniden açılır) 64/64.

#### 0.2.7: sonuç kutusu (madde 6 ve 7)
- [x] **Kök neden**: satır flex'ti (ad · sayfa · boyut · Aç), Aç adın uzunluğuna göre kayıyordu; tek sonuç da aynı sola dayalı listeydi.
- [x] **Karar** (ortak.js `sonucKutusuCiz`; Format Değiştir ve Ayır aynı bileşen): tek dosyada başlık, ad, uyarı ve düğmeler ortalı. Birden çok dosyada
  ızgara (ad | Aç), uzun ad "…" ile kısalır (tam yol ipucunda), Aç sağda sabit sütunda; Aç'ı olmayan satırda (UDF / Word / TIFF / JPG çıktısı, hata)
  sütun boş; uyarı ya da hata adın altında satırın tamamında. Kilobayt ve sayfa hiç yok (başlıktaki "toplam …" de kalktı). Ayır'ın sonucunda da aynı
  (tek dosyada "Dosya oluşturuldu"); Ayır'ın düğmesi Mac'te "Finder'da göster" (önceden her yerde "Klasörde göster").
- [x] **Dokunulmayanlar**: Sıkıştır'ın sonucu (boyut farkı aracın amacı); bildirimdeki "Dönüştürüldü: ad · 3 sayfa · 118 KB" (senaryo37 bekliyor;
  istenirse kısaltılır); Birleştir (sonuç kutusu yok, sonucu sekmede açar).
- [x] **Testler**: senaryo38 2. bölüm 11 denetim (tek sonuçta başlık, ad, düğme kutunun ortasında ±1,5 px; çoklu listede Aç'ların sol kenarı eşit;
  uzun ad kısalır; KB / sayfa / "toplam" yok; Ayır gerçek ayırmayla); eski kodla bölüm düştü.

#### 0.2.7: "zaten var" sorusunda "Yeni belge olarak kaydet" (madde 12)
- [x] **Karar** (ortak.js `varOlanaYazmaSor`; bütün araçların `kayitSecimi.denetle`'si buradan sorar): Üzerine yaz | Yeni belge olarak kaydet |
  Vazgeç; varsayılan (Enter, birincil) "Yeni belge olarak kaydet" (hiçbir dosyanın üzerine yazmaz), Esc = Vazgeç. Yeni ad `numaraliAdBul`: "<ad>
  (1).<uz>", varsa (2), (3)…; ad " (n)" ile bitiyorsa (1–3 basamak) sayı artar. Yeni ad soruda yazar ve ad kutusuna geçer; numaralı ad elle yazılmış
  sayılmaz (inceleme turu: girdi değişince araç yine yeni girdinin adını önerir). `denetle`, ad değişince "üzerine mi" kararını yeniden hesaplar
  (Değiştir'de özgün dosya seçilmişse yeni adla artık üzerine yazma değil). Windows'un Farklı kaydet penceresi zaten sorduysa yeniden sorulmaz
  (0.2.6 kuralı).
- [x] **JPG'de** (çok dosya): yazılacak adlardan biri varsa aynı soru, önerilen ad "X (1) - Sayfa 1.jpg"; "Yeni belge" `cakisma: 'yeniAd'` (çekirdek bütün
  sayfa adları boş olan ilk "(n)" kökünü seçer). Format Değiştir'in birden çok girdisi ve Ayır'ın birden çok dosyası bu soruyu sormaz (zaten "(2)"
  ekliyorlar); JPG'de `_hedefYollari` "<ad>.jpg" ve "<ad> - Sayfa 1.jpg"ye bakıp "(2)" seçer, ayrıca `cakisma: 'yeniAd'`.
- [x] **Seçilmeyen yol**: `bosAdBul`'u kullanmak (o "(2)"den başlar; varsayılan önerilen adlar öyle kalır, soru kullanıcının istediği gibi "(1)"den).
- [x] **Testler**: senaryo38 3. bölüm 9 denetim (soru metni ve düğmeler, Vazgeç / Esc, (1), (2), "(1)" ile biten ad, Üzerine yaz; üç düğme aynı
  satırda, odak Yeni belge'de; Döndür'le uçtan uca: "Hedef (1).pdf" oluşur, "Hedef.pdf" değişmez).

#### 0.2.7: araç açıkken açılan belge yeni pencerede (madde 11)
- [x] **Kök neden**: ana süreç Gezgin'den, ikinci örnekten ya da open-file'dan gelen dosyayı en son etkin pencereye veriyor (`dosya:ac`), pencere de araç
  örtüsünün arkasında sekme açıyordu; aracın sonuç listesindeki Aç da arkada sekme açıyordu.
- [x] **Karar**: kural renderer'ın `dosyaAc`'ında (bütün yollar oradan geçer): araç penceresi açıkken ve dosya hiçbir pencerede açık değilken ana
  sürece `pencere:yeniPenceredeAc` [yollar]; ana süreç isteyen pencerenin +32 / +32 kaymasıyla (Pencereye ayır'daki gibi) aynı boyda yeni pencere
  açar (önde), sonraki istekler o pencere yaşadıkça oraya gider. Dosya araç açık pencerede zaten açıksa sekmesi seçilir ve "… bu pencerede zaten açık;
  araç penceresi kapanınca görünür" (bir dosya iki pencerede açılamaz); başka pencerede açıksa eskisi gibi o pencere öne gelir. Aracın kendi işi
  kurala girmez (üzerine yazılan sekmeyi yenileme). UDF / TIFF / Word / görüntü: Format Değiştir açıksa listesine, başka araç açıksa yeni pencerede
  Format Değiştir'de. Sürükle-bırak araç örtüsüne gider, değişmedi. Sonuçtaki Aç'ın ipucu "Yeni pencerede aç".
- [x] **Güvenlik**: preload izin listesi + `guvenliIpc` + guvenlik.js `acilacakYollar` (en çok 100 mutlak yol, NUL yok); pencere yalnızca yolları kendi
  arayüzüne verir, dosya olağan yoldan okunur.
- [x] **Test kancası**: gelistirme.js `test:uygulamaOlayi` (`second-instance` argv / `open-file` yol): ana sürecin gerçek yolu, ikinci Electron
  başlatmadan. senaryo22 ve senaryo37'nin "ikinci örnek" denetimleri artık bunu kullanıyor (önceden olağan masaüstünde electron.exe başlatıyordu;
  ekran kuralına aykırıydı, görünmeyen masaüstünde de düşüyordu: 0.2.6'nın açık konusu kapandı).
- [x] **Seçilmeyen yollar**: araç durumunu ana süreçte tutmak (renderer zaten biliyor; ek durum ve yarış); var olan başka bir pencereye göndermek
  (kullanıcı "yeni pencere" dedi); açık sekmeyi yeni pencereye taşımak (araç o belgeyle çalışıyor olabilir).
- [x] **Testler**: senaryo38 5. bölüm 11 denetim (eski arayüzle 6 düştü); senaryo37 6. ve 8. bölüm.

#### 0.2.7: sürüklenen sekmenin ön izlemesi (madde 13)
- [x] **Ölçüm yöntemi** (test/hayalet_akicilik.mjs, test/hayalet_izle.ps1): ekran dışındaki test örneğinde sekme CDP fare olaylarıyla şeridin dışına
  sürüklenir, ön izleme görününce ana sürecin imleci test kancasıyla (`test:imlecYolu`) 400 px/sn sabit hızla kaydırılır; 3 sn boyunca ana sürecin
  adım zamanları ve setBounds süreleri (`test:hayaletOlcum`) ve pencerenin yeri dışarıdan (GetWindowRect, ~0,5 ms'den sık) ölçülür. Görünmeyen
  masaüstünde gerçek imleç okunamıyor; gerçek fare yolu (gercek_fare.ps1) yakalama ve odak içindir.
- [x] **Kök neden**: `setInterval(…, 16)` ana süreçte Windows'un varsayılan 15,6 ms zamanlayıcı çözünürlüğüne yuvarlanıp ~31 ms'de bir çalışıyor: ön
  izleme saniyede ~32 kez ve düzensiz kayıyordu (60 Hz ekranda iki karede bir, arada bir hiç). setBounds, saydamlık, gölge, IPC ya da içerik çizimi
  değil (ölçüldü: setBounds ortanca ~1 ms).
- [x] **Karar** (renderer/hayalet.*, main/pencereler.js): ön izleme penceresinin kendi requestAnimationFrame'i (görünürken her ekran karesi) ana sürece
  `hayalet:kare` gönderir; ana süreç o anda imleci okuyup pencereyi taşır (aynı `suruklemeAdimi`). Kare gelmezken (pencere kuruluyor, görünmüyor)
  eski zamanlayıcı yedek: son kareden 40 ms geçtiyse adım atar. Yüksek tazeleme hızlı ekranda adımlar en az 7 ms arayla. Kanal yalnızca ön izleme
  penceresinden ve sürükleme sürerken işlenir (preload GONDERIMLER / DINLEMELER).
- [x] **Ölçüm**: önce adım aralığı ortanca 31,2 / 31,3 ms, %95 32,0 / 32,2 ms, 25 ms'den uzun aralık 88/102 ve 94/96; sonra ortanca 16,69 / 16,68 ms,
  %95 16,8 ms, en çok 17,1 / 18,6 ms, 25 ms'den uzun 0; dışarıdan ortanca 16,7 ms, %95 17,0 ms.
- [x] **Seçilmeyen yollar**: Windows zamanlayıcı çözünürlüğünü yükseltmek (timeBeginPeriod; Node'dan erişim yok, yerel modül gerekir, bütün süreci
  etkiler); kaynak pencerenin pointermove'undan konum göndermek (kaynak arayüz meşgulken takılır); setImmediate döngüsü (işlemci); setPosition
  (Electron Windows'ta onu da setBounds'a çeviriyor).
- [x] **Testler**: hayalet_akicilik 4/4 (ölçütler: ortanca 14–19 ms, %95 ≤ 22 ms, 25 ms'den uzun ≤ %2; dış ölçüm %95 ≤ 22 ms; setBounds %95 ≤ 4 ms),
  senaryo22 101/0, gercek_fare 9/9.

#### 0.2.7: kısayol simgelerindeki yeşil ok (madde 14, araştırma; kod değişikliği yok)
- [x] **Sonuç**: PDEfe kısayollara ve okun görünüşünü belirleyen ayarlara dokunmuyor. Araştırma salt okunurdu: Gezgin yeniden başlatılmadı, simge ön
  belleği silinmedi, hiçbir kısayola yazılmadı, ekrana pencere açılmadı.
- [x] **Ölçüm**: Gezgin'in masaüstünde gerçekten çizdiği görüntü (pencere açmadan, PrintWindow ile) 8 masaüstü kısayolunun 8'inde olağan küçük
  kısayol okunu gösteriyor; yeşil ok yok (ara ara görülen bir durum). Kısayolların içeriği (hedef, simge yolu, kimlik listesi, başlıktaki hedef
  bilgileri) oluşturuldukları günkü gibi. `Explorer\Shell Icons` ayarı yok (HKLM'de ve WMI ile gerçek HKCU'da). 13 simge kaplama işleyicisinin
  (OneDrive, Google Drive, EnhancedStorage, Çevrim Dışı Dosyalar) hiçbiri masaüstü kısayollarını üstlenmiyor (`IsMemberOf` S_FALSE);
  `SHGetFileInfo` kaplama indeksi hepsinde 2 (Windows'un kısayol oku).
- [x] **Gözlem**: 15 Ekim akşamı (20.43–20.53) bir şey masaüstündeki 5 kısayolu içeriğini değiştirmeden 4 kez yeniden yazdı; o dakikalarda kurulu 0.2.6'yla
  masaüstünde Word → TIFF dönüştürmeleri yapılıyordu (her TIFF çıktısından 2–3 sn sonra Windows'un kısayol dizini 5 kısayolu "güncellendi" diye
  kaydetti; Gezgin her yazımdan sonra simgeleri yeniden çizer). 28 Eylül'den beri birden çok kısayolun birlikte güncellendiği başka an yok; Word'ün öteki
  başlangıçları ve PDF / Word / UDF çıktıları yazım doğurmamış. Yazan süreç bulunamadı (yönetici izniyle süreç izlemesi gerekir).
- [x] **Yeniden üretme**: depodaki çekirdekle 12 dönüştürme (PDF, UDF ve Word → TIFF / PDF; dördü kısayol kopyalarının durduğu klasörde) ve Windows Fotoğraf
  Görüntüleyicisi'yle bir TIFF görünmeyen masaüstünde açıldı: ne gerçek masaüstündeki kısayollar ne kopyalar değişti. Kaynak kodda kısayol yazan tek
  yer kurucu (yalnızca kendi kısayolu; `SHChangeNotify(SHCNE_ASSOCCHANGED)`, dosya ilişkisi değişen her kurucunun olağan bildirimi).
- [x] **"Ortadan yeşil ok"** yeniden üretilemedi. Adaylar: masaüstündeki "İndirilenler - Kısayol"un küçük boyuttaki yeşil-turkuaz aşağı oku, Çevrim Dışı
  Dosyalar'ın yeşil daire içindeki eşitleme oku, OneDrive / Google Drive'ın yeşil işaretleri; Gezgin'in toplu yenilemede bir simgeye kısa süre başka
  görüntü koyması. Ekran görüntüsü olmadan kesinleşmez (DOGRULAMA 42).
- [x] **Seçilmeyen yollar**: Gezgin'i yeniden başlatmak, simge ön belleğini silmek (istek dışı; simgeler şu an doğru); gerçek masaüstüne deneme dosyası
  koyarak yeniden üretmek (kullanıcının onayıyla yapılabilecek ilk deneme); Process Monitor / USN günlüğü (yönetici izni ve kurulum ister).

#### 0.2.7: bağımsız inceleme ve düzeltme turu
Her bulgu önce yeniden üretildi ya da kod izlendi; gerçekse önce düşen test, sonra düzeltme. 10 bulgunun 10'u düzeltildi.
- [x] **"(1)" adı sonraki dosyada kalıyordu** (orta): `varOlanaYazmaSor` yeni adı `{ elle: true }` ile yazıyordu, `adYenile` yeni girdinin adını
  öneremiyordu. Numaralı ad elle sayılmaz. senaryo40 1. bölüm (önce 2 HATA).
- [x] **16 bitlik gri görüntü** (orta; 0.2.6'da da vardı): `araclar._duzlestir` I kipinde `point(lambda v: v / 256 if v > 255 else v)`; Pillow 12'de
  işleve ImagePointTransform geliyor, karşılaştırma TypeError: Format Değiştir ve Birleştir düşüyordu. `getextrema()` ile üst değer ölçülür, 255'i
  aşarsa doğrusal `point(lambda v: v * (1/256))`, sonra L. donustur_testi gri16 10 denetim (önce 7 HATA); donustur_testi.py'ye `--yalniz`.
- [x] **Birleştir: UDE yokken UDF + "Üzerine yaz"** (orta): `udfYaklasikParametreleri` hedefin öğelerden biri olmasını reddediyordu, "Üzerine yaz"da
  hedef tanımı gereği listedeki açık PDF. Kural çekirdekle aynı: yalnızca yaklaşık çizilen UDF'nin kendisi hedef olamaz. senaryo40 2. bölüm
  (`PDEFE_UDE_YOK=1`, önce 3 HATA).
- [x] **JPG: sayfa sayısı bilinmezken "Sayfa n" sorusuz eziliyordu** (orta): `_jpgCakismasi` sınanan adlar ("<ad>.jpg", "Sayfa 1"; uzun belgede ilk 200)
  yoksa `uzerineYaz` gönderiyordu. Sınanan adların hiçbiri yoksa `yeniAd` (olağan durumda aynı adlar; sınanmayan bir sayfa doluysa "(1)");
  "Üzerine yaz" yalnızca soruda açıkça seçilince. Çekirdek adı değiştirdiyse sonucun ilk satırında "Aynı adlı dosyalar vardı; onlara dokunulmadı,
  yeni adla kaydedildi.". Seçilmeyen: Word'ün sayfa sayısını önceden ölçmek (Word'ü açmak gerekir). senaryo40 3. bölüm (önce 3 HATA).
- [x] **JPG "Üzerine yaz": önceki daha uzun dönüştürmenin sayfaları kalıyordu** (orta): silinmez, söylenir: soru (sayfa sayısı biliniyorsa) kalan
  dosyayı adıyla söyler, çekirdek `kalanlar` alanını verir, sonucun ilk satırında not; "Yeni belge"de dizinin sonraki sayfası varsa ad dolu sayılır.
  Seçilmeyen: kalanları çöpe göndermek (ana süreç yalnızca bu oturumda oluşan dosyaları çöpe atar; kullanıcının başka belgeleri çöpe gitmesin;
  kullanıcı isterse sonraki sürümde). donustur_testi kalan_sayfalar (önce 2 HATA), senaryo40 4. bölüm (önce 2 HATA).
- [x] **Hazırlık sürerken gelen İptal kayboluyordu** (düşük): `cekirdekDonusumCagir` önce hedef klasörleri okuyor, istek kimliği çekirdeğinkiyle ancak
  gönderirken eşleşiyordu. `Cekirdek.cagir` parametreyi işlev olarak da alır (hazırlık); kimlik hazırlık ve başlatma süresince `hazirlananlar`da,
  iptal oraya işaret koyar, istek gönderilmeden "İşlem iptal edildi." (-32800). Seçilmeyen: ana süreçte ayrı "bekleyen iptaller" kümesi (sınırsız
  büyür, kimlik yeniden kullanımında yanlış iptal). test/cekirdek_iptal.mjs 7 denetim (Electron gerekmez), senaryo40 5. bölüm (önce 2 HATA).
- [x] **MuPDF kilidinin dışında MuPDF çağrısı** (düşük; 0.2.7'nin gerilemesi): `_tiff_sayfasi` / `_jpg_sayfasi` ve tahmin ölçeği kilitsiz
  hesaplıyordu; `_sayfa_ciz` ölçeği işlev olarak da alır, kilidin içinde hesaplar. donustur_testi mupdf_kilidi 3 denetim.
- [x] **JPG geçici klasörü yeniden kullanılınca bayat dosyalar** (düşük): klasör varsa önce boşaltılır; yerine koyma yalnızca bildirilen 1…sayfa
  dosyasını alır. donustur_testi bayat_gecici.
- [x] **Tek dosyada yeni ad başka öğenin hedefiyle çakışıyordu** (düşük; arayüzün olağan yolundan erişilmiyor): tek dosya yolunda da "bu istekte
  yazılanlar" denetimi. donustur_testi ayni_istekte_ad.
- [x] **Tahmin iş parçacığı kapanışta durdurulmuyordu** (düşük): kapanış bayrağı her durumda kurulur, tahmin en çok 1 sn beklenir, kapanıştan sonra
  yanıt yazılmaz. donustur_testi tahmin_kapanis (önce 2 HATA).

#### 0.2.7: belgeler
- [x] Sürüm 0.2.7 (package.json, package-lock.json); CHANGELOG; docs/DOGRULAMA.md 42; README: giriş, Öne çıkanlar, Açılış ekranı, Sekmeler ve
  pencereler, Araçlar (Birleştir), Format Değiştir (görüntü → PDF, PDF → JPG, İdeal / Düşük, "zaten var" sorusu, gereksinimler); ekran görüntüleri.
- [x] **Ekran görüntüleri** (`README_OLCEK=2`, temiz veri klasörü, kurgusal yazar adı, belgeler `C:\Users\Public\Documents\PDEfe Örnek`'te, iş
  bitince silindi; hepsine tek tek bakıldı): açılış ekranı (açık, koyu), Araçlar, Birleştir (açık, koyu), Format Değiştir (ilk satırın altında
  kalite notu, hedeflerde JPG), Yazdır (eşit düğmeler), Kısayollar (1280 × 900; bölüm başlığı "Birleştir"). `test/readme_goruntuleri.mjs`'te
  Birleştir'in listesi artık UDF, PNG, Word ve TIFF (`BIRLESTIRILECEK`; UDF ikinci satırda, küçük resmi UYAP Doküman Editörü'yle; özet "en az 6
  sayfa", kalite düğmelerinde "≥"). Bilinen: Birleştir'de önerilen ad "Birleştirilmiş (3)" (görüntünün çekildiği bilgisayarın Masaüstü'nde aynı
  adlı dosyalar var; 0.2.6'da "(2)").

#### 0.2.7: sınama özeti
- [x] Python (çekirdek): donustur_testi 214/214 (akış dâhil), udf_donusum_testi 132/132, word_donusum_testi 32/32 (`PDEFE_WORD_YOK=1`), araclar_testi
  149/151 (iki `kucult_tahmin` süre denetimi yer tutucu belgeyle; 0.2.6'da da düşüyordu, kod değişmedi), guvenlik_testi 47/47, mac_cekirdek_testi
  14/14. Paketli çekirdek (`npm run cekirdek:derle`; sonra core/dist silindi): donustur_testi `--exe --hizli` 166/166, udf_donusum_testi `--exe`
  118/118, araclar_testi `test_birlestir_belgeler` + `test_gorsel_bilgi` `--exe` 10/10 + 4/4.
- [x] Arayüz (her test kendi temiz örneğinde, görünmeyen masaüstünde ya da ekran dışında): senaryo40 23/23 (`PDEFE_UDE_YOK=1`) ve 18/18, senaryo39 54/54
  (UDE ve Word yok düzeninde 53/53; `S39_WORD=1` ile 8. bölüm 12/12), senaryo38 67/67 (%100) ve 29/29 (%125, 1–2. bölüm), senaryo37 63/63 (Word
  dönüştürmesi `S37_WORD` olmadan atlandı), udf_yaklasik 63/63, guvenlik_birim 103, cekirdek_iptal 7/7, mac_renderer 39/39, arac_onizleme 24/24,
  kisayol_araclar 102/102, senaryo26 64/64, senaryo27 19/19, senaryo13 65/65, senaryo14 60/60, gec_iptal 20/20, ortu_tiklama 164/164, senaryo23
  53/53, senaryo36 59/59, senaryo18 10/10, yazdir_pencere 43/43, sekme_genislik 38/38, serit_olculeri 25/25, acilis_hizasi 10/10, hayalet_akicilik
  4/4, senaryo22 101/0, kisayol_dosya 164/164, gercek_fare 9/9. Kalan WINWORD / java / electron süreci yok; çöp kutusuna bir şey gönderilmedi
  (testlerin `dosya:sil`'i sahte).
- [x] Düşenler (bu işin kodundan değil): senaryo19 111/112: "[1280px] PDF aç düğmesi araç kartlarından belirgin büyük (≥ 1,2×)" (oran 1,13: PDF aç
  86 px, en yüksek kart 75,8 px "Sayfaları düzenle"); 0.2.6'nın son commit'indeki 3 × 2 açılış düzeninden (2566f53). senaryo37'de `PDEFE_UDE_YOK=1`
  ile 1 HATA: eski beklenti, UDE yokken UDF'nin dönüşmeyeceğini sanıyor (0.2.6'dan beri yaklaşık çizimle dönüşüyor; UDE varken 6. bölüm 9/9).
- [ ] **Açık konular**:
  - senaryo19'un 1,2 kat ölçütü: testin ölçütü mü güncellenecek, PDF aç mı büyüyecek (düzen kararı; dokunulmadı). senaryo37'nin UDE yok
    beklentisi güncellenmeli.
  - Gerçek Mac'te görüntü dönüştürmeleri, PDF → JPG ve Birleştir'in UDF / Word yolu denenmedi (yalnızca mac_renderer'ın darwin çerçevesi; Word
    otomasyonu Mac'te yok, LibreOffice yolu sınanmadı). Kurucu ve Mac paketi derlenmedi.
  - TIFF / görüntü → Word'de yazı tanıma yok (pdf2docx taranmış sayfayı resim aktarıyor); istenirse ayrı iş: tanınan satırları Word'e metin olarak
    yazmak (UDF yolundaki gibi).
  - HEIC (iPhone fotoğrafı) açılamıyor: açıcı (pillow-heif) pakette yok.
  - UDF / Word için Birleştir'de ve TIFF / JPG'de boyut tahmini yok; Birleştir'de Word belgesinin sayfa sayısı dönüştürmeden bilinmiyor ("en az",
    "≥"). Birleştir açıkken UDE'nin klasörü gösterilirse satırlar kendiliğinden yenilenmez (Format Değiştir'deki "yerini göster" bağlantısı
    Birleştir'de yok).
  - JPG "Üzerine yaz"da önceki uzun çıktının fazla sayfaları silinmez, yalnızca söylenir (kullanıcı isterse sorulup çöpe gönderilebilir).
  - Format Değiştir'in tek PDF sonucundaki bildirimde hâlâ KB ve sayfa ("Dönüştürüldü: ad · 3 sayfa · 118 KB").
  - Sürükleme akıcılığı test örneğinde programla yürütülen imleçle ölçüldü; gerçek fareyle ve 60 Hz dışı ekranda denenmedi.
  - Kısayollar: yeniden yazan süreç bilinmiyor; kesinleştirmek için kullanıcının onayıyla gerçek masaüstünde deneme ya da yönetici izniyle süreç
    izlemesi. PDEfe'nin kurucu testi (`test/kurucu_akis`) gerçek masaüstüne geçici "Kurucu Sinama" kısayolu koyuyor (07.10'da 10 kez): sahte bir
    masaüstü klasörüyle çalışacak biçimde değiştirilebilir.
  - Kurulu (paketli) sürümde arayüz denenmedi (paketli çekirdekle Python testleri geçti).
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 42.

### Revizyon 0.2.8 (2026-10-16, kullanıcı istekleri: araç açıklamaları; İdeal / Düşük titremesi; Format Değiştir'in Kaydet bölümü; ortalı sonuç kutusu ve "Tümünü aç"; uyarı yerine ⚠; bildirimler; kalıcı çıktı klasörü; güncelleme sıklığı; yazdırmada Tümü; boş sekmeyi ayırma)
Ayrıntı: CHANGELOG.md. Kullanıcının 14 maddelik isteği (bir Word belgesi ve üç ekran görüntüsü; özet): (1) Format Değiştir'in açıklaması "PDF, UDF,
Word, TIFF, JPG dosya formatlarını değiştirir"; (2) TIFF / JPEG seçiliyken İdeal ve Düşük'te bir an "büyük yatay bir buton gibi bir şey olup
kayboluyor"; (3, 6) "Klasörde göster" bazen ortalı değil (birden çok dosya türünde, PDF / UDF'de, JPG çıktısında); (4) birden çok dosyada da başlık,
yazılar ve düğme ortalı olsun, küçük Aç'lar kalksın, "Klasörde göster"in sağına "Tümünü aç" (tek dosyada "Aç"), basınca varsayılan uygulamayla
açsın; (5) Birleştir'in açıklaması "birleştirir, farklı dosya formatlarıyla çalışabilir"; (7) sonuç ekranında uyarı paragrafı olmasın, sağlıklı
dönüştürülemediği fark edilince üçgen içinde ünlem, üstünde durunca dönüşümün adıyla uyarı; "kaşe" kelimesi uyarılardan çıksın, tablolar anılsın;
(8) bütün araçlarda kayıt yeri bir kez değiştirilince yeniden değiştirilene dek aynı yer; (9) Format Değiştir'deki "Yeni belge olarak kaydet |
Üzerine yaz" seçimi ve "Dönüştürülen dosya her zaman yeni dosya olarak kaydedilir." yazısı kalksın; (10) birden çok dosyadaki "Dosyalar girdilerin
adıyla kaydedilir…" açıklaması kalksın; (11) alttaki beyaz bildirim yalnızca sonuç kendiliğinden açılınca; (12) güncelleme denetimi iki günde bir;
(13) yazdırma penceresinin varsayılanı her zaman "Tüm sayfalar" (seçilen aralık başka PDF'lere yansıyordu); (14) boş "Yeni sekme" de pencereye
ayrılsın. Gönderme, etiket ve sürüm yayımı yok: yalnızca yerel commit'ler.
Düzen: iki grup aynı çalışma ağacında, sırayla: araç pencereleri (madde 1–7, 9–11), genel maddeler (8, 12–14); sonra bağımsız inceleme ve düzeltme
turu; belgeler, paket ve son sınama. Her madde ayrı commit'ler, önce düşen testlerle ("önce düşen" denetimler önceki HEAD'in çalışma ağacından
başlatılan örnekte). Electron yalnızca ekran dışındaki (`test/baslat.ps1`) ya da görünmeyen masaüstündeki (`test/baslat_gizli.ps1`) örnekte
başlatıldı; "Tümünü aç" sınamalarında gerçek program açılmadı (test kaydı); kullanıcının açık PDEfe'sine, Word'üne ve UYAP Doküman Editörü'ne
dokunulmadı.

#### 0.2.8: karo açıklamaları ve eşit karolar (madde 1 ve 5)
- [x] **Karar** (aracPenceresi.js ARACLAR; Araçlar penceresi ve açılış ekranı aynı listeyi gösterir): ikisi de kullanıcının yazdığı gibi; Birleştir'de
  yalnızca ilk harf büyük ("Birleştirir, farklı dosya formatlarıyla çalışabilir"). İpuçları (title) değişmedi.
- [x] **Eşit karolar**: iki açıklama da iki satıra kırılıyor. Açılış ekranı (stil.css): `.karsilama-arac-izgara { grid-auto-rows: 1fr }`, bütün satırlar en
  uzun karonun yüksekliğinde (0.2.7'de 1280 px'te birinci satır 84, ikinci 70 px; şimdi hepsi 84). Araçlar penceresi (aracPenceresi.css): esnek kutu →
  ızgara (3 × 200 px; dar pencerede 2 × 200), `grid-auto-rows: 1fr`, genişlik aynı (616 px). Alçak pencerede (≤ 860 px) ikinci satırın uzaması 1280 × 700'de
  10 belgeyle 12 px taşıma yapıyordu (senaryo20): karoların üst / alt iç boşluğu 9 → 7, satırlar arası 10 → 6 px, açıklamanın satır yüksekliği 1,35 → 1,3.
- [x] **Seçilmeyen yollar**: açıklamaları kısaltmak (kullanıcı metni yazdı); yazıyı küçültüp tek satıra sığdırmak; esnek kutuda JS ile yükseklik eşitlemek.
- [x] **Ölçüm**: açılış ekranı 1280 px'te 6 × 83,8 px (önce 3 × 83,8 + 3 × 70); 704 px'te 6 × 100,6; Araçlar penceresi 6 × 130 px (önce ikinci satır 114).
- [x] **Testler**: senaryo41 1. bölüm (yeni; eski kodla 8 denetimin 5'i HATA); senaryo37 1. bölüm beklentisi; senaryo20 52/52 (alçak pencere düzeltmesinden önce
  48/52); acilis_hizasi 10/10 ("PDF aç kartlardan ≥ 10 px yüksek" ölçütü 760 px'te 4 px: açıklama orada üç satıra kırılır, kartlar 87, PDF aç 94 px; gerekçe
  testte). senaryo19'un "PDF aç ≥ 1,2 × kart" ölçütü (0.2.6'dan beri düşüyordu, 0.2.7'nin açık konusu) dar pencerede 1,05 ×'e indi (oran ~1,03–1,13).

#### 0.2.8: İdeal / Düşük'te bir an görünen geniş düğme (madde 2)
- [x] **Kök neden** (ResizeObserver ve MutationObserver kaydı, 3 sayfalık PDF, 1280 px): TIFF seçilince düğmeler 0–215 ms "İdeal" / "Düşük" genişliğinde
  (56,7 / 63,8 px; tahmin 200 ms gecikmeyle istenir), sonra " · hesaplanıyor…" ile 148,8 / 155,9 px (bölümlü seçim ~125 → ~310 px), yanıt gelince " · 67 KB"
  ile 99,2 / 106,3 px. JPG'de ve renk değişince aynı. Kullanıcının gördüğü bu genişleyip daralma.
- [x] **Karar** (donustur.js, araclar.css): iki düğmenin en küçük genişliği "Düşük · 99,99 MB"ı alır (9,8em ≈ 127 px), ikisi eşit; değer yokken, hesaplanırken
  ve gelince genişlik aynı. "hesaplanıyor…" yazısı kalktı: hesaplanırken önceki değer soluk kalır (yoksa soluk "…"), "Boyut hesaplanıyor…" ipucunda. Bekleme
  durumu istek değiştiği anda kurulur; istek 200 ms içinde eski hâline dönerse (renk değişip geri) önceki sonuç geri yazılır.
- [x] **Seçilmeyen yollar**: yalnızca "hesaplanıyor"u kısaltmak (düğme yine iki kez boyut değiştirirdi); değere sabit genişlik (kısa değerde boşluk);
  tahmini gecikmesiz istemek (her tıklamada çekirdeğe istek).
- [x] **Testler**: senaryo41 2. bölüm (eski kodla 5 HATA); senaryo39 4. bölüm (bekleme `.bekliyor` sınıfıyla) 8/8.

#### 0.2.8: Format Değiştir'in Kaydet bölümü (madde 9 ve 10)
- [x] **Karar**: ortak.js `kayitSecimi`'ne `kipSecimi: false`: seçim sayfaya konmaz, kısıt yazısı gösterilmez; iç durum ("yeni"), ad önerisi, "zaten var"
  sorusu (Üzerine yaz | Yeni belge olarak kaydet | Vazgeç) ve kilit soruları aynı. Yalnızca Format Değiştir kullanıyor; öbür araçlarda seçim duruyor.
  Çok dosyadaki açıklama kalktı (davranış aynı). Birden çok dosyada JPG hedefi varken yalnızca "Çok sayfalı belgenin her sayfası ayrı bir JPG dosyası
  olur." kalır (kullanıcı yalnızca ilk cümleyi alıntıladı).
- [x] **Seçilmeyen yollar**: seçimi CSS'le gizlemek (`.arac-segmentli`'nin display kuralı `hidden`ı eziyordu; ekran okuyucuda da kalırdı); JPG cümlesini de
  kaldırmak.
- [x] **Testler**: senaryo41 3. bölüm (eski kodla 3 HATA); senaryo37 5. bölüm, senaryo26 2. bölüm, senaryo39 3. bölüm beklentileri güncellendi.

#### 0.2.8: sonuç kutusu ortalı; küçük Aç'lar yerine "Tümünü aç" / "Aç" (madde 3, 4, 6)
- [x] **Kök neden**: 0.2.7'de yalnızca tek dosyalı sonuç ortalıydı (`.arac-sonuc-tek`); birden çok dosya (karışık türler, JPG'nin sayfa dosyaları) sola dayalı
  listeydi, Aç'lar sağda sabit sütunda. Ölçüm (1280 px, kutunun ortası 632 px): başlığın ortası 379 px, satırlar ~621 px (sol girintili), düğme solda.
- [x] **Karar** (ortak.js `sonucKutusuCiz`): tek ve çok dosyada başlık, her satır ve düğme satırı ortalı; satırlardaki Aç'lar ve Aç sütunu kalktı. Çok dosyada
  yalnızca liste kaydırılır (en çok 168 px; başlık ve düğmeler hep görünür), kaydırma çubuğunun yeri iki yanda ayrılır (`scrollbar-gutter: stable
  both-edges`): çubuk çıkınca satırlar yine başlıkla aynı ortada. Uzun ad "…" ile kısalır (tam yol ipucunda); tek dosyada satır kırar.
- [x] **"Tümünü aç"** (tek dosyada "Aç"), "Klasörde göster"in sağında: ortak.js `varsayilanProgramdaAc` → ana süreç `dosya:varsayilanlaAc` → `shell.openPath`
  (Windows / macOS'un varsayılan programı). 10'dan çok dosyada önce "N dosya açılsın mı?" (Aç | Vazgeç); 100'den çoğunda ilk 100. Açılamayan dosyalar mesaj
  kutusunda adlarıyla ve nedeniyle (dosya bulunamadı / bu türü açan program yok; UDF'de "UYAP Doküman Editörü kuruluysa onunla açılır"). Düğme açarken soluk.
- [x] **Güvenlik** (main.js, guvenlik.js `aracCiktiKaydi`, preload izin listesi, `guvenliIpc`, udfYaklasik.js): yalnızca araçların bu oturumda yazdığı çıktılar
  açılır (`dosya:sil`'in deseni): bicim_donustur'un hatasız öğelerinin hedef / hedefler'i, ayir'in dosyalar'ı, birlestir'in yolu ve UDE yokken ana sürecin
  yazdığı yaklaşık PDF; uzantı .pdf / .udf / .tif / .tiff / .docx / .jpg / .jpeg; mutlak yol, en çok 100 (`acilacakYollar`). Başka dosya, .exe / .lnk açılmaz.
  Test örneğinde program açılmaz (testDiyalog kaydı; kuyruktan programın hata iletisi verilebilir).
- [x] **Ayır** aynı bileşen; düğme parçaları PDEfe'de açar (inceleme turu, aşağıda).
- [x] **Seçilmeyen yollar**: Format Değiştir'in sonuçlarını PDEfe'de açmak (kullanıcı "varsayılan uygulamayla" dedi; UDF / Word / TIFF / JPG'yi PDEfe açamaz);
  her satırın Aç'ını korumak (kullanıcı kaldırmak istedi); ortalı blok + sola dayalı satırlar (farklı uzunluktaki adlarda ortalı görünmüyor); kaydı ana
  süreçte tutmadan arayüzün verdiği yolu açmak (arayüzde kod çalışırsa her dosya / program açılabilirdi).
- [x] **Testler**: senaryo41 4. bölüm (eski kodla 4 HATA, sonra betik durdu: düğme yok): tek Word, karışık liste, gerçek PDF → UDF × 2, program hatası iletisi,
  silinmiş dosya, izinsiz yollar, göreli yol, tek "Aç", 12 sayfalık JPG'de kaydırılan liste ve soru, Ayır. guvenlik_birim'e 5 denetim. senaryo38 2. ve 5.
  bölüm, senaryo37 6. bölüm, mac_renderer güncellendi.

#### 0.2.8: sonuçta uyarı paragrafı yerine ⚠; notlarda "kaşe" yok, tablolar var (madde 7)
- [x] **Karar** (ortak.js `sonucKutusuCiz`): satırın uyarısı adın altında yazmaz; adın yanında ⚠ (Kaydet bölümündeki uyarı notunun simgesi, 16 px; açık temada
  #b35c00, koyu temada #ffc83d), `role="img"`, `tabindex="0"` (klavyeyle odaklanır), `aria-label` "Uyarı: …", ipucu uyarının kendisi. Hata (dosya
  dönüştürülemedi) adın altında yazmaya devam eder (neden görünmeli).
- [x] **Ne zaman ⚠** (donustur.js `_sonucUyarisi`): yalnızca dosyaya özgü bir uyarı varsa ("fark ettiğinde"): çekirdeğin uyarısı (alınmayan resimler, yazı
  tanıma, alınmayan yorumlar, yazıcı yolu…), UDF'nin yaklaşık çizimi, önceki dönüştürmeden kalan JPG sayfaları. İpucu "<Kaynak> → <Hedef>: <kalite notu>" ve
  alt satırlarda o uyarılar. Kalite notu tek başına simge çıkarmaz (her dönüştürmede aynı; hedef seçilince girdi satırında zaten yazıyor). "Aynı adlı
  dosyalar vardı; … yeni adla kaydedildi." uyarı değil, bilgi: adın ipucunda.
- [x] **Metinler** (core/islemler/donustur.py KALITE_NOTLARI, udf_yaz.py): PDF / Word → UDF "Satır, sayfa düzeni ve tablolar UDF'de kayabilir; imza gibi resimler
  alınmayabilir."; PDF / UDF → Word "Sayfa düzeni ve tablolar Word'de birebir korunmayabilir."; TIFF / görüntü → UDF "Yazılar görüntüden tanınarak
  çıkarılır; harf yanlışları olabilir, düzen ve tablolar kayabilir."; alınmayan resim "N resim (imza, doğrulama kodu gibi) alınmadı: UDF'de resim yalnızca
  satırın içinde durabilir." (önceden iki satırlık, "kaşe"li); yazı tanıma "Taranmış sayfaların yazısı yazı tanımayla çıkarıldı; harf yanlışları
  olabilir.". Kod yorumlarındaki "kaşe" (iç açıklama) değişmedi.
- [x] **Seçilmeyen yollar**: kalite notu olan her satırda ⚠ (PDF → Word'ün her sonucunda simge olurdu); uyarıyı tıklayınca açılan kutuda göstermek (ipucu
  istendi); "(1)" notunu ⚠'ye koymak (sorun değil, bilgi); çekirdek uyarılarını arayüzde eşlemeyle kısaltmak (kırılgan).
- [x] **Testler**: senaryo41 5. bölüm (eski kodla 2 HATA, sonra betik durdu); donustur_testi `kalite_notlari` +3 denetim (eski çekirdekle 3 HATA);
  udf_donusum_testi `dusen_resim` (yeni; eski çekirdekle HATA); senaryo39, senaryo40 ve udf_yaklasik (⚠ ipucunda "görünüm yaklaşık") güncellendi.

#### 0.2.8: alttaki bildirim yalnızca sonuç kendiliğinden açılınca (madde 11)
- [x] **Karar**: Format Değiştir'de sonuç pencerede gösterilince bildirim yok (0.2.7'de "Dönüştürüldü: ad" / "N dosya dönüştürüldü." / "Dönüştürüldü: N görüntü
  dosyası"). Tek PDF sonucu sekmede açılınca kısa "Dönüştürüldü: <ad>" (0.2.7'deki "· N sayfa · N KB" kalktı; 0.2.7'nin açık konusu kapandı); uyarısı varsa
  sonuna eklenir (o durumda sonuç listesi yok). Ayır'da çok dosyalı sonuç kutusu gösterilince "N dosya oluşturuldu." kalktı; "Üzerine yaz"da belge sekmede
  açılır, bildirimi kaldı. Birleştir sonucu her zaman sekmede açar: bildirimi değişmedi (boyutu yazıyor; UYAP'a yüklemede önemli). Değişmeyenler: iptal,
  geç iptal ("İptal edilemeden tamamlandı: …"), hatalar, araç içi bilgiler ("Dosya zaten listede.").
- [x] **Seçilmeyen yollar**: Birleştir'in bildirimini kısaltmak (kullanıcı yalnızca "otomatik açılmayanlarda çıkmasın" dedi); geç iptal bildirimini kaldırmak.
- [x] **Testler**: senaryo41 6. bölüm (eski kodla 4 HATA); senaryo37 6. bölüm ve senaryo39 3. bölüm beklentileri.

#### 0.2.8: araçlarda seçilen klasör hep kullanılır (madde 8)
- [x] **Karar** (ortak.js): `ciktiSecici`'ye `klasorSecildi` geri çağrısı; `kayitSecimi` onu `ciktiKlasorunuHatirla(baglam, klasor)` ile bağlar. Değiştir'de
  kaydetme penceresinde (ad + klasör) ya da birden çok dosyada klasör seçme penceresinde seçilen klasör ve klasör bilinmediğinde işlemden önce sorulan
  klasör Ayarlar'daki "Araçların çıktı klasörü" (`ciktiKlasoru`) olur: `baglam.ayarKoy` → ana süreç 'ayar:koy' (öteki pencereler 'ayar:degisti' ile alır,
  electron-store'da kalır). Bütün araçlar aynı `kayitSecimi`'ni kullandığı için hepsinde geçerli. Klasör ayardakiyle aynıysa yazılmaz. Ayardaki klasör
  yoksa araçlar Masaüstü'nü önerir, ayar silinmez (çıkarılabilir disk takılınca yine kullanılır).
- [x] **Ayarlar › Kaydetme**: açıklama "… Bir araçta Değiştir ile başka bir klasör seçilince burası da o klasör olur; bütün araçlar, yeniden değiştirilene
  dek onu kullanır. Boşsa ya da klasör bulunamazsa Masaüstü kullanılır."; klasör yoksa yolun altında uyarı renginde "Bu klasör bulunamadı; yerine Masaüstü
  kullanılır." (ayarlar.css `.ayar-yol-not`). Seç / Temizle aynı. Ek: `bilinenKlasorler`'in boş yanıtı da {} sayılıyor (Mac çerçeve testinde null yanıt
  `varsayilanCiktiKlasoru`'nu düşürüyordu).
- [x] **Seçilmeyen yollar**: araç başına ayrı klasör (kullanıcı "tüm araçlar için … hep aynı yere"); yalnızca oturum boyunca (kullanıcı "tekrar değiştirilene
  kadar"); klasör yoksa ayarı silmek (takılı olmayan disk kaybolurdu); belgenin "Farklı kaydet"ini de bağlamak (araç değil).
- [x] **Testler**: senaryo42 (yeni; eski kodla 16 HATA / 22): Masaüstü varsayılanı, vazgeç / yalnızca ad, Sıkıştır → Döndür / Sayfaları düzenle / Sıkıştır,
  Format Değiştir (klasör seçme) → Ayır / Birleştir, Ayarlar kartı, silinen klasör ve not, işlemden önce sorulan klasör, Masaüstü'ne dosya yazılmadığı.
  mac_renderer'a macOS ve Windows yollarıyla 4 denetim.
- [x] **Not**: ilk "önce düşen" koşumda betiğin araç kapatma yardımcısı Birleştir'in "kaydedilmemiş" sorusuna Kaydet dedi; eski kod Masaüstü'nü önerdiği için
  gerçek Masaüstü'ne bir test belgesi yazıldı, Geri Dönüşüm Kutusu'na gönderildi. Betik artık "Kaydetme" diyor ve Masaüstü'ne dosya yazılmadığını denetliyor.

#### 0.2.8: güncelleme denetimi iki günde bir (madde 12)
- [x] **Karar**: `src/main/guncelleme.js` `DENETIM_ARALIGI_MS` 7 → 2 gün. Gerisi aynı: açılışta sırası geldiyse (pencere gösterildikten 6 sn sonra), PDEfe
  açık kalırsa saatlik bakışta süre dolunca; sunucudan yanıt alınmazsa süre başlamaz; elle denetim süreye bakmaz; bekleyen / yarım indirme sonraki açılışta
  süreye bakılmadan bir kez denetlenir (0.2.5). Ayarlar › Güncelleme: "Güncellemeleri otomatik denetle (iki günde bir)".
- [x] **Seçilmeyen yollar**: her açılışta denetlemek (istek iki gün); süreyi ayara bağlamak (istenmedi).
- [x] **Testler**: test/guncelleme-e2e/birim.mjs 84/84 (gün beklentileri iki güne çevrildi, "3 gün: sıra geldi" eklendi; eski kodla 8 HATA); senaryo14 (eski
  kodla 1 HATA); mac_renderer'daki Windows açıklaması.

#### 0.2.8: yazdırma penceresi her açılışta "Tümü" (madde 13)
- [x] **Kök neden**: `src/renderer/yazdir.js` `sonSecenek` (modül düzeyinde, pencere başına) son yazdırmanın aralığını ve aralık metnini oturum boyunca
  tutuyor, sonraki her açılışta (başka belgede de) onu seçiyordu.
- [x] **Karar**: Sayfalar her açılışta Tümü; aralık metni boş; "Geçerli sayfa" da hatırlanmaz. Kalıcı seçimler (yazıcı, harmanla, kâğıt, boyut, renk, çift
  taraflı; ayar `yazdirma`) aynı. "Notları yazdır" oturum boyunca hatırlanmaya devam ediyor (kullanıcı yalnızca sayfa seçimini sordu); kopya her açılışta 1.
- [x] **Seçilmeyen yollar**: aralığı belge başına hatırlamak (kullanıcı "her zaman" Tümü istedi); "Notları yazdır"ı da sıfırlamak (istenmedi).
- [x] **Testler**: yazdir_pencere 5. bölüm ("2-3" yazdırıldıktan sonra Tümü, "Geçerli sayfa"dan sonra Tümü, başka belgede Tümü; eski kodla 4 HATA).

#### 0.2.8: boş "Yeni sekme" pencereye ayrılır (madde 14)
- [x] **Kök neden**: 0.1.19'dan beri yalnızca belge sekmesi ayrılabiliyordu: `ayrilabilir` açılış sekmesine false, sağ tıkta "Pencereye ayır" açılış
  sekmesinde devre dışı, `tasimaEngeli` "Açılış sekmesi pencereye ayrılamaz." diyordu; sekme çubukta kalıp imleci yatayda izliyordu.
- [x] **Karar** (`src/renderer/uygulama.js`, `src/main/pencereler.js`): açılış sekmesi belgeli sekmenin yolundan taşınır. Sürüklemede ön izleme (hayalet)
  penceresi açılış sekmesi için de açılır: ad "Yeni sekme", sayfa görüntüsü yok (240 px). `sekmeyiTasi` açılış sekmesini `bosSekmeyiTasi`'ya verir: paket
  yalnızca `{ surum: 1, baslangic: true }`, ana süreç 'sekme:tasi' aynı. Hedefte `bosSekmeyiAl`: yeni pencerede pencerenin kendi açılış sekmesi ayrılan
  sekmedir; var olan pencereye bırakılan sekme bırakıldığı yere yeni açılış sekmesi olarak eklenir ve etkin olur (öteki açılış sekmeleri kalır: kullanıcı
  taşımanın olduğunu görsün). Kaynak pencere belgeli sekmedeki kurallarla (tek sekmesi boş yere bırakılınca pencere kendisi taşınır; başka pencereye
  taşınınca kapanır). Sağ tık › "Pencereye ayır" açılış sekmesinde de etkin; pencerenin tek sekmesinde devre dışı. Yeni IPC kanalı yok.
- [x] **Seçilmeyen yollar**: boş sekmeyi hedefte tek açılış sekmesinin yerine koymak (hedef değişmemiş görünürdü); ön izlemede açılış ekranının küçük
  görüntüsü (gereksiz iş); ayrı bir "boş pencere aç" komutu (istek sürükleyip ayırmaktı).
- [x] **Testler**: senaryo43 (yeni, 31 denetim; eski kodla 3 HATA ve betik durdu): menü, menüyle ayırma, sürükleme (eşik, ön izleme, imleci izleme, bırakma),
  Esc, belgeli ve belgesiz pencereye bırakma, tek boş sekmeli pencerenin taşınması ve kapanması. senaryo22 ve senaryo23'te boş sekmenin ayrılmadığını
  bekleyen üç denetim yeni davranışa çevrildi. hayalet_akicilik'e boş sekme turu (ortanca ~17,8 ms, %95 ~18,3 ms; belge turuyla aynı). gercek_fare'ye `-Bos`
  kipi (görünmeyen masaüstünde gerçek Windows fare iletileri; eski kodla 5 HATA).

#### 0.2.8: bağımsız inceleme ve düzeltme turu
Altı bulgu (ikisi aynı); dördü düzeltildi, biri doğrulanamadı (açık konu).
- [x] **Ağdaki çıktı klasörüne ulaşılamayınca uygulama donuyordu** (orta): klasör ulaşılamayan bir ağ paylaşımındaysa araç ya da Ayarlar › Kaydetme açılınca
  ana süreç `fs.existsSync` ile 20–42 sn bekliyor, bütün pencereler ve IPC kilitleniyordu (senaryo42 7. bölümü eski kodda: `ayar:al` 42.083 ms). `dosya:varMi`
  eş zamansız (`fs.promises.access`), aynı yolun süren denetimi paylaşılıyor; renderer'da `klasorVarMi(pdefe, yol, 1500)`: 1,5 sn içinde yanıt yoksa klasör yok
  sayılır (araç Masaüstü'nü önerir, kart "bulunamadı" der, ayar silinmez). Seçilmeyen: yeni bir `dosya:klasorVarMi` kanalı (yeni IPC; renderer'daki zaman
  aşımı yetiyor); `dosya:varMi`'nin kendisine zaman aşımı ("zaten var" denetimi yanlış "yok" alırsa dosyanın üzerine yazılabilirdi). Test: senaryo42 7. bölüm
  (her çalıştırmada başka 10.255.255.x adresi).
- [x] **Yalnızca adı değiştiren Değiştir kalıcı ayarı Masaüstü'ne çeviriyordu** (düşük): ayardaki klasör yokken araç Masaüstü'nü önerir; yalnızca ad değişince
  ayar Masaüstü oluyordu. `klasorSecildi` yalnızca klasör açılmadan öncekinden farklıysa çağrılır. Bilinçli sonuç: klasör yokken Masaüstü bilerek seçilse de
  ayar değişmez (ad değişikliğinden ayırt edilemiyor; kalıcı Masaüstü için Ayarlar'da Temizle). senaryo42 5. ve 7. bölüm.
- [x] **Başka pencerede açık Ayarlar eski çıktı klasörünü gösteriyordu** (düşük): `ayarlarPenceresiniGuncelle` yalnızca `select[data-ayar]`'ları yeniliyordu.
  Bölüm başına `guncelleyiciler` (anahtar → işlev); Kaydetme bölümü `ciktiKlasoru` için `yolGoster`'i kaydeder. senaryo42 8. bölüm.
- [x] **Ayır'ın sonuçları PDEfe'de açılamıyordu** (düşük): 0.2.8'in ilk hâlinde Ayır'ın "Tümünü aç"ı parçaları varsayılan PDF programına gönderiyordu, 0.2.7'deki
  "Yeni sekmede aç" ve "Hepsini aç" kalkmıştı; kullanıcının "varsayılan uygulamayla" isteği Format Değiştir içindi ("Word dönüştürmede vs"). Düzen aynı kaldı;
  Ayır'da düğme parçaları PDEfe'de açar: araç kapanır, ilk parça önde, öbürleri arkada yeni sekmelerde; 10'dan çok parçada önce sorulur ("N belge PDEfe'de
  açılsın mı?"), bir kerede en çok 50 (0.2.7'nin sınırı). `sonucKutusuCiz`'e `ac` ve `acIpucu`. senaryo41 4e.
- [ ] **Windows'ta türü açan program yokken** (düşük, doğrulanamadı; düzeltme yok): UYAP Doküman Editörü yokken "Tümünü aç" her UDF için Windows'un "Bu
  dosyayı nasıl açmak istiyorsunuz?" penceresini açabilir, PDEfe'nin "program bulunamadı" iletisi çıkmaz (bu bilgisayarda `HKCR\Unknown\shell`'in varsayılan
  fiili `openas`; `shell.openPath` büyük olasılıkla başarı döner). Gerçek sınama ilişkisiz bir türde gerçek kabuğu çalıştırmayı (kullanıcının ekranında
  pencere) gerektirir; güvenilir ön denetim `AssocQueryString` ister (Electron'da yok). Kullanıcının iki bilgisayarında da editör kurulu: DOGRULAMA 43.
- [x] **Kapsam dışı not**: `metindekiYollar` (pano, `fs.statSync`) ve `udfYaklasik.js bosAd` (`fs.existsSync`) da eş zamanlı; ilki panodaki yol listesinde,
  ikincisi yalnızca klasör erişilebilirken çalışıyor.

#### 0.2.8: belgeler
- [x] Sürüm 0.2.8 (package.json, package-lock.json); CHANGELOG; docs/DOGRULAMA.md 43; README: Sekmeler ve pencereler (boş sekme), Araçlar (Ayır'ın Tümünü
  aç, kalıcı kayıt klasörü), Format Değiştir (PDF → UDF / Word notları, sonuç kutusu, ⚠, Tümünü aç), Yazdırma (her açılışta Tümü), Ayarlar (çıktı
  klasörü), Güncelleme ve Verileriniz (iki günde bir).
- [x] README'deki "Logolu, kaşeli sayfalar" (Görünüm) ve "yazı, kaşe ve antet" (Taranmış belgede seçim) dönüştürme uyarısı değil, taranmış belgelerin içeriğini
  anlatıyor; değişmedi.

#### 0.2.8: ekran görüntüleri, paket ve son sınama
- [x] **Ekran görüntüleri** (`README_OLCEK=2`, temiz veri klasörü, kurgusal belgeler `C:\Users\Public\Documents\PDEfe Örnek`'te, iş bitince silindi;
  hepsine bakıldı): açılış ekranı (açık, koyu; yeni açıklamalar, eşit karolar), Araçlar, Format Değiştir (Kaydet'te yalnızca klasör ve Değiştir;
  kalite notunda tablolar, "kaşe" yok). Birleştir yeniden çekildi, öncekiyle bayt bayt aynıydı: değiştirilmedi.
- [x] **Paket** (HEAD 08c2867; `npm run cekirdek:derle` 31 sn, çekirdek ping OK; `npx electron-builder --win --publish never`): PDEfe-Setup.exe
  147.872.886 bayt (0.2.7'den +7,5 KB), SHA-256 `740452C3…0874`, exe sürümü 0.2.8; İndirilenler'de `PDEfe-Setup-0.2.8.exe`. Kurucu çalıştırılmadı.
  Paketli sınama (görünmeyen masaüstünde `release\win-unpacked\PDEfe.exe`): paket_duman 18/18 (sürüm 0.2.8), gercek_fare `-Paketli` 9/9 ve `-Paketli
  -Bos` 9/9; paketli çekirdekle donustur_testi `--exe --hizli` 187/187, udf_donusum_testi `--exe` 119/119 (UDE ile), word_donusum_testi `--exe` 19/19
  (`PDEFE_WORD_YOK=1`). Sonra `release\win-unpacked` ve `core\dist` silindi.
- [x] **Son regresyon** (HEAD 08c2867; her test kendi temiz örneğinde, sırayla): senaryo41 52/52, senaryo42 32/32, senaryo43 31/31, senaryo37 64/64,
  senaryo38 64/64 (sahte yazıcılar), senaryo39 54/54 (görünmeyen masaüstü), senaryo40 23/23 ve udf_yaklasik 63/63 (`PDEFE_UDE_YOK=1`), senaryo26 64/64,
  senaryo17 43/43, senaryo36 59/59, kisayol_araclar 102/102, ortu_tiklama 164/164, arac_onizleme 24/24, gec_iptal 20/20, yazdir_pencere 47/47,
  mac_renderer 44/44, senaryo22 102/102, senaryo23 53/53 (aşağıda), sekme_genislik 38/38, serit_olculeri 25/25, hayalet_akicilik 7/7 (belge ve boş sekme
  turunda ortanca ~17,7 ms, %95 ~18,2 ms), kisayol_dosya 164/164, senaryo13 65/65, senaryo14 60/60, senaryo18 10/10, senaryo19 112/112, senaryo20 52/52,
  acilis_hizasi 10/10. Node: guvenlik_birim 109/109, güncelleme birim 84/84, cekirdek_iptal 7/7. Python (geliştirme çekirdeği): donustur_testi 216/217
  (aşağıda), udf_donusum_testi 133/133 (UDE ile), word_donusum_testi 32/32 (`PDEFE_WORD_YOK=1`), guvenlik_testi 47/47, mac_cekirdek_testi 14/14.
- [x] **Düşenler, 213dce0'la karşılaştırma** (çalışma ağacı, bağlantılar önce kaldırılarak silindi): senaryo23 ilk koşumda 24. denetimden sonra takıldı
  (betik, son belgesi başka pencereye taşınıp kapanan pencerede `sekmeyiTasi`'nın yanıtını bekliyordu; belgeli sekmenin bu yolu 0.2.8'de değişmedi); tek
  başına iki kez 53/53, 0.2.7 ağacında da iki kez 53/53: testin ara sıra görülen zamanlama sorunu. donustur_testi "dış süreç: süre dolunca öldürülür"
  (sınır 5 sn; 1 sn süreli dış süreç 4,2–5,1 sn'de öldürülüyor): 0.2.8'de tek başına 3/3, 0.2.7 ağacında 1/3 (4,9–5,2 sn): bu bilgisayarın hızından, kod
  değişmedi. Gerileme yok; kod düzeltmesi ve yeniden derleme gerekmedi.
- [x] araclar_testi koşulmadı: istediği test belgeleri (`Desktop\PDF DENEME`) bu bilgisayarda yok; çekirdeğin araçları (araclar.py) 0.2.8'de değişmedi.
- [x] Temizlik: test örnekleri port üzerinden kapatıldı (kalan electron / PDEfe süreci yok); %TEMP%'teki `pdefe-*` test veri klasörleri (bu revizyonun
  gruplarından kalan 65 klasör) ve karşılaştırma çalışma ağaçları silindi. Kullanıcının PDEfe'sine, Word'üne ve UYAP Doküman Editörü'ne dokunulmadı.

#### 0.2.8: sınama özeti (gruplar ve inceleme turu)
- [x] Arayüz (her test kendi temiz örneğinde, ekran dışında ya da görünmeyen masaüstünde): senaryo41 52/52 (%100, koyu tema; inceleme turundan
  sonra) ve 39/39 (%125, açık tema), senaryo42 32/32 (inceleme turundan sonra), senaryo43 31/31, senaryo38 64/64 (sahte yazıcılarla) ve 27/27 (%125), senaryo37 64/64 (Word dönüştürmesi `S37_WORD` olmadan atlandı),
  senaryo39 54/54, senaryo40 23/23 ve udf_yaklasik 63/63 (`PDEFE_UDE_YOK=1`), senaryo14 60/60, yazdir_pencere 47/47, mac_renderer 44/44, senaryo17 43/43,
  senaryo26 64/64, senaryo22 102/0, senaryo23 53/0, hayalet_akicilik 5/5, gercek_fare 9/9 ve `-Bos` 9/9, kisayol_araclar 102/102, ortu_tiklama 164/164,
  arac_onizleme 24/24, senaryo19 112/112, gec_iptal 20/20, senaryo13 65/65, kisayol_dosya 164/164, sekme_genislik 38/38, senaryo20 52/52, acilis_hizasi 10/10.
- [x] Node / Python: guvenlik_birim 109, güncelleme birim 84/84; donustur_testi 216/217 (tek HATA "dış süreç: süre dolunca öldürülür" 5,5 sn > 5 sn, arayüz
  testleriyle aynı anda koşulurken; tek başına 3/3), udf_donusum_testi 133/133 (UDE ile).
- [ ] **Açık konular**:
  - "Tümünü aç" gerçek varsayılan programlarla denenmedi (test örneğinde program açılmaz): UDF → UYAP Doküman Editörü, Word, JPG, PDF; DOGRULAMA 43.
    Editörsüz bilgisayarda UDF için Windows'un "Birlikte aç" penceresi (inceleme turu, yukarıda).
  - Birleştir'in sekmede açılınca çıkan bildirimi değişmedi (boyutu yazıyor); kullanıcı isterse kısaltılır.
  - Ayır'ın "Tümünü aç"ı parçaları PDEfe'de açıyor (inceleme turunun kararı); kullanıcı varsayılan programı isterse bir satırla değişir.
  - Gerçek bellek ve ağ klasörüyle kalıcı çıktı klasörü denenmedi (ağ klasörü var olmayan bir adresle benzetildi).
  - Mac'te denenmedi (mac_renderer'ın darwin çerçevesinde "Finder'da göster", "Tümünü aç" ve çıktı klasörü yolları doğru).
  - Paketli çekirdekte Word → PDF gerçek Word'le denenmedi (`PDEFE_WORD_YOK=1`; Word yolu 0.2.8'de değişmedi). Kurucu bu bilgisayara kurulmadı.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 43.

### Revizyon 0.2.9 (2026-10-16, kullanıcı istekleri: görüntüler A4 boyutunda, Birleştir'de sayfa seçeneği yok; Birleştir'in açıklaması; Format Değiştir'in bildirimi ve Dönüştür düğmesi; 0.2.6–0.2.8 değişikliklerinin kod ve kişisel veri denetimi)
Ayrıntı: CHANGELOG.md. Kullanıcının beş maddelik isteği (özet): (1) "Görüntü dosya formatlarını birleştirirken veya PDF'e format dönüştürürken
görüntülerin A4 boyutunda kalmasını sağlayalım. Çözünürlükten bahsetmiyorum, boyuttan bahsediyorum. Bunu sağlayacağımız için … görüntü
birleştirirken sayfa seçeneğini kaldıralım."; açıklaması: "A4 sayfasını hiçbir durumda göstermeyeceğiz. Max boyutlar A4 boyutunda olacak. Dikeyse
dikey, yataysa yatay A4."; (2) Birleştir'in açıklaması "Dosyalardan tek PDF oluşturur, farklı dosya formatlarıyla çalışabilir"; (3) Format
Değiştir'in beyaz bildiriminde "Dönüştürüldü" yerine "Format değiştirildi"; (4) işlem sürerken Dönüştür düğmesi etkin görünüyor, soluk olsun;
(5) PDEfe-Test'teki bütün değişikliklerle birlikte kodların denetlenmesi, anormal bir şey olup olmadığının sınanması, kişisel veri denetimi.
Gönderme, etiket ve sürüm yayımı yok: yalnızca yerel commit'ler (asıl depo 0.2.5'te; 0.2.6–0.2.8 yalnızca bu bilgisayarda ve gizli PDEfe-Test'te).
Düzen: madde 1–4 tek grup, aynı çalışma ağacında sırayla; madde 5 için dört bölümlü bağımsız denetim (çekirdek; renderer ve ana süreç; testler ve
belgeler; kişisel veri). Kapsam `git diff 8d2f583..HEAD` (0.2.5 → 0.2.9'un ilk dört maddesi), aradaki bütün commit'ler ve HEAD'deki bütün izlenen
dosyalar. Sonra bulguların düzeltmesi; belgeler, paket ve son sınama. Her madde ayrı commit'ler, önce düşen testlerle. Electron yalnızca ekran
dışındaki (`test/baslat.ps1`) ya da görünmeyen masaüstündeki (`test/baslat_gizli.ps1`) örnekte başlatıldı; kullanıcının PDEfe'sine, Word'üne ve
UYAP Doküman Editörü'ne dokunulmadı.

#### 0.2.9: görüntü sayfaları A4'e sığan ölçüde; Birleştir'de sayfa seçeneği yok (madde 1)
- [x] **Kök neden (0.2.8)**: üç ayrı kural vardı. Birleştir "Orijinal" (varsayılan): TIFF karesi 0.2.6'nın dpi kuralıyla (geçerli etiket ya da uzun
  kenarı A4'ün uzun kenarı), öteki görüntüler 72 dpi (uzun kenarı 2500 pikseli geçerse 300 dpi): 4032 × 3024 telefon fotoğrafı 34 × 26 cm, 1200 × 900
  ekran görüntüsü 42 × 32 cm, 300 × 200 piksellik görüntü 10,6 × 7,1 cm. Birleştir "A4'e sığdır": beyaz A4 sayfa, kenar boşluğu (varsayılan 10 mm),
  görüntü ortada. Format Değiştir görüntü → PDF (0.2.7): dpi etiketi 100–1200 ise o (Letter boyunda 150 dpi tarama 21,6 × 27,9 cm, 600 dpi küçük
  fotoğraf küçücük sayfa), yoksa uzun kenarı A4'e oturtan dpi; çok küçük görüntü 72 dpi. TIFF → PDF (0.2.6): geçerli etiket (50–1200) ya da A4 kuralı.
- [x] **Karar** (tek ortak işlev `core/islemler/araclar.py` `a4_sayfa_olcusu(g, y, dpi=None)`): her görüntü sayfası görüntünün kendisidir (beyaz kenar
  ya da beyaz A4 sayfa yok); ölçüsü görüntünün oranı korunarak A4'e sığan en büyük ölçü: dikey ya da kare görüntü 210 × 297 mm'lik kutuya, yatay
  görüntü 297 × 210 mm'lik kutuya. Bir kenar A4'ün kenarına eşit, öbürü orana göre (≤). Küçük görüntü büyür, büyük küçülür: yalnızca sayfa ölçüsü;
  pikseller yeniden örneklenmez, yeniden kodlanmaz (JPEG baytları olduğu gibi, 1 bit TIFF G4 / Flate kayıpsız). Dikey / yatay, EXIF yönü (ve
  Birleştir'de satırın döndürmesi) uygulandıktan sonraki görünen ölçüyle; kare dikey sayılır. Oran piksel oranıdır; yalnızca yatay ve dikey çözünürlük
  etiketi farklıysa (faks taraması 204 × 98 dpi gibi; ikisi de 50–1200) piksel / dpi oranı (yoksa sayfa yarı yarıya basık çıkardı). Kullanıcıya
  "A4 sayfasını hiçbir durumda göstermeyeceğiz" böyle yorumlandığı söylendi: beyaz A4 sayfa yok, sayfa görüntünün kendisi, en büyük ölçüsü A4.
- [x] **Kapsam**: Birleştir'in görüntü ve TIFF girdileri; Format Değiştir'de görüntü → PDF ve TIFF → PDF; bunların zincirleri (görüntü / TIFF → UDF,
  Word, TIFF, JPG PDF üzerinden; JPG / TIFF hedefinde taranmış sayfa kendi çözünürlüğünde kaldığı için piksel sayısı değişmez). PDF, UDF ve Word
  girdileri kendi sayfa ölçülerini korur. Örnekler: 3:4 fotoğraf 210 × 280 mm, 4:3 fotoğraf 280 × 210, A4 taramalar 210 × 297 (2480 × 3508 tarama
  209,97 × 297 mm; yuvarlanınca A4), Letter tarama 210 × 271,8, kare 210 × 210.
- [x] **Kaldırılanlar**: Birleştir satırındaki "Sayfa" seçimi (A4'e sığdır / Orijinal) ve "Kenar … mm" kutusu (`gorselBirlestir.js`, araclar.css);
  çekirdekte `sayfaBoyutu` / `kenar` (gelirse yok sayılır), 0.2.6'nın TIFF dpi kuralı (`tiff_dpi_coz`, standart değere yuvarlama, 72 dpi varsayımı),
  görüntünün dpi etiketi kuralı (`GORSEL_DPI_EN_AZ`). Ana süreç (guvenlik.js `birlestirOgesi`) bu iki alanı artık çekirdeğe geçirmez (bilinmeyen alan
  gibi atılır; eski değer zararsız).
- [x] **Ayar**: sayfa boyutu kalıcı bir ayar değildi (satır başına, her eklemede "Orijinal"); `ayarlar.json`'da anahtarı yok, KALDIRILAN_ANAHTARLAR'a
  eklenecek bir şey çıkmadı.
- [x] **Sonuç bilgisi**: TIFF → PDF ve görüntü → PDF sonucundaki ve donusum_bilgi'deki `dpi` artık sayfanın gerçek çözünürlüğü (piksel / sayfa inçi,
  ilk sayfa); `dpiKaynagi` kalktı (arayüzde kullanılmıyordu).
- [x] **Kalite seviyeleri** (Birleştir'de Yüksek / Orta / Düşük) eskisi gibi sayfadaki fiziksel ölçüye göre küçültür; sayfa artık A4'e sığan ölçü.
  Boyut tahmini aynı işlevle (ön bellek anahtarında sayfa boyutu ve kenar yok; görüntüde döndürme var: sayfanın yönü değişir).
- [x] **Görüntüden ve TIFF'ten yapılan UDF'nin kâğıdı A4** (denetimin bulgusu 1, aşağıda): yatay A4'e sığan sayfayı `udf_yaz` UYAP Doküman Editörü'nün
  kâğıtlarından "en yakını" sayıp Letter ya da A5 seçiyordu.
- [x] **Seçilmeyen yollar**: A4'e çok yakın oranlı taramayı tam A4'e "yapıştırmak" (oran bozulurdu; kullanıcı oran korunsun dedi); dpi etiketine göre
  gerçek ölçü (kullanıcı "çözünürlükten bahsetmiyorum" dedi); Birleştir'de beyaz A4 sayfayı seçenek olarak bırakmak (kullanıcı seçeneğin kalkmasını
  istedi).
- [x] **Testler**: donustur_testi `a4_olcusu` (yeni, 12 girdi: 3:4, 4:3, A4 taramalar, Letter, kare, çok küçük ve çok büyük, EXIF 90°, faks; JPEG ve G4
  verisi aynı) eski kodla 26/41 (15 HATA); araclar_testi birlestir/A4 (yeni) eski kodla 3/16; guvenlik_birim'e bir denetim (eski guvenlik.js'le HATA);
  eski beklentiler yeni kurala göre (araclar_testi, donustur_testi, senaryo13 7. bölüm, senaryo39 2. bölüm: etiketsiz 1654 × 1240 PNG 794,1 × 595,3 pt).

#### 0.2.9: Birleştir'in açıklaması (madde 2)
- [x] **Karar** (aracPenceresi.js ARACLAR; Araçlar penceresi ve açılış ekranı aynı listeyi gösterir): "Dosyalardan tek PDF oluşturur, farklı dosya
  formatlarıyla çalışabilir" (kullanıcının yazdığı gibi; 0.2.8'de "Birleştirir, farklı dosya formatlarıyla çalışabilir"). İpucu (title) değişmedi.
  Karolar eşit yükseklikte kalır (0.2.8 kuralı).
- [x] **Sonuç**: metin açılış ekranının üç sütununda (karoda yazıya ~181 px) üç satıra kırılıyor (iki satıra sığması için ~225 px gerekirdi; sütun 820 px
  kullanıcının 0.2.6 kararı). Araçlar penceresinde de üç satır, karolar 130 px (değişmedi). Eşit yükseklikteki karolar bir satır uzadı: alçak pencerede
  (≤ 860 px) 1280 × 700'de 10 belgeyle 30 px taşıyordu (senaryo20 48/52). Karar (stil.css, yalnızca alçak pencere): karoların üst / alt iç boşluğu
  7 → 5, açıklamanın satır yüksekliği 1,3 → 1,2, son açılanların satırları 38 → 34 px (≈ 35 px kazanç); yazı boyları, sütunlar, PDF aç değişmedi.
  Sonra senaryo20 52/52.
- [x] **Ölçütler**: kartlar alçak pencerede 79 px, PDF aç 86 px: acilis_hizasi'nin "PDF aç kartlardan ≥ 10 px yüksek" payı her genişlikte 4 px,
  senaryo19'un "PDF aç ≥ 1,1 × kart" ölçütü her genişlikte 1,05 (oran 1,09; alan oranı 2,2 kaldı). Yüksek pencerede karolar ~100 px, PDF aç 86 px.
- [x] **Seçilmeyen yollar**: açıklamayı kısaltmak ya da iki satırda kesmek (kullanıcı metni yazdı); yazı boyunu küçültmek; sütunu genişletmek;
  karoları satır başına eşitlemek (0.2.8'in "bütün karolar aynı boyda" kararı).

#### 0.2.9: "Format değiştirildi: <ad>" (madde 3)
- [x] **Karar** (donustur.js `_sonucGoster`): sonuç sekmede kendiliğinden açılınca alttaki beyaz bildirim "Format değiştirildi: <ad>" (0.2.8'de
  "Dönüştürüldü: <ad>"); uyarı varsa ardından. Pencere içindeki sonuç kutusunun başlığı ("Dosya dönüştürüldü") ve iptal / hata bildirimleri
  kullanıcının isteğinde yok: değişmedi.
- [x] **Testler**: senaryo41 6c, senaryo37 6. bölüm ve udf_yaklasik'in beklentisi yeni metin; senaryo39'un "bildirim yok" denetimi iki metne de bakıyor.

#### 0.2.9: Dönüştür işlem sürerken soluk (madde 4)
- [x] **Kök neden**: `_donusturBir` düğmeyi (`_durumGuncelle` → `_dugmeGuncelle`) IslemIlerleme.calistir başlamadan, `calisiyor` henüz false iken
  güncelliyordu: düğme etkin göründü; işlem boyunca başka güncelleme gelmediğinden etkin kaldı (ikinci basış `_suruyor` yüzünden bir şey yapmıyordu).
  Pencerenin gövdesi `.mesgul`le soluyor, alt şeritteki düğme soluklaşmıyordu.
- [x] **Karar**: `_dugmeGuncelle` `_suruyor`'a da bakar (Dönüştür'e basıldığı andan iş bitene dek: "zaten var" sorusu, dönüştürme, sonuç);
  `donustur()` başında düğme hemen soluk. Bitince `_durumGuncelle` 0.2.7'nin kuralını uygular (başarılı dönüştürmeden sonra bir şey değişene dek soluk;
  hiçbir dosya dönüşmediyse etkin).
- [x] **Testler**: senaryo44 (yeni; 0.2.9'un dört maddesi: Birleştir'in açıklaması ve eşit karolar, satırda Sayfa / Kenar yok ve görüntü sayfaları A4'e
  sığan ölçüde, "Format değiştirildi" bildirimi, Dönüştür'ün işlem boyunca soluk kaldığı: her 15 ms'de ve her öznitelik değişiminde kayıt); eski
  arayüzle 20 denetimin 6'sı HATA, sonra 20/20 (%100 ve %125 ölçek).

#### 0.2.9: kod ve kişisel veri denetimi (madde 5)
- [x] **Yöntem**: dört bağımsız bölüm (çekirdek; renderer ve ana süreç; testler ve belgeler; kişisel veri). Kod okuma, deneyler (eski ve yeni
  çekirdekle aynı girdiler, 0.2.8 çalışma ağacıyla karşılaştırma), testleri koşma, kalıp aramaları (kullanıcı ve büro adı, kullanıcı klasörü,
  `Users\<ad>` yolları, e-posta, telefon, T.C. kimlik, IBAN, esas no kalıpları, gerçek belge adları, marka adları), commit iletileri ve yazar
  bilgileri, depodaki PNG / PDF / jar dosyalarının üst verisi. Kişisel değerler rapora yazılmadı (yalnızca dosya:satır ve tür).
- [x] **Sonuç**: 23 bulgu (ikisi yüksek, dördü orta, 17'si düşük). Her bulgu önce yeniden doğrulandı (deneyle ya da kod izlenerek); 21 commit'te
  düzeltildi (`6e25ffa` … `d0614f9`, aşağıda). Kişisel veri: HEAD'deki izlenen dosyalarda ve commit iletilerinde kullanıcının ya da büronun adı,
  kullanıcı adı, kişisel yol, e-posta, telefon, kimlik / IBAN numarası, gerçek belge adı ya da metni, esas numarası, marka adı bulunmadı. Bulunanlar:
  büronun yazıcısının model adı (kişisel veri sayılmaz; değiştirildi, geçmişteki üç commit'te kalıyor), geliştiricinin iki gizli projesinin iç dosya
  yolları (değiştirildi), UDF çizim motorunun kaynağı olarak eklentinin adı (lisans atfı; kullanıcıya soruluyor). Kişisel veri depoda değil
  kullanıcının kayıt defterinde bozulmuştu: eski sınamalar Word'ün "Son kullanılanlar" listesini bozuyordu (bulgu 2).
- [x] **1. Görüntü / TIFF → UDF'te kâğıt A4 değildi** (yüksek, 0.2.9'un madde 1'inden gerileme; `6e25ffa`): denetimin deneyinde (0.2.8 ve HEAD
  çekirdeği) 4:3 ve 3:4 fotoğraf, 72 dpi 4:3 → Letter; kare → A5; 16:9 ve A4 tarama → A4. Kök neden: görüntünün PDF sayfası A4'e sığan en büyük ölçüde
  (793,7 × 595,3 pt); `udf_yaz._sayfa_bicimi` UDE'nin kâğıtlarından |Δg| + |Δy| ile en yakınını seçiyordu (Letter 18,4 < A4 48,2). Karar: sayfa hiçbir
  UDE kâğıdıyla 3 pt içinde tutmuyor ama (yönüyle) A4'e sığıyorsa kâğıt A4 (`_a4e_sigar`). Gerçek A5 / B5 / Letter belgeler kendi kâğıdında. Yalnızca
  resim olan sayfalarda (görüntü, TIFF, tarama; `sf.taranmis`) sayfa ölçüsü uyarısı yok; yazılı sayfada "… kâğıtlarında yok; belge A4 kâğıda kondu".
  Seçilmeyen: kâğıdı yalnız görüntü / TIFF zincirinde A4 yapmak (görüntünün PDF'i sonra PDF → UDF'e verilince yine Letter olurdu); sağ kenarı kâğıt
  genişliğine göre yeniden hesaplamak (tam tutan kâğıtlarda da kenarlar değişirdi). Test: `udf_donusum_testi --yalniz gorsel_kagit` (yeni) önce
  10/16 (6 HATA), sonra 16/16; foto_4x3, kare ve Letter TIFF UDF'leri UDE 5.4.20 ile PDF'e çevrildi: 841,9 × 595,3 / 595,3 × 841,9 pt.
- [x] **2. Sınamalar Word'ün "Son kullanılanlar" listesini bozuyordu** (yüksek; `58ff6d0`): salt okunur WMI ile yalnızca sayıldı: Word'ün gerçek
  HKCU listesinde 127 kaydın 21'i sahte ev yollu (17'si `%TEMP%\pdefe-sahte-ev`, 2024-09 – 2026-09-27; 4'ü 0.2.9 uygulamasının scratch'teki sahte
  evi: ikisi File MRU, ikisi Place MRU). Dosya adları yazılmadı. Kök neden: notlardaki sınama düzeni eski testler için USERPROFILE'ı sahte eve
  çevirtiyordu; Word bu ortamla başlayınca listeyi o yollarla yeniden yazıyor. Karar: `test/ev_denetimi.py` (yeni: `ornek_klasoru()`,
  `ev_degistirilmis()`, `word_icin_denetle()`: ev değişmişse PDEFE_WORD_YOK=1 ve uyarı); araclar_testi, kopyalama_testi, senaryo13 örnek klasörünü
  PDEFE_TEST_PDF_KLASORU'ndan alır; araclar_testi ve word_donusum_testi sahte evde Word'ü başlatmaz; `baslat.ps1` / `baslat_gizli.ps1` USERPROFILE'da
  NTUSER.DAT yoksa örneğe PDEFE_WORD_YOK=1 verir; notlarda "USERPROFILE'ı değiştirme". Seçilmeyen: 21 kaydı düzeltmek (paket dışı kayıt yazımı:
  kullanıcı onayı gerekir, soruluyor); çekirdekte Word'den önce ortamı düzeltmek (sahte evle çekirdeği yalnızca sınamalar çalıştırıyor). Test:
  ev_denetimi sahte evde True / PDEFE_WORD_YOK=1, gerçek evde False; araclar_testi 144/146 (iki Sıkıştır tahmini yer tutucu belgeye bağlı),
  kopyalama_testi 31/31; MRU sayıları düzeltme turunun başında ve sonunda aynı.
- [x] **3. Test örneklerinde Masaüstü yönlendirilmiyordu** (orta; `28332cf`): çıktı klasörü ayarı boşken araçlar Masaüstü'ne yazar; bir betik ayarı
  boşaltıp sonraki betik açık bir aracı "Kaydet"le kapatınca çıktı gerçek Masaüstü'ne düşebiliyordu (0.2.8 sınamasında oldu). Karar: test örneğinde
  (PDEFE_VERI_KLASORU) desktop / documents / downloads → `<veri>\test-klasorleri\{Masaustu,Belgeler,Indirilenler}` (gelistirme.js); senaryo42'ye
  "0)" denetimi ve gerçek Masaüstü sayımı; senaryo5 sonunda kalıcı `__pdefeOtoYanit`'ı siler. Kurulu PDEfe'de değişiklik yok. Test: senaryo42 eski
  gelistirme.js ile "0)" HATA, yenisiyle 34/34.
- [x] **4. Format Değiştir'de PDEfe'de açık hedef PDF'e yerine koyma yarışı** (orta; `cf31cc4`): `_yerine_koy_oge` hedefi ön bellekten bırakıp kilidin
  dışında yerine koyuyordu; arada küçük resim isteği dosyayı yeniden açınca "Dosya yazılamadı" hatası. Karar: `_onbellekten_birak` ve `_yerine_koy`
  aynı `with _mupdf_kilidi():` içinde (Birleştir'deki gibi). Test: donustur_testi `yerine_koy_yarisi` (yeni; 30 deneme) eski çekirdekle 6/30, yeniyle 30/30.
- [x] **5. Yazısız taramada "yazı tanıyıcı yok"** (düşük; `b63761f`): `_tani` None (tanıyıcı yok / çalışmadı) ve [] (yazı yok) ayrı; [] → "N taranmış
  sayfada yazı bulunamadı: sayfa(lar) resim olarak kondu."; "(bu bilgisayarda yazı tanıyıcı yok)" yalnızca tanıyıcı gerçekten yokken. Test:
  `udf_donusum_testi --yalniz yazisiz_tarama` (yeni): önce HATA, sonra OK.
- [x] **6. Dış süreci öldürmek taskkill'i bekliyordu** (düşük; `17821d8`): bu bilgisayarda taskkill tek süreçte bile 5–7 sn. Karar: `Baglam.dis_surec`
  süreci KILL_ON_JOB_CLOSE iş nesnesine bağlar (`donustur.ise_bagla`); `_surec_oldur(p, is_)` önce `TerminateJobObject`, taskkill yalnızca iş nesnesi
  yoksa; udf.py'nin kopya yardımcıları kalktı (JVM de aynı yolla). Test: dis_surec + "alt süreciyle birlikte öldürülür": eski çekirdekle 1/4
  (7–8 sn), yeniyle 4/4 (0,8–2,1 sn).
- [x] **7. Format Değiştir'de geç iptal bildirimi eziliyordu** (düşük; `fe02483`): "İptal edilemeden tamamlandı" bildirimini hemen ardından gelen
  "Format değiştirildi" siliyordu. Karar: `_sonucGoster(sonuclar, { tek, onBildirim })`; geç iptal dalı kendi bildirimini vermez. Test: gec_iptal.mjs
  Format Değiştir vakası (yeni) eski arayüzle HATA, yenisiyle 24/24.
- [x] **8. udfYaklasik.js'te ulaşılamayan "yeni ad" dalı** (düşük; `4080e48`): eş zamanlı `fs.existsSync` kullanan `bosAd` ve PDF hedefindeki yeniAd
  dalı kalktı; PDF + yeniAd isteği reddedilir. Test: udf_yaklasik 63/63, senaryo40 2. bölüm 6/6.
- [x] **9. Kopya işlevler** (düşük; `65ad050`): `ortak.js yaklasikIptal(pdefe, ogeler)`; "(n)" kuralı tek üreteç `numaraliGovdeler(govde)`. Davranış
  değişmedi.
- [x] **10. LibreOffice'in geçici profili silinmiyordu** (düşük; `6c6a854`): profil adı "pdefe-donustur-<pid>-libreoffice-…" (çekirdeğin açılış
  temizliği tanır); eski "pdefe-libreoffice-…" bir günden eskiyse silinir. LibreOffice bu bilgisayarda yok: profil adı ve temizlik sınandı. Test:
  `lo_profili` (yeni) eski 2/4, yeni 4/4.
- [x] **11. Word → PDF'te dış şablon** (düşük, güvenlik; `d52ea95`): kod okumayla doğrulandı (Word çalıştırılmadı, ağ isteği yeniden üretilmedi).
  Karar: `_dis_sablonu_kaldir(kopya, alt)`: Word'e verilen kopyada .docx / .docm'un attachedTemplate ilişkileri ve öğeleri kalkar (öteki parçalar bayt
  bayt aynı; hata olursa kopya değişmez); RTF'te şablon grubu. **Bilinçli kabul**: bağlı resim (INCLUDEPICTURE / r:link), OLE bağlantısı, .doc ve
  .odt'nin dış başvuruları kalır (kaldırmak belgeyi bozabilir; Word çalıştırılmadan sınanamaz). Test: `test_dis_sablon` (yeni; Word adımı kopyayı
  yakalayan sahte) eski 3/5, yeni 5/5.
- [x] **12. Kullanılmayan içe aktarmalar ve boş kaydol işlevleri** (düşük; `03e0c8a`): udf.py base64, word.py subprocess, pdefe_core.py io; udf / word
  / pdf_word'deki boş `kaydol`.
- [x] **13. PDEFE_UDE_KOPRU paketli çekirdekte okunuyordu** (düşük, güvenlik; `413f55e`): kullanıcının ortamına yazabilen bir program her UDF
  dönüştürmesinde kendi jar'ını UDE'nin Java'sıyla çalıştırtabilirdi. Karar: paketli çekirdek değişkeni okumaz; adaylar resources/ude-kopru ve derleme
  düzeni (core/dist → core/ude_kopru). Seçilmeyen: ana süreçte süzmek (çekirdeği doğrudan başlatan program yine verebilirdi). Test: benzetim (sys.frozen)
  eski kod sahte jar'ı seçiyor, yenisi seçmiyor; `test_sahte_kopru` (--exe).
- [x] **14. Lisans metinleri pakette yoktu; THIRD_PARTY eksik / eski** (orta + iki düşük; `9a5edd2`): spec `_lisans_dosyalari` →
  `_internal/lisanslar/<ad>/` (17 bileşen, 35 dosya); electron-builder win ve mac: LICENSE → resources/LICENSE.txt, THIRD_PARTY.md. THIRD_PARTY:
  lisansların yerleri, typing_extensions 4.16.0 (PSF-2.0), Electron 44.5.1 / Chromium 152.0.7977.130 / V8 15.2.124.28; yayim.yml'de
  typing_extensions==4.16.0. Mac paketi CI'da denetlenmeli.
- [x] **15. CI jar denetimi** (düşük; `7e303ec`): yayim.yml Windows ve Mac paketleme işlerinde `node build/ude-kopru-derle.mjs --denetle` (Javasız;
  kaynak özeti tutmazsa iş durur).
- [x] **16. Depo kökündeki boş klasör** (düşük): 0.2.8 belge adımının scratch denemesinden kalan, git dışı boş klasörler silindi; depoda düzeltilecek yok.
- [x] **17. Gizli projelerin iç yolları** (düşük; `30e8afe`): udf_yaz.py, word.py, udf_donusum_testi.py, udf-motoru.js yorumlarındaki iç dosya yolları ve
  bilgi kaynağı anmaları genel söyleyişe çevrildi. UDF çizim motorunun kaynağı olarak eklentinin adı lisans atfında (THIRD_PARTY.md,
  src/udf-cizim/LICENSE.txt), PLAN'da, iki kod yorumunda ve bir commit iletisinde kalıyor: kullanıcıya soruluyor.
- [x] **18. README / DOGRULAMA** (orta, belge; `6c8df8e`): README'nin Birleştir, TIFF → PDF ve Görüntü → PDF maddeleri yeni ölçüye göre; PDF → UDF'e
  "görüntü / TIFF'ten yapılan UDF'nin kâğıdı A4"; DOGRULAMA 14/6 ve 43/7'ye "0.2.9'da değişti" notu.
- [x] **19. kurucu_akis.ps1 gerçek Masaüstü'ne kısayol düşürüyordu** (düşük; `1495d90`): masaüstü kısayolunu sınayan iki adım (E1 /S, C1 Onar) yalnızca
  `-MasaustuSina` ile; varsayılan E1 "/S --no-desktop-shortcut"; önceki koşunun izleri başta temizlenir (`Kalintilari-Temizle`). Test: görünmeyen
  masaüstünde 57 denetim, hepsi TAMAM; masaüstü kısayolu hiç oluşmadı.
- [x] **20. Yazıcının model adı** (düşük, kişisel veri sayılmaz; `0444c4c`): sahte listede ve testlerde "Lazer Yazıcı" (Türkçe sıralamada aynı yer),
  macOS kuyruk adı "Lazer_Yazici", markalı örnek "Bina X"; PLAN / DOGRULAMA "ofisteki yazıcı". Geçmişteki üç commit'te kalıyor (yeniden yazılmadı:
  kullanıcıya soruluyor). Test: yazdir_html_testi 90/90, yazdir_pencere 47/47, mac_renderer 44/44.
- [x] **21. senaryo11 / 12 gerçek panoyu değiştiriyordu** (düşük; `e3174d0`): main.js test örneğinde `pano:icerik`'i kuyruktan yanıtlar ({ tur: 'gorsel',
  dosya } → geçici PNG; kuyruk boşsa gerçek pano); betikler görüntüyü kendisi üretir, sonda "Pano görüntüsü" kopyasını siler. Kurulu PDEfe'de
  değişiklik yok.
- [x] **Yazım** (`396a5b0`, `d0614f9`): donustur.py belgesinde "kare kare" yerine açık söyleyiş; yayim.yml yorumunda "Javasız".

#### 0.2.9: belgeler
- [x] Sürüm 0.2.9 (package.json, package-lock.json); CHANGELOG; docs/DOGRULAMA.md 44; README: Öne çıkanlar'da ve Araçlar'da Birleştir (dosyalardan tek PDF,
  görüntü sayfaları A4, satırlarda sayfa boyutu seçimi yok), TIFF → PDF, Görüntü → PDF, görüntüden yapılan UDF'nin A4 kâğıdı (son üçü düzeltme turunda).

#### 0.2.9: sınama özeti (madde 1–4 ve düzeltme turu)
- [x] Madde 1–4'ten sonra (her test kendi temiz örneğinde, ekran dışında ya da görünmeyen masaüstünde): senaryo44 20/20 (%100 ve %125), senaryo41 52/52,
  senaryo38 64/64, senaryo40 23/23, senaryo39 54/54, senaryo37 64/64, udf_yaklasik 63/63, senaryo13 63/63, senaryo26 64/64, senaryo42 32/32, senaryo43
  31/31, kisayol_araclar 102/102, arac_onizleme 24/24, ortu_tiklama 164/164, gec_iptal 20/20, mac_renderer 44/44, senaryo19 112/112, senaryo20 52/52,
  acilis_hizasi 10/10 (%100 ve %125), senaryo14 60/60, kisayol_dosya 164/164, sekme_genislik 38/38. Python: donustur_testi 256/258 (iki "dış süreç" süre
  denetimi yük altında 5,1–5,4 sn; 0.2.8'de de bilinen, düzeltme turunda giderildi), araclar_testi 145/146 (Sıkıştır tahmini yer tutucu belge),
  guvenlik_testi 47/47, mac_cekirdek 14/14, tanima 61/61, kucuk_resim 50/50, udf_donusum 133/133, word_donusum (PDEFE_WORD_YOK=1) 32/32; guvenlik_birim
  ve güncelleme birim geçti.
- [x] Düzeltme turundan sonra: donustur_testi --hizli 262/262, udf_donusum_testi 142/142 (UDE ile), word_donusum_testi (PDEFE_WORD_YOK=1) 37/37,
  guvenlik_testi 47/47, guvenlik_birim ve pano_birim geçti; paket (`--dir`): paket_duman 18/18, donustur --exe 230/230, udf --exe 129/129, word --exe
  19/19. Word'ün "Son kullanılanlar" sayıları başta ve sonda aynı.
- [ ] **Açık konular**:
  - Word'ün "Son kullanılanlar" listesindeki 21 bozuk kayıt (17 eski, 4 bu revizyonun uygulamasından): düzeltmek (sahte yolu gerçek profil yoluna
    çevirmek; paket dışı kayıt yazımı) ya da kullanıcının Word'de listeden kaldırması: kullanıcıya soruluyor.
  - UDF çizim motorunun kaynağı olarak eklentinin adı herkese açık depoda (lisans atfı) kalsın mı: kullanıcıya soruluyor.
  - Geçmişteki yazıcı model adı (üç commit): bırakılsın mı, asıl depoya göndermeden önce geçmiş mi temizlensin: kullanıcıya soruluyor.
  - Gerçek telefon fotoğrafları ve taramalarla, kâğıda yazdırarak denenmedi; Word → PDF'te dış şablonun kaldırılması gerçek Word'le ve ağ isteğiyle
    denenmedi; LibreOffice bu bilgisayarda yok; Mac'te denenmedi (lisans dosyaları Mac paketinde CI'da denetlenmeli); test örneğinde Masaüstü
    yönlendirmesi gerçek Masaüstü'ne yazdırılarak yeniden üretilmedi.
- [ ] Kullanıcı doğrulaması: docs/DOGRULAMA.md 44.
