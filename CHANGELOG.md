# Sürüm notları

Biçim: her sürüm için `## x.y.z — YYYY-AA-GG` başlığı; altındaki maddeler GitHub sürüm sayfasına
otomatik olarak kopyalanır (`.github/workflows/yayim.yml`).

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
- Görseller referans okuyucudaki gibi keskin çizilir: küçülen JPEG sayfalar ve taramalar net; karekod, barkod gibi küçük görseller her yakınlaştırmada keskin kenarlı; fotoğraf ve taramalar çok büyütülünce pikselli değil yumuşak görünür.
- İnce çizgiler (tablo kenarlıkları, alt çizgiler, çerçeveler) iki satıra yayılmış gri yerine tam piksel çizilir; kesikli ve noktalı çizgiler özgün desenle hizalıdır, sonlarında fazladan parça çıkmaz.
- Harfler aynı ölçekte referans okuyucu ile ölçülüp karşılaştırıldı ve eşit çıktı; "bulanık harf" izlenimini gri alt çizgi ve kenarlıklar veriyordu.
- Yakınlaştırırken sayfa önce yumuşak, sonra keskin görünmez; tek adımda keskin çizilir. Taranmış belgede kaydırma durunca oluşan kısa donma giderildi.
- Arka plan görüntüsü ve ayrı metin katmanından oluşan taramalarda %2400 ve üstünde kaybolan yazı artık görünür ve net; %1600–%6400 yakınlaştırma bekletmez, ekran kartı belleği birkaç GB'a çıkmaz.
- Koyu temada "Sayfayı da koyulaştır" açıkken sayfa ve henüz çizilmemiş sayfanın yer tutucusu tam siyah; koyulaştırılmış sayfada metin renk saçaksız beyaz.
- Sayfalar panelinde döndürülmüş sayfanın küçük resmi doğru oranlı kutuda ve doğru yönde görünür.

### Vurgu ve notlar
- Vurgu yazının rengini değiştirmez: referans okuyucudaki gibi yalnızca zemin renklenir, siyah yazı siyah kalır. Referans okuyucuda ya da PDEfe'de eklenen vurgularda, açık ve koyu temada, koyulaştırılmış sayfadaki taramalar ve resimler üzerinde de böyledir. Seçili vurgu gölge yerine mavi kenarla gösterilir.
- Varsayılan vurgu rengi ve opaklığı referans okuyucu ile aynı: sarı #FFD100, %40. Eski varsayılan sarıyı (#FFEB3B) kullananların ayarı bir kez yeni sarıya taşınır.
- Seçili metne not (seçim mini çubuğu, sağ tık › Not ekle ya da metin seçiliyken Yapışkan not) referans okuyucunun "Metinle ilgili yorum"u gibi çalışır: metin vurgulanır, not vurgunun içine yazılır, not kutusu hemen açılır. Balon başlığında ve Yorumlar panelinde türü "Metin notu" yazar. Metin seçili değilken Yapışkan not eskisi gibi çalışır.
- Notu olan vurgunun (referans okuyucuda eklenenler dahil) ilk satırının bittiği yerde, dipnot işareti gibi hafif yukarıda küçük bir not simgesi görünür; yakınlaştırmayla büyür küçülür, döndürülmüş sayfada da yerindedir. Aynı yerde biten iki notun simgeleri yan yana dizilir; simgenin üzerine gelince ait olduğu vurgu kesik kenarla belirginleşir, tıklayınca not düzenlenmek üzere açılır.
- Notun üzerine gelince (vurgu, simge, yapışkan not) not tıklamadan yaklaşık 0,1 saniyede görünür; fare not kutusuna geçerken kapanmaz, metin seçerken açılmaz. Not kutusu kendi notunu ve yakındaki notları örtmeyen yere açılır, uzun notlar kaydırmadan okunur.
- Notu olmayan vurgunun üzerine gelince boş not kutusu açılmaz; not eklemek için vurguya çift tıklanır.
- Kaydedilen vurgu ve notlar referans okuyucu yapısında yazılır (gizli açılır pencere, benzersiz not adı, notlu vurgu "Metinle İlgili Yorum Yap" olarak). Silinip geri alınan not bu bilgiyi ve ilk oluşturma tarihini korur.
- Referans okuyucuda düzenlenmiş bir notun metni PDEfe'de değiştirilince referans okuyucu artık eski metni göstermez.

