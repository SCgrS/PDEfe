# PDEfe — Kullanıcı doğrulama listesi

Bu liste, PDEfe'nin otomatik testlerle sınanamayan (başka PDF okuyucuları, gerçek yazıcı, Gezgin, Windows
varsayılan uygulama sayfası) davranışlarını kullanıcının kendi bilgisayarında denemesi içindir.
Test dosyaları `test/cikti` altında üretilir (`node test/surucu.mjs betik test/senaryo4.mjs` vb.) ya da
aşağıdaki adımlarla PDEfe'de oluşturulur.

## 1. PDEfe notlarının başka bir PDF okuyucuda görünmesi
1. PDEfe'de `Desktop\PDF DENEME\DENEME PDF (2).pdf` dosyasının bir kopyasını açın. Aşağıdaki adımları belge
   açılır açılmaz, sayfa düzenini ya da yakınlaştırmayı değiştirmeden yapın (0.1.0'da ilk açılışta çalışmıyordu).
2. Bir paragrafı seçin: mini çubuk seçimin altında çıkmalı ve fare hareket edince yerinden kıpırdamamalı.
   Mini çubuktan varsayılan **sarı vurgu** (#FFD100, %40) ekleyin: yazı siyah kalmalı, yalnızca zemin sararmalı.
   - Başka bir satırı seçip mini çubuktan **Not ekle**'ye basın; açılan kutuya "Metin notu ğüşİ" yazın. Satır
     vurgulanmalı, ilk satırın bittiği yerde not simgesi çıkmalı, kutunun başlığında "Metin notu" yazmalı.
   - Başka bir satırı seçip boş bir yere tıklayın: seçim ve mini çubuk kapanmalı.
   - Bir satırı araç çubuğundaki **Vurgu** düğmesiyle, bir başkasını sağ tık › **Vurgula** ile vurgulayın.
3. Metin seçili değilken araç çubuğundan **Not** seçip sayfada boş bir yere tıklayın; "Not:
   şğıİçöü" yazın. Not kutusunda yanıt kutusu olmamalı. Boş bir yere sağ tık › **Not ekle** de not açmalı.
4. **Yazı** aracıyla sayfada bir kutu çizin; "Serbest metin: Şişli, İğneada, Çorum — ğüşıöç" yazın;
   biçim çubuğundan Times New Roman, 13 pt, kenarlık seçin; bir sözcüğü seçip **Kalın**, başka bir sözcüğü seçip
   **Altı çizili** yapın, **Dolgu rengi** ile sarı zemin verin; dışarı tıklayın.
5. **Ctrl+S** ile kaydedin (durum çubuğunda "Kaydedildi" görünür).
6. Aynı dosyayı bilgisayarınızdaki **başka bir PDF okuyucuda** açın. Beklenen:
   - Vurgular aynı satırlarda, aynı renkte; yazı rengi değişmemiş.
   - Metin notu Yorumlar panelinde "Metinle ilgili yorum" türünde, yazar adı ve "Metin notu ğüşİ" metniyle.
   - Not simgesi (okuyucunun kendi simgesi) aynı yerde; içinde metin.
   - Serbest metin kutusu aynı yerde; Türkçe harfler eksiksiz; yalnızca seçilen sözcükler kalın / altı çizili,
     sarı zemin, kenarlık; satırlar PDEfe'deki yerlerden kırılmış, son satır kesik değil.
   - O okuyucuda nota yanıt yazıp kaydedin; PDEfe'de yeniden açınca yanıt balonda salt okunur görünmeli (PDEfe'de
     yanıt yazılamaz), Yorumlar panelinde "1 yanıt" yazmalı.
7. Başka bir PDF okuyucuda eklenmiş notlu bir PDF'i (DENEME PDF (2).pdf'in özgün hali) PDEfe'de açın: iki vurgu, notu olan
   vurgunun satır bitişinde not simgesi; üzerine gelince tıklamadan açılan kutuda "Metin notu" başlığı,
   "NOT DENEMESİ" ve yazar olarak notu ekleyenin adı görünmeli.

