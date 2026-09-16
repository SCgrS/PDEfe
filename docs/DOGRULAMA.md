# PDEfe — Kullanıcı doğrulama listesi

Bu liste, PDEfe'nin otomatik testlerle sınanamayan (referans okuyucu, gerçek yazıcı, Gezgin, Windows
varsayılan uygulama sayfası) davranışlarını kullanıcının kendi bilgisayarında denemesi içindir.
Test dosyaları `test/cikti` altında üretilir (`node test/surucu.mjs betik test/senaryo4.mjs` vb.) ya da
aşağıdaki adımlarla PDEfe'de oluşturulur.

## 1. PDEfe notlarının referans okuyucuda görünmesi
1. PDEfe'de `Desktop\PDF DENEME\DENEME PDF (2).pdf` dosyasının bir kopyasını açın.
2. Bir paragrafı seçip mini çubuktan **sarı vurgu** ekleyin; vurguya çift tıklayıp balona "Vurgu notu ğüşİ" yazın.
3. Araç çubuğundan **Yapışkan not** seçip sayfada boş bir yere tıklayın; "Yapışkan not: şğıİçöü" yazın;
   balondaki yanıt kutusuna "Yanıt ğüş" yazıp Enter'a basın.
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
yatay sayfa döndürülmüş olmalı. "Notları yazdır" kapalıyken notlar çıkmamalı.

## 7. Kurulum ve varsayılan uygulama
1. `release/PDEfe-Setup.exe`'yi çalıştırın (SmartScreen: Daha fazla bilgi → Yine de çalıştır). Sihirbaz Türkçe olmalı.
2. Kurulumdan sonra Gezgin'de bir PDF'e sağ tık → Birlikte aç listesinde PDEfe görünmeli.
3. Ayarlar → Dosya → **Varsayılan PDF görüntüleyici yap**: Windows Varsayılan Uygulamalar sayfası PDEfe ile açılmalı;
   .pdf için PDEfe seçildikten sonra çift tık PDEfe'yi açmalı.
4. Windows Uygulamalar listesinde "PDEfe" ve kaldırıcı görünmeli; kaldırınca ilişkilendirme silinmeli.

## 8. Güncelleme
GitHub'da yeni sürüm etiketi (`v0.1.1`) yayımlandıktan sonra eski sürümü açın: 8 saniye içinde üstte
"PDEfe 0.1.1 hazır — Güncellemeyi yükle" şeridi çıkmalı; yükleme → yeniden başlat → açık sekmeler geri gelmeli.
