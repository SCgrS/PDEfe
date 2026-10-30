//! tests/dll.rs ve tests/menu.rs'in ortak parçaları: deneme klasörü, kurgusal dosyalar, kabuk öğeleri, sahte PDEfe.
//!
//! Sahte PDEfe: Sınama programının kendisi. DLL'in yanındaki PDEfe-yolu.txt bu programın bir kopyasını gösterir. Ortamda
//! PDEFE_SAHTE_CIKTI varsa program sahte PDEfe gibi davranır: komut satırını (GetCommandLineW), Windows'un ayrıştırdığı bağımsız
//! değişkenleri (CommandLineToArgvW) ve varsa liste dosyasının satırlarını o dosyaya yazar, liste dosyasını PDEfe gibi siler, çıkar.
#![allow(dead_code)]

use std::path::{Path, PathBuf};
use windows::core::{Interface, PCWSTR};
use windows::Win32::Foundation::{HLOCAL, LocalFree};
use windows::Win32::System::Com::IDataObject;
use windows::Win32::UI::Shell::Common::ITEMIDLIST;
use windows::Win32::UI::Shell::{
    CommandLineToArgvW, ILFree, IShellFolder, IShellItemArray, SHCreateShellItemArrayFromDataObject, SHCreateShellItemArrayFromIDLists,
    SHGetDesktopFolder, SHParseDisplayName,
};

use std::sync::atomic::{AtomicU32, Ordering};
pub static HATALAR: AtomicU32 = AtomicU32::new(0);
pub static DENETIMLER: AtomicU32 = AtomicU32::new(0);

pub fn denetle(ad: &str, kosul: bool, ayrinti: impl std::fmt::Debug) {
    DENETIMLER.fetch_add(1, Ordering::SeqCst);
    if kosul {
        println!("TAMAM  {ad}");
    } else {
        HATALAR.fetch_add(1, Ordering::SeqCst);
        println!("HATA   {ad} — {ayrinti:?}");
    }
}

pub fn sonuc_yaz() -> i32 {
    let (d, h) = (DENETIMLER.load(Ordering::SeqCst), HATALAR.load(Ordering::SeqCst));
    println!("\n{d} denetim, {h} hata");
    if h == 0 { 0 } else { 1 }
}

