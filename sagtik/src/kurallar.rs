//! Sağ tık menüsünün kuralları (COM'dan bağımsız, birim testleriyle sınanır): Hangi uzantıda hangi seçenek görünür, PDEfe'nin komut satırı
//! nasıl kurulur, kurucunun yazdığı PDEfe yolu dosyası nasıl okunur.

/// Format Değiştir'in aldığı türler (src/renderer/araclar/donustur.js GIRDI_UZANTILARI: PDF, UDF, TIFF, Word, görüntüler). HEIC / HEIF ve AVIF
/// yok: Format Değiştir'in Dosya ekle süzgecinde de yoklar (HEIC'in açıcısı pakette yok). test/sagtik_sinama.mjs iki listeyi karşılaştırır.
pub const DONUSTUR_UZANTILARI: &[&str] = &[
    "pdf", "udf", "tif", "tiff", "doc", "docx", "docm", "rtf", "odt", "jpg", "jpeg", "png", "bmp", "gif", "webp",
];

/// Birleştir'in aldığı türler (src/renderer/araclar/gorselBirlestir.js UZANTILAR). Bugün Format Değiştir'inkiyle aynı küme, ayrı tutulur:
/// Biri genişlerse öbürü kendiliğinden genişlemesin. test/sagtik_sinama.mjs karşılaştırır.
pub const BIRLESTIR_UZANTILARI: &[&str] = &[
    "pdf", "jpg", "jpeg", "png", "bmp", "gif", "tif", "tiff", "webp", "udf", "doc", "docx", "docm", "rtf", "odt",
];

/// Seçimde bundan çok öğe varsa seçenekler görünmez: Gezgin'de bütün klasörü seçen Ctrl+A on binlerce öğe verebilir, her öğenin yolu
/// okunur (menü bu sürede açılmaz). PDEfe'nin araçları bu kadar dosyayla zaten rahat çalışmaz.
pub const EN_COK_OGE: u32 = 1000;

/// PDEfe'ye tek komut satırında verilebilecek en uzun komut (UTF-16 birimi). CreateProcessW'nin sınırı 32767; pay bırakılır. Daha uzunsa
/// yollar liste dosyasıyla verilir (`--dosya-listesi=`).
pub const KOMUT_SATIRI_SINIRI: usize = 30000;

/// Liste dosyasının ilk satırı (src/main/sagtik.js LISTE_BASLIGI ile aynı).
pub const LISTE_BASLIGI: &str = "pdefe-dosya-listesi-1";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tur {
    Donustur,
    Birlestir,
}

impl Tur {
    /// Menüdeki ad (kurucunun yazdığı MUIVerb ile aynı: build/installer.nsh).
    pub fn baslik(self) -> &'static str {
        match self {
            Tur::Donustur => "PDEfe ile dönüştür",
            Tur::Birlestir => "PDEfe ile birleştir",
        }
    }
    /// PDEfe'nin komut satırı anahtarı (src/main/sagtik.js).
    pub fn anahtar(self) -> &'static str {
        match self {
            Tur::Donustur => "--donustur",
            Tur::Birlestir => "--birlestir",
        }
    }
    pub fn uzantilar(self) -> &'static [&'static str] {
        match self {
            Tur::Donustur => DONUSTUR_UZANTILARI,
            Tur::Birlestir => BIRLESTIR_UZANTILARI,
        }
    }
    /// Seçenek için gereken en az öğe: Dönüştür tek dosyada da, Birleştir iki ve daha çok dosyada.
    pub fn en_az(self) -> u32 {
        match self {
            Tur::Donustur => 1,
            Tur::Birlestir => 2,
        }
    }
}

/// Yolun uzantısı küçük harfle (yalnız ASCII; son ayırıcıdan sonraki son noktadan sonrası). Uzantı yoksa ya da ASCII değilse None.
pub fn uzanti(yol: &[u16]) -> Option<String> {
    let mut son_nokta = None;
    for (i, &c) in yol.iter().enumerate() {
        if c == b'\\' as u16 || c == b'/' as u16 {
            son_nokta = None;
        } else if c == b'.' as u16 {
            son_nokta = Some(i);
        }
    }
    let i = son_nokta?;
    let parca = yol.get(i + 1..)?;
    if parca.is_empty() || parca.len() > 8 {
        return None;
    }
    let mut s = String::with_capacity(parca.len());
    for &c in parca {
        if c >= 0x80 {
            return None;
        }
        s.push((c as u8).to_ascii_lowercase() as char);
    }
    Some(s)
}

