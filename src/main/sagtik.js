// Dosya Gezgini ve Finder sağ tık menüsü (0.3.1, kullanıcı isteği: "Dönüştürebildiği dosya türlerinde sağ klik yapılınca pdefe ile dönüştür
// yazsın, simgesi de gözüksün", "birden fazla dosya seçilirse sağ klikte PDEfe ile birleştir seçeneği çıksın simgesiyle yine", "tek bir dosya
// sağ tiklenirse birleştir çıkmasın. ama birden fazlada hem birleştir üstte altında dönüştür çıksın").
//
// Komut satırı (iki işletim sisteminde aynı): `PDEfe --donustur <yol> …` Format Değiştir'i, `PDEfe --birlestir <yol> …` Birleştir'i o dosyalarla,
// verilen sırayla açar (pencereler.js aracIstegiAc, renderer/uygulama.js 'dosya:ac' { arac }). PDEfe açıksa yeni süreç dosyaları tek örnek
// kilidiyle açık örneğe verip çıkar ('second-instance'). Çok dosyada yollar liste dosyasıyla gelir: `--dosya-listesi=<yol>` (Windows'ta komut
// satırı 32767 karakterle sınırlı). Liste dosyası yalnızca %TEMP%\PDEfe\sagtik-*.txt olabilir (sağ tık DLL'i yazar); okunduktan sonra silinir.
// Başka yerdeki dosya okunmaz, silinmez: Komut satırı başka bir programdan da gelebilir.
//
// Windows: Kabuk eklentisi (sagtik/, Rust, IExplorerCommand), kaydı ve DLL'i kurucu yazar (build/installer.nsh madde 11). DLL kurulum klasöründe
// değil %LOCALAPPDATA%\PDEfe\SagTik\<sürüm>\'de: Gezgin DLL'i açık tutar, güncellemede kurulum klasörü silinemezdi. Eski sürüm klasörleri
// kilidi kalkınca silinir: kurucu ve PDEfe'nin açılışı (eskiSagTikKlasorleriniSil).
// macOS: Finder › Hızlı Eylemler (Automator iş akışları, ~/Library/Services). DMG'den sürüklenerek kurulduğu için PDEfe açılışta kendisi kurar ve
// uygulamanın yeri değişince yeniler (macHizliEylemleriniKur). Apple seçim sayısına göre gizletmez: tek dosyada da "birleştir" görünür.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

/** Komut satırı anahtarı → araç. renderer/uygulama.js aracIstegindeAc ve sagtik/src/kurallar.rs Tur::anahtar ile aynı. */
export const ARAC_ANAHTARLARI = Object.freeze({ '--donustur': 'donustur', '--birlestir': 'birlestir' });
export const LISTE_ANAHTARI = '--dosya-listesi=';
/** Liste dosyasının ilk satırı (sagtik/src/kurallar.rs LISTE_BASLIGI). */
export const LISTE_BASLIGI = 'pdefe-dosya-listesi-1';
/** Bir istekte en çok bu kadar dosya (DLL'in EN_COK_OGE sınırı). */
export const EN_COK_DOSYA = 1000;
const LISTE_ADI = /^sagtik-[0-9]+-[0-9]+-[0-9]+\.txt$/i;
const LISTE_EN_BUYUK = 8 * 1024 * 1024;

/** Sağ tık isteğinin anahtarı mı (araç anahtarı ya da liste): yeniden başlatmada (anaSurec.js kapanirkenGeleniAc) taşınmaz. */
export function sagTikAnahtariMi(a) {
  const k = String(a || '').toLowerCase();
  return k in ARAC_ANAHTARLARI || k.startsWith(LISTE_ANAHTARI);
}

/** Liste dosyalarının klasörü: %TEMP%\PDEfe (DLL GetTempPathW'nin altına yazar). Kısa (8.3) adlar ve bağlantılar çözülür. */
function listeKlasoru(gecici = os.tmpdir()) {
  const k = path.join(gecici, 'PDEfe');
  try { return fs.realpathSync.native(k); } catch { return path.resolve(k); }
}

