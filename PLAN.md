# PDEfe — Plan ve Mimari

Windows 11 için sekmeli PDF görüntüleyici ve düzenleyici. Electron (arayüz, PDF.js ile çizim) + PyMuPDF tabanlı
`pdefe-core` yardımcı süreci (dosyaya dokunan her iş). Arayüz, menüler, mesajlar Türkçe. Geliştirici: x.com/CgrShn.

## Test seti ve tespitler
`C:\Users\<kullanıcı>\Desktop\PDF DENEME` (10 dosya) + `test/pdf` (indirilenler, git dışı):

| Dosya | Zorluk |
|---|---|
| 1.5.6098.pdf (TBK, mevzuat.gov.tr) | 135 sayfa, Word; gömülü olmayan Times New Roman; kopyalamada satır/paragraf birleştirme |
| mevzuat_4721_TMK.pdf, mevzuat_6102_TTK.pdf | büyük kanun PDF'leri (aynı yapı) |
| DENEME PDF (2).pdf (UDF→PDF, iText) | referans okuyucuda eklenmiş 2 vurgu (biri notlu, Popup + AP); gömülü olmayan süslü fontlar (Viner Hand, Vivaldi, Rockwell, Tw Cen) → sistem fontu; UDF'den gelen görseller |
| 2099_83_EK-1_pdf.pdf | yatay sayfa, "Microsoft Print to PDF", CID fontlar, QR görseli |
| 2099_12_BLR_BILIRKISI_EKRAPORU.pdf, fdsafsd.pdf | Word; karışık gömülü/gömülü olmayan font, Cambria Math, görseller |
| UYAP (iText/JasperReports) dosyaları ×4 | Helvetica/Arial gömülü değil, kodlama yok → standart font eşlemesi; 595x879 sayfa |
| dergipark_3972595_ttk_tbk.pdf | 231 yer imi; **bozuk ToUnicode**: Ġ→İ, ġ→Ş, Ģ→ş (Word 2010 Türkçe hatası) |
| dergipark_5104529_zamanasimi.pdf | 52 sayfa, PDFium |
| PDF32000_2008_yerimli.pdf | 756 sayfa, 22 MB, 823 yer imi → performans ve İçindekiler testi |

## Teknoloji ve dosya yapısı
```
package.json            Electron 44, pdfjs-dist 6, electron-store 11, electron-updater 6, electron-builder 26
src/main/               ana süreç (ESM)
  main.js               pencere, tek örnek, pdefe:// protokolü, IPC, kapatma onayı
  menu.js               Türkçe menü → renderer'a komut kimliği gönderir
  ayarlar.js            electron-store şeması (bütün varsayılanlar)
  cekirdek.js           pdefe-core ile JSON-RPC (stdio, satır başına JSON, ilerleme mesajları)
  pano.js               Paylaş: dosyayı CF_HDROP olarak panoya koyar (PowerShell)
  preload.cjs           contextBridge: cagir / dinle / gonder / dosyaYolu
src/renderer/           arayüz (ES modülleri; derleme adımı yok, pdefe://app/ üzerinden sunulur)
  uygulama.js           giriş: sekmeler, komutlar, kısayollar, açma/kapatma/kaydetme, sürükle-bırak
  goruntuleyici.js      PDF.js: tembel sayfa çizimi, bölgesel çizim (%6400'e kadar), düzenler, zoom, döndürme
  sekmeler.js           sekme çubuğu, sürükle-sırala, Ctrl+Tab seçici, açık belgeler listesi
  panel.js              sol panel: Sayfalar (çekirdekten küçük resim), İçindekiler, Yorumlar
  metin.js              temiz kopyalama (girinti/paragraf/tire/glif düzeltme), üç tıkla paragraf
  arama.js              Bul kutusu: Türkçe duyarlı, tam sözcük, yer imi/yorum, tüm sekmeler
  notlar.js             not katmanı: okuma/çizim/etkileşim/balon/araçlar, kaydetme farkı (diff)
  komutlar.js           komut deseni: KomutYigini (geri al/yinele, kayıt konumu)
  durum.js              durum çubuğu
core/                   Python 3.12 (proje içi .venv, uv ile kurulu; PyInstaller ile pdefe-core.exe)
  pdefe_core.py         JSON-RPC döngüsü, belge önbelleği, temel yöntemler
  islemler/notlar.py    not yazma: Highlight/Text/FreeText (gömülü Türkçe font alt kümesi), yanıt, kaydet
  islemler/araclar.py   küçült, sayfa düzenle, ayır, birleştir, görüntü→PDF, döndür
  islemler/yapisal.py   sayfa tarifinden belge kurma, anlık kopya, konumsal not eşleme, içerik kutusu
test/                   surucu.mjs (CDP ile uygulamayı sürer), senaryo*.mjs, incele.py, not_testi.py
build/                  simge, NSIS, derleme betikleri
```

