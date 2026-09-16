# Sürüm notları

Biçim: her sürüm için `## x.y.z — YYYY-AA-GG` başlığı; altındaki maddeler GitHub sürüm sayfasına
otomatik olarak kopyalanır (`.github/workflows/yayim.yml`).

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
