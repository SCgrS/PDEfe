package pdefe;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.awt.print.PageFormat;
import java.awt.print.Pageable;
import java.awt.print.Printable;
import java.awt.print.PrinterException;
import java.awt.print.PrinterJob;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import javax.imageio.ImageIO;
import javax.print.PrintService;
import javax.print.PrintServiceLookup;
import javax.print.attribute.HashPrintRequestAttributeSet;
import javax.print.attribute.standard.Destination;
import javax.print.attribute.standard.JobName;
import javax.swing.SwingUtilities;

/**
 * PDEfe'nin UYAP Doküman Editörü köprüsü (0.2.6, "Dosya Formatını Değiştir" aracının UDF → PDF dönüştürmesi).
 *
 * UDF belgesini bilgisayarda kurulu UYAP Doküman Editörü'nün (UDE) kendi belge modeli ve sayfalayıcısıyla açar, sayfaları UDE'nin
 * yazdırırken kullandığı çizim yoluyla (Printable) PDF'e ya da PNG'ye çizer: satır kırılımı, sayfa sonları, tablolar ve üst / alt bilgi
 * UDE'de göründüğü gibidir. UDE'nin ve UDE'yle gelen PDF kitaplığının (iText 2.1.7, jai_hvl.jar) sınıflarına YALNIZCA YANSIMAYLA
 * (reflection) erişilir: köprünün derleme bağımlılığı yoktur, UDE'nin ve iText'in jar'ları PDEfe'ye girmez, yalnızca çalışma anında sınıf
 * yolundan gelir. UDE'nin bayt kodu çözülmez; yöntemler adla değil imzayla bulunur (karartılmış adlar sürümden sürüme değişir).
 *
 * UDE'nin kendi "PDF olarak kaydet"inden farkları (kök nedenler PDEfe PLAN.md "Revizyon 0.2.6"):
 *  - sayfa boyu PageFormat'tan (UDE sayfa genişliğini "2 × sol kenar + yazı alanı" alıyor; sol ve sağ kenarı farklı belgede yanlış);
 *  - yazı tipleri gömülü (Identity-H, alt küme; UDE gömmüyor, başka okuyucu yerine başka yazı tipi koyuyordu);
 *  - antet ve resimlerin saydamlığı önceden beyaza düzleştirilir (UDE saydam resmi küçültürken kenarda gri çerçeve bırakıyor).
 *
 * Çalıştırma (PDEfe çekirdeği, core/islemler/udf.py):
 *   java -Djava.awt.headless=true -Dpdefe.ev=<geçici klasör> [-Dpdefe.gunluk=<dosya>] [-Dpdefe.yazitipleri=<klasör;klasör>]
 *        -cp "ude-kopru.jar;<UDE jar'ları>" pdefe.UdeKopru sunucu
 *   java -cp ude-kopru.jar pdefe.UdeKopru surum
 *
 * Sunucu kipi: ilk satır {"hazir": true|false, "kopru", "java", "itext", "hata"?}. Sonra standart girdiden UTF-8, satır başına bir iş
 * (alanlar sekmeyle ayrılır; yollar Unicode kalsın diye komut satırında değil girdide):
 *   <no>  pdf     <girdi.udf> <çıktı.pdf> <düzleştir 1|0>
 *   <no>  yazici  <girdi.udf> <çıktı.pdf> <yazıcı adı (boşsa Microsoft Print to PDF)> <düzleştir 1|0>
 *   <no>  png     <girdi.udf> <klasör> <ölçek> <ilk sayfa> <son sayfa>        (klasör/sayfa-<n>.png)
 *   <no>  bilgi   <girdi.udf> <küçük resim genişliği px>                     (sayfa sayısı, boyları, ilk sayfanın PNG'si)
 *   cikis
 * Her işe standart çıktıya satır başına JSON: ilerleme {"no", "ilerleme", "toplam"}, sonuç {"no", "tamam": true, "sayfa", "boylar",
 * "ms", ...} ya da {"no", "hata", "tur"}. tur: "yukleme" (UDE belgeyi açamadı), "surum" (UDE'nin beklenen yöntemi yok), "itext_yok",
 * "yazici_yok", "bos", "olumcul" (bellek yetmedi vb.; çağıran süreci yeniden başlatmalı), "hata". Girdi kapanınca süreç çıkar.
 * JSON'da ASCII dışı karakterler \\uXXXX yazılır (konsol kodlamasından bağımsız). UDE'nin kendi günlüğü pdefe.gunluk'a (ya da hiçbir
 * yere) gider; UDE'nin ayar klasörleri (user.home altındaki .uki, .sertifikadeposu) pdefe.ev'e yazılır, kullanıcınınkine dokunulmaz.
 */
public final class UdeKopru {

