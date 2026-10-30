//! Sağ tık DLL'inin sınaması (0.3.1): DLL kurucunun düzeninde bir deneme klasörüne kopyalanır, LoadLibrary ile yüklenir, DllGetClassObject →
//! IClassFactory → IExplorerCommand alınır. Gerçek (deneme klasöründeki kurgusal) dosyalardan kabuk öğesi dizileri kurulur, GetState /
//! GetTitle / GetIcon kurallara göre denetlenir, Invoke'un başlattığı sahte PDEfe'nin komut satırı okunur (tests/ortak). Kayıt defterine
//! yazılmaz, Gezgin'e dokunulmaz. Kullanım: cargo test --release --test dll (node test/sagtik_sinama.mjs da çalıştırır).
mod ortak;

use ortak::*;
use std::ffi::c_void;
use std::path::PathBuf;
use windows::core::{Interface, BOOL, GUID, HRESULT, PCSTR, PCWSTR};
use windows::Win32::Foundation::{CLASS_E_CLASSNOTAVAILABLE, CLASS_E_NOAGGREGATION, E_NOTIMPL, E_POINTER, HMODULE, S_FALSE, S_OK};
use windows::Win32::System::Com::{CoInitializeEx, CoTaskMemFree, IClassFactory, COINIT_APARTMENTTHREADED};
use windows::Win32::Foundation::FreeLibrary;
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
use windows::Win32::UI::Shell::{IExplorerCommand, IShellItemArray, ECS_ENABLED, ECS_HIDDEN};

const CLSID_DONUSTUR: GUID = GUID::from_u128(0x76052c3f_ea2f_47a3_88b2_a488cb6bc682);
const CLSID_BIRLESTIR: GUID = GUID::from_u128(0x43d87927_34d2_4271_bec3_81d132284579);
const SINAMA_CLSID_DONUSTUR: GUID = GUID::from_u128(0x6f896873_46f5_4f6a_b082_ba2d345aa7dc);
const SINAMA_CLSID_BIRLESTIR: GUID = GUID::from_u128(0x757acc1d_9bcb_4792_a3b4_3f5889a88808);

type DllGetClassObjectFn = unsafe extern "system" fn(*const GUID, *const GUID, *mut *mut c_void) -> HRESULT;
type DllCanUnloadNowFn = unsafe extern "system" fn() -> HRESULT;

struct Dll {
    modul: HMODULE,
    sinif: DllGetClassObjectFn,
    birak: DllCanUnloadNowFn,
}

impl Dll {
    fn yukle(yol: &std::path::Path) -> Dll {
        unsafe {
            let y = wz(&yol.to_string_lossy());
            let modul = LoadLibraryW(PCWSTR(y.as_ptr())).expect("LoadLibraryW");
            let s = GetProcAddress(modul, PCSTR(b"DllGetClassObject\0".as_ptr())).expect("DllGetClassObject");
            let b = GetProcAddress(modul, PCSTR(b"DllCanUnloadNow\0".as_ptr())).expect("DllCanUnloadNow");
            Dll { modul, sinif: std::mem::transmute(s), birak: std::mem::transmute(b) }
        }
    }
    fn fabrika(&self, clsid: &GUID) -> Result<IClassFactory, HRESULT> {
        unsafe {
            let mut p: *mut c_void = std::ptr::null_mut();
            let hr = (self.sinif)(clsid, &IClassFactory::IID, &mut p);
            if hr.is_err() {
                return Err(hr);
            }
            Ok(IClassFactory::from_raw(p))
        }
    }
    fn komut(&self, clsid: &GUID) -> IExplorerCommand {
        unsafe { self.fabrika(clsid).expect("fabrika").CreateInstance(None).expect("CreateInstance") }
    }
    fn birakilabilir(&self) -> HRESULT {
        unsafe { (self.birak)() }
    }
}

fn baslik(k: &IExplorerCommand) -> String {
    unsafe {
        let p = k.GetTitle(None::<&IShellItemArray>).expect("GetTitle");
        let s = p.to_string().unwrap_or_default();
        CoTaskMemFree(Some(p.0 as *const c_void));
        s
    }
}

fn simge(k: &IExplorerCommand) -> Result<String, HRESULT> {
    unsafe {
        match k.GetIcon(None::<&IShellItemArray>) {
            Ok(p) => {
                let s = p.to_string().unwrap_or_default();
                CoTaskMemFree(Some(p.0 as *const c_void));
                Ok(s)
            }
            Err(e) => Err(e.code()),
        }
    }
}

const ACIK: u32 = ECS_ENABLED.0 as u32;
const GIZLI: u32 = ECS_HIDDEN.0 as u32;

