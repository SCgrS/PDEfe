; PDEfe — electron-builder NSIS kurulum özelleştirmeleri
; (electron-builder.yml → nsis.include: build/installer.nsh)
;
; Bu dosya electron-builder'ın ürettiği betiğin BAŞINA eklenir; buradaki makrolar
; app-builder-lib/templates/nsis içindeki şu kancalarda genişletilir:
;   customInit               → .onInit (installer.nsi)
;   customPageAfterChangeDir → klasör sayfasından sonra, kurulumdan önce (assistedInstaller.nsh)
;   customInstall            → dosyalar kopyalanıp kısayollar ve .pdf ilişkisi yazıldıktan sonra (installSection.nsh)
;   customFinishPage         → MUI bitiş sayfasının yerine geçer (assistedInstaller.nsh)
;   customUnInstall          → kaldırma bölümünün başında (uninstaller.nsh)
;
; Yaptıkları:
;   1. "Ek görevler" sayfası: "Masaüstünde kısayol oluştur" onay kutusu. electron-builder masaüstü kısayolunu
;      her zaman oluşturur; kutu işaretli değilse customInstall içinde kısayol silinir.
;   2. Windows "Varsayılan Programlar" kaydı (SHELL_CONTEXT = kullanıcı kurulumunda HKCU):
;        Software\PDEfe\Capabilities                       ApplicationName, ApplicationDescription, ApplicationIcon
;        Software\PDEfe\Capabilities\FileAssociations      .pdf = PDEfe.pdf   (ProgId'yi electron-builder yazar:
;                                                          fileAssociations.name = "PDEfe.pdf")
;        Software\RegisteredApplications                   PDEfe = Software\PDEfe\Capabilities
;      Böylece ms-settings:defaultapps?registeredAppUser=PDEfe sayfası PDEfe'yi listeler.
;   3. Bitiş sayfası: "PDEfe'yi başlat" (varsayılan davranış) + "PDEfe'yi varsayılan PDF görüntüleyici yap"
;      onay kutusu (MUI_FINISHPAGE_SHOWREADME_FUNCTION ile Windows Ayarlar > Varsayılan uygulamalar açılır).
;   4. Kaldırırken 2'deki kayıtlar silinir.
;
; Kodlama: UTF-8 (electron-builder makensis'i -INPUTCHARSET UTF8 ile çağırır).

!define PDEFE_KAYIT_KOKU "Software\PDEfe"
!define PDEFE_PROGID "PDEfe.pdf"
!define PDEFE_VARSAYILAN_URL "ms-settings:defaultapps?registeredAppUser=PDEfe"

; ---------------------------------------------------------------- .onInit
!macro customInit
  ; Ek görevler sayfası atlanırsa (sessiz kurulum, güncelleme) varsayılan: masaüstü kısayolu oluştur.
  StrCpy $pdefeMasaustuKisayolu "1"
!macroend

; ---------------------------------------------------------------- "Ek görevler" sayfası
!macro customPageAfterChangeDir
  !include "nsDialogs.nsh"

  Var pdefeMasaustuKisayolu
  Var pdefeEkGorevlerSayfa
  Var pdefeMasaustuKutusu

  Function pdefeEkGorevlerOlustur
    ; Güncelleme kurulumunda sayfayı atla (önceki tercih korunur, kısayollar keepShortcuts ile taşınır)
    ${if} ${isUpdated}
      Abort
    ${endif}

    !insertmacro MUI_HEADER_TEXT "Ek görevler" "Kurulumla birlikte yapılacak ek işleri seçin."

    nsDialogs::Create 1018
    Pop $pdefeEkGorevlerSayfa
    ${If} $pdefeEkGorevlerSayfa == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "PDEfe kurulurken yapılmasını istediğiniz ek işleri işaretleyin, sonra İleri'ye basın."
    Pop $0

    ${NSD_CreateCheckbox} 0 30u 100% 12u "&Masaüstünde kısayol oluştur"
    Pop $pdefeMasaustuKutusu
    ${If} $pdefeMasaustuKisayolu == "1"
      ${NSD_Check} $pdefeMasaustuKutusu
    ${EndIf}

    ${NSD_CreateLabel} 0 50u 100% 36u "Başlat menüsü kısayolu her zaman eklenir. .pdf dosyaları 'Birlikte aç' menüsünde PDEfe ile görünür; PDEfe'yi varsayılan PDF görüntüleyici yapma seçeneği kurulumun sonunda sunulur."
    Pop $0

    nsDialogs::Show
  FunctionEnd

  Function pdefeEkGorevlerBirak
    ${NSD_GetState} $pdefeMasaustuKutusu $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $pdefeMasaustuKisayolu "1"
    ${Else}
      StrCpy $pdefeMasaustuKisayolu "0"
    ${EndIf}
  FunctionEnd

  ; MUI_PAGE_* makrosu kullanılmaz: electron-builder klasör sayfasından sonra
  ; MUI_PAGE_CUSTOMFUNCTION_PRE instFilesPre tanımlar ve bunun MUI_PAGE_INSTFILES'a kalması gerekir.
  Page custom pdefeEkGorevlerOlustur pdefeEkGorevlerBirak
!macroend

; ---------------------------------------------------------------- kurulum sonrası kayıtlar
!macro customInstall
  ; Varsayılan Programlar (Default Programs / Windows Ayarlar > Varsayılan uygulamalar) kaydı
  WriteRegStr SHELL_CONTEXT "${PDEFE_KAYIT_KOKU}\Capabilities" "ApplicationName" "PDEfe"
  WriteRegStr SHELL_CONTEXT "${PDEFE_KAYIT_KOKU}\Capabilities" "ApplicationDescription" "PDF görüntüleyici ve düzenleyici"
  WriteRegStr SHELL_CONTEXT "${PDEFE_KAYIT_KOKU}\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "${PDEFE_KAYIT_KOKU}\Capabilities\FileAssociations" ".pdf" "${PDEFE_PROGID}"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "PDEfe" "${PDEFE_KAYIT_KOKU}\Capabilities"

  ; ProgId'ye açıklayıcı ad ve uygulama kimliği (Gezgin "Birlikte aç" listesinde düzgün görünsün)
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PDEFE_PROGID}" "FriendlyTypeName" "PDF belgesi"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PDEFE_PROGID}" "AppUserModelID" "${APP_ID}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "PDEfe"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".pdf" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\""

  ; Masaüstü kısayolu istenmediyse electron-builder'ın oluşturduğunu kaldır
  ${If} $pdefeMasaustuKisayolu == "0"
    ${If} ${FileExists} "$newDesktopLink"
      WinShell::UninstShortcut "$newDesktopLink"
      Delete "$newDesktopLink"
    ${EndIf}
  ${EndIf}

  ; Kabuğa ilişkilendirme değişikliğini bildir (SHCNE_ASSOCCHANGED)
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

; ---------------------------------------------------------------- bitiş sayfası
!macro customFinishPage
  Function pdefeBaslat
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function pdefeVarsayilanUygulamalariAc
    ; Windows 10/11: Ayarlar > Uygulamalar > Varsayılan uygulamalar > PDEfe
    ClearErrors
    ExecShell "open" "${PDEFE_VARSAYILAN_URL}"
    ${If} ${Errors}
      ExecShell "open" "ms-settings:defaultapps"
    ${EndIf}
  FunctionEnd

  !ifndef HIDE_RUN_AFTER_FINISH
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_TEXT "PDEfe'yi &başlat"
    !define MUI_FINISHPAGE_RUN_FUNCTION pdefeBaslat
  !endif
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "PDEfe'yi &varsayılan PDF görüntüleyici yap (Windows Ayarlar açılır)"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION pdefeVarsayilanUygulamalariAc
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
  !insertmacro MUI_PAGE_FINISH
!macroend

; ---------------------------------------------------------------- kaldırma
!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "PDEfe"
  DeleteRegKey SHELL_CONTEXT "${PDEFE_KAYIT_KOKU}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  ; ProgId ve .pdf\OpenWithProgids kaydını electron-builder'ın unregisterFileAssociations makrosu siler.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