    static final String KOPRU_SURUMU = "1";
    static final String PANEL_SINIFI = "tr.com.havelsan.uyap.system.editor.common.gui.WPDocumentPanel";
    static final String VARSAYILAN_YAZICI = "Microsoft Print to PDF";

    static PrintStream cikis;
    static Class<?> panelSinifi;
    static Method yukleYontemi;
    static IText itext;
    static Object yaziTipiEsleyici;
    static String itextHatasi;

    public static void main(String[] a) {
        System.setProperty("java.awt.headless", "true");
        try {
            cikis = new PrintStream(new FileOutputStream(FileDescriptor.out), true, "UTF-8");
        } catch (IOException e) {
            System.exit(3);
            return;
        }
        String komut = a.length > 0 ? a[0] : "sunucu";
        if (komut.equals("surum")) {
            Map<String, Object> s = new LinkedHashMap<String, Object>();
            s.put("kopru", KOPRU_SURUMU);
            s.put("java", System.getProperty("java.version"));
            s.put("mimari", System.getProperty("os.arch"));
            yaz(s);
            System.exit(0);
            return;
        }
        evHazirla();
        int kod;
        try {
            kod = komut.equals("sunucu") ? sunucu() : 2;
        } catch (Throwable t) {
            Map<String, Object> s = new LinkedHashMap<String, Object>();
            s.put("hazir", false);
            s.put("hata", String.valueOf(kok(t)));
            s.put("tur", "olumcul");
            yaz(s);
            kod = 1;
        }
        System.exit(kod);   // UDE'nin zamanlayıcıları süreci açık tutmasın
    }

    /** UDE'nin ayar ve günlük yazımları geçici klasöre; UDE'nin konsol iletileri günlük dosyasına (yoksa hiçbir yere). */
    static void evHazirla() {
        String ev = System.getProperty("pdefe.ev");
        if (ev != null && ev.length() > 0) {
            File e = new File(ev);
            e.mkdirs();
            System.setProperty("user.home", e.getAbsolutePath());
        }
        PrintStream g = null;
        String gunluk = System.getProperty("pdefe.gunluk");
        if (gunluk != null && gunluk.length() > 0) {
            try {
                g = new PrintStream(new FileOutputStream(gunluk, true), true);
            } catch (IOException e) {
                g = null;
            }
        }
        if (g == null) {
            g = new PrintStream(new OutputStream() {
                public void write(int b) { }
                public void write(byte[] b, int o, int n) { }
            });
        }
        System.setOut(g);
        System.setErr(g);
    }

    // ---------------------------------------------------------------- sunucu

    static int sunucu() throws IOException {
        Map<String, Object> h = new LinkedHashMap<String, Object>();
        String hata = udeHazirla();
        h.put("hazir", hata == null);
        h.put("kopru", KOPRU_SURUMU);
        h.put("java", System.getProperty("java.version"));
        h.put("mimari", System.getProperty("os.arch"));
        h.put("itext", itextHazirla());
        if (itextHatasi != null) h.put("itextHatasi", itextHatasi);
        if (hata != null) {
            h.put("hata", hata);
            h.put("tur", "surum");
            yaz(h);
            return 2;
        }
        yaz(h);
        BufferedReader r = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
        String satir;
        while ((satir = r.readLine()) != null) {
            if (satir.length() == 0) continue;
            if (satir.equals("cikis")) break;
            isle(satir.split("\t", -1));
        }
        return 0;
    }

    static void isle(String[] p) {
        long t0 = System.nanoTime();
        Map<String, Object> s = new LinkedHashMap<String, Object>();
        String no = p[0];
        s.put("no", no);
        try {
            if (p.length < 3) throw new KopruHatasi("hata", "Eksik komut");
            String k = p[1];
            File girdi = new File(p[2]);
            if (k.equals("pdf")) {
                alan(p, 5);
                s.putAll(pdf(no, girdi, new File(p[3]), "1".equals(p[4])));
            } else if (k.equals("yazici")) {
                alan(p, 6);
                s.putAll(yazici(no, girdi, new File(p[3]), p[4], "1".equals(p[5])));
            } else if (k.equals("png")) {
                alan(p, 7);
                s.putAll(png(no, girdi, new File(p[3]), Double.parseDouble(p[4]), Integer.parseInt(p[5]), Integer.parseInt(p[6])));
            } else if (k.equals("bilgi")) {
                alan(p, 4);
                s.putAll(bilgi(girdi, Integer.parseInt(p[3])));
            } else {
                throw new KopruHatasi("hata", "Bilinmeyen komut: " + k);
            }
            s.put("tamam", true);
        } catch (KopruHatasi e) {
            s.put("hata", e.getMessage());
            s.put("tur", e.tur);
        } catch (Throwable t) {
            Throwable kk = kok(t);
            s.put("hata", String.valueOf(kk));
            s.put("tur", kk instanceof Error ? "olumcul" : "hata");
        }
        s.put("ms", (System.nanoTime() - t0) / 1000000L);
        yaz(s);
    }

