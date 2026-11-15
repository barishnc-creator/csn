// "Birlikte dinle": ses kanalındaki herkes aynı YouTube videosunu kendi tarayıcısında,
// resmi YouTube IFrame Player API ile çalar. Ses sunucudan akmaz; `music_state` tablosu
// yalnız kuyruğu ve konumu eşitler (zamanı sunucu tetikleyicisi yazar, bkz. 0012_music.sql).
import { useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface MusicItem {
  videoId: string
  title: string
  addedBy: string
}

export interface MusicRow {
  channel_id: string
  queue: MusicItem[]
  current: MusicItem | null
  started_at: string | null
  paused: boolean
  paused_at: number
  updated_by: string | null
  updated_at: string
  loop: LoopMode
  rev: number
  control_channel_id: string | null
}

export type LoopMode = 'off' | 'one' | 'all'
/** Müzik botu hesabı (bkz. 0016_music_bot.sql) */
export { MUSIC_BOT_ID } from '../lib/bots'

const VOLUME_KEY = 'csn.music.volume'
const DRIFT_LIMIT = 2 // sn
const MAX_QUEUE = 100

// ───────────── Bağlantı / başlık yardımcıları ─────────────

const ID_RE = /^[A-Za-z0-9_-]{11}$/

/** youtube.com/watch?v=, youtu.be/, shorts/, embed/, live/, music.youtube.com ya da çıplak 11 karakterlik id */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim().replace(/^<|>$/g, '')
  if (ID_RE.test(s)) return s
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '')
  let id: string | null = null
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)
      id = m?.[1] ?? null
    }
  }
  return id && ID_RE.test(id) ? id : null
}

export async function fetchTitle(videoId: string): Promise<string> {
  try {
    const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)
    const res = await fetch(`https://www.youtube.com/oembed?url=${target}&format=json`)
    if (res.ok) {
      const j = (await res.json()) as { title?: string }
      if (j.title) return j.title.slice(0, 200)
    }
  } catch {
    // yoksay
  }
  return 'YouTube videosu'
}

