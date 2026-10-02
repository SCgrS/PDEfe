# Üçüncü taraf bileşenler

PDEfe aşağıdaki açık kaynak projeleri kullanır. Sürümler 0.1.0 için `package.json` / `package-lock.json`
ve proje `.venv` ortamından okunmuştur; her bileşenin lisans metni kendi deposunda ve kurulum paketindeki
`resources/app.asar` (Node paketleri) ile `pdefe-core.exe` (Python paketleri) içinde bulunur.

PDEfe'nin kendisi **GNU AGPL-3.0** lisansıyla dağıtılır (bkz. `LICENSE`). Bunun nedeni PDF motoru olarak
kullanılan MuPDF / PyMuPDF'in AGPL-3.0 olmasıdır; bu bileşenler için Artifex'ten ticari lisans alınmamıştır.

| Bileşen | Sürüm | Lisans | Ne için | Bağlantı |
| --- | --- | --- | --- | --- |
| Electron | 44.4.0 | MIT | Uygulama çatısı (pencere, menü, IPC, paketleme) | https://github.com/electron/electron |
| Chromium | 152.0.7977.78 | BSD-3-Clause (ve bileşenlerinin lisansları) | Electron içindeki tarayıcı motoru; arayüzü çizer | https://www.chromium.org/ |
| Node.js | 24.21.0 | MIT | Electron içindeki ana süreç çalışma zamanı | https://nodejs.org/ |
| V8 | 15.2.124.19 | BSD-3-Clause | JavaScript motoru (Chromium/Node içinde) | https://v8.dev/ |
| PDF.js (`pdfjs-dist`) | 6.3.289 | Apache-2.0 | Sayfa çizimi, metin katmanı, yer imleri (Mozilla) | https://github.com/mozilla/pdf.js |
| PyMuPDF | 1.28.2 | AGPL-3.0 | `pdefe-core` çekirdeği: belge bilgisi, küçük resimler, notlar, kaydetme (Artifex) | https://github.com/pymupdf/PyMuPDF |
| MuPDF | 1.28.2 | AGPL-3.0 | PyMuPDF'in altındaki PDF motoru (Artifex) | https://mupdf.com/ |
| Python | 3.12.14 | PSF-2.0 | Çekirdek sürecinin dili (PyInstaller ile exe'ye gömülür) | https://www.python.org/ |
| fontTools | 4.65.0 | MIT | FreeText notları için Windows fontlarının GID koruyan alt kümesini çıkarma | https://github.com/fonttools/fonttools |
| Pillow | 12.3.0 | MIT-CMU (HPND) | Görüntü işleme (görüntü → PDF, küçük resimler) | https://github.com/python-pillow/Pillow |
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

## Lisans metinleri

- GNU AGPL-3.0: `LICENSE` (PDEfe, PyMuPDF, MuPDF)
- MIT (pywinrt ve PyObjC dahil), Apache-2.0, BSD, PSF, HPND ve zlib lisans metinleri ilgili paketlerin dağıtım dosyalarında bulunur
  (`node_modules/<paket>/LICENSE*`, Python paketlerinde `*.dist-info/licenses/`).
