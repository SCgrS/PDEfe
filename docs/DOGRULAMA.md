# PDEfe — Kullanıcı doğrulama listesi

Bu liste, PDEfe'nin otomatik testlerle sınanamayan (referans okuyucu, gerçek yazıcı, Gezgin, Windows
varsayılan uygulama sayfası) davranışlarını kullanıcının kendi bilgisayarında denemesi içindir.
Test dosyaları `test/cikti` altında üretilir (`node test/surucu.mjs betik test/senaryo4.mjs` vb.) ya da
aşağıdaki adımlarla PDEfe'de oluşturulur.

## 1. PDEfe notlarının referans okuyucuda görünmesi
1. PDEfe'de `Desktop\PDF DENEME\DENEME PDF (2).pdf` dosyasının bir kopyasını açın. Aşağıdaki adımları belge
   açılır açılmaz, sayfa düzenini ya da yakınlaştırmayı değiştirmeden yapın (0.1.0'da ilk açılışta çalışmıyordu).
2. Bir paragrafı seçin: mini çubuk seçimin altında çıkmalı ve fare hareket edince yerinden kıpırdamamalı.
   Mini çubuktan varsayılan **sarı vurgu** (#FFD100, %40) ekleyin: yazı siyah kalmalı, yalnızca zemin sararmalı.
   - Başka bir satırı seçip mini çubuktan **Not ekle**'ye basın; açılan kutuya "Metin notu ğüşİ" yazın. Satır
     vurgulanmalı, ilk satırın bittiği yerde not simgesi çıkmalı, kutunun başlığında "Metin notu" yazmalı.
   - Başka bir satırı seçip boş bir yere tıklayın: seçim ve mini çubuk kapanmalı.
   - Bir satırı araç çubuğundaki **Vurgu** düğmesiyle, bir başkasını sağ tık › **Vurgula** ile vurgulayın.
3. Metin seçili değilken araç çubuğundan **Yapışkan not** seçip sayfada boş bir yere tıklayın; "Yapışkan not:
   şğıİçöü" yazın. Not kutusunda yanıt kutusu olmamalı. Boş bir yere sağ tık › **Not ekle** de not açmalı.
4. **Yazı** aracıyla sayfada bir kutu çizin; "Serbest metin: Şişli, İğneada, Çorum — ğüşıöç" yazın;
   biçim çubuğundan Times New Roman, 13 pt, kenarlık seçin; bir sözcüğü seçip **Kalın**, başka bir sözcüğü seçip
   **Altı çizili** yapın, **Dolgu rengi** ile sarı zemin verin; dışarı tıklayın.
5. **Ctrl+S** ile kaydedin (durum çubuğunda "Kaydedildi" görünür).
6. Aynı dosyayı **referans okuyucuda** açın. Beklenen:
   - Vurgular aynı satırlarda, aynı renkte; yazı rengi değişmemiş.
   - Metin notu Yorumlar panelinde "Metinle ilgili yorum" türünde, yazar adı ve "Metin notu ğüşİ" metniyle.
   - Yapışkan not simgesi (referans okuyucunun kendi simgesi) aynı yerde; içinde metin.
   - Serbest metin kutusu aynı yerde; Türkçe harfler eksiksiz; yalnızca seçilen sözcükler kalın / altı çizili,
     sarı zemin, kenarlık; satırlar PDEfe'deki yerlerden kırılmış, son satır kesik değil.
   - Referans okuyucuda nota yanıt yazıp kaydedin; PDEfe'de yeniden açınca yanıt balonda salt okunur görünmeli (PDEfe'de
     yanıt yazılamaz), Yorumlar panelinde "1 yanıt" yazmalı.
7. Referans okuyucuda eklenmiş notlu bir PDF'i (DENEME PDF (2).pdf'in özgün hali) PDEfe'de açın: iki vurgu, notu olan
   vurgunun satır bitişinde not simgesi; üzerine gelince tıklamadan açılan kutuda "Metin notu" başlığı,
   "NOT DENEMESİ" ve yazar "Deneme Yazar" görünmeli.

