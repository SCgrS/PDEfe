// Otomatik kayıt (0.1.4–0.1.11 varsayılan açık; 0.1.12'den beri varsayılan kapalı, test bellekte açar): dosya başka programda kilitliyken engelleyici hata penceresi açılmaz, bir kez bildirilir,
// otomatik kayıt durur; kilit kalkınca Ctrl+S (elle kayıt) kaydeder ve otomatik kayıt yeniden çalışır.
// Kullanım: $env:PDEFE_CDP_PORT=<port>; $env:PDEFE_TEST_PDF=<PDF kopyası>; node test/surucu.mjs betik test/oto_kayit_kilit.mjs
import { spawn } from 'node:child_process';
const PDF = process.env.PDEFE_TEST_PDF;
let hata = 0;
const dogrula = (kosul, ad, ayrinti = '') => { console.log(`${kosul ? 'TAMAM' : 'HATA '} ${ad}${ayrinti ? ' — ' + ayrinti : ''}`); if (!kosul) hata++; };

export default async function ({ evalJs, bekle }) {
  await evalJs(`(async () => {
    window.__pdefeOtoYanit = { secim: 1 };
    for (const b of [...window.__pdefe.belgeler.values()]) await window.__pdefe.belgeKapat(b.id, { zorla: true });
    const varsayilan = window.__pdefe.ayar().otomatikKaydet;
    window.__pdefe.ayar().otomatikKaydet = true;   // yalnızca bellekte (ayar dosyasına yazılmaz)
    const b = await window.__pdefe.dosyaAc(${JSON.stringify(PDF)});
    await new Promise((r) => setTimeout(r, 1500));
    return varsayilan;
  })()`).then((v) => dogrula(v === false, 'otomatik kaydetme varsayılan olarak kapalı (0.1.12); test için bellekte açıldı'));
  // Dosyayı bir PDF okuyucu gibi kilitle: okumaya izin ver, yazmaya izin verme (FILE_SHARE_READ). PDEfe'nin çekirdeği dosyayı zaten okuma için
  // açık tuttuğundan paylaşımsız kilit (test/kilitle.py) alınamaz
  const betik = [
    'import sys, time, ctypes', 'from ctypes import wintypes', 'k = ctypes.windll.kernel32', 'k.CreateFileW.restype = wintypes.HANDLE',
    'h = k.CreateFileW(sys.argv[1], 0x80000000, 1, None, 3, 0, None)',
    "print('kilitlendi' if h != wintypes.HANDLE(-1).value else 'acilamadi %d' % ctypes.GetLastError(), flush=True)",
    'time.sleep(float(sys.argv[2]))', 'k.CloseHandle(h)',
  ].join('\n');
  const kilit = spawn('.venv/Scripts/python.exe', ['-c', betik, PDF.replace(/\//g, '\\'), '10'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const bitti = new Promise((c) => kilit.once('exit', c));
  const ilkSatir = await new Promise((c) => kilit.stdout.once('data', (v) => c(String(v).trim())));
  dogrula(ilkSatir === 'kilitlendi', 'dosya yazmaya kapalı kilitlendi', ilkSatir);
  // Vurgu ekle (modelden, sayfa 1'in ilk satırları)
  const vurgu = () => evalJs(`(() => { const n = window.__pdefe.aktif().notlar; const s = n.g.sayfalar[0].pdfSayfa.view; n.ekle({ tur: 'Highlight', sayfa: 1, rect: [60, s[3] - 120, 300, s[3] - 100], quadKutular: [[60, s[3] - 120, 300, s[3] - 100]], quads: null, icerik: '', yazar: 'Test', renk: '#ffd100', opaklik: 0.4, konu: 'Vurgu' }); return 1; })()`);
  await vurgu();
  await bekle(3500);
  let d = await evalJs(`(() => { const b = window.__pdefe.aktif(); return { degisti: b.degisti, durdu: !!b._otoKayitDurdu, pencere: !!window.__pdefeOtoYanit.son, bildirim: document.querySelector('#bildirim')?.textContent || '' }; })()`);
  dogrula(d.durdu && d.degisti && !d.pencere, 'kilitli dosyada otomatik kayıt engelleyici pencere açmadan durur', JSON.stringify(d));
  dogrula(/otomatik kaydedilemedi/.test(d.bildirim), 'bildirim gösterilir', d.bildirim.slice(0, 80));
  // İkinci değişiklik yeni deneme / pencere açmaz
  await vurgu();
  await bekle(2500);
  d = await evalJs(`(() => ({ pencere: !!window.__pdefeOtoYanit.son, kaydediliyor: !!window.__pdefe.aktif().kaydediliyor }))()`);
  dogrula(!d.pencere, 'otomatik kayıt durduktan sonra yeni değişiklik pencere açmaz');
  // Kilit bırakılınca elle kayıt
  await bitti;
  const kayit = await evalJs(`(async () => { const b = window.__pdefe.aktif(); const r = await window.__pdefe.belgeKaydet(b); return { r, degisti: b.degisti, durdu: !!b._otoKayitDurdu }; })()`);
  dogrula(kayit.r === true && !kayit.degisti && !kayit.durdu, 'kilit kalkınca Ctrl+S kaydeder, otomatik kayıt yeniden açılır', JSON.stringify(kayit));
  await vurgu();
  await bekle(3000);
  d = await evalJs(`(() => ({ degisti: window.__pdefe.aktif().degisti }))()`);
  dogrula(!d.degisti, 'sonraki değişiklik yeniden otomatik kaydedilir');
  console.log(hata ? `BİTTİ: ${hata} hata` : 'BİTTİ: hepsi tamam');
}
