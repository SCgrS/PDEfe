//! Gezgin'in menü kodu (shell32) ile sınama (0.3.1): Kayıt defterindeki fiiller (HKCU\Software\Classes\*\shell\PDEfeSinama.*, sınama
//! CLSID'leri) Gezgin'in sağ tık menüsünü kuran kodla (IShellFolder::GetUIObjectOf → IContextMenu::QueryContextMenu, klasik menü) okunur:
//! seçeneklerin görünüp görünmediği, adı, sırası, simgesi; tıklama (InvokeCommand) DLL'in Invoke'unu bir kez, bütün dosyalarla çağırmalı.
//! Kayıtları test/sagtik_menu.ps1 yazar ve siler: Önce yazımın Claude masaüstü paketinin sanal kovanına gittiğini (gerçek HKCU'da
//! olmadığını) WMI ile kanıtlar. Bu program kayıt defterine yazmaz.
//! Kullanım (yalnızca test/sagtik_menu.ps1):
//!   menu hazirla <klasör>   DLL kopyası, PDEfe-yolu.txt, sahte PDEfe ve kurgusal dosyalar
//!   menu sina <klasör>      menü denetimleri (kayıtlar yazılmışken)
mod ortak;

use ortak::*;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use windows::core::{PCSTR, PSTR, PWSTR};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Ole::OleInitialize;
use windows::Win32::UI::Shell::{IContextMenu, CMF_NORMAL, CMINVOKECOMMANDINFO, CMINVOKECOMMANDINFOEX, GCS_VERBW};
use windows::Win32::UI::WindowsAndMessaging::{
    CreatePopupMenu, DestroyMenu, GetMenuItemCount, GetMenuItemInfoW, HMENU, MENUITEMINFOW, MFT_SEPARATOR, MIIM_BITMAP, MIIM_FTYPE, MIIM_ID,
    MIIM_STRING, MIIM_SUBMENU, SW_SHOWNORMAL,
};

const FIIL_BIRLESTIR: &str = "PDEfeSinama.Birlestir";
const FIIL_DONUSTUR: &str = "PDEfeSinama.Donustur";
const CMIC_MASK_UNICODE: u32 = 0x4000;
const ILK_KIMLIK: u32 = 1;

#[derive(Debug, Clone)]
struct Satir {
    yazi: String,
    fiil: String,
    kimlik: u32,
    simge: bool,
    ayrac: bool,
}

struct Menu {
    cm: IContextMenu,
    hmenu: HMENU,
    satirlar: Vec<Satir>,
}

impl Drop for Menu {
    fn drop(&mut self) {
        unsafe {
            let _ = DestroyMenu(self.hmenu);
        }
    }
}

fn menu_kur(secim: &Secim) -> Menu {
    unsafe {
        let cm: IContextMenu = secim.klasor.GetUIObjectOf(HWND::default(), &secim.sabit(), None).expect("IContextMenu");
        let hmenu = CreatePopupMenu().expect("CreatePopupMenu");
        let _ = cm.QueryContextMenu(hmenu, 0, ILK_KIMLIK, 0x7FFF, CMF_NORMAL);
        let n = GetMenuItemCount(Some(hmenu));
        let mut satirlar = Vec::new();
        for i in 0..n.max(0) as u32 {
            let mut tampon = vec![0u16; 512];
            let mut mi = MENUITEMINFOW {
                cbSize: std::mem::size_of::<MENUITEMINFOW>() as u32,
                fMask: MIIM_ID | MIIM_STRING | MIIM_FTYPE | MIIM_BITMAP | MIIM_SUBMENU,
                dwTypeData: PWSTR(tampon.as_mut_ptr()),
                cch: tampon.len() as u32,
                ..Default::default()
            };
            if GetMenuItemInfoW(hmenu, i, true, &mut mi).is_err() {
                continue;
            }
            let yazi = String::from_utf16_lossy(&tampon[..mi.cch as usize]);
            let ayrac = (mi.fType & MFT_SEPARATOR).0 != 0;
            let mut fiil = String::new();
            if mi.wID >= ILK_KIMLIK && mi.wID < 0x7FFF && mi.hSubMenu.is_invalid() {
                let mut f = vec![0u16; 256];
                if cm.GetCommandString((mi.wID - ILK_KIMLIK) as usize, GCS_VERBW, None, PSTR(f.as_mut_ptr() as *mut u8), f.len() as u32).is_ok() {
                    let son = f.iter().position(|&c| c == 0).unwrap_or(f.len());
                    fiil = String::from_utf16_lossy(&f[..son]);
                }
            }
            satirlar.push(Satir { yazi, fiil, kimlik: mi.wID, simge: !mi.hbmpItem.is_invalid(), ayrac });
        }
        Menu { cm, hmenu, satirlar }
    }
}

