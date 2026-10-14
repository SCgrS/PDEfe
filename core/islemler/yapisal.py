# -*- coding: utf-8 -*-
"""Yapısal (sayfa düzeni) kaydetme: sayfa tarifinden yeni belge kurma, anlık kopya, notların
konumsal eşlemeyle yeni belgeye taşınması, içerik kutusu."""
import os
import re
import uuid
import shutil

import pymupdf

from . import notlar


def _ayni_yol(a, b):
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def tarif_belgesi(tarif, belge_al):
    """Tarife göre yeni belge kurar.
    tarif: [{kaynak:{yol,sayfa}|None, dondurme, genislik, yukseklik}]
    belge_al(yol) → açık pymupdf.Document.
    Döner: (yeni_belge, esleme) — esleme[i] = (yol, sayfa) ya da None (boş sayfa)."""
    yeni = pymupdf.open()
    esleme = []
    i, n = 0, len(tarif)
    son_boyut = (595.28, 841.89)
    while i < n:
        e = tarif[i]
        k = e.get("kaynak")
        if not k:
            w = float(e.get("genislik") or son_boyut[0]); h = float(e.get("yukseklik") or son_boyut[1])
            yeni.new_page(width=w, height=h)
            esleme.append(None)
            i += 1
            continue
        # Aynı kaynaktan ardışık sayfalar tek çağrıda (notlar ve bağlantılar korunur)
        j = i
        while (j + 1 < n and tarif[j + 1].get("kaynak") and _ayni_yol(tarif[j + 1]["kaynak"]["yol"], k["yol"])
               and int(tarif[j + 1]["kaynak"]["sayfa"]) == int(tarif[j]["kaynak"]["sayfa"]) + 1):
            j += 1
        src = belge_al(k["yol"])
        bas, son = int(k["sayfa"]) - 1, int(tarif[j]["kaynak"]["sayfa"]) - 1
        yeni.insert_pdf(src, from_page=bas, to_page=son, annots=True)
        for t in range(i, j + 1):
            esleme.append((k["yol"], int(tarif[t]["kaynak"]["sayfa"])))
        r = src[son].rect
        son_boyut = (r.width, r.height)
        i = j + 1
    # Ek döndürmeler
    for idx, e in enumerate(tarif):
        d = int(e.get("dondurme") or 0) % 360
        if d:
            pg = yeni[idx]
            pg.set_rotation((pg.rotation + d) % 360)
    return yeni, esleme


def _yerimlerini_tasi(yeni, esleme, ana_yol, belge_al):
    """Ana belgenin yer imlerini korunan sayfalara yeniden eşler."""
    try:
        src = belge_al(ana_yol)
        toc = src.get_toc(simple=True)
    except Exception:
        return
    if not toc:
        return
    ilk_konum = {}
    for i, e in enumerate(esleme):
        if e and _ayni_yol(e[0], ana_yol) and e[1] not in ilk_konum:
            ilk_konum[e[1]] = i + 1
    yeni_toc = []
    for seviye, baslik, sayfa in toc:
        if sayfa in ilk_konum:
            yeni_toc.append([seviye, baslik, ilk_konum[sayfa]])
    # Seviye sıçramalarını düzelt (üst düzey atlandıysa)
    duzgun = []
    onceki = 0
    for seviye, baslik, sayfa in yeni_toc:
        if seviye > onceki + 1:
            seviye = onceki + 1
        duzgun.append([seviye, baslik, sayfa])
        onceki = seviye
    try:
        yeni.set_toc(duzgun)
    except Exception:
        pass