## 2. Döndürülmüş sayfa
`test/cikti/donuk-not.pdf` (sayfası 90° döndürülmüş kanun PDF'i): PDEfe'nin yazısı başka bir PDF okuyucuda da dik okunmalı
(PyMuPDF'in referans yazısı yan durur; bu beklenen fark). Yazılar PDEfe'de de o okuyucudaki yönüyle görünmeli;
0.1.1'in döndürülmüş sayfaya yazdığı yazıyı PDEfe'de düzenleyip kaydedince o okuyucudaki yönü değişmemeli.

## 3. Kilitli dosya
Bir PDF'i başka bir PDF okuyucuda açık tutarken PDEfe'de aynı dosyaya not ekleyip Ctrl+S basın: okuyucu dosyayı kilitliyorsa "Dosya başka bir
programda açık olabilir" uyarısı ve **Farklı kaydet** seçeneği çıkmalı.

## 4. Gezgin ve tek örnek
- PDEfe açıkken Gezgin'de bir PDF'e çift tıklayın (ya da `PDEfe.exe dosya.pdf`): aynı pencerede yeni sekme
  açılmalı, ikinci pencere açılmamalı. Zaten açık bir dosya ise o sekmeye geçmeli.
- Gezgin'den birkaç PDF'i pencereye sürükleyin: her biri yeni sekmede açılmalı.

## 5. PDF'i kopyala (0.1.21'e dek Paylaş)
Araç çubuğundaki **PDF'i kopyala** düğmesine basın; sonra Gezgin'de bir klasöre, Outlook'ta yeni iletiye ya da
WhatsApp'a **Ctrl+V** yapın: PDF dosyası yapıştırılmalı.

## 6. Yazdırma
Ctrl+P → seçenekler → Yazdır: Windows yazdırma diyaloğu açılmalı; kâğıtta Türkçe karakterler ve notlar doğru,
yatay sayfa döndürülmüş olmalı. "Notları yazdır" kutusu varsayılan olarak boş gelmeli ve notlar çıkmamalı;
kutu işaretlenince notlar basılmalı.

## 7. Kurulum ve varsayılan uygulama
1. `release/PDEfe-Setup.exe`'yi çalıştırın (SmartScreen: Daha fazla bilgi → Yine de çalıştır). Sihirbaz Türkçe olmalı. (0.2.3'ten
   beri PDEfe kuruluyken önce kurulu sürüm sayfası gelir, bkz. 38.)
2. Kurulumdan sonra Gezgin'de bir PDF'e sağ tık → Birlikte aç listesinde PDEfe görünmeli.
3. Ayarlar → Dosya → **Varsayılan PDF görüntüleyici yap**: Windows Varsayılan Uygulamalar sayfası PDEfe ile açılmalı;
   .pdf için PDEfe seçildikten sonra çift tık PDEfe'yi açmalı.
4. Windows Uygulamalar listesinde "PDEfe" ve kaldırıcı görünmeli; kaldırınca ilişkilendirme silinmeli.

## 8. Güncelleme
GitHub'da yeni sürüm etiketi (`v0.1.2`) yayımlandıktan sonra eski sürümü açın: 8 saniye içinde üstte
"PDEfe 0.1.2 hazır — Güncellemeyi yükle" şeridi çıkmalı; yükleme → yeniden başlat → PDEfe yeni sürümle
açılmalı (Ayarlar › Hakkında'da 0.1.2). Önceki sekmelerin geri gelmemesi beklenen davranıştır.

## 9. Döndür
1. Birkaç sayfalı bir PDF açıp 2. sayfaya gidin; araç çubuğundaki **Döndür** düğmesine basın:
   "Geçerli sayfa / Tüm PDF / Vazgeç" sorusu ve **Seçeneğimi hatırla** kutusu çıkmalı.
2. **Geçerli sayfa**: yalnızca 2. sayfa dönmeli, sekmede değişiklik işareti çıkmalı; `Ctrl+Z` ile geri gelmeli.
3. `Ctrl+R` (0.1.13'e dek `Ctrl+Shift++`) → **Tüm PDF**: bütün sayfalar dönmeli. Sekmeyi kapatmaya çalışın: kaydetme sorusu çıkmalı;
   **Kaydet** deyip dosyayı başka bir PDF okuyucuda açın, sayfalar dönmüş olmalı.
4. **Seçeneğimi hatırla** ile bir seçim yapın: sonraki döndürmede soru çıkmamalı. Ayarlar › Görünüm'deki döndürme
   seçeneği yeniden sormaya alınınca soru geri gelmeli.
5. Değişiklik yapılmış bir sekmeden başka sekmeye geçin: soru çıkmamalı, değişiklik sekmede kalmalı.
6. **E-imzalı belge** (UYAP'tan indirilmiş imzalı bir PDF'in kopyası): bir sayfayı döndürüp kaydedin, dosyayı
   imza doğrulayabilen bir PDF okuyucuda açın. İmzalar panelinde imza kaybolmamalı; imzalı sürüm doğrulanabilir kalmalı (okuyucu
   "imzadan sonra değişiklik yapıldı" diyebilir, bu beklenir). Ekli dosyası olan PDF'lerde ekler durmalı.
7. Döndürüp kaydettiğiniz dosyayı kapatıp PDEfe'de yeniden açın: sayfa dönmüş ve tam (kesilmeden) görünmeli;
   o sayfada metin seçimi ve vurgu, yazının tam üstüne düşmeli.

## 10. PDF küçült: yeni belge ve üzerine yazma
Araç çubuğundaki **Araçlar** › PDF küçült: kartlar "Aşırı / İdeal / Düşük sıkıştırma" olmalı ("Özel", DPI / JPEG
yazısı yok); kaydetme seçimi varsayılan olarak **Yeni belge olarak kaydet**.
1. Yeni belge: dosya Masaüstü'ne `<ad> (küçültülmüş).pdf` adıyla kaydedilmeli, özgün dosya değişmemeli.
2. **Üzerine yaz**: dosya küçülmeli; klasörde `(yedek).pdf` ya da geçici dosya kalmamalı; sekme aynı sayfada
   yeniden açılmalı.
3. Dosyayı başka bir PDF okuyucuda açık tutup **Üzerine yaz** ile yeniden deneyin: okuyucu dosyayı kilitliyorsa özgün dosya değişmemeli, dosyanın
   başka programda açık olabileceği söylenip "Yeni belge olarak kaydet / Yeniden dene / Vazgeç" sorulmalı.

## 11. Metin, görüntü kalitesi ve sayfa numarası
- Bir kanun PDF'inden birkaç paragraf seçip kopyalayın, UYAP Doküman Editörü'ne ve Word'e yapıştırın:
  paragraflar ayrı olmalı, aralarında boş paragraf oluşmamalı.
- %100 ve %125 yakınlaştırmada harfler keskin görünmeli (bulanık değil); fotoğraflı ya da taranmış bir
  PDF'i büyütünce görseller pikselli değil yumuşak görünmeli.
- Görünüm › Tek sayfa ve İki sayfa düzeninde (kaydırma kapalı) sayfa değiştirin: sayfa numarası kutusu her
  geçişte güncellenmeli; kutuya tıklayıp odakta bırakınca da güncellenmeli. Kaydırma aç/kapa ve düzen seçimi
  açık bütün sekmelere uygulanmalı; iki sayfaya geçince yakınlaştırma her zaman "Sayfayı sığdır", tek sayfaya
  dönünce "Genişliğe sığdır" olmalı.
- Koyu modda ("sayfayı koyulaştır" açık) hızla sayfa geçin: çizilmemiş sayfalar beyaz parlamamalı, sayfa ve
  yer tutucu tam siyah olmalı.
- Açık belgeler listesindeki **Tüm belgelerde ara** kutusuna bir sözcük yazın: her belgenin yanında eşleşme
  sayısı çıkmalı; Enter'a basınca Bul kutusu "tüm sekmeler" kapsamında açılmalı.

## 12. 0.1.2: otomatik testlerin sınayamadıkları
Testler ekran dışındaki bir test örneğinde yapıldı: referans okuyucu açılmadı, Windows diyalogları ekrana çıkarılmadı,
menü kısayolları ve gerçek pano kullanılamadı.
1. **Başka bir PDF okuyucuyla aynı büyüklükte karşılaştırma.** Okuyucunun %100'ü (110 ppi çözünürlük ayarıyla) PDEfe'nin
   %100'ünden yaklaşık %13 büyüktür; %100'leri yan yana koymak yanıltır. Aynı belgeyi PDEfe'de %115'te, öteki okuyucuda
   %100'de açıp aynı yeri karşılaştırın: UYAP üst yazısının başlığı ve tablo çizgileri, UYAP karekodu, PTT dökümü
   (JPEG sayfa) ve bir tarama. Harfler aynı netlikte, çizgiler gri iki satır değil tek piksel, karekod keskin
   olmalı. Taranmış bir belgeyi %3200'e yakınlaştırın: yazı görünmeli ve beklemeden çizilmeli.
2. **Döndürme kısayolları.** Çok sayfalı bir PDF'te `Ctrl+R` ve `Ctrl+Shift+R` basın (0.1.13'e dek `Ctrl+Shift++` /
   `Ctrl+Shift+−`; Türkçe klavyede basılamıyordu): "Geçerli sayfa / Tüm PDF / Vazgeç" sorusu çıkmalı, sayfa saat yönünde / tersine dönmeli.
   Tek sayfalık PDF'te soru çıkmadan dönmeli; `Ctrl+Z` geri almalı.
3. **Pano hızı.** Araçlar › Görüntü / PDF birleştir'i açın.
   - Gezgin'de birkaç PDF ve JPG'yi (biri Türkçe karakterli adlı) seçip `Ctrl+C`; pencerede `Ctrl+V`: satırlar
     beklemeden gelmeli, "Dosya bulunamadı" çıkmamalı. Aynısını **Panodan ekle** ve listede sağ tık › **Yapıştır** ile deneyin.
   - `Win+Shift+S` ile ekran görüntüsü alıp `Ctrl+V`: görüntü satırı hemen eklenmeli.
4. **Değiştir düğmeleri ve Windows diyalogları.**
   - PDF küçült ve Döndür ve kaydet ("Yeni belge olarak kaydet" seçiliyken) ile Görüntü / PDF birleştir'de
     **Değiştir**: Windows Farklı kaydet penceresi önerilen ad ve klasörle (varsayılan Masaüstü) açılmalı; başka
     klasör ve ad seçince satırdaki ad ve klasör güncellenmeli, çıktı oraya yazılmalı.
   - Var olan bir dosyayı seçip Windows'un üzerine yazma sorusuna **Evet** deyin: PDEfe aynı soruyu ikinci kez
     sormamalı (dosya PDEfe'de kaydedilmemiş değişiklikle açıksa bunun sorulması beklenir). O dosya PDEfe'de
     açıksa sekme yeni haliyle yeniden açılmalı.
   - PDF ayır'da **Değiştir**: Windows klasör seçme penceresi açılmalı, seçilen klasör satırda görünmeli.
5. **Metin notu başka bir PDF okuyucuda.** 1. bölümdeki metin notunu bilgisayarınızdaki başka bir PDF okuyucuda açın: vurgu aynı yerde; Yorumlar
   panelinde "Metinle ilgili yorum", yazar ve not metni; vurguya tıklayınca notun açılır penceresi. O okuyucuda
   notun metnini düzenleyip kaydedin; sonra PDEfe'de aynı notun metnini değiştirip kaydedin ve dosyayı yeniden
   o okuyucuda açın: PDEfe'de yazılan metin görünmeli, okuyucuda yazılan eski metin değil.
6. **Biçimli yazı başka bir PDF okuyucuda.** 1. bölümdeki yazı kutusunu aynı okuyucuda açın: yalnızca seçilen sözcükler kalın / altı
   çizili, satırlar PDEfe'deki yerlerden kırılmış. **Dolgusuz** yapılmış bir kutu orada saydam görünmeli.
   O okuyucuda yazıya bir sözcük ekleyip kaydedin; PDEfe'de yeniden açıp çift tıklayınca biçimler ve kenarlık rengi
   korunmalı.
7. **Tema simgesi.** Koyu temada araç çubuğundaki tema düğmesinde kalın, içi dolu ay; açık temaya geçince dolu
   güneş görünmeli.

## 13. 0.1.4: otomatik testlerin sınayamadıkları
Testler ekran dışındaki bir test örneğinde yapıldı; referans okuyucu yalnızca önizleme motoruyla (`test/pdf_onizleme.ps1`, ekrana pencere
açmadan) denetlendi, Windows renk seçicisi ve gerçek klavyenin menü kısayolları kullanılmadı.
1. **Yazı kalınlığı.** Aynı UYAP tebligatını PDEfe'de ve başka bir PDF okuyucuda aynı büyüklükte yan yana açın (okuyucu %100 ≈ PDEfe %115): kalın
   satırlar ("Duruşma Günü …") okuyucudaki kadar ince, küçük yazılarda renkli kenar yok. Beğenilmezse Ayarlar › Görünüm › Yazı çizimi ›
   "Windows ClearType" seçip belgeyi yeniden açın.
2. **Döndürülmüş sayfa.** Bir sayfayı Döndür ile yana çevirip %85'e uzaklaştırın: harfler düz sayfadaki gibi olmalı (ince, düzensiz değil).
3. **Notlar başka bir PDF okuyucuda.** PDEfe'de bir belgeye vurgu ve not ekleyin, 2 saniye bekleyin (durum çubuğunda "Otomatik kaydedildi"), dosyayı
   bilgisayarınızdaki başka bir PDF okuyucuda açın: notlar görünmeli. Dosya o okuyucuda açıkken PDEfe'de not ekleyin: okuyucu dosyayı kilitliyorsa pencere açılmamalı, bir kez "otomatik kaydedilemedi"
   bildirimi çıkmalı; okuyucuyu kapatıp `Ctrl+S` ile kaydedince, dosya okuyucuda yeniden açıldığında notlar görünmeli.
4. **Vurgu çubuğu.** Bir vurguya tıklayın: altında renkler, Not ekle ve Kaldır çıkmalı. Rengi değiştirin, `Ctrl+Z` ile geri alın; Not ekle
   ile not yazın; Kaldır ile silin. Başka bir PDF okuyucuda eklenmiş bir vurguda da deneyin, kaydedip o okuyucuda rengin değiştiğine bakın.
5. **Koyu mod.** Koyu tema ve "Sayfayı da koyulaştır" açıkken Yazı aracıyla kutu çizip yazın: yazı beyaz görünmeli; dosyayı başka bir PDF okuyucuda
   açınca yazı siyah olmalı.
6. **Dolgu paleti.** Yazı düzenlerken Dolgu rengi düğmesi: Dolgusuz, renkler ve Diğer renk; Diğer renk Windows renk seçicisini açmalı,
   seçilen renk dolgu olmalı.
7. **Sekmeler ve pencereler.** Uzun adlı birkaç PDF açın: sekmeler aynı genişlikte, uzun ad üç noktayla. Bir araç penceresi, Ayarlar ve
   bir soru kutusu (ör. değiştirilmiş sekmeyi kapatırken) açıkken arkadaki alana tıklayın: pencere kapanmalı (soru kutusunda Vazgeç).
   Soru açıkken `Ctrl+W`, `Ctrl+O` gibi menü kısayolları çalışmamalı.
8. **Araçlar.** PDF küçült ve PDF ayır'da Üzerine yaz seçilince sarı "Geri alınamaz" uyarısı; Sayfaları düzenle'de boş alandan
   sürükleyerek çoklu seçim, Yeni belge / Üzerine yaz; PDF ayır'da seçili sayfalarla Üzerine yaz (özgün dosyada yalnızca o sayfalar);
   Görüntü / PDF birleştir'de Orijinal boyutla bir fotoğraf: sayfanın çevresinde beyaz kenar olmamalı. Araçlar penceresinde Paylaş karosu
   yok, araç çubuğundaki Paylaş düğmesi duruyor.

## 14. 0.1.5: otomatik testlerin sınayamadıkları
Yazı karşılaştırması kullanıcının ekran görüntüsündeki referans okuyucu penceresiyle (%99,6, %100 Windows ölçeği) aynı ölçekte yapıldı; referans okuyucu açılmadı.
Ekran dışı test örneği %100 ölçekte çalıştı: %125 ölçekli ekranda gözle bakılmadı.
1. **Yazı netliği.** Aynı UYAP tebligatını PDEfe'de ve başka bir PDF okuyucuda aynı büyüklükte yan yana açın (okuyucu %100 ≈ PDEfe %115): kutudaki küçük
   "Geçerli bir özrünüz olmadan…" paragrafı ve Arial satırları okuyucudaki kadar koyu ve keskin, kalın satırlar ("Duruşma Günü …") okuyucudaki
   kadar ince olmalı. Aynısını %125 ölçekli ekranda da deneyin.
2. **Döndürülmüş sayfa.** Bir sayfayı Döndür ile yana çevirin: harfler düzgün (ince, düzensiz değil).
3. **Sekmeler.** Birkaç UYAP belgesi açın: sekmeler öncekinden dar, "ustyazi (85).pdf" gibi adlar tam; uzun adın tamamı üzerine gelince görünür.
4. **Araçlar penceresi.** Alttaki iki araç ortalı; ok tuşlarıyla karolar arasında gezinin.
5. **Dolgu düğmesi.** Yazı aracıyla kutu açın: Dolgu rengi düğmesindeki kare, yazı rengi karesiyle aynı boyda ve hizada.
6. **Görüntü birleştir.** Bir fotoğraf ekleyin: Sayfa seçiminde "Orijinal" seçili gelmeli, seçenekler "A4'e sığdır" ve "Orijinal".

## 15. 0.1.6
1. **Görüntü birleştir kalitesi.** Birkaç tarama / telefon fotoğrafı ve bir ekran görüntüsü ekleyin: kalite düğmelerinde Orijinal ≥ Yüksek
   ≥ Orta ≥ Düşük olmalı; Yüksek ile birleştirilen PDF Orijinal'den büyük olmamalı.

## 16. 0.1.7
1. **Telefon fotoğrafı.** Telefonda dik çekilmiş bir fotoğrafı (ör. WhatsApp) Görüntü / PDF birleştir'e ekleyin: "Orijinal" tahmini dosya
   boyutuna yakın olmalı, PDF'te fotoğraf doğru yönde görünmeli.
2. **Döndürme yönü.** Bir görüntüyü "Sağa döndür" ile döndürüp birleştirin: PDF'te önizlemedeki gibi sağa (saat yönünde) dönmüş olmalı.

## 17. 0.1.8: otomatik testlerin sınayamadıkları
Kalın yazı karşılaştırması kullanıcının gönderdiği yan yana ekran görüntüsündeki referans okuyucu yarısıyla aynı ölçekte (PDEfe %115, %100 Windows
ölçeği) yapıldı; referans okuyucunun penceresinde gözle bakılmadı. Kurulum son sayfası, derlenen küçük bir kurucuyla görünmeyen masaüstünde
yakalandı (test\kurulum_bitis.ps1); gerçek kurulumda bakılmadı.
1. **Kalın yazı netliği.** `ustyazi (74).pdf` tebligatını PDEfe'de ve başka bir PDF okuyucuda aynı büyüklükte yan yana açın: "Duruşma Günü / Saati / Yeri",
   "BU ZARFTA …" ve "Muhatap adresini değiştirmişse …" satırları okuyucudaki kadar keskin (gri ve bulanık değil) ve okuyucudaki kadar ince
   olmalı. Başka kalın başlıklı bir Word PDF'inde de bakın; %125 ölçekli ekranda da deneyin.
2. **Başlangıç ekranı.** PDEfe'yi Başlat menüsündeki ya da masaüstündeki kısayoldan (belge açmadan) başlatın: "PDF aç" kartı Windows'un Aç
   penceresini açmalı; son açılanlardan birine tıklayınca belge açılmalı; satırın üzerindeki × yalnızca listeden kaldırmalı (dosya
   yerinde); "Görüntü / PDF birleştir" kartı aracı açmalı. Ekranda "Ctrl+O" yazısı olmamalı.
3. **Genişliğe sığdır.** `birlesik (3).pdf`'i açın (Genişliğe sığdır, kaydırma açık): 3–6. sayfalar pencereyi tam doldurmalı; 2. ve 9. sayfa
   iki yandan taşmalı (yana kaydırılarak görülür), A4 ilk sayfa ortada. Son sayfaya gidip yeniden Genişliğe sığdır seçince ölçek
   değişmemeli. Büyük bir kanun PDF'i açılırken ölçek açıldıktan sonra sıçramamalı.
4. **Birleştir'de seçim.** Görüntü / PDF birleştir'e 5–6 dosya ekleyin: farenin sağ tuşunu basılı tutup satırların üzerinden sürükleyin;
   geçtiği satırlar seçilmeli, bırakınca menü açılmamalı. Seçili bir satıra sağ tıklayınca menüde "(3)" gibi sayı görünmeli; Delete
   seçilenleri çıkarmalı; seçili satırı sürükleyince seçilenler birlikte taşınmalı.
5. **Kurulum son sayfası.** Yeni kurulum dosyasını çalıştırıp son sayfaya gelin: "PDEfe'yi varsayılan PDF görüntüleyici yap" tek satırda,
   kesiksiz görünmeli; işaretleyip Bitir'e basınca Windows Ayarlar'ın Varsayılan uygulamalar › PDEfe sayfası açılmalı.
6. **X bağlantısı.** Ayarlar › Hakkında'daki x.com/CgrShn bağlantısı tarayıcıda tek sekme açmalı.
7. **Haftalık güncelleme.** Ayarlar › Güncelleme'de "Güncellemeleri otomatik denetle (haftada bir)" ve altında son denetimin tarihi
   görünmeli; "Şimdi denetle"den sonra tarih o ana güncellenmeli.

## 18. 0.1.9: otomatik testlerin sınayamadıkları
Ayarlar penceresi, iki "hatırla" anahtarı, başlangıç ekranı ve Dosya menüsü test örneğinde gerçek tıklamayla sınandı
(test/senaryo14.mjs). Windows'un son kullanılanlar listesi, kurulu sürümde güncelleme ve başka bir okuyucuda yazı notunu düzenleme
denenmedi.
1. **Ayarlar sekmeleri.** (0.1.12'de değişti: 21. bölüm.) Ayarlar'ı açın (`Ctrl+,`): sekmeler Görünüm, Sayfa düzeni, Belge açılışı, Notlar, Kaydetme, Kopyalama,
   Güncelleme, Hakkında olmalı. Varsayılan PDF görüntüleyici Belge açılışı'nda; otomatik kaydetme ve araçların çıktı klasörü
   Kaydetme'de; Döndür düğmesi ve Kapak sayfasını ayrı göster Sayfa düzeni'nde olmalı. Bir ayarı beklediğiniz sekmede bulamazsanız
   söyleyin.
2. **Son açılanları hatırla.** Belge açılışı'nda kapatın: başlangıç ekranında liste yerine "Son açılan belgeler hatırlanmıyor"
   yazmalı, Dosya menüsünde Son açılanlar olmamalı. Bir belge açıp kapatın, PDEfe'yi yeniden başlatın: liste yine boş olmalı.
   Yeniden açınca açtığınız belgeler listelenmeli.
3. **Windows'un son kullanılanları.** Anahtar kapalıyken Dosya › Aç ile bir PDF açın: Gezgin'deki "Son kullanılanlar"da o dosya
   yeni eklenmiş görünmemeli. Gezgin'den çift tıklayarak açılan dosyaları Windows kendisi ekler; bu PDEfe'nin elinde değil.
4. **Kaldığım sayfa.** Belge açılışı › Her belgeyi kaldığım sayfadan aç'ı kapatın; bir belgenin 5. sayfasına gidip sekmeyi kapatın,
   yeniden açın: 1. sayfadan açılmalı. Anahtarı yeniden açınca kalınan sayfa yeniden hatırlanmalı.
5. **Yazı notu.** Yeni bir yazı notu ekleyip kaydedin, bilgisayarınızdaki başka bir PDF okuyucuda açın: yazı eskisi gibi görünmeli;
   okuyucuda yazıyı düzenlemeye açınca biçimi (yazı tipi, renk, kalın) korunmalı.
6. **Güncelleme (depo public olunca).** Kurulu 0.1.8'de güncelleme şeridi ya da Yardım › Güncellemeleri denetle 0.1.9'u bulmalı;
   Güncelle'ye basınca kurulup PDEfe 0.1.9 olarak açılmalı, ayarlar (tema, yazar adı, son açılanlar) korunmalı.

## 19. 0.1.10: otomatik testlerin sınayamadıkları
Kopyalama test örneğinde sistem panosuna dokunmadan sınandı; UYAP Doküman Editörü'ne yapıştırmaya bakılmadı.
1. **Mevzuat metni, girintili paragraf.** `1.5.6098.pdf`'in 15. sayfasında "tehlike arzeden bir işletme…" ile "…izin verilmiş olsa
   bile," arasını seçip kopyalayın; UDF'de ilk satır girintisi olan bir paragrafa yapıştırın: üç paragraf gelmeli ("…işletme
   sayılır." / "Belirli…saklıdır." / "Önemli…olsa bile,"), satırlar paragraf içinde akmalı, arada gereksiz boşluk olmamalı.
   Girintisiz paragrafa yapıştırınca da satırlar birleşik olmalı.
2. **Başka belgeler.** Bir Word PDF'inden, bir bilirkişi raporundan ve madde imli bir listeden kopyalayın: paragraflar eskisi gibi
   ayrı, madde imli satırlar ve başlıklar ayrı paragraf olmalı.

## 20. 0.1.11: otomatik testlerin sınayamadıkları
Kopyalama test örneğinde sistem panosuna dokunmadan sınandı; UYAP Doküman Editörü'ne yapıştırmaya bakılmadı.
1. **Kanunda bölüm başlığı.** `1.5.6098.pdf`'in 15. sayfasında "Önemli ölçüde tehlike arzeden…" ile "Haksız fiil dolayısıyla" arasını
   seçip kopyalayın; UYAP Doküman Editörü'nde paragraf aralığı 0 olan bir belgeye yapıştırın: "…isteyebilirler." ile "C. Zamanaşımı"
   arasında bir boş satır olmalı; "C. Zamanaşımı", "I. Kural" ve "MADDE 72-" alt alta, aralarında boş satır olmadan gelmeli.
2. **Sayfa geçişi.** 15. sayfanın son paragrafından ("Aynı şekilde…") 16. sayfadaki "II. Tazminat hükmünün değiştirilmesi" satırına
   kadar seçip yapıştırın: başlıktan önce bir boş satır olmalı.
3. **UYAP belgesi.** Bir mahkeme kararının ya da bilirkişi raporunun başlığını ve taraf bilgilerini kopyalayın: PDF'te boş satır olan
   yerlerde boş satır olmalı, paragraflar arasındaki küçük aralıkta olmamalı; sayfa sonunda süren paragraf tek paragraf kalmalı.

## 21. 0.1.12: otomatik testlerin sınayamadıkları
Kapatma akışları, araç soruları, Ayarlar, seçim çubuğu, sekme okları ve araç çıktı satırı test örneğinde gerçek tıklamayla sınandı
(test/senaryo17.mjs). Test örneğinde Gezgin açılmaz ve Windows'un varsayılan uygulama kaydı okunmaz; kurulu sürümde denenmedi.
1. **Pencere kapatma.** Üç belge açın, birinde bir not ekleyin (otomatik kaydetme kapalıyken). Pencerenin sağ üstündeki ×'e basın:
   değişikliği olmayan iki sekme hemen kapanmalı, kalan belge için "… belgesinde kaydedilmemiş değişiklikler var. Çıkmadan önce
   kaydetmek ister misiniz?" sorulmalı. Vazgeç'te PDEfe açık kalmalı; Kaydetme'de kapanmalı. (0.2.2'den beri birden çok sekmeli
   pencerede önce "Geçerli sekme / Tüm sekmeler" sorulur; bu adım **Tüm sekmeler** seçilince geçerli, bkz. 37.)
2. **Araç açıkken kapatma.** Sayfaları düzenle'de bir sayfayı döndürüp pencereyi kapatmadan PDEfe'nin ×'ine basın: önce aracın
   sorusu gelmeli; Vazgeç'te hiçbir şey kapanmamalı. (0.2.2'den beri birden çok sekme açıksa aracın sorusundan önce "Geçerli sekme /
   Tüm sekmeler" sorulur, bkz. 37.)
3. **Klasör çipi.** Bir araçta (ör. PDF küçült) adın yanındaki "Masaüstü"ne tıklayın: Masaüstü Gezgin'de açılmalı. Ad kutusunda
   ".pdf" görünmemeli; kaydedilen dosyanın adı ".pdf" ile bitmeli.
4. **Zaten varsayılan.** Ayarlar › Açılış ve düzen: PDEfe varsayılan PDF görüntüleyiciyse yeşil tik ve "Zaten varsayılan" görünmeli.
   Windows Ayarlar'dan başka bir uygulamayı seçip PDEfe'ye dönünce düğme geri gelmeli; yeniden PDEfe seçilince tik dönmeli.
5. **Otomatik kaydetme.** 0.1.12'yi kurduktan sonra Ayarlar › Kaydetme › Otomatik kaydet kapalı olmalı; açınca açık kalmalı
   (PDEfe yeniden başlatılınca da).
6. **Seçim çubuğu.** Bir sözcük seçin: tek vurgu düğmesi, ▾, not ve kopyala görünmeli. ▾'ye basınca renkler açılmalı, çubuk
   kaymamalı (▾ yine imlecin altında); bir renk seçince o renkle vurgulanmalı ve sonraki seçimde vurgu düğmesi o rengi göstermeli.
7. **Görünüm.** Sayfa kutusu, kopyala ve dişli simgeleri, yeni döndürme simgesi açık ve koyu temada, %125 ölçekte düzgün görünmeli.

## 22. 0.1.13: otomatik testlerin sınayamadıkları
Kısayolların hepsi, açılış ekranı, yeni sekme, belgesiz araç akışı ve seçim çubuğu test örneğinde gerçek girdiyle sınandı; menü kısayolları
görünmeyen ayrı bir masaüstünde, etkin pencerede (test/kisayol_dosya.mjs, test/kisayol_gorunum.mjs, test/kisayol_araclar.mjs,
test/senaryo19.mjs). Türkçe klavye tuşları taklit edildi; gerçek klavyede ve Windows'un gerçek Aç penceresinde denenmedi.
1. **Türkçe klavye.** Bir PDF açıp `Ctrl` ile `+` (Shift+4) basın: bir adım yakınlaşmalı. Sayısal tuş takımındaki `+` / `−` ve
   `Ctrl+−` de çalışmalı; `Ctrl+0` %100'e dönmeli. `Ctrl+R` sayfayı saat yönünde, `Ctrl+Shift+R` tersine döndürmeli (`Ctrl+Z` geri alır).
2. **Sekme değiştirme.** Üç belge açın. `Ctrl+PageDown` / `Ctrl+PageUp` ve `Ctrl+→` / `Ctrl+←` sekme değiştirmeli, sayfa
   değişmemeli; ilk ve son sekmede durmalı. `Ctrl+Tab`'a basılı tutup `←` `→` ile seçici içinde gezin; `Ctrl`'ü bırakınca seçilen
   sekmeye geçmeli.
3. **Yeni sekme.** Sekmelerin sağındaki **+**'ya (ya da `Ctrl+T`) basın: "Yeni sekme" açılmalı, açılış ekranı görünmeli. Oradan
   **PDF aç** ile bir belge açın: belge aynı sekmede açılmalı (sekme sayısı artmamalı). Gezgin'de bir PDF'e çift tıklamak da
   açık "Yeni sekme"nin yerine açmalı.
4. **Belgesiz araç.** Bütün sekmeleri kapatın. Açılış ekranında **PDF küçült**'e basın: Windows'un Aç penceresi gelmeli (başlığı
   "PDF küçült: PDF seçin"); bir PDF seçince belge açılıp Küçült penceresi o belgeyle açılmalı. Vazgeçince hiçbir şey açılmamalı.
   Araç çubuğundaki **Araçlar** penceresinde soluk araç olmamalı.
5. **Açılış ekranı.** PDF aç büyük ve belirgin, sürükle-bırak yazısı hemen altında, beş araç görünmeli (açık ve koyu temada, %125
   ölçekte). Ayarlar › Açılış ve düzen › Son açılanları hatırla kapatılınca Son açılanlar kutusu kalkmalı, açınca geri gelmeli.
6. **Seçim çubuğu.** Bir sözcük seçin: çubuk dar olmalı (yanlarda boşluk yok). ▾'ye basınca renkler ▾'nin altında dikey bir
   sütunda açılmalı, çubuk genişlememeli.
7. **Not.** Not aracının adı her yerde yalnızca "Not" olmalı (araç çubuğu ipucu, Düzen menüsü, Yorumlar paneli). Not aracıyla konup kaydedilen
   not başka bir PDF okuyucuda "Not" konusuyla görünmeli.
8. **Vurgu çubuğu.** Bir vurguya tıklayıp **Not ekle** deyin, bir şey yazın, Esc'e bir kez basın, vurguya yeniden tıklayın: not
   kapanmalı (yazdığınız kaydedilmiş olmalı), çubuk üstte açılmalı; **Kaldır** vurguyu silmeli.

## 23. 0.1.14: otomatik testlerin sınayamadıkları
Açılış ekranı birkaç pencere boyutunda (1920×1000, 1536×770, 1280×700, 1024×640, 760×560) ölçüldü, sekme sürükleme gerçek fare
olaylarıyla (CDP) ve not balonu başlığı test örneğinde sınandı (test/senaryo20.mjs, test/sekme_genislik.mjs). Gerçek farenin
hareketi, %125 ölçek ve gözle beğeni denenmedi.
1. **Açılış ekranı.** Bütün sekmeleri kapatın. "Son açılanlar" başlığı araçların altında, belgeler altındaki kutuda olmalı; kutuda
   kaydırma çubuğu olmamalı, 10 belge iki sütunda görünmeli. PDF aç düğmesinde "Bilgisayarınızdaki bir ya da birkaç PDF'i seçin veya
   bu pencereye sürükleyin" yazmalı, altında ayrı satır olmamalı. İçerik ortanın biraz üstünde durmalı. (0.2.3'ten beri PDF aç düğmesi
   Sayfaları düzenle karosuyla aynı hizada biter, açıklama geniş pencerede iki satıra iner, bkz. 38.)
2. **Ad ve sürüm.** PDEfe, "PDF görüntüleyici ve düzenleyici" ve sürüm sağ altta olmalı. Pencereyi büyütüp küçültün: yazı köşede
   kalmalı, içeriğin üstüne binmemeli.
3. **Sekme sürükleme.** Üç dört belge açın, bir sekmeyi basılı tutup yana çekin: sekme imleçle birlikte kaymalı (yarı saydam kopya
   çıkmamalı), öteki sekmeler kayarak yer açmalı; bırakınca sekme yerine oturmalı. Sürüklerken `Esc` sekmeleri eski yerlerine
   döndürmeli. Çok sekme varken çubuğun ucuna götürünce çubuk kendiliğinden kaymalı.
4. **Not başlığı.** Bir notu açın: başlıkta "Not | Adınız | tarih" görünmeli, çizgiler ince ve dikey olmalı; tarih adınızın hemen
   yanında, çöp kutusu ve × sağda.

## 24. 0.1.15: otomatik testlerin sınayamadıkları
PDF aç düğmesi beş pencere boyutunda ölçüldü; imzaya tık ve çift tık gerçek fare olaylarıyla (CDP), üzerine gelince görüntünün
değişmediği piksel karşılaştırmasıyla sınandı (test/senaryo21.mjs). Gerçek fare, %125 ölçek ve gözle beğeni denenmedi.
1. **PDF aç.** Bütün sekmeleri kapatın: PDF aç kutusu "… bu pencereye sürükleyin" yazısından hemen sonra bitmeli, sola yaslı durmalı;
   sağdaki boşluk soldaki kadar olmalı. Sol paneli açıp (F4) pencereyi olabildiğince daraltın: açıklama alt satıra inmeli, kutu
   taşmamalı (sol panel kapalıyken en dar pencerede de kutu sığar, açıklama tek satırda kalır). (0.2.3'ten beri kutu yazısıyla değil,
   alttaki Sayfaları düzenle karosunun sağ kenarıyla biter, bkz. 38.)
2. **Hakkında.** Sağ alttaki PDEfe simgesine, sonra "PDEfe" yazısına tıklayın: her seferinde Ayarlar › Hakkında açılmalı. Fareyle
   üzerine gelince ya da basılı tutunca hiçbir şey değişmemeli (çerçeve, zemin, el imleci yok).
3. **Çift tık.** Simgeye çift tıklayın, sonra araç çubuğundaki dişliye çift tıklayın: Ayarlar açılıp açık kalmalı (önceden bir an
   görünüp kapanıyordu). Pencerenin dışındaki karartılmış yere bir kez tıklamak yine kapatmalı.

## 25. 0.1.16 ve 0.1.17: otomatik testlerin sınayamadıkları
Exe'lere gömülen simgeler çıkarılıp bakıldı, kurulumdan sonra kayıt defterindeki simge yolları okundu. Windows'un kendi gösterdiği
yerler (masaüstü, görev çubuğu, Gezgin) denenmedi.
1. **Simge.** PDEfe'yi açın: pencerenin sol üstünde ve görev çubuğunda yeni simge görünmeli (lacivert sayfa, ortada altın sarısı
   dört yapraklı çiçek). Açılış ekranının sağ altında da yeni simge olmalı. (0.2.3'te simge yeniden değişti: kırmızı sayfa, beyaz
   çerçeve ve sarmal, bkz. 38.)
2. **Gezgin ve kısayollar.** Bir PDF dosyasının, masaüstü kısayolunun ve Başlat menüsündeki PDEfe'nin simgesine bakın. Eski simge (mavi ya
   da süslemeli) görünüyorsa Windows'un simge önbelleğidir; bilgisayarı yeniden başlatınca düzelir.

