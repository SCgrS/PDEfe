# -*- coding: utf-8 -*-
"""Çekirdeğe işbirlikçi iptal: stdin okuyucu ana iş parçacığında, işler tek işçi iş parçacığında;
'iptal' isteği kuyruğu atlar ve bayrak koyar; ilerleme çağrıları bayrağı görünce IptalEdildi fırlatır."""

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:80])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

yama("core/pdefe_core.py", [
("""import time
import traceback
""", """import time
import traceback
import threading
import queue
"""),
("""def y_iptal(p):
    return {"ok": True}
""", """class IptalEdildi(Exception):
    \"\"\"Kullanıcı işlemi iptal etti (ilerleme noktasında fark edilir).\"\"\"


_iptal_bayraklari = set()
_iptal_kilidi = threading.Lock()


def y_iptal(p):
    \"\"\"Verilen istek kimliği için iptal bayrağı koyar (ana iş parçacığında, kuyruğu beklemeden işlenir).\"\"\"
    try:
        hedef = int(p.get("id"))
    except (TypeError, ValueError):
        return {"ok": False}
    with _iptal_kilidi:
        _iptal_bayraklari.add(hedef)
    return {"ok": True}
"""),
("""def ilerleme_yap(istek_id):
    def f(yuzde, mesaj=""):
        yaz({"id": istek_id, "progress": {"yuzde": yuzde, "mesaj": mesaj}})
    return f


def main():
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    for satir in sys.stdin:
        satir = satir.strip()
        if not satir:
            continue
        try:
            istek = json.loads(satir)
        except Exception as e:
            yaz({"id": None, "error": {"code": -32700, "message": "Bozuk JSON: %s" % e}})
            continue
        istek_id = istek.get("id")
        yontem = istek.get("method")
        params = istek.get("params") or {}
        f = YONTEMLER.get(yontem)
        if not f:
            yaz({"id": istek_id, "error": {"code": -32601, "message": "Bilinmeyen yöntem: %s" % yontem}})
            continue
        try:
            params["_ilerleme"] = ilerleme_yap(istek_id)
            sonuc = f(params)
            yaz({"id": istek_id, "result": sonuc})
        except Exception as e:
            yaz({"id": istek_id, "error": {"code": -32000, "message": str(e), "data": traceback.format_exc()}})
""", """_yaz_kilidi = threading.Lock()


def yaz_guvenli(obj):
    with _yaz_kilidi:
        yaz(obj)


def ilerleme_yap(istek_id):
    def f(yuzde, mesaj=""):
        with _iptal_kilidi:
            iptal = istek_id in _iptal_bayraklari
        if iptal:
            raise IptalEdildi()
        yaz_guvenli({"id": istek_id, "progress": {"yuzde": yuzde, "mesaj": mesaj}})
    return f


def _istek_isle(istek):
    istek_id = istek.get("id")
    yontem = istek.get("method")
    params = istek.get("params") or {}
    f = YONTEMLER.get(yontem)
    if not f:
        yaz_guvenli({"id": istek_id, "error": {"code": -32601, "message": "Bilinmeyen yöntem: %s" % yontem}})
        return
    try:
        params["_ilerleme"] = ilerleme_yap(istek_id)
        sonuc = f(params)
        yaz_guvenli({"id": istek_id, "result": sonuc})
    except IptalEdildi:
        yaz_guvenli({"id": istek_id, "error": {"code": -32800, "message": "İşlem iptal edildi."}})
    except Exception as e:
        yaz_guvenli({"id": istek_id, "error": {"code": -32000, "message": str(e), "data": traceback.format_exc()}})
    finally:
        with _iptal_kilidi:
            _iptal_bayraklari.discard(istek_id)


def _isci(kuyruk):
    while True:
        istek = kuyruk.get()
        if istek is None:
            return
        _istek_isle(istek)


def main():
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    kuyruk = queue.Queue()
    isci = threading.Thread(target=_isci, args=(kuyruk,), daemon=True)
    isci.start()
    for satir in sys.stdin:
        satir = satir.strip()
        if not satir:
            continue
        try:
            istek = json.loads(satir)
        except Exception as e:
            yaz_guvenli({"id": None, "error": {"code": -32700, "message": "Bozuk JSON: %s" % e}})
            continue
        if istek.get("method") == "iptal":
            # Kuyruğu beklemeden, çalışan işe bayrak koy
            yaz_guvenli({"id": istek.get("id"), "result": y_iptal(istek.get("params") or {})})
            continue
        kuyruk.put(istek)
    kuyruk.put(None)
    isci.join(timeout=5)
"""),
])

