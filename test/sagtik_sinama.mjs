// Sağ tık menüsünün sınaması (0.3.1). Kullanım: node test/sagtik_sinama.mjs [--cargo] [--menu] [--mac]
//   (varsayılan)  Tutarlılık: uzantı listeleri (DLL, Format Değiştir, Birleştir, Hızlı Eylemler, ana sürecin süzgeci), CLSID'ler, adlar ve kayıt
//                 düzeni (sagtik/src, build/installer.nsh, test/kurucu_sinama.nsh, test/sagtik_kayitlari.json, src/main/sagtik.js) aynı mı.
//                 src/main/sagtik.js'in birimleri: komut satırı isteği, liste dosyası, eski DLL klasörlerinin silinmesi (Windows'ta yüklü DLL'le),
//                 macOS Hızlı Eylem paketi (plist'ler Python plistlib ile okunur, kabuk betiği sh ile sahte open / osascript / mdfind'la çalışır),
//                 kurma ve yenileme. Kayıt defterine yazmaz, Gezgin'e ve Finder'a dokunmaz.
//   --cargo       Windows'ta ardından DLL'in sınamaları: cargo test --release --locked (birim testleri, tests/dll.rs)
//   --menu        Windows'ta ardından test/sagtik_menu.ps1 (kayıtlı fiillerle Gezgin'in menü kodu; yalnızca sanal kovanda ya da CI'da)
//   --mac         macOS'ta (CI): Hızlı Eylemler ~/Library/Services'e kurulur, plutil -lint, pbs -update ve Hizmetler listesi, betik /bin/sh ile;
//                 automator ile sahte bir uygulama paketine kadar uçtan uca (bilgi: sonucu zorunlu değil)
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aracIstegi, istekArgumanlari, sagTikAnahtariMi, listeyiOku, eskiSagTikKlasorleriniSil, HIZLI_EYLEMLER, hizliEylemBetigi, hizliEylemDosyalari,
  macHizliEylemleriniKur, macUygulamaYolu, ARAC_ANAHTARLARI, LISTE_ANAHTARI, LISTE_BASLIGI, SAGTIK_CLSID, SAGTIK_DLL, EN_COK_DOSYA,
} from '../src/main/sagtik.js';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = (y) => fs.readFileSync(path.join(KOK, y), 'utf8');
const J = (x) => JSON.stringify(x);
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const argv = new Set(process.argv.slice(2));
let hata = 0, denetim = 0;
const sonuc = (ad, ok, ayrinti = '') => {
  denetim++;
  if (!ok) hata++;
  console.log(`${ok ? 'TAMAM ' : 'HATA  '} ${ad}${!ok && ayrinti !== '' ? ' — ' + (typeof ayrinti === 'string' ? ayrinti : J(ayrinti)) : ''}`);
};
const bilgi = (s) => console.log(`BİLGİ  ${s}`);
const kume = (l) => J([...new Set(l.map((x) => x.toLowerCase()))].sort());
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'pdefe-sagtik-'));