fn bul<'a>(m: &'a Menu, fiil: &str) -> Option<(usize, &'a Satir)> {
    m.satirlar.iter().enumerate().find(|(_, s)| s.fiil.eq_ignore_ascii_case(fiil))
}

fn tikla(m: &Menu, s: &Satir) -> windows::core::Result<()> {
    unsafe {
        let ci = CMINVOKECOMMANDINFOEX {
            cbSize: std::mem::size_of::<CMINVOKECOMMANDINFOEX>() as u32,
            fMask: CMIC_MASK_UNICODE,
            lpVerb: PCSTR((s.kimlik - ILK_KIMLIK) as usize as *const u8),
            lpVerbW: windows::core::PCWSTR((s.kimlik - ILK_KIMLIK) as usize as *const u16),
            nShow: SW_SHOWNORMAL.0,
            ..Default::default()
        };
        m.cm.InvokeCommand(&ci as *const _ as *const CMINVOKECOMMANDINFO)
    }
}

fn dosyalar(k: &Path) -> PathBuf {
    k.join("Dosyalar (menü sınaması)")
}

fn hazirla(k: &Path) {
    let _ = std::fs::remove_dir_all(k);
    std::fs::create_dir_all(k).unwrap();
    let k = uzun_yol(k);
    let sahte = sahte_pdefe_kur(&k);
    let dll = dll_kur(&k.join("SagTik").join("0.3.1"), Some(&sahte));
    let d = dosyalar(&k);
    std::fs::create_dir_all(&d).unwrap();
    for ad in ["Dilekçe örneği.pdf", "Ek-1 vekâletname.docx", "TARAMA.TIF", "notlar.txt", "Ali'nin & Veli'nin %TEMP% belgesi.udf"] {
        dosya(&d, ad);
    }
    std::fs::create_dir_all(d.join("Alt klasör")).unwrap();
    for i in 1..=50 {
        dosya(&d, &format!("Belge {i:02}.pdf"));
    }
    // test/sagtik_menu.ps1 bu satırı okur
    println!("DLL={}", dll.display());
    println!("SAHTE={}", sahte.display());
}

fn menu_ozeti(m: &Menu) -> Vec<String> {
    m.satirlar
        .iter()
        .map(|s| if s.ayrac { "—".to_string() } else { format!("{} [{}]{}", s.yazi.replace('&', ""), s.fiil, if s.simge { " (simge)" } else { "" }) })
        .collect()
}

