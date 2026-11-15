// Soundpad: yöneticilerin yüklediği kısa sesler. Biri çalınca aynı ses kanalındaki herkese
// Supabase Realtime yayını (soundpad-<kanal id>) ile sinyal gider; her istemci sesi kendisi çalar.
import { useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { signedUrl, uploadFile } from '../lib/files'

export interface SoundItem {
  id: string
  name: string
  emoji: string
  path: string
  created_by: string | null
  created_at: string
}

const VOLUME_KEY = 'csn.soundpad.volume'
export const SOUND_MAX_BYTES = 1024 * 1024
export const SOUND_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave']
const SOUND_EXT = /\.(mp3|ogg|oga|wav)$/i
const RATE_MS = 1500 // kişi başı en sık
const MAX_LEN_MS = 10_000 // ses en fazla 10 sn
const MAX_CONCURRENT = 4

export interface SoundpadSnapshot {
  channelId: string | null
  sounds: SoundItem[]
  volume: number
  /** Son çalınan (id → çalan kişi), kısa vurgu için */
  lastPlayed: { id: string; by: string; at: number } | null
}

function loadVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    const v = Number(raw)
    return raw !== null && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 60
  } catch {
    return 60
  }
}

class SoundpadEngine {
  private channelId: string | null = null
  private sounds: SoundItem[] = []
  private soundsLoaded = false
  private roomSub: RealtimeChannel | null = null
  private volume = loadVolume()
  private deafened = false
  private lastPlayed: SoundpadSnapshot['lastPlayed'] = null
  private lastBy = new Map<string, number>()
  private lastSent = 0
  private playing = new Set<HTMLAudioElement>()
  private refs = 0
  private teardownTimer = 0
  private listeners = new Set<() => void>()
  private snap: SoundpadSnapshot = this.makeSnap()

  private makeSnap(): SoundpadSnapshot {
    return { channelId: this.channelId, sounds: this.sounds, volume: this.volume, lastPlayed: this.lastPlayed }
  }
  private emit() {
    this.snap = this.makeSnap()
    this.listeners.forEach((l) => l())
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }
  getSnapshot = () => this.snap

  attach(channelId: string) {
    this.refs++
    window.clearTimeout(this.teardownTimer)
    this.ensureSounds()
    if (this.channelId === channelId) return
    this.leaveRoom()
    this.channelId = channelId
    this.roomSub = supabase
      .channel(`soundpad-${channelId}`, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'play' }, ({ payload }) => {
        const id = payload?.id as string | undefined
        const by = payload?.by as string | undefined
        if (typeof id === 'string' && typeof by === 'string') this.receive(id, by)
      })
      .subscribe()
    this.emit()
  }

  detach() {
    this.refs = Math.max(0, this.refs - 1)
    if (this.refs > 0) return
    window.clearTimeout(this.teardownTimer)
    this.teardownTimer = window.setTimeout(() => {
      if (this.refs === 0) {
        this.leaveRoom()
        this.emit()
      }
    }, 1500)
  }

  private leaveRoom() {
    if (this.roomSub) supabase.removeChannel(this.roomSub)
    this.roomSub = null
    this.channelId = null
    this.playing.forEach((a) => a.pause())
    this.playing.clear()
  }

  private ensureSounds() {
    if (this.soundsLoaded) return
    this.soundsLoaded = true
    this.reload()
    supabase
      .channel('sounds-list', { config: { private: true } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sounds' }, () => this.reload())
      .subscribe()
  }

  async reload() {
    const { data, error } = await supabase.from('sounds').select('*').order('created_at')
    if (error) return
    this.sounds = (data as SoundItem[]) ?? []
    this.emit()
  }

  setDeafened(d: boolean) {
    this.deafened = d
    if (d) {
      this.playing.forEach((a) => a.pause())
      this.playing.clear()
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(100, Math.round(v)))
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume))
    } catch {
      // yoksay
    }
    this.playing.forEach((a) => (a.volume = this.volume / 100))
    this.emit()
  }

  /** Kendi tıklamamız: sınır uygunsa herkese yayınla ve yerelde çal. Döner: hata mesajı ya da null */
  send(id: string, userId: string): string | null {
    if (!this.channelId || !this.roomSub) return 'Önce bir ses kanalına katıl'
    const now = Date.now()
    if (now - this.lastSent < RATE_MS) return 'Biraz yavaş, 1,5 saniyede bir ses'
    this.lastSent = now
    this.roomSub.send({ type: 'broadcast', event: 'play', payload: { id, by: userId } })
    this.lastBy.set(userId, now)
    this.play(id, userId)
    return null
  }

  private receive(id: string, by: string) {
    const now = Date.now()
    // Gönderen kuralı atlatsa da alıcıda kişi başı sınır
    if (now - (this.lastBy.get(by) ?? 0) < RATE_MS - 100) return
    this.lastBy.set(by, now)
    this.play(id, by)
  }

  private async play(id: string, by: string) {
    const sound = this.sounds.find((s) => s.id === id)
    if (!sound) return
    this.lastPlayed = { id, by, at: Date.now() }
    this.emit()
    if (this.deafened || this.volume === 0 || this.playing.size >= MAX_CONCURRENT) return
    const url = await signedUrl(sound.path)
    if (!url) return
    const audio = new Audio(url)
    audio.volume = this.volume / 100
    const done = () => {
      window.clearTimeout(timer)
      audio.pause()
      this.playing.delete(audio)
    }
    const timer = window.setTimeout(done, MAX_LEN_MS)
    audio.addEventListener('ended', done)
    audio.addEventListener('error', done)
    this.playing.add(audio)
    audio.play().catch(done)
  }
}

const engine = new SoundpadEngine()
export const soundpad = engine

export function useSoundpad(): SoundpadSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
}

// ───────────── Yönetici işlemleri ─────────────

export function validateSoundFile(file: File): string | null {
  if (file.size > SOUND_MAX_BYTES) return 'Dosya en fazla 1 MB olabilir'
  if (!SOUND_TYPES.includes(file.type) && !SOUND_EXT.test(file.name)) return 'Yalnız mp3, ogg ya da wav'
  return null
}

export async function addSound(userId: string, file: File, name: string, emoji: string) {
  const err = validateSoundFile(file)
  if (err) throw new Error(err)
  const clean = name.trim().slice(0, 32)
  if (!clean) throw new Error('Bir ad yaz')
  const path = await uploadFile(userId, file)
  const { error } = await supabase
    .from('sounds')
    .insert({ name: clean, emoji: Array.from(emoji.trim()).slice(0, 8).join('') || '🔊', path, created_by: userId })
  if (error) {
    await supabase.storage.from('files').remove([path]).catch(() => {})
    throw new Error(error.message)
  }
  await engine.reload()
}

export async function deleteSound(sound: SoundItem) {
  const { error } = await supabase.from('sounds').delete().eq('id', sound.id)
  if (error) throw new Error(error.message)
  // Dosyayı yalnız yükleyen silebilir (depolama kuralı); başkasınınsa kovada kalır
  await supabase.storage.from('files').remove([sound.path]).catch(() => {})
  await engine.reload()
}