    static void alan(String[] p, int n) throws KopruHatasi {
        if (p.length < n) throw new KopruHatasi("hata", "Eksik alan: " + p[1]);
    }

    static void ilerleme(String no, int i, int n) {
        Map<String, Object> s = new LinkedHashMap<String, Object>();
        s.put("no", no);
        s.put("ilerleme", i);
        s.put("toplam", n);
        yaz(s);
    }

    // ---------------------------------------------------------------- UDE

    /** UDE'nin belge paneli ve yükleme yöntemi; bulunamazsa anlaşılır ileti (UDE sürümü değişmiş olabilir). */
    static String udeHazirla() {
        try {
            panelSinifi = Class.forName(PANEL_SINIFI);
        } catch (Throwable e) {
            return "UYAP Doküman Editörü'nün belge sınıfı bulunamadı (" + PANEL_SINIFI + ")";
        }
        for (Method m : panelSinifi.getDeclaredMethods())
            if (Modifier.isPublic(m.getModifiers()) && m.getReturnType() == boolean.class
                    && Arrays.equals(m.getParameterTypes(), new Class<?>[]{InputStream.class, String.class}))
                yukleYontemi = m;
        if (yukleYontemi == null) return "UYAP Doküman Editörü'nde belge yükleme yöntemi bulunamadı";
        if (sayfalayiciYontemi(panelSinifi) == null) return "UYAP Doküman Editörü'nde sayfalayıcı bulunamadı";
        return null;
    }

    /** Panelin (üst sınıflarıyla) parametresiz, Pageable döndüren genel yöntemi. */
    static Method sayfalayiciYontemi(Class<?> k) {
        for (Class<?> c = k; c != null && c.getName().startsWith("tr."); c = c.getSuperclass())
            for (Method m : c.getDeclaredMethods())
                if (Modifier.isPublic(m.getModifiers()) && !Modifier.isStatic(m.getModifiers())
                        && m.getParameterTypes().length == 0 && m.getReturnType() == Pageable.class) return m;
        return null;
    }

    /** Belgeyi UDE'de açar (EDT'de), sayfalayıcısını döner. duz: saydam resimler önce beyaza düzleştirilir. */
    static Pageable yukle(final File girdi, boolean duz) throws Exception {
        byte[] veri = oku(girdi);
        if (duz) veri = duzlestir(veri);
        final byte[] v = veri;
        final Object[] sonuc = new Object[1];
        final Throwable[] hata = new Throwable[1];
        SwingUtilities.invokeAndWait(new Runnable() {
            public void run() {
                try {
                    Object panel = panelSinifi.newInstance();
                    Object ok;
                    try {
                        ok = yukleYontemi.invoke(panel, new ByteArrayInputStream(v), girdi.getPath());
                    } catch (InvocationTargetException e) {
                        throw new KopruHatasi("yukleme", "UYAP Doküman Editörü belgeyi açamadı (" + kok(e) + ")");
                    }
                    if (!Boolean.TRUE.equals(ok)) throw new KopruHatasi("yukleme", "UYAP Doküman Editörü belgeyi açamadı");
                    Method sm = sayfalayiciYontemi(panel.getClass());
                    if (sm == null) throw new KopruHatasi("surum", "UYAP Doküman Editörü'nde sayfalayıcı bulunamadı");
                    sonuc[0] = sm.invoke(panel);
                } catch (Throwable t) {
                    hata[0] = t;
                }
            }
        });
        if (hata[0] instanceof Exception) throw (Exception) hata[0];
        if (hata[0] != null) throw new KopruHatasi("olumcul", String.valueOf(hata[0]));
        // Yükleme sırasında kuyruğa giren işler (yerleşim) bitsin
        for (int i = 0; i < 3; i++) SwingUtilities.invokeAndWait(new Runnable() { public void run() { } });
        Pageable p = (Pageable) sonuc[0];
        if (p == null) throw new KopruHatasi("surum", "UYAP Doküman Editörü sayfalayıcı vermedi");
        return p;
    }

    static List<Object> boylar(Pageable p) {
        List<Object> l = new ArrayList<Object>();
        for (int i = 0; i < p.getNumberOfPages(); i++) {
            PageFormat pf = p.getPageFormat(i);
            l.add(Arrays.asList((Object) yuvarla(pf.getWidth()), yuvarla(pf.getHeight())));
        }
        return l;
    }

    static double yuvarla(double d) {
        return Math.round(d * 100.0) / 100.0;
    }