### Yazı aracı
- Dolgu rengi seçilemiyordu, bu yüzden "Dolgusuz" da işe yaramıyordu: ikisi de anında uygulanır, geri alınabilir; kaydedince referans okuyucuda saydam kutu görünür. "Arka plan" düğmesinin adı "Dolgu rengi" oldu.
- Kalın, İtalik (yeni düğme) ve Altı çizili yazının tamamına değil seçili metne uygulanır; seçim yoksa sonra yazılacak metne (`Ctrl+B` / `Ctrl+I` / `Ctrl+U`). Düğmeler imlecin bulunduğu yerin biçimini gösterir; çift tıkla seçilen sözcükte de doğru çalışır, alt çizgi sondaki boşluğa uzamaz. Yazı rengi de seçime uygulanır; yazı tipi ve boyut kutunun tamamı için geçerlidir.
- Biçimli yazı PDF'e referans okuyucunun zengin metin biçiminde yazılır; referans okuyucuda ve PDEfe'de yeniden açınca aynı görünür. Referans okuyucuda hazırlanmış yazı kutularının biçimi ve kenarlık rengi PDEfe'de düzenlenince korunur.
- Kaydedilen yazıda satırlar ekrandakiyle aynı yerden kırılır, referans okuyucuda son satır kesilmez. Calibri yazıların yukarı kayması ve düzenlerken yakınlaştırınca metnin çift görünmesi düzeltildi.
- Yazı düzenlenirken `Ctrl+Z` / `Ctrl+Y`, araç çubuğundaki ve Düzen menüsündeki Geri al / Yinele yazının kendi adımlarını (metin, biçim, dolgu, kenarlık) geri alır; belge geri alınıp yazı kaybolmaz. Düzenleme bitince bütün değişiklik belgede tek adımda geri alınır, kayıttan sonra da.
- Yazı düzenlenirken araç açmak, Paylaş, Yazdır, kaydetme, sekme ya da pencere kapatma ve sayfa, yakınlaştırma ya da Bul kutusuna geçmek önce yazılanı uygular; o kutularda basılan Esc yazıyı silmez. Otomatik kaydetme yazarken kutuyu kapatmaz.
- Yazı kutusunda `Esc` artık yazılanı atmaz: referans okuyucudaki gibi düzenlemeyi bitirip uygular, kutu seçili kalır ve `Ctrl+Z` tek adımda geri alır. Boş yeni kutu `Esc` ile kaldırılır. Biçim çubuğundayken de aynıdır (açık yazı tipi listesi önce kendisi kapanır); düzenlerken açılan `F1` penceresindeki `Esc` yalnızca pencereyi kapatır.
- Yazı düzenlenirken kaydırınca biçim çubuğu kutuyu izler; fare tekerleği ve PageUp / PageDown kutuyu görünümden çıkarmaz, sayfayı çevirmez.
- Döndürülmüş sayfadaki yazılar dosyadaki yönüyle (referans okuyucu gibi) görünür ve düzenlenir; sayfa döndürülünce yazı da döner, taşıma ve boyut tutamaçları fare yönünde çalışır.
- Yazıya çift tıklayınca imleç tıklanan yere konur; hiçbir şey değiştirmeden kapatmak belgeyi değişmiş saymaz.

### Metin seçimi ve arama
- Metin seçimi sayfanın boş bir yerinden de başlar (kenar boşluğu, satır ya da paragraf arası). Sürüklerken seçim canlı güncellenir, sayfa başına ya da sonuna sıçramaz, sayfalar arasında sürer; pencere kenarına gelince belge kendiliğinden kayar. Shift+tıklama seçimi genişletir, boş yere tıklama kaldırır.
- Seçim okuma sırasını izler: Word ve UYAP belgelerinde sayfanın altına sürükleyince başlangıcın üstündeki metin seçilmez, alt bilgi fare ona ulaşmadıkça seçime girmez. İki sütunlu metinde, tebligat formu ile muhatap bloğunda ve yan yana imza bloklarında yalnızca farenin geçtiği blok seçilir. Bloğun altındaki boşluğa bırakınca seçim o bloğun son satırında biter, satırın sonunu aşarak sürüklemek satırın kalanını seçer; tebligat mazbatasında birinci nüsha ikinci nüshadan önce okunur. Kopyalama, Vurgula ve Not ekranda görünen seçimi kullanır.
- Çift tıklayıp sürükleyince seçim sözcük sözcük genişler. Üç tıklama yalnızca tıklanan paragrafı seçer: üst bilgi, alt bilgi ve önceki başlık girmez; sütunlu sayfada yalnızca o sütun seçilir, numaralı asılı girintili madde bölünmez.
- Birkaç sayfaya yayılan seçim kaydırınca bozulmaz; kopyada aradaki sayfalar eksik kalmaz.
- Seçerken sayfanın sol üst köşesinde beliren kesik mavi şerit giderildi; seçim renginin altında harfler özgün renginde kalır.
- Vurgu aracı açıkken boş yerden başlayan sürükleme de metni seçip vurgular (referans okuyucunun "Metni vurgula" aracı gibi); not ve yazı araçlarında seçim başlamaz.
- Arama sonuçlarında harflerin rengi değişmez, yalnızca zemin boyanır (geçerli sonuç turuncu, diğerleri sarı).
- Bul kutusu etkin belgenin sonuçlarını gösterir; sekmeye dönünce o belgede en son gidilen eşleşme yeniden geçerli olur. Arama açıkken yapılan seçim arama kapanınca korunur.