## 26. 0.1.19: otomatik testlerin sınayamadıkları
Sekmenin ayrılması, taşınan belgenin durumu (notlar, sayfa değişiklikleri, geri al), pencereler arası bırakma, ayarların ortaklığı ve
kapatma soruları ekran dışındaki test örneğinde, fare olayları test aracından verilerek sınandı (test/senaryo22.mjs); imlecin yeri de
testten verildi. Ayrıca görünmeyen bir masaüstünde Windows fare iletileriyle sekme ayrıldı (fare yakalaması ve pencere odağı ölçüldü)
ve pencerenin farklı ölçekli ikinci ekrana yerleşmesi ölçüldü. Elle tutulan gerçek fare, önizlemenin ve pencerelerin ekrandaki
görünüşü gözle denenmedi.
1. **Sürükleyerek ayırma.** Üç PDF açın. Bir sekmeyi çubuğun içinde sağa sola sürükleyin: eskisi gibi yalnızca sıralanmalı. Sonra
   sekmeyi aşağı, belgenin üstüne çekin: sekme çubuktan ayrılmalı, belgenin adını ve sayfasını gösteren küçük bir önizleme imleci
   izlemeli; PDEfe penceresi etkin kalmalı (başlık çubuğu solmamalı). Sekmeyi çubuğa geri götürün: yerine takılmalı, önizleme
   kalkmalı. Yeniden dışarı çekip `Esc`'e basın: sekme eski yerine dönmeli.