pub fn w(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}
pub fn wz(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Sahte PDEfe kipi: PDEFE_SAHTE_CIKTI varsa çalışıp true döner (main hemen çıkmalı).
pub fn sahte_pdefe_mi() -> bool {
    let Ok(cikti) = std::env::var("PDEFE_SAHTE_CIKTI") else { return false };
    let mut metin = String::new();
    unsafe {
        let komut = windows::Win32::System::Environment::GetCommandLineW();
        metin.push_str("KOMUT\t");
        metin.push_str(&komut.to_string().unwrap_or_default());
        metin.push('\n');
        let mut n = 0i32;
        let p = CommandLineToArgvW(komut, &mut n);
        if !p.is_null() {
            for i in 0..n as usize {
                let a = (*p.add(i)).to_string().unwrap_or_default();
                if let Some(liste) = a.strip_prefix("--dosya-listesi=") {
                    if let Ok(icerik) = std::fs::read_to_string(liste) {
                        for satir in icerik.lines() {
                            metin.push_str("LISTE\t");
                            metin.push_str(satir);
                            metin.push('\n');
                        }
                    }
                    let _ = std::fs::remove_file(liste);
                }
                metin.push_str("ARG\t");
                metin.push_str(&a);
                metin.push('\n');
            }
            let _ = LocalFree(Some(HLOCAL(p as _)));
        }
    }
    let gecici = format!("{cikti}.yaziliyor");
    let _ = std::fs::write(&gecici, metin);
    let _ = std::fs::rename(&gecici, &cikti);
    true
}

/// Sahte PDEfe'nin yazdıkları.
#[derive(Debug, Default)]
pub struct SahteCikti {
    pub komut: String,
    pub argv: Vec<String>,
    pub liste: Vec<String>,
}

/// Sahte PDEfe'nin çıktısını bekler (en çok sure_ms).
pub fn sahte_cikti_bekle(dosya: &Path, sure_ms: u64) -> Option<SahteCikti> {
    let t0 = std::time::Instant::now();
    while t0.elapsed().as_millis() < sure_ms as u128 {
        if let Ok(metin) = std::fs::read_to_string(dosya) {
            let mut c = SahteCikti::default();
            for satir in metin.lines() {
                if let Some(x) = satir.strip_prefix("KOMUT\t") {
                    c.komut = x.to_string();
                } else if let Some(x) = satir.strip_prefix("ARG\t") {
                    c.argv.push(x.to_string());
                } else if let Some(x) = satir.strip_prefix("LISTE\t") {
                    c.liste.push(x.to_string());
                }
            }
            return Some(c);
        }
        std::thread::sleep(std::time::Duration::from_millis(30));
    }
    None
}

/// Deneme klasörü: %TEMP%\pdefe-sagtik-<ad>-<süreç>. Önce silinir.
pub fn deneme_klasoru(ad: &str) -> PathBuf {
    let k = std::env::temp_dir().join(format!("pdefe-sagtik-{ad}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&k);
    std::fs::create_dir_all(&k).expect("deneme klasörü");
    uzun_yol(&k)
}

/// Kısa (8.3) adları uzun biçime çevirir: Kabuk öğelerin yolunu uzun biçimle verir (%TEMP% kısa adlı olabilir).
pub fn uzun_yol(y: &Path) -> PathBuf {
    let k = wz(&y.to_string_lossy());
    let mut tampon = vec![0u16; 4096];
    let n = unsafe { windows::Win32::Storage::FileSystem::GetLongPathNameW(PCWSTR(k.as_ptr()), Some(&mut tampon)) } as usize;
    if n == 0 || n >= tampon.len() {
        return y.to_path_buf();
    }
    PathBuf::from(String::from_utf16_lossy(&tampon[..n]))
}

/// Sınanacak DLL: PDEFE_SAGTIK_DLL ya da bu programın yanındaki derleme (target\<profil>\pdefe_sagtik.dll).
pub fn dll_kaynagi() -> PathBuf {
    if let Ok(y) = std::env::var("PDEFE_SAGTIK_DLL") {
        return PathBuf::from(y);
    }
    let exe = std::env::current_exe().expect("exe");
    exe.parent().and_then(|d| d.parent()).map(|d| d.join("pdefe_sagtik.dll")).expect("dll yolu")
}

/// DLL'i kurucunun koyduğu düzende kopyalar: <klasör>\PDEfeSagTik.dll ve (exe verilirse) PDEfe-yolu.txt (UTF-16LE, BOM'lu, kurucu gibi).
pub fn dll_kur(klasor: &Path, exe: Option<&Path>) -> PathBuf {
    std::fs::create_dir_all(klasor).expect("dll klasörü");
    let hedef = klasor.join("PDEfeSagTik.dll");
    std::fs::copy(dll_kaynagi(), &hedef).expect("dll kopyası");
    if let Some(exe) = exe {
        let mut b = vec![0xFF, 0xFE];
        for c in exe.to_string_lossy().encode_utf16() {
            b.extend(c.to_le_bytes());
        }
        std::fs::write(klasor.join("PDEfe-yolu.txt"), b).expect("yol dosyası");
    }
    hedef
}

/// Sahte PDEfe: Bu programın kopyası (adında boşluk ve Türkçe harf: komut satırının ilk parçası da sınanır).
pub fn sahte_pdefe_kur(klasor: &Path) -> PathBuf {
    let k = klasor.join("Program Klasörü (sınama)");
    std::fs::create_dir_all(&k).expect("program klasörü");
    let hedef = k.join("PDEfe Sınama.exe");
    std::fs::copy(std::env::current_exe().expect("exe"), &hedef).expect("exe kopyası");
    hedef
}

/// Kurgusal boş dosya.
pub fn dosya(klasor: &Path, ad: &str) -> PathBuf {
    let y = klasor.join(ad);
    std::fs::write(&y, b"").expect("dosya");
    y
}

/// Yolların mutlak kimlik listesinden kabuk öğesi dizisi (SHCreateShellItemArrayFromIDLists).
pub fn dizi(yollar: &[PathBuf]) -> IShellItemArray {
    unsafe {
        let mut pidller: Vec<*mut ITEMIDLIST> = Vec::new();
        for y in yollar {
            let ad = wz(&y.to_string_lossy());
            let mut p: *mut ITEMIDLIST = std::ptr::null_mut();
            SHParseDisplayName(PCWSTR(ad.as_ptr()), None, &mut p, 0, None).expect("SHParseDisplayName");
            pidller.push(p);
        }
        let sabit: Vec<*const ITEMIDLIST> = pidller.iter().map(|p| *p as *const _).collect();
        let d = SHCreateShellItemArrayFromIDLists(&sabit).expect("SHCreateShellItemArrayFromIDLists");
        for p in pidller {
            ILFree(Some(p));
        }
        d
    }
}

/// Bir klasörün öğelerinden kabuk klasörü ve öğelerin göreli kimlikleri (Gezgin'in seçimi gibi: IShellFolder + çocuk kimlikleri).
pub struct Secim {
    pub klasor: IShellFolder,
    pub pidller: Vec<*mut ITEMIDLIST>,
}

impl Secim {
    pub fn yeni(klasor: &Path, adlar: &[&str]) -> Secim {
        unsafe {
            let masaustu = SHGetDesktopFolder().expect("masaüstü");
            let k = wz(&klasor.to_string_lossy());
            let mut kp: *mut ITEMIDLIST = std::ptr::null_mut();
            masaustu
                .ParseDisplayName(Default::default(), None, PCWSTR(k.as_ptr()), None, &mut kp, std::ptr::null_mut())
                .expect("klasör kimliği");
            let sf: IShellFolder = masaustu.BindToObject(kp, None).expect("klasöre bağlan");
            ILFree(Some(kp));
            let mut pidller = Vec::new();
            for ad in adlar {
                let a = wz(ad);
                let mut p: *mut ITEMIDLIST = std::ptr::null_mut();
                sf.ParseDisplayName(Default::default(), None, PCWSTR(a.as_ptr()), None, &mut p, std::ptr::null_mut())
                    .unwrap_or_else(|e| panic!("öğe kimliği {ad}: {e}"));
                pidller.push(p);
            }
            Secim { klasor: sf, pidller }
        }
    }
    pub fn sabit(&self) -> Vec<*const ITEMIDLIST> {
        self.pidller.iter().map(|p| *p as *const _).collect()
    }
    /// Gezgin'in yolu: seçimin veri nesnesi (IDataObject), ondan öğe dizisi.
    pub fn dizi(&self) -> IShellItemArray {
        unsafe {
            let vn: IDataObject = self.klasor.GetUIObjectOf(Default::default(), &self.sabit(), None).expect("IDataObject");
            SHCreateShellItemArrayFromDataObject(&vn).expect("SHCreateShellItemArrayFromDataObject")
        }
    }
}

impl Drop for Secim {
    fn drop(&mut self) {
        for p in self.pidller.drain(..) {
            unsafe { ILFree(Some(p)) };
        }
    }
}

pub fn arayuz<T: Interface>(x: &impl Interface) -> Option<T> {
    x.cast::<T>().ok()
}
