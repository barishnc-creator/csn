import { supabase } from './supabase'

const BUCKET = 'files'
const cache = new Map<string, { url: string; expires: number }>()
const pending = new Map<string, Promise<string | null>>()

/** Gizli kovadaki dosya için imzalı bağlantı (1 saat, önbellekli) */
export async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url
  const inflight = pending.get(path)
  if (inflight) return inflight
  const p = (async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
    pending.delete(path)
    if (error || !data) return null
    cache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 })
    return data.signedUrl
  })()
  pending.set(path, p)
  return p
}

export async function uploadFile(userId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'dosya'
  const path = `${userId}/${crypto.randomUUID()}/${safe}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
  })
  if (error) throw error
  return path
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