/// Bu tür bu uzantıyı alıyor mu.
pub fn uzanti_destekli(tur: Tur, yol: &[u16]) -> bool {
    match uzanti(yol) {
        Some(u) => tur.uzantilar().iter().any(|x| *x == u),
        None => false,
    }
}

/// Seçimdeki bir öğe: dosya sistemindeki bir dosyanın yolu, ya da kural dışı (klasör, sanal öğe, yolu okunamayan öğe).
pub enum Oge<'a> {
    Dosya(&'a [u16]),
    Diger,
}

/// Seçenek görünür mü: öğe sayısı türün en azı ile EN_COK_OGE arasında ve öğelerin hepsi bu türün aldığı uzantıda dosya.
pub fn gorunur<'a, I: IntoIterator<Item = Oge<'a>>>(tur: Tur, sayi: u32, ogeler: I) -> bool {
    if sayi < tur.en_az() || sayi > EN_COK_OGE {
        return false;
    }
    let mut gorulen = 0u32;
    for o in ogeler {
        match o {
            Oge::Dosya(y) if uzanti_destekli(tur, y) => gorulen += 1,
            _ => return false,
        }
    }
    gorulen == sayi
}

/// Bağımsız değişkeni komut satırına ekler (öncesine boşluk koymaz). Windows'un ayrıştırma kuralıyla (CommandLineToArgvW, MSVC çalışma
/// kitaplığı, Chromium'un CommandLine'ı) geri okununca aynı dizgi çıkar: Her zaman tırnaklanır, tırnaktan önceki ters bölüler ikilenir,
/// tırnak \" olur, sondaki ters bölüler kapanış tırnağından önce ikilenir. Dosya adında tırnak olamaz (Windows'ta yasak karakter), ama
/// kurallar yine de uygulanır.
pub fn arguman_ekle(hedef: &mut Vec<u16>, arguman: &[u16]) {
    const TIRNAK: u16 = b'"' as u16;
    const TERS: u16 = b'\\' as u16;
    hedef.push(TIRNAK);
    let mut ters = 0usize;
    for &c in arguman {
        if c == TERS {
            ters += 1;
        } else if c == TIRNAK {
            hedef.extend(std::iter::repeat(TERS).take(ters * 2 + 1));
            hedef.push(TIRNAK);
            ters = 0;
        } else {
            hedef.extend(std::iter::repeat(TERS).take(ters));
            hedef.push(c);
            ters = 0;
        }
    }
    hedef.extend(std::iter::repeat(TERS).take(ters * 2));
    hedef.push(TIRNAK);
}

/// Programın adı (komut satırının ilk parçası): Windows ilk parçayı ters bölü kuralı olmadan, tırnaktan tırnağa okur. Exe yolunda tırnak
/// olamaz; tırnak varsa None.
fn program_ekle(hedef: &mut Vec<u16>, exe: &[u16]) -> Option<()> {
    if exe.contains(&(b'"' as u16)) {
        return None;
    }
    hedef.push(b'"' as u16);
    hedef.extend_from_slice(exe);
    hedef.push(b'"' as u16);
    Some(())
}