    // ---------------------------------------------------------------- PDF (UDE'nin iText'iyle)

    static Map<String, Object> pdf(final String no, File girdi, File cikti, boolean duz) throws Exception {
        if (!itextHazirla()) throw new KopruHatasi("itext_yok", "UYAP Doküman Editörü'nün PDF kitaplığı bulunamadı" +
                (itextHatasi != null ? " (" + itextHatasi + ")" : ""));
        final Pageable p = yukle(girdi, duz);
        final int n = p.getNumberOfPages();
        if (n <= 0) throw new KopruHatasi("bos", "Belgede sayfa yok");
        final IText it = itext;
        final Object esl = yaziTipiEsleyici();
        PageFormat pf0 = p.getPageFormat(0);
        final Object doc = it.belge((float) pf0.getWidth(), (float) pf0.getHeight());
        OutputStream os = new BufferedOutputStream(new FileOutputStream(cikti), 1 << 16);
        boolean bitti = false;
        try {
            final Object w = it.yazici(doc, os);
            it.ac(doc);
            final Throwable[] hata = new Throwable[1];
            SwingUtilities.invokeAndWait(new Runnable() {
                public void run() {
                    try {
                        for (int i = 0; i < n; i++) {
                            PageFormat pf = p.getPageFormat(i);
                            float gw = (float) pf.getWidth(), gh = (float) pf.getHeight();
                            it.sayfaBoyu(doc, gw, gh);
                            if (i > 0) it.yeniSayfa(doc);
                            Object cb = it.icerik(w);
                            Object sablon = it.sablon(cb, gw, gh);
                            Graphics2D g = it.grafik(sablon, gw, gh, esl);
                            try {
                                p.getPrintable(i).print(g, pf, i);
                            } finally {
                                g.dispose();
                            }
                            it.sablonEkle(cb, sablon);
                            ilerleme(no, i + 1, n);
                        }
                    } catch (Throwable t) {
                        hata[0] = t;
                    }
                }
            });
            if (hata[0] != null) {
                Throwable k = kok(hata[0]);
                if (k instanceof Error) throw new KopruHatasi("olumcul", String.valueOf(k));
                throw new KopruHatasi("hata", "Sayfa çizilemedi: " + k);
            }
            it.kapat(doc);
            bitti = true;
        } finally {
            try {
                os.close();
            } catch (IOException e) {
                if (bitti) throw e;
            }
            if (!bitti) cikti.delete();
        }
        Map<String, Object> s = new LinkedHashMap<String, Object>();
        s.put("sayfa", n);
        s.put("boylar", boylar(p));
        s.put("cizim", "itext");
        return s;
    }

    /** iText 2.1.7'nin (UDE'nin jai_hvl.jar'ı) kullanılan yöntemleri, yansımayla. */
    static final class IText {
        Class<?> belgeS, dikdortgenS, yaziciS, icerikS, sablonS, esleyiciS, yaziTipiS, varsayilanEsleyiciS;
        Constructor<?> dikdortgen, belge;
        Method getInstance, setCompressionLevel, setFullCompression, open, close, setPageSize, newPage, addCreator, getDirectContent,
                createTemplate, createGraphics, addTemplate, createFont, getBaseFontParameters, insertDirectory, getMapper;
        String identityH;

        IText() throws Exception {
            belgeS = Class.forName("com.lowagie.text.Document");
            dikdortgenS = Class.forName("com.lowagie.text.Rectangle");
            yaziciS = Class.forName("com.lowagie.text.pdf.PdfWriter");
            icerikS = Class.forName("com.lowagie.text.pdf.PdfContentByte");
            sablonS = Class.forName("com.lowagie.text.pdf.PdfTemplate");
            esleyiciS = Class.forName("com.lowagie.text.pdf.FontMapper");
            yaziTipiS = Class.forName("com.lowagie.text.pdf.BaseFont");
            varsayilanEsleyiciS = Class.forName("com.lowagie.text.pdf.DefaultFontMapper");
            dikdortgen = dikdortgenS.getConstructor(float.class, float.class);
            belge = belgeS.getConstructor(dikdortgenS, float.class, float.class, float.class, float.class);
            getInstance = yaziciS.getMethod("getInstance", belgeS, OutputStream.class);
            setCompressionLevel = yaziciS.getMethod("setCompressionLevel", int.class);
            setFullCompression = yaziciS.getMethod("setFullCompression");
            getDirectContent = yaziciS.getMethod("getDirectContent");
            open = belgeS.getMethod("open");
            close = belgeS.getMethod("close");
            setPageSize = belgeS.getMethod("setPageSize", dikdortgenS);
            newPage = belgeS.getMethod("newPage");
            addCreator = belgeS.getMethod("addCreator", String.class);
            createTemplate = icerikS.getMethod("createTemplate", float.class, float.class);
            createGraphics = icerikS.getMethod("createGraphics", float.class, float.class, esleyiciS);
            addTemplate = icerikS.getMethod("addTemplate", sablonS, float.class, float.class);
            createFont = yaziTipiS.getMethod("createFont", String.class, String.class, boolean.class, boolean.class, byte[].class,
                    byte[].class);
            getBaseFontParameters = varsayilanEsleyiciS.getMethod("getBaseFontParameters", String.class);
            insertDirectory = varsayilanEsleyiciS.getMethod("insertDirectory", String.class);
            getMapper = varsayilanEsleyiciS.getMethod("getMapper");
            identityH = (String) yaziTipiS.getField("IDENTITY_H").get(null);
        }

