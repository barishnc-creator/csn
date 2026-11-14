declare const __BUILD_ID__: string

export const BUILD_ID = __BUILD_ID__

/** Önbelleği atlatarak sayfayı yeniden yükle (GitHub Pages index.html'i ~10 dk önbellekler) */
export function hardReload() {
  const url = new URL(window.location.href)
  url.searchParams.set('v', Date.now().toString(36))
  window.location.replace(url.toString())
}

/** Sunucudaki derleme kimliği; farklıysa yeni sürüm yayında demektir */
export async function fetchLatestBuild(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { build?: string }
    return data.build ?? null
  } catch {
    return null
  }
}
