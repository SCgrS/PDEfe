; Kurucu sınamasının deneme derlemesi (0.2.3): test\kurucu_sinama.yml → nsis.include. build\installer.nsh'in kayıt adlarını gerçek PDEfe'ninkilerle
; çakışmayan adlarla tanımlar, sonra onu içeri alır. Deneme kopyası kurulup kaldırılırken gerçek PDEfe'nin Varsayılan Programlar kaydına
; (Software\PDEfe, RegisteredApplications\PDEfe), ProgId'sine (PDEfe.pdf) ve .pdf varsayılanına dokunulmaz.
; Güvenlik: bu dosya gerçek kimlikle (appId com.cgrshn.pdefe, exe / kısayol / paket adı PDEfe) derlenirse makensis durur.

!define PDEFE_KAYIT_ADI "KurucuSinama"
!define PDEFE_PROGID "KurucuSinama.pdf"   ; test\kurucu_sinama.yml → win.fileAssociations.name ile aynı (test\kurucu_derle.mjs denetler)
; 0.3.1: Sağ tık menüsü (build\installer.nsh madde 11). Deneme fiilleri (KurucuSinama.Birlestir / .Donustur), DLL'in tanıdığı sınama CLSID'leri
; (sagtik\src\lib.rs SINAMA_CLSID_*; test\sagtik_kayitlari.json sinamaClsid), ayrı DLL klasörü ve RunOnce değeri: Gerçek PDEfe'ninkilere
; yazılmaz, onlar silinmez. Deneme kaydı HKCU'ya gider: test\kurucu_akis.ps1 kayıt yazımlarının Claude paketinin sanal kovanına gittiğini
; (Gezgin'in görmediğini) sınamadan önce kanıtlar.
!define PDEFE_SAGTIK_FIIL_ONEKI "KurucuSinama"
!define PDEFE_SAGTIK_CLSID_DONUSTUR "{6F896873-46F5-4F6A-B082-BA2D345AA7DC}"
!define PDEFE_SAGTIK_CLSID_BIRLESTIR "{757ACC1D-9BCB-4792-A3B4-3F5889A88808}"
!define PDEFE_SAGTIK_UST_KLASOR "KurucuSinama"
!define PDEFE_SAGTIK_RUNONCE "KurucuSinama sağ tık temizliği"
!if "${PDEFE_SAGTIK_FIIL_ONEKI}" == "PDEfe"
  !error "Kurucu sınamasının sağ tık fiilleri PDEfe.* olamaz: Deneme kurucusu gerçek PDEfe'nin menüsüne yazar, kaldırıcısı onu silerdi"
!endif
!if "${PDEFE_SAGTIK_CLSID_DONUSTUR}" == "{76052C3F-EA2F-47A3-88B2-A488CB6BC682}"
  !error "Kurucu sınaması gerçek PDEfe'nin sağ tık CLSID'ini (dönüştür) kullanamaz"
!endif
!if "${PDEFE_SAGTIK_CLSID_BIRLESTIR}" == "{43D87927-34D2-4271-BEC3-81D132284579}"
  !error "Kurucu sınaması gerçek PDEfe'nin sağ tık CLSID'ini (birleştir) kullanamaz"
!endif
!if "${PDEFE_SAGTIK_UST_KLASOR}" == "PDEfe"
  !error "Kurucu sınamasının sağ tık klasörü %LOCALAPPDATA%\PDEfe olamaz: Deneme kaldırıcısı gerçek PDEfe'nin DLL'ini silerdi"
!endif
!if "${PDEFE_SAGTIK_RUNONCE}" == "PDEfe sağ tık temizliği"
  !error "Kurucu sınamasının RunOnce değeri gerçek PDEfe'ninkiyle aynı olamaz"
!endif

!if "${PDEFE_PROGID}" == "PDEfe.pdf"
  !error "Kurucu sınamasının ProgId'si PDEfe.pdf olamaz: deneme kurucusu gerçek PDEfe'nin .pdf kaydına yazar, kaldırıcısı onu silerdi"
!endif

!if "${APP_ID}" == "com.cgrshn.pdefe"
  !error "Kurucu sınaması gerçek appId (com.cgrshn.pdefe) ile derlenemez: Uninstall ve Software\<GUID> kayıtları gerçek PDEfe'ninkiyle aynı olurdu"
!endif
!if "${PRODUCT_FILENAME}" == "PDEfe"
  !error "Kurucu sınamasının exe adı PDEfe olamaz: kurucunun açık uygulama denetimi gerçek PDEfe'yi kapatırdı"
!endif
!if "${SHORTCUT_NAME}" == "PDEfe"
  !error "Kurucu sınamasının kısayol adı PDEfe olamaz: kaldırıcı gerçek masaüstü ve Başlat menüsü kısayollarını silerdi"
!endif
!if "${APP_PACKAGE_NAME}" == "pdefe"
  !error "Kurucu sınamasının paket adı pdefe olamaz: kurucu önbelleği (%LOCALAPPDATA%\pdefe-updater) gerçek PDEfe'ninkinin üzerine yazılırdı"
!endif
!ifndef HIDE_RUN_AFTER_FINISH
  !error "Kurucu sınamasında runAfterFinish: false olmalı: deneme uygulaması hiç açılmamalı"
!endif

!include "${PROJECT_DIR}\build\installer.nsh"

; 0.3.1: Kaldırıcı güncelleme önbelleğini siler (build\installer.nsh madde 10). Deneme kaldırıcısı gerçek PDEfe'ninkini silmemeli.
!ifndef PDEFE_GUNCELLEME_ONBELLEGI
  !error "Kurucu sınamasında PDEFE_GUNCELLEME_ONBELLEGI tanımlı olmalı (build\installer.nsh): Önbelleği silme yolu sınanamazdı"
!endif
!if "${PDEFE_GUNCELLEME_ONBELLEGI}" == "pdefe-updater"
  !error "Kurucu sınamasının güncelleme önbelleği pdefe-updater olamaz: Deneme kaldırıcısı gerçek PDEfe'nin önbelleğini silerdi"
!endif