export const thumbOf = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`

// ───────────── Sunucu saati ─────────────

let clockOffset = 0 // sunucu - yerel (ms)
let clockKnown = false

async function probeClock() {
  const t0 = Date.now()
  const { data, error } = await supabase.rpc('server_now')
  const t1 = Date.now()
  if (error || typeof data !== 'string') return
  clockOffset = tsMs(data) - (t0 + t1) / 2
  clockKnown = true
}

const serverNow = () => Date.now() + clockOffset

/** Postgres / Realtime zaman damgasını ms'ye çevirir ("2026-11-15 10:00:00.123456+00" biçimi dahil) */
export function tsMs(s: string | null | undefined): number {
  if (!s) return 0
  const norm = s
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})$/, '$1:00')
  const t = Date.parse(norm)
  return Number.isFinite(t) ? t : 0
}

/** Satıra göre şu anki konum (sn) */
export function positionOf(row: MusicRow | null): number {
  if (!row?.current) return 0
  if (row.paused || !row.started_at) return row.paused_at ?? 0
  return Math.max(0, (serverNow() - tsMs(row.started_at)) / 1000)
}

// ───────────── Veritabanı işlemleri ─────────────

type Change = Partial<Pick<MusicRow, 'queue' | 'current' | 'paused' | 'paused_at' | 'loop' | 'rev' | 'control_channel_id'>>

async function fetchRow(channelId: string): Promise<MusicRow | null> {
  const { data, error } = await supabase.from('music_state').select('*').eq('channel_id', channelId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as MusicRow | null) ?? null
}

/**
 * Oku → değiştir → koşullu yaz (updated_at eşleşmezse yeniden dene).
 * Aynı anda iki kişi kuyruğa ekleyince biri kaybolmasın diye.
 */
async function mutate(channelId: string, fn: (row: MusicRow | null) => Change | null): Promise<MusicRow | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await fetchRow(channelId)
    const change = fn(row)
    if (!change) return row
    if (!row) {
      const { data, error } = await supabase
        .from('music_state')
        .insert({ channel_id: channelId, ...change })
        .select()
        .maybeSingle()
      if (!error) return publish(data as MusicRow)
      if (error.code === '23505') continue // biri az önce oluşturdu
      throw new Error(error.message)
    }
    const { data, error } = await supabase
      .from('music_state')
      .update(change)
      .eq('channel_id', channelId)
      .eq('updated_at', row.updated_at)
      .select()
    if (error) throw new Error(error.message)
    if (data && data.length) return publish(data[0] as MusicRow)
  }
  throw new Error('Müzik durumu güncellenemedi, tekrar dene')
}

// Kendi yazdığımızı Realtime'ı beklemeden göster
function publish(row: MusicRow | null) {
  if (row && engine.channelId === row.channel_id) engine.setRow(row)
  if (row) activity.put(row)
  return row
}

/** Sıradakine geç. auto: parça kendiliğinden bitti (tek parça tekrarında aynı parça baştan çalar) */
const next = (row: MusicRow | null, auto = false): Change => {
  const queue = row?.queue ?? []
  const loop = row?.loop ?? 'off'
  if (auto && loop === 'one' && row?.current) return { rev: (row.rev ?? 0) + 1, paused: false, paused_at: 0 }
  const rest = loop === 'all' && row?.current ? [...queue, row.current] : queue
  if (loop === 'all' && row?.current && rest.length === 1) return { rev: (row.rev ?? 0) + 1, paused: false, paused_at: 0 }
  return { current: rest[0] ?? null, queue: rest.slice(1), paused: false, paused_at: 0, rev: (row?.rev ?? 0) + 1 }
}

/** Çalmıyorsa hemen başlatır, çalıyorsa sıraya ekler. Döner: 'playing' | 'queued' */
export async function enqueue(channelId: string, item: MusicItem, controlChannelId?: string | null): Promise<'playing' | 'queued'> {
  let result: 'playing' | 'queued' = 'queued'
  const ctl = controlChannelId ? { control_channel_id: controlChannelId } : {}
  await mutate(channelId, (row) => {
    if (!row?.current) {
      result = 'playing'
      return { current: item, queue: row?.queue ?? [], paused: false, paused_at: 0, rev: (row?.rev ?? 0) + 1, ...ctl }
    }
    if (row.queue.length >= MAX_QUEUE) throw new Error('Sıra dolu (en fazla 100 parça)')
    result = 'queued'
    return { queue: [...row.queue, item], ...ctl }
  })
  return result
}

export async function setLoop(channelId: string, loop: LoopMode) {
  await mutate(channelId, (r) => (r && r.loop !== loop ? { loop } : null))
}

export const LOOP_ORDER: LoopMode[] = ['off', 'all', 'one']
export const LOOP_LABEL: Record<LoopMode, string> = { off: 'Tekrar kapalı', all: 'Sırayı tekrarla', one: 'Parçayı tekrarla' }

export async function skip(channelId: string): Promise<MusicItem | null> {
  const row = await mutate(channelId, (r) => (r?.current ? next(r) : null))
  return row?.current ?? null
}

export async function pause(channelId: string) {
  await mutate(channelId, (r) =>
    r?.current && !r.paused ? { paused: true, paused_at: Math.min(86399, Math.floor(positionOf(r))) } : null,
  )
}

export async function resume(channelId: string) {
  await mutate(channelId, (r) => (r?.current && r.paused ? { paused: false } : null))
}

export async function stop(channelId: string) {
  await mutate(channelId, (r) => (r && (r.current || r.queue.length) ? { current: null, queue: [], paused: false, paused_at: 0 } : null))
}

export async function seek(channelId: string, seconds: number) {
  const s = Math.max(0, Math.min(86399, Math.floor(seconds)))
  await mutate(channelId, (r) => (r?.current ? { paused_at: s } : null))
}

export async function removeFromQueue(channelId: string, index: number) {
  await mutate(channelId, (r) => (r && index >= 0 && index < r.queue.length ? { queue: r.queue.filter((_, i) => i !== index) } : null))
}

/** Parça bitince: yalnız satır hâlâ gördüğümüz haldeyse ilerlet (birden çok istemci aynı anda dener) */
async function advanceFrom(row: MusicRow) {
  const { data } = await supabase
    .from('music_state')
    .update(next(row, true))
    .eq('channel_id', row.channel_id)
    .eq('updated_at', row.updated_at)
    .select()
  if (data && data.length) publish(data[0] as MusicRow)
}

// ───────────── YouTube IFrame API ─────────────

interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void
  cueVideoById(o: { videoId: string; startSeconds?: number }): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(s: number, allowSeekAhead: boolean): void
  setVolume(v: number): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getVideoData?(): { video_id?: string }
  destroy(): void
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const PS = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }

let apiPromise: Promise<YTNamespace> | null = null
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiPromise ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (window.YT) resolve(window.YT)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => {
      apiPromise = null
      reject(new Error('YouTube oynatıcısı yüklenemedi'))
    }
    document.head.appendChild(s)
  })
  return apiPromise
}

// ───────────── Eşitleme motoru (tekil) ─────────────

export interface MusicSnapshot {
  channelId: string | null
  row: MusicRow | null
  /** Tarayıcı otomatik oynatmayı engelledi: kullanıcı dokunmalı */
  blocked: boolean
  volume: number
  localMuted: boolean
  duration: number
  error: string | null
}

function loadVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 40
  } catch {
    return 40
  }
}

class MusicEngine {
  channelId: string | null = null
  private row: MusicRow | null = null
  private sub: RealtimeChannel | null = null
  private player: YTPlayer | null = null
  private playerReady = false
  private playerLoading = false
  private host: HTMLDivElement | null = null
  private loadedId: string | null = null
  private blocked = false
  private volume = loadVolume()
  private localMuted = false
  private deafened = false
  private duration = 0
  private error: string | null = null
  private refs = 0
  private teardownTimer = 0
  private tickTimer = 0
  private playIssuedAt = 0
  private advancing: string | null = null
  private listeners = new Set<() => void>()
  private snap: MusicSnapshot = this.makeSnap()

  private makeSnap(): MusicSnapshot {
    return {
      channelId: this.channelId,
      row: this.row,
      blocked: this.blocked,
      volume: this.volume,
      localMuted: this.localMuted,
      duration: this.duration,
      error: this.error,
    }
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

  /** Ses kanalındayken çağrılır (birden çok bileşen çağırabilir, sayaçlı) */
  attach(channelId: string) {
    this.refs++
    window.clearTimeout(this.teardownTimer)
    if (this.channelId === channelId) return
    this.teardown()
    this.channelId = channelId
    this.emit()
    if (!clockKnown) probeClock().then(() => this.apply())
    fetchRow(channelId)
      .then((row) => {
        if (this.channelId === channelId && row && (!this.row || tsMs(row.updated_at) >= tsMs(this.row.updated_at))) this.setRow(row)
      })
      .catch(() => {})
    this.sub = supabase
      .channel(`music-${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'music_state', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          if (this.channelId !== channelId) return
          if (payload.eventType === 'DELETE') this.setRow(null)
          else this.setRow(payload.new as MusicRow)
        },
      )
      .subscribe()
    this.tickTimer = window.setInterval(() => this.tick(), 1000)
  }

  detach() {
    this.refs = Math.max(0, this.refs - 1)
    if (this.refs > 0) return
    // Kenar çubuğu yeniden çizilirken (sunucu ↔ DM) müzik kesilmesin
    window.clearTimeout(this.teardownTimer)
    this.teardownTimer = window.setTimeout(() => {
      if (this.refs === 0) {
        this.teardown()
        this.emit()
      }
    }, 1500)
  }

  private teardown() {
    window.clearInterval(this.tickTimer)
    if (this.sub) supabase.removeChannel(this.sub)
    this.sub = null
    try {
      this.player?.destroy()
    } catch {
      // yoksay
    }
    this.player = null
    this.playerReady = false
    this.playerLoading = false
    this.host?.remove()
    this.host = null
    this.loadedId = null
    this.channelId = null
    this.row = null
    this.blocked = false
    this.duration = 0
    this.error = null
  }

  setRow(row: MusicRow | null) {
    if (row && this.row && row.channel_id === this.row.channel_id && tsMs(row.updated_at) < tsMs(this.row.updated_at)) return
    const changedTrack = row?.current?.videoId !== this.row?.current?.videoId
    if (row && this.channelId === row.channel_id) activity.put(row)
    this.row = row ? { ...row, queue: Array.isArray(row.queue) ? row.queue : [] } : null
    if (changedTrack) {
      this.duration = 0
      this.error = null
    }
    this.apply()
    this.emit()
  }

  setDeafened(d: boolean) {
    if (this.deafened === d) return
    this.deafened = d
    this.applyVolume()
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(100, Math.round(v)))
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume))
    } catch {
      // yoksay
    }
    this.applyVolume()
    this.emit()
  }

  toggleLocalMute() {
    this.localMuted = !this.localMuted
    this.applyVolume()
    this.emit()
  }

  /** "▶ Müziği başlat": kullanıcı dokunuşuyla oynat */
  unblock() {
    this.blocked = false
    this.emit()
    if (!this.player) {
      this.ensurePlayer()
      return
    }
    this.applyVolume()
    this.playIssuedAt = Date.now()
    this.player.seekTo(positionOf(this.row), true)
    this.player.playVideo()
  }

  private applyVolume() {
    if (!this.player || !this.playerReady) return
    try {
      this.player.setVolume(this.localMuted || this.deafened ? 0 : this.volume)
    } catch {
      // yoksay
    }
  }

  private ensurePlayer() {
    if (this.player || this.playerLoading) return
    this.playerLoading = true
    const channelId = this.channelId
    loadApi()
      .then((YT) => {
        if (this.channelId !== channelId || this.player) return
        this.host = document.createElement('div')
        this.host.className = 'music-yt-host'
        this.host.setAttribute('aria-hidden', 'true')
        const inner = document.createElement('div')
        this.host.appendChild(inner)
        document.body.appendChild(this.host)
        this.player = new YT.Player(inner, {
          width: '1',
          height: '1',
          playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, fs: 0, rel: 0, origin: location.origin },
          events: {
            onReady: () => {
              this.playerReady = true
              this.playerLoading = false
              this.applyVolume()
              this.apply()
            },
            onStateChange: (e: { data: number }) => this.onState(e.data),
            onError: () => this.onPlayerError(),
            onAutoplayBlocked: () => {
              this.blocked = true
              this.emit()
            },
          },
        })
      })
      .catch((e: Error) => {
        this.playerLoading = false
        this.error = e.message
        this.emit()
      })
  }

  private onState(state: number) {
    if (!this.player) return
    if (state === PS.PLAYING) {
      if (this.blocked) {
        this.blocked = false
      }
      const d = this.player.getDuration()
      if (d > 0 && d !== this.duration) this.duration = d
      this.emit()
      // Başka biri duraklattıysa ya da konum kaydıysa düzelt
      this.apply()
    } else if (state === PS.ENDED) {
      this.endReached()
    }
  }

  private onPlayerError() {
    // Gömülemeyen / silinmiş video: herkes aynı hatayı alır, biri sıradakine geçirir
    this.error = 'Bu video oynatılamıyor, sıradakine geçiliyor'
    this.emit()
    this.endReached()
  }

  private endReached() {
    const row = this.row
    if (!row?.current || row.paused) return
    const key = `${row.current.videoId}@${row.updated_at}`
    if (this.advancing === key) return
    if (row.loop === 'one' && this.error) {
      // Oynatılamayan parça sonsuz döngüye girmesin
      this.advancing = key
      supabase.from('music_state').update({ ...next({ ...row, loop: 'off' }), loop: 'off' }).eq('channel_id', row.channel_id).eq('updated_at', row.updated_at).then(() => {})
      return
    }
    this.advancing = key
    advanceFrom(row).catch(() => {})
  }

  /** Paylaşılan durumu yerel oynatıcıya uygula */
  private apply() {
    const row = this.row
    if (!row?.current) {
      if (this.player && this.playerReady && this.loadedId) {
        try {
          this.player.stopVideo()
        } catch {
          // yoksay
        }
      }
      this.loadedId = null
      this.blocked = false
      return
    }
    if (!this.player || !this.playerReady) {
      this.ensurePlayer()
      return
    }
    const pos = positionOf(row)
    const p = this.player
    try {
      const key = `${row.current.videoId}#${row.rev ?? 0}`
      if (this.loadedId !== key) {
        this.loadedId = key
        if (row.paused) p.cueVideoById({ videoId: row.current.videoId, startSeconds: pos })
        else {
          this.playIssuedAt = Date.now()
          p.loadVideoById({ videoId: row.current.videoId, startSeconds: pos })
        }
        return
      }
      const state = p.getPlayerState()
      if (row.paused) {
        if (state === PS.PLAYING || state === PS.BUFFERING) p.pauseVideo()
        if (Math.abs(p.getCurrentTime() - pos) > DRIFT_LIMIT) p.seekTo(pos, true)
        return
      }
      if (state === PS.ENDED) return
      if (this.duration > 0 && pos >= this.duration) return
      if (Math.abs(p.getCurrentTime() - pos) > DRIFT_LIMIT) p.seekTo(pos, true)
      if (state !== PS.PLAYING && state !== PS.BUFFERING && !this.blocked) {
        this.playIssuedAt = Date.now()
        p.playVideo()
      }
    } catch {
      // oynatıcı henüz hazır değil
    }
  }

  private tick() {
    const row = this.row
    if (!row?.current) return
    const p = this.player
    if (p && this.playerReady && !row.paused) {
      let state = -1
      try {
        state = p.getPlayerState()
        const d = p.getDuration()
        if (d > 0 && Math.abs(d - this.duration) > 0.5) {
          this.duration = d
          this.emit()
        }
      } catch {
        // yoksay
      }
      // Oynat dedik ama 2,5 sn'dir başlamadı → tarayıcı engelledi say
      if (
        !this.blocked &&
        this.playIssuedAt &&
        Date.now() - this.playIssuedAt > 2500 &&
        state !== PS.PLAYING &&
        state !== PS.BUFFERING &&
        state !== PS.ENDED
      ) {
        this.blocked = true
        this.emit()
      }
      if (state === PS.PLAYING) this.playIssuedAt = 0
    }
    // Süre doldu (oynatıcısı engelli ya da sekmesi uykuda olan istemciler için de)
    if (!row.paused && this.duration > 0 && positionOf(row) > this.duration + 2) this.endReached()
    else this.apply()
  }
}

