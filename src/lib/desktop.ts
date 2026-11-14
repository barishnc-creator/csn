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
