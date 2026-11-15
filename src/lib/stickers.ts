// Revize #15: sunucu stickerları (yöneticiler ekler, herkes gönderir).
// Mesaj içeriği: [sticker:<uuid>]
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { signedUrl } from './files'

export interface Sticker {
  id: string
  name: string
  path: string
  created_by: string | null
  created_at: string
}

export const STICKER_MAX_BYTES = 512 * 1024
export const STICKER_TYPES = ['image/png', 'image/webp', 'image/gif', 'image/jpeg']
const RE = /^\[sticker:([0-9a-f-]{36})\]$/i

export const stickerMessage = (id: string) => `[sticker:${id}]`
export function stickerIdOf(content: string): string | null {
  return RE.exec(content.trim())?.[1] ?? null
}

let list: Sticker[] = []
let loaded = false
let started = false
const urls = new Map<string, string>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}

async function resolveUrls(items: Sticker[]) {
  await Promise.all(
    items.map(async (s) => {
      const u = await signedUrl(s.path)
      if (u) urls.set(s.id, u)
    }),
  )
  emit()
}

async function load() {
  const { data } = await supabase.from('stickers').select('*').order('created_at')
  list = (data ?? []) as Sticker[]
  loaded = true
  emit()
  resolveUrls(list)
}

function start() {
  if (started) return
  started = true
  load()
  supabase
    .channel('stickers-list', { config: { private: true } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stickers' }, (p) => {
      if (p.eventType === 'DELETE') list = list.filter((s) => s.id !== (p.old as Sticker).id)
      else if (p.eventType === 'INSERT') {
        const s = p.new as Sticker
        if (!list.some((x) => x.id === s.id)) list = [...list, s]
        resolveUrls([s])
      } else list = list.map((s) => (s.id === (p.new as Sticker).id ? (p.new as Sticker) : s))
      emit()
    })
    .subscribe()
  // İmzalı bağlantılar 1 saatte biter; 50 dakikada bir tazele
  setInterval(() => resolveUrls(list), 50 * 60 * 1000)
}

export function useStickers() {
  useEffect(start, [])
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  return { stickers: list, loaded, urlOf: (id: string) => urls.get(id) ?? null, byId: (id: string) => list.find((s) => s.id === id) }
}

export async function addSticker(userId: string, file: File, name: string) {
  if (!STICKER_TYPES.includes(file.type)) throw new Error('Yalnız PNG, WEBP, GIF ya da JPG yüklenebilir.')
  if (file.size > STICKER_MAX_BYTES) throw new Error('Sticker en fazla 512 KB olabilir.')
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${userId}/stickers/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from('files').upload(path, file, { contentType: file.type })
  if (up.error) throw up.error
  const { error } = await supabase.from('stickers').insert({ name: name.trim().slice(0, 32) || 'sticker', path })
  if (error) {
    await supabase.storage.from('files').remove([path])
    throw error
  }
}

export async function deleteSticker(s: Sticker) {
  const { error } = await supabase.from('stickers').delete().eq('id', s.id)
  if (error) throw error
  // Dosyayı yalnız yükleyen silebilir (depo kuralı); başkasınınsa kayıt silinir, dosya kalır
  await supabase.storage.from('files').remove([s.path])
}
