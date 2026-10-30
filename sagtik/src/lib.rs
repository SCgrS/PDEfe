//! PDEfe'nin Dosya Gezgini sağ tık eklentisi (0.3.1, kullanıcı isteği: "Dönüştürebildiği dosya türlerinde sağ klik yapılınca pdefe ile dönüştür
//! yazsın, simgesi de gözüksün", "birden fazla dosya seçilirse ... PDEfe ile birleştir seçeneği çıksın", "tek bir dosya sağ tiklenirse
//! birleştir çıkmasın").
//!
//! Gezgin'in menüsündeki iki fiilin (kurucunun yazdığı HKCU\Software\Classes\*\shell\PDEfe.Birlestir ve PDEfe.Donustur) komut nesnesi
//! (IExplorerCommand, ExplorerCommandHandler). Her fiilin kendi CLSID'i var. Gezgin menüyü kurarken GetState'i çağırır (kayıttaki
//! CommandStateSync): Seçenek yalnızca seçilen öğelerin HEPSİ o işin aldığı uzantıda dosyaysa görünür (kurallar.rs). Tıklanınca (Invoke)
//! PDEfe tek bir süreçle, seçimin bütün dosyalarıyla ve Gezgin'in verdiği sırayla başlatılır: `PDEfe.exe --donustur "<yol>" …`. PDEfe
//! açıksa yeni süreç dosyaları açık örneğe verip çıkar (Electron'un tek örnek kilidi, src/main/sagtik.js). Komut satırı sığmazsa yollar
//! %TEMP%\PDEfe\sagtik-*.txt liste dosyasıyla verilir.
//!
//! PDEfe'nin yeri: Kurucu DLL'i %LOCALAPPDATA%\PDEfe\SagTik\<sürüm>\ klasörüne kopyalar, yanına PDEfe-yolu.txt (PDEfe.exe'nin tam yolu)
//! yazar. DLL kurulum klasöründe durmaz: Gezgin DLL'i açık tutar, güncellemede kurulum klasörü silinemez ("Eski sürümün dosyaları
//! kaldırılamadı"). Eski sürüm klasörü kilidi kalkınca silinir (sonraki kurulumda ya da PDEfe'nin açılışında).
//!
//! Güvenlik (DLL Gezgin'in ve dosya penceresi açan her programın içinde çalışır, hatası onu düşürür):
//! - Her COM yöntemi catch_unwind ile sarılır: Panik FFI sınırını geçmez, yöntem E_UNEXPECTED döner.
//! - GetState yalnızca öğelerin özniteliğine (klasör mü, dosya sisteminde mi) ve yolunun uzantısına bakar, dosya açmaz, okumaz. En çok
//!   EN_COK_OGE öğe (kurallar.rs).
//! - DllMain yok, iş parçacığı yok, kilit yok. DllCanUnloadNow canlı nesne ve LockServer sayısı sıfırsa S_OK döner.
//! - Bağımlılık yalnızca windows-rs (Microsoft'un Windows API bağlamaları). C çalışma kitaplığı gömülü (.cargo/config.toml).
#![allow(non_snake_case)]

pub mod kurallar;

use std::ffi::c_void;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicI32, Ordering};

use kurallar::{Oge, Tur};
use windows::core::{implement, Interface, Ref, BOOL, GUID, HRESULT, PCWSTR, PWSTR};
use windows::Win32::Foundation::{
    CloseHandle, CLASS_E_CLASSNOTAVAILABLE, CLASS_E_NOAGGREGATION, E_FAIL, E_NOTIMPL, E_POINTER, E_UNEXPECTED, HMODULE, S_FALSE, S_OK,
};
use windows::Win32::System::Com::{CoTaskMemFree, IBindCtx, IClassFactory, IClassFactory_Impl};
use windows::Win32::System::LibraryLoader::{
    GetModuleFileNameW, GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
};
use windows::Win32::System::SystemServices::{SFGAO_FILESYSTEM, SFGAO_FOLDER};
use windows::Win32::System::Threading::{CreateProcessW, CREATE_UNICODE_ENVIRONMENT, PROCESS_INFORMATION, STARTUPINFOW};
use windows::Win32::UI::Shell::{
    IEnumExplorerCommand, IExplorerCommand, IExplorerCommand_Impl, IShellItemArray, SHStrDupW, ECF_DEFAULT, ECS_ENABLED, ECS_HIDDEN,
    SIGDN_FILESYSPATH,
};
use windows::Win32::UI::WindowsAndMessaging::{AllowSetForegroundWindow, MessageBoxW, MB_ICONWARNING, MB_OK, MB_SETFOREGROUND};