2. **Bırakma.** Sekmeyi dışarı çekip masaüstünün boş bir yerinde (ve ikinci ekranda) bırakın: belge orada kendi penceresinde açılmalı,
   sekmesi imlecin altında olmalı, pencere ekrana sığmalı; belge aynı sayfada olmalı. Ekranı kaplayan (büyütülmüş) pencereden ayrılan
   sekme olağan boyutta bir pencerede açılmalı.
3. **Kaydedilmemiş değişiklikler.** Bir belgede vurgu ve not ekleyin, bir sayfayı döndürün, kaydetmeden sekmeyi dışarı sürükleyin:
   yeni pencerede vurgu, not ve döndürme durmalı; `Ctrl+Z` hepsini sırayla geri almalı, `Ctrl+Y` yinelemeli, `Ctrl+S` kaydetmeli.
4. **Sağ tık.** Sekmede sağ tık › **Pencereye ayır**: belge, pencerenin biraz sağında ve aşağısında açılan yeni pencereye geçmeli.
   Pencerede tek sekme varken ve "Yeni sekme"de seçenek soluk olmalı.
5. **Pencereler arası.** İki pencere yan yanayken bir pencerenin sekmesini ötekinin sekme çubuğuna sürükleyin: sekmelerin arasında
   çizgi belirmeli, bırakınca sekme oraya takılmalı ve o pencere öne gelmeli. Son sekmesi de taşınan pencere kapanmalı.
6. **Tek sekme.** Tek sekmeli pencerenin sekmesini dışarı çekip boş bir yere (ikinci ekrana da) bırakın: yeni pencere açılmamalı,
   pencere oraya gitmeli, boyutu bozulmamalı.