fn utf16(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

/// PDEfe'nin komut satırı: `"<exe>" --donustur "<yol 1>" "<yol 2>" …`. Sığmazsa (KOMUT_SATIRI_SINIRI) None: yollar liste dosyasıyla verilir.
pub fn komut_satiri(exe: &[u16], tur: Tur, yollar: &[Vec<u16>]) -> Option<Vec<u16>> {
    let mut k = Vec::with_capacity(exe.len() + 16 + yollar.iter().map(|y| y.len() + 3).sum::<usize>());
    program_ekle(&mut k, exe)?;
    k.push(b' ' as u16);
    k.extend(utf16(tur.anahtar()));
    for y in yollar {
        k.push(b' ' as u16);
        arguman_ekle(&mut k, y);
        if k.len() > KOMUT_SATIRI_SINIRI {
            return None;
        }
    }
    Some(k)
}

/// Liste dosyasıyla komut satırı: `"<exe>" --donustur "--dosya-listesi=<liste>"`.
pub fn liste_komut_satiri(exe: &[u16], tur: Tur, liste: &[u16]) -> Option<Vec<u16>> {
    let mut k = Vec::new();
    program_ekle(&mut k, exe)?;
    k.push(b' ' as u16);
    k.extend(utf16(tur.anahtar()));
    k.push(b' ' as u16);
    let mut arg = utf16("--dosya-listesi=");
    arg.extend_from_slice(liste);
    arguman_ekle(&mut k, &arg);
    if k.len() > KOMUT_SATIRI_SINIRI {
        return None;
    }
    Some(k)
}

/// Liste dosyasının içeriği (UTF-8): başlık satırı, sonra her satırda bir yol. Dosya yolunda satır sonu olamaz (Windows'ta yasak karakter).
/// Yolu UTF-8'e çevrilemeyen (eşi olmayan vekil karakterli) bir öğe varsa None.
pub fn liste_icerigi(yollar: &[Vec<u16>]) -> Option<Vec<u8>> {
    let mut s = String::from(LISTE_BASLIGI);
    s.push('\n');
    for y in yollar {
        let yol = String::from_utf16(y).ok()?;
        if yol.contains('\n') || yol.contains('\r') {
            return None;
        }
        s.push_str(&yol);
        s.push('\n');
    }
    Some(s.into_bytes())
}

/// Kurucunun DLL'in yanına yazdığı PDEfe yolu dosyasının (PDEfe-yolu.txt) içeriği: UTF-16LE (BOM'lu ya da BOM'suz) ya da UTF-8. Baştaki ve
/// sondaki boşluklar, satır sonları ve NUL atılır. Mutlak, .exe ile biten ve tırnaksız bir yol değilse None.
pub fn yol_dosyasini_coz(bayt: &[u8]) -> Option<Vec<u16>> {
    let metin: Vec<u16> = if bayt.len() >= 2 && bayt[0] == 0xFF && bayt[1] == 0xFE {
        bayt[2..].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect()
    } else if bayt.len() >= 2 && bayt.len() % 2 == 0 && bayt[1] == 0 && bayt[0] != 0 {
        bayt.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect()
    } else {
        let b = bayt.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(bayt);
        std::str::from_utf8(b).ok()?.encode_utf16().collect()
    };
    let bos = |c: &u16| *c == 0 || *c == b' ' as u16 || *c == b'\t' as u16 || *c == b'\r' as u16 || *c == b'\n' as u16;
    let bas = metin.iter().position(|c| !bos(c))?;
    let son = metin.iter().rposition(|c| !bos(c))?;
    let yol = metin.get(bas..=son)?.to_vec();
    if yol.len() < 8 || yol.len() > 32000 || yol.iter().any(|&c| c == b'"' as u16 || c < 0x20) {
        return None;
    }
    // Mutlak: "X:\" ya da "\\sunucu\" ile başlar
    let surucu = yol.len() > 3
        && (yol[0] as u8 as char).is_ascii_alphabetic()
        && yol[0] < 0x80
        && yol[1] == b':' as u16
        && yol[2] == b'\\' as u16;
    let ag = yol.len() > 3 && yol[0] == b'\\' as u16 && yol[1] == b'\\' as u16;
    if !(surucu || ag) {
        return None;
    }
    if uzanti(&yol).as_deref() != Some("exe") {
        return None;
    }
    Some(yol)
}

/// Exe'nin klasörü (son ters bölüye dek, ters bölü dâhil değil).
pub fn klasoru(yol: &[u16]) -> Option<&[u16]> {
    let i = yol.iter().rposition(|&c| c == b'\\' as u16)?;
    yol.get(..i)
}

#[cfg(test)]
mod testler {
    use super::*;

    fn w(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }

    #[test]
    fn uzantilar() {
        assert_eq!(uzanti(&w(r"C:\a\b.PDF")).as_deref(), Some("pdf"));
        assert_eq!(uzanti(&w(r"C:\a.klasör\belge")), None);
        assert_eq!(uzanti(&w(r"C:\a\belge.")), None);
        assert_eq!(uzanti(&w(r"C:\a\.pdf")).as_deref(), Some("pdf"));
        assert_eq!(uzanti(&w(r"C:\a\Dilekçe ö.Tiff")).as_deref(), Some("tiff"));
        assert_eq!(uzanti(&w(r"C:\a\b.pdf.lnk")).as_deref(), Some("lnk"));
        assert_eq!(uzanti(&w(r"C:\a\b.pdfş")), None);
        assert_eq!(uzanti(&w(r"\\sunucu\paylaşım\x.docm")).as_deref(), Some("docm"));
    }

    #[test]
    fn gorunme_kurali() {
        let pdf = w(r"C:\a.pdf");
        let doc = w(r"C:\b.DOCX");
        let txt = w(r"C:\c.txt");
        fn d<'a>(v: &[&'a Vec<u16>]) -> Vec<Oge<'a>> {
            v.iter().map(|y| Oge::Dosya(y.as_slice())).collect()
        }
        // Tek dosya: yalnız Dönüştür
        assert!(gorunur(Tur::Donustur, 1, d(&[&pdf])));
        assert!(!gorunur(Tur::Birlestir, 1, d(&[&pdf])));
        // İki dosya: ikisi de
        assert!(gorunur(Tur::Donustur, 2, d(&[&pdf, &doc])));
        assert!(gorunur(Tur::Birlestir, 2, d(&[&pdf, &doc])));
        // Desteklenmeyen tür ya da klasör varsa görünmez
        assert!(!gorunur(Tur::Donustur, 2, d(&[&pdf, &txt])));
        assert!(!gorunur(Tur::Birlestir, 2, vec![Oge::Dosya(&pdf), Oge::Diger]));
        assert!(!gorunur(Tur::Donustur, 1, vec![Oge::Diger]));
        // Sayı tutmazsa (öğe okunamadı) görünmez
        assert!(!gorunur(Tur::Donustur, 3, d(&[&pdf, &doc])));
        assert!(!gorunur(Tur::Donustur, 0, d(&[])));
        // Üst sınır
        let cok: Vec<Vec<u16>> = (0..=EN_COK_OGE).map(|i| w(&format!(r"C:\{i}.pdf"))).collect();
        assert!(gorunur(Tur::Birlestir, EN_COK_OGE, cok[..EN_COK_OGE as usize].iter().map(|y| Oge::Dosya(y))));
        assert!(!gorunur(Tur::Birlestir, EN_COK_OGE + 1, cok.iter().map(|y| Oge::Dosya(y))));
    }

    /// Windows'un kendi ayrıştırıcısıyla geri okuma (CommandLineToArgvW).
    fn ayristir(k: &[u16]) -> Vec<String> {
        use windows::Win32::Foundation::{HLOCAL, LocalFree};
        use windows::Win32::UI::Shell::CommandLineToArgvW;
        let mut z = k.to_vec();
        z.push(0);
        let mut n = 0i32;
        unsafe {
            let p = CommandLineToArgvW(windows::core::PCWSTR(z.as_ptr()), &mut n);
            assert!(!p.is_null());
            let v = (0..n as usize).map(|i| (*p.add(i)).to_string().unwrap()).collect();
            let _ = LocalFree(Some(HLOCAL(p as _)));
            v
        }
    }

    #[test]
    fn komut_satiri_geri_okunur() {
        let exe = w(r"C:\Yerel Uygulamalar (Ağ Değil)\Programlar\PDEfe\PDEfe.exe");
        let yollar: Vec<Vec<u16>> = [
            r"C:\Belgeler\Dilekçe örneği.pdf",
            r"C:\Belgeler\Ali'nin & Veli'nin (son) %TEMP% ^ ! belgesi.pdf",
            r"\\sunucu\paylaşım\a b\x.docx",
            r"C:\a\b\\c.pdf",
            r"C:\tırnak\a\b.pdf",
            r#"C:\olmaz"ama"\kural.pdf"#,
            r"C:\sonda\ters\",
            "C:\\boşluk\tsekme.pdf",
            r"C:\Ünicode\😀 belge.png",
        ]
        .iter()
        .map(|s| w(s))
        .collect();
        let k = komut_satiri(&exe, Tur::Birlestir, &yollar).unwrap();
        let geri = ayristir(&k);
        assert_eq!(geri[0], String::from_utf16(&exe).unwrap());
        assert_eq!(geri[1], "--birlestir");
        for (i, y) in yollar.iter().enumerate() {
            assert_eq!(geri[i + 2], String::from_utf16(y).unwrap(), "yol {i}");
        }
        assert_eq!(geri.len(), yollar.len() + 2);
    }

    #[test]
    fn uzun_komut_satiri_liste_ister() {
        let exe = w(r"C:\P\PDEfe.exe");
        let yollar: Vec<Vec<u16>> = (0..500).map(|i| w(&format!(r"C:\Çok uzun bir klasör adı\alt klasör\Belge numarası {i:04}.pdf"))).collect();
        assert!(komut_satiri(&exe, Tur::Donustur, &yollar).is_none());
        let liste = w(r"C:\Geçici Dosyalar\Kişisel Değil\PDEfe\sagtik-1-2-3.txt");
        let k = liste_komut_satiri(&exe, Tur::Donustur, &liste).unwrap();
        let geri = ayristir(&k);
        assert_eq!(geri[1], "--donustur");
        assert_eq!(geri[2], format!("--dosya-listesi={}", String::from_utf16(&liste).unwrap()));
        let icerik = String::from_utf8(liste_icerigi(&yollar).unwrap()).unwrap();
        let satirlar: Vec<&str> = icerik.lines().collect();
        assert_eq!(satirlar[0], LISTE_BASLIGI);
        assert_eq!(satirlar.len(), 501);
        assert_eq!(satirlar[500], String::from_utf16(&yollar[499]).unwrap());
    }

    #[test]
    fn program_adinda_tirnak_olmaz() {
        assert!(komut_satiri(&w(r#"C:\a"b\PDEfe.exe"#), Tur::Donustur, &[w(r"C:\x.pdf")]).is_none());
    }

    #[test]
    fn yol_dosyasi() {
        let yol = r"C:\Yerel Uygulamalar (Ağ Değil)\Programlar\PDEfe\PDEfe.exe";
        let mut utf16le = vec![0xFF, 0xFE];
        for c in format!("{yol}\r\n").encode_utf16() {
            utf16le.extend(c.to_le_bytes());
        }
        assert_eq!(yol_dosyasini_coz(&utf16le), Some(w(yol)));
        let bomsuz: Vec<u8> = yol.encode_utf16().flat_map(|c| c.to_le_bytes()).collect();
        assert_eq!(yol_dosyasini_coz(&bomsuz), Some(w(yol)));
        assert_eq!(yol_dosyasini_coz(format!("\u{FEFF}  {yol}\n").as_bytes()), Some(w(yol)));
        assert_eq!(yol_dosyasini_coz(r"\\sunucu\p\PDEfe.exe".as_bytes()), Some(w(r"\\sunucu\p\PDEfe.exe")));
        assert_eq!(yol_dosyasini_coz(b"PDEfe.exe"), None);
        assert_eq!(yol_dosyasini_coz(br"C:\P\PDEfe.bat"), None);
        assert_eq!(yol_dosyasini_coz(br#"C:\P\"PDEfe.exe"#), None);
        assert_eq!(yol_dosyasini_coz(b""), None);
        assert_eq!(yol_dosyasini_coz(&[0xFF, 0xFE]), None);
        assert_eq!(yol_dosyasini_coz(&[0xFF, 0xFE, 0x41]), None);
        assert_eq!(klasoru(&w(yol)), Some(&w(r"C:\Yerel Uygulamalar (Ağ Değil)\Programlar\PDEfe")[..]));
    }
}
