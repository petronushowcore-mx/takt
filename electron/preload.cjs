const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('klavish', {
  load: () => ipcRenderer.invoke('store:load'),
  save: (state, session) => ipcRenderer.invoke('store:save', state, session),
  exportData: (format, content, purpose, language) => ipcRenderer.invoke('store:export', format, content, purpose, language),
  openLogs: () => ipcRenderer.invoke('store:open-logs'),
  clearData: (state) => ipcRenderer.invoke('store:clear', state),
  getInfo: () => ipcRenderer.invoke('app:get-info'),
})