fn durum(k: &IExplorerCommand, d: Option<&IShellItemArray>) -> u32 {
    unsafe { k.GetState(d, false).unwrap_or(0xFFFF) }
}

/// Invoke'u çağırır, sahte PDEfe'nin çıktısını bekler.
fn cagir(k: &IExplorerCommand, d: &IShellItemArray, kok: &std::path::Path, ad: &str) -> Option<SahteCikti> {
    let cikti = kok.join(format!("cikti-{ad}.txt"));
    let _ = std::fs::remove_file(&cikti);
    std::env::set_var("PDEFE_SAHTE_CIKTI", &cikti);
    let r = unsafe { k.Invoke(d, None) };
    std::env::remove_var("PDEFE_SAHTE_CIKTI");
    if let Err(e) = r {
        println!("       Invoke hatası: {e}");
        return None;
    }
    sahte_cikti_bekle(&cikti, 15000)
}

fn yollar_metin(v: &[PathBuf]) -> Vec<String> {
    v.iter().map(|p| p.to_string_lossy().into_owned()).collect()
}

fn main() {
    if sahte_pdefe_mi() {
        return;
    }
    let kod = std::panic::catch_unwind(sina).unwrap_or_else(|_| {
        println!("HATA   sınama yarıda kaldı (panik)");
        1
    });
    std::process::exit(kod);
}

