// test/mac_renderer.mjs'in çerçevesinde (iframe) yüklenir: renderer modüllerini o çerçevenin kendi modül haritasına yükler. Çerçevede
// window.pdefe.platform 'darwin' olduğundan platform.js MAC = true ile değerlendirilir; ana çerçevedeki (Windows) modüllere dokunulmaz.
// Sayfanın CSP'si satır içi betiğe ve eval'e izin vermediği için yükleme bu dosyadan yapılır.
window.__yukle = (yol) => import(yol);
