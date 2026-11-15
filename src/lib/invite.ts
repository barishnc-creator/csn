// Davet bağlantısı: https://.../csn/?davet=KOD → kayıt ekranı kod dolu açılır
const KEY = 'csn.invite'

/** Adresteki ?davet= kodunu yakala, sakla ve adresten temizle */
export function captureInviteFromUrl() {
  try {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('davet')
    if (code) {
      localStorage.setItem(KEY, code.trim().toLowerCase())
      url.searchParams.delete('davet')
      window.history.replaceState(null, '', url.toString())
    }
  } catch {
    // yoksay
  }
}

export function pendingInvite(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // yoksay
  }
}

export function inviteLink(code: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}?davet=${encodeURIComponent(code)}`
}
