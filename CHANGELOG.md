# Sürüm notları

Biçim: her sürüm için `## x.y.z — YYYY-AA-GG` başlığı; altındaki maddeler GitHub sürüm sayfasına
otomatik olarak kopyalanır (`.github/workflows/yayim.yml`).

## 0.1.22 — 2026-10-01

### Sekmeler
- **Bütün belgeler kapandıktan sonra da yeni boş sekme açılabiliyor.** 0.1.21'de belge kalmayınca **+** ve `Ctrl+T` hiçbir şey yapmıyordu; artık her zaman yeni bir "Yeni sekme" açar, tarayıcıdaki gibi. Birden çok "Yeni sekme" varken her biri × ile (ya da `Ctrl+W`, orta tık, sağ tık › Kapat ile) kapatılabilir; pencerede tek sekme kalınca o sekme yine kapatılmaz ve `Ctrl+W` pencereyi kapatır.
- Son belge kapanınca yanındaki "Yeni sekme"ler olduğu gibi kalır; önceden teke iniyordu.
- Birden çok "Yeni sekme" varken arka planda açılan ya da başka pencereden sürüklenen belge onların yanına eklenir; "Yeni sekme"lerden birindeyken açılan belge yalnızca o sekmenin yerini alır.

## 0.1.21 — 2026-10-01

