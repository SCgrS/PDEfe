# PDEfe

### [⬇ Windows için indir (PDEfe-Setup.exe)](https://github.com/SCgrS/PDEfe/releases/latest/download/PDEfe-Setup.exe)
### [⬇ macOS için indir (PDEfe-Mac.dmg)](https://github.com/SCgrS/PDEfe/releases/latest/download/PDEfe-Mac.dmg)

Windows 11 (ve Windows 10) ile macOS için sade, tüm araçları ücretsiz, reklamsız bir **PDF görüntüleyici ve düzenleyici**.

Hukukçuların ve her gün onlarca PDF açan herkesin işini görmek için yazıldı. Belgeler sekmelerde açılır, metin kopyalandığında satır
sonları ve tireler temizlenir. PDEfe ile PDF, JPEG ve PNG dosyalarını tek PDF'te birleştirebilir, PDF'leri ayırabilir ve döndürebilir, üzerlerine
yazı ekleyebilir, boyutlarını küçültebilir, UDF, Word ve TIFF dosyalarını PDF'e (PDF'leri de onlara) dönüştürebilirsiniz.

<p align="center">
  <img src="docs/ekran-acilis-koyu.png" width="90%" alt="Açılış ekranı koyu temada">
</p>

## Kurulum

### Windows

1. Yukarıdaki bağlantıdan `PDEfe-Setup.exe` dosyasını indirin ve çift tıklayın. Yönetici hakkı gerekmez.
2. Windows SmartScreen uyarı gösterirse **Daha fazla bilgi**'ye, sonra **Yine de çalıştır**'a basın. Uyarı, uygulama imzalı olmadığı için çıkar.
3. Kurulumu bitirin. Son sayfada PDEfe'yi varsayılan PDF görüntüleyici yapabilirsiniz.

### macOS