/// "PDEfe ile dönüştür" (build/installer.nsh PDEFE_SAGTIK_CLSID_DONUSTUR).
pub const CLSID_DONUSTUR: GUID = GUID::from_u128(0x76052c3f_ea2f_47a3_88b2_a488cb6bc682);
/// "PDEfe ile birleştir" (build/installer.nsh PDEFE_SAGTIK_CLSID_BIRLESTIR).
pub const CLSID_BIRLESTIR: GUID = GUID::from_u128(0x43d87927_34d2_4271_bec3_81d132284579);
/// Kurucu sınamasının (test/kurucu_sinama.nsh) ve menü sınamasının (test/sagtik_menu.ps1) kimlikleri: Deneme kayıtları gerçek PDEfe'nin
/// CLSID'lerine yazmasın, onları silmesin. Davranış gerçeklerinkiyle aynı.
pub const SINAMA_CLSID_DONUSTUR: GUID = GUID::from_u128(0x6f896873_46f5_4f6a_b082_ba2d345aa7dc);
pub const SINAMA_CLSID_BIRLESTIR: GUID = GUID::from_u128(0x757acc1d_9bcb_4792_a3b4_3f5889a88808);

/// Kurucunun DLL'in yanına yazdığı PDEfe yolu dosyası.
const YOL_DOSYASI: &str = "PDEfe-yolu.txt";

/// Canlı COM nesneleri (sınıf fabrikaları dâhil) ve LockServer(TRUE) sayısı: DllCanUnloadNow.
static NESNELER: AtomicI32 = AtomicI32::new(0);
static KILITLER: AtomicI32 = AtomicI32::new(0);

fn tur_bul(clsid: &GUID) -> Option<Tur> {
    if *clsid == CLSID_DONUSTUR || *clsid == SINAMA_CLSID_DONUSTUR {
        Some(Tur::Donustur)
    } else if *clsid == CLSID_BIRLESTIR || *clsid == SINAMA_CLSID_BIRLESTIR {
        Some(Tur::Birlestir)
    } else {
        None
    }
}

/// Paniği yakalar: COM yöntemi panikte E_UNEXPECTED döner (panik FFI sınırını geçmez, Gezgin düşmez).
fn korumali<T>(f: impl FnOnce() -> windows::core::Result<T>) -> windows::core::Result<T> {
    match catch_unwind(AssertUnwindSafe(f)) {
        Ok(r) => r,
        Err(_) => Err(E_UNEXPECTED.into()),
    }
}

fn korumali_hr(f: impl FnOnce() -> HRESULT) -> HRESULT {
    catch_unwind(AssertUnwindSafe(f)).unwrap_or(E_UNEXPECTED)
}

fn sayac_artir() {
    NESNELER.fetch_add(1, Ordering::SeqCst);
}
fn sayac_azalt() {
    NESNELER.fetch_sub(1, Ordering::SeqCst);
}

fn utf16z(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// COM'un ayırdığı (CoTaskMemAlloc) dizgi: SHStrDupW. Çağıran serbest bırakır.
fn com_dizgisi(s: &[u16]) -> windows::core::Result<PWSTR> {
    let mut z = s.to_vec();
    z.push(0);
    unsafe { SHStrDupW(PCWSTR(z.as_ptr())) }
}

// ---------------------------------------------------------------- DLL'in yeri ve PDEfe'nin yolu

/// Bu DLL'in tam yolu (DllMain olmadan: kendi kodunun adresinden).
fn dll_yolu() -> Option<Vec<u16>> {
    let mut modul = HMODULE::default();
    unsafe {
        GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            PCWSTR(dll_yolu as *const () as *const u16),
            &mut modul,
        )
        .ok()?;
    }
    let mut tampon = vec![0u16; 1024];
    loop {
        let n = unsafe { GetModuleFileNameW(Some(modul), &mut tampon) } as usize;
        if n == 0 {
            return None;
        }
        if n < tampon.len() {
            tampon.truncate(n);
            return Some(tampon);
        }
        if tampon.len() >= 32768 {
            return None;
        }
        tampon.resize(tampon.len() * 2, 0);
    }
}