### Sekmeler
- **Sekme çubuğu artık hiç kapanmıyor.** Son sekme kapatılınca çubuk kaybolmuyor; yerine "Yeni sekme" gelir ve açılış sayfası görünür, tıpkı **+** ile yeni boş sekme açılmış gibi. PDEfe de bu sekmeyle açılır. Bu sekmedeyken açılan (ya da Gezgin'den gelen, pencereye sürüklenen) ilk belge onun yerini alır. Belge yokken tek kalan "Yeni sekme" kapatılmaz (× düğmesi yok); `Ctrl+W` önceden olduğu gibi pencereyi kapatır, **+** ve `Ctrl+T` ikinci bir boş sekme açmaz. Son belge kapanınca yanındaki öteki "Yeni sekme"ler de teke iner.
- **Sekmeler sürüklenirken daha erken yer değiştiriyor.** Önceden sürüklenen sekme komşusunun tam üstüne gelince yer değişiyordu; artık komşusunun dörtte birine girince değişir.
- **Sekme genişliği sekme sayısına göre ayarlanıyor.** Az sekme varken sekmeler geniş olur, adlar daha uzun görünür. Sekmeler çoğalıp çubuğa sığmayınca hepsi birlikte daralır; önceki genişliğe (en dar hâl) inince sekme çubuğu eskisi gibi kaydırılır.
- Bir sekme × ile (ya da orta tıkla) kapatılınca öteki sekmeler fare sekme çubuğunun üstündeyken genişlemez: sıradaki sekmenin × düğmesi farenin altına gelir, sekmeler art arda kapatılabilir. Fare çubuktan çıkınca sekmeler yeniden genişler.
- Sekmeler çubuğa sığmayınca çubuktaki ◀ ▶ ve "Açık belgeler" düğmeleri birkaç piksel eziliyordu; artık ezilmiyor.
- Sekmede sağ tık menüsünde **Yolu kopyala**'nın altına **PDF'i kopyala** geldi: belgeyi dosya olarak panoya koyar (araç çubuğundaki kopyala düğmesi gibi); Gezgin'e, e-postaya ya da UYAP'a yapıştırılabilir. Kaydedilmemiş değişiklik varsa önce sorulur.

### PDF'i kopyala
- Araç çubuğundaki kopyala düğmesinin sorusu artık "Kopyalamadan önce kaydetmek ister misiniz?" diyor; düğmeler **Kaydet ve kopyala**, **Kaydetmeden kopyala**, **Vazgeç**. Önceden "paylaş" diyordu. Düğmenin ipucu ve Araçlar menüsündeki adı da **PDF'i kopyala** oldu.

### Görünüm
- Sekme çubuğu artık açılış sayfasında da durduğu için açılış sayfası alçak pencerelerde (yüksekliği 780 piksele dek) biraz sıkılaştı: 1280×700'lük pencerede son açılan on belgeyle de kaydırma çubuğu çıkmaz. Yüksek pencerede görünüm değişmedi.

## 0.1.20 — 2026-09-30

### Görünüm
- **Sığdırılmış görünüm artık titremiyor.** Sayfaları pencereye kıl payı sığan belgelerde (ör. yatay iki sayfalık belge, ekranın yarısını kaplayan pencere) "Genişliğe sığdır" görüntüyü durmadan büyütüp küçültüyordu: kaydırma çubuğu bir çıkıp bir kayboluyor, yakınlaştırma kutusu %81 ile %82 arasında gidip geliyordu. Böyle bir belge artık kaydırma çubuğu gerektirmeyen yakınlaştırmada sabit durur. Aynı titreme "Sayfayı sığdır" ve "Görünür alana sığdır"da, tek sayfalık belgelerde ve iki sayfa düzeninde de oluşabiliyordu; hepsinde giderildi.
- Belge açılırken ve yakınlaştırma değişirken sayfa önce bir boyutta çizilip kaydırma çubuğu çıkınca birkaç piksel küçülmüyor ya da yana kaymıyor; ilk çizim son hâlindedir.
- Sığdırılmış belgenin altında, pencerenin boyutuna göre gereksiz bir yatay kaydırma çubuğu çıkabiliyordu: iki sayfa düzeninde (sayfalar pencereden bir piksel taşıyordu) ve ölçeği %125 ya da %150 olan ekranlarda ("Sayfayı sığdır"da iki çubuk birden çıkabiliyordu). Artık çıkmıyor.

## 0.1.19 — 2026-09-30

### Pencereler
- **Sekme kendi penceresine ayrılır.** Bir sekmeyi tutup sekme çubuğunun dışına sürükleyince sekme çubuktan ayrılır; belgenin adı ve sayfasının küçük görüntüsü imleci izler. Bırakıldığı yerde belge kendi penceresinde açılır (öteki ekranda da). Sekme çubuğa geri getirilirse yerine takılır ve sıralama sürer; `Esc` vazgeçer. Sekmeyi çubuğun içinde sürüklemek eskisi gibi yalnızca sıralar.
- Sekmede sağ tık › **Pencereye ayır** aynı işi sürüklemeden yapar: belge, pencerenin yanında açılan yeni pencereye geçer.
- Ayrılan sekme başka bir PDEfe penceresinin sekme çubuğuna bırakılınca o pencereye takılır; gireceği yer sekmelerin arasında bir çizgiyle gösterilir. Son belgesi de başka pencereye taşınan pencere kapanır.
- Sekme taşınırken hiçbir şey kaybolmaz: kaydedilmemiş notlar, vurgular, sayfa değişiklikleri ve geri al / yinele geçmişi belgeyle birlikte öteki pencereye geçer; belge aynı sayfada ve aynı yakınlaştırmayla açılır.
- Pencerenin tek sekmesi dışarı sürüklenip boş bir yere bırakılınca yeni pencere açılmaz; pencerenin kendisi oraya gider. Açılış sekmesi ("Yeni sekme") ayrılmaz.
- Her pencere kendi araç çubuğu, sekmeleri ve sol paneliyle tam bir PDEfe penceresidir. Tema, sayfa düzeni, vurgu rengi, son açılanlar ve öteki ayarlar bütün pencerelerde ortaktır; birinde değişince ötekilerde de değişir.
- Bir belge aynı anda tek pencerede açık olur: başka bir pencerede açık olan belge yeniden açılmak istenince o pencere öne gelir ve belgenin sekmesine geçer. Gezgin'de çift tıklanan PDF en son kullanılan pencerede açılır.
- Pencere kapatılırken yalnızca o pencerenin kaydedilmemiş belgeleri sorulur. **Dosya › Çıkış** bütün pencereleri sırayla kapatır; birinde **Vazgeç** denirse o pencere ve sıradakiler açık kalır. `Alt+F4` yalnızca etkin pencereyi kapatır. Güncelleme kurulmadan önce bütün pencerelerdeki kaydedilmemiş belgeler sorulur; sorusu yanıtlanan pencere kurulum başlayana dek değişiklik kabul etmez.
- Bir pencere kapatılınca belgeleri hemen serbest kalır: öteki PDEfe pencereleri açıkken de dosya Gezgin'de silinebilir, adı değiştirilebilir.
- Arayüzü çöken (boş kalan) pencere artık × ile kapatılabiliyor; öteki pencereler çalışmayı sürdürür. Önceden böyle bir pencere kapatılamıyordu.

## 0.1.18 — 2026-09-27

### Bellek ve hız
- Birden çok belge açıkken daha az bellek kullanılır: arka plandaki sekmede yalnızca ekranda duran sayfa hazır tutulur, öteki sayfalar sekmeye dönünce yeniden hazırlanır. Sekmeye dönünce sayfa beklemeden görünür. Geniş ekranda (2560 piksel, genişliğe sığdır) arka plandaki her sekme ~50 MB daha az yer tutar.
- Kapatılan belgenin sayfa küçük resimleri, küçük resim paneli kapalıyken de bellekten bırakılır.
- PDF işlemlerini yapan yardımcı program artık her açılışta Windows'un geçici klasörüne açılmıyor. Belge araçları açılışta daha çabuk hazır olur (~0,9 sn yerine ~0,2 sn) ve PDEfe kapanınca geçici klasörde (%TEMP%) ~70 MB'lık bir `_MEI…` klasörü kalmaz. Önceki sürümlerin bıraktığı bu klasörler (içinde `pymupdf` klasörü olanlar) PDEfe kapalıyken silinebilir.
- PDEfe kapanırken yardımcı program zorla kapatılmaz; süren bir işi varsa bitirip kapanır.

## 0.1.17 — 2026-09-27

### Görünüm
- **Simge sadeleşti:** lacivert sayfanın ortasında dolgulu, altın sarısı dört yapraklı çiçek; kıvrımlı süslemeler kalktı. Küçük boyutlarda (görev çubuğu, Gezgin) daha net seçilir. Eski simge görünmeye devam ederse Windows'un simge önbelleğindendir; bilgisayar yeniden başlatılınca düzelir.

## 0.1.16 — 2026-09-27

### Görünüm
- **Yeni simge:** lacivert bir sayfanın üzerinde altın sarısı dört yapraklı süsleme, kırmızı kıvrık köşe. Program, kurulum dosyası, kaldırıcı, pencere ve görev çubuğu, .pdf dosyaları ve açılış ekranının sağ altı yeni simgeyi kullanır. Masaüstünde ya da görev çubuğunda eski simge görünmeye devam ederse Windows'un simge önbelleğindendir; bilgisayar yeniden başlatılınca düzelir.

## 0.1.15 — 2026-09-27

### Açılış ekranı
- **PDF aç** düğmesi artık yazısı kadar: "… bu pencereye sürükleyin" yazısından hemen sonra biter, sola yaslıdır. Önceden araçların ve son açılanların genişliği boyunca uzanıyordu. Yer darsa (örneğin sol panel açıkken dar pencerede) açıklama alt satıra iner.
- Sağ alttaki **PDEfe** simgesine ya da yazısına tıklayınca **Ayarlar › Hakkında** açılır. Görünümü değişmedi: düğme gibi çerçeve, zemin ya da üzerine gelince değişen bir şey yok.

### Pencereler
- Ayarlar'ı açan dişliye ya da PDEfe simgesine çift tıklayınca Ayarlar bir an açılıp hemen kapanıyordu: ikinci tık pencerenin dışına düşüp kapatma sayılıyordu. Artık açık kalır. Araç pencerelerinde, Yazdır'da ve öteki açılır pencerelerde de böyle; pencerenin dışına bir kez tıklamak yine kapatır.

## 0.1.14 — 2026-09-27

### Açılış ekranı
- **Son açılanlar** artık araçların altında: "Son açılanlar" başlığı üstte, belgeler altındaki kutunun içinde. Kutu kaydırılmaz; son açılan 10 belgenin hepsi görünür, geniş pencerede iki sütuna dağılır (en yenisi sol üstte).
- Sürükle-bırak bilgisi PDF aç düğmesinin içinde: **Bilgisayarınızdaki bir ya da birkaç PDF'i seçin veya bu pencereye sürükleyin**. Düğmenin altındaki ayrı satır kalktı.
- İçerik tam ortada değil, biraz yukarıda durur.
- **PDEfe**, "PDF görüntüleyici ve düzenleyici" ve sürüm sağ altta. Pencere büyüyüp küçülünce köşede kalır; pencere içeriğe yetmeyecek kadar küçükse içeriğin altına iner, üstüne binmez.

### Sekmeler
- Sekme sürüklenirken artık imleçle birlikte yarı saydam bir kopya dolaşmıyor: sekmenin kendisi hafif gölgeyle öne çıkıp imleci yatayda izler, öteki sekmeler kayarak yer açar. Bırakınca sekme açılan yere kayıp oturur. `Esc` sürüklemeden vazgeçer. Sekmeler sığmıyorsa imleç çubuğun ucuna götürülünce çubuk kendiliğinden kayar.

### Notlar
- Not balonunun başlığı **Not | Ad Soyad | tarih** biçiminde: tür, yazar ve tarih ince dikey çizgilerle ayrılır, tarih yazarın hemen yanında durur ("Not:" yerine). Uzun bir yazar adı kısalır; tam adı fareyle üzerine gelince görünür.

## 0.1.13 — 2026-09-27

### Açılış ekranı ve yeni sekme
- Açılış ekranında büyük bir **PDF aç** düğmesi var; "PDF'leri bu pencereye sürükleyip bırakarak da açabilirsiniz" yazısı hemen altında. Altında bütün araçlar görünür: PDF küçült, Sayfaları düzenle, Döndür ve kaydet, PDF ayır, Görüntü / PDF birleştir.
- Belge gerektiren bir araç (Görüntü / PDF birleştir dışındakiler) belge açık değilken seçilince önce Aç penceresi gelir; seçilen PDF açılır ve araç doğrudan o belgeyle açılır. Açılış ekranında, araç çubuğundaki Araçlar penceresinde ve Araçlar menüsünde böyle; Araçlar penceresinde soluk araç kalmadı.
- Sekme çubuğunda Chrome'daki gibi bir **+** düğmesi var (`Ctrl+T` de aynı): açılış sayfası yeni bir sekmede açılır. Oradan açılan belge o sekmenin yerine açılır.
- "Son açılanları hatırla" kapalıyken açılış ekranında Son açılanlar kutusu hiç görünmez.

### Kısayollar
- Bütün kısayollar sınandı. Türkçe klavyede `Ctrl++` (yakınlaştır) hiç çalışmıyordu, döndürme kısayolu da basılamıyordu: artık `Ctrl++` (Shift+4 ile ya da sayısal tuş takımındaki +) yakınlaştırır, `Ctrl+−` uzaklaştırır; döndürme `Ctrl+R` (saat yönünde) ve `Ctrl+Shift+R` (tersine). `Ctrl+Shift+−` artık döndürmez, uzaklaştırır: + için Shift basılı kalınca belge yanlışlıkla dönebiliyordu.
- `Ctrl+PageUp` / `Ctrl+PageDown` ve `Ctrl+←` / `Ctrl+→` önceki / sonraki sekmeye geçer (önceden `Ctrl+PageUp` / `Ctrl+PageDown` sayfa çeviriyordu). `Ctrl+Tab` seçicisi açıkken `←` `→` ile sekme seçilir.
- Kısayollar, Ayarlar, Yazdır ya da bir araç penceresi açıkken `Ctrl+Tab`, `Ctrl+1` – `Ctrl+9`, `Ctrl+Z` / `Ctrl+Y`, `Ctrl+W` gibi kısayollar arkadaki belgede çalışıyordu (örneğin `Ctrl+W` yazdırılmakta olan belgeyi kapatıyordu); artık çalışmaz.
- `Ctrl` basılıyken `Shift+Tab` art arda basılınca sekme seçicisi geri gider (en eski sekmeye geri sıçrıyordu).
- Yazı kutusu ve not düzenlenirken de `Ctrl+PageUp` / `Ctrl+PageDown` ve `Ctrl++` / `Ctrl+−` çalışır.
- Sayfaları düzenle'de araç çubuğundaki bir düğmeye bastıktan sonra da sayfa kısayolları (`Ctrl+Z`, `R`, oklar, `Delete`, `Ctrl+A`) çalışır; Görüntü / PDF birleştir'de satırdaki bir düğmeden sonra `Delete` ve `Ctrl+A` da. Önceden `Ctrl+A` pencerenin yazısını seçiyordu.
- `Ctrl+F` yalnızca belgede seçili metni aranacak diye alır (sayfa kutusundaki numarayı arıyordu); Bul kapalıyken sayfa kutusunda `Ctrl+Z` belgeyi başka sayfaya atlatmaz.
- Araç pencerelerinin altındaki "Tıkla: seç · Delete: sil …" açıklamaları kaldırıldı; `F1` ile açılan **Kısayollar** penceresinde Sayfaları düzenle ve Görüntü / PDF birleştir bölümleri olarak yer alıyor.

### Adlar ve görünüm
- Not aracının adı her yerde yalnızca **Not** (araç çubuğu, Düzen menüsü, Yorumlar paneli; yeni notun başka PDF okuyucularında görünen konusu da "Not").
- Metin seçince çıkan çubuk daraldı: renkler ▾'nin altında dikey bir sütunda açılır, çubuk genişlemez.
- Sayfaları düzenle'deki "PDF'ten sayfa ekle" düğmesinin adı **PDF ekle**; araç pencerelerindeki "Kaydetme" başlığı **Kaydet**.
- Vurgunun notu açıkken vurguya yeniden tıklanınca açılan çubuk notun altında kalıyor, **Kaldır**'a basılamıyordu. Artık not kapanır (yazılan not kaydedilir), çubuk üstte açılır.

## 0.1.12 — 2026-09-27

### Kapatma ve kaydetme soruları
- Pencere kapatılırken (sağ üstteki ×) önce değişikliği olmayan sekmeler kapanır; yalnızca kaydedilmemiş değişikliği olan belgeler kalır ve onlar için sorulur. Vazgeç denirse o belgeler açık kalır. Önceden bütün sekmeler soru yanıtlanana dek açık duruyor, yanıttan sonra hepsi birden kapanıyordu. Sekmede sağ tıkla **Diğerlerini kapat** ve **Sağdakileri kapat** da aynı sırayla çalışır.
- Kaydetmeden çıkma soruları uygulamanın her yerinde aynı: **"belge.pdf" belgesinde kaydedilmemiş değişiklikler var. Çıkmadan önce kaydetmek ister misiniz?** — **Kaydet**, **Kaydetme**, **Vazgeç**. Sekme ve pencere kapatmada, Sayfaları düzenle'de ve dolu listeyle Görüntü / PDF birleştir'de böyle sorulur. Araçta Kaydet, aracın kendi Kaydet / Birleştir düğmesiyle aynı işi yapar.
- Bir araç penceresinde kaydedilmemiş iş varken (Sayfaları düzenle'de değişiklik, Görüntü / PDF birleştir'de dolu liste) PDEfe'nin kapatma düğmesine basılınca uygulama soru sormadan kapanıyordu. Artık önce aracın sorusu gelir; Vazgeç'te PDEfe açık kalır.

### Araç çubuğu ve sekmeler
- Paylaş düğmesinin yanında **Ayarlar** düğmesi (dişli) var. Paylaş düğmesinin simgesi kopyala simgesi oldu; işlevi aynı (belgeyi dosya olarak panoya kopyalar).
- Sayfa numarası kutusu küçüldü: genişliği belgenin sayfa sayısının basamağına göre, daha alçak ve sade.
- Döndürme simgeleri (araç çubuğu, Sayfaları düzenle, Görüntü / PDF birleştir, Döndür ve kaydet) yenilendi: altı açık bir daire ve dolu ok ucu. Artık yenile simgesine benzemiyor.
- Sekme çubuğundaki ◀ ▶ düğmeleri ve fare tekerleği ilk ve son sekmede durur, başa dönmez; uçtaki düğme soluk görünür.

### Seçim ve notlar
- Metin seçince çıkan çubukta renkler yerine tek bir **Vurgula** düğmesi var: altındaki çizgi vurgu rengini gösterir, tek tıkla o renkle vurgular. Yanındaki ▾ renkleri açar; seçilen renkle vurgulanır ve o renk değiştirilene dek varsayılan olur.
- Not balonunda "Metin notu" yerine yalnızca **Not:** yazar.

### Araç pencereleri
- Kaydedilecek dosyanın adı uzantısız görünür; ".pdf" kaydederken eklenir.
- Adın yanındaki klasör (örneğin "Masaüstü") tıklanınca o klasör Gezgin'de açılır.
- Görüntü / PDF birleştir'e eklenen ya da Sayfaları düzenle'de "PDF'ten sayfa ekle" ile okunan dosya, araç kapandıktan sonra da PDEfe'de açık kalıyordu: PDEfe kapanana dek Gezgin'de silinemiyor, adı değiştirilemiyordu. Artık araç kapanınca bırakılır. Bir sekmede açık olan dosya sekme kapanınca bırakılır.

### Ayarlar
- Sayfa düzeni ve Belge açılışı sekmeleri **Açılış ve düzen** adıyla birleşti; Notlar sekmesinin adı **Not ve vurgu** oldu.
- Varsayılan PDF görüntüleyici: PDEfe zaten varsayılansa düğme yerine yeşil tik ve **Zaten varsayılan** yazar. Windows ayarlarından PDEfe'ye dönünce yeniden bakılır.
- **Son açılanları hatırla**'nın altında **Listeyi temizle** düğmesi var.
- Kopyalama sekmesi kaldırıldı: kopyalama her zaman temiz metinle yapılır (paragraflar birleştirilir, bozuk Türkçe karakterler düzeltilir).
- Otomatik kaydetme artık varsayılan olarak kapalı. Bu sürüme güncelleyince bir kez kapatılır; isteyen Ayarlar › Kaydetme'den açar.

### Diğer
- PDEfe'nin kullandığı Windows araçları (Paylaş'ta panoya kopyalama, varsayılan uygulama denetimi) Windows klasöründeki tam yoluyla çalıştırılır; açılan PDF'in klasöründeki aynı adlı bir dosya çalıştırılamaz.

