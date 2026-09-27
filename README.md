# PDEfe

### [⬇ PDEfe-Setup.exe indir](https://github.com/SCgrS/PDEfe/releases/latest/download/PDEfe-Setup.exe)

Windows 11 (ve Windows 10) için Türkçe, sekmeli **PDF görüntüleyici ve düzenleyici**. Hukukçuların ve
her gün onlarca PDF açan herkesin işini görmek için yazıldı: belgeler sekmelerde açılır, metin kopyalandığında
satır sonları ve tireler temizlenir, arama Türkçe karakterleri doğru tanır, eklenen notlar başka PDF okuyucularında
ve UYAP'ta aynen görünür.

Geliştirici: [x.com/CgrShn](https://x.com/CgrShn)

## Ne yapar

- **Sekmeler.** Birden çok PDF tek pencerede; sekmeler aynı ve dar genişliktedir ("ustyazi (85).pdf" gibi adlar tam
  görünür, uzun ad üç noktayla kısalır, tam ad ve yol ipucunda) ve sürüklenerek sıralanır. `Ctrl+Tab` basılı tutulunca
  son kullanılan sırayla sekme seçici açılır; `Ctrl+PageUp` / `Ctrl+PageDown` ya da `Ctrl+←` / `Ctrl+→` önceki / sonraki
  sekmeye, `Ctrl+1` – `Ctrl+9` doğrudan sekmeye gider. Sekme çubuğundaki **+** (ya da `Ctrl+T`) açılış sayfasını yeni bir
  sekmede açar; oradan açılan belge o sekmenin yerine açılır. Bir belge yeniden
  açıldığında kalınan sayfadan devam edilir (Ayarlar › Açılış ve düzen'den kapatılabilir). Sekme çubuğundaki ◀ ▶ ilk ve
  son sekmede durur. Pencere kapatılırken değişikliği olmayan sekmeler hemen kapanır; kaydedilmemiş değişikliği olan her
  belge için "Çıkmadan önce kaydetmek ister misiniz?" sorulur (Kaydet / Kaydetme / Vazgeç; Vazgeç'te o belgeler açık kalır).
  Açık bir araç penceresinde kaydedilmemiş iş varsa önce onun sorusu gelir.
- **Keskin görüntü.** Düz ve kalın yazılar Windows'un ClearType çizimiyle keskin çizilir; kalın yazılar fazla koyulaşmaz
  (Windows'un bazı kalın yazı tiplerini küçük boyutta fazla koyu çizmesi ölçülüp düzeltilir); döndürülmüş sayfada harfler
  bozulmaz. Gömülü olmayan Times, Arial ve Courier yazıları Windows'un Times New Roman, Arial ve Courier New yazı tipleriyle
  çizilir (Ayarlar › Görünüm › Yazı çizimi: "Dengeli" ya da "Windows ClearType"). Görseller, karekodlar ve tablo
  çizgileri keskin çizilir; taranmış belgeler çok yakınlaştırıldığında da net ve hızlıdır.
- **Temiz kopyalama.** Seçilen metin panoya yapıştırıldığında paragrafın satırları birleştirilir (her satırı ayrı
  yazılmış mevzuat PDF'lerinde de), satır sonlarındaki tireler birleştirilir, girintiler korunur, paragraflar tek satır
  sonuyla ayrılır (UYAP Doküman Editörü'nde ve Word'de paragraf aralarına fazladan boş paragraf girmez; girintili
  paragrafa yapıştırınca satırlar dağılmaz), bozuk glifler düzeltilir. Belgede gerçekten boş satır olan yerler (kanunlarda
  bölüm ve madde başlıklarından önceki boşluk, sayfa sonuna denk gelenler dahil) bir boş paragraf olarak gelir; paragraf
  aralığı boş satır sayılmaz.
- **Türkçe arama.** `Ctrl+F` ile bul: İ/ı ve I/ı ayrımı doğru, tam sözcük seçeneği, yer imlerinde ve
  yorumlarda arama, tüm açık sekmelerde arama. Açık belgeler listesindeki **Tüm belgelerde ara** kutusu her
  belgedeki eşleşme sayısını gösterir. Word 2010'un bozuk Türkçe kodlaması (Ġ→İ, ġ→Ş, Ģ→ş) hem
  görünen metinde hem aramada düzeltilir.
- **Standart PDF notları.** Vurgu (yazının rengi değişmez; varsayılan renk PDF okuyucularında yaygın olan sarı; metin seçince
  çıkan çubukta tek tıkla varsayılan renkle vurgulama, ▾ ile başka renk: seçilen renk değiştirilene dek varsayılan olur; vurguya
  tıklayınca açılan çubuktan renk değiştirme, not ekleme ve kaldırma), seçili metne not
  ("Metinle ilgili yorum" türünde notlu vurgu; üzerine gelince tıklamadan görünür), not ve serbest
  yazı ekleme; taşıma, düzenleme, silme. Nota yanıt yazılmaz; başka programlarda yazılmış yanıtlar salt okunur gösterilir.
  Yazılarda seçili sözcükler kalın, italik ya da altı çizili yapılır; yazılar Türkçe karakterli Windows fontuyla
  (Segoe UI, Arial, Times, Calibri) belgeye gömülür, başka PDF okuyucularında ve UYAP'ta aynı görünür. Notlar `Ctrl+S` ile
  ya da istenirse kendiliğinden kaydedilir (Ayarlar › Kaydetme › Otomatik kaydet, varsayılan kapalı); kaydetme artımlıdır,
  belgenin geri kalanına dokunulmaz.
- **Geri al / yinele.** Her not ve sayfa işlemi `Ctrl+Z` / `Ctrl+Y` ile geri alınır; kayıttan sonra bile.
- **Araçlar** (araç çubuğundaki **Araçlar** düğmesi, açılış ekranı ya da Araçlar menüsü; belge açık değilken önce PDF seçilir;
  pencerelerdeki fare ve tuş kullanımı `F1` Kısayollar'da): **PDF küçült** (üç hazır seviye, boyut
  tahmini), **Sayfaları düzenle** (küçük resim ızgarasında sürükleyerek sıralama, boş alandan sürükleyerek çoklu seçim,
  silme, döndürme, boş sayfa ya da başka PDF'ten sayfa ekleme), **Döndür ve kaydet**, **PDF ayır** (sayfa aralığı, her
  N sayfada bir, seçili sayfalar, her sayfa ayrı dosya), **Görüntü / PDF birleştir** (görüntü ve PDF'lerden tek PDF;
  sürükle-bırak, `Ctrl+V`, Panodan ekle ya da sağ tık Yapıştır; Orijinal / Yüksek / Orta / Düşük kalite düğmelerinde
  toplam tahmini boyut; görüntünün sayfası "Orijinal" (varsayılan: sayfa tam görsel boyutunda) ya da "A4'e sığdır"; farenin sağ
  tuşuyla sürükleyerek, `Ctrl` / `Shift` ile tıklayarak çoklu seçim, seçilenler birlikte döndürülür, taşınır, çıkarılır).
  Küçült, Sayfaları düzenle, Döndür ve Ayır'da
  "Yeni belge olarak kaydet" (varsayılan; klasör Masaüstü, Ayarlar › Kaydetme'den değiştirilir) ya da "Üzerine yaz" (yedeksiz, güvenli yer değiştirme)
  seçilir: Küçült'te ve Ayır'da üzerine yazma geri alınamaz (uyarı gösterilir), Döndür'de ve Sayfaları düzenle'de
  `Ctrl+Z` ile geri alınır; Ayır'da yalnızca tek dosya üreten ayırmada kullanılabilir. Dosya adı uzantısız yazılır (".pdf"
  kaydederken eklenir); yanındaki klasöre tıklamak onu Gezgin'de açar. Uzun işlerde ilerleme çubuğu ve
  iptal. Açık bir pencerenin dışına (arkadaki karartılmış alana) tıklamak onu kapatır; kaydedilmemiş iş varsa sorulur.
- **Yazdır** (`Ctrl+P`): sayfa aralığı, kâğıt boyutu, sayfaya sığdırma; sayfalar görüntü olarak basıldığından
  Türkçe karakterler ekrandaki gibi çıkar. Notlar istenirse basılır ("Notları yazdır" varsayılan olarak kapalı).
- **Paylaş** (araç çubuğunun sağındaki kopyala simgeli düğme ya da Araçlar menüsü; yanında Ayarlar düğmesi). Belgeyi dosya olarak panoya kopyalar; UYAP'a,
  e-postaya ya da Gezgin'e `Ctrl+V` veya Yapıştır ile yapıştırılır.
- **Koyu mod.** Sistem temasını izler; istenirse sayfa da tam siyaha koyulaştırılır (görseller korunur; yazı kutuları
  sayfayla birlikte koyulaşır, dosyadaki renkleri değişmez).
- **Döndür.** Döndür düğmesi ve `Ctrl+R` / `Ctrl+Shift+R` (saat yönünde / tersine) belgeyi döndürür: geçerli sayfa ya da tüm PDF
  sorulur ("Seçeneğimi hatırla" ile bir daha sorulmaz; Ayarlar › Açılış ve düzen'den değiştirilir). Geri alınabilir;
  kaydedince dosyaya yazılır.
- Sayfa düzeni (tek sayfa / iki sayfa, kaydırma aç/kapa, kapak ayrı; bütün sekmelere uygulanır), %6400'e kadar
  yakınlaştırma (genişliğe sığdır, kaydırmalı düzende sayfaların çoğunun genişliğine göre: birkaç geniş sayfa belgeyi
  küçültmez, yana taşar), okuma modu, tam ekran, sol panelde küçük resimler / İçindekiler / Yorumlar, belge içi ve dış
  bağlantılar, form alanlarının görünümü, parola korumalı belgeler, sürükle-bırak.
- **Ayarlar** (`Ctrl+,` ya da araç çubuğundaki dişli): Görünüm (tema, yazı çizimi), Açılış ve düzen (varsayılan PDF
  görüntüleyici: PDEfe zaten varsayılansa "Zaten varsayılan"; kaldığım sayfa, son açılanlar ve Listeyi temizle; yakınlaştırma,
  tek / iki sayfa, kaydırma, kapak, Döndür düğmesi), Not ve vurgu, Kaydetme (otomatik kaydet, araçların çıktı klasörü),
  Güncelleme. Kopyalama her zaman temiz metinle yapılır.
- **Açılış ekranı.** Belge açık değilken ve yeni sekmede: büyük **PDF aç** düğmesi (PDF'ler pencereye sürüklenerek de açılır),
  bütün araçlar ve son açılan belgeler (tek tıkla açılır; × ya da sağ tıkla listeden kaldırılır, klasörde gösterilir). Belge
  gerektiren bir araç seçilince önce Aç penceresi gelir, araç seçilen PDF'le açılır. Liste istenirse hiç tutulmaz: Ayarlar ›
  Açılış ve düzen › Son açılanları hatırla kapatılınca liste silinir, açılış ekranındaki kutu ve Dosya menüsündeki Son açılanlar kalkar.

## Ekran görüntüleri

![Ana pencere: sekmeler, sol panel ve notlar](docs/ekran-ana.png)

![Temiz kopyalama ve arama](docs/ekran-arama.png)

![Not ekleme ve Yorumlar paneli](docs/ekran-notlar.png)

## Kurulum

1. Yukarıdaki bağlantıdan `PDEfe-Setup.exe` dosyasını indirin (Windows 10/11, 64 bit; yönetici hakkı gerekmez).
2. Dosyaya **çift tıklayın**.
3. Dosya imzalı olmadığı için Windows SmartScreen uyarı gösterebilir: **Daha fazla bilgi** yazısına, sonra
   **Yine de çalıştır** düğmesine basın. Bu uyarı kod imzalama sertifikası olmadığından çıkar; her yeni
   sürümde tekrarlanabilir.
4. Sihirbaz Türkçedir: lisans, kurulum klasörü (varsayılan `%LOCALAPPDATA%\Programs\PDEfe`), **Ek görevler**
   sayfasında masaüstü kısayolu seçeneği. Başlat menüsüne **PDEfe** kısayolu eklenir ve `.pdf` dosyaları
   "Birlikte aç" menüsünde PDEfe ile görünür.
5. Son sayfada **PDEfe'yi başlat** ve **PDEfe'yi varsayılan PDF görüntüleyici yap** seçenekleri vardır.

### Varsayılan PDF görüntüleyici yapma

Windows 11'de varsayılan uygulamayı yalnızca kullanıcı seçebilir; kurulum bunu kendiliğinden değiştiremez.
İki yol:

- Kurulumun son sayfasında **PDEfe'yi varsayılan PDF görüntüleyici yap** kutusunu işaretleyin: Windows
  Ayarlar'ın **Varsayılan uygulamalar › PDEfe** sayfası açılır; `.pdf` satırında **PDEfe**'yi seçin.
- Daha sonra: **Ayarlar › Uygulamalar › Varsayılan uygulamalar › PDEfe** ya da PDEfe içinde
  **Ayarlar › Açılış ve düzen › Varsayılan PDF görüntüleyici yap** (PDEfe zaten varsayılansa orada yeşil tik ve "Zaten varsayılan" görünür). Bir `.pdf` dosyasına sağ tıklayıp **Birlikte aç › Başka bir
  uygulama seç › PDEfe › Her zaman** de olur.

### Güncelleme

PDEfe haftada bir (son denetimden bu yana bir hafta geçtiyse açılışta; günlerce açık kalıyorsa gün içinde) GitHub'dan
yeni sürüm olup olmadığına bakar. Yeni sürüm varsa pencerenin üstünde **PDEfe X hazır (kullandığınız: Y).** şeridi çıkar.
**Güncelle** düğmesine bir kez basmak yeter: paket indirilir (yalnızca değişen kısımlar), kurulum sihirbazı açılmadan
kurulur ve PDEfe kendiliğinden yeni sürümle açılır. Kaydedilmemiş belge varsa önce sorulur; ayarlarınıza dokunulmaz.
**Daha sonra** şeridi o oturum için gizler. İstediğiniz an **Yardım › Güncellemeleri denetle** ya da
**Ayarlar › Güncelleme › Şimdi denetle** ile hemen bakabilirsiniz; otomatik denetim aynı yerden kapatılır.

Sürüm notları: [CHANGELOG.md](CHANGELOG.md) ve [Sürümler sayfası](https://github.com/SCgrS/PDEfe/releases).

### Kaldırma

**Ayarlar › Uygulamalar › Yüklü uygulamalar › PDEfe › Kaldır**. Ayarlarınız (`%APPDATA%\PDEfe\ayarlar.json`)
silinmez; isterseniz o klasörü elle silebilirsiniz. Kurulum sistem klasörlerine ve HKLM'ye yazmaz.

## Klavye kısayolları

| Kısayol | İşlev |
| --- | --- |
| `Ctrl+O` | PDF aç |
| `Ctrl+T` | Yeni sekme (açılış sayfası) |
| `Ctrl+S` / `Ctrl+Shift+S` | Kaydet / Farklı kaydet |
| `Ctrl+W` | Sekmeyi kapat |
| `Ctrl+P` | Yazdır |
| `Ctrl+F` | Bul |
| `F3` / `Shift+F3` | Sonraki / önceki eşleşme |
| `Ctrl+G` | Sayfaya git |
| `Ctrl+,` | Ayarlar |
| `Ctrl+Z` / `Ctrl+Y` | Geri al / yinele |
| `Ctrl+PageUp` / `Ctrl+PageDown`, `Ctrl+←` / `Ctrl+→` | Önceki / sonraki sekme |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Son kullanılan sekmeler arasında geç (basılı tutunca seçici açılır; seçicide `←` `→`) |
| `Ctrl+1` – `Ctrl+9` | Sekme seç (`9`: son sekme) |
| `Ctrl+fare tekerleği`, `Ctrl++` / `Ctrl+−` | Yakınlaştır / uzaklaştır (Türkçe klavyede `+` Shift+4 ya da sayısal tuş takımındaki +) |
| `Ctrl+0` | Gerçek boyut |
| `Ctrl+R` / `Ctrl+Shift+R` | Belgeyi saat yönünde / tersine döndür (geçerli sayfa ya da tüm PDF; geri alınabilir) |
| `F4` | Sol panel |
| `Ctrl+H` | Okuma modu |
| `F11` | Tam ekran |
| `←` `→`, `PageUp` `PageDown` | Önceki / sonraki sayfa |
| `Home` / `End` | İlk / son sayfa |
| `Ctrl+Home` / `Ctrl+End` | Belge başı / sonu |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Yazı kutusunda seçili metni kalın / italik / altı çizili yap |
| `Delete` | Seçili notu sil |
| `Esc` | Kapat / vazgeç; yazı kutusunda düzenlemeyi bitirir (yazılan korunur) |
| `F1` | Kısayollar (araç pencerelerindeki fare ve tuş kullanımı dahil) |

## Verileriniz

Bütün işlemler yereldir; belgeleriniz hiçbir yere gönderilmez, telemetri yoktur. Ağa yalnızca sürüm
denetiminde (`github.com`) çıkılır. Ayarlar `%APPDATA%\PDEfe\ayarlar.json` dosyasındadır. Son açılan belgelerin listesi
ve belgelerde kalınan sayfalar da (dosya yollarıyla) bu dosyada tutulur; ikisi de Ayarlar › Açılış ve düzen'den kapatılır,
kapatılınca kayıtları silinir.

## Geliştirme

Gereksinimler: Node.js 22, Python 3.12 (proje içi `.venv`), Git. Windows'ta geliştirilir ve paketlenir.

```bash
git clone https://github.com/SCgrS/PDEfe.git
cd PDEfe
npm install

# Python çekirdeği için sanal ortam (uv ile; pip de olur)
uv venv .venv --python 3.12
uv pip install --python .venv/Scripts/python.exe pymupdf fonttools pillow pyinstaller

npm start                 # geliştirme: Electron + core/pdefe_core.py (.venv ile)
npm run cekirdek:derle    # PyInstaller → core/dist/pdefe-core.exe
npm run dist              # electron-builder → release/PDEfe-Setup.exe
```

- Arayüz `src/renderer` altında derleme adımı olmayan ES modülleridir; ana süreç `src/main` (Node ESM).
- `core/pdefe_core.py` PyMuPDF tabanlı yardımcı süreçtir; ana süreçle stdio üzerinden satır başına bir JSON
  (JSON-RPC benzeri) konuşur. Uzun işler `progress` mesajları gönderir.
- Paketleme yapılandırması `electron-builder.yml`, kurulum sihirbazı eklemeleri `build/installer.nsh`.
- Sürüm çıkarma: `package.json` sürümünü yükselt, `CHANGELOG.md`'ye bölüm ekle, `git tag vX.Y.Z` ve push;
  `.github/workflows/yayim.yml` paketi derleyip GitHub Releases'e yükler (`PDEfe-Setup.exe`, `.blockmap`, `latest.yml`).
- Mimari ve kararlar: [PLAN.md](PLAN.md).

## Üçüncü taraf projeler

PDEfe şu açık kaynak projelerin üzerine kuruludur (sürümler ve lisanslar için [THIRD_PARTY.md](THIRD_PARTY.md)):

- **Electron** (MIT) — Chromium (BSD) ve Node.js (MIT) ile birlikte uygulama çatısı.
- **PDF.js / pdfjs-dist** (Apache-2.0, Mozilla) — sayfa çizimi, metin katmanı, yer imleri.
- **PyMuPDF** ve **MuPDF** (AGPL-3.0, Artifex) — belge işleme çekirdeği: notlar, kaydetme, küçük resimler.
- **Python** (PSF), **fontTools** (MIT), **Pillow** (MIT-CMU), **PyInstaller** (GPL-2.0, önyükleyici istisnası).
- **electron-builder / electron-updater** (MIT), **electron-store** (MIT), **pdf-lib** (MIT), **NSIS** (zlib).

<!-- TEŞEKKÜR: kullanıcı onayı bekliyor — aşağıdaki bölüm proje sahibi onaylayınca yayımlanacak.
## Teşekkür

Bu uygulama, yukarıdaki projelerin geliştiricilerinin emeği üzerine kuruludur; her biri kendi lisansıyla
kullanıldı. Özellikle Mozilla'nın PDF.js ekibine ve Artifex'in MuPDF ekibine teşekkürler.
-->

## Lisans

PDEfe, **GNU Affero General Public License v3.0 (AGPL-3.0)** ile dağıtılır; tam metin [LICENSE](LICENSE)
dosyasındadır. PDF motoru olarak kullanılan MuPDF ve PyMuPDF AGPL-3.0 lisanslı olduğundan PDEfe de aynı
lisansı taşır: yazılımı kullanabilir, değiştirebilir ve dağıtabilirsiniz; değiştirilmiş sürümleri
dağıtırken (ağ üzerinden sunmak dahil) kaynak kodunu aynı lisansla açmanız gerekir.