/// PDEfe.exe'nin yolu: DLL'in yanındaki PDEfe-yolu.txt'den (kurucu yazar). Dosya ya da exe yoksa None.
fn pdefe_yolu() -> Option<Vec<u16>> {
    let dll = dll_yolu()?;
    let klasor = kurallar::klasoru(&dll)?;
    let mut dosya = String::from_utf16(klasor).ok()?;
    dosya.push('\\');
    dosya.push_str(YOL_DOSYASI);
    let bayt = std::fs::read(&dosya).ok()?;
    if bayt.len() > 70000 {
        return None;
    }
    let exe = kurallar::yol_dosyasini_coz(&bayt)?;
    let s = String::from_utf16(&exe).ok()?;
    if std::path::Path::new(&s).is_file() {
        Some(exe)
    } else {
        None
    }
}

// ---------------------------------------------------------------- seçim

/// Seçimin öğeleri: dosya sistemindeki dosyaların yolları; kural dışı öğe (klasör, sanal öğe, yolu okunamayan) None.
fn yollari_oku(dizi: &IShellItemArray, sinir: u32) -> Option<Vec<Option<Vec<u16>>>> {
    let n = unsafe { dizi.GetCount() }.ok()?;
    if n == 0 || n > sinir {
        return None;
    }
    let mut sonuc = Vec::with_capacity(n as usize);
    for i in 0..n {
        sonuc.push(oge_yolu(dizi, i));
    }
    Some(sonuc)
}

fn oge_yolu(dizi: &IShellItemArray, i: u32) -> Option<Vec<u16>> {
    unsafe {
        let oge = dizi.GetItemAt(i).ok()?;
        // Yalnızca sorulan iki öznitelik: dosya sisteminde mi, klasör mü (öğenin kimliğinde yazılı, disk okunmaz). Zip gibi klasör gibi açılan
        // dosyalar da klasör sayılır (uzantıları zaten listede yok).
        let oz = oge.GetAttributes(SFGAO_FILESYSTEM | SFGAO_FOLDER).ok()?;
        if (oz & SFGAO_FOLDER).0 != 0 || (oz & SFGAO_FILESYSTEM).0 == 0 {
            return None;
        }
        let p = oge.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
        if p.is_null() {
            return None;
        }
        let yol = p.as_wide().to_vec();
        CoTaskMemFree(Some(p.0 as *const c_void));
        if yol.is_empty() {
            None
        } else {
            Some(yol)
        }
    }
}

fn gorunur_mu(tur: Tur, dizi: Option<&IShellItemArray>) -> bool {
    let Some(dizi) = dizi else { return false };
    let Some(ogeler) = yollari_oku(dizi, kurallar::EN_COK_OGE) else { return false };
    let n = ogeler.len() as u32;
    kurallar::gorunur(
        tur,
        n,
        ogeler.iter().map(|o| match o {
            Some(y) => Oge::Dosya(y.as_slice()),
            None => Oge::Diger,
        }),
    )
}

// ---------------------------------------------------------------- PDEfe'yi başlatma

#[derive(Debug)]
enum BaslatmaHatasi {
    PdefeYok,
    Liste,
    Surec(HRESULT),
}

/// Liste dosyası: %TEMP%\PDEfe\sagtik-<süreç>-<zaman>-<n>.txt (var olanın üzerine yazılmaz). PDEfe okuyup siler (src/main/sagtik.js).
fn liste_yaz(yollar: &[Vec<u16>]) -> Option<Vec<u16>> {
    use std::io::Write;
    let icerik = kurallar::liste_icerigi(yollar)?;
    let klasor = std::env::temp_dir().join("PDEfe");
    std::fs::create_dir_all(&klasor).ok()?;
    let zaman = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    for n in 0..50u32 {
        let yol = klasor.join(format!("sagtik-{}-{}-{}.txt", std::process::id(), zaman, n));
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&yol) {
            Ok(mut f) => {
                if f.write_all(&icerik).is_err() {
                    drop(f);
                    let _ = std::fs::remove_file(&yol);
                    return None;
                }
                return Some(yol.to_string_lossy().encode_utf16().collect());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return None,
        }
    }
    None
}