7. **Görev çubuğu ve kapatma.** İki pencere görev çubuğunda aynı PDEfe simgesinin altında görünmeli. Kaydedilmemiş belgesi olan
   pencereyi × ile kapatın: soru yalnızca o pencerede çıkmalı. `Alt+F4` yalnızca öndeki pencereyi kapatmalı; **Dosya › Çıkış**
   ikisini de (kaydedilmemiş belgeleri sorarak) kapatmalı. (0.2.2'den beri × ve `Alt+F4` birden çok sekmeli pencerede önce "Geçerli
   sekme / Tüm sekmeler" sorar; Dosya › Çıkış sormaz, bkz. 37.)
8. **Gezgin.** İki pencere açıkken Gezgin'de bir PDF'e çift tıklayın: en son kullandığınız pencerede açılmalı. Öteki pencerede açık
   bir PDF'e çift tıklayın: o pencere öne gelmeli, belge ikinci kez açılmamalı.
9. **Ayarlar.** Bir pencerede temayı değiştirin (ay / güneş düğmesi): öteki pencere de değişmeli.

## 27. 0.1.20: otomatik testlerin sınayamadıkları
Titreme, test örneğinde sizin pencere boyutunuzda ve belgenizin bir kopyasıyla yeniden üretildi ve düzeltmeden sonra ölçüldü
(test/sigdirma_kararli.mjs; ekran ölçeği %100, %125 ve %150). Gerçek ekranda, pencere yerleştirme aracının bölgesinde ve gözle denenmedi.
1. **Bildirilen belge.** Titreyen belgeyi aynı yerde (ana ekranda, yarım ekran bölgesinde) açın: görüntü sabit durmalı, yakınlaştırma
   kutusu tek değerde (%81) kalmalı, kaydırma çubuğu çıkıp kaybolmamalı. İki sayfa da pencereye sığar; sayfaların iki yanındaki boşluk
   öteki belgelerdekinden birkaç piksel geniştir (kaydırma çubuğu gerekmeyen yakınlaştırma).
2. **Pencereyi boyutlandırma.** Aynı belge açıkken pencerenin alt ve sağ kenarını yavaşça sürükleyin: sayfa pencereyi izlemeli, hiçbir
   boyutta titrememeli. **Görünüm** menüsünden "Sayfayı sığdır" ve "Görünür alana sığdır"ı seçip yineleyin.
3. **İkinci ekran.** Pencereyi %150 ölçekli ikinci ekrana taşıyıp 1. ve 2. maddeyi orada da deneyin. Uzun bir belgede pencerenin sağ
   kenarını yavaşça sürüklerken sayfaların altında yatay kaydırma çubuğu belirmemeli (önceden her üç genişlikten birinde çıkıyordu).
4. **İki sayfa düzeni.** Ana ekranda **Görünüm › İki sayfa**'yı seçip pencerenin sağ kenarını yavaşça sürükleyin: sayfaların altında
   yatay kaydırma çubuğu çıkıp kaybolmamalı.
5. **Öteki belgeler.** Uzun bir belge (kaydırma çubuğu olan) ve tek sayfalık bir belge açın: eskisi gibi genişliğe sığmalı; açılırken
   sayfa bir an büyük görünüp küçülmemeli.

## 28. 0.1.21: otomatik testlerin sınayamadıkları
Sekme çubuğu, sürükleme eşiği, sekme genişliği ve PDF'i kopyala ekran dışındaki test örneğinde, fare olayları test aracından verilerek
sınandı (test/senaryo23.mjs); sekmeyi çubuğun dışına sürükleme Windows fare iletileriyle de denendi. Elle tutulan gerçek fare, sekmelerin
ekrandaki görünüşü ve panodaki dosyanın başka programa yapıştırılması gözle denenmedi.
1. **Sekme çubuğu.** PDEfe'yi açın: sekme çubuğunda "Yeni sekme" durmalı, × düğmesi olmamalı. Bir PDF açın: "Yeni sekme"nin yerine
   geçmeli. Sekmesini kapatın: çubuk yerinde kalmalı, "Yeni sekme" ve açılış sayfası görünmeli; araç çubuğunda sayfa "/ 0" olmalı.
   "Yeni sekme"de `Ctrl+W` pencereyi kapatmalı. (Belge yokken **+** / `Ctrl+T` 0.1.21'de ikinci boş sekme açmıyordu; 0.1.22'de açar,
   bkz. 29.)
2. **Sürükleme.** Üç PDF açın. Bir sekmeyi tutup yavaşça komşusuna doğru çekin: sekme komşusunun dörtte birine girince komşu kayarak
   yer açmalı (önceden ancak tam üstüne gelince açıyordu). Biraz geri çekince komşu yerine dönmeli.
3. **Genişlik.** Bir iki belge açıkken sekmeler geniş olmalı, adlar daha uzun görünmeli. Belge açtıkça sekmeler birlikte daralmalı;
   çubuk dolunca önceki dar genişlikte kalıp kaydırılmalı (◀ ▶ ile, tekerlekle). Sekmeleri × ile art arda kapatın: fare çubuktayken
   sekmeler genişlememeli, sıradaki sekmenin × düğmesi farenin altına gelmeli; fareyi belgenin üstüne götürünce sekmeler genişlemeli.
4. **PDF'i kopyala.** Sekmede sağ tık: **Yolu kopyala**'nın altında **PDF'i kopyala** olmalı. Seçip Gezgin'de bir klasöre `Ctrl+V`
   yapın: PDF dosyası oraya kopyalanmalı (e-postaya ya da UYAP'a da yapıştırılabilir). "Yeni sekme"de seçenek soluk olmalı.
5. **Soru.** Bir belgeye not ekleyip kaydetmeden araç çubuğunun sağındaki kopyala düğmesine basın: soru "Kopyalamadan önce kaydetmek
   ister misiniz?" olmalı, düğmeler **Kaydet ve kopyala**, **Kaydetmeden kopyala**, **Vazgeç**. Aynısını başka bir sekmedeyken o belgenin
   sağ tık › PDF'i kopyala'sıyla deneyin: soru açılmadan önce o belgeye geçilmeli.
6. **Alçak pencere.** Pencereyi alçaltın (yaklaşık 700 piksel yükseklik) ve son açılanlarda on belge varken "Yeni sekme"ye bakın:
   açılış sayfası kaydırma çubuğu olmadan sığmalı, sağ alttaki ad ve sürüm içeriğin altında kalmalı.

## 29. 0.1.22: otomatik testlerin sınayamadıkları
Belge yokken yeni boş sekme açma ekran dışındaki test örneğinde (+ düğmesine test aracından fare tıklamasıyla, `Ctrl+T` / `Ctrl+W` menü
kısayollarıyla görünmeyen masaüstünde) sınandı (test/senaryo23.mjs, senaryo19.mjs, kisayol_dosya.mjs). Gerçek fareyle ve ekranda gözle
denenmedi.
1. **Belge yokken + ve Ctrl+T.** Bütün sekmeleri kapatın: "Yeni sekme" kalmalı, × düğmesi olmamalı. **+**'ya basın: ikinci "Yeni sekme"
   açılmalı ve seçilmeli; ikisinde de × görünmeli. `Ctrl+T` ile bir tane daha açın.
2. **Kapatma.** Bu "Yeni sekme"lerden birini × ile, birini `Ctrl+W` ile kapatın: pencere kapanmamalı. Tek "Yeni sekme" kalınca × kaybolmalı;
   o sekmede `Ctrl+W` pencereyi kapatmalı.
3. **Belge açma.** İki "Yeni sekme" varken birinden PDF açın: belge yalnızca o sekmenin yerine geçmeli, öteki "Yeni sekme" kalmalı. Belgeyi
   kapatınca yanındaki "Yeni sekme" yerinde kalmalı (yenisi eklenmemeli).

## 30. 0.1.23: otomatik testlerin sınayamadıkları
Güvenlik düzeltmeleri test örneğinde (test/senaryo24.mjs, test/guvenlik_testi.py) ve görünmeyen masaüstünde paketli sürümle
(test/gercek_fare.ps1 -Paketli) sınandı. Gerçek tarayıcı, gerçek pano, başka PDF okuyucu ve kurulu sürümle denenmedi.
1. **Bağlantı sorusu.** İçinde web bağlantısı olan bir PDF açın (ör. bir makale ya da mevzuat PDF'i), bağlantıya tıklayın: tam adresiyle
   "Bağlantı tarayıcıda açılsın mı?" sorulmalı; **Aç** varsayılan tarayıcıda açmalı, **Vazgeç** hiçbir şey açmamalı. "Bu belgede
   yeniden sorma"yı işaretleyip **Aç** deyin: aynı belgedeki başka bir bağlantı sorulmadan açılmalı.
2. **Silinen not.** Notlu bir PDF'in **kopyasında** bir notu silip `Ctrl+S`: durum çubuğunda "Kaydedildi (tam yazım)" görünmeli. Dosyayı
   başka bir PDF okuyucuda açın: not olmamalı, belge sağlam açılmalı. İnternetten indirilmiş bir PDF'in kopyasında aynısını yapın: o
   okuyucu dosyayı önceki gibi (korumalı görünüm uyarısıyla) açmalı.
3. **Temiz kopyalama.** PDEfe'de birkaç satır kopyalayıp Word'e ya da UYAP Doküman Editörü'ne yapıştırın: metin önceki sürümdeki gibi
   temiz gelmeli (satırlar paragraf olarak birleşmiş). Sonra PDEfe'de bir şey kopyalayıp hemen (1 saniye içinde) başka bir programda
   başka bir sözcük kopyalayın ve yapıştırın: yapıştırılan o sözcük olmalı.
4. **Hatırlanan sayfalar.** Ayarlar › Açılış ve düzen › **Hatırlanan sayfaları temizle**: düğme etkin olmalı, basınca devre dışı kalmalı.
   Daha önce ortasında bırakılmış bir belgeyi açın: ilk sayfadan açılmalı.
5. **Kurulu sürüm.** 0.1.23'e güncelledikten sonra PDEfe açılmalı; PDF açma, not ekleme ve kaydetme, yazdırma diyaloğu, Araçlar (Küçült,
   Birleştir) önceki gibi çalışmalı. (Electron 44.5.1'e yükseltildi ve uygulama dosyasının bütünlüğü açılışta denetleniyor.)

## 31. 0.1.24: otomatik testlerin sınayamadıkları
Görsellerdeki yazının tanınması, menü çubuğu ve kaydırma çubuğu ekran dışındaki test örneğinde üretilmiş örnek PDF'le sınandı
(test/senaryo25.mjs); tanıma ayrıca İndirilenler'deki taranmış PDF'lerde yalnızca süre ve satır sayısı ölçülerek denendi. Gerçek
fareyle, ekranda gözle ve kurulu sürümle denenmedi.
1. **Taranmış belgede seçim.** UYAP'tan indirilmiş taranmış (yazısı seçilemeyen) bir evrak açın. Sayfa göründükten kısa süre sonra
   yazının üstünde imleç yazı imlecine dönmeli; birkaç satırı fareyle seçin: mavi vurgu yazının tam üstüne oturmalı. `Ctrl+C` ile
   kopyalayıp Word'e ya da UYAP Doküman Editörü'ne yapıştırın: satırlar paragraf olarak birleşmiş gelmeli. Birkaç sözcüğü taramayla
   karşılaştırın (tarih ve esas numarası dahil); tanıyıcı her harfi doğru okumayabilir.
2. **Karışık sayfa.** Hem yazısı seçilebilen hem görsel (kaşe, imza, antet) olan bir belgede: PDF'in kendi yazısı önceki gibi seçilmeli,
   görseldeki yazı da seçilebilmeli; aynı satır iki kez kopyalanmamalı.
3. **Yan çevrilmiş sayfa.** Yatay ya da yan yatırılmış taranmış bir sayfa varsa orada da seçin ve kopyalayın: satırlar okuma sırasıyla
   gelmeli.
4. **Menü çubuğu.** PDEfe açıldığında Dosya / Düzen / Görünüm çubuğu görünmemeli. Kopyala düğmesinin solundaki düğmeye basın: çubuk
   görünmeli, düğme basılı görünmeli. PDEfe'yi kapatıp açın: çubuk açık kalmalı. Yeniden basıp gizleyin, kapatıp açın: gizli kalmalı.
   Gizliyken tek başına `Alt`'a basın: çubuk geçici görünmeli (belgeye tıklayınca kaybolmalı); `Ctrl+O`, `Ctrl+S` çalışmalı.
5. **Kaydırma çubuğu.** Belgenin sağındaki kaydırma çubuğunun tutamağı öncekinden kalın olmalı ve fareyle kolay tutulmalı. Genişliğe
   sığdırılmış belgede altta yatay çubuk çıkmamalı.

## 32. 0.1.25: otomatik testlerin sınayamadıkları
Araçlar ekran dışındaki test örneğinde üretilmiş örnek PDF'lerle sınandı (test/senaryo26.mjs; senaryo13, 17, 19, kisayol_araclar,
ortu_tiklama güncellendi); yazı tanıma İnenler'deki PDF'lerde yalnızca oranlar okunarak ölçüldü. Gerçek fareyle, ekranda gözle ve kurulu
sürümle denenmedi. Denemeleri belgelerin **kopyalarıyla** yapın.
1. **Kaydet bölümü.** Bir PDF açıp sırayla PDF Sıkıştırma, Sayfaları düzenle, Döndür ve kaydet, PDF ayır ve Görüntü / PDF birleştir'i açın:
   her birinde "Kaydet" başlığının altında önce **Yeni belge olarak kaydet | Üzerine yaz**, altında ad kutusu, klasör ve **Değiştir**
   olmalı (gönderdiğiniz ekran görüntüsündeki gibi). Önerilen adlar: Sıkıştırılmış, Düzenlenmiş, Döndürülmüş, Ayrılmış, Birleşik.
2. **Üzerine yaz.** Herhangi bir araçta **Üzerine yaz**'a basın: ad ve klasör satırı kaybolmamalı; açık belgenin adı ve klasörü soluk
   görünmeli, altında uyarı ya da bilgi satırı. **Yeni belge olarak kaydet**'e dönünce önceki ad yerinde olmalı.
3. **PDF ayır.** "Sayfa aralıklarına göre"nin yanında **Ayrı ayrı dosya | Tek dosya** görünmeli; "Her … sayfada bir" ve "Seçili sayfaları
   çıkart" olmamalı. Kutuya `1-3, 5` yazıp Ayrı ayrı dosya ile ayırın: Masaüstünde "Ayrılmış - Sayfa 1-3.pdf" ve "Ayrılmış - Sayfa 5.pdf"
   oluşmalı. Tek dosya ile ayırın: "Ayrılmış.pdf" (4 sayfa). Ad kutusuna başka bir ad yazıp deneyin.
4. **Birleştir.** Bir PDF açıkken Görüntü / PDF birleştir'i açın: o PDF listenin en üstünde olmalı. Bir görüntü ya da PDF ekleyip
   **Birleştir**: Masaüstünde "Birleşik.pdf" oluşmalı. Bir **kopya** PDF'te Üzerine yaz'ı seçip birleştirin: o PDF'in sayfaları artmış
   olarak yeniden açılmalı. Açık PDF'i listeden çıkarınca Üzerine yaz soluklaşmalı.
5. **PDF Sıkıştırma.** Araçlar düğmesinde ve Araçlar menüsünde "PDF küçült" yerine "PDF Sıkıştırma" yazmalı; pencerede "Sıkıştırma
   seçenekleri" başlığı ve "Sıkıştır" düğmesi.
6. **Yazı tanıma.** Taranmış (özellikle düşük çözünürlüklü, bulanık görünen) bir UYAP evrakında birkaç satırı seçip kopyalayın; tarih,
   esas numarası ve tutarları taramayla karşılaştırın. 0.1.24'e göre daha az yanlış okunmalı; sayfa göründükten sonra seçilebilir olması
   biraz (sayfa başına yaklaşık 0,1 saniye) uzayabilir.

## 33. 0.1.26: otomatik testlerin sınayamadıkları
Ekran dışındaki test örneğinde üretilmiş örnek PDF'lerle sınandı (test/senaryo26.mjs). Gerçek ekranda gözle denenmedi.
1. **Araç adları.** Araçlar düğmesinde, Araçlar menüsünde ve açılış ekranında "PDF Sıkıştırma" yerine **Sıkıştır**, "PDF ayır" yerine
   **Ayır** yazmalı; iki aracın penceresinin başlığı da öyle.
2. **Birleştir'in yeri.** Bir PDF açıkken Görüntü / PDF birleştir'i açın: pencere sekmelerin hemen altında başlamalı, arkadaki sekmelerin
   adları (hafif karartılmış) okunmalı, etkin sekme belli olmalı. Pencerenin altında listeyi, Kalite ve Kaydet bölümlerini ve Birleştir
   düğmesini görebilmelisiniz. Uygulama penceresini küçültüp büyütün: pencere yine sekmelerin altında kalmalı (çok kısa pencerede ortaya
   geçer).
3. **Önerilen ad.** Birleştir'in Kaydet bölümünde ad "Birleştirilmiş" olmalı; Masaüstünde "Birleştirilmiş.pdf" varken "Birleştirilmiş (2)".

## 34. 0.1.27: otomatik testlerin sınayamadıkları
Ekran dışındaki test örneğinde üretilmiş örnek PDF'lerle sınandı (test/senaryo27.mjs). Gerçek ekranda gözle denenmedi.
1. **Döndür düğmesi.** Çok sayfalı bir belgenin (kopyasının) 3. sayfasındayken araç çubuğundaki Döndür düğmesine basın: soru çıkmamalı,
   yalnızca 3. sayfa dönmeli. `Ctrl+R` ve `Ctrl+Shift+R` de öyle. `Ctrl+Z` geri almalı.
2. **Ayarlar.** Ayarlar › Açılış ve düzen'de "Döndür düğmesi" seçeneği olmamalı.
3. **Adlar.** Araçlar düğmesinde, Araçlar menüsünde ve açılış ekranında "Döndür" (açıklaması "Sayfaları döndürür") ve Sayfaları düzenle'nin
   açıklaması "Sıralar, siler, döndürür, sayfa ekler" olmalı; Döndür penceresinin başlığı ve düğmesi "Döndür".
4. **Sayfaları düzenle'nin yeri.** Pencere sekmelerin hemen altında açılmalı, arkadaki sekmeler okunmalı; küçük resimler, Kaydet bölümü ve
   Kaydet düğmesi görünmeli.

## 35. 0.2.0 (macOS): otomatik testlerin sınayamadıkları
GitHub'ın Mac makinelerinde (macOS 15 Apple işlemcili, macOS 15 Intel, macOS 26) DMG kurulup sınandı (test/mac_duman.mjs): açılış,
Finder'dan PDF açma, sayfa çizimi, yazı tipleri, yazı tanıma, PDF'i kopyala, gerçek klavyeyle ⌘F / ⌘A / ⌘Z / ⌘T / ⌘W / ⌘0, çıkış. O makineler
ilk açılış uyarısını göstermez ve ekrana bakan biri yoktur: aşağıdakiler gerçek bir Mac'te elle denenmeli. Windows'ta görünür bir değişiklik
olmamalı (11. madde).
1. **İndirme ve ilk açılış.** README'deki "macOS için indir" bağlantısıyla `PDEfe-Mac.dmg`'yi indirin, açın, PDEfe'yi Uygulamalar'a
   sürükleyin, Uygulamalar'dan açın. Uyarı çıkmalı; Sistem Ayarları › Gizlilik ve Güvenlik › **Yine de Aç** ile PDEfe açılmalı. İkinci
   açılışta uyarı çıkmamalı.
2. **Finder.** Bir PDF'e sağ tık › Birlikte aç listesinde PDEfe olmalı ve açmalı. Bilgi Al › Birlikte aç › PDEfe › Tümünü Değiştir'den sonra
   PDF'e çift tıklayınca PDEfe'de açılmalı (PDEfe açıkken ikinci PDF aynı pencerede yeni sekmede). PDEfe kapalıyken çift tıklayınca da.
   Dock'taki PDEfe simgesine PDF sürükleyip bırakın.
3. **Menü.** Ekranın üstünde PDEfe, Dosya, Düzen, Görünüm, Araçlar, Pencere, Yardım; PDEfe menüsünde Hakkında, Güncellemeleri denetle,
   Ayarlar…, Gizle, Çık. Pencerenin araç çubuğunda menü çubuğu düğmesi olmamalı.
4. **Kısayollar.** ⌘O, ⌘T, ⌘S, ⇧⌘S, ⌘W, ⌘P, ⌘F, ⌘G, ⌥⌘G, ⌘,, ⌘Z / ⇧⌘Z (bir not ekleyip), ⇧⌘[ / ⇧⌘] ve ⌃Tab (iki sekme açıkken), ⌘1,
   ⌘+ / ⌘− / ⌘0, ⌘R, ⌃⌘S (sol panel), ⇧⌘H (okuma modu), ⌃⌘F (tam ekran), ⌘↑ / ⌘↓. Bul kutusunda ve sayfa kutusunda ⌘A, ⌘C, ⌘V, ⌘Z
   kutunun içinde çalışmalı. Araç çubuğu düğmelerinin üzerinde durunca ipuçlarında ⌘'li kısayollar yazmalı; F1 (ya da Yardım › Kısayollar)
   penceresinde de.
5. **Dokunmatik yüzey.** İki parmakla kıstırarak yakınlaştırıp uzaklaştırın: akıcı olmalı, sıçramamalı. İki parmakla kaydırma sayfayı
   kaydırmalı.
6. **Notlar.** Bir PDF'in kopyasına vurgu, not ve Türkçe harfli (ş ğ ı İ ç ö ü) bir yazı notu ekleyip kaydedin; dosyayı Önizleme'de açın:
   yazı ve harfler aynı görünmeli. Yazı notunun yazı tipi listesinde Arial ve Times New Roman olmalı.
7. **PDF'i kopyala.** Araçlar › PDF'i kopyala; Finder'da bir klasörde ⌘V: PDF'in kopyası gelmeli. Bir e-postaya ⌘V: ek olmalı.
8. **Yazdır.** ⌘P: PDEfe'nin yazdırma penceresinden sonra Mac'in yazdırma penceresi açılmalı (PDF olarak kaydet ile deneyebilirsiniz).
9. **Yazı tanıma.** Taranmış bir UYAP evrakında birkaç satırı seçip kopyalayın. macOS 26'da Türkçe harfler doğru gelmeli; macOS 15 ve
   öncesinde ş, ğ, ı, İ harfleri s, g, i, I gelebilir, tarih ve esas numarası yine doğru olmalı.
10. **Çıkış.** Kaydedilmemiş değişiklikle ⌘Q: kaydetme sorusu gelmeli; Vazgeç'te PDEfe açık kalmalı. Dock'ta PDEfe › Çık da aynı.
11. **Windows.** Windows'ta PDEfe 0.2.0'da menü, kısayollar ve ipuçları eskisi gibi (Ctrl'li) olmalı; README'nin başında iki bağlantı.

## 36. 0.2.1: otomatik testlerin sınayamadıkları
Ekran dışındaki test örneğinde üretilmiş örnek PDF'lerle sınandı (test/senaryo28.mjs): sağ tık gerçek fare olayıyla, menüdeki seçim test
yanıtıyla verildi; menü ekranda açılmadı. Gerçek ekranda gözle denenmedi.
1. **Belgede sağ tık.** Bir PDF'in kopyasında sayfaya sağ tıklayın: menünün en altında, çizgiyle ayrılmış "Kaydet" soluk olmalı. Bir vurgu ya
   da not ekleyip yeniden sağ tıklayın: "Kaydet" etkin olmalı. Seçince sekmedeki • işareti ve durum çubuğundaki "Kaydedilmemiş değişiklikler"
   kalkmalı, durum çubuğunda kısa süre "Kaydedildi" yazmalı. Dosyayı başka bir PDF okuyucuda açınca not görünmeli.
2. **Yazı kutusu.** Yazı aracıyla bir kutuya yazarken (bitirmeden) yazının üstüne sağ tık › Kaydet: yazı not olarak kalmalı ve kaydedilmeli.
   Kutu henüz boşken sağ tıklayınca Kaydet soluk olmalı.
3. **Sekmede sağ tık.** İki PDF'in kopyası açıkken birine not ekleyip öbür sekmeye geçin; notlu belgenin sekmesine sağ tık › Kaydet: o sekmenin
   • işareti kalkmalı, öndeki belge değişmemeli. Değişikliksiz bir sekmede ve "Yeni sekme"de Kaydet soluk olmalı.
4. **Soru açılırsa.** Aynı denemeyi, notlu belgenin kopyası başka bir programda açıkken yapın: "Belge kaydedilemedi" uyarısı açılmadan önce
   o belge öne gelmeli (uyarının hangi belge için olduğu görünsün).

Genel kod taramasının düzeltmeleri (aynı sürüm). Her biri ekran dışındaki test örneğinde, değişiklik öncesi kodda düşen bir sınamayla
doğrulandı; aşağıdakiler gerçek ekranda, gerçek panoyla ya da gerçek bir Mac'te denenmeli. Hep belgelerin kopyalarıyla çalışın.
5. **Temiz kopya.** Bir UYAP belgesinden (özellikle Word 2010'dan çıkmış, "Ġ" gibi bozuk harfli olanlardan) birkaç satır seçip UYAP Doküman
   Editörü'ne ya da Word'e yapıştırın: satırlar paragraf olarak birleşmeli, harfler İ, Ş, ş olmalı. Seçimi bir satırın ortasından başlatıp
   sonraki satırda bitirin: tek paragraf gelmeli.
6. **Windows'u yeniden başlatma.** Bir belgeye not ekleyip kaydetmeden Windows'u yeniden başlatın: Windows "PDEfe kapatmayı engelliyor"
   ekranını göstermeli; İptal'e basınca PDEfe'nin Kaydet / Kaydetme / Vazgeç sorusu görünmeli. ("Yine de kapat" değişikliği kaybettirir.)
7. **Farklı kaydet.** İki belge açıkken birini Farklı kaydet'le öbürünün adının üzerine kaydetmeyi deneyin: "PDEfe'de başka bir sekmede
   açık" sorusu çıkmalı (Başka ad seç / Vazgeç), öbür belgeye dokunulmamalı.
8. **İçindekiler.** Yer imli bir belgede Sayfaları düzenle'yle ilk sayfayı silin, İçindekiler'de bir başlığa tıklayın: doğru sayfaya gitmeli.
9. **Küçük resimler.** Bir vurguyu silip kaydedin: Sayfalar panelindeki küçük resimde vurgu da kalkmalı.
10. **Yüklenirken kapatma.** Büyük bir PDF açılırken sekmesini hemen kapatın, sonra dosyanın adını Gezgin'de değiştirin: değişmeli.
11. **İkinci ekran.** PDEfe'yi ikinci ekranda (büyütülmemiş) kapatın, ekranı çıkarın, PDEfe'yi açın: görünen ekranda açılmalı.
12. **Geç iptal.** Büyük bir PDF'te Sıkıştır'ı açın, yeni belgenin adını var olan bir dosyanın adı yapıp üzerine yazmayı onaylayın,
    "Kaydediliyor…" görününce İptal'e basın: dosya yerinde kalmalı ve "İptal edilemeden tamamlandı" bildirimi çıkmalı.
13. **Yazı notunda işaretler.** Bir yazı notuna "Madde 5 → 7, süre ≤ 2 hafta" yazıp kaydedin; dosyayı başka bir PDF okuyucuda açın: ok ve ≤
    görünmeli.
14. **Ctrl+Tab.** Ayır › birden çok dosya oluşturup hepsini açtırın, sonra Ctrl+Tab'ı basılı tutun: arka planda açılan sekmeler de listede
    olmalı.
15. **Birleştir'de HEIC.** iPhone'dan gelen bir .heic fotoğrafı Birleştir'e sürükleyin: "HEIC fotoğraflarını önce JPG ya da PNG'ye çevirin"
    bildirimi çıkmalı.
16. **Gerçek bir Mac'te** (yayımdan önce CI'da Mac sınaması da önerilir): macOS 13 ve üstünde açılmalı; Finder'da Kilitli işaretli bir PDF'in
    kopyasında ⌘S: dosya değişmemeli, "Belge kaydedilemedi" sorusu Finder › Bilgi Al'ı anlatmalı; Birleştir listesinde ⌫ seçilenleri, Son
    açılanlar'da satırı çıkarmalı; belgede Ctrl+tık yalnızca menüyü açmalı; yazı kutusu düzenlenirken ⇧⌘] sekme değiştirmeli; dokunmatik
    yüzeyle sekme çubuğunda tek kaydırma bir sekme geçmeli; Son açılanlar'da yol /Users/… biçiminde olmalı; güncelleme şeridi ve Ayarlar ›
    Güncelleme önce PDEfe'den çıkmayı anlatmalı, düğme İndir.
17. **README.** GitHub'da (gönderildikten sonra) README'nin görüntüleri görünmeli ve anlattıkları bölümün altında olmalı.

## 37. 0.2.2: otomatik testlerin sınayamadıkları
Ekran dışındaki ve görünmeyen masaüstündeki test örneğinde, üretilmiş örnek PDF'lerle ve %100 / %125 / %150 ölçekte sınandı (test/serit_olculeri,
panel_kucuk_resim, arac_onizleme, senaryo29, senaryo30; kapatma sorusu gerçek Windows kapatma iletisiyle de). Gerçek fareyle ve klavyeyle, ekranda
gözle, gerçek ikinci ekranda, ekran okuyucuyla ve Mac'te denenmedi. Denemeleri belgelerin **kopyalarıyla** yapın.
1. **Kaydırma çubuğu.** Belgenin sağındaki kaydırma çubuğu öncekinden kalın, kolay tutulur olmalı; çok sayfalı belgede tutamak küçük bir daire değil,
   dikine bir hap. Belgeyi %300'e yakınlaştırın (yatay ve dikey çubuk birlikte): sağ alt köşede beyaz kare olmamalı, koyu temada da.
2. **Sekme şeridi ve araç çubuğu.** İkisi aynı yükseklikte olmalı; sekme adları biraz büyük, sekmenin × düğmesi kolay tıklanır; araç çubuğundaki
   simgeler, sayfa ve yakınlaştırma kutuları biraz büyük. Bul kutusu, not balonları, Ayarlar ve araç pencerelerindeki düğmeler eskisi gibi kalmalı.
3. **Dar pencere.** Pencereyi sağ kenarından en dara kadar daraltın: araç çubuğu kademe kademe sıkışmalı, taşmamalı, tema düğmesi hep görünmeli (en
   dar hâlde PDF'i kopyala düğmesi gizlenebilir, Araçlar menüsünde var). Çok sekme açıkken sekmeler en dar hâlde de "ustyazi (85).pdf" gibi adları
   kısaltmamalı.
4. **Sekme sürükleme.** Bir sekmeyi şeridin dışına sürükleyin: imlecin altındaki önizlemenin başlığı sekme boyunda olmalı, bırakınca yeni
   pencerede sekme imlecin altında durmalı. Okuma kipinde (`Ctrl+H`) fare en üste gelince araç çubuğu açılmalı.
5. **Açılış ekranı.** Bütün sekmeleri kapatın: sağ alttaki PDEfe simgesi ve yazıları seçtiğiniz C boyutunda, simge yazılara yakın olmalı;
   tıklayınca Ayarlar › Hakkında açılmalı. Pencereyi alçaltın, sol paneli (`F4`) geniş açın: imza listenin altında kalmalı, üstüne binmemeli,
   kesilmemeli.
6. **Sayfalar paneli.** `F4` › Sayfalar; panelin sağ kenarını en dara çekin: küçük resimler kesilmeden küçülmeli, altta yatay çubuk çıkmamalı,
   mavi çerçeve sayfayı ve numarasını çevrelemeli, üstteki üç başlık panelin içinde okunmalı. Ekranın yarısına kadar genişletin: sayfalar büyümeli
   ve bıraktıktan bir an sonra keskinleşmeli, sürüklerken boş beyaz kutuya dönmemeli; bulunduğunuz sayfa görünür kalmalı.
7. **Döndürülmüş sayfa panelde.** `Ctrl+R` ile bir sayfayı döndürün: paneldeki resim doğru yönde ve oranda olmalı; paneli daraltıp genişletince,
   `Ctrl+S`'ten sonra ve sekme değiştirip dönünce de.
8. **İkinci ekran (ofis, %150).** PDEfe'yi o ekrana taşıyın: Sayfalar panelindeki ve açıksa Sayfaları düzenle'deki küçük resimler kısa süre
   sonra keskinleşmeli.
9. **Sayfaları düzenle.** Çok sayfalı bir PDF'te Araçlar › Sayfaları düzenle: sayfalar belirgin büyük (yaklaşık 1,5 kat), pencere geniş, satırda
   4–5 sayfa, yazılar keskin. Yatay ya da döndürülmüş sayfa çerçevesinde kalmalı, R ile döndürünce taşmamalı; Boş sayfa ekle öteki sayfalar
   kadar büyük. `↓` `↑` tam bir satır gitmeli; sürükleyerek sıralama ve boş alandan seçim eskisi gibi.
10. **Birleştir.** Görüntü / PDF birleştir'e bir PDF ve bir fotoğraf ekleyin: önizlemeler eskisinin yaklaşık iki katı ve keskin olmalı; döndür,
    taşı, çıkar ve sürükleyerek sıralama eskisi gibi. Listede aynı anda daha az dosya görünür (liste kaydırılır): sizin için uygun mu? Sıkıştır,
    Ayır ve Döndür değişmemeli.
11. **Kapatma sorusu.** İki PDF açıp pencerenin ×'ine basın: "Bu pencerede 2 sekme açık." sorusu çıkmalı, açıklamada öndeki sekmenin adı,
    düğmeler Geçerli sekme / Tüm sekmeler (mavi, `Enter`) / Vazgeç. Vazgeç (ya da `Esc`): hiçbir şey kapanmamalı. Geçerli sekme: yalnızca öndeki
    sekme kapanmalı, pencere açık kalmalı.
12. **Kaydet sorusuyla sıra.** Öndeki belgeye not ekleyip ×, Geçerli sekme: ardından kaydetme sorusu gelmeli (iki soru aynı anda görünmemeli);
    orada Vazgeç sekmeyi açık bırakmalı. Bir belgede değişiklik varken ×, Tüm sekmeler: değişmemiş sekmeler sorusuz kapanmalı, değişen belge
    sorulmalı.
13. **Bir daha sorma.** İşaretleyip Geçerli sekme'yi seçin: sonraki ×'lerde soru çıkmadan yalnızca öndeki sekme kapanmalı. Ayarlar › Açılış ve
    düzen › Pencere › Pencereyi kapatırken "Yalnızca geçerli sekmeyi kapat" göstermeli; "Her seferinde sor"a geri alın. İşaretleyip Vazgeç
    derseniz ayar değişmemeli.
14. **Alt+F4, Çıkış, iki pencere.** `Alt+F4` aynı soruyu açmalı; Dosya › Çıkış (menü çubuğu açıkken) bu soruyu sormamalı, yalnızca kaydedilmemiş
    belgeler sorulmalı. Tek sekmeli pencerede × eskisi gibi. İki PDEfe penceresi açıkken (sekmeyi dışarı sürükleyip ayırın) birinde ×: soru
    yalnızca o pencerede çıkmalı, Tüm sekmeler yalnızca o pencereyi kapatmalı; "Bir daha sorma" öbür pencerede de geçerli olmalı.
15. **Geri al listesi.** 3. sayfaya bir not koyun, 2. sayfayı döndürün, bir not daha koyun; Geri al'ın hemen sağındaki ▾'ye tıklayın:
    yaptıklarınız en yenisi üstte, sayfasıyla görünmeli ("Not ekle · s. 3", "Sayfayı döndür · s. 2"). Fareyi aşağı indirin: en üstten
    farenin satırına kadar boyanmalı, altta "3 işlemi geri al" yazmalı; tıklayınca o kadarı birden geri alınmalı. Geri alınacak bir şey yokken
    ▾ soluk olmalı; Yinele'nin yanında ok olmamalı.
16. **Klavye.** ▾'ye `Tab` ile gelip `Enter`: ilk satır boyalı açılmalı; `↓` `↑` boyamayı değiştirmeli, `Enter` uygulamalı, `Esc` kapatmalı;
    liste açıkken ok tuşları belgeyi kaydırmamalı. ▾'de `Enter`'ı basılı tutun: liste açılmalı, hiçbir adım kendiliğinden geri alınmamalı.
17. **Liste kapanması.** Liste açıkken belgeye tıklayın, başka sekmeye ya da başka programa geçin: kapanmalı. Liste açıkken `Ctrl+Z`: liste
    kapanıp bir adım geri alınmalı. Liste açıkken ×'e basıp Geçerli sekme'yi seçin: liste de kapanmalı, tuşlar belgeye gitmeli.
18. **Kaydedilmemiş değişiklikler.** Değişiklik varken sağ alttaki mavi "● Kaydedilmemiş değişiklikler"in yanında aynı renkte bir liste simgesi
    olmalı. Tıklayın: yukarı doğru başlıklı bir liste, içinde yalnızca son kayıttan sonra yaptıklarınız; boyama ("2 değişikliği geri al") ve
    satıra tıklayınca geri alma çalışmalı; Kaydet düğmesi kaydetmeli, liste kapanmalı, mavi yazı kaybolmalı. Kaydettikten sonra Geri al ile bir
    adım geri alıp yazıya tıklayın: o adım "(geri alındı)" diye soluk ve tıklanamaz olmalı.
19. **Koyu tema.** İki liste ve kapatma sorusu koyu temada okunaklı olmalı.
20. **Mac'te** (elinizde varsa): kırmızı düğme aynı soruyu sormalı, ⌘W yalnızca sekmeyi kapatmalı, ⌘Q soru sormadan (yalnızca kaydetme sorularıyla)
    çıkmalı; liste açıkken ⌘Z listeyi kapatıp bir adım geri almalı.

## 38. 0.2.3: otomatik testlerin sınayamadıkları
Ekran dışındaki ve görünmeyen masaüstündeki test örneğinde, üretilmiş örnek PDF'lerle ve %100 / %125 / %150 ölçekte sınandı (test/serit_birlesim,
geri_al_bolunmus, acilis_hizasi, panel_ilk_acilis, panel_kuyruk, kaydirma_cizim, kucuk_resim_testi; kaydırma hızı test/kaydirma_olcum ile ölçüldü).
Kurucu, gerçek PDEfe'ye dokunmayan bir deneme kopyasıyla görünmeyen masaüstünde sınandı (test/kurulum_surum, kurucu_akis). Gerçek fareyle, ekranda
gözle, gerçek UYAP belgeleriyle, gerçek kurulumla ve Mac'te denenmedi. Denemeleri belgelerin **kopyalarıyla** yapın.

Görünüm
1. **Yeni simge.** 0.2.3'ü kurduktan sonra masaüstü ve Başlat menüsündeki PDEfe kısayolu, görev çubuğu, pencere başlığı, kurucu dosyası
   (PDEfe-Setup-0.2.3.exe) ve Uygulamalar listesindeki PDEfe yeni kırmızı simgeyi göstermeli; PDEfe varsayılan PDF programıysa Gezgin'de PDF
   dosyaları da (küçük, orta ve büyük simge görünümünde ayrı ayrı bakın). Eski lacivert simge görünürse Windows'un simge önbelleği eskidir: oturumu
   kapatıp açın. Açılış ekranının sağ altındaki simge açık ve koyu temada keskin olmalı.
2. **Şeritlerin yeri ve rengi.** Sekme şeridi pencerenin en üstünde, araç çubuğu onun altında, belge araç çubuğunun altında başlamalı. Seçili sekme
   araç çubuğuyla aynı renkte (açık temada beyaz, koyu temada koyu gri) olmalı ve aralarında hiçbir çizgi olmamalı: sekme araç çubuğunun parçası gibi;
   seçili olmayan sekmeler biraz koyu gri şeritte, geride. Başka bir sekmeye ve "Yeni sekme"ye tıklayınca araç çubuğuyla birleşen sekme o olmalı.
   Kendi ekran ölçeğinizde (%125 / %150 ekranda da), iki temada yakından bakın.
3. **Şeritlere bağlı öteki yerler.** Sekme şeridinin sağındaki Açık belgeler (≡) listesi düğmenin hemen altında açılmalı. Birleştir ve Sayfaları
   düzenle iki şeridin de altında açılmalı (arkada sekmeler ve araç çubuğu görünür). Güncelleme şeridi çıkarsa araç çubuğunun altında görünmeli.
   Okuma kipinde (`Ctrl+H`) şeritler gizli, fare pencerenin üst kenarına gelince araç çubuğu açılmalı. Sekmeyi sürükleyerek sıralama, şeridin dışına
   sürükleyip yeni pencereye ayırma ve başka pencereye bırakma eskisi gibi çalışmalı.
4. **Geri al düğmesi.** Geri al ile yanındaki küçük ok tek düğme gibi görünmeli, ok eskisinden küçük. Fare Geri al'ın üstündeyken iki yarı birlikte
   açık renkle vurgulanmalı, Geri al yarısı biraz koyu, aralarında ince bir çizgi belirmeli; fare okun üstündeyken ok yarısı koyu. Oka tıklayınca
   geri alınacak adımların listesi açılmalı, liste açıkken ok basılı (koyu) görünmeli; geri alınacak bir şey yokken ikisi birlikte soluk. Pencereyi
   en dara getirin: ok yine görünmeli ve tıklanınca liste açılmalı, araç çubuğu taşmamalı.
5. **Açılış ekranı.** Bütün sekmeleri kapatın: PDF aç düğmesi eskisinden biraz küçük, sağ kenarı Araçlar'daki "Sayfaları düzenle" karosunun sağ
   kenarıyla aynı hizada olmalı. Pencereyi daraltıp genişletin, sol paneli açıp kapatın: hiza bozulmamalı; panel çok genişken karolar tek sütuna
   inince PDF aç da onlar gibi tam genişlik. Açıklaması geniş pencerede iki satıra iniyor: rahat okunuyor mu, düğme hâlâ belirgin mi? 10 son
   belgeyle, sol panel açıkken 1280×700 civarındaki bir pencerede açılış ekranı kaymamalı, sağ alttaki imza kırpılmamalı.

Sayfalar paneli
6. **İlk açılışta kapalı.** 0.2.3 kurulduktan sonraki ilk açılışta Sayfalar paneli kapalı gelmeli (önceden açık bıraktıysanız da, yalnızca bir kez).
   Paneli `F4` ya da düğmeyle açıp PDEfe'yi kapatıp yeniden açın: açık kalmalı; paneli kapatıp yeniden açın: kapalı kalmalı. Pencereye ayır ile
   açılan yeni pencerede de aynı durum görülmeli. Ayarlar › Varsayılanlara dön paneli açıp kapatmamalı.
7. **Hızlı gezinme.** Yüzlerce sayfalık bir belgede Sayfalar panelini açın, panelin kaydırma çubuğunu hızla aşağı sürükleyip bırakın: bırakılan
   yerdeki küçük resimler hemen gelmeli, boş kare kalmamalı. Aynısını paneli tutamaçla iki katına genişletip deneyin. Belgenin kendisini hızla
   kaydırın (tekerlek, kaydırma çubuğu, sayfa numarası yazıp atlama): durunca paneldeki görünen küçük resimlerin hepsi gelmiş olmalı.
8. **Taranmış belge.** Taranmış bir UYAP evrakında paneldeki, Sayfaları düzenle'deki ve `Ctrl+Tab` (basılı tutunca çıkan) seçicideki küçük resimler
   eskisi kadar net olmalı (leke, bulanıklık yok) ve daha çabuk gelmeli. Metin, logo, kaşe ya da karekod içeren evrakta küçük resimlerdeki yazı
   eskisi gibi keskin olmalı.
9. **Panelin geri kalanı.** Paneli kapatıp açın, İçindekiler / Yorumlar'a geçip Sayfalar'a dönün, belge sekmeleri arasında geçin, bir belgeyi
   kapatın: hiçbir küçük resim boş kalmamalı. Bir sayfaya not ya da vurgu ekleyip kaydedin: paneldeki küçük resim notu göstermeli.

Kaydırma
10. **Logolu belge.** Logolu, kaşeli ya da karekodlu bir UYAP belgesinde (örneğin tebligat) fare tekerleğiyle hızla aşağı ve yukarı kaydırın, Page
    Down ile sayfa sayfa inin, sağdaki kaydırma çubuğunu sürükleyin: sayfalar ekrana net girmeli; kaydırma durduktan sonra yarım saniye içinde
    netleşme görülmemeli.
11. **Yüksek yakınlaştırma.** Bir belgeyi %600'e yakınlaştırıp tekerlekle aşağı ve yukarı kaydırın: kaydırırken sayfa beyaz kalmamalı (kenarda bir
    an ince beyaz şerit görülebilir; eskiden kaydırma durana dek ekranın çoğu beyazdı). `Ctrl`+tekerlekle yakınlaştırıp uzaklaştırın: eskisi gibi
    akıcı olmalı, durunca sayfa net çizilmeli.
12. **Sayfaya atlama.** Sayfa kutusuna uzak bir sayfa numarası yazın ya da bir yer imine tıklayın: sayfa önce bulanık sonra net değil, doğrudan net
    gelmeli (özellikle evdeki 2560 px, %125 ekranda).
13. **Form alanlı belge.** Doldurulabilir (form alanlı) bir PDF'i %400'ün üstüne yakınlaştırıp tekerlekle hızla kaydırın: kaydırma durunca PDEfe
    takılmamalı; Sayfalar panelinin küçük resimleri, arama ve Kaydet beklemeden çalışmalı; form alanları yerinde ve okunur kalmalı.
14. **Koyu sayfa ve taranmış belge.** Koyu sayfa kipinde ve taranmış bir belgede kaydırın: sayfalar eskisi gibi doğru renkte ve net girmeli; taranmış
    sayfada yazı seçme çalışmalı.
15. **Bellek.** Üç belge açıkken Görev Yöneticisi'nde PDEfe'nin belleğine bakın: 0.2.2'deki düzeyde ya da biraz altında olmalı (ev bilgisayarında
    test örneğinde ölçülen ~440–480 MB).

