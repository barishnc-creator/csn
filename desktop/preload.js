// Sandbox'lı preload: yalnız ekran paylaşımı için dar bir köprü açar.
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('csnDesktop', {
  isDesktop: true,
  getSources: () => ipcRenderer.invoke('csn:get-sources'),
  selectSource: (id, withAudio) => ipcRenderer.invoke('csn:select-source', String(id), !!withAudio),
  // Özel başlık çubuğu (0.1.3+)
  titleBarHeight: 34,
  setTitleBarColors: (color, symbolColor) => ipcRenderer.invoke('csn:titlebar', String(color), String(symbolColor)),
  // Soundpad genel kısayolları (0.1.4+): Cousy arka plandayken de çalışır
  setHotkeys: (list) =>
    ipcRenderer.invoke(
      'csn:set-hotkeys',
      Array.isArray(list) ? list.map((x) => ({ id: String(x.id), combo: String(x.combo) })) : [],
    ),
  onHotkey: (cb) => {
    const h = (_e, id) => cb(String(id))
    ipcRenderer.on('csn:hotkey', h)
    return () => ipcRenderer.removeListener('csn:hotkey', h)
  },
  onFullscreen: (cb) => {
    const h = (_e, v) => cb(!!v)
    ipcRenderer.on('csn:fullscreen', h)
    return () => ipcRenderer.removeListener('csn:fullscreen', h)
  },
})
