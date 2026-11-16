const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  fetchHolidays: options => ipcRenderer.invoke('holidays:fetch', options),
  holidaysConfigured: () => ipcRenderer.invoke('holidays:configured')
});