/** Liste dosyasını okur ve siler. Yalnızca %TEMP%\PDEfe\sagtik-*.txt, başlık satırı doğruysa; değilse [] (dosyaya dokunulmaz). */
export function listeyiOku(yol, { gecici = os.tmpdir() } = {}) {
  let tam;
  try { tam = fs.realpathSync.native(String(yol)); } catch { return []; }
  const anahtar = (y) => path.resolve(y).toLowerCase();
  if (anahtar(path.dirname(tam)) !== anahtar(listeKlasoru(gecici)) || !LISTE_ADI.test(path.basename(tam))) return [];
  let metin;
  try {
    const bilgi = fs.statSync(tam);
    if (!bilgi.isFile() || bilgi.size > LISTE_EN_BUYUK) return [];
    metin = fs.readFileSync(tam, 'utf8');
  } catch { return []; }
  const satirlar = metin.split(/\r?\n/);
  if (satirlar[0] !== LISTE_BASLIGI) return [];
  try { fs.rmSync(tam, { force: true }); } catch { /* sonraki açılışta eskiSagTikKlasorleriniSil'deki gibi */ }
  return satirlar.slice(1).filter(Boolean);
}

/**
 * Komut satırındaki sağ tık isteği: { arac: 'donustur' | 'birlestir', dosyalar } ya da null (anahtar yok). Dosyalar komut satırındaki sırayla
 * (liste dosyasınınkiler onun yerinde); var olan, mutlak (göreli olanlar cwd'ye göre çözülür) ve uzantısı uygun olanlar. İlk araç anahtarı
 * geçerlidir. uzantilar: açılabilen dosyaların düzenli ifadesi (anaSurec.js ACILAN_UZANTILAR; araç desteklemediği türü satırında söyler).
 */
export function aracIstegi(argv, cwd, uzantilar, { varMi = (y) => { try { return fs.statSync(y).isFile(); } catch { return false; } }, gecici } = {}) {
  let arac = null;
  const adaylar = [];
  for (const a of (Array.isArray(argv) ? argv : []).slice(1)) {
    if (typeof a !== 'string' || !a) continue;
    const k = a.toLowerCase();
    if (k in ARAC_ANAHTARLARI) { arac ??= ARAC_ANAHTARLARI[k]; continue; }
    if (k.startsWith(LISTE_ANAHTARI)) { adaylar.push(...listeyiOku(a.slice(LISTE_ANAHTARI.length), { gecici })); continue; }
    if (a.startsWith('-') || a === '.') continue;
    adaylar.push(a);
  }
  if (!arac) return null;
  const dosyalar = [];
  for (const a of adaylar) {
    if (dosyalar.length >= EN_COK_DOSYA) break;
    if (typeof a !== 'string' || a.includes('\0') || !uzantilar.test(a)) continue;
    const tam = path.isAbsolute(a) ? a : path.resolve(cwd || process.cwd(), a);
    if (varMi(tam)) dosyalar.push(tam);
  }
  return { arac, dosyalar };
}

/** Yeniden başlatmada (anaSurec.js kapanirkenGeleniAc) isteğin komut satırı parçaları; yollar uzunsa kendi liste dosyasıyla. */
export function istekArgumanlari({ arac, dosyalar }, { gecici = os.tmpdir() } = {}) {
  const anahtar = Object.keys(ARAC_ANAHTARLARI).find((k) => ARAC_ANAHTARLARI[k] === arac);
  if (!anahtar) return [];
  const uzunluk = dosyalar.reduce((t, y) => t + y.length + 3, 0);
  if (uzunluk < 24000) return [anahtar, ...dosyalar];
  try {
    const klasor = path.join(gecici, 'PDEfe');
    fs.mkdirSync(klasor, { recursive: true });
    const yol = path.join(klasor, `sagtik-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.txt`);
    fs.writeFileSync(yol, [LISTE_BASLIGI, ...dosyalar, ''].join('\n'), { encoding: 'utf8', flag: 'wx' });
    return [anahtar, LISTE_ANAHTARI + yol];
  } catch { return [anahtar, ...dosyalar]; }
}

// ---------------------------------------------------------------- Windows: eski DLL klasörleri