## 0.1.11 — 2026-09-24

### Kopyalama
- Belgedeki boş satırlar kopyalanan metne geçiyor. Kanun metinlerinde bölüm ve madde başlıklarından önceki boşluk ("…isteyebilirler." ile "C. Zamanaşımı" arası gibi) UYAP Doküman Editörü'ne yapıştırınca, paragraf aralığı 0 olsa da, bir boş satır olarak görünür. Önceden bütün paragraflar alt alta geliyordu. Mahkeme kararlarında, bilirkişi raporlarında ve dilekçelerde başlıkların, taraf bilgilerinin ve maddelerin arasındaki boş satırlar da korunur.
- Boş satır bir sayfanın sonuna ya da başına denk gelmişse de korunur: kanunun bir sayfasının sonundan sonraki sayfanın başlığına kadar seçilen metinde başlığın önünde boş satır olur. Sonraki sayfada süren paragraf eskisi gibi tek paragraf kalır.
- Yalnızca gerçekten bir satır kadar boşluk olan yerler boş satır sayılır. Paragraflar arasındaki küçük aralık (UYAP'taki paragraf aralığı gibi) ve çift satır aralıklı metnin satır araları boş satır olarak gelmez.
- Boş satırın iki yanındaki satırlar artık birbirine yapışmıyor. Önceden bir başlık ya da tablo satırı, boşluğun ardından gelen satırla tek paragraf oluyordu ("DAVACI : … VEKİLİ", "…zorunlu değildir. d. Mirasbırakan…").

## 0.1.10 — 2026-09-24

### Kopyalama
- Her satırı ayrı parça olarak yazılmış PDF'lerden (mevzuat.gov.tr kanun metinleri, bazı Word ve tarayıcı çıktıları, taranıp metne çevrilmiş belgeler) kopyalanan metinde paragrafın satırları artık birleşiyor. Önceden her satır ayrı paragraf çıkıyordu: UYAP Doküman Editörü'nde girinti ayarı olan bir paragrafa yapıştırınca her satır girintili ve aralıklı başlıyor, taşan sözcük alt satıra düşüyordu. Paragraf başı girintileri de tanınıyor; başlıklar, madde imli satırlar, içindekiler satırları ve sayfa altlıkları ayrı paragraf olarak kalıyor.
- Satır sonunda tireyle bölünmüş sözcükler (kitap dizgisindeki "insan- / lara") birleşirken araya boşluk girmiyor: "insanlara".

## 0.1.9 — 2026-09-23

### Ayarlar
- Ayarlar yeniden düzenlendi; her ayar adına uyan sekmede:
  - **Görünüm**: tema, sayfayı koyulaştırma, yazı çizimi.
  - **Sayfa düzeni** (eski "Başlangıç"): varsayılan yakınlaştırma, tek ya da iki sayfa, kaydırma, kapak sayfasını ayrı gösterme (önceden yalnızca araç çubuğunda ve Görünüm menüsündeydi) ve Döndür düğmesinin neyi döndüreceği (Görünüm'den taşındı).
  - **Belge açılışı** (eski "Dosya"): varsayılan PDF görüntüleyici, kaldığım sayfadan açma, son açılanlar.
  - **Kaydetme** (yeni): otomatik kaydetme (Notlar'dan taşındı) ve araçların çıktı klasörü (Dosya'dan taşındı).
  - Notlar sekmesinde yalnızca not ayarları kaldı; yazı aracının varsayılanları "Yazı aracı" başlığı altında.
- Yeni: **Son açılanları hatırla** (Ayarlar › Belge açılışı, varsayılan açık). Kapatılınca son açılanlar listesi silinir, yeni açılan belgeler eklenmez: başlangıç ekranında liste yerine "Son açılan belgeler hatırlanmıyor" satırı ve Ayarlar'a giden bağlantı görünür, Dosya menüsündeki Son açılanlar kalkar. Kapalıyken PDEfe'nin Aç ve Kaydet pencereleri de seçilen dosyayı Windows'un son kullanılanlar listesine eklemez. Yeniden açılınca liste boş başlar.
- **Her belgeyi kaldığım sayfadan aç** kapalıyken PDEfe belgelerde kalınan sayfayı (dosya yoluyla birlikte) artık ayar dosyasına yazmıyor; önceden kapalıyken de yazıyordu. Kapatılınca kayıtlı sayfalar silinir; bu ayarı daha önce kapatmış olanlarda eski kayıtlar ilk açılışta silinir.
- Yazı çizimi seçeneğinin adı "Dengeli (önerilen)" oldu; çizim aynı.

### Diğer
- Dosya başka bir programda açık olduğu için kaydedilemeyince çıkan uyarılar belirli bir program adı vermiyor: "başka bir programda (örneğin bir PDF okuyucuda) açık olabilir".
- PDEfe'nin eklediği yazı notlarına üretici bilgisi olarak PDEfe'nin adı ve sürümü yazılır (önceden başka bir programın adı yazılıyordu). Notların görünümü değişmedi.

## 0.1.8 — 2026-09-23

### Görüntü kalitesi
- Kalın yazılar artık bulanık görünmüyor: keskin çizilir. 0.1.4 – 0.1.7'de kalın yazılar (UYAP tebligatındaki "Duruşma Günü", "Muhatap adresini değiştirmişse…" gibi satırlar) harflerin ana hatlarından, gri yumuşatmayla çiziliyordu: koyulukları doğruydu ama harf kenarları iki piksele yayıldığı için yan yana bakınca bulanıktı. Artık kalın yazılar da Windows'un ClearType çizimiyle (renkli alt piksel yumuşatmasıyla, harfler piksel ızgarasına oturtularak) çizilir.
- Windows, bazı kalın yazı tiplerini (Times New Roman, Georgia, Garamond, Cambria Bold) küçük boyutta ClearType ile belirgin koyu çizer. PDEfe bunu her yazı tipi ve boyut için bir kez ölçer ve düzeltir: kalın yazılar keskin ama doğru kalınlıkta kalır. Gönderilen tebligatın kalın satırları olması gereken koyulukta (±%3).
- Döndürülmüş sayfadaki yazılar eskisi gibi harflerin ana hatlarından çizilir.

### Başlangıç ekranı
- Uygulama kısayoldan (belge açmadan) başlatılınca başlangıç ekranındaki "PDF aç" düğmesi ve son açılan belgeler tıklanamıyordu: ekranın üstünde görünmeyen boş bir katman kalıyordu. Düzeltildi; "PDF aç" Windows'un Aç penceresini açar, son açılanlar tek tıkla açılır.
- Başlangıç ekranı yenilendi: solda iki büyük kart, **PDF aç** (bir ya da birkaç PDF seçilir) ve **Görüntü / PDF birleştir** (fotoğraf, taranmış belge ve PDF'lerden tek PDF; açık belge gerekmez); sağda dosya simgeleriyle **Son açılanlar** (dosya adı ve klasörü). Listedeki satırın üzerine gelince çıkan × ya da `Delete` belgeyi yalnızca listeden kaldırır (dosya silinmez); sağ tıkla Aç, Klasörde göster, Yolu kopyala, Listeden kaldır. "Listeyi temizle" bütün listeyi boşaltır. Açık ve koyu temaya, dar pencereye uyar.
- Başlangıç ekranındaki "Ctrl+O" yazısı kaldırıldı (kısayol çalışmaya devam eder).

### Görünüm
- Genişliğe sığdır, kaydırmalı düzende belgedeki en geniş sayfaya değil, sayfaların çoğunun genişliğine göre yapılır. Örneğin farklı boyutlarda görüntülerden birleştirilmiş 9 sayfalık bir PDF'te dört sayfa ~1012 pt genişliğindeyse o dört sayfa pencereyi tam doldurur; daha dar sayfalar ortada durur, daha geniş iki sayfa iki yandan taşar (yana kaydırılarak görülür). Önceden ölçek o an bulunulan sayfaya göre hesaplandığından belge en geniş sayfada açılınca bütün sayfalar küçük görünüyordu.
- Ölçek artık hangi sayfada olunduğuna bağlı değil: belgede gezinirken ya da başka bir sayfadayken yeniden "Genişliğe sığdır" seçince değişmez. Tek sayfa (kaydırma kapalı) düzeninde her sayfa eskisi gibi kendi genişliğine sığdırılır.
- Hızlı: sayfa boyutları belge açılırken birlikte öğrenilir (1500 sayfalık belgede açılış 0,13 sn); ölçek açıldıktan sonra sıçramaz.

### Araçlar
- Görüntü / PDF birleştir: listede **farenin sağ tuşuyla sürükleyerek** birden çok dosya seçilir (satırların üzerinden de başlanabilir); sol tuşla boş alandan sürüklemek de seçer. Sürüklerken seçim canlı güncellenir, listenin kenarına gelince liste kayar, `Esc` vazgeçer; `Ctrl` ya da `Shift` basılıyken önceki seçime eklenir. Kıpırdamadan sağ tık eskisi gibi menüyü açar.
- Aynı listede `Ctrl`+tık tek tek, `Shift`+tık aralık seçer, `Ctrl+A` hepsini seçer. Seçili dosyalar birlikte döndürülür, yukarı / aşağı taşınır, sürüklenip sıralanır ve `Delete` ya da "Listeden çıkar" ile birlikte çıkarılır; sağ tık menüsü seçili dosya sayısını gösterir ("Listeden çıkar (3)").

### Güncelleme
- Güncelleme denetimi haftada bir yapılır (önceden 10 açılışta bir): son denetimden bu yana bir hafta geçtiyse açılışta, PDEfe günlerce açık kalıyorsa gün içinde arka planda. İnternet yoksa sessizce geçilir, sonra yeniden denenir. Yardım › Güncellemeleri denetle ve Ayarlar › Güncelleme › Şimdi denetle her zaman hemen denetler; Ayarlar'da son denetimin tarihi görünür.

### Kurulum
- Kurulumun son sayfasında "PDEfe'yi varsayılan PDF görüntüleyici yap" seçeneğinin yazısı yarım görünüyordu (ikinci satırı kesiliyordu). Seçenek tek satıra sığar; Windows Ayarlar'ın açılacağı ve orada ne seçileceği sayfanın metninde yazar.

### Düzeltmeler
- Ayarlar › Hakkında'daki x.com/CgrShn bağlantısı tarayıcıda profili iki sekmede açıyordu; artık bir kez açılır.

## 0.1.7 — 2026-09-23

### Araçlar
- Görüntü / PDF birleştir: telefonda dik ya da ters çekilmiş fotoğraflar (WhatsApp ve telefon kamerası fotoğrafları gibi, dönüş bilgisi dosyanın içinde olanlar) "Orijinal"de artık olduğu gibi eklenir. Önceden bu fotoğraflar kayıpsız biçime çevrildiği için kat kat büyüyordu: 364 KB'lık bir WhatsApp fotoğrafı PDF'te 3,1 MB yer tutuyordu, şimdi 364 KB. Fotoğraf yine doğru yönde görünür.
- Aynı araçta "Sağa döndür" görüntüyü birleştirilmiş PDF'te sola döndürüyordu (önizlemede doğru görünüyordu); artık önizlemedeki yöne döner. "Sola döndür" için de aynı. PDF dosyalarının döndürülmesi zaten doğruydu.

## 0.1.6 — 2026-09-23

### Araçlar
- Görüntü / PDF birleştir: "Yüksek" kalite artık "Orijinal"den büyük dosya üretmez. Önceden "Yüksek" her görseli yeniden sıkıştırıyordu; zaten daha düşük kaliteyle kaydedilmiş JPEG'ler (UYAP taramaları, telefon fotoğrafları) bu yüzden büyüyor (örneğin 487 KB'lık tarama 652 KB), ekran görüntülerinde JPEG PNG'den büyük çıkıyordu (0,09 → 0,33 MB); toplam boyut "Orijinal"i geçebiliyordu. Artık Yüksek, Orta ve Düşük'te sıkıştırınca küçülmeyen görsel olduğu gibi eklenir: kalite düşmez, dosya büyümez. Kalite düğmelerindeki tahmin bunu gösterir.
- Aynı araçta A4'e sığdırılan fotoğraflar "Yüksek"te belirgin daha küçük (örnekte 810 KB → 585 KB): kaynaktaki renk ayrıntısı korunarak gereksiz baytlar atılır.

## 0.1.5 — 2026-09-23

### Görüntü kalitesi
- Küçük yazılar keskin ve koyu: 0.1.4'te harfler gri ve soluk, bulanık görünüyordu. Artık düz yazılar Windows'un ClearType çizimiyle (renkli alt piksel yumuşatması ve ipuçlarıyla), kalın yazılar doğru kalınlıkta, harflerin ana hatlarından çizilir. UYAP tebligatının 7 pt Times paragrafı %100 ölçekte olması gerekenden %28 açıktı, şimdi farksız (+%2); 8 pt Arial satırları +%4, kalın satırlar doğru kalınlıkta (±%0). Farklı üreticilerden 43 PDF'te (UYAP, Word, Microsoft Print to PDF, iLovePDF, Canva, taramalar) denetlendi; sayfa çizim süresi değişmedi.
- Döndürülmüş sayfada yazılar eskisi gibi ana hatlarından çizilir: harfler incelip bozulmaz.
- Ayarlar › Görünüm › Yazı çizimi'nde "Dengeli" (varsayılan) bu çizimdir; "Windows ClearType" kalınlar dahil bütün yazıları Windows'la çizer.

### Arayüz
- Sekmeler %30 daraldı (168 → 118 px): daha çok belge yan yana sığar. Sekme yazısı biraz küçüldü, iç boşluklar sıkılaştı; "ustyazi (85).pdf", "ustyazi (100).pdf" gibi adlar yine tam görünür, daha uzun adlar üç noktayla kısalır (tam ad ve yol sekmenin ipucunda).
- Araçlar penceresinde alttaki iki araç (PDF ayır, Görüntü / PDF birleştir) pencereye ortalanır; sağda boş yer kalmaz. Ok tuşlarıyla yukarı / aşağı gezinme yeni yerleşime uyar.
- Yazı aracının biçim çubuğunda Dolgu rengi düğmesindeki renk karesi daralıp yamuk görünüyordu; artık yazı rengi karesiyle aynı boyda ve hizada.

### Araçlar
- Görüntü / PDF birleştir: eklenen görüntünün sayfası varsayılan olarak "Orijinal" (sayfa tam görsel boyutunda, kenar boşluğu yok); A4 sayfaya yerleştirmek için "A4'e sığdır" seçilir. Seçeneklerin adı kalite seçimiyle karışmasın diye yalnızca "A4'e sığdır" ve "Orijinal" (önceden "Orijinal boyut").

### Bilinen sınırlar
- Döndürülmüş sayfada küçük yazılar gri yumuşatmayla çizildiği için düz sayfadakinden biraz soluk görünebilir.
- UYAP tebligatındaki "Taahhütlü No" satırı gömülü olmayan bir barkod yazı tipiyle (IDAutomationHC39M) yazılmış; yazı tipi bilgisayarda kurulu olmadığından bazı PDF okuyucuları kendi yedek yazı tipleriyle geniş harflerle, PDEfe Windows'un eş aralıklı yazı tipiyle (Consolas) gösterir.

## 0.1.4 — 2026-09-23

### Görüntü kalitesi
- Yazı çizimi değişti: harfler yazı tipindeki biçimleriyle ve gri yumuşatmayla çizilir. Kalın yazılar doğru kalınlığa yaklaştı: UYAP tebligatının kalın satırlarındaki fazla koyuluk aynı ekran koşulunda (%125 ölçek) %31'den %13'e indi. Küçük yazılardaki renkli kenarlar (ClearType saçağı) kalktı.
- Yatay döndürülen sayfada yazılar düz sayfadaki gibi görünür; uzaklaştırınca harfler incelip bozulmuyor.
- Gömülü olmayan Times, Helvetica / Arial ve Courier yazıları yaygın PDF okuyucularında olduğu gibi Windows'un Times New Roman, Arial ve Courier New yazı tipleriyle çizilir. UYAP doğrulama satırındaki Consolas, "e-imzalı" damgasındaki Segoe Script gibi öteki yazı tipleri Windows'taki kendi biçimleriyle görünür.
- Ayarlar › Görünüm › Yazı çizimi: "Dengeli" (varsayılan) ya da "Windows ClearType" (önceki, daha koyu çizim). Değişiklik belgeler yeniden açılınca uygulanır.

### Vurgu ve notlar
- Vurguya tıklayınca altında küçük bir çubuk açılır: renkler, Not ekle / Notu düzenle ve Kaldır. Başka PDF okuyucularında eklenmiş vurgularda, altı çizili, üstü çizili ve dalgalı işaretlerde de çalışır. Renk değişince çubuk açık kalır, `Ctrl+Z` geri alır; varsayılan vurgu rengi değişmez. `Esc` ya da başka bir yere tıklamak çubuğu kapatır.
- Otomatik kaydetme artık varsayılan olarak açık: notlar ve döndürme kısa bir gecikmeyle dosyaya yazılır; dosya başka bir PDF okuyucuda ya da UYAP'ta açıldığında görünür. PDEfe'nin kaydettiği vurgu, metin notu, yazı ve not yaygın bir PDF okuyucunun kendi çizim motoruyla denetlendi ve görünüyor; görünmeme nedeni notların kaydedilmemiş olmasıydı. Ayarlar › Kaydetme › Otomatik kaydet'ten kapatılabilir.
- Dosya başka bir programda (örneğin bir PDF okuyucuda) açık olduğu için otomatik kayıt yapılamazsa her değişiklikte hata penceresi açılmaz: bir kez bildirilir, değişiklikler PDEfe'de durur; o programı kapatıp `Ctrl+S` ile kaydedilir.

### Yazı aracı
- Koyu temada "Sayfayı da koyulaştır" açıkken yazı kutuları görünür: yazarken ve sonra siyah yazı beyaz, beyaz dolgu siyah görünür (sayfayla aynı biçimde). Dosyadaki renk değişmez. Önceden siyah yazı siyah sayfada görünmüyordu.
- Biçim çubuğundaki ayrı "Dolgusuz" düğmesi kaldırıldı: Dolgu rengi düğmesi bir palet açar; içinde Dolgusuz, on açık renk ve Diğer renk (Windows renk seçicisi) var. `Esc` ya da dışarı tıklamak yalnızca paleti kapatır, yazı düzenlemesi sürer.

### Sekmeler ve pencereler
- Sekmeler adın uzunluğuna göre genişleyip daralmaz; hepsi aynı genişliktedir. "ustyazi (85).pdf", "(2)TensipZapti (9).pdf" gibi UYAP adları tam görünür, uzun adlar üç noktayla kısalır; sekmenin üzerine gelince tam ad ve dosyanın yolu görünür. Sığmayan sekmeler eskisi gibi ◀ ▶ ve fare tekerleğiyle gezilir.
- Sürüklenen sekme sekme çubuğunun dışında bırakılınca ekranda görünen sıra geçerli olur; önceden `Ctrl+1` – `Ctrl+9` ve ◀ ▶ eski sırayla başka sekmeye gidiyordu.
- Uygulama içinde bir pencere açıkken (araç pencereleri, Ayarlar, Yazdır, Klavye kısayolları, parola sorusu, `Ctrl+Tab` seçicisi, soru kutuları) arkadaki karartılmış alana tıklamak pencereyi kapatır; sonuç `Esc` ya da × ile aynıdır. Araç penceresinde işlem sürüyorsa, Sayfaları düzenle'de kaydedilmemiş değişiklik ya da birleştirme listesinde dosya varsa önce sorulur; yazdırma hazırlanırken dışarı tıklamak Vazgeç gibi yazdırmayı durdurur. Pencerenin içinde başlayıp dışarıda biten metin seçimi ya da sürükleme, sağ ve orta tık pencereyi kapatmaz.
- Soru ve hata kutuları (kaydedilmemiş değişiklik, döndürme sorusu, kaydetme ve yazdırma hataları, araç soruları, Ayarlar'daki "Varsayılanlara dön") artık Windows kutusu olarak değil uygulamanın içinde açılır; açık ve koyu temaya uyar, iletisi seçilip kopyalanabilir. Arkadaki alana tıklamak ya da `Esc` Vazgeç ile aynıdır; `Enter` seçili düğmeye basar, `Tab` düğmeler ve "Seçeneğimi hatırla" arasında gezer.
- Araç penceresi, Ayarlar ya da Klavye kısayolları açıkken çıkan soru onların üstünde açılır; dışına tıklamak yalnızca soruyu kapatır, alttaki pencere açık kalır. Soru açıkken belge ve kısayol tuşları, menü komutları ve pencereyi kapatma çalışmaz; önce soru yanıtlanır. Yazı düzenlenirken çıkan soruda `Esc` yalnızca soruyu kapatır, yazılan korunur.
- Açık belgeler listesi ve Bul seçenekleri menüsü dışarıda nereye basılırsa basılsın kapanır; önceden bir nota tıklayınca açık kalıyordu.
- Araç penceresi kapatılırken işlem aynı anda biterse kapanış işleri (ör. Küçült'te sekmeyi yenileme) iki kez çalışmaz.

### Araçlar
- Kaydetme seçiminde "Üzerine yaz" seçilince altındaki satır sonucun geri alınıp alınamayacağını söyler: PDF küçült ve PDF ayır'da sarı uyarı kutusu ("Geri alınamaz: sonuç "…" dosyasının yerine yazılır, yedek alınmaz."), Döndür ve kaydet ile Sayfaları düzenle'de "Ctrl+Z ile geri alınabilir" bilgisi; düğmenin ipucu da aynısını söyler.
- Sayfaları düzenle: küçük resimlerin arasındaki boş alandan fareyle sürükleyerek birden çok sayfa seçilir; seçim sürüklerken güncellenir, `Ctrl` ya da `Shift` ile önceki seçime eklenir, listenin üst ya da alt kenarına gelince liste kendiliğinden kayar, `Esc` vazgeçer.
- Sayfaları düzenle'de "Uygula" yerine "Yeni belge olarak kaydet" (varsayılan; `<ad> (düzenlenmiş).pdf`, Masaüstü ya da Ayarlar'daki çıktı klasörü) ve "Üzerine yaz" seçimi, düğme "Kaydet". Yeni belgede özgün dosya ve sekmesi değişmez, yeni dosya yeni sekmede açılır; notlar, bağlantılar ve yer imleri korunur. Üzerine yazma belgeye uygulanıp kaydedilir, `Ctrl+Z` ile geri alınabilir.
- Sayfaları düzenle'de kaydedilmiş döndürmesi olan sayfanın küçük resmi iki kez döndürülmüş görünüyordu (ör. Döndür ve kaydet'ten sonra).
- PDF ayır'a "Üzerine yaz" eklendi: seçili sayfaları çıkarırken ya da tek aralıkta özgün dosyada yalnızca ayrılan sayfalar kalır (yedek alınmaz, geri alınamaz; önizleme kalacak ve silinecek sayfaları söyler). Birden çok dosya üreten ayırmada yalnızca yeni belge olarak kaydedilir. Dosya başka bir programda açıksa ya da salt okunursa özgün dosya değişmez; belge sonra yeni haliyle yeniden açılır.
- Sekmede kaydedilmemiş sayfa silme ya da sıralama varken PDF ayır önce kaydetmeyi ister (sayfa numaraları dosyadakiyle uyuşmaz).
- Görüntü / PDF birleştir'de "Orijinal boyut" seçilince sayfa tam görsel boyutundadır; arkada beyaz kenar ya da ince beyaz çizgi kalmaz. Kenar ayarı yalnızca "A4'e sığdır"da görünür.
- Araçlar penceresinden Paylaş karosu kaldırıldı; Paylaş araç çubuğundaki düğmeyle ve Araçlar menüsünde duruyor.

### Bilinen sınırlar
- "Dengeli" yazı çiziminde yazılar gri yumuşatmayla çizilir; LCD ekran yumuşatması (renkli alt piksel) kullanılmaz. Tercih edilirse Ayarlar › Görünüm › Yazı çizimi › Windows ClearType.
- Gömülü olmayan Tw Cen MT gibi bazı yazı tiplerinde "ğ" iki çizimde de bozuk görünebilir (belgenin kodlaması; önceden de öyleydi).
- Sayfaları düzenle'de yeni belge ve PDF ayır'ın üzerine yazması, yapısal kayıttaki gibi başka PDF okuyucularında yazılmış yanıtları ve kopyalanan parçanın dışına giden sayfa içi bağlantıları taşımaz; notlar, form alanları ve yer imleri korunur.
- Görüntü / PDF birleştir'de kenar ayarı "mm" diye yazar ama nokta (pt) olarak uygulanır (önceki sürümlerde de böyleydi).
- Notların başka bir PDF okuyucuda görünmesi o okuyucunun önizleme motoruyla (ekrana pencere açmadan) denetlendi; okuyucunun penceresinde gözle bakılmadı.

## 0.1.3 — 2026-09-22

### Güncelleme
- Güncelleme denetimi 10 açılışta bir yapılır: kurulumdan ya da güncellemeden sonraki ilk açılışta, sonra her 10 açılışta bir, pencere açıldıktan birkaç saniye sonra arka planda. Günlük denetim kaldırıldı. İnternet yoksa sessizce geçilir ve bir sonraki açılışta yeniden denenir.
- Yeni sürüm varsa üstteki şeritte "PDEfe X hazır (kullandığınız: Y)." yazar ve tek bir Güncelle düğmesi çıkar: tek tıkla indirilir (yalnızca değişen kısımlar), kurulum sihirbazı açılmadan kurulur ve PDEfe kendiliğinden yeniden açılır. "Sürüm notları" sürüm sayfasını açar, "Daha sonra" şeridi bu oturum için gizler.
- Kaydedilmemiş belge varsa kurmadan önce sorulur. Vazgeç denirse indirilen sürüm saklanır; şeritteki "Kur ve yeniden başlat" yeniden indirmeden kurar. PDEfe o arada kapatılırsa bir sonraki açılışta şerit yeniden görünür.
- İndirme ya da kurulum başarısız olursa şeritte kısa bir Türkçe açıklama ve "Yeniden dene" düğmesi görünür.
- Yardım › Güncellemeleri denetle ve Ayarlar › Güncelleme › Şimdi denetle sayaca bakmadan hemen denetler; Ayarlar'daki sonuç satırında da Güncelle düğmesi vardır. Anahtarın adı "Açılışta güncellemeleri denetle (10 açılışta bir)" oldu.
- Uygulama içinden başlatılan kurulum artık her zaman sessizdir: önceden kurulum penceresi görünüyor, PDEfe ancak "Son"a basılınca açılıyordu.

## 0.1.2 — 2026-09-22

### Görüntüleme ve kalite
- Görseller keskin çizilir: küçülen JPEG sayfalar ve taramalar net; karekod, barkod gibi küçük görseller her yakınlaştırmada keskin kenarlı; fotoğraf ve taramalar çok büyütülünce pikselli değil yumuşak görünür.
- İnce çizgiler (tablo kenarlıkları, alt çizgiler, çerçeveler) iki satıra yayılmış gri yerine tam piksel çizilir; kesikli ve noktalı çizgiler özgün desenle hizalıdır, sonlarında fazladan parça çıkmaz.
- Harfler aynı ölçekte yaygın bir PDF okuyucuyla ölçülüp karşılaştırıldı ve eşit çıktı; "bulanık harf" izlenimini gri alt çizgi ve kenarlıklar veriyordu.
- Yakınlaştırırken sayfa önce yumuşak, sonra keskin görünmez; tek adımda keskin çizilir. Taranmış belgede kaydırma durunca oluşan kısa donma giderildi.
- Arka plan görüntüsü ve ayrı metin katmanından oluşan taramalarda %2400 ve üstünde kaybolan yazı artık görünür ve net; %1600–%6400 yakınlaştırma bekletmez, ekran kartı belleği birkaç GB'a çıkmaz.
- Koyu temada "Sayfayı da koyulaştır" açıkken sayfa ve henüz çizilmemiş sayfanın yer tutucusu tam siyah; koyulaştırılmış sayfada metin renk saçaksız beyaz.
- Sayfalar panelinde döndürülmüş sayfanın küçük resmi doğru oranlı kutuda ve doğru yönde görünür.

### Vurgu ve notlar
- Vurgu yazının rengini değiştirmez: yalnızca zemin renklenir, siyah yazı siyah kalır. Başka PDF okuyucularında ya da PDEfe'de eklenen vurgularda, açık ve koyu temada, koyulaştırılmış sayfadaki taramalar ve resimler üzerinde de böyledir. Seçili vurgu gölge yerine mavi kenarla gösterilir.
- Varsayılan vurgu rengi ve opaklığı PDF okuyucularında yaygın varsayılanla aynı: sarı #FFD100, %40. Eski varsayılan sarıyı (#FFEB3B) kullananların ayarı bir kez yeni sarıya taşınır.
- Seçili metne not (seçim mini çubuğu, sağ tık › Not ekle ya da metin seçiliyken Not aracı) PDF okuyucularındaki "Metinle ilgili yorum" gibi çalışır: metin vurgulanır, not vurgunun içine yazılır, not kutusu hemen açılır. Balon başlığında ve Yorumlar panelinde türü "Metin notu" yazar. Metin seçili değilken Not aracı eskisi gibi çalışır.
- Notu olan vurgunun (başka PDF okuyucularında eklenenler dahil) ilk satırının bittiği yerde, dipnot işareti gibi hafif yukarıda küçük bir not simgesi görünür; yakınlaştırmayla büyür küçülür, döndürülmüş sayfada da yerindedir. Aynı yerde biten iki notun simgeleri yan yana dizilir; simgenin üzerine gelince ait olduğu vurgu kesik kenarla belirginleşir, tıklayınca not düzenlenmek üzere açılır.
- Notun üzerine gelince (vurgu, simge, not) not tıklamadan yaklaşık 0,1 saniyede görünür; fare not kutusuna geçerken kapanmaz, metin seçerken açılmaz. Not kutusu kendi notunu ve yakındaki notları örtmeyen yere açılır, uzun notlar kaydırmadan okunur.
- Notu olmayan vurgunun üzerine gelince boş not kutusu açılmaz; not eklemek için vurguya çift tıklanır.
- Kaydedilen vurgu ve notlar yaygın PDF okuyucularının kullandığı yapıda yazılır (gizli açılır pencere, benzersiz not adı, notlu vurgu "Metinle İlgili Yorum Yap" olarak). Silinip geri alınan not bu bilgiyi ve ilk oluşturma tarihini korur.
- Başka bir PDF okuyucuda düzenlenmiş bir notun metni PDEfe'de değiştirilince o okuyucu artık eski metni göstermez.

### Yazı aracı
- Dolgu rengi seçilemiyordu, bu yüzden "Dolgusuz" da işe yaramıyordu: ikisi de anında uygulanır, geri alınabilir; kaydedince başka PDF okuyucularında da saydam kutu görünür. "Arka plan" düğmesinin adı "Dolgu rengi" oldu.
- Kalın, İtalik (yeni düğme) ve Altı çizili yazının tamamına değil seçili metne uygulanır; seçim yoksa sonra yazılacak metne (`Ctrl+B` / `Ctrl+I` / `Ctrl+U`). Düğmeler imlecin bulunduğu yerin biçimini gösterir; çift tıkla seçilen sözcükte de doğru çalışır, alt çizgi sondaki boşluğa uzamaz. Yazı rengi de seçime uygulanır; yazı tipi ve boyut kutunun tamamı için geçerlidir.
- Biçimli yazı PDF'e standart zengin metin biçiminde yazılır; başka PDF okuyucularında ve PDEfe'de yeniden açınca aynı görünür. Başka PDF okuyucularında hazırlanmış yazı kutularının biçimi ve kenarlık rengi PDEfe'de düzenlenince korunur.
- Kaydedilen yazıda satırlar ekrandakiyle aynı yerden kırılır, başka PDF okuyucularında son satır kesilmez. Calibri yazıların yukarı kayması ve düzenlerken yakınlaştırınca metnin çift görünmesi düzeltildi.
- Yazı düzenlenirken `Ctrl+Z` / `Ctrl+Y`, araç çubuğundaki ve Düzen menüsündeki Geri al / Yinele yazının kendi adımlarını (metin, biçim, dolgu, kenarlık) geri alır; belge geri alınıp yazı kaybolmaz. Düzenleme bitince bütün değişiklik belgede tek adımda geri alınır, kayıttan sonra da.
- Yazı düzenlenirken araç açmak, Paylaş, Yazdır, kaydetme, sekme ya da pencere kapatma ve sayfa, yakınlaştırma ya da Bul kutusuna geçmek önce yazılanı uygular; o kutularda basılan Esc yazıyı silmez. Otomatik kaydetme yazarken kutuyu kapatmaz.
- Yazı kutusunda `Esc` artık yazılanı atmaz: PDF okuyucularında alışıldığı gibi düzenlemeyi bitirip uygular, kutu seçili kalır ve `Ctrl+Z` tek adımda geri alır. Boş yeni kutu `Esc` ile kaldırılır. Biçim çubuğundayken de aynıdır (açık yazı tipi listesi önce kendisi kapanır); düzenlerken açılan `F1` penceresindeki `Esc` yalnızca pencereyi kapatır.
- Yazı düzenlenirken kaydırınca biçim çubuğu kutuyu izler; fare tekerleği ve PageUp / PageDown kutuyu görünümden çıkarmaz, sayfayı çevirmez.
- Döndürülmüş sayfadaki yazılar dosyadaki yönüyle (başka PDF okuyucularında olduğu gibi) görünür ve düzenlenir; sayfa döndürülünce yazı da döner, taşıma ve boyut tutamaçları fare yönünde çalışır.
- Yazıya çift tıklayınca imleç tıklanan yere konur; hiçbir şey değiştirmeden kapatmak belgeyi değişmiş saymaz.

### Metin seçimi ve arama
- Metin seçimi sayfanın boş bir yerinden de başlar (kenar boşluğu, satır ya da paragraf arası). Sürüklerken seçim canlı güncellenir, sayfa başına ya da sonuna sıçramaz, sayfalar arasında sürer; pencere kenarına gelince belge kendiliğinden kayar. Shift+tıklama seçimi genişletir, boş yere tıklama kaldırır.
- Seçim okuma sırasını izler: Word ve UYAP belgelerinde sayfanın altına sürükleyince başlangıcın üstündeki metin seçilmez, alt bilgi fare ona ulaşmadıkça seçime girmez. İki sütunlu metinde, tebligat formu ile muhatap bloğunda ve yan yana imza bloklarında yalnızca farenin geçtiği blok seçilir. Bloğun altındaki boşluğa bırakınca seçim o bloğun son satırında biter, satırın sonunu aşarak sürüklemek satırın kalanını seçer; tebligat mazbatasında birinci nüsha ikinci nüshadan önce okunur. Kopyalama, Vurgula ve Not ekranda görünen seçimi kullanır.
- Çift tıklayıp sürükleyince seçim sözcük sözcük genişler. Üç tıklama yalnızca tıklanan paragrafı seçer: üst bilgi, alt bilgi ve önceki başlık girmez; sütunlu sayfada yalnızca o sütun seçilir, numaralı asılı girintili madde bölünmez.
- Birkaç sayfaya yayılan seçim kaydırınca bozulmaz; kopyada aradaki sayfalar eksik kalmaz.
- Seçerken sayfanın sol üst köşesinde beliren kesik mavi şerit giderildi; seçim renginin altında harfler özgün renginde kalır.
- Vurgu aracı açıkken boş yerden başlayan sürükleme de metni seçip vurgular (PDF okuyucularındaki "Metni vurgula" aracı gibi); not ve yazı araçlarında seçim başlamaz.
- Arama sonuçlarında harflerin rengi değişmez, yalnızca zemin boyanır (geçerli sonuç turuncu, diğerleri sarı).
- Bul kutusu etkin belgenin sonuçlarını gösterir; sekmeye dönünce o belgede en son gidilen eşleşme yeniden geçerli olur. Arama açıkken yapılan seçim arama kapanınca korunur.

### Gezinme ve görünüm
- İki sayfa düzeninde sağ ok, PageDown ve Sonraki sayfa düğmesi bir sonraki çifte geçer (kapak ayrıyken de). Son sayfaya okla ulaşılır, sayfa kutusuna yazılan sayfa numarası kalır, tek kalan son sayfa çiftlerle aynı boyutta gösterilir.
- İki sayfa düzenine geçince ve bu düzende belge açılınca yakınlaştırma her zaman Sayfayı sığdır olur. Tek sayfaya geçince Genişliğe sığdır olur (Ayarlar › Başlangıç'ta başka bir sığdırma seçeneği seçiliyse o).
- Kaydırma kapalıyken fare tekerleği sayfa sonunda sonraki sayfaya geçer; aşağı ok ve PageDown uzun sayfada önce sayfa içinde kaydırır, sonunda sayfayı çevirir (PDF okuyucularının tek sayfa görünümü gibi). Elle yakınlaştırılmış sayfada sağ / sol ok önce yana kaydırır, yeni sayfa okuma yönündeki kenarından başlar.
- Tek sayfalık belgede Döndür düğmesi ve `Ctrl+Shift++` / `Ctrl+Shift+−` "Geçerli sayfa / Tüm PDF" diye sormadan döndürür.
- Klavye kısayolları ya da Araçlar penceresi açıkken ok tuşları arkadaki belgeyi çevirmez. Kaydırma kapalıyken sayfa çevrilince önceki sayfadaki not bırakılır; Delete görünmeyen sayfadaki notu silmez.
- Yakınlaştırma kutusu her zaman "%150" biçiminde görünür. "Son kullanılan" yakınlaştırma seçiliyse yeni belge son kullanılan ölçekle açılır.

### Araç çubuğu ve menüler
- Araç çubuğuna "Araçlar" düğmesi eklendi: PDF küçült, Sayfaları düzenle, Döndür ve kaydet, PDF ayır, Görüntü / PDF birleştir ve Paylaş büyük, renkli simgeler ve kısa açıklamalarla bir pencerede açılır. Belge yokken PDF gerektiren araçlar soluk görünür; pencere klavyeyle de kullanılır.
- Sol panel düğmesi en başa, Kaydet onun sağına geçti. Kaydet, Geri al, Yinele, sayfa ve yakınlaştırma kutuları sekme değişince, yeni belge açılınca ve sekmeler kapanınca doğru duruma gelir.
- Menülerdeki, düğmelerdeki ve yer tutuculardaki üç noktalar kaldırıldı ("Aç", "Farklı kaydet", "Yazdır", "Bul", "Sayfaya git", "Ayarlar", döndürme komutları, araçlar ve diğerleri).
- Araçlar menüsünün sırası: PDF küçült, Sayfaları düzenle, Döndür ve kaydet, PDF ayır, Görüntü / PDF belgeleri birleştirerek PDF oluştur, Paylaş.
- Tema düğmesi geçerli temayı gösterir: koyu temada kalın, içi dolu ay; açık temada dolu güneş.
- Dar pencerede araç çubuğu taşmaz: boşluklar daralır, Araçlar düğmesinde yalnızca simge kalır, en son gerekirse araç çubuğundaki Paylaş gizlenir (Araçlar penceresinde ve menüde durur).
- Klavye kısayolları (`F1`) bölümlere ayrıldı ve iki sütunda kaydırmadan sığar; yazı kutusu kısayolları ve Ayarlar (`Ctrl+,`) eklendi.
- Paylaş bildirimi: "Dosya panoya kopyalandı — Ctrl+V veya Yapıştır ile yapıştırabilirsiniz".

### Araç pencereleri
- Araç pencereleri sadeleşti: Kapat / Vazgeç düğmeleri yok (X ya da Esc ile kapanır, işlem sürerken sorulur), ana işlem düğmesi alt şeridin ortasında; kaydetme satırında kısa dosya adı, klasör ve Değiştir düğmesi var. Penceredeki metinler fareyle seçilip kopyalanabilir.
- Standart kaydetme seçimi: PDF küçült ve Döndür ve kaydet'te "Yeni belge olarak kaydet" (varsayılan) ya da "Üzerine yaz". Yeni belge "<ad> (küçültülmüş).pdf" / "<ad> (döndürülmüş).pdf" adıyla kaydedilir; araçların yeni dosyaları için varsayılan klasör Masaüstü (Ayarlar › Dosya › Çıktı klasörü boşsa).
- "Üzerine yaz" yedek almaz: sonuç önce geçici dosyaya yazılıp özgün dosyanın yerine konur. Dosya başka bir programda açıksa ya da salt okunursa özgün dosya değişmez ve nedeni söylenir; yazılan dosya bir sekmede açıksa o sekme aynı sayfada yeni haliyle açılır. PDF küçült'te sonuç küçülmediyse özgün dosyaya dokunulmaz.
- Döndür ve kaydet: "Üzerine yaz" döndürmesi açık belgeye uygulanıp kaydedilir ve `Ctrl+Z` ile geri alınabilir; sekmede kaydedilmemiş başka değişiklik varsa önce sorulur. Seçenekler "Tüm sayfalar (129 sayfa)" / "Geçerli sayfa (9. sayfa)" biçiminde yazar.
- Görüntü / PDF birleştir: genel kalite Orijinal / Yüksek / Orta / Düşük düğmeleriyle seçilir ve her düğmede toplam tahmini boyut yazar (aynı dosya birden çok kez eklense de gerçeğe yakın). Teknik DPI / JPEG ifadeleri kaldırıldı; öğeye özel ayar notu "Değiştirildi (öğelerde özel ayarlar var)" oldu.
- Görüntü / PDF birleştir: `Ctrl+V`, Panodan ekle ve listede sağ tık Yapıştır Gezgin'den kopyalanan dosyalarda ve ekran görüntüsünde anında çalışır. Türkçe karakterli dosya adları eklenebilir ("Dosya bulunamadı" hatası giderildi); "Yol olarak kopyala" ile kopyalanmış yollar da alınır.
- PDF küçült: seviye kartlarında teknik DPI / JPEG bilgisi yok; dar pencerede kartlar yan yana kalır.
- Uzun işlemlerde İptal düğmesi işlemi gerçekten durdurur.

### Kaldırılanlar
- "PDF birleştir" aracı; aynı işi Görüntü / PDF birleştir yapar.
- Nota yanıt yazma ve yanıt silme. Başka PDF okuyucularında yazılmış yanıtlar kaybolmasın diye not kutusunda salt okunur gösterilir, Yorumlar panelinde sayıları durur.
- PDF küçült "Üzerine yaz" yedeği (`<ad> (yedek).pdf` artık oluşturulmaz).

### Bilinen sınırlar
- Başka bir PDF okuyucunun %100'ü (110 ppi çözünürlük ayarıyla) PDEfe'nin %100'ünden yaklaşık %13 büyük görünür. Harfleri ve görselleri aynı büyüklükte karşılaştırın (ör. PDEfe'de %115, öteki okuyucuda %100).
- "Sayfayı da koyulaştır" açıkken taranmış sayfalar ve görseller özgün renginde kalır.
- Vurgu ve arama vurgusu beyaz ya da açık zeminde harf rengini korur; koyu ya da renkli dolgulu alanlarda (ör. koyu zeminli tablo başlığındaki beyaz yazı) harfler vurgu rengini alır. Tek bir karışım kipi ikisini birden sağlayamaz; yaygın PDF okuyucularındaki vurgu da böyledir.
- Not simgesi sıkışık metinde ya da küçük yakınlaştırmada komşu harflere biraz binebilir (yarı saydam hale yazıyı okunur tutar).
- Alt bilgi gibi okuma sırası farklı satırları da kapsayan seçimlerde boyama biraz farklı çizilir; iki yana yaslı satırlarda sözcük aralarında ince boşluk kalabilir.
- Taranmış belge ilk açıldığında sayfa bir an hızlı (yumuşak) çizilip keskinleşir.
- `Ctrl+Shift++` / `Ctrl+Shift+−` kısayolları yalnızca çalıştırdıkları komut üzerinden sınandı; klavyeden elle denenmelidir.
- PDEfe'nin notlu vurguları ve biçimli yazıları yaygın bir PDF okuyucunun yazdığı yapıyla alan alan karşılaştırıldı; o okuyucuda açılarak doğrulanmadı.

## 0.1.1 — 2026-09-17

### Düzeltmeler
- Yeni açılan belgede vurgu (seçim mini çubuğu, araç çubuğundaki düğme, sağ tık menüsü), not / yorum ve Yazı aracı çalışmıyordu.
- Vurgu mini çubuğu fareyi izliyordu: artık seçimin altında sabit durur, başka bir yere tıklanınca kapanır.
- Harfler bulanık görünüyordu: sayfa tuvali ekranın piksel ızgarasına oturtuldu.
- Büyütülen görseller (fotoğraf, taranmış sayfa) pikselli çiziliyordu: yüksek kaliteli yumuşatmayla çizilir.
- Sayfa numarası kutusu tek sayfa / iki sayfa düzeninde ve kutu odaktayken güncellenmiyordu.
- Sayfa geçişlerinde komşu sayfalar önceden çizilir; koyu modda henüz çizilmemiş sayfa beyaz değil koyu yer tutucuyla görünür.
- Dosyada döndürme bilgisi (/Rotate) olan sayfalar dönmemiş ve kesik çiziliyordu; metin seçimi, vurgu, form alanları ve kopyalama bu sayfalarda yanlış yere gidiyordu.
- Yalnızca döndürme değiştiyse kayıt artımlı yapılır: e-imzalı belgelerde imzalı baytlar korunur, ekli dosyalar ve belge bilgileri kaybolmaz.
- Kayıttan sonra geri alıp yeni bir değişiklik yapınca belge kaydedilmiş görünüyordu (kapatırken sorulmuyordu); kayıttan sonra geri alınan not silme notu geri getirmiyordu.
- Yapısal kayıttan (sayfa silme/sıralama) sonra geri alınıp yeniden kaydedilen sayfa yanlış kaynaktan yazılabiliyordu.
- Kayıt sürerken sekme ya da pencere kapatılınca kayıt yarıda kalabiliyordu: artık önce kaydın bitmesi beklenir.
- "Şimdi yeniden başlat ve kur" kaydedilmemiş değişiklikleri sormadan siliyordu.
- Yapısal kayıtta alınan geçici kopyalar veri klasöründe birikiyordu: açılışta temizlenir.
- Taranmış çok sayfalı belgelerde kaydırdıkça bellek kullanımı sınırsız artıyordu.
- PDF küçült "Üzerine yaz" sonrasında açık sekme güncel dosyayla yeniden açılır; kaydedilmemiş değişiklik varsa önce sorulur. Üzerine yazma başarısız olursa gereksiz yedek silinir.

### Değişiklikler
- Döndür düğmesi ve `Ctrl+Shift++` / `Ctrl+Shift+−` belgeyi döndürür: "Geçerli sayfa / Tüm PDF / Vazgeç" sorulur, "Seçeneğimi hatırla" kutusu vardır (sonradan Ayarlar › Görünüm'den değiştirilir). Döndürme geri alınabilir; belge değişmiş sayılır ve kapatırken kaydetme sorulur.
- Sayfa düzeni: "Tek sayfa / İki sayfa" seçimi ve ondan bağımsız "Kaydırmayı etkinleştir" aç/kapa. Seçim bütün sekmelere uygulanır ve hatırlanır; iki sayfaya geçince elle seçilmiş yakınlaştırma "Sayfayı sığdır"a döner.
- Açık belgeler listesindeki kutu "Tüm belgelerde ara" oldu: her belgedeki eşleşme sayısını gösterir; Enter ya da tıklama Bul kutusunu tüm sekmeler kapsamında açar. Bul kutusunun seçenekler simgesi dişli oldu.
- Temiz kopyalamada paragraflar tek satır sonuyla ayrılır; UYAP Doküman Editörü'ne (UDF) ya da Word'e yapıştırınca boş paragraflar oluşmaz.
- Kaydedilmemiş değişiklik sorusu yalnızca sekme ya da pencere kapatılırken çıkar; sekme değiştirirken sorulmaz.
- PDF küçült: "Önerilen sıkıştırma" adı "İdeal sıkıştırma" oldu. "Üzerine yaz" seçilince özgün dosyanın yedeği gizli veri klasörüne değil, aynı klasöre `<ad> (yedek).pdf` adıyla alınır.
- Yazdırmada "Notları yazdır" varsayılan olarak kapalı.

### Kaldırılanlar
- Açık sekmeleri hatırlama: PDEfe yeniden açıldığında önceki sekmeler geri yüklenmez.
- "Sekme değiştirirken sor" ayarı.
- PDF küçült "Özel" seviyesi (DPI / JPEG kalitesi sürgüleri); üç hazır seviye kaldı.
- Araç çubuğundaki Aç ve Ayarlar düğmeleri (`Ctrl+O`, `Ctrl+,` ve menüler duruyor).
- Ayarlar › Hakkında'daki logo ile lisans, üçüncü taraf bileşen ve altyapı bilgisi.

## 0.1.0 — 2026-09-16

İlk sürüm.

### Görüntüleme
- Sekmeli PDF görüntüleyici; sekmeler sürüklenerek sıralanır, `Ctrl+Tab` ile son kullanılan sırayla seçici açılır.
- Sayfa düzenleri: tek sayfa, sürekli, iki sayfa, iki sayfa sürekli; kapak sayfası ayrı seçeneği.
- Yakınlaştırma: sayfa genişliği, tam sayfa, gerçek boyut, serbest (%6400'e kadar bölgesel çizim); `Ctrl+fare tekerleği`.
- Görünümü döndürme, okuma modu (`Ctrl+H`), tam ekran (`F11`), koyu / açık tema (sistemi izler; sayfa koyulaştırma seçeneği).
- Sol panel (`F4`): sayfa küçük resimleri, İçindekiler (yer imleri), Yorumlar listesi.
- Açık sekmeleri ve kalınan sayfayı hatırlama; son açılan dosyalar; sürükle-bırak ile açma; `.pdf` çift tıklama ile açılma.
- Parola korumalı belgeleri açma.

### Metin ve arama
- Metin seçme ve **temiz kopyalama**: satır sonlarındaki tireler, girintiler ve paragraflar düzeltilerek panoya yazılır (ham kopyalama ayarı da var).
- Üç tıklamayla paragraf seçme; `Ctrl+A` sayfadaki tüm metni seçer.
- Türkçe duyarlı arama (`Ctrl+F`, `F3` / `Shift+F3`): İ/ı ayrımı doğru, tam sözcük seçeneği, yer imlerinde ve yorumlarda arama, tüm sekmelerde arama.
- Word 2010 kaynaklı bozuk Türkçe karakter (Ġ→İ, ġ→Ş, Ģ→ş) düzeltmesi hem görünen metinde hem aramada.

### Notlar (başka PDF okuyucularıyla uyumlu)
- Var olan notların gösterilmesi: vurgu ailesi, not, yazı, çizim ve diğer türler.
- Yeni: vurgu (renk ve saydamlık ayarı), not, yanıt, serbest yazı (FreeText). Yazılar Türkçe karakter içeren Windows fontuyla (Segoe UI, Arial, Times, Calibri; kalın dahil) belgeye gömülür.
- Notları taşıma, düzenleme, silme; sınırsız geri al / yinele (`Ctrl+Z` / `Ctrl+Y`), kayıttan sonra da geri alma.
- Artımlı kaydetme: belgenin geri kalanına dokunulmaz, yalnızca not farkı yazılır. Otomatik kaydetme ve sekme değişiminde sorma seçenekleri.

### Araçlar
- PDF küçült: üç hazır seviye ya da özel DPI / JPEG kalitesi, boyut tahmini, ilerleme ve iptal.
- Sayfaları düzenle: küçük resim ızgarasında sürükleyerek sıralama, silme, döndürme, boş sayfa ve başka PDF'ten sayfa ekleme; pencere içi geri al / yinele.
- PDF ayır: sayfa aralıklarına göre, her N sayfada bir, seçili sayfaları çıkart, her sayfa ayrı dosya.
- PDF birleştir ve Görüntü / PDF belgelerinden PDF oluştur: dosya ekle, sürükle-bırak, Gezgin'den kopyalanan dosyaları ve panodaki görüntüyü `Ctrl+V` ile ekleme, sıralama, çıktı adı ve yeri.
- Döndür ve kaydet: tüm sayfalar, geçerli sayfa ya da aralık; 90° / 180°.
- Yazdırma (`Ctrl+P`): sayfa aralığı, kâğıt boyutu ve sığdırma seçenekleri; sayfalar görüntü olarak basılır (notlar ve Türkçe karakterler ekrandaki gibi).

### Paylaşma ve dosya
- Paylaş: belgeyi dosya olarak panoya kopyalar; UYAP, e-posta veya Gezgin'e `Ctrl+V` ile yapıştırılır.
- Klasörde göster, varsayılan uygulamayla aç.
- Belge içi ve dış bağlantılar tıklanabilir; form alanları görüntülenir.
- Ayarlar penceresi (`Ctrl+,`): görünüm, başlangıç, notlar, kopyalama, güncelleme, dosya ve Hakkında (sürüm ve üçüncü taraf bileşenler) bölümleri.

### Kurulum ve güncelleme
- Türkçe NSIS kurulum sihirbazı (yönetici hakkı gerekmez): kurulum klasörü seçimi, masaüstü kısayolu seçeneği, Başlat menüsü kısayolu, `.pdf` ilişkilendirmesi ("Birlikte aç"), Windows "Varsayılan uygulamalar" kaydı ve kurulum sonunda "PDEfe'yi varsayılan PDF görüntüleyici yap" seçeneği.
- Otomatik güncelleme: yeni sürüm çıktığında şerit gösterilir; indirme ilerlemesi ve tek tıkla yeniden başlatıp kurma. Elle denetim: Yardım › Güncellemeleri denetle ya da Ayarlar › Güncelleme.

### Bilinen eksikler
- Form alanları doldurulamaz (yalnızca görüntülenir); çizim (kalem) türü not eklenemez, var olanlar gösterilir.
- Kurulum paketi imzalı değildir; Windows SmartScreen uyarısı çıkabilir.