## 2. Döndürülmüş sayfa
`test/cikti/donuk-not.pdf` (sayfası 90° döndürülmüş kanun PDF'i): PDEfe'nin yazısı referans okuyucuda de dik okunmalı
(PyMuPDF'in referans yazısı yan durur; bu beklenen fark). Yazılar PDEfe'de de referans okuyucudaki yönüyle görünmeli;
0.1.1'in döndürülmüş sayfaya yazdığı yazıyı PDEfe'de düzenleyip kaydedince referans okuyucudaki yönü değişmemeli.

## 3. Kilitli dosya
Bir PDF'i referans okuyucuda açık tutarken PDEfe'de aynı dosyaya not ekleyip Ctrl+S basın: "Dosya başka bir
programda açık olabilir" uyarısı ve **Farklı kaydet** seçeneği çıkmalı.

## 4. Gezgin ve tek örnek
- PDEfe açıkken Gezgin'de bir PDF'e çift tıklayın (ya da `PDEfe.exe dosya.pdf`): aynı pencerede yeni sekme
  açılmalı, ikinci pencere açılmamalı. Zaten açık bir dosya ise o sekmeye geçmeli.
- Gezgin'den birkaç PDF'i pencereye sürükleyin: her biri yeni sekmede açılmalı.

## 5. Paylaş
Araç çubuğundaki **Paylaş** düğmesine basın; sonra Gezgin'de bir klasöre, Outlook'ta yeni iletiye ya da
WhatsApp'a **Ctrl+V** yapın: PDF dosyası yapıştırılmalı.

## 6. Yazdırma
Ctrl+P → seçenekler → Yazdır: Windows yazdırma diyaloğu açılmalı; kâğıtta Türkçe karakterler ve notlar doğru,
yatay sayfa döndürülmüş olmalı. "Notları yazdır" kutusu varsayılan olarak boş gelmeli ve notlar çıkmamalı;
kutu işaretlenince notlar basılmalı.

## 7. Kurulum ve varsayılan uygulama
1. `release/PDEfe-Setup.exe`'yi çalıştırın (SmartScreen: Daha fazla bilgi → Yine de çalıştır). Sihirbaz Türkçe olmalı.
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
3. `Ctrl+Shift++` → **Tüm PDF**: bütün sayfalar dönmeli. Sekmeyi kapatmaya çalışın: kaydetme sorusu çıkmalı;
   **Kaydet** deyip dosyayı referans okuyucuda açın, sayfalar dönmüş olmalı.
4. **Seçeneğimi hatırla** ile bir seçim yapın: sonraki döndürmede soru çıkmamalı. Ayarlar › Görünüm'deki döndürme
   seçeneği yeniden sormaya alınınca soru geri gelmeli.
5. Değişiklik yapılmış bir sekmeden başka sekmeye geçin: soru çıkmamalı, değişiklik sekmede kalmalı.
6. **E-imzalı belge** (UYAP'tan indirilmiş imzalı bir PDF'in kopyası): bir sayfayı döndürüp kaydedin, dosyayı
   Referans okuyucuda açın. İmzalar panelinde imza kaybolmamalı; imzalı sürüm doğrulanabilir kalmalı (referans okuyucu
   "imzadan sonra değişiklik yapıldı" diyebilir, bu beklenir). Ekli dosyası olan PDF'lerde ekler durmalı.
7. Döndürüp kaydettiğiniz dosyayı kapatıp PDEfe'de yeniden açın: sayfa dönmüş ve tam (kesilmeden) görünmeli;
   o sayfada metin seçimi ve vurgu, yazının tam üstüne düşmeli.

## 10. PDF küçült: yeni belge ve üzerine yazma
Araç çubuğundaki **Araçlar** › PDF küçült: kartlar "Aşırı / İdeal / Düşük sıkıştırma" olmalı ("Özel", DPI / JPEG
yazısı yok); kaydetme seçimi varsayılan olarak **Yeni belge olarak kaydet**.
1. Yeni belge: dosya Masaüstü'ne `<ad> (küçültülmüş).pdf` adıyla kaydedilmeli, özgün dosya değişmemeli.
2. **Üzerine yaz**: dosya küçülmeli; klasörde `(yedek).pdf` ya da geçici dosya kalmamalı; sekme aynı sayfada
   yeniden açılmalı.
3. Dosyayı referans okuyucuda açık tutup **Üzerine yaz** ile yeniden deneyin: özgün dosya değişmemeli, dosyanın
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
1. **referans okuyucu ile aynı büyüklükte karşılaştırma.** referans okuyucunun %100'ü (110 ppi çözünürlük ayarıyla) PDEfe'nin
   %100'ünden yaklaşık %13 büyüktür; %100'leri yan yana koymak yanıltır. Aynı belgeyi PDEfe'de %115'te, referans okuyucuda
   %100'de açıp aynı yeri karşılaştırın: UYAP üst yazısının başlığı ve tablo çizgileri, UYAP karekodu, PTT dökümü
   (JPEG sayfa) ve bir tarama. Harfler aynı netlikte, çizgiler gri iki satır değil tek piksel, karekod keskin
   olmalı. Taranmış bir belgeyi %3200'e yakınlaştırın: yazı görünmeli ve beklemeden çizilmeli.
2. **Döndürme kısayolları.** Çok sayfalı bir PDF'te `Ctrl+Shift++` ve `Ctrl+Shift+−` basın (ana tuşlar ve
   sayısal tuş takımı): "Geçerli sayfa / Tüm PDF / Vazgeç" sorusu çıkmalı, sayfa saat yönünde / tersine dönmeli.
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
5. **Metin notu referans okuyucuda.** 1. bölümdeki metin notunu referans okuyucuda açın: vurgu aynı yerde; Yorumlar
   panelinde "Metinle ilgili yorum", yazar ve not metni; vurguya tıklayınca notun açılır penceresi. Referans okuyucuda
   notun metnini düzenleyip kaydedin; sonra PDEfe'de aynı notun metnini değiştirip kaydedin ve dosyayı yeniden
   Referans okuyucuda açın: PDEfe'de yazılan metin görünmeli, referans okuyucudaki eski metin değil.
6. **Biçimli yazı referans okuyucuda.** 1. bölümdeki yazı kutusunu referans okuyucuda açın: yalnızca seçilen sözcükler kalın / altı
   çizili, satırlar PDEfe'deki yerlerden kırılmış. **Dolgusuz** yapılmış bir kutu referans okuyucuda saydam görünmeli.
   Referans okuyucuda yazıya bir sözcük ekleyip kaydedin; PDEfe'de yeniden açıp çift tıklayınca biçimler ve kenarlık rengi
   korunmalı.
7. **Tema simgesi.** Koyu temada araç çubuğundaki tema düğmesinde kalın, içi dolu ay; açık temaya geçince dolu
   güneş görünmeli.

## 13. 0.1.4: otomatik testlerin sınayamadıkları
Testler ekran dışındaki bir test örneğinde yapıldı; referans okuyucu yalnızca önizleme motoruyla (`test/pdf_onizleme.ps1`, ekrana pencere
açmadan) denetlendi, Windows renk seçicisi ve gerçek klavyenin menü kısayolları kullanılmadı.
1. **Yazı kalınlığı.** Aynı UYAP tebligatını PDEfe'de ve referans okuyucuda aynı büyüklükte yan yana açın (referans okuyucu %100 ≈ PDEfe %115): kalın
   satırlar ("Duruşma Günü …") referans okuyucudaki kadar ince, küçük yazılarda renkli kenar yok. Beğenilmezse Ayarlar › Görünüm › Yazı çizimi ›
   "Windows ClearType" seçip belgeyi yeniden açın.
2. **Döndürülmüş sayfa.** Bir sayfayı Döndür ile yana çevirip %85'e uzaklaştırın: harfler düz sayfadaki gibi olmalı (ince, düzensiz değil).
3. **referans okuyucuda notlar.** PDEfe'de bir belgeye vurgu ve not ekleyin, 2 saniye bekleyin (durum çubuğunda "Otomatik kaydedildi"), dosyayı
   Referans okuyucuda açın: notlar görünmeli. Dosya referans okuyucuda açıkken PDEfe'de not ekleyin: pencere açılmamalı, bir kez "otomatik kaydedilemedi"
   bildirimi çıkmalı; referans okuyucuyu kapatıp `Ctrl+S` ile kaydedince referans okuyucuda yeniden açınca notlar görünmeli.
4. **Vurgu çubuğu.** Bir vurguya tıklayın: altında renkler, Not ekle ve Kaldır çıkmalı. Rengi değiştirin, `Ctrl+Z` ile geri alın; Not ekle
   ile not yazın; Kaldır ile silin. Referans okuyucuda eklenmiş bir vurguda da deneyin, kaydedip referans okuyucuda rengin değiştiğine bakın.
5. **Koyu mod.** Koyu tema ve "Sayfayı da koyulaştır" açıkken Yazı aracıyla kutu çizip yazın: yazı beyaz görünmeli; dosyayı referans okuyucuda
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
1. **Yazı netliği.** Aynı UYAP tebligatını PDEfe'de ve referans okuyucuda aynı büyüklükte yan yana açın (referans okuyucu %100 ≈ PDEfe %115): kutudaki küçük
   "Geçerli bir özrünüz olmadan…" paragrafı ve Arial satırları referans okuyucudaki kadar koyu ve keskin, kalın satırlar ("Duruşma Günü …") referans okuyucudaki
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