/// PDEfe'yi seçimle başlatır: tek süreç, bütün dosyalar, Gezgin'in sırasıyla. Süreci beklemez.
fn pdefe_baslat(tur: Tur, yollar: &[Vec<u16>]) -> Result<u32, BaslatmaHatasi> {
    let exe = pdefe_yolu().ok_or(BaslatmaHatasi::PdefeYok)?;
    let mut komut = match kurallar::komut_satiri(&exe, tur, yollar) {
        Some(k) => k,
        None => {
            let liste = liste_yaz(yollar).ok_or(BaslatmaHatasi::Liste)?;
            kurallar::liste_komut_satiri(&exe, tur, &liste).ok_or(BaslatmaHatasi::Liste)?
        }
    };
    komut.push(0);
    let mut exe_z = exe.clone();
    exe_z.push(0);
    let mut klasor: Vec<u16> = kurallar::klasoru(&exe).map(|k| k.to_vec()).unwrap_or_default();
    klasor.push(0);
    let si = STARTUPINFOW { cb: std::mem::size_of::<STARTUPINFOW>() as u32, ..Default::default() };
    let mut pi = PROCESS_INFORMATION::default();
    unsafe {
        // Uygulama adı ayrıca verilir: komut satırının ilk parçası arama yoluyla çözülmesin (çalışma klasöründeki başka bir PDEfe.exe)
        CreateProcessW(
            PCWSTR(exe_z.as_ptr()),
            Some(PWSTR(komut.as_mut_ptr())),
            None,
            None,
            false,
            CREATE_UNICODE_ENVIRONMENT,
            None,
            if klasor.len() > 1 { PCWSTR(klasor.as_ptr()) } else { PCWSTR::null() },
            &si,
            &mut pi,
        )
        .map_err(|e| BaslatmaHatasi::Surec(e.code()))?;
        // PDEfe penceresini öne getirebilsin (açık örneğe iletiyorsa o da izni ona verir: Chromium'un tek örnek kodu)
        let _ = AllowSetForegroundWindow(pi.dwProcessId);
        let _ = CloseHandle(pi.hThread);
        let _ = CloseHandle(pi.hProcess);
    }
    Ok(pi.dwProcessId)
}

fn ileti(metin: &str) {
    let m = utf16z(metin);
    let b = utf16z("PDEfe");
    unsafe {
        MessageBoxW(None, PCWSTR(m.as_ptr()), PCWSTR(b.as_ptr()), MB_OK | MB_ICONWARNING | MB_SETFOREGROUND);
    }
}

// ---------------------------------------------------------------- komut nesnesi

#[implement(IExplorerCommand)]
struct Komut {
    tur: Tur,
    clsid: GUID,
}

impl Komut {
    fn yeni(tur: Tur, clsid: GUID) -> Self {
        sayac_artir();
        Komut { tur, clsid }
    }
}

impl Drop for Komut {
    fn drop(&mut self) {
        sayac_azalt();
    }
}

impl IExplorerCommand_Impl for Komut_Impl {
    fn GetTitle(&self, _dizi: Ref<IShellItemArray>) -> windows::core::Result<PWSTR> {
        korumali(|| com_dizgisi(&self.tur.baslik().encode_utf16().collect::<Vec<_>>()))
    }

    /// PDEfe.exe'nin simgesi ("<yol>,0"). PDEfe'nin yeri okunamazsa E_NOTIMPL: Gezgin kayıttaki Icon değerini kullanır.
    fn GetIcon(&self, _dizi: Ref<IShellItemArray>) -> windows::core::Result<PWSTR> {
        korumali(|| {
            let mut s = pdefe_yolu().ok_or(windows::core::Error::from(E_NOTIMPL))?;
            s.extend(",0".encode_utf16());
            com_dizgisi(&s)
        })
    }

    fn GetToolTip(&self, _dizi: Ref<IShellItemArray>) -> windows::core::Result<PWSTR> {
        Err(E_NOTIMPL.into())
    }

    fn GetCanonicalName(&self) -> windows::core::Result<GUID> {
        Ok(self.clsid)
    }

    fn GetState(&self, dizi: Ref<IShellItemArray>, _yavas_olabilir: BOOL) -> windows::core::Result<u32> {
        korumali(|| Ok(if gorunur_mu(self.tur, dizi.as_ref()) { ECS_ENABLED.0 as u32 } else { ECS_HIDDEN.0 as u32 }))
    }

