# -*- coding: utf-8 -*-
"""Temiz kopyalama testi: çekirdeğin metin_sec'i (satır / paragraf işaretleri) + renderer'ın temizMetin'i (Node ile), panoya giden
son metin. Her satırı ayrı PyMuPDF bloğu olan belgeler (mevzuat PDF'leri gibi) için sentetik PDF'ler üretir: satır başına ayrı
insert_text ayrı blok verir. 0.1.9'a dek bu belgelerde her satır ayrı paragraf çıkıyor, UDF'ye yapıştırınca girintili paragrafta
satırlar dağılıyordu. Kullanıcının belgesi (Masaüstü\\PDF DENEME\\1.5.6098.pdf) varsa ekran görüntüsündeki seçim de sınanır.
Çalıştırma: .venv\\Scripts\\python.exe test\\kopyalama_testi.py
"""
import os
import sys
import json
import subprocess

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(KOK, "core"))
sys.stdout.reconfigure(encoding="utf-8")

import pymupdf  # noqa: E402
import pdefe_core  # noqa: E402

CIKTI = os.path.join(KOK, "test", "cikti", "kopyalama")
FONT = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "times.ttf")
MASAUSTU_BELGE = os.path.join(os.path.expanduser("~"), "Desktop", "PDF DENEME", "1.5.6098.pdf")
ARALIK = 18.24          # satır aralığı (mevzuat PDF'indeki gibi)
SOL, GIRINTI = 70.94, 106.34

hatalar = []


def sonuc(ad, ok, ayrinti=""):
    if not ok:
        hatalar.append(ad)
    print(("OK   " if ok else "HATA ") + ad + (" — " + ayrinti if ayrinti else ""))