        Object belge(float g, float y) throws Exception {
            return belge.newInstance(dikdortgen.newInstance(g, y), 0f, 0f, 0f, 0f);
        }

        Object yazici(Object belge, OutputStream os) throws Exception {
            Object w = cagir(getInstance, null, belge, os);
            cagir(setCompressionLevel, w, 9);
            cagir(setFullCompression, w);
            cagir(addCreator, belge, "PDEfe");
            return w;
        }

        void ac(Object belge) throws Exception { cagir(open, belge); }
        void kapat(Object belge) throws Exception { cagir(close, belge); }
        void sayfaBoyu(Object belge, float g, float y) throws Exception { cagir(setPageSize, belge, dikdortgen.newInstance(g, y)); }
        void yeniSayfa(Object belge) throws Exception { cagir(newPage, belge); }
        Object icerik(Object w) throws Exception { return cagir(getDirectContent, w); }
        Object sablon(Object cb, float g, float y) throws Exception { return cagir(createTemplate, cb, g, y); }
        Graphics2D grafik(Object sablon, float g, float y, Object esl) throws Exception {
            return (Graphics2D) cagir(createGraphics, sablon, g, y, esl);
        }
        void sablonEkle(Object cb, Object sablon) throws Exception { cagir(addTemplate, cb, sablon, 0f, 0f); }

        static Object cagir(Method m, Object o, Object... a) throws Exception {
            try {
                return m.invoke(o, a);
            } catch (InvocationTargetException e) {
                Throwable k = e.getCause();
                if (k instanceof Exception) throw (Exception) k;
                if (k instanceof Error) throw (Error) k;
                throw e;
            }
        }
    }

    static boolean itextHazirla() {
        if (itext != null) return true;
        if (itextHatasi != null) return false;
        try {
            itext = new IText();
            return true;
        } catch (Throwable t) {
            itextHatasi = String.valueOf(kok(t));
            return false;
        }
    }

    /** Java'nın mantıksal yazı tipleri (UDE'nin "default" stili Dialog) gerçek yazı tipine; Java da Windows'ta onlara eşliyor. */
    static final Map<String, String> MANTIKSAL = new HashMap<String, String>();
    static {
        MANTIKSAL.put("dialog", "Arial");
        MANTIKSAL.put("sansserif", "Arial");
        MANTIKSAL.put("serif", "Times New Roman");
        MANTIKSAL.put("monospaced", "Courier New");
        MANTIKSAL.put("dialoginput", "Courier New");
    }

    /**
     * Yazı tipi eşleyicisi (süreç başına bir kez): iText'in DefaultFontMapper'ı sistemin yazı tipi klasörlerini (pdefe.yazitipleri) tarar,
     * bütün yazı tipleri Identity-H ve gömülü. Eşleyici bir Proxy'nin arkasında: yazı tipi adla bulunamazsa ailenin biçemli adı, ailenin
     * kendisi, mantıksal adın karşılığı ve son olarak Arial denenir (iText'in kendi yedeği gömülmeyen Helvetica'dır: Türkçe harfler düşerdi).
     */
    static Object yaziTipiEsleyici() throws Exception {
        if (yaziTipiEsleyici != null) return yaziTipiEsleyici;
        final IText it = itext;
        final Object d = it.varsayilanEsleyiciS.newInstance();
        String kl = System.getProperty("pdefe.yazitipleri");
        List<String> klasorler = new ArrayList<String>();
        if (kl != null && kl.length() > 0) klasorler.addAll(Arrays.asList(kl.split(Pattern.quote(File.pathSeparator))));
        if (klasorler.isEmpty()) {
            String windir = System.getenv("WINDIR");
            klasorler.add((windir == null ? "C:\\Windows" : windir) + "\\Fonts");
        }
        for (String k : klasorler) {
            if (k.length() == 0 || !new File(k).isDirectory()) continue;
            try {
                IText.cagir(it.insertDirectory, d, k);
            } catch (Exception e) {
                // bozuk yazı tipi dosyası: klasörün kalanı yine de kullanılır
            }
        }
        Map<?, ?> m = (Map<?, ?>) IText.cagir(it.getMapper, d);
        for (Object bp : m.values()) {
            Field enc = bp.getClass().getField("encoding");
            Field gom = bp.getClass().getField("embedded");
            enc.set(bp, it.identityH);
            gom.setBoolean(bp, true);
        }
        final Map<String, Object> onbellek = new HashMap<String, Object>();
        InvocationHandler h = new InvocationHandler() {
            public Object invoke(Object vekil, Method yontem, Object[] a) throws Throwable {
                String ad = yontem.getName();
                if (ad.equals("awtToPdf") && a != null && a.length == 1 && a[0] instanceof Font) return pdfYaziTipi(it, d, (Font) a[0], onbellek);
                if (ad.equals("hashCode")) return System.identityHashCode(vekil);
                if (ad.equals("equals")) return vekil == a[0];
                if (ad.equals("toString")) return "PDEfe yazı tipi eşleyicisi";
                return IText.cagir(yontem, d, a == null ? new Object[0] : a);
            }
        };
        yaziTipiEsleyici = Proxy.newProxyInstance(it.esleyiciS.getClassLoader(), new Class<?>[]{it.esleyiciS}, h);
        return yaziTipiEsleyici;
    }

