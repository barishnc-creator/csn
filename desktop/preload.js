// Sandbox'lı preload: yalnız ekran paylaşımı için dar bir köprü açar.
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('csnDesktop', {
  isDesktop: true,
  getSources: () => ipcRenderer.invoke('csn:get-sources'),
  selectSource: (id, withAudio) => ipcRenderer.invoke('csn:select-source', String(id), !!withAudio),
})