/** Kurucunun DLL klasörü (build/installer.nsh PDEFE_SAGTIK_KLASORU). */
export const SAGTIK_KLASORU = path.join('PDEfe', 'SagTik');
export const SAGTIK_DLL = 'PDEfeSagTik.dll';
/** "PDEfe ile dönüştür"ün CLSID'i (build/installer.nsh, sagtik/src/lib.rs). */
export const SAGTIK_CLSID = '{76052C3F-EA2F-47A3-88B2-A488CB6BC682}';

/** Kayıtlı DLL'in yolu (HKCU\Software\Classes\CLSID\{…}\InprocServer32); okunamazsa null. reg.exe tam yoluyla (anaSurec.js progIdOku gibi). */
function kayitliDll() {
  const reg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  return new Promise((coz) => {
    execFile(reg, ['query', `HKCU\\Software\\Classes\\CLSID\\${SAGTIK_CLSID}\\InprocServer32`, '/ve'], { windowsHide: true, timeout: 5000 }, (hata, cikti) => {
      const m = !hata && /^\s*\(.*?\)\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/im.exec(String(cikti || ''));
      coz(m ? m[1] : null);
    });
  });
}

/**
 * Eski sürümlerin DLL klasörlerini siler (PDEfe'nin açılışında; kurucu da siler). Kayıttaki DLL'in klasörü kalır. Klasör ancak içindeki DLL
 * silinebildiyse silinir: Gezgin'in açık tuttuğu (yüklü) DLL silinemez, o klasörün PDEfe-yolu.txt'si de kalır (yüklü eski DLL tıklanınca onu
 * okur). Kayıt okunamazsa hiçbir şey silinmez. Bir saatten eski, okunmamış liste dosyaları da silinir (PDEfe açılamadıysa kalmışlardır).
 * Döner: silinen klasörlerin adları.
 */