    static Object pdfYaziTipi(IText it, Object d, Font f, Map<String, Object> onbellek) throws Exception {
        String bicem = (f.isBold() ? " Bold" : "") + (f.isItalic() ? " Italic" : "");
        String anahtar = f.getFontName() + "|" + f.getFamily() + "|" + f.getStyle();
        Object bf = onbellek.get(anahtar);
        if (bf != null) return bf;
        List<String> adlar = new ArrayList<String>();
        adlar.add(f.getFontName());
        adlar.add(f.getFamily() + bicem);
        adlar.add(f.getFamily());
        String gercek = MANTIKSAL.get(f.getFamily().toLowerCase(Locale.ROOT));
        if (gercek == null) gercek = MANTIKSAL.get(f.getName().toLowerCase(Locale.ROOT));
        if (gercek != null) {
            adlar.add(gercek + bicem);
            adlar.add(gercek);
        }
        adlar.add("Arial" + bicem);
        adlar.add("Arial");
        for (String ad : adlar) {
            Object bp = IText.cagir(it.getBaseFontParameters, d, ad);
            if (bp == null) continue;
            Class<?> c = bp.getClass();
            try {
                bf = IText.cagir(it.createFont, null, c.getField("fontName").get(bp), c.getField("encoding").get(bp),
                        c.getField("embedded").getBoolean(bp), c.getField("cached").getBoolean(bp), c.getField("ttfAfm").get(bp),
                        c.getField("pfb").get(bp));
            } catch (Exception e) {
                bf = null;   // okunamayan yazı tipi dosyası: sıradaki ad
            }
            if (bf != null) break;
        }
        if (bf == null) bf = IText.cagir(it.varsayilanEsleyiciS.getMethod("awtToPdf", Font.class), d, f);
        onbellek.put(anahtar, bf);
        return bf;
    }

    // ---------------------------------------------------------------- yazıcı (yedek yol, yalnızca Windows)

    static Map<String, Object> yazici(final String no, File girdi, File cikti, String ad, boolean duz) throws Exception {
        if (ad == null || ad.length() == 0) ad = VARSAYILAN_YAZICI;
        PrintService hedef = null;
        for (PrintService s : PrintServiceLookup.lookupPrintServices(null, null)) if (s.getName().equalsIgnoreCase(ad)) hedef = s;
        if (hedef == null) throw new KopruHatasi("yazici_yok", "PDF yazıcısı bulunamadı: " + ad);
        final Pageable p = yukle(girdi, duz);
        final int n = p.getNumberOfPages();
        if (n <= 0) throw new KopruHatasi("bos", "Belgede sayfa yok");
        PrinterJob j = PrinterJob.getPrinterJob();
        j.setPrintService(hedef);
        j.setPageable(new Pageable() {
            public int getNumberOfPages() { return n; }
            public PageFormat getPageFormat(int i) { return p.getPageFormat(i); }
            public Printable getPrintable(final int i) {
                final Printable pr = p.getPrintable(i);
                return new Printable() {
                    public int print(Graphics g, PageFormat pf, int s) throws PrinterException {
                        // Java kırpma alanını yazıcının basılabilir alanına kuruyor; antet ve alt bilgi kesilmesin
                        g.setClip(0, 0, (int) Math.ceil(pf.getWidth()), (int) Math.ceil(pf.getHeight()));
                        int r = pr.print(g, pf, s);
                        ilerleme(no, Math.min(s + 1, n), n);
                        return r;
                    }
                };
            }
        });
        HashPrintRequestAttributeSet a = new HashPrintRequestAttributeSet();
        a.add(new Destination(cikti.toURI()));
        a.add(new JobName("PDEfe", null));
        cikti.delete();
        j.print(a);
        if (!cikti.isFile()) throw new KopruHatasi("hata", "PDF yazıcısı dosya yazmadı");
        Map<String, Object> s = new LinkedHashMap<String, Object>();
        s.put("sayfa", n);
        s.put("boylar", boylar(p));
        s.put("cizim", "yazici");
        return s;
    }