Birleştir
16. **Önizleme.** Görüntü / PDF birleştir'e birkaç PDF ve fotoğraf ekleyin: önizlemeler eskisinden büyük (150 px) ve keskin olmalı, %125 ekranda da;
    ad, özet, Kalite, Sayfa ve satırdaki düğmeler yerinde ve hizalı. Listede aynı anda görünen dosya biraz azaldı (1536×770 pencerede yaklaşık 1,8
    satır, önce 2,1; liste kaydırılır): sıkışık bulursanız söyleyin.

Kurucu (PDEfe 0.2.2 kuruluyken, kurucu dosyasına çift tıklayarak)
17. **Eski sürüm kuruluyken.** İlk sayfa "PDEfe zaten kurulu" olmalı ve "Bilgisayarınızda PDEfe 0.2.2 kurulu. Bu kurucu daha yeni olan 0.2.3
    sürümünü kurar." yazmalı. Üç seçenek: Güncelle (önerilen, seçili gelir; açıklaması "Ayarlarınız, masaüstü kısayolu ve kurulum klasörü korunur;
    doğrudan kurulur."), Seçenekleri değiştirerek kur, Kaldır. Kaldır'ı seçince sağ alttaki düğme "Kaldır" yazmalı, Güncelle'ye dönünce "Güncelle".
    Güncelle'ye basınca lisans, klasör ve Ek görevler sayfaları gelmeden kurulum başlamalı; masaüstü kısayolunuz önceki durumunda kalmalı
    (silmişseniz geri gelmemeli). Bir sonraki maddeyi de bu kurulumda deneyin.
