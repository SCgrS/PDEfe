# -*- coding: utf-8 -*-
"""Güncelleme modülünü main.js/uygulama.js'e bağlar; araclar.css'i index.html'e ekler."""

def yama(p, ciftler):
    s = open(p, encoding="utf-8").read()
    for eski, yeni in ciftler:
        assert eski in s, "%s içinde bulunamadı: %s" % (p, eski[:80])
        s = s.replace(eski, yeni, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("yamalandı:", p)

yama("src/main/main.js", [
("""import { yazdirmaKur } from './yazdir.js';""",
 """import { yazdirmaKur } from './yazdir.js';
import { guncellemeKur } from './guncelleme.js';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;"""),
("""  protokolKur();
  ipcKur();""",
 """  protokolKur();
  ipcKur();
  try {
    guncellemeKur({ app, ipcMain, autoUpdater, pencereyeGonder, ayarAl, ayarKoy, kapatmayaHazirla: () => { kapatOnayli = true; } });
  } catch (e) { console.error('[güncelleme] kurulamadı:', e); }"""),
])

yama("src/renderer/uygulama.js", [
("""import { aracKomutlari } from './araclar/index.js';""",
 """import { aracKomutlari } from './araclar/index.js';
import { guncellemeSeridiKur } from './guncelleme.js';"""),
("""let _oturumZaman = null;
function oturumKaydet() {""",
 """let _oturumZaman = null;
/** Oturumu (açık sekmeler + sayfa konumları) beklemeden yazar; güncelleme kurulumu ve kapatma öncesi. */
function oturumKaydetHemen() {
  clearTimeout(_oturumZaman);
  for (const b of belgeler.values()) sayfaKonumuKaydet(b, true);
  const liste = sekmeler.sekmeler.map((s) => belgeler.get(s.id)).filter(Boolean).map((b) => ({ yol: b.yol, sayfa: b.gorunum.gecerli, aktif: b.id === aktifId }));
  return ayarKoy('acikSekmeler', liste);
}
function oturumKaydet() {"""),
("""function komutCalistir(id, veri) {""",
 """// Güncelleme şeridi
let guncelleme = null;
try {
  guncelleme = guncellemeSeridiKur({ pdefe, serit: $('#guncelleme-seridi'), bildir, kapatmadanOnce: () => oturumKaydetHemen() });
  komutlar['yardim.guncelle'] = () => guncelleme.denetle();
} catch (e) { console.error('Güncelleme şeridi kurulamadı', e); }

function komutCalistir(id, veri) {"""),
("""  for (const b of belgeler.values()) sayfaKonumuKaydet(b, true);
  await pdefe.cagir('pencere:kapatOnayla');""",
 """  await oturumKaydetHemen();
  await pdefe.cagir('pencere:kapatOnayla');"""),
])

yama("src/renderer/index.html", [
("""  <link rel="stylesheet" href="stil.css">""", """  <link rel="stylesheet" href="stil.css">
  <link rel="stylesheet" href="araclar/araclar.css">"""),
])