    // ---------------------------------------------------------------- PNG (küçük resim, sınama)

    static BufferedImage sayfaCiz(final Pageable p, final int i, final double olcek) throws Exception {
        final PageFormat pf = p.getPageFormat(i);
        int g = Math.max(1, (int) Math.round(pf.getWidth() * olcek)), y = Math.max(1, (int) Math.round(pf.getHeight() * olcek));
        final BufferedImage im = new BufferedImage(g, y, BufferedImage.TYPE_INT_RGB);
        final Throwable[] hata = new Throwable[1];
        SwingUtilities.invokeAndWait(new Runnable() {
            public void run() {
                Graphics2D gr = im.createGraphics();
                try {
                    gr.setColor(Color.WHITE);
                    gr.fillRect(0, 0, im.getWidth(), im.getHeight());
                    gr.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                    gr.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
                    gr.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                    gr.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    gr.scale(olcek, olcek);
                    gr.setClip(0, 0, (int) Math.ceil(pf.getWidth()), (int) Math.ceil(pf.getHeight()));
                    p.getPrintable(i).print(gr, pf, i);
                } catch (Throwable t) {
                    hata[0] = t;
                } finally {
                    gr.dispose();
                }
            }
        });
        if (hata[0] != null) {
            Throwable k = kok(hata[0]);
            if (k instanceof Error) throw new KopruHatasi("olumcul", String.valueOf(k));
            throw new KopruHatasi("hata", "Sayfa çizilemedi: " + k);
        }
        return im;
    }

    static Map<String, Object> png(String no, File girdi, File klasor, double olcek, int ilk, int son) throws Exception {
        if (!(olcek > 0.01 && olcek <= 8)) throw new KopruHatasi("hata", "Ölçek 0,01 ile 8 arasında olmalı");
        Pageable p = yukle(girdi, true);
        int n = p.getNumberOfPages();
        if (n <= 0) throw new KopruHatasi("bos", "Belgede sayfa yok");
        klasor.mkdirs();
        int a = Math.max(1, ilk), b = son <= 0 ? n : Math.min(son, n);
        for (int i = a; i <= b; i++) {
            ImageIO.write(sayfaCiz(p, i - 1, olcek), "png", new File(klasor, "sayfa-" + i + ".png"));
            ilerleme(no, i - a + 1, b - a + 1);
        }
        Map<String, Object> s = new LinkedHashMap<String, Object>();
        s.put("sayfa", n);
        s.put("boylar", boylar(p));
        s.put("cizilen", Math.max(0, b - a + 1));
        return s;
    }

    static Map<String, Object> bilgi(File girdi, int genislik) throws Exception {
        Pageable p = yukle(girdi, true);
        int n = p.getNumberOfPages();
        Map<String, Object> s = new LinkedHashMap<String, Object>();
        s.put("sayfa", n);
        s.put("boylar", boylar(p));
        if (n > 0 && genislik > 0) {
            PageFormat pf = p.getPageFormat(0);
            BufferedImage im = sayfaCiz(p, 0, Math.min(8.0, genislik / Math.max(1.0, pf.getWidth())));
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            ImageIO.write(im, "png", b);
            s.put("png", Base64.getEncoder().encodeToString(b.toByteArray()));
            s.put("pngGenislik", im.getWidth());
            s.put("pngYukseklik", im.getHeight());
        }
        return s;
    }

    // ---------------------------------------------------------------- saydamlığın düzleştirilmesi

    static final Pattern RESIM = Pattern.compile("(bgImageData|imageData)=\"([^\"]*)\"");

