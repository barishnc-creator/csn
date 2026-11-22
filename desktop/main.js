// Cousy masaüstü uygulaması: yayındaki web sitesini açar, ekran paylaşımında
// tarayıcının kendi seçim penceresi ve "ekranınızı paylaşıyor" çubuğu yerine
// uygulama içi seçiciyi kullanır (window.csnDesktop köprüsü, preload.js).
'use strict'

const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell, Menu, nativeTheme } = require('electron')
const path = require('node:path')

const APP_URL = 'https://barishnc-creator.github.io/csn/'
const APP_ORIGIN = new URL(APP_URL).origin
const TITLEBAR_HEIGHT = 34

// Uygulama içinde kalan adresler: yalnız Cousy sitesi
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

app.setName('Cousy')
// Ad CSN'den Cousy'ye değişti; oturum ve ayarlar kaybolmasın diye veri klasörü eski adla kalır
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'CSN'))
} catch {
  // Store paketi vb.: varsayılan klasör
}
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

  // Başlık çubuğu düğmelerinin rengi sayfanın temasına uyar
  const HEX = /^#[0-9a-f]{6}$/i
  ipcMain.handle('csn:titlebar', async (event, color, symbolColor) => {
    if (!senderAllowed(event) || !win) return
    if (!HEX.test(String(color)) || !HEX.test(String(symbolColor))) return
    try {
      win.setTitleBarOverlay({ color, symbolColor, height: TITLEBAR_HEIGHT })
    } catch {}
  })

  // ───── Soundpad kısayolları: Cousy arka plandayken de (oyun, başka uygulama) çalışır ─────
  // uiohook tuşları yalnız dinler, engellemez: atanmış tuş diğer uygulamalarda da yazılmaya devam eder.
  let hook = null
  try {
    hook = require('uiohook-napi')
  } catch (err) {
    console.error('Genel kısayol modülü yüklenemedi:', err)
  }
  const codeByKeycode = new Map() // uiohook tuş kodu → KeyboardEvent.code
  if (hook) {
    for (const [name, keycode] of Object.entries(hook.UiohookKey)) {
      if (/^(Ctrl|Alt|Shift|Meta)(Right)?$/.test(name)) continue
      const code = /^[A-Z]$/.test(name) ? `Key${name}` : /^[0-9]$/.test(name) ? `Digit${name}` : name
      codeByKeycode.set(keycode, code)
    }
  }
  let hotkeys = new Map() // "Ctrl+Digit1" → ses id
  let hookRunning = false
  const pressed = new Set()
  const COMBO = /^((Ctrl|Alt|Shift|Meta)\+){0,4}[A-Za-z0-9]{1,24}$/

  function onGlobalKeyDown(e) {
    if (pressed.has(e.keycode)) return // basılı tutma tekrarı
    pressed.add(e.keycode)
    // Pencere öndeyse sayfa kendi dinleyicisiyle çalar (iki kez çalmasın)
    if (!win || win.isDestroyed() || win.isFocused()) return
    const code = codeByKeycode.get(e.keycode)
    if (!code) return
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean)
    const id = hotkeys.get([...mods, code].join('+'))
    if (id) win.webContents.send('csn:hotkey', id)
  }
  function onGlobalKeyUp(e) {
    pressed.delete(e.keycode)
  }
  function syncHook() {
    if (!hook) return
    try {
      if (hotkeys.size > 0 && !hookRunning) {
        hook.uIOhook.on('keydown', onGlobalKeyDown)
        hook.uIOhook.on('keyup', onGlobalKeyUp)
        hook.uIOhook.start()
        hookRunning = true
      } else if (hotkeys.size === 0 && hookRunning) {
        hook.uIOhook.stop()
        hook.uIOhook.removeListener('keydown', onGlobalKeyDown)
        hook.uIOhook.removeListener('keyup', onGlobalKeyUp)
        hookRunning = false
        pressed.clear()
      }
    } catch (err) {
      console.error('Genel kısayollar başlatılamadı:', err)
    }
  }
  ipcMain.handle('csn:set-hotkeys', async (event, list) => {
    if (!senderAllowed(event)) return false
    const next = new Map()
    if (Array.isArray(list)) {
      for (const item of list.slice(0, 200)) {
        const id = item && String(item.id)
        const combo = item && String(item.combo)
        if (id && id.length <= 64 && COMBO.test(combo)) next.set(combo, id)
      }
    }
    hotkeys = next
    syncHook()
    return !!hook
  })
  app.on('will-quit', () => {
    hotkeys = new Map()
    syncHook()
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
      title: 'Cousy',
      backgroundColor: '#0f1117',
      autoHideMenuBar: true,
      // Windows'un beyaz başlık çubuğu yerine sayfanın kendi (temaya uygun) çubuğu;
      // küçült / büyüt / kapat düğmeleri üstte kalır, rengi sayfadan ayarlanır
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#08080b', symbolColor: '#b0b1c0', height: TITLEBAR_HEIGHT },
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

    win.once('ready-to-show', () => {
      win.maximize()
      win.show()
    })
    // Gerçek uygulama hissi: tarayıcı gibi yakınlaştırılmasın (Ctrl+tekerlek / sıkıştırma)
    win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {})
    win.webContents.on('before-input-event', (event, input) => {
      if ((input.control || input.meta) && ['+', '-', '=', '0'].includes(input.key)) event.preventDefault()
    })
    win.webContents.on('zoom-changed', () => win.webContents.setZoomFactor(1))

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

    // Menü yok; Alt+Enter / F11 tam ekran aç/kapat,
    // F5 / Ctrl+R yenile, Ctrl+Shift+I geliştirici araçları
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return
      const key = input.key.toLowerCase()
      if ((input.alt && input.key === 'Enter') || input.key === 'F11') {
        win.setFullScreen(!win.isFullScreen())
        e.preventDefault()
      } else if (input.key === 'F5' || (input.control && key === 'r')) {
        win.webContents.reload()
        e.preventDefault()
      } else if (input.control && input.shift && key === 'i') {
        win.webContents.toggleDevTools()
        e.preventDefault()
      }
    })

    // Tam ekranda sayfa kendi başlık çubuğunu gizler
    const sendFullscreen = () => win && win.webContents.send('csn:fullscreen', win.isFullScreen())
    win.on('enter-full-screen', sendFullscreen)
    win.on('leave-full-screen', sendFullscreen)
    win.webContents.on('did-finish-load', sendFullscreen)

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
    // Windows'ta pencere başlık çubuğu beyaz yerine koyu olsun
    nativeTheme.themeSource = 'dark'
    const ses = session.defaultSession

    // İzinler yalnız Cousy sitesine
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
