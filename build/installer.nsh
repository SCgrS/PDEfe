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
;      klasör ve Ek görevler atlanıp doğrudan kurulur) / Seçenekleri değiştirerek kur / Kaldır; aynı sürüm, program dosyaları eksik ya da
;      kayıttaki sürüm okunamıyorsa Onar / Kaldır; daha yeni sürüm kuruluysa Vazgeç / Eski sürüme dön. Sayfa işlevleri sessiz kurulumda (/S, --updated) hiç çağrılmaz:
;      .onInit, kurulum bölümü ve kaldırıcı değişmedi (test\kurucu_karsilastir.mjs satır satır karşılaştırır).
;   8. "Bu uygulama kimler için kurulsun?" sayfası kalktı (0.2.3): PDEfe yalnızca kullanıcıya kurulur, "herkes için" seçeneği zaten
;      solgundu. Yönetici olarak "herkes için" kurulmuş bir PDEfe bulunursa (initMultiUser kurulum kipini "all" yapar) sayfa ve
;      sihirbaz bugünkü gibi kalır, kurulu sürüm sayfası gösterilmez: o kurulum ancak yönetici izniyle güncellenebilir.
;   9. electron-builder'ın Türkçesi olmayan ya da yanlış çevrilmiş iletileri (0.2.3): customHeader'da LangString'lerin üzerine yazılır
;      (kurucu ve kaldırıcı). Şablonlara gömülü İngilizce birkaç durum yazısı ("Waiting for … to close.", "File is busy, aborting") yalnızca
;      kanca değiştirilerek (customCheckAppRunning / customRemoveFiles) Türkçeleşebilirdi; bu kancalar güncelleme yolunu da değiştirdiği için
;      kullanılmadı. NSIS'in Türkçe dil dosyasındaki yazım hataları (kaldırıcının hoş geldiniz, Kaldırılıyor ve bitiş sayfaları, kurucunun
;      klasör sayfası) da aynı yolla düzeltilir; lisans sayfasının sığmayan "Kabul Ediyorum" düğmesi "Kabul et" oldu (customWelcomePage).
;
; Kodlama: UTF-8 (electron-builder makensis'i -INPUTCHARSET UTF8 ile çağırır).

; 0.2.3: sabit kayıt adları /ifndef ile tanımlanır; gerçek derlemede değerler değişmedi (PDEfe, Software\PDEfe, PDEfe.pdf). Kurucu sınaması
; (test\kurucu_sinama.nsh) bunları önceden ayrı adlarla tanımlar: deneme kopyası gerçek PDEfe'nin Varsayılan Programlar kaydına ve ProgId'sine
; yazmaz, kaldırıcısı da onları silmez. PDEFE_PROGID, electron-builder yapılandırmasındaki fileAssociations.name ile aynı olmalı.
!define /ifndef PDEFE_KAYIT_ADI "PDEfe"
!define /ifndef PDEFE_KAYIT_KOKU "Software\${PDEFE_KAYIT_ADI}"
!define /ifndef PDEFE_PROGID "PDEfe.pdf"
!define /ifndef PDEFE_VARSAYILAN_URL "ms-settings:defaultapps?registeredAppUser=${PDEFE_KAYIT_ADI}"

; ---------------------------------------------------------------- Türkçe iletiler (madde 9)
; customHeader, installer.nsi'de bütün içermelerden ve addLangs'ten (MUI_LANGUAGE "Turkish") sonra açılır: electron-builder'ın ileti
; dosyalarındaki (messages.yml, assistedMessages.yml) LangString'lerin üzerine yazar; build\installer.nsh betikte o dosyalardan önce de sonra
; da gelebildiği için burada. Aynı LangString'in yeniden tanımı uyarı 6030'dur; -WX'te yalnızca bu blokta kapatılır. Sessiz kurulumda
; ileti kutuları gösterilmez (/SD); metinler dışında hiçbir şey değişmez.
!macro customHeader
  !pragma warning push
  !pragma warning disable 6030
  ; Kurucunun ve kaldırıcının açık PDEfe sorusu (_CHECK_APP_RUNNING; Tamam'da PDEfe Stop-Process ile kapatılır, İptal'de işlem durur)
  LangString appRunning ${LANG_TURKISH} "${PRODUCT_NAME} açık. Devam etmek için kapatılması gerekiyor.$\r$\n$\r$\nTamam'a basarsanız ${PRODUCT_NAME} kapatılır; kaydedilmemiş değişiklikler kaybolur. Belgelerinizi kaydetmek için İptal'e basın, sonra yeniden deneyin."
  ; Türkçe Windows'ta MB_RETRYCANCEL düğmesi "Yeniden Dene" (0.2.2'ye dek "Tekrar'a tıklayın" diyordu)
  LangString appCannotBeClosed ${LANG_TURKISH} "${PRODUCT_NAME} kapatılamadı.$\r$\nLütfen ${PRODUCT_NAME}'yi elle kapatın, sonra Yeniden Dene'ye basın."
  LangString appClosing ${LANG_TURKISH} "${PRODUCT_NAME} kapatılıyor..."
  LangString decompressionFailed ${LANG_TURKISH} "Dosyalar açılamadı. Kurucuyu yeniden çalıştırmayı deneyin."
  ; handleUninstallResult sonuna ": <çıkış kodu>" ekler
  LangString uninstallFailed ${LANG_TURKISH} "Eski sürümün dosyaları kaldırılamadı (bir dosya kullanımda olabilir). ${PRODUCT_NAME}'yi kapatıp kurucuyu yeniden çalıştırın. Hata kodu"
  LangString areYouSureToUninstall ${LANG_TURKISH} "${PRODUCT_NAME}'yi kaldırmak istediğinizden emin misiniz?"
  ; "Kimler için kurulsun?" sayfası (yalnızca "herkes için" kipte) ve kaldırıcının eşi (iki kurulum birden varsa). Şablon kurulum
  ; yazılarının sonuna boşluksuz "(<klasör>)" ve satır sonuyla reinstallUpgrade / uninstall ekler.
  LangString forAll ${LANG_TURKISH} "Bu bilgisayarı kullanan &herkes"
  LangString onlyForMe ${LANG_TURKISH} "Yalnızca &benim için"
  LangString selectUserMode ${LANG_TURKISH} "${PRODUCT_NAME} bu bilgisayardaki herkes için mi, yalnızca sizin için mi kurulsun?"
  LangString perUserInstallExists ${LANG_TURKISH} "Bu kullanıcı için zaten bir kurulum var "
  LangString perMachineInstallExists ${LANG_TURKISH} "Herkes için zaten bir kurulum var "
  LangString perUserInstall ${LANG_TURKISH} "Bu kullanıcı için bir kurulum var "
  LangString perMachineInstall ${LANG_TURKISH} "Herkes için bir kurulum var "
  LangString reinstallUpgrade ${LANG_TURKISH} "Üzerine yeniden kurulur ya da güncellenir."
  LangString uninstall ${LANG_TURKISH} "Kaldırılacak."
  LangString freshInstallForAll ${LANG_TURKISH} "Herkes için yeni kurulum (yönetici izni istenir)."
  LangString freshInstallForCurrent ${LANG_TURKISH} "Yalnızca sizin için yeni kurulum."
  LangString whichInstallationRemove ${LANG_TURKISH} "${PRODUCT_NAME} hem herkes için hem de yalnızca sizin için kurulu.$\r$\nHangisi kaldırılsın?"
  LangString loginWithAdminAccount ${LANG_TURKISH} "Devam etmek için yönetici grubundaki bir hesapla oturum açmanız gerekiyor."
  ; 0.2.3: NSIS'in Türkçe dil dosyasındaki (Contrib\Language files\Turkish.nsh, NSIS 3.0.4) yazım hataları: "kadırılımı", "Kaldırım işlemeni",
  ; "programlari" (kaldırıcının hoş geldiniz sayfası), "Litfen" (Kaldırılıyor), "Tamamlandır", "'bitir'e" (kaldırıcının bitişi), "şeçiniz"
  ; (kurucunun klasör sayfası). Metinler dil dosyasındaki gibi, yalnızca hatalar düzeltildi. Dil dosyası bunları ancak sayfa kullanılıyorsa
  ; tanımlar; burada da aynı koşulla (kurucu ve kaldırıcı ayrı derlenir).
  !ifdef MUI_UNWELCOMEPAGE
    LangString MUI_UNTEXT_WELCOME_INFO_TEXT ${LANG_TURKISH} "Bu sihirbaz size $(^NameDA) programının kaldırılması boyunca rehberlik edecektir.$\r$\n$\r$\nKaldırma işlemini başlatmadan önce çalışan diğer programları kapatmanızı öneririz. Böylece bilgisayarınızı yeniden başlatmadan bazı sistem dosyaları sorunsuz kaldırılabilir.$\r$\n$\r$\n$_CLICK"
  !endif
  !ifdef MUI_UNINSTFILESPAGE
    LangString MUI_UNTEXT_UNINSTALLING_SUBTITLE ${LANG_TURKISH} "Lütfen $(^NameDA) programı sisteminizden kaldırılırken bekleyiniz."
    LangString MUI_UNTEXT_FINISH_TITLE ${LANG_TURKISH} "Kaldırma İşlemi Tamamlandı"
  !endif
  !ifdef MUI_UNFINISHPAGE
    LangString MUI_UNTEXT_FINISH_INFO_TEXT ${LANG_TURKISH} "$(^NameDA) programı sisteminizden kaldırıldı.$\r$\n$\r$\nSihirbazı kapatmak için 'Bitir'e basınız."
  !endif
  !ifdef MUI_DIRECTORYPAGE
    LangString MUI_TEXT_DIRECTORY_SUBTITLE ${LANG_TURKISH} "$(^NameDA) programını kurmak istediğiniz dizini seçiniz."
  !endif
  !pragma warning pop