fn sina() -> i32 {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
    let kok = deneme_klasoru("dll");
    println!("deneme klasörü: {}", kok.display());
    let sahte = sahte_pdefe_kur(&kok);
    let dll_yolu = dll_kur(&kok.join("SagTik").join("0.3.1"), Some(&sahte));
    let yolsuz_yolu = dll_kur(&kok.join("YolDosyasiYok"), None);
    let dll = Dll::yukle(&dll_yolu);
    let yolsuz = Dll::yukle(&yolsuz_yolu);

    // Kurgusal dosyalar (içleri boş: DLL dosya okumaz)
    let d = kok.join("Dosyalar (deneme)");
    std::fs::create_dir_all(&d).unwrap();
    let pdf = dosya(&d, "Dilekçe örneği.pdf");
    let docx = dosya(&d, "Ek-1 vekâletname.docx");
    let tif = dosya(&d, "TARAMA ÖRNEĞİ.TIF");
    let txt = dosya(&d, "notlar.txt");
    let heic = dosya(&d, "fotoğraf.heic");
    let tuhaf = dosya(&d, "Ali'nin & Veli'nin (son) %TEMP% ^ ! ; , = belgesi.pdf");
    let klasor_pdf = d.join("Klasör.pdf");
    std::fs::create_dir_all(&klasor_pdf).unwrap();
    let alt = d.join("Alt klasör");
    std::fs::create_dir_all(&alt).unwrap();
    let turler: Vec<PathBuf> = ["a.pdf", "b.udf", "c.tif", "d.tiff", "e.doc", "f.docx", "g.docm", "h.rtf", "i.odt", "j.jpg", "k.jpeg", "l.png", "m.bmp", "n.gif", "o.webp"]
        .iter()
        .map(|a| dosya(&d, &format!("tür {a}")))
        .collect();

    // ---------------------------------------------------------------- DLL girişleri
    unsafe {
        let mut p: *mut c_void = 1 as *mut c_void;
        let hr = (dll.sinif)(&GUID::from_u128(0x1234), &IClassFactory::IID, &mut p);
        denetle("Bilinmeyen CLSID: CLASS_E_CLASSNOTAVAILABLE, çıkış göstericisi boş", hr == CLASS_E_CLASSNOTAVAILABLE && p.is_null(), hr);
        let hr = (dll.sinif)(&CLSID_DONUSTUR, &IClassFactory::IID, std::ptr::null_mut());
        denetle("Çıkış göstericisi yoksa E_POINTER", hr == E_POINTER, hr);
        let hr = (dll.sinif)(std::ptr::null(), &IClassFactory::IID, &mut p);
        denetle("CLSID yoksa E_POINTER", hr == E_POINTER, hr);
    }
    denetle("Başta DllCanUnloadNow S_OK", dll.birakilabilir() == S_OK, dll.birakilabilir());
    {
        let f = dll.fabrika(&CLSID_DONUSTUR).expect("fabrika");
        denetle("Fabrika canlıyken S_FALSE", dll.birakilabilir() == S_FALSE, dll.birakilabilir());
        unsafe {
            let dis: windows::core::IUnknown = f.cast().unwrap();
            let r: windows::core::Result<IExplorerCommand> = f.CreateInstance(&dis);
            denetle("Birleştirme (aggregation) istenirse CLASS_E_NOAGGREGATION", r.as_ref().err().map(|e| e.code()) == Some(CLASS_E_NOAGGREGATION), r.err());
            f.LockServer(true).unwrap();
        }
        drop(f);
        denetle("LockServer(TRUE) sürerken S_FALSE", dll.birakilabilir() == S_FALSE, dll.birakilabilir());
        unsafe { dll.fabrika(&CLSID_DONUSTUR).unwrap().LockServer(false).unwrap() };
        denetle("LockServer(FALSE) ve fabrika bırakılınca S_OK", dll.birakilabilir() == S_OK, dll.birakilabilir());
    }

    // ---------------------------------------------------------------- başlık, simge, adlar
    let don = dll.komut(&CLSID_DONUSTUR);
    let bir = dll.komut(&CLSID_BIRLESTIR);
    denetle("Komut nesneleri canlıyken S_FALSE", dll.birakilabilir() == S_FALSE, dll.birakilabilir());
    denetle("Başlık: PDEfe ile dönüştür", baslik(&don) == "PDEfe ile dönüştür", baslik(&don));
    denetle("Başlık: PDEfe ile birleştir", baslik(&bir) == "PDEfe ile birleştir", baslik(&bir));
    let beklenen_simge = format!("{},0", sahte.display());
    denetle("Simge: PDEfe.exe'nin ilk simgesi (PDEfe-yolu.txt'deki yol)", simge(&don) == Ok(beklenen_simge.clone()), simge(&don));
    denetle("Simge (birleştir)", simge(&bir) == Ok(beklenen_simge), simge(&bir));
    unsafe {
        denetle("GetCanonicalName CLSID'dir", don.GetCanonicalName().ok() == Some(CLSID_DONUSTUR) && bir.GetCanonicalName().ok() == Some(CLSID_BIRLESTIR), ());
        denetle("GetFlags ECF_DEFAULT", don.GetFlags().ok() == Some(0), don.GetFlags());
        denetle("Alt komut yok (EnumSubCommands E_NOTIMPL)", don.EnumSubCommands().err().map(|e| e.code()) == Some(E_NOTIMPL), ());
        denetle("İpucu yok (GetToolTip E_NOTIMPL)", don.GetToolTip(None::<&IShellItemArray>).err().map(|e| e.code()) == Some(E_NOTIMPL), ());
    }
    let yolsuz_don = yolsuz.komut(&CLSID_DONUSTUR);
    denetle("PDEfe-yolu.txt yoksa GetIcon E_NOTIMPL (Gezgin kayıttaki Icon'u kullanır)", simge(&yolsuz_don) == Err(E_NOTIMPL), simge(&yolsuz_don));
    denetle("PDEfe-yolu.txt yokken de başlık ve görünme kuralı aynı", baslik(&yolsuz_don) == "PDEfe ile dönüştür" && durum(&yolsuz_don, Some(&dizi(&[pdf.clone()]))) == ACIK, ());
    let s_don = dll.komut(&SINAMA_CLSID_DONUSTUR);
    let s_bir = dll.komut(&SINAMA_CLSID_BIRLESTIR);
    denetle("Sınama CLSID'leri gerçeklerinin davranışında", baslik(&s_don) == "PDEfe ile dönüştür" && baslik(&s_bir) == "PDEfe ile birleştir", ());
    drop((s_don, s_bir, yolsuz_don));

    // ---------------------------------------------------------------- görünme kuralı (GetState)
    let durumlar = |ad: &str, yollar: &[PathBuf], d_beklenen: u32, b_beklenen: u32| {
        let dz = dizi(yollar);
        let (dd, bd) = (durum(&don, Some(&dz)), durum(&bir, Some(&dz)));
        denetle(ad, dd == d_beklenen && bd == b_beklenen, (dd, bd));
    };
    durumlar("Tek PDF: yalnız dönüştür", &[pdf.clone()], ACIK, GIZLI);
    durumlar("İki dosya (PDF, Word): ikisi de", &[pdf.clone(), docx.clone()], ACIK, ACIK);
    durumlar("Büyük harfli uzantı (.TIF), tek dosya: dönüştür", &[tif.clone()], ACIK, GIZLI);
    durumlar("Desteklenmeyen tek dosya (.txt): hiçbiri", &[txt.clone()], GIZLI, GIZLI);
    durumlar("HEIC (Format Değiştir'in Dosya ekle süzgecinde yok): hiçbiri", &[heic.clone()], GIZLI, GIZLI);
    durumlar("PDF ve .txt karışık: hiçbiri", &[pdf.clone(), txt.clone()], GIZLI, GIZLI);
    durumlar("Adı .pdf ile biten klasör: hiçbiri", &[klasor_pdf.clone()], GIZLI, GIZLI);
    durumlar("PDF ve klasör: hiçbiri", &[pdf.clone(), alt.clone()], GIZLI, GIZLI);
    durumlar("PDF ve adı .pdf ile biten klasör: hiçbiri", &[pdf.clone(), klasor_pdf.clone()], GIZLI, GIZLI);
    durumlar("Tek klasör: hiçbiri", &[alt.clone()], GIZLI, GIZLI);
    durumlar("Desteklenen 15 türün hepsi birlikte: ikisi de", &turler, ACIK, ACIK);
    for t in &turler {
        let dz = dizi(&[t.clone()]);
        let ad = t.file_name().unwrap().to_string_lossy().into_owned();
        denetle(&format!("Tek dosya {ad}: dönüştür var, birleştir yok"), durum(&don, Some(&dz)) == ACIK && durum(&bir, Some(&dz)) == GIZLI, ());
    }
    denetle("Seçim yoksa (null dizi) hiçbiri", durum(&don, None) == GIZLI && durum(&bir, None) == GIZLI, ());
    {
        let masaustu = dizi(&[std::env::var("SystemDrive").map(|s| PathBuf::from(format!("{s}\\"))).unwrap_or(PathBuf::from(r"C:\"))]);
        denetle("Sürücü kökü: hiçbiri", durum(&don, Some(&masaustu)) == GIZLI && durum(&bir, Some(&masaustu)) == GIZLI, ());
    }

    // Gezgin'in yolu: klasör + çocuk kimlikleri → veri nesnesi → öğe dizisi
    let elli: Vec<PathBuf> = (1..=50).map(|i| dosya(&d, &format!("Belge {i:02} (deneme).pdf"))).collect();
    let elli_ad: Vec<String> = elli.iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
    let elli_ref: Vec<&str> = elli_ad.iter().map(|s| s.as_str()).collect();
    let secim50 = Secim::yeni(&d, &elli_ref);
    let dz50 = secim50.dizi();
    denetle("50 PDF (Gezgin'in veri nesnesinden): ikisi de", durum(&don, Some(&dz50)) == ACIK && durum(&bir, Some(&dz50)) == ACIK, ());

    // Üst sınır: 1000 görünür, 1001 görünmez; süre
    let bin_klasor = kok.join("Bin dosya");
    std::fs::create_dir_all(&bin_klasor).unwrap();
    let bin: Vec<PathBuf> = (0..1001).map(|i| dosya(&bin_klasor, &format!("{i:04}.pdf"))).collect();
    let bin_ad: Vec<String> = bin.iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
    let bin_ref: Vec<&str> = bin_ad.iter().map(|s| s.as_str()).collect();
    let secim1000 = Secim::yeni(&bin_klasor, &bin_ref[..1000]);
    let dz1000 = secim1000.dizi();
    let t0 = std::time::Instant::now();
    let d1000 = durum(&bir, Some(&dz1000));
    let sure = t0.elapsed();
    denetle(&format!("1000 dosya: görünür (GetState {:.1} ms)", sure.as_secs_f64() * 1000.0), d1000 == ACIK, d1000);
    denetle("1000 dosyada GetState 250 ms'den kısa", sure.as_millis() < 250, sure);
    let secim1001 = Secim::yeni(&bin_klasor, &bin_ref);
    let dz1001 = secim1001.dizi();
    let t0 = std::time::Instant::now();
    let d1001 = (durum(&don, Some(&dz1001)), durum(&bir, Some(&dz1001)));
    denetle(&format!("1001 dosya: hiçbiri (üst sınır, {:.1} ms)", t0.elapsed().as_secs_f64() * 1000.0), d1001 == (GIZLI, GIZLI), d1001);

    // ---------------------------------------------------------------- Invoke: sahte PDEfe'nin komut satırı
    let sahte_s = sahte.to_string_lossy().into_owned();
    if let Some(c) = cagir(&don, &dizi(&[pdf.clone()]), &kok, "tek") {
        denetle("Dönüştür, tek PDF: PDEfe.exe --donustur <yol>", c.argv == vec![sahte_s.clone(), "--donustur".into(), pdf.to_string_lossy().into_owned()], &c);
        denetle("Komut satırının ilk parçası tırnaklı exe yolu", c.komut.starts_with(&format!("\"{sahte_s}\" --donustur ")), &c.komut);
    } else {
        denetle("Dönüştür, tek PDF: sahte PDEfe başladı", false, ());
    }
    let karisik = vec![tuhaf.clone(), docx.clone(), tif.clone(), pdf.clone()];
    if let Some(c) = cagir(&bir, &dizi(&karisik), &kok, "karisik") {
        let mut beklenen = vec![sahte_s.clone(), "--birlestir".into()];
        beklenen.extend(yollar_metin(&karisik));
        denetle("Birleştir, 4 dosya (tırnaklı, &, %, ^, !, Türkçe harfli adlar): yollar aynen ve sırayla", c.argv == beklenen, &c);
    } else {
        denetle("Birleştir, 4 dosya: sahte PDEfe başladı", false, ());
    }
    if let Some(c) = cagir(&bir, &dz50, &kok, "elli") {
        let mut beklenen = vec![sahte_s.clone(), "--birlestir".into()];
        beklenen.extend(yollar_metin(&elli));
        denetle("Birleştir, 50 dosya (Gezgin'in veri nesnesi): tek süreç, 50 yol, sırayla", c.argv == beklenen && c.liste.is_empty(), (c.argv.len(), &c.liste.len()));
    } else {
        denetle("Birleştir, 50 dosya: sahte PDEfe başladı", false, ());
    }
    // Komut satırına sığmayan seçim: liste dosyası
    let uzun_klasor = kok.join("Çok uzun bir klasör adı, komut satırını doldurmak için yazıldı (deneme)");
    std::fs::create_dir_all(&uzun_klasor).unwrap();
    let uzun: Vec<PathBuf> = (0..300).map(|i| dosya(&uzun_klasor, &format!("Uzun adlı kurgusal dilekçe eki numarası {i:03}.pdf"))).collect();
    let uzun_ad: Vec<String> = uzun.iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
    let uzun_ref: Vec<&str> = uzun_ad.iter().map(|s| s.as_str()).collect();
    let secim_uzun = Secim::yeni(&uzun_klasor, &uzun_ref);
    let toplam: usize = uzun.iter().map(|p| p.to_string_lossy().len() + 3).sum();
    if let Some(c) = cagir(&don, &secim_uzun.dizi(), &kok, "liste") {
        let liste_arg = c.argv.get(2).cloned().unwrap_or_default();
        let liste_yolu = liste_arg.strip_prefix("--dosya-listesi=").unwrap_or("").to_string();
        let gecici = std::env::temp_dir().join("PDEfe");
        let mut beklenen = vec!["pdefe-dosya-listesi-1".to_string()];
        beklenen.extend(yollar_metin(&uzun));
        denetle(&format!("300 uzun yol (~{toplam} karakter): --donustur --dosya-listesi=<liste>, tek süreç"), c.argv.len() == 3 && c.argv[1] == "--donustur" && !liste_yolu.is_empty(), &c.argv);
        denetle("Liste dosyası %TEMP%\\PDEfe\\sagtik-*.txt", PathBuf::from(&liste_yolu).parent() == Some(gecici.as_path()) && liste_yolu.contains("\\sagtik-") && liste_yolu.ends_with(".txt"), &liste_yolu);
        denetle("Liste: başlık satırı ve 300 yol sırayla", c.liste == beklenen, c.liste.len());
        denetle("Liste dosyası okunduktan sonra yok (sahte PDEfe sildi)", !PathBuf::from(&liste_yolu).exists(), &liste_yolu);
    } else {
        denetle("300 uzun yol: sahte PDEfe başladı", false, ());
    }
    // Kural dışı seçimde Invoke bir şey başlatmaz
    {
        let cikti = kok.join("cikti-kural-disi.txt");
        std::env::set_var("PDEFE_SAHTE_CIKTI", &cikti);
        let r = unsafe { bir.Invoke(&dizi(&[pdf.clone()]), None) };
        std::env::remove_var("PDEFE_SAHTE_CIKTI");
        std::thread::sleep(std::time::Duration::from_millis(1500));
        denetle("Birleştir tek dosyayla çağrılırsa başlatılmaz (hata döner)", r.is_err() && !cikti.exists(), r);
    }

    // ---------------------------------------------------------------- bırakma
    drop((don, bir, dz50, dz1000, dz1001, secim50, secim1000, secim1001, secim_uzun));
    denetle("Bütün nesneler bırakılınca DllCanUnloadNow S_OK", dll.birakilabilir() == S_OK, dll.birakilabilir());
    unsafe {
        let _ = FreeLibrary(dll.modul);
        let _ = FreeLibrary(yolsuz.modul);
    }
    let _ = BOOL(0);
    let _ = std::fs::remove_dir_all(&kok);
    sonuc_yaz()
}