## Çekirdek protokolü
İstek `{"id", "method", "params"}` → yanıt `{"id", "result"}` / `{"id", "error"}`; uzun işler `{"id", "progress": {"yuzde", "mesaj"}}` gönderir.
Yöntemler: ping, belge_bilgi, kucuk_resim, notlar, not_gorunum, gorsel_kutulari, metin_sec, sayfa_metni, belge_birak,
notlar_kaydet, freetext_stil, baglantilar, form_gorunum (+ araçlar).

## Temel kararlar
- **Çizim**: PDF.js sayfa içeriğini çizer (annotationMode DISABLE); notların tamamı PDEfe'nin kendi katmanında çizilir
  (vurgu ailesi ve yapışkan not simgesi SVG/HTML, PDEfe yazıları yerli HTML, diğer türler çekirdekten AP pixmap'i).
  Böylece taşıma/silme/düzenleme anında görünür, PDF.js belgesi değişmez.
- **Kaydetme**: renderer model + komut yığını gerçeği tutar; kaydederken dosyadaki duruma göre ekle/güncelle/sil farkı
  çıkarılır ve çekirdek artımlı (incremental) yazar. Yapısal (sayfa) değişiklikler tam yazımla; kayıttan sonra da
  geri al çalışır (fark tersine uygulanır).
- **FreeText**: Base-14 Helvetica Türkçe glif içermediğinden Windows fontunun (Segoe UI/Arial/Times/Calibri, kalın
  dahil) GID koruyan alt kümesi belgeye bir kez gömülür; görünüm akışı PDEfe üretir; /DA, /DS ve /PDEfe stil kaydı yazılır.
- **Kopyalama**: DOM seçimi + metin katmanı geometrisi (girinti) → ardından çekirdekten (sözcük merkezi kutuda) daha
  temiz sürüm alınıp pano güncellenir. Ayar: temiz / ham.
- **Arama**: PDF.js metin öğelerinden dizin, `toLocaleLowerCase('tr')` ile İ/ı doğru; bozuk glif düzeltmesi dizine de uygulanır.

## Durum (2026-09-16)
- [x] Açma/sekme/görüntüleme, düzenler, zoom (görünür alana sığdır dahil), döndürme, sol panel, koyu tema (sayfayı koyulaştır, görselleri koru), oturum/son dosya, Ctrl+Tab seçici
- [x] Metin seçme, temiz kopyalama, arama; bağlantılar (iç/dış), form alanları (görüntü)
- [x] Notlar: referans okuyucu notlarını gösterme, vurgu/yapışkan not/yanıt/yazı ekleme, taşıma, silme, geri al/yinele, artımlı kaydetme; döndürülmüş sayfada dik yazı
- [x] Sayfa tarifi komutları (sil/sırala/döndür/boş sayfa/başka PDF'ten sayfa) ve yapısal kaydetme (anlık kopya), kayıttan sonra geri al
- [x] Ayarlar penceresi, yazdırma (sayfa başına görüntü dosyası, Windows diyaloğu, iptal)
- [x] Araçlar: küçült (tahminli), sayfaları düzenle, ayır, birleştir, görüntü/PDF birleştir (pano dahil), döndür ve kaydet; çekirdekte işbirlikçi iptal
- [x] Güncelleme (electron-updater şeridi), kurulum (NSIS, Türkçe, .pdf ilişkilendirme, Varsayılan Programlar kaydı), GitHub Actions, README/CHANGELOG/THIRD_PARTY/LICENSE; paket derlendi ve paketli uygulama çalıştırıldı
- [ ] Kullanıcı doğrulaması (docs/DOGRULAMA.md): referans okuyucuda notlar, kurulum sihirbazı, gerçek yazıcı, Gezgin çift tık
- [x] GitHub deposu: SCgrS/PDEfe (özel)
- [ ] Karar bekleyen: README teşekkür bölümü
