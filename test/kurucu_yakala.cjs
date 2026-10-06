// Kurucu sınaması (0.2.3): electron-builder'ın makensis'e verdiği NSIS betiğini ve tanımları (-D) dosyaya yazar. electron-builder'ın CLI'ı
// `node --require test/kurucu_yakala.cjs` ile başlatılınca yüklenir (test/kurucu_derle.mjs yapar); PDEFE_KURUCU_YAKALA ortam değişkeni
// yoksa hiçbir şey yapmaz. Yakalanan betik test/kurucu_karsilastir.mjs'te bugünkü ve önceki build/installer.nsh ile yeniden derlenir.
//   PDEFE_KURUCU_YAKALA=<klasör>   kaldirici.json (BUILD_UNINSTALLER derlemesi) ve kurucu.json yazılır
//   PDEFE_KURUCU_YAKALA_DUR=1      kurucu betiği yakalanınca derleme durdurulur (büyük kurucu exe'si sıkıştırılmaz; karşılaştırma için yeter)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const klasor = process.env.PDEFE_KURUCU_YAKALA;
if (klasor) {
  const lib = path.join(__dirname, '..', 'node_modules', 'app-builder-lib');
  // Önce paketin ana modülü: NsisTarget doğrudan yüklenince döngüsel içermede LinuxPackager'ın üst sınıfı henüz tanımsız kalıyor
  require(lib);
  const { NsisTarget } = require(path.join(lib, 'out', 'targets', 'nsis', 'NsisTarget.js'));
  const { getMakeNsisPath } = require(path.join(lib, 'out', 'toolsets', 'windows.js'));
  const { nsisTemplatesDir } = require(path.join(lib, 'out', 'targets', 'nsis', 'nsisUtil.js'));
  const projeKlasoru = path.resolve(__dirname, '..');
  const ozgun = NsisTarget.prototype.executeMakensis;

  NsisTarget.prototype.executeMakensis = async function (defines, commands, script, opts) {
    const kaldirici = 'BUILD_UNINSTALLER' in defines;
    // Derleme bitince silinen geçici içermeler (LangString ileti dosyaları) betiğe gömülür; şablon ve proje dosyaları içerme olarak kalır
    const gomulu = script.split('\n').map((satir) => {
      const m = satir.trim().match(/^!include "(.+)"$/);
      if (!m) return satir;
      const yol = path.resolve(m[1]);
      const kalici = yol.toLowerCase().startsWith(projeKlasoru.toLowerCase()) || yol.toLowerCase().startsWith(path.resolve(nsisTemplatesDir).toLowerCase());
      if (kalici || !fs.existsSync(yol)) return satir;
      return `; --- gömülü: ${path.basename(yol)}\n${fs.readFileSync(yol, 'utf8')}\n; --- gömülü son`;
    }).join('\n');
    const makensis = await getMakeNsisPath(this.packager.config.toolsets?.nsis, this.options.customNsisBinary);
    fs.mkdirSync(klasor, { recursive: true });
    const kayit = {
      tur: kaldirici ? 'kaldirici' : 'kurucu',
      appBuilderLib: require(path.join(lib, 'package.json')).version,
      sablonKlasoru: nsisTemplatesDir,
      makensis,
      defines: { ...defines },
      commands: { ...commands },
      script: gomulu,
    };
    fs.writeFileSync(path.join(klasor, `${kayit.tur}.json`), JSON.stringify(kayit, null, 1));
    if (!kaldirici && process.env.PDEFE_KURUCU_YAKALA_DUR === '1') {
      throw new Error('PDEFE_KURUCU_YAKALANDI: kurucu betiği yakalandı, derleme bilerek durduruldu');
    }
    return ozgun.call(this, defines, commands, script, opts);
  };
}