    /** content.xml'deki saydam resimleri (bgImageData, imageData) beyaz zemine oturtur. Zip (UDF) ya da düz XML (format 1.7). */
    static byte[] duzlestir(byte[] udf) throws IOException {
        if (udf.length > 3 && udf[0] == 'P' && udf[1] == 'K') {
            ZipInputStream zi = new ZipInputStream(new ByteArrayInputStream(udf));
            ByteArrayOutputStream bo = new ByteArrayOutputStream(udf.length + 1024);
            ZipOutputStream zo = new ZipOutputStream(bo);
            ZipEntry e;
            boolean degisti = false;
            while ((e = zi.getNextEntry()) != null) {
                byte[] veri = hepsiniOku(zi);
                if (e.getName().equals("content.xml")) {
                    byte[] yeni = xmlDuzlestir(veri);
                    if (yeni != veri) degisti = true;
                    veri = yeni;
                }
                zo.putNextEntry(new ZipEntry(e.getName()));
                zo.write(veri);
                zo.closeEntry();
            }
            zo.close();
            return degisti ? bo.toByteArray() : udf;
        }
        return xmlDuzlestir(udf);
    }

    static byte[] xmlDuzlestir(byte[] veri) throws IOException {
        String x = new String(veri, "UTF-8");
        Matcher m = RESIM.matcher(x);
        StringBuffer sb = null;
        while (m.find()) {
            String yeni = resimDuzlestir(m.group(2));
            if (yeni == null) continue;
            if (sb == null) sb = new StringBuffer(x.length());
            m.appendReplacement(sb, Matcher.quoteReplacement(m.group(1) + "=\"" + yeni + "\""));
        }
        if (sb == null) return veri;
        m.appendTail(sb);
        return sb.toString().getBytes("UTF-8");
    }

    /** Saydam resmi beyaza oturtulmuş PNG olarak (base64) döner; saydam değilse ya da çözülemezse null (resim olduğu gibi kalır). */
    static String resimDuzlestir(String b64) {
        try {
            byte[] r = Base64.getMimeDecoder().decode(b64);
            BufferedImage im = ImageIO.read(new ByteArrayInputStream(r));
            if (im == null || !im.getColorModel().hasAlpha()) return null;
            BufferedImage d = new BufferedImage(im.getWidth(), im.getHeight(), BufferedImage.TYPE_INT_RGB);
            Graphics2D g = d.createGraphics();
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, d.getWidth(), d.getHeight());
            g.drawImage(im, 0, 0, null);
            g.dispose();
            ByteArrayOutputStream pb = new ByteArrayOutputStream(r.length);
            ImageIO.write(d, "png", pb);
            return Base64.getEncoder().encodeToString(pb.toByteArray());
        } catch (Exception e) {
            return null;
        }
    }

    // ---------------------------------------------------------------- yardımcılar

    static byte[] oku(File f) throws IOException {
        InputStream in = new FileInputStream(f);
        try {
            return hepsiniOku(in);
        } finally {
            in.close();
        }
    }

    static byte[] hepsiniOku(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] t = new byte[1 << 16];
        int n;
        while ((n = in.read(t)) > 0) b.write(t, 0, n);
        return b.toByteArray();
    }

    static Throwable kok(Throwable t) {
        Throwable k = t;
        while (k.getCause() != null && k.getCause() != k) k = k.getCause();
        return k;
    }

    static final class KopruHatasi extends Exception {
        final String tur;

        KopruHatasi(String tur, String ileti) {
            super(ileti);
            this.tur = tur;
        }
    }

    // ---------------------------------------------------------------- JSON (ASCII: konsol kodlamasından bağımsız)

    static void yaz(Map<String, Object> m) {
        StringBuilder sb = new StringBuilder(256);
        json(sb, m);
        synchronized (cikis) {
            cikis.print(sb.toString());
            cikis.print('\n');
            cikis.flush();
        }
    }

    static void json(StringBuilder sb, Object o) {
        if (o == null) {
            sb.append("null");
        } else if (o instanceof Boolean || o instanceof Integer || o instanceof Long) {
            sb.append(o);
        } else if (o instanceof Number) {
            double d = ((Number) o).doubleValue();
            sb.append(Double.isNaN(d) || Double.isInfinite(d) ? "null" : String.format(Locale.ROOT, "%.2f", d));
        } else if (o instanceof Map) {
            sb.append('{');
            boolean ilk = true;
            for (Iterator<?> i = ((Map<?, ?>) o).entrySet().iterator(); i.hasNext(); ) {
                Map.Entry<?, ?> e = (Map.Entry<?, ?>) i.next();
                if (!ilk) sb.append(',');
                ilk = false;
                dizgi(sb, String.valueOf(e.getKey()));
                sb.append(':');
                json(sb, e.getValue());
            }
            sb.append('}');
        } else if (o instanceof List) {
            sb.append('[');
            boolean ilk = true;
            for (Object x : (List<?>) o) {
                if (!ilk) sb.append(',');
                ilk = false;
                json(sb, x);
            }
            sb.append(']');
        } else {
            dizgi(sb, String.valueOf(o));
        }
    }

    static void dizgi(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') sb.append('\\').append(c);
            else if (c < 0x20 || c > 0x7e) sb.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else sb.append(c);
        }
        sb.append('"');
    }
}