!macroend

; ---------------------------------------------------------------- kurulu sürüm sayfası (madde 7)
; customWelcomePage ilk sayfadır ve .onInit'ten, customPageAfterChangeDir'den önce açılır: kurucunun bütün değişkenleri burada bildirilir
; (NSIS'te Var kullanımdan önce gelmeli; 0.2.2'ye dek customPageAfterChangeDir'deydiler).
!macro customWelcomePage
  !include "WordFunc.nsh"
  !include "nsDialogs.nsh"

  Var pdefeMasaustuKisayolu   ; "1" | "0": kurulumdan sonra masaüstü kısayolu olsun mu (customInstall)
  Var pdefeEskiPdfSinifi      ; .pdf'in kurulumdan önceki varsayılan dosya sınıfı (customInit → customInstall)
  Var pdefeKip                ; "" (sayfa gösterilmedi) | guncelle | onar | geri | ozel (Seçenekleri değiştirerek kur)
  Var pdefeDurum              ; eski | ayni | yeni | bozuk (kayıt var, program dosyası yok) | bilinmiyor (kayıttaki sürüm okunamadı)
  Var pdefeKuruluSurum
  Var pdefeKuruluKlasor
  Var pdefeSurumSayfa
  Var pdefeSecenek1
  Var pdefeSecenek2
  Var pdefeSecenek3           ; yalnızca eski sürüm kuruluyken: Kaldır

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
      ${NSD_GetState} $pdefeSecenek3 $3
      ${If} $2 == ${BST_CHECKED}
        SendMessage $1 ${WM_SETTEXT} 0 "STR:Güncelle"
      ${ElseIf} $3 == ${BST_CHECKED}
        SendMessage $1 ${WM_SETTEXT} 0 "STR:Kaldır"
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

  ; Kayıttaki sürümün sayısal çekirdeği (0.2.3, bağımsız incelemenin bulgusu). WordFunc VersionCompare yalnızca rakam ve noktayı doğru
  ; karşılaştırır: ön sürüm eki (0.3.0-beta.1), "v" öneki, boşluk ya da bozuk kayıt ("abc") "daha yeni sürüm kurulu" sayılıyordu (Vazgeç
  ; önerilir, Onar'a ulaşılamazdı). Giriş $R0; çıkış $R1: ilk "-" ya da "+"tan önceki kısım, yalnızca rakam ve noktaysa (boş bölüm yok),
  ; değilse ""; $R2: "1" ön sürüm / yapı eki vardı. electron-builder DisplayVersion'a package.json sürümünü düz x.y.z yazar.
  Function pdefeSurumCekirdegi
    StrCpy $R1 ""
    StrCpy $R2 "0"
    StrCpy $R3 0
    StrCpy $R5 "."                           ; önceki karakter: başta nokta olamaz
    ${Do}
      StrCpy $R4 $R0 1 $R3
      ${If} $R4 == ""
        ${Break}
      ${EndIf}
      ${If} $R4 == "-"
      ${OrIf} $R4 == "+"
        StrCpy $R2 "1"
        ${Break}
      ${EndIf}
      ${If} $R4 == "."
        ${If} $R5 == "."
          StrCpy $R1 ""
          Return
        ${EndIf}
      ${Else}
        StrCpy $R6 0                         ; rakam mı (StrCmp tam karşılaştırır; S< / S> yerel sıraya göre)
        StrCpy $R7 0
        ${Do}
          StrCpy $R8 "0123456789" 1 $R7
          ${If} $R8 == ""
            ${Break}
          ${EndIf}
          ${If} $R8 == $R4
            StrCpy $R6 1
            ${Break}
          ${EndIf}
          IntOp $R7 $R7 + 1
        ${Loop}
        ${If} $R6 == 0
          StrCpy $R1 ""
          Return
        ${EndIf}
      ${EndIf}
      StrCpy $R1 "$R1$R4"
      StrCpy $R5 $R4
      IntOp $R3 $R3 + 1
    ${Loop}
    ${If} $R5 == "."                         ; boş ya da noktayla biten
      StrCpy $R1 ""
    ${EndIf}
  FunctionEnd

  ; PDEfe açık mı (0.2.3, bağımsız incelemenin bulgusu): kurulumun açık PDEfe'yi kapatırken kullandığı ölçüt (allowOnlyOneInstallerInstance.nsh,
  ; FIND_PROCESS / KILL_PROCESS: yolu kurulu klasörle başlayan süreç). Önceden süreç adına bakılıyordu (nsProcess): kurucu dosyası PDEfe.exe
  ; adıyla kaydedilince kendini buluyordu; başka klasördeki (ör. release\win-unpacked) ya da başka Windows kullanıcısındaki PDEfe.exe de "açık"
  ; sayılıyordu, kurulum onları kapatmaz. Süreçler Win32 ile taranır (Toolhelp, QueryFullProcessImageName; birkaç ms): electron-builder'ın
  ; PowerShell / WMI sorgusu (Get-CimInstance Win32_Process) bu bilgisayarda 11 sn sürdü, sayfa o kadar geç açılırdı. Başka kullanıcının
  ; süreci yönetici izni olmadan açılamaz, sayılmaz; kurucunun kendisi sayılmaz. Yollar uzun biçime çevrilip harf ayırmadan karşılaştırılır.
  ; Çıkış $R1: 0 açık, 1 değil (öteki yazmaçlar korunur).
  Function pdefeAcikMi
    Push $R0
    Push $R2
    Push $R3
    Push $R4
    Push $R5
    Push $R6
    Push $R7
    Push $R8
    Push $R9
    StrCpy $R1 1
    StrCpy $R9 $pdefeKuruluKlasor
    System::Call 'kernel32::GetLongPathNameW(w R9, w .R2, i ${NSIS_MAX_STRLEN}) i .R7'
    ${If} $R7 > 0
      StrCpy $R9 $R2
    ${EndIf}
    StrCpy $R9 "$R9\"
    StrLen $R3 $R9
    System::Call 'kernel32::GetCurrentProcessId() i .R4'
    System::Call 'kernel32::CreateToolhelp32Snapshot(i 2, i 0) i .R5'   ; TH32CS_SNAPPROCESS; kurucu 32 bit: tutamaç i
    ${If} $R5 != -1
    ${AndIf} $R5 != 0
      System::Call '*(&l4, i, i, p, i, i, i, i, i, &w260) p .R6'          ; PROCESSENTRY32W (dwSize kendiliğinden)
      System::Call 'kernel32::Process32FirstW(i R5, p R6) i .R7'
      ${DoWhile} $R7 != 0
        System::Call '*$R6(i, i, i .R8)'                                 ; th32ProcessID
        ${If} $R8 != $R4
          System::Call 'kernel32::OpenProcess(i 0x1000, i 0, i R8) i .R0'  ; PROCESS_QUERY_LIMITED_INFORMATION
          ${If} $R0 != 0
            StrCpy $R2 ""
            System::Call 'kernel32::QueryFullProcessImageNameW(i R0, i 0, w .R2, *i ${NSIS_MAX_STRLEN}) i .R7'
            System::Call 'kernel32::CloseHandle(i R0)'
            ${If} $R2 != ""
              System::Call 'kernel32::GetLongPathNameW(w R2, w .R0, i ${NSIS_MAX_STRLEN}) i .R7'
              ${If} $R7 > 0
                StrCpy $R2 $R0
              ${EndIf}
              StrCpy $R2 $R2 $R3
              ${If} $R2 == $R9
                StrCpy $R1 0
                ${Break}
              ${EndIf}
            ${EndIf}
          ${EndIf}
        ${EndIf}
        System::Call 'kernel32::Process32NextW(i R5, p R6) i .R7'
      ${Loop}
      System::Free $R6
      System::Call 'kernel32::CloseHandle(i R5)'
    ${EndIf}
    Pop $R9
    Pop $R8
    Pop $R7
    Pop $R6
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R0
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
      StrCpy $R0 $pdefeKuruluSurum
      Call pdefeSurumCekirdegi
      ${If} $R1 == ""
        StrCpy $pdefeDurum "bilinmiyor"      ; sürüm okunamadı: Onar / Kaldır (aynı sürümdeki gibi)
      ${Else}
        ; 0 eşit, 1 bu kurucu daha yeni, 2 kurulu sürüm daha yeni (sayısal: 0.2.10 > 0.2.9). Çekirdeği aynı ön sürüm (0.3.0-beta.1) kuruluysa
        ; bu kurucu daha yenidir (sürüm numaralandırmasının kuralı); PDEfe ön sürüm yayımlamıyor, kurucunun kendi sürümü hep x.y.z
        ${VersionCompare} "${VERSION}" "$R1" $R0
        ${If} $R0 == 0
        ${AndIf} $R2 == "1"
          StrCpy $R0 1
        ${EndIf}
        ${If} $R0 == 1
          StrCpy $pdefeDurum "eski"
        ${ElseIf} $R0 == 2
          StrCpy $pdefeDurum "yeni"
        ${Else}
          StrCpy $pdefeDurum "ayni"
        ${EndIf}
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
    ; Eski sürüm kuruluyken üç seçenek var: açıklamaları tek satırlık (11u), seçenekler 24 / 50 / 76'da, son açıklama 88–99; uyarı yine 104'te.
    ; Sayfa 140u yüksekliğinde. Metinlerin sığdığı test\kurulum_surum.ps1 ile ölçülür.
    ${If} $pdefeDurum == "eski"
      ${NSD_CreateLabel} 0 0 100% 20u "Bilgisayarınızda ${PRODUCT_NAME} $pdefeKuruluSurum kurulu. Bu kurucu daha yeni olan ${VERSION} sürümünü kurar."
      Pop $0
      ${NSD_CreateRadioButton} 0 24u 100% 12u "&Güncelle (önerilen)"
      Pop $pdefeSecenek1
      ; 0.2.3, bağımsız incelemenin bulgusu: "kısayollarınız korunur" denmez. Elle çalıştırılan kurucu eski kaldırıcıyı --keep-shortcuts'sız
      ; çalıştırır (allowToChangeInstallationDirectory; installUtil.nsh setIsTryToKeepShortcuts); kaldırıcı kısayolları silerken
      ; WinShell::UninstShortcut / UninstAppUserModelId ile görev çubuğu ve Başlat sabitlemesini de kaldırır (WinShell.dll'de
      ; IStartMenuPinnedList), kurucu kısayolları yeniden oluşturur. Masaüstü kısayolunun bugünkü durumu korunur (pdefeSurumBirak). 0.2.2'deki
      ; elle kurulumda da böyleydi; sessiz yolu değiştirmeden (--updated) keepShortcuts verilemiyor.
      ${NSD_CreateLabel} 12u 36u -12u 11u "Ayarlarınız, masaüstü kısayolu ve kurulum klasörü korunur; doğrudan kurulur."
      Pop $0
      ${NSD_CreateRadioButton} 0 50u 100% 12u "&Seçenekleri değiştirerek kur"
      Pop $pdefeSecenek2
      ${NSD_CreateLabel} 12u 62u -12u 11u "Lisans, kurulum klasörü ve masaüstü kısayolu sayfaları gösterilir."
      Pop $0
      ; 0.2.3, kullanıcıya onaylatılan plan: eski sürüm kuruluyken de Kaldır (aynı sürümdeki gibi PDEfe'nin kendi kaldırıcısı açılır)
      ${NSD_CreateRadioButton} 0 76u 100% 12u "&Kaldır"
      Pop $pdefeSecenek3
      ${NSD_CreateLabel} 12u 88u -12u 11u "${PRODUCT_NAME} kaldırıcısı açılır. Ayarlarınız silinmez."
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
      ${NSD_CreateLabel} 12u 70u -12u 26u "Ayarlarınız ve masaüstü kısayolu korunur. Yeni sürümde eklenen seçenekler eski sürümde görünmez; ${PRODUCT_NAME} güncellemeyi yeniden önerebilir."
      Pop $0
    ${Else}
      ${If} $pdefeDurum == "bozuk"
        ${NSD_CreateLabel} 0 0 100% 20u "${PRODUCT_NAME} $pdefeKuruluSurum kurulu görünüyor ama program dosyaları eksik."
        Pop $0
        ${NSD_CreateRadioButton} 0 24u 100% 12u "&Onar (yeniden kur)"
        Pop $pdefeSecenek1
        ${NSD_CreateLabel} 12u 36u -12u 18u "${PRODUCT_NAME} ${VERSION} yeniden kurulur; ayarlarınız ve masaüstü kısayolu korunur."
        Pop $0
      ${Else}
        ${If} $pdefeDurum == "bilinmiyor"
          ${NSD_CreateLabel} 0 0 100% 20u "Bilgisayarınızda ${PRODUCT_NAME} kurulu, ama kurulu sürüm okunamadı («$pdefeKuruluSurum»). Bu kurucu ${VERSION} sürümünü kurar."
        ${Else}
          ${NSD_CreateLabel} 0 0 100% 20u "${PRODUCT_NAME} ${VERSION} bu bilgisayarda zaten kurulu."
        ${EndIf}
        Pop $0
        ${NSD_CreateRadioButton} 0 24u 100% 12u "&Onar (yeniden kur)"
        Pop $pdefeSecenek1
        ${NSD_CreateLabel} 12u 36u -12u 18u "Program dosyaları yeniden yazılır; ayarlarınız ve masaüstü kısayolu korunur."
        Pop $0
      ${EndIf}
      ${NSD_CreateRadioButton} 0 58u 100% 12u "&Kaldır"
      Pop $pdefeSecenek2
      ${NSD_CreateLabel} 12u 70u -12u 26u "${PRODUCT_NAME} kaldırıcısı açılır. Ayarlarınız silinmez."
      Pop $0
    ${EndIf}
    ${NSD_AddStyle} $pdefeSecenek1 ${WS_GROUP}

    ; PDEfe açıksa uyarı: kurulum onu sormadan değil ama zorla kapatır (electron-builder _CHECK_APP_RUNNING, Stop-Process); kaydedilmemiş
    ; değişiklikler kaybolur. Kurulumun kapatacağı süreçlere bakılır (pdefeAcikMi).
    Call pdefeAcikMi
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
    ${If} $pdefeDurum == "eski"
      ${NSD_OnClick} $pdefeSecenek3 pdefeSecenekDegisti
    ${EndIf}
    Push $pdefeSecenek1
    Call pdefeSecenekDegisti

    nsDialogs::Show
  FunctionEnd

  ; Kaldır: kurulu PDEfe'nin kendi kaldırıcısı arayüzüyle açılır (Windows Ayarlar › Uygulamalar'ın çalıştırdığı komut: UninstallString), kurucu
  ; kapanır. Kaldırıcı kendini %TEMP%'e kopyalayıp yeniden başlatır; ayarlar silinmez (deleteAppDataOnUninstall false). Dönerse başarısızdır.
  ; Aynı sürüm, bozuk kurulum ve (0.2.3) eski sürüm durumunda; yeniden kurmayı öneren ileti o durumdaki seçeneğin adını söyler.
  ; Kaldırıcının varlığına çalıştırılacak yolda bakılır (0.2.3, bağımsız incelemenin bulgusu): UninstallString'in tırnak içindeki ilk parçası
  ; (electron-builder "\"<klasör>\Uninstall PDEfe.exe\" /currentuser" yazar; uninstallOldVersion da onu böyle okur, GetInQuotes). Önceden
  ; kurulu klasörde (InstallLocation; yoksa varsayılan klasör) aranıyordu: ikisi ayrışınca kaldırıcı varken "bulunamadı" denebilir ya da
  ; denetlenen dosyadan başkası çalıştırılabilirdi. İleti Windows Ayarlar'ı önermez: Windows da aynı UninstallString'i çalıştırır.
  Function pdefeKaldiriciyiAc
    ReadRegStr $1 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    StrCpy $3 $1
    StrCpy $4 $1 1
    ${If} $4 == '"'
      StrCpy $5 1
      ${Do}
        StrCpy $4 $1 1 $5
        ${If} $4 == '"'
        ${OrIf} $4 == ""
          ${Break}
        ${EndIf}
        IntOp $5 $5 + 1
      ${Loop}
      IntOp $5 $5 - 1
      StrCpy $3 $1 $5 1
    ${EndIf}
    ${If} $1 == ""
    ${OrIf} $3 == ""
    ${OrIfNot} ${FileExists} "$3"
      ${If} $pdefeDurum == "eski"
        StrCpy $2 "Güncelle'yi"
      ${Else}
        StrCpy $2 "Onar'ı"
      ${EndIf}
      MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME}'nin kaldırıcısı bulunamadı. $2 seçip yeniden kurun (kaldırıcı da kurulur); sonra kurucuyu yeniden açıp Kaldır'ı seçebilirsiniz."
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
      ${NSD_GetState} $pdefeSecenek3 $1
      ${If} $0 == ${BST_CHECKED}
        StrCpy $pdefeKip "guncelle"
      ${ElseIf} $1 == ${BST_CHECKED}
        Call pdefeKaldiriciyiAc
        Abort                                ; kaldırıcı açılamadı: sayfada kal
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
      Call pdefeAcikMi
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
    ; 0.2.3: NSIS'in Türkçe düğme yazısı "Kabul Ediyorum" 75 px'lik İleri düğmesine sığmıyor, kenarlara değiyordu (84 px gerekiyor; 0.2.2'de
    ; de böyleydi, test\kurulum_surum.ps1 ölçer). Kısa yazı ve onu anan alt metin; ikisi de MUI'nin lisans sayfası tanımları, yalnızca bu sayfa.
    !define MUI_LICENSEPAGE_BUTTON "&Kabul et"
    !define MUI_LICENSEPAGE_TEXT_BOTTOM "Sözleşme koşullarını kabul ediyorsanız 'Kabul et' düğmesine basın. ${PRODUCT_NAME}'yi kurmak için sözleşme koşullarını kabul etmeniz gerekir."
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
    ; Sayfa gösterilirse ("herkes için" kip) solgun seçeneğe eklenen sabit İngilizce "(must run as admin)" Türkçesiyle değişsin: bu tanım
    ; aynı ön işlevin sonundaki MUI_PAGE_FUNCTION_CUSTOM SHOW'da çağrıya döner (işlev customPageAfterChangeDir'de; o sayfanın Var'larından sonra)
    !ifndef MULTIUSER_INSTALLMODE_ALLOW_ELEVATION
      !define MUI_PAGE_CUSTOMFUNCTION_SHOW pdefeKipSayfasiGoster
    !endif
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

  ; "Kimler için kurulsun?" sayfası yalnızca "herkes için" kipte görünür (madde 8); yönetici olmayan kullanıcıda solgun seçeneğin yazısı
  ; (multiUserUi.nsh sabit İngilizce "(must run as admin)" ekliyor)
  !ifmacrodef PAGE_INSTALL_MODE
  !ifndef MULTIUSER_INSTALLMODE_ALLOW_ELEVATION
    Function pdefeKipSayfasiGoster
      ${IfNot} ${UAC_IsAdmin}
        SendMessage $MultiUser.InstallModePage.AllUsers ${WM_SETTEXT} 0 "STR:$(forAll) (yönetici olarak çalıştırılmalı)"
      ${EndIf}
    FunctionEnd
  !endif
  !endif

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

    ; Kurulumdan önceki son sayfa: NSIS İleri düğmesine "Kur" yazar (0.2.3; önceden metin "İleri'ye basın" diyordu)
    ${NSD_CreateLabel} 0 0 100% 24u "PDEfe kurulurken yapılmasını istediğiniz ek işleri işaretleyin, sonra Kur'a basın."
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
