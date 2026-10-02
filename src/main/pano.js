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

/** macOS: AppleScript'in panoya dosya koyması (POSIX file → dosya başvurusu). Yol betiğe gömülmez, argüman olarak geçer. */
function macPanoyaKopyala(yol) {
  return new Promise((coz) => {
    execFile('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'set the clipboard to (POSIX file (item 1 of argv))', '-e', 'end run', String(yol)],
      { timeout: 10000 }, (hata, _cikti, stderr) => coz({ tamam: !hata, hata: hata ? String(stderr || hata.message).trim() : '' }));
  });
}