def temiz(hamlar):
    """temizMetin'i (src/renderer/metin.js) Node'da uygular; hamlar: metin listesi."""
    betik = ("globalThis.document = { addEventListener() {} };"
             "const girdi = JSON.parse(require('fs').readFileSync(0, 'utf8'));"
             "import('file:///' + process.argv[1].replace(/\\\\/g, '/')).then((m) => process.stdout.write(JSON.stringify(girdi.map(m.temizMetin))));")
    yol = os.path.join(KOK, "src", "renderer", "metin.js")
    r = subprocess.run(["node", "-e", betik, yol], input=json.dumps(hamlar), capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


def satir_basina_blok(ad, satirlar, altlik=None):
    """Her satırı ayrı insert_text (ayrı blok) olan PDF. satirlar: [(x, metin) | (x, metin, ek_bosluk)]. altlik: sayfanın altına
    içerik akışında en önce yazılan satır (sayfa altlığı gibi; blok numarası en küçük)."""
    doc = pymupdf.open()
    pg = doc.new_page(width=595.32, height=841.92)
    pg.insert_font(fontname="tnr", fontfile=FONT)
    if altlik:
        pg.insert_text((SOL, 790), altlik, fontname="tnr", fontsize=12)
    y = 90
    for s in satirlar:
        x, metin = s[0], s[1]
        y += s[2] if len(s) > 2 else 0
        pg.insert_text((x, y), metin, fontname="tnr", fontsize=12)
        y += ARALIK
    yol = os.path.join(CIKTI, ad + ".pdf")
    doc.save(yol)
    return yol


def secim(yol, sayfa, bas, son):
    """Sayfanın satırlarından bas sözcüğüyle başlayıp son sözcüğüyle biten seçim (ilk ve son satır sözcükte kesilir):
    renderer'ın gönderdiği gibi satır başına bir kutu (PDF koordinatı, üst-sol köken)."""
    pg = pymupdf.open(yol)[sayfa - 1]
    satirlar = sorted(pdefe_core._satir_gruplari(pg.get_text("words")).values(), key=lambda s: (s["y0"], s["x0"]))
    kutular, basladi = [], False
    for s in satirlar:
        ws = sorted(s["sozcukler"], key=lambda w: w[0])
        x0, x1 = s["x0"], s["x1"]
        if not basladi:
            ilk = next((w for w in ws if w[4] == bas), None)
            if ilk is None:
                continue
            basladi, x0 = True, ilk[0]
        bitis = next((w for w in ws if w[4] == son), None)
        if bitis is not None and bitis[0] >= x0:
            kutular.append([x0 - 1, s["y0"] - 0.5, bitis[2] + 1, s["y1"] + 0.5])
            break
        kutular.append([x0 - 1, s["y0"] - 0.5, x1 + 1, s["y1"] + 0.5])
    return pdefe_core.y_metin_sec({"yol": yol, "sayfa": sayfa, "kutular": kutular})["metin"]


def tum_sayfa(yol, sayfa=1):
    pg = pymupdf.open(yol)[sayfa - 1]
    kutular = [[s["x0"] - 1, s["y0"] - 0.5, s["x1"] + 1, s["y1"] + 0.5] for s in pdefe_core._satir_gruplari(pg.get_text("words")).values()]
    return pdefe_core.y_metin_sec({"yol": yol, "sayfa": sayfa, "kutular": kutular})["metin"]


def main():
    os.makedirs(CIKTI, exist_ok=True)
    vakalar = []   # (ad, ham, beklenen paragraflar)

    # 1) Kullanıcının durumu: ilk satır girintili paragraflar, seçim paragrafın ortasından başlıyor
    yol = satir_basina_blok("girintili", [
        (GIRINTI, "Bir işletmenin, mahiyeti veya faaliyette kullanılan malzeme, araçlar ya da güçler göz"),
        (SOL, "önünde tutulduğunda, bu işlerde uzman bir kişiden beklenen tüm özenin gösterilmesi dahi"),
        (SOL, "durumunda bile sıkça veya ağır zararlar doğurmaya elverişli olduğu sonucuna varılırsa, bunun"),
        (SOL, "önemli ölçüde tehlike arzeden bir işletme olduğu kabul edilir. Özellikle, herhangi bir kanunda"),
        (SOL, "benzeri tehlikeler arzeden işletmeler için özel bir tehlike sorumluluğu öngörülmüşse, bu da"),
        (SOL, "işletme de önemli ölçüde tehlike arzeden işletme sayılır."),
        (GIRINTI, "Belirli bir tehlike hâli için öngörülen özel sorumluluk hükümleri saklıdır."),
        (GIRINTI, "Önemli ölçüde tehlike arzeden bir işletmenin bu tür faaliyetine hukuk düzenince izin"),
        (SOL, "verilmiş olsa bile, zarar görenler, bu işletmenin faaliyetinin sebep olduğu zararlarının uygun"),
    ])
    vakalar.append(("girintili paragraflar, seçim ortadan", secim(yol, 1, "tehlike", "bile,"), [
        "tehlike arzeden bir işletme olduğu kabul edilir. Özellikle, herhangi bir kanunda benzeri tehlikeler arzeden işletmeler için özel bir tehlike sorumluluğu öngörülmüşse, bu da işletme de önemli ölçüde tehlike arzeden işletme sayılır.",
        "Belirli bir tehlike hâli için öngörülen özel sorumluluk hükümleri saklıdır.",
        "Önemli ölçüde tehlike arzeden bir işletmenin bu tür faaliyetine hukuk düzenince izin verilmiş olsa bile,",
    ]))
    # 2) Girintili satırın altındaki kısa son satır (yatayda neredeyse örtüşmez) aynı paragraftır
    yol = satir_basina_blok("kisa-son-satir", [
        (SOL, "işletmeyi işleten kişi de tacir sayılır ve bu sonuç her durumda aynen uygulanmaya devam eder."),
        (GIRINTI, "(2) Birinci fıkraya aykırı hareketin doğurduğu hukuki, cezai ve disipline ilişkin sorumluluk"),
        (SOL, "saklıdır."),
    ])
    vakalar.append(("girintili satır + kısa son satır", tum_sayfa(yol), [
        "işletmeyi işleten kişi de tacir sayılır ve bu sonuç her durumda aynen uygulanmaya devam eder.",
        "(2) Birinci fıkraya aykırı hareketin doğurduğu hukuki, cezai ve disipline ilişkin sorumluluk saklıdır.",
    ]))
    # 3) Madde imleri, büyük harfli başlık, içindekiler: her biri ayrı paragraf
    yol = satir_basina_blok("madde-baslik-icindekiler", [
        (SOL, "BİLİRKİŞİ RAPORUNUN KONUSU VE İLGİLİ DEĞERLENDİRMELER"),
        (SOL, "Dosya kapsamındaki belgeler incelenmiş olup aşağıdaki hususlar tespit edilmiştir ve buna"),
        (SOL, "göre değerlendirme yapılmıştır."),
        (SOL, "• Davacıya ait aracın hasar kayıtları sigorta şirketinden ayrıca istenmiş ve dosyaya konmuştur"),
        (SOL, "• Kaza tespit tutanağındaki kusur oranları ile eksper raporundaki tespitler karşılaştırılmıştır"),
        (SOL, "1. GİRİŞ ..................................................................................................... 3"),
        (SOL, "2. OLAY VE DEĞERLENDİRME .............................................................................. 4"),
    ])
    # (temizMetin noktalamadan önceki boşluğu siler: "GİRİŞ ......" → "GİRİŞ......"; bu testin konusu değil)
    vakalar.append(("madde imi, başlık, içindekiler", tum_sayfa(yol), [
        "BİLİRKİŞİ RAPORUNUN KONUSU VE İLGİLİ DEĞERLENDİRMELER",
        "Dosya kapsamındaki belgeler incelenmiş olup aşağıdaki hususlar tespit edilmiştir ve buna göre değerlendirme yapılmıştır.",
        "• Davacıya ait aracın hasar kayıtları sigorta şirketinden ayrıca istenmiş ve dosyaya konmuştur",
        "• Kaza tespit tutanağındaki kusur oranları ile eksper raporundaki tespitler karşılaştırılmıştır",
        "1. GİRİŞ..................................................................................................... 3",
        "2. OLAY VE DEĞERLENDİRME.............................................................................. 4",
    ]))
    # 4) Sayfa altlığı (içerikte önce yazılmış) son satıra yapışmaz; büyük boşluk paragraf arasıdır
    yol = satir_basina_blok("altlik-bosluk", [
        (SOL, "Araç sürücüsü akaryakıt istasyonundan trafiğe dik şekilde çıkmış, iki şerit artı iki şerit olmak"),
        (SOL, "üzere toplamda dört şeritlik yolun karşısında bulunan iş yeri alanına girmeye çalışmıştır ki bu"),
        (SOL, "da kusurun ağırlığını açıkça gösterir.", 0),
        (SOL, "Yeni paragraf, önceki paragraftan belirgin bir boşlukla ayrılmış olarak burada başlamaktadır ve", 14),
        (SOL, "bir sonraki satırda da aynen devam etmektedir; bu satır sayfanın gövdesindeki son satırdır ve"),
    ], altlik="DENEME 9. ASLİYE TİCARET MAHKEMESİ 2099/999 ESAS")
    vakalar.append(("sayfa altlığı ve paragraf boşluğu", tum_sayfa(yol), [
        "Araç sürücüsü akaryakıt istasyonundan trafiğe dik şekilde çıkmış, iki şerit artı iki şerit olmak üzere toplamda dört şeritlik yolun karşısında bulunan iş yeri alanına girmeye çalışmıştır ki bu da kusurun ağırlığını açıkça gösterir.",
        "Yeni paragraf, önceki paragraftan belirgin bir boşlukla ayrılmış olarak burada başlamaktadır ve bir sonraki satırda da aynen devam etmektedir; bu satır sayfanın gövdesindeki son satırdır ve",
        "DENEME 9. ASLİYE TİCARET MAHKEMESİ 2099/999 ESAS",
    ]))
    # 5) Çok satırlı bloklar (paragraf başına bir blok): eski davranış, blok değişimi paragraf arası
    doc = pymupdf.open()
    pg = doc.new_page(width=595.32, height=841.92)
    pg.insert_font(fontname="tnr", fontfile=FONT)
    pg.insert_textbox(pymupdf.Rect(SOL, 80, 525, 160), "Birinci paragraf iki satıra yayılan uzunlukta bir metindir ve kutunun sağ kenarına ulaşınca alt satıra geçer", fontname="tnr", fontsize=12)
    pg.insert_textbox(pymupdf.Rect(SOL, 125, 525, 200), "İkinci paragraf da ayrı bir blokta yazılmıştır ve aynı biçimde iki satıra yayılacak kadar uzun tutulmuştur", fontname="tnr", fontsize=12)
    yol = os.path.join(CIKTI, "cok-satirli-blok.pdf")
    doc.save(yol)
    vakalar.append(("çok satırlı bloklar (değişmedi)", tum_sayfa(yol), [
        "Birinci paragraf iki satıra yayılan uzunlukta bir metindir ve kutunun sağ kenarına ulaşınca alt satıra geçer",
        "İkinci paragraf da ayrı bir blokta yazılmıştır ve aynı biçimde iki satıra yayılacak kadar uzun tutulmuştur",
    ]))
    # 6) Satır sonundaki yumuşak tire sözcüğü boşluksuz birleştirir (temizMetin)
    vakalar.append(("yumuşak tire", "Ne var ki kim olduğumu merak eden insan\u00ad\nlara yazar olduğumu söylüyorum.\u00ad\n\nYeni paragraf.", [
        "Ne var ki kim olduğumu merak eden insanlara yazar olduğumu söylüyorum.", "Yeni paragraf.",
    ]))
    # 7) Kullanıcının belgesi (ekran görüntüsündeki seçim), varsa
    if os.path.exists(MASAUSTU_BELGE):
        vakalar.append(("1.5.6098.pdf s.15 (kullanıcının seçimi)", secim(MASAUSTU_BELGE, 15, "tehlike", "bile,"), [
            "tehlike arzeden bir işletme olduğu kabul edilir. Özellikle, herhangi bir kanunda benzeri tehlikeler arzeden işletmeler için özel bir tehlike sorumluluğu öngörülmüşse, bu işletme de önemli ölçüde tehlike arzeden işletme sayılır.",
            "Belirli bir tehlike hâli için öngörülen özel sorumluluk hükümleri saklıdır.",
            "Önemli ölçüde tehlike arzeden bir işletmenin bu tür faaliyetine hukuk düzenince izin verilmiş olsa bile,",
        ]))
    else:
        print("ATLANDI 1.5.6098.pdf (Masaüstü\\PDF DENEME'de yok)")

    temizler = temiz([ham for _, ham, _ in vakalar])
    for (ad, ham, beklenen), metin in zip(vakalar, temizler):
        paragraflar = metin.split("\n")
        ok = paragraflar == beklenen
        sonuc(ad, ok, "" if ok else "\n  beklenen: " + json.dumps(beklenen, ensure_ascii=False) + "\n  çıkan   : " + json.dumps(paragraflar, ensure_ascii=False) + "\n  ham     : " + json.dumps(ham, ensure_ascii=False))
    print("-" * 60)
    print(f"{len(vakalar) - len(hatalar)}/{len(vakalar)} başarılı.")
    sys.exit(1 if hatalar else 0)


if __name__ == "__main__":
    main()
