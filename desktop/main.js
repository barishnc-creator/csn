// CSN masaüstü uygulaması: yayındaki web sitesini açar, ekran paylaşımında
// tarayıcının kendi seçim penceresi ve "ekranınızı paylaşıyor" çubuğu yerine
// uygulama içi seçiciyi kullanır (window.csnDesktop köprüsü, preload.js).
'use strict'

const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell, Menu } = require('electron')
const path = require('node:path')

const APP_URL = 'https://barishnc-creator.github.io/csn/'
const APP_ORIGIN = new URL(APP_URL).origin

// Uygulama içinde kalan adresler: yalnız CSN sitesi
function isAppUrl(url) {
  try {
    const u = new URL(url)
    return u.origin === APP_ORIGIN && (u.pathname === '/csn' || u.pathname.startsWith('/csn/'))
  } catch {
    return false
  }
}

function isSafeExternal(url) {
  try {
    const p = new URL(url).protocol
    return p === 'https:' || p === 'http:' || p === 'mailto:'
  } catch {
    return false
  }
}

app.setName('CSN')
if (process.platform === 'win32') app.setAppUserModelId('com.csn.desktop')

// Tek kopya: ikinci açılışta mevcut pencereyi öne getir
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let win = null

  // Ekran paylaşımı durumu
  let lastSources = new Map() // id → DesktopCapturerSource
  let selected = null // { id, withAudio }

  async function listSources() {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    })
    lastSources = new Map(sources.map((s) => [s.id, s]))
    return sources
  }

  function senderAllowed(event) {
    const url = event.senderFrame ? event.senderFrame.url : ''
    return isAppUrl(url)
  }

  ipcMain.handle('csn:get-sources', async (event) => {
    if (!senderAllowed(event)) throw new Error('İzin yok')
    const sources = await listSources()
    return sources
      .filter((s) => s.id.startsWith('screen:') || s.id.startsWith('window:'))
      .map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '',
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : undefined,
      }))
  })

  ipcMain.handle('csn:select-source', async (event, id, withAudio) => {
    if (!senderAllowed(event)) throw new Error('İzin yok')
    if (typeof id !== 'string') throw new Error('Geçersiz kaynak')
    selected = { id, withAudio: !!withAudio }
  })

  function createWindow() {
    win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 940,
      minHeight: 560,
      title: 'CSN',
      backgroundColor: '#0f1117',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Simge durumundayken de ses / yayın aksamasın
        backgroundThrottling: false,
        spellcheck: false,
      },
    })

    win.once('ready-to-show', () => win.show())

    // Site dışı bağlantılar varsayılan tarayıcıda açılır
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternal(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e, url) => {
      if (isAppUrl(url)) return
      e.preventDefault()
      if (isSafeExternal(url)) shell.openExternal(url)
    })

    // Menü yok; F5 / Ctrl+R yenile, Ctrl+Shift+I geliştirici araçları
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return
      const key = input.key.toLowerCase()
      if (input.key === 'F5' || (input.control && key === 'r')) {
        win.webContents.reload()
        e.preventDefault()
      } else if (input.control && input.shift && key === 'i') {
        win.webContents.toggleDevTools()
        e.preventDefault()
      }
    })

    win.on('closed', () => {
      win = null
    })

    win.loadURL(APP_URL)
  }

  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    const ses = session.defaultSession

    // İzinler yalnız CSN sitesine
    const ALLOWED = new Set([
      'media',
      'display-capture',
      'notifications',
      'fullscreen',
      'clipboard-sanitized-write',
      'speaker-selection',
    ])
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      const url = (details && details.requestingUrl) || wc.getURL()
      callback(ALLOWED.has(permission) && isAppUrl(url))
    })
    ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
      return ALLOWED.has(permission) && requestingOrigin === APP_ORIGIN && (!wc || isAppUrl(wc.getURL()))
    })

    // getDisplayMedia (LiveKit) → uygulama içi seçicide seçilen kaynak; tarayıcı penceresi açılmaz.
    ses.setDisplayMediaRequestHandler(
      async (request, callback) => {
        try {
          const frameUrl = request.frame ? request.frame.url : ''
          if (!isAppUrl(frameUrl) && request.securityOrigin !== APP_ORIGIN) return callback({})

          const choice = selected
          selected = null
          let source = choice ? lastSources.get(choice.id) : undefined
          if (!source) {
            const all = await listSources()
            source = (choice && all.find((s) => s.id === choice.id)) || all.find((s) => s.id.startsWith('screen:'))
          }
          if (!source) return callback({})

          const streams = { video: source }
          // Sistem sesi (loopback) yalnız Windows'ta destekleniyor
          if (choice && choice.withAudio && request.audioRequested && process.platform === 'win32') {
            streams.audio = 'loopback'
          }
          callback(streams)
        } catch (err) {
          console.error('Ekran paylaşımı başlatılamadı:', err)
          callback({})
        }
      },
      { useSystemPicker: false },
    )

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
