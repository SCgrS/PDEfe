# PDEfe — Kullanıcı doğrulama listesi

Bu liste, PDEfe'nin otomatik testlerle sınanamayan (referans okuyucu, gerçek yazıcı, Gezgin, Windows
varsayılan uygulama sayfası) davranışlarını kullanıcının kendi bilgisayarında denemesi içindir.
Test dosyaları `test/cikti` altında üretilir (`node test/surucu.mjs betik test/senaryo4.mjs` vb.) ya da
aşağıdaki adımlarla PDEfe'de oluşturulur.

## 1. PDEfe notlarının referans okuyucuda görünmesi
1. PDEfe'de `Desktop\PDF DENEME\DENEME PDF (2).pdf` dosyasının bir kopyasını açın. Aşağıdaki adımları belge
   açılır açılmaz, sayfa düzenini ya da yakınlaştırmayı değiştirmeden yapın (0.1.0'da ilk açılışta çalışmıyordu).
2. Bir paragrafı seçin: mini çubuk seçimin altında çıkmalı ve fare hareket edince yerinden kıpırdamamalı.
   Mini çubuktan **sarı vurgu** ekleyin; vurguya çift tıklayıp balona "Vurgu notu ğüşİ" yazın.
   - Başka bir satırı seçip boş bir yere tıklayın: seçim ve mini çubuk kapanmalı.
   - Bir satırı araç çubuğundaki **Vurgu** düğmesiyle, bir başkasını sağ tık › **Vurgula** ile vurgulayın.
3. Araç çubuğundan **Yapışkan not** seçip sayfada boş bir yere tıklayın; "Yapışkan not: şğıİçöü" yazın;
   balondaki yanıt kutusuna "Yanıt ğüş" yazıp Enter'a basın. Boş bir yere sağ tık › **Not ekle** de not açmalı.
4. **Yazı** aracıyla sayfada bir kutu çizin; "Serbest metin: Şişli, İğneada, Çorum — ğüşıöç" yazın;
   biçim çubuğundan Times New Roman, 13 pt, kalın, altı çizili, sarı arka plan, kenarlık seçin; dışarı tıklayın.
5. **Ctrl+S** ile kaydedin (durum çubuğunda "Kaydedildi" görünür).
6. Aynı dosyayı **referans okuyucuda** açın. Beklenen:
   - Vurgu aynı satırlarda, aynı renkte; Yorumlar panelinde yazar adı ve "Vurgu notu ğüşİ" metni.
   - Yapışkan not simgesi (referans okuyucunun kendi simgesi) aynı yerde; içinde metin ve altında yanıt (yazar/tarih ile).
   - Serbest metin kutusu aynı yerde; Türkçe harfler eksiksiz; kalın, altı çizili, sarı zemin, kenarlık.
   - Referans okuyucuda nota yanıt yazıp kaydedin; PDEfe'de yeniden açınca yanıt Yorumlar panelinde ve balonda görünmeli.
7. Referans okuyucuda eklenmiş notlu bir PDF'i (DENEME PDF (2).pdf'in özgün hali) PDEfe'de açın: iki vurgu, notu olan
   vurgunun balonunda "NOT DENEMESİ" ve yazar "Deneme Yazar" görünmeli.

## 2. Döndürülmüş sayfa
`test/cikti/donuk-not.pdf` (sayfası 90° döndürülmüş kanun PDF'i): PDEfe'nin yazısı referans okuyucuda de dik okunmalı
(PyMuPDF'in referans yazısı yan durur; bu beklenen fark).

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
GitHub'da yeni sürüm etiketi (`v0.1.1`) yayımlandıktan sonra eski sürümü açın: 8 saniye içinde üstte
"PDEfe 0.1.1 hazır — Güncellemeyi yükle" şeridi çıkmalı; yükleme → yeniden başlat → PDEfe yeni sürümle
açılmalı (Ayarlar › Hakkında'da 0.1.1). Önceki sekmelerin geri gelmemesi beklenen davranıştır.

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

## 10. PDF küçült: üzerine yaz yedeği
Araçlar › PDF küçült: kartlar "Aşırı / İdeal / Düşük sıkıştırma" olmalı ("Özel" yok). **Üzerine yaz**
işaretleyip küçültün: özgün dosyanın yedeği aynı klasörde `<ad> (yedek).pdf` adıyla bulunmalı ve özgün
boyutta olmalı; Gezgin'de görünmeli.

## 11. Metin, görüntü kalitesi ve sayfa numarası
- Bir kanun PDF'inden birkaç paragraf seçip kopyalayın, UYAP Doküman Editörü'ne ve Word'e yapıştırın:
  paragraflar ayrı olmalı, aralarında boş paragraf oluşmamalı.
- %100 ve %125 yakınlaştırmada harfler keskin görünmeli (bulanık değil); fotoğraflı ya da taranmış bir
  PDF'i büyütünce görseller pikselli değil yumuşak görünmeli.
- Görünüm › Tek sayfa ve İki sayfa düzeninde (kaydırma kapalı) sayfa değiştirin: sayfa numarası kutusu her
  geçişte güncellenmeli; kutuya tıklayıp odakta bırakınca da güncellenmeli. Kaydırma aç/kapa ve düzen seçimi
  açık bütün sekmelere uygulanmalı; iki sayfaya geçince yakınlaştırma "Sayfayı sığdır"a dönmeli.
- Koyu modda ("sayfayı koyulaştır" açık) hızla sayfa geçin: çizilmemiş sayfalar beyaz parlamamalı, koyu yer
  tutucu görünmeli.
- Açık belgeler listesindeki **Tüm belgelerde ara** kutusuna bir sözcük yazın: her belgenin yanında eşleşme
  sayısı çıkmalı; Enter'a basınca Bul kutusu "tüm sekmeler" kapsamında açılmalı.