export async function eskiSagTikKlasorleriniSil({ yerel = process.env.LOCALAPPDATA, gecici = os.tmpdir(), kayitli = kayitliDll } = {}) {
  const silinen = [];
  try {
    const klasor = path.join(listeKlasoru(gecici));
    for (const ad of fs.readdirSync(klasor)) {
      if (!LISTE_ADI.test(ad)) continue;
      const y = path.join(klasor, ad);
      try { if (Date.now() - fs.statSync(y).mtimeMs > 3600e3) fs.rmSync(y, { force: true }); } catch { /* kullanımda */ }
    }
  } catch { /* klasör yok */ }
  if (!yerel) return silinen;
  const kok = path.join(yerel, SAGTIK_KLASORU);
  let adlar;
  try { adlar = fs.readdirSync(kok, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return silinen; }
  const dll = await kayitli();
  if (!dll) return silinen;
  const tutulan = path.resolve(path.dirname(dll)).toLowerCase();
  for (const ad of adlar) {
    const k = path.join(kok, ad);
    if (path.resolve(k).toLowerCase() === tutulan) continue;
    try { fs.rmSync(path.join(k, SAGTIK_DLL), { force: true }); } catch { continue; }   // Gezgin'de yüklü
    try { fs.rmSync(k, { recursive: true, force: true }); silinen.push(ad); } catch { /* sonra */ }
  }
  return silinen;
}

// ---------------------------------------------------------------- macOS: Finder Hızlı Eylemleri

/** Hızlı Eylemler: Finder › sağ tık › Hızlı Eylemler'de bu adlarla (adlar sıralı: birleştir üstte). uzantilar: betiğin geçirdikleri
 *  (Windows'taki gibi Format Değiştir'in ve Birleştir'in aldıkları; sagtik/src/kurallar.rs). */
export const HIZLI_EYLEMLER = Object.freeze([
  { ad: 'PDEfe ile birleştir', anahtar: '--birlestir', uygunsuz: 'Bu dosyalar birleştirilemiyor', yapar: 'birleştirir', uzantilar: ['pdf', 'jpg', 'jpeg', 'png', 'bmp', 'gif', 'tif', 'tiff', 'webp', 'udf', 'doc', 'docx', 'docm', 'rtf', 'odt'] },
  { ad: 'PDEfe ile dönüştür', anahtar: '--donustur', uygunsuz: 'Bu dosyalar dönüştürülemiyor', yapar: 'dönüştürür', uzantilar: ['pdf', 'udf', 'tif', 'tiff', 'doc', 'docx', 'docm', 'rtf', 'odt', 'jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'] },
]);
const MAC_KIMLIK = 'com.cgrshn.pdefe';   // electron-builder.yml appId
const DESTEK_METNI = 'PDF, UDF, Word, TIFF, JPG, PNG, BMP, GIF ve WEBP';

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Kabukta tek tırnaklı dizgi. */
const tektirnak = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
/** Büyük / küçük harf ayırmayan uzantı kalıbı: pdf → *.[pP][dD][fF] */
const kalip = (u) => '*.' + [...u].map((c) => (/[a-z]/.test(c) ? `[${c}${c.toUpperCase()}]` : c)).join('');

/**
 * Hızlı Eylem'in kabuk betiği (Automator "Kabuk Betiği Çalıştır", /bin/sh, girdiler bağımsız değişken olarak). PDEfe'yi bulur (iş akışına yazılan
 * yol; yoksa Spotlight'ta paket kimliğiyle, Çöp Sepeti ve geçici "AppTranslocation" kopyaları hariç), uzantısı uygun dosyaları seçim sırasıyla
 * `open -n -a PDEfe --args --donustur …` ile verir: Yeni örnek PDEfe açıksa dosyaları ona verip çıkar ('second-instance'; "open --args" çalışan
 * uygulamaya bağımsız değişken vermez, -n her seferinde yeni süreç başlatır). PDEfe yoksa ya da uygun dosya yoksa anlaşılır ileti. Komutlar mutlak
 * yolla; sınamada (test/sagtik_sinama.mjs) komutlar değiştirilebilir.
 */
export function hizliEylemBetigi(eylem, uygulama, { open = '/usr/bin/open', osascript = '/usr/bin/osascript', mdfind = '/usr/bin/mdfind' } = {}) {
  const ileti = (baslik, metin) => `${osascript} -e 'on run argv' -e 'display alert (item 1 of argv) message (item 2 of argv) as warning' -e 'end run' "${baslik}" "${metin}" >/dev/null 2>&1`;
  return [
    `# ${eylem.ad}: PDEfe'nin Hızlı Eylemi. PDEfe her açılışta yeniler (elle değiştirmeyin).`,
    `UYGULAMA=${tektirnak(uygulama)}`,
    'if [ ! -x "$UYGULAMA/Contents/MacOS/PDEfe" ]; then',
    `  BULUNAN=$(${mdfind} "kMDItemCFBundleIdentifier == '${MAC_KIMLIK}'" 2>/dev/null | /usr/bin/grep -v -e '/\\.Trash/' -e '/AppTranslocation/' | /usr/bin/head -n 1)`,
    '  if [ -n "$BULUNAN" ] && [ -x "$BULUNAN/Contents/MacOS/PDEfe" ]; then',
    '    UYGULAMA=$BULUNAN',
    '  else',
    `    ${ileti('PDEfe bulunamadı', "PDEfe bu Mac'te bulunamadı. PDEfe'yi Uygulamalar klasörüne kurup bir kez açın. Bu Hızlı Eylem'i istemiyorsanız Finder'da sağ tık › Hızlı Eylemler › Özelleştir'den kapatabilirsiniz.")}`,
    '    exit 0',
    '  fi',
    'fi',
    'SAYI=$#',
    'for DOSYA in "$@"; do',
    '  case "$DOSYA" in',
    `    ${eylem.uzantilar.map(kalip).join('|')}) set -- "$@" "$DOSYA" ;;`,
    '  esac',
    'done',
    'shift "$SAYI"',
    'if [ "$#" -eq 0 ]; then',
    `  ${ileti(eylem.uygunsuz, `PDEfe şu türleri ${eylem.yapar}: ${DESTEK_METNI}.`)}`,
    '  exit 0',
    'fi',
    `${open} -n -a "$UYGULAMA" --args ${eylem.anahtar} "$@"`,
    '',
  ].join('\n');
}

/** Hızlı Eylem paketinin Contents/Info.plist'i: Finder'da dosyalar (klasörler değil: public.data) seçiliyken, PDEfe'nin simgesiyle. */
export function hizliEylemBilgisi(eylem) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSBackgroundColorName</key>
			<string>background</string>
			<key>NSIconName</key>
			<string>workflowCustomImage</string>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>${xml(eylem.ad)}</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSRequiredContext</key>
			<dict>
				<key>NSApplicationIdentifier</key>
				<string>com.apple.finder</string>
			</dict>
			<key>NSSendFileTypes</key>
			<array>
				<string>public.data</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
`;
}

/** Hızlı Eylem paketinin Contents/document.wflow'u (Automator iş akışı: tek "Kabuk Betiği Çalıştır" eylemi). simge: PNG baytları (Automator'da
 *  açılınca görünen simge; menüdeki simge Resources/workflowCustomImage.png). Kimlikler (UUID) eylemin adından sabit: içerik değişmedikçe aynı. */
export function hizliEylemBelgesi(eylem, uygulama, simge, secenekler) {
  const betik = hizliEylemBetigi(eylem, uygulama, secenekler);
  const kimlik = (n) => {
    let h = 0x811c9dc5;
    for (const c of `${eylem.anahtar}:${n}`) h = Math.imul(h ^ c.codePointAt(0), 0x01000193) >>> 0;
    const x = h.toString(16).padStart(8, '0').toUpperCase();
    return `${x}-${x.slice(0, 4)}-4${x.slice(5, 8)}-8${x.slice(1, 4)}-${x}${x.slice(0, 4)}`;
  };
  const satirlar64 = (simge ? Buffer.from(simge).toString('base64') : '').replace(/.{1,60}/g, '\t\t$&\n');
  const arguman = (n, ad, deger) => `					<key>${n}</key>
					<dict>
						<key>default value</key>
						${deger}
						<key>name</key>
						<string>${ad}</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>${n}</string>
					</dict>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<true/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMParameterProperties</key>
				<dict>
					<key>COMMAND_STRING</key>
					<dict/>
					<key>CheckedForUserDefaultShell</key>
					<dict/>
					<key>inputMethod</key>
					<dict/>
					<key>shell</key>
					<dict/>
					<key>source</key>
					<dict/>
				</dict>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>${xml(betik)}</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>1</integer>
					<key>shell</key>
					<string>/bin/sh</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>${kimlik('girdi')}</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
				</array>
				<key>OutputUUID</key>
				<string>${kimlik('cikti')}</string>
				<key>UUID</key>
				<string>${kimlik('eylem')}</string>
				<key>UnlocalizedApplications</key>
				<array>
					<string>Automator</string>
				</array>
				<key>arguments</key>
				<dict>
${arguman(0, 'inputMethod', '<integer>0</integer>')}
${arguman(1, 'source', '<string></string>')}
${arguman(2, 'CheckedForUserDefaultShell', '<false/>')}
${arguman(3, 'COMMAND_STRING', '<string></string>')}
${arguman(4, 'shell', '<string>/bin/sh</string>')}
				</dict>
				<key>isViewVisible</key>
				<true/>
				<key>location</key>
				<string>309.000000:253.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
			<key>isViewVisible</key>
			<true/>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>applicationBundleID</key>
		<string>com.apple.finder</string>
		<key>applicationBundleIDsByPath</key>
		<dict>
			<key>/System/Library/CoreServices/Finder.app</key>
			<string>com.apple.finder</string>
		</dict>
		<key>applicationPath</key>
		<string>/System/Library/CoreServices/Finder.app</string>
		<key>applicationPaths</key>
		<array>
			<string>/System/Library/CoreServices/Finder.app</string>
		</array>
${simge ? `		<key>customImageFileData</key>
		<data>
${satirlar64}		</data>
		<key>customImageFileExtension</key>
		<string>png</string>
` : ''}		<key>inputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>outputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>presentationMode</key>
		<integer>15</integer>
		<key>processesInput</key>
		<false/>
		<key>serviceApplicationBundleID</key>
		<string>com.apple.finder</string>
		<key>serviceApplicationPath</key>
		<string>/System/Library/CoreServices/Finder.app</string>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<false/>
		<key>useAutomaticInputType</key>
		<false/>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>
`;
}

/** Bir Hızlı Eylem paketinin dosyaları: { 'Contents/Info.plist': metin, 'Contents/document.wflow': metin, 'Contents/Resources/…png': bayt }. */
export function hizliEylemDosyalari(eylem, uygulama, simge, secenekler) {
  const d = {
    'Contents/Info.plist': hizliEylemBilgisi(eylem),
    'Contents/document.wflow': hizliEylemBelgesi(eylem, uygulama, simge, secenekler),
  };
  if (simge) d['Contents/Resources/workflowCustomImage.png'] = Buffer.from(simge);
  return d;
}

/** .app paketinin yolu (process.execPath: <uygulama>.app/Contents/MacOS/PDEfe). Geçici yerlerde (DMG'nin salt okunur birimi, karantinanın
 *  "AppTranslocation" kopyası) null: o yol PDEfe kapanınca yok olur, Hızlı Eylem'e yazılmaz. */
export function macUygulamaYolu(exe = process.execPath, { yazilabilirMi = (y) => { try { fs.accessSync(y, fs.constants.W_OK); return true; } catch { return false; } } } = {}) {
  const uygulama = path.posix.resolve(exe, '..', '..', '..');
  if (!/\.app$/i.test(uygulama) || uygulama.includes('/AppTranslocation/')) return null;
  if (uygulama.startsWith('/Volumes/') && !yazilabilirMi(path.posix.dirname(uygulama))) return null;
  return uygulama;
}

/**
 * Hızlı Eylemleri kurar ya da yeniler (macOS, PDEfe'nin açılışı). İçeriği aynı olan pakete dokunulmaz. Kullanıcının sildiği Hızlı Eylem
 * (bir kez kurulmuş, şimdi yok: kurulanlar ayarda) yeniden kurulmaz. Yazıldıysa Hizmetler listesi tazelenir (pbs -update).
 * Döner: { yazilan: [ad], atlanan: [ad] }.
 */
export async function macHizliEylemleriniKur({ uygulama, simge, klasor = path.join(os.homedir(), 'Library', 'Services'), ayarAl, ayarKoy, tazele = true }) {
  const sonuc = { yazilan: [], atlanan: [] };
  if (!uygulama) return sonuc;
  const kurulanlar = { ...(ayarAl?.('macHizliEylemleri') || {}) };
  fs.mkdirSync(klasor, { recursive: true });
  for (const eylem of HIZLI_EYLEMLER) {
    const paket = path.join(klasor, `${eylem.ad}.workflow`);
    const var_ = fs.existsSync(paket);
    if (!var_ && kurulanlar[eylem.ad]) { sonuc.atlanan.push(eylem.ad); continue; }   // kullanıcı sildi
    const dosyalar = hizliEylemDosyalari(eylem, uygulama, simge);
    const ayni = var_ && Object.entries(dosyalar).every(([ad, icerik]) => {
      try { return Buffer.from(icerik).equals(fs.readFileSync(path.join(paket, ad))); } catch { return false; }
    });
    if (!ayni) {
      const gecici = path.join(klasor, `.${eylem.ad}.workflow.yaziliyor`);
      fs.rmSync(gecici, { recursive: true, force: true });
      for (const [ad, icerik] of Object.entries(dosyalar)) {
        fs.mkdirSync(path.dirname(path.join(gecici, ad)), { recursive: true });
        fs.writeFileSync(path.join(gecici, ad), icerik);
      }
      fs.rmSync(paket, { recursive: true, force: true });
      fs.renameSync(gecici, paket);
      sonuc.yazilan.push(eylem.ad);
    }
    kurulanlar[eylem.ad] = true;
  }
  ayarKoy?.('macHizliEylemleri', kurulanlar);
  if (sonuc.yazilan.length && tazele) {
    await new Promise((coz) => execFile('/System/Library/CoreServices/pbs', ['-update'], { timeout: 15000 }, () => coz()));
  }
  return sonuc;
}
