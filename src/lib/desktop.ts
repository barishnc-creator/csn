// CSN masaüstü uygulaması (Electron) köprüsü.
// Masaüstünde preload betiği `window.csnDesktop` nesnesini tanımlar; tarayıcıda yoktur.

export interface DesktopSource {
  id: string
  name: string
  thumbnail: string // data URL
  appIcon?: string // data URL
  kind: 'screen' | 'window'
}

export interface DesktopBridge {
  isDesktop: true
  getSources(): Promise<DesktopSource[]>
  selectSource(id: string, withAudio: boolean): Promise<void>
  /** 0.1.3+: sayfanın çizdiği başlık çubuğu */
  titleBarHeight?: number
  setTitleBarColors?(color: string, symbolColor: string): Promise<void>
  onFullscreen?(cb: (on: boolean) => void): () => void
  /** 0.1.4+: soundpad kısayolları CSN arka plandayken de çalışır */
  setHotkeys?(list: { id: string; combo: string }[]): Promise<boolean>
  onHotkey?(cb: (id: string) => void): () => void
}

declare global {
  interface Window {
    csnDesktop?: DesktopBridge
  }
}

export function getDesktop(): DesktopBridge | null {
  if (typeof window === 'undefined') return null
  const d = window.csnDesktop
  return d && d.isDesktop === true && typeof d.getSources === 'function' ? d : null
}

export const isDesktop = () => getDesktop() !== null

function cssColorToHex(expr: string) {
  const el = document.createElement('div')
  el.style.cssText = `position:absolute;visibility:hidden;color:${expr}`
  document.body.appendChild(el)
  const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g)
  el.remove()
  if (!m || m.length < 3) return null
  return '#' + m.slice(0, 3).map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('')
}

/**
 * Masaüstünde Windows'un beyaz başlık çubuğu yerine temaya uygun, sürüklenebilir
 * bir çubuk çizer. Pencere düğmelerinin rengi temayla birlikte değişir.
 */
export function initDesktopTitleBar() {
  const d = getDesktop()
  if (!d || typeof d.setTitleBarColors !== 'function') return
  const root = document.documentElement
  root.classList.add('desktop-frame')
  root.style.setProperty('--titlebar-h', `${d.titleBarHeight ?? 34}px`)

  const bar = document.createElement('div')
  bar.className = 'desk-titlebar'
  bar.innerHTML = '<span class="desk-titlebar-logo">C</span><span class="desk-titlebar-name">CSN</span>'
  document.body.prepend(bar)

  let last = ''
  const sync = () => {
    const bg = cssColorToHex('var(--bg-rail)')
    const fg = cssColorToHex('var(--text-2)')
    if (!bg || !fg || bg + fg === last) return
    last = bg + fg
    d.setTitleBarColors!(bg, fg).catch(() => {})
  }
  sync()
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] })
  d.onFullscreen?.((on) => root.classList.toggle('desktop-fullscreen', on))
}