def y_yapisal_kaydet(p):
    """Sayfa tarifini ve not işlemlerini uygulayıp kaydeder.
    p: {yol, hedef, tarif, anlikKlasor, anlik, islemler:[{islem, id, not:{...}, kaynak:{yol,sayfa}, xref}]}
    Notlar: 'ekle' → not.sayfa yeni belgedeki konum; 'guncelle'/'sil' → kaynak sayfa + kaynak xref (konumsal eşleme).
    Bu çağrıda oluşturulan anlık kopya (ve yarım geçici dosya) hedef yazılmadan önce hata/iptal olursa silinir;
    p["anlik"] (önceden var olan kopya) ve başarılı yolda oluşan kopya korunur.
    Döner: {anlik, boyut, sayfa, xrefler}"""
    from pdefe_core import onbellek
    yol, hedef = p["yol"], p.get("hedef") or p["yol"]
    notlar.pdf_hedefi_denetle(hedef)         # yalnızca .pdf'e ya da var olan PDF'e (0.2.1)
    tarif = list(p.get("tarif") or [])
    islemler = list(p.get("islemler") or [])
    anlik_klasor = p.get("anlikKlasor") or os.path.join(os.environ.get("TEMP", "."), "PDEfe", "anlik")
    ilerleme = p.get("_ilerleme") or (lambda *a: None)
    onbellek.hepsini_birak()

    anlik = p.get("anlik")
    yeni_anlik = None      # bu çağrıda oluşturulan anlık kopya
    gecici = None
    # macOS: yazma izni olmayan hedefte belge kurulmadan durulur (0.2.1; _degistir de denetler). Anlık kopya da alınmaz: copy2 Finder'ın
    # Kilitli işaretini kopyaya taşır, silinemeyen kopya kalırdı
    notlar.salt_okunursa_dur(None, hedef)
    try:
        # 1) Özgün dosya tarifte kaynak olarak geçiyorsa anlık kopya al (kaynak değişmeden kalsın)
        kaynak_yollari = {e["kaynak"]["yol"] for e in tarif if e.get("kaynak")}
        kaynak_yollari |= {op["kaynak"]["yol"] for op in islemler if op.get("kaynak") and op["kaynak"].get("yol")}
        if any(_ayni_yol(k, yol) for k in kaynak_yollari):
            os.makedirs(anlik_klasor, exist_ok=True)
            anlik = yeni_anlik = os.path.join(anlik_klasor, uuid.uuid4().hex + ".pdf")
            try:
                shutil.copy2(yol, anlik)
            except OSError as e:           # yarım kopya dış blokta silinir
                raise PermissionError("Dosya okunamadı; başka bir programda (örneğin bir PDF okuyucuda) açık olabilir. (%s)" % e)
            for e in tarif:
                if e.get("kaynak") and _ayni_yol(e["kaynak"]["yol"], yol):
                    e["kaynak"] = dict(e["kaynak"], yol=anlik)
            for op in islemler:
                if op.get("kaynak") and op["kaynak"].get("yol") and _ayni_yol(op["kaynak"]["yol"], yol):
                    op["kaynak"] = dict(op["kaynak"], yol=anlik)
                # Yanıtın üst notunun kaynağı da (0.2.1; önceden çevrilmediği için ilk yapısal kayıtta yanıt üstünü bulamıyordu)
                yk = (op.get("not") or {}).get("yanitKaynak")
                if yk and yk.get("yol") and _ayni_yol(yk["yol"], yol):
                    op["not"] = dict(op["not"], yanitKaynak=dict(yk, yol=anlik))
        ilerleme(10, "Sayfalar düzenleniyor")

        acik = {}
        def belge_al(y):
            k = os.path.normcase(os.path.abspath(y))
            if k not in acik:
                acik[k] = notlar.belge_ac_yazmak_icin(y)
            return acik[k]

        try:
            yeni, esleme = tarif_belgesi(tarif, belge_al)
            ana = anlik or yol
            _yerimlerini_tasi(yeni, esleme, ana, belge_al)
            try:
                yeni.set_metadata(belge_al(ana).metadata or {})
            except Exception:
                pass
            ilerleme(50, "Notlar taşınıyor")

            # 2) Not işlemleri
            xrefler = {}
            # (yol_normal, sayfa) → yeni belgedeki konumları (0-tabanlı, sırayla). Aynı kaynak sayfa tarifte birden çok kez geçebilir
            # (Sayfaları düzenle'de kopyala, 0.2.6; "PDF ekle" ile aynı dosya): insert_pdf notları her kopyaya ayrı nesnelerle koyar.
            # Silme ve güncelleme her kopyaya uygulanır; 0.2.5'e dek yalnızca ilk kopyaya uygulanıyor, silinen not kopya sayfada kalıyordu.
            konum = {}
            for i, e in enumerate(esleme):
                if e:
                    k = (os.path.normcase(os.path.abspath(e[0])), e[1])
                    konum.setdefault(k, []).append(i)

            def sayfa_anahtari(k):
                if not k or not k.get("yol"):
                    return None
                return (os.path.normcase(os.path.abspath(k["yol"])), int(k["sayfa"]))

            # Not eşlemesi (0.2.1): işlemlerin değindiği her kaynak sayfada kaynak not xref'i → yeni belgedeki not xref'i, HİÇBİR işlem
            # uygulanmadan önce kurulur. Önceden hedef not her işlemde kaynak sayfadaki sırasıyla yeni sayfanın o anki not listesinde
            # aranıyordu: aynı sayfada önceki bir silme listeyi kısaltınca sonraki silme / güncelleme bir sağdaki nota uygulanıyordu.
            # insert_pdf yanıt (IRT) notlarını kopyalamaz (Link, Popup, Widget'ı annots() de vermez): kaynak listesinden çıkarılır,
            # yanıtın kendisine yapılan işlem atlanır. Listelerin uzunluğu tutmazsa o kopyada eşleme kurulmaz ve işlemler atlanır:
            # yanlış nota dokunmaktansa. Eşleme kaynak sayfanın her kopyası için ayrı kurulur (0.2.6).
            eslemeler = {}   # anahtar → {konum: {kaynak xref: yeni xref}}
            for op in islemler:
                for k in (op.get("kaynak"), (op.get("not") or {}).get("yanitKaynak")):
                    anahtar = sayfa_anahtari(k)
                    if anahtar is None or anahtar not in konum or anahtar in eslemeler:
                        continue
                    src = belge_al(k["yol"])
                    src_xrefs = [a.xref for a in src[anahtar[1] - 1].annots() if src.xref_get_key(a.xref, "IRT")[0] == "null"]
                    eslemeler[anahtar] = {}
                    for i in konum[anahtar]:
                        yeni_xrefs = [a.xref for a in yeni[i].annots()]
                        eslemeler[anahtar][i] = dict(zip(src_xrefs, yeni_xrefs)) if len(src_xrefs) == len(yeni_xrefs) else {}

            def hedef_annotlar(op):
                """İşlemin hedef notu yeni belgedeki her kopyada: [(konum, yeni xref)] (kopyaların sırasıyla); sayfa silinmişse ya da
                not eşlenemediyse boş."""
                anahtar = sayfa_anahtari(op.get("kaynak"))
                if anahtar is None or anahtar not in konum:
                    return []                         # sayfa silinmiş; işlem gereksiz
                xref = int(op.get("xref") or (op.get("not") or {}).get("xref") or 0)
                bulunan = []
                for i in konum[anahtar]:
                    yeni_xref = eslemeler.get(anahtar, {}).get(i, {}).get(xref)
                    if not yeni_xref:
                        continue
                    try:
                        notlar._annot_bul(yeni[i], yeni_xref)
                    except KeyError:
                        continue                      # not, üstüyle birlikte silinmiş
                    bulunan.append((i, yeni_xref))
                return bulunan

            for op in islemler:
                n = dict(op.get("not") or {})
                if op["islem"] == "ekle":
                    sayfa = int(n.get("sayfa") or 1)
                    if sayfa < 1 or sayfa > len(yeni):
                        continue
                    if n.get("yanitId") and n["yanitId"] in xrefler:
                        n["yanitXref"] = xrefler[n["yanitId"]]
                    elif n.get("yanitKaynak"):
                        # Yanıt, üst notun yanıtın eklendiği sayfadaki kopyasına bağlanır (yoksa ilk kopyaya)
                        ha = hedef_annotlar({"kaynak": n["yanitKaynak"], "xref": n.get("yanitXref")})
                        ha = [h for h in ha if h[0] == sayfa - 1] or ha
                        if ha:
                            n["yanitXref"] = ha[0][1]
                        else:
                            n.pop("yanitXref", None)
                    xrefler[op["id"]] = notlar.not_ekle(yeni, yeni[sayfa - 1], n)
                elif op["islem"] in ("guncelle", "sil"):
                    for i, yeni_xref in hedef_annotlar(op):
                        page = yeni[i]
                        if op["islem"] == "sil":
                            notlar.not_sil(yeni, page, yeni_xref)
                        else:
                            m = dict(n, xref=yeni_xref)
                            m.pop("rect", None) if m.get("rectDegismedi") else None
                            notlar.not_guncelle(yeni, page, m)
                            xrefler.setdefault(op["id"], yeni_xref)   # ilk kopyanınki
            ilerleme(80, "Kaydediliyor")

            # 3) Kaydet
            gecici = hedef + ".pdefe-tmp"
            yeni.save(gecici, garbage=3, deflate=True)
            yeni.close()
            for d in acik.values():
                d.close()
            acik.clear()
            onbellek.hepsini_birak()
            _degistir(gecici, hedef)
            gecici, yeni_anlik = None, None     # hedef yazıldı: anlık kopya artık özgün içeriğin tek kopyası olabilir, korunur
        finally:
            for d in acik.values():
                try:
                    d.close()
                except Exception:
                    pass
        ilerleme(100, "Bitti")
        return {"anlik": anlik, "boyut": os.path.getsize(hedef), "sayfa": len(tarif), "xrefler": xrefler}
    except BaseException:
        # Hata/iptal: bu çağrının bıraktığı artıkları temizle (önceden var olan p["anlik"] kopyasına dokunulmaz)
        for artik in (gecici, yeni_anlik):
            if artik and os.path.exists(artik):
                try:
                    os.remove(artik)
                except OSError:
                    pass
        raise