// ---------------------------------------------------------------- tutarlılık
/** Kaynaktaki dizi tanımı: `<ad> = [ 'a', ...B, 'c' ]` (yayılımlar aynı dosyadaki adlardan). */
function jsDizisi(metin, ad, gorulen = new Set()) {
  const m = new RegExp(`(?:const|let)\\s+${ad}\\s*=\\s*\\[([^\\]]*)\\]`).exec(metin);
  if (!m || gorulen.has(ad)) throw new Error(`dizi bulunamadı: ${ad}`);
  gorulen.add(ad);
  const sonuc = [];
  for (const p of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    if (p.startsWith('...')) sonuc.push(...jsDizisi(metin, p.slice(3), gorulen));
    else sonuc.push(p.replace(/^['"]|['"]$/g, ''));
  }
  return sonuc;
}
function rustDizisi(metin, ad) {
  const m = new RegExp(`pub const ${ad}: &\\[&str\\] = &\\[([^\\]]*)\\]`).exec(metin);
  if (!m) throw new Error(`Rust dizisi bulunamadı: ${ad}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}
const guid = (s) => String(s).replace(/[{}]/g, '').toUpperCase();
const rustGuid = (metin, ad) => {
  const m = new RegExp(`pub const ${ad}: GUID = GUID::from_u128\\(0x([0-9a-f_]+)\\)`).exec(metin);
  if (!m) throw new Error(`GUID yok: ${ad}`);
  const h = m[1].replace(/_/g, '').toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const nshTanim = (metin, ad) => (new RegExp(`^\\s*!define(?:\\s+/ifndef)?\\s+${ad}\\s+"([^"]*)"`, 'm').exec(metin) || [])[1];

{
  const kurallar = oku('sagtik/src/kurallar.rs'), lib = oku('sagtik/src/lib.rs');
  const donustur = oku('src/renderer/araclar/donustur.js'), birlestir = oku('src/renderer/araclar/gorselBirlestir.js');
  const nsh = oku('build/installer.nsh'), deneme = oku('test/kurucu_sinama.nsh'), ana = oku('src/main/anaSurec.js');
  const duzen = JSON.parse(oku('test/sagtik_kayitlari.json'));
  const dllDonustur = rustDizisi(kurallar, 'DONUSTUR_UZANTILARI'), dllBirlestir = rustDizisi(kurallar, 'BIRLESTIR_UZANTILARI');
  const fdGirdi = jsDizisi(donustur, 'GIRDI_UZANTILARI'), birGirdi = jsDizisi(birlestir, 'UZANTILAR');
  sonuc('DLL\'in dönüştür listesi Format Değiştir\'in Dosya ekle listesiyle aynı (donustur.js GIRDI_UZANTILARI)', kume(dllDonustur) === kume(fdGirdi), { dll: dllDonustur, fd: fdGirdi });
  sonuc('DLL\'in birleştir listesi Birleştir\'inkiyle aynı (gorselBirlestir.js UZANTILAR)', kume(dllBirlestir) === kume(birGirdi), { dll: dllBirlestir, b: birGirdi });
  const hd = HIZLI_EYLEMLER.find((e) => e.anahtar === '--donustur'), hb = HIZLI_EYLEMLER.find((e) => e.anahtar === '--birlestir');
  sonuc('macOS Hızlı Eylemlerinin listeleri DLL\'inkilerle aynı', kume(hd.uzantilar) === kume(dllDonustur) && kume(hb.uzantilar) === kume(dllBirlestir));
  const acilan = new RegExp(/const ACILAN_UZANTILAR = (\/.*\/i);/.exec(ana)[1].slice(1, -2), 'i');
  const disarida = [...dllDonustur, ...dllBirlestir].filter((u) => !acilan.test(`a.${u}`));
  sonuc('Ana sürecin komut satırı süzgeci (ACILAN_UZANTILAR) bütün sağ tık türlerini alır', disarida.length === 0, disarida);
  for (const f of duzen.fiiller) {
    const rAd = f.ad === 'Donustur' ? 'DONUSTUR' : 'BIRLESTIR';
    sonuc(`${f.ad}: CLSID lib.rs, installer.nsh ve düzende aynı`, rustGuid(lib, `CLSID_${rAd}`) === guid(f.clsid) && guid(nshTanim(nsh, `PDEFE_SAGTIK_CLSID_${rAd}`)) === guid(f.clsid), f.clsid);
    sonuc(`${f.ad}: sınama CLSID'i lib.rs, kurucu_sinama.nsh ve düzende aynı, gerçeğinden farklı`, rustGuid(lib, `SINAMA_CLSID_${rAd}`) === guid(f.sinamaClsid)
      && guid(nshTanim(deneme, `PDEFE_SAGTIK_CLSID_${rAd}`)) === guid(f.sinamaClsid) && guid(f.sinamaClsid) !== guid(f.clsid), f.sinamaClsid);
    const tur = f.ad === 'Donustur' ? 'Donustur' : 'Birlestir';
    sonuc(`${f.ad}: başlık kurallar.rs, installer.nsh, Hızlı Eylem ve düzende aynı ("${f.baslik}")`,
      new RegExp(`Tur::${tur} => "${f.baslik}"`).test(kurallar) && nsh.includes(`!insertmacro pdefeSagTikFiil "${f.ad}" "\${PDEFE_SAGTIK_CLSID_${rAd}}" "${f.baslik}"`)
      && HIZLI_EYLEMLER.some((e) => e.ad === f.baslik));
  }
  sonuc('sagtik.js SAGTIK_CLSID dönüştürün CLSID\'i, DLL adı düzendeki', guid(SAGTIK_CLSID) === guid(duzen.fiiller.find((f) => f.ad === 'Donustur').clsid) && SAGTIK_DLL === duzen.dllAdi
    && nshTanim(nsh, 'PDEFE_SAGTIK_DLL') === duzen.dllAdi && nshTanim(nsh, 'PDEFE_SAGTIK_YOL_DOSYASI') === duzen.yolDosyasi && lib.includes(`const YOL_DOSYASI: &str = "${duzen.yolDosyasi}"`));
  sonuc('Gezgin\'in sırası: Birlestir anahtarı Donustur\'un önünde (birleştir üstte)', duzen.fiiller.map((f) => f.ad).join() === ['Birlestir', 'Donustur'].sort().join() && duzen.fiiller[0].ad === 'Birlestir');
  // installer.nsh'in fiil makrosu düzendeki değerleri yazıyor mu
  const makro = /!macro pdefeSagTikFiil[\s\S]*?!macroend/.exec(nsh)[0];
  const yazilan = Object.fromEntries([...makro.matchAll(/WriteRegStr SHELL_CONTEXT "\$\{PDEFE_SAGTIK_FIIL_KOKU\}\\\$\{PDEFE_SAGTIK_FIIL_ONEKI\}\.\$\{AD\}" "([^"]+)" "([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const beklenen = Object.fromEntries(Object.entries(duzen.fiilDegerleri).map(([k, v]) => [k, v.replace('{BASLIK}', '${BASLIK}').replace('{CLSID}', '${CLSID}').replace('{EXE}', '$INSTDIR\\${APP_EXECUTABLE_FILENAME}')]));
  sonuc('installer.nsh fiil değerleri düzendekilerle aynı (MUIVerb, Icon, ExplorerCommandHandler, CommandStateSync, MultiSelectModel, NeverDefault)', J(yazilan) === J(beklenen), { yazilan, beklenen });
  sonuc('installer.nsh fiil kökü ve önekleri düzendeki', nshTanim(nsh, 'PDEFE_SAGTIK_FIIL_KOKU') === `Software\\Classes\\${duzen.fiilKoku}` && nshTanim(nsh, 'PDEFE_SAGTIK_FIIL_ONEKI') === duzen.fiilOneki.gercek
    && nshTanim(deneme, 'PDEFE_SAGTIK_FIIL_ONEKI') === duzen.fiilOneki.kurucuSinamasi);
  sonuc('Komut satırı anahtarları ve liste başlığı DLL\'le aynı', J(Object.keys(ARAC_ANAHTARLARI).sort()) === J(['--birlestir', '--donustur'])
    && kurallar.includes('Tur::Donustur => "--donustur"') && kurallar.includes('Tur::Birlestir => "--birlestir"') && kurallar.includes(`"${LISTE_ANAHTARI}"`)
    && kurallar.includes(`LISTE_BASLIGI: &str = "${LISTE_BASLIGI}"`));
  sonuc('Bir istekte en çok dosya DLL\'in üst sınırıyla aynı', kurallar.includes(`EN_COK_OGE: u32 = ${EN_COK_DOSYA};`));
}

// ---------------------------------------------------------------- komut satırı isteği ve liste dosyası
{
  const k = path.join(gecici, 'Dosyalar (deneme)');
  fs.mkdirSync(k, { recursive: true });
  const d = (ad) => { const y = path.join(k, ad); fs.writeFileSync(y, ''); return y; };
  const a = d("Ali'nin & dilekçesi.pdf"), b = d('TARAMA.TIF'), c = d('not.txt'), e = d('Ek.docm');
  fs.mkdirSync(path.join(k, 'klasör.pdf'));
  const ACILAN = /\.(pdf|udf|tiff?|docx?|docm|rtf|odt|jpe?g|png|bmp|gif|webp|avif|heic|heif)$/i;
  sonuc('Anahtarsız komut satırı: istek yok', aracIstegi(['pdefe', a], k, ACILAN) === null);
  let r = aracIstegi(['pdefe', '--allow-file-access-from-files', '--DONUSTUR', a, c, path.join(k, 'yok.pdf'), path.join(k, 'klasör.pdf'), 'TARAMA.TIF', e], k, ACILAN);
  sonuc('--donustur (büyük harfle de): sırayla, göreli yol cwd\'ye göre, .txt / olmayan / klasör atlanır', r?.arac === 'donustur' && J(r.dosyalar) === J([a, b, e]), r);
  r = aracIstegi(['pdefe', '.', '--birlestir', '--donustur', b, a], k, ACILAN);
  sonuc('İlk araç anahtarı geçerli, geliştirme sürümünün "." bağımsız değişkeni atlanır', r?.arac === 'birlestir' && J(r.dosyalar) === J([b, a]), r);
  const listeKlasoru = path.join(gecici, 'temp', 'PDEfe');
  fs.mkdirSync(listeKlasoru, { recursive: true });
  const liste = path.join(listeKlasoru, 'sagtik-1-2-3.txt');
  fs.writeFileSync(liste, [LISTE_BASLIGI, e, a, ''].join('\n'));
  r = aracIstegi(['pdefe', '--birlestir', b, `${LISTE_ANAHTARI}${liste}`, a], k, ACILAN, { gecici: path.join(gecici, 'temp') });
  sonuc('--dosya-listesi: listenin yolları yerinde (önceki ve sonraki bağımsız değişkenlerle sırayla), liste silindi', J(r?.dosyalar) === J([b, e, a, a]) && !fs.existsSync(liste), r);
  const disarida = path.join(gecici, 'sagtik-1-2-4.txt');
  fs.writeFileSync(disarida, [LISTE_BASLIGI, a].join('\n'));
  const yanlisBaslik = path.join(listeKlasoru, 'sagtik-1-2-5.txt');
  fs.writeFileSync(yanlisBaslik, ['baska', a].join('\n'));
  const yanlisAd = path.join(listeKlasoru, 'liste.txt');
  fs.writeFileSync(yanlisAd, [LISTE_BASLIGI, a].join('\n'));
  sonuc('Başka klasördeki, başlığı ya da adı yanlış liste okunmaz ve silinmez', listeyiOku(disarida, { gecici: path.join(gecici, 'temp') }).length === 0
    && listeyiOku(yanlisBaslik, { gecici: path.join(gecici, 'temp') }).length === 0 && listeyiOku(yanlisAd, { gecici: path.join(gecici, 'temp') }).length === 0
    && fs.existsSync(disarida) && fs.existsSync(yanlisBaslik) && fs.existsSync(yanlisAd));
  const cok = Array.from({ length: EN_COK_DOSYA + 5 }, () => a);
  r = aracIstegi(['pdefe', '--donustur', ...cok], k, ACILAN);
  sonuc(`En çok ${EN_COK_DOSYA} dosya`, r.dosyalar.length === EN_COK_DOSYA);
  sonuc('Sağ tık anahtarları yeniden başlatmada taşınmaz (sagTikAnahtariMi)', sagTikAnahtariMi('--donustur') && sagTikAnahtariMi('--Birlestir') && sagTikAnahtariMi(`${LISTE_ANAHTARI}x`) && !sagTikAnahtariMi('--remote-debugging-port=1') && !sagTikAnahtariMi(a));
  sonuc('istekArgumanlari: kısa istek komut satırında', J(istekArgumanlari({ arac: 'birlestir', dosyalar: [a, b] })) === J(['--birlestir', a, b]));
  const uzun = Array.from({ length: 400 }, (_, i) => path.join(k, `Çok uzun bir dosya adı, komut satırını doldurmak için ${i}.pdf`));
  const ua = istekArgumanlari({ arac: 'donustur', dosyalar: uzun }, { gecici: path.join(gecici, 'temp') });
  const ul = ua[1]?.slice(LISTE_ANAHTARI.length);
  sonuc('istekArgumanlari: uzun istek kendi liste dosyasıyla, PDEfe onu okuyabilir', ua.length === 2 && ua[0] === '--donustur' && J(listeyiOku(ul, { gecici: path.join(gecici, 'temp') })) === J(uzun), ua);
}

// ---------------------------------------------------------------- Windows: eski DLL klasörleri
{
  const yerel = path.join(gecici, 'yerel');
  const kok = path.join(yerel, 'PDEfe', 'SagTik');
  const surumler = ['0.3.0', '0.3.1', '0.3.2'];
  const dll = path.join(KOK, 'sagtik', 'dist', SAGTIK_DLL);
  for (const s of surumler) {
    fs.mkdirSync(path.join(kok, s), { recursive: true });
    if (fs.existsSync(dll)) fs.copyFileSync(dll, path.join(kok, s, SAGTIK_DLL)); else fs.writeFileSync(path.join(kok, s, SAGTIK_DLL), 'x');
    fs.writeFileSync(path.join(kok, s, 'PDEfe-yolu.txt'), 'x');
  }
  const varlar = () => fs.readdirSync(kok).sort();
  let silinen = await eskiSagTikKlasorleriniSil({ yerel, gecici: path.join(gecici, 'temp'), kayitli: async () => null });
  sonuc('Kayıt okunamazsa hiçbir klasör silinmez', silinen.length === 0 && J(varlar()) === J(surumler));
  // Yüklü DLL (Gezgin gibi): ayrı bir süreç 0.3.0'ın DLL'ini LoadLibrary ile yükler
  let yukleyici = null;
  if (WIN && fs.existsSync(dll)) {
    const ps = `$k = Add-Type -PassThru -Name K -Namespace S -MemberDefinition '[DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern System.IntPtr LoadLibraryW(string a);'; if ([S.K]::LoadLibraryW($env:DLL) -eq [System.IntPtr]::Zero) { exit 3 }; 'yuklendi'; Start-Sleep 30`;
    yukleyici = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { env: { ...process.env, DLL: path.join(kok, '0.3.0', SAGTIK_DLL) }, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
    await new Promise((c) => { yukleyici.stdout.once('data', c); setTimeout(c, 15000); });
  }
  silinen = await eskiSagTikKlasorleriniSil({ yerel, gecici: path.join(gecici, 'temp'), kayitli: async () => path.join(kok, '0.3.2', SAGTIK_DLL) });
  if (yukleyici) {
    sonuc('Kayıttaki (0.3.2) kalır, eski (0.3.1) silinir, yüklü DLL\'in klasörü (0.3.0) PDEfe-yolu.txt\'siyle kalır', J(silinen) === J(['0.3.1']) && J(varlar()) === J(['0.3.0', '0.3.2'])
      && fs.existsSync(path.join(kok, '0.3.0', 'PDEfe-yolu.txt')), { silinen, var: varlar() });
    yukleyici.kill();
    await new Promise((c) => setTimeout(c, 1500));
    silinen = await eskiSagTikKlasorleriniSil({ yerel, gecici: path.join(gecici, 'temp'), kayitli: async () => path.join(kok, '0.3.2', SAGTIK_DLL) });
    sonuc('DLL bırakılınca sonraki açılışta silinir', J(silinen) === J(['0.3.0']) && J(varlar()) === J(['0.3.2']), { silinen, var: varlar() });
  } else {
    sonuc('Kayıttaki (0.3.2) kalır, eskiler silinir', J(silinen.sort()) === J(['0.3.0', '0.3.1']) && J(varlar()) === J(['0.3.2']), { silinen, var: varlar() });
  }
  const eskiListe = path.join(gecici, 'temp', 'PDEfe', 'sagtik-9-9-9.txt');
  fs.writeFileSync(eskiListe, LISTE_BASLIGI);
  fs.utimesSync(eskiListe, new Date(Date.now() - 2 * 3600e3), new Date(Date.now() - 2 * 3600e3));
  const yeniListe = path.join(gecici, 'temp', 'PDEfe', 'sagtik-9-9-8.txt');
  fs.writeFileSync(yeniListe, LISTE_BASLIGI);
  await eskiSagTikKlasorleriniSil({ yerel, gecici: path.join(gecici, 'temp'), kayitli: async () => null });
  sonuc('Bir saatten eski okunmamış liste dosyası silinir, yenisi kalır', !fs.existsSync(eskiListe) && fs.existsSync(yeniListe));
}

// ---------------------------------------------------------------- macOS Hızlı Eylemleri (paket ve betik)
const PY = WIN ? path.join(KOK, '.venv', 'Scripts', 'python.exe') : (fs.existsSync(path.join(KOK, '.venv', 'bin', 'python')) ? path.join(KOK, '.venv', 'bin', 'python') : 'python3');
const simge = fs.readFileSync(path.join(KOK, 'build', 'icon.png'));
const ornekUygulama = "/Applications/PDEfe'nin kopyası.app";
{
  for (const eylem of HIZLI_EYLEMLER) {
    const dosyalar = hizliEylemDosyalari(eylem, ornekUygulama, simge);
    const k = path.join(gecici, 'paket', `${eylem.ad}.workflow`);
    for (const [ad, icerik] of Object.entries(dosyalar)) { fs.mkdirSync(path.dirname(path.join(k, ad)), { recursive: true }); fs.writeFileSync(path.join(k, ad), icerik); }
    const kod = `
import plistlib, sys, json, base64
k = sys.argv[1]
i = plistlib.load(open(k + "/Contents/Info.plist", "rb"))
d = plistlib.load(open(k + "/Contents/document.wflow", "rb"))
s = i["NSServices"][0]
a = d["actions"][0]["action"]
m = d["workflowMetaData"]
print(json.dumps({"ad": s["NSMenuItem"]["default"], "mesaj": s["NSMessage"], "turler": s["NSSendFileTypes"], "uygulama": s["NSRequiredContext"]["NSApplicationIdentifier"],
  "simge": s["NSIconName"], "betik": a["ActionParameters"]["COMMAND_STRING"], "girdi": a["ActionParameters"]["inputMethod"], "kabuk": a["ActionParameters"]["shell"],
  "eylem": a["BundleIdentifier"], "tur": m["workflowTypeIdentifier"], "servisGirdi": m["serviceInputTypeIdentifier"], "resim": len(m.get("customImageFileData", b"")),
  "uuid": [a["UUID"], a["InputUUID"], a["OutputUUID"]]}))`;
    const o = JSON.parse(execFileSync(PY, ['-I', '-X', 'utf8', '-c', kod, k], { encoding: 'utf8' }).trim());
    sonuc(`${eylem.ad}: Info.plist ve document.wflow geçerli plist, Finder'da dosyalar için, adıyla ve simgesiyle`, o.ad === eylem.ad && o.mesaj === 'runWorkflowAsService' && J(o.turler) === J(['public.data'])
      && o.uygulama === 'com.apple.finder' && o.simge === 'workflowCustomImage' && o.resim === simge.length && fs.existsSync(path.join(k, 'Contents', 'Resources', 'workflowCustomImage.png')), o);
    sonuc(`${eylem.ad}: Kabuk Betiği Çalıştır, /bin/sh, girdiler bağımsız değişken, betik aynen`, o.eylem === 'com.apple.RunShellScript' && o.kabuk === '/bin/sh' && o.girdi === 1 && o.betik === hizliEylemBetigi(eylem, ornekUygulama)
      && o.tur === 'com.apple.Automator.servicesMenu' && o.servisGirdi === 'com.apple.Automator.fileSystemObject' && o.uuid.every((u) => /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-8[0-9A-F]{3}-[0-9A-F]{12}$/.test(u)), o);
  }
  sonuc('İçerik aynı girdilerle aynı (her açılışta yeniden yazılmaz)', J(Object.keys(hizliEylemDosyalari(HIZLI_EYLEMLER[0], ornekUygulama, simge)))
    && hizliEylemDosyalari(HIZLI_EYLEMLER[0], ornekUygulama, simge)['Contents/document.wflow'] === hizliEylemDosyalari(HIZLI_EYLEMLER[0], ornekUygulama, simge)['Contents/document.wflow']);
}

/** sh: macOS'ta /bin/sh, Windows'ta Git Bash'in sh'i. */
function shYolu() {
  if (!WIN) return '/bin/sh';
  for (const y of ['C:\\Program Files\\Git\\usr\\bin\\sh.exe', 'C:\\Program Files\\Git\\bin\\sh.exe']) if (fs.existsSync(y)) return y;
  return null;
}
const SH = shYolu();
if (!SH) bilgi('sh bulunamadı: Hızlı Eylem betiği çalıştırılmadı');
else {
  // Sahte komutlar: bağımsız değişkenlerini satır satır yazar (open, osascript); mdfind ortamdaki MDFIND_CIKTI'yı yazar
  const s = path.join(gecici, 'sahte');
  fs.mkdirSync(s, { recursive: true });
  const shYol = (y) => (WIN ? y.replace(/^([A-Za-z]):\\/, (_, h) => `/${h.toLowerCase()}/`).replace(/\\/g, '/') : y);
  const sahte = (ad) => { const y = path.join(s, ad); fs.writeFileSync(y, `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done > "$CIKTI_KLASORU/${ad}.txt"\n`); fs.chmodSync(y, 0o755); return shYol(y); };
  const komutlar = { open: sahte('open'), osascript: sahte('osascript'), mdfind: shYol(path.join(s, 'mdfind')) };
  fs.writeFileSync(path.join(s, 'mdfind'), '#!/bin/sh\nprintf "%s" "$MDFIND_CIKTI"\n'); fs.chmodSync(path.join(s, 'mdfind'), 0o755);
  // Sahte uygulama paketi
  const uyg = path.join(gecici, "Uygulamalar", "PDEfe'nin kopyası.app");
  fs.mkdirSync(path.join(uyg, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(uyg, 'Contents', 'MacOS', 'PDEfe'), '#!/bin/sh\n'); fs.chmodSync(path.join(uyg, 'Contents', 'MacOS', 'PDEfe'), 0o755);
  const yeni = path.join(gecici, 'Başka yer', 'PDEfe.app');
  fs.mkdirSync(path.join(yeni, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(yeni, 'Contents', 'MacOS', 'PDEfe'), '#!/bin/sh\n'); fs.chmodSync(path.join(yeni, 'Contents', 'MacOS', 'PDEfe'), 0o755);
  const calistir = (eylem, uygulama, dosyalar, mdfind = '') => {
    const cikti = fs.mkdtempSync(path.join(gecici, 'c-'));
    const betik = path.join(cikti, 'betik.sh');
    fs.writeFileSync(betik, hizliEylemBetigi(eylem, uygulama, komutlar));
    const r = spawnSync(SH, [shYol(betik), ...dosyalar], { encoding: 'utf8', env: { ...process.env, CIKTI_KLASORU: shYol(cikti), MDFIND_CIKTI: mdfind } });
    const satir = (ad) => (fs.existsSync(path.join(cikti, `${ad}.txt`)) ? fs.readFileSync(path.join(cikti, `${ad}.txt`), 'utf8').split('\n').filter(Boolean) : null);
    return { kod: r.status, hata: r.stderr, open: satir('open'), osascript: satir('osascript') };
  };
  const don = HIZLI_EYLEMLER.find((e) => e.anahtar === '--donustur'), bir = HIZLI_EYLEMLER.find((e) => e.anahtar === '--birlestir');
  const f = ['/ev/kisi/Belgeler/Dilekçe örneği.PDF', "/ev/kisi/Ali'nin & $HOME `x` belgesi.docx", '/ev/kisi/not.txt', '/ev/kisi/Tarama.tiff', '/ev/kisi/arşiv.zip'];
  let r = calistir(don, shYol(uyg), f);
  sonuc('Betik (dönüştür): open -n -a <uygulama> --args --donustur <uygun dosyalar, sırayla>; tırnak, $, ` ve Türkçe harf aynen', r.kod === 0
    && J(r.open) === J(['-n', '-a', shYol(uyg), '--args', '--donustur', f[0], f[1], f[3]]) && r.osascript === null, r);
  r = calistir(bir, shYol(uyg), [f[3]]);
  sonuc('Betik (birleştir, tek dosya): Birleştir o dosyayla açılır (Apple tek dosyada gizletmiyor)', J(r.open) === J(['-n', '-a', shYol(uyg), '--args', '--birlestir', f[3]]), r);
  r = calistir(don, shYol(uyg), [f[2], f[4]]);
  sonuc('Betik: uygun dosya yoksa PDEfe açılmaz, anlaşılır ileti', r.kod === 0 && r.open === null && r.osascript?.includes('Bu dosyalar dönüştürülemiyor')
    && r.osascript?.some((x) => /PDEfe şu türleri dönüştürür: PDF, UDF, Word, TIFF, JPG, PNG, BMP, GIF ve WEBP\./.test(x)), r);
  r = calistir(don, shYol(path.join(gecici, 'Silinmiş', 'PDEfe.app')), [f[0]], `/ev/kisi/.Trash/PDEfe.app\n${shYol(yeni)}\n`);
  sonuc('Betik: uygulama taşındıysa Spotlight\'ın bulduğu (Çöp Sepeti dışındaki) kullanılır', J(r.open) === J(['-n', '-a', shYol(yeni), '--args', '--donustur', f[0]]), r);
  r = calistir(don, shYol(path.join(gecici, 'Silinmiş', 'PDEfe.app')), [f[0]], '/ev/kisi/.Trash/PDEfe.app\n');
  sonuc('Betik: PDEfe silinmişse hata kutusu değil "PDEfe bulunamadı" iletisi, open yok', r.kod === 0 && r.open === null && r.osascript?.includes('PDEfe bulunamadı')
    && r.osascript?.some((x) => /Hızlı Eylemler › Özelleştir/.test(x)), r);
}

// ---------------------------------------------------------------- macOS: kurma ve yenileme (geçici klasörde)
{
  const klasor = path.join(gecici, 'Services');
  const ayar = {};
  const ayarAl = (k) => ayar[k], ayarKoy = (k, v) => { ayar[k] = structuredClone(v); };
  let r = await macHizliEylemleriniKur({ uygulama: '/Applications/PDEfe.app', simge, klasor, ayarAl, ayarKoy, tazele: false });
  sonuc('İlk açılış: iki Hızlı Eylem kurulur', J(r.yazilan.sort()) === J(HIZLI_EYLEMLER.map((e) => e.ad).sort()) && HIZLI_EYLEMLER.every((e) => fs.existsSync(path.join(klasor, `${e.ad}.workflow`, 'Contents', 'document.wflow'))), r);
  r = await macHizliEylemleriniKur({ uygulama: '/Applications/PDEfe.app', simge, klasor, ayarAl, ayarKoy, tazele: false });
  sonuc('Sonraki açılış: içerik aynı, yazılmaz', r.yazilan.length === 0, r);
  r = await macHizliEylemleriniKur({ uygulama: '/Volumes/Disk/Uygulamalar/PDEfe.app', simge, klasor, ayarAl, ayarKoy, tazele: false });
  const yeniBelge = fs.readFileSync(path.join(klasor, `${HIZLI_EYLEMLER[0].ad}.workflow`, 'Contents', 'document.wflow'), 'utf8');
  sonuc('Uygulamanın yeri değişince ikisi de yenilenir', r.yazilan.length === 2 && yeniBelge.includes('/Volumes/Disk/Uygulamalar/PDEfe.app') && !fs.readdirSync(klasor).some((a) => a.includes('yaziliyor')), r);
  fs.rmSync(path.join(klasor, `${HIZLI_EYLEMLER[0].ad}.workflow`), { recursive: true });
  r = await macHizliEylemleriniKur({ uygulama: '/Volumes/Disk/Uygulamalar/PDEfe.app', simge, klasor, ayarAl, ayarKoy, tazele: false });
  sonuc('Kullanıcının sildiği Hızlı Eylem yeniden kurulmaz', J(r.atlanan) === J([HIZLI_EYLEMLER[0].ad]) && !fs.existsSync(path.join(klasor, `${HIZLI_EYLEMLER[0].ad}.workflow`)), r);
  r = await macHizliEylemleriniKur({ uygulama: null, simge, klasor, ayarAl, ayarKoy, tazele: false });
  sonuc('Uygulamanın yeri bilinmiyorsa (DMG, karantina kopyası) hiçbir şey yazılmaz', r.yazilan.length === 0 && r.atlanan.length === 0);
  sonuc('macUygulamaYolu: Uygulamalar\'daki paket', macUygulamaYolu('/Applications/PDEfe.app/Contents/MacOS/PDEfe') === '/Applications/PDEfe.app');
  sonuc('macUygulamaYolu: karantinanın geçici kopyası (AppTranslocation) ve salt okunur DMG yok sayılır',
    macUygulamaYolu('/private/var/folders/x/AppTranslocation/1/d/PDEfe.app/Contents/MacOS/PDEfe') === null
    && macUygulamaYolu('/Volumes/PDEfe/PDEfe.app/Contents/MacOS/PDEfe', { yazilabilirMi: () => false }) === null
    && macUygulamaYolu('/Volumes/Disk/Uygulamalar/PDEfe.app/Contents/MacOS/PDEfe', { yazilabilirMi: () => true }) === '/Volumes/Disk/Uygulamalar/PDEfe.app'
    && macUygulamaYolu('/usr/local/bin/pdefe') === null);
}

// ---------------------------------------------------------------- macOS'ta gerçek sistem (CI)
if (argv.has('--mac') && MAC) {
  const ev = os.homedir(), servisler = path.join(ev, 'Library', 'Services');
  const uygulama = fs.existsSync('/Applications/PDEfe.app') ? '/Applications/PDEfe.app' : '/Applications/PDEfe.app';
  const ayar = {};
  await macHizliEylemleriniKur({ uygulama, simge, klasor: servisler, ayarAl: (k) => ayar[k], ayarKoy: (k, v) => { ayar[k] = v; }, tazele: true });
  for (const e of HIZLI_EYLEMLER) {
    const k = path.join(servisler, `${e.ad}.workflow`, 'Contents');
    const l = spawnSync('/usr/bin/plutil', ['-lint', path.join(k, 'Info.plist'), path.join(k, 'document.wflow')], { encoding: 'utf8' });
    sonuc(`macOS: ${e.ad} plutil -lint`, l.status === 0, l.stdout + l.stderr);
  }
  const dok = spawnSync('/System/Library/CoreServices/pbs', ['-dump_pboard'], { encoding: 'utf8' });
  const listede = HIZLI_EYLEMLER.filter((e) => (dok.stdout || '').includes(e.ad));
  if (listede.length === HIZLI_EYLEMLER.length) sonuc('macOS: pbs Hizmetler listesinde ikisi de', true);
  else bilgi(`pbs -dump_pboard'da görünenler: ${listede.map((e) => e.ad).join(', ') || 'yok'} (Hizmetler listesi gecikmeli yenilenebilir)`);
  // Uçtan uca (bilgi): automator iş akışını çalıştırır; sahte uygulama paketi bağımsız değişkenlerini yazar
  const sahte = path.join(gecici, 'Sahte PDEfe.app');
  fs.mkdirSync(path.join(sahte, 'Contents', 'MacOS'), { recursive: true });
  const kayit = path.join(gecici, 'sahte-argv.txt');
  fs.writeFileSync(path.join(sahte, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>PDEfe</string><key>CFBundleIdentifier</key><string>tr.sinama.sahtepdefe</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  fs.writeFileSync(path.join(sahte, 'Contents', 'MacOS', 'PDEfe'), `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done > '${kayit}'\n`);
  fs.chmodSync(path.join(sahte, 'Contents', 'MacOS', 'PDEfe'), 0o755);
  const is = path.join(gecici, 'uctan', `${HIZLI_EYLEMLER[1].ad}.workflow`);
  for (const [ad, icerik] of Object.entries(hizliEylemDosyalari(HIZLI_EYLEMLER[1], sahte, simge))) { fs.mkdirSync(path.dirname(path.join(is, ad)), { recursive: true }); fs.writeFileSync(path.join(is, ad), icerik); }
  const girdi = path.join(gecici, 'Dilekçe örneği.pdf');
  fs.writeFileSync(girdi, '%PDF-1.4\n');
  const a = spawnSync('/usr/bin/automator', ['-i', girdi, is], { encoding: 'utf8', timeout: 60000 });
  for (let i = 0; i < 40 && !fs.existsSync(kayit); i++) await new Promise((c) => setTimeout(c, 250));
  const gelen = fs.existsSync(kayit) ? fs.readFileSync(kayit, 'utf8').split('\n').filter(Boolean) : null;
  if (J(gelen) === J(['--donustur', girdi])) sonuc('macOS uçtan uca: automator → betik → open -n → uygulama bağımsız değişkenleri aldı', true);
  else bilgi(`uçtan uca automator denemesi tutmadı (zorunlu değil): automator ${a.status} ${(a.stderr || '').slice(0, 300)}; gelen ${J(gelen)}`);
}

// ---------------------------------------------------------------- DLL ve menü (Windows)
if (WIN && argv.has('--cargo')) {
  const cargo = fs.existsSync(path.join(os.homedir(), '.cargo', 'bin', 'cargo.exe')) ? path.join(os.homedir(), '.cargo', 'bin', 'cargo.exe') : 'cargo';
  const r = spawnSync(cargo, ['test', '--release', '--locked'], { cwd: path.join(KOK, 'sagtik'), stdio: 'inherit' });
  sonuc('cargo test --release (DLL\'in birim testleri ve tests/dll.rs)', r.status === 0, r.status);
}
if (WIN && argv.has('--menu')) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(KOK, 'test', 'sagtik_menu.ps1')], { stdio: 'inherit' });
  sonuc('test/sagtik_menu.ps1 (Gezgin\'in menü kodu)', r.status === 0, r.status);
}

fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5 });
console.log(`\n${denetim} denetim, ${hata} hata`);
process.exit(hata ? 1 : 0);