fn sina(k: &Path) -> i32 {
    let k = uzun_yol(k);
    let d = dosyalar(&k);
    unsafe {
        let _ = OleInitialize(None);
    }
    let sahte = k.join("Program Klasörü (sınama)").join("PDEfe Sınama.exe");
    let sahte_s = sahte.to_string_lossy().into_owned();

    // Tek PDF: yalnız dönüştür, adı ve simgesiyle
    {
        let s = Secim::yeni(&d, &["Dilekçe örneği.pdf"]);
        let m = menu_kur(&s);
        println!("       tek PDF menüsü: {:?}", menu_ozeti(&m));
        let don = bul(&m, FIIL_DONUSTUR);
        denetle("Tek PDF: 'PDEfe ile dönüştür' var", don.map(|x| x.1.yazi.as_str()) == Some("PDEfe ile dönüştür"), don);
        denetle("Tek PDF: 'PDEfe ile dönüştür' simgeli", don.map(|x| x.1.simge) == Some(true), don);
        denetle("Tek PDF: 'PDEfe ile birleştir' yok", bul(&m, FIIL_BIRLESTIR).is_none(), ());
        if let Some((_, satir)) = don {
            let cikti = k.join("cikti-menu-tek.txt");
            let _ = std::fs::remove_file(&cikti);
            std::env::set_var("PDEFE_SAHTE_CIKTI", &cikti);
            let r = tikla(&m, satir);
            std::env::remove_var("PDEFE_SAHTE_CIKTI");
            let c = sahte_cikti_bekle(&cikti, 15000);
            let beklenen = vec![sahte_s.clone(), "--donustur".into(), d.join("Dilekçe örneği.pdf").to_string_lossy().into_owned()];
            denetle("Tek PDF, tıklama: PDEfe --donustur <yol>", r.is_ok() && c.as_ref().map(|c| &c.argv) == Some(&beklenen), (r, c));
        }
    }
    // İki dosya: üstte birleştir, hemen altında dönüştür
    {
        let s = Secim::yeni(&d, &["Dilekçe örneği.pdf", "Ek-1 vekâletname.docx"]);
        let m = menu_kur(&s);
        println!("       iki dosya menüsü: {:?}", menu_ozeti(&m));
        let b = bul(&m, FIIL_BIRLESTIR);
        let o = bul(&m, FIIL_DONUSTUR);
        denetle("İki dosya: ikisi de var, adlarıyla", b.map(|x| x.1.yazi.as_str()) == Some("PDEfe ile birleştir") && o.map(|x| x.1.yazi.as_str()) == Some("PDEfe ile dönüştür"), (&b, &o));
        denetle("İki dosya: birleştir hemen dönüştürün üstünde", matches!((b, o), (Some((i, _)), Some((j, _))) if j == i + 1), (b.map(|x| x.0), o.map(|x| x.0)));
        denetle("İki dosya: ikisi de simgeli", b.map(|x| x.1.simge) == Some(true) && o.map(|x| x.1.simge) == Some(true), ());
    }
    // Desteklenmeyen tür, karışık seçim, klasörlü seçim: hiçbiri
    for (ad, adlar) in [
        ("Desteklenmeyen tek dosya (.txt)", vec!["notlar.txt"]),
        ("PDF ve .txt", vec!["Dilekçe örneği.pdf", "notlar.txt"]),
        ("PDF ve klasör", vec!["Dilekçe örneği.pdf", "Alt klasör"]),
        ("Klasör", vec!["Alt klasör"]),
    ] {
        let s = Secim::yeni(&d, &adlar);
        let m = menu_kur(&s);
        denetle(&format!("{ad}: PDEfe seçeneği yok"), bul(&m, FIIL_BIRLESTIR).is_none() && bul(&m, FIIL_DONUSTUR).is_none(), menu_ozeti(&m));
    }
    // Büyük harfli uzantı ve özel karakterli ad
    {
        let s = Secim::yeni(&d, &["TARAMA.TIF", "Ali'nin & Veli'nin %TEMP% belgesi.udf"]);
        let m = menu_kur(&s);
        denetle(".TIF ve özel karakterli .udf: ikisi de", bul(&m, FIIL_BIRLESTIR).is_some() && bul(&m, FIIL_DONUSTUR).is_some(), menu_ozeti(&m));
    }
    // 50 dosya: ikisi de; birleştir tek çağrıyla 50 yolu sırayla verir
    {
        let adlar: Vec<String> = (1..=50).map(|i| format!("Belge {i:02}.pdf")).collect();
        let r: Vec<&str> = adlar.iter().map(|s| s.as_str()).collect();
        let s = Secim::yeni(&d, &r);
        let m = menu_kur(&s);
        let b = bul(&m, FIIL_BIRLESTIR);
        denetle("50 dosya: ikisi de", b.is_some() && bul(&m, FIIL_DONUSTUR).is_some(), menu_ozeti(&m));
        if let Some((_, satir)) = b {
            let cikti = k.join("cikti-menu-elli.txt");
            let _ = std::fs::remove_file(&cikti);
            std::env::set_var("PDEFE_SAHTE_CIKTI", &cikti);
            let r = tikla(&m, satir);
            std::env::remove_var("PDEFE_SAHTE_CIKTI");
            let c = sahte_cikti_bekle(&cikti, 15000);
            let mut beklenen = vec![sahte_s.clone(), "--birlestir".into()];
            beklenen.extend(adlar.iter().map(|a| d.join(a).to_string_lossy().into_owned()));
            denetle("50 dosya, birleştir tıklaması: tek süreç, 50 yol, seçim sırasıyla", r.is_ok() && c.as_ref().map(|c| &c.argv) == Some(&beklenen), c.map(|c| c.argv.len()));
            // Başka sahte PDEfe süreci başlamadı (çıktı dosyası tek; ikinci çağrı aynı dosyanın üzerine yazardı: süreç sayısı ölçülemez, sayaç yok)
            std::thread::sleep(std::time::Duration::from_millis(1500));
            let ikinci = std::fs::read_dir(&k).map(|it| it.filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().ends_with(".yaziliyor")).count()).unwrap_or(0);
            denetle("50 dosya: yarım kalan ikinci çıktı yok", ikinci == 0, ikinci);
        }
    }
    let _: *const c_void = std::ptr::null();
    sonuc_yaz()
}

fn main() {
    if sahte_pdefe_mi() {
        return;
    }
    let a: Vec<String> = std::env::args().collect();
    let kod = match (a.get(1).map(|s| s.as_str()), a.get(2)) {
        (Some("hazirla"), Some(k)) => {
            hazirla(Path::new(k));
            0
        }
        (Some("sina"), Some(k)) => std::panic::catch_unwind(|| sina(Path::new(k))).unwrap_or_else(|_| {
            println!("HATA   sınama yarıda kaldı (panik)");
            1
        }),
        _ => {
            println!("Bu program yalnızca test/sagtik_menu.ps1'den çalıştırılır (kayıtları o yazar).");
            0
        }
    };
    std::process::exit(kod);
}