def _degistir(gecici, hedef, deneme=6):
    """os.replace; Windows'ta kısa süreli kilitlere karşı birkaç kez dener. macOS'ta hedefin izinleri ve öznitelikleri (Finder
    etiketleri) korunur (0.2.0, notlar._ozellikleri_aktar); yazma izni olmayan hedefe yazılmaz (0.2.1, notlar.salt_okunursa_dur)."""
    import time, gc
    son = None
    notlar.salt_okunursa_dur(gecici, hedef)
    if os.name != "nt" and os.path.exists(hedef):
        notlar._ozellikleri_aktar(hedef, gecici)
    for i in range(deneme):
        try:
            os.replace(gecici, hedef)
            return
        except PermissionError as e:
            son = e
            gc.collect()
            time.sleep(0.25 * (i + 1))
    try:
        os.remove(gecici)
    except Exception:
        pass
    raise PermissionError("Dosya yazılamadı; başka bir programda açık olabilir. (%s)" % son)


_ANLIK_ADI = re.compile(r"^[0-9a-f]{32}\.pdf$", re.IGNORECASE)


def y_anlik_sil(p):
    """Anlık kopyayı siler. Yalnızca y_yapisal_kaydet'in adlandırdığı dosya (anlik klasöründe <32 onaltılık>.pdf) silinir (0.1.23,
    güvenlik denetimi: verilen her yolu siliyordu; ana süreç de klasörü denetler, main/guvenlik.js)."""
    yol = p.get("yol")
    if not yol or not _ANLIK_ADI.match(os.path.basename(yol)) or os.path.basename(os.path.dirname(os.path.abspath(yol))).lower() != "anlik":
        return {"ok": False}
    try:
        if os.path.exists(yol):
            os.remove(yol)
        return {"ok": True}
    except Exception:
        return {"ok": False}


def y_icerik_kutusu(p):
    """Sayfadaki içeriğin (metin, çizim, görsel) birleşik kutusu; PyMuPDF üst-sol pt."""
    from pdefe_core import onbellek
    doc = onbellek.al(p["yol"])
    pg = doc[int(p["sayfa"]) - 1]
    kutu = pymupdf.Rect()
    for b in pg.get_text("blocks"):
        kutu |= pymupdf.Rect(b[:4])
    try:
        for d in pg.get_drawings():
            r = d.get("rect")
            if r and r.width < pg.rect.width * 1.5:
                kutu |= r
    except Exception:
        pass
    for bilgi in pg.get_image_info():
        kutu |= pymupdf.Rect(bilgi["bbox"])
    if kutu.is_empty or kutu.is_infinite:
        r = pg.rect
        return {"kutu": [0, 0, r.width, r.height]}
    kutu &= pg.rect
    return {"kutu": [kutu.x0, kutu.y0, kutu.x1, kutu.y1]}


def kaydol(yontemler):
    yontemler["yapisal_kaydet"] = y_yapisal_kaydet
    yontemler["anlik_sil"] = y_anlik_sil
    yontemler["icerik_kutusu"] = y_icerik_kutusu
