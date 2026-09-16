# -*- coding: utf-8 -*-
"""Electron 44'te clipboard.readImage yok: panodaki görseli PowerShell (System.Windows.Forms.Clipboard) ile PNG'ye çevir."""

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:80])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

yama("src/main/main.js", [
("""  ipcMain.handle('pano:gorsel', () => { const img = clipboard.readImage(); return img.isEmpty() ? null : img.toPNG().toString('base64'); });""",
 """  ipcMain.handle('pano:gorsel', () => new Promise((coz) => {
    // Electron 44'te clipboard.readImage yok; panodaki görseli .NET ile geçici PNG'ye yazıp base64 döndür
    const { spawn } = require('node:child_process');
    const hedef = path.join(app.getPath('temp'), 'PDEfe', `pano-${Date.now()}.png`);
    fs.mkdirSync(path.dirname(hedef), { recursive: true });
    const betik = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) { exit 3 }
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img -eq $null) { exit 3 }
$img.Save($env:PDEFE_HEDEF, [System.Drawing.Imaging.ImageFormat]::Png)
exit 0`;
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-Command', betik], { windowsHide: true, env: { ...process.env, PDEFE_HEDEF: hedef } });
    p.on('exit', (kod) => {
      if (kod !== 0) { coz(null); return; }
      fs.promises.readFile(hedef).then((b) => { fs.promises.unlink(hedef).catch(() => {}); coz(b.toString('base64')); }).catch(() => coz(null));
    });
    p.on('error', () => coz(null));
  }));"""),
])