# cekirdek.js: istek kimliği eşlemesi ve iptal
yama("src/main/cekirdek.js", [
("""    this.bekleyen = new Map();     // id → {coz, reddet, ilerleme}""",
 """    this.bekleyen = new Map();     // id → {coz, reddet, ilerleme}
    this.istekEslemesi = new Map(); // renderer istek kimliği → çekirdek kimliği"""),
("""  gonder(yontem, params, ilerleme) {
    return new Promise((coz, reddet) => {
      if (!this.surec) { reddet(new Error('Çekirdek çalışmıyor.')); return; }
      const id = ++this.sayac;
      this.bekleyen.set(id, { coz, reddet, ilerleme });
      this.surec.stdin.write(JSON.stringify({ id, method: yontem, params: params || {} }) + '\\n');
    });
  }

  async cagir(yontem, params, ilerleme) {
    await this.baslat();
    return this.gonder(yontem, params, ilerleme);
  }

  iptal(istekId) { return this.gonder('iptal', { id: istekId }).catch(() => false); }""",
 """  gonder(yontem, params, ilerleme, istekId = null) {
    return new Promise((coz, reddet) => {
      if (!this.surec) { reddet(new Error('Çekirdek çalışmıyor.')); return; }
      const id = ++this.sayac;
      this.bekleyen.set(id, { coz, reddet, ilerleme });
      if (istekId != null) this.istekEslemesi.set(istekId, id);
      this.surec.stdin.write(JSON.stringify({ id, method: yontem, params: params || {} }) + '\\n');
    });
  }

  async cagir(yontem, params, ilerleme, istekId = null) {
    await this.baslat();
    try { return await this.gonder(yontem, params, ilerleme, istekId); }
    finally { if (istekId != null) this.istekEslemesi.delete(istekId); }
  }

  /** Renderer istek kimliğine karşılık gelen çalışan işi iptal eder. */
  iptal(istekId) {
    const id = this.istekEslemesi.get(istekId);
    if (id == null) return Promise.resolve(false);
    return this.gonder('iptal', { id }).then(() => true).catch(() => false);
  }"""),
])

yama("src/main/main.js", [
("""  ipcMain.handle('cekirdek:cagir', (_e, yontem, params, istekId) =>
    cekirdek.cagir(yontem, params, (ilerleme) => pencereyeGonder('cekirdek:ilerleme', istekId, ilerleme)));""",
 """  ipcMain.handle('cekirdek:cagir', (_e, yontem, params, istekId) =>
    cekirdek.cagir(yontem, params, (ilerleme) => pencereyeGonder('cekirdek:ilerleme', istekId, ilerleme), istekId));"""),
])

# uygulama.js: cekirdek() sarmalayıcısı istek kimliğini dışarı versin (iptal için)
yama("src/renderer/uygulama.js", [
("""const cekirdek = (yontem, params, ilerleme) => {
  const istekId = ++ilerlemeSayac;
  if (ilerleme) ilerlemeDinleyiciler.set(istekId, ilerleme);
  return pdefe.cagir('cekirdek:cagir', yontem, params, istekId).finally(() => ilerlemeDinleyiciler.delete(istekId));
};""",
 """const cekirdek = (yontem, params, ilerleme) => {
  const istekId = ++ilerlemeSayac;
  if (ilerleme) ilerlemeDinleyiciler.set(istekId, ilerleme);
  const soz = pdefe.cagir('cekirdek:cagir', yontem, params, istekId).finally(() => ilerlemeDinleyiciler.delete(istekId));
  soz.istekId = istekId;                                   // araç pencereleri iptal için kullanır
  soz.iptal = () => pdefe.cagir('cekirdek:iptal', istekId);
  return soz;
};"""),
])
