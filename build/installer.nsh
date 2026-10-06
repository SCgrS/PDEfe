; PDEfe — electron-builder NSIS kurulum özelleştirmeleri
; (electron-builder.yml → nsis.include: build/installer.nsh)
;
; Bu dosya electron-builder'ın ürettiği betiğin BAŞINA eklenir; buradaki makrolar
; app-builder-lib/templates/nsis içindeki şu kancalarda genişletilir (26.15.3 kaynağından doğrulandı):
;   customInit               → .onInit, initMultiUser'dan sonra (installer.nsi)
;   customWelcomePage        → ilk sayfa, lisans sayfasından önce (assistedInstaller.nsh; yalnızca kurucu derlemesi)
;   customInstallMode        → "Kimler için kurulsun" sayfasının ön işlevi (multiUserUi.nsh; kurucu ve kaldırıcı derlemesi)
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
;      Adlar aşağıdaki PDEFE_* tanımlarından gelir (0.2.3); kurucu sınaması (test\kurucu_sinama.nsh) onları ayrı adlarla tanımlar.
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
;   7. Kurulu sürüm sayfası (0.2.3, kullanıcı isteği: "uygulama yüklerken uygulamanın yüklü olup olmadığını yeni sürüm olup olmadığını
;      fark etsin ve ona göre seçenekler sunup yükleme yapsın"). Yalnızca elle (arayüzlü) çalıştırılan kurucuda ve bu kullanıcıya kurulu
;      bir PDEfe bulunursa görünür; kurulu değilse sihirbaz bugünkü gibi lisans sayfasıyla başlar. Eski sürüm kuruluysa Güncelle (lisans,
;      klasör ve Ek görevler atlanıp doğrudan kurulur) / Seçenekleri değiştirerek kur; aynı sürüm ya da program dosyaları eksikse Onar /
;      Kaldır; daha yeni sürüm kuruluysa Vazgeç / Eski sürüme dön. Sayfa işlevleri sessiz kurulumda (/S, --updated) hiç çağrılmaz:
;      .onInit, kurulum bölümü ve kaldırıcı değişmedi (test\kurucu_karsilastir.mjs satır satır karşılaştırır).
;   8. "Bu uygulama kimler için kurulsun?" sayfası kalktı (0.2.3): PDEfe yalnızca kullanıcıya kurulur, "herkes için" seçeneği zaten
;      solgundu. Yönetici olarak "herkes için" kurulmuş bir PDEfe bulunursa (initMultiUser kurulum kipini "all" yapar) sayfa ve
;      sihirbaz bugünkü gibi kalır, kurulu sürüm sayfası gösterilmez: o kurulum ancak yönetici izniyle güncellenebilir.
;
; Kodlama: UTF-8 (electron-builder makensis'i -INPUTCHARSET UTF8 ile çağırır).

; 0.2.3: sabit kayıt adları /ifndef ile tanımlanır; gerçek derlemede değerler değişmedi (PDEfe, Software\PDEfe, PDEfe.pdf). Kurucu sınaması
; (test\kurucu_sinama.nsh) bunları önceden ayrı adlarla tanımlar: deneme kopyası gerçek PDEfe'nin Varsayılan Programlar kaydına ve ProgId'sine
; yazmaz, kaldırıcısı da onları silmez. PDEFE_PROGID, electron-builder yapılandırmasındaki fileAssociations.name ile aynı olmalı.
!define /ifndef PDEFE_KAYIT_ADI "PDEfe"
!define /ifndef PDEFE_KAYIT_KOKU "Software\${PDEFE_KAYIT_ADI}"
!define /ifndef PDEFE_PROGID "PDEfe.pdf"
!define /ifndef PDEFE_VARSAYILAN_URL "ms-settings:defaultapps?registeredAppUser=${PDEFE_KAYIT_ADI}"

; ---------------------------------------------------------------- kurulu sürüm sayfası (madde 7)
; customWelcomePage ilk sayfadır ve .onInit'ten, customPageAfterChangeDir'den önce açılır: kurucunun bütün değişkenleri burada bildirilir
; (NSIS'te Var kullanımdan önce gelmeli; 0.2.2'ye dek customPageAfterChangeDir'deydiler).
!macro customWelcomePage
  !include "WordFunc.nsh"
  !include "nsDialogs.nsh"

  Var pdefeMasaustuKisayolu   ; "1" | "0": kurulumdan sonra masaüstü kısayolu olsun mu (customInstall)
  Var pdefeEskiPdfSinifi      ; .pdf'in kurulumdan önceki varsayılan dosya sınıfı (customInit → customInstall)
  Var pdefeKip                ; "" (sayfa gösterilmedi) | guncelle | onar | geri | ozel (Seçenekleri değiştirerek kur)
  Var pdefeDurum              ; eski | ayni | yeni | bozuk (kayıt var, program dosyası yok)
  Var pdefeKuruluSurum
  Var pdefeKuruluKlasor
  Var pdefeSurumSayfa
  Var pdefeSecenek1
  Var pdefeSecenek2

  ; Lisans ve klasör sayfalarını electron-builder, common.nsh'teki skipPageIfUpdated'ın ürettiği ön işlevle atlar; o yalnızca ${isUpdated}'a
  ; (komut satırında --updated) bakar. Makro içinde makro tanımlanamadığı için (makensis: "can't define a macro inside a macro") isUpdated
  ; tanımı bu makronun sonundan customPageAfterChangeDir'in başına dek _pdefeSayfaAtlanir'a çevrilir: arada derlenen iki atlama işlevi
  ; (assistedInstaller.nsh, lisans ve klasör sayfası) --updated'da da, Güncelle / Onar / Eski sürüme dön seçilince de atlar. Arada başka
  ; ${isUpdated} kullanımı yok (kurulum kipi sayfası ve instFilesPre; app-builder-lib 26.15.3); .onInit, kurulum bölümü ve kaldırıcı
  ; çevrilmemiş tanımla derlenir (test\kurucu_karsilastir.mjs). Göreli sayfa atlaması (WM_NOTIFY_OUTER_NEXT) seçilmedi: sayfa sayısı yanlış
  ; hesaplanırsa kurulum sayfası atlanıp bitiş sayfasına gidilebilirdi.
  Function pdefeSayfaAtlanirMi
    ${StdUtils.TestParameter} $R9 "updated"
    ${If} $R9 != "true"
      ${If} $pdefeKip == "guncelle"
      ${OrIf} $pdefeKip == "onar"
      ${OrIf} $pdefeKip == "geri"
        StrCpy $R9 "true"
      ${EndIf}
    ${EndIf}
  FunctionEnd

  ; Seçim değişince İleri düğmesinin yazısı seçilen işi söyler. Düğme yazılarında kısayol harfi (&) yok: seçeneklerinkiyle çakışmasın
  ; (Enter zaten İleri'dir); seçenekler &G, &S, &O, &K, &V, &E (ilk sayfada Geri düğmesi kapalı, "< &Geri" ile çakışmaz).
  Function pdefeSecenekDegisti
    Pop $0
    GetDlgItem $1 $HWNDPARENT 1
    ${NSD_GetState} $pdefeSecenek1 $2
    ${If} $pdefeDurum == "eski"
      ${If} $2 == ${BST_CHECKED}
        SendMessage $1 ${WM_SETTEXT} 0 "STR:Güncelle"
      ${Else}
        SendMessage $1 ${WM_SETTEXT} 0 "STR:$(^NextBtn)"
      ${EndIf}
    ${ElseIf} $pdefeDurum == "yeni"
      ${If} $2 == ${BST_CHECKED}
        SendMessage $1 ${WM_SETTEXT} 0 "STR:Kapat"
      ${Else}
        SendMessage $1 ${WM_SETTEXT} 0 "STR:Kur"   ; "Eski sürümü kur" 75 px'lik düğmeye sığmıyor (kurulum_surum.ps1)
      ${EndIf}
    ${Else}
      ${If} $2 == ${BST_CHECKED}
        SendMessage $1 ${WM_SETTEXT} 0 "STR:Onar"
      ${Else}
        SendMessage $1 ${WM_SETTEXT} 0 "STR:Kaldır"
      ${EndIf}
    ${EndIf}
  FunctionEnd

  Function pdefeSurumOlustur
    StrCpy $pdefeDurum ""
    ; "Herkes için" (HKLM) kurulum: sihirbaz bugünkü gibi (madde 8)
    ${If} $installMode != "CurrentUser"
      StrCpy $pdefeKip ""
      Abort
    ${EndIf}
    ; Kurulu kayıt: SHELL_CONTEXT initMultiUser'da kuruldu (kullanıcı kurulumu → HKCU). Anahtar adları electron-builder tanımlarından.
    ClearErrors
    ReadRegStr $pdefeKuruluSurum SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${If} ${Errors}
    ${OrIf} $pdefeKuruluSurum == ""
      StrCpy $pdefeKip ""
      Abort                                  ; kurulu değil: bugünkü sihirbaz
    ${EndIf}
    ReadRegStr $pdefeKuruluKlasor SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $pdefeKuruluKlasor == ""
      StrCpy $pdefeKuruluKlasor $INSTDIR
    ${EndIf}
    ${IfNot} ${FileExists} "$pdefeKuruluKlasor\${APP_EXECUTABLE_FILENAME}"
      StrCpy $pdefeDurum "bozuk"
    ${Else}
      ; 0 eşit, 1 bu kurucu daha yeni, 2 kurulu sürüm daha yeni (sayısal: 0.2.10 > 0.2.9)
      ${VersionCompare} "${VERSION}" "$pdefeKuruluSurum" $R0
      ${If} $R0 == 1
        StrCpy $pdefeDurum "eski"
      ${ElseIf} $R0 == 2
        StrCpy $pdefeDurum "yeni"
      ${Else}
        StrCpy $pdefeDurum "ayni"
      ${EndIf}
    ${EndIf}

    ${If} $pdefeDurum == "yeni"
      !insertmacro MUI_HEADER_TEXT "Daha yeni bir sürüm kurulu" "Bu kurucudaki ${PRODUCT_NAME} sürümü, bilgisayarınızdakinden eski."
    ${ElseIf} $pdefeDurum == "bozuk"
      !insertmacro MUI_HEADER_TEXT "${PRODUCT_NAME} kurulumu eksik" "Ne yapmak istediğinizi seçin."
    ${Else}
      !insertmacro MUI_HEADER_TEXT "${PRODUCT_NAME} zaten kurulu" "Ne yapmak istediğinizi seçin."
    ${EndIf}

    nsDialogs::Create 1018
    Pop $pdefeSurumSayfa
    ${If} $pdefeSurumSayfa == error
      Abort
    ${EndIf}

    ; Yerleşim (DLU): üst metin 0–20, 1. seçenek 24, açıklaması 36–54, 2. seçenek 58, açıklaması 70–96, "açık" uyarısı 104–134.
    ; Metinlerin sığdığı test\kurulum_surum.ps1 ile ölçülür.
    ${If} $pdefeDurum == "eski"
      ${NSD_CreateLabel} 0 0 100% 20u "Bilgisayarınızda ${PRODUCT_NAME} $pdefeKuruluSurum kurulu. Bu kurucu daha yeni olan ${VERSION} sürümünü kurar."
      Pop $0
      ${NSD_CreateRadioButton} 0 24u 100% 12u "&Güncelle (önerilen)"
      Pop $pdefeSecenek1
      ${NSD_CreateLabel} 12u 36u -12u 18u "Ayarlarınız, kısayollarınız ve kurulum klasörü korunur; doğrudan kuruluma geçilir."
      Pop $0
      ${NSD_CreateRadioButton} 0 58u 100% 12u "&Seçenekleri değiştirerek kur"
      Pop $pdefeSecenek2
      ${NSD_CreateLabel} 12u 70u -12u 26u "Lisans, kurulum klasörü ve masaüstü kısayolu sayfaları gösterilir."
      Pop $0
    ${ElseIf} $pdefeDurum == "yeni"
      ${NSD_CreateLabel} 0 0 100% 20u "Bilgisayarınızda daha yeni bir sürüm, ${PRODUCT_NAME} $pdefeKuruluSurum kurulu. Bu kurucu daha eski olan ${VERSION} sürümünü kurar."
      Pop $0
      ${NSD_CreateRadioButton} 0 24u 100% 12u "&Vazgeç, ${PRODUCT_NAME} $pdefeKuruluSurum kalsın (önerilen)"
      Pop $pdefeSecenek1
      ${NSD_CreateLabel} 12u 36u -12u 18u "Kurucu kapanır, hiçbir şey değişmez."
      Pop $0
      ${NSD_CreateRadioButton} 0 58u 100% 12u "&Eski sürüme dön: ${PRODUCT_NAME} ${VERSION} kur"
      Pop $pdefeSecenek2
      ${NSD_CreateLabel} 12u 70u -12u 26u "Ayarlarınız ve kısayollarınız korunur. Yeni sürümde eklenen seçenekler eski sürümde görünmez; ${PRODUCT_NAME} güncellemeyi yeniden önerebilir."
      Pop $0
    ${Else}
      ${If} $pdefeDurum == "bozuk"
        ${NSD_CreateLabel} 0 0 100% 20u "${PRODUCT_NAME} $pdefeKuruluSurum kurulu görünüyor ama program dosyaları eksik."
        Pop $0
        ${NSD_CreateRadioButton} 0 24u 100% 12u "&Onar (yeniden kur)"
        Pop $pdefeSecenek1
        ${NSD_CreateLabel} 12u 36u -12u 18u "${PRODUCT_NAME} ${VERSION} yeniden kurulur; ayarlarınız ve kısayollarınız korunur."
        Pop $0
      ${Else}
        ${NSD_CreateLabel} 0 0 100% 20u "${PRODUCT_NAME} ${VERSION} bu bilgisayarda zaten kurulu."
        Pop $0
        ${NSD_CreateRadioButton} 0 24u 100% 12u "&Onar (yeniden kur)"
        Pop $pdefeSecenek1
        ${NSD_CreateLabel} 12u 36u -12u 18u "Program dosyaları yeniden yazılır; ayarlarınız ve kısayollarınız korunur."
        Pop $0
      ${EndIf}
      ${NSD_CreateRadioButton} 0 58u 100% 12u "&Kaldır"
      Pop $pdefeSecenek2
      ${NSD_CreateLabel} 12u 70u -12u 26u "${PRODUCT_NAME} kaldırıcısı açılır. Ayarlarınız silinmez."
      Pop $0
    ${EndIf}
    ${NSD_AddStyle} $pdefeSecenek1 ${WS_GROUP}

    ; PDEfe açıksa uyarı: kurulum onu sormadan değil ama zorla kapatır (electron-builder _CHECK_APP_RUNNING, Stop-Process); kaydedilmemiş
    ; değişiklikler kaybolur. Ada göre bakılır (nsProcess); başka klasördeki aynı adlı süreç de "açık" sayılır, kurulum onu kapatmaz.
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R1
    ${nsProcess::Unload}
    ${If} $R1 == 0
      ${NSD_CreateLabel} 0 104u 100% 30u "Dikkat: ${PRODUCT_NAME} şu anda açık. Devam etmeden önce belgelerinizi kaydedip ${PRODUCT_NAME}'yi kapatın; açık kalırsa kurulum onu kapatır ve kaydedilmemiş değişiklikler kaybolur."
      Pop $0
    ${EndIf}

    ; Varsayılan seçim ilk seçenek (önerilen); Geri ile dönülünce son seçim
    ${If} $pdefeKip == "ozel"
    ${OrIf} $pdefeKip == "geri"
      ${NSD_Check} $pdefeSecenek2
    ${Else}
      ${NSD_Check} $pdefeSecenek1
    ${EndIf}
    ${NSD_OnClick} $pdefeSecenek1 pdefeSecenekDegisti
    ${NSD_OnClick} $pdefeSecenek2 pdefeSecenekDegisti
    Push $pdefeSecenek1
    Call pdefeSecenekDegisti

    nsDialogs::Show
  FunctionEnd

  ; Kaldır: kurulu PDEfe'nin kendi kaldırıcısı arayüzüyle açılır (Windows Ayarlar › Uygulamalar'ın çalıştırdığı komut: UninstallString), kurucu
  ; kapanır. Kaldırıcı kendini %TEMP%'e kopyalayıp yeniden başlatır; ayarlar silinmez (deleteAppDataOnUninstall false). Dönerse başarısızdır.
  Function pdefeKaldiriciyiAc
    ReadRegStr $1 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ${If} $1 == ""
    ${OrIfNot} ${FileExists} "$pdefeKuruluKlasor\${UNINSTALL_FILENAME}"
      MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME}'nin kaldırıcısı bulunamadı. Onar'ı seçip yeniden kurabilir ya da Windows Ayarlar › Uygulamalar'dan kaldırabilirsiniz."
      Return
    ${EndIf}
    ; Kurucunun ve kaldırıcının çalışma klasörü kurulum klasörü olmasın (kaldırıcı onu silecek)
    SetOutPath $TEMP
    ClearErrors
    Exec $1
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME}'nin kaldırıcısı başlatılamadı."
      Return
    ${EndIf}
    Quit
  FunctionEnd

  Function pdefeSurumBirak
    ${NSD_GetState} $pdefeSecenek1 $0
    ${If} $pdefeDurum == "eski"
      ${If} $0 == ${BST_CHECKED}
        StrCpy $pdefeKip "guncelle"
      ${Else}
        StrCpy $pdefeKip "ozel"
      ${EndIf}
    ${ElseIf} $pdefeDurum == "yeni"
      ${If} $0 == ${BST_CHECKED}
        Quit                                 ; Vazgeç: hiçbir şey yazılmadı (.onInit yalnızca okur)
      ${EndIf}
      StrCpy $pdefeKip "geri"
    ${Else}
      ${If} $0 != ${BST_CHECKED}
        Call pdefeKaldiriciyiAc
        Abort                                ; kaldırıcı açılamadı: sayfada kal
      ${EndIf}
      StrCpy $pdefeKip "onar"
    ${EndIf}

    ; Masaüstü kısayolu bugünkü durumunda kalsın: Ek görevler sayfası atlanır ya da (Seçenekleri değiştirerek kur) kutu bu durumla açılır.
    ; Elle çalıştırılan kurucuda electron-builder keepShortcuts kullanmaz (allowToChangeInstallationDirectory): eski kaldırıcı kısayolları
    ; siler, kurucu yeniden oluşturur, customInstall bu değişken "0" ise masaüstündekini kaldırır. Ad setLinkVars'taki gibi bulunur.
    ReadRegStr $1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "ShortcutName"
    ${If} $1 == ""
      StrCpy $1 "${PRODUCT_FILENAME}"
    ${EndIf}
    ${If} ${FileExists} "$DESKTOP\$1.lnk"
      StrCpy $pdefeMasaustuKisayolu "1"
    ${Else}
      StrCpy $pdefeMasaustuKisayolu "0"
    ${EndIf}

    ; Kurulumu hemen başlatan seçimde PDEfe hâlâ açıksa sor (varsayılan İptal: sayfada kalınır). Seçenekleri değiştirerek kur'da kurulum
    ; sonraki sayfalardan sonra başlar; orada electron-builder'ın kendi sorusu gelir.
    ${If} $pdefeKip != "ozel"
      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R1
      ${nsProcess::Unload}
      ${If} $R1 == 0
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "${PRODUCT_NAME} hâlâ açık. Tamam'a basarsanız kurulum ${PRODUCT_NAME}'yi kapatır; kaydedilmemiş değişiklikler kaybolur.$\r$\n$\r$\nBelgelerinizi kaydetmek için İptal'e basın, ${PRODUCT_NAME}'yi kapatın, sonra yeniden deneyin." IDOK pdefeAcikDevam
        Abort
        pdefeAcikDevam:
      ${EndIf}
    ${EndIf}
  FunctionEnd

  Page custom pdefeSurumOlustur pdefeSurumBirak

  ; Sayfa gösterilmediyse (kurulu değil ya da "herkes için" kip) ilk görünen sayfa lisanstır: Geri düğmesi bugünkü sihirbazdaki gibi gizlenir.
  ; Görünseydi, basılınca NSIS ön işlevde atlanan bu sayfanın da önüne gidip sihirbazı kapatıyordu (test\kurulum_surum.ps1, 1. durum).
  ; Tanım, hemen ardından gelen lisans sayfasının (electron-builder licensePage → MUI_PAGE_LICENSE) gösterim işlevi olur.
  !ifmacrodef licensePage
    Function pdefeLisansGoster
      ${If} $pdefeDurum == ""
        GetDlgItem $0 $HWNDPARENT 3
        ShowWindow $0 ${SW_HIDE}
      ${EndIf}
    FunctionEnd
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW pdefeLisansGoster
  !endif

  ; Lisans ve klasör sayfalarının atlama koşulu (yukarıdaki açıklama); customPageAfterChangeDir'de geri alınır
  !ifndef isUpdated
    !error "electron-builder'ın isUpdated tanımı yok: build\installer.nsh'teki kurulu sürüm sayfası gözden geçirilmeli"
  !endif
  !define /redef isUpdated `"" pdefeSayfaAtlanir ""`
  !define PDEFE_ISUPDATED_CEVRILDI
!macroend

; LogicLib koşulu: ${If} ${isUpdated}, customWelcomePage ile customPageAfterChangeDir arasında (lisans ve klasör sayfalarının ön işlevi) bu
; makroya döner
!macro _pdefeSayfaAtlanir _a _b _t _f
  Call pdefeSayfaAtlanirMi
  StrCmp $R9 "true" `${_t}` `${_f}`
!macroend

; "Bu uygulama kimler için kurulsun?" sayfası (madde 8): bu kullanıcıya kurulumda hiç gösterilmez. Sayfanın ön işlevi isForceCurrentInstall'ı
; görünce setInstallModePerUser + Abort yapar (komut satırındaki /currentuser gibi). "Herkes için" kip (HKLM'de kurulu PDEfe, /allusers)
; değişmedi. multiUserUi.nsh ifmacrodef'te "customInstallmode", insertmacro'da "customInstallMode" der; NSIS makro adlarında harf ayırmaz.
; Kaldırıcı derlemesinde de açılır: orada kurucunun değişkenleri yok ve kaldırıcı değişmemeli.
!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    ${If} $installMode == "CurrentUser"
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  !endif
!macroend

; ---------------------------------------------------------------- .onInit
; Değişkenler customWelcomePage içinde bildirilir (assistedInstaller.nsh, .onInit'ten önce derlenir).
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
  ; customWelcomePage'deki isUpdated çevirisini geri al: bundan sonraki her ${isUpdated} (bu sayfa, .onInit, kurulum bölümü, eski sürümü
  ; kaldırma) yine yalnızca komut satırındaki --updated'a bakar
  !ifdef PDEFE_ISUPDATED_CEVRILDI
    !define /redef isUpdated `"" isUpdated ""`
    !undef PDEFE_ISUPDATED_CEVRILDI
  !endif
  !include "nsDialogs.nsh"

  Var pdefeEkGorevlerSayfa
  Var pdefeMasaustuKutusu

  Function pdefeEkGorevlerOlustur
    ; Güncelleme kurulumunda sayfayı atla (önceki tercih korunur, kısayollar keepShortcuts ile taşınır)
    ${if} ${isUpdated}
      Abort
    ${endif}
    ; Kurulu sürüm sayfasında Güncelle / Onar / Eski sürüme dön seçildi: masaüstü kısayolu bugünkü durumunda kalır (pdefeSurumBirak)
    ${If} $pdefeKip == "guncelle"
    ${OrIf} $pdefeKip == "onar"
    ${OrIf} $pdefeKip == "geri"
      Abort
    ${EndIf}

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
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "${PDEFE_KAYIT_ADI}" "${PDEFE_KAYIT_KOKU}\Capabilities"

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
  ; 0.2.3: runAfterFinish: false (HIDE_RUN_AFTER_FINISH; kurucu sınamasının deneme derlemesi) verilince işlev kullanılmaz ve makensis -WX
  ; "kullanılmayan işlev" uyarısında durur
  !ifndef HIDE_RUN_AFTER_FINISH
  Function pdefeBaslat
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd
  !endif

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
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${PDEFE_KAYIT_ADI}"
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
