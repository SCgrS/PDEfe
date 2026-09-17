# Sürüm notları

Biçim: her sürüm için `## x.y.z — YYYY-AA-GG` başlığı; altındaki maddeler GitHub sürüm sayfasına
otomatik olarak kopyalanır (`.github/workflows/yayim.yml`).

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