const engine = new MusicEngine()
export const music = engine

export function useMusic(): MusicSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
}

// ───────────── Tüm kanalların müzik durumu (bot görünümü, konsol) ─────────────

class MusicActivity {
  private rows: Record<string, MusicRow> = {}
  private started = false
  private listeners = new Set<() => void>()
  private snap: Record<string, MusicRow> = {}
  put(row: MusicRow) {
    const old = this.rows[row.channel_id]
    if (old && tsMs(old.updated_at) > tsMs(row.updated_at)) return
    this.rows = { ...this.rows, [row.channel_id]: { ...row, queue: Array.isArray(row.queue) ? row.queue : [] } }
    this.emit()
  }
  private emit() {
    this.snap = this.rows
    this.listeners.forEach((l) => l())
  }
  private start() {
    if (this.started) return
    this.started = true
    supabase
      .from('music_state')
      .select('*')
      .then(({ data }) => {
        for (const r of (data ?? []) as MusicRow[]) this.put(r)
      })
    supabase
      .channel('music-activity')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_state' }, (p) => {
        if (p.eventType === 'DELETE') {
          const id = (p.old as MusicRow).channel_id
          const { [id]: _gone, ...rest } = this.rows
          void _gone
          this.rows = rest
          this.emit()
        } else this.put(p.new as MusicRow)
      })
      .subscribe()
  }
  subscribe = (l: () => void) => {
    this.start()
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }
  getSnapshot = () => this.snap
}

const activity = new MusicActivity()

/** Kanal id → müzik durumu (yalnız görülebilen kanallar) */
export function useMusicRows(): Record<string, MusicRow> {
  return useSyncExternalStore(activity.subscribe, activity.getSnapshot, activity.getSnapshot)
}
