# Üçüncü taraf bileşenler

PDEfe aşağıdaki açık kaynak projeleri kullanır. Sürümler `package.json` / `package-lock.json`, Electron'un kendisi ve proje `.venv`
ortamından okunmuştur (son denetim 0.2.9). Her bileşenin lisans metni kendi deposunda ve kurulu uygulamada bulunur (bkz. "Lisans metinleri"):
Node paketlerininki `resources/app.asar` içinde, Python bileşenlerininki `resources/pdefe-core/_internal/lisanslar/` altında (macOS'ta
`Contents/Resources/pdefe-core-<mimari>/_internal/lisanslar/`), PDEfe'nin kendi lisansı ve bu liste `resources/LICENSE.txt` ve
`resources/THIRD_PARTY.md`.

PDEfe'nin kendisi **GNU AGPL-3.0** lisansıyla dağıtılır (bkz. `LICENSE`). Bunun nedeni PDF motoru olarak
kullanılan MuPDF / PyMuPDF'in AGPL-3.0 olmasıdır; bu bileşenler için Artifex'ten ticari lisans alınmamıştır.

| Bileşen | Sürüm | Lisans | Ne için | Bağlantı |
| --- | --- | --- | --- | --- |
| Electron | 44.5.1 | MIT | Uygulama çatısı (pencere, menü, IPC, paketleme) | https://github.com/electron/electron |
| Chromium | 152.0.7977.130 | BSD-3-Clause (ve bileşenlerinin lisansları) | Electron içindeki tarayıcı motoru; arayüzü çizer | https://www.chromium.org/ |
| Node.js | 24.21.0 | MIT | Electron içindeki ana süreç çalışma zamanı | https://nodejs.org/ |
| V8 | 15.2.124.28 | BSD-3-Clause | JavaScript motoru (Chromium/Node içinde) | https://v8.dev/ |
| PDF.js (`pdfjs-dist`) | 6.3.289 | Apache-2.0 | Sayfa çizimi, metin katmanı, yer imleri (Mozilla) | https://github.com/mozilla/pdf.js |
| PyMuPDF | 1.28.2 | AGPL-3.0 | `pdefe-core` çekirdeği: belge bilgisi, küçük resimler, notlar, kaydetme (Artifex) | https://github.com/pymupdf/PyMuPDF |
| MuPDF | 1.28.2 | AGPL-3.0 | PyMuPDF'in altındaki PDF motoru (Artifex) | https://mupdf.com/ |
| Python | 3.12.14 | PSF-2.0 | Çekirdek sürecinin dili (PyInstaller ile exe'ye gömülür) | https://www.python.org/ |
| fontTools | 4.65.0 | MIT | FreeText notları için Windows fontlarının GID koruyan alt kümesini çıkarma | https://github.com/fonttools/fonttools |
| Pillow | 12.3.0 | MIT-CMU (HPND) | Görüntü işleme (görüntü → PDF, küçük resimler) | https://github.com/python-pillow/Pillow |
| pdf2docx | 0.5.13, **değiştirilmiş kopya** (`core/ucuncu/pdf2docx`, lisansı yanında) | MIT (Artifex) | PDF → Word (0.2.6): düzenlenebilir .docx. Değişiklikler: opencv kaldırıldı (kontur ağacı, gri ton, döndürme numpy ve Pillow ile), stdout'a yazan ve süreci sonlandıran yerler düzeltildi, PDF yalnızca `filetype="pdf"` ile açılır; komut satırı ve tkinter arayüzü alınmadı (ayrıntı `core/ucuncu/__init__.py`) | https://github.com/ArtifexSoftware/pdf2docx |
| UDF okuma ve çizim motoru (`src/udf-cizim/udf-motoru.js`) | Drive UDF Okuyucu 0.3.2'deki motorun kopyası; değişiklikler: yatay sayfada kenar boşluklarının döndürülmesi, UYAP erişim satırı | MIT (Drive UDF Okuyucu; motor legaluga-uyap-ui'nin `src/extension/udf.js` dosyasından türetilmiş, o da MIT) | UYAP Doküman Editörü bulunamadığında UDF → PDF'in yaklaşık çizimi (0.2.6): belge gizli bir pencerede çizilip PDF'e yazdırılır. İki lisans metni ve telif bildirimleri `src/udf-cizim/LICENSE.txt` dosyasında | https://github.com/hasanimer/legaluga-uyap-ui |
| python-docx | 1.2.0 | MIT | pdf2docx'in .docx yazması (PDF → Word) | https://github.com/python-openxml/python-docx |
| typing_extensions | 4.16.0 | PSF-2.0 | python-docx'in çalışma anındaki bağımlılığı (PDF → Word) | https://github.com/python/typing_extensions |
| lxml | 6.1.3 | BSD-3-Clause; paketle gelen libxml2 ve libxslt MIT, zlib zlib lisansı, iconv LGPL-2.1 | python-docx'in XML işleme kitaplığı (PDF → Word) | https://github.com/lxml/lxml |
| NumPy | 2.5.4 | BSD-3-Clause (ve bileşenleri: 0BSD, MIT, Zlib, CC0-1.0); paketle gelen OpenBLAS BSD-3-Clause, libgfortran GPL-3.0 GCC çalışma zamanı istisnasıyla | pdf2docx'in görüntü dizisi işlemleri (PDF → Word) | https://github.com/numpy/numpy |
| comtypes | 1.4.17 | MIT | Yalnız Windows: Word → PDF (0.2.6) için bilgisayardaki Word'e COM ile erişim | https://github.com/enthought/comtypes |
| pywinrt (`winrt-runtime`, `winrt-Windows.Media.Ocr`, `winrt-Windows.Graphics.Imaging`, `winrt-Windows.Storage.Streams`, `winrt-Windows.Globalization`, `winrt-Windows.Foundation`, `winrt-Windows.Foundation.Collections`) | 3.2.1 | MIT | Windows'un yerleşik yazı tanıyıcısına (Windows.Media.Ocr) erişim: görsellerdeki yazının seçilebilmesi (0.1.24). Tanıyıcının kendisi Windows'un parçasıdır, PDEfe ile dağıtılmaz; paketle gelen `msvcp140.dll` Microsoft Visual C++ çalışma zamanıdır (Microsoft'un yeniden dağıtım koşulları) | https://github.com/pywinrt/pywinrt |
| PyObjC (`pyobjc-core`, `pyobjc-framework-Vision`, `-Quartz`, `-Cocoa`, `-CoreML`) | 12.2.2 | MIT | macOS'ta (0.2.0) Apple'ın yerleşik yazı tanıyıcısına (Vision) erişim: görsellerdeki yazının seçilebilmesi. Tanıyıcının kendisi macOS'un parçasıdır, PDEfe ile dağıtılmaz | https://github.com/ronaldoussoren/pyobjc |
| PyInstaller | 6.22.3 | GPL-2.0-or-later, önyükleyici istisnasıyla | `pdefe-core.exe` paketleme aracı; istisna gereği üretilen exe'ye GPL bulaşmaz | https://github.com/pyinstaller/pyinstaller |
| electron-builder / app-builder-lib | 26.15.3 | MIT | NSIS kurulum paketi, GitHub yayımı | https://github.com/electron-userland/electron-builder |
| electron-updater | 6.8.9 | MIT | Otomatik güncelleme (`latest.yml`, blockmap fark indirmesi) | https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater |
| electron-store | 11.0.2 | MIT | Ayarların JSON olarak saklanması | https://github.com/sindresorhus/electron-store |
| pdf-lib | 1.17.1 | MIT | Yardımcı PDF işlemleri (JavaScript tarafı) | https://github.com/Hopding/pdf-lib |
| NSIS | 3.0.4.1 (electron-builder'ın getirdiği sürüm) | zlib/libpng | Kurulum sihirbazı (`PDEfe-Setup.exe`) | https://nsis.sourceforge.io/ |
| @electron/universal | electron-builder'ın getirdiği sürüm | MIT | macOS'ta (0.2.0) Apple işlemcili ve Intel paketlerinin tek evrensel uygulamada birleştirilmesi | https://github.com/electron/universal |

## Fontlar

PDEfe, serbest yazı notlarında kullanıcının Windows'unda kurulu fontların (Segoe UI, Arial, Times New Roman,
Calibri; macOS'ta sistemle gelen Arial ve Times New Roman) yalnızca kullanılan glifleri içeren alt kümesini belgeye gömer. Bu fontlar
PDEfe ile dağıtılmaz; işletim sisteminin kendi lisans koşullarına tabidir.

## UYAP Doküman Editörü (UDF → PDF, 0.2.6)

UDF → PDF dönüştürmesi bilgisayarda kurulu UYAP Doküman Editörü'nü ve onunla gelen kitaplıkları (UDE'nin `jai_hvl.jar` dosyasındaki
iText 2.1.7 dâhil) yalnızca çalışma anında, bilgisayardaki kurulumdan kullanır; bunlar PDEfe ile dağıtılmaz, depoya ve kurulum
paketine girmez. Paketteki `resources/ude-kopru/ude-kopru.jar` PDEfe'nin kendi kodudur (AGPL-3.0, kaynağı `core/ude_kopru/src`): UDE'nin ve
iText'in sınıflarına yalnızca yansımayla (reflection) erişir, onların bayt kodunu içermez ve çözmez.

## Microsoft Word ve LibreOffice (Word → PDF, 0.2.6)

Word → PDF dönüştürmesi bilgisayarda kurulu Microsoft Word'ü (Windows; Word yoksa ya da macOS'ta kurulu LibreOffice'i) yalnızca
çalışma anında, görünmez bir örnekle kullanır. Word ve LibreOffice PDEfe ile dağıtılmaz, depoya ve kurulum paketine girmez; kendi lisans
koşullarına tabidir.

## Lisans metinleri

Depoda ve kurulu uygulamada (Windows: kurulum klasöründeki `resources`; macOS: `PDEfe.app/Contents/Resources`):

- GNU AGPL-3.0 (PDEfe, PyMuPDF, MuPDF): depoda `LICENSE`; kurulu uygulamada `resources/LICENSE.txt`, PyMuPDF'inki ayrıca
  `pdefe-core/_internal/lisanslar/pymupdf/COPYING`.
- Python bileşenleri (Pillow, fontTools, python-docx, typing_extensions, lxml ve paketle gelen kitaplıkları, NumPy ve bileşenleri, comtypes,
  macOS'ta PyObjC) ve Python'un kendisi: kurulu uygulamada `pdefe-core/_internal/lisanslar/<bileşen>/` (çekirdek derlenirken her dağıtımın
  `*.dist-info` lisans dosyalarından toplanır: `core/pdefe-core.spec`). pywinrt (`winrt-*`) dağıtımlarında lisans metni yok; lisansları
  (MIT) `lisanslar/winrt-*/METADATA` dosyasında yazar, metin projenin deposunda.
- pdf2docx'in MIT lisansı: depoda değiştirilmiş kopyasının yanında (`core/ucuncu/pdf2docx/LICENSE`), kurulu uygulamada
  `pdefe-core/_internal/lisanslar/pdf2docx/LICENSE`.
- MIT (UDF çizim motoru: Drive UDF Okuyucu ve legaluga-uyap-ui): `src/udf-cizim/LICENSE.txt` (kurulu uygulamada `resources/app.asar` içinde).
- Node paketleri (Electron dışındakiler): `node_modules/<paket>/LICENSE*` (kurulu uygulamada `resources/app.asar` içinde); Electron'un ve
  Chromium'un lisansları kurulum klasöründe `LICENSE.electron.txt` ve `LICENSES.chromium.html`.
