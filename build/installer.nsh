; PDEfe — electron-builder NSIS kurulum özelleştirmeleri
; (electron-builder.yml → nsis.include: build/installer.nsh)
;
; Bu dosya electron-builder'ın ürettiği betiğin BAŞINA eklenir; buradaki makrolar
; app-builder-lib/templates/nsis içindeki şu kancalarda genişletilir (26.15.3 kaynağından doğrulandı):
;   customInit               → .onInit, initMultiUser'dan sonra (installer.nsi)
;   customPageAfterChangeDir → klasör sayfasından sonra, kurulumdan önce (assistedInstaller.nsh)
;   customInstall            → dosyalar kopyalanıp kısayollar ve .pdf ilişkisi yazıldıktan sonra (installSection.nsh)
;   customFinishPage         → MUI bitiş sayfasının yerine geçer (assistedInstaller.nsh)
;   customUnInstall          → kaldırma bölümünün başında, unregisterFileAssociations'tan önce (uninstaller.nsh)
;
; Yaptıkları:
;   1. "Ek görevler" sayfası: "Masaüstünde kısayol oluştur" onay kutusu. electron-builder masaüstü kısayolunu
;      her zaman oluşturur; kutu işaretli değilse customInstall içinde kısayol silinir. Güncelleme kurulumunda
;      sayfa atlanır; electron-builder keepShortcuts ile önceki tercihi korur (kısayol yeniden oluşturulmaz).
;   2. Windows "Varsayılan Programlar" kaydı (SHELL_CONTEXT = kullanıcı kurulumunda HKCU):
;        Software\PDEfe\Capabilities                       ApplicationName, ApplicationDescription, ApplicationIcon
;        Software\PDEfe\Capabilities\FileAssociations      .pdf = PDEfe.pdf   (ProgId'yi electron-builder yazar:
;                                                          fileAssociations.name = "PDEfe.pdf"; NsisTarget.js
;                                                          APP_ASSOCIATE çağrısında FILECLASS = item.name || ext)
;        Software\RegisteredApplications                   PDEfe = Software\PDEfe\Capabilities
;      Böylece ms-settings:defaultapps?registeredAppUser=PDEfe sayfası PDEfe'yi listeler.
;   3. electron-builder'ın APP_ASSOCIATE makrosu HKCU\Software\Classes\.pdf varsayılan değerini de "PDEfe.pdf"
;      yapar. Windows 10/11'de varsayılan uygulama UserChoice ile seçilir; yine de başka bir uygulamanın
;      kullanıcı kaydı üzerine yazılmasın diye eski değer .onInit'te okunur ve kurulumdan sonra geri konur
;      (OpenWithProgids girdisi kalır: "Birlikte aç" ve Varsayılan uygulamalar sayfası için yeterlidir).
;   4. Bitiş sayfası: "PDEfe'yi başlat" (electron-builder'ın varsayılan davranışı korunur) +
;      "PDEfe'yi varsayılan PDF görüntüleyici yap" onay kutusu (MUI_FINISHPAGE_SHOWREADME_FUNCTION ile
;      Windows Ayarlar > Varsayılan uygulamalar > PDEfe sayfası açılır; Windows kuralı gereği seçimi kullanıcı yapar). Kutu
;      etiketleri tek satıra sığmalı (MUI2 kutuları 10 DLU yüksekliğinde çizer); görünüm test\kurulum_bitis.ps1 ile denetlenir.
;   5. Kaldırırken 2'deki kayıtlar ve .pdf varsayılan değerinde kalan "PDEfe.pdf" silinir.
;   6. Uygulama içinden güncelleme: electron-updater kurucuyu "--updated" ile başlatır. PDEfe 0.1.3 ve sonrası /S de verir
;      (quitAndInstall(true, true)); 0.1.2 ve öncesi /S vermeden "--updated --force-run" ile başlatıyordu, sihirbazın ilerleme
;      ve bitiş sayfası görünüyor, PDEfe "Son"a basılınca açılıyordu. customInit "--updated" görünce kurucuyu sessize alır
;      (SetSilent yalnızca .onInit'te geçerlidir): sayfalar atlanır, installSection.nsh "isForceRun ve Silent" olduğu için
;      kurulumdan sonra PDEfe'yi "--updated" ile yeniden açar. Elle çalıştırılan kurucu (bayraksız) etkilenmez.
;
; Kodlama: UTF-8 (electron-builder makensis'i -INPUTCHARSET UTF8 ile çağırır).

!define PDEFE_KAYIT_KOKU "Software\PDEfe"
!define PDEFE_PROGID "PDEfe.pdf"
!define PDEFE_VARSAYILAN_URL "ms-settings:defaultapps?registeredAppUser=PDEfe"

; ---------------------------------------------------------------- .onInit
; Değişkenler customPageAfterChangeDir içinde bildirilir (assistedInstaller.nsh, .onInit'ten önce derlenir).
!macro customInit
  ; Uygulama içinden güncelleme her zaman sessiz (bkz. başlık, madde 6)
  ${if} ${isUpdated}
    SetSilent silent
  ${endif}
  ; Ek görevler sayfası atlanırsa (sessiz kurulum, güncelleme) varsayılan: masaüstü kısayolu oluştur.
  StrCpy $pdefeMasaustuKisayolu "1"
  ; .pdf için kullanıcının önceki varsayılan dosya sınıfı (APP_ASSOCIATE üzerine yazmadan önce)
  ClearErrors
  ReadRegStr $pdefeEskiPdfSinifi SHELL_CONTEXT "Software\Classes\.pdf" ""
  ${If} ${Errors}
    StrCpy $pdefeEskiPdfSinifi ""
  ${EndIf}
!macroend

; ---------------------------------------------------------------- "Ek görevler" sayfası
!macro customPageAfterChangeDir
  !include "nsDialogs.nsh"

  Var pdefeMasaustuKisayolu
  Var pdefeEskiPdfSinifi
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

  ; .pdf varsayılan sınıfı: kullanıcının önceki kaydı varsa geri koy (bkz. başlık, madde 3)
  ${If} $pdefeEskiPdfSinifi != ""
  ${AndIf} $pdefeEskiPdfSinifi != "${PDEFE_PROGID}"
    WriteRegStr SHELL_CONTEXT "Software\Classes\.pdf" "" "$pdefeEskiPdfSinifi"
  ${EndIf}

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

  ; MUI2 bitiş sayfası onay kutularını tek satırlık (195 × 10 DLU) çizer: 0.1.7'ye dek "(Windows Ayarlar açılır)" ekli uzun etiket
  ; ikinci satıra kayıp yarısı kesiliyordu. Etiket kısa, açıklama sayfa metninde; metin alanı geniş (60 DLU), kutular aşağıda.
  !define MUI_FINISHPAGE_TEXT "PDEfe bilgisayarınıza kuruldu.$\r$\n$\r$\nVarsayılan PDF görüntüleyici yapmak için aşağıdaki kutuyu işaretleyin: Bitir'e basınca Windows Ayarlar açılır, orada .pdf için PDEfe'yi seçin."
  !define MUI_FINISHPAGE_TEXT_LARGE
  !ifndef HIDE_RUN_AFTER_FINISH
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_TEXT "PDEfe'yi &başlat"
    !define MUI_FINISHPAGE_RUN_FUNCTION pdefeBaslat
  !endif
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "PDEfe'yi &varsayılan PDF görüntüleyici yap"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION pdefeVarsayilanUygulamalariAc
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
  !insertmacro MUI_PAGE_FINISH
!macroend

; ---------------------------------------------------------------- kaldırma
!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "PDEfe"
  DeleteRegKey SHELL_CONTEXT "${PDEFE_KAYIT_KOKU}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  ; ProgId (Software\Classes\PDEfe.pdf) ve .pdf\OpenWithProgids girdisini electron-builder'ın
  ; unregisterFileAssociations makrosu siler; .pdf varsayılan değerinde PDEfe.pdf kaldıysa onu da kaldır.
  ClearErrors
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.pdf" ""
  ${IfNot} ${Errors}
  ${AndIf} $0 == "${PDEFE_PROGID}"
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.pdf" ""
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
