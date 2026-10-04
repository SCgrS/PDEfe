# -*- coding: utf-8 -*-
"""Temiz kopyalama testi: çekirdeğin metin_sec'i (satır / paragraf işaretleri) + renderer'ın temizMetin'i (Node ile), panoya giden
son metin. Her satırı ayrı PyMuPDF bloğu olan belgeler (mevzuat PDF'leri gibi) için sentetik PDF'ler üretir: satır başına ayrı
insert_text ayrı blok verir. 0.1.9'a dek bu belgelerde her satır ayrı paragraf çıkıyor, UDF'ye yapıştırınca girintili paragrafta
satırlar dağılıyordu. 0.1.10'a dek belgedeki boş satırlar (kanunda bölüm başlığından önceki boşluk) kayboluyordu: boş satır boş
paragraf olarak gelmeli, paragraf aralığı ve çift satır aralığı boş satır sayılmamalı, sayfa geçişindeki boş paragraf da gelmeli.
Kullanıcının belgesi (Masaüstü\\PDF DENEME\\1.5.6098.pdf) ve test\\pdf'teki kanun / makale PDF'leri varsa onlardaki seçimler de sınanır.
0.2.1: satırın ortasından başlayan seçimde noktalamayla biten dolu ilk satır paragrafı bölmüyor (çekirdeğin ilk_dolu'su), "HMK’ya" gibi
kesme işaretli kısaltmayla başlayan satır başlık sayılmıyor; satır sonu tiresi şapkalı harften sonra da birleşir, sayı aralığında kalır.
Çalıştırma: .venv\\Scripts\\python.exe test\\kopyalama_testi.py   (PDF'lerin klasörü: KOPYALAMA_KLASORU, yoksa test\\cikti\\kopyalama)
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

CIKTI = os.environ.get("KOPYALAMA_KLASORU") or os.path.join(KOK, "test", "cikti", "kopyalama")
FONT = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "times.ttf")
MASAUSTU_BELGE = os.path.join(os.path.expanduser("~"), "Desktop", "PDF DENEME", "1.5.6098.pdf")
TMK_BELGE = os.path.join(KOK, "test", "pdf", "mevzuat_4721_TMK.pdf")
TTK_BELGE = os.path.join(KOK, "test", "pdf", "mevzuat_6102_TTK.pdf")
MAKALE_BELGE = os.path.join(KOK, "test", "pdf", "dergipark_5104529_zamanasimi.pdf")
ARALIK = 18.24          # satır aralığı (mevzuat PDF'indeki gibi)
SOL, GIRINTI = 70.94, 106.34

hatalar, denetimler = [], []


def sonuc(ad, ok, ayrinti=""):
    denetimler.append(ad)
    if not ok:
        hatalar.append(ad)
    print(("OK   " if ok else "HATA ") + ad + (" — " + ayrinti if ayrinti else ""))


def temiz(hamlar):
    """temizMetin'i (src/renderer/metin.js) Node'da uygular; hamlar: metin listesi. Öğe metin değil sayfa sayfa metin_sec
    sonuçlarıysa (liste) uygulama.js'in kopyalama olayı gibi sayfaMetinleriniBirlestir ile birleştirilir ve ilk sonucun ilk_dolu'su
    verilir; {"ham", "secenek"} sözlüğüyse temizMetin(ham, secenek)."""
    betik = ("globalThis.document = { addEventListener() {} };"
             "const girdi = JSON.parse(require('fs').readFileSync(0, 'utf8'));"
             "import('file:///' + process.argv[1].replace(/\\\\/g, '/')).then((m) => process.stdout.write(JSON.stringify("
             "girdi.map((h) => Array.isArray(h) ? m.temizMetin(m.sayfaMetinleriniBirlestir(h), { ilkDolu: !!h.find((r) => r?.metin?.trim())?.ilk_dolu })"
             " : typeof h === 'object' ? m.temizMetin(h.ham, h.secenek) : m.temizMetin(h)))));")
    yol = os.path.join(KOK, "src", "renderer", "metin.js")
    r = subprocess.run(["node", "-e", betik, yol], input=json.dumps(hamlar), capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


def satir_basina_blok(ad, satirlar, altlik=None, aralik=ARALIK, sonraki_sayfa=None, boy=841.92):
    """Her satırı ayrı insert_text (ayrı blok) olan PDF. satirlar: [(x, metin) | (x, metin, ek_bosluk)]; metni " " olan satır boş
    paragraftır (Word ve UYAP boş paragrafı bir boşluk karakteriyle yazar). altlik: sayfanın altına içerik akışında en önce yazılan
    satır (sayfa altlığı gibi; blok numarası en küçük). aralik: satırların üstten üste uzaklığı. sonraki_sayfa: ikinci sayfanın satırları.
    boy: sayfa yüksekliği (senaryo16 iki sayfanın geçişini ekranda birlikte görsün diye kısa sayfa)."""
    doc = pymupdf.open()
    for i, liste in enumerate([satirlar] + ([sonraki_sayfa] if sonraki_sayfa else [])):
        pg = doc.new_page(width=595.32, height=boy)
        pg.insert_font(fontname="tnr", fontfile=FONT)
        if altlik and i == 0:
            pg.insert_text((SOL, 790), altlik, fontname="tnr", fontsize=12)
        y = 90
        for s in liste:
            x, metin = s[0], s[1]
            y += s[2] if len(s) > 2 else 0
            pg.insert_text((x, y), metin, fontname="tnr", fontsize=12)
            y += aralik
    yol = os.path.join(CIKTI, ad + ".pdf")
    doc.save(yol)
    return yol


def secim(yol, sayfa, bas, son):
    """Tek sayfalık seçim, temiz() için sonuç listesi olarak (renderer gibi ilk_dolu'suyla)."""
    return [secim_sonucu(yol, sayfa, bas, son)]


def secim_sonucu(yol, sayfa, bas, son):
    """Sayfanın satırlarından bas sözcüğüyle başlayıp son sözcüğüyle biten seçim (ilk ve son satır sözcükte kesilir; bas None ise
    sayfanın ilk satırından, son None ise son satırına): renderer'ın gönderdiği gibi satır başına bir kutu (PDF koordinatı, üst-sol
    köken). Döner: metin_sec sonucu ({metin, bas_bosluk, son_bosluk})."""
    pg = pymupdf.open(yol)[sayfa - 1]
    satirlar = sorted(pdefe_core._satir_gruplari(pg.get_text("words")).values(), key=lambda s: (s["y0"], s["x0"]))
    kutular, basladi = [], bas is None
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
    return pdefe_core.y_metin_sec({"yol": yol, "sayfa": sayfa, "kutular": kutular})


def tum_sayfa(yol, sayfa=1):
    pg = pymupdf.open(yol)[sayfa - 1]
    kutular = [[s["x0"] - 1, s["y0"] - 0.5, s["x1"] + 1, s["y1"] + 0.5] for s in pdefe_core._satir_gruplari(pg.get_text("words")).values()]
    return [pdefe_core.y_metin_sec({"yol": yol, "sayfa": sayfa, "kutular": kutular})]


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
    # 4) Sayfa altlığı (içerikte önce yazılmış) son satıra yapışmaz; büyük boşluk paragraf arasıdır. 14 pt ek boşluk (1,77 satır
    # aralığı) boş satır değil (paragraf aralığı); altlığın önündeki sayfa boyu boşluk boş satırdır (0.1.11)
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
        "",
        "DENEME 9. ASLİYE TİCARET MAHKEMESİ 2099/999 ESAS",
    ]))
    # 5) Çok satırlı bloklar (paragraf başına bir blok): eski davranış, blok değişimi paragraf arası. insert_textbox satır aralığı
    # 11,84 pt; 8 pt paragraf aralığında (1,68 kat; daha azında PyMuPDF iki kutuyu tek blok okur) boş satır yok, bir satırlık
    # boşlukta boş satır var (0.1.11)
    for ad, ust, beklenen in (("çok satırlı bloklar (değişmedi)", 80 + 2 * 11.84 + 8, []), ("çok satırlı bloklar, arada bir satır boşluk", 80 + 3 * 11.84, [""])):
        doc = pymupdf.open()
        pg = doc.new_page(width=595.32, height=841.92)
        pg.insert_font(fontname="tnr", fontfile=FONT)
        pg.insert_textbox(pymupdf.Rect(SOL, 80, 525, 160), "Birinci paragraf iki satıra yayılan uzunlukta bir metindir ve kutunun sağ kenarına ulaşınca alt satıra geçer", fontname="tnr", fontsize=12)
        pg.insert_textbox(pymupdf.Rect(SOL, ust, 525, ust + 75), "İkinci paragraf da ayrı bir blokta yazılmıştır ve aynı biçimde iki satıra yayılacak kadar uzun tutulmuştur", fontname="tnr", fontsize=12)
        yol = os.path.join(CIKTI, "cok-satirli-blok%s.pdf" % ("-bos-satir" if beklenen else ""))
        doc.save(yol)
        vakalar.append((ad, tum_sayfa(yol), [
            "Birinci paragraf iki satıra yayılan uzunlukta bir metindir ve kutunun sağ kenarına ulaşınca alt satıra geçer",
            *beklenen,
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

    # 8–14) Boş satır (0.1.11). Kanun metni: paragraf, boş paragraf (bir boşluk karakteri), bölüm başlıkları
    onceki_paragraf = [
        (GIRINTI, "Önemli ölçüde tehlike arzeden bir işletmenin bu tür faaliyetine hukuk düzenince izin"),
        (SOL, "verilmiş olsa bile, zarar görenler, bu işletmenin faaliyetinin sebep olduğu zararlarının uygun"),
        (SOL, "bir bedelle denkleştirilmesini isteyebilirler."),
    ]
    basliklar = [
        (GIRINTI, "I. Kural"),
        (GIRINTI, "MADDE 72 Tazminat istemi, zarar görenin zararı ve tazminat yükümlüsünü"),   # tiresiz: insert_text "-" işaretini U+00AD yazar
        (SOL, "öğrendiği tarihten başlayarak iki yılın ve her hâlde fiilin işlendiği tarihten başlayarak on yılın"),
        (SOL, "geçmesiyle zamanaşımına uğrar."),
    ]
    bos_satirli = [
        "Önemli ölçüde tehlike arzeden bir işletmenin bu tür faaliyetine hukuk düzenince izin verilmiş olsa bile, zarar görenler, bu işletmenin faaliyetinin sebep olduğu zararlarının uygun bir bedelle denkleştirilmesini isteyebilirler.",
        "",
        "C. Zamanaşımı",
        "I. Kural",
        "MADDE 72 Tazminat istemi, zarar görenin zararı ve tazminat yükümlüsünü öğrendiği tarihten başlayarak iki yılın ve her hâlde fiilin işlendiği tarihten başlayarak on yılın geçmesiyle zamanaşımına uğrar.",
    ]
    yol = satir_basina_blok("bos-paragraf", onceki_paragraf + [(GIRINTI, " "), (GIRINTI, "C. Zamanaşımı")] + basliklar)
    vakalar.append(("boş satır: boş paragraf (kanun)", tum_sayfa(yol), bos_satirli))
    # 9) Boş paragraf yazılmamış (boşluk karakteri yok), yalnızca bir satırlık boşluk: yine boş satır
    yol = satir_basina_blok("bos-satir-geometri", onceki_paragraf + [(GIRINTI, "C. Zamanaşımı", ARALIK)] + basliklar)
    vakalar.append(("boş satır: yalnızca bir satırlık boşluk", tum_sayfa(yol), bos_satirli))
    # 10) 1,2 aralıklı metinde tek aralıklı boş paragraf (TMK: 30,36 / 16,56 = 1,83 kat): boş paragraf varsa boş satır
    tmk_gibi = onceki_paragraf + [(GIRINTI, " "), (GIRINTI, "C. Zamanaşımı", 13.8 - 16.56)] + basliklar
    yol = satir_basina_blok("bos-paragraf-tek-aralik", tmk_gibi, aralik=16.56)
    vakalar.append(("boş satır: 1,83 kat, boş paragraflı", tum_sayfa(yol), bos_satirli))
    # 11) Aynı boşluk (1,83 kat) boş paragraf olmadan: paragraf aralığıdır, boş satır değil
    yol = satir_basina_blok("paragraf-araligi", onceki_paragraf + [(GIRINTI, "C. Zamanaşımı", 13.8)] + basliklar, aralik=16.56)
    vakalar.append(("paragraf aralığı (1,83 kat, boş paragraf yok)", tum_sayfa(yol), [p for p in bos_satirli if p]))
    # 12) Paragraf aralığı 0,65 satır (UYAP'ta paragraf aralığı 0,4 ≈ 1,65 kat) ve arada boşluk karakteri: boş satır değil
    yol = satir_basina_blok("uyap-paragraf-araligi", onceki_paragraf + [(GIRINTI, " ", 0.65 * ARALIK - ARALIK), (GIRINTI, "C. Zamanaşımı")] + basliklar)
    vakalar.append(("paragraf aralığı 1,65 kat, boşluk karakterli", tum_sayfa(yol), [p for p in bos_satirli if p]))
    # 13) Çift satır aralıklı bölüm, tek aralıklı satırların çok olduğu sayfada: satır araları boş satır değil (sayfanın ortancası
    # tek aralık; yerel satır aralığı çift)
    yol = satir_basina_blok("cift-aralik", [
        (SOL, "Tek aralıklı giriş satırı birinci."), (SOL, "Tek aralıklı giriş satırı ikinci."), (SOL, "Tek aralıklı giriş satırı üçüncü."),
        (SOL, "Tek aralıklı giriş satırı dördüncü."), (SOL, "Tek aralıklı giriş satırı beşinci."), (SOL, "Tek aralıklı giriş satırı altıncı."),
        (SOL, "Tek aralıklı giriş satırı yedinci."), (SOL, "Tek aralıklı giriş satırı sekizinci."),
        (SOL, "ÇİFT ARALIKLI BÖLÜM", 2 * 13.8),
        (SOL, "Birinci satır çift aralıkla yazılmıştır.", 13.8), (SOL, "İkinci satır da çift aralıkla yazılmıştır.", 13.8),
        (SOL, "Üçüncü satır da çift aralıkla yazılmıştır.", 13.8), (SOL, "Dördüncü satır da çift aralıkla yazılmıştır.", 13.8),
    ], aralik=13.8)
    cift = temiz([tum_sayfa(yol)])[0].split("\n")
    sonuc("çift satır aralığı: bölümün içinde boş satır yok, önünde var", cift.count("") == 1 and cift.index("") == cift.index("ÇİFT ARALIKLI BÖLÜM") - 1, json.dumps(cift, ensure_ascii=False))
    # 14) Sayfa geçişi (kısa sayfalar): birinci sayfa boş paragrafla bitiyor, ikinci sayfa başlıkla başlıyor; paragrafı sonraki
    # sayfada süren belgede boş satır yok, satırlar birleşir. UYAP (iText) sayfa sonuna, paragraf sürerken de son satırın ~1,6–2,2
    # satır aralığı altına boşluk satırı yazar: boş satır değil
    yol = satir_basina_blok("sayfa-gecisi", onceki_paragraf + [(GIRINTI, " ")], sonraki_sayfa=[(GIRINTI, "C. Zamanaşımı")] + basliklar, boy=250)
    vakalar.append(("sayfa geçişinde boş paragraf", [secim_sonucu(yol, 1, "Önemli", None), secim_sonucu(yol, 2, None, "uğrar.")], bos_satirli))
    yol = satir_basina_blok("sayfa-gecisi-paragraf", onceki_paragraf[:2], sonraki_sayfa=onceki_paragraf[2:] + [(GIRINTI, " "), (GIRINTI, "C. Zamanaşımı")] + basliklar, boy=250)
    vakalar.append(("sayfada süren paragraf", [secim_sonucu(yol, 1, "Önemli", None), secim_sonucu(yol, 2, None, "uğrar.")], bos_satirli))
    yol = satir_basina_blok("sayfa-sonu-bosluk-satiri", onceki_paragraf[:2] + [(SOL, " ", 0.45 * ARALIK)], sonraki_sayfa=onceki_paragraf[2:] + [(GIRINTI, " "), (GIRINTI, "C. Zamanaşımı")] + basliklar, boy=250)
    vakalar.append(("sayfa sonunda 1,45 satır aralığı aşağıdaki boşluk satırı (UYAP gibi)", [secim_sonucu(yol, 1, "Önemli", None), secim_sonucu(yol, 2, None, "uğrar.")], bos_satirli))
    # 15–17) Gerçek kanunlar, varsa: TBK s.15 (kullanıcının ikinci ekran görüntüsü), TBK s.15→16 sayfa geçişi, TMK s.120 (1,83 kat)
    if os.path.exists(MASAUSTU_BELGE):
        vakalar.append(("1.5.6098.pdf s.15: bölüm başlığından önce boş satır", secim(MASAUSTU_BELGE, 15, "Önemli", "dolayısıyla"), [
            "Önemli ölçüde tehlike arzeden bir işletmenin bu tür faaliyetine hukuk düzenince izin verilmiş olsa bile, zarar görenler, bu işletmenin faaliyetinin sebep olduğu zararlarının uygun bir bedelle denkleştirilmesini isteyebilirler.",
            "",
            "C. Zamanaşımı",
            "I. Kural",
            "MADDE 72- Tazminat istemi, zarar görenin zararı ve tazminat yükümlüsünü öğrendiği tarihten başlayarak iki yılın ve her hâlde fiilin işlendiği tarihten başlayarak on yılın geçmesiyle zamanaşımına uğrar. Ancak, tazminat ceza kanunlarının daha uzun bir zamanaşımı öngördüğü cezayı gerektiren bir fiilden doğmuşsa, bu zamanaşımı uygulanır.",
            "Haksız fiil dolayısıyla",
        ]))
        vakalar.append(("1.5.6098.pdf s.15→16: sayfa sonundaki boş paragraf", [secim_sonucu(MASAUSTU_BELGE, 15, "Aynı", None), secim_sonucu(MASAUSTU_BELGE, 16, None, "Bedensel")], [
            "Aynı şekilde, ceza hâkiminin kusurun değerlendirilmesine ve zararın belirlenmesine ilişkin kararı da, hukuk hâkimini bağlamaz.",
            "",
            "II. Tazminat hükmünün değiştirilmesi",
            "MADDE 75- Bedensel",
        ]))
    if os.path.exists(TMK_BELGE):
        vakalar.append(("mevzuat_4721_TMK.pdf s.120: tek aralıklı boş paragraf", secim(TMK_BELGE, 120, "edilen", "601-"), [
            "edilen malın teslimini veya hakkın devrini; vasiyet konusu bir davranış ise, bunun yerine getirilmemesinden doğan zararın giderilmesini dava edebilir.",
            "",
            "2. Özel durumlar",
            "Madde 601-",
        ]))
    else:
        print("ATLANDI mevzuat_4721_TMK.pdf (test\\pdf'te yok)")

    # 18–23) Satırın ortasından başlayan seçim (0.2.1): seçilen parça kısa görünür; ilk satır sayfada dolu ve noktalamayla bitiyorsa
    # paragraf bölünmez (çekirdeğin ilk_dolu'su). Satır kısaysa (paragrafın son satırı) bölünür. Senaryo15 aynı PDF'i kullanır
    yol = satir_basina_blok("ortadan-dolu-satir", [
        (GIRINTI, "Ticaret sicili, Bakanlığın gözetim ve denetiminde ticaret sicili müdürlükleri tarafından"),
        (SOL, "tutulur ve her ilde bu amaçla gereken düzenlemeler yapılarak sicil müdürlükleri kurulur."),
        (SOL, "Bakanlık il merkezleri dışındaki odalarda da ticaret sicili müdürlükleri kurabileceği gibi"),
        (SOL, "müdürlüklere bağlı şubeler de kurabilir."),
    ])
    vakalar.append(("ortadan seçim: dolu ilk satır noktayla bitiyor", secim(yol, 1, "sicil", "gibi"), [
        "sicil müdürlükleri kurulur. Bakanlık il merkezleri dışındaki odalarda da ticaret sicili müdürlükleri kurabileceği gibi",
    ]))
    vakalar.append(("ortadan seçim: kısa ilk satır noktayla bitiyor (bölünür)", {"ham": "    şubeler de kurabilir.\nTicaret sicili kayıtlarının elektronik ortamda tutulmasına ilişkin usul ve esaslar", "secenek": {"ilkDolu": False}}, [
        "şubeler de kurabilir.", "Ticaret sicili kayıtlarının elektronik ortamda tutulmasına ilişkin usul ve esaslar",
    ]))
    # Büyük harfle başlayan satır başlık sayılır (kaynakça girdileri ayrı kalır); kesme işaretli kısaltma ("HMK’ya") sayılmaz
    vakalar.append(("kesme işaretli kısaltmayla başlayan satır başlık değil", "Bu sebeple davalı dava dilekçesinde zamanaşımı def’ini bildirmek zorundadır.\nHMK’ya göre basit yargılama usulünde iddianın genişletilmesi yasağı dava dilekçesiyle başlar.", [
        "Bu sebeple davalı dava dilekçesinde zamanaşımı def’ini bildirmek zorundadır. HMK’ya göre basit yargılama usulünde iddianın genişletilmesi yasağı dava dilekçesiyle başlar.",
    ]))
    vakalar.append(("kaynakça girdileri ayrı kalır", "ARAL, Fikret: Borçlar Hukuku Özel Borç İlişkileri, Gözden Geçirilmiş Baskı, Ankara 2019.\nTEKİNALP, Ünal: Banka Hukuku, İstanbul 2018.", [
        "ARAL, Fikret: Borçlar Hukuku Özel Borç İlişkileri, Gözden Geçirilmiş Baskı, Ankara 2019.", "TEKİNALP, Ünal: Banka Hukuku, İstanbul 2018.",
    ]))
    if os.path.exists(TTK_BELGE):
        vakalar.append(("mevzuat_6102_TTK.pdf s.8: ortadan seçim, dolu satır", secim(TTK_BELGE, 8, "sicili", "gibi"), [
            "sicili müdürlükleri kurulur. Bakanlık il merkezleri dışındaki odalarda ticaret sicili müdürlükleri kurabileceği gibi",
        ]))
    else:
        print("ATLANDI mevzuat_6102_TTK.pdf (test\\pdf'te yok)")
    if os.path.exists(MAKALE_BELGE):
        vakalar.append(("dergipark_5104529_zamanasimi.pdf s.30: HMK’ya ile başlayan satır", secim(MAKALE_BELGE, 30, "beple", "iddianın"), [
            "beple dava dilekçesinde zamanaşımı def’ini bildirmek zorundadır. HMK’ya göre HMK m. 141’e göre basit yargılama usulünde, iddianın",
        ]))
    else:
        print("ATLANDI dergipark_5104529_zamanasimi.pdf (test\\pdf'te yok)")

    # 24–26) Satır sonu tiresi (0.2.1): şapkalı harften sonra bölünmüş sözcük birleşir ("hâ- / kim"), sayı aralığında tire kalır ve
    # boşluk girmez ("1/2/2018- / 7078/157")
    vakalar.append(("satır sonu tiresi: şapkalı harften sonra hece", "Bu davada hâ-\nkim karar verdi ve kâ-\ntip tutanağı imzaladı.", [
        "Bu davada hâkim karar verdi ve kâtip tutanağı imzaladı.",
    ]))
    vakalar.append(("satır sonu tiresi: sayı aralığı", "Aynen kabul: 1/2/2018-\n7078/157 md.) hükmü ve s. 501-\n503 arasındaki açıklamalar", [
        "Aynen kabul: 1/2/2018-7078/157 md.) hükmü ve s. 501-503 arasındaki açıklamalar",
    ]))
    if os.path.exists(TTK_BELGE):
        vakalar.append(("mevzuat_6102_TTK.pdf s.8: satır sonunda tarih-sayı aralığı", secim(TTK_BELGE, 8, "MADDE", "sanayi"), [
            "MADDE 24- (1) (Değişik: 15/8/2017-KHK-694/162 md.; Aynen kabul: 1/2/2018-7078/157 md.) Gümrük ve Ticaret Bakanlığı tarafından il merkezindeki ticaret ve sanayi",
        ]))

    temizler = temiz([ham for _, ham, _ in vakalar])
    for (ad, ham, beklenen), metin in zip(vakalar, temizler):
        paragraflar = metin.split("\n")
        ok = paragraflar == beklenen
        sonuc(ad, ok, "" if ok else "\n  beklenen: " + json.dumps(beklenen, ensure_ascii=False) + "\n  çıkan   : " + json.dumps(paragraflar, ensure_ascii=False) + "\n  ham     : " + json.dumps(ham, ensure_ascii=False))
    print("-" * 60)
    print(f"{len(denetimler) - len(hatalar)}/{len(denetimler)} başarılı.")
    sys.exit(1 if hatalar else 0)


if __name__ == "__main__":
    main()