1. Yukarıdaki bağlantıdan `PDEfe-Mac.dmg` dosyasını indirin (macOS 13 ve sonrası, Apple işlemcili ve Intel Mac'ler).
2. Dosyayı açın, **PDEfe**'yi **Uygulamalar** klasörüne sürükleyin.
3. macOS ilk açılışta uyarı verirse **Sistem Ayarları › Gizlilik ve Güvenlik**'te "PDEfe engellendi" satırındaki **Yine de Aç**'a basın.

## Öne çıkanlar

- **Sekmeler ve pencereler:** Birden çok PDF tek pencerede açılır. Sekme sürüklenerek kendi penceresine ayrılır.
- **Temiz kopyalama:** Satırlar paragraf olarak birleşir, tireler kalkar. Metin UYAP Doküman Editörü'ne ve Word'e düzgün yapışır.
- **Araçlar:** Sıkıştır, Sayfaları düzenle, Döndür, Ayır, Görüntü / PDF birleştir, Dosya Formatını Değiştir.
- **Dosya Formatını Değiştir:** UDF, Word ve TIFF ↔ PDF. UDF, UYAP Doküman Editörü'nün kendi sayfa düzeniyle PDF olur; PDF düzenlenebilir
  UDF'ye çevrilir.
- **Yazdırma:** PDEfe'nin kendi penceresinde yazıcı, kâğıt, renk ve çift taraflı seçilir; sayfanın kâğıda nasıl basılacağı önceden görünür.
- **Taranmış belgede seçim:** Taranmış sayfadaki yazı da fareyle seçilip kopyalanır. Bunu bilgisayarın kendi yazı tanıyıcısı çevrim dışı yapar.
- **Arama:** Bütün açık belgelerin hepsinde birden tek tuşla arama yapılabilir.
- **Standart PDF notları:** Vurgu, not ve yazı başka PDF okuyucularında da görünür, e-imzayı bozmaz.

## Ne yapar

Ekran görüntüleri Windows'ta alındı, macOS'ta görünüm aynıdır. Bütün kısayollar uygulamada `F1` ile açılan pencerede ve Ayarlar ›
Kısayollar'da listelenir.


### Açılış ekranı

Belge açık değilken **PDF aç** düğmesi, bütün araçlar ve son açılan 10 belge görünür. PDF'ler pencereye sürüklenerek de açılır; UDF,
Word ve TIFF dosyaları bırakılınca Dosya Formatını Değiştir açılır. Son açılanlar listesi istenmezse Ayarlar'dan kapatılır.

<p align="center">
  <img src="docs/ekran-acilis.png" width="90%" alt="Açılış ekranı: PDF aç, araçlar ve son açılanlar">
</p>

### Sekmeler ve pencereler

- **Sekmeler:** Birden çok PDF tek pencerede açılır. Sekmeler sürüklenerek sıralanır, orta tıkla kapanır. Kaydedilmemiş değişikliği olan
  sekmenin adının önünde nokta (•) durur. Sekme adında ".pdf" uzantısı yazmaz; tam ad ve yol sekmenin üstüne gelince görünür. Belge
  yeniden açılınca kalınan sayfadan devam edilir.
- **Sağ tık:** Sekmede sağ tıkla belge kaydedilir, yazdırılır, pencereye ayrılır, klasörde gösterilir ya da dosya olarak kopyalanır.
- **Pencereler:** Sekme, sekme çubuğunun dışına sürüklenince kendi penceresinde açılır. Başka bir PDEfe penceresine bırakılınca oraya
  geçer. Notlar ve geri al geçmişi sekmeyle birlikte taşınır.
- **Kapatma:** Birden çok sekmeli pencere kapatılırken yalnızca geçerli sekmenin mi, bütün sekmelerin mi kapanacağı sorulur. Seçim
  hatırlanabilir. Kaydedilmemiş belge varsa kaydetmek isteyip istemediğiniz sorulur.

![Pencere kapatılırken: Geçerli sekme / Tüm sekmeler / Vazgeç ve Bir daha sorma](docs/ekran-kapatma.png)

### Görünüm

- **Keskin ve akıcı:** Yazılar Windows'un ClearType çizimiyle keskin görünür. Logolu, kaşeli sayfalar bile kaydırırken ekrana net girer.
- **Düzen:** Tek ya da iki sayfa, %25 ile %6400 arası yakınlaştırma, okuma modu (`Ctrl+H`) ve tam ekran (`F11`).
- **Sol panel** (`F4`): Sayfaların küçük resimleri, İçindekiler ve Yorumlar. Panel sürüklenerek genişletilir.
- **Koyu mod:** Sistem temasını izler ya da araç çubuğundaki ay / güneş düğmesiyle değişir. İstenirse sayfa da koyulaştırılır. Bu,
  yazdırmayı ve kaydetmeyi etkilemez.

![Koyu mod: iki sayfalı görünüm, sayfa da koyulaştırılmış](docs/ekran-koyu.png)

### Metin seçme ve temiz kopyalama

Metin sürüklenerek seçilir. Seçimin yanında çıkan çubukla vurgulanır, not eklenir ya da kopyalanır. Kopyalanan metinde paragrafın
satırları birleşir ve satır sonu tireleri kalkar ("hâ- / kim" → "hâkim"). Metin UYAP Doküman Editörü'ne ve Word'e fazladan boş satır
olmadan yapışır. `Ctrl+A` belgenin bütün sayfalarındaki metni seçer; `Ctrl+C` ile bütün belgenin metni aynı temizlikle kopyalanır.

![Seçim çubuğu: vurgula, not ekle, kopyala](docs/ekran-secim.png)

### Taranmış belgede seçim

Taranmış sayfalardaki yazı, kaşe ve antet de fareyle seçilip kopyalanır. Yazıyı Windows'un (macOS'ta Apple'ın) kendi yazı tanıyıcısı
okur. Belge hiçbir yere gönderilmez. Yan yatırılarak ya da ters taranmış sayfadaki yazı da okunur; sayfayı döndürmeniz gerekmez.
macOS 13–15'te Türkçe harfler (ş, ğ, ı, İ) yanlış gelebilir.

![Taranmış bir dilekçede yazı seçimi](docs/ekran-tarama.png)

### Türkçe arama

`Ctrl+F` ile aranır. İ/ı ayrımı doğrudur, tam sözcük ve büyük-küçük harf seçenekleri vardır. **Açık belgeler** (≡) listesindeki
**Tüm belgelerde ara** kutusu her belgedeki eşleşme sayısını gösterir.

<p align="center">
  <img src="docs/ekran-arama.png" width="90%" alt="Bul: Türkçe arama, eşleşme sayısı">
</p>

<p align="center">
  <img src="docs/ekran-belge-listesi.png" width="90%" alt="Açık belgeler listesi: tüm belgelerde arama">
</p>

### Notlar

- **Notlar:** Altı renkte vurgu, seçili metne yorum, not ve serbest yazı eklenir. Notlar standarttır, başka PDF okuyucularında da aynı görünür.
- **Yazı kutusu:** Yazı tipi, boyut, renk, dolgu, kalın, italik ve altı çizili seçilebilir. Türkçe karakterler belgeye gömülür.
  Yazı kutusu `Ctrl+C` ile kopyalanır, `Ctrl+V` ile tıklanan yere aynı görünümle yapıştırılır; başka sekmeye ve pencereye de.
- **Kaydetme:** Notlar `Ctrl+S` ile kaydedilir. Not eklemek PDF'teki e-imzayı bozmaz.
- **Geri al:** Her işlem `Ctrl+Z` ile geri alınır. Geri al düğmesinin yanındaki ▾ listesinden birkaç adım birlikte geri alınabilir.
  Durum çubuğundaki **● Kaydedilmemiş değişiklikler** yazısı son kayıttan bu yana yapılanları listeler.

![Vurgular, metinle ilgili yorum, not, yazı ve Yorumlar paneli](docs/ekran-notlar.png)

![Yazı kutusu düzenlenirken biçim çubuğu](docs/ekran-yazi.png)

<p>
  <img src="docs/ekran-geri-al.png" width="423" alt="Geri al listesi: en üstteki üç adım birlikte geri alınacak">
  <img src="docs/ekran-kaydedilmemis.png" width="311" alt="Kaydedilmemiş değişiklikler listesi ve Kaydet düğmesi">
</p>

### Araçlar

Araçlar, araç çubuğundaki **Araçlar** düğmesinden ya da açılış ekranından açılır.

![Araçlar penceresi](docs/ekran-araclar.png)

- **Sıkıştır:** Üç seviye vardır, her birinde tahminî boyut gösterilir.
- **Sayfaları düzenle:** Sayfalar büyük ön izlemelerle sürüklenerek sıralanır, silinir, döndürülür, kopyalanır. Kartın altındaki
  kopyala düğmesi sayfanın kopyasını hemen sağına ekler; `Ctrl+C` / `Ctrl+V` ve sağ tık menüsü de var. Boş sayfa ya da başka PDF'ten
  sayfa eklenir.
- **Döndür:** Tüm sayfalar, geçerli sayfa ya da bir aralık döndürülür.
- **Ayır:** Belge sayfa aralıklarına göre (örneğin `1-3, 4-10`) ya da her sayfa ayrı olacak şekilde ayrılır.
- **Görüntü / PDF birleştir:** PDF, JPG, PNG, TIFF ve başka görüntüler tek PDF'te birleşir. Dosyalar sürüklenerek ya da panodan eklenir.
  UYAP taramaları (TIFF) gerçek ölçüsünde, A4 olarak eklenir.
- **Dosya Formatını Değiştir:** UDF, Word ve TIFF dosyalarını PDF'e, PDF'leri bunlara dönüştürür (aşağıda).

Her araç sonucu yeni belge olarak kaydeder ya da istenirse özgün dosyanın üzerine yazar (Dosya Formatını Değiştir her zaman yeni dosya
oluşturur).

<p align="center">
  <img src="docs/ekran-sikistir.png" width="90%" alt="Sıkıştır: üç seviye ve tahminî boyutlar">
</p>

<p align="center">
  <img src="docs/ekran-ayir.png" width="90%" alt="Ayır: sayfa aralıkları ve oluşturulacak dosyalar">
</p>

![Sayfaları düzenle: büyük sayfa ön izlemeleri; kartın altında döndür, kopyala ve sil düğmeleri](docs/ekran-sayfalar.png)

<p align="center">
  <img src="docs/ekran-birlestir-koyu.png" width="90%" alt="Görüntü / PDF birleştir koyu temada">
</p>

### Dosya Formatını Değiştir

Dosyalar **Dosya ekle** ile ya da pencereye sürüklenerek eklenir; birden çok dosya birlikte dönüştürülür. Her satırda dosyanın küçük
resmi, türü, sayfa sayısı ve hedef biçim (PDF, UDF, Word, TIFF) görünür. Bir PDF açıkken araç açılırsa o PDF listede hazırdır. UDF,
Word ve TIFF dosyaları PDEfe'nin penceresine bırakılınca ya da `Ctrl+O` ile seçilince de araç açılır.

![Dosya Formatını Değiştir: PDF → UDF, UDF → PDF, TIFF ve Word dosyaları](docs/ekran-donustur.png)

- **UDF → PDF:** UYAP Doküman Editörü'nün kendi sayfa düzeniyle, editörün penceresi açılmadan. Satırlar ve sayfalar editördeki gibi
  kırılır, sonuç editörün "Yazdır → PDF" çıktısıyla aynıdır. Sayfa her zaman A4, yazı tipleri PDF'e gömülü, antetin çevresinde gri
  çerçeve yok, sayfa numarası seçilebilir. E-imza ve yorumlar PDF'e taşınmaz.
- **PDF → UDF:** Düzenlenebilir UDF. Paragraflar, kenar boşlukları, üst ve alt bilgi, antet ve çizgili tablolar alınır; sayfa numarası
  editörün kendi numarası olur. Taranmış sayfa yazı tanımayla düzenlenebilir yazıya çevrilir. İmza, kaşe gibi yazının yanında duran
  resimler alınmaz; sonuçta söylenir.
- **Word → PDF:** Word'ün kendisiyle; görünmeyen, ayrı bir Word kullanılır, açık Word'ünüze dokunulmaz. Belgenin yazar adı PDF'e geçmez.
  .docx, .doc, .rtf ve .odt dönüştürülür.
- **PDF → Word:** Metni düzenlenebilir .docx. Taranmış sayfalar resim olarak aktarılır.
- **TIFF → PDF:** Kayıpsız; UYAP taramaları doğru ölçüde (A4) ve çoğunlukla TIFF'ten küçük. **PDF → TIFF:** Tek dosyada çok sayfa;
  varsayılan UYAP'ın taramaları gibi 200 dpi siyah beyaz, istenirse 300 dpi, gri ya da renkli.
- UDF ↔ Word gibi PDF olmayan iki biçim arasında da dönüştürülür; PDEfe arada PDF'ten geçer.

Gereksinimler:

| Dönüştürme | Bilgisayarda gereken |
|---|---|
| UDF → PDF | UYAP Doküman Editörü ve kullandığı Java 8. Bulunamazsa UDF yine dönüştürülür, PDEfe'nin yaklaşık çizimiyle: satır ve sayfa kırılımları editördekinden farklı olabilir. Editörün yeri Ayarlar › Kaydetme'den gösterilebilir. |
| Word → PDF | Windows'ta Word ya da LibreOffice, macOS'ta LibreOffice. |
| PDF → UDF, PDF → Word, TIFF ↔ PDF | Bir şey gerekmez. |

Dönüştürülen dosya her zaman yeni dosyadır; var olan dosyanın üzerine yazılmaz. İptal edilirse hiçbir dosya yazılmaz.

### Yazdırma ve PDF'i kopyala

- **Yazdır** (`Ctrl+P`, araç çubuğunda Kaydet'in yanındaki düğme ya da sağ tık): PDEfe'nin kendi penceresinde yazıcı, kopya ve harmanlama,
  sayfalar (tümü, geçerli sayfa, aralık), kâğıt, boyut (sayfaya sığdır, gerçek boyut), renkli ya da siyah beyaz, tek ya da çift taraflı
  seçilir. Sağda sayfanın kâğıda nasıl basılacağı büyük olarak görünür. **Yazıcı tercihleri** yazıcının kendi ayarlarını açar. Son
  seçilen yazıcı ve seçenekler hatırlanır. Türkçe karakterler ekrandaki gibi çıkar.
- **PDF'i kopyala:** Belge dosya olarak panoya kopyalanır. UYAP'a, e-postaya ya da bir klasöre `Ctrl+V` ile yapıştırılır.

![Yazdır penceresi: yazıcı, kopya, sayfalar, kâğıt, renk, çift taraflı ve sayfanın ön izlemesi](docs/ekran-yazdir.png)

### Ayarlar

Ayarlar `Ctrl+,` ile ya da araç çubuğundaki dişliyle açılır. Tema, açılış düzeni, not renkleri, otomatik kaydetme ve güncelleme buradan
değiştirilir. PDEfe buradan varsayılan PDF görüntüleyici de yapılır. **Kaydetme** bölümünde UYAP Doküman Editörü'nün bulunduğu yer ve
sürümü görünür; editör kendiliğinden bulunamazsa klasörü buradan seçilir.

![Ayarlar › Açılış ve düzen: sayfa düzeni ve Pencereyi kapatırken](docs/ekran-ayarlar.png)

![Kısayollar penceresi (F1)](docs/ekran-kisayollar.png)

## Güncelleme

PDEfe haftada bir yeni sürüm olup olmadığına bakar. Yeni sürüm varsa pencerenin üstünde şerit çıkar. Windows'ta **Güncelle**'ye basmak
yeter. PDEfe yeni sürümü kurup kendiliğinden yeniden açılır. macOS'ta **İndir** yeni dosyayı indirir, kurulumdaki gibi Uygulamalar'a
sürüklenir. Sürüm notları [CHANGELOG.md](CHANGELOG.md) dosyasındadır.

İndirme bitene dek PDEfe'yi kapatmayın. Kapatırsanız ya da internet bağlantısı koparsa indirme sonraki denemede baştan başlar; şerit
PDEfe yeniden açılınca kendiliğinden yeniden çıkar. Kurulu sürümle aynı kalan kısımlar yeniden indirilmez. Kaydedilmemiş bir belgeniz
varsa PDEfe kurmadan önce sorar.

## Kaldırma

Windows'ta **Ayarlar › Uygulamalar › Yüklü uygulamalar › PDEfe › Kaldır**. macOS'ta PDEfe'yi Uygulamalar'dan Çöp Sepeti'ne sürükleyin.

## Verileriniz

Bütün işlemler bilgisayarınızda yapılır. Belgeleriniz hiçbir yere gönderilmez, telemetri yoktur. Dosya dönüştürme de bilgisayarınızda
yapılır: UYAP Doküman Editörü ve Word pencere açılmadan kullanılır, ayarlarına ve açık belgelerine dokunulmaz. PDEfe internete yalnızca yeni
sürüm denetimi için haftada bir GitHub'a istek gönderir. Güncelleme denetimi Ayarlar'dan kapatılabilir (önerilmez).

## Üçüncü taraf projeler

PDEfe şu açık kaynak projeler üzerine kuruludur: Electron, PDF.js, PyMuPDF / MuPDF, Python, pdf2docx, python-docx ve başkaları. Sürümler ve lisanslar
[THIRD_PARTY.md](THIRD_PARTY.md) dosyasındadır.

## Teşekkür

PDEfe, açık kaynak projelerin emeği üzerine kuruldu. Sayfaları çizen PDF.js için Mozilla'ya, belgeleri işleyen MuPDF ve
PyMuPDF için Artifex'e, uygulamanın çatısı Electron'un geliştiricilerine ve adı burada geçmeyen bütün katkıcılara teşekkür ederim.

---

Soru ve geri bildirimler için: [x.com/CgrShn](https://x.com/CgrShn)

Lisans: AGPL-3.0. Ayrıntılar için [LICENSE](LICENSE) dosyasına bakınız.
