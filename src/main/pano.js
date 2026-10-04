// PDF'i kopyala (0.1.21'e dek Paylaş): PDF dosyasını Windows dosya panosuna (CF_HDROP) koyar. Gezgin, Outlook,
// WhatsApp, UYAP gibi yerlere Ctrl+V ile yapıştırılabilir. macOS'ta (0.2.0) Finder'ın Kopyala'sı gibi dosya başvurusu panoya konur
// (Finder, Mail, WhatsApp'ta ⌘V).
import { spawn, execFile } from 'node:child_process';
import path from 'node:path';

// Tam yol: çıplak ad sürecin çalışma klasöründe (çift tıklanan PDF'in klasörü) de aranabilirdi (0.1.12)
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

export function panoyaDosyaKopyala(yol) {
  if (process.platform === 'darwin') return macPanoyaKopyala(yol);
  return new Promise((coz) => {
    const betik = `
Add-Type -AssemblyName System.Windows.Forms
$l = New-Object System.Collections.Specialized.StringCollection
$l.Add([string]$env:PDEFE_DOSYA) | Out-Null
[System.Windows.Forms.Clipboard]::SetFileDropList($l)
`;
    const p = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-Command', betik], {
      windowsHide: true, env: { ...process.env, PDEFE_DOSYA: yol },
    });
    let hata = '';
    p.stderr.on('data', (d) => { hata += d; });
    p.on('exit', (kod) => coz({ tamam: kod === 0, hata: hata.trim() }));
    p.on('error', (e) => coz({ tamam: false, hata: e.message }));
  });
}

// macOS: Finder'ın Kopyala'sı gibi panoya dosyanın adresi (public.file-url) ve yolu (NSFilenamesPboardType) yazılır; Finder, Mail ⌘V ile
// dosyayı yapıştırır. Betik JavaScript for Automation'la AppKit'i doğrudan çağırır (izin istemez); yol betiğe gömülmez, argüman olarak geçer.
// Veri hemen yazılır (setString / setPropertyList): writeObjects(NSURL) bazı türleri "sonra verilecek" diye bırakıyor, yazan süreç hemen
// kapandığından pano ara sıra boş kalıyordu (0.2.0 yayım derlemesinin sınaması). AppleScript'in "set the clipboard to POSIX file" yolu
// panoya Finder'ın yapıştıramadığı bir veri koyuyordu.
const MAC_PANO_BETIGI = [
  "ObjC.import('AppKit');",
  'function run(argv) {',
  '  var pano = $.NSPasteboard.generalPasteboard;',
  '  pano.clearContents;',
  "  var adres = pano.setStringForType($.NSURL.fileURLWithPath(argv[0]).absoluteString, 'public.file-url');",
  "  var yol = pano.setPropertyListForType($([argv[0]]), 'NSFilenamesPboardType');",
  '  return adres && yol ? "tamam" : "yazilamadi";',
  '}',
].join('\n');

/**
 * Panoya metin yazar (pano: Electron'un clipboard'u). yalnizcaPanodaysa verilirse yalnızca pano hâlâ bu metni taşıyorsa yazılır (kopyalamadan
 * sonra gelen temiz metin; bu arada başka bir şey kopyalandıysa onun yerine geçmez, 0.1.23); satır sonları karşılaştırmada eşitlenir.
 * Electron 44'te readText / writeText Promise döndürür: beklenmeden karşılaştırılan "[object Promise]" hiç tutmuyor, temiz metin panoya
 * hiç yazılmıyordu (0.2.1). Döner: yazıldıysa true.
 */
export async function panoyaMetinYaz(pano, metin, yalnizcaPanodaysa = null) {
  const esitle = (s) => String(s ?? '').replace(/\r\n/g, '\n');
  try {
    if (yalnizcaPanodaysa != null && esitle(await pano.readText()) !== esitle(yalnizcaPanodaysa)) return false;
    await pano.writeText(String(metin ?? ''));
    return true;
  } catch (e) {
    console.error('[pano] metin yazılamadı:', e?.message || e);
    return false;
  }
}

function macPanoyaKopyala(yol) {
  return new Promise((coz) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_PANO_BETIGI, String(yol)], { timeout: 10000 }, (hata, cikti, stderr) => {
      const tamam = !hata && String(cikti).trim() === 'tamam';
      coz({ tamam, hata: tamam ? '' : String(stderr || hata?.message || cikti || 'Panoya yazılamadı.').trim() });
    });
  });
}
