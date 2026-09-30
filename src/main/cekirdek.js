// pdefe-core (PyMuPDF) yardımcı süreciyle JSON-RPC (satır başına bir JSON) köprüsü.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';

export class Cekirdek {
  constructor({ kok, paketli, kaynaklar, surum }) {
    this.kok = kok;
    this.paketli = paketli;
    this.kaynaklar = kaynaklar;
    this.surum = surum;             // PDEFE_SURUM: çekirdek yazdığı notlara üretici sürümü olarak koyar (islemler/notlar.py)
    this.surec = null;
    this.sayac = 0;
    this.bekleyen = new Map();     // id → {coz, reddet, ilerleme}
    this.istekEslemesi = new Map(); // renderer istek kimliği → çekirdek kimliği
    this.hazirSozu = null;
    this.kapaniyor = false;
  }

  komut() {
    if (this.paketli) {
      // Tek klasör PyInstaller paketi (resources/pdefe-core/pdefe-core.exe + _internal). 0.1.17'ye dek tek dosyaydı: her açılışta
      // %TEMP%\_MEI* altına ~70 MB açılıyordu (~0,9 sn) ve çekirdek kapanışta öldürülünce klasör kalıyordu.
      const exe = path.join(this.kaynaklar, 'pdefe-core', 'pdefe-core.exe');
      return { cmd: exe, args: [] };
    }
    const python = path.join(this.kok, '.venv', 'Scripts', 'python.exe');
    const betik = path.join(this.kok, 'core', 'pdefe_core.py');
    if (fs.existsSync(python)) return { cmd: python, args: ['-X', 'utf8', betik] };
    return { cmd: 'python', args: ['-X', 'utf8', betik] };
  }

  baslat() {
    if (this.hazirSozu) return this.hazirSozu;
    const { cmd, args } = this.komut();
    this.hazirSozu = new Promise((coz, reddet) => {
      let p;
      try {
        p = spawn(cmd, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', ...(this.surum ? { PDEFE_SURUM: this.surum } : {}) },
        });
      } catch (e) { reddet(e); return; }
      this.surec = p;
      p.on('error', (e) => { console.error('[çekirdek] hata:', e.message); reddet(e); });
      p.on('exit', (kod) => {
        console.error('[çekirdek] çıktı, kod:', kod);
        this.surec = null; this.hazirSozu = null;
        for (const [, b] of this.bekleyen) b.reddet(new Error('Çekirdek süreç beklenmedik biçimde kapandı.'));
        this.bekleyen.clear();
      });
      p.stderr.setEncoding('utf8');
      p.stderr.on('data', (d) => console.error('[çekirdek]', d.trim()));
      const rl = readline.createInterface({ input: p.stdout });
      rl.on('line', (satir) => this.satirIsle(satir));
      // İlk ping ile hazır olduğunu doğrula
      this.gonder('ping', {}).then(() => coz(true)).catch(reddet);
    });
    return this.hazirSozu;
  }

  satirIsle(satir) {
    if (!satir.trim()) return;
    let m;
    try { m = JSON.parse(satir); } catch { console.error('[çekirdek] bozuk satır:', satir.slice(0, 200)); return; }
    const b = this.bekleyen.get(m.id);
    if (!b) return;
    if (m.progress) { b.ilerleme?.(m.progress); return; }
    this.bekleyen.delete(m.id);
    if (m.error) b.reddet(Object.assign(new Error(m.error.message || 'Çekirdek hatası'), { kod: m.error.code, ayrinti: m.error.data }));
    else b.coz(m.result);
  }

  gonder(yontem, params, ilerleme, istekId = null) {
    return new Promise((coz, reddet) => {
      // kapaniyor: durdur() stdin'i kapattı; kapanan akışa yazılmaz (son pencere kapanırken gelen istek)
      if (!this.surec || this.kapaniyor) { reddet(new Error('Çekirdek çalışmıyor.')); return; }
      const id = ++this.sayac;
      this.bekleyen.set(id, { coz, reddet, ilerleme });
      if (istekId != null) this.istekEslemesi.set(istekId, id);
      this.surec.stdin.write(JSON.stringify({ id, method: yontem, params: params || {} }) + '\n');
    });
  }

  async cagir(yontem, params, ilerleme, istekId = null) {
    if (this.kapaniyor) throw new Error('Çekirdek çalışmıyor.');   // uygulama kapanıyor: çekirdek yeniden başlatılmaz
    await this.baslat();
    try { return await this.gonder(yontem, params, ilerleme, istekId); }
    finally { if (istekId != null) this.istekEslemesi.delete(istekId); }
  }

  /** Renderer istek kimliğine karşılık gelen çalışan işi iptal eder. */
  iptal(istekId) {
    const id = this.istekEslemesi.get(istekId);
    if (id == null) return Promise.resolve(false);
    return this.gonder('iptal', { id }).then(() => true).catch(() => false);
  }

  /** Uygulama kapanırken: stdin kapatılır, çekirdek kuyruktaki işi bitirip (en çok ~5 sn, pdefe_core.main) kendiliğinden çıkar.
   *  Hemen kill() edilmez: yazılmakta olan çıktı dosyası yarım kalmasın. Ana süreç o ana dek yaşıyorsa 8 sn sonra zorla kapatılır. */
  durdur() {
    this.kapaniyor = true;
    const p = this.surec;
    if (!p) return;
    try { p.stdin.end(); } catch {}
    const zorla = setTimeout(() => { try { p.kill(); } catch {} }, 8000);
    zorla.unref();
    p.once('exit', () => clearTimeout(zorla));
  }
}
