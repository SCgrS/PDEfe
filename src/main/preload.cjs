// Renderer'a dar ve güvenli bir köprü sunar.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('pdefe', {
  cagir: (kanal, ...args) => ipcRenderer.invoke(kanal, ...args),
  gonder: (kanal, ...args) => ipcRenderer.send(kanal, ...args),
  dinle: (kanal, cb) => {
    const f = (_e, ...a) => cb(...a);
    ipcRenderer.on(kanal, f);
    return () => ipcRenderer.removeListener(kanal, f);
  },
  dosyaYolu: (dosya) => webUtils.getPathForFile(dosya),
});