    fn Invoke(&self, dizi: Ref<IShellItemArray>, _bc: Ref<IBindCtx>) -> windows::core::Result<()> {
        korumali(|| {
            let dizi = dizi.as_ref().ok_or(windows::core::Error::from(E_POINTER))?;
            // Kural bir kez daha (seçim menü açıkken değişmez, ama Invoke'u başka bir program da çağırabilir)
            let ogeler = yollari_oku(dizi, kurallar::EN_COK_OGE).ok_or(windows::core::Error::from(E_FAIL))?;
            let n = ogeler.len() as u32;
            if !kurallar::gorunur(self.tur, n, ogeler.iter().map(|o| o.as_deref().map_or(Oge::Diger, Oge::Dosya))) {
                return Err(E_FAIL.into());
            }
            let yollar: Vec<Vec<u16>> = ogeler.into_iter().flatten().collect();
            match pdefe_baslat(self.tur, &yollar) {
                Ok(_) => Ok(()),
                Err(BaslatmaHatasi::PdefeYok) => {
                    ileti("PDEfe bulunamadı. PDEfe kaldırılmış ya da taşınmış olabilir: PDEfe'yi yeniden kurun.");
                    Err(E_FAIL.into())
                }
                Err(BaslatmaHatasi::Liste) => {
                    ileti("Seçilen dosyaların listesi hazırlanamadı. Daha az dosya seçip yeniden deneyin.");
                    Err(E_FAIL.into())
                }
                Err(BaslatmaHatasi::Surec(hr)) => {
                    ileti(&format!("PDEfe başlatılamadı (hata 0x{:08X}).", hr.0 as u32));
                    Err(hr.into())
                }
            }
        })
    }

    fn GetFlags(&self) -> windows::core::Result<u32> {
        Ok(ECF_DEFAULT.0 as u32)
    }

    fn EnumSubCommands(&self) -> windows::core::Result<IEnumExplorerCommand> {
        Err(E_NOTIMPL.into())
    }
}

// ---------------------------------------------------------------- sınıf fabrikası ve DLL girişleri

#[implement(IClassFactory)]
struct Fabrika {
    tur: Tur,
    clsid: GUID,
}

impl Fabrika {
    fn yeni(tur: Tur, clsid: GUID) -> Self {
        sayac_artir();
        Fabrika { tur, clsid }
    }
}

impl Drop for Fabrika {
    fn drop(&mut self) {
        sayac_azalt();
    }
}

impl IClassFactory_Impl for Fabrika_Impl {
    fn CreateInstance(&self, dis: Ref<windows::core::IUnknown>, riid: *const GUID, ppv: *mut *mut c_void) -> windows::core::Result<()> {
        korumali(|| {
            if ppv.is_null() || riid.is_null() {
                return Err(E_POINTER.into());
            }
            unsafe { *ppv = std::ptr::null_mut() };
            if !dis.is_null() {
                return Err(CLASS_E_NOAGGREGATION.into());
            }
            let komut: IExplorerCommand = Komut::yeni(self.tur, self.clsid).into();
            unsafe { komut.query(riid, ppv) }.ok()
        })
    }

    fn LockServer(&self, kilitle: BOOL) -> windows::core::Result<()> {
        korumali(|| {
            if kilitle.as_bool() {
                KILITLER.fetch_add(1, Ordering::SeqCst);
            } else {
                KILITLER.fetch_sub(1, Ordering::SeqCst);
            }
            Ok(())
        })
    }
}

/// COM: CLSID'in sınıf fabrikası.
///
/// # Safety
/// COM'un sözleşmesi: rclsid ve riid geçerli GUID'lere, ppv yazılabilir bir göstericiye işaret eder (null ise E_POINTER).
#[no_mangle]
pub unsafe extern "system" fn DllGetClassObject(rclsid: *const GUID, riid: *const GUID, ppv: *mut *mut c_void) -> HRESULT {
    korumali_hr(|| unsafe {
        if ppv.is_null() {
            return E_POINTER;
        }
        *ppv = std::ptr::null_mut();
        if rclsid.is_null() || riid.is_null() {
            return E_POINTER;
        }
        let clsid = *rclsid;
        let Some(tur) = tur_bul(&clsid) else { return CLASS_E_CLASSNOTAVAILABLE };
        let fabrika: IClassFactory = Fabrika::yeni(tur, clsid).into();
        fabrika.query(riid, ppv)
    })
}

/// COM: DLL bırakılabilir mi (canlı nesne ve LockServer kilidi yoksa).
#[no_mangle]
pub extern "system" fn DllCanUnloadNow() -> HRESULT {
    if NESNELER.load(Ordering::SeqCst) == 0 && KILITLER.load(Ordering::SeqCst) <= 0 {
        S_OK
    } else {
        S_FALSE
    }
}
