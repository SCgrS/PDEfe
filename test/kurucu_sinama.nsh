; Kurucu sınamasının deneme derlemesi (0.2.3): test\kurucu_sinama.yml → nsis.include. build\installer.nsh'in kayıt adlarını gerçek PDEfe'ninkilerle
; çakışmayan adlarla tanımlar, sonra onu içeri alır. Deneme kopyası kurulup kaldırılırken gerçek PDEfe'nin Varsayılan Programlar kaydına
; (Software\PDEfe, RegisteredApplications\PDEfe), ProgId'sine (PDEfe.pdf) ve .pdf varsayılanına dokunulmaz.
; Güvenlik: bu dosya gerçek kimlikle (appId com.cgrshn.pdefe, exe / kısayol / paket adı PDEfe) derlenirse makensis durur.

!define PDEFE_KAYIT_ADI "KurucuSinama"
!define PDEFE_PROGID "KurucuSinama.pdf"   ; test\kurucu_sinama.yml → win.fileAssociations.name ile aynı

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