18. **PDEfe açıkken.** Önce PDEfe kapalıyken kurucuyu açın: "Dikkat: PDEfe şu anda açık" uyarısı olmamalı ve ilk sayfa çabuk açılmalı (Vazgeç ile
    kapatın). Sonra PDEfe'de bir belgede kaydedilmemiş değişiklik varken kurucuyu açın: uyarı görünmeli; üç seçenek, açıklamaları ve uyarı birbirine
    değmeden sayfaya sığmalı. Güncelle'ye basınca "PDEfe hâlâ açık" sorusu (Tamam / İptal) gelmeli; İptal'de sayfada kalınmalı. Belgeyi kaydedip
    PDEfe'yi kapatın, sonra Güncelle'ye yeniden basın.
19. **Görev çubuğu sabitlemesi.** PDEfe görev çubuğuna sabitliyse Güncelle'den sonra sabit duruyor mu? Sınanamadı: elle çalıştırılan kurucuda eski
    kaldırıcı Başlat kısayolunu kaldırırken sabitlemeyi de kaldırabilir (0.2.2'deki elle kurulumda da böyleydi). Sonucu söyleyin.
20. **Aynı sürüm ve Kaldır.** 0.2.3 kuruluyken aynı kurucuyu yeniden açın: Onar ve Kaldır seçenekleri çıkmalı. Kaldır'a basınca PDEfe'nin kendi
    kaldırıcısı açılmalı ve kurucu kapanmalı (gerçekten kaldırmak istemiyorsanız kaldırıcının ilk sayfasında Vazgeç'e basın). Ayarlarınız silinmez.
21. **Kurulu değilken.** PDEfe'yi kaldırdığınız bir zamanda kurucu eskisi gibi sihirbazla gelmeli: lisans → klasör → Ek görevler → kurulum → bitiş;
    "Bu uygulama kimler için kurulsun?" sayfası olmamalı. Lisans sayfasında "< Geri" görünmemeli, sağ alttaki düğme "Kabul et" yazmalı ve yazı
    düğmenin kenarlarına değmemeli, üstteki metin "'Kabul et' düğmesine basın" demeli. Klasör sayfasının alt yazısı "PDEfe programını kurmak
    istediğiniz dizini seçiniz." olmalı. Ek görevler sayfası (Seçenekleri değiştirerek kur'dan gelince de) "… işaretleyin, sonra Kur'a basın."
    demeli, düğme "Kur".
22. **Kaldırıcının yazıları.** PDEfe'yi kaldırdığınızda kaldırıcının ilk sayfasında "…PDEfe programının kaldırılması boyunca rehberlik edecektir" ve
    "Kaldırma işlemini başlatmadan önce çalışan diğer programları…" yazmalı ("kadırılımı" yazmamalı); Kaldırılıyor sayfasında "Lütfen PDEfe
    programı…", bitişte "Sihirbazı kapatmak için 'Bitir'e basınız.".
23. **Uygulama içinden güncelleme.** 0.2.3'ten sonraki ilk güncellemede şeritteki "Kur ve yeniden başlat" eskisi gibi sessiz olmalı: hiçbir pencere
    açılmadan kurulmalı, PDEfe yeniden açılmalı. (Not: kurulu sürüm sayfası yalnızca 0.2.3 ve sonraki kurucularda var; 0.2.2 ya da daha eski bir
    kurucu açılırsa eskisi gibi sormadan kurar.)

Öteki
24. **Mac'te** (elinizde varsa): DMG'de ve Dock'ta yeni simge; sekme şeridi üstte, araç çubuğu altında, seçili sekmeyle araç çubuğu arasında çizgi
    yok; açılış ekranında PDF aç'ın hizası; Sayfalar panelinin ilk açılışta kapalı gelmesi.
25. **README.** GitHub'da (gönderildikten sonra) yeni ekran görüntüleri, koyu temadaki görüntüler (ana görünüm, açılış ekranı, Birleştir) ve
    kurucunun görüntüsü görünmeli ve anlattıkları bölümün altında olmalı.

## 39. 0.2.4: otomatik testlerin sınayamadıkları
Ekran dışındaki test örneğinde üretilmiş örnek PDF'lerle (yan, ters ve yazısız taranmış sayfa) ve sizin bildirdiğiniz yan taranmış belgenin bir
**kopyasıyla** sınandı. Gerçek fareyle ekranda, kendi belgelerinizle, Mac'te ve kurulu sürümde denenmedi. Denemeleri belgelerin kopyalarıyla yapın.

1. **Bildirdiğiniz belge.** Yan taranmış belgeyi (kopyasını) PDEfe'de açın: sayfa eskisi gibi yan durmalı, ekranda hiçbir şey dönmemeli. Bir
   saniye kadar sonra yazının üstünden fareyle sürükleyin: seçim yazıyla birlikte dikey görünmeli. Başlığı seçerken yazının okunduğu yönde, aşağıdan
   yukarı sürükleyin. Kopyalayıp Word'e ya da UDF'ye yapıştırın: başlık düz ve doğru yazılmış gelmeli. Sekmenin adında kaydedilmemiş değişiklik
   işareti çıkmamalı.
2. **Tablonun hücreleri.** Aynı belgede bir hücreyi (ad, adres, tutar) seçip kopyalayın: hücredeki satırlar doğru sırayla gelmeli. Bütün sayfayı
   (`Ctrl+A`) kopyalayıp yapıştırın: tablonun yazısı eksiksiz gelmeli (sütunlar ayrı satırlar olur; tablo düzeni korunmaz).
3. **Ekranda döndürünce.** Sayfayı `Ctrl+R` ile bir kez döndürün: yazı dik okunur hâle gelmeli, seçim yine yazının üstünde olmalı ve kopya aynı
   gelmeli. Geri alın (`Ctrl+Z`).
4. **Ters taranmış belge.** Elinizde ters (baş aşağı) taranmış bir belge varsa onu da deneyin: yazı seçilebilmeli, kopya düz gelmeli.
5. **Olağan taranmış belgeler.** Dik taranmış bir UYAP evrakında yazı seçme eskisi gibi çalışmalı ve eskisi kadar çabuk gelmeli. Fotoğraf ya da
   yalnızca imza / kaşe olan bir sayfada yazı çıkmamalı (ya da eskisi gibi yalnızca kaşedeki yazı).
6. **Çevrim içi hizmetten geçen belge.** Hizmetin yazı katmanı eklediği dosyada seçim o katmandan gelir; katman yanlışsa kopya da yanlıştır
   (PDEfe o katmanı değiştirmez). Böyle bir belgede asıl dosyayı PDEfe'de açmanız daha doğru sonuç verir.