### Gezinme ve görünüm
- İki sayfa düzeninde sağ ok, PageDown ve Sonraki sayfa düğmesi bir sonraki çifte geçer (kapak ayrıyken de). Son sayfaya okla ulaşılır, sayfa kutusuna yazılan sayfa numarası kalır, tek kalan son sayfa çiftlerle aynı boyutta gösterilir.
- İki sayfa düzenine geçince ve bu düzende belge açılınca yakınlaştırma her zaman Sayfayı sığdır olur. Tek sayfaya geçince Genişliğe sığdır olur (Ayarlar › Başlangıç'ta başka bir sığdırma seçeneği seçiliyse o).
- Kaydırma kapalıyken fare tekerleği sayfa sonunda sonraki sayfaya geçer; aşağı ok ve PageDown uzun sayfada önce sayfa içinde kaydırır, sonunda sayfayı çevirir (referans okuyucunun tek sayfa görünümü gibi). Elle yakınlaştırılmış sayfada sağ / sol ok önce yana kaydırır, yeni sayfa okuma yönündeki kenarından başlar.
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
- Nota yanıt yazma ve yanıt silme. Referans okuyucuda yazılmış yanıtlar kaybolmasın diye not kutusunda salt okunur gösterilir, Yorumlar panelinde sayıları durur.
- PDF küçült "Üzerine yaz" yedeği (`<ad> (yedek).pdf` artık oluşturulmaz).

### Bilinen sınırlar
- Referans okuyucunun %100'ü (110 ppi çözünürlük ayarıyla) PDEfe'nin %100'ünden yaklaşık %13 büyük görünür. Harfleri ve görselleri aynı büyüklükte karşılaştırın (ör. PDEfe'de %115, referans okuyucuda %100).
- "Sayfayı da koyulaştır" açıkken taranmış sayfalar ve görseller özgün renginde kalır.
- Vurgu ve arama vurgusu beyaz ya da açık zeminde harf rengini korur; koyu ya da renkli dolgulu alanlarda (ör. koyu zeminli tablo başlığındaki beyaz yazı) harfler vurgu rengini alır. Tek bir karışım kipi ikisini birden sağlayamaz; referans okuyucunun vurgusu da böyledir.
- Not simgesi sıkışık metinde ya da küçük yakınlaştırmada komşu harflere biraz binebilir (yarı saydam hale yazıyı okunur tutar).
- Alt bilgi gibi okuma sırası farklı satırları da kapsayan seçimlerde boyama biraz farklı çizilir; iki yana yaslı satırlarda sözcük aralarında ince boşluk kalabilir.
- Taranmış belge ilk açıldığında sayfa bir an hızlı (yumuşak) çizilip keskinleşir.
- `Ctrl+Shift++` / `Ctrl+Shift+−` kısayolları yalnızca çalıştırdıkları komut üzerinden sınandı; klavyeden elle denenmelidir.
- PDEfe'nin notlu vurguları ve biçimli yazıları referans okuyucunun yazdığı yapıyla alan alan karşılaştırıldı; referans okuyucuda açılarak doğrulanmadı.

## 0.1.1 — 2026-09-17

### Düzeltmeler
- Yeni açılan belgede vurgu (seçim mini çubuğu, araç çubuğundaki düğme, sağ tık menüsü), yapışkan not / yorum ve Yazı aracı çalışmıyordu.
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

### Notlar (referans okuyucu uyumlu)
- Var olan notların gösterilmesi: vurgu ailesi, yapışkan not, yazı, çizim ve diğer türler.
- Yeni: vurgu (renk ve saydamlık ayarı), yapışkan not, yanıt, serbest yazı (FreeText). Yazılar Türkçe karakter içeren Windows fontuyla (Segoe UI, Arial, Times, Calibri; kalın dahil) belgeye gömülür.
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
