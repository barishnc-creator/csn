// Tarayıcının "uygulamayı yükle" olayını yakala; menüden tetiklenir (PWA)
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: PromptEvent | null = null
const listeners = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as PromptEvent
  listeners.forEach((l) => l())
})
window.addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach((l) => l())
})

export const canInstall = () => !!deferred
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || !!window.csnDesktop
export function onInstallChange(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export async function promptInstall() {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  listeners.forEach((l) => l())
  return outcome === 'accepted'
}
